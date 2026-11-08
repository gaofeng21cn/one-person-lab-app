import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validatePageStateMatrix } from '../../scripts/validate-active-shell/page-state-matrix-validator.ts';
import {
  validateOplAppStateFastAgentPackageDirectoryFixture,
  validateOplGatewayAccountContract,
  validateConnectionAuthorizationApprovalBridge,
  validateRuntimeBridgeContract,
} from '../../scripts/validate-active-shell/runtime-bridge-validator.ts';

const readJson = (relativePath: string) => JSON.parse(fs.readFileSync(relativePath, 'utf8'));

test('Fast App state fixture exposes a generic Package directory envelope', () => {
  const fixture = readJson('contracts/fixtures/opl-app-state-fast.fixture.json');
  assert.doesNotThrow(() => validateOplAppStateFastAgentPackageDirectoryFixture(fixture));

  const directory = fixture.app_state.agent_packages.directory;
  assert.ok(directory.entries.length > 0);
  assert.equal(
    new Set(directory.entries.map((entry: any) => entry.package_id)).size,
    directory.entries.length,
  );
  for (const entry of directory.entries) {
    assert.equal(typeof entry.package_id, 'string');
    assert.equal(typeof entry.display_name, 'string');
    assert.equal(typeof entry.description, 'string');
    assert.equal(typeof entry.package_role, 'string');
    assert.equal(typeof entry.installed, 'boolean');
    assert.equal(typeof entry.readiness, 'object');
    assert.ok(Array.isArray(entry.available_actions));
  }

  const packageContract = readJson('contracts/app-runtime-bridge.json')
    .canonical_state_display_action_map.rows.find((row: any) => row.semantic_area === 'package');
  assert.deepEqual(packageContract.required_projection_fields['status_index.packages[package_id]'], [
    'presence',
    'dependent_guard',
    'capability_exposure',
    'runtime_source_readiness',
    'status_read_error',
  ]);
  assert.equal(packageContract.action_id_allowlist_allowed, false);
});

test('Fast Package directory rejects malformed generic envelopes', () => {
  const cases = [
    (fixture: any) => {
      delete fixture.app_state.agent_packages.directory.entries[0].package_id;
    },
    (fixture: any) => {
      delete fixture.app_state.agent_packages.directory.entries[0].display_name;
    },
    (fixture: any) => {
      fixture.app_state.agent_packages.directory.entries[0].available_actions = null;
    },
    (fixture: any) => {
      fixture.app_state.agent_packages.directory.entries[1].package_id =
        fixture.app_state.agent_packages.directory.entries[0].package_id;
    },
    (fixture: any) => {
      fixture.app_state.agent_packages.status_index = [];
    },
  ];

  for (const mutate of cases) {
    const fixture = structuredClone(readJson('contracts/fixtures/opl-app-state-fast.fixture.json'));
    mutate(fixture);
    assert.throws(() => validateOplAppStateFastAgentPackageDirectoryFixture(fixture));
  }
});

test('Gateway account contracts keep the canonical projection, actions, and runtime-provider secret bridge', () => {
  const runtimeBridge = readJson('contracts/app-runtime-bridge.json');
  const guiContract = readJson('contracts/app-gui-product-contract.json');
  const productProfile = readJson('contracts/app-product-profile.json');
  const pageState = readJson('contracts/app-page-state-matrix.json');
  const firstLaunchPage = pageState.pages.find((page: any) => page.id === 'first_launch_readiness');
  const expectedFirstRunSetup = {
    desktopDefaultMethod: 'gateway_account',
    desktopMethodOrder: ['gateway_account', 'api_key'],
    credentials: ['email', 'password'],
    deviceLabelPolicy: 'framework_default_not_rendered',
    secretBridgeRef: 'contracts/app-runtime-bridge.json#opl_gateway_account_secret_bridge',
    postLoginStateSource: 'opl app state --profile fast --json',
    uniqueGroupAction: 'gateway_account_complete_setup',
    postSetupStateRefresh: 'required_before_offering_model_access_confirmation',
    modelAccessAction: 'gateway_account_use_for_model_access',
    modelAccessActionPolicy: 'confirmation_required_after_fresh_state_read_never_implied_by_gateway_login',
    modelAccessConfirmation: {
      trigger: 'separate_explicit_user_action_after_login_and_fresh_state_read',
      label_zh: '设为模型访问方式',
      label_en: 'Use for model access',
      danger_level: 'medium',
      confirmation_required: true,
      gateway_login_counts_as_confirmation: false,
      action_visibility: 'only_when_action_is_exposed_by_fresh_projection',
      fresh_state_required_before_execute: true,
      fresh_state_required_after_execute: true,
    },
    sharedFastStateCachePolicy: 'publish_each_authoritative_post_login_read',
    unresolvedGroupError: 'group_selection_required',
    passwordClearPolicy: 'success_failure_or_method_switch',
    existingCodexRecheckRole: 'secondary_action_outside_method_switch',
    webuiDefaultMethod: 'gateway_account',
    webuiAllowedMethods: ['gateway_account', 'api_key'],
    webuiPasswordLogin: true,
    webuiGatewayLoginRoute: '/api/opl-runtime/gateway-account-login',
    webuiTransport: 'existing_opl_runtime_http_proxy_to_credentials_stdin',
  };
  for (const setup of [
    guiContract.first_launch_readiness_policy.beginner_presentation.model_access_setup,
    productProfile.first_run.beginner_presentation.model_access_setup,
    firstLaunchPage.beginner_view_model.model_access_setup,
  ]) {
    assert.deepEqual({
      desktopDefaultMethod: setup.desktop_default_method,
      desktopMethodOrder: setup.desktop_method_order,
      credentials: setup.gateway_account.credentials,
      deviceLabelPolicy: setup.gateway_account.device_label_policy,
      secretBridgeRef: setup.gateway_account.secret_bridge_ref,
      postLoginStateSource: setup.gateway_account.post_login_state_source,
      uniqueGroupAction: setup.gateway_account.unique_group_action,
      postSetupStateRefresh: setup.gateway_account.post_setup_state_refresh,
      modelAccessAction: setup.gateway_account.model_access_action,
      modelAccessActionPolicy: setup.gateway_account.model_access_action_policy,
      modelAccessConfirmation: setup.gateway_account.model_access_confirmation,
      sharedFastStateCachePolicy: setup.gateway_account.shared_fast_state_cache_policy,
      unresolvedGroupError: setup.gateway_account.unresolved_group_error,
      passwordClearPolicy: setup.gateway_account.password_clear_policy,
      existingCodexRecheckRole: setup.existing_codex_recheck.role,
      webuiDefaultMethod: setup.webui.default_method,
      webuiAllowedMethods: setup.webui.allowed_methods,
      webuiPasswordLogin: setup.webui.gateway_password_login,
      webuiGatewayLoginRoute: setup.webui.gateway_login_route,
      webuiTransport: setup.webui.transport,
    }, expectedFirstRunSetup);
  }
  assert.deepEqual(runtimeBridge.opl_gateway_account_projection.nested_field_allowlist.account, [
    'display_name',
    'email',
    'status',
    'balance',
  ]);
  assert.equal(
    runtimeBridge.opl_gateway_account_projection.display_policy.token_counts,
    'compact_decimal_units_K_M_B_T_with_up_to_two_fraction_digits',
  );
  assert.equal(runtimeBridge.opl_gateway_account_projection.group_resolution_policy.ordinary_user_selector, 'not_rendered');
  assert.equal(
    runtimeBridge.opl_gateway_account_projection.group_resolution_policy.managed_key_setup_action,
    'auto_execute_complete_setup_once_when_action_exposed_managed_key_missing_and_default_group_resolves_without_rendering_control',
  );
  assert.deepEqual(runtimeBridge.opl_gateway_account_projection.display_policy.exception_actions, ['sign_in_again']);
  assert.deepEqual(runtimeBridge.opl_gateway_account_projection.display_policy.forbidden_normal_controls, [
    'group_selector',
    'complete_setup',
    'repair',
    'use_for_model_access',
  ]);
  assert.deepEqual(runtimeBridge.opl_gateway_account_projection.renderer_bootstrap_cache, {
    role: 'derived_last_known_good_projection_not_truth',
    storage_scope: 'dedicated_gateway_projection_cache_independent_of_full_app_state_cache',
    field_policy: 'persist_projection_top_level_and_nested_allowlists_only',
    initial_render: 'show_cached_account_before_gateway_account_refresh_action',
    legacy_cache_without_projection: 'keep_account_state_resolving_until_authoritative_readback',
    refresh_failure: 'retain_cached_account_and_surface_stale_or_error',
    invalidation: 'replace_only_after_authoritative_gateway_action_or_readback_confirms_new_projection',
  });
  assert.doesNotThrow(() => validateOplGatewayAccountContract(runtimeBridge));
  assert.doesNotThrow(() => validateRuntimeBridgeContract(
    runtimeBridge,
    readJson('contracts/app-shell-adapter.json'),
  ));
  assert.doesNotThrow(() => validatePageStateMatrix(
    readJson('contracts/app-page-state-matrix.json'),
    readJson('contracts/app-shell-adapter.json'),
    readJson('contracts/app-gui-product-contract.json'),
  ));
});

test('Gateway account runtime bridge rejects secret leakage and generic-action login', () => {
  for (const mutate of [
    (bridge: any) => {
      bridge.opl_gateway_account_projection.top_level_field_allowlist.push('api_key');
    },
    (bridge: any) => {
      bridge.opl_gateway_account_projection.generic_action_secret_policy = 'password_allowed_in_action_payload';
    },
    (bridge: any) => {
      bridge.opl_gateway_account_secret_bridge.command =
        'opl app action execute --action gateway_account_login --payload <json> --json';
    },
    (bridge: any) => {
      bridge.opl_gateway_account_secret_bridge.webui_password_login_allowed = false;
    },
    (bridge: any) => {
      bridge.opl_gateway_account_projection.renderer_bootstrap_cache.field_policy = 'persist_entire_raw_payload';
    },
  ]) {
    const bridge = structuredClone(readJson('contracts/app-runtime-bridge.json'));
    mutate(bridge);
    assert.throws(() => validateOplGatewayAccountContract(bridge));
  }
});

test('Connection authorization approval stays on the dedicated trusted-user bridge', () => {
  const bridge = readJson('contracts/app-runtime-bridge.json');
  assert.doesNotThrow(() => validateConnectionAuthorizationApprovalBridge(bridge));

  for (const mutate of [
    (value: any) => { value.connection_access_approval_bridge.generic_app_action_allowed = true; },
    (value: any) => { value.connection_access_approval_bridge.model_callable_allowed = true; },
    (value: any) => { value.connection_access_approval_bridge.confirmation_boolean_authority = true; },
    (value: any) => { value.connection_access_approval_bridge.request_fields.push('connectionId'); },
    (value: any) => { value.connection_access_approval_bridge.command = 'opl app action execute --action connection_access_request_approve --json'; },
  ]) {
    const mutated = structuredClone(bridge);
    mutate(mutated);
    assert.throws(() => validateConnectionAuthorizationApprovalBridge(mutated), /Connection authorization approval bridge/);
  }
});

test('Account & Access rejects account visibility and state-path drift', () => {
  const adapter = readJson('contracts/app-shell-adapter.json');
  const guiContract = readJson('contracts/app-gui-product-contract.json');
  for (const mutate of [
    (gateway: any) => {
      gateway.account_card_visibility = 'always';
    },
    (gateway: any) => {
      gateway.projection_path = 'shell_state.gateway_account';
    },
    (gateway: any) => {
      gateway.cache_ttl_seconds = 0;
    },
  ]) {
    const matrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
    const gateway = matrix.pages.find((page: any) => page.id === 'gateway');
    mutate(gateway.opl_gateway_account);
    assert.throws(() => validatePageStateMatrix(matrix, adapter, guiContract));
  }
});
