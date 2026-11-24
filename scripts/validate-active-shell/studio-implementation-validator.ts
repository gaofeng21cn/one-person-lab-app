import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveDesktopReleaseCarrier } from '../desktop-release-carrier.ts';
import { assertShellTextIncludesAll } from './shell-implementation-helpers.ts';

const brandedDeepLinkProbeIds = [
  'opl_scheme_only',
  'navigate_schema_and_secret_rejection',
  'app_owned_exact_route_registry',
  'shared_cold_warm_second_instance_parser',
  'invalid_link_fail_open_and_redacted',
];

export function validateBrandedDeepLinkProbeContract(adapterContract) {
  const surface = adapterContract?.implementation_probes?.branded_deep_link_surface;
  if (
    surface?.source !== 'app_branded_deep_link_policy' ||
    surface?.source_ref !== 'contracts/app-gui-product-contract.json#branded_deep_link_policy' ||
    surface?.policy !== 'behavior_tests_plus_narrow_source_guards'
  ) {
    throw new Error('Active shell branded deep-link probe must consume the App-owned policy');
  }
  const probes = Array.isArray(surface.probes) ? surface.probes : [];
  const ids = probes.map((probe) => probe?.id);
  if (JSON.stringify(ids) !== JSON.stringify(brandedDeepLinkProbeIds)) {
    throw new Error('Active shell branded deep-link probe ids must match the App-owned policy');
  }
  if (
    probes.some(
      (probe) =>
        probe?.required !== true ||
        !Array.isArray(probe.required_evidence) ||
        probe.required_evidence.length < 2 ||
        probe.required_evidence.some((entry) => typeof entry !== 'string' || !entry.trim()),
    )
  ) {
    throw new Error('Active shell branded deep-link probes must require concrete evidence');
  }
}

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
  for (const relative of ['desktop/main.mjs', 'desktop/preload.cjs', 'desktop/updater.mjs', 'plugins/opl-host-core/src/service.mjs', 'plugins/opl-codex-native/src/app-server-transport.mjs']) {
    const result = spawnSync(process.execPath, ['--check', path.join(shellPaths.shellRoot, relative)], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Studio JavaScript syntax check failed for ${relative}: ${result.stderr}`);
  }
  validateBrandedDeepLinkProbeContract(shellPaths.contract);
  assertShellTextIncludesAll(shellPaths, 'desktop/deep-links.mjs', [
    'createDeepLinkPolicy', 'parseDeepLinkUrl', 'validateDeepLinkPayload', 'forbiddenParameters', 'secretPrefixes',
    'extractSecondInstanceDeepLinkPayload', 'createDeepLinkDelivery', 'takePending()',
  ], 'Studio App-owned deep-link parser and validated delivery');
  assertShellTextIncludesAll(shellPaths, 'desktop/main.mjs', ['deepLinks.acceptArgv(process.argv)', 'deepLinks.acceptUrl(url)', 'deepLinks.acceptSecondInstance(argv, additionalData)', 'deepLinks.takePending()'], 'Studio shared deep-link entry paths');
  assertShellTextIncludesAll(shellPaths, 'plugins/opl-studio-client/src/client/workbench/deepLinkNavigation.ts', ['validateDeepLinkPayload(value, policy)', 'resolveDeepLinkDestination'], 'Studio renderer deep-link revalidation');
  assertShellTextIncludesAll(shellPaths, 'electron-builder.stable.yml', ['protocols:', '      - opl'], 'Studio packaged branded protocol');
  assertShellTextIncludesAll(shellPaths, 'desktop/main.mjs', ['electron-updater', 'createDesktopUpdater', 'runWhenIdle'], 'Studio idle updater handoff');
  assertShellTextIncludesAll(shellPaths, 'desktop/updater.mjs', ['beforeRestart', 'quitAndInstall', 'app_server_busy'], 'Studio guarded updater installation');
  assertShellTextIncludesAll(shellPaths, 'plugins/opl-framework-bridge/src/opl-passthrough.mjs', ['state', 'action', 'execute'], 'Framework-owned state/action bridge');
}

export function validateStudioThreadCoordination(shellPaths): void {
  assertShellTextIncludesAll(shellPaths, 'plugins/opl-codex-native/src/app-server-transport.mjs', [
    'thread/list', 'thread/read', 'thread/start', 'thread/resume', 'thread/fork',
    'thread/archive', 'thread/unarchive', 'turn/start', 'turn/steer',
  ], 'Studio canonical Codex thread and turn transport');
  assertShellTextIncludesAll(shellPaths, 'src/host/dsh/cordis.yml', ['opl-codex-native', 'opl-framework-bridge'], 'Studio Host owner composition');
}
