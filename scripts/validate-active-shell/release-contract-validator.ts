import { assertDeepEqualJson, assertIncludesAll } from './assertions.ts';
import { validateReleaseFullFirstInstallPayloads } from './release-full-first-install-payload-validator.ts';
import { validateReleaseHomebrewDistribution } from './release-homebrew-distribution-validator.ts';
import { managedUpdateCarrierAdapters, managedUpdateSoftwareObjectIds } from './managed-update-plane-policy.ts';
import { assertShellTextIncludesAll } from './shell-implementation-helpers.ts';
import {
  appOwnedStorageCarrierBehavior,
  appOwnedWebuiDataVolumeHostActionCapabilityId,
} from './app-contract-constants.ts';

const retiredReleasePackageScripts = [
  'release:stable',
  'release:operator',
  'release:publish',
  'release:bundle',
  'release:plan',
  'release:preflight',
  'release:cohort-lock',
  'release:cohort-plan',
  'release:closeout',
  'release:cleanup-drafts',
  'release:gate-reuse-plan',
  'release:cohort-manifest',
  'release:candidate-record',
  'release:candidate-record:resolve-owner',
  'release:candidate-record:validate',
  'release:candidate-record:status',
  'release:owner-candidate-record:verify',
];
const standardLatestAdmissionContract = {
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
    'candidate.app_sha',
    'candidate.shell_sha',
    'candidate.framework_sha',
    'candidate.zip.sha256',
    'candidate.zip.size_bytes',
    'candidate.dmg.sha256',
    'candidate.dmg.size_bytes',
  ],
  homebrew_evidence: {
    publication_schema: 'opl_bundle_homebrew_publication_receipt.v1',
    readback_schema: 'opl_bundle_homebrew_publication_readback_receipt.v1',
    required_digest_fields: [
      'homebrew.publication_receipt_sha256',
      'homebrew.readback_receipt_sha256',
    ],
    readback_must_bind_publication_actual_file_digest: true,
    clean_vm_receipt_allowed: false,
  },
  failure_mode: 'fail_closed_before_latest_patch',
};
const standardPrePublicationAdmissionContract = {
  validator: 'scripts/validate-standard-publication-input.ts',
  receipt_schema: 'opl_standard_pre_publication_admission_receipt.v1',
  required_status: 'passed',
  runs_before: 'publish-standard-nonlatest',
  public_mutation_allowed: false,
  failure_mode: 'fail_closed_before_public_release_creation',
};
const publisherReconcileAdmissionContract = {
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
const frameworkReleaseAbiSha = '9860dc64b56ed9cccb9984cd14e138d9ccacced7';
const frameworkReleaseCommands = [
  'freeze',
  'operation admit',
  'build',
  'checkpoint export',
  'checkpoint import',
  'verify',
  'publish',
  'reconcile',
  'status',
];
const frameworkReleaseCommandForms = [
  'opl release freeze --request <request.json> [--source-root <directory>] [--store <directory>]',
  'opl release operation admit --bundle <sha256:digest> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
  'opl release build --bundle <sha256:digest> --executor-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
  'opl release checkpoint export --bundle <sha256:digest> --output <directory> [--store <directory>]',
  'opl release checkpoint import --checkpoint <checkpoint.json> [--store <directory>]',
  'opl release verify --bundle <sha256:digest> --qualification-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--track standard|full] [--store <directory>]',
  'opl release publish --bundle <sha256:digest> --executor-receipt <remote-inspect.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
  'opl release reconcile --bundle <sha256:digest> --executor-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
  'opl release status --bundle <sha256:digest> [--store <directory>]',
];
const immutableOperationControlFields = [
  'control_digest',
  'bundle_digest',
  'operation_id',
  'operation_kind',
  'track',
  'operation_started_at',
  'operation_deadline_at',
];
const exactUnknownMarkerFields = [
  'bundle_digest',
  'operation_id',
  'operation_kind',
  'stage_operation',
  'publication_scope',
  'track',
  'remote_target',
  'prior_mutation_attempt_id',
];
const stableBusinessStageIds = [
  'admission_and_circuit_breaker',
  'source_contract_preflight',
  'native_webui_deterministic_prepare',
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
const stableStageAxes = ['qualification_product', 'evidence', 'transport', 'cleanup'];
const stableFailureFingerprintFields = [
  'cohort',
  'stage_id',
  'reason_code',
  'artifact_digest_or_input_digest',
  'environment_receipt_digest',
];
const validationCanaryContract = {
  workflow: '.github/workflows/release-bundle-canary.yml',
  mode: 'validation_only',
  triggers: ['push_main', 'pull_request', 'daily_schedule'],
  starts_reusable_topology: [
    '_release-bundle.yml',
    '_release-standard-publish.yml',
    '_release-full-addon.yml',
    '_build-reusable.yml',
    'opl-first-run-vm.yml',
    '_release-webui-carrier.yml',
    'release-webui-stable.yml',
    'opl-updater-upgrade-vm.yml',
    'full-first-install-release.yml',
  ],
  permissions: { contents: 'read', actions: 'read' },
  secrets_allowed: false,
  build_or_vm_execution_allowed: false,
  external_write_allowed: false,
  stable_mutation_allowed: false,
  publication_allowed: false,
  uses_stable_mutation_mutex: false,
  synthetic_identity_may_authorize_release: false,
};

export function validateReleaseChannelContract(releaseChannel, shellPaths = null) {
  validateReleaseCalendarGuard(releaseChannel.github_release_name);
  validateProviderConfigurationBoundary(releaseChannel.provider_configuration_boundary);
  const managedUpdatePlane = releaseChannel.managed_update_plane;
  validateStandardUpdater(releaseChannel.standard_updater);
  validateDistributionSemantics(releaseChannel.distribution_semantics);
  validateLocalDataLifecycle(releaseChannel.local_data_lifecycle, shellPaths);
  validateWebuiGhcrImage(releaseChannel.webui_ghcr_image);
  validateManagedUpdatePlane(managedUpdatePlane);
  validateReleaseExecutionPolicy(releaseChannel, shellPaths);
  validateOptionalCertificationPolicy(releaseChannel);
  validateReleaseHomebrewDistribution(releaseChannel);
  validateReleaseFullFirstInstallPayloads(releaseChannel);
}

function validateDistributionSemantics(semantics) {
  const latest = semantics?.latest_policy;
  if (
    latest?.default_automatic_writer !== 'newest_qualified_stable'
    || latest?.default_behavior !==
      'each_carrier_advances_its_own_latest_pointer_when_that_carrier_publishes_a_new_qualified_stable'
    || latest?.automatic_preview_or_nightly_writer_may_move_latest !== false
    || latest?.explicit_user_override?.target !== 'any_exact_published_version'
    || latest?.explicit_user_override?.authority !== 'protected_single_use'
    || latest?.explicit_user_override?.compare_and_swap !== 'exact_expected_current'
    || latest?.explicit_user_override?.public_readback !== 'exact_tag_digest_quality_and_disclosure'
    || latest?.explicit_user_override?.quality_unchanged !== true
    || latest?.explicit_user_override?.persistent_override !== false
    || latest?.explicit_user_override
      ?.non_stable_and_skipped_or_failed_gate_disclosure_required_for_preview_only !== true
    || latest?.explicit_user_override?.stable_candidate_requires_stable_qualification_disclosure !== true
    || latest?.move_latest_pointer?.target !== 'any_exact_published_version'
    || latest?.move_latest_pointer?.changes_quality !== false
    || latest?.move_latest_pointer?.explicit_user_override_required !== true
    || latest?.move_latest_pointer?.stable_or_preview_candidate_allowed !== true
    || latest?.next_qualified_stable_reclaims_pointer !== true
    || latest?.latest_pointer_does_not_define_highest_published_stable !== true
    || latest?.failure_preserves_current_latest_lkg !== true
  ) {
    throw new Error('Distribution Latest semantics must keep carrier pointers independent from Stable quality while requiring exact explicit overrides');
  }
  assertDeepEqualJson(
    latest.explicit_user_override.quality_statuses,
    ['stable', 'preview'],
    'Latest explicit override quality statuses',
  );
  assertDeepEqualJson(
    latest.explicit_user_override.preview_kinds,
    ['dev', 'nightly'],
    'Latest explicit override Preview kinds',
  );
}

function validateOptionalCertificationPolicy(releaseChannel) {
  const policy = releaseChannel?.post_publication_optional_certification;
  if (
    policy?.schema !== 'opl_app_optional_certification_policy.v1'
    || policy?.receipt_schema !== 'contracts/app-optional-certification-receipt.schema.json'
    || policy?.validator !== 'scripts/validate-optional-certification-receipt.ts'
    || policy?.required_for_publication !== false
    || policy?.required_for_latest !== false
    || policy?.artifact_source !== 'exact_immutable_published_release_artifact'
    || policy?.artifact_rebuild_allowed !== false
    || policy?.component_manifest_mutation_allowed !== false
    || policy?.component_manifest_resign_allowed !== false
    || policy?.producer?.workflow !== '.github/workflows/release-post-publication-certification.yml'
    || policy?.producer?.trigger !== 'workflow_run_after_successful_github_release_publication'
    || policy?.producer?.automatic_prequeue_admission !== 'emit_not_run_until_exact_physical_capability_is_proven'
    || policy?.producer?.physical_executor_workflow !== '.github/workflows/opl-first-run-vm.yml'
    || policy?.producer?.dispatcher_execution !== 'github_hosted_read_only_public_artifact_consumer'
    || policy?.producer?.stable_dag_dependency !== false
    || policy?.producer?.may_queue_without_proven_capability !== false
  ) {
    throw new Error('Optional certification must consume published bytes without blocking Stable publication or Latest');
  }
  assertDeepEqualJson(
    policy.statuses,
    ['passed', 'failed', 'not_run', 'unavailable'],
    'Optional certification states',
  );
  assertDeepEqualJson(
    policy.not_run_reason_codes,
    ['not_requested', 'not_authorized', 'operator_deferred'],
    'Optional certification not-run reasons',
  );
  assertDeepEqualJson(
    policy.unavailable_reason_codes,
    [
      'authority_or_capability_not_provable',
      'fleet_lease_admission_failed',
      'vm_admission_failed',
      'capability_admission_failed',
    ],
    'Optional certification unavailable reasons',
  );
}

function validateProviderConfigurationBoundary(boundary) {
  const independence = boundary?.artifact_and_package_independence;
  const releaseVmSmoke = boundary?.release_vm_smoke;
  const connectedDiagnostic = releaseVmSmoke?.connected_provider_diagnostic;
  if (
    boundary?.schema !== 'opl_release_provider_configuration_boundary.v1'
    || boundary?.default_user_authentication !== 'opl_gateway_account_password'
    || boundary?.api_key_role !== 'explicit_compatibility_only'
    || boundary?.configuration_timing !== 'user_requested_at_model_use_or_settings'
    || independence?.dmg_build_requires_provider_credential !== false
    || independence?.manual_full_m1_requires_provider_credential !== false
    || independence?.local_manual_delivery_requires_provider_credential !== false
    || independence?.manual_full_preview_publication_requires_provider_credential !== false
    || independence?.managed_package_currentness_requires_provider_credential !== false
    || releaseVmSmoke?.default_provider_configuration_status !== 'not_requested'
    || releaseVmSmoke?.provider_configuration_is_blocking_release_gate !== false
    || releaseVmSmoke?.synthetic_api_key_generation_allowed !== false
    || releaseVmSmoke?.implicit_api_key_file_injection_allowed !== false
    || releaseVmSmoke?.visible_provider_wizard_without_explicit_credential !== 'observe_and_defer'
    || releaseVmSmoke?.summary_pointer !== '/provider_configuration'
    || releaseVmSmoke?.api_key_compatibility_lane_requires_explicit_request !== true
    || releaseVmSmoke?.api_key_compatibility_lane_requires_explicit_credential_file !== false
    || releaseVmSmoke?.explicit_api_key_file_role !== 'optional_manual_override_only'
    || connectedDiagnostic?.trigger !== 'codex_ai_self_check_requested'
    || connectedDiagnostic?.credential_source !== 'developer_host_codex_selected_provider'
    || connectedDiagnostic?.config_path_resolution !== 'OPL_FIRST_RUN_HOST_CODEX_CONFIG_or_CODEX_HOME_config_toml_or_home_dot_codex_config_toml'
    || connectedDiagnostic?.base_url_must_match_opl_gateway !== true
    || connectedDiagnostic?.manual_user_input_required !== false
    || connectedDiagnostic?.missing_or_incompatible_host_credential !== 'diagnostic_skipped_without_artifact_gate_failure'
    || connectedDiagnostic?.secret_transport !== 'temporary_mode_0600_file_to_guest_then_stdin_no_secret_argv_plan_receipt_or_artifact'
  ) {
    throw new Error('Release Provider configuration boundary must remain optional and credential-independent');
  }
  assertDeepEqualJson(
    connectedDiagnostic.required_selected_provider_fields,
    ['base_url', 'experimental_bearer_token'],
    'Connected VM Provider credential fields',
  );
}

function validateReleaseCalendarGuard(releaseName) {
  const guard = releaseName?.calendar_guard;
  assertDeepEqualJson(
    guard?.required_entrypoints,
    [
      'release_version_validation',
      'framework_release_freeze',
      'framework_release_checkpoint_export_import',
      'standard_operation',
      'resume_standard_operation',
      'append_full_operation',
      'latest_activation',
    ],
    'Release calendar guard entrypoints',
  );
  if (
    guard?.time_zone !== 'Asia/Shanghai'
    || guard?.future_dated_versions_allowed !== false
    || guard?.failure_mode !== 'fail_closed_before_build_remote_lookup_or_mutation'
  ) {
    throw new Error('Release calendar guard must reject future-dated versions before build, lookup, or mutation');
  }
}

function validateStandardUpdater(updater) {
  if (
    updater?.scope !== 'desktop_app_assets_only' ||
    updater?.module_package_update_allowed !== false ||
    updater?.opl_flow_install_allowed !== false ||
    updater?.post_update_reconcile_ref !== 'managed_update_plane.carrier_reconciliation'
  ) {
    throw new Error('Standard updater must remain App-binary-only and join the carrier-neutral Framework reconciliation path');
  }
}

function validateReleaseExecutionPolicy(releaseChannel, shellPaths) {
  const control = releaseChannel?.release_bundle_control_plane;
  const framework = control?.framework_authority;
  const live = control?.live_authority;
  const checkpoint = control?.checkpoint_transport;
  const operations = control?.operation_control;
  const markerPolicy = checkpoint?.active_unknown_markers;
  const standardOperation = operations?.stable_operations?.standard;
  const resumeStandardOperation = operations?.stable_operations?.resume_standard;
  const appendFullOperation = operations?.stable_operations?.append_full;
  const resilience = control?.resilience_policy;
  const publication = control?.publication;
  const publisher = control?.publisher_idempotency;
  const legacy = control?.legacy_compatibility;
  const validationCanary = control?.validation_canary;
  const acceleration = releaseChannel?.release_acceleration;
  const preflight = releaseChannel?.release_preflight;
  const localFirst = preflight?.local_first;
  const stableStageResult = preflight?.stable_stage_result;
  const failureFingerprint = preflight?.dispatch_guard?.failure_fingerprint_circuit_breaker;
  const settingsReadiness = acceleration?.settings_page_readiness_policy;
  const settingsRuntimeRefresh = acceleration?.settings_runtime_refresh_evidence_policy;
  const assistantRouteSmoke = acceleration?.assistant_route_smoke_policy;

  assertRetiredReleaseControlPlaneAbsent(releaseChannel);

  if (
    control?.schema !== 'opl_app_release_bundle_control_plane.v1' ||
    control?.contract_status !== 'active' ||
    framework?.owner !== 'gaofeng21cn/one-person-lab' ||
    framework?.cli !== 'opl release' ||
    framework?.bundle_schema !== 'opl_release_bundle.v1' ||
    framework?.checkpoint_schema !== 'opl_release_bundle_checkpoint.v1' ||
    framework?.operation_control_schema !== 'opl_release_bundle_operation_control.v1' ||
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
    live?.stable_manual_entry !== '.github/workflows/release-stable.yml' ||
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
  if (
    operations?.schema !== 'opl_release_bundle_operation_control.v1' ||
    operations?.stable_mutation_mutex !== 'opl-release-bundle-global' ||
    standardOperation?.source !== 'new_framework_bundle' ||
    standardOperation?.control !== 'new_immutable_standard_control' ||
    standardOperation?.deadline_minutes !== 90 ||
    resumeStandardOperation?.source !== 'portable_framework_checkpoint' ||
    resumeStandardOperation?.control !== 'reuse_exact_standard_control' ||
    resumeStandardOperation?.deadline_minutes !== undefined ||
    resumeStandardOperation?.new_operation_id_allowed !== false ||
    resumeStandardOperation?.start_refresh_allowed !== false ||
    resumeStandardOperation?.deadline_refresh_allowed !== false ||
    resumeStandardOperation?.rebuild_allowed !== false ||
    appendFullOperation?.source !== 'portable_framework_checkpoint_at_or_after_standard_qualified' ||
    appendFullOperation?.control !== 'new_independent_append_full_control' ||
    appendFullOperation?.deadline_minutes !== 50 ||
    appendFullOperation?.standard_qualified_required !== true ||
    appendFullOperation?.standard_rebuild_allowed !== false ||
    appendFullOperation?.standard_operation_id_reuse_allowed !== false ||
    appendFullOperation?.standard_deadline_inheritance_allowed !== false ||
    operations?.job_admission !== 'every_mutating_job_checks_exact_operation_and_absolute_deadline_before_first_remote_api' ||
    operations?.deadline_clock !== 'github_actions_created_at_resolved_once_by_controller' ||
    operations?.deadline_source_field !== 'github.created_at' ||
    operations?.deadline_frozen_at_controller_admission !== true ||
    operations?.deadline_may_be_rebased_on_queue_start_resume_or_rerun !== false ||
    JSON.stringify(operations?.operation_admission_identity_fields) !== JSON.stringify([
      'operation', 'operation_id', 'operation_started_at', 'operation_deadline_at',
    ]) ||
    operations?.operation_id_required_for_admit_build_verify_publish_and_reconcile !== true ||
    operations?.same_operation_jobs_and_mutations_share_exact_deadline !== true ||
    operations?.each_external_mutation_rechecks_remaining_deadline !== true ||
    operations?.append_full_uses_new_operation_admission !== true ||
    operations?.append_full_may_inherit_standard_deadline !== false ||
    operations?.deadline_refresh_allowed !== false ||
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
    throw new Error('Release operations must keep Standard immutable, resume exact, append independent, and late reconcile evidence-only');
  }
  assertDeepEqualJson(
    resumeStandardOperation.reused_control_fields,
    immutableOperationControlFields,
    'resume_standard immutable control fields',
  );
  if (
    stableStageResult?.schema !== 'opl_app_stable_stage_result.v1' ||
    stableStageResult?.json_schema !== 'contracts/app-stable-stage-result.schema.json' ||
    stableStageResult?.script !== 'scripts/stable-stage-result.ts' ||
    stableStageResult?.authority !== 'attempt_observation_only_no_framework_state_projection' ||
    stableStageResult?.business_stage_count !== 12 ||
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
  if (
    publication?.stable?.only_manual_dispatch_workflow !== '.github/workflows/release-stable.yml' ||
    publication?.stable?.trigger !== 'workflow_dispatch' ||
    publication?.stable?.lower_level_workflows !== 'workflow_call_only'
  ) {
    throw new Error('Stable must have one manual dispatch entry and workflow_call-only lower-level topology');
  }
  if (
    publication?.nightly?.status !== 'implemented_pending_first_publication_readback' ||
    publication?.nightly?.publication_available !== true ||
    publication?.nightly?.mutation_available !== true ||
    publication?.nightly?.historical_readback_allowed !== true ||
    publication?.nightly?.workflow !== '.github/workflows/release-nightly.yml' ||
    publication?.nightly?.trigger !== 'schedule_only' ||
    publication?.nightly?.scheduled_latest_allowed !== false ||
    publication?.nightly?.explicit_user_override_may_move_latest !== true ||
    publication?.nightly?.include_full !== false ||
    publication?.nightly?.stable_bundle_authority_used !== false ||
    publication?.nightly?.stable_mutation_mutex_used !== false ||
    publication?.nightly?.heavy_vm_blocking !== false ||
    publication?.nightly?.post_publication_followers_block_github_prerelease !== false ||
    publication?.nightly?.homebrew_follower !== '.github/workflows/release-nightly-homebrew-follower.yml' ||
    publication?.nightly?.sampled_vm_follower !== '.github/workflows/release-nightly-sampled-vm.yml'
  ) {
    throw new Error('Nightly schedule must stay Standard-only, non-Latest by default, and isolated from Stable authority');
  }
  assertDeepEqualJson(
    publication?.stable?.latest_admission,
    standardLatestAdmissionContract,
    'Standard Latest admission',
  );
  assertDeepEqualJson(
    publication?.stable?.pre_publication_admission,
    standardPrePublicationAdmissionContract,
    'Standard pre-publication admission',
  );
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
      'github_hosted_linux_windows_macos_matrix',
      'protected_signing_and_notarization_credentials',
      'public_mutation',
      'owner_authoritative_remote_readback',
    ],
    'Local-first remote-only checks',
  );
  if (
    publisher?.missing_asset !== 'upload' ||
    publisher?.same_name_same_digest !== 'already_complete' ||
    publisher?.same_name_different_digest !== 'fail_closed_require_new_bundle_or_version' ||
    publisher?.unknown_api_result !== 'reconcile_only' ||
    publisher?.redispatch_on_unknown_allowed !== false ||
    publisher?.rerun_on_unknown_allowed !== false ||
    publisher?.cancel_on_unknown_allowed !== false
  ) {
    throw new Error('Release publisher must be digest-idempotent and reconcile-only after an unknown result');
  }
  assertDeepEqualJson(
    publisher?.reconcile_admission,
    publisherReconcileAdmissionContract,
    'Release publisher reconcile admission',
  );
  if (
    resilience?.same_day_revision_allocation_ref !== 'github_release_name.stable_revision' ||
    resilience?.machine_version_monotonicity_ref !== 'github_release_name.machine_version' ||
    resilience?.stable_version_comparison_scope !== 'all_public_stable_releases_not_latest_only' ||
    resilience?.display_and_machine_versions_both_must_increase !== true ||
    resilience?.source_and_remote_version_checks_required_before_build !== true ||
    JSON.stringify(resilience?.updater_baseline_sources) !== JSON.stringify(['current_latest', 'highest_public_stable']) ||
    resilience?.updater_qualification_order !== 'exact_previous_latest_to_candidate_zip_upgrade_before_first_public_release_mutation' ||
    resilience?.updater_zip_digest_source !== 'sha256_of_actual_candidate_zip_bytes' ||
    JSON.stringify(resilience?.updater_zip_identity_fields) !== JSON.stringify(['size_bytes', 'sha256']) ||
    resilience?.updater_metadata_declared_digest_is_not_sufficient !== true ||
    resilience?.homebrew_single_writer !== true ||
    resilience?.homebrew_unknown_outcome !== 'framework_durable_marker_status_then_exact_reconcile' ||
    resilience?.homebrew_reconcile_owner !== 'OPL Framework opl release' ||
    resilience?.homebrew_app_local_reconcile_loop_allowed !== false ||
    resilience?.homebrew_reconcile_max_attempts !== undefined ||
    resilience?.homebrew_retry_push_on_unknown_allowed !== false ||
    resilience?.homebrew_success_requires_exact_remote_commit_and_cask_digest_readback !== true ||
    resilience?.partial_publication_unknown_result !== 'framework_reconcile_before_any_new_mutation'
  ) {
    throw new Error('Release resilience must prove monotonic versions, pre-public updater bytes, and Framework-owned exact Homebrew reconcile');
  }
  if (
    !control?.cutover?.permanently_rejected_bundle_digests?.includes(
      'sha256:91d5ea069757fca6bb9aa2280615dc952caeff55b6b4bc13e08e40df32378f49',
    )
  ) {
    throw new Error('Release control plane must permanently reject the known failed Bundle digest');
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
    JSON.stringify(legacy?.accepted_read_only_commands) !== JSON.stringify(['verify', 'status']) ||
    legacy?.retired_scripts_may_parse_historical_receipts !== true ||
    legacy?.retired_scripts_may_be_package_or_workflow_mutation_entrypoints !== false ||
    legacy?.legacy_contract_role !== 'historical_receipt_verification_only' ||
    acceleration?.scope !== 'product_build_qualification_vm_and_cache_policy_only' ||
    acceleration?.product_policy_only !== true ||
    acceleration?.live_state_authority !== false ||
    acceleration?.live_mutation_authority !== false ||
    acceleration?.new_session_or_dispatch_allowed !== false ||
    acceleration?.state_authority_ref !== 'release_bundle_control_plane.framework_authority' ||
    acceleration?.github_actions?.live_release_mutation_authority !== false
  ) {
    throw new Error('Legacy release broker, session, and operator surfaces must remain historical receipt readers only');
  }
  assertIncludesAll(
    legacy.parser_forbidden_capabilities,
    [
      'create_release_state',
      'authorize_mutation',
      'dispatch',
      'rerun',
      'cancel',
      'build',
      'qualify',
      'publish',
      'promote',
      'reconcile_live_state',
    ],
    'Legacy parser forbidden capabilities',
  );
  assertDeepEqualJson(
    legacy.retired_package_scripts,
    retiredReleasePackageScripts,
    'Retired release package scripts',
  );
  assertDeepEqualJson(
    validationCanary,
    validationCanaryContract,
    'Release validation-only Canary contract',
  );
  assertIncludesAll(
    settingsReadiness?.required_signals,
    ['expected_route_hash', 'stable_page_data_testid', 'nonempty_page_text', 'app_loader_not_visible'],
    'Settings VM semantic readiness signals',
  );
  assertIncludesAll(
    settingsReadiness?.forbidden_release_gate_signals,
    ['localized_button_copy', 'localized_heading_copy', 'retired_runtime_status_label'],
    'Settings VM forbidden copy gates',
  );
  assertDeepEqualJson(
    settingsRuntimeRefresh,
    {
      schema: 'opl_settings_runtime_refresh_evidence_policy.v1',
      production_default_targets_required: true,
      synthetic_target_injection_allowed: false,
      required_routes: [
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
      ],
      required_evidence_fields: [
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
      ],
      allowed_readiness_states: ['ready', 'empty'],
      distinct_entry_per_route_required: true,
      default_timeout_ms: 30000,
      phase_timeout_binding: 'min_timeout_ms_and_codex_readiness_phase_timeout_ms_or_timeout_ms',
      validator: 'scripts/validate-settings-smoke-runtime-evidence.ts',
      workflow: '.github/workflows/opl-first-run-vm.yml',
      verification_artifact: 'artifacts/opl-first-run-vm/artifacts/settings-runtime-refresh-verification.json',
      source_implementation_failure_mode: 'fail_closed_before_expensive_build_or_vm',
      runtime_evidence_failure_mode: 'fail_closed_before_qualification_receipt_or_publication',
      rule: 'Production Settings smoke must exercise both the legacy Settings Runtime alias and the standalone Runtime route with independent requested/resolved route identity, structural readiness, and pre/post refresh idle evidence. Synthetic target injection may support unit tests but cannot satisfy the production release gate.',
    },
    'Settings Runtime refresh production evidence policy',
  );
  if (shellPaths) {
    assertShellTextIncludesAll(
      shellPaths,
      'scripts/opl-first-run-vm-smoke.mjs',
      [
        'function buildRuntimeRefreshProbePlan(requestedHash, timeoutMs = DEFAULT_RUNTIME_REFRESH_TIMEOUT_MS)',
        "requestedHash === '#/settings/runtime'",
        "mode: 'settings-maintenance-updates'",
        "aliasResolvedHash: '#/settings/environment'",
        "refreshHash: '#/settings/environment?section=updates'",
        'function settingsRuntimeAliasResolutionExpression(requestedHash, aliasResolvedHash)',
        'function settingsMaintenanceUpdatesReadinessExpression(refreshHash)',
        'function settingsUpdatesRefreshButtonIdleExpression()',
        'function settingsUpdatesRefreshClickExpression()',
        "const selector = '[data-testid=\"opl-managed-update-refresh\"]'",
        "requestedHash === '#/runtime'",
        "mode: 'runtime-v2'",
        "resolvedHashPrefixes: ['#/runtime']",
        'async function exerciseRuntimeRefresh(client, targetHash, timeoutMs = DEFAULT_RUNTIME_REFRESH_TIMEOUT_MS)',
        'settingsRuntimeAliasResolutionExpression(probePlan.requestedHash, probePlan.aliasResolvedHash)',
        'settingsMaintenanceUpdatesReadinessExpression(probePlan.refreshHash)',
        'settingsUpdatesRefreshClickExpression()',
        'requested_hash: targetHash',
        'alias_resolved_hash: aliasResolution.aliasResolvedHash ?? aliasResolution.hash',
        'resolved_hash: resolvedHash',
        'const runtimeRefreshTimeoutMs = Math.min(',
        'options.codexReadinessPhaseTimeoutMs ?? options.timeoutMs',
        "const settingsRuntimeRefresh = await (hooks.exerciseRuntimeRefresh ?? exerciseRuntimeRefresh)(",
        "'#/settings/runtime',",
        "id: 'runtime-settings-alias'",
        "const standaloneRuntimeRefresh = await (hooks.exerciseRuntimeRefresh ?? exerciseRuntimeRefresh)(",
        "'#/runtime',",
        "id: 'runtime-status'",
      ],
      'production Settings Runtime dual-route refresh evidence',
    );
  }
  assertDeepEqualJson(
    assistantRouteSmoke?.standard?.required,
    [
      'compiled_release_qualification_targets_visible',
      'unavailable_projected_targets_selectable',
      'launch_allowed_false_at_send',
      'readiness_and_repair_hint_visible',
    ],
    'Standard assistant launch-gate requirements',
  );
  assertIncludesAll(
    assistantRouteSmoke?.full?.required,
    [
      'compiled_release_qualification_targets_visible',
      'projected_targets_launchable',
      'selected_project_directory_applied_to_session_and_domain_workspace_identity',
      'real_guid_composer_send_without_shell_package_activation_per_target',
      'conversation_get_readback_per_target',
      'Framework_stage_runtime_activation_uses_Stage_workspace_locator_per_target',
      'Framework_stage_runtime_activation_evidence_per_target',
      'release_evidence_route_receipt_per_target',
    ],
    'Full assistant production launch-path requirements',
  );
  assertIncludesAll(
    assistantRouteSmoke?.full?.forbidden,
    [
      'direct_conversation_post',
      'Shell_agent_package_activation_before_or_during_send',
      'synthetic_Framework_stage_runtime_activation_evidence',
      'synthetic_release_evidence_route_receipt',
    ],
    'Full assistant synthetic launch-path prohibitions',
  );
  if (
    assistantRouteSmoke?.standard?.verification_mode !== 'launch_gate' ||
    assistantRouteSmoke?.full?.verification_mode !== 'route_receipt' ||
    assistantRouteSmoke?.target_fixture_ref !==
      'contracts/app-first-run-test-matrix.json#release_qualification_agent_target_fixture' ||
    assistantRouteSmoke?.target_fixture_boundary !==
      'release_qualification_probe_input_only_without_runtime_catalog_visibility_action_or_install_authority' ||
    assistantRouteSmoke?.runtime_target_resolution !==
      'resolve every fixture target from fresh app_state.agent_packages.directory.entries and status_index.home_shortcut_preferences before probing' ||
    !assistantRouteSmoke?.standard?.forbidden?.includes('claim_full_route_receipt_from_standard_launch_gate') ||
    !assistantRouteSmoke?.full?.required?.includes('release_evidence_route_receipt_per_target')
  ) {
    throw new Error(
      'Release assistant smoke must resolve a non-authoritative target fixture and separate Standard launch gates from Full route receipts',
    );
  }

  const vmGates = Array.isArray(acceleration?.vm_gates) ? acceleration.vm_gates : [];
  assertDeepEqualJson(
    vmGates.map((gate) => gate?.id),
    [
      'standard_dmg_clean_vm_smoke',
      'homebrew_standard_cask_clean_vm_smoke',
      'full_dmg_clean_vm_smoke',
    ],
    'Physical VM optional certification gates',
  );
  for (const gate of vmGates) {
    if (
      gate?.diagnostic_scope !== 'post_publication_optional_certification' ||
      gate?.gate_policy !== 'optional_non_blocking_same_published_artifact' ||
      !Array.isArray(gate?.certification_readiness) ||
      gate.certification_readiness.length === 0 ||
      'release_blocking_readiness' in gate
    ) {
      throw new Error('Physical VM qualification must remain post-publication optional certification');
    }
  }
  const fullVmGate = vmGates.find((gate) => gate?.id === 'full_dmg_clean_vm_smoke');
  const legacyVmGate = acceleration?.vm_gate;
  for (const field of [
    'source',
    'artifact',
    'smoke_profile',
    'display',
    'settings_smoke',
    'diagnostic_scope',
    'runtime_profile',
    'codex_config_wizard',
    'gate_policy',
    'certification_readiness',
    'post_core_ready_background_policy',
  ]) {
    assertDeepEqualJson(
      legacyVmGate?.[field],
      fullVmGate?.[field],
      `Legacy Full VM optional certification mirror ${field}`,
    );
  }
  if ('release_blocking_readiness' in (legacyVmGate ?? {})) {
    throw new Error('Legacy Full VM mirror must not expose release-blocking readiness');
  }

  const stableValidation = releaseChannel?.release_validation_profiles?.stable;
  assertDeepEqualJson(
    stableValidation?.post_publication_optional_certification_surfaces,
    [
      'standard_dmg_clean_vm_smoke',
      'homebrew_standard_cask_clean_vm_smoke',
      'one_shot_app_installer_fresh_install_smoke',
      'full_dmg_clean_vm_smoke',
    ],
    'Stable post-publication optional certification surfaces',
  );
  if (
    stableValidation?.addon_gate_blocking_standard_terminal !== false ||
    stableValidation?.addon_lanes?.includes('full_dmg_clean_vm_smoke') ||
    !stableValidation?.diagnostic_lanes?.includes('full_dmg_clean_vm_smoke')
  ) {
    throw new Error('Full clean-VM certification must remain outside the Stable publication terminal');
  }
}

function assertRetiredReleaseControlPlaneAbsent(releaseChannel) {
  const forbiddenKeys = new Set([
    'stable_release_state_machine',
    'cohort_prepare',
    'release_operator',
    'release_monitor',
    'gate_reuse',
    'publish_resume',
    'post_owner_receipt_fast_path',
    'broker_authority_gate',
    'promotion_saga',
    'attempt_ledger',
    'signed_mutation_authority',
  ]);
  const forbiddenWorkflowValues = new Set([
    '.github/workflows/desktop-release.yml',
    '.github/workflows/desktop-release-promote.yml',
    '.github/workflows/desktop-release-full-addon.yml',
  ]);

  const visit = (value, path = 'release_channel') => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      const entryPath = `${path}.${key}`;
      if (forbiddenKeys.has(key)) {
        throw new Error(`Retired release control-plane field remains live at ${entryPath}`);
      }
      if (typeof entry === 'string' && forbiddenWorkflowValues.has(entry)) {
        throw new Error(`Retired release writer workflow remains live at ${entryPath}`);
      }
      if (entry === 'release_operator_plan') {
        throw new Error(`Retired release operator admission remains live at ${entryPath}`);
      }
      visit(entry, entryPath);
    }
  };

  visit(releaseChannel);
}

function validateWebuiGhcrImage(webuiImage) {
  const contract = webuiImage?.runtime_image_contract;
  if (
    webuiImage?.owner !== 'one-person-lab-app' ||
    webuiImage?.distribution_role !== 'preheated_webui_runtime_image_not_desktop_app_gui_shell' ||
    contract?.image_role !== 'browser_entrypoint_for_opl_on_linux_container' ||
    contract?.profiles?.webui_full?.default_for_beginner_and_latest_channel !== true ||
    contract?.profiles?.webui_full?.metadata_only_allowed !== false ||
    contract?.profiles?.webui_slim?.version_tag !== '<app_or_opl_version>-slim' ||
    contract?.profiles?.webui_slim?.stable_channel_allowed !== false ||
    contract?.profiles?.webui_slim?.moving_tags_allowed !== false ||
    webuiImage?.publication_route !== 'independent_webui_lane_outside_desktop_release_bundle' ||
    webuiImage?.desktop_release_bundle_may_publish_or_move_tags !== false ||
    webuiImage?.current_writer_declared_by_desktop_release_contract !== false
  ) {
    throw new Error('Release channel must declare Docker/WebUI full and slim image profile boundaries');
  }
  assertIncludesAll(
    contract.required_runtime_contents,
    [
      'webui_static_assets',
      'aionui_web_standalone_launcher',
      'bundled_aioncore',
      'opl_bootstrap_installer',
      'image_manifest',
      'opl_seed_metadata',
      'preheated_seed_payload',
    ],
    'Docker/WebUI runtime image required contents',
  );
  assertIncludesAll(
    contract.profiles.webui_full?.required_seed_components,
    ['opl_framework', 'codex_cli', 'companion_skills', 'domain_modules'],
    'Docker/WebUI full image seed components',
  );
  assertDeepEqualJson(
    contract.profiles.webui_full?.seed_strategy,
    ['payload_manifest', 'payload_preheated'],
    'Docker/WebUI full image seed strategy',
  );
  assertDeepEqualJson(
    contract.profiles.webui_full?.required_tags,
    ['<app_or_opl_version>', 'stable', 'latest'],
    'Docker/WebUI full image tags',
  );
  assertDeepEqualJson(
    contract.profiles.webui_slim?.seed_strategy,
    ['metadata_only'],
    'Docker/WebUI slim image seed strategy',
  );
  if (
    contract.image_manifest?.canonical_path !== '/opt/opl/image-manifest.json' ||
    contract.seed_metadata?.canonical_path !== '/opt/opl/seed/metadata.json' ||
    contract.publish_gate?.script !== 'scripts/validate-webui-runtime-image.ts' ||
    contract.publish_gate?.moving_channel_expected_profile !== 'webui-full' ||
    contract.publish_gate?.default_latest_alias_requires_stable_quality_gate !== true ||
    contract.publish_gate
      ?.explicit_preview_latest_requires_exact_qualified_carrier_and_protected_override !== true ||
    contract.publish_gate?.forbidden_success_state !== 'metadata_only_seed_promoted_to_latest_or_stable' ||
    webuiImage.stable_promotion?.default_pointer_ref !==
      'ghcr.io/gaofeng21cn/one-person-lab-webui:latest' ||
    webuiImage.stable_promotion?.automatic_update_ref !==
      'ghcr.io/gaofeng21cn/one-person-lab-webui:latest' ||
    webuiImage.stable_promotion?.target_ref !==
      'ghcr.io/gaofeng21cn/one-person-lab-webui:latest' ||
    webuiImage.stable_promotion?.compatibility_alias_ref !==
      'ghcr.io/gaofeng21cn/one-person-lab-webui:stable' ||
    webuiImage.stable_promotion?.manual_version_promotion_policy !==
      'manual_development_validation_may_advance_latest_after_exact_immutable_carrier_qualification_while_preserving_stable' ||
    webuiImage.stable_promotion?.schema !== 'opl_app_webui_stable_promotion_contract.v5' ||
    webuiImage.stable_promotion?.admission_schema !==
      'opl_app_webui_stable_promotion_admission.v5' ||
    webuiImage.stable_promotion?.decision_schema !==
      'opl_app_webui_stable_promotion_decision.v2' ||
    webuiImage.stable_promotion?.receipt_schema !==
      'opl_app_webui_stable_promotion_receipt.v5' ||
    webuiImage.stable_promotion?.compare_and_swap
      ?.divergent_aliases_may_only_reconcile_to_same_qualified_target !== true ||
    webuiImage.stable_promotion?.compare_and_swap
      ?.development_validation_requires_stable_prestate_unchanged !== true ||
    webuiImage.stable_promotion?.compare_and_swap
      ?.independent_preview_requires_stable_prestate_unchanged !== true ||
    webuiImage.stable_promotion?.task_modes?.development_validation
      ?.stable_alias_mutation_allowed !== false ||
    webuiImage.stable_promotion?.task_modes?.development_validation
      ?.stable_prestate_must_remain_unchanged !== true
    || webuiImage.stable_promotion?.task_modes?.independent_preview
      ?.desktop_stable_required !== false
    || webuiImage.stable_promotion?.task_modes?.independent_preview
      ?.desktop_latest_required !== false
    || webuiImage.stable_promotion?.task_modes?.independent_preview
      ?.immutable_publication_required !== true
    || webuiImage.stable_promotion?.task_modes?.independent_preview
      ?.publication_does_not_move_stable_or_latest !== true
    || webuiImage.stable_promotion?.task_modes?.independent_preview
      ?.promotion_requires_explicit_user_dispatch !== true
    || webuiImage.stable_promotion?.task_modes?.independent_preview
      ?.source_authority_schema !== 'opl_app_webui_source_authority.v1'
    || webuiImage.stable_promotion?.task_modes?.independent_preview
      ?.source_authority_digest_must_equal_carrier_release_bundle_and_cohort_ref !== true
    || webuiImage.stable_promotion?.task_modes?.independent_preview
      ?.stable_alias_mutation_allowed !== false
    || webuiImage.stable_promotion?.task_modes?.independent_preview
      ?.stable_prestate_must_remain_unchanged !== true
  ) {
    throw new Error('Docker/WebUI GHCR publishing must validate canonical manifest, seed metadata, full profile, and explicit Preview Latest boundaries');
  }
  assertDeepEqualJson(
    webuiImage.stable_promotion.task_modes.production_release.promotion_tags,
    ['stable', 'latest'],
    'Docker/WebUI production promotion tags',
  );
  assertDeepEqualJson(
    webuiImage.stable_promotion.task_modes.development_validation.promotion_tags,
    ['latest'],
    'Docker/WebUI development promotion tags',
  );
  assertDeepEqualJson(
    webuiImage.stable_promotion.task_modes.development_validation.classification,
    {
      quality_status: 'preview',
      build_trigger: 'manual',
      preview_kind: 'dev',
      non_stable_notice: true,
    },
    'Docker/WebUI development preview classification',
  );
  assertDeepEqualJson(
    webuiImage.stable_promotion.task_modes.independent_preview.classification,
    {
      quality_status: 'preview',
      build_trigger: 'manual',
      preview_kind: 'dev',
      non_stable_notice: true,
    },
    'Docker/WebUI independent preview classification',
  );
  assertDeepEqualJson(
    webuiImage.stable_promotion.task_modes.independent_preview.publication_entry_inputs,
    ['version', 'app_ref', 'shell_ref', 'framework_ref'],
    'Docker/WebUI independent Preview publication inputs',
  );
  assertDeepEqualJson(
    webuiImage.stable_promotion.task_modes.independent_preview.promotion_entry_inputs,
    ['carrier_follower_run_id', 'carrier_executor_ref', 'carrier_artifact_name'],
    'Docker/WebUI independent Preview Latest inputs',
  );
  assertDeepEqualJson(
    webuiImage.stable_promotion.compare_and_swap.promotion_tags_by_authority_mode,
    {
      production_follower: ['stable', 'latest'],
      development_validation: ['latest'],
      independent_preview: ['latest'],
    },
    'Docker/WebUI promotion tags by authority mode',
  );
  assertIncludesAll(
    contract.publish_gate?.must_read_back,
    [
      'docker_image_inspect',
      'image_manifest',
      'seed_metadata',
      'runtime_cli_shims',
      'preheated_payload_files',
      'declared_volumes',
      'runtime_env',
      'projects_mount_readback',
      'install_manifest_receipt',
      'startup_maintenance_log',
      'auto_login_smoke',
    ],
    'Docker/WebUI publish gate readback',
  );
}

function validateLocalDataLifecycle(lifecycle, shellPaths) {
  if (
    lifecycle?.owner !== 'one-person-lab-app' ||
    lifecycle?.policy_surface !== 'Settings / Storage and Settings / Updates & Maintenance' ||
    lifecycle?.user_data_silent_delete_allowed !== false
  ) {
    throw new Error('Release channel must declare App-owned local data lifecycle without silent user-data deletion');
  }
  assertDeepEqualJson(
    lifecycle.external_practice_basis,
    {
      docker_system_prune: 'unused_only_prompted_and_volume_opt_in',
      pnpm_store_prune: 'unreferenced_packages_only',
      hugging_face_cache: 'scan_dry_run_delete_unreferenced_revisions',
      electron_app_paths: 'separate_userData_cache_sessionData_logs_paths',
    },
    'Local data lifecycle external practice basis',
  );
  if (
    lifecycle.updater_cache?.owner !== 'active_shell' ||
    lifecycle.updater_cache?.implementation !==
      'shells/aionui/packages/desktop/src/process/services/autoUpdateCacheCleanup.ts' ||
    lifecycle.updater_cache?.cache_dir !== '~/Library/Caches/one-person-lab-aion-shell-updater' ||
    lifecycle.updater_cache?.auto_cleanup !== 'startup_and_before_install'
  ) {
    throw new Error('Local data lifecycle must bind updater cache cleanup to the active shell implementation');
  }
  assertDeepEqualJson(
    lifecycle.updater_cache?.keep,
    ['pending/update-info.json', 'currently_selected_update_package'],
    'Local data lifecycle updater cache keep set',
  );
  assertDeepEqualJson(
    lifecycle.updater_cache?.delete,
    ['stale update.zip', 'stale pending/*.zip', 'stale platform installer packages'],
    'Local data lifecycle updater cache delete set',
  );
  assertDeepEqualJson(
    lifecycle.updater_cache?.retired_cache_dirs,
    ['~/Library/Caches/aionui-updater'],
    'Local data lifecycle retired updater cache roots',
  );
  assertIncludesAll(
    lifecycle.storage_inventory?.sections,
    ['updater_cache', 'user_data_artifacts', 'runtime_substrate', 'logs'],
    'Local data lifecycle storage inventory sections',
  );
  assertIncludesAll(
    lifecycle.storage_inventory?.required_fields,
    ['path', 'exists', 'bytes', 'cleanup_mode', 'silent_delete_allowed'],
    'Local data lifecycle storage inventory required fields',
  );
  const ownerStorage = lifecycle.owner_storage_projections;
  assertDeepEqualJson(
    ownerStorage?.sections,
    ['agent_package_store', 'webui_data_volume'],
    'Local data lifecycle owner storage sections',
  );
  assertDeepEqualJson(
    ownerStorage?.common_required_fields,
    ['status', 'observed_at', 'stale', 'bytes', 'reclaimable_bytes', 'owner_route', 'projected_action'],
    'Local data lifecycle owner storage fields',
  );
  validateWebuiDataVolumeHostActionAbi(
    ownerStorage?.webui_data_volume?.host_action_abi,
  );
  if (
    lifecycle.storage_inventory?.surface !== 'Settings / Storage' ||
    lifecycle.storage_inventory?.execution_mode !== 'scan_dry_run_first' ||
    lifecycle.storage_inventory?.implementation !==
      'shells/aionui/packages/desktop/src/process/services/localDataLifecycle/index.ts' ||
    ownerStorage?.projection_source !== 'opl app state --profile fast --json' ||
    ownerStorage?.missing_projection_policy !== 'fail_open_keep_shell_owned_categories_available' ||
    ownerStorage?.unknown_bytes_policy !== 'unavailable_never_zero' ||
    ownerStorage?.agent_package_store?.owner !== 'one-person-lab' ||
    ownerStorage?.agent_package_store?.ordinary_action !== 'navigate_to_/settings/agents' ||
    ownerStorage?.agent_package_store?.storage_direct_uninstall_allowed !== false ||
    ownerStorage?.webui_data_volume?.inventory_owner !== 'one-person-lab' ||
    ownerStorage?.webui_data_volume?.execution_owner !== 'carrier_host' ||
    ownerStorage?.webui_data_volume?.webui_container_execution !== 'host_action_required_without_docker_socket' ||
    ownerStorage?.webui_data_volume?.generic_docker_prune_allowed !== false ||
    ownerStorage?.webui_data_volume?.shell_direct_path_delete_allowed !== false ||
    lifecycle.updater_cache?.receipt_required !== true ||
    lifecycle.user_data_artifacts?.default_policy !== 'retain_conversations_workspaces_and_artifacts_until_user_cleanup_or_archive' ||
    lifecycle.user_data_artifacts?.silent_delete_allowed !== false ||
    lifecycle.user_data_artifacts?.cleanup_execution !== 'archive_then_explicit_user_confirmed_delete' ||
    lifecycle.user_data_artifacts?.archive_required_before_cleanup !== true ||
    lifecycle.user_data_artifacts?.restore_proof_required !== true ||
    lifecycle.user_data_artifacts?.cleanup_surface !== 'Settings / Storage' ||
    lifecycle.runtime_substrate?.default_policy !== 'retain_current_and_declared_rollback_runtime' ||
    lifecycle.runtime_substrate?.owner_ref !== 'contracts/app-release-channel.json#managed_update_plane.software_lifecycle.objects.opl_base' ||
    lifecycle.runtime_substrate?.cleanup_execution !== 'pointer_based_dry_run_first_explicit_execute_required' ||
    lifecycle.runtime_substrate?.protected_refs?.current_pointer !==
      '~/Library/Application Support/OPL/runtime/current.json' ||
    lifecycle.runtime_substrate?.protected_refs?.current_root !==
      '~/Library/Application Support/OPL/runtime/current' ||
    lifecycle.runtime_substrate?.prune_candidate_policy !== 'unreferenced_marker_backed_runtime_generations_only' ||
    lifecycle.runtime_substrate?.dry_run_receipt_required !== true ||
    lifecycle.logs?.default_policy !== 'bounded_rotation_or_user_cleanup' ||
    lifecycle.logs?.silent_delete_allowed !== false ||
    lifecycle.logs?.cleanup_execution !== 'bounded_rotation_dry_run_first' ||
    lifecycle.logs?.dry_run_receipt_required !== true ||
    lifecycle.logs?.retention?.retain_days !== 30 ||
    lifecycle.logs?.retention?.retain_files_minimum !== 7 ||
    lifecycle.logs?.retention?.max_file_bytes !== 10485760
  ) {
    throw new Error('Local data lifecycle must retain user artifacts and bind runtime/log cleanup to explicit policy surfaces');
  }
  assertDeepEqualJson(
    lifecycle.storage_carrier_behavior,
    appOwnedStorageCarrierBehavior,
    'Local data lifecycle Storage carrier behavior',
  );
  assertDeepEqualJson(
    lifecycle.user_data_artifacts?.archive_receipt_required_fields,
    ['conversation_id', 'source_paths', 'archive_path', 'archive_sha256', 'manifest_path', 'restore_probe_path', 'created_at'],
    'Local data lifecycle conversation archive receipt fields',
  );
  assertDeepEqualJson(
    lifecycle.user_data_artifacts?.delete_receipt_required_fields,
    ['conversation_id', 'deleted_paths', 'archive_receipt_path', 'confirmed_at', 'created_at'],
    'Local data lifecycle conversation delete receipt fields',
  );
  const deleteBoundary = lifecycle.user_data_artifacts?.delete_execution_boundary;
  assertDeepEqualJson(
    deleteBoundary?.required_inputs,
    ['archiveReceiptPath', 'archiveRoot', 'receiptRoot', 'allowedSourcePaths'],
    'Local data lifecycle conversation delete verifier inputs',
  );
  if (
    deleteBoundary?.canonical_verifier !== 'verifyConversationArchiveReceipt' ||
    deleteBoundary?.receipt_path_must_be_inside_receipt_root !== true ||
    deleteBoundary?.archive_path_must_be_inside_archive_root !== true ||
    deleteBoundary?.manifest_source_paths_must_equal_current_conversation_roots !== true ||
    deleteBoundary?.symlink_or_root_escape_allowed !== false
  ) {
    throw new Error('Local data lifecycle conversation delete must reuse the canonical archive verifier');
  }
  assertDeepEqualJson(
    lifecycle.runtime_substrate?.inventory_roots,
    [
      {
        id: 'shell_toolchain_runtime',
        owner: 'active_shell',
        derivation: 'getSystemDir().workDir/runtime',
        cleanup_authority: 'inventory_only_no_pointer_prune',
      },
      {
        id: 'managed_opl_runtime',
        owner: 'one-person-lab',
        derivation: "OPL_RUNTIME_TOOLCHAIN_ROOT_or_darwin_app.getPath('home')/Library/Application Support/OPL/runtime",
        configured_override: 'OPL_RUNTIME_TOOLCHAIN_ROOT',
        default_platform: 'darwin',
        non_darwin_without_override: 'blocked',
        cleanup_authority: 'pointer_prune_owner',
      },
    ],
    'Local data lifecycle runtime inventory roots',
  );
  assertDeepEqualJson(
    lifecycle.runtime_substrate?.protected_root_names,
    ['current', 'previous', 'toolcache', 'generations', 'staged'],
    'Local data lifecycle protected runtime roots',
  );
  const runtimeAuthority = lifecycle.runtime_substrate?.authority_gate;
  if (
    lifecycle.runtime_substrate?.prune_authority_root !== 'managed_opl_runtime' ||
    lifecycle.runtime_substrate?.protected_refs?.previous_root !==
      '~/Library/Application Support/OPL/runtime/previous' ||
    lifecycle.runtime_substrate?.candidate_marker !== '.opl-full-runtime-installed.json' ||
    lifecycle.runtime_substrate?.prune_candidate_policy !==
      'unreferenced_marker_backed_runtime_generations_only' ||
    lifecycle.runtime_substrate?.staged_candidate_policy !==
      'marker_backed_runtime_generation_only_non_runtime_staged_lanes_protected' ||
    lifecycle.runtime_substrate?.symlink_or_root_escape_allowed !== false ||
    runtimeAuthority?.required_pointer !== 'current.json' ||
    runtimeAuthority?.pointer_target_must_be_inside_runtime_root !== true ||
    runtimeAuthority?.current_target_marker !== '.opl-full-runtime-installed.json' ||
    runtimeAuthority?.missing_or_invalid_authority !== 'blocked_no_candidates_no_execute' ||
    runtimeAuthority?.execute_must_revalidate_pointer_and_protected_paths !== true
  ) {
    throw new Error('Local data lifecycle runtime prune must fail closed on managed OPL authority and marker checks');
  }
  assertDeepEqualJson(
    lifecycle.runtime_substrate?.execute_receipt_required_fields,
    ['runtime_root', 'dry_run_plan_id', 'protected_paths', 'deleted_paths', 'deleted_bytes', 'created_at'],
    'Local data lifecycle runtime prune execute receipt fields',
  );
  assertDeepEqualJson(
    lifecycle.logs?.execute_receipt_required_fields,
    ['logs_root', 'dry_run_plan_id', 'deleted_paths', 'deleted_bytes', 'created_at'],
    'Local data lifecycle log rotation execute receipt fields',
  );
  if (shellPaths) validateLocalDataLifecycleImplementation(shellPaths);
}

function validateWebuiDataVolumeHostActionAbi(abi) {
  const endpoints = {
    capability: '/api/opl-storage/webui-data-volume/capability',
    plan: '/api/opl-storage/webui-data-volume/plan',
    execute: '/api/opl-storage/webui-data-volume/execute',
    restore: '/api/opl-storage/webui-data-volume/restore',
  };
  const actionIds = {
    plan_action_id: 'settings_plan_webui_data_volume_cleanup',
    execute_action_id: 'settings_execute_webui_data_volume_cleanup',
    restore_action_id: 'settings_restore_webui_data_volume_cleanup',
  };
  const exactFields = (actual, expected) =>
    Array.isArray(actual) &&
    actual.length === expected.length &&
    expected.every((field) => actual.includes(field));
  const includesFields = (actual, expected) =>
    Array.isArray(actual) && expected.every((field) => actual.includes(field));

  if (
    !abi ||
    abi.capability_id !== appOwnedWebuiDataVolumeHostActionCapabilityId ||
    abi.endpoint_availability !== 'host_owner_injected' ||
    !includesFields(abi.endpoint_status_values, ['available', 'host_action_required']) ||
    !includesFields(abi.projection_required_fields, [
      'capability_id',
      'endpoint_status',
      'endpoint_availability',
      'plan_action_id',
      'execute_action_id',
      'restore_action_id',
    ]) ||
    Object.entries(endpoints).some(
      ([id, path]) => abi.endpoints?.[id]?.method !== 'POST' || abi.endpoints?.[id]?.path !== path,
    ) ||
    Object.entries(actionIds).some(([field, value]) => abi.action_ids?.[field] !== value) ||
    abi.unavailable_projection_policy !==
      'host_action_required_with_null_action_ids_is_status_only_and_keeps_storage_usable' ||
    abi.available_cta_gate !== 'endpoint_status_available_and_all_three_exact_action_ids_present' ||
    !includesFields(abi.plan_result_required_fields, [
      'plan_id',
      'plan_hash',
      'exact_confirmation',
      'estimated_reclaimable_bytes',
      'candidate_count',
      'restore_supported',
      'observed_at',
      'expires_at',
    ]) ||
    !exactFields(abi.execute_request_required_fields, ['plan_id', 'plan_hash', 'exact_confirmation']) ||
    !includesFields(abi.execute_receipt_required_fields, [
      'receipt_id',
      'action_id',
      'status',
      'plan_id',
      'plan_hash',
      'receipt_ref',
      'restore_action_ref',
      'archive_ref',
      'archive_manifest_ref',
      'archive_sha256',
      'archived_bytes',
      'deleted_bytes',
      'readback',
    ]) ||
    !exactFields(abi.restore_request_required_fields, ['receipt_ref']) ||
    !includesFields(abi.restore_result_required_fields, [
      'status',
      'receipt_ref',
      'restore_receipt_ref',
      'readback',
    ]) ||
    abi.terminal_readback_ref !==
      'app_state.settings_control_center.app_settings_read_model.storage_lifecycle.webui_data_volume' ||
    !includesFields(abi.terminal_readback_required_fields, [
      'status',
      'terminal',
      'observed_at',
      'bytes',
      'reclaimable_bytes',
      'receipt_ref',
      'restore_status',
    ]) ||
    !exactFields(abi.renderer_payload_allowlist, [
      'plan_id',
      'plan_hash',
      'exact_confirmation',
      'receipt_ref',
    ]) ||
    abi.renderer_raw_path_allowed !== false ||
    abi.security?.authenticated_principal !== 'current_backend_authenticated_user_required' ||
    !exactFields(abi.security?.allowed_methods, ['POST']) ||
    abi.security?.content_type !== 'application/json' ||
    abi.security?.max_body_bytes !== 65536 ||
    abi.security?.origin_policy !== 'same_origin_or_csrf_equivalent_required' ||
    abi.security?.execute_restore_serialization !== 'one_in_flight_mutation_per_data_volume' ||
    abi.security?.plan_policy !== 'ttl_bound_single_use' ||
    abi.security?.duplicate_submission_policy !== 'idempotent_terminal_readback_or_typed_conflict_only' ||
    abi.security?.error_disclosure_policy !== 'typed_reason_without_raw_path'
  ) {
    throw new Error(
      'Local data lifecycle WebUI carrier-host action ABI must preserve its endpoint, action, payload, readback, restore, and security boundaries',
    );
  }
}

function validateLocalDataLifecycleImplementation(shellPaths) {
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/process/bridge/localDataLifecycleBridge.ts',
    [
      'function shellToolchainRuntimeRoot(): string',
      "path.join(getSystemDir().workDir, 'runtime')",
      'function managedOplRuntimeRoot(): string',
      'const configuredRoot = process.env.OPL_RUNTIME_TOOLCHAIN_ROOT?.trim();',
      "if (process.platform !== 'darwin')",
      'OPL_RUNTIME_TOOLCHAIN_ROOT is required outside the macOS desktop release.',
      "path.join(app.getPath('home'), 'Library', 'Application Support', 'OPL', 'runtime')",
      'runtimeRoots: [shellToolchainRuntimeRoot(), managedOplRuntimeRoot()]',
      'runtimeRoot: managedOplRuntimeRoot()',
      'archiveRoot: archiveRoot()',
      'receiptRoot: receiptRoot()',
      'allowedSourcePaths: [conversationRoot()]',
    ],
    'local data lifecycle bridge split-root and delete boundary',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/process/services/localDataLifecycle/index.ts',
    [
      'const archiveReceipt = verifyConversationArchiveReceipt(input);',
      "requirePathInsidePlainRoot(normalizedReceiptRoot, archiveReceiptPath, 'Archive receipt')",
      "requirePathInsidePlainRoot(normalizedArchiveRoot, archivePath, 'Archive path')",
      'Conversation source path is invalid or symlinked',
      "const RUNTIME_INSTALL_MARKER = '.opl-full-runtime-installed.json'",
      'resolveRuntimePruneAuthority',
      "authority_state?: 'ready' | 'blocked'",
      'authority_state: authority.state',
      'isRuntimeGenerationRoot(resolvedCandidate)',
      'Runtime prune authority changed after the dry-run plan',
    ],
    'local data lifecycle canonical verifier and runtime authority gate',
  );
}

function validateManagedUpdatePlane(managedUpdatePlane) {
  const lifecycle = managedUpdatePlane?.software_lifecycle;
  const kernel = managedUpdatePlane?.managed_kernel;
  if (
    managedUpdatePlane?.owner !== 'one-person-lab-app' ||
    managedUpdatePlane?.producer_owner !== 'one-person-lab' ||
    managedUpdatePlane?.framework_role !== 'own_opl_base_and_opl_packages_lifecycle_execution_truth_and_receipts' ||
    managedUpdatePlane?.action_route !== 'opl app action execute --action <action_id> [--payload <json>] [--dry-run] --json' ||
    kernel?.id !== 'opl_managed_updater_kernel' ||
    kernel?.owner !== 'one-person-lab' ||
    kernel?.app_role !== 'status_action_projection_consumer' ||
    kernel?.app_must_not_implement_kernel !== true ||
    kernel?.app_must_not_bypass_action_route !== true
  ) {
    throw new Error('Release channel managed update must keep the App as a Framework lifecycle consumer');
  }
  assertDeepEqualJson(
    managedUpdatePlane.status_source_priority,
    ['opl app state --profile fast --json#managed_update', 'opl update status --json#managed_update'],
    'Managed update status source priority',
  );
  validateSoftwareLifecycle(lifecycle);
  validateCarrierReconciliation(managedUpdatePlane?.carrier_reconciliation);
  assertIncludesAll(
    managedUpdatePlane.forbidden_app_authority,
    [
      'opl_base_mutation',
      'opl_packages_mutation',
      'framework_update_kernel_implementation',
      'runtime_truth',
      'domain_truth',
      'owner_receipt_authority',
      'homebrew_formula_or_global_tool_mutation',
    ],
    'Managed update forbidden App authority',
  );
  assertDeepEqualJson(
    managedUpdatePlane.release_boundary_required_cases,
    [
      'only_opl_base_opl_app_and_opl_packages_are_public_components',
      'opl_base_bootstrap_is_framework_owned_and_app_requested',
      'opl_packages_use_framework_package_lifecycle_only',
      'carrier_adapters_preserve_software_object_and_lifecycle_owner',
      'internal_transaction_states_are_not_peer_products_or_updaters',
      'ordinary_component_picker_and_public_component_flag_are_forbidden',
      'standard_updater_targets_opl_app_only',
      'all_app_carriers_request_the_same_framework_base_and_packages_reconciliation',
      'app_projects_framework_terminal_readback_and_apply_receipts_without_a_second_update_catalog',
      'clean_managed_targets_may_update_silently_and_dirty_or_user_managed_targets_require_attention',
      'packages_activate_after_receipt_while_base_runtime_and_app_switch_on_restart',
    ],
    'Managed update release-boundary cases',
  );
}

function validateSoftwareLifecycle(lifecycle) {
  assertDeepEqualJson(lifecycle?.public_component_keys, managedUpdateSoftwareObjectIds, 'Managed update public component keys');
  if (
    lifecycle?.schema !== 'opl_software_lifecycle.v1' ||
    lifecycle?.public_component_path !== 'managed_update.components' ||
    lifecycle?.additional_component_keys_allowed !== false ||
    lifecycle?.ordinary_component_picker_allowed !== false ||
    lifecycle?.legacy_component_mapping_allowed !== false ||
    lifecycle?.public_action_component_flag_allowed !== false
  ) {
    throw new Error('Managed update must expose exactly three software components without legacy mappings or a component flag');
  }
  const objects = lifecycle?.objects ?? {};
  if (
    objects.opl_base?.lifecycle_owner !== 'one-person-lab' ||
    objects.opl_base?.provider_id !== 'runtime_substrate' ||
    objects.opl_base?.app_mutation_allowed !== false ||
    objects.opl_base?.mutation_route !== 'framework_lifecycle_only' ||
    objects.opl_app?.lifecycle_owner !== 'one-person-lab-app' ||
    objects.opl_app?.provider_id !== 'installation_carrier' ||
    objects.opl_app?.app_mutation_allowed !== true ||
    objects.opl_packages?.lifecycle_owner !== 'one-person-lab' ||
    objects.opl_packages?.provider_id !== 'capability_packages' ||
    objects.opl_packages?.app_mutation_allowed !== false ||
    objects.opl_packages?.mutation_route !== 'framework_package_lifecycle_only' ||
    objects.opl_packages?.homebrew_distribution_allowed !== false
  ) {
    throw new Error('Managed update software-object lifecycle ownership is invalid');
  }
  assertDeepEqualJson(objects.opl_base.optional_internal_fields, ['dependency_status', 'integration_status'], 'OPL Base internal fields');
  assertDeepEqualJson(objects.opl_app.required_fields, ['host_update_route', 'host_executor_required'], 'OPL App route fields');
  assertDeepEqualJson(objects.opl_packages.optional_internal_fields, ['projection_status', 'profile_migration_status'], 'OPL Packages internal fields');
  if (
    objects.opl_base.dependency_catalog_source !== 'opl update plan --json#managed_update.components.opl_base' ||
    objects.opl_base.app_dependency_catalog_allowed !== false ||
    objects.opl_packages.package_catalog_source !== 'opl update plan --json#managed_update.components.opl_packages' ||
    objects.opl_packages.app_package_update_catalog_allowed !== false
  ) {
    throw new Error('Managed update catalogs must come from the Framework plan rather than App-maintained lists');
  }
  assertDeepEqualJson(Object.keys(lifecycle.carrier_adapters ?? {}), managedUpdateCarrierAdapters, 'Managed update carrier adapters');
  if (
    lifecycle.public_actions?.bootstrap_missing_opl_base !== 'opl-install.sh --headless --skip-packages' ||
    lifecycle.public_actions?.update_opl_app !== 'standard_updater_or_carrier_host_update_route' ||
    lifecycle.public_actions?.apply_eligible_updates !== 'opl update apply --json' ||
    !String(lifecycle.public_actions?.install_opl_package).startsWith('opl packages install ') ||
    !String(lifecycle.public_actions?.update_opl_package).startsWith('opl packages update ') ||
    !String(lifecycle.public_actions?.repair_opl_package).startsWith('opl packages repair ') ||
    !String(lifecycle.public_actions?.uninstall_opl_package).startsWith('opl packages uninstall ')
  ) {
    throw new Error('Managed update public actions must use real Base/App carrier routes and the canonical OPL Packages CLI');
  }
  for (const action of Object.values(lifecycle.public_actions ?? {})) {
    if (String(action).includes('--component')) {
      throw new Error('Managed update public actions must not pass --component');
    }
  }
}

function validateCarrierReconciliation(reconcile) {
  if (
    reconcile?.contract !== 'opl_app_carrier_reconciliation.v1' ||
    reconcile?.trigger !== 'app_startup_after_core_ready_when_running_app_version_checkpoint_is_missing_or_changed' ||
    reconcile?.carrier_neutral !== true ||
    reconcile?.installation_source_scope !== 'all_supported_app_carriers' ||
    reconcile?.installation_source_registry_ref !==
      'contracts/app-install-exposure-policy.json#installer_surfaces+distribution_channels' ||
    reconcile?.installation_source_role !== 'provide_candidate_app_or_seed_bytes_only' ||
    reconcile?.framework_execution?.owner !== 'one-person-lab' ||
    reconcile?.framework_execution?.catalog_source !== 'framework_managed_update_plan' ||
    reconcile?.framework_execution?.app_catalog_allowed !== false ||
    reconcile?.framework_execution?.single_writer_required !== true ||
    reconcile?.framework_execution?.terminal_readback_required !== true ||
    reconcile?.framework_execution?.lifecycle_receipt_required_when_apply_executed !== true ||
    reconcile?.app_role !==
      'request_framework_reconciliation_and_project_terminal_readback_and_apply_receipts_only' ||
    reconcile?.app_direct_base_or_package_mutation_allowed !== false ||
    reconcile?.idempotency !== 'once_per_running_app_version_or_image_digest_and_carrier_identity'
  ) {
    throw new Error('App carrier reconciliation must be carrier-neutral and Framework-executed without an App catalog');
  }
  assertDeepEqualJson(
    reconcile.framework_execution.auto_apply_gate,
    {
      eligibility_field: 'auto_apply.eligible',
      background_safety_field: 'app_background_safe',
      command_field: 'command_ref',
      required_boolean_value: true,
    },
    'App carrier reconciliation Framework auto-apply gate',
  );
  assertDeepEqualJson(
    reconcile.framework_execution.projection_prefetch,
    {
      command: 'opl update status --json',
      publish_when: 'valid_typed_status_readback_available',
      purpose: 'make_framework_typed_state_available_before_network_check_and_plan_complete',
      failure_policy: 'continue_reconciliation_without_clearing_last_valid_projection',
    },
    'App carrier reconciliation projection prefetch',
  );
  assertDeepEqualJson(
    reconcile.framework_execution.command_sequence,
    [
      'opl update check --json',
      'opl update plan --json',
      'opl update apply --json',
      'opl update status --json',
    ],
    'App carrier reconciliation command sequence',
  );
  assertDeepEqualJson(
    reconcile.framework_execution.software_object_scope,
    ['opl_base', 'opl_packages'],
    'App carrier reconciliation Framework scope',
  );
  assertDeepEqualJson(
    reconcile.user_experience.summary_states,
    ['current', 'updating_in_background', 'restart_to_finish', 'refresh_codex_recommended', 'attention_required'],
    'App carrier reconciliation user states',
  );
  assertDeepEqualJson(
    reconcile.attention_only_source_classes,
    ['developer_checkout', 'dirty', 'user_managed', 'global_homebrew_or_npm_or_path'],
    'App carrier reconciliation attention-only source classes',
  );
  if (
    reconcile.version_checkpoint?.key !== 'running_app_version_or_image_digest_and_carrier_identity' ||
    reconcile.version_checkpoint?.write_gate !== 'framework_reconciliation_terminal_readback_projected' ||
    reconcile.version_checkpoint?.missing_checkpoint_means_first_launch !== true ||
    reconcile.version_checkpoint?.downloaded_or_copied_version_is_not_running_version !== true
  ) {
    throw new Error('App carrier reconciliation checkpoint must commit only after terminal Framework readback');
  }
}
