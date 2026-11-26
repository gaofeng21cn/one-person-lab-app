import path from 'node:path';
import { assertAppProductProfileIdentity } from '../app-product-profile-identity.ts';
import { assertOfficialProfileShape } from '../app-product-profile-shared-validators.ts';
import { assertAgentPackageRegistryProjection } from '../app-product-profile/profile-contract/packages.ts';
import { resolveClientRendererAdmission } from '../app-shell-adapter/reader.ts';
import { readJson } from './assertions.ts';
import { validateScheduledTasksProfileProjection } from './scheduled-tasks-policy-validator.ts';
import {
  assertFile,
  defaultActiveShellContractPath,
  firstRunMatrixPath,
  guiProductContractPath,
  installExposurePolicyPath,
  pageStateMatrixPath,
  releaseChannelPath,
  root,
  settingsControlPlanePath,
} from './validation-config.ts';
import { validateDeliveryTopology } from './product-profile/delivery-topology.ts';
import { validateProductProfileCodexDefaults } from './product-profile/client-home.ts';
import { validateFullFirstInstallCoreReadyPolicy } from './product-profile/first-run.ts';
import {
  validateStandardPackagePolicy,
  validateCommandLineToolsPolicy,
  validateStandardUpdatePolicy,
  validateCompanionPayloadAuthority,
  validateProductProfileBoundary,
} from './product-profile/standard-boundary.ts';

export function validateProductProfile(
  profile,
  installExposurePolicy,
  {
    guiContract = readJson(guiProductContractPath),
    releaseChannel = readJson(releaseChannelPath),
    shellAdapter = readJson(defaultActiveShellContractPath),
  } = {},
) {
  assertAppProductProfileIdentity(profile, 'product profile');
  validateProductProfileContractRefs(profile);
  validateDeliveryTopology(profile, releaseChannel);
  resolveClientRendererAdmission(shellAdapter, {
    ...profile,
    client_renderer_compatibility: { ...profile.client_renderer_compatibility },
  });
  validateProductProfileCodexDefaults(profile, guiContract, installExposurePolicy, releaseChannel);
  assertOfficialProfileShape(profile.official_profile, 'Product profile Official Profile');
  assertAgentPackageRegistryProjection(profile);
  validateFullFirstInstallCoreReadyPolicy(profile);
  validateStandardPackagePolicy(profile);
  validateCommandLineToolsPolicy(profile);
  validateStandardUpdatePolicy(profile, releaseChannel);
  validateCompanionPayloadAuthority(profile, installExposurePolicy);
  validateScheduledTasksProfileProjection(profile.companion_payloads?.native_automation);
  validateProductProfileBoundary(profile);
}

function validateProductProfileContractRefs(profile) {
  for (const [label, expected] of Object.entries({
    active_shell: defaultActiveShellContractPath,
    page_state: pageStateMatrixPath,
    first_run: firstRunMatrixPath,
    install_exposure: installExposurePolicyPath,
    settings_control_plane: settingsControlPlanePath,
    remote_companion: path.join(root, 'contracts', 'app-remote-companion.json'),
  })) {
    const value = profile.contract_refs?.[label];
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Product profile missing contract_refs.${label}`);
    }
    assertFile(path.join(root, value), `product profile ${label} contract ref`);
    if (path.resolve(root, value) !== path.resolve(expected)) {
      throw new Error(`Unexpected product profile contract_refs.${label}: ${value}`);
    }
  }
}
