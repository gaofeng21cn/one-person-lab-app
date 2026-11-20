type JsonObject = Record<string, any>;

export type CodexConfiguredDefault = {
  model: string;
  reasoning_effort: string;
};

export type CodexModelPolicyContractBundle = {
  productProfile: JsonObject;
  guiProductContract: JsonObject;
  pageStateMatrix: JsonObject;
};

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

export function readCodexConfiguredDefault(productProfile: JsonObject): CodexConfiguredDefault {
  const configuredDefault = productProfile.codex?.auto_model_policy?.configured_default;
  return {
    model: requireNonEmptyString(configuredDefault?.model, 'codex.auto_model_policy.configured_default.model'),
    reasoning_effort: requireNonEmptyString(
      configuredDefault?.reasoning_effort,
      'codex.auto_model_policy.configured_default.reasoning_effort',
    ),
  };
}

function includeReasoningEffort(values: unknown, effort: string): string[] {
  const options = Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : [];
  return options.includes(effort) ? options : [...options, effort];
}

function friendlyModelLabel(model: string): string {
  return model.replace(/^gpt-/i, 'GPT ').replaceAll('-', ' ');
}

export function projectCodexModelPolicyContracts(
  source: CodexModelPolicyContractBundle,
): CodexModelPolicyContractBundle {
  const bundle = structuredClone(source);
  const { productProfile, guiProductContract, pageStateMatrix } = bundle;
  const configuredDefault = readCodexConfiguredDefault(productProfile);
  const { model, reasoning_effort: reasoningEffort } = configuredDefault;
  const policy = productProfile.codex.auto_model_policy;
  const home = productProfile.gui.home;
  const display = home.codex_model_display_options;
  let visibleModel = display.visible_models.find((option: JsonObject) => option.id === model);
  if (!visibleModel) {
    const label = friendlyModelLabel(model);
    visibleModel = { id: model, label_zh: label, label_en: label };
    display.visible_models.unshift(visibleModel);
  }
  if (!policy.frontier_model_preference_order.includes(model)) {
    policy.frontier_model_preference_order.unshift(model);
  }
  const displayLabelZh = visibleModel?.label_zh ?? model;
  const displayLabelEn = visibleModel?.label_en ?? model;

  productProfile.codex.default_model = model;
  productProfile.codex.default_reasoning_effort = reasoningEffort;
  productProfile.default_session_profile.model = model;
  productProfile.default_session_profile.reasoning_effort = reasoningEffort;
  home.codex_default_model = model;
  home.codex_default_reasoning_effort = reasoningEffort;
  home.codex_home_model_status_label = displayLabelZh;
  home.codex_home_model_status_label_en = displayLabelEn;
  display.default_reasoning_effort = reasoningEffort;
  display.auto_option.catalog_unavailable_fallback_model = model;
  display.auto_option.catalog_unavailable_fallback_reasoning_effort = reasoningEffort;
  display.user_reasoning_effort_options = includeReasoningEffort(
    display.user_reasoning_effort_options,
    reasoningEffort,
  );
  policy.catalog_unavailable_fallback = configuredDefault;
  policy.known_model_reasoning_effort_overrides = {
    ...policy.known_model_reasoning_effort_overrides,
    [model]: reasoningEffort,
  };

  guiProductContract.executor_policy.default_model = model;
  guiProductContract.executor_policy.default_reasoning_effort = reasoningEffort;
  guiProductContract.executor_policy.default_model_display_value = displayLabelZh;
  guiProductContract.executor_policy.home_model_status_label = displayLabelZh;
  guiProductContract.executor_policy.home_model_status_label_en = displayLabelEn;
  guiProductContract.executor_policy.model_display_options_policy.user_reasoning_effort_options = includeReasoningEffort(
    guiProductContract.executor_policy.model_display_options_policy.user_reasoning_effort_options,
    reasoningEffort,
  );
  guiProductContract.first_launch_readiness_policy.default_model = model;
  guiProductContract.first_launch_readiness_policy.default_reasoning_effort = reasoningEffort;
  const guiHome = guiProductContract.pages?.guid_home;
  if (guiHome?.model_status) {
    guiHome.model_status.display_value = displayLabelZh;
  }
  if (Array.isArray(guiHome?.must_show)) {
    guiHome.must_show = guiHome.must_show.map((entry: unknown) =>
      typeof entry === 'string' && entry.startsWith('Codex model selector defaults to ')
        ? `Codex model selector defaults to ${displayLabelZh}`
        : entry,
    );
  }

  const guidHome = pageStateMatrix.pages.find((page: JsonObject) => page.id === 'guid_home');
  if (!guidHome?.home_view_model) {
    throw new Error('app-page-state-matrix must expose guid_home.home_view_model');
  }
  guidHome.home_view_model.codex_default_model = model;
  guidHome.home_view_model.codex_default_reasoning_effort = reasoningEffort;
  guidHome.home_view_model.codex_default_display_label = displayLabelZh;
  guidHome.home_view_model.codex_default_model_display_value = displayLabelZh;
  if (guidHome.model_status) {
    guidHome.model_status.display_value = displayLabelZh;
  }
  if (Array.isArray(guidHome.must_show)) {
    guidHome.must_show = guidHome.must_show.map((entry: unknown) =>
      typeof entry === 'string' && entry.startsWith('Codex model selector defaulting to ')
        ? `Codex model selector defaulting to ${displayLabelZh}`
        : entry,
    );
  }

  return bundle;
}

export function assertCodexModelPolicyProjection(bundle: CodexModelPolicyContractBundle): void {
  const projected = projectCodexModelPolicyContracts(bundle);
  if (JSON.stringify(projected) !== JSON.stringify(bundle)) {
    throw new Error('Codex model policy projections are stale; run npm run codex:model-policy:sync');
  }
}
