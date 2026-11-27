import { assertDeepEqualJson, assertIncludesAll, readJson } from './assertions.ts';
import {
  appOwnedSettingsResourcesBrowserEntry,
  appOwnedSettingsManagedDependencySummary,
  appOwnedSettingsResourceActionBehavior,
  appOwnedSettingsTechnicalDetailsDefault,
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
  app_management: 'app_management',
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

  assertDeepEqualJson(pageById(matrix, 'settings_resources').active_studio_presentation, guiContract.pages.settings_resources.active_studio_presentation, 'Shared resources settings route');

  const applicationManagementPage = pageById(matrix, 'app_management');
  const applicationManagementContract = guiContract.pages.app_management;
  for (const field of [
    'machine_source',
    'projection_owner',
    'route',
    'route_scope',
    'section_query_parameter',
    'default_section',
    'primary_sections',
    'experience_policy',
    'environment_scope',
    'required_state_axes',
    'action_source',
    'fresh_readback_required',
    'official_ui_reuse',
    'shared_resource_policy',
    'resource_presentation',
    'legacy_settings_routes',
    'legacy_route_policy',
    'provenance_sources',
    'section_sources',
    'shared_resource_management',
    'software_catalog_policy',
    'package_installation_policy',
    'framework_base_component',
    'software_source_management',
    'state_feedback_policy',
    'settings_integration',
    'required_ui',
    'must_not_own',
  ]) {
    assertDeepEqualJson(applicationManagementPage[field], applicationManagementContract[field], `app_management ${field}`);
  }
  assertDeepEqualJson(applicationManagementPage.framework_base_component, {
    source: 'app_state.managed_update.components[component_id=opl_base]',
    version_source: 'current.installed_version',
    available_actions: [],
  }, 'app_management read-only Framework Base component');
  assertDeepEqualJson(applicationManagementPage.software_source_management?.public_catalog, {
    source_id: 'public-registry:opl',
    available_actions: ['source_refresh'],
  }, 'app_management public catalog');
  const officialUiReuse = applicationManagementContract.official_ui_reuse;
  if (
    officialUiReuse?.page_identity !== '软件中心' ||
    officialUiReuse?.upstream_ref !== '4b399c39a6d1479cd84ca591b4d7c88e24d38a96' ||
    officialUiReuse?.upstream_page !== 'deepseek-harness/packages/client/ui-plugin-manager/src/client/PluginManagerPage.tsx' ||
    !officialUiReuse?.opl_adapter_boundary?.includes('Framework package projection') ||
    !officialUiReuse?.opl_adapter_boundary?.includes('fresh readback') ||
    !officialUiReuse?.forbidden_authorities?.includes('DSH pluginManager apply/controller') ||
    !officialUiReuse?.forbidden_authorities?.includes('DSH profile or pnpm plugin lifecycle')
  ) {
    throw new Error('app_management must reuse the pinned DSH PluginManager page while preserving Framework Package ownership');
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

  validateCapabilitiesPage(matrix, guiContract);
  validateResourcesPage(matrix, guiContract);
  validateEnvironmentPage(matrix, guiContract);
  validateAboutPage(matrix);
  assertDeepEqualJson(
    guiContract.settings_navigation.compatibility_redirects,
    matrix.settings_compatibility_redirects,
    'GUI compatibility redirect map',
  );
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
      'Shell-local Skills, Plugins, MCP helpers, image generation, and voice input inside local or third-party ownership instead of OPL Flow',
    ) ||
    !capabilitiesPage.must_show?.includes(
      'OPL-managed default companions with installed, registered, enabled, permission, ready, version, and owner-projected action status',
    ) ||
    !capabilitiesPage.must_not_show?.includes('Studio native Computer Use classified as a manual or third-party capability') ||
    !capabilitiesPage.must_not_show?.includes('silent mutation of manual or third-party Skills and Plugins') ||
    !capabilitiesPage.must_not_show?.includes('voice input configuration on Preferences or Advanced')
  ) {
    throw new Error('Capabilities page must separate OPL Flow dependency-closure capabilities from manual and third-party Skills/Plugins');
  }
  if (agentsPage.refresh_source !== 'opl app state --profile fast --json') {
    throw new Error('Agents page must refresh through opl app state --profile fast --json');
  }
  const profileRestore = agentsPage.official_profile_restore_action;
  assertDeepEqualJson(
    profileRestore,
    guiAgentsPage?.official_profile_restore_action,
    'Agents page Official Profile restore action',
  );
  assertDeepEqualJson(
    profileRestore,
    settingsControlPlane.experience_contract?.page_contracts?.agents?.official_profile_restore_action,
    'Settings experience Official Profile restore action',
  );
  assertDeepEqualJson(
    profileRestore,
    appOwnedOfficialProfileRestoreAction,
    'App GUI Official Profile restore action',
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
  if (agentsPage.status_model?.policy !== 'software_management_status_with_readiness_details') {
    throw new Error('Agents page must preserve the software management status projection with readiness in details');
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
      'Shell local configuration#MCP servers + image generation + voice input' ||
    !capabilitiesPage.required_dom?.conditional?.some((entry) => entry.testid === 'settings-capabilities-voice-input' && entry.when === 'image_voice_tab_active') ||
    !guiCapabilitiesPage?.entity_kinds?.includes('voice_input')
  ) {
    throw new Error('Capabilities page must own local MCP, image, and voice configuration with stable DOM');
  }
  if (capabilitiesPage.task_awareness_refs_source !== 'contracts/app-runtime-bridge.json#task_awareness_projection.settings_capabilities_surface') {
    throw new Error('Capabilities page must consume the App runtime bridge task-awareness Settings surface');
  }
  assertIncludesAll(
    capabilitiesPage.task_awareness_ref_fields,
    ['capability_health_refs', 'workflow_refs', 'export_bundle_action_ref', 'candidate_report_refs', 'workflow_skill_candidate_refs'],
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
    skillScopeModel?.domain_project?.workspace_injection !== 'explicit_owner_action_only'
  ) {
    throw new Error('Skill scope model must keep global user and explicit domain/project ownership separate');
  }
  if (
    capabilitiesPage.auto_injected_skills_policy?.workspace_materialization !== 'forbidden' ||
    capabilitiesPage.auto_injected_skills_policy?.ordinary_ui !== 'hidden'
  ) {
    throw new Error('Shell auto-injected Skills must remain hidden diagnostics and cannot materialize into workspaces');
  }
  const detailPolicy = capabilitiesPage.capability_detail_presentation_policy;
  if (
    detailPolicy?.default_surface !== 'desktop_right_side_panel_mobile_drawer' ||
    detailPolicy?.advanced_diagnostics?.default_visibility !== 'collapsed'
  ) {
    throw new Error('Capabilities page detail presentation policy must keep right panel / mobile drawer with collapsed advanced diagnostics');
  }
  assertIncludesAll(
    detailPolicy.default_visible_fields,
    ['display_name', 'entity_kind', 'ownership_group', 'owner', 'version', 'currentness', 'available_actions'],
    'Capabilities page detail presentation visible fields',
  );
  assertIncludesAll(
    detailPolicy.advanced_diagnostics?.fields,
    ['provider_id', 'registry_path', 'raw_refs_json'],
    'Capabilities page detail presentation advanced diagnostic fields',
  );
  assertDeepEqualJson(
    detailPolicy,
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
  const guiResources = guiContract.pages.settings_resources;
  assertDeepEqualJson(
    resourcesPage.browser_access_entry,
    guiResources.browser_access_entry,
    'Resources page browser entry',
  );
  assertDeepEqualJson(
    guiResources.browser_access_entry,
    appOwnedSettingsResourcesBrowserEntry,
    'App GUI Resources browser entry',
  );
  if (!resourcesPage.required_dom?.always?.includes('settings-resources-browser-access')) {
    throw new Error('Resources & Connections must preserve browser access to this computer');
  }
  const resourcesExperience = settingsControlPlane.experience_contract.page_contracts.resources;
  const authorization = resourcesExperience.connection_authorization;
  assertDeepEqualJson(
    guiResources.connection_authorization,
    authorization,
    'App GUI Resources connection authorization',
  );
  if (
    authorization?.source !== 'settings_control_center.app_settings_read_model.connections.authorization' ||
    authorization?.approval_bridge_ref !== 'contracts/app-runtime-bridge.json#connection_access_approval_bridge' ||
    authorization?.approval_policy !== 'pending_request_requires_dedicated_trusted_app_user_bridge_after_fresh_projection; never_generic_action_or_model_callable' ||
    authorization?.invocation_limit !== 20 ||
    authorization?.approval_action_id_in_generic_action_catalog !== false
  ) {
    throw new Error('Resources connection authorization must use the owner projection, bounded redacted history, and dedicated user approval bridge');
  }
  assertDeepEqualJson(
    authorization?.ordinary_owner_action_ids,
    ['connection_access_request_deny', 'connection_grant_revoke', 'connection_relay_import'],
    'Resources connection authorization ordinary owner actions',
  );
  assertDeepEqualJson(
    resourcesPage.state_sections?.includes('settings_control_center.app_settings_read_model.connections.authorization'),
    true,
    'Resources connection authorization state source',
  );
  assertDeepEqualJson(
    resourcesPage.action_behavior,
    guiResources.action_behavior,
    'Resources page action behavior',
  );
  assertDeepEqualJson(
    guiResources.action_behavior,
    appOwnedSettingsResourceActionBehavior,
    'App GUI Resources action behavior',
  );
  const remoteCompanion = resourcesPage.remote_companion_access;
  if (
    remoteCompanion?.source !== 'framework_projected_remote_companion_connector_route' ||
    remoteCompanion?.source_by_renderer?.opl_studio !== 'app_state.ui_contributions.slots.settings.section' ||
    remoteCompanion?.standard_view_type !== 'remote_companion_access' ||
    remoteCompanion?.standard_view_schema_ref !== 'contracts/opl-app-contributions.schema.json#/$defs/remote_companion_access_result' ||
    remoteCompanion?.single_active_provider_path_per_renderer_required !== true ||
    remoteCompanion?.transport_binding_projection_ref !== 'contracts/app-runtime-bridge.json#canonical_conversation_continuity_policy.transport_binding_projection' ||
    typeof remoteCompanion?.provider_absent_policy !== 'string' ||
    remoteCompanion.provider_absent_policy.length === 0 ||
    remoteCompanion?.secret_boundary?.qr_payload_only_in_status !== 'qr_ready' ||
    remoteCompanion?.secret_boundary?.qr_payload_max_length !== 8192 ||
    remoteCompanion?.navigation_policy?.return_to_app !== 'use_settings_return_to_app_action'
  ) {
    throw new Error('Resources page remote companion access contribution must keep single-active-provider routing and transient secret boundaries');
  }
  assertIncludesAll(remoteCompanion.status_values, ['unavailable', 'unpaired', 'qr_ready', 'awaiting_confirmation', 'active', 'attention'], 'Resources page remote companion statuses');
  assertIncludesAll(remoteCompanion.ordinary_controls, ['pair.start', 'pair.refresh', 'pair.confirm', 'pair.cancel', 'device.rename', 'pair.revoke'], 'Resources page remote companion ordinary controls');
  assertIncludesAll(remoteCompanion.forbidden_controls, ['agent_selector', 'model_selector', 'claim_secret_or_claim_material'], 'Resources page remote companion forbidden controls');
  assertIncludesAll(remoteCompanion.secret_boundary?.never_cached_logged_or_returned_by_app_action, ['invitation_code', 'manual_code', 'qr_payload', 'claim_secret', 'claim_material'], 'Resources page remote companion secret boundary');
  assertIncludesAll(
    resourcesPage.state_sections,
    ['ui_contributions.slots.settings.section', 'transport_bindings'],
    'Resources page remote channel state sections',
  );
  const { standard_view_schema_ref, ...sharedAccessPolicy } = resourcesPage.remote_companion_access;
  assertDeepEqualJson(
    guiResources.remote_companion_access,
    {
      ...sharedAccessPolicy,
      standard_view_contract_ref:
        'framework_surfaces.package_app_contributions.standard_view_contracts.remote_companion_access',
    },
    'App GUI Resources remote companion access contribution',
  );
}

function validateEnvironmentPage(matrix, guiContract) {
  const environmentPage = pageById(matrix, 'environment');
  assertDeepEqualJson(
    environmentPage.runway_service_health,
    guiContract.pages.settings_environment.runway_service_health,
    'Maintenance Runway health',
  );
  assertDeepEqualJson(
    pageById(matrix, 'settings_general').background_services_summary,
    guiContract.pages.settings_general.background_services_summary,
    'Overview Runway summary',
  );
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
    guiContract.pages?.settings_environment?.managed_dependency_summary,
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
