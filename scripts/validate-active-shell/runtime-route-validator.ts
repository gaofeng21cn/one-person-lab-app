import { validateAppGuiProductContract } from './gui-product-contract-validator.ts';
import { validatePageStateMatrix } from './page-state-matrix-validator.ts';
import {
  validateRuntimeCockpitProductContract,
  validateRuntimeCockpitPreservationPolicy,
} from './runtime-cockpit-product-validator.ts';
import {
  validateRuntimeBridgeContract,
  validateRuntimeProgressPageDisplayPolicy,
} from './runtime-bridge-validator.ts';

export function validateCoreRuntimeRoute({
  guiProductContract,
  pageStateMatrix,
  shellAdapter,
  runtimeBridge,
  releaseChannel,
  installExposurePolicy,
}) {
  validateAppGuiProductContract(guiProductContract, releaseChannel, installExposurePolicy);
  validateRuntimeCockpitPreservationPolicy(
    guiProductContract.interaction_baseline?.feature_preservation_policy?.runtime_preservation_gate,
    'Core Runtime route preservation policy',
  );
  const runtimeStatus = guiProductContract.pages?.runtime_status;
  if (!runtimeStatus) {
    throw new Error('Core Runtime route validation requires pages.runtime_status');
  }
  validateRuntimeCockpitProductContract(
    runtimeStatus.runtime_cockpit_product_contract,
    'Core Runtime route product contract',
  );
  validatePageStateMatrix(pageStateMatrix, shellAdapter, guiProductContract);
  validateRuntimeBridgeContract(runtimeBridge, shellAdapter);
  validateRuntimeProgressPageDisplayPolicy(runtimeBridge);
}
