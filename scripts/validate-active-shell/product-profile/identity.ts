import path from 'node:path';
import { assertFile, defaultActiveShellContractPath, firstRunMatrixPath, installExposurePolicyPath, pageStateMatrixPath, root, settingsControlPlanePath } from '../validation-config.ts';
import { assertAppProductProfileIdentity } from '../../app-product-profile-identity.ts';

export function validateProductProfileIdentity(profile) {
  assertAppProductProfileIdentity(profile, 'product profile');
}

export function validateProductProfileContractRefs(profile) {
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
