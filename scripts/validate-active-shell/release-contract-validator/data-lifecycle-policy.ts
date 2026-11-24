import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';
import {
  appOwnedStorageCarrierBehavior,
  appOwnedWebuiDataVolumeHostActionCapabilityId,
} from '../app-contract-constants.ts';

function validateLocalDataLifecycle(lifecycle, shellPaths) {
  if (
    lifecycle?.owner !== 'one-person-lab-app' ||
    lifecycle?.policy_surface !== 'Settings / Storage and Settings / Updates & Maintenance' ||
    lifecycle?.user_data_silent_delete_allowed !== false
  ) {
    throw new Error('Release channel must declare App-owned local data lifecycle without silent user-data deletion');
  }
  assertDeepEqualJson(
    lifecycle.external_practice_basis,
    {
      docker_system_prune: 'unused_only_prompted_and_volume_opt_in',
      pnpm_store_prune: 'unreferenced_packages_only',
      hugging_face_cache: 'scan_dry_run_delete_unreferenced_revisions',
      electron_app_paths: 'separate_userData_cache_sessionData_logs_paths',
    },
    'Local data lifecycle external practice basis',
  );
  if (
    lifecycle.updater_cache?.owner !== 'active_shell' ||
    lifecycle.updater_cache?.implementation !==
      'shells/opl-studio/desktop/updater.mjs' ||
    lifecycle.updater_cache?.cache_dir !== '~/Library/Caches/cn.onepersonlab.opl.ShipIt' ||
    lifecycle.updater_cache?.auto_cleanup !== 'startup_and_before_install'
  ) {
    throw new Error('Local data lifecycle must bind updater cache cleanup to the active shell implementation');
  }
  assertDeepEqualJson(
    lifecycle.updater_cache?.keep,
    ['pending/update-info.json', 'currently_selected_update_package'],
    'Local data lifecycle updater cache keep set',
  );
  assertDeepEqualJson(
    lifecycle.updater_cache?.delete,
    ['stale update.zip', 'stale pending/*.zip', 'stale platform installer packages'],
    'Local data lifecycle updater cache delete set',
  );
  assertDeepEqualJson(
    lifecycle.updater_cache?.retired_cache_dirs,
    ['~/Library/Caches/one-person-lab-aion-shell-updater'],
    'Local data lifecycle retired updater cache roots',
  );
  assertIncludesAll(
    lifecycle.storage_inventory?.sections,
    ['updater_cache', 'user_data_artifacts', 'runtime_substrate', 'logs'],
    'Local data lifecycle storage inventory sections',
  );
  assertIncludesAll(
    lifecycle.storage_inventory?.required_fields,
    ['path', 'exists', 'bytes', 'cleanup_mode', 'silent_delete_allowed'],
    'Local data lifecycle storage inventory required fields',
  );
  const ownerStorage = lifecycle.owner_storage_projections;
  assertDeepEqualJson(
    ownerStorage?.sections,
    ['agent_package_store', 'webui_data_volume'],
    'Local data lifecycle owner storage sections',
  );
  assertDeepEqualJson(
    ownerStorage?.common_required_fields,
    ['status', 'observed_at', 'stale', 'bytes', 'reclaimable_bytes', 'owner_route', 'projected_action'],
    'Local data lifecycle owner storage fields',
  );
  validateWebuiDataVolumeHostActionAbi(
    ownerStorage?.webui_data_volume?.host_action_abi,
  );
  if (
    lifecycle.storage_inventory?.surface !== 'Settings / Storage' ||
    lifecycle.storage_inventory?.execution_mode !== 'scan_dry_run_first' ||
    lifecycle.storage_inventory?.implementation !==
      'one-person-lab-app:App-owned storage inventory projection and carrier-host action ABI' ||
    ownerStorage?.projection_source !== 'opl app state --profile fast --json' ||
    ownerStorage?.missing_projection_policy !== 'fail_open_keep_shell_owned_categories_available' ||
    ownerStorage?.unknown_bytes_policy !== 'unavailable_never_zero' ||
    ownerStorage?.agent_package_store?.owner !== 'one-person-lab' ||
    ownerStorage?.agent_package_store?.ordinary_action !== 'navigate_to_/settings/agents' ||
    ownerStorage?.agent_package_store?.storage_direct_uninstall_allowed !== false ||
    ownerStorage?.webui_data_volume?.inventory_owner !== 'one-person-lab' ||
    ownerStorage?.webui_data_volume?.execution_owner !== 'carrier_host' ||
    ownerStorage?.webui_data_volume?.webui_container_execution !== 'host_action_required_without_docker_socket' ||
    ownerStorage?.webui_data_volume?.generic_docker_prune_allowed !== false ||
    ownerStorage?.webui_data_volume?.shell_direct_path_delete_allowed !== false ||
    lifecycle.updater_cache?.receipt_required !== true ||
    lifecycle.user_data_artifacts?.default_policy !== 'retain_conversations_workspaces_and_artifacts_until_user_cleanup_or_archive' ||
    lifecycle.user_data_artifacts?.silent_delete_allowed !== false ||
    lifecycle.user_data_artifacts?.cleanup_execution !== 'archive_then_explicit_user_confirmed_delete' ||
    lifecycle.user_data_artifacts?.archive_required_before_cleanup !== true ||
    lifecycle.user_data_artifacts?.restore_proof_required !== true ||
    lifecycle.user_data_artifacts?.cleanup_surface !== 'Settings / Storage' ||
    lifecycle.runtime_substrate?.default_policy !== 'retain_current_and_declared_rollback_runtime' ||
    lifecycle.runtime_substrate?.owner_ref !== 'contracts/app-release-channel.json#managed_update_plane.software_lifecycle.objects.opl_base' ||
    lifecycle.runtime_substrate?.cleanup_execution !== 'pointer_based_dry_run_first_explicit_execute_required' ||
    lifecycle.runtime_substrate?.protected_refs?.current_pointer !==
      '~/Library/Application Support/OPL/runtime/current.json' ||
    lifecycle.runtime_substrate?.protected_refs?.current_root !==
      '~/Library/Application Support/OPL/runtime/current' ||
    lifecycle.runtime_substrate?.prune_candidate_policy !== 'unreferenced_marker_backed_runtime_generations_only' ||
    lifecycle.runtime_substrate?.dry_run_receipt_required !== true ||
    lifecycle.logs?.default_policy !== 'bounded_rotation_or_user_cleanup' ||
    lifecycle.logs?.silent_delete_allowed !== false ||
    lifecycle.logs?.cleanup_execution !== 'bounded_rotation_dry_run_first' ||
    lifecycle.logs?.dry_run_receipt_required !== true ||
    lifecycle.logs?.retention?.retain_days !== 30 ||
    lifecycle.logs?.retention?.retain_files_minimum !== 7 ||
    lifecycle.logs?.retention?.max_file_bytes !== 10485760
  ) {
    throw new Error('Local data lifecycle must retain user artifacts and bind runtime/log cleanup to explicit policy surfaces');
  }
  assertDeepEqualJson(
    lifecycle.storage_carrier_behavior,
    appOwnedStorageCarrierBehavior,
    'Local data lifecycle Storage carrier behavior',
  );
  assertDeepEqualJson(
    lifecycle.user_data_artifacts?.archive_receipt_required_fields,
    ['conversation_id', 'source_paths', 'archive_path', 'archive_sha256', 'manifest_path', 'restore_probe_path', 'created_at'],
    'Local data lifecycle conversation archive receipt fields',
  );
  assertDeepEqualJson(
    lifecycle.user_data_artifacts?.delete_receipt_required_fields,
    ['conversation_id', 'deleted_paths', 'archive_receipt_path', 'confirmed_at', 'created_at'],
    'Local data lifecycle conversation delete receipt fields',
  );
  const deleteBoundary = lifecycle.user_data_artifacts?.delete_execution_boundary;
  assertDeepEqualJson(
    deleteBoundary?.required_inputs,
    ['archiveReceiptPath', 'archiveRoot', 'receiptRoot', 'allowedSourcePaths'],
    'Local data lifecycle conversation delete verifier inputs',
  );
  if (
    deleteBoundary?.canonical_verifier !== 'verifyConversationArchiveReceipt' ||
    deleteBoundary?.receipt_path_must_be_inside_receipt_root !== true ||
    deleteBoundary?.archive_path_must_be_inside_archive_root !== true ||
    deleteBoundary?.manifest_source_paths_must_equal_current_conversation_roots !== true ||
    deleteBoundary?.symlink_or_root_escape_allowed !== false
  ) {
    throw new Error('Local data lifecycle conversation delete must reuse the canonical archive verifier');
  }
  assertDeepEqualJson(
    lifecycle.runtime_substrate?.inventory_roots,
    [
      {
        id: 'shell_toolchain_runtime',
        owner: 'active_shell',
        derivation: 'getSystemDir().workDir/runtime',
        cleanup_authority: 'inventory_only_no_pointer_prune',
      },
      {
        id: 'managed_opl_runtime',
        owner: 'one-person-lab',
        derivation: "OPL_RUNTIME_TOOLCHAIN_ROOT_or_darwin_app.getPath('home')/Library/Application Support/OPL/runtime",
        configured_override: 'OPL_RUNTIME_TOOLCHAIN_ROOT',
        default_platform: 'darwin',
        non_darwin_without_override: 'blocked',
        cleanup_authority: 'pointer_prune_owner',
      },
    ],
    'Local data lifecycle runtime inventory roots',
  );
  assertDeepEqualJson(
    lifecycle.runtime_substrate?.protected_root_names,
    ['current', 'previous', 'toolcache', 'generations', 'staged'],
    'Local data lifecycle protected runtime roots',
  );
  const runtimeAuthority = lifecycle.runtime_substrate?.authority_gate;
  if (
    lifecycle.runtime_substrate?.prune_authority_root !== 'managed_opl_runtime' ||
    lifecycle.runtime_substrate?.protected_refs?.previous_root !==
      '~/Library/Application Support/OPL/runtime/previous' ||
    lifecycle.runtime_substrate?.candidate_marker !== '.opl-full-runtime-installed.json' ||
    lifecycle.runtime_substrate?.prune_candidate_policy !==
      'unreferenced_marker_backed_runtime_generations_only' ||
    lifecycle.runtime_substrate?.staged_candidate_policy !==
      'marker_backed_runtime_generation_only_non_runtime_staged_lanes_protected' ||
    lifecycle.runtime_substrate?.symlink_or_root_escape_allowed !== false ||
    runtimeAuthority?.required_pointer !== 'current.json' ||
    runtimeAuthority?.pointer_target_must_be_inside_runtime_root !== true ||
    runtimeAuthority?.current_target_marker !== '.opl-full-runtime-installed.json' ||
    runtimeAuthority?.missing_or_invalid_authority !== 'blocked_no_candidates_no_execute' ||
    runtimeAuthority?.execute_must_revalidate_pointer_and_protected_paths !== true
  ) {
    throw new Error('Local data lifecycle runtime prune must fail closed on managed OPL authority and marker checks');
  }
  assertDeepEqualJson(
    lifecycle.runtime_substrate?.execute_receipt_required_fields,
    ['runtime_root', 'dry_run_plan_id', 'protected_paths', 'deleted_paths', 'deleted_bytes', 'created_at'],
    'Local data lifecycle runtime prune execute receipt fields',
  );
  assertDeepEqualJson(
    lifecycle.logs?.execute_receipt_required_fields,
    ['logs_root', 'dry_run_plan_id', 'deleted_paths', 'deleted_bytes', 'created_at'],
    'Local data lifecycle log rotation execute receipt fields',
  );
}

function validateWebuiDataVolumeHostActionAbi(abi) {
  const endpoints = {
    capability: '/api/opl-storage/webui-data-volume/capability',
    plan: '/api/opl-storage/webui-data-volume/plan',
    execute: '/api/opl-storage/webui-data-volume/execute',
    restore: '/api/opl-storage/webui-data-volume/restore',
  };
  const actionIds = {
    plan_action_id: 'settings_plan_webui_data_volume_cleanup',
    execute_action_id: 'settings_execute_webui_data_volume_cleanup',
    restore_action_id: 'settings_restore_webui_data_volume_cleanup',
  };
  const exactFields = (actual, expected) =>
    Array.isArray(actual) &&
    actual.length === expected.length &&
    expected.every((field) => actual.includes(field));
  const includesFields = (actual, expected) =>
    Array.isArray(actual) && expected.every((field) => actual.includes(field));

  if (
    !abi ||
    abi.capability_id !== appOwnedWebuiDataVolumeHostActionCapabilityId ||
    abi.endpoint_availability !== 'host_owner_injected' ||
    !includesFields(abi.endpoint_status_values, ['available', 'host_action_required']) ||
    !includesFields(abi.projection_required_fields, [
      'capability_id',
      'endpoint_status',
      'endpoint_availability',
      'plan_action_id',
      'execute_action_id',
      'restore_action_id',
    ]) ||
    Object.entries(endpoints).some(
      ([id, path]) => abi.endpoints?.[id]?.method !== 'POST' || abi.endpoints?.[id]?.path !== path,
    ) ||
    Object.entries(actionIds).some(([field, value]) => abi.action_ids?.[field] !== value) ||
    abi.unavailable_projection_policy !==
      'host_action_required_with_null_action_ids_is_status_only_and_keeps_storage_usable' ||
    abi.available_cta_gate !== 'endpoint_status_available_and_all_three_exact_action_ids_present' ||
    !includesFields(abi.plan_result_required_fields, [
      'plan_id',
      'plan_hash',
      'exact_confirmation',
      'estimated_reclaimable_bytes',
      'candidate_count',
      'restore_supported',
      'observed_at',
      'expires_at',
    ]) ||
    !exactFields(abi.execute_request_required_fields, ['plan_id', 'plan_hash', 'exact_confirmation']) ||
    !includesFields(abi.execute_receipt_required_fields, [
      'receipt_id',
      'action_id',
      'status',
      'plan_id',
      'plan_hash',
      'receipt_ref',
      'restore_action_ref',
      'archive_ref',
      'archive_manifest_ref',
      'archive_sha256',
      'archived_bytes',
      'deleted_bytes',
      'readback',
    ]) ||
    !exactFields(abi.restore_request_required_fields, ['receipt_ref']) ||
    !includesFields(abi.restore_result_required_fields, [
      'status',
      'receipt_ref',
      'restore_receipt_ref',
      'readback',
    ]) ||
    abi.terminal_readback_ref !==
      'app_state.settings_control_center.app_settings_read_model.storage_lifecycle.webui_data_volume' ||
    !includesFields(abi.terminal_readback_required_fields, [
      'status',
      'terminal',
      'observed_at',
      'bytes',
      'reclaimable_bytes',
      'receipt_ref',
      'restore_status',
    ]) ||
    !exactFields(abi.renderer_payload_allowlist, [
      'plan_id',
      'plan_hash',
      'exact_confirmation',
      'receipt_ref',
    ]) ||
    abi.renderer_raw_path_allowed !== false ||
    abi.security?.authenticated_principal !== 'current_backend_authenticated_user_required' ||
    !exactFields(abi.security?.allowed_methods, ['POST']) ||
    abi.security?.content_type !== 'application/json' ||
    abi.security?.max_body_bytes !== 65536 ||
    abi.security?.origin_policy !== 'same_origin_or_csrf_equivalent_required' ||
    abi.security?.execute_restore_serialization !== 'one_in_flight_mutation_per_data_volume' ||
    abi.security?.plan_policy !== 'ttl_bound_single_use' ||
    abi.security?.duplicate_submission_policy !== 'idempotent_terminal_readback_or_typed_conflict_only' ||
    abi.security?.error_disclosure_policy !== 'typed_reason_without_raw_path'
  ) {
    throw new Error(
      'Local data lifecycle WebUI carrier-host action ABI must preserve its endpoint, action, payload, readback, restore, and security boundaries',
    );
  }
}

export function assertManagedRuntimeRootBridgeSemantics(
  bridgeText: string,
  bridgePath = 'localDataLifecycleBridge.ts',
): void {
  const forbiddenLegacySemantics = 'configuredManagedRuntimeRoot: process.env.OPL_RUNTIME_TOOLCHAIN_ROOT';
  if (bridgeText.includes(forbiddenLegacySemantics)) {
    throw new Error(
      `Active shell managed runtime root bridge must reject the unconditional OPL runtime override in ${bridgePath}`,
    );
  }
  const requiredCurrentSemantics = [
    'function managedOplRuntimeRoot(): string',
    'const configuredRoot = process.env.OPL_RUNTIME_TOOLCHAIN_ROOT?.trim()',
    'if (configuredRoot) return configuredRoot',
    "if (process.platform !== 'darwin')",
    "throw new Error('OPL_RUNTIME_TOOLCHAIN_ROOT is required outside the macOS desktop release.')",
    "path.join(app.getPath('home'), 'Library', 'Application Support', 'OPL', 'runtime')",
    "configuredManagedRuntimeRoot: process.platform === 'win32' ? undefined : managedOplRuntimeRoot()",
  ];
  const missing = requiredCurrentSemantics.find((expected) => !bridgeText.includes(expected));
  if (missing) {
    throw new Error(`Active shell managed runtime root bridge semantics must include ${missing} in ${bridgePath}`);
  }
}

export { validateLocalDataLifecycle };
