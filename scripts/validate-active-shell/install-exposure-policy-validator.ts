import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertDeepEqualJson, assertIncludesAll, readJson } from './assertions.ts';
import {
  forbiddenAuthorityOwners,
} from './app-contract-constants.ts';
import { validateInstallExposureRuntimeAndDistribution } from './install-exposure-runtime-distribution-validator.ts';
import { assertFirstRunProgressModelShape, assertNonEmptyStringArray } from './shared-contract-validators.ts';
import { productProfilePath } from './validation-config.ts';

const productProfile = readJson(productProfilePath);
const expectedFirstRunProgressModel = productProfile.first_run?.progress_model;
const expectedFirstRunCoreItems = assertNonEmptyStringArray(
  productProfile.first_run?.ready_to_launch_gate?.required_core_items,
  'Product profile ready_to_launch required_core_items',
);
const expectedFirstConversation = productProfile.first_run?.first_conversation;
const expectedFirstConversationMustWaitFor = assertNonEmptyStringArray(
  expectedFirstConversation?.must_wait_for,
  'Product profile first conversation must_wait_for',
);
const expectedFirstConversationFailurePolicy = expectedFirstConversation?.failure_policy;
const expectedFullReadinessItems = (productProfile.first_run?.full_readiness_layers ?? [])
  .filter((item) => item !== 'core');
assertFirstRunProgressModelShape(expectedFirstRunProgressModel, 'Product profile first-run progress model');

export const componentInteroperabilityRef =
  'contracts/app-install-exposure-policy.json#component_interoperability';
const frameworkCompatibilityProducerContractRef =
  'contracts/opl-framework/app-component-compatibility-receipt-contract.json';
const compatibilityRequirementKinds = [
  'capability_id_with_versioned_schema',
  'minimum_version',
  'semver_range',
];
const compatibilityFailureCodes = [
  'incompatible_missing_capability',
  'incompatible_capability_schema',
  'incompatible_minimum_version',
  'incompatible_semver_range',
];
const forbiddenCompatibilityFailureCodes = [
  'cross_component_sha_mismatch',
  'cross_component_version_mismatch',
  'same_cohort_mismatch',
  'bundle_digest_mismatch',
  'bom_mismatch',
];
const componentKinds = ['opl_app', 'opl_shell', 'opl_framework', 'opl_base', 'opl_package'];
const sha256Pattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;

function objectRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function exactSha256(value, label) {
  const digest = nonEmptyString(value, label).toLowerCase();
  if (!sha256Pattern.test(digest)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return digest;
}

function exactCommit(value, label) {
  const commit = nonEmptyString(value, label).toLowerCase();
  if (!commitPattern.test(commit)) {
    throw new Error(`${label} must be a lowercase 40-character Git commit`);
  }
  return commit;
}

function exactIsoTimestamp(value, label) {
  const timestamp = Date.parse(nonEmptyString(value, label));
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new Error(`${label} must be an exact ISO timestamp`);
  }
  return timestamp;
}

export function componentCompatibilityRequirementsSha256(requirements) {
  return createHash('sha256').update(JSON.stringify(requirements), 'utf8').digest('hex');
}

function validateCompatibilityRequirement(requirement) {
  const item = objectRecord(requirement, 'Component compatibility requirement');
  const requirementId = nonEmptyString(item.requirement_id, 'Component compatibility requirement_id');
  const componentId = nonEmptyString(item.component_id, 'Component compatibility component_id');
  if (!compatibilityRequirementKinds.includes(item.kind)) {
    throw new Error(`Unsupported component compatibility requirement kind: ${String(item.kind)}`);
  }
  if (
    item.kind === 'capability_id_with_versioned_schema' &&
    (typeof item.capability_id !== 'string' ||
      !item.capability_id ||
      typeof item.schema_range !== 'string' ||
      !item.schema_range)
  ) {
    throw new Error('Capability compatibility requirement must declare capability_id and schema_range');
  }
  if (
    ['minimum_version', 'semver_range'].includes(item.kind) &&
    (typeof item.version_requirement !== 'string' || !item.version_requirement)
  ) {
    throw new Error('Version compatibility requirement must declare version_requirement');
  }
  return { item, requirementId, componentId };
}

function validateObservedComponent(component) {
  const item = objectRecord(component, 'Observed component');
  const componentId = nonEmptyString(item.component_id, 'Observed component_id');
  nonEmptyString(item.owner_authority, `Observed component ${componentId} owner_authority`);
  nonEmptyString(item.version, `Observed component ${componentId} version`);
  nonEmptyString(item.observation_ref, `Observed component ${componentId} observation_ref`);
  if (item.commit !== undefined) {
    exactCommit(item.commit, `Observed component ${componentId} commit`);
  }
  if (!Array.isArray(item.capabilities)) {
    throw new Error(`Observed component ${componentId} must declare capabilities`);
  }
  const capabilityIds = new Set();
  for (const capability of item.capabilities) {
    const capabilityRecord = objectRecord(capability, `Observed component ${componentId} capability`);
    const capabilityId = nonEmptyString(
      capabilityRecord.capability_id,
      `Observed component ${componentId} capability_id`,
    );
    nonEmptyString(
      capabilityRecord.schema_version,
      `Observed component ${componentId} capability ${capabilityId} schema_version`,
    );
    if (capabilityIds.has(capabilityId)) {
      throw new Error(`Observed component ${componentId} repeats capability ${capabilityId}`);
    }
    capabilityIds.add(capabilityId);
  }
  return { item, componentId };
}

export function validateComponentCompatibilityReceipt(receipt, context = {}) {
  const record = objectRecord(receipt, 'Component compatibility receipt');
  const normalizeDigest = (value, label) =>
    exactSha256(nonEmptyString(value, label).replace(/^sha256:/, ''), label);
  if (
    record.schema !== 'opl_component_compatibility_receipt.v1' ||
    record.contract_ref !== `${componentInteroperabilityRef}.compatibility_admission`
  ) {
    throw new Error('Framework compatibility receipt must bind the canonical interoperability contract');
  }
  if (record.owner !== 'one-person-lab' || record.producer_role !== 'opl_framework') {
    throw new Error('Framework compatibility receipt must bind owner one-person-lab and producer role opl_framework');
  }
  if (record.producer_contract_ref !== frameworkCompatibilityProducerContractRef) {
    throw new Error('Framework compatibility receipt must bind the canonical Framework producer contract');
  }
  const producerIdentity = objectRecord(
    record.producer_identity,
    'Framework compatibility receipt producer_identity',
  );
  const normalizedProducerIdentity = {
    command_surface: nonEmptyString(
      producerIdentity.command_surface,
      'Framework compatibility producer command_surface',
    ),
    executable_path: nonEmptyString(
      producerIdentity.executable_path,
      'Framework compatibility producer executable_path',
    ),
    executable_sha256: normalizeDigest(
      producerIdentity.executable_sha256,
      'Framework compatibility producer executable SHA-256',
    ),
    framework_version: nonEmptyString(
      producerIdentity.framework_version,
      'Framework compatibility producer framework_version',
    ),
    package_ref: nonEmptyString(
      producerIdentity.package_ref,
      'Framework compatibility producer package_ref',
    ),
  };
  if (normalizedProducerIdentity.command_surface !== 'opl app compatibility receipt') {
    throw new Error('Framework compatibility receipt producer command surface is invalid');
  }
  if (context.expected_producer_identity === undefined) {
    throw new Error('Framework compatibility receipt requires an executed producer identity binding');
  }
  if (
    JSON.stringify(normalizedProducerIdentity) !==
    JSON.stringify(context.expected_producer_identity)
  ) {
    throw new Error('Framework compatibility receipt producer identity does not match the executed Framework');
  }
  const receiptRef = nonEmptyString(record.receipt_ref, 'Framework compatibility receipt_ref');
  if (context.expected_receipt_path === undefined) {
    throw new Error('Framework compatibility receipt requires an executed output path binding');
  }
  const expectedReceiptRef = pathToFileURL(path.resolve(context.expected_receipt_path)).href;
  if (receiptRef !== expectedReceiptRef) {
    throw new Error('Framework compatibility receipt_ref does not bind the CLI-selected output path');
  }
  if (!['compatible', 'incompatible'].includes(record.status)) {
    throw new Error('Component compatibility receipt status must be compatible or incompatible');
  }
  const generatedAt = exactIsoTimestamp(record.generated_at, 'Framework compatibility receipt generated_at');
  const issuedAt = exactIsoTimestamp(record.issued_at, 'Framework compatibility receipt issued_at');
  const expiresAt = exactIsoTimestamp(record.expires_at, 'Framework compatibility receipt expires_at');
  const maxAgeSeconds = Number(context.max_age_seconds ?? 300);
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new Error('Framework compatibility receipt max age must be a positive integer');
  }
  const nowValue = context.now instanceof Date ? context.now : new Date(context.now ?? Date.now());
  const now = nowValue.getTime();
  if (
    generatedAt !== issuedAt ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > maxAgeSeconds * 1_000 ||
    issuedAt > now ||
    now - issuedAt > maxAgeSeconds * 1_000 ||
    now >= expiresAt
  ) {
    throw new Error('Framework compatibility receipt is expired, future-dated, or exceeds the allowed freshness window');
  }
  const freshness = objectRecord(record.freshness, 'Framework compatibility receipt freshness');
  if (
    freshness.status !== 'fresh' ||
    freshness.generated_at !== record.generated_at ||
    freshness.max_age_seconds !== Math.round((expiresAt - issuedAt) / 1_000)
  ) {
    throw new Error('Framework compatibility receipt freshness metadata is inconsistent');
  }
  const sources = objectRecord(record.sources, 'Framework compatibility receipt sources');
  const requirementSource = objectRecord(sources.requirements, 'Framework compatibility requirements source');
  const subjectSource = objectRecord(sources.subject, 'Framework compatibility subject source');
  if (
    requirementSource.owner !== 'one-person-lab-app' ||
    requirementSource.schema !== 'opl_component_compatibility_requirements.v1' ||
    subjectSource.owner !== 'one-person-lab-app' ||
    subjectSource.schema !== 'opl_app_compatibility_subject.v1'
  ) {
    throw new Error('Framework compatibility receipt sources must remain App-owned requirements and subject files');
  }
  const normalizedSources = {
    requirements: {
      path: nonEmptyString(requirementSource.path, 'Framework compatibility requirements source path'),
      sha256: normalizeDigest(
        requirementSource.sha256,
        'Framework compatibility requirements source SHA-256',
      ),
    },
    subject: {
      path: nonEmptyString(subjectSource.path, 'Framework compatibility subject source path'),
      sha256: normalizeDigest(subjectSource.sha256, 'Framework compatibility subject source SHA-256'),
    },
  };
  if (context.expected_sources !== undefined) {
    const expectedSources = objectRecord(context.expected_sources, 'Expected compatibility sources');
    for (const sourceName of ['requirements', 'subject']) {
      const expected = objectRecord(expectedSources[sourceName], `Expected ${sourceName} source`);
      const actual = normalizedSources[sourceName];
      if (
        actual.path !== expected.path ||
        actual.sha256 !== normalizeDigest(expected.sha256, `Expected ${sourceName} source SHA-256`)
      ) {
        throw new Error(`Framework compatibility receipt ${sourceName} source drifted`);
      }
    }
  }
  const subject = objectRecord(record.subject, 'Framework compatibility receipt subject');
  const artifact = objectRecord(subject.selected_app_artifact, 'Compatibility subject selected App artifact');
  const installedAppAsar = objectRecord(subject.installed_app_asar, 'Compatibility subject installed app.asar');
  const buildReceipt = objectRecord(subject.build_receipt, 'Compatibility subject build receipt');
  const normalizedSubject = {
    selected_app_artifact: {
      owner_authority: nonEmptyString(
        artifact.owner_authority,
        'Compatibility subject artifact owner_authority',
      ),
      immutable_release_tag: nonEmptyString(
        artifact.immutable_release_tag,
        'Compatibility subject artifact immutable_release_tag',
      ),
      asset_url: nonEmptyString(artifact.asset_url, 'Compatibility subject artifact asset_url'),
      asset_name: nonEmptyString(artifact.asset_name, 'Compatibility subject artifact asset_name'),
      byte_size: artifact.byte_size,
      sha256: normalizeDigest(artifact.sha256, 'Compatibility subject artifact SHA-256'),
    },
    installed_app_asar: {
      path: nonEmptyString(installedAppAsar.path, 'Compatibility subject installed app.asar path'),
      sha256: normalizeDigest(
        installedAppAsar.sha256,
        'Compatibility subject installed app.asar SHA-256',
      ),
    },
    build_receipt: {
      path: nonEmptyString(buildReceipt.path, 'Compatibility subject build receipt path'),
      sha256: normalizeDigest(
        buildReceipt.sha256,
        'Compatibility subject build receipt SHA-256',
      ),
    },
  };
  if (
    !Number.isInteger(normalizedSubject.selected_app_artifact.byte_size) ||
    normalizedSubject.selected_app_artifact.byte_size <= 0
  ) {
    throw new Error('Compatibility subject artifact byte_size must be a positive integer');
  }
  if (context.expected_subject !== undefined) {
    const expectedSubject = objectRecord(context.expected_subject, 'Expected compatibility subject');
    if (JSON.stringify(normalizedSubject) !== JSON.stringify(expectedSubject)) {
      throw new Error('Framework compatibility receipt subject drifted from the App-owned subject');
    }
  }
  if (
    !Array.isArray(record.requirements) ||
    record.requirements.length === 0 ||
    !Array.isArray(record.observed_components)
  ) {
    throw new Error('Component compatibility receipt must declare non-empty requirements and an observation array');
  }
  const requirementsById = new Map();
  for (const requirement of record.requirements) {
    const validated = validateCompatibilityRequirement(requirement);
    if (requirementsById.has(validated.requirementId)) {
      throw new Error(`Component compatibility requirement_id is duplicated: ${validated.requirementId}`);
    }
    requirementsById.set(validated.requirementId, validated);
  }
  const observedIds = new Set();
  const observedById = new Map();
  for (const component of record.observed_components) {
    const validated = validateObservedComponent(component);
    if (observedIds.has(validated.componentId)) {
      throw new Error(`Observed component_id is duplicated: ${validated.componentId}`);
    }
    observedIds.add(validated.componentId);
    observedById.set(validated.componentId, validated.item);
  }
  const requirementIds = [...requirementsById.keys()];
  if (!Array.isArray(record.coverage) || record.coverage.length !== requirementIds.length) {
    throw new Error('Framework compatibility receipt must contain exactly one coverage entry per requirement');
  }
  const coverageById = new Map();
  for (const coverageEntry of record.coverage) {
    const item = objectRecord(coverageEntry, 'Framework compatibility coverage entry');
    const requirementId = nonEmptyString(item.requirement_id, 'Compatibility coverage requirement_id');
    const requirement = requirementsById.get(requirementId);
    if (!requirement || coverageById.has(requirementId)) {
      throw new Error(`Compatibility receipt coverage is missing or duplicated for ${requirementId}`);
    }
    if (item.component_id !== requirement.componentId) {
      throw new Error(`Compatibility coverage ${requirementId} does not bind its requirement component`);
    }
    if (item.kind !== requirement.item.kind || !['satisfied', 'unsatisfied'].includes(item.status)) {
      throw new Error(`Compatibility coverage ${requirementId} has an invalid kind or status`);
    }
    const allowedFailureCodes =
      requirement.item.kind === 'capability_id_with_versioned_schema'
        ? ['incompatible_missing_capability', 'incompatible_capability_schema']
        : requirement.item.kind === 'minimum_version'
          ? ['incompatible_minimum_version']
          : ['incompatible_semver_range'];
    if (
      item.status === 'satisfied' &&
      (item.failure_code !== null ||
        typeof item.observation_ref !== 'string' ||
        observedById.get(requirement.componentId)?.observation_ref !== item.observation_ref)
    ) {
      throw new Error(`Satisfied compatibility coverage ${requirementId} must bind one Framework observation`);
    }
    if (item.status === 'unsatisfied' && !allowedFailureCodes.includes(item.failure_code)) {
      throw new Error(`Compatibility coverage ${requirementId} has a failure code inconsistent with its requirement kind`);
    }
    coverageById.set(requirementId, item);
  }
  if (!Array.isArray(record.failures)) {
    throw new Error('Component compatibility receipt must declare failures');
  }
  const failuresByRequirement = new Map();
  for (const failure of record.failures) {
    const item = objectRecord(failure, 'Component compatibility failure');
    if (forbiddenCompatibilityFailureCodes.includes(item.code)) {
      throw new Error(`Cross-component identity cannot be a compatibility failure: ${String(item.code)}`);
    }
    if (!compatibilityFailureCodes.includes(item.code)) {
      throw new Error(`Unsupported component compatibility failure code: ${String(item.code)}`);
    }
    const requirementId = nonEmptyString(item.requirement_id, 'Component compatibility failure requirement_id');
    const coverageEntry = coverageById.get(requirementId);
    if (
      !coverageEntry ||
      coverageEntry.status !== 'unsatisfied' ||
      coverageEntry.failure_code !== item.code ||
      coverageEntry.component_id !== item.component_id ||
      failuresByRequirement.has(requirementId)
    ) {
      throw new Error(`Component compatibility failure does not match one unique failed evaluation: ${requirementId}`);
    }
    failuresByRequirement.set(requirementId, item);
  }
  const failedCoverage = [...coverageById.values()].filter((item) => item.status === 'unsatisfied');
  if (
    record.status === 'compatible' &&
    (record.failures.length > 0 ||
      failedCoverage.length > 0 ||
      record.observed_components.length === 0)
  ) {
    throw new Error('Compatible component receipt must cover every requirement without failures');
  }
  if (
    record.status === 'incompatible' &&
    (failedCoverage.length === 0 ||
      failuresByRequirement.size !== failedCoverage.length)
  ) {
    throw new Error('Incompatible component receipt must bind every unsatisfied requirement to one allowed failure');
  }
  const authorityBoundary = objectRecord(
    record.authority_boundary,
    'Framework compatibility receipt authority_boundary',
  );
  if (
    authorityBoundary.compatibility_only !== true ||
    authorityBoundary.selected_artifact_binding_is_subject_evidence_only !== true ||
    authorityBoundary.may_require_exact_cross_component_version_or_sha !== false ||
    authorityBoundary.may_require_same_cohort !== false ||
    authorityBoundary.may_define_package_currentness !== false ||
    authorityBoundary.may_claim_release_ready !== false ||
    authorityBoundary.may_claim_install_ready !== false
  ) {
    throw new Error('Framework compatibility receipt authority boundary permits a forbidden cross-component claim');
  }
  if (
    context.expected_requirements !== undefined &&
    JSON.stringify(record.requirements) !== JSON.stringify(context.expected_requirements)
  ) {
    throw new Error('Framework compatibility receipt requirements do not match the App-owned requirements');
  }
  if (
    requirementIds.some((id) => {
      const requirement = requirementsById.get(id);
      return (
        requirement.componentId === 'opl_package' ||
        requirement.componentId.startsWith('opl_package:')
      );
    }) &&
    record.package_inventory_complete !== true
  ) {
    throw new Error('Package-targeted compatibility requirements require complete Package inventory coverage');
  }
  return record;
}

function validateComponentInteroperability(interoperability) {
  if (
    interoperability?.schema !== 'opl_component_interoperability.v1' ||
    interoperability?.authority !== 'one-person-lab-app' ||
    interoperability?.model !== 'independently_versioned_open_composition'
  ) {
    throw new Error('Install exposure must declare the canonical independently versioned component model');
  }
  assertDeepEqualJson(
    interoperability.components,
    ['opl_app', 'opl_shell', 'opl_framework', 'opl_base', 'opl_package'],
    'Component interoperability participants',
  );
  const combination = interoperability.combination_policy;
  if (
    combination?.default !==
      'any_component_versions_may_compose_when_compatibility_requirements_are_satisfied' ||
    combination?.full_and_standard_may_publish_and_install_independently !== true ||
    combination?.exact_cross_component_version_or_commit_lockstep_required !== false ||
    combination?.carrier_choice_may_define_package_currentness !== false
  ) {
    throw new Error('Component interoperability must preserve independent version lines and open composition');
  }
  const artifact = interoperability.artifact_self_integrity;
  if (
    artifact?.scope !== 'one_selected_downloaded_or_executed_artifact' ||
    artifact?.same_release_asset_anonymous_authenticated_byte_parity_required !== true ||
    artifact?.installed_bytes_must_match_selected_carrier_artifact !== true
  ) {
    throw new Error('Component interoperability must bind integrity to the selected artifact itself');
  }
  assertDeepEqualJson(
    artifact.required_identity_fields,
    ['owner_authority', 'immutable_release_tag', 'asset_url', 'asset_name', 'byte_size', 'sha256'],
    'Selected artifact identity fields',
  );
  assertDeepEqualJson(
    artifact.platform_attestations_when_applicable,
    ['signature', 'notarization'],
    'Selected artifact platform attestations',
  );
  const compatibility = interoperability.compatibility_admission;
  if (
    compatibility?.authority_model !==
      'app_requirements_framework_owner_evaluation_app_fail_closed_validation' ||
    compatibility?.requirements_owner !== 'one-person-lab-app' ||
    compatibility?.observation_owner !== 'one-person-lab' ||
    compatibility?.observation_producer_role !== 'opl_framework' ||
    compatibility?.observation_command !==
      'opl app compatibility receipt --requirements-file <path> --subject-file <path> --output <path> --ttl-seconds 300 --json' ||
    compatibility?.receipt_schema !== 'opl_component_compatibility_receipt.v1' ||
    compatibility?.requirements_schema !== 'opl_component_compatibility_requirements.v1' ||
    compatibility?.subject_schema !== 'opl_app_compatibility_subject.v1' ||
    compatibility?.receipt_transport !==
      'cli_envelope_with_independent_json_file_and_sha256_sidecar' ||
    compatibility?.consumer_preflight_receipt_schema !==
      'opl_app_installed_gui_artifact_preflight_receipt.v2' ||
    compatibility?.current_framework_producer_status !==
      'canonical_owner_cli_and_receipt_producer' ||
    compatibility?.producer_contract_ref !==
      'contracts/opl-framework/app-component-compatibility-receipt-contract.json' ||
    compatibility?.inline_compatible_claim_allowed !== false ||
    compatibility?.app_may_generate_compatible_receipt !== false ||
    compatibility?.requirements_must_be_nonempty !== true ||
    compatibility?.compatible_receipt_observed_components_must_be_nonempty !== true ||
    compatibility?.observation_max_age_seconds !== 300 ||
    compatibility?.requirement_evaluation_policy !==
      'exactly_one_framework_evaluation_per_app_requirement' ||
    compatibility?.success_code !== 'compatible'
  ) {
    throw new Error('Component compatibility admission must bind App requirements to one fresh Framework-owned receipt');
  }
  assertDeepEqualJson(
    compatibility.producer_receipt_output,
    {
      transport: 'independent_json_file_with_sha256_sidecar',
      cli_envelope_fields: [
        'receipt_file',
        'receipt_sha256',
        'sha256_file',
        'producer_identity',
        'status',
        'issued_at',
        'expires_at',
      ],
      receipt_ref: 'absolute_file_url_bound_to_cli_selected_output',
      existing_output_policy: 'reject_without_overwrite',
    },
    'Framework compatibility producer output binding',
  );
  assertDeepEqualJson(
    compatibility.required_receipt_coverage,
    {
      requirement_ids: 'exactly_once',
      component_ids: 'exactly_the_components_targeted_by_requirements',
      satisfied_requirements_require_framework_owner_observation: true,
      package_inventory_complete: 'required_only_when_requirements_target_packages',
    },
    'Required Framework compatibility receipt coverage',
  );
  assertDeepEqualJson(
    compatibility.subject_binding_fields,
    [
      'selected_app_artifact.owner_authority',
      'selected_app_artifact.immutable_release_tag',
      'selected_app_artifact.asset_url',
      'selected_app_artifact.asset_name',
      'selected_app_artifact.byte_size',
      'selected_app_artifact.sha256',
      'installed_app_asar.path',
      'installed_app_asar.sha256',
      'build_receipt.path',
      'build_receipt.sha256',
    ],
    'Framework compatibility subject bindings',
  );
  assertDeepEqualJson(
    compatibility.receipt_identity_fields,
    [
      'owner',
      'producer_role',
      'contract_ref',
      'producer_contract_ref',
      'producer_identity.command_surface',
      'producer_identity.executable_path',
      'producer_identity.executable_sha256',
      'producer_identity.framework_version',
      'producer_identity.package_ref',
      'receipt_ref',
      'generated_at',
      'issued_at',
      'expires_at',
      'freshness.max_age_seconds',
      'sources.requirements.path',
      'sources.requirements.sha256',
      'sources.subject.path',
      'sources.subject.sha256',
    ],
    'Framework compatibility receipt identity fields',
  );
  assertDeepEqualJson(
    compatibility.coverage_fields,
    ['requirement_id', 'component_id', 'kind', 'status', 'observation_ref', 'failure_code'],
    'Framework compatibility coverage fields',
  );
  assertDeepEqualJson(
    compatibility.allowed_requirement_kinds,
    compatibilityRequirementKinds,
    'Allowed component compatibility requirements',
  );
  assertDeepEqualJson(
    compatibility.failure_codes,
    compatibilityFailureCodes,
    'Component compatibility failure codes',
  );
  assertDeepEqualJson(
    compatibility.forbidden_failure_codes,
    forbiddenCompatibilityFailureCodes,
    'Forbidden cross-component identity failure codes',
  );
  const guiCompatibilityProfile = objectRecord(
    interoperability.compatibility_profiles?.gui_installed_acceptance,
    'Installed GUI compatibility profile',
  );
  if (
    guiCompatibilityProfile.profile_id !== 'gui_installed_acceptance' ||
    guiCompatibilityProfile.scope !== 'installed_gui_artifact_acceptance_only' ||
    guiCompatibilityProfile.shell_acceptance_boundary !==
      'app_build_contract_active_shell_gate_and_installed_browser_first_dom_pixel_a11y_behavior' ||
    !Array.isArray(guiCompatibilityProfile.requirements) ||
    guiCompatibilityProfile.requirements.length === 0
  ) {
    throw new Error('Installed GUI compatibility profile must contain App-owned non-empty requirements');
  }
  const profileRequirementIds = new Set();
  for (const requirement of guiCompatibilityProfile.requirements) {
    const validated = validateCompatibilityRequirement(requirement);
    if (profileRequirementIds.has(validated.requirementId)) {
      throw new Error(`Installed GUI compatibility profile repeats requirement ${validated.requirementId}`);
    }
    profileRequirementIds.add(validated.requirementId);
  }
  const provenance = interoperability.provenance;
  if (
    provenance?.exact_component_versions_commits_and_digests_may_be_recorded !== true ||
    provenance?.role !== 'observational_build_or_installed_state_only' ||
    provenance?.may_gate_install_or_runtime !== false ||
    provenance?.may_define_package_currentness !== false ||
    provenance?.full_offline_seed_versions_are_payload_provenance_only !== true ||
    provenance?.resolver_receipts_may_record_selected_versions !== true ||
    provenance?.resolver_receipts_may_create_future_combination_lock !== false
  ) {
    throw new Error('Component provenance must remain observational and must not create a future lock');
  }
  assertDeepEqualJson(
    interoperability.forbidden_install_or_runtime_gates,
    [
      'exact_cross_component_version_equality',
      'exact_cross_component_sha_equality',
      'same_app_shell_framework_base_package_cohort',
      'bundle_or_bom_digest_equality_across_components',
      'app_owned_package_bom_or_lock',
      'carrier_projection_defines_package_currentness',
    ],
    'Forbidden cross-component install and runtime gates',
  );
  assertDeepEqualJson(
    Object.keys(interoperability.receipt_classes ?? {}),
    [
      'r1_standard_release',
      'r2_standard_homebrew',
      'r3_full_release',
      'r4_full_homebrew',
      'r5_linux_deb',
      'r6_anonymous_authenticated_parity',
      'r7_unified_installer_managed_state',
    ],
    'Component interoperability receipt classes',
  );
  assertIncludesAll(
    interoperability.negative_matrix?.must_reject,
    [
      'missing_stale_or_incomplete_framework_compatibility_observation',
      'invalid_framework_compatibility_producer_authority',
      'framework_compatibility_subject_digest_drift',
      'framework_compatibility_requirement_or_coverage_mismatch',
      'empty_compatibility_requirements_or_observations',
    ],
    'Component interoperability rejection matrix',
  );
  assertIncludesAll(
    interoperability.negative_matrix?.must_accept,
    [
      'compatible_components_with_different_versions_and_commits',
      'standard_and_full_independent_publication_and_installation_with_self_identity_and_compatibility',
    ],
    'Component interoperability positive matrix',
  );
  assertIncludesAll(
    interoperability.negative_matrix?.must_not_reject,
    [
      'app_shell_framework_base_or_package_sha_differs',
      'standard_and_full_versions_or_bundle_digests_differ',
    ],
    'Component interoperability non-rejection matrix',
  );
}

function validateInstallExposureHeader(policy) {
  if (policy.owner !== 'one-person-lab-app') {
    throw new Error(`Unexpected install exposure policy owner: ${policy.owner}`);
  }
  if (policy.purpose !== 'app_install_exposure_policy') {
    throw new Error(`Unexpected install exposure policy purpose: ${policy.purpose}`);
  }
  if (policy.state !== 'active') {
    throw new Error(`Unexpected install exposure policy state: ${policy.state}`);
  }
  if (policy.producer_owner !== 'one-person-lab') {
    throw new Error(`Unexpected install exposure producer owner: ${policy.producer_owner}`);
  }
  if (policy.product_authority?.source_of_truth !== 'one-person-lab-app') {
    throw new Error('Install exposure policy source of truth must be one-person-lab-app');
  }
  for (const forbidden of forbiddenAuthorityOwners) {
    if (!policy.product_authority?.forbidden_authority?.includes(forbidden)) {
      throw new Error(`Install exposure policy must exclude ${forbidden}`);
    }
  }
}

function validateCapabilityGovernance(governance) {
  if (
    governance?.lifecycle_authority !== 'configured_carrier' ||
    governance?.lifecycle_surface !== 'configured_carrier_install_update_remove' ||
    governance?.app_role !== 'gui_and_framework_projection_consumer_only'
  ) {
    throw new Error('Install exposure capability governance must preserve the carrier -> Framework -> App projection boundary');
  }
  if (
    governance.managed_inventory?.source !== 'framework_unified_capability_projection' ||
    governance.managed_inventory?.app_second_inventory_allowed !== false ||
    governance.managed_inventory?.app_presentational_metadata_allowed !== true ||
    governance.managed_inventory?.unknown_user_and_third_party_surfaces !== 'preserve'
  ) {
    throw new Error('Install exposure capability governance must forbid an App-owned managed capability inventory');
  }
  if (
    governance.credential_policy?.credential_values_owner !== 'user_or_provider' ||
    governance.credential_policy?.full_may_bundle_secrets !== false ||
    governance.credential_policy?.migration_may_copy_credentials !== false ||
    governance.credential_policy?.flow_may_declare_requirements_only !== true ||
    governance.credential_policy?.existing_codex_config_detection !==
      'selected_provider_access_from_resolved_codex_config_toml' ||
    governance.credential_policy?.existing_usable_access_policy !==
      'reuse_without_reconfiguration_or_manual_key_input' ||
    governance.credential_policy?.explicit_api_key_command_role !==
      'new_or_rotated_provider_credential_only' ||
    governance.credential_policy?.configure_codex_package_lifecycle_mutation_allowed !== false ||
    governance.credential_policy?.package_reconciliation_requires_provider_configuration !== false ||
    governance.credential_policy?.package_reconciliation_surface !== 'configured_carrier_projected_actions'
  ) {
    throw new Error(
      'Install exposure capability governance must reuse existing Codex access and keep provider configuration separate from package lifecycle',
    );
  }
  if (
    governance.mcp_policy?.flow_managed_projection_group !== 'opl_flow_managed' ||
    governance.mcp_policy?.manual_and_third_party_projection_group !== 'user_or_third_party_managed' ||
    governance.mcp_policy?.undeclared_user_server_policy !== 'preserve' ||
    governance.mcp_policy?.undeclared_user_server_delete_or_overwrite_allowed !== false ||
    governance.mcp_policy?.default_managed_server_requires_owner_or_carrier_projection !== true
  ) {
    throw new Error('Install exposure MCP governance must preserve user surfaces and require owner or carrier projection');
  }
}

function validateCanonicalMetadataSources(canonical) {
  if (canonical?.owner !== 'one-person-lab') {
    throw new Error('Install exposure canonical metadata owner must be one-person-lab');
  }
  if (canonical.domain_owner !== 'foundry_agent_repositories') {
    throw new Error('Install exposure canonical metadata domain owner must be foundry_agent_repositories');
  }
  for (const source of ['family_action_catalog', 'family_stage_control_plane', 'family-product-entry-manifest-v2']) {
    if (!canonical.sources?.includes(source)) {
      throw new Error(`Install exposure canonical metadata sources must include ${source}`);
    }
  }
  for (const surface of ['cli', 'mcp', 'skill', 'product_entry', 'product_status', 'product_session', 'domain_action_adapter', 'workbench']) {
    if (!canonical.derived_surfaces?.includes(surface)) {
      throw new Error(`Install exposure canonical metadata derived surfaces must include ${surface}`);
    }
  }
}

function validatePublicAbi(abi) {
  for (const [field, expected] of Object.entries({
    primary_semantic_entry: 'skill',
    skill_role: 'public_codex_semantic_entry_and_prompt_contract',
    plugin_role: 'codex_app_distribution_and_capability_bundle',
    command_contract_role: 'machine_readable_action_and_stage_contract_under_the_skill',
    product_entry_role: 'domain_owned_product_entry_manifest_and_session_surface',
  })) {
    if (abi?.[field] !== expected) {
      throw new Error(`Install exposure public_abi.${field} must be ${expected}`);
    }
  }
  for (const [field, expected] of Object.entries({
    direct_skill_compatibility_required: true,
    plugin_may_package_skill: true,
    plugin_must_not_create_second_semantics: true,
    app_must_not_require_plugin_for_cli_semantics: true,
    app_must_not_mirror_plugin_skill_as_duplicate_bare_skill: true,
  })) {
    if (abi?.[field] !== expected) {
      throw new Error(`Install exposure public_abi.${field} must be ${expected}`);
    }
  }
}

function validateExposureClasses(policy) {
  const exposureClassById = new Map((policy.exposure_classes ?? []).map((entry) => [entry.id, entry]));
  const domainPluginClass = exposureClassById.get('codex_surface');
  if (
    domainPluginClass?.sync_target !== 'framework_projected_configured_carrier' ||
    domainPluginClass?.software_object !== 'opl_packages' ||
    domainPluginClass?.visibility_scope !== 'package_capability_visibility_only_not_software_object' ||
    domainPluginClass?.member_source !== 'app_state.agent_packages.directory.entries[].capabilities[]' ||
    domainPluginClass?.presentation_source !== 'owner_package_presentation_descriptor' ||
    'members' in domainPluginClass
  ) {
    throw new Error('Install exposure Package capabilities must come from the dynamic Framework directory');
  }
  assertIncludesAll(
    domainPluginClass?.must_not_sync_to,
    ['app_owned_package_member_registry', 'duplicate_bare_skill_mirror', 'default_home_assistant_entry'],
    'Install exposure Package capability mirror prohibitions',
  );
  if (exposureClassById.has('opl_generated_plugin_surfaces')) {
    throw new Error('Install exposure policy must not restore a fixed OPL-generated Package registry');
  }
  if (exposureClassById.has('companion_tools_codex_skills')) {
    throw new Error('Install exposure policy must not duplicate the Framework managed Skill inventory');
  }
  const packagedRuntimeClass = exposureClassById.get('opl_base_payloads');
  if (
    packagedRuntimeClass?.owner !== 'one-person-lab' ||
    packagedRuntimeClass?.software_object !== 'opl_base' ||
    packagedRuntimeClass?.visibility_scope !== 'base_dependency_status_only_not_software_object'
  ) {
    throw new Error('Install exposure packaged runtime payloads must remain OPL Base dependency details');
  }
  assertIncludesAll(
    packagedRuntimeClass?.members,
    ['embedded_codex_executor', 'temporal_cli_archive', 'opl_framework_runtime', 'officecli', 'mineru_open_api'],
    'Install exposure OPL Base payload members',
  );
  if (!packagedRuntimeClass?.must_not_sync_to?.includes('implicit_user_codex_skill_install_without_managed_sync')) {
    throw new Error('Install exposure packaged Full runtime payloads must not imply user skill install without managed sync');
  }
}

function validateInstallerSurfaces(policy) {
  const installerSurfaces = new Map((policy.installer_surfaces ?? []).map((entry) => [entry.surface, entry]));
  const reconcileRef = 'contracts/app-release-channel.json#managed_update_plane.carrier_reconciliation';
  for (const entry of installerSurfaces.values()) {
    if (typeof entry.app_runtime_carrier !== 'boolean') {
      throw new Error(`Install exposure surface ${entry.surface} must classify whether it launches an App runtime carrier`);
    }
    if (entry.app_runtime_carrier && entry.post_launch_reconcile_ref !== reconcileRef) {
      throw new Error(`Install exposure App runtime surface ${entry.surface} must use carrier-neutral Framework reconciliation`);
    }
    if (!entry.app_runtime_carrier && entry.post_launch_reconcile_ref) {
      throw new Error(`Install exposure non-App surface ${entry.surface} must not declare App carrier reconciliation`);
    }
  }
  for (const surface of ['app_first_run', 'full_first_install_dmg', 'standard_dmg', 'one_shot_cli_installer', 'docker_webui']) {
    const entry = installerSurfaces.get(surface);
    if (!entry) {
      throw new Error(`Install exposure policy missing installer surface ${surface}`);
    }
    if (entry.progress_source !== expectedFirstRunProgressModel.source_command) {
      throw new Error(`Install exposure surface ${surface} must use ${expectedFirstRunProgressModel.source_command}`);
    }
  }
  if (installerSurfaces.get('app_first_run')?.exposure_policy !== 'hide_skill_plugin_packaging_mechanics_by_default') {
    throw new Error('App first-run install exposure must hide skill/plugin packaging mechanics by default');
  }
  const directMacos = installerSurfaces.get('stable_local_authorized_macos_install');
  if (
    directMacos?.entrypoint !== 'install.sh --stable-macos-install --yes'
    || directMacos?.release_quality_source !== 'exact_component_manifest'
    || directMacos?.latest_pointer_is_quality_independent !== true
    || directMacos?.non_stable_disclosure_before_target_mutation !== true
    || JSON.stringify(directMacos?.compatibility_entrypoints) !== JSON.stringify([])
    || JSON.stringify(directMacos?.retired_entrypoints) !== JSON.stringify(['install-stable.sh'])
    || Object.hasOwn(directMacos ?? {}, 'stable_release_path')
  ) {
    throw new Error('Direct macOS install exposure must bind the exact component manifest without treating Latest as Stable.');
  }
  if (
    policy.distribution_install_model?.installer_convergence?.stable_macos_helper?.artifact_integrity
      ?.legacy_component_manifest_policy !==
    'allow_only_published_non_prerelease_pre_v3_manifest_with_quality_unasserted_disclosure'
  ) {
    throw new Error('Direct macOS install exposure must disclose its bounded legacy component-manifest policy.');
  }
  const forbiddenDependencyFields = [
    'capability_target_closure',
    'capability_source',
    'capability_projection',
    'resolution_policy',
    'optional_payload_policy',
    'missing_optional_payload_blocks_install_or_readiness',
  ];
  for (const surface of installerSurfaces.values()) {
    if (forbiddenDependencyFields.some((field) => field in surface)) {
      throw new Error('App installer surfaces must not own Package dependency or payload policy');
    }
  }
  const dockerWebui = installerSurfaces.get('docker_webui');
  if (dockerWebui?.entrypoint !== 'Docker/WebUI one-click installer') {
    throw new Error('Docker/WebUI install exposure must make the one-click installer the entrypoint');
  }
  if (dockerWebui.exposure_policy !== 'one_click_installer_is_beginner_default_with_manual_docker_as_advanced_troubleshooting_path') {
    throw new Error('Docker/WebUI install exposure must keep manual Docker commands as the advanced troubleshooting path');
  }
  if (dockerWebui.installer_model?.primary_user_path !== 'one_click_installer') {
    throw new Error('Docker/WebUI install exposure must declare one-click installer as the primary user path');
  }
  if (dockerWebui.installer_model?.linux_macos_shell_script !== 'install-docker-webui.sh') {
    throw new Error('Docker/WebUI install exposure must declare the Linux/macOS shell installer script artifact');
  }
  if (dockerWebui.installer_model?.windows_powershell_script !== 'install-docker-webui.ps1') {
    throw new Error('Docker/WebUI install exposure must declare the Windows PowerShell installer script artifact');
  }
  const dockerInstallerAssets = dockerWebui.installer_model?.installer_release_assets;
  if (
    dockerWebui.installer_model?.public_bootstrap_entrypoint !== 'opl-install.sh --container-webui' ||
    dockerWebui.installer_model?.development_bootstrap_entrypoint !==
      'reviewed_source_checkout_install.sh --container-webui' ||
    dockerWebui.installer_model?.installer_release_selector !==
      'github_latest_pointer_resolved_to_exact_release_record' ||
    dockerInstallerAssets?.linux_macos !==
      'exact_release_record_asset_url_for_install-docker-webui.sh' ||
    dockerInstallerAssets?.windows !==
      'exact_release_record_asset_url_for_install-docker-webui.ps1' ||
    dockerInstallerAssets?.same_name_size_digest_readback_required !== true ||
    dockerInstallerAssets?.attestation_payload_membership !== false
  ) {
    throw new Error('Docker/WebUI installer artifacts must resolve one exact GitHub Release before acquisition');
  }
  const acquisition = dockerWebui.installer_model?.acquisition_integrity;
  if (
    JSON.stringify(acquisition?.required_identity) !== JSON.stringify([
      'repository',
      'exact_release_tag',
      'asset_name',
      'exact_release_asset_url',
      'size_bytes',
      'sha256',
    ]) ||
    acquisition?.verified_cache !==
      'reuse_only_after_recomputing_cached_size_and_sha256_against_the_saved_exact_release_identity' ||
    acquisition?.metadata_or_network_outage !==
      'use_valid_verified_cache_or_block_only_this_new_acquisition' ||
    acquisition?.explicit_identity_mismatch !==
      'reject_new_bytes_preserve_prior_verified_cache_and_installed_webui' ||
    JSON.stringify(acquisition?.unverified_fallbacks) !== JSON.stringify([
      'mutable_main',
      'unverified_releases_latest_download',
      'different_or_historical_release_tag',
    ]) ||
    acquisition?.optional_attestation_outage !==
      'does_not_block_bytes_that_pass_required_exact_release_name_size_sha256_checks'
  ) {
    throw new Error('Docker/WebUI acquisition must preserve verified-cache fail-open semantics without unverified fallback');
  }
  if (
    !dockerWebui.installer_model?.linux_macos_online_command?.includes('./opl-install.sh --container-webui') ||
    dockerWebui.installer_model?.linux_macos_online_command?.includes('| bash')
  ) {
    throw new Error('Docker/WebUI install exposure must route public Linux/macOS acquisition through verified opl-install.sh');
  }
  if (
    dockerWebui.installer_model?.windows_online_command !==
      'resolve the GitHub Latest pointer to one exact Release record, verify or reuse cached install-docker-webui.ps1 by exact tag/name/url/size/SHA-256, then run with -EnableAutoUpdate -Yes'
  ) {
    throw new Error('Docker/WebUI install exposure must declare exact Release-bound Windows acquisition');
  }
  if (dockerWebui.installer_model?.windows_prerequisite_mode !== 'explicit_install_prerequisites_switch_requires_administrator') {
    throw new Error('Docker/WebUI install exposure must keep Windows Docker/WSL2 installation behind an explicit administrator prerequisite switch');
  }
  if (
    dockerWebui.installer_model?.default_image_ref !==
      'ghcr.io/gaofeng21cn/one-person-lab-webui:stable' ||
    dockerWebui.installer_model?.explicit_preview_alias_ref !==
      'ghcr.io/gaofeng21cn/one-person-lab-webui:latest' ||
    dockerWebui.installer_model?.explicit_preview_entrypoints?.linux_macos !==
      'install-docker-webui.sh --tag latest' ||
    dockerWebui.installer_model?.explicit_preview_entrypoints?.windows !==
      'install-docker-webui.ps1 -Tag latest' ||
    dockerWebui.installer_model?.explicit_preview_entrypoints?.automatic_updates_allowed !== false
  ) {
    throw new Error('Docker/WebUI install exposure must default to Stable and keep Latest as explicit Preview opt-in');
  }
  const hostAutoUpdate = dockerWebui.installer_model?.host_auto_update;
  if (
    hostAutoUpdate?.scope !== 'optional_current_user_host_scheduler' ||
    hostAutoUpdate?.entrypoints?.linux_macos_enable !== 'install-docker-webui.sh --enable-auto-update' ||
    hostAutoUpdate?.entrypoints?.linux_macos_disable !== 'install-docker-webui.sh --disable-auto-update' ||
    hostAutoUpdate?.entrypoints?.linux_macos_status !== 'install-docker-webui.sh --auto-update-status' ||
    hostAutoUpdate?.entrypoints?.windows_enable !== 'install-docker-webui.ps1 -EnableAutoUpdate' ||
    hostAutoUpdate?.entrypoints?.windows_disable !== 'install-docker-webui.ps1 -DisableAutoUpdate' ||
    hostAutoUpdate?.entrypoints?.windows_status !== 'install-docker-webui.ps1 -AutoUpdateStatus' ||
    hostAutoUpdate?.platform_schedulers?.windows?.mechanism !== 'user_scoped_windows_scheduled_task' ||
    hostAutoUpdate?.platform_schedulers?.windows?.id !== 'One Person Lab WebUI Stable Update' ||
    hostAutoUpdate?.platform_schedulers?.windows?.legacy_id_migrated_on_enable !==
      'One Person Lab WebUI Latest Update' ||
    hostAutoUpdate?.platform_schedulers?.windows?.execution_context !==
      'limited_current_user_run_only_when_logged_on' ||
    hostAutoUpdate?.platform_schedulers?.macos?.mechanism !== 'current_user_launch_agent' ||
    hostAutoUpdate?.platform_schedulers?.macos?.id !== 'cn.onepersonlab.webui-update' ||
    hostAutoUpdate?.platform_schedulers?.linux_personal?.mechanism !== 'systemd_user_timer' ||
    hostAutoUpdate?.platform_schedulers?.linux_personal?.id !==
      'one-person-lab-webui-update.timer' ||
    hostAutoUpdate?.platform_schedulers?.linux_server?.default_enabled !== false ||
    hostAutoUpdate?.platform_schedulers?.linux_server?.installer_must_not_create_system_scheduler !==
      true ||
    hostAutoUpdate?.channel_policy !==
      'default_stable_only_preview_or_custom_image_tag_or_digest_requires_manual_update' ||
    hostAutoUpdate?.follows_ref !== 'ghcr.io/gaofeng21cn/one-person-lab-webui:stable' ||
    hostAutoUpdate?.result_schema !== 'opl_webui_host_auto_update_result.v1' ||
    hostAutoUpdate?.config_schema !== 'opl_webui_host_auto_update_config.v1' ||
    !String(hostAutoUpdate?.reviewed_runner_policy ?? '').includes(
      'never_downloads_or_executes_mutable_main_branch_installer_code',
    ) ||
    !String(hostAutoUpdate?.failure_semantics ?? '').includes(
      'restore_the_previous_image_digest',
    ) ||
    !String(hostAutoUpdate?.security_boundary ?? '').includes('without_Docker_socket_mount')
  ) {
    throw new Error('Docker/WebUI automatic updates must preserve the shared stable-only host scheduler contract');
  }
  assertIncludesAll(
    hostAutoUpdate?.shared_status_fields,
    ['scheduler', 'enabled', 'runner', 'channel', 'daily_time', 'result', 'status', 'phase', 'rollback', 'completed_at'],
    'Docker/WebUI shared host auto-update status fields',
  );
  if (dockerWebui.installer_model?.compose_file !== 'compose.yaml') {
    throw new Error('Docker/WebUI install exposure must declare compose.yaml as the one-click installer compose artifact');
  }
  assertIncludesAll(
    dockerWebui.installer_model?.persistent_host_dirs,
    ['OnePersonLab/data', 'OnePersonLab/projects'],
    'Docker/WebUI persistent host dirs',
  );
  if (dockerWebui.installer_model?.container_mounts?.data !== '/data') {
    throw new Error('Docker/WebUI install exposure must map host data dir to /data');
  }
  if (dockerWebui.installer_model?.container_mounts?.projects !== '/projects') {
    throw new Error('Docker/WebUI install exposure must map host projects dir to /projects');
  }
  if (dockerWebui.installer_model?.api_key_policy !== 'never_pass_api_key_on_cli_or_environment_for_beginner_path') {
    throw new Error('Docker/WebUI install exposure must forbid API keys in beginner CLI/env installer inputs');
  }
  if (dockerWebui.installer_model?.api_key_entry_surface !== 'browser_webui_first_run_access_panel_or_settings_gateway') {
    throw new Error('Docker/WebUI install exposure must make WebUI the first API key entry surface');
  }
  if (
    dockerWebui.installer_model?.gateway_account_credential_policy !==
      'never_pass_gateway_account_credentials_to_installer_cli_or_environment_for_beginner_path' ||
    dockerWebui.installer_model?.gateway_account_entry_surface !==
      'browser_webui_first_run_or_settings_gateway_via_existing_runtime_provider'
  ) {
    throw new Error(
      'Docker/WebUI install exposure must keep Gateway account credentials out of installer inputs and reuse the browser runtime provider',
    );
  }
  const cloudDeployment = dockerWebui.installer_model?.cloud_deployment_model;
  if (cloudDeployment?.template_dir !== 'deploy/docker-webui/cloud') {
    throw new Error('Docker/WebUI cloud deployment must declare the deploy/docker-webui/cloud template directory');
  }
  if (cloudDeployment?.installer_entrypoint !== 'install-docker-webui.sh --cloud-template') {
    throw new Error('Docker/WebUI cloud deployment must be generated through the explicit --cloud-template entrypoint');
  }
  assertIncludesAll(
    cloudDeployment?.compose_files,
    ['compose.yaml', 'compose.gateway-key.yaml'],
    'Docker/WebUI cloud compose files',
  );
  if (
    cloudDeployment?.webui_auth?.default_username !== 'opl' ||
    cloudDeployment?.webui_auth?.required_password_secret !== 'OPL_WEBUI_PASSWORD_FILE' ||
    cloudDeployment?.webui_auth?.auth_mode_env !== 'OPL_WEBUI_AUTH_MODE=password' ||
    !String(cloudDeployment?.webui_auth?.auto_login ?? '').includes('disabled')
  ) {
    throw new Error('Docker/WebUI cloud deployment must require password auth and disable auto-login');
  }
  if (
    cloudDeployment?.gateway_api_key?.optional_secret !== 'OPL_GATEWAY_API_KEY_FILE' ||
    cloudDeployment?.gateway_api_key?.does_not_replace_webui_password !== true ||
    !String(cloudDeployment?.gateway_api_key?.transport ?? '').includes('stdin_only')
  ) {
    throw new Error('Docker/WebUI cloud deployment must keep Gateway API key optional, stdin-only, and separate from WebUI password');
  }
  assertIncludesAll(
    cloudDeployment?.fail_closed_rules,
    [
      'cloud_or_password_mode_requires_OPL_WEBUI_PASSWORD_FILE_or_OPL_WEBUI_PASSWORD',
      'gateway_api_key_secret_without_webui_password_secret_must_refuse_start',
      'secret_files_must_be_readable_and_non_empty',
      'configured_password_and_gateway_key_must_not_be_logged_or_written_to_diagnostics',
    ],
    'Docker/WebUI cloud fail-closed rules',
  );
  if (
    dockerWebui.installer_model?.runtime_proxy_smoke?.mode !== 'webui_proxy_configure_codex' ||
    dockerWebui.installer_model?.runtime_proxy_smoke?.endpoint !== '/api/opl-runtime/configure-codex' ||
    dockerWebui.installer_model?.runtime_proxy_smoke?.command !== 'opl system configure-codex --api-key-stdin --json' ||
    dockerWebui.installer_model?.runtime_proxy_smoke?.secret_transport !== 'stdin_only' ||
    dockerWebui.installer_model?.runtime_proxy_smoke?.key_material_recorded !== false
  ) {
    throw new Error('Docker/WebUI runtime proxy smoke must validate configure-codex stdin transport without key material');
  }
  const ordinaryUserStatus = dockerWebui.installer_model?.ordinary_user_status;
  if (ordinaryUserStatus?.path_id !== 'ordinary_docker_webui_user_path') {
    throw new Error('Docker/WebUI ordinary user status must use the ordinary Docker/WebUI user path id');
  }
  if (ordinaryUserStatus?.priority !== 'ordinary_user_path_before_evidence_bundle_language') {
    throw new Error('Docker/WebUI ordinary user status must prioritize ordinary user path language');
  }
  assertIncludesAll(
    ordinaryUserStatus?.display_order,
    ['one_click_install', 'browser_webui', 'access_key_settings', 'runtime_proxy', 'startup_recovery', 'data_preservation', 'host_update'],
    'Docker/WebUI ordinary user status rows',
  );
  if (ordinaryUserStatus?.settings_entry !== 'Settings -> Account & Access') {
    throw new Error('Docker/WebUI ordinary user status must route Gateway account and API Key changes through Settings -> Account & Access');
  }
  if (
    !String(ordinaryUserStatus?.rows?.access_key_settings ?? '').includes('Sign in to OPL Gateway') ||
    !String(ordinaryUserStatus?.rows?.access_key_settings ?? '').includes('API Key') ||
    !String(ordinaryUserStatus?.rows?.runtime_proxy ?? '').includes('reuse the existing OPL runtime provider')
  ) {
    throw new Error('Docker/WebUI ordinary user status must describe account-first model access on the shared runtime provider');
  }
  if (
    !String(ordinaryUserStatus?.image_seed_selection ?? '').includes('Default stable image') ||
    !String(ordinaryUserStatus?.image_seed_selection ?? '').includes('--tag latest is explicit Preview opt-in')
  ) {
    throw new Error('Docker/WebUI ordinary user status must declare the default WebUI full seed image path');
  }
  assertIncludesAll(
    ordinaryUserStatus?.must_prefer_over,
    ['release_evidence_bundle', 'operator_evidence_bundle', 'preflight_gate_summary'],
    'Docker/WebUI ordinary user status language precedence',
  );
  assertIncludesAll(
    ordinaryUserStatus?.must_not_claim,
    ['desktop_release_ready', 'real_install_ready', 'clean_windows_vm_pass_without_clean_windows_evidence', 'release_ready'],
    'Docker/WebUI ordinary user status false-ready boundary',
  );
  if (dockerWebui.installer_model?.startup_doctor?.validator !== 'scripts/validate-docker-webui-diagnostics.ts') {
    throw new Error('Docker/WebUI startup diagnostics must use validate-docker-webui-diagnostics.ts');
  }
  assertIncludesAll(
    dockerWebui.installer_model?.startup_doctor?.required_files,
    [
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
    'Docker/WebUI startup diagnostics required files',
  );
  assertIncludesAll(
    dockerWebui.installer_model?.ordinary_user_progress?.must_not_claim,
    ['release readiness', 'clean VM pass', 'domain readiness', 'production readiness'],
    'Docker/WebUI ordinary user progress false-ready boundary',
  );
  assertIncludesAll(
    dockerWebui.installer_model?.ordinary_user_progress?.status_surfaces,
    [
      'HTTP health readback',
      'api_key_flow_evidence',
      'data-preservation verdict',
      'compose volume mapping readback',
      'image digest readback',
      'remote image digest readback',
      'image currentness status readback',
      'OPL maintenance status after WebUI opens',
    ],
    'Docker/WebUI ordinary user progress status surfaces',
  );
  if (dockerWebui.installer_model?.manual_docker_fallback !== 'advanced_troubleshooting_path_only') {
    throw new Error('Docker/WebUI install exposure must keep manual Docker as an advanced fallback only');
  }
  assertIncludesAll(
    dockerWebui.installer_model?.manual_fallback_forms,
    ['docker run', 'docker compose'],
    'Docker/WebUI manual fallback forms',
  );
  if (dockerWebui?.runtime_distribution_model?.container_role !== 'preheated_webui_runtime_image') {
    throw new Error('Docker/WebUI install exposure must declare the preheated WebUI runtime image model');
  }
  if (dockerWebui.runtime_distribution_model?.persistent_data_dir !== '/data') {
    throw new Error('Docker/WebUI install exposure must keep /data as the persistent data directory');
  }
  if (dockerWebui.runtime_distribution_model?.persistent_projects_dir !== '/projects') {
    throw new Error('Docker/WebUI install exposure must keep /projects as the persistent projects directory');
  }
  if (dockerWebui.runtime_distribution_model?.default_profile !== 'webui_full') {
    throw new Error('Docker/WebUI install exposure must make webui_full the beginner default profile');
  }
  if (
    dockerWebui.runtime_distribution_model?.stable_channel_policy !==
      'stable_is_the_default_full_image_and_latest_is_explicit_preview_opt_in'
  ) {
    throw new Error('Docker/WebUI install exposure must keep Stable as the full-image default and Latest as explicit Preview opt-in');
  }
  if (dockerWebui.runtime_distribution_model?.required_image_manifest !== '/opt/opl/image-manifest.json') {
    throw new Error('Docker/WebUI install exposure must require the canonical /opt/opl image manifest');
  }
  if (dockerWebui.runtime_distribution_model?.required_seed_metadata !== '/opt/opl/seed/metadata.json') {
    throw new Error('Docker/WebUI install exposure must require the canonical /opt/opl seed metadata');
  }
  assertIncludesAll(
    dockerWebui.runtime_distribution_model?.required_full_seed_components,
    ['opl_framework', 'codex_cli', 'companion_skills', 'domain_modules'],
    'Docker/WebUI full seed components',
  );
  for (const surface of ['opl system startup-maintenance --json', 'opl update status --json']) {
    if (!dockerWebui.runtime_distribution_model?.status_surfaces?.includes(surface)) {
      throw new Error(`Docker/WebUI install exposure must include status surface ${surface}`);
    }
  }
  if (
    dockerWebui.runtime_distribution_model?.image_update_model?.currentness_status_model !==
      'local_image_digest_and_optional_remote_image_digest_compare_only' ||
    dockerWebui.runtime_distribution_model?.image_update_model?.currentness_claim_policy !==
      'remote digest comparison is status-only; it does not prove release readiness, the live stable channel, or that a host update was applied'
  ) {
    throw new Error('Docker/WebUI image currentness must remain status-only and separate from release-ready or applied-update proof');
  }
  if (
    dockerWebui.runtime_distribution_model?.image_update_model?.host_auto_update_contract_ref !==
      'installer_surfaces[surface=docker_webui].installer_model.host_auto_update' ||
    dockerWebui.runtime_distribution_model?.image_update_model?.linux_server_auto_update_default !==
      'disabled_until_administrator_explicitly_configures_a_system_scheduler' ||
    dockerWebui.runtime_distribution_model?.image_update_model?.automatic_channel_policy !==
      'default_stable_only_preview_or_custom_image_tag_or_digest_requires_manual_update' ||
    dockerWebui.runtime_distribution_model?.image_update_model?.scheduled_code_policy !==
      'locally_preserved_reviewed_runner_only_no_mutable_main_branch_download_or_execution' ||
    dockerWebui.runtime_distribution_model?.image_update_model?.health_failure_recovery !==
      'restore_previous_image_digest_and_recreate_with_pull_disabled'
  ) {
    throw new Error('Docker/WebUI image automatic updates must reuse the shared host auto-update contract');
  }
  assertIncludesAll(
    dockerWebui.runtime_distribution_model?.image_update_model?.host_auto_update_platforms,
    ['windows_task_scheduler', 'macos_launch_agent', 'linux_systemd_user_timer'],
    'Docker/WebUI host auto-update platforms',
  );
  validateDockerWebuiSmokeGateContract(dockerWebui.smoke_gate_contract);
}

function validateDockerWebuiSmokeGateContract(contract) {
  if (contract?.status !== 'required_manual_or_workflow_gate_not_live_evidence') {
    throw new Error('Docker/WebUI smoke gate contract must not claim live evidence from docs/contracts alone');
  }
  if (contract.release_readiness_policy !== 'must_not_claim_release_ready_until_required_smoke_gates_have_fresh_artifacts_or_typed_blockers') {
    throw new Error('Docker/WebUI smoke gate contract must block release-ready claims until required smoke evidence or typed blockers exist');
  }
  if (contract.workflow_artifact !== 'docker-webui-smoke-gate-contract.json') {
    throw new Error('Docker/WebUI smoke gate contract must declare the workflow contract artifact');
  }
  if (
    contract.workflow_import?.live_release_import !== 'none' ||
    contract.workflow_import?.authority !== 'standalone_diagnostic_only_non_authoritative_for_stable_mutation'
  ) {
    throw new Error('Docker/WebUI smoke evidence must not import retired desktop release authority');
  }
  if (contract.workflow_import?.manual_producer_workflow !== '.github/workflows/docker-webui-clean-vm.yml') {
    throw new Error('Docker/WebUI clean VM gates must declare the unified standalone manual producer workflow');
  }
  if (contract.workflow_import?.manual_producer_platform_input !== 'platform') {
    throw new Error('Docker/WebUI clean VM producer must select the platform through one typed input');
  }
  if (
    contract.workflow_import?.manual_producer_platforms?.linux !== 'clean_linux_vm'
    || contract.workflow_import?.manual_producer_platforms?.windows !== 'clean_windows_vm'
  ) {
    throw new Error('Docker/WebUI clean VM producer must preserve the Linux and Windows evidence gates');
  }
  assertIncludesAll(
    contract.diagnostic_bundle_artifacts,
    [
      'compose.yaml',
      'docker ps',
      'docker logs',
      'image_digest_readback',
      'remote_image_digest_readback_optional',
      'image_currentness_status_readback',
      'compose_volume_mapping_readback',
      'http_health_readback',
      'api_key_flow_evidence',
      'auth_user_readback',
      'data_preservation_inventory',
      'install_manifest_readback',
      'projects_mount_readback',
    ],
    'Docker/WebUI smoke diagnostic bundle artifacts',
  );
  assertIncludesAll(
    contract.health_check_surfaces,
    [
      'http://localhost:3000/',
      'http://localhost:3000/manifest.webmanifest',
      'http://localhost:3000/api/auth/user',
      'OnePersonLab/data/opl/state/install-manifest.json',
      'OnePersonLab/projects',
    ],
    'Docker/WebUI smoke health check surfaces',
  );
  const gateById = new Map([
    ...(contract.required_gates ?? []),
    ...(contract.optional_gates ?? []),
    ...(contract.diagnostic_gates ?? []),
  ].map((gate) => [gate.id, gate]));
  for (const gateId of ['clean_linux_vm', 'clean_windows_vm', 'existing_docker', 'existing_old_onepersonlab_data_dir']) {
    const gate = gateById.get(gateId);
    if (!gate) {
      throw new Error(`Docker/WebUI smoke gate contract missing required gate ${gateId}`);
    }
    if (!String(gate.execution_mode ?? '').includes('smoke')) {
      throw new Error(`Docker/WebUI smoke gate ${gateId} must declare a smoke execution mode`);
    }
    assertIncludesAll(
      gate.required_evidence,
      [
        'compose_yaml',
        'image_digest_readback',
        'compose_volume_mapping_readback',
        'container_logs',
        'http_health_readback',
        'api_key_flow_evidence',
        'data_preservation_inventory',
        'install_manifest_readback',
      ],
      `Docker/WebUI smoke gate ${gateId} evidence`,
    );
  }
  if (gateById.get('clean_linux_vm')?.entrypoint !== 'install-docker-webui.sh --yes') {
    throw new Error('Docker/WebUI clean Linux VM gate must use the shell one-click installer');
  }
  if (gateById.get('clean_linux_vm')?.execution_mode !== 'desktop_release_same_job_ubuntu_clean_vm_smoke_or_manual_vm_smoke') {
    throw new Error('Docker/WebUI clean Linux VM gate must default to the desktop release same-job Ubuntu smoke');
  }
  if (!Array.isArray(contract.required_gates) || contract.required_gates.map((gate) => gate.id).join(',') !== 'clean_linux_vm') {
    throw new Error('Docker/WebUI release-blocking smoke gates must only require clean_linux_vm');
  }
  if (!Array.isArray(contract.optional_gates) || !contract.optional_gates.some((gate) => gate.id === 'clean_windows_vm')) {
    throw new Error('Docker/WebUI clean Windows VM gate must be optional diagnostic evidence');
  }
  if (gateById.get('clean_windows_vm')?.entrypoint !== 'install-docker-webui.ps1 -Yes') {
    throw new Error('Docker/WebUI clean Windows VM gate must use the PowerShell one-click installer');
  }
  if (gateById.get('clean_windows_vm')?.execution_mode !== 'self_hosted_clean_windows_runner_or_manual_vm_smoke') {
    throw new Error('Docker/WebUI clean Windows VM gate must use a self-hosted clean Windows runner or manual VM smoke');
  }
  if (gateById.get('existing_docker')?.docker_state !== 'existing_docker_must_be_reused_not_reinstalled') {
    throw new Error('Docker/WebUI existing Docker gate must require reusing existing Docker');
  }
  if (gateById.get('existing_old_onepersonlab_data_dir')?.data_state !== 'existing_OnePersonLab_data_dir_must_be_preserved_or_migrated_without_delete') {
    throw new Error('Docker/WebUI old data dir gate must require preserve-or-migrate behavior');
  }
  if (
    contract.false_ready_boundary?.docs_or_contract_only_can_claim_release_ready !== false ||
    contract.false_ready_boundary?.local_container_smoke_can_replace_clean_vm_smoke !== false ||
    contract.false_ready_boundary?.remote_digest_match_can_claim_release_ready !== false ||
    contract.false_ready_boundary?.image_digest_readback_can_claim_live_currentness !== false ||
    contract.false_ready_boundary?.missing_gate_must_be_typed_blocker !== true
  ) {
    throw new Error('Docker/WebUI smoke gate false-ready boundary must forbid release-ready claims without fresh gate evidence');
  }
}

function validateFirstRunUserPresentation(presentation) {
  if (presentation?.default_mode !== 'beginner_first') {
    throw new Error('Install exposure first-run presentation must be beginner_first');
  }
  if (presentation.skill_plugin_distinction_visible_by_default !== false) {
    throw new Error('Install exposure first-run presentation must hide skill/plugin distinction by default');
  }
  assertIncludesAll(
    presentation.primary_steps,
    expectedFirstRunCoreItems,
    'Install exposure first-run primary steps',
  );
  assertIncludesAll(
    presentation.secondary_steps,
    expectedFullReadinessItems,
    'Install exposure first-run secondary steps',
  );
  if (presentation.technical_detail_policy !== 'hidden_until_expanded_or_error') {
    throw new Error('Install exposure technical details must be hidden until expanded or error');
  }
}

function validateSetupFlowContract(setupFlow) {
  if (setupFlow?.source_command !== expectedFirstRunProgressModel.source_command) {
    throw new Error(`Install exposure setup flow must use ${expectedFirstRunProgressModel.source_command}`);
  }
  if (setupFlow?.source_path !== expectedFirstRunProgressModel.source_path) {
    throw new Error(`Install exposure setup flow must read ${expectedFirstRunProgressModel.source_path}`);
  }
  if (setupFlow?.truth_policy !== 'all_installers_and_renderers_derive_progress_from_the_shared_initialize_model') {
    throw new Error('Install exposure setup flow must forbid separate installer progress truth');
  }
  if (setupFlow.ready_to_launch_gate !== 'ready_to_launch') {
    throw new Error('Install exposure setup flow must use ready_to_launch gate');
  }
  assertIncludesAll(
    setupFlow.ready_to_launch_required_core_items,
    expectedFirstRunCoreItems,
    'Install exposure ready_to_launch core items',
  );
  assertIncludesAll(
    setupFlow.full_readiness_non_blocking_items,
    expectedFullReadinessItems,
    'Install exposure full readiness non-blocking items',
  );
  const firstConversation = setupFlow.first_conversation_readiness;
  if (
    firstConversation?.gate !== expectedFirstConversation.gate ||
    firstConversation?.source_command !== expectedFirstRunProgressModel.source_command ||
    firstConversation?.ready_to_launch_must_be_true !== false ||
    firstConversation?.unknown_readiness_policy !== expectedFirstConversation.unknown_readiness_policy ||
    firstConversation?.blocked_feedback !== expectedFirstConversation.blocked_feedback ||
    firstConversation?.failure_policy !== expectedFirstConversationFailurePolicy
  ) {
    throw new Error('Install exposure first conversation readiness must apply granular prerequisites before ACP warmup');
  }
  assertDeepEqualJson(
    firstConversation.required_before_plain_send,
    expectedFirstConversation.required_before_plain_send,
    'Install exposure plain send prerequisites',
  );
  assertDeepEqualJson(
    firstConversation.required_before_send_with_local_inputs,
    expectedFirstConversation.required_before_send_with_local_inputs,
    'Install exposure send with local inputs prerequisites',
  );
  assertDeepEqualJson(
    firstConversation.required_before_workspace_controls,
    expectedFirstConversation.required_before_workspace_controls,
    'Install exposure workspace control prerequisites',
  );
  assertIncludesAll(
    firstConversation.must_wait_for,
    expectedFirstConversationMustWaitFor,
    'Install exposure first conversation wait-for items',
  );
  assertIncludesAll(
    firstConversation.must_not_wait_for,
    expectedFullReadinessItems,
    'Install exposure first conversation non-blocking readiness items',
  );
}

export function validateInstallExposurePolicy(policy) {
  validateInstallExposureHeader(policy);
  validateComponentInteroperability(policy.component_interoperability);
  validateCapabilityGovernance(policy.capability_governance);
  validateCanonicalMetadataSources(policy.canonical_metadata_sources);
  validatePublicAbi(policy.public_abi);
  validateExposureClasses(policy);
  validateInstallerSurfaces(policy);
  validateFirstRunUserPresentation(policy.first_run_user_presentation);
  validateSetupFlowContract(policy.setup_flow_contract);

  validateInstallExposureRuntimeAndDistribution(policy);
}
