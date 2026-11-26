import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';
import { progressiveFirstRunRecoveryTestIds } from '../app-contract-constants.ts';
import { assertNonEmptyString, assertNonEmptyStringArray } from '../validation-primitives.ts';
import { assertFirstRunProgressModelMatches, validateBeginnerFirstRunPresentation } from '../shared-contract-validators.ts';
import { productProfile, settingsControlPlane } from './context.ts';

const aionuiTeamProbeIds = [
  'team_mode_disabled',
  'team_route_redirect',
  'team_sidebar_gate',
  'team_created_redirect_noop',
  'ordinary_conversation_team_snapshot_scrub',
  'agent_switching_drops_team_mcp',
  'team_deep_link_not_whitelisted',
  'team_bridge_mutation_gate',
];

export function validateGuiContractStartupAndNavigation(guiContract) {
  const statePolicy = guiContract.framework_surfaces?.canonical_state;
  const startupReadModelPolicy = statePolicy?.startup_read_model_policy;
  if (
    startupReadModelPolicy?.blocking_policy !==
    'ordinary_startup_waits_only_for_fast_state_agent_conversation_model_and_capability_catalog_reads_then_core_failures_restrict_only_dependent_capabilities'
  ) {
    throw new Error('App GUI startup read model must wait only for the bounded ordinary-use catalogs');
  }
  if (
    startupReadModelPolicy?.ordinary_entry_route !== '/guid' ||
    startupReadModelPolicy?.visible_startup_gate !== 'bounded_core_catalog_readiness_overlay' ||
    startupReadModelPolicy?.navigation_wait_for_fast_state_ms !== 20000 ||
    startupReadModelPolicy?.state_hydration !==
      'last_good_allowlisted_renderer_cache_then_single_flight_background_refresh' ||
    startupReadModelPolicy?.background_refresh_soft_deadline_ms !== 1500 ||
    startupReadModelPolicy?.background_refresh_deadline_behavior !==
      'keep_startup_stage_visible_then_offer_limited_entry_without_false_ready'
  ) {
    throw new Error('App GUI startup read model must expose bounded quantitative readiness before Guid interaction');
  }
  const installedLaunchTarget = startupReadModelPolicy.installed_launch_target;
  if (
    installedLaunchTarget?.target_ms !== 1500 ||
    installedLaunchTarget?.measurement_scope !== 'OS_launch_request_to_branded_startup_loader_visible' ||
    installedLaunchTarget?.status !== 'required_unverified_installed_target_not_current_measurement_or_SLA' ||
    installedLaunchTarget?.fast_state_hydration_in_target !== false
  ) {
    throw new Error('App GUI startup read model must keep the 1500 ms installed Guid target explicit and evidence-bound');
  }

  if (guiContract.theme_and_branding?.default_theme_id !== 'default-theme') {
    throw new Error('App GUI default theme must be default-theme');
  }
  if (
    guiContract.theme_and_branding?.ordinary_chrome_product_name !== productProfile.product?.ordinary_chrome_name ||
    guiContract.theme_and_branding?.ordinary_navigation_brand_presentation?.identity !== 'text_only' ||
    guiContract.theme_and_branding?.ordinary_navigation_brand_presentation?.logo_visible !== false ||
    guiContract.theme_and_branding?.ordinary_navigation_brand_presentation?.theme_variant_asset_required !== false
  ) {
    throw new Error('App GUI ordinary navigation branding must use the profile-owned text-only product name');
  }
  if (!guiContract.theme_and_branding?.visible_branding_surfaces?.includes('navigation_rail_brand')) {
    throw new Error('App GUI visible branding surfaces must include navigation_rail_brand');
  }
  assertDeepEqualJson(
    guiContract.theme_and_branding.allowed_theme_ids,
    [guiContract.theme_and_branding.default_theme_id],
    'App GUI theme list',
  );

  const settingsNavigation = guiContract.settings_navigation;
  const secondaryPages = settingsControlPlane.secondary_pages.map((route) => route.id);
  assertIncludesAll(
    settingsNavigation?.required_sections,
    [...settingsControlPlane.ordinary_visible_tabs, ...secondaryPages],
    'App GUI settings navigation',
  );
  assertDeepEqualJson(
    settingsNavigation.ordinary_visible_tabs,
    settingsControlPlane.ordinary_visible_tabs,
    'App GUI settings navigation ordinary visible tabs',
  );
  assertDeepEqualJson(
    settingsNavigation.secondary_page_ids,
    secondaryPages,
    'App GUI settings navigation secondary page ids',
  );
  assertDeepEqualJson(
    settingsNavigation.compatibility_redirects,
    settingsControlPlane.compatibility_redirects,
    'App GUI settings compatibility redirects',
  );
  assertDeepEqualJson(
    settingsNavigation.ordinary_hidden_compatibility_routes,
    Object.keys(settingsControlPlane.compatibility_redirects),
    'App GUI hidden compatibility routes',
  );
  assertDeepEqualJson(
    settingsNavigation.legacy_route_redirects,
    settingsControlPlane.legacy_route_redirects,
    'App GUI settings navigation legacy route redirects',
  );
  assertDeepEqualJson(
    settingsNavigation.ordinary_hidden_legacy_tabs,
    Object.keys(settingsNavigation.legacy_route_redirects),
    'App GUI settings navigation ordinary hidden legacy tabs',
  );
  if (
    guiContract.settings_navigation?.legacy_route_redirects?.about ||
    settingsControlPlane.legacy_route_redirects?.about
  ) {
    throw new Error('App GUI About must remain an independent /settings/about page');
  }
  if (
    guiContract.settings_navigation?.legacy_route_redirects?.assistants !==
    'capabilities#third-party'
  ) {
    throw new Error('App GUI legacy assistants route must target the OPL capability directory');
  }
  assertIncludesAll(
    guiContract.settings_navigation?.ordinary_hidden_upstream_surfaces,
    ['AionUI Team', 'Team nav entry', 'Team leader configuration', 'team deep link navigation'],
    'App GUI settings hidden upstream surfaces',
  );
  const teamPolicy = settingsNavigation.team_surface_policy;
  if (
    teamPolicy?.ordinary_visible !== false ||
    teamPolicy?.route_policy !== 'disabled_or_redirect_to_app_owned_home' ||
    teamPolicy?.deep_link_policy !== 'not_whitelisted'
  ) {
    throw new Error('App GUI settings must keep the retired Team surface hidden and unaddressable');
  }
  assertNonEmptyString(teamPolicy.rationale, 'App GUI settings Team rationale');
  assertDeepEqualJson(
    teamPolicy.required_probes,
    aionuiTeamProbeIds,
    'App GUI Team surface required probes',
  );
  if (
    guiContract.settings_navigation.source !==
      'persisted_narrow_settings_snapshot_then_opl_app_state_fast_background_refresh_and_full_explicit_detail'
  ) {
    throw new Error('App GUI settings navigation must render persisted narrow state before background fast App state hydration');
  }
  if (settingsNavigation.refresh_source !== statePolicy.refresh_command) {
    throw new Error('App GUI settings navigation refresh must use fast App state');
  }

  const firstLaunchPolicy = guiContract.first_launch_readiness_policy;
  const firstRun = productProfile.first_run;
  const expectedCoreItems = assertNonEmptyStringArray(
    firstRun.ready_to_launch_gate?.required_core_items,
    'Product profile ready_to_launch required_core_items',
  );
  const fullReadinessItems = firstRun.full_readiness_layers.filter((item) => item !== 'core');
  const defaultSession = productProfile.default_session_profile;
  if (
    firstLaunchPolicy?.launch_gate !== 'ready_to_launch' ||
    firstLaunchPolicy?.ui_order !== 'before_first_conversation_not_before_guid' ||
    firstLaunchPolicy?.guid_navigation_blocking !== false
  ) {
    throw new Error('App GUI first-launch readiness must gate first conversation without blocking /guid navigation');
  }
  assertIncludesAll(firstLaunchPolicy.core_required_items, expectedCoreItems, 'App GUI first-launch Core items');
  assertIncludesAll(firstLaunchPolicy.full_readiness_items, fullReadinessItems, 'App GUI first-launch full readiness items');
  for (const [field, expected] of Object.entries({
    full_readiness_blocks_launch: false,
    default_provider: defaultSession.provider,
    default_provider_name: defaultSession.provider_name,
    existing_provider_name_policy: defaultSession.existing_provider_name_policy,
    default_base_url: defaultSession.base_url,
    default_model: defaultSession.model,
    default_reasoning_effort: defaultSession.reasoning_effort,
    default_executor: defaultSession.executor,
    full_runtime_provider: firstRun.runtime_provider.full_readiness_provider,
  })) {
    if (firstLaunchPolicy?.[field] !== expected) {
      throw new Error(`App GUI first-launch readiness ${field} must be ${expected}`);
    }
  }
  const presentation = firstLaunchPolicy.beginner_presentation;
  validateBeginnerFirstRunPresentation(
    presentation,
    'App GUI first-launch beginner presentation',
    expectedCoreItems,
  );
  for (const [field, expected] of Object.entries(firstRun.beginner_presentation)) {
    assertDeepEqualJson(
      presentation[field],
      expected,
      `App GUI first-launch beginner presentation ${field}`,
    );
  }
  assertFirstRunProgressModelMatches(
    firstLaunchPolicy.progress_model,
    firstRun.progress_model,
    'App GUI first-launch',
  );
  for (const [field, expected] of Object.entries({
    default_launch_command: statePolicy.default_command,
    default_launch_mode: 'bounded_readiness_overlay_then_guid',
    first_run_route_policy: 'authenticated_standalone_route_outside_ordinary_product_layout',
    ordinary_entry_route: startupReadModelPolicy.ordinary_entry_route,
    visible_startup_gate: startupReadModelPolicy.visible_startup_gate,
    navigation_wait_for_fast_state_ms: startupReadModelPolicy.navigation_wait_for_fast_state_ms,
    unknown_readiness_policy: 'show_truthful_pending_stage_then_allow_explicit_limited_guid_without_mutating_readiness',
    guid_navigation_blocked_by_readiness: true,
    core_capability_use_blocked_when_prerequisites_fail: true,
  })) {
    if (firstLaunchPolicy?.startup_runtime_policy?.[field] !== expected) {
      throw new Error('App GUI first-launch startup runtime ' + field + ' must be ' + expected);
    }
  }
  if (firstLaunchPolicy?.startup_runtime_policy?.limited_guid_entry_after_failure_or_timeout !== true) {
    throw new Error('App GUI first-launch startup runtime must allow explicit limited entry after a failed or timed-out stage');
  }
  const { fresh_webui_login_setup_check: postLoginSetupCheck, ...profileRecovery } =
    firstRun.ordinary_shell_recovery;
  assertDeepEqualJson(
    firstLaunchPolicy.startup_runtime_policy.fresh_webui_login_setup_check,
    postLoginSetupCheck,
    'App GUI fresh WebUI login setup check policy',
  );
  const { required_shell_testids: recoveryTestIds, ...ordinaryRecovery } =
    firstLaunchPolicy.ordinary_shell_recovery_policy ?? {};
  assertDeepEqualJson(
    ordinaryRecovery,
    profileRecovery,
    'App GUI first-launch ordinary shell recovery policy',
  );
  assertIncludesAll(
    recoveryTestIds,
    progressiveFirstRunRecoveryTestIds,
    'App GUI first-launch progressive recovery shell test ids',
  );

  const modulePathPolicy = guiContract.module_path_source_policy;
  if (modulePathPolicy?.source !== 'app_state.modules[].source + app_state.modules[].path + app_state.paths') {
    throw new Error('App GUI module path explanation must come from App state module/path refs');
  }
  assertNonEmptyStringArray(modulePathPolicy.must_explain, 'App GUI module path explanation');
  if (
    modulePathPolicy.ordinary_user_source !== 'framework_resolved_compatible_source' ||
    modulePathPolicy.ordinary_user_transport !== 'framework_package_lifecycle'
  ) {
    throw new Error('App GUI module path source policy must keep ordinary users on Framework-resolved package maintenance');
  }
  if (
    modulePathPolicy.developer_override_surface !== 'Developer Profile source_channel capability' ||
    modulePathPolicy.developer_override_policy !== 'explicit_opt_in_only' ||
    modulePathPolicy.developer_profile_ref !== 'developer_profile.capabilities.source_channel' ||
    !guiContract.developer_profile?.capabilities?.source_channel
  ) {
    throw new Error('App GUI module path source policy must route explicit repo or checkout overrides through Developer Profile source_channel');
  }
  if (!modulePathPolicy.must_not_use?.includes('raw OPL_MODULE_SOURCE_MODE as ordinary Settings UI')) {
    throw new Error('App GUI module path source policy must not expose raw OPL_MODULE_SOURCE_MODE as ordinary Settings UI');
  }
}
