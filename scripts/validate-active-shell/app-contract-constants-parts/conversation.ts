import { appOwnedOrdinaryConversation } from './ordinary-chat.ts';

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
