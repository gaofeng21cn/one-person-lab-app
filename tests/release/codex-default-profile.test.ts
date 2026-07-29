import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validateAppGuiProductContract } from '../../scripts/validate-active-shell/gui-product-contract-validator.ts';
import { validatePrimaryInteractionPages } from '../../scripts/validate-active-shell/page-state-primary-interaction-validator.ts';
import { validateProductProfile } from '../../scripts/validate-active-shell/product-profile-validator.ts';
import {
  assertCanonicalThreadDirectoryTimeoutBoundarySources,
  assertCanonicalThreadAffinityConvergenceSources,
  assertCurrentGuidHomeSelectionSources,
  assertProjectlessGuidFileAccessSources,
  assertRuntimePageSourceBoundary,
} from '../../scripts/validate-active-shell/shell-ordinary-experience-validator.ts';
import { validateShellVisualTokenBindings } from '../../scripts/validate-active-shell/shell-implementation-validator.ts';
import {
  assertCodexModelPolicyProjection,
  projectCodexModelPolicyContracts,
} from '../../scripts/app-product-profile/codex-model-policy-projection.ts';

const readJson = (relativePath: string) => JSON.parse(fs.readFileSync(relativePath, 'utf8'));

const readModelPolicyBundle = () => ({
  productProfile: readJson('contracts/app-product-profile.json'),
  guiProductContract: readJson('contracts/app-gui-product-contract.json'),
  pageStateMatrix: readJson('contracts/app-page-state-matrix.json'),
});

test('Codex interaction surfaces stay aligned across the App profile and contracts', () => {
  assert.doesNotThrow(() => assertCodexModelPolicyProjection(readModelPolicyBundle()));
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  assert.doesNotThrow(() => validateProductProfile(
    readJson('contracts/app-product-profile.json'),
    installExposure,
  ));
  assert.doesNotThrow(() => validateAppGuiProductContract(
    readJson('contracts/app-gui-product-contract.json'),
    readJson('contracts/app-release-channel.json'),
    installExposure,
  ));
  assert.doesNotThrow(() => validatePrimaryInteractionPages(
    readJson('contracts/app-page-state-matrix.json'),
  ));

  const staleProfile = structuredClone(readJson('contracts/app-product-profile.json'));
  staleProfile.gui.home.codex_model_display_options.menu_structure.root_rows = [
    'reasoning_effort',
    'model',
    'reset_defaults',
  ];
  assert.throws(
    () => validateProductProfile(staleProfile, installExposure),
    /session configuration menu/,
  );

  const stalePerformanceRow = structuredClone(readJson('contracts/app-product-profile.json'));
  stalePerformanceRow.gui.home.codex_model_display_options.menu_structure.performance_tuning_row_allowed = true;
  assert.throws(
    () => validateProductProfile(stalePerformanceRow, installExposure),
    /session configuration menu/,
  );

  const staleGuiContract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
  staleGuiContract.executor_policy.model_display_options_policy.menu_structure.root_rows = [
    'model',
    'reasoning_effort',
    'runtime_speed',
    'reset_defaults',
  ];
  assert.throws(
    () => validateAppGuiProductContract(
      staleGuiContract,
      readJson('contracts/app-release-channel.json'),
      installExposure,
    ),
    /App GUI Codex model policy/,
  );

  const staleConversationFeedback = structuredClone(readJson('contracts/app-gui-product-contract.json'));
  staleConversationFeedback.pages.guid_home.conversation_feedback_policy.model_status =
    'reasoning is a primary menu and model is a secondary menu';
  assert.throws(
    () => validateAppGuiProductContract(
      staleConversationFeedback,
      readJson('contracts/app-release-channel.json'),
      installExposure,
    ),
    /shared session configuration menu/,
  );

  for (const menuStructure of [
    readJson('contracts/app-product-profile.json').gui.home.codex_model_display_options.menu_structure,
    readJson('contracts/app-gui-product-contract.json').executor_policy.model_display_options_policy.menu_structure,
  ]) {
    assert.doesNotMatch(JSON.stringify(menuStructure), /speed|速度/i);
  }

  const staleRailBinding = structuredClone(readJson('contracts/app-gui-product-contract.json'));
  staleRailBinding.interaction_baseline.visual_target.shell_token_bindings.navigation_rail.light_css_value = '#f4f4f2';
  assert.throws(
    () => validateAppGuiProductContract(
      staleRailBinding,
      readJson('contracts/app-release-channel.json'),
      installExposure,
    ),
    /navigation rail shell token binding/,
  );
});

test('active-shell visual token gate protects the rail and semantic text bridges', () => {
  const validSources = {
    layout: `<ArcoLayout.Sider
      className={classNames('layout-sider', { collapsed })}
    >
      <ArcoLayout.Header />`,
    productBaseline: `
      :root { --opl-sidebar-bg: #fcfcfc; --color-text-1: #202124; --text-primary: var(--color-text-1); }
      [data-theme='dark'] { --opl-sidebar-bg: #1b1c1e; }
      body { color: var(--text-primary); }
      .layout-sider.arco-layout-sider { background: var(--opl-sidebar-bg); }
    `,
    unoConfig: `
      't-primary': 'var(--text-primary)',
      't-tertiary': 'var(--color-text-3)',
    `,
  };
  assert.doesNotThrow(() => validateShellVisualTokenBindings(validSources));

  assert.throws(
    () => validateShellVisualTokenBindings({
      ...validSources,
      layout: validSources.layout.replace("'layout-sider'", "'!bg-2 layout-sider'"),
    }),
    /background utility/,
  );
  assert.throws(
    () => validateShellVisualTokenBindings({
      ...validSources,
      unoConfig: validSources.unoConfig.replace('var(--color-text-3)', 'var(--bg-6)'),
    }),
    /Uno semantic text colors/,
  );
  assert.throws(
    () => validateShellVisualTokenBindings({
      ...validSources,
      productBaseline: validSources.productBaseline.replace(
        '--text-primary: var(--color-text-1);',
        '--text-primary: #202124;',
      ),
    }),
    /--text-primary: var\(--color-text-1\)/,
  );
});

test('new OPL Gateway configs use the branded provider name without renaming existing providers', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const productProfile = readJson('contracts/app-product-profile.json');
  const guiContract = readJson('contracts/app-gui-product-contract.json');

  assert.equal(productProfile.default_session_profile.provider, 'gflab');
  assert.equal(productProfile.default_session_profile.provider_name, 'OPL Gateway');
  assert.equal(
    productProfile.default_session_profile.existing_provider_name_policy,
    'preserve_existing_provider_name_no_migration',
  );
  assert.equal(guiContract.first_launch_readiness_policy.default_provider, 'gflab');
  assert.equal(guiContract.first_launch_readiness_policy.default_provider_name, 'OPL Gateway');
  assert.equal(
    guiContract.first_launch_readiness_policy.existing_provider_name_policy,
    'preserve_existing_provider_name_no_migration',
  );

  const providerNameDrift = structuredClone(productProfile);
  providerNameDrift.default_session_profile.provider_name = 'gflab';
  assert.throws(
    () => validateProductProfile(providerNameDrift, installExposure),
    /provider name/,
  );

  const migrationDrift = structuredClone(productProfile);
  migrationDrift.default_session_profile.existing_provider_name_policy = 'rename_existing_provider';
  assert.throws(
    () => validateProductProfile(migrationDrift, installExposure),
    /existing provider name policy/,
  );
});

test('desktop App icon keeps the Codex-aligned macOS safe margin', () => {
  const guiContract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
  guiContract.theme_and_branding.desktop_app_icon_policy.macos_expected_alpha_bounds = '1024x1024+0+0';

  assert.throws(
    () => validateAppGuiProductContract(
      guiContract,
      readJson('contracts/app-release-channel.json'),
      readJson('contracts/app-install-exposure-policy.json'),
    ),
    /desktop application icon policy/,
  );
});

test('product profile has one presence-only Official Profile shared by Standard and Full', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const profile = structuredClone(readJson('contracts/app-product-profile.json'));
  assert.doesNotThrow(() => validateProductProfile(profile, installExposure));
  assert.deepEqual(profile.official_profile.apply_on, ['first_install', 'explicit_restore']);
  assert.deepEqual(profile.official_profile.never_apply_on, [
    'app_startup',
    'silent_package_update',
    'app_update',
  ]);
  assert.equal(profile.official_profile.distribution_forms.standard.offline_seed, false);
  assert.equal(profile.official_profile.distribution_forms.full.offline_seed, true);
  assert.equal(
    profile.official_profile.distribution_forms.standard.desired_roots_source,
    profile.official_profile.distribution_forms.full.desired_roots_source,
  );
  assert.equal(
    profile.official_profile.user_removal_policy.reinstall_before_explicit_restore_allowed,
    false,
  );
  assert.equal(
    profile.official_profile.package_currentness_policy.published_current_stable_authority,
    'package_owner_per_package_ghcr_latest_stable',
  );
  assert.equal(
    profile.official_profile.package_currentness_policy.installed_callable_authority,
    'framework_fresh_aggregation_of_configured_carrier_readback',
  );
  assert.equal(profile.official_profile.package_currentness_policy.app_carrier_authority, false);
  assert.equal(profile.official_profile.package_currentness_policy.app_release_authority, false);
  assert.equal(
    profile.official_profile.package_currentness_policy.shared_release_set_ordinary_update_authority,
    false,
  );
  assert.equal(profile.official_profile.additional_official_profiles_allowed, false);
  assert.equal(profile.official_profile.user_composed_profiles_allowed, true);
  assert.equal('starter_package_ids' in profile.gui.agent_package_registry, false);
  assert.equal('resolver_currentness_authority' in profile.gui.agent_package_registry, false);
  assert.equal('installed_truth_authority' in profile.gui.agent_package_registry, false);

  profile.gui.agent_package_registry.manifest_lock_receipt_parser_allowed = true;
  assert.throws(
    () => validateProductProfile(profile, installExposure),
    /without private metadata or lifecycle parsers/,
  );

  const syntheticOfficialRoot = structuredClone(readJson('contracts/app-product-profile.json'));
  syntheticOfficialRoot.official_profile.desired_root_package_ids.push('synthetic-package');
  assert.doesNotThrow(() => validateProductProfile(syntheticOfficialRoot, installExposure));

  const missingOfficialRoot = structuredClone(readJson('contracts/app-product-profile.json'));
  missingOfficialRoot.official_profile.desired_root_package_ids = [];
  assert.throws(
    () => validateProductProfile(missingOfficialRoot, installExposure),
    /Official Profile desired roots/,
  );

  const duplicateOfficialRoot = structuredClone(readJson('contracts/app-product-profile.json'));
  duplicateOfficialRoot.official_profile.desired_root_package_ids.push(
    duplicateOfficialRoot.official_profile.desired_root_package_ids[0],
  );
  assert.throws(
    () => validateProductProfile(duplicateOfficialRoot, installExposure),
    /Official Profile desired roots must be unique/,
  );

  for (const forbiddenApplyOn of ['app_startup', 'silent_package_update', 'app_update']) {
    const automaticReinstall = structuredClone(readJson('contracts/app-product-profile.json'));
    automaticReinstall.official_profile.apply_on.push(forbiddenApplyOn);
    assert.throws(
      () => validateProductProfile(automaticReinstall, installExposure),
      /Official Profile apply_on/,
    );
  }

  const fullAddsRoot = structuredClone(readJson('contracts/app-product-profile.json'));
  fullAddsRoot.official_profile.distribution_forms.full.desired_roots_source =
    'official_profile.full_desired_root_package_ids';
  assert.throws(
    () => validateProductProfile(fullAddsRoot, installExposure),
    /shared by Standard and Full/,
  );

  const versionGate = structuredClone(readJson('contracts/app-product-profile.json'));
  versionGate.official_profile.composition_policy.composition_gate = 'version_range_and_identity';
  assert.throws(
    () => validateProductProfile(versionGate, installExposure),
    /presence-only/,
  );
});

test('Agent catalog presentation rejects raw roles, hardcoded hierarchy, and duplicate rows', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  for (const mutate of [
    (profile: any) => {
      profile.gui.agent_package_registry.catalog_presentation_policy.raw_package_role_visible = true;
    },
    (profile: any) => {
      profile.gui.agent_package_registry.catalog_presentation_policy.package_role_labels_i18n.standard_agent['zh-CN'] =
        'standard_agent';
    },
    (profile: any) => {
      profile.gui.agent_package_registry.catalog_presentation_policy.dependency_hierarchy.hardcoded_package_relationships_allowed =
        true;
    },
    (profile: any) => {
      profile.gui.agent_package_registry.catalog_presentation_policy.dependency_hierarchy.duplicate_rows_allowed = true;
    },
    (profile: any) => {
      profile.gui.agent_package_registry.catalog_presentation_policy.developer_controls_disclosure.default_state =
        'expanded';
    },
  ]) {
    const profile = structuredClone(readJson('contracts/app-product-profile.json'));
    mutate(profile);
    assert.throws(
      () => validateProductProfile(profile, installExposure),
      /localized product ordering and projected dependency hierarchy/,
    );
  }
});

test('Home capability palette is dynamic, localized, shortcut-independent, and agent-Skill deduplicated', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const profile = structuredClone(readJson('contracts/app-product-profile.json'));
  const policy = profile.gui.ordinary_capability_selector_policy;
  assert.equal('palette_required_agent_package_ids' in policy, false);
  assert.equal(
    policy.palette_agent_catalog_source_ref,
    'app_state.agent_packages.directory.entries[package_role=standard_agent]',
  );
  assert.equal(
    policy.palette_agent_status_source_ref,
    'app_state.agent_packages.status_index.packages[]',
  );
  assert.equal(policy.palette_unknown_standard_agent_policy, 'include_without_app_package_id_branch');
  assert.deepStrictEqual(policy.palette_agent_group_label_i18n, {
    'zh-CN': '专业智能体',
    'en-US': 'Professional agents',
  });
  assert.equal(
    policy.palette_home_shortcut_independence_policy,
    'complete_professional_agent_catalog_independent_of_home_shortcut_visibility_and_order',
  );
  assert.equal(
    policy.agent_owned_skill_deduplication_policy,
    'exclude_rendered_professional_agent_required_skill_ids_from_home_new_session_standalone_skills',
  );
  assert.equal(policy.authority, 'owner_or_carrier_skill_projection_and_mcp_negative_filter');
  assert.equal(
    policy.conversation_loaded_skill_display_policy,
    'preserve_owner_or_carrier_projected_loaded_skills',
  );
  assert.equal('forbidden_skill_examples' in policy, false);
  assert.equal(policy.visible_mcp_server_ids, undefined);
  assert.equal(
    policy.mcp_menu_policy,
    'preserve_configured_user_and_third_party_servers_except_explicit_forbidden_matchers',
  );
  assert.doesNotThrow(() => validateProductProfile(profile, installExposure));

  profile.gui.home.home_agent_shortcuts = [{ package_id: 'fixed-package-id' }];
  assert.throws(() => validateProductProfile(profile, installExposure), /App-owned Home shortcut list/);

  const catalogDrift = structuredClone(readJson('contracts/app-product-profile.json'));
  catalogDrift.gui.ordinary_capability_selector_policy.palette_required_agent_package_ids = ['fixed-package-id'];
  assert.throws(() => validateProductProfile(catalogDrift, installExposure), /ordinary selector/);

  const mcpAllowlistRegression = structuredClone(readJson('contracts/app-product-profile.json'));
  mcpAllowlistRegression.gui.ordinary_capability_selector_policy.visible_mcp_server_ids = [];
  mcpAllowlistRegression.gui.ordinary_capability_selector_policy.mcp_menu_policy =
    'empty_until_app_explicitly_whitelists_opl_mcp_servers';
  assert.throws(
    () => validateProductProfile(mcpAllowlistRegression, installExposure),
    /MCP negative filter/,
  );
});

test('Package presentation stays owner-projected without App-owned starter metadata', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const completeProfile = structuredClone(readJson('contracts/app-product-profile.json'));
  assert.equal('professional_agent_packages' in completeProfile.gui, false);
  assert.equal('professional_agent_packages_metadata_policy' in completeProfile.gui, false);
  assert.equal('starter_package_metadata' in completeProfile.gui.agent_package_registry, false);
  assert.equal('first_party_manifest_fixture_dir' in completeProfile.gui.agent_package_registry, false);
  assert.equal(completeProfile.gui.agent_package_registry.presentation_source, 'app_state.agent_packages.directory.entries');
  const dependencyCopyDrift = structuredClone(completeProfile);
  dependencyCopyDrift.gui.agent_package_registry.starter_package_metadata = [{ package_id: 'fixed-package-id' }];
  assert.throws(
    () => validateProductProfile(dependencyCopyDrift, installExposure),
    /must not restore private Package consumer field starter_package_metadata/,
  );
});

test('Guid Home page state admits dynamic Agent identities while retaining directory, preference, action, and route safety', () => {
  const matrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
  const guidHome = matrix.pages.find((page: any) => page.id === 'guid_home');
  const home = guidHome.home_view_model;

  assert.equal('default_assistants' in home, false);
  assert.equal('default_assistant_purpose_labels' in home, false);
  assert.equal('home_purpose_entries' in home, false);
  const agentPackageGroup = matrix.pages
    .find((page: any) => page.id === 'ordinary_conversation').conversation_view_model
    .unified_context_menu.groups.find((group: any) => group.id === 'agent_packages');
  assert.deepStrictEqual(
    {
      home_membership_source_ref: home.home_agent_package_membership_source_ref,
      home_preference_source_ref: home.home_layout.shortcut_preference_source_ref,
      home_visibility_policy: home.home_layout.starter_visibility_policy,
      home_order_policy: home.home_layout.starter_order_policy,
      source_ref: agentPackageGroup.source_ref,
      status_source_ref: agentPackageGroup.status_source_ref,
      catalog_order_policy: agentPackageGroup.catalog_order_policy,
      action_policy: agentPackageGroup.action_policy,
      unknown_standard_agent_policy: agentPackageGroup.unknown_standard_agent_policy,
    },
    {
      home_membership_source_ref:
        'app_state.agent_packages.directory.entries[package_role=standard_agent]',
      home_preference_source_ref:
        'app_state.agent_packages.status_index.home_shortcut_preferences[]',
      home_visibility_policy:
        'standard_agent_directory_membership_with_default_or_user_visible_shortcuts_independent_of_installed_state',
      home_order_policy: 'home_shortcut_preferences_sort_order_then_localized_display_name',
      source_ref: 'app_state.agent_packages.directory.entries[package_role=standard_agent]',
      status_source_ref: 'app_state.agent_packages.status_index.packages[]',
      catalog_order_policy: 'home_shortcut_preferences_sort_order_then_localized_display_name',
      action_policy: 'render_only_directory_available_actions_and_recommended_action_ref',
      unknown_standard_agent_policy: 'include_without_app_package_id_branch',
    },
  );
  assert.doesNotThrow(() => validatePrimaryInteractionPages(matrix));

  for (const mutate of [
    (value: any) => {
      value.pages.find((page: any) => page.id === 'guid_home').home_view_model
        .professional_agent_package_membership_source_ref = 'app_fixed_package_ids';
    },
    (value: any) => {
      value.pages.find((page: any) => page.id === 'guid_home').home_view_model
        .unknown_standard_agent_policy = 'reject_unknown_package_ids';
    },
    (value: any) => {
      value.pages.find((page: any) => page.id === 'guid_home').home_view_model.home_layout
        .starter_order_policy = 'app_fixed_shortcut_order';
    },
    (value: any) => {
      value.pages.find((page: any) => page.id === 'guid_home').home_view_model
        .route_receipt_required_fields = ['route_kind', 'executor'];
    },
    (value: any) => {
      value.pages.find((page: any) => page.id === 'ordinary_conversation').conversation_view_model
        .unified_context_menu.groups.find((group: any) => group.id === 'agent_packages')
        .action_policy = 'app_allowlisted_action_ids';
    },
    (value: any) => {
      value.pages.find((page: any) => page.id === 'guid_home').home_view_model
        .default_assistants = ['fixed-package-id'];
    },
  ]) {
    const drift = structuredClone(matrix);
    mutate(drift);
    assert.throws(() => validatePrimaryInteractionPages(drift));
  }

  const nonConfigurableShortcut = structuredClone(matrix);
  nonConfigurableShortcut.pages.find((page: any) => page.id === 'guid_home').home_view_model
    .home_agent_shortcuts = [{ package_id: 'fixed-package-id' }];
  assert.throws(
    () => validatePrimaryInteractionPages(nonConfigurableShortcut),
    /private Agent route field home_agent_shortcuts/,
  );
});

test('active AionUI keeps Runtime status in primary navigation without expanding Native or release gates', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const profile = structuredClone(readJson('contracts/app-product-profile.json'));
  const navigation = profile.gui.home.home_layout.active_aionui_primary_navigation;
  assert.deepStrictEqual(navigation.ordered_entry_ids, ['new_task', 'runtime', 'scheduled_tasks', 'archived']);
  assert.equal(navigation.runtime_entry.label_i18n['zh-CN'], '运行状态');
  assert.equal(navigation.runtime_entry.route, '/runtime');
  assert.equal(navigation.runtime_entry.keyboard_reachable, true);
  assert.equal(navigation.runtime_entry.home_content_effect, 'navigation_only_no_dashboard');

  profile.gui.home.home_layout.active_aionui_primary_navigation.ordered_entry_ids = [
    'new_task',
    'scheduled_tasks',
    'archived',
  ];
  assert.throws(
    () => validateProductProfile(profile, installExposure),
    /Runtime status in the active AionUI primary navigation/,
  );

  const matrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
  matrix.pages.find((page: any) => page.id === 'guid_home').home_view_model.home_layout
    .active_aionui_primary_navigation.runtime_entry.keyboard_reachable = false;
  assert.throws(() => validatePrimaryInteractionPages(matrix), /Guid home page layout/);
});

test('product profile rejects pre-Codex-baseline interaction states', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  for (const mutate of [
    (profile: any) => { profile.gui.home.permission_mode_selector_visible = false; },
    (profile: any) => { profile.gui.home.conversation_permission_mode_selector_visible = false; },
    (profile: any) => { profile.gui.home.home_layout.workspace_session_rail_default_state = 'collapsed'; },
    (profile: any) => { profile.gui.ordinary_conversation.entry_source = 'home_purpose_entry_or_new_conversation'; },
    (profile: any) => { profile.gui.ordinary_conversation.composer_position = 'pinned_bottom'; },
    (profile: any) => { profile.gui.ordinary_conversation.permission_mode_selector_visible = false; },
    (profile: any) => { profile.gui.right_context_inspector.tabs = []; },
  ]) {
    const profile = structuredClone(readJson('contracts/app-product-profile.json'));
    mutate(profile);
    assert.throws(() => validateProductProfile(profile, installExposure));
  }
});

test('Agent selection is explicit before first send and existing-conversation rebind stays disabled', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const productProfile = readJson('contracts/app-product-profile.json');
  const admissionPolicy = productProfile.gui.ordinary_capability_selector_policy.agent_reference_admission_policy;
  assert.equal(admissionPolicy.existing_conversation_rebinding_allowed, false);
  assert.equal(
    admissionPolicy.at_mention_semantics,
    'explicit_new_session_agent_selection_before_first_send_plain_text_references_remain_prompt_context',
  );
  assert.equal('existing_conversation_rebinding_contract' in admissionPolicy, false);

  const invalidProductProfile = structuredClone(productProfile);
  invalidProductProfile.gui.ordinary_capability_selector_policy.agent_reference_admission_policy
    .existing_conversation_rebinding_allowed = true;
  assert.throws(
    () => validateProductProfile(invalidProductProfile, installExposure),
    /new-session-only explicit Agent selection/,
  );

  const guiContract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
  guiContract.ordinary_capability_selector_policy.agent_reference_admission_policy
    .existing_conversation_rebinding_contract = { transport: 'metadata_patch' };
  assert.throws(
    () => validateAppGuiProductContract(
      guiContract,
      readJson('contracts/app-release-channel.json'),
      installExposure,
    ),
    /new-session-only explicit Agent selection/,
  );
});

test('product profile rejects the superseded quiet Settings visual policy', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  for (const mutate of [
    (profile: any) => { profile.settings.control_plane.experience_contract.visual_system.style = 'codex_app_quiet_workbench'; },
    (profile: any) => { profile.settings.control_plane.experience_contract.visual_system.card_policy = 'few_cards_only_for_summary_or_repeated_entities'; },
  ]) {
    const profile = structuredClone(readJson('contracts/app-product-profile.json'));
    mutate(profile);
    assert.throws(() => validateProductProfile(profile, installExposure));
  }
});

test('active-shell source gate requires Home starters and Capabilities routing instead of retired selectors', () => {
  const currentSources = {
    guidPage: [
      'HomeStarters',
      'activeCapabilityId={activeShortcut?.package_id}',
      'activeShortcutId={activeShortcut?.shortcut_id}',
      "const { appState } = useOplAppState('fast')",
      'handleSelectShortcut(assistantId)',
      'onSelect={(assistantId) =>',
      'onClear={() =>',
      'sameActiveShortcut',
      'setActiveShortcut((current) => {',
      'const next = resolveOplActiveShortcut(navState.selectedCapabilityId, appState)',
      'return sameActiveShortcut(current, next) ? current : next',
      'agentSelection.setSelectedAgentKey(agentSelection.defaultAgentKey)',
    ].join('\n'),
    guidInputCard: [
      'const DESKTOP_TEXTAREA_AUTO_SIZE = { minRows: 1, maxRows: 12 };',
      '${styles.guidInputInner} opl-codex-composer',
      "isInputActive ? 'opl-codex-composer--focused' : ''",
      "fileDraggingActive ? 'opl-codex-composer--dragging' : ''",
      "data-composer-palette-boundary='true'",
      'activeBorderColor',
      'inactiveBorderColor',
      '!pl-5px',
    ].join('\n'),
    homeStarters: [
      "data-testid='opl-home-starters'",
      'assistant.opl_package_id === activeCapabilityId && assistant.opl_shortcut_id === activeShortcutId',
      'aria-pressed={active}',
      'data-opl-active={String(active)}',
      'resolveOplPackageLaunchGate(appState, assistant.opl_package_id)',
      "const launchReady = launchGate.state !== 'package_unavailable'",
      'data-opl-launch-ready={String(launchReady)}',
      'active && styles.homeStarterActive',
      'starterIcon()',
      'active && onClear ? onClear() : onSelect(assistant.opl_shortcut_id)',
    ].join('\n'),
    guidStyles: [
      '.guidComposerDock',
      'width: min(100%, 736px);',
      '.guidInputInner',
      'min-height: 98px;',
      'border-radius: 22px;',
      '.actionRow',
      'align-items: center;',
      'width: 100%;',
      '.workspaceContextBar',
      'height: 52px;',
      'margin: 0 12px -13px;',
      'padding: 0 12px;',
      '.homeStarterGrid',
      'display: flex;',
      'flex-wrap: wrap;',
      'justify-content: center;',
      'width: auto !important;',
      'height: 34px !important;',
    ].join('\n'),
    capabilitiesPage: [
      'useCustomAgentsLoader',
      "navigate('/guid', {",
      'state: { selectedCapabilityId: capability.id }',
    ].join('\n'),
  };
  assert.doesNotThrow(() => assertCurrentGuidHomeSelectionSources(currentSources));
  for (const [current, legacy] of [
    [
      [
        'setActiveShortcut((current) => {',
        'const next = resolveOplActiveShortcut(navState.selectedCapabilityId, appState)',
        'return sameActiveShortcut(current, next) ? current : next',
      ].join('\n'),
      'setActiveShortcut(resolveOplActiveShortcut(navState.selectedCapabilityId, appState))',
    ],
    ['activeShortcutId={activeShortcut?.shortcut_id}', 'activeShortcutId={activeShortcut?.package_id}'],
    ["const { appState } = useOplAppState('fast')", 'const appState = undefined'],
  ]) {
    assert.throws(() =>
      assertCurrentGuidHomeSelectionSources({
        ...currentSources,
        guidPage: currentSources.guidPage.replace(current, legacy),
      }),
    );
  }
  for (const [current, legacy] of [
    [
      'assistant.opl_package_id === activeCapabilityId && assistant.opl_shortcut_id === activeShortcutId',
      'assistant.id === activeCapabilityId',
    ],
    ['resolveOplPackageLaunchGate(appState, assistant.opl_package_id)', 'resolveOplPackageLaunchGate(appState, assistant.id)'],
    ['starterIcon()', 'starterIcon(assistant.opl_package_id)'],
    ['starterIcon()', 'starterIcon(assistant.id)'],
    [
      'active && onClear ? onClear() : onSelect(assistant.opl_shortcut_id)',
      'active && onClear ? onClear() : onSelect(assistant.id)',
    ],
  ]) {
    assert.throws(() =>
      assertCurrentGuidHomeSelectionSources({
        ...currentSources,
        homeStarters: currentSources.homeStarters.replace(current, legacy),
      }),
    );
  }
  assert.throws(() =>
    assertCurrentGuidHomeSelectionSources({
      ...currentSources,
      guidStyles: currentSources.guidStyles.replace('align-items: center;', 'align-items: flex-end;'),
    }),
    /must include align-items: center/,
  );
  assert.throws(() =>
    assertCurrentGuidHomeSelectionSources({
      ...currentSources,
      guidPage: `${currentSources.guidPage}\nAssistantSelectionArea\nMentionSelectorBadge`,
    }),
  );
  assert.throws(() =>
    assertCurrentGuidHomeSelectionSources({
      ...currentSources,
      homeStarters: `${currentSources.homeStarters}\n<CheckOne theme='outline' />`,
    }),
  );
  assert.throws(
    () =>
      assertCurrentGuidHomeSelectionSources({
        ...currentSources,
        homeStarters: currentSources.homeStarters.replace(
          'active && styles.homeStarterActive',
          "active ? '!border-primary-5 !bg-primary-1 !text-primary-6' : ''",
        ),
      }),
    /must include active && styles\.homeStarterActive/,
  );
  assert.throws(() =>
    assertCurrentGuidHomeSelectionSources({
      ...currentSources,
      homeStarters: `${currentSources.homeStarters}\nfaChevronRight`,
    }),
  );
  assert.throws(() =>
    assertCurrentGuidHomeSelectionSources({
      ...currentSources,
      guidStyles: `${currentSources.guidStyles}\ngrid-template-columns: repeat(4, minmax(0, 1fr));`,
    }),
  );
  assert.throws(() =>
    assertCurrentGuidHomeSelectionSources({
      ...currentSources,
      guidStyles: currentSources.guidStyles.replace('width: min(100%, 736px);', 'width: min(100%, 680px);'),
    }),
  );
  assert.throws(() =>
    assertCurrentGuidHomeSelectionSources({
      ...currentSources,
      guidInputCard: 'const DESKTOP_TEXTAREA_AUTO_SIZE = { minRows: 2, maxRows: 20 };',
    }),
  );
  for (const marker of [
    '${styles.guidInputInner} opl-codex-composer',
    "isInputActive ? 'opl-codex-composer--focused' : ''",
    "fileDraggingActive ? 'opl-codex-composer--dragging' : ''",
    "data-composer-palette-boundary='true'",
  ]) {
    assert.throws(
      () =>
        assertCurrentGuidHomeSelectionSources({
          ...currentSources,
          guidInputCard: currentSources.guidInputCard.replace(marker, ''),
        }),
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
});

test('active-shell source gate preserves explicit local file inputs independently of workspace readiness', () => {
  const currentSource = [
    'const workspaceAccessBlocked = coreReadiness.known && !coreReadiness.workspaceRootReady;',
    'workspaceAccessDisabled={workspaceAccessBlocked}',
    'const guidInput = useGuidInput({',
    'locationState: navState',
    'onFilesUploaded={guidInput.handleFilesUploaded}',
    'onPaste={guidInput.onPaste}',
    'dragHandlers={guidInput.dragHandlers}',
    "name: 'open'",
  ].join('\n');

  assert.doesNotThrow(() => assertProjectlessGuidFileAccessSources(currentSource));
  for (const legacyWorkspaceGate of [
    'fileContextEnabled={!fileAccessBlocked && Boolean(guidInput.dir)}',
    'fileAccessDisabled={fileAccessBlocked || !guidInput.dir}',
    'fileAccessEnabled={!fileAccessBlocked && Boolean(guidInput.dir)}',
    'const fileAccessBlocked = coreReadiness.known && !coreReadiness.workspaceRootReady;',
    'fileAccessDisabled={coreReadiness.known && !coreReadiness.workspaceRootReady}',
    'fileAccessEnabled={!coreReadiness.known || coreReadiness.workspaceRootReady}',
    'fileAccessEnabled: !workspaceAccessBlocked',
    'fileAccessDisabled={workspaceAccessBlocked}',
    'fileAccessEnabled={!workspaceAccessBlocked}',
    [
      'const hasWorkspace = Boolean(guidInput.dir);',
      'const canUseFiles = hasWorkspace;',
      'fileAccessEnabled={canUseFiles}',
    ].join('\n'),
  ]) {
    assert.throws(() => assertProjectlessGuidFileAccessSources(`${currentSource}\n${legacyWorkspaceGate}`));
  }
});

test('active-shell source gate keeps canonical cwd transport separate from sidebar affinity', () => {
  const canonicalProjectionMarkers = [
    'const hasCanonicalProjectWorkspace = Boolean(thread.projectId.trim() && thread.workspace.trim())',
    'workspace: thread.workspace',
    'custom_workspace: hasCanonicalProjectWorkspace',
  ];
  const focusedTestNames = [
    'keeps canonical adoption successful when the rebuildable local projection update fails',
    'keeps canonical adoption successful when a stub projection cannot be materialized',
    'requires an exact canonical cwd readback instead of path-normalized equivalence',
    'rejects malformed canonical cwd instead of treating it as projectless',
    'rejects a malformed cwd returned by canonical thread read',
  ];
  const conversationListSync = canonicalProjectionMarkers.join('\n');
  const canonicalThreadLifecycle = canonicalProjectionMarkers.join('\n');
  const focusedTests = focusedTestNames.join('\n');
  const threadAdapter = [
    'function recordedCwd(value: unknown): string',
    "if (value === undefined || value === null) return ''",
    "if (typeof value !== 'string') throw new Error('Invalid Codex app-server thread cwd.')",
    'workspace: recordedCwd(raw.cwd)',
  ].join('\n');

  assert.doesNotThrow(() =>
    assertCanonicalThreadAffinityConvergenceSources({
      canonicalThreadLifecycle,
      conversationListSync,
      focusedTests,
      threadAdapter,
    }),
  );

  for (const requiredMarker of canonicalProjectionMarkers) {
    assert.throws(() =>
      assertCanonicalThreadAffinityConvergenceSources({
        canonicalThreadLifecycle,
        conversationListSync: conversationListSync.replace(requiredMarker, ''),
        focusedTests,
        threadAdapter,
      }),
    );
    assert.throws(() =>
      assertCanonicalThreadAffinityConvergenceSources({
        canonicalThreadLifecycle: canonicalThreadLifecycle.replace(requiredMarker, ''),
        conversationListSync,
        focusedTests,
        threadAdapter,
      }),
    );
  }

  for (const cachedOverride of [
    'cached?.extra.custom_workspace === false ? false : hasCanonicalProjectWorkspace',
    'cached?.extra.custom_workspace === true',
    'workspace: projectAffinityWorkspace',
    'custom_workspace: customWorkspace',
  ]) {
    assert.throws(() =>
      assertCanonicalThreadAffinityConvergenceSources({
        canonicalThreadLifecycle,
        conversationListSync: `${conversationListSync}\n${cachedOverride}`,
        focusedTests,
        threadAdapter,
      }),
    );
    assert.throws(() =>
      assertCanonicalThreadAffinityConvergenceSources({
        canonicalThreadLifecycle: `${canonicalThreadLifecycle}\n${cachedOverride}`,
        conversationListSync,
        focusedTests,
        threadAdapter,
      }),
    );
  }

  for (const focusedTestName of focusedTestNames) {
    assert.throws(() =>
      assertCanonicalThreadAffinityConvergenceSources({
        canonicalThreadLifecycle,
        conversationListSync,
        focusedTests: focusedTests.replace(focusedTestName, ''),
        threadAdapter,
      }),
    );
  }

  for (const invalidThreadAdapter of [
    threadAdapter.replace("if (typeof value !== 'string') throw new Error('Invalid Codex app-server thread cwd.')", ''),
    `${threadAdapter}\nworkspace: optionalString(raw.cwd) ?? ''`,
  ]) {
    assert.throws(() =>
      assertCanonicalThreadAffinityConvergenceSources({
        canonicalThreadLifecycle,
        conversationListSync,
        focusedTests,
        threadAdapter: invalidThreadAdapter,
      }),
    );
  }
});

test('recorded cwd compatibility does not create sidebar project affinity', () => {
  const contract = readJson('contracts/app-gui-product-contract.json');
  const threadDirectory = contract.interaction_baseline.navigation_rail.thread_directory_policy;
  assert.equal(
    threadDirectory.directory_group_policy.legacy_missing_marker_policy,
    'existing_recorded_thread_cwd_blocks_reassignment_without_sidebar_project_affinity_or_local_affinity_hydration',
  );
  const runtimeBridge = readJson('contracts/app-runtime-bridge.json');
  assert.equal(
    runtimeBridge.canonical_conversation_continuity_policy.directory_group_policy.legacy_missing_marker_policy,
    threadDirectory.directory_group_policy.legacy_missing_marker_policy,
  );
  assert.equal(
    contract.interaction_baseline.conversation_scope.session_workspace_model.project_affinity_source,
    'explicit_project_id_projection',
  );

  const pageStateMatrix = readJson('contracts/app-page-state-matrix.json');
  assert.doesNotMatch(JSON.stringify(pageStateMatrix), /directory groups derived from canonical session cwd/);
  assert.match(JSON.stringify(pageStateMatrix), /directory groups derive only from explicit projectId affinity/);

  const sourceGate = fs.readFileSync(
    'scripts/validate-active-shell/shell-ordinary-experience-validator.ts',
    'utf8',
  );
  for (const cwdDerivedAffinityMarker of [
    'rebuilds a stale projectless cache row from the canonical recorded cwd',
    'replaces stale bound shell affinity with the canonical recorded cwd',
    'hydrates a legacy missing affinity marker from the canonical recorded cwd',
  ]) {
    assert.doesNotMatch(sourceGate, new RegExp(cwdDerivedAffinityMarker));
  }
});

test('active-shell source gate keeps canonical thread directory queries state-db-only', () => {
  const threadAdapter = [
    "await this.rpc.request('thread/list', {",
    'cursor,',
    'archived,',
    'useStateDbOnly: true,',
    '...(workspace ? { cwd: workspace } : {}),',
    '});',
  ].join('\n');
  const focusedTests = [
    'lists active and archived threads through bounded app-server pagination',
    'useStateDbOnly: true',
    "expect(request.mock.calls[0]?.[1]).not.toHaveProperty('sourceKinds')",
  ].join('\n');

  assert.doesNotThrow(() =>
    assertCanonicalThreadDirectoryTimeoutBoundarySources({
      focusedTests,
      threadAdapter,
    }),
  );

  for (const requiredMarker of [
    "await this.rpc.request('thread/list'",
    'archived',
    'useStateDbOnly: true',
  ]) {
    assert.throws(() =>
      assertCanonicalThreadDirectoryTimeoutBoundarySources({
        focusedTests,
        threadAdapter: threadAdapter.replace(requiredMarker, ''),
      }),
    );
  }

  for (const forbiddenMarker of [
    'sourceKinds: renamedKinds,',
    'sourceKinds,',
    '"sourceKinds": [\'cli\'],',
    '...legacyOptions,',
    "...{ sourceKinds: ['cli'] },",
    "...(workspace ? { cwd: workspace } : { sourceKinds: ['cli'] }),",
    '...{ archived: false },',
    '...{ useStateDbOnly: false },',
    "...{ ['source' + 'Kinds']: ['cli'] },",
    "...{ ['arch' + 'ived']: false },",
    "...{ ['useStateDb' + 'Only']: false },",
  ]) {
    assert.throws(() =>
      assertCanonicalThreadDirectoryTimeoutBoundarySources({
        focusedTests,
        threadAdapter: threadAdapter.replace('});', `${forbiddenMarker}\n});`),
      }),
    );
  }

  assert.throws(() =>
    assertCanonicalThreadDirectoryTimeoutBoundarySources({
      focusedTests,
      threadAdapter: `${threadAdapter.replace('useStateDbOnly: true,', '')}\nconst unrelated = { useStateDbOnly: true };`,
    }),
  );
  assert.throws(() =>
    assertCanonicalThreadDirectoryTimeoutBoundarySources({
      focusedTests,
      threadAdapter: threadAdapter.replace('useStateDbOnly: true', 'useStateDbOnly: false'),
    }),
  );
  for (const constantArchivedSelector of ['archived: false', 'archived: true']) {
    assert.throws(() =>
      assertCanonicalThreadDirectoryTimeoutBoundarySources({
        focusedTests,
        threadAdapter: threadAdapter.replace('archived,', `${constantArchivedSelector},`),
      }),
    );
  }
  for (const duplicatedGuardedOption of ['archived: false', 'useStateDbOnly: false']) {
    assert.throws(() =>
      assertCanonicalThreadDirectoryTimeoutBoundarySources({
        focusedTests,
        threadAdapter: threadAdapter.replace('});', `${duplicatedGuardedOption},\n});`),
      }),
    );
  }
  assert.doesNotThrow(() =>
    assertCanonicalThreadDirectoryTimeoutBoundarySources({
      focusedTests,
      threadAdapter: threadAdapter.replace('archived,', 'archived: archived,'),
    }),
  );

  for (const requiredTestMarker of [
    'lists active and archived threads through bounded app-server pagination',
    'useStateDbOnly: true',
    "not.toHaveProperty('sourceKinds')",
  ]) {
    assert.throws(() =>
      assertCanonicalThreadDirectoryTimeoutBoundarySources({
        focusedTests: focusedTests.replace(requiredTestMarker, ''),
        threadAdapter,
      }),
    );
  }
});

test('conversation history and managed scratch keep identity, cwd, and Project affinity distinct', () => {
  const guiProductContract = readJson('contracts/app-gui-product-contract.json');
  const pageStateMatrix = readJson('contracts/app-page-state-matrix.json');
  const threadDirectoryPolicy = guiProductContract.interaction_baseline.navigation_rail.thread_directory_policy;
  const surfaces = threadDirectoryPolicy.conversation_history_surfaces;
  const guiWorkspaceModel = guiProductContract.interaction_baseline.conversation_scope.session_workspace_model;
  const profileWorkspaceModel = readJson('contracts/app-product-profile.json')
    .gui.ordinary_conversation.session_workspace_model;
  const home = pageStateMatrix.pages.find((page: { id: string }) => page.id === 'guid_home');
  const ordinaryConversation = pageStateMatrix.pages.find(
    (page: { id: string }) => page.id === 'ordinary_conversation',
  );

  assert.equal(
    surfaces.default_rail.membership,
    'canonical_unarchived_thread_directory',
  );
  assert.equal(surfaces.default_rail.authority, 'codex_app_server_thread_list_archived_false');
  assert.equal(surfaces.default_rail.thread_classification_required, false);
  assert.equal(
    surfaces.default_rail.archived_false_role,
    'directory_membership_only_never_running_status',
  );
  for (const unsupportedClassificationField of [
    'thread_classification_authority',
    'classification_values',
    'unclassified_codex_policy',
  ]) {
    assert.equal(unsupportedClassificationField in surfaces.default_rail, false);
  }
  assert.equal('unclassified_codex_label' in surfaces.all_search, false);
  assert.equal(surfaces.running_now.authority, 'same_codex_desktop_runtime_task_status');
  assert.equal(surfaces.archived.membership, 'canonical_archived_thread_directory');
  assert.equal(surfaces.all_search.may_replace_default_rail, false);
  assert.equal(
    surfaces.acceptance_comparison,
    'same_instant_same_authority_exact_thread_id_set_and_archived_bit',
  );
  assert.equal(surfaces.fixed_count_assertion_allowed, false);
  assert.deepEqual(surfaces.project_affinity_presentation, {
    recorded_cwd_role: 'canonical_runtime_workspace_preserved_independently_of_sidebar_project_affinity',
    project_affinity_role: 'explicit_project_id_projection_never_inferred_from_recorded_cwd',
    managed_projectless_workspace_root: 'user_documents_codex_subtree',
    managed_root_grouping_policy:
      'preserve_runtime_cwd_and_render_unbound_without_leaf_directory_project_groups',
    projectless_adoption_eligibility:
      'project_id_absent_renders_unbound_but_pre_successor_adoption_remains_conservatively_guarded_by_custom_workspace_and_recorded_cwd_including_managed_root',
  });
  assert.equal(
    threadDirectoryPolicy.directory_group_policy_authority,
    'current_shell_1c7_compatibility_transport_and_reassignment_guard_only_not_sidebar_project_affinity_authority',
  );
  assert.equal(
    threadDirectoryPolicy.project_affinity_presentation_authority_ref,
    'conversation_history_surfaces.project_affinity_presentation',
  );
  assert.equal(
    threadDirectoryPolicy.strict_project_affinity_producer,
    'post_app_shell_successor_project_id_projection',
  );
  assert.equal(
    guiWorkspaceModel.projectless_detection,
    'explicit_project_id_absent_or_managed_scratch_never_inferred_from_recorded_cwd_or_runtime_pwd',
  );
  assert.equal(
    guiWorkspaceModel.recorded_cwd_role,
    'canonical_runtime_workspace_preserved_independently_of_sidebar_project_affinity',
  );
  assert.equal(guiWorkspaceModel.project_affinity_source, 'explicit_project_id_projection');
  assert.equal(
    guiWorkspaceModel.project_affinity_role,
    'explicit_project_id_for_sidebar_grouping_and_new_session_project_shortcut_never_inferred_from_recorded_cwd',
  );
  assert.equal(
    guiWorkspaceModel.managed_scratch_presentation,
    'user_documents_codex_subtree_preserves_recorded_cwd_and_renders_unbound_without_leaf_directory_project_groups',
  );
  assert.equal(
    guiWorkspaceModel.core_workspace_application,
    'thread_settings_update_cwd_records_runtime_workspace_only',
  );
  assert.equal(
    guiWorkspaceModel.project_adoption_transition,
    'unbound_to_bound_once_via_explicit_project_affinity_assignment',
  );
  assert.deepEqual(profileWorkspaceModel, guiWorkspaceModel);
  assert.deepEqual(ordinaryConversation.conversation_view_model.session_workspace_model, guiWorkspaceModel);
  assert.equal(
    guiProductContract.interaction_baseline.conversation_scope.session_workspace_model_authority,
    'current_shell_1c7_compatibility_transport_only_not_sidebar_project_affinity_authority',
  );
  assert.equal(
    guiProductContract.interaction_baseline.conversation_scope.project_affinity_presentation_authority_ref,
    'interaction_baseline.navigation_rail.thread_directory_policy.conversation_history_surfaces.project_affinity_presentation',
  );
  assert.deepEqual(home.home_view_model.conversation_history_surfaces, {
    policy_ref:
      'contracts/app-gui-product-contract.json#interaction_baseline.navigation_rail.thread_directory_policy.conversation_history_surfaces',
    default_rail: 'canonical_unarchived_thread_directory',
    running_now: 'same_codex_desktop_runtime_task_status_or_explicit_unavailable',
    archived: 'independent_canonical_archived_thread_directory',
    all_search: 'explicit_canonical_historical_search_never_default_rail',
    project_affinity_presentation:
      'recorded_cwd_preserved_explicit_project_id_groups_managed_user_documents_codex_unbound',
    visible_id_consumers: ['default_rail', 'archived', 'pinned', 'workspace_groups', 'timeline'],
    fixed_count_acceptance_allowed: false,
  });
});

test('active-shell Runtime source gate allows canonical action refs but rejects legacy fallback reconstruction', () => {
  const canonicalActionRefs = [
    "actionId: 'work_item_visibility_set'",
    'payload.expected_generation = selectedItem.visibility.generation',
    'const refreshedItem = findReadbackWorkItem(refreshedPayload, selectedItem)',
    'const workflow_id = canonicalWorkItem.workflowId',
  ].join('\n');

  assert.doesNotThrow(() => assertRuntimePageSourceBoundary(canonicalActionRefs));
  for (const legacyFallback of [
    'normalizeRuntimeProjection(appState)',
    'dedupeTaskItems(items)',
    'runtimeTaskItem(task, controlStates)',
    'appStateToRuntimeProjection(appState)',
    'compactCurrentControlState(state)',
    'controlStateFallbackForTask(task, controlStates)',
    'record(controlState?.provider_run)',
  ]) {
    assert.throws(() => assertRuntimePageSourceBoundary(`${canonicalActionRefs}\n${legacyFallback}`));
  }
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
  assert.equal(guidHome.home_view_model.codex_default_model, 'gpt-future');
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

test('41301 machine authority rejects v1 contract schemas', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');

  const guiContract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
  guiContract.schema_version = 1;
  assert.throws(
    () => validateAppGuiProductContract(
      guiContract,
      readJson('contracts/app-release-channel.json'),
      installExposure,
    ),
    /schema_version must be 2/,
  );

  const productProfile = structuredClone(readJson('contracts/app-product-profile.json'));
  productProfile.schema_version = 1;
  assert.throws(
    () => validateProductProfile(productProfile, installExposure),
    /schema_version must be 2/,
  );

  const matrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
  matrix.schema_version = 1;
  assert.throws(
    () => validatePrimaryInteractionPages(matrix),
    /schema_version must be 2/,
  );
});

test('41301 GUI contract rejects persistent project context and legacy inspector taxonomy', () => {
  const validate = (contract: any) => validateAppGuiProductContract(
    contract,
    readJson('contracts/app-release-channel.json'),
    readJson('contracts/app-install-exposure-policy.json'),
  );

  for (const mutate of [
    (contract: any) => {
      contract.ordinary_conversation.composer_context_strip = ['project_context_refs', 'active_capability'];
    },
    (contract: any) => {
      contract.ordinary_conversation.project_context_inputs = { scope: 'canonical_workspace_path' };
    },
    (contract: any) => {
      contract.ordinary_conversation.artifact_preview.project_context_ref_policy = { workspace_scoped: true };
    },
    (contract: any) => {
      contract.ordinary_conversation.session_workspace_model.workspace_owns_context = true;
    },
    (contract: any) => {
      contract.ordinary_conversation.session_workspace_model.bound_project_reassignment = 'exposed';
    },
    (contract: any) => {
      contract.right_context_inspector.primary_tools = [
        { id: 'review' },
        { id: 'terminal' },
        { id: 'browser' },
        { id: 'files' },
      ];
    },
    (contract: any) => {
      contract.right_context_inspector.runtime_duplicate_allowed = true;
    },
    (contract: any) => {
      contract.ordinary_conversation.current_task_slice.default_visibility =
        'pinnable_summary_bar_when_task_active';
    },
    (contract: any) => {
      contract.ordinary_conversation.transcript_export.workspace_bundle_authorized = true;
    },
  ]) {
    const contract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
    mutate(contract);
    assert.throws(() => validate(contract));
  }
});

test('session-first contracts reject directory ownership, stale cache authority, and workspace-gated local inputs', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const validateGui = (contract: any) => validateAppGuiProductContract(
    contract,
    readJson('contracts/app-release-channel.json'),
    installExposure,
  );

  for (const mutate of [
    (contract: any) => {
      contract.interaction_baseline.navigation_rail.thread_directory_policy.directory_group_policy.cascade_session_delete_allowed = true;
    },
    (contract: any) => {
      contract.interaction_baseline.navigation_rail.thread_directory_policy.stale_codex_acp_cache_row_policy = 'keep';
    },
    (contract: any) => {
      contract.interaction_baseline.navigation_rail.thread_directory_policy.title_based_deduplication_allowed = true;
    },
    (contract: any) => {
      contract.first_launch_readiness_policy.ordinary_shell_recovery_policy.send_scoped_local_inputs.workspace_root_required = true;
    },
    (contract: any) => {
      contract.first_launch_readiness_policy.ordinary_shell_recovery_policy.workspace_controls.send_scoped_local_inputs_remain_available = false;
    },
    (contract: any) => {
      contract.interaction_baseline.conversation_scope.explicit_session_input_policy.workspace_readiness_boundary.agent_package_workspace_requirement_policy = 'all_agent_packages_require_workspace';
    },
    (contract: any) => {
      contract.interaction_baseline.conversation_scope.explicit_session_input_policy.workspace_readiness_boundary.ordinary_codex_conversation_independent_of_agent_package_readiness = false;
    },
  ]) {
    const contract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
    mutate(contract);
    assert.throws(() => validateGui(contract));
  }

  for (const mutate of [
    (profile: any) => {
      profile.gui.ordinary_conversation.explicit_session_input_policy.workspace_preload_allowed = true;
    },
    (profile: any) => {
      profile.gui.ordinary_conversation.explicit_session_input_policy.workspace_readiness_boundary.send_scoped_local_file_inputs_require_workspace_root = true;
    },
    (profile: any) => {
      profile.gui.home.home_composer_state_contract.semantic_probe.instance_counts['guid-input-card-shell'] = 2;
    },
    (profile: any) => {
      profile.first_run.first_conversation.required_before_send_with_local_inputs.unshift('workspace_root');
    },
    (profile: any) => {
      profile.first_run.ordinary_shell_recovery.send_scoped_local_inputs.workspace_root_required = true;
    },
    (profile: any) => {
      profile.first_run.ordinary_shell_recovery.send_scoped_local_inputs.supported_inputs = [
        'file_dialog_attachment',
      ];
    },
    (profile: any) => {
      profile.gui.ordinary_conversation.explicit_session_input_policy.workspace_readiness_boundary.agent_package_workspace_requirement_policy = 'all_agent_packages_require_workspace';
    },
    (profile: any) => {
      profile.gui.ordinary_conversation.explicit_session_input_policy.workspace_readiness_boundary.ordinary_codex_conversation_independent_of_agent_package_readiness = false;
    },
    (profile: any) => {
      profile.gui.ordinary_conversation.session_workspace_model.project_adoption_transition = 'not_exposed';
    },
  ]) {
    const profile = structuredClone(readJson('contracts/app-product-profile.json'));
    mutate(profile);
    assert.throws(() => validateProductProfile(profile, installExposure));
  }

  for (const mutate of [
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'ordinary_conversation')
        .conversation_view_model.explicit_session_input_policy.implicit_workspace_context_injection_allowed = true;
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'ordinary_conversation')
        .conversation_view_model.artifact_preview.entry_sources.push('workspace_project_context_ref');
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'guid_home')
        .home_view_model.home_composer_state_contract.semantic_probe.instance_counts['opl-guid-entry'] = 2;
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'ordinary_conversation').conversation_view_model.environment_workspace_handoff = {
        contract_ref: 'retired_worktree_handoff',
      };
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'ordinary_conversation')
        .conversation_view_model.session_workspace_model.bound_project_reassignment = 'exposed';
    },
  ]) {
    const matrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
    mutate(matrix);
    assert.throws(() => validatePrimaryInteractionPages(matrix));
  }
});

test('conversation contracts reject clearing send-scoped inputs on creation or send failure', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');

  const guiContract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
  guiContract.ordinary_conversation.send_failure_input_policy.must_preserve_send_scoped_local_inputs = false;
  assert.throws(
    () =>
      validateAppGuiProductContract(
        guiContract,
        readJson('contracts/app-release-channel.json'),
        installExposure,
      ),
    /ordinary conversation contract/,
  );

  const productProfile = structuredClone(readJson('contracts/app-product-profile.json'));
  productProfile.gui.ordinary_conversation.send_failure_input_policy.failure_scopes = [
    'conversation_creation',
    'in_conversation_send',
  ];
  assert.throws(
    () => validateProductProfile(productProfile, installExposure),
    /must preserve prompt and attachments/,
  );

  const pageMatrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
  pageMatrix.pages.find(
    (page: any) => page.id === 'ordinary_conversation',
  ).conversation_view_model.send_failure_input_policy.concurrent_edit_merge_policy =
    'replace_current_composer';
  assert.throws(
    () => validatePrimaryInteractionPages(pageMatrix),
    /Ordinary conversation view model shell policy/,
  );
});

test('41301 profile and page state reject the legacy eight-surface inspector', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const profile = structuredClone(readJson('contracts/app-product-profile.json'));
  profile.gui.right_context_inspector.primary_tools = [
    { id: 'review' },
    { id: 'terminal' },
    { id: 'browser' },
    { id: 'files' },
  ];
  profile.gui.right_context_inspector.secondary_sections = [
    { id: 'artifacts' },
    { id: 'runtime' },
    { id: 'actions' },
    { id: 'memory' },
  ];
  assert.throws(() => validateProductProfile(profile, installExposure));

  const matrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
  const inspector = matrix.pages.find(({ id }: { id: string }) => id === 'right_context_inspector');
  inspector.inspector_view_model.primary_tools = profile.gui.right_context_inspector.primary_tools;
  inspector.inspector_view_model.secondary_sections = profile.gui.right_context_inspector.secondary_sections;
  assert.throws(() => validatePrimaryInteractionPages(matrix));
});

test('41301 GUI authority rejects false Review focus and inline-comment completion', () => {
  for (const mutate of [
    (contract: any) => {
      contract.right_context_inspector.review_surface.source_capability_status.review_focus_context =
        'source_implemented_same_review_turn_steer_expected_turn_id';
    },
    (contract: any) => {
      contract.interaction_baseline.context_surfaces.review_pane.review_focus_delivery_policy =
        'non_custom_target_plain_text_turn_steer_same_review_thread_expected_turn_id_custom_instructions_not_duplicated';
    },
    (contract: any) => {
      contract.right_context_inspector.review_surface.source_capability_status.inline_comments =
        'source_implemented_shell_annotation_store';
    },
  ]) {
    const guiContract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
    mutate(guiContract);
    assert.throws(() =>
      validateAppGuiProductContract(
        guiContract,
        readJson('contracts/app-release-channel.json'),
        readJson('contracts/app-install-exposure-policy.json'),
      ),
    );
  }

  for (const mutate of [
    (reviewSurface: any) => {
      reviewSurface.source_capability_status.review_focus_context =
        'source_implemented_same_review_turn_steer_expected_turn_id';
    },
    (reviewSurface: any) => {
      reviewSurface.review_focus_delivery_policy =
        'non_custom_target_plain_text_turn_steer_same_review_thread_expected_turn_id_custom_instructions_not_duplicated';
    },
    (reviewSurface: any) => {
      reviewSurface.source_capability_status.inline_comments = 'source_implemented_shell_annotation_store';
    },
  ]) {
    const matrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
    const inspector = matrix.pages.find(({ id }: { id: string }) => id === 'right_context_inspector');
    mutate(inspector.inspector_view_model.review_surface);
    assert.throws(() => validatePrimaryInteractionPages(matrix));
  }
});

test('page-state matrix rejects Codex Auto policy source drift', () => {
  const matrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
  const guidHome = matrix.pages.find(({ id }) => id === 'guid_home');
  guidHome.home_view_model.codex_auto_model_policy_ref = 'shell-local-policy';

  assert.throws(() => validatePrimaryInteractionPages(matrix));
});

test('GUI contract rejects restoring private Package activation authority', () => {
  const guiContract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
  assert.equal('agent_package_activation_policy' in guiContract, false);
  guiContract.agent_package_activation_policy = {
    internal_action_id: 'fixed-private-action',
  };

  assert.throws(
    () => validateAppGuiProductContract(
      guiContract,
      readJson('contracts/app-release-channel.json'),
      readJson('contracts/app-install-exposure-policy.json'),
    ),
    /must not restore private Package activation authority/,
  );
});
