export const appOwnedSettingsIssueStatuses = [
  "needs_action",
  "in_progress",
  "resolved",
  "blocked",
  "dismissed",
];
export const appOwnedSettingsPageExperienceFields = [
  "product_page_id",
  "route_id",
  "matrix_page_id",
  "label_zh",
  "label_en",
  "primary_information",
  "first_viewport_groups",
  "primary_action",
  "exception_state",
  "technical_details_boundary",
  "required_dom",
  "required_anchors",
  "search_entry_ids",
];
export const appOwnedSettingsSearchEntryFields = [
  "id",
  "page_id",
  "anchor",
  "label_zh",
  "label_en",
  "keywords_zh",
  "keywords_en",
];
export const appOwnedSettingsCardFields = [
  "id",
  "title",
  "state",
  "summary",
  "recommended_action",
  "last_checked_at",
  "details_disclosure",
];
export const appOwnedSettingsConfirmationFields = [
  "action_id",
  "summary",
  "will_change",
  "will_not_change",
  "rollback_or_receipt",
  "requires_preview_or_proof",
];
export const appOwnedSettingsPostUpdateNoticeFields = [
  "component_id",
  "result",
  "receipt_ref",
  "next_check",
  "restart_or_reload_guidance",
];
export const appOwnedSettingsMakeUsableAllowedSteps = [
  "run existing repair prep",
  "check managed update status",
  "repair components with explicit repair receipt",
  "apply safe non-restart package or Codex Surface sync actions",
  "refresh fast App state",
];
export const appOwnedSettingsMakeUsableForbiddenSteps = [
  "implement a second updater kernel",
  "write runtime truth, domain truth, owner receipts, or typed blockers",
  "silently apply OPL Runtime Fabric changes that require restart",
  "silently update dirty or developer checkouts",
  "rollback automatically without explicit per-component user confirmation",
];
export const appOwnedSettingsVisualQaTargets = [
  "desktop_settings_overview",
  "desktop_settings_gateway",
  "desktop_settings_models",
  "desktop_settings_workspace",
  "desktop_settings_agents",
  "desktop_settings_capabilities",
  "desktop_settings_resources",
  "desktop_settings_maintenance",
  "desktop_settings_storage",
  "desktop_settings_preferences",
];
export const appOwnedSettingsProductSystemTracks = [
  "product_positioning",
  "ia_routes",
  "control_plane",
  "shell_adapter",
  "state_action_protocol",
  "user_task_ux",
  "visual_qa",
  "ops_hygiene",
  "release_currentness",
];
export const legacySettingsRouteRedirects = {
  overview: "general",
  runtime: "environment",
  system: "environment#diagnostics",
  advanced: "environment#diagnostics",
  model: "access",
  agent: "agents",
  assistants: "capabilities#third-party",
  "skills-hub": "capabilities#opl-flow-managed",
  tools: "capabilities#third-party",
  display: "appearance",
  webui: "resources",
  pet: "appearance",
};
