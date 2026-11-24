import { assertDeepEqualJson } from '../assertions.ts';
import {
  exactUnknownMarkerFields,
  frameworkReleaseAbiSha,
  frameworkReleaseCommandForms,
  frameworkReleaseCommands,
} from './execution-contract-values.ts';

function validateReleaseCheckpointAuthority(releaseChannel, shellPaths, validationProfile) {
  const control = releaseChannel?.release_bundle_control_plane;
  const framework = control?.framework_authority;
  const live = control?.live_authority;
  const checkpoint = control?.checkpoint_transport;
  const markerPolicy = checkpoint?.active_unknown_markers;
  const fullMaterializationCheckpoint = checkpoint?.full_materialization_checkpoint;

  if (
    control?.schema !== 'opl_app_release_bundle_control_plane.v1' ||
    control?.contract_status !== 'active' ||
    framework?.owner !== 'gaofeng21cn/one-person-lab' ||
    framework?.cli !== 'opl release' ||
    framework?.bundle_schema !== 'opl_release_bundle.v1' ||
    framework?.checkpoint_schema !== 'opl_release_bundle_checkpoint.v1' ||
    framework?.operation_control_schema !== 'opl_release_bundle_operation_control.v1' ||
    framework?.operation_event_schema !== 'opl_release_bundle_operation_event.v1' ||
    framework?.consumer_envelope_schema !== 'opl_release_bundle_consumer_envelope.v1' ||
    framework?.unknown_outcome_schema !== 'opl_release_bundle_unknown_outcome.v1' ||
    framework?.portable_checkpoint_authority_first_landed_sha !== 'f785cda96' ||
    framework?.consumed_abi_sha !== frameworkReleaseAbiSha ||
    framework?.live_mutation_authority !== 'framework_release_bundle_executor' ||
    framework?.checkpoint_and_receipt_state_authority_exclusive !== true ||
    framework?.app_may_define_checkpoint_or_receipt_schema !== false ||
    framework?.app_may_derive_or_project_release_stage_state !== false
  ) {
    throw new Error('Release control plane must use the Framework Release Bundle and checkpoint executor authority');
  }
  assertDeepEqualJson(
    framework.commands,
    frameworkReleaseCommands,
    'Framework release commands',
  );
  assertDeepEqualJson(
    framework.receipt_schemas,
    [
      'opl_release_bundle_executor_receipt.v1',
      'opl_release_bundle_operation_receipt.v1',
      'opl_release_bundle_qualification_receipt.v1',
    ],
    'Framework release receipt schemas',
  );
  assertDeepEqualJson(
    framework.command_forms,
    frameworkReleaseCommandForms,
    'Framework release command forms',
  );
  if (
    live?.single_live_mutation_authority !== true ||
    live?.state_owner !== 'OPL Framework opl release' ||
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
  ) {
    throw new Error('Release control plane must have one Framework checkpoint and App executor mutation authority');
  }
  assertDeepEqualJson(
    live.stable_operations,
    ['standard', 'resume_standard', 'append_full'],
    'Stable release operations',
  );
  assertDeepEqualJson(
    checkpoint?.stages,
    ['frozen', 'standard_built', 'standard_qualified', 'full_built', 'full_qualified'],
    'Framework checkpoint stages',
  );
  if (
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
  ) {
    throw new Error('Release checkpoint transport must preserve exact controls and unknown markers without rebuilding or resurrecting outcomes');
  }
  assertDeepEqualJson(
    checkpoint.source_build_provenance_fields,
    ['source_build_executor', 'source_build_run_id'],
    'Release source build provenance fields',
  );
  assertDeepEqualJson(
    checkpoint.transport_provenance_fields,
    ['checkpoint_transport_executor', 'transport_run_id'],
    'Release checkpoint transport provenance fields',
  );
  assertDeepEqualJson(
    markerPolicy.checkpoint_import_result_fields,
    ['unknown_outcomes_imported', 'active_unknown_marker_count', 'reconcile_required'],
    'Release checkpoint unknown import result fields',
  );
  assertDeepEqualJson(
    markerPolicy.allowed_commands,
    ['status', 'exact_reconcile'],
    'Release checkpoint active unknown allowed commands',
  );
  assertDeepEqualJson(
    markerPolicy.exact_reconcile_match_fields,
    exactUnknownMarkerFields,
    'Release checkpoint exact reconcile marker fields',
  );

}

export { validateReleaseCheckpointAuthority };
