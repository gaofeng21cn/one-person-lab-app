#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAppReleaseL5EvidenceReadout,
  validateAppReleaseL5ReadoutContract,
} from './app-release-l5-readout.ts';
import {
  applyReleaseEvidenceBundleDirArg,
  defaultReleaseEvidenceBundleDir,
  resolveEvidenceBundlePath as resolveBundlePath,
  resolveRequiredReleaseEvidenceBundleDir,
} from './release-evidence-paths.ts';
import { asRecord, readJsonFile } from './release-json-helpers.ts';
import {
  normalizeReleaseEvidenceCohort,
  unknownReleaseEvidenceCohort,
} from './release-evidence-cohort.ts';
import { assertImageEvidenceFile } from './release-image-evidence.ts';
import { validateJsonEvidenceShape } from './release-evidence-json-shape-validator.ts';
import type { ReleaseEvidenceCohort, UnknownReleaseEvidenceCohort } from './release-evidence-cohort.ts';
import type { ImageEvidencePolicy } from './release-image-evidence.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseContractPath = path.join(appRoot, 'contracts', 'app-release-channel.json');
const evidenceBoundary = 'refs_only_no_runtime_truth_domain_truth_artifact_or_quality_authority';
const typedBlockerPathPattern = 'typed-blockers/<artifact_id>.json';

type Options = {
  bundleDir: string;
  allowMissingEvidence: boolean;
  requiredConditionals: string[];
};

type EvidenceArtifact = {
  id: string;
  path: string;
  kind: 'json' | 'image' | 'log';
  producer: string;
  frameworkV2Producer?: string;
  source_kind: string;
};

type EvidenceContract = {
  manifestPath: string;
  artifacts: EvidenceArtifact[];
  conditionalArtifacts: EvidenceArtifact[];
  optionalDiagnostics: EvidenceArtifact[];
  imageEvidencePolicy: ImageEvidencePolicy;
  typedBlockerPolicy: TypedBlockerPolicy;
  l5ReadoutContract: unknown;
};

type ManifestArtifact = EvidenceArtifact & {
  status: 'present' | 'missing' | 'typed_blocker' | 'not_applicable';
  reason?: string;
  missing_reason?: string;
  typed_blocker_ref?: string;
  typed_blocker_path?: string;
  not_applicable_reason?: string;
};

type TypedBlockerPolicy = {
  root: string;
  pathPattern: string;
  requiredFields: string[];
};

type KnownOrUnknownReleaseCohort = ReleaseEvidenceCohort | UnknownReleaseEvidenceCohort;

type AppReleaseEvidenceBundleContract = {
  purpose?: unknown;
  manifest_path?: unknown;
  acceptance_path?: unknown;
  release_evidence_contract?: unknown;
  refs_only?: unknown;
  surface_ownership?: Record<string, unknown>;
  required_artifacts?: unknown;
  framework_v2_producers?: Record<string, string>;
  conditional_artifacts?: unknown;
  optional_diagnostic_artifacts?: unknown;
  forbidden_authority?: unknown;
  release_cohort?: Record<string, unknown>;
  missing_evidence_policy?: Record<string, unknown>;
  image_evidence_policy?: ImageEvidencePolicy;
  l5_evidence_readout?: unknown;
};

function parseArgs(argv: string[]): Options {
  const parsed = {
    bundleDir: defaultReleaseEvidenceBundleDir(),
    allowMissingEvidence: false,
    requiredConditionals: (process.env.OPL_RELEASE_EVIDENCE_REQUIRED_CONDITIONALS || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--allow-missing-evidence') {
      parsed.allowMissingEvidence = true;
      continue;
    }
    if (token === '--require-conditional') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --require-conditional');
      }
      parsed.requiredConditionals.push(value);
      index += 1;
      continue;
    }
    const optionIndex = applyReleaseEvidenceBundleDirArg(argv, index, (value) => {
      parsed.bundleDir = value;
    });
    if (optionIndex !== null) {
      index = optionIndex;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return {
    bundleDir: resolveRequiredReleaseEvidenceBundleDir(parsed.bundleDir),
    allowMissingEvidence: parsed.allowMissingEvidence,
    requiredConditionals: [...new Set(parsed.requiredConditionals)],
  };
}

function assertFile(filePath: string, label: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`${label} must be a file: ${filePath}`);
  }
}

function assertJsonFile(filePath: string, label: string) {
  assertFile(filePath, label);
  try {
    return readJsonFile(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} must be valid JSON: ${message}`);
  }
}

function assertImageFile(filePath: string, label: string, policy: ImageEvidencePolicy) {
  assertFile(filePath, label);
  assertImageEvidenceFile(filePath, label, policy);
}

function assertLogFile(filePath: string, label: string) {
  assertFile(filePath, label);
  if (!fs.readFileSync(filePath, 'utf8').trim()) {
    throw new Error(`${label} must not be empty: ${filePath}`);
  }
}

function validateManifestReleaseCohort(
  manifest: Record<string, unknown>,
  options: { requireKnown: boolean },
): KnownOrUnknownReleaseCohort {
  if (manifest.release_cohort === undefined) {
    if (options.requireKnown) {
      throw new Error('Evidence manifest release_cohort is required for packaged App evidence.');
    }
    return unknownReleaseEvidenceCohort('release_cohort was not declared in this partial evidence bundle');
  }
  const record = asRecord(manifest.release_cohort, 'evidence manifest release_cohort');
  let cohort: KnownOrUnknownReleaseCohort;
  if (record.status === 'unknown') {
    if (record.schema !== 'opl_app_release_evidence_cohort.v1') {
      throw new Error('release_cohort.schema must be opl_app_release_evidence_cohort.v1.');
    }
    if (record.current_cohort_evidence !== false) {
      throw new Error('unknown release_cohort must set current_cohort_evidence=false.');
    }
    if (typeof record.reason !== 'string' || !record.reason.trim()) {
      throw new Error('unknown release_cohort must include reason.');
    }
    cohort = unknownReleaseEvidenceCohort(record.reason);
  } else {
    cohort = normalizeReleaseEvidenceCohort(record, 'evidence manifest release_cohort');
  }
  if (manifest.current_cohort_evidence !== undefined && manifest.current_cohort_evidence !== cohort.current_cohort_evidence) {
    throw new Error('Evidence manifest current_cohort_evidence must match release_cohort.current_cohort_evidence.');
  }
  if (options.requireKnown && cohort.current_cohort_evidence !== true) {
    throw new Error('Evidence manifest must declare a known current release_cohort before claiming packaged App evidence.');
  }
  return cohort;
}

function validateAppReleaseEvidenceBundleHeader(record: AppReleaseEvidenceBundleContract) {
  if (record.purpose !== 'app_release_evidence_acceptance') {
    throw new Error(`Unexpected App release evidence bundle purpose: ${String(record.purpose)}`);
  }
  if (record.manifest_path !== 'evidence-manifest.json') {
    throw new Error(`Unexpected App release evidence manifest path: ${String(record.manifest_path)}`);
  }
  if (record.acceptance_path !== 'App release verification') {
    throw new Error(`Unexpected App release evidence acceptance path: ${String(record.acceptance_path)}`);
  }
  if (record.release_evidence_contract !== 'contracts/app-release-channel.json#operator_evidence_bundle') {
    throw new Error(`Unexpected App release evidence contract ref: ${String(record.release_evidence_contract)}`);
  }
  if ('runtime_page_contract' in record) {
    throw new Error('App release evidence bundle must not use Runtime page as its contract owner.');
  }
  if (record.refs_only !== true) {
    throw new Error('App release evidence bundle must be refs-only.');
  }
}

function validateSurfaceOwnershipContract(record: AppReleaseEvidenceBundleContract) {
  const ownership = asRecord(record.surface_ownership, 'App release evidence surface_ownership');
  if (ownership.runtime_visual_evidence !== 'conditional_runtime_route_minimal_work_item_status_only') {
    throw new Error('Runtime evidence must be conditional and limited to minimal work-item status visual acceptance.');
  }
  if (ownership.full_drilldown_and_raw_diagnostics !== 'settings_maintenance_diagnostics_and_release_tooling') {
    throw new Error('Full drilldown and raw diagnostics must belong to Maintenance diagnostics and release tooling.');
  }
  if (
    ownership.maintenance_actions_and_receipts
    !== 'settings_maintenance_and_release_tooling'
  ) {
    throw new Error('Maintenance actions and receipts must belong to Settings Maintenance and release tooling.');
  }
  const runtimeExcludes = ownership.runtime_page_excludes;
  if (
    !Array.isArray(runtimeExcludes)
    || ![
      'full_drilldown',
      'safe_action_catalog',
      'operator_receipts',
      'software_update_controls',
      'provider_repair_controls',
    ].every((entry) => runtimeExcludes.includes(entry))
  ) {
    throw new Error('Runtime exclusions must cover drilldown, safe actions, receipts, updates, and provider repair.');
  }
}

function validateReleaseCohortContract(record: AppReleaseEvidenceBundleContract) {
  if (record.release_cohort?.schema !== 'opl_app_release_evidence_cohort_contract.v1') {
    throw new Error('Operator evidence bundle must declare release_cohort contract.');
  }
  if (record.release_cohort?.packaged_app_evidence_requires_current_cohort !== true) {
    throw new Error('Operator evidence bundle must require current release cohort before packaged App evidence.');
  }
  const cohortFields = record.release_cohort?.required_manifest_fields;
  if (
    !Array.isArray(cohortFields) ||
    !['version', 'tag', 'channel', 'source', 'current_cohort_evidence'].every((field) => cohortFields.includes(field))
  ) {
    throw new Error('Operator evidence bundle release_cohort contract must require version, tag, channel, source, and current_cohort_evidence.');
  }
  const sameCohortChecks = record.release_cohort?.same_cohort_checks;
  if (
    !Array.isArray(sameCohortChecks) ||
    !sameCohortChecks.includes('remote_release_verification.version_tag_match')
  ) {
    throw new Error('Operator evidence bundle release_cohort contract must require remote release version/tag matching.');
  }
}

function validateMissingEvidencePolicyContract(record: AppReleaseEvidenceBundleContract): string[] {
  if (record.missing_evidence_policy?.default_validation !== 'fail_closed') {
    throw new Error('Operator evidence bundle missing evidence policy must fail closed by default.');
  }
  if (record.missing_evidence_policy?.allow_missing_evidence_flag !== '--allow-missing-evidence') {
    throw new Error('Operator evidence bundle missing evidence policy must declare --allow-missing-evidence.');
  }
  if (record.missing_evidence_policy?.missing_status !== 'missing_evidence') {
    throw new Error('Operator evidence bundle missing evidence policy must declare missing_evidence status.');
  }
  const allowedStatuses = record.missing_evidence_policy?.allowed_artifact_statuses;
  if (
    !Array.isArray(allowedStatuses) ||
    !['present', 'missing', 'typed_blocker', 'not_applicable'].every((status) => allowedStatuses.includes(status))
  ) {
    throw new Error('Operator evidence bundle must allow present, missing, typed_blocker, and not_applicable artifact statuses.');
  }
  const typedBlockerRequirements = record.missing_evidence_policy?.typed_blocker_status_requires;
  if (!Array.isArray(typedBlockerRequirements) || !['reason', 'typed_blocker_ref'].every((field) => typedBlockerRequirements.includes(field))) {
    throw new Error('Operator evidence bundle typed_blocker status must require reason and typed_blocker_ref.');
  }
  if (record.missing_evidence_policy?.typed_blocker_path_pattern !== typedBlockerPathPattern) {
    throw new Error(`Operator evidence bundle typed_blocker path pattern must be ${typedBlockerPathPattern}.`);
  }
  const notApplicableRequirements = record.missing_evidence_policy?.not_applicable_status_requires;
  if (
    !Array.isArray(notApplicableRequirements) ||
    !['reason', 'not_applicable_reason'].every((field) => notApplicableRequirements.includes(field))
  ) {
    throw new Error('Operator evidence bundle not_applicable status must require reason and not_applicable_reason.');
  }
  if (record.missing_evidence_policy?.packaged_app_evidence_requires !== 'all_required_artifacts_present_and_verified') {
    throw new Error('Operator evidence bundle must require all artifacts before claiming packaged App evidence.');
  }
  return typedBlockerRequirements as string[];
}

function validateImageEvidencePolicyContract(record: AppReleaseEvidenceBundleContract): ImageEvidencePolicy {
  const imageEvidencePolicy = asRecord(record.image_evidence_policy, 'operator evidence image_evidence_policy') as unknown as ImageEvidencePolicy;
  if (imageEvidencePolicy.applies_to_kind !== 'image') {
    throw new Error('Operator evidence bundle image evidence policy must apply to image artifacts.');
  }
  if (
    imageEvidencePolicy.minimum_width_px !== 640 ||
    imageEvidencePolicy.minimum_height_px !== 360 ||
    imageEvidencePolicy.minimum_file_size_bytes !== 4096 ||
    imageEvidencePolicy.placeholder_screenshot_allowed !== false
  ) {
    throw new Error('Operator evidence bundle image evidence policy must reject placeholder screenshots.');
  }
  return imageEvidencePolicy;
}

function validateForbiddenAuthority(record: AppReleaseEvidenceBundleContract) {
  const forbiddenAuthority = Array.isArray(record.forbidden_authority) ? record.forbidden_authority : [];
  for (const forbidden of [
    'runtime_truth',
    'provider_implementation',
    'domain_truth',
    'domain_quality_verdict',
    'domain_artifact_authority',
  ]) {
    if (!forbiddenAuthority.includes(forbidden)) {
      throw new Error(`Operator evidence bundle must exclude ${forbidden}`);
    }
  }
}

function validateEvidenceArtifactContractFields(artifact: EvidenceArtifact, errorLabel: string) {
  if (!artifact.id || !artifact.path || !artifact.kind || !artifact.producer || !artifact.source_kind) {
    throw new Error(`${errorLabel}: ${JSON.stringify(artifact)}`);
  }
}

function validateContractBoundary(bundle: unknown): EvidenceContract {
  const record = bundle as AppReleaseEvidenceBundleContract;
  validateAppReleaseEvidenceBundleHeader(record);
  validateSurfaceOwnershipContract(record);
  validateReleaseCohortContract(record);
  const typedBlockerRequirements = validateMissingEvidencePolicyContract(record);
  if (!Array.isArray(record.required_artifacts) || record.required_artifacts.length === 0) {
    throw new Error('Operator evidence bundle must declare required artifacts.');
  }
  validateAppReleaseL5ReadoutContract(record.l5_evidence_readout);
  const conditionalArtifacts = record.conditional_artifacts;
  if (conditionalArtifacts !== undefined && !Array.isArray(conditionalArtifacts)) {
    throw new Error('Operator evidence bundle conditional artifacts must be an array.');
  }
  const optionalDiagnostics = record.optional_diagnostic_artifacts;
  if (optionalDiagnostics !== undefined && !Array.isArray(optionalDiagnostics)) {
    throw new Error('Operator evidence bundle optional diagnostic artifacts must be an array.');
  }
  const imageEvidencePolicy = validateImageEvidencePolicyContract(record);
  validateForbiddenAuthority(record);
  for (const artifact of record.required_artifacts as EvidenceArtifact[]) {
    validateEvidenceArtifactContractFields(artifact, 'Invalid operator evidence artifact contract');
  }
  for (const artifact of (conditionalArtifacts ?? []) as EvidenceArtifact[]) {
    validateEvidenceArtifactContractFields(artifact, 'Invalid conditional operator evidence artifact contract');
  }
  for (const artifact of (optionalDiagnostics ?? []) as EvidenceArtifact[]) {
    validateEvidenceArtifactContractFields(artifact, 'Invalid optional operator evidence diagnostic artifact contract');
  }
  return {
    manifestPath: record.manifest_path,
    artifacts: (record.required_artifacts as EvidenceArtifact[]).map(artifact => ({
      ...artifact, frameworkV2Producer: record.framework_v2_producers?.[artifact.id],
    })),
    conditionalArtifacts: (conditionalArtifacts ?? []) as EvidenceArtifact[],
    optionalDiagnostics: (optionalDiagnostics ?? []) as EvidenceArtifact[],
    imageEvidencePolicy,
    typedBlockerPolicy: {
      root: 'typed-blockers/',
      pathPattern: typedBlockerPathPattern,
      requiredFields: typedBlockerRequirements as string[],
    },
    l5ReadoutContract: record.l5_evidence_readout,
  };
}

function validateManifestArtifact(manifestArtifact: unknown, expected: EvidenceArtifact): ManifestArtifact {
  const artifact = validateArtifactContractFields(manifestArtifact, expected, {
    recordLabel: 'manifest artifact',
    errorLabel: 'Manifest artifact',
  });
  if (
    artifact.status !== 'present' &&
    artifact.status !== 'missing' &&
    artifact.status !== 'typed_blocker' &&
    artifact.status !== 'not_applicable'
  ) {
    throw new Error(`Manifest artifact ${expected.id}.status must be present, missing, typed_blocker, or not_applicable.`);
  }
  if (artifact.status === 'missing' && typeof artifact.missing_reason !== 'string') {
    throw new Error(`Manifest artifact ${expected.id} must explain missing_reason.`);
  }
  if (artifact.status === 'typed_blocker') {
    if (typeof artifact.reason !== 'string' || !artifact.reason.trim()) {
      throw new Error(`Manifest artifact ${expected.id} typed_blocker must include reason.`);
    }
    if (typeof artifact.typed_blocker_ref !== 'string' || !artifact.typed_blocker_ref.trim()) {
      throw new Error(`Manifest artifact ${expected.id} typed_blocker must include typed_blocker_ref.`);
    }
  }
  if (artifact.status === 'not_applicable') {
    if (typeof artifact.reason !== 'string' || !artifact.reason.trim()) {
      throw new Error(`Manifest artifact ${expected.id} not_applicable must include reason.`);
    }
    if (typeof artifact.not_applicable_reason !== 'string' || !artifact.not_applicable_reason.trim()) {
      throw new Error(`Manifest artifact ${expected.id} not_applicable must include not_applicable_reason.`);
    }
  }
  return { ...artifact, frameworkV2Producer: expected.frameworkV2Producer } as ManifestArtifact;
}

function validateDiagnosticArtifact(manifestArtifact: unknown, expected: EvidenceArtifact): ManifestArtifact {
  const artifact = validateArtifactContractFields(manifestArtifact, expected, {
    recordLabel: 'diagnostic artifact',
    errorLabel: 'Diagnostic artifact',
  });
  if (artifact.status !== 'present') {
    throw new Error(`Diagnostic artifact ${expected.id}.status must be present when declared.`);
  }
  return artifact as ManifestArtifact;
}

function validateArtifactContractFields(
  manifestArtifact: unknown,
  expected: EvidenceArtifact,
  labels: { recordLabel: string; errorLabel: string },
): Record<string, unknown> {
  const artifact = asRecord(manifestArtifact, `${labels.recordLabel} ${expected.id}`);
  for (const key of ['id', 'path', 'kind', 'producer', 'source_kind'] as const) {
    if (key === 'producer' && expected.frameworkV2Producer && artifact.producer === expected.frameworkV2Producer) continue;
    if (artifact[key] !== expected[key]) {
      throw new Error(`${labels.errorLabel} ${expected.id}.${key} must match release contract.`);
    }
  }
  return artifact;
}

function validateMissingEvidenceList(manifest: Record<string, unknown>, missingArtifacts: ManifestArtifact[]) {
  const missingEvidence = manifest.missing_evidence;
  if (!Array.isArray(missingEvidence)) {
    throw new Error('Evidence manifest must declare missing_evidence array.');
  }
  const missingIds = new Set(missingArtifacts.map((artifact) => artifact.id));
  const declaredIds = new Set();
  for (const entry of missingEvidence) {
    const record = asRecord(entry, 'missing evidence entry');
    if (
      typeof record.id !== 'string' ||
      typeof record.path !== 'string' ||
      typeof record.status !== 'string' ||
      typeof record.reason !== 'string'
    ) {
      throw new Error('Missing evidence entries must include id, path, status, and reason.');
    }
    if (!missingIds.has(record.id)) {
      throw new Error(`Evidence manifest missing_evidence includes unexpected artifact ${record.id}.`);
    }
    const artifact = missingArtifacts.find((candidate) => candidate.id === record.id);
    if (!artifact) {
      throw new Error(`Evidence manifest missing_evidence includes unexpected artifact ${record.id}.`);
    }
    if (artifact?.status !== record.status) {
      throw new Error(`Evidence manifest missing_evidence ${record.id}.status must match artifact status.`);
    }
    if (record.status === 'typed_blocker' && record.typed_blocker_ref !== artifact.typed_blocker_ref) {
      throw new Error(`Evidence manifest missing_evidence ${record.id} must carry typed_blocker_ref.`);
    }
    if (record.status === 'not_applicable' && record.not_applicable_reason !== artifact.not_applicable_reason) {
      throw new Error(`Evidence manifest missing_evidence ${record.id} must carry not_applicable_reason.`);
    }
    declaredIds.add(record.id);
  }
  if (declaredIds.size !== missingIds.size || [...missingIds].some((id) => !declaredIds.has(id))) {
    throw new Error('Evidence manifest missing_evidence must match missing artifact statuses.');
  }
}

function validateTypedBlockerFile(filePath: string, artifact: ManifestArtifact, policy: TypedBlockerPolicy) {
  const blocker = asRecord(assertJsonFile(filePath, `${artifact.id} typed blocker`), `${artifact.id} typed blocker`);
  for (const field of policy.requiredFields) {
    if (!(field in blocker)) {
      throw new Error(`${artifact.id} typed blocker must include ${field}.`);
    }
  }
  if (blocker.artifact_id !== artifact.id) {
    throw new Error(`${artifact.id} typed blocker must match artifact_id.`);
  }
  if (typeof blocker.typed_blocker_ref !== 'string' || !blocker.typed_blocker_ref.trim()) {
    throw new Error(`${artifact.id} typed blocker must include a non-empty typed_blocker_ref.`);
  }
  if (typeof blocker.owner !== 'string' || !blocker.owner.trim()) {
    throw new Error(`${artifact.id} typed blocker must include owner.`);
  }
  if (typeof blocker.blocker_kind !== 'string' || !blocker.blocker_kind.trim()) {
    throw new Error(`${artifact.id} typed blocker must include blocker_kind.`);
  }
  if (typeof blocker.reason !== 'string' || !blocker.reason.trim()) {
    throw new Error(`${artifact.id} typed blocker must include reason.`);
  }
  if (!Array.isArray(blocker.evidence_refs) || blocker.evidence_refs.length === 0) {
    throw new Error(`${artifact.id} typed blocker must include evidence_refs.`);
  }
  if (!blocker.evidence_refs.every((entry) => typeof entry === 'string' && entry.trim())) {
    throw new Error(`${artifact.id} typed blocker evidence_refs must be non-empty strings.`);
  }
  if (typeof blocker.next_action !== 'string' || !blocker.next_action.trim()) {
    throw new Error(`${artifact.id} typed blocker must include next_action.`);
  }
  return {
    typed_blocker_ref: blocker.typed_blocker_ref,
    owner: blocker.owner,
    blocker_kind: blocker.blocker_kind,
    reason: blocker.reason,
    evidence_refs: blocker.evidence_refs,
    next_action: blocker.next_action,
  };
}

function validateBlockedEvidenceList(
  bundleDir: string,
  manifest: Record<string, unknown>,
  blockedArtifacts: ManifestArtifact[],
  policy: TypedBlockerPolicy,
  options: { validateFiles: boolean } = { validateFiles: true },
) {
  const blockedEvidence = manifest.blocked_evidence ?? [];
  if (!Array.isArray(blockedEvidence)) {
    throw new Error('Evidence manifest must declare blocked_evidence array.');
  }
  const blockedIds = new Set(blockedArtifacts.map((artifact) => artifact.id));
  const declaredIds = new Set();
  for (const entry of blockedEvidence) {
    const record = asRecord(entry, 'blocked evidence entry');
    if (typeof record.id !== 'string' || typeof record.path !== 'string' || typeof record.typed_blocker_path !== 'string') {
      throw new Error('Blocked evidence entries must include id, path, and typed_blocker_path.');
    }
    declaredIds.add(record.id);
  }
  if (declaredIds.size !== blockedIds.size || [...blockedIds].some((id) => !declaredIds.has(id))) {
    throw new Error('Evidence manifest blocked_evidence must match blocked artifact statuses.');
  }
  return blockedArtifacts.map((artifact) => {
    if (typeof artifact.typed_blocker_path !== 'string') {
      throw new Error(`Blocked artifact ${artifact.id} must include typed_blocker_path.`);
    }
    if (!artifact.typed_blocker_path.startsWith(policy.root)) {
      throw new Error(`Blocked artifact ${artifact.id} typed_blocker_path must stay under ${policy.root}.`);
    }
    const expectedPath = policy.pathPattern.replace('<artifact_id>', artifact.id);
    if (artifact.typed_blocker_path !== expectedPath) {
      throw new Error(`Blocked artifact ${artifact.id} typed_blocker_path must match ${policy.pathPattern}.`);
    }
    if (!options.validateFiles) {
      return {
        id: artifact.id,
        path: artifact.path,
        kind: artifact.kind,
        producer: artifact.producer,
        source_kind: artifact.source_kind,
        status: artifact.status,
        typed_blocker_path: artifact.typed_blocker_path,
        typed_blocker_ref: artifact.typed_blocker_ref,
      };
    }
    const blockerRef = validateTypedBlockerFile(resolveBundlePath(bundleDir, artifact.typed_blocker_path), artifact, policy);
    return {
      id: artifact.id,
      path: artifact.path,
      kind: artifact.kind,
      producer: artifact.producer,
      source_kind: artifact.source_kind,
      status: artifact.status,
      typed_blocker_path: artifact.typed_blocker_path,
      ...blockerRef,
    };
  });
}

function validatePresentEvidenceArtifactFile(
  bundleDir: string,
  artifact: ManifestArtifact,
  releaseCohort: KnownOrUnknownReleaseCohort,
  imageEvidencePolicy: ImageEvidencePolicy,
  unsupportedKindLabel: string,
) {
  const filePath = resolveBundlePath(bundleDir, artifact.path);
  if (artifact.kind === 'json') {
    const value = assertJsonFile(filePath, artifact.id);
    if (artifact.frameworkV2Producer) {
      const v2 = asRecord(value, artifact.id).api_version === '2.0';
      if (v2 !== (artifact.producer === artifact.frameworkV2Producer)) {
        throw new Error(`Manifest producer does not match the Framework response for ${artifact.id}.`);
      }
    }
    validateJsonEvidenceShape(artifact, value, releaseCohort);
  } else if (artifact.kind === 'image') {
    assertImageFile(filePath, artifact.id, imageEvidencePolicy);
  } else if (artifact.kind === 'log') {
    assertLogFile(filePath, artifact.id);
  } else {
    throw new Error(`Unsupported ${unsupportedKindLabel} kind: ${artifact.kind}`);
  }
}

function manifestEntriesById(entries: unknown[], label: string): Map<unknown, unknown> {
  return new Map(
    entries.map((entry) => {
      const record = asRecord(entry, label);
      return [record.id, entry];
    }),
  );
}

function unexpectedManifestIds(entries: Map<unknown, unknown>, expected: EvidenceArtifact[]): unknown[] {
  return [...entries.keys()].filter((id) => !expected.some((artifact) => artifact.id === id));
}

function validateEvidenceManifestHeader(manifest: Record<string, unknown>) {
  if (manifest.schema_version !== 1) {
    throw new Error(`Evidence manifest schema_version must be 1; got ${String(manifest.schema_version)}`);
  }
  if (manifest.purpose !== 'app_release_evidence_acceptance') {
    throw new Error(`Unexpected evidence manifest purpose: ${String(manifest.purpose)}`);
  }
  if (manifest.acceptance_path !== 'App release verification') {
    throw new Error(`Unexpected evidence manifest acceptance_path: ${String(manifest.acceptance_path)}`);
  }
  if (manifest.release_evidence_contract !== 'contracts/app-release-channel.json#operator_evidence_bundle') {
    throw new Error(`Unexpected evidence manifest release_evidence_contract: ${String(manifest.release_evidence_contract)}`);
  }
  if (Object.hasOwn(manifest, 'runtime_page_contract')) {
    throw new Error('Evidence manifest must not use Runtime page as its contract owner.');
  }
  if (manifest.refs_only !== true) {
    throw new Error('Evidence manifest must be refs-only.');
  }
  if (manifest.authority_boundary !== evidenceBoundary) {
    throw new Error(`Evidence manifest authority_boundary must be ${evidenceBoundary}.`);
  }
}

function validateEvidenceManifestCollections(manifest: Record<string, unknown>) {
  if (!Array.isArray(manifest.artifacts)) {
    throw new Error('Evidence manifest must declare artifacts array.');
  }
  if (manifest.diagnostics !== undefined && !Array.isArray(manifest.diagnostics)) {
    throw new Error('Evidence manifest diagnostics must be an array when present.');
  }
}

function validateBundle(bundleDir: string, options: Options) {
  const releaseContract = readJsonFile(releaseContractPath);
  const contract = validateContractBoundary(releaseContract.operator_evidence_bundle);
  const conditionalById = new Map(contract.conditionalArtifacts.map((artifact) => [artifact.id, artifact]));
  const unknownRequiredConditionals = options.requiredConditionals.filter((id) => !conditionalById.has(id));
  if (unknownRequiredConditionals.length > 0) {
    throw new Error(`Unknown required conditional evidence artifact(s): ${unknownRequiredConditionals.join(', ')}`);
  }
  const manifestPath = resolveBundlePath(bundleDir, contract.manifestPath);
  const manifest = asRecord(assertJsonFile(manifestPath, 'evidence-manifest'), 'evidence-manifest');
  validateEvidenceManifestHeader(manifest);
  validateEvidenceManifestCollections(manifest);

  const manifestArtifacts = manifestEntriesById(manifest.artifacts, 'evidence manifest artifact');
  const manifestConditionalIds = contract.conditionalArtifacts
    .filter((artifact) => manifestArtifacts.has(artifact.id))
    .map((artifact) => artifact.id);
  const activeConditionalIds = new Set([
    ...options.requiredConditionals,
    ...manifestConditionalIds,
  ]);
  const activeConditionalArtifacts = contract.conditionalArtifacts.filter((artifact) => activeConditionalIds.has(artifact.id));
  const activeArtifacts = [...contract.artifacts, ...activeConditionalArtifacts];
  const unexpectedIds = unexpectedManifestIds(manifestArtifacts, activeArtifacts);
  if (unexpectedIds.length > 0) {
    throw new Error(`Evidence manifest declares unknown artifact(s): ${unexpectedIds.join(', ')}`);
  }
  for (const artifactId of options.requiredConditionals) {
    if (!manifestArtifacts.has(artifactId)) {
      throw new Error(`Evidence manifest is missing required conditional artifact ${artifactId}`);
    }
  }
  const diagnostics = Array.isArray(manifest.diagnostics) ? manifest.diagnostics : [];
  const diagnosticArtifacts = manifestEntriesById(diagnostics, 'evidence manifest diagnostic artifact');
  const unexpectedDiagnosticIds = unexpectedManifestIds(diagnosticArtifacts, contract.optionalDiagnostics);
  if (unexpectedDiagnosticIds.length > 0) {
    throw new Error(`Evidence manifest declares unknown diagnostic artifact(s): ${unexpectedDiagnosticIds.join(', ')}`);
  }

  const verified: ManifestArtifact[] = [];
  const verifiedDiagnostics: ManifestArtifact[] = [];
  const missing: ManifestArtifact[] = [];
  const blocked: ManifestArtifact[] = [];
  const deferredPresent: ManifestArtifact[] = [];
  const allArtifactStates: ManifestArtifact[] = [];
  let blockedEvidence: ReturnType<typeof validateBlockedEvidenceList> = [];
  const releaseCohort = validateManifestReleaseCohort(manifest, {
    requireKnown: manifest.status === 'passed' || manifest.packaged_app_evidence === true,
  });

  for (const expected of activeArtifacts) {
    const entry = manifestArtifacts.get(expected.id);
    if (!entry) {
      throw new Error(`Evidence manifest is missing artifact ${expected.id}`);
    }
    const artifact = validateManifestArtifact(entry, expected);
    allArtifactStates.push(artifact);
    if (artifact.status === 'typed_blocker' && typeof artifact.typed_blocker_path === 'string') {
      blocked.push(artifact);
      continue;
    }
    if (artifact.status !== 'present') {
      missing.push(artifact);
      continue;
    }
    if ((manifest.status === 'missing_evidence' || manifest.status === 'blocked_evidence') && !options.allowMissingEvidence) {
      deferredPresent.push(artifact);
      continue;
    }

    validatePresentEvidenceArtifactFile(
      bundleDir,
      artifact,
      releaseCohort,
      contract.imageEvidencePolicy,
      'operator evidence artifact',
    );
    verified.push(artifact);
  }

  for (const expected of contract.optionalDiagnostics) {
    const entry = diagnosticArtifacts.get(expected.id);
    if (!entry) {
      continue;
    }
    const artifact = validateDiagnosticArtifact(entry, expected);
    validatePresentEvidenceArtifactFile(
      bundleDir,
      artifact,
      releaseCohort,
      contract.imageEvidencePolicy,
      'operator evidence diagnostic artifact',
    );
    verifiedDiagnostics.push(artifact);
  }

  if (missing.length > 0 || blocked.length > 0) {
    const expectedStatus = blocked.length > 0 ? 'blocked_evidence' : 'missing_evidence';
    if (manifest.status !== expectedStatus) {
      throw new Error(`Evidence manifest status must be ${expectedStatus} when required artifacts are ${blocked.length > 0 ? 'blocked' : 'missing'}.`);
    }
    if (manifest.packaged_app_evidence !== false) {
      throw new Error('Evidence manifest must set packaged_app_evidence=false while evidence is missing or blocked.');
    }
    validateMissingEvidenceList(manifest, missing);
    blockedEvidence = validateBlockedEvidenceList(bundleDir, manifest, blocked, contract.typedBlockerPolicy, { validateFiles: false });
    if (!options.allowMissingEvidence) {
      throw new Error(
        `Release evidence bundle is missing or blocked and cannot be used as packaged App evidence: ${[
          ...missing.map((artifact) => artifact.id),
          ...blocked.map((artifact) => artifact.id),
        ].join(', ')}`,
      );
    }
    for (const artifact of deferredPresent) {
      validatePresentEvidenceArtifactFile(
        bundleDir,
        artifact,
        releaseCohort,
        contract.imageEvidencePolicy,
        'operator evidence artifact',
      );
      verified.push(artifact);
    }
    blockedEvidence = validateBlockedEvidenceList(bundleDir, manifest, blocked, contract.typedBlockerPolicy);
  } else {
    if (manifest.status !== 'passed') {
      throw new Error('Evidence manifest status must be passed when all required artifacts are present.');
    }
    if (manifest.packaged_app_evidence !== true) {
      throw new Error('Evidence manifest must set packaged_app_evidence=true only when all artifacts are present and verified.');
    }
    validateMissingEvidenceList(manifest, []);
    validateBlockedEvidenceList(bundleDir, manifest, [], contract.typedBlockerPolicy);
  }

  const artifactStates = [
    ...allArtifactStates,
    ...blockedEvidence,
  ].map((artifact) => ({
    id: artifact.id,
    status: artifact.status,
    ...(artifact.typed_blocker_ref ? { typed_blocker_ref: artifact.typed_blocker_ref } : {}),
  }));
  const l5EvidenceReadout = buildAppReleaseL5EvidenceReadout({
    contract: contract.l5ReadoutContract,
    artifacts: artifactStates,
    releaseCohort,
  });

  return {
    schema: 'opl_release_evidence_bundle_validation.v1',
    status: blocked.length > 0 ? 'blocked_evidence' : missing.length > 0 ? 'missing_evidence' : 'passed',
    bundle_dir: bundleDir,
    manifest_path: contract.manifestPath,
    packaged_app_evidence: missing.length === 0 && blocked.length === 0,
    release_cohort: releaseCohort,
    current_cohort_evidence: releaseCohort.current_cohort_evidence === true,
    evidence_boundary: evidenceBoundary,
    authority_boundary: evidenceBoundary,
    forbidden_authority: [
      'runtime_truth',
      'provider_implementation',
      'domain_truth',
      'domain_quality_verdict',
      'domain_artifact_authority',
    ],
    verified_artifact_count: verified.length,
    verified_artifacts: verified.map((artifact) => ({
      id: artifact.id,
      path: artifact.path,
      kind: artifact.kind,
      producer: artifact.producer,
      source_kind: artifact.source_kind,
      status: artifact.status,
    })),
    verified_diagnostic_count: verifiedDiagnostics.length,
    verified_diagnostics: verifiedDiagnostics.map((artifact) => ({
      id: artifact.id,
      path: artifact.path,
      kind: artifact.kind,
      producer: artifact.producer,
      source_kind: artifact.source_kind,
      status: artifact.status,
    })),
    missing_artifact_count: missing.length,
    missing_artifacts: missing.map((artifact) => ({
      id: artifact.id,
      path: artifact.path,
      kind: artifact.kind,
      producer: artifact.producer,
      source_kind: artifact.source_kind,
      status: artifact.status,
      reason: artifact.reason ?? artifact.missing_reason,
      ...(artifact.missing_reason
        ? { missing_reason: artifact.missing_reason }
        : {}),
      ...(artifact.typed_blocker_ref
        ? { typed_blocker_ref: artifact.typed_blocker_ref }
        : {}),
      ...(artifact.not_applicable_reason
        ? { not_applicable_reason: artifact.not_applicable_reason }
        : {}),
    })),
    blocked_artifact_count: blocked.length,
    blocked_artifacts: blockedEvidence,
    l5_evidence_readout: l5EvidenceReadout,
  };
}

try {
  const options = parseArgs(process.argv.slice(2));
  console.log(`${JSON.stringify(validateBundle(options.bundleDir, options), null, 2)}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
