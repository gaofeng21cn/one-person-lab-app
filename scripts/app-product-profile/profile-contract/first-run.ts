import type { AppProductProfile } from '../types.ts';
import { assertDeepEqualJson, assertIncludesAll, assertPostInstallAiSelfCheckEntry, assertStringArray } from './support.ts';

export function assertFirstRunProfileShape(profile: AppProductProfile): void {
  assertStringArray(profile.first_run.readiness_layers, 'first_run.readiness_layers');
  assertStringArray(profile.first_run.ready_to_launch_gate.required_core_items, 'first_run.ready_to_launch_gate.required_core_items');
  assertStringArray(profile.first_run.ready_to_launch_gate.must_not_require, 'first_run.ready_to_launch_gate.must_not_require');
  if (
    profile.first_run.ready_to_launch_gate.ui_order !== 'before_first_conversation_not_before_guid' ||
    profile.first_run.ready_to_launch_gate.guid_navigation_blocking !== false
  ) {
    throw new Error('App product profile ready_to_launch must gate first conversation without blocking /guid navigation');
  }
  assertStringArray(profile.first_run.full_readiness_layers, 'first_run.full_readiness_layers');
  assertStringArray(profile.first_run.deferred_blockers, 'first_run.deferred_blockers');
  assertStringArray(profile.first_run.first_conversation.must_wait_for, 'first_run.first_conversation.must_wait_for');
  assertStringArray(profile.first_run.first_conversation.must_not_wait_for, 'first_run.first_conversation.must_not_wait_for');
  assertStringArray(
    profile.first_run.first_conversation.required_before_plain_send,
    'first_run.first_conversation.required_before_plain_send',
  );
  assertStringArray(
    profile.first_run.first_conversation.required_before_send_with_local_inputs,
    'first_run.first_conversation.required_before_send_with_local_inputs',
  );
  assertStringArray(
    profile.first_run.first_conversation.required_before_workspace_controls,
    'first_run.first_conversation.required_before_workspace_controls',
  );
  assertStringArray(profile.first_run.beginner_presentation.primary_steps, 'first_run.beginner_presentation.primary_steps');
  const beginnerPresentation = profile.first_run.beginner_presentation;
  if (
    beginnerPresentation.layout_mode !== 'focused_setup_workspace' ||
    beginnerPresentation.ordinary_navigation_policy !== 'hidden_until_user_enters_guid' ||
    beginnerPresentation.completion_navigation_policy !== 'manual_guid_entry_available_before_or_after_ready_no_automatic_route' ||
    beginnerPresentation.defer_navigation_policy !== 'explicit_enter_guid_available_before_ready_without_mutating_readiness' ||
    beginnerPresentation.core_readiness_status_policy !== 'required_core_items_never_treat_disabled_as_ready' ||
    beginnerPresentation.minimum_window_primary_action_policy !== '400x600_keeps_current_primary_action_visible'
  ) {
    throw new Error('Invalid App product profile first_run.beginner_presentation focused setup policy');
  }
  assertPostInstallAiSelfCheckEntry(profile.first_run.beginner_presentation.post_install_ai_self_check_entry);
  if (
    profile.first_run.first_conversation.gate !== 'capability_prerequisites_then_acp_warmup_before_initial_send' ||
    profile.first_run.first_conversation.runtime_readiness_method !== 'POST' ||
    profile.first_run.first_conversation.runtime_readiness_route !== '/api/conversations/<id>/runtime/ensure' ||
    profile.first_run.first_conversation.retired_route !== '/api/conversations/<id>/warmup' ||
    profile.first_run.first_conversation.route_failure_policy !== 'http_404_or_500_is_retryable_error_never_ready' ||
    profile.first_run.first_conversation.source_command !== 'opl system initialize --json' ||
    profile.first_run.first_conversation.ready_to_launch_must_be_true !== false ||
    profile.first_run.first_conversation.unknown_readiness_policy !== 'allow_attempt_without_mutating_readiness' ||
    profile.first_run.first_conversation.blocked_feedback !==
      'localized_inline_non_modal_setup_notice_preserves_prompt' ||
    profile.first_run.first_conversation.failure_policy !== 'show_retryable_initial_message_error_without_losing_user_prompt'
  ) {
    throw new Error('App product profile first_run.first_conversation must apply granular prerequisites before ACP warmup');
  }
  const fullRuntimeQualification = profile.first_run.full_runtime_package_qualification;
  if (
    fullRuntimeQualification.source !== 'framework_resolved_selected_package_set' ||
    fullRuntimeQualification.reconciliation !== 'idempotent_selected_capability_reconciliation' ||
    fullRuntimeQualification.composition_policy !== 'open_composition_no_fixed_package_set' ||
    fullRuntimeQualification.readiness_policy !==
      'selected_capabilities_gate_only_their_dependent_features' ||
    fullRuntimeQualification.workspace_scoped_materialization_policy !==
      'package_cache_without_global_marketplace_registration_until_mas_workspace_binding' ||
    fullRuntimeQualification.global_workspace_scoped_exposure !== 'forbidden'
  ) {
    throw new Error('App product profile must enforce the Full runtime package qualification boundary');
  }
  assertDeepEqualJson(
    profile.first_run.first_conversation.required_before_plain_send,
    ['codex_cli', 'codex_config'],
    'first_run.first_conversation.required_before_plain_send',
  );
  assertDeepEqualJson(
    profile.first_run.first_conversation.required_before_send_with_local_inputs,
    ['codex_cli', 'codex_config'],
    'first_run.first_conversation.required_before_send_with_local_inputs',
  );
  assertDeepEqualJson(
    profile.first_run.first_conversation.required_before_workspace_controls,
    ['workspace_root'],
    'first_run.first_conversation.required_before_workspace_controls',
  );
  const ordinaryRecovery = profile.first_run.ordinary_shell_recovery;
  const postLoginSetupCheck = ordinaryRecovery.fresh_webui_login_setup_check;
  if (
    postLoginSetupCheck.trigger !== 'successful_authenticated_webui_login_only' ||
    postLoginSetupCheck.route_intent !== 'postLoginSetupCheck' ||
    postLoginSetupCheck.state_source !== 'shared_opl_app_fast_state' ||
    postLoginSetupCheck.known_incomplete_behavior !== 'replace_guid_with_first_run' ||
    postLoginSetupCheck.ready_behavior !== 'keep_guid' ||
    postLoginSetupCheck.unknown_timeout_or_read_failure_behavior !== 'keep_guid_fail_open' ||
    postLoginSetupCheck.ui_timeout_ms !== 20_000 ||
    postLoginSetupCheck.ordinary_startup_refresh_and_deep_link_behavior !==
      'keep_guid_without_automatic_first_run' ||
    postLoginSetupCheck.consumption_policy !== 'one_shot' ||
    ordinaryRecovery.persistent_setup_entry.target_route !== '/first-run' ||
    ordinaryRecovery.persistent_setup_entry.surface !== 'ordinary_sidebar_non_modal_entry' ||
    ordinaryRecovery.persistent_home_composer_runtime_alert !==
      'forbidden_use_sidebar_and_send_scoped_inline_recovery_only' ||
    ordinaryRecovery.plain_conversation.workspace_root_required !== false ||
    ordinaryRecovery.plain_conversation.must_preserve_prompt !== true ||
    ordinaryRecovery.send_scoped_local_inputs.workspace_root_required !== false ||
    ordinaryRecovery.workspace_controls.plain_conversation_remains_available !== true ||
    ordinaryRecovery.workspace_controls.send_scoped_local_inputs_remain_available !== true ||
    ordinaryRecovery.unknown_readiness_policy !== 'do_not_synthesize_failure_or_mutate_readiness'
  ) {
    throw new Error('Invalid App product profile first_run.ordinary_shell_recovery policy');
  }
  assertDeepEqualJson(
    ordinaryRecovery.plain_conversation.required_items,
    ['codex_cli', 'codex_config'],
    'first_run.ordinary_shell_recovery.plain_conversation.required_items',
  );
  assertDeepEqualJson(
    ordinaryRecovery.send_scoped_local_inputs.required_items,
    ['codex_cli', 'codex_config'],
    'first_run.ordinary_shell_recovery.send_scoped_local_inputs.required_items',
  );
  assertDeepEqualJson(
    ordinaryRecovery.send_scoped_local_inputs.supported_inputs,
    [
      'file_dialog_attachment',
      'directory_dialog_attachment',
      'file_paste_attachment',
      'file_drag_attachment',
      'slash_open_absolute_path',
    ],
    'first_run.ordinary_shell_recovery.send_scoped_local_inputs.supported_inputs',
  );
  assertDeepEqualJson(
    ordinaryRecovery.workspace_controls.required_items,
    ['workspace_root'],
    'first_run.ordinary_shell_recovery.workspace_controls.required_items',
  );
  assertDeepEqualJson(
    ordinaryRecovery.workspace_controls.restricted_capabilities,
    ['project_workspace_selection', 'opl_workspace_controls'],
    'first_run.ordinary_shell_recovery.workspace_controls.restricted_capabilities',
  );
  assertIncludesAll(
    profile.first_run.first_conversation.must_wait_for,
    ['conversation_record_ready', 'acp_warmup_complete'],
    'first_run.first_conversation.must_wait_for',
  );
  assertIncludesAll(
    profile.first_run.first_conversation.must_not_wait_for,
    [
      'domain_modules',
      'family_runtime_provider',
      'recommended_skills',
      'native_helpers',
      'repo_sync',
      'command_line_tools_install',
      'ecosystem_module_updates',
    ],
    'first_run.first_conversation.must_not_wait_for',
  );
  if (profile.first_run.progress_model.source_command !== 'opl system initialize --json') {
    throw new Error('App product profile first_run.progress_model.source_command must be opl system initialize --json');
  }
  if (profile.first_run.progress_model.source_path !== 'system_initialize.setup_flow') {
    throw new Error('App product profile first_run.progress_model.source_path must be system_initialize.setup_flow');
  }
  if (profile.first_run.progress_model.renderer_truth_policy !== 'render_only_no_shell_private_progress_truth') {
    throw new Error('App product profile first_run.progress_model must keep renderers display-only');
  }
  assertStringArray(profile.first_run.progress_model.required_setup_flow_fields, 'first_run.progress_model.required_setup_flow_fields');
  assertStringArray(profile.first_run.progress_model.required_progress_fields, 'first_run.progress_model.required_progress_fields');
  assertStringArray(profile.first_run.progress_model.required_checklist_fields, 'first_run.progress_model.required_checklist_fields');
  assertStringArray(profile.first_run.progress_model.required_visible_elements, 'first_run.progress_model.required_visible_elements');
  assertStringArray(profile.first_run.command_line_tools.messages, 'first_run.command_line_tools.messages');
}
