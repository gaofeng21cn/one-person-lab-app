import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';
import {
  forbiddenAuthorityOwners,
} from '../app-contract-constants.ts';
import { assertFirstRunProgressModelShape } from '../shared-contract-validators.ts';

export function validateFirstRunProgressModel(profile) {
  assertFirstRunProgressModelShape(profile.first_run?.progress_model, 'Product profile first-run progress model');
}

export function validateStandardPackagePolicy(profile) {
  const standardPackage = profile.first_run?.core_ready_policy?.standard_package;
  if (
    standardPackage?.bootstrap_owner !== 'app_managed'
    || standardPackage?.maintenance_owner !== 'app_managed'
    || standardPackage?.user_first_screen_terminal_instruction_allowed !== false
    || standardPackage?.manual_host_tool_install_terminal_state_allowed !== false
    || standardPackage?.maintenance_resolution_policy !== 'app_or_cli_managed_best_effort_until_ready'
  ) {
    throw new Error('Product profile standard package must use App-managed bootstrap/maintenance without terminal-install end states');
  }
  for (const forbidden of ['install_homebrew_first', 'install_node_first', 'install_git_first']) {
    if (!standardPackage?.forbidden_terminal_instruction_end_states?.includes(forbidden)) {
      throw new Error(`Product profile standard bootstrap must forbid ${forbidden}`);
    }
  }
}

export function validateCommandLineToolsPolicy(profile) {
  if (profile.first_run?.command_line_tools?.installer_command !== 'xcode-select --install') {
    throw new Error('Product profile CLT installer command must be xcode-select --install');
  }
  if (profile.first_run?.command_line_tools?.system_installer_only !== true) {
    throw new Error('Product profile CLT installer must use the macOS system installer path');
  }
  if (profile.first_run?.command_line_tools?.waits_for_user_confirmation !== true) {
    throw new Error('Product profile CLT installer must wait for user confirmation');
  }
}

export function validateStandardUpdatePolicy(profile) {
  assertDeepEqualJson(
    profile.first_run?.updates?.standard_channel?.metadata_scope,
    ['latest-mac.yml', 'latest-arm64-mac.yml'],
    'Product profile Standard updater metadata bridge',
  );
  if (
    profile.first_run?.updates?.standard_channel?.implementation_reference !== 'electron_autoUpdater_background_download_silent_install_on_quit'
    || profile.first_run?.updates?.standard_channel?.ready_prompt !== 'status_only_install_on_normal_restart'
    || profile.first_run?.updates?.standard_channel?.full_first_install_metadata_allowed !== false
    || profile.first_run?.updates?.standard_channel?.download_policy !== 'background_download'
    || profile.first_run?.updates?.standard_channel?.apply_policy !== 'restart_when_ready'
    || profile.first_run?.updates?.standard_channel?.blocks_core_ready !== false
  ) {
    throw new Error('Product profile standard updates must download in background, prompt restart after ready, exclude Full metadata, and not block Core ready');
  }
}

export function validateCompanionPayloadAuthority(profile, installExposurePolicy) {
  if (profile.companion_payloads?.install_exposure_policy_ref !== 'contracts/app-install-exposure-policy.json') {
    throw new Error('Product profile companion payloads must reference app-install-exposure-policy.json');
  }
  if (profile.companion_payloads?.exposure_classes_ref !== 'contracts/app-install-exposure-policy.json#exposure_classes') {
    throw new Error('Product profile companion payloads must reference install exposure classes');
  }
  if (profile.companion_payloads?.public_abi?.primary_semantic_entry !== installExposurePolicy.public_abi?.primary_semantic_entry) {
    throw new Error('Product profile companion payload public ABI must match install exposure primary semantic entry');
  }
  if (profile.companion_payloads.public_abi.preferred_app_distribution !== 'plugin_packaged_skill') {
    throw new Error('Product profile companion payloads must prefer plugin-packaged skills for the App path');
  }
  if (profile.companion_payloads.public_abi.plugin_must_not_create_second_semantics !== true) {
    throw new Error('Product profile companion payloads must forbid second semantics from plugin packaging');
  }
  if (profile.companion_payloads.public_abi.cli_and_app_share_skill_semantics !== true) {
    throw new Error('Product profile companion payloads must keep CLI and App on shared skill semantics');
  }
  const strategy = profile.companion_payloads?.capability_strategy_consumer;
  if (
    strategy?.strategy_authority !== 'opl-flow'
    || strategy.compiler_authority !== 'opl-framework'
    || strategy.runtime_projection_ref !==
      'app_state.agent_packages.status_index.packages.opl-flow.capability_strategy'
    || strategy.full_build_lock_kind !== 'opl_flow_capability_build_lock.v1'
    || strategy.app_policy_inventory_allowed !== false
    || strategy.app_direct_workflow_policy_parse_allowed !== false
  ) {
    throw new Error('Product profile must consume the Framework-compiled OPL Flow capability strategy');
  }
  assertIncludesAll(
    profile.companion_payloads?.domain_modules,
    ['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-meta-agent', 'opl-bookforge'],
    'Product profile domain module composition',
  );
  if (profile.companion_payloads.domain_plugin_skills_must_not_be_companion_mirrors !== true) {
    throw new Error('Product profile domain plugin skills must not be companion skill mirrors');
  }
}

export function validateProductProfileBoundary(profile) {
  for (const forbidden of forbiddenAuthorityOwners) {
    if (!profile.boundary?.app_does_not_own?.includes(forbidden)) {
      throw new Error(`Product profile boundary must exclude ${forbidden}`);
    }
  }
}
