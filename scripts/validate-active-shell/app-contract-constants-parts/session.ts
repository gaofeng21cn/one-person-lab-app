import { appOwnedOplStandardAgentMembershipPolicy } from './home.ts';

export const appOwnedSessionWorkspaceModel = {
  primary_unit: "session_backed_by_codex_thread_id",
  identity_authority: "codex_core_app_server_thread_id",
  project_affinity_states: ["unbound", "bound"],
  project_affinity_cardinality: "zero_or_one",
  projectless_session_semantics:
    "no_user_selected_project_affinity_not_no_runtime_cwd",
  projectless_detection:
    "explicit_project_id_absent_defines_unbound_identity_while_managed_scratch_recorded_cwd_including_user_documents_codex_and_user_codex_worktrees_never_creates_directory_group",
  recorded_cwd_role:
    "canonical_runtime_workspace_and_derived_directory_group_fallback_when_explicit_project_id_absent_and_not_managed_scratch",
  project_affinity_source: "opl_studio_versioned_ui_metadata_keyed_by_canonical_thread_id",
  project_affinity_role:
    "explicit_project_id_wins_for_sidebar_grouping_non_managed_scratch_recorded_cwd_only_supplies_derived_directory_group",
  managed_scratch_presentation:
    "user_documents_codex_and_user_codex_worktrees_subtrees_preserve_recorded_cwd_and_render_unbound_without_leaf_directory_project_groups",
  workspace_binding_role:
    "new_session_initial_cwd_and_explicit_project_affinity_assignment_are_distinct",
  workspace_path_projection: {
    picker_result: "host_path_and_canonical_runtime_path",
    host_path_role: "native_picker_display_only_not_conversation_payload",
    runtime_path_role:
      "canonical_new_session_cwd_recent_workspace_value_and_backend_payload",
    windows_projection: "opl_linux_distribution_bound_wslpath",
    non_windows_projection: "host_path_equals_runtime_path",
    native_windows_backend_fallback_allowed: false,
    generic_local_picker_projection_allowed: false,
  },
  runtime_pwd_role:
    "turn_cwd_or_command_pwd_execution_context_not_persisted_as_project_affinity",
  turn_cwd_override_allowed: true,
  writable_roots_role:
    "sandbox_permission_surface_independent_of_project_affinity",
  core_workspace_application:
    "thread_resume_or_turn_start_cwd_records_runtime_workspace_only",
  runtime_pwd_changes_project_affinity: false,
  project_affinity_changes_writable_roots: false,
  project_adoption_transition:
    "unbound_to_bound_once_via_versioned_ui_metadata_assignment",
  bound_project_reassignment: "not_exposed",
  workspace_owns_session: false,
  workspace_owns_context: false,
  workspace_owns_artifacts: false,
  workspace_group_cascade_session_delete_allowed: false,
};
export const appOwnedDirectoryGroupPolicy = {
  source:
    "opl_studio_versioned_ui_metadata_affinity_else_non_managed_scratch_canonical_recorded_cwd_joined_by_canonical_thread_id",
  role: "presentation_new_session_cwd_shortcut_and_projectless_adoption_only",
  owns_sessions: false,
  owns_context: false,
  owns_artifacts: false,
  group_delete_action_allowed: false,
  cascade_session_delete_allowed: false,
  new_session_action_language: "use_this_working_directory_not_create_project_child",
  project_directory_cardinality:
    "one_explicit_project_affinity_or_one_derived_recorded_cwd_group_per_canonical_thread",
  recorded_cwd_compatibility_policy:
    "non_managed_scratch_recorded_cwd_supplies_derived_directory_group_without_creating_or_blocking_project_affinity",
  derived_group_registered_workspace_mutation_allowed: false,
  managed_scratch_recorded_cwd_grouping_allowed: false,
  git_origin_url_project_identity_allowed: false,
  turn_cwd_reclassifies_bound_session: false,
  project_adoption_policy: {
    eligible_state:
      "canonical_thread_id_present_and_versioned_ui_affinity_absent",
    triggers: ["drag_to_directory_group", "keyboard_move_to_project_action"],
    destination_policy:
      "one_user_selected_canonical_project_directory_independent_of_explicit_inputs_turn_cwd_and_writable_roots",
    result:
      "persist_versioned_ui_project_affinity_keyed_by_canonical_thread_id_without_claiming_app_server_project_id",
    assignment_commit_policy:
      "only_after_canonical_thread_id_readback_then_versioned_ui_metadata_writeback_with_recorded_cwd_unchanged",
    transport:
      "single_active_codex_app_server_adapter_plus_versioned_ui_metadata_store",
    core_workspace_application:
      "thread_read_exact_canonical_thread_id_then_versioned_ui_metadata_projection_without_app_server_project_id_writeback",
    turn_or_command_pwd_requirement:
      "never_used_for_project_affinity_eligibility_or_ui_metadata_readback",
    assignment_failure_policy:
      "keep_unbound_conversation_available_and_show_lightweight_error",
    canonical_project_id_assignment_allowed: false,
    canonical_project_id_exact_readback_required: false,
    versioned_ui_affinity_writeback_allowed: true,
    versioned_ui_affinity_exact_thread_id_readback_required: true,
    recorded_runtime_cwd_preservation_required: true,
    recorded_runtime_cwd_blocks_assignment: false,
    runtime_workspace_roots_mutation_allowed: false,
    bound_session_reassignment_allowed: false,
    private_pending_deferred_revision_state_allowed: false,
  },
};
export const appOwnedExplicitSessionInputPolicy = {
  scope: "current_session_composer",
  surfaces: [
    "attachments",
    "local_file_picker",
    "local_directory_picker",
    "paste",
    "drop",
    "/open",
  ],
  selection_scope: "any_user_selected_local_file_or_directory",
  workspace_required: false,
  access_authority: "codex_permission_approval_and_sandbox_only",
  shell_extra_path_authorization_allowed: false,
  user_initiated_only: true,
  workspace_preload_allowed: false,
  workspace_scoped_persistence_allowed: false,
  implicit_workspace_context_injection_allowed: false,
  composer_consumption: "current_send_only",
  composer_persistence_after_send: "none",
  workspace_readiness_boundary: {
    gates: ["project_selection", "opl_workspace_controls"],
    plain_local_conversation_requires_workspace_root: false,
    send_scoped_local_file_inputs_require_workspace_root: false,
    agent_package_workspace_requirement_policy:
      "package_manifest_declared_workspace_or_managed_target_only",
    ordinary_codex_conversation_independent_of_agent_package_readiness: true,
    codex_and_model_prerequisites_unchanged: true,
  },
};
export const appOwnedUnifiedContextMenu = {
  trigger: "+",
  placement: "composer_leading_action",
  trigger_dispatch_policy:
    "always_open_palette_never_directly_invoke_file_picker",
  direct_file_picker_fallback_allowed: false,
  shared_desktop_mobile_content: true,
  presentation: "searchable_grouped_scrollable_capability_palette",
  searchable: true,
  search_field_policy:
    "visible_top_field_filters_name_description_and_aliases",
  keyboard_navigation: true,
  keyboard_commands: ["ArrowDown", "ArrowUp", "Home", "End", "Enter", "Escape"],
  escape_focus_return: "plus_trigger",
  query_fields: ["localized_name", "localized_description", "aliases"],
  desktop_panel_width_policy: "match_composer_outer_width",
  desktop_panel_max_width_px: 736,
  desktop_panel_alignment: "above_composer_with_outer_edges_aligned",
  mobile_panel_policy: "viewport_bounded_sheet_with_safe_area",
  item_content_policy:
    "stable_icon_slot_localized_name_and_optional_localized_description",
  group_heading_policy: "localized_heading_for_each_rendered_group",
  viewport_policy: "bounded_height_with_internal_scroll_and_no_composer_overlap",
  scroll_region_policy:
    "single_internal_vertical_scroll_region_with_stable_scrollbar_gutter",
  empty_state_policy:
    "keep_real_local_input_actions_visible_and_never_fabricate_capabilities",
  capability_catalog_empty_policy:
    "open_palette_with_local_inputs_and_truthful_management_fallbacks",
  groups: [
    {
      id: "local_inputs",
      scope: "current_send_only",
      source: "user_selected_local_paths",
      surface_actions: {
        home_new_session: ["attach_file", "attach_folder"],
        existing_conversation: ["attach_file", "attach_folder"],
      },
    },
    {
      id: "agent_packages",
      scope: "new_session_configuration_or_existing_turn_invocation",
      label_i18n: {
        "zh-CN": "OPL 标准智能体",
        "en-US": "OPL standard agents",
      },
      source_ref:
        "app_state.agent_packages.directory.entries",
      catalog_membership_source_ref:
        "app_state.agent_packages.directory.entries",
      opl_standard_agent_membership_policy: appOwnedOplStandardAgentMembershipPolicy,
      status_source_ref: "app_state.agent_packages.status_index.packages[]",
      catalog_order_policy:
        "home_shortcut_preferences_sort_order_then_localized_display_name",
      home_shortcut_independence_policy:
        "render_the_complete_opl_standard_agent_catalog_regardless_of_home_shortcut_visibility_or_order",
      availability_policy:
        "render_only_membership_matches_and_join_by_package_id_for_fresh_readiness_without_app_allowlist",
      action_policy:
        "render_only_directory_available_actions_and_recommended_action_ref",
      unknown_standard_agent_policy:
        "include_unknown_package_ids_only_when_they_match_opl_standard_agent_membership",
      existing_session_rebinding_allowed: false,
      existing_conversation_invocation_policy:
        "invoke_selected_standard_agent_for_current_turn_without_rebinding_the_codex_thread",
      surface_actions: {
        home_new_session: ["select_new_session_agent_package"],
        existing_conversation: ["invoke_agent_package_for_current_turn"],
      },
    },
    {
      id: "opl_capabilities",
      scope: "current_turn_invocation_only",
      label_i18n: {
        "zh-CN": "OPL 能力",
        "en-US": "OPL capabilities",
      },
      source_ref:
        "app_state.agent_packages.directory.entries + ordinary_capability_selector_policy",
      membership_policy:
        "official_OPL_non_standard_agent_packages_with_enabled_required_skills_projected_by_the_active_adapter",
      package_entry_cardinality:
        "one_shortcut_per_package_using_first_enabled_required_skill",
      duplicate_package_entries_for_multiple_required_skills: false,
      availability_policy:
        "render_only_owner_or_carrier_projected_skill_matches_without_app_package_allowlist",
      activation_policy:
        "skill_injection_for_current_turn_only_no_package_activation_or_lifecycle_mutation",
      thread_ownership_policy:
        "does_not_change_codex_thread_agent_identity_or_create_a_second_scheduler",
      existing_session_rebinding_allowed: false,
      surface_actions: {
        home_new_session: ["invoke_opl_capability_for_current_turn"],
        existing_conversation: ["invoke_opl_capability_for_current_turn"],
      },
    },
    {
      id: "skills",
      scope: "surface_specific_configuration_or_invocation",
      source_ref: "ordinary_capability_selector_policy",
      availability_policy:
        "show_owner_or_carrier_projected_skills_without_an_agent_then_scope_to_the_selected_agent_package_projection",
      agent_owned_skill_deduplication_policy:
        "on_home_new_session_exclude_required_skill_ids_owned_by_rendered_professional_agents_from_the_standalone_skills_group",
      existing_session_rebinding_allowed: false,
      surface_actions: {
        home_new_session: ["configure_new_session_scoped_skill"],
        existing_conversation: ["invoke_loaded_owner_or_carrier_projected_skill"],
      },
    },
    {
      id: "session_modes",
      scope: "active_session_mode_only",
      source_ref: "active_adapter.session_modes",
      availability_policy:
        "hide_group_when_no_adapter_reported_nonduplicate_mode_is_available",
      mode_deduplication_policy: "exclude_permission_access_equivalent_modes",
      surface_actions: {
        home_new_session: ["select_active_adapter_reported_mode"],
        existing_conversation: ["select_active_adapter_reported_mode"],
      },
    },
    {
      id: "apps_and_connections",
      scope: "surface_specific_selection_or_status",
      source_ref:
        "ordinary_capability_selector_policy.configured_mcp_servers_after_negative_filter",
      availability_policy:
        "hide_group_when_no_non_forbidden_configured_session_connection_is_available",
      label_policy: "localized_product_name_never_raw_mcp_or_provider_id",
      existing_session_rebinding_allowed: false,
      surface_actions: {
        home_new_session: ["select_new_session_configured_app_or_connection"],
        existing_conversation: ["show_loaded_configured_connection_status"],
      },
    },
  ],
  selected_context_presentation: {
    workspace_or_initial_cwd: "not_rendered_palette_context_bar_owned",
    attachments: "existing_send_scoped_attachment_chips",
    agent_packages_skills_modes_and_connections:
      "compact_session_context_chips_only_when_selected",
  },
  surface_behavior: {
    home_new_session:
      "configure_only_real_new_session_capabilities_supported_by_the_active_adapter",
    existing_conversation:
      "attach_local_inputs_invoke_loaded_skills_show_loaded_connection_status_change_adapter_reported_nonduplicate_modes_without_rebinding",
    settings_route_policy:
      "management_entries_are_explicit_fallbacks_not_fake_session_selection",
  },
  authority_policy:
    "render_only_real_picker_actions_owner_or_carrier_projected_skills_and_non_forbidden_configured_session_connections_supported_by_the_active_adapter",
  forbidden_entries: [
    "project_object",
    "workspace_or_initial_cwd",
    "backend",
    "provider",
    "team",
    "raw_mcp",
    "arbitrary_skills",
    "unavailable_or_synthetic_plugins",
  ],
};
