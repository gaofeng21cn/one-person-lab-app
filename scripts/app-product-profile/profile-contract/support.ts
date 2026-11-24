import type { AppProductProfile } from '../types.ts';
import {
  assertHomeComposerStateContract,
  expectedHomeComposerDynamicAuthority,
} from '../../app-product-profile-shared-validators.ts';

export const developerProfileCapabilityAxes = [
  'source_channel',
  'workspace_trust',
  'github_authority',
  'agent_automation',
  'runtime_mutation_scope',
];
export function assertStringArray(value: unknown, label: string, options: { allowBlank?: boolean } = {}): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => (
    typeof entry === 'string' && (options.allowBlank || entry.trim())
  ))) {
    throw new Error(`Invalid App product profile ${label}: expected a non-empty string array`);
  }
}

export const dynamicPackagePresentationPolicy = {
  homeShortcuts: {
    role: 'owner_projected_package_presentation',
    shortcut_source_ref: 'app_state.agent_packages.directory.entries[].home_shortcuts[]',
    preference_source_ref: 'app_state.agent_packages.status_index.home_shortcut_preferences[]',
    package_id_allowlist_allowed: false,
    fallback_policy: 'omit_invalid_shortcut_and_preserve_other_packages',
  },
} as const;

export function assertDynamicHomeComposerStateContract(value: AppProductProfile['gui']['home']['home_composer_state_contract'], label: string): void {
  const {
    shortcut_package_membership_source_ref,
    opl_standard_agent_membership_policy,
    shortcut_preference_source_ref,
    shortcut_availability_source_ref,
    unknown_standard_agent_allowed,
    unknown_first_party_opl_standard_agent_allowed,
  } = value;
  if (JSON.stringify({
    shortcut_package_membership_source_ref,
    opl_standard_agent_membership_policy,
    shortcut_preference_source_ref,
    shortcut_availability_source_ref,
    unknown_standard_agent_allowed,
    unknown_first_party_opl_standard_agent_allowed,
  }) !== JSON.stringify(expectedHomeComposerDynamicAuthority)) {
    throw new Error(`${label} must use the dynamic Agent Package directory and Home preference authority`);
  }
  assertHomeComposerStateContract(value, label);
}

export function assertIncludesAll(actual: string[], expected: string[], label: string): void {
  for (const item of expected) {
    if (!actual.includes(item)) {
      throw new Error(`Invalid App product profile ${label}: missing ${item}`);
    }
  }
}

export function assertDeepEqualJson(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must equal ${JSON.stringify(expected)}`);
  }
}

export function assertPostInstallAiSelfCheckEntry(
  entry: AppProductProfile['first_run']['beginner_presentation']['post_install_ai_self_check_entry'],
): void {
  if (
    entry?.trigger !== 'explicit ready entry after ready_to_launch first-run completion' ||
    entry.target_route !== '/guid' ||
    entry.route_state !== 'postInstallSelfCheck' ||
    entry.prompt_policy !==
      'localized Codex CLI post-install diagnostic prompt using canonical Framework state and package-scoped readback' ||
    entry.mutation_policy !== 'diagnose_first_no_file_mutation_without_user_confirmation' ||
    entry.release_gate_policy !== 'user_visible_entry_complements_non_blocking_codex_ai_self_check_receipt'
  ) {
    throw new Error('App product profile first_run.beginner_presentation.post_install_ai_self_check_entry has invalid route or policy');
  }
  assertDeepEqualJson(
    entry.target_state_checks,
    [
      'framework_fast_state_first',
      'codex_cli_and_model_access_core_state',
      'core_ready_separate_from_background_maintenance',
      'ui_language_policy',
      'user_authored_additional_instructions_optional_and_never_generated',
      'user_and_repo_agents_md_respected_no_overwrite',
      'official_profile_user_preferences_and_presence_only_package_scope',
      'installed_or_selected_package_configured_carrier_readback',
      'required_dependencies_and_routes_checked_per_package',
      'opl_flow_context_only_when_installed',
      'user_removed_or_optional_package_absence_not_global_failure',
      'post_maintenance_fresh_state_continuity',
    ],
    'first_run.beginner_presentation.post_install_ai_self_check_entry.target_state_checks',
  );
}
