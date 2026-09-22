import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';
import {
  firstRunModelAccessSetupPolicy,
  focusedFirstRunPresentationPolicy,
  progressiveFirstRunRecoveryPolicy,
  progressiveFirstRunRecoveryTestIds,
} from '../app-contract-constants.ts';
import {
  expectedFirstRunCoreItems,
  expectedFirstRunProgressModel,
  expectedFullReadinessItems,
  aionuiTeamProbeIds,
  productProfile,
  settingsControlPlane,
} from './context.ts';
import { assertFirstRunProgressModelMatches, validateBeginnerFirstRunPresentation } from '../shared-contract-validators.ts';

export function validateGuiContractStartupAndNavigation(guiContract) {
  const startupReadModelPolicy = guiContract.framework_surfaces?.canonical_state?.startup_read_model_policy;
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
  if (
    !Array.isArray(guiContract.theme_and_branding?.allowed_theme_ids) ||
    guiContract.theme_and_branding.allowed_theme_ids.length !== 1 ||
    guiContract.theme_and_branding.allowed_theme_ids[0] !== 'default-theme'
  ) {
    throw new Error('App GUI theme list must expose only default-theme');
  }
  for (const section of [
    'general',
    'gateway',
    'access',
    'workspace',
    'agents',
    'capabilities',
    'resources',
    'environment',
    'storage',
    'appearance',
    'about',
  ]) {
    if (!guiContract.settings_navigation?.required_sections?.includes(section)) {
      throw new Error(`App GUI settings navigation must include ${section}`);
    }
  }
  assertDeepEqualJson(
    guiContract.settings_navigation?.ordinary_visible_tabs,
    settingsControlPlane.ordinary_visible_tabs,
    'App GUI settings navigation ordinary visible tabs',
  );
  assertDeepEqualJson(
    guiContract.settings_navigation?.secondary_page_ids,
    settingsControlPlane.secondary_pages?.map((route) => route.id),
    'App GUI settings navigation secondary page ids',
  );
  assertDeepEqualJson(
    guiContract.settings_navigation?.compatibility_redirects,
    settingsControlPlane.compatibility_redirects,
    'App GUI settings compatibility redirects',
  );
  assertDeepEqualJson(
    guiContract.settings_navigation?.ordinary_hidden_compatibility_routes,
    ['update', 'theme', 'local-services', 'personalization'],
    'App GUI hidden compatibility routes',
  );
  assertDeepEqualJson(
    guiContract.settings_navigation?.legacy_route_redirects,
    Object.fromEntries(
      Object.entries(settingsControlPlane.legacy_route_redirects ?? {})
        .filter(([id]) => id !== 'about')
        .map(([id, target]) => [id, target]),
    ),
    'App GUI settings navigation legacy route redirects',
  );
  assertDeepEqualJson(
    guiContract.settings_navigation?.ordinary_hidden_legacy_tabs,
    Object.keys(guiContract.settings_navigation?.legacy_route_redirects ?? {}),
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
  for (const [field, expected] of Object.entries({
    ordinary_visible: false,
    route_policy: 'disabled_or_redirect_to_app_owned_home',
    deep_link_policy: 'not_whitelisted',
    rationale: 'upstream AionUI Team is configured around shell-local agents and is not an OPL ordinary-user capability',
  })) {
    if (guiContract.settings_navigation?.team_surface_policy?.[field] !== expected) {
      throw new Error(`App GUI settings team_surface_policy.${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    guiContract.settings_navigation.team_surface_policy.required_probes,
    aionuiTeamProbeIds,
    'App GUI Team surface required probes',
  );
  if (
    guiContract.settings_navigation.source !==
      'persisted_narrow_settings_snapshot_then_opl_app_state_fast_background_refresh_and_full_explicit_detail'
  ) {
    throw new Error('App GUI settings navigation must render persisted narrow state before background fast App state hydration');
  }
  if (guiContract.settings_navigation.refresh_source !== 'opl app state --profile fast --json') {
    throw new Error('App GUI settings navigation refresh must use fast App state');
  }
  const firstLaunchPolicy = guiContract.first_launch_readiness_policy;
  if (
    firstLaunchPolicy?.launch_gate !== 'ready_to_launch' ||
    firstLaunchPolicy?.ui_order !== 'before_first_conversation_not_before_guid' ||
    firstLaunchPolicy?.guid_navigation_blocking !== false
  ) {
    throw new Error('App GUI first-launch readiness must gate first conversation without blocking /guid navigation');
  }
  for (const item of expectedFirstRunCoreItems) {
    if (!firstLaunchPolicy?.core_required_items?.includes(item)) {
      throw new Error(`App GUI first-launch readiness must require Core item ${item}`);
    }
  }
  for (const item of expectedFullReadinessItems) {
    if (!firstLaunchPolicy?.full_readiness_items?.includes(item)) {
      throw new Error(`App GUI first-launch readiness must keep ${item} in full readiness`);
    }
  }
  for (const [field, expected] of Object.entries({
    full_readiness_blocks_launch: false,
    default_provider: 'oplgateway',
    default_provider_name: 'OPL Gateway',
    existing_provider_name_policy: 'preserve_existing_provider_name_no_migration',
    default_base_url: 'https://gateway.medopl.com/v1',
    default_model: productProfile.codex.default_model,
    default_reasoning_effort: productProfile.codex.default_reasoning_effort,
    default_executor: 'codex_cli',
    full_runtime_provider: 'temporal',
  })) {
    if (firstLaunchPolicy?.[field] !== expected) {
      throw new Error(`App GUI first-launch readiness ${field} must be ${expected}`);
    }
  }
  validateBeginnerFirstRunPresentation(
    firstLaunchPolicy?.beginner_presentation,
    'App GUI first-launch beginner presentation',
    expectedFirstRunCoreItems,
  );
  for (const [field, expected] of Object.entries(focusedFirstRunPresentationPolicy)) {
    if (firstLaunchPolicy?.beginner_presentation?.[field] !== expected) {
      throw new Error(`App GUI first-launch beginner presentation ${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    firstLaunchPolicy?.beginner_presentation?.model_access_setup,
    firstRunModelAccessSetupPolicy,
    'App GUI first-launch model access setup policy',
  );
  assertDeepEqualJson(
    firstLaunchPolicy?.beginner_presentation?.primary_steps,
    expectedFirstRunCoreItems,
    "App GUI first-launch beginner presentation primary steps",
  );
  assertFirstRunProgressModelMatches(
    firstLaunchPolicy?.progress_model,
    expectedFirstRunProgressModel,
    'App GUI first-launch',
  );
  for (const [field, expected] of Object.entries({
    default_launch_command: 'opl app state --profile fast --json',
    default_launch_mode: 'bounded_readiness_overlay_then_guid',
    first_run_route_policy: 'authenticated_standalone_route_outside_ordinary_product_layout',
    ordinary_entry_route: '/guid',
    visible_startup_gate: 'bounded_core_catalog_readiness_overlay',
    navigation_wait_for_fast_state_ms: 20000,
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
  const postLoginSetupCheck = firstLaunchPolicy?.startup_runtime_policy?.fresh_webui_login_setup_check;
  if (
    postLoginSetupCheck?.trigger !== 'successful_authenticated_webui_login_only' ||
    postLoginSetupCheck?.route_intent !== progressiveFirstRunRecoveryPolicy.fresh_webui_login_setup_check_intent ||
    postLoginSetupCheck?.state_source !== 'shared_opl_app_fast_state' ||
    postLoginSetupCheck?.known_incomplete_behavior !== 'replace_guid_with_first_run' ||
    postLoginSetupCheck?.ready_behavior !== 'keep_guid' ||
    postLoginSetupCheck?.unknown_timeout_or_read_failure_behavior !==
      progressiveFirstRunRecoveryPolicy.fresh_webui_login_unknown_policy ||
    postLoginSetupCheck?.ui_timeout_ms !== progressiveFirstRunRecoveryPolicy.fresh_webui_login_ui_timeout_ms ||
    postLoginSetupCheck?.ordinary_startup_refresh_and_deep_link_behavior !==
      'keep_guid_without_automatic_first_run' ||
    postLoginSetupCheck?.consumption_policy !== 'one_shot'
  ) {
    throw new Error('App GUI fresh WebUI login setup check policy is invalid');
  }
  const ordinaryRecovery = firstLaunchPolicy?.ordinary_shell_recovery_policy;
  if (
    ordinaryRecovery?.persistent_setup_entry?.target_route !==
      progressiveFirstRunRecoveryPolicy.persistent_setup_entry_route ||
    ordinaryRecovery?.persistent_setup_entry?.surface !== 'ordinary_sidebar_non_modal_entry' ||
    ordinaryRecovery?.persistent_setup_entry?.must_preserve_current_route_until_clicked !== true ||
    ordinaryRecovery?.persistent_home_composer_runtime_alert !==
      'forbidden_use_sidebar_and_send_scoped_inline_recovery_only' ||
    ordinaryRecovery?.plain_conversation?.workspace_root_required !== false ||
    ordinaryRecovery?.plain_conversation?.must_preserve_prompt !== true ||
    ordinaryRecovery?.send_scoped_local_inputs?.workspace_root_required !== false ||
    ordinaryRecovery?.workspace_controls?.plain_conversation_remains_available !== true ||
    ordinaryRecovery?.workspace_controls?.send_scoped_local_inputs_remain_available !== true ||
    ordinaryRecovery?.unknown_readiness_policy !== progressiveFirstRunRecoveryPolicy.unknown_readiness_policy
  ) {
    throw new Error('App GUI first-launch ordinary shell recovery policy is invalid');
  }
  assertDeepEqualJson(
    ordinaryRecovery.plain_conversation.required_items,
    progressiveFirstRunRecoveryPolicy.plain_conversation_required_items,
    'App GUI first-launch plain conversation prerequisites',
  );
  assertDeepEqualJson(
    ordinaryRecovery.send_scoped_local_inputs.required_items,
    progressiveFirstRunRecoveryPolicy.send_scoped_local_input_required_items,
    'App GUI first-launch send-scoped local input prerequisites',
  );
  assertDeepEqualJson(
    ordinaryRecovery.send_scoped_local_inputs.supported_inputs,
    progressiveFirstRunRecoveryPolicy.send_scoped_local_input_surfaces,
    'App GUI first-launch send-scoped local input surfaces',
  );
  assertDeepEqualJson(
    ordinaryRecovery.workspace_controls.required_items,
    progressiveFirstRunRecoveryPolicy.workspace_control_required_items,
    'App GUI first-launch workspace control prerequisites',
  );
  assertDeepEqualJson(
    ordinaryRecovery.workspace_controls.restricted_capabilities,
    progressiveFirstRunRecoveryPolicy.workspace_restricted_capabilities,
    'App GUI first-launch workspace-restricted capabilities',
  );
  assertIncludesAll(
    ordinaryRecovery.required_shell_testids,
    progressiveFirstRunRecoveryTestIds,
    'App GUI first-launch progressive recovery shell test ids',
  );

  const modulePathPolicy = guiContract.module_path_source_policy;
  if (modulePathPolicy?.source !== 'app_state.modules[].source + app_state.modules[].path + app_state.paths') {
    throw new Error('App GUI module path explanation must come from App state module/path refs');
  }
  for (const explanation of [
    'whether a module comes from the bundled Full runtime payload',
    'which compatible source the Framework resolver selected for a package',
    'whether an exact installed lock or build artifact records the selected bytes',
    'whether a module comes from a local domain repository checkout',
    'whether Developer Profile source_channel uses a GitHub repo or local checkout',
    'whether a module is managed by App/CLI maintenance',
    'that module path display is refs-only and not domain truth authority',
  ]) {
    if (!modulePathPolicy.must_explain?.includes(explanation)) {
      throw new Error(`App GUI module path source policy must explain ${explanation}`);
    }
  }
  if (
    modulePathPolicy.ordinary_user_source !== 'framework_resolved_compatible_source' ||
    modulePathPolicy.ordinary_user_transport !== 'framework_package_lifecycle'
  ) {
    throw new Error('App GUI module path source policy must keep ordinary users on Framework-resolved package maintenance');
  }
  if (modulePathPolicy.developer_override_surface !== 'Developer Profile source_channel capability') {
    throw new Error('App GUI module path source policy must route repo/checkout override through Developer Profile source_channel');
  }
  if (modulePathPolicy.developer_override_policy !== 'explicit_opt_in_only') {
    throw new Error('App GUI module path source policy must require explicit opt-in for Developer Profile checkout override');
  }
  if (modulePathPolicy.developer_profile_ref !== 'developer_profile.capabilities.source_channel') {
    throw new Error('App GUI module path source policy must link to Developer Profile source_channel');
  }
  if (!modulePathPolicy.must_not_use?.includes('raw OPL_MODULE_SOURCE_MODE as ordinary Settings UI')) {
    throw new Error('App GUI module path source policy must not expose raw OPL_MODULE_SOURCE_MODE as ordinary Settings UI');
  }

}
