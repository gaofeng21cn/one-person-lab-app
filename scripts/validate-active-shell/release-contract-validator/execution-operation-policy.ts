import {
  hasStableOperationControl,
  hasReleaseResilience,
} from '../../release-control-plane-policy.ts';
import { assertDeepEqualJson } from '../assertions.ts';
import { immutableOperationControlFields } from '../../release-control-plane-policy-values.ts';

function validateReleaseOperations(releaseChannel, shellPaths, validationProfile) {
  const control = releaseChannel?.release_bundle_control_plane;
  const operations = control?.operation_control;
  const resumeStandardOperation = operations?.stable_operations?.resume_standard;

  if (!hasStableOperationControl(operations)) {
    throw new Error('Release operations must keep Standard identity immutable, rotate only an expired reconciled resume window, keep append independent, and keep late reconcile evidence-only');
  }
  assertDeepEqualJson(
    resumeStandardOperation.reused_identity_fields,
    immutableOperationControlFields.filter((field) => !['control_digest', 'operation_started_at', 'operation_deadline_at'].includes(field)),
    'resume_standard immutable identity fields',
  );

}

function validateReleaseResilience(releaseChannel, shellPaths, validationProfile) {
  const control = releaseChannel?.release_bundle_control_plane;
  const resilience = control?.resilience_policy;

  if (
    !hasReleaseResilience(resilience) ||
    JSON.stringify(resilience?.updater_baseline_sources) !== JSON.stringify(['current_latest', 'highest_public_stable']) ||
    JSON.stringify(resilience?.updater_zip_identity_fields) !== JSON.stringify(['size_bytes', 'sha256'])
  ) {
    throw new Error('Release resilience must prove monotonic versions, pre-public updater bytes, and Framework-owned exact Homebrew reconcile');
  }

}

export { validateReleaseOperations, validateReleaseResilience };
