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
