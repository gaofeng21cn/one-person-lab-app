import fs from 'node:fs';
import { assertDefaultCodexSessionProfile } from '../app-product-profile-default-session.ts';
import { assertAppProductProfileIdentity } from '../app-product-profile-identity.ts';
import {
  assertAgentReferenceAdmissionPolicy,
  assertAppProductProfileCodexModelDisplayOptions,
  assertAppProductProfileGuiAuthority,
  assertAppProductProfileGuiInteractionBaseline,
  assertAppProductProfileHomeCodexPolicy,
  assertAppProductProfileSettingsVisualSystem,
  assertCapabilityReferenceListShape,
  assertHomeComposerStateContract,
  assertOfficialProfileShape,
  appOwnedOplStandardAgentMembershipPolicy,
} from '../app-product-profile-shared-validators.ts';
import { appProductProfilePath } from './paths.ts';
import type { AppProductProfile } from './types.ts';

const developerProfileCapabilityAxes = [
  'source_channel',
  'workspace_trust',
  'github_authority',
  'agent_automation',
  'runtime_mutation_scope',
];
function assertStringArray(value: unknown, label: string, options: { allowBlank?: boolean } = {}): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => (
    typeof entry === 'string' && (options.allowBlank || entry.trim())
  ))) {
    throw new Error(`Invalid App product profile ${label}: expected a non-empty string array`);
  }
}

const dynamicPackagePresentationPolicy = {
  homeShortcuts: {
    role: 'owner_projected_package_presentation',
    shortcut_source_ref: 'app_state.agent_packages.directory.entries[].home_shortcuts[]',
    preference_source_ref: 'app_state.agent_packages.status_index.home_shortcut_preferences[]',
    package_id_allowlist_allowed: false,
    fallback_policy: 'omit_invalid_shortcut_and_preserve_other_packages',
  },
} as const;

const dynamicHomeComposerAuthority = {
  shortcut_package_membership_source_ref:
    'app_state.agent_packages.directory.entries',
  opl_standard_agent_membership_policy: appOwnedOplStandardAgentMembershipPolicy,
  shortcut_preference_source_ref:
    'app_state.agent_packages.status_index.home_shortcut_preferences[]',
  shortcut_availability_source_ref:
    'app_state.agent_packages.directory.entries + app_state.agent_packages.status_index.packages[].presence',
  unknown_standard_agent_allowed: false,
  unknown_first_party_opl_standard_agent_allowed: true,
} as const;

function assertDynamicHomeComposerStateContract(value: AppProductProfile['gui']['home']['home_composer_state_contract'], label: string): void {
  const {
    shortcut_package_membership_source_ref,
    opl_standard_agent_membership_policy,
    shortcut_preference_source_ref,
    shortcut_availability_source_ref,
    unknown_standard_agent_allowed,
    unknown_first_party_opl_standard_agent_allowed,
  } = value;
  if (JSON.stringify({
    shortcut_package_membership_source_ref,
    opl_standard_agent_membership_policy,
    shortcut_preference_source_ref,
    shortcut_availability_source_ref,
    unknown_standard_agent_allowed,
    unknown_first_party_opl_standard_agent_allowed,
  }) !== JSON.stringify(dynamicHomeComposerAuthority)) {
    throw new Error(`${label} must use the dynamic Agent Package directory and Home preference authority`);
  }
  assertHomeComposerStateContract(value, label);
}

function assertIncludesAll(actual: string[], expected: string[], label: string): void {
  for (const item of expected) {
    if (!actual.includes(item)) {
      throw new Error(`Invalid App product profile ${label}: missing ${item}`);
    }
  }
}

function assertDeepEqualJson(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must equal ${JSON.stringify(expected)}`);
  }
}

function assertPostInstallAiSelfCheckEntry(
  entry: AppProductProfile['first_run']['beginner_presentation']['post_install_ai_self_check_entry'],
): void {
  if (
    entry?.trigger !== 'explicit ready entry after ready_to_launch first-run completion' ||
    entry.target_route !== '/guid' ||
    entry.route_state !== 'postInstallSelfCheck' ||
    entry.prompt_policy !==
      'localized Codex CLI post-install diagnostic prompt using canonical Framework state and package-scoped readback' ||
    entry.mutation_policy !== 'diagnose_first_no_file_mutation_without_user_confirmation' ||
    entry.release_gate_policy !== 'user_visible_entry_complements_non_blocking_codex_ai_self_check_receipt'
  ) {
    throw new Error('App product profile first_run.beginner_presentation.post_install_ai_self_check_entry has invalid route or policy');
  }
  assertDeepEqualJson(
    entry.target_state_checks,
    [
      'framework_fast_state_first',
      'codex_cli_and_model_access_core_state',
      'core_ready_separate_from_background_maintenance',
      'ui_language_policy',
      'user_authored_additional_instructions_optional_and_never_generated',
      'user_and_repo_agents_md_respected_no_overwrite',
      'official_profile_user_preferences_and_presence_only_package_scope',
      'installed_or_selected_package_configured_carrier_readback',
      'required_dependencies_and_routes_checked_per_package',
      'opl_flow_context_only_when_installed',
      'user_removed_or_optional_package_absence_not_global_failure',
      'post_maintenance_fresh_state_continuity',
    ],
    'first_run.beginner_presentation.post_install_ai_self_check_entry.target_state_checks',
  );
}

function assertFirstRunProfileShape(profile: AppProductProfile): void {
  assertStringArray(profile.first_run.readiness_layers, 'first_run.readiness_layers');
  assertStringArray(profile.first_run.ready_to_launch_gate.required_core_items, 'first_run.ready_to_launch_gate.required_core_items');
  assertStringArray(profile.first_run.ready_to_launch_gate.must_not_require, 'first_run.ready_to_launch_gate.must_not_require');
  if (
    profile.first_run.ready_to_launch_gate.ui_order !== 'before_first_conversation_not_before_guid' ||
    profile.first_run.ready_to_launch_gate.guid_navigation_blocking !== false
  ) {
    throw new Error('App product profile ready_to_launch must gate first conversation without blocking /guid navigation');
  }
  assertStringArray(profile.first_run.full_readiness_layers, 'first_run.full_readiness_layers');
  assertStringArray(profile.first_run.deferred_blockers, 'first_run.deferred_blockers');
  assertStringArray(profile.first_run.first_conversation.must_wait_for, 'first_run.first_conversation.must_wait_for');
  assertStringArray(profile.first_run.first_conversation.must_not_wait_for, 'first_run.first_conversation.must_not_wait_for');
  assertStringArray(
    profile.first_run.first_conversation.required_before_plain_send,
    'first_run.first_conversation.required_before_plain_send',
  );
  assertStringArray(
    profile.first_run.first_conversation.required_before_send_with_local_inputs,
    'first_run.first_conversation.required_before_send_with_local_inputs',
  );
  assertStringArray(
    profile.first_run.first_conversation.required_before_workspace_controls,
    'first_run.first_conversation.required_before_workspace_controls',
  );
  assertStringArray(profile.first_run.beginner_presentation.primary_steps, 'first_run.beginner_presentation.primary_steps');
  const beginnerPresentation = profile.first_run.beginner_presentation;
  if (
    beginnerPresentation.layout_mode !== 'focused_setup_workspace' ||
    beginnerPresentation.ordinary_navigation_policy !== 'hidden_until_user_enters_guid' ||
    beginnerPresentation.completion_navigation_policy !== 'manual_guid_entry_available_before_or_after_ready_no_automatic_route' ||
    beginnerPresentation.defer_navigation_policy !== 'explicit_enter_guid_available_before_ready_without_mutating_readiness' ||
    beginnerPresentation.core_readiness_status_policy !== 'required_core_items_never_treat_disabled_as_ready' ||
    beginnerPresentation.minimum_window_primary_action_policy !== '400x600_keeps_current_primary_action_visible'
  ) {
    throw new Error('Invalid App product profile first_run.beginner_presentation focused setup policy');
  }
  assertPostInstallAiSelfCheckEntry(profile.first_run.beginner_presentation.post_install_ai_self_check_entry);
  if (
    profile.first_run.first_conversation.gate !== 'capability_prerequisites_then_acp_warmup_before_initial_send' ||
    profile.first_run.first_conversation.runtime_readiness_method !== 'POST' ||
    profile.first_run.first_conversation.runtime_readiness_route !== '/api/conversations/<id>/runtime/ensure' ||
    profile.first_run.first_conversation.retired_route !== '/api/conversations/<id>/warmup' ||
    profile.first_run.first_conversation.route_failure_policy !== 'http_404_or_500_is_retryable_error_never_ready' ||
    profile.first_run.first_conversation.source_command !== 'opl system initialize --json' ||
    profile.first_run.first_conversation.ready_to_launch_must_be_true !== false ||
    profile.first_run.first_conversation.unknown_readiness_policy !== 'allow_attempt_without_mutating_readiness' ||
    profile.first_run.first_conversation.blocked_feedback !==
      'localized_inline_non_modal_setup_notice_preserves_prompt' ||
    profile.first_run.first_conversation.failure_policy !== 'show_retryable_initial_message_error_without_losing_user_prompt'
  ) {
    throw new Error('App product profile first_run.first_conversation must apply granular prerequisites before ACP warmup');
  }
  const fullRuntimeQualification = profile.first_run.full_runtime_package_qualification;
  if (
    fullRuntimeQualification.source !== 'framework_resolved_selected_package_set' ||
    fullRuntimeQualification.reconciliation !== 'idempotent_selected_capability_reconciliation' ||
    fullRuntimeQualification.composition_policy !== 'open_composition_no_fixed_package_set' ||
    fullRuntimeQualification.readiness_policy !==
      'selected_capabilities_gate_only_their_dependent_features' ||
    fullRuntimeQualification.workspace_scoped_materialization_policy !==
      'package_cache_without_global_marketplace_registration_until_mas_workspace_binding' ||
    fullRuntimeQualification.global_workspace_scoped_exposure !== 'forbidden'
  ) {
    throw new Error('App product profile must enforce the Full runtime package qualification boundary');
  }
  assertDeepEqualJson(
    profile.first_run.first_conversation.required_before_plain_send,
    ['codex_cli', 'codex_config'],
    'first_run.first_conversation.required_before_plain_send',
  );
  assertDeepEqualJson(
    profile.first_run.first_conversation.required_before_send_with_local_inputs,
    ['codex_cli', 'codex_config'],
    'first_run.first_conversation.required_before_send_with_local_inputs',
  );
  assertDeepEqualJson(
    profile.first_run.first_conversation.required_before_workspace_controls,
    ['workspace_root'],
    'first_run.first_conversation.required_before_workspace_controls',
  );
  const ordinaryRecovery = profile.first_run.ordinary_shell_recovery;
  const postLoginSetupCheck = ordinaryRecovery.fresh_webui_login_setup_check;
  if (
    postLoginSetupCheck.trigger !== 'successful_authenticated_webui_login_only' ||
    postLoginSetupCheck.route_intent !== 'postLoginSetupCheck' ||
    postLoginSetupCheck.state_source !== 'shared_opl_app_fast_state' ||
    postLoginSetupCheck.known_incomplete_behavior !== 'replace_guid_with_first_run' ||
    postLoginSetupCheck.ready_behavior !== 'keep_guid' ||
    postLoginSetupCheck.unknown_timeout_or_read_failure_behavior !== 'keep_guid_fail_open' ||
    postLoginSetupCheck.ui_timeout_ms !== 20_000 ||
    postLoginSetupCheck.ordinary_startup_refresh_and_deep_link_behavior !==
      'keep_guid_without_automatic_first_run' ||
    postLoginSetupCheck.consumption_policy !== 'one_shot' ||
    ordinaryRecovery.persistent_setup_entry.target_route !== '/first-run' ||
    ordinaryRecovery.persistent_setup_entry.surface !== 'ordinary_sidebar_non_modal_entry' ||
    ordinaryRecovery.persistent_home_composer_runtime_alert !==
      'forbidden_use_sidebar_and_send_scoped_inline_recovery_only' ||
    ordinaryRecovery.plain_conversation.workspace_root_required !== false ||
    ordinaryRecovery.plain_conversation.must_preserve_prompt !== true ||
    ordinaryRecovery.send_scoped_local_inputs.workspace_root_required !== false ||
    ordinaryRecovery.workspace_controls.plain_conversation_remains_available !== true ||
    ordinaryRecovery.workspace_controls.send_scoped_local_inputs_remain_available !== true ||
    ordinaryRecovery.unknown_readiness_policy !== 'do_not_synthesize_failure_or_mutate_readiness'
  ) {
    throw new Error('Invalid App product profile first_run.ordinary_shell_recovery policy');
  }
  assertDeepEqualJson(
    ordinaryRecovery.plain_conversation.required_items,
    ['codex_cli', 'codex_config'],
    'first_run.ordinary_shell_recovery.plain_conversation.required_items',
  );
  assertDeepEqualJson(
    ordinaryRecovery.send_scoped_local_inputs.required_items,
    ['codex_cli', 'codex_config'],
    'first_run.ordinary_shell_recovery.send_scoped_local_inputs.required_items',
  );
  assertDeepEqualJson(
    ordinaryRecovery.send_scoped_local_inputs.supported_inputs,
    [
      'file_dialog_attachment',
      'directory_dialog_attachment',
      'file_paste_attachment',
      'file_drag_attachment',
      'slash_open_absolute_path',
    ],
    'first_run.ordinary_shell_recovery.send_scoped_local_inputs.supported_inputs',
  );
  assertDeepEqualJson(
    ordinaryRecovery.workspace_controls.required_items,
    ['workspace_root'],
    'first_run.ordinary_shell_recovery.workspace_controls.required_items',
  );
  assertDeepEqualJson(
    ordinaryRecovery.workspace_controls.restricted_capabilities,
    ['project_workspace_selection', 'opl_workspace_controls'],
    'first_run.ordinary_shell_recovery.workspace_controls.restricted_capabilities',
  );
  assertIncludesAll(
    profile.first_run.first_conversation.must_wait_for,
    ['conversation_record_ready', 'acp_warmup_complete'],
    'first_run.first_conversation.must_wait_for',
  );
  assertIncludesAll(
    profile.first_run.first_conversation.must_not_wait_for,
    [
      'domain_modules',
      'family_runtime_provider',
      'recommended_skills',
      'native_helpers',
      'repo_sync',
      'command_line_tools_install',
      'ecosystem_module_updates',
    ],
    'first_run.first_conversation.must_not_wait_for',
  );
  if (profile.first_run.progress_model.source_command !== 'opl system initialize --json') {
    throw new Error('App product profile first_run.progress_model.source_command must be opl system initialize --json');
  }
  if (profile.first_run.progress_model.source_path !== 'system_initialize.setup_flow') {
    throw new Error('App product profile first_run.progress_model.source_path must be system_initialize.setup_flow');
  }
  if (profile.first_run.progress_model.renderer_truth_policy !== 'render_only_no_shell_private_progress_truth') {
    throw new Error('App product profile first_run.progress_model must keep renderers display-only');
  }
  assertStringArray(profile.first_run.progress_model.required_setup_flow_fields, 'first_run.progress_model.required_setup_flow_fields');
  assertStringArray(profile.first_run.progress_model.required_progress_fields, 'first_run.progress_model.required_progress_fields');
  assertStringArray(profile.first_run.progress_model.required_checklist_fields, 'first_run.progress_model.required_checklist_fields');
  assertStringArray(profile.first_run.progress_model.required_visible_elements, 'first_run.progress_model.required_visible_elements');
  assertStringArray(profile.first_run.command_line_tools.messages, 'first_run.command_line_tools.messages');
}

function assertSettingsProfileShape(profile: AppProductProfile): void {
  assertStringArray(profile.settings.visible_tabs, 'settings.visible_tabs');
  const controlPlane = profile.settings.control_plane;
  if (
    !controlPlane ||
    controlPlane.source_contract_ref !== 'contracts/app-gui-product-contract.json#settings_navigation'
  ) {
    throw new Error(
      'App product profile settings.control_plane must project contracts/app-gui-product-contract.json#settings_navigation'
    );
  }
  const ordinaryRoutes = Array.isArray(controlPlane.ordinary_routes) ? controlPlane.ordinary_routes : [];
  const secondaryPages = Array.isArray(controlPlane.secondary_pages) ? controlPlane.secondary_pages : [];
  const ordinaryRouteIds = ordinaryRoutes.map((route) => route.id);
  const secondaryPageIds = secondaryPages.map((page) => page.id);
  assertStringArray(controlPlane.ordinary_visible_tabs, 'settings.control_plane.ordinary_visible_tabs');
  assertStringArray(ordinaryRouteIds, 'settings.control_plane.ordinary_routes ids');
  assertStringArray(secondaryPageIds, 'settings.control_plane.secondary_pages ids');
  const controlPlaneRedirects = Object.fromEntries(
    Object.entries(controlPlane.legacy_route_redirects ?? {})
      .filter(([id]) => id !== 'about')
      .map(([id, target]) => [id, String(target).split('?')[0]]),
  );
  if (JSON.stringify(profile.settings.visible_tabs) !== JSON.stringify(controlPlane.ordinary_visible_tabs)) {
    throw new Error('App product profile settings.visible_tabs must match the projected Settings control plane ordinary tabs');
  }
  if (JSON.stringify(profile.settings.legacy_route_redirects) !== JSON.stringify(controlPlaneRedirects)) {
    throw new Error('App product profile settings.legacy_route_redirects must match query-free Settings control plane redirects');
  }
  if (JSON.stringify(controlPlane.ordinary_visible_tabs) !== JSON.stringify(ordinaryRouteIds)) {
    throw new Error('App product profile settings.control_plane must keep ordinary settings tabs on App-owned pages');
  }
  if (controlPlane.extension_tab_policy?.legacy_anchor_remap_required !== true) {
    throw new Error('App product profile settings.control_plane must require legacy extension anchor remapping');
  }
  const recommendedActionIds = controlPlane.state_action_policy?.recommended_action_ids;
  if (
    !recommendedActionIds ||
    typeof recommendedActionIds !== 'object' ||
    Array.isArray(recommendedActionIds) ||
    recommendedActionIds.doctor !== 'doctor' ||
    recommendedActionIds.repair !== 'repair'
  ) {
    throw new Error('App product profile settings.control_plane.state_action_policy.recommended_action_ids must expose doctor and repair action ids');
  }
  const declaredSlotIds = new Set(Object.keys(controlPlane.slot_registry ?? {}));
  for (const route of [...controlPlane.ordinary_routes, ...controlPlane.secondary_pages]) {
    if (!declaredSlotIds.has(route.slot_id)) {
      throw new Error(`App product profile settings.control_plane.slot_registry must declare ${route.slot_id}`);
    }
  }
  const settingsIa = profile.settings.settings_information_architecture ?? {};
  const groupIds = Array.isArray(settingsIa.ordinary_groups)
    ? settingsIa.ordinary_groups.map((group) => group.id)
    : [];
  assertStringArray(groupIds, 'settings_information_architecture.ordinary_groups ids');
  if (new Set(groupIds).size !== groupIds.length) {
    throw new Error('App product profile settings_information_architecture ordinary group ids must be unique');
  }
  const routeGroupIds = ordinaryRoutes.map((route) => route.ia_group);
  assertStringArray(routeGroupIds, 'settings.control_plane.ordinary_routes ia_group values');
  const uniqueRouteGroupIds = [...new Set(routeGroupIds)];
  if (
    uniqueRouteGroupIds.length !== groupIds.length ||
    groupIds.some((groupId) => !uniqueRouteGroupIds.includes(groupId))
  ) {
    throw new Error('App product profile settings_information_architecture must describe every Control Center IA group');
  }
  const userNavigationProjection = (
    controlPlane as typeof controlPlane & {
      user_navigation_projection?: {
        schema?: string;
        primary_group_order?: string[];
      };
    }
  ).user_navigation_projection;
  if (userNavigationProjection?.schema !== 'opl_app_settings_user_navigation.v2') {
    throw new Error('App product profile Settings user navigation projection must use v2');
  }
  assertStringArray(
    userNavigationProjection.primary_group_order,
    'settings.control_plane.user_navigation_projection.primary_group_order',
  );
  if (JSON.stringify(groupIds) !== JSON.stringify(userNavigationProjection.primary_group_order)) {
    throw new Error(
      'App product profile settings_information_architecture ordinary group order must match the v2 primary_group_order',
    );
  }
  const primaryTabIds = Object.keys(settingsIa.primary_tabs ?? {});
  assertIncludesAll(primaryTabIds, ordinaryRouteIds, 'settings_information_architecture.primary_tabs');
  for (const tabId of primaryTabIds) {
    if (![...ordinaryRouteIds, ...secondaryPageIds].includes(tabId)) {
      throw new Error(`App product profile settings_information_architecture.primary_tabs contains unknown settings route ${tabId}`);
    }
  }
  if (JSON.stringify(settingsIa.secondary_page_ids ?? []) !== JSON.stringify(secondaryPageIds)) {
    throw new Error('App product profile settings_information_architecture.secondary_page_ids must declare secondary settings pages');
  }
  const taskEntryPolicy = settingsIa.task_entry_policy;
  if (!taskEntryPolicy || typeof taskEntryPolicy !== 'object') {
    throw new Error('App product profile settings_information_architecture.task_entry_policy must be declared');
  }
  if (
    taskEntryPolicy.ordinary_entry_model !==
    'seven_primary_groups_expand_or_drill_into_second_level_destinations_backed_by_ten_stable_carrier_routes'
  ) {
    throw new Error('App product profile task_entry_policy must group ten stable carrier routes under seven primary entries');
  }
  assertIncludesAll(
    taskEntryPolicy.p0_entries ?? [],
    ['gateway_account', 'model_access', 'local_runtime_ability', 'workspace_entry', 'maintenance_hub', 'capability_status'],
    'settings_information_architecture.task_entry_policy.p0_entries',
  );
  assertIncludesAll(
    taskEntryPolicy.p1_entries ?? [],
    ['remote_access', 'advanced_deployment', 'developer_source_control', 'external_tools_voice'],
    'settings_information_architecture.task_entry_policy.p1_entries',
  );
  assertIncludesAll(
    taskEntryPolicy.hidden_as_ordinary_ui ?? [],
    ['AionUI Team', 'backend/provider raw selector', 'AG-UI implementation surface', 'AionUI implementation skills', 'raw runtime/provider internals'],
    'settings_information_architecture.task_entry_policy.hidden_as_ordinary_ui',
  );
  assertStringArray(profile.settings.environment_items, 'settings.environment_items');
  const developerProfile = profile.settings.developer_profile;
  if (!developerProfile || typeof developerProfile !== 'object') {
    throw new Error('App product profile settings.developer_profile must be declared');
  }
  if (
    developerProfile.source !== 'app_state.developer_profile + app_state.modules[].source_policy' ||
    developerProfile.default_profile !== 'standard_user' ||
    developerProfile.opt_in_policy !== 'automatic_for_matching_identity_and_authorized_repositories_with_explicit_off' ||
    developerProfile.settings_page !== 'settings_agents' ||
    developerProfile.global_control !== 'automatic_managed_developer_source_segmented_control' ||
    developerProfile.safe_maintenance_control !== 'auto_or_off_control_with_effective_state_readback' ||
    developerProfile.safe_maintenance_label_zh !== '允许维护已授权的开发仓库' ||
    developerProfile.safe_maintenance_label_en !== 'Maintain authorized development repositories' ||
    developerProfile.safe_maintenance_default !== 'auto' ||
    developerProfile.safe_maintenance_auto_policy !== 'matching developer identity plus successful full repository authority inspection activates developer_apply_safe for authorized repositories' ||
    developerProfile.safe_maintenance_fast_policy !== 'show inspection pending without claiming identity mismatch' ||
    developerProfile.shared_runtime_mutation_boundary !== 'enabled=on + mode=developer_apply_safe + source=user_config' ||
    developerProfile.safe_maintenance_independent_from_source_selection !== true ||
    developerProfile.package_source_control !== 'auto_managed_developer_segmented_control_in_package_details' ||
    developerProfile.fallback_policy !== 'developer_checkout_missing_falls_back_to_managed_with_visible_reason' ||
    developerProfile.hide_machine_status !== true
  ) {
    throw new Error('App product profile Developer Profile must preserve automatic authorized-repository maintenance with an explicit off choice');
  }
  assertIncludesAll(
    developerProfile.safe_maintenance_required_readback ?? [],
    ['effective_state', 'configuration_source', 'github_login', 'authorized_repository_scope', 'dirty_worktree_and_branch_protection', 'inactive_reason'],
    'settings.developer_profile.safe_maintenance_required_readback',
  );
  if (JSON.stringify(developerProfile.capability_axes) !== JSON.stringify(developerProfileCapabilityAxes)) {
    throw new Error('App product profile Developer Profile must declare the required capability axes');
  }
  for (const axis of developerProfileCapabilityAxes) {
    const capability = developerProfile.capabilities?.[axis];
    if (!capability || typeof capability !== 'object') {
      throw new Error(`App product profile Developer Profile capability ${axis} must be declared`);
    }
    for (const field of ['standard_default', 'developer_opt_in', 'display_policy'] as const) {
      if (typeof capability[field] !== 'string' || !capability[field].trim()) {
        throw new Error(`App product profile Developer Profile capability ${axis}.${field} must be a non-empty string`);
      }
    }
  }
  if (
    developerProfile.capabilities.source_channel.standard_default !== 'agent_rolling_latest_package_channel' ||
    developerProfile.capabilities.source_channel.developer_opt_in !== 'github_repo_or_local_checkout' ||
    developerProfile.capabilities.runtime_mutation_scope.standard_default !== 'app_action_route_only' ||
    'legacy_developer_mode_alias' in developerProfile
  ) {
    throw new Error('App product profile Developer Profile must use capability display without legacy Developer Mode aliases');
  }
}

function assertCompanionPayloadProfileShape(profile: AppProductProfile): void {
  assertStringArray(profile.companion_payloads.domain_modules, 'companion_payloads.domain_modules');
  const strategy = profile.companion_payloads.capability_strategy_consumer;
  if (
    strategy?.strategy_authority !== 'opl-flow'
    || strategy.compiler_authority !== 'opl-framework'
    || strategy.runtime_projection_ref !==
      'app_state.agent_packages.status_index.packages.opl-flow.capability_strategy'
    || strategy.full_build_lock_kind !== 'opl_flow_capability_build_lock.v1'
    || strategy.app_policy_inventory_allowed !== false
    || strategy.app_direct_workflow_policy_parse_allowed !== false
  ) {
    throw new Error('App product profile must consume the Framework-compiled OPL Flow capability strategy');
  }
  if (profile.companion_payloads.install_exposure_policy_ref !== 'contracts/app-install-exposure-policy.json') {
    throw new Error('App product profile companion payloads must reference app-install-exposure-policy.json');
  }
  if (profile.companion_payloads.public_abi?.primary_semantic_entry !== 'skill') {
    throw new Error('App product profile companion payloads must keep skill as the primary semantic entry');
  }
  if (profile.companion_payloads.public_abi.plugin_must_not_create_second_semantics !== true) {
    throw new Error('App product profile companion payloads must forbid second semantics from plugin packaging');
  }
  if (profile.companion_payloads.domain_plugin_skills_must_not_be_companion_mirrors !== true) {
    throw new Error('App product profile domain plugin skills must not be companion mirrors');
  }
}

function assertCodexOplFlowContext(profile: AppProductProfile): void {
  if (
    profile.codex.app_runtime_home?.default_path !== '~/.codex' ||
    profile.codex.app_runtime_home.override_env !== 'CODEX_HOME' ||
    profile.codex.app_runtime_home.resolution_policy !== 'preserve_existing_env_else_codex_system_default' ||
    profile.codex.app_runtime_home.app_env_injection !== 'forbidden' ||
    profile.codex.app_runtime_home.startup_and_recheck_mutation !== 'forbidden' ||
    profile.codex.app_runtime_home.explicit_model_access_mutation !==
      'framework_action_atomic_merge_with_backup_and_restore'
  ) {
    throw new Error('App product profile must preserve the system Codex home without App environment injection');
  }
  if (
    profile.codex.auto_model_policy.authority !== 'one-person-lab-app' ||
    profile.codex.auto_model_policy.recommendation_authority !== 'opl-flow' ||
    profile.codex.auto_model_policy.policy_source_ref !==
      'app_state.agent_packages.status_index.packages.opl-flow.model_projection' ||
    profile.codex.auto_model_policy.projection_surface_kind !== 'opl_codex_model_policy_projection.v1' ||
    profile.codex.auto_model_policy.projection_presence_rule !==
      'consume_only_when_fresh_opl_flow_presence_installed_true_and_projection_is_valid' ||
    profile.codex.auto_model_policy.app_role !==
      'resolve_auto_from_fresh_catalog_and_projected_recommendation_then_persist_user_override' ||
    JSON.stringify(profile.codex.auto_model_policy.resolution_precedence) !== JSON.stringify([
      'explicit_user_selection',
      'installed_opl_flow_recommendation',
      'fresh_codex_live_default',
      'app_fallback_when_flow_unavailable',
    ]) ||
    profile.codex.auto_model_policy.app_fallback_role !==
      'configured_default_is_used_only_when_flow_projection_is_absent_invalid_or_unavailable_and_catalog_cannot_resolve' ||
    profile.codex.auto_model_policy.configured_default_role !==
      'app_fallback_not_flow_recommendation_authority'
  ) {
    throw new Error('App product profile must consume the OPL Flow model policy projection');
  }
  if (
    profile.codex.opl_flow_context?.flow_id !== 'opl-flow' ||
    profile.codex.opl_flow_context.source !== 'framework-agent-package-projection' ||
    profile.codex.opl_flow_context.presence_source_ref !==
      'app_state.agent_packages.status_index.packages.opl-flow.presence' ||
    profile.codex.opl_flow_context.presence_rule !== 'inject_only_when_fresh_presence_installed_true' ||
    profile.codex.opl_flow_context.delivery !== 'installed_package_metadata_only' ||
    profile.codex.opl_flow_context.absence_policy !== 'omit_opl_flow_context' ||
    profile.codex.opl_flow_context.status_source_ref !==
      'app_state.agent_packages.status_index.packages.opl-flow' ||
    JSON.stringify(profile.codex.opl_flow_context.status_planes) !== JSON.stringify([
      'package_operational',
      'experience_baseline',
      'specialized_capabilities',
    ]) ||
    profile.codex.opl_flow_context.user_agents_policy !== 'respect_user_agents_no_overwrite_detect_conflicts' ||
    profile.codex.opl_flow_context.language_policy !== 'follow_ui_locale_zh_only_when_ui_zh' ||
    profile.codex.opl_flow_context.app_role !==
      'consume_generic_framework_projection_and_execute_projected_actions_only' ||
    profile.codex.opl_flow_context.flow_policy_parsing !== 'forbidden' ||
    profile.codex.opl_flow_context.companion_inventory_storage !== 'forbidden'
  ) {
    throw new Error('App product profile must consume the generic Framework OPL Flow projection');
  }
  const additionalInstructions = profile.codex.new_conversation_additional_instructions;
  if (
    additionalInstructions?.content_owner !== 'user' ||
    additionalInstructions.delivery !== 'new_conversation_additional_instructions_only' ||
    additionalInstructions.storage_key !== 'codex.oplAppSessionContextAdditional' ||
    additionalInstructions.storage_key_status !== 'legacy_compatibility_storage_key' ||
    additionalInstructions.generated_base_context_allowed !== false ||
    additionalInstructions.agent_route_fallback_allowed !== false ||
    additionalInstructions.empty_value_policy !== 'inject_nothing' ||
    additionalInstructions.reset_behavior !== 'clear_additional_instructions' ||
    additionalInstructions.effect !== 'next_new_conversation'
  ) {
    throw new Error('App product profile must limit new-conversation additions to optional user-authored text');
  }
  for (const field of [
    'opl_app_session_context',
    'default_visible_skills',
    'skill_priority',
    'session_context_lines',
    'session_context_i18n',
  ]) {
    if (field in profile.codex) {
      throw new Error(`App product profile must not restore legacy Codex authority codex.${field}`);
    }
  }
}

function assertHomeCodexProfileShape(profile: AppProductProfile): void {
  assertAppProductProfileGuiAuthority(profile);
  assertAppProductProfileGuiInteractionBaseline(profile);
  assertAppProductProfileSettingsVisualSystem(profile);
  assertAppProductProfileHomeCodexPolicy(profile, 'App product profile', {
    requireEnglishStatusLabel: true,
    requireSelectionPersistence: true,
  });
  assertDynamicHomeComposerStateContract(profile.gui.home.home_composer_state_contract, 'App product profile Home composer state contract');
  assertStringArray(
    profile.codex.auto_model_policy.frontier_model_preference_order,
    'codex.auto_model_policy.frontier_model_preference_order',
  );
  assertAppProductProfileCodexModelDisplayOptions(profile, 'App product profile', {
    requireAutoIdAndDescriptions: true,
  });
}

function assertHomeShortcutCompatibilityMetadata(profile: AppProductProfile): void {
  if (
    JSON.stringify(profile.gui.home.home_agent_shortcuts_metadata_policy) !==
      JSON.stringify(dynamicPackagePresentationPolicy.homeShortcuts)
  ) {
    throw new Error('App product profile Home shortcuts must come from owner-projected Package presentation');
  }
  if ('home_agent_shortcuts' in profile.gui.home) {
    throw new Error('App product profile must not restore an App-owned Home shortcut list');
  }
  assertStringArray(
    profile.gui.home.retired_codex_models_must_not_be_exposed,
    'gui.home.retired_codex_models_must_not_be_exposed',
  );
}

function assertHomeActivityCenterPolicy(profile: AppProductProfile): void {
  if (
    profile.gui.home.activity_center_policy?.source !== 'not_rendered_on_ordinary_home' ||
    profile.gui.home.activity_center_policy.authority !== 'app_owned_home_minimal_command_surface' ||
    profile.gui.home.activity_center_policy.role !== 'home_runtime_activity_suppressed_to_keep_composer_first' ||
    profile.gui.home.activity_center_policy.default_placement !== 'not_rendered_on_ordinary_home' ||
    profile.gui.home.activity_center_policy.home_surface_policy !== 'ordinary_home_must_not_render_activity_center_or_continue_work_grid' ||
    profile.gui.home.activity_center_policy.footer_quick_actions_policy !== 'do_not_render_feedback_star_web_icons_on_home'
  ) {
    throw new Error('App product profile GUI home must keep runtime activity off ordinary Home');
  }
  if (profile.gui.home.activity_center_policy.allowed_home_runtime_context.length !== 0) {
    throw new Error('App product profile GUI home must not allow runtime context on ordinary Home');
  }
  assertIncludesAll(
    profile.gui.home.activity_center_policy.must_not_display,
    [
      'expanded continue-work center',
      'needs attention / active / recent activity groups',
      'per-assistant running badges',
      'module_runtime dirty state as task',
      'domain artifact body',
      'memory body',
      'quality verdict body',
      'provider implementation details',
    ],
    'gui.home.activity_center_policy.must_not_display',
  );
}

function assertHomeSelectionAndIconPolicy(profile: AppProductProfile): void {
  const homeLayout = profile.gui.home.home_layout;
  const iconPolicy = profile.gui.home.utility_icon_policy;
  if (
    homeLayout.default_active_shortcut !== null ||
    homeLayout.shortcut_selection_policy !==
      'explicit_user_or_navigation_selection_only_no_saved_preset_restore_and_never_disabled_by_launch_readiness' ||
    homeLayout.starter_item_width_policy !== 'content_sized' ||
    homeLayout.starter_count_layout_policy !== 'center_actual_visible_count_and_wrap_without_navigation_chevrons' ||
    homeLayout.desktop_composer_max_width_px !== 736 ||
    homeLayout.desktop_composer_min_height_px !== 98 ||
    homeLayout.desktop_composer_corner_radius_px !== 22 ||
    homeLayout.desktop_context_bar_height_px !== 52 ||
    homeLayout.desktop_context_bar_overlap_px !== 13 ||
    homeLayout.desktop_context_bar_horizontal_inset_px !== 12 ||
    homeLayout.workspace_selector_visible !== true ||
    homeLayout.workspace_selector_entry !== 'home.new_session_context_bar' ||
    homeLayout.unselected_workspace_control_visible !== true ||
    homeLayout.unselected_workspace_control_policy !==
      'localized_choose_project_directory_action_not_projectless_status_placeholder' ||
    homeLayout.selected_working_directory_visual_policy !==
      'independent_new_session_context_bar_control_with_selected_directory_and_clear_action' ||
    homeLayout.selected_starter_visual_policy !==
      'quiet_fill_with_aria_pressed_without_trailing_selection_glyph' ||
    homeLayout.selected_starter_accessibility_state !== 'aria_pressed_reflects_active_shortcut'
  ) {
    throw new Error('App product profile Home must require explicit professional-agent selection with a visible selected state');
  }
  if (
    profile.gui.appearance.visual_source_cohort_ref !== 'contracts/app-gui-visual-source-cohort.json' ||
    profile.gui.appearance.visual_reference_cohort_ref !== 'contracts/app-gui-visual-reference-cohort.json' ||
    JSON.stringify(profile.gui.appearance.shared_visual_primitives) !==
      JSON.stringify(['composer', 'rail_row', 'icon_button', 'menu', 'settings_row'])
  ) {
    throw new Error('App product profile appearance must bind the pinned DSH visual source cohort and shared primitives');
  }
  if (
    iconPolicy.library !== 'pinned_deepseek_harness_icon_cohort_via_opl_icon_adapter' ||
    iconPolicy.opl_owned_settings_navigation_and_overview !== 'dsh_icon_primitives_14_16px_currentcolor' ||
    iconPolicy.settings_icon_geometry !==
      'stable_16px_slot_1_5_to_1_75px_visual_stroke_no_colored_tile_or_letter_avatar' ||
    JSON.stringify(iconPolicy.icon_text_action_geometry) !==
      JSON.stringify({
        icon_size_px: 16,
        icon_slot_px: 16,
        icon_color: 'currentColor',
        icon_background: 'transparent_none',
        icon_label_gap_px: 4,
        source: 'pinned_dsh_Button.module.css',
        normal_typography: 'var(--dsw-font-s-14)',
        compact_typography: 'var(--dsw-font-xxs-12)',
        alignment: 'icon_slot_and_label_share_one_vertical_centerline',
        contrast_policy: 'button_foreground_color_applies_to_icon_and_label_together',
        disabled_policy: 'apply_disabled_opacity_to_the_whole_control_never_hide_only_the_icon',
      }) ||
    iconPolicy.upstream_fork_body_bulk_icon_rewrite !== 'forbidden' ||
    iconPolicy.refresh_actions !== 'icon_only_with_tooltip_and_accessible_name' ||
    iconPolicy.model_reasoning_control !== 'text_and_disclosure_without_brain_icon' ||
    JSON.stringify(iconPolicy.account_identity_avatar) !==
      JSON.stringify({
        shape: 'circle',
        background: 'semantic_success_green',
        foreground: 'inverse',
        han_name_initials: 'first_han_character_only',
        non_han_name_initials: 'first_letters_of_first_two_words_uppercase_else_first_two_codepoints',
        email_fallback_initials: 'first_two_local_part_codepoints_uppercase',
        empty_fallback: 'OP',
      }) ||
    iconPolicy.global_feedback_action?.placement !== 'titlebar_trailing_utility' ||
    iconPolicy.global_feedback_action?.icon !== 'circle_question' ||
    iconPolicy.global_feedback_action?.icon_style !== 'regular_outline' ||
    iconPolicy.global_feedback_action?.target_url !==
      'https://github.com/gaofeng21cn/one-person-lab-app/issues/new' ||
    iconPolicy.global_feedback_action?.open_mode !== 'external_browser_user_review_and_submit' ||
    JSON.stringify(iconPolicy.global_feedback_action?.prefill_fields) !==
      JSON.stringify(['localized_title', 'localized_body', 'current_route', 'app_release_version']) ||
    JSON.stringify(iconPolicy.global_feedback_action?.startup_failure_action) !==
      JSON.stringify({
        placement: 'blocking_startup_failure_dialog',
        delivery_channel: 'electron_main_process_native_open_external_via_preload_ipc',
        backend_dependency: 'none',
        submission_policy: 'external_browser_user_review_and_submit',
        automatic_submission: false,
        prefill_fields: [
          'localized_title',
          'localized_body',
          'app_release_version',
          'platform',
          'architecture',
          'startup_failure_reason',
          'backend_boundary_code',
          'backend_boundary_stage',
        ],
        automatic_attachment_policy: 'forbidden_no_logs_paths_credentials_or_user_content',
      }) ||
    iconPolicy.global_feedback_action?.shell_local_delivery_forbidden !== true ||
    iconPolicy.scope !== 'opl_owned_overlay_surfaces_not_upstream_fork_body'
  ) {
    throw new Error('App product profile utility icon policy must preserve OPL-owned icons and GitHub issue routing');
  }
}

function assertUiLocalePolicy(profile: AppProductProfile): void {
  const policy = profile.gui.ui_locale_policy;
  if (
    policy.explicit_user_preference !== 'preserve_across_launches' ||
    policy.first_launch_without_preference !== 'detect_system_locale_before_first_render' ||
    policy.supported_normalization !== 'zh_to_zh-CN_else_en-US' ||
    policy.startup_must_not_overwrite_explicit_preference !== true
  ) {
    throw new Error('App product profile locale policy must detect the system language before first render while preserving explicit preferences');
  }
}

function assertNoFixedAgentHomePresentation(profile: AppProductProfile): void {
  const gui = profile.gui as unknown as Record<string, unknown>;
  const home = profile.gui.home as unknown as Record<string, unknown>;
  for (const field of [
    'default_assistants',
    'non_default_assistants',
    'professional_agent_packages',
    'professional_agent_packages_metadata_policy',
  ]) {
    if (field in gui) {
      throw new Error(`App product profile must not restore fixed Agent/Home presentation field gui.${field}`);
    }
  }
  if ('home_purpose_entries' in home) {
    throw new Error('App product profile must not restore fixed Agent/Home presentation field gui.home.home_purpose_entries');
  }
  if (
    profile.gui.home.home_layout.home_presentation_source_ref !==
    'app_state.agent_packages.directory.entries + app_state.agent_packages.status_index.home_shortcut_preferences[]'
  ) {
    throw new Error('App product profile Home presentation must come from the dynamic Agent directory and shortcut compatibility metadata');
  }
}

function assertOrdinaryCapabilitySelectorPolicy(profile: AppProductProfile): void {
  const ordinarySelector = profile.gui.ordinary_capability_selector_policy;
  if (!ordinarySelector || typeof ordinarySelector !== 'object') {
    throw new Error('App product profile must declare ordinary_capability_selector_policy');
  }
  assertAgentReferenceAdmissionPolicy(
    ordinarySelector.agent_reference_admission_policy,
    'App product profile Agent reference admission policy',
  );
  if (
    ordinarySelector.scope !== 'home_composer_and_ordinary_conversation' ||
    ordinarySelector.authority !== 'owner_or_carrier_skill_projection_and_mcp_negative_filter' ||
    ordinarySelector.palette_agent_catalog_source_ref !==
      'app_state.agent_packages.directory.entries' ||
    JSON.stringify(ordinarySelector.opl_standard_agent_membership_policy) !==
      JSON.stringify(appOwnedOplStandardAgentMembershipPolicy) ||
    ordinarySelector.palette_agent_status_source_ref !==
      'app_state.agent_packages.status_index.packages[]' ||
    ordinarySelector.palette_agent_availability_policy !==
      'join_by_package_id_and_use_fresh_directory_installed_plus_status_index_presence.present_and_presence.callable' ||
    ordinarySelector.palette_agent_action_policy !==
      'directory_available_actions_and_recommended_action_ref_only' ||
    ordinarySelector.palette_unknown_standard_agent_policy !==
      'include_unknown_package_ids_only_when_they_match_opl_standard_agent_membership' ||
    ordinarySelector.palette_required_agent_package_ids !== undefined ||
    ordinarySelector.palette_home_shortcut_independence_policy !==
      'complete_opl_standard_agent_catalog_independent_of_home_shortcut_visibility_and_order' ||
    JSON.stringify(ordinarySelector.palette_agent_group_label_i18n) !==
      JSON.stringify({ 'zh-CN': 'OPL 标准智能体', 'en-US': 'OPL standard agents' }) ||
    ordinarySelector.agent_owned_skill_deduplication_policy !==
      'exclude_rendered_professional_agent_required_skill_ids_from_home_new_session_standalone_skills' ||
    ordinarySelector.skill_source_ref !==
      'owner_or_carrier_projected_capability_metadata_for_the_selected_package' ||
    ordinarySelector.skill_menu_policy !== 'assistant_scoped_required_checked_optional_visible' ||
    ordinarySelector.conversation_loaded_skill_display_policy !== 'preserve_owner_or_carrier_projected_loaded_skills' ||
    ordinarySelector.mcp_server_source_ref !== 'configured_user_and_third_party_mcp_servers' ||
    ordinarySelector.mcp_menu_policy !==
      'preserve_configured_user_and_third_party_servers_except_explicit_forbidden_matchers' ||
    ordinarySelector.conversation_loaded_mcp_display_policy !== 'preserve_non_forbidden_configured_servers' ||
    ordinarySelector.forbidden_mcp_policy !==
      'exclude_only_explicit_team_or_internal_matches_preserve_all_other_user_and_third_party_servers' ||
    ordinarySelector.unmatched_mcp_policy !== 'preserve_end_to_end_without_app_allowlist_membership' ||
    Object.prototype.hasOwnProperty.call(ordinarySelector, 'forbidden_skill_examples')
  ) {
    throw new Error('App product profile ordinary capability selector must use owner/carrier Skill projection and the MCP negative filter');
  }
  assertIncludesAll(
    ordinarySelector.forbidden_mcp_examples,
    ['aionui-team', 'team_*', 'mcp__aionui-team*', 'team_mcp_stdio_config', 'team_id/teamId'],
    'gui.ordinary_capability_selector_policy.forbidden_mcp_examples',
  );
  if (
    JSON.stringify(ordinarySelector.forbidden_mcp_matchers) !==
    JSON.stringify({
      exact: ['aionui-team'],
      prefixes: ['team_', 'mcp__aionui-team'],
      contains: ['aionui-team'],
    })
  ) {
    throw new Error('App product profile ordinary selector must carry Team MCP forbidden matchers');
  }
  if (
    JSON.stringify(ordinarySelector.scrub_extra_keys) !==
    JSON.stringify([
      'team_mcp_stdio_config',
      'team_id',
      'teamId',
      'team_lead_team_id',
      'team_lead_team_slot_id',
      'team_lead_conversation_id',
      'tl',
    ])
  ) {
    throw new Error('App product profile ordinary selector must carry Team extra scrub keys');
  }
  if (
    JSON.stringify(ordinarySelector.required_scrub_targets) !==
    JSON.stringify([
      'mcp_servers entries matching forbidden_mcp_matchers',
      'mcp_statuses entries matching forbidden_mcp_matchers',
      'session_mcp_servers entries matching forbidden_mcp_matchers',
      'scrub_extra_keys',
    ])
  ) {
    throw new Error('App product profile ordinary selector must carry executable Team scrub targets');
  }
  if (
    ordinarySelector.conversation_snapshot_policy !==
    'scrub_disabled_team_mcp_and_team_metadata_before_rendering_or_inheriting_ordinary_conversations'
  ) {
    throw new Error('App product profile ordinary capability selector must scrub disabled Team MCP snapshots');
  }
  if (
    JSON.stringify(ordinarySelector.required_preservation_targets) !==
    JSON.stringify([
      'mcp directory entries not matching forbidden_mcp_matchers',
      'mcp status entries not matching forbidden_mcp_matchers',
      'new conversation create payload mcp_servers not matching forbidden_mcp_matchers',
      'conversation snapshot mcp_servers and mcp_statuses not matching forbidden_mcp_matchers',
    ])
  ) {
    throw new Error('App product profile ordinary MCP selector must preserve every non-forbidden MCP carrier');
  }
}

function assertAgentPackageRegistryProjection(profile: AppProductProfile): void {
  const projection = profile.gui.agent_package_registry;
  if (
    projection?.directory_projection_authority !== 'app_state.agent_packages.directory.entries' ||
    projection?.status_projection_authority !== 'app_state.agent_packages.status_index' ||
    projection?.action_projection_authority !==
      'app_state.agent_packages.directory.entries[].available_actions[] + app_state.actions' ||
    projection?.presentation_source !== 'app_state.agent_packages.directory.entries' ||
    projection?.unknown_package_policy !== 'render_without_app_package_id_branch' ||
    projection?.manifest_lock_receipt_parser_allowed !== false ||
    projection?.action_id_allowlist_allowed !== false ||
    projection?.shell_consumption_policy !== 'generated_product_profile_only_no_renderer_literal'
  ) {
    throw new Error('App product profile must consume generic Framework Package projections without private metadata or lifecycle parsers');
  }
  for (const forbiddenField of [
    'starter_package_metadata',
    'first_party_manifest_fixture_dir',
    'external_registry_policy_ref',
    'directory_lifecycle_authority',
  ]) {
    if (forbiddenField in projection) {
      throw new Error(`App product profile must not restore private Package consumer field ${forbiddenField}`);
    }
  }
  const presentation = projection.catalog_presentation_policy;
  if (
    JSON.stringify(presentation.section_order) !==
      JSON.stringify(['opl_managed', 'other_agents', 'other_capabilities']) ||
    JSON.stringify(presentation.ownership_classifier) !==
      JSON.stringify({
        source_fields: ['official', 'publisher'],
        opl_official: true,
        opl_publisher: 'one-person-lab',
        hardcoded_package_ids_allowed: false,
      }) ||
    JSON.stringify(presentation.section_policy) !==
      JSON.stringify({
        opl_managed:
          'all dynamically identified OPL-owned Package roles, with standard Agents before workflow and capability Packages',
        other_agents: 'non-OPL standard Agents',
        other_capabilities: 'non-OPL workflow, capability, and unknown Package roles',
        availability_status_is_row_state_not_grouping: true,
      }) ||
    presentation.standard_agent_name_policy !==
      'owner-projected invariant English brand name in every locale' ||
    presentation.description_locale_policy !== 'active UI locale then owner-default fallback' ||
    JSON.stringify(presentation.package_role_labels_i18n) !==
      JSON.stringify({
        standard_agent: { 'zh-CN': '专业智能体', 'en-US': 'Professional agent' },
        capability_package: { 'zh-CN': '能力包', 'en-US': 'Capability package' },
        workflow_profile: { 'zh-CN': '工作流配置', 'en-US': 'Workflow profile' },
      }) ||
    presentation.raw_package_role_visible !== false ||
    presentation.dependency_hierarchy.source !==
      'app_state.agent_packages.status_index.packages[].dependent_guard.required_by_package_ids' ||
    presentation.dependency_hierarchy.direction !==
      'a_package_with_one_visible_required_by_package_id_is_nested_under_that_parent_package' ||
    presentation.dependency_hierarchy.single_parent_policy !==
      'render_once_as_a_compact_child_row_under_the_visible_parent' ||
    presentation.dependency_hierarchy.multiple_parent_policy !==
      'render_once_in_the_ownership-matched_capability_group_with_localized_parent_labels' ||
    presentation.dependency_hierarchy.missing_or_invisible_parent_policy !==
      'render_once_in_the_ownership-matched_capability_group' ||
    presentation.dependency_hierarchy.hardcoded_package_relationships_allowed !== false ||
    presentation.dependency_hierarchy.duplicate_rows_allowed !== false ||
    presentation.dependency_hierarchy.status_and_actions_source !==
      'unchanged_Framework_directory_and_status_index_projection' ||
    presentation.developer_controls_disclosure.default_state !== 'collapsed' ||
    JSON.stringify(presentation.developer_controls_disclosure.contains) !==
      JSON.stringify([
        'global_runtime_source',
        'authorized_repository_maintenance',
        'workspace_and_repository_protection_summary',
      ]) ||
    presentation.developer_controls_disclosure.ordinary_catalog_remains_visible_when_collapsed !== true
  ) {
    throw new Error('App product profile Agent catalog must use localized product ordering and projected dependency hierarchy');
  }
}

function assertProfileShape(profile: AppProductProfile): void {
  assertAppProductProfileIdentity(profile);
  if (profile.product?.ordinary_chrome_name !== 'One Person Lab') {
    throw new Error('App product profile product.ordinary_chrome_name must be One Person Lab');
  }
  assertDefaultCodexSessionProfile(profile);
  assertCodexOplFlowContext(profile);
  assertHomeCodexProfileShape(profile);
  assertHomeShortcutCompatibilityMetadata(profile);
  assertHomeActivityCenterPolicy(profile);
  assertHomeSelectionAndIconPolicy(profile);
  assertOfficialProfileShape(profile.official_profile, 'App product profile Official Profile');
  assertUiLocalePolicy(profile);
  assertNoFixedAgentHomePresentation(profile);
  assertOrdinaryCapabilitySelectorPolicy(profile);
  assertFirstRunProfileShape(profile);
  assertSettingsProfileShape(profile);
  assertCompanionPayloadProfileShape(profile);
  assertStringArray(profile.boundary.app_does_not_own, 'boundary.app_does_not_own');
}

export function readAppProductProfile(profilePath = appProductProfilePath): AppProductProfile {
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as AppProductProfile;
  assertProfileShape(profile);
  assertAgentPackageRegistryProjection(profile);
  return profile;
}
