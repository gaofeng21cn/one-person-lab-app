import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { stringify } from 'yaml';
import {
  validateCandidate, updaterExpression, assertPreserved, wslIdentityExpression,
} from '../../tools/vm/windows-updater-driver.mjs';

const sha = (data, alg = 'sha256', encoding = 'hex') => createHash(alg).update(data).digest(encoding);
test('rejects metadata or predecessor bytes different from the immutable candidate', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-windows-driver-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const candidate = Buffer.from('exact candidate fixture');
  const baseline = Buffer.from('exact predecessor fixture');
  const name = 'One-Person-Lab-26.9.24-win-x64.exe';
  fs.writeFileSync(path.join(root, name), candidate);
  fs.writeFileSync(path.join(root, 'baseline.exe'), baseline);
  fs.writeFileSync(path.join(root, `${name}.blockmap`), 'blockmap');
  const metadata = { version: '26.9.2401', path: name, sha512: sha(candidate, 'sha512', 'base64'),
    files: [{ url: name, size: candidate.length, sha512: sha(candidate, 'sha512', 'base64') }] };
  fs.writeFileSync(path.join(root, 'latest.yml'), stringify(metadata));
  const input = { feedDirectory: root, predecessorInstaller: path.join(root, 'baseline.exe'),
    candidateInstaller: path.join(root, name), candidateSha256: sha(candidate),
    predecessorSha256: sha(baseline), candidateAsarSha256: 'a'.repeat(64), targetVersion: metadata.version };
  assert.equal(validateCandidate(input).installerSha256, sha(candidate));
  metadata.files[0].url = 'https://example.test/substitution.exe';
  fs.writeFileSync(path.join(root, 'latest.yml'), stringify(metadata));
  assert.throws(() => validateCandidate(input));
  fs.writeFileSync(path.join(root, 'baseline.exe'), 'different baseline');
  assert.throws(() => validateCandidate(input), /predecessor installer drift/);
});

test('native updater uses exact loopback feed, waits for downloaded bytes and schedules real install', async () => {
  const calls = [];
  let deferred;
  const updater = { setFeedURL: value => calls.push(['feed', value]),
    checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo: { version: '26.9.2401' } }),
    downloadUpdate: async () => ['candidate.exe'], quitAndInstall: (...args) => calls.push(['install', ...args]) };
  const app = { isReady: () => true, isPackaged: true, getVersion: () => '26.9.2301' };
  const load = name => ({ electron: { app }, 'electron-updater': { autoUpdater: updater },
    'node:fs': { readFileSync: () => Buffer.from('candidate') }, 'node:path': path, 'node:crypto': { createHash } })[name];
  const context = { process: { getBuiltinModule: () => ({ createRequire: () => load }) },
    setTimeout: callback => { deferred = callback; } };
  const exe = 'C:\\Users\\oplrunner\\AppData\\Local\\Programs\\One Person Lab\\One Person Lab.exe';
  const check = await vm.runInNewContext(updaterExpression(exe, 'http://127.0.0.1:1234/', 'check'), context);
  assert.equal(check.available, true);
  const files = await vm.runInNewContext(updaterExpression(exe, 'http://127.0.0.1:1234/', 'download'), context);
  assert.equal(files[0].sha256, sha('candidate'));
  await vm.runInNewContext(updaterExpression(exe, 'http://127.0.0.1:1234/', 'install'), context);
  assert.equal(calls.some(call => call[0] === 'install'), false);
  deferred();
  assert.deepEqual(calls.at(-1), ['install', true, false]);
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.autoRunAppAfterInstall, false);
  assert.throws(() => updaterExpression(exe, 'http://example.test/', 'check'));
});

test('post-update evidence rejects changed userData, wrong bytes, or an Aion renderer', () => {
  const before = { version: '26.9.2301', userData: 'C:\\Users\\test\\AppData\\Roaming\\One Person Lab', executable: 'C:\\OPL\\One Person Lab.exe' };
  const expected = { predecessorVersion: before.version, targetVersion: '26.9.2401', candidateAsarSha256: 'a'.repeat(64) };
  const after = { ...before, version: expected.targetVersion, main: 'desktop/main.mjs', asarSha256: expected.candidateAsarSha256, visible: true };
  assert.doesNotThrow(() => assertPreserved(before, after, expected));
  assert.throws(() => assertPreserved(before, { ...after, userData: `${after.userData} Preview` }, expected));
  assert.throws(() => assertPreserved(before, { ...after, asarSha256: 'b'.repeat(64) }, expected));
  assert.throws(() => assertPreserved(before, { ...after, main: 'out/main/index.js' }, expected));
});

test('WSL probe validates saved receipt and requires live WSL2 readback', async () => {
  const bytes = Buffer.from(JSON.stringify({ status: 'ready', distribution: 'OPL-Linux' }));
  let wsl2 = true;
  const load = name => ({ electron: { app: { isReady: () => true, isPackaged: true, getPath: () => 'C:\\state' } },
    'electron-updater': {}, 'node:fs': { readFileSync: file => file.endsWith('.sha256') ? `${sha(bytes)}  receipt\n` : bytes },
    'node:path': path.win32, 'node:crypto': { createHash },
    'node:child_process': { spawnSync: () => ({ status: 0, stdout: JSON.stringify({ wsl2, physical_distribution: 'OPL-Linux', guest_user: 'opl', guest_install_id: 'real-id', distribution_generation: 1 }) }) } })[name];
  const context = { process: { getBuiltinModule: () => ({ createRequire: () => load }) } };
  assert.equal((await vm.runInNewContext(wslIdentityExpression('C:\\OPL\\One Person Lab.exe'), context)).guestInstallId, 'real-id');
  wsl2 = false;
  await assert.rejects(() => vm.runInNewContext(wslIdentityExpression('C:\\OPL\\One Person Lab.exe'), context), /WSL runtime mismatch/);
});
