import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  validateRemoteCompanionContract,
  validateRemoteCompanionGuiProjection,
  validateMobileCompanionTopology,
  validateRemoteCompanionPageState,
  validateRemoteCompanionInternetContract,
} from '../../scripts/validate-active-shell/remote-companion-validator.ts';

const read = (name: string) => JSON.parse(fs.readFileSync(`contracts/${name}.json`, 'utf8')) as Record<string, any>;
const policy = () => read('app-remote-companion');
type Contract = Record<string, any>;

function rejects(mutations: Array<[string, (value: Contract) => void]>) {
  for (const [name, mutate] of mutations) {
    const value = policy();
    mutate(value);
    assert.throws(() => validateRemoteCompanionContract(value), undefined, name);
  }
}

test('native Link uses the existing Studio authority and agrees with the current wire', () => {
  const value = policy();
  assert.doesNotThrow(() => validateRemoteCompanionContract(value));
  assert.equal(value.desktop_connector_boundary.canonical_executor, 'existing_opl_codex_native_instance');
  assert.equal(value.transport.independent_cloud_service_required, true);
  assert.equal(value.transport.offline_command_queue, false);
  assert.equal(value.pairing.desktop_credential_store, 'hashed_device_tokens_and_metadata_only');
});

test('managed internet preserves account isolation, pinned pairing and bounded business authority', () => {
  const internet = read('app-remote-companion-internet');
  assert.doesNotThrow(() => validateRemoteCompanionInternetContract(internet));
  for (const mutate of [
    (p: Contract) => { p.external_network_app_or_configuration_required = true; },
    (p: Contract) => { p.account_isolation.account_scope_is_authorization = true; },
    (p: Contract) => { p.account_isolation.strategy = 'shared_unscoped_gateway'; },
    (p: Contract) => { p.transport.general_loopback_proxy_allowed = true; },
    (p: Contract) => { p.transport.capabilities.push('terminal'); },
    (p: Contract) => { p.transport.preferred_transports = ['relay', 'p2p', 'lan']; },
    (p: Contract) => { p.transport.turn_provider = 'unapproved_paid_provider'; },
    (p: Contract) => { p.transport.turn_advertised_only_when_configured = false; },
    (p: Contract) => { p.service_api.ice_configuration.query = ['connectionId']; },
    (p: Contract) => { p.service_api.ice_configuration.authentication = 'account_scope_header_only'; },
    (p: Contract) => { p.pairing.relay_enrollment_is_not_conversation_authorization = false; },
    (p: Contract) => { p.pairing.transport_identity_keychain_scope = 'account_only'; },
    (p: Contract) => { p.files.aggregate_entire_file_as_one_rpc_or_base64_json = true; },
    (p: Contract) => { p.files.managed_upload_chunk_bytes = 524288; },
    (p: Contract) => { p.files.managed_upload_encoded_request_max_bytes = 1048576; },
    (p: Contract) => { p.recovery.automatic_replay_of_turn_approval_or_interrupt = true; },
  ]) {
    const value = structuredClone(internet); mutate(value);
    assert.throws(() => validateRemoteCompanionInternetContract(value));
  }
});

test('the native companion cannot acquire a second runtime, history or Framework task authority', () => {
  rejects([
    ['phone runtime', p => { p.product_identity.local_ios_runtime = true; }],
    ['phone history', p => { p.product_identity.local_ios_conversation_history_authority = true; }],
    ['phone credentials', p => { p.product_identity.local_ios_provider_or_model_authority = true; }],
    ['second app-server', p => { p.desktop_connector_boundary.new_codex_process_allowed = true; }],
    ['DSH session owner', p => { p.desktop_connector_boundary.dsh_session_or_agent_loop_allowed = true; }],
    ['wrong thread owner', p => { p.ownership.conversation_history_turns_approvals_models_permissions = 'phone_history'; }],
    ['wrong device issuer', p => { p.ownership.desktop_access_and_device_authorization = 'third_party_relay'; }],
    ['missing workflow boundary', p => { p.surface_boundary.forbidden_authorities = p.surface_boundary.forbidden_authorities.filter((x: string) => x !== 'task_owner_deadline_or_workflow_control_plane'); }],
  ]);
});

test('companion access requires trusted HTTPS, scoped credentials and bounded workspace access', () => {
  rejects([
    ['untrusted TLS', p => { p.security.system_trusted_https_required = false; }],
    ['plain LAN HTTP', p => { p.transport.debug_loopback_http = 'allow_http_on_any_local_network'; }],
    ['general App bearer', p => { p.security.companion_bearer_cannot_call_general_app_api = false; }],
    ['arbitrary invocation', p => { p.security.no_arbitrary_method_dispatch = false; }],
    ['cross-origin credential redirect', p => { p.security.no_cross_origin_redirects = false; }],
    ['workspace escape', p => { p.security.workspace_realpath_and_symlink_bounds = false; }],
    ['device plaintext token storage', p => { p.pairing.desktop_credential_store = 'plaintext_tokens'; }],
    ['phone model key', p => { p.transport.model_credentials_on_phone = true; }],
    ['phone permission escalation', p => { p.security.no_remote_approval_policy_escalation = false; }],
  ]);
});

test('pairing cannot reuse a code, outlive the wire or leave revoked streams authorized', () => {
  rejects([
    ['reused pair code', p => { p.pairing.single_use = false; }],
    ['unbounded pair code', p => { p.pairing.ttl_seconds = 3600; }],
    ['credential lifetime drift', p => { p.pairing.device_credential_ttl_days = 365; }],
    ['revocation excludes streams', p => { p.pairing.revoke = 'deny_new_calls_only'; }],
    ['silent origin replacement', p => { p.pairing.endpoint_change = 'follow_redirect_and_save_new_origin'; }],
  ]);
});

test('unknown sends and reconnects cannot become an offline command replay path', () => {
  rejects([
    ['offline queue', p => { p.transport.offline_command_queue = true; }],
    ['automatic resend', p => { p.transport.unknown_mutation_result = 'retry_until_accepted'; }],
    ['replay security bypass', p => { p.security.no_automatic_unknown_mutation_replay = false; }],
    ['phone-owned thread identity', p => { p.surface_boundary.conversation_model.canonical_identity = 'phone_generated_id'; }],
  ]);
});

test('source-only implementation cannot claim installation, iPhone qualification or public readiness', () => {
  const p = policy();
  p.implementation_status.installed_desktop_updated = false;
  p.implementation_status.real_iphone_qualified = false;
  p.implementation_status.release_ready = true;
  assert.throws(() => validateRemoteCompanionContract(p), /qualification/);
  p.implementation_status.release_ready = false;
  p.implementation_status.public_beta_or_app_store_published = true;
  assert.throws(() => validateRemoteCompanionContract(p), /source-only/);
  rejects([
    ['suspended push guarantee', p => { p.notifications.guaranteed_delivery_when_suspended = true; }],
    ['Apple publication authorization', p => { p.delivery_governance.execution_policy.public_apple_distribution_authorized = true; }],
  ]);
});

test('GUI, product topology and native page states stay aligned with the companion owner', () => {
  const gui = read('app-gui-product-contract').remote_companion;
  const mobile = read('app-product-profile').delivery_topology.mobile;
  const page = read('app-page-state-matrix').remote_companion;
  assert.doesNotThrow(() => validateRemoteCompanionGuiProjection(gui));
  assert.doesNotThrow(() => validateMobileCompanionTopology(mobile));
  assert.doesNotThrow(() => validateRemoteCompanionPageState(page));
  assert.throws(() => validateRemoteCompanionGuiProjection({ ...gui, pairing_capacity_policy: { active_pair_limit: 20 } }), /retired cloud/);
  assert.throws(() => validateRemoteCompanionGuiProjection({ ...gui, release_ready: !gui.release_ready }), /release evidence/);
  assert.throws(() => validateMobileCompanionTopology({ ...mobile, desktop_host_owner: 'opl-link-cloud' }), /desktop_host_owner/);
  const missingRecovery = structuredClone(page);
  missingRecovery.states = missingRecovery.states.filter((x: string) => x !== 'attention');
  assert.throws(() => validateRemoteCompanionPageState(missingRecovery), /supported values/);
});
