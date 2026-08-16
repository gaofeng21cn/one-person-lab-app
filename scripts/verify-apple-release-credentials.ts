#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';

const requiredSecretNames = [
  'BUILD_CERTIFICATE_BASE64',
  'P12_PASSWORD',
  'APPLE_ID',
  'APPLE_ID_PASSWORD',
  'TEAM_ID',
  'IDENTITY',
] as const;

const fullDmgReferenceSizeBytes = 578_632_392;
const largeDmgCanaryPayloadBytes = 550 * 1024 * 1024;
const largeDmgCanaryMinimumBytes = 520 * 1024 * 1024;
const largeDmgCanaryMaximumBytes = 620 * 1024 * 1024;
const largeDmgCommandTimeoutMs = 20 * 60_000;

type RequiredSecretName = (typeof requiredSecretNames)[number];

type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

type CommandOptions = {
  redactedArgs?: string[];
  sensitiveValues?: string[];
  timeoutMs?: number;
};

export type CommandRunner = (
  command: string,
  args: string[],
  options?: CommandOptions,
) => CommandResult;

type VerifyOptions = {
  outputPath: string;
  largeDmgCanary?: boolean;
  notarySubmissionId?: string;
  largeDmgCanaryPayloadBytes?: number;
  largeDmgCanaryMinimumBytes?: number;
  largeDmgCanaryMaximumBytes?: number;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  runner?: CommandRunner;
  now?: () => Date;
};

type SigningFacts = {
  teamIdentifier: string;
  authorities: string[];
  runtimeVersion: string | null;
  timestamp: string | null;
};

type ImportedDeveloperIdIdentity = {
  sha1: string;
  fullName: string;
};

type GithubExecution = {
  environment: 'github_actions' | 'local';
  admission_eligible: boolean;
  repository: string | null;
  workflow_ref: string | null;
  run_id: string | null;
  run_attempt: number | null;
  event_name: string | null;
  ref: string | null;
  head_sha: string | null;
};

function defaultRunner(command: string, args: string[], options: CommandOptions = {}): CommandResult {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: options.timeoutMs ?? 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  };
}

function sha256File(filePath: string): string {
  const digest = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  const fd = fs.openSync(filePath, 'r');
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) digest.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fd);
  }
  return digest.digest('hex');
}

function writeIncompressiblePayload(filePath: string, sizeBytes: number) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1) {
    throw new Error('Large DMG canary payload size must be a positive safe integer.');
  }
  const buffer = Buffer.allocUnsafe(Math.min(8 * 1024 * 1024, sizeBytes));
  const fd = fs.openSync(filePath, 'wx', 0o600);
  try {
    let written = 0;
    while (written < sizeBytes) {
      const chunkSize = Math.min(buffer.length, sizeBytes - written);
      const chunk = buffer.subarray(0, chunkSize);
      crypto.randomFillSync(chunk);
      let chunkOffset = 0;
      while (chunkOffset < chunk.length) {
        const bytesWritten = fs.writeSync(fd, chunk, chunkOffset, chunk.length - chunkOffset);
        if (bytesWritten < 1) throw new Error('Large DMG canary payload write made no progress.');
        chunkOffset += bytesWritten;
      }
      written += chunkSize;
    }
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function largeDmgFailureType(stage: string, error: unknown): string {
  const timedOut = /ETIMEDOUT|timed out/i.test(error instanceof Error ? error.message : String(error));
  const prefix = stage === 'validate_runner'
    ? 'large_dmg_runner_identity'
    : stage === 'codesign_large_dmg'
    ? 'large_dmg_codesign'
    : stage === 'create_ulmo_dmg'
      ? 'large_dmg_creation'
      : stage === 'prepare_payload'
        ? 'large_dmg_payload'
        : 'large_dmg_signature_verification';
  return `${prefix}_${timedOut ? 'timeout' : 'failed'}`;
}

function writeReceipt(outputPath: string, receipt: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function runLargeDmgCanary(input: {
  runner: CommandRunner;
  tempRoot: string;
  keychainPath: string;
  identity: ImportedDeveloperIdIdentity;
  teamId: string;
  sensitiveValues: string[];
  payloadBytes: number;
  minimumBytes: number;
  maximumBytes: number;
  env: NodeJS.ProcessEnv;
  onStage: (stage: string) => void;
}) {
  input.onStage('validate_runner');
  const runnerArchitecture = input.env.RUNNER_ARCH?.trim() || process.arch;
  if (!['ARM64', 'arm64', 'X64', 'x64'].includes(runnerArchitecture)) {
    throw new Error('Large DMG canary requires a supported macOS GitHub runner architecture.');
  }
  const payloadDirectory = path.join(input.tempRoot, 'large-dmg-canary-payload');
  const payloadPath = path.join(payloadDirectory, 'incompressible-payload.bin');
  const dmgPath = path.join(input.tempRoot, 'large-dmg-timestamp-canary.dmg');
  input.onStage('prepare_payload');
  fs.mkdirSync(payloadDirectory);
  writeIncompressiblePayload(payloadPath, input.payloadBytes);

  input.onStage('create_ulmo_dmg');
  runRequired(
    input.runner,
    'hdiutil',
    [
      'create',
      '-srcfolder',
      payloadDirectory,
      '-fs',
      'HFS+',
      '-format',
      'ULMO',
      '-volname',
      'OPL Timestamp Canary',
      '-ov',
      dmgPath,
    ],
    { timeoutMs: largeDmgCommandTimeoutMs },
  );
  const unsignedDmgSizeBytes = fs.statSync(dmgPath).size;
  if (unsignedDmgSizeBytes < input.minimumBytes || unsignedDmgSizeBytes > input.maximumBytes) {
    throw new Error(
      `Synthetic ULMO DMG size ${unsignedDmgSizeBytes} is outside the required canary range.`,
    );
  }
  const unsignedDmgSha256 = sha256File(dmgPath);

  input.onStage('codesign_large_dmg');
  const signingStartedAt = process.hrtime.bigint();
  runRequired(
    input.runner,
    'codesign',
    [
      '--force',
      '--timestamp',
      '--keychain',
      input.keychainPath,
      '--sign',
      input.identity.sha1,
      dmgPath,
    ],
    {
      redactedArgs: [
        '--force',
        '--timestamp',
        '--keychain',
        input.keychainPath,
        '--sign',
        '<resolved-imported-developer-id>',
        dmgPath,
      ],
      sensitiveValues: input.sensitiveValues,
      timeoutMs: largeDmgCommandTimeoutMs,
    },
  );
  const signingDurationMs = Number((process.hrtime.bigint() - signingStartedAt) / 1_000_000n);

  input.onStage('verify_large_dmg_signature');
  runRequired(
    input.runner,
    'codesign',
    ['--verify', '--strict', '--verbose=2', dmgPath],
    { sensitiveValues: input.sensitiveValues, timeoutMs: largeDmgCommandTimeoutMs },
  );
  const details = runRequired(
    input.runner,
    'codesign',
    ['-dv', '--verbose=4', dmgPath],
    { sensitiveValues: input.sensitiveValues, timeoutMs: largeDmgCommandTimeoutMs },
  );
  const facts = parseSigningFacts(`${details.stdout}\n${details.stderr}`);
  if (!facts.authorities.includes(input.identity.fullName)) {
    throw new Error('Large DMG canary authority does not match the resolved Developer ID identity.');
  }
  if (facts.teamIdentifier !== input.teamId) {
    throw new Error('Large DMG canary TeamIdentifier mismatch.');
  }
  if (!facts.timestamp) {
    throw new Error('Large DMG canary does not contain a trusted timestamp.');
  }

  return {
    requested: true,
    status: 'passed',
    format: 'ULMO',
    timestamp_mode: 'system_default',
    reference_full_dmg_size_bytes: fullDmgReferenceSizeBytes,
    payload_size_bytes: input.payloadBytes,
    unsigned_dmg_size_bytes: unsignedDmgSizeBytes,
    unsigned_dmg_sha256: unsignedDmgSha256,
    signed_dmg_size_bytes: fs.statSync(dmgPath).size,
    signed_dmg_sha256: sha256File(dmgPath),
    signing_duration_ms: signingDurationMs,
    developer_id_application: true,
    trusted_timestamp: true,
    codesign_strict: 'passed',
    runner: {
      label: input.env.OPL_MACOS_RUNNER_LABEL?.trim() || 'macos-latest',
      architecture: runnerArchitecture,
      image_os: input.env.ImageOS?.trim() || null,
      image_version: input.env.ImageVersion?.trim() || null,
    },
    retained_artifact: false,
    notarization_submission_performed: false,
  };
}

function requiredEnv(env: NodeJS.ProcessEnv, name: RequiredSecretName): string {
  const value = env[name]?.trim() || '';
  if (!value) throw new Error(`Missing required GitHub Actions secret: ${name}`);
  return value;
}

export function decodeBase64Strict(value: string): Buffer {
  const normalized = value.replace(/\s+/g, '');
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    throw new Error('BUILD_CERTIFICATE_BASE64 is not valid base64.');
  }
  const decoded = Buffer.from(normalized, 'base64');
  const roundTrip = decoded.toString('base64');
  if (roundTrip !== normalized) {
    throw new Error('BUILD_CERTIFICATE_BASE64 is not canonical base64.');
  }
  return decoded;
}

export function parseSigningFacts(output: string): SigningFacts {
  const teamIdentifier = output.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim() || '';
  const authorities = [...output.matchAll(/^Authority=(.+)$/gm)].map((match) => match[1].trim());
  const runtimeVersion = output.match(/^Runtime Version=(.+)$/m)?.[1]?.trim() || null;
  const timestamp = output.match(/^Timestamp=(.+)$/m)?.[1]?.trim() || null;
  return { teamIdentifier, authorities, runtimeVersion, timestamp };
}

function parseImportedDeveloperIdIdentities(output: string): ImportedDeveloperIdIdentity[] {
  return [...output.matchAll(
    /^\s*\d+\)\s+([0-9a-f]{40})\s+"(Developer ID Application: [^"]+)"$/gim,
  )].map((match) => ({
    sha1: match[1]!.toUpperCase(),
    fullName: match[2]!,
  }));
}

function resolveImportedDeveloperIdIdentity(
  output: string,
  selector: string,
  teamId: string,
): ImportedDeveloperIdIdentity {
  const prefix = 'Developer ID Application: ';
  const identities = parseImportedDeveloperIdIdentities(output);
  if (identities.length === 0) {
    throw new Error('Imported P12 does not expose a Developer ID Application identity.');
  }
  const selectorSha1 = /^[0-9a-f]{40}$/i.test(selector) ? selector.toUpperCase() : null;
  const matches = identities.filter((candidate) => (
    selectorSha1 === candidate.sha1
    || selector === candidate.fullName
    || selector === candidate.fullName.slice(prefix.length)
  ));
  if (matches.length === 0) {
    throw new Error('Configured IDENTITY does not resolve to an imported Developer ID Application identity.');
  }
  if (matches.length > 1) {
    throw new Error('Configured IDENTITY resolves to multiple imported Developer ID Application identities.');
  }
  const resolved = matches[0]!;
  if (!resolved.fullName.endsWith(` (${teamId})`)) {
    throw new Error('Imported Developer ID Application identity Team ID does not match configured TEAM_ID.');
  }
  return resolved;
}

function parseKeychainPaths(output: string, label: string): string[] {
  const paths = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.match(/^"([^"]+)"$/)?.[1] ?? '');
  if (paths.length === 0 || paths.some((entry) => !entry)) {
    throw new Error(`${label} did not return quoted Keychain paths.`);
  }
  return paths;
}

function commandText(command: string, args: string[]) {
  return [command, ...args].map((entry) => JSON.stringify(entry)).join(' ');
}

function redactText(value: string, sensitiveValues: string[] = []) {
  return [...new Set(sensitiveValues)]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .reduce((redacted, secret) => redacted.replaceAll(secret, '<redacted>'), value);
}

function runRequired(
  runner: CommandRunner,
  command: string,
  args: string[],
  options: CommandOptions = {},
) {
  const result = runner(command, args, options);
  if (result.status !== 0) {
    const displayArgs = options.redactedArgs ?? args;
    throw new Error([
      `Command failed: ${commandText(command, displayArgs)}`,
      result.stdout.trim()
        ? `stdout:\n${redactText(result.stdout.trim(), options.sensitiveValues)}`
        : '',
      result.stderr.trim()
        ? `stderr:\n${redactText(result.stderr.trim(), options.sensitiveValues)}`
        : '',
      result.error?.message
        ? `error:\n${redactText(result.error.message, options.sensitiveValues)}`
        : '',
    ].filter(Boolean).join('\n'));
  }
  return result;
}

function parseNotaryHistory(stdout: string) {
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(stdout);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    payload = parsed as Record<string, unknown>;
  } catch {
    throw new Error('Apple notarytool history did not return a JSON object.');
  }
  const entries = Array.isArray(payload.history)
    ? payload.history
    : Array.isArray(payload.submissions)
      ? payload.submissions
      : [];
  return { historyCount: entries.length };
}

function parseNotarySubmissionId(value: string | undefined): string | null {
  const submissionId = value?.trim().toLowerCase() || '';
  if (!submissionId) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(submissionId)) {
    throw new Error('Apple notarization submission ID must be an exact UUID.');
  }
  return submissionId;
}

function parseNotarySubmissionInfo(stdout: string, expectedId: string) {
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(stdout);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    payload = parsed as Record<string, unknown>;
  } catch {
    throw new Error('Apple notarytool info did not return a JSON object.');
  }
  const id = typeof payload.id === 'string' ? payload.id.toLowerCase() : '';
  const status = typeof payload.status === 'string' ? payload.status.trim() : '';
  if (id !== expectedId) throw new Error('Apple notarytool info returned a different submission ID.');
  if (!status) throw new Error('Apple notarytool info returned no submission status.');
  return {
    id,
    status,
    created_at: typeof payload.createdDate === 'string' ? payload.createdDate : null,
    name: typeof payload.name === 'string' ? payload.name : null,
  };
}

function parseNotarySubmissionLog(stdout: string) {
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(stdout);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    payload = parsed as Record<string, unknown>;
  } catch {
    throw new Error('Apple notarytool log did not return a JSON object.');
  }
  return {
    status_code: typeof payload.statusCode === 'number' ? payload.statusCode : null,
    status_summary: typeof payload.statusSummary === 'string' ? payload.statusSummary : null,
    issues: Array.isArray(payload.issues) ? payload.issues : [],
  };
}

function githubExecution(env: NodeJS.ProcessEnv): GithubExecution {
  if (env.GITHUB_ACTIONS !== 'true') {
    return {
      environment: 'local',
      admission_eligible: false,
      repository: null,
      workflow_ref: null,
      run_id: null,
      run_attempt: null,
      event_name: null,
      ref: null,
      head_sha: null,
    };
  }
  const repository = env.GITHUB_REPOSITORY?.trim() || '';
  const workflowRef = env.GITHUB_WORKFLOW_REF?.trim() || '';
  const runId = env.GITHUB_RUN_ID?.trim() || '';
  const runAttemptText = env.GITHUB_RUN_ATTEMPT?.trim() || '';
  const eventName = env.GITHUB_EVENT_NAME?.trim() || '';
  const ref = env.GITHUB_REF?.trim() || '';
  const headSha = env.GITHUB_SHA?.trim().toLowerCase() || '';
  const runAttempt = Number(runAttemptText);
  if (
    repository !== 'gaofeng21cn/one-person-lab-app'
    || !workflowRef.includes('/.github/workflows/')
    || !/^[1-9][0-9]*$/.test(runId)
    || runAttempt !== 1
    || eventName !== 'workflow_dispatch'
    || ref !== 'refs/heads/main'
    || !/^[0-9a-f]{40}$/.test(headSha)
  ) {
    throw new Error(
      'GitHub Apple credential preflight must be a first-attempt workflow_dispatch on canonical App main.',
    );
  }
  return {
    environment: 'github_actions',
    admission_eligible: true,
    repository,
    workflow_ref: workflowRef,
    run_id: runId,
    run_attempt: runAttempt,
    event_name: eventName,
    ref,
    head_sha: headSha,
  };
}

export function verifyAppleReleaseCredentials(options: VerifyOptions) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const runner = options.runner ?? defaultRunner;
  const now = options.now ?? (() => new Date());
  const notarySubmissionId = parseNotarySubmissionId(options.notarySubmissionId);
  if (platform !== 'darwin') {
    throw new Error('Apple release credential preflight requires a macOS runner.');
  }

  const secrets = Object.fromEntries(
    requiredSecretNames.map((name) => [name, requiredEnv(env, name)]),
  ) as Record<RequiredSecretName, string>;
  if (secrets.IDENTITY === '-') {
    throw new Error('IDENTITY must select a Developer ID Application certificate; ad-hoc signing is forbidden.');
  }
  const execution = githubExecution(env);
  const certificateBytes = decodeBase64Strict(secrets.BUILD_CERTIFICATE_BASE64);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-apple-credential-preflight-'));
  const keychainPath = path.join(tempRoot, 'preflight.keychain-db');
  const certificatePath = path.join(tempRoot, 'certificate.p12');
  const probePath = path.join(tempRoot, 'codesign-probe');
  const keychainPassword = crypto.randomBytes(32).toString('hex');
  let keychainCreated = false;
  let originalUserKeychains: string[] | null = null;
  let originalDefaultKeychain: string | null = null;
  let keychainStateRestored = false;

  try {
    fs.writeFileSync(certificatePath, certificateBytes, { mode: 0o600 });
    runRequired(runner, 'security', ['create-keychain', '-p', keychainPassword, keychainPath], {
      redactedArgs: ['create-keychain', '-p', '<redacted>', keychainPath],
      sensitiveValues: [keychainPassword],
    });
    keychainCreated = true;
    runRequired(runner, 'security', ['unlock-keychain', '-p', keychainPassword, keychainPath], {
      redactedArgs: ['unlock-keychain', '-p', '<redacted>', keychainPath],
      sensitiveValues: [keychainPassword],
    });
    runRequired(runner, 'security', ['set-keychain-settings', '-lut', '900', keychainPath]);
    originalUserKeychains = parseKeychainPaths(
      runRequired(runner, 'security', ['list-keychains', '-d', 'user']).stdout,
      'security list-keychains',
    );
    const defaultKeychains = parseKeychainPaths(
      runRequired(runner, 'security', ['default-keychain', '-d', 'user']).stdout,
      'security default-keychain',
    );
    if (defaultKeychains.length !== 1) {
      throw new Error('security default-keychain did not return exactly one Keychain path.');
    }
    originalDefaultKeychain = defaultKeychains[0]!;
    runRequired(
      runner,
      'security',
      ['list-keychains', '-d', 'user', '-s', keychainPath, ...originalUserKeychains],
    );
    runRequired(
      runner,
      'security',
      ['default-keychain', '-d', 'user', '-s', keychainPath],
    );
    runRequired(
      runner,
      'security',
      ['import', certificatePath, '-k', keychainPath, '-P', secrets.P12_PASSWORD, '-T', '/usr/bin/codesign'],
      {
        redactedArgs: [
          'import',
          certificatePath,
          '-k',
          keychainPath,
          '-P',
          '<redacted>',
          '-T',
          '/usr/bin/codesign',
        ],
        sensitiveValues: [secrets.P12_PASSWORD, secrets.IDENTITY],
      },
    );
    runRequired(
      runner,
      'security',
      ['set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', keychainPassword, keychainPath],
      {
        redactedArgs: [
          'set-key-partition-list',
          '-S',
          'apple-tool:,apple:,codesign:',
          '-s',
          '-k',
          '<redacted>',
          keychainPath,
        ],
        sensitiveValues: [keychainPassword],
      },
    );

    const identities = runRequired(
      runner,
      'security',
      ['find-identity', '-v', '-p', 'codesigning', keychainPath],
      { sensitiveValues: [secrets.IDENTITY] },
    );
    const resolvedIdentity = resolveImportedDeveloperIdIdentity(
      identities.stdout,
      secrets.IDENTITY,
      secrets.TEAM_ID,
    );
    const identitySensitiveValues = [
      resolvedIdentity.fullName,
      resolvedIdentity.sha1,
      resolvedIdentity.sha1.toLowerCase(),
      ...Object.values(secrets),
    ];

    fs.copyFileSync('/usr/bin/true', probePath);
    fs.chmodSync(probePath, 0o755);
    runRequired(
      runner,
      'codesign',
      [
        '--force',
        '--timestamp',
        '--options',
        'runtime',
        '--keychain',
        keychainPath,
        '--sign',
        resolvedIdentity.sha1,
        probePath,
      ],
      {
        redactedArgs: [
          '--force',
          '--timestamp',
          '--options',
          'runtime',
          '--keychain',
          keychainPath,
          '--sign',
          '<resolved-imported-developer-id>',
          probePath,
        ],
        sensitiveValues: identitySensitiveValues,
      },
    );
    runRequired(
      runner,
      'codesign',
      ['--verify', '--strict', '--verbose=2', probePath],
      { sensitiveValues: identitySensitiveValues },
    );
    const details = runRequired(
      runner,
      'codesign',
      ['-dv', '--verbose=4', probePath],
      { sensitiveValues: identitySensitiveValues },
    );
    const signingFacts = parseSigningFacts(`${details.stdout}\n${details.stderr}`);
    if (!signingFacts.authorities.includes(resolvedIdentity.fullName)) {
      throw new Error('Signed probe authority does not match the resolved Developer ID Application identity.');
    }
    if (signingFacts.teamIdentifier !== secrets.TEAM_ID) {
      throw new Error('Imported Developer ID TeamIdentifier mismatch.');
    }
    if (!signingFacts.runtimeVersion) {
      throw new Error('Signed probe does not contain the hardened runtime flag.');
    }
    if (!signingFacts.timestamp) {
      throw new Error('Signed probe does not contain a trusted timestamp.');
    }
    let largeDmgCanary: Record<string, unknown> = {
      requested: options.largeDmgCanary === true,
      status: options.largeDmgCanary === true ? 'pending' : 'not_requested',
      timestamp_mode: 'system_default',
      reference_full_dmg_size_bytes: fullDmgReferenceSizeBytes,
      runner: {
        label: env.OPL_MACOS_RUNNER_LABEL?.trim() || 'macos-latest',
        architecture: env.RUNNER_ARCH?.trim() || process.arch,
        image_os: env.ImageOS?.trim() || null,
        image_version: env.ImageVersion?.trim() || null,
      },
      retained_artifact: false,
      notarization_submission_performed: false,
    };
    if (options.largeDmgCanary === true) {
      let largeDmgStage = 'prepare_payload';
      try {
        largeDmgCanary = runLargeDmgCanary({
          runner,
          tempRoot,
          keychainPath,
          identity: resolvedIdentity,
          teamId: secrets.TEAM_ID,
          sensitiveValues: identitySensitiveValues,
          payloadBytes: options.largeDmgCanaryPayloadBytes ?? largeDmgCanaryPayloadBytes,
          minimumBytes: options.largeDmgCanaryMinimumBytes ?? largeDmgCanaryMinimumBytes,
          maximumBytes: options.largeDmgCanaryMaximumBytes ?? largeDmgCanaryMaximumBytes,
          env,
          onStage: (stage) => { largeDmgStage = stage; },
        });
      } catch (error) {
        largeDmgCanary = {
          ...largeDmgCanary,
          status: 'failed',
          failure: {
            type: largeDmgFailureType(largeDmgStage, error),
            stage: largeDmgStage,
            retry_disposition: 'diagnose_before_new_canary_run_no_rerun',
          },
        };
        writeReceipt(options.outputPath, {
          schema: 'opl_apple_release_credentials_preflight.v1',
          status: 'failed',
          checked_at: now().toISOString(),
          platform: 'darwin',
          protected_environment: 'release-stable',
          execution,
          required_secret_names: [...requiredSecretNames],
          required_secret_count: requiredSecretNames.length,
          signing: {
            configured_identity_selector_resolved: true,
            configured_team_id_match: true,
            developer_id_application: true,
            hardened_runtime: true,
            trusted_timestamp: true,
            probe_codesign_strict: 'passed',
            large_dmg_canary: largeDmgCanary,
          },
          notarization: {
            authentication: 'not_checked_after_large_dmg_failure',
            command: 'xcrun notarytool history',
            history_count: null,
            submission_performed: false,
          },
          mutation: {
            release_dispatch_performed: false,
            notarization_submission_performed: false,
            public_asset_write_performed: false,
          },
          truth_boundary: 'protected_large_dmg_signing_canary_not_release_or_artifact_qualification',
        });
        throw error;
      }
    }
    runRequired(
      runner,
      'security',
      ['list-keychains', '-d', 'user', '-s', ...originalUserKeychains],
    );
    runRequired(
      runner,
      'security',
      ['default-keychain', '-d', 'user', '-s', originalDefaultKeychain],
    );
    keychainStateRestored = true;

    const notary = runRequired(
      runner,
      'xcrun',
      [
        'notarytool',
        'history',
        '--apple-id',
        secrets.APPLE_ID,
        '--password',
        secrets.APPLE_ID_PASSWORD,
        '--team-id',
        secrets.TEAM_ID,
        '--output-format',
        'json',
      ],
      {
        redactedArgs: [
          'notarytool',
          'history',
          '--apple-id',
          '<redacted>',
          '--password',
          '<redacted>',
          '--team-id',
          '<redacted>',
          '--output-format',
          'json',
        ],
        sensitiveValues: [secrets.APPLE_ID, secrets.APPLE_ID_PASSWORD, secrets.TEAM_ID],
      },
    );
    const notaryHistory = parseNotaryHistory(notary.stdout);
    let submissionReconcile: Record<string, unknown> = {
      requested: false,
      submission_id: null,
      apple_status: null,
      log_fetched: false,
      read_only: true,
    };
    if (notarySubmissionId) {
      const credentialArgs = [
        '--apple-id',
        secrets.APPLE_ID,
        '--password',
        secrets.APPLE_ID_PASSWORD,
        '--team-id',
        secrets.TEAM_ID,
      ];
      const redactedCredentialArgs = [
        '--apple-id',
        '<redacted>',
        '--password',
        '<redacted>',
        '--team-id',
        '<redacted>',
      ];
      const info = parseNotarySubmissionInfo(runRequired(
        runner,
        'xcrun',
        ['notarytool', 'info', notarySubmissionId, ...credentialArgs, '--output-format', 'json'],
        {
          redactedArgs: ['notarytool', 'info', notarySubmissionId, ...redactedCredentialArgs, '--output-format', 'json'],
          sensitiveValues: [secrets.APPLE_ID, secrets.APPLE_ID_PASSWORD, secrets.TEAM_ID],
        },
      ).stdout, notarySubmissionId);
      submissionReconcile = {
        requested: true,
        submission_id: info.id,
        apple_status: info.status,
        created_at: info.created_at,
        name: info.name,
        log_fetched: false,
        log: null,
        read_only: true,
      };
      if (info.status === 'Invalid' || info.status === 'Rejected') {
        const log = parseNotarySubmissionLog(runRequired(
          runner,
          'xcrun',
          ['notarytool', 'log', notarySubmissionId, ...credentialArgs],
          {
            redactedArgs: ['notarytool', 'log', notarySubmissionId, ...redactedCredentialArgs],
            sensitiveValues: [secrets.APPLE_ID, secrets.APPLE_ID_PASSWORD, secrets.TEAM_ID],
          },
        ).stdout);
        submissionReconcile = { ...submissionReconcile, log_fetched: true, log };
      }
    }
    const receipt = {
      schema: 'opl_apple_release_credentials_preflight.v1',
      status: 'passed',
      checked_at: now().toISOString(),
      platform: 'darwin',
      protected_environment: 'release-stable',
      execution,
      required_secret_names: [...requiredSecretNames],
      required_secret_count: requiredSecretNames.length,
      signing: {
        configured_identity_selector_resolved: true,
        configured_team_id_match: true,
        developer_id_application: true,
        hardened_runtime: true,
        trusted_timestamp: true,
        probe_codesign_strict: 'passed',
        large_dmg_canary: largeDmgCanary,
      },
      notarization: {
        authentication: 'passed',
        command: 'xcrun notarytool history',
        history_count: notaryHistory.historyCount,
        submission_performed: false,
        submission_reconcile: submissionReconcile,
      },
      mutation: {
        release_dispatch_performed: false,
        notarization_submission_performed: false,
        notarization_resume_performed: false,
        notarization_staple_performed: false,
        public_asset_write_performed: false,
      },
      truth_boundary: execution.admission_eligible
        ? 'canonical_main_credential_runtime_preflight_not_release_or_artifact_qualification'
        : 'local_credential_runtime_diagnostic_not_dispatch_admission',
    };
    writeReceipt(options.outputPath, receipt);
    return receipt;
  } finally {
    if (originalUserKeychains && originalDefaultKeychain && !keychainStateRestored) {
      runner('security', ['list-keychains', '-d', 'user', '-s', ...originalUserKeychains]);
      runner('security', ['default-keychain', '-d', 'user', '-s', originalDefaultKeychain]);
    }
    if (keychainCreated) {
      runner('security', ['delete-keychain', keychainPath]);
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function cliOptions() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      output: { type: 'string' },
      'large-dmg-canary': { type: 'boolean', default: false },
      'notary-submission-id': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!values.output) throw new Error('Pass --output <receipt.json>.');
  return {
    outputPath: path.resolve(values.output),
    largeDmgCanary: values['large-dmg-canary'],
    notarySubmissionId: values['notary-submission-id'],
  };
}

const isMain = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMain) {
  try {
    const receipt = verifyAppleReleaseCredentials(cliOptions());
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } catch {
    console.error('Apple release credential verification failed.');
    process.exit(1);
  }
}
