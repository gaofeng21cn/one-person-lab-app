import { readFileSync } from 'node:fs';
import { productProfilePath } from '../validation-config.ts';
import {
  assertTextExcludesAll,
  assertTextIncludesAll,
  readShellJson,
  readShellText,
} from '../shell-implementation-helpers.ts';

const productProfileDefaultsExpected = [
  '"configured_default": {',
  '"codex_cli_fixed_executor": true',
  '"home_executor_selector_visible": false',
  '"codex_model_selector_visible": true',
  '"codex_model_list_visible": true',
  '"codex_model_policy": "codex_cli_latest_strongest_model_selector_visible"',
  '"codex_model_auto_option_visible": true',
  '"codex_precise_model_display_policy": "friendly_model_with_discoverable_model_and_reasoning_summary_rows"',
  '"button_label_policy": "resolved_model_compact_label_with_selected_reasoning_effort_no_auto_prefix"',
  '"default_active_shortcut": null',
  '"shortcut_selection_policy": "explicit_user_or_navigation_selection_only_no_saved_preset_restore_and_never_disabled_by_launch_readiness"',
  '"selected_starter_visual_policy": "quiet_fill_with_aria_pressed_without_trailing_selection_glyph"',
  '"selected_starter_accessibility_state": "aria_pressed_reflects_active_shortcut"',
  '"policy_source_ref": "contracts/app-product-profile.json#codex.auto_model_policy"',
  '"model_catalog_source": "codex_cli_model_list"',
  '"catalog_response_models_field": "data"',
  '"catalog_default_model_field": "isDefault"',
  '"catalog_supported_reasoning_efforts_field": "supportedReasoningEfforts"',
  '"catalog_supported_reasoning_effort_option_value_field": "reasoningEffort"',
  '"catalog_pagination_request_cursor_field": "cursor"',
  '"catalog_pagination_response_cursor_field": "nextCursor"',
  '"catalog_pagination_completion_policy": "exhaust_pages_until_next_cursor_is_null"',
  '"catalog_hidden_model_policy": "exclude_hidden_models_from_auto_and_fixed_options"',
  '"frontier_model_preference_order_role": "known_model_fallback_and_fixed_option_preference_not_allowlist"',
  '"unknown_default_model_policy": "ignore_catalog_default_for_app_auto"',
  '"unknown_model_reasoning_effort_policy": "highest_supported_reasoning_effort_from_catalog"',
  '"auto": "persist_auto_mode_only_resolve_model_and_reasoning_from_fresh_catalog"',
  '"fixed": "persist_selected_model_and_reasoning_effort"',
  '"reasoning_override_from_auto": "pin_current_resolved_model_and_exit_auto"',
  '"user_can_override_model": true',
  '"user_can_restore_auto": true',
  '"display_policy": "friendly_model_name_with_session_configuration_summary_rows"',
  '"raw_model_id_visible_in_ordinary_ui": false',
  '"reasoning_effort_visible_for_every_option": false',
  '"reasoning_effort_menu_visible": true',
  '"model_menu_policy": "model_summary_row_nested_submenu_with_auto_and_fixed_options"',
  '"additional_root_rows_allowed": false',
  '"performance_tuning_row_allowed": false',
  '"home_and_conversation_share_menu_component": true',
  '"reasoning_effort_options_source": "acp_codex_config_options_enum"',
  '"label_zh": "自动（推荐）"',
  '"label_zh": "6.2 Astra"',
  '"description_zh": "跟随 Codex CLI 当前默认模型与 App 推理策略"',
  '"label_zh": "5.6 Sol"',
  '"label_zh": "5.6 Terra"',
  '"label_zh": "5.6 Luna"',
  '"label_zh": "5.5"',
  '"label_zh": "5.4"',
  '"label_zh": "5.4 Mini"',
  '"label_zh": "5.2"',
  '"capability_strategy_consumer"',
  '"strategy_authority": "opl-flow"',
  '"compiler_authority": "opl-framework"',
  '"full_build_lock_kind": "opl_flow_capability_build_lock.v1"',
];

const codexSessionConfigurationMenuStructureExpected = {
  root_rows: ['model', 'reasoning_effort', 'reset_defaults'],
  additional_root_rows_allowed: false,
  performance_tuning_row_allowed: false,
  summary_row_policy: 'localized_label_left_current_value_and_chevron_right',
  reset_defaults_policy: 'restore_auto_model_and_app_default_reasoning',
  reset_label_zh: '重置为默认设置',
  reset_label_en: 'Reset to defaults',
  summary_row_icon_policy: 'no_leading_icons',
  reset_icon_policy: 'single_trailing_reset_outline_icon',
  home_and_conversation_share_menu_component: true,
};


export function assertProductProfileFrontierModelPreferenceOrder(productProfileJson) {
  const actual = productProfileJson?.codex?.auto_model_policy?.frontier_model_preference_order;
  const appProfile = JSON.parse(readFileSync(productProfilePath, 'utf8'));
  const expected = appProfile.codex.auto_model_policy.frontier_model_preference_order;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Active shell product profile must carry App Codex known frontier_model_preference_order=${JSON.stringify(expected)}`,
    );
  }
  if (productProfileJson?.gui?.home?.codex_home_model_status_label !== appProfile.gui.home.codex_home_model_status_label) {
    throw new Error('Active shell model status label must match the current App product profile');
  }
}

export function validateProductProfileDefaults(shellPaths) {
  const productProfilePath = 'packages/desktop/src/common/config/oplProductProfile/oplProductProfile.generated.json';
  const productProfile = readShellText(shellPaths, productProfilePath);
  const productProfileJson = readShellJson(shellPaths, productProfilePath, 'product profile');
  for (const field of [
    'professional_agent_packages',
    'professional_agent_packages_metadata_policy',
    'default_assistants',
    'non_default_assistants',
  ]) {
    if (Object.prototype.hasOwnProperty.call(productProfileJson?.gui ?? {}, field)) {
      throw new Error(`Active shell product profile must not carry App-owned Agent presentation authority gui.${field}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(productProfileJson?.gui?.home ?? {}, 'home_purpose_entries')) {
    throw new Error(
      'Active shell product profile must not carry App-owned Agent presentation authority gui.home.home_purpose_entries',
    );
  }
  for (const field of [
    'opl_app_session_context',
    'default_visible_skills',
    'skill_priority',
    'session_context_lines',
    'session_context_i18n',
  ]) {
    if (Object.prototype.hasOwnProperty.call(productProfileJson?.codex ?? {}, field)) {
      throw new Error(`Active shell product profile must not carry legacy Codex authority codex.${field}`);
    }
  }
  const additionalInstructions = productProfileJson?.codex?.new_conversation_additional_instructions;
  if (
    additionalInstructions?.content_owner !== 'user' ||
    additionalInstructions?.delivery !== 'new_conversation_additional_instructions_only' ||
    additionalInstructions?.storage_key !== 'codex.oplAppSessionContextAdditional' ||
    additionalInstructions?.storage_key_status !== 'legacy_compatibility_storage_key' ||
    additionalInstructions?.generated_base_context_allowed !== false ||
    additionalInstructions?.agent_route_fallback_allowed !== false ||
    additionalInstructions?.empty_value_policy !== 'inject_nothing' ||
    additionalInstructions?.reset_behavior !== 'clear_additional_instructions' ||
    additionalInstructions?.effect !== 'next_new_conversation'
  ) {
    throw new Error('Active shell product profile must limit new-conversation additions to optional user-authored text');
  }
  const ordinaryPolicy = productProfileJson?.gui?.ordinary_capability_selector_policy;
  if (
    ordinaryPolicy?.authority !== 'owner_or_carrier_skill_projection_and_mcp_negative_filter' ||
    ordinaryPolicy?.agent_reference_admission_policy?.active_agent_package_cardinality !== 'zero_or_one' ||
    ordinaryPolicy?.agent_reference_admission_policy?.selection_authority !==
      'home_starter_new_session_capability_palette_explicit_capability_route_or_explicit_pre_send_at_mention_agent_selection' ||
    ordinaryPolicy?.agent_reference_admission_policy?.at_mention_agent_selection_allowed !== true ||
    ordinaryPolicy?.agent_reference_admission_policy?.at_mention_semantics !==
      'explicit_new_session_agent_selection_before_first_send_plain_text_references_remain_prompt_context' ||
    ordinaryPolicy?.agent_reference_admission_policy?.plain_text_agent_reference_changes_active_package !== false ||
    ordinaryPolicy?.agent_reference_admission_policy?.multiple_agent_reference_policy !==
      'latest_explicit_pre_send_at_mention_selection_sets_the_new_session_agent_plain_text_references_remain_prompt_context' ||
    ordinaryPolicy?.agent_reference_admission_policy?.existing_conversation_rebinding_allowed !== false ||
    ordinaryPolicy?.agent_reference_admission_policy?.existing_conversation_rebinding_contract !== undefined ||
    ordinaryPolicy?.mcp_menu_policy !==
      'preserve_configured_user_and_third_party_servers_except_explicit_forbidden_matchers' ||
    ordinaryPolicy?.visible_mcp_server_ids !== undefined ||
    ordinaryPolicy?.forbidden_skill_examples !== undefined
  ) {
    throw new Error('Active shell product profile must carry new-session-only Agent selection and MCP negative-filter authority');
  }
  const agentPaletteGroup = productProfileJson?.gui?.ordinary_conversation?.unified_context_menu?.groups?.find(
    (group: { id?: unknown }) => group.id === 'agent_packages',
  );
  if (
    agentPaletteGroup?.scope !== 'new_session_configuration_or_existing_turn_invocation' ||
    agentPaletteGroup?.existing_session_rebinding_allowed !== false ||
    agentPaletteGroup?.existing_conversation_invocation_policy !==
      'invoke_selected_standard_agent_for_current_turn_without_rebinding_the_codex_thread' ||
    JSON.stringify(agentPaletteGroup?.surface_actions?.existing_conversation) !==
      JSON.stringify(['invoke_agent_package_for_current_turn'])
  ) {
    throw new Error('Active shell product profile must not expose existing-conversation Agent rebinding');
  }
  assertTextExcludesAll(
    productProfile,
    [
      'aioncore_atomic_conversation_owner_rebind_api',
      'explicit_at_mention_owner_rebind_via_core_atomic_api',
      'existing_conversation_rebinding_contract',
      '"default_packaged_codex_skill_ids"',
      '"additional_package_skill_ids"',
      '"official_codex_runtime_capabilities"',
    ],
    'Active shell product profile retired private Agent and App capability inventories',
  );
  assertProductProfileFrontierModelPreferenceOrder(productProfileJson);
  const menuStructure = productProfileJson?.gui?.home?.codex_model_display_options?.menu_structure;
  if (JSON.stringify(menuStructure) !== JSON.stringify(codexSessionConfigurationMenuStructureExpected)) {
    throw new Error('Active shell product profile must carry the exact App Codex session configuration menu');
  }
  assertTextIncludesAll(productProfile, productProfileDefaultsExpected, 'Active shell product profile App Codex default');
}
