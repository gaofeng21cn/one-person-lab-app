import { readFileSync } from 'node:fs';

const policyRef = 'contracts/app-remote-companion.json';
const wireRef = 'contracts/app-remote-companion-wire.json';
const protocol = 'opl_link_studio_wire.v2';
const transportMode = 'authenticated_https_json_and_server_sent_events';
export const remoteCompanionStates = ['unavailable', 'unpaired', 'qr_ready', 'active', 'revoking', 'attention'];
export const remoteCompanionMethods = [
  'listThreads', 'readThread', 'startTurn', 'steerTurn', 'interruptTurn',
  'listPendingServerRequests', 'respondToServerRequest', 'readCodexModels',
  'listThreadWorkspace', 'readThreadWorkspaceFile', 'readThreadWorkspaceGit',
  'renameThread', 'setArchived',
];

const readContract = (name: string) => JSON.parse(readFileSync(new URL(`../../contracts/${name}`, import.meta.url), 'utf8'));
const requireValue = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const object = (value: any) => value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

function fields(value: any, expected: Record<string, unknown>, label: string): void {
  requireValue(object(value), `${label} must be an object`);
  for (const [key, required] of Object.entries(expected)) {
    requireValue(value[key] === required, `${label}.${key} must be ${String(required)}`);
  }
}

function closedSet(actual: unknown, expected: readonly string[], label: string): void {
  requireValue(Array.isArray(actual) && actual.length === expected.length
    && new Set(actual).size === actual.length && expected.every((key) => actual.includes(key)),
  `${label} must contain only the supported values`);
}

function requiredSet(actual: unknown, required: readonly string[], label: string): void {
  requireValue(Array.isArray(actual) && actual.every(nonempty) && required.every((key) => actual.includes(key)), `${label} is missing required boundaries`);
}

export function validateRemoteCompanionWireContract(wire: Record<string, any>, policy?: Record<string, any>): void {
  fields(wire, { schema: protocol, owner: 'one-person-lab-app', transport: transportMode, base_path: '/api/link',
    origin_policy: 'https_with_system_trust; explicit_debug_loopback_http_only' }, 'OPL Link wire');
  fields(wire.implementation_owners, { client: 'opl-link', host: 'opl-studio' }, 'OPL Link wire owners');
  requireValue(Number.isSafeInteger(wire.pairing_ttl_seconds) && wire.pairing_ttl_seconds > 0 && wire.pairing_ttl_seconds <= 120,
    'OPL Link pairing code lifetime must be bounded to 120 seconds');
  requireValue(Number.isSafeInteger(wire.credential_ttl_days) && wire.credential_ttl_days > 0 && wire.credential_ttl_days <= 30,
    'OPL Link device credentials must expire within 30 days');
  requireValue(wire.pairing_url === 'opllink://pair?endpoint=<percent_encoded_https_base>&code=<single_use_secret>',
    'OPL Link pairing URL must bind the HTTPS endpoint and single-use code');

  const hostAuth = { 'POST /pair': 'desktop_session_and_csrf', 'POST /claim': 'single_use_pair_code',
    'GET /devices': 'desktop_session', 'DELETE /devices/:id': 'desktop_session_and_csrf' };
  const clientAuth = { 'GET /bootstrap': 'device_bearer', 'POST /invoke': 'device_bearer', 'GET /events': 'device_bearer',
    'POST /download': 'device_bearer', 'POST /disconnect': 'device_bearer' };
  for (const [routes, auth, label] of [[wire.host_routes, hostAuth, 'host'], [wire.client_routes, clientAuth, 'client']] as const) {
    requireValue(object(routes), `OPL Link ${label} routes must be an object`);
    closedSet(Object.keys(routes), Object.keys(auth), `OPL Link ${label} routes`);
    for (const [route, role] of Object.entries(auth)) fields(routes[route], { auth: role }, `OPL Link ${route}`);
  }
  fields(wire.host_routes['POST /pair'].input, { endpoint: 'https_base_url' }, 'OPL Link pairing input');
  closedSet(wire.host_routes['POST /pair'].output, ['schema', 'endpoint', 'code', 'expiresAt', 'pairingURL'], 'OPL Link pairing response');
  closedSet(wire.host_routes['POST /claim'].input, ['code', 'deviceName'], 'OPL Link claim input');
  closedSet(wire.host_routes['POST /claim'].output, ['schema', 'token', 'expiresAt', 'device', 'host'], 'OPL Link claim response');
  fields(wire.host_routes['GET /devices'].output, { devices: 'paired_device_metadata_without_tokens' }, 'OPL Link device listing');
  fields(wire.host_routes['DELETE /devices/:id'], { effect: 'revoke_device_and_close_its_streams' }, 'OPL Link device revoke');
  closedSet(wire.client_routes['GET /bootstrap'].output, ['schema', 'host', 'device', 'capabilities'], 'OPL Link bootstrap response');
  closedSet(wire.client_routes['POST /invoke'].input, ['method', 'payload', 'requestId'], 'OPL Link invocation input');
  fields(wire.client_routes['POST /invoke'].output, { result: 'canonical_owner_response' }, 'OPL Link invocation response');
  closedSet(wire.client_routes['POST /download'].input, ['threadId', 'relativePath'], 'OPL Link download input');
  requireValue(object(wire.methods), 'OPL Link methods must be an object');
  closedSet(Object.keys(wire.methods), remoteCompanionMethods, 'OPL Link method allowlist');
  requireValue(Object.values(wire.methods).every(nonempty), 'OPL Link methods must declare their owner response');
  fields(wire, {
    event_policy: 'reconnect_then_reread_canonical_snapshots; never_replay_mutations',
    mutation_policy: 'requestId_deduplication_and_conflict_rejection; unknown_outcome_requires_canonical_readback',
  }, 'OPL Link recovery');
  requiredSet(wire.security, ['bearer_scoped_to_companion_routes', 'hash_device_credentials_at_rest',
    'single_use_expiring_pair_codes', 'reject_cross_origin_redirects', 'revoke_closes_live_streams',
    'workspace_realpath_and_symlink_bounds', 'no_offline_command_queue', 'no_model_credentials_on_phone'], 'OPL Link wire security');
  if (policy) {
    requireValue(policy.transport?.protocol === wire.schema && policy.transport?.mode === wire.transport
      && policy.transport?.public_api_prefix === wire.base_path, 'OPL Link product and wire transport must agree');
    requireValue(policy.pairing?.ttl_seconds === wire.pairing_ttl_seconds
      && policy.pairing?.device_credential_ttl_days === wire.credential_ttl_days, 'OPL Link product and wire credential lifetimes must agree');
  }
}

export function validateRemoteCompanionContract(policy: Record<string, any>, wire = readContract('app-remote-companion-wire.json')): void {
  fields(policy, { schema: 'opl_app_remote_companion.v5', owner: 'one-person-lab-app' }, 'OPL Link product');
  requireValue(['active_implementation', 'source_validated', 'qualified'].includes(policy.state), 'OPL Link state must describe the active companion implementation');
  fields(policy.product_identity, { app_store_name: 'OPL Link', home_screen_name: 'OPL Link', client_kind: 'native_ios_ipados_client',
    product_role: 'native_ios_companion_for_opl_app', primary_user_object: 'canonical_codex_conversation',
    local_ios_runtime: false, local_ios_conversation_history_authority: false,
    local_ios_provider_or_model_authority: false, local_ios_agent_package_authority: false }, 'OPL Link identity');
  fields(policy.ownership, { product_contract: 'one-person-lab-app', ios_client: 'opl-link',
    desktop_access_and_device_authorization: 'opl-studio', conversation_history_turns_approvals_models_permissions: 'existing_opl_codex_native_and_codex_app_server',
    workspace_files: 'canonical_thread_workspace_owner', framework_packages_and_domain_tasks: 'existing_framework_and_domain_owners' }, 'OPL Link authority');
  fields(policy.desktop_connector_boundary, { implementation_owner: 'opl-studio', implementation: 'existing_dsh_application_host_http_routes',
    canonical_executor: 'existing_opl_codex_native_instance', new_codex_process_allowed: false, dsh_session_or_agent_loop_allowed: false,
    separate_framework_connector_package_required: false, settings_surface: 'settings_resources_opl_link_native_host_panel',
    generic_remote_companion_access_contribution_is_link_runtime: false }, 'OPL Link desktop boundary');
  fields(policy.transport, { protocol, mode: transportMode, wire_contract_ref: wireRef, endpoint_owner: 'selected_opl_studio_host',
    network_prerequisite: 'phone_reachable_https_opl_studio_endpoint_with_system_trusted_certificate',
    authentication: 'revocable_companion_scoped_device_bearer', public_api_prefix: '/api/link', model_credentials_on_phone: false,
    offline_command_queue: false, independent_cloud_service_required: false, third_party_relay_required: false,
    unknown_mutation_result: 'reread_canonical_state_without_automatic_retry',
    application_layer_relay_e2ee_claim_allowed: false,
    debug_loopback_http: 'explicit_debug_only_and_loopback_origin_and_peer; never_plain_lan_http' }, 'OPL Link transport');
  fields(policy.pairing, { initiator: 'authenticated_desktop_user', single_use: true,
    account_or_invitation_service_required: false, ios_credential_store: 'keychain_when_unlocked_this_device_only',
    desktop_credential_store: 'hashed_device_tokens_and_metadata_only',
    revoke: 'deny_future_calls_and_close_existing_device_event_streams',
    endpoint_change: 'explicit_new_pairing_no_silent_origin_change' }, 'OPL Link pairing');
  for (const key of ['system_trusted_https_required', 'companion_bearer_cannot_call_general_app_api', 'single_use_pairing', 'device_revocation',
    'no_cross_origin_redirects', 'no_arbitrary_method_dispatch', 'no_unbounded_file_access', 'workspace_realpath_and_symlink_bounds',
    'no_plaintext_token_storage', 'no_offline_command_queue', 'no_automatic_unknown_mutation_replay', 'no_remote_approval_policy_escalation']) {
    requireValue(policy.security?.[key] === true, `OPL Link security.${key} must be enforced`);
  }
  fields(policy.surface_boundary?.conversation_model, { primary_object: 'canonical_codex_conversation', canonical_identity: 'canonical_thread_id',
    project_grouping: 'readonly_canonical_workspace_projection', pinning_and_drafts: 'device_local_metadata_only' }, 'OPL Link conversation model');
  requiredSet(policy.surface_boundary?.forbidden_authorities, ['second_runtime', 'second_history_store', 'task_owner_deadline_or_workflow_control_plane',
    'provider_credentials_editor', 'package_lifecycle_manager', 'arbitrary_shell_execution_endpoint'], 'OPL Link excluded authorities');
  fields(policy.notifications, { guaranteed_delivery_when_suspended: false, notifications_must_not_include_sensitive_content: true }, 'OPL Link notification limits');
  fields(policy.delivery_governance?.execution_policy, { status: 'active_user_restarted', source_ssot: 'remote_canonical_main',
    legacy_source_compatibility_required: false, public_apple_distribution_authorized: false }, 'OPL Link delivery scope');
  const status = policy.implementation_status;
  requireValue(object(status) && ['installed_desktop_updated', 'real_iphone_qualified', 'public_beta_or_app_store_published', 'release_ready']
    .every((key) => typeof status[key] === 'boolean'), 'OPL Link implementation evidence must distinguish source, installation, device and publication');
  requireValue(!status.release_ready || (status.installed_desktop_updated && status.real_iphone_qualified),
    'OPL Link release readiness requires installed desktop and real-iPhone qualification');
  requireValue(!status.public_beta_or_app_store_published || status.real_iphone_qualified,
    'OPL Link public distribution cannot be claimed from source-only evidence');
  fields(policy.source_refs, { wire_contract: wireRef, ios_repository: 'https://github.com/gaofeng21cn/opl-link',
    desktop_repository: 'https://github.com/gaofeng21cn/opl-studio', product_document: 'docs/product/opl-link.md' }, 'OPL Link source references');
  validateRemoteCompanionWireContract(wire, policy);
}

export function validateRemoteCompanionGuiProjection(projection: Record<string, any>): void {
  fields(projection, { policy_ref: policyRef, surface_id: 'remote_companion', app_store_name: 'OPL Link', home_screen_name: 'OPL Link',
    implementation_owner: 'opl-link', product_role: 'native_ios_companion_for_opl_app', primary_user_object: 'canonical_codex_conversation',
    default_ios_surface: 'conversation_directory', desktop_workbench_remains_canonical: true, transport_target: 'authenticated_studio_https_json_sse',
    wire_contract_ref: wireRef, desktop_host_owner: 'opl-studio', pairing_surface: 'settings_resources_opl_link_native_host_panel',
    pairing_access_gate: 'desktop_session_and_single_use_expiring_code' }, 'App GUI OPL Link projection');
  closedSet(projection.access_status_values, remoteCompanionStates, 'App GUI OPL Link states');
  requiredSet(projection.forbidden_ios_controls, ['provider_credentials_editor', 'package_lifecycle_editor', 'arbitrary_shell_or_file_command', 'offline_command_queue'],
    'App GUI OPL Link excluded controls');
  const policy = readContract('app-remote-companion.json');
  requireValue(projection.release_ready === policy.implementation_status.release_ready, 'App GUI OPL Link release evidence must match its owner');
  for (const field of ['release_cohort_lock_ref', 'pairing_capacity_policy', 'transport_selection_status', 'current_connector_implementation']) {
    requireValue(!Object.hasOwn(projection, field), `App GUI OPL Link must not restore retired cloud transport field ${field}`);
  }
}

export function validateMobileCompanionTopology(mobile: Record<string, any>): void {
  fields(mobile, { initial_surface: 'native_ios_remote_companion', app_store_name: 'OPL Link', home_screen_name: 'OPL Link',
    implementation_owner: 'opl-link', source_repository: 'https://github.com/gaofeng21cn/opl-link', companion_policy_ref: policyRef,
    wire_contract_ref: wireRef, product_role: 'native_ios_companion_for_opl_app', primary_user_object: 'canonical_codex_conversation',
    desktop_host_owner: 'opl-studio', transport_target: 'authenticated_studio_https_json_sse', desktop_workbench_remains_canonical: true,
    pairing_surface: 'settings_resources_opl_link_native_host_panel' }, 'Product profile mobile topology');
  requireValue(mobile.release_ready === readContract('app-remote-companion.json').implementation_status.release_ready,
    'Mobile topology release evidence must match its companion owner');
}

export function validateRemoteCompanionPageState(companion: Record<string, any>): void {
  fields(companion, { policy_ref: policyRef, surface_id: 'remote_companion', page_entry: 'settings_resources', ios_surface: 'native_ios_companion' },
    'Page-state OPL Link projection');
  closedSet(companion.states, remoteCompanionStates, 'Page-state OPL Link states');
  requireValue(object(companion.state_rules), 'OPL Link state rules are required');
  closedSet(Object.keys(companion.state_rules), remoteCompanionStates, 'OPL Link state rule keys');
  requireValue(Object.values(companion.state_rules).every(nonempty), 'OPL Link state rules must describe their presentation');
  requiredSet(companion.forbidden_in_page_state, ['provider_history_as_conversation_truth', 'cloud_queued_command',
    'phone_local_runtime_ready_claim', 'shell_inferred_canonical_thread_binding'], 'OPL Link page-state boundaries');
}
