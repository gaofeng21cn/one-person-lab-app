import { assertDeepEqualJson } from '../assertions.ts';
import { appOwnedOplStandardAgentMembershipPolicy } from '../app-contract-constants.ts';
import { isDefaultReleaseAdapter } from '../active-shell-contract.ts';
import { validateUserTaskStatusProjectionContract } from '../shared-contract-validators.ts';

export function validateRuntimeBridgeIdentity(runtimeBridge, contract) {
  if (runtimeBridge.owner !== 'one-person-lab-app') {
    throw new Error(`Unexpected runtime bridge owner: ${runtimeBridge.owner}`);
  }
  if (runtimeBridge.purpose !== 'runtime_bridge_abstraction') {
    throw new Error(`Unexpected runtime bridge purpose: ${runtimeBridge.purpose}`);
  }
  if (runtimeBridge.state !== 'active') {
    throw new Error(`Unexpected runtime bridge state: ${runtimeBridge.state}`);
  }
  if (isDefaultReleaseAdapter(contract) && runtimeBridge.active_adapter !== contract.active_shell) {
    throw new Error(`Runtime bridge active adapter must match active shell: ${runtimeBridge.active_adapter}`);
  }
  if (runtimeBridge.adapter_role !== 'replaceable_gui_shell_adapter') {
    throw new Error(`Unexpected runtime bridge adapter role: ${runtimeBridge.adapter_role}`);
  }
  if (runtimeBridge.protocol_owner !== 'one-person-lab') {
    throw new Error(`Unexpected runtime bridge protocol owner: ${runtimeBridge.protocol_owner}`);
  }
  if (runtimeBridge.ui_contract_owner !== 'one-person-lab-app') {
    throw new Error(`Unexpected runtime bridge UI contract owner: ${runtimeBridge.ui_contract_owner}`);
  }
  if (isDefaultReleaseAdapter(contract) && runtimeBridge.default_adapter_repo !== contract.shell_source?.owner_repo) {
    throw new Error(`Runtime bridge adapter repo must match active shell source: ${runtimeBridge.default_adapter_repo}`);
  }
  if (isDefaultReleaseAdapter(contract) && runtimeBridge.default_adapter_path !== contract.shell_root) {
    throw new Error(`Runtime bridge adapter path must match active shell root: ${runtimeBridge.default_adapter_path}`);
  }
}

export function validateRuntimeBridgeDeclaredSurfaces(runtimeBridge) {
  for (const [field, expected] of Object.entries({
    summary_command: 'opl app state --profile fast --json',
    refresh_command: 'opl app state --profile fast --json',
    default_operator_payload: 'current_owner_delta',
    full_state_command: 'opl app state --profile full --json',
    full_state_policy: 'diagnostic_or_release_evidence_only',
    full_detail_command: 'opl runtime app-operator-drilldown --detail full --json',
    runtime_page_full_detail_allowed: false,
    action_command: 'opl app action execute --action <action_id> [--payload json] [--dry-run] --json',
    'projection_sources.primary': 'app_state.operator.workbench.work_item_projection_v2',
    'projection_sources.provider': 'runtime_tray_snapshot.app_operator_drilldown.current_control_state.states.provider_run',
    'projection_sources.actions': 'app_state.actions',
    'projection_sources.full_detail': 'runtime_tray_snapshot.app_operator_drilldown',
    'projection_sources.policy': 'work_item_projection_v2_primary_provider_projection_diagnostic_only',
  })) {
    const actual = field.split('.').reduce((value, key) => value?.[key], runtimeBridge);
    if (actual !== expected) {
      throw new Error(`Runtime bridge ${field} must be ${expected}`);
    }
  }
  if ('compatibility_operator_payload' in runtimeBridge) {
    throw new Error('Runtime bridge must not declare compatibility_operator_payload');
  }
  assertDeepEqualJson(
    runtimeBridge.full_detail_consumer_surfaces,
    ['/settings/environment?section=diagnostics', 'release_evidence_tooling'],
    'Runtime bridge full detail consumer surfaces',
  );
}

export function validateWebuiDeploymentContract(runtimeBridge) {
  const transport = runtimeBridge.webui_http_transport;
  for (const [field, expected] of Object.entries({
    implementation_owner: 'opl-studio',
    forwarded_prefix_header: 'X-Forwarded-Prefix',
    forwarded_prefix_authority: 'Serve_overwrites_client_header_and_strips_prefix_before_upstream',
    trust_policy: 'cloud_mode_or_explicit_OPL_WEBUI_TRUST_PROXY_1_only',
    absent_or_untrusted_prefix_base: '/',
    invalid_trusted_prefix_policy: 'reject_request',
    index_injection: 'official_renderIndexInjections_single_base_before_relative_assets_preserve_boot_injections',
    base_source: 'trusted_request_prefix_not_browser_pathname',
    root_absolute_product_urls_allowed: false,
    cookie_path: 'same_normalized_base_for_issue_and_clear',
    cookie_domain: 'host_only',
    upstream_routes: 'unchanged_unprefixed_routes',
  })) {
    if (transport?.[field] !== expected) throw new Error(`WebUI transport ${field} must be ${expected}`);
  }
  assertDeepEqualJson(transport.base_scoped_surfaces,
    ['assets', 'fetch', 'SSE', 'download', 'login', 'logout', 'redirects', 'session_cookie_set', 'session_cookie_clear'],
    'WebUI base-scoped surfaces');
  const deployment = runtimeBridge.webui_deployment;
  assertDeepEqualJson(deployment?.local_docker_default,
    { deployment_mode: 'local', auth_mode: 'none', discover_mode_from_secret_mounts: false },
    'WebUI local Docker default');
  const cloud = deployment.cloud;
  assertDeepEqualJson(cloud?.application_revision_template?.entrypoint, [
    '/usr/bin/env',
    'OPL_WEBUI_DEPLOYMENT_MODE=cloud',
    'OPL_WEBUI_AUTH_MODE=password',
    'OPL_WEBUI_USERNAME=opl',
    'OPL_WEBUI_PASSWORD_FILE=/run/secrets/opl_webui_password',
    'OPL_WEBUI_SESSION_SECRET_FILE=/run/secrets/webui_session_secret',
    '/usr/local/bin/opl-webui-entrypoint',
  ], 'WebUI cloud application revision entrypoint');
  assertDeepEqualJson(cloud.application_revision_template.credentials, [
    { name: 'admin-password', kind: 'workspace_admin_password', target: '/run/secrets/opl_webui_password', username: 'opl' },
    { name: 'session-secret', kind: 'workspace_session_secret', target: '/run/secrets/webui_session_secret' },
  ], 'WebUI cloud declared credentials');
  for (const [field, expected] of Object.entries({
    serve_injection: 'declared_credential_files_only_no_OPL_non_secret_environment',
    mode_selection: 'explicit_applicationRevisionTemplate_entrypoint_preserving_OCI_CMD',
    image_command_policy: 'append_exact_OCI_CMD_to_declared_entrypoint_no_Host_or_package_install_command_replacement',
    session_secret_min_bytes: 32,
    missing_or_invalid_secret_policy: 'refuse_before_listen',
    anonymous_auth_user_status: 401,
  })) {
    if (cloud[field] !== expected) throw new Error(`WebUI cloud ${field} must be ${expected}`);
  }
}

export function validateRuntimeBridgeDefaultReadSurfacePolicy(runtimeBridge) {
  const defaultReadSurfacePolicy = runtimeBridge.default_read_surface_policy;
  for (const [field, expected] of Object.entries({
    default_projection: 'opl_current_owner_delta',
    source_path: 'app_state.operator.default_read_surface_policy',
    foundry_agent_os_cockpit_policy: 'first_screen_current_owner_delta_only_raw_worklist_evidence_provider_trace_drilldown_only',
    default_next_action_source: 'current_owner_delta',
    raw_worklist_generates_default_next_action: false,
    release_evidence_counts_as_release_ready: false,
    stage_run_cockpit_projection_ref: 'contracts/app-runtime-bridge.json#stage_run_cockpit_projection',
    full_detail_policy: 'explicit_full_detail_or_lazy_diagnostic_only',
    raw_refs_policy: 'raw_refs_require_explicit_full_detail',
    full_detail_auto_poll: false,
    shell_must_not_use_full_drilldown_as_normal_state: true,
    shell_must_not_derive_layout_from_raw_runtime_projection: true,
  })) {
    if (defaultReadSurfacePolicy?.[field] !== expected) {
      throw new Error(`Runtime bridge default_read_surface_policy.${field} must be ${expected}`);
    }
  }
  if (defaultReadSurfacePolicy && 'compatibility_projection' in defaultReadSurfacePolicy) {
    throw new Error('Runtime bridge default_read_surface_policy must not declare compatibility_projection');
  }
  for (const field of [
    'next_safe_action_or_none',
    'current_owner',
    'required_delta',
    'accepted_return_shapes',
    'readiness_false_flags',
    'count_summary',
  ]) {
    if (!defaultReadSurfacePolicy?.first_screen_answers?.includes(field)) {
      throw new Error(`Runtime bridge default_read_surface_policy.first_screen_answers must include ${field}`);
    }
  }
  for (const field of [
    'runtime_tray_snapshot',
    'raw_evidence_envelope',
    'stage_replay_packet_body',
    'private_residue_inventory_body',
    'provider_internal_ledger_body',
  ]) {
    if (!defaultReadSurfacePolicy?.forbidden_default_state_fields?.includes(field)) {
      throw new Error(`Runtime bridge default_read_surface_policy.forbidden_default_state_fields must include ${field}`);
    }
  }
}

export function validateRuntimeBridgeUserTaskStatus(runtimeBridge) {
  validateUserTaskStatusProjectionContract(
    runtimeBridge.user_task_status_projection,
    'Runtime bridge user task status projection',
    runtimeBridge.stage_run_cockpit_projection,
  );
  if (runtimeBridge.user_task_status_projection?.app_role !== 'display_only_user_task_status_consumer') {
    throw new Error('Runtime bridge user task status projection must be a display-only consumer');
  }
}
export function validateNativeMinimumProductBridge(runtimeBridge) {
  const launch = runtimeBridge.native_minimum_product_bridge?.agent_conversation_launch;
  if (launch?.catalog_source !== 'app_state.agent_packages.directory.entries') {
    throw new Error('Native Agent launch catalog must read the raw Framework directory before applying App membership');
  }
  assertDeepEqualJson(
    launch?.opl_standard_agent_membership_policy,
    appOwnedOplStandardAgentMembershipPolicy,
    'Native standard Agent membership policy',
  );
}

export function validateRuntimeSurfaceOwnerMatrix(runtimeBridge) {
  const matrix = runtimeBridge.runtime_surface_owner_matrix;
  for (const [field, expected] of Object.entries({
    purpose: 'keep_runtime_resource_task_data_lifecycle_refs_single_sourced',
    app_policy_owner: 'one-person-lab-app',
    family_projection_owner: 'one-person-lab',
    active_shell_role: 'thin_renderer_consumer',
    distribution_mirror_role: 'release_transport_only',
  })) {
    if (matrix?.[field] !== expected) {
      throw new Error(`Runtime surface owner matrix ${field} must be ${expected}`);
    }
  }
  const rows = matrix?.surface_rows;
  if (!Array.isArray(rows) || rows.length !== 5) {
    throw new Error('Runtime surface owner matrix must declare five surface rows');
  }
  const rowBySurface = new Map(rows.map((row) => [row?.surface, row]));
  for (const [surface, owner] of Object.entries({
    'OPL Runtime Fabric': 'one-person-lab-app',
    'Environment Materializer': 'one-person-lab',
    'TaskRunProjection v2': 'one-person-lab',
    'OPL Fabric resource refs': 'one-person-lab',
    'Local data lifecycle': 'one-person-lab-app',
  })) {
    const row = rowBySurface.get(surface);
    if (row?.source_owner !== owner) {
      throw new Error(`Runtime surface owner matrix ${surface} source_owner must be ${owner}`);
    }
    if (typeof row?.producer_owner !== 'string' || !row.producer_owner) {
      throw new Error(`Runtime surface owner matrix ${surface} must declare producer_owner`);
    }
    if (!Array.isArray(row?.forbidden_second_truth) || row.forbidden_second_truth.length === 0) {
      throw new Error(`Runtime surface owner matrix ${surface} must declare forbidden_second_truth`);
    }
  }
  if (!matrix?.homebrew_policy?.includes('must not decide runtime, task, resource, data lifecycle')) {
    throw new Error('Runtime surface owner matrix must keep Homebrew as release transport only');
  }
  for (const forbidden of [
    'second_resource_state_machine',
    'shell_owned_task_queue',
    'app_owned_domain_receipts',
    'homebrew_currentness_gate',
    'health_platform_runtime_authority',
  ]) {
    if (!matrix?.must_not_add_layers?.includes(forbidden)) {
      throw new Error(`Runtime surface owner matrix must forbid ${forbidden}`);
    }
  }
}

export function validateRuntimeBridgeAuthorityBoundary(runtimeBridge) {
  for (const [field, expected] of Object.entries({
    shell_adapter_can_own_runtime_truth: false,
    app_can_own_runtime_truth: false,
    app_can_write_domain_truth: false,
    app_can_read_artifact_body: false,
    app_can_read_memory_body: false,
    app_can_authorize_quality_verdict: false,
    app_can_authorize_export_verdict: false,
    app_can_write_sqlite_sidecar: false,
    app_can_mutate_state_index_kernel: false,
    app_can_write_owner_receipt: false,
    app_can_authorize_readiness: false,
    app_can_authorize_artifact_authority: false,
    provider_completion_is_domain_ready: false,
  })) {
    if (runtimeBridge.authority_boundary?.[field] !== expected) {
      throw new Error(`Runtime bridge authority_boundary.${field} must be ${expected}`);
    }
  }
}

export function validateRuntimeBridgeReplacementPolicy(runtimeBridge) {
  for (const [field, expected] of Object.entries({
    runtime_protocol_stable_across_shell_replacement: true,
    shell_adapter_must_call_declared_opl_cli_surfaces: true,
    new_shell_adapter_must_pass_active_shell_validation: true,
    direct_domain_repo_reads_are_forbidden: true,
    direct_runtime_state_file_reads_are_forbidden: true,
    direct_sqlite_sidecar_reads_are_forbidden: true,
    direct_state_index_kernel_writes_are_forbidden: true,
  })) {
    if (runtimeBridge.replacement_policy?.[field] !== expected) {
      throw new Error(`Runtime bridge replacement_policy.${field} must be ${expected}`);
    }
  }
}

export function validateRuntimeBridgeForbiddenTruthSources(runtimeBridge) {
  for (const forbidden of [
    'direct_domain_repo_reads',
    'direct_runtime_state_file_reads',
    'direct_opl_internal_state_file_reads',
    'direct_opl_sqlite_sidecar_reads',
    'direct_state_index_kernel_file_reads',
    'direct_state_index_kernel_writes',
    'domain_artifact_body_reads',
    'domain_memory_body_reads',
    'shell_private_runtime_status',
    'shell_local_storage_work_item_visibility',
  ]) {
    if (!runtimeBridge.forbidden_truth_sources?.includes(forbidden)) {
      throw new Error(`Runtime bridge must forbid ${forbidden}`);
    }
  }
}
