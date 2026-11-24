import { assertDeepEqualJson } from '../assertions.ts';

export function validateCodexParityAdapterPolicies(runtimeBridge) {
  if ('codex_local_worktree_handoff_policy' in runtimeBridge) {
    throw new Error('Runtime bridge must not own a Local or Worktree handoff policy');
  }
  assertDeepEqualJson(
    runtimeBridge.codex_review_surface_policy,
    {
      state:
        'source_partial_last_turn_and_custom_target_instructions_implemented_review_focus_and_inline_comments_protocol_blocked',
      host_surface: 'existing_files_changes_diff_surface',
      review_targets: ['uncommitted', 'base_branch', 'commit', 'custom'],
      delivery_modes: ['inline', 'detached'],
      default_section: 'unstaged',
      sections: ['unstaged', 'staged', 'commit', 'branch', 'last_turn'],
      capabilities: ['pull_request_context', 'inline_comments', 'stage', 'commit', 'push'],
      source_capability_status: {
        last_turn: 'source_implemented_existing_message_store',
        review_focus_context: 'source_blocked_missing_public_review_focus_protocol',
        inline_comments: 'source_blocked_missing_typed_codex_protocol',
      },
      last_turn_source_policy: 'latest_visible_user_message_then_completed_workspace_edit_tool_calls',
      review_focus_delivery_policy:
        'custom_target_instructions_via_review_start_target_custom_only_non_custom_focus_not_exposed',
      review_focus_failure_policy:
        'non_custom_focus_protocol_unavailable_before_review_start_without_turn_steer_fallback_fake_success_audit_or_side_effects',
      inline_comment_protocol_requirement:
        'typed_codex_app_server_file_line_comment_request_location_and_failure_semantics',
      inline_comment_forbidden_fallbacks: ['shell_local_annotation_store', 'fake_success'],
      pull_request_context_dependency: 'gh',
      pull_request_context_unavailable_policy: 'show_explicit_unavailable_state',
      git_authority: 'existing_codex_git_integration',
      shell_role: 'thin_adapter_only',
      duplicate_git_store_allowed: false,
    },
    'Codex Review surface policy',
  );
}
