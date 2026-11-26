import { appOwnedSettingsRouteScopes, legacySettingsRouteRedirects } from "../app-contract-constants.ts";

const settingsIaRef =
  "contracts/app-gui-product-contract.json#settings_navigation.settings_ia";
const settingsControlPlaneContractRef =
  "contracts/app-settings-control-plane.json";
const expectedAgentsRouteStateSource =
  "opl app state --profile fast --json#app_state.agent_packages.directory.entries + app_state.agent_packages.status_index + app_state.runtime_source_carriers.items[]";
const expectedCapabilitiesStateSource =
  "opl app state --profile fast --json#app_state.agent_packages.directory.entries + app_state.agent_packages.status_index + owner capability projections";
const expectedLegacyRedirects = {
  ...legacySettingsRouteRedirects,
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

const expectedRequiredSettingsPageIds = [
  "general",
  "gateway",
  "access",
  "workspace",
  "agents",
  "capabilities",
  "resources",
  "environment",
  "storage",
  "appearance",
  "about",
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
  expectedAgentsRouteStateSource,
  expectedAnchorRemap,
  expectedCapabilitiesStateSource,
  expectedConditionalResourceGroup,
  expectedConditionalResourceSection,
  expectedDestinationByMatrixPageId,
  expectedIaGroupByMatrixPageId,
  expectedLegacyRedirects,
  expectedRequiredSettingsPageIds,
  expectedSlotKeys,
  expectedVisualQaManifestFields,
  expectedVisualQaStatusAnchors,
  matrixRouteScopes,
  settingsControlPlaneContractRef,
  settingsIaRef,
};
