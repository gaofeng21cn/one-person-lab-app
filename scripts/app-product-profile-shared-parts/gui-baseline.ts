import { assertExpectedFields } from '../value-assertions.ts';
import type { ProductProfileLike } from './types.ts';
import { assertExactStringArray } from './model-display.ts';
import {
  appOwnedActiveAionuiPrimaryNavigation,
  appOwnedCodexSubagentActivityPolicy,
  appOwnedExplicitSessionInputPolicy,
  appOwnedRightContextInspectorForbiddenOwners,
  appOwnedRightContextInspectorPolicy,
  appOwnedSendFailureInputPolicy,
  appOwnedSessionWorkspaceModel,
  appOwnedTranscriptExport,
  appOwnedUnifiedContextMenu,
} from '../validate-active-shell/app-contract-constants.ts';

export function assertAppProductProfileGuiInteractionBaseline(
  profile: ProductProfileLike,
  label = 'App product profile',
): void {
  if (profile.schema_version !== 2) {
    throw new Error(`${label} schema_version must be 2`);
  }
  const homeLayout = profile.gui?.home?.home_layout as Record<string, unknown> | undefined;
  const conversation = profile.gui?.ordinary_conversation;
  const inspector = profile.gui?.right_context_inspector;
  assertExpectedFields(
    [
      { actual: homeLayout?.composer_position, expected: 'floating_bottom_with_safe_inset' },
      { actual: homeLayout?.desktop_composer_max_width_px, expected: 736 },
      { actual: homeLayout?.desktop_composer_min_height_px, expected: 98 },
      { actual: homeLayout?.desktop_composer_corner_radius_px, expected: 22 },
      { actual: homeLayout?.desktop_context_bar_height_px, expected: 52 },
      { actual: homeLayout?.desktop_context_bar_overlap_px, expected: 13 },
      { actual: homeLayout?.desktop_context_bar_horizontal_inset_px, expected: 12 },
      { actual: homeLayout?.workspace_selector_visible, expected: true },
      {
        actual: homeLayout?.workspace_selector_entry,
        expected: 'home.new_session_context_bar',
      },
      { actual: homeLayout?.unselected_workspace_control_visible, expected: true },
      {
        actual: homeLayout?.unselected_workspace_control_policy,
        expected: 'localized_choose_project_directory_action_not_projectless_status_placeholder',
      },
      {
        actual: homeLayout?.selected_working_directory_visual_policy,
        expected: 'independent_new_session_context_bar_control_with_selected_directory_and_clear_action',
      },
      { actual: homeLayout?.workspace_session_rail_default_state, expected: 'visible_wide_drawer_narrow' },
      { actual: homeLayout?.right_context_inspector_default_state, expected: 'collapsed' },
      {
        actual: conversation?.entry_source,
        expected: 'home_starter_workspace_initialized_or_projectless_new_session',
      },
      { actual: conversation?.composer_position, expected: 'floating_bottom_with_safe_inset' },
      { actual: conversation?.permission_mode_selector_visible, expected: true },
      {
        actual: conversation?.composer_placeholder_policy,
        expected: 'opl_owned_localized_task_prompt_without_backend_name_interpolation',
      },
      { actual: inspector?.default_third_column_visible, expected: false },
      { actual: inspector?.runtime_duplicate_allowed, expected: false },
      { actual: inspector?.equal_weight_tool_taxonomy_allowed, expected: false },
    ],
    `${label} GUI interaction profile must match the Codex baseline`,
  );
  if (
    JSON.stringify(homeLayout?.active_aionui_primary_navigation) !==
    JSON.stringify(appOwnedActiveAionuiPrimaryNavigation)
  ) {
    throw new Error(
      `${label} GUI Home must keep Runtime status in the active AionUI primary navigation without expanding Native or release gates`,
    );
  }
  assertExactStringArray(
    conversation?.composer_bottom_action_row,
    ['unified_context_menu', 'permission_access_mode', 'model_reasoning', 'send_stop'],
    `${label} GUI composer bottom action row`,
  );
  assertExactStringArray(
    conversation?.composer_context_strip,
    ['active_capability'],
    `${label} GUI composer persistent context`,
  );
  assertExactStringArray(
    conversation?.composer_send_scoped_inputs,
    ['attachments'],
    `${label} GUI composer send-scoped inputs`,
  );
  if (
    JSON.stringify(conversation?.send_failure_input_policy) !==
    JSON.stringify(appOwnedSendFailureInputPolicy)
  ) {
    throw new Error(
      `${label} GUI conversation must preserve prompt and attachments across creation, initial-send, and in-conversation send failures`,
    );
  }
  assertExactStringArray(
    conversation?.composer_forbidden_persistent_context,
    ['project', 'workspace', 'locality', 'branch', 'attachments', 'workspace_context_refs'],
    `${label} GUI composer forbidden persistent context`,
  );
  if (
    JSON.stringify(conversation?.session_workspace_model) !== JSON.stringify(appOwnedSessionWorkspaceModel) ||
    JSON.stringify(conversation?.explicit_session_input_policy) !== JSON.stringify(appOwnedExplicitSessionInputPolicy) ||
    'project_context_inputs' in (conversation ?? {}) ||
    'projectless_input_policy' in (conversation ?? {})
  ) {
    throw new Error(`${label} GUI conversation must keep session identity primary and accept only explicit current-session inputs`);
  }
  if (
    JSON.stringify(conversation?.codex_subagent_activity) !==
    JSON.stringify(appOwnedCodexSubagentActivityPolicy)
  ) {
    throw new Error(`${label} GUI Codex subagent activity must remain a read-only projection without private orchestration`);
  }
  if (
    JSON.stringify(conversation?.transcript_export) !== JSON.stringify(appOwnedTranscriptExport)
  ) {
    throw new Error(`${label} GUI transcript export must remain shareable transcript only`);
  }
  if (
    JSON.stringify(
      Object.fromEntries(
        Object.entries(inspector ?? {}).filter(([key]) => key !== 'must_not_own'),
      ),
    ) !== JSON.stringify(appOwnedRightContextInspectorPolicy)
  ) {
    throw new Error(`${label} GUI advanced workspace surfaces must match the 41301 policy`);
  }
  for (const legacyField of ['tabs', 'primary_tools', 'secondary_sections']) {
    if (legacyField in (inspector ?? {})) {
      throw new Error(`${label} GUI must not restore legacy inspector taxonomy field ${legacyField}`);
    }
  }
  assertExactStringArray(
    inspector?.must_not_own,
    appOwnedRightContextInspectorForbiddenOwners,
    `${label} GUI advanced workspace forbidden owners`,
  );
  const mobileActionSheet = conversation?.mobile_action_sheet as Record<string, unknown> | undefined;
  assertExactStringArray(
    mobileActionSheet?.allowed_actions,
    ['unified_context_menu', 'permission_access_mode', 'model_reasoning', 'active_capability'],
    `${label} GUI mobile action sheet allowed actions`,
  );
  assertExactStringArray(
    mobileActionSheet?.forbidden_actions,
    ['backend', 'provider', 'team', 'raw_mcp', 'arbitrary_skills'],
    `${label} GUI mobile action sheet forbidden actions`,
  );
  if (mobileActionSheet?.send_stop_location !== 'composer_primary_action_outside_sheet') {
    throw new Error(`${label} GUI mobile send/stop must remain the composer primary action`);
  }
  if (JSON.stringify(conversation?.unified_context_menu) !== JSON.stringify(appOwnedUnifiedContextMenu)) {
    throw new Error(`${label} GUI unified context menu must expose only real App-authorized context actions`);
  }
}

export function assertAppProductProfileSettingsVisualSystem(
  profile: ProductProfileLike,
  label = 'App product profile',
): void {
  const visualSystem = profile.settings?.control_plane?.experience_contract?.visual_system;
  assertExpectedFields(
    [
      { actual: visualSystem?.style, expected: 'codex_quiet_control_center_with_opl_information_architecture' },
      { actual: visualSystem?.style_exclusion, expected: 'multi_hue_card_dashboard' },
      {
        actual: visualSystem?.card_policy,
        expected: 'unframed_sections_with_bounded_groups_only_for_repeated_entities_or_confirmation',
      },
      { actual: visualSystem?.nested_cards_allowed, expected: false },
      { actual: visualSystem?.page_wide_list_wall_allowed, expected: false },
      { actual: visualSystem?.page_sections_as_floating_cards_allowed, expected: false },
      { actual: visualSystem?.footer_layout, expected: 'compact' },
      {
        actual: visualSystem?.footer_account_entry_policy,
        expected:
          'show_gateway_display_name_when_connected_else_account_access_without_a_duplicate_settings_entry',
      },
      {
        actual: visualSystem?.footer_update_entry_policy,
        expected:
          'show_confirmed_newer_app_update_as_account_row_trailing_action_and_reuse_existing_carrier_updater_without_owning_update_truth',
      },
      { actual: visualSystem?.footer_theme_quick_toggle_allowed, expected: false },
      { actual: visualSystem?.footer_secondary_navigation_allowed, expected: true },
      { actual: visualSystem?.footer_auxiliary_navigation, expected: 'about_only_sidebar_bottom' },
      { actual: visualSystem?.footer_duplicate_settings_entry_allowed, expected: false },
      { actual: visualSystem?.appearance_mode_presentation, expected: 'three_visual_preview_cards' },
      { actual: visualSystem?.appearance_mode_preserves_theme_preset, expected: false },
      { actual: visualSystem?.theme_gallery_presentation, expected: 'not_exposed' },
      { actual: visualSystem?.theme_swatch_list_allowed, expected: false },
      { actual: visualSystem?.max_border_radius_px, expected: 8 },
    ],
    `${label} Settings visual system must preserve the Codex quiet baseline with OPL information architecture`,
  );
  if (
    JSON.stringify(visualSystem?.footer_controls) !==
      JSON.stringify(['gateway_account_or_account_access_entry', 'app_update_status_and_trigger']) ||
    JSON.stringify(visualSystem?.appearance_mode_values) !== JSON.stringify(['system', 'light', 'dark'])
  ) {
    throw new Error(
      `${label} footer must reserve a conditional account-row update action and keep System, Light, and Dark in Settings`,
    );
  }
}
