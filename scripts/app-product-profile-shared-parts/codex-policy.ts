import { assertExpectedFields } from '../value-assertions.ts';
import type { ModelDisplayOptions, ProductProfileLike } from './types.ts';
import type { CodexModelDisplayOptionsLike } from './model-display.ts';
import { assertExactStringArray, expectedCodexVisibleModels, expectedReasoningLabels } from './model-display.ts';

export function assertCodexAutoModelPolicy(
  policy: Record<string, unknown> | undefined,
  profile: ProductProfileLike,
  label: string,
): void {
  const configuredDefault = policy?.configured_default as Record<string, unknown> | undefined;
  if (
    typeof configuredDefault?.model !== 'string' ||
    !configuredDefault.model.trim() ||
    typeof configuredDefault?.reasoning_effort !== 'string' ||
    !configuredDefault.reasoning_effort.trim()
  ) {
    throw new Error(`${label} Codex Auto model policy must define one configured default model and reasoning effort`);
  }
  assertExpectedFields(
    [
      { actual: policy?.authority, expected: 'one-person-lab-app' },
      { actual: policy?.recommendation_authority, expected: 'opl-flow' },
      { actual: policy?.policy_source_ref, expected: 'app_state.agent_packages.status_index.packages.opl-flow.model_projection' },
      { actual: policy?.projection_surface_kind, expected: 'opl_codex_model_policy_projection.v1' },
      {
        actual: policy?.projection_presence_rule,
        expected: 'consume_only_when_fresh_opl_flow_presence_installed_true_and_projection_is_valid',
      },
      {
        actual: policy?.app_role,
        expected: 'resolve_auto_from_fresh_catalog_and_projected_recommendation_then_persist_user_override',
      },
      { actual: policy?.configured_default_role, expected: 'app_default_with_catalog_compatibility_fallback' },
      { actual: policy?.mode_default, expected: 'auto' },
      { actual: policy?.model_catalog_source, expected: 'codex_cli_model_list' },
      { actual: policy?.catalog_response_models_field, expected: 'data' },
      { actual: policy?.catalog_default_model_field, expected: 'isDefault' },
      { actual: policy?.catalog_supported_reasoning_efforts_field, expected: 'supportedReasoningEfforts' },
      { actual: policy?.catalog_supported_reasoning_effort_option_value_field, expected: 'reasoningEffort' },
      { actual: policy?.catalog_reasoning_effort_order_policy, expected: 'last_advertised_supported_reasoning_effort_is_highest' },
      { actual: policy?.catalog_pagination_request_cursor_field, expected: 'cursor' },
      { actual: policy?.catalog_pagination_response_cursor_field, expected: 'nextCursor' },
      { actual: policy?.catalog_pagination_completion_policy, expected: 'exhaust_pages_until_next_cursor_is_null' },
      { actual: policy?.catalog_hidden_model_field, expected: 'hidden' },
      { actual: policy?.catalog_hidden_model_policy, expected: 'exclude_hidden_models_from_auto_and_fixed_options' },
      { actual: policy?.frontier_model_preference_order_role, expected: 'known_model_fallback_and_fixed_option_preference_not_allowlist' },
      { actual: policy?.unknown_default_model_policy, expected: 'ignore_catalog_default_for_app_auto' },
      { actual: policy?.unknown_model_reasoning_effort_policy, expected: 'highest_supported_reasoning_effort_from_catalog' },
      { actual: policy?.catalog_without_default_policy, expected: 'first_available_known_model_then_first_catalog_model' },
    ],
    `${label} Codex Auto model policy must follow the Codex CLI catalog`,
  );
  const visibleModelIds = profile.gui?.home?.codex_model_display_options?.visible_models?.map((model) => model.id);
  assertExactStringArray(
    policy?.frontier_model_preference_order,
    visibleModelIds as string[],
    `${label} Codex known model preference order`,
  );
  const overrides = policy?.known_model_reasoning_effort_overrides as Record<string, unknown> | undefined;
  if (overrides?.[configuredDefault.model] !== configuredDefault.reasoning_effort) {
    throw new Error(`${label} Codex configured default reasoning must project into known model overrides`);
  }
  if (JSON.stringify(policy?.catalog_unavailable_fallback) !== JSON.stringify(configuredDefault)) {
    throw new Error(`${label} Codex catalog fallback must derive from the configured default`);
  }
  if (JSON.stringify(policy?.persistence_policy) !== JSON.stringify({
    auto: 'persist_auto_mode_only_resolve_model_and_reasoning_from_fresh_catalog',
    fixed: 'persist_selected_model_and_reasoning_effort',
    state_encoding: 'auto_has_no_model_snapshot_fixed_has_model_and_reasoning',
    reasoning_override_from_auto: 'pin_current_resolved_model_and_exit_auto',
    stale_fixed_model: 'preserve_fixed_selection_as_unavailable_until_user_restores_auto_or_selects_available_model',
  })) {
    throw new Error(`${label} Codex persistence must keep Auto dynamic and fixed overrides durable`);
  }
}

export function assertAppProductProfileCodexModelDisplayOptions(
  profile: ProductProfileLike,
  label = 'App product profile',
  options: ModelDisplayOptions = {},
): void {
  const displayOptions = profile.gui?.home?.codex_model_display_options;
  const frontierOrder = profile.codex?.auto_model_policy?.frontier_model_preference_order;
  assertCodexModelDisplayShape(profile, displayOptions, frontierOrder, label);
  assertCodexAutoModelOptionDescription(displayOptions?.auto_option, label, options);
  assertVisibleCodexModelsUseFriendlyDefaults(displayOptions?.visible_models ?? [], label);
}

function assertCodexModelDisplayShape(
  profile: ProductProfileLike,
  displayOptions: CodexModelDisplayOptionsLike | undefined,
  frontierOrder: unknown,
  label: string,
): void {
  const auto = displayOptions?.auto_option;
  const visibleModels = displayOptions?.visible_models ?? [];
  assertExpectedFields(
    [
      {
        actual: displayOptions?.display_policy,
        expected: 'friendly_model_name_with_session_configuration_summary_rows',
      },
      {
        actual: displayOptions?.button_label_policy,
        expected: 'resolved_model_compact_label_with_selected_reasoning_effort_no_auto_prefix',
      },
      { actual: displayOptions?.raw_model_id_visible_in_ordinary_ui, expected: false },
      { actual: displayOptions?.reasoning_effort_visible_for_every_option, expected: false },
      { actual: displayOptions?.reasoning_effort_menu_visible, expected: true },
      { actual: displayOptions?.reasoning_menu_title_zh, expected: '推理强度' },
      { actual: displayOptions?.reasoning_menu_title_en, expected: 'Reasoning' },
      {
        actual: displayOptions?.reasoning_effort_override_surface,
        expected: 'session_configuration_reasoning_summary_row_submenu',
      },
      { actual: displayOptions?.reasoning_effort_options_source, expected: 'acp_codex_config_options_enum' },
      { actual: displayOptions?.default_reasoning_effort, expected: profile.codex?.default_reasoning_effort },
      { actual: displayOptions?.auto_option_current_resolution_visible, expected: true },
      {
        actual: displayOptions?.model_menu_policy,
        expected: 'model_summary_row_nested_submenu_with_auto_and_fixed_options',
      },
      { actual: auto?.label_zh, expected: '自动（推荐）' },
      { actual: auto?.label_en, expected: 'Auto (recommended)' },
      { actual: auto?.catalog_unavailable_fallback_model, expected: profile.codex?.default_model },
      {
        actual: auto?.catalog_unavailable_fallback_reasoning_effort,
        expected: profile.codex?.default_reasoning_effort,
      },
      { actual: auto?.follows_latest_strongest, expected: true },
      { actual: displayOptions?.fixed_model_description_zh, expected: '固定此模型' },
      { actual: displayOptions?.fixed_model_description_en, expected: 'Use this model' },
      {
        actual: JSON.stringify(frontierOrder),
        expected: JSON.stringify(expectedCodexVisibleModels.map((model) => model.id)),
      },
      {
        actual: JSON.stringify(visibleModels.map((model) => model.id)),
        expected: JSON.stringify(expectedCodexVisibleModels.map((model) => model.id)),
      },
    ],
    `${label} GUI home must expose friendly Codex model display options with reasoning labels`,
  );
  assertCodexSessionConfigurationMenu(displayOptions?.menu_structure, label);
  assertReasoningOptions(displayOptions, profile, label);
  assertRetiredCodexModelsHidden(visibleModels, label);
}

function assertCodexSessionConfigurationMenu(menu: unknown, label: string): void {
  const structure = menu as Record<string, unknown> | undefined;
  assertExpectedFields(
    [
      {
        actual: JSON.stringify(structure?.root_rows),
        expected: JSON.stringify(['model', 'reasoning_effort', 'reset_defaults']),
      },
      { actual: structure?.additional_root_rows_allowed, expected: false },
      { actual: structure?.performance_tuning_row_allowed, expected: false },
      {
        actual: structure?.summary_row_policy,
        expected: 'localized_label_left_current_value_and_chevron_right',
      },
      {
        actual: structure?.reset_defaults_policy,
        expected: 'restore_auto_model_and_app_default_reasoning',
      },
      { actual: structure?.reset_label_zh, expected: '重置为默认设置' },
      { actual: structure?.reset_label_en, expected: 'Reset to defaults' },
      { actual: structure?.summary_row_icon_policy, expected: 'no_leading_icons' },
      { actual: structure?.reset_icon_policy, expected: 'single_trailing_reset_outline_icon' },
      { actual: structure?.home_and_conversation_share_menu_component, expected: true },
    ],
    `${label} Codex session configuration menu must expose discoverable model and reasoning summary rows`,
  );
}

function assertReasoningOptions(
  displayOptions: CodexModelDisplayOptionsLike | undefined,
  profile: ProductProfileLike,
  label: string,
): void {
  const options = displayOptions?.user_reasoning_effort_options;
  if (!Array.isArray(options) || !options.every((effort) => typeof effort === 'string' && effort.trim())) {
    throw new Error(`${label} Codex reasoning effort options must be non-empty strings`);
  }
  if (!options.includes(profile.codex?.default_reasoning_effort)) {
    throw new Error(`${label} Codex reasoning effort options must include the configured default`);
  }
  for (const effort of Object.keys(expectedReasoningLabels)) {
    const labels = displayOptions?.reasoning_labels?.[effort];
    const expectedLabels = expectedReasoningLabels[effort as keyof typeof expectedReasoningLabels];
    if (labels?.zh !== expectedLabels.zh || labels?.en !== expectedLabels.en) {
      throw new Error(`${label} Codex reasoning effort option ${effort} must use Codex App labels`);
    }
  }
}

function assertCodexAutoModelOptionDescription(
  auto: CodexModelDisplayOptionsLike['auto_option'] | undefined,
  label: string,
  options: ModelDisplayOptions,
): void {
  if (
    options.requireAutoIdAndDescriptions &&
    (
      auto!.id !== '__auto' ||
      typeof auto!.description_zh !== 'string' ||
      !auto!.description_zh.includes('Codex CLI') ||
      !auto!.description_zh.includes('App 推理策略') ||
      typeof auto!.description_en !== 'string' ||
      !auto!.description_en.includes('Codex CLI') ||
      !auto!.description_en.includes('App reasoning policy')
    )
  ) {
    throw new Error(`${label} Codex auto model option must describe dynamic catalog resolution without a static snapshot`);
  }
}

function assertVisibleCodexModelsUseFriendlyDefaults(
  visibleModels: NonNullable<CodexModelDisplayOptionsLike['visible_models']>,
  label: string,
): void {
  for (const expected of expectedCodexVisibleModels) {
    const actual = visibleModels.find((model) => model.id === expected.id);
    if (actual?.label_zh !== expected.label_zh || actual?.label_en !== expected.label_en) {
      throw new Error(`${label} GUI home known Codex model ${expected.id} must keep its App label`);
    }
  }
  for (const model of visibleModels) {
    if (
      typeof model.label_zh !== 'string' ||
      typeof model.label_en !== 'string' ||
      model.label_zh === model.id ||
      model.label_en === model.id ||
      'reasoning_effort' in model
    ) {
      throw new Error(`${label} GUI home Codex model ${model.id} must use friendly labels without repeating reasoning`);
    }
  }
}

function assertRetiredCodexModelsHidden(
  visibleModels: NonNullable<CodexModelDisplayOptionsLike['visible_models']>,
  label: string,
): void {
  const forbidden = new Set([
    'gpt-5.3-codex-spark',
    'gpt-5.3-codex',
    'gpt-5.2-codex',
    'gpt-5.1-codex-max',
    'gpt-5.1-codex-mini',
  ]);
  for (const model of visibleModels) {
    if (typeof model.id === 'string' && forbidden.has(model.id)) {
      throw new Error(`${label} GUI home must not expose retired Codex model ${model.id} as an ordinary visible model`);
    }
  }
}
