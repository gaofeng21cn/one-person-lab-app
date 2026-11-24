import crypto from 'node:crypto';

import {
  assertPromotionTargetIsNewerThanPublishedStable,
  type PublishedRelease,
} from '../stable-release-version-order.ts';
import { validateGithubOwnerReleaseNamespaceEvidence } from '../validate-release-source-gate.ts';
import { validateReleaseHomebrewDistribution } from '../validate-active-shell/release-homebrew-distribution-validator.ts';
import {
  resolveReleaseVersionIdentity,
  resolveStableReleaseVersion,
} from '../release-version.ts';
import type {
  JsonRecord,
  StableAdmissionFailureReceipt,
  StableAdmissionInput,
  StableAdmissionManifest,
  StableAdmissionObservation,
  WorkflowBlob,
} from './types.ts';

export const appRepository = 'gaofeng21cn/one-person-lab-app';
export const homebrewRepository = 'gaofeng21cn/homebrew-one-person-lab';
export const homebrewCaskPath = 'Casks/one-person-lab.rb';
export const stableAuthorityWorkflowPath = '.github/workflows/release-stable.yml';
export const shaPattern = /^[0-9a-f]{40}$/;
export const digestPattern = /^sha256:[0-9a-f]{64}$/;
export const requiredSecretNames = [
  'BUILD_CERTIFICATE_BASE64',
  'P12_PASSWORD',
  'APPLE_ID',
  'APPLE_ID_PASSWORD',
  'TEAM_ID',
  'IDENTITY',
] as const;
export const requiredWorkflowPaths = [
  '.github/workflows/release-stable.yml',
  '.github/workflows/_release-bundle.yml',
  '.github/workflows/_release-standard-publish.yml',
  'scripts/validate-release-source-gate.ts',
  'scripts/stable-release-admission-manifest.ts',
  'scripts/release-dispatch-guard.ts',
  'scripts/stable-operation-control.ts',
  'scripts/verify-apple-release-credentials.ts',
  'contracts/app-release-channel.json',
] as const;
export const activeReleaseStatuses = ['requested', 'queued', 'in_progress', 'waiting', 'pending'] as const;
export const activeRunLookupTimeoutMs = 10_000;
export const activeRunPageSize = 100;
export const releaseNamespacePageSize = 100;
export const releaseNamespacePageLimit = 20;
export type ActiveReleaseStatus = (typeof activeReleaseStatuses)[number];

export function object(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as JsonRecord;
}

export function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing.`);
  return value.trim();
}

export function fullSha(value: unknown, label: string): string {
  const normalized = requiredString(value, label).toLowerCase();
  if (!shaPattern.test(normalized)) throw new Error(`${label} must be an exact lowercase 40-character Git SHA.`);
  return normalized;
}

export function runId(value: unknown, label: string): string {
  const normalized = requiredString(value, label);
  if (!/^[1-9][0-9]*$/.test(normalized)) throw new Error(`${label} must be a positive GitHub Actions run id.`);
  return normalized;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

export function sha256Bytes(bytes: Buffer | string): string {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function classifyAdmissionFailure(message: string): StableAdmissionFailureReceipt['failure'] {
  if (/ETIMEDOUT|timed out|timeout|SIGTERM|signal: killed/i.test(message)) {
    return { class: 'transport', code: 'transport_timeout', message };
  }
  if (/network|could not resolve host|failed to connect|connection reset|unexpected EOF/i.test(message)) {
    return { class: 'transport', code: 'transport_error', message };
  }
  if (
    /HTTP 401|HTTP 403|bad credentials|authentication failed|requires authentication|credential lacks required push permission/i
      .test(message)
  ) {
    return { class: 'credential', code: 'credential_failure', message };
  }
  if (/HTTP 404|not found/i.test(message)) {
    return { class: 'not_found', code: 'not_found', message };
  }
  if (/did not return JSON|invalid response|bounded active-run page/i.test(message)) {
    return { class: 'protocol', code: 'invalid_response', message };
  }
  return { class: 'deterministic', code: 'admission_invariant_failed', message };
}

export function buildStableAdmissionFailureReceipt(options: {
  input: StableAdmissionInput;
  phase: StableAdmissionFailureReceipt['phase'];
  error: unknown;
  sourceGateDigest?: string | null;
  credentialReceiptDigest?: string | null;
  checkedAt?: string;
}): StableAdmissionFailureReceipt {
  const message = options.error instanceof Error ? options.error.message : String(options.error);
  return {
    schema: 'opl_stable_release_admission_failure.v1',
    status: 'failed',
    checked_at: options.checkedAt ?? new Date().toISOString(),
    operation: 'standard',
    intent: {
      kind: options.input.releaseIntent,
      product_change_summary: options.input.productChangeSummary,
      repair_or_publication_failure_allowed_to_allocate_version: false,
    },
    phase: options.phase,
    admission_run_id: options.input.admissionRunId,
    cohort: {
      app_sha: options.input.appRef,
      shell_sha: options.input.shellRef,
      framework_sha: options.input.frameworkRef,
    },
    failure: classifyAdmissionFailure(message),
    source_gate_digest: options.sourceGateDigest ?? null,
    credential_receipt_digest: options.credentialReceiptDigest ?? null,
    public_mutation_performed: false,
    old_authority_or_run_reusable: false,
    retry_disposition: 'repair_then_new_distinct_operation',
  };
}

export function stableAdmissionManifestDigest(value: Omit<StableAdmissionManifest, 'manifest_digest'>): string {
  return sha256Bytes(canonicalJson(value));
}

function sameStringSet(actual: unknown, expected: readonly string[]): boolean {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((entry) => typeof entry === 'string')
    && expected.every((entry) => actual.includes(entry));
}

function validateCredentialReceipt(
  receiptValue: unknown,
  input: StableAdmissionInput,
): { executorSha: string } {
  const receipt = object(receiptValue, 'Apple credential preflight receipt');
  const execution = object(receipt.execution, 'Apple credential preflight receipt execution');
  const signing = object(receipt.signing, 'Apple credential preflight receipt signing');
  const notarization = object(receipt.notarization, 'Apple credential preflight receipt notarization');
  const mutation = object(receipt.mutation, 'Apple credential preflight receipt mutation');
  const executorSha = fullSha(execution.head_sha, 'Apple credential preflight receipt executor SHA');
  if (
    receipt.schema !== 'opl_apple_release_credentials_preflight.v1'
    || receipt.status !== 'passed'
    || receipt.platform !== 'darwin'
    || receipt.protected_environment !== 'release-stable'
    || execution.environment !== 'github_actions'
    || execution.admission_eligible !== true
    || execution.repository !== appRepository
    || typeof execution.workflow_ref !== 'string'
    || !execution.workflow_ref.includes('/.github/workflows/release-stable.yml@refs/heads/main')
    || execution.run_id !== input.admissionRunId
    || execution.run_attempt !== 1
    || execution.event_name !== 'workflow_dispatch'
    || execution.ref !== 'refs/heads/main'
  ) {
    throw new Error('Apple credential receipt is not a first-attempt protected preflight for the App main executor.');
  }
  if (
    receipt.required_secret_count !== requiredSecretNames.length
    || !sameStringSet(receipt.required_secret_names, requiredSecretNames)
  ) {
    throw new Error('Apple credential receipt must prove the exact 6/6 protected secret names.');
  }
  if (
    signing.configured_identity_selector_resolved !== true
    || signing.configured_team_id_match !== true
    || signing.developer_id_application !== true
    || signing.hardened_runtime !== true
    || signing.trusted_timestamp !== true
    || signing.probe_codesign_strict !== 'passed'
  ) {
    throw new Error('Apple credential receipt does not prove the exact Developer ID signing runtime.');
  }
  if (
    notarization.authentication !== 'passed'
    || notarization.command !== 'xcrun notarytool history'
    || notarization.submission_performed !== false
    || mutation.release_dispatch_performed !== false
    || mutation.notarization_submission_performed !== false
    || mutation.public_asset_write_performed !== false
  ) {
    throw new Error('Apple credential receipt must prove read-only notarization authentication and zero release mutation.');
  }
  return { executorSha };
}

function normalizeVersionRef(value: string): string {
  return value.trim()
    .replace(/^refs\/tags\//, '')
    .replace(/\^\{\}$/, '')
    .replace(/^v/, '');
}

function baseVersionForDate(currentDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(currentDate);
  if (!match) throw new Error(`Admission current date must use YYYY-MM-DD, got ${currentDate}.`);
  return `${Number(match[1]) - 2000}.${Number(match[2])}.${Number(match[3])}`;
}

function sameDayVersions(baseVersion: string, refs: Iterable<string>): string[] {
  const escaped = baseVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}(?:-r[1-9])?$`);
  return [...new Set([...refs].map(normalizeVersionRef).filter((entry) => pattern.test(entry)))].sort();
}

function caskVersion(bytes: Buffer): string {
  const version = bytes.toString('utf8').match(/^\s*version\s+"([^"]+)"\s*$/m)?.[1] ?? '';
  if (!version) throw new Error('Homebrew Standard cask does not declare one literal version.');
  return version;
}

function validateWorkflowBlobs(blobs: WorkflowBlob[]): WorkflowBlob[] {
  const sorted = [...blobs].sort((left, right) => left.path.localeCompare(right.path));
  if (
    sorted.length !== requiredWorkflowPaths.length
    || !requiredWorkflowPaths.every((workflowPath) => sorted.some((entry) => entry.path === workflowPath))
  ) {
    throw new Error('Stable admission must bind the exact critical workflow, credential, contract, and verifier files.');
  }
  for (const entry of sorted) {
    fullSha(entry.git_blob_sha, `Git blob ${entry.path}`);
    if (!digestPattern.test(entry.sha256)) throw new Error(`Workflow file ${entry.path} has an invalid SHA-256.`);
  }
  return sorted;
}

function validateFrozenSourceGate(
  value: JsonRecord,
  expected: { appRef: string; shellRef: string; frameworkRef: string },
): {
  operationFingerprint: string;
  ownerReleaseNamespaceEvidenceDigest: string;
  ownerDraftReleaseTags: string[];
} {
  const cohort = object(value.admission?.immutable_cohort, 'Frozen source-gate cohort');
  const frozenAppReachable = Array.isArray(value.checks) && value.checks.some(
    (check: unknown) => check !== null
      && typeof check === 'object'
      && !Array.isArray(check)
      && (check as JsonRecord).id === 'app_frozen_commit_reachable'
      && (check as JsonRecord).status === 'passed',
  );
  const operationFingerprint = requiredString(value.operation_fingerprint, 'Frozen source-gate operation fingerprint');
  const ownerReleaseNamespace = validateGithubOwnerReleaseNamespaceEvidence(
    value.owner_release_namespace,
    appRepository,
  );
  if (
    value.schema !== 'opl_app_release_source_gate.v1'
    || value.status !== 'passed'
    || value.typed_blocker !== null
    || value.admission?.status !== 'passed'
    || cohort.app_sha !== expected.appRef
    || cohort.shell_sha !== expected.shellRef
    || cohort.framework_sha !== expected.frameworkRef
    || !frozenAppReachable
    || ownerReleaseNamespace.checked_at !== value.generated_at
  ) {
    throw new Error('Frozen source-gate evidence does not prove the exact reachable Stable cohort.');
  }
  return {
    operationFingerprint,
    ownerReleaseNamespaceEvidenceDigest: ownerReleaseNamespace.evidence_digest,
    ownerDraftReleaseTags: ownerReleaseNamespace.draft_reservations.map((reservation) => reservation.tag),
  };
}

export function buildStableReleaseAdmissionManifest(
  inputValue: StableAdmissionInput,
  observation: StableAdmissionObservation,
): StableAdmissionManifest {
  const input = {
    baseVersion: requiredString(inputValue.baseVersion, 'Stable base version'),
    releaseIntent: requiredString(inputValue.releaseIntent, 'Release intent'),
    productChangeSummary: requiredString(inputValue.productChangeSummary, 'Product change summary'),
    appRef: fullSha(inputValue.appRef, 'App ref'),
    shellRef: fullSha(inputValue.shellRef, 'Shell ref'),
    frameworkRef: fullSha(inputValue.frameworkRef, 'Framework ref'),
    admissionRunId: runId(inputValue.admissionRunId, 'Admission run id'),
  };
  if (input.releaseIntent !== 'new_product') {
    throw new Error('Stable version allocation requires release_intent=new_product.');
  }
  if (input.baseVersion !== baseVersionForDate(observation.currentDate)) {
    throw new Error(
      `Stable admission base version ${input.baseVersion} must match Asia/Shanghai date ${observation.currentDate}.`,
    );
  }
  const workflowBlobs = validateWorkflowBlobs(observation.workflowBlobs);
  const sourceGate = validateFrozenSourceGate(observation.sourceGate, input);
  const credentialReceipt = validateCredentialReceipt(observation.credentialReceipt, input);
  if (observation.activeReleaseRuns.length > 0) {
    throw new Error(
      `Stable admission requires zero other active Stable authority runs; found ${observation.activeReleaseRuns
        .map((entry) => `${entry.id}:${entry.status}:${entry.path}`)
        .join(', ')}.`,
    );
  }

  validateReleaseHomebrewDistribution(observation.homebrewPolicy);
  if (
    observation.homebrewCask.repository !== homebrewRepository
    || observation.homebrewCask.path !== homebrewCaskPath
  ) {
    throw new Error('Homebrew Standard cask observation is outside the contracted repository or path.');
  }
  const homebrewVersion = caskVersion(observation.homebrewCask.bytes);
  const publishedTags = observation.publishedReleases
    .map((release) => release.tagName ?? release.tag_name ?? '')
    .filter(Boolean);
  const namespaceRefs = [
    ...publishedTags,
    ...sourceGate.ownerDraftReleaseTags,
    ...observation.tagRefs,
    homebrewVersion,
  ];
  const resolution = resolveStableReleaseVersion(input.baseVersion, namespaceRefs);
  const highest = assertPromotionTargetIsNewerThanPublishedStable(
    resolution.version,
    observation.publishedReleases,
  );
  const identity = resolveReleaseVersionIdentity('stable', resolution.version);
  const selectedVersion = resolution.version;
  const normalizedPublishedTags = publishedTags.map(normalizeVersionRef);
  const normalizedTagRefs = observation.tagRefs.map(normalizeVersionRef);
  if (
    normalizedPublishedTags.includes(selectedVersion)
    || normalizedTagRefs.includes(selectedVersion)
    || normalizeVersionRef(homebrewVersion) === selectedVersion
  ) {
    throw new Error(`Allocated Stable version ${selectedVersion} is already occupied in a release namespace.`);
  }
  const homebrewPolicy = object(
    observation.homebrewPolicy.homebrew_tap_distribution,
    'App Homebrew release policy',
  );
  const caskPolicy = object(homebrewPolicy.cask_install_policy, 'Homebrew cask install policy');
  const tapPolicy = object(homebrewPolicy.tap_update_policy, 'Homebrew tap update policy');
  const sameDay = sameDayVersions(input.baseVersion, namespaceRefs);
  const observedNamespaceVersions = [...new Set(namespaceRefs.map(normalizeVersionRef))].sort();
  const core: Omit<StableAdmissionManifest, 'manifest_digest'> = {
    schema: 'opl_stable_release_admission_manifest.v1',
    status: 'passed',
    checked_at: observation.checkedAt,
    operation: 'standard',
    intent: {
      kind: 'new_product',
      product_change_summary: input.productChangeSummary,
      repair_or_publication_failure_allowed_to_allocate_version: false,
    },
    version: {
      base: input.baseVersion,
      display: selectedVersion,
      updater: identity.updaterVersion,
      tag: identity.tag,
      current_date: observation.currentDate,
      revision: resolution.revision,
    },
    cohort: {
      app_sha: input.appRef,
      shell_sha: input.shellRef,
      framework_sha: input.frameworkRef,
    },
    workflow_blobs: workflowBlobs,
    apple_credentials: {
      producer_run_id: input.admissionRunId,
      producer_workflow: '.github/workflows/release-stable.yml',
      protected_environment: 'release-stable',
      executor_sha: credentialReceipt.executorSha,
      receipt_sha256: sha256Bytes(observation.credentialReceiptBytes),
      required_secret_names: [...requiredSecretNames],
      required_secret_count: 6,
      signing_status: 'passed',
      notarization_authentication: 'passed',
      submission_performed: false,
    },
    source_gate: {
      producer_run_id: input.admissionRunId,
      producer_workflow: '.github/workflows/release-stable.yml',
      artifact_name: `opl-stable-operation-control-${input.admissionRunId}`,
      source_gate_digest: sha256Bytes(observation.sourceGateBytes),
      source_gate_file_sha256: sha256Bytes(observation.sourceGateBytes),
      operation_fingerprint: sourceGate.operationFingerprint,
      owner_release_namespace_evidence_digest: sourceGate.ownerReleaseNamespaceEvidenceDigest,
      owner_draft_reservation_count: sourceGate.ownerDraftReleaseTags.length,
      frozen_cohort_reachable: true,
      full_source_gate_rerun: false,
      release_authority: false,
      namespace_reservation: false,
      final_signed_byte_authority: false,
    },
    allocator: {
      observed_namespace_versions: observedNamespaceVersions,
      observed_same_day_versions: sameDay,
      highest_published_stable: requiredString(
        highest.tagName,
        'Highest published Stable release',
      ),
      selected_version: selectedVersion,
      selected_updater_version: identity.updaterVersion,
    },
    namespace: {
      github_release_tags: sameDayVersions(input.baseVersion, publishedTags),
      owner_draft_release_tags: sameDayVersions(input.baseVersion, sourceGate.ownerDraftReleaseTags),
      github_tag_refs: sameDayVersions(input.baseVersion, observation.tagRefs),
      webui_tags: sameDayVersions(input.baseVersion, observation.webuiTags),
      homebrew_standard_cask_version: homebrewVersion,
      target_release_absent: true,
      target_tag_absent: true,
      target_webui_tag_replaceable: true,
      target_homebrew_version_absent: true,
    },
    homebrew_policy: {
      repository: observation.homebrewCask.repository,
      cask_path: observation.homebrewCask.path,
      cask_git_blob_sha: fullSha(
        observation.homebrewCask.git_blob_sha,
        'Homebrew cask Git blob',
      ),
      cask_sha256: sha256Bytes(observation.homebrewCask.bytes),
      contract_sha256: sha256Bytes(canonicalJson(homebrewPolicy)),
      standard_cask_install_ref: requiredString(
        caskPolicy.standard_cask_install_ref,
        'Homebrew standard cask install ref',
      ),
      mutation_owner: requiredString(
        tapPolicy.default_workflow_repo,
        'Homebrew mutation owner',
      ),
      write_mode: requiredString(
        tapPolicy.app_release_workflow_write_mode,
        'Homebrew write mode',
      ),
    },
    active_release_runs: [],
    dispatcher_contract: {
      workflow: '.github/workflows/release-stable.yml',
      ref: 'main',
      artifact_name: `opl-stable-admission-${input.admissionRunId}`,
      accepted_inputs: ['operation', 'authority_id', 'operation_id', 'authority_carrier', 'authority_digest', 'desktop_additional_platforms'],
      raw_standard_version_or_ref_inputs_allowed: false,
      unknown_result_policy: 'read_only_reconcile_without_rerun_redispatch_or_cancel',
    },
  };
  return {
    ...core,
    manifest_digest: stableAdmissionManifestDigest(core),
  };
}

export function firstDifference(actual: unknown, expected: unknown, pointer = '$'): string | null {
  if (Object.is(actual, expected)) return null;
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) return `${pointer}.length`;
    for (let index = 0; index < actual.length; index += 1) {
      const difference = firstDifference(actual[index], expected[index], `${pointer}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  if (
    actual && expected
    && typeof actual === 'object' && typeof expected === 'object'
    && !Array.isArray(actual) && !Array.isArray(expected)
  ) {
    const keys = [...new Set([
      ...Object.keys(actual as JsonRecord),
      ...Object.keys(expected as JsonRecord),
    ])].sort();
    for (const key of keys) {
      const difference = firstDifference(
        (actual as JsonRecord)[key],
        (expected as JsonRecord)[key],
        `${pointer}.${key}`,
      );
      if (difference) return difference;
    }
    return null;
  }
  return pointer;
}
