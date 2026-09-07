import { assertDeepEqualJson, assertIncludesAll, readJson } from './assertions.ts';
import { isDefaultReleaseAdapter } from './active-shell-contract.ts';
import {
  beginnerFirstRunTestIds,
  progressiveFirstRunRecoveryTestIds,
} from './app-contract-constants.ts';
import { assertNonEmptyStringArray, assertSharedFirstRunProgressModelMatches } from './shared-contract-validators.ts';
import { productProfilePath } from './validation-config.ts';
import { expectedHomeComposerStateContract } from '../app-product-profile-shared-validators.ts';

const productProfile = readJson(productProfilePath);
const fullFirstInstallPolicy = productProfile.first_run?.core_ready_policy?.full_first_install_clean_machine;
const expectedFirstRunProgressModel = productProfile.first_run?.progress_model;
const expectedFirstRunCoreItems = assertNonEmptyStringArray(
  productProfile.first_run?.ready_to_launch_gate?.required_core_items,
  'Product profile ready_to_launch required_core_items',
);

const firstRunRequiredHostTools = assertNonEmptyStringArray(
  fullFirstInstallPolicy?.missing_host_tools_allowed,
  'Product profile Full first-install missing_host_tools_allowed',
);
const firstRunDeferredMaintenanceItems = assertNonEmptyStringArray(
  fullFirstInstallPolicy?.must_not_block_core_ready,
  'Product profile Full first-install must_not_block_core_ready',
);

function buildScenarioMap(matrix) {
  if (!Array.isArray(matrix.scenarios) || matrix.scenarios.length === 0) {
    throw new Error('First-run matrix must declare scenarios');
  }
  return new Map(matrix.scenarios.map((scenario) => {
    if (!scenario.id || !scenario.package_type || !Array.isArray(scenario.expects) || scenario.expects.length === 0) {
      throw new Error(`Invalid first-run scenario: ${JSON.stringify(scenario)}`);
    }
    if (Array.isArray(scenario.aliases) && scenario.aliases.length > 0) {
      throw new Error(`First-run scenario ${scenario.id} must not declare compatibility aliases`);
    }
    return [scenario.id, scenario];
  }));
}

function validateFullFirstInstallScenario(fullClean) {
  for (const tool of firstRunRequiredHostTools) {
    if (!fullClean?.clean_machine_missing_tools?.includes(tool)) {
      throw new Error(`Full first-install clean-machine scenario must allow missing ${tool}`);
    }
  }
  if (fullClean?.core_ready_source !== 'bundled_runtime') {
    throw new Error('Full first-install clean-machine scenario must reach Core ready from bundled_runtime');
  }
  if (
    fullClean?.ready_to_launch_gate?.ui_order !== 'before_first_conversation_not_before_guid' ||
    fullClean?.ready_to_launch_gate?.guid_navigation_blocking !== false
  ) {
    throw new Error('Full first-install clean-machine scenario must gate first conversation without blocking /guid navigation');
  }
  if (fullClean?.ready_to_launch_gate?.blocks_on_full_readiness !== false) {
    throw new Error('Full first-install ready_to_launch must not block on full readiness');
  }
  for (const item of expectedFirstRunCoreItems) {
    if (!fullClean?.ready_to_launch_gate?.required_core_items?.includes(item)) {
      throw new Error(`Full first-install ready_to_launch must require Core item ${item}`);
    }
  }
  for (const item of firstRunDeferredMaintenanceItems) {
    if (!fullClean?.background_maintenance?.includes(item)) {
      throw new Error(`Full first-install clean-machine scenario must defer ${item} to background maintenance`);
    }
  }
  if (fullClean?.post_core_ready_background_policy?.mode !== 'best_effort_non_blocking') {
    throw new Error('Full first-install clean-machine scenario must continue background maintenance as best-effort non-blocking work');
  }
  if (fullClean?.post_core_ready_background_policy?.continues_after_core_ready !== true) {
    throw new Error('Full first-install clean-machine scenario must continue maintenance after Core ready');
  }
  for (const item of firstRunDeferredMaintenanceItems) {
    if (!fullClean?.post_core_ready_background_policy?.managed_items?.includes(item)) {
      throw new Error(`Full first-install post-Core maintenance must manage ${item}`);
    }
  }
  if (!fullClean?.expects?.some((entry) => /family runtime provider/.test(entry) && /background maintenance/.test(entry))) {
    throw new Error('Full first-install scenario must keep Temporal family runtime provider in background maintenance after Core ready');
  }
}

function validateHomeComposerProbe(scenario, label) {
  const probe = scenario?.diagnostics_contract?.home_composer_probe;
  if (
    probe?.contract_ref !==
      'contracts/app-gui-product-contract.json#interaction_baseline.home.home_composer_state_contract' ||
    probe.shortcut_package_membership_source_ref !==
      expectedHomeComposerStateContract.shortcut_package_membership_source_ref ||
    JSON.stringify(probe.opl_standard_agent_membership_policy) !==
      JSON.stringify(expectedHomeComposerStateContract.opl_standard_agent_membership_policy) ||
    probe.shortcut_preference_source_ref !==
      expectedHomeComposerStateContract.shortcut_preference_source_ref ||
    probe.shortcut_availability_source_ref !==
      expectedHomeComposerStateContract.shortcut_availability_source_ref ||
    probe.unknown_standard_agent_allowed !==
      expectedHomeComposerStateContract.unknown_standard_agent_allowed ||
    probe.unknown_first_party_opl_standard_agent_allowed !==
      expectedHomeComposerStateContract.unknown_first_party_opl_standard_agent_allowed ||
    probe.shortcut_package_ids !== undefined ||
    JSON.stringify(probe.viewports) !== JSON.stringify(expectedHomeComposerStateContract.viewports) ||
    JSON.stringify(probe.availability_states) !==
      JSON.stringify(expectedHomeComposerStateContract.availability_states) ||
    JSON.stringify(probe.required_summary_fields) !==
      JSON.stringify(['missing_controls', 'composer_state', 'instance_counts']) ||
    probe.fail_fast_seconds !== 60
  ) {
    throw new Error(`${label} must consume the App-owned Home composer state contract and fail within 60 seconds`);
  }
}

function validateStandardBootstrapScenario(standardBootstrap) {
  if (standardBootstrap?.bootstrap_owner !== 'app_managed') {
    throw new Error('Standard bootstrap scenario must declare App-managed bootstrap ownership');
  }
  if (standardBootstrap?.maintenance_resolution_policy !== 'app_or_cli_managed_best_effort_until_ready') {
    throw new Error('Standard bootstrap scenario must keep App/CLI-managed maintenance responsible until host tools are ready');
  }
  if (!standardBootstrap?.expects?.some((entry) => /App-managed bootstrap/.test(entry))) {
    throw new Error('First-run matrix must declare standard App-managed bootstrap');
  }
  if (!standardBootstrap?.expects?.some((entry) => /does not end.*Homebrew, Node, or Git/i.test(entry))) {
    throw new Error('Standard bootstrap must not make Homebrew/Node/Git installation the first-screen end state');
  }
}

function validateCommandLineToolsScenario(cltInstaller) {
  if (cltInstaller?.command !== 'xcode-select --install') {
    throw new Error('CLT first-run scenario must use xcode-select --install');
  }
  if (!cltInstaller?.expects?.some((entry) => /user confirmation/.test(entry))) {
    throw new Error('CLT first-run scenario must wait for user confirmation in the system installer');
  }
}

function validateFlowCapabilityStrategyScenario(strategy) {
  if (
    strategy?.strategy_authority !== 'opl-flow'
    || strategy?.compiler_authority !== 'opl-framework'
    || strategy?.app_role !== 'projection_consumer_only'
    || strategy?.runtime_projection_ref !==
      'app_state.agent_packages.status_index.packages.opl-flow.capability_strategy'
    || strategy?.full_build_lock_kind !== 'opl_flow_capability_build_lock.v1'
  ) {
    throw new Error('First-run matrix must consume the Framework-compiled OPL Flow capability strategy');
  }
  for (const expected of [
    'default Codex capabilities are selected by OPL Flow and compiled by Framework',
    'App does not maintain a second recommended Skill or tool inventory',
    'Full payload materialization exactly follows the Framework-generated Flow capability build lock',
    'install materializes capabilities without running explicit $opl-flow start onboarding',
  ]) {
    if (!strategy.expects?.includes(expected)) {
      throw new Error(`First-run Flow capability strategy scenario must require: ${expected}`);
    }
  }
}

function validateUpdaterScenario(updater) {
  if (
    updater?.update_policy?.download !== 'background'
    || updater?.update_policy?.apply !== 'restart_when_ready'
    || updater?.update_policy?.ready_prompt !== 'status_only_install_on_normal_restart'
    || updater?.update_policy?.full_first_install_metadata_allowed !== false
    || updater?.update_policy?.scope !== 'desktop_app_assets_only'
    || updater?.update_policy?.module_package_update_allowed !== false
    || updater?.update_policy?.developer_checkout_selection_allowed !== false
    || updater?.update_policy?.opl_flow_install_allowed !== false
  ) {
    throw new Error('Standard updater scenario must update desktop App assets only and exclude Full metadata, module packages, Developer checkouts, and opl-flow install');
  }
  for (const expected of [
    'standard updater does not update domain module packages',
    'standard updater does not select Developer Profile source_channel checkouts',
    'standard updater does not install opl-flow',
  ]) {
    if (!updater.expects?.includes(expected)) {
      throw new Error(`Standard updater scenario must require: ${expected}`);
    }
  }
}

function expandPackageTypes(packageType) {
  if (typeof packageType !== 'string' || !packageType.trim()) {
    return [];
  }
  return packageType.split('_or_').filter(Boolean);
}

function validateSharedProgressModel(progressModel, scenarios) {
  if (progressModel?.producer !== 'one-person-lab') {
    throw new Error('First-run shared progress model producer must be one-person-lab');
  }
  assertSharedFirstRunProgressModelMatches(progressModel, expectedFirstRunProgressModel, 'First-run matrix');
  if (progressModel?.truth_policy !== 'all_installers_and_renderers_derive_progress_from_the_shared_initialize_model') {
    throw new Error('First-run shared progress model must forbid parallel installer progress truth');
  }
  const packageTypes = (progressModel?.consumers ?? []).map((consumer) => consumer.package_type);
  const scenarioPackageTypes = [...new Set((scenarios ?? []).flatMap((scenario) => expandPackageTypes(scenario.package_type)))];
  assertIncludesAll(packageTypes, scenarioPackageTypes, 'First-run shared progress model consumers');
}

function validateProviderConfigurationQualification(qualification, scenarioById) {
  const existingConfigReuse = qualification?.existing_codex_config_reuse;
  const releaseVmDefault = qualification?.release_vm_default;
  const dedicatedAccount = releaseVmDefault?.dedicated_account_policy;
  const connectedDiagnostic = qualification?.connected_provider_diagnostic;
  const compatibilityLane = qualification?.api_key_compatibility_lane;
  const packageReconciliation = qualification?.package_reconciliation_independence;
  if (
    qualification?.release_contract_ref !== 'contracts/app-release-channel.json#provider_configuration_boundary'
    || qualification?.default_user_authentication !== 'opl_gateway_account_password'
    || qualification?.api_key_role !== 'explicit_compatibility_only'
    || qualification?.configuration_timing !==
      'user_requested_at_model_use_or_settings_except_protected_release_qualification'
    || existingConfigReuse?.config_source_resolution !==
      'OPL_FIRST_RUN_HOST_CODEX_CONFIG_or_CODEX_HOME_config_toml_or_home_dot_codex_config_toml'
    || existingConfigReuse?.detection !== 'selected_provider_has_usable_access'
    || existingConfigReuse?.behavior !== 'reuse_without_reconfiguration_or_manual_key_input'
    || existingConfigReuse?.manual_user_input_required !== false
    || existingConfigReuse?.mutation_performed !== false
    || existingConfigReuse?.secret_exposure_allowed !== false
    || releaseVmDefault?.credential_mode !== 'dedicated_release_test_account_files'
    || releaseVmDefault?.credential_source !==
      'release-stable variable OPL_GATEWAY_RELEASE_TEST_ACCOUNT_EMAIL and secret OPL_GATEWAY_RELEASE_TEST_ACCOUNT_PASSWORD'
    || releaseVmDefault?.credential_transport !==
      'mode_0600_runner_files_to_guest_files_then_CDP_form_arguments_without_secret_argv_log_plan_receipt_or_artifact'
    || releaseVmDefault?.provider_configuration_status !== 'required_gateway_account_login'
    || releaseVmDefault?.provider_configuration_required !== true
    || dedicatedAccount?.personal_or_administrator_account_allowed !== false
    || dedicatedAccount?.required_profile_role !== 'user'
    || dedicatedAccount?.required_account_status !== 'active'
    || dedicatedAccount?.required_balance_amount !== 0
    || dedicatedAccount?.configured_email_must_match_authenticated_profile !== true
    || dedicatedAccount?.live_profile_preflight_required !== true
    || dedicatedAccount?.credential_or_token_fields_in_receipt_allowed !== false
    || releaseVmDefault?.synthetic_api_key_generation_allowed !== false
    || releaseVmDefault?.implicit_api_key_file_injection_allowed !== false
    || releaseVmDefault?.visible_provider_wizard_behavior !==
      'submit_real_gateway_account_and_wait_for_fresh_connected_projection'
    || connectedDiagnostic?.trigger !== 'codex_ai_self_check_requested'
    || connectedDiagnostic?.credential_source !== 'developer_host_codex_selected_provider'
    || connectedDiagnostic?.config_path_resolution !== 'OPL_FIRST_RUN_HOST_CODEX_CONFIG_or_CODEX_HOME_config_toml_or_home_dot_codex_config_toml'
    || connectedDiagnostic?.base_url_must_match_opl_gateway !== true
    || connectedDiagnostic?.manual_user_input_required !== false
    || connectedDiagnostic?.synthetic_api_key_generation_allowed !== false
    || connectedDiagnostic?.secret_exposure_allowed !== false
    || connectedDiagnostic?.missing_or_incompatible_host_credential !== 'diagnostic_skipped_without_artifact_gate_failure'
    || compatibilityLane?.requires_explicit_request !== true
    || compatibilityLane?.explicit_credential_file_role !== 'optional_manual_override_only'
    || compatibilityLane?.provider_command !== 'opl system configure-codex --api-key-stdin --json'
    || compatibilityLane?.provider_command_role !== 'new_or_rotated_provider_credential_only'
    || compatibilityLane?.package_reconciliation_performed !== false
    || compatibilityLane?.package_lifecycle_mutation_allowed !== false
    || compatibilityLane?.blocking_release_gate !== false
    || packageReconciliation?.owner !== 'one-person-lab'
    || packageReconciliation?.surface !== 'framework_managed_update_plane'
    || packageReconciliation?.carrier_neutral !== true
    || packageReconciliation?.provider_configuration_required !== false
    || packageReconciliation?.api_key_required !== false
    || packageReconciliation?.configure_codex_allowed !== false
    || packageReconciliation?.installed_package_resolution !==
      'framework_managed_and_independent_from_app_carrier'
  ) {
    throw new Error(
      'Standard and Full release VM qualification must use protected Gateway credentials without synthetic keys while ordinary use reuses existing access and package reconciliation stays independent',
    );
  }
  assertDeepEqualJson(
    releaseVmDefault.required_summary_fields,
    [
      'status',
      'requested',
      'credential_source',
      'credential_present',
      'provider_base_url_matches_host',
      'manual_user_input_required',
      'mutation_performed',
      'blocking_release_gate',
    ],
    'Release VM Provider configuration summary fields',
  );
  assertDeepEqualJson(
    connectedDiagnostic.required_selected_provider_fields,
    ['base_url', 'experimental_bearer_token'],
    'Connected VM Provider credential fields',
  );
  assertDeepEqualJson(
    releaseVmDefault.required_release_test_account_preflight_readback,
    ['role=user', 'status=active', 'balance_amount=0', 'profile_email_matches_configured=true'],
    'Release VM dedicated Gateway test account preflight readback',
  );
  assertDeepEqualJson(
    releaseVmDefault.required_fresh_account_readback,
    ['connected=true', 'account_non_empty', 'managed_key_active', 'stale=false'],
    'Release VM fresh Gateway account readback',
  );
  assertDeepEqualJson(
    releaseVmDefault.required_official_profile_readback,
    [
      'first_install_status=passed',
      'desired_root_package_ids_exact',
      'installed_root_package_ids_exact',
      'restore_action_invoked=false',
    ],
    'Release VM Official Profile readback',
  );
  const requiredScenarioIds = [
    'standard_dmg_clean_vm_smoke',
    'full_dmg_clean_vm_smoke',
  ];
  assertDeepEqualJson(
    qualification.required_release_scenarios,
    requiredScenarioIds,
    'Release VM protected Gateway account scenarios',
  );
  for (const scenarioId of requiredScenarioIds) {
    const scenario = scenarioById.get(scenarioId);
    if (
      scenario?.release_gate !== true
      || scenario?.post_publication_optional_certification !== false
      || scenario?.vm?.diagnostic_scope !== 'release_gate'
      || scenario?.provider_configuration_contract_ref !== 'provider_configuration_qualification'
    ) {
      throw new Error(`Tart scenario ${scenarioId} must fail closed as a protected same-candidate release gate`);
    }
  }
  for (const scenarioId of [
    'full_first_install_clean_machine',
    'homebrew_standard_cask_clean_vm_smoke',
  ]) {
    const scenario = scenarioById.get(scenarioId);
    if (
      scenario?.release_gate !== false
      || scenario?.post_publication_optional_certification !== true
      || scenario?.vm?.diagnostic_scope !== 'post_publication_optional_certification'
    ) {
      throw new Error(`Tart scenario ${scenarioId} must be post-publication optional certification and must not block publication or Latest`);
    }
  }
  const oneShot = scenarioById.get('one_shot_app_installer_fresh_install_smoke');
  if (oneShot?.release_gate !== false || oneShot?.post_publication_optional_certification !== true) {
    throw new Error('One-shot installer fresh-install certification must not block publication or Latest');
  }
  const fullFirstInstall = scenarioById.get('full_first_install_clean_machine');
  if (
    !fullFirstInstall?.expects?.includes(
      'Existing usable Codex provider access is reused from resolved config.toml without manual key input or provider mutation',
    ) ||
    !fullFirstInstall?.expects?.includes(
      'Package reconciliation remains independent of provider configuration and API key availability and runs only through the Framework managed update plane',
    )
  ) {
    throw new Error('Full first install must reuse existing Codex access and decouple package reconciliation');
  }
  const fullDmg = scenarioById.get('full_dmg_clean_vm_smoke');
  if (
    !fullDmg?.expects?.includes(
      'The release gate submits protected OPL Gateway account credentials and requires fresh App state with connected account, active managed key, and stale=false; ordinary user sessions may still reuse an existing usable provider',
    ) ||
    !fullDmg?.expects?.includes(
      'Framework reports and reconciles installed Packages independently of provider configuration and API key availability; no fixed Package set, Flow lock, or optional Skill payload is required for App or Full readiness',
    )
  ) {
    throw new Error('Full DMG qualification must use provider-independent Framework managed package updates');
  }
}

export function validateFirstRunMatrix(matrix, contract) {
  if (isDefaultReleaseAdapter(contract) && (matrix.active_shell !== contract.active_shell || matrix.shell_root !== contract.shell_root)) {
    throw new Error('First-run matrix must target the active shell contract');
  }
  validateSharedProgressModel(matrix.shared_progress_model, matrix.scenarios);
  const scenarioById = buildScenarioMap(matrix);
  validateProviderConfigurationQualification(matrix.provider_configuration_qualification, scenarioById);
  validateFullFirstInstallScenario(scenarioById.get('full_first_install_clean_machine'));
  validateHomeComposerProbe(scenarioById.get('full_first_install_clean_machine'), 'Full first-install clean-machine scenario');
  validateHomeComposerProbe(scenarioById.get('full_dmg_clean_vm_smoke'), 'Full DMG clean-VM scenario');
  const beginnerScenario = scenarioById.get('beginner_simplified_first_run_clean_machine');
  if (!beginnerScenario) {
    throw new Error('First-run matrix is missing beginner_simplified_first_run_clean_machine');
  }
  if (beginnerScenario.audience !== 'beginner_non_technical_users') {
    throw new Error('Beginner first-run scenario must target beginner_non_technical_users');
  }
  if (beginnerScenario.view_model !== 'simplified_first_run') {
    throw new Error('Beginner first-run scenario must use simplified_first_run');
  }
  assertIncludesAll(
    beginnerScenario.required_shell_testids,
    beginnerFirstRunTestIds,
    'Beginner first-run scenario shell test ids',
  );
  for (const expected of [
    'authenticated root, ordinary startup, catch-all, and the legacy /startup-gate compatibility route enter /guid without waiting for fast App state',
    'startup readiness uses opl app state --profile fast --json as background bootstrap state only; ready, blocked, unknown, timeout, and read failure keep ordinary /guid entry usable and never redirect ordinary startup to /first-run',
    'fresh authenticated WebUI login carries a one-shot postLoginSetupCheck intent; known incomplete Core readiness replaces /guid with /first-run while ready, unknown, timeout, read failure, or a 20000 ms UI deadline keep /guid fail-open',
    'the installed launch target is 1500 ms from OS launch request until the Guid composer is visible, enabled, and focusable; this target requires exact installed evidence and is not inferred from source tests',
    'every ordinary launch, refresh, and deep link routes directly to /guid regardless of Core readiness while /first-run remains user-opened except for the one-shot fresh WebUI login check',
    'Chinese locale first-run primary area uses beginner labels such as 工作目录, 本机助手, and 模型访问 even when initialize checklist labels are English',
    'Chinese locale first-run primary area does not expose Codex API Configuration, Unknown, Needs setup, raw setup_flow fields, or opl system commands',
    'Desktop and WebUI model access default to OPL Gateway account login with email and password, while API Key remains a compatibility method',
    'existing Codex recheck is a secondary action outside the account and API Key method switch',
    'Gateway account login uses the runtime provider over desktop typed IPC or the existing WebUI HTTP proxy, omits device label, passes credentials through dedicated stdin, reads fast App state, and completes setup only for a uniquely resolved Codex group without executing gateway_account_use_for_model_access',
    'after a fresh state read exposes gateway_account_use_for_model_access, a separate explicit 设为模型访问方式 confirmation is required before the medium-impact local Codex provider mutation and login never counts as that confirmation',
    'successful Gateway login replaces the credential fields with an explicit localized success status, focuses the separate 设为模型访问方式 confirmation, and keeps setup blocked until that confirmation succeeds',
    'each authoritative post-login fast-state read is published to the shared cache so already-mounted Home and Sider consumers stop showing stale setup blockers without an App restart',
    'unresolved Gateway group selection shows localized group_selection_required and never claims model access ready',
    'Gateway password clears after success, failure, or method switch and never enters renderer diagnostics',
    'WebUI exposes Gateway account and API Key methods, defaults to Gateway account login, and reuses the existing OPL runtime HTTP proxy',
    'first-run uses a focused full-window setup workspace and hides ordinary product navigation until the user enters /guid',
    'first-run renders as an authenticated standalone route outside the ordinary product layout',
    'unknown startup readiness enters /guid directly and background refresh never mutates readiness or creates a global startup failure',
    'the three Core items render as a stable step rail while only the current task occupies the main panel',
    'the active rail step and task panel select the first unready Core item in fixed step order before completion',
    'Core progress uses completed step count without percentage progress',
    'model access offers functional Gateway account and API Key compatibility paths without competing primary actions',
    'model access method switching and alternate actions remain disabled until the current request settles',
    'ready state replaces the current task in place and keeps one primary entry action',
    'macOS first-install Official Profile apply starts after Core readiness and never blocks or disables the ready /guid entry',
    'Official Profile pending, timeout, and failure remain background Package-local status with technical diagnostics and explicit retry',
    'FirstRun never navigates automatically after initialize and explicit user entry can open /guid before or after readiness',
    'technical details stay inside FirstRun and do not expose ordinary Settings navigation',
    'all initialize, model access, and maintenance actions share one in-flight interaction lock',
    'initialize pending does not claim ready or no blockers before a payload returns',
    'required Core checklist items never treat disabled status as ready',
    'the 400x600 minimum App window keeps the current primary action visible',
    'background App shell is inert and aria-hidden until the user enters /guid',
    'macOS preserves traffic-light safe area while Windows and Linux retain desktop window controls',
    'interactive controls use localized accessible names rather than testid strings',
    'beginner errors are localized inline while raw diagnostics remain in technical details',
    'Gateway passwords are never stored in renderer diagnostics and submitted access keys are redacted before diagnostics are stored or rendered',
  ]) {
    if (!beginnerScenario.expects?.includes(expected)) {
      throw new Error(`Beginner first-run scenario must require localized beginner setup UX: ${expected}`);
    }
  }
  const progressiveRecovery = scenarioById.get('ordinary_shell_progressive_first_run_recovery');
  if (!progressiveRecovery) {
    throw new Error('First-run matrix is missing ordinary_shell_progressive_first_run_recovery');
  }
  assertIncludesAll(
    progressiveRecovery.required_shell_testids,
    progressiveFirstRunRecoveryTestIds,
    'Progressive first-run recovery shell test ids',
  );
  for (const expected of [
    'incomplete Core readiness never blocks authenticated navigation to /guid',
    'fresh authenticated WebUI login with known incomplete Core readiness enters /first-run through a one-shot route intent',
    'ordinary sidebar keeps a non-modal localized entry back to /first-run until Core prerequisites are complete',
    'ordinary Home never renders a persistent composer-wide runtime attention alert',
    'plain conversation and send-scoped local file or directory inputs require Codex CLI and model access but do not require workspace_root',
    'blocked send keeps the draft prompt and shows an inline localized recovery action',
    'missing workspace_root disables project selection and OPL workspace controls only',
    'unknown readiness does not synthesize failure or mutate ready_to_launch',
  ]) {
    if (!progressiveRecovery.expects?.includes(expected)) {
      throw new Error(`Progressive first-run recovery scenario must require: ${expected}`);
    }
  }
  validateStandardBootstrapScenario(scenarioById.get('standard_app_managed_bootstrap'));
  validateCommandLineToolsScenario(scenarioById.get('macos_clt_system_installer'));
  validateFlowCapabilityStrategyScenario(
    scenarioById.get('flow_capability_strategy_framework_managed'),
  );
  validateUpdaterScenario(scenarioById.get('updater_standard_channel'));
}
