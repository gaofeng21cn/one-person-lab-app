import type { AppProductProfile } from '../types.ts';

export function assertCodexOplFlowContext(profile: AppProductProfile): void {
  if (
    profile.codex.app_runtime_home?.default_path !== '~/.codex' ||
    profile.codex.app_runtime_home.override_env !== 'CODEX_HOME' ||
    profile.codex.app_runtime_home.resolution_policy !== 'preserve_existing_env_else_codex_system_default' ||
    profile.codex.app_runtime_home.app_env_injection !== 'forbidden' ||
    profile.codex.app_runtime_home.startup_and_recheck_mutation !== 'forbidden' ||
    profile.codex.app_runtime_home.explicit_model_access_mutation !==
      'framework_action_atomic_merge_with_backup_and_restore'
  ) {
    throw new Error('App product profile must preserve the system Codex home without App environment injection');
  }
  if (
    profile.codex.auto_model_policy.authority !== 'one-person-lab-app' ||
    profile.codex.auto_model_policy.recommendation_authority !== 'opl-flow' ||
    profile.codex.auto_model_policy.policy_source_ref !==
      'app_state.agent_packages.status_index.packages.opl-flow.model_projection' ||
    profile.codex.auto_model_policy.projection_surface_kind !== 'opl_codex_model_policy_projection.v1' ||
    profile.codex.auto_model_policy.projection_presence_rule !==
      'consume_only_when_fresh_opl_flow_presence_installed_true_and_projection_is_valid' ||
    profile.codex.auto_model_policy.app_role !==
      'resolve_auto_from_fresh_catalog_and_projected_recommendation_then_persist_user_override' ||
    JSON.stringify(profile.codex.auto_model_policy.resolution_precedence) !== JSON.stringify([
      'explicit_user_selection',
      'app_default_then_catalog_compatibility',
      'installed_opl_flow_recommendation',
      'fresh_codex_live_default',
      'app_fallback_when_flow_unavailable',
    ]) ||
    profile.codex.auto_model_policy.app_fallback_role !==
      'configured_default_when_catalog_metadata_is_unavailable' ||
    profile.codex.auto_model_policy.configured_default_role !==
      'app_default_with_catalog_compatibility_fallback'
  ) {
    throw new Error('App product profile must consume the OPL Flow model policy projection');
  }
  if (
    profile.codex.opl_flow_context?.flow_id !== 'opl-flow' ||
    profile.codex.opl_flow_context.source !== 'framework-agent-package-projection' ||
    profile.codex.opl_flow_context.presence_source_ref !==
      'app_state.agent_packages.status_index.packages.opl-flow.presence' ||
    profile.codex.opl_flow_context.presence_rule !== 'inject_only_when_fresh_presence_installed_true' ||
    profile.codex.opl_flow_context.delivery !== 'installed_package_metadata_only' ||
    profile.codex.opl_flow_context.absence_policy !== 'omit_opl_flow_context' ||
    profile.codex.opl_flow_context.status_source_ref !==
      'app_state.agent_packages.status_index.packages.opl-flow' ||
    JSON.stringify(profile.codex.opl_flow_context.status_planes) !== JSON.stringify([
      'package_operational',
      'experience_baseline',
      'specialized_capabilities',
    ]) ||
    profile.codex.opl_flow_context.user_agents_policy !== 'respect_user_agents_no_overwrite_detect_conflicts' ||
    profile.codex.opl_flow_context.language_policy !== 'follow_ui_locale_zh_only_when_ui_zh' ||
    profile.codex.opl_flow_context.app_role !==
      'consume_generic_framework_projection_and_execute_projected_actions_only' ||
    profile.codex.opl_flow_context.flow_policy_parsing !== 'forbidden' ||
    profile.codex.opl_flow_context.companion_inventory_storage !== 'forbidden'
  ) {
    throw new Error('App product profile must consume the generic Framework OPL Flow projection');
  }
  const additionalInstructions = profile.codex.new_conversation_additional_instructions;
  if (
    additionalInstructions?.content_owner !== 'user' ||
    additionalInstructions.delivery !== 'new_conversation_additional_instructions_only' ||
    additionalInstructions.storage_key !== 'codex.oplAppSessionContextAdditional' ||
    additionalInstructions.storage_key_status !== 'legacy_compatibility_storage_key' ||
    additionalInstructions.generated_base_context_allowed !== false ||
    additionalInstructions.agent_route_fallback_allowed !== false ||
    additionalInstructions.empty_value_policy !== 'inject_nothing' ||
    additionalInstructions.reset_behavior !== 'clear_additional_instructions' ||
    additionalInstructions.effect !== 'next_new_conversation'
  ) {
    throw new Error('App product profile must limit new-conversation additions to optional user-authored text');
  }
  for (const field of [
    'opl_app_session_context',
    'default_visible_skills',
    'skill_priority',
    'session_context_lines',
    'session_context_i18n',
  ]) {
    if (field in profile.codex) {
      throw new Error(`App product profile must not restore legacy Codex authority codex.${field}`);
    }
  }
}
