import { assertDeepEqualJson } from '../assertions.ts';
import { lookupPath } from '../value-helpers.ts';

const gatewayAccountProjectionPath =
  'app_state.settings_control_center.app_settings_read_model.opl_gateway_account';
const gatewayAccountConnectionModes = ['none', 'manual_key', 'account'];
const gatewayAccountStatusValues = [
  'not_connected',
  'setup_required',
  'connected',
  'reauth_required',
  'attention_needed',
  'disconnect_pending',
];
const gatewayAccountTopLevelFields = [
  'surface_kind',
  'connection_mode',
  'status',
  'account_card_visible',
  'account',
  'usage',
  'managed_key',
  'installation',
  'available_groups',
  'freshness',
  'capabilities',
  'actions',
];
const gatewayAccountNestedFields = {
  account: ['display_name', 'email', 'status', 'balance'],
  'account.balance': ['amount', 'currency'],
  usage: ['today_tokens', 'total_tokens', 'today_actual_cost', 'total_actual_cost', 'currency', 'day_timezone'],
  managed_key: ['name', 'status', 'ownership'],
  installation: ['device_label', 'short_id'],
  'available_groups[]': ['group_id', 'label'],
  freshness: ['observed_at', 'stale_after', 'stale', 'last_error_code'],
  capabilities: ['account_login_supported', 'manual_key_supported'],
  actions: ['complete_setup', 'refresh', 'repair', 'use_for_model_access', 'disconnect'],
};
const gatewayAccountForbiddenFields = [
  'password',
  'access_token',
  'refresh_token',
  'api_key',
  'key_material',
  'key_id',
  'remote_key_id',
  'credential_path',
  'raw_response',
  'raw_error',
];
const gatewayAccountErrorCodes = [
  'invalid_credentials',
  'account_disabled',
  'mfa_or_challenge_required',
  'session_not_persistable',
  'group_selection_required',
  'auth_expired',
  'network_unreachable',
  'rate_limited',
  'managed_key_missing',
  'managed_key_conflict',
  'managed_key_identity_drift',
  'disconnect_pending',
  'account_switch_requires_disconnect',
  'gateway_busy',
  'gateway_codex_binding_failed',
  'gateway_configuration_invalid',
  'gateway_request_rejected',
  'gateway_response_invalid',
  'gateway_store_invalid',
  'credentials_stdin_too_large',
  'invalid_request',
  'internal_contract_violation',
  'codex_configuration_failed',
  'gateway_account_failed',
  'manual_override_preserved',
];
const gatewayAccountErrorCodeMappingPolicy = {
  producer_owner: 'one-person-lab',
  producer_vocabulary_source:
    'one-person-lab reason_code values emitted by src/adapters/integration/opl-gateway-account*.ts and the connect gateway login credentials-stdin guard',
  requirement: 'every_producer_reason_code_maps_to_one_declared_error_codes_entry',
  unmapped_fallback: 'gateway_account_failed',
  unmapped_fallback_is_user_actionable: false,
  user_facing_message_required: true,
  raw_error_code_rendering_allowed: false,
};
const gatewayAccountActionIds = [
  'gateway_account_complete_setup',
  'gateway_account_refresh',
  'gateway_account_repair',
  'gateway_account_use_for_model_access',
  'gateway_account_disconnect',
];
const gatewayAccountDisplayPolicy = {
  identity: 'show_full_account_email_because_it_is_not_secret_material',
  account_status: 'localized_user_facing_label_with_active_rendered_as_激活_in_zh_CN',
  token_counts: 'compact_decimal_units_K_M_B_T_with_up_to_two_fraction_digits',
  day_timezone: 'not_user_visible',
  observed_at: 'format_with_local_device_locale_and_timezone',
  refresh_action: 'icon_only_immediately_after_observed_at_with_tooltip_and_accessible_name',
  normal_actions: ['refresh', 'disconnect'],
  exception_actions: ['sign_in_again'],
  forbidden_normal_controls: ['group_selector', 'complete_setup', 'repair', 'use_for_model_access'],
};
const gatewayAccountGroupResolutionPolicy = {
  default_group_match: 'single_case_insensitive_label_containing_Codex_then_single_available_group_fallback',
  ordinary_user_selector: 'not_rendered',
  managed_key_setup_action:
    'auto_execute_complete_setup_once_when_action_exposed_managed_key_missing_and_default_group_resolves_without_rendering_control',
  unresolved_state: 'show_localized_error_without_arbitrary_group_selection',
  retry_policy: 'retry_after_manual_refresh_or_new_authoritative_projection',
};

function collectObjectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, keys);
    return keys;
  }
  if (!value || typeof value !== 'object') return keys;
  for (const [key, nested] of Object.entries(value)) {
    keys.add(key);
    collectObjectKeys(nested, keys);
  }
  return keys;
}
export function validateGatewayAccountFixture(fixture) {
  const projection = lookupPath(fixture, gatewayAccountProjectionPath);
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) {
    throw new Error(`OPL App state golden fixture must include ${gatewayAccountProjectionPath}`);
  }
  assertDeepEqualJson(Object.keys(projection), gatewayAccountTopLevelFields, 'Gateway account fixture top-level fields');
  if (
    projection.surface_kind !== 'opl_gateway_account_read_model.v1'
    || !gatewayAccountConnectionModes.includes(projection.connection_mode)
    || !gatewayAccountStatusValues.includes(projection.status)
  ) {
    throw new Error('Gateway account fixture must use the canonical v1 surface, connection mode, and status');
  }
  if (projection.account_card_visible !== (projection.connection_mode === 'account')) {
    throw new Error('Gateway account fixture account card visibility must follow account connection mode');
  }
  for (const [field, expectedFields] of Object.entries(gatewayAccountNestedFields)) {
    const value = field === 'available_groups[]'
      ? projection.available_groups
      : field === 'account.balance'
        ? projection.account?.balance
        : projection[field];
    if (field === 'available_groups[]') {
      if (!Array.isArray(value)) throw new Error('Gateway account fixture available_groups must be an array');
      for (const group of value) {
        assertDeepEqualJson(Object.keys(group), expectedFields, 'Gateway account fixture available group fields');
      }
      continue;
    }
    assertDeepEqualJson(Object.keys(value ?? {}), expectedFields, `Gateway account fixture ${field} fields`);
  }
  const observedKeys = collectObjectKeys(projection);
  for (const forbidden of gatewayAccountForbiddenFields) {
    if (observedKeys.has(forbidden)) {
      throw new Error(`Gateway account fixture must not expose secret or remote identity field ${forbidden}`);
    }
  }
  const actionValues = Object.values(projection.actions).filter(Boolean);
  if (!actionValues.every((action) => gatewayAccountActionIds.includes(action))) {
    throw new Error('Gateway account fixture actions must use canonical non-secret App action ids');
  }
}


export function validateOplGatewayAccountContract(runtimeBridge) {
  const projection = runtimeBridge.opl_gateway_account_projection;
  if (
    projection?.surface_kind !== 'opl_gateway_account_read_model.v1'
    || projection.source_path !== 'app_state.settings_control_center.app_settings_read_model.opl_gateway_account'
    || projection.producer_owner !== 'one-person-lab'
    || projection.consumer_owner !== 'one-person-lab-app'
    || projection.shell_role !== 'display_and_declared_action_consumer_only'
  ) {
    throw new Error('Runtime bridge must declare the canonical OPL Gateway account projection ownership and path');
  }
  assertDeepEqualJson(projection.connection_modes, gatewayAccountConnectionModes, 'Gateway account connection modes');
  assertDeepEqualJson(projection.status_values, gatewayAccountStatusValues, 'Gateway account status values');
  assertDeepEqualJson(projection.top_level_field_allowlist, gatewayAccountTopLevelFields, 'Gateway account top-level fields');
  assertDeepEqualJson(projection.nested_field_allowlist, gatewayAccountNestedFields, 'Gateway account nested fields');
  assertDeepEqualJson(projection.forbidden_fields, gatewayAccountForbiddenFields, 'Gateway account forbidden fields');
  assertDeepEqualJson(projection.error_codes, gatewayAccountErrorCodes, 'Gateway account error codes');
  assertDeepEqualJson(
    projection.error_code_mapping_policy,
    gatewayAccountErrorCodeMappingPolicy,
    'Gateway account error code mapping policy',
  );
  assertDeepEqualJson(projection.app_action_ids, gatewayAccountActionIds, 'Gateway account App action ids');
  assertDeepEqualJson(projection.display_policy, gatewayAccountDisplayPolicy, 'Gateway account display policy');
  assertDeepEqualJson(
    projection.group_resolution_policy,
    gatewayAccountGroupResolutionPolicy,
    'Gateway account group resolution policy',
  );
  if (
    projection.account_card_visibility !== 'account_card_visible_true_only'
    || projection.refresh_policy?.ttl_seconds !== 900
    || projection.refresh_policy?.page_entry !== 'show_cached_then_refresh_once_when_stale'
    || projection.refresh_policy?.manual_refresh !== 'bypass_ttl'
    || projection.refresh_policy?.network_failure !== 'preserve_cached_values_and_mark_stale'
    || projection.renderer_bootstrap_cache?.role !== 'derived_last_known_good_projection_not_truth'
    || projection.renderer_bootstrap_cache?.storage_scope !==
      'dedicated_gateway_projection_cache_independent_of_full_app_state_cache'
    || projection.renderer_bootstrap_cache?.field_policy !== 'persist_projection_top_level_and_nested_allowlists_only'
    || projection.renderer_bootstrap_cache?.initial_render !== 'show_cached_account_before_gateway_account_refresh_action'
    || projection.renderer_bootstrap_cache?.legacy_cache_without_projection !==
      'keep_account_state_resolving_until_authoritative_readback'
    || projection.renderer_bootstrap_cache?.refresh_failure !== 'retain_cached_account_and_surface_stale_or_error'
    || projection.renderer_bootstrap_cache?.invalidation !==
      'replace_only_after_authoritative_gateway_action_or_readback_confirms_new_projection'
    || projection.generic_action_secret_policy !==
      'password_tokens_and_api_key_material_forbidden_in_action_payload_log_state_error_and_receipt'
  ) {
    throw new Error('Gateway account projection must preserve visibility, 15-minute freshness, stale, and secret boundaries');
  }

  const secretBridge = runtimeBridge.opl_gateway_account_secret_bridge;
  if (
    secretBridge?.bridge_id !== 'loginGatewayAccount'
    || secretBridge.desktop_only !== false
    || secretBridge.webui_password_login_allowed !== true
    || secretBridge.webui_route !== '/api/opl-runtime/gateway-account-login'
    || secretBridge.command !== 'opl connect gateway login --credentials-stdin --json'
    || secretBridge.transport !==
      'runtime_provider_via_desktop_typed_ipc_or_existing_webui_http_proxy_to_dedicated_stdin_no_generic_app_action_payload'
    || secretBridge.secret_persistence !== false
    || secretBridge.secret_diagnostics !== false
    || secretBridge.secret_receipt_fields !== false
  ) {
    throw new Error('Gateway account login must use the runtime provider and dedicated stdin-only secret bridge');
  }
  assertDeepEqualJson(secretBridge.request_fields, ['email', 'password', 'deviceLabel'], 'Gateway login request fields');
  assertDeepEqualJson(secretBridge.optional_request_fields, ['deviceLabel'], 'Gateway login optional request fields');
  assertDeepEqualJson(secretBridge.response_fields, ['ok', 'errorCode', 'stateRefreshRequired'], 'Gateway login response fields');
  assertDeepEqualJson(secretBridge.secret_fields, ['password'], 'Gateway login secret fields');
}
