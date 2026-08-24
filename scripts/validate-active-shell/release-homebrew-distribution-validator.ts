import { assertDeepEqualJson, assertIncludesAll } from './assertions.ts';
import { assertExpectedFields } from '../value-assertions.ts';

export function validateReleaseHomebrewDistribution(releaseChannel) {
  const homebrew = releaseChannel.homebrew_tap_distribution;
  if (
    homebrew?.owner !== 'one-person-lab-app' ||
    homebrew?.tap_repo !== 'gaofeng21cn/homebrew-one-person-lab' ||
    homebrew?.role !== 'downstream_opl_base_formula_and_app_cask_index' ||
    homebrew?.cohort_manifest_required !== true
  ) {
    throw new Error('Release channel Homebrew tap distribution must be an App-owned cask cohort install index');
  }
  assertDeepEqualJson(homebrew.formulae, [], 'Release channel Homebrew formulae');
  assertDeepEqualJson(homebrew.allowed_formulae, ['opl'], 'Release channel allowed Homebrew formulae');
  assertDeepEqualJson(
    homebrew.allowed_casks,
    ['one-person-lab', 'one-person-lab-nightly', 'one-person-lab-full'],
    'Release channel allowed Homebrew casks',
  );
  assertDeepEqualJson(
    homebrew.casks,
    ['one-person-lab', 'one-person-lab-nightly', 'one-person-lab-full'],
    'Release channel currently managed Homebrew casks',
  );
  assertDeepEqualJson(homebrew.carrier_adapter_semantics, {
    formula: {
      software_object: 'opl_base',
      formula: 'opl',
      lifecycle_owner: 'one-person-lab',
      app_tap_manages_formula: false,
      opl_packages_allowed: false,
    },
    cask: {
      software_object: 'opl_app',
      lifecycle_owner: 'one-person-lab-app',
      base_or_packages_mutation_allowed: false,
      payload_profiles: {
        standard: ['opl_app'],
        nightly: ['opl_app'],
        full: ['opl_app', 'opl_base_offline_seed', 'opl_package_offline_seeds'],
      },
      full_seed_activation_owner: 'one-person-lab',
    },
    equivalent_direct_carriers: {
      opl_base: 'framework_installer',
      opl_app: 'signed_installer_or_dmg',
    },
    carrier_choice_changes_lifecycle_owner: false,
  }, 'Release channel Homebrew carrier adapter semantics');
  validateReleaseHomebrewCaskInstallPolicy(homebrew);
  validateReleaseHomebrewTapUpdatePolicy(homebrew);
  validateReleaseHomebrewVmGate(releaseChannel);
  validateReleaseHomebrewOplPackagesBoundary(homebrew);
  validateReleaseHomebrewCodexTemporalPolicy(homebrew);
}

function validateReleaseHomebrewCaskInstallPolicy(homebrew) {
  if (
    homebrew.cask_install_policy?.standard_cask !== 'one-person-lab' ||
    homebrew.cask_install_policy?.standard_cask_install_ref !== 'gaofeng21cn/one-person-lab/one-person-lab' ||
    homebrew.cask_install_policy?.fully_qualified_cask_install !== true ||
    homebrew.cask_install_policy?.trust_scope !== 'explicit_standard_and_conflicting_cask_refs_not_whole_tap'
  ) {
    throw new Error('Release channel Homebrew installs must use fully qualified cask refs without broadly trusting the tap');
  }
  assertDeepEqualJson(
    homebrew.cask_install_policy?.standard_install_trusted_cask_refs,
    [
      'gaofeng21cn/one-person-lab/one-person-lab',
      'gaofeng21cn/one-person-lab/one-person-lab-full',
      'gaofeng21cn/one-person-lab/one-person-lab-nightly',
    ],
    'Release channel Homebrew trusted cask refs',
  );
  assertDeepEqualJson(
    homebrew.initial_live_targets,
    ['Casks/one-person-lab.rb', 'Casks/one-person-lab-nightly.rb', 'Casks/one-person-lab-full.rb'],
    'Release channel Homebrew initial live targets',
  );
  assertDeepEqualJson(
    homebrew.forbidden_package_formulae,
    ['mas', 'mag', 'rca', 'oma', 'obf', 'mas-scholar-skills', 'opl-flow'],
    'Release channel forbidden Package-specific Homebrew formulae',
  );
  assertDeepEqualJson(
    homebrew.forbidden_package_casks,
    ['mas', 'mag', 'rca', 'oma', 'obf', 'mas-scholar-skills', 'opl-flow'],
    'Release channel forbidden Package-specific Homebrew casks',
  );
  assertDeepEqualJson(homebrew.excluded_casks, [], 'Release channel excluded Homebrew casks');
  assertDeepEqualJson(homebrew.full_casks, ['one-person-lab-full'], 'Release channel Full Homebrew casks');
  assertDeepEqualJson(homebrew.nightly_formulae, [], 'Release channel Homebrew nightly formulae');
  assertDeepEqualJson(homebrew.nightly_casks, ['one-person-lab-nightly'], 'Release channel Homebrew nightly casks');
}

function validateReleaseHomebrewTapUpdatePolicy(homebrew) {
  const tapUpdate = homebrew.tap_update_policy;
  assertExpectedFields(
    [
      {
        actual: tapUpdate?.discovery_model,
        expected: 'user_taps_github_homebrew_tap_repo_then_homebrew_reads_formula_or_cask',
      },
      { actual: tapUpdate?.download_source, expected: 'app_owned_github_release_asset_url' },
      {
        actual: tapUpdate?.default_remote_write_path,
        expected: 'post_publication_non_blocking_digest_bound_follower',
      },
      { actual: tapUpdate?.default_workflow_repo, expected: 'gaofeng21cn/one-person-lab-app' },
      { actual: tapUpdate?.default_workflow, expected: '.github/workflows/release-homebrew-standard-follower.yml' },
      { actual: tapUpdate?.tap_sync_script, expected: null },
      { actual: tapUpdate?.app_release_promotion_workflow, expected: '.github/workflows/release-stable.yml' },
      { actual: tapUpdate?.tap_owned_stable_distribution_workflow, expected: null },
      { actual: tapUpdate?.app_release_direct_workflow, expected: null },
      { actual: tapUpdate?.app_release_direct_token, expected: 'release-stable.OPL_HOMEBREW_TAP_TOKEN' },
      { actual: tapUpdate?.app_release_pull_request_allowed, expected: false },
      {
        actual: tapUpdate?.app_release_workflow_write_mode,
        expected: 'protected_environment_post_publication_follower_exact_cas',
      },
      {
        actual: tapUpdate?.stable_release_workflow_write_mode,
        expected: 'post_publication_non_blocking_follower',
      },
      {
        actual: tapUpdate?.direct_commit_conflict_policy,
        expected:
          'Apply against the exact current Cask SHA and push once without force. A mismatched result fails only the follower; a later follower rerun starts from fresh public Cask state and never allocates a release version.',
      },
      { actual: tapUpdate?.planner_script, expected: 'scripts/update-homebrew-tap.ts' },
      {
        actual: tapUpdate?.nightly?.mode,
        expected: 'post_publication_digest_bound_single_attempt_follower',
      },
      {
        actual: tapUpdate?.nightly?.workflow,
        expected: '.github/workflows/release-nightly-homebrew-follower.yml',
      },
      { actual: tapUpdate?.nightly?.environment, expected: 'release-nightly' },
      {
        actual: tapUpdate?.nightly?.credential?.kind,
        expected: 'repository_scoped_write_deploy_key',
      },
      {
        actual: tapUpdate?.nightly?.credential?.repository,
        expected: 'gaofeng21cn/homebrew-one-person-lab',
      },
      {
        actual: tapUpdate?.nightly?.credential?.secret,
        expected: 'release-nightly.OPL_HOMEBREW_TAP_DEPLOY_KEY',
      },
      {
        actual: tapUpdate?.nightly?.credential?.stable_environment_credentials_reused,
        expected: false,
      },
      { actual: tapUpdate?.nightly?.target, expected: 'Casks/one-person-lab-nightly.rb' },
      { actual: tapUpdate?.nightly?.may_update_stable, expected: false },
      { actual: tapUpdate?.nightly?.mutation_allowed, expected: true },
      { actual: tapUpdate?.nightly?.stable_cask_must_remain_exact, expected: true },
      {
        actual: tapUpdate?.nightly?.unknown_or_conflicting_result,
        expected: 'fail_closed_no_retry_rerun_or_redispatch',
      },
      {
        actual: tapUpdate?.stable?.mode,
        expected: 'post_publication_digest_bound_cas_follower',
      },
      {
        actual: tapUpdate?.stable?.publication_mode,
        expected: 'post_publication_digest_bound_cas_follower',
      },
      { actual: tapUpdate?.stable?.workflow, expected: '.github/workflows/release-homebrew-standard-follower.yml' },
      { actual: tapUpdate?.stable?.environment, expected: 'release-stable' },
      { actual: tapUpdate?.stable?.target, expected: 'Casks/one-person-lab.rb' },
      { actual: tapUpdate?.stable?.source_completed_stage, expected: 'standard_public_and_latest_activated' },
      { actual: tapUpdate?.stable?.mutation_allowed, expected: true },
      { actual: tapUpdate?.stable?.core_release_or_latest_blocking, expected: false },
      { actual: tapUpdate?.stable?.same_tag_replacement_allowed, expected: true },
      { actual: tapUpdate?.stable?.new_release_version_required_for_changed_bytes, expected: false },
      { actual: tapUpdate?.stable?.exact_current_cask_sha256_cas_required, expected: true },
      { actual: tapUpdate?.stable?.fresh_cas_rerun_allowed, expected: true },
      { actual: tapUpdate?.stable?.may_consume_nightly_directly, expected: false },
      { actual: tapUpdate?.full?.mode, expected: 'post_publication_digest_bound_single_attempt_follower' },
      { actual: tapUpdate?.full?.workflow, expected: '.github/workflows/release-homebrew-full-follower.yml' },
      { actual: tapUpdate?.full?.environment, expected: 'release-stable' },
      { actual: tapUpdate?.full?.target, expected: 'Casks/one-person-lab-full.rb' },
      { actual: tapUpdate?.full?.homebrew_publish_allowed, expected: true },
      { actual: tapUpdate?.full?.mutation_allowed, expected: true },
      { actual: tapUpdate?.full?.source_completed_stage, expected: 'full_qualified' },
      { actual: tapUpdate?.full?.homebrew_clean_vm_gate_required, expected: false },
      { actual: tapUpdate?.full?.may_update_standard_cask, expected: false },
      { actual: tapUpdate?.full?.may_update_nightly_cask, expected: false },
      { actual: tapUpdate?.full?.standard_updater_visible, expected: false },
      { actual: tapUpdate?.full?.standard_assets_notes_updater_or_latest_may_change, expected: false },
      { actual: tapUpdate?.full?.framework_carrier, expected: 'full_dmg_embedded_opl_base' },
      { actual: tapUpdate?.full?.formula_dependency_required, expected: false },
      { actual: tapUpdate?.full?.promotion_status, expected: 'approved_pending_first_protected_follower_readback' },
      {
        actual: tapUpdate?.full?.unknown_or_conflicting_result,
        expected: 'fail_closed_no_retry_rerun_or_redispatch',
      },
      { actual: tapUpdate?.version_identity?.cask_version, expected: 'updater_version' },
      { actual: tapUpdate?.version_identity?.release_tag_and_asset_url, expected: 'display_version' },
      {
        actual: tapUpdate?.version_identity?.formula_dependency_policy,
        expected: 'standard_requires_opl_formula_full_forbids_formula',
      },
    ],
    'Release channel Homebrew tap update policy must use tap self-sync and separate nightly automation from stable promotion',
  );
  assertIncludesAll(
    tapUpdate?.required_manifest_fields,
    [
      'channel',
      'artifact',
      'sha256',
      'manifest_url',
      'local_authorization_policy_ref',
      'release_set_generation',
      'release_set_manifest_digest',
    ],
    'Release channel Homebrew cohort manifest fields',
  );
}

function validateReleaseHomebrewVmGate(releaseChannel) {
  const homebrewVmGate = releaseChannel.release_acceleration?.vm_gates?.find(
    (gate: { id?: string }) => gate.id === 'homebrew_standard_cask_clean_vm_smoke',
  );
  if (
    homebrewVmGate?.install_mode !== 'homebrew-cask' ||
    homebrewVmGate?.homebrew_cask_install_ref !== 'gaofeng21cn/one-person-lab/one-person-lab' ||
    homebrewVmGate?.homebrew_trust_scope !== 'explicit_standard_and_conflicting_cask_refs_not_whole_tap' ||
    homebrewVmGate?.source_vm_variable !== 'OPL_FIRST_RUN_TART_SOURCE'
  ) {
    throw new Error('Release channel Homebrew VM smoke must use explicit cask trust refs and the shared clean Tart source variable');
  }
  assertDeepEqualJson(
    homebrewVmGate?.homebrew_trusted_cask_refs,
    [
      'gaofeng21cn/one-person-lab/one-person-lab',
      'gaofeng21cn/one-person-lab/one-person-lab-full',
      'gaofeng21cn/one-person-lab/one-person-lab-nightly',
    ],
    'Release channel Homebrew VM trusted cask refs',
  );
}

function validateReleaseHomebrewOplPackagesBoundary(homebrew) {
  assertDeepEqualJson(homebrew.opl_packages_boundary, {
    software_object: 'opl_packages',
    lifecycle_owner: 'one-person-lab',
    app_role: 'status_action_and_receipt_projection_only',
    homebrew_role: 'not_a_distribution_target',
    homebrew_distribution_allowed: false,
    homebrew_formula_allowed: false,
    homebrew_cask_allowed: false,
    canonical_lifecycle: 'opl packages',
    source_policy: 'framework_resolved_compatible_source',
    package_set_policy: 'open_composition_no_fixed_package_ids',
    allowed_homebrew_formulae: ['opl'],
    allowed_homebrew_casks: ['one-person-lab', 'one-person-lab-nightly', 'one-person-lab-full'],
  }, 'Release channel Homebrew OPL Packages boundary');
}

function validateReleaseHomebrewCodexTemporalPolicy(homebrew) {
  if (
    homebrew.codex_temporal_policy?.compatibility_mode !== 'minimum_version_plus_capability_smoke' ||
    homebrew.codex_temporal_policy?.prefer_valid_newer_system_tool !== true ||
    homebrew.codex_temporal_policy?.bundled_fallback_allowed !== true
  ) {
    throw new Error('Release channel Codex/Temporal policy must prefer compatible newer user tools with bundled fallback');
  }
}
