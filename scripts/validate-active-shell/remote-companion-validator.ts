import { readFileSync } from 'node:fs';

const policyRef = 'contracts/app-remote-companion.json';
const extensionsRef = 'contracts/app-remote-companion-extensions.json';
const wireRef = 'contracts/app-remote-companion-wire.json';
const protocol = 'opl_link_studio_wire.v2';
const transportMode = 'authenticated_https_json_sse_or_dsh_noise_adaptive_loopback';
const internetRef = 'contracts/app-remote-companion-internet.json';
export const remoteCompanionStates = ['unavailable', 'unpaired', 'qr_ready', 'active', 'revoking', 'attention'];
export const remoteCompanionMethods = [
  'listThreads', 'readThread', 'startTurn', 'steerTurn', 'interruptTurn',
  'listPendingServerRequests', 'respondToServerRequest', 'readCodexModels',
  'listThreadWorkspace', 'readThreadWorkspaceFile', 'readThreadWorkspaceGit',
  'renameThread', 'setArchived',
];

const extensionModules = ['calendar', 'reminders', 'location', 'photos', 'music', 'health', 'alarms'];

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
    origin_policy: 'system_trusted_https_or_wss_and_pinned_noise_IK; explicit_debug_loopback_http_only', internet_contract_ref: internetRef }, 'OPL Link wire');
  fields(wire.implementation_owners, { client: 'opl-link', host: 'opl-studio' }, 'OPL Link wire owners');
  requireValue(Number.isSafeInteger(wire.pairing_ttl_seconds) && wire.pairing_ttl_seconds > 0 && wire.pairing_ttl_seconds <= 120,
    'OPL Link pairing code lifetime must be bounded to 120 seconds');
  requireValue(Number.isSafeInteger(wire.credential_ttl_days) && wire.credential_ttl_days > 0 && wire.credential_ttl_days <= 30,
    'OPL Link device credentials must expire within 30 days');
  requireValue(wire.pairing_url === 'opllink://pair?serverUrl=<origin>&accountScope=<scope>&hostDeviceId=<id>&hostIdentityKey=<key>&enrollmentToken=<token>&code=<single_use_secret>&expiresAt=<expiry>',
    'OPL Link pairing URL must bind the scoped Relay, pinned Host key and single-use code');

  const hostAuth = { 'POST /pair': 'desktop_session_and_csrf', 'POST /claim': 'single_use_pair_code',
    'GET /devices': 'desktop_session', 'DELETE /devices/:id': 'desktop_session_and_csrf' };
  const clientAuth = { 'GET /bootstrap': 'device_bearer', 'POST /invoke': 'device_bearer', 'GET /events': 'device_bearer',
    'POST /download': 'device_bearer', 'POST /disconnect': 'device_bearer',
    'POST /uploads': 'device_bearer', 'PUT /uploads/:id': 'device_bearer', 'GET /uploads/:id': 'device_bearer',
    'DELETE /uploads/:id': 'device_bearer', 'GET /download': 'device_bearer' };
  for (const [routes, auth, label] of [[wire.host_routes, hostAuth, 'host'], [wire.client_routes, clientAuth, 'client']] as const) {
    requireValue(object(routes), `OPL Link ${label} routes must be an object`);
    closedSet(Object.keys(routes), Object.keys(auth), `OPL Link ${label} routes`);
    for (const [route, role] of Object.entries(auth)) fields(routes[route], { auth: role }, `OPL Link ${route}`);
  }
  fields(wire.host_routes['POST /pair'].input, { endpoint: 'optional_https_base_url_for_explicit_advanced_direct_mode; absent_uses_managed_relay' }, 'OPL Link pairing input');
  closedSet(wire.host_routes['POST /pair'].output, ['schema', 'serverUrl', 'accountScope', 'hostDeviceId', 'hostIdentityKey', 'enrollmentToken', 'code', 'expiresAt', 'hostFingerprint', 'pairingURL'], 'OPL Link pairing response');
  closedSet(wire.host_routes['POST /claim'].input, ['code', 'deviceName'], 'OPL Link claim input');
  closedSet(wire.host_routes['POST /claim'].output, ['schema', 'token', 'expiresAt', 'device', 'host'], 'OPL Link claim response');
  fields(wire.host_routes['GET /devices'].output, { devices: 'paired_device_metadata_without_tokens' }, 'OPL Link device listing');
  fields(wire.host_routes['DELETE /devices/:id'], { effect: 'revoke_device_and_close_its_streams' }, 'OPL Link device revoke');
  closedSet(wire.client_routes['GET /bootstrap'].output, ['schema', 'host', 'device', 'capabilities'], 'OPL Link bootstrap response');
  closedSet(wire.client_routes['POST /invoke'].input, ['method', 'payload', 'requestId'], 'OPL Link invocation input');
  fields(wire.client_routes['POST /invoke'].output, { result: 'canonical_owner_response' }, 'OPL Link invocation response');
  closedSet(wire.client_routes['POST /download'].input, ['threadId', 'relativePath'], 'OPL Link download input');
  closedSet(wire.client_routes['GET /download'].query, ['threadId', 'relativePath', 'offset', 'length'], 'OPL Link ranged download');
  fields(wire.client_routes['GET /download'], { version_policy: 'If-Match_required_after_first_range; changed_version_returns_412' }, 'OPL Link file version');
  closedSet(wire.client_routes['PUT /uploads/:id'].input, ['offset', 'base64'], 'OPL Link upload chunk');
  fields(wire.limits, { upload_chunk_bytes: 524288, download_chunk_bytes: 524288,
    relay_loopback_body_bytes: 1048576, remote_message_bytes: 4194304, remote_fragment_bytes: 49152 }, 'OPL Link bounded relay payload');
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

export function validateRemoteCompanionInternetContract(internet: Record<string, any>): void {
  fields(internet, { schema: 'opl_link_internet.v1', owner: 'one-person-lab-app', service_owner: 'opl-link/service',
    deployment_owner: 'opl-instance-medopl', service_origin: 'https://link.medopl.com',
    external_network_app_or_configuration_required: false, phone_account_password_required: false }, 'OPL Link internet');
  fields(internet.transport, { source_revision: 'f214c5abb39434d0e8358956bfca8d4529981fee',
    encryption: 'Noise_IK_25519_ChaChaPoly_SHA256', business_protocol: protocol,
    virtual_target_origin: 'http://127.0.0.1:43177', general_loopback_proxy_allowed: false,
    second_codex_or_dsh_runtime_allowed: false, silent_identity_or_origin_replacement_allowed: false }, 'OPL Link relay');
  closedSet(internet.transport.capabilities, ['transport.lan', 'transport.p2p', 'transport.turn', 'transport.relay'], 'OPL Link transport capabilities');
  fields(internet.files, { managed_upload_chunk_bytes: 131072, managed_upload_encoded_request_max_bytes: 262144,
    managed_upload_json_policy: 'standard_JSON_without_unnecessary_slash_escaping' }, 'OPL Link managed upload budget');
  requireValue(JSON.stringify(internet.transport.preferred_transports) === JSON.stringify(['lan', 'p2p', 'turn', 'relay']),
    'OPL Link must try direct paths before the existing Relay fallback');
  fields(internet.transport, { turn_provider: 'instance_configured_standard_TURN_with_short_lived_credentials', turn_advertised_only_when_configured: true,
    selected_path_evidence: 'actual_selected_ICE_candidate_pair_or_confirmed_relay; no_raw_IP_or_SDP_in_logs',
    native_rtc: 'mature_WebRTC_DataChannel_runtime; no_custom_ICE_or_NAT_protocol' }, 'OPL Link direct-first boundary');
  fields(internet.service_api.ice_configuration, { method: 'GET', path: '/api/v1/turn/credentials',
    authentication: 'scoped_device_bearer_and_establishing_connection_participant_and_exact_host_client_grant',
    response: 'unmodified_upstream_ICE_configuration_schema',
    credential_policy: 'short_lived_server_issued_TURN_credentials; provider_secret_never_sent_to_clients' }, 'OPL Link ICE configuration');
  closedSet(internet.service_api.ice_configuration.query, ['connection_id'], 'OPL Link upstream ICE query');
  fields(internet.account_isolation, {
    strategy: 'one_unmodified_upstream_Gateway_and_Store_per_authenticated_account_scope',
    account_scope_is_authorization: false, websocket_hello_requires_scoped_device_token: true,
    rest_directory_requires_same_scope_and_opposite_role_and_host_grant: true, unauthenticated_scope_creation_allowed: false,
    relay_stores_gateway_password_or_model_key: false, relay_stores_conversation_or_plaintext_business_payload: false,
  }, 'OPL Link account isolation');
  fields(internet.pairing, { ttl_seconds: 120, relay_enrollment_is_not_conversation_authorization: true,
    local_claim_code_sent_only_inside_pinned_noise_channel: true,
    transport_identity_keychain_scope: 'server_origin|accountScope|hostDeviceId', host_public_key_pinned_from_desktop_qr: true }, 'OPL Link internet pairing');
  closedSet(internet.pairing.qr_transport_fields, ['serverUrl', 'accountScope', 'hostDeviceId', 'hostIdentityKey', 'enrollmentToken'], 'OPL Link QR transport');
  closedSet(internet.pairing.qr_business_fields, ['code', 'expiresAt'], 'OPL Link QR business claim');
  fields(internet.files, { upload_chunk_bytes: 524288, download_chunk_bytes: 524288,
    max_file_bytes: 10485760, max_attachments: 5, max_download_bytes: 268435456,
    aggregate_entire_file_as_one_rpc_or_base64_json: false }, 'OPL Link internet files');
  fields(internet.recovery, { automatic_transport_reconnect: true,
    preserve_unknown_business_operation_until_owner_readback: true,
    automatic_replay_of_turn_approval_or_interrupt: false, offline_mutation_queue: false }, 'OPL Link internet recovery');
}

export function validateRemoteCompanionContract(policy: Record<string, any>, wire = readContract('app-remote-companion-wire.json')): void {
  fields(policy, { schema: 'opl_app_remote_companion.v5', owner: 'one-person-lab-app',
    primary_mission: 'remote_operation_of_the_existing_opl_app_from_a_phone',
    product_priority: 'remote_companion_before_optional_phone_capabilities',
    extensions_contract_ref: extensionsRef,
    extension_policy: 'optional_explicit_request_scoped_capabilities_must_not_change_primary_companion_behavior' }, 'OPL Link product');
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
    network_prerequisite: 'app_and_link_outbound_access_to_preconfigured_opl_link_service',
    authentication: 'revocable_companion_scoped_device_bearer', public_api_prefix: '/api/link', model_credentials_on_phone: false,
    offline_command_queue: false, independent_cloud_service_required: true, third_party_relay_required: false,
    internet_contract_ref: internetRef, default_access: 'managed_opl_relay_without_external_user_configuration',
    unknown_mutation_result: 'reread_canonical_state_without_automatic_retry',
    application_layer_relay_e2ee_claim_allowed: true,
    debug_loopback_http: 'explicit_debug_only_and_loopback_origin_and_peer; never_plain_lan_http' }, 'OPL Link transport');
  fields(policy.pairing, { initiator: 'authenticated_desktop_user', single_use: true,
    account_or_invitation_service_required: true, relay_enrollment_is_not_business_authorization: true, ios_credential_store: 'keychain_when_unlocked_this_device_only',
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
    legacy_source_compatibility_required: false }, 'OPL Link delivery scope');
  requireValue(policy.delivery_governance?.execution_policy?.public_apple_distribution_authorized === true,
    'Apple distribution authorization must be explicit before TestFlight work');
  requireValue(policy.delivery_governance?.execution_policy?.apple_distribution_scope === 'TestFlight_beta_installation_and_updates; App_Store_release_remains_separate',
    'Apple distribution scope must keep App Store release separate');
  const status = policy.implementation_status;
  requireValue(object(status) && ['installed_desktop_updated', 'real_iphone_qualified', 'public_beta_or_app_store_published', 'release_ready',
    'managed_internet_service_deployed', 'public_internet_native_loop_qualified']
    .every((key) => typeof status[key] === 'boolean'), 'OPL Link implementation evidence must distinguish source, installation, device and publication');
  requireValue(!status.release_ready || (status.installed_desktop_updated && status.real_iphone_qualified),
    'OPL Link release readiness requires installed desktop and real-iPhone qualification');
  requireValue(!status.public_beta_or_app_store_published || status.real_iphone_qualified,
    'OPL Link public distribution cannot be claimed from source-only evidence');
  fields(policy.source_refs, { wire_contract: wireRef, ios_repository: 'https://github.com/gaofeng21cn/opl-link',
    desktop_repository: 'https://github.com/gaofeng21cn/opl-studio', product_document: 'docs/product/opl-link.md',
    extensions_contract: extensionsRef }, 'OPL Link source references');
  const extensions = readContract('app-remote-companion-extensions.json');
  validateRemoteCompanionExtensionsContract(extensions);
  requireValue(status.optional_phone_capabilities_status === extensions.state,
    'OPL Link extension implementation status must agree with its separate contract');
  validateRemoteCompanionWireContract(wire, policy);
  validateRemoteCompanionInternetContract(readContract('app-remote-companion-internet.json'));
  requireValue(!status.public_internet_native_loop_qualified || status.managed_internet_service_deployed,
    'Public native qualification requires the managed service deployment');
}

export function validateRemoteCompanionExtensionsContract(extensions: Record<string, any>): void {
  fields(extensions, { schema: 'opl_app_remote_companion_extensions.v1', owner: 'one-person-lab-app',
    state: 'contract_locked_not_enabled', purpose: 'optional_phone_capabilities_without_changing_remote_companion_behavior' },
    'OPL Link extension contract');
  fields(extensions.primary_mission, { product: 'OPL Link',
    role: 'native_phone_companion_for_remote_operation_of_the_existing_opl_app',
    desktop_is_authority: true, extension_is_not_a_second_runtime: true }, 'OPL Link primary mission');
  requiredSet(extensions.primary_mission.required_workflow, ['find_canonical_conversations', 'read_and_continue_existing_codex_turns',
    'respond_to_owner_pending_requests', 'inspect_workspace_results'], 'OPL Link primary workflow');
  requiredSet(extensions.extension_boundary.not_in_scope, ['arbitrary_ios_app_ui_automation', 'arbitrary_shell_or_desktop_command_execution',
    'phone_local_agent_runtime', 'phone_owned_conversation_history', 'phone_provider_credentials', 'background_monitoring_or_unsolicited_collection'],
    'OPL Link extension exclusions');
  fields(extensions.default_policy, { paired_device_enables_extensions: false, module_permission_default: false,
    ordinary_desktop_conversation_includes_extension_tools: false, ordinary_phone_remote_conversation_includes_extension_tools: false,
    explicit_request_opt_in_required: true, model_keyword_inference_is_authorization: false,
    source_authentication_is_authorization: false, permission_grant_is_current_request_authorization: false,
    selection_lifetime: 'current_request_only', next_request_default: 'disabled',
    thread_persistence: 'never_persist_tool_catalog_or_grant',
    prompt_injection: 'only_selected_tools_for_the_current_request_after_admission' }, 'OPL Link extension defaults');
  requiredSet(extensions.admission.required_intersection, ['explicit_current_request_selection', 'module_permission_grant',
    'declared_device_capability', 'live_device_lease', 'authenticated_request_origin_and_exact_phone_target', 'canonical_thread_owner_admission'],
    'OPL Link extension admission');
  fields(extensions.admission, {
    desktop_origin: 'explicit_exact_paired_phone_and_current_request_capability_selection',
    phone_origin: 'authenticated_current_request_source_and_explicit_capability_selection',
    stale_source_or_lease: 'deny_without_tool_schema_or_prompt_injection',
    offline_or_capability_failure: 'only_that_extension_fails;_remote_companion_remains_available',
    result_history: 'canonical_thread_may_record_explicit_result;_permissions_and_tool_catalog_never_inherit',
  }, 'OPL Link extension scope');
  closedSet(extensions.admission.identity, ['host_id', 'phone_id', 'canonical_thread_id', 'request_id', 'turn_id', 'lease_id'],
    'OPL Link extension identity');
  requiredSet(extensions.admission.invalidated_by, ['next_request', 'turn_end', 'background', 'disconnect', 'revocation', 'timeout', 'identity_or_lease_change'],
    'OPL Link extension invalidation');
  fields(extensions.implementation, { global_tool_registration_allowed: false, global_tools_list_change_allowed: false,
    runtime_strategy: 'not_installed_or_registered_until_codex_request_scoped_tool_admission_is_verified',
    current_codex_gap: 'codex_0.167.1_turn_start_and_steer_have_no_dynamic_tools_input;_current_dsh_MCP_has_no_trusted_request_origin' },
    'OPL Link extension implementation');
  requireValue(object(extensions.planned_modules), 'OPL Link planned modules must be declared');
  closedSet(Object.keys(extensions.planned_modules), extensionModules, 'OPL Link planned modules');
  for (const [name, module] of Object.entries(extensions.planned_modules) as [string, Record<string, any>][]) {
    requireValue(module.default_enabled === false, `OPL Link ${name} must be disabled by default`);
  }
  fields(extensions.future_feature_admission, { utility_alone_overrides_primary_behavior: false, new_runtime_or_cloud_service_required: false },
    'OPL Link future features');
  requiredSet(extensions.future_feature_admission.required_decisions, ['user_purpose', 'primary_workflow_impact', 'canonical_owner',
    'default_behavior', 'isolation_and_failure_behavior', 'acceptance_evidence'], 'OPL Link feature decisions');
  requiredSet(extensions.acceptance.must_prove_before_enablement, ['ordinary_desktop_tool_catalog_is_unchanged',
    'ordinary_phone_remote_tool_catalog_is_unchanged', 'explicit_current_request_receives_only_selected_and_granted_tools',
    'next_request_and_concurrent_other_threads_do_not_inherit_tools_or_grants',
    'permission_revocation_removes_admission_without_reconnecting', 'stale_or_mixed_source_is_rejected',
    'extension_timeout_or_denial_does_not_break_primary_remote_companion', 'physical_iphone_permission_and_foreground_limits_are_verified'],
    'OPL Link extension acceptance');
  fields(extensions.source_refs, { product_contract: policyRef, wire_contract: wireRef, link_product_doc: 'docs/product/opl-link.md' },
    'OPL Link extension sources');
}

export function validateRemoteCompanionGuiProjection(projection: Record<string, any>): void {
  fields(projection, { policy_ref: policyRef, surface_id: 'remote_companion', app_store_name: 'OPL Link', home_screen_name: 'OPL Link',
    implementation_owner: 'opl-link', product_role: 'native_ios_companion_for_opl_app', primary_user_object: 'canonical_codex_conversation',
    default_ios_surface: 'conversation_directory', desktop_workbench_remains_canonical: true, transport_target: 'managed_dsh_noise_adaptive_with_scoped_studio_http_sse',
    internet_contract_ref: internetRef, external_network_configuration_required: false,
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
    desktop_host_owner: 'opl-studio', transport_target: 'managed_dsh_noise_adaptive_with_scoped_studio_http_sse',
    internet_contract_ref: internetRef, external_network_configuration_required: false, desktop_workbench_remains_canonical: true,
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
