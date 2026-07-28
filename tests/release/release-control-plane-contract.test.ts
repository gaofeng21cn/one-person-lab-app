import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  evaluateReleaseBrokerAuthorityReadiness,
  validateReleaseAccelerationPolicy,
} from '../../scripts/validate-release-boundary/release-contract-policy.ts';

const appRoot = path.resolve(import.meta.dirname, '../..');

function readJson(relativePath: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), 'utf8')) as Record<string, any>;
}

function validateSilently(releaseContract: Record<string, any>, brokerAuthority: unknown): number {
  const originalError = console.error;
  console.error = () => {};
  try {
    return validateReleaseAccelerationPolicy(releaseContract, brokerAuthority);
  } finally {
    console.error = originalError;
  }
}

test('Framework checkpoint plus the App executor is the only live release mutation authority', () => {
  const release = readJson('contracts/app-release-channel.json');
  const broker = readJson('contracts/app-release-broker-authority.json');
  const control = release.release_bundle_control_plane;

  assert.equal(validateReleaseAccelerationPolicy(release, broker), 0);
  assert.equal(control.live_authority.single_live_mutation_authority, true);
  assert.equal(control.live_authority.state_owner, 'OPL Framework opl release');
  assert.equal(control.live_authority.state_surface, 'opl_release_bundle_checkpoint.v1');
  assert.equal(
    control.live_authority.state_authority_ref,
    'release_bundle_control_plane.framework_authority',
  );
  assert.equal(control.live_authority.app_executor_consumes_framework_cli_results_without_state_projection, true);
  assert.equal(control.live_authority.mutation_executor_owner, 'one-person-lab-app');
  assert.deepEqual(control.live_authority.stable_operations, [
    'standard',
    'resume_standard',
    'append_full',
  ]);
  assert.equal(control.live_authority.app_session_broker_or_operator_may_authorize_mutation, false);
  assert.equal(control.framework_authority.checkpoint_and_receipt_state_authority_exclusive, true);
  assert.equal(control.framework_authority.app_may_define_checkpoint_or_receipt_schema, false);
  assert.equal(control.framework_authority.app_may_derive_or_project_release_stage_state, false);
});

test('App contract matches the current Framework release checkpoint ABI', () => {
  const release = readJson('contracts/app-release-channel.json');
  const framework = release.release_bundle_control_plane.framework_authority;
  const checkpoint = release.release_bundle_control_plane.checkpoint_transport;

  assert.equal(framework.portable_checkpoint_authority_first_landed_sha, 'f785cda96');
  assert.equal(framework.consumed_abi_sha, '9860dc64b56ed9cccb9984cd14e138d9ccacced7');
  assert.equal(framework.checkpoint_schema, 'opl_release_bundle_checkpoint.v1');
  assert.equal(framework.operation_control_schema, 'opl_release_bundle_operation_control.v1');
  assert.equal(framework.unknown_outcome_schema, 'opl_release_bundle_unknown_outcome.v1');
  assert.deepEqual(framework.receipt_schemas, [
    'opl_release_bundle_executor_receipt.v1',
    'opl_release_bundle_operation_receipt.v1',
    'opl_release_bundle_qualification_receipt.v1',
  ]);

  assert.deepEqual(framework.commands, [
    'freeze',
    'operation admit',
    'build',
    'checkpoint export',
    'checkpoint import',
    'verify',
    'publish',
    'reconcile',
    'status',
  ]);
  assert.deepEqual(framework.command_forms, [
    'opl release freeze --request <request.json> [--source-root <directory>] [--store <directory>]',
    'opl release operation admit --bundle <sha256:digest> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
    'opl release build --bundle <sha256:digest> --executor-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
    'opl release checkpoint export --bundle <sha256:digest> --output <directory> [--store <directory>]',
    'opl release checkpoint import --checkpoint <checkpoint.json> [--store <directory>]',
    'opl release verify --bundle <sha256:digest> --qualification-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--track standard|full] [--store <directory>]',
    'opl release publish --bundle <sha256:digest> --executor-receipt <remote-inspect.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
    'opl release reconcile --bundle <sha256:digest> --executor-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
    'opl release status --bundle <sha256:digest> [--store <directory>]',
  ]);
  assert.deepEqual(checkpoint.stages, [
    'frozen',
    'standard_built',
    'standard_qualified',
    'full_built',
    'full_qualified',
  ]);
  assert.equal(checkpoint.import_never_rebuilds, true);
  assert.equal(checkpoint.completed_stage_behavior, 'skip_with_rebuild_performed_false');
  assert.deepEqual(checkpoint.source_build_provenance_fields, [
    'source_build_executor',
    'source_build_run_id',
  ]);
  assert.deepEqual(checkpoint.transport_provenance_fields, [
    'checkpoint_transport_executor',
    'transport_run_id',
  ]);
  assert.equal(checkpoint.operation_controls_preserved_exactly, true);
  assert.equal(checkpoint.unknown_build_or_publish_outcome_export_allowed, true);
  assert.equal(checkpoint.unknown_outcome_required_action, 'status_then_exact_reconcile');
  assert.equal(checkpoint.active_unknown_markers.schema, 'opl_release_bundle_unknown_outcome.v1');
  assert.equal(checkpoint.active_unknown_markers.maximum_count, 1);
  assert.deepEqual(checkpoint.active_unknown_markers.allowed_commands, ['status', 'exact_reconcile']);
  assert.equal(checkpoint.active_unknown_markers.resolved_marker_reimport_behavior, 'must_not_resurrect');
  assert.equal(checkpoint.publish_or_promotion_state_imported, false);
});

test('release operations are one-shot, deadline-bound, and fail closed before public mutation', () => {
  const control = readJson('contracts/app-release-channel.json').release_bundle_control_plane;
  const operations = control.operation_control;
  const resilience = control.resilience_policy;

  assert.equal(operations.stable_mutation_mutex, 'opl-release-bundle-global');
  assert.equal(operations.stable_operations.standard.deadline_minutes, 90);
  assert.equal(operations.stable_operations.resume_standard.deadline_minutes, undefined);
  assert.equal(operations.stable_operations.resume_standard.control, 'reuse_exact_standard_control');
  assert.equal(operations.stable_operations.resume_standard.new_operation_id_allowed, false);
  assert.equal(operations.stable_operations.resume_standard.start_refresh_allowed, false);
  assert.equal(operations.stable_operations.resume_standard.deadline_refresh_allowed, false);
  assert.equal(operations.stable_operations.append_full.deadline_minutes, 50);
  assert.equal(operations.stable_operations.append_full.standard_qualified_required, true);
  assert.equal(operations.stable_operations.append_full.standard_operation_id_reuse_allowed, false);
  assert.equal(operations.partial_workflow_rerun_allowed, false);
  assert.equal(operations.github_run_attempt_required, 1);
  assert.equal(operations.deadline_clock, 'github_actions_created_at_resolved_once_by_controller');
  assert.equal(operations.deadline_source_field, 'github.created_at');
  assert.equal(operations.deadline_frozen_at_controller_admission, true);
  assert.equal(operations.deadline_may_be_rebased_on_queue_start_resume_or_rerun, false);
  assert.equal(operations.deadline_refresh_allowed, false);
  assert.deepEqual(operations.operation_admission_identity_fields, [
    'operation',
    'operation_id',
    'operation_started_at',
    'operation_deadline_at',
  ]);
  assert.equal(operations.same_operation_jobs_and_mutations_share_exact_deadline, true);
  assert.equal(operations.each_external_mutation_rechecks_remaining_deadline, true);
  assert.equal(operations.append_full_uses_new_operation_admission, true);
  assert.equal(operations.append_full_may_inherit_standard_deadline, false);
  assert.equal(operations.elapsed_deadline.exact_reconcile_allowed, true);
  assert.equal(operations.elapsed_deadline.exact_reconcile_result, 'late_observation');
  assert.equal(operations.elapsed_deadline.stage_advanced, false);
  assert.equal(operations.typed_failure_evidence_persisted_before_job_exit_or_cleanup, true);
  assert.equal(resilience.stable_version_comparison_scope, 'all_public_stable_releases_not_latest_only');
  assert.equal(resilience.display_and_machine_versions_both_must_increase, true);
  assert.deepEqual(resilience.updater_baseline_sources, ['current_latest', 'highest_public_stable']);
  assert.equal(
    resilience.updater_qualification_order,
    'exact_previous_latest_to_candidate_zip_upgrade_before_first_public_release_mutation',
  );
  assert.deepEqual(resilience.updater_zip_identity_fields, ['size_bytes', 'sha256']);
  assert.equal(resilience.updater_metadata_declared_digest_is_not_sufficient, true);
  assert.equal(resilience.homebrew_single_writer, true);
  assert.equal(resilience.homebrew_unknown_outcome, 'framework_durable_marker_status_then_exact_reconcile');
  assert.equal(resilience.homebrew_reconcile_owner, 'OPL Framework opl release');
  assert.equal(resilience.homebrew_app_local_reconcile_loop_allowed, false);
  assert.equal(resilience.homebrew_reconcile_max_attempts, undefined);
  assert.equal(resilience.homebrew_retry_push_on_unknown_allowed, false);
});

test('Stable attempt results are deterministic observations and unchanged fingerprints stop before dispatch', () => {
  const release = readJson('contracts/app-release-channel.json');
  const stageResult = release.release_preflight.stable_stage_result;
  const fingerprint = release.release_preflight.dispatch_guard.failure_fingerprint_circuit_breaker;
  const workflow = fs.readFileSync(path.join(appRoot, '.github/workflows/release-stable.yml'), 'utf8');

  assert.equal(stageResult.schema, 'opl_app_stable_stage_result.v1');
  assert.equal(stageResult.json_schema, 'contracts/app-stable-stage-result.schema.json');
  assert.equal(stageResult.script, 'scripts/stable-stage-result.ts');
  assert.equal(stageResult.authority, 'attempt_observation_only_no_framework_state_projection');
  assert.equal(stageResult.business_stage_count, 12);
  assert.deepEqual(stageResult.axes, ['qualification_product', 'evidence', 'transport', 'cleanup']);
  assert.equal(stageResult.primary_failure_rule, 'lowest_stage_index_failed_qualification_product_axis');
  assert.equal(
    stageResult.secondary_failure_rule,
    'evidence_transport_cleanup_and_later_product_failures_do_not_overwrite_primary',
  );
  assert.deepEqual(stageResult.cleanup_normalization, {
    condition: 'command_nonzero_and_final_inspection_absent',
    status: 'cleanup_idempotent_success',
    records_command_anomaly: true,
    eligible_for_primary_failure: false,
  });
  assert.equal(stageResult.release_state_authority, false);
  assert.equal(stageResult.framework_status_authority, false);
  assert.equal(stageResult.mutation_authority, false);
  assert.equal(stageResult.framework_checkpoint_projection_allowed, false);
  assert.equal(stageResult.placeholder_or_inferred_success_allowed, false);

  assert.deepEqual(fingerprint.identity_fields, [
    'cohort',
    'stage_id',
    'reason_code',
    'artifact_digest_or_input_digest',
    'environment_receipt_digest',
  ]);
  assert.equal(fingerprint.attempt_included_in_identity, false);
  assert.equal(fingerprint.prior_and_current_required_together, true);
  assert.equal(fingerprint.unchanged_status, 'blocked_unchanged');
  assert.equal(fingerprint.unchanged_failure_code, 'unchanged_failure_fingerprint');
  assert.equal(fingerprint.unchanged_dispatch_allowed, false);
  assert.equal(fingerprint.unchanged_dispatch_count, 0);
  assert.equal(fingerprint.unchanged_mutation_invocation_count, 0);
  assert.equal(fingerprint.evaluated_before_git_wire_or_owner_api, true);

  assert.match(workflow, /OPL_APP_STABLE_STAGE_RESULT_SCHEMA: opl_app_stable_stage_result\.v1/);
  assert.match(
    workflow,
    /OPL_APP_STABLE_STAGE_RESULT_AUTHORITY: attempt_observation_only_no_framework_state_projection/,
  );
  assert.doesNotMatch(workflow, /stable_stage_result.*framework_checkpoint/i);
});

test('Standard Latest admission consumes hosted publication and Homebrew readback without optional certification', () => {
  const stable = readJson('contracts/app-release-channel.json')
    .release_bundle_control_plane.publication.stable;
  const admission = stable.latest_admission;

  assert.equal(admission.validator, 'scripts/validate-standard-latest-admission.ts');
  assert.equal(
    stable.pre_publication_admission.validator,
    'scripts/validate-standard-publication-input.ts',
  );
  assert.equal(
    stable.pre_publication_admission.receipt_schema,
    'opl_standard_pre_publication_admission_receipt.v1',
  );
  assert.equal(stable.pre_publication_admission.required_status, 'passed');
  assert.equal(stable.pre_publication_admission.runs_before, 'publish-standard-nonlatest');
  assert.equal(stable.pre_publication_admission.public_mutation_allowed, false);
  assert.equal(
    stable.pre_publication_admission.failure_mode,
    'fail_closed_before_public_release_creation',
  );
  assert.equal(admission.receipt_schema, 'opl_standard_latest_admission_receipt.v1');
  assert.equal(admission.required_status, 'passed');
  assert.equal(admission.latest_activation_admitted_required, true);
  assert.equal(admission.framework_latest_eligible_alone_is_sufficient, false);
  assert.equal(admission.hosted_publication_floor_schema, 'opl_standard_hosted_publication_floor.v1');
  assert.equal(admission.source_contract_build_preflight_required, 'passed');
  assert.equal(admission.remote_digest_readback_required, 'passed');
  assert.equal(admission.current_latest_readback_required, true);
  assert.equal(admission.updater_predecessor_receipts_allowed, false);
  assert.equal(admission.optional_certification_receipts_allowed, false);
  assert.deepEqual(admission.publication_ancestor_counts, { self_hosted: 0, vm: 0, tart: 0 });
  assert.deepEqual(admission.required_exact_identity_fields, [
    'bundle_digest',
    'candidate.app_sha',
    'candidate.shell_sha',
    'candidate.framework_sha',
    'candidate.zip.sha256',
    'candidate.zip.size_bytes',
    'candidate.dmg.sha256',
    'candidate.dmg.size_bytes',
  ]);
  assert.equal(admission.homebrew_evidence.publication_schema, 'opl_bundle_homebrew_publication_receipt.v1');
  assert.equal(
    admission.homebrew_evidence.readback_schema,
    'opl_bundle_homebrew_publication_readback_receipt.v1',
  );
  assert.deepEqual(admission.homebrew_evidence.required_digest_fields, [
    'homebrew.publication_receipt_sha256',
    'homebrew.readback_receipt_sha256',
  ]);
  assert.equal(admission.homebrew_evidence.readback_must_bind_publication_actual_file_digest, true);
  assert.equal(admission.homebrew_evidence.clean_vm_receipt_allowed, false);
  assert.equal(admission.failure_mode, 'fail_closed_before_latest_patch');
});

test('reconcile requires a persisted unknown and exact Framework track status without mutation retry', () => {
  const policy = readJson('contracts/app-release-channel.json')
    .release_bundle_control_plane.publisher_idempotency;
  const admission = policy.reconcile_admission;

  assert.equal(policy.unknown_api_result, 'reconcile_only');
  assert.equal(admission.persistent_unknown_framework_receipt_required, true);
  assert.equal(admission.unknown_marker_schema, 'opl_release_bundle_unknown_outcome.v1');
  assert.equal(admission.fresh_framework_status_required, true);
  assert.equal(admission.framework_status_surface, 'release_bundle_status');
  assert.equal(admission.framework_status_marker_field, 'active_unknown_markers');
  assert.equal(admission.framework_status_reconcile_field, 'tracks.<track>.reconcile_required');
  assert.equal(admission.framework_status_reconcile_required_value, true);
  assert.deepEqual(admission.exact_marker_match_fields, [
    'bundle_digest',
    'operation_id',
    'operation_kind',
    'stage_operation',
    'publication_scope',
    'track',
    'remote_target',
    'prior_mutation_attempt_id',
  ]);
  assert.equal(admission.app_may_infer_reconcile_required, false);
  assert.deepEqual(admission.required_sequence, [
    'persist_framework_unknown_outcome_marker',
    'read_fresh_framework_status',
    'require_exact_active_unknown_marker',
    'bounded_read_only_remote_inspect',
    'framework_exact_reconcile',
  ]);
  assert.equal(admission.active_marker_ordinary_mutation_allowed, false);
  assert.equal(admission.app_local_reconcile_loop_allowed, false);
  assert.equal(admission.deadline_elapsed_allows_bounded_read_only_inspect, true);
  assert.equal(admission.deadline_elapsed_allows_framework_reconcile, true);
  assert.equal(admission.deadline_elapsed_reconcile_result, 'late_observation');
  assert.equal(admission.deadline_elapsed_reconcile_may_advance_stage, false);
  assert.equal(admission.create_upload_latest_or_homebrew_retry_allowed, false);
});

test('legacy broker, session, and operator contracts are historical receipt readers only', () => {
  const release = readJson('contracts/app-release-channel.json');
  const broker = readJson('contracts/app-release-broker-authority.json');
  const readiness = evaluateReleaseBrokerAuthorityReadiness(broker);

  assert.equal(broker.lifecycle, 'retired_historical_receipt_verification_only');
  assert.equal(broker.live_mutation_authority, false);
  assert.equal(broker.new_admission_allowed, false);
  assert.equal(broker.current_release_admission.live_admission_authority, false);
  assert.equal(broker.mutation_broker.execution_allowed, false);
  assert.equal(broker.workflow_lookup.new_lookup_or_mutation_allowed, false);
  assert.equal(readiness.current_release_admission_readiness.status, 'retired');
  assert.equal(readiness.current_release_admission_readiness.mode, 'framework_checkpoint_app_executor');
  assert.equal(readiness.isolated_broker_hardening.status, 'retired');
  assert.equal(readiness.isolated_broker_hardening.disposition, 'historical_receipt_verification_only');
  const legacy = release.release_bundle_control_plane.legacy_compatibility;
  assert.equal(legacy.lifecycle, 'retired_historical_receipt_compatibility');
  assert.equal(legacy.authority_class, 'historical_read_only');
  assert.equal(legacy.broker_session_operator_authority, 'historical_read_only');
  assert.equal(legacy.access, 'read_only');
  assert.equal(legacy.authoritative, false);
  assert.equal(legacy.new_state_creation_allowed, false);
  assert.deepEqual(legacy.accepted_read_only_commands, ['verify', 'status']);
  assert.ok(legacy.parser_forbidden_capabilities.includes('authorize_mutation'));
  assert.ok(legacy.parser_forbidden_capabilities.includes('reconcile_live_state'));
  assert.deepEqual(legacy.retired_package_scripts, [
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
  ]);
  assert.deepEqual(legacy.retained_read_only_package_scripts, [
    'release:historical-candidate-record:status',
    'release:historical-bundle:status',
  ]);
  assert.equal(release.release_acceleration.scope, 'product_build_qualification_vm_and_cache_policy_only');
  assert.equal(release.release_acceleration.live_state_authority, false);
  assert.equal(release.release_acceleration.new_session_or_dispatch_allowed, false);
  assert.equal(release.release_acceleration.stable_release_state_machine, undefined);
  assert.equal(release.release_acceleration.release_operator, undefined);
  assert.deepEqual(release.release_acceleration.settings_runtime_refresh_evidence_policy, {
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
  });
  assert.equal(release.operator_evidence_bundle.release_owner_verdict.post_owner_receipt_fast_path, undefined);
  assert.equal(release.operator_evidence_bundle.release_owner_verdict.may_dispatch_rerun_cancel_publish_or_promote, false);
  assert.deepEqual(release.release_bundle_control_plane.validation_canary, {
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
  });
});

test('known failed Bundle remains permanently ineligible', () => {
  const control = readJson('contracts/app-release-channel.json').release_bundle_control_plane;
  assert.deepEqual(control.cutover.permanently_rejected_bundle_digests, [
    'sha256:91d5ea069757fca6bb9aa2280615dc952caeff55b6b4bc13e08e40df32378f49',
  ]);
});

test('release boundary rejects live authority, checkpoint, resilience, and broker retirement drift', () => {
  const canonicalRelease = readJson('contracts/app-release-channel.json');
  const canonicalBroker = readJson('contracts/app-release-broker-authority.json');
  const mutations: Array<(release: Record<string, any>, broker: Record<string, any>) => void> = [
    (release) => {
      release.release_bundle_control_plane.live_authority.app_session_broker_or_operator_may_authorize_mutation = true;
    },
    (release) => {
      release.release_bundle_control_plane.framework_authority.checkpoint_and_receipt_state_authority_exclusive = false;
    },
    (release) => {
      release.release_bundle_control_plane.checkpoint_transport.import_never_rebuilds = false;
    },
    (release) => {
      release.release_bundle_control_plane.checkpoint_transport.active_unknown_markers
        .exact_reconcile_match_fields = ['bundle_digest', 'track'];
    },
    (release) => {
      release.release_bundle_control_plane.checkpoint_transport.active_unknown_markers
        .ordinary_mutations_allowed = true;
    },
    (release) => {
      release.release_bundle_control_plane.operation_control.partial_workflow_rerun_allowed = true;
    },
    (release) => {
      release.release_bundle_control_plane.operation_control.operation_admission_identity_fields = [
        'operation',
        'operation_started_at',
        'operation_deadline_at',
      ];
    },
    (release) => {
      release.release_bundle_control_plane.operation_control.stable_operations.resume_standard
        .new_operation_id_allowed = true;
    },
    (release) => {
      release.release_bundle_control_plane.operation_control.stable_operations.resume_standard
        .start_refresh_allowed = true;
    },
    (release) => {
      release.release_bundle_control_plane.operation_control.stable_operations.resume_standard
        .deadline_refresh_allowed = true;
    },
    (release) => {
      release.release_bundle_control_plane.operation_control.stable_operations.append_full
        .standard_operation_id_reuse_allowed = true;
    },
    (release) => {
      release.release_bundle_control_plane.operation_control.stable_operations.append_full
        .standard_deadline_inheritance_allowed = true;
    },
    (release) => {
      release.release_bundle_control_plane.operation_control.elapsed_deadline.stage_advanced = true;
    },
    (release) => {
      release.release_bundle_control_plane.operation_control.deadline_source_field = 'github.run_started_at';
    },
    (release) => {
      release.release_bundle_control_plane.operation_control.append_full_may_inherit_standard_deadline = true;
    },
    (release) => {
      release.release_preflight.stable_stage_result.release_state_authority = true;
    },
    (release) => {
      release.release_preflight.dispatch_guard.failure_fingerprint_circuit_breaker
        .unchanged_dispatch_allowed = true;
    },
    (release) => {
      release.release_bundle_control_plane.operation_control.same_operation_jobs_and_mutations_share_exact_deadline = false;
    },
    (release) => {
      release.release_bundle_control_plane.publication.stable.latest_admission.framework_latest_eligible_alone_is_sufficient = true;
    },
    (release) => {
      release.release_bundle_control_plane.publication.stable.latest_admission
        .updater_predecessor_receipts_allowed = true;
    },
    (release) => {
      release.release_bundle_control_plane.publication.stable.latest_admission
        .publication_ancestor_counts.vm = 1;
    },
    (release) => {
      release.release_bundle_control_plane.publication.stable.latest_admission
        .homebrew_evidence.clean_vm_receipt_allowed = true;
    },
    (release) => {
      release.release_bundle_control_plane.publisher_idempotency.reconcile_admission
        .framework_status_reconcile_required_value = false;
    },
    (release) => {
      release.release_bundle_control_plane.publisher_idempotency.reconcile_admission.persistent_unknown_framework_receipt_required = false;
    },
    (release) => {
      release.release_bundle_control_plane.resilience_policy.updater_metadata_declared_digest_is_not_sufficient = false;
    },
    (release) => {
      release.release_bundle_control_plane.resilience_policy.homebrew_retry_push_on_unknown_allowed = true;
    },
    (release) => {
      release.release_bundle_control_plane.validation_canary.secrets_allowed = true;
    },
    (release) => {
      release.homebrew_tap_distribution.tap_update_policy.full.homebrew_publish_allowed = false;
    },
    (release) => {
      release.homebrew_tap_distribution.tap_update_policy.nightly.may_update_stable = true;
    },
    (release) => {
      release.release_bundle_control_plane.cutover.permanently_rejected_bundle_digests = [];
    },
    (release) => {
      release.release_acceleration.stable_release_state_machine = { authoritative: false };
    },
    (release) => {
      release.release_acceleration.settings_runtime_refresh_evidence_policy.synthetic_target_injection_allowed = true;
    },
    (release) => {
      release.full_first_install.published_addon.workflow = '.github/workflows/desktop-release-full-addon.yml';
    },
    (release) => {
      release.operator_evidence_bundle.release_owner_verdict.post_owner_receipt_fast_path = {};
    },
    (release) => {
      release.release_bundle_control_plane.legacy_compatibility.accepted_read_only_commands.push('assemble');
    },
    (_release, broker) => {
      broker.live_mutation_authority = true;
    },
  ];

  for (const mutate of mutations) {
    const release = structuredClone(canonicalRelease);
    const broker = structuredClone(canonicalBroker);
    mutate(release, broker);
    assert.ok(validateSilently(release, broker) > 0);
  }
});
