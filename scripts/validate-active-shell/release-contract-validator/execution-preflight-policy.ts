import {
  hasStableStageResultPolicy,
  hasStableFailureFingerprintPolicy,
} from '../../release-control-plane-policy.ts';
import { assertDeepEqualJson } from '../assertions.ts';
import {
  stableBusinessStageIds,
  stableFailureFingerprintFields,
  stableStageAxes,
} from '../../release-control-plane-policy-values.ts';

function validateStableStageResult(releaseChannel, shellPaths, validationProfile) {
  const preflight = releaseChannel?.release_preflight;
  const stableStageResult = preflight?.stable_stage_result;
  const failureFingerprint = preflight?.dispatch_guard?.failure_fingerprint_circuit_breaker;

  if (!hasStableStageResultPolicy(stableStageResult)) {
    throw new Error('Stable stage results must remain non-authoritative App attempt observations over real evidence');
  }
  assertDeepEqualJson(stableStageResult.stage_ids, stableBusinessStageIds, 'Stable business stage ids');
  assertDeepEqualJson(stableStageResult.axes, stableStageAxes, 'Stable stage result axes');
  if (!hasStableFailureFingerprintPolicy(failureFingerprint)) {
    throw new Error('Stable dispatch must fail closed on one unchanged exact failure fingerprint before transport');
  }
  assertDeepEqualJson(
    failureFingerprint.identity_fields,
    stableFailureFingerprintFields,
    'Stable failure fingerprint fields',
  );

}

function validateLocalFirstPreflight(releaseChannel, shellPaths, validationProfile) {
  const preflight = releaseChannel?.release_preflight;
  const localFirst = preflight?.local_first;

  if (
    localFirst?.entrypoint !== 'scripts/verify.sh release-preflight'
    || localFirst?.reuses_existing_orchestrator !== true
    || localFirst?.public_mutation_allowed !== false
  ) {
    throw new Error('Local-first release preflight must reuse verify.sh without public mutation');
  }
  assertDeepEqualJson(
    localFirst.local_checks,
    ['actionlint', 'typecheck', 'active_shell', 'release_boundary', 'candidate_shell', 'standard_package_build'],
    'Local-first release checks',
  );
  assertDeepEqualJson(
    localFirst.remote_only,
    [
      'github_hosted_required_macos_linux_matrix',
      'github_hosted_desktop_artifacts_matrix_required',
      'protected_signing_and_notarization_credentials',
      'public_mutation',
      'owner_authoritative_remote_readback',
    ],
    'Local-first remote-only checks',
  );

}

export { validateLocalFirstPreflight, validateStableStageResult };
