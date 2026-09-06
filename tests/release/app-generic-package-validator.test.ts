import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { readAppProductProfile } from '../../scripts/app-product-profile/profile-contract.ts';
import { appOwnedOplStandardAgentMembershipPolicy } from '../../scripts/validate-active-shell/app-contract-constants.ts';
import { validatePackageAppContributionsProductContract } from '../../scripts/validate-active-shell/gui-framework-surfaces-validator.ts';
import { validateGuiProductHomeContract } from '../../scripts/validate-active-shell/gui-product-home-validator.ts';
import { validateProductProfile } from '../../scripts/validate-active-shell/product-profile-validator.ts';

const readJson = (relativePath: string) => JSON.parse(fs.readFileSync(relativePath, 'utf8'));

const unknownAgentFixture = readJson('contracts/fixtures/opl-app-state-unknown-agent.fixture.json');
const unknownAgentRuntimeFixture = readJson('contracts/fixtures/opl-app-state-runtime-v2-unknown-agent.fixture.json');
const syntheticDirectoryEntry = unknownAgentFixture.app_state.agent_packages.directory.entries[0];
const syntheticStatusProjection =
  unknownAgentFixture.app_state.agent_packages.status_index.packages[syntheticDirectoryEntry.package_id];
const syntheticHomeShortcutPreference =
  unknownAgentFixture.app_state.agent_packages.status_index.home_shortcut_preferences[0];

test('App-owned Agent, Skill, and generated session authorities stay absent and cannot be restored', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const guiContract = readJson('contracts/app-gui-product-contract.json');
  const productProfile = readJson('contracts/app-product-profile.json');
  const pageState = readJson('contracts/app-page-state-matrix.json');
  const homeViewModel = pageState.pages.find((page: any) => page.id === 'guid_home').home_view_model;

  assert.equal('sync_and_install_contract' in installExposure, false);
  assert.equal('transaction_internal_states' in installExposure.software_lifecycle, false);
  assert.equal(installExposure.capability_governance.lifecycle_authority, 'configured_carrier');
  assert.equal(installExposure.software_lifecycle.lifecycle_owners.opl_packages, 'configured_carrier');

  for (const field of [
    'default_assistants',
    'non_default_assistants',
    'home_purpose_entries',
    'professional_agent_packages',
    'professional_agent_packages_metadata_policy',
  ]) {
    assert.equal(field in guiContract, false, `GUI contract must not carry ${field}`);
  }
  assert.equal('retired_domain_agents' in guiContract, false);
  assert.equal('default_assistants' in productProfile.gui, false);
  assert.equal('non_default_assistants' in productProfile.gui, false);
  assert.equal('home_purpose_entries' in productProfile.gui.home, false);
  assert.equal('professional_agent_packages' in productProfile.gui, false);
  assert.equal('professional_agent_packages_metadata_policy' in productProfile.gui, false);
  for (const field of [
    'opl_app_session_context',
    'default_visible_skills',
    'skill_priority',
    'session_context_lines',
    'session_context_i18n',
  ]) {
    assert.equal(field in productProfile.codex, false, `Product profile must not carry codex.${field}`);
  }
  assert.equal('forbidden_skill_examples' in productProfile.gui.ordinary_capability_selector_policy, false);
  assert.equal(
    productProfile.gui.ordinary_capability_selector_policy.authority,
    'owner_or_carrier_skill_projection_and_mcp_negative_filter',
  );
  assert.deepEqual(productProfile.codex.new_conversation_additional_instructions, {
    content_owner: 'user',
    delivery: 'new_conversation_additional_instructions_only',
    storage_key: 'codex.oplAppSessionContextAdditional',
    storage_key_status: 'legacy_compatibility_storage_key',
    generated_base_context_allowed: false,
    agent_route_fallback_allowed: false,
    empty_value_policy: 'inject_nothing',
    reset_behavior: 'clear_additional_instructions',
    effect: 'next_new_conversation',
  });
  assert.doesNotThrow(() => readAppProductProfile());
  assert.equal('default_assistants' in homeViewModel, false);
  assert.equal('default_assistant_purpose_labels' in homeViewModel, false);
  assert.equal('home_purpose_entries' in homeViewModel, false);

  const restoredGui = structuredClone(guiContract);
  restoredGui.default_assistants = [{ id: 'fixed-package-id' }];
  assert.throws(
    () => validateGuiProductHomeContract(restoredGui),
    /must not restore fixed Agent\/Home presentation field default_assistants/,
  );

  const restoredProfile = structuredClone(productProfile);
  restoredProfile.gui.professional_agent_packages = [];
  assert.throws(
    () => validateProductProfile(restoredProfile, installExposure),
    /must not restore fixed Agent\/Home presentation field gui.professional_agent_packages/,
  );

  const restoredSkillAllowlist = structuredClone(productProfile);
  restoredSkillAllowlist.gui.ordinary_capability_selector_policy.forbidden_skill_examples = ['skill-creator'];
  assert.throws(
    () => validateProductProfile(restoredSkillAllowlist, installExposure),
    /owner\/carrier Skill projection/,
  );

  const restoredSessionContext = structuredClone(productProfile);
  restoredSessionContext.codex.opl_app_session_context = { owner: 'one-person-lab-app' };
  assert.throws(
    () => validateProductProfile(restoredSessionContext, installExposure),
    /must not restore legacy Codex authority codex.opl_app_session_context/,
  );
});

test('one unknown non-OPL Agent remains generic Settings/Runtime truth but cannot enter the OPL standard Agent palette', () => {
  const profile = readJson('contracts/app-product-profile.json');
  const guiContract = readJson('contracts/app-gui-product-contract.json');
  const palettePolicy = profile.gui.ordinary_capability_selector_policy;
  const shortcutPolicy = profile.gui.home.home_agent_shortcuts_metadata_policy;

  assert.equal(
    palettePolicy.palette_agent_catalog_source_ref,
    'app_state.agent_packages.directory.entries',
  );
  assert.deepEqual(
    palettePolicy.opl_standard_agent_membership_policy,
    appOwnedOplStandardAgentMembershipPolicy,
  );
  assert.equal(
    palettePolicy.palette_agent_status_source_ref,
    'app_state.agent_packages.status_index.packages[]',
  );
  assert.equal(
    palettePolicy.palette_unknown_standard_agent_policy,
    'include_unknown_package_ids_only_when_they_match_opl_standard_agent_membership',
  );
  assert.equal(
    guiContract.home_layout.unknown_standard_agent_policy,
    'render_unknown_package_ids_only_when_they_match_opl_standard_agent_membership_without_app_allowlist',
  );
  assert.equal(
    guiContract.home_layout.starter_visibility_policy,
    'opl_standard_agent_membership_with_selectable_readiness_real_codex_route_and_default_or_user_visible_shortcuts',
  );
  assert.equal(
    shortcutPolicy.shortcut_source_ref,
    'app_state.agent_packages.directory.entries[].home_shortcuts[]',
  );
  assert.equal(shortcutPolicy.package_id_allowlist_allowed, false);

  const appState = unknownAgentFixture.app_state;
  const runtimeAppState = unknownAgentRuntimeFixture.app_state;
  const standardAgents = appState.agent_packages.directory.entries.filter(
    (entry) => entry.package_role === 'standard_agent',
  );
  const status = appState.agent_packages.status_index.packages[syntheticDirectoryEntry.package_id];
  const preference = appState.agent_packages.status_index.home_shortcut_preferences.find(
    (entry) => entry.package_id === syntheticDirectoryEntry.package_id,
  );
  const oplStandardAgents = standardAgents.filter((entry) => {
    const oplOwned = entry.official === true || entry.publisher === 'one-person-lab';
    const currentStatus = appState.agent_packages.status_index.packages[entry.package_id];
    const selectable = entry.installed !== false
      && currentStatus?.presence?.present !== false
      && currentStatus?.presence?.callable !== false;
    const realCodexRoute = entry.home_shortcuts?.some((shortcut) => (
      shortcut.route?.route_kind === 'agent_package_shortcut'
      && shortcut.route?.executor === 'codex_cli'
      && typeof shortcut.route?.codex_visible_entry === 'string'
      && shortcut.route.codex_visible_entry.trim()
    ));
    return oplOwned && selectable && realCodexRoute;
  });

  assert.deepEqual(standardAgents.map((entry) => entry.package_id), ['future.agent-lab']);
  assert.deepEqual(oplStandardAgents, []);
  const sourceMarkerOnly = {
    ...standardAgents[0],
    publisher: 'third-party',
    source_explanation: {
      kind: 'first_party_framework_projection',
      source: 'first_party',
    },
  };
  assert.equal(
    sourceMarkerOnly.official === true || sourceMarkerOnly.publisher === 'one-person-lab',
    false,
    'Framework projection provenance alone must not grant OPL standard Agent membership',
  );
  assert.equal(standardAgents[0]?.installed, true);
  assert.equal(status?.presence.present, true);
  assert.equal(status?.presence.callable, true);
  assert.equal(status?.presence.reason, null);
  assert.equal(preference?.visible, true);
  assert.equal(preference?.sort_order, 7);
  assert.deepEqual(standardAgents[0]?.available_actions.map((action: any) => action.action_id), [
    'future_agent_inspect',
  ]);
  assert.deepEqual(Object.keys(appState.actions), ['future_agent_inspect']);
  assert.deepEqual(
    appState.operator.workbench.work_item_projection_v2.agent_catalog.map((agent: any) => agent.package_id),
    ['future.agent-lab'],
  );
  assert.deepEqual(
    runtimeAppState.operator.workbench.work_item_projection_v2.items.map((item: any) => item.identity.agent_id),
    ['future.agent-lab'],
  );
  assert.equal('professional_agent_packages' in profile.gui, false);
});

test('App-owned Agent presentation overlay restoration fails closed', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const invalidProfile = structuredClone(readJson('contracts/app-product-profile.json'));
  invalidProfile.gui.professional_agent_packages_metadata_policy = {};

  assert.throws(
    () => validateProductProfile(invalidProfile, installExposure),
    /must not restore fixed Agent\/Home presentation field gui.professional_agent_packages_metadata_policy/,
  );
});

test('any Package role may project one closed standard App contribution block', () => {
  const schema = readJson('contracts/opl-app-contributions.schema.json');
  const guiContract = readJson('contracts/app-gui-product-contract.json');
  const shellAdapter = readJson('contracts/app-shell-adapter.json');
  const contributionContract = guiContract.framework_surfaces.package_app_contributions;
  const viewTypes = [
    'list_detail',
    'timeline',
    'approval_diff',
    'task_board',
    'artifact_view',
    'activity_log',
    'service_status',
    'channel_access',
    'remote_companion_access',
  ];
  const shellWriteActionBridge = {
    action_id: 'package_contribution_execute',
    command: 'opl app action execute --action package_contribution_execute --payload <json> [--dry-run] --json',
    required_payload_fields: ['package_id', 'ref', 'input', 'confirmed'],
    availability_source: 'app_state action catalog exact package_contribution_execute entry',
    unavailable_policy: 'hide_or_disable_commands_and_preserve_read_only_contribution_views_until_the_current_action_catalog_exposes_the_exact_action',
  };
  const guiWriteActionBridge = {
    ...shellWriteActionBridge,
    delegation_policy: 'Framework_action_bridge_may_delegate_to_the_descriptor_neutral_contribution_execute_broker_after_fresh_descriptor_carrier_readiness_ref_and_confirmation_revalidation',
  };
  const shellBrokerResponseContract = {
    framework_source_ref: 'one-person-lab/src/modules/console/app-contribution-broker.ts#runAppContribution',
    cli_envelope_path: 'opl_app_contribution',
    cli_surface_kind: 'opl_app_package_contribution.v1',
    package_response_schema: 'opl-package-app-contribution-response.v1',
    required_envelope_fields: [
      'surface_kind',
      'package_id',
      'ref',
      'operation',
      'confirmation_required',
      'carrier_readback',
      'readiness',
      'response',
    ],
    required_response_fields: ['schema_version', 'ok', 'ref', 'operation', 'result'],
    allowed_operations: ['read', 'execute'],
    identity_validation: 'surface_kind_package_id_ref_operation_and_response_schema_ref_operation_must_match_the_current_request_and_descriptor',
    success_validation: 'response_ok_must_equal_true_before_render_or_action_success',
    renderer_selection_source: 'current_descriptor_view_type_never_broker_response',
    renderer_result_path: 'opl_app_contribution.response.result',
    canonical_action_response_path: 'app_action_execution.result.opl_app_contribution',
    canonical_action_surface_kind: 'opl_app_action_execution.v1',
    canonical_action_dry_run_response_path: 'app_action_execution.result.opl_app_contribution_preflight',
    canonical_action_dry_run_policy: 'revalidate_the_current_descriptor_carrier_readiness_ref_and_confirmation_without_invoking_the_package_command_or_accepting_an_action_success',
  };
  const guiBrokerResponseContract = {
    ...shellBrokerResponseContract,
    renderer_payload_policy: 'validate_result_against_the_App_owned_standard_renderer_selected_by_the_current_descriptor_view_type_before_rendering',
  };

  assert.doesNotThrow(() => validatePackageAppContributionsProductContract(contributionContract));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema_version.const, 'opl-app-contributions.v1');
  assert.deepEqual(
    schema.anyOf,
    ['navigation', 'views', 'commands', 'badges', 'ui'].map((collection) => ({
      required: [collection],
      properties: { [collection]: { minItems: 1 } },
    })),
  );
  for (const collection of ['navigation', 'views', 'commands', 'badges', 'ui']) {
    assert.equal(schema.properties[collection].maxItems, 100);
  }
  assert.equal(schema.$defs.view.properties.command_ids.maxItems, 100);
  assert.equal(schema.$defs.view.properties.badge_ids.maxItems, 100);
  assert.deepEqual(schema.$defs.view.properties.view_type.enum, viewTypes);
  assert.equal(schema.$defs.service_status_result.required, undefined);
  assert.equal(schema.$defs.service_status_result.additionalProperties, false);
  assert.equal(schema.$defs.service_status_result.properties.schema_version.const, 'opl-app-service-status.v1');
  assert.equal(schema.$defs.service_status_result.anyOf.length, 3);
  assert.equal(schema.$defs.service_status_summary_object.maxProperties, 64);
  assert.equal(schema.$defs.service_status_value.oneOf.length, 6);
  assert.deepEqual(schema.$defs.channel_access_action_input.oneOf, [
    { $ref: '#/$defs/channel_action_input' },
    { $ref: '#/$defs/channel_pairing_action_input' },
    { $ref: '#/$defs/channel_user_action_input' },
  ]);
  for (const entry of ['navigation', 'view', 'command', 'badge', 'ui_placement']) {
    assert.equal(schema.$defs[entry].additionalProperties, false);
    for (const forbiddenField of ['component', 'code', 'html', 'path', 'url']) {
      assert.equal(forbiddenField in schema.$defs[entry].properties, false);
    }
  }

  assert.equal(contributionContract.package_role_policy, 'role_agnostic_no_package_role_filter');
  assert.equal(
    contributionContract.action_execution_policy,
    'resolve_action_ref_through_the_descriptor_neutral_app_contribution_execute_broker',
  );
  assert.equal(
    contributionContract.action_execution_policy_scope,
    'framework_internal_delegation_only_not_a_shell_mutation_surface',
  );
  assert.equal(
    contributionContract.shell_action_execution_policy,
    'all_contribution_writes_enter_the_canonical_app_action_bridge_or_fail_closed',
  );
  assert.equal(
    contributionContract.invalid_block_policy,
    'reject_entire_package_app_contributions_block_and_preserve_other_packages',
  );
  assert.deepEqual(contributionContract.supported_view_types, viewTypes);
  assert.deepEqual(contributionContract.standard_view_contracts.channel_access, {
    result_schema_ref: 'contracts/opl-app-contributions.schema.json#/$defs/channel_access_result',
    placement: 'settings.section',
    trust_tier: 'declarative',
    owner: 'one-person-lab-app',
    data_truth_owner: 'installed_transport_provider_or_native_carrier',
    projection_owner: 'one-person-lab-framework',
    renderer_activation_policy: {
      aionui: {
        provider_owner: 'aioncore_builtin_weixin',
        settings_surface: 'aioncore_channel_settings',
        framework_channel_provider_host_activation_allowed: false,
        framework_projected_channel_access_rendering_allowed: false,
      },
      opl_studio: {
        provider_owner: 'installed_channel_provider_package',
        settings_surface: 'app_standard_channel_access',
        framework_channel_provider_host_activation_allowed: true,
        framework_projected_channel_access_rendering_allowed: true,
      },
      single_active_provider_path_per_renderer_required: true,
    },
    migration_state: 'renderer_specific_activation_selected_aionui_keeps_aioncore_and_successor_uses_app_owned_provider_package',
    runtime_status: 'aionui_builtin_source_path_present_successor_package_source_and_host_path_present_each_requires_its_own_installed_live_e2e',
    command_input_source: 'validated_channel_access_result_entity_actions',
    command_resolution: 'resolve_command_id_against_the_same_current_descriptor_then_dispatch_its_action_ref_with_the_exact_validated_entity_input',
    post_action_readback: 'fresh_contribution_read_required_after_action_success_and_while_refresh_after_ms_is_projected',
    qr_payload_policy: 'ephemeral_login_challenge_render_only_never_persist_log_or_copy_into_shell_state',
    provider_absent_policy: 'no_contribution_entry_is_a_normal_unavailable_state_for_the_successor_and_must_not_block_the_aionui_mainline',
    arbitrary_renderer_code_allowed: false,
  });
  assert.deepEqual(contributionContract.standard_view_contracts.remote_companion_access, {
    result_schema_ref: 'contracts/opl-app-contributions.schema.json#/$defs/remote_companion_access_result',
    placement: 'settings.section',
    trust_tier: 'declarative',
    owner: 'one-person-lab-app',
    data_truth_owner: 'opl-link_desktop_connector_and_opl_link_service',
    projection_owner: 'one-person-lab-framework',
    renderer_activation_policy: {
      aionui: {
        provider_owner: 'opl_link_desktop_connector',
        settings_surface: 'app_standard_remote_companion_access',
        framework_remote_companion_host_activation_allowed: true,
        framework_projected_remote_companion_access_rendering_allowed: true,
      },
      opl_studio: {
        provider_owner: 'opl_link_desktop_connector',
        settings_surface: 'app_standard_remote_companion_access',
        framework_remote_companion_host_activation_allowed: true,
        framework_projected_remote_companion_access_rendering_allowed: true,
      },
      single_active_provider_path_per_renderer_required: true,
    },
    migration_state: 'source_baseline_frozen_caller_cutover_and_live_qualification_pending',
    runtime_status: 'target_projection_contract_only_service_connector_ios_shell_network_apns_and_testflight_qualification_unverified',
    command_input_source: 'validated_remote_companion_access_action_inputs',
    command_resolution: 'resolve_fixed_action_id_against_the_same_current_descriptor_then_dispatch_only_the_declared_closed_input_shape',
    post_action_readback: 'fresh_remote_companion_access_read_required_after_action_success',
    secret_boundary: {
      transient_interaction_fields: ['invitation_code', 'manual_code', 'qr_payload', 'authentication_digits'],
      never_cached_logged_or_returned_by_app_action: ['invitation_code', 'manual_code', 'qr_payload', 'claim_secret', 'claim_material'],
      qr_payload_only_in_status: 'qr_ready',
      qr_payload_max_length: 8192,
    },
    provider_absent_policy: 'project_unavailable_without_fabricated_pair_or_device_state_and_keep_the_desktop_workbench_usable',
    arbitrary_renderer_code_allowed: false,
  });
  assert.deepEqual(contributionContract.standard_view_contracts.service_status, {
    result_schema_ref: 'contracts/opl-app-contributions.schema.json#/$defs/service_status_result',
    placement: 'settings.section',
    trust_tier: 'declarative',
    owner: 'one-person-lab-app',
    data_truth_owner: 'installed_native_carrier_or_provider',
    projection_owner: 'one-person-lab-framework',
    settings_destination: 'settings.services.installed_services',
    status_field_policy: 'status_and_bounded_summary_objects_are_provider_defined_without_an_App_or_Fleet_business_field_allowlist',
    command_input_source: 'descriptor_declared_action_inputs',
    command_resolution: 'resolve_command_id_against_the_same_current_descriptor_then_dispatch_its_action_ref_with_the_exact_validated_input',
    post_action_readback: 'fresh_contribution_read_required_after_action_success',
    provider_absent_policy: 'project_unavailable_without_fabricated_service_or_node_state_and_keep_the_desktop_workbench_usable',
    arbitrary_renderer_code_allowed: false,
  });
  assert.deepEqual(contributionContract.reference_integrity, {
    navigation_view_id: 'must_reference_local_views_view_id',
    view_command_ids: 'must_reference_local_commands_command_id',
    ui_view_id: 'must_reference_local_views_view_id',
    ui_command_ids: 'must_reference_local_commands_command_id',
  });
  assert.equal(contributionContract.arbitrary_plugin_ui_code_allowed, false);
  assert.equal(contributionContract.execute_broker_command_role, 'framework_internal_delegated_surface_only_never_shell_invoked');
  assert.equal(contributionContract.shell_direct_execute_broker_allowed, false);
  assert.deepEqual(contributionContract.shell_write_action_bridge, guiWriteActionBridge);
  assert.deepEqual(contributionContract.broker_response_contract, guiBrokerResponseContract);

  assert.ok(shellAdapter.gui_authority.product_contracts.includes('contracts/opl-app-contributions.schema.json'));
  assert.ok(shellAdapter.shell_contract.capabilities.includes('app_owned_package_contribution_contract'));
  assert.deepEqual(shellAdapter.state_surface_contract.package_app_contributions, {
    contract_ref: 'contracts/app-gui-product-contract.json#framework_surfaces.package_app_contributions',
    schema_ref: 'contracts/opl-app-contributions.schema.json',
    source_ref: 'app_state.agent_packages.directory.entries[].app_contributions',
    package_role_filter_allowed: false,
    navigation_identity: ['package_id', 'navigation_id'],
    read_command: 'opl app contribution read --package-id <package_id> --ref <data_ref> [--input <json>|--input-stdin]',
    execute_command: 'opl app contribution execute --package-id <package_id> --ref <action_ref> [--input <json>|--input-stdin] [--confirm]',
    execute_command_role: 'framework_internal_delegated_surface_only_never_shell_invoked',
    shell_direct_execute_command_allowed: false,
    shell_write_action_bridge: shellWriteActionBridge,
    broker_response_contract: shellBrokerResponseContract,
    route_resolution_policy: 'resolve_only_from_the_current_directory_entry_then_delegate_descriptor_and_ref_revalidation_to_the_broker',
    response_policy: 'render_only_a_valid_broker_response_for_the_requested_package_ref_and_operation',
    confirmation_policy: 'broker_and_descriptor_owned_shell_cannot_infer_or_bypass_confirmation',
    stale_or_malformed_policy: 'fail_closed_hide_the_contribution_without_a_local_fallback_or_fabricated_state',
    legacy_package_manager_state_allowed: false,
    invalid_block_policy: 'reject_entire_package_app_contributions_block_and_preserve_other_packages',
    arbitrary_plugin_ui_code_allowed: false,
  });
});

test('unknown descriptor-neutral Package contributions route through the broker without role or id branches', () => {
  const guiContract = readJson('contracts/app-gui-product-contract.json');
  const pageState = readJson('contracts/app-page-state-matrix.json');
  const contributionContract = guiContract.framework_surfaces.package_app_contributions;
  const contributionPage = pageState.pages.find((page: any) => page.id === 'package_contribution');

  const unknownCarrierEntry = {
    package_id: 'future.contribution.package',
    package_role: 'future_unknown_role',
    app_contributions: {
      schema_version: 'opl-app-contributions.v1',
      navigation: [{ navigation_id: 'future.activity', view_id: 'future.activity' }],
      views: [{ view_id: 'future.activity', data_ref: 'future.data.v1#current' }],
      commands: [{ command_id: 'future.refresh', action_ref: 'future.data.v1#refresh', confirmation_required: true }],
    },
  };

  assert.deepEqual(contributionContract.navigation_identity, ['package_id', 'navigation_id']);
  assert.equal(contributionContract.package_role_policy, 'role_agnostic_no_package_role_filter');
  assert.equal(contributionContract.navigation_source_ref, 'app_state.agent_packages.directory.entries[].app_contributions.navigation[]');
  assert.equal(
    contributionContract.route_resolution_policy,
    'resolve_navigation_view_and_command_refs_from_the_same_current_directory_entry_then_require_broker_descriptor_revalidation',
  );
  assert.equal(
    contributionContract.read_broker_command,
    'opl app contribution read --package-id <package_id> --ref <data_ref> [--input <json>|--input-stdin]',
  );
  assert.equal(
    contributionContract.execute_broker_command,
    'opl app contribution execute --package-id <package_id> --ref <action_ref> [--input <json>|--input-stdin] [--confirm]',
  );
  assert.equal(contributionContract.execute_broker_command_role, 'framework_internal_delegated_surface_only_never_shell_invoked');
  assert.equal(contributionContract.shell_direct_execute_broker_allowed, false);
  assert.equal(
    contributionContract.shell_write_action_bridge.command,
    'opl app action execute --action package_contribution_execute --payload <json> [--dry-run] --json',
  );
  assert.equal(
    contributionContract.broker_response_contract.package_response_schema,
    'opl-package-app-contribution-response.v1',
  );
  assert.equal(
    contributionContract.broker_response_contract.canonical_action_response_path,
    'app_action_execution.result.opl_app_contribution',
  );
  assert.equal(
    contributionContract.broker_response_contract.canonical_action_dry_run_response_path,
    'app_action_execution.result.opl_app_contribution_preflight',
  );
  assert.equal(contributionContract.broker_revalidation_policy.includes('current_installed_descriptor'), true);
  assert.equal(contributionContract.confirmation_policy.includes('never_inferred_or_bypassed_by_the_shell'), true);
  assert.equal(contributionContract.invalid_or_stale_projection_policy.startsWith('fail_closed'), true);
  assert.equal(contributionContract.legacy_package_manager_state_allowed, false);
  assert.deepEqual(contributionContract.forbidden_legacy_truth_sources, [
    'registry_cache',
    'package_lock',
    'lifecycle_receipt',
    'payload',
    'last_known_good',
    'rollback',
    'currentness_mirror',
  ]);

  assert.equal(unknownCarrierEntry.package_id, 'future.contribution.package');
  assert.equal(unknownCarrierEntry.package_role, 'future_unknown_role');
  assert.equal(unknownCarrierEntry.app_contributions.navigation[0].navigation_id, 'future.activity');
  assert.equal(unknownCarrierEntry.app_contributions.views[0].data_ref, 'future.data.v1#current');
  assert.equal(unknownCarrierEntry.app_contributions.commands[0].confirmation_required, true);

  assert.deepEqual(contributionPage.package_contribution_view_model.navigation_identity, ['package_id', 'navigation_id']);
  assert.equal(contributionPage.package_contribution_view_model.package_role_filter_allowed, false);
  assert.equal(contributionPage.package_contribution_view_model.broker_descriptor_revalidation_required, true);
  assert.equal(contributionPage.package_contribution_view_model.confirmation_authority, 'descriptor_and_broker_only');
  assert.equal(contributionPage.package_contribution_view_model.invalid_or_stale_policy, 'fail_closed_do_not_render_or_fabricate_state');
  assert.equal(contributionPage.package_contribution_view_model.legacy_manager_fallback_allowed, false);
  assert.equal(
    contributionPage.package_contribution_view_model.action_execute_command,
    'opl app action execute --action package_contribution_execute --payload <json> [--dry-run] --json',
  );
  assert.deepEqual(
    contributionPage.package_contribution_view_model.action_execute_payload_fields,
    ['package_id', 'ref', 'input', 'confirmed'],
  );
  assert.equal(
    contributionPage.package_contribution_view_model.action_execute_dry_run_policy,
    'consume_only_app_action_execution.result.opl_app_contribution_preflight_as_a_read_only_preflight_never_as_action_success',
  );
  assert.equal(contributionPage.package_contribution_view_model.direct_execute_broker_command_allowed, false);
  assert.equal(
    contributionPage.package_contribution_view_model.broker_response_contract_ref,
    'contracts/app-gui-product-contract.json#framework_surfaces.package_app_contributions.broker_response_contract',
  );
  assert.deepEqual(contributionPage.package_contribution_view_model.forbidden_ui_inputs, [
    'plugin_html',
    'plugin_javascript',
    'plugin_react_component',
    'plugin_electron_code',
    'plugin_path',
    'plugin_url',
  ]);
});

test('channel_access requires exact inputs, state-scoped QR challenges, and no stale unavailable state', () => {
  const schema = readJson('contracts/opl-app-contributions.schema.json');
  const ajv = new Ajv2020({ allErrors: true, strictSchema: true, strictTypes: false });
  ajv.addSchema(schema);
  const validate = ajv.getSchema(`${schema.$id}#/$defs/channel_access_result`);
  assert.ok(validate);

  const available = {
    schema_version: 'opl-app-channel-access.v1',
    status: 'available',
    channel_id: 'weixin',
    connection: {
      state: 'qr_ready',
      qr_challenge: { payload: 'temporary-qr-ticket', expires_at_ms: 1_800_000_000_000 },
    },
    actions: [
      { command_id: 'channel.disconnect', input: { channel_id: 'weixin' } },
    ],
    pending_pairings: [
      {
        pairing_id: 'PAIR-123',
        display_name: 'Pending user',
        requested_at_ms: 1_700_000_000_000,
        expires_at_ms: 1_800_000_000_000,
        actions: [
          {
            command_id: 'channel.pairing.approve',
            input: { channel_id: 'weixin', pairing_id: 'PAIR-123' },
          },
        ],
      },
    ],
    authorized_users: [
      {
        user_id: 'user/123',
        display_name: 'Authorized user',
        authorized_at_ms: 1_700_000_000_000,
        actions: [
          {
            command_id: 'channel.user.revoke',
            input: { channel_id: 'weixin', user_id: 'user/123' },
          },
        ],
      },
    ],
    refresh_after_ms: 1000,
  };
  assert.equal(validate(available), true, JSON.stringify(validate.errors));

  const connectedWithoutQr = structuredClone(available);
  connectedWithoutQr.connection.state = 'connected';
  delete (connectedWithoutQr.connection as any).qr_challenge;
  assert.equal(validate(connectedWithoutQr), true, JSON.stringify(validate.errors));

  const qrOnConnectedState = structuredClone(available);
  qrOnConnectedState.connection.state = 'connected';
  assert.equal(validate(qrOnConnectedState), false);

  const zeroExpiryQr = structuredClone(available);
  zeroExpiryQr.connection.qr_challenge.expires_at_ms = 0;
  assert.equal(validate(zeroExpiryQr), false);

  const qrReadyWithoutChallenge = structuredClone(available);
  delete (qrReadyWithoutChallenge.connection as any).qr_challenge;
  assert.equal(validate(qrReadyWithoutChallenge), true, JSON.stringify(validate.errors));

  const pairingWithoutEntityInput = structuredClone(available);
  pairingWithoutEntityInput.pending_pairings[0].actions[0].input = { channel_id: 'weixin' } as any;
  assert.equal(validate(pairingWithoutEntityInput), false);

  const unavailableWithStaleState = {
    schema_version: 'opl-app-channel-access.v1',
    status: 'unavailable',
    channel_id: 'weixin',
    unavailable_reason: 'producer_absent',
    pending_pairings: [],
  };
  assert.equal(validate(unavailableWithStaleState), false);
  assert.equal(validate({
    schema_version: 'opl-app-channel-access.v1',
    status: 'unavailable',
    channel_id: 'weixin',
    unavailable_reason: 'producer_absent',
  }), true, JSON.stringify(validate.errors));
});

test('remote_companion_access is closed, state-scoped, and keeps pairing secrets transient', () => {
  const schema = readJson('contracts/opl-app-contributions.schema.json');
  const ajv = new Ajv2020({ allErrors: true, strictSchema: true, strictTypes: false });
  ajv.addSchema(schema);
  const validate = ajv.getSchema(`${schema.$id}#/$defs/remote_companion_access_result`);
  assert.ok(validate);

  const pairing = {
    pairing_id: 'pair-001',
    expires_at: '2026-08-19T12:00:00Z',
  };
  const actions = [
    { command_id: 'pair.start', input: { invitation_code: 'invite-once', display_name: 'Desktop' } },
    { command_id: 'pair.refresh', input: { pairing_id: 'pair-001' } },
    { command_id: 'pair.confirm', input: { pairing_id: 'pair-001', authentication_digits: '123456' } },
    { command_id: 'pair.cancel', input: { pairing_id: 'pair-001' } },
    { command_id: 'device.rename', input: { device_id: 'ios-001', display_name: 'Phone' } },
    { command_id: 'pair.revoke', input: { pairing_id: 'pair-001' } },
  ];
  const qrReady = {
    schema_version: 'opl-app-remote-companion-access.v1',
    status: 'qr_ready',
    pairing: { ...pairing, manual_code: '0123456789AB', qr_payload: 'opllink://pair?payload=temporary' },
    actions,
    refresh_after_ms: 1000,
  };
  assert.equal(validate(qrReady), true, JSON.stringify(validate.errors));

  const awaitingConfirmation = {
    schema_version: 'opl-app-remote-companion-access.v1',
    status: 'awaiting_confirmation',
    pairing: { ...pairing, authentication_digits: '123456' },
    actions,
  };
  assert.equal(validate(awaitingConfirmation), true, JSON.stringify(validate.errors));

  const impossibleQrState = structuredClone(qrReady);
  impossibleQrState.pairing.authentication_digits = '123456';
  assert.equal(validate(impossibleQrState), false, JSON.stringify(validate.errors));

  const active = {
    schema_version: 'opl-app-remote-companion-access.v1',
    status: 'active',
    pairing: {
      pairing_id: pairing.pairing_id,
      expires_at: pairing.expires_at,
    },
    devices: [
      {
        device_id: 'desktop-001',
        device_type: 'desktop',
        display_name: 'Desktop',
        authorization_state: 'authorized',
        last_activity_at: '2026-08-19T11:59:00Z',
      },
      {
        device_id: 'ios-001',
        device_type: 'mobile',
        display_name: 'Phone',
        authorization_state: 'authorized',
        last_activity_at: null,
      },
    ],
    actions,
  };
  assert.equal(validate(active), true, JSON.stringify(validate.errors));

  assert.equal(validate({
    schema_version: 'opl-app-remote-companion-access.v1',
    status: 'reserving',
    actions: [],
  }), true, JSON.stringify(validate.errors));

  assert.equal(validate({
    schema_version: 'opl-app-remote-companion-access.v1',
    status: 'attention',
    pairing: { ...pairing },
    devices: active.devices,
    actions: [{ command_id: 'pair.refresh', input: { pairing_id: 'pair-001' } }],
  }), true, JSON.stringify(validate.errors));

  for (const mutate of [
    (candidate: any) => { candidate.status = 'claimed'; },
    (candidate: any) => { candidate.pairing.qr_payload = 'secret-in-normal-state'; },
    (candidate: any) => { candidate.pairing.manual_code = 'too-short'; },
    (candidate: any) => { candidate.actions[0].input.extra = 'arbitrary-form'; },
    (candidate: any) => { candidate.actions[0] = { command_id: 'pair.start', input: { invitation_code: 'x', display_name: 'D', pairing_id: 'unexpected' } }; },
    (candidate: any) => { candidate.devices[0].claim_secret = 'must-not-project'; },
  ]) {
    const invalid = structuredClone(active);
    mutate(invalid);
    assert.equal(validate(invalid), false, JSON.stringify(validate.errors));
  }

  assert.equal(validate({
    schema_version: 'opl-app-remote-companion-access.v1',
    status: 'unavailable',
    unavailable_reason: 'connector_unavailable',
    actions: [],
  }), true, JSON.stringify(validate.errors));
});

test('service_status accepts generic Fleet summaries and rejects unbounded or malformed results', () => {
  const schema = readJson('contracts/opl-app-contributions.schema.json');
  const ajv = new Ajv2020({ allErrors: true, strictSchema: true, strictTypes: false });
  ajv.addSchema(schema);
  const validate = ajv.getSchema(`${schema.$id}#/$defs/service_status_result`);
  assert.ok(validate);

  const result = {
    schema_version: 'opl-app-service-status.v1',
    status: 'ready',
    native_carrier: {
      availability: 'available',
      status: 'ready',
    },
    freshness: {
      state: 'fresh',
      last_observed_at: '2026-08-19T02:43:36.431Z',
    },
    node: {
      display_name: 'Local development Mac',
      platform: 'macOS',
    },
    payload: {
      collection_status: 'available',
      active_conversation_count: 7,
      checks: [
        { check_id: 'provider', state: 'pass' },
      ],
    },
  };
  assert.equal(validate(result), true, JSON.stringify(validate.errors));

  const providerResult = {
    schema: 'opl_fleet_agent_provider.v1',
    capability_abi: { id: 'opl-fleet-agent.capabilities', version: '1.0.0' },
    access: 'read_only',
    authority: 'observation_only',
    operation: 'telemetry.read',
    read_ref: 'fleet.agent.telemetry.v1#local',
    observed_at: '2026-08-19T02:43:36.431Z',
    freshness: {
      state: 'fresh',
      last_observed_at: '2026-08-19T02:43:36.431Z',
      last_known: false,
    },
    native_carrier: {
      kind: 'opl_fleet_agent_process',
      availability: 'available',
      status: 'ready',
    },
    node: {
      stable_node_id: 'fixture-node',
      display_name: 'Fixture Node',
      platform: 'macOS',
      agent_version: '0.2.41',
    },
    payload: {
      collection_status: 'available',
      active_conversation_count: 7,
      checks: [{ check_id: 'provider', state: 'pass' }],
    },
  };
  assert.equal(validate(providerResult), true, JSON.stringify(validate.errors));

  const unavailable = {
    availability: 'unavailable',
    reason_code: 'native_provider_not_installed',
    freshness: {
      state: 'unavailable',
      last_observed_at: null,
      last_known: false,
      reason_code: 'native_provider_not_installed',
    },
    node: null,
  };
  assert.equal(validate(unavailable), true, JSON.stringify(validate.errors));

  for (const mutate of [
    (candidate: any) => { candidate.schema_version = 'opl-app-service-status.v2'; },
    (candidate: any) => { candidate.node = []; },
    (candidate: any) => { candidate.payload = { checks: Array.from({ length: 101 }, () => ({ state: 'pass' })) }; },
    (candidate: any) => { candidate.payload = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`field_${index}`, true])); },
    (candidate: any) => {
      delete candidate.status;
      delete candidate.native_carrier;
    },
    (candidate: any) => { candidate.extra = true; },
  ]) {
    const invalid = structuredClone(result);
    mutate(invalid);
    assert.equal(validate(invalid), false, JSON.stringify(validate.errors));
  }
});

test('service_status enters Services while activity_log remains hidden from ordinary Settings', () => {
  const gui = readJson('contracts/app-gui-product-contract.json');
  const settings = readJson('contracts/app-settings-control-plane.json');
  const placement = gui.framework_surfaces.package_app_contributions.ui_composition.settings_placement_policy;
  const destinations = settings.settings_projection.package_contribution_visibility_policy.destinations;

  assert.deepEqual(placement.service_status, {
    destination: 'settings.services.installed_services',
    app_admission_required: true,
    admission_basis: ['current_user_task', 'app_placement_policy'],
  });
  assert.equal(destinations.service_status, 'settings.services.installed_services');
  assert.equal(placement.activity_log.destination, null);
  assert.equal(placement.activity_log.ordinary_settings_without_explicit_app_admission, 'hidden_from_ordinary_settings');
  assert.equal(destinations.activity_log, null);
});

test('App contribution product contract rejects role filters, executable UI, and view-type drift', () => {
  const source = readJson('contracts/app-gui-product-contract.json').framework_surfaces.package_app_contributions;

  for (const mutate of [
    (contract: any) => { contract.package_role_policy = 'standard_agent_only'; },
    (contract: any) => { contract.action_execution_policy = 'resolve_action_ref_through_the_existing_app_action_bridge'; },
    (contract: any) => { contract.navigation_identity = ['navigation_id']; },
    (contract: any) => { contract.broker_revalidation_policy = 'shell_may_reuse_stale_descriptor'; },
    (contract: any) => { contract.confirmation_policy = 'shell_may_infer_confirmation'; },
    (contract: any) => { contract.invalid_or_stale_projection_policy = 'render_last_known_good'; },
    (contract: any) => { contract.legacy_package_manager_state_allowed = true; },
    (contract: any) => { contract.forbidden_legacy_truth_sources = []; },
    (contract: any) => { contract.arbitrary_plugin_ui_code_allowed = true; },
    (contract: any) => { contract.supported_view_types.push('custom_react_component'); },
    (contract: any) => { contract.invalid_block_policy = 'filter_invalid_entries_individually'; },
  ]) {
    const invalid = structuredClone(source);
    mutate(invalid);
    assert.throws(
      () => validatePackageAppContributionsProductContract(invalid),
      /role-agnostic|view types|broker-routed|legacy truth sources|UI composition/,
    );
  }
});

test('App contribution product contract rejects a second Weixin provider path in AionUI', () => {
  const source = readJson('contracts/app-gui-product-contract.json').framework_surfaces.package_app_contributions;

  for (const mutate of [
    (contract: any) => {
      contract.standard_view_contracts.channel_access.renderer_activation_policy.aionui
        .framework_channel_provider_host_activation_allowed = true;
    },
    (contract: any) => {
      contract.standard_view_contracts.channel_access.renderer_activation_policy.aionui
        .framework_projected_channel_access_rendering_allowed = true;
    },
    (contract: any) => {
      contract.standard_view_contracts.channel_access.renderer_activation_policy
        .single_active_provider_path_per_renderer_required = false;
    },
  ]) {
    const invalid = structuredClone(source);
    mutate(invalid);
    assert.throws(
      () => validatePackageAppContributionsProductContract(invalid),
      /App GUI channel_access standard view contract/,
    );
  }
});
