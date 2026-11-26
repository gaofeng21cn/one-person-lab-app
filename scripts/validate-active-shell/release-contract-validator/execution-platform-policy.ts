import {
  additionalDesktopPlatformIds,
  desktopPlatformFollowerDrifted,
  developmentValidationOnlyCapabilityIds,
  previewPlatformIds,
  releasePlatformCapabilityIds,
  sameTagFullFollowerDrifted,
  stableRequiredPlatformIds,
  windowsUpdaterPublicationDrifted,
  windowsValidationTestPaths,
} from '../../release-platform-validation.ts';
import { assertDeepEqualJson } from '../assertions.ts';

function matchesOrderedList(actual: unknown, expected: string[]): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

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
  const windowsUpdater = platformMatrix?.desktop_platform_additive_follower?.windows_x64_updater_assets;
  assertDeepEqualJson(
    Object.keys(capabilities ?? {}).sort(),
    releasePlatformCapabilityIds.slice().sort(),
    'Release platform capabilities',
  );
  assertDeepEqualJson(
    policies?.stable_required?.platforms,
    stableRequiredPlatformIds,
    'Stable required platform policy',
  );
  assertDeepEqualJson(
    policies?.nightly_standard?.platforms,
    stableRequiredPlatformIds,
    'Nightly required platform policy',
  );
  assertDeepEqualJson(
    policies?.preview_standard?.platforms,
    previewPlatformIds,
    'Preview required platform policy',
  );
  assertDeepEqualJson(
    policies?.stable_desktop_additional?.platforms,
    additionalDesktopPlatformIds,
    'Stable additional Desktop platform policy',
  );
  if (validationProfile !== 'stable') {
    assertDeepEqualJson(
      platformMatrix?.validation_ownership?.windows?.owned_test_paths,
      windowsValidationTestPaths,
      'Windows validation ownership',
    );
  }
  const publicationCapabilityIds = validationProfile === 'stable'
    ? ['macos-arm64', 'linux-x64', 'windows-x64']
    : validationProfile === 'windows'
      ? ['windows-x64', 'windows-arm64']
      : releasePlatformCapabilityIds;
  if (
    platformMatrix?.schema !== 'opl_app_release_platform_matrix.v1'
    || platformMatrix?.resolver !== 'scripts/resolve-release-platform-matrix.ts'
    || platformMatrix?.release_tiers?.primary?.carrier !== 'desktop_macos_arm64'
    || JSON.stringify(platformMatrix?.release_tiers?.primary?.platforms) !== JSON.stringify(stableRequiredPlatformIds)
    || platformMatrix?.release_tiers?.primary?.blocks_base_terminal !== true
    || JSON.stringify(platformMatrix?.release_tiers?.additional_nonblocking?.desktop_platforms) !==
      JSON.stringify(additionalDesktopPlatformIds)
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
      JSON.stringify(additionalDesktopPlatformIds)
    || platformMatrix?.validation_ownership?.stable?.excluded_profile !== 'windows'
    || desktopPlatformFollowerDrifted(platformMatrix, matchesOrderedList)
    || windowsUpdaterPublicationDrifted(windowsUpdater)
    || windowsUpdater?.updater_version_source !==
      'exact_standard_bundle_release_updater_version'
    || windowsUpdater?.authenticode_receipt !==
      'opl-windows-authenticode-receipt.json'
    || windowsUpdater?.upgrade_vm_qualification?.workflow !==
      '.github/workflows/windows-updater-upgrade-vm-preflight.yml'
    || windowsUpdater?.upgrade_vm_qualification?.admission_validator !==
      'scripts/validate-windows-updater-upgrade-vm-admission.ts'
    || windowsUpdater?.upgrade_vm_qualification?.host_dry_run_harness !==
      'scripts/Test-OPLWindowsUpdaterUpgradeVM.ps1'
    || windowsUpdater?.upgrade_vm_qualification?.cross_component_exact_cohort_required !== false
    || windowsUpdater?.upgrade_vm_qualification?.compatibility_receipt_schema !==
      'opl_component_compatibility_receipt.v1'
    || JSON.stringify(windowsUpdater?.upgrade_vm_qualification?.compatibility_requirement_kinds) !==
      JSON.stringify(['capability_id_with_versioned_schema', 'minimum_version', 'semver_range'])
    || windowsUpdater?.upgrade_vm_qualification?.runner_offline_or_busy !==
      'typed_not_ready_without_queue'
    || windowsUpdater?.upgrade_vm_qualification?.factory_authority !==
      'existing_opl_windows_vm_lease_v2_and_clean_vm_attestation_v2_only'
    || windowsUpdater?.upgrade_vm_qualification?.current_execute_available !== false
    || windowsUpdater?.upgrade_vm_qualification?.publication_or_install_authority_granted_by_preflight !== false
    || windowsUpdater?.upgrade_vm_qualification?.blocks_stable_or_latest !== false
    || sameTagFullFollowerDrifted(platformMatrix?.full_macos_additive_follower, matchesOrderedList)
  ) {
    throw new Error('Release platform matrix must keep only macOS ARM64 Stable-blocking while platform followers and the same-tag Full module remain non-blocking');
  }

}

export { validateReleasePlatformMatrix };
