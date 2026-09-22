import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';
import {
  firstRunModelAccessSetupPolicy,
  focusedFirstRunPresentationPolicy,
  progressiveFirstRunRecoveryPolicy,
} from '../app-contract-constants.ts';
import { assertFirstRunProgressModelShape, assertNonEmptyStringArray, validateBeginnerFirstRunPresentation } from '../shared-contract-validators.ts';
import { deferredMaintenanceItems, fullReadinessItems, requiredHostTools } from './context.ts';
import { validateFirstRunProgressModel } from './standard-boundary.ts';

export function validateFullFirstInstallCoreReadyPolicy(profile) {
  if (JSON.stringify(profile.first_run?.readiness_layers) !== JSON.stringify(['core'])) {
    throw new Error('Product profile ready_to_launch readiness_layers must contain only core');
  }
  const firstRunCoreItems = assertNonEmptyStringArray(
    profile.first_run?.ready_to_launch_gate?.required_core_items,
    'Product profile ready_to_launch required_core_items',
  );
  validateBeginnerFirstRunPresentation(
    profile.first_run?.beginner_presentation,
    'Product profile first-run beginner presentation',
    firstRunCoreItems,
  );
  for (const [field, expected] of Object.entries(focusedFirstRunPresentationPolicy)) {
    if (profile.first_run?.beginner_presentation?.[field] !== expected) {
      throw new Error(
        `Product profile first-run beginner presentation ${field} must be ${expected}`,
      );
    }
  }
  assertDeepEqualJson(
    profile.first_run?.beginner_presentation?.model_access_setup,
    firstRunModelAccessSetupPolicy,
    'Product profile first-run model access setup policy',
  );
  validateReadyToLaunchGate(profile, firstRunCoreItems);
  validateOfficialProfileFirstInstallPolicy(profile);
  validateFirstConversationPolicy(profile);
  validateFullFirstInstallBackgroundPolicy(profile);
  validateFirstRunProgressModel(profile);
}

export function validateOfficialProfileFirstInstallPolicy(profile) {
  const execution = profile.official_profile?.first_install_execution;
  if (
    execution?.mode !== 'background_after_core_ready'
    || execution?.guid_navigation_blocking !== false
    || execution?.failure_scope !== 'package_local_nonblocking'
    || execution?.unknown_or_timeout_policy !== 'keep_guid_entry_available_and_report_background_attention'
    || execution?.retry_policy !== 'explicit_first_run_retry_or_settings_agents'
  ) {
    throw new Error('Product profile Official Profile first-install execution must remain background and non-blocking after Core ready');
  }
}

export function validateReadyToLaunchGate(profile, firstRunCoreItems) {
  const launchGate = profile.first_run?.ready_to_launch_gate;
  if (
    launchGate?.id !== 'ready_to_launch' ||
    launchGate?.ui_order !== 'before_first_conversation_not_before_guid' ||
    launchGate?.guid_navigation_blocking !== false
  ) {
    throw new Error('Product profile ready_to_launch must gate first conversation without blocking /guid navigation');
  }
  for (const item of firstRunCoreItems) {
    if (!launchGate?.required_core_items?.includes(item)) {
      throw new Error(`Product profile ready_to_launch gate must require Core item ${item}`);
    }
  }
  for (const item of fullReadinessItems) {
    if (!launchGate?.must_not_require?.includes(item)) {
      throw new Error(`Product profile ready_to_launch gate must not require ${item}`);
    }
    if (!profile.first_run?.full_readiness_layers?.includes(item)) {
      throw new Error(`Product profile full readiness layers must include ${item}`);
    }
  }
  if (
    profile.first_run?.runtime_provider?.full_readiness_provider !== 'temporal'
    || profile.first_run.runtime_provider.ready_to_launch_blocking !== false
  ) {
    throw new Error('Product profile full runtime provider must stay Temporal and non-blocking for ready_to_launch');
  }
}

export function validateFirstConversationPolicy(profile) {
  const firstConversation = profile.first_run?.first_conversation;
  const progressModel = profile.first_run?.progress_model;
  const firstConversationMustWaitFor = assertNonEmptyStringArray(
    firstConversation?.must_wait_for,
    'Product profile first conversation must_wait_for',
  );
  const requiredBeforePlainSend = assertNonEmptyStringArray(
    firstConversation?.required_before_plain_send,
    'Product profile first conversation required_before_plain_send',
  );
  const requiredBeforeSendWithLocalInputs = assertNonEmptyStringArray(
    firstConversation?.required_before_send_with_local_inputs,
    'Product profile first conversation required_before_send_with_local_inputs',
  );
  const requiredBeforeWorkspaceControls = assertNonEmptyStringArray(
    firstConversation?.required_before_workspace_controls,
    'Product profile first conversation required_before_workspace_controls',
  );
  if (typeof firstConversation?.failure_policy !== 'string' || !firstConversation.failure_policy.trim()) {
    throw new Error('Product profile first conversation must define a failure_policy');
  }
  assertFirstRunProgressModelShape(progressModel, 'Product profile first-run progress model');
  if (
    firstConversation?.gate !== 'capability_prerequisites_then_acp_warmup_before_initial_send' ||
    firstConversation?.runtime_readiness_method !== 'POST' ||
    firstConversation?.runtime_readiness_route !== '/api/conversations/<id>/runtime/ensure' ||
    firstConversation?.retired_route !== '/api/conversations/<id>/warmup' ||
    firstConversation?.route_failure_policy !== 'http_404_or_500_is_retryable_error_never_ready' ||
    firstConversation?.source_command !== progressModel.source_command ||
    firstConversation?.ready_to_launch_must_be_true !== false ||
    firstConversation?.unknown_readiness_policy !== 'allow_attempt_without_mutating_readiness' ||
    firstConversation?.blocked_feedback !== 'localized_inline_non_modal_setup_notice_preserves_prompt'
  ) {
    throw new Error('Product profile first conversation must apply granular prerequisites before ACP warmup');
  }
  const fullRuntimeQualification = profile.first_run?.full_runtime_package_qualification;
  if (
    fullRuntimeQualification?.source !== 'framework_resolved_selected_package_set' ||
    fullRuntimeQualification.reconciliation !== 'idempotent_selected_capability_reconciliation' ||
    fullRuntimeQualification.composition_policy !== 'open_composition_no_fixed_package_set' ||
    fullRuntimeQualification.readiness_policy !==
      'selected_capabilities_gate_only_their_dependent_features' ||
    fullRuntimeQualification.workspace_scoped_materialization_policy !==
      'package_cache_without_global_marketplace_registration_until_mas_workspace_binding' ||
    fullRuntimeQualification.global_workspace_scoped_exposure !== 'forbidden'
  ) {
    throw new Error('Product profile must enforce the Full runtime package qualification boundary');
  }
  assertDeepEqualJson(requiredBeforePlainSend, ['codex_cli', 'codex_config'], 'Product profile plain send prerequisites');
  assertDeepEqualJson(
    requiredBeforeSendWithLocalInputs,
    ['codex_cli', 'codex_config'],
    'Product profile send with local inputs prerequisites',
  );
  assertDeepEqualJson(
    requiredBeforeWorkspaceControls,
    ['workspace_root'],
    'Product profile workspace control prerequisites',
  );
  const ordinaryRecovery = profile.first_run?.ordinary_shell_recovery;
  const postLoginSetupCheck = ordinaryRecovery?.fresh_webui_login_setup_check;
  if (
    postLoginSetupCheck?.trigger !== 'successful_authenticated_webui_login_only' ||
    postLoginSetupCheck?.route_intent !== progressiveFirstRunRecoveryPolicy.fresh_webui_login_setup_check_intent ||
    postLoginSetupCheck?.state_source !== 'shared_opl_app_fast_state' ||
    postLoginSetupCheck?.known_incomplete_behavior !== 'replace_guid_with_first_run' ||
    postLoginSetupCheck?.ready_behavior !== 'keep_guid' ||
    postLoginSetupCheck?.unknown_timeout_or_read_failure_behavior !==
      progressiveFirstRunRecoveryPolicy.fresh_webui_login_unknown_policy ||
    postLoginSetupCheck?.ui_timeout_ms !== progressiveFirstRunRecoveryPolicy.fresh_webui_login_ui_timeout_ms ||
    postLoginSetupCheck?.ordinary_startup_refresh_and_deep_link_behavior !==
      'keep_guid_without_automatic_first_run' ||
    postLoginSetupCheck?.consumption_policy !== 'one_shot' ||
    ordinaryRecovery?.persistent_setup_entry?.target_route !== '/first-run' ||
    ordinaryRecovery?.persistent_setup_entry?.surface !== 'ordinary_sidebar_non_modal_entry' ||
    ordinaryRecovery?.persistent_home_composer_runtime_alert !==
      'forbidden_use_sidebar_and_send_scoped_inline_recovery_only' ||
    ordinaryRecovery?.plain_conversation?.workspace_root_required !== false ||
    ordinaryRecovery?.plain_conversation?.must_preserve_prompt !== true ||
    ordinaryRecovery?.send_scoped_local_inputs?.workspace_root_required !== false ||
    ordinaryRecovery?.workspace_controls?.plain_conversation_remains_available !== true ||
    ordinaryRecovery?.workspace_controls?.send_scoped_local_inputs_remain_available !== true ||
    ordinaryRecovery?.unknown_readiness_policy !== 'do_not_synthesize_failure_or_mutate_readiness'
  ) {
    throw new Error('Product profile ordinary shell recovery policy is invalid');
  }
  assertDeepEqualJson(
    ordinaryRecovery.plain_conversation.required_items,
    ['codex_cli', 'codex_config'],
    'Product profile ordinary plain conversation prerequisites',
  );
  assertDeepEqualJson(
    ordinaryRecovery.send_scoped_local_inputs.required_items,
    ['codex_cli', 'codex_config'],
    'Product profile ordinary send-scoped local input prerequisites',
  );
  assertDeepEqualJson(
    ordinaryRecovery.send_scoped_local_inputs.supported_inputs,
    progressiveFirstRunRecoveryPolicy.send_scoped_local_input_surfaces,
    'Product profile ordinary send-scoped local input surfaces',
  );
  assertDeepEqualJson(
    ordinaryRecovery.workspace_controls.required_items,
    ['workspace_root'],
    'Product profile ordinary workspace control prerequisites',
  );
  assertDeepEqualJson(
    ordinaryRecovery.workspace_controls.restricted_capabilities,
    progressiveFirstRunRecoveryPolicy.workspace_restricted_capabilities,
    'Product profile ordinary workspace-restricted capabilities',
  );
  assertIncludesAll(
    firstConversation.must_wait_for,
    firstConversationMustWaitFor,
    'Product profile first conversation wait-for items',
  );
  assertIncludesAll(
    firstConversation.must_not_wait_for,
    fullReadinessItems,
    'Product profile first conversation non-blocking readiness items',
  );
}

export function validateFullFirstInstallBackgroundPolicy(profile) {
  const fullFirstInstall = profile.first_run?.core_ready_policy?.full_first_install_clean_machine;
  for (const tool of requiredHostTools) {
    if (!fullFirstInstall?.missing_host_tools_allowed?.includes(tool)) {
      throw new Error(`Product profile Full first-install policy must allow missing ${tool}`);
    }
  }
  if (fullFirstInstall?.initial_runtime_source !== 'bundled_runtime' || fullFirstInstall?.core_ready_without_host_tools !== true) {
    throw new Error('Product profile Full first-install must reach Core ready through bundled_runtime without host tools');
  }
  for (const blocker of deferredMaintenanceItems) {
    if (!fullFirstInstall?.must_not_block_core_ready?.includes(blocker)) {
      throw new Error(`Product profile Full first-install must not block Core ready on ${blocker}`);
    }
    if (!profile.first_run?.background_maintenance?.items?.includes(blocker)) {
      throw new Error(`Product profile background maintenance must include ${blocker}`);
    }
  }
  if (profile.first_run?.background_maintenance?.blocks_core_ready !== false) {
    throw new Error('Product profile background maintenance must not block Core ready');
  }
  if (
    profile.first_run?.background_maintenance?.mode !== 'best_effort_after_core_ready'
    || profile.first_run?.background_maintenance?.continues_after_core_ready !== true
  ) {
    throw new Error('Product profile background maintenance must continue best-effort after Core ready');
  }
  if (
    fullFirstInstall?.post_core_ready_background_policy?.mode !== 'best_effort_non_blocking'
    || fullFirstInstall?.post_core_ready_background_policy?.continues_after_core_ready !== true
  ) {
    throw new Error('Product profile Full first-install must continue best-effort maintenance after Core ready');
  }
  for (const blocker of deferredMaintenanceItems) {
    if (!fullFirstInstall?.post_core_ready_background_policy?.managed_items?.includes(blocker)) {
      throw new Error(`Product profile Full first-install post-Core maintenance must manage ${blocker}`);
    }
  }
}
