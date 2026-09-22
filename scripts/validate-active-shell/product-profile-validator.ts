import { assertOfficialProfileShape } from '../app-product-profile-shared-validators.ts';
import { validateScheduledTasksProfileProjection } from './scheduled-tasks-policy-validator.ts';
import { installExposurePolicyPath } from './validation-config.ts';
import {
  validateProductProfileIdentity,
  validateProductProfileContractRefs,
} from './product-profile-parts/identity.ts';
import { validateDeliveryTopology } from './product-profile-parts/delivery-topology.ts';
import {
  validateClientRendererCompatibility,
  validateProductProfileCodexDefaults,
  validateUiLocalePolicy,
  validateHomeAssistantDefaults,
} from './product-profile-parts/client-home.ts';
import {
  validateAgentPackageRegistryProjection,
  validateProductProfileSettings,
  validateProductProfileCodexSkills,
  validateInstallUpdateTaxonomy,
  validateOrdinaryCapabilitySelectorPolicy,
} from './product-profile-parts/package-settings.ts';
import {
  validateFullFirstInstallCoreReadyPolicy,
  validateOfficialProfileFirstInstallPolicy,
  validateReadyToLaunchGate,
  validateFirstConversationPolicy,
  validateFullFirstInstallBackgroundPolicy,
} from './product-profile-parts/first-run.ts';
import {
  validateFirstRunProgressModel,
  validateStandardPackagePolicy,
  validateCommandLineToolsPolicy,
  validateStandardUpdatePolicy,
  validateCompanionPayloadAuthority,
  validateProductProfileBoundary,
} from './product-profile-parts/standard-boundary.ts';

export function validateProductProfile(
  profile,
  installExposurePolicy,
) {
  validateProductProfileIdentity(profile);
  validateProductProfileContractRefs(profile);
  validateDeliveryTopology(profile);
  validateClientRendererCompatibility(profile);
  validateProductProfileCodexDefaults(profile);
  assertOfficialProfileShape(profile.official_profile, 'Product profile Official Profile');
  validateAgentPackageRegistryProjection(profile);
  validateFullFirstInstallCoreReadyPolicy(profile);
  validateStandardPackagePolicy(profile);
  validateCommandLineToolsPolicy(profile);
  validateStandardUpdatePolicy(profile);
  validateCompanionPayloadAuthority(profile, installExposurePolicy);
  validateScheduledTasksProfileProjection(profile.companion_payloads?.native_automation);
  validateProductProfileBoundary(profile);
}
