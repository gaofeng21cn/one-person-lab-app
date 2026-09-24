import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { syncAppProductProfileToShell } from '../../scripts/app-product-profile.ts';

const appRoot = path.resolve(import.meta.dirname, '..', '..');
const profileSource = path.join(appRoot, 'contracts', 'app-product-profile.json');
const helperSource = path.join(appRoot, 'scripts', 'official-profile-package-apply.ts');

function createIsolatedShell() {
  const shellRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-official-profile-shell-'));
  fs.writeFileSync(path.join(shellRoot, 'package.json'), '{"name":"isolated-shell"}\n');
  return shellRoot;
}

test('Standard and Full consumers receive one exact App-owned profile and helper projection', () => {
  const rootsByDistribution = new Map<string, string[]>();
  for (const distribution of ['standard', 'full']) {
    const shellRoot = createIsolatedShell();
    try {
      const result = syncAppProductProfileToShell(shellRoot);
      const profileTarget = result.targetPath;
      const helperTarget = path.join(shellRoot, 'resources', 'official-profile-package-apply.ts');
      assert.equal(result.synced, true, distribution);
      assert.equal(fs.readFileSync(profileTarget, 'utf8'), fs.readFileSync(profileSource, 'utf8'));
      assert.equal(fs.readFileSync(helperTarget, 'utf8'), fs.readFileSync(helperSource, 'utf8'));
      assert.doesNotThrow(() => syncAppProductProfileToShell(shellRoot, { check: true }));

      const profile = JSON.parse(fs.readFileSync(profileTarget, 'utf8'));
      assert.equal(
        profile.official_profile.distribution_forms[distribution].desired_roots_source,
        'official_profile.desired_root_package_ids'
      );
      rootsByDistribution.set(distribution, [...profile.official_profile.desired_root_package_ids]);
      assert.deepEqual(
        profile.official_profile.distribution_forms.standard.desired_roots_source,
        profile.official_profile.distribution_forms.full.desired_roots_source
      );
      assert.equal(profile.official_profile.distribution_forms.full_difference, 'offline_seed_only');
    } finally {
      fs.rmSync(shellRoot, { recursive: true, force: true });
    }
  }
  assert.deepEqual(rootsByDistribution.get('standard'), rootsByDistribution.get('full'));
});

test('source projection check fails closed when the packaged helper bytes drift', () => {
  const shellRoot = createIsolatedShell();
  try {
    syncAppProductProfileToShell(shellRoot);
    fs.appendFileSync(path.join(shellRoot, 'resources', 'official-profile-package-apply.ts'), '\n// stale helper\n');
    assert.throws(
      () => syncAppProductProfileToShell(shellRoot, { check: true }),
      /Official Profile apply helper does not match App source/
    );
  } finally {
    fs.rmSync(shellRoot, { recursive: true, force: true });
  }
});
