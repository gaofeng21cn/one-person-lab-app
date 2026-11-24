import { runReleaseBoundaryTextChecks } from './text-check-runner/mutation-policy.ts';
import { validateStableReleaseControlPlane } from './text-check-runner/control-plane-stable.ts';
import { validateReleaseBundleTopology } from './text-check-runner/control-plane-bundle.ts';
import { validateStableFollowupTopology } from './text-check-runner/followup-stable.ts';
import { validateHomebrewFullPromotionTopology } from './text-check-runner/followup-homebrew-full.ts';
import { validateNightlyReleaseTopology } from './text-check-runner/followup-nightly.ts';
import { validateReleaseBundleCanaryTopology } from './text-check-runner/followup-canary.ts';
import {
  validatePreviewLatestPointerTopology,
  validateManualFullPreviewControlPlane,
  validateIndependentWebuiPreviewTopology,
} from './text-check-runner/release-preview-topology.ts';
import {
  validateWorkflowTopologyPolicy,
  validateWorkflowNode24Policy,
  validateStableReleaseActionPinPolicy,
  validateWorkflowDispatchWriteAuthorityForWorkflows,
} from './text-check-runner/workflow-policy.ts';

export {
  stableReleaseActionPaths,
  isAuthorizedWebuiStablePromotionWriteJob,
} from './text-check-runner/workflow-policy.ts';

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
