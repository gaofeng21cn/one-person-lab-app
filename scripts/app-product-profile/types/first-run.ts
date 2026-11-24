export type AppFirstRunProfile = {
  readiness_layers: string[];
  ready_to_launch_gate: {
    id: string;
    ui_order: string;
    guid_navigation_blocking: boolean;
    required_core_items: string[];
    must_not_require: string[];
  };
  full_readiness_layers: string[];
  deferred_blockers: string[];
  runtime_provider: {
    full_readiness_provider: string;
    ready_to_launch_blocking: boolean;
  };
  full_runtime_package_qualification: {
    source: string;
    reconciliation: string;
    composition_policy: string;
    readiness_policy: string;
    workspace_scoped_materialization_policy: string;
    global_workspace_scoped_exposure: string;
  };
  first_conversation: {
    gate: string;
    runtime_readiness_method: string;
    runtime_readiness_route: string;
    retired_route: string;
    route_failure_policy: string;
    source_command: string;
    ready_to_launch_must_be_true: boolean;
    required_before_plain_send: string[];
    required_before_send_with_local_inputs: string[];
    required_before_workspace_controls: string[];
    unknown_readiness_policy: string;
    blocked_feedback: string;
    must_wait_for: string[];
    must_not_wait_for: string[];
    failure_policy: string;
  };
  ordinary_shell_recovery: {
    fresh_webui_login_setup_check: {
      trigger: string;
      route_intent: string;
      state_source: string;
      known_incomplete_behavior: string;
      ready_behavior: string;
      unknown_timeout_or_read_failure_behavior: string;
      ui_timeout_ms: number;
      ordinary_startup_refresh_and_deep_link_behavior: string;
      consumption_policy: string;
    };
    persistent_setup_entry: {
      visibility: string;
      surface: string;
      target_route: string;
      label_policy: string;
      must_preserve_current_route_until_clicked: boolean;
    };
    persistent_home_composer_runtime_alert: string;
    plain_conversation: {
      required_items: string[];
      workspace_root_required: boolean;
      blocked_feedback: string;
      must_preserve_prompt: boolean;
    };
    send_scoped_local_inputs: {
      required_items: string[];
      workspace_root_required: boolean;
      supported_inputs: string[];
    };
    workspace_controls: {
      required_items: string[];
      restricted_capabilities: string[];
      blocked_feedback: string;
      plain_conversation_remains_available: boolean;
      send_scoped_local_inputs_remain_available: boolean;
    };
    unknown_readiness_policy: string;
  };
  progress_model: {
    source_command: string;
    source_path: string;
    renderer_truth_policy: string;
    required_setup_flow_fields: string[];
    required_progress_fields: string[];
    required_checklist_fields: string[];
    required_visible_elements: string[];
  };
  command_line_tools: {
    auto_request_installer: boolean;
    blocks_full_first_launch: boolean;
    messages: string[];
  };
  beginner_presentation: {
    audience: string;
    presentation_mode: string;
    primary_user_goal: string;
    primary_steps: string[];
    primary_progress_signal: string;
    advanced_progress_disclosure: string;
    background_maintenance_presentation: string;
    technical_detail_policy: string;
    layout_mode: string;
    ordinary_navigation_policy: string;
    step_navigation_policy: string;
    current_task_policy: string;
    current_task_selection_policy: string;
    progress_display_policy: string;
    model_access_choice_policy: string;
    model_access_inflight_policy: string;
    model_access_setup: {
      desktop_default_method: string;
      desktop_method_order: string[];
      gateway_account: {
        credentials: string[];
        device_label_policy: string;
        secret_bridge_ref: string;
        post_login_state_source: string;
        unique_group_action: string;
        post_setup_state_refresh: string;
        model_access_action: string;
        model_access_action_policy: string;
        model_access_confirmation: {
          trigger: string;
          label_zh: string;
          label_en: string;
          danger_level: string;
          confirmation_required: boolean;
          gateway_login_counts_as_confirmation: boolean;
          action_visibility: string;
          fresh_state_required_before_execute: boolean;
          fresh_state_required_after_execute: boolean;
        };
        shared_fast_state_cache_policy: string;
        unresolved_group_error: string;
        ready_claim_policy: string;
        password_clear_policy: string;
        diagnostic_policy: string;
      };
      api_key: {
        role: string;
        bridge: string;
        transport: string;
        redaction_policy: string;
      };
      existing_codex_recheck: {
        role: string;
        bridge: string;
        mutates_configuration: boolean;
      };
      webui: {
        default_method: string;
        allowed_methods: string[];
        gateway_password_login: boolean;
        gateway_login_route: string;
        transport: string;
      };
    };
    completion_transition_policy: string;
    completion_navigation_policy: string;
    defer_navigation_policy: string;
    technical_detail_navigation_policy: string;
    request_exclusivity_policy: string;
    pending_state_policy: string;
    core_readiness_status_policy: string;
    minimum_window_primary_action_policy: string;
    background_shell_interaction_policy: string;
    window_control_policy: string;
    raw_error_policy: string;
    secret_diagnostic_policy: string;
    accessible_name_policy: string;
    post_install_ai_self_check_entry: {
      trigger: string;
      target_route: string;
      route_state: string;
      prompt_policy: string;
      target_state_checks: string[];
      mutation_policy: string;
      release_gate_policy: string;
    };
  };
};
