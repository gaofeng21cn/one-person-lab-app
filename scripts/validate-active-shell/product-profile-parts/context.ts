import {
  assertHomeComposerDynamicAuthority,
  assertHomeComposerStateContract,
} from '../../app-product-profile-shared-validators.ts';

export function validateDynamicHomeComposerStateContract(value, label) {
  assertHomeComposerDynamicAuthority(value, label);
  assertHomeComposerStateContract(value, label);
}

export const requiredHostTools = [
  'command_line_tools',
  'homebrew',
  'node',
  'git',
];
export const fullReadinessItems = [
  'domain_modules',
  'family_runtime_provider',
  'recommended_skills',
  'native_helpers',
  'repo_sync',
  'command_line_tools_install',
  'ecosystem_module_updates',
];
export const deferredMaintenanceItems = [
  'repo_sync',
  'module_reconcile',
  'command_line_tools_install',
  'native_helpers',
  'companion_skills_install',
  'ecosystem_module_updates',
];
