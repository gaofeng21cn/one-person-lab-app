import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertDevelopmentRepoSnapshotUnchanged,
  deriveManualLocalAppIdentity,
  manualVersions,
  manualSourceProvenanceSha256,
  snapshotDevelopmentRepo,
  stampManualLocalAppIdentity,
} from '../../../scripts/manual-latest-build/common.ts';
import {
  assertManualAppVersionIdentity,
  installLocalApp,
  manualAppLaunchArgs,
  ManualAppInstallationError,
  readAppVersionIdentity,
} from '../../../scripts/manual-latest-build/install-app.ts';
import {
  assertFullDmgCodexCarrierBoundary,
  prepareManualRuntimeDependencies,
  resolveManualBuildDependencies,
} from '../../../scripts/manual-latest-build.ts';
import {
  mineruOpenApiBinaryUrl,
  selectLatestMineruCliTag,
} from '../../../scripts/manual-latest-build/upstreams.ts';

const appRoot = path.resolve(import.meta.dirname, '..', '..', '..');

function createDevelopmentRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-manual-source-snapshot-'));
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'OPL Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'opl-test@example.invalid'], { cwd: root });
  fs.writeFileSync(path.join(root, 'source.txt'), 'initial\n');
  execFileSync('git', ['add', 'source.txt'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: root });
  return root;
}

function writeExecutable(filePath: string, source: string) {
  fs.writeFileSync(filePath, source, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

function createTestApp(
  appPath: string,
  input: {
    displayVersion: string;
    updaterVersion: string;
    bundleVersion?: string;
    marker?: string;
    buildIdentity?: {
      publicUpdaterVersion: string;
      localBuildId: string;
      sourceProvenanceSha256: string;
      sourceLockSha256: string;
    };
  },
) {
  const contents = path.join(appPath, 'Contents');
  const manifestRoot = path.join(contents, 'Resources', 'opl-full-runtime', 'manifest');
  const buildIdentity = input.buildIdentity
    ? `
  <key>OPLBuildKind</key>
  <string>local-development</string>
  <key>OPLLocalBuildID</key>
  <string>${input.buildIdentity.localBuildId}</string>
  <key>OPLPublicUpdaterVersion</key>
  <string>${input.buildIdentity.publicUpdaterVersion}</string>
  <key>OPLUpdaterPolicy</key>
  <string>disabled-local-development</string>
  <key>OPLSourceProvenanceSHA256</key>
  <string>${input.buildIdentity.sourceProvenanceSha256}</string>
  <key>OPLSourceLockSHA256</key>
  <string>${input.buildIdentity.sourceLockSha256}</string>`
    : '';
  const updaterGuard = '';
  fs.mkdirSync(manifestRoot, { recursive: true });
  fs.writeFileSync(path.join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>cn.onepersonlab.opl</string>
  <key>CFBundleShortVersionString</key>
  <string>${input.updaterVersion}</string>
  <key>CFBundleVersion</key>
  <string>${input.bundleVersion ?? input.updaterVersion}</string>${buildIdentity}
  <key>LSEnvironment</key>
  <dict>
    <key>MallocNanoZone</key>
    <string>0</string>${updaterGuard}
  </dict>
</dict>
</plist>
`, 'utf8');
  fs.writeFileSync(
    path.join(manifestRoot, 'full-package-manifest.json'),
    `${JSON.stringify({ version: input.displayVersion })}\n`,
    'utf8',
  );
  if (input.marker) fs.writeFileSync(path.join(contents, input.marker), '\n', 'utf8');
}

function createFakeMacInstallCommands(root: string) {
  const binaryRoot = path.join(root, 'bin');
  fs.mkdirSync(binaryRoot, { recursive: true });
  writeExecutable(path.join(binaryRoot, 'codesign'), `#!/bin/sh
app_path=''
for argument in "$@"; do app_path="$argument"; done
if [ "$app_path" = "$OPL_TEST_INSTALL_PATH" ] && {
  [ -f "$app_path/Contents/OLD_SIGNATURE_POLLUTION" ] ||
  [ -f "$app_path/Contents/FAIL_FINAL_SIGNATURE" ];
}; then
  echo 'a sealed resource is missing or invalid' >&2
  exit 1
fi
exit 0
`);
  writeExecutable(path.join(binaryRoot, 'ditto'), `#!/bin/sh
exec /bin/cp -R "$1" "$2"
`);
  writeExecutable(path.join(binaryRoot, 'pgrep'), `#!/bin/sh
if [ -f "$OPL_TEST_RUNNING_STATE" ] && [ "$(/bin/cat "$OPL_TEST_RUNNING_STATE")" = '1' ]; then
  echo 4242
  exit 0
fi
exit 1
`);
  writeExecutable(path.join(binaryRoot, 'osascript'), `#!/bin/sh
echo 0 > "$OPL_TEST_RUNNING_STATE"
`);
  writeExecutable(path.join(binaryRoot, 'open'), `#!/bin/sh
echo 1 > "$OPL_TEST_RUNNING_STATE"
`);
  writeExecutable(path.join(binaryRoot, 'xattr'), '#!/bin/sh\nexit 0\n');
  return binaryRoot;
}

test('manual latest versions use the Asia/Shanghai date and monotonic updater encoding', () => {
  assert.deepEqual(manualVersions(new Date('2026-07-20T15:59:59Z')), {
    displayVersion: '26.7.20',
    updaterVersion: '26.7.20',
  });
  assert.deepEqual(manualVersions(new Date('2026-07-20T16:00:00Z')), {
    displayVersion: '26.7.21',
    updaterVersion: '26.7.2100',
  });
  assert.deepEqual(
    manualVersions(
      new Date('2026-07-28T12:00:00Z'),
      'v26.7.28-r3',
    ),
    {
      displayVersion: '26.7.28-r3',
      updaterVersion: '26.7.2803',
    },
  );
  assert.deepEqual(
    manualVersions(
      new Date('2026-07-28T12:00:00Z'),
      'v26.7.27-r2',
    ),
    {
      displayVersion: '26.7.28',
      updaterVersion: '26.7.2800',
    },
  );
  assert.throws(
    () => manualVersions(
      new Date('2026-07-28T12:00:00Z'),
      'v26.7.29',
    ),
    /newer than the current Asia\/Shanghai date/,
  );
  assert.throws(
    () => manualVersions(
      new Date('2026-07-28T12:00:00Z'),
      'latest',
    ),
    /not canonical/,
  );
});

test('manual local App identity is deterministic without corrupting the updater machine version', () => {
  const sourceProvenanceSha256 = manualSourceProvenanceSha256({
    schema: 'opl_manual_latest_build_source_lock.v1',
    display_version: '26.7.28-r3',
    updater_version: '26.7.2803',
    repositories: {
      app: { head: 'a'.repeat(40) },
      shell: { head: 'b'.repeat(40) },
    },
  });
  const identity = deriveManualLocalAppIdentity('26.7.2803', sourceProvenanceSha256);

  assert.deepEqual(identity, {
    build_kind: 'local-development',
    public_updater_version: '26.7.2803',
    machine_version: '26.7.2803',
    local_build_id: `local.src${sourceProvenanceSha256.slice(0, 12)}`,
    updater_policy: 'disabled-local-development',
    source_provenance_sha256: sourceProvenanceSha256,
  });
  assert.equal(identity.machine_version, identity.public_updater_version);
  assert.match(identity.local_build_id, /^local\.src[0-9a-f]{12}$/);
  assert.throws(
    () => deriveManualLocalAppIdentity('26.7.2803', 'not-a-digest'),
    /source provenance SHA-256/,
  );
});

test('manual local App plist stamping exposes public updater and source-lock provenance', {
  skip: process.platform !== 'darwin',
}, (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-manual-local-identity-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const appPath = path.join(root, 'One Person Lab.app');
  const expected = {
    display_version: '26.7.28-r3',
    ...deriveManualLocalAppIdentity('26.7.2803', 'a'.repeat(64)),
    source_lock_sha256: 'b'.repeat(64),
  };
  createTestApp(appPath, {
    displayVersion: expected.display_version,
    updaterVersion: expected.display_version,
  });

  stampManualLocalAppIdentity(appPath, expected);

  const actual = readAppVersionIdentity(appPath);
  assert.doesNotThrow(() => assertManualAppVersionIdentity(actual, expected));
  assert.equal(actual.public_updater_version, '26.7.2803');
  assert.equal(actual.bundle_version, '26.7.2803');
  assert.equal(actual.local_build_id, 'local.srcaaaaaaaaaaaa');
  assert.equal(actual.updater_policy, 'disabled-local-development');
  assert.equal(actual.auto_update_disabled, true);
  assert.equal(actual.source_lock_sha256, 'b'.repeat(64));
  assert.equal(
    execFileSync('plutil', [
      '-extract', 'LSEnvironment.MallocNanoZone', 'raw', '-o', '-',
      path.join(appPath, 'Contents', 'Info.plist'),
    ], { encoding: 'utf8' }).trim(),
    '0',
  );
});

test('full package app-only build fails closed without manual local identity', () => {
  const script = path.join(appRoot, 'scripts', 'build-full-first-install-package.ts');
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    script,
    '--app-only',
    '--version', '26.7.21',
    '--updater-version', '26.7.2100',
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      OPL_MANUAL_LOCAL_BUILD_ID: '',
      OPL_MANUAL_LOCAL_SOURCE_PROVENANCE_SHA256: '',
      OPL_MANUAL_LOCAL_SOURCE_LOCK_SHA256: '',
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Manual local App build requires local build ID, source provenance, and source-lock identity/,
  );
});

test('MinerU latest selection uses stable OpenAPI CLI tags and binds the tag commit', () => {
  const selected = selectLatestMineruCliTag([
    { ref: 'refs/tags/v9.0.0', object: { type: 'commit', sha: '1'.repeat(40) } },
    { ref: 'refs/tags/cli/v0.9.0', object: { type: 'commit', sha: '2'.repeat(40) } },
    { ref: 'refs/tags/cli/mineru-open-api/v0.6.0', object: { type: 'commit', sha: '3'.repeat(40) } },
    { ref: 'refs/tags/cli/mineru-open-api/v0.7.0-rc.1', object: { type: 'commit', sha: '4'.repeat(40) } },
    { ref: 'refs/tags/cli/mineru-open-api/v0.8.0', object: { type: 'tag', sha: '5'.repeat(40) } },
    { ref: 'refs/tags/cli/mineru-open-api/v0.6.1', object: { type: 'commit', sha: '6'.repeat(40) } },
  ]);
  assert.deepEqual(selected, {
    tag: 'cli/mineru-open-api/v0.6.1',
    version: '0.6.1',
    tag_commit: '6'.repeat(40),
  });
  assert.equal(
    mineruOpenApiBinaryUrl(selected.version),
    'https://cdn-mineru.openxlab.org.cn/open-api-cli/v0.6.1/mineru-open-api-cli-darwin-arm64',
  );
});


test('manual App identity preserves machine SemVer and binds local provenance plus updater policy', () => {
  const expected = {
    display_version: '26.7.21',
    ...deriveManualLocalAppIdentity('26.7.2100', 'a'.repeat(64)),
    source_lock_sha256: 'b'.repeat(64),
  };
  const identity = {
    bundle_id: 'cn.onepersonlab.opl',
    display_version: '26.7.21',
    updater_version: '26.7.2100',
    public_updater_version: '26.7.2100',
    bundle_version: expected.machine_version,
    build_kind: 'local-development',
    local_build_id: expected.local_build_id,
    updater_policy: expected.updater_policy,
    auto_update_disabled: true,
    source_provenance_sha256: 'a'.repeat(64),
    source_lock_sha256: 'b'.repeat(64),
    cf_bundle_short_version: expected.machine_version,
    cf_bundle_version: expected.machine_version,
    full_manifest: '/tmp/full-package-manifest.json',
  };
  assert.doesNotThrow(() => assertManualAppVersionIdentity(identity, expected));
  assert.throws(
    () => assertManualAppVersionIdentity(
      {
        ...identity,
        local_build_id: 'local.src000000000000',
      },
      expected,
    ),
    /version identity mismatch/,
  );
  assert.throws(
    () => assertManualAppVersionIdentity(
      { ...identity, display_version: null },
      expected,
    ),
    /display=<missing>/,
  );
  assert.throws(
    () => assertManualAppVersionIdentity(
      { ...identity, source_lock_sha256: null },
      expected,
    ),
    /source_lock=<missing>/,
  );
});

test('manual App launch forwards an explicit valid CDP port without changing the default', () => {
  const appPath = '/Applications/One Person Lab.app';
  assert.deepEqual(manualAppLaunchArgs(appPath, {}), [appPath]);
  assert.deepEqual(
    manualAppLaunchArgs(appPath, { OPL_STUDIO_CDP_PORT: '9230' }),
    ['--env', 'OPL_STUDIO_CDP_PORT=9230', appPath],
  );
  assert.throws(
    () => manualAppLaunchArgs(appPath, { OPL_STUDIO_CDP_PORT: '65536' }),
    /Invalid OPL_STUDIO_CDP_PORT/,
  );
});

test('manual installer replaces a legacy mixed-version baseline, rejects mixed candidates, and types rollback', {
  skip: process.platform !== 'darwin',
}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-manual-install-test-'));
  const binaryRoot = createFakeMacInstallCommands(root);
  const originalPath = process.env.PATH;
  const originalInstallPath = process.env.OPL_TEST_INSTALL_PATH;
  const originalRunningState = process.env.OPL_TEST_RUNNING_STATE;
  try {
    process.env.PATH = `${binaryRoot}:${originalPath ?? ''}`;
    const expectedVersionIdentity = {
      display_version: '26.7.21',
      ...deriveManualLocalAppIdentity('26.7.2100', 'a'.repeat(64)),
      source_lock_sha256: 'b'.repeat(64),
    };

    const successRoot = path.join(root, 'success');
    const successInstall = path.join(successRoot, 'Applications', 'One Person Lab.app');
    const successBuilt = path.join(successRoot, 'built', 'One Person Lab.app');
    const successRunning = path.join(successRoot, 'running-state');
    const legacyBundleVersion = '26.7.2091';
    createTestApp(successInstall, {
      displayVersion: '26.7.20',
      updaterVersion: '26.7.20',
      bundleVersion: legacyBundleVersion,
      marker: 'OLD_SIGNATURE_POLLUTION',
    });
    createTestApp(successBuilt, {
      displayVersion: '26.7.21',
      updaterVersion: expectedVersionIdentity.machine_version,
      buildIdentity: {
        publicUpdaterVersion: expectedVersionIdentity.public_updater_version,
        localBuildId: expectedVersionIdentity.local_build_id,
        sourceProvenanceSha256: expectedVersionIdentity.source_provenance_sha256,
        sourceLockSha256: expectedVersionIdentity.source_lock_sha256,
      },
    });
    fs.writeFileSync(successRunning, '0\n', 'utf8');
    process.env.OPL_TEST_INSTALL_PATH = successInstall;
    process.env.OPL_TEST_RUNNING_STATE = successRunning;

    assert.throws(
      () => readAppVersionIdentity(successInstall),
      /App bundle machine versions differ/,
    );

    const completed = installLocalApp({
      builtApp: successBuilt,
      installPath: successInstall,
      expectedVersionIdentity,
      launch: false,
    });
    assert.equal(completed.status, 'completed');
    assert.equal(completed.replaced_version?.display_version, '26.7.20');
    assert.equal(completed.replaced_version?.cf_bundle_short_version, '26.7.20');
    assert.equal(completed.replaced_version?.cf_bundle_version, legacyBundleVersion);
    assert.equal(completed.replaced_signature?.status, 'invalid');
    assert.match(completed.replaced_signature?.diagnostics ?? '', /sealed resource/);
    assert.equal(completed.installed_version.display_version, '26.7.21');
    assert.equal(
      completed.installed_version.public_updater_version,
      expectedVersionIdentity.public_updater_version,
    );
    assert.equal(
      completed.installed_version.bundle_version,
      expectedVersionIdentity.machine_version,
    );
    assert.equal(
      completed.installed_version.source_lock_sha256,
      expectedVersionIdentity.source_lock_sha256,
    );
    assert.equal(fs.existsSync(path.join(successInstall, 'Contents', 'OLD_SIGNATURE_POLLUTION')), false);

    const invalidCandidateRoot = path.join(root, 'invalid-candidate');
    const invalidCandidateInstall = path.join(
      invalidCandidateRoot,
      'Applications',
      'One Person Lab.app',
    );
    const invalidCandidateBuilt = path.join(
      invalidCandidateRoot,
      'built',
      'One Person Lab.app',
    );
    createTestApp(invalidCandidateBuilt, {
      displayVersion: '26.7.21',
      updaterVersion: '26.7.21',
      bundleVersion: expectedVersionIdentity.machine_version,
      buildIdentity: {
        publicUpdaterVersion: expectedVersionIdentity.public_updater_version,
        localBuildId: expectedVersionIdentity.local_build_id,
        sourceProvenanceSha256: expectedVersionIdentity.source_provenance_sha256,
        sourceLockSha256: expectedVersionIdentity.source_lock_sha256,
      },
    });
    assert.throws(
      () => installLocalApp({
        builtApp: invalidCandidateBuilt,
        installPath: invalidCandidateInstall,
        expectedVersionIdentity,
        launch: false,
      }),
      /App bundle machine versions differ/,
    );
    assert.equal(fs.existsSync(invalidCandidateInstall), false);

    const failureRoot = path.join(root, 'failure');
    const failureInstall = path.join(failureRoot, 'Applications', 'One Person Lab.app');
    const failureBuilt = path.join(failureRoot, 'built', 'One Person Lab.app');
    const failureRunning = path.join(failureRoot, 'running-state');
    createTestApp(failureInstall, {
      displayVersion: '26.7.20',
      updaterVersion: '26.7.20',
      marker: 'OLD_SIGNATURE_POLLUTION',
    });
    createTestApp(failureBuilt, {
      displayVersion: '26.7.21',
      updaterVersion: expectedVersionIdentity.machine_version,
      buildIdentity: {
        publicUpdaterVersion: expectedVersionIdentity.public_updater_version,
        localBuildId: expectedVersionIdentity.local_build_id,
        sourceProvenanceSha256: expectedVersionIdentity.source_provenance_sha256,
        sourceLockSha256: expectedVersionIdentity.source_lock_sha256,
      },
      marker: 'FAIL_FINAL_SIGNATURE',
    });
    fs.writeFileSync(failureRunning, '1\n', 'utf8');
    process.env.OPL_TEST_INSTALL_PATH = failureInstall;
    process.env.OPL_TEST_RUNNING_STATE = failureRunning;

    let failure: unknown = null;
    try {
      installLocalApp({
        builtApp: failureBuilt,
        installPath: failureInstall,
        expectedVersionIdentity,
        launch: false,
      });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure instanceof ManualAppInstallationError);
    assert.equal(failure.receipt.phase, 'verify_installed');
    assert.equal(failure.receipt.rollback.baseline_preserved_at_install_path, true);
    assert.equal(failure.receipt.rollback.relaunch_required, true);
    assert.equal(failure.receipt.rollback.relaunched, true);
    assert.equal(failure.receipt.rollback.error, null);
    assert.equal(fs.readFileSync(failureRunning, 'utf8').trim(), '1');
    assert.equal(fs.existsSync(path.join(failureInstall, 'Contents', 'OLD_SIGNATURE_POLLUTION')), true);
    assert.equal(fs.existsSync(path.join(failureInstall, 'Contents', 'FAIL_FINAL_SIGNATURE')), false);
    assert.deepEqual(
      fs.readdirSync(path.dirname(failureInstall)).filter((entry) => entry.startsWith('.opl-manual-app-')),
      [],
    );
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    if (originalInstallPath === undefined) delete process.env.OPL_TEST_INSTALL_PATH;
    else process.env.OPL_TEST_INSTALL_PATH = originalInstallPath;
    if (originalRunningState === undefined) delete process.env.OPL_TEST_RUNNING_STATE;
    else process.env.OPL_TEST_RUNNING_STATE = originalRunningState;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('manual source snapshot gate rejects tracked source dirtiness after freeze', (context) => {
  const root = createDevelopmentRepo();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const frozen = snapshotDevelopmentRepo('fixture', root);

  assert.doesNotThrow(() => assertDevelopmentRepoSnapshotUnchanged(frozen));
  fs.writeFileSync(path.join(root, 'source.txt'), 'dirty\n');

  assert.throws(
    () => assertDevelopmentRepoSnapshotUnchanged(frozen),
    /fixture source snapshot became invalid during manual latest build:.*not clean/s,
  );
});

test('manual source snapshot gate rejects untracked source dirtiness after freeze', (context) => {
  const root = createDevelopmentRepo();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const frozen = snapshotDevelopmentRepo('fixture', root);

  fs.writeFileSync(path.join(root, 'injected-source.ts'), 'export const injected = true;\n');

  assert.throws(
    () => assertDevelopmentRepoSnapshotUnchanged(frozen),
    /fixture source snapshot became invalid during manual latest build:.*not clean/s,
  );
});

test('manual source snapshot gate rejects main advancement after freeze', (context) => {
  const root = createDevelopmentRepo();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const frozen = snapshotDevelopmentRepo('fixture', root);

  fs.writeFileSync(path.join(root, 'source.txt'), 'advanced\n');
  execFileSync('git', ['add', 'source.txt'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'advance'], { cwd: root });

  assert.throws(
    () => assertDevelopmentRepoSnapshotUnchanged(frozen),
    /fixture source snapshot changed during manual latest build: head expected=/,
  );
});

test('manual source snapshot accepts a clean detached canonical origin/main HEAD', (context) => {
  const root = createDevelopmentRepo();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  execFileSync('git', ['update-ref', 'refs/remotes/origin/main', head], {
    cwd: root,
  });
  execFileSync('git', ['checkout', '--detach', head], { cwd: root });

  const snapshot = snapshotDevelopmentRepo('fixture', root);

  assert.equal(snapshot.branch, '');
  assert.equal(snapshot.head, head);
  assert.equal(snapshot.origin_main, head);
});

test('manual source snapshot rejects a clean local main behind fetched origin/main', (context) => {
  const root = createDevelopmentRepo();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const initialHead = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  execFileSync('git', ['update-ref', 'refs/remotes/origin/main', initialHead], {
    cwd: root,
  });
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const remoteHead = execFileSync(
    'git',
    ['commit-tree', tree, '-p', initialHead, '-m', 'remote advance'],
    { cwd: root, encoding: 'utf8' },
  ).trim();

  execFileSync(
    'git',
    ['update-ref', 'refs/remotes/origin/main', remoteHead],
    { cwd: root },
  );

  assert.throws(
    () => snapshotDevelopmentRepo('fixture', root),
    /fixture must use the fetched canonical origin\/main HEAD/,
  );
});

test('manual source snapshot rejects a stale tracking ref after remote main advances', (context) => {
  const root = createDevelopmentRepo();
  const remoteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-manual-source-remote-'));
  context.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(remoteRoot, { recursive: true, force: true });
  });
  const bare = path.join(remoteRoot, 'origin.git');
  const publisher = path.join(remoteRoot, 'publisher');
  execFileSync('git', ['init', '--bare', '--initial-branch=main', bare]);
  execFileSync('git', ['remote', 'add', 'origin', bare], { cwd: root });
  execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: root });
  assert.doesNotThrow(() => snapshotDevelopmentRepo('fixture', root));

  execFileSync('git', ['clone', bare, publisher]);
  execFileSync('git', ['config', 'user.name', 'OPL Publisher'], { cwd: publisher });
  execFileSync('git', ['config', 'user.email', 'publisher@example.invalid'], { cwd: publisher });
  fs.writeFileSync(path.join(publisher, 'source.txt'), 'remote advanced\n');
  execFileSync('git', ['add', 'source.txt'], { cwd: publisher });
  execFileSync('git', ['commit', '-m', 'remote advance'], { cwd: publisher });
  execFileSync('git', ['push', 'origin', 'main'], { cwd: publisher });

  assert.throws(
    () => snapshotDevelopmentRepo('fixture', root),
    /fixture fetched origin\/main is stale/,
  );
});

test('manual source snapshot remains valid when remote main advances after freeze', (context) => {
  const root = createDevelopmentRepo();
  const remoteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-manual-source-remote-'));
  context.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(remoteRoot, { recursive: true, force: true });
  });
  const bare = path.join(remoteRoot, 'origin.git');
  const publisher = path.join(remoteRoot, 'publisher');
  execFileSync('git', ['init', '--bare', '--initial-branch=main', bare]);
  execFileSync('git', ['remote', 'add', 'origin', bare], { cwd: root });
  execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: root });
  const frozen = snapshotDevelopmentRepo('fixture', root);

  execFileSync('git', ['clone', bare, publisher]);
  execFileSync('git', ['config', 'user.name', 'OPL Publisher'], { cwd: publisher });
  execFileSync('git', ['config', 'user.email', 'publisher@example.invalid'], { cwd: publisher });
  fs.writeFileSync(path.join(publisher, 'source.txt'), 'remote advanced\n');
  execFileSync('git', ['add', 'source.txt'], { cwd: publisher });
  execFileSync('git', ['commit', '-m', 'remote advance'], { cwd: publisher });
  execFileSync('git', ['push', 'origin', 'main'], { cwd: publisher });

  assert.doesNotThrow(() => assertDevelopmentRepoSnapshotUnchanged(frozen));
});

test('manual latest commands and operator guide remain discoverable', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  assert.equal(
    packageJson.scripts['manual:local-app'],
    'node --experimental-strip-types scripts/manual-latest-build.ts local-app',
  );
  assert.equal(
    packageJson.scripts['manual:full-dmg'],
    'node --experimental-strip-types scripts/manual-latest-build.ts full-dmg',
  );
  assert.equal(
    fs.existsSync(path.join(appRoot, 'docs', 'delivery', 'release', 'manual-latest-builds.md')),
    true,
  );
});

test('manual build freezes KimiCU and the Codex input required by the Studio build entry', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-manual-resolved-dependencies-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const framework = path.join(root, 'framework');
  fs.mkdirSync(path.join(framework, 'scripts'), { recursive: true });
  const fixtures = [
    { dependency_id: 'kimi-cu', version: '0.7.1', source_ref: '0.7.1',
      archive_url: 'https://example.invalid/kimi.zip', archive_sha256: 'a'.repeat(64), archive_size_bytes: 10 },
    { dependency_id: 'codex-cli', version: '1.0.0', source_ref: '1.0.0',
      archive_url: 'https://example.invalid/codex.tgz', archive_sha256: 'b'.repeat(64), archive_size_bytes: 10,
      npm_integrity: 'sha512-Y29kZXg=', install_metadata: { npm_platform: {
        package: '@openai/codex-darwin-arm64', version: '1.0.0', npm_integrity: 'sha512-cGxhdGZvcm0=',
        tarball_url: 'https://example.invalid/platform.tgz', tarball_sha256: 'c'.repeat(64), tarball_size_bytes: 10,
      } } },
  ];
  fs.writeFileSync(path.join(framework, 'scripts', 'resolve-dependency-releases.mjs'), `
    import fs from 'node:fs';
    import { parseArgs } from 'node:util';
    const { values } = parseArgs({ options: {
      dependency: { type: 'string', multiple: true }, platform: { type: 'string' },
      arch: { type: 'string' }, output: { type: 'string' },
    } });
    const fixtures = ${JSON.stringify(fixtures)};
    fs.writeFileSync(values.output, JSON.stringify({
      dependencies: fixtures.filter(entry => values.dependency.includes(entry.dependency_id)),
    }));
  `);
  const result = resolveManualBuildDependencies(framework, path.join(root, 'build'));
  const manifest = JSON.parse(fs.readFileSync(result.qualificationManifestPath, 'utf8'));
  assert.equal(manifest.runtime_payloads.kimi_cu.archive_sha256, 'a'.repeat(64));
  assert.equal(manifest.runtime_payloads.codex_cli.version, '1.0.0');
  assert.equal(manifest.runtime_payloads.codex_cli.npm_integrity, 'sha512-Y29kZXg=');
  assert.equal(manifest.runtime_payloads.codex_cli.tarball_sha256, 'b'.repeat(64));
  assert.deepEqual(result.sourceLock.dependencies.map(entry => entry.dependency_id), ['kimi-cu', 'codex-cli']);
  assert.match(result.sourceLock.qualification_manifest_sha256, /^[a-f0-9]{64}$/);
});

test('manual latest build does not require the retired UI UX Pro Max companion source', () => {
  const source = fs.readFileSync(
    path.join(appRoot, 'scripts', 'manual-latest-build.ts'),
    'utf8',
  );
  assert.doesNotMatch(source, /ui-ux-pro-max|uiUxProMax|ui_ux_pro_max/);
});


test('Studio manual builds resolve native runtime ownership without an AionCore preparer', () => {
  const selected = prepareManualRuntimeDependencies('/nonexistent-aioncore-resources');
  assert.equal(selected.binding, null);
  assert.equal(selected.lock.opl_codex_native?.carrier_id, 'opl-studio');
  assert.equal(selected.lock.opl_codex_native?.embedded_codex_payload, false);
  const boundary = {
    contains_opl_full_runtime: true, contains_shell_runtime: false,
    native_codex_external_carrier_present: true, native_codex_embedded_payload_present: false,
    claude_payload_absent: true, framework_codex_payload_absent: true,
    codex_carrier_audit: { schema: 'opl_codex_native_carrier_audit.v1' },
    forbidden_framework_codex_paths: ['bin/codex', 'bin/rg', 'vendor/codex', '.runtime-cache/codex-cli'].map(path => ({ path, exists: false })),
  };
  const manifest = { carrier: { carrier_id: 'opl-studio', codex_carrier: 'opl_codex_native', aioncore_required: false },
    package_optimization: { package_boundary_audit: boundary } };
  assertFullDmgCodexCarrierBoundary(manifest);
  assert.throws(() => assertFullDmgCodexCarrierBoundary({ ...manifest, package_optimization: { package_boundary_audit: { ...boundary, contains_shell_runtime: true } } }), /Studio Full/);
  assert.throws(() => assertFullDmgCodexCarrierBoundary({ ...manifest, components: { codex: {} } }), /components.codex/);
});
