import fs from 'node:fs';
import path from 'node:path';

import {
  sameStringSet,
  stringArrayIncludesAll,
} from './types.ts';
import {
  evaluateReleaseBrokerAuthorityReadiness,
  requiredRemovedReleaseImplementationPaths,
  requiredRetainedNonAuthoritativeImplementationPaths,
  requiredRetiredReleasePackageScripts,
  retiredReleaseControlPlaneViolations,
} from './retirement.ts';

export {
  evaluateReleaseBrokerAuthorityReadiness,
} from './retirement.ts';
export type { ReleaseBrokerAuthorityReadiness } from './retirement.ts';
export {
  validateHomebrewVmGateStaticPolicy,
  validateWebuiPackagePolicy,
} from './distribution.ts';

const requiredStandardLatestAdmission = {
  validator: 'scripts/validate-standard-latest-admission.ts',
  receipt_schema: 'opl_standard_latest_admission_receipt.v1',
  required_status: 'passed',
  latest_activation_admitted_required: true,
  framework_latest_eligible_alone_is_sufficient: false,
  hosted_publication_floor_schema: 'opl_standard_hosted_publication_floor.v1',
  source_contract_build_preflight_required: 'passed',
  remote_digest_readback_required: 'passed',
  current_latest_readback_required: true,
  updater_predecessor_receipts_allowed: false,
  optional_certification_receipts_allowed: false,
  publication_ancestor_counts: { self_hosted: 0, vm: 0, tart: 0 },
  required_exact_identity_fields: [
    'bundle_digest',
    'candidate.zip.sha256',
    'candidate.zip.size_bytes',
    'candidate.dmg.sha256',
    'candidate.dmg.size_bytes',
  ],
  homebrew_follower: {
    workflow: '.github/workflows/release-stable-post-success-followups.yml',
    operation: 'reconcile_homebrew_standard',
    latest_receipt_value: null,
    consumed_by_latest_admission: false,
    failure_blocks_core_release_or_latest: false,
  },
  failure_mode: 'fail_closed_before_latest_patch',
};
const requiredPublisherReconcileAdmission = {
  persistent_unknown_framework_receipt_required: true,
  unknown_marker_schema: 'opl_release_bundle_unknown_outcome.v1',
  fresh_framework_status_required: true,
  framework_status_surface: 'release_bundle_status',
  framework_status_marker_field: 'active_unknown_markers',
  framework_status_reconcile_field: 'tracks.<track>.reconcile_required',
  framework_status_reconcile_required_value: true,
  exact_marker_match_fields: [
    'bundle_digest',
    'operation_id',
    'operation_kind',
    'stage_operation',
    'publication_scope',
    'track',
    'remote_target',
    'prior_mutation_attempt_id',
  ],
  app_may_infer_reconcile_required: false,
  required_sequence: [
    'persist_framework_unknown_outcome_marker',
    'read_fresh_framework_status',
    'require_exact_active_unknown_marker',
    'bounded_read_only_remote_inspect',
    'framework_exact_reconcile',
  ],
  active_marker_ordinary_mutation_allowed: false,
  app_local_reconcile_loop_allowed: false,
  deadline_elapsed_allows_bounded_read_only_inspect: true,
  deadline_elapsed_allows_framework_reconcile: true,
  deadline_elapsed_reconcile_result: 'late_observation',
  deadline_elapsed_reconcile_may_advance_stage: false,
  create_upload_latest_or_homebrew_retry_allowed: false,
};
const frameworkReleaseAbiSha = '97510b268300b1996f308e7a4110205cd703b95e';
const requiredFrameworkReleaseCommands = [
  'freeze',
  'operation admit',
  'build',
  'checkpoint export',
  'checkpoint import',
  'verify',
  'publish',
  'reconcile',
  'status',
  'events',
  'consumer envelope',
];
const requiredFrameworkReleaseCommandForms = [
  'opl release freeze --request <request.json> [--source-root <directory>] [--store <directory>]',
  'opl release operation admit --bundle <sha256:digest> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
  'opl release build --bundle <sha256:digest> --executor-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
  'opl release checkpoint export --bundle <sha256:digest> --output <directory> [--store <directory>]',
  'opl release checkpoint import --checkpoint <checkpoint.json> [--store <directory>]',
  'opl release verify --bundle <sha256:digest> --qualification-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--track standard|full] [--store <directory>]',
  'opl release publish --bundle <sha256:digest> --executor-receipt <remote-inspect.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
  'opl release reconcile --bundle <sha256:digest> --executor-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
  'opl release status --bundle <sha256:digest> [--store <directory>]',
  'opl release events --bundle <sha256:digest> [--after-event <sha256:event>] [--store <directory>]',
  'opl release consumer envelope --bundle <sha256:digest> --track <standard|full> [--source-checkpoint-run-id <run-id>] [--store <directory>]',
];
const requiredOperationControlFields = [
  'control_digest',
  'bundle_digest',
  'operation_id',
  'operation_kind',
  'track',
  'operation_started_at',
  'operation_deadline_at',
];
const requiredUnknownMarkerFields = [
  'bundle_digest',
  'operation_id',
  'operation_kind',
  'stage_operation',
  'publication_scope',
  'track',
  'remote_target',
  'prior_mutation_attempt_id',
];
const requiredStableBusinessStageIds = [
  'admission_and_circuit_breaker',
  'source_contract_preflight',
  'credential_runner_and_custody_preflight',
  'standard_signed_notarized_build_and_seal',
  'clean_vm_exact_artifact_qualification',
  'updater_exact_artifact_qualification',
  'standard_publication',
  'homebrew_exact_artifact_install',
  'latest_pointer_activation',
  'remote_digest_and_clean_user_installed_readback',
  'terminal_fold_and_idempotent_cleanup',
];
const requiredStableStageAxes = ['qualification_product', 'evidence', 'transport', 'cleanup'];
const requiredStableFailureFingerprintFields = [
  'cohort',
  'stage_id',
  'reason_code',
  'artifact_digest_or_input_digest',
  'environment_receipt_digest',
];
const requiredValidationCanary = {
  workflow: '.github/workflows/release-bundle-canary.yml',
  mode: 'validation_only',
  triggers: ['daily_schedule', 'workflow_dispatch'],
  local_contract_checks: [
    'framework_checkpoint_roundtrip',
    'release_bundle_workflow_cutover',
    'release_control_plane_boundary',
  ],
  reusable_release_workflow_jobs_allowed: false,
  permissions: { contents: 'read', actions: 'read' },
  secrets_allowed: false,
  build_or_vm_execution_allowed: false,
  external_write_allowed: false,
  stable_mutation_allowed: false,
  publication_allowed: false,
  uses_stable_mutation_mutex: false,
  synthetic_identity_may_authorize_release: false,
};


export function validateReleaseAccelerationPolicy(
  appRoot: string,
  releaseContract: Record<string, any>,
  brokerAuthority: unknown,
): number {
  let failures = 0;
  const control = releaseContract.release_bundle_control_plane;
  const framework = control?.framework_authority;
  const live = control?.live_authority;
  const eventDelivery = control?.event_delivery;
  const checkpoint = control?.checkpoint_transport;
  const operations = control?.operation_control;
  const markerPolicy = checkpoint?.active_unknown_markers;
  const fullMaterializationCheckpoint = checkpoint?.full_materialization_checkpoint;
  const standardOperation = operations?.stable_operations?.standard;
  const resumeStandardOperation = operations?.stable_operations?.resume_standard;
  const appendFullOperation = operations?.stable_operations?.append_full;
  const standardArtifactRecoveryVerification = operations?.standard_artifact_recovery_verification;
  const resilience = control?.resilience_policy;
  const publication = control?.publication;
  const publisher = control?.publisher_idempotency;
  const legacy = control?.legacy_compatibility;
  const draftInspection = legacy?.draft_candidate_inspection;
  const validationCanary = control?.validation_canary;
  const acceleration = releaseContract.release_acceleration;
  const preflight = releaseContract.release_preflight;
  const stableStageResult = preflight?.stable_stage_result;
  const failureFingerprint = preflight?.dispatch_guard?.failure_fingerprint_circuit_breaker;
  const settingsRuntimeRefresh = acceleration?.settings_runtime_refresh_evidence_policy;
  const homebrew = releaseContract.homebrew_tap_distribution;

  const followups = acceleration?.stable_followup_scheduling;
  if (
    followups?.trigger !== 'same_run_reusable_call_after_standard_publication_readback' ||
    !sameStringSet(followups?.independent_lanes, ['full_addon', 'desktop_platforms', 'homebrew_standard', 'docker_publication']) ||
    followups?.completion_event !== 'observation_only' ||
    followups?.checkpoint_owner !== 'framework' ||
    followups?.public_mutation_mutex !== 'opl-release-bundle-global' ||
    followups?.standard_latest_waits_for_addons !== false
  ) {
    console.error('FAIL stable_followup_scheduling: published Standard must start independent followers once while preserving Framework checkpoint and publication mutex');
    failures += 1;
  }

  for (const violation of retiredReleaseControlPlaneViolations(releaseContract)) {
    console.error(`FAIL release_legacy_surface_absent: ${violation}`);
    failures += 1;
  }

  if (
    control?.schema !== 'opl_app_release_bundle_control_plane.v1' ||
    control?.contract_status !== 'active' ||
    framework?.owner !== 'gaofeng21cn/one-person-lab' ||
    framework?.bundle_schema !== 'opl_release_bundle.v1' ||
    framework?.checkpoint_schema !== 'opl_release_bundle_checkpoint.v1' ||
    framework?.operation_control_schema !== 'opl_release_bundle_operation_control.v1' ||
    framework?.operation_event_schema !== 'opl_release_bundle_operation_event.v1' ||
    framework?.consumer_envelope_schema !== 'opl_release_bundle_consumer_envelope.v1' ||
    framework?.unknown_outcome_schema !== 'opl_release_bundle_unknown_outcome.v1' ||
    framework?.portable_checkpoint_authority_first_landed_sha !== 'f785cda96' ||
    framework?.consumed_abi_sha !== frameworkReleaseAbiSha ||
    framework?.cli !== 'opl release' ||
    framework?.live_mutation_authority !== 'framework_release_bundle_executor' ||
    framework?.checkpoint_and_receipt_state_authority_exclusive !== true ||
    framework?.app_may_define_checkpoint_or_receipt_schema !== false ||
    framework?.app_may_derive_or_project_release_stage_state !== false ||
    !sameStringSet(framework?.receipt_schemas, [
      'opl_release_bundle_executor_receipt.v1',
      'opl_release_bundle_operation_receipt.v1',
      'opl_release_bundle_qualification_receipt.v1',
    ]) ||
    JSON.stringify(framework?.commands) !== JSON.stringify(requiredFrameworkReleaseCommands)
  ) {
    console.error('FAIL release_bundle_authority: Framework opl release and its portable checkpoint must own live release state');
    failures += 1;
  }
  if (
    eventDelivery?.framework_event_schema !== 'opl_release_bundle_operation_event.v1' ||
    eventDelivery?.framework_consumer_envelope_schema
      !== 'opl_release_bundle_consumer_envelope.v1' ||
    eventDelivery?.source !== 'framework_immutable_operation_receipts' ||
    eventDelivery?.event_idempotency_key_equals_event_id !== true ||
    eventDelivery?.consumer_ack_is_read_only !== true ||
    eventDelivery?.duplicate_event_may_trigger_second_operation !== false ||
    eventDelivery?.stale_event_may_replace_newer_bundle_or_operation_state !== false ||
    eventDelivery?.long_wait_mode !== 'event_driven_wakeup_with_status_readback' ||
    eventDelivery?.standard_and_full_operation_identity_must_be_distinct !== true ||
    eventDelivery?.full_envelope_requires_source_checkpoint_run_id !== true ||
    eventDelivery?.consumer_trigger_only !== true ||
    eventDelivery?.consumer_may_dispatch !== false ||
    eventDelivery?.active_task_invariant?.real_owner_required !== true ||
    eventDelivery?.active_task_invariant?.executable_next_action_required !== true ||
    eventDelivery?.active_task_invariant?.recoverable_framework_checkpoint_or_event_cursor_required
      !== true ||
    eventDelivery?.active_task_invariant?.wait_without_new_decision_is_not_active_work !== true ||
    eventDelivery?.terminal_task_policy?.close_thread_after_owned_operation_terminal !== true ||
    eventDelivery?.terminal_task_policy?.downstream_consumers_start_from_framework_envelope !== true ||
    eventDelivery?.terminal_task_policy?.reuse_terminal_thread_as_permanent_controller !== false ||
    eventDelivery?.recovery_entry !== 'opl release status then exact opl release reconcile'
  ) {
    console.error('FAIL release_event_delivery: consumers must use idempotent Framework events and non-authorizing envelopes');
    failures += 1;
  }
  if (JSON.stringify(framework?.command_forms) !== JSON.stringify(requiredFrameworkReleaseCommandForms)) {
    console.error('FAIL release_bundle_framework_abi: App contract must match the current Framework CLI forms exactly');
    failures += 1;
  }
  if (
    live?.single_live_mutation_authority !== true ||
    live?.state_owner !== 'OPL Framework opl release' ||
    live?.state_surface !== 'opl_release_bundle_checkpoint.v1' ||
    live?.mutation_executor_owner !== 'one-person-lab-app' ||
    live?.state_authority_ref !== 'release_bundle_control_plane.framework_authority' ||
    live?.app_executor_consumes_framework_cli_results_without_state_projection !== true ||
    !sameStringSet(live?.stable_operations, ['standard', 'resume_standard', 'append_full']) ||
    live?.stable_operator_entry !== 'npm run release:stable-dispatch' ||
    live?.stable_workflow_mutation_sink !== '.github/workflows/release-stable.yml' ||
    live?.direct_stable_workflow_dispatch_allowed !== false ||
    live?.attempt_identity_separate_from_release_version !== true ||
    live?.validation_canary_entry !== '.github/workflows/release-bundle-canary.yml_schedule' ||
    live?.app_session_broker_or_operator_may_authorize_mutation !== false ||
    live?.framework_checkpoint_required_for_resume_or_executor_switch !== true
  ) {
    console.error('FAIL release_live_authority: only Framework checkpoint state and the App executor may mutate a release');
    failures += 1;
  }
  if (
    checkpoint?.schema !== 'opl_release_bundle_checkpoint.v1' ||
    !sameStringSet(checkpoint?.stages, [
      'frozen', 'standard_built', 'standard_qualified', 'full_built', 'full_qualified',
    ]) ||
    checkpoint?.portable_between_executors !== true ||
    checkpoint?.import_never_rebuilds !== true ||
    checkpoint?.completed_stage_behavior !== 'skip_with_rebuild_performed_false' ||
    fullMaterializationCheckpoint?.required_after_materialization !== true ||
    JSON.stringify(fullMaterializationCheckpoint?.terminal_stages) !== JSON.stringify(['full_built', 'full_qualified']) ||
    fullMaterializationCheckpoint?.qualification_failure_preserves_stage !== 'full_built' ||
    fullMaterializationCheckpoint?.recovery_preference !== 'framework_checkpoint_before_actions_artifact_selection' ||
    fullMaterializationCheckpoint?.prior_full_artifact_run_id_scope !== 'legacy_runs_without_full_built_checkpoint' ||
    checkpoint?.asset_and_receipt_digest_revalidation_required !== true ||
    !sameStringSet(checkpoint?.source_build_provenance_fields, [
      'source_build_executor', 'source_build_run_id',
    ]) ||
    !sameStringSet(checkpoint?.transport_provenance_fields, [
      'checkpoint_transport_executor', 'transport_run_id',
    ]) ||
    checkpoint?.transport_must_not_replace_source_build_provenance !== true ||
    checkpoint?.operation_controls_preserved_exactly !== true ||
    checkpoint?.same_output_idempotency_requires_complete_store_state_unchanged !== true ||
    checkpoint?.state_change_at_existing_output_fails_stale !== true ||
    checkpoint?.unknown_build_or_publish_outcome_export_allowed !== true ||
    checkpoint?.unknown_outcome_required_action !== 'status_then_exact_reconcile' ||
    markerPolicy?.schema !== 'opl_release_bundle_unknown_outcome.v1' ||
    markerPolicy?.maximum_count !== 1 ||
    markerPolicy?.checkpoint_export_preserves_exact_marker !== true ||
    markerPolicy?.checkpoint_import_preserves_exact_marker !== true ||
    !sameStringSet(markerPolicy?.checkpoint_import_result_fields, [
      'unknown_outcomes_imported', 'active_unknown_marker_count', 'reconcile_required',
    ]) ||
    markerPolicy?.checkpoint_import_required_next_action !== 'status_then_exact_reconcile' ||
    markerPolicy?.ordinary_mutations_allowed !== false ||
    !sameStringSet(markerPolicy?.allowed_commands, ['status', 'exact_reconcile']) ||
    JSON.stringify(markerPolicy?.exact_reconcile_match_fields) !== JSON.stringify(requiredUnknownMarkerFields) ||
    markerPolicy?.resolved_marker_reimport_behavior !== 'must_not_resurrect' ||
    markerPolicy?.different_marker_overwrite_or_omission_allowed !== false ||
    checkpoint?.publish_or_promotion_state_imported !== false ||
    checkpoint?.recipient_remote_readback !== 'fresh_remote_inspect_before_any_upload_or_promotion'
  ) {
    console.error('FAIL release_checkpoint_transport: executor switches must preserve exact controls and unknown markers without rebuilding or resurrecting resolved outcomes');
    failures += 1;
  }
  if (
    operations?.schema !== 'opl_release_bundle_operation_control.v1' ||
    operations?.stable_mutation_mutex !== 'opl-release-bundle-global' ||
    operations?.stable_mutation_mutex_scope !== 'public_mutation_jobs_only' ||
    JSON.stringify(operations?.stable_mutation_mutex_jobs) !== JSON.stringify([
      '_release-bundle.yml#publish-standard',
      'release-stable.yml#resume-standard',
      '_release-full-addon.yml#publish-full',
      '_release-desktop-platform-addon.yml#append-platform',
      'release-stable-post-success-followups.yml#repair-additive',
      'release-manual-preview.yml#resume-preview',
      'release-manual-preview.yml#move-latest-pointer',
      'release-manual-full-preview.yml#mutate',
    ]) ||
    operations?.operator_entry !== 'npm run release:stable-dispatch' ||
    operations?.dispatch_plan_schema !== 'opl_app_stable_dispatch_plan.v1' ||
    operations?.dispatch_attempt_schema !== 'opl_app_stable_dispatch_attempt.v1' ||
    operations?.maximum_workflow_mutations_per_attempt !== 1 ||
    operations?.mutation_retry_allowed !== false ||
    operations?.unknown_dispatch_outcome !== 'read_only_reconcile_never_redispatch' ||
    operations?.version_input_policy?.standard !== 'forbidden_controller_delegates_single_allocation_to_workflow' ||
    operations?.version_input_policy?.resume_standard !== 'forbidden_preserve_source_checkpoint_tag' ||
    operations?.version_input_policy?.append_full !== 'forbidden_preserve_source_checkpoint_tag' ||
    operations?.full_recovery_identity_roles?.source_checkpoint_run_id !== 'portable_framework_checkpoint_owner' ||
    operations?.full_recovery_identity_roles?.artifact_producer_run_id !== 'full_cohort_actions_run_id' ||
    operations?.full_recovery_identity_roles?.qualification_run_id !== 'failed_qualification_receipt_run_id' ||
    operations?.full_recovery_identity_roles?.verification_app_ref !== 'qualification_scope_proof_app_head_sha_or_explicit_exact_override' ||
    operations?.full_recovery_identity_roles?.smoke_harness_ref !== 'qualification_scope_proof_shell_head_sha_or_explicit_exact_override' ||
    operations?.full_recovery_identity_roles?.roles_must_not_be_inferred_as_equal !== true ||
    standardArtifactRecoveryVerification?.operation_fingerprint !== 'opl-desktop-stable-release:smoke-harness:<exact_shell_sha>' ||
    standardArtifactRecoveryVerification?.source_gate_reuse !== 'exact_operation_fingerprint_only' ||
    standardOperation?.source !== 'new_framework_bundle' ||
    standardOperation?.control !== 'new_immutable_standard_control' ||
    standardOperation?.deadline_minutes !== 90 ||
    resumeStandardOperation?.source !== 'portable_framework_checkpoint' ||
    resumeStandardOperation?.control !== 'reuse_exact_standard_identity_with_bounded_expired_window_rotation' ||
    resumeStandardOperation?.deadline_minutes !== 30 ||
    JSON.stringify(resumeStandardOperation?.reused_identity_fields) !== JSON.stringify(
      requiredOperationControlFields.filter((field) => !['control_digest', 'operation_started_at', 'operation_deadline_at'].includes(field)),
    ) ||
    resumeStandardOperation?.new_operation_id_allowed !== false ||
    resumeStandardOperation?.active_window_rotation_allowed !== false ||
    resumeStandardOperation?.expired_window_rotation_allowed !== true ||
    resumeStandardOperation?.rotation_requires_no_active_unknown_marker !== true ||
    resumeStandardOperation?.rotation_started_at_source !== 'current_github_actions_run_created_at' ||
    resumeStandardOperation?.framework_source_cohort_change_allowed !== false ||
    resumeStandardOperation?.framework_executor_may_advance_to_canonical_compatible_sha !== true ||
    resumeStandardOperation?.rebuild_allowed !== false ||
    appendFullOperation?.source !== 'portable_framework_checkpoint_at_or_after_standard_built' ||
    appendFullOperation?.control !== 'new_independent_append_full_control' ||
    appendFullOperation?.deadline_minutes !== 120 ||
    appendFullOperation?.standard_built_required !== true ||
    appendFullOperation?.standard_rebuild_allowed !== false ||
    appendFullOperation?.standard_operation_id_reuse_allowed !== false ||
    appendFullOperation?.standard_deadline_inheritance_allowed !== false ||
    operations?.job_admission !== 'every_mutating_job_checks_exact_operation_and_absolute_deadline_before_first_remote_api' ||
    operations?.deadline_clock !== 'github_actions_created_at_resolved_once_by_controller' ||
    operations?.deadline_source_field !== 'github.created_at' ||
    operations?.deadline_frozen_at_controller_admission !== true ||
    operations?.deadline_may_be_rebased_on_queue_start_resume_or_rerun !== 'resume_standard_only_after_exact_reconcile_and_expiry' ||
    JSON.stringify(operations?.operation_admission_identity_fields) !== JSON.stringify([
      'operation', 'operation_id', 'operation_started_at', 'operation_deadline_at',
    ]) ||
    operations?.operation_id_required_for_admit_build_verify_publish_and_reconcile !== true ||
    operations?.same_operation_jobs_and_mutations_share_exact_deadline !== true ||
    operations?.each_external_mutation_rechecks_remaining_deadline !== true ||
    operations?.append_full_uses_new_operation_admission !== true ||
    operations?.append_full_may_inherit_standard_deadline !== false ||
    operations?.deadline_refresh_allowed !== 'resume_standard_expired_window_only' ||
    operations?.partial_workflow_rerun_allowed !== false ||
    operations?.github_run_attempt_required !== 1 ||
    operations?.recovery_entry !== 'status_then_exact_reconcile_for_active_unknown_else_resume_exact_standard_or_admit_independent_append_full' ||
    operations?.elapsed_deadline?.ordinary_mutation_allowed !== false ||
    operations?.elapsed_deadline?.status_allowed !== true ||
    operations?.elapsed_deadline?.exact_reconcile_allowed !== true ||
    operations?.elapsed_deadline?.exact_reconcile_result !== 'late_observation' ||
    operations?.elapsed_deadline?.stage_advanced !== false ||
    operations?.elapsed_deadline?.evidence_only !== true ||
    operations?.typed_failure_evidence_required !== true ||
    operations?.typed_failure_evidence_persisted_before_job_exit_or_cleanup !== true ||
    operations?.typed_failure_evidence_uploaded_on_failure !== true
  ) {
    console.error('FAIL release_operation_control: Standard identity must be immutable, resume may rotate only an expired reconciled window, append must stay independent, and late reconcile remains evidence-only');
    failures += 1;
  }
  if (
    stableStageResult?.schema !== 'opl_app_stable_stage_result.v1' ||
    stableStageResult?.json_schema !== 'contracts/app-stable-stage-result.schema.json' ||
    stableStageResult?.script !== 'scripts/stable-stage-result.ts' ||
    stableStageResult?.authority !== 'attempt_observation_only_no_framework_state_projection' ||
    stableStageResult?.business_stage_count !== 11 ||
    JSON.stringify(stableStageResult?.stage_ids) !== JSON.stringify(requiredStableBusinessStageIds) ||
    JSON.stringify(stableStageResult?.axes) !== JSON.stringify(requiredStableStageAxes) ||
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
    console.error('FAIL stable_stage_result_contract: App stage results must be deterministic non-authoritative attempt observations');
    failures += 1;
  }
  if (
    failureFingerprint?.schema !== 'opl_app_stable_failure_fingerprint.v1' ||
    failureFingerprint?.stage_result_schema !== 'opl_app_stable_stage_result.v1' ||
    JSON.stringify(failureFingerprint?.identity_fields) !==
      JSON.stringify(requiredStableFailureFingerprintFields) ||
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
    console.error('FAIL stable_failure_fingerprint_contract: unchanged fingerprints must deny dispatch before transport');
    failures += 1;
  }
  if (
    publication?.stable?.primary_release_manual_dispatch_workflow !== '.github/workflows/release-stable.yml' ||
    publication?.stable?.additive_repair_manual_dispatch_workflow !==
      '.github/workflows/release-stable-post-success-followups.yml' ||
    publication?.stable?.trigger !== 'workflow_dispatch' ||
    publication?.stable?.lower_level_workflows !==
      'workflow_call_only_except_protected_same_tag_installer_repair' ||
    JSON.stringify(publication?.stable?.latest_admission) !== JSON.stringify(requiredStandardLatestAdmission)
  ) {
    console.error('FAIL release_latest_admission: Latest must require the hosted publication floor, exact candidate bytes, and Homebrew publication/readback without optional certification evidence');
    failures += 1;
  }
  if (
    publication?.nightly?.status !== 'implemented' ||
    publication?.nightly?.publication_available !== true ||
    publication?.nightly?.mutation_available !== true ||
    publication?.nightly?.historical_readback_allowed !== true ||
    publication?.nightly?.workflow !== '.github/workflows/release-nightly.yml' ||
    publication?.nightly?.default_trigger !== 'daily_schedule' ||
    JSON.stringify(publication?.nightly?.development_validation_trigger) !== JSON.stringify({
      event: 'workflow_dispatch',
      authority: 'user_explicit',
      confirmation: 'publish_nonlatest_nightly',
      execution_path: 'same_as_scheduled_nightly',
    }) ||
    publication?.nightly?.scheduled_latest_allowed !== false ||
    publication?.nightly?.explicit_user_override_may_move_latest !== true ||
    publication?.nightly?.include_full !== false ||
    publication?.nightly?.stable_bundle_authority_used !== false ||
    publication?.nightly?.stable_mutation_mutex_used !== false ||
    publication?.nightly?.heavy_vm_blocking !== false ||
    publication?.nightly?.post_publication_followers_block_github_prerelease !== false ||
    publication?.nightly?.followup_workflow !== '.github/workflows/release-nightly-followups.yml' ||
    !sameStringSet(publication?.nightly?.followup_operations, ['reconcile_homebrew', 'run_sampled_vm'])
  ) {
    console.error('FAIL release_nightly_publication: Nightly must default to the daily schedule and keep user-explicit development validation on the same Standard-only non-Latest path');
    failures += 1;
  }
  if (
    publisher?.missing_asset !== 'upload' ||
    publisher?.same_name_same_digest !== 'already_complete' ||
    publisher?.same_name_different_digest !== 'fail_closed_require_new_bundle_or_version' ||
    publisher?.unknown_api_result !== 'reconcile_only' ||
    publisher?.redispatch_on_unknown_allowed !== false ||
    publisher?.rerun_on_unknown_allowed !== false ||
    publisher?.cancel_on_unknown_allowed !== false ||
    JSON.stringify(publisher?.reconcile_admission) !== JSON.stringify(requiredPublisherReconcileAdmission)
  ) {
    console.error('FAIL release_reconcile_admission: persistent Framework unknown status must gate bounded inspect and reconcile without mutation retries');
    failures += 1;
  }
  if (
    resilience?.same_day_revision_allocation_ref !== 'github_release_name.stable_revision' ||
    resilience?.machine_version_monotonicity_ref !== 'github_release_name.machine_version' ||
    resilience?.stable_version_comparison_scope !== 'all_public_stable_releases_not_latest_only' ||
    resilience?.display_and_machine_versions_both_must_increase !== true ||
    resilience?.source_and_remote_version_checks_required_before_build !== true ||
    !sameStringSet(resilience?.updater_baseline_sources, ['current_latest', 'highest_public_stable']) ||
    resilience?.updater_candidate_identity_required_before_publication !== true ||
    resilience?.updater_predecessor_to_candidate_vm_required_before_publication !== false ||
    resilience?.updater_clean_install_qualification !== 'exact_candidate_standard_clean_install_and_runtime_version_readback' ||
    resilience?.updater_zip_digest_source !== 'sha256_of_actual_candidate_zip_bytes' ||
    !sameStringSet(resilience?.updater_zip_identity_fields, ['size_bytes', 'sha256']) ||
    resilience?.updater_metadata_declared_digest_is_not_sufficient !== true ||
    resilience?.homebrew_single_writer !== true ||
    resilience?.homebrew_unknown_outcome !== 'follower_fails_independently_then_fresh_cas_readback_before_optional_rerun' ||
    resilience?.homebrew_reconcile_owner !== '.github/workflows/release-stable-post-success-followups.yml#reconcile_homebrew_standard' ||
    resilience?.homebrew_app_local_reconcile_loop_allowed !== false ||
    resilience?.homebrew_reconcile_max_attempts !== undefined ||
    resilience?.homebrew_retry_push_on_unknown_allowed !== false ||
    resilience?.homebrew_success_requires_exact_remote_commit_and_cask_digest_readback !== true ||
    resilience?.partial_publication_unknown_result !== 'framework_reconcile_before_any_new_mutation'
  ) {
    console.error('FAIL release_resilience: version monotonicity, pre-public updater bytes, and Framework-owned exact Homebrew reconcile are mandatory');
    failures += 1;
  }
  if (
    !control?.cutover?.permanently_rejected_bundle_digests?.includes(
      'sha256:91d5ea069757fca6bb9aa2280615dc952caeff55b6b4bc13e08e40df32378f49',
    )
  ) {
    console.error('FAIL release_rejected_bundle: the known failed Bundle digest must remain permanently ineligible');
    failures += 1;
  }
  if (
    legacy?.lifecycle !== 'retired_historical_receipt_compatibility' ||
    legacy?.authority_class !== 'historical_read_only' ||
    legacy?.broker_session_operator_authority !== 'historical_read_only' ||
    legacy?.access !== 'read_only' ||
    legacy?.authoritative !== false ||
    legacy?.mode !== 'read_only_receipt_parser' ||
    legacy?.new_state_creation_allowed !== false ||
    legacy?.legacy_broker_and_stable_state_machine_live_mutation_authority !== false ||
    legacy?.historical_receipts_remain_readable !== true ||
    legacy?.new_legacy_dispatch_publish_or_rebuild_allowed !== false ||
    !sameStringSet(legacy?.accepted_read_only_commands, ['verify', 'status']) ||
    !stringArrayIncludesAll(legacy?.parser_forbidden_capabilities, [
      'create_release_state', 'authorize_mutation', 'dispatch', 'rerun', 'cancel',
      'build', 'qualify', 'publish', 'promote', 'reconcile_live_state',
    ]) ||
    !sameStringSet(legacy?.retired_package_scripts, requiredRetiredReleasePackageScripts) ||
    !sameStringSet(legacy?.removed_implementation_paths, requiredRemovedReleaseImplementationPaths) ||
    legacy?.removed_implementation_paths_must_be_absent !== true ||
    !sameStringSet(
      legacy?.retained_non_authoritative_implementation_paths,
      requiredRetainedNonAuthoritativeImplementationPaths,
    ) ||
    draftInspection?.implementation_path !== 'scripts/inspect-release-draft-candidates.ts' ||
    draftInspection?.lifecycle !== 'historical_read_only' ||
    draftInspection?.capability !== 'inspect_draft_candidates' ||
    draftInspection?.package_entry !== null ||
    draftInspection?.workflow_entry !== null ||
    draftInspection?.requires_published_stable_release !== true ||
    !sameStringSet(draftInspection?.accepted_tag_families, [
      'v<version>-draft.<YYYYMMDDhhmmss>',
      'v<version>-readiness.<YYYYMMDDhhmmss>',
    ]) ||
    draftInspection?.mutation_authorized !== false ||
    draftInspection?.release_or_tag_deletion_available !== false ||
    legacy?.retired_scripts_may_parse_historical_receipts !== false ||
    legacy?.retired_scripts_may_be_package_or_workflow_mutation_entrypoints !== false ||
    legacy?.legacy_contract_role !== 'historical_receipt_verification_only' ||
    acceleration?.scope !== 'product_build_qualification_vm_and_cache_policy_only' ||
    acceleration?.product_policy_only !== true ||
    acceleration?.live_state_authority !== false ||
    acceleration?.live_mutation_authority !== false ||
    acceleration?.new_session_or_dispatch_allowed !== false ||
    acceleration?.state_authority_ref !== 'release_bundle_control_plane.framework_authority' ||
    acceleration?.github_actions?.live_release_mutation_authority !== false ||
    releaseContract.operator_evidence_bundle?.release_owner_verdict?.live_release_mutation_authority !== false ||
    releaseContract.operator_evidence_bundle?.release_owner_verdict?.framework_bundle_state_effect !== 'none' ||
    releaseContract.operator_evidence_bundle?.release_owner_verdict?.may_dispatch_rerun_cancel_publish_or_promote !== false
  ) {
    console.error('FAIL release_legacy_retirement: broker, session, and operator implementations must remain absent while retained Bundle status commands read historical evidence');
    failures += 1;
  }
  for (const relativePath of requiredRemovedReleaseImplementationPaths) {
    if (fs.existsSync(path.join(appRoot, relativePath))) {
      console.error(`FAIL release_legacy_retirement: removed implementation still exists: ${relativePath}`);
      failures += 1;
    }
  }
  for (const relativePath of requiredRetainedNonAuthoritativeImplementationPaths) {
    if (!fs.existsSync(path.join(appRoot, relativePath))) {
      console.error(`FAIL release_legacy_retirement: retained non-authoritative reader is missing: ${relativePath}`);
      failures += 1;
    }
  }
  if (JSON.stringify(validationCanary) !== JSON.stringify(requiredValidationCanary)) {
    console.error('FAIL release_validation_canary: Canary must run only local read-only contract checks without starting reusable release workflows');
    failures += 1;
  }
  if (
    settingsRuntimeRefresh?.schema !== 'opl_settings_runtime_refresh_evidence_policy.v1' ||
    settingsRuntimeRefresh?.production_default_targets_required !== true ||
    settingsRuntimeRefresh?.synthetic_target_injection_allowed !== false ||
    JSON.stringify(settingsRuntimeRefresh?.required_routes) !== JSON.stringify([
      {
        id: 'runtime-settings-alias',
        requested_hash: '#/settings/runtime',
        allowed_resolved_hash_prefixes: ['#/settings/environment'],
      },
      {
        id: 'runtime-status',
        requested_hash: '#/runtime',
        allowed_resolved_hash_prefixes: ['#/runtime'],
      },
    ]) ||
    !sameStringSet(settingsRuntimeRefresh?.required_evidence_fields, [
      'id',
      'requested_hash',
      'resolved_hash',
      'interactions.runtimeRefresh.requested_hash',
      'interactions.runtimeRefresh.resolved_hash',
      'interactions.runtimeRefresh.readiness.hash',
      'interactions.runtimeRefresh.readiness.state',
      'interactions.runtimeRefresh.readiness.pageReady',
      'interactions.runtimeRefresh.refresh.before_click.buttonReady',
      'interactions.runtimeRefresh.refresh.after_click.buttonReady',
    ]) ||
    !sameStringSet(settingsRuntimeRefresh?.allowed_readiness_states, ['ready', 'empty']) ||
    settingsRuntimeRefresh?.distinct_entry_per_route_required !== true ||
    settingsRuntimeRefresh?.default_timeout_ms !== 30000 ||
    settingsRuntimeRefresh?.phase_timeout_binding !== 'min_timeout_ms_and_codex_readiness_phase_timeout_ms_or_timeout_ms' ||
    settingsRuntimeRefresh?.validator !== 'scripts/validate-settings-smoke-runtime-evidence.ts' ||
    settingsRuntimeRefresh?.workflow !== '.github/workflows/opl-first-run-vm.yml' ||
    settingsRuntimeRefresh?.verification_artifact !== 'artifacts/opl-first-run-vm/artifacts/settings-runtime-refresh-verification.json' ||
    settingsRuntimeRefresh?.source_implementation_failure_mode !== 'fail_closed_before_expensive_build_or_vm' ||
    settingsRuntimeRefresh?.runtime_evidence_failure_mode !== 'fail_closed_before_qualification_receipt_or_publication'
  ) {
    console.error('FAIL release_settings_runtime_refresh: production VM evidence must prove both Runtime routes without synthetic target substitution');
    failures += 1;
  }
  if (
    !sameStringSet(homebrew?.allowed_casks, ['one-person-lab', 'one-person-lab-nightly', 'one-person-lab-full']) ||
    !sameStringSet(homebrew?.casks, ['one-person-lab', 'one-person-lab-nightly', 'one-person-lab-full']) ||
    !sameStringSet(homebrew?.initial_live_targets, [
      'Casks/one-person-lab.rb', 'Casks/one-person-lab-nightly.rb', 'Casks/one-person-lab-full.rb',
    ]) ||
    !sameStringSet(homebrew?.excluded_casks, []) ||
    !sameStringSet(homebrew?.full_casks, ['one-person-lab-full']) ||
    homebrew?.tap_update_policy?.stable_release_workflow_write_mode !== 'post_publication_non_blocking_follower' ||
    homebrew?.tap_update_policy?.default_workflow !== '.github/workflows/release-stable-post-success-followups.yml' ||
    homebrew?.tap_update_policy?.default_operation !== 'reconcile_homebrew_standard' ||
    homebrew?.tap_update_policy?.stable?.mode !==
      'post_publication_digest_bound_cas_follower' ||
    homebrew?.tap_update_policy?.stable?.publication_mode !==
      'post_publication_digest_bound_cas_follower' ||
    homebrew?.tap_update_policy?.stable?.workflow !== '.github/workflows/release-stable-post-success-followups.yml' ||
    homebrew?.tap_update_policy?.stable?.operation !== 'reconcile_homebrew_standard' ||
    homebrew?.tap_update_policy?.stable?.environment !== 'release-stable' ||
    homebrew?.tap_update_policy?.stable?.target !== 'Casks/one-person-lab.rb' ||
    homebrew?.tap_update_policy?.stable?.source_completed_stage !== 'standard_public_and_latest_activated' ||
    homebrew?.tap_update_policy?.stable?.mutation_allowed !== true ||
    homebrew?.tap_update_policy?.stable?.core_release_or_latest_blocking !== false ||
    homebrew?.tap_update_policy?.stable?.same_tag_replacement_allowed !== true ||
    homebrew?.tap_update_policy?.stable?.new_release_version_required_for_changed_bytes !== false ||
    homebrew?.tap_update_policy?.stable?.exact_current_cask_sha256_cas_required !== true ||
    homebrew?.tap_update_policy?.stable?.fresh_cas_rerun_allowed !== true ||
    homebrew?.tap_update_policy?.stable?.may_consume_nightly_directly !== false ||
    homebrew?.tap_update_policy?.stable?.desired_state_reconciliation?.trigger !== 'workflow_dispatch' ||
    homebrew?.tap_update_policy?.stable?.desired_state_reconciliation?.authority_binding !==
      'same_successful_standard_run_and_exact_published_handoff' ||
    !sameStringSet(homebrew?.tap_update_policy?.stable?.desired_state_reconciliation?.required_inputs, [
      'operation', 'source_run_id',
    ]) ||
    homebrew?.tap_update_policy?.stable?.desired_state_reconciliation?.operation !==
      'reconcile_homebrew_standard' ||
    homebrew?.tap_update_policy?.stable?.desired_state_reconciliation?.failed_run_history_inputs_forbidden !== true ||
    homebrew?.tap_update_policy?.stable?.desired_state_reconciliation?.exact_publication_handoff_required !== true ||
    homebrew?.tap_update_policy?.stable?.desired_state_reconciliation?.missing_or_expired_handoff !== 'fail' ||
    homebrew?.tap_update_policy?.stable?.desired_state_reconciliation?.exact_current_cask_sha256_cas_required !== true ||
    homebrew?.tap_update_policy?.stable?.desired_state_reconciliation?.canonical_main_executor_required !== true ||
    homebrew?.tap_update_policy?.stable?.desired_state_reconciliation?.concurrency_scope !== 'source_run_id' ||
    homebrew?.tap_update_policy?.stable?.desired_state_reconciliation?.workflow_rerun_allowed !== false ||
    homebrew?.tap_update_policy?.stable?.desired_state_reconciliation?.standard_redispatch_allowed !== false ||
    homebrew?.tap_update_policy?.nightly?.mode !== 'post_publication_digest_bound_single_attempt_follower' ||
    homebrew?.tap_update_policy?.nightly?.workflow !== '.github/workflows/release-nightly-followups.yml' ||
    homebrew?.tap_update_policy?.nightly?.operation !== 'reconcile_homebrew' ||
    homebrew?.tap_update_policy?.nightly?.environment !== 'release-nightly' ||
    homebrew?.tap_update_policy?.nightly?.credential?.kind !== 'repository_scoped_write_deploy_key' ||
    homebrew?.tap_update_policy?.nightly?.credential?.repository !== 'gaofeng21cn/homebrew-one-person-lab' ||
    homebrew?.tap_update_policy?.nightly?.credential?.secret !==
      'release-nightly.OPL_HOMEBREW_TAP_DEPLOY_KEY' ||
    homebrew?.tap_update_policy?.nightly?.credential?.stable_environment_credentials_reused !== false ||
    homebrew?.tap_update_policy?.nightly?.target !== 'Casks/one-person-lab-nightly.rb' ||
    homebrew?.tap_update_policy?.nightly?.may_update_stable !== false ||
    homebrew?.tap_update_policy?.nightly?.mutation_allowed !== true ||
    homebrew?.tap_update_policy?.nightly?.stable_cask_must_remain_exact !== true ||
    homebrew?.tap_update_policy?.nightly?.unknown_or_conflicting_result !== 'fail_closed_no_retry_rerun_or_redispatch' ||
    homebrew?.tap_update_policy?.full?.mode !== 'post_publication_digest_bound_single_attempt_follower' ||
    homebrew?.tap_update_policy?.full?.workflow !== '.github/workflows/release-stable-post-success-followups.yml' ||
    homebrew?.tap_update_policy?.full?.operation !== 'reconcile_homebrew_full' ||
    homebrew?.tap_update_policy?.full?.environment !== 'release-stable' ||
    homebrew?.tap_update_policy?.full?.target !== 'Casks/one-person-lab-full.rb' ||
    homebrew?.tap_update_policy?.full?.homebrew_publish_allowed !== true ||
    homebrew?.tap_update_policy?.full?.mutation_allowed !== true ||
    homebrew?.tap_update_policy?.full?.source_completed_stage !== 'full_qualified' ||
    homebrew?.tap_update_policy?.full?.authority_model !== 'workflow_cas_and_unified_attestation_observer' ||
    homebrew?.tap_update_policy?.full?.framework_checkpoint_import_allowed !== false ||
    homebrew?.tap_update_policy?.full?.current_follower_operation_control_required !== true ||
    homebrew?.tap_update_policy?.full?.homebrew_clean_vm_gate_required !== false ||
    homebrew?.tap_update_policy?.full?.framework_carrier !== 'full_dmg_embedded_opl_base' ||
    homebrew?.tap_update_policy?.full?.formula_dependency_required !== false ||
    homebrew?.tap_update_policy?.full?.promotion_status !== 'approved_pending_first_protected_follower_readback' ||
    homebrew?.tap_update_policy?.full?.unknown_or_conflicting_result !== 'fail_closed_no_retry_rerun_or_redispatch' ||
    homebrew?.tap_update_policy?.full?.desired_state_reconciliation?.trigger !== 'workflow_dispatch' ||
    homebrew?.tap_update_policy?.full?.desired_state_reconciliation?.authority_binding !==
      'same_successful_append_full_run_and_exact_published_handoff' ||
    !sameStringSet(homebrew?.tap_update_policy?.full?.desired_state_reconciliation?.required_inputs, [
      'operation', 'source_run_id',
    ]) ||
    homebrew?.tap_update_policy?.full?.desired_state_reconciliation?.operation !==
      'reconcile_homebrew_full' ||
    homebrew?.tap_update_policy?.full?.desired_state_reconciliation?.failed_run_history_inputs_forbidden !== true ||
    homebrew?.tap_update_policy?.full?.desired_state_reconciliation?.exact_publication_handoff_required !== true ||
    homebrew?.tap_update_policy?.full?.desired_state_reconciliation?.missing_or_expired_handoff !== 'fail' ||
    homebrew?.tap_update_policy?.full?.desired_state_reconciliation?.exact_current_cask_sha256_cas_required !== true ||
    homebrew?.tap_update_policy?.full?.desired_state_reconciliation?.canonical_main_executor_required !== true ||
    homebrew?.tap_update_policy?.full?.desired_state_reconciliation?.concurrency_scope !== 'source_run_id' ||
    homebrew?.tap_update_policy?.full?.desired_state_reconciliation?.workflow_rerun_allowed !== false ||
    homebrew?.tap_update_policy?.full?.desired_state_reconciliation?.append_full_redispatch_allowed !== false ||
    homebrew?.full_first_install_policy !== 'the already-public mutable Standard GitHub Release is the exact same-tag append target; workflow asset name+digest CAS and the unified public attestation bind the Full DMG and manifest. After exact Full asset readback, append_full idempotently updates the same Release body with the Full download URL, digest, size, and manifest so publication is visible to users. The protected Homebrew Full follower consumes those exact same-tag assets with digest CAS and public readback; physical clean-machine certification remains optional and non-blocking; no independent Full release or tag is created, and the Standard assets, Latest, and updater metadata remain unchanged' ||
    !sameStringSet(homebrew?.opl_packages_boundary?.allowed_homebrew_casks, [
      'one-person-lab', 'one-person-lab-nightly', 'one-person-lab-full',
    ])
  ) {
    console.error('FAIL release_homebrew_distribution: Nightly and Full must use digest-bound followers; Full must expose exact same-tag download metadata after asset readback without changing Standard assets, Latest, or updater state');
    failures += 1;
  }
  const readiness = evaluateReleaseBrokerAuthorityReadiness(brokerAuthority);
  if (
    readiness.current_release_admission_readiness.status !== 'retired' ||
    readiness.current_release_admission_readiness.mode !== 'framework_checkpoint_app_executor' ||
    readiness.isolated_broker_hardening.status !== 'retired' ||
    readiness.isolated_broker_hardening.disposition !== 'historical_receipt_verification_only'
  ) {
    console.error('FAIL release_broker_retirement: the legacy broker contract must be verify-only and non-authoritative');
    failures += 1;
  }

  return failures;
}
