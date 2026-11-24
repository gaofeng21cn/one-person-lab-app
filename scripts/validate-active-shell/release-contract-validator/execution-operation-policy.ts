import { assertDeepEqualJson } from '../assertions.ts';
import { immutableOperationControlFields } from './execution-contract-values.ts';

function validateReleaseOperations(releaseChannel, shellPaths, validationProfile) {
  const control = releaseChannel?.release_bundle_control_plane;
  const operations = control?.operation_control;
  const standardOperation = operations?.stable_operations?.standard;
  const resumeStandardOperation = operations?.stable_operations?.resume_standard;
  const appendFullOperation = operations?.stable_operations?.append_full;
  const standardArtifactRecoveryVerification = operations?.standard_artifact_recovery_verification;

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
    resilience?.same_day_revision_allocation_ref !== 'github_release_name.stable_revision' ||
    resilience?.machine_version_monotonicity_ref !== 'github_release_name.machine_version' ||
    resilience?.stable_version_comparison_scope !== 'all_public_stable_releases_not_latest_only' ||
    resilience?.display_and_machine_versions_both_must_increase !== true ||
    resilience?.source_and_remote_version_checks_required_before_build !== true ||
    JSON.stringify(resilience?.updater_baseline_sources) !== JSON.stringify(['current_latest', 'highest_public_stable']) ||
    resilience?.updater_candidate_identity_required_before_publication !== true ||
    resilience?.updater_predecessor_to_candidate_vm_required_before_publication !== false ||
    resilience?.updater_clean_install_qualification !== 'exact_candidate_standard_clean_install_and_runtime_version_readback' ||
    resilience?.updater_zip_digest_source !== 'sha256_of_actual_candidate_zip_bytes' ||
    JSON.stringify(resilience?.updater_zip_identity_fields) !== JSON.stringify(['size_bytes', 'sha256']) ||
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
    throw new Error('Release resilience must prove monotonic versions, pre-public updater bytes, and Framework-owned exact Homebrew reconcile');
  }

}

export { validateReleaseOperations, validateReleaseResilience };
