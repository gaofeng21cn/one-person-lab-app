import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';
import { assertNonEmptyStringArray } from '../shared-contract-validators.ts';
import {
  appOwnedSettingsCapabilitiesTabContract,
  appOwnedSettingsManagedDependencySummary,
  appOwnedSettingsResourceActionBehavior,
  appOwnedSettingsResourcesBrowserEntry,
} from '../app-contract-constants.ts';
import { settingsControlPlane } from './context.ts';
import { appOwnedOfficialProfileRestoreAction } from './actions.ts';
import { validateAgentPackageLifecycleUx } from './lifecycle.ts';
import { validateOplFlowContext } from '../shared-contract-validators.ts';

export function validateGuiContractSettingsAccessAndAgents(guiContract) {
  const pages = guiContract.pages ?? {};
  for (const [pageId, page] of Object.entries(pages).filter(([id]) => id === 'about' || id === 'update' || id.startsWith('settings_'))) {
    assertNonEmptyStringArray(page.sections, `App GUI ${pageId} sections`);
    assertNonEmptyStringArray(page.must_show, `App GUI ${pageId} must_show`);
    assertNonEmptyStringArray(page.must_not_show, `App GUI ${pageId} must_not_show`);
  }
  const settingsExperiencePages = {
    settings_general: 'overview',
    settings_gateway: 'gateway',
    settings_access: 'models',
    settings_workspace: 'workspace',
    settings_agents: 'agents',
    settings_capabilities: 'capabilities',
    settings_resources: 'resources',
    settings_environment: 'maintenance',
    settings_storage: 'storage',
    settings_theme: 'preferences',
    about: 'about',
  };
  for (const [pageId, productPageId] of Object.entries(settingsExperiencePages)) {
    if (
      pages[pageId]?.product_page_id !== productPageId ||
      pages[pageId]?.experience_contract_ref !==
        `contracts/app-settings-control-plane.json#experience_contract.page_contracts.${productPageId}`
    ) {
      throw new Error(`App GUI ${pageId} must reference the ${productPageId} experience contract`);
    }
  }
  assertDeepEqualJson(
    pages.settings_environment.managed_dependency_summary,
    appOwnedSettingsManagedDependencySummary,
    'App GUI Maintenance managed dependency summary',
  );
  if (pages.settings_access.model_access_source !== 'app_state.core.codex.model_access_source') {
    throw new Error('Settings Access must use app_state.core.codex.model_access_source');
  }
  const gatewayAccount = pages.settings_gateway.opl_gateway_account;
  if (
    gatewayAccount?.projection_ref !== 'contracts/app-runtime-bridge.json#opl_gateway_account_projection' ||
    gatewayAccount.projection_path !== 'app_state.settings_control_center.app_settings_read_model.opl_gateway_account' ||
    gatewayAccount.secret_bridge_ref !== 'contracts/app-runtime-bridge.json#opl_gateway_account_secret_bridge' ||
    gatewayAccount.account_card_visibility !== 'account_connection_only' ||
    gatewayAccount.manual_api_key_card_policy !== 'model_access_status_only_no_account_balance_or_account_usage' ||
    gatewayAccount.cache_ttl_seconds !== 900 ||
    gatewayAccount.stale_policy !== 'show_cached_values_with_stale_marker_and_manual_refresh' ||
    gatewayAccount.first_run_scope !== 'gateway_account_default_desktop_and_webui_with_manual_api_key_compatibility' ||
    gatewayAccount.personal_profile_navigation !== 'not_added'
  ) {
    throw new Error('Settings Account & Access must declare the canonical OPL Gateway account product contract');
  }
  assertDeepEqualJson(gatewayAccount.access_paths, ['account_login', 'manual_api_key'], 'Settings Gateway access paths');
  assertDeepEqualJson(
    gatewayAccount.error_states,
    ['auth_expired', 'managed_key_missing', 'managed_key_conflict', 'managed_key_identity_drift', 'disconnect_pending'],
    'Settings Gateway visible repair states',
  );
  assertIncludesAll(
    pages.settings_gateway.must_not_show,
    [
      'password, access token, refresh token, API Key material, remote Key id, credential path, raw response, or raw error',
      'Gateway account card in manual API-key mode or when no Gateway account is connected',
    ],
    'Settings Gateway privacy and visibility boundaries',
  );
  assertIncludesAll(
    pages.settings_access.must_show,
    ['page label Models or 模型', 'selected and default model', 'one route to Account & Access when credentials need attention'],
    'Settings Models user entry contract',
  );
  assertIncludesAll(
    pages.settings_access.must_not_show,
    ['Gateway account card, balance, usage, login form, managed Key lifecycle, or manual API-key form'],
    'Settings Models Gateway deduplication boundary',
  );
  if (pages.settings_access.browser_access_entry !== undefined) {
    throw new Error('Settings Models must not own browser access');
  }
  assertDeepEqualJson(
    pages.settings_resources.browser_access_entry,
    appOwnedSettingsResourcesBrowserEntry,
    'Settings Resources browser entry',
  );
  assertIncludesAll(
    pages.settings_resources.must_show,
    [
      'browser access to this computer with port, account, and password management entry',
      'resource readiness and action executability as separate states',
    ],
    'Settings Resources readiness boundary',
  );
  assertIncludesAll(
    pages.settings_resources.must_not_show,
    [
      'selected local workspace path, change-workspace controls, or permission summary duplicated from Workspace',
      'built-in OPL Gateway connection or Gateway count owned by Account & Access',
      'dry-run success presented as resource opened, diagnosis completed, deployment completed, or mutation completed',
    ],
    'Settings Resources Workspace deduplication',
  );
  assertDeepEqualJson(
    pages.settings_resources.action_behavior,
    appOwnedSettingsResourceActionBehavior,
    'Settings Resources action behavior',
  );
  assertDeepEqualJson(
    pages.settings_capabilities.tab_contract,
    appOwnedSettingsCapabilitiesTabContract,
    'Settings Capabilities source-group tab contract',
  );
  assertDeepEqualJson(
    pages.settings_capabilities.entity_kinds,
    [
      'capability_package',
      'skill',
      'plugin',
      'mcp_server',
      'connection_application',
      'image_generation',
      'voice_input',
    ],
    'Settings Capabilities entity kinds',
  );
  if (
    pages.settings_capabilities.lifecycle_policy?.hardcoded_app_skill_list_allowed !== false ||
    pages.settings_capabilities.lifecycle_policy?.cli_currentness_owner !== 'opl_base' ||
    pages.settings_capabilities.lifecycle_policy?.flow_role !== 'dependency_and_profile_intent_only_not_a_second_updater'
  ) {
    throw new Error('Settings Capabilities must derive Flow membership from package closure and leave CLI currentness to OPL Base');
  }
  const agentDirectoryTarget = pages.settings_agents.codex_plugin_directory_target;
  const agentStatusModel = pages.settings_agents.status_model;
  assertDeepEqualJson(
    pages.settings_agents.brand_identity_policy,
    {
      source_fields: ['official', 'publisher'],
      opl_official: true,
      opl_publisher: 'one-person-lab',
      match_policy: 'official_equals_true_or_publisher_equals_one-person-lab',
      row_presentation: 'compact OPL brand badge immediately after the localized display name on every matching row',
      scope_policy:
        'all package roles; the badge remains visible whenever its matching row is visible under any source filter',
      catalog_group_order: ['opl_managed', 'other_agents', 'other_capabilities'],
      grouping_policy:
        'classify every projected row dynamically by OPL ownership and package role; render the OPL-managed group before non-OPL agents and capabilities without a package-id allowlist',
      standard_agent_name_policy:
        'the owner projects the invariant English brand name for every locale; the App and Shell never translate or replace that brand name',
      description_policy:
        'select the owner-projected description for the active UI locale with the owner default as fallback',
      managed_update_policy: {
        ordinary_install_source: 'per-Package owner latest-stable channel through the native carrier adapter',
        ordinary_auto_update_projection:
          'source_explanation.effective_source_policy.package_channel_auto_update=true',
        scope: 'all OPL-managed Agent, workflow, and capability Packages',
        developer_override:
          'an active trusted developer checkout remains authoritative and projects package_channel_auto_update=false so automatic updates never overwrite developer bytes',
        ui_inference_forbidden: true,
      },
      third_party_policy: 'do not show the OPL brand badge',
    },
    'Settings Agents OPL brand identity policy',
  );
  assertDeepEqualJson(
    pages.settings_agents.official_profile_restore_action,
    appOwnedOfficialProfileRestoreAction,
    'Settings Agents Official Profile restore action',
  );
  assertDeepEqualJson(
    settingsControlPlane.experience_contract?.page_contracts?.agents?.official_profile_restore_action,
    appOwnedOfficialProfileRestoreAction,
    'Settings Agents experience Official Profile restore action',
  );
  if (
    agentDirectoryTarget?.primary_layout !==
      'compact_grouped_package_list_with_inline_dependency_children_and_right_details_panel' ||
    agentDirectoryTarget?.catalog_presentation_policy_ref !==
      'contracts/app-product-profile.json#gui.agent_package_registry.catalog_presentation_policy' ||
    agentDirectoryTarget?.developer_configuration_disclosure !==
      'collapsed_by_default_above_the_catalog' ||
    pages.settings_agents.list_density_policy?.grouping_policy_ref !==
      'contracts/app-product-profile.json#gui.agent_package_registry.catalog_presentation_policy' ||
    pages.settings_agents.list_density_policy?.brand_identity_policy_ref !==
      'contracts/app-gui-product-contract.json#pages.settings_agents.brand_identity_policy' ||
    pages.settings_agents.list_density_policy?.row_hierarchy_policy !==
      'one_projected_package_one_row_with_single_parent_dependencies_nested_and_capability_packages_grouped' ||
    agentStatusModel?.user_facing_projection_ref !==
      'contracts/app-gui-product-contract.json#pages.settings_agents.agent_package_lifecycle_ux.user_facing_status_projection' ||
    agentStatusModel?.localized_metadata_source_ref !== 'app_state.agent_packages.directory.entries' ||
    pages.settings_agents.developer_mode_control?.default_disclosure !== 'collapsed'
  ) {
    throw new Error('Settings Agents must use the App-owned grouped catalog presentation with collapsed developer controls');
  }
  assertIncludesAll(
    pages.settings_agents.must_show,
    [
      'localized package role labels with no raw internal enum on the ordinary row',
      'professional Agents ordered by Home shortcut preference then localized display name, workflow profiles separated, and dependency packages grouped from dependent_guard.required_by_package_ids',
      'runtime source and authorized repository maintenance controls collapsed as advanced configuration by default',
      'owner-projected localized names and descriptions for every Package directory item, including unknown future Agents',
      'an OPL-managed group before other Agents and capabilities, with a compact OPL brand badge on every OPL-owned row and no Package-id allowlist',
      'locale-invariant English brand names for OPL standard Agents and owner-localized descriptions selected by the active UI locale',
      'owner latest-stable automatic updates for every ordinarily managed OPL Agent, workflow, and capability Package while trusted Developer Mode checkouts remain non-overwritten',
      'verification deferred or scope materialization missing on an installed exposed Agent shown as 可用 with no preflight Settings action; domain StageRun readiness stays Framework-owned',
      'one localized status, one concrete explanation, and at most one most relevant action per package with technical status axes confined to details',
    ],
    'Settings Agents grouped catalog signals',
  );
  assertIncludesAll(
    pages.settings_agents.must_not_show,
    [
      'hardcoded package parent-child relationships or duplicate dependency rows',
      'raw setup_required, local_check_not_completed, verification_deferred, scope_materialization_missing, 待验证, 需关注, 不可使用, or contradictory availability labels on ordinary Agent rows',
      'Shell-inferred Package activation, workspace targeting, or private lifecycle action ids',
      'scope materialization missing presented as a Settings attention state or preflight action',
      'aggregate ready or unavailable counts used as the status of every package',
    ],
    'Settings Agents forbidden dependency synthesis',
  );
  validateAgentPackageLifecycleUx(
    pages.settings_agents.agent_package_lifecycle_ux,
    'Settings Agents Agent Package lifecycle UX',
  );
  validateOplFlowContext(guiContract.opl_flow_context, 'App GUI OPL Flow Context');
  const additionalInstructions = guiContract.new_conversation_additional_instructions;
  if (
    additionalInstructions?.content_owner !== 'user' ||
    additionalInstructions.delivery !== 'new_conversation_additional_instructions_only' ||
    additionalInstructions.storage_key !== 'codex.oplAppSessionContextAdditional' ||
    additionalInstructions.storage_key_status !== 'legacy_compatibility_storage_key' ||
    additionalInstructions.generated_base_context_allowed !== false ||
    additionalInstructions.agent_route_fallback_allowed !== false ||
    additionalInstructions.empty_value_policy !== 'inject_nothing' ||
    additionalInstructions.reset_behavior !== 'clear_additional_instructions' ||
    additionalInstructions.effect !== 'next_new_conversation' ||
    Object.prototype.hasOwnProperty.call(guiContract, 'opl_app_session_context')
  ) {
    throw new Error('App GUI must limit new-conversation additions to optional user-authored text');
  }
  if (
    pages.settings_workspace?.ia_group !== 'workspace' ||
    !pages.settings_workspace.sections?.includes('system_agents') ||
    !pages.settings_workspace.sections?.includes('new_conversation_additional_instructions') ||
    !pages.settings_workspace.must_show?.includes(
      'Workspace as a top-level Settings group with Working Directory and Data & Storage destinations',
    ) ||
    !pages.settings_workspace.must_show?.includes(
      'content-width responsive single-column rows when the Settings reading lane is narrow',
    ) ||
    !pages.settings_workspace.must_show?.includes('Codex instruction editors use unframed field groups without nested cards') ||
    !pages.settings_workspace.must_not_show?.includes('App log directory controls owned by Logs & Diagnostics') ||
    !pages.settings_workspace.must_not_show?.includes('System AGENTS.md or new-conversation instructions presented as Workspace children') ||
    !pages.settings_workspace.must_not_show?.includes('App log directory presented as a Workspace child') ||
    !pages.settings_workspace.must_not_show?.includes('Framework and raw paths duplicated from Maintenance diagnostics')
  ) {
    throw new Error('Settings Workspace must retain carrier transport while exposing only working directory and data storage as Workspace children');
  }
}
