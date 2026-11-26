import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveActiveShellPaths } from '../app-shell-adapter.ts';
import type { ReleaseBoundaryCheck } from './release-checks/types.ts';
import {
  activeShellReleaseValidationProfile,
  filterReleaseBoundaryChecksForProfile,
  releaseValidationProfile,
  releaseWorkflowPaths,
  releaseWorkflowPathsForProfile,
} from './release-checks/profile.ts';
import { buildReleaseAdmissionChecks } from './release-checks/legacy-admission.ts';
import { releaseDistributionChecks } from './release-checks/legacy-distribution.ts';
import { buildReleaseFoundationChecks } from './release-checks/legacy-foundation.ts';
import { studioCarrierChecks } from './release-checks/studio-carrier.ts';
import { studioBundleChecks } from './release-checks/studio-bundle.ts';
import { studioFollowupChecks } from './release-checks/studio-followups.ts';

export type { ReleaseBoundaryCheck, ReleaseValidationProfile } from './release-checks/types.ts';
export {
  activeShellReleaseValidationProfile,
  releaseValidationProfile,
  releaseWorkflowPaths,
  releaseWorkflowPathsForProfile,
};

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const shellPaths = resolveActiveShellPaths();

export const releaseBoundaryChecks: ReleaseBoundaryCheck[] = [
  ...buildReleaseFoundationChecks(appRoot, shellPaths),
  ...releaseDistributionChecks,
  ...buildReleaseAdmissionChecks(appRoot, shellPaths),
  ...studioCarrierChecks,
  ...studioBundleChecks,
  ...studioFollowupChecks,
];

export function releaseBoundaryChecksForProfile(
  profile = releaseValidationProfile(),
): ReleaseBoundaryCheck[] {
  if (profile !== 'windows' && shellPaths.contract.active_shell !== 'opl-studio') {
    throw new Error('App release checks require the active Studio shell contract.');
  }
  return filterReleaseBoundaryChecksForProfile(releaseBoundaryChecks, profile);
}
