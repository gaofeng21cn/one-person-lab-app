import { validateReleaseFullFirstInstallPayloads } from './release-full-first-install-payload-validator.ts';
import { validateReleaseHomebrewDistribution } from './release-homebrew-distribution-validator.ts';
import {
  validateDesktopReleaseKernel,
  validateOptionalCertificationPolicy,
  validateProviderConfigurationBoundary,
  validateReleaseCalendarGuard,
  validateSuccessorProtectedReleaseAdmission,
} from './release-contract-validator/channel-policy.ts';
import { validateLocalDataLifecycle } from './release-contract-validator/data-lifecycle-policy.ts';
import { validateDistributionSemantics, validateWebuiGhcrImage } from './release-contract-validator/distribution-policy.ts';
import { validateReleaseExecutionPolicy } from './release-contract-validator/execution-policy.ts';
import { validateManagedUpdatePlane } from './release-contract-validator/managed-plane-policy.ts';
import { validateStandardUpdater } from './release-contract-validator/updater-policy.ts';
import type { ReleaseValidationProfile } from '../validate-release-boundary/release-checks.ts';

export { assertManagedRuntimeRootBridgeSemantics } from './release-contract-validator/data-lifecycle-policy.ts';

export function validateReleaseChannelContract(
  releaseChannel,
  shellPaths = null,
  validationProfile: ReleaseValidationProfile = 'aggregate',
) {
  if (!['aggregate', 'stable', 'windows'].includes(validationProfile)) {
    throw new Error(`Unsupported release validation profile: ${validationProfile}`);
  }
  validateReleaseCalendarGuard(releaseChannel.github_release_name);
  validateSuccessorProtectedReleaseAdmission(
    releaseChannel.successor_delivery_target,
    releaseChannel.full_first_install,
  );
  validateDesktopReleaseKernel(releaseChannel.desktop_release_kernel);
  validateProviderConfigurationBoundary(releaseChannel.provider_configuration_boundary);
  const managedUpdatePlane = releaseChannel.managed_update_plane;
  validateStandardUpdater(releaseChannel.standard_updater);
  validateDistributionSemantics(releaseChannel.distribution_semantics);
  validateLocalDataLifecycle(releaseChannel.local_data_lifecycle, shellPaths);
  validateWebuiGhcrImage(releaseChannel.webui_ghcr_image);
  validateManagedUpdatePlane(managedUpdatePlane);
  validateReleaseExecutionPolicy(releaseChannel, shellPaths, validationProfile);
  validateOptionalCertificationPolicy(releaseChannel);
  validateReleaseHomebrewDistribution(releaseChannel);
  validateReleaseFullFirstInstallPayloads(releaseChannel);
}
