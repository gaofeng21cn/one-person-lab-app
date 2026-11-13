import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { run, runCapture } from '../../../scripts/build-full-first-install-package/process.ts';
import { resolveFullDmgFormat, resolveFullDmgCompressionLevel } from '../../../scripts/build-full-first-install-package/archive-output.ts';
import { assertAppBundleLocalAuthorization, ensureAppBundleAdHocCodesign } from '../../../scripts/build-full-first-install-package/macos-trust.ts';

test('Full workflow reports absent or invalid stage timestamps as unavailable in JSON and summary', () => {
  const workflow = fs.readFileSync(fileURLToPath(new URL('../../../.github/workflows/full-first-install-release.yml', import.meta.url)), 'utf8');
  const scripts = [...workflow.matchAll(/node - "\$telemetry_path" <<'NODE'\n([\s\S]*?)\n          NODE/g)]
    .map((match) => match[1].replace(/^          /gm, '').replace(/\$\{\{[\s\S]*?\}\}/g, 'fixture'));
  assert.equal(scripts.length, 2);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-workflow-timing-'));
  const output = path.join(temp, 'full-workflow-telemetry.json');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OPL_FULL_')));
  try {
    for (const [start, end, expected] of [
      ['1794187329', undefined, null],
      [undefined, '1794187339', null],
      ['1794187329', '', null],
      ['1794187329', ' ', null],
      ['invalid', '1794187339', null],
      ['1794187329', 'Infinity', null],
      ['1794187339', '1794187329', null],
      ['-1', '1794187339', null],
      ['1794187329', '1794187329', 0],
      ['1794187329', '1794187339', 10],
    ] as const) {
      const timestamps = Object.fromEntries([
        ['OPL_FULL_PACKAGE_READY_AT', start], ['OPL_FULL_VERIFY_READY_AT', end],
      ].filter((entry): entry is [string, string] => entry[1] !== undefined));
      const recorded = spawnSync(process.execPath, ['-', output], { input: scripts[0], encoding: 'utf8', env: { ...env, ...timestamps } });
      assert.equal(recorded.status, 0, recorded.stderr);
      const report = JSON.parse(fs.readFileSync(output, 'utf8'));
      assert.equal(report.duration_seconds.checksum_signing_verify, expected, `${start} -> ${end}`);
      assert.equal(report.duration_seconds.toolchain_install, null);
      const summary = spawnSync(process.execPath, ['-', output], { input: scripts[1], encoding: 'utf8', env });
      assert.equal(summary.status, 0, summary.stderr);
      assert.ok(summary.stdout.includes(`| Full checksum/signing verify | ${expected === null ? 'n/a' : `${expected}s`} |`));
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

function captureEvents(action: () => void) {
  const events: Record<string, unknown>[] = [];
  const original = console.error;
  console.error = (line: string) => { events.push(JSON.parse(line)); };
  try { action(); } finally { console.error = original; }
  return events;
}

test('captured Full commands expose start and completion without leaking arguments or output', () => {
  const events = captureEvents(() => {
    const result = runCapture(process.execPath, ['-e', 'console.log("private-output")'], { stage: 'full_dmg_compression' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), 'private-output');
  });
  assert.deepEqual(events.map(({ stage, status }) => ({ stage, status })), [
    { stage: 'full_dmg_compression', status: 'started' },
    { stage: 'full_dmg_compression', status: 'completed' },
  ]);
  assert.equal(events[1].exit_code, 0);
  assert.ok(Number(events[1].duration_seconds) >= 0);
  assert.doesNotMatch(JSON.stringify(events), /private-output|console.log/);
});

test('failed and missing Full commands emit failure instead of completed progress', () => {
  const events = captureEvents(() => {
    assert.throws(() => run(process.execPath, ['-e', 'process.exit(9)'], { capture: true, stage: 'full_codesign_sign' }), /Command failed/);
    const missing = runCapture('/nonexistent/opl-full-observation-command', [], { stage: 'full_dmg_compression' });
    assert.equal(missing.status, null);
  });
  assert.deepEqual(events.map(({ status }) => status), ['started', 'failed', 'started', 'failed']);
  assert.equal(events[1].exit_code, 9);
  assert.equal(events[3].error_code, 'ENOENT');
});

test('Full pre-notarization strict verification skips unused spctl but still rejects broken signatures', { skip: process.platform !== 'darwin' }, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-signing-observation-'));
  const previous = { PATH: process.env.PATH, strict: process.env.OPL_MAC_STRICT_SIGNING_CHECKS, fail: process.env.OPL_TEST_FAIL_SIGNATURE };
  fs.writeFileSync(path.join(temp, 'codesign'), `#!/bin/sh
if [ "$1" = "-dv" ]; then
  printf '%s\\n' 'Authority=Developer ID Application: Test Fixture (TESTTEAM)' 'TeamIdentifier=TESTTEAM' >&2
  exit 0
fi
for arg in "$@"; do
  if [ "$arg" = "--verbose=2" ]; then head -c 2097152 /dev/zero >&2; fi
done
if [ "$OPL_TEST_FAIL_SIGNATURE" = "1" ]; then exit 2; fi
exit 0
`, { mode: 0o755 });
  fs.writeFileSync(path.join(temp, 'spctl'), '#!/bin/sh\ntouch "' + path.join(temp, 'spctl-called') + '"\nexit 1\n', { mode: 0o755 });
  process.env.PATH = `${temp}${path.delimiter}${previous.PATH ?? ''}`;
  process.env.OPL_MAC_STRICT_SIGNING_CHECKS = 'true';
  try {
    const events = captureEvents(() => assertAppBundleLocalAuthorization('/fixture/Test.app', 'Full fixture'));
    assert.equal(fs.existsSync(path.join(temp, 'spctl-called')), false);
    assert.deepEqual(events.filter(({ status }) => status === 'completed').map(({ stage }) => stage), ['full_codesign_verify', 'full_codesign_identity']);
    process.env.OPL_TEST_FAIL_SIGNATURE = '1';
    captureEvents(() => assert.throws(() => assertAppBundleLocalAuthorization('/fixture/Test.app', 'Full fixture'), /failed Developer ID signing verification/));
    delete process.env.OPL_TEST_FAIL_SIGNATURE;
    process.env.OPL_MAC_STRICT_SIGNING_CHECKS = 'false';
    captureEvents(() => assertAppBundleLocalAuthorization('/fixture/Test.app', 'Full fixture'));
    assert.equal(fs.existsSync(path.join(temp, 'spctl-called')), true);
  } finally {
    for (const [name, value] of [['PATH', previous.PATH], ['OPL_MAC_STRICT_SIGNING_CHECKS', previous.strict], ['OPL_TEST_FAIL_SIGNATURE', previous.fail]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('mutated staged App signs once and performs one strict verification of the resulting identity', { skip: process.platform !== 'darwin' }, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-final-sign-'));
  const previous = { ...process.env };
  fs.writeFileSync(path.join(temp, 'codesign'), `#!/bin/sh
if [ "$1" = "-dv" ]; then
  if [ "$OPL_TEST_WRONG_SIGNER" = "1" ]; then
    printf '%s\\n' 'Signature=adhoc' >&2
  else
    printf '%s\\n' 'Authority=Developer ID Application: Test (TESTTEAM)' 'TeamIdentifier=TESTTEAM' >&2
  fi
fi
exit 0
`, { mode: 0o755 });
  process.env.PATH = `${temp}${path.delimiter}${previous.PATH ?? ''}`;
  process.env.OPL_MAC_STRICT_SIGNING_CHECKS = 'true';
  process.env.OPL_RUNTIME_CODESIGN_IDENTITY = 'fixture';
  try {
    const events = captureEvents(() => ensureAppBundleAdHocCodesign('/fixture/App.app', 'Final App', { force: true }));
    assert.deepEqual(events.filter(({ status }) => status === 'completed').map(({ stage }) => stage),
      ['full_codesign_sign', 'full_codesign_verify', 'full_codesign_identity']);
    process.env.OPL_TEST_WRONG_SIGNER = '1';
    captureEvents(() => assert.throws(() => ensureAppBundleAdHocCodesign('/fixture/App.app', 'Final App', { force: true }), /Developer ID signing verification/));
  } finally {
    for (const key of ['PATH', 'OPL_MAC_STRICT_SIGNING_CHECKS', 'OPL_RUNTIME_CODESIGN_IDENTITY', 'OPL_TEST_WRONG_SIGNER']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Full entry consumes the creator-verified DMG without a second unchanged-byte authorization pass', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../../../scripts/build-full-first-install-package.ts', import.meta.url)), 'utf8');
  const compression = source.slice(source.indexOf("timing.start('dmg_package_compression')"), source.indexOf("timing.start('manifest_checksum')"));
  assert.equal((compression.match(/createFullDmgFromVerifiedApp\(/g) ?? []).length, 1);
  assert.doesNotMatch(compression, /ensureAppBundleAdHocCodesign|ensureFullDmgLocalAuthorization|fs\.(?:write|copy|cp|rename)/);
  const creator = fs.readFileSync(fileURLToPath(new URL('../../../scripts/build-full-first-install-package/archive-output.ts', import.meta.url)), 'utf8');
  const create = creator.slice(creator.indexOf('export function createFullDmgFromVerifiedApp'), creator.indexOf('export function resolveFullDmgFormat'));
  assert.ok(create.indexOf('ensureAppBundleAdHocCodesign(stagedApp') > create.indexOf('writeFullPackageManifestIntoApp(stagedApp'));
  assert.ok(create.indexOf('verifyDmgAppBundleLocalAuthorization(targetDmg') > create.indexOf('createDmgWithResourceBusyRetry(targetDmg'));
});


test('Full compression favors size by default and retains explicit overrides', () => {
  const keys = ['OPL_FULL_DMG_FORMAT', 'OPL_FULL_DMG_COMPRESSION_LEVEL', 'ELECTRON_BUILDER_COMPRESSION_LEVEL', 'CI'];
  const previous = keys.map((key) => [key, process.env[key]]);
  const contract = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../../contracts/app-release-channel.json', import.meta.url)), 'utf8'));
  try {
    for (const key of keys) delete process.env[key];
    process.env.CI = 'true';
    assert.equal(resolveFullDmgFormat(), contract.release_acceleration.full_dmg_compression.default_ci_format);
    assert.equal(resolveFullDmgFormat(), 'ULMO');
    assert.equal(resolveFullDmgCompressionLevel(), contract.release_acceleration.full_dmg_compression.default_ci_level);
    process.env.OPL_FULL_DMG_FORMAT = 'ULMO';
    assert.equal(resolveFullDmgFormat(), 'ULMO');
    process.env.OPL_FULL_DMG_FORMAT = 'UDZO';
    process.env.OPL_FULL_DMG_COMPRESSION_LEVEL = '9';
    assert.equal(resolveFullDmgCompressionLevel(), '9');
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
