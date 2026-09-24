import { validateShellThreadCoordination } from '../../../scripts/validate-active-shell/shell-thread-coordination-validator.ts';
import { assert, fs, os, path, test, appRoot } from './helpers.ts';

const files = {
  'packages/desktop/src/process/services/codexAppServer/adapter.ts': `
    class CodexAppServerAdapter
    ['app-server', '--stdio'] 'initialize' DEFAULT_MAX_PAGES Unsupported server request
    listThreads( readThread( startThread( resumeThread( forkThread( archiveThread( unarchiveThread(
    this.rpc.request('thread/list' this.rpc.request('thread/read' this.rpc.request('thread/start'
    this.rpc.request('thread/resume' this.rpc.request('thread/fork' this.rpc.request('thread/archive'
    this.rpc.request('thread/unarchive' createProductionCodexAppServerAdapter
  `,
  'packages/desktop/src/process/bridge/codexAppServerBridge.ts': `
    createProductionCodexAppServerAdapter initCodexAppServerBridge disposeCodexAppServerBridge
    ipcBridge.codexThreads.list.provider ipcBridge.codexThreads.read.provider
    ipcBridge.codexThreads.start.provider ipcBridge.codexThreads.resume.provider
    ipcBridge.codexThreads.fork.provider ipcBridge.codexThreads.archive.provider
    ipcBridge.codexThreads.unarchive.provider
  `,
  'packages/desktop/src/process/bridge/index.ts': `
    initCodexAppServerBridge
    initCodexAppServerBridge(deps.codexAppServerAdapter)
  `,
  'packages/desktop/src/index.ts': `
    installQuitCleanup({
    onBeforeQuit: (handler) => app.on('before-quit', (event) => handler(event))
    stopBackend: async () => {
    try { await disposeCodexAppServerBridge(); } finally { await backendManager.stop(); }
  `,
  'packages/desktop/src/renderer/components/layout/Sider/index.tsx': `
    ordinary navigation with the conversation directory only
  `,
  'tests/unit/codex-app-server/adapter.test.ts': `
    lists active and archived threads through bounded app-server pagination
    falls back to a turn-free read for an unmaterialized thread
    maps the narrow user-triggered thread lifecycle to app-server methods
    initializes one process and handles fragmented and coalesced JSONL frames
    times out a silent production request without returning partial success
    rejects unsupported server requests without creating a pending control plane
  `,
};

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-app-server-shell-'));
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents, 'utf8');
  }
  const contract = JSON.parse(fs.readFileSync(path.join(appRoot, 'contracts/shell-adapters/aionui.json'), 'utf8'));
  return { root, shellPaths: { shellRoot: root, contract } };
}

test('active-shell validator accepts one user-triggered Codex App Server adapter', () => {
  const { shellPaths } = fixture();
  assert.doesNotThrow(() => validateShellThreadCoordination(shellPaths));
});

test('candidate adapter skips AionUI implementation probes when validation is contract-paths-only', () => {
  const shellPaths = {
    shellRoot: '/candidate-without-aionui-fork-body',
    contract: { shell_contract: { implementation_validation: 'contract_paths_only' } },
  };
  assert.doesNotThrow(() => validateShellThreadCoordination(shellPaths));
});

test('active-shell validator rejects an unwired production adapter', () => {
  const { root, shellPaths } = fixture();
  const bridgePath = path.join(root, 'packages/desktop/src/process/bridge/codexAppServerBridge.ts');
  fs.writeFileSync(
    bridgePath,
    fs.readFileSync(bridgePath, 'utf8').replace('createProductionCodexAppServerAdapter', ''),
    'utf8',
  );
  assert.throws(() => validateShellThreadCoordination(shellPaths), /Codex App Server IPC bridge/);
});

test('active-shell validator rejects fire-and-forget App Server shutdown', () => {
  const { root, shellPaths } = fixture();
  const desktopIndexPath = path.join(root, 'packages/desktop/src/index.ts');
  fs.writeFileSync(
    desktopIndexPath,
    fs.readFileSync(desktopIndexPath, 'utf8').replace('await disposeCodexAppServerBridge();', 'void disposeCodexAppServerBridge();'),
    'utf8',
  );
  assert.throws(() => validateShellThreadCoordination(shellPaths), /awaited Codex App Server shutdown/);
});

test('active-shell validator rejects backend-first shutdown', () => {
  const { root, shellPaths } = fixture();
  const desktopIndexPath = path.join(root, 'packages/desktop/src/index.ts');
  fs.writeFileSync(
    desktopIndexPath,
    fs
      .readFileSync(desktopIndexPath, 'utf8')
      .replace(
        'try { await disposeCodexAppServerBridge(); } finally { await backendManager.stop(); }',
        'try { await backendManager.stop(); } finally { await disposeCodexAppServerBridge(); }',
      ),
    'utf8',
  );
  assert.throws(() => validateShellThreadCoordination(shellPaths), /dispose the Cordis channel Host before stopping the backend/);
});

test('active-shell validator rejects a missing user-triggered lifecycle method', () => {
  const { root, shellPaths } = fixture();
  const adapterPath = path.join(root, 'packages/desktop/src/process/services/codexAppServer/adapter.ts');
  fs.writeFileSync(
    adapterPath,
    fs.readFileSync(adapterPath, 'utf8').replace("this.rpc.request('thread/fork'", ''),
    'utf8',
  );
  assert.throws(() => validateShellThreadCoordination(shellPaths), /single Codex App Server adapter/);
});

test('active-shell validator rejects the retired private coordination service', () => {
  const { root, shellPaths } = fixture();
  const retiredPath = path.join(root, 'packages/desktop/src/process/services/threadCoordination/index.ts');
  fs.mkdirSync(path.dirname(retiredPath), { recursive: true });
  fs.writeFileSync(retiredPath, 'legacy service', 'utf8');
  assert.throws(() => validateShellThreadCoordination(shellPaths), /private thread coordination control plane/);
});

test('active-shell validator rejects an ordinary coordination page', () => {
  const { root, shellPaths } = fixture();
  const siderPath = path.join(root, 'packages/desktop/src/renderer/components/layout/Sider/index.tsx');
  fs.writeFileSync(siderPath, '<ThreadCoordinationSection />', 'utf8');
  assert.throws(() => validateShellThreadCoordination(shellPaths), /user-triggered thin adapter/);
});

test('active-shell validator rejects audit, replay, or model-delivery control planes', () => {
  const { root, shellPaths } = fixture();
  const adapterPath = path.join(root, 'packages/desktop/src/process/services/codexAppServer/adapter.ts');
  fs.appendFileSync(adapterPath, '\nidempotencyKey deliveryAudit modelDelivery\n', 'utf8');
  assert.throws(() => validateShellThreadCoordination(shellPaths), /user-triggered thin adapter/);
});
