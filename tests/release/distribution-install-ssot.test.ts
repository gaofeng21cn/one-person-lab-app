import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { appRoot } from './app-release-boundary-cases/helpers.ts';
import { validateDistributionInstallSsot } from '../../scripts/validate-active-shell/distribution-install-ssot-validator.ts';

function readJson(relativePath: string): any {
  return JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), 'utf8'));
}

function canonicalContracts() {
  return {
    release: readJson('contracts/app-release-channel.json'),
    install: readJson('contracts/app-install-exposure-policy.json'),
  };
}

test('distribution/install SSOT validates the current and approved state split', () => {
  const { release, install } = canonicalContracts();
  assert.doesNotThrow(() => validateDistributionInstallSsot(release, install));
  assert.equal(
    release.distribution_semantics.publication_history.desktop_nightly.new_publication_status,
    'implemented_pending_first_publication_readback',
  );
  assert.equal(release.distribution_semantics.topology_counts.current_publication_carrier_families, 3);
  assert.equal(release.distribution_semantics.topology_counts.current_production_publication_paths, 4);
  assert.equal(install.distribution_install_model.topology_counts.current_ordinary_install_entrypoint_families, 4);
  assert.equal(install.distribution_install_model.topology_counts.current_supported_app_runtime_forms, 2);
  assert.equal(install.distribution_install_model.topology_counts.approved_target_app_runtime_forms, 2);
  assert.deepEqual(
    install.distribution_install_model.installer_convergence.approved_universal_target.desktop_release_identity,
    {
      repository: 'gaofeng21cn/one-person-lab-app',
      release_selector: 'github_latest_pointer_exact_release',
      required_asset_roles: [
        'platform_desktop_payload',
        'component_manifest',
        'release_universal_installer',
      ],
      installer_digest_authority: 'component_manifest_and_github_release_asset_digest',
      quality_admission_authority: 'same_desktop_qualification_and_component_manifest',
      exact_tag_download_url_required: true,
      native_artifact_discovery_allowed: false,
      full_same_tag_resolution: {
        identity_source: 'exact_standard_release_record_plus_full_manifest_and_unified_attestation',
        discovery_route: 'selected_standard_release_assets_only',
        tag_binding: 'same_as_selected_standard_release_tag',
        eligible_release: {
          draft: false,
          prerelease: false,
          github_immutable_claim: false,
          workflow_cas_and_attestation_required: true,
        },
        exact_same_tag_readback_required: true,
        required_assets: [
          'full_dmg',
          'opl-release-manifest.json',
          'opl-release-attestation.json',
      ],
      asset_name_size_digest_must_match_exact_standard_release: true,
      full_manifest_must_match_its_release_version_and_full_dmg_identity: true,
      full_manifest_must_bind_unified_attestation: true,
      compatibility_selector_ref:
        'contracts/app-install-exposure-policy.json#component_interoperability.compatibility_admission',
      explicit_full_missing_ambiguous_or_invalid: 'fail_closed',
      implicit_full_fallback: 'standard_only_when_same_tag_full_asset_is_confirmed_absent',
      standard_asset_overwrite_or_delete_allowed: false,
      release_latest_or_updater_mutation_allowed: false,
      standard_release_identity_or_bundle_digest_binding_allowed: false,
      cross_component_source_cohort_binding_allowed: false,
      },
      linux_x64_same_tag_resolution: {
        identity_source: 'exact_stable_release_component_manifest_and_desktop_platforms_manifest',
        discovery_route: 'selected_stable_release_assets_only',
        tag_binding: 'same_as_selected_stable_release_tag',
        eligible_release: {
          draft: false,
          prerelease: false,
          github_immutable_claim: false,
          owner_authority_verified: true,
        },
        exact_tag_readback_required: true,
        required_assets: [
          'component_manifest',
          'release_universal_installer',
          'linux_x64_deb',
          'opl-desktop-platforms-manifest.json',
        ],
        asset_url_and_digest_must_match_exact_stable_release: true,
        desktop_manifest_must_match_release_version_cohort_and_linux_deb_identity: true,
        compatibility_selector_ref:
          'contracts/app-install-exposure-policy.json#component_interoperability.compatibility_admission',
        missing_ambiguous_or_invalid: 'fail_closed',
        cross_release_fallback_allowed: false,
      },
      target_selection: 'host_platform_and_architecture',
    },
  );
  assert.equal(
    install.distribution_install_model.installer_convergence.approved_universal_target
      .desktop_release_identity.macos_x64_adjunct_resolution,
    undefined,
    'macOS x64 remains development-validation-only and has no install adjunct resolver',
  );
  assert.equal(
    install.distribution_install_model.homebrew_carriers.full.formula_dependency_current,
    true,
  );
  assert.equal(
    install.distribution_install_model.homebrew_carriers.full.formula_dependency_target,
    false,
  );
  assert.equal(install.distribution_install_model.runtime_forms.desktop.browser_webui_mode, 'packaged_desktop_bytes');
  assert.equal(
    release.distribution_semantics.approved_targets.homebrew_full.generation_status,
    'implemented_pending_first_protected_follower_readback',
  );
  assert.equal(
    release.homebrew_tap_distribution.tap_update_policy.full.homebrew_publish_allowed,
    true,
  );
  assert.equal(
    release.distribution_semantics.approved_targets.desktop_linux_x86_64.desktop_asset,
    'One-Person-Lab-<version>-linux-x64.deb',
  );
  assert.deepEqual(
    release.release_validation_profiles.stable.hosted_post_publication_optional_certification_surfaces,
    ['linux_x64_same_artifact_install_smoke'],
  );
  assert.deepEqual(
    release.release_acceleration.hosted_linux_certification,
    {
      id: 'linux_x64_same_artifact_install_smoke',
      workflow: '.github/workflows/release-post-publication-certification.yml',
      runner: 'ubuntu-latest',
      platform: 'linux-x64',
      artifact: 'One-Person-Lab-<version>-linux-x64.deb',
      installer: 'opl-install.sh',
      installer_arguments: ['--desktop', '--release-tag', '<exact-tag>', '--no-open'],
      release_set_single_tag_asset_binding_required: true,
      same_release_tag_required: true,
      desktop_manifest_cohort_binding_required: true,
      same_deb_artifact_identity_required: true,
      cross_component_version_sha_or_cohort_equality_required: false,
      dependency_compatibility_contract_ref:
        'contracts/app-install-exposure-policy.json#component_interoperability.compatibility_admission',
      typed_admission_schema: 'opl_app_stable_desktop_asset_append.v1',
      typed_execution_evidence_schema: 'opl_app_linux_same_tag_desktop_install.v1',
      clean_machine_preinstall_absence_required: true,
      installed_executable_byte_parity_required: true,
      failed_download_evidence_truthful_required: true,
      terminal_statuses: ['passed', 'failed'],
      unavailable_allowed: false,
      downloaded_from_published_release_required: true,
      rebuilt_allowed: false,
      failure_receipt_uploaded_before_job_failure: true,
      gate_policy: 'optional_non_blocking_same_published_artifact',
      required_for_publication_or_latest: false,
    },
  );
  assert.equal(
    release.distribution_semantics.latest_policy.default_behavior,
    'each_carrier_advances_its_own_latest_pointer_when_that_carrier_publishes_a_new_qualified_stable',
  );
  assert.deepEqual(
    release.distribution_semantics.latest_policy.explicit_user_override.quality_statuses,
    ['stable', 'preview'],
  );
  assert.equal(
    release.distribution_semantics.latest_policy.move_latest_pointer.stable_or_preview_candidate_allowed,
    true,
  );
  assert.equal(
    release.distribution_semantics.latest_policy.durable_publication_record_selector.selector,
    'carrier_owned_durable_publication_record',
  );
  assert.equal(
    release.distribution_semantics.latest_policy.durable_publication_record_selector.actions_artifact.selection_authority,
    false,
  );
  assert.equal(
    release.distribution_semantics.latest_policy.durable_publication_record_selector.retention.retired_or_revoked_record_selectable,
    false,
  );
  assert.deepEqual(
    release.distribution_semantics.latest_policy.docker_manual_override.must_not_mutate,
    ['container_webui.stable', 'desktop.latest'],
  );
  assert.deepEqual(
    release.distribution_semantics.latest_policy.docker_manual_override.operator_confirmation,
    {
      source: 'workflow_dispatch_exact_version_confirmation',
      expected_value: 'move-docker-latest:<exact_version>',
      actor: 'github_human_login',
      digest_bound_into_terminal_receipt: true,
    },
  );
  assert.deepEqual(
    install.software_lifecycle.carrier_adapters.homebrew_cask.payload_profiles.full,
    ['opl_app', 'opl_base_offline_seed', 'opl_package_offline_seeds'],
  );
  assert.equal(
    install.software_lifecycle.carrier_adapters.homebrew_cask.full_seed_activation_owner,
    'one-person-lab',
  );
  const hostAutoUpdate = install.installer_surfaces.find(
    (surface: any) => surface.surface === 'docker_webui',
  ).installer_model;
  assert.match(hostAutoUpdate.linux_macos_online_command, /--enable-auto-update/);
  assert.doesNotMatch(hostAutoUpdate.linux_server_online_command, /--enable-auto-update/);
  assert.equal(hostAutoUpdate.installer_release_selector, 'github_latest_release');
  assert.equal(
    hostAutoUpdate.installer_release_assets.linux_macos,
    'https://github.com/gaofeng21cn/one-person-lab-app/releases/latest/download/install-docker-webui.sh',
  );
  assert.equal(
    hostAutoUpdate.installer_release_assets.windows,
    'https://github.com/gaofeng21cn/one-person-lab-app/releases/latest/download/install-docker-webui.ps1',
  );
  const autoUpdateContract = hostAutoUpdate.host_auto_update;
  assert.equal(autoUpdateContract.follows_ref, 'ghcr.io/gaofeng21cn/one-person-lab-webui:stable');
  assert.equal(autoUpdateContract.platform_schedulers.windows.mechanism, 'user_scoped_windows_scheduled_task');
  assert.equal(autoUpdateContract.platform_schedulers.macos.mechanism, 'current_user_launch_agent');
  assert.equal(autoUpdateContract.platform_schedulers.linux_personal.mechanism, 'systemd_user_timer');
  assert.equal(autoUpdateContract.platform_schedulers.linux_server.default_enabled, false);
  assert.match(autoUpdateContract.reviewed_runner_policy, /never_downloads_or_executes_mutable_main_branch/);
  assert.match(autoUpdateContract.failure_semantics, /restore_the_previous_image_digest/);
  assert.equal(autoUpdateContract.config_schema, 'opl_webui_host_auto_update_config.v1');
  assert.ok(autoUpdateContract.shared_status_fields.includes('daily_time'));
  assert.deepEqual(autoUpdateContract.shared_actions, [
    'enable',
    'disable',
    'status',
    'set_daily_local_time',
    'manual_update',
  ]);
});

test('Homebrew generator keeps Standard on Formula Base and Full on embedded Base', () => {
  const tapRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-homebrew-full-carrier-'));
  const digest = 'a'.repeat(64);
  const common = [
    'scripts/update-homebrew-tap.ts',
    '--channel',
    'stable',
    '--version',
    '26.7.24',
    '--updater-version',
    '26.7.2400',
    '--tap-root',
    tapRoot,
    '--checksum-sha256',
    digest,
    '--write',
  ];
  const run = (args: string[]) => spawnSync(
    process.execPath,
    ['--experimental-strip-types', ...common, ...args],
    { cwd: appRoot, encoding: 'utf8' },
  );

  const standard = run([
    '--package-kind',
    'app_standard',
    '--manifest-url',
    'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.7.24/latest-arm64-mac.yml',
    '--download-url',
    'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.7.24/One-Person-Lab-26.7.24-mac-arm64.dmg',
    '--cask',
    'Casks/one-person-lab.rb',
  ]);
  assert.equal(standard.status, 0, standard.stderr || standard.stdout);

  fs.writeFileSync(
    path.join(tapRoot, 'Casks/one-person-lab-full.rb'),
    [
      'cask "one-person-lab-full" do',
      '  version "26.7.2300"',
      `  sha256 "${'b'.repeat(64)}"`,
      '  url "https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.7.23/One-Person-Lab-Full-26.7.23-mac-arm64.dmg"',
      '  conflicts_with cask: ["one-person-lab", "one-person-lab-nightly"]',
      '  depends_on formula: "gaofeng21cn/one-person-lab/opl"',
      '  depends_on macos: :big_sur',
      '  depends_on arch: :arm64',
      '  app "One Person Lab.app"',
      'end',
      '',
    ].join('\n'),
    'utf8',
  );
  const full = run([
    '--package-kind',
    'app_full_first_install',
    '--manifest-url',
    'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.7.24/opl-release-manifest.json',
    '--download-url',
    'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.7.24/One-Person-Lab-Full-26.7.24-mac-arm64.dmg',
    '--cask',
    'Casks/one-person-lab-full.rb',
  ]);
  assert.equal(full.status, 0, full.stderr || full.stdout);

  const standardCask = fs.readFileSync(path.join(tapRoot, 'Casks/one-person-lab.rb'), 'utf8');
  const fullCask = fs.readFileSync(path.join(tapRoot, 'Casks/one-person-lab-full.rb'), 'utf8');
  const standardPlan = JSON.parse(standard.stdout);
  const fullPlan = JSON.parse(full.stdout);
  assert.match(standardCask, /depends_on formula: "opl"/);
  assert.doesNotMatch(fullCask, /depends_on formula:/);
  assert.match(fullCask, /conflicts_with cask: \["one-person-lab", "one-person-lab-nightly"\]/);
  assert.equal(standardPlan.policy.formula_dependency_required, true);
  assert.equal(standardPlan.policy.framework_carrier, 'homebrew_formula_opl');
  assert.equal(fullPlan.policy.formula_dependency_required, false);
  assert.equal(fullPlan.policy.framework_carrier, 'full_dmg_embedded_opl_base');
  assert.equal(fullPlan.policy.active_framework_count_target, 1);
  assert.equal(fullPlan.policy.publishes_or_pushes_remote, false);
  assert.equal(fullPlan.cas.decision, 'write_once');

  const fullAgain = run([
    '--package-kind',
    'app_full_first_install',
    '--manifest-url',
    'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.7.24/opl-release-manifest.json',
    '--download-url',
    'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.7.24/One-Person-Lab-Full-26.7.24-mac-arm64.dmg',
    '--cask',
    'Casks/one-person-lab-full.rb',
  ]);
  assert.equal(fullAgain.status, 0, fullAgain.stderr || fullAgain.stdout);
  assert.equal(JSON.parse(fullAgain.stdout).cas.decision, 'idempotent');
  assert.equal(JSON.parse(fullAgain.stdout).cas.write_performed, false);
  assert.equal(fs.readFileSync(path.join(tapRoot, 'Casks/one-person-lab-full.rb'), 'utf8'), fullCask);
});

test('cross-contract drift fails closed for channel, carrier, and convergence mutations', () => {
  const mutations: Array<[string, (release: any, install: any) => void]> = [
    [
      'Nightly becoming Full',
      (release) => {
        release.distribution_semantics.terms.nightly.full_by_default = true;
      },
    ],
    [
      'Nightly product semantics being retired',
      (release) => {
        release.distribution_semantics.terms.nightly.product_channel_semantics = 'retired';
      },
    ],
    [
      'Nightly schedule moving Latest automatically',
      (release) => {
        release.distribution_semantics.approved_targets.desktop_nightly.scheduled_latest_allowed = true;
      },
    ],
    [
      'Latest override changing Preview quality',
      (release) => {
        release.distribution_semantics.latest_policy.explicit_user_override.quality_unchanged = false;
      },
    ],
    [
      'Latest override becoming persistent',
      (release) => {
        release.distribution_semantics.latest_policy.explicit_user_override.persistent_override = true;
      },
    ],
    [
      'Latest override losing Stable target freedom',
      (release) => {
        release.distribution_semantics.latest_policy.explicit_user_override.quality_statuses = ['preview'];
      },
    ],
    [
      'Latest pointer rejecting exact Stable candidates',
      (release) => {
        release.distribution_semantics.latest_policy.move_latest_pointer.stable_or_preview_candidate_allowed = false;
      },
    ],
    [
      'Latest selection depending on an Actions artifact',
      (release) => {
        release.distribution_semantics.latest_policy.durable_publication_record_selector.actions_artifact.selection_authority = true;
      },
    ],
    [
      'retired durable publication record remaining selectable',
      (release) => {
        release.distribution_semantics.latest_policy.durable_publication_record_selector.retention.retired_or_revoked_record_selectable = true;
      },
    ],
    [
      'Docker manual override changing Stable or Desktop pointers',
      (release) => {
        release.distribution_semantics.latest_policy.docker_manual_override.must_not_mutate = [];
      },
    ],
    [
      'quality promotion rewriting immutable manifest',
      (release) => {
        release.distribution_semantics.latest_policy.promote_quality.immutable_build_manifest_rewrite_allowed = true;
      },
    ],
    [
      'Full target retaining Formula dependency',
      (release) => {
        release.distribution_semantics.approved_targets.homebrew_full.formula_dependency_target = true;
      },
    ],
    [
      'Full target losing digest CAS',
      (release) => {
        release.distribution_semantics.approved_targets.homebrew_full.digest_cas_required = false;
      },
    ],
    [
      'Full generator being presented as publicly promoted',
      (release) => {
        release.distribution_semantics.approved_targets.homebrew_full.public_promotion_status = 'published';
      },
    ],
    [
      'Desktop runtime restoring the retired Native tarball carrier',
      (_, install) => {
        install.distribution_install_model.runtime_forms.desktop.native_tarball_carrier = 'active';
      },
    ],
    [
      'Desktop installer allowing retired Native asset discovery',
      (_, install) => {
        install.distribution_install_model.installer_convergence.approved_universal_target
          .desktop_release_identity.native_artifact_discovery_allowed = true;
      },
    ],
    [
      'Linux Desktop changing Container moving tags',
      (release) => {
        release.distribution_semantics.approved_targets.desktop_linux_x86_64.container_ghcr_tags_must_remain_unchanged = [
          'native-latest',
        ];
      },
    ],
    [
      'Full Cask dropping embedded Base payload',
      (_, install) => {
        install.software_lifecycle.carrier_adapters.homebrew_cask.payload_profiles.full = ['opl_app'];
      },
    ],
    [
      'Full Cask claiming App-owned Base activation',
      (_, install) => {
        install.software_lifecycle.carrier_adapters.homebrew_cask.full_seed_activation_owner =
          'one-person-lab-app';
      },
    ],
    [
      'multiple active Frameworks',
      (_, install) => {
        install.distribution_install_model.consistency_target.active_framework_count = 2;
      },
    ],
    [
      'Package published current stable owned by App carrier',
      (_, install) => {
        install.distribution_install_model.consistency_target.package_published_current_stable_authority =
          'app_carrier';
      },
    ],
    [
      'Package installed state inferred without carrier readback',
      (_, install) => {
        install.distribution_install_model.consistency_target.configured_carrier_terminal_readback_required =
          false;
      },
    ],
    [
      'Development-only macOS x64 gaining an install adjunct resolver',
      (_, install) => {
        install.distribution_install_model.installer_convergence.approved_universal_target
          .desktop_release_identity.macos_x64_adjunct_resolution = {};
      },
    ],
  ];

  for (const [label, mutate] of mutations) {
    const { release, install } = canonicalContracts();
    mutate(release, install);
    assert.throws(
      () => validateDistributionInstallSsot(release, install),
      undefined,
      label,
    );
  }
});

test('ordinary docs point to the SSOT without advertising retired or unpublished paths', () => {
  const ssot = 'docs/delivery/distribution-and-install-ssot.md';
  const rootReadme = fs.readFileSync(path.join(appRoot, 'README.md'), 'utf8');
  const docsIndex = fs.readFileSync(path.join(appRoot, 'docs/README.md'), 'utf8');
  const deliveryIndex = fs.readFileSync(path.join(appRoot, 'docs/delivery/README.md'), 'utf8');
  const releaseGuide = fs.readFileSync(path.join(appRoot, 'docs/delivery/release/README.md'), 'utf8');
  const distributionGuide = fs.readFileSync(path.join(appRoot, ssot), 'utf8');
  const manualLatestGuide = fs.readFileSync(
    path.join(appRoot, 'docs/delivery/release/manual-latest-builds.md'),
    'utf8',
  );
  const macGuide = fs.readFileSync(
    path.join(appRoot, 'docs/guides/macos-app-install/guide.qmd'),
    'utf8',
  );
  const macGuideManifest = readJson(
    'docs/delivery/user-guides/macos-app-install/source/macos-app-install.quarto.json',
  );
  assert.match(rootReadme, new RegExp(ssot.replaceAll('/', '\\/')));
  assert.match(docsIndex, /delivery\/distribution-and-install-ssot\.md/);
  assert.match(deliveryIndex, /distribution-and-install-ssot\.md/);
  assert.match(releaseGuide, /\.\.\/distribution-and-install-ssot\.md/);
  assert.match(distributionGuide, /Stable Desktop Release Set/);
  assert.match(distributionGuide, /opl-desktop-platforms-manifest\.json/);
  assert.match(distributionGuide, /durable GHCR publication record/);
  assert.match(releaseGuide, /macOS arm64 primary release passes publication and public readback/);
  assert.match(releaseGuide, /Full macOS, Linux x64, Windows x64 and installer deliveries additively/);
  assert.match(releaseGuide, /A new `-rN` Stable is allowed only when the[\s\S]{0,80}macOS primary Stable assets themselves are invalid/);
  assert.match(releaseGuide, /independent source authority/);
  assert.doesNotMatch(releaseGuide, /carrier_owned_durable_publication_record/);
  assert.match(
    manualLatestGuide,
    /Actions artifact is[\s\S]{0,180}cannot make a version\s+selectable after it expires/,
  );
  assert.match(macGuide, /\{\{download\.stable_install_command\}\}/);
  assert.equal(
    macGuideManifest.download.stable_install_command,
    'brew install --cask gaofeng21cn/one-person-lab/one-person-lab',
  );
  assert.doesNotMatch(rootReadme, /brew install --cask .*one-person-lab-nightly/);
  assert.doesNotMatch(rootReadme, /brew install --cask .*one-person-lab-full/);
  assert.doesNotMatch(rootReadme, /--stable-macos-install --yes/);
});

test('ordinary install guides expose the current Desktop and Docker routes without restoring the retired matrix', () => {
  const english = fs.readFileSync(
    path.join(appRoot, 'docs/delivery/install/README.md'),
    'utf8',
  );
  const chinese = fs.readFileSync(
    path.join(appRoot, 'docs/delivery/install/README.zh-CN.md'),
    'utf8',
  );

  for (const guide of [english, chinese]) {
    assert.match(guide, /Stable Desktop Release Set|Stable Desktop Release 集合/);
    assert.match(guide, /macOS/);
    assert.match(guide, /Linux x64/);
    assert.match(guide, /Windows 11 x64/);
    assert.match(guide, /ghcr\.io\/gaofeng21cn\/one-person-lab-webui:stable/);
    assert.doesNotMatch(guide, /four supported product cells|四个受支持产品格/);
    assert.doesNotMatch(guide, /Native runs WebUI|Native 直接运行 WebUI/);
  }
});

test('Docker WebUI guide exposes the shared host auto-update lifecycle without container-side mutation', () => {
  const guide = fs.readFileSync(
    path.join(appRoot, 'docs/guides/docker-webui-install/guide.qmd'),
    'utf8',
  );
  const manifest = readJson(
    'docs/delivery/user-guides/docker-webui-install/source/docker-webui-install.guide.json',
  );
  assert.match(guide, /跨平台宿主自动更新/);
  assert.match(guide, /Task Scheduler/);
  assert.match(guide, /LaunchAgent/);
  assert.match(guide, /systemd --user/);
  assert.match(guide, /Linux 服务器默认不启用自动更新/);
  assert.match(guide, /不会每天下载并执行 GitHub `main` 上的可变安装器代码/);
  assert.match(guide, /不要把下载 GitHub `main` 的在线 `curl` 命令直接放进定时任务/);
  assert.match(guide, /恢复旧 digest/);
  assert.match(guide, /ghcr\.io\/gaofeng21cn\/one-person-lab-webui:stable/);
  assert.match(guide, /`:latest` 仅供用户显式选择 Preview/);
  assert.match(guide, /One Person Lab WebUI Stable Update/);
  assert.doesNotMatch(guide, /One Person Lab WebUI Latest Update/);
  assert.doesNotMatch(guide, /自动任务只跟随 `ghcr\.io\/gaofeng21cn\/one-person-lab-webui:latest`/);
  assert.equal(manifest.download.image, 'ghcr.io/gaofeng21cn/one-person-lab-webui:stable');
  assert.equal(manifest.download.local_image, 'one-person-lab-webui:stable');
  assert.match(manifest.download.linux_macos_online_command, /--enable-auto-update/);
  assert.match(manifest.download.linux_server_online_command, /--yes$/);
  assert.match(manifest.download.windows_auto_update_status_command, /-AutoUpdateStatus/);
  assert.match(manifest.download.linux_macos_auto_update_status_command, /--auto-update-status/);
  assert.match(manifest.download.linux_macos_disable_auto_update_command, /--disable-auto-update/);
});

test('docs publisher carries only current install guides and preserves whitepapers', () => {
  const publisher = fs.readFileSync(
    path.join(appRoot, 'scripts/publish-docs-latest.sh'),
    'utf8',
  );

  for (const guideId of ['macos-app-install', 'windows-app-install', 'docker-webui-install']) {
    assert.match(publisher, new RegExp(`^[ \\t]+${guideId}$`, 'm'));
  }
  assert.match(publisher, /--exclude 'whitepapers\/'/);
  assert.match(publisher, /--delete/);
  assert.doesNotMatch(publisher, /linux-native-webui-install/);
});

test('Docker WebUI guide scopes Docker Desktop and publishes the guarded Windows AF_UNIX recovery', () => {
  const guide = fs.readFileSync(
    path.join(appRoot, 'docs/guides/docker-webui-install/guide.qmd'),
    'utf8',
  );
  const manifest = readJson(
    'docs/delivery/user-guides/docker-webui-install/source/docker-webui-install.guide.json',
  );

  assert.match(guide, /Docker Desktop 只对本教程的 \*\*Container WebUI 路径\*\* 必需/);
  assert.match(guide, /Windows Desktop App 不要求 Docker Desktop/);
  assert.match(guide, /dockerInference/);
  assert.match(guide, /普通启动正常时不要运行恢复命令/);
  assert.match(guide, /不会停止进程/);
  assert.match(guide, /不会执行 Docker \*\*Factory Reset\*\*/);
  assert.match(guide, /不会删除 image、container、volume、`docker_data\.vhdx`/);
  assert.match(guide, /\{\{download\.windows_docker_start_repair_command\}\}/);
  assert.match(manifest.download.windows_docker_start_repair_command, /-RepairDockerDesktopStart/);
});
