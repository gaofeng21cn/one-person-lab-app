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
  expectedPageAdapterEntries,
} from "./constants.ts";
import {
  validateSettingsAccessResourceBoundary,
  validateSettingsAgentsDirectoryProjection,
  validateSettingsGatewayAccountBoundary,
} from "./resources.ts";

export function validateSettingsProjection(projection) {
  if (projection?.schema !== "settings_projection.v1") {
    throw new Error(
      "Settings control plane must declare settings_projection.v1",
    );
  }
  if (projection?.owner !== "one-person-lab-app") {
    throw new Error("Settings projection must stay App-owned");
  }
  if (
    projection?.source !==
    "opl app state --profile full --json#app_state.settings_control_center.settings_projection"
  ) {
    throw new Error(
      "Settings projection must consume the explicit full App settings drilldown projection",
    );
  }
  if (
    projection?.policy !==
    "summary_first_settings_items_with_scope_owner_risk_action_details_and_editability_reason"
  ) {
    throw new Error(
      "Settings projection must require summary-first item metadata",
    );
  }
  assertDeepEqualJson(
    projection?.section_ids,
    appOwnedSettingsProjectionSectionIds,
    "Settings projection section ids",
  );
  assertDeepEqualJson(
    projection?.item_required_fields,
    appOwnedSettingsProjectionItemFields,
    "Settings projection item required fields",
  );
  if (
    projection?.live_evidence_policy !==
    "contract_docs_tests_do_not_prove_live_installed_release_runtime_currentness_or_owner_acceptance"
  ) {
    throw new Error(
      "Settings projection must keep Live evidence outside contract/docs/tests completion",
    );
  }
  const sections = projection?.sections ?? {};
  assertDeepEqualJson(
    Object.keys(sections),
    appOwnedSettingsProjectionSectionIds,
    "Settings projection sections",
  );
  for (const [sectionId, section] of Object.entries(sections)) {
    if (section?.section_id !== sectionId) {
      throw new Error(
        `Settings projection section ${sectionId} must keep matching section_id`,
      );
    }
    if (!Array.isArray(section.items) || section.items.length === 0) {
      throw new Error(
        `Settings projection section ${sectionId} must declare at least one item`,
      );
    }
    for (const item of section.items) {
      assertIncludesAll(
        Object.keys(item),
        appOwnedSettingsProjectionItemFields,
        `Settings projection item ${sectionId}.${item?.item_id ?? "<missing id>"} fields`,
      );
      for (const field of appOwnedSettingsProjectionItemFields) {
        if (typeof item[field] !== "string" || item[field].trim() === "") {
          throw new Error(
            `Settings projection item ${sectionId}.${item?.item_id ?? "<missing id>"} must declare ${field}`,
          );
        }
      }
    }
  }
}

export function validateSettingsPageAdapterPolicy(controlPlane, productProfile) {
  const policy = controlPlane.page_adapter_policy;
  if (
    policy?.policy !== "settings_pages_consume_explicit_view_model_adapters"
  ) {
    throw new Error(
      "Settings page adapter policy must require explicit view-model adapters",
    );
  }
  const requiredPages = policy.required_pages ?? {};
  assertDeepEqualJson(
    Object.keys(requiredPages).sort(),
    Object.keys(expectedPageAdapterEntries).sort(),
    "Settings page adapter required pages",
  );
  for (const [routeId, adapterEntry] of Object.entries(
    expectedPageAdapterEntries,
  )) {
    const page = requiredPages[routeId];
    if (!page) {
      throw new Error(`Settings page adapter policy is missing ${routeId}`);
    }
    if (page.route_id !== routeId) {
      throw new Error(
        `Settings page adapter policy ${routeId} must keep route_id ${routeId}`,
      );
    }
    if (page.adapter_entry !== adapterEntry) {
      throw new Error(
        `Settings page adapter policy ${routeId} must use ${adapterEntry}`,
      );
    }
    if (
      !String(page.renderer_entry ?? "").startsWith(
        "packages/desktop/src/renderer/",
      )
    ) {
      throw new Error(
        `Settings page adapter policy ${routeId} must declare a Settings renderer entry`,
      );
    }
    if (
      !Array.isArray(page.forbidden_sources) ||
      page.forbidden_sources.length === 0
    ) {
      throw new Error(
        `Settings page adapter policy ${routeId} must declare forbidden sources`,
      );
    }
  }
  validateSettingsAccessResourceBoundary(requiredPages.access);
  validateSettingsGatewayAccountBoundary(controlPlane, requiredPages.gateway);
  assertDeepEqualJson(
    requiredPages.environment?.managed_dependency_summary,
    appOwnedSettingsManagedDependencySummary,
    "Settings Maintenance managed dependency summary",
  );
  validateSettingsCapabilitiesTaskAwarenessSurface(
    requiredPages.capabilities?.task_awareness_surface,
    "Settings Capabilities page adapter task-awareness surface",
  );
  assertDeepEqualJson(
    requiredPages.capabilities?.entity_kinds,
    [
      "standard_agent",
      "workflow_profile",
      "capability_package",
      "skill",
      "plugin",
      "mcp_server",
      "connection_application",
      "image_generation",
      "voice_input",
    ],
    "Settings Capabilities page adapter entity kinds",
  );
  if (
    requiredPages.capabilities?.local_configuration_source !==
      "AionUI local configuration#MCP servers + image generation + voice input" ||
    requiredPages.capabilities?.third_party_projection_policy?.aionui_native_policy !==
      "keep_AionUI_native_skills_tools_assistants_MCP_helpers_image_controls_and_voice_input_controls_in_local_or_third_party_ownership_never_OPL_Flow_managed" ||
    !requiredPages.capabilities?.forbidden_sources?.includes("Preferences-owned voice input configuration")
  ) {
    throw new Error("Settings Capabilities adapter must own local MCP, image, and voice configuration");
  }
  validateSettingsAgentsDirectoryProjection(requiredPages.agents);
  validateWorkspaceAndStorageOwnership(
    requiredPages.workspace,
    requiredPages.environment,
    requiredPages.storage,
  );
  assertDeepEqualJson(
    productProfile?.settings?.control_plane?.page_adapter_policy,
    policy,
    "Product profile Settings page adapter policy projection",
  );
}

export function validateWorkspaceAndStorageOwnership(
  workspacePage,
  environmentPage,
  storagePage,
) {
  assertDeepEqualJson(
    workspacePage?.workspace_root_carrier_policy,
    {
      desktop: {
        presentation: "editable",
        mutation_source: "owner_projected_workspace_root_action",
        fresh_readback_required: true,
      },
      webui: {
        presentation: "read_only_owner_projected_logical_root",
        authority_source: "owner_projected_logical_workspace_root",
        workspace_root_set_execution_allowed: false,
        host_projects_bind_rewire_allowed: false,
        docker: {
          presentation: "read_only_/projects",
          authority_source: "OPL_WORKSPACE_ROOT=/projects",
          host_projects_bind_rewire_allowed: false,
        },
      },
    },
    "Settings Workspace carrier-specific workspace root policy",
  );
  if (workspacePage?.log_directory !== undefined) {
    throw new Error(
      "Settings Workspace must not own the App log-directory control",
    );
  }
  const logDirectory = environmentPage?.log_directory;
  assertDeepEqualJson(
    logDirectory,
    {
      owner_page: "maintenance",
      owner_destination_id: "logs_diagnostics",
      typed_action: "application.setLogDirectory",
      typed_action_payload_fields: ["path"],
      typed_action_success_value_fields: ["hostLogDir"],
      typed_action_forbidden_success_value_fields: ["cacheDir", "workDir", "logDir"],
      mutation_sequence: [
        "persist_hostLogDir",
        "switch_live_log_writer",
        "rollback_persisted_hostLogDir_and_return_typed_failure_on_switch_failure",
      ],
      preserved_fields: ["cacheDir", "workDir"],
      host_projection: "application.systemInfo.logDir",
      persistence_target: "desktop_client_system_info.logDir",
      readback_ref: "application.setLogDirectory.hostLogDir plus application.systemInfo.logDir",
      desktop_change_supported: true,
      desktop_open_supported: true,
      webui_log_projection: "application.systemInfo.logDir",
      docker_webui_log_projection: "/data/logs",
      webui_change_supported: false,
      webui_action_execution_allowed: false,
      docker_volume_mapping: "host data directory -> /data",
      docker_volume_rewire_allowed: false,
    },
    "Settings Logs & Diagnostics typed host log-directory projection",
  );
  if (
    storagePage?.inventory_cache_policy?.ttl_seconds !== 300 ||
    storagePage?.log_directory_ref?.mode !== "read_only" ||
    storagePage?.log_directory_ref?.owner_route !== "environment#diagnostics" ||
    storagePage?.configuration_owner !== false
  ) {
    throw new Error(
      "Settings Storage must use the 300-second cache and keep the log directory as a read-only Logs & Diagnostics reference",
    );
  }
  assertDeepEqualJson(
    storagePage?.deployment_location_summary,
    {
      source_ref:
        "contracts/app-settings-control-plane.json#experience_contract.page_contracts.storage.surface_rules.deployment_location_summary",
      required_host_bind_paths: ["/projects", "/data"],
      container_recovery_path: "/recovery",
      container_recovery_is_required_host_bind: false,
      mutation_allowed: false,
    },
    "Settings Storage deployment location summary",
  );
  const ownerStorage = storagePage?.owner_storage_projections;
  if (
    ownerStorage?.projection_source !== "opl app state --profile fast --json" ||
    ownerStorage?.missing_projection_policy !== "fail_open_keep_shell_owned_categories_available" ||
    ownerStorage?.unknown_bytes_policy !== "unavailable_never_zero" ||
    ownerStorage?.agent_package_store?.owner_route !== "/settings/agents" ||
    ownerStorage?.agent_package_store?.ordinary_action !== "navigate_to_owner_route" ||
    ownerStorage?.agent_package_store?.direct_storage_mutation_allowed !== false ||
    ownerStorage?.webui_data_volume?.data_volume_mapping !== "OnePersonLab/data -> /data" ||
    ownerStorage?.webui_data_volume?.host_action_capability_id !==
      appOwnedWebuiDataVolumeHostActionCapabilityId ||
    ownerStorage?.webui_data_volume?.host_action_abi_ref !== appOwnedWebuiDataVolumeHostActionAbiRef ||
    ownerStorage?.webui_data_volume?.generic_docker_prune_allowed !== false ||
    ownerStorage?.webui_data_volume?.shell_direct_path_delete_allowed !== false
  ) {
    throw new Error(
      "Settings Storage must consume fail-open owner projections without direct Package or WebUI path mutation",
    );
  }
  assertDeepEqualJson(
    ownerStorage?.sections,
    ["agent_package_store", "webui_data_volume"],
    "Settings Storage owner projection sections",
  );
  assertIncludesAll(
    ownerStorage?.common_required_fields,
    [
      "status",
      "observed_at",
      "stale",
      "bytes",
      "reclaimable_bytes",
      "owner_route",
      "projected_action",
    ],
    "Settings Storage owner projection fields",
  );
  assertDeepEqualJson(
    storagePage?.storage_carrier_behavior,
    appOwnedStorageCarrierBehavior,
    "Settings Storage adapter carrier behavior",
  );
}
