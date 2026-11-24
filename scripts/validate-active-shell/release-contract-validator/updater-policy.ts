import { assertDeepEqualJson } from '../assertions.ts';

function validateStandardUpdater(updater) {
  const candidateSelection = updater?.candidate_selection;
  if (
    updater?.scope !== 'desktop_app_assets_only' ||
    updater?.module_package_update_allowed !== false ||
    updater?.opl_flow_install_allowed !== false ||
    updater?.post_update_reconcile_ref !== 'managed_update_plane.carrier_reconciliation'
  ) {
    throw new Error('Standard updater must remain App-binary-only and join the carrier-neutral Framework reconciliation path');
  }
  assertDeepEqualJson(
    updater?.allowed_metadata,
    ['latest-mac.yml', 'latest-arm64-mac.yml'],
    'Standard updater metadata files',
  );
  assertDeepEqualJson(
    updater?.compatibility_metadata,
    ['latest-arm64-mac.yml'],
    'Standard updater compatibility metadata files',
  );
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
    throw new Error('Standard updater metadata migration must keep latest-mac.yml primary and the arm64 alias as a bounded byte-identical bridge');
  }
  assertDeepEqualJson(
    migration?.retirement_requires,
    [
      'publish_at_least_two_qualified_stable_releases_with_both_metadata_assets',
      'qualify_v26.8.8_to_bridge_release_through_latest-arm64-mac.yml',
      'qualify_bridge_release_to_successor_through_latest-mac.yml',
      'declare_bridge_release_or_newer_as_minimum_supported_auto_update_version',
      'retain_homebrew_and_manual_upgrade_for_older_clients',
    ],
    'Standard updater metadata retirement gates',
  );
  if (
    candidateSelection?.schema !== 'opl_app_updater_candidate_selection.v1' ||
    candidateSelection?.updater_version_field !== 'updaterVersion' ||
    candidateSelection?.sort_authority !== 'valid_updater_version_semver' ||
    candidateSelection?.latest_pointer_is_not_candidate_sort_authority !== true ||
    candidateSelection?.nightly_is_not_an_independent_user_channel !== true
  ) {
    throw new Error('Standard updater must select candidates by valid updaterVersion SemVer, independently of Latest');
  }
  assertDeepEqualJson(
    candidateSelection?.stable?.allowed_quality_statuses,
    ['stable'],
    'Stable updater candidate quality statuses',
  );
  if (candidateSelection?.stable?.candidate_union !== 'stable_only') {
    throw new Error('Stable updater must only consider Stable candidates');
  }
  assertDeepEqualJson(
    candidateSelection?.preview?.allowed_quality_statuses,
    ['stable', 'preview'],
    'Preview updater candidate quality statuses',
  );
  assertDeepEqualJson(
    candidateSelection?.preview?.allowed_preview_kinds,
    ['dev', 'nightly'],
    'Preview updater candidate preview kinds',
  );
  if (
    candidateSelection?.preview?.candidate_union !== 'stable_plus_preview_and_nightly' ||
    candidateSelection?.preview?.higher_stable_may_supersede_preview_or_nightly !== true
  ) {
    throw new Error('Preview updater must consider Stable plus Preview/Nightly and allow a higher Stable to supersede it');
  }
  assertDeepEqualJson(
    candidateSelection?.monotonicity,
    {
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
    },
    'Updater monotonicity policy',
  );
}

export { validateStandardUpdater };
