import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';

export function validateRuntimeBridgeCommandResolutionPolicy(runtimeBridge) {
  const commandResolutionPolicy = runtimeBridge.command_resolution_policy;
  if (commandResolutionPolicy?.owner !== 'one-person-lab-app') {
    throw new Error('Runtime bridge command resolution policy must be App-owned');
  }
  if (commandResolutionPolicy?.adapter_responsibility !== 'resolve_healthy_opl_cli_before_running_declared_surfaces') {
    throw new Error('Runtime bridge command resolution policy must require healthy OPL CLI resolution');
  }
  if (commandResolutionPolicy?.managed_opl_priority !== 'prefer_only_when_shim_targets_existing_cli_payload') {
    throw new Error('Runtime bridge must prefer managed OPL only when its shim targets an existing CLI payload');
  }
  if (commandResolutionPolicy?.broken_managed_shim_policy !== 'skip_and_fall_through_to_system_opl') {
    throw new Error('Runtime bridge must skip broken managed OPL shims and fall through to system OPL');
  }
  for (const fallbackPath of ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']) {
    if (!commandResolutionPolicy?.system_opl_fallback_paths?.includes(fallbackPath)) {
      throw new Error(`Runtime bridge command resolution policy must include fallback path ${fallbackPath}`);
    }
  }
  for (const forbidden of [
    'let stale managed Node opl shims shadow a healthy system opl',
    'rewrite App runtime truth from shell-private state',
    'treat missing managed bootstrap artifacts as first-run UI truth',
  ]) {
    if (!commandResolutionPolicy?.must_not?.includes(forbidden)) {
      throw new Error(`Runtime bridge command resolution policy must forbid: ${forbidden}`);
    }
  }
  const sharedGuiTarget = commandResolutionPolicy?.shared_gui_target;
  for (const [field, expected] of Object.entries({
    implementation_status:
      'candidate_launcher_runtime_provenance_readback_implemented_compatibility_parity_not_proven',
    producer: 'app_host_runtime_resolver',
    producer_status: 'implemented_for_local_gui_launcher',
  })) {
    if (sharedGuiTarget?.[field] !== expected) {
      throw new Error(`Runtime bridge shared GUI command resolver target ${field} must be ${expected}`);
    }
  }
  assertIncludesAll(sharedGuiTarget?.required_executables, ['opl', 'codex'], 'Shared GUI runtime executables');
  const compatibilityRequirements = sharedGuiTarget?.compatibility_requirements;
  if (!Array.isArray(compatibilityRequirements)) {
    throw new Error('Shared GUI runtime compatibility requirements must be an array');
  }
  for (const requirement of compatibilityRequirements) {
    if (requirement?.kind !== 'capability_id_with_versioned_schema') {
      throw new Error(`Shared GUI runtime compatibility requirement kind ${requirement?.kind ?? '(missing)'} is unsupported`);
    }
  }
  assertDeepEqualJson(
    compatibilityRequirements,
    [
      {
        kind: 'capability_id_with_versioned_schema',
        component_id: 'opl_framework',
        capability_id: 'opl_app_state_fast',
        schema_range: '>=1 <2',
      },
      {
        kind: 'capability_id_with_versioned_schema',
        component_id: 'opl_framework',
        capability_id: 'opl_app_action_execute',
        schema_range: '>=1 <2',
      },
      {
        kind: 'capability_id_with_versioned_schema',
        component_id: 'codex_cli',
        capability_id: 'codex_app_server',
        schema_range: '>=1 <2',
      },
    ],
    'Shared GUI runtime compatibility requirements',
  );
  if (sharedGuiTarget?.observational_build_provenance?.may_gate_install_or_runtime !== false) {
    throw new Error('Shared GUI runtime observational build provenance may_gate_install_or_runtime must be false');
  }
  assertDeepEqualJson(
    sharedGuiTarget?.observational_build_provenance,
    {
      schema: 'app_runtime_executable_identity.v1',
      fields: ['opl_path', 'opl_version', 'codex_path', 'codex_version', 'runtime_cohort_ref'],
      role: 'per_gui_artifact_source_observation_only',
      may_gate_install_or_runtime: false,
    },
    'Shared GUI runtime observational build provenance',
  );
}

export function validateSharedGuiRuntimeResolutionPolicy(runtimeBridge) {
  const policy = runtimeBridge.shared_gui_runtime_resolution_policy;
  if ('same_cohort_runtime_identity_required_for_parity' in (policy ?? {})) {
    throw new Error('Runtime parity must not retain the same_cohort_runtime_identity_required_for_parity gate');
  }
  for (const [field, expected] of Object.entries({
    state: 'source_binding_and_packaged_artifact_evidence_complete',
    policy_owner: 'one-person-lab-app',
    runtime_identity_owner: 'gaofeng21cn/opl-studio',
    resolver_source: 'contracts/app-runtime-bridge.json#command_resolution_policy.shared_gui_target',
    logical_control_plane_shared: true,
    parity_admission_basis: 'compatible_runtime_capability_and_versioned_schema_range',
    exact_runtime_identity_equality_may_gate_install_or_runtime: false,
    host_path_only_resolution_can_prove_parity: false,
    historical_aionui_status: 'retired_historical_provenance_only',
    opl_studio_status: 'opl_codex_native_managed_app_server_is_the_only_current_runtime',
    same_physical_runtime_currently_claimed: false,
    implementation_status: 'active_studio_native_codex_runtime',
  })) {
    if (policy?.[field] !== expected) {
      throw new Error(`Runtime bridge shared GUI runtime resolution policy ${field} must be ${expected}`);
    }
  }

  const identityContract = policy?.runtime_identity_contract;
  for (const [field, expected] of Object.entries({
    schema: 'opl_codex_runtime_identity.v1',
    contract_owner: 'one-person-lab-app',
    producer_owner: 'gaofeng21cn/opl-studio',
    carrier: 'opl_codex_native_managed_app_server_stdio',
    direct_app_server_binding: 'identity_verified_before_exact_codex_app_server_spawn',
    opl_codex_native_binding:
      'studio_resolved_codex_executable_plus_managed_app_server_initialize_handshake',
  })) {
    if (identityContract?.[field] !== expected) {
      throw new Error(`Runtime bridge Codex identity contract ${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    identityContract?.required_fields,
    [
      'path',
      'realpath',
      'version',
      'sha256',
      'codex_home',
      'runtime_key',
      'runtime_cohort_ref',
      'carrier.external_binary_sha256',
      'carrier.external_binary_path',
      'carrier.studio_native_readback',
    ],
    'Runtime bridge Codex identity fields',
  );
  assertDeepEqualJson(
    identityContract?.environment_binding_fields,
    [
      'OPL_CODEX_BIN',
      'CODEX_HOME',
      'OPL_CODEX_RUNTIME_IDENTITY_JSON',
      'OPL_CODEX_RUNTIME_COHORT_REF',
      'PATH',
    ],
    'Runtime bridge Codex identity environment binding',
  );
  assertDeepEqualJson(
    identityContract?.typed_error_codes,
    [
      'USER_AGENT_NOT_INSTALLED',
      'USER_AGENT_COMMAND_NOT_FOUND',
      'MANAGED_RUNTIME_UNAVAILABLE',
      'RUNTIME_ACTIVATION_REQUIRED',
      'RUNTIME_IDENTITY_MISMATCH',
    ],
    'Runtime bridge Codex identity typed errors',
  );

  const evidenceContract = policy?.packaged_evidence_contract;
  for (const [field, expected] of Object.entries({
    schema_ref: 'contracts/opl-codex-runtime-identity-evidence.schema.json',
    launch_entrypoint: 'finder',
    minimal_path: '/usr/bin:/bin',
    global_codex_required: false,
    referenced_file_sha256_required: true,
    claim_scope: 'studio_resolved_codex_executable_and_successful_native_app_server_handshake',
    artifact_trigger_status: 'complete',
    evidence_receipt: 'contracts/opl-codex-runtime-identity-evidence.schema.json',
  })) {
    if (evidenceContract?.[field] !== expected) {
      throw new Error(`Runtime bridge Codex packaged evidence ${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    evidenceContract?.required_run_ids,
    ['full_clean_install_finder', 'standard_update_after_full_finder'],
    'Runtime bridge Codex packaged evidence runs',
  );
  assertDeepEqualJson(
    evidenceContract?.identity_comparison_fields,
    ['path', 'realpath', 'version', 'sha256', 'codex_home', 'runtime_cohort_ref'],
    'Runtime bridge Codex packaged identity comparison fields',
  );
  assertDeepEqualJson(
    evidenceContract?.required_handshakes,
    ['opl_codex_native_app_server_initialize'],
    'Runtime bridge Codex packaged handshakes',
  );
}
