import { sameStringSet } from './validate-release-boundary/release-contract-policy/types.ts';
import { frameworkReleaseAbiSha } from './release-control-plane-policy-values.ts';

type ReleasePolicySection = Record<string, any> | null | undefined;

export function hasFrameworkAuthority(control: ReleasePolicySection): boolean {
  const framework = control?.framework_authority;
  return !(
    control?.schema !== 'opl_app_release_bundle_control_plane.v1' ||
    control?.contract_status !== 'active' ||
    framework?.owner !== 'gaofeng21cn/one-person-lab-app' ||
    framework?.cli !== 'node --experimental-strip-types scripts/release-bundle-cli.ts' ||
    framework?.bundle_schema !== 'opl_release_bundle.v1' ||
    framework?.checkpoint_schema !== 'opl_release_bundle_checkpoint.v1' ||
    framework?.operation_control_schema !== 'opl_release_bundle_operation_control.v1' ||
    framework?.operation_event_schema !== 'opl_release_bundle_operation_event.v1' ||
    framework?.consumer_envelope_schema !== 'opl_release_bundle_consumer_envelope.v1' ||
    framework?.unknown_outcome_schema !== 'opl_release_bundle_unknown_outcome.v1' ||
    framework?.portable_checkpoint_authority_first_landed_sha !== 'f785cda96' ||
    framework?.consumed_abi_sha !== frameworkReleaseAbiSha ||
    framework?.live_mutation_authority !== 'app_release_bundle_executor' ||
    framework?.checkpoint_and_receipt_state_authority_exclusive !== true ||
    framework?.app_may_define_checkpoint_or_receipt_schema !== false ||
    framework?.app_may_derive_or_project_release_stage_state !== false
  );
}

export function hasLiveReleaseAuthority(live: ReleasePolicySection): boolean {
  return !(
    live?.single_live_mutation_authority !== true ||
    live?.state_owner !== 'one-person-lab-app release-bundle-cli' ||
    live?.state_surface !== 'opl_release_bundle_checkpoint.v1' ||
    live?.mutation_executor_owner !== 'one-person-lab-app' ||
    live?.state_authority_ref !== 'release_bundle_control_plane.framework_authority' ||
    live?.app_executor_consumes_framework_cli_results_without_state_projection !== true ||
    live?.stable_operator_entry !== 'npm run release:stable-dispatch' ||
    live?.stable_workflow_mutation_sink !== '.github/workflows/release-stable.yml' ||
    live?.direct_stable_workflow_dispatch_allowed !== false ||
    live?.attempt_identity_separate_from_release_version !== true ||
    live?.validation_canary_entry !== '.github/workflows/release-bundle-canary.yml_schedule' ||
    live?.app_session_broker_or_operator_may_authorize_mutation !== false ||
    live?.framework_checkpoint_required_for_resume_or_executor_switch !== true
  );
}

export function hasPortableCheckpointPolicy(checkpoint: ReleasePolicySection): boolean {
  const markerPolicy = checkpoint?.active_unknown_markers;
  const fullMaterializationCheckpoint = checkpoint?.full_materialization_checkpoint;
  return !(
    checkpoint?.schema !== 'opl_release_bundle_checkpoint.v1' ||
    checkpoint?.portable_between_executors !== true ||
    checkpoint?.import_never_rebuilds !== true ||
    checkpoint?.completed_stage_behavior !== 'skip_with_rebuild_performed_false' ||
    fullMaterializationCheckpoint?.required_after_materialization !== true ||
    JSON.stringify(fullMaterializationCheckpoint?.terminal_stages) !== JSON.stringify(['full_built', 'full_qualified']) ||
    fullMaterializationCheckpoint?.qualification_failure_preserves_stage !== 'full_built' ||
    fullMaterializationCheckpoint?.recovery_preference !== 'framework_checkpoint_before_actions_artifact_selection' ||
    fullMaterializationCheckpoint?.prior_full_artifact_run_id_scope !== 'legacy_runs_without_full_built_checkpoint' ||
    checkpoint?.asset_and_receipt_digest_revalidation_required !== true ||
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
    markerPolicy?.checkpoint_import_required_next_action !== 'status_then_exact_reconcile' ||
    markerPolicy?.ordinary_mutations_allowed !== false ||
    markerPolicy?.resolved_marker_reimport_behavior !== 'must_not_resurrect' ||
    markerPolicy?.different_marker_overwrite_or_omission_allowed !== false ||
    checkpoint?.publish_or_promotion_state_imported !== false ||
    checkpoint?.recipient_remote_readback !== 'fresh_remote_inspect_before_any_upload_or_promotion'
  );
}

export function hasStableOperationControl(operations: ReleasePolicySection): boolean {
  const standardOperation = operations?.stable_operations?.standard;
  const resumeStandardOperation = operations?.stable_operations?.resume_standard;
  const appendFullOperation = operations?.stable_operations?.append_full;
  const standardArtifactRecoveryVerification = operations?.standard_artifact_recovery_verification;
  return !(
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
  );
}

export function hasReleaseResilience(resilience: ReleasePolicySection): boolean {
  return !(
    resilience?.same_day_revision_allocation_ref !== 'github_release_name.stable_revision' ||
    resilience?.machine_version_monotonicity_ref !== 'github_release_name.machine_version' ||
    resilience?.stable_version_comparison_scope !== 'all_public_stable_releases_not_latest_only' ||
    resilience?.display_and_machine_versions_both_must_increase !== true ||
    resilience?.source_and_remote_version_checks_required_before_build !== true ||
    resilience?.updater_candidate_identity_required_before_publication !== true ||
    resilience?.updater_predecessor_to_candidate_vm_required_before_publication !== false ||
    resilience?.updater_clean_install_qualification !== 'exact_candidate_standard_clean_install_and_runtime_version_readback' ||
    resilience?.updater_zip_digest_source !== 'sha256_of_actual_candidate_zip_bytes' ||
    resilience?.updater_metadata_declared_digest_is_not_sufficient !== true ||
    resilience?.homebrew_single_writer !== true ||
    resilience?.homebrew_unknown_outcome !== 'follower_fails_independently_then_fresh_cas_readback_before_optional_rerun' ||
    resilience?.homebrew_reconcile_owner !== '.github/workflows/release-stable-post-success-followups.yml#reconcile_homebrew_standard' ||
    resilience?.homebrew_app_local_reconcile_loop_allowed !== false ||
    resilience?.homebrew_reconcile_max_attempts !== undefined ||
    resilience?.homebrew_retry_push_on_unknown_allowed !== false ||
    resilience?.homebrew_success_requires_exact_remote_commit_and_cask_digest_readback !== true ||
    resilience?.partial_publication_unknown_result !== 'framework_reconcile_before_any_new_mutation'
  );
}

export function hasStableStageResultPolicy(stableStageResult: ReleasePolicySection): boolean {
  return !(
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
  );
}

export function hasStableFailureFingerprintPolicy(failureFingerprint: ReleasePolicySection): boolean {
  return !(
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
  );
}

export function hasStablePublicationRoutes(stable: ReleasePolicySection): boolean {
  return !(
    stable?.primary_release_manual_dispatch_workflow !== '.github/workflows/release-stable.yml' ||
    stable?.additive_repair_manual_dispatch_workflow !==
      '.github/workflows/release-stable-post-success-followups.yml' ||
    stable?.trigger !== 'workflow_dispatch' ||
    stable?.lower_level_workflows !==
      'workflow_call_only_except_protected_same_tag_installer_repair'
  );
}

export function hasNightlyPublicationPolicy(nightly: ReleasePolicySection): boolean {
  return !(
    nightly?.status !== 'implemented' ||
    nightly?.publication_available !== true ||
    nightly?.mutation_available !== true ||
    nightly?.historical_readback_allowed !== true ||
    nightly?.workflow !== '.github/workflows/release-nightly.yml' ||
    nightly?.default_trigger !== 'daily_schedule' ||
    JSON.stringify(nightly?.development_validation_trigger) !== JSON.stringify({
      event: 'workflow_dispatch',
      authority: 'user_explicit',
      confirmation: 'publish_nonlatest_nightly',
      execution_path: 'same_as_scheduled_nightly',
    }) ||
    nightly?.scheduled_latest_allowed !== false ||
    nightly?.explicit_user_override_may_move_latest !== true ||
    nightly?.include_full !== false ||
    nightly?.stable_bundle_authority_used !== false ||
    nightly?.stable_mutation_mutex_used !== false ||
    nightly?.heavy_vm_blocking !== false ||
    nightly?.post_publication_followers_block_github_prerelease !== false ||
    nightly?.followup_workflow !== '.github/workflows/release-nightly-followups.yml' ||
    !sameStringSet(nightly?.followup_operations, ['reconcile_homebrew', 'run_sampled_vm'])
  );
}

export function hasPublisherIdempotency(publisher: ReleasePolicySection): boolean {
  return !(
    publisher?.missing_asset !== 'upload' ||
    publisher?.same_name_same_digest !== 'already_complete' ||
    publisher?.same_name_different_digest !== 'fail_closed_require_new_bundle_or_version' ||
    publisher?.unknown_api_result !== 'reconcile_only' ||
    publisher?.redispatch_on_unknown_allowed !== false ||
    publisher?.rerun_on_unknown_allowed !== false ||
    publisher?.cancel_on_unknown_allowed !== false
  );
}
