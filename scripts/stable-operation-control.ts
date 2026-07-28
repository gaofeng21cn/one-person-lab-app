#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

type JsonRecord = Record<string, unknown>;

const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const runIdPattern = /^[1-9][0-9]*$/;
const noncePattern = /^[0-9a-f]{32}$/;
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const requiredCriticalBlobPaths = [
  '.github/workflows/release-stable.yml',
  '.github/workflows/release-source-qualification.yml',
  '.github/workflows/_release-bundle.yml',
  '.github/workflows/_release-standard-publish.yml',
  '.github/workflows/_release-full-addon.yml',
  '.github/workflows/_release-webui-carrier.yml',
  '.github/workflows/release-webui-publication-promote.yml',
  'contracts/app-release-channel.json',
] as const;

export type StableOperationControl = {
  schema: 'opl_app_stable_operation_control.v1';
  status: 'admitted';
  operation: 'standard';
  operation_id: string;
  actor: string;
  run_id: string;
  run_attempt: 1;
  nonce: string;
  nonce_digest: string;
  consumed_once: false;
  cohort: {
    app_sha: string;
    shell_sha: string;
    framework_sha: string;
  };
  critical_blobs: Record<string, string>;
  source_gate_digest: string;
  pre_nonce_guard_digest: string;
  authority_digest: string;
  issued_authority: {
    authority_id: string;
    issuer: string;
    issued_at: string;
    expires_at: string;
    objective_fingerprint: string;
    digest: string;
  };
};

export type StableOperationAuthority = {
  schema: 'opl_app_stable_operation_authority.v1';
  status: 'issued';
  issuance: {
    source: 'operator_issued_github_dispatch_input';
    cryptographic_signature: false;
  };
  authority_id: string;
  operation: 'standard';
  operation_id: string;
  issuer: string;
  issued_at: string;
  expires_at: string;
  objective_fingerprint: string;
  nonce: string;
  nonce_digest: string;
  cohort: {
    app_sha: string;
    shell_sha: string;
    framework_sha: string;
  };
  critical_blobs: Record<string, string>;
  source_gate_digest: string;
  pre_nonce_guard_digest: string;
  authority_digest: string;
};

export type StableOperationConsumption = {
  schema: 'opl_app_stable_operation_consumption.v1';
  status: 'consumed';
  operation: 'standard';
  operation_id: string;
  control_authority_digest: string;
  run_id: string;
  run_attempt: 1;
  nonce_digest: string;
  consumed_once: true;
  consumption_digest: string;
};

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be one JSON object.`);
  }
  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing.`);
  return value.trim();
}

function exactSha(value: unknown, label: string): string {
  const normalized = text(value, label).toLowerCase();
  if (!shaPattern.test(normalized)) throw new Error(`${label} must be an exact Git commit SHA.`);
  return normalized;
}

function digest(value: unknown, label: string): string {
  const normalized = text(value, label).toLowerCase();
  if (!digestPattern.test(normalized)) throw new Error(`${label} must be an exact SHA-256 digest.`);
  return normalized;
}

function runId(value: unknown, label: string): string {
  const normalized = text(value, label);
  if (!runIdPattern.test(normalized)) throw new Error(`${label} must be a positive GitHub run id.`);
  return normalized;
}

function runAttempt(value: unknown, label: string): 1 {
  if (Number(value) !== 1) throw new Error(`${label} must equal 1.`);
  return 1;
}

function nonce(value: unknown, label: string): string {
  const normalized = text(value, label).toLowerCase();
  if (!noncePattern.test(normalized)) throw new Error(`${label} must be 16 random bytes encoded in lowercase hex.`);
  return normalized;
}

function operationId(value: unknown): string {
  const normalized = text(value, 'operation_id');
  if (!operationIdPattern.test(normalized)) throw new Error('operation_id is not canonical.');
  return normalized;
}

function isoInstant(value: unknown, label: string): string {
  const normalized = text(value, label);
  if (!Number.isFinite(Date.parse(normalized)) || !/Z$/.test(normalized)) {
    throw new Error(`${label} must be an ISO-8601 UTC instant.`);
  }
  return normalized;
}

function objectiveFingerprint(value: unknown): string {
  const normalized = text(value, 'objective_fingerprint');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/.test(normalized)) {
    throw new Error('objective_fingerprint is not canonical.');
  }
  return normalized;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const item = value as JsonRecord;
  return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(item[key])}`).join(',')}}`;
}

function objectDigest(value: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function normalizedCriticalBlobs(value: unknown): Record<string, string> {
  const blobs = record(value, 'critical_blobs');
  const entries = Object.entries(blobs)
    .map(([file, blob]) => [text(file, 'critical_blobs path'), digest(blob, `critical_blobs.${file}`)] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) throw new Error('critical_blobs must bind at least one workflow or contract blob.');
  for (const [file] of entries) {
    if (!/^(?:\.github\/workflows\/|contracts\/)[A-Za-z0-9._/-]+$/.test(file) || file.includes('..')) {
      throw new Error(`critical_blobs path is not allowed: ${file}`);
    }
  }
  const normalized = Object.fromEntries(entries);
  const expected = new Set(requiredCriticalBlobPaths);
  if (
    Object.keys(normalized).length !== expected.size
    || requiredCriticalBlobPaths.some((file) => normalized[file] === undefined)
  ) {
    throw new Error(
      `critical_blobs must bind exactly the Stable control paths: ${requiredCriticalBlobPaths.join(', ')}.`,
    );
  }
  return normalized;
}

function nonceDigest(value: string): string {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function bytesDigest(bytes: Buffer): string {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function assertAuthorityMatchesControl(
  authority: StableOperationAuthority,
  control: {
    operation_id: string;
    actor: string;
    nonce: string;
    cohort: StableOperationAuthority['cohort'];
    critical_blobs: Record<string, string>;
    source_gate_digest: string;
    pre_nonce_guard_digest: string;
  },
): void {
  if (authority.operation_id !== control.operation_id) {
    throw new Error('Pre-dispatch authority operation_id does not match the run-bound control.');
  }
  if (authority.issuer !== control.actor) {
    throw new Error('Pre-dispatch authority issuer does not match the run-bound control actor.');
  }
  if (authority.nonce !== control.nonce) {
    throw new Error('Pre-dispatch authority nonce does not match the run-bound control.');
  }
  if (
    canonicalJson(authority.cohort) !== canonicalJson(control.cohort)
    || canonicalJson(authority.critical_blobs) !== canonicalJson(control.critical_blobs)
  ) {
    throw new Error('Pre-dispatch authority cohort or critical blob bindings do not match the run-bound control.');
  }
  if (
    authority.source_gate_digest !== control.source_gate_digest
    || authority.pre_nonce_guard_digest !== control.pre_nonce_guard_digest
  ) {
    throw new Error('Pre-dispatch authority source-gate or pre-nonce guard digest does not match the run-bound control.');
  }
}

export function createStableOperationControl(input: {
  operationId: string;
  actor: string;
  runId: string;
  runAttempt: number;
  nonce: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  criticalBlobs: unknown;
  sourceGateDigest: string;
  preNonceGuardDigest: string;
  issuedAuthority: StableOperationAuthority;
}): StableOperationControl {
  const issuedAuthority = validateStableOperationAuthority(input.issuedAuthority);
  const authority = {
    schema: 'opl_app_stable_operation_control.v1' as const,
    status: 'admitted' as const,
    operation: 'standard' as const,
    operation_id: operationId(input.operationId),
    actor: text(input.actor, 'actor'),
    run_id: runId(input.runId, 'run_id'),
    run_attempt: runAttempt(input.runAttempt, 'run_attempt'),
    nonce: nonce(input.nonce, 'nonce'),
    nonce_digest: '',
    consumed_once: false as const,
    cohort: {
      app_sha: exactSha(input.appSha, 'cohort.app_sha'),
      shell_sha: exactSha(input.shellSha, 'cohort.shell_sha'),
      framework_sha: exactSha(input.frameworkSha, 'cohort.framework_sha'),
    },
    critical_blobs: normalizedCriticalBlobs(input.criticalBlobs),
    source_gate_digest: digest(input.sourceGateDigest, 'source_gate_digest'),
    pre_nonce_guard_digest: digest(input.preNonceGuardDigest, 'pre_nonce_guard_digest'),
  };
  authority.nonce_digest = nonceDigest(authority.nonce);
  assertAuthorityMatchesControl(issuedAuthority, authority);
  const control = {
    ...authority,
    issued_authority: {
      authority_id: issuedAuthority.authority_id,
      issuer: issuedAuthority.issuer,
      issued_at: issuedAuthority.issued_at,
      expires_at: issuedAuthority.expires_at,
      objective_fingerprint: issuedAuthority.objective_fingerprint,
      digest: issuedAuthority.authority_digest,
    },
  };
  return { ...control, authority_digest: objectDigest(control) };
}

export function validateStableOperationControl(value: unknown): StableOperationControl {
  const control = record(value, 'Stable operation control');
  if (control.schema !== 'opl_app_stable_operation_control.v1') throw new Error('Stable operation control schema is invalid.');
  if (control.status !== 'admitted' || control.operation !== 'standard') {
    throw new Error('Stable operation control is not an admitted Standard operation.');
  }
  if (control.consumed_once !== false) throw new Error('Stable operation control must be an unconsumed admission record.');
  const issuedAuthority = validateStableOperationAuthorityReference(control.issued_authority);
  const created = createStableOperationControl({
    operationId: operationId(control.operation_id),
    actor: text(control.actor, 'actor'),
    runId: runId(control.run_id, 'run_id'),
    runAttempt: runAttempt(control.run_attempt, 'run_attempt'),
    nonce: nonce(control.nonce, 'nonce'),
    appSha: exactSha(record(control.cohort, 'cohort').app_sha, 'cohort.app_sha'),
    shellSha: exactSha(record(control.cohort, 'cohort').shell_sha, 'cohort.shell_sha'),
    frameworkSha: exactSha(record(control.cohort, 'cohort').framework_sha, 'cohort.framework_sha'),
    criticalBlobs: control.critical_blobs,
    sourceGateDigest: digest(control.source_gate_digest, 'source_gate_digest'),
    preNonceGuardDigest: digest(control.pre_nonce_guard_digest, 'pre_nonce_guard_digest'),
    issuedAuthority: {
      schema: 'opl_app_stable_operation_authority.v1',
      status: 'issued',
      issuance: {
        source: 'operator_issued_github_dispatch_input',
        cryptographic_signature: false,
      },
      authority_id: issuedAuthority.authority_id,
      operation: 'standard',
      operation_id: operationId(control.operation_id),
      issuer: issuedAuthority.issuer,
      issued_at: issuedAuthority.issued_at,
      expires_at: issuedAuthority.expires_at,
      objective_fingerprint: issuedAuthority.objective_fingerprint,
      nonce: nonce(control.nonce, 'nonce'),
      nonce_digest: nonceDigest(nonce(control.nonce, 'nonce')),
      cohort: {
        app_sha: exactSha(record(control.cohort, 'cohort').app_sha, 'cohort.app_sha'),
        shell_sha: exactSha(record(control.cohort, 'cohort').shell_sha, 'cohort.shell_sha'),
        framework_sha: exactSha(record(control.cohort, 'cohort').framework_sha, 'cohort.framework_sha'),
      },
      critical_blobs: normalizedCriticalBlobs(control.critical_blobs),
      source_gate_digest: digest(control.source_gate_digest, 'source_gate_digest'),
      pre_nonce_guard_digest: digest(control.pre_nonce_guard_digest, 'pre_nonce_guard_digest'),
      authority_digest: issuedAuthority.digest,
    },
  });
  if (control.nonce_digest !== created.nonce_digest || control.authority_digest !== created.authority_digest) {
    throw new Error('Stable operation control digest binding is invalid.');
  }
  return created;
}

function validateStableOperationAuthorityReference(value: unknown): NonNullable<StableOperationControl['issued_authority']> {
  const authority = record(value, 'issued_authority');
  return {
    authority_id: operationId(authority.authority_id),
    issuer: text(authority.issuer, 'issued_authority.issuer'),
    issued_at: isoInstant(authority.issued_at, 'issued_authority.issued_at'),
    expires_at: isoInstant(authority.expires_at, 'issued_authority.expires_at'),
    objective_fingerprint: objectiveFingerprint(authority.objective_fingerprint),
    digest: digest(authority.digest, 'issued_authority.digest'),
  };
}

export function createStableOperationAuthority(input: {
  authorityId: string;
  operationId: string;
  issuer: string;
  issuedAt: string;
  expiresAt: string;
  objectiveFingerprint: string;
  nonce: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  criticalBlobs: unknown;
  sourceGateDigest: string;
  preNonceGuardDigest: string;
}): StableOperationAuthority {
  const authority = {
    schema: 'opl_app_stable_operation_authority.v1' as const,
    status: 'issued' as const,
    issuance: {
      source: 'operator_issued_github_dispatch_input' as const,
      cryptographic_signature: false as const,
    },
    authority_id: operationId(input.authorityId),
    operation: 'standard' as const,
    operation_id: operationId(input.operationId),
    issuer: text(input.issuer, 'issuer'),
    issued_at: isoInstant(input.issuedAt, 'issued_at'),
    expires_at: isoInstant(input.expiresAt, 'expires_at'),
    objective_fingerprint: objectiveFingerprint(input.objectiveFingerprint),
    nonce: nonce(input.nonce, 'nonce'),
    nonce_digest: '',
    cohort: {
      app_sha: exactSha(input.appSha, 'cohort.app_sha'),
      shell_sha: exactSha(input.shellSha, 'cohort.shell_sha'),
      framework_sha: exactSha(input.frameworkSha, 'cohort.framework_sha'),
    },
    critical_blobs: normalizedCriticalBlobs(input.criticalBlobs),
    source_gate_digest: digest(input.sourceGateDigest, 'source_gate_digest'),
    pre_nonce_guard_digest: digest(input.preNonceGuardDigest, 'pre_nonce_guard_digest'),
  };
  if (Date.parse(authority.expires_at) <= Date.parse(authority.issued_at)) {
    throw new Error('expires_at must be later than issued_at.');
  }
  authority.nonce_digest = nonceDigest(authority.nonce);
  return { ...authority, authority_digest: objectDigest(authority) };
}

export function validateStableOperationAuthority(value: unknown): StableOperationAuthority {
  const authority = record(value, 'Stable operation authority');
  if (authority.schema !== 'opl_app_stable_operation_authority.v1' || authority.status !== 'issued') {
    throw new Error('Stable operation authority schema or status is invalid.');
  }
  const issuance = record(authority.issuance, 'authority.issuance');
  if (
    issuance.source !== 'operator_issued_github_dispatch_input'
    || issuance.cryptographic_signature !== false
  ) {
    throw new Error('Stable operation authority must declare an operator-issued, non-cryptographic dispatch input.');
  }
  const created = createStableOperationAuthority({
    authorityId: operationId(authority.authority_id),
    operationId: operationId(authority.operation_id),
    issuer: text(authority.issuer, 'issuer'),
    issuedAt: isoInstant(authority.issued_at, 'issued_at'),
    expiresAt: isoInstant(authority.expires_at, 'expires_at'),
    objectiveFingerprint: objectiveFingerprint(authority.objective_fingerprint),
    nonce: nonce(authority.nonce, 'nonce'),
    appSha: exactSha(record(authority.cohort, 'cohort').app_sha, 'cohort.app_sha'),
    shellSha: exactSha(record(authority.cohort, 'cohort').shell_sha, 'cohort.shell_sha'),
    frameworkSha: exactSha(record(authority.cohort, 'cohort').framework_sha, 'cohort.framework_sha'),
    criticalBlobs: authority.critical_blobs,
    sourceGateDigest: digest(authority.source_gate_digest, 'source_gate_digest'),
    preNonceGuardDigest: digest(authority.pre_nonce_guard_digest, 'pre_nonce_guard_digest'),
  });
  if (authority.nonce_digest !== created.nonce_digest || authority.authority_digest !== created.authority_digest) {
    throw new Error('Stable operation authority digest binding is invalid.');
  }
  return created;
}

export function encodeStableOperationAuthorityCarrier(value: unknown): string {
  const authority = validateStableOperationAuthority(value);
  return Buffer.from(canonicalJson(authority), 'utf8').toString('base64url');
}

export function decodeStableOperationAuthorityCarrier(input: {
  carrier: string;
  authorityDigest: string;
  authorityId: string;
}): StableOperationAuthority {
  const carrier = text(input.carrier, 'authority_carrier');
  if (!/^[A-Za-z0-9_-]+$/.test(carrier)) {
    throw new Error('authority_carrier must be unpadded canonical base64url.');
  }
  let decoded: string;
  try {
    decoded = Buffer.from(carrier, 'base64url').toString('utf8');
  } catch {
    throw new Error('authority_carrier cannot be decoded.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error('authority_carrier must contain one JSON object.');
  }
  const authority = validateStableOperationAuthority(parsed);
  if (decoded !== canonicalJson(authority) || encodeStableOperationAuthorityCarrier(authority) !== carrier) {
    throw new Error('authority_carrier must contain the canonical authority JSON bytes.');
  }
  if (authority.authority_digest !== digest(input.authorityDigest, 'authority_digest')) {
    throw new Error('authority_carrier digest does not match authority_digest.');
  }
  if (authority.authority_id !== operationId(input.authorityId)) {
    throw new Error('authority_carrier authority_id does not match authority_id.');
  }
  return authority;
}

function validateCriticalBlobBytes(
  appRoot: string,
  criticalBlobs: Record<string, string>,
): void {
  const root = path.resolve(appRoot);
  for (const [relativePath, expectedDigest] of Object.entries(criticalBlobs)) {
    const candidate = path.resolve(root, relativePath);
    if (!candidate.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Stable operation critical blob escapes the App root: ${relativePath}`);
    }
    const stat = fs.lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Stable operation critical blob must be a regular file: ${relativePath}`);
    }
    if (bytesDigest(fs.readFileSync(candidate)) !== expectedDigest) {
      throw new Error(`Stable operation critical blob drifted: ${relativePath}`);
    }
  }
}

export function validateStableOperationAuthorityRuntimeBinding(input: {
  authority: unknown;
  appRoot: string;
  expectedActor: string;
  expectedAppSha: string;
}): StableOperationAuthority {
  const authority = validateStableOperationAuthority(input.authority);
  if (authority.issuer !== text(input.expectedActor, 'expected_actor')) {
    throw new Error('Pre-dispatch authority issuer does not match the dispatch actor.');
  }
  if (authority.cohort.app_sha !== exactSha(input.expectedAppSha, 'expected_app_sha')) {
    throw new Error('Pre-dispatch authority App cohort does not match the workflow App commit.');
  }
  validateCriticalBlobBytes(input.appRoot, authority.critical_blobs);
  return authority;
}

export function bindStableOperationAuthority(input: {
  authority: unknown;
  authorityDigest: string;
  actor: string;
  runId: string;
  runAttempt: number;
  sourceGateDigest: string;
  preNonceGuardDigest: string;
  now?: string;
}): StableOperationControl {
  const authority = validateStableOperationAuthority(input.authority);
  if (authority.authority_digest !== digest(input.authorityDigest, 'authority_digest')) {
    throw new Error('Pre-dispatch authority digest does not match the supplied authority carrier.');
  }
  if (authority.issuer !== text(input.actor, 'actor')) {
    throw new Error('Pre-dispatch authority issuer does not match the dispatch actor.');
  }
  const now = isoInstant(input.now ?? new Date().toISOString(), 'now');
  if (Date.parse(now) < Date.parse(authority.issued_at) || Date.parse(now) >= Date.parse(authority.expires_at)) {
    throw new Error('Pre-dispatch authority is not currently valid.');
  }
  if (authority.source_gate_digest !== digest(input.sourceGateDigest, 'source_gate_digest')) {
    throw new Error('Pre-dispatch authority source-gate digest does not match the run-bound gate evidence.');
  }
  if (authority.pre_nonce_guard_digest !== digest(input.preNonceGuardDigest, 'pre_nonce_guard_digest')) {
    throw new Error('Pre-dispatch authority pre-nonce guard digest does not match the run-bound guard evidence.');
  }
  return createStableOperationControl({
    operationId: authority.operation_id,
    actor: authority.issuer,
    runId: input.runId,
    runAttempt: input.runAttempt,
    nonce: authority.nonce,
    appSha: authority.cohort.app_sha,
    shellSha: authority.cohort.shell_sha,
    frameworkSha: authority.cohort.framework_sha,
    criticalBlobs: authority.critical_blobs,
    sourceGateDigest: input.sourceGateDigest,
    preNonceGuardDigest: input.preNonceGuardDigest,
    issuedAuthority: authority,
  });
}

export function consumeStableOperationControl(input: {
  control: unknown;
  operationId: string;
  runId: string;
  runAttempt: number;
  nonce: string;
}): StableOperationConsumption {
  const control = validateStableOperationControl(input.control);
  if (operationId(input.operationId) !== control.operation_id) throw new Error('Operation consumption operation_id does not match control.');
  if (runId(input.runId, 'run_id') !== control.run_id) throw new Error('Operation consumption run_id does not match control.');
  if (runAttempt(input.runAttempt, 'run_attempt') !== control.run_attempt) {
    throw new Error('Operation consumption run_attempt does not match control.');
  }
  if (nonce(input.nonce, 'nonce') !== control.nonce) throw new Error('Operation consumption nonce does not match control.');
  const core = {
    schema: 'opl_app_stable_operation_consumption.v1' as const,
    status: 'consumed' as const,
    operation: 'standard' as const,
    operation_id: control.operation_id,
    control_authority_digest: control.authority_digest,
    run_id: control.run_id,
    run_attempt: 1 as const,
    nonce_digest: control.nonce_digest,
    consumed_once: true as const,
  };
  return { ...core, consumption_digest: objectDigest(core) };
}

export function validateStableOperationConsumption(
  value: unknown,
  controlInput: unknown,
): StableOperationConsumption {
  const control = validateStableOperationControl(controlInput);
  const consumption = record(value, 'Stable operation consumption');
  const core = {
    schema: consumption.schema,
    status: consumption.status,
    operation: consumption.operation,
    operation_id: consumption.operation_id,
    control_authority_digest: consumption.control_authority_digest,
    run_id: consumption.run_id,
    run_attempt: consumption.run_attempt,
    nonce_digest: consumption.nonce_digest,
    consumed_once: consumption.consumed_once,
  };
  if (
    core.schema !== 'opl_app_stable_operation_consumption.v1'
    || core.status !== 'consumed'
    || core.operation !== 'standard'
    || core.operation_id !== control.operation_id
    || core.control_authority_digest !== control.authority_digest
    || core.run_id !== control.run_id
    || core.run_attempt !== 1
    || core.nonce_digest !== control.nonce_digest
    || core.consumed_once !== true
    || consumption.consumption_digest !== objectDigest(core)
  ) {
    throw new Error('Stable operation consumption does not bind one exact control record.');
  }
  return consumption as StableOperationConsumption;
}

export function validateStableOperationRuntimeBinding(input: {
  control: unknown;
  appRoot: string;
  sourceGatePath: string;
  preNonceGuardPath: string;
  expectedRunId: string;
  expectedActor: string;
  expectedAppSha: string;
  expectedShellSha: string;
  expectedFrameworkSha: string;
}): StableOperationControl {
  const control = validateStableOperationControl(input.control);
  if (control.run_id !== runId(input.expectedRunId, 'expected_run_id')) {
    throw new Error('Stable operation control run_id does not match the current GitHub run.');
  }
  if (control.actor !== text(input.expectedActor, 'expected_actor')) {
    throw new Error('Stable operation control actor does not match the protected admission actor.');
  }
  const expectedCohort = {
    app_sha: exactSha(input.expectedAppSha, 'expected_app_sha'),
    shell_sha: exactSha(input.expectedShellSha, 'expected_shell_sha'),
    framework_sha: exactSha(input.expectedFrameworkSha, 'expected_framework_sha'),
  };
  if (canonicalJson(control.cohort) !== canonicalJson(expectedCohort)) {
    throw new Error('Stable operation control cohort does not match the frozen release inputs.');
  }
  const sourceGateBytes = fs.readFileSync(path.resolve(input.sourceGatePath));
  const preNonceGuardBytes = fs.readFileSync(path.resolve(input.preNonceGuardPath));
  if (control.source_gate_digest !== bytesDigest(sourceGateBytes)) {
    throw new Error('Stable operation control source-gate digest drifted.');
  }
  if (control.pre_nonce_guard_digest !== bytesDigest(preNonceGuardBytes)) {
    throw new Error('Stable operation control pre-nonce guard digest drifted.');
  }
  validateCriticalBlobBytes(input.appRoot, control.critical_blobs);
  return control;
}

function readJson(filePath: string): unknown {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`Expected one non-empty regular JSON file: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown;
}

function writeExclusiveJson(filePath: string, value: unknown): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const descriptor = fs.openSync(resolved, 'wx');
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
  } finally {
    fs.closeSync(descriptor);
  }
}

function required(value: string | undefined, flag: string): string {
  if (!value?.trim()) throw new Error(`Missing --${flag}.`);
  return value.trim();
}

function main(argv: string[]): void {
  const command = argv[0];
  const { values } = parseArgs({
    args: argv.slice(1),
    strict: true,
    options: {
      'operation-id': { type: 'string' },
      actor: { type: 'string' },
      'run-id': { type: 'string' },
      'run-attempt': { type: 'string' },
      nonce: { type: 'string' },
      'app-sha': { type: 'string' },
      'shell-sha': { type: 'string' },
      'framework-sha': { type: 'string' },
      'critical-blobs': { type: 'string' },
      'source-gate-digest': { type: 'string' },
      'pre-nonce-guard-digest': { type: 'string' },
      authority: { type: 'string' },
      'authority-digest': { type: 'string' },
      'authority-id': { type: 'string' },
      issuer: { type: 'string' },
      'issued-at': { type: 'string' },
      'expires-at': { type: 'string' },
      'objective-fingerprint': { type: 'string' },
      now: { type: 'string' },
      control: { type: 'string' },
      input: { type: 'string' },
      output: { type: 'string' },
      'app-root': { type: 'string' },
      'source-gate': { type: 'string' },
      'pre-nonce-guard': { type: 'string' },
      'expected-run-id': { type: 'string' },
      'expected-actor': { type: 'string' },
      'expected-app-sha': { type: 'string' },
      'expected-shell-sha': { type: 'string' },
      'expected-framework-sha': { type: 'string' },
    },
  });
  if (command === 'create-authority') {
    const authority = createStableOperationAuthority({
      authorityId: required(values['authority-id'], 'authority-id'),
      operationId: required(values['operation-id'], 'operation-id'),
      issuer: required(values.issuer, 'issuer'),
      issuedAt: required(values['issued-at'], 'issued-at'),
      expiresAt: required(values['expires-at'], 'expires-at'),
      objectiveFingerprint: required(values['objective-fingerprint'], 'objective-fingerprint'),
      nonce: required(values.nonce, 'nonce'),
      appSha: required(values['app-sha'], 'app-sha'),
      shellSha: required(values['shell-sha'], 'shell-sha'),
      frameworkSha: required(values['framework-sha'], 'framework-sha'),
      criticalBlobs: readJson(required(values['critical-blobs'], 'critical-blobs')),
      sourceGateDigest: required(values['source-gate-digest'], 'source-gate-digest'),
      preNonceGuardDigest: required(values['pre-nonce-guard-digest'], 'pre-nonce-guard-digest'),
    });
    writeExclusiveJson(required(values.output, 'output'), authority);
    process.stdout.write(`${JSON.stringify({ status: authority.status, authority_id: authority.authority_id, authority_digest: authority.authority_digest })}\n`);
    return;
  }
  if (command === 'encode-carrier') {
    const authority = validateStableOperationAuthority(readJson(required(values.authority, 'authority')));
    const carrier = encodeStableOperationAuthorityCarrier(authority);
    process.stdout.write(`${JSON.stringify({
      status: 'passed',
      authority_id: authority.authority_id,
      authority_digest: authority.authority_digest,
      authority_carrier: carrier,
    })}\n`);
    return;
  }
  if (command === 'decode-carrier') {
    const authority = decodeStableOperationAuthorityCarrier({
      carrier: required(values.input, 'input'),
      authorityDigest: required(values['authority-digest'], 'authority-digest'),
      authorityId: required(values['authority-id'], 'authority-id'),
    });
    writeExclusiveJson(required(values.output, 'output'), authority);
    process.stdout.write(`${JSON.stringify({
      status: 'passed',
      authority_id: authority.authority_id,
      authority_digest: authority.authority_digest,
    })}\n`);
    return;
  }
  if (command === 'verify-authority') {
    const authority = validateStableOperationAuthority(readJson(required(values.authority, 'authority')));
    if (
      values['authority-digest'] !== undefined
      && authority.authority_digest !== digest(values['authority-digest'], 'authority-digest')
    ) {
      throw new Error('Pre-dispatch authority digest does not match the authority carrier.');
    }
    if (
      values['authority-id'] !== undefined
      && authority.authority_id !== operationId(values['authority-id'])
    ) {
      throw new Error('Pre-dispatch authority_id does not match the authority carrier.');
    }
    if (
      values['objective-fingerprint'] !== undefined
      && authority.objective_fingerprint !== objectiveFingerprint(values['objective-fingerprint'])
    ) {
      throw new Error('Pre-dispatch authority objective_fingerprint does not match the requested objective.');
    }
    const runtimeFlags = [
      values['app-root'],
      values['expected-actor'],
      values['expected-app-sha'],
    ];
    if (runtimeFlags.some((value) => value !== undefined)) {
      validateStableOperationAuthorityRuntimeBinding({
        authority,
        appRoot: required(values['app-root'], 'app-root'),
        expectedActor: required(values['expected-actor'], 'expected-actor'),
        expectedAppSha: required(values['expected-app-sha'], 'expected-app-sha'),
      });
    }
    process.stdout.write(`${JSON.stringify({
      status: 'passed',
      authority_id: authority.authority_id,
      operation_id: authority.operation_id,
      authority_digest: authority.authority_digest,
      cohort: authority.cohort,
    })}\n`);
    return;
  }
  if (command === 'bind') {
    const control = bindStableOperationAuthority({
      authority: readJson(required(values.authority, 'authority')),
      authorityDigest: required(values['authority-digest'], 'authority-digest'),
      actor: required(values.actor, 'actor'),
      runId: required(values['run-id'], 'run-id'),
      runAttempt: Number(required(values['run-attempt'], 'run-attempt')),
      sourceGateDigest: required(values['source-gate-digest'], 'source-gate-digest'),
      preNonceGuardDigest: required(values['pre-nonce-guard-digest'], 'pre-nonce-guard-digest'),
      now: typeof values.now === 'string' ? values.now : undefined,
    });
    writeExclusiveJson(required(values.output, 'output'), control);
    process.stdout.write(`${JSON.stringify({ status: control.status, operation_id: control.operation_id, authority_digest: control.authority_digest })}\n`);
    return;
  }
  if (command === 'consume') {
    const control = readJson(required(values.control, 'control'));
    const consumption = consumeStableOperationControl({
      control,
      operationId: required(values['operation-id'], 'operation-id'),
      runId: required(values['run-id'], 'run-id'),
      runAttempt: Number(required(values['run-attempt'], 'run-attempt')),
      nonce: required(values.nonce, 'nonce'),
    });
    writeExclusiveJson(required(values.output, 'output'), consumption);
    process.stdout.write(`${JSON.stringify({ status: consumption.status, operation_id: consumption.operation_id, consumption_digest: consumption.consumption_digest })}\n`);
    return;
  }
  if (command === 'verify') {
    const control = readJson(required(values.control, 'control'));
    if (values.input) {
      validateStableOperationConsumption(readJson(values.input), control);
    } else {
      validateStableOperationControl(control);
    }
    const runtimeFlags = [
      values['app-root'],
      values['source-gate'],
      values['pre-nonce-guard'],
      values['expected-run-id'],
      values['expected-actor'],
      values['expected-app-sha'],
      values['expected-shell-sha'],
      values['expected-framework-sha'],
    ];
    if (runtimeFlags.some((value) => value !== undefined)) {
      validateStableOperationRuntimeBinding({
        control,
        appRoot: required(values['app-root'], 'app-root'),
        sourceGatePath: required(values['source-gate'], 'source-gate'),
        preNonceGuardPath: required(values['pre-nonce-guard'], 'pre-nonce-guard'),
        expectedRunId: required(values['expected-run-id'], 'expected-run-id'),
        expectedActor: required(values['expected-actor'], 'expected-actor'),
        expectedAppSha: required(values['expected-app-sha'], 'expected-app-sha'),
        expectedShellSha: required(values['expected-shell-sha'], 'expected-shell-sha'),
        expectedFrameworkSha: required(values['expected-framework-sha'], 'expected-framework-sha'),
      });
    }
    process.stdout.write('{"status":"passed"}\n');
    return;
  }
  throw new Error('Usage: stable-operation-control.ts <create-authority|encode-carrier|decode-carrier|verify-authority|bind|consume|verify> ...');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
