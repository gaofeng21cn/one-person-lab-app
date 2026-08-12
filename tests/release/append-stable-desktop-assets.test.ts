import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertFrozenReleaseAssets,
  buildAdditiveRepairPlan,
  buildAppendPlan,
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
