import { assertDeepEqualJson, assertIncludesAll } from "../assertions.ts";
import {
  appActionRoute,
  appOwnedSecondarySettingsPages,
  appOwnedSettingsCompatibilityRedirects,
  appOwnedSettingsIaGroupIds,
  appOwnedSettingsAboutUpdaterStatePolicy,
  appOwnedSettingsTabs,
  appOwnedSettingsTopLevelEntryIds,
} from "../app-contract-constants.ts";

import {
  expectedAgentsRouteStateSource,
  expectedAnchorRemap,
  expectedLegacyRedirects,
  expectedSlotKeys,
} from "./constants.ts";
import { validateSettingsExperienceContract } from "./experience.ts";
import { validateSettingsIa } from "./ia.ts";
import {
  validateHydratedSettingsRegistry,
  validateProductProfileSettings,
  validateSettingsModelReasoningPolicy,
  validateSettingsPageStateMatrix,
  validateSettingsShellAdapterSlotContract,
} from "./page-state.ts";
import { validateSettingsPageAdapterPolicy, validateSettingsProjection } from "./projection.ts";
import { validateSettingsOptionalResourceProjection } from "./resources.ts";
import {
  assertEveryRouteHasSlot,
  validateCrossContractConsistency,
  validateSettingsUserNavigationProjection,
} from "./routes.ts";
import { pageById } from "./shared.ts";
import {
  validateSettingsProductSystemChecklist,
  validateSettingsShellAdapterSlot,
  validateSettingsVisualQaPolicy,
} from "./visual-system.ts";

export function validateSettingsControlPlane(
  controlPlane,
  guiContract,
  pageStateMatrix,
  productProfile,
  adapterContract,
) {
  validateSettingsAppUpdateAuthority({
    controlPlane,
    guiContract,
    pageStateMatrix,
    productProfile,
  });
  if (controlPlane?.purpose !== "app_owned_settings_control_plane") {
    throw new Error(
      "Settings control plane purpose must be app_owned_settings_control_plane",
    );
  }
  if (
    controlPlane.owner !== "one-person-lab-app" ||
    controlPlane.state !== "active"
  ) {
    throw new Error("Settings control plane must be active and App-owned");
  }
  if (
    controlPlane.source_contract_ref !==
    "contracts/app-gui-product-contract.json#settings_navigation"
  ) {
    throw new Error(
      "Settings control plane must point at the App GUI settings navigation source contract",
    );
  }
  if (
    controlPlane.product_profile_projection_target !== "settings.control_plane"
  ) {
    throw new Error(
      "Settings control plane must project to settings.control_plane",
    );
  }
  if (
    productProfile?.settings?.control_plane?.machine_boundary !==
    controlPlane.machine_boundary
  ) {
    throw new Error(
      "Product profile Settings control plane machine boundary must match the source contract",
    );
  }
  const configurationProjection =
    controlPlane.configuration_catalog_projection;
  if (
    configurationProjection?.schema !==
      "opl_app_settings_configuration_catalog_projection.v1" ||
    configurationProjection.framework_source_ref !==
      "app_state.settings_control_center.configuration_catalog.items + app_state.settings_control_center.configuration_catalog.host_owned_configuration_surfaces" ||
    configurationProjection.connection_source_ref !==
      "app_state.settings_control_center.connection_registry"
  ) {
    throw new Error(
      "Settings configuration catalog projection must consume the Framework and connection owner read models",
    );
  }
  assertDeepEqualJson(
    productProfile?.settings?.control_plane
      ?.configuration_catalog_projection,
    configurationProjection,
    "Product profile Settings configuration catalog projection",
  );
  const configurationItems = configurationProjection.items ?? [];
  const requiredConfigurationFields =
    configurationProjection.required_fields ?? [];
  const allowedOwnerClasses = new Set(
    configurationProjection.owner_classes ?? [],
  );
  if (
    configurationItems.length === 0 ||
    new Set(configurationItems.map((item) => item.stable_id)).size !==
      configurationItems.length ||
    new Set(configurationItems.map((item) => item.configuration_id)).size !==
      configurationItems.length
  ) {
    throw new Error(
      "Settings configuration catalog projection requires unique stable and configuration ids",
    );
  }
  const pageContracts =
    controlPlane.experience_contract?.page_contracts ?? {};
  const forbiddenCredentialKeys = new Set([
    "api_key",
    "token",
    "secret",
    "password",
    "current_value",
  ]);
  for (const item of configurationItems) {
    if (
      !requiredConfigurationFields.every((field) =>
        Object.prototype.hasOwnProperty.call(item, field),
      )
    ) {
      throw new Error(
        `Settings configuration item ${item.stable_id ?? "unknown"} is missing required fields`,
      );
    }
    if (!allowedOwnerClasses.has(item.owner_class)) {
      throw new Error(
        `Settings configuration item ${item.stable_id} has an unknown owner class`,
      );
    }
    const owningPage = pageContracts[item.page_id];
    if (!owningPage?.required_anchors?.includes(item.anchor)) {
      throw new Error(
        `Settings configuration item ${item.stable_id} must reference an existing page anchor`,
      );
    }
    if (
      item.owner_class === "framework" &&
      (!String(item.current_value_source_ref).startsWith("app_state.") ||
        Object.prototype.hasOwnProperty.call(item, "action_id") ||
        Object.prototype.hasOwnProperty.call(item, "current_value"))
    ) {
      throw new Error(
        `Framework configuration item ${item.stable_id} must delegate current values and action metadata`,
      );
    }
    if (
      item.owner_class === "app_local" &&
      (!item.persistence_target_ref || !item.write_route)
    ) {
      throw new Error(
        `App-local configuration item ${item.stable_id} requires an existing persistence and write route`,
      );
    }
    if (item.owner_class === "credential_connection") {
      if (![
        "secret_ref_only",
        "redacted_status",
      ].includes(item.sensitivity)) {
        throw new Error(
          `Credential configuration item ${item.stable_id} must be secret-ref-only or redacted status`,
        );
      }
      if (Object.keys(item).some((key) => forbiddenCredentialKeys.has(key))) {
        throw new Error(
          `Credential configuration item ${item.stable_id} must not contain secret or current-value fields`,
        );
      }
    }
  }
  const workspaceRootConfiguration = configurationItems.find(
    (item) => item.configuration_id === "workspace_root",
  );
  assertDeepEqualJson(
    workspaceRootConfiguration?.carrier_policy,
    {
      desktop: "editable_through_owner_projected_action",
      webui:
        "read_only_owner_projected_logical_root_no_workspace_root_set_execution",
      docker_webui:
        "read_only_/projects_from_OPL_WORKSPACE_ROOT_no_workspace_root_set_execution",
      host_mount_mutation_allowed: false,
    },
    "Settings workspace root carrier policy",
  );
  const logDirectoryConfiguration = configurationItems.find(
    (item) => item.configuration_id === "log_directory",
  );
  if (
    logDirectoryConfiguration?.page_id !== "maintenance" ||
    logDirectoryConfiguration?.anchor !== "diagnostics"
  ) {
    throw new Error(
      "Settings log directory configuration must be owned by Logs & Diagnostics",
    );
  }
  assertDeepEqualJson(
    logDirectoryConfiguration?.carrier_policy,
    {
      desktop: "editable_through_application.setLogDirectory",
      webui:
        "read_only_application.systemInfo.logDir_no_log_directory_mutation",
      docker_webui: "read_only_/data/logs_no_log_directory_mutation",
      host_mount_mutation_allowed: false,
    },
    "Settings log directory carrier policy",
  );
  assertDeepEqualJson(
    productProfile?.settings?.control_plane?.model_reasoning_policy_source,
    controlPlane.model_reasoning_policy_source,
    "Product profile Settings model/reasoning policy projection",
  );
  assertDeepEqualJson(
    productProfile?.settings?.control_plane?.product_system_checklist,
    controlPlane.product_system_checklist,
    "Product profile Settings checklist projection",
  );
  assertDeepEqualJson(
    controlPlane.ordinary_visible_tabs,
    appOwnedSettingsTabs,
    "Settings control plane ordinary tabs",
  );
  assertDeepEqualJson(
    controlPlane.ordinary_routes?.map((route) => route.id),
    appOwnedSettingsTabs,
    "Settings control plane ordinary route ids",
  );
  assertDeepEqualJson(
    controlPlane.ordinary_routes?.map((route) => route.product_page_id),
    appOwnedSettingsTopLevelEntryIds,
    "Settings control plane ordinary product page ids",
  );
  for (const route of controlPlane.ordinary_routes) {
    const tab = guiContract?.settings_navigation?.primary_tabs?.[route.id];
    if (!tab?.label_zh?.trim() || !tab?.label_en?.trim()) {
      throw new Error(`GUI Settings primary tab ${route.id} must declare bilingual labels`);
    }
    assertDeepEqualJson(
      { label_zh: route.default_label_zh, label_en: route.default_label_en },
      { label_zh: tab.label_zh, label_en: tab.label_en },
      `Settings control plane top-level product labels for ${route.id}`,
    );
  }
  assertDeepEqualJson(
    controlPlane.secondary_pages?.map((page) => page.id),
    appOwnedSecondarySettingsPages,
    "Settings control plane secondary page ids",
  );
  assertDeepEqualJson(
    [...new Set(controlPlane.ordinary_routes?.map((route) => route.ia_group))].sort(),
    [...appOwnedSettingsIaGroupIds].sort(),
    "Settings control plane IA groups",
  );
  assertDeepEqualJson(
    controlPlane.ordinary_routes?.map((route) => route.slot_id),
    [
      "settings_general",
      "settings_gateway",
      "settings_access",
      "workspace",
      "settings_agents",
      "settings_capabilities",
      "settings_resources",
      "settings_environment",
      "settings_storage",
      "settings_theme",
    ],
    "Settings control plane ordinary slot ids",
  );
  assertDeepEqualJson(
    controlPlane.legacy_route_redirects,
    expectedLegacyRedirects,
    "Settings control plane legacy redirects",
  );
  assertDeepEqualJson(
    controlPlane.extension_anchor_remap,
    expectedAnchorRemap,
    "Settings control plane extension anchor remap",
  );
  assertDeepEqualJson(
    controlPlane.compatibility_redirects,
    appOwnedSettingsCompatibilityRedirects,
    "Settings control plane compatibility redirects",
  );
  if (
    controlPlane.legacy_route_redirects?.about ||
    controlPlane.extension_anchor_remap?.about
  ) {
    throw new Error(
      "Settings About must remain an independent /settings/about page",
    );
  }
  assertDeepEqualJson(
    Object.keys(controlPlane.slot_registry ?? {}),
    expectedSlotKeys,
    "Settings control plane slot registry keys",
  );
  assertEveryRouteHasSlot(controlPlane);
  validateHydratedSettingsRegistry(controlPlane);
  validateSettingsShellAdapterSlotContract(controlPlane);
  validateSettingsModelReasoningPolicy(
    controlPlane,
    guiContract,
    productProfile,
  );
  validateSettingsProjection(controlPlane.settings_projection);
  validateSettingsExperienceContract(controlPlane.experience_contract, guiContract);
  assertDeepEqualJson(
    guiContract?.pages?.settings_resources?.connection_authorization,
    controlPlane.experience_contract?.page_contracts?.resources?.connection_authorization,
    "Settings GUI and control-plane connection authorization projection",
  );
  validateSettingsPageAdapterPolicy(controlPlane, productProfile);
  validateSettingsVisualQaPolicy(controlPlane, guiContract);
  validateSettingsProductSystemChecklist(controlPlane);
  if (controlPlane.default_route !== "/settings/general") {
    throw new Error(
      "Settings control plane default route must be /settings/general",
    );
  }
  const agentsRoute = (controlPlane.ordinary_routes ?? []).find(
    (route) => route.id === "agents",
  );
  if (agentsRoute?.state_source !== expectedAgentsRouteStateSource) {
    throw new Error(
      "Settings Agents route must read from canonical agent_packages plus Home shortcut projections",
    );
  }
  const capabilityOwnership = controlPlane.agents_capabilities_ownership?.capabilities;
  const externalUpdates = controlPlane.external_tool_update_policy;
  if (
    guiContract?.interaction_baseline?.capability_selection
      ?.management_surface !== "app_management"
  ) {
    throw new Error(
      "Software Center must own Package and Home shortcut management",
    );
  }
  assertDeepEqualJson(
    capabilityOwnership?.entity_kinds,
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
    "Settings capability entity kinds",
  );
  if (
    capabilityOwnership?.groups?.opl_flow_managed?.source !== "framework_agent_package_directory_and_status_index" ||
    capabilityOwnership?.groups?.opl_flow_managed?.source_ref !==
      "opl app state --profile fast --json#app_state.agent_packages.directory.entries + app_state.agent_packages.status_index" ||
    capabilityOwnership?.groups?.opl_flow_managed?.membership_policy !==
      "derive_from_framework_agent_package_projection_never_from_app_hardcoded_skill_list" ||
    capabilityOwnership?.groups?.opl_flow_managed?.lifecycle_owner !== "opl_packages" ||
    capabilityOwnership?.groups?.opl_flow_managed?.cli_currentness_owner !== "opl_base" ||
    capabilityOwnership?.groups?.opl_managed_companion?.source !== "framework_managed_companion_projection" ||
    capabilityOwnership?.groups?.opl_managed_companion?.source_ref !==
      "opl app state --profile fast --json#app_state.managed_companions[]" ||
    capabilityOwnership?.groups?.opl_managed_companion?.lifecycle_owner !== "one-person-lab" ||
    capabilityOwnership?.groups?.opl_managed_companion?.mutation_policy !==
      "owner_projected_action_route_with_explicit_permission_action_when_system_tcc_is_required" ||
    capabilityOwnership?.groups?.opl_managed_companion?.manual_and_third_party_policy_applies !== false ||
    capabilityOwnership?.groups?.manual_and_third_party?.source !==
      "codex_and_shell_skill_plugin_registries_plus_local_mcp_image_voice_configuration" ||
    capabilityOwnership?.groups?.manual_and_third_party?.label_zh !== "手工添加" ||
    capabilityOwnership?.groups?.manual_and_third_party?.label_en !== "Manually added" ||
    capabilityOwnership?.groups?.manual_and_third_party?.membership_policy !==
      "show_user_managed_and_third_party_skills_plugins_MCP_image_and_voice_controls_without_reclassifying_them_as_opl_flow_managed; manual skill counts and empty states describe only the shell import directory" ||
    capabilityOwnership?.groups?.manual_and_third_party?.local_native_policy !==
      "keep_local_skills_tools_MCP_helpers_image_controls_and_voice_input_controls_in_local_or_third_party_ownership_never_OPL_Flow_managed" ||
    capabilityOwnership?.groups?.manual_and_third_party?.mutation_policy !== "explicit_user_action_only"
  ) {
    throw new Error("Settings Capabilities must separate OPL Flow, OPL-managed companions, and manual/third-party capabilities");
  }
  assertDeepEqualJson(
    externalUpdates?.modes,
    ["silent_managed", "explicit_owner_delegated", "detect_only_guidance"],
    "Settings external tool update modes",
  );
  if (
    externalUpdates?.silent_managed?.allowed_for !== "opl_managed_install_roots_only" ||
    externalUpdates?.explicit_owner_delegated?.user_confirmation_required !== true ||
    externalUpdates?.detect_only_guidance?.mutation_allowed !== false
  ) {
    throw new Error("Settings external updates must keep silent managed, explicit owner-delegated, and guidance-only boundaries");
  }
  if (
    controlPlane.extension_tab_policy?.legacy_anchor_remap_required !== true ||
    controlPlane.extension_tab_policy?.default_visibility !==
      "hidden_until_app_classified" ||
    !Array.isArray(controlPlane.extension_tab_policy?.mount_allowlist) ||
    Object.prototype.hasOwnProperty.call(
      controlPlane.extension_tab_policy ?? {},
      "unknown_anchor",
    ) ||
    Object.prototype.hasOwnProperty.call(
      controlPlane.extension_tab_policy ?? {},
      "anchored_tabs",
    ) ||
    Object.prototype.hasOwnProperty.call(
      controlPlane.extension_tab_policy ?? {},
      "unanchored_tabs",
    ) ||
    controlPlane.extension_tab_policy?.unclassified_or_unknown_anchor !==
      "hide_and_report_in_intake_diagnostics" ||
    controlPlane.extension_tab_policy?.extension_data_deletion_policy !==
      "never_delete_extension_data_when_hiding_or_redirecting_an_entry"
  ) {
    throw new Error(
      "Settings control plane must hide unclassified extension entries, preserve their data, and require legacy anchor remapping",
    );
  }
  if (controlPlane.state_action_policy?.action_route !== appActionRoute) {
    throw new Error(
      "Settings control plane must route mutations through opl app action execute",
    );
  }
  if (
    controlPlane.state_action_policy?.request_exclusivity_policy !==
      "single_inflight_read_or_action_per_settings_surface" ||
    controlPlane.state_action_policy?.result_binding_policy !==
      "visible_progress_and_result_remain_bound_to_the_triggering_operation"
  ) {
    throw new Error(
      "Settings control plane must keep reads and actions single-flight with operation-bound results",
    );
  }
  const startup = controlPlane.state_action_policy?.startup_performance_policy;
  validateStartupPerformancePolicy(startup);
  for (const [label, projection] of [
    ["GUI startup performance protocol", guiContract?.settings_navigation?.settings_ia?.protocols?.startup_performance],
    ["page-state startup performance policy", pageStateMatrix?.settings_startup_performance_policy],
    ["product-profile startup performance projection", productProfile?.settings?.control_plane?.state_action_policy?.startup_performance_policy],
  ]) {
    assertDeepEqualJson(projection, startup, `Settings ${label}`);
  }
  if (
    controlPlane.state_action_policy?.configuration_action_policy !==
      "framework_owned_persistent_controls_consume_configuration_catalog_action_ids_and_verify_refs_without_shell_hardcoding" ||
    controlPlane.state_action_policy?.one_time_action_policy !==
      "maintenance_resource_storage_and_capability_commands_consume_action_catalog_entries_without_becoming_configuration" ||
    controlPlane.state_action_policy?.diagnostic_policy !==
      "diagnostic_surfaces_are_read_only_and_must_not_mount_apply_repair_rollback_install_uninstall_or_persistent_setting_controls" ||
    controlPlane.state_action_policy?.unknown_status_policy !==
      "unknown_is_reserved_for_malformed_or_unsupported_projection_and_is_never_used_for_loading_or_not_checked"
  ) {
    throw new Error(
      "Settings control plane must separate persistent configuration, one-time actions, read-only diagnostics, and status vocabulary",
    );
  }
  assertDeepEqualJson(
    controlPlane.state_action_policy?.status_vocabulary,
    [
      "checking",
      "not_checked",
      "not_applicable",
      "ready",
      "needs_attention",
      "failed",
    ],
    "Settings state vocabulary",
  );
  assertDeepEqualJson(
    controlPlane.state_action_policy?.recommended_action_ids,
    { doctor: "doctor", repair: "repair" },
    "Settings control plane recommended action ids",
  );
  assertIncludesAll(
    controlPlane.state_action_policy?.shell_must_not_own,
    [
      "runtime truth",
      "provider implementation",
      "domain truth",
      "owner receipts",
      "release readiness",
    ],
    "Settings control plane shell_must_not_own",
  );
  validateCrossContractConsistency(
    controlPlane,
    guiContract,
    pageStateMatrix,
    productProfile,
  );
  validateSettingsOptionalResourceProjection(
    controlPlane,
    guiContract,
    pageStateMatrix,
    productProfile,
  );
  validateSettingsIa(guiContract?.settings_navigation?.settings_ia);
  validateSettingsUserNavigationProjection(
    controlPlane.user_navigation_projection,
    guiContract?.settings_navigation?.settings_ia,
  );
  assertDeepEqualJson(
    productProfile?.settings?.control_plane?.user_navigation_projection,
    controlPlane.user_navigation_projection,
    "Product profile Settings user navigation projection",
  );
  validateSettingsPageStateMatrix(
    pageStateMatrix,
    controlPlane.experience_contract,
    controlPlane.compatibility_redirects,
  );
  validateProductProfileSettings(productProfile, controlPlane);
  validateSettingsShellAdapterSlot(adapterContract);
}

function validateStartupPerformancePolicy(startup) {
  const snapshot = startup?.persisted_snapshot;
  const retry = startup?.background_hydration_retry;
  if (
    startup?.schema !== "settings_startup_performance.v1" ||
    startup.background_state_source !== "opl app state --profile fast --json" ||
    startup.first_window_state_source !== "renderer_localStorage_allowlisted_fast_state_snapshot_or_loading_shell" ||
    startup.first_window_blocking_policy !== "never_wait_for_complete_fast_state_or_page_drilldowns" ||
    startup.first_window_failure_policy !== "render_recoverable_nonblank_shell_never_fatal_or_blank_candidate_window" ||
    startup.ordinary_guid_target_status !== "required_unverified_installed_target_not_current_measurement_or_SLA" ||
    startup.background_hydration_in_guid_target !== false ||
    startup.single_flight_background_refresh !== true ||
    startup.global_refresh_on_route_mount !== false ||
    startup.framework_projection_claim !== "not_proven_by_ui_contract_or_shell_gate" ||
    startup.live_measurement_gate !== "installed_App_launch_to_first_window_and_settings_readiness_after_owner_absorption"
  ) {
    throw new Error("Settings startup performance policy must preserve fast, non-blocking startup and separate live readiness from contract evidence");
  }
  for (const [field, maximum] of [
    ["cold_budget_ms", 1500],
    ["warm_budget_ms", 1500],
    ["ordinary_guid_interactive_target_ms", 1500],
    ["startup_projection_payload_budget_bytes", 262144],
  ] as const) {
    const value = startup[field];
    if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
      throw new Error(`Settings startup performance policy ${field} must be a positive integer of at most ${maximum}`);
    }
  }
  if (
    snapshot?.schema !== "opl_settings_startup_snapshot.v1" ||
    snapshot.source !== "renderer_localStorage_allowlisted_fast_state_cache" ||
    snapshot.version !== 1 ||
    snapshot.freshness_policy !== "stale_while_revalidate_with_observed_at_and_stale_fields" ||
    snapshot.secret_boundary !== "allowlisted_read_models_only_no_tokens_passwords_raw_receipts_or_unredacted_errors" ||
    retry?.max_attempts !== 2 ||
    retry.retry_delay_ms !== 250 ||
    retry.clear_single_flight_marker_after_failure !== true ||
    retry.remount_or_manual_retry_after_exhaustion !== true
  ) {
    throw new Error("Settings startup performance policy must keep the allowlisted snapshot and bounded, recoverable background hydration");
  }
  assertIncludesAll(snapshot.invalidation, [
    "schema_or_version_mismatch",
    "App_release_identity_change",
    "explicit_sign_out_or_cache_clear",
  ], "Settings startup performance policy snapshot invalidation");
  assertIncludesAll(startup.timing_milestones, [
    "stable_shell_first_paint",
    "background_hydration_complete",
  ], "Settings startup performance policy timing milestones");
  assertIncludesAll(startup.lazy_drilldown_routes, [
    "agents", "capabilities", "storage", "about",
  ], "Settings startup performance policy lazy drilldowns");
}

export function validateSettingsControlPlaneBehavior({
  guiContract,
  pageStateMatrix,
  productProfile,
  adapterContract,
}) {
  validateSettingsAppUpdateAuthority({
    guiContract,
    pageStateMatrix,
    productProfile,
  });
  if (guiContract) {
    validateSettingsIa(guiContract?.settings_navigation?.settings_ia);
  }
  if (pageStateMatrix) {
    validateSettingsPageStateMatrix(pageStateMatrix);
  }
  if (productProfile) {
    assertDeepEqualJson(
      productProfile.settings?.visible_tabs,
      appOwnedSettingsTabs,
      "Product profile settings visible tabs",
    );
  }
  if (adapterContract) {
    validateSettingsShellAdapterSlot(adapterContract);
  }
}

const appUpdateStatePolicyRef =
  "contracts/app-gui-product-contract.json#framework_surfaces.managed_update_plane.app_update_state_policy";
const managedUpdateRepairPolicyRef =
  "contracts/app-gui-product-contract.json#framework_surfaces.managed_update_plane.repair_availability_policy";

function validateAppUpdateStatePolicyObject(policy, label) {
  const expectedStatusValues = [
    "not_checked",
    "checking",
    "not-available",
    "available",
    "downloading",
    "downloaded",
    "error",
    "cancelled",
  ];
  if (
    policy?.schema !== "opl_app_update_state_policy.v1" ||
    policy.desktop?.state_source !== "single_main_process_updater_state_store" ||
    policy.desktop?.mount_check !== false ||
    !Array.isArray(policy.desktop?.status_values) ||
    policy.desktop.status_values.length !== expectedStatusValues.length ||
    !expectedStatusValues.every((value) => policy.desktop.status_values.includes(value)) ||
    policy.attention_accounting?.independent !== true ||
    policy.webui?.fallback_source !==
      "opl app state --profile fast --json#managed_update.components[component_id=opl_app]" ||
    policy.desktop?.background_completion !== "silent_install_on_normal_app_restart"
  ) {
    throw new Error(`${label} must keep a single desktop updater store, mount_check=false, full status vocabulary, and independent attention accounting`);
  }
  assertIncludesAll(policy.desktop?.consumers, ["about", "maintenance", "settings_footer"], label);
  assertIncludesAll(policy.desktop?.attention_states, ["available", "downloading", "downloaded", "error"], label);
}

function validateManagedUpdateRepairPolicyObject(policy, label) {
  if (
    policy?.schema !== "opl_managed_update_repair_availability_policy.v1" ||
    policy.current_state_precedence !== true ||
    policy.historical_receipt_role !== "diagnostics_only" ||
    policy.historical_receipt_may_activate_current_repair !== false ||
    policy.unavailable_primary_action !== "check_current_status"
  ) {
    throw new Error(`${label} must prioritize current repair state and keep historical receipts diagnostics-only`);
  }
  assertIncludesAll(
    policy.current_repair_signals,
    ["component.repair_allowed", "component.can_repair", "component.state=failed_with_repair", "current_repair_action"],
    label,
  );
}

export function validateSettingsAppUpdateAuthority({
  controlPlane,
  guiContract,
  pageStateMatrix,
  productProfile,
}) {
  const assertPolicyRef = (actual, label) => {
    if (actual !== appUpdateStatePolicyRef) {
      throw new Error(`${label} must reference the shared App update state policy`);
    }
  };
  const assertRepairPolicyRef = (actual, label) => {
    if (actual !== managedUpdateRepairPolicyRef) {
      throw new Error(`${label} must reference the current managed-update repair policy`);
    }
  };
  const validateFooter = (footer, label) => {
    if (
      footer?.availability_source !== "single_main_process_updater_state_store" ||
      footer?.webui_fallback_source !==
        "opl app state --profile fast --json#managed_update.components[component_id=opl_app]" ||
      footer?.app_update_state_policy_ref !== appUpdateStatePolicyRef
    ) {
      throw new Error(`${label} must use the shared desktop updater store with the WebUI managed fallback`);
    }
  };

  const guiUpdatePolicy = guiContract?.framework_surfaces?.managed_update_plane?.app_update_state_policy;
  const guiRepairPolicy = guiContract?.framework_surfaces?.managed_update_plane?.repair_availability_policy;
  if (guiContract) {
    validateAppUpdateStatePolicyObject(guiUpdatePolicy, "App GUI shared App update state policy");
    validateManagedUpdateRepairPolicyObject(guiRepairPolicy, "App GUI managed-update repair availability policy");
    assertDeepEqualJson(guiContract.pages?.about?.updater_state_policy, appOwnedSettingsAboutUpdaterStatePolicy, "App GUI About updater state policy");
    assertPolicyRef(guiContract.pages?.settings_environment?.app_update_state_policy_ref, "App GUI Maintenance");
    assertRepairPolicyRef(guiContract.pages?.settings_environment?.managed_update_repair_availability_policy_ref, "App GUI Maintenance");
    validateFooter(guiContract.settings_navigation?.footer_update_entry, "App GUI Settings footer");
  }

  if (pageStateMatrix) {
    assertDeepEqualJson(pageById(pageStateMatrix, "about").updater_state_policy, appOwnedSettingsAboutUpdaterStatePolicy, "Page-state About updater state policy");
    assertPolicyRef(pageById(pageStateMatrix, "environment").app_update_state_policy_ref, "Page-state Maintenance");
    assertRepairPolicyRef(pageById(pageStateMatrix, "environment").managed_update_repair_availability_policy_ref, "Page-state Maintenance");
    validateFooter(pageStateMatrix.settings_shell_navigation?.footer_update_entry, "Page-state Settings footer");
  }

  const profileControlPlane = productProfile?.settings?.control_plane;
  for (const [surfaceLabel, surface, updateLabel, repairLabel] of [
    ["Settings", controlPlane, "Settings control-plane App update state policy", "Settings control-plane managed-update repair availability policy"],
    ["Product profile", profileControlPlane, "Product profile App update state policy projection", "Product profile managed-update repair availability policy projection"],
  ] as const) {
    if (!surface) continue;
    validateAppUpdateStatePolicyObject(surface.app_update_state_policy, updateLabel);
    if (guiUpdatePolicy) assertDeepEqualJson(surface.app_update_state_policy, guiUpdatePolicy, updateLabel);
    validateManagedUpdateRepairPolicyObject(surface.managed_update_repair_availability_policy, repairLabel);
    if (guiRepairPolicy) assertDeepEqualJson(surface.managed_update_repair_availability_policy, guiRepairPolicy, repairLabel);
    assertPolicyRef(surface.page_adapter_policy?.required_pages?.about?.app_update_state_policy_ref, `${surfaceLabel} About adapter`);
    assertPolicyRef(surface.page_adapter_policy?.required_pages?.environment?.app_update_state_policy_ref, `${surfaceLabel} Maintenance adapter`);
    assertRepairPolicyRef(surface.page_adapter_policy?.required_pages?.environment?.managed_update_repair_availability_policy_ref, `${surfaceLabel} Maintenance adapter`);
    assertPolicyRef(surface.experience_contract?.page_contracts?.about?.app_update_state_policy_ref, `${surfaceLabel} About experience`);
    assertPolicyRef(surface.experience_contract?.page_contracts?.maintenance?.app_update_state_policy_ref, `${surfaceLabel} Maintenance experience`);
    assertRepairPolicyRef(surface.experience_contract?.page_contracts?.maintenance?.managed_update_repair_availability_policy_ref, `${surfaceLabel} Maintenance experience`);
  }
}
