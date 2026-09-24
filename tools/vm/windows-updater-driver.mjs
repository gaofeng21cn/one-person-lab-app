import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const digest = (file, algorithm = 'sha256', encoding = 'hex') =>
  createHash(algorithm).update(fs.readFileSync(file)).digest(encoding);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function validateCandidate(input) {
  for (const key of ['predecessorSha256', 'candidateSha256', 'candidateAsarSha256']) {
    assert.match(input[key] ?? '', /^[0-9a-f]{64}$/, `${key} must identify exact bytes`);
  }
  assert.equal(digest(input.predecessorInstaller), input.predecessorSha256, 'predecessor installer drift');
  assert.equal(digest(input.candidateInstaller), input.candidateSha256, 'candidate installer drift');
  const metadata = parseYaml(fs.readFileSync(path.join(input.feedDirectory, 'latest.yml'), 'utf8'));
  const name = path.basename(input.candidateInstaller);
  assert.equal(metadata.version, input.targetVersion, 'updater metadata version drift');
  assert.equal(metadata.path, name, 'metadata path must name the exact candidate');
  assert.equal(metadata.sha512, digest(input.candidateInstaller, 'sha512', 'base64'));
  assert.equal(metadata.files.length, 1);
  assert.equal(metadata.files[0].url, name);
  assert.equal(metadata.files[0].sha512, metadata.sha512);
  assert.equal(metadata.files[0].size, fs.statSync(input.candidateInstaller).size);
  assert.equal(digest(path.join(input.feedDirectory, name)), input.candidateSha256);
  assert(fs.statSync(path.join(input.feedDirectory, `${name}.blockmap`)).size > 0);
  return {
    metadataSha256: digest(path.join(input.feedDirectory, 'latest.yml')),
    blockmapSha256: digest(path.join(input.feedDirectory, `${name}.blockmap`)),
    installerSha256: input.candidateSha256,
    installerName: name,
  };
}

export function runtimeExpression(appExecutable, body) {
  const anchor = path.win32.join(path.win32.dirname(appExecutable), 'resources', 'app.asar', 'package.json');
  return `(async () => {
    const load = process.getBuiltinModule('node:module').createRequire(${JSON.stringify(anchor)});
    const { app, BrowserWindow } = load('electron');
    const { autoUpdater } = load('electron-updater');
    const fs = load('node:fs'), path = load('node:path'), crypto = load('node:crypto');
    if (!app.isReady() || !app.isPackaged) throw new Error('Packaged app is not ready');
    ${body}
  })()`;
}

export function updaterExpression(executable, feedUrl, operation) {
  const url = new URL(feedUrl);
  assert(url.protocol === 'http:' && url.hostname === '127.0.0.1' && !url.username && !url.password);
  const setup = `autoUpdater.setFeedURL({ provider: 'generic', url: ${JSON.stringify(feedUrl)} });
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;`;
  if (operation === 'check') return runtimeExpression(executable, `${setup}
    const result = await autoUpdater.checkForUpdates();
    return { currentVersion: app.getVersion(), targetVersion: result?.updateInfo?.version,
      available: Boolean(result?.isUpdateAvailable) };`);
  if (operation === 'download') return runtimeExpression(executable, `${setup}
    const files = await autoUpdater.downloadUpdate();
    return files.map(file => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));`);
  if (operation === 'install') return runtimeExpression(executable, `${setup}
    autoUpdater.autoRunAppAfterInstall = false;
    setTimeout(() => autoUpdater.quitAndInstall(true, false), 250);
    return { scheduled: true };`);
  if (operation === 'quit') return runtimeExpression(executable, `setTimeout(() => app.quit(), 250); return true;`);
  throw new Error(`Unsupported operation: ${operation}`);
}

export function identityExpression(executable) {
  return runtimeExpression(executable, `
    const pkg = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'));
    return { version: app.getVersion(), name: app.getName(), main: pkg.main,
      userData: app.getPath('userData'), executable: process.execPath,
      asarSha256: crypto.createHash('sha256').update(fs.readFileSync(app.getAppPath())).digest('hex'),
      visible: BrowserWindow.getAllWindows().some(window => window.isVisible() && !window.isDestroyed()) };`);
}

export function wslIdentityExpression(executable) {
  return runtimeExpression(executable, `
    const receiptPath = path.join(app.getPath('userData'), 'installer', 'receipts', 'windows-wsl2-ready.json');
    const bytes = fs.readFileSync(receiptPath);
    const expected = fs.readFileSync(receiptPath + '.sha256', 'utf8').trim().split(/\\s+/)[0];
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('WSL receipt hash mismatch');
    const receipt = JSON.parse(bytes);
    if (receipt.status !== 'ready' || receipt.distribution !== 'OPL-Linux') throw new Error('WSL receipt not ready');
    const inspected = load('node:child_process').spawnSync('wsl.exe', ['--distribution', 'OPL-Linux', '--user', 'opl', '--exec',
      '/opt/opl/bootstrap/opl-runtime-inspect', '--json'], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    if (inspected.status !== 0) throw new Error('Live legacy WSL inspector failed');
    const live = JSON.parse(inspected.stdout);
    if (live.wsl2 !== true || live.physical_distribution !== 'OPL-Linux' || live.guest_user !== 'opl') throw new Error('WSL runtime mismatch');
    return { guestInstallId: live.guest_install_id, generation: live.distribution_generation,
      codexHome: live.codex_home, workspaceRoot: live.workspace_root, codexDigest: live.codex_digest,
      receiptSha256: expected, wsl2: live.wsl2 };`);
}

export function assertPreserved(before, after, expected) {
  assert.equal(before.version, expected.predecessorVersion);
  assert.equal(after.version, expected.targetVersion);
  assert.equal(after.userData.toLowerCase(), before.userData.toLowerCase(), 'userData location changed');
  assert.equal(after.executable.toLowerCase(), before.executable.toLowerCase(), 'installation location changed');
  assert.equal(after.asarSha256, expected.candidateAsarSha256, 'installed app differs from candidate');
  assert.equal(after.main, 'desktop/main.mjs', 'Studio is not the installed shell');
  assert.equal(after.visible, true, 'updated app has no visible window');
}

export function studioRuntimeExpression(executable) {
  return runtimeExpression(executable, `
    const window = BrowserWindow.getAllWindows().find(item => item.isVisible() && !item.isDestroyed());
    if (!window) throw new Error('No Studio window');
    return window.webContents.executeJavaScript(\`(async () => {
      if (!window.oplStudio) throw new Error('Studio preload bridge unavailable');
      const state = await window.oplStudio.readState('fast');
      const readback = state?.readback;
      const exitCode = readback?.exitCode ?? readback?.status;
      if (exitCode !== 0) throw new Error('Framework readback failed');
      const threads = await window.oplStudio.listThreads({ limit: 1 });
      if (threads?.error) throw new Error('Codex thread listing failed');
      return { frameworkExitCode: exitCode, codexThreadListingReached: true };
    })()\`);`);
}

class Inspector {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Inspector disconnected'));
      }
      this.pending.clear();
    });
  }
  async evaluate(expression, timeoutMs = 30000) {
    const id = ++this.id;
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Inspector evaluation timed out')); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result?.value;
  }
  close() { this.socket.close(); }
}

async function waitFor(probe, timeoutMs, label) {
  const end = Date.now() + timeoutMs;
  let failure;
  while (Date.now() < end) {
    try { const value = await probe(); if (value) return value; } catch (error) { failure = error; }
    await delay(500);
  }
  throw new Error(`${label} timed out${failure ? `: ${failure.message}` : ''}`);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function startApp(input, feedUrl, label) {
  const port = await freePort();
  const output = fs.openSync(path.join(input.outputDirectory, `${label}.log`), 'wx');
  const child = spawn(input.appExecutable, [`--inspect=127.0.0.1:${port}`], {
    env: { ...process.env, AIONUI_DISABLE_AUTO_UPDATE: '1',
      OPL_DESKTOP_UPDATE_QUALIFICATION_FEED_URL: feedUrl },
    stdio: ['ignore', output, output],
  });
  fs.closeSync(output);
  child.on('error', () => {});
  let inspector;
  try {
    const url = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) });
      return (await response.json()).find(item => item.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
    }, 90000, `${label} inspector`);
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('Inspector socket timed out')); }, 10000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Inspector socket failed')); }, { once: true });
    });
    inspector = new Inspector(socket);
    await waitFor(async () => {
      const identity = await inspector.evaluate(identityExpression(input.appExecutable));
      return identity.visible && identity;
    }, 120000, `${label} visible window`);
    return { child, inspector };
  } catch (error) {
    inspector?.close();
    child.kill();
    throw error;
  }
}

async function createFeed(input, installerName) {
  const requests = [];
  const allowed = new Set(['latest.yml', installerName, `${installerName}.blockmap`]);
  const server = http.createServer((request, response) => {
    let name;
    try { name = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname.slice(1)); } catch {}
    if (!allowed.has(name) || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404).end(); return; }
    const file = path.join(input.feedDirectory, name);
    requests.push({ name, method: request.method });
    response.writeHead(200, { 'Content-Length': fs.statSync(file).size, 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, requests, url: `http://127.0.0.1:${server.address().port}/` };
}

export async function runWindowsUpgrade(input) {
  assert.equal(process.platform, 'win32', 'Execute inside the disposable Windows x64 VM');
  assert.equal(process.arch, 'x64');
  assert.equal(input.disposableVm, true, 'Explicit disposable VM admission is required');
  assert(input.vmIdentity && input.vmSnapshot, 'Record the actual VM and source snapshot');
  assert(!fs.existsSync(input.outputDirectory), 'Evidence directory must be absent');
  const candidate = validateCandidate(input);
  fs.mkdirSync(input.outputDirectory, { recursive: true });
  const receipt = { schema: 'opl_windows_studio_upgrade_execution.v1', status: 'running',
    vmIdentity: input.vmIdentity, vmSnapshot: input.vmSnapshot, candidate, stages: [],
    evidenceScope: 'exact_candidate_installer_and_runtime', publicFeedSelectionProven: false,
    originalAppBytesModified: false,
    predecessorVersion: input.predecessorVersion, targetVersion: input.targetVersion };
  const record = (stage, evidence = {}) => {
    receipt.stages.push({ stage, at: new Date().toISOString(), ...evidence });
    fs.writeFileSync(path.join(input.outputDirectory, 'execution.json'), JSON.stringify(receipt, null, 2));
    process.stdout.write(`${stage}\n`);
  };
  let running, feed;
  try {
    assert(!fs.existsSync(input.appExecutable), 'Baseline install target must be absent in the clone');
    const installed = spawnSync(input.predecessorInstaller, ['/S', `/D=${path.dirname(input.appExecutable)}`], { timeout: 180000 });
    assert.equal(installed.status, 0, 'Predecessor installer failed');
    assert(fs.existsSync(input.appExecutable));
    record('predecessor_installed', { sha256: input.predecessorSha256 });
    feed = await createFeed(input, candidate.installerName);
    running = await startApp(input, feed.url, 'predecessor');
    receipt.before = await running.inspector.evaluate(identityExpression(input.appExecutable));
    assert.equal(receipt.before.version, input.predecessorVersion);
    receipt.wslBefore = await waitFor(() => running.inspector.evaluate(wslIdentityExpression(input.appExecutable), 35000),
      input.provisioningTimeoutMs ?? 900000, 'predecessor WSL provisioning');
    const sentinel = path.join(receipt.before.userData, `opl-upgrade-sentinel-${randomUUID()}.txt`);
    const sentinelValue = randomUUID();
    fs.writeFileSync(sentinel, sentinelValue, { flag: 'wx' });
    record('baseline_ready', { userData: receipt.before.userData, wsl: receipt.wslBefore });
    const checked = await running.inspector.evaluate(updaterExpression(input.appExecutable, feed.url, 'check'), 120000);
    assert.equal(checked.available, true);
    assert.equal(checked.targetVersion, input.targetVersion);
    record('update_available', checked);
    const downloaded = await running.inspector.evaluate(updaterExpression(input.appExecutable, feed.url, 'download'), 900000);
    assert(downloaded.some(file => file.sha256 === input.candidateSha256), 'Downloaded candidate bytes differ');
    record('exact_candidate_downloaded', { files: downloaded });
    await running.inspector.evaluate(updaterExpression(input.appExecutable, feed.url, 'install'));
    await waitFor(() => running.child.exitCode !== null, 120000, 'predecessor process exit');
    running.inspector.close();
    running = null;
    const asarPath = path.join(path.dirname(input.appExecutable), 'resources', 'app.asar');
    await waitFor(() => fs.existsSync(asarPath) && digest(asarPath) === input.candidateAsarSha256, 180000, 'NSIS replacement');
    record('candidate_installed', { asarSha256: input.candidateAsarSha256 });
    running = await startApp(input, feed.url, 'studio');
    receipt.after = await running.inspector.evaluate(identityExpression(input.appExecutable));
    assertPreserved(receipt.before, receipt.after, input);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), sentinelValue, 'Persistent user data was not preserved');
    receipt.wslAfter = await running.inspector.evaluate(wslIdentityExpression(input.appExecutable), 35000);
    assert.deepEqual(receipt.wslAfter, receipt.wslBefore, 'Existing WSL runtime identity changed');
    receipt.runtime = await waitFor(() => running.inspector.evaluate(studioRuntimeExpression(input.appExecutable), 45000),
      180000, 'Studio Framework and Codex runtime');
    const rechecked = await running.inspector.evaluate(updaterExpression(input.appExecutable, feed.url, 'check'), 120000);
    assert.equal(rechecked.available, false, 'Updated app offers the same update again');
    assert.equal(rechecked.currentVersion, input.targetVersion);
    record('studio_verified', { repeatedCheck: rechecked, sentinelPreserved: true });
    await running.inspector.evaluate(updaterExpression(input.appExecutable, feed.url, 'quit'));
    await waitFor(() => running.child.exitCode !== null, 60000, 'Studio normal shutdown');
    running.inspector.close();
    running = null;
    receipt.status = 'passed';
    receipt.feedRequests = feed.requests;
    record('complete');
    return receipt;
  } catch (error) {
    receipt.status = 'failed';
    record('failed', { message: error.message });
    throw error;
  } finally {
    if (running) {
      try { await running.inspector.evaluate(updaterExpression(input.appExecutable, feed.url, 'quit')); } catch {}
      try { await waitFor(() => running.child.exitCode !== null, 10000, 'failure cleanup'); } catch { running.child.kill(); }
      running.inspector.close();
    }
    if (feed) { feed.server.closeAllConnections(); await new Promise(resolve => feed.server.close(resolve)); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv[2], '--input', 'Usage: node windows-updater-driver.mjs --input exact-input.json');
  await runWindowsUpgrade(JSON.parse(fs.readFileSync(process.argv[3], 'utf8')));
}
