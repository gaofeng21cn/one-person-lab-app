import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

test('Full finalizers unlock the signing keychain and stop before notarization if unlock fails', () => {
  const workflow = parse(fs.readFileSync('.github/workflows/full-first-install-release.yml', 'utf8'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-keychain-'));
  try {
    const trace = path.join(root, 'trace');
    fs.writeFileSync(path.join(root, 'security'), '#!/bin/sh\nprintf "%s\\n" "$1" >> "$KEYCHAIN_TEST_TRACE"\nif [ "$1" = unlock-keychain ] && [ "$KEYCHAIN_TEST_FAIL" = 1 ]; then exit 7; fi\n', { mode: 0o755 });
    for (const job of Object.values(workflow.jobs) as any[]) {
      const setup = job.steps?.find((step: any) => step.run?.includes('security create-keychain'));
      if (!setup) continue;
      assert.match(setup.run, /security set-keychain-settings -lut 21600 .*opl-build\.keychain-db/);
      const finalizer = job.steps.find((step: any) => step.name.startsWith('Finalize Full Developer ID'));
      assert.ok(finalizer.env.KEYCHAIN_PASSWORD);
      const notarizeMarker = 'node --experimental-strip-types "$GITHUB_WORKSPACE/release-executor/scripts/notarize-macos-dmg.ts"';
      const prefix = finalizer.run.slice(0, finalizer.run.indexOf(notarizeMarker));
      for (const fail of ['0', '1']) {
        fs.writeFileSync(trace, '');
        const result = spawnSync('bash', ['-c', `${prefix}\nprintf 'notarize\\n' >> "$KEYCHAIN_TEST_TRACE"`], {
          encoding: 'utf8', env: { ...process.env, PATH: `${root}:${process.env.PATH}`, OPL_MAC_STRICT_SIGNING_CHECKS: 'true',
            KEYCHAIN_PASSWORD: 'test-only', KEYCHAIN_TEST_TRACE: trace, KEYCHAIN_TEST_FAIL: fail,
            RUNNER_TEMP: root, RUNNER_ENVIRONMENT: 'github-hosted' },
        });
        const calls = fs.readFileSync(trace, 'utf8').trim().split('\n');
        assert.equal(result.status, fail === '1' ? 7 : 0, result.stderr);
        assert.deepEqual(calls, fail === '1' ? ['unlock-keychain'] : ['unlock-keychain', 'default-keychain', 'list-keychains', 'notarize']);
      }
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('candidate and normal Full paths verify embedded signatures and outer Gatekeeper trust consistently', () => {
  const workflow = parse(fs.readFileSync('.github/workflows/full-first-install-release.yml', 'utf8'));
  for (const job of Object.values(workflow.jobs) as any[]) {
    const verification = job.steps?.find((step: any) => step.run?.includes('spctl --assess --type execute --verbose=4 "$mounted_app_path"'));
    if (!verification) continue;
    const nativeCall = verification.run.match(/node --experimental-strip-types [^\n]*verify-full-runtime-native-trust\.ts[\s\S]*?--output [^\n]+/);
    assert.ok(nativeCall);
    assert.match(nativeCall[0], /--expected-team-id/);
    assert.doesNotMatch(nativeCall[0], /--require-spctl/);
    assert.match(verification.run, /codesign --verify --deep --strict/);
    assert.match(verification.run, /stapler validate/);
  }
});

test('Standard notarization stores credentials in the temporary build keychain before waiting', () => {
  const workflow = parse(fs.readFileSync('.github/workflows/_build-reusable.yml', 'utf8'));
  const finalizer = (workflow.jobs.build.steps as any[]).find(
    (step) => step.name === 'Finalize Standard Developer ID signing and notarization',
  );
  assert.equal(finalizer.env.OPL_NOTARYTOOL_KEYCHAIN_PROFILE, 'opl-release-notary');
  assert.equal(finalizer.env.OPL_NOTARYTOOL_KEYCHAIN, '${{ runner.temp }}/opl-build.keychain-db');
  assert.match(finalizer.run, /printf '%s\\n' "\$appleIdPassword" \\| xcrun notarytool store-credentials/);
  assert.match(finalizer.run, /xcrun notarytool store-credentials "\$OPL_NOTARYTOOL_KEYCHAIN_PROFILE"/);
  assert.match(finalizer.run, /--keychain "\$RUNNER_TEMP\/opl-build\.keychain-db"/);
  assert.match(finalizer.run, /--no-validate/);
  assert.doesNotMatch(finalizer.run, /--password "\$appleIdPassword"/);
  assert.match(finalizer.run, /unset appleId appleIdPassword/);
  assert.match(finalizer.run, /node --experimental-strip-types scripts\/notarize-macos-dmg\.ts/);
});

test('verified Full carriers survive diagnostic failures and signed candidates need no local authorization attachment', () => {
  const workflow = parse(fs.readFileSync('.github/workflows/full-first-install-release.yml', 'utf8'));
  const steps = workflow.jobs['full-first-install'].steps;
  const verify = steps.find((step: any) => step.name === 'Verify Full package checksums and distribution trust');
  assert.equal(verify.id, 'full_package_verify');
  const policy = steps.find((step: any) => step.name === 'Upload Full local authorization policy');
  assert.match(policy.if, /!inputs\.candidate_only/);
  for (const name of ['Write Full build artifact cohort manifest', 'Upload Full package workflow artifact', 'Upload Full build artifact cohort manifest', 'Upload Full DMG-only workflow artifact']) {
    const step = steps.find((item: any) => item.name === name);
    assert.match(step.if, /always\(\)/);
    assert.match(step.if, /steps\.full_package_verify\.outcome == 'success'/);
  }
});
