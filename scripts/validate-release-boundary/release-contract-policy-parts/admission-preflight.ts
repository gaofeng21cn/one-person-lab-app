import fs from 'node:fs';
import path from 'node:path';

import {
  sameStringSet,
  stringArrayIncludesAll,
} from './types.ts';

function readJson(appRoot: string, relativePath: string): any {
  return JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), 'utf8'));
}

const requiredSourceGateScopes = [
  'App release-boundary contract',
  'current App profile against exact Shell consumer in a temporary archive',
  'shell format',
  'shell type',
  'active shell node/dom tests',
  'shell ref resolution',
  'framework ref resolution',
];
const requiredSourceGatePrecedes = [
  'standard_macos_arm64_build',
  'full_first_install_build',
  'webui_ghcr_publish',
  'post_publication_optional_certification',
];

export function validatePhysicalVmOptionalCertificationPolicy(releaseContract: Record<string, any>): number {
  const acceleration = releaseContract.release_acceleration;
  const vmGates = Array.isArray(acceleration?.vm_gates) ? acceleration.vm_gates : [];
  const hostedLinux = acceleration?.hosted_linux_certification;
  let failures = 0;
  if (
    JSON.stringify(vmGates.map((gate) => gate?.id)) !== JSON.stringify([
      'standard_dmg_clean_vm_smoke',
      'homebrew_standard_cask_clean_vm_smoke',
      'full_dmg_clean_vm_smoke',
    ])
  ) {
    console.error('FAIL release_vm_certification_policy: physical VM gate identities must remain exact');
    failures += 1;
  }
  const requiredVmGates = vmGates.filter((gate) =>
    ['standard_dmg_clean_vm_smoke', 'full_dmg_clean_vm_smoke'].includes(gate?.id),
  );
  if (
    requiredVmGates.length !== 2 ||
    requiredVmGates.some((gate) =>
      gate?.diagnostic_scope !== 'release_gate' ||
      gate?.gate_policy !== 'required_prepublication_same_candidate' ||
      gate?.runtime_profile !== (gate?.id === 'full_dmg_clean_vm_smoke' ? 'full' : 'standard') ||
      !Array.isArray(gate?.certification_readiness) ||
      !gate.certification_readiness.includes(gate?.runtime_profile === 'full'
        ? 'official_profile_exact_roots_installed_without_restore'
        : 'official_profile_background_status_and_root_presence_observed_without_restore') ||
      !sameStringSet(gate?.release_blocking_readiness, [
        'gateway_account_login',
        ...(gate?.runtime_profile === 'full' ? ['official_profile_first_install'] : []),
        'fresh_framework_agent_projection',
      ])
    )
  ) {
    console.error('FAIL release_vm_required_policy: Standard and Full clean-VM must remain the prepublication physical VM gates');
    failures += 1;
  }
  const optionalVmGate = vmGates.find((gate) => gate?.id === 'homebrew_standard_cask_clean_vm_smoke');
  if (
    optionalVmGate?.diagnostic_scope !== 'post_publication_optional_certification' ||
    optionalVmGate?.gate_policy !== 'optional_non_blocking_same_published_artifact' ||
    'release_blocking_readiness' in (optionalVmGate ?? {})
  ) {
    console.error('FAIL release_vm_optional_policy: Homebrew VM certification must remain post-publication and non-blocking');
    failures += 1;
  }
  const fullVmGate = vmGates.find((gate) => gate?.id === 'full_dmg_clean_vm_smoke');
  const legacyVmGate = acceleration?.vm_gate;
  const legacyVmMirrorFields = [
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
    'release_blocking_readiness',
    'post_core_ready_background_policy',
  ];
  if (
    !fullVmGate ||
    !legacyVmGate ||
    legacyVmMirrorFields.some((field) =>
      JSON.stringify(legacyVmGate[field]) !== JSON.stringify(fullVmGate[field])
    )
  ) {
    console.error('FAIL release_vm_legacy_mirror: legacy Full VM policy must mirror the required clean-install gate');
    failures += 1;
  }
  if (
    hostedLinux?.id !== 'linux_x64_same_artifact_install_smoke' ||
    hostedLinux?.workflow !== '.github/workflows/release-post-publication-certification.yml' ||
    hostedLinux?.runner !== 'ubuntu-latest' ||
    hostedLinux?.platform !== 'linux-x64' ||
    hostedLinux?.artifact !== 'One-Person-Lab-<version>-linux-x64.deb' ||
    hostedLinux?.installer !== 'opl-install.sh' ||
    !sameStringSet(hostedLinux?.installer_arguments, [
      '--desktop',
      '--release-tag',
      '<exact-tag>',
      '--no-open',
    ]) ||
    hostedLinux?.app_release_single_tag_asset_binding_required !== true ||
    hostedLinux?.same_release_tag_required !== true ||
    hostedLinux?.desktop_manifest_cohort_binding_required !== true ||
    hostedLinux?.same_deb_artifact_identity_required !== true ||
    hostedLinux?.cross_component_version_sha_or_cohort_equality_required !== false ||
    hostedLinux?.dependency_compatibility_contract_ref !==
      'contracts/app-install-exposure-policy.json#component_interoperability.compatibility_admission' ||
    hostedLinux?.typed_admission_schema !== 'opl_app_stable_desktop_asset_append.v1' ||
    hostedLinux?.typed_execution_evidence_schema !== 'opl_app_linux_same_tag_desktop_install.v1' ||
    hostedLinux?.clean_machine_preinstall_absence_required !== true ||
    hostedLinux?.installed_executable_byte_parity_required !== true ||
    hostedLinux?.failed_download_evidence_truthful_required !== true ||
    JSON.stringify(hostedLinux?.terminal_statuses) !== JSON.stringify(['passed', 'failed']) ||
    hostedLinux?.unavailable_allowed !== false ||
    hostedLinux?.downloaded_from_published_release_required !== true ||
    hostedLinux?.rebuilt_allowed !== false ||
    hostedLinux?.failure_receipt_uploaded_before_job_failure !== true ||
    hostedLinux?.gate_policy !== 'optional_non_blocking_same_published_artifact' ||
    hostedLinux?.required_for_publication_or_latest !== false
  ) {
    console.error('FAIL release_hosted_linux_certification: Linux certification must consume exact public installer and DEB bytes without blocking Stable or Latest');
    failures += 1;
  }
  const stableValidation = releaseContract.release_validation_profiles?.stable;
  if (
    stableValidation?.addon_gate_blocking_standard_terminal !== false ||
    !stableValidation?.addon_lanes?.includes('full_dmg_clean_vm_smoke') ||
    stableValidation?.diagnostic_lanes?.includes('full_dmg_clean_vm_smoke') ||
    !stableValidation?.required_lanes?.includes('standard_dmg_clean_vm_smoke') ||
    !sameStringSet(stableValidation?.post_publication_optional_certification_surfaces, [
      'stable_shell_upgrade_routes',
      'homebrew_standard_cask_clean_vm_smoke',
      'one_shot_app_installer_fresh_install_smoke',
    ]) ||
    !sameStringSet(stableValidation?.same_candidate_prepublication_clean_install_gates, ['standard_dmg_clean_vm_smoke', 'full_dmg_clean_vm_smoke']) ||
    !sameStringSet(stableValidation?.hosted_post_publication_optional_certification_surfaces, [
      'linux_x64_same_artifact_install_smoke',
    ])
  ) {
    console.error('FAIL release_stable_vm_policy: exact-candidate Standard and Full gates must protect only their respective publication tracks');
    failures += 1;
  }
  return failures;
}



export function validateReleasePreflightContract(releaseContract: Record<string, any>): number {
  let failures = 0;
  const preflight = releaseContract.release_preflight;
  const localFirst = preflight?.local_first;
  if (
    preflight?.script !== 'scripts/framework-release-adapter.ts' ||
    preflight?.package_script !== 'release:framework-adapter' ||
    preflight?.command !== 'freeze-request' ||
    preflight?.workflow_job !== 'freeze' ||
    preflight?.admission_scope !== 'product_policy_inputs_before_framework_bundle_freeze' ||
    preflight?.live_state_authority !== false ||
    preflight?.checkpoint_authority_ref !== 'release_bundle_control_plane.framework_authority' ||
    !sameStringSet(preflight?.stable_operations, ['standard', 'resume_standard', 'append_full']) ||
    preflight?.legacy_preflight?.implementation_path !== null ||
    preflight?.legacy_preflight?.lifecycle !== 'removed' ||
    preflight?.legacy_preflight?.package_entry !== null ||
    preflight?.legacy_preflight?.replacement !== 'scripts/framework-release-adapter.ts freeze-request' ||
    preflight?.legacy_preflight?.may_create_release_state_or_authorize_mutation !== false ||
    preflight?.failure_budget !== 'fail product-policy admission before Framework freeze or any expensive build; evaluate Full-specific failures only in append_full'
  ) {
    console.error('FAIL release_preflight_contract: release_preflight must bind the App product adapter freeze-request and keep the legacy preflight implementation absent');
    failures += 1;
  }
  if (
    localFirst?.entrypoint !== 'scripts/verify.sh release-preflight'
    || localFirst?.reuses_existing_orchestrator !== true
    || !sameStringSet(localFirst?.local_checks, [
      'actionlint',
      'typecheck',
      'active_shell',
      'release_boundary',
      'candidate_shell',
      'standard_package_build',
    ])
    || !sameStringSet(localFirst?.remote_only, [
      'github_hosted_required_macos_linux_matrix',
      'github_hosted_desktop_artifacts_matrix_required',
      'protected_signing_and_notarization_credentials',
      'public_mutation',
      'owner_authoritative_remote_readback',
    ])
    || !sameStringSet(localFirst?.optional_deferred, [
      'post_publication_clean_machine_certification',
    ])
    || localFirst?.public_mutation_allowed !== false
  ) {
    console.error('FAIL release_preflight_contract: local-first preflight must reuse verify.sh and disclose remote-only and optional work');
    failures += 1;
  }
  for (const checkId of [
    'channel_display_and_updater_version_identity',
    'app_artifact_identity_and_framework_compatibility_receipt',
    'app_standard_identity_mode',
    'typed_package_compatibility_abi_and_range',
    'package_release_set_and_exact_package_fields_absent',
    'prepared_ai_release_notes_marker',
    'prepared_ai_release_notes_standard_scope',
    'framework_freeze_request_schema',
    'stable_operation_control_digest',
    'stable_admission_manifest_digest',
    'apple_credentials_runtime_receipt',
    'cross_namespace_version_allocator',
    'zero_other_active_stable_authority_runs',
    'current_app_profile_exact_shell_consumer',
  ]) {
    if (!preflight?.required_fast_checks?.includes(checkId)) {
      console.error(`FAIL release_preflight_contract: missing required fast check ${checkId}`);
      failures += 1;
    }
  }
  for (const artifact of ['freeze-request.json', 'freeze-result.json']) {
    if (!preflight?.summary_artifacts?.includes(artifact)) {
      console.error(`FAIL release_preflight_contract: missing summary artifact ${artifact}`);
      failures += 1;
    }
  }
  const standardAdmission = preflight?.standard_admission_manifest;
  if (
    standardAdmission?.schema !== 'opl_stable_release_admission_manifest.v1'
    || standardAdmission?.script !== 'scripts/stable-release-admission-manifest.ts'
    || standardAdmission?.producer_workflow !== '.github/workflows/release-stable.yml'
    || standardAdmission?.consumer_workflow !== '.github/workflows/release-stable.yml'
    || standardAdmission?.protected_environment !== 'release-stable'
    || standardAdmission?.artifact_name !== 'opl-stable-admission-<stable_run_id>'
    || standardAdmission?.digest_algorithm !== 'sha256'
    || !sameStringSet(
      standardAdmission?.standard_dispatch_inputs,
      ['operation', 'authority_id', 'operation_id', 'authority_carrier', 'authority_digest'],
    )
    || standardAdmission?.raw_standard_version_or_ref_inputs_allowed !== false
    || standardAdmission?.fresh_verify_before_expensive_work !== true
    || standardAdmission?.full_source_gate_rerun_in_workflow !== false
    || standardAdmission?.unknown_dispatch_result_policy !== 'read_only_reconcile_without_rerun_redispatch_or_cancel'
    || standardAdmission?.active_run_scope?.blocking_workflow !== '.github/workflows/release-stable.yml'
    || standardAdmission?.active_run_scope?.independent_release_workflows_block_stable_admission !== false
    || standardAdmission?.active_run_scope?.nightly_active_run_blocks_stable_admission !== false
    || standardAdmission?.active_run_scope?.same_stable_authority_parallel_run_allowed !== false
  ) {
    console.error('FAIL release_preflight_contract: Standard dispatch must consume one protected digest-bound admission manifest');
    failures += 1;
  }
  for (const binding of [
    'pre_issued_stable_authority_carrier',
    'frozen_app_shell_framework_cohort',
    'frozen_source_gate_bytes_and_digest',
    'pre_nonce_guard_bytes_and_digest',
    'run_authority_reconcile_control',
    'single_use_control_consumption',
    'critical_workflow_git_blobs_and_sha256',
    'apple_protected_secret_names_6_of_6',
    'developer_id_and_notary_authentication_receipt',
    'cross_namespace_stable_version_allocator',
    'github_release_and_tag_namespace',
    'anonymous_webui_namespace',
    'homebrew_standard_cask_and_policy',
    'zero_other_active_stable_authority_runs',
    'git_wire_main_refs_and_single_owner_run_query',
  ]) {
    if (!standardAdmission?.required_bindings?.includes(binding)) {
      console.error(`FAIL release_preflight_contract: Standard admission manifest missing binding ${binding}`);
      failures += 1;
    }
  }
  const dispatchGuard = preflight?.dispatch_guard;
  if (
    dispatchGuard?.schema !== 'opl_release_dispatch_guard.v1'
    || dispatchGuard?.script !== 'scripts/release-dispatch-guard.ts'
    || dispatchGuard?.package_script !== 'release:dispatch-guard'
    || dispatchGuard?.required_before_nonce_consumption !== true
    || dispatchGuard?.source_gate_report_exact_cohort_binding_required !== true
    || !sameStringSet(
      dispatchGuard?.required_pre_nonce_gates,
      [
        'release:source-gate_pre_dispatch_once',
        'current_app_profile_exact_shell_consumer_pre_dispatch_once',
        'frozen_app_shell_framework_commit_reachability_and_critical_blob_binding',
        'single_operation_owner_workflow_runs_query_and_zero_other_active_stable_authority_runs',
      ],
    )
    || dispatchGuard?.cross_repository_ref_identity?.transport !== 'git_ls_remote_wire'
    || dispatchGuard?.cross_repository_ref_identity?.commit_or_ref_api_guard_allowed !== false
    || dispatchGuard?.cross_repository_ref_identity?.max_transport_attempts_per_read !== 3
    || dispatchGuard?.cross_repository_ref_identity?.transport_failure_is_credential_failure !== false
    || dispatchGuard?.cross_repository_ref_identity?.live_main_equality_required_after_freeze !== false
    || dispatchGuard?.cross_repository_ref_identity?.frozen_commit_reachability_required !== true
    || dispatchGuard?.cross_repository_ref_identity?.critical_blob_digest_binding_required !== true
    || dispatchGuard?.owner_run_lookup?.logical_query_count !== 1
    || dispatchGuard?.owner_run_lookup?.max_transport_attempts !== 3
    || dispatchGuard?.owner_run_lookup?.parser !== 'node_structured_json_without_jq'
    || !sameStringSet(
      dispatchGuard?.owner_run_lookup?.identity_fields,
      [
        'workflow_path',
        'event_workflow_dispatch',
        'head_branch_main',
        'run_attempt_1',
        'operation_id_in_run_name',
        'authority_id_in_run_name',
        'current_run_id_for_consumption',
      ],
    )
    || dispatchGuard?.owner_run_lookup?.identity_window_seconds !== null
    || dispatchGuard?.owner_run_lookup?.zero_or_ambiguous_result !== 'outcome_unknown'
    || !sameStringSet(
      dispatchGuard?.transport_failure_codes,
      ['tls_handshake_timeout', 'unexpected_eof', 'transport_timeout', 'transport_error'],
    )
    || JSON.stringify(dispatchGuard?.pre_nonce_failure) !== JSON.stringify({
      nonce_consumed: false,
      mutation_invocation_count: 0,
      read_only_reconcile_allowed: true,
      guard_replacement_allowed: false,
      dispatch_allowed: false,
    })
    || JSON.stringify(dispatchGuard?.post_dispatch_failure) !== JSON.stringify({
      nonce_consumed: true,
      mutation_invocation_count: 1,
      mutation_retry_count: 0,
      read_only_reconcile_only: true,
      replacement_allowed: false,
      redispatch_allowed: false,
    })
  ) {
    console.error('FAIL release_dispatch_guard_contract: ref identity and owner-run reconciliation must be bounded, structured, and mutation-safe');
    failures += 1;
  }
  const stableOperationControl = preflight?.stable_operation_control;
  if (
    stableOperationControl?.authority_schema !== 'opl_app_stable_operation_authority.v1'
    || stableOperationControl?.control_schema !== 'opl_app_stable_operation_control.v1'
    || stableOperationControl?.consumption_schema !== 'opl_app_stable_operation_consumption.v1'
    || stableOperationControl?.script !== 'scripts/stable-operation-control.ts'
    || stableOperationControl?.protected_admission_job !== 'protected-operation-admission'
    || stableOperationControl?.artifact_name !== 'opl-stable-operation-control-<stable_run_id>'
    || stableOperationControl?.authority_carrier_required !== true
    || stableOperationControl?.authority_issuance !== 'operator_issued_github_dispatch_input_non_cryptographic'
    || stableOperationControl?.workflow_may_self_issue_authority_or_nonce !== false
    || stableOperationControl?.operation_id_derivation !== 'deterministic_frozen_cohort_and_critical_blob_identity'
    || stableOperationControl?.bare_dispatch_fails_before_expensive_work !== true
    || stableOperationControl?.live_main_drift_invalidates_frozen_cohort !== false
    || stableOperationControl?.current_executor?.live_main_equality_with_frozen_app_required !== false
    || stableOperationControl?.current_executor?.critical_blob_equality_with_authority_required !== true
    || stableOperationControl?.current_executor?.frozen_app_commit_checkout_required !== true
    || stableOperationControl?.source_gate?.script !== 'scripts/validate-release-source-gate.ts'
    || stableOperationControl?.source_gate?.execution_phase !== 'operator_pre_dispatch_before_authority_issuance'
    || stableOperationControl?.source_gate?.runs_per_operation !== 1
    || stableOperationControl?.source_gate?.workflow_rerun_allowed !== false
    || stableOperationControl?.source_gate?.digest_bound_to_authority_and_control !== true
    || stableOperationControl?.pre_nonce_guard?.script !== 'scripts/release-dispatch-guard.ts'
    || stableOperationControl?.pre_nonce_guard?.phase !== 'pre_nonce'
    || stableOperationControl?.pre_nonce_guard?.execution_phase !== 'operator_pre_dispatch_before_authority_issuance'
    || stableOperationControl?.pre_nonce_guard?.digest_bound_to_authority_and_control !== true
    || stableOperationControl?.run_authority_reconcile?.distinct_from_pre_nonce_guard !== true
    || stableOperationControl?.run_authority_reconcile?.current_run_binding_required !== true
    || stableOperationControl?.run_authority_reconcile?.prior_consumer_forbidden !== true
    || stableOperationControl?.run_authority_reconcile?.digest_bound_to_control_and_consumption !== true
    || stableOperationControl?.single_use_consumption?.required_before_cold_work !== true
    || stableOperationControl?.single_use_consumption?.one_operation_one_matching_run !== true
    || stableOperationControl?.single_use_consumption?.control_artifact_consumer !==
      '.github/workflows/_release-bundle.yml'
    || stableOperationControl?.actions_artifact?.role !== 'transient_transport_only'
    || stableOperationControl?.actions_artifact?.durable_authority !== false
  ) {
    console.error('FAIL release_preflight_contract: Stable must consume one protected authority, frozen source-gate, pre-nonce guard, run-authority reconcile, and single-use control artifact.');
    failures += 1;
  }
  if (
    preflight?.apple_credentials_diagnostic?.workflow !== '.github/workflows/release-diagnostics.yml'
    || preflight?.apple_credentials_diagnostic?.authority !== 'diagnostic_only'
    || preflight?.apple_credentials_diagnostic?.may_create_stable_admission_manifest !== false
    || preflight?.apple_credentials_diagnostic?.may_dispatch_standard !== false
    || preflight?.apple_credentials_diagnostic?.existing_submission_reconcile?.input !== 'notary_submission_id'
    || preflight?.apple_credentials_diagnostic?.existing_submission_reconcile?.identity_binding !== 'exact_uuid'
    || preflight?.apple_credentials_diagnostic?.existing_submission_reconcile?.submit_allowed !== false
    || preflight?.apple_credentials_diagnostic?.existing_submission_reconcile?.wait_allowed !== false
    || preflight?.apple_credentials_diagnostic?.existing_submission_reconcile?.staple_allowed !== false
    || preflight?.apple_credentials_diagnostic?.existing_submission_reconcile?.release_or_dispatch_mutation_allowed !== false
    || preflight?.apple_credentials_diagnostic?.existing_submission_reconcile?.public_asset_write_allowed !== false
  ) {
    console.error('FAIL release_preflight_contract: standalone Apple credential preflight must be diagnostic-only');
    failures += 1;
  }
  const observability = preflight?.attempt_observability;
  if (
    observability?.schema !== 'opl_release_attempt_observation.v1'
    || observability?.workflow !== '.github/workflows/release-stable-post-success-followups.yml'
    || observability?.script !== 'scripts/release-attempt-observability.ts'
    || observability?.trigger !== 'release_stable_workflow_run_completed'
    || observability?.storage !== 'append_only_per_run_artifact'
    || observability?.first_terminal_classification !== 'machine_job_name_and_completed_at'
    || observability?.release_state_authority !== false
    || observability?.framework_status_authority !== false
    || observability?.mutation_authority !== false
    || observability?.may_authorize_retry_rerun_or_redispatch !== false
  ) {
    console.error('FAIL release_preflight_contract: attempt observability must remain an append-only non-authoritative follower');
    failures += 1;
  }
  const sourceGate = preflight?.source_gate;
  if (
    sourceGate?.package_script !== 'release:source-gate' ||
    sourceGate?.status !== 'implemented_once_before_dispatch_then_verified_from_frozen_evidence' ||
    sourceGate?.execution_owner !== 'operator_pre_dispatch_controller' ||
    sourceGate?.runs_per_operation !== 1 ||
    sourceGate?.workflow_rerun_allowed !== false ||
    sourceGate?.failure_next_action !== 'repair_source_gate' ||
    !sourceGate?.scope?.includes('current App profile against exact Shell consumer in a temporary archive') ||
    typeof sourceGate?.rule !== 'string' ||
    !sourceGate.rule.includes('runs once before dispatch') ||
    !sourceGate.rule.includes('records the exact App/Shell/Framework source and build provenance') ||
    !sourceGate.rule.includes('observational build provenance only') ||
    !sourceGate.rule.includes('never an install/runtime compatibility gate')
  ) {
    console.error('FAIL release_source_gate_contract: source gate must run once before dispatch and be verified from frozen evidence without workflow rerun');
    failures += 1;
  }
  if (!sameStringSet(sourceGate?.scope, requiredSourceGateScopes)) {
    console.error('FAIL release_source_gate_contract: source gate scope must cover release-boundary, shell format/type/tests/ref, and framework ref');
    failures += 1;
  }
  if (!sameStringSet(sourceGate?.must_run_before, requiredSourceGatePrecedes)) {
    console.error('FAIL release_source_gate_contract: source gate must precede hosted build, Full, WebUI, and optional certification work');
    failures += 1;
  }
  if (
    typeof preflight?.rule !== 'string' ||
    !preflight.rule.includes('app_standard_compatibility') ||
    !preflight.rule.includes('selected App artifact identity') ||
    !preflight.rule.includes('Framework compatibility requirements') ||
    !preflight.rule.includes('without Package Release Set or exact Package authority fields') ||
    !preflight.rule.includes('cannot create release state or replace Framework checkpoint admission') ||
    !preflight.rule.includes('App/Shell/Framework source refs remain provenance only') ||
    !preflight.rule.includes('append_full remains independently admissible') ||
    preflight?.full_addon_preflight?.operation !== 'append_full' ||
    preflight?.full_addon_preflight?.required_before_append_full_operation !== true ||
    preflight?.full_addon_preflight?.admission_dry_run?.executor_source !== 'canonical_workflow_sha' ||
    preflight?.full_addon_preflight?.admission_dry_run?.dependency_check !== 'npm_ci_ignore_scripts_dry_run' ||
    preflight?.full_addon_preflight?.admission_dry_run?.asset_policy_check !== 'full_addon_asset_policy_v1' ||
    preflight?.full_addon_preflight?.admission_dry_run?.full_specific_ref_check !== 'scripts/validate-full-addon-admission.ts' ||
    !sameStringSet(preflight?.full_addon_preflight?.admission_dry_run?.full_specific_ref_checks, [
      'exact_mas_scholar_skills_commit_reachability',
      'reusable_harness_scope_when_verification_refs_differ',
    ]) ||
    !sameStringSet(preflight?.full_addon_preflight?.admission_dry_run?.runtime_binding_check, [
      'release-executor',
      'gui_root',
      'out_dir',
    ]) ||
    preflight?.full_addon_preflight?.admission_dry_run?.public_mutation !== false
  ) {
    console.error('FAIL release_source_gate_contract: product preflight must remain non-authoritative and keep append_full independent');
    failures += 1;
  }
  return failures;
}



export function validateOptionalCertificationPolicy(releaseContract: Record<string, any>): number {
  const policy = releaseContract.post_publication_optional_certification;
  const existingRepairVerification = policy?.producer?.existing_repair_verification;
  let failures = 0;
  if (
    policy?.schema !== 'opl_app_optional_certification_policy.v1'
    || policy?.receipt_schema !== 'contracts/app-optional-certification-receipt.schema.json'
    || policy?.validator !== 'scripts/validate-optional-certification-receipt.ts'
    || policy?.required_for_publication !== false
    || policy?.required_for_latest !== false
    || policy?.stable_additive_repair_receipt_schema !== 'opl_app_stable_additive_repair.v1'
    || policy?.stable_additive_repair_requires_clean_linux_install !== true
    || policy?.stable_additive_repair_recertifies_macos_primary_assets !== false
    || !sameStringSet(policy?.stable_additive_repair_digest_chain_fields, [
      'replacement.previous.digest',
      'replacement.next.digest',
    ])
    || policy?.artifact_source !== 'exact_published_release_artifact_with_workflow_cas_and_unified_attestation'
    || policy?.artifact_rebuild_allowed !== false
    || policy?.full_artifact_release_source !== 'same_tag_mutable_standard_release'
    || policy?.full_component_manifest_release_source !== 'target_standard_release'
    || policy?.full_identity_cross_binding !==
      'target_standard_component_manifest_source_cohort_equals_full_build_provenance'
    || policy?.component_manifest_mutation_allowed !== false
    || policy?.component_manifest_resign_allowed !== false
    || !sameStringSet(policy?.statuses, ['passed', 'failed', 'not_run', 'unavailable'])
    || !sameStringSet(policy?.not_run_reason_codes, [
      'not_requested',
      'not_authorized',
      'operator_deferred',
    ])
    || !sameStringSet(policy?.unavailable_reason_codes, [
      'authority_or_capability_not_provable',
      'fleet_lease_admission_failed',
      'vm_admission_failed',
      'capability_admission_failed',
    ])
    || policy?.producer?.workflow !== '.github/workflows/release-post-publication-certification.yml'
    || policy?.producer?.trigger !== 'workflow_run_after_successful_github_release_publication'
    || policy?.producer?.automatic_prequeue_admission !== 'emit_not_run_until_exact_physical_capability_is_proven'
    || policy?.producer?.physical_executor_workflow !== '.github/workflows/opl-first-run-vm.yml'
    || policy?.producer?.dispatcher_execution !== 'github_hosted_read_only_public_artifact_consumer'
    || policy?.producer?.stable_dag_dependency !== false
    || policy?.producer?.may_queue_without_proven_capability !== false
    || existingRepairVerification?.trigger !== 'workflow_dispatch'
    || existingRepairVerification?.operation !== 'verify_existing_repair'
    || existingRepairVerification?.authority_binding !== 'canonical_main_plus_original_successful_stable_source_run_plus_successful_existing_repair_followup_run'
    || !sameStringSet(existingRepairVerification?.required_inputs, [
      'source_run_id', 'followup_run_id', 'verification_source_commit', 'operator_confirmation',
    ])
    || existingRepairVerification?.confirmation !== 'VERIFY EXISTING ADDITIVE REPAIR'
    || JSON.stringify(existingRepairVerification?.workflow_permissions) !== JSON.stringify({ contents: 'read', actions: 'read' })
    || existingRepairVerification?.public_mutation_allowed !== false
    || existingRepairVerification?.new_receipt_or_asset_allowed !== false
    || existingRepairVerification?.reuses_existing_public_repair_receipt !== true
    || existingRepairVerification?.canonical_main_executor_required !== true
    || policy?.producer?.exact_failed_follower_recovery !== undefined
  ) {
    console.error('FAIL optional_certification_policy: certification must be four-state, post-publication, same-artifact, and non-blocking');
    failures += 1;
  }
  return failures;
}



export function validateSourceMaterialRouteContract(appRoot: string): number {
  const runtimeBridge = readJson(appRoot, 'contracts/app-runtime-bridge.json');
  const guiContract = readJson(appRoot, 'contracts/app-gui-product-contract.json');
  const pageStateMatrix = readJson(appRoot, 'contracts/app-page-state-matrix.json');
  const sourceMaterial = runtimeBridge.source_material_projection;
  const guiRoute = guiContract.source_material_user_path;
  const ordinaryPage = Array.isArray(pageStateMatrix.pages)
    ? pageStateMatrix.pages.find((page) => page.id === 'ordinary_conversation')
    : null;
  const inspectorPage = Array.isArray(pageStateMatrix.pages)
    ? pageStateMatrix.pages.find((page) => page.id === 'right_context_inspector')
    : null;
  const requiredRefs = [
    'source_material_refs',
    'source_material_receipt_refs',
    'reference_design_packet_refs',
  ];
  let failures = 0;

  if (
    sourceMaterial?.ingest_command !== 'opl workspace source ingest --workspace <workspace_ref> --files <file_refs> --goal <user_goal> --json' ||
    sourceMaterial?.authority !== 'opl_framework_source_material_refs_projection' ||
    sourceMaterial?.producer_owner !== 'one-person-lab' ||
    sourceMaterial?.reference_design_consumer !== 'opl-meta-agent'
  ) {
    console.error('FAIL source_material_route_contract: source material must route through Framework ingest and OMA reference design consumption');
    failures += 1;
  }
  if (
    !stringArrayIncludesAll(sourceMaterial?.required_ref_fields, requiredRefs) ||
    !stringArrayIncludesAll(sourceMaterial?.domain_consumers, [
      'med-autoscience',
      'med-autogrant',
      'redcube-ai',
      'opl-bookforge',
      'opl-meta-agent',
    ])
  ) {
    console.error('FAIL source_material_route_contract: source material projection must require source/receipt/reference-design refs and domain consumers');
    failures += 1;
  }
  if (
    sourceMaterial?.refs_only !== true ||
    sourceMaterial?.source_body_access !== false ||
    sourceMaterial?.pdf_parse_access !== false ||
    sourceMaterial?.artifact_body_access !== false ||
    sourceMaterial?.domain_truth_write_access !== false ||
    sourceMaterial?.owner_receipt_write_access !== false ||
    sourceMaterial?.domain_verdict_authority !== false ||
    sourceMaterial?.readiness_authority !== false ||
    sourceMaterial?.source_readiness_authority !== false
  ) {
    console.error('FAIL source_material_route_contract: App must remain refs-only with no source/PDF body, domain truth, owner receipt, or readiness authority');
    failures += 1;
  }
  if (
    !stringArrayIncludesAll(sourceMaterial?.forbidden_claims, [
      'source_body',
      'pdf_parse_quality',
      'reference_design_quality_verdict',
      'domain_truth',
      'owner_receipt_authority',
      'app_release_readiness',
    ])
  ) {
    console.error('FAIL source_material_route_contract: forbidden claims must block body parsing quality, domain truth, owner receipt, and release readiness claims');
    failures += 1;
  }
  if (
    guiRoute?.route_contract_ref !== 'contracts/app-runtime-bridge.json#source_material_projection' ||
    guiRoute?.source_material_projection_ref !== 'contracts/app-runtime-bridge.json#source_material_projection' ||
    guiRoute?.framework_ingest_command !== sourceMaterial?.ingest_command ||
    guiRoute?.ui_implementation_status !== 'route_contract_landed_no_live_drag_drop_ui_evidence' ||
    guiRoute?.refs_only !== true ||
    guiRoute?.source_body_access !== false ||
    guiRoute?.pdf_parse_access !== false ||
    guiRoute?.artifact_body_access !== false ||
    guiRoute?.domain_verdict_authority !== false ||
    guiRoute?.owner_receipt_write_access !== false ||
    guiRoute?.release_readiness_authority !== false ||
    !stringArrayIncludesAll(guiRoute?.machine_ref_fields, requiredRefs)
  ) {
    console.error('FAIL source_material_route_contract: GUI source-material user path must mirror refs-only Framework route without live UI/readiness claims');
    failures += 1;
  }

  const guiConversationFields = guiContract.ordinary_conversation?.current_task_slice?.fields;
  const guiInspectorEvidence = guiContract.right_context_inspector?.current_task_evidence;
  const pageConversationSlice = ordinaryPage?.conversation_view_model?.current_task_slice;
  const pageInspectorEvidence = inspectorPage?.inspector_view_model?.current_task_evidence;
  for (const [surface, fields] of [
    ['gui ordinary conversation', guiConversationFields],
    ['gui right inspector', guiInspectorEvidence?.fields],
    ['page-state ordinary conversation', pageConversationSlice?.fields],
    ['page-state right inspector', pageInspectorEvidence?.fields],
  ] as const) {
    if (!stringArrayIncludesAll(fields, requiredRefs)) {
      console.error(`FAIL source_material_route_contract: ${surface} must expose source material refs, receipt refs, and reference design packet refs`);
      failures += 1;
    }
  }
  for (const [surface, evidence] of [
    ['gui right inspector', guiInspectorEvidence],
    ['page-state right inspector', pageInspectorEvidence],
  ] as const) {
    if (evidence?.source_material_projection_ref !== 'contracts/app-runtime-bridge.json#source_material_projection') {
      console.error(`FAIL source_material_route_contract: ${surface} must point to source material projection`);
      failures += 1;
    }
  }

  return failures;
}
