#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAppRootBoundary } from './app-root-boundary.ts';
import { validateReleaseContractPolicies } from './validate-release-boundary/release-contract-policy.ts';
import { validateReleaseBoundaryScriptDependencies } from './validate-release-boundary/script-dependencies.ts';
import { validateActionsCachePolicy } from './validate-release-boundary/actions-cache-policy.ts';
import { validateBunToolchainCompatibility } from './validate-release-boundary/bun-toolchain-compatibility.ts';
import {
  runReleaseBoundaryTextChecks,
  validateStableReleaseActionPinPolicy,
  validateWorkflowTopologyPolicy,
  validateWorkflowDispatchWriteAuthority,
  validateWorkflowNode24Policy,
} from './validate-release-boundary/text-check-runner.ts';
import { releaseValidationProfile } from './validate-release-boundary/release-checks.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validationProfile = releaseValidationProfile();

let failures = 0;
try {
  assertAppRootBoundary({ phase: 'release boundary validation' });
} catch (error) {
  console.error(`FAIL app_root_boundary: ${error instanceof Error ? error.message : String(error)}`);
  failures += 1;
}

failures += runReleaseBoundaryTextChecks(appRoot);
failures += validateWorkflowTopologyPolicy(appRoot);
failures += validateWorkflowNode24Policy(appRoot);
failures += validateStableReleaseActionPinPolicy(appRoot);
failures += validateWorkflowDispatchWriteAuthority(appRoot);
failures += validateActionsCachePolicy(appRoot);
failures += validateBunToolchainCompatibility(appRoot);
failures += validateReleaseBoundaryScriptDependencies(appRoot);
failures += validateReleaseContractPolicies(appRoot, validationProfile);

if (failures > 0) {
  process.exit(1);
}

console.log('PASS: App release boundary is App-owned, Actions caches are reusable and bounded, agent installation is contract-validated, and release workflows force JavaScript actions onto Node 24.');
