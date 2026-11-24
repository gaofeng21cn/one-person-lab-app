import { sameStringSet } from './types.ts';
import type { ReleaseValidationProfile } from '../release-checks.ts';

export function validateReleasePlatformMatrix(
  releaseContract: Record<string, any>,
  profile: ReleaseValidationProfile = 'aggregate',
): number {
  const matrix = releaseContract.release_platform_matrix;
  const capabilities = matrix?.capabilities;
  const policies = matrix?.policies;
  let failures = 0;
  const requiredCapabilityIds = ['macos-arm64'];
  const windowsCapabilityIds = ['windows-x64', 'windows-arm64'];
  const developmentValidationOnlyCapabilityIds = [
    'macos-x64',
    'macos-universal',
    'linux-arm64',
    'windows-arm64',
  ];
  const capabilityIds = [
    'macos-arm64',
    'macos-x64',
    'macos-universal',
    'linux-x64',
    'linux-arm64',
    'windows-x64',
    'windows-arm64',
  ];
  if (
    matrix?.schema !== 'opl_app_release_platform_matrix.v1'
    || matrix?.resolver !== 'scripts/resolve-release-platform-matrix.ts'
    || !sameStringSet(Object.keys(capabilities ?? {}), capabilityIds)
  ) {
    console.error('FAIL release_platform_matrix: one canonical resolver must own every declared build capability');
    failures += 1;
    return failures;
  }

  const validatedCapabilityIds = profile === 'stable'
    ? requiredCapabilityIds
    : profile === 'windows'
      ? windowsCapabilityIds
      : capabilityIds;
  for (const id of validatedCapabilityIds) {
    const capability = capabilities[id];
    if (
      typeof capability?.default_enabled !== 'boolean'
      || typeof capability?.stable_allowed !== 'boolean'
      || typeof capability?.blocks_stable !== 'boolean'
      || capability?.build_available !== true
      || capability?.build_route !== '.github/workflows/_build-reusable.yml'
      || !Array.isArray(capability?.quality_channels)
      || capability.quality_channels.length === 0
      || typeof capability?.publication_status !== 'string'
      || !(
        typeof capability?.publication_route === 'string'
        || (
          developmentValidationOnlyCapabilityIds.includes(id)
          && capability?.publication_route === null
        )
      )
      || !capability?.build?.os
      || !capability?.build?.command
      || !capability?.build?.arch
      || !capability?.build?.artifact_names
    ) {
      console.error(`FAIL release_platform_matrix: capability ${id} is incomplete`);
      failures += 1;
    }
    if (String(capability?.publication_status ?? '').includes('unavailable')) {
      console.error(`FAIL release_platform_matrix: capability ${id} must retain a real publication route`);
      failures += 1;
    }
  }

  for (const id of requiredCapabilityIds) {
    const capability = capabilities[id];
    if (
      capability.default_enabled !== true
      || capability.stable_allowed !== true
      || capability.blocks_stable !== true
    ) {
      console.error(`FAIL release_platform_matrix: ${id} must be a default Stable blocker`);
      failures += 1;
    }
  }
  for (const id of ['macos-x64', 'macos-universal', 'linux-arm64', 'windows-arm64']) {
    const capability = capabilities[id];
    if (capability.default_enabled !== false || capability.blocks_stable !== false) {
      console.error(`FAIL release_platform_matrix: ${id} must remain default-off and non-blocking`);
      failures += 1;
    }
  }
  for (const id of developmentValidationOnlyCapabilityIds) {
    const capability = capabilities[id];
    if (
      capability?.stable_allowed !== false
      || capability?.publication_status !== 'development_validation_only'
      || capability?.publication_route !== null
      || !capability?.quality_channels?.includes('development_validation')
    ) {
      console.error(`FAIL release_platform_matrix: ${id} must remain development-validation-only and unpublished`);
      failures += 1;
    }
  }
  if (
    capabilities['linux-x64'].default_enabled !== true
    || capabilities['linux-x64'].stable_allowed !== true
    || capabilities['linux-x64'].blocks_stable !== false
    || !capabilities['linux-x64'].quality_channels.includes('stable')
    || capabilities['linux-x64'].publication_route !== '.github/workflows/build-manual.yml'
    || capabilities['linux-x64'].publication_status !== 'same_app_release'
    || capabilities['windows-x64'].default_enabled !== true
    || capabilities['windows-x64'].stable_allowed !== true
    || capabilities['windows-x64'].blocks_stable !== false
    || !capabilities['windows-x64'].quality_channels.includes('stable')
    || capabilities['windows-x64'].publication_route !== '.github/workflows/build-manual.yml'
    || capabilities['windows-x64'].publication_status !== 'same_app_release'
  ) {
    console.error('FAIL release_platform_matrix: Linux x64 and Windows x64 must be non-blocking members of the Stable Desktop artifact');
    failures += 1;
  }
  const policyAssertions: Array<[string, string[], boolean, boolean]> = [
    ['stable_required', ['macos-arm64'], true, true],
    ['nightly_standard', ['macos-arm64'], true, true],
    ['preview_standard', ['macos-arm64', 'linux-x64'], true, true],
    ['stable_desktop_additional', ['linux-x64', 'windows-x64'], false, false],
  ].filter(([name]) => (
    profile === 'aggregate'
    || profile === 'stable'
  )) as Array<[string, string[], boolean, boolean]>;
  for (const [name, platforms, required, blocks] of policyAssertions) {
    const policy = policies?.[name];
    if (
      !sameStringSet(policy?.platforms, platforms)
      || policy?.required !== required
      || policy?.blocks_base_terminal !== blocks
    ) {
      console.error(`FAIL release_platform_matrix: policy ${name} drifted`);
      failures += 1;
    }
  }
  if (profile === 'aggregate' && !sameStringSet(policies?.manual_all?.platforms, capabilityIds)) {
    console.error('FAIL release_platform_matrix: manual_all must preserve every build capability');
    failures += 1;
  }
  if (
    policies?.stable_desktop_additional?.selection_mode !== 'capability_default_enabled_only'
    || !sameStringSet(
      matrix?.stable_desktop_additional_selection?.default,
      ['linux-x64', 'windows-x64'],
    )
    || matrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.build_validator !==
      'scripts/validate-windows-updater-assets.ts'
    || !sameStringSet(
      matrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.required_assets,
      [
        'One-Person-Lab-<display-version>-win-x64.exe',
        'One-Person-Lab-<display-version>-win-x64.exe.blockmap',
        'latest.yml',
        'opl-windows-updater-assets.json',
      ],
    )
    || matrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.authenticode_required_for_publication !== false
    || matrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.authenticode_gate !==
      'optional_when_present_then_Get-AuthenticodeSignature_status_valid_with_timestamp_countersignature_and_exact_installer_digest'
    || matrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.unsigned_publication_allowed !== true
    || matrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.code_signing_status_must_be_explicit !== true
    || matrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.runtime_resolver !==
      'opl-studio/desktop/updater.mjs'
    || matrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.base_stable_asset_append_allowed !== true
    || matrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.latest_pointer_mutation_allowed !== false
    || releaseContract.release_platform_matrix?.validation_ownership?.stable?.excluded_profile !==
      'windows'
    || (
      profile !== 'stable'
      && !sameStringSet(
        releaseContract.release_platform_matrix?.validation_ownership?.windows
          ?.owned_test_paths,
        [
          'tests/release/docker-webui-clean-windows-dispatch.test.ts',
          'tests/release/docker-webui-native-windows-smoke.test.ts',
          'tests/release/docker-webui-windows-installer.test.ts',
          'tests/release/docker-webui-windows-validation-fixtures.test.ts',
          'tests/release/windows-platform-factory-contract.test.ts',
          'tests/release/windows-stable-surface.test.ts',
          'tests/release/windows-updater-upgrade-vm.test.ts',
          'tests/release/windows-wsl2-validation-fixtures.test.ts',
        ],
      )
    )
  ) {
    console.error('FAIL release_platform_matrix: additional Desktop selection and validation ownership must be contract-audited');
    failures += 1;
  }

  const follower = matrix.full_macos_additive_follower;
  if (
    follower?.workflow !== '.github/workflows/release-stable-post-success-followups.yml'
    || follower?.trigger !== 'successful_standard_publication_or_manual_target_state_reconcile'
    || follower?.source_policy !== 'full_artifact_self_identity_plus_exact_mutable_standard_asset_set_cas'
    || follower?.standard_release_prerequisite_required !== true
    || follower?.cross_component_exact_version_sha_or_cohort_binding_allowed !== false
    || follower?.compatibility_contract_ref !==
      'contracts/app-install-exposure-policy.json#component_interoperability.compatibility_admission'
    || follower?.operation !== 'append_full'
    || follower?.carrier !== 'same_standard_release_assets'
    || follower?.tag_derivation !== 'none_use_exact_standard_tag'
    || follower?.new_release_or_tag_allowed !== false
    || follower?.target_release_must_be_mutable !== true
    || follower?.manifest !== 'opl-release-manifest.json'
    || follower?.standard_asset_or_latest_mutation_allowed !== false
    || !sameStringSet(follower?.target_standard_reference?.required_fields, [
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
    || follower?.failure_receipt_required !== true
    || follower?.recovery !== 'target_state_reconcile_with_current_canonical_executor_and_no_failed_run_inputs'
    || follower?.automatic_checkpoint_reuse !==
      'latest_nonexpired_full_or_append_operation_checkpoint_with_exact_full_content_cohort_in_the_standard_recovery_chain'
    || follower?.one_active_owner_per_recovery_chain !== true
  ) {
    console.error('FAIL release_platform_matrix: Full macOS follower must remain same-tag, mutable-target CAS-bound, durable, and non-blocking');
    failures += 1;
  }
  const desktopSelection = matrix.stable_desktop_additional_selection;
  const desktopFollower = matrix.desktop_platform_additive_follower;
  const additiveRepair = desktopFollower?.stable_additive_repair;
  if (
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
    || !sameStringSet(desktopFollower?.manual_reconcile?.inputs, ['source_run_id', 'desktop_platform'])
    || desktopFollower?.manual_reconcile?.failed_run_or_generation_input_allowed !== false
    || desktopFollower?.manual_reconcile?.new_tag_allowed !== false
    || desktopFollower?.make_latest !== false
    || desktopFollower?.base_release_asset_append_allowed !== true
    || additiveRepair?.workflow !== '.github/workflows/release-stable-post-success-followups.yml'
    || additiveRepair?.operation !== 'repair_additive'
    || additiveRepair?.protected_environment !== 'release-stable'
    || !sameStringSet(additiveRepair?.allowed_asset_names, ['opl-install.sh'])
    || additiveRepair?.new_release_or_tag_allowed !== false
    || additiveRepair?.version_allocator_used !== false
    || additiveRepair?.macos_primary_assets_frozen !== true
    || additiveRepair?.updater_metadata_frozen !== true
    || additiveRepair?.release_body_frozen !== true
    || additiveRepair?.tag_target_frozen !== true
    || !sameStringSet(additiveRepair?.current_asset_cas_fields, ['asset_id', 'size', 'sha256'])
    || additiveRepair?.receipt_schema !== 'opl_app_stable_additive_repair.v1'
    || additiveRepair?.certification !==
      'same_tag_public_installer_digest_chain_and_clean_linux_install'
  ) {
    console.error('FAIL release_platform_matrix: additional Desktop selection and same-Release carrier must remain authority-bound');
    failures += 1;
  }

  const stableRequiredLanes = releaseContract.release_validation_profiles?.stable?.required_lanes;
  if (
    !stableRequiredLanes?.includes('standard_macos_arm64_build')
    || stableRequiredLanes?.includes('standard_linux_x64_build')
  ) {
    console.error('FAIL release_platform_matrix: Stable validation must require only the macOS ARM64 platform build');
    failures += 1;
  }
  const nightlyRequiredLanes = releaseContract.release_validation_profiles?.nightly_standard?.required_lanes;
  if (
    !nightlyRequiredLanes?.includes('standard_macos_arm64_build')
    || nightlyRequiredLanes?.includes('standard_linux_x64_build')
  ) {
    console.error('FAIL release_platform_matrix: Nightly validation must require only macOS ARM64');
    failures += 1;
  }
  return failures;
}


