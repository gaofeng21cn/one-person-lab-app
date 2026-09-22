import { assertDeepEqualJson } from '../assertions.ts';
import { assertCommandSurface } from '../value-helpers.ts';

export function validateGuiContractDeveloperProfileAndPageInventory(guiContract, releaseChannel) {
  const developerProfile = guiContract.developer_profile;
  if (!developerProfile || typeof developerProfile !== 'object') {
    throw new Error('App GUI contract must declare Developer Profile capabilities');
  }
  const developerProfileCapabilityAxes = developerProfile.capability_axes;
  if (!Array.isArray(developerProfileCapabilityAxes) || developerProfileCapabilityAxes.length === 0) {
    throw new Error('App GUI Developer Profile must declare capability axes');
  }
  assertDeepEqualJson(
    Object.keys(developerProfile.capabilities ?? {}),
    developerProfileCapabilityAxes,
    'App GUI Developer Profile capability axes and capability map keys',
  );
  if (
    developerProfile.default_profile !== 'standard_user' ||
    developerProfile.opt_in_policy !== 'automatic_for_matching_identity_and_authorized_repositories_with_explicit_off' ||
    developerProfile.ordinary_user_defaults?.source_channel !== 'agent_rolling_latest_package_channel' ||
    developerProfile.ordinary_user_defaults?.agent_automation !== 'automatic_clean_managed_agent_package_updates'
  ) {
    throw new Error('App GUI Developer Profile must preserve standard user defaults and explicit opt-in');
  }
  for (const axis of developerProfileCapabilityAxes) {
    const capability = developerProfile.capabilities?.[axis];
    if (!capability?.standard_default || !capability.developer_opt_in || !capability.display_policy) {
      throw new Error(`App GUI Developer Profile capability ${axis} must declare defaults, opt-in, and display policy`);
    }
  }
  if (
    developerProfile.capabilities.source_channel.developer_opt_in !== 'github_repo_or_local_checkout' ||
    developerProfile.capabilities.agent_automation.standard_default !== 'automatic_clean_managed_agent_package_updates' ||
    developerProfile.capabilities.runtime_mutation_scope.standard_default !== 'app_action_route_only' ||
    developerProfile.settings_pages?.length !== 1 ||
    developerProfile.settings_pages[0] !== 'settings_agents' ||
    developerProfile.control_model?.source_mode?.control !== 'three_state_segmented_control' ||
    JSON.stringify(developerProfile.control_model?.source_mode?.values) !== JSON.stringify(['auto', 'managed', 'developer']) ||
    JSON.stringify(developerProfile.control_model?.source_mode?.labels) !==
      JSON.stringify(['automatic', 'managed', 'developer']) ||
    developerProfile.control_model?.safe_maintenance?.control !== 'auto_or_off_control_with_effective_state_readback' ||
    developerProfile.control_model.safe_maintenance.default !== 'auto' ||
    JSON.stringify(developerProfile.control_model.safe_maintenance.values) !== JSON.stringify(['auto', 'off']) ||
    developerProfile.control_model.safe_maintenance.off_value !== 'external_observe' ||
    developerProfile.control_model.safe_maintenance.effective_value !== 'developer_apply_safe' ||
    developerProfile.control_model.safe_maintenance.fast_profile_policy !==
      'show inspection pending without claiming identity mismatch' ||
    developerProfile.control_model.safe_maintenance.shared_runtime_mutation_boundary !==
      'enabled=on + mode=developer_apply_safe + source=user_config' ||
    developerProfile.control_model?.safe_maintenance?.independent_from_source_selection !== true ||
    developerProfile.control_model?.package_source?.control !== 'segmented_control_in_package_details' ||
    !developerProfile.must_show?.includes(
      'Maintain authorized development repositories auto/off control with effective state',
    ) ||
    !developerProfile.must_show?.includes('per-package auto managed developer source control') ||
    !developerProfile.must_not_show?.includes('five equal capability-axis cards')
  ) {
    throw new Error('App GUI Developer Profile must keep source controls and automatic safe-maintenance readback on Agents');
  }

  assertDeepEqualJson(
    guiContract.release_channel_policy?.stable?.must_gate,
    releaseChannel.release_validation_profiles.stable.required_lanes,
    'App GUI stable release required lanes',
  );
  assertDeepEqualJson(
    guiContract.release_channel_policy?.nightly?.must_gate,
    releaseChannel.release_validation_profiles.nightly_standard.required_lanes,
    'App GUI nightly release required lanes',
  );
  for (const lane of releaseChannel.release_validation_profiles.nightly_standard.forbidden_lanes) {
    if (!guiContract.release_channel_policy?.nightly?.must_not_gate?.includes(lane)) {
      throw new Error(`App GUI nightly release policy must exclude ${lane}`);
    }
  }

  const pages = guiContract.pages ?? {};
  for (const pageId of [
    'guid_home',
    'settings_general',
    'settings_gateway',
    'settings_access',
    'settings_workspace',
    'settings_agents',
    'settings_capabilities',
    'settings_resources',
    'settings_environment',
    'settings_storage',
    'about',
    'update',
    'settings_theme',
    'settings_local_services',
    'settings_personalization',
  ]) {
    if (!pages[pageId]) {
      throw new Error(`App GUI contract missing page ${pageId}`);
    }
  }
  for (const pageId of [
    'guid_home',
    'settings_general',
    'settings_gateway',
    'settings_access',
    'settings_agents',
    'settings_environment',
    'about',
    'update',
    'settings_theme',
  ]) {
    const expectedStateSource = pageId === 'settings_gateway'
      ? 'dedicated cached Gateway projection followed by app_action_execution.result.gateway_account'
      : pageId === 'settings_environment'
      ? 'opl app state --profile fast --json + application.systemInfo.logDir when the carrier exposes systemInfo'
      : 'opl app state --profile fast --json';
    assertCommandSurface(pages[pageId].state_source, expectedStateSource, `App GUI ${pageId} state source`);
    const expectedRefreshSource = pageId === 'settings_gateway'
      ? 'opl app action execute --action gateway_account_refresh --json'
      : pageId === 'settings_general'
      ? 'background opl app state --profile fast --json with bounded retry'
      : pageId === 'about'
        ? 'startup check once or explicit manual check updates the same shared store'
        : 'opl app state --profile fast --json';
    assertCommandSurface(pages[pageId].refresh_source, expectedRefreshSource, `App GUI ${pageId} refresh source`);
  }
}
