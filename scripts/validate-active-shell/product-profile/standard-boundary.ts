import { assertCompanionPayloadProfileShape } from '../../app-product-profile/profile-contract/companion.ts';
import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';
import { forbiddenAuthorityOwners } from '../app-contract-constants.ts';

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

export function validateStandardUpdatePolicy(profile, releaseChannel) {
  const updater = profile.first_run?.updates?.standard_channel;
  assertDeepEqualJson(
    updater?.metadata_scope,
    releaseChannel.standard_updater.allowed_metadata,
    'Product profile Standard updater metadata bridge',
  );
  if (
    updater?.implementation_reference !== 'electron_autoUpdater_background_download_silent_install_on_quit'
    || updater.ready_prompt !== 'status_only_install_on_normal_restart'
    || updater.full_first_install_metadata_allowed !== false
    || updater.download_policy !== 'background_download'
    || updater.apply_policy !== 'restart_when_ready'
    || updater.blocks_core_ready !== false
  ) {
    throw new Error('Product profile standard updates must download in background, prompt restart after ready, exclude Full metadata, and not block Core ready');
  }
}

export function validateCompanionPayloadAuthority(profile, installExposurePolicy) {
  assertCompanionPayloadProfileShape(profile);
  const companion = profile.companion_payloads;
  if (companion.exposure_classes_ref !== `${companion.install_exposure_policy_ref}#exposure_classes`) {
    throw new Error('Product profile companion payloads must reference install exposure classes');
  }
  if (companion.public_abi.primary_semantic_entry !== installExposurePolicy.public_abi?.primary_semantic_entry) {
    throw new Error('Product profile companion payload public ABI must match install exposure primary semantic entry');
  }
  if (companion.public_abi.preferred_app_distribution !== 'plugin_packaged_skill') {
    throw new Error('Product profile companion payloads must prefer plugin-packaged skills for the App path');
  }
  if (companion.public_abi.cli_and_app_share_skill_semantics !== true) {
    throw new Error('Product profile companion payloads must keep CLI and App on shared skill semantics');
  }
  assertIncludesAll(
    companion.domain_modules,
    ['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-meta-agent', 'opl-bookforge'],
    'Product profile domain module composition',
  );
}

export function validateProductProfileBoundary(profile) {
  for (const forbidden of forbiddenAuthorityOwners) {
    if (!profile.boundary?.app_does_not_own?.includes(forbidden)) {
      throw new Error(`Product profile boundary must exclude ${forbidden}`);
    }
  }
}
