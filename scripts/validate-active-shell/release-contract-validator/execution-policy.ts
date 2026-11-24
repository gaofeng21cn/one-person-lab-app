import { assertRetiredReleaseControlPlaneAbsent } from './retired-control-plane-policy.ts';
import { validateReleaseCheckpointAuthority } from './execution-checkpoint-authority.ts';
import { validateSettingsAndAssistantRoute, validateVmAcceleration } from './execution-acceleration-policy.ts';
import { validateLegacyCompatibility, validateValidationCanary } from './execution-compatibility-policy.ts';
import { validateReleaseOperations, validateReleaseResilience } from './execution-operation-policy.ts';
import { validateReleasePlatformMatrix } from './execution-platform-policy.ts';
import { validateLocalFirstPreflight, validateStableStageResult } from './execution-preflight-policy.ts';
import { validateReleasePublication, validateReleasePublisher } from './execution-publication-policy.ts';
import type { ReleaseValidationProfile } from '../../validate-release-boundary/release-checks.ts';

function validateReleaseExecutionPolicy(releaseChannel, shellPaths, validationProfile) {
  assertRetiredReleaseControlPlaneAbsent(releaseChannel);
  validateReleaseCheckpointAuthority(releaseChannel, shellPaths, validationProfile);
  validateReleaseOperations(releaseChannel, shellPaths, validationProfile);
  validateStableStageResult(releaseChannel, shellPaths, validationProfile);
  validateReleasePublication(releaseChannel, shellPaths, validationProfile);
  validateLocalFirstPreflight(releaseChannel, shellPaths, validationProfile);
  validateReleasePublisher(releaseChannel, shellPaths, validationProfile);
  validateReleaseResilience(releaseChannel, shellPaths, validationProfile);
  validateLegacyCompatibility(releaseChannel, shellPaths, validationProfile);
  validateValidationCanary(releaseChannel, shellPaths, validationProfile);
  validateSettingsAndAssistantRoute(releaseChannel, shellPaths, validationProfile);
  validateVmAcceleration(releaseChannel, shellPaths, validationProfile);
  validateReleasePlatformMatrix(releaseChannel, shellPaths, validationProfile);
}

export { validateReleaseExecutionPolicy };
