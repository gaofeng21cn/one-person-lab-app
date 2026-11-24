import {
  assertHomeComposerDynamicAuthority,
  assertHomeComposerStateContract,
} from '../../app-product-profile-shared-validators.ts';

export const appOwnedOfficialProfileRestoreAction = {
  id: 'official_profile_restore',
  owner: 'one-person-lab-app',
  surface: 'settings_agents_secondary_action',
  scope: 'whole_official_profile',
  confirmation_required: true,
  invocation_policy: 'explicit_user_confirmation_only',
  request: {
    bridge: 'ipcBridge.oplRuntime.applyOfficialProfile',
    helper: 'official-profile-package-apply',
    payload: { intent: 'explicit_restore' },
  },
  desired_roots_source_ref: 'contracts/app-product-profile.json#official_profile.desired_root_package_ids',
  framework_projected_single_package_action: false,
  automatic_invocation: {
    app_startup_or_restart: false,
    daily_maintenance: false,
    app_update_or_carrier_change: false,
  },
  persistence: {
    desired_state_saved: false,
    startup_maintenance_registered: false,
    automatic_reapply_allowed: false,
  },
  post_success_readback: {
    source: 'opl app state --profile fast --json',
    force_fresh: true,
  },
  required_dom_testid: 'settings-agents-restore-official-profile',
};

export function validateDynamicHomeComposerStateContract(value, label) {
  assertHomeComposerDynamicAuthority(value, label);
  assertHomeComposerStateContract(value, label);
}
