import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { run, runCapture } from '../../../scripts/build-full-first-install-package/process.ts';
import { assertAppBundleLocalAuthorization } from '../../../scripts/build-full-first-install-package/macos-trust.ts';

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

test('Full entry consumes the creator-verified DMG without a second unchanged-byte authorization pass', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../../../scripts/build-full-first-install-package.ts', import.meta.url)), 'utf8');
  const compression = source.slice(source.indexOf('const packageCompressionStartedAt'), source.indexOf('const manifestChecksumStartedAt'));
  assert.equal((compression.match(/createFullDmgFromVerifiedApp\(/g) ?? []).length, 1);
  assert.doesNotMatch(compression, /ensureAppBundleAdHocCodesign|ensureFullDmgLocalAuthorization|fs\.(?:write|copy|cp|rename)/);
  const creator = fs.readFileSync(fileURLToPath(new URL('../../../scripts/build-full-first-install-package/archive-output.ts', import.meta.url)), 'utf8');
  const create = creator.slice(creator.indexOf('export function createFullDmgFromVerifiedApp'), creator.indexOf('export function resolveFullDmgFormat'));
  assert.ok(create.indexOf('ensureAppBundleAdHocCodesign(stagedApp') > create.indexOf('writeFullPackageManifestIntoApp(stagedApp'));
  assert.ok(create.indexOf('verifyDmgAppBundleLocalAuthorization(targetDmg') > create.indexOf('createDmgWithResourceBusyRetry(targetDmg'));
});
