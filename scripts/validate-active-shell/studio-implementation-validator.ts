import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveDesktopReleaseCarrier } from '../desktop-release-carrier.ts';
import { validateBrandedDeepLinkProbeContract } from './shell-settings-and-team-validator.ts';
import { assertShellTextIncludesAll } from './shell-implementation-helpers.ts';

// Source conformance only. Signing, migration, installed data continuity, and
// release readiness are proved by the separate exact-artifact VM gates.
export function validateStudioImplementation(shellPaths): void {
  const carrier = resolveDesktopReleaseCarrier({ contract: shellPaths.contract, shellRoot: shellPaths.shellRoot });
  if (carrier.releaseRole !== 'active_stable' || carrier.bundleId !== 'cn.onepersonlab.opl'
    || carrier.releaseRepository !== 'gaofeng21cn/one-person-lab-app') {
    throw new Error('Active Studio carrier must preserve the existing Stable App identity and update feed.');
  }
  const scripts = JSON.parse(fs.readFileSync(shellPaths.packageManifestPath, 'utf8')).scripts;
  for (const name of ['typecheck', 'test:node-suite', 'test:bun-suites', 'validate:candidate', 'build-mac:arm64']) {
    if (typeof scripts[name] !== 'string' || !scripts[name].trim()) throw new Error(`Studio source gate requires ${name}.`);
  }
  for (const relative of ['desktop/main.mjs', 'desktop/preload.cjs', 'desktop/updater.mjs', 'scripts/webui-host/host-core.mjs', 'scripts/webui-host/app-server-transport.mjs']) {
    const result = spawnSync(process.execPath, ['--check', path.join(shellPaths.shellRoot, relative)], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Studio JavaScript syntax check failed for ${relative}: ${result.stderr}`);
  }
  validateBrandedDeepLinkProbeContract(shellPaths.contract);
  assertShellTextIncludesAll(shellPaths, 'desktop/deep-links.mjs', [
    'createDeepLinkPolicy', 'parseDeepLinkUrl', 'validateDeepLinkPayload', 'forbiddenParameters', 'secretPrefixes',
    'extractSecondInstanceDeepLinkPayload', 'createDeepLinkDelivery', 'takePending()',
  ], 'Studio App-owned deep-link parser and validated delivery');
  assertShellTextIncludesAll(shellPaths, 'desktop/main.mjs', ['deepLinks.acceptArgv(process.argv)', 'deepLinks.acceptUrl(url)', 'deepLinks.acceptSecondInstance(argv, additionalData)', 'deepLinks.takePending()'], 'Studio shared deep-link entry paths');
  assertShellTextIncludesAll(shellPaths, 'src/workbench/deepLinkNavigation.ts', ['validateDeepLinkPayload(value, policy)', 'resolveDeepLinkDestination'], 'Studio renderer deep-link revalidation');
  assertShellTextIncludesAll(shellPaths, 'electron-builder.stable.yml', ['protocols:', '      - opl'], 'Studio packaged branded protocol');
  assertShellTextIncludesAll(shellPaths, 'desktop/main.mjs', ['electron-updater', 'createDesktopUpdater', 'runWhenIdle'], 'Studio idle updater handoff');
  assertShellTextIncludesAll(shellPaths, 'desktop/updater.mjs', ['beforeRestart', 'quitAndInstall', 'app_server_busy'], 'Studio guarded updater installation');
  assertShellTextIncludesAll(shellPaths, 'scripts/webui-host/opl-passthrough.mjs', ['state', 'action', 'execute'], 'Framework-owned state/action bridge');
}

export function validateStudioThreadCoordination(shellPaths): void {
  assertShellTextIncludesAll(shellPaths, 'scripts/webui-host/app-server-transport.mjs', [
    'thread/list', 'thread/read', 'thread/start', 'thread/resume', 'thread/fork',
    'thread/archive', 'thread/unarchive', 'turn/start', 'turn/steer',
  ], 'Studio canonical Codex thread and turn transport');
  assertShellTextIncludesAll(shellPaths, 'scripts/webui-host/dsh/cordis.yml', ['opl-codex-native', 'opl-framework-bridge'], 'Studio Host owner composition');
}
