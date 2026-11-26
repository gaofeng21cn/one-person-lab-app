export const homeActivityCenterForbiddenDisplays = [
  "domain artifact body",
  "memory body",
  "quality verdict body",
  "provider implementation details",
];
export const appOwnedActiveStudioPrimaryNavigation = {
  "scope": "active_opl_studio_current_product_only",
  "ordered_entry_ids": [
    "new_task",
    "app_management",
    "runtime",
    "app_workspace",
    "more",
    "archived"
  ],
  "app_management_entry": {
    "route": "/apps",
    "label_i18n": {
      "zh-CN": "软件中心",
      "en-US": "Software Center"
    },
    "placement": "after_new_task_before_runtime",
    "visibility": "user_pinned_or_reachable_in_more",
    "expanded_behavior": "icon_and_label",
    "collapsed_behavior": "icon_only_with_tooltip_and_accessible_name",
    "narrow_drawer_behavior": "icon_and_label",
    "keyboard_reachable": true,
    "home_content_effect": "navigation_only_no_dashboard",
    "route_gate_boundary": "default_release_gate_requires_framework_app_state_and_package_projection"
  },
  "runtime_entry": {
    "route": "/runtime",
    "label_i18n": {
      "zh-CN": "运行状态",
      "en-US": "Runtime status"
    },
    "placement": "after_new_task_before_scheduled_tasks",
    "visibility": "user_pinned_or_reachable_in_more",
    "expanded_behavior": "icon_and_label",
    "collapsed_behavior": "icon_only_with_tooltip_and_accessible_name",
    "narrow_drawer_behavior": "icon_and_label",
    "keyboard_reachable": true,
    "home_content_effect": "navigation_only_no_dashboard",
    "route_gate_boundary": "default_release_gate_requires_opl_studio_runtime"
  },
  "customization": {
    "default_pinned_panel_ids": [
      "applications",
      "runtime",
      "materials",
      "workspace"
    ],
    "default_unpinned_panel_ids": [
      "schedules",
      "teams",
      "superagent"
    ],
    "preference_identity": "registered_sidebar_panel_id",
    "user_override_precedes_default": true,
    "persistence": "current_carrier_local_profile",
    "new_panel_default": "unpinned",
    "more_visibility": "registered_unpinned_entries_only",
    "active_unpinned_panel": "mark_more_and_selected_menu_entry_without_auto_pin",
    "unpin_available_when_more_hidden": true
  }
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
