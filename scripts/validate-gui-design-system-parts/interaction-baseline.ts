import type { JsonRecord } from './contract.ts';
import { visualSourceCohortPath } from './contract.ts';
import {
  appOwnedActiveStudioPrimaryNavigation,
  appOwnedCodexSubagentActivityPolicy,
  appOwnedDirectoryGroupPolicy,
  appOwnedExplicitSessionInputPolicy,
  appOwnedOplStandardAgentMembershipPolicy,
  appOwnedSendFailureInputPolicy,
  appOwnedSessionWorkspaceModel,
  appOwnedUnifiedContextMenu,
} from '../validate-active-shell/app-contract-constants.ts';
import { record, sameStrings, stringArray } from './shared.ts';

type GuiDesignSystemInteractionBaselineInputs = {
  issues: Set<string>;
  profile: JsonRecord;
  guiContract: JsonRecord;
  pageStateMatrix: JsonRecord;
  interactionBaseline: JsonRecord;
};

export function validateGuiDesignSystemInteractionBaseline({
  issues,
  profile,
  guiContract,
  pageStateMatrix,
  interactionBaseline,
}: GuiDesignSystemInteractionBaselineInputs): void {
  const literalObservation = record(interactionBaseline.literal_observation);
  const featurePreservation = record(interactionBaseline.feature_preservation_policy);
  const relocationGate = record(featurePreservation.relocation_gate);
  const runtimeSurfaceRoles = record(featurePreservation.runtime_surface_roles);
  const runtimePreservationGate = record(featurePreservation.runtime_preservation_gate);
  const oplTargetTranslation = [
    'navigation_rail',
    'conversation_scope',
    'thread_coordination',
    'home',
    'capability_selection',
    'composer',
    'permission_access_mode',
    'current_task_summary_bar',
    'artifact_preview',
    'context_surfaces',
    'settings_shell',
    'visual_target',
  ];
  if (
    literalObservation.boundary !== 'only_directly_observed_codex_composition_and_interaction_patterns' ||
    !sameStrings(literalObservation.observed_patterns, [
      'conversation_navigation_rail',
      'single_chat_canvas',
      'conversation_header_controls',
      'bottom_composer',
      'on_demand_secondary_surfaces',
      'quiet_dense_visual_hierarchy',
    ]) ||
    !sameStrings(literalObservation.must_not_claim_as_codex_observation, [
      'opl_capability_entries',
      'opl_archived_capabilities_settings_rail_placement',
      'opl_side_panel_tool_taxonomy',
      'opl_runtime_action_receipt_authority',
      'opl_runtime_cross_project_navigation',
      'opl_settings_information_architecture',
    ]) ||
    !sameStrings(interactionBaseline.opl_target_translation, oplTargetTranslation)
  ) {
    issues.add('interaction baseline must separate literal Codex observations from OPL-owned target translation');
  }

  if (
    featurePreservation.authority !== 'opl_product_capability_over_external_reference_parity' ||
    featurePreservation.external_reference_role !== 'placement_and_interaction_reference_only' ||
    !sameStrings(featurePreservation.protected_surfaces, [
      'agent_capabilities',
      'first_run',
      'opl_settings',
      'domain_package_entries',
      'bilingual_ui',
      'runtime_navigation',
    ]) ||
    relocationGate.replacement_reachable_in_same_change !== true ||
    relocationGate.contract_source_tests_updated_together !== true ||
    relocationGate.removal_before_replacement_forbidden !== true ||
    runtimeSurfaceRoles.navigation_runtime !== 'opl_studio_primary_navigation' ||
    runtimeSurfaceRoles.navigation_runtime_default_visible !== true ||
    runtimeSurfaceRoles.context_runtime !== 'selected_conversation_or_task_details' ||
    runtimeSurfaceRoles.context_runtime_independent_of_navigation_runtime !== true ||
    runtimePreservationGate.product_contract_ref !==
      'contracts/app-gui-product-contract.json#pages.runtime_status.runtime_cockpit_product_contract' ||
    runtimePreservationGate.page_state_ref !==
      'contracts/app-page-state-matrix.json#pages[id=runtime].runtime_view_model.runtime_cockpit_acceptance' ||
    runtimePreservationGate.route_classification !== 'core_dynamic_agent_runtime' ||
    runtimePreservationGate.default_product_requirement !== true ||
    runtimePreservationGate.default_release_gate !== true ||
    runtimePreservationGate.adopted_shell_requirement !== true ||
    runtimePreservationGate.active_studio_navigation_requirement !== true ||
    runtimePreservationGate.active_studio_navigation_may_remove_or_weaken !== false ||
    runtimePreservationGate.explicit_validation_command !== 'npm run validate:runtime-route' ||
    !sameStrings(runtimePreservationGate.route_change_requirements, [
      'product_contract',
      'page_state_acceptance',
      'explicit_route_validator',
      'route_tests',
    ])
  ) {
    issues.add('historical interaction alignment must preserve OPL-owned capabilities and same-change reachability');
  }

  const navigationRail = record(interactionBaseline.navigation_rail);
  const railWidth = record(navigationRail.resizable_width_px);
  const desktopAffordancePolicy = record(navigationRail.desktop_affordance_policy);
  const threadDirectoryPolicy = record(navigationRail.thread_directory_policy);
  const historySearch = record(threadDirectoryPolicy.history_search);
  if (
    navigationRail.wide_desktop_default !== 'expanded' ||
    navigationRail.narrow_window_mode !== 'drawer' ||
    railWidth.min !== 280 ||
    railWidth.max !== 340 ||
    navigationRail.top_entries_scope !== 'active_opl_studio_current_product' ||
    !sameStrings(navigationRail.top_entries, ['new_task', 'app_management', 'runtime', 'scheduled_tasks', 'archived']) ||
    !sameStrings(navigationRail.conditional_entries, []) ||
    navigationRail.runtime_entry_role !==
      'opl_studio_primary_navigation_and_default_release_requirement' ||
    JSON.stringify(navigationRail.app_management_entry) !==
      JSON.stringify(appOwnedActiveStudioPrimaryNavigation.app_management_entry) ||
    JSON.stringify(navigationRail.runtime_entry) !==
      JSON.stringify(appOwnedActiveStudioPrimaryNavigation.runtime_entry) ||
    navigationRail.capabilities_mapping !==
      'capability_selection_lives_in_new_task_home_and_capability_management_lives_in_application_management_with_settings_compatibility_routes' ||
    navigationRail.legacy_capabilities_route !==
      '/capabilities redirects to /guid without deleting capability data or Settings management' ||
    !sameStrings(navigationRail.forbidden_entries_without_opl_product_capability, ['sites', 'chat']) ||
    !sameStrings(navigationRail.bottom_entries, ['account', 'help', 'settings']) ||
    !sameStrings(navigationRail.desktop_affordances, ['back', 'forward', 'previous_task', 'next_task', 'new_window']) ||
    !sameStrings(desktopAffordancePolicy.surfaces, ['application_menu', 'conversation_header']) ||
    desktopAffordancePolicy.keyboard_access_required !== true ||
    desktopAffordancePolicy.unavailable_command_state !== 'disabled' ||
    desktopAffordancePolicy.previous_next_scope !== 'visible_ordinary_conversations' ||
    desktopAffordancePolicy.new_window_scope !== 'desktop_only' ||
    desktopAffordancePolicy.webui_information_architecture_expansion_allowed !== false ||
    threadDirectoryPolicy.canonical_authority !== 'codex_app_server_thread_list_read_resume' ||
    !sameStrings(threadDirectoryPolicy.protocols, [
      'thread/list',
      'thread/read',
      'thread/resume',
      'thread/name/set',
      'thread/archive',
      'thread/unarchive',
      'thread/delete',
    ]) ||
    JSON.stringify(threadDirectoryPolicy.task_action_protocols) !==
      JSON.stringify({
        rename: 'thread/name/set',
        archive: 'thread/archive',
        restore: 'thread/unarchive',
        delete: 'thread/delete',
      }) ||
    threadDirectoryPolicy.pin_role !== 'shell_ui_metadata_only' ||
    threadDirectoryPolicy.local_reset_role !==
      'studio_local_metadata_reset_without_codex_app_server_history_reset' ||
    threadDirectoryPolicy.shell_local_storage_role !== 'drafts_preferences_and_rebuildable_cache_only' ||
    threadDirectoryPolicy.shell_thread_history_authority !== false ||
    threadDirectoryPolicy.codex_session_directory_authority !==
      'canonical_app_server_thread_overview_when_available' ||
    threadDirectoryPolicy.canonical_overview_unavailable_policy !==
      'fallback_to_shell_cache_without_reclassifying_cache_as_authority' ||
    threadDirectoryPolicy.stale_codex_acp_cache_row_policy !==
      'exclude_from_ordinary_projection_when_absent_from_available_canonical_overview' ||
    threadDirectoryPolicy.non_codex_local_row_policy !== 'preserve' ||
    threadDirectoryPolicy.workspace_directory_role !==
      'new_session_initial_cwd_projectless_adoption_grouping_and_visible_metadata_only' ||
    threadDirectoryPolicy.row_identity !== 'canonical_thread_id' ||
    threadDirectoryPolicy.duplicate_row_per_canonical_thread_allowed !== false ||
    threadDirectoryPolicy.title_based_deduplication_allowed !== false ||
    threadDirectoryPolicy.e2e_fixture_storage_policy !== 'isolated_storage_root_never_production_user_data' ||
    JSON.stringify(threadDirectoryPolicy.directory_group_policy) !== JSON.stringify(appOwnedDirectoryGroupPolicy) ||
    historySearch.placement !== 'conversation_history_heading_trailing_icon' ||
    historySearch.presentation !== 'icon_only' ||
    historySearch.accessible_name_required !== true ||
    historySearch.expanded_full_width_row_allowed !== false
  ) {
    issues.add('interaction baseline navigation rail must preserve the governed desktop and narrow-window skeleton');
  }

  const conversationScope = record(interactionBaseline.conversation_scope);
  const threadCoordination = record(interactionBaseline.thread_coordination);
  const homeTarget = record(interactionBaseline.home);
  const capabilitySelection = record(interactionBaseline.capability_selection);
  const composerTarget = record(interactionBaseline.composer);
  const explicitSessionInputPolicy = record(conversationScope.explicit_session_input_policy);
  const sessionWorkspaceModel = record(conversationScope.session_workspace_model);
  const permissionTarget = record(interactionBaseline.permission_access_mode);
  const taskSummaryTarget = record(interactionBaseline.current_task_summary_bar);
  const mobileActionSheet = record(composerTarget.mobile_action_sheet);
  const unifiedContextMenu = record(record(guiContract.ordinary_conversation).unified_context_menu);
  const sendFailureInputPolicy = record(record(guiContract.ordinary_conversation).send_failure_input_policy);
  if (JSON.stringify(sessionWorkspaceModel) !== JSON.stringify(appOwnedSessionWorkspaceModel)) {
    issues.add(
      'conversation scope must keep canonical session identity, allow one projectless adoption, and forbid bound-session reassignment',
    );
  }
  if (JSON.stringify(sendFailureInputPolicy) !== JSON.stringify(appOwnedSendFailureInputPolicy)) {
    issues.add(
      'ordinary conversation send failures must restore prompt and attachments without overwriting post-submit input',
    );
  }
  if (
    conversationScope.workspace_initialized_session_supported !== true ||
    conversationScope.projectless_conversation_supported !== true ||
    conversationScope.text_chat_without_workspace !== 'available' ||
    conversationScope.explicit_session_inputs_without_workspace !== 'available_subject_to_codex_permissions' ||
    conversationScope.workspace_directory_role !==
      'new_session_initial_cwd_projectless_adoption_sidebar_grouping_and_visible_metadata_only_not_owner_or_authorization_domain' ||
    JSON.stringify(explicitSessionInputPolicy) !== JSON.stringify(appOwnedExplicitSessionInputPolicy) ||
    'local_worktree_lifecycle' in conversationScope ||
    'project_context_inputs' in conversationScope ||
    'projectless_input_policy' in conversationScope ||
    !sameStrings(conversationScope.conversation_management, [
      'search',
      'pin',
      'rename',
      'archive',
      'restore',
      'delete',
      'reset',
    ]) ||
    conversationScope.archived_surface !== 'independent' ||
    homeTarget.title_policy !== 'modest_dynamic_prompt_in_composer_reading_lane' ||
    homeTarget.starter_limit !== null ||
    homeTarget.starter_visibility_policy !==
      'opl_standard_agent_membership_with_selectable_readiness_real_codex_route_and_default_or_user_visible_shortcuts' ||
    homeTarget.starter_order_policy !==
      'home_shortcut_preferences_sort_order_then_localized_display_name' ||
    homeTarget.shortcut_membership_source_ref !==
      'app_state.agent_packages.directory.entries' ||
    JSON.stringify(homeTarget.opl_standard_agent_membership_policy) !==
      JSON.stringify(appOwnedOplStandardAgentMembershipPolicy) ||
    homeTarget.shortcut_preference_source_ref !==
      'app_state.agent_packages.status_index.home_shortcut_preferences[]' ||
    homeTarget.unknown_standard_agent_policy !==
      'render_unknown_package_ids_only_when_they_match_opl_standard_agent_membership_without_app_allowlist' ||
    homeTarget.default_visible_shortcut_ids !== undefined ||
    homeTarget.starter_layout_policy !== 'compact_inline_wrap' ||
    record(homeTarget.visual_structure).starter_region !==
      'composer_reading_lane_immediately_above_input_not_page_navigation' ||
    record(homeTarget.visual_structure).starter_item_width !== 'content_sized' ||
    record(homeTarget.visual_structure).starter_count_layout !==
      'center_actual_visible_count_and_wrap_without_navigation_chevrons' ||
    record(homeTarget.visual_structure).composer !== 'bottom_reading_lane_with_safe_inset' ||
    record(homeTarget.visual_structure).desktop_composer_max_width_px !== 736 ||
    record(homeTarget.visual_structure).desktop_composer_min_height_px !== 98 ||
    record(homeTarget.visual_structure).desktop_composer_corner_radius_px !== 22 ||
    record(homeTarget.visual_structure).desktop_context_bar_height_px !== 52 ||
    record(homeTarget.visual_structure).desktop_context_bar_overlap_px !== 13 ||
    record(homeTarget.visual_structure).desktop_context_bar_horizontal_inset_px !== 12 ||
    record(homeTarget.visual_structure).single_centered_reading_lane_for_prompt_starters_and_composer !== true ||
    homeTarget.starter_truncation_allowed !== false ||
    record(homeTarget.workspace_selector_policy).primary_scope !== 'active_workspace_only' ||
    record(homeTarget.workspace_selector_policy).inactive_recent_directories_visible !== false ||
    record(homeTarget.workspace_selector_policy).management_entry !== 'registered_directories_modal' ||
    record(homeTarget.workspace_selector_policy).management_scope !== 'registered_workspaces' ||
    record(homeTarget.workspace_selector_policy).selection_effect !== 'set_new_session_initial_cwd_only' ||
    record(homeTarget.workspace_selector_policy).unregister_effect !== 'remove_registration_only' ||
    record(homeTarget.workspace_selector_policy).filesystem_delete_allowed !== false ||
    record(homeTarget.workspace_selector_policy).active_conversation_change_on_unregister !== false ||
    record(homeTarget.workspace_selector_policy).session_ownership_effect !== 'none' ||
    record(homeTarget.workspace_selector_policy).cascade_session_delete_allowed !== false ||
    record(homeTarget.home_shortcut_mutation_policy).pending_scope !== 'single_shortcut' ||
    record(homeTarget.home_shortcut_mutation_policy).pending_key !== 'shortcut_id' ||
    record(homeTarget.home_shortcut_mutation_policy).other_shortcuts_remain_interactive !== true ||
    record(homeTarget.home_shortcut_mutation_policy).readback_mode !== 'background_no_page_loading' ||
    !sameStrings(capabilitySelection.selection_surfaces, [
      'home_starter',
      'home_new_session_capability_palette',
      'home_new_session_at_mention_agent_selector',
    ]) ||
    capabilitySelection.primary_selection_surface !== 'home_starter' ||
    capabilitySelection.palette_selection_scope !== 'new_session_before_first_send_only' ||
    capabilitySelection.selection_equivalence_policy !==
      'same_active_capability_identity_and_send_time_readiness_gate' ||
    capabilitySelection.selection_cancellation_policy !==
      'return_to_no_active_capability_without_changing_executor_workspace_or_draft' ||
    capabilitySelection.starter_palette_selection_sync !==
      'one_active_capability_state_bidirectionally_reflected' ||
    capabilitySelection.management_surface !== 'app_management' ||
    capabilitySelection.legacy_route_policy !== '/capabilities_redirects_to_home_without_mounting_a_selection_page' ||
    capabilitySelection.composer_persistent_variable_selector !== false ||
    capabilitySelection.composer_context_surface !== 'active_capability_chip' ||
    capabilitySelection.contextual_change_scope !== 'new_session_before_first_send_only' ||
    capabilitySelection.agent_reference_admission_policy_ref !==
      'ordinary_capability_selector_policy.agent_reference_admission_policy' ||
    composerTarget.placement !== 'floating_bottom_with_safe_inset' ||
    !sameStrings(composerTarget.persistent_context, ['active_capability']) ||
    !sameStrings(composerTarget.send_scoped_inputs, ['attachments']) ||
    composerTarget.send_scoped_consumption_policy !== 'consumed_by_current_send_not_persisted_in_context_strip' ||
    !sameStrings(composerTarget.forbidden_persistent_context, [
      'project',
      'workspace',
      'locality',
      'branch',
      'attachments',
      'workspace_context_refs',
    ]) ||
    !sameStrings(composerTarget.desktop_action_row, [
      'unified_context_menu',
      'permission_access_mode',
      'model_reasoning',
      'send_stop',
    ]) ||
    !sameStrings(mobileActionSheet.allowed_actions, [
      'unified_context_menu',
      'permission_access_mode',
      'model_reasoning',
      'active_capability',
    ]) ||
    !sameStrings(mobileActionSheet.forbidden_actions, ['backend', 'provider', 'team', 'raw_mcp', 'arbitrary_skills']) ||
    mobileActionSheet.send_stop_location !== 'composer_primary_action_outside_sheet' ||
    composerTarget.unified_context_menu_ref !== 'ordinary_conversation.unified_context_menu' ||
    JSON.stringify(unifiedContextMenu) !== JSON.stringify(appOwnedUnifiedContextMenu) ||
    record(guiContract.ordinary_conversation).composer_placeholder_policy !==
      'opl_owned_localized_task_prompt_without_backend_name_interpolation' ||
    composerTarget.model_reasoning_control !== 'single_compact_menu' ||
    !sameStrings(permissionTarget.visible_on, ['home_composer', 'conversation_composer']) ||
    permissionTarget.provider_or_backend_terms_visible !== false ||
    taskSummaryTarget.placement !== 'message_timeline' ||
    taskSummaryTarget.single_instance !== true ||
    taskSummaryTarget.default_mode !== 'inline_unpinned' ||
    !sameStrings(taskSummaryTarget.sticky_when, ['user_pinned', 'long_running_true']) ||
    taskSummaryTarget.ordinary_task_sticky !== false ||
    taskSummaryTarget.long_running_signal_field !== 'long_running' ||
    taskSummaryTarget.duplicate_surface_allowed !== false ||
    !sameStrings(taskSummaryTarget.fields, ['status', 'elapsed', 'progress', 'next_action', 'stop'])
  ) {
    issues.add('interaction baseline Home, conversation, composer, Agents management, and task summary markers must match the App target');
  }

  const pageStates = Array.isArray(pageStateMatrix.pages) ? pageStateMatrix.pages.map(record) : [];
  const guidHomePage = pageStates.find((page) => page.id === 'guid_home') ?? {};
  const guidHomeViewModel = record(record(guidHomePage).home_view_model);
  const ordinaryConversationPage = pageStates.find((page) => page.id === 'ordinary_conversation') ?? {};
  const ordinaryConversationPaletteViewModel = record(record(ordinaryConversationPage).conversation_view_model);
  if (
    JSON.stringify(record(ordinaryConversationPaletteViewModel.unified_context_menu)) !==
    JSON.stringify(appOwnedUnifiedContextMenu)
  ) {
    issues.add('page-state ordinary conversation must carry the exact App-owned capability palette contract');
  }
  const subagentPolicyJson = JSON.stringify(appOwnedCodexSubagentActivityPolicy);
  if (
    JSON.stringify(record(record(profile.gui).ordinary_conversation).codex_subagent_activity) !== subagentPolicyJson ||
    JSON.stringify(record(guiContract.ordinary_conversation).codex_subagent_activity) !== subagentPolicyJson ||
    JSON.stringify(record(record(ordinaryConversationPage).conversation_view_model).codex_subagent_activity) !==
      subagentPolicyJson
  ) {
    issues.add('Codex subagent activity must stay a read-only single-adapter projection without private orchestration');
  }
  if ('new_task_locality' in guidHomeViewModel || 'local_worktree_lifecycle_ref' in guidHomeViewModel) {
    issues.add('Guid Home must keep workspace selection limited to the new task initial cwd');
  }
  if (
    !stringArray(record(guidHomePage).must_show).includes(
      'history search as one accessible icon at the trailing edge of the conversation-history heading',
    ) ||
    !stringArray(record(guidHomePage).must_not_show).includes(
      'standalone full-width conversation-history search row',
    )
  ) {
    issues.add('Guid Home rail must place one accessible icon-only search action in the conversation-history heading');
  }
  const requiredThreadProtocols = [
    'thread/list',
    'thread/read',
    'thread/start',
    'thread/resume',
    'thread/fork',
    'thread/archive',
  ];
  const forbiddenThreadKeys = [
    'model_tool_access_evidence_boundary',
    'same_agent_tree_transport',
    'dispatch_policy',
    'delivery_request_defaults',
    'turn_start_inheritance_policy',
    'interactive_server_request_policy',
    'idempotency_policy',
    'cross_host_policy',
    'audit_fields',
  ];
  const channelThreadBinding = record(threadCoordination.channel_thread_binding);
  if (
    threadCoordination.product_role !== 'user_initiated_codex_app_server_thread_operations' ||
    threadCoordination.adapter !== 'single_codex_app_server_adapter' ||
    threadCoordination.entry_surface !== 'existing_thread_directory_and_user_actions' ||
    threadCoordination.ordinary_navigation_visible !== false ||
    threadCoordination.model_tool_access !== false ||
    threadCoordination.user_initiated_only !== true ||
    threadCoordination.protocol_owner !== 'codex_core_app_server' ||
    threadCoordination.thread_store_owner !== 'codex_core_app_server' ||
    threadCoordination.thread_turn_authority !== 'codex_core_app_server' ||
    !requiredThreadProtocols.every((protocol) => stringArray(threadCoordination.supported_protocols).includes(protocol)) ||
    threadCoordination.state_authority !== 'codex_app_server' ||
    threadCoordination.plain_conversation_policy !== 'opl_studio_codex_native_app_server' ||
    !sameStrings(threadCoordination.forbidden_private_layers, [
      'second_json_rpc_client',
      'jsonl_coordination_audit_store',
      'coordination_idempotency_or_replay_ledger',
      'write_set_advisory_control_plane',
      'model_delivery_or_dynamic_thread_tools',
      'pending_server_request_control_plane',
      'independent_coordination_page',
      'cross_host_task_handoff',
    ]) ||
    JSON.stringify(Object.keys(channelThreadBinding).sort()) !== JSON.stringify([
      'binding_key_fields',
      'binding_key_normalization_or_inference_allowed',
      'binding_value_fields',
      'initial_binding_transport',
      'mismatch_policy',
      'restart_recovery_transport',
      'second_session_truth_allowed',
      'shell_persistence_role',
      'shell_thread_id_inference_allowed',
      'source_ref',
      'thread_turn_authority',
      'unknown_binding_policy',
    ]) ||
    !sameStrings(channelThreadBinding.binding_key_fields, [
      'provider_id',
      'account_id',
      'channel_session_id',
    ]) ||
    !sameStrings(channelThreadBinding.binding_value_fields, [
      'canonical_thread_host',
      'canonical_thread_id',
    ]) ||
    channelThreadBinding.source_ref !==
      'contracts/app-runtime-bridge.json#canonical_conversation_continuity_policy.transport_binding_projection' ||
    channelThreadBinding.initial_binding_transport !==
      'thread_start_then_exact_thread_read_then_persist_binding' ||
    channelThreadBinding.restart_recovery_transport !==
      'exact_binding_lookup_then_thread_read_then_thread_resume_same_threadId' ||
    channelThreadBinding.thread_turn_authority !== 'codex_core_app_server' ||
    channelThreadBinding.shell_persistence_role !==
      'exact_binding_only_not_thread_history_turn_state_or_session_truth' ||
    channelThreadBinding.unknown_binding_policy !==
      'fail_closed_without_thread_start_or_thread_id_inference_during_recovery' ||
    channelThreadBinding.mismatch_policy !==
      'fail_closed_without_rebind_merge_overwrite_or_turn_start' ||
    channelThreadBinding.binding_key_normalization_or_inference_allowed !== false ||
    channelThreadBinding.shell_thread_id_inference_allowed !== false ||
    channelThreadBinding.second_session_truth_allowed !== false ||
    forbiddenThreadKeys.some((key) => key in threadCoordination) ||
    pageStates.some((page) => page.id === 'thread_coordination')
  ) {
    issues.add('thread operations must use one user-initiated Codex App Server adapter without a private coordination control plane');
  }

  const contextSurfaces = record(interactionBaseline.context_surfaces);
  const artifactPreview = record(interactionBaseline.artifact_preview);
  const ordinaryConversationViewModel = record(record(ordinaryConversationPage).conversation_view_model);
  const pageArtifactPreview = record(ordinaryConversationViewModel.artifact_preview);
  const conversationArtifactPreview = record(record(guiContract.ordinary_conversation).artifact_preview);
  const environmentPopover = record(contextSurfaces.environment_popover);
  const sidePanel = record(contextSurfaces.side_panel);
  const reviewPane = record(contextSurfaces.review_pane);
  const reviewCapabilityStatus = record(reviewPane.source_capability_status);
  const rightContextInspectorPage = pageStates.find((page) => page.id === 'right_context_inspector') ?? {};
  const pageReviewPane = record(record(record(rightContextInspectorPage).inspector_view_model).review_surface);
  const settingsShell = record(interactionBaseline.settings_shell);
  const visualTarget = record(interactionBaseline.visual_target);
  const lightSurfaces = record(visualTarget.light_surfaces);
  const darkSurfaces = record(visualTarget.dark_surfaces);
  const accessibility = record(visualTarget.accessibility);
  const visualTypography = record(visualTarget.typography);
  const conversationRendering = record(visualTarget.conversation_rendering);
  const targetDefinitionRole = 'opl_target_translation_not_literal_codex_observation';
  if (
    oplTargetTranslation
      .filter((key) => key !== 'visual_target')
      .some((key) => record(interactionBaseline[key]).definition_role !== targetDefinitionRole) ||
    visualTarget.definition_role !== 'opl_projection_of_pinned_deepseek_harness_visual_source'
  ) {
    issues.add('OPL interaction targets must remain separate from Codex observations and bind visual_target to the pinned DSH source');
  }
  if (
    'environment_workspace_handoff' in ordinaryConversationViewModel ||
    'environment_workspace_handoff' in record(guiContract.ordinary_conversation)
  ) {
    issues.add('ordinary conversation Environment must remain read-only without workspace handoff state');
  }
  if (
    artifactPreview.surface !== 'opl_studio_preview_context_and_panel' ||
    !sameStrings(artifactPreview.entry_sources, [
      'session_attachment_ref',
      'conversation_result_ref',
      'explicit_absolute_local_path',
    ]) ||
    !sameStrings(artifactPreview.supported_content_types, ['markdown', 'pdf', 'code', 'image', 'html', 'diff']) ||
    !sameStrings(artifactPreview.markdown_embedded_renderers, ['mermaid', 'katex', 'code']) ||
    artifactPreview.ref_resolution_policy !==
      'explicit_session_attachment_or_conversation_result_ref_or_user_selected_legal_absolute_local_path_without_copying_artifact_body' ||
    JSON.stringify(artifactPreview.session_reference_policy) !== JSON.stringify({
      attachment_ref_scope: 'current_session_explicit_attachment_only',
      conversation_result_ref_scope: 'current_session_visible_result_only',
      workspace_membership_required: false,
      implicit_workspace_ref_allowed: false,
    }) ||
    record(artifactPreview.explicit_local_path_policy).user_initiated_only !== true ||
    record(artifactPreview.explicit_local_path_policy).path_form !== 'legal_absolute_local_file_path' ||
    record(artifactPreview.explicit_local_path_policy).workspace_membership_required !== false ||
    record(artifactPreview.explicit_local_path_policy).access_authority !== 'codex_permission_approval_and_sandbox' ||
    record(artifactPreview.explicit_local_path_policy).automatic_silent_read_allowed !== false ||
    'project_context_ref_policy' in artifactPreview ||
    !sameStrings(artifactPreview.forbidden_inputs, [
      'relative_parent_traversal',
      'illegal_or_unsupported_scheme',
      'automatic_silent_read',
      'implicit_workspace_context_ref',
    ]) ||
    artifactPreview.artifact_body_authority !== 'external_owner_ref_only' ||
    artifactPreview.keyboard_reachable_open_action !== true ||
    artifactPreview.failure_policy !== 'keep_ref_visible_and_fail_closed_with_reason' ||
    artifactPreview.unsafe_or_unsupported_ref_policy !== 'do_not_open_or_guess_content' ||
    JSON.stringify(pageArtifactPreview) !== JSON.stringify({
      surface: artifactPreview.surface,
      entry_sources: artifactPreview.entry_sources,
      supported_content_types: artifactPreview.supported_content_types,
      markdown_embedded_renderers: artifactPreview.markdown_embedded_renderers,
      ref_resolution_policy: artifactPreview.ref_resolution_policy,
      session_reference_policy: artifactPreview.session_reference_policy,
      explicit_local_path_policy: artifactPreview.explicit_local_path_policy,
      forbidden_inputs: artifactPreview.forbidden_inputs,
      artifact_body_authority: artifactPreview.artifact_body_authority,
      keyboard_reachable_open_action: artifactPreview.keyboard_reachable_open_action,
      failure_policy: artifactPreview.failure_policy,
      unsafe_or_unsupported_ref_policy: artifactPreview.unsafe_or_unsupported_ref_policy,
    }) ||
    JSON.stringify(conversationArtifactPreview) !== JSON.stringify(pageArtifactPreview)
  ) {
    issues.add('artifact preview must reuse the existing Preview surface through a ref-only fail-closed adapter');
  }
  if (
    !sameStrings(environmentPopover.primary_fields, ['workspace', 'locality', 'branch', 'changes', 'subtasks', 'sources']) ||
    !sameStrings(environmentPopover.secondary_ref_fields, ['artifact_refs', 'evidence_refs', 'receipt_refs']) ||
    environmentPopover.render_policy !== 'real_non_empty_values_only' ||
    sidePanel.default_state !== 'closed' ||
    sidePanel.default_third_column_visible !== false ||
    sidePanel.workspace_surface !== 'files_changes' ||
    sidePanel.preview_surface !== 'independent' ||
    sidePanel.terminal_browser_entry_policy !== 'environment_or_task_need_only' ||
    sidePanel.equal_weight_tool_taxonomy_allowed !== false ||
    sidePanel.runtime_duplicate_allowed !== false ||
    reviewPane.host_surface !== 'existing_files_changes_diff_surface' ||
    reviewPane.default_state !== 'closed' ||
    reviewPane.opens_on_user_request !== true ||
    !sameStrings(reviewPane.review_targets, ['uncommitted', 'base_branch', 'commit', 'custom']) ||
    !sameStrings(reviewPane.delivery_modes, ['inline', 'detached']) ||
    reviewPane.default_section !== 'unstaged' ||
    !sameStrings(reviewPane.sections, ['unstaged', 'staged', 'commit', 'branch', 'last_turn']) ||
    !sameStrings(reviewPane.capabilities, [
      'pull_request_context',
      'inline_comments',
      'stage',
      'commit',
      'push',
    ]) ||
    reviewPane.source_status !==
      'partial_last_turn_and_custom_target_instructions_implemented_review_focus_and_inline_comments_protocol_blocked' ||
    reviewCapabilityStatus.last_turn !== 'source_implemented_existing_message_store' ||
    reviewCapabilityStatus.review_focus_context !==
      'source_blocked_missing_public_review_focus_protocol' ||
    reviewCapabilityStatus.inline_comments !== 'source_blocked_missing_typed_codex_protocol' ||
    reviewPane.last_turn_source_policy !==
      'latest_visible_user_message_then_completed_workspace_edit_tool_calls' ||
    reviewPane.review_focus_delivery_policy !==
      'custom_target_instructions_via_review_start_target_custom_only_non_custom_focus_not_exposed' ||
    reviewPane.review_focus_failure_policy !==
      'non_custom_focus_protocol_unavailable_before_review_start_without_turn_steer_fallback_fake_success_audit_or_side_effects' ||
    reviewPane.inline_comment_protocol_requirement !==
      'typed_codex_app_server_file_line_comment_request_location_and_failure_semantics' ||
    !sameStrings(reviewPane.inline_comment_forbidden_fallbacks, ['shell_local_annotation_store', 'fake_success']) ||
    reviewPane.pull_request_context_dependency !== 'gh' ||
    reviewPane.pull_request_context_unavailable_policy !== 'show_explicit_unavailable_state' ||
    reviewPane.git_authority !== 'existing_codex_git_integration' ||
    reviewPane.shell_role !== 'thin_adapter_only' ||
    reviewPane.duplicate_git_store_allowed !== false ||
    reviewPane.legacy_equal_weight_review_tab_allowed !== false ||
    JSON.stringify(pageReviewPane) !== JSON.stringify(reviewPane) ||
    'primary_tools' in sidePanel ||
    'secondary_sections' in sidePanel ||
    !sameStrings(sidePanel.legacy_taxonomy_ids_forbidden, [
      'review',
      'terminal',
      'browser',
      'files',
      'artifacts',
      'runtime',
      'actions',
      'memory',
    ]) ||
    !sameStrings(contextSurfaces.advanced_work_surfaces, ['files_changes', 'preview', 'terminal', 'browser']) ||
    contextSurfaces.advanced_work_surfaces_default !== 'closed' ||
    settingsShell.frame !== 'codex_full_window_return_search_grouped_rows' ||
    settingsShell.information_architecture !== 'existing_opl_settings_ia_unchanged' ||
    settingsShell.role !== 'maintenance_only' ||
    settingsShell.home_or_conversation_structure_authority !== false ||
    settingsShell.settings_objects_or_model_policy_changed_by_41301 !== false ||
    settingsShell.installer_or_runtime_truth_authority !== false ||
    visualTarget.machine_authority !== 'this_object_only_shell_and_human_docs_are_derived' ||
    visualTarget.source_cohort_ref !== visualSourceCohortPath ||
    visualTarget.theme_selector !== 'body[data-ds-dark-theme]' ||
    visualTarget.main_canvas !== 'var(--dsw-alias-bg-base)' ||
    JSON.stringify(lightSurfaces) !==
      JSON.stringify({
        main_canvas: 'var(--dsw-alias-bg-base)',
        navigation_rail: 'var(--dsw-specific-sidebar-fill)',
        bounded_surface: 'var(--dsw-alias-bg-layer-1)',
        hover_row: 'var(--dsw-alias-interactive-bg-hover)',
        selected_row: 'var(--dsw-specific-sidebar-nav-item-active)',
        text_primary: 'var(--dsw-alias-label-primary)',
        text_secondary: 'var(--dsw-alias-label-secondary)',
        text_muted: 'var(--dsw-alias-label-secondary)',
        hairline_border: 'var(--dsw-alias-border-l2)',
        focus_ring: 'var(--dsw-alias-state-business-primary)',
        composer_shadow: 'var(--dsw-shadow-lv2)',
      }) ||
    JSON.stringify(darkSurfaces) !==
      JSON.stringify({
        main_canvas: 'var(--dsw-alias-bg-base)',
        navigation_rail: 'var(--dsw-specific-sidebar-fill)',
        bounded_surface: 'var(--dsw-alias-bg-layer-1)',
        hover_row: 'var(--dsw-alias-interactive-bg-hover)',
        selected_row: 'var(--dsw-specific-sidebar-nav-item-active)',
        text_primary: 'var(--dsw-alias-label-primary)',
        text_secondary: 'var(--dsw-alias-label-secondary)',
        text_muted: 'var(--dsw-alias-label-secondary)',
        hairline_border: 'var(--dsw-alias-border-l2)',
        focus_ring: 'var(--dsw-alias-state-business-primary)',
        composer_shadow: 'var(--dsw-shadow-lv2)',
      }) ||
    visualTarget.rail_and_subtle_surfaces !== 'neutral_gray' ||
    visualTarget.composer !== 'floating_or_bottom_safe_inset' ||
    visualTarget.composer_elevation !== 'single_outline_with_restrained_shadow' ||
    JSON.stringify(visualTypography) !==
      JSON.stringify({
        ui_font_stack: 'var(--dsw-font-family)',
        control_font_policy: 'inherit_the_pinned_dsh_font_family_or_explicit_user_preference',
        app_chrome: 'var(--dsw-font-xs-13)_or_var(--dsw-font-xs-strong-13)',
        conversation: 'var(--dsw-font-markdown-base)',
        body: 'var(--dsw-font-s-14)',
        label: 'var(--dsw-font-xs-strong-13)',
        page_title: 'var(--dsw-font-l-20)',
        metadata: 'var(--dsw-font-xxs-12)',
        code: 'var(--dsw-font-markdown-code-block-small)',
        letter_spacing_px: 0,
      }) ||
    JSON.stringify(conversationRendering) !==
      JSON.stringify({
        timeline: 'single_column_reading_lane',
        assistant_surface: 'unframed',
        user_surface: 'lightweight_bounded',
        markdown_default_typography: '14/24/400',
        paragraph_margin_block_px: 10,
        list_item_margin_block_px: 2,
        inline_code: 'subtle_neutral_capsule_12_18',
        tool_event: 'compact_localized_disclosure_row_without_card_background',
        process_and_file_events:
          'compact_localized_unframed_disclosure_rows_with_file_changes_collapsed_by_default',
        message_actions: 'hover_or_focus_revealed_without_permanent_32px_blank_row',
        loading_skeleton: 'unframed_text_lines_without_bordered_message_bubbles',
      }) ||
    ordinaryConversationViewModel.conversation_rendering_ref !==
      'contracts/app-gui-product-contract.json#interaction_baseline.visual_target.conversation_rendering' ||
    visualTarget.settings_icon_policy !==
      'pinned_dsh_icon_cohort_14_16px_currentcolor_with_color_reserved_for_typed_status' ||
    visualTarget.settings_surface_policy !==
      'ordinary_pages_use_unframed_sections_flat_rows_and_hairline_dividers_bounded_cards_only_for_repeated_entities_or_confirmation' ||
    visualTarget.accent_scope !==
      'brand_typed_status_and_actions_only_not_ordinary_rail_selection_or_settings_icons' ||
    visualTarget.opl_brand_identity_retained !== true
  ) {
    issues.add('interaction baseline must reject the legacy equal-weight inspector taxonomy and keep Settings in maintenance');
  }
  if (
    accessibility.ordinary_text_min_contrast_ratio !== 4.5 ||
    accessibility.large_text_non_text_and_focus_indicator_min_contrast_ratio !== 3 ||
    !sameStrings(accessibility.source_regression_scope, [
      'semantic_light_dark_muted_text_contrast',
      'semantic_light_dark_focus_indicator_contrast',
      'keyboard_focus_aria_escape_and_reduced_motion',
    ]) ||
    accessibility.source_evidence_closes_pixel_or_install !== false ||
    !sameStrings(accessibility.remaining_evidence, [
      'real_screen_reader_traversal',
      'complete_rendered_keyboard_traversal',
      'rendered_contrast_across_supported_surfaces',
      'installed_app_readback',
    ])
  ) {
    issues.add('B0-14 accessibility contract must keep WCAG thresholds and source evidence separate from Pixel and Install');
  }
}
