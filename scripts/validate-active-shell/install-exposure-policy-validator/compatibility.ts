import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';
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
export { validateComponentInteroperability };
