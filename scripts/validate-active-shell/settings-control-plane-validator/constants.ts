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

const settingsIaRef =
  "contracts/app-gui-product-contract.json#settings_navigation.settings_ia";
const settingsControlPlaneContractRef =
  "contracts/app-settings-control-plane.json";
const expectedAgentsRouteStateSource =
  "opl app state --profile fast --json#app_state.agent_packages.directory.entries + app_state.agent_packages.status_index + app_state.runtime_source_carriers.items[]";
const expectedAgentsPageAdapterStateSource =
  "opl app state --profile fast --json#app_state.agent_packages.directory.entries + app_state.agent_packages.status_index + app_state.runtime_source_carriers.items[]";
const expectedCapabilitiesStateSource =
  "opl app state --profile fast --json#app_state.agent_packages.directory.entries + app_state.agent_packages.status_index + owner capability projections";
const expectedStartupPerformancePolicy = {
  schema: "settings_startup_performance.v1",
  first_window_state_source:
    "renderer_localStorage_allowlisted_fast_state_snapshot_or_loading_shell",
  background_state_source: "opl app state --profile fast --json",
  first_window_blocking_policy:
    "never_wait_for_complete_fast_state_or_page_drilldowns",
  first_window_failure_policy:
    "render_recoverable_nonblank_shell_never_fatal_or_blank_candidate_window",
  cold_budget_ms: 1500,
  warm_budget_ms: 1500,
  budget_scope:
    "stable_shell_first_paint_and_interactive_settings_shell_only_background_hydration_reported_separately",
  ordinary_guid_interactive_target_ms: 1500,
  ordinary_guid_target_scope:
    "OS_launch_request_to_Guid_composer_visible_enabled_and_focusable",
  ordinary_guid_target_status:
    "required_unverified_installed_target_not_current_measurement_or_SLA",
  background_hydration_in_guid_target: false,
  timing_milestones: [
    "stable_shell_first_paint",
    "background_hydration_complete",
  ],
  startup_projection_payload_budget_bytes: 262144,
  lazy_drilldown_routes: ["agents", "capabilities", "storage", "about"],
  single_flight_background_refresh: true,
  global_refresh_on_route_mount: false,
  persisted_snapshot: {
    schema: "opl_settings_startup_snapshot.v1",
    source: "renderer_localStorage_allowlisted_fast_state_cache",
    version: 1,
    freshness_policy: "stale_while_revalidate_with_observed_at_and_stale_fields",
    invalidation: [
      "schema_or_version_mismatch",
      "App_release_identity_change",
      "explicit_sign_out_or_cache_clear",
    ],
    secret_boundary: "allowlisted_read_models_only_no_tokens_passwords_raw_receipts_or_unredacted_errors",
  },
  background_hydration_retry: {
    max_attempts: 2,
    retry_delay_ms: 250,
    clear_single_flight_marker_after_failure: true,
    remount_or_manual_retry_after_exhaustion: true,
  },
  framework_projection_claim:
    "not_proven_by_ui_contract_or_shell_gate",
  live_measurement_gate:
    "installed_App_launch_to_first_window_and_settings_readiness_after_owner_absorption",
};

const expectedLegacyRedirects = {
  ...legacySettingsRouteRedirects,
};

const expectedOptionalResourceProjectionPolicy = {
  source: "settings_control_center.app_settings_read_model.resource_sources",
  record_eligibility:
    "canonical_record_exists_and_contains_at_least_one_resource_source_owner_or_route_ref",
  group_visibility:
    "render_each_resource_category_only_when_that_category_has_at_least_one_eligible_record",
  empty_projection_policy:
    "render_no_external_resource_group_anchor_or_placeholder",
  excluded_builtin_ids: ["opl_gateway", "gateway"],
  ordinary_display_fields: [
    "status",
    "management_mode",
    "resource_source_refs",
    "owner_ref",
    "route_ref",
    "projected_action_refs",
  ],
  forbidden_app_authority: [
    "resource_scheduling",
    "resource_billing",
    "credential_ownership",
    "storage_execution",
    "provider_truth",
  ],
};

const expectedConditionalResourceGroup = {
  id: "conditional_external_resource_refs",
  when:
    "at_least_one_canonical_owner_projected_resource_record_has_a_resource_or_route_ref",
  empty_policy: "omit_group_anchor_and_placeholder",
};

const expectedConditionalResourceSection = {
  ...expectedConditionalResourceGroup,
  empty_policy: "omit_section_anchor_and_placeholder",
};

const expectedAnchorRemap = Object.fromEntries(
  Object.entries(expectedLegacyRedirects).map(([id, target]) => [
    id,
    String(target).split(/[?#]/)[0],
  ]),
);

const expectedSlotKeys = [
  "settings_general",
  "settings_gateway",
  "settings_access",
  "settings_agents",
  "settings_capabilities",
  "settings_environment",
  "settings_storage",
  "settings_theme",
  "settings_personalization",
  "about",
  "update",
  "workspace",
  "local_services",
  "settings_resources",
];

const expectedSettingsAdapterEvidence = [
  "SettingsHost renders ordinary routes from the hydrated App settings registry",
  "SettingsShellAdapterSlot mounts App-owned route slots without shell-owned product IA",
  "legacy route redirects and extension anchor remaps are resolved before shell rendering",
  "AionUI upstream settings intake is classified as accepted/adapt/redirect/reject before registry or slot changes",
];

const expectedPageAdapterEntries = {
  general: "packages/desktop/src/renderer/pages/settings/sections/OverviewSettings.tsx",
  gateway: "packages/desktop/src/renderer/pages/settings/accessProjection.ts",
  access: "packages/desktop/src/renderer/pages/settings/accessProjection.ts",
  workspace: "packages/desktop/src/renderer/pages/settings/sections/WorkspaceSettings.tsx",
  agents: "packages/desktop/src/renderer/pages/settings/agentPackagesProjection.ts",
  capabilities:
    "packages/desktop/src/renderer/pages/settings/capabilitiesProjection.ts",
  resources: "packages/desktop/src/renderer/pages/settings/sections/ResourcesSettings.tsx",
  environment:
    "packages/desktop/src/renderer/pages/settings/RuntimeSettings/runtimeSettingsViewModel.ts",
  storage: "packages/desktop/src/renderer/pages/settings/storageProjection.ts",
  appearance: "packages/desktop/src/renderer/pages/settings/sections/AppearanceSettings.tsx",
  about: "packages/desktop/src/renderer/components/settings/SettingsModal/contents/AboutModalContent.tsx",
};

const expectedVisualQaRoutes = [
  "/settings/general",
  "/settings/gateway",
  "/settings/access",
  "/settings/workspace",
  "/settings/agents",
  "/settings/capabilities",
  "/settings/resources",
  "/settings/environment",
  "/settings/storage",
  "/settings/appearance",
];
const expectedVisualQaSecondaryRoutes = ["/settings/about"];
const expectedVisualQaCompatibilityRedirects = [
  "update->environment#updates",
  "theme->appearance#themes",
  "local-services->environment#services",
  "personalization->workspace#personalization",
];
const expectedVisualQaStatusAnchors = [
  "single_global_search",
  "diagnostics_collapsed_by_default",
  "single_primary_action_max",
  "exception_only_emphasis",
  "bounded_card_hierarchy_baseline_comparison",
  "legacy_or_compatibility_redirect_landing",
];
const expectedVisualQaManifestFields = [
  "command",
  "commit",
  "viewport",
  "route",
  "screenshot_path",
  "status_anchors",
  "baseline_ref",
  "hierarchy_comparison_result",
];

const matrixRouteScopes = {
  settings_general: appOwnedSettingsRouteScopes.settings_general,
  gateway: appOwnedSettingsRouteScopes.gateway,
  access: appOwnedSettingsRouteScopes.access,
  agents: appOwnedSettingsRouteScopes.agents,
  capabilities: appOwnedSettingsRouteScopes.capabilities,
  settings_resources: appOwnedSettingsRouteScopes.resources,
  environment: appOwnedSettingsRouteScopes.environment,
  settings_local_services: appOwnedSettingsRouteScopes.local_services,
  storage: appOwnedSettingsRouteScopes.storage,
  about: appOwnedSettingsRouteScopes.about,
  update: appOwnedSettingsRouteScopes.update,
  settings_theme: appOwnedSettingsRouteScopes.settings_theme,
  settings_personalization:
    appOwnedSettingsRouteScopes.settings_personalization,
  settings_workspace: appOwnedSettingsRouteScopes.workspace,
};

const expectedIaGroupByMatrixPageId = {
  settings_general: "overview",
  gateway: "account_models",
  access: "account_models",
  agents: "agents_capabilities",
  capabilities: "agents_capabilities",
  settings_resources: "connections_deployment",
  environment: "runtime_maintenance",
  settings_local_services: "runtime_maintenance",
  storage: "workspace",
  about: "auxiliary",
  update: "runtime_maintenance",
  settings_theme: "preferences",
  settings_personalization: "agents_capabilities",
  settings_workspace: "workspace",
};

const expectedDestinationByMatrixPageId = {
  settings_general: "overview_status",
  gateway: "account_access",
  access: "models",
  agents: "agents",
  capabilities: "capabilities",
  settings_resources: "resources_connections",
  environment: "runtime_services",
  settings_local_services: "runtime_services",
  storage: "data_storage",
  about: "about",
  update: "updates_repairs",
  settings_theme: "preferences",
  settings_personalization: "instructions_context",
  settings_workspace: "working_directory",
};

export {
  expectedAgentsPageAdapterStateSource,
  expectedAgentsRouteStateSource,
  expectedAnchorRemap,
  expectedCapabilitiesStateSource,
  expectedConditionalResourceGroup,
  expectedConditionalResourceSection,
  expectedDestinationByMatrixPageId,
  expectedIaGroupByMatrixPageId,
  expectedLegacyRedirects,
  expectedOptionalResourceProjectionPolicy,
  expectedPageAdapterEntries,
  expectedSettingsAdapterEvidence,
  expectedSlotKeys,
  expectedStartupPerformancePolicy,
  expectedVisualQaCompatibilityRedirects,
  expectedVisualQaManifestFields,
  expectedVisualQaRoutes,
  expectedVisualQaSecondaryRoutes,
  expectedVisualQaStatusAnchors,
  matrixRouteScopes,
  settingsControlPlaneContractRef,
  settingsIaRef,
};
