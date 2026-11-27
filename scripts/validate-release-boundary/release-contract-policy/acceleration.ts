import {
  hasFrameworkAuthority,
  hasLiveReleaseAuthority,
  hasPortableCheckpointPolicy,
  hasStableOperationControl,
  hasReleaseResilience,
  hasStableStageResultPolicy,
  hasStableFailureFingerprintPolicy,
  hasStablePublicationRoutes,
  hasNightlyPublicationPolicy,
  hasPublisherIdempotency,
} from '../../release-control-plane-policy.ts';
import {
  exactUnknownMarkerFields,
  frameworkReleaseCommandForms,
  frameworkReleaseCommands,
  immutableOperationControlFields,
  publisherReconcileAdmissionContract,
  retiredReleasePackageScripts,
  stableBusinessStageIds,
  stableFailureFingerprintFields,
  stableStageAxes,
  standardLatestAdmissionContract,
  validationCanaryContract,
} from '../../release-control-plane-policy-values.ts';
import fs from 'node:fs';
import path from 'node:path';

import { matchesHomebrewTapFollowerPolicy } from '../../homebrew-tap-follower-policy.ts';

import {
  sameStringSet,
  stringArrayIncludesAll,
} from './types.ts';
import {
  evaluateReleaseBrokerAuthorityReadiness,
  requiredRemovedReleaseImplementationPaths,
  requiredRetainedNonAuthoritativeImplementationPaths,
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
  const resumeStandardOperation = operations?.stable_operations?.resume_standard;
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
    !hasFrameworkAuthority(control) ||
    !sameStringSet(framework?.receipt_schemas, [
      'opl_release_bundle_executor_receipt.v1',
      'opl_release_bundle_operation_receipt.v1',
      'opl_release_bundle_qualification_receipt.v1',
    ]) ||
    JSON.stringify(framework?.commands) !== JSON.stringify(frameworkReleaseCommands)
  ) {
    console.error('FAIL release_bundle_authority: App-owned release-bundle-cli.ts and its portable checkpoint must own live release state');
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
  if (JSON.stringify(framework?.command_forms) !== JSON.stringify(frameworkReleaseCommandForms)) {
    console.error('FAIL release_bundle_framework_abi: App contract must match the current Framework CLI forms exactly');
    failures += 1;
  }
  if (
    !hasLiveReleaseAuthority(live) ||
    !sameStringSet(live?.stable_operations, ['standard', 'resume_standard', 'append_full'])
  ) {
    console.error('FAIL release_live_authority: only Framework checkpoint state and the App executor may mutate a release');
    failures += 1;
  }
  if (
    !hasPortableCheckpointPolicy(checkpoint) ||
    !sameStringSet(checkpoint?.stages, [
      'frozen', 'standard_built', 'standard_qualified', 'full_built', 'full_qualified',
    ]) ||
    !sameStringSet(checkpoint?.source_build_provenance_fields, [
      'source_build_executor', 'source_build_run_id',
    ]) ||
    !sameStringSet(checkpoint?.transport_provenance_fields, [
      'checkpoint_transport_executor', 'transport_run_id',
    ]) ||
    !sameStringSet(markerPolicy?.checkpoint_import_result_fields, [
      'unknown_outcomes_imported', 'active_unknown_marker_count', 'reconcile_required',
    ]) ||
    !sameStringSet(markerPolicy?.allowed_commands, ['status', 'exact_reconcile']) ||
    JSON.stringify(markerPolicy?.exact_reconcile_match_fields) !== JSON.stringify(exactUnknownMarkerFields)
  ) {
    console.error('FAIL release_checkpoint_transport: executor switches must preserve exact controls and unknown markers without rebuilding or resurrecting resolved outcomes');
    failures += 1;
  }
  if (
    !hasStableOperationControl(operations) ||
    operations?.full_recovery_identity_roles?.verification_app_ref !== 'qualification_scope_proof_app_head_sha_or_explicit_exact_override' ||
    JSON.stringify(resumeStandardOperation?.reused_identity_fields) !== JSON.stringify(
      immutableOperationControlFields.filter((field) => !['control_digest', 'operation_started_at', 'operation_deadline_at'].includes(field)),
    )
  ) {
    console.error('FAIL release_operation_control: Standard identity must be immutable, resume may rotate only an expired reconciled window, append must stay independent, and late reconcile remains evidence-only');
    failures += 1;
  }
  if (
    !hasStableStageResultPolicy(stableStageResult) ||
    JSON.stringify(stableStageResult?.stage_ids) !== JSON.stringify(stableBusinessStageIds) ||
    JSON.stringify(stableStageResult?.axes) !== JSON.stringify(stableStageAxes)
  ) {
    console.error('FAIL stable_stage_result_contract: App stage results must be deterministic non-authoritative attempt observations');
    failures += 1;
  }
  if (
    !hasStableFailureFingerprintPolicy(failureFingerprint) ||
    JSON.stringify(failureFingerprint?.identity_fields) !==
      JSON.stringify(stableFailureFingerprintFields)
  ) {
    console.error('FAIL stable_failure_fingerprint_contract: unchanged fingerprints must deny dispatch before transport');
    failures += 1;
  }
  if (
    !hasStablePublicationRoutes(publication?.stable) ||
    JSON.stringify(publication?.stable?.latest_admission) !== JSON.stringify(standardLatestAdmissionContract)
  ) {
    console.error('FAIL release_latest_admission: Latest must require the hosted publication floor, exact candidate bytes, and Homebrew publication/readback without optional certification evidence');
    failures += 1;
  }
  if (!hasNightlyPublicationPolicy(publication?.nightly)) {
    console.error('FAIL release_nightly_publication: Nightly must default to the daily schedule and keep user-explicit development validation on the same Standard-only non-Latest path');
    failures += 1;
  }
  if (
    !hasPublisherIdempotency(publisher) ||
    JSON.stringify(publisher?.reconcile_admission) !== JSON.stringify(publisherReconcileAdmissionContract)
  ) {
    console.error('FAIL release_reconcile_admission: persistent Framework unknown status must gate bounded inspect and reconcile without mutation retries');
    failures += 1;
  }
  if (
    !hasReleaseResilience(resilience) ||
    !sameStringSet(resilience?.updater_baseline_sources, ['current_latest', 'highest_public_stable']) ||
    !sameStringSet(resilience?.updater_zip_identity_fields, ['size_bytes', 'sha256'])
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
    !sameStringSet(legacy?.retired_package_scripts, retiredReleasePackageScripts) ||
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
  if (JSON.stringify(validationCanary) !== JSON.stringify(validationCanaryContract)) {
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
    !matchesHomebrewTapFollowerPolicy(homebrew?.tap_update_policy) ||
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
    homebrew?.tap_update_policy?.full?.authority_model !== 'workflow_cas_and_unified_attestation_observer' ||
    homebrew?.tap_update_policy?.full?.framework_checkpoint_import_allowed !== false ||
    homebrew?.tap_update_policy?.full?.current_follower_operation_control_required !== true ||
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
