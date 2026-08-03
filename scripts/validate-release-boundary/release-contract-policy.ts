import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  githubApplyFullRequiredOptionNames,
  githubApplyRequiredOptionNames,
} from '../framework-release-adapter.ts';
import type { ReleaseValidationProfile } from './release-checks.ts';

const requiredHomebrewStandardCaskRef = 'gaofeng21cn/one-person-lab/one-person-lab';
const requiredHomebrewTrustedCaskRefs = [
  'gaofeng21cn/one-person-lab/one-person-lab',
  'gaofeng21cn/one-person-lab/one-person-lab-full',
  'gaofeng21cn/one-person-lab/one-person-lab-nightly',
];
const requiredHomebrewTrustScope = 'explicit_standard_and_conflicting_cask_refs_not_whole_tap';
const requiredSourceGateScopes = [
  'App release-boundary contract',
  'current App profile against exact Shell consumer in a temporary archive',
  'shell format',
  'shell type',
  'active shell node/dom tests',
  'shell ref resolution',
  'framework ref resolution',
];
const requiredSourceGatePrecedes = [
  'standard_macos_arm64_build',
  'full_first_install_build',
  'webui_ghcr_publish',
  'post_publication_optional_certification',
];
const requiredRetiredReleasePackageScripts = [
  'release:stable',
  'release:operator',
  'release:publish',
  'release:bundle',
  'release:plan',
  'release:cohort-lock',
  'release:cohort-plan',
  'release:preflight',
  'release:closeout',
  'release:cleanup-drafts',
  'release:gate-reuse-plan',
  'release:cohort-manifest',
  'release:candidate-record',
  'release:candidate-record:resolve-owner',
  'release:candidate-record:validate',
  'release:candidate-record:status',
  'release:owner-candidate-record:verify',
];
const requiredStandardLatestAdmission = {
  validator: 'scripts/validate-standard-latest-admission.ts',
  receipt_schema: 'opl_standard_latest_admission_receipt.v1',
  required_status: 'passed',
  latest_activation_admitted_required: true,
  framework_latest_eligible_alone_is_sufficient: false,
  hosted_publication_floor_schema: 'opl_standard_hosted_publication_floor.v1',
  source_contract_build_preflight_required: 'passed',
  remote_digest_readback_required: 'passed',
  current_latest_readback_required: true,
  updater_predecessor_receipts_allowed: false,
  optional_certification_receipts_allowed: false,
  publication_ancestor_counts: { self_hosted: 0, vm: 0, tart: 0 },
  required_exact_identity_fields: [
    'bundle_digest',
    'candidate.zip.sha256',
    'candidate.zip.size_bytes',
    'candidate.dmg.sha256',
    'candidate.dmg.size_bytes',
  ],
  homebrew_evidence: {
    publication_schema: 'opl_bundle_homebrew_publication_receipt.v1',
    readback_schema: 'opl_bundle_homebrew_publication_readback_receipt.v1',
    required_digest_fields: [
      'homebrew.publication_receipt_sha256',
      'homebrew.readback_receipt_sha256',
    ],
    readback_must_bind_publication_actual_file_digest: true,
    clean_vm_receipt_allowed: false,
  },
  failure_mode: 'fail_closed_before_latest_patch',
};
const requiredPublisherReconcileAdmission = {
  persistent_unknown_framework_receipt_required: true,
  unknown_marker_schema: 'opl_release_bundle_unknown_outcome.v1',
  fresh_framework_status_required: true,
  framework_status_surface: 'release_bundle_status',
  framework_status_marker_field: 'active_unknown_markers',
  framework_status_reconcile_field: 'tracks.<track>.reconcile_required',
  framework_status_reconcile_required_value: true,
  exact_marker_match_fields: [
    'bundle_digest',
    'operation_id',
    'operation_kind',
    'stage_operation',
    'publication_scope',
    'track',
    'remote_target',
    'prior_mutation_attempt_id',
  ],
  app_may_infer_reconcile_required: false,
  required_sequence: [
    'persist_framework_unknown_outcome_marker',
    'read_fresh_framework_status',
    'require_exact_active_unknown_marker',
    'bounded_read_only_remote_inspect',
    'framework_exact_reconcile',
  ],
  active_marker_ordinary_mutation_allowed: false,
  app_local_reconcile_loop_allowed: false,
  deadline_elapsed_allows_bounded_read_only_inspect: true,
  deadline_elapsed_allows_framework_reconcile: true,
  deadline_elapsed_reconcile_result: 'late_observation',
  deadline_elapsed_reconcile_may_advance_stage: false,
  create_upload_latest_or_homebrew_retry_allowed: false,
};
const frameworkReleaseAbiSha = 'bee837d46a3695710c93c3acc69c10eb1d900167';
const requiredFrameworkReleaseCommands = [
  'freeze',
  'operation admit',
  'build',
  'checkpoint export',
  'checkpoint import',
  'verify',
  'publish',
  'reconcile',
  'status',
  'events',
  'consumer envelope',
];
const requiredFrameworkReleaseCommandForms = [
  'opl release freeze --request <request.json> [--source-root <directory>] [--store <directory>]',
  'opl release operation admit --bundle <sha256:digest> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
  'opl release build --bundle <sha256:digest> --executor-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
  'opl release checkpoint export --bundle <sha256:digest> --output <directory> [--store <directory>]',
  'opl release checkpoint import --checkpoint <checkpoint.json> [--store <directory>]',
  'opl release verify --bundle <sha256:digest> --qualification-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--track standard|full] [--store <directory>]',
  'opl release publish --bundle <sha256:digest> --executor-receipt <remote-inspect.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
  'opl release reconcile --bundle <sha256:digest> --executor-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
  'opl release status --bundle <sha256:digest> [--store <directory>]',
  'opl release events --bundle <sha256:digest> [--after-event <sha256:event>] [--store <directory>]',
  'opl release consumer envelope --bundle <sha256:digest> --track <standard|full> [--source-checkpoint-run-id <run-id>] [--store <directory>]',
];
const requiredOperationControlFields = [
  'control_digest',
  'bundle_digest',
  'operation_id',
  'operation_kind',
  'track',
  'operation_started_at',
  'operation_deadline_at',
];
const requiredUnknownMarkerFields = [
  'bundle_digest',
  'operation_id',
  'operation_kind',
  'stage_operation',
  'publication_scope',
  'track',
  'remote_target',
  'prior_mutation_attempt_id',
];
const requiredStableBusinessStageIds = [
  'admission_and_circuit_breaker',
  'source_contract_preflight',
  'credential_runner_and_custody_preflight',
  'standard_signed_notarized_build_and_seal',
  'clean_vm_exact_artifact_qualification',
  'updater_exact_artifact_qualification',
  'standard_publication',
  'homebrew_exact_artifact_install',
  'latest_pointer_activation',
  'remote_digest_and_clean_user_installed_readback',
  'terminal_fold_and_idempotent_cleanup',
];
const requiredStableStageAxes = ['qualification_product', 'evidence', 'transport', 'cleanup'];
const requiredStableFailureFingerprintFields = [
  'cohort',
  'stage_id',
  'reason_code',
  'artifact_digest_or_input_digest',
  'environment_receipt_digest',
];
const requiredValidationCanary = {
  workflow: '.github/workflows/release-bundle-canary.yml',
  mode: 'validation_only',
  triggers: ['daily_schedule', 'workflow_dispatch'],
  starts_reusable_topology: [
    '_release-bundle.yml',
    '_release-standard-publish.yml',
    '_release-full-addon.yml',
    '_build-reusable.yml',
    'opl-first-run-vm.yml',
    '_release-webui-carrier.yml',
    'release-webui-stable.yml',
    'opl-updater-upgrade-vm.yml',
    'full-first-install-release.yml',
  ],
  permissions: { contents: 'read', actions: 'read' },
  secrets_allowed: false,
  build_or_vm_execution_allowed: false,
  external_write_allowed: false,
  stable_mutation_allowed: false,
  publication_allowed: false,
  uses_stable_mutation_mutex: false,
  synthetic_identity_may_authorize_release: false,
};

function readJson(appRoot: string, relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), 'utf8'));
}

type GithubApplyInvocation = {
  workflow: string;
  job: string;
  step: string;
  options: Set<string>;
  mode: string;
  track: string;
};

const githubApplyCallerSpecs = [
  {
    workflow: '.github/workflows/_release-standard-publish.yml',
    job: 'publish-standard-nonlatest',
    track: 'standard',
    requiredOptions: githubApplyRequiredOptionNames,
  },
  {
    workflow: '.github/workflows/_release-full-addon.yml',
    job: 'publish-full',
    track: 'full',
    requiredOptions: githubApplyFullRequiredOptionNames,
  },
] as const;

function githubApplyBlocks(run: string): string[] {
  const lines = run.split(/\r?\n/);
  const blocks: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index]!.includes('framework-release-adapter.ts github-apply')) continue;
    const block = [lines[index]!];
    while (block.at(-1)!.trimEnd().endsWith('\\') && index + 1 < lines.length) {
      index += 1;
      block.push(lines[index]!);
    }
    blocks.push(block.join('\n'));
  }
  return blocks;
}

function githubApplyInvocations(appRoot: string): GithubApplyInvocation[] {
  const directory = path.join(appRoot, '.github', 'workflows');
  const invocations: GithubApplyInvocation[] = [];
  for (const file of fs.readdirSync(directory).filter((name) => /\.ya?ml$/.test(name)).sort()) {
    const relative = `.github/workflows/${file}`;
    const workflow = parseYaml(fs.readFileSync(path.join(directory, file), 'utf8')) as Record<string, any>;
    for (const [job, definition] of Object.entries(workflow.jobs ?? {})) {
      for (const step of Array.isArray((definition as Record<string, any>).steps)
        ? (definition as Record<string, any>).steps
        : []) {
        if (typeof step.run !== 'string') continue;
        for (const block of githubApplyBlocks(step.run)) {
          const options = new Set(
            [...block.matchAll(/--([a-z0-9][a-z0-9-]*)(?=\s|$)/g)].map((match) => match[1]!),
          );
          invocations.push({
            workflow: relative,
            job,
            step: String(step.name ?? '<unnamed>'),
            options,
            mode: block.match(/--mutation-mode\s+(rehearsal|execute)(?:\s|\\|$)/)?.[1] ?? '',
            track: block.match(/--track\s+(standard|full)(?:\s|\\|$)/)?.[1] ?? '',
          });
        }
      }
    }
  }
  return invocations;
}

export function validateGithubApplyCallerParity(appRoot: string): number {
  const id = 'github_apply_caller_parser_parity';
  const invocations = githubApplyInvocations(appRoot);
  const registered = new Set(githubApplyCallerSpecs.map((spec) => `${spec.workflow}#${spec.job}`));
  let failures = 0;

  for (const invocation of invocations) {
    if (!registered.has(`${invocation.workflow}#${invocation.job}`)) {
      console.error(`FAIL ${id}: unregistered production github-apply caller ${invocation.workflow}#${invocation.job}`);
      failures += 1;
    }
  }
  for (const spec of githubApplyCallerSpecs) {
    const callers = invocations.filter(
      (invocation) => invocation.workflow === spec.workflow && invocation.job === spec.job,
    );
    const modes = callers.map((caller) => caller.mode).sort();
    if (JSON.stringify(modes) !== JSON.stringify(['execute', 'rehearsal'])) {
      console.error(`FAIL ${id}: ${spec.workflow}#${spec.job} must contain one rehearsal and one execute call`);
      failures += 1;
      continue;
    }
    for (const caller of callers) {
      const missing = spec.requiredOptions.filter((name) => !caller.options.has(name));
      if (missing.length > 0 || caller.track !== spec.track) {
        console.error(
          `FAIL ${id}: ${caller.workflow}#${caller.job} ${caller.mode || '<missing-mode>'} `
          + `track=${caller.track || '<missing-track>'} missing=${missing.join(',') || '<none>'}`,
        );
        failures += 1;
      }
    }
    const optionSets = callers.map((caller) => [...caller.options].sort().join(','));
    if (optionSets[0] !== optionSets[1]) {
      console.error(`FAIL ${id}: ${spec.workflow} rehearsal and execute option surfaces differ`);
      failures += 1;
    }
  }
  return failures;
}

function sameStringSet(actual: unknown, expected: string[]) {
  return (
    Array.isArray(actual)
    && actual.length === expected.length
    && expected.every((entry) => actual.includes(entry))
  );
}

function stringArrayIncludesAll(actual: unknown, expected: string[]) {
  return Array.isArray(actual) && expected.every((entry) => actual.includes(entry));
}

function retiredReleaseControlPlaneViolations(releaseContract: Record<string, any>): string[] {
  const violations: string[] = [];
  const forbiddenKeys = new Set([
    'stable_release_state_machine',
    'cohort_prepare',
    'release_operator',
    'release_monitor',
    'gate_reuse',
    'publish_resume',
    'post_owner_receipt_fast_path',
    'broker_authority_gate',
    'promotion_saga',
    'attempt_ledger',
    'signed_mutation_authority',
  ]);
  const forbiddenWorkflowValues = new Set([
    '.github/workflows/desktop-release.yml',
    '.github/workflows/desktop-release-promote.yml',
    '.github/workflows/desktop-release-full-addon.yml',
  ]);

  const visit = (value: unknown, pathName = 'release_channel') => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${pathName}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const entryPath = `${pathName}.${key}`;
      if (forbiddenKeys.has(key)) violations.push(`retired field ${entryPath}`);
      if (typeof entry === 'string' && forbiddenWorkflowValues.has(entry)) {
        violations.push(`retired writer workflow ${entryPath}`);
      }
      if (entry === 'release_operator_plan') violations.push(`retired operator admission ${entryPath}`);
      visit(entry, entryPath);
    }
  };

  visit(releaseContract);
  return violations;
}

function validateGithubReleaseName(releaseContract: Record<string, any>): number {
  const releaseName = releaseContract.github_release_name;
  const calendarGuard = releaseName?.calendar_guard;
  if (
    releaseName?.format !== 'One Person Lab v<version>' ||
    releaseName?.stable_example !== 'One Person Lab v26.6.5' ||
    releaseName?.nightly_example !== 'One Person Lab v26.6.5-nightly' ||
    releaseName?.stable_version_pattern !== '^[0-9]{2}\\.(?:[1-9]|1[0-2])\\.(?:[1-9]|[12][0-9]|3[01])(?:-r[1-9])?$' ||
    releaseName?.nightly_version_pattern !== '^[0-9]{2}\\.(?:[1-9]|1[0-2])\\.(?:[1-9]|[12][0-9]|3[01])-nightly(?:\\.r[1-9])?$' ||
    releaseName?.tag_pattern !== 'v<version>' ||
    releaseName?.stable_revision?.maximum_revision !== 9 ||
    releaseName?.stable_revision?.allocation !== 'explicit_base_plus_highest_existing_remote_revision_plus_one' ||
    releaseName?.machine_version?.legacy_stable_last_display_version !== '26.7.20' ||
    releaseName?.machine_version?.shared_preview_lane_cutover_display_version !== '26.7.31' ||
    releaseName?.machine_version?.stable_patch_formula_before_cutover !== 'day_times_100_plus_revision' ||
    releaseName?.machine_version?.shared_channel_patch_formula_after_cutover !==
      'day_times_100_plus_90_plus_revision' ||
    releaseName?.machine_version?.nightly_patch_offset !== 90 ||
    !sameStringSet(releaseName?.machine_version?.shared_revision_sources_after_cutover, [
      'stable',
      'preview',
      'nightly',
    ]) ||
    releaseName?.machine_version?.same_revision_stable_outranks_nightly !==
      'semver_release_outranks_prerelease_with_equal_core' ||
    releaseName?.machine_version?.comparison !==
      'semver_core_decimal_integer_segments_then_prerelease_precedence' ||
    releaseName?.machine_version?.bundle_must_bind_both_identities !== true ||
    calendarGuard?.time_zone !== 'Asia/Shanghai' ||
    calendarGuard?.future_dated_versions_allowed !== false ||
    calendarGuard?.failure_mode !== 'fail_closed_before_build_remote_lookup_or_mutation' ||
    JSON.stringify(calendarGuard?.required_entrypoints) !== JSON.stringify([
      'release_version_validation',
      'framework_release_freeze',
      'framework_release_checkpoint_export_import',
      'standard_operation',
      'resume_standard_operation',
      'append_full_operation',
      'latest_activation',
    ])
  ) {
    console.error('FAIL github_release_name: release names must use canonical versions and reject future dates at every build and publish entrypoint');
    return 1;
  }
  return 0;
}

function validateReleaseImmutability(releaseContract: Record<string, any>): number {
  const standardDraft = releaseContract.standard_updater?.draft_refresh;
  const fullDraft = releaseContract.full_first_install?.draft_refresh;
  const fullAddon = releaseContract.full_first_install?.published_addon;
  const nightly = releaseContract.nightly_standard;
  const sameDayRebuild = nightly?.same_day_rebuild;
  if (
    standardDraft?.allowed !== true ||
    standardDraft?.published_release_mutation_allowed !== false ||
    standardDraft?.mode !== 'unpublished_draft_prebuilt_assets_upload_clobber' ||
    fullDraft?.allowed !== true ||
    fullDraft?.published_release_mutation_allowed !== false ||
    fullDraft?.mode !== 'unpublished_draft_release_upload_clobber' ||
    fullAddon?.operation !== 'append_full' ||
    fullAddon?.workflow !== '.github/workflows/_release-full-addon.yml' ||
    fullAddon?.checkpoint_minimum_stage !== 'standard_built' ||
    fullAddon?.standard_identity_required !== false ||
    fullAddon?.standard_release_readback !==
      'required_exact_reference_cas_only_no_cross_component_compatibility_gate' ||
    fullAddon?.successor_trigger?.workflow !== '.github/workflows/release-stable-post-success-followups.yml' ||
    fullAddon?.successor_trigger?.trigger !== 'successful_standard_workflow_run' ||
    fullAddon?.successor_trigger?.one_successor_per_standard_run !== true ||
    fullAddon?.successor_trigger?.workflow_dispatch_ref !== 'canonical_main' ||
    fullAddon?.successor_trigger?.executor_head_sha !== 'workflow_run_head_sha' ||
    fullAddon?.framework_operation_receipt_schema !== 'opl_release_bundle_operation_receipt.v1' ||
    fullAddon?.mode !== 'independent_immutable_adjunct_release' ||
    fullAddon?.standard_release_prerequisite_required !== true ||
    fullAddon?.carrier_identity?.base_release_tag !== 'exact_existing_immutable_standard_reference' ||
    fullAddon?.carrier_identity?.adjunct_git_ref_target !== 'release_executor.app_sha' ||
    fullAddon?.carrier_identity?.full_content_identity_source !==
      'opl-release-manifest.json#carrier_context.full_content_sources' ||
    fullAddon?.carrier_identity?.standard_reference_role !== 'reference_and_release_notes_only' ||
    fullAddon?.carrier_identity?.workflows_write_permission_required !== false ||
    fullAddon?.carrier_identity?.base_release_mutation_allowed !== false ||
    fullAddon?.carrier_identity?.adjunct_make_latest !== false ||
    fullAddon?.carrier_identity?.adjunct_prerelease !== false ||
    fullAddon?.carrier_identity?.publication_sequence !==
      'create_draft_upload_exact_closed_asset_set_publish_once_require_immutable_readback' ||
    !sameStringSet(fullAddon?.allowed_assets, [
      'One-Person-Lab-Full-<version>-mac-arm64.dmg',
      'opl-release-manifest.json',
    ]) ||
    fullAddon?.same_name_same_digest !== 'already_complete' ||
    fullAddon?.same_name_different_digest !== 'fail_closed_require_new_bundle_or_version' ||
    fullAddon?.standard_assets_modified !== false ||
    fullAddon?.updater_metadata_modified !== false ||
    fullAddon?.release_notes_modified !== 'owner_cas_after_full_terminal_only' ||
    !sameStringSet(fullAddon?.target_standard_reference?.required_fields, [
      'repository',
      'release_id',
      'tag',
      'target_commitish',
      'immutable',
    ]) ||
    !sameStringSet(fullAddon?.target_standard_reference?.cas_timing, [
      'before_full_build',
      'immediately_before_adjunct_publication',
    ]) ||
    fullAddon?.target_standard_reference?.cross_component_compatibility_gate_allowed !== false ||
    fullAddon?.target_standard_reference?.base_assets_mutation_allowed !== false ||
    fullAddon?.latest_modified !== false ||
    fullAddon?.source_or_bom_change_requires_new_version !== true ||
    nightly?.status !== 'implemented_pending_first_publication_readback' ||
    nightly?.publication_available !== true ||
    nightly?.mutation_available !== true ||
    nightly?.new_version_allocation_allowed !== true ||
    nightly?.historical_tag_and_receipt_parsing_allowed !== true ||
    nightly?.workflow !== '.github/workflows/release-nightly.yml' ||
    nightly?.homebrew_follower !== '.github/workflows/release-nightly-homebrew-follower.yml' ||
    nightly?.sampled_vm_follower !== '.github/workflows/release-nightly-sampled-vm.yml' ||
    nightly?.default_trigger !== 'daily_schedule' ||
    JSON.stringify(nightly?.development_validation_trigger) !== JSON.stringify({
      event: 'workflow_dispatch',
      authority: 'user_explicit',
      confirmation: 'publish_nonlatest_nightly',
      execution_path: 'same_as_scheduled_nightly',
    }) ||
    nightly?.stable_bundle_authority_used !== false ||
    nightly?.stable_mutation_mutex_used !== false ||
    nightly?.heavy_vm_blocks_publication !== false ||
    nightly?.include_full !== false ||
    nightly?.tag_pattern !== 'v<YY.M.D>-nightly[.r<1-9>]' ||
    sameDayRebuild?.first_release_suffix !== null ||
    sameDayRebuild?.suffix_pattern !== '.r<revision>' ||
    sameDayRebuild?.first_revision !== 1 ||
    sameDayRebuild?.maximum_revision !== 9 ||
    sameDayRebuild?.allocation !== 'highest_existing_same_day_tag_or_release_plus_one' ||
    sameDayRebuild?.legacy_run_identity_counts_as_existing_release !== true ||
    sameDayRebuild?.github_actions_run_identity_in_version !== false ||
    sameDayRebuild?.exhaustion_policy !== 'fail_closed' ||
    nightly?.prerelease !== true ||
    nightly?.quality_status !== 'preview' ||
    nightly?.build_trigger !== 'automated' ||
    nightly?.preview_kind !== 'nightly' ||
    nightly?.scheduled_latest_release_allowed !== false ||
    nightly?.explicit_user_override_may_move_latest !== true
  ) {
    console.error('FAIL release_immutability: Full is additive and every Nightly invocation is immutable, prerelease-only, and non-Latest by default');
    return 1;
  }
  return 0;
}

function validateLocalInstallReleaseProfile(releaseContract: Record<string, any>): number {
  const profile = releaseContract.release_profiles?.local_install;
  const expectedRequiredLanes = [
    'release_source_gate',
    'release_boundary',
    'standard_build',
    'local_install_handoff',
    'installed_app_readback',
  ];
  const expectedForbiddenLanes = [
    'publish_standard',
    'publish_full_assets',
    'remote_verify_standard_and_full',
    'standard_dmg_clean_vm_smoke',
    'full_dmg_clean_vm_smoke',
    'homebrew_standard_cask_clean_vm_smoke',
    'docker_webui_smoke',
    'webui_ghcr_publish',
    'release_evidence_bundle',
    'release_readiness_summary',
    'release_candidate_record',
    'promote_stable_release',
    'stable_homebrew_tap_update',
    'full_homebrew_tap_update',
    'release_promotion_record',
    'post_release_user_guide_screenshots',
  ];
  const expectedForbiddenRequirements = [
    'github_release_publish',
    'ghcr_publish',
    'clean_vm',
    'attestation',
    'notarization',
    'homebrew_distribution',
    'stable_promotion',
  ];
  let failures = 0;

  if (
    releaseContract.release_profiles?.default !== 'stable' ||
    !sameStringSet(releaseContract.release_profiles?.allowed, ['stable', 'local-install']) ||
    releaseContract.release_profiles?.unavailable?.nightly?.status !== 'legacy_planner_profile_retired' ||
    releaseContract.release_profiles?.unavailable?.nightly?.scope !== 'release_candidate_planner_profile_only' ||
    releaseContract.release_profiles?.unavailable?.nightly?.publication_available !== false ||
    releaseContract.release_profiles?.unavailable?.nightly?.mutation_available !== false ||
    profile?.plan_profile !== 'local_install' ||
    profile?.version_channel !== 'stable' ||
    profile?.distribution_scope !== 'local_machine_only'
  ) {
    console.error('FAIL local_install_release_profile: release profiles must expose local-install as a local-machine-only Stable-version plan');
    failures += 1;
  }
  if (
    profile?.build_command !== 'npm run build-mac:arm64' ||
    profile?.build_app_path !== '$SHELL_ROOT/out/mac-arm64/One Person Lab.app' ||
    profile?.installed_app_path !== '/Applications/One Person Lab.app' ||
    profile?.second_qa_authorization_required !== false
  ) {
    console.error('FAIL local_install_release_profile: local build, installed App path, and direct QA handoff must be canonical');
    failures += 1;
  }
  if (!sameStringSet(profile?.required_lanes, expectedRequiredLanes)) {
    console.error('FAIL local_install_release_profile: local-install must require only source, boundary, build, install handoff, and installed readback lanes');
    failures += 1;
  }
  if (!sameStringSet(profile?.forbidden_lanes, expectedForbiddenLanes)) {
    console.error('FAIL local_install_release_profile: every public-distribution and promotion lane must remain forbidden');
    failures += 1;
  }
  if (!sameStringSet(profile?.forbidden_external_requirements, expectedForbiddenRequirements)) {
    console.error('FAIL local_install_release_profile: public publish, GHCR, VM, attestation, notarization, Homebrew, and promotion must stay outside local-install');
    failures += 1;
  }
  if (
    !Array.isArray(profile?.installed_readback) ||
    !stringArrayIncludesAll(profile.installed_readback, [
      'bundle_version',
      'codesign_diagnostic',
      'installed_app_asar_sha256_matches_build',
      'startup_and_runtime_bridge_logs',
    ]) ||
    typeof profile?.authority_boundary !== 'string' ||
    !profile.authority_boundary.includes('cannot publish or promote a release') ||
    !profile.authority_boundary.includes('cannot claim clean-VM or attestation evidence')
  ) {
    console.error('FAIL local_install_release_profile: installed readback and non-public authority boundary are incomplete');
    failures += 1;
  }

  return failures;
}

function validatePhysicalVmOptionalCertificationPolicy(releaseContract: Record<string, any>): number {
  const acceleration = releaseContract.release_acceleration;
  const vmGates = Array.isArray(acceleration?.vm_gates) ? acceleration.vm_gates : [];
  const hostedLinux = acceleration?.hosted_linux_certification;
  let failures = 0;
  if (
    JSON.stringify(vmGates.map((gate) => gate?.id)) !== JSON.stringify([
      'standard_dmg_clean_vm_smoke',
      'homebrew_standard_cask_clean_vm_smoke',
      'full_dmg_clean_vm_smoke',
    ]) ||
    vmGates.some((gate) =>
      gate?.diagnostic_scope !== 'post_publication_optional_certification' ||
      gate?.gate_policy !== 'optional_non_blocking_same_published_artifact' ||
      !Array.isArray(gate?.certification_readiness) ||
      gate.certification_readiness.length === 0 ||
      'release_blocking_readiness' in gate
    )
  ) {
    console.error('FAIL release_vm_certification_policy: every physical VM gate must be post-publication, same-artifact, and non-blocking');
    failures += 1;
  }
  const fullVmGate = vmGates.find((gate) => gate?.id === 'full_dmg_clean_vm_smoke');
  const legacyVmGate = acceleration?.vm_gate;
  const legacyVmMirrorFields = [
    'source',
    'artifact',
    'smoke_profile',
    'display',
    'settings_smoke',
    'diagnostic_scope',
    'runtime_profile',
    'codex_config_wizard',
    'gate_policy',
    'certification_readiness',
    'post_core_ready_background_policy',
  ];
  if (
    !fullVmGate ||
    !legacyVmGate ||
    legacyVmMirrorFields.some((field) =>
      JSON.stringify(legacyVmGate[field]) !== JSON.stringify(fullVmGate[field])
    ) ||
    'release_blocking_readiness' in legacyVmGate
  ) {
    console.error('FAIL release_vm_legacy_mirror: legacy Full VM policy must mirror the optional certification gate');
    failures += 1;
  }
  if (
    hostedLinux?.id !== 'linux_x64_same_artifact_install_smoke' ||
    hostedLinux?.workflow !== '.github/workflows/release-post-publication-certification.yml' ||
    hostedLinux?.runner !== 'ubuntu-latest' ||
    hostedLinux?.platform !== 'linux-x64' ||
    hostedLinux?.artifact !== 'One-Person-Lab-<version>-linux-x64.deb' ||
    hostedLinux?.installer !== 'opl-app-installer.sh' ||
    !sameStringSet(hostedLinux?.installer_arguments, [
      '--desktop',
      '--release-tag',
      '<exact-tag>',
      '--no-open',
    ]) ||
    hostedLinux?.same_release_deb_and_installer_manifest_binding_required !== true ||
    hostedLinux?.same_deb_artifact_identity_required !== true ||
    hostedLinux?.cross_component_version_sha_or_cohort_equality_required !== false ||
    hostedLinux?.dependency_compatibility_contract_ref !==
      'contracts/app-install-exposure-policy.json#component_interoperability.compatibility_admission' ||
    hostedLinux?.typed_admission_schema !== 'opl_app_optional_certification_hosted_admission.v1' ||
    hostedLinux?.typed_execution_evidence_schema !== 'opl_app_linux_same_artifact_install_evidence.v1' ||
    hostedLinux?.clean_machine_preinstall_absence_required !== true ||
    hostedLinux?.installed_executable_byte_parity_required !== true ||
    hostedLinux?.failed_download_evidence_truthful_required !== true ||
    JSON.stringify(hostedLinux?.terminal_statuses) !== JSON.stringify(['passed', 'failed']) ||
    hostedLinux?.unavailable_allowed !== false ||
    hostedLinux?.downloaded_from_published_release_required !== true ||
    hostedLinux?.rebuilt_allowed !== false ||
    hostedLinux?.failure_receipt_uploaded_before_job_failure !== true ||
    hostedLinux?.gate_policy !== 'optional_non_blocking_same_published_artifact' ||
    hostedLinux?.required_for_publication_or_latest !== false
  ) {
    console.error('FAIL release_hosted_linux_certification: Linux certification must consume exact public installer and DEB bytes without blocking Stable or Latest');
    failures += 1;
  }
  const stableValidation = releaseContract.release_validation_profiles?.stable;
  if (
    stableValidation?.addon_gate_blocking_standard_terminal !== false ||
    stableValidation?.addon_lanes?.includes('full_dmg_clean_vm_smoke') ||
    !stableValidation?.diagnostic_lanes?.includes('full_dmg_clean_vm_smoke') ||
    !sameStringSet(stableValidation?.post_publication_optional_certification_surfaces, [
      'standard_dmg_clean_vm_smoke',
      'homebrew_standard_cask_clean_vm_smoke',
      'one_shot_app_installer_fresh_install_smoke',
      'full_dmg_clean_vm_smoke',
    ]) ||
    !sameStringSet(stableValidation?.hosted_post_publication_optional_certification_surfaces, [
      'linux_x64_same_artifact_install_smoke',
    ])
  ) {
    console.error('FAIL release_stable_optional_certification: physical VM coverage must remain outside the Stable publication terminal');
    failures += 1;
  }
  return failures;
}

function validateReleaseExecutionTracks(releaseContract: Record<string, any>): number {
  const policy = releaseContract.release_execution_tracks;
  const local = policy?.tracks?.local;
  const remote = policy?.tracks?.remote;
  const parity = policy?.artifact_parity;
  const isolation = policy?.development_isolation;
  const standardLatestRequirements = [
    'One-Person-Lab-<version>-mac-arm64.dmg',
    'One-Person-Lab-<version>-mac-arm64.zip',
    'One-Person-Lab-<version>-mac-arm64.zip.blockmap',
    'One-Person-Lab-<version>-linux-x64.deb',
    'latest-arm64-mac.yml',
    'opl-app-component-manifest.json',
    'opl-install.sh',
    'standard-gatekeeper-launch-policy.json',
    'standard-apple-notarization-receipt.json',
    'prepared_ai_release_notes',
  ];
  const fullRequirements = [
    'One-Person-Lab-Full-<version>-mac-arm64.dmg',
    'opl-release-manifest.json',
  ];
  const fullForbiddenMutations = [
    'standard_assets',
    'latest-arm64-mac.yml',
    'release_notes',
    'latest_selection',
  ];

  if (
    policy?.orthogonal_to_release_profiles !== true ||
    policy?.local_install_profile_is_not_local_publish_track !== true ||
    !sameStringSet(policy?.default_sequence, [
      'local_development_debug_build_and_same_artifact_qualification',
      'remote_routine_release_and_continuous_reproducibility_proof',
    ]) ||
    local?.routine_during_development !== true ||
    local?.publication_requires_explicit_authorization !== true ||
    local?.may_publish_canonical_release_assets !== true ||
    local?.must_use_frozen_release_worktree !== true ||
    local?.must_not_block_canonical_main_or_unrelated_worktrees !== true ||
    remote?.default_publication_track !== true ||
    remote?.must_consume_or_produce_the_same_artifact_contract !== true ||
    remote?.must_not_create_track_specific_public_assets !== true
  ) {
    console.error('FAIL release_execution_tracks: local must accelerate development and authorized fallback publication while remote remains the routine equivalent publication path');
    return 1;
  }

  if (
    parity?.canonical_public_asset_set_per_version !== 1 ||
    parity?.same_selected_app_artifact_identity_required !== true ||
    parity?.cross_component_version_sha_or_cohort_equality_may_gate_install_or_runtime !== false ||
    parity?.track_handoff_requires_exact_asset_digests !== true ||
    parity?.same_public_names_roles_and_install_behavior_required !== true ||
    parity?.same_standard_updater_metadata_contract_required !== true ||
    parity?.same_prepared_ai_release_notes_required !== true ||
    parity?.track_specific_user_visible_assets_allowed !== false ||
    !sameStringSet(parity?.standard_latest_activation_requires, standardLatestRequirements) ||
    parity?.full_addon_may_follow_latest_asynchronously !== true ||
    !sameStringSet(parity?.full_addon_requires, fullRequirements) ||
    parity?.full_is_standard_updater_target !== false ||
    !sameStringSet(parity?.adding_full_must_not_modify, fullForbiddenMutations)
  ) {
    console.error('FAIL release_execution_tracks: both tracks must publish one equivalent Standard release; AI notes and six Standard surfaces gate Latest while Full remains an updater-invisible asynchronous add-on');
    return 1;
  }

  if (
    isolation?.release_source !== 'immutable detached checkout or release-owned worktree' ||
    isolation?.canonical_main_write_lock_required_during_build_or_qualification !== false ||
    isolation?.normal_development_may_continue !== true ||
    typeof isolation?.rule !== 'string' ||
    !isolation.rule.includes('must never reserve the development root')
  ) {
    console.error('FAIL release_execution_tracks: release work must read a frozen checkout without blocking canonical main or unrelated development');
    return 1;
  }

  return 0;
}

function validatePreparedNotesTransportPolicy(releaseContract: Record<string, any>): number {
  const preparedNotes = releaseContract.release_bundle_control_plane?.prepared_notes;
  const environmentControl = releaseContract.release_bundle_control_plane?.protected_environment_control;
  if (
    preparedNotes?.provider_transport_attempt_limit_per_request !== 3 ||
    !sameStringSet(preparedNotes?.provider_transport_retry_scope, [
      'timeout', 'connection_error', 'http_429', 'http_5xx',
    ]) ||
    preparedNotes?.provider_content_or_quality_failure_may_transport_retry !== false ||
    preparedNotes?.failure_receipt_schema !== 'opl_app_release_notes_prepare_receipt.v1' ||
    preparedNotes?.failure_receipt_uploaded_when_writer_started !== true ||
    preparedNotes?.prebuild_failure_must_not_project_as_qualification_runner_lost !== true ||
    preparedNotes?.full_intent_source !== 'stable_post_success_successor_workflow' ||
    preparedNotes?.full_intent_admitted_input !== 'successful_standard_workflow_run' ||
    preparedNotes?.full_intent_must_match_before_append_full_admission !== true
  ) {
    console.error('FAIL prepared_notes_transport: bounded transport retry, typed failure receipts, and admitted Full intent binding are incomplete');
    return 1;
  }
  if (
    environmentControl?.environment !== 'release-stable' ||
    environmentControl?.canonical_branch_policy !== 'main' ||
    environmentControl?.canonical_branch_policy_count !== 1 ||
    environmentControl?.daily_codex_credential_may_mutate !== false ||
    environmentControl?.temporary_policy_rewrite_as_circuit_breaker_allowed !== false ||
    environmentControl?.workflow_or_adapter_fail_close_required !== true ||
    environmentControl?.new_cancel_operation_allowed !== false ||
    environmentControl?.legacy_cancel_surface_may_authorize_mutation !== false ||
    environmentControl?.noncanonical_operation_allowed !== false ||
    environmentControl?.deviation_requires_durable_emergency_containment_receipt !== true ||
    !sameStringSet(environmentControl?.historical_deviation_receipts, [
      'docs/delivery/release/incidents/2026-07-21-v26.7.21-notes-intent-containment.json',
    ]) ||
    !sameStringSet(environmentControl?.emergency_containment_receipt_required_fields, [
      'actor',
      'recorded_at',
      'policy_change.previous',
      'policy_change.temporary',
      'run.id',
      'reason',
    ]) ||
    environmentControl?.temporary_policy_must_be_removed_after_first_protected_publish_failure !== true ||
    environmentControl?.restoration_requires_get_readback !== true ||
    typeof environmentControl?.rule !== 'string' ||
    !environmentControl.rule.includes('cannot rewrite this verifier') ||
    !environmentControl.rule.includes('no legacy cancel or session surface can authorize a mutation')
  ) {
    console.error('FAIL protected_environment_control: release-stable must retain one main policy and reject legacy cancel/session mutation authority');
    return 1;
  }
  return 0;
}

function validateStandardUpdaterCompressionPolicy(appRoot: string, releaseContract: Record<string, any>): number {
  let failures = 0;
  const compression = releaseContract.standard_updater?.dmg_compression;
  const activeShellRoot = process.env.OPL_APP_SHELL_ROOT || process.env.OPL_AION_SHELL_ROOT || path.join(appRoot, 'shells/aionui');
  const electronBuilderConfig = fs.readFileSync(
    path.join(activeShellRoot, 'packages/desktop/electron-builder.yml'),
    'utf8',
  );

  if (
    compression?.default_format !== 'ULFO' ||
    compression?.format_owner !== 'shells/aionui/packages/desktop/electron-builder.yml#dmg.format' ||
    compression?.electron_builder_version !== '26.8.1' ||
    compression?.ulmo_standard_default_allowed !== false ||
    compression?.ulmo_postprocess_status !== 'separate_experiment_required' ||
    !sameStringSet(compression?.electron_builder_supported_formats, ['UDBZ', 'UDCO', 'UDRO', 'UDRW', 'UDZO', 'ULFO'])
  ) {
    console.error('FAIL standard_updater_dmg_compression: standard DMG compression must default to electron-builder-supported ULFO and keep ULMO as a separate experiment');
    failures += 1;
  }
  if (!/dmg:[\s\S]*format:\s+ULFO/.test(electronBuilderConfig)) {
    console.error('FAIL standard_updater_dmg_compression: active shell electron-builder.yml must use ULFO for standard DMGs');
    failures += 1;
  }
  if (
    typeof compression?.metadata_blockmap_gate !== 'string' ||
    !compression.metadata_blockmap_gate.includes('validate-release.ts') ||
    !compression.metadata_blockmap_gate.includes('hdiutil imageinfo/verify') ||
    typeof compression?.rule !== 'string' ||
    !compression.rule.includes('does not accept ULMO') ||
    !compression.rule.includes('ZIP blockmap') ||
    !compression.rule.includes('latest-arm64-mac.yml')
  ) {
    console.error('FAIL standard_updater_dmg_compression: compression policy must preserve updater metadata and blockmap verification boundaries');
    failures += 1;
  }

  return failures;
}

function validateStandardUpdaterCandidateSelection(releaseContract: Record<string, any>): number {
  const selection = releaseContract.standard_updater?.candidate_selection;
  if (
    selection?.schema !== 'opl_app_updater_candidate_selection.v1'
    || selection?.updater_version_field !== 'updaterVersion'
    || selection?.sort_authority !== 'valid_updater_version_semver'
    || selection?.latest_pointer_is_not_candidate_sort_authority !== true
    || selection?.nightly_is_not_an_independent_user_channel !== true
    || !sameStringSet(selection?.stable?.allowed_quality_statuses, ['stable'])
    || selection?.stable?.candidate_union !== 'stable_only'
    || !sameStringSet(selection?.preview?.allowed_quality_statuses, ['stable', 'preview'])
    || !sameStringSet(selection?.preview?.allowed_preview_kinds, ['dev', 'nightly'])
    || selection?.preview?.candidate_union !== 'stable_plus_preview_and_nightly'
    || selection?.preview?.higher_stable_may_supersede_preview_or_nightly !== true
    || JSON.stringify(selection?.monotonicity) !== JSON.stringify({
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
    })
  ) {
    console.error(
      'FAIL standard_updater_candidate_selection: Stable must remain Stable-only while Preview selects the highest valid Stable or Preview/Nightly updaterVersion independently of Latest',
    );
    return 1;
  }
  return 0;
}

function validateReleasePreflightContract(releaseContract: Record<string, any>): number {
  let failures = 0;
  const preflight = releaseContract.release_preflight;
  const localFirst = preflight?.local_first;
  if (
    preflight?.script !== 'scripts/framework-release-adapter.ts' ||
    preflight?.package_script !== 'release:framework-adapter' ||
    preflight?.command !== 'freeze-request' ||
    preflight?.workflow_job !== 'freeze' ||
    preflight?.admission_scope !== 'product_policy_inputs_before_framework_bundle_freeze' ||
    preflight?.live_state_authority !== false ||
    preflight?.checkpoint_authority_ref !== 'release_bundle_control_plane.framework_authority' ||
    !sameStringSet(preflight?.stable_operations, ['standard', 'resume_standard', 'append_full']) ||
    preflight?.legacy_preflight?.script !== 'scripts/validate-release-preflight.ts' ||
    preflight?.legacy_preflight?.lifecycle !== 'retired_historical_non_authoritative' ||
    preflight?.legacy_preflight?.access !== 'read_only' ||
    preflight?.legacy_preflight?.package_entry !== null ||
    preflight?.legacy_preflight?.may_create_release_state_or_authorize_mutation !== false ||
    preflight?.failure_budget !== 'fail product-policy admission before Framework freeze or any expensive build; evaluate Full-specific failures only in append_full'
  ) {
    console.error('FAIL release_preflight_contract: release_preflight must bind the App product adapter freeze-request and retire the legacy preflight CLI');
    failures += 1;
  }
  if (
    localFirst?.entrypoint !== 'scripts/verify.sh release-preflight'
    || localFirst?.reuses_existing_orchestrator !== true
    || !sameStringSet(localFirst?.local_checks, [
      'actionlint',
      'typecheck',
      'active_shell',
      'release_boundary',
      'candidate_shell',
      'standard_package_build',
    ])
    || !sameStringSet(localFirst?.remote_only, [
      'github_hosted_required_macos_linux_matrix',
      'github_hosted_optional_platform_matrix_nonblocking',
      'protected_signing_and_notarization_credentials',
      'public_mutation',
      'owner_authoritative_remote_readback',
    ])
    || !sameStringSet(localFirst?.optional_deferred, [
      'post_publication_clean_machine_certification',
    ])
    || localFirst?.public_mutation_allowed !== false
  ) {
    console.error('FAIL release_preflight_contract: local-first preflight must reuse verify.sh and disclose remote-only and optional work');
    failures += 1;
  }
  for (const checkId of [
    'channel_display_and_updater_version_identity',
    'app_artifact_identity_and_framework_compatibility_receipt',
    'app_standard_identity_mode',
    'typed_package_compatibility_abi_and_range',
    'package_release_set_and_exact_package_fields_absent',
    'prepared_ai_release_notes_marker',
    'prepared_ai_release_notes_standard_scope',
    'framework_freeze_request_schema',
    'stable_operation_control_digest',
    'stable_admission_manifest_digest',
    'apple_credentials_runtime_receipt',
    'cross_namespace_version_allocator',
    'zero_other_active_stable_authority_runs',
    'current_app_profile_exact_shell_consumer',
  ]) {
    if (!preflight?.required_fast_checks?.includes(checkId)) {
      console.error(`FAIL release_preflight_contract: missing required fast check ${checkId}`);
      failures += 1;
    }
  }
  for (const artifact of ['freeze-request.json', 'freeze-result.json']) {
    if (!preflight?.summary_artifacts?.includes(artifact)) {
      console.error(`FAIL release_preflight_contract: missing summary artifact ${artifact}`);
      failures += 1;
    }
  }
  const standardAdmission = preflight?.standard_admission_manifest;
  if (
    standardAdmission?.schema !== 'opl_stable_release_admission_manifest.v1'
    || standardAdmission?.script !== 'scripts/stable-release-admission-manifest.ts'
    || standardAdmission?.producer_workflow !== '.github/workflows/release-stable.yml'
    || standardAdmission?.consumer_workflow !== '.github/workflows/release-stable.yml'
    || standardAdmission?.protected_environment !== 'release-stable'
    || standardAdmission?.artifact_name !== 'opl-stable-admission-<stable_run_id>'
    || standardAdmission?.digest_algorithm !== 'sha256'
    || !sameStringSet(
      standardAdmission?.standard_dispatch_inputs,
      ['operation', 'authority_id', 'operation_id', 'authority_carrier', 'authority_digest'],
    )
    || standardAdmission?.raw_standard_version_or_ref_inputs_allowed !== false
    || standardAdmission?.fresh_verify_before_expensive_work !== true
    || standardAdmission?.full_source_gate_rerun_in_workflow !== false
    || standardAdmission?.unknown_dispatch_result_policy !== 'read_only_reconcile_without_rerun_redispatch_or_cancel'
    || standardAdmission?.active_run_scope?.blocking_workflow !== '.github/workflows/release-stable.yml'
    || standardAdmission?.active_run_scope?.independent_release_workflows_block_stable_admission !== false
    || standardAdmission?.active_run_scope?.nightly_active_run_blocks_stable_admission !== false
    || standardAdmission?.active_run_scope?.same_stable_authority_parallel_run_allowed !== false
  ) {
    console.error('FAIL release_preflight_contract: Standard dispatch must consume one protected digest-bound admission manifest');
    failures += 1;
  }
  for (const binding of [
    'pre_issued_stable_authority_carrier',
    'frozen_app_shell_framework_cohort',
    'frozen_source_gate_bytes_and_digest',
    'pre_nonce_guard_bytes_and_digest',
    'run_authority_reconcile_control',
    'single_use_control_consumption',
    'critical_workflow_git_blobs_and_sha256',
    'apple_protected_secret_names_6_of_6',
    'developer_id_and_notary_authentication_receipt',
    'cross_namespace_stable_version_allocator',
    'github_release_and_tag_namespace',
    'anonymous_webui_namespace',
    'homebrew_standard_cask_and_policy',
    'zero_other_active_stable_authority_runs',
    'git_wire_main_refs_and_single_owner_run_query',
  ]) {
    if (!standardAdmission?.required_bindings?.includes(binding)) {
      console.error(`FAIL release_preflight_contract: Standard admission manifest missing binding ${binding}`);
      failures += 1;
    }
  }
  const dispatchGuard = preflight?.dispatch_guard;
  if (
    dispatchGuard?.schema !== 'opl_release_dispatch_guard.v1'
    || dispatchGuard?.script !== 'scripts/release-dispatch-guard.ts'
    || dispatchGuard?.package_script !== 'release:dispatch-guard'
    || dispatchGuard?.required_before_nonce_consumption !== true
    || dispatchGuard?.source_gate_report_exact_cohort_binding_required !== true
    || !sameStringSet(
      dispatchGuard?.required_pre_nonce_gates,
      [
        'release:source-gate_pre_dispatch_once',
        'current_app_profile_exact_shell_consumer_pre_dispatch_once',
        'frozen_app_shell_framework_commit_reachability_and_critical_blob_binding',
        'single_operation_owner_workflow_runs_query_and_zero_other_active_stable_authority_runs',
      ],
    )
    || dispatchGuard?.cross_repository_ref_identity?.transport !== 'git_ls_remote_wire'
    || dispatchGuard?.cross_repository_ref_identity?.commit_or_ref_api_guard_allowed !== false
    || dispatchGuard?.cross_repository_ref_identity?.max_transport_attempts_per_read !== 3
    || dispatchGuard?.cross_repository_ref_identity?.transport_failure_is_credential_failure !== false
    || dispatchGuard?.cross_repository_ref_identity?.live_main_equality_required_after_freeze !== false
    || dispatchGuard?.cross_repository_ref_identity?.frozen_commit_reachability_required !== true
    || dispatchGuard?.cross_repository_ref_identity?.critical_blob_digest_binding_required !== true
    || dispatchGuard?.owner_run_lookup?.logical_query_count !== 1
    || dispatchGuard?.owner_run_lookup?.max_transport_attempts !== 3
    || dispatchGuard?.owner_run_lookup?.parser !== 'node_structured_json_without_jq'
    || !sameStringSet(
      dispatchGuard?.owner_run_lookup?.identity_fields,
      [
        'workflow_path',
        'event_workflow_dispatch',
        'head_branch_main',
        'run_attempt_1',
        'operation_id_in_run_name',
        'authority_id_in_run_name',
        'current_run_id_for_consumption',
      ],
    )
    || dispatchGuard?.owner_run_lookup?.identity_window_seconds !== null
    || dispatchGuard?.owner_run_lookup?.zero_or_ambiguous_result !== 'outcome_unknown'
    || !sameStringSet(
      dispatchGuard?.transport_failure_codes,
      ['tls_handshake_timeout', 'unexpected_eof', 'transport_timeout', 'transport_error'],
    )
    || JSON.stringify(dispatchGuard?.pre_nonce_failure) !== JSON.stringify({
      nonce_consumed: false,
      mutation_invocation_count: 0,
      read_only_reconcile_allowed: true,
      guard_replacement_allowed: false,
      dispatch_allowed: false,
    })
    || JSON.stringify(dispatchGuard?.post_dispatch_failure) !== JSON.stringify({
      nonce_consumed: true,
      mutation_invocation_count: 1,
      mutation_retry_count: 0,
      read_only_reconcile_only: true,
      replacement_allowed: false,
      redispatch_allowed: false,
    })
  ) {
    console.error('FAIL release_dispatch_guard_contract: ref identity and owner-run reconciliation must be bounded, structured, and mutation-safe');
    failures += 1;
  }
  const stableOperationControl = preflight?.stable_operation_control;
  if (
    stableOperationControl?.authority_schema !== 'opl_app_stable_operation_authority.v1'
    || stableOperationControl?.control_schema !== 'opl_app_stable_operation_control.v1'
    || stableOperationControl?.consumption_schema !== 'opl_app_stable_operation_consumption.v1'
    || stableOperationControl?.script !== 'scripts/stable-operation-control.ts'
    || stableOperationControl?.protected_admission_job !== 'protected-operation-admission'
    || stableOperationControl?.artifact_name !== 'opl-stable-operation-control-<stable_run_id>'
    || stableOperationControl?.authority_carrier_required !== true
    || stableOperationControl?.authority_issuance !== 'operator_issued_github_dispatch_input_non_cryptographic'
    || stableOperationControl?.workflow_may_self_issue_authority_or_nonce !== false
    || stableOperationControl?.operation_id_derivation !== 'deterministic_frozen_cohort_and_critical_blob_identity'
    || stableOperationControl?.bare_dispatch_fails_before_expensive_work !== true
    || stableOperationControl?.live_main_drift_invalidates_frozen_cohort !== false
    || stableOperationControl?.current_executor?.live_main_equality_with_frozen_app_required !== false
    || stableOperationControl?.current_executor?.critical_blob_equality_with_authority_required !== true
    || stableOperationControl?.current_executor?.frozen_app_commit_checkout_required !== true
    || stableOperationControl?.source_gate?.script !== 'scripts/validate-release-source-gate.ts'
    || stableOperationControl?.source_gate?.execution_phase !== 'operator_pre_dispatch_before_authority_issuance'
    || stableOperationControl?.source_gate?.runs_per_operation !== 1
    || stableOperationControl?.source_gate?.workflow_rerun_allowed !== false
    || stableOperationControl?.source_gate?.digest_bound_to_authority_and_control !== true
    || stableOperationControl?.pre_nonce_guard?.script !== 'scripts/release-dispatch-guard.ts'
    || stableOperationControl?.pre_nonce_guard?.phase !== 'pre_nonce'
    || stableOperationControl?.pre_nonce_guard?.execution_phase !== 'operator_pre_dispatch_before_authority_issuance'
    || stableOperationControl?.pre_nonce_guard?.digest_bound_to_authority_and_control !== true
    || stableOperationControl?.run_authority_reconcile?.distinct_from_pre_nonce_guard !== true
    || stableOperationControl?.run_authority_reconcile?.current_run_binding_required !== true
    || stableOperationControl?.run_authority_reconcile?.prior_consumer_forbidden !== true
    || stableOperationControl?.run_authority_reconcile?.digest_bound_to_control_and_consumption !== true
    || stableOperationControl?.single_use_consumption?.required_before_cold_work !== true
    || stableOperationControl?.single_use_consumption?.one_operation_one_matching_run !== true
    || stableOperationControl?.single_use_consumption?.control_artifact_consumer !==
      '.github/workflows/_release-bundle.yml'
    || stableOperationControl?.actions_artifact?.role !== 'transient_transport_only'
    || stableOperationControl?.actions_artifact?.durable_authority !== false
  ) {
    console.error('FAIL release_preflight_contract: Stable must consume one protected authority, frozen source-gate, pre-nonce guard, run-authority reconcile, and single-use control artifact.');
    failures += 1;
  }
  if (
    preflight?.apple_credentials_diagnostic?.workflow !== '.github/workflows/release-apple-credentials-preflight.yml'
    || preflight?.apple_credentials_diagnostic?.authority !== 'diagnostic_only'
    || preflight?.apple_credentials_diagnostic?.may_create_stable_admission_manifest !== false
    || preflight?.apple_credentials_diagnostic?.may_dispatch_standard !== false
  ) {
    console.error('FAIL release_preflight_contract: standalone Apple credential preflight must be diagnostic-only');
    failures += 1;
  }
  const observability = preflight?.attempt_observability;
  if (
    observability?.schema !== 'opl_release_attempt_observation.v1'
    || observability?.workflow !== '.github/workflows/release-attempt-observability.yml'
    || observability?.script !== 'scripts/release-attempt-observability.ts'
    || observability?.trigger !== 'release_stable_workflow_run_completed'
    || observability?.storage !== 'append_only_per_run_artifact'
    || observability?.first_terminal_classification !== 'machine_job_name_and_completed_at'
    || observability?.release_state_authority !== false
    || observability?.framework_status_authority !== false
    || observability?.mutation_authority !== false
    || observability?.may_authorize_retry_rerun_or_redispatch !== false
  ) {
    console.error('FAIL release_preflight_contract: attempt observability must remain an append-only non-authoritative follower');
    failures += 1;
  }
  const sourceGate = preflight?.source_gate;
  if (
    sourceGate?.package_script !== 'release:source-gate' ||
    sourceGate?.status !== 'implemented_once_before_dispatch_then_verified_from_frozen_evidence' ||
    sourceGate?.execution_owner !== 'operator_pre_dispatch_controller' ||
    sourceGate?.runs_per_operation !== 1 ||
    sourceGate?.workflow_rerun_allowed !== false ||
    sourceGate?.failure_next_action !== 'repair_source_gate' ||
    !sourceGate?.scope?.includes('current App profile against exact Shell consumer in a temporary archive') ||
    typeof sourceGate?.rule !== 'string' ||
    !sourceGate.rule.includes('runs once before dispatch') ||
    !sourceGate.rule.includes('records the exact App/Shell/Framework source and build provenance') ||
    !sourceGate.rule.includes('observational build provenance only') ||
    !sourceGate.rule.includes('never an install/runtime compatibility gate')
  ) {
    console.error('FAIL release_source_gate_contract: source gate must run once before dispatch and be verified from frozen evidence without workflow rerun');
    failures += 1;
  }
  if (!sameStringSet(sourceGate?.scope, requiredSourceGateScopes)) {
    console.error('FAIL release_source_gate_contract: source gate scope must cover release-boundary, shell format/type/tests/ref, and framework ref');
    failures += 1;
  }
  if (!sameStringSet(sourceGate?.must_run_before, requiredSourceGatePrecedes)) {
    console.error('FAIL release_source_gate_contract: source gate must precede hosted build, Full, WebUI, and optional certification work');
    failures += 1;
  }
  if (
    typeof preflight?.rule !== 'string' ||
    !preflight.rule.includes('app_standard_compatibility') ||
    !preflight.rule.includes('selected App artifact identity') ||
    !preflight.rule.includes('Framework compatibility requirements') ||
    !preflight.rule.includes('without Package Release Set or exact Package authority fields') ||
    !preflight.rule.includes('cannot create release state or replace Framework checkpoint admission') ||
    !preflight.rule.includes('App/Shell/Framework source refs remain provenance only') ||
    !preflight.rule.includes('append_full remains independently admissible') ||
    preflight?.full_addon_preflight?.operation !== 'append_full' ||
    preflight?.full_addon_preflight?.required_before_append_full_operation !== true
  ) {
    console.error('FAIL release_source_gate_contract: product preflight must remain non-authoritative and keep append_full independent');
    failures += 1;
  }
  return failures;
}

function validateOptionalCertificationPolicy(releaseContract: Record<string, any>): number {
  const policy = releaseContract.post_publication_optional_certification;
  const recovery = policy?.producer?.exact_failed_follower_recovery;
  let failures = 0;
  if (
    policy?.schema !== 'opl_app_optional_certification_policy.v1'
    || policy?.receipt_schema !== 'contracts/app-optional-certification-receipt.schema.json'
    || policy?.validator !== 'scripts/validate-optional-certification-receipt.ts'
    || policy?.required_for_publication !== false
    || policy?.required_for_latest !== false
    || policy?.artifact_source !== 'exact_immutable_published_release_artifact'
    || policy?.artifact_rebuild_allowed !== false
    || policy?.full_artifact_release_source !== 'immutable_full_adjunct_release'
    || policy?.full_component_manifest_release_source !== 'target_standard_release'
    || policy?.full_identity_cross_binding !==
      'target_standard_component_manifest_source_cohort_equals_full_build_provenance'
    || policy?.component_manifest_mutation_allowed !== false
    || policy?.component_manifest_resign_allowed !== false
    || !sameStringSet(policy?.statuses, ['passed', 'failed', 'not_run', 'unavailable'])
    || !sameStringSet(policy?.not_run_reason_codes, [
      'not_requested',
      'not_authorized',
      'operator_deferred',
    ])
    || !sameStringSet(policy?.unavailable_reason_codes, [
      'authority_or_capability_not_provable',
      'fleet_lease_admission_failed',
      'vm_admission_failed',
      'capability_admission_failed',
    ])
    || policy?.producer?.workflow !== '.github/workflows/release-post-publication-certification.yml'
    || policy?.producer?.trigger !== 'workflow_run_after_successful_github_release_publication'
    || policy?.producer?.automatic_prequeue_admission !== 'emit_not_run_until_exact_physical_capability_is_proven'
    || policy?.producer?.physical_executor_workflow !== '.github/workflows/opl-first-run-vm.yml'
    || policy?.producer?.dispatcher_execution !== 'github_hosted_read_only_public_artifact_consumer'
    || policy?.producer?.stable_dag_dependency !== false
    || policy?.producer?.may_queue_without_proven_capability !== false
    || recovery?.trigger !== 'workflow_dispatch'
    || recovery?.authority_binding !==
      'same_successful_append_full_run_exact_failed_first_attempt_and_consumed_recovery_v1'
    || recovery?.recovery_generation !== 2
    || recovery?.consumed_recovery_generation !== 1
    || !sameStringSet(recovery?.required_inputs, [
      'source_run_id', 'failed_follower_run_id', 'failed_recovery_run_id', 'recovery_confirmation',
    ])
    || recovery?.confirmation !== 'recover_exact_failed_optional_certification_v2'
    || recovery?.failed_boundary !==
      'first_attempt_current_handoff_bind_failed_and_recovery_v1_adjunct_component_manifest_lookup_failed_with_all_certification_executors_skipped'
    || recovery?.failed_follower_public_mutation_count_required !== 0
    || recovery?.failed_recovery_public_mutation_count_required !== 0
    || recovery?.canonical_main_executor_required !== true
    || recovery?.same_identity_recovery_v2_run_count_required !== 1
    || recovery?.workflow_rerun_allowed !== false
    || recovery?.append_full_redispatch_allowed !== false
  ) {
    console.error('FAIL optional_certification_policy: certification must be four-state, post-publication, same-artifact, and non-blocking');
    failures += 1;
  }
  return failures;
}

function validateHomebrewVmGateStaticPolicy(
  appRoot: string,
  releaseContract: Record<string, any>,
  firstRunMatrix: Record<string, any>,
): number {
  let failures = 0;
  const homebrewVmScenario = Array.isArray(firstRunMatrix.scenarios)
    ? firstRunMatrix.scenarios.find((scenario) => scenario.id === 'homebrew_standard_cask_clean_vm_smoke')
    : null;
  const homebrewVm = homebrewVmScenario?.vm;
  const homebrewPolicy = releaseContract.homebrew_tap_distribution?.cask_install_policy;
  const workflowVmText = fs.readFileSync(path.join(appRoot, '.github/workflows/opl-first-run-vm.yml'), 'utf8');
  const preflightText = fs.readFileSync(path.join(appRoot, 'scripts/validate-release-preflight.ts'), 'utf8');

  if (
    homebrewVm?.homebrew_cask_install_ref !== requiredHomebrewStandardCaskRef ||
    homebrewPolicy?.standard_cask_install_ref !== requiredHomebrewStandardCaskRef ||
    !workflowVmText.includes(`homebrew_cask=${requiredHomebrewStandardCaskRef}`) ||
    !preflightText.includes(`const requiredHomebrewStandardCaskRef = '${requiredHomebrewStandardCaskRef}'`)
  ) {
    console.error('FAIL homebrew_vm_gate_static_policy: the standalone Homebrew VM gate must install the fully qualified App cask ref');
    failures += 1;
  }
  if (
    !sameStringSet(homebrewVm?.homebrew_trusted_cask_refs, requiredHomebrewTrustedCaskRefs) ||
    !sameStringSet(homebrewPolicy?.standard_install_trusted_cask_refs, requiredHomebrewTrustedCaskRefs) ||
    !preflightText.includes('const requiredHomebrewTrustedCaskRefs = [')
  ) {
    console.error('FAIL homebrew_vm_gate_static_policy: trusted refs must cover explicit standard/full/nightly cask refs');
    failures += 1;
  }
  if (
    homebrewVm?.homebrew_trust_scope !== requiredHomebrewTrustScope ||
    homebrewPolicy?.trust_scope !== requiredHomebrewTrustScope ||
    !preflightText.includes(`const requiredHomebrewTrustScope = '${requiredHomebrewTrustScope}'`)
  ) {
    console.error('FAIL homebrew_vm_gate_static_policy: trust scope must stay explicit cask refs, not whole tap');
    failures += 1;
  }
  if (
    homebrewVm?.homebrew_trusted_cask_refs?.includes('gaofeng21cn/one-person-lab') ||
    homebrewPolicy?.standard_install_trusted_cask_refs?.includes('gaofeng21cn/one-person-lab')
  ) {
    console.error('FAIL homebrew_vm_gate_static_policy: whole tap trust is not allowed');
    failures += 1;
  }

  return failures;
}

function validateWebuiPackagePolicy(releaseContract: Record<string, any>): number {
  let failures = 0;
  const webuiPackage = releaseContract.webui_ghcr_image;
  if (webuiPackage?.github_package_access?.target_repository_association !== 'gaofeng21cn/one-person-lab-app') {
    console.error('FAIL webui_package_association: target repository association must be gaofeng21cn/one-person-lab-app');
    failures += 1;
  }
  if (webuiPackage?.github_package_access?.current_historical_association_allowed_until_ui_migration !== 'gaofeng21cn/one-person-lab') {
    console.error('FAIL webui_package_association: historical association allowance must name gaofeng21cn/one-person-lab');
    failures += 1;
  }
  if (webuiPackage?.retention_policy?.cleanup_execution_mode !== 'dry_run_first_explicit_execute_required') {
    console.error('FAIL webui_retention_policy: cleanup must be dry-run first with explicit execute');
    failures += 1;
  }
  if (!webuiPackage?.retention_policy?.protected_tags?.includes('nightly')) {
    console.error('FAIL webui_retention_policy: protected tags must include nightly');
    failures += 1;
  }
  return failures;
}

export type ReleaseBrokerAuthorityReadiness = {
  current_release_admission_readiness: {
    status: 'retired' | 'blocked';
    mode: 'framework_checkpoint_app_executor';
    blockers: string[];
  };
  isolated_broker_hardening: {
    status: 'retired' | 'blocked';
    disposition: 'historical_receipt_verification_only';
    blockers: string[];
  };
};

export function evaluateReleaseBrokerAuthorityReadiness(
  authority: unknown,
): ReleaseBrokerAuthorityReadiness {
  const candidate = authority as Record<string, any> | null;
  const admission = candidate?.current_release_admission;
  const blockers: string[] = [];
  if (
    candidate?.schema !== 'opl_app_release_broker_authority.v1' ||
    candidate?.lifecycle !== 'retired_historical_receipt_verification_only' ||
    candidate?.live_mutation_authority !== false ||
    candidate?.new_admission_allowed !== false ||
    candidate?.new_dispatch_publish_promote_rebuild_or_cancel_allowed !== false ||
    candidate?.replacement_authority_ref !== 'contracts/app-release-channel.json#release_bundle_control_plane.live_authority' ||
    admission?.lifecycle !== 'retired_historical_projection' ||
    admission?.live_admission_authority !== false ||
    admission?.historical_receipt_verification_only !== true ||
    admission?.new_admission_allowed !== false ||
    candidate?.mutation_broker?.execution_allowed !== false ||
    candidate?.mutation_broker?.receipt_verification_only !== true ||
    candidate?.workflow_lookup?.new_lookup_or_mutation_allowed !== false ||
    candidate?.workflow_lookup?.historical_receipt_verification_only !== true
  ) blockers.push('legacy broker contract is not fully retired to historical receipt verification');
  return {
    current_release_admission_readiness: {
      status: blockers.length === 0 ? 'retired' : 'blocked',
      mode: 'framework_checkpoint_app_executor',
      blockers,
    },
    isolated_broker_hardening: {
      status: blockers.length === 0 ? 'retired' : 'blocked',
      disposition: 'historical_receipt_verification_only',
      blockers,
    },
  };
}

export function validateReleaseAccelerationPolicy(
  releaseContract: Record<string, any>,
  brokerAuthority: unknown,
): number {
  let failures = 0;
  const control = releaseContract.release_bundle_control_plane;
  const framework = control?.framework_authority;
  const live = control?.live_authority;
  const eventDelivery = control?.event_delivery;
  const checkpoint = control?.checkpoint_transport;
  const operations = control?.operation_control;
  const markerPolicy = checkpoint?.active_unknown_markers;
  const standardOperation = operations?.stable_operations?.standard;
  const resumeStandardOperation = operations?.stable_operations?.resume_standard;
  const appendFullOperation = operations?.stable_operations?.append_full;
  const resilience = control?.resilience_policy;
  const publication = control?.publication;
  const publisher = control?.publisher_idempotency;
  const legacy = control?.legacy_compatibility;
  const validationCanary = control?.validation_canary;
  const acceleration = releaseContract.release_acceleration;
  const preflight = releaseContract.release_preflight;
  const stableStageResult = preflight?.stable_stage_result;
  const failureFingerprint = preflight?.dispatch_guard?.failure_fingerprint_circuit_breaker;
  const settingsRuntimeRefresh = acceleration?.settings_runtime_refresh_evidence_policy;
  const homebrew = releaseContract.homebrew_tap_distribution;

  for (const violation of retiredReleaseControlPlaneViolations(releaseContract)) {
    console.error(`FAIL release_legacy_surface_absent: ${violation}`);
    failures += 1;
  }

  if (
    control?.schema !== 'opl_app_release_bundle_control_plane.v1' ||
    control?.contract_status !== 'active' ||
    framework?.owner !== 'gaofeng21cn/one-person-lab' ||
    framework?.bundle_schema !== 'opl_release_bundle.v1' ||
    framework?.checkpoint_schema !== 'opl_release_bundle_checkpoint.v1' ||
    framework?.operation_control_schema !== 'opl_release_bundle_operation_control.v1' ||
    framework?.operation_event_schema !== 'opl_release_bundle_operation_event.v1' ||
    framework?.consumer_envelope_schema !== 'opl_release_bundle_consumer_envelope.v1' ||
    framework?.unknown_outcome_schema !== 'opl_release_bundle_unknown_outcome.v1' ||
    framework?.portable_checkpoint_authority_first_landed_sha !== 'f785cda96' ||
    framework?.consumed_abi_sha !== frameworkReleaseAbiSha ||
    framework?.cli !== 'opl release' ||
    framework?.live_mutation_authority !== 'framework_release_bundle_executor' ||
    framework?.checkpoint_and_receipt_state_authority_exclusive !== true ||
    framework?.app_may_define_checkpoint_or_receipt_schema !== false ||
    framework?.app_may_derive_or_project_release_stage_state !== false ||
    !sameStringSet(framework?.receipt_schemas, [
      'opl_release_bundle_executor_receipt.v1',
      'opl_release_bundle_operation_receipt.v1',
      'opl_release_bundle_qualification_receipt.v1',
    ]) ||
    JSON.stringify(framework?.commands) !== JSON.stringify(requiredFrameworkReleaseCommands)
  ) {
    console.error('FAIL release_bundle_authority: Framework opl release and its portable checkpoint must own live release state');
    failures += 1;
  }
  if (
    eventDelivery?.framework_event_schema !== 'opl_release_bundle_operation_event.v1' ||
    eventDelivery?.framework_consumer_envelope_schema
      !== 'opl_release_bundle_consumer_envelope.v1' ||
    eventDelivery?.source !== 'framework_immutable_operation_receipts' ||
    eventDelivery?.event_idempotency_key_equals_event_id !== true ||
    eventDelivery?.consumer_ack_is_read_only !== true ||
    eventDelivery?.duplicate_event_may_trigger_second_operation !== false ||
    eventDelivery?.stale_event_may_replace_newer_bundle_or_operation_state !== false ||
    eventDelivery?.long_wait_mode !== 'event_driven_wakeup_with_status_readback' ||
    eventDelivery?.standard_and_full_operation_identity_must_be_distinct !== true ||
    eventDelivery?.full_envelope_requires_source_checkpoint_run_id !== true ||
    eventDelivery?.consumer_trigger_only !== true ||
    eventDelivery?.consumer_may_dispatch !== false ||
    eventDelivery?.active_task_invariant?.real_owner_required !== true ||
    eventDelivery?.active_task_invariant?.executable_next_action_required !== true ||
    eventDelivery?.active_task_invariant?.recoverable_framework_checkpoint_or_event_cursor_required
      !== true ||
    eventDelivery?.active_task_invariant?.wait_without_new_decision_is_not_active_work !== true ||
    eventDelivery?.terminal_task_policy?.close_thread_after_owned_operation_terminal !== true ||
    eventDelivery?.terminal_task_policy?.downstream_consumers_start_from_framework_envelope !== true ||
    eventDelivery?.terminal_task_policy?.reuse_terminal_thread_as_permanent_controller !== false ||
    eventDelivery?.recovery_entry !== 'opl release status then exact opl release reconcile'
  ) {
    console.error('FAIL release_event_delivery: consumers must use idempotent Framework events and non-authorizing envelopes');
    failures += 1;
  }
  if (JSON.stringify(framework?.command_forms) !== JSON.stringify(requiredFrameworkReleaseCommandForms)) {
    console.error('FAIL release_bundle_framework_abi: App contract must match the current Framework CLI forms exactly');
    failures += 1;
  }
  if (
    live?.single_live_mutation_authority !== true ||
    live?.state_owner !== 'OPL Framework opl release' ||
    live?.state_surface !== 'opl_release_bundle_checkpoint.v1' ||
    live?.mutation_executor_owner !== 'one-person-lab-app' ||
    live?.state_authority_ref !== 'release_bundle_control_plane.framework_authority' ||
    live?.app_executor_consumes_framework_cli_results_without_state_projection !== true ||
    !sameStringSet(live?.stable_operations, ['standard', 'resume_standard', 'append_full']) ||
    live?.stable_manual_entry !== '.github/workflows/release-stable.yml' ||
    live?.validation_canary_entry !== '.github/workflows/release-bundle-canary.yml_schedule' ||
    live?.app_session_broker_or_operator_may_authorize_mutation !== false ||
    live?.framework_checkpoint_required_for_resume_or_executor_switch !== true
  ) {
    console.error('FAIL release_live_authority: only Framework checkpoint state and the App executor may mutate a release');
    failures += 1;
  }
  if (
    checkpoint?.schema !== 'opl_release_bundle_checkpoint.v1' ||
    !sameStringSet(checkpoint?.stages, [
      'frozen', 'standard_built', 'standard_qualified', 'full_built', 'full_qualified',
    ]) ||
    checkpoint?.portable_between_executors !== true ||
    checkpoint?.import_never_rebuilds !== true ||
    checkpoint?.completed_stage_behavior !== 'skip_with_rebuild_performed_false' ||
    checkpoint?.asset_and_receipt_digest_revalidation_required !== true ||
    !sameStringSet(checkpoint?.source_build_provenance_fields, [
      'source_build_executor', 'source_build_run_id',
    ]) ||
    !sameStringSet(checkpoint?.transport_provenance_fields, [
      'checkpoint_transport_executor', 'transport_run_id',
    ]) ||
    checkpoint?.transport_must_not_replace_source_build_provenance !== true ||
    checkpoint?.operation_controls_preserved_exactly !== true ||
    checkpoint?.same_output_idempotency_requires_complete_store_state_unchanged !== true ||
    checkpoint?.state_change_at_existing_output_fails_stale !== true ||
    checkpoint?.unknown_build_or_publish_outcome_export_allowed !== true ||
    checkpoint?.unknown_outcome_required_action !== 'status_then_exact_reconcile' ||
    markerPolicy?.schema !== 'opl_release_bundle_unknown_outcome.v1' ||
    markerPolicy?.maximum_count !== 1 ||
    markerPolicy?.checkpoint_export_preserves_exact_marker !== true ||
    markerPolicy?.checkpoint_import_preserves_exact_marker !== true ||
    !sameStringSet(markerPolicy?.checkpoint_import_result_fields, [
      'unknown_outcomes_imported', 'active_unknown_marker_count', 'reconcile_required',
    ]) ||
    markerPolicy?.checkpoint_import_required_next_action !== 'status_then_exact_reconcile' ||
    markerPolicy?.ordinary_mutations_allowed !== false ||
    !sameStringSet(markerPolicy?.allowed_commands, ['status', 'exact_reconcile']) ||
    JSON.stringify(markerPolicy?.exact_reconcile_match_fields) !== JSON.stringify(requiredUnknownMarkerFields) ||
    markerPolicy?.resolved_marker_reimport_behavior !== 'must_not_resurrect' ||
    markerPolicy?.different_marker_overwrite_or_omission_allowed !== false ||
    checkpoint?.publish_or_promotion_state_imported !== false ||
    checkpoint?.recipient_remote_readback !== 'fresh_remote_inspect_before_any_upload_or_promotion'
  ) {
    console.error('FAIL release_checkpoint_transport: executor switches must preserve exact controls and unknown markers without rebuilding or resurrecting resolved outcomes');
    failures += 1;
  }
  if (
    operations?.schema !== 'opl_release_bundle_operation_control.v1' ||
    operations?.stable_mutation_mutex !== 'opl-release-bundle-global' ||
    standardOperation?.source !== 'new_framework_bundle' ||
    standardOperation?.control !== 'new_immutable_standard_control' ||
    standardOperation?.deadline_minutes !== 90 ||
    resumeStandardOperation?.source !== 'portable_framework_checkpoint' ||
    resumeStandardOperation?.control !== 'reuse_exact_standard_control' ||
    resumeStandardOperation?.deadline_minutes !== undefined ||
    JSON.stringify(resumeStandardOperation?.reused_control_fields) !== JSON.stringify(requiredOperationControlFields) ||
    resumeStandardOperation?.new_operation_id_allowed !== false ||
    resumeStandardOperation?.start_refresh_allowed !== false ||
    resumeStandardOperation?.deadline_refresh_allowed !== false ||
    resumeStandardOperation?.rebuild_allowed !== false ||
    appendFullOperation?.source !== 'portable_framework_checkpoint_at_or_after_standard_built' ||
    appendFullOperation?.control !== 'new_independent_append_full_control' ||
    appendFullOperation?.deadline_minutes !== 120 ||
    appendFullOperation?.standard_built_required !== true ||
    appendFullOperation?.standard_rebuild_allowed !== false ||
    appendFullOperation?.standard_operation_id_reuse_allowed !== false ||
    appendFullOperation?.standard_deadline_inheritance_allowed !== false ||
    operations?.job_admission !== 'every_mutating_job_checks_exact_operation_and_absolute_deadline_before_first_remote_api' ||
    operations?.deadline_clock !== 'github_actions_created_at_resolved_once_by_controller' ||
    operations?.deadline_source_field !== 'github.created_at' ||
    operations?.deadline_frozen_at_controller_admission !== true ||
    operations?.deadline_may_be_rebased_on_queue_start_resume_or_rerun !== false ||
    JSON.stringify(operations?.operation_admission_identity_fields) !== JSON.stringify([
      'operation', 'operation_id', 'operation_started_at', 'operation_deadline_at',
    ]) ||
    operations?.operation_id_required_for_admit_build_verify_publish_and_reconcile !== true ||
    operations?.same_operation_jobs_and_mutations_share_exact_deadline !== true ||
    operations?.each_external_mutation_rechecks_remaining_deadline !== true ||
    operations?.append_full_uses_new_operation_admission !== true ||
    operations?.append_full_may_inherit_standard_deadline !== false ||
    operations?.deadline_refresh_allowed !== false ||
    operations?.partial_workflow_rerun_allowed !== false ||
    operations?.github_run_attempt_required !== 1 ||
    operations?.recovery_entry !== 'status_then_exact_reconcile_for_active_unknown_else_resume_exact_standard_or_admit_independent_append_full' ||
    operations?.elapsed_deadline?.ordinary_mutation_allowed !== false ||
    operations?.elapsed_deadline?.status_allowed !== true ||
    operations?.elapsed_deadline?.exact_reconcile_allowed !== true ||
    operations?.elapsed_deadline?.exact_reconcile_result !== 'late_observation' ||
    operations?.elapsed_deadline?.stage_advanced !== false ||
    operations?.elapsed_deadline?.evidence_only !== true ||
    operations?.typed_failure_evidence_required !== true ||
    operations?.typed_failure_evidence_persisted_before_job_exit_or_cleanup !== true ||
    operations?.typed_failure_evidence_uploaded_on_failure !== true
  ) {
    console.error('FAIL release_operation_control: Standard control must be immutable, resume exact, append independent, and late reconcile evidence-only');
    failures += 1;
  }
  if (
    stableStageResult?.schema !== 'opl_app_stable_stage_result.v1' ||
    stableStageResult?.json_schema !== 'contracts/app-stable-stage-result.schema.json' ||
    stableStageResult?.script !== 'scripts/stable-stage-result.ts' ||
    stableStageResult?.authority !== 'attempt_observation_only_no_framework_state_projection' ||
    stableStageResult?.business_stage_count !== 11 ||
    JSON.stringify(stableStageResult?.stage_ids) !== JSON.stringify(requiredStableBusinessStageIds) ||
    JSON.stringify(stableStageResult?.axes) !== JSON.stringify(requiredStableStageAxes) ||
    stableStageResult?.primary_failure_rule !== 'lowest_stage_index_failed_qualification_product_axis' ||
    stableStageResult?.secondary_failure_rule !==
      'evidence_transport_cleanup_and_later_product_failures_do_not_overwrite_primary' ||
    stableStageResult?.cleanup_normalization?.condition !==
      'command_nonzero_and_final_inspection_absent' ||
    stableStageResult?.cleanup_normalization?.status !== 'cleanup_idempotent_success' ||
    stableStageResult?.cleanup_normalization?.records_command_anomaly !== true ||
    stableStageResult?.cleanup_normalization?.eligible_for_primary_failure !== false ||
    stableStageResult?.release_state_authority !== false ||
    stableStageResult?.framework_status_authority !== false ||
    stableStageResult?.mutation_authority !== false ||
    stableStageResult?.framework_checkpoint_projection_allowed !== false ||
    stableStageResult?.placeholder_or_inferred_success_allowed !== false ||
    stableStageResult?.workflow_binding?.workflow !== '.github/workflows/release-stable.yml' ||
    stableStageResult?.workflow_binding?.schema_env !== 'OPL_APP_STABLE_STAGE_RESULT_SCHEMA' ||
    stableStageResult?.workflow_binding?.authority_env !== 'OPL_APP_STABLE_STAGE_RESULT_AUTHORITY' ||
    stableStageResult?.workflow_binding?.stage_inputs_require_real_attempt_evidence !== true
  ) {
    console.error('FAIL stable_stage_result_contract: App stage results must be deterministic non-authoritative attempt observations');
    failures += 1;
  }
  if (
    failureFingerprint?.schema !== 'opl_app_stable_failure_fingerprint.v1' ||
    failureFingerprint?.stage_result_schema !== 'opl_app_stable_stage_result.v1' ||
    JSON.stringify(failureFingerprint?.identity_fields) !==
      JSON.stringify(requiredStableFailureFingerprintFields) ||
    failureFingerprint?.attempt_included_in_identity !== false ||
    failureFingerprint?.prior_and_current_required_together !== true ||
    failureFingerprint?.unchanged_status !== 'blocked_unchanged' ||
    failureFingerprint?.unchanged_failure_code !== 'unchanged_failure_fingerprint' ||
    failureFingerprint?.unchanged_dispatch_allowed !== false ||
    failureFingerprint?.unchanged_dispatch_count !== 0 ||
    failureFingerprint?.unchanged_mutation_invocation_count !== 0 ||
    failureFingerprint?.evaluated_before_git_wire_or_owner_api !== true ||
    failureFingerprint?.changed_fingerprint_only_continues_read_only_pre_nonce_gates !== true
  ) {
    console.error('FAIL stable_failure_fingerprint_contract: unchanged fingerprints must deny dispatch before transport');
    failures += 1;
  }
  if (
    publication?.stable?.only_manual_dispatch_workflow !== '.github/workflows/release-stable.yml' ||
    publication?.stable?.trigger !== 'workflow_dispatch' ||
    publication?.stable?.lower_level_workflows !== 'workflow_call_only' ||
    JSON.stringify(publication?.stable?.latest_admission) !== JSON.stringify(requiredStandardLatestAdmission)
  ) {
    console.error('FAIL release_latest_admission: Latest must require the hosted publication floor, exact candidate bytes, and Homebrew publication/readback without optional certification evidence');
    failures += 1;
  }
  if (
    publication?.nightly?.status !== 'implemented_pending_first_publication_readback' ||
    publication?.nightly?.publication_available !== true ||
    publication?.nightly?.mutation_available !== true ||
    publication?.nightly?.historical_readback_allowed !== true ||
    publication?.nightly?.workflow !== '.github/workflows/release-nightly.yml' ||
    publication?.nightly?.default_trigger !== 'daily_schedule' ||
    JSON.stringify(publication?.nightly?.development_validation_trigger) !== JSON.stringify({
      event: 'workflow_dispatch',
      authority: 'user_explicit',
      confirmation: 'publish_nonlatest_nightly',
      execution_path: 'same_as_scheduled_nightly',
    }) ||
    publication?.nightly?.scheduled_latest_allowed !== false ||
    publication?.nightly?.explicit_user_override_may_move_latest !== true ||
    publication?.nightly?.include_full !== false ||
    publication?.nightly?.stable_bundle_authority_used !== false ||
    publication?.nightly?.stable_mutation_mutex_used !== false ||
    publication?.nightly?.heavy_vm_blocking !== false ||
    publication?.nightly?.post_publication_followers_block_github_prerelease !== false ||
    publication?.nightly?.homebrew_follower !== '.github/workflows/release-nightly-homebrew-follower.yml' ||
    publication?.nightly?.sampled_vm_follower !== '.github/workflows/release-nightly-sampled-vm.yml'
  ) {
    console.error('FAIL release_nightly_publication: Nightly must default to the daily schedule and keep user-explicit development validation on the same Standard-only non-Latest path');
    failures += 1;
  }
  if (
    publisher?.missing_asset !== 'upload' ||
    publisher?.same_name_same_digest !== 'already_complete' ||
    publisher?.same_name_different_digest !== 'fail_closed_require_new_bundle_or_version' ||
    publisher?.unknown_api_result !== 'reconcile_only' ||
    publisher?.redispatch_on_unknown_allowed !== false ||
    publisher?.rerun_on_unknown_allowed !== false ||
    publisher?.cancel_on_unknown_allowed !== false ||
    JSON.stringify(publisher?.reconcile_admission) !== JSON.stringify(requiredPublisherReconcileAdmission)
  ) {
    console.error('FAIL release_reconcile_admission: persistent Framework unknown status must gate bounded inspect and reconcile without mutation retries');
    failures += 1;
  }
  if (
    resilience?.same_day_revision_allocation_ref !== 'github_release_name.stable_revision' ||
    resilience?.machine_version_monotonicity_ref !== 'github_release_name.machine_version' ||
    resilience?.stable_version_comparison_scope !== 'all_public_stable_releases_not_latest_only' ||
    resilience?.display_and_machine_versions_both_must_increase !== true ||
    resilience?.source_and_remote_version_checks_required_before_build !== true ||
    !sameStringSet(resilience?.updater_baseline_sources, ['current_latest', 'highest_public_stable']) ||
    resilience?.updater_qualification_order !== 'exact_previous_latest_to_candidate_zip_upgrade_before_first_public_release_mutation' ||
    resilience?.updater_zip_digest_source !== 'sha256_of_actual_candidate_zip_bytes' ||
    !sameStringSet(resilience?.updater_zip_identity_fields, ['size_bytes', 'sha256']) ||
    resilience?.updater_metadata_declared_digest_is_not_sufficient !== true ||
    resilience?.homebrew_single_writer !== true ||
    resilience?.homebrew_unknown_outcome !== 'framework_durable_marker_status_then_exact_reconcile' ||
    resilience?.homebrew_reconcile_owner !== 'OPL Framework opl release' ||
    resilience?.homebrew_app_local_reconcile_loop_allowed !== false ||
    resilience?.homebrew_reconcile_max_attempts !== undefined ||
    resilience?.homebrew_retry_push_on_unknown_allowed !== false ||
    resilience?.homebrew_success_requires_exact_remote_commit_and_cask_digest_readback !== true ||
    resilience?.partial_publication_unknown_result !== 'framework_reconcile_before_any_new_mutation'
  ) {
    console.error('FAIL release_resilience: version monotonicity, pre-public updater bytes, and Framework-owned exact Homebrew reconcile are mandatory');
    failures += 1;
  }
  if (
    !control?.cutover?.permanently_rejected_bundle_digests?.includes(
      'sha256:91d5ea069757fca6bb9aa2280615dc952caeff55b6b4bc13e08e40df32378f49',
    )
  ) {
    console.error('FAIL release_rejected_bundle: the known failed Bundle digest must remain permanently ineligible');
    failures += 1;
  }
  if (
    legacy?.lifecycle !== 'retired_historical_receipt_compatibility' ||
    legacy?.authority_class !== 'historical_read_only' ||
    legacy?.broker_session_operator_authority !== 'historical_read_only' ||
    legacy?.access !== 'read_only' ||
    legacy?.authoritative !== false ||
    legacy?.mode !== 'read_only_receipt_parser' ||
    legacy?.new_state_creation_allowed !== false ||
    legacy?.legacy_broker_and_stable_state_machine_live_mutation_authority !== false ||
    legacy?.historical_receipts_remain_readable !== true ||
    legacy?.new_legacy_dispatch_publish_or_rebuild_allowed !== false ||
    !sameStringSet(legacy?.accepted_read_only_commands, ['verify', 'status']) ||
    !stringArrayIncludesAll(legacy?.parser_forbidden_capabilities, [
      'create_release_state', 'authorize_mutation', 'dispatch', 'rerun', 'cancel',
      'build', 'qualify', 'publish', 'promote', 'reconcile_live_state',
    ]) ||
    !sameStringSet(legacy?.retired_package_scripts, requiredRetiredReleasePackageScripts) ||
    legacy?.retired_scripts_may_parse_historical_receipts !== false ||
    legacy?.retired_scripts_may_be_package_or_workflow_mutation_entrypoints !== false ||
    legacy?.legacy_contract_role !== 'historical_receipt_verification_only' ||
    acceleration?.scope !== 'product_build_qualification_vm_and_cache_policy_only' ||
    acceleration?.product_policy_only !== true ||
    acceleration?.live_state_authority !== false ||
    acceleration?.live_mutation_authority !== false ||
    acceleration?.new_session_or_dispatch_allowed !== false ||
    acceleration?.state_authority_ref !== 'release_bundle_control_plane.framework_authority' ||
    acceleration?.github_actions?.live_release_mutation_authority !== false ||
    releaseContract.operator_evidence_bundle?.release_owner_verdict?.live_release_mutation_authority !== false ||
    releaseContract.operator_evidence_bundle?.release_owner_verdict?.framework_bundle_state_effect !== 'none' ||
    releaseContract.operator_evidence_bundle?.release_owner_verdict?.may_dispatch_rerun_cancel_publish_or_promote !== false
  ) {
    console.error('FAIL release_legacy_retirement: broker, session, and operator implementations must remain absent while retained Bundle status commands read historical evidence');
    failures += 1;
  }
  if (JSON.stringify(validationCanary) !== JSON.stringify(requiredValidationCanary)) {
    console.error('FAIL release_validation_canary: Canary must start the complete reusable topology in validation-only mode without secrets, builds, VMs, or external writes');
    failures += 1;
  }
  if (
    settingsRuntimeRefresh?.schema !== 'opl_settings_runtime_refresh_evidence_policy.v1' ||
    settingsRuntimeRefresh?.production_default_targets_required !== true ||
    settingsRuntimeRefresh?.synthetic_target_injection_allowed !== false ||
    JSON.stringify(settingsRuntimeRefresh?.required_routes) !== JSON.stringify([
      {
        id: 'runtime-settings-alias',
        requested_hash: '#/settings/runtime',
        allowed_resolved_hash_prefixes: ['#/settings/environment'],
      },
      {
        id: 'runtime-status',
        requested_hash: '#/runtime',
        allowed_resolved_hash_prefixes: ['#/runtime'],
      },
    ]) ||
    !sameStringSet(settingsRuntimeRefresh?.required_evidence_fields, [
      'id',
      'requested_hash',
      'resolved_hash',
      'interactions.runtimeRefresh.requested_hash',
      'interactions.runtimeRefresh.resolved_hash',
      'interactions.runtimeRefresh.readiness.hash',
      'interactions.runtimeRefresh.readiness.state',
      'interactions.runtimeRefresh.readiness.pageReady',
      'interactions.runtimeRefresh.refresh.before_click.buttonReady',
      'interactions.runtimeRefresh.refresh.after_click.buttonReady',
    ]) ||
    !sameStringSet(settingsRuntimeRefresh?.allowed_readiness_states, ['ready', 'empty']) ||
    settingsRuntimeRefresh?.distinct_entry_per_route_required !== true ||
    settingsRuntimeRefresh?.default_timeout_ms !== 30000 ||
    settingsRuntimeRefresh?.phase_timeout_binding !== 'min_timeout_ms_and_codex_readiness_phase_timeout_ms_or_timeout_ms' ||
    settingsRuntimeRefresh?.validator !== 'scripts/validate-settings-smoke-runtime-evidence.ts' ||
    settingsRuntimeRefresh?.workflow !== '.github/workflows/opl-first-run-vm.yml' ||
    settingsRuntimeRefresh?.verification_artifact !== 'artifacts/opl-first-run-vm/artifacts/settings-runtime-refresh-verification.json' ||
    settingsRuntimeRefresh?.source_implementation_failure_mode !== 'fail_closed_before_expensive_build_or_vm' ||
    settingsRuntimeRefresh?.runtime_evidence_failure_mode !== 'fail_closed_before_qualification_receipt_or_publication'
  ) {
    console.error('FAIL release_settings_runtime_refresh: production VM evidence must prove both Runtime routes without synthetic target substitution');
    failures += 1;
  }
  if (
    !sameStringSet(homebrew?.allowed_casks, ['one-person-lab', 'one-person-lab-nightly', 'one-person-lab-full']) ||
    !sameStringSet(homebrew?.casks, ['one-person-lab', 'one-person-lab-nightly', 'one-person-lab-full']) ||
    !sameStringSet(homebrew?.initial_live_targets, [
      'Casks/one-person-lab.rb', 'Casks/one-person-lab-nightly.rb', 'Casks/one-person-lab-full.rb',
    ]) ||
    !sameStringSet(homebrew?.excluded_casks, []) ||
    !sameStringSet(homebrew?.full_casks, ['one-person-lab-full']) ||
    homebrew?.tap_update_policy?.stable_release_workflow_write_mode !== 'release_bundle_standard_before_latest_only' ||
    homebrew?.tap_update_policy?.stable?.mode !==
      'release_bundle_publishes_standard_cask_then_hosted_readback_before_latest' ||
    homebrew?.tap_update_policy?.stable?.publication_mode !==
      'release_bundle_publishes_standard_cask_then_hosted_readback_before_latest' ||
    homebrew?.tap_update_policy?.stable?.may_consume_nightly_directly !== false ||
    homebrew?.tap_update_policy?.nightly?.mode !== 'post_publication_digest_bound_single_attempt_follower' ||
    homebrew?.tap_update_policy?.nightly?.workflow !== '.github/workflows/release-nightly-homebrew-follower.yml' ||
    homebrew?.tap_update_policy?.nightly?.environment !== 'release-nightly' ||
    homebrew?.tap_update_policy?.nightly?.credential?.kind !== 'repository_scoped_write_deploy_key' ||
    homebrew?.tap_update_policy?.nightly?.credential?.repository !== 'gaofeng21cn/homebrew-one-person-lab' ||
    homebrew?.tap_update_policy?.nightly?.credential?.secret !==
      'release-nightly.OPL_HOMEBREW_TAP_DEPLOY_KEY' ||
    homebrew?.tap_update_policy?.nightly?.credential?.stable_environment_credentials_reused !== false ||
    homebrew?.tap_update_policy?.nightly?.target !== 'Casks/one-person-lab-nightly.rb' ||
    homebrew?.tap_update_policy?.nightly?.may_update_stable !== false ||
    homebrew?.tap_update_policy?.nightly?.mutation_allowed !== true ||
    homebrew?.tap_update_policy?.nightly?.stable_cask_must_remain_exact !== true ||
    homebrew?.tap_update_policy?.nightly?.unknown_or_conflicting_result !== 'fail_closed_no_retry_rerun_or_redispatch' ||
    homebrew?.tap_update_policy?.full?.mode !== 'post_publication_digest_bound_single_attempt_follower' ||
    homebrew?.tap_update_policy?.full?.workflow !== '.github/workflows/release-homebrew-full-follower.yml' ||
    homebrew?.tap_update_policy?.full?.environment !== 'release-stable' ||
    homebrew?.tap_update_policy?.full?.target !== 'Casks/one-person-lab-full.rb' ||
    homebrew?.tap_update_policy?.full?.homebrew_publish_allowed !== true ||
    homebrew?.tap_update_policy?.full?.mutation_allowed !== true ||
    homebrew?.tap_update_policy?.full?.source_completed_stage !== 'full_qualified' ||
    homebrew?.tap_update_policy?.full?.authority_model !== 'immutable_public_artifact_observer' ||
    homebrew?.tap_update_policy?.full?.framework_checkpoint_import_allowed !== false ||
    homebrew?.tap_update_policy?.full?.current_follower_operation_control_required !== true ||
    homebrew?.tap_update_policy?.full?.homebrew_clean_vm_gate_required !== false ||
    homebrew?.tap_update_policy?.full?.framework_carrier !== 'full_dmg_embedded_opl_base' ||
    homebrew?.tap_update_policy?.full?.formula_dependency_required !== false ||
    homebrew?.tap_update_policy?.full?.promotion_status !== 'approved_pending_first_protected_follower_readback' ||
    homebrew?.tap_update_policy?.full?.unknown_or_conflicting_result !== 'fail_closed_no_retry_rerun_or_redispatch' ||
    homebrew?.tap_update_policy?.full?.exact_failed_follower_recovery?.trigger !== 'workflow_dispatch' ||
    homebrew?.tap_update_policy?.full?.exact_failed_follower_recovery?.authority_binding !==
      'same_successful_append_full_run_exact_failed_first_attempt_consumed_recovery_v1_and_consumed_deadline_failed_recovery_v2' ||
    homebrew?.tap_update_policy?.full?.exact_failed_follower_recovery?.recovery_generation !== 3 ||
    !sameStringSet(homebrew?.tap_update_policy?.full?.exact_failed_follower_recovery?.consumed_recovery_generations, [1, 2]) ||
    !sameStringSet(homebrew?.tap_update_policy?.full?.exact_failed_follower_recovery?.required_inputs, [
      'source_run_id', 'failed_follower_run_id', 'failed_recovery_run_id', 'failed_recovery_v2_run_id', 'recovery_confirmation',
    ]) ||
    homebrew?.tap_update_policy?.full?.exact_failed_follower_recovery?.confirmation !==
      'recover_exact_failed_homebrew_full_follower_v3' ||
    homebrew?.tap_update_policy?.full?.exact_failed_follower_recovery?.failed_boundary !==
      'first_attempt_handoff_bind_failed_recovery_v1_framework_checkpoint_restore_failed_and_recovery_v2_noncanonical_45_minute_deadline_failed_before_protected_publish' ||
    homebrew?.tap_update_policy?.full?.exact_failed_follower_recovery?.failed_follower_public_mutation_count_required !== 0 ||
    homebrew?.tap_update_policy?.full?.exact_failed_follower_recovery?.failed_recovery_public_mutation_count_required !== 0 ||
    homebrew?.tap_update_policy?.full?.exact_failed_follower_recovery?.failed_recovery_v2_public_mutation_count_required !== 0 ||
    homebrew?.tap_update_policy?.full?.exact_failed_follower_recovery?.canonical_main_executor_required !== true ||
    homebrew?.tap_update_policy?.full?.exact_failed_follower_recovery?.same_identity_recovery_v3_run_count_required !== 1 ||
    homebrew?.tap_update_policy?.full?.exact_failed_follower_recovery?.workflow_rerun_allowed !== false ||
    homebrew?.tap_update_policy?.full?.exact_failed_follower_recovery?.append_full_redispatch_allowed !== false ||
    homebrew?.full_first_install_policy !== 'the independent immutable Full adjunct GitHub Release is the Full DMG and manifest self-identity authority; its durable receipt exposes the adjunct Release and asset URLs, and its compatibility admission uses capability, minimum-version, or SemVer-range requirements through the Framework-owner receipt. The protected Homebrew Full follower consumes that exact adjunct with digest CAS and public readback; physical clean-machine certification remains optional and non-blocking; the base Stable Release, Latest, and standard updater metadata remain unchanged' ||
    !sameStringSet(homebrew?.opl_packages_boundary?.allowed_homebrew_casks, [
      'one-person-lab', 'one-person-lab-nightly', 'one-person-lab-full',
    ])
  ) {
    console.error('FAIL release_homebrew_distribution: Nightly and Full must use isolated digest-bound followers; Full must use its immutable adjunct without changing base Stable, Latest, or updater state');
    failures += 1;
  }
  const readiness = evaluateReleaseBrokerAuthorityReadiness(brokerAuthority);
  if (
    readiness.current_release_admission_readiness.status !== 'retired' ||
    readiness.current_release_admission_readiness.mode !== 'framework_checkpoint_app_executor' ||
    readiness.isolated_broker_hardening.status !== 'retired' ||
    readiness.isolated_broker_hardening.disposition !== 'historical_receipt_verification_only'
  ) {
    console.error('FAIL release_broker_retirement: the legacy broker contract must be verify-only and non-authoritative');
    failures += 1;
  }

  return failures;
}

function validateSourceMaterialRouteContract(appRoot: string): number {
  const runtimeBridge = readJson(appRoot, 'contracts/app-runtime-bridge.json');
  const guiContract = readJson(appRoot, 'contracts/app-gui-product-contract.json');
  const pageStateMatrix = readJson(appRoot, 'contracts/app-page-state-matrix.json');
  const sourceMaterial = runtimeBridge.source_material_projection;
  const guiRoute = guiContract.source_material_user_path;
  const ordinaryPage = Array.isArray(pageStateMatrix.pages)
    ? pageStateMatrix.pages.find((page) => page.id === 'ordinary_conversation')
    : null;
  const inspectorPage = Array.isArray(pageStateMatrix.pages)
    ? pageStateMatrix.pages.find((page) => page.id === 'right_context_inspector')
    : null;
  const requiredRefs = [
    'source_material_refs',
    'source_material_receipt_refs',
    'reference_design_packet_refs',
  ];
  let failures = 0;

  if (
    sourceMaterial?.ingest_command !== 'opl workspace source ingest --workspace <workspace_ref> --files <file_refs> --goal <user_goal> --json' ||
    sourceMaterial?.authority !== 'opl_framework_source_material_refs_projection' ||
    sourceMaterial?.producer_owner !== 'one-person-lab' ||
    sourceMaterial?.reference_design_consumer !== 'opl-meta-agent'
  ) {
    console.error('FAIL source_material_route_contract: source material must route through Framework ingest and OMA reference design consumption');
    failures += 1;
  }
  if (
    !stringArrayIncludesAll(sourceMaterial?.required_ref_fields, requiredRefs) ||
    !stringArrayIncludesAll(sourceMaterial?.domain_consumers, [
      'med-autoscience',
      'med-autogrant',
      'redcube-ai',
      'opl-bookforge',
      'opl-meta-agent',
    ])
  ) {
    console.error('FAIL source_material_route_contract: source material projection must require source/receipt/reference-design refs and domain consumers');
    failures += 1;
  }
  if (
    sourceMaterial?.refs_only !== true ||
    sourceMaterial?.source_body_access !== false ||
    sourceMaterial?.pdf_parse_access !== false ||
    sourceMaterial?.artifact_body_access !== false ||
    sourceMaterial?.domain_truth_write_access !== false ||
    sourceMaterial?.owner_receipt_write_access !== false ||
    sourceMaterial?.domain_verdict_authority !== false ||
    sourceMaterial?.readiness_authority !== false ||
    sourceMaterial?.source_readiness_authority !== false
  ) {
    console.error('FAIL source_material_route_contract: App must remain refs-only with no source/PDF body, domain truth, owner receipt, or readiness authority');
    failures += 1;
  }
  if (
    !stringArrayIncludesAll(sourceMaterial?.forbidden_claims, [
      'source_body',
      'pdf_parse_quality',
      'reference_design_quality_verdict',
      'domain_truth',
      'owner_receipt_authority',
      'app_release_readiness',
    ])
  ) {
    console.error('FAIL source_material_route_contract: forbidden claims must block body parsing quality, domain truth, owner receipt, and release readiness claims');
    failures += 1;
  }
  if (
    guiRoute?.route_contract_ref !== 'contracts/app-runtime-bridge.json#source_material_projection' ||
    guiRoute?.source_material_projection_ref !== 'contracts/app-runtime-bridge.json#source_material_projection' ||
    guiRoute?.framework_ingest_command !== sourceMaterial?.ingest_command ||
    guiRoute?.ui_implementation_status !== 'route_contract_landed_no_live_drag_drop_ui_evidence' ||
    guiRoute?.refs_only !== true ||
    guiRoute?.source_body_access !== false ||
    guiRoute?.pdf_parse_access !== false ||
    guiRoute?.artifact_body_access !== false ||
    guiRoute?.domain_verdict_authority !== false ||
    guiRoute?.owner_receipt_write_access !== false ||
    guiRoute?.release_readiness_authority !== false ||
    !stringArrayIncludesAll(guiRoute?.machine_ref_fields, requiredRefs)
  ) {
    console.error('FAIL source_material_route_contract: GUI source-material user path must mirror refs-only Framework route without live UI/readiness claims');
    failures += 1;
  }

  const guiConversationFields = guiContract.ordinary_conversation?.current_task_slice?.fields;
  const guiInspectorEvidence = guiContract.right_context_inspector?.current_task_evidence;
  const pageConversationSlice = ordinaryPage?.conversation_view_model?.current_task_slice;
  const pageInspectorEvidence = inspectorPage?.inspector_view_model?.current_task_evidence;
  for (const [surface, fields] of [
    ['gui ordinary conversation', guiConversationFields],
    ['gui right inspector', guiInspectorEvidence?.fields],
    ['page-state ordinary conversation', pageConversationSlice?.fields],
    ['page-state right inspector', pageInspectorEvidence?.fields],
  ] as const) {
    if (!stringArrayIncludesAll(fields, requiredRefs)) {
      console.error(`FAIL source_material_route_contract: ${surface} must expose source material refs, receipt refs, and reference design packet refs`);
      failures += 1;
    }
  }
  for (const [surface, evidence] of [
    ['gui right inspector', guiInspectorEvidence],
    ['page-state right inspector', pageInspectorEvidence],
  ] as const) {
    if (evidence?.source_material_projection_ref !== 'contracts/app-runtime-bridge.json#source_material_projection') {
      console.error(`FAIL source_material_route_contract: ${surface} must point to source material projection`);
      failures += 1;
    }
  }

  return failures;
}

export function validateReleasePlatformMatrix(
  releaseContract: Record<string, any>,
  profile: ReleaseValidationProfile = 'aggregate',
): number {
  const matrix = releaseContract.release_platform_matrix;
  const capabilities = matrix?.capabilities;
  const policies = matrix?.policies;
  let failures = 0;
  const requiredCapabilityIds = ['macos-arm64', 'linux-x64'];
  const windowsCapabilityIds = ['windows-x64', 'windows-arm64'];
  const capabilityIds = [
    'macos-arm64',
    'macos-x64',
    'macos-universal',
    'linux-x64',
    'linux-arm64',
    'windows-x64',
    'windows-arm64',
  ];
  if (
    matrix?.schema !== 'opl_app_release_platform_matrix.v1'
    || matrix?.resolver !== 'scripts/resolve-release-platform-matrix.ts'
    || !sameStringSet(Object.keys(capabilities ?? {}), capabilityIds)
  ) {
    console.error('FAIL release_platform_matrix: one canonical resolver must own every declared build capability');
    failures += 1;
    return failures;
  }

  const validatedCapabilityIds = profile === 'stable'
    ? requiredCapabilityIds
    : profile === 'windows-preview'
      ? windowsCapabilityIds
      : capabilityIds;
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
      || typeof capability?.publication_route !== 'string'
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

  for (const id of requiredCapabilityIds) {
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
  for (const id of ['macos-x64', 'macos-universal', 'linux-arm64', 'windows-x64', 'windows-arm64']) {
    const capability = capabilities[id];
    if (capability.default_enabled !== false || capability.blocks_stable !== false) {
      console.error(`FAIL release_platform_matrix: ${id} must remain default-off and non-blocking`);
      failures += 1;
    }
  }
  if (
    capabilities['windows-x64'].stable_allowed !== true
    || !capabilities['windows-x64'].quality_channels.includes('stable_optional')
    || capabilities['windows-arm64'].stable_allowed !== false
  ) {
    console.error('FAIL release_platform_matrix: Windows x64 must be Stable-optional while Windows arm64 remains Preview/RC-only');
    failures += 1;
  }
  for (const id of windowsCapabilityIds) {
    if (
      profile !== 'stable'
      && !capabilities[id].quality_channels.includes('preview_rc')
    ) {
      console.error(`FAIL release_platform_matrix: ${id} must retain Preview/RC capability`);
      failures += 1;
    }
  }

  const policyAssertions: Array<[string, string[], boolean, boolean]> = [
    ['stable_required', ['macos-arm64', 'linux-x64'], true, true],
    ['nightly_standard', ['macos-arm64', 'linux-x64'], true, true],
    ['stable_optional', ['macos-x64', 'macos-universal', 'linux-arm64', 'windows-x64'], false, false],
    ['windows_preview', ['windows-x64', 'windows-arm64'], false, false],
  ].filter(([name]) => (
    profile === 'aggregate'
    || (profile === 'stable' && name !== 'windows_preview')
    || (profile === 'windows-preview' && name === 'windows_preview')
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
  if (profile === 'aggregate' && !sameStringSet(policies?.manual_all?.platforms, capabilityIds)) {
    console.error('FAIL release_platform_matrix: manual_all must preserve every build capability');
    failures += 1;
  }
  if (
    policies?.stable_optional?.selection_mode !== 'capability_default_enabled_only'
    || matrix?.optional_platform_additive_follower?.windows_x64_updater_assets?.build_validator !==
      'scripts/validate-windows-updater-assets.ts'
    || !sameStringSet(
      matrix?.optional_platform_additive_follower?.windows_x64_updater_assets?.required_assets,
      [
        'One-Person-Lab-<display-version>-win-x64.exe',
        'One-Person-Lab-<display-version>-win-x64.exe.blockmap',
        'latest.yml',
        'opl-windows-updater-assets.json',
      ],
    )
    || matrix?.optional_platform_additive_follower?.windows_x64_updater_assets?.authenticode_required_for_publication !== false
    || matrix?.optional_platform_additive_follower?.windows_x64_updater_assets?.authenticode_gate !==
      'optional_when_present_then_Get-AuthenticodeSignature_status_valid_with_timestamp_countersignature_and_exact_installer_digest'
    || matrix?.optional_platform_additive_follower?.windows_x64_updater_assets?.unsigned_publication_allowed !== true
    || matrix?.optional_platform_additive_follower?.windows_x64_updater_assets?.code_signing_status_must_be_explicit !== true
    || matrix?.optional_platform_additive_follower?.windows_x64_updater_assets?.runtime_resolver !==
      'opl-aion-shell/packages/desktop/src/process/bridge/updateBridge.ts'
    || matrix?.optional_platform_additive_follower?.windows_x64_updater_assets?.base_stable_or_latest_mutation_allowed !== false
    || releaseContract.release_platform_matrix?.validation_ownership?.stable?.excluded_profile !==
      'windows-preview'
    || (
      profile !== 'stable'
      && !sameStringSet(
        releaseContract.release_platform_matrix?.validation_ownership?.['windows-preview']
          ?.owned_test_paths,
        [
          'tests/release/docker-webui-clean-windows-dispatch.test.ts',
          'tests/release/docker-webui-native-windows-smoke.test.ts',
          'tests/release/docker-webui-windows-installer.test.ts',
          'tests/release/docker-webui-windows-validation-fixtures.test.ts',
          'tests/release/windows-platform-factory-contract.test.ts',
          'tests/release/windows-preview-bits-powershell.test.ts',
          'tests/release/windows-rc-preview.test.ts',
          'tests/release/windows-updater-upgrade-vm.test.ts',
          'tests/release/windows-wsl2-validation-fixtures.test.ts',
        ],
      )
    )
  ) {
    console.error('FAIL release_platform_matrix: optional switches and validation ownership must be contract-audited');
    failures += 1;
  }

  const follower = matrix.full_macos_additive_follower;
  if (
    follower?.workflow !== '.github/workflows/release-stable-post-success-followups.yml'
    || follower?.trigger !== 'protected_automatic_post_success_or_explicit_independent_full_publication'
    || follower?.source_policy !== 'full_artifact_self_identity_plus_component_compatibility_plus_exact_standard_reference_cas'
    || follower?.standard_release_prerequisite_required !== true
    || follower?.cross_component_exact_version_sha_or_cohort_binding_allowed !== false
    || follower?.compatibility_contract_ref !==
      'contracts/app-install-exposure-policy.json#component_interoperability.compatibility_admission'
    || follower?.operation !== 'append_full'
    || follower?.carrier !== 'independent_immutable_adjunct_release'
    || follower?.full_release_must_be_published_immutable !== true
    || follower?.draft_asset_set_must_be_exact_before_publication !== true
    || follower?.standard_asset_or_latest_mutation_allowed !== false
    || !sameStringSet(follower?.target_standard_reference?.required_fields, [
      'repository',
      'release_id',
      'tag',
      'target_commitish',
      'immutable',
    ])
    || follower?.target_standard_reference?.purpose !== 'reference_and_release_notes_only'
    || follower?.target_standard_reference?.cross_component_compatibility_gate_allowed !== false
    || follower?.target_standard_reference?.base_assets_mutation_allowed !== false
    || follower?.blocks_stable_base_terminal !== false
    || follower?.blocks_latest_activation !== false
    || follower?.failure_receipt_required !== true
  ) {
    console.error('FAIL release_platform_matrix: Full macOS follower must remain independently self-identified, compatibility-bound, durable, and non-blocking');
    failures += 1;
  }
  const optionalSelection = matrix.stable_optional_selection;
  const optionalFollower = matrix.optional_platform_additive_follower;
  if (
    optionalSelection?.authority_field !== 'opl_app_stable_operation_authority.v1#optional_platforms'
    || optionalSelection?.control_field !== 'opl_app_stable_operation_control.v1#optional_platforms'
    || optionalSelection?.arbitrary_command_or_os_input_allowed !== false
    || optionalFollower?.carrier !== 'independent_immutable_adjunct_release'
    || optionalFollower?.base_release_must_be_published_immutable !== true
    || optionalFollower?.make_latest !== false
    || optionalFollower?.base_release_mutation_allowed !== false
  ) {
    console.error('FAIL release_platform_matrix: optional selection and immutable adjunct carrier must remain authority-bound');
    failures += 1;
  }

  for (const profileName of ['stable', 'nightly_standard']) {
    const requiredLanes = releaseContract.release_validation_profiles?.[profileName]?.required_lanes;
    if (
      !requiredLanes?.includes('standard_macos_arm64_build')
      || !requiredLanes?.includes('standard_linux_x64_build')
    ) {
      console.error(`FAIL release_platform_matrix: ${profileName} validation must require macOS ARM64 and Linux x64`);
      failures += 1;
    }
  }
  return failures;
}

export function validateReleaseContractPolicies(
  appRoot: string,
  profile: ReleaseValidationProfile = 'aggregate',
): number {
  const releaseContract = readJson(appRoot, 'contracts/app-release-channel.json');
  const brokerAuthority = readJson(appRoot, 'contracts/app-release-broker-authority.json');
  const firstRunMatrix = readJson(appRoot, 'contracts/app-first-run-test-matrix.json');
  let failures = 0;

  failures += validateGithubReleaseName(releaseContract);
  failures += validateReleaseImmutability(releaseContract);
  failures += validateLocalInstallReleaseProfile(releaseContract);
  failures += validateReleaseExecutionTracks(releaseContract);
  failures += validatePreparedNotesTransportPolicy(releaseContract);
  failures += validateStandardUpdaterCompressionPolicy(appRoot, releaseContract);
  failures += validateStandardUpdaterCandidateSelection(releaseContract);
  failures += validateReleasePreflightContract(releaseContract);
  failures += validateOptionalCertificationPolicy(releaseContract);
  failures += validatePhysicalVmOptionalCertificationPolicy(releaseContract);
  failures += validateHomebrewVmGateStaticPolicy(appRoot, releaseContract, firstRunMatrix);
  failures += validateWebuiPackagePolicy(releaseContract);
  failures += validateReleaseAccelerationPolicy(releaseContract, brokerAuthority);
  failures += validateSourceMaterialRouteContract(appRoot);
  failures += validateReleasePlatformMatrix(releaseContract, profile);
  failures += validateGithubApplyCallerParity(appRoot);

  return failures;
}
