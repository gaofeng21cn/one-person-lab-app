import { validateStudioThreadCoordination } from './studio-implementation-validator.ts';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  assertShellTextIncludesAll,
  assertTextExcludesAll,
  readShellText,
} from './shell-implementation-helpers.ts';

const paths = {
  adapter: 'packages/desktop/src/process/services/codexAppServer/adapter.ts',
  bridge: 'packages/desktop/src/process/bridge/codexAppServerBridge.ts',
  bridgeIndex: 'packages/desktop/src/process/bridge/index.ts',
  desktopIndex: 'packages/desktop/src/index.ts',
  sider: 'packages/desktop/src/renderer/components/layout/Sider/index.tsx',
};

const retiredPaths = [
  'packages/desktop/src/common/types/codex/threadCoordination.ts',
  'packages/desktop/src/process/bridge/threadCoordinationBridge.ts',
  'packages/desktop/src/process/services/threadCoordination',
  'packages/desktop/src/renderer/pages/conversation/GroupedHistory/ThreadCoordination',
  'tests/unit/thread-coordination',
  'tests/unit/conversation/ThreadCoordination.dom.test.tsx',
];

export function validateShellThreadCoordination(shellPaths): void {
  if (shellPaths.contract.active_shell === 'opl-studio') {
    validateStudioThreadCoordination(shellPaths);
    return;
  }
  if (shellPaths.contract?.shell_contract?.implementation_validation === 'contract_paths_only') {
    return;
  }

  const adapter = assertShellTextIncludesAll(
    shellPaths,
    paths.adapter,
    [
      'class CodexAppServerAdapter',
      "['app-server', '--stdio']",
      "'initialize'",
      'listThreads(',
      'readThread(',
      'startThread(',
      'resumeThread(',
      'forkThread(',
      'archiveThread(',
      'unarchiveThread(',
      "this.rpc.request('thread/list'",
      "this.rpc.request('thread/read'",
      "this.rpc.request('thread/start'",
      "this.rpc.request('thread/resume'",
      "this.rpc.request('thread/fork'",
      "this.rpc.request('thread/archive'",
      "this.rpc.request('thread/unarchive'",
      'DEFAULT_MAX_PAGES',
      'createProductionCodexAppServerAdapter',
      'Unsupported server request',
    ],
    'single Codex App Server adapter',
  );
  const bridge = assertShellTextIncludesAll(
    shellPaths,
    paths.bridge,
    [
      'createProductionCodexAppServerAdapter',
      'initCodexAppServerBridge',
      'disposeCodexAppServerBridge',
      'ipcBridge.codexThreads.list.provider',
      'ipcBridge.codexThreads.read.provider',
      'ipcBridge.codexThreads.start.provider',
      'ipcBridge.codexThreads.resume.provider',
      'ipcBridge.codexThreads.fork.provider',
      'ipcBridge.codexThreads.archive.provider',
      'ipcBridge.codexThreads.unarchive.provider',
    ],
    'Codex App Server IPC bridge',
  );
  const bridgeIndex = assertShellTextIncludesAll(
    shellPaths,
    paths.bridgeIndex,
    ['initCodexAppServerBridge', 'initCodexAppServerBridge(deps.codexAppServerAdapter)'],
    'Codex App Server bridge registration',
  );
  const desktopIndex = assertShellTextIncludesAll(
    shellPaths,
    paths.desktopIndex,
    [
      'installQuitCleanup({',
      "onBeforeQuit: (handler) => app.on('before-quit', (event) => handler(event))",
      'stopBackend: async () => {',
      'await disposeCodexAppServerBridge();',
      'finally {',
      'await backendManager.stop();',
    ],
    'awaited Codex App Server shutdown',
  );
  const hostDisposeIndex = desktopIndex.indexOf('await disposeCodexAppServerBridge();');
  const backendStopIndex = desktopIndex.indexOf('await backendManager.stop();');
  if (hostDisposeIndex >= backendStopIndex) {
    throw new Error('Active shell shutdown must dispose the Cordis channel Host before stopping the backend');
  }
  const sider = readShellText(shellPaths, paths.sider);

  for (const retiredPath of retiredPaths) {
    if (existsSync(path.join(shellPaths.shellRoot, retiredPath))) {
      throw new Error(`Active shell must not retain the private thread coordination control plane: ${retiredPath}`);
    }
  }

  assertTextExcludesAll(
    [adapter, bridge, bridgeIndex, desktopIndex, sider].join('\n'),
    [
      'ThreadCoordinationSection',
      'threadCoordination.',
      'idempotencyKey',
      'deliveryAudit',
      'writeSetAdvisory',
      'modelDelivery',
      'dynamicThreadTool',
      'listPendingRequests',
      'resolveServerRequest',
      'cross_host_delivery',
      'send_input',
    ],
    'Codex App Server adapter must remain a user-triggered thin adapter without a private coordination layer',
  );
}
