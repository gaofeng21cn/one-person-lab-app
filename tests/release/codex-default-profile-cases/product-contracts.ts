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
import { appOwnedOplStandardAgentMembershipPolicy } from "../../../scripts/validate-active-shell/app-contract-constants.ts";
import { validateAppSettingsPages } from "../../../scripts/validate-active-shell/page-state-app-settings-validator.ts";

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

  const missingApplicationManagementPage = structuredClone(readJson('contracts/app-gui-product-contract.json'));
  delete missingApplicationManagementPage.pages.app_management;
  assert.throws(
    () => validateAppGuiProductContract(
      missingApplicationManagementPage,
      readJson('contracts/app-release-channel.json'),
      installExposure,
    ),
    /App GUI contract missing page app_management/,
  );

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
      :root {
        --opl-sidebar-bg: var(--dsw-specific-sidebar-fill);
        --opl-main-bg: var(--dsw-alias-bg-base);
        --opl-focus-ring: var(--dsw-alias-state-business-primary);
        --text-primary: var(--dsw-alias-label-primary);
      }
      body { color: var(--text-primary); }
      .layout-sider.arco-layout-sider { background: var(--opl-sidebar-bg); }
    `,
    unoConfig: `
      't-primary': 'var(--text-primary)',
      't-tertiary': 'var(--color-text-3)',
    `,
  };
  assert.doesNotThrow(() => validateShellVisualTokenBindings(validSources));

  const legacySources = {
    ...validSources,
    productBaseline: `
      :root {
        --opl-sidebar-bg: #fcfcfc;
        --text-primary: var(--color-text-1);
      }
      body[data-theme='dark'] { --opl-sidebar-bg: #1b1c1e; }
      body { color: var(--text-primary); }
      .layout-sider.arco-layout-sider { background: var(--opl-sidebar-bg); }
    `,
  };
  assert.doesNotThrow(() => validateShellVisualTokenBindings(legacySources, false));

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
        '--text-primary: var(--dsw-alias-label-primary);',
        '--text-primary: #202124;',
      ),
    }),
    /--text-primary: var\(--dsw-alias-label-primary\)/,
  );
});

test('new OPL Gateway configs use the branded provider name without renaming existing providers', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const productProfile = readJson('contracts/app-product-profile.json');
  const guiContract = readJson('contracts/app-gui-product-contract.json');

  assert.equal(productProfile.default_session_profile.provider, 'oplgateway');
  assert.equal(productProfile.default_session_profile.provider_name, 'OPL Gateway');
  assert.equal(productProfile.default_session_profile.base_url, 'https://gateway.medopl.com/v1');
  assert.equal(
    productProfile.default_session_profile.existing_provider_name_policy,
    'preserve_existing_provider_name_no_migration',
  );
  assert.equal(guiContract.first_launch_readiness_policy.default_provider, 'oplgateway');
  assert.equal(guiContract.first_launch_readiness_policy.default_provider_name, 'OPL Gateway');
  assert.equal(guiContract.first_launch_readiness_policy.default_base_url, 'https://gateway.medopl.com/v1');
  assert.equal(
    guiContract.first_launch_readiness_policy.existing_provider_name_policy,
    'preserve_existing_provider_name_no_migration',
  );

  const providerNameDrift = structuredClone(productProfile);
  providerNameDrift.default_session_profile.provider_name = 'Legacy provider label';
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
    'package_owner_declared_publication_or_configured_native_carrier',
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
  assert.deepEqual(profile.official_profile.desired_root_package_ids, [
    'mas',
    'mag',
    'rca',
    'oma',
    'obf',
    'med-autocast',
    'opl-flow',
    'opl-channel-weixin',
  ]);
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
    'app_state.agent_packages.directory.entries',
  );
  assert.deepStrictEqual(
    policy.opl_standard_agent_membership_policy,
    appOwnedOplStandardAgentMembershipPolicy,
  );
  assert.equal(
    policy.palette_agent_status_source_ref,
    'app_state.agent_packages.status_index.packages[]',
  );
  assert.equal(
    policy.palette_unknown_standard_agent_policy,
    'include_unknown_package_ids_only_when_they_match_opl_standard_agent_membership',
  );
  assert.deepStrictEqual(policy.palette_agent_group_label_i18n, {
    'zh-CN': 'OPL 标准智能体',
    'en-US': 'OPL standard agents',
  });
  assert.equal(
    policy.palette_home_shortcut_independence_policy,
    'complete_opl_standard_agent_catalog_independent_of_home_shortcut_visibility_and_order',
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
    home.opl_standard_agent_membership_policy,
    appOwnedOplStandardAgentMembershipPolicy,
  );
  assert.deepStrictEqual(
    agentPackageGroup.opl_standard_agent_membership_policy,
    appOwnedOplStandardAgentMembershipPolicy,
  );
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
        'app_state.agent_packages.directory.entries',
      home_preference_source_ref:
        'app_state.agent_packages.status_index.home_shortcut_preferences[]',
      home_visibility_policy:
        'opl_standard_agent_membership_with_selectable_readiness_real_codex_route_and_default_or_user_visible_shortcuts',
      home_order_policy: 'home_shortcut_preferences_sort_order_then_localized_display_name',
      source_ref: 'app_state.agent_packages.directory.entries',
      status_source_ref: 'app_state.agent_packages.status_index.packages[]',
      catalog_order_policy: 'home_shortcut_preferences_sort_order_then_localized_display_name',
      action_policy: 'render_only_directory_available_actions_and_recommended_action_ref',
      unknown_standard_agent_policy:
        'include_unknown_package_ids_only_when_they_match_opl_standard_agent_membership',
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
      value.pages.find((page: any) => page.id === 'guid_home').home_view_model
        .opl_standard_agent_membership_policy.package_id_allowlist_allowed = true;
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

test('active Studio keeps Runtime status in primary navigation without expanding Native or release gates', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const profile = structuredClone(readJson('contracts/app-product-profile.json'));
  const navigation = profile.gui.home.home_layout.active_studio_primary_navigation;
  assert.deepStrictEqual(navigation.ordered_entry_ids, ['new_task', 'app_management', 'runtime', 'scheduled_tasks', 'archived']);
  assert.equal(navigation.app_management_entry.label_i18n['zh-CN'], '应用管理');
  assert.equal(navigation.app_management_entry.route, '/apps');
  assert.equal(navigation.app_management_entry.keyboard_reachable, true);
  assert.equal(navigation.runtime_entry.label_i18n['zh-CN'], '运行状态');
  assert.equal(navigation.runtime_entry.route, '/runtime');
  assert.equal(navigation.runtime_entry.keyboard_reachable, true);
  assert.equal(navigation.runtime_entry.home_content_effect, 'navigation_only_no_dashboard');

  profile.gui.home.home_layout.active_studio_primary_navigation.ordered_entry_ids = [
    'new_task',
    'scheduled_tasks',
    'archived',
  ];
  assert.throws(
    () => validateProductProfile(profile, installExposure),
    /Runtime status in the active Studio primary navigation/,
  );

  const matrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
  matrix.pages.find((page: any) => page.id === 'guid_home').home_view_model.home_layout
    .active_studio_primary_navigation.runtime_entry.keyboard_reachable = false;
  assert.throws(() => validatePrimaryInteractionPages(matrix), /Guid home page layout/);
});

test('application management page state keeps the App-owned route and lifecycle boundaries', () => {
  const guiContract = readJson('contracts/app-gui-product-contract.json');
  const matrix = readJson('contracts/app-page-state-matrix.json');
  assert.doesNotThrow(() => validateAppSettingsPages(matrix, guiContract));

  for (const mutate of [
    (page: any) => { page.sections = ['applications', 'updates']; },
    (page: any) => { page.machine_source = 'shell_local_package_catalog'; },
    (page: any) => { page.required_state_axes = ['installed']; },
    (page: any) => { page.fresh_readback_required = false; },
    (page: any) => { page.must_not_own = []; },
  ]) {
    const drift = structuredClone(matrix);
    mutate(drift.pages.find((page: any) => page.id === 'app_management'));
    assert.throws(() => validateAppSettingsPages(drift, guiContract), /app_management/);
  }
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
