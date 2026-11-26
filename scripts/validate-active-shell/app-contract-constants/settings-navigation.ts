export const appActionRoute =
  "opl app action execute --action <action_id> [--payload <json>] [--dry-run] --json";
export const appOwnedSettingsIaGroupIds = [
  "overview",
  "account_models",
  "connections_deployment",
  "workspace",
  "agents_capabilities",
  "runtime_maintenance",
  "preferences",
];
export const appOwnedSettingsNavigationDestinationIds = [
  "overview_status",
  "account_access",
  "models",
  "resources_connections",
  "working_directory",
  "data_storage",
  "capabilities",
  "instructions_context",
  "runtime_services",
  "updates_repairs",
  "logs_diagnostics",
  "preferences",
];
export const appOwnedSettingsNavigationDestinationOwners = {
  overview_status: { owner_group_id: "overview", route_id: "general" },
  account_access: { owner_group_id: "account_models", route_id: "gateway" },
  models: { owner_group_id: "account_models", route_id: "access" },
  resources_connections: {
    owner_group_id: "connections_deployment",
    route_id: "resources",
  },
  working_directory: {
    owner_group_id: "workspace",
    route_id: "workspace",
    anchor: "current-workspace",
  },
  data_storage: { owner_group_id: "workspace", route_id: "storage" },
  capabilities: {
    owner_group_id: "agents_capabilities",
    route_id: "capabilities",
  },
  instructions_context: {
    owner_group_id: "agents_capabilities",
    route_id: "workspace",
    anchor: "personalization",
  },
  runtime_services: {
    owner_group_id: "runtime_maintenance",
    route_id: "environment",
    anchor: "services",
  },
  updates_repairs: {
    owner_group_id: "runtime_maintenance",
    route_id: "environment",
    anchor: "updates",
  },
  logs_diagnostics: {
    owner_group_id: "runtime_maintenance",
    route_id: "environment",
    anchor: "diagnostics",
  },
  preferences: { owner_group_id: "preferences", route_id: "appearance" },
};
export const appOwnedSettingsRouteScopes = {
  settings_general: { route_id: "general", route_scope: "ordinary" },
  gateway: { route_id: "gateway", route_scope: "ordinary" },
  access: { route_id: "access", route_scope: "ordinary" },
  agents: { route_id: "agents", route_scope: "ordinary" },
  capabilities: { route_id: "capabilities", route_scope: "ordinary" },
  resources: { route_id: "resources", route_scope: "ordinary" },
  environment: { route_id: "environment", route_scope: "ordinary" },
  storage: { route_id: "storage", route_scope: "ordinary" },
  settings_theme: { route_id: "appearance", route_scope: "ordinary" },
  settings_personalization: {
    route_id: "personalization",
    route_scope: "compatibility_redirect",
  },
  about: { route_id: "about", route_scope: "secondary_or_deep_link" },
  update: { route_id: "update", route_scope: "compatibility_redirect" },
  workspace: { route_id: "workspace", route_scope: "ordinary" },
  local_services: {
    route_id: "local-services",
    route_scope: "compatibility_redirect",
  },
};
export const appOwnedSettingsTaskEntryIds = [
  "gateway_account",
  "model_access",
  "local_runtime_ability",
  "workspace",
  "maintenance_hub",
  "capability_status",
  "remote_access",
  "advanced_deployment",
  "developer_source_control",
  "external_tools_voice",
];
export const appOwnedSettingsTaskEntryMetadataFields = [
  "scope",
  "intent",
  "risk",
  "frequency",
];
export const appOwnedSettingsTopLevelEntryIds = [
  "overview",
  "gateway",
  "models",
  "workspace",
  "agents",
  "capabilities",
  "resources",
  "maintenance",
  "storage",
  "preferences",
];
