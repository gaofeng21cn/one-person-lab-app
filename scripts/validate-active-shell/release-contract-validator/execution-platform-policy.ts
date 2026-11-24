import { assertDeepEqualJson } from '../assertions.ts';

function validateReleasePlatformMatrix(releaseChannel, shellPaths, validationProfile) {
  const stableValidation = releaseChannel?.release_validation_profiles?.stable;
  const nightlyValidation = releaseChannel?.release_validation_profiles?.nightly_standard;
  assertDeepEqualJson(
    stableValidation?.post_publication_optional_certification_surfaces,
    [
      'stable_shell_upgrade_routes',
      'homebrew_standard_cask_clean_vm_smoke',
      'one_shot_app_installer_fresh_install_smoke',
    ],
    'Stable post-publication optional certification surfaces',
  );
  assertDeepEqualJson(
    stableValidation?.same_candidate_prepublication_clean_install_gates,
    ['standard_dmg_clean_vm_smoke', 'full_dmg_clean_vm_smoke'],
    'Stable same-candidate clean-install gates',
  );
  assertDeepEqualJson(
    stableValidation?.hosted_post_publication_optional_certification_surfaces,
    ['linux_x64_same_artifact_install_smoke'],
    'Stable hosted post-publication optional certification surfaces',
  );
  if (
    stableValidation?.addon_gate_blocking_standard_terminal !== false ||
    !stableValidation?.addon_lanes?.includes('full_dmg_clean_vm_smoke') ||
    stableValidation?.diagnostic_lanes?.includes('full_dmg_clean_vm_smoke') ||
    !stableValidation?.required_lanes?.includes('standard_macos_arm64_build') ||
    !stableValidation?.required_lanes?.includes('standard_dmg_clean_vm_smoke') ||
    stableValidation?.required_lanes?.includes('standard_linux_x64_build') ||
    !nightlyValidation?.required_lanes?.includes('standard_macos_arm64_build') ||
    nightlyValidation?.required_lanes?.includes('standard_dmg_clean_vm_smoke') ||
    nightlyValidation?.required_lanes?.includes('standard_linux_x64_build')
  ) {
    throw new Error(
      'Standard and Full clean-install gates must protect only their respective Stable track; '
      + 'Stable and Nightly core validation must remain macOS ARM64-only',
    );
  }
  const platformMatrix = releaseChannel?.release_platform_matrix;
  const capabilities = platformMatrix?.capabilities;
  const policies = platformMatrix?.policies;
  const capabilityIds = [
    'macos-arm64',
    'macos-x64',
    'macos-universal',
    'linux-x64',
    'linux-arm64',
    'windows-x64',
    'windows-arm64',
  ];
  const developmentValidationOnlyCapabilityIds = [
    'macos-x64',
    'macos-universal',
    'linux-arm64',
    'windows-arm64',
  ];
  assertDeepEqualJson(
    Object.keys(capabilities ?? {}).sort(),
    capabilityIds.slice().sort(),
    'Release platform capabilities',
  );
  assertDeepEqualJson(
    policies?.stable_required?.platforms,
    ['macos-arm64'],
    'Stable required platform policy',
  );
  assertDeepEqualJson(
    policies?.nightly_standard?.platforms,
    ['macos-arm64'],
    'Nightly required platform policy',
  );
  assertDeepEqualJson(
    policies?.preview_standard?.platforms,
    ['macos-arm64', 'linux-x64'],
    'Preview required platform policy',
  );
  assertDeepEqualJson(
    policies?.stable_desktop_additional?.platforms,
    ['linux-x64', 'windows-x64'],
    'Stable additional Desktop platform policy',
  );
  if (validationProfile !== 'stable') {
    assertDeepEqualJson(
      platformMatrix?.validation_ownership?.windows?.owned_test_paths,
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
      'Windows validation ownership',
    );
  }
  const publicationCapabilityIds = validationProfile === 'stable'
    ? ['macos-arm64', 'linux-x64', 'windows-x64']
    : validationProfile === 'windows'
      ? ['windows-x64', 'windows-arm64']
      : capabilityIds;
  if (
    platformMatrix?.schema !== 'opl_app_release_platform_matrix.v1'
    || platformMatrix?.resolver !== 'scripts/resolve-release-platform-matrix.ts'
    || platformMatrix?.release_tiers?.primary?.carrier !== 'desktop_macos_arm64'
    || JSON.stringify(platformMatrix?.release_tiers?.primary?.platforms) !== JSON.stringify(['macos-arm64'])
    || platformMatrix?.release_tiers?.primary?.blocks_base_terminal !== true
    || JSON.stringify(platformMatrix?.release_tiers?.additional_nonblocking?.desktop_platforms) !==
      JSON.stringify(['linux-x64', 'windows-x64'])
    || JSON.stringify(platformMatrix?.release_tiers?.additional_nonblocking?.container_webui?.platforms) !==
      JSON.stringify(['linux/amd64', 'linux/arm64'])
    || platformMatrix?.release_tiers?.additional_nonblocking?.container_webui?.single_multi_arch_manifest_required !== true
    || platformMatrix?.release_tiers?.additional_nonblocking?.container_webui?.native_runner_qualification_required !== true
    || platformMatrix?.release_tiers?.additional_nonblocking?.container_webui?.qualification_trigger !== 'stable_standard_or_manual_non_public_qualification_or_protected_repair'
    || platformMatrix?.release_tiers?.additional_nonblocking?.container_webui?.included_in_pr_or_main_ci !== false
    || platformMatrix?.release_tiers?.additional_nonblocking?.container_webui?.blocks_desktop_macos_arm64 !== false
    || platformMatrix?.release_tiers?.additional_nonblocking?.container_webui?.required_for_stable_terminal !== true
    || capabilities?.['macos-arm64']?.default_enabled !== true
    || capabilities?.['macos-arm64']?.blocks_stable !== true
    || capabilities?.['linux-x64']?.default_enabled !== true
    || capabilities?.['linux-x64']?.stable_allowed !== true
    || capabilities?.['linux-x64']?.blocks_stable !== false
    || !capabilities?.['linux-x64']?.quality_channels?.includes('stable')
    || capabilities?.['windows-x64']?.default_enabled !== true
    || capabilities?.['windows-x64']?.stable_allowed !== true
    || capabilities?.['windows-x64']?.blocks_stable !== false
    || !capabilities?.['windows-x64']?.quality_channels?.includes('stable')
    || capabilities?.['windows-x64']?.publication_status !== 'same_app_release'
    || capabilities?.['windows-x64']?.publication_route !== '.github/workflows/build-manual.yml'
    || capabilities?.['windows-arm64']?.default_enabled !== false
    || capabilities?.['windows-arm64']?.stable_allowed !== false
    || capabilities?.['windows-arm64']?.blocks_stable !== false
    || developmentValidationOnlyCapabilityIds.some((capabilityId) =>
      capabilities?.[capabilityId]?.stable_allowed !== false
      || capabilities?.[capabilityId]?.publication_status !== 'development_validation_only'
      || capabilities?.[capabilityId]?.publication_route !== null
      || !capabilities?.[capabilityId]?.quality_channels?.includes('development_validation')
    )
    || publicationCapabilityIds.some((capabilityId) =>
      !(
        typeof capabilities?.[capabilityId]?.publication_route === 'string'
        || (
          developmentValidationOnlyCapabilityIds.includes(capabilityId)
          && capabilities?.[capabilityId]?.publication_route === null
        )
      )
      || capabilities?.[capabilityId]?.publication_status?.includes('unavailable')
    )
    || policies?.stable_desktop_additional?.selection_mode !== 'capability_default_enabled_only'
    || JSON.stringify(platformMatrix?.stable_desktop_additional_selection?.default) !==
      JSON.stringify(['linux-x64', 'windows-x64'])
    || platformMatrix?.validation_ownership?.stable?.excluded_profile !== 'windows'
    || platformMatrix?.stable_desktop_additional_selection?.authority_field !==
      'opl_app_stable_operation_authority.v1#desktop_additional_platforms'
    || platformMatrix?.stable_desktop_additional_selection?.control_field !==
      'opl_app_stable_operation_control.v1#desktop_additional_platforms'
    || platformMatrix?.stable_desktop_additional_selection?.arbitrary_command_or_os_input_allowed !== false
    || platformMatrix?.desktop_platform_additive_follower?.carrier !==
      'same_mutable_stable_release_assets'
    || platformMatrix?.desktop_platform_additive_follower?.workflow !==
      '.github/workflows/release-stable-post-success-followups.yml'
    || platformMatrix?.desktop_platform_additive_follower?.platform_workflow !==
      '.github/workflows/_release-desktop-platform-addon.yml'
    || platformMatrix?.desktop_platform_additive_follower?.builder !==
      '.github/workflows/build-manual.yml'
    || platformMatrix?.desktop_platform_additive_follower?.base_release_must_be_published_mutable !== true
    || platformMatrix?.desktop_platform_additive_follower?.new_release_or_tag_allowed !== false
    || platformMatrix?.desktop_platform_additive_follower?.same_name_different_digest !== 'fail_closed'
    || platformMatrix?.desktop_platform_additive_follower?.platform_manifest_schema !==
      'opl_app_desktop_platform_manifest.v1'
    || platformMatrix?.desktop_platform_additive_follower?.aggregate_manifest_schema !==
      'opl_app_desktop_artifact_manifest.v1'
    || platformMatrix?.desktop_platform_additive_follower?.execution !==
      'one_independent_fail_fast_false_matrix_lane_per_platform'
    || platformMatrix?.desktop_platform_additive_follower?.build_mutex !== null
    || platformMatrix?.desktop_platform_additive_follower?.public_append_mutex !== 'opl-release-bundle-global'
    || platformMatrix?.desktop_platform_additive_follower?.aggregate_manifest_replacement !==
      'staged_exact_asset_id_size_digest_compare_and_swap_then_rename'
    || platformMatrix?.desktop_platform_additive_follower?.asset_upload_order !==
      'platform_assets_before_aggregate_manifest'
    || platformMatrix?.desktop_platform_additive_follower?.same_platform_same_digest !== 'already_complete'
    || platformMatrix?.desktop_platform_additive_follower?.manual_reconcile?.operation !==
      'reconcile_desktop_platform'
    || JSON.stringify(platformMatrix?.desktop_platform_additive_follower?.manual_reconcile?.inputs) !==
      JSON.stringify(['source_run_id', 'desktop_platform'])
    || platformMatrix?.desktop_platform_additive_follower?.manual_reconcile?.failed_run_or_generation_input_allowed !== false
    || platformMatrix?.desktop_platform_additive_follower?.manual_reconcile?.new_tag_allowed !== false
    || platformMatrix?.desktop_platform_additive_follower?.base_release_asset_append_allowed !== true
    || platformMatrix?.desktop_platform_additive_follower?.make_latest !== false
    || platformMatrix?.desktop_platform_additive_follower?.stable_additive_repair?.operation !==
      'repair_additive'
    || JSON.stringify(platformMatrix?.desktop_platform_additive_follower?.stable_additive_repair?.allowed_asset_names) !==
      JSON.stringify(['opl-install.sh'])
    || platformMatrix?.desktop_platform_additive_follower?.stable_additive_repair?.new_release_or_tag_allowed !== false
    || platformMatrix?.desktop_platform_additive_follower?.stable_additive_repair?.version_allocator_used !== false
    || platformMatrix?.desktop_platform_additive_follower?.stable_additive_repair?.macos_primary_assets_frozen !== true
    || platformMatrix?.desktop_platform_additive_follower?.stable_additive_repair?.updater_metadata_frozen !== true
    || platformMatrix?.desktop_platform_additive_follower?.stable_additive_repair?.release_body_frozen !== true
    || platformMatrix?.desktop_platform_additive_follower?.stable_additive_repair?.tag_target_frozen !== true
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.build_validator !==
      'scripts/validate-windows-updater-assets.ts'
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.updater_version_source !==
      'exact_standard_bundle_release_updater_version'
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.authenticode_required_for_publication !== false
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.authenticode_receipt !==
      'opl-windows-authenticode-receipt.json'
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.unsigned_publication_allowed !== true
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.code_signing_status_must_be_explicit !== true
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.runtime_resolver !==
      'opl-studio/desktop/updater.mjs'
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.base_stable_asset_append_allowed !== true
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.latest_pointer_mutation_allowed !== false
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.upgrade_vm_qualification?.workflow !==
      '.github/workflows/windows-updater-upgrade-vm-preflight.yml'
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.upgrade_vm_qualification?.admission_validator !==
      'scripts/validate-windows-updater-upgrade-vm-admission.ts'
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.upgrade_vm_qualification?.host_dry_run_harness !==
      'scripts/Test-OPLWindowsUpdaterUpgradeVM.ps1'
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.upgrade_vm_qualification?.cross_component_exact_cohort_required !== false
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.upgrade_vm_qualification?.compatibility_receipt_schema !==
      'opl_component_compatibility_receipt.v1'
    || JSON.stringify(platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.upgrade_vm_qualification?.compatibility_requirement_kinds) !==
      JSON.stringify(['capability_id_with_versioned_schema', 'minimum_version', 'semver_range'])
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.upgrade_vm_qualification?.runner_offline_or_busy !==
      'typed_not_ready_without_queue'
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.upgrade_vm_qualification?.factory_authority !==
      'existing_opl_windows_vm_lease_v2_and_clean_vm_attestation_v2_only'
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.upgrade_vm_qualification?.current_execute_available !== false
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.upgrade_vm_qualification?.publication_or_install_authority_granted_by_preflight !== false
    || platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets?.upgrade_vm_qualification?.blocks_stable_or_latest !== false
    || platformMatrix?.full_macos_additive_follower?.workflow !==
      '.github/workflows/release-stable-post-success-followups.yml'
    || platformMatrix?.full_macos_additive_follower?.trigger !==
      'successful_standard_publication_or_manual_target_state_reconcile'
    || platformMatrix?.full_macos_additive_follower?.source_policy !==
      'full_artifact_self_identity_plus_exact_mutable_standard_asset_set_cas'
    || platformMatrix?.full_macos_additive_follower?.standard_release_prerequisite_required !== true
    || platformMatrix?.full_macos_additive_follower?.cross_component_exact_version_sha_or_cohort_binding_allowed !== false
    || platformMatrix?.full_macos_additive_follower?.compatibility_contract_ref !==
      'contracts/app-install-exposure-policy.json#component_interoperability.compatibility_admission'
    || platformMatrix?.full_macos_additive_follower?.carrier !== 'same_standard_release_assets'
    || platformMatrix?.full_macos_additive_follower?.tag_derivation !== 'none_use_exact_standard_tag'
    || platformMatrix?.full_macos_additive_follower?.new_release_or_tag_allowed !== false
    || platformMatrix?.full_macos_additive_follower?.target_release_must_be_mutable !== true
    || JSON.stringify(platformMatrix?.full_macos_additive_follower?.target_standard_reference?.required_fields) !==
      JSON.stringify(['repository', 'release_id', 'tag', 'target_commitish', 'immutable', 'standard_asset_set', 'standard_attestation'])
    || platformMatrix?.full_macos_additive_follower?.target_standard_reference?.purpose !==
      'same_release_append_target_and_standard_asset_cas'
    || platformMatrix?.full_macos_additive_follower?.target_standard_reference?.cross_component_compatibility_gate_allowed !== false
    || platformMatrix?.full_macos_additive_follower?.target_standard_reference?.base_assets_mutation_allowed !== false
    || platformMatrix?.full_macos_additive_follower?.standard_asset_or_latest_mutation_allowed !== false
    || platformMatrix?.full_macos_additive_follower?.blocks_stable_base_terminal !== false
    || platformMatrix?.full_macos_additive_follower?.blocks_latest_activation !== false
    || platformMatrix?.full_macos_additive_follower?.recovery !==
      'target_state_reconcile_with_current_canonical_executor_and_no_failed_run_inputs'
    || platformMatrix?.full_macos_additive_follower?.automatic_checkpoint_reuse !==
      'latest_nonexpired_full_or_append_operation_checkpoint_with_exact_full_content_cohort_in_the_standard_recovery_chain'
    || platformMatrix?.full_macos_additive_follower?.one_active_owner_per_recovery_chain !== true
  ) {
    throw new Error('Release platform matrix must keep only macOS ARM64 Stable-blocking while platform followers and the same-tag Full module remain non-blocking');
  }

}

export { validateReleasePlatformMatrix };
