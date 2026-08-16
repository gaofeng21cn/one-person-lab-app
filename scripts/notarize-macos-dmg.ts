#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

type CommandResult = ReturnType<typeof spawnSync>;

type NotarizationState = {
  id: string | null;
  status: string | null;
  submitted_at: string | null;
  last_observed_at: string | null;
  observation_deadline_at: string | null;
  maximum_observation_seconds: number;
  wait_timeout_seconds: number | null;
  info_poll_attempts: number;
  info_poll_interval_seconds: number;
};

type FailureEvidence = {
  code: string;
  stage: string;
  message: string;
  retry_disposition: string;
};

const defaultCommandTimeoutMs = 45 * 60_000;
const timestampSigningAttemptLimitMs = 5 * 60_000;
const timestampServiceProbeTimeoutMs = 60_000;
const timestampAuthoritySelection = 'system_default';
const maximumTimestampServiceProbeAttempts = 2;
const maximumTimestampSigningAttempts = 4;
const largeDmgThresholdBytes = 512 * 1024 * 1024;
const maximumLargeDmgTimestampSigningAttempts = 2;
const postNotarizationReserveMs = 20 * 60_000;
const minimumNotarizationWaitMs = 60_000;
const maximumNotarizationObservationMs = 30 * 60_000;
const initialNotarizationWaitMs = 5 * 60_000;
const notarizationInfoPollIntervalMs = 15_000;
const minimumTimestampSigningNotarizationWindowMs = 20 * 60_000;

function testMode(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.OPL_NOTARIZATION_TEST_MODE === 'true';
}

function commandPath(command: string): string {
  if (!testMode()) return command;
  const root = requiredEnv('OPL_NOTARIZATION_TEST_COMMAND_ROOT');
  return path.join(root, command);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim() || '';
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function runCapture(command: string, args: string[], timeout = defaultCommandTimeoutMs): CommandResult {
  return spawnSync(commandPath(command), args, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function run(command: string, args: string[], timeout?: number, redactedArgs: string[] = args): CommandResult {
  const result = runCapture(command, args, timeout);
  if (result.status !== 0) {
    const error = new Error([
      `Command failed: ${command} ${redactedArgs.map((arg) => JSON.stringify(arg)).join(' ')}`,
      result.error?.message ? `error: ${result.error.message}` : '',
      result.stdout?.trim() ? `stdout:\n${result.stdout.trim()}` : '',
      result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : '',
    ].filter(Boolean).join('\n'));
    if (result.error?.code) {
      Object.assign(error, { code: result.error.code });
    }
    throw error;
  }
  return result;
}

function parseJsonResult(result: CommandResult): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(String(result.stdout || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

export function notarizationWaitTimeoutSeconds(input: {
  operationDeadlineAt?: string;
  nowMs?: number;
  reserveMs?: number;
}): number {
  if (!input.operationDeadlineAt) return defaultCommandTimeoutMs / 1_000;
  const deadlineMs = Date.parse(input.operationDeadlineAt);
  const nowMs = input.nowMs ?? Date.now();
  const reserveMs = input.reserveMs ?? postNotarizationReserveMs;
  if (!Number.isFinite(deadlineMs)) {
    throw new Error('Operation deadline must be an exact ISO-8601 timestamp.');
  }
  const waitMs = deadlineMs - nowMs - reserveMs;
  if (waitMs < minimumNotarizationWaitMs) {
    throw new Error('Notarization cannot start without one minute of wait budget and twenty minutes of operation reserve.');
  }
  return Math.floor(waitMs / 1_000);
}

export function notarizationObservationDeadlineMs(input: {
  operationDeadlineAt?: string;
  nowMs?: number;
  reserveMs?: number;
  maximumObservationMs?: number;
}): number {
  const nowMs = input.nowMs ?? Date.now();
  const maximumObservationMs = input.maximumObservationMs ?? maximumNotarizationObservationMs;
  if (!Number.isInteger(maximumObservationMs) || maximumObservationMs < minimumNotarizationWaitMs) {
    throw new Error('Maximum notarization observation window must be at least one minute.');
  }
  if (!input.operationDeadlineAt) return nowMs + maximumObservationMs;
  const operationDeadlineMs = Date.parse(input.operationDeadlineAt);
  if (!Number.isFinite(operationDeadlineMs)) {
    throw new Error('Operation deadline must be an exact ISO-8601 timestamp.');
  }
  return Math.min(
    operationDeadlineMs - (input.reserveMs ?? postNotarizationReserveMs),
    nowMs + maximumObservationMs,
  );
}

export function preNotarizationCommandTimeoutMs(input: {
  operationDeadlineAt?: string;
  nowMs?: number;
  reserveMs?: number;
  minimumWaitMs?: number;
}): number {
  if (!input.operationDeadlineAt) return defaultCommandTimeoutMs;
  const deadlineMs = Date.parse(input.operationDeadlineAt);
  const nowMs = input.nowMs ?? Date.now();
  const reserveMs = input.reserveMs ?? postNotarizationReserveMs;
  const minimumWaitMs = input.minimumWaitMs ?? minimumNotarizationWaitMs;
  if (!Number.isFinite(deadlineMs)) {
    throw new Error('Operation deadline must be an exact ISO-8601 timestamp.');
  }
  const timeoutMs = deadlineMs - nowMs - reserveMs - minimumWaitMs;
  if (timeoutMs < 1_000) {
    throw new Error('Pre-notarization command cannot start without one minute of notarization wait budget and twenty minutes of operation reserve.');
  }
  return Math.floor(timeoutMs);
}

export function timestampSigningTimeoutMs(input: {
  operationDeadlineAt?: string;
  nowMs?: number;
  attemptLimitMs?: number;
  artifactSizeBytes?: number;
  attemptNumber?: number;
}): number {
  if (input.attemptLimitMs !== undefined
    && (!Number.isInteger(input.attemptLimitMs) || input.attemptLimitMs < 1)) {
    throw new Error('Timestamp-signing attempt limit must be a positive integer number of milliseconds.');
  }
  const artifactSizeBytes = input.artifactSizeBytes ?? 0;
  if (!Number.isInteger(artifactSizeBytes) || artifactSizeBytes < 0) {
    throw new Error('Timestamp-signing artifact size must be a non-negative integer number of bytes.');
  }
  const attemptNumber = input.attemptNumber ?? 1;
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new Error('Timestamp-signing attempt number must be a positive integer.');
  }

  const safeBudgetMs = preNotarizationCommandTimeoutMs({
    operationDeadlineAt: input.operationDeadlineAt,
    nowMs: input.nowMs,
    minimumWaitMs: minimumTimestampSigningNotarizationWindowMs,
  });
  const attemptLimitMs = input.attemptLimitMs ?? timestampSigningAttemptLimitMs;
  return Math.min(attemptLimitMs, safeBudgetMs);
}

export function timestampSigningMaximumAttempts(artifactSizeBytes: number): number {
  if (!Number.isInteger(artifactSizeBytes) || artifactSizeBytes < 0) {
    throw new Error('Timestamp-signing artifact size must be a non-negative integer number of bytes.');
  }
  return artifactSizeBytes >= largeDmgThresholdBytes
    ? maximumLargeDmgTimestampSigningAttempts
    : maximumTimestampSigningAttempts;
}

function configuredTimestampSigningAttemptLimitMs(): number | undefined {
  const testOverride = testMode()
    ? process.env.OPL_NOTARIZATION_TEST_TIMESTAMP_SIGNING_TIMEOUT_MS?.trim()
    : '';
  if (!testOverride) return undefined;
  const parsed = Number(testOverride);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('OPL_NOTARIZATION_TEST_TIMESTAMP_SIGNING_TIMEOUT_MS must be a positive integer.');
  }
  return parsed;
}

function configuredTimestampServiceProbeTimeoutMs(): number {
  const testOverride = testMode()
    ? process.env.OPL_NOTARIZATION_TEST_TIMESTAMP_PROBE_TIMEOUT_MS?.trim()
    : '';
  if (!testOverride) return timestampServiceProbeTimeoutMs;
  const parsed = Number(testOverride);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('OPL_NOTARIZATION_TEST_TIMESTAMP_PROBE_TIMEOUT_MS must be a positive integer.');
  }
  return parsed;
}

function configuredNotarizationInfoPollIntervalMs(): number {
  const testOverride = testMode()
    ? process.env.OPL_NOTARIZATION_TEST_NOTARY_POLL_INTERVAL_MS?.trim()
    : '';
  if (!testOverride) return notarizationInfoPollIntervalMs;
  const parsed = Number(testOverride);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('OPL_NOTARIZATION_TEST_NOTARY_POLL_INTERVAL_MS must be a positive integer.');
  }
  return parsed;
}

function pollIntervalSeconds(milliseconds: number): number {
  return Math.max(1, Math.ceil(milliseconds / 1_000));
}

function configuredNotarizationInfoPollMaxMs(): number | undefined {
  const testOverride = testMode()
    ? process.env.OPL_NOTARIZATION_TEST_NOTARY_POLL_MAX_MS?.trim()
    : '';
  if (!testOverride) return undefined;
  const parsed = Number(testOverride);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('OPL_NOTARIZATION_TEST_NOTARY_POLL_MAX_MS must be a positive integer.');
  }
  return parsed;
}

function commandTimedOut(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ETIMEDOUT';
}

function sha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function findSingleApp(root: string): string {
  const apps = fs.readdirSync(root)
    .filter((entry) => entry.endsWith('.app') && fs.statSync(path.join(root, entry)).isDirectory())
    .map((entry) => path.join(root, entry));
  if (apps.length !== 1) {
    throw new Error(`Expected one top-level App bundle, found ${apps.length} under ${root}.`);
  }
  return apps[0];
}

function signatureFacts(
  target: string,
  expectedTeamId: string,
  requireHardenedRuntime = false,
  timeout?: number,
) {
  const result = run('codesign', ['-dv', '--verbose=4', target], timeout);
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const teamIdentifier = output.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim() || '';
  const authorities = [...output.matchAll(/^Authority=(.+)$/gm)].map((match) => match[1].trim());
  const runtime = output.match(/^Runtime Version=(.+)$/m)?.[1]?.trim() || null;
  if (teamIdentifier !== expectedTeamId) {
    throw new Error(`Unexpected TeamIdentifier for ${target}: ${teamIdentifier || 'missing'}.`);
  }
  if (!authorities.some((authority) => authority.startsWith('Developer ID Application:'))) {
    throw new Error(`Developer ID Application authority is missing for ${target}.`);
  }
  if (requireHardenedRuntime && !runtime) {
    throw new Error(`Hardened Runtime is missing for ${target}.`);
  }
  return { team_identifier: teamIdentifier, authorities, hardened_runtime: Boolean(runtime), runtime_version: runtime };
}

function verifyTimestampServiceProbe(
  probePath: string,
  identity: string,
  expectedTeamId: string,
  timeoutMs: number,
) {
  fs.writeFileSync(probePath, crypto.randomBytes(32));
  run(
    'codesign',
    ['--force', '--timestamp', '--sign', identity, probePath],
    timeoutMs,
  );
  run('codesign', ['--verify', '--strict', '--verbose=2', probePath], timeoutMs);
  const result = run('codesign', ['-dv', '--verbose=4', probePath], timeoutMs);
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const teamIdentifier = output.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim() || '';
  const timestamp = output.match(/^Timestamp=(.+)$/m)?.[1]?.trim() || '';
  const authorities = [...output.matchAll(/^Authority=(.+)$/gm)].map((match) => match[1].trim());
  if (teamIdentifier !== expectedTeamId) {
    throw new Error(`Timestamp probe returned unexpected TeamIdentifier: ${teamIdentifier || 'missing'}.`);
  }
  if (!authorities.some((authority) => authority.startsWith('Developer ID Application:'))) {
    throw new Error('Timestamp probe is missing the Developer ID Application authority.');
  }
  if (!timestamp) {
    throw new Error('Timestamp probe did not receive a trusted timestamp.');
  }
}

function submitForNotarization(target: string, credentials: {
  appleId: string;
  password: string;
  teamId: string;
  keychainProfile: string;
}, operationDeadlineAt: string, persist: (state: NotarizationState) => void) {
  const credentialArgs = credentials.keychainProfile
    ? ['--keychain-profile', credentials.keychainProfile]
    : [
        '--apple-id',
        credentials.appleId,
        '--password',
        credentials.password,
        '--team-id',
        credentials.teamId,
      ];
  const redactedCredentialArgs = credentialArgs.map((argument) => {
    if (argument === credentials.appleId) return '<redacted-apple-id>';
    if (argument === credentials.password) return '<redacted-password>';
    return argument;
  });
  const submitArgs = [
    'notarytool',
    'submit',
    target,
    ...credentialArgs,
    '--output-format',
    'json',
  ];
  const redactedSubmitArgs = [
    'notarytool',
    'submit',
    target,
    ...redactedCredentialArgs,
    '--output-format',
    'json',
  ];
  const observationDeadlineMs = notarizationObservationDeadlineMs({ operationDeadlineAt });
  const remainingObservationSeconds = () => {
    const remainingSeconds = Math.floor((observationDeadlineMs - Date.now()) / 1_000);
    if (remainingSeconds < minimumNotarizationWaitMs / 1_000) {
      throw new Error('Notarization cannot continue without one minute of runner-local observation budget.');
    }
    return remainingSeconds;
  };
  const submitBudgetSeconds = remainingObservationSeconds();
  const submitted = parseJsonResult(run(
    'xcrun',
    submitArgs,
    Math.min(defaultCommandTimeoutMs, submitBudgetSeconds * 1_000),
    redactedSubmitArgs,
  ));
  const id = typeof submitted?.id === 'string' && submitted.id ? submitted.id : null;
  const submittedStatus = typeof submitted?.status === 'string' && submitted.status
    ? submitted.status
    : null;
  if (!id) throw new Error('notarytool submit did not return a submission id.');

  const state: NotarizationState = {
    id,
    status: submittedStatus,
    submitted_at: new Date().toISOString(),
    last_observed_at: new Date().toISOString(),
    observation_deadline_at: new Date(observationDeadlineMs).toISOString(),
    maximum_observation_seconds: maximumNotarizationObservationMs / 1_000,
    wait_timeout_seconds: null,
    info_poll_attempts: 0,
    info_poll_interval_seconds: pollIntervalSeconds(configuredNotarizationInfoPollIntervalMs()),
  };
  persist(state);

  const waitTimeoutSeconds = Math.min(remainingObservationSeconds(), initialNotarizationWaitMs / 1_000);
  state.wait_timeout_seconds = waitTimeoutSeconds;
  persist(state);
  const waitArgs = [
    'notarytool',
    'wait',
    id,
    ...credentialArgs,
    '--timeout',
    `${waitTimeoutSeconds}s`,
    '--output-format',
    'json',
  ];
  const waitResult = runCapture('xcrun', waitArgs, (waitTimeoutSeconds + 30) * 1_000);
  let observed = parseJsonResult(waitResult);
  const queryStatus = () => {
    const infoArgs = [
      'notarytool',
      'info',
      id,
      ...credentialArgs,
      '--output-format',
      'json',
    ];
    const remainingMs = observationDeadlineMs - Date.now();
    if (remainingMs <= 0) return null;
    const infoResult = runCapture('xcrun', infoArgs, Math.min(30_000, remainingMs));
    state.info_poll_attempts += 1;
    const result = parseJsonResult(infoResult);
    if (typeof result?.status === 'string' && result.status) state.status = result.status;
    state.last_observed_at = new Date().toISOString();
    persist(state);
    return result;
  };
  const isTerminalStatus = (status: unknown) => (
    status === 'Accepted' || status === 'Rejected' || status === 'Invalid'
  );
  if (!isTerminalStatus(observed?.status)) {
    observed = queryStatus() ?? observed;
    const pollIntervalMs = configuredNotarizationInfoPollIntervalMs();
    const pollMaxMs = configuredNotarizationInfoPollMaxMs();
    const pollStartedAt = Date.now();
    while (!isTerminalStatus(observed?.status)) {
      const pollDeadlineMs = pollMaxMs === undefined
        ? observationDeadlineMs
        : Math.min(observationDeadlineMs, pollStartedAt + pollMaxMs);
      const remainingMs = pollDeadlineMs - Date.now();
      if (remainingMs <= 0) break;
      const sleeper = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(sleeper, 0, 0, Math.min(pollIntervalMs, remainingMs));
      if (Date.now() >= pollDeadlineMs) break;
      observed = queryStatus() ?? observed;
    }
  }
  state.status = typeof observed?.status === 'string' && observed.status
    ? observed.status
    : state.status;
  state.last_observed_at = new Date().toISOString();
  persist(state);
  if (state.status !== 'Accepted') {
    throw new Error(
      `Apple notarization submission ${id} did not reach Accepted within the bounded wait: status=${state.status || 'unknown'}.`,
    );
  }
  return { id, status: state.status };
}

function parseOptions() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      dmg: { type: 'string' },
      output: { type: 'string' },
      'operation-deadline-at': { type: 'string' },
      'submitted-candidate-output': { type: 'string' },
    },
    allowPositionals: false,
    strict: true,
  });
  if (!values.dmg || !values.output) throw new Error('Pass --dmg <path> and --output <path>.');
  return {
    dmgPath: path.resolve(values.dmg),
    outputPath: path.resolve(values.output),
    operationDeadlineAt: values['operation-deadline-at']?.trim() || '',
    submittedCandidateOutputPath: values['submitted-candidate-output']
      ? path.resolve(values['submitted-candidate-output'])
      : path.resolve(
          path.dirname(values.dmg),
          `${path.basename(values.dmg, '.dmg')}.submitted-for-notarization.dmg`,
        ),
  };
}

export function finalizeNotarizedDmg() {
  if (process.platform !== 'darwin' && !testMode()) throw new Error('macOS DMG notarization requires a macOS runner.');
  const options = parseOptions();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-notarize-dmg-'));
  const mountPoint = path.join(tempRoot, 'mount');
  const candidateDmg = path.join(
    path.dirname(options.dmgPath),
    `.${path.basename(options.dmgPath, '.dmg')}.${process.pid}.notarizing.dmg`,
  );
  let mounted = false;
  let stage = 'preflight';
  const evidence: Record<string, any> = {
    schema: 'opl_apple_notarized_dmg_receipt.v1',
    status: 'failed',
    artifact: path.basename(options.dmgPath),
    operation_deadline_at: options.operationDeadlineAt || null,
    team_identifier: null,
    signing_identity: null,
    credential_mode: null,
    notarization: {
      id: null,
      status: null,
      submitted_at: null,
      last_observed_at: null,
      observation_deadline_at: null,
      maximum_observation_seconds: maximumNotarizationObservationMs / 1_000,
      wait_timeout_seconds: null,
      info_poll_attempts: 0,
      info_poll_interval_seconds: pollIntervalSeconds(notarizationInfoPollIntervalMs),
    } satisfies NotarizationState,
    timestamp_signing: {
      authority_endpoint: timestampAuthoritySelection,
      probe_status: 'pending',
      probe_timeout_seconds: null,
      probe_attempts: 0,
      probe_retry_count: 0,
      probe_attempt_timeout_seconds: null,
      probe_attempt_timeouts_seconds: [],
      probe_maximum_attempts: maximumTimestampServiceProbeAttempts,
      probe_strategy: 'bounded_fresh_probe_attempts',
      attempts: 0,
      retry_count: 0,
      attempt_timeout_seconds: null,
      attempt_timeouts_seconds: [],
      artifact_size_bytes: null,
      maximum_attempts: null,
      strategy: null,
    },
    submitted_candidate: {
      sha256: null,
      size_bytes: null,
      retained_for_reconcile: false,
      recovery_file: path.basename(options.submittedCandidateOutputPath),
    },
    failure: null,
  };
  const persist = () => writeJsonAtomic(options.outputPath, evidence);
  try {
    if (!fs.existsSync(options.dmgPath)) throw new Error(`DMG not found: ${options.dmgPath}`);
    const identity = requiredEnv('OPL_RUNTIME_CODESIGN_IDENTITY');
    const teamId = requiredEnv('teamId');
    const keychainProfile = process.env.OPL_NOTARYTOOL_KEYCHAIN_PROFILE?.trim() || '';
    const appleId = process.env.appleId?.trim() || '';
    const appleIdPassword = process.env.appleIdPassword?.trim() || '';
    if (!keychainProfile && (!appleId || !appleIdPassword)) {
      throw new Error('Missing Apple notarization credentials: configure OPL_NOTARYTOOL_KEYCHAIN_PROFILE or Apple ID credentials.');
    }
    evidence.team_identifier = teamId;
    evidence.signing_identity = identity;
    evidence.credential_mode = keychainProfile ? 'keychain_profile' : 'apple_id';

    stage = 'verify_embedded_app';
    fs.mkdirSync(mountPoint);
    run('hdiutil', ['attach', options.dmgPath, '-nobrowse', '-readonly', '-mountpoint', mountPoint]);
    mounted = true;
    const sourceApp = findSingleApp(mountPoint);
    run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', sourceApp]);
    const appSignature = signatureFacts(sourceApp, teamId, true);
    run('hdiutil', ['detach', mountPoint]);
    mounted = false;

    stage = 'probe_timestamp_service';
    const probePath = path.join(tempRoot, 'timestamp-service-probe');
    const configuredProbeTimeoutMs = configuredTimestampServiceProbeTimeoutMs();
    evidence.timestamp_signing.probe_status = 'running';
    for (let attempt = 1; attempt <= maximumTimestampServiceProbeAttempts; attempt += 1) {
      const probeTimeoutMs = Math.min(
        configuredProbeTimeoutMs,
        preNotarizationCommandTimeoutMs({
          operationDeadlineAt: options.operationDeadlineAt,
          minimumWaitMs: minimumTimestampSigningNotarizationWindowMs,
        }),
      );
      evidence.timestamp_signing.probe_timeout_seconds = Math.floor(probeTimeoutMs / 1_000);
      evidence.timestamp_signing.probe_attempts = attempt;
      evidence.timestamp_signing.probe_retry_count = attempt - 1;
      evidence.timestamp_signing.probe_attempt_timeout_seconds = Math.floor(probeTimeoutMs / 1_000);
      evidence.timestamp_signing.probe_attempt_timeouts_seconds.push(Math.floor(probeTimeoutMs / 1_000));
      persist();
      try {
        verifyTimestampServiceProbe(probePath, identity, teamId, probeTimeoutMs);
        evidence.timestamp_signing.probe_status = 'passed';
        persist();
        break;
      } catch (error) {
        evidence.timestamp_signing.probe_status = 'failed';
        persist();
        if (!commandTimedOut(error) || attempt === maximumTimestampServiceProbeAttempts) {
          throw error;
        }
      }
    }

    stage = 'sign_dmg';
    const artifactSizeBytes = fs.statSync(options.dmgPath).size;
    const maximumAttempts = timestampSigningMaximumAttempts(artifactSizeBytes);
    evidence.timestamp_signing.artifact_size_bytes = artifactSizeBytes;
    evidence.timestamp_signing.maximum_attempts = maximumAttempts;
    evidence.timestamp_signing.strategy = artifactSizeBytes >= largeDmgThresholdBytes
      ? 'large_dmg_system_default_timestamp_bounded_attempts'
      : 'small_dmg_bounded_attempts';
    const preNotarizationTimeoutMs = () => preNotarizationCommandTimeoutMs({
      operationDeadlineAt: options.operationDeadlineAt,
    });
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      fs.rmSync(candidateDmg, { force: true });
      fs.copyFileSync(options.dmgPath, candidateDmg);
      const attemptTimeoutMs = timestampSigningTimeoutMs({
        operationDeadlineAt: options.operationDeadlineAt,
        attemptLimitMs: configuredTimestampSigningAttemptLimitMs(),
        artifactSizeBytes,
        attemptNumber: attempt,
      });
      evidence.timestamp_signing.attempts = attempt;
      evidence.timestamp_signing.retry_count = attempt - 1;
      evidence.timestamp_signing.attempt_timeout_seconds = Math.floor(attemptTimeoutMs / 1_000);
      evidence.timestamp_signing.attempt_timeouts_seconds.push(Math.floor(attemptTimeoutMs / 1_000));
      persist();
      try {
        run(
          'codesign',
          ['--force', '--timestamp', '--sign', identity, candidateDmg],
          attemptTimeoutMs,
        );
        break;
      } catch (error) {
        if (!commandTimedOut(error) || attempt === maximumAttempts) {
          throw error;
        }
      }
    }
    run(
      'codesign',
      ['--verify', '--strict', '--verbose=2', candidateDmg],
      preNotarizationTimeoutMs(),
    );
    const signedDmgSha256 = sha256(candidateDmg);
    evidence.submitted_candidate.sha256 = signedDmgSha256;
    evidence.submitted_candidate.size_bytes = fs.statSync(candidateDmg).size;
    persist();
    const dmgSignature = signatureFacts(candidateDmg, teamId, false, preNotarizationTimeoutMs());
    stage = 'submit_and_wait';
    const notarization = submitForNotarization(candidateDmg, {
      appleId,
      password: appleIdPassword,
      teamId,
      keychainProfile,
    }, options.operationDeadlineAt, (notarizationState) => {
      evidence.notarization = { ...notarizationState };
      persist();
    });
    stage = 'staple_and_verify';
    run('xcrun', ['stapler', 'staple', candidateDmg]);
    run('xcrun', ['stapler', 'validate', candidateDmg]);
    run('hdiutil', ['verify', candidateDmg]);
    run('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=4', candidateDmg]);

    run('hdiutil', ['attach', candidateDmg, '-nobrowse', '-readonly', '-mountpoint', mountPoint]);
    mounted = true;
    const mountedApp = findSingleApp(mountPoint);
    run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', mountedApp]);
    run('spctl', ['--assess', '--type', 'execute', '--verbose=4', mountedApp]);
    const mountedAppSignature = signatureFacts(mountedApp, teamId, true);
    run('hdiutil', ['detach', mountPoint]);
    mounted = false;

    fs.renameSync(candidateDmg, options.dmgPath);
    Object.assign(evidence, {
      status: 'passed',
      app_signature: appSignature,
      mounted_app_signature: mountedAppSignature,
      dmg_signature: dmgSignature,
      notarization: { ...evidence.notarization, ...notarization },
      stapler_validate_status: 'passed',
      dmg_spctl_status: 'passed',
      app_spctl_status: 'passed',
      signed_dmg_sha256_before_staple: signedDmgSha256,
      final_stapled_dmg_sha256: sha256(options.dmgPath),
      final_stapled_dmg_size_bytes: fs.statSync(options.dmgPath).size,
      failure: null,
    });
    persist();
    return evidence;
  } catch (error) {
    const hasSubmissionId = typeof evidence.notarization.id === 'string' && evidence.notarization.id.length > 0;
    const permanentSubmissionFailure = evidence.notarization.status === 'Rejected'
      || evidence.notarization.status === 'Invalid';
    evidence.status = 'failed';
    evidence.failure = {
      code: hasSubmissionId
        ? permanentSubmissionFailure
          ? 'notarization_submission_rejected'
          : 'notarization_submission_incomplete'
        : stage === 'probe_timestamp_service'
          ? 'timestamp_service_probe_failed'
        : stage === 'submit_and_wait'
          ? 'notarization_submission_outcome_unknown'
          : 'notarization_finalization_failed',
      stage,
      message: error instanceof Error ? error.message : String(error),
      retry_disposition: hasSubmissionId
        ? permanentSubmissionFailure
          ? 'new_operation_required_no_retry'
          : 'read_only_reconcile_submission_no_retry'
        : stage === 'submit_and_wait'
          ? 'read_only_history_reconcile_before_new_operation'
        : 'new_operation_required_no_retry',
    } satisfies FailureEvidence;
    if (hasSubmissionId && fs.existsSync(candidateDmg)) {
      fs.mkdirSync(path.dirname(options.submittedCandidateOutputPath), { recursive: true });
      if (fs.existsSync(options.submittedCandidateOutputPath)) {
        throw new Error(`Submitted candidate recovery output already exists: ${options.submittedCandidateOutputPath}`);
      }
      fs.renameSync(candidateDmg, options.submittedCandidateOutputPath);
      evidence.submitted_candidate.retained_for_reconcile = true;
    }
    persist();
    throw error;
  } finally {
    if (mounted) runCapture('hdiutil', ['detach', mountPoint]);
    fs.rmSync(candidateDmg, { force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(finalizeNotarizedDmg(), null, 2)}\n`);
  } catch {
    console.error('DMG notarization finalization failed; inspect the persisted recovery evidence.');
    process.exit(1);
  }
}
