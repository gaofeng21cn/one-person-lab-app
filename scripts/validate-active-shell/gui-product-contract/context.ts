import { readJson } from '../assertions.ts';
import { assertNonEmptyStringArray } from '../shared-contract-validators.ts';
import { productProfilePath, settingsControlPlanePath } from '../validation-config.ts';

export const storageAvailabilityPresentationVariants = {
  web_statistics_not_connected: {
    condition: 'webui_has_no_valid_owner_storage_projection_and_no_explicit_error',
    severity: 'info',
    title_intent: 'current_web_version_cannot_display_storage_usage',
    required_explanation: [
      'browser_access_context',
      'deployment_not_connected_to_storage_statistics_service',
      'existing_data_and_other_features_unaffected',
    ],
    visible_action: {
      id: 'view_deployment_status',
      route: '/settings/environment?section=services',
    },
    retry_visible: false,
  },
  operational_failure: {
    condition: 'explicit_permission_service_ipc_or_unknown_error',
    severity: 'warning',
    localized_reason_required: true,
    recovery_action_required: true,
    retry_policy: 'show_only_when_action_rechecks_the_failed_source',
    technical_details_default: 'collapsed',
  },
};

export const storageUserVisibleImplementationTermsForbidden = [
  'desktop storage carrier',
  'owner projection',
  'carrier host',
];

export const aionuiTeamProbeIds = [
  'team_mode_disabled',
  'team_route_redirect',
  'team_sidebar_gate',
  'team_created_redirect_noop',
  'ordinary_conversation_team_snapshot_scrub',
  'agent_switching_drops_team_mcp',
  'team_deep_link_not_whitelisted',
  'team_bridge_mutation_gate',
];
export const productProfile = readJson(productProfilePath);
export const settingsControlPlane = readJson(settingsControlPlanePath);
export const expectedFirstRunProgressModel = productProfile.first_run?.progress_model;
export const expectedFirstRunCoreItems = assertNonEmptyStringArray(
  productProfile.first_run?.ready_to_launch_gate?.required_core_items,
  'Product profile ready_to_launch required_core_items',
);
export const expectedFullReadinessItems = (productProfile.first_run?.full_readiness_layers ?? [])
  .filter((item) => item !== 'core');
