import { validateInstallExposureRuntimeAndDistribution } from './install-exposure-runtime-distribution-validator.ts';
import { validateComponentInteroperability } from './install-exposure-policy-validator/compatibility.ts';
import {
  validateInstallExposureHeader,
  validateCapabilityGovernance,
  validateCanonicalMetadataSources,
  validatePublicAbi,
  validateExposureClasses,
} from './install-exposure-policy-validator/governance.ts';
import { validateInstallerSurfaces } from './install-exposure-policy-validator/installer.ts';
import {
  validateFirstRunUserPresentation,
  validateSetupFlowContract,
} from './install-exposure-policy-validator/first-run.ts';

export {
  componentInteroperabilityRef,
  componentCompatibilityRequirementsSha256,
  validateComponentCompatibilityReceipt,
} from './install-exposure-policy-validator/compatibility.ts';

export function validateInstallExposurePolicy(policy) {
  validateInstallExposureHeader(policy);
  validateComponentInteroperability(policy.component_interoperability);
  validateCapabilityGovernance(policy.capability_governance);
  validateCanonicalMetadataSources(policy.canonical_metadata_sources);
  validatePublicAbi(policy.public_abi);
  validateExposureClasses(policy);
  validateInstallerSurfaces(policy);
  validateFirstRunUserPresentation(policy.first_run_user_presentation);
  validateSetupFlowContract(policy.setup_flow_contract);

  validateInstallExposureRuntimeAndDistribution(policy);
}
