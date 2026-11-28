import {
  assert,
  fs,
  os,
  path,
  test,
  runNode,
  writeFile,
  stableInstallCommand,
  writeFakeMacosTrustCommands,
  buildRemoteReleaseView,
  writeStandardRemoteAssets,
  writeFullRemoteAssets,
} from './helpers.ts';

const fakeMacosPlatformNodeOptions =
  '--import=data:text/javascript,Object.defineProperty(process%2C%22platform%22%2C%7Bvalue%3A%22darwin%22%7D)%3B';
const fakeNonMacosPlatformNodeOptions =
  '--import=data:text/javascript,Object.defineProperty(process%2C%22platform%22%2C%7Bvalue%3A%22linux%22%7D)%3B';

function fakeMacosTrustEnvironment(binDir, fields = {}) {
  return {
    ...fields,
    NODE_OPTIONS: fakeMacosPlatformNodeOptions,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
  };
}

function validFullReleaseNotes(version) {
  return `This Stable release is for users installing or upgrading One Person Lab App. It focuses on making research, grant-writing, visual-deliverable, agent-design, Office, and document-intake work ready from one App install.

## Highlights
- Use one Stable install path for the App plus refreshed research, grant, visual, Office, and document-intake tools.
- Built-in research, grant-writing, visual deliverable, and agent-design entries have been refreshed for this release.

## What improved

### Built-in research, grant, and visual work
- Refreshed the built-in research, grant, visual deliverable, and agent-design entries used from the App.

## Compatibility and action required
- No manual migration is required beyond installing or upgrading this Stable release.
- The Full DMG is appended later to this same Stable release for fresh-machine installation with bundled runtime, Office, and document-intake payloads.

## Technical details
These details are included for operators who audit exactly what was packaged. They should not be needed for ordinary install or upgrade decisions.

## OPL agents and runtime payload
- Full first-install package includes the OPL Framework runtime, Codex CLI, MAS, MAG, RCA, OPL Meta Agent, OfficeCLI, MinerU, and packaged Codex skills.
- Packaged component refs: OPL Framework @ 1234567; Codex CLI 0.142.4; MAS @ 1234567; MAG @ 1234567; RCA @ 1234567; OPL Meta Agent @ 1234567; OfficeCLI 1.0.125; MinerU v0.1.0.
- Component updates since previous Stable: MAS 0000000 -> 1234567.

## OPL family updates
- MAS: Research sessions make study and paper status clearer (1 commit, audit ref 0000000 -> 1234567).

## Install Stable
\`${stableInstallCommand}\`

## Release scope
- Standard macOS arm64 updater package plus Full first-install DMG.

**Full Changelog**: https://github.com/gaofeng21cn/one-person-lab-app/compare/v26.6.29...v${version}
`;
}

test('remote release verifier validates standard and Full assets from GitHub release view', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-remote-release-'));
  const binDir = path.join(tempRoot, 'bin');
  const version = '26.5.19-remote';
  const names = [
    ...writeStandardRemoteAssets(tempRoot, version),
    ...writeFullRemoteAssets(tempRoot, version),
  ];
  const summaryPath = path.join(tempRoot, 'remote-release-verification.json');
  const releaseView = buildRemoteReleaseView(tempRoot, names, `v${version}`, validFullReleaseNotes(version));
  writeFakeMacosTrustCommands(binDir);

  const result = runNode([
    'scripts/verify-remote-release-assets.ts',
    '--version',
    version,
    '--repo',
    'gaofeng21cn/one-person-lab-app',
    '--include-full-package',
    '--download-dir',
    tempRoot,
    '--summary-path',
    summaryPath,
    '--no-download',
  ], {
    env: fakeMacosTrustEnvironment(binDir, {
      OPL_REMOTE_RELEASE_VIEW_JSON: JSON.stringify(releaseView),
    }),
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  assert.equal(summary.status, 'passed');
  assert.equal(summary.repo, 'gaofeng21cn/one-person-lab-app');
  assert.equal(summary.tag, `v${version}`);
  assert.equal(summary.include_full_package, true);
  assert.equal(summary.download_dir, tempRoot);
  assert.equal(summary.verified_asset_count, names.length);
  assert.deepEqual(summary.verified_assets.map((asset) => asset.name), names);
  assert.ok(summary.verified_assets.some((asset) => asset.name === 'opl-release-manifest.json'));
  assert.ok(!summary.verified_assets.some((asset) => asset.name === 'full-package-manifest.json'));
  assert.equal(summary.standard_updater_app_bundle_trust.status, 'passed');
  assert.equal(summary.standard_updater_app_bundle_trust.version, version);
  assert.equal(summary.standard_updater_app_bundle_trust.team_identifier, 'TESTTEAMID');
  assert.equal(summary.standard_updater_app_bundle_trust.signature, 'Developer ID Application: Test (TESTTEAMID)');
  assert.equal(
    summary.standard_updater_app_bundle_trust.gatekeeper_policy,
    'opl-release-attestation.json#standard_trust.gatekeeper_launch_policy',
  );
  assert.equal(summary.standard_updater_app_bundle_trust.apple_developer_id_required, true);
  assert.equal(summary.standard_updater_app_bundle_trust.gatekeeper_required, true);
  assert.equal(summary.release_notes.status, 'passed');
  assert.equal(summary.release_notes.body_length, validFullReleaseNotes(version).length);
  assert.equal(summary.full_first_install_budget.status, 'passed');
  assert.equal(summary.full_first_install_budget.platform_scope, 'macos-arm64');
  assert.equal(summary.full_first_install_budget.warning_full_dmg_bytes, 700000000);
  assert.equal(summary.full_first_install_budget.max_full_dmg_bytes, 750000000);
  assert.equal(summary.full_first_install_budget.full_dmg_size_bytes, Buffer.byteLength('full-dmg'));
  assert.equal(summary.full_first_install_budget.full_dmg_size_status, 'passed');
  assert.equal(summary.full_first_install_budget.runtime_uncompressed_bytes, 128);
  assert.deepEqual(summary.full_first_install_budget.warnings, []);
  assert.equal(summary.full_first_install_budget.excluded_module_venv_count, 0);
  assert.equal(summary.full_first_install_budget.optional_components.bun.status, 'not_packaged');
});

test('remote release verifier preserves the unchanged v26.8.8 single-metadata release', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-remote-release-legacy-anchor-'));
  const binDir = path.join(tempRoot, 'bin');
  const version = '26.8.8';
  const names = writeStandardRemoteAssets(tempRoot, version);
  const summaryPath = path.join(tempRoot, 'remote-release-verification.json');
  const releaseView = buildRemoteReleaseView(tempRoot, names, `v${version}`);
  writeFakeMacosTrustCommands(binDir);

  const result = runNode([
    'scripts/verify-remote-release-assets.ts',
    '--version', version,
    '--repo', 'gaofeng21cn/one-person-lab-app',
    '--download-dir', tempRoot,
    '--summary-path', summaryPath,
    '--no-download',
  ], {
    env: fakeMacosTrustEnvironment(binDir, {
      OPL_REMOTE_RELEASE_VIEW_JSON: JSON.stringify(releaseView),
    }),
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(names.includes('latest-mac.yml'), false);
  assert.equal(names.includes('latest-arm64-mac.yml'), true);
});

test('remote release verifier rejects non-identical metadata bridge bytes', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-remote-release-metadata-drift-'));
  const version = '26.8.9-metadata-drift';
  const names = writeStandardRemoteAssets(tempRoot, version);
  fs.appendFileSync(path.join(tempRoot, 'latest-arm64-mac.yml'), '# drift\n');
  const releaseView = buildRemoteReleaseView(tempRoot, names, `v${version}`);

  const result = runNode([
    'scripts/verify-remote-release-assets.ts',
    '--version', version,
    '--repo', 'gaofeng21cn/one-person-lab-app',
    '--download-dir', tempRoot,
    '--no-download',
  ], {
    env: { OPL_REMOTE_RELEASE_VIEW_JSON: JSON.stringify(releaseView) },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /latest-mac\.yml and latest-arm64-mac\.yml must be byte-identical/);
});

test('remote release verifier rejects a duplicate Framework Codex manifest or absence claim', () => {
  const cases = [
    {
      label: 'component',
      mutate(manifest) {
        manifest.manifest.components.codex = {
          required: true,
          role: 'default_agent_cli_offline_archive_wrapper',
        };
      },
      expected: /must not contain components\.codex/,
    },
    {
      label: 'absence-claim',
      mutate(manifest) {
        manifest.manifest.runtime_assertions.declared_pruned_paths
          .find((entry) => entry.path === 'bin/codex').present = true;
      },
      expected: /must prove Framework Codex path bin\/codex absent/,
    },
    {
      label: 'claude-presence-claim',
      mutate(manifest) {
        manifest.manifest.package_optimization.package_boundary_audit
          .claude_payload_absent = false;
      },
      expected: /Studio native Codex carrier is external/,
    },
  ];

  for (const fixture of cases) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-app-remote-codex-${fixture.label}-`));
    const binDir = path.join(tempRoot, 'bin');
    const version = `26.5.19-remote-codex-${fixture.label}`;
    const names = [
      ...writeStandardRemoteAssets(tempRoot, version),
      ...writeFullRemoteAssets(tempRoot, version),
    ];
    const manifestPath = path.join(tempRoot, 'opl-release-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    fixture.mutate(manifest);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const releaseView = buildRemoteReleaseView(
      tempRoot,
      names,
      `v${version}`,
      validFullReleaseNotes(version),
    );
    writeFakeMacosTrustCommands(binDir);

    const result = runNode([
      'scripts/verify-remote-release-assets.ts',
      '--version',
      version,
      '--repo',
      'gaofeng21cn/one-person-lab-app',
      '--include-full-package',
      '--download-dir',
      tempRoot,
      '--no-download',
    ], {
      env: fakeMacosTrustEnvironment(binDir, {
        OPL_REMOTE_RELEASE_VIEW_JSON: JSON.stringify(releaseView),
      }),
    });

    assert.notEqual(result.status, 0, fixture.label);
    assert.match(result.stderr, fixture.expected, fixture.label);
  }
});

test('remote release verifier rejects mixed Developer ID identities in Full evidence', () => {
  const cases = [
    {
      label: 'policy-receipt',
      mutate(manifest) {
        manifest.evidence.gatekeeper_launch_policy.team_identifier = 'OTHERTEAM1';
      },
      expected: /does not bind .* to one Developer ID identity/,
    },
    {
      label: 'nested-runtime',
      mutate(manifest) {
        manifest.evidence.runtime_native_trust.executables[0].team_identifier = 'OTHERTEAM1';
      },
      expected: /does not match Team ID TESTTEAMID/,
    },
  ];

  for (const [index, fixture] of cases.entries()) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-app-remote-full-${fixture.label}-`));
    const binDir = path.join(tempRoot, 'bin');
    const version = `26.5.19-remote-mixed-${index + 1}`;
    const names = [
      ...writeStandardRemoteAssets(tempRoot, version),
      ...writeFullRemoteAssets(tempRoot, version),
    ];
    const manifestPath = path.join(tempRoot, 'opl-release-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    fixture.mutate(manifest);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const releaseView = buildRemoteReleaseView(tempRoot, names, `v${version}`, validFullReleaseNotes(version));
    writeFakeMacosTrustCommands(binDir);

    const result = runNode([
      'scripts/verify-remote-release-assets.ts',
      '--version',
      version,
      '--repo',
      'gaofeng21cn/one-person-lab-app',
      '--include-full-package',
      '--download-dir',
      tempRoot,
      '--no-download',
    ], {
      env: fakeMacosTrustEnvironment(binDir, {
        OPL_REMOTE_RELEASE_VIEW_JSON: JSON.stringify(releaseView),
      }),
    });

    assert.notEqual(result.status, 0, fixture.label);
    assert.match(result.stderr, fixture.expected, fixture.label);
  }
});

test('remote release verifier rejects standard updater metadata that references Full assets', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-remote-release-full-leak-'));
  const version = '26.5.19-remote-leak';
  const names = writeStandardRemoteAssets(tempRoot, version, { fullLeak: true });
  const releaseView = buildRemoteReleaseView(tempRoot, names, `v${version}`);

  const result = runNode([
    'scripts/verify-remote-release-assets.ts',
    '--version',
    version,
    '--repo',
    'gaofeng21cn/one-person-lab-app',
    '--download-dir',
    tempRoot,
    '--no-download',
  ], {
    env: {
      OPL_REMOTE_RELEASE_VIEW_JSON: JSON.stringify(releaseView),
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /latest-mac\.yml references Full first-install assets/);
});

test('remote release verifier rejects a Standard release without its frozen installer bootstrap', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-remote-release-no-installer-'));
  const version = '26.5.19-remote-no-installer';
  const names = writeStandardRemoteAssets(tempRoot, version);
  const releaseView = buildRemoteReleaseView(
    tempRoot,
    names.filter((name) => name !== 'opl-install.sh'),
    `v${version}`,
  );

  const result = runNode([
    'scripts/verify-remote-release-assets.ts',
    '--version',
    version,
    '--repo',
    'gaofeng21cn/one-person-lab-app',
    '--download-dir',
    tempRoot,
    '--no-download',
  ], {
    env: {
      OPL_REMOTE_RELEASE_VIEW_JSON: JSON.stringify(releaseView),
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing: opl-install\.sh/);
});

test('remote release verifier requires both Docker WebUI Latest installer sidecars', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-remote-release-no-docker-installer-'));
  const version = '26.5.19-remote-no-docker-installer';
  const names = writeStandardRemoteAssets(tempRoot, version);
  const releaseView = buildRemoteReleaseView(
    tempRoot,
    names.filter((name) => name !== 'install-docker-webui.ps1'),
    `v${version}`,
  );

  const result = runNode([
    'scripts/verify-remote-release-assets.ts',
    '--version',
    version,
    '--repo',
    'gaofeng21cn/one-person-lab-app',
    '--download-dir',
    tempRoot,
    '--no-download',
  ], {
    env: {
      OPL_REMOTE_RELEASE_VIEW_JSON: JSON.stringify(releaseView),
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing: install-docker-webui\.ps1/);
});

test('remote release verifier rejects a duplicate visible title and any tenth public asset', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-remote-release-surface-'));
  const binDir = path.join(tempRoot, 'bin');
  const version = '26.5.19-surface';
  const names = [
    ...writeStandardRemoteAssets(tempRoot, version),
    ...writeFullRemoteAssets(tempRoot, version),
  ];
  writeFakeMacosTrustCommands(binDir);

  for (const [label, releaseView, expected] of [
    [
      'duplicate title',
      buildRemoteReleaseView(
        tempRoot,
        names,
        `v${version}`,
        `One Person Lab v${version}\n\n${validFullReleaseNotes(version)}`,
      ),
      /repeats the GitHub Release name/,
    ],
    [
      'extra asset',
      (() => {
        writeFile(path.join(tempRoot, 'unexpected-debug-receipt.json'), '{}\n');
        return buildRemoteReleaseView(
          tempRoot,
          [...names, 'unexpected-debug-receipt.json'],
          `v${version}`,
          validFullReleaseNotes(version),
        );
      })(),
      /unexpected: unexpected-debug-receipt\.json/,
    ],
  ]) {
    const result = runNode([
      'scripts/verify-remote-release-assets.ts',
      '--version',
      version,
      '--repo',
      'gaofeng21cn/one-person-lab-app',
      '--include-full-package',
      '--download-dir',
      tempRoot,
      '--no-download',
    ], {
      env: fakeMacosTrustEnvironment(binDir, {
        OPL_REMOTE_RELEASE_VIEW_JSON: JSON.stringify(releaseView),
      }),
    });
    assert.notEqual(result.status, 0, label);
    assert.match(result.stderr, expected, label);
  }
});

test('remote release verifier keeps real non-macOS public trust validation fail closed', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-remote-release-non-macos-'));
  const binDir = path.join(tempRoot, 'bin');
  const version = '26.5.19-remote-non-macos';
  const names = writeStandardRemoteAssets(tempRoot, version);
  const releaseView = buildRemoteReleaseView(tempRoot, names, `v${version}`);
  writeFakeMacosTrustCommands(binDir);

  const result = runNode([
    'scripts/verify-remote-release-assets.ts',
    '--version', version,
    '--repo', 'gaofeng21cn/one-person-lab-app',
    '--download-dir', tempRoot,
    '--no-download',
  ], {
    env: {
      NODE_OPTIONS: fakeNonMacosPlatformNodeOptions,
      OPL_REMOTE_RELEASE_VIEW_JSON: JSON.stringify(releaseView),
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Standard public Developer ID\/notarization verification requires a macOS runner\./,
  );
});

test('remote release verifier separates revision asset names from updater and CFBundle identity', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-remote-release-revision-'));
  const binDir = path.join(tempRoot, 'bin');
  const version = '26.7.20-r1';
  const updaterVersion = '26.7.2001';
  const names = writeStandardRemoteAssets(tempRoot, version, { updaterVersion });
  const releaseView = buildRemoteReleaseView(tempRoot, names, `v${version}`);
  const summaryPath = path.join(tempRoot, 'remote-release-verification.json');
  writeFakeMacosTrustCommands(binDir);

  const result = runNode([
    'scripts/verify-remote-release-assets.ts',
    '--version', version,
    '--updater-version', updaterVersion,
    '--repo', 'gaofeng21cn/one-person-lab-app',
    '--download-dir', tempRoot,
    '--summary-path', summaryPath,
    '--no-download',
  ], {
    env: fakeMacosTrustEnvironment(binDir, {
      OPL_REMOTE_RELEASE_VIEW_JSON: JSON.stringify(releaseView),
    }),
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  assert.equal(summary.display_version, version);
  assert.equal(summary.updater_version, updaterVersion);
  assert.equal(summary.standard_updater_app_bundle_trust.display_version, version);
  assert.equal(summary.standard_updater_app_bundle_trust.updater_version, updaterVersion);
  assert.ok(summary.verified_assets.some((asset) => asset.name === `One-Person-Lab-${version}-mac-arm64.zip`));
});
