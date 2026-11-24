import type { ShellCandidate } from '../types.ts';
import { assertStringArrayIncludes } from '../shared.ts';

export function validateCandidateChatTarget(candidate: ShellCandidate): void {
  const target = candidate.codex_app_like_chat_target;
  if (!target) {
    throw new Error(`${candidate.id} must declare codex_app_like_chat_target`);
  }
  if (target.scope !== 'One Person Lab DSH-source chat-first desktop and WebUI product with contextual runtime, files, results, agents, and capabilities') {
    throw new Error(`${candidate.id} target must be the One Person Lab DSH-source chat-first product`);
  }
  assertStringArrayIncludes(target.capability_inventory, [
    'workspace directory picker',
    'new conversation and lightweight thread history rail',
    'Codex app-server backed chat turns',
    'shared DSH-derived React renderer for Electron desktop standalone WebUI and Docker WebUI',
    'shared Node host core with Electron IPC and HTTP/SSE transport adapters',
    'pinned DeepSeek Harness AppFrame SidebarRoot conversation composer Settings theme and primitives used directly',
    'chat-first main canvas with pinned composer',
    'left rail limited to projects, conversations, search, and Settings',
    'right-side on-demand Run status, Files and results, and Agents and capabilities modules',
    'current Codex agent state and active project lines rendered as run status',
    'hypotheses and roadmaps rendered from runtime.detail contribution readback',
    'user-selected files only and owner-projected artifacts without action JSON masquerading as results',
    'Agent Package lifecycle management remains in Settings',
    'text-only One Person Lab identity without an in-app Logo',
    'candidate Electron desktop packages through the App wrapper',
  ], `${candidate.id}.codex_app_like_chat_target.capability_inventory`);
}

export function validateCandidateWebUiTransport(candidate: ShellCandidate): void {
  const transport = candidate.webui_transport;
  if (!transport) {
    throw new Error(`${candidate.id} must declare webui_transport`);
  }
  if (transport.shared_renderer !== true) {
    throw new Error(`${candidate.id} webui_transport.shared_renderer must be true`);
  }
  if (transport.shared_host_core !== 'plugins/opl-host-core/src/service.mjs') {
    throw new Error(`${candidate.id} transport must use the shared Node host core`);
  }
  if (transport.bridge_abi !== 'opl_app_host_bridge.v1') {
    throw new Error(`${candidate.id} transport must expose the App-owned bridge ABI`);
  }
  if (transport.desktop_surface !== 'Electron preload window.oplStudio') {
    throw new Error(`${candidate.id} desktop surface must expose window.oplStudio through Electron preload`);
  }
  if (transport.web_surface !== 'browser window.oplStudio HTTP/SSE adapter') {
    throw new Error(`${candidate.id} web surface must expose the browser window.oplStudio HTTP/SSE adapter`);
  }
  if (transport.desktop_adapter !== 'desktop/main.mjs + desktop/preload.cjs') {
    throw new Error(`${candidate.id} desktop adapter must use the Electron main and preload entrypoints`);
  }
  if (transport.web_bridge !== 'src/bridge/webTransport.ts') {
    throw new Error(`${candidate.id} web bridge must be src/bridge/webTransport.ts`);
  }
  if (transport.gateway !== 'scripts/dev-webui-server.mjs') {
    throw new Error(`${candidate.id} WebUI gateway must be scripts/dev-webui-server.mjs`);
  }
  if (transport.event_stream !== 'SSE /api/opl-events') {
    throw new Error(`${candidate.id} WebUI event stream must be SSE /api/opl-events`);
  }
  if (transport.desktop_picker_policy !== 'Electron desktop may use the platform directory picker; WebUI uses an explicit workspace path/action bridge without changing App product truth') {
    throw new Error(`${candidate.id} WebUI desktop picker policy must preserve App product truth`);
  }
  if (transport.electron_in_headless_or_container_allowed !== false) {
    throw new Error(`${candidate.id} must keep Electron out of headless and container runtime forms`);
  }
}
