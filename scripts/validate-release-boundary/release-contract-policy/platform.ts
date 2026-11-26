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
import { sameStringSet } from './types.ts';
import type { ReleaseValidationProfile } from '../release-checks.ts';

export function validateReleasePlatformMatrix(
  releaseContract: Record<string, any>,
  profile: ReleaseValidationProfile = 'aggregate',
): number {
  const matrix = releaseContract.release_platform_matrix;
  const capabilities = matrix?.capabilities;
  const policies = matrix?.policies;
  const windowsUpdater = matrix?.desktop_platform_additive_follower?.windows_x64_updater_assets;
  let failures = 0;
  const windowsCapabilityIds = ['windows-x64', 'windows-arm64'];
  if (
    matrix?.schema !== 'opl_app_release_platform_matrix.v1'
    || matrix?.resolver !== 'scripts/resolve-release-platform-matrix.ts'
    || !sameStringSet(Object.keys(capabilities ?? {}), releasePlatformCapabilityIds)
  ) {
    console.error('FAIL release_platform_matrix: one canonical resolver must own every declared build capability');
    failures += 1;
    return failures;
  }

  const validatedCapabilityIds = profile === 'stable'
    ? stableRequiredPlatformIds
    : profile === 'windows'
      ? windowsCapabilityIds
      : releasePlatformCapabilityIds;
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

  for (const id of stableRequiredPlatformIds) {
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
  for (const id of developmentValidationOnlyCapabilityIds) {
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
    ['stable_required', stableRequiredPlatformIds, true, true],
    ['nightly_standard', stableRequiredPlatformIds, true, true],
    ['preview_standard', previewPlatformIds, true, true],
    ['stable_desktop_additional', additionalDesktopPlatformIds, false, false],
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
  if (profile === 'aggregate' && !sameStringSet(policies?.manual_all?.platforms, releasePlatformCapabilityIds)) {
    console.error('FAIL release_platform_matrix: manual_all must preserve every build capability');
    failures += 1;
  }
  if (
    policies?.stable_desktop_additional?.selection_mode !== 'capability_default_enabled_only'
    || !sameStringSet(
      matrix?.stable_desktop_additional_selection?.default,
      additionalDesktopPlatformIds,
    )
    || windowsUpdaterPublicationDrifted(windowsUpdater)
    || !sameStringSet(
      windowsUpdater?.required_assets,
      [
        'One-Person-Lab-<display-version>-win-x64.exe',
        'One-Person-Lab-<display-version>-win-x64.exe.blockmap',
        'latest.yml',
        'opl-windows-updater-assets.json',
      ],
    )
    || windowsUpdater?.authenticode_gate !==
      'optional_when_present_then_Get-AuthenticodeSignature_status_valid_with_timestamp_countersignature_and_exact_installer_digest'
    || releaseContract.release_platform_matrix?.validation_ownership?.stable?.excluded_profile !==
      'windows'
    || (
      profile !== 'stable'
      && !sameStringSet(
        releaseContract.release_platform_matrix?.validation_ownership?.windows
          ?.owned_test_paths,
        windowsValidationTestPaths,
      )
    )
  ) {
    console.error('FAIL release_platform_matrix: additional Desktop selection and validation ownership must be contract-audited');
    failures += 1;
  }

  const follower = matrix.full_macos_additive_follower;
  if (
    sameTagFullFollowerDrifted(follower, sameStringSet)
    || follower?.operation !== 'append_full'
    || follower?.manifest !== 'opl-release-manifest.json'
    || follower?.failure_receipt_required !== true
  ) {
    console.error('FAIL release_platform_matrix: Full macOS follower must remain same-tag, mutable-target CAS-bound, durable, and non-blocking');
    failures += 1;
  }
  const additiveRepair = matrix.desktop_platform_additive_follower?.stable_additive_repair;
  if (
    desktopPlatformFollowerDrifted(matrix, sameStringSet)
    || additiveRepair?.workflow !== '.github/workflows/release-stable-post-success-followups.yml'
    || additiveRepair?.protected_environment !== 'release-stable'
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


