type PlatformContract = Record<string, any> | undefined;
type MatchList = (actual: unknown, expected: string[]) => boolean;

export const developmentValidationOnlyCapabilityIds = [
  'macos-x64',
  'macos-universal',
  'linux-arm64',
  'windows-arm64',
];
export const releasePlatformCapabilityIds = [
  'macos-arm64',
  'macos-x64',
  'macos-universal',
  'linux-x64',
  'linux-arm64',
  'windows-x64',
  'windows-arm64',
];

export const stableRequiredPlatformIds = ['macos-arm64'];
export const additionalDesktopPlatformIds = ['linux-x64', 'windows-x64'];
export const previewPlatformIds = ['macos-arm64', 'linux-x64'];
export const windowsValidationTestPaths = [
  'tests/release/docker-webui-clean-windows-dispatch.test.ts',
  'tests/release/docker-webui-native-windows-smoke.test.ts',
  'tests/release/docker-webui-windows-installer.test.ts',
  'tests/release/docker-webui-windows-validation-fixtures.test.ts',
  'tests/release/windows-platform-factory-contract.test.ts',
  'tests/release/windows-stable-surface.test.ts',
  'tests/release/windows-updater-upgrade-vm.test.ts',
  'tests/release/windows-wsl2-validation-fixtures.test.ts',
];

export function desktopPlatformFollowerDrifted(matrix: PlatformContract, matchesList: MatchList): boolean {
  const desktopSelection = matrix?.stable_desktop_additional_selection;
  const desktopFollower = matrix?.desktop_platform_additive_follower;
  const additiveRepair = desktopFollower?.stable_additive_repair;
  return (
    desktopSelection?.authority_field !== 'opl_app_stable_operation_authority.v1#desktop_additional_platforms'
    || desktopSelection?.control_field !== 'opl_app_stable_operation_control.v1#desktop_additional_platforms'
    || desktopSelection?.arbitrary_command_or_os_input_allowed !== false
    || desktopFollower?.carrier !== 'same_mutable_stable_release_assets'
    || desktopFollower?.workflow !== '.github/workflows/release-stable-post-success-followups.yml'
    || desktopFollower?.platform_workflow !== '.github/workflows/_release-desktop-platform-addon.yml'
    || desktopFollower?.builder !== '.github/workflows/build-manual.yml'
    || desktopFollower?.base_release_must_be_published_mutable !== true
    || desktopFollower?.new_release_or_tag_allowed !== false
    || desktopFollower?.same_name_different_digest !== 'fail_closed'
    || desktopFollower?.platform_manifest_schema !== 'opl_app_desktop_platform_manifest.v1'
    || desktopFollower?.aggregate_manifest_schema !== 'opl_app_desktop_artifact_manifest.v1'
    || desktopFollower?.execution !== 'one_independent_fail_fast_false_matrix_lane_per_platform'
    || desktopFollower?.build_mutex !== null
    || desktopFollower?.public_append_mutex !== 'opl-release-bundle-global'
    || desktopFollower?.aggregate_manifest_replacement !==
      'staged_exact_asset_id_size_digest_compare_and_swap_then_rename'
    || desktopFollower?.asset_upload_order !== 'platform_assets_before_aggregate_manifest'
    || desktopFollower?.same_platform_same_digest !== 'already_complete'
    || desktopFollower?.manual_reconcile?.operation !== 'reconcile_desktop_platform'
    || !matchesList(desktopFollower?.manual_reconcile?.inputs, ['source_run_id', 'desktop_platform'])
    || desktopFollower?.manual_reconcile?.failed_run_or_generation_input_allowed !== false
    || desktopFollower?.manual_reconcile?.new_tag_allowed !== false
    || desktopFollower?.make_latest !== false
    || desktopFollower?.base_release_asset_append_allowed !== true
    || additiveRepair?.operation !== 'repair_additive'
    || !matchesList(additiveRepair?.allowed_asset_names, ['opl-install.sh'])
    || additiveRepair?.new_release_or_tag_allowed !== false
    || additiveRepair?.version_allocator_used !== false
    || additiveRepair?.macos_primary_assets_frozen !== true
    || additiveRepair?.updater_metadata_frozen !== true
    || additiveRepair?.release_body_frozen !== true
    || additiveRepair?.tag_target_frozen !== true
  );
}

export function sameTagFullFollowerDrifted(follower: PlatformContract, matchesList: MatchList): boolean {
  return (
    follower?.workflow !== '.github/workflows/release-stable-post-success-followups.yml'
    || follower?.trigger !== 'successful_standard_publication_or_manual_target_state_reconcile'
    || follower?.source_policy !== 'full_artifact_self_identity_plus_exact_mutable_standard_asset_set_cas'
    || follower?.standard_release_prerequisite_required !== true
    || follower?.cross_component_exact_version_sha_or_cohort_binding_allowed !== false
    || follower?.compatibility_contract_ref !==
      'contracts/app-install-exposure-policy.json#component_interoperability.compatibility_admission'
    || follower?.carrier !== 'same_standard_release_assets'
    || follower?.tag_derivation !== 'none_use_exact_standard_tag'
    || follower?.new_release_or_tag_allowed !== false
    || follower?.target_release_must_be_mutable !== true
    || follower?.standard_asset_or_latest_mutation_allowed !== false
    || !matchesList(follower?.target_standard_reference?.required_fields, [
      'repository',
      'release_id',
      'tag',
      'target_commitish',
      'immutable',
      'standard_asset_set',
      'standard_attestation',
    ])
    || follower?.target_standard_reference?.purpose !== 'same_release_append_target_and_standard_asset_cas'
    || follower?.target_standard_reference?.cross_component_compatibility_gate_allowed !== false
    || follower?.target_standard_reference?.base_assets_mutation_allowed !== false
    || follower?.blocks_stable_base_terminal !== false
    || follower?.blocks_latest_activation !== false
    || follower?.recovery !== 'target_state_reconcile_with_current_canonical_executor_and_no_failed_run_inputs'
    || follower?.automatic_checkpoint_reuse !==
      'latest_nonexpired_full_or_append_operation_checkpoint_with_exact_full_content_cohort_in_the_standard_recovery_chain'
    || follower?.one_active_owner_per_recovery_chain !== true
  );
}

export function windowsUpdaterPublicationDrifted(updater: PlatformContract): boolean {
  return (
    updater?.build_validator !==
      'scripts/validate-windows-updater-assets.ts'
    || updater?.authenticode_required_for_publication !== false
    || updater?.unsigned_publication_allowed !== true
    || updater?.code_signing_status_must_be_explicit !== true
    || updater?.runtime_resolver !==
      'opl-studio/desktop/updater.mjs'
    || updater?.base_stable_asset_append_allowed !== true
    || updater?.latest_pointer_mutation_allowed !== false
  );
}
