import { assertDeepEqualJson } from '../assertions.ts';
import {
  appOwnedHomeLayout,
} from '../app-contract-constants.ts';
import {
  assertAppProductProfileCodexModelDisplayOptions,
  assertAppProductProfileGuiAuthority,
  assertAppProductProfileGuiInteractionBaseline,
  assertAppProductProfileHomeCodexPolicy,
  assertAppProductProfileSettingsVisualSystem,
} from '../../app-product-profile-shared-validators.ts';
import { validateOplFlowContext } from '../shared-contract-validators.ts';
import { assertDefaultCodexSessionProfile } from '../../app-product-profile-default-session.ts';
import { validateProductProfileCodexSkills, validateProductProfileSettings, validateInstallUpdateTaxonomy, validateOrdinaryCapabilitySelectorPolicy } from './package-settings.ts';
import { validateDynamicHomeComposerStateContract } from './context.ts';

export function validateClientRendererCompatibility(profile) {
  assertDeepEqualJson(
    profile.client_renderer_compatibility,
    {
      schema: 'opl_app_client_renderer_compatibility.v1',
      owner: 'one-person-lab-app',
      host_composition_authority: 'one-person-lab-framework',
      host_graph_source: 'app_state.ui_contributions',
      host_projection_schema: 'opl_app_ui_contributions_projection.v1',
      contribution_abi: 'opl_app_client_contributions.v1',
      allowlist_contract: 'contracts/opl-app-contributions.schema.json',
      typed_slots: ['settings.section', 'runtime.detail', 'composer.palette'],
      standard_view_types: ['list_detail', 'timeline', 'approval_diff', 'task_board', 'artifact_view', 'activity_log', 'service_status', 'channel_access', 'remote_companion_access'],
      transport_binding_source: 'app_state.transport_bindings',
      transport_binding_schema: 'opl_app_transport_bindings_projection.v1',
      transport_binding_migration_state: 'framework_transport_binding_projection_and_dual_shell_source_e2e_completed',
      transport_binding_event: 'opl/app-transport-bindings/updated',
      typed_state_rpc: 'opl app state --profile fast --json',
      typed_action_rpc: 'opl app action execute --action <action_id> [--payload json] [--dry-run] --json',
      typed_client_event: 'opl/app-client-contributions/updated',
      state_semantics_contract: 'contracts/app-runtime-bridge.json',
      client_authority_policy: 'render_and_dispatch_only_no_plugin_discovery_install_registry_currentness_release_operation_task_package_or_product_truth',
      switch_policy: 'explicit_adapter_selection_after_compatibility_admission_never_unverified_hot_switch',
      hot_switch_without_revalidation_allowed: false,
      brand_capability_projection_policy: 'dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client',
      app_fixed_brand_registry_allowed: false,
      client_fixed_brand_registry_allowed: false,
      display_and_allowlist_owner: 'one-person-lab-app',
    },
    'App Client renderer compatibility profile',
  );
}

export function validateProductProfileCodexDefaults(profile) {
  if (
    profile.codex?.app_runtime_home?.default_path !== '~/.codex' ||
    profile.codex.app_runtime_home.override_env !== 'CODEX_HOME' ||
    profile.codex.app_runtime_home.resolution_policy !== 'preserve_existing_env_else_codex_system_default' ||
    profile.codex.app_runtime_home.app_env_injection !== 'forbidden' ||
    profile.codex.app_runtime_home.startup_and_recheck_mutation !== 'forbidden' ||
    profile.codex.app_runtime_home.explicit_model_access_mutation !==
      'framework_action_atomic_merge_with_backup_and_restore'
  ) {
    throw new Error('Product profile must preserve the system Codex home without App environment injection');
  }
  if (
    profile.codex.auto_model_policy?.recommendation_authority !== 'opl-flow' ||
    profile.codex.auto_model_policy.policy_source_ref !==
      'app_state.agent_packages.status_index.packages.opl-flow.model_projection' ||
    profile.codex.auto_model_policy.projection_surface_kind !== 'opl_codex_model_policy_projection.v1' ||
    profile.codex.auto_model_policy.projection_presence_rule !==
      'consume_only_when_fresh_opl_flow_presence_installed_true_and_projection_is_valid' ||
    JSON.stringify(profile.codex.auto_model_policy.resolution_precedence) !== JSON.stringify([
      'explicit_user_selection',
      'fresh_catalog_frontier_then_app_default_when_available',
      'installed_opl_flow_recommendation',
      'fresh_codex_live_default',
      'app_fallback_when_flow_unavailable',
    ]) ||
    profile.codex.auto_model_policy.app_fallback_role !==
      'configured_default_when_catalog_metadata_is_unavailable' ||
    profile.codex.auto_model_policy.configured_default_role !==
      'app_default_with_catalog_compatibility_fallback'
  ) {
    throw Object.assign(new Error('Product profile model policy must use user, fresh frontier/App default, installed Flow, compatible catalog, then App fallback precedence'), { code: 'app_model_policy_precedence' });
  }
  validateOplFlowContext(profile.codex?.opl_flow_context, 'Product profile OPL Flow Context');
  const additionalInstructions = profile.codex?.new_conversation_additional_instructions;
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
    throw new Error('Product profile must limit new-conversation additions to optional user-authored text');
  }
  for (const field of [
    'opl_app_session_context',
    'default_visible_skills',
    'skill_priority',
    'session_context_lines',
    'session_context_i18n',
  ]) {
    if (field in profile.codex) {
      throw new Error(`Product profile must not restore legacy Codex authority codex.${field}`);
    }
  }
  assertDefaultCodexSessionProfile(profile, { label: 'product profile', requireLiteralDefaults: true });
  assertAppProductProfileGuiAuthority(profile, 'Product profile');
  assertAppProductProfileGuiInteractionBaseline(profile, 'Product profile');
  assertAppProductProfileSettingsVisualSystem(profile, 'Product profile');
  assertAppProductProfileHomeCodexPolicy(profile, 'Product profile');
  assertAppProductProfileCodexModelDisplayOptions(profile, 'Product profile');
  validateDynamicHomeComposerStateContract(profile.gui?.home?.home_composer_state_contract, 'Product profile Home composer state contract');
  validateUiLocalePolicy(profile);
  validateHomeAssistantDefaults(profile);
  validateProductProfileSettings(profile);
  validateProductProfileCodexSkills(profile);
  validateInstallUpdateTaxonomy(profile);
  validateOrdinaryCapabilitySelectorPolicy(profile);
}

export function validateUiLocalePolicy(profile) {
  const policy = profile.gui?.ui_locale_policy;
  if (
    policy?.explicit_user_preference !== 'preserve_across_launches' ||
    policy?.first_launch_without_preference !== 'detect_system_locale_before_first_render' ||
    policy?.supported_normalization !== 'zh_to_zh-CN_else_en-US' ||
    policy?.startup_must_not_overwrite_explicit_preference !== true
  ) {
    throw new Error('Product profile locale policy must detect the system language before first render while preserving explicit preferences');
  }
}

export function validateHomeAssistantDefaults(profile) {
  const homeLayout = profile.gui.home.home_layout;
  if (
    homeLayout?.default_active_shortcut !== null ||
    homeLayout?.shortcut_selection_policy !==
      'explicit_user_or_navigation_selection_only_no_saved_preset_restore_and_never_disabled_by_launch_readiness' ||
    homeLayout?.starter_item_width_policy !== 'content_sized' ||
    homeLayout?.starter_count_layout_policy !== 'center_actual_visible_count_and_wrap_without_navigation_chevrons' ||
    homeLayout?.desktop_composer_max_width_px !== 736 ||
    homeLayout?.desktop_composer_min_height_px !== 98 ||
    homeLayout?.desktop_composer_corner_radius_px !== 22 ||
    homeLayout?.desktop_context_bar_height_px !== 52 ||
    homeLayout?.desktop_context_bar_overlap_px !== 13 ||
    homeLayout?.desktop_context_bar_horizontal_inset_px !== 12 ||
    homeLayout?.workspace_selector_visible !== true ||
    homeLayout?.workspace_selector_entry !== 'home.new_session_context_bar' ||
    homeLayout?.unselected_workspace_control_visible !== true ||
    homeLayout?.unselected_workspace_control_policy !==
      'localized_choose_project_directory_action_not_projectless_status_placeholder' ||
    homeLayout?.selected_working_directory_visual_policy !==
      'independent_new_session_context_bar_control_with_selected_directory_and_clear_action' ||
    homeLayout?.selected_starter_visual_policy !==
      'quiet_fill_with_aria_pressed_without_trailing_selection_glyph' ||
    homeLayout?.selected_starter_accessibility_state !== 'aria_pressed_reflects_active_shortcut'
  ) {
    throw new Error('Product profile Home must default to the base executor and require explicit professional-agent selection');
  }
  assertDeepEqualJson(
    homeLayout.workspace_selector_policy,
    appOwnedHomeLayout.workspace_selector_policy,
    'Product profile Home workspace selector session ownership policy',
  );
  if (
    profile.gui.appearance?.visual_source_cohort_ref !== 'contracts/app-gui-visual-source-cohort.json' ||
    profile.gui.appearance?.visual_reference_cohort_ref !== 'contracts/app-gui-visual-reference-cohort.json' ||
    JSON.stringify(profile.gui.appearance?.shared_visual_primitives) !==
      JSON.stringify(['composer', 'rail_row', 'icon_button', 'menu', 'settings_row'])
  ) {
    throw new Error('Product profile appearance must bind the pinned DSH visual source cohort and shared primitives');
  }
  const iconPolicy = profile.gui.home.utility_icon_policy;
  if (
    iconPolicy?.library !== 'pinned_deepseek_harness_icon_cohort_via_opl_icon_adapter' ||
    iconPolicy?.opl_owned_settings_navigation_and_overview !== 'dsh_icon_primitives_14_16px_currentcolor' ||
    iconPolicy?.settings_icon_geometry !==
      'stable_16px_slot_1_5_to_1_75px_visual_stroke_no_colored_tile_or_letter_avatar' ||
    JSON.stringify(iconPolicy?.icon_text_action_geometry) !==
      JSON.stringify({
        icon_size_px: 16,
        icon_slot_px: 16,
        icon_color: 'currentColor',
        icon_background: 'transparent_none',
        icon_label_gap_px: 4,
        source: 'pinned_dsh_Button.module.css',
        normal_typography: 'var(--dsw-font-s-14)',
        compact_typography: 'var(--dsw-font-xxs-12)',
        alignment: 'icon_slot_and_label_share_one_vertical_centerline',
        contrast_policy: 'button_foreground_color_applies_to_icon_and_label_together',
        disabled_policy: 'apply_disabled_opacity_to_the_whole_control_never_hide_only_the_icon',
      }) ||
    iconPolicy?.upstream_fork_body_bulk_icon_rewrite !== 'forbidden' ||
    iconPolicy?.refresh_actions !== 'icon_only_with_tooltip_and_accessible_name' ||
    iconPolicy?.model_reasoning_control !== 'text_and_disclosure_without_brain_icon' ||
    JSON.stringify(iconPolicy?.account_identity_avatar) !==
      JSON.stringify({
        shape: 'circle',
        background: 'semantic_success_green',
        foreground: 'inverse',
        han_name_initials: 'first_han_character_only',
        non_han_name_initials: 'first_letters_of_first_two_words_uppercase_else_first_two_codepoints',
        email_fallback_initials: 'first_two_local_part_codepoints_uppercase',
        empty_fallback: 'OP',
      }) ||
    iconPolicy?.global_feedback_action?.placement !== 'titlebar_trailing_utility' ||
    iconPolicy?.global_feedback_action?.icon !== 'circle_question' ||
    iconPolicy?.global_feedback_action?.icon_style !== 'regular_outline' ||
    iconPolicy?.global_feedback_action?.target_url !==
      'https://github.com/gaofeng21cn/one-person-lab-app/issues/new' ||
    iconPolicy?.global_feedback_action?.open_mode !== 'external_browser_user_review_and_submit' ||
    JSON.stringify(iconPolicy?.global_feedback_action?.prefill_fields) !==
      JSON.stringify(['localized_title', 'localized_body', 'current_route', 'app_release_version']) ||
    JSON.stringify(iconPolicy?.global_feedback_action?.startup_failure_action) !==
      JSON.stringify({
        placement: 'blocking_startup_failure_dialog',
        delivery_channel: 'electron_main_process_native_open_external_via_preload_ipc',
        backend_dependency: 'none',
        submission_policy: 'external_browser_user_review_and_submit',
        automatic_submission: false,
        prefill_fields: [
          'localized_title',
          'localized_body',
          'app_release_version',
          'platform',
          'architecture',
          'startup_failure_reason',
          'backend_boundary_code',
          'backend_boundary_stage',
        ],
        automatic_attachment_policy: 'forbidden_no_logs_paths_credentials_or_user_content',
      }) ||
    iconPolicy?.global_feedback_action?.shell_local_delivery_forbidden !== true
  ) {
    throw new Error('Product profile OPL utility icons must include the App-owned GitHub feedback action');
  }
  if ('home_agent_shortcuts' in profile.gui.home) {
    throw new Error('Product profile must not restore an App-owned Home shortcut list');
  }
  for (const field of [
    'default_assistants',
    'non_default_assistants',
    'professional_agent_packages',
    'professional_agent_packages_metadata_policy',
  ]) {
    if (field in profile.gui) {
      throw new Error(`Product profile must not restore fixed Agent/Home presentation field gui.${field}`);
    }
  }
  if ('home_purpose_entries' in profile.gui.home) {
    throw new Error('Product profile must not restore fixed Agent/Home presentation field gui.home.home_purpose_entries');
  }
  if (
    homeLayout?.home_presentation_source_ref !==
    'app_state.agent_packages.directory.entries + app_state.agent_packages.status_index.home_shortcut_preferences[]'
  ) {
    throw new Error('Product profile Home presentation must come from the dynamic Agent directory and shortcut compatibility metadata');
  }
  for (const retiredModel of [
    'gpt-5.3-codex-spark',
    'gpt-5.3-codex',
    'gpt-5.2-codex',
    'gpt-5.1-codex-max',
    'gpt-5.1-codex-mini',
  ]) {
    if (!profile.gui.home?.retired_codex_models_must_not_be_exposed?.includes(retiredModel)) {
      throw new Error(`Product profile GUI home must ban retired Codex model ${retiredModel}`);
    }
  }
}
