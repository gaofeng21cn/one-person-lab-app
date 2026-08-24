import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertFrozenReleaseAssets,
  buildAdditiveRepairPlan,
  buildAppendPlan,
  mergeDesktopPlatformManifest,
  validateDesktopPlatformManifest,
  validateDesktopReleaseSetManifest,
} from '../../scripts/append-stable-desktop-assets.ts';

const release = {
  id: 1,
  tag_name: 'v26.8.4',
  target_commitish: 'a'.repeat(40),
  draft: false,
  prerelease: false,
  immutable: false,
  body: 'Stable release',
  assets: [
    { id: 10, name: 'mac.dmg', size: 3, digest: `sha256:${'1'.repeat(64)}` },
    { id: 11, name: 'opl-install.sh', size: 4, digest: `sha256:${'2'.repeat(64)}` },
  ],
};

const desktopIdentity = {
  release: { version: '26.8.22', updater_version: '26.8.220' },
  source: { run_id: '100', bundle_digest: `sha256:${'a'.repeat(64)}` },
  cohort: { app_sha: '1'.repeat(40), shell_sha: '2'.repeat(40), framework_sha: '3'.repeat(40) },
};

const linuxAsset = {
  name: 'One-Person-Lab-26.8.22-linux-x64.deb',
  size: 4,
  digest: `sha256:${'4'.repeat(64)}`,
};

const windowsAssets = [
  { name: 'One-Person-Lab-26.8.22-win-x64.exe', size: 5, digest: `sha256:${'5'.repeat(64)}` },
  { name: 'One-Person-Lab-26.8.22-win-x64.exe.blockmap', size: 6, digest: `sha256:${'6'.repeat(64)}` },
  { name: 'latest.yml', size: 7, digest: `sha256:${'7'.repeat(64)}` },
  { name: 'opl-windows-updater-assets.json', size: 8, digest: `sha256:${'8'.repeat(64)}` },
];

test('same-tag Desktop append plans only missing exact assets', () => {
  const missing = { name: 'linux.deb', size: 4, digest: `sha256:${'2'.repeat(64)}`, source_path: '/tmp/linux.deb' };
  const complete = { ...release.assets[0], source_path: '/tmp/mac.dmg' };
  const plan = buildAppendPlan(release, [complete, missing]);
  assert.deepEqual(plan.upload, [missing]);
  assert.deepEqual(plan.already_complete, [complete]);
});

test('same-name different bytes fail closed', () => {
  assert.throws(
    () => buildAppendPlan(release, [{
      name: 'mac.dmg', size: 4, digest: `sha256:${'3'.repeat(64)}`, source_path: '/tmp/mac.dmg',
    }]),
    /asset conflict/,
  );
});

test('independent Desktop platform manifests merge without rebuilding the completed platform', () => {
  const linux = validateDesktopPlatformManifest({
    schema: 'opl_app_desktop_platform_manifest.v1',
    ...desktopIdentity,
    platform: 'linux-x64',
    assets: [linuxAsset],
  }, [linuxAsset]);
  const windows = validateDesktopPlatformManifest({
    schema: 'opl_app_desktop_platform_manifest.v1',
    ...desktopIdentity,
    platform: 'windows-x64',
    assets: windowsAssets,
  }, windowsAssets);

  const first = mergeDesktopPlatformManifest(null, windows);
  assert.equal(first.changed, true);
  assert.deepEqual(first.manifest.platforms, ['windows-x64']);
  const complete = mergeDesktopPlatformManifest(first.manifest, linux);
  assert.equal(complete.changed, true);
  assert.deepEqual(complete.manifest.platforms, ['linux-x64', 'windows-x64']);
  assert.deepEqual(complete.manifest.assets.map((asset) => asset.name), [linuxAsset, ...windowsAssets]
    .map((asset) => asset.name).sort());
  assert.equal(mergeDesktopPlatformManifest(complete.manifest, linux).changed, false);
  assert.doesNotThrow(() => validateDesktopReleaseSetManifest(complete.manifest));
});

test('Desktop platform reconcile rejects cohort drift and same-platform byte drift', () => {
  const linux = validateDesktopPlatformManifest({
    schema: 'opl_app_desktop_platform_manifest.v1',
    ...desktopIdentity,
    platform: 'linux-x64',
    assets: [linuxAsset],
  }, [linuxAsset]);
  const existing = mergeDesktopPlatformManifest(null, linux).manifest;
  const driftedBytes = {
    ...linux,
    assets: [{ ...linuxAsset, digest: `sha256:${'9'.repeat(64)}` }],
  };
  assert.throws(() => mergeDesktopPlatformManifest(existing, driftedBytes), /conflicts with the requested bytes/);
  assert.throws(() => mergeDesktopPlatformManifest(existing, {
    ...linux,
    platform: 'windows-x64',
    cohort: { ...linux.cohort, framework_sha: '4'.repeat(40) },
    assets: windowsAssets,
  }), /cohort conflicts/);
});

test('additive repair replaces only the exact current universal installer', () => {
  const replacement = {
    name: 'opl-install.sh',
    size: 5,
    digest: `sha256:${'3'.repeat(64)}`,
    source_path: '/tmp/opl-install.sh',
  };
  const plan = buildAdditiveRepairPlan(release, replacement, {
    id: 11,
    name: 'opl-install.sh',
    size: 4,
    digest: `sha256:${'2'.repeat(64)}`,
  });
  assert.equal(plan.current.id, 11);
  assert.equal(plan.replacement, replacement);
});

test('additive repair rejects non-allowlisted assets and stale compare-and-swap inputs', () => {
  assert.throws(
    () => buildAdditiveRepairPlan(release, {
      name: 'mac.dmg', size: 5, digest: `sha256:${'3'.repeat(64)}`, source_path: '/tmp/mac.dmg',
    }, {
      id: 10, name: 'mac.dmg', size: 3, digest: `sha256:${'1'.repeat(64)}`,
    }),
    /not allowed/,
  );
  assert.throws(
    () => buildAdditiveRepairPlan(release, {
      name: 'opl-install.sh', size: 5, digest: `sha256:${'3'.repeat(64)}`, source_path: '/tmp/opl-install.sh',
    }, {
      id: 99, name: 'opl-install.sh', size: 4, digest: `sha256:${'2'.repeat(64)}`,
    }),
    /compare-and-swap mismatch/,
  );
});

test('additive repair rejects unchanged bytes', () => {
  assert.throws(
    () => buildAdditiveRepairPlan(release, {
      name: 'opl-install.sh', size: 4, digest: `sha256:${'2'.repeat(64)}`, source_path: '/tmp/opl-install.sh',
    }, {
      id: 11, name: 'opl-install.sh', size: 4, digest: `sha256:${'2'.repeat(64)}`,
    }),
    /unchanged bytes/,
  );
});

test('frozen primary assets reject drift, invalid identity, and duplicate names', () => {
  assert.doesNotThrow(() => assertFrozenReleaseAssets(release, [release.assets[0]]));
  assert.throws(
    () => assertFrozenReleaseAssets(release, [{ ...release.assets[0], size: 4 }]),
    /primary asset drift/,
  );
  assert.throws(
    () => assertFrozenReleaseAssets(release, [{ ...release.assets[0], digest: 'invalid' }]),
    /identity is invalid/,
  );
  assert.throws(
    () => assertFrozenReleaseAssets(release, [release.assets[0], release.assets[0]]),
    /duplicate names/,
  );
});
