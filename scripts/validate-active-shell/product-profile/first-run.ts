import { assertFirstRunProfileShape } from '../../app-product-profile/profile-contract/first-run.ts';
import { assertDeepEqualJson } from '../assertions.ts';
import {
  firstRunModelAccessSetupPolicy,
  focusedFirstRunPresentationPolicy,
} from '../app-contract-constants.ts';
import { validateBeginnerFirstRunPresentation } from '../shared-contract-validators.ts';

const requiredHostTools = [
  'command_line_tools',
  'homebrew',
  'node',
  'git',
];
const fullReadinessItems = [
  'domain_modules',
  'family_runtime_provider',
  'recommended_skills',
  'native_helpers',
  'repo_sync',
  'command_line_tools_install',
  'ecosystem_module_updates',
];
const deferredMaintenanceItems = [
  'repo_sync',
  'module_reconcile',
  'command_line_tools_install',
  'native_helpers',
  'companion_skills_install',
  'ecosystem_module_updates',
];

export function validateFullFirstInstallCoreReadyPolicy(profile) {
  if (JSON.stringify(profile.first_run?.readiness_layers) !== JSON.stringify(['core'])) {
    throw new Error('Product profile ready_to_launch readiness_layers must contain only core');
  }
  assertFirstRunProfileShape(profile);
  validateBeginnerFirstRunPresentation(
    profile.first_run?.beginner_presentation,
    'Product profile first-run beginner presentation',
    profile.first_run.ready_to_launch_gate.required_core_items,
  );
  for (const [field, expected] of Object.entries(focusedFirstRunPresentationPolicy)) {
    if (profile.first_run?.beginner_presentation?.[field] !== expected) {
      throw new Error(
        `Product profile first-run beginner presentation ${field} must be ${expected}`,
      );
    }
  }
  assertDeepEqualJson(
    profile.first_run?.beginner_presentation?.model_access_setup,
    firstRunModelAccessSetupPolicy,
    'Product profile first-run model access setup policy',
  );
  validateReadyToLaunchGate(profile);
  validateOfficialProfileFirstInstallPolicy(profile);
  validateFullFirstInstallBackgroundPolicy(profile);
}

export function validateOfficialProfileFirstInstallPolicy(profile) {
  const execution = profile.official_profile?.first_install_execution;
  if (
    execution?.mode !== 'background_after_core_ready'
    || execution?.guid_navigation_blocking !== false
    || execution?.failure_scope !== 'package_local_nonblocking'
    || execution?.unknown_or_timeout_policy !== 'keep_guid_entry_available_and_report_background_attention'
    || execution?.retry_policy !== 'explicit_first_run_retry_or_settings_agents'
  ) {
    throw new Error('Product profile Official Profile first-install execution must remain background and non-blocking after Core ready');
  }
  assertDeepEqualJson(
    execution.failure_diagnostics?.qualification_terminal_failure_policy,
    {
      standard: 'record_package_failure_without_blocking_host_qualification',
      full: 'fail_immediately_without_retry_or_mutation',
    },
    'Official Profile qualification must separate Standard background diagnostics from Full offline-seed completeness',
  );
}

function validateReadyToLaunchGate(profile) {
  const launchGate = profile.first_run?.ready_to_launch_gate;
  if (launchGate.id !== 'ready_to_launch') {
    throw new Error('Product profile ready_to_launch gate id must be ready_to_launch');
  }
  for (const item of fullReadinessItems) {
    if (!launchGate?.must_not_require?.includes(item)) {
      throw new Error(`Product profile ready_to_launch gate must not require ${item}`);
    }
    if (!profile.first_run?.full_readiness_layers?.includes(item)) {
      throw new Error(`Product profile full readiness layers must include ${item}`);
    }
  }
  if (
    profile.first_run?.runtime_provider?.full_readiness_provider !== 'temporal'
    || profile.first_run.runtime_provider.ready_to_launch_blocking !== false
  ) {
    throw new Error('Product profile full runtime provider must stay Temporal and non-blocking for ready_to_launch');
  }
}

export function validateFullFirstInstallBackgroundPolicy(profile) {
  const fullFirstInstall = profile.first_run?.core_ready_policy?.full_first_install_clean_machine;
  for (const tool of requiredHostTools) {
    if (!fullFirstInstall?.missing_host_tools_allowed?.includes(tool)) {
      throw new Error(`Product profile Full first-install policy must allow missing ${tool}`);
    }
  }
  if (fullFirstInstall?.initial_runtime_source !== 'bundled_runtime' || fullFirstInstall?.core_ready_without_host_tools !== true) {
    throw new Error('Product profile Full first-install must reach Core ready through bundled_runtime without host tools');
  }
  for (const blocker of deferredMaintenanceItems) {
    if (!fullFirstInstall?.must_not_block_core_ready?.includes(blocker)) {
      throw new Error(`Product profile Full first-install must not block Core ready on ${blocker}`);
    }
    if (!profile.first_run?.background_maintenance?.items?.includes(blocker)) {
      throw new Error(`Product profile background maintenance must include ${blocker}`);
    }
  }
  if (profile.first_run?.background_maintenance?.blocks_core_ready !== false) {
    throw new Error('Product profile background maintenance must not block Core ready');
  }
  if (
    profile.first_run?.background_maintenance?.mode !== 'best_effort_after_core_ready'
    || profile.first_run?.background_maintenance?.continues_after_core_ready !== true
  ) {
    throw new Error('Product profile background maintenance must continue best-effort after Core ready');
  }
  if (
    fullFirstInstall?.post_core_ready_background_policy?.mode !== 'best_effort_non_blocking'
    || fullFirstInstall?.post_core_ready_background_policy?.continues_after_core_ready !== true
  ) {
    throw new Error('Product profile Full first-install must continue best-effort maintenance after Core ready');
  }
  for (const blocker of deferredMaintenanceItems) {
    if (!fullFirstInstall?.post_core_ready_background_policy?.managed_items?.includes(blocker)) {
      throw new Error(`Product profile Full first-install post-Core maintenance must manage ${blocker}`);
    }
  }
}
