import { assertDeepEqualJson, assertIncludesAll } from "../assertions.ts";
import {
  appActionRoute,
  appOwnedSecondarySettingsPages,
  appOwnedSettingsResourcesBrowserEntry,
  appOwnedSettingsCompatibilityRedirects,
  appOwnedSettingsCardFields,
  appOwnedSettingsCapabilitiesTabContract,
  appOwnedSettingsConfirmationFields,
  appOwnedSettingsIaGroupIds,
  appOwnedSettingsIssueStatuses,
  appOwnedSettingsAboutUpdaterStatePolicy,
  appOwnedSettingsAppUpdateStatePolicy,
  appOwnedSettingsAppUpdateStatePolicyRef,
  appOwnedSettingsMakeUsableAllowedSteps,
  appOwnedSettingsMakeUsableForbiddenSteps,
  appOwnedSettingsManagedDependencySummary,
  appOwnedSettingsManagedUpdateRepairPolicy,
  appOwnedSettingsManagedUpdateRepairPolicyRef,
  appOwnedSettingsNavigationDestinationIds,
  appOwnedSettingsNavigationDestinationOwners,
  appOwnedSettingsNavigationGroupLabels,
  appOwnedSettingsProductSystemItemIds,
  appOwnedSettingsProductSystemTracks,
  appOwnedSettingsProjectionItemFields,
  appOwnedSettingsProjectionSectionIds,
  appOwnedSettingsPostUpdateNoticeFields,
  appOwnedSettingsPageExperienceFields,
  appOwnedSettingsPageAnchors,
  appOwnedSettingsPageSearchEntryIds,
  appOwnedSettingsProductPageIds,
  appOwnedSettingsResourceActionBehavior,
  appOwnedStorageCarrierBehavior,
  appOwnedWebuiDataVolumeHostActionAbiRef,
  appOwnedWebuiDataVolumeHostActionCapabilityId,
  appOwnedSettingsRouteScopes,
  appOwnedSettingsSearchEntryFields,
  appOwnedSettingsSearchProtocol,
  appOwnedSettingsTabs,
  appOwnedSettingsTaskEntryMetadataFields,
  appOwnedSettingsTechnicalDetailsDefault,
  appOwnedSettingsTopLevelEntryIds,
  appOwnedSettingsTopLevelLabels,
  appOwnedSettingsUpstreamIntakeClassifications,
  appOwnedSettingsTaskEntryIds,
  appOwnedSettingsVisualQaTargets,
  appOwnedSettingsVisualSystem,
  legacySettingsRouteRedirects,
} from "../app-contract-constants.ts";
import { validateSettingsCapabilitiesTaskAwarenessSurface } from "../shared-contract-validators.ts";

import {
  expectedAgentsPageAdapterStateSource,
  expectedConditionalResourceGroup,
  expectedConditionalResourceSection,
  expectedOptionalResourceProjectionPolicy,
} from "./constants.ts";
import {
  pageById,
} from "./shared.ts";

export function validateSettingsGatewayAccountBoundary(controlPlane, gatewayAdapter) {
  const gatewaySource = 'app_state.settings_control_center.app_settings_read_model.opl_gateway_account';
  const gatewayRoute = (controlPlane.ordinary_routes ?? []).find((route) => route.id === 'gateway');
  if (!String(gatewayRoute?.state_source ?? '').includes(gatewaySource)) {
    throw new Error('Settings Gateway route must consume the canonical Gateway account read model path');
  }
  if (
    gatewayAdapter?.opl_gateway_account_source !== gatewaySource ||
    gatewayAdapter.opl_gateway_account_projection_ref !== 'contracts/app-runtime-bridge.json#opl_gateway_account_projection' ||
    gatewayAdapter.opl_gateway_account_secret_bridge_ref !== 'contracts/app-runtime-bridge.json#opl_gateway_account_secret_bridge' ||
    gatewayAdapter.secret_boundary !==
      'account_password_only_through_runtime_provider_and_dedicated_stdin_never_generic_action_payload' ||
    gatewayAdapter.webui_boundary !== 'gateway_account_and_manual_api_key_via_existing_runtime_http_proxy'
  ) {
    throw new Error('Settings Gateway adapter must preserve the Gateway account projection and secret bridge boundaries');
  }
  const surface = controlPlane.experience_contract?.page_contracts?.gateway?.gateway_account_surface;
  if (
    surface?.projection_path !== gatewaySource ||
    surface.projection_ref !== 'contracts/app-runtime-bridge.json#opl_gateway_account_projection' ||
    surface.secret_bridge_ref !== 'contracts/app-runtime-bridge.json#opl_gateway_account_secret_bridge' ||
    surface.account_card_visibility !== 'account_connection_only' ||
    surface.ttl_seconds !== 900 ||
    surface.webui_password_login_allowed !== true ||
    surface.generic_action_secret_payload_allowed !== false
  ) {
    throw new Error('Settings Gateway experience must keep account visibility, TTL, WebUI, and secret rules');
  }
  assertDeepEqualJson(surface.access_paths, ['account_login', 'manual_api_key'], 'Settings Gateway access paths');
  assertDeepEqualJson(
    surface.account_card_fields,
    [
      'account.display_name',
      'account.email',
      'account.balance',
      'usage.today_tokens',
      'usage.today_actual_cost',
      'usage.total_tokens',
      'usage.total_actual_cost',
      'managed_key.name',
      'managed_key.status',
      'freshness.observed_at',
      'freshness.stale',
    ],
    'Settings Gateway account card fields',
  );
}

export function validateSettingsAgentsDirectoryProjection(agentsPage) {
  if (agentsPage?.state_source !== expectedAgentsPageAdapterStateSource) {
    throw new Error(
      "Settings Agents page adapter must read from canonical agent_packages and runtime source projections",
    );
  }
  const directory = agentsPage?.directory_projection_surface;
  if (!directory || typeof directory !== "object") {
    throw new Error(
      "Settings Agents page adapter must declare a directory projection surface",
    );
  }
  if (
    directory.surface !== "settings_agents" ||
    directory.primary_identity !== "public_agent_package_directory_entries" ||
    directory.purpose_role !== "secondary_tag_filter_only" ||
    directory.home_shortcut_integration !==
      "visibility_and_order_controls_in_software_details"
  ) {
    throw new Error(
      "Settings Agents directory projection must be software-directory first with Home shortcuts in details",
    );
  }
  if (
    directory.canonical_projection !==
      "opl app state --profile fast --json#app_state.agent_packages.directory.entries + app_state.agent_packages.status_index + app_state.runtime_source_carriers.items[]" ||
    directory.directory_collection_source !==
      "app_state.agent_packages.directory.entries" ||
    typeof directory.directory_collection_policy !== "string" ||
    !Array.isArray(directory.visible_software_types) ||
    directory.visible_software_types.length !== 1 ||
    directory.visible_software_types[0] !== "agent" ||
    directory.other_software_type_destination !== "app_management" ||
    directory.app_owned_package_id_allowlist_allowed !== false ||
    directory.display_metadata_source !==
      "app_state.agent_packages.directory.entries" ||
    directory.display_metadata_policy !==
      "use owner-projected display metadata with a package-id fallback; App profile metadata must not define catalog membership, ordering, status, readiness, or actions" ||
    directory.runtime_source_projection !==
      "opl app state --profile fast --json#app_state.runtime_source_carriers.items[]" ||
    directory.source_semantics_policy !==
      "directory entries own catalog membership, presentation, installed or present state, callability, readiness, recommended_action_ref, and exact available_actions; status_index and fresh carrier readback add package-id-keyed presence, dependent guard, capability exposure, runtime-source readiness, and status-read diagnostics but cannot override directory lifecycle, readiness, or exact actions; the shell infers none of them" ||
    directory.diagnostic_enrichment_projection !==
      "opl app state --profile fast --json#app_state.agent_packages.status_index + app_state.runtime_source_carriers.items[] + app_state.modules.items[]" ||
    Object.hasOwn(directory, "legacy_fallback_projection")
  ) {
    throw new Error(
      "Settings Agents directory projection must record canonical directory authority and diagnostic-only enrichment without a legacy collection fallback",
    );
  }
  if (
    directory.normalization_policy !==
      "shell uses directory.entries as the only manageable collection, joins optional fresh diagnostics by canonical package_id, and keeps directory lifecycle, presence, callability, readiness, and actions authoritative on overlap" ||
    directory.canonical_directory_absent_policy !==
      "render loading, empty, last-good stale, or failed without synthesizing rows or actions from status_index, runtime_source_carriers, modules, Home shortcuts, or App metadata" ||
    directory.runtime_carrier_failure_policy !==
      "fresh carrier failure projects package-local attention_needed and launch_blocked without changing catalog membership or blocking unrelated packages" ||
    directory.catalog_interaction_contract_ref !==
      "contracts/app-gui-product-contract.json#pages.settings_agents.agent_package_lifecycle_ux.directory_controls" ||
    directory.package_action_contract_ref !==
      "contracts/app-gui-product-contract.json#pages.settings_agents.agent_package_lifecycle_ux.canonical_action_contract" ||
    directory.settings_action_scope !== "owner_projected_settings_actions_only" ||
    directory.settings_action_inference_allowed !== false
  ) {
    throw new Error(
      "Settings Agents directory projection must execute only complete Framework-projected Settings actions",
    );
  }
  for (const forbiddenField of [
    "stage_runtime_activation_contract_ref",
    "settings_activation_execution_allowed",
    "new_conversation_activation_execution_allowed",
    "ordinary_send_activation_execution_allowed",
    "settings_target_workspace_source",
    "global_workspace_root_activation_target_allowed",
    "selected_session_directory_activation_target_allowed",
    "scope_inference_allowed",
    "session_launch_authority",
    "stage_runtime_activation_owner",
    "stage_runtime_workspace_locator_source",
  ]) {
    if (forbiddenField in directory) {
      throw new Error(`Settings Agents directory projection must not restore private activation field ${forbiddenField}`);
    }
  }
  const statusModel = directory.status_model;
  if (
    statusModel?.policy !== "software_management_status_with_readiness_details" ||
    statusModel?.user_facing_projection_ref !==
      "contracts/app-gui-product-contract.json#pages.app_management.software_catalog_policy" ||
    statusModel?.detail_readiness_projection_ref !==
      "contracts/app-gui-product-contract.json#pages.settings_agents.agent_package_lifecycle_ux.user_facing_status_projection" ||
    statusModel?.readiness_projection_scope !== "software_details_and_conversation_entry_only" ||
    statusModel?.localized_metadata_source !==
      "app_state.agent_packages.directory.entries"
  ) {
    throw new Error(
      "Settings Agents must keep the software management status model with readiness in details",
    );
  }
  assertDeepEqualJson(
    statusModel?.axes,
    [
      "presence",
      "install_state",
      "source_state",
      "trust_state",
      "capability_exposure",
      "directory_readiness",
      "dependency_readiness",
      "runtime_source_readiness",
      "operational_ready",
      "launch_allowed",
    ],
    "Settings Agents status axes",
  );
  if (
    statusModel?.developer_source_policy !==
    "active runtime developer checkout semantics must surface explicitly, remain distinct from package installation source, and must not collapse into a generic repair bucket"
  ) {
    throw new Error(
      "Settings Agents must preserve developer checkout semantics as their own axis",
    );
  }
  assertDeepEqualJson(
    statusModel?.must_not_collapse,
    [
      "developer_checkout",
      "dirty_checkout",
      "git_behind",
      "unknown",
      "needs_sync",
    ],
    "Settings Capabilities forbidden collapsed states",
  );
  const detailSurface = directory.detail_surface;
  if (
    detailSurface?.kind !== "desktop_right_side_panel_mobile_drawer" ||
    detailSurface?.first_screen_policy !==
      "directory presence and callability plus dependency presence, dependent guard, exposure, runtime-source readiness, and launch diagnostics are normal detail fields; private lifecycle storage and physical paths are not App inputs"
  ) {
    throw new Error(
      "Settings Agents detail surface must keep package diagnostics in side-panel/drawer density",
    );
  }
  assertDeepEqualJson(
    detailSurface?.detail_fields,
    [
      "directory_readiness",
      "dependency_readiness",
      "dependent_guard",
      "capability_exposure",
      "runtime_source_readiness",
      "operational_ready",
      "launch_allowed",
      "launch_blocked_reason",
      "allowed_when_blocked",
      "status_read_error",
    ],
    "Settings Agents detail fields",
  );
  assertDeepEqualJson(
    detailSurface?.advanced_diagnostics_fields,
    ["owner_diagnostic_ref", "status_read_error"],
    "Settings Agents advanced diagnostics fields",
  );
  for (const forbiddenField of [
    "workflow_refs",
    "connector_readiness_refs",
    "resource_source_refs",
    "environment_refs",
  ]) {
    if (detailSurface?.detail_fields?.includes(forbiddenField)) {
      throw new Error(
        `Settings Agents detail surface must not own Capabilities field ${forbiddenField}`,
      );
    }
  }
  if (
    !String(directory.completion_boundary ?? "").includes(
      "canonical public directory entries",
    )
  ) {
    throw new Error(
      "Settings Agents directory projection must state the current implementation boundary",
    );
  }
}

export function validateSettingsAccessResourceBoundary(accessPage) {
  if (
    accessPage?.model_access_source !==
    "app_state.core.codex.model_access_source"
  ) {
    throw new Error(
      "Settings Access must read the real Codex model_access_source",
    );
  }
  const presentation = accessPage?.normal_state_presentation;
  if (!presentation || typeof presentation !== "object") {
    throw new Error(
      "Settings Access page adapter must declare normal_state_presentation",
    );
  }
  assertDeepEqualJson(
    presentation.user_facing_groups,
    ["model_access", "model_preference"],
    "Settings Access normal-state groups",
  );
  assertDeepEqualJson(
    presentation.supporting_details,
    ["codex_cli", "gateway_navigation"],
    "Settings Access supporting details",
  );
  if (
    presentation.default_policy !==
    "real_provider_source_selected_and_default_model_and_codex_cli_first"
  ) {
    throw new Error(
      "Settings Models must show the real source, selected/default model, and Codex CLI first",
    );
  }
  if (
    presentation.details_policy !==
    "base_url_token_paths_cli_and_provider_internals_only_in_details_or_abnormal_state"
  ) {
    throw new Error(
      "Settings Access diagnostics must stay in details or abnormal states",
    );
  }
  if (
    presentation.resources_route !== "resources" ||
    presentation.resources_route_policy !==
      "local browser access, Docker WebUI, and owner-projected optional resource refs live on Resources & Connections; absent optional projections create no groups or placeholders"
  ) {
    throw new Error(
      "Settings Access must route browser and resource surfaces to Settings Resources",
    );
  }
  assertIncludesAll(
    presentation.hidden_normal_state_terms,
    [
      "repeated OPL Gateway summary lines",
      "action_available",
      "diagnose_with_doctor",
      "available",
      "CLI dry-run commands",
    ],
    "Settings Access hidden normal-state terms",
  );

  const boundary = accessPage?.resource_route_boundary;
  if (!boundary || typeof boundary !== "object") {
    throw new Error(
      "Settings Access page adapter must declare resource_route_boundary",
    );
  }
  assertDeepEqualJson(
    boundary.required_boundary_terms,
    [
      "Account & Access",
      "Resources & Connections",
      "owner-projected optional resource refs",
    ],
    "Settings Access resource route boundary terms",
  );
  if (
    boundary.display_policy !==
    "model selection stays on Models; Gateway credentials route to Account & Access; browser, resource, and deployment refs route to Settings Resources"
  ) {
    throw new Error(
      "Settings Models must route Gateway credentials and resource refs to their owning pages",
    );
  }
  if (
    boundary.optional_resource_policy !==
    "render only canonical owner-projected records with at least one resource or route ref; omit empty categories and placeholders"
  ) {
    throw new Error(
      "Settings Access resource route boundary must keep optional resources conditional",
    );
  }
  if (boundary.refs_only !== true) {
    throw new Error(
      "Settings Access resource route boundary refs_only must be true",
    );
  }
  assertIncludesAll(
    boundary.forbidden_claims,
    [
      "runtime_truth",
      "provider_implementation",
      "domain_truth",
      "domain_readiness",
      "app_release_readiness",
    ],
    "Settings Access resource route boundary forbidden claims",
  );
}

export function validateSettingsOptionalResourceProjection(
  controlPlane,
  guiContract,
  pageStateMatrix,
  productProfile,
) {
  const experience =
    controlPlane?.experience_contract?.page_contracts?.resources;
  const guiPage = guiContract?.pages?.settings_resources;
  const matrixPage = pageById(pageStateMatrix, "settings_resources");
  const profileExperience =
    productProfile?.settings?.control_plane?.experience_contract?.page_contracts
      ?.resources;

  for (const [label, policy] of [
    ["Settings experience", experience?.external_resource_projection_policy],
    ["GUI Settings Resources", guiPage?.external_resource_projection_policy],
    [
      "Page-state Settings Resources",
      matrixPage?.external_resource_projection_policy,
    ],
    [
      "Product profile Settings Resources",
      profileExperience?.external_resource_projection_policy,
    ],
  ]) {
    assertDeepEqualJson(
      policy,
      expectedOptionalResourceProjectionPolicy,
      `${label} optional resource projection policy`,
    );
  }

  assertDeepEqualJson(
    experience?.conditional_groups,
    [expectedConditionalResourceGroup],
    "Settings Resources conditional groups",
  );
  assertDeepEqualJson(
    profileExperience?.conditional_groups,
    [expectedConditionalResourceGroup],
    "Product profile Settings Resources conditional groups",
  );
  assertDeepEqualJson(
    guiPage?.conditional_sections,
    [expectedConditionalResourceSection],
    "GUI Settings Resources conditional sections",
  );
  assertDeepEqualJson(
    matrixPage?.conditional_sections,
    [expectedConditionalResourceSection],
    "Page-state Settings Resources conditional sections",
  );

  const ordinaryResourceContract = JSON.stringify({
    access: controlPlane?.page_adapter_policy?.required_pages?.access,
    experience,
    guiPage,
    matrixPage,
    profileExperience,
  });
  for (const forbiddenLiteral of [
    "OPL Workspace",
    "Fabric",
    "HPC",
    "Console-managed",
  ]) {
    if (ordinaryResourceContract.includes(forbiddenLiteral)) {
      throw new Error(
        `Settings Resources must not hard-require optional platform literal ${forbiddenLiteral}`,
      );
    }
  }
}
