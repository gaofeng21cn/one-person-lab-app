import { spawnSync } from 'node:child_process';
import type { ReleaseNotesEvidence } from '../release-notes.ts';
import { buildAiReleaseNotesPrompt, buildAiReleaseNotesRepairPrompt } from './evidence-shaping.ts';
import { completeAiReleaseNotesWithEvidence, extractMarkdown } from './markdown-normalization.ts';
import { validateAiReleaseNotes } from './validation.ts';

export type AiReleaseNotesOptions = {
  providerCommand?: string;
  model?: string;
};

type ReleaseNotesProvider = 'auto' | 'openai_compatible' | 'codex';

const defaultOpenAICompatibleModel = 'auto';
const defaultProviderTimeoutSeconds = 75;
const defaultProviderTransportAttempts = 3;
const defaultProviderRetryDelayMs = 2_000;

export type ReleaseNotesProviderFailureType =
  | 'provider_transport_timeout'
  | 'provider_transport_error'
  | 'provider_rate_limited'
  | 'provider_http_5xx'
  | 'provider_response_invalid';

export class ReleaseNotesProviderFailure extends Error {
  readonly failureType: ReleaseNotesProviderFailureType;
  readonly attempts: number;
  readonly transportRetryable: boolean;

  constructor(
    failureType: ReleaseNotesProviderFailureType,
    attempts: number,
    transportRetryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'ReleaseNotesProviderFailure';
    this.failureType = failureType;
    this.attempts = attempts;
    this.transportRetryable = transportRetryable;
  }
}

export const aiReleaseNotesProvenanceMarker = '<!-- OPL_RELEASE_NOTES_GENERATOR:online-ai -->';

export function markAiGeneratedReleaseNotes(markdown: string) {
  return markdown.includes(aiReleaseNotesProvenanceMarker)
    ? markdown
    : `${markdown.trimEnd()}\n\n${aiReleaseNotesProvenanceMarker}\n`;
}

function shellCommandArgs(command: string) {
  return ['-lc', command];
}
function defaultCodexCommand(model?: string) {
  const modelArgs = model ? ` --model ${JSON.stringify(model)}` : '';
  return `tmp="$(mktemp)"; codex exec --sandbox read-only --output-last-message "$tmp"${modelArgs} - >/dev/null && cat "$tmp"; status=$?; rm -f "$tmp"; exit "$status"`;
}

function selectedProvider(): ReleaseNotesProvider {
  const value = (process.env.OPL_RELEASE_NOTES_PROVIDER || '').trim().toLowerCase();
  if (!value && process.env.OPL_RELEASE_NOTES_AI_COMMAND) {
    return 'codex';
  }
  if (!value) {
    return 'auto';
  }
  if (!['auto', 'openai_compatible', 'codex'].includes(value)) {
    throw new Error(`Unsupported OPL_RELEASE_NOTES_PROVIDER: ${process.env.OPL_RELEASE_NOTES_PROVIDER}`);
  }
  return value as ReleaseNotesProvider;
}


function listFromEnv(value: string | undefined, fallback: string[]) {
  const items = (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function providerTimeoutSeconds() {
  const value = Number.parseInt(process.env.OPL_RELEASE_NOTES_AI_TIMEOUT_SECONDS || '', 10);
  return Number.isFinite(value) && value > 0 ? value : defaultProviderTimeoutSeconds;
}

export function providerTransportAttempts() {
  const value = Number.parseInt(process.env.OPL_RELEASE_NOTES_AI_TRANSPORT_ATTEMPTS || '', 10);
  return Number.isFinite(value) && value >= 1 && value <= defaultProviderTransportAttempts
    ? value
    : defaultProviderTransportAttempts;
}

function providerRetryDelayMs() {
  const value = Number.parseInt(process.env.OPL_RELEASE_NOTES_AI_RETRY_DELAY_MS || '', 10);
  return Number.isFinite(value) && value >= 0 && value <= 10_000 ? value : defaultProviderRetryDelayMs;
}

function waitForRetry(delayMs: number) {
  if (delayMs <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
}

function redactSecret(value: string, secret: string) {
  return secret ? value.split(secret).join('[redacted]') : value;
}

function redactProviderOutput(value: string, token: string) {
  return redactSecret(value, token).slice(0, 1200);
}

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return '';
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function structuredTextParts(value: unknown, acceptedTypes: Set<string>) {
  if (!Array.isArray(value)) return null;
  const text = value
    .map((entry) => {
      const part = record(entry);
      return part && typeof part.type === 'string' && acceptedTypes.has(part.type)
        ? nonEmptyText(part.text)
        : null;
    })
    .filter((entry): entry is string => entry !== null)
    .join('\n')
    .trim();
  return text || null;
}

export function extractOpenAICompatibleText(payload: unknown) {
  const response = record(payload);
  if (!response) return null;

  const choices = Array.isArray(response.choices) ? response.choices : [];
  const firstChoice = record(choices[0]);
  const message = record(firstChoice?.message);
  const chatContent = nonEmptyText(message?.content)
    ?? structuredTextParts(message?.content, new Set(['text', 'output_text']));
  if (chatContent) return chatContent;

  const outputText = nonEmptyText(response.output_text);
  if (outputText) return outputText;

  const output = Array.isArray(response.output) ? response.output : [];
  const responsesText = output
    .map((entry) => {
      const item = record(entry);
      return item?.type === 'message'
        ? structuredTextParts(item.content, new Set(['output_text']))
        : null;
    })
    .filter((entry): entry is string => entry !== null)
    .join('\n')
    .trim();
  return responsesText || null;
}

function providerResponseShape(payload: unknown) {
  const response = record(payload);
  const choices = response && Array.isArray(response.choices) ? response.choices : null;
  const firstChoice = record(choices?.[0]);
  const message = record(firstChoice?.message);
  return JSON.stringify({
    top_level_keys: response ? Object.keys(response).sort() : [],
    choices_type: Array.isArray(response?.choices) ? 'array' : typeof response?.choices,
    message_content_type: Array.isArray(message?.content) ? 'array' : typeof message?.content,
    output_text_type: typeof response?.output_text,
    output_type: Array.isArray(response?.output) ? 'array' : typeof response?.output,
  });
}

function parseChatCompletionsContent(stdout: string, providerLabel: string, token: string) {
  let payload: unknown;
  try {
    payload = JSON.parse(stdout);
  } catch {
    throw new ReleaseNotesProviderFailure(
      'provider_response_invalid',
      1,
      false,
      `${providerLabel} returned invalid JSON: ${redactProviderOutput(stdout, token).slice(0, 400)}`,
    );
  }
  const content = extractOpenAICompatibleText(payload);
  if (!content) {
    throw new ReleaseNotesProviderFailure(
      'provider_response_invalid',
      1,
      false,
      `${providerLabel} response did not include supported Chat Completions or Responses text. shape=${providerResponseShape(payload)}`,
    );
  }
  return content;
}

function buildChatCompletionsRequest(model: string, prompt: string) {
  const reasoningEffort = process.env.OPL_RELEASE_NOTES_AI_REASONING_EFFORT?.trim();
  if (reasoningEffort && !['low', 'medium', 'high'].includes(reasoningEffort)) {
    throw new Error('Invalid OPL_RELEASE_NOTES_AI_REASONING_EFFORT');
  }
  return JSON.stringify({
    model,
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });
}

function splitCurlResponse(stdout: string) {
  const marker = /\n__OPL_HTTP_STATUS__:(\d{3})\s*$/.exec(stdout);
  return {
    body: marker ? stdout.slice(0, marker.index) : stdout,
    httpStatus: marker ? Number.parseInt(marker[1]!, 10) : null,
  };
}

function classifyCurlFailure(
  result: ReturnType<typeof spawnSync>,
  httpStatus: number | null,
): { type: ReleaseNotesProviderFailureType; retryable: boolean } {
  if (result.error && ['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes((result.error as NodeJS.ErrnoException).code ?? '')) {
    return { type: 'provider_transport_timeout', retryable: true };
  }
  if (result.status === 28 || /timed out/i.test(String(result.stderr || result.error?.message || ''))) {
    return { type: 'provider_transport_timeout', retryable: true };
  }
  if (httpStatus === 429) return { type: 'provider_rate_limited', retryable: true };
  if (httpStatus !== null && httpStatus >= 500) return { type: 'provider_http_5xx', retryable: true };
  if ([5, 6, 7, 18, 35, 52, 55, 56, 92].includes(result.status ?? -1)) {
    return { type: 'provider_transport_error', retryable: true };
  }
  return { type: 'provider_transport_error', retryable: false };
}

function requestChatCompletions(endpoint: string, token: string, model: string, prompt: string, providerLabel: string) {
  const request = buildChatCompletionsRequest(model, prompt);
  const timeoutSeconds = providerTimeoutSeconds();
  const maxAttempts = providerTransportAttempts();
  let lastFailure: ReleaseNotesProviderFailure | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSync('curl', [
      '-fsSL',
      '--connect-timeout',
      '10',
      '--max-time',
      String(timeoutSeconds),
      '--write-out',
      '\n__OPL_HTTP_STATUS__:%{http_code}',
      endpoint,
      '-H',
      'Accept: application/json',
      '-H',
      'Content-Type: application/json',
      '-H',
      `Authorization: Bearer ${token}`,
      '-d',
      request,
    ], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: process.env,
      timeout: (timeoutSeconds + 5) * 1000,
    });
    const response = splitCurlResponse(result.stdout || '');
    if (!result.error && result.status === 0) {
      try {
        return extractMarkdown(parseChatCompletionsContent(response.body, providerLabel, token));
      } catch (error) {
        if (error instanceof ReleaseNotesProviderFailure) {
          throw new ReleaseNotesProviderFailure(error.failureType, attempt, false, error.message);
        }
        throw error;
      }
    }
    const classification = classifyCurlFailure(result, response.httpStatus);
    const detail = result.stderr || response.body || result.error?.message || `exit ${result.status}`;
    lastFailure = new ReleaseNotesProviderFailure(
      classification.type,
      attempt,
      classification.retryable,
      `${providerLabel} failed after transport attempt ${attempt}/${maxAttempts}: ${redactProviderOutput(detail, token)}`,
    );
    if (!classification.retryable || attempt === maxAttempts) throw lastFailure;
    waitForRetry(providerRetryDelayMs());
  }
  throw lastFailure ?? new ReleaseNotesProviderFailure(
    'provider_transport_error',
    maxAttempts,
    false,
    `${providerLabel} failed without a transport observation.`,
  );
}

function validateOrRepairGeneratedMarkdown(
  initialPrompt: string,
  evidence: ReleaseNotesEvidence,
  requestMarkdown: (prompt: string) => string,
) {
  let markdown = completeAiReleaseNotesWithEvidence(requestMarkdown(initialPrompt), evidence);
  try {
    validateAiReleaseNotes(markdown, evidence);
    return markdown;
  } catch (error) {
    const repairPrompt = buildAiReleaseNotesRepairPrompt(evidence, markdown, error);
    markdown = completeAiReleaseNotesWithEvidence(requestMarkdown(repairPrompt), evidence);
    validateAiReleaseNotes(markdown, evidence);
    return markdown;
  }
}

function openAICompatibleEndpoint(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }
  if (/\/v1$/i.test(trimmed)) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

function openAICompatibleConfig() {
  const baseUrl = envValue(
    'OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_BASE_URL',
    'OPL_RELEASE_NOTES_CODEX_BASE_URL',
  );
  const token = envValue(
    'OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_API_KEY',
    'OPL_RELEASE_NOTES_CODEX_API_KEY',
  );
  const modelList = envValue(
    'OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_MODELS',
    'OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_MODEL',
    'OPL_RELEASE_NOTES_MODEL',
  );
  return {
    endpoint: openAICompatibleEndpoint(baseUrl),
    token,
    models: listFromEnv(modelList, [defaultOpenAICompatibleModel]),
  };
}

function openAICompatibleConfigured() {
  const config = openAICompatibleConfig();
  return Boolean(config.endpoint && config.token);
}

function runOpenAICompatibleModels<T>(
  models: string[],
  failureMessage: string,
  requestModel: (model: string, providerLabel: string) => T,
) {
  const failures: Array<{ model: string; error: unknown }> = [];
  for (const model of models) {
    const providerLabel = `OpenAI-compatible ${model}`;
    try {
      return requestModel(model, providerLabel);
    } catch (error) {
      failures.push({ model, error });
    }
  }
  const message = `${failureMessage} for ${models.join(', ')}: ${failures
    .map(({ model, error }) => `${model}: ${error instanceof Error ? error.message : String(error)}`)
    .join(' | ')}`;
  const providerFailures = failures
    .map(({ error }) => error)
    .filter((error): error is ReleaseNotesProviderFailure => error instanceof ReleaseNotesProviderFailure);
  if (providerFailures.length === failures.length && providerFailures.length > 0) {
    const last = providerFailures.at(-1)!;
    throw new ReleaseNotesProviderFailure(
      last.failureType,
      providerFailures.reduce((sum, error) => sum + error.attempts, 0),
      last.transportRetryable,
      `RELEASE_NOTES_PROVIDER_FAILURE type=${last.failureType} ${message}`,
    );
  }
  throw new Error(message);
}

function runOpenAICompatibleProvider(prompt: string, evidence: ReleaseNotesEvidence) {
  const { endpoint, token, models } = openAICompatibleConfig();
  if (!endpoint || !token) {
    throw new Error('Missing OpenAI-compatible release-note provider config. Set OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_BASE_URL and OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_API_KEY, or the existing OPL_RELEASE_NOTES_CODEX_BASE_URL and OPL_RELEASE_NOTES_CODEX_API_KEY route.');
  }
  return runOpenAICompatibleModels(models, 'OpenAI-compatible provider failed', (model, providerLabel) => (
    validateOrRepairGeneratedMarkdown(prompt, evidence, (activePrompt) => (
      requestChatCompletions(endpoint, token, model, activePrompt, providerLabel)
    ))
  ));
}

export function runOpenAICompatibleProbe() {
  const { endpoint, token, models } = openAICompatibleConfig();
  if (!endpoint || !token) {
    throw new Error('Missing OpenAI-compatible release-note provider config. Set OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_BASE_URL and OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_API_KEY, or the existing OPL_RELEASE_NOTES_CODEX_BASE_URL and OPL_RELEASE_NOTES_CODEX_API_KEY route.');
  }
  runOpenAICompatibleModels(models, 'OpenAI-compatible provider probe failed', (model, providerLabel) => {
    const content = requestChatCompletions(
      endpoint,
      token,
      model,
      'Return exactly: OPL_RELEASE_NOTES_PROVIDER_OK',
      providerLabel,
    );
    if (!/OPL_RELEASE_NOTES_PROVIDER_OK/.test(content)) {
      throw new Error(`${providerLabel} probe returned unexpected content.`);
    }
    console.log(JSON.stringify({
      status: 'ok',
      provider: 'openai_compatible',
      model,
      endpoint: endpoint.replace(/^https?:\/\//, '').replace(/\/v1\/chat\/completions$/, ''),
    }, null, 2));
  });
}

function runCodexProvider(prompt: string, evidence: ReleaseNotesEvidence, command: string) {
  const result = spawnSync('/bin/bash', shellCommandArgs(command), {
    encoding: 'utf8',
    input: prompt,
    stdio: 'pipe',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Codex release notes provider failed: ${result.stderr || result.stdout || `exit ${result.status}`}`);
  }
  const markdown = completeAiReleaseNotesWithEvidence(extractMarkdown(result.stdout), evidence);
  validateAiReleaseNotes(markdown, evidence);
  return markdown;
}


export function buildAiReleaseNotesDocument(evidence: ReleaseNotesEvidence, options: AiReleaseNotesOptions = {}) {
  const prompt = buildAiReleaseNotesPrompt(evidence);
  const command = options.providerCommand || process.env.OPL_RELEASE_NOTES_AI_COMMAND || defaultCodexCommand(options.model || process.env.OPL_RELEASE_NOTES_MODEL);
  const provider = selectedProvider();
  if (provider === 'openai_compatible') {
    return markAiGeneratedReleaseNotes(runOpenAICompatibleProvider(prompt, evidence));
  }
  if (provider === 'codex') {
    return markAiGeneratedReleaseNotes(runCodexProvider(prompt, evidence, command));
  }
  if (openAICompatibleConfigured()) {
    return markAiGeneratedReleaseNotes(runOpenAICompatibleProvider(prompt, evidence));
  }
  throw new Error('No online OpenAI-compatible release-note provider is configured. Set OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_BASE_URL and OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_API_KEY, or the existing OPL_RELEASE_NOTES_CODEX_BASE_URL and OPL_RELEASE_NOTES_CODEX_API_KEY route. Set OPL_RELEASE_NOTES_PROVIDER=codex only for a local operator fallback.');
}
