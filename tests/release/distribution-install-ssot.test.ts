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
  assert.equal(release.distribution_semantics.topology_counts.current_production_publication_paths, 5);
  assert.equal(install.distribution_install_model.topology_counts.current_ordinary_install_entrypoint_families, 4);
  assert.equal(install.distribution_install_model.topology_counts.current_supported_app_runtime_forms, 3);
  assert.equal(install.distribution_install_model.topology_counts.approved_target_app_runtime_forms, 3);
  assert.equal(
    install.distribution_install_model.runtime_forms.native_webui.public_install_status,
    'published_digest_bound',
  );
  assert.deepEqual(
    install.distribution_install_model.runtime_forms.native_webui.supported_targets,
    ['linux_x86_64'],
  );
  assert.deepEqual(
    install.distribution_install_model.runtime_forms.native_webui.implemented_targets_pending_publication,
    ['macos_arm64'],
  );
  assert.deepEqual(
    install.distribution_install_model.installer_convergence.approved_universal_target.native_webui_public_discovery,
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
      target_selection: 'host_platform_and_architecture',
    },
  );
  assert.equal(
    install.distribution_install_model.homebrew_carriers.full.formula_dependency_current,
    true,
  );
  assert.equal(
    install.distribution_install_model.homebrew_carriers.full.formula_dependency_target,
    false,
  );
  assert.equal(
    install.distribution_install_model.homebrew_carriers.native_webui.technical_feasibility,
    'feasible_same_command_cross_platform',
  );
  assert.equal(
    release.distribution_semantics.approved_targets.homebrew_full.generation_status,
    'implemented_pending_first_protected_follower_readback',
  );
  assert.equal(
    release.homebrew_tap_distribution.tap_update_policy.full.homebrew_publish_allowed,
    true,
  );
  assert.equal(
    release.distribution_semantics.approved_targets.native_webui.production_topology,
    'standard_operation_nonblocking_prepare_then_post_latest_protected_additive_publish_with_follower_readback',
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
  const autoUpdateContract = hostAutoUpdate.host_auto_update;
  assert.equal(autoUpdateContract.follows_ref, 'ghcr.io/gaofeng21cn/one-person-lab-webui:latest');
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
      'Native WebUI being advertised before publication',
      (_, install) => {
        install.distribution_install_model.runtime_forms.native_webui.public_install_status = 'supported';
      },
    ],
    [
      'Native WebUI expanding Stable operations',
      (release) => {
        release.distribution_semantics.approved_targets.native_webui.stable_operation_set_must_remain.push(
          'publish_native',
        );
      },
    ],
    [
      'Native WebUI changing Container moving tags',
      (release) => {
        release.distribution_semantics.approved_targets.native_webui.container_ghcr_tags_must_remain_unchanged = [
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
  assert.match(macGuide, /\{\{download\.stable_install_command\}\}/);
  assert.equal(
    macGuideManifest.download.stable_install_command,
    'brew install --cask gaofeng21cn/one-person-lab/one-person-lab',
  );
  assert.doesNotMatch(rootReadme, /brew install --cask .*one-person-lab-nightly/);
  assert.doesNotMatch(rootReadme, /brew install --cask .*one-person-lab-full/);
  assert.doesNotMatch(rootReadme, /--stable-macos-install --yes/);
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
  assert.match(manifest.download.linux_macos_online_command, /--enable-auto-update/);
  assert.match(manifest.download.linux_server_online_command, /--yes$/);
  assert.match(manifest.download.windows_auto_update_status_command, /-AutoUpdateStatus/);
  assert.match(manifest.download.linux_macos_auto_update_status_command, /--auto-update-status/);
  assert.match(manifest.download.linux_macos_disable_auto_update_command, /--disable-auto-update/);
});
