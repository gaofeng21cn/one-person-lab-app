import {
  appOwnedExplicitSessionInputPolicy,
  appOwnedSessionWorkspaceModel,
  appOwnedUnifiedContextMenu,
} from './session.ts';

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
export const appOwnedOrdinaryConversation = {
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
