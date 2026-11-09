import fs from 'node:fs';

import { resolveActiveShellPaths } from '../../app-shell-adapter.ts';
import { sameStringSet, stringArrayIncludesAll } from './types.ts';

export function validateStandardUpdaterMetadataMigration(releaseContract: any): number {
  const updater = releaseContract?.standard_updater;
  const migration = updater?.metadata_migration;
  if (
    updater?.primary_metadata !== 'latest-mac.yml'
    || !sameStringSet(updater?.allowed_metadata, ['latest-mac.yml', 'latest-arm64-mac.yml'])
    || !sameStringSet(updater?.compatibility_metadata, ['latest-arm64-mac.yml'])
    || migration?.mode !== 'dual_publish_bounded_bridge'
    || migration?.status !== 'bridge_active'
    || migration?.unchanged_public_release !== 'v26.8.8'
    || migration?.successor_client_metadata !== 'latest-mac.yml'
    || migration?.legacy_client_metadata !== 'latest-arm64-mac.yml'
    || migration?.same_bytes_required !== true
    || migration?.retirement_status !== 'planned_not_scheduled'
    || !sameStringSet(migration?.retirement_requires, [
      'publish_at_least_two_qualified_stable_releases_with_both_metadata_assets',
      'qualify_v26.8.8_to_bridge_release_through_latest-arm64-mac.yml',
      'qualify_bridge_release_to_successor_through_latest-mac.yml',
      'declare_bridge_release_or_newer_as_minimum_supported_auto_update_version',
      'retain_homebrew_and_manual_upgrade_for_older_clients',
    ])
  ) {
    console.error('FAIL standard_updater_metadata_migration: native latest-mac.yml and the bounded arm64 compatibility bridge drifted');
    return 1;
  }
  return 0;
}



export function validateGithubReleaseName(releaseContract: Record<string, any>): number {
  const releaseName = releaseContract.github_release_name;
  const calendarGuard = releaseName?.calendar_guard;
  if (
    releaseName?.format !== 'One Person Lab v<version>' ||
    releaseName?.stable_example !== 'One Person Lab v26.6.5' ||
    releaseName?.nightly_example !== 'One Person Lab v26.6.5-nightly' ||
    releaseName?.stable_version_pattern !== '^[0-9]{2}\\.(?:[1-9]|1[0-2])\\.(?:[1-9]|[12][0-9]|3[01])(?:-r[1-9])?$' ||
    releaseName?.nightly_version_pattern !== '^[0-9]{2}\\.(?:[1-9]|1[0-2])\\.(?:[1-9]|[12][0-9]|3[01])-nightly(?:\\.r[1-9])?$' ||
    releaseName?.tag_pattern !== 'v<version>' ||
    releaseName?.stable_revision?.maximum_revision !== 9 ||
    releaseName?.stable_revision?.allocation !== 'explicit_base_plus_highest_existing_remote_revision_plus_one' ||
    releaseName?.stable_revision?.eligibility !== 'explicit_user_visible_product_change_only' ||
    releaseName?.stable_revision?.release_intent_required !== 'new_product' ||
    releaseName?.stable_revision?.nonempty_product_change_summary_required !== true ||
    releaseName?.stable_revision?.publication_build_packaging_signing_notarization_notes_homebrew_or_additive_failure_eligible !== false ||
    releaseName?.stable_revision?.same_tag_repair_required !== true ||
    releaseName?.stable_revision?.additive_platform_full_or_installer_failure_eligible !== false ||
    releaseName?.stable_revision?.additive_failure_route !==
      'repair_in_original_app_release_without_new_version' ||
    releaseName?.release_intent_policy?.new_tag_requires !==
      'release_intent_new_product_and_nonempty_user_visible_product_change_summary' ||
    releaseName?.release_intent_policy?.current_latest_app_release_must_be_complete_before_new_tag !== true ||
    !sameStringSet(releaseName?.release_intent_policy?.preserve_existing_tag_for, [
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
    ]) ||
    releaseName?.release_intent_policy?.same_tag_asset_and_notes_replacement_allowed !== true ||
    releaseName?.release_intent_policy?.same_tag_mutation_requires_exact_current_identity_cas_and_public_readback !== true ||
    releaseName?.release_intent_policy?.nonfunctional_release_work_may_allocate_version !== false ||
    releaseName?.machine_version?.legacy_stable_last_display_version !== '26.7.20' ||
    releaseName?.machine_version?.shared_preview_lane_cutover_display_version !== '26.7.31' ||
    releaseName?.machine_version?.independent_nightly_revision_cutover_display_version !== '26.8.14' ||
    releaseName?.machine_version?.independent_stable_revision_cutover_display_version !== '26.8.14' ||
    releaseName?.machine_version?.stable_patch_formula_before_cutover !== 'day_times_100_plus_revision' ||
    releaseName?.machine_version?.shared_channel_patch_formula_after_cutover !==
      'day_times_100_plus_90_plus_revision' ||
    releaseName?.machine_version?.nightly_patch_offset !== 90 ||
    releaseName?.machine_version?.independent_nightly_machine_patch_offset !== 91 ||
    releaseName?.machine_version?.independent_stable_maximum_revision !== 8 ||
    releaseName?.machine_version?.independent_nightly_display_revision_role !== 'same_day_nightly_rebuild_only' ||
    !sameStringSet(releaseName?.machine_version?.stable_revision_sources_before_independent_cutover, ['stable', 'preview', 'nightly']) ||
    !sameStringSet(releaseName?.machine_version?.stable_revision_sources_after_independent_cutover, ['stable']) ||
    releaseName?.machine_version?.same_revision_stable_outranks_nightly !==
      'semver_release_outranks_prerelease_with_equal_core' ||
    releaseName?.machine_version?.comparison !==
      'semver_core_decimal_integer_segments_then_prerelease_precedence' ||
    releaseName?.machine_version?.bundle_must_bind_both_identities !== true ||
    calendarGuard?.time_zone !== 'Asia/Shanghai' ||
    calendarGuard?.future_dated_versions_allowed !== false ||
    calendarGuard?.failure_mode !== 'fail_closed_before_build_remote_lookup_or_mutation' ||
    JSON.stringify(calendarGuard?.required_entrypoints) !== JSON.stringify([
      'release_version_validation',
      'framework_release_freeze',
      'framework_release_checkpoint_export_import',
      'standard_operation',
      'resume_standard_operation',
      'append_full_operation',
      'latest_activation',
    ])
  ) {
    console.error('FAIL github_release_name: release names must use canonical versions and reject future dates at every build and publish entrypoint');
    return 1;
  }
  return 0;
}



export function validateReleaseAssetIntegrity(releaseContract: Record<string, any>): number {
  const standardDraft = releaseContract.standard_updater?.draft_refresh;
  const fullDraft = releaseContract.full_first_install?.draft_refresh;
  const fullAddon = releaseContract.full_first_install?.published_addon;
  const studioFullAppend = releaseContract.full_first_install?.studio_same_tag_append;
  const fullAddonAssetPolicy = fullAddon?.asset_policy;
  const fullNotarizationRecovery = releaseContract.full_first_install?.production_macos_trust
    ?.unknown_submission_recovery;
  const nightly = releaseContract.nightly_standard;
  const sameDayRebuild = nightly?.same_day_rebuild;
  if (
    standardDraft?.allowed !== true ||
    standardDraft?.published_release_mutation_allowed !== false ||
    standardDraft?.mode !== 'unpublished_draft_prebuilt_assets_upload_clobber' ||
    fullDraft?.allowed !== false ||
    fullDraft?.published_release_mutation_allowed !== false ||
    fullDraft?.mode !== 'retired_independent_full_release_draft_history_only' ||
    fullNotarizationRecovery?.workflow !== '.github/workflows/full-first-install-release.yml#full-finalizer' ||
    fullNotarizationRecovery?.checkpoint_schema !== 'opl_apple_notarization_recovery_checkpoint.v1' ||
    fullNotarizationRecovery?.artifact_name !== 'opl-full-apple-recovery-<version>-<run-id>' ||
    fullNotarizationRecovery?.runs_on_failure_only !== true ||
    fullNotarizationRecovery?.exact_submitted_dmg_bytes_must_be_retained !== true ||
    JSON.stringify(fullNotarizationRecovery?.required_identity_fields) !== JSON.stringify([
      'submission_id',
      'sha256',
      'size_bytes',
    ]) ||
    fullNotarizationRecovery?.resubmission_allowed_before_owner_authoritative_reconcile !== false ||
    fullNotarizationRecovery?.finalize_only_may_consume_only_exact_submitted_bytes !== true ||
    fullNotarizationRecovery?.identity_incomplete_status !== 'diagnostic_only' ||
    fullNotarizationRecovery?.resume_policy !==
      'same_submission_finalize_only_after_owner_authoritative_reconcile' ||
    fullAddon?.operation !== 'append_full' ||
    fullAddon?.workflow !== '.github/workflows/_release-full-addon.yml' ||
    fullAddon?.checkpoint_minimum_stage !== 'standard_built' ||
    fullAddon?.standard_identity_required !== false ||
    fullAddon?.standard_release_readback !==
      'required_exact_mutable_release_and_sealed_standard_asset_set_cas' ||
    fullAddon?.successor_trigger?.workflow !== '.github/workflows/release-stable-post-success-followups.yml' ||
    fullAddon?.successor_trigger?.trigger !== 'successful_standard_publication_or_manual_target_state_reconcile' ||
    fullAddon?.successor_trigger?.one_active_owner_per_standard_recovery_chain !== true ||
    fullAddon?.successor_trigger?.controller !== 'scripts/stable-release-dispatch.ts#append-full' ||
    JSON.stringify(fullAddon?.successor_trigger?.owner_resolution_order) !== JSON.stringify([
      'published_owner',
      'active_owner',
      'latest_reusable_full_checkpoint_with_exact_full_content_cohort',
      'original_standard_checkpoint',
    ]) ||
    fullAddon?.successor_trigger?.operation_kind_source !==
      'opl-release-operation-admission-<source-run-id>/release-operation-admission.json' ||
    !sameStringSet(fullAddon?.successor_trigger?.non_applicable_operation_kinds, ['append_full']) ||
    fullAddon?.successor_trigger?.workflow_dispatch_ref !== 'canonical_main' ||
    fullAddon?.successor_trigger?.executor_head_sha !== 'current_canonical_main' ||
    !sameStringSet(fullAddon?.successor_trigger?.manual_reconcile_inputs, [
      'source_run_id',
      'operation',
      'verification_harness_refs_optional',
    ]) ||
    fullAddon?.successor_trigger?.failed_run_identity_inputs_allowed !== false ||
    fullAddon?.successor_trigger?.completion_boundary !==
      'owner_run_identified_without_waiting_for_full_completion' ||
    fullAddon?.successor_trigger?.blocks_standard_or_desktop_terminal !== false ||
    fullAddon?.framework_operation_receipt_schema !== 'opl_release_bundle_operation_receipt.v1' ||
    fullAddon?.mode !== 'same_tag_mutable_standard_addon' ||
    fullAddon?.standard_release_prerequisite_required !== true ||
    fullAddon?.carrier_identity?.base_release_tag !== 'exact_existing_mutable_standard_target' ||
    fullAddon?.carrier_identity?.full_release_tag !== 'same_as_base_release_tag' ||
    fullAddon?.carrier_identity?.new_release_or_tag_allowed !== false ||
    fullAddon?.carrier_identity?.full_content_identity_source !==
      'opl-release-manifest.json#carrier_context.full_content_sources' ||
    fullAddon?.carrier_identity?.standard_reference_role !== 'same_release_append_target_and_asset_cas' ||
    fullAddon?.carrier_identity?.workflows_write_permission_required !== false ||
    fullAddon?.carrier_identity?.base_release_asset_append_allowed !== true ||
    fullAddon?.carrier_identity?.base_release_asset_overwrite_or_delete_allowed !== false ||
    fullAddon?.carrier_identity?.latest_mutation_allowed !== false ||
    fullAddon?.carrier_identity?.release_notes_mutation_allowed !== true ||
    fullAddon?.carrier_identity?.release_notes_mutation_scope !==
      'idempotent_full_availability_section_after_exact_full_asset_readback' ||
    fullAddon?.carrier_identity?.publication_sequence !==
      'inspect_exact_mutable_standard_cas_upload_missing_full_assets_readback_patch_full_availability_readback' ||
    !sameStringSet(fullAddonAssetPolicy?.required_assets, [
      'One-Person-Lab-Full-<version>-mac-arm64.dmg',
      'opl-release-manifest.json',
    ]) ||
    fullAddonAssetPolicy?.additional_assets_allowed !== true ||
    fullAddonAssetPolicy?.same_name_same_digest !== 'already_complete' ||
    fullAddonAssetPolicy?.same_name_different_digest !== 'reject_without_mutation' ||
    fullAddonAssetPolicy?.duplicate_name !== 'reject_without_mutation' ||
    fullAddonAssetPolicy?.metadata !== 'positive_size_and_sha256_digest_required' ||
    fullAddonAssetPolicy?.name !== 'basename_only_without_path_separator_control_character_or_empty_name' ||
    fullAddonAssetPolicy?.standard_assets_modified !== false ||
    fullAddon?.same_name_same_digest !== 'already_complete' ||
    fullAddon?.same_name_different_digest !== 'reject_without_mutation' ||
    fullAddon?.standard_assets_modified !== false ||
    fullAddon?.updater_metadata_modified !== false ||
    fullAddon?.release_notes_modified !== true ||
    fullAddon?.release_notes_visibility !==
      'full_download_url_digest_size_and_manifest_required_after_exact_asset_readback' ||
    !sameStringSet(fullAddon?.target_standard_reference?.required_fields, [
      'repository',
      'release_id',
      'tag',
      'target_commitish',
      'immutable',
      'standard_asset_set',
      'standard_attestation',
    ]) ||
    !sameStringSet(fullAddon?.target_standard_reference?.cas_timing, [
      'before_full_build',
      'immediately_before_same_tag_append',
      'after_each_asset_upload',
      'after_full_availability_notes_patch',
    ]) ||
    fullAddon?.target_standard_reference?.cross_component_compatibility_gate_allowed !== false ||
    fullAddon?.target_standard_reference?.base_assets_overwrite_or_delete_allowed !== false ||
    fullAddon?.target_standard_reference?.target_immutable_required !== false ||
    fullAddon?.attestation_binding !==
      'opl-release-manifest.json binds opl-release-attestation.json digest and exact Full asset name/size/digest' ||
    fullAddon?.latest_modified !== false ||
    fullAddon?.source_or_bom_change_requires_new_version !== true ||
    studioFullAppend?.schema !== 'opl_studio_full_same_tag_append_policy.v1' ||
    studioFullAppend?.authority_owner !== 'one-person-lab-app' ||
    studioFullAppend?.repository !== 'gaofeng21cn/opl-studio' ||
    studioFullAppend?.workflow !== '.github/workflows/_release-studio-full.yml' ||
    studioFullAppend?.entry_workflow !== '.github/workflows/release-stable.yml' ||
    studioFullAppend?.operation !== 'append_full' ||
    studioFullAppend?.carrier_id !== 'opl-studio' ||
    studioFullAppend?.target_release !== 'already_published_mutable_standard_release_same_tag' ||
    studioFullAppend?.concurrency_group !== 'opl-studio-publication-global' ||
    !sameStringSet(studioFullAppend?.required_identity, [
      'studio_sha', 'studio_tree', 'studio_tag', 'studio_version',
    ]) ||
    !sameStringSet(studioFullAppend?.allowed_assets, [
      'one-person-lab-preview-full-<version>-mac-arm64.dmg',
      'opl-release-manifest.json',
    ]) ||
    studioFullAppend?.same_name_same_digest !== 'idempotent_skip' ||
    studioFullAppend?.same_name_different_digest !== 'reject_without_mutation' ||
    studioFullAppend?.unknown_upload_result !== 'readback_only_no_retry' ||
    studioFullAppend?.standard_release_readback?.required !== true ||
    studioFullAppend?.standard_release_readback?.mutable !== true ||
    studioFullAppend?.standard_release_readback?.published !== true ||
    studioFullAppend?.standard_release_readback?.same_tag !== true ||
    studioFullAppend?.standard_release_readback?.updater_metadata_must_be_present_in_sealed_standard_assets !== true ||
    !sameStringSet(studioFullAppend?.forbidden_mutations, [
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
    ]) ||
    !sameStringSet(studioFullAppend?.completion_evidence, [
      'exact_studio_full_manifest_identity',
      'exact_full_asset_size_and_digest_readback',
      'standard_asset_set_unchanged',
      'release_notes_unchanged',
      'latest_unchanged',
      'updater_metadata_unchanged',
      'anonymous_public_asset_readback',
    ]) ||
    nightly?.status !== 'implemented' ||
    nightly?.publication_available !== true ||
    nightly?.mutation_available !== true ||
    nightly?.new_version_allocation_allowed !== true ||
    nightly?.historical_tag_and_receipt_parsing_allowed !== true ||
    nightly?.workflow !== '.github/workflows/release-nightly.yml' ||
    nightly?.followup_workflow !== '.github/workflows/release-nightly-followups.yml' ||
    !sameStringSet(nightly?.followup_operations, ['reconcile_homebrew', 'run_sampled_vm']) ||
    nightly?.default_trigger !== 'daily_schedule' ||
    JSON.stringify(nightly?.development_validation_trigger) !== JSON.stringify({
      event: 'workflow_dispatch',
      authority: 'user_explicit',
      confirmation: 'publish_nonlatest_nightly',
      execution_path: 'same_as_scheduled_nightly',
    }) ||
    nightly?.stable_bundle_authority_used !== false ||
    nightly?.stable_mutation_mutex_used !== false ||
    nightly?.heavy_vm_blocks_publication !== false ||
    nightly?.include_full !== false ||
    nightly?.tag_pattern !== 'v<YY.M.D>-nightly[.r<1-9>]' ||
    sameDayRebuild?.first_release_suffix !== null ||
    sameDayRebuild?.suffix_pattern !== '.r<revision>' ||
    sameDayRebuild?.first_revision !== 1 ||
    sameDayRebuild?.maximum_revision !== 9 ||
    sameDayRebuild?.allocation !== 'highest_existing_same_day_nightly_tag_or_release_plus_one' ||
    sameDayRebuild?.legacy_run_identity_counts_as_existing_release !== true ||
    sameDayRebuild?.github_actions_run_identity_in_version !== false ||
    sameDayRebuild?.exhaustion_policy !== 'fail_closed' ||
    nightly?.prerelease !== true ||
    nightly?.quality_status !== 'preview' ||
    nightly?.build_trigger !== 'automated' ||
    nightly?.preview_kind !== 'nightly' ||
    nightly?.scheduled_latest_release_allowed !== false ||
    nightly?.explicit_user_override_may_move_latest !== true
  ) {
    console.error('FAIL release_asset_integrity: Stable and same-tag Full must preserve digest-bound assets while Nightly remains non-Latest');
    return 1;
  }
  return 0;
}



export function validateLocalInstallReleaseProfile(releaseContract: Record<string, any>): number {
  const profile = releaseContract.release_profiles?.local_install;
  const expectedRequiredLanes = [
    'release_source_gate',
    'release_boundary',
    'standard_build',
    'local_install_handoff',
    'installed_app_readback',
  ];
  const expectedForbiddenLanes = [
    'publish_standard',
    'publish_full_assets',
    'remote_verify_standard_and_full',
    'standard_dmg_clean_vm_smoke',
    'full_dmg_clean_vm_smoke',
    'homebrew_standard_cask_clean_vm_smoke',
    'docker_webui_smoke',
    'webui_ghcr_publish',
    'release_evidence_bundle',
    'release_readiness_summary',
    'release_candidate_record',
    'promote_stable_release',
    'stable_homebrew_tap_update',
    'full_homebrew_tap_update',
    'release_promotion_record',
    'post_release_user_guide_screenshots',
  ];
  const expectedForbiddenRequirements = [
    'github_release_publish',
    'ghcr_publish',
    'clean_vm',
    'attestation',
    'notarization',
    'homebrew_distribution',
    'stable_promotion',
  ];
  let failures = 0;

  if (
    releaseContract.release_profiles?.default !== 'stable' ||
    !sameStringSet(releaseContract.release_profiles?.allowed, ['stable', 'local-install']) ||
    releaseContract.release_profiles?.unavailable?.nightly?.status !== 'legacy_planner_profile_retired' ||
    releaseContract.release_profiles?.unavailable?.nightly?.scope !== 'release_candidate_planner_profile_only' ||
    releaseContract.release_profiles?.unavailable?.nightly?.publication_available !== false ||
    releaseContract.release_profiles?.unavailable?.nightly?.mutation_available !== false ||
    profile?.plan_profile !== 'local_install' ||
    profile?.version_channel !== 'stable' ||
    profile?.distribution_scope !== 'local_machine_only'
  ) {
    console.error('FAIL local_install_release_profile: release profiles must expose local-install as a local-machine-only Stable-version plan');
    failures += 1;
  }
  if (
    profile?.build_command !== 'npm run build-mac:arm64' ||
    profile?.build_app_path !== '$SHELL_ROOT/out/mac-arm64/One Person Lab.app' ||
    profile?.installed_app_path !== '/Applications/One Person Lab.app' ||
    profile?.second_qa_authorization_required !== false
  ) {
    console.error('FAIL local_install_release_profile: local build, installed App path, and direct QA handoff must be canonical');
    failures += 1;
  }
  if (!sameStringSet(profile?.required_lanes, expectedRequiredLanes)) {
    console.error('FAIL local_install_release_profile: local-install must require only source, boundary, build, install handoff, and installed readback lanes');
    failures += 1;
  }
  if (!sameStringSet(profile?.forbidden_lanes, expectedForbiddenLanes)) {
    console.error('FAIL local_install_release_profile: every public-distribution and promotion lane must remain forbidden');
    failures += 1;
  }
  if (!sameStringSet(profile?.forbidden_external_requirements, expectedForbiddenRequirements)) {
    console.error('FAIL local_install_release_profile: public publish, GHCR, VM, attestation, notarization, Homebrew, and promotion must stay outside local-install');
    failures += 1;
  }
  if (
    !Array.isArray(profile?.installed_readback) ||
    !stringArrayIncludesAll(profile.installed_readback, [
      'bundle_version',
      'codesign_diagnostic',
      'installed_app_asar_sha256_matches_build',
      'startup_and_runtime_bridge_logs',
    ]) ||
    typeof profile?.authority_boundary !== 'string' ||
    !profile.authority_boundary.includes('cannot publish or promote a release') ||
    !profile.authority_boundary.includes('cannot claim clean-VM or attestation evidence')
  ) {
    console.error('FAIL local_install_release_profile: installed readback and non-public authority boundary are incomplete');
    failures += 1;
  }

  return failures;
}



export function validateReleaseExecutionTracks(releaseContract: Record<string, any>): number {
  const policy = releaseContract.release_execution_tracks;
  const local = policy?.tracks?.local;
  const remote = policy?.tracks?.remote;
  const parity = policy?.artifact_parity;
  const isolation = policy?.development_isolation;
  const standardLatestRequirements = [
    'One-Person-Lab-<version>-mac-arm64.dmg',
    'One-Person-Lab-<version>-mac-arm64.zip',
    'One-Person-Lab-<version>-mac-arm64.zip.blockmap',
    'latest-mac.yml',
    'latest-arm64-mac.yml',
    'opl-app-component-manifest.json',
    'opl-install.sh',
    'opl-release-attestation.json',
    'install-docker-webui.sh',
    'install-docker-webui.ps1',
    'prepared_ai_release_notes',
  ];
  const fullRequirements = [
    'One-Person-Lab-Full-<version>-mac-arm64.dmg',
    'opl-release-manifest.json',
  ];
  const fullForbiddenMutations = [
    'standard_assets',
    'latest-mac.yml',
    'latest-arm64-mac.yml',
    'release_notes',
    'latest_selection',
  ];

  if (
    policy?.orthogonal_to_release_profiles !== true ||
    policy?.local_install_profile_is_not_local_publish_track !== true ||
    !sameStringSet(policy?.default_sequence, [
      'local_development_debug_build_and_same_artifact_qualification',
      'remote_routine_release_and_continuous_reproducibility_proof',
    ]) ||
    local?.routine_during_development !== true ||
    local?.publication_requires_explicit_authorization !== true ||
    local?.may_publish_canonical_release_assets !== true ||
    local?.must_use_frozen_release_worktree !== true ||
    local?.must_not_block_canonical_main_or_unrelated_worktrees !== true ||
    remote?.default_publication_track !== true ||
    remote?.must_consume_or_produce_the_same_artifact_contract !== true ||
    remote?.must_not_create_track_specific_public_assets !== true
  ) {
    console.error('FAIL release_execution_tracks: local must accelerate development and authorized fallback publication while remote remains the routine equivalent publication path');
    return 1;
  }

  if (
    parity?.canonical_public_asset_set_per_version !== 1 ||
    parity?.same_selected_app_artifact_identity_required !== true ||
    parity?.cross_component_version_sha_or_cohort_equality_may_gate_install_or_runtime !== false ||
    parity?.track_handoff_requires_exact_asset_digests !== true ||
    parity?.same_public_names_roles_and_install_behavior_required !== true ||
    parity?.same_standard_updater_metadata_contract_required !== true ||
    parity?.same_prepared_ai_release_notes_required !== true ||
    parity?.track_specific_user_visible_assets_allowed !== false ||
    !sameStringSet(parity?.standard_latest_activation_requires, standardLatestRequirements) ||
    parity?.full_addon_may_follow_latest_asynchronously !== true ||
    !sameStringSet(parity?.full_addon_requires, fullRequirements) ||
    parity?.full_is_standard_updater_target !== false ||
    !sameStringSet(parity?.adding_full_must_not_modify, fullForbiddenMutations)
  ) {
    console.error('FAIL release_execution_tracks: both tracks must publish one equivalent Standard set plus unified attestation while Full remains an updater-invisible same-tag add-on');
    return 1;
  }

  if (
    isolation?.release_source !== 'immutable detached checkout or release-owned worktree' ||
    isolation?.canonical_main_write_lock_required_during_build_or_qualification !== false ||
    isolation?.normal_development_may_continue !== true ||
    typeof isolation?.rule !== 'string' ||
    !isolation.rule.includes('must never reserve the development root')
  ) {
    console.error('FAIL release_execution_tracks: release work must read a frozen checkout without blocking canonical main or unrelated development');
    return 1;
  }

  return 0;
}



export function validatePreparedNotesTransportPolicy(releaseContract: Record<string, any>): number {
  const preparedNotes = releaseContract.release_bundle_control_plane?.prepared_notes;
  const environmentControl = releaseContract.release_bundle_control_plane?.protected_environment_control;
  if (
    preparedNotes?.provider_transport_attempt_limit_per_request !== 3 ||
    !sameStringSet(preparedNotes?.provider_transport_retry_scope, [
      'timeout', 'connection_error', 'http_429', 'http_5xx',
    ]) ||
    preparedNotes?.provider_content_or_quality_failure_may_transport_retry !== false ||
    preparedNotes?.failure_receipt_schema !== 'opl_app_release_notes_prepare_receipt.v1' ||
    preparedNotes?.failure_receipt_uploaded_when_writer_started !== true ||
    preparedNotes?.prebuild_failure_must_not_project_as_qualification_runner_lost !== true ||
    preparedNotes?.full_intent_source !== 'stable_post_success_successor_workflow' ||
    preparedNotes?.full_intent_admitted_input !== 'successful_standard_workflow_run' ||
    preparedNotes?.full_intent_must_match_before_append_full_admission !== true
  ) {
    console.error('FAIL prepared_notes_transport: bounded transport retry, typed failure receipts, and admitted Full intent binding are incomplete');
    return 1;
  }
  if (
    environmentControl?.environment !== 'release-stable' ||
    environmentControl?.canonical_branch_policy !== 'main' ||
    environmentControl?.canonical_branch_policy_count !== 1 ||
    environmentControl?.daily_codex_credential_may_mutate !== false ||
    environmentControl?.temporary_policy_rewrite_as_circuit_breaker_allowed !== false ||
    environmentControl?.workflow_or_adapter_fail_close_required !== true ||
    environmentControl?.new_cancel_operation_allowed !== false ||
    environmentControl?.legacy_cancel_surface_may_authorize_mutation !== false ||
    environmentControl?.noncanonical_operation_allowed !== false ||
    environmentControl?.deviation_requires_durable_emergency_containment_receipt !== true ||
    !sameStringSet(environmentControl?.historical_deviation_receipts, [
      'docs/delivery/release/incidents/2026-07-21-v26.7.21-notes-intent-containment.json',
    ]) ||
    !sameStringSet(environmentControl?.emergency_containment_receipt_required_fields, [
      'actor',
      'recorded_at',
      'policy_change.previous',
      'policy_change.temporary',
      'run.id',
      'reason',
    ]) ||
    environmentControl?.temporary_policy_must_be_removed_after_first_protected_publish_failure !== true ||
    environmentControl?.restoration_requires_get_readback !== true ||
    typeof environmentControl?.rule !== 'string' ||
    !environmentControl.rule.includes('cannot rewrite this verifier') ||
    !environmentControl.rule.includes('no legacy cancel or session surface can authorize a mutation')
  ) {
    console.error('FAIL protected_environment_control: release-stable must retain one main policy and reject legacy cancel/session mutation authority');
    return 1;
  }
  return 0;
}



export function validateStandardUpdaterCompressionPolicy(appRoot: string, releaseContract: Record<string, any>): number {
  let failures = 0;
  const compression = releaseContract.standard_updater?.dmg_compression;
  const shellPaths = resolveActiveShellPaths();
  const electronBuilderConfig = fs.readFileSync(shellPaths.electronBuilderConfigPath, 'utf8');

  if (
    compression?.default_format !== 'ULFO' ||
    compression?.format_owner !== `${shellPaths.contract.shell_root}/${shellPaths.contract.shell_contract.paths.electron_builder_config}#dmg.format` ||
    compression?.electron_builder_version !== '26.18.0' ||
    compression?.ulmo_standard_default_allowed !== false ||
    compression?.ulmo_postprocess_status !== 'separate_experiment_required' ||
    !sameStringSet(compression?.electron_builder_supported_formats, ['UDBZ', 'UDCO', 'UDRO', 'UDRW', 'UDZO', 'ULFO'])
  ) {
    console.error('FAIL standard_updater_dmg_compression: standard DMG compression must default to electron-builder-supported ULFO and keep ULMO as a separate experiment');
    failures += 1;
  }
  if (!/dmg:[\s\S]*format:\s+ULFO/.test(electronBuilderConfig)) {
    console.error('FAIL standard_updater_dmg_compression: active shell electron-builder.yml must use ULFO for standard DMGs');
    failures += 1;
  }
  if (
    typeof compression?.metadata_blockmap_gate !== 'string' ||
    !compression.metadata_blockmap_gate.includes('validate-release.ts') ||
    !compression.metadata_blockmap_gate.includes('hdiutil imageinfo/verify') ||
    typeof compression?.rule !== 'string' ||
    !compression.rule.includes('does not accept ULMO') ||
    !compression.rule.includes('ZIP blockmap') ||
    !compression.rule.includes('latest-arm64-mac.yml')
  ) {
    console.error('FAIL standard_updater_dmg_compression: compression policy must preserve updater metadata and blockmap verification boundaries');
    failures += 1;
  }

  return failures;
}



export function validateStandardUpdaterCandidateSelection(releaseContract: Record<string, any>): number {
  const selection = releaseContract.standard_updater?.candidate_selection;
  if (
    selection?.schema !== 'opl_app_updater_candidate_selection.v1'
    || selection?.updater_version_field !== 'updaterVersion'
    || selection?.sort_authority !== 'valid_updater_version_semver'
    || selection?.latest_pointer_is_not_candidate_sort_authority !== true
    || selection?.nightly_is_not_an_independent_user_channel !== true
    || !sameStringSet(selection?.stable?.allowed_quality_statuses, ['stable'])
    || selection?.stable?.candidate_union !== 'stable_only'
    || !sameStringSet(selection?.preview?.allowed_quality_statuses, ['stable', 'preview'])
    || !sameStringSet(selection?.preview?.allowed_preview_kinds, ['dev', 'nightly'])
    || selection?.preview?.candidate_union !== 'stable_plus_preview_and_nightly'
    || selection?.preview?.higher_stable_may_supersede_preview_or_nightly !== true
    || JSON.stringify(selection?.monotonicity) !== JSON.stringify({
      comparison: 'semver',
      machine_version_contract_ref: 'github_release_name.machine_version',
      candidate_lower_than_installed: 'reject',
      candidate_equal_to_installed: 'no_op',
      candidate_higher_than_installed: 'update',
      invalid_or_missing_updater_version: 'reject',
      superseding_stable_must_exceed_published_nightly: true,
      published_nightly_baseline_sources: [
        'durable_publication_record',
        'candidate_metadata',
      ],
      superseding_comparison: 'strictly_greater_updater_version_semver',
      lower_or_equal_superseding_stable: 'reject',
    })
  ) {
    console.error(
      'FAIL standard_updater_candidate_selection: Stable must remain Stable-only while Preview selects the highest valid Stable or Preview/Nightly updaterVersion independently of Latest',
    );
    return 1;
  }
  return 0;
}
