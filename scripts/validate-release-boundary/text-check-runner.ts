import { runReleaseBoundaryTextChecks } from './text-check-runner-parts/mutation-policy.ts';
import { validateStableReleaseControlPlane } from './text-check-runner-parts/control-plane-stable.ts';
import { validateReleaseBundleTopology } from './text-check-runner-parts/control-plane-bundle.ts';
import { validateStableFollowupTopology } from './text-check-runner-parts/followup-stable.ts';
import { validateHomebrewFullPromotionTopology } from './text-check-runner-parts/followup-homebrew-full.ts';
import { validateNightlyReleaseTopology } from './text-check-runner-parts/followup-nightly.ts';
import { validateReleaseBundleCanaryTopology } from './text-check-runner-parts/followup-canary.ts';
import {
  validatePreviewLatestPointerTopology,
  validateManualFullPreviewControlPlane,
  validateIndependentWebuiPreviewTopology,
} from './text-check-runner-parts/release-preview-topology.ts';
import {
  validateWorkflowTopologyPolicy,
  validateWorkflowNode24Policy,
  validateStableReleaseActionPinPolicy,
  validateWorkflowDispatchWriteAuthorityForWorkflows,
} from './text-check-runner-parts/workflow-policy.ts';

export {
  stableReleaseActionPaths,
  isAuthorizedWebuiStablePromotionWriteJob,
} from './text-check-runner-parts/workflow-policy.ts';

export {
  runReleaseBoundaryTextChecks,
  validateStableReleaseControlPlane,
  validateReleaseBundleTopology,
  validateStableFollowupTopology,
  validateHomebrewFullPromotionTopology,
  validateNightlyReleaseTopology,
  validateReleaseBundleCanaryTopology,
  validateWorkflowTopologyPolicy,
  validateWorkflowNode24Policy,
  validateStableReleaseActionPinPolicy,
  validateManualFullPreviewControlPlane,
  validateIndependentWebuiPreviewTopology,
};

export function validateWorkflowDispatchWriteAuthority(appRoot: string): number {
  let failures = validateStableReleaseControlPlane(appRoot) +
    validateReleaseBundleTopology(appRoot) +
    validateStableFollowupTopology(appRoot) +
    validateReleaseBundleCanaryTopology(appRoot) +
    validateNightlyReleaseTopology(appRoot) +
    validatePreviewLatestPointerTopology(appRoot) +
    validateIndependentWebuiPreviewTopology(appRoot) +
    validateManualFullPreviewControlPlane(appRoot) +
    validateHomebrewFullPromotionTopology(appRoot);
  failures += validateWorkflowDispatchWriteAuthorityForWorkflows(appRoot);
  return failures;
}
