#!/usr/bin/env node

import { assertAppRootBoundary } from './app-root-boundary.ts';
import { readAppShellAdapterContract } from './app-shell-adapter.ts';
import { readJson } from './validate-active-shell/assertions.ts';
import { validateCoreRuntimeRoute } from './validate-active-shell/runtime-route-validator.ts';
import {
  guiProductContractPath,
  installExposurePolicyPath,
  pageStateMatrixPath,
  releaseChannelPath,
  runtimeBridgePath,
} from './validate-active-shell/validation-config.ts';

assertAppRootBoundary({ phase: 'core Runtime route validation' });

validateCoreRuntimeRoute({
  guiProductContract: readJson(guiProductContractPath),
  pageStateMatrix: readJson(pageStateMatrixPath),
  shellAdapter: readAppShellAdapterContract(),
  runtimeBridge: readJson(runtimeBridgePath),
  releaseChannel: readJson(releaseChannelPath),
  installExposurePolicy: readJson(installExposurePolicyPath),
});

console.log('Core Runtime route contract is valid.');
