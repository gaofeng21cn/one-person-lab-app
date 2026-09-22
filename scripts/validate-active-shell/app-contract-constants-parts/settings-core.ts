export const appOwnedSettingsTabs = [
  "general",
  "gateway",
  "access",
  "workspace",
  "agents",
  "capabilities",
  "resources",
  "environment",
  "storage",
  "appearance",
];
export const appOwnedSettingsAppUpdateStatePolicyRef =
  "contracts/app-gui-product-contract.json#framework_surfaces.managed_update_plane.app_update_state_policy";
export const appOwnedSettingsAppUpdateStatePolicy = {
  schema: "opl_app_update_state_policy.v1",
  desktop: {
    state_source: "single_main_process_updater_state_store",
    consumers: ["about", "maintenance", "settings_footer"],
    mount_check: false,
    status_values: [
      "not_checked",
      "checking",
      "not-available",
      "available",
      "downloading",
      "downloaded",
      "error",
      "cancelled",
    ],
    attention_states: ["available", "downloading", "downloaded", "error"],
    non_attention_states: [
      "not_checked",
      "checking",
      "not-available",
      "cancelled",
    ],
    manual_check: "refresh_the_same_shared_state",
    download_progress: "about_displays_percent_transferred_total_and_speed_from_shared_updater_state",
    active_download_manual_check: "observe_existing_download_without_restarting",
    background_completion: "silent_install_on_normal_app_restart",
  },
  webui: {
    fallback_source:
      "opl app state --profile fast --json#managed_update.components[component_id=opl_app]",
    fallback_policy:
      "use_only_when_desktop_main_process_updater_is_unavailable",
  },
  attention_accounting: {
    independent: true,
    runtime_service_source:
      "current_runtime_environment_readiness_excluding_app_update",
    app_update_source:
      "desktop_shared_updater_store_or_webui_managed_opl_app_fallback",
    aggregation:
      "runtime_service_attention_count_plus_one_when_app_update_attention_is_true",
    desktop_managed_opl_app_policy:
      "exclude_from_runtime_service_attention_when_desktop_updater_is_available",
    webui_managed_opl_app_policy: "use_as_app_update_fallback_only",
  },
};
export const appOwnedSettingsAboutUpdaterStatePolicy = {
  startup_check: "once_after_App_startup",
  mount_check: false,
  shared_state: "single_main_process_updater_state_store",
  manual_check: "refresh_the_same_shared_state",
    download_progress: "about_displays_percent_transferred_total_and_speed_from_shared_updater_state",
    active_download_manual_check: "observe_existing_download_without_restarting",
    background_completion: "silent_install_on_normal_app_restart",
  app_update_state_policy_ref: appOwnedSettingsAppUpdateStatePolicyRef,
};
export const appOwnedSettingsManagedUpdateRepairPolicyRef =
  "contracts/app-gui-product-contract.json#framework_surfaces.managed_update_plane.repair_availability_policy";
export const appOwnedSettingsManagedUpdateRepairPolicy = {
  schema: "opl_managed_update_repair_availability_policy.v1",
  current_repair_signals: [
    "component.repair_allowed",
    "component.can_repair",
    "component.state=failed_with_repair",
    "current_repair_action",
  ],
  current_state_precedence: true,
  historical_receipt_role: "diagnostics_only",
  historical_receipt_may_activate_current_repair: false,
  unavailable_primary_action: "check_current_status",
};
export const appOwnedSettingsManagedDependencySummary = {
  source_ref:
    "opl update status --json#managed_update.components[component_id=opl_base].current.dependency_catalog.dependencies[]",
  required_ids: ["codex-cli", "temporal-runtime", "temporal-system-cli"],
  required_fields: [
    "dependency_id",
    "dependency_kind",
    "installed",
    "version",
    "latest_version",
    "currentness",
    "ownership",
    "update_policy",
    "update_mode",
    "update_action",
    "activation_policy",
    "binary_path",
    "status",
  ],
  optional_fields: ["real_path"],
  optional_fields_by_dependency_id: {
    "codex-cli": ["external_installations"],
    "temporal-runtime": [],
    "temporal-system-cli": ["note"],
  },
  localized_display_names: {
    "codex-cli": { label_zh: "Codex CLI", label_en: "Codex CLI" },
    "temporal-runtime": {
      label_zh: "OPL 托管 Temporal 运行时",
      label_en: "OPL-managed Temporal Runtime",
    },
    "temporal-system-cli": {
      label_zh: "系统 Temporal CLI",
      label_en: "System Temporal CLI",
    },
  },
  currentness_values: ["current", "update_available", "unknown", "missing"],
  update_mode_values: [
    "silent_managed",
    "explicit_owner_delegated",
    "detect_only_guidance",
  ],
  display_policy:
    "show active Codex CLI, OPL-managed Temporal Runtime, and optional system Temporal CLI directly on Maintenance with version, source, currentness, and owner-specific update guidance",
  path_deduplication_policy:
    "deduplicate Codex PATH candidates by normalized real_path when present otherwise binary_path and retain shadowed candidates in diagnostics",
  path_identity_precedence: ["real_path", "binary_path"],
  external_update_policy:
    "OPL-managed roots use the existing OPL Base update route; identified external owners require confirmation; unknown owners receive guidance only",
  manual_operation_policy: {
    silent_managed:
      "route to the existing OPL Base update or repair action and never synthesize a per-dependency action",
    explicit_owner_delegated:
      "render the Framework update_action only after explicit confirmation",
    detect_only_guidance:
      "show owner guidance without a fake update action",
  },
  unknown_value_policy:
    "show not checked or unknown and never synthesize current, missing, or zero values",
  diagnostics_boundary:
    "the single advanced disclosure may show read-only binary paths, shadowed installations, localized component labels, and receipt evidence; raw internal status keys, actions, and catalog payloads are never user-facing",
  external_installations_policy: {
    row_key: "dependency_id_plus_normalized_realpath_with_stable_index_suffix_only_for_duplicate_paths",
    required_fields: [
      "dependency_id",
      "binary_path",
      "ownership",
      "installed",
      "version",
      "latest_version",
      "currentness",
      "update_mode",
      "update_action",
      "guidance",
    ],
    optional_fields: ["real_path"],
    path_policy:
      "normalize_real_path_when_present_otherwise_binary_path_before_deduplication_and_keep_shadowed_rows_in_diagnostics",
  },
  temporal_component_version_policy: {
    runtime_component_id: "temporal-runtime",
    cli_component_id: "temporal-system-cli",
    normalization: "normalize_semver_without_v_prefix_and_never_compare_runtime_bundle_version_to_system_cli_version",
  },
};
export const appOwnedTaskAwarenessRefFields = [
  "capability_health_refs",
  "workflow_refs",
  "export_bundle_action_ref",
  "candidate_report_refs",
  "workflow_skill_candidate_refs",
];
export const appOwnedSecondarySettingsPages = ["about"];
export const appOwnedSettingsCompatibilityRedirects = {
  update: {
    source_route_id: "update",
    source_path: "/settings/update",
    target_route_id: "environment",
    target_path: "/settings/environment",
    product_page_id: "maintenance",
    anchor: "updates",
    anchor_query_param: "section",
    navigation_encoding: "route_id_plus_anchor_field",
    shell_transport_hint: "hash_router_uses_query_param_section",
  },
  theme: {
    source_route_id: "theme",
    source_path: "/settings/theme",
    target_route_id: "appearance",
    target_path: "/settings/appearance",
    product_page_id: "preferences",
    anchor: "themes",
    anchor_query_param: "section",
    navigation_encoding: "route_id_plus_anchor_field",
    shell_transport_hint: "hash_router_uses_query_param_section",
  },
  "local-services": {
    source_route_id: "local-services",
    source_path: "/settings/local-services",
    target_route_id: "environment",
    target_path: "/settings/environment",
    product_page_id: "maintenance",
    anchor: "services",
    anchor_query_param: "section",
    navigation_encoding: "route_id_plus_anchor_field",
    shell_transport_hint: "hash_router_uses_query_param_section",
  },
  personalization: {
    source_route_id: "personalization",
    source_path: "/settings/personalization",
    target_route_id: "workspace",
    target_path: "/settings/workspace",
    product_page_id: "workspace",
    anchor: "personalization",
    anchor_query_param: "section",
    navigation_encoding: "route_id_plus_anchor_field",
    shell_transport_hint: "hash_router_uses_query_param_section",
  },
};
