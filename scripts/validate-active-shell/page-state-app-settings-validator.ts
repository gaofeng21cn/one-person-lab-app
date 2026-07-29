import { assertDeepEqualJson, assertIncludesAll, readJson } from './assertions.ts';
import {
  appOwnedSettingsResourcesBrowserEntry,
  appOwnedSettingsCompatibilityRedirects,
  appOwnedSettingsManagedDependencySummary,
  appOwnedSettingsResourceActionBehavior,
  appOwnedSettingsTechnicalDetailsDefault,
  appOwnedTaskAwarenessRefFields,
} from './app-contract-constants.ts';
import {
  validateEnvironmentModuleMaintenanceEntry,
} from './managed-update-plane-validator.ts';
import { appOwnedOfficialProfileRestoreAction } from './gui-product-contract-validator.ts';
import { settingsControlPlanePath } from './validation-config.ts';
import { validateSettingsControlPlaneBehavior } from './settings-control-plane-validator.ts';

const guiSettingsPageToMatrixPage = {
  settings_general: 'settings_general',
  settings_gateway: 'gateway',
  settings_access: 'access',
  settings_workspace: 'settings_workspace',
  settings_agents: 'agents',
  settings_capabilities: 'capabilities',
  settings_resources: 'settings_resources',
  settings_environment: 'environment',
  settings_storage: 'storage',
  settings_theme: 'settings_theme',
  about: 'about',
};

const settingsControlPlane = readJson(settingsControlPlanePath);

export function validateAppSettingsPages(matrix, guiContract) {
  validateSettingsControlPlaneBehavior({ pageStateMatrix: matrix });

  for (const [contractPageId, matrixPageId] of Object.entries(guiSettingsPageToMatrixPage)) {
    const expected = guiContract?.pages?.[contractPageId];
    if (!expected) {
      throw new Error(`App GUI contract is missing ${contractPageId}`);
    }
    const page = pageById(matrix, matrixPageId);
    if (page.page_contract !== contractPageId) {
      throw new Error(`${matrixPageId} page_contract must be ${contractPageId}`);
    }
    if (
      (typeof expected.machine_source === 'string' &&
        page.machine_source !== expected.machine_source) ||
      (typeof expected.refresh_source === 'string' &&
        page.refresh_source !== expected.refresh_source)
    ) {
      throw new Error(
        `${matrixPageId} must use the App-owned page machine and refresh sources`,
      );
    }
    assertDeepEqualJson(page.sections, expected.sections, `${matrixPageId} sections`);
    assertIncludesAll(page.must_show, expected.must_show, `${matrixPageId} must_show`);
    assertIncludesAll(page.must_not_show, expected.must_not_show, `${matrixPageId} must_not_show`);
  }

  const storagePage = pageById(matrix, 'storage');
  assertDeepEqualJson(
    storagePage.owner_storage_projections?.status_presentation_policy,
    guiContract.pages?.settings_storage?.owner_storage_projections?.status_presentation_policy,
    'Storage owner projection status presentation policy',
  );

  const accessPage = pageById(matrix, 'access');
  if (
    accessPage.provider_source !== 'app_state.core.codex.model_access_source' ||
    !accessPage.state_sections?.includes('core.codex.model_access_source')
  ) {
    throw new Error('Access page must use the real Codex model_access_source');
  }
  if (
    accessPage.browser_access_entry !== undefined ||
    accessPage.required_dom?.always?.includes('settings-access-browser-access')
  ) {
    throw new Error('Models must not own browser access to this computer');
  }
  if (accessPage.opl_gateway_account !== undefined) {
    throw new Error('Models must not own Gateway account state or controls');
  }
  const gatewayPage = pageById(matrix, 'gateway');
  const gatewayAccount = gatewayPage.opl_gateway_account;
  if (
    gatewayAccount?.projection_ref !== 'contracts/app-runtime-bridge.json#opl_gateway_account_projection' ||
    gatewayAccount.projection_path !== 'app_state.settings_control_center.app_settings_read_model.opl_gateway_account' ||
    gatewayAccount.secret_bridge_ref !== 'contracts/app-runtime-bridge.json#opl_gateway_account_secret_bridge' ||
    gatewayAccount.account_card_visibility !== 'account_connection_only' ||
    gatewayAccount.manual_api_key_card_policy !== 'model_access_status_only_no_account_balance_or_account_usage' ||
    gatewayAccount.cache_ttl_seconds !== 900 ||
    gatewayAccount.stale_policy !== 'show_cached_values_with_stale_marker_and_manual_refresh' ||
    gatewayAccount.managed_key_setup_policy !==
      'auto_complete_exposed_setup_action_for_unique_codex_group_without_user_control' ||
    gatewayAccount.first_run_scope !== 'gateway_account_default_desktop_and_webui_with_manual_api_key_compatibility' ||
    gatewayAccount.personal_profile_navigation !== 'not_added'
  ) {
    throw new Error('Account & Access must consume the canonical Gateway account projection and preserve its product boundaries');
  }
  assertDeepEqualJson(gatewayAccount.access_paths, ['account_login', 'manual_api_key'], 'Gateway access paths');
  assertDeepEqualJson(
    gatewayAccount.error_states,
    ['auth_expired', 'managed_key_missing', 'managed_key_conflict', 'managed_key_identity_drift', 'disconnect_pending'],
    'Gateway account visible repair states',
  );
  assertDeepEqualJson(
    gatewayAccount,
    guiContract.pages?.settings_gateway?.opl_gateway_account,
    'Gateway account page product contract',
  );
  assertIncludesAll(
    gatewayPage.required_dom?.always,
    ['settings-gateway-access', 'settings-gateway-manual-key'],
    'Gateway access always-present DOM',
  );
  const gatewayConditionalDom = new Map(
    (gatewayPage.required_dom?.conditional ?? []).map((entry) => [entry.testid, entry.when]),
  );
  for (const [testid, when] of Object.entries({
    'settings-gateway-setup': 'desktop_account_login_selected',
    'settings-gateway-account': 'gateway_account_connected',
    'settings-gateway-stale': 'gateway_account_projection_stale',
    'settings-gateway-disconnect-confirm': 'gateway_account_disconnect_requested',
  })) {
    if (gatewayConditionalDom.get(testid) !== when) {
      throw new Error(`Account & Access DOM ${testid} must be conditional on ${when}`);
    }
  }

  const resourcesPage = pageById(matrix, 'settings_resources');
  assertDeepEqualJson(
    resourcesPage.browser_access_entry,
    appOwnedSettingsResourcesBrowserEntry,
    'Resources page browser entry',
  );
  if (!resourcesPage.required_dom?.always?.includes('settings-resources-browser-access')) {
    throw new Error('Resources & Connections must preserve browser access to this computer');
  }

  validateCapabilitiesPage(matrix, guiContract);
  validateResourcesPage(matrix, guiContract);
  validateEnvironmentPage(matrix, guiContract);
  validateAboutPage(matrix);
  validateCompatibilityRedirectPages(matrix, guiContract);
  validateSettingsThemePage(matrix);
  validateSettingsPageExperience(matrix);
}
function pageById(matrix, id) {
  const page = (matrix.pages ?? []).find((entry) => entry.id === id);
  if (!page) {
    throw new Error(`Page-state matrix is missing ${id}`);
  }
  return page;
}

function validateCapabilitiesPage(matrix, guiContract) {
  const agentsPage = pageById(matrix, 'agents');
  const capabilitiesPage = pageById(matrix, 'capabilities');
  const guiAgentsPage = guiContract.pages?.settings_agents;
  const guiCapabilitiesPage = guiContract.pages?.settings_capabilities;

  if (
    capabilitiesPage.ownership_ref !== 'contracts/app-settings-control-plane.json#agents_capabilities_ownership.capabilities' ||
    !capabilitiesPage.must_show?.includes('OPL Flow managed and recommended Skills and Plugins from package dependency closure') ||
    !capabilitiesPage.must_show?.includes(
      'AionUI-native Skills, Plugins, MCP helpers, image generation, and voice input inside local or third-party ownership instead of OPL Flow',
    ) ||
    !capabilitiesPage.must_not_show?.includes('silent mutation of manual or third-party Skills and Plugins') ||
    !capabilitiesPage.must_not_show?.includes('voice input configuration on Preferences or Advanced')
  ) {
    throw new Error('Capabilities page must separate OPL Flow dependency-closure capabilities from manual and third-party Skills/Plugins');
  }
  if (agentsPage.refresh_source !== 'opl app state --profile fast --json') {
    throw new Error('Agents page must refresh through opl app state --profile fast --json');
  }
  assertDeepEqualJson(
    guiAgentsPage?.official_profile_restore_action,
    appOwnedOfficialProfileRestoreAction,
    'App GUI Official Profile restore action',
  );
  assertDeepEqualJson(
    agentsPage.official_profile_restore_action,
    appOwnedOfficialProfileRestoreAction,
    'Agents page Official Profile restore action',
  );
  assertDeepEqualJson(
    settingsControlPlane.experience_contract?.page_contracts?.agents?.official_profile_restore_action,
    appOwnedOfficialProfileRestoreAction,
    'Settings experience Official Profile restore action',
  );
  if (
    !agentsPage.required_dom?.always?.includes(
      appOwnedOfficialProfileRestoreAction.required_dom_testid,
    ) ||
    !settingsControlPlane.experience_contract?.page_contracts?.agents?.surface_inventory?.action?.some(
      (entry) => entry.id === appOwnedOfficialProfileRestoreAction.id && entry.owner === 'agents',
    )
  ) {
    throw new Error('Settings Agents must expose Official Profile restore as an App-owned secondary action');
  }
  assertDeepEqualJson(
    agentsPage.developer_mode_control,
    guiAgentsPage?.developer_mode_control,
    'Agents Developer Mode control',
  );
  assertDeepEqualJson(
    agentsPage.codex_plugin_directory_target?.tab_contract,
    {
      surface_label_zh: '智能体',
      surface_label_en: 'Agents',
      tab_order: ['agents'],
      default_tab: 'agents',
      on_demand_tab_ids: [],
    },
    'Agents page package directory tab contract',
  );
  assertDeepEqualJson(
    agentsPage.codex_plugin_directory_target,
    guiAgentsPage?.codex_plugin_directory_target,
    'Agents package directory mirror of App GUI contract',
  );
  if (
    agentsPage.machine_source !==
    'opl app state --profile fast --json#app_state.agent_packages.directory.entries + app_state.agent_packages.status_index + app_state.runtime_source_carriers.items[]'
  ) {
    throw new Error('Agents page must read Package directory, fresh status including Home preferences, and active runtime sources only');
  }
  assertIncludesAll(
    agentsPage.state_sections,
    [
      'agent_packages.directory',
      'agent_packages.status_index',
      'runtime_source_carriers.items',
      'modules.items',
      'agent_packages.status_index.home_shortcut_preferences',
    ],
    'Agents page package state sections',
  );
  for (const forbiddenSection of ['modules', 'tools', 'operator.workbench.task_drilldowns']) {
    if (agentsPage.state_sections?.includes(forbiddenSection)) {
      throw new Error(`Agents page must not own redundant or Capabilities state section ${forbiddenSection}`);
    }
  }
  for (const forbiddenField of [
    'task_awareness_refs_source',
    'task_awareness_ref_fields',
    'task_awareness_ref_policy',
    'export_bundle_action_policy',
    'workflow_skill_candidate_policy',
    'builtin_skill_catalog_policy',
    'auto_injected_skills_policy',
    'capability_detail_presentation_policy',
    'package_directory_policy',
  ]) {
    if (Object.hasOwn(agentsPage, forbiddenField)) {
      throw new Error(`Agents page must not own Capabilities field ${forbiddenField}`);
    }
  }
  assertDeepEqualJson(
    agentsPage.current_runtime_projection_boundary,
    guiAgentsPage?.current_runtime_projection_boundary,
    'Agents page current runtime projection boundary',
  );
  if (
    Object.hasOwn(agentsPage.current_runtime_projection_boundary ?? {}, 'legacy_fallback_projection') ||
    agentsPage.current_runtime_projection_boundary?.canonical_directory_absent_policy !==
      'render loading, empty, last-good stale, or failed without synthesizing rows or actions from status_index, runtime_source_carriers, modules, Home shortcuts, or App metadata'
  ) {
    throw new Error('Agents must keep modules and Home shortcuts diagnostic-only when the canonical directory is unavailable');
  }
  assertDeepEqualJson(
    agentsPage.agent_package_lifecycle_ux,
    {
      contract_ref: 'contracts/app-gui-product-contract.json#pages.settings_agents.agent_package_lifecycle_ux',
      primary_state_surface: 'app_state.agent_packages.directory.entries + app_state.agent_packages.status_index',
      required_interactions: ['catalog', 'projected_actions'],
    },
    'Agents page Agent Package lifecycle authority reference',
  );
  assertDeepEqualJson(
    agentsPage.status_model,
    guiAgentsPage?.status_model,
    'Agents page status model',
  );
  if (agentsPage.status_model?.policy !== 'generic_package_status_projection') {
    throw new Error('Agents page must preserve the generic Package status projection');
  }
  assertDeepEqualJson(
    agentsPage.list_density_policy,
    guiAgentsPage?.list_density_policy,
    'Agents page list density policy',
  );
  if (agentsPage.list_density_policy?.row_identity_key !== 'package_id') {
    throw new Error('Agents rows must remain keyed by package identity');
  }

  if (
    capabilitiesPage.machine_source !== guiCapabilitiesPage?.state_source ||
    capabilitiesPage.refresh_source !== guiCapabilitiesPage?.refresh_source
  ) {
    throw new Error('Capabilities page must use the canonical lazy Skill and Plugin projection');
  }
  assertIncludesAll(
    capabilitiesPage.state_sections,
    [
      'agent_packages.status_index',
      'codex_skills',
      'codex_plugins',
      'shell_skill_plugin_registry',
      'shell_local_mcp_image_voice_configuration',
      'operator.workbench.task_drilldowns',
    ],
    'Capabilities page state sections',
  );
  if (
    capabilitiesPage.local_capability_configuration_source !==
      'AionUI local configuration#MCP servers + image generation + voice input' ||
    !capabilitiesPage.required_dom?.always?.includes('settings-capabilities-voice-input') ||
    !guiCapabilitiesPage?.entity_kinds?.includes('voice_input')
  ) {
    throw new Error('Capabilities page must own local MCP, image, and voice configuration with stable DOM');
  }
  if (capabilitiesPage.task_awareness_refs_source !== 'contracts/app-runtime-bridge.json#task_awareness_projection.settings_capabilities_surface') {
    throw new Error('Capabilities page must consume the App runtime bridge task-awareness Settings surface');
  }
  assertDeepEqualJson(
    capabilitiesPage.task_awareness_ref_fields,
    appOwnedTaskAwarenessRefFields,
    'Capabilities page task awareness ref fields',
  );
  if (
    capabilitiesPage.task_awareness_ref_policy !== 'thin_renderer_refs_only_no_skill_body_no_artifact_body_no_domain_verdict' ||
    capabilitiesPage.export_bundle_action_policy !== 'show_export_bundle_action_ref_and_dry_run_receipt_without_claiming_domain_export_readiness'
  ) {
    throw new Error('Capabilities page must keep task awareness refs display-only and export bundle actions dry-run/receipt bounded');
  }
  if (
    capabilitiesPage.workflow_skill_candidate_policy?.display_policy !==
      'settings_capabilities_report_first_candidate_refs_review_needs_changes_continue_in_conversation_no_auto_enable' ||
    capabilitiesPage.workflow_skill_candidate_policy?.auto_enable_allowed !== false ||
    capabilitiesPage.workflow_skill_candidate_policy?.skill_body_write_access !== false
  ) {
    throw new Error('Capabilities page must keep workflow/skill candidates report-first without auto-enabling or writing skill bodies');
  }
  assertDeepEqualJson(
    capabilitiesPage.builtin_skill_catalog_policy,
    guiCapabilitiesPage?.builtin_skill_catalog_policy,
    'Capabilities page built-in Skill catalog policy',
  );
  assertDeepEqualJson(
    capabilitiesPage.auto_injected_skills_policy,
    guiCapabilitiesPage?.auto_injected_skills_policy,
    'Capabilities page auto-injected Skill policy',
  );
  const skillScopeModel = capabilitiesPage.builtin_skill_catalog_policy?.scope_model;
  if (
    skillScopeModel?.global_user?.materialization !== '$CODEX_HOME/skills' ||
    skillScopeModel?.global_user?.workspace_injection !== 'forbidden' ||
    skillScopeModel?.domain_project?.workspace_injection !== 'explicit_owner_action_only' ||
    skillScopeModel?.aionui_builtin_cache?.workspace_injection !== 'forbidden' ||
    skillScopeModel?.aionui_builtin_cache?.ordinary_user_scope !== 'hidden'
  ) {
    throw new Error('Skill scope model must keep global user and explicit domain/project ownership separate from the AionUI cache');
  }
  if (
    capabilitiesPage.auto_injected_skills_policy?.workspace_materialization !== 'forbidden' ||
    capabilitiesPage.auto_injected_skills_policy?.ordinary_ui !== 'hidden'
  ) {
    throw new Error('AionUI auto-injected Skills must remain hidden diagnostics and cannot materialize into workspaces');
  }
  assertDeepEqualJson(
    capabilitiesPage.capability_detail_presentation_policy,
    expectedCapabilityDetailPresentationPolicy(),
    'Capabilities page detail presentation policy',
  );
  assertDeepEqualJson(
    capabilitiesPage.capability_detail_presentation_policy,
    guiCapabilitiesPage?.capability_detail_presentation_policy,
    'Capabilities page detail presentation mirror of App GUI contract',
  );
  for (const forbiddenField of [
    'developer_mode_control',
    'codex_plugin_directory_target',
    'current_runtime_projection_boundary',
    'agent_package_lifecycle_ux',
    'status_model',
    'list_density_policy',
  ]) {
    if (Object.hasOwn(capabilitiesPage, forbiddenField)) {
      throw new Error(`Capabilities page must not own Agents field ${forbiddenField}`);
    }
  }
}

function validateResourcesPage(matrix, guiContract) {
  const resourcesPage = pageById(matrix, 'settings_resources');
  assertDeepEqualJson(
    resourcesPage.action_behavior,
    appOwnedSettingsResourceActionBehavior,
    'Resources page action behavior',
  );
  assertDeepEqualJson(
    guiContract.pages?.settings_resources?.action_behavior,
    appOwnedSettingsResourceActionBehavior,
    'App GUI Resources action behavior',
  );
}

function expectedCapabilityDetailPresentationPolicy() {
  return {
    default_surface: 'desktop_right_side_panel_mobile_drawer',
    default_visible_fields: [
      'display_name',
      'entity_kind',
      'ownership_group',
      'source_label',
      'owner',
      'version',
      'currentness',
      'available_actions',
    ],
    source_label_policy:
      'render product-profile display names and user-language owners; raw provider ids stay in diagnostics',
    empty_field_policy:
      'hide empty unknown or unavailable values and explain a genuinely unavailable canonical source',
    advanced_diagnostics: {
      default_visibility: 'collapsed',
      fields: [
        'provider_id',
        'registry_path',
        'dependency_ref',
        'receipt_refs',
        'raw_refs_json',
      ],
    },
  };
}

function validateEnvironmentPage(matrix, guiContract) {
  const environmentPage = pageById(matrix, 'environment');
  if (environmentPage.module_path_source_policy_ref !== 'contracts/app-gui-product-contract.json#module_path_source_policy') {
    throw new Error('Environment page must reference the App GUI module path source policy');
  }
  if (
    !environmentPage.must_show?.includes(
      'check, apply, repair, rollback, and package maintenance directly on the daily Maintenance page with progressive confirmation and fresh readback',
    ) ||
    !environmentPage.must_show?.includes(
      'one advanced read-only diagnostics disclosure for localized component, path, and receipt evidence',
    ) ||
    !environmentPage.must_not_show?.includes(
      'a separate large management modal overlapping the advanced diagnostics disclosure',
    ) ||
    !environmentPage.must_not_show?.includes(
      'raw internal status keys, action ids, command mappings, or payload field names anywhere in user-facing Maintenance UI',
    )
  ) {
    throw new Error('Maintenance page must own daily actions and one read-only advanced diagnostics disclosure');
  }
  validateEnvironmentModuleMaintenanceEntry(environmentPage.module_maintenance_entry, 'Environment page');
  assertDeepEqualJson(
    environmentPage.managed_dependency_summary,
    appOwnedSettingsManagedDependencySummary,
    'Maintenance managed dependency summary',
  );
  assertDeepEqualJson(
    guiContract.pages?.settings_environment?.managed_dependency_summary,
    appOwnedSettingsManagedDependencySummary,
    'App GUI Maintenance managed dependency summary',
  );
  if (!environmentPage.must_not_show?.includes('Med Deep Scientist as a default module')) {
    throw new Error('Environment page must keep MDS out of default module display');
  }
  if (
    environmentPage.software_lifecycle_ref !==
    'contracts/app-release-channel.json#managed_update_plane.software_lifecycle'
  ) {
    throw new Error('Environment page must reference the App release three-object software lifecycle');
  }
  if (
    !environmentPage.must_show?.includes(
      'active Codex CLI, OPL-managed Temporal Runtime, and optional system Temporal CLI with version, source, currentness, and update guidance on the main Maintenance surface',
    ) ||
    !environmentPage.must_show?.includes(
      'Framework working paths inside the single read-only Maintenance diagnostics disclosure',
    ) ||
    environmentPage.managed_dependency_summary?.required_ids?.some((id) => id.includes('_'))
  ) {
    throw new Error('Maintenance must own managed dependency currentness and one read-only diagnostics disclosure');
  }
}

function validateAboutPage(matrix) {
  const aboutPage = pageById(matrix, 'about');
  if (!aboutPage.must_show?.includes('App release channel')) {
    throw new Error('About page must show the App release channel');
  }
  if (
    aboutPage.route_id !== 'about' ||
    aboutPage.route_scope !== 'secondary_or_deep_link' ||
    !aboutPage.must_show?.includes('cached update status from the one startup check or last manual check') ||
    !aboutPage.must_show?.includes('one Check for updates action') ||
    !aboutPage.must_not_show?.includes('about redirected to Advanced') ||
    aboutPage.updater_state_policy?.startup_check !== 'once_after_App_startup' ||
    aboutPage.updater_state_policy?.mount_check !== false ||
    aboutPage.updater_state_policy?.shared_state !== 'single_main_process_updater_state_store' ||
    aboutPage.updater_state_policy?.manual_check !== 'refresh_the_same_shared_state'
  ) {
    throw new Error('About page must remain independent with version, channel, and update status');
  }
}

function validateCompatibilityRedirectPages(matrix, guiContract) {
  const updatePage = pageById(matrix, 'update');
  const localServicesPage = pageById(matrix, 'settings_local_services');
  const personalizationPage = pageById(matrix, 'settings_personalization');
  assertDeepEqualJson(
    updatePage.compatibility_redirect,
    appOwnedSettingsCompatibilityRedirects.update,
    'Update compatibility redirect',
  );
  assertDeepEqualJson(
    localServicesPage.compatibility_redirect,
    appOwnedSettingsCompatibilityRedirects['local-services'],
    'Local Services compatibility redirect',
  );
  assertDeepEqualJson(
    personalizationPage.compatibility_redirect,
    appOwnedSettingsCompatibilityRedirects.personalization,
    'Personalization compatibility redirect',
  );
  assertDeepEqualJson(
    matrix.settings_compatibility_redirects,
    appOwnedSettingsCompatibilityRedirects,
    'Page-state compatibility redirect map',
  );
  assertDeepEqualJson(
    guiContract.settings_navigation.compatibility_redirects,
    appOwnedSettingsCompatibilityRedirects,
    'GUI compatibility redirect map',
  );
}

function validateSettingsThemePage(matrix) {
  const settingsThemePage = pageById(matrix, 'settings_theme');
  if (
    settingsThemePage.route_id !== 'appearance' ||
    settingsThemePage.route_scope !== 'ordinary' ||
    settingsThemePage.product_page_id !== 'preferences'
  ) {
    throw new Error('Settings Preferences must use the ordinary appearance carrier route');
  }
  for (const signal of [
    'application behavior and notifications in a full-width group',
    'reply waiting time, idle-assistant release, and hardware acceleration in a named performance and background activity group',
    'tray and close-window behavior',
    'System, Light, and Dark appearance choices under the display anchor',
  ]) {
    if (!settingsThemePage.must_show?.includes(signal)) {
      throw new Error(`Settings Preferences page must show ${signal}`);
    }
  }
  for (const signal of [
    'CSS theme preset gallery or Codex preset selector',
    'custom theme editor in the ordinary Preferences surface',
  ]) {
    if (!settingsThemePage.must_not_show?.includes(signal)) {
      throw new Error(`Settings Preferences page must not show ${signal}`);
    }
  }
}

function validateSettingsPageExperience(matrix) {
  const experience = settingsControlPlane.experience_contract;
  for (const [productPageId, contract] of Object.entries(experience.page_contracts ?? {})) {
    const page = pageById(matrix, contract.matrix_page_id);
    const expectedTechnicalDetailsDefault = appOwnedSettingsTechnicalDetailsDefault[productPageId];
    if (
      page.product_page_id !== productPageId ||
      page.experience_contract_ref !==
        `contracts/app-settings-control-plane.json#experience_contract.page_contracts.${productPageId}` ||
      page.primary_action_id !== contract.primary_action.id ||
      page.technical_details_default !== expectedTechnicalDetailsDefault ||
      page.exception_emphasis !== 'attention_only'
    ) {
      throw new Error(`${contract.matrix_page_id} must mirror the ${productPageId} experience contract`);
    }
    assertDeepEqualJson(page.required_dom, contract.required_dom, `${productPageId} required DOM`);
    assertDeepEqualJson(page.required_anchors, contract.required_anchors, `${productPageId} required anchors`);
    assertDeepEqualJson(page.search_entry_ids, contract.search_entry_ids, `${productPageId} search entries`);
  }
}
