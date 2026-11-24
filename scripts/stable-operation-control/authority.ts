import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  canonicalJson,
  defaultStableDesktopAdditionalPlatformIds,
  digest,
  exactSha,
  isoInstant,
  nonce,
  nonceDigest,
  normalizedStableDesktopAdditionalPlatforms,
  objectDigest,
  objectiveFingerprint,
  operationId,
  record,
  runAttempt,
  runId,
  text,
} from './schema.ts';
import type {
  StableOperationAuthority,
  StableOperationControl,
} from './schema.ts';
import {
  bytesDigest,
  normalizedCriticalBlobs,
  stableOperationCriticalBlobPaths,
  stableOperationIdForFrozenCohort,
  validateCriticalBlobBytes,
} from './critical-blobs.ts';

function preDispatchEvidence(input: {
  sourceGate: unknown;
  preNonceGuard: unknown;
  operationId: string;
  objectiveFingerprint: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
}): StableOperationAuthority['pre_dispatch_evidence'] {
  const sourceGate = record(input.sourceGate, 'source_gate');
  const preNonceGuard = record(input.preNonceGuard, 'pre_nonce_guard');
  const sourceGateCohort = record(sourceGate.admission, 'source_gate.admission').immutable_cohort;
  if (
    sourceGate.schema !== 'opl_app_release_source_gate.v1'
    || sourceGate.status !== 'passed'
    || sourceGate.operation_fingerprint !== objectiveFingerprint(input.objectiveFingerprint)
    || !sourceGateCohort
    || typeof sourceGateCohort !== 'object'
    || Array.isArray(sourceGateCohort)
    || (sourceGateCohort as Record<string, unknown>).app_sha !== exactSha(input.appSha, 'cohort.app_sha')
    || (sourceGateCohort as Record<string, unknown>).shell_sha !== exactSha(input.shellSha, 'cohort.shell_sha')
    || (sourceGateCohort as Record<string, unknown>).framework_sha !== exactSha(input.frameworkSha, 'cohort.framework_sha')
    || preNonceGuard.schema !== 'opl_release_dispatch_guard.v1'
    || preNonceGuard.phase !== 'pre_nonce'
    || preNonceGuard.status !== 'passed'
    || preNonceGuard.dispatch_allowed !== true
    || preNonceGuard.operation_id !== operationId(input.operationId)
    || preNonceGuard.owner_run_match_count !== 0
    || preNonceGuard.nonce_consumed !== false
  ) {
    throw new Error('Pre-dispatch authority evidence must contain one passed zero-consumer pre-nonce guard for the exact frozen operation.');
  }
  return { source_gate: sourceGate, pre_nonce_guard: preNonceGuard };
}

function assertAuthorityMatchesControl(
  authority: StableOperationAuthority,
  control: {
    operation_id: string;
    actor: string;
    nonce: string;
    cohort: StableOperationAuthority['cohort'];
    desktop_additional_platforms: string[];
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
    || canonicalJson(authority.desktop_additional_platforms) !== canonicalJson(control.desktop_additional_platforms)
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
  desktopAdditionalPlatforms?: unknown;
  criticalBlobs: unknown;
  sourceGateDigest: string;
  preNonceGuardDigest: string;
  runAuthorityReconcileDigest: string;
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
    desktop_additional_platforms: normalizedStableDesktopAdditionalPlatforms(
      input.desktopAdditionalPlatforms ?? defaultStableDesktopAdditionalPlatformIds,
    ),
    critical_blobs: normalizedCriticalBlobs(input.criticalBlobs),
    source_gate_digest: digest(input.sourceGateDigest, 'source_gate_digest'),
    pre_nonce_guard_digest: digest(input.preNonceGuardDigest, 'pre_nonce_guard_digest'),
    run_authority_reconcile_digest: digest(
      input.runAuthorityReconcileDigest,
      'run_authority_reconcile_digest',
    ),
  };
  authority.nonce_digest = nonceDigest(authority.nonce);
  assertAuthorityMatchesControl(issuedAuthority, authority);
  const control = {
    ...authority,
    issued_authority: issuedAuthority,
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
  const issuedAuthority = validateStableOperationAuthority(control.issued_authority);
  const created = createStableOperationControl({
    operationId: operationId(control.operation_id),
    actor: text(control.actor, 'actor'),
    runId: runId(control.run_id, 'run_id'),
    runAttempt: runAttempt(control.run_attempt, 'run_attempt'),
    nonce: nonce(control.nonce, 'nonce'),
    appSha: exactSha(record(control.cohort, 'cohort').app_sha, 'cohort.app_sha'),
    shellSha: exactSha(record(control.cohort, 'cohort').shell_sha, 'cohort.shell_sha'),
    frameworkSha: exactSha(record(control.cohort, 'cohort').framework_sha, 'cohort.framework_sha'),
    desktopAdditionalPlatforms: control.desktop_additional_platforms,
    criticalBlobs: control.critical_blobs,
    sourceGateDigest: digest(control.source_gate_digest, 'source_gate_digest'),
    preNonceGuardDigest: digest(control.pre_nonce_guard_digest, 'pre_nonce_guard_digest'),
    runAuthorityReconcileDigest: digest(
      control.run_authority_reconcile_digest,
      'run_authority_reconcile_digest',
    ),
    issuedAuthority,
  });
  if (control.nonce_digest !== created.nonce_digest || control.authority_digest !== created.authority_digest) {
    throw new Error('Stable operation control digest binding is invalid.');
  }
  return created;
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
  desktopAdditionalPlatforms?: unknown;
  criticalBlobs: unknown;
  sourceGate: unknown;
  preNonceGuard: unknown;
}): StableOperationAuthority {
  const expectedOperationId = stableOperationIdForFrozenCohort({
    objectiveFingerprint: input.objectiveFingerprint,
    appSha: input.appSha,
    shellSha: input.shellSha,
    frameworkSha: input.frameworkSha,
    criticalBlobs: input.criticalBlobs,
  });
  if (operationId(input.operationId) !== expectedOperationId) {
    throw new Error('Stable operation_id must equal the deterministic frozen-cohort operation identity.');
  }
  const evidence = preDispatchEvidence({
    sourceGate: input.sourceGate,
    preNonceGuard: input.preNonceGuard,
    operationId: expectedOperationId,
    objectiveFingerprint: input.objectiveFingerprint,
    appSha: input.appSha,
    shellSha: input.shellSha,
    frameworkSha: input.frameworkSha,
  });
  const authority = {
    schema: 'opl_app_stable_operation_authority.v1' as const,
    status: 'issued' as const,
    issuance: {
      source: 'operator_issued_github_dispatch_input' as const,
      cryptographic_signature: false as const,
    },
    authority_id: operationId(input.authorityId),
    operation: 'standard' as const,
    operation_id: expectedOperationId,
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
    desktop_additional_platforms: normalizedStableDesktopAdditionalPlatforms(
      input.desktopAdditionalPlatforms ?? defaultStableDesktopAdditionalPlatformIds,
    ),
    critical_blobs: normalizedCriticalBlobs(input.criticalBlobs),
    source_gate_digest: objectDigest(evidence.source_gate),
    pre_nonce_guard_digest: objectDigest(evidence.pre_nonce_guard),
    pre_dispatch_evidence: evidence,
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
    desktopAdditionalPlatforms: authority.desktop_additional_platforms,
    criticalBlobs: authority.critical_blobs,
    sourceGate: record(record(authority.pre_dispatch_evidence, 'pre_dispatch_evidence').source_gate, 'pre_dispatch_evidence.source_gate'),
    preNonceGuard: record(record(authority.pre_dispatch_evidence, 'pre_dispatch_evidence').pre_nonce_guard, 'pre_dispatch_evidence.pre_nonce_guard'),
  });
  if (
    authority.nonce_digest !== created.nonce_digest
    || authority.source_gate_digest !== created.source_gate_digest
    || authority.pre_nonce_guard_digest !== created.pre_nonce_guard_digest
    || authority.authority_digest !== created.authority_digest
  ) {
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

export function validateStableOperationAuthorityExecutorBinding(input: {
  authority: unknown;
  appRoot: string;
  expectedActor: string;
  expectedExecutorSha: string;
}): StableOperationAuthority {
  const authority = validateStableOperationAuthority(input.authority);
  if (stableOperationCriticalBlobPaths.some((file) => authority.critical_blobs[file] === undefined)) {
    throw new Error('Current Stable executor requires all critical workflow bindings, including clean-VM qualification.');
  }
  if (authority.issuer !== text(input.expectedActor, 'expected_actor')) {
    throw new Error('Pre-dispatch authority issuer does not match the dispatch actor.');
  }
  const root = path.resolve(input.appRoot);
  const headResult = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (headResult.status !== 0 || headResult.error) {
    throw new Error('Unable to resolve the Stable workflow executor App commit.');
  }
  const executorSha = exactSha(headResult.stdout.trim(), 'executor_app_sha');
  if (executorSha !== exactSha(input.expectedExecutorSha, 'expected_executor_sha')) {
    throw new Error('Stable workflow executor App commit does not match GitHub Actions.');
  }
  validateCriticalBlobBytes(root, authority.critical_blobs);
  return authority;
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
  runAuthorityReconcileDigest: string;
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
    desktopAdditionalPlatforms: authority.desktop_additional_platforms,
    criticalBlobs: authority.critical_blobs,
    sourceGateDigest: input.sourceGateDigest,
    preNonceGuardDigest: input.preNonceGuardDigest,
    runAuthorityReconcileDigest: input.runAuthorityReconcileDigest,
    issuedAuthority: authority,
  });
}

export function validateStableOperationRuntimeBinding(input: {
  control: unknown;
  appRoot: string;
  sourceGatePath: string;
  preNonceGuardPath: string;
  runAuthorityReconcilePath: string;
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
  const runAuthorityReconcileBytes = fs.readFileSync(path.resolve(input.runAuthorityReconcilePath));
  if (control.source_gate_digest !== bytesDigest(sourceGateBytes)) {
    throw new Error('Stable operation control source-gate digest drifted.');
  }
  if (control.pre_nonce_guard_digest !== bytesDigest(preNonceGuardBytes)) {
    throw new Error('Stable operation control pre-nonce guard digest drifted.');
  }
  if (control.run_authority_reconcile_digest !== bytesDigest(runAuthorityReconcileBytes)) {
    throw new Error('Stable operation control run-authority reconcile digest drifted.');
  }
  let runAuthorityReconcile: Record<string, unknown>;
  try {
    runAuthorityReconcile = record(
      JSON.parse(runAuthorityReconcileBytes.toString('utf8')),
      'run_authority_reconcile',
    );
  } catch {
    throw new Error('Stable operation run-bound guard must contain one JSON object.');
  }
  if (
    runAuthorityReconcile.schema !== 'opl_release_dispatch_guard.v1'
    || runAuthorityReconcile.phase !== 'run_bound'
    || runAuthorityReconcile.status !== 'passed'
    || runAuthorityReconcile.dispatch_allowed !== true
    || runAuthorityReconcile.operation_id !== control.operation_id
    || runAuthorityReconcile.authority_id !== control.issued_authority.authority_id
    || runAuthorityReconcile.run_id !== control.run_id
    || runAuthorityReconcile.owner_run_match_count !== 1
    || runAuthorityReconcile.nonce_consumed !== false
    || runAuthorityReconcile.mutation_invocation_count !== 0
  ) {
    throw new Error('Stable operation run-bound guard does not prove unique unconsumed authority ownership.');
  }
  validateCriticalBlobBytes(input.appRoot, control.critical_blobs);
  return control;
}

function writeExclusiveCanonicalJson(filePath: string, value: unknown): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const descriptor = fs.openSync(resolved, 'wx');
  try {
    fs.writeFileSync(descriptor, canonicalJson(value));
  } finally {
    fs.closeSync(descriptor);
  }
}

export function materializeStableOperationAuthorityEvidence(input: {
  authority: unknown;
  sourceGateOutput: string;
  preNonceGuardOutput: string;
}): { source_gate_digest: string; pre_nonce_guard_digest: string } {
  const authority = validateStableOperationAuthority(input.authority);
  writeExclusiveCanonicalJson(input.sourceGateOutput, authority.pre_dispatch_evidence.source_gate);
  writeExclusiveCanonicalJson(input.preNonceGuardOutput, authority.pre_dispatch_evidence.pre_nonce_guard);
  return {
    source_gate_digest: authority.source_gate_digest,
    pre_nonce_guard_digest: authority.pre_nonce_guard_digest,
  };
}
