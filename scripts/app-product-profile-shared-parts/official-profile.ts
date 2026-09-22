import type { OfficialProfileLike, OfficialProfileValidationOptions } from './types.ts';

export function assertOfficialProfileShape(
  value: unknown,
  label: string,
  options: OfficialProfileValidationOptions = {},
): asserts value is OfficialProfileLike & { desired_root_package_ids: string[] } {
  const fail = options.fail ?? ((message: string): never => {
    throw new Error(message);
  });
  const officialProfile = value as OfficialProfileLike | undefined;
  if (
    officialProfile?.profile_id !== 'opl-official'
    || officialProfile?.authority !== 'one-person-lab-app'
    || officialProfile?.additional_official_profiles_allowed !== false
    || officialProfile?.user_composed_profiles_allowed !== true
    || officialProfile?.user_removal_policy?.explicit_uninstall_is_persistent_preference !== true
    || officialProfile?.user_removal_policy?.reinstall_before_explicit_restore_allowed !== false
    || officialProfile?.composition_policy?.required_dependency_resolution
      !== 'expand_required_package_and_capability_identities_by_presence'
    || officialProfile?.composition_policy?.optional_dependency_absence_blocks !== false
    || officialProfile?.composition_policy?.composition_gate !== 'identity_presence_only'
    || officialProfile?.distribution_forms?.standard?.desired_roots_source
      !== 'official_profile.desired_root_package_ids'
    || officialProfile?.distribution_forms?.standard?.offline_seed !== false
    || officialProfile?.distribution_forms?.full?.desired_roots_source
      !== 'official_profile.desired_root_package_ids'
    || officialProfile?.distribution_forms?.full?.offline_seed !== true
    || officialProfile?.distribution_forms?.same_desired_roots_required !== true
    || officialProfile?.distribution_forms?.full_difference !== 'offline_seed_only'
    || officialProfile?.distribution_forms?.full_additional_desired_roots_allowed !== false
    || officialProfile?.package_currentness_policy?.published_current_stable_authority
      !== 'package_owner_declared_publication_or_configured_native_carrier'
    || officialProfile?.package_currentness_policy?.installed_callable_authority
      !== 'framework_fresh_aggregation_of_configured_carrier_readback'
    || officialProfile?.package_currentness_policy?.app_carrier_authority !== false
    || officialProfile?.package_currentness_policy?.app_release_authority !== false
    || officialProfile?.package_currentness_policy?.shared_release_set_ordinary_update_authority !== false
  ) {
    fail(`${label} must be singular, presence-only, carrier-neutral, and shared by Standard and Full`);
  }

  const desiredRoots = officialProfile.desired_root_package_ids;
  if (
    !Array.isArray(desiredRoots)
    || desiredRoots.length === 0
    || desiredRoots.some((packageId) => typeof packageId !== 'string' || !packageId.trim())
  ) {
    fail(`${label} desired roots must be a non-empty string array`);
  }
  if (new Set(desiredRoots).size !== desiredRoots.length) {
    fail(`${label} desired roots must be unique`);
  }

  const exactArrays = [
    {
      actual: officialProfile.apply_on,
      expected: ['first_install', 'explicit_restore'],
      field: 'apply_on',
    },
    {
      actual: officialProfile.never_apply_on,
      expected: ['app_startup', 'silent_package_update', 'app_update'],
      field: 'never_apply_on',
    },
    {
      actual: officialProfile.composition_policy?.forbidden_composition_or_readiness_gates,
      expected: [
        'version_range',
        'abi',
        'lock',
        'payload',
        'digest',
        'release_set',
        'fixed_cohort',
        'global_product_readiness',
      ],
      field: 'forbidden gates',
    },
  ];
  for (const { actual, expected, field } of exactArrays) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail(`${label} ${field} must equal ${JSON.stringify(expected)}`);
    }
  }
}

export function assertLocalizedUxOverrideShape(value: unknown, label: string): void {
  const localized = value as Record<string, unknown> | undefined;
  if (
    !localized
    || typeof localized !== 'object'
    || Array.isArray(localized)
    || typeof localized['zh-CN'] !== 'string'
    || !localized['zh-CN'].trim()
    || typeof localized['en-US'] !== 'string'
    || !localized['en-US'].trim()
  ) {
    throw new Error(`${label} must declare non-empty zh-CN and en-US text`);
  }
}
