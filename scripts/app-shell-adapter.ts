import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateGuiProductContractPolicyFields,
} from './app-shell-adapter-contract-validators.ts';
import {
  assertAdapterContractIdentity,
  assertAdapterGuiAuthority,
  assertActiveShellSpecificPolicy,
  assertShellContractPathsAndCapabilities,
  assertShellReplacementPolicy,
  validateChannelThreadBindingBoundary,
  validateCodexExecutableContract,
} from './app-shell-adapter/runtime-validator.ts';
import {
  assertStateSurfaceContract,
  assertValidationCommandPaths,
} from './app-shell-adapter/command-state.ts';
import {
  isExplicitAdapterOverride,
  readJson,
  resolveAdapterContractPath,
  resolveClientRendererAdmission as resolveClientRendererAdmissionFromReader,
  resolveShellAdapterIdentity,
} from './app-shell-adapter/reader.ts';
import type {
  ActiveShellPaths,
  ChannelThreadBindingBoundary,
  ShellAdapterContract,
} from './app-shell-adapter/types.ts';

export type {
  ActiveShellPaths,
  ChannelThreadBindingBoundary,
  ClientRendererAdmission,
  ClientRendererAdmissionDeclaration,
  ClientRendererCompatibilityProfile,
  FirstRunContract,
  IconContract,
  ShellAdapterContract,
  ShellPathContract,
  ValidationCommand,
} from './app-shell-adapter/types.ts';
export {
  DEFAULT_RELEASE_SHELL_OWNED_SURFACE,
  FORBIDDEN_GUI_TRUTH_SOURCES,
  FORBIDDEN_SHELL_OWNED_SURFACES,
  REQUIRED_BASE_SHELL_OWNED_SURFACES,
  REQUIRED_GUI_AUTHORITY_PRODUCT_CONTRACTS,
  STATE_SURFACE_CONTRACT_EXPECTATIONS,
  assertShellReplacementAdoptionGates,
} from './app-shell-adapter/types.ts';
export {
  resolveClientRendererAdmission,
  resolveShellAdapterIdentity,
} from './app-shell-adapter/reader.ts';
export {
  validateChannelThreadBindingBoundary,
  validateCodexExecutableContract,
} from './app-shell-adapter/runtime-validator.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function readAppShellAdapterContract(filePath = resolveAdapterContractPath()): ShellAdapterContract {
  const contract = readJson(filePath) as ShellAdapterContract;
  assertAdapterContractIdentity(contract, { explicitOverride: isExplicitAdapterOverride(filePath) });
  resolveClientRendererAdmissionFromReader(contract);
  validateCodexExecutableContract(contract);
  const shellIdentity = contract.active_shell ?? contract.candidate_shell ?? contract.adapter_id;
  if (shellIdentity === 'opl-studio') {
    validateChannelThreadBindingBoundary(contract.channel_thread_binding_boundary, shellIdentity);
  }
  assertAdapterGuiAuthority(contract);
  assertActiveShellSpecificPolicy(contract);
  assertShellReplacementPolicy(contract);
  assertShellContractPathsAndCapabilities(contract);
  validateGuiProductContractPolicyFields(contract);
  assertStateSurfaceContract(contract);
  assertValidationCommandPaths(contract);
  return contract;
}

function resolveActiveShellRoot(contract = readAppShellAdapterContract()): string {
  const override = process.env.OPL_APP_SHELL_ROOT?.trim();
  return override ? path.resolve(appRoot, override) : path.join(appRoot, contract.shell_root);
}

export function resolveActiveShellPaths(options: { shellRoot?: string; contract?: ShellAdapterContract } = {}): ActiveShellPaths {
  const contract = options.contract ?? readAppShellAdapterContract();
  const clientRendererAdmission = resolveClientRendererAdmissionFromReader(contract);
  const shellRoot = options.shellRoot ? path.resolve(options.shellRoot) : resolveActiveShellRoot(contract);
  const paths = contract.shell_contract.paths;
  const shellRootEnv = process.env.OPL_APP_SHELL_ROOT?.trim();
  return {
    contract,
    clientRendererAdmission,
    shellRoot,
    shellRootForDisplay: options.shellRoot ?? (shellRootEnv || contract.shell_root),
    packageManifestPath: path.join(shellRoot, paths.package_manifest),
    agentsGuidePath: path.join(shellRoot, paths.agents_guide),
    vitestConfigPath: path.join(shellRoot, paths.vitest_config),
    electronBuilderConfigPath: path.join(shellRoot, paths.electron_builder_config),
    desktopReleaseCarrierManifestPath: paths.desktop_release_carrier_manifest
      ? path.join(shellRoot, paths.desktop_release_carrier_manifest)
      : null,
    buildOutputDir: path.join(shellRoot, paths.build_output_dir),
    productProfileTargetPath: path.join(shellRoot, paths.product_profile_target),
    packagedRuntimeRoot: path.join(shellRoot, paths.packaged_runtime_root),
    packagedRuntimeValidatorPath: path.join(shellRoot, paths.packaged_runtime_validator),
    releasePrepareScriptPath: path.join(shellRoot, paths.release_prepare_script),
    releaseVerifyScriptPath: path.join(shellRoot, paths.release_verify_script),
  };
}
