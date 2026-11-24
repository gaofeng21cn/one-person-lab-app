import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';

function validateDistributionSemantics(semantics) {
  const latest = semantics?.latest_policy;
  const selector = latest?.durable_publication_record_selector;
  const dockerOverride = latest?.docker_manual_override;
  if (
    latest?.default_automatic_writer !== 'newest_qualified_stable'
    || latest?.default_behavior !==
      'each_carrier_advances_its_own_latest_pointer_when_that_carrier_publishes_a_new_qualified_stable'
    || latest?.automatic_preview_or_nightly_writer_may_move_latest !== false
    || latest?.explicit_user_override?.target !== 'any_exact_published_version'
    || latest?.explicit_user_override?.authority !== 'protected_single_use'
    || latest?.explicit_user_override?.compare_and_swap !== 'exact_expected_current'
    || latest?.explicit_user_override?.public_readback !== 'exact_tag_digest_quality_and_disclosure'
    || latest?.explicit_user_override?.quality_unchanged !== true
    || latest?.explicit_user_override?.persistent_override !== false
    || latest?.explicit_user_override
      ?.non_stable_and_skipped_or_failed_gate_disclosure_required_for_preview_only !== true
    || latest?.explicit_user_override?.stable_candidate_requires_stable_qualification_disclosure !== true
    || latest?.move_latest_pointer?.target !== 'any_exact_published_version'
    || latest?.move_latest_pointer?.changes_quality !== false
    || latest?.move_latest_pointer?.explicit_user_override_required !== true
    || latest?.move_latest_pointer?.stable_or_preview_candidate_allowed !== true
    || latest?.next_qualified_stable_reclaims_pointer !== true
    || latest?.latest_pointer_does_not_define_highest_published_stable !== true
    || latest?.failure_preserves_current_latest_lkg !== true
    || selector?.selector !== 'carrier_owned_durable_publication_record'
    || selector?.candidate_target !== 'retained_immutable_verified_published_version'
    || selector?.actions_artifact?.selection_authority !== false
    || selector?.actions_artifact?.expiry_or_retention_may_change_selection_eligibility !== false
    || selector?.actions_artifact?.allowed_role !== 'transient_prepublication_transport_or_diagnostic_evidence_only'
    || selector?.retention?.selection_eligible_state !== 'retained_not_retired_or_revoked'
    || selector?.retention?.record_must_remain_readable_until_retired !== true
    || selector?.retention?.retired_or_revoked_record_selectable !== false
    || dockerOverride?.target !== 'retained_immutable_verified_published_version'
    || dockerOverride?.requires_explicit_user_confirmation !== true
    || dockerOverride?.operator_confirmation?.source !== 'workflow_dispatch_exact_version_confirmation'
    || dockerOverride?.operator_confirmation?.expected_value !== 'move-docker-latest:<exact_version>'
    || dockerOverride?.operator_confirmation?.actor !== 'github_human_login'
    || dockerOverride?.operator_confirmation?.digest_bound_into_terminal_receipt !== true
    || dockerOverride?.selector !== 'carrier_owned_durable_publication_record'
    || dockerOverride?.compare_and_swap !== 'exact_expected_current'
    || dockerOverride?.fresh_public_readback_required !== true
  ) {
    throw new Error('Distribution Latest semantics must keep carrier pointers independent from Stable quality while requiring exact explicit overrides');
  }
  assertDeepEqualJson(
    selector.candidate_record_must_bind,
    [
      'carrier_namespace',
      'exact_version_or_tag',
      'immutable_artifact_or_image_digest',
      'quality_status_and_preview_kind',
      'qualification_disclosure',
      'public_readback',
    ],
    'Durable publication record selector bindings',
  );
  assertDeepEqualJson(
    selector.evidence_requirements,
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
  assertDeepEqualJson(
    dockerOverride.mutation_scope,
    ['container_webui.latest'],
    'Docker manual override mutation scope',
  );
  assertDeepEqualJson(
    dockerOverride.must_not_mutate,
    ['container_webui.stable', 'desktop.latest'],
    'Docker manual override protected pointers',
  );
  assertDeepEqualJson(
    latest.explicit_user_override.quality_statuses,
    ['stable', 'preview'],
    'Latest explicit override quality statuses',
  );
  assertDeepEqualJson(
    latest.explicit_user_override.preview_kinds,
    ['dev', 'nightly'],
    'Latest explicit override Preview kinds',
  );
}
function validateWebuiGhcrImage(webuiImage) {
  const contract = webuiImage?.runtime_image_contract;
  if (
    webuiImage?.owner !== 'one-person-lab-app' ||
    webuiImage?.distribution_role !== 'preheated_webui_runtime_image_not_desktop_app_gui_shell' ||
    contract?.image_role !== 'browser_entrypoint_for_opl_on_linux_container' ||
    contract?.platform_matrix?.release_tier !== 'stable_additional_required' ||
    JSON.stringify(contract?.platform_matrix?.required_platforms) !== JSON.stringify(['linux/amd64', 'linux/arm64']) ||
    contract?.platform_matrix?.runner_by_architecture?.amd64 !== 'ubuntu-24.04' ||
    contract?.platform_matrix?.runner_by_architecture?.arm64 !== 'ubuntu-24.04-arm' ||
    contract?.platform_matrix?.native_runtime_qualification_required !== true ||
    contract?.platform_matrix?.qualification_trigger !== 'stable_standard_or_manual_non_public_qualification_or_protected_repair' ||
    contract?.platform_matrix?.included_in_pr_or_main_ci !== false ||
    contract?.platform_matrix?.qemu_or_other_emulation_counts_as_runtime_qualification !== false ||
    contract?.platform_matrix?.version_tag_shape !== 'one_oci_index_with_exact_amd64_and_arm64_children' ||
    contract?.platform_matrix?.docker_client_selection !== 'automatic_by_host_architecture' ||
    contract?.profiles?.webui_full?.default_for_beginner_and_latest_channel !== true ||
    contract?.profiles?.webui_full?.metadata_only_allowed !== false ||
    contract?.profiles?.webui_slim?.version_tag !== '<app_or_opl_version>-slim' ||
    contract?.profiles?.webui_slim?.stable_channel_allowed !== false ||
    contract?.profiles?.webui_slim?.moving_tags_allowed !== false ||
    webuiImage?.publication_route !== 'stable_same_cohort_additional_carrier_with_manual_repair_entry' ||
    webuiImage?.desktop_release_bundle_may_publish_or_move_tags !== true ||
    webuiImage?.current_writer_declared_by_desktop_release_contract !== true
  ) {
    throw new Error('Release channel must declare Docker/WebUI full and slim image profile boundaries');
  }
  assertIncludesAll(
    contract.required_runtime_contents,
    [
      'shared_studio_renderer',
      'studio_headless_host',
      'codex_app_server',
      'opl_framework',
      'image_manifest',
      'opl_seed_metadata',
      'official_profile_resources',
    ],
    'Docker/WebUI runtime image required contents',
  );
  assertIncludesAll(
    contract.profiles.webui_full?.required_seed_components,
    ['opl_framework', 'codex_cli'],
    'Docker/WebUI full image seed components',
  );
  assertDeepEqualJson(
    contract.profiles.webui_full?.seed_strategy,
    ['payload_manifest', 'payload_preheated'],
    'Docker/WebUI full image seed strategy',
  );
  assertDeepEqualJson(
    contract.profiles.webui_full?.required_tags,
    ['<app_or_opl_version>', 'stable', 'latest'],
    'Docker/WebUI full image tags',
  );
  assertDeepEqualJson(
    contract.profiles.webui_slim?.seed_strategy,
    ['metadata_only'],
    'Docker/WebUI slim image seed strategy',
  );
  if (
    contract.image_manifest?.canonical_path !== '/opt/opl/image-manifest.json' ||
    contract.seed_metadata?.canonical_path !== '/opt/opl/seed/metadata.json' ||
    contract.publish_gate?.script !== 'scripts/validate-webui-runtime-image.ts' ||
    contract.publish_gate?.moving_channel_expected_profile !== 'webui-full' ||
    contract.publish_gate?.default_latest_alias_requires_stable_quality_gate !== true ||
    contract.publish_gate
      ?.explicit_preview_latest_requires_exact_qualified_carrier_and_protected_override !== true ||
    contract.publish_gate?.forbidden_success_state !== 'metadata_only_seed_promoted_to_latest_or_stable' ||
    webuiImage.stable_promotion?.schema !== 'opl_app_webui_stable_promotion_contract.v8' ||
    webuiImage.stable_promotion?.workflow !== '.github/workflows/release-webui-stable.yml' ||
    webuiImage.stable_promotion?.trigger !== 'automatic_same_cohort_stable_additional_release_or_explicit_same_version_repair' ||
    webuiImage.stable_promotion?.desktop_release_dependency !== true ||
    webuiImage.stable_promotion?.desktop_release_follower_allowed !== true ||
    JSON.stringify(webuiImage.stable_promotion?.source_workflows) !== JSON.stringify([
      '.github/workflows/release-stable.yml',
      '.github/workflows/release-webui-development.yml',
    ]) ||
    JSON.stringify(webuiImage.stable_promotion?.entry_operations) !== JSON.stringify([
      'standard',
      'resume_standard',
      'publish',
      'promote',
    ]) ||
    webuiImage.stable_promotion?.immutable_version_required !== false ||
    webuiImage.stable_promotion?.public_version_tag_written_last !== true ||
    webuiImage.stable_promotion?.failed_internal_attempt_may_allocate_revision !== false ||
    webuiImage.stable_promotion?.compare_and_swap?.same_digest_is_idempotent !== true ||
    webuiImage.stable_promotion?.compare_and_swap?.unexpected_digest !== 'replace_once_with_fresh_prestate_and_final_readback' ||
    webuiImage.stable_promotion?.compare_and_swap?.maximum_tag_attempts !== 1 ||
    webuiImage.stable_promotion?.compare_and_swap?.force_allowed !== true ||
    webuiImage.stable_promotion?.unknown_outcome?.retry_allowed !== false ||
    webuiImage.stable_promotion?.unknown_outcome?.bounded_read_only_reconcile_required !== true
  ) {
    throw new Error('Docker/WebUI GHCR publishing must remain a same-cohort Stable carrier with last-write version publication');
  }
  assertIncludesAll(
    contract.publish_gate?.must_read_back,
    [
      'docker_image_inspect',
      'image_manifest',
      'seed_metadata',
      'runtime_cli_shims',
      'persistent_volume_restart_readback',
      'preheated_payload_files',
      'declared_volumes',
      'runtime_env',
      'projects_mount_readback',
      'install_manifest_receipt',
      'startup_maintenance_log',
      'auto_login_smoke',
    ],
    'Docker/WebUI publish gate readback',
  );
}

export { validateDistributionSemantics, validateWebuiGhcrImage };
