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
  buildManualRuntimeDependencyLock,
  resolveAioncoreManagedCodexBinding,
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

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function codexOnlyProjectionAudit() {
  return {
    schema: 'opl_aioncore_codex_only_projection_audit.v1',
    runtime_count: 1,
    runtimes: [{
      runtime_key: 'darwin-arm64',
      manifest_path:
        'Contents/Resources/bundled-aioncore/darwin-arm64/managed-resources/manifest.json',
      projection_valid: true,
      cli_names: ['codex'],
      producer_manifest_sha256: 'a'.repeat(64),
    }],
    required_absence_checks: [
      'managed_claude_subtree',
      'claude_executable_or_symlink',
      'anthropic_package_or_archive',
      'claude_distribution_cache_entry',
      'raw_producer_manifest',
    ].map((id) => ({
      id,
      matches: [],
      expected_match_count: 0,
      match_count: 0,
    })),
    projection_present: true,
    claude_payload_absent: true,
  };
}

function createAioncoreManagedCodexFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'opl-manual-aioncore-binding-'),
  );
  const shellRoot = path.join(root, 'shell');
  const runtimeRoot = path.join(
    shellRoot,
    'resources',
    'bundled-aioncore',
    'darwin-arm64',
  );
  const managedRoot = path.join(runtimeRoot, 'managed-resources');
  const nodeRoot = path.join(
    managedRoot,
    'node',
    'node-v24.11.0-darwin-arm64',
  );
  const nodeExecutable = path.join(nodeRoot, 'bin', 'node');
  const codexRoot = path.join(
    managedRoot,
    'cli',
    'codex',
    '0.144.6',
    'darwin-arm64',
  );
  const codexExecutable = path.join(
    codexRoot,
    'vendor',
    'aarch64-apple-darwin',
    'bin',
    'codex',
  );
  const codexRequiredFile = path.join(
    codexRoot,
    'vendor',
    'aarch64-apple-darwin',
    'codex-path',
    'rg',
  );
  const codexRequiredDirectory = path.join(
    codexRoot,
    'vendor',
    'aarch64-apple-darwin',
    'codex-resources',
  );
  const codexRequiredDirectoryFile = path.join(
    codexRequiredDirectory,
    'zsh',
    'bin',
    'zsh',
  );
  fs.mkdirSync(path.dirname(nodeExecutable), { recursive: true });
  fs.mkdirSync(path.dirname(codexExecutable), { recursive: true });
  fs.mkdirSync(path.dirname(codexRequiredFile), { recursive: true });
  fs.mkdirSync(path.dirname(codexRequiredDirectoryFile), { recursive: true });
  fs.writeFileSync(
    path.join(runtimeRoot, 'aioncore'),
    'aioncore fixture\n',
    'utf8',
  );
  fs.writeFileSync(nodeExecutable, 'node fixture\n', 'utf8');
  fs.writeFileSync(codexExecutable, 'codex fixture\n', 'utf8');
  fs.writeFileSync(codexRequiredFile, 'rg fixture\n', 'utf8');
  fs.writeFileSync(codexRequiredDirectoryFile, 'zsh fixture\n', 'utf8');
  writeJson(path.join(runtimeRoot, 'manifest.json'), {
    platform: 'darwin',
    arch: 'arm64',
    version: 'v0.1.49',
    sourceType: 'download',
    source: {
      url: 'https://github.com/iOfficeAI/AionCore/releases/download/v0.1.49/aioncore-fixture.tar.gz',
    },
  });
  writeJson(path.join(managedRoot, 'manifest.json'), {
    schema: 'opl_aioncore_managed_resources_projection.v1',
    runtimeKey: 'darwin-arm64',
    source: {
      schemaVersion: 2,
      manifestSha256: 'a'.repeat(64),
      cliNames: ['claude', 'codex'],
    },
    node: {
      version: '24.11.0',
      root: 'node/node-v24.11.0-darwin-arm64',
      executable: 'bin/node',
    },
    projection: {
      includedCliNames: ['codex'],
      excludedCliNames: ['claude'],
      requiredAbsentPaths: [
        'cli/claude',
        'acp',
        'node_modules/@anthropic-ai/claude-code',
        'node_modules/claude-code',
        'claude',
      ],
    },
    clis: [
      {
        name: 'codex',
        version: '0.144.6',
        root: 'cli/codex/0.144.6/darwin-arm64',
        platformDirectory: 'darwin-arm64',
        executable: 'vendor/aarch64-apple-darwin/bin/codex',
        requiredFiles: ['vendor/aarch64-apple-darwin/codex-path/rg'],
        requiredDirectories: ['vendor/aarch64-apple-darwin/codex-resources'],
      },
    ],
  });
  return {
    root,
    shellRoot,
    runtimeRoot,
    managedManifest: path.join(managedRoot, 'manifest.json'),
    nodeRoot,
    nodeExecutable,
    codexRoot,
    codexExecutable,
    codexRequiredFile,
    codexRequiredDirectory,
    codexRequiredDirectoryFile,
  };
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
  const updaterGuard = input.buildIdentity
    ? `
    <key>AIONUI_DISABLE_AUTO_UPDATE</key>
    <string>1</string>`
    : '';
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

test('manual source-lock accepts official composed Codex provenance and rejects mismatched carriers', (context) => {
  const fixture = createAioncoreManagedCodexFixture();
  context.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const manifestPath = path.join(fixture.shellRoot, 'resources', 'bundled-aioncore', 'darwin-arm64', 'managed-resources', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.source.cliNames = [];
  manifest.projection.codexSource = {package: '@openai/codex', version: '0.144.6', packageSpec: '@openai/codex@0.144.6-darwin-arm64', authority: 'official_npm_platform_package', oplVerifiedAioncoreVersion: 'v0.1.49'};
  writeJson(manifestPath, manifest);
  assert.equal(resolveAioncoreManagedCodexBinding(fixture.shellRoot).codex_cli.version, '0.144.6');
  manifest.projection.codexSource.version = '0.153.4';
  writeJson(manifestPath, manifest);
  assert.throws(() => resolveAioncoreManagedCodexBinding(fixture.shellRoot), /official Codex package/);
  delete manifest.projection.codexSource;
  writeJson(manifestPath, manifest);
  assert.throws(() => resolveAioncoreManagedCodexBinding(fixture.shellRoot), /official Codex carrier source/);
});

test('manual source-lock binds Codex to AionCore while the Full runtime stays payload-free', (context) => {
  const fixture = createAioncoreManagedCodexFixture();
  context.after(() =>
    fs.rmSync(fixture.root, { recursive: true, force: true }),
  );
  const binding = resolveAioncoreManagedCodexBinding(fixture.shellRoot);
  const dependencyLock = buildManualRuntimeDependencyLock(binding);

  assert.equal(binding.schema, 'opl_manual_aioncore_codex_only_projection_binding.v1');
  assert.equal(binding.aioncore.version, 'v0.1.49');
  assert.equal(
    binding.managed_resources.projection_schema,
    'opl_aioncore_managed_resources_projection.v1',
  );
  assert.equal(binding.managed_resources.producer_schema_version, 2);
  assert.equal(binding.managed_resources.producer_manifest_sha256, 'a'.repeat(64));
  assert.deepEqual(binding.managed_resources.included_cli_names, ['codex']);
  assert.deepEqual(binding.managed_resources.excluded_cli_names, ['claude']);
  assert.equal(binding.node_runtime.version, '24.11.0');
  assert.equal(binding.node_runtime.root, fs.realpathSync(fixture.nodeRoot));
  assert.equal(binding.codex_cli.version, '0.144.6');
  assert.equal(binding.codex_cli.root, fs.realpathSync(fixture.codexRoot));
  assert.match(binding.aioncore.root_manifest_sha256, /^[a-f0-9]{64}$/);
  assert.match(binding.managed_resources.manifest_sha256, /^[a-f0-9]{64}$/);
  assert.match(binding.node_runtime.executable_sha256, /^[a-f0-9]{64}$/);
  assert.match(binding.codex_cli.executable_sha256, /^[a-f0-9]{64}$/);
  assert.match(binding.codex_cli.required_files[0].sha256, /^[a-f0-9]{64}$/);
  assert.match(binding.codex_cli.required_directories[0].tree_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(dependencyLock.aioncore_managed_codex, binding);
  assert.doesNotThrow(() =>
    assertFullDmgCodexCarrierBoundary({
      components: {},
      package_optimization: {
        package_boundary_audit: {
          aioncore_codex_carrier_present: true,
          aioncore_codex_only_projection_present: true,
          aioncore_claude_payload_absent: true,
          aioncore_codex_only_projection_audit: codexOnlyProjectionAudit(),
          framework_codex_payload_absent: true,
          forbidden_framework_codex_paths: [
            { path: 'bin/codex', exists: false },
            { path: 'bin/rg', exists: false },
            { path: 'vendor/codex', exists: false },
            { path: '.runtime-cache/codex-cli', exists: false },
          ],
        },
      },
    }),
  );
  assert.throws(
    () =>
      assertFullDmgCodexCarrierBoundary({
        components: {
          codex: {
            source_path: fixture.codexRoot,
            version: 'codex-cli 0.144.6',
          },
        },
      }),
    /must not contain components\.codex/,
  );
  assert.throws(
    () =>
      assertFullDmgCodexCarrierBoundary({
        components: {},
        package_optimization: {
          package_boundary_audit: {
            aioncore_codex_carrier_present: true,
            aioncore_codex_only_projection_present: true,
            aioncore_claude_payload_absent: true,
            aioncore_codex_only_projection_audit: codexOnlyProjectionAudit(),
            framework_codex_payload_absent: false,
            forbidden_framework_codex_paths: [
              { path: 'bin/codex', exists: true },
              { path: 'bin/rg', exists: false },
              { path: 'vendor/codex', exists: false },
              { path: '.runtime-cache/codex-cli', exists: false },
            ],
          },
        },
      }),
    /both Claude and Framework Codex payloads are absent/,
  );
  const incompleteProjectionAudit = codexOnlyProjectionAudit();
  incompleteProjectionAudit.required_absence_checks[0].match_count = 1;
  incompleteProjectionAudit.required_absence_checks[0].matches = [
    'darwin-arm64/managed-resources/cli/claude',
  ];
  assert.throws(
    () =>
      assertFullDmgCodexCarrierBoundary({
        components: {},
        package_optimization: {
          package_boundary_audit: {
            aioncore_codex_carrier_present: true,
            aioncore_codex_only_projection_present: true,
            aioncore_claude_payload_absent: true,
            aioncore_codex_only_projection_audit: incompleteProjectionAudit,
            framework_codex_payload_absent: true,
            forbidden_framework_codex_paths: [
              { path: 'bin/codex', exists: false },
              { path: 'bin/rg', exists: false },
              { path: 'vendor/codex', exists: false },
              { path: '.runtime-cache/codex-cli', exists: false },
            ],
          },
        },
      }),
    /Codex-only projection evidence is incomplete/,
  );
});

test('manual AionCore Codex binding rejects incomplete, ambiguous, escaped, or drifted inputs', async (context) => {
  await context.test('missing managed Node executable', () => {
    const fixture = createAioncoreManagedCodexFixture();
    try {
      fs.rmSync(fixture.nodeExecutable);
      assert.throws(
        () => resolveAioncoreManagedCodexBinding(fixture.shellRoot),
        /Node executable is missing/,
      );
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  await context.test('retired ACP truth', () => {
    const fixture = createAioncoreManagedCodexFixture();
    try {
      const manifest = JSON.parse(
        fs.readFileSync(fixture.managedManifest, 'utf8'),
      );
      manifest.acpTools = [];
      writeJson(fixture.managedManifest, manifest);
      assert.throws(
        () => resolveAioncoreManagedCodexBinding(fixture.shellRoot),
        /must not retain retired acpTools truth/,
      );
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  await context.test('unexpected direct CLI', () => {
    const fixture = createAioncoreManagedCodexFixture();
    try {
      const manifest = JSON.parse(
        fs.readFileSync(fixture.managedManifest, 'utf8'),
      );
      manifest.clis.push({ ...manifest.clis[0], name: 'other' });
      writeJson(fixture.managedManifest, manifest);
      assert.throws(
        () => resolveAioncoreManagedCodexBinding(fixture.shellRoot),
        /must contain exactly one Codex direct CLI/,
      );
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  await context.test('raw producer manifest is not a distributed projection', () => {
    const fixture = createAioncoreManagedCodexFixture();
    try {
      const manifest = JSON.parse(
        fs.readFileSync(fixture.managedManifest, 'utf8'),
      );
      delete manifest.schema;
      manifest.schemaVersion = 2;
      writeJson(fixture.managedManifest, manifest);
      assert.throws(
        () => resolveAioncoreManagedCodexBinding(fixture.shellRoot),
        /must use the OPL Codex-only projection schema v1/,
      );
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  await context.test('Claude projection metadata drift', () => {
    const fixture = createAioncoreManagedCodexFixture();
    try {
      const manifest = JSON.parse(
        fs.readFileSync(fixture.managedManifest, 'utf8'),
      );
      manifest.projection.excludedCliNames = [];
      writeJson(fixture.managedManifest, manifest);
      assert.throws(
        () => resolveAioncoreManagedCodexBinding(fixture.shellRoot),
        /must include only Codex and exclude Claude/,
      );
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  await context.test('Claude subtree is physically present', () => {
    const fixture = createAioncoreManagedCodexFixture();
    try {
      fs.mkdirSync(
        path.join(
          fixture.runtimeRoot,
          'managed-resources',
          'cli',
          'claude',
        ),
        { recursive: true },
      );
      assert.throws(
        () => resolveAioncoreManagedCodexBinding(fixture.shellRoot),
        /required absent path is present/,
      );
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  await context.test('Codex root symlink escape', () => {
    const fixture = createAioncoreManagedCodexFixture();
    try {
      const escapedRoot = path.join(fixture.root, 'escaped-codex-root');
      fs.renameSync(fixture.codexRoot, escapedRoot);
      fs.symlinkSync(escapedRoot, fixture.codexRoot, 'dir');
      assert.throws(
        () => resolveAioncoreManagedCodexBinding(fixture.shellRoot),
        /codex CLI root escapes/,
      );
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  await context.test('Codex version and root drift', () => {
    const fixture = createAioncoreManagedCodexFixture();
    try {
      const manifest = JSON.parse(
        fs.readFileSync(fixture.managedManifest, 'utf8'),
      );
      manifest.clis.find((entry) => entry.name === 'codex').version = '0.143.0';
      writeJson(fixture.managedManifest, manifest);
      assert.throws(
        () => resolveAioncoreManagedCodexBinding(fixture.shellRoot),
        /root must match its exact version and platform/,
      );
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  await context.test('required file and directory content drift change the source-lock binding', () => {
    const fixture = createAioncoreManagedCodexFixture();
    try {
      const before = resolveAioncoreManagedCodexBinding(fixture.shellRoot);
      fs.writeFileSync(fixture.codexRequiredFile, 'rg changed\n', 'utf8');
      fs.writeFileSync(fixture.codexRequiredDirectoryFile, 'zsh changed\n', 'utf8');
      const after = resolveAioncoreManagedCodexBinding(fixture.shellRoot);
      assert.notEqual(
        after.codex_cli.required_files[0].sha256,
        before.codex_cli.required_files[0].sha256,
      );
      assert.notEqual(
        after.codex_cli.required_directories[0].tree_sha256,
        before.codex_cli.required_directories[0].tree_sha256,
      );
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
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
    manualAppLaunchArgs(appPath, { AIONUI_CDP_PORT: '9230' }),
    ['--env', 'AIONUI_CDP_PORT=9230', appPath],
  );
  assert.throws(
    () => manualAppLaunchArgs(appPath, { AIONUI_CDP_PORT: '65536' }),
    /Invalid AIONUI_CDP_PORT/,
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

test('manual latest build does not require the retired UI UX Pro Max companion source', () => {
  const source = fs.readFileSync(
    path.join(appRoot, 'scripts', 'manual-latest-build.ts'),
    'utf8',
  );
  assert.doesNotMatch(source, /ui-ux-pro-max|uiUxProMax|ui_ux_pro_max/);
});
