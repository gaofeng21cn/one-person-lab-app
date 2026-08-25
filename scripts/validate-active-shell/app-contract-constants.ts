export const appOwnedGenericOwnerAcceptanceCurrentnessRefPolicy = {
  projection_field: "stage_run_current_owner_delta",
  owner_field: "owner",
  accepted_return_shapes_field: "accepted_return_shapes",
  acceptance_or_blocker_refs_field: "artifact_or_blocker_refs",
  currentness_guard_refs_field: "readiness_false_flag_refs",
  unknown_owner_policy: "unknown_fail_closed_no_acceptance_or_currentness_inference",
  missing_refs_policy: "unknown_fail_closed_no_acceptance_or_currentness_inference",
  app_role: "display_only_refs_consumer_no_owner_verdict_authority",
};

export const retiredMasOwnerAcceptanceMirrorFields = [
  "mas_runtime_acceptance_display_policy",
  "mas_owner_consumption_status",
  "mas_owner_consumption_ref",
  "mas_owner_consumed_stage_attempt_id",
  "mas_owner_consumed_closeout_ref",
  "mas_owner_consumption_matches_runtime_closeout",
  "mas_currentness_drift_text",
];

export const appOwnedProjectGroupExpansionPolicy = {
  running_group_default: "expanded",
  attention_group_default: "visible_when_nonempty",
  inactive_group_default: "collapsed",
  inactive_states: [
    "queued",
    "pending",
    "waiting",
    "stopped",
    "parked",
    "checkpointed",
    "blocked",
    "attention_needed",
  ],
  inactive_summary_fields: [
    "count",
    "status",
    "next_visible_step",
    "runtime_closeout_observed",
    "runtime_closeout_ref",
    "stage_run_current_owner_delta",
  ],
};

export const appOwnedPrimaryGroupingPolicy = {
  default_order: [
    "in_progress",
    "delivered_auto_paused",
    "paused_waiting_for_direction",
    "owner_decision_required",
    "system_attention_required",
  ],
  collapsed_groups: ["delivered_auto_paused", "paused_waiting_for_direction"],
  secondary_badge_fields: [
    "automation_state_label",
    "active_stage_label",
    "last_progress_at",
  ],
};

export const appOwnedRunningStatePolicy =
  "only explicit running, in_progress, or advancing status/state counts as running; active_run_id alone is context, not liveness proof; queued, pending, and waiting require explicit projected status; blocked or attention_needed stay blocked/attention states; stopped, parked, and checkpointed stay inactive and must not be relabeled queued";

export const appOwnedRuntimeMentalModel = [
  "agent/capability: which agent, capability package, or module is responsible",
  "project: which project line, study, or deliverable track this work belongs to",
  "task/work item: the user-visible unit that is advancing, waiting, or blocked",
  "execution run: the current stage run, heartbeat, usage, and blocker route for this task",
];

export const runtimeScopeRequiredFields = [
  "agent_scope_options",
  "selected_agent_scope",
  "project_scope_options",
  "selected_project_scope",
  "scope_source",
  "inferred_scope_hint",
];

export const workItemPrimaryStateLabelsByLocale = {
  "en-US": {
    automatically_advancing: "Automatically advancing",
    awaiting_user_decision: "Waiting for your decision",
    system_attention: "System handling",
    delivered_auto_paused: "Delivered and auto-paused",
    paused: "Paused",
    stopped: "Stopped",
    sync_pending: "Sync pending",
  },
  "zh-CN": {
    automatically_advancing: "自动推进中",
    awaiting_user_decision: "等待你决定",
    system_attention: "系统处理中",
    delivered_auto_paused: "已交付自动暂停",
    paused: "已暂停",
    stopped: "已停止",
    sync_pending: "状态待同步",
  },
};

export const runtimePrimaryStateValues = [
  "in_progress",
  "delivered_auto_paused",
  "paused_waiting_for_direction",
  "owner_decision_required",
  "system_attention_required",
];

export const runtimeAutomationStateValues = [
  "automation_running",
  "automation_idle",
  "result_pending_terminalization",
  "automation_failed",
];

export const workItemProjectionRequiredFields = [
  "item_id",
  "identity",
  "lifecycle",
  "execution",
  "attention",
  "telemetry",
  "conditions",
  "freshness",
  "visibility",
  "action",
];

export const workItemProjectionFieldContracts = {
  identity: [
    "agent_id",
    "agent_display_name",
    "project_id",
    "workspace_path",
    "project_display_name",
    "work_item_id",
    "work_item_display_name",
  ],
  lifecycle: [
    "business_state",
    "primary_state",
    "primary_state_label",
    "reason",
    "last_transition_at",
  ],
  execution: [
    "state",
    "current_stage_id",
    "current_stage_display_name",
    "next_stage_id",
    "next_stage_display_name",
    "started_at",
    "last_heartbeat_at",
  ],
  attention: ["kind", "summary", "owner_display_name", "responsibility"],
  telemetry: ["state", "elapsed", "current_stage_tokens", "task_total_tokens"],
  freshness: ["state", "observed_at", "last_progress_at", "reason"],
  visibility: ["state", "source", "updated_at", "control_ref", "generation"],
  action: [
    "kind",
    "title",
    "title_key",
    "summary",
    "summary_key",
    "message_args",
    "owner",
    "owner_kind",
    "action_ref",
    "dry_run_required",
  ],
};

export const domainDetailViewAvailabilityValues = [
  "unread",
  "available",
  "missing",
  "stale",
  "invalid",
  "read_error",
];

export const domainDetailViewReadAvailabilityValues = [
  "available",
  "missing",
  "stale",
  "invalid",
  "read_error",
];

export const domainDetailViewDescriptorFields = [
  "item_id",
  "view_id",
  "view_kind",
  "availability",
];

export const domainDetailViewDescriptorOptionalFields = [
  "title",
  "schema_ref",
  "schema_version",
  "revision",
  "digest",
];

export const runtimeWorkItemDetailSecondarySections = ["domain_detail_views"];

export const workItemConditionFields = [
  "type",
  "status",
  "reason",
  "message",
  "owner",
  "last_transition_time",
  "observed_generation",
];

export const systemAttentionResponsibilityFields = [
  "responsible_component",
  "issue",
  "repair_action",
  "impact",
  "expected_outcome",
];

export const tokenObservationStates = ["observed", "missing", "stale"];

export const tokenObservationObservedFields = [
  "input_tokens",
  "output_tokens",
  "total_tokens",
  "source",
  "observed_at",
];

export const actionEnvelopeKinds = [
  "user_action",
  "system_action",
  "agent_action",
  "safe_action",
  "blocked_no_action",
];

export const actionOwnerKinds = ["user", "system", "agent", "other"];

export const workItemVisibilityStates = ["visible", "archived"];

export const workItemBusinessStates = [
  "active",
  "delivered_paused",
  "paused",
  "stopped",
  "archived",
  "unknown",
];

export const runtimeVisibilityPageStateIds = [
  "active_empty",
  "archived_empty",
  "archiving",
  "restoring",
  "archive_failed",
  "restore_failed",
  "stale_generation_conflict",
  "locale_en_us",
  "locale_zh_cn",
];

export const workItemDetailPrimarySections = [
  "stage_map",
  "current_and_next_stage",
  "running_and_heartbeat",
  "stage_and_total_tokens",
  "action",
];

export const workItemDetailSecondarySections = ["artifacts", "timeline", "evidence"];

export const workItemDetailDiagnosticSections = [
  "raw_refs",
  "raw_ids",
  "logs",
  "provider_diagnostics",
];

export const appOwnedQueueStatusPolicy =
  "queued, pending, and waiting require explicit projected status; blocked or attention_needed stay blocked/attention states; stopped, parked, and checkpointed stay inactive; non-running must never be inferred as queued";

export const appOwnedAgentModuleStatusPanel = {
  source: "task capability/module refs separated from task liveness",
  display_policy:
    "render agent, capability, connector, and module status in a dedicated panel instead of mixing them into stage/run telemetry; explain dirty or missing states in plain language and suppress zero-workload/no-activity filler",
  required_ref_fields: [
    "connector_readiness_refs",
    "diagnostic_substrate_refs",
    "gateway_status_ref",
  ],
  optional_ref_fields: ["capability_health_refs"],
  telemetry_missing_copy: "module status unavailable",
};

export const taskRunProjectionV2RequiredFields = [
  "task_identity",
  "status",
  "progress",
  "conditions",
  "evidence_cards",
  "action_cards",
  "resource_cards",
  "diagnostics_ref",
];

export const taskRunProjectionV2FieldGroups = {
  task_identity: [
    "task_id",
    "title",
    "domain_id",
    "domain_label",
    "study_id",
    "task_ref",
    "agent_display_name",
    "project_display_name",
    "work_item_display_name",
    "execution_run_label",
  ],
  status: [
    "state",
    "status",
    "status_label",
    "priority_bucket",
    "primary_state",
    "primary_state_label",
    "primary_state_reason",
    "automation_state",
    "automation_state_label",
    "automation_state_reason",
    "active_stage_id",
    "active_stage_label",
    "active_run_ref",
  ],
  progress: [
    "progress_label",
    "current_step",
    "last_progress_at",
    "progress_ref",
    "stage_ref",
  ],
  conditions: [
    "type",
    "status",
    "reason",
    "message",
    "severity",
    "owner",
    "last_transition_time",
    "ref",
  ],
  evidence_cards: [
    "card_id",
    "kind",
    "owner",
    "updated_at",
    "title",
    "summary",
    "ref",
    "why_it_matters",
    "open_action",
    "content_policy",
  ],
  action_cards: [
    "card_id",
    "risk",
    "write_targets",
    "expected_output",
    "rollback_ref",
    "verify_ref",
    "title",
    "summary",
    "ref",
    "action_ref",
    "open_action",
    "dry_run_required",
    "content_policy",
  ],
  resource_cards: [
    "card_id",
    "resource_kind",
    "owner",
    "title",
    "summary",
    "ref",
    "status_ref",
    "usage_ref",
    "quota_ref",
    "permission_ref",
    "cost_estimate_ref",
    "open_action",
    "content_policy",
  ],
  diagnostics_ref: ["diagnostics_ref"],
};

export const forbiddenAuthorityOwners = [
  "runtime_truth",
  "provider_implementation",
  "domain_truth",
  "domain_quality_verdict",
  "domain_artifact_authority",
];
export const beginnerFirstRunTestIds = [
  "opl-startup-preflight",
  "opl-first-run-beginner-summary",
  "opl-first-run-initialize-pending",
  "opl-first-run-primary-action",
  "opl-first-run-technical-details-toggle",
  "opl-first-run-focused-workspace",
  "opl-first-run-step-rail",
  "opl-first-run-task-panel",
  "opl-first-run-access-methods",
  "opl-first-run-gateway-account-method",
  "opl-first-run-gateway-key-method",
  "opl-first-run-gateway-email-input",
  "opl-first-run-gateway-password-input",
  "opl-first-run-gateway-login-button",
  "opl-first-run-gateway-model-access-confirm",
  "opl-first-run-codex-api-key-input",
  "opl-first-run-configure-codex-button",
  "opl-first-run-recheck-existing",
  "opl-first-run-enter-app",
  "opl-first-run-ready-entry",
  "opl-first-run-window-actions",
  "opl-first-run-step-workspace_root",
  "opl-first-run-step-codex",
  "opl-first-run-step-codex_config",
];
export const focusedFirstRunPresentationPolicy = {
  layout_mode: "focused_setup_workspace",
  ordinary_navigation_policy: "hidden_until_user_enters_guid",
  step_navigation_policy: "fixed_three_step_rail",
  current_task_policy: "one_current_task_panel",
  current_task_selection_policy:
    "first_unready_core_item_in_fixed_step_order_then_completion",
  progress_display_policy: "completed_step_count_no_percentage",
  model_access_choice_policy:
    "gateway_account_default_on_desktop_and_webui_with_api_key_compatibility_and_secondary_existing_codex_recheck",
  model_access_inflight_policy:
    "disable_method_switch_and_alternate_action_until_current_request_settles",
  completion_transition_policy: "replace_current_task_in_place",
  completion_navigation_policy:
    "manual_guid_entry_available_before_or_after_ready_no_automatic_route",
  defer_navigation_policy:
    "explicit_enter_guid_available_before_ready_without_mutating_readiness",
  technical_detail_navigation_policy:
    "in_place_no_ordinary_settings_route_before_guid",
  request_exclusivity_policy:
    "single_inflight_initialize_or_action_across_first_run_controls",
  pending_state_policy:
    "no_ready_or_no_blocker_claim_before_initialize_payload",
  core_readiness_status_policy:
    "required_core_items_never_treat_disabled_as_ready",
  minimum_window_primary_action_policy:
    "400x600_keeps_current_primary_action_visible",
  background_shell_interaction_policy:
    "inert_and_aria_hidden_until_user_enters_guid",
  window_control_policy:
    "preserve_mac_traffic_light_safe_area_and_render_non_mac_desktop_controls",
  raw_error_policy:
    "localized_inline_current_task_and_technical_details_only_no_beginner_toast",
  secret_diagnostic_policy:
    "never_persist_or_render_gateway_password_and_redact_submitted_api_key_from_renderer_diagnostics",
  accessible_name_policy:
    "localized_visible_label_or_aria_labelledby_no_testid_names",
};
export const firstRunModelAccessSetupPolicy = {
  desktop_default_method: "gateway_account",
  desktop_method_order: ["gateway_account", "api_key"],
  gateway_account: {
    credentials: ["email", "password"],
    device_label_policy: "framework_default_not_rendered",
    secret_bridge_ref: "contracts/app-runtime-bridge.json#opl_gateway_account_secret_bridge",
    post_login_state_source: "opl app state --profile fast --json",
    unique_group_action: "gateway_account_complete_setup",
    post_setup_state_refresh: "required_before_offering_model_access_confirmation",
    model_access_action: "gateway_account_use_for_model_access",
    model_access_action_policy:
      "confirmation_required_after_fresh_state_read_never_implied_by_gateway_login",
    model_access_confirmation: {
      trigger: "separate_explicit_user_action_after_login_and_fresh_state_read",
      label_zh: "设为模型访问方式",
      label_en: "Use for model access",
      danger_level: "medium",
      confirmation_required: true,
      gateway_login_counts_as_confirmation: false,
      action_visibility: "only_when_action_is_exposed_by_fresh_projection",
      fresh_state_required_before_execute: true,
      fresh_state_required_after_execute: true,
    },
    shared_fast_state_cache_policy: "publish_each_authoritative_post_login_read",
    unresolved_group_error: "group_selection_required",
    ready_claim_policy: "only_after_initialize_confirms_codex_config_ready",
    password_clear_policy: "success_failure_or_method_switch",
    diagnostic_policy:
      "no_password_in_state_action_stdout_stderr_receipt_or_renderer_diagnostics",
  },
  api_key: {
    role: "compatibility",
    bridge: "configureCodex",
    transport: "stdin",
    redaction_policy: "redact_before_renderer_diagnostics",
  },
  existing_codex_recheck: {
    role: "secondary_action_outside_method_switch",
    bridge: "getInitialize",
    mutates_configuration: false,
  },
  webui: {
    default_method: "gateway_account",
    allowed_methods: ["gateway_account", "api_key"],
    gateway_password_login: true,
    gateway_login_route: "/api/opl-runtime/gateway-account-login",
    transport: "existing_opl_runtime_http_proxy_to_credentials_stdin",
  },
};
export const progressiveFirstRunRecoveryTestIds = [
  "opl-first-run-resume-entry",
  "opl-guid-setup-notice",
  "opl-guid-setup-notice-action",
  "opl-guid-workspace-access-disabled",
];
export const progressiveFirstRunRecoveryPolicy = {
  fresh_webui_login_setup_check_intent: "postLoginSetupCheck",
  fresh_webui_login_known_incomplete_route: "/first-run",
  fresh_webui_login_unknown_policy: "keep_guid_fail_open",
  fresh_webui_login_ui_timeout_ms: 20000,
  persistent_setup_entry_route: "/first-run",
  persistent_home_composer_runtime_alert: "forbidden",
  plain_conversation_required_items: ["codex_cli", "codex_config"],
  send_scoped_local_input_required_items: ["codex_cli", "codex_config"],
  send_scoped_local_input_surfaces: [
    "file_dialog_attachment",
    "directory_dialog_attachment",
    "file_paste_attachment",
    "file_drag_attachment",
    "slash_open_absolute_path",
  ],
  workspace_control_required_items: ["workspace_root"],
  workspace_restricted_capabilities: [
    "project_workspace_selection",
    "opl_workspace_controls",
  ],
  unknown_readiness_policy: "do_not_synthesize_failure_or_mutate_readiness",
};
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
export const appActionRoute =
  "opl app action execute --action <action_id> [--payload <json>] [--dry-run] --json";
export const appOwnedSettingsIaGroupIds = [
  "overview",
  "account_models",
  "connections_deployment",
  "workspace",
  "agents_capabilities",
  "runtime_maintenance",
  "preferences",
];
export const appOwnedSettingsNavigationDestinationIds = [
  "overview_status",
  "account_access",
  "models",
  "resources_connections",
  "working_directory",
  "data_storage",
  "agents",
  "capabilities",
  "instructions_context",
  "runtime_services",
  "updates_repairs",
  "logs_diagnostics",
  "preferences",
];
export const appOwnedSettingsNavigationGroupLabels = {
  overview: { label_zh: "概览", label_en: "Overview" },
  account_models: { label_zh: "账户与模型", label_en: "Account & Models" },
  connections_deployment: {
    label_zh: "连接与部署",
    label_en: "Connections & Deployment",
  },
  workspace: { label_zh: "工作区", label_en: "Workspace" },
  agents_capabilities: {
    label_zh: "智能体与能力",
    label_en: "Agents & Capabilities",
  },
  runtime_maintenance: {
    label_zh: "运行与维护",
    label_en: "Runtime & Maintenance",
  },
  preferences: { label_zh: "偏好", label_en: "Preferences" },
};
export const appOwnedSettingsNavigationDestinationOwners = {
  overview_status: { owner_group_id: "overview", route_id: "general" },
  account_access: { owner_group_id: "account_models", route_id: "gateway" },
  models: { owner_group_id: "account_models", route_id: "access" },
  resources_connections: {
    owner_group_id: "connections_deployment",
    route_id: "resources",
  },
  working_directory: {
    owner_group_id: "workspace",
    route_id: "workspace",
    anchor: "current-workspace",
  },
  data_storage: { owner_group_id: "workspace", route_id: "storage" },
  agents: { owner_group_id: "agents_capabilities", route_id: "agents" },
  capabilities: {
    owner_group_id: "agents_capabilities",
    route_id: "capabilities",
  },
  instructions_context: {
    owner_group_id: "agents_capabilities",
    route_id: "workspace",
    anchor: "personalization",
  },
  runtime_services: {
    owner_group_id: "runtime_maintenance",
    route_id: "environment",
    anchor: "services",
  },
  updates_repairs: {
    owner_group_id: "runtime_maintenance",
    route_id: "environment",
    anchor: "updates",
  },
  logs_diagnostics: {
    owner_group_id: "runtime_maintenance",
    route_id: "environment",
    anchor: "diagnostics",
  },
  preferences: { owner_group_id: "preferences", route_id: "appearance" },
};
export const appOwnedSettingsRouteScopes = {
  settings_general: { route_id: "general", route_scope: "ordinary" },
  gateway: { route_id: "gateway", route_scope: "ordinary" },
  access: { route_id: "access", route_scope: "ordinary" },
  agents: { route_id: "agents", route_scope: "ordinary" },
  capabilities: { route_id: "capabilities", route_scope: "ordinary" },
  resources: { route_id: "resources", route_scope: "ordinary" },
  environment: { route_id: "environment", route_scope: "ordinary" },
  storage: { route_id: "storage", route_scope: "ordinary" },
  settings_theme: { route_id: "appearance", route_scope: "ordinary" },
  settings_personalization: {
    route_id: "personalization",
    route_scope: "compatibility_redirect",
  },
  about: { route_id: "about", route_scope: "secondary_or_deep_link" },
  update: { route_id: "update", route_scope: "compatibility_redirect" },
  workspace: { route_id: "workspace", route_scope: "ordinary" },
  local_services: {
    route_id: "local-services",
    route_scope: "compatibility_redirect",
  },
};
export const appOwnedSettingsTaskEntryIds = [
  "gateway_account",
  "model_access",
  "local_runtime_ability",
  "workspace",
  "maintenance_hub",
  "capability_status",
  "remote_access",
  "advanced_deployment",
  "developer_source_control",
  "external_tools_voice",
];
export const appOwnedSettingsTaskEntryMetadataFields = [
  "scope",
  "intent",
  "risk",
  "frequency",
];
export const appOwnedSettingsTopLevelEntryIds = [
  "overview",
  "gateway",
  "models",
  "workspace",
  "agents",
  "capabilities",
  "resources",
  "maintenance",
  "storage",
  "preferences",
];
export const appOwnedSettingsTopLevelLabels = {
  overview: { label_zh: "概览", label_en: "Overview" },
  gateway: { label_zh: "账户与访问", label_en: "Account & Access" },
  models: { label_zh: "模型", label_en: "Models" },
  workspace: {
    label_zh: "工作区",
    label_en: "Workspace",
  },
  agents: { label_zh: "智能体", label_en: "Agents" },
  capabilities: { label_zh: "能力", label_en: "Capabilities" },
  resources: { label_zh: "资源与连接", label_en: "Resources & Connections" },
  maintenance: { label_zh: "维护", label_en: "Maintenance" },
  storage: { label_zh: "数据与存储", label_en: "Data & Storage" },
  preferences: { label_zh: "偏好", label_en: "Preferences" },
};
export const appOwnedWebuiDataVolumeHostActionCapabilityId =
  "carrier_host.storage.webui_data_volume.lifecycle";
export const appOwnedWebuiDataVolumeHostActionAbiRef =
  "contracts/app-release-channel.json#local_data_lifecycle.owner_storage_projections.webui_data_volume.host_action_abi";
export const appOwnedStorageCarrierBehavior = {
  desktop: {
    core_route: "/settings/storage",
    local_lifecycle_transport: "electron_ipc",
    local_sections: [
      "updater_cache",
      "user_data_artifacts",
      "runtime_substrate",
      "logs",
    ],
    owner_projection_policy: "merge_valid_sections_non_blocking",
  },
  webui: {
    core_route: "/settings/storage",
    local_lifecycle_transport: "owner_projected_host_action_only_no_electron_ipc",
    local_sections: [],
    visible_section_source: "valid_owner_projections_only",
    missing_projection_policy:
      "fail_open_keep_route_available_and_omit_missing_sections",
    manual_refresh:
      "owner_inventory_actions_all_settled_then_force_fresh_fast_app_state",
    unknown_bytes_policy: "unavailable_never_zero",
    host_action_abi_ref: appOwnedWebuiDataVolumeHostActionAbiRef,
    host_action_policy:
      "complete_carrier_host_abi_enables_plan_execute_restore_else_status_only_fail_open",
    shell_or_docker_action_inference_allowed: false,
    raw_host_paths_visible: false,
  },
};
export const appOwnedSettingsProductPageIds = [
  ...appOwnedSettingsTopLevelEntryIds,
  ...appOwnedSecondarySettingsPages,
];
export const appOwnedSettingsTechnicalDetailsDefault = {
  overview: "not_applicable",
  gateway: "not_applicable",
  models: "not_applicable",
  workspace: "explicit_action_modal",
  agents: "collapsed",
  capabilities: "collapsed",
  resources: "explicit_action_modal",
  maintenance: "collapsed",
  storage: "explicit_action_modal",
  preferences: "not_applicable",
  about: "explicit_action_modal",
};
export const appOwnedSettingsPageAnchors = {
  overview: ["status", "attention", "next-action", "codex", "gateway"],
  gateway: ["connection", "account", "usage", "access"],
  models: ["provider-source", "model", "codex-cli"],
  workspace: [
    "current-workspace",
    "permissions",
    "artifacts",
    "personalization",
    "system-agents",
    "additional-instructions",
  ],
  agents: ["catalog", "package-role", "availability", "source", "home-visibility"],
  capabilities: ["opl-flow-managed", "opl-managed-companion", "third-party"],
  resources: [
    "local-browser-access",
    "web-access",
    "resource-readiness",
    "action-readiness",
    "external-resources",
  ],
  maintenance: ["health", "managed-dependencies", "updates", "services", "diagnostics"],
  storage: [
    "storage-categories",
    "deployment-locations",
    "archives",
    "cleanup-preview",
    "cleanup-history",
  ],
  preferences: [
    "behavior",
    "notifications",
    "models-performance",
    "display-fonts",
    "themes",
  ],
  about: ["version", "channel", "updates", "help-feedback"],
};
export const appOwnedSettingsPageSearchEntryIds = {
  overview: [
    "overview.status",
    "overview.attention",
    "overview.next_action",
    "overview.codex",
    "overview.gateway",
  ],
  gateway: ["gateway.connection", "gateway.account", "gateway.usage", "gateway.access"],
  models: ["models.provider_source", "models.model", "models.codex_cli"],
  workspace: [
    "workspace.current",
    "workspace.permissions",
    "workspace.artifacts",
    "personalization.system_agents",
    "personalization.additional_instructions",
  ],
  agents: [
    "agents.catalog",
    "agents.availability",
    "agents.source",
    "agents.home_visibility",
  ],
  capabilities: [
    "capabilities.opl_flow_managed",
    "capabilities.opl_managed_companion",
    "capabilities.third_party",
  ],
  resources: [
    "resources.local_browser_access",
    "resources.web_access",
    "resources.readiness",
    "resources.executable",
    "resources.external",
  ],
  maintenance: [
    "maintenance.health",
    "maintenance.managed_dependencies",
    "maintenance.updates",
    "maintenance.services",
    "maintenance.diagnostics",
    "maintenance.log_directory",
  ],
  storage: [
    "storage.categories",
    "storage.deployment_locations",
    "storage.archives",
    "storage.preview",
    "storage.history",
  ],
  preferences: [
    "preferences.behavior",
    "preferences.notifications",
    "preferences.performance",
    "preferences.display_fonts",
    "preferences.themes",
  ],
  about: [
    "about.version",
    "about.channel",
    "about.help_feedback",
    "about.updates",
  ],
};
export const appOwnedSettingsCapabilitiesTabContract = {
  surface_label_zh: "能力",
  surface_label_en: "Capabilities",
  tab_order: ["opl_flow_managed", "opl_managed_companion", "manual_and_third_party"],
  default_tab: "opl_flow_managed",
  on_demand_tab_ids: [],
};
export const appOwnedSettingsResourcesBrowserEntry = {
  label_zh: "这台电脑的浏览器访问",
  label_en: "Browser access to this computer",
  placement: "resources_primary_information",
  visibility: "always",
  action_policy: "open_existing_local_browser_access_settings",
  implementation_provenance_visibility: "technical_details_only",
};
export const appOwnedSettingsResourceActionBehavior = {
  read_only_actions: {
    open: {
      execution_policy: "navigate_shell_to_projected_browser_url",
      required_projection_field: "browser_url",
      completion_evidence: "shell_navigation_dispatched_to_exact_browser_url",
    },
    diagnose: {
      execution_policy: "invoke_projected_diagnose_action_and_render_result",
      completion_evidence: "diagnose_result_or_action_receipt_visible",
    },
  },
  mutating_actions: {
    precheck_required: true,
    explicit_confirmation_required: true,
    execution_policy:
      "execute_projected_mutation_only_after_successful_precheck_and_explicit_confirmation",
    completion_evidence: "mutation_result_or_action_receipt_visible",
  },
  dry_run_boundary: {
    role: "precheck_only",
    allowed_claim: "precheck_passed",
    forbidden_completion_claims: [
      "resource_opened",
      "diagnosis_completed_without_diagnose_execution",
      "deployment_completed",
      "mutation_completed",
    ],
  },
};
export const appOwnedSettingsProjectionSectionIds = [
  "overview",
  "gateway",
  "models",
  "workspace",
  "agents",
  "capabilities",
  "resources",
  "maintenance",
  "storage",
  "preferences",
];
export const appOwnedSettingsProjectionItemFields = [
  "item_id",
  "surface_class",
  "scope",
  "owner",
  "risk",
  "normal_summary",
  "next_action",
  "details_ref",
  "editable_reason",
];
export const appOwnedSettingsIssueStatuses = [
  "needs_action",
  "in_progress",
  "resolved",
  "blocked",
  "dismissed",
];
export const appOwnedSettingsSearchProtocol = {
  global_entry_count: 1,
  entry_testid: "settings-search-input",
  scope: "bilingual_item_level_index",
  languages: ["zh-CN", "en"],
  result_label_format: "{page_label} > {entry_label}",
  result_policy: "select_result_navigates_to_owner_route_and_anchor",
  anchor_transport: "route_id_plus_anchor_field_with_section_query_fallback",
  compatibility_index_policy:
    "index_update_theme_local_services_and_personalization_under_owner_page_anchors",
  empty_state: "show_no_matching_settings_without_exposing_internal_route_ids",
};
export const appOwnedSettingsVisualSystem = {
  style: "codex_quiet_control_center_with_opl_information_architecture",
  style_exclusion: "multi_hue_card_dashboard",
  baseline_shell_commit: "409dd0c3b693f1c7c93551654dfac8fb9420843d",
  baseline_comparison_policy:
    "fresh_same_route_screenshots_must_preserve_or_improve_information_hierarchy",
  card_policy: "unframed_sections_with_bounded_groups_only_for_repeated_entities_or_confirmation",
  first_viewport_spatial_group_range: { min: 2, max: 4 },
  nested_cards_allowed: false,
  page_wide_list_wall_allowed: false,
  page_sections_as_floating_cards_allowed: false,
  desktop_group_layout: "single_column_reading_lane",
  mobile_group_layout: "single_column_stack",
  icon_slot_px: 20,
  typography: {
    page_title: "20/28/600",
    card_title: "14-16/20-24/600",
    description: "13/20/400",
    supporting: "12/18/400",
  },
  status_color_semantics: {
    normal: "muted",
    warning: "orange",
    error: "red",
    action: "brand",
  },
  object_accent_policy:
    "use monochrome utility navigation icons and reserve color for typed warning error success and brand actions",
  footer_layout: "compact",
  footer_controls: [
    "gateway_account_or_account_access_entry",
    "app_update_status_and_trigger",
  ],
  footer_account_entry_policy:
    "show_gateway_display_name_when_connected_else_account_access_without_a_duplicate_settings_entry",
  footer_update_entry_policy:
    "show_confirmed_newer_app_update_as_account_row_trailing_action_and_reuse_existing_carrier_updater_without_owning_update_truth",
  footer_theme_quick_toggle_allowed: false,
  footer_secondary_navigation_allowed: true,
  footer_auxiliary_navigation: "about_only_sidebar_bottom",
  footer_duplicate_settings_entry_allowed: false,
  appearance_mode_values: ["system", "light", "dark"],
  appearance_mode_presentation: "three_visual_preview_cards",
  appearance_mode_preserves_theme_preset: false,
  theme_gallery_presentation: "not_exposed",
  theme_swatch_list_allowed: false,
  max_border_radius_px: 8,
  spacing_scale_px: [12, 16, 24],
  heading_density: "compact",
  primary_action_per_page_max: 1,
  normal_state_emphasis: "muted",
  exception_state_emphasis: "accent_only_when_attention_required",
  technical_details_default: "collapsed",
  letter_spacing_px: 0,
};
export const appOwnedSettingsPageExperienceFields = [
  "product_page_id",
  "route_id",
  "matrix_page_id",
  "label_zh",
  "label_en",
  "primary_information",
  "first_viewport_groups",
  "primary_action",
  "exception_state",
  "technical_details_boundary",
  "required_dom",
  "required_anchors",
  "search_entry_ids",
];
export const appOwnedSettingsSearchEntryFields = [
  "id",
  "page_id",
  "anchor",
  "label_zh",
  "label_en",
  "keywords_zh",
  "keywords_en",
];
export const appOwnedSettingsCardFields = [
  "id",
  "title",
  "state",
  "summary",
  "recommended_action",
  "last_checked_at",
  "details_disclosure",
];
export const appOwnedSettingsConfirmationFields = [
  "action_id",
  "summary",
  "will_change",
  "will_not_change",
  "rollback_or_receipt",
  "requires_preview_or_proof",
];
export const appOwnedSettingsPostUpdateNoticeFields = [
  "component_id",
  "result",
  "receipt_ref",
  "next_check",
  "restart_or_reload_guidance",
];
export const appOwnedSettingsMakeUsableAllowedSteps = [
  "run existing repair prep",
  "check managed update status",
  "repair components with explicit repair receipt",
  "apply safe non-restart package or Codex Surface sync actions",
  "refresh fast App state",
];
export const appOwnedSettingsMakeUsableForbiddenSteps = [
  "implement a second updater kernel",
  "write runtime truth, domain truth, owner receipts, or typed blockers",
  "silently apply OPL Runtime Fabric changes that require restart",
  "silently update dirty or developer checkouts",
  "rollback automatically without explicit per-component user confirmation",
];
export const appOwnedSettingsVisualQaTargets = [
  "desktop_settings_overview",
  "desktop_settings_gateway",
  "desktop_settings_models",
  "desktop_settings_workspace",
  "desktop_settings_agents",
  "desktop_settings_capabilities",
  "desktop_settings_resources",
  "desktop_settings_maintenance",
  "desktop_settings_storage",
  "desktop_settings_preferences",
];
export const appOwnedSettingsUpstreamIntakeClassifications = [
  "accepted",
  "adapt",
  "redirect",
  "reject",
];
export const appOwnedSettingsProductSystemItemIds = [
  "control_center_positioning",
  "ten_entry_ia",
  "secondary_route_strategy",
  "compatibility_anchor_routes",
  "single_control_plane",
  "host_adapter_slot",
  "per_page_experience_contracts",
  "view_model_layer",
  "issue_action_protocol",
  "maintenance_noise_reduction",
  "workspace_normal_state",
  "workspace_personalization_owner",
  "gateway_single_owner",
  "model_access_source",
  "capabilities_experience",
  "resources_readiness_boundary",
  "data_storage_safety",
  "owner_storage_projection",
  "preferences_user_language",
  "maintenance_diagnostics",
  "about_update_summary",
  "startup_cache_hydration",
  "managed_dependency_currentness",
  "ownership_no_duplicates",
  "user_copy_system",
  "settings_search",
  "visual_system",
  "screenshot_qa",
  "contract_validators",
  "worktree_lane_hygiene",
  "installed_release_currentness",
];
export const appOwnedSettingsProductSystemTracks = [
  "product_positioning",
  "ia_routes",
  "control_plane",
  "shell_adapter",
  "state_action_protocol",
  "user_task_ux",
  "visual_qa",
  "ops_hygiene",
  "release_currentness",
];
export const legacySettingsRouteRedirects = {
  overview: "general",
  runtime: "environment",
  system: "environment#diagnostics",
  advanced: "environment#diagnostics",
  model: "access",
  agent: "agents",
  assistants: "capabilities#third-party",
  "skills-hub": "capabilities#third-party",
  tools: "capabilities#third-party",
  display: "appearance",
  webui: "resources",
  pet: "appearance",
};
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
export const appOwnedAgentPackageOrdinaryStatusInputMapping = {
  schema: "agent_package_ordinary_status_input_mapping.v1",
  visibility: "implementation_and_advanced_diagnostics_only",
  precedence: [
    "temporarily_unavailable",
    "disabled",
    "supporting_without_direct_entry",
    "available_verified",
    "available_auto_confirm",
    "localized_owner_action_required",
    "unlocalized_owner_attention",
    "checking",
  ],
  signals: {
    disabled:
      "installed_true_and_configured_carrier_disabled_with_complete_recommended_action_ref_semantic_enable",
    supporting_without_direct_entry:
      "package_role_capability_package_and_operational_ready_true_and_codex_visibility_not_visible",
    available_verified: "operational_ready_true_and_launch_allowed_true",
    available_auto_confirm:
      "readiness_status_verification_deferred_or_reason_live_verification_deferred_or_scope_materialization_missing_with_package_installed_and_exposed",
    localized_owner_action_required:
      "owner_projection_requires_one_complete_settings_action_with_projected_semantic_surface_payload_and_confirmation",
    unlocalized_owner_attention:
      "owner_projection_requires_user_intervention_but_no_complete_settings_action_is_projected",
    temporarily_unavailable: "owner_projection_reports_blocked_failed_or_status_read_error",
    checking: "canonical_directory_or_readiness_state_is_loading_unknown_or_stale",
  },
  scope_materialization_policy:
    "Settings_projects_available_with_no_preflight_action_and_reserves_scope_activation_for_Framework_domain_StageRun_or_StageAttempt",
  status_index_repair_action_role:
    "technical_diagnostics_only_never_ordinary_status_or_action_selection",
};
export const appOwnedAgentPackageUserStatusProjection = {
  schema: "agent_package_user_status_projection.v3",
  locale_policy: "follow_current_app_locale_with_zh_CN_and_en_US_required",
  primary_status_policy:
    "one_user_facing_status_one_concrete_explanation_and_at_most_one_most_relevant_action_per_package_without_contradictory_badges",
  per_package_identity_key: "package_id",
  aggregate_status_policy:
    "count_only_standard_agent_direct_conversation_availability_and_never_override_each_projected_package_status",
  aggregate_projection: {
    schema: "agent_package_standard_agent_direct_entry_aggregate.v1",
    population: "directory_entries_where_package_role_standard_agent",
    available_numerator:
      "population_entries_projected_as_available_with_direct_conversation_entry",
    excluded_package_roles: ["workflow_profile", "capability_package"],
    label_i18n: {
      "zh-CN": "专业智能体可直接对话：{available} / {total}",
      "en-US": "Professional agents ready for conversation: {available} / {total}",
    },
    empty_policy: "show_zero_of_zero_without_substituting_all_directory_entries",
  },
  ordinary_row_cardinality: {
    user_status: 1,
    concrete_explanation: 1,
    most_relevant_action_max: 1,
    technical_status_fields: "details_only",
  },
  input_mapping_ref: "ordinary_user_status_input_mapping",
  raw_internal_status_visibility: "advanced_diagnostics_only",
  rules: [
    {
      id: "disabled",
      when: "disabled",
      user_status_id: "disabled",
      label_i18n: { "zh-CN": "已停用", "en-US": "Disabled" },
      explanation_i18n: {
        "zh-CN": "已安装，但当前已停用。",
        "en-US": "Installed, but currently disabled.",
      },
      primary_action_policy:
        "execute_only_the_complete_recommended_action_ref_when_semantic_enable_surface_settings_and_payload_exposure_action_enable",
    },
    {
      id: "supporting_without_direct_entry",
      when: "supporting_without_direct_entry",
      user_status_id: "available",
      label_i18n: { "zh-CN": "可用", "en-US": "Available" },
      explanation_i18n: {
        "zh-CN": "作为配套能力使用，无独立对话入口。",
        "en-US": "Available as a supporting capability without a standalone conversation entry.",
      },
      primary_action_policy: "none",
    },
    {
      id: "available_verified",
      when: "available_verified",
      user_status_id: "available",
      label_i18n: { "zh-CN": "可用", "en-US": "Available" },
      explanation_i18n: {
        "zh-CN": "可直接发起对话，无需提前操作。",
        "en-US": "You can start a conversation now; no advance action is required.",
      },
      primary_action_policy: "none",
    },
    {
      id: "available_auto_confirm",
      when: "available_auto_confirm",
      user_status_id: "available",
      label_i18n: { "zh-CN": "可用", "en-US": "Available" },
      explanation_i18n: {
        "zh-CN": "已安装，可直接发起对话，无需提前设置。",
        "en-US": "Installed and ready for conversation; no advance setup is required.",
      },
      primary_action_policy: "none",
    },
    {
      id: "owner_projected_action_available",
      when: "localized_owner_action_required",
      user_status_id: "action_available",
      label_i18n: { "zh-CN": "可继续处理", "en-US": "Action available" },
      explanation_i18n: {
        "zh-CN": "提供者已给出下一步操作。",
        "en-US": "The provider has projected the next action.",
      },
      primary_action_policy:
        "show_the_complete_recommended_action_ref_without_mapping_or_branching_on_action_id",
    },
    {
      id: "unlocalized_owner_attention",
      when: "unlocalized_owner_attention",
      user_status_id: "needs_attention",
      label_i18n: { "zh-CN": "需要处理", "en-US": "Needs attention" },
      explanation_i18n: {
        "zh-CN": "打开详情查看具体原因和下一步。",
        "en-US": "Open details to see the specific reason and next step.",
      },
      primary_action_policy: "open_details_only_without_a_generic_setup_or_action_label",
    },
    {
      id: "temporarily_unavailable",
      when: "temporarily_unavailable",
      user_status_id: "temporarily_unavailable",
      label_i18n: { "zh-CN": "暂时无法使用", "en-US": "Temporarily unavailable" },
      explanation_policy:
        "show_one_localized_owner_reason_and_at_most_one_exact_owner_projected_recovery_action",
    },
    {
      id: "checking",
      when: "checking",
      user_status_id: "checking",
      label_i18n: { "zh-CN": "正在确认", "en-US": "Checking" },
      explanation_i18n: {
        "zh-CN": "正在确认当前状态，请稍候。",
        "en-US": "Confirming the current status.",
      },
      primary_action_policy: "none",
    },
  ],
  forbidden_ordinary_labels_zh: [
    "待验证",
    "需关注",
    "对话中可用",
    "对话中不可用",
    "不可使用",
    "首次使用时检查",
    "需要完成设置",
    "需要操作",
    "完成下方操作后即可使用",
    "需要为当前工作区启用",
    "暂时不能使用",
    "正在读取状态",
  ],
  forbidden_ordinary_labels_en: [
    "Verification deferred",
    "Needs attention",
    "Available in conversation",
    "Unavailable in conversation",
    "Checked on first use",
    "Setup required",
    "Action required",
    "Complete the action below",
    "Enable for this workspace",
  ],
  technical_input_policy:
    "raw readiness fields and reason codes are consumed only through the input mapping and may appear only in advanced details",
};
export const appOwnedSendFailureInputPolicy = {
  must_preserve_send_scoped_local_inputs: true,
  failure_scopes: [
    "conversation_creation",
    "initial_message_send",
    "in_conversation_send",
  ],
  preserved_inputs: ["prompt", "attachments"],
  success_consumption_policy: "clear_only_the_accepted_send_snapshot",
  failure_restore_policy:
    "restore_failed_send_snapshot_to_the_current_composer",
  concurrent_edit_merge_policy:
    "prepend_failed_prompt_before_post_submit_user_input_without_overwriting_it_and_union_attachments_by_path",
  initial_message_handoff_policy:
    "consume_single_attempt_storage_before_send_and_restore_to_composer_on_failure",
};

export const appOwnedCodexSubagentActivityPolicy = {
  feature_id: "B0-11",
  product_role: "read_only_delegated_execution_projection",
  source:
    "existing_codex_acp_tool_call_metadata_and_single_codex_app_server_adapter",
  metadata_authority: {
    collaboration: "_meta.codex.collaboration",
    subagent: "_meta.codex.subagent",
  },
  state_mapping: {
    active_agent_states: ["pendingInit", "running"],
    done_agent_states: [
      "interrupted",
      "completed",
      "errored",
      "shutdown",
      "notFound",
    ],
    active_tool_call_statuses: ["pending", "in_progress"],
    done_tool_call_statuses: ["completed", "failed"],
    unknown_or_malformed: "generic_tool_call_fallback",
    canonical_child_thread_status_not_loaded_is_not_activity_state: true,
  },
  display: {
    groups: ["active", "done"],
    read_only: true,
    detail_fields: [
      "prompt",
      "message",
      "result",
      "model",
      "reasoning_effort",
      "agent_path",
      "thread_id",
    ],
    open_thread_action:
      "canonical_conversation_route_after_existing_projection_or_thread_read_materialization",
    open_failure_policy: "non_blocking_keep_current_conversation_usable",
  },
  forbidden_layers: [
    "second_app_server_client",
    "background_subagent_poller",
    "aionui_team_store",
    "shell_subagent_scheduler",
    "shell_owned_subagent_execution_authority",
    "bespoke_direct_subagent_control_buttons",
  ],
};
const appOwnedOrdinaryConversation = {
  path_id: "ordinary_codex_conversation",
  entry_source:
    "home_starter_workspace_initialized_or_projectless_new_session",
  executor: "codex_cli",
  composer_position: "floating_bottom_with_safe_inset",
  active_capability_chip_visible: true,
  persistent_purpose_selector_visible: false,
  backend_selector_visible: false,
  model_selector_visible: true,
  permission_mode_selector_visible: true,
  permission_mode_language_policy:
    "automation_and_file_access_in_user_language",
  provider_selector_visible: false,
  model_status_surface: "executor_policy.default_model_display_value",
  technical_details_policy:
    "single_compact_model_reasoning_menu_without_backend_or_provider",
  composer_placeholder_policy:
    "opl_owned_localized_task_prompt_without_backend_name_interpolation",
  composer_context_strip: ["active_capability"],
  composer_send_scoped_inputs: ["attachments"],
  composer_send_scoped_consumption_policy:
    "consumed_by_current_send_not_persisted_in_context_strip",
  send_failure_input_policy: appOwnedSendFailureInputPolicy,
  composer_forbidden_persistent_context: [
    "project",
    "workspace",
    "locality",
    "branch",
    "attachments",
    "workspace_context_refs",
  ],
  composer_bottom_action_row: [
    "unified_context_menu",
    "permission_access_mode",
    "model_reasoning",
    "send_stop",
  ],
  composer_optional_actions: ["voice"],
  mobile_action_sheet: {
    trigger: "+",
    allowed_actions: [
      "unified_context_menu",
      "permission_access_mode",
      "model_reasoning",
      "active_capability",
    ],
    send_stop_location: "composer_primary_action_outside_sheet",
    forbidden_actions: [
      "backend",
      "provider",
      "team",
      "raw_mcp",
      "arbitrary_skills",
    ],
  },
  unified_context_menu: appOwnedUnifiedContextMenu,
  projectless_conversation_supported: true,
  session_workspace_model: appOwnedSessionWorkspaceModel,
  explicit_session_input_policy: appOwnedExplicitSessionInputPolicy,
  codex_subagent_activity: appOwnedCodexSubagentActivityPolicy,
};
export const appOwnedTranscriptExport = {
  scope: "current_conversation_transcript_only",
  history_loading_policy: "load_all_pages_before_export",
  incomplete_history_policy: "explicit_error_no_partial_export",
  silent_truncation_allowed: false,
  shareable_roles: ["user", "assistant"],
  shareable_message_types: ["text"],
  excluded_content: [
    "system_messages",
    "hidden_messages",
    "tool_calls",
    "runtime_events",
    "provider_payloads",
    "receipts",
  ],
  default_format: "markdown",
  allowed_formats: ["markdown", "json"],
  strict_json_document_fields: ["title", "exported_at", "messages", "redacted"],
  strict_json_message_fields: ["role", "content"],
  redaction_required: true,
  explicit_directory_required: true,
  explicit_filename_required: true,
  filename_extension_follows_format: true,
  errors_visible: true,
  workspace_bundle_authorized: false,
};
export const appOwnedArtifactPreview = {
  surface: "existing_aionui_preview_context_and_panel",
  entry_sources: [
    "session_attachment_ref",
    "conversation_result_ref",
    "explicit_absolute_local_path",
  ],
  supported_content_types: ["markdown", "pdf", "code", "image", "html", "diff"],
  markdown_embedded_renderers: ["mermaid", "katex", "code"],
  ref_resolution_policy:
    "explicit_session_attachment_or_conversation_result_ref_or_user_selected_legal_absolute_local_path_without_copying_artifact_body",
  session_reference_policy: {
    attachment_ref_scope: "current_session_explicit_attachment_only",
    conversation_result_ref_scope: "current_session_visible_result_only",
    workspace_membership_required: false,
    implicit_workspace_ref_allowed: false,
  },
  explicit_local_path_policy: {
    user_initiated_only: true,
    path_form: "legal_absolute_local_file_path",
    workspace_membership_required: false,
    access_authority: "codex_permission_approval_and_sandbox",
    automatic_silent_read_allowed: false,
  },
  forbidden_inputs: [
    "relative_parent_traversal",
    "illegal_or_unsupported_scheme",
    "automatic_silent_read",
    "implicit_workspace_context_ref",
  ],
  artifact_body_authority: "external_owner_ref_only",
  keyboard_reachable_open_action: true,
  failure_policy: "keep_ref_visible_and_fail_closed_with_reason",
  unsafe_or_unsupported_ref_policy: "do_not_open_or_guess_content",
};
export const appOwnedGuiContractOrdinaryConversation = {
  ...appOwnedOrdinaryConversation,
  model_status_surface: "executor_policy.default_model_display_value",
  transcript_export: appOwnedTranscriptExport,
  artifact_preview: appOwnedArtifactPreview,
};
export const appOwnedCurrentTaskSlice = {
  source: "contracts/app-runtime-bridge.json#current_task_slice_projection",
  state_source: "opl app state --profile fast --json",
  scope: "current_conversation_or_selected_task",
  placement: "message_timeline",
  single_instance: true,
  default_visibility: "inline_unpinned_when_task_active",
  ordinary_task_sticky: false,
  sticky_when: ["user_pinned", "long_running_true"],
  long_running_signal_field: "long_running",
  duplicate_surface_allowed: false,
  summary_fields: ["status", "elapsed", "progress", "next_action", "stop"],
  fields: [
    "task_id",
    "status",
    "stage",
    "progress_label",
    "elapsed_seconds",
    "plan_ref",
    "latest_receipt_ref",
    "latest_artifact_ref",
    "task_identity",
    "status",
    "progress",
    "conditions",
    "evidence_cards",
    "action_cards",
    "resource_cards",
    "diagnostics_ref",
    "gateway_status_ref",
    "resource_source_refs",
    "environment_ref",
    "storage_ref",
    "resource_plan_ref",
    "resource_approval_ref",
    "resource_usage_ref",
    "console_policy_ref",
    "environment_template_ref",
    "environment_version_ref",
    "source_material_refs",
    "source_material_receipt_refs",
    "reference_design_packet_refs",
    "structured_result_panel",
    "artifact_provenance_card",
    "ref_level_follow_up_refs",
  ],
  independent_task_store_allowed: false,
  model_ref: "contracts/app-runtime-bridge.json#task_awareness_projection",
  slice_policy:
    "same_task_run_projection_v2_filtered_by_current_conversation_or_selected_task",
};
export const appOwnedPageStateOrdinaryConversation = {
  ...Object.fromEntries(
    Object.entries(appOwnedOrdinaryConversation).map(([key, value]) =>
      key === "model_status_surface"
        ? [
            "model_status_surface_ref",
            "contracts/app-gui-product-contract.json#executor_policy.default_model_display_value",
          ]
        : [key, value],
    ),
  ),
  conversation_rendering_ref:
    "contracts/app-gui-product-contract.json#interaction_baseline.visual_target.conversation_rendering",
  transcript_export: appOwnedTranscriptExport,
  current_task_slice: appOwnedCurrentTaskSlice,
  artifact_preview: appOwnedArtifactPreview,
};
export const appOwnedRightContextInspectorPolicy = {
  compatibility_name: "right_context_inspector",
  product_role: "on_demand_advanced_workspace_and_task_evidence_host",
  placement: "right_or_mobile_overlay",
  surface_kind: "on_demand_workspace_surface",
  default_state: "closed",
  default_third_column_visible: false,
  opens_on_user_or_task_request_only: true,
  chat_canvas_remains_primary: true,
  scope: "selected_workspace_and_conversation",
  toggle_ownership: {
    visible_toggle_count_per_viewport_state: 1,
    collapsed_owner: "conversation_header",
    expanded_owner: "workspace_panel_header",
    global_titlebar_duplicate_allowed: false,
    floating_handle_duplicate_allowed: false,
  },
  workspace_surface: {
    id: "files_changes",
    label: "Files / Changes",
    default_state: "closed",
    opens_when: [
      "user_requests_files_or_changes",
      "task_requires_workspace_inspection",
    ],
  },
  preview_surface: {
    id: "preview",
    independent: true,
    default_state: "closed",
    opens_for: ["artifact", "file", "url", "result"],
  },
  review_surface: {
    host_surface: "existing_files_changes_diff_surface",
    default_state: "closed",
    opens_on_user_request: true,
    review_targets: ["uncommitted", "base_branch", "commit", "custom"],
    delivery_modes: ["inline", "detached"],
    default_section: "unstaged",
    sections: ["unstaged", "staged", "commit", "branch", "last_turn"],
    capabilities: [
      "pull_request_context",
      "inline_comments",
      "stage",
      "commit",
      "push",
    ],
    pull_request_context_dependency: "gh",
    pull_request_context_unavailable_policy: "show_explicit_unavailable_state",
    git_authority: "existing_codex_git_integration",
    shell_role: "thin_adapter_only",
    duplicate_git_store_allowed: false,
    legacy_equal_weight_review_tab_allowed: false,
  },
  on_demand_task_tools: {
    terminal: {
      entry_points: ["environment", "task_need"],
      default_state: "closed",
    },
    browser: {
      entry_points: ["environment", "task_need"],
      default_state: "closed",
    },
  },
  equal_weight_tool_taxonomy_allowed: false,
  legacy_taxonomy_ids_forbidden: [
    "review",
    "terminal",
    "browser",
    "files",
    "artifacts",
    "runtime",
    "actions",
    "memory",
  ],
  runtime_duplicate_allowed: false,
  environment_popover_ref:
    "interaction_baseline.context_surfaces.environment_popover",
};
export const appOwnedReviewSurfaceSourceEvidence = {
  source_status:
    "partial_last_turn_and_custom_target_instructions_implemented_review_focus_and_inline_comments_protocol_blocked",
  source_capability_status: {
    last_turn: "source_implemented_existing_message_store",
    review_focus_context: "source_blocked_missing_public_review_focus_protocol",
    inline_comments: "source_blocked_missing_typed_codex_protocol",
  },
  last_turn_source_policy:
    "latest_visible_user_message_then_completed_workspace_edit_tool_calls",
  review_focus_delivery_policy:
    "custom_target_instructions_via_review_start_target_custom_only_non_custom_focus_not_exposed",
  review_focus_failure_policy:
    "non_custom_focus_protocol_unavailable_before_review_start_without_turn_steer_fallback_fake_success_audit_or_side_effects",
  inline_comment_protocol_requirement:
    "typed_codex_app_server_file_line_comment_request_location_and_failure_semantics",
  inline_comment_forbidden_fallbacks: ["shell_local_annotation_store", "fake_success"],
};
export const appOwnedRightContextInspectorForbiddenOwners = [
  "runtime truth",
  "domain truth",
  "artifact body",
  "memory body",
  "backend selection authority",
];
export const firstRunEcosystemModules = [
  "officecli",
  "mineru",
  "opl-meta-agent",
];
export const temporalLocalServiceDefaults = {
  address_env: "OPL_TEMPORAL_ADDRESS",
  default_address: "127.0.0.1:7233",
  namespace_env: "OPL_TEMPORAL_NAMESPACE",
  default_namespace: "default",
  task_queue_env: "OPL_TEMPORAL_TASK_QUEUE",
  default_task_queue: "opl-stage-attempts",
};
export const temporalManagedCommands = [
  "opl family-runtime service start --provider temporal",
  "opl family-runtime service restart --provider temporal",
  "opl family-runtime service supervisor status --provider temporal",
  "opl family-runtime service supervisor install --provider temporal",
  "opl family-runtime service supervisor trigger --provider temporal",
  "opl family-runtime worker status --provider temporal",
  "opl family-runtime worker start --provider temporal",
  "opl family-runtime residency proof --provider temporal --production",
];
