#!/usr/bin/env node

import { assertAppRootBoundary } from './app-root-boundary.ts';
import { readAppShellAdapterContract, resolveActiveShellPaths } from './app-shell-adapter.ts';
import { ensureActiveShellCheckout } from './active-shell-checkout.ts';
import { readJson } from './validate-active-shell/assertions.ts';
import { validateContractShape } from './validate-active-shell/active-shell-contract.ts';
import { runCommand } from './validate-active-shell/command-runner.ts';
import { validateDistributionInstallSsot } from './validate-active-shell/distribution-install-ssot-validator.ts';
import { validateActiveShellImplementation } from './validate-active-shell/shell-implementation-validator.ts';
import { validateShellThreadCoordination } from './validate-active-shell/shell-thread-coordination-validator.ts';
import { validateAppGuiProductContract } from './validate-active-shell/gui-product-contract-validator.ts';
import { validateFirstRunMatrix } from './validate-active-shell/first-run-matrix-validator.ts';
import { validateFirstRunCompiledExpectations } from './validate-active-shell/first-run-expectation-contract-validator.ts';
import { validateInstallExposurePolicy } from './validate-active-shell/install-exposure-policy-validator.ts';
import { validatePageStateMatrix } from './validate-active-shell/page-state-matrix-validator.ts';
import { validateProductProfile } from './validate-active-shell/product-profile-validator.ts';
import { validateReleaseChannelContract } from './validate-active-shell/release-contract-validator.ts';
import { validateReleaseEvidenceBundle } from './validate-active-shell/release-evidence-bundle-validator.ts';
import { validateSettingsControlPlane } from './validate-active-shell/settings-control-plane-validator.ts';
import {
  validateLiveOplConformance,
  validateRuntimeBridgeContract,
} from './validate-active-shell/runtime-bridge-validator.ts';
import {
  firstRunMatrixPath,
  firstRunCompiledExpectationsPath,
  guiProductContractPath,
  installExposurePolicyPath,
  pageStateMatrixPath,
  parseArgs,
  productProfilePath,
  releaseChannelPath,
  runtimeBridgePath,
  settingsControlPlanePath,
} from './validate-active-shell/validation-config.ts';

assertAppRootBoundary({ phase: 'active shell validation' });
const args = parseArgs(process.argv);
const contract = readAppShellAdapterContract();
const shellPaths = resolveActiveShellPaths({ contract });
const requestedShellRef = process.env.OPL_APP_SHELL_REF?.trim();
ensureActiveShellCheckout({
  shellRoot: shellPaths.shellRoot,
  repo: process.env.OPL_APP_SHELL_REPO || `git@github.com:${contract.shell_source.owner_repo}.git`,
  ref: requestedShellRef || contract.shell_source.default_ref || 'main',
  alignRef: Boolean(requestedShellRef),
});
const guiProductContract = readJson(guiProductContractPath);
const runtimeBridge = readJson(runtimeBridgePath);
const pageStateMatrix = readJson(pageStateMatrixPath);
const settingsControlPlane = readJson(settingsControlPlanePath);
const firstRunMatrix = readJson(firstRunMatrixPath);
const releaseChannel = readJson(releaseChannelPath);
const installExposurePolicy = readJson(installExposurePolicyPath);
const productProfile = readJson(productProfilePath);

validateContractShape(contract);
validateRuntimeBridgeContract(runtimeBridge, contract);
validateInstallExposurePolicy(installExposurePolicy);
validateDistributionInstallSsot(releaseChannel, installExposurePolicy);
validateAppGuiProductContract(guiProductContract, releaseChannel, installExposurePolicy);
validatePageStateMatrix(pageStateMatrix, contract, guiProductContract);
validateSettingsControlPlane(settingsControlPlane, guiProductContract, pageStateMatrix, productProfile, contract);
validateFirstRunMatrix(firstRunMatrix, contract);
validateFirstRunCompiledExpectations({
  compiledPath: firstRunCompiledExpectationsPath,
  gui: guiProductContract,
  matrix: firstRunMatrix,
  pageState: pageStateMatrix,
  productProfile,
  release: releaseChannel,
});
validateProductProfile(productProfile, installExposurePolicy);
validateReleaseChannelContract(releaseChannel, shellPaths);
validateReleaseEvidenceBundle(releaseChannel, firstRunMatrix);
validateActiveShellImplementation(shellPaths);
validateShellThreadCoordination(shellPaths);
validateLiveOplConformance(runtimeBridge);

if (args.quick) {
  console.log('Active shell contract is structurally valid.');
  process.exit(0);
}

const commands = contract.validation_commands.filter((entry) => args.only.size === 0 || args.only.has(entry.id));
if (commands.length === 0) {
  throw new Error(`No validation commands selected by --only=${[...args.only].join(',')}`);
}

for (const command of commands) {
  runCommand(command, contract, shellPaths);
}

console.log('\nActive shell validation passed.');
