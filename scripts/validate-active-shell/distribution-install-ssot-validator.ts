import { assertDeepEqualJson, assertFieldsMatch, assertIncludesAll } from './assertions.ts';

export function validateDistributionInstallSsot(releaseChannel, installExposurePolicy) {
  const release = releaseChannel?.distribution_semantics;
  const install = installExposurePolicy?.distribution_install_model;
  const humanSsot = 'docs/delivery/distribution-and-install-ssot.md';

  assertFieldsMatch(release, { schema: 'opl_app_distribution_semantics.v1', human_ssot: humanSsot }, 'Distribution release');
  assertFieldsMatch(install, {
    schema: 'opl_app_distribution_install_model.v1',
    human_ssot: humanSsot,
    release_semantics_ref: 'contracts/app-release-channel.json#distribution_semantics',
    component_interoperability_ref: 'contracts/app-install-exposure-policy.json#component_interoperability',
  }, 'Distribution install');
  assertFieldsMatch(installExposurePolicy?.component_interoperability, {
    model: 'independently_versioned_open_composition',
  }, 'Distribution install component interoperability');
  assertFieldsMatch(installExposurePolicy?.component_interoperability?.combination_policy, {
    exact_cross_component_version_or_commit_lockstep_required: false,
  }, 'Distribution install cross-component lockstep');
  assertFieldsMatch(installExposurePolicy?.component_interoperability?.compatibility_admission, {
    receipt_schema: 'opl_component_compatibility_receipt.v1',
  }, 'Distribution install Framework compatibility receipt');

  const releaseTopology = release?.topology_counts;
  assertFieldsMatch(releaseTopology, {
    current_publication_carrier_families: 3,
    current_production_publication_paths: 4,
  }, 'Distribution release topology');
  assertDeepEqualJson(releaseTopology?.publication_carrier_families, ['app_github_releases', 'homebrew_tap', 'webui_ghcr'], 'Publication carrier families');
  assertDeepEqualJson(releaseTopology?.production_publication_paths, [
    'desktop_stable_github_release',
    'homebrew_standard_cask',
    'homebrew_full_cask_post_publication_follower',
    'container_webui_latest_with_stable_compatibility_alias',
  ], 'Production publication paths');

  const installTopology = install?.topology_counts;
  assertFieldsMatch(installTopology, {
    current_ordinary_install_entrypoint_families: 4,
    current_supported_app_runtime_forms: 2,
    approved_target_app_runtime_forms: 2,
  }, 'Distribution install topology');
  assertDeepEqualJson(installTopology?.ordinary_install_entrypoint_families, [
    'direct_github_release_asset',
    'homebrew_cask',
    'release_universal_opl_install_sh',
    'container_webui_helper_or_compose',
  ], 'Install entrypoint families');
  assertDeepEqualJson(installTopology?.supported_app_runtime_forms, ['desktop', 'container_webui'], 'Supported runtime forms');
  assertDeepEqualJson(installTopology?.target_app_runtime_forms, ['desktop', 'container_webui'], 'Target runtime forms');
  assertDeepEqualJson(installTopology?.payload_densities, ['standard', 'full'], 'Payload densities');

  assertDeepEqualJson(release?.orthogonal_dimensions, {
    quality_status: ['stable', 'preview'],
    build_trigger: ['manual', 'automated'],
    preview_kind: {
      source: 'derived_read_only',
      values: ['dev', 'nightly', null],
      derivation: { preview_manual: 'dev', preview_automated: 'nightly', stable: null },
    },
    distribution_pointer: ['latest'],
    payload_density: ['standard', 'full'],
    runtime_form: ['desktop', 'container_webui'],
    task_mode: ['development_validation', 'production_release'],
  }, 'Distribution orthogonal dimensions');

  assertFieldsMatch(release?.terms?.stable, {
    is_pointer: false,
    build_trigger_independent: true,
    preview_kind: null,
  }, 'Distribution terms.stable');
  assertFieldsMatch(release?.terms?.preview, {
    may_be_promoted_after_same_digest_full_stable_qualification: true,
  }, 'Distribution terms.preview');
  assertFieldsMatch(release?.terms?.latest, {
    default_target: 'newest_qualified_stable',
    pointer_move_changes_quality: false,
  }, 'Distribution terms.latest');

  const latestPolicy = release?.latest_policy;
  assertFieldsMatch(latestPolicy, {
    default_behavior: 'each_carrier_advances_its_own_latest_pointer_when_that_carrier_publishes_a_new_qualified_stable',
    default_automatic_writer: 'newest_qualified_stable',
    automatic_preview_or_nightly_writer_may_move_latest: false,
    next_qualified_stable_reclaims_pointer: true,
    failure_preserves_current_latest_lkg: true,
  }, 'Distribution latest_policy');
  assertFieldsMatch(latestPolicy?.move_latest_pointer, {
    stable_or_preview_candidate_allowed: true,
    changes_quality: false,
  }, 'Latest pointer behavior');
  assertFieldsMatch(latestPolicy?.promote_quality, {
    transition: 'preview_to_stable',
    same_exact_artifact_digest_required: true,
    full_stable_gates_and_receipt_required: true,
    immutable_build_manifest_rewrite_allowed: false,
    moves_latest_pointer: false,
  }, 'Quality promotion');

  const durableSelector = latestPolicy?.durable_publication_record_selector;
  assertFieldsMatch(durableSelector, {
    selector: 'carrier_owned_durable_publication_record',
    candidate_target: 'retained_immutable_verified_published_version',
  }, 'Durable publication record selector');
  assertDeepEqualJson(durableSelector?.candidate_record_must_bind, [
    'carrier_namespace', 'exact_version_or_tag', 'immutable_artifact_or_image_digest',
    'quality_status_and_preview_kind', 'qualification_disclosure', 'public_readback',
  ], 'Durable publication record bindings');
  assertFieldsMatch(durableSelector?.actions_artifact, {
    selection_authority: false,
    expiry_or_retention_may_change_selection_eligibility: false,
    allowed_role: 'transient_prepublication_transport_or_diagnostic_evidence_only',
  }, 'Durable publication record actions_artifact');
  assertFieldsMatch(durableSelector?.retention, {
    selection_eligible_state: 'retained_not_retired_or_revoked',
    record_must_remain_readable_until_retired: true,
    retired_or_revoked_record_selectable: false,
  }, 'Durable publication record retention');
  assertDeepEqualJson(durableSelector?.evidence_requirements, {
    stable: ['stable_qualification', 'exact_immutable_digest', 'carrier_public_readback'],
    preview: ['exact_immutable_digest', 'carrier_public_readback', 'non_stable_and_skipped_or_failed_gate_disclosure'],
  }, 'Durable publication record evidence requirements');

  const override = latestPolicy?.explicit_user_override;
  assertFieldsMatch(override, {
    target: 'any_exact_published_version',
    authority: 'protected_single_use',
    compare_and_swap: 'exact_expected_current',
    quality_unchanged: true,
    persistent_override: false,
    non_stable_and_skipped_or_failed_gate_disclosure_required_for_preview_only: true,
    stable_candidate_requires_stable_qualification_disclosure: true,
  }, 'Explicit Latest override');
  assertDeepEqualJson(override?.quality_statuses, ['stable', 'preview'], 'Explicit Latest override quality statuses');
  assertDeepEqualJson(override?.preview_kinds, ['dev', 'nightly'], 'Explicit Latest override Preview kinds');

  assertFieldsMatch(release?.terms?.nightly, {
    product_channel_semantics: 'retained',
    current_publication_implementation: 'implemented',
    default_payload_density: 'standard',
    full_by_default: false,
    dimension: 'preview_kind',
    independent_quality_level: false,
    scheduled_writer_may_move_latest: false,
    explicit_user_override_may_move_latest: true,
  }, 'Nightly product terms');
  assertDeepEqualJson(release?.terms?.nightly?.derived_from, { quality_status: 'preview', build_trigger: 'automated' }, 'Nightly derivation');
  assertDeepEqualJson(release?.terms?.dev?.derived_from, { quality_status: 'preview', build_trigger: 'manual' }, 'Dev derivation');
  assertFieldsMatch(release?.terms?.full, { independent_long_term_update_channel: false }, 'Full channel classification');

  const dockerOverride = latestPolicy?.docker_manual_override;
  assertFieldsMatch(dockerOverride, {
    target: 'retained_immutable_verified_published_version',
    requires_explicit_user_confirmation: true,
    selector: 'carrier_owned_durable_publication_record',
    compare_and_swap: 'exact_expected_current',
    fresh_public_readback_required: true,
  }, 'Docker manual override');
  assertFieldsMatch(dockerOverride?.operator_confirmation, {
    source: 'workflow_dispatch_exact_version_confirmation',
    expected_value: 'move-docker-latest:<exact_version>',
    actor: 'github_human_login',
    digest_bound_into_terminal_receipt: true,
  }, 'Docker manual override confirmation');
  assertDeepEqualJson(dockerOverride?.mutation_scope, ['container_webui.latest'], 'Docker manual override mutation scope');
  assertDeepEqualJson(dockerOverride?.must_not_mutate, ['container_webui.stable', 'desktop.latest'], 'Docker manual override protected pointers');

  assertFieldsMatch(release?.cohort_policy?.current_development_state, {
    desktop_and_webui: 'desktop_packaged_webui_and_container_dual_track',
    independent_version_and_cadence_allowed: true,
    same_production_cohort_claim_allowed: false,
  }, 'Current Desktop/WebUI cohort');
  assertFieldsMatch(release?.cohort_policy?.approved_production_target, {
    model: 'one_app_product_multiple_independently_versioned_carriers',
    same_app_version_required_across_runtime_forms: false,
    compatibility_admission_ref: 'contracts/app-install-exposure-policy.json#component_interoperability.compatibility_admission',
    same_official_profile_intent_required: true,
    physical_artifact_bytes_must_match: false,
    framework_reconciliation_and_product_behavior_must_converge: true,
  }, 'Production carrier target');

  assertFieldsMatch(releaseChannel.nightly_standard, {
    status: 'implemented',
    full_first_install_allowed: false,
    quality_status: 'preview',
    build_trigger: 'automated',
    preview_kind: 'nightly',
    scheduled_latest_release_allowed: false,
    explicit_user_override_may_move_latest: true,
  }, 'Current Nightly publication state');
  assertFieldsMatch(release?.implementation_state, { desktop_nightly: 'implemented', homebrew_full: 'implemented' }, 'Distribution implementation state');
  assertFieldsMatch(release?.publication_history?.desktop_nightly, {
    product_channel_semantics_retained: true,
    historical_payload_density: 'standard',
    historical_full_by_default: false,
    current_publication_workflow_present: true,
    new_publication_status: 'implemented',
  }, 'Nightly publication history');
  assertFieldsMatch(release?.approved_targets?.desktop_nightly, {
    status: 'implemented',
    quality_status: 'preview',
    build_trigger: 'automated',
    preview_kind: 'nightly',
    payload_density: 'standard',
    full_by_default: false,
    scheduled_latest_allowed: false,
    explicit_user_override_may_move_latest: true,
    homebrew_cask: 'one-person-lab-nightly',
  }, 'Nightly target');

  const releaseHomebrew = releaseChannel.homebrew_tap_distribution;
  if (releaseHomebrew?.excluded_casks?.includes('one-person-lab-full') !== false || releaseHomebrew?.full_casks?.includes('one-person-lab-full') !== true) {
    throw new Error('Homebrew tap distribution must include one-person-lab-full as Full cask and not excluded');
  }
  assertFieldsMatch(releaseHomebrew?.tap_update_policy?.full, { homebrew_publish_allowed: true }, 'Full Cask publication');
  assertFieldsMatch(releaseHomebrew?.tap_update_policy?.nightly, { mutation_allowed: true }, 'Nightly Cask mutation');
  assertFieldsMatch(release?.approved_targets?.homebrew_full, {
    formula_dependency_target: false,
    generation_status: 'implemented',
    generator: 'scripts/update-homebrew-tap.ts',
    package_kind: 'app_full_first_install',
    framework_carrier_target: 'full_dmg_embedded_opl_base',
    active_framework_count_target: 1,
    digest_cas_required: true,
    public_promotion_status: 'approved_pending_first_protected_follower_readback',
  }, 'Full Cask target');
  assertDeepEqualJson(release?.approved_targets?.homebrew_full?.cask_conflicts_required, ['one-person-lab', 'one-person-lab-nightly'], 'Full Cask target conflicts');

  assertFieldsMatch(install?.consistency_target, {
    name: 'official_profile_converged',
    physical_byte_identity_required: false,
    base_app_and_packages_version_lockstep_required: false,
    same_product_behavior_contract_required: true,
    same_official_profile_intent_required: true,
    configured_carrier_terminal_readback_required: true,
    active_framework_count: 1,
    package_published_current_stable_authority: 'package_owner_declared_publication_or_configured_native_carrier',
    package_installed_callable_authority: 'configured_carrier_readback_aggregated_by_framework',
  }, 'Install consistency target');

  assertFieldsMatch(install?.runtime_forms?.desktop, {
    electron_required: true,
    browser_webui_mode: 'packaged_desktop_bytes',
    native_tarball_carrier: 'retired',
  }, 'Desktop runtime form');
  assertFieldsMatch(install?.runtime_forms?.container_webui, {
    target: 'container_adapter_over_the_same_product_webui_runtime',
  }, 'Container WebUI target');
  const linuxDesktop = release?.approved_targets?.desktop_linux_x86_64;
  assertFieldsMatch(linuxDesktop, {
    status: 'implemented',
    publication_carrier: 'app_github_release_assets',
    desktop_asset: 'One-Person-Lab-<version>-linux-x64.deb',
    installer_asset: 'opl-install.sh',
    browser_webui_mode: 'packaged_desktop_bytes',
    native_tarball_carrier: 'retired',
  }, 'Linux Desktop release target');
  assertDeepEqualJson(linuxDesktop?.container_ghcr_tags_must_remain_unchanged, ['latest', 'stable'], 'Linux Desktop Container tag boundary');
  assertDeepEqualJson(linuxDesktop?.promotion_requires, [
    'exact_desktop_asset_and_component_manifest_digest',
    'install_update_rollback_and_data_preservation',
    'framework_and_official_profile_convergence',
    'public_digest_readback',
  ], 'Linux Desktop promotion gates');
  assertFieldsMatch(release?.approved_targets, { native_webui: undefined }, 'Retired Native WebUI release target');

  const installer = install?.installer_convergence;
  assertDeepEqualJson(installer?.current_default_app_script?.framework_arguments, ['--with-app'], 'Current App installer Framework arguments');
  assertFieldsMatch(installer?.current_default_app_script, { official_profile_converged_by_installer: true }, 'Current App installer convergence');
  const universal = installer?.approved_universal_target;
  assertFieldsMatch(universal, {
    macos_default: 'desktop',
    linux_personal_default: 'desktop',
    server_or_isolated_explicit: 'container_webui',
    headless_explicit: 'opl_base_only',
    result: 'official_profile_converged',
  }, 'Universal install target');
  assertFieldsMatch(universal?.installer_artifact_identity, {
    asset_name: 'opl-install.sh',
    asset_url: 'exact_release_asset_url',
    asset_size: 'exact_release_asset_size',
    asset_sha256: 'exact_release_asset_sha256',
    release_tag: 'OPL_FROZEN_RELEASE_TAG',
    source_ref_role: 'recorded_build_provenance_only_never_dependency_selection_or_compatibility_gate',
  }, 'Universal installer artifact identity');
  assertFieldsMatch(universal?.installer_artifact_identity?.same_tag_additive_repair, {
    allowed: true,
    requires_original_stable_cohort: true,
    requires_previous_asset_id_and_digest_cas: true,
    requires_public_supersession_receipt: true,
    requires_clean_linux_install_certification: true,
    new_release_or_version_required: false,
    macos_primary_assets_release_body_tag_and_updater_metadata_must_remain_unchanged: true,
  }, 'Universal installer same_tag_additive_repair');
  assertDeepEqualJson(universal?.installer_artifact_identity?.same_tag_additive_repair?.allowed_asset_names, ['opl-install.sh'], 'Universal installer repair assets');
  assertFieldsMatch(universal?.container_webui, {
    image_repository: 'ghcr.io/gaofeng21cn/one-person-lab-webui',
    tag: 'selected_container_carrier_exact_version',
    mutable_latest_fallback_allowed: false,
    missing_exact_tag: 'typed_blocker',
  }, 'Universal Container WebUI version binding');

  const desktopIdentity = universal?.desktop_release_identity;
  if (Object.hasOwn(desktopIdentity ?? {}, 'macos_x64_adjunct_resolution')) {
    throw new Error('Desktop release identity must not declare macos_x64_adjunct_resolution');
  }
  assertFieldsMatch(desktopIdentity, {
    repository: 'gaofeng21cn/one-person-lab-app',
    release_selector: 'github_latest_pointer_exact_release',
    exact_tag_download_url_required: true,
    native_artifact_discovery_allowed: false,
    target_selection: 'host_platform_and_architecture',
  }, 'Desktop release identity');
  assertDeepEqualJson(desktopIdentity?.required_asset_roles, ['platform_desktop_payload', 'component_manifest', 'release_universal_installer'], 'Desktop release required asset roles');
  assertFieldsMatch(desktopIdentity?.full_same_tag_resolution, {
    identity_source: 'exact_standard_release_record_plus_full_manifest_and_unified_attestation',
    discovery_route: 'selected_standard_release_assets_only',
    tag_binding: 'same_as_selected_standard_release_tag',
    exact_same_tag_readback_required: true,
    explicit_full_missing_ambiguous_or_invalid: 'fail_closed',
    implicit_full_fallback: 'standard_only_when_same_tag_full_asset_is_confirmed_absent',
    standard_asset_overwrite_or_delete_allowed: false,
    release_latest_or_updater_mutation_allowed: false,
    standard_release_identity_or_bundle_digest_binding_allowed: false,
    cross_component_source_cohort_binding_allowed: false,
  }, 'Desktop Full same-tag resolution');
  assertIncludesAll(desktopIdentity?.full_same_tag_resolution?.required_assets, ['full_dmg', 'opl-release-manifest.json', 'opl-release-attestation.json'], 'Desktop Full same-tag assets');
  assertFieldsMatch(desktopIdentity?.linux_x64_same_tag_resolution, {
    identity_source: 'exact_stable_release_component_manifest_and_desktop_platforms_manifest',
    discovery_route: 'selected_stable_release_assets_only',
    tag_binding: 'same_as_selected_stable_release_tag',
    exact_tag_readback_required: true,
    missing_ambiguous_or_invalid: 'fail_closed',
    cross_release_fallback_allowed: false,
  }, 'Desktop Linux x64 same-tag resolution');
  assertIncludesAll(desktopIdentity?.linux_x64_same_tag_resolution?.required_assets, ['component_manifest', 'release_universal_installer', 'linux_x64_deb', 'opl-desktop-platforms-manifest.json'], 'Desktop Linux x64 same-tag assets');

  assertFieldsMatch(installer?.stable_macos_helper, {
    current_status: 'direct_component_manifest_entrypoint',
    compatibility_wrapper_status: 'retired',
  }, 'Stable macOS helper');
  assertDeepEqualJson(installer?.stable_macos_helper?.compatibility_entrypoints, [], 'Direct macOS compatibility entrypoints');
  assertDeepEqualJson(installer?.stable_macos_helper?.retired_compatibility_entrypoints, ['install-stable.sh'], 'Retired macOS compatibility entrypoints');
  assertFieldsMatch(installer?.stable_macos_helper?.artifact_integrity, {
    official_release_asset_authority: 'exact_github_release_record_asset_digest',
    component_manifest_authority: 'exact_github_release_record_component_manifest_asset_digest',
    verification_order: 'dmg_and_component_manifest_before_mount_copy_or_target_replacement',
    latest_pointer_does_not_imply_stable_qualification: true,
    non_stable_disclosure_before_target_mutation: true,
  }, 'Direct macOS installer artifact integrity');

  const installHomebrew = install?.homebrew_carriers;
  assertFieldsMatch(installHomebrew?.standard, { formula_dependency_current: true, formula_dependency_target: true }, 'Standard Cask Formula dependency');
  assertFieldsMatch(installHomebrew?.nightly, {
    dmg_profile: 'standard_nightly',
    product_channel_semantics: 'retained_standard_prerelease',
    full_by_default: false,
    new_publication_status: 'implemented',
    formula_dependency_required: true,
  }, 'Nightly Cask config');
  assertFieldsMatch(installHomebrew?.full, {
    dmg_embeds_opl_base: true,
    formula_dependency_current: true,
    duplicate_base_carrier_risk_current: true,
    formula_dependency_target: false,
    target_generation_status: 'implemented',
    target_generator_ref: 'scripts/update-homebrew-tap.ts',
    target_framework_carrier: 'full_dmg_embedded_opl_base',
    target_digest_cas_required: true,
    target_requires_active_framework_count: 1,
  }, 'Full Cask config');
  assertFieldsMatch(installHomebrew?.quarantine, {
    homebrew_cask_automatically_clears_quarantine_current: false,
    current_clean_vm_harness_clears_quarantine_outside_homebrew: true,
  }, 'Homebrew quarantine boundary');

  const expectedCaskPayloadProfiles = {
    standard: ['opl_app'],
    nightly: ['opl_app'],
    full: ['opl_app', 'opl_base_offline_seed', 'opl_package_offline_seeds'],
  };
  const lifecycle = installExposurePolicy?.software_lifecycle;
  assertDeepEqualJson(lifecycle?.carrier_adapters?.homebrew_cask?.payload_profiles, expectedCaskPayloadProfiles, 'Homebrew Cask payload profiles');
  assertFieldsMatch(lifecycle?.carrier_adapters?.homebrew_cask, { full_seed_activation_owner: 'one-person-lab' }, 'Homebrew Full seed activation owner');
  assertDeepEqualJson(releaseHomebrew?.carrier_adapter_semantics?.cask?.payload_profiles, expectedCaskPayloadProfiles, 'Release Homebrew Cask payload profiles');
  assertFieldsMatch(releaseHomebrew?.carrier_adapter_semantics?.cask, { full_seed_activation_owner: 'one-person-lab' }, 'Release Homebrew seed owner');

  const installChannel = installExposurePolicy?.distribution_channels?.homebrew;
  assertFieldsMatch(installChannel?.casks, {
    standard_app: installHomebrew?.standard?.cask,
    nightly_standard_app: installHomebrew?.nightly?.cask,
    full_first_install_app: installHomebrew?.full?.cask,
  }, 'Install Homebrew cross-contract cask names');
  assertDeepEqualJson(installChannel?.carrier_adapter_semantics?.cask?.payload_profiles, expectedCaskPayloadProfiles, 'Install Homebrew Cask payload profiles');
}
