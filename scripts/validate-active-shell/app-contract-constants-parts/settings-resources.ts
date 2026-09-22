import { appOwnedSecondarySettingsPages } from './settings-core.ts';
import { appOwnedSettingsTopLevelEntryIds } from './settings-navigation.ts';

export const appOwnedWebuiDataVolumeHostActionCapabilityId =
  "carrier_host.storage.webui_data_volume.lifecycle";
export const appOwnedWebuiDataVolumeHostActionAbiRef =
  "contracts/app-release-channel.json#local_data_lifecycle.owner_storage_projections.webui_data_volume.host_action_abi";
export const appOwnedStorageCarrierBehavior = {
  desktop: {
    core_route: "/settings/storage",
    local_lifecycle_transport: "electron_ipc",
    local_sections: [
      "updater_cache",
      "user_data_artifacts",
      "runtime_substrate",
      "logs",
    ],
    owner_projection_policy: "merge_valid_sections_non_blocking",
  },
  webui: {
    core_route: "/settings/storage",
    local_lifecycle_transport: "owner_projected_host_action_only_no_electron_ipc",
    local_sections: [],
    visible_section_source: "valid_owner_projections_only",
    missing_projection_policy:
      "fail_open_keep_route_available_and_omit_missing_sections",
    manual_refresh:
      "owner_inventory_actions_all_settled_then_force_fresh_fast_app_state",
    unknown_bytes_policy: "unavailable_never_zero",
    host_action_abi_ref: appOwnedWebuiDataVolumeHostActionAbiRef,
    host_action_policy:
      "complete_carrier_host_abi_enables_plan_execute_restore_else_status_only_fail_open",
    shell_or_docker_action_inference_allowed: false,
    raw_host_paths_visible: false,
  },
};
export const appOwnedSettingsProductPageIds = [
  ...appOwnedSettingsTopLevelEntryIds,
  ...appOwnedSecondarySettingsPages,
];
export const appOwnedSettingsTechnicalDetailsDefault = {
  overview: "not_applicable",
  gateway: "not_applicable",
  models: "not_applicable",
  workspace: "explicit_action_modal",
  agents: "collapsed",
  capabilities: "collapsed",
  resources: "explicit_action_modal",
  maintenance: "collapsed",
  storage: "explicit_action_modal",
  preferences: "not_applicable",
  about: "explicit_action_modal",
};
export const appOwnedSettingsPageAnchors = {
  overview: ["status", "attention", "next-action", "codex", "gateway"],
  gateway: ["connection", "account", "usage", "access"],
  models: ["provider-source", "model", "codex-cli"],
  workspace: [
    "current-workspace",
    "permissions",
    "artifacts",
    "personalization",
    "system-agents",
    "additional-instructions",
  ],
  agents: ["catalog", "package-role", "availability", "source", "home-visibility"],
  capabilities: ["opl-flow-managed", "opl-managed-companion", "third-party", "voice-input", "packages"],
  resources: [
    "local-browser-access",
    "web-access",
    "resource-readiness",
    "action-readiness",
    "external-resources",
  ],
  maintenance: ["health", "managed-dependencies", "updates", "services", "diagnostics"],
  storage: [
    "storage-categories",
    "deployment-locations",
    "archives",
    "cleanup-preview",
    "cleanup-history",
  ],
  preferences: [
    "behavior",
    "notifications",
    "models-performance",
    "display-fonts",
    "themes",
  ],
  about: ["version", "channel", "updates", "help-feedback"],
};
export const appOwnedSettingsPageSearchEntryIds = {
  overview: [
    "overview.status",
    "overview.attention",
    "overview.next_action",
    "overview.codex",
    "overview.gateway",
  ],
  gateway: ["gateway.connection", "gateway.account", "gateway.usage", "gateway.access"],
  models: ["models.provider_source", "models.model", "models.codex_cli"],
  workspace: [
    "workspace.current",
    "workspace.permissions",
    "workspace.artifacts",
    "personalization.system_agents",
    "personalization.additional_instructions",
  ],
  agents: [
    "agents.catalog",
    "agents.availability",
    "agents.source",
    "agents.home_visibility",
  ],
  capabilities: [
    "capabilities.opl_flow_managed",
    "capabilities.opl_managed_companion",
    "capabilities.third_party",
    "capabilities.image_voice",
    "capabilities.packages",
  ],
  resources: [
    "resources.local_browser_access",
    "resources.web_access",
    "resources.readiness",
    "resources.executable",
    "resources.external",
  ],
  maintenance: [
    "maintenance.health",
    "maintenance.managed_dependencies",
    "maintenance.updates",
    "maintenance.services",
    "maintenance.diagnostics",
    "maintenance.log_directory",
  ],
  storage: [
    "storage.categories",
    "storage.deployment_locations",
    "storage.archives",
    "storage.preview",
    "storage.history",
  ],
  preferences: [
    "preferences.behavior",
    "preferences.notifications",
    "preferences.performance",
    "preferences.display_fonts",
    "preferences.themes",
  ],
  about: [
    "about.version",
    "about.channel",
    "about.help_feedback",
    "about.updates",
  ],
};
export const appOwnedSettingsCapabilitiesTabContract = {
  surface_label_zh: "能力",
  surface_label_en: "Capabilities",
  tab_order: ["desktop", "opl_flow_managed", "manual_and_third_party", "image_voice", "packages"],
  default_tab: "opl_flow_managed",
  on_demand_tab_ids: [],
};
export const appOwnedSettingsResourcesBrowserEntry = {
  label_zh: "这台电脑的浏览器访问",
  label_en: "Browser access to this computer",
  placement: "resources_primary_information",
  visibility: "always",
  action_policy: "open_existing_local_browser_access_settings",
  implementation_provenance_visibility: "technical_details_only",
};
export const appOwnedSettingsResourceActionBehavior = {
  read_only_actions: {
    open: {
      execution_policy: "navigate_shell_to_projected_browser_url",
      required_projection_field: "browser_url",
      completion_evidence: "shell_navigation_dispatched_to_exact_browser_url",
    },
    diagnose: {
      execution_policy: "invoke_projected_diagnose_action_and_render_result",
      completion_evidence: "diagnose_result_or_action_receipt_visible",
    },
  },
  mutating_actions: {
    precheck_required: true,
    explicit_confirmation_required: true,
    execution_policy:
      "execute_projected_mutation_only_after_successful_precheck_and_explicit_confirmation",
    completion_evidence: "mutation_result_or_action_receipt_visible",
  },
  dry_run_boundary: {
    role: "precheck_only",
    allowed_claim: "precheck_passed",
    forbidden_completion_claims: [
      "resource_opened",
      "diagnosis_completed_without_diagnose_execution",
      "deployment_completed",
      "mutation_completed",
    ],
  },
};
export const appOwnedSettingsProjectionSectionIds = [
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
export const appOwnedSettingsProjectionItemFields = [
  "item_id",
  "surface_class",
  "scope",
  "owner",
  "risk",
  "normal_summary",
  "next_action",
  "details_ref",
  "editable_reason",
];
