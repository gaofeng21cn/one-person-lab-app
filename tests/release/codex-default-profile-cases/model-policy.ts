import {
  assert,
  fs,
  test,
  validateAppGuiProductContract,
  validatePrimaryInteractionPages,
  validateProductProfile,
  assertCanonicalThreadDirectoryGroupingSources,
  assertCanonicalThreadDirectoryTimeoutBoundarySources,
  assertCanonicalThreadAffinityConvergenceSources,
  assertCurrentGuidHomeSelectionSources,
  assertProjectlessGuidFileAccessSources,
  assertRuntimePageSourceBoundary,
  assertSkillsHubScopeSource,
  validateShellVisualTokenBindings,
  assertCodexModelPolicyProjection,
  projectCodexModelPolicyContracts,
  readJson,
  readModelPolicyBundle,
} from "./fixtures.ts";

test('current App default follows the latest bundled Astra model at maximum reasoning', () => {
  const profile = readJson('contracts/app-product-profile.json');
  assert.deepEqual(profile.codex.auto_model_policy.configured_default, {
    model: 'gpt-6.2-astra',
    reasoning_effort: 'max',
  });
  assert.equal(profile.codex.default_model, 'gpt-6.2-astra');
  assert.equal(profile.codex.default_reasoning_effort, 'max');
});

test('GUI contract rejects Auto model policy source drift from the App product profile', () => {
  const guiContract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
  guiContract.executor_policy.auto_model_policy_source_ref = 'shell-local-policy';

  assert.throws(() => validateAppGuiProductContract(
    guiContract,
    readJson('contracts/app-release-channel.json'),
    readJson('contracts/app-install-exposure-policy.json'),
  ));
});

test('product profile rejects static allowlist semantics for future Codex defaults', () => {
  const productProfile = structuredClone(readJson('contracts/app-product-profile.json'));
  productProfile.codex.auto_model_policy.unknown_default_model_policy = 'reject_unknown_models';

  assert.throws(() => validateProductProfile(
    productProfile,
    readJson('contracts/app-install-exposure-policy.json'),
  ));
});

test('product profile rejects reasoning policies that do not use the highest CLI-advertised effort', () => {
  const productProfile = structuredClone(readJson('contracts/app-product-profile.json'));
  productProfile.codex.auto_model_policy.unknown_model_reasoning_effort_policy = 'use_app_default';

  assert.throws(() => validateProductProfile(
    productProfile,
    readJson('contracts/app-install-exposure-policy.json'),
  ));
});

test('product profile rejects Codex CLI catalog field drift', () => {
  const productProfile = structuredClone(readJson('contracts/app-product-profile.json'));
  productProfile.codex.auto_model_policy.catalog_default_model_field = 'default';

  assert.throws(() => validateProductProfile(
    productProfile,
    readJson('contracts/app-install-exposure-policy.json'),
  ));

  productProfile.codex.auto_model_policy.catalog_default_model_field = 'isDefault';
  productProfile.codex.auto_model_policy.catalog_supported_reasoning_efforts_field = 'reasoningEfforts';

  assert.throws(() => validateProductProfile(
    productProfile,
    readJson('contracts/app-install-exposure-policy.json'),
  ));
});

test('product profile freezes the real paginated Codex model/list response shape', () => {
  const productProfile = structuredClone(readJson('contracts/app-product-profile.json'));
  const policy = productProfile.codex.auto_model_policy;

  assert.equal(policy.catalog_response_models_field, 'data');
  assert.equal(policy.catalog_pagination_request_cursor_field, 'cursor');
  assert.equal(policy.catalog_pagination_response_cursor_field, 'nextCursor');
  assert.equal(policy.catalog_pagination_completion_policy, 'exhaust_pages_until_next_cursor_is_null');
  assert.equal(policy.catalog_supported_reasoning_effort_option_value_field, 'reasoningEffort');
  assert.equal(policy.catalog_hidden_model_field, 'hidden');
  assert.equal(policy.catalog_hidden_model_policy, 'exclude_hidden_models_from_auto_and_fixed_options');
  assert.deepEqual(policy.custom_model_access_policy, {
    default_enabled: false,
    surface: 'settings_models_collapsed_advanced_disclosure',
    selection: 'explicit_fixed_model_only',
    auto_behavior: 'unchanged',
    disabled_selection: 'preserve_as_unavailable_and_block_send_until_auto_admitted_model_or_explicit_reenable',
    warning_required: true,
  });
});

test('custom model access stays a default-off advanced Models setting', () => {
  const profile = readJson('contracts/app-product-profile.json');
  const option = profile.gui.home.codex_model_display_options.custom_model_access_option;
  assert.deepEqual(option, {
    default_enabled: false,
    surface: 'settings_models_collapsed_advanced_disclosure',
    label_zh: '启用自定义模型',
    label_en: 'Enable custom models',
    description_zh: '仅在你明确需要时显示本机 Codex 目录中的自定义与第三方模型；它们可能改变 OPL 标准智能体的行为。自动模式保持不变。',
    description_en: 'Show custom and third-party models from the local Codex catalog only when explicitly needed; they may change OPL standard-Agent behavior. Auto remains unchanged.',
  });
  const modelsPage = readJson('contracts/app-settings-control-plane.json').experience_contract.page_contracts.models;
  assert.equal(modelsPage.surface_inventory.configuration.at(-1).id, 'custom_model_access');
  assert.equal(modelsPage.custom_model_access.visibility, 'collapsed_advanced_only');
  assert.equal(modelsPage.custom_model_access.placement, 'models_page_after_model_preference_before_codex_cli');
  assert.ok(modelsPage.required_anchors.includes('advanced-model-options'));
  assert.ok(modelsPage.search_entry_ids.includes('models.custom_model_access'));
  assert.ok(modelsPage.required_dom.always.includes('settings-models-advanced'));
});

test('Billion Context is an explicit host preference applied after restart', () => {
  const modelsPage = readJson('contracts/app-settings-control-plane.json').experience_contract.page_contracts.models;
  assert.equal(modelsPage.billion_context.default_enabled, false);
  assert.equal(modelsPage.billion_context.visibility, 'collapsed_advanced_only');
  assert.equal(modelsPage.billion_context.owner, 'studio_codex_host');
  assert.equal(modelsPage.billion_context.applies_after, 'host_restart');
  assert.ok(modelsPage.surface_inventory.configuration.some(({ id }) => id === 'billion_context'));
});

test('Auto display contract keeps runtime resolution out of the static App profile', () => {
  const productProfile = structuredClone(readJson('contracts/app-product-profile.json'));
  const auto = productProfile.gui.home.codex_model_display_options.auto_option;
  const configuredDefault = productProfile.codex.auto_model_policy.configured_default;

  assert.equal('resolved_model' in auto, false);
  assert.equal('resolved_reasoning_effort' in auto, false);
  assert.equal(auto.catalog_unavailable_fallback_model, configuredDefault.model);
  assert.equal(auto.catalog_unavailable_fallback_reasoning_effort, configuredDefault.reasoning_effort);
});

test('Auto persistence contract defines reasoning override and stale fixed selection behavior', () => {
  const productProfile = structuredClone(readJson('contracts/app-product-profile.json'));
  const persistence = productProfile.codex.auto_model_policy.persistence_policy;

  assert.equal(persistence.state_encoding, 'auto_has_no_model_snapshot_fixed_has_model_and_reasoning');
  assert.equal(persistence.reasoning_override_from_auto, 'pin_current_resolved_model_and_exit_auto');
  assert.equal(
    persistence.stale_fixed_model,
    'preserve_fixed_selection_as_unavailable_until_user_restores_auto_or_selects_available_model',
  );
});

test('product profile rejects configured-default reasoning override drift', () => {
  const productProfile = structuredClone(readJson('contracts/app-product-profile.json'));
  const configuredDefault = productProfile.codex.auto_model_policy.configured_default;
  productProfile.codex.auto_model_policy.known_model_reasoning_effort_overrides[configuredDefault.model] = 'drift';

  assert.throws(() => validateProductProfile(
    productProfile,
    readJson('contracts/app-install-exposure-policy.json'),
  ));
});

test('product profile rejects persisting Auto as a resolved model snapshot', () => {
  const productProfile = structuredClone(readJson('contracts/app-product-profile.json'));
  productProfile.codex.auto_model_policy.persistence_policy.auto = 'persist_resolved_model';

  assert.throws(() => validateProductProfile(
    productProfile,
    readJson('contracts/app-install-exposure-policy.json'),
  ));
});

test('product profile rejects catalog fallback drift from the configured default', () => {
  const productProfile = structuredClone(readJson('contracts/app-product-profile.json'));
  productProfile.codex.auto_model_policy.catalog_unavailable_fallback.reasoning_effort = 'high';

  assert.throws(() => validateProductProfile(
    productProfile,
    readJson('contracts/app-install-exposure-policy.json'),
  ));
});

test('one configured default projects across every active App model-policy contract', () => {
  const bundle = readModelPolicyBundle();
  bundle.productProfile.codex.auto_model_policy.configured_default = {
    model: 'gpt-future',
    reasoning_effort: 'future-deep',
  };

  const projected = projectCodexModelPolicyContracts(bundle);
  const home = projected.productProfile.gui.home;
  const guidHome = projected.pageStateMatrix.pages.find(({ id }) => id === 'guid_home');

  assert.equal(projected.productProfile.codex.default_model, 'gpt-future');
  assert.equal(projected.productProfile.gui.home.codex_model_display_options.visible_models[0].id, 'gpt-future');
  assert.equal(projected.productProfile.codex.auto_model_policy.frontier_model_preference_order[0], 'gpt-future');
  assert.equal(projected.productProfile.default_session_profile.reasoning_effort, 'future-deep');
  assert.equal(home.codex_model_display_options.auto_option.catalog_unavailable_fallback_model, 'gpt-future');
  assert.equal(projected.guiProductContract.executor_policy.default_reasoning_effort, 'future-deep');
  assert.equal(projected.guiProductContract.pages.guid_home.model_status.display_value, 'GPT future');
  assert.ok(projected.guiProductContract.pages.guid_home.must_show.includes('Codex model selector defaults to GPT future'));
  assert.equal(guidHome.home_view_model.codex_default_model, 'gpt-future');
  assert.ok(guidHome.must_show.includes('Codex model selector defaulting to GPT future'));
  assert.equal(
    projected.productProfile.codex.auto_model_policy.known_model_reasoning_effort_overrides['gpt-future'],
    'future-deep',
  );
});

test('GUI contract rejects Codex selector button policies that allow an Auto prefix', () => {
  const guiContract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
  guiContract.executor_policy.model_display_options_policy.button_label_policy =
    'auto_or_fixed_model_compact_label_with_selected_reasoning_effort';

  assert.throws(() => validateAppGuiProductContract(
    guiContract,
    readJson('contracts/app-release-channel.json'),
    readJson('contracts/app-install-exposure-policy.json'),
  ));
});

test('Home authority rejects the retired four-starter limit and copy', () => {
  const guiContract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
  guiContract.home_layout.starter_limit = 4;
  guiContract.pages.guid_home.must_show = guiContract.pages.guid_home.must_show.map((entry: string) =>
    entry === 'all user-visible configured OPL starters in stable order without silent truncation'
      ? 'at most four lightweight OPL starters for Research/Grant/Presentation/Book'
      : entry,
  );
  assert.throws(() =>
    validateAppGuiProductContract(
      guiContract,
      readJson('contracts/app-release-channel.json'),
      readJson('contracts/app-install-exposure-policy.json'),
    ),
  );

  const matrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
  const guidHome = matrix.pages.find(({ id }: { id: string }) => id === 'guid_home');
  guidHome.home_view_model.home_layout.starter_limit = 4;
  guidHome.must_show = guidHome.must_show.map((entry: string) =>
    entry === 'all user-visible configured OPL starters in stable order without silent truncation'
      ? 'at most four lightweight OPL starters outside the composer'
      : entry,
  );
  assert.throws(() => validatePrimaryInteractionPages(matrix));
});
