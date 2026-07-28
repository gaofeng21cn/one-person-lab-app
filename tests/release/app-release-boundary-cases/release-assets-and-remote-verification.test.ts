import {
  assert,
  fs,
  os,
  path,
  test,
  runNode,
  writeFile,
  writeExecutable,
  writeFakeReleaseNotesAiWriter,
  stableInstallCommand,
  validStandardAiReleaseNotes,
  writeReleaseMetadata,
  writeStandardDistributionTrust,
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
  return `One Person Lab v${version}

This Stable release is for users installing or upgrading One Person Lab App. It focuses on making research, grant-writing, visual-deliverable, agent-design, Office, and document-intake work ready from one App install.

## Highlights
- Use one Stable install path for the App plus refreshed research, grant, visual, Office, and document-intake tools.
- Built-in research, grant-writing, visual deliverable, and agent-design entries have been refreshed for this release.

## What improved

### Built-in research, grant, and visual work
- Refreshed the built-in research, grant, visual deliverable, and agent-design entries used from the App.

## Compatibility and action required
- No manual migration is required beyond installing or upgrading this Stable release.
- Use the Full first-install package for a fresh machine that needs the bundled OPL family tools.

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

test('retired direct publisher only renders dry-run asset plans and attempts no mutation', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-'));
  const shellRoot = path.join(tempRoot, 'shells', 'aionui');
  const outDir = path.join(shellRoot, 'out');
  const binDir = path.join(tempRoot, 'bin');
  const ghLogPath = path.join(tempRoot, 'gh.log');
  const fakeAi = path.join(tempRoot, 'fake-release-notes-ai.js');
  const version = '26.5.15';
  const dmgName = `One-Person-Lab-${version}-mac-arm64.dmg`;

  writeFile(path.join(outDir, dmgName));
  writeFile(path.join(outDir, `One-Person-Lab-${version}-mac-arm64.zip`));
  writeReleaseMetadata(outDir, version, dmgName);
  writeStandardDistributionTrust(outDir, version);
  writeFakeReleaseNotesAiWriter(fakeAi, validStandardAiReleaseNotes(version));
  writeExecutable(path.join(binDir, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + '\\n');
process.exit(args[0] === 'release' && args[1] === 'upload' ? 1 : 0);
`);

  const result = runNode([
    'scripts/publish-release.ts',
    '--no-build',
    '--dry-run',
    '--shell-root',
    shellRoot,
    '--version',
    version,
  ], {
    env: {
      OPL_RELEASE_EXISTS: '0',
      OPL_RELEASE_NOTES_MODE: 'ai',
      OPL_RELEASE_NOTES_AI_COMMAND: `${process.execPath} ${fakeAi}`,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.release_repo, 'gaofeng21cn/one-person-lab-app');
  assert.equal(payload.tag, `v${version}`);
  assert.equal(payload.release_notes_mode, 'ai');
  assert.ok(payload.artifacts.some((artifact) => artifact.endsWith(dmgName)));

  const publishArgs = [
    'scripts/publish-release.ts',
    '--no-build',
    '--draft',
    '--shell-root',
    shellRoot,
    '--version',
    version,
  ];
  const publishEnv = {
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    FAKE_GH_LOG: ghLogPath,
    OPL_RELEASE_NOTES_MODE: 'template',
    OPL_RELEASE_TEST_MODE: '1',
  };
  const retired = runNode(publishArgs, {
    env: { ...publishEnv, OPL_RELEASE_EXISTS: '0' },
  });
  assert.equal(retired.status, 2, retired.stderr || retired.stdout);
  const retirement = JSON.parse(retired.stdout);
  assert.equal(retirement.schema, 'opl_app_direct_release_publisher_retired.v1');
  assert.equal(retirement.status, 'retired_fail_closed');
  assert.equal(retirement.mutation_authorized, false);
  assert.equal(retirement.release_mutation_attempted, false);
  assert.deepEqual(retirement.framework_handoff.allowed_stable_operations, [
    'standard',
    'resume_standard',
    'append_full',
  ]);
  assert.equal(fs.existsSync(ghLogPath), false);
});

test('retired publisher dry-run never interprets remote state as mutation admission', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-immutable-release-'));
  const releaseAssetsDir = path.join(tempRoot, 'release-assets');
  const version = '26.5.16';
  const dmgName = `One-Person-Lab-${version}-mac-arm64.dmg`;
  const zipName = `One-Person-Lab-${version}-mac-arm64.zip`;
  writeFile(path.join(releaseAssetsDir, dmgName));
  writeFile(path.join(releaseAssetsDir, zipName));
  writeFile(path.join(releaseAssetsDir, `${zipName}.blockmap`));
  writeReleaseMetadata(releaseAssetsDir, version, dmgName);
  writeStandardDistributionTrust(releaseAssetsDir, version);

  for (const [label, state] of [
    ['stable', { tagName: `v${version}`, isDraft: false, isPrerelease: false, publishedAt: '2026-05-16T00:00:00Z' }],
    ['prerelease', { tagName: `v${version}`, isDraft: false, isPrerelease: true, publishedAt: '2026-05-16T00:00:00Z' }],
  ]) {
    const result = runNode([
      'scripts/publish-release.ts',
      '--no-build',
      '--dry-run',
      '--standard-artifacts-dir',
      releaseAssetsDir,
      '--version',
      version,
    ], {
      env: {
        OPL_RELEASE_STATE_JSON: JSON.stringify(state),
        OPL_RELEASE_NOTES_MODE: 'template',
      },
    });
    assert.equal(result.status, 0, `${label}: ${result.stderr || result.stdout}`);
    const inspection = JSON.parse(result.stdout);
    assert.equal(inspection.remote_inspection_performed, false);
    assert.equal(inspection.remote_mutation_attempted, false);
    assert.equal(inspection.mutation_authorized, false);
  }

  const promotedBetweenPlanAndUpload = runNode([
    'scripts/publish-release.ts',
    '--no-build',
    '--draft',
    '--standard-artifacts-dir',
    releaseAssetsDir,
    '--version',
    version,
  ], {
    env: {
      OPL_RELEASE_STATE_JSON: JSON.stringify({
        tagName: `v${version}`,
        isDraft: true,
        isPrerelease: false,
        publishedAt: null,
      }),
      OPL_RELEASE_MUTATION_STATE_JSON: JSON.stringify({
        tagName: `v${version}`,
        isDraft: false,
        isPrerelease: false,
        publishedAt: '2026-05-16T00:01:00Z',
      }),
      OPL_RELEASE_EXISTING_ASSETS_JSON: '[]',
      OPL_RELEASE_NOTES_MODE: 'template',
      OPL_RELEASE_PUBLISH_RECOVERY_RECEIPT_PATH: path.join(tempRoot, 'promoted-race-recovery-receipt.json'),
      OPL_RELEASE_TEST_MODE: '1',
    },
  });
  assert.equal(promotedBetweenPlanAndUpload.status, 2);
  const retirement = JSON.parse(promotedBetweenPlanAndUpload.stdout);
  assert.equal(retirement.status, 'retired_fail_closed');
  assert.equal(retirement.remote_read_attempted, false);
  assert.equal(retirement.remote_write_attempted, false);
});

test('retired direct publisher rejects non-dry Full requests before any remote read or write', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-race-'));
  const fullDir = path.join(tempRoot, 'full');
  const binDir = path.join(tempRoot, 'bin');
  const ghLogPath = path.join(tempRoot, 'gh.log');
  const stateReadsPath = path.join(tempRoot, 'state-reads.txt');
  const version = '26.7.13';
  writeFullRemoteAssets(fullDir, version);
  const publicManifestPath = path.join(fullDir, 'opl-release-manifest.json');
  const publicManifest = JSON.parse(fs.readFileSync(publicManifestPath, 'utf8'));
  publicManifest.manifest.components = {
    ...publicManifest.manifest.components,
    mas: { ...publicManifest.manifest.components?.mas, git_commit: '1234567' },
    mag: { ...publicManifest.manifest.components?.mag, git_commit: '1234567' },
    rca: { ...publicManifest.manifest.components?.rca, git_commit: '1234567' },
    meta_agent: { ...publicManifest.manifest.components?.meta_agent, git_commit: '1234567' },
    officecli: { ...publicManifest.manifest.components?.officecli, version: '1.0.125' },
    mineru_open_api: { ...publicManifest.manifest.components?.mineru_open_api, version: 'v0.1.0' },
  };
  fs.writeFileSync(publicManifestPath, `${JSON.stringify(publicManifest, null, 2)}\n`);
  writeExecutable(path.join(binDir, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'release' && args[1] === 'view' && args.includes('tagName,isDraft,isPrerelease,publishedAt')) {
  const count = fs.existsSync(process.env.FAKE_GH_STATE_READS)
    ? Number(fs.readFileSync(process.env.FAKE_GH_STATE_READS, 'utf8'))
    : 0;
  fs.writeFileSync(process.env.FAKE_GH_STATE_READS, String(count + 1));
  process.stdout.write(JSON.stringify({
    tagName: 'v${version}',
    isDraft: count === 0,
    isPrerelease: false,
    publishedAt: count === 0 ? null : '2026-07-13T00:01:00Z',
  }));
}
process.exit(0);
`);

  const result = runNode([
    'scripts/publish-release.ts',
    '--no-build',
    '--version',
    version,
    '--full-package-only',
    '--include-full-package',
    '--full-package-dir',
    fullDir,
  ], {
    env: {
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      FAKE_GH_LOG: ghLogPath,
      FAKE_GH_STATE_READS: stateReadsPath,
      OPL_RELEASE_PUBLISH_RECOVERY_RECEIPT_PATH: path.join(tempRoot, 'race-recovery-receipt.json'),
      OPL_RELEASE_STATE_JSON: JSON.stringify({
        tagName: `v${version}`,
        isDraft: true,
        isPrerelease: false,
        publishedAt: null,
      }),
      OPL_RELEASE_EXISTING_ASSETS_JSON: '[]',
      OPL_RELEASE_NOTES_MODE: 'template',
      OPL_RELEASE_UPLOAD_ATTEMPTS: '1',
    },
  });

  assert.equal(result.status, 2, result.stderr || result.stdout);
  const retirement = JSON.parse(result.stdout);
  assert.equal(retirement.status, 'retired_fail_closed');
  assert.equal(retirement.release_mutation_attempted, false);
  assert.equal(fs.existsSync(ghLogPath), false);
  assert.equal(fs.existsSync(stateReadsPath), false);
});

test('publisher inspection rejects a Full manifest with mixed Developer ID identities', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-full-mixed-identity-'));
  const fullDir = path.join(tempRoot, 'full');
  const version = '26.7.13';
  writeFullRemoteAssets(fullDir, version);
  const manifestPath = path.join(fullDir, 'opl-release-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.evidence.gatekeeper_launch_policy.team_identifier = 'OTHERTEAM1';
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = runNode([
    'scripts/publish-release.ts',
    '--no-build',
    '--dry-run',
    '--version',
    version,
    '--full-package-only',
    '--include-full-package',
    '--full-package-dir',
    fullDir,
  ], {
    env: {
      OPL_RELEASE_NOTES_MODE: 'template',
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not bind .* to one Developer ID identity/);
});

test('publish dry run accepts prebuilt standard release assets from GitHub Actions', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-prebuilt-release-'));
  const releaseAssetsDir = path.join(tempRoot, 'release-assets');
  const version = '26.5.15';
  const dmgName = `One-Person-Lab-${version}-mac-arm64.dmg`;
  const zipName = `One-Person-Lab-${version}-mac-arm64.zip`;
  const metadata = [
    `version: ${version}`,
    'files:',
    `  - url: ${dmgName}`,
    '    sha512: test',
    '    size: 1',
    `path: ${dmgName}`,
    'sha512: test',
    '',
  ].join('\n');

  writeFile(path.join(releaseAssetsDir, dmgName));
  writeFile(path.join(releaseAssetsDir, zipName));
  writeFile(path.join(releaseAssetsDir, `${zipName}.blockmap`));
  writeExecutable(path.join(releaseAssetsDir, 'opl-install.sh'), '#!/usr/bin/env bash\nexit 0\n');
  writeFile(path.join(releaseAssetsDir, 'latest-arm64-mac.yml'), metadata);
  writeStandardDistributionTrust(releaseAssetsDir, version);

  const result = runNode([
    'scripts/publish-release.ts',
    '--no-build',
    '--dry-run',
    '--standard-artifacts-dir',
    releaseAssetsDir,
    '--version',
    version,
  ], {
    env: {
      OPL_RELEASE_EXISTS: '0',
      OPL_RELEASE_NOTES_MODE: 'template',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.standard_artifacts_dir, releaseAssetsDir);
  assert.equal(payload.release_notes_mode, 'template');
  assert.ok(payload.standard_artifacts.some((artifact) => artifact.endsWith(dmgName)));
  assert.ok(payload.standard_artifacts.some((artifact) => artifact.endsWith('latest-arm64-mac.yml')));
  assert.equal(payload.remote_inspection_performed, false);
  assert.equal(payload.remote_mutation_attempted, false);
  assert.equal(payload.build_performed, false);
  assert.ok(payload.asset_identities.every((asset) => /^sha256:[0-9a-f]{64}$/.test(asset.sha256)));
});

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
  assert.equal(summary.standard_updater_app_bundle_trust.gatekeeper_policy, 'standard-gatekeeper-launch-policy.json');
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
  assert.deepEqual(summary.full_first_install_budget.temporal_core_bridge_releases, ['aarch64-apple-darwin']);
  assert.equal(summary.full_first_install_budget.excluded_module_venv_count, 0);
  assert.equal(summary.full_first_install_budget.required_components.temporal_cli.version, 'temporal version 1.7.0');
  assert.equal(summary.full_first_install_budget.optional_components.bun.status, 'not_packaged');
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
  assert.match(result.stderr, /latest-arm64-mac\.yml references Full first-install assets/);
});

test('remote release verifier rejects a Standard release without its immutable installer bootstrap', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-remote-release-no-installer-'));
  const version = '26.5.19-remote-no-installer';
  const names = writeStandardRemoteAssets(tempRoot, version);
  const releaseView = buildRemoteReleaseView(
    tempRoot,
    names.filter((name) => name !== 'opl-app-installer.sh'),
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
  assert.match(result.stderr, /missing asset opl-app-installer\.sh/);
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
