#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';
import { validateDockerWebuiDiagnostics } from './validate-docker-webui-diagnostics.ts';
import {
  apiKeyFlowEvidenceSchema,
  expectedImageSeedSelection,
  ordinaryMustNotClaim,
  resultSchema,
  windowsEvidenceManifestName,
  type GateId,
  type GateResult,
  type ImageIdentity,
  type OrdinaryUserStatus,
} from './docker-webui-smoke-gate/contract.ts';
import { validateDockerWebuiSmokeGateResult } from './docker-webui-smoke-gate/result-validator.ts';
import {
  fileStatus,
  isObject,
  readJson,
  readKeyValue,
  scanDirectoryForSecretMarkers,
  writeJson,
} from './docker-webui-smoke-gate/support.ts';
import { importWindowsEvidenceGate } from './docker-webui-smoke-gate/windows-evidence.ts';

export { validateDockerWebuiSmokeGateResult } from './docker-webui-smoke-gate/result-validator.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiKeyFlowRequestTimeoutMs = 10_000;
const apiKeyFlowRetryIntervalMs = 2_000;
const apiKeyFlowMaxWaitMs = 120_000;

function emptyDiagnosticsValidation(
  diagnosticsDir: string,
  missingFiles = ['diagnostics not run'],
): ReturnType<typeof validateDockerWebuiDiagnostics> {
  return {
    status: 'failed' as const,
    diagnostics_dir: diagnosticsDir,
    checked_files: [],
    missing_files: missingFiles,
    invalid_evidence: [],
    forbidden_secret_markers: [],
    secret_scan: {
      status: 'passed' as const,
      forbidden_secret_markers: [],
    },
    preservation_verdict: null,
    compose_volume_mapping: {
      status: 'failed' as const,
      required_mounts: ['host_data_dir -> /data', 'host_projects_dir -> /projects'],
      missing_mounts: ['host_data_dir -> /data', 'host_projects_dir -> /projects'],
    },
    preservation_evidence: {
      status: 'failed' as const,
      required_sections: [
        'pre_data_inventory',
        'post_data_inventory',
        'pre_projects_inventory',
        'post_projects_inventory',
      ],
      missing_sections: [
        'pre_data_inventory',
        'post_data_inventory',
        'pre_projects_inventory',
        'post_projects_inventory',
      ],
    },
    image_identity: {
      status: 'failed' as const,
      image_id: null,
      repo_digests: [],
      digest: null,
      remote_ref: null,
      remote_digest: null,
      currentness_status: 'not_checked' as const,
      currentness_evidence_source: null,
      currentness_claim: false as const,
    },
  };
}

function parseArgs(argv: string[]) {
  const { values } = parseNodeArgs({
    args: argv,
    options: {
      gate: { type: 'string' },
      artifacts: { type: 'string' },
      evidence: { type: 'string' },
      'validate-result': { type: 'string' },
      image: { type: 'string' },
      port: { type: 'string' },
      'health-timeout': { type: 'string' },
      open: { type: 'boolean' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    } as const,
    allowPositionals: false,
    strict: true,
  });
  if (values.help) {
    printUsage();
    process.exit(0);
  }
  const options = {
    gate: (values.gate ?? '') as GateId | '',
    artifacts: values.artifacts ?? '',
    evidence: values.evidence ?? '',
    validateResult: values['validate-result'] ?? '',
    image: values.image ?? 'ghcr.io/gaofeng21cn/one-person-lab-webui:latest',
    port: values.port === undefined ? 3000 : Number(values.port),
    healthTimeout: values['health-timeout'] === undefined ? 120 : Number(values['health-timeout']),
    noOpen: values.open !== true,
    json: values.json === true,
  };
  if (options.validateResult) {
    return options as typeof options & { gate: GateId | '' };
  }
  if (!['clean_linux_vm', 'clean_windows_vm', 'existing_docker', 'existing_old_onepersonlab_data_dir'].includes(options.gate)) {
    throw new Error('Missing or invalid --gate');
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error('Invalid --port');
  }
  if (!Number.isInteger(options.healthTimeout) || options.healthTimeout < 1) {
    throw new Error('Invalid --health-timeout');
  }
  if (!options.artifacts) {
    options.artifacts = path.join(appRoot, 'tmp', 'docker-webui-smoke-gates', options.gate);
  }
  if (options.evidence && options.gate !== 'clean_windows_vm') {
    throw new Error('--evidence is currently supported only for --gate clean_windows_vm');
  }
  return options as typeof options & { gate: GateId };
}

function printUsage() {
  console.log(`Usage:
  node --experimental-strip-types scripts/docker-webui-smoke-gate.ts --gate <clean_linux_vm|clean_windows_vm|existing_docker|existing_old_onepersonlab_data_dir> [--artifacts <dir>] [--evidence <dir>] [--image <ref>] [--port <port>] [--json]
  node --experimental-strip-types scripts/docker-webui-smoke-gate.ts --validate-result <docker-webui-smoke-gate-result.json> [--json]

Runs a Docker/WebUI smoke gate when the current host matches the gate. If the current host cannot prove the gate, writes a typed blocker instead of passing.

For clean_windows_vm, --evidence <dir-or-zip> imports a Windows VM artifact set with ${windowsEvidenceManifestName} and diagnostics/.`);
}

function makeResult(gate: GateId, artifactDir: string): GateResult {
  const diagnosticsDir = path.join(artifactDir, 'diagnostics');
  return {
    schema: resultSchema,
    gate,
    gate_id: gate,
    status: 'failed',
    typed_blocker: null,
    observed_at: new Date().toISOString(),
    host_platform: process.platform,
    required_environment: requiredEnvironment(gate),
    artifact_dir: artifactDir,
    diagnostics_dir: diagnosticsDir,
    health: {
      url: `http://localhost:3000/`,
      status: 'not_run',
      http_status: null,
    },
    compose: {
      path: '',
      status: 'not_run',
    },
    container: {
      name: 'one-person-lab-webui',
      status: 'not_run',
      id: null,
    },
    image: {
      ref: '',
      status: 'not_run',
      id: null,
      repo_digests: [],
      digest: null,
      remote_ref: null,
      remote_digest: null,
      currentness_status: 'not_checked',
      currentness_evidence_source: null,
      currentness_claim: false,
    },
    data_preservation: {
      status: 'not_run',
      verdict: null,
      summary: 'data preservation diagnostics were not run',
    },
    api_key_flow: {
      status: 'not_run',
      mode: 'not_run',
      endpoint: null,
      command: null,
      stdin_transport: false,
      receipt_path: null,
      errors: [],
    },
    ordinary_user_status: makeOrdinaryUserStatus({
      healthUrl: `http://localhost:3000/`,
      composePath: null,
      diagnosticsDir,
      apiKeyReceiptPath: null,
      dataEvidencePath: null,
    }),
    secret_scan: {
      status: 'not_run',
      forbidden_secret_markers: [],
    },
    commands: [],
    evidence: {},
  };
}

function makeOrdinaryUserStatus(input: {
  healthUrl: string;
  composePath: string | null;
  diagnosticsDir: string | null;
  apiKeyReceiptPath: string | null;
  dataEvidencePath: string | null;
  result?: GateResult;
}): OrdinaryUserStatus {
  const result = input.result;
  const oneClickStatus = result
    ? result.status === 'typed_blocker'
      ? 'typed_blocker'
      : result.compose.status === 'present' && result.image.status === 'present'
        ? 'passed'
        : result.status === 'failed'
          ? 'failed'
          : 'not_run'
    : 'not_run';
  const browserStatus = result
    ? result.health.status === 'passed'
      ? 'passed'
      : result.status === 'typed_blocker'
        ? 'typed_blocker'
        : result.health.status === 'failed'
          ? 'failed'
          : 'not_run'
    : 'not_run';
  const accessStatus = result
    ? result.api_key_flow.status === 'passed'
      ? 'passed'
      : result.status === 'typed_blocker'
        ? 'typed_blocker'
        : result.api_key_flow.status === 'failed'
          ? 'failed'
          : 'not_run'
    : 'not_run';
  const recoveryStatus = result
    ? result.status === 'typed_blocker'
      ? 'typed_blocker'
      : result.diagnostics_validation?.status === 'passed'
        ? 'passed'
        : result.diagnostics_validation?.status === 'failed'
          ? 'failed'
          : 'not_run'
    : 'not_run';
  const dataStatus = result
    ? result.data_preservation.status === 'passed'
      ? 'passed'
      : result.status === 'typed_blocker'
        ? 'typed_blocker'
        : result.data_preservation.status === 'failed'
          ? 'failed'
          : 'not_run'
    : 'not_run';
  return {
    path_id: 'ordinary_docker_webui_user_path',
    priority: 'ordinary_user_path_before_evidence_bundle_language',
    one_click_install: {
      status: oneClickStatus,
      summary: 'One-click installer creates compose.yaml, host data/projects directories, and starts the WebUI image.',
      next_action:
        oneClickStatus === 'passed'
          ? null
          : 'Run the one-click installer on the target host after Docker is available.',
      evidence_ref: input.composePath,
    },
    browser_webui: {
      status: browserStatus,
      summary: `Open the browser WebUI at ${input.healthUrl}.`,
      next_action: browserStatus === 'passed' ? null : 'Fix Docker, image, port, or container startup, then rerun the installer.',
      evidence_ref: input.diagnosticsDir ? path.join(input.diagnosticsDir, 'http-probe.txt') : null,
    },
    access_key_settings: {
      status: accessStatus,
      summary: 'Sign in to OPL Gateway or enter an API Key in WebUI first-run or Settings -> Account & Access.',
      next_action:
        accessStatus === 'passed'
          ? null
          : 'Use the WebUI model-access form; do not pass Gateway credentials or API keys to the installer.',
      evidence_ref: input.apiKeyReceiptPath,
    },
    runtime_proxy: {
      status: accessStatus,
      summary: 'Gateway account sign-in and API Key configuration reuse the existing OPL runtime provider and its dedicated credential methods.',
      next_action: accessStatus === 'passed' ? null : 'Collect or rerun the API key flow receipt after WebUI health passes.',
      evidence_ref: input.apiKeyReceiptPath,
    },
    startup_recovery: {
      status: recoveryStatus,
      summary: 'Startup diagnostics are redacted and show what to retry or repair for Docker, port, image, or data issues.',
      next_action:
        recoveryStatus === 'passed'
          ? null
          : 'Collect diagnostics, fix the reported Docker/port/image/data issue, then rerun the installer.',
      evidence_ref: input.diagnosticsDir,
    },
    data_preservation: {
      status: dataStatus,
      summary: 'Host OnePersonLab/data and OnePersonLab/projects stay mounted and preserved across image/container replacement.',
      next_action: dataStatus === 'passed' ? null : 'Inspect data-preservation.txt and fix preserve-or-migrate behavior before rerunning.',
      evidence_ref: input.dataEvidencePath,
    },
    host_update: {
      status: oneClickStatus,
      summary: 'Host updates rerun the installer or explicit update mode to pull the WebUI image and recreate the compose service.',
      next_action:
        oneClickStatus === 'passed'
          ? 'Use install-docker-webui.sh --update or install-docker-webui.ps1 -Update when the host image should be updated.'
          : 'Finish the one-click installer before using host update mode.',
      evidence_ref: input.composePath,
    },
    image_seed_selection: expectedImageSeedSelection,
    settings_entry: 'Settings -> Account & Access',
    must_not_claim: [...ordinaryMustNotClaim],
  };
}

function refreshOrdinaryUserStatus(result: GateResult) {
  result.ordinary_user_status = makeOrdinaryUserStatus({
    healthUrl: result.health.url,
    composePath: result.compose.path || result.evidence.compose_yaml || null,
    diagnosticsDir: result.diagnostics_dir || null,
    apiKeyReceiptPath: result.api_key_flow.receipt_path || result.evidence.api_key_flow_evidence || result.evidence.windows_api_key_flow_evidence || null,
    dataEvidencePath: result.diagnostics_dir ? path.join(result.diagnostics_dir, 'data-preservation.txt') : null,
    result,
  });
}

function requiredEnvironment(gate: GateId): string {
  switch (gate) {
    case 'clean_linux_vm':
      return 'clean Linux VM running the Bash one-click installer';
    case 'clean_windows_vm':
      return 'clean Windows VM running the PowerShell one-click installer';
    case 'existing_docker':
      return 'host with existing Docker engine reused by the one-click installer';
    case 'existing_old_onepersonlab_data_dir':
      return 'host with pre-existing OnePersonLab/data preserved by the one-click installer';
  }
}

function blocker(result: GateResult, code: string, message: string, nextAction: string): GateResult {
  const typedBlocker = {
    code,
    owner: 'release_or_install_validation_operator',
    message,
    required_next_action: nextAction,
  };
  return {
    ...result,
    status: 'typed_blocker',
    typed_blocker: typedBlocker,
    blocker: typedBlocker,
  };
}

function runCommand(result: GateResult, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const index = result.commands.length + 1;
  const stdoutPath = path.join(result.artifact_dir, `command-${index}-stdout.txt`);
  const stderrPath = path.join(result.artifact_dir, `command-${index}-stderr.txt`);
  const executed = spawnSync(command, args, { cwd, env, encoding: 'utf8' });
  fs.writeFileSync(stdoutPath, executed.stdout ?? '');
  fs.writeFileSync(stderrPath, executed.stderr ?? '');
  result.commands.push({
    command: [command, ...args].join(' '),
    status: executed.status,
    stdout_path: stdoutPath,
    stderr_path: stderrPath,
  });
  return executed.status === 0;
}

function dockerAvailable(): boolean {
  const result = spawnSync('docker', ['info'], { encoding: 'utf8' });
  return result.status === 0;
}

function validateApiKeyFlowEvidence(filePath: string) {
  const errors: string[] = [];
  let payload: Record<string, unknown> = {};
  if (!fs.existsSync(filePath)) {
    errors.push(`missing API key flow evidence: ${filePath}`);
  } else {
    try {
      payload = readJson(filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`API key flow evidence must be valid JSON: ${message}`);
    }
  }
  if (Object.keys(payload).length > 0) {
    if (payload.schema !== apiKeyFlowEvidenceSchema) errors.push(`api_key_flow.schema must be ${apiKeyFlowEvidenceSchema}`);
    if (payload.status !== 'passed') errors.push('api_key_flow.status must be passed');
    if (payload.mode !== 'webui_proxy_configure_codex') errors.push('api_key_flow.mode must be webui_proxy_configure_codex');
    if (payload.command !== 'opl connect configure-codex --api-key-stdin --json') {
      errors.push('api_key_flow.command must be the redacted configure-codex stdin command');
    }
    if (payload.stdin_transport !== true) errors.push('api_key_flow.stdin_transport must be true');
    if (payload.key_material_recorded !== false) errors.push('api_key_flow.key_material_recorded must be false');
  }
  const forbiddenSecretMarkers = fs.existsSync(filePath) ? scanDirectoryForSecretMarkers(path.dirname(filePath)).filter((marker) => marker.startsWith(path.basename(filePath))) : [];
  if (forbiddenSecretMarkers.length > 0) {
    errors.push('API key flow evidence contains forbidden secret-like markers');
  }
  return {
    status: errors.length === 0 && forbiddenSecretMarkers.length === 0 ? ('passed' as const) : ('failed' as const),
    filePath,
    errors,
    forbiddenSecretMarkers,
    payload,
  };
}

function readHttpStatus(httpProbe: Record<string, string>): number | null {
  const candidates = [
    httpProbe.status,
    httpProbe.http_status,
    httpProbe.curl_http_code_or_error,
    httpProbe.python_http_status,
    httpProbe.head_status,
    httpProbe.get_status,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = candidate.match(/\b([1-5][0-9]{2})\b/);
    if (match) return Number(match[1]);
  }
  return null;
}

function runNodeHttpPostJson(url: string, body: Record<string, unknown>) {
  const script = `
const url = process.argv[1];
const payload = JSON.parse(process.argv[2]);
const request = globalThis.fetch
  ? globalThis.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(${apiKeyFlowRequestTimeoutMs}),
    })
  : Promise.reject(new Error('fetch_unavailable'));
request
  .then(async (response) => {
    const text = await response.text();
    process.stdout.write(JSON.stringify({ status: response.status, body: text }) + '\\n');
  })
  .catch((error) => {
    process.stderr.write(String(error && error.message ? error.message : error) + '\\n');
    process.exitCode = 1;
  });
`;
  return spawnSync(process.execPath, ['-e', script, url, JSON.stringify(body)], {
    cwd: appRoot,
    encoding: 'utf8',
  });
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sleepSync(durationMs: number) {
  if (durationMs <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, durationMs);
}

export function shouldRetryConfigureCodexProbe(observation: {
  errors: string[];
  elapsedMs: number;
  timeoutMs: number;
}) {
  if (observation.errors.some((error) => error.includes('leaked the submitted API key placeholder'))) return false;
  if (observation.errors.some((error) => /surface_not_found|Mandatory OPL Flow plugin installer/i.test(error))) return false;
  return observation.errors.length > 0 && observation.elapsedMs < observation.timeoutMs;
}

function inspectConfigureCodexResponse(response: ReturnType<typeof runNodeHttpPostJson>) {
  const errors: string[] = [];
  let responseStatus: number | null = null;
  let responseSuccess = false;
  let command = 'opl connect configure-codex --api-key-stdin --json';
  let stdinTransport = false;
  let responseErrorCode: string | null = null;
  let responseErrorMessage: string | null = null;

  if (response.status !== 0) {
    errors.push(`configure-codex proxy request failed: ${response.stderr.trim() || response.stdout.trim() || 'unknown error'}`);
  } else {
    const envelope = parseJsonObject(response.stdout.trim());
    responseStatus = typeof envelope?.status === 'number' ? envelope.status : null;
    const bodyText = typeof envelope?.body === 'string' ? envelope.body : '';
    const body = parseJsonObject(bodyText);
    responseSuccess = body?.success === true;
    const data = isObject(body?.data) ? body.data : null;
    const dataError = isObject(data?.error) ? data.error : null;
    responseErrorCode = typeof dataError?.code === 'string' ? dataError.code : null;
    responseErrorMessage = typeof dataError?.message === 'string'
      ? dataError.message.replaceAll('opl-smoke-placeholder-key', '<redacted>')
      : typeof body?.error === 'string'
        ? body.error.replaceAll('opl-smoke-placeholder-key', '<redacted>')
        : null;
    const observedCommand = typeof data?.command === 'string' ? data.command : typeof data?.redactedCommand === 'string' ? data.redactedCommand : '';
    if (observedCommand) command = observedCommand;
    stdinTransport = Array.isArray(data?.args)
      ? data.args.includes('--api-key-stdin')
      : command.includes('--api-key-stdin');
    if (responseStatus !== 200) errors.push(`configure-codex proxy returned HTTP ${responseStatus ?? 'unknown'}`);
    if (!responseSuccess) {
      const reason = [responseErrorCode, responseErrorMessage].filter(Boolean).join(': ');
      errors.push(`configure-codex proxy response did not report success=true${reason ? `: ${reason}` : ''}`);
    }
    if (!stdinTransport) errors.push('configure-codex command did not expose --api-key-stdin transport');
    if (JSON.stringify(body).includes('opl-smoke-placeholder-key') || response.stdout.includes('opl-smoke-placeholder-key')) {
      errors.push('configure-codex response leaked the submitted API key placeholder');
    }
  }

  return {
    errors,
    responseStatus,
    responseSuccess,
    responseErrorCode,
    responseErrorMessage,
    command,
    stdinTransport,
  };
}

function collectApiKeyFlowEvidence(result: GateResult, options: ReturnType<typeof parseArgs>) {
  const endpoint = `http://127.0.0.1:${options.port}/api/opl-runtime/configure-codex`;
  const receiptPath = path.join(result.artifact_dir, 'api-key-flow-evidence.json');
  const startedAt = Date.now();
  const timeoutMs = Math.min(options.healthTimeout * 1_000, apiKeyFlowMaxWaitMs);
  let attemptCount = 1;
  let observation = inspectConfigureCodexResponse(
    runNodeHttpPostJson(endpoint, { apiKey: 'opl-smoke-placeholder-key' }),
  );
  while (shouldRetryConfigureCodexProbe({ errors: observation.errors, elapsedMs: Date.now() - startedAt, timeoutMs })) {
    sleepSync(Math.min(apiKeyFlowRetryIntervalMs, Math.max(0, timeoutMs - (Date.now() - startedAt))));
    observation = inspectConfigureCodexResponse(
      runNodeHttpPostJson(endpoint, { apiKey: 'opl-smoke-placeholder-key' }),
    );
    attemptCount += 1;
  }
  const durationMs = Date.now() - startedAt;
  const errors = [...observation.errors];
  if (errors.length > 0 && durationMs >= timeoutMs) {
    errors.push(`configure-codex proxy did not become ready within ${timeoutMs}ms`);
  }

  const payload = {
    schema: apiKeyFlowEvidenceSchema,
    status: errors.length === 0 ? ('passed' as const) : ('failed' as const),
    mode: 'webui_proxy_configure_codex',
    endpoint,
    response_http_status: observation.responseStatus,
    response_success: observation.responseSuccess,
    response_error_code: observation.responseErrorCode,
    response_error_message: observation.responseErrorMessage,
    command: observation.command,
    stdin_transport: observation.stdinTransport,
    attempt_count: attemptCount,
    duration_ms: durationMs,
    retry_interval_ms: apiKeyFlowRetryIntervalMs,
    timeout_ms: timeoutMs,
    key_material_recorded: false,
    secret_scan_note: 'The smoke gate submits a non-real placeholder key and rejects any response that echoes it.',
    errors,
  };
  writeJson(receiptPath, payload);
  result.api_key_flow = {
    status: payload.status,
    mode: 'webui_proxy_configure_codex',
    endpoint,
    command: observation.command,
    stdin_transport: observation.stdinTransport,
    receipt_path: receiptPath,
    errors,
  };
  result.evidence.api_key_flow_evidence = receiptPath;
}

function writeDiagnosticsManifest(result: GateResult, options: ReturnType<typeof parseArgs>) {
  if (!fs.existsSync(result.diagnostics_dir)) return;
  writeJson(path.join(result.diagnostics_dir, 'diagnostics-manifest.json'), {
    schema: 'opl_docker_webui_diagnostics_manifest.v1',
    gate: options.gate,
    artifact_schema: resultSchema,
    created_at: new Date().toISOString(),
    required_files: [
      'metadata.txt',
      'diagnostics-manifest.json',
      'compose.yaml',
      'docker-version.txt',
      'docker-compose-version.txt',
      'docker-compose-ps.txt',
      'docker-compose-logs.txt',
      'docker-image.txt',
      'http-probe.txt',
      'directories.txt',
      'data-preservation.txt',
    ],
  });
}

function refreshDiagnosticsArchive(result: GateResult) {
  const archivePath = result.evidence.diagnostics_archive;
  if (!archivePath || !fs.existsSync(result.diagnostics_dir)) return;
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  const archived = spawnSync('tar', ['-czf', archivePath, '-C', path.dirname(result.diagnostics_dir), path.basename(result.diagnostics_dir)], {
    encoding: 'utf8',
  });
  if (archived.status !== 0) {
    throw new Error(`Failed to refresh diagnostics archive after manifest write: ${archived.stderr || archived.stdout}`);
  }
}

function readDiagnosticsSummary(result: GateResult, options: ReturnType<typeof parseArgs>, imageIdentity: ImageIdentity) {
  const metadata = readKeyValue(path.join(result.diagnostics_dir, 'metadata.txt'));
  const httpProbe = readKeyValue(path.join(result.diagnostics_dir, 'http-probe.txt'));
  const preservation = readKeyValue(path.join(result.diagnostics_dir, 'data-preservation.txt'));
  const composePath = metadata.compose_file || result.evidence.compose_yaml || path.join(result.artifact_dir, 'home', 'OnePersonLab', 'compose.yaml');
  const imageRef = metadata.image || options.image;
  const healthUrl = metadata.health_url || `http://localhost:${options.port}/`;
  const httpStatus = readHttpStatus(httpProbe);

  result.health = {
    url: healthUrl,
    status: httpStatus !== null && httpStatus >= 200 && httpStatus < 400 ? 'passed' : fileStatus(path.join(result.diagnostics_dir, 'http-probe.txt')) === 'present' ? 'failed' : 'not_run',
    http_status: httpStatus,
  };
  result.compose = {
    path: composePath,
    status: fileStatus(path.join(result.diagnostics_dir, 'compose.yaml')),
  };
  result.container = {
    name: 'one-person-lab-webui',
    status: fs.existsSync(path.join(result.diagnostics_dir, 'docker-compose-ps.txt')) ? 'captured' : 'not_run',
    id: null,
  };
  result.image = {
    ref: imageRef,
    status: fileStatus(path.join(result.diagnostics_dir, 'docker-image.txt')),
    id: imageIdentity.image_id,
    repo_digests: imageIdentity.repo_digests,
    digest: imageIdentity.digest,
    remote_ref: imageIdentity.remote_ref,
    remote_digest: imageIdentity.remote_digest,
    currentness_status: imageIdentity.currentness_status,
    currentness_evidence_source: imageIdentity.currentness_evidence_source,
    currentness_claim: false,
  };
  result.data_preservation = {
    status: preservation.verdict ? 'passed' : fileStatus(path.join(result.diagnostics_dir, 'data-preservation.txt')) === 'present' ? 'failed' : 'not_run',
    verdict: preservation.verdict ?? null,
    summary: preservation.verdict ? `verdict=${preservation.verdict}` : 'missing data preservation verdict',
  };
}

function attachDiagnosticsReadback(result: GateResult, options: ReturnType<typeof parseArgs>) {
  writeDiagnosticsManifest(result, options);
  refreshDiagnosticsArchive(result);
  const validation = validateDockerWebuiDiagnostics(result.diagnostics_dir);
  readDiagnosticsSummary(result, options, validation.image_identity);
  result.diagnostics_validation = validation;
  result.secret_scan = validation.secret_scan;
  if (validation.preservation_verdict) {
    result.data_preservation = {
      status: 'passed',
      verdict: validation.preservation_verdict,
      summary: `verdict=${validation.preservation_verdict}`,
    };
  }
  return validation;
}

function runInstallGate(result: GateResult, options: ReturnType<typeof parseArgs>): GateResult {
  fs.mkdirSync(result.artifact_dir, { recursive: true });
  const home = path.join(result.artifact_dir, 'home');
  const webuiHome = path.join(home, 'OnePersonLab');
  const dataDir = path.join(webuiHome, 'data');
  const projectsDir = path.join(webuiHome, 'projects');
  const composeFile = path.join(webuiHome, 'compose.yaml');
  const composeProjectName = `opl_webui_${options.gate}_${path.basename(result.artifact_dir).replace(/[^A-Za-z0-9_-]/g, '_')}`;
  fs.mkdirSync(projectsDir, { recursive: true });

  if (options.gate === 'existing_old_onepersonlab_data_dir') {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'preexisting-sentinel.txt'), 'preserve me\n');
  }

  const env = {
    ...process.env,
    COMPOSE_PROJECT_NAME: composeProjectName,
    OPL_WEBUI_HOME: webuiHome,
    OPL_WEBUI_COMPOSE_FILE: composeFile,
    OPL_WEBUI_IMAGE: options.image,
    OPL_WEBUI_DATA_DIR: dataDir,
    OPL_WEBUI_PROJECTS_DIR: projectsDir,
  };
  const diagnosticsArchive = path.join(result.artifact_dir, 'diagnostics.tar.gz');
  result.health.url = `http://localhost:${options.port}/`;
  result.compose.path = composeFile;
  result.image.ref = options.image;
  const args = [
    path.join(appRoot, 'scripts', 'install-docker-webui.sh'),
    '--yes',
    '--port',
    String(options.port),
    '--health-timeout',
    String(options.healthTimeout),
    '--data-dir',
    dataDir,
    '--projects-dir',
    projectsDir,
    '--diagnostics-dir',
    result.diagnostics_dir,
    '--diagnostics-archive',
    diagnosticsArchive,
  ];
  if (options.noOpen) args.push('--no-open');

  const ok = runCommand(result, 'bash', args, appRoot, env);
  result.evidence.compose_yaml = composeFile;
  result.evidence.diagnostics_archive = diagnosticsArchive;
  result.evidence.data_dir = dataDir;
  result.evidence.projects_dir = projectsDir;
  result.evidence.compose_project_name = composeProjectName;
  if (!ok) {
    if (fs.existsSync(result.diagnostics_dir)) {
      attachDiagnosticsReadback(result, options);
    }
    return blocker(
      result,
      'installer_smoke_command_failed',
      'The Docker/WebUI one-click installer did not complete on this host.',
      'Inspect command stdout/stderr and diagnostics, fix the installer/runtime issue, then rerun this same gate.',
    );
  }

  const validation = attachDiagnosticsReadback(result, options);
  collectApiKeyFlowEvidence(result, options);
  if (result.api_key_flow.status !== 'passed') {
    result.status = 'failed';
    return result;
  }
  if (validation.status !== 'passed') {
    result.status = 'failed';
    return result;
  }
  if (options.gate === 'existing_old_onepersonlab_data_dir' && !fs.existsSync(path.join(dataDir, 'preexisting-sentinel.txt'))) {
    return blocker(
      result,
      'old_data_sentinel_missing',
      'The old data directory sentinel was not preserved after installer startup.',
      'Treat as a data preservation regression; do not claim the old-data gate passed until fixed and rerun.',
    );
  }
  result.status = 'passed';
  return result;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.validateResult) {
    const payload = JSON.parse(fs.readFileSync(path.resolve(options.validateResult), 'utf8'));
    const validation = validateDockerWebuiSmokeGateResult(payload);
    const output = `${JSON.stringify(validation, null, 2)}\n`;
    if (options.json) {
      process.stdout.write(output);
    } else {
      console.log(`Docker/WebUI smoke gate result validation: ${validation.status}`);
      if (validation.missing_fields.length > 0) console.log(`Missing fields: ${validation.missing_fields.join(', ')}`);
      if (validation.invalid_fields.length > 0) console.log(`Invalid fields: ${validation.invalid_fields.join(', ')}`);
    }
    if (validation.status !== 'passed') process.exitCode = 1;
    return;
  }
  const artifactDir = path.resolve(options.artifacts);
  fs.mkdirSync(artifactDir, { recursive: true });
  let result = makeResult(options.gate as GateId, artifactDir);
  result.diagnostics_validation = emptyDiagnosticsValidation(result.diagnostics_dir);

  if (options.gate === 'clean_windows_vm' && options.evidence) {
    result = importWindowsEvidenceGate(result, options, {
      emptyDiagnosticsValidation,
      validateApiKeyFlowEvidence,
      readDiagnosticsSummary,
    });
  } else if (options.gate === 'clean_windows_vm') {
    result = blocker(
      result,
      process.platform === 'win32' ? 'windows_vm_runner_not_implemented' : 'requires_windows_vm',
      'This gate must be run inside a clean Windows VM with Docker Desktop/WSL2 readiness evidence.',
      `Run scripts/install-docker-webui.ps1 -Yes in a clean Windows VM with -EvidenceDir and optional -EvidenceArchive, capture api-key-flow-evidence.json through the WebUI configure-codex endpoint, write ${windowsEvidenceManifestName}, then rerun this gate with --evidence <dir-or-zip>.`,
    );
  } else if (options.gate === 'clean_linux_vm' && process.platform !== 'linux') {
    result = blocker(
      result,
      'requires_clean_linux_vm',
      'This gate must be run inside a clean Linux VM; the current host cannot prove it.',
      'Run this script on a clean Linux VM or CI VM where Docker Engine installation/reuse can be observed.',
    );
  } else if (options.gate === 'existing_docker' && !dockerAvailable()) {
    result = blocker(
      result,
      'requires_existing_docker_engine',
      'This gate requires an already-working Docker engine before installer execution.',
      'Start Docker or run on a host with Docker already installed, then rerun the gate.',
    );
  } else if (options.gate === 'existing_old_onepersonlab_data_dir' && !dockerAvailable()) {
    result = blocker(
      result,
      'requires_docker_for_old_data_gate',
      'The old-data preservation gate requires Docker to start the WebUI container and verify preservation evidence.',
      'Run on a Docker-capable host with the old OnePersonLab/data fixture, then rerun the gate.',
    );
  } else {
    result = runInstallGate(result, options);
  }

  const resultPath = path.join(artifactDir, 'docker-webui-smoke-gate-result.json');
  refreshOrdinaryUserStatus(result);
  const resultValidation = validateDockerWebuiSmokeGateResult(result);
  if (resultValidation.status !== 'passed') {
    result.status = 'failed';
    result.evidence.result_schema_validation = JSON.stringify(resultValidation);
    refreshOrdinaryUserStatus(result);
  }
  writeJson(resultPath, result);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    console.log(`Docker/WebUI ${options.gate} gate: ${result.status}`);
    console.log(`Result: ${resultPath}`);
    if (result.blocker) {
      console.log(`Typed blocker: ${result.blocker.code}`);
    }
  }
  if (result.status === 'failed') {
    process.exitCode = 1;
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
