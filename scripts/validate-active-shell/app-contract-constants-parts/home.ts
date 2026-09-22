export const homeActivityCenterForbiddenDisplays = [
  "domain artifact body",
  "memory body",
  "quality verdict body",
  "provider implementation details",
];
export const appOwnedActiveAionuiPrimaryNavigation = {
  scope: "active_aionui_current_product_only",
  ordered_entry_ids: ["new_task", "runtime", "scheduled_tasks", "archived"],
  runtime_entry: {
    route: "/runtime",
    label_i18n: {
      "zh-CN": "运行状态",
      "en-US": "Runtime status",
    },
    placement: "after_new_task_before_scheduled_tasks",
    visibility: "always",
    expanded_behavior: "icon_and_label",
    collapsed_behavior: "icon_only_with_tooltip_and_accessible_name",
    narrow_drawer_behavior: "icon_and_label",
    keyboard_reachable: true,
    home_content_effect: "navigation_only_no_dashboard",
    route_gate_boundary: "default_release_gate_requires_runtime_native_phase_one_candidate_parity_may_omit_runtime",
  },
};
export const appOwnedOplStandardAgentMembershipPolicy = {
  ownership_source_fields: [
    "official",
    "publisher",
  ],
  ownership_match_policy:
    "official_equals_true_or_publisher_equals_one-person-lab",
  required_package_role: "standard_agent",
  required_readiness: "selectable",
  required_codex_route: {
    source: "home_shortcuts[].route",
    route_kind: "agent_package_shortcut",
    executor: "codex_cli",
    codex_visible_entry: "non_empty",
  },
  generic_skills_plugins_connections_group_policy:
    "separate_never_in_opl_standard_agent_group",
  package_id_allowlist_allowed: false,
};

export const appOwnedOrdinaryForbiddenCapabilityPolicy = {
  forbidden_mcp_matchers: {
    exact: ['aionui-team'],
    prefixes: ['team_', 'mcp__aionui-team'],
    contains: ['aionui-team'],
  },
  scrub_extra_keys: [
    'team_mcp_stdio_config',
    'team_id',
    'teamId',
    'team_lead_team_id',
    'team_lead_team_slot_id',
    'team_lead_conversation_id',
    'tl',
  ],
};

export const appOwnedHomeLayout = {
  default_mode: "composer_first_chat_canvas",
  default_active_shortcut: null,
  shortcut_selection_policy:
    "explicit_user_or_navigation_selection_only_no_saved_preset_restore_and_never_disabled_by_launch_readiness",
  first_screen_policy: "chat_first_single_reading_lane_no_dashboard_landing_or_agent_portal",
  composer_position: "floating_bottom_with_safe_inset",
  composer_primary: true,
  workspace_selector_visible: true,
  workspace_selector_entry: "home.new_session_context_bar",
  unselected_workspace_control_visible: true,
  unselected_workspace_control_policy:
    "localized_choose_project_directory_action_not_projectless_status_placeholder",
  home_presentation_source_ref:
    "app_state.agent_packages.directory.entries + app_state.agent_packages.status_index.home_shortcut_preferences[]",
  home_shortcut_visibility_source_ref:
    "app_state.agent_packages.directory.entries + app_state.agent_packages.status_index.home_shortcut_preferences[visible=true]",
  opl_standard_agent_membership_policy: appOwnedOplStandardAgentMembershipPolicy,
  home_shortcut_placement:
    "compact_shortcuts_immediately_above_composer_with_management_in_settings_agents_not_persistent_composer_selector",
  dynamic_question_title: true,
  starter_limit: null,
  starter_visibility_policy:
    "opl_standard_agent_membership_with_selectable_readiness_real_codex_route_and_default_or_user_visible_shortcuts",
  starter_order_policy: "home_shortcut_preferences_sort_order_then_localized_display_name",
  shortcut_membership_source_ref:
    "app_state.agent_packages.directory.entries",
  shortcut_preference_source_ref:
    "app_state.agent_packages.status_index.home_shortcut_preferences[]",
  unknown_standard_agent_policy:
    "render_unknown_package_ids_only_when_they_match_opl_standard_agent_membership_without_app_allowlist",
  starter_layout_policy: "compact_inline_wrap",
  starter_item_width_policy: "content_sized",
  starter_count_layout_policy: "center_actual_visible_count_and_wrap_without_navigation_chevrons",
  desktop_composer_max_width_px: 736,
  desktop_composer_min_height_px: 98,
  desktop_composer_corner_radius_px: 22,
  desktop_context_bar_height_px: 52,
  desktop_context_bar_overlap_px: 13,
  desktop_context_bar_horizontal_inset_px: 12,
  starter_truncation_allowed: false,
  selected_starter_visual_policy:
    "quiet_fill_with_aria_pressed_without_trailing_selection_glyph",
  selected_starter_accessibility_state: "aria_pressed_reflects_active_shortcut",
  selected_working_directory_visual_policy:
    "independent_new_session_context_bar_control_with_selected_directory_and_clear_action",
  workspace_selector_policy: {
    primary_scope: "active_workspace_only",
    inactive_recent_directories_visible: false,
    management_entry: "registered_directories_modal",
    management_scope: "registered_workspaces",
    selection_effect: "set_new_session_initial_cwd_only",
    unregister_effect: "remove_registration_only",
    filesystem_delete_allowed: false,
    active_conversation_change_on_unregister: false,
    session_ownership_effect: "none",
    cascade_session_delete_allowed: false,
  },
  home_shortcut_mutation_policy: {
    pending_scope: "single_shortcut",
    pending_key: "shortcut_id",
    other_shortcuts_remain_interactive: true,
    readback_mode: "background_no_page_loading",
  },
  projectless_conversation_supported: true,
  text_chat_without_workspace: "available",
  workspace_session_rail_default_state: "visible_wide_drawer_narrow",
  active_aionui_primary_navigation: appOwnedActiveAionuiPrimaryNavigation,
  right_context_inspector_default_state: "collapsed",
  must_not_show: [
    "dashboard-first home",
    "explanatory landing page",
    "backend settings panel in composer",
    "full-width agent category navigation or chevron trail",
    "working directory selector inside the composer capability palette",
    "launch-blocked professional-agent shortcut disabled before selection",
    "Sites entry without an OPL product capability",
    "Chat entry without an OPL product capability",
    "AionUI Team nav entry",
    "AionUI Team page as ordinary App surface",
  ],
};
export const appOwnedPageStateHomeLayout = {
  ...appOwnedHomeLayout,
  home_presentation_source_ref:
    "app_state.agent_packages.directory.entries + app_state.agent_packages.status_index.home_shortcut_preferences[]",
  must_not_show: [
    "dashboard-first home",
    "explanatory landing page",
    "backend settings panel in composer",
    "full-width agent category navigation or chevron trail",
    "working directory selector inside the composer capability palette",
    "launch-blocked professional-agent shortcut disabled before selection",
    "AionUI Team nav entry",
    "AionUI Team page as ordinary App surface",
  ],
};
