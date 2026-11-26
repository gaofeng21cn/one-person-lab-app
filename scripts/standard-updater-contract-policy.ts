type JsonRecord = Record<string, any>;
type Equal = (actual: unknown, expected: unknown) => boolean;
type SameStringArray = (actual: unknown, expected: string[]) => boolean;

function describeMismatch(label: string, actual: unknown, expected: unknown): string {
  return `${label} must be ${JSON.stringify(expected)}; got ${JSON.stringify(actual)}`;
}

export function standardUpdaterMetadataViolation(
  updater: JsonRecord | null | undefined,
  sameStringArray: SameStringArray,
): string | null {
  const allowedMetadata = ['latest-mac.yml', 'latest-arm64-mac.yml'];
  const compatibilityMetadata = ['latest-arm64-mac.yml'];
  if (!sameStringArray(updater?.allowed_metadata, allowedMetadata)) {
    return describeMismatch('Standard updater metadata files', updater?.allowed_metadata, allowedMetadata);
  }
  if (!sameStringArray(updater?.compatibility_metadata, compatibilityMetadata)) {
    return describeMismatch(
      'Standard updater compatibility metadata files',
      updater?.compatibility_metadata,
      compatibilityMetadata,
    );
  }

  const migration = updater?.metadata_migration;
  if (
    updater?.primary_metadata !== 'latest-mac.yml'
    || migration?.mode !== 'dual_publish_bounded_bridge'
    || migration?.status !== 'bridge_active'
    || migration?.unchanged_public_release !== 'v26.8.8'
    || migration?.successor_client_metadata !== 'latest-mac.yml'
    || migration?.legacy_client_metadata !== 'latest-arm64-mac.yml'
    || migration?.same_bytes_required !== true
    || migration?.retirement_status !== 'planned_not_scheduled'
  ) {
    return 'Standard updater metadata migration must keep latest-mac.yml primary and the arm64 alias as a bounded byte-identical bridge';
  }

  const retirementGates = [
    'publish_at_least_two_qualified_stable_releases_with_both_metadata_assets',
    'qualify_v26.8.8_to_bridge_release_through_latest-arm64-mac.yml',
    'qualify_bridge_release_to_successor_through_latest-mac.yml',
    'declare_bridge_release_or_newer_as_minimum_supported_auto_update_version',
    'retain_homebrew_and_manual_upgrade_for_older_clients',
  ];
  return sameStringArray(migration?.retirement_requires, retirementGates)
    ? null
    : describeMismatch('Standard updater metadata retirement gates', migration?.retirement_requires, retirementGates);
}

export function standardUpdaterCandidateSelectionViolation(
  selection: JsonRecord | null | undefined,
  sameStringArray: SameStringArray,
  equal: Equal,
): string | null {
  if (
    selection?.schema !== 'opl_app_updater_candidate_selection.v1'
    || selection?.updater_version_field !== 'updaterVersion'
    || selection?.sort_authority !== 'valid_updater_version_semver'
    || selection?.latest_pointer_is_not_candidate_sort_authority !== true
    || selection?.nightly_is_not_an_independent_user_channel !== true
  ) {
    return 'Standard updater must select candidates by valid updaterVersion SemVer, independently of Latest';
  }
  if (!sameStringArray(selection.stable?.allowed_quality_statuses, ['stable'])) {
    return describeMismatch(
      'Stable updater candidate quality statuses',
      selection.stable?.allowed_quality_statuses,
      ['stable'],
    );
  }
  if (selection.stable?.candidate_union !== 'stable_only') {
    return 'Stable updater must only consider Stable candidates';
  }
  if (!sameStringArray(selection.preview?.allowed_quality_statuses, ['stable', 'preview'])) {
    return describeMismatch(
      'Preview updater candidate quality statuses',
      selection.preview?.allowed_quality_statuses,
      ['stable', 'preview'],
    );
  }
  if (!sameStringArray(selection.preview?.allowed_preview_kinds, ['dev', 'nightly'])) {
    return describeMismatch(
      'Preview updater candidate preview kinds',
      selection.preview?.allowed_preview_kinds,
      ['dev', 'nightly'],
    );
  }
  if (
    selection.preview?.candidate_union !== 'stable_plus_preview_and_nightly'
    || selection.preview?.higher_stable_may_supersede_preview_or_nightly !== true
  ) {
    return 'Preview updater must consider Stable plus Preview/Nightly and allow a higher Stable to supersede it';
  }

  const monotonicity = {
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
  };
  return equal(selection.monotonicity, monotonicity)
    ? null
    : describeMismatch('Updater monotonicity policy', selection.monotonicity, monotonicity);
}
