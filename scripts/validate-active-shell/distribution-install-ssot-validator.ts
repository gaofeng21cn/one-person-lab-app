import { assertDeepEqualJson } from './assertions.ts';

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}; got ${JSON.stringify(actual)}`);
  }
}

export function validateDistributionInstallSsot(releaseChannel, installExposurePolicy) {
  const release = releaseChannel?.distribution_semantics;
  const install = installExposurePolicy?.distribution_install_model;
  const humanSsot = 'docs/delivery/distribution-and-install-ssot.md';

  requireEqual(release?.schema, 'opl_app_distribution_semantics.v1', 'Distribution release schema');
  requireEqual(install?.schema, 'opl_app_distribution_install_model.v1', 'Distribution install schema');
  requireEqual(release?.human_ssot, humanSsot, 'Distribution release human SSOT');
  requireEqual(install?.human_ssot, humanSsot, 'Distribution install human SSOT');
  requireEqual(
    install?.release_semantics_ref,
    'contracts/app-release-channel.json#distribution_semantics',
    'Distribution install release semantics ref',
  );

  const releaseTopology = release.topology_counts;
  requireEqual(releaseTopology?.current_publication_carrier_families, 3, 'Publication carrier family count');
  assertDeepEqualJson(
    releaseTopology?.publication_carrier_families,
    ['app_github_releases', 'homebrew_tap', 'webui_ghcr'],
    'Publication carrier families',
  );
  requireEqual(releaseTopology?.current_production_publication_paths, 4, 'Production publication path count');
  assertDeepEqualJson(
    releaseTopology?.production_publication_paths,
    [
      'desktop_stable_github_release',
      'homebrew_standard_cask',
      'homebrew_full_cask_post_publication_follower',
      'container_webui_latest_with_stable_compatibility_alias',
    ],
    'Production publication paths',
  );

  const installTopology = install.topology_counts;
  requireEqual(installTopology?.current_ordinary_install_entrypoint_families, 4, 'Install entrypoint family count');
  assertDeepEqualJson(
    installTopology?.ordinary_install_entrypoint_families,
    [
      'direct_github_release_asset',
      'homebrew_cask',
      'app_universal_install_sh',
      'container_webui_helper_or_compose',
    ],
    'Install entrypoint families',
  );
  requireEqual(installTopology?.current_supported_app_runtime_forms, 2, 'Supported runtime form count');
  assertDeepEqualJson(
    installTopology?.supported_app_runtime_forms,
    ['desktop', 'container_webui'],
    'Supported runtime forms',
  );
  requireEqual(installTopology?.approved_target_app_runtime_forms, 3, 'Target runtime form count');
  assertDeepEqualJson(
    installTopology?.target_app_runtime_forms,
    ['desktop', 'native_webui', 'container_webui'],
    'Target runtime forms',
  );
  assertDeepEqualJson(installTopology?.payload_densities, ['standard', 'full'], 'Payload densities');

  assertDeepEqualJson(
    release.orthogonal_dimensions,
    {
      quality_status: ['stable', 'preview'],
      build_trigger: ['manual', 'automated'],
      preview_kind: {
        source: 'derived_read_only',
        values: ['dev', 'nightly', null],
        derivation: {
          preview_manual: 'dev',
          preview_automated: 'nightly',
          stable: null,
        },
      },
      distribution_pointer: ['latest'],
      payload_density: ['standard', 'full'],
      runtime_form: ['desktop', 'native_webui', 'container_webui'],
      task_mode: ['development_validation', 'production_release'],
    },
    'Distribution orthogonal dimensions',
  );

  requireEqual(release.terms?.stable?.is_pointer, false, 'Stable pointer classification');
  requireEqual(release.terms?.stable?.build_trigger_independent, true, 'Stable build-trigger independence');
  requireEqual(release.terms?.stable?.preview_kind, null, 'Stable preview kind');
  requireEqual(
    release.terms?.preview?.may_be_promoted_after_same_digest_full_stable_qualification,
    true,
    'Preview quality promotion',
  );
  requireEqual(release.terms?.latest?.default_target, 'newest_qualified_stable', 'Latest default target');
  requireEqual(release.terms?.latest?.pointer_move_changes_quality, false, 'Latest quality independence');
  const latestPolicy = release.latest_policy;
  requireEqual(
    latestPolicy?.default_behavior,
    'each_carrier_advances_its_own_latest_pointer_when_that_carrier_publishes_a_new_qualified_stable',
    'Carrier-local Latest default behavior',
  );
  requireEqual(
    latestPolicy?.automatic_preview_or_nightly_writer_may_move_latest,
    false,
    'Automatic Preview Latest mutation',
  );
  const durableSelector = latestPolicy?.durable_publication_record_selector;
  requireEqual(
    durableSelector?.selector,
    'carrier_owned_durable_publication_record',
    'Durable publication record selector',
  );
  requireEqual(
    durableSelector?.candidate_target,
    'retained_immutable_verified_published_version',
    'Durable publication record candidate',
  );
  assertDeepEqualJson(
    durableSelector?.candidate_record_must_bind,
    [
      'carrier_namespace',
      'exact_version_or_tag',
      'immutable_artifact_or_image_digest',
      'quality_status_and_preview_kind',
      'qualification_disclosure',
      'public_readback',
    ],
    'Durable publication record bindings',
  );
  requireEqual(
    durableSelector?.actions_artifact?.selection_authority,
    false,
    'Actions artifact selector authority',
  );
  requireEqual(
    durableSelector?.actions_artifact?.expiry_or_retention_may_change_selection_eligibility,
    false,
    'Actions artifact retention dependency',
  );
  requireEqual(
    durableSelector?.actions_artifact?.allowed_role,
    'transient_prepublication_transport_or_diagnostic_evidence_only',
    'Actions artifact role',
  );
  requireEqual(
    durableSelector?.retention?.selection_eligible_state,
    'retained_not_retired_or_revoked',
    'Durable record selection retention state',
  );
  requireEqual(
    durableSelector?.retention?.record_must_remain_readable_until_retired,
    true,
    'Durable record retention readback',
  );
  requireEqual(
    durableSelector?.retention?.retired_or_revoked_record_selectable,
    false,
    'Retired record selection',
  );
  assertDeepEqualJson(
    durableSelector?.evidence_requirements,
    {
      stable: ['stable_qualification', 'exact_immutable_digest', 'carrier_public_readback'],
      preview: [
        'exact_immutable_digest',
        'carrier_public_readback',
        'non_stable_and_skipped_or_failed_gate_disclosure',
      ],
    },
    'Durable publication record evidence requirements',
  );
  requireEqual(
    latestPolicy?.explicit_user_override?.target,
    'any_exact_published_version',
    'Explicit Latest override target',
  );
  assertDeepEqualJson(
    latestPolicy?.explicit_user_override?.quality_statuses,
    ['stable', 'preview'],
    'Explicit Latest override quality statuses',
  );
  assertDeepEqualJson(
    latestPolicy?.explicit_user_override?.preview_kinds,
    ['dev', 'nightly'],
    'Explicit Latest override Preview kinds',
  );
  requireEqual(
    latestPolicy?.explicit_user_override?.authority,
    'protected_single_use',
    'Explicit Latest override authority',
  );
  requireEqual(
    latestPolicy?.explicit_user_override?.compare_and_swap,
    'exact_expected_current',
    'Explicit Latest override CAS',
  );
  requireEqual(
    latestPolicy?.explicit_user_override?.quality_unchanged,
    true,
    'Explicit Latest override quality preservation',
  );
  requireEqual(
    latestPolicy?.explicit_user_override?.persistent_override,
    false,
    'Explicit Latest override persistence',
  );
  requireEqual(
    latestPolicy?.move_latest_pointer?.stable_or_preview_candidate_allowed,
    true,
    'Latest pointer candidate freedom',
  );
  requireEqual(
    latestPolicy?.next_qualified_stable_reclaims_pointer,
    true,
    'Latest Stable reclaim default',
  );
  requireEqual(release.terms?.nightly?.product_channel_semantics, 'retained', 'Nightly product semantics');
  requireEqual(
    release.terms?.nightly?.current_publication_implementation,
    'implemented_pending_first_publication_readback',
    'Nightly publication implementation',
  );
  requireEqual(release.terms?.nightly?.default_payload_density, 'standard', 'Nightly payload density');
  requireEqual(release.terms?.nightly?.full_by_default, false, 'Nightly Full default');
  requireEqual(release.terms?.nightly?.dimension, 'preview_kind', 'Nightly derived dimension');
  requireEqual(release.terms?.nightly?.independent_quality_level, false, 'Nightly quality classification');
  assertDeepEqualJson(
    release.terms?.nightly?.derived_from,
    { quality_status: 'preview', build_trigger: 'automated' },
    'Nightly derivation',
  );
  requireEqual(release.terms?.nightly?.scheduled_writer_may_move_latest, false, 'Nightly schedule Latest policy');
  requireEqual(release.terms?.nightly?.explicit_user_override_may_move_latest, true, 'Nightly user Latest override');
  assertDeepEqualJson(
    release.terms?.dev?.derived_from,
    { quality_status: 'preview', build_trigger: 'manual' },
    'Dev derivation',
  );
  requireEqual(release.terms?.full?.independent_long_term_update_channel, false, 'Full channel classification');

  const latest = release.latest_policy;
  requireEqual(latest?.default_automatic_writer, 'newest_qualified_stable', 'Latest automatic writer');
  requireEqual(
    latest?.automatic_preview_or_nightly_writer_may_move_latest,
    false,
    'Automatic Preview Latest admission',
  );
  const override = latest?.explicit_user_override;
  requireEqual(override?.target, 'any_exact_published_version', 'Latest override target');
  assertDeepEqualJson(override?.quality_statuses, ['stable', 'preview'], 'Latest override quality statuses');
  assertDeepEqualJson(override?.preview_kinds, ['dev', 'nightly'], 'Latest override Preview kinds');
  requireEqual(override?.authority, 'protected_single_use', 'Latest override authority');
  requireEqual(override?.compare_and_swap, 'exact_expected_current', 'Latest override CAS');
  requireEqual(override?.quality_unchanged, true, 'Latest override quality');
  requireEqual(override?.persistent_override, false, 'Latest override persistence');
  requireEqual(
    override?.non_stable_and_skipped_or_failed_gate_disclosure_required_for_preview_only,
    true,
    'Preview Latest override disclosure',
  );
  requireEqual(
    override?.stable_candidate_requires_stable_qualification_disclosure,
    true,
    'Stable Latest override qualification disclosure',
  );
  requireEqual(latest?.promote_quality?.transition, 'preview_to_stable', 'Quality promotion transition');
  requireEqual(latest?.promote_quality?.same_exact_artifact_digest_required, true, 'Quality promotion digest');
  requireEqual(latest?.promote_quality?.full_stable_gates_and_receipt_required, true, 'Quality promotion gates');
  requireEqual(latest?.promote_quality?.immutable_build_manifest_rewrite_allowed, false, 'Quality manifest immutability');
  requireEqual(latest?.promote_quality?.moves_latest_pointer, false, 'Quality promotion pointer behavior');
  requireEqual(latest?.move_latest_pointer?.changes_quality, false, 'Latest pointer quality behavior');
  requireEqual(
    latest?.move_latest_pointer?.stable_or_preview_candidate_allowed,
    true,
    'Latest pointer Stable or Preview target',
  );
  requireEqual(latest?.next_qualified_stable_reclaims_pointer, true, 'Next Stable Latest behavior');
  requireEqual(latest?.failure_preserves_current_latest_lkg, true, 'Latest LKG failure behavior');
  const dockerOverride = latest?.docker_manual_override;
  requireEqual(
    dockerOverride?.target,
    'retained_immutable_verified_published_version',
    'Docker manual override target',
  );
  requireEqual(
    dockerOverride?.requires_explicit_user_confirmation,
    true,
    'Docker manual override confirmation',
  );
  requireEqual(
    dockerOverride?.selector,
    'carrier_owned_durable_publication_record',
    'Docker manual override selector',
  );
  assertDeepEqualJson(
    dockerOverride?.mutation_scope,
    ['container_webui.latest'],
    'Docker manual override mutation scope',
  );
  assertDeepEqualJson(
    dockerOverride?.must_not_mutate,
    ['container_webui.stable', 'desktop.latest'],
    'Docker manual override protected pointers',
  );
  requireEqual(
    dockerOverride?.compare_and_swap,
    'exact_expected_current',
    'Docker manual override CAS',
  );
  requireEqual(
    dockerOverride?.fresh_public_readback_required,
    true,
    'Docker manual override readback',
  );

  const currentCohort = release.cohort_policy?.current_development_state;
  const targetCohort = release.cohort_policy?.approved_production_target;
  requireEqual(currentCohort?.desktop_and_webui, 'dual_track', 'Current Desktop/WebUI cohort');
  requireEqual(currentCohort?.independent_version_and_cadence_allowed, true, 'Development dual-track version policy');
  requireEqual(currentCohort?.same_production_cohort_claim_allowed, false, 'Development production-cohort claim');
  requireEqual(targetCohort?.model, 'one_app_version_multiple_runtime_forms', 'Production cohort target');
  requireEqual(targetCohort?.same_app_version_and_official_profile_required, true, 'Production version convergence');
  requireEqual(targetCohort?.physical_artifact_bytes_must_match, false, 'Cross-carrier byte identity');
  requireEqual(
    targetCohort?.framework_reconciliation_and_product_behavior_must_converge,
    true,
    'Cross-carrier behavior convergence',
  );

  requireEqual(
    releaseChannel.nightly_standard?.status,
    'implemented_pending_first_publication_readback',
    'Current Nightly publication state',
  );
  requireEqual(releaseChannel.nightly_standard?.full_first_install_allowed, false, 'Current Nightly Full policy');
  requireEqual(releaseChannel.nightly_standard?.quality_status, 'preview', 'Current Nightly quality');
  requireEqual(releaseChannel.nightly_standard?.build_trigger, 'automated', 'Current Nightly trigger');
  requireEqual(releaseChannel.nightly_standard?.preview_kind, 'nightly', 'Current Nightly preview kind');
  requireEqual(
    releaseChannel.nightly_standard?.scheduled_latest_release_allowed,
    false,
    'Current Nightly scheduled Latest policy',
  );
  requireEqual(
    releaseChannel.nightly_standard?.explicit_user_override_may_move_latest,
    true,
    'Current Nightly user Latest override',
  );
  requireEqual(
    release.implementation_state?.desktop_nightly,
    'implemented_pending_first_publication_readback',
    'Distribution Nightly implementation state',
  );
  requireEqual(
    release.publication_history?.desktop_nightly?.product_channel_semantics_retained,
    true,
    'Nightly retained product semantics',
  );
  requireEqual(
    release.publication_history?.desktop_nightly?.historical_payload_density,
    'standard',
    'Nightly historical payload density',
  );
  requireEqual(
    release.publication_history?.desktop_nightly?.historical_full_by_default,
    false,
    'Nightly historical Full default',
  );
  requireEqual(
    release.publication_history?.desktop_nightly?.current_publication_workflow_present,
    true,
    'Nightly current publication workflow',
  );
  requireEqual(
    release.publication_history?.desktop_nightly?.new_publication_status,
    'implemented_pending_first_publication_readback',
    'Nightly new publication status',
  );
  const nightlyTarget = release.approved_targets?.desktop_nightly;
  requireEqual(nightlyTarget?.status, 'implemented_pending_first_publication_readback', 'Nightly target status');
  requireEqual(nightlyTarget?.quality_status, 'preview', 'Nightly target quality');
  requireEqual(nightlyTarget?.build_trigger, 'automated', 'Nightly target trigger');
  requireEqual(nightlyTarget?.preview_kind, 'nightly', 'Nightly target Preview kind');
  requireEqual(nightlyTarget?.payload_density, 'standard', 'Nightly target payload density');
  requireEqual(nightlyTarget?.full_by_default, false, 'Nightly target Full default');
  requireEqual(nightlyTarget?.scheduled_latest_allowed, false, 'Nightly target scheduled Latest policy');
  requireEqual(nightlyTarget?.explicit_user_override_may_move_latest, true, 'Nightly target user Latest override');
  requireEqual(nightlyTarget?.homebrew_cask, 'one-person-lab-nightly', 'Nightly target Homebrew Cask');

  const releaseHomebrew = releaseChannel.homebrew_tap_distribution;
  requireEqual(
    release.implementation_state?.homebrew_full,
    'implemented_pending_first_protected_follower_readback',
    'Full Cask current release state',
  );
  requireEqual(releaseHomebrew?.excluded_casks?.includes('one-person-lab-full'), false, 'Approved Full Cask exclusion');
  requireEqual(releaseHomebrew?.full_casks?.includes('one-person-lab-full'), true, 'Approved Full Cask target');
  requireEqual(releaseHomebrew?.tap_update_policy?.full?.homebrew_publish_allowed, true, 'Current Full Cask publication');
  requireEqual(
    releaseHomebrew?.tap_update_policy?.nightly?.mutation_allowed,
    true,
    'Nightly Cask follower mutation',
  );
  requireEqual(
    release.approved_targets?.homebrew_full?.formula_dependency_target,
    false,
    'Full Cask target Formula dependency',
  );
  requireEqual(
    release.approved_targets?.homebrew_full?.generation_status,
    'implemented_pending_first_protected_follower_readback',
    'Full Cask target generator status',
  );
  requireEqual(
    release.approved_targets?.homebrew_full?.generator,
    'scripts/update-homebrew-tap.ts',
    'Full Cask target generator',
  );
  requireEqual(
    release.approved_targets?.homebrew_full?.package_kind,
    'app_full_first_install',
    'Full Cask target package kind',
  );
  requireEqual(
    release.approved_targets?.homebrew_full?.framework_carrier_target,
    'full_dmg_embedded_opl_base',
    'Full Cask target Framework carrier',
  );
  requireEqual(
    release.approved_targets?.homebrew_full?.active_framework_count_target,
    1,
    'Full Cask target active Framework count',
  );
  assertDeepEqualJson(
    release.approved_targets?.homebrew_full?.cask_conflicts_required,
    ['one-person-lab', 'one-person-lab-nightly'],
    'Full Cask target conflicts',
  );
  requireEqual(
    release.approved_targets?.homebrew_full?.digest_cas_required,
    true,
    'Full Cask target digest CAS',
  );
  requireEqual(
    release.approved_targets?.homebrew_full?.public_promotion_status,
    'approved_pending_first_protected_follower_readback',
    'Full Cask target public promotion status',
  );

  const consistency = install.consistency_target;
  requireEqual(consistency?.name, 'official_profile_converged', 'Install consistency target');
  requireEqual(consistency?.physical_byte_identity_required, false, 'Install physical byte identity');
  requireEqual(consistency?.base_app_and_packages_version_lockstep_required, false, 'Install version lockstep');
  requireEqual(consistency?.same_product_behavior_contract_required, true, 'Install behavior convergence');
  requireEqual(consistency?.same_official_profile_intent_required, true, 'Install Official Profile convergence');
  requireEqual(
    consistency?.configured_carrier_terminal_readback_required,
    true,
    'Install carrier terminal readback',
  );
  requireEqual(consistency?.active_framework_count, 1, 'Install active Framework count');
  requireEqual(
    consistency?.package_published_current_stable_authority,
    'package_owner_per_package_ghcr_latest_stable',
    'Package published current stable authority',
  );
  requireEqual(
    consistency?.package_installed_callable_authority,
    'configured_carrier_readback_aggregated_by_framework',
    'Package installed callable authority',
  );

  const nativeWebui = install.runtime_forms?.native_webui;
  requireEqual(nativeWebui?.source_runtime_status, 'active_development_capability', 'Native WebUI source status');
  requireEqual(
    nativeWebui?.implementation_status,
    'production_publisher_implemented_pending_first_publication_readback',
    'Native WebUI implementation status',
  );
  requireEqual(nativeWebui?.public_install_status, 'not_published', 'Native WebUI public status');
  requireEqual(nativeWebui?.opl_support_status, 'approved_target_not_supported', 'Native WebUI support status');
  requireEqual(nativeWebui?.electron_required, false, 'Native WebUI Electron requirement');
  requireEqual(nativeWebui?.docker_required, false, 'Native WebUI Docker requirement');
  requireEqual(
    nativeWebui?.upstream_aionui_tarballs_are_opl_release_evidence,
    false,
    'Native WebUI upstream artifact authority',
  );
  requireEqual(
    install.runtime_forms?.container_webui?.target,
    'container_adapter_over_same_frozen_webui_runtime_as_native',
    'Container WebUI target',
  );
  requireEqual(
    release.approved_targets?.native_webui?.status,
    'production_publisher_implemented_pending_first_publication_readback',
    'Native WebUI release target status',
  );
  requireEqual(release.approved_targets?.native_webui?.initial_platform, 'linux_amd64', 'Native WebUI initial platform');
  requireEqual(
    release.approved_targets?.native_webui?.publication_carrier,
    'app_github_release_assets',
    'Native WebUI publication carrier',
  );
  requireEqual(
    release.approved_targets?.native_webui?.production_topology,
    'standard_operation_nonblocking_prepare_then_post_latest_protected_additive_publish_with_follower_readback',
    'Native WebUI production topology',
  );
  assertDeepEqualJson(
    release.approved_targets?.native_webui?.stable_operation_set_must_remain,
    ['standard', 'resume_standard', 'append_full'],
    'Native WebUI Stable operation boundary',
  );
  assertDeepEqualJson(
    release.approved_targets?.native_webui?.container_ghcr_tags_must_remain_unchanged,
    ['latest', 'stable'],
    'Native WebUI Container tag boundary',
  );
  assertDeepEqualJson(
    release.approved_targets?.native_webui?.promotion_requires,
    [
      'carrier_neutral_frozen_linux_amd64_payload',
      'container_overlay_reuses_the_same_frozen_payload',
      'versioned_runtime_directories_and_atomic_current_pointer',
      'app_owned_versioned_artifacts',
      'install_update_rollback_and_data_preservation',
      'framework_and_official_profile_convergence',
      'non_root_clean_host_qualification',
      'public_digest_readback',
    ],
    'Native WebUI promotion gates',
  );
  requireEqual(
    (installExposurePolicy.installer_surfaces ?? []).some((entry) => entry.surface === 'native_webui'),
    false,
    'Native WebUI active installer surface',
  );

  const installer = install.installer_convergence;
  assertDeepEqualJson(
    installer?.current_default_app_script?.framework_arguments,
    ['--with-app'],
    'Current App installer Framework arguments',
  );
  requireEqual(
    installer?.current_default_app_script?.official_profile_converged_by_installer,
    true,
    'Current App installer convergence',
  );
  requireEqual(installer?.approved_universal_target?.macos_default, 'desktop', 'Universal macOS target');
  requireEqual(installer?.approved_universal_target?.linux_personal_default, 'native_webui', 'Universal Linux target');
  requireEqual(
    installer?.approved_universal_target?.server_or_isolated_explicit,
    'container_webui',
    'Universal server target',
  );
  requireEqual(installer?.approved_universal_target?.headless_explicit, 'opl_base_only', 'Universal headless target');
  requireEqual(installer?.approved_universal_target?.result, 'official_profile_converged', 'Universal result');
  assertDeepEqualJson(
    installer?.approved_universal_target?.native_webui_public_discovery,
    {
      repository: 'gaofeng21cn/one-person-lab-app',
      release_selector: 'github_latest_pointer_exact_release',
      required_asset_roles: [
        'runtime_tarball',
        'runtime_metadata',
        'installer',
        'installer_sha256',
        'qualification_receipt',
      ],
      installer_digest_authority: 'github_release_asset_digest_sha256',
      quality_admission_authority: 'exact_digest_bound_native_qualification_receipt_not_latest_pointer',
      exact_tag_download_url_required: true,
      probe_before_selection_required: true,
      pre_publication_fallback: 'container_webui',
    },
    'Native WebUI public discovery policy',
  );
  requireEqual(
    installer?.stable_macos_helper?.current_status,
    'direct_component_manifest_entrypoint',
    'Stable macOS helper current state',
  );
  assertDeepEqualJson(
    installer?.stable_macos_helper?.compatibility_entrypoints,
    [],
    'Direct macOS compatibility entrypoints',
  );
  requireEqual(
    installer?.stable_macos_helper?.compatibility_wrapper_status,
    'retired',
    'Direct macOS compatibility wrapper status',
  );
  assertDeepEqualJson(
    installer?.stable_macos_helper?.retired_compatibility_entrypoints,
    ['install-stable.sh'],
    'Retired macOS compatibility entrypoints',
  );
  assertDeepEqualJson(
    installer?.stable_macos_helper?.artifact_integrity,
    {
      official_release_asset_authority: 'exact_github_release_record_asset_digest',
      component_manifest_authority: 'exact_github_release_record_component_manifest_asset_digest',
      custom_url_or_path_authority: 'caller_supplied_sha256_quality_not_asserted',
      verification_order: 'dmg_and_component_manifest_before_mount_copy_or_target_replacement',
      latest_pointer_does_not_imply_stable_qualification: true,
      non_stable_disclosure_before_target_mutation: true,
      legacy_component_manifest_policy: 'allow_only_published_non_prerelease_pre_v3_manifest_with_quality_unasserted_disclosure',
    },
    'Direct macOS installer artifact and quality authority',
  );

  const installHomebrew = install.homebrew_carriers;
  requireEqual(installHomebrew?.standard?.formula_dependency_current, true, 'Standard Cask current Formula dependency');
  requireEqual(installHomebrew?.standard?.formula_dependency_target, true, 'Standard Cask target Formula dependency');
  requireEqual(installHomebrew?.nightly?.dmg_profile, 'standard_nightly', 'Nightly Cask DMG profile');
  requireEqual(
    installHomebrew?.nightly?.product_channel_semantics,
    'retained_standard_prerelease',
    'Nightly Cask product semantics',
  );
  requireEqual(installHomebrew?.nightly?.full_by_default, false, 'Nightly Cask Full default');
  requireEqual(
    installHomebrew?.nightly?.new_publication_status,
    'implemented_pending_first_follower_readback',
    'Nightly Cask new publication status',
  );
  requireEqual(
    installHomebrew?.nightly?.formula_dependency_required,
    true,
    'Nightly Cask Formula relationship',
  );
  requireEqual(installHomebrew?.full?.dmg_embeds_opl_base, true, 'Full Cask embedded Base');
  requireEqual(installHomebrew?.full?.formula_dependency_current, true, 'Full Cask current Formula dependency');
  requireEqual(installHomebrew?.full?.duplicate_base_carrier_risk_current, true, 'Full Cask current duplicate risk');
  requireEqual(installHomebrew?.full?.formula_dependency_target, false, 'Full Cask target Formula dependency');
  requireEqual(
    installHomebrew?.full?.target_generation_status,
    'implemented_pending_first_protected_follower_readback',
    'Full Cask install target generator status',
  );
  requireEqual(
    installHomebrew?.full?.target_generator_ref,
    'scripts/update-homebrew-tap.ts',
    'Full Cask install target generator',
  );
  requireEqual(
    installHomebrew?.full?.target_framework_carrier,
    'full_dmg_embedded_opl_base',
    'Full Cask install target Framework carrier',
  );
  requireEqual(
    installHomebrew?.full?.target_digest_cas_required,
    true,
    'Full Cask install target digest CAS',
  );
  requireEqual(installHomebrew?.full?.target_requires_active_framework_count, 1, 'Full Cask target Framework count');
  requireEqual(
    installHomebrew?.quarantine?.homebrew_cask_automatically_clears_quarantine_current,
    false,
    'Homebrew quarantine behavior',
  );
  requireEqual(
    installHomebrew?.quarantine?.current_clean_vm_harness_clears_quarantine_outside_homebrew,
    true,
    'Homebrew smoke quarantine boundary',
  );

  const expectedCaskPayloadProfiles = {
    standard: ['opl_app'],
    nightly: ['opl_app'],
    full: ['opl_app', 'opl_base_offline_seed', 'opl_package_offline_seeds'],
  };
  const lifecycle = installExposurePolicy.software_lifecycle;
  assertDeepEqualJson(
    lifecycle?.channel_semantics?.homebrew,
    {
      standard: 'formula_opl_is_the_base_carrier_and_the_standard_cask_carries_the_app',
      nightly:
        'formula_opl_is_the_base_carrier_and_the_standard_density_prerelease_cask_carries_the_app',
      full_target:
        'the_full_cask_consumes_the_full_dmg_with_embedded_base_and_package_seeds_without_a_formula_dependency_then_framework_activates_exactly_one_base',
    },
    'Homebrew profile channel semantics',
  );
  assertDeepEqualJson(
    lifecycle?.carrier_adapters?.homebrew_cask?.payload_profiles,
    expectedCaskPayloadProfiles,
    'Homebrew Cask payload profiles',
  );
  requireEqual(
    lifecycle?.carrier_adapters?.homebrew_cask?.full_seed_activation_owner,
    'one-person-lab',
    'Homebrew Full seed activation owner',
  );
  assertDeepEqualJson(
    releaseHomebrew?.carrier_adapter_semantics?.cask?.payload_profiles,
    expectedCaskPayloadProfiles,
    'Release Homebrew Cask payload profiles',
  );
  requireEqual(
    releaseHomebrew?.carrier_adapter_semantics?.cask?.full_seed_activation_owner,
    'one-person-lab',
    'Release Homebrew Full seed activation owner',
  );

  const installChannel = installExposurePolicy.distribution_channels?.homebrew;
  requireEqual(installChannel?.casks?.standard_app, installHomebrew.standard.cask, 'Standard Cask cross-contract name');
  requireEqual(installChannel?.casks?.nightly_standard_app, installHomebrew.nightly.cask, 'Nightly Cask cross-contract name');
  requireEqual(installChannel?.casks?.full_first_install_app, installHomebrew.full.cask, 'Full Cask cross-contract name');
  assertDeepEqualJson(
    installChannel?.carrier_adapter_semantics?.cask?.payload_profiles,
    expectedCaskPayloadProfiles,
    'Install Homebrew Cask payload profiles',
  );
}
