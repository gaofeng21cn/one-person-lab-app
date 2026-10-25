import { assertDeepEqualJson } from '../assertions.ts';
import { sameStringSet } from './string-set.ts';

function validateSuccessorProtectedReleaseAdmission(successor, fullFirstInstall) {
  const admission = successor?.protected_release_admission;
  const studioFullAppend = fullFirstInstall?.studio_same_tag_append;
  if (
    successor?.candidate_id !== 'opl-studio'
    || successor?.role !== 'next_stable_shell_release_pending'
    || successor?.active_shell_remains !== 'opl-studio'
    || successor?.active_release_carrier !== false
    || admission?.schema !== 'opl_studio_protected_release_admission_policy.v1'
    || admission?.source_admission_receipt_schema !== 'opl_studio_protected_release_admission.v2'
    || admission?.authority_owner !== 'one-person-lab-app'
    || admission?.workflow !== '.github/workflows/release-stable.yml'
    || admission?.entry_selector !== 'studio_carrier_admission'
    || admission?.framework_operation !== null
    || admission?.environment !== 'release-stable'
    || admission?.repository !== 'gaofeng21cn/opl-studio'
    || admission?.carrier !== 'electron_desktop'
    || admission?.framework_bootstrap?.schema !== 'opl_studio_standard_framework_bootstrap.v1'
    || admission?.framework_bootstrap?.framework_ref_input !== 'framework_ref'
    || admission?.framework_bootstrap?.installer_path !== 'resources/opl-framework-bootstrap/opl-install.sh'
    || admission?.framework_bootstrap?.manifest_path !== 'resources/opl-framework-bootstrap/manifest.json'
    || admission?.framework_bootstrap?.installer_url_template !== 'https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/<framework-ref>/install.sh'
    || admission?.framework_bootstrap?.archive_url_template !== 'https://github.com/gaofeng21cn/one-person-lab/archive/<framework-ref>.tar.gz'
    || admission?.framework_bootstrap?.install_source_mode !== 'archive'
    || admission?.framework_bootstrap?.active_shell_adopted !== false
    || admission?.source_admission_is_release_ready !== false
    || admission?.active_release_carrier_after_admission !== false
    || admission?.framework_release_operation_created !== false
    || admission?.second_release_owner_created !== false
    || admission?.secret_custody?.source !== 'one-person-lab-app release-stable protected environment'
    || admission?.secret_custody?.values_read_or_copied_by_admission !== false
    || admission?.secret_custody?.studio_repository_secret_copy_allowed !== false
    || admission?.secret_custody?.execution_capability_preflight_required_before_first_external_mutation !== true
    || admission?.fail_closed_gates?.exact_commit_tree_and_tag_required !== true
    || admission?.fail_closed_gates?.developer_id_application_required !== true
    || admission?.fail_closed_gates?.notarization_status_required !== 'Accepted'
    || admission?.fail_closed_gates?.stapler_validate_required !== true
    || admission?.fail_closed_gates?.dedicated_release_repository_required !== 'gaofeng21cn/opl-studio'
    || admission?.fail_closed_gates?.anonymous_public_byte_readback_required !== true
    || admission?.fail_closed_gates?.any_failed_stage_blocks_later_stages !== true
    || admission?.admission_mutation_policy?.secret_values_accessed !== false
    || admission?.admission_mutation_policy?.notary_submission_allowed !== false
    || admission?.admission_mutation_policy?.release_or_asset_mutation_allowed !== false
    || admission?.admission_mutation_policy?.deployment_allowed !== false
    || admission?.admission_mutation_policy?.publication_allowed !== false
    || successor?.protected_release_execution?.schema !== 'opl_studio_protected_release_execution_policy.v2'
    || successor?.protected_release_execution?.terminal_receipt_schema !== 'opl_studio_protected_release_receipt.v2'
    || studioFullAppend?.schema !== 'opl_studio_full_same_tag_append_policy.v1'
    || studioFullAppend?.authority_owner !== 'one-person-lab-app'
    || studioFullAppend?.repository !== 'gaofeng21cn/opl-studio'
    || studioFullAppend?.workflow !== '.github/workflows/_release-studio-full.yml'
    || studioFullAppend?.entry_workflow !== '.github/workflows/release-stable.yml'
    || studioFullAppend?.operation !== 'append_full'
    || studioFullAppend?.carrier_id !== 'opl-studio'
    || studioFullAppend?.target_release !== 'already_published_mutable_standard_release_same_tag'
    || studioFullAppend?.concurrency_group !== 'opl-studio-publication-global'
    || studioFullAppend?.same_name_same_digest !== 'idempotent_skip'
    || studioFullAppend?.same_name_different_digest !== 'reject_without_mutation'
    || studioFullAppend?.unknown_upload_result !== 'readback_only_no_retry'
    || studioFullAppend?.standard_release_readback?.required !== true
    || studioFullAppend?.standard_release_readback?.mutable !== true
    || studioFullAppend?.standard_release_readback?.published !== true
    || studioFullAppend?.standard_release_readback?.same_tag !== true
    || studioFullAppend?.standard_release_readback?.updater_metadata_must_be_present_in_sealed_standard_assets !== true
    || !sameStringSet(studioFullAppend?.forbidden_mutations, [
      'release_create',
      'release_edit',
      'tag_create',
      'tag_update',
      'release_notes',
      'latest_pointer',
      'latest-mac.yml',
      'latest-arm64-mac.yml',
      'standard_asset_overwrite',
      'standard_asset_delete',
      'full_asset_overwrite',
      'full_asset_delete',
    ])
  ) {
    throw new Error('Studio protected release admission and Full append policy must remain App-owned and fail closed');
  }
  assertDeepEqualJson(
    admission.identity_inputs,
    ['studio_sha', 'studio_tree', 'studio_tag', 'framework_ref'],
    'Studio protected release identity inputs',
  );
  assertDeepEqualJson(
    admission.stage_order,
    [
      'exact_source_checkout',
      'developer_id_signed_build',
      'apple_notarization',
      'staple_and_gatekeeper_validation',
      'exact_tag_publication',
      'anonymous_public_byte_readback',
      'carrier_release_qualification',
    ],
    'Studio protected release stage order',
  );
  assertDeepEqualJson(
    studioFullAppend.required_identity,
    ['studio_sha', 'studio_tree', 'studio_tag', 'studio_version'],
    'Studio Full append identity inputs',
  );
  assertDeepEqualJson(
    studioFullAppend.allowed_assets,
    [
      'one-person-lab-preview-full-<version>-mac-arm64.dmg',
      'opl-release-manifest.json',
    ],
    'Studio Full append allowed assets',
  );
  assertDeepEqualJson(
    studioFullAppend.completion_evidence,
    [
      'exact_studio_full_manifest_identity',
      'exact_full_asset_size_and_digest_readback',
      'standard_asset_set_unchanged',
      'release_notes_unchanged',
      'latest_unchanged',
      'updater_metadata_unchanged',
      'anonymous_public_asset_readback',
    ],
    'Studio Full append completion evidence',
  );
}

function validateDesktopReleaseKernel(kernel) {
  if (
    kernel?.schema !== 'opl_app_desktop_release_kernel.v1'
    || kernel?.authority_owner !== 'one-person-lab-app'
    || kernel?.framework_durable_authority_ref !== 'release_bundle_control_plane.framework_authority'
    || kernel?.implementation !== 'scripts/desktop-release-carrier.ts'
    || kernel?.carrier_manifest_schema !== 'opl_app_desktop_release_carrier.v1'
    || kernel?.carrier_manifest_adapter_path !== 'shell_contract.paths.desktop_release_carrier_manifest'
    || kernel?.toolchain_profile_selector !== 'carrier_id'
    || kernel?.macos?.dmg_format !== 'ULFO'
    || kernel?.macos?.hardened_runtime_required !== true
    || kernel?.updater?.provider !== 'github'
    || kernel?.updater?.compatibility_metadata_byte_identical !== true
    || kernel?.candidate_identity_policy !== 'branded_preview_bundle_until_explicit_active_shell_adoption'
    || kernel?.active_product_bundle_id !== 'cn.onepersonlab.opl'
    || kernel?.studio_preview_bundle_id !== 'cn.onepersonlab.opl.studio.preview'
    || kernel.active_product_bundle_id === kernel.studio_preview_bundle_id
  ) {
    throw new Error('Desktop release kernel must remain App-owned with isolated active and preview product identities');
  }
  assertDeepEqualJson(
    kernel.toolchain_profiles,
    {
      'opl-studio': {
        electron: '44.7.0',
        electron_builder: '26.15.3',
        electron_updater: '6.8.9',
      },
    },
    'Desktop release kernel carrier toolchain profiles',
  );
  assertDeepEqualJson(kernel.macos.targets, ['dmg', 'zip'], 'Desktop release kernel macOS targets');
  assertDeepEqualJson(
    kernel.updater.metadata,
    ['latest-mac.yml', 'latest-arm64-mac.yml'],
    'Desktop release kernel updater metadata',
  );
  assertDeepEqualJson(
    kernel.stage_order,
    [
      'exact_source_checkout',
      'developer_id_signed_build',
      'apple_notarization',
      'staple_and_gatekeeper_validation',
      'exact_tag_publication',
      'anonymous_public_byte_readback',
      'carrier_release_qualification',
    ],
    'Desktop release kernel stage order',
  );
}

function validateOptionalCertificationPolicy(releaseChannel) {
  const policy = releaseChannel?.post_publication_optional_certification;
  const existingRepairVerification = policy?.producer?.existing_repair_verification;
  if (
    policy?.schema !== 'opl_app_optional_certification_policy.v1'
    || policy?.receipt_schema !== 'contracts/app-optional-certification-receipt.schema.json'
    || policy?.validator !== 'scripts/validate-optional-certification-receipt.ts'
    || policy?.required_for_publication !== false
    || policy?.required_for_latest !== false
    || policy?.stable_additive_repair_receipt_schema !== 'opl_app_stable_additive_repair.v1'
    || policy?.stable_additive_repair_requires_clean_linux_install !== true
    || policy?.stable_additive_repair_recertifies_macos_primary_assets !== false
    || policy?.artifact_source !== 'exact_published_release_artifact_with_workflow_cas_and_unified_attestation'
    || policy?.full_artifact_release_source !== 'same_tag_mutable_standard_release'
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
    || existingRepairVerification?.trigger !== 'workflow_dispatch'
    || existingRepairVerification?.operation !== 'verify_existing_repair'
    || existingRepairVerification?.authority_binding !== 'canonical_main_plus_original_successful_stable_source_run_plus_successful_existing_repair_followup_run'
    || JSON.stringify(existingRepairVerification?.required_inputs) !== JSON.stringify([
      'source_run_id', 'followup_run_id', 'verification_source_commit', 'operator_confirmation',
    ])
    || existingRepairVerification?.confirmation !== 'VERIFY EXISTING ADDITIVE REPAIR'
    || JSON.stringify(existingRepairVerification?.workflow_permissions) !== JSON.stringify({ contents: 'read', actions: 'read' })
    || existingRepairVerification?.public_mutation_allowed !== false
    || existingRepairVerification?.new_receipt_or_asset_allowed !== false
    || existingRepairVerification?.reuses_existing_public_repair_receipt !== true
    || existingRepairVerification?.canonical_main_executor_required !== true
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
  const dedicatedAccount = releaseVmSmoke?.dedicated_account_policy;
  const connectedDiagnostic = releaseVmSmoke?.connected_provider_diagnostic;
  if (
    boundary?.schema !== 'opl_release_provider_configuration_boundary.v1'
    || boundary?.default_user_authentication !== 'opl_gateway_account_password'
    || boundary?.api_key_role !== 'explicit_compatibility_only'
    || boundary?.configuration_timing !==
      'user_requested_at_model_use_or_settings_except_protected_release_qualification'
    || independence?.dmg_build_requires_provider_credential !== false
    || independence?.manual_full_m1_requires_provider_credential !== false
    || independence?.local_manual_delivery_requires_provider_credential !== false
    || independence?.manual_full_preview_publication_requires_provider_credential !== false
    || independence?.managed_package_currentness_requires_provider_credential !== false
    || releaseVmSmoke?.default_provider_configuration_status !== 'required_gateway_account_login'
    || releaseVmSmoke?.provider_configuration_is_blocking_release_gate !== true
    || !sameStringSet(releaseVmSmoke?.required_package_profiles, ['standard', 'full'])
    || releaseVmSmoke?.credential_mode !== 'dedicated_release_test_account_files'
    || !sameStringSet(releaseVmSmoke?.credential_variable_names, [
      'OPL_GATEWAY_RELEASE_TEST_ACCOUNT_EMAIL',
    ])
    || !sameStringSet(releaseVmSmoke?.credential_secret_names, [
      'OPL_GATEWAY_RELEASE_TEST_ACCOUNT_PASSWORD',
    ])
    || releaseVmSmoke?.credential_transport !==
      'release-stable environment variable and secret to mode_0600 runner files to guest files then CDP form arguments'
    || !sameStringSet(releaseVmSmoke?.credential_forbidden_surfaces, [
      'command_argv',
      'command_preview',
      'step_summary',
      'stdout',
      'stderr',
      'json_receipt',
      'uploaded_artifact',
    ])
    || releaseVmSmoke?.synthetic_api_key_generation_allowed !== false
    || releaseVmSmoke?.implicit_api_key_file_injection_allowed !== false
    || releaseVmSmoke?.visible_provider_wizard_without_explicit_credential !==
      'fail_closed_for_standard_and_full_release_gate'
    || dedicatedAccount?.personal_or_administrator_account_allowed !== false
    || dedicatedAccount?.required_profile_role !== 'user'
    || dedicatedAccount?.required_account_status !== 'active'
    || dedicatedAccount?.required_balance_amount !== 0
    || dedicatedAccount?.configured_email_must_match_authenticated_profile !== true
    || dedicatedAccount?.live_profile_preflight_required !== true
    || dedicatedAccount?.live_profile_preflight_timing !== 'immediately_before_clean_vm_smoke'
    || dedicatedAccount?.live_profile_endpoint !== '/api/v1/user/profile'
    || dedicatedAccount?.credential_or_token_fields_in_receipt_allowed !== false
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
    throw new Error('Release Provider configuration boundary must keep build/package independence while requiring protected Gateway credentials only for Standard and Full clean-VM gates');
  }
  assertDeepEqualJson(
    releaseVmSmoke.required_release_test_account_preflight_readback,
    ['role=user', 'status=active', 'balance_amount=0', 'profile_email_matches_configured=true'],
    'Release VM dedicated Gateway test account preflight readback',
  );
  assertDeepEqualJson(
    releaseVmSmoke.required_fresh_account_readback,
    ['connected=true', 'account_non_empty', 'managed_key_active', 'stale=false'],
    'Release VM fresh Gateway account readback',
  );
  assertDeepEqualJson(
    releaseVmSmoke.required_official_profile_readback,
    ['status=passed', 'desired_root_package_ids_exact', 'installed_root_package_ids_exact', 'restore_action_invoked=false'],
    'Release VM Official Profile readback',
  );
  assertDeepEqualJson(
    connectedDiagnostic.required_selected_provider_fields,
    ['base_url', 'experimental_bearer_token'],
    'Connected VM Provider credential fields',
  );
}

function validateReleaseCalendarGuard(releaseName) {
  const guard = releaseName?.calendar_guard;
  const stableRevision = releaseName?.stable_revision;
  const releaseIntent = releaseName?.release_intent_policy;
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
  if (
    stableRevision?.eligibility !== 'explicit_user_visible_product_change_only'
    || stableRevision?.release_intent_required !== 'new_product'
    || stableRevision?.nonempty_product_change_summary_required !== true
    || stableRevision?.publication_build_packaging_signing_notarization_notes_homebrew_or_additive_failure_eligible !== false
    || stableRevision?.same_tag_repair_required !== true
    || releaseIntent?.new_tag_requires !== 'release_intent_new_product_and_nonempty_user_visible_product_change_summary'
    || releaseIntent?.current_latest_app_release_must_be_complete_before_new_tag !== true
    || releaseIntent?.same_tag_asset_and_notes_replacement_allowed !== true
    || releaseIntent?.same_tag_mutation_requires_exact_current_identity_cas_and_public_readback !== true
    || releaseIntent?.nonfunctional_release_work_may_allocate_version !== false
  ) {
    throw new Error('Stable tag allocation must require a user-visible product change; publication repair must preserve the tag');
  }
  assertDeepEqualJson(
    releaseIntent?.preserve_existing_tag_for,
    [
      'build_failure',
      'signing_failure',
      'notarization_failure',
      'packaging_failure',
      'publication_failure',
      'release_notes_repair',
      'standard_asset_replacement',
      'full_asset_append_or_replacement',
      'homebrew_repair',
      'additive_platform_repair',
    ],
    'Stable same-tag repair reasons',
  );
}

export {
  validateDesktopReleaseKernel,
  validateOptionalCertificationPolicy,
  validateProviderConfigurationBoundary,
  validateReleaseCalendarGuard,
  validateSuccessorProtectedReleaseAdmission,
};
