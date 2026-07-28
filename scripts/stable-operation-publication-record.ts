#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  canonicalJson,
  type StableOperationAuthority,
  type StableOperationConsumption,
  type StableOperationControl,
  validateStableOperationAuthority,
  validateStableOperationConsumption,
  validateStableOperationControl,
} from './stable-operation-control.ts';

type JsonRecord = Record<string, unknown>;

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const recordAssetName = 'stable-operation-publication-record.json';

export type StableOperationPublicationRecord = {
  schema: 'opl_app_stable_operation_publication_record.v1';
  status: 'prepared';
  record_asset: {
    name: typeof recordAssetName;
    encoding: 'canonical_json_utf8';
  };
  publication_target: {
    repository: string;
    tag: string;
  };
  publication_intent: {
    mutation: 'release_publish';
    publish_once_after_exact_payload_assets: true;
    payload_assets: StableOperationPublicationAsset[];
    record_asset_uploaded_with_payload_assets: true;
  };
  evidence_transport: {
    actions_artifact: {
      role: 'transient_transport_only';
      durable_authority: false;
    };
    durable_record: {
      role: 'release_asset_after_publication';
      authority_preserved: true;
    };
  };
  operation: {
    authority: StableOperationAuthority;
    run_bound_control: StableOperationControl;
    single_use_consumption: StableOperationConsumption;
    pre_dispatch_evidence: {
      source_gate: StableOperationEvidenceBytes;
      pre_nonce_guard: StableOperationEvidenceBytes;
    };
    run_authority_reconcile: StableOperationEvidenceBytes;
  };
  publication_record_digest: string;
};

export type StableOperationEvidenceBytes = {
  encoding: 'base64';
  sha256: string;
  bytes_base64: string;
};

export type StableOperationPublicationAsset = {
  name: string;
  digest: string;
  size_bytes: number;
};

export type StableOperationPublishedCarrierBinding = {
  schema: 'opl_app_stable_operation_published_carrier_binding.v1';
  status: 'published_immutable';
  publication_record_digest: string;
  publication_target: {
    repository: string;
    tag: string;
  };
  published_carrier: {
    release_id: number;
    immutable: true;
    draft: false;
    assets: StableOperationPublicationAsset[];
  };
  published_carrier_binding_digest: string;
};

/**
 * Historical releases that predate protected operation control must be
 * represented as missing evidence, never reconstructed from later readback.
 */
export type StableOperationMissingControlRecord = {
  schema: 'opl_app_stable_operation_publication_record.v1';
  status: 'missing_control_record';
  publication_target: {
    repository: string;
    tag: string;
  };
  historical_readback: {
    release_id: number;
    immutable: boolean;
    draft: false;
    reason: 'historical_operation_predates_durable_control';
  };
  missing_control_record_digest: string;
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

function digest(value: unknown, label: string): string {
  const normalized = text(value, label).toLowerCase();
  if (!digestPattern.test(normalized)) throw new Error(`${label} must be an exact SHA-256 digest.`);
  return normalized;
}

function repository(value: unknown): string {
  const normalized = text(value, 'repository');
  if (!repositoryPattern.test(normalized)) throw new Error('repository must use owner/name form.');
  return normalized;
}

function tag(value: unknown): string {
  const normalized = text(value, 'tag');
  if (normalized.length > 255 || /\s/.test(normalized)) throw new Error('tag is not a canonical GitHub release tag.');
  return normalized;
}

function positiveInteger(value: unknown, label: string): number {
  const normalized = typeof value === 'string' ? Number(value) : value;
  if (!Number.isSafeInteger(normalized) || (normalized as number) < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return normalized as number;
}

function bytesDigest(bytes: Buffer): string {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function objectDigest(value: unknown): string {
  return bytesDigest(Buffer.from(canonicalJson(value), 'utf8'));
}

function exactJson(value: unknown, expected: unknown, label: string): void {
  if (canonicalJson(value) !== canonicalJson(expected)) {
    throw new Error(`${label} does not match its exact canonical digest-bound shape.`);
  }
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean.`);
  return value;
}

function parseEvidenceBytes(value: unknown, label: string): {
  bytes: Buffer;
  parsed: JsonRecord;
  evidence: StableOperationEvidenceBytes;
} {
  const evidence = record(value, label);
  if (evidence.encoding !== 'base64') throw new Error(`${label}.encoding must be base64.`);
  const encoded = text(evidence.bytes_base64, `${label}.bytes_base64`);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new Error(`${label}.bytes_base64 must be canonical base64.`);
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) throw new Error(`${label}.bytes_base64 must be canonical base64.`);
  const expectedDigest = digest(evidence.sha256, `${label}.sha256`);
  if (bytesDigest(bytes) !== expectedDigest) throw new Error(`${label} SHA-256 digest does not match the embedded bytes.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`${label} must contain one UTF-8 JSON object.`);
  }
  return {
    bytes,
    parsed: record(parsed, `${label} JSON`),
    evidence: {
      encoding: 'base64',
      sha256: expectedDigest,
      bytes_base64: encoded,
    },
  };
}

function evidenceBytes(input: Buffer, label: string): StableOperationEvidenceBytes {
  if (!Buffer.isBuffer(input) || input.length === 0) throw new Error(`${label} evidence bytes are missing.`);
  try {
    record(JSON.parse(input.toString('utf8')), `${label} JSON`);
  } catch (error) {
    if (error instanceof Error && /must be one JSON object/.test(error.message)) throw error;
    throw new Error(`${label} evidence must contain one UTF-8 JSON object.`);
  }
  return {
    encoding: 'base64',
    sha256: bytesDigest(input),
    bytes_base64: input.toString('base64'),
  };
}

function assertSourceGateBinding(
  sourceGate: JsonRecord,
  authority: StableOperationAuthority,
): void {
  const admission = record(sourceGate.admission, 'source_gate.admission');
  const cohort = record(admission.immutable_cohort, 'source_gate.admission.immutable_cohort');
  if (
    sourceGate.schema !== 'opl_app_release_source_gate.v1'
    || sourceGate.status !== 'passed'
    || admission.status !== 'passed'
    || sourceGate.typed_blocker !== null
  ) {
    throw new Error('source_gate must be one passed, unblocked source-gate report.');
  }
  if (
    cohort.app_sha !== authority.cohort.app_sha
    || cohort.shell_sha !== authority.cohort.shell_sha
    || cohort.framework_sha !== authority.cohort.framework_sha
  ) {
    throw new Error('source_gate cohort does not match the issued authority.');
  }
  if (sourceGate.operation_fingerprint !== authority.objective_fingerprint) {
    throw new Error('source_gate operation_fingerprint does not match the issued authority objective.');
  }
  const checks = sourceGate.checks;
  if (
    !Array.isArray(checks)
    || !checks.some((check) => (
      check !== null
      && typeof check === 'object'
      && !Array.isArray(check)
      && (check as JsonRecord).id === 'app_frozen_commit_reachable'
      && (check as JsonRecord).status === 'passed'
    ))
  ) {
    throw new Error('source_gate does not prove that the frozen App commit remains reachable.');
  }
}

function assertPreNonceGuardBinding(
  guard: JsonRecord,
  authority: StableOperationAuthority,
): void {
  const sourceGate = record(guard.source_gate, 'pre_nonce_guard.source_gate');
  if (
    guard.schema !== 'opl_release_dispatch_guard.v1'
    || guard.phase !== 'pre_nonce'
    || guard.status !== 'passed'
    || guard.dispatch_allowed !== true
    || guard.owner_run_match_count !== 0
    || guard.nonce_consumed !== false
    || sourceGate.schema !== 'opl_app_release_source_gate.v1'
    || sourceGate.status !== 'passed'
    || sourceGate.exact_cohort_bound !== true
  ) {
    throw new Error('pre_nonce_guard must be the unconsumed, zero-owner pre-dispatch guard.');
  }
  if (guard.operation_id !== authority.operation_id) {
    throw new Error('pre_nonce_guard operation_id does not match the issued authority.');
  }
}

function assertRunAuthorityReconcileBinding(
  guard: JsonRecord,
  control: StableOperationControl,
): void {
  if (
    guard.schema !== 'opl_release_dispatch_guard.v1'
    || guard.phase !== 'run_bound'
    || guard.status !== 'passed'
    || guard.dispatch_allowed !== true
    || guard.operation_id !== control.operation_id
    || guard.authority_id !== control.issued_authority.authority_id
    || guard.run_id !== control.run_id
    || guard.owner_run_match_count !== 1
    || guard.nonce_consumed !== false
    || guard.mutation_invocation_count !== 0
  ) {
    throw new Error('run_authority_reconcile must prove unique unconsumed authority ownership for the exact run.');
  }
}

function assertOperationBindings(input: {
  authority: StableOperationAuthority;
  control: StableOperationControl;
  consumption: StableOperationConsumption;
  sourceGateEvidence: StableOperationEvidenceBytes;
  preNonceGuardEvidence: StableOperationEvidenceBytes;
  runAuthorityReconcileEvidence: StableOperationEvidenceBytes;
}): void {
  const {
    authority,
    control,
    consumption,
    sourceGateEvidence,
    preNonceGuardEvidence,
    runAuthorityReconcileEvidence,
  } = input;
  if (
    canonicalJson(control.issued_authority) !== canonicalJson(authority)
  ) {
    throw new Error('run-bound control does not reference the exact issued authority.');
  }
  if (
    control.operation_id !== authority.operation_id
    || control.actor !== authority.issuer
    || canonicalJson(control.cohort) !== canonicalJson(authority.cohort)
    || canonicalJson(control.critical_blobs) !== canonicalJson(authority.critical_blobs)
    || control.source_gate_digest !== authority.source_gate_digest
    || control.pre_nonce_guard_digest !== authority.pre_nonce_guard_digest
    || control.nonce_digest !== authority.nonce_digest
    || control.run_authority_reconcile_digest !== runAuthorityReconcileEvidence.sha256
  ) {
    throw new Error('run-bound control does not preserve the exact authority bindings.');
  }
  if (
    authority.source_gate_digest !== sourceGateEvidence.sha256
    || authority.pre_nonce_guard_digest !== preNonceGuardEvidence.sha256
  ) {
    throw new Error('pre-dispatch evidence byte digests do not match the issued authority.');
  }
  if (
    consumption.operation_id !== control.operation_id
    || consumption.control_authority_digest !== control.authority_digest
    || consumption.run_id !== control.run_id
    || consumption.run_attempt !== control.run_attempt
    || consumption.nonce_digest !== control.nonce_digest
    || consumption.run_authority_reconcile_digest !== control.run_authority_reconcile_digest
    || consumption.consumed_once !== true
  ) {
    throw new Error('single-use consumption does not bind one exact run-bound control.');
  }
}

function recordCore(input: {
  authority: StableOperationAuthority;
  control: StableOperationControl;
  consumption: StableOperationConsumption;
  sourceGateEvidence: StableOperationEvidenceBytes;
  preNonceGuardEvidence: StableOperationEvidenceBytes;
  runAuthorityReconcileEvidence: StableOperationEvidenceBytes;
  repository: string;
  tag: string;
  plannedAssets: StableOperationPublicationAsset[];
}): Omit<StableOperationPublicationRecord, 'publication_record_digest'> {
  return {
    schema: 'opl_app_stable_operation_publication_record.v1',
    status: 'prepared',
    record_asset: {
      name: recordAssetName,
      encoding: 'canonical_json_utf8',
    },
    publication_target: {
      repository: input.repository,
      tag: input.tag,
    },
    publication_intent: {
      mutation: 'release_publish',
      publish_once_after_exact_payload_assets: true,
      payload_assets: input.plannedAssets,
      record_asset_uploaded_with_payload_assets: true,
    },
    evidence_transport: {
      actions_artifact: {
        role: 'transient_transport_only',
        durable_authority: false,
      },
      durable_record: {
        role: 'release_asset_after_publication',
        authority_preserved: true,
      },
    },
    operation: {
      authority: input.authority,
      run_bound_control: input.control,
      single_use_consumption: input.consumption,
      pre_dispatch_evidence: {
        source_gate: input.sourceGateEvidence,
        pre_nonce_guard: input.preNonceGuardEvidence,
      },
      run_authority_reconcile: input.runAuthorityReconcileEvidence,
    },
  };
}

export function createStableOperationPublicationRecord(input: {
  authority: unknown;
  control: unknown;
  consumption: unknown;
  sourceGateBytes: Buffer;
  preNonceGuardBytes: Buffer;
  runAuthorityReconcileBytes: Buffer;
  repository: string;
  tag: string;
  plannedAssets: unknown;
}): StableOperationPublicationRecord {
  const authority = validateStableOperationAuthority(input.authority);
  const control = validateStableOperationControl(input.control);
  const consumption = validateStableOperationConsumption(input.consumption, control);
  const sourceGateEvidence = evidenceBytes(input.sourceGateBytes, 'source_gate');
  const preNonceGuardEvidence = evidenceBytes(input.preNonceGuardBytes, 'pre_nonce_guard');
  const runAuthorityReconcileEvidence = evidenceBytes(
    input.runAuthorityReconcileBytes,
    'run_authority_reconcile',
  );
  const sourceGate = parseEvidenceBytes(sourceGateEvidence, 'source_gate').parsed;
  const preNonceGuard = parseEvidenceBytes(preNonceGuardEvidence, 'pre_nonce_guard').parsed;
  const runAuthorityReconcile = parseEvidenceBytes(
    runAuthorityReconcileEvidence,
    'run_authority_reconcile',
  ).parsed;
  assertSourceGateBinding(sourceGate, authority);
  assertPreNonceGuardBinding(preNonceGuard, authority);
  assertRunAuthorityReconcileBinding(runAuthorityReconcile, control);
  assertOperationBindings({
    authority,
    control,
    consumption,
    sourceGateEvidence,
    preNonceGuardEvidence,
    runAuthorityReconcileEvidence,
  });
  const core = recordCore({
    authority,
    control,
    consumption,
    sourceGateEvidence,
    preNonceGuardEvidence,
    runAuthorityReconcileEvidence,
    repository: repository(input.repository),
    tag: tag(input.tag),
    plannedAssets: normalizeAssets(input.plannedAssets, 'planned_assets'),
  });
  return {
    ...core,
    publication_record_digest: objectDigest(core),
  };
}

export function validateStableOperationPublicationRecord(value: unknown): StableOperationPublicationRecord {
  const candidate = record(value, 'Stable operation publication record');
  if (
    candidate.schema !== 'opl_app_stable_operation_publication_record.v1'
    || candidate.status !== 'prepared'
  ) {
    throw new Error('Stable operation publication record schema or status is invalid.');
  }
  const operation = record(candidate.operation, 'operation');
  const evidence = record(operation.pre_dispatch_evidence, 'operation.pre_dispatch_evidence');
  const sourceGateEvidence = parseEvidenceBytes(evidence.source_gate, 'source_gate');
  const preNonceGuardEvidence = parseEvidenceBytes(evidence.pre_nonce_guard, 'pre_nonce_guard');
  const runAuthorityReconcileEvidence = parseEvidenceBytes(
    operation.run_authority_reconcile,
    'run_authority_reconcile',
  );
  const expected = createStableOperationPublicationRecord({
    authority: operation.authority,
    control: operation.run_bound_control,
    consumption: operation.single_use_consumption,
    sourceGateBytes: sourceGateEvidence.bytes,
    preNonceGuardBytes: preNonceGuardEvidence.bytes,
    runAuthorityReconcileBytes: runAuthorityReconcileEvidence.bytes,
    repository: record(candidate.publication_target, 'publication_target').repository as string,
    tag: record(candidate.publication_target, 'publication_target').tag as string,
    plannedAssets: record(candidate.publication_intent, 'publication_intent').payload_assets,
  });
  if (candidate.publication_record_digest !== expected.publication_record_digest) {
    throw new Error('Stable operation publication record digest binding is invalid.');
  }
  exactJson(candidate, expected, 'Stable operation publication record');
  return expected;
}

function normalizeAssets(value: unknown, label: string): StableOperationPublicationAsset[] {
  const source = Array.isArray(value)
    ? value
    : (() => {
      const document = record(value, label);
      return document.assets ?? document.upload_actions;
    })();
  if (!Array.isArray(source) || source.length === 0) throw new Error(`${label} must contain a non-empty assets array.`);
  const assets = source.map((asset, index) => {
    const item = record(asset, `${label}[${index}]`);
    return {
      name: text(item.name, `${label}[${index}].name`),
      digest: digest(item.digest ?? item.sha256, `${label}[${index}].digest`),
      size_bytes: positiveInteger(item.size_bytes ?? item.size, `${label}[${index}].size_bytes`),
    };
  });
  const names = new Set<string>();
  for (const asset of assets) {
    if (names.has(asset.name)) throw new Error(`${label} contains duplicate asset name: ${asset.name}.`);
    names.add(asset.name);
  }
  return assets.sort((left, right) => left.name.localeCompare(right.name));
}

function assertExactAssets(
  expected: StableOperationPublicationAsset[],
  actual: StableOperationPublicationAsset[],
): void {
  if (expected.length !== actual.length) {
    throw new Error('Published carrier assets do not match the exact expected asset count.');
  }
  for (let index = 0; index < expected.length; index += 1) {
    const expectedAsset = expected[index]!;
    const actualAsset = actual[index]!;
    if (
      expectedAsset.name !== actualAsset.name
      || expectedAsset.digest !== actualAsset.digest
      || expectedAsset.size_bytes !== actualAsset.size_bytes
    ) {
      throw new Error(`Published carrier asset does not match the exact expected digest and size: ${expectedAsset.name}.`);
    }
  }
}

function inspectPublishedCarrier(value: unknown): {
  repository: string;
  tag: string;
  releaseId: number;
  immutable: true;
  draft: false;
  assets: StableOperationPublicationAsset[];
} {
  const inspection = record(value, 'GitHub release inspection');
  const release = inspection.release === undefined ? inspection : record(inspection.release, 'GitHub release inspection.release');
  const immutable = release.immutable;
  if (immutable !== true) throw new Error('Published carrier immutable must be exactly true.');
  if (release.draft !== false) throw new Error('Published carrier draft must be exactly false.');
  return {
    repository: repository(inspection.repository ?? release.repository),
    tag: tag(inspection.tag ?? inspection.tag_name ?? release.tag_name ?? release.tag),
    releaseId: positiveInteger(release.id ?? release.release_id, 'GitHub release inspection release id'),
    immutable,
    draft: false,
    assets: normalizeAssets(inspection.assets ?? release.assets, 'GitHub release inspection.assets'),
  };
}

function bindingCore(input: {
  record: StableOperationPublicationRecord;
  releaseId: number;
  assets: StableOperationPublicationAsset[];
}): Omit<StableOperationPublishedCarrierBinding, 'published_carrier_binding_digest'> {
  return {
    schema: 'opl_app_stable_operation_published_carrier_binding.v1',
    status: 'published_immutable',
    publication_record_digest: input.record.publication_record_digest,
    publication_target: input.record.publication_target,
    published_carrier: {
      release_id: input.releaseId,
      immutable: true,
      draft: false,
      assets: input.assets,
    },
  };
}

export function createStableOperationPublishedCarrierBinding(input: {
  record: unknown;
  githubInspection: unknown;
  expectedAssets: unknown;
}): StableOperationPublishedCarrierBinding {
  const publicationRecord = validateStableOperationPublicationRecord(input.record);
  const inspection = inspectPublishedCarrier(input.githubInspection);
  if (
    inspection.repository !== publicationRecord.publication_target.repository
    || inspection.tag !== publicationRecord.publication_target.tag
  ) {
    throw new Error('Published carrier repository or tag does not match the publication record target.');
  }
  const expectedAssets = normalizeAssets(input.expectedAssets, 'expected assets');
  const expectedRecordAsset = expectedAssets.find((asset) => asset.name === recordAssetName);
  const recordBytes = Buffer.from(canonicalJson(publicationRecord), 'utf8');
  if (
    !expectedRecordAsset
    || expectedRecordAsset.digest !== bytesDigest(recordBytes)
    || expectedRecordAsset.size_bytes !== recordBytes.byteLength
  ) {
    throw new Error('Expected assets must bind the canonical stable-operation-publication-record.json bytes.');
  }
  assertExactAssets(expectedAssets, inspection.assets);
  const core = bindingCore({
    record: publicationRecord,
    releaseId: inspection.releaseId,
    assets: inspection.assets,
  });
  return {
    ...core,
    published_carrier_binding_digest: objectDigest(core),
  };
}

export function validateStableOperationPublishedCarrierBinding(value: unknown): StableOperationPublishedCarrierBinding {
  const binding = record(value, 'Stable operation published carrier binding');
  if (
    binding.schema !== 'opl_app_stable_operation_published_carrier_binding.v1'
    || binding.status !== 'published_immutable'
  ) {
    throw new Error('Stable operation published carrier binding schema or status is invalid.');
  }
  const target = record(binding.publication_target, 'publication_target');
  const carrier = record(binding.published_carrier, 'published_carrier');
  const assets = normalizeAssets(carrier.assets, 'published_carrier.assets');
  const core = {
    schema: 'opl_app_stable_operation_published_carrier_binding.v1' as const,
    status: 'published_immutable' as const,
    publication_record_digest: digest(binding.publication_record_digest, 'publication_record_digest'),
    publication_target: {
      repository: repository(target.repository),
      tag: tag(target.tag),
    },
    published_carrier: {
      release_id: positiveInteger(carrier.release_id, 'published_carrier.release_id'),
      immutable: carrier.immutable,
      draft: carrier.draft,
      assets,
    },
  };
  if (core.published_carrier.immutable !== true || core.published_carrier.draft !== false) {
    throw new Error('Stable operation published carrier binding requires immutable=true and draft=false.');
  }
  const expected = {
    ...core,
    published_carrier_binding_digest: objectDigest(core),
  };
  if (binding.published_carrier_binding_digest !== expected.published_carrier_binding_digest) {
    throw new Error('Stable operation published carrier binding digest is invalid.');
  }
  exactJson(binding, expected, 'Stable operation published carrier binding');
  return expected;
}

export function createStableOperationMissingControlRecord(input: {
  repository: string;
  tag: string;
  releaseId: number;
  immutable: boolean;
}): StableOperationMissingControlRecord {
  const core = {
    schema: 'opl_app_stable_operation_publication_record.v1' as const,
    status: 'missing_control_record' as const,
    publication_target: {
      repository: repository(input.repository),
      tag: tag(input.tag),
    },
    historical_readback: {
      release_id: positiveInteger(input.releaseId, 'release_id'),
      immutable: booleanValue(input.immutable, 'immutable'),
      draft: false as const,
      reason: 'historical_operation_predates_durable_control' as const,
    },
  };
  return {
    ...core,
    missing_control_record_digest: objectDigest(core),
  };
}

export function validateStableOperationMissingControlRecord(
  value: unknown,
): StableOperationMissingControlRecord {
  const candidate = record(value, 'Stable operation missing control record');
  if (
    candidate.schema !== 'opl_app_stable_operation_publication_record.v1'
    || candidate.status !== 'missing_control_record'
  ) {
    throw new Error('Stable operation missing control record schema or status is invalid.');
  }
  if ('operation' in candidate || 'authority' in candidate || 'run_bound_control' in candidate) {
    throw new Error('Historical missing control records must not fabricate authority, control, or consumption evidence.');
  }
  const target = record(candidate.publication_target, 'publication_target');
  const readback = record(candidate.historical_readback, 'historical_readback');
  const expected = createStableOperationMissingControlRecord({
    repository: repository(target.repository),
    tag: tag(target.tag),
    releaseId: positiveInteger(readback.release_id, 'historical_readback.release_id'),
    immutable: booleanValue(readback.immutable, 'historical_readback.immutable'),
  });
  if (candidate.missing_control_record_digest !== expected.missing_control_record_digest) {
    throw new Error('Stable operation missing control record digest is invalid.');
  }
  exactJson(candidate, expected, 'Stable operation missing control record');
  return expected;
}

function readRegularBytes(filePath: string, label: string): Buffer {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`${label} must be one non-empty regular file: ${resolved}`);
  }
  return fs.readFileSync(resolved);
}

function readJsonFile(filePath: string, label: string): unknown {
  const bytes = readRegularBytes(filePath, label);
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new Error(`${label} must contain valid JSON: ${path.resolve(filePath)}`);
  }
}

function required(value: string | undefined, flag: string): string {
  if (!value?.trim()) throw new Error(`Missing --${flag}.`);
  return value.trim();
}

function writeCanonicalOutput(filePath: string, value: unknown): void {
  const output = path.resolve(filePath);
  const bytes = Buffer.from(canonicalJson(value), 'utf8');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  if (fs.existsSync(output)) {
    const existing = readRegularBytes(output, 'output');
    if (!existing.equals(bytes)) {
      throw new Error(`Refusing to replace non-identical durable output: ${output}`);
    }
    return;
  }
  fs.writeFileSync(output, bytes, { flag: 'wx' });
}

function usage(): void {
  process.stdout.write(`Usage:
  node --experimental-strip-types scripts/stable-operation-publication-record.ts create \\
    --authority <authority.json> --control <control.json> --consumption <consumption.json> \\
    --source-gate <source-gate.json> --pre-nonce-guard <pre-issued-pre-nonce-guard.json> \\
    --run-authority-reconcile <run-authority-reconcile.json> \\
    --planned-assets <upload-actions.json> \\
    --repository <owner/name> --tag <tag> --output <stable-operation-publication-record.json>

  node --experimental-strip-types scripts/stable-operation-publication-record.ts verify-published \\
    --record <stable-operation-publication-record.json> --github-inspection <release-inspection.json> \\
    --expected-assets <expected-assets.json>
`);
}

function main(argv: string[]): void {
  const [command = '', ...args] = argv;
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      authority: { type: 'string' },
      control: { type: 'string' },
      consumption: { type: 'string' },
      'source-gate': { type: 'string' },
      'pre-nonce-guard': { type: 'string' },
      'run-authority-reconcile': { type: 'string' },
      'planned-assets': { type: 'string' },
      repository: { type: 'string' },
      tag: { type: 'string' },
      output: { type: 'string' },
      record: { type: 'string' },
      'github-inspection': { type: 'string' },
      'expected-assets': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help || command === 'help') {
    usage();
    return;
  }
  if (command === 'create') {
    const output = required(values.output, 'output');
    if (path.basename(output) !== recordAssetName) {
      throw new Error(`--output must name ${recordAssetName}.`);
    }
    const publicationRecord = createStableOperationPublicationRecord({
      authority: readJsonFile(required(values.authority, 'authority'), 'authority'),
      control: readJsonFile(required(values.control, 'control'), 'control'),
      consumption: readJsonFile(required(values.consumption, 'consumption'), 'consumption'),
      sourceGateBytes: readRegularBytes(required(values['source-gate'], 'source-gate'), 'source-gate'),
      preNonceGuardBytes: readRegularBytes(required(values['pre-nonce-guard'], 'pre-nonce-guard'), 'pre-nonce-guard'),
      runAuthorityReconcileBytes: readRegularBytes(
        required(values['run-authority-reconcile'], 'run-authority-reconcile'),
        'run-authority-reconcile',
      ),
      repository: required(values.repository, 'repository'),
      tag: required(values.tag, 'tag'),
      plannedAssets: readJsonFile(required(values['planned-assets'], 'planned-assets'), 'planned-assets'),
    });
    writeCanonicalOutput(output, publicationRecord);
    process.stdout.write(`${canonicalJson({
      status: 'recorded',
      output: path.resolve(output),
      publication_record_digest: publicationRecord.publication_record_digest,
    })}\n`);
    return;
  }
  if (command === 'verify-published') {
    const binding = createStableOperationPublishedCarrierBinding({
      record: readJsonFile(required(values.record, 'record'), 'record'),
      githubInspection: readJsonFile(required(values['github-inspection'], 'github-inspection'), 'github-inspection'),
      expectedAssets: readJsonFile(required(values['expected-assets'], 'expected-assets'), 'expected-assets'),
    });
    process.stdout.write(`${canonicalJson(binding)}\n`);
    return;
  }
  usage();
  throw new Error(`Unknown command: ${command || '<none>'}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
