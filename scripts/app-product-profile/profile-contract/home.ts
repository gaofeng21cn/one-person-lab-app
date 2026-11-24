import type { AppProductProfile } from '../types.ts';
import { assertDynamicHomeComposerStateContract, assertIncludesAll, assertStringArray, dynamicPackagePresentationPolicy } from './support.ts';
import {
  assertAppProductProfileCodexModelDisplayOptions,
  assertAppProductProfileGuiAuthority,
  assertAppProductProfileGuiInteractionBaseline,
  assertAppProductProfileHomeCodexPolicy,
  assertAppProductProfileSettingsVisualSystem,
} from '../../app-product-profile-shared-validators.ts';

export function assertHomeCodexProfileShape(profile: AppProductProfile): void {
  assertAppProductProfileGuiAuthority(profile);
  assertAppProductProfileGuiInteractionBaseline(profile);
  assertAppProductProfileSettingsVisualSystem(profile);
  assertAppProductProfileHomeCodexPolicy(profile, 'App product profile', {
    requireEnglishStatusLabel: true,
    requireSelectionPersistence: true,
  });
  assertDynamicHomeComposerStateContract(profile.gui.home.home_composer_state_contract, 'App product profile Home composer state contract');
  assertStringArray(
    profile.codex.auto_model_policy.frontier_model_preference_order,
    'codex.auto_model_policy.frontier_model_preference_order',
  );
  assertAppProductProfileCodexModelDisplayOptions(profile, 'App product profile', {
    requireAutoIdAndDescriptions: true,
  });
}

export function assertHomeShortcutCompatibilityMetadata(profile: AppProductProfile): void {
  if (
    JSON.stringify(profile.gui.home.home_agent_shortcuts_metadata_policy) !==
      JSON.stringify(dynamicPackagePresentationPolicy.homeShortcuts)
  ) {
    throw new Error('App product profile Home shortcuts must come from owner-projected Package presentation');
  }
  if ('home_agent_shortcuts' in profile.gui.home) {
    throw new Error('App product profile must not restore an App-owned Home shortcut list');
  }
  assertStringArray(
    profile.gui.home.retired_codex_models_must_not_be_exposed,
    'gui.home.retired_codex_models_must_not_be_exposed',
  );
}

export function assertHomeActivityCenterPolicy(profile: AppProductProfile): void {
  if (
    profile.gui.home.activity_center_policy?.source !== 'not_rendered_on_ordinary_home' ||
    profile.gui.home.activity_center_policy.authority !== 'app_owned_home_minimal_command_surface' ||
    profile.gui.home.activity_center_policy.role !== 'home_runtime_activity_suppressed_to_keep_composer_first' ||
    profile.gui.home.activity_center_policy.default_placement !== 'not_rendered_on_ordinary_home' ||
    profile.gui.home.activity_center_policy.home_surface_policy !== 'ordinary_home_must_not_render_activity_center_or_continue_work_grid' ||
    profile.gui.home.activity_center_policy.footer_quick_actions_policy !== 'do_not_render_feedback_star_web_icons_on_home'
  ) {
    throw new Error('App product profile GUI home must keep runtime activity off ordinary Home');
  }
  if (profile.gui.home.activity_center_policy.allowed_home_runtime_context.length !== 0) {
    throw new Error('App product profile GUI home must not allow runtime context on ordinary Home');
  }
  assertIncludesAll(
    profile.gui.home.activity_center_policy.must_not_display,
    [
      'expanded continue-work center',
      'needs attention / active / recent activity groups',
      'per-assistant running badges',
      'module_runtime dirty state as task',
      'domain artifact body',
      'memory body',
      'quality verdict body',
      'provider implementation details',
    ],
    'gui.home.activity_center_policy.must_not_display',
  );
}

export function assertHomeSelectionAndIconPolicy(profile: AppProductProfile): void {
  const homeLayout = profile.gui.home.home_layout;
  const iconPolicy = profile.gui.home.utility_icon_policy;
  if (
    homeLayout.default_active_shortcut !== null ||
    homeLayout.shortcut_selection_policy !==
      'explicit_user_or_navigation_selection_only_no_saved_preset_restore_and_never_disabled_by_launch_readiness' ||
    homeLayout.starter_item_width_policy !== 'content_sized' ||
    homeLayout.starter_count_layout_policy !== 'center_actual_visible_count_and_wrap_without_navigation_chevrons' ||
    homeLayout.desktop_composer_max_width_px !== 736 ||
    homeLayout.desktop_composer_min_height_px !== 98 ||
    homeLayout.desktop_composer_corner_radius_px !== 22 ||
    homeLayout.desktop_context_bar_height_px !== 52 ||
    homeLayout.desktop_context_bar_overlap_px !== 13 ||
    homeLayout.desktop_context_bar_horizontal_inset_px !== 12 ||
    homeLayout.workspace_selector_visible !== true ||
    homeLayout.workspace_selector_entry !== 'home.new_session_context_bar' ||
    homeLayout.unselected_workspace_control_visible !== true ||
    homeLayout.unselected_workspace_control_policy !==
      'localized_choose_project_directory_action_not_projectless_status_placeholder' ||
    homeLayout.selected_working_directory_visual_policy !==
      'independent_new_session_context_bar_control_with_selected_directory_and_clear_action' ||
    homeLayout.selected_starter_visual_policy !==
      'quiet_fill_with_aria_pressed_without_trailing_selection_glyph' ||
    homeLayout.selected_starter_accessibility_state !== 'aria_pressed_reflects_active_shortcut'
  ) {
    throw new Error('App product profile Home must require explicit professional-agent selection with a visible selected state');
  }
  if (
    profile.gui.appearance.visual_source_cohort_ref !== 'contracts/app-gui-visual-source-cohort.json' ||
    profile.gui.appearance.visual_reference_cohort_ref !== 'contracts/app-gui-visual-reference-cohort.json' ||
    JSON.stringify(profile.gui.appearance.shared_visual_primitives) !==
      JSON.stringify(['composer', 'rail_row', 'icon_button', 'menu', 'settings_row'])
  ) {
    throw new Error('App product profile appearance must bind the pinned DSH visual source cohort and shared primitives');
  }
  if (
    iconPolicy.library !== 'pinned_deepseek_harness_icon_cohort_via_opl_icon_adapter' ||
    iconPolicy.opl_owned_settings_navigation_and_overview !== 'dsh_icon_primitives_14_16px_currentcolor' ||
    iconPolicy.settings_icon_geometry !==
      'stable_16px_slot_1_5_to_1_75px_visual_stroke_no_colored_tile_or_letter_avatar' ||
    JSON.stringify(iconPolicy.icon_text_action_geometry) !==
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
    iconPolicy.upstream_fork_body_bulk_icon_rewrite !== 'forbidden' ||
    iconPolicy.refresh_actions !== 'icon_only_with_tooltip_and_accessible_name' ||
    iconPolicy.model_reasoning_control !== 'text_and_disclosure_without_brain_icon' ||
    JSON.stringify(iconPolicy.account_identity_avatar) !==
      JSON.stringify({
        shape: 'circle',
        background: 'semantic_success_green',
        foreground: 'inverse',
        han_name_initials: 'first_han_character_only',
        non_han_name_initials: 'first_letters_of_first_two_words_uppercase_else_first_two_codepoints',
        email_fallback_initials: 'first_two_local_part_codepoints_uppercase',
        empty_fallback: 'OP',
      }) ||
    iconPolicy.global_feedback_action?.placement !== 'titlebar_trailing_utility' ||
    iconPolicy.global_feedback_action?.icon !== 'circle_question' ||
    iconPolicy.global_feedback_action?.icon_style !== 'regular_outline' ||
    iconPolicy.global_feedback_action?.target_url !==
      'https://github.com/gaofeng21cn/one-person-lab-app/issues/new' ||
    iconPolicy.global_feedback_action?.open_mode !== 'external_browser_user_review_and_submit' ||
    JSON.stringify(iconPolicy.global_feedback_action?.prefill_fields) !==
      JSON.stringify(['localized_title', 'localized_body', 'current_route', 'app_release_version']) ||
    JSON.stringify(iconPolicy.global_feedback_action?.startup_failure_action) !==
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
    iconPolicy.global_feedback_action?.shell_local_delivery_forbidden !== true ||
    iconPolicy.scope !== 'opl_owned_overlay_surfaces_not_upstream_fork_body'
  ) {
    throw new Error('App product profile utility icon policy must preserve OPL-owned icons and GitHub issue routing');
  }
}

export function assertUiLocalePolicy(profile: AppProductProfile): void {
  const policy = profile.gui.ui_locale_policy;
  if (
    policy.explicit_user_preference !== 'preserve_across_launches' ||
    policy.first_launch_without_preference !== 'detect_system_locale_before_first_render' ||
    policy.supported_normalization !== 'zh_to_zh-CN_else_en-US' ||
    policy.startup_must_not_overwrite_explicit_preference !== true
  ) {
    throw new Error('App product profile locale policy must detect the system language before first render while preserving explicit preferences');
  }
}

export function assertNoFixedAgentHomePresentation(profile: AppProductProfile): void {
  const gui = profile.gui as unknown as Record<string, unknown>;
  const home = profile.gui.home as unknown as Record<string, unknown>;
  for (const field of [
    'default_assistants',
    'non_default_assistants',
    'professional_agent_packages',
    'professional_agent_packages_metadata_policy',
  ]) {
    if (field in gui) {
      throw new Error(`App product profile must not restore fixed Agent/Home presentation field gui.${field}`);
    }
  }
  if ('home_purpose_entries' in home) {
    throw new Error('App product profile must not restore fixed Agent/Home presentation field gui.home.home_purpose_entries');
  }
  if (
    profile.gui.home.home_layout.home_presentation_source_ref !==
    'app_state.agent_packages.directory.entries + app_state.agent_packages.status_index.home_shortcut_preferences[]'
  ) {
    throw new Error('App product profile Home presentation must come from the dynamic Agent directory and shortcut compatibility metadata');
  }
}
