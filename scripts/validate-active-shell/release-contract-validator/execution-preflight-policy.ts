import { assertDeepEqualJson } from '../assertions.ts';
import {
  stableBusinessStageIds,
  stableFailureFingerprintFields,
  stableStageAxes,
} from './execution-contract-values.ts';

function validateStableStageResult(releaseChannel, shellPaths, validationProfile) {
  const preflight = releaseChannel?.release_preflight;
  const stableStageResult = preflight?.stable_stage_result;
  const failureFingerprint = preflight?.dispatch_guard?.failure_fingerprint_circuit_breaker;

  if (
    stableStageResult?.schema !== 'opl_app_stable_stage_result.v1' ||
    stableStageResult?.json_schema !== 'contracts/app-stable-stage-result.schema.json' ||
    stableStageResult?.script !== 'scripts/stable-stage-result.ts' ||
    stableStageResult?.authority !== 'attempt_observation_only_no_framework_state_projection' ||
    stableStageResult?.business_stage_count !== 11 ||
    stableStageResult?.primary_failure_rule !== 'lowest_stage_index_failed_qualification_product_axis' ||
    stableStageResult?.secondary_failure_rule !==
      'evidence_transport_cleanup_and_later_product_failures_do_not_overwrite_primary' ||
    stableStageResult?.cleanup_normalization?.condition !==
      'command_nonzero_and_final_inspection_absent' ||
    stableStageResult?.cleanup_normalization?.status !== 'cleanup_idempotent_success' ||
    stableStageResult?.cleanup_normalization?.records_command_anomaly !== true ||
    stableStageResult?.cleanup_normalization?.eligible_for_primary_failure !== false ||
    stableStageResult?.release_state_authority !== false ||
    stableStageResult?.framework_status_authority !== false ||
    stableStageResult?.mutation_authority !== false ||
    stableStageResult?.framework_checkpoint_projection_allowed !== false ||
    stableStageResult?.placeholder_or_inferred_success_allowed !== false ||
    stableStageResult?.workflow_binding?.workflow !== '.github/workflows/release-stable.yml' ||
    stableStageResult?.workflow_binding?.schema_env !== 'OPL_APP_STABLE_STAGE_RESULT_SCHEMA' ||
    stableStageResult?.workflow_binding?.authority_env !== 'OPL_APP_STABLE_STAGE_RESULT_AUTHORITY' ||
    stableStageResult?.workflow_binding?.stage_inputs_require_real_attempt_evidence !== true
  ) {
    throw new Error('Stable stage results must remain non-authoritative App attempt observations over real evidence');
  }
  assertDeepEqualJson(stableStageResult.stage_ids, stableBusinessStageIds, 'Stable business stage ids');
  assertDeepEqualJson(stableStageResult.axes, stableStageAxes, 'Stable stage result axes');
  if (
    failureFingerprint?.schema !== 'opl_app_stable_failure_fingerprint.v1' ||
    failureFingerprint?.stage_result_schema !== 'opl_app_stable_stage_result.v1' ||
    failureFingerprint?.attempt_included_in_identity !== false ||
    failureFingerprint?.prior_and_current_required_together !== true ||
    failureFingerprint?.unchanged_status !== 'blocked_unchanged' ||
    failureFingerprint?.unchanged_failure_code !== 'unchanged_failure_fingerprint' ||
    failureFingerprint?.unchanged_dispatch_allowed !== false ||
    failureFingerprint?.unchanged_dispatch_count !== 0 ||
    failureFingerprint?.unchanged_mutation_invocation_count !== 0 ||
    failureFingerprint?.evaluated_before_git_wire_or_owner_api !== true ||
    failureFingerprint?.changed_fingerprint_only_continues_read_only_pre_nonce_gates !== true
  ) {
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
