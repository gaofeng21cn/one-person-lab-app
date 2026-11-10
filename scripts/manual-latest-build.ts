#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { resolveActiveShellPaths } from './app-shell-adapter.ts';
import { resolveFullCarrierProfile, type FullCarrierProfile } from './build-full-first-install-package/carrier-profile.ts';
import { findBuiltApp } from './build-full-first-install-package/archive-output.ts';
import {
  assertReleaseVersionNotFuture,
  assertUpdaterVersionMatchesDisplay,
  resolveReleaseVersionIdentity,
} from './release-version.ts';
import {
  assertDevelopmentRepoSnapshotsUnchanged,
  commandResult,
  deriveManualLocalAppIdentity,
  fileSha256,
  githubApi,
  manualVersions,
  manualSourceProvenanceSha256,
  readJson,
  requireFile,
  type StampedManualLocalAppIdentity,
  type RepoSnapshot,
  snapshotDevelopmentRepo,
  writeJson,
} from './manual-latest-build/common.ts';
import {
  installLocalApp,
  ManualAppInstallationError,
} from './manual-latest-build/install-app.ts';
import { prepareLatestUpstreams } from './manual-latest-build/upstreams.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const OWNER_REPOS = {
  mas: 'med-autoscience',
  mag: 'med-autogrant',
  rca: 'redcube-ai',
  oma: 'opl-meta-agent',
  obf: 'opl-bookforge',
  'mas-scholar-skills': 'mas-scholar-skills',
  'opl-flow': 'opl-flow',
} as const;

type Mode = 'local-app' | 'full-dmg';

type ShellBuildProjectionSnapshot = Array<{
  path: string;
  existed: boolean;
  contents: Buffer | null;
  mode: number | null;
}>;

export function captureShellBuildProjection(shellRoot: string): ShellBuildProjectionSnapshot {
  const shellPaths = resolveActiveShellPaths({ shellRoot });
  const paths = [
    shellPaths.productProfileTargetPath,
    path.join(shellRoot, 'resources', 'official-profile-package-apply.ts'),
  ];
  return paths.map((filePath) => {
    const stat = fs.statSync(filePath, { throwIfNoEntry: false });
    return {
      path: filePath,
      existed: Boolean(stat?.isFile()),
      contents: stat?.isFile() ? fs.readFileSync(filePath) : null,
      mode: stat?.isFile() ? stat.mode : null,
    };
  });
}

export function restoreShellBuildProjection(snapshot: ShellBuildProjectionSnapshot): void {
  for (const file of snapshot) {
    if (!file.existed) {
      fs.rmSync(file.path, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(file.path), { recursive: true });
    fs.writeFileSync(file.path, file.contents);
    if (file.mode !== null) fs.chmodSync(file.path, file.mode);
  }
}


export function buildManualRuntimeDependencyLock(
  carrier: FullCarrierProfile = resolveFullCarrierProfile(),
) {
  if (carrier.aioncoreRequired) {
    throw new Error('Retired AionUI/AionCore carriers are not supported by manual builds.');
  }
  return { opl_codex_native: {
    carrier_id: carrier.carrierId,
    codex_carrier: carrier.codexCarrier,
    runtime_owner: 'one-person-lab',
    resolution: 'framework_managed_runtime_at_install_or_launch',
    embedded_codex_payload: false,
    aioncore_required: false,
  } };
}

export function prepareManualRuntimeDependencies(_shellRoot: string, carrier = resolveFullCarrierProfile()) {
  return { binding: null, lock: buildManualRuntimeDependencyLock(carrier) };
}

export function assertFullDmgCodexCarrierBoundary(manifest: any) {
  if (Object.prototype.hasOwnProperty.call(manifest?.components ?? {}, 'codex')) {
    throw new Error('Full manifest must not contain components.codex.');
  }
  const boundary = manifest?.package_optimization?.package_boundary_audit;
  if (manifest?.carrier?.carrier_id !== 'opl-studio'
    || manifest.carrier.codex_carrier !== 'opl_codex_native'
    || manifest.carrier.aioncore_required !== false
    || boundary?.contains_opl_full_runtime !== true
    || boundary?.contains_shell_runtime !== false
    || boundary?.native_codex_external_carrier_present !== true
    || boundary?.native_codex_embedded_payload_present !== false
    || boundary?.claude_payload_absent !== true
    || boundary?.framework_codex_payload_absent !== true
    || boundary?.codex_carrier_audit?.schema !== 'opl_codex_native_carrier_audit.v1') {
    throw new Error('Studio Full must prove native Codex ownership without AionUI or AionCore.');
  }
  const forbidden = boundary.forbidden_framework_codex_paths;
  const expected = ['bin/codex', 'bin/rg', 'vendor/codex', '.runtime-cache/codex-cli'];
  if (
    !Array.isArray(forbidden)
    || JSON.stringify(forbidden.map((entry) => entry?.path)) !== JSON.stringify(expected)
    || forbidden.some((entry) => entry?.exists !== false)
  ) {
    throw new Error('Full manifest Framework Codex absence evidence is incomplete.');
  }
}

function assertManagedOutputPath(input: {
  outDir: string;
  workspaceRoot: string;
  cacheRoot: string;
  mode: Mode;
  version: string;
  updaterVersion: string;
  printPlan: boolean;
}) {
  const broadPaths = new Set([
    path.parse(input.outDir).root,
    os.homedir(),
    input.workspaceRoot,
    appRoot,
  ].map((candidate) => path.resolve(candidate)));
  if (broadPaths.has(input.outDir)) {
    throw new Error(`Unsafe managed output directory: ${input.outDir}`);
  }
  const defaultFull = path.join(
    os.homedir(),
    'Downloads',
    `One-Person-Lab-Manual-Full-${input.version}`,
  );
  const defaultLocal = path.join(
    input.cacheRoot,
    'local-app',
    `${input.version}-${input.updaterVersion}`,
  );
  const isDefault = input.outDir === (input.mode === 'full-dmg' ? defaultFull : defaultLocal);
  const outputStat = fs.statSync(input.outDir, { throwIfNoEntry: false });
  if (outputStat && !outputStat.isDirectory()) {
    throw new Error(`Managed output path is not a directory: ${input.outDir}`);
  }
  const entries = outputStat?.isDirectory() ? fs.readdirSync(input.outDir) : [];
  if (input.printPlan && entries.includes('manual-latest-build-receipt.json')) {
    throw new Error(
      `Refusing to overwrite successful build evidence with --print-plan: ${input.outDir}`,
    );
  }
  const isManaged = entries.length === 0
    || entries.includes('manual-latest-source-lock.json')
    || entries.includes('manual-latest-build-receipt.json');
  if (!isDefault && !isManaged) {
    throw new Error(
      `Refusing to replace a non-empty unmanaged output directory: ${input.outDir}`,
    );
  }
}

function managedOutputStage(outDir: string) {
  const parent = path.dirname(outDir);
  fs.mkdirSync(parent, { recursive: true });
  return fs.mkdtempSync(path.join(parent, `.${path.basename(outDir)}.staging-`));
}

function persistInstallationFailure(
  options: ReturnType<typeof parseOptions> & { help: false },
  sourceLock: unknown,
  sourceLockPath: string,
  buildIdentity: StampedManualLocalAppIdentity,
  error: ManualAppInstallationError,
) {
  const attemptId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
  const receiptPath = path.join(
    options.cacheRoot,
    'failures',
    'local-app',
    `${options.version}-${options.updaterVersion}-${attemptId}.json`,
  );
  writeJson(receiptPath, {
    schema: 'opl_manual_latest_build_failure_receipt.v1',
    status: 'failed',
    mode: 'local-app',
    display_version: options.version,
    updater_version: options.updaterVersion,
    bundle_version: buildIdentity.machine_version,
    build_identity: buildIdentity,
    source_lock_sha256: fileSha256(sourceLockPath),
    source_lock: sourceLock,
    installation: error.receipt,
  });
  return receiptPath;
}

function promoteManagedOutput(stagingDir: string, outDir: string) {
  const parent = path.dirname(outDir);
  const backupRoot = fs.mkdtempSync(path.join(parent, `.${path.basename(outDir)}.backup-`));
  const backupDir = path.join(backupRoot, path.basename(outDir));
  let movedExisting = false;
  try {
    if (fs.existsSync(outDir)) {
      fs.renameSync(outDir, backupDir);
      movedExisting = true;
    }
    fs.renameSync(stagingDir, outDir);
    fs.rmSync(backupRoot, { recursive: true, force: true });
  } catch (error) {
    if (!fs.existsSync(outDir) && movedExisting && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, outDir);
    }
    throw error;
  }
}

function parseOptions(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: true,
    options: {
      version: { type: 'string' },
      'updater-version': { type: 'string' },
      'workspace-root': { type: 'string' },
      'shell-root': { type: 'string' },
      'cache-root': { type: 'string' },
      'out-dir': { type: 'string' },
      'install-path': { type: 'string' },
      'no-launch': { type: 'boolean', default: false },
      'reuse-gui-vite-output': { type: 'boolean', default: false },
      'print-plan': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    return { help: true } as const;
  }
  const mode = positionals[0] as Mode | undefined;
  if (positionals.length !== 1 || !['local-app', 'full-dmg'].includes(String(mode))) {
    throw new Error('Usage: manual-latest-build.ts <local-app|full-dmg> [options]');
  }
  if (mode === 'full-dmg' && values['install-path']) {
    throw new Error('--install-path is supported only for local-app');
  }
  let version = values.version?.trim() || '';
  if (!version) {
    const latestStable = githubApi<{
      tag_name?: unknown;
      draft?: unknown;
      prerelease?: unknown;
    }>('repos/gaofeng21cn/one-person-lab-app/releases/latest');
    if (
      typeof latestStable.tag_name !== 'string'
      || latestStable.draft === true
      || latestStable.prerelease === true
    ) {
      throw new Error('Latest public Stable release identity is incomplete');
    }
    version = manualVersions(new Date(), latestStable.tag_name).displayVersion;
  }
  const updaterVersion = values['updater-version']?.trim()
    || resolveReleaseVersionIdentity('stable', version).updaterVersion;
  assertReleaseVersionNotFuture('stable', version);
  assertUpdaterVersionMatchesDisplay('stable', version, updaterVersion);
  const workspaceRoot = path.resolve(values['workspace-root'] || path.dirname(appRoot));
  const cacheRoot = path.resolve(
    values['cache-root']
      || path.join(os.homedir(), 'Library', 'Caches', 'One Person Lab', 'manual-latest-build'),
  );
  const defaultOutDir = values['print-plan']
    ? path.join(cacheRoot, 'plans', `${version}-${updaterVersion}`)
    : mode === 'full-dmg'
      ? path.join(os.homedir(), 'Downloads', `One-Person-Lab-Manual-Full-${version}`)
      : path.join(cacheRoot, 'local-app', `${version}-${updaterVersion}`);
  const outDir = path.resolve(values['out-dir'] || defaultOutDir);
  return {
    help: false,
    mode,
    version,
    updaterVersion,
    workspaceRoot,
    shellRoot: values['shell-root'] ? path.resolve(values['shell-root']) : null,
    cacheRoot,
    outDir,
    installPath: path.resolve(values['install-path'] || '/Applications/One Person Lab.app'),
    launch: !values['no-launch'],
    reuseGuiViteOutput: values['reuse-gui-vite-output'],
    printPlan: values['print-plan'],
  } as const;
}

function printHelp() {
  console.log(`Usage:
  bun run manual:local-app -- [options]
  bun run manual:full-dmg -- [options]

Shared policy:
  - self-developed App, Shell, Framework, and first-party packages come from clean fresh remote origin/main HEADs
  - external companions come from an official stable Release or tagged distribution and bind a verified sha256 digest

Options:
  --version <YY.M.D[-rN]>         Display version (default: latest same-day Stable, else today's r0)
  --updater-version <YY.M.DNN>    Machine version derived from the selected display revision
  --workspace-root <path>         Development repositories root
  --out-dir <path>                Evidence/DMG output directory
  --install-path <path>           local-app target (default: /Applications/One Person Lab.app)
  --no-launch                     Do not relaunch local-app after replacement
  --reuse-gui-vite-output         Reuse an already compiled Shell frontend
  --print-plan                    Resolve and verify inputs without building

Guide: docs/delivery/release/manual-latest-builds.md`);
}

function repoSnapshots(options: ReturnType<typeof parseOptions> & { help: false }) {
  const shellRoot = fs.realpathSync(
    options.shellRoot || resolveActiveShellPaths().shellRoot,
  );
  const framework = snapshotDevelopmentRepo(
    'framework',
    path.join(options.workspaceRoot, 'one-person-lab'),
  );
  const owners = Object.fromEntries(Object.entries(OWNER_REPOS).map(([packageId, repoName]) => [
    packageId,
    snapshotDevelopmentRepo(packageId, path.join(options.workspaceRoot, repoName)),
  ])) as Record<string, RepoSnapshot>;
  return {
    app: snapshotDevelopmentRepo('app', appRoot),
    shell: snapshotDevelopmentRepo('shell', shellRoot),
    framework,
    owners,
    shellRoot,
  };
}

function buildEnvironment(snapshots: ReturnType<typeof repoSnapshots>) {
  return {
    ...process.env,
    OPL_FULL_FRAMEWORK_REF: snapshots.framework.head,
    OPL_FULL_MAS_REF: snapshots.owners.mas.head,
    OPL_FULL_MAG_REF: snapshots.owners.mag.head,
    OPL_FULL_RCA_REF: snapshots.owners.rca.head,
    OPL_FULL_META_AGENT_REF: snapshots.owners.oma.head,
    OPL_FULL_BOOKFORGE_REF: snapshots.owners.obf.head,
    OPL_FULL_OPL_FLOW_REF: snapshots.owners['opl-flow'].head,
    OPL_FULL_RUNTIME_CACHE_MODE: 'readwrite',
  };
}

function developmentRepoSnapshots(snapshots: ReturnType<typeof repoSnapshots>) {
  return [
    snapshots.app,
    snapshots.shell,
    snapshots.framework,
    ...Object.values(snapshots.owners),
  ];
}

function runBuild(
  options: ReturnType<typeof parseOptions> & { help: false },
  snapshots: ReturnType<typeof repoSnapshots>,
  upstreams: ReturnType<typeof prepareLatestUpstreams>,
  buildIdentity: StampedManualLocalAppIdentity,
) {
  const args = [
    '--experimental-strip-types',
    path.join(appRoot, 'scripts', 'build-full-first-install-package.ts'),
    '--version', options.version,
    '--updater-version', options.updaterVersion,
    '--out-dir', options.outDir,
    '--framework-root', snapshots.framework.root,
    '--gui-root', snapshots.shellRoot,
    '--mas-root', snapshots.owners.mas.root,
    '--mas-scholar-skills-root', snapshots.owners['mas-scholar-skills'].root,
    '--mas-scholar-skills-ref', snapshots.owners['mas-scholar-skills'].head,
    '--mag-root', snapshots.owners.mag.root,
    '--rca-root', snapshots.owners.rca.root,
    '--meta-agent-root', snapshots.owners.oma.root,
    '--bookforge-root', snapshots.owners.obf.root,
    '--opl-flow-root', snapshots.owners['opl-flow'].root,
    '--officecli-root', upstreams.officecli.source_root,
    '--officecli-bin', upstreams.officecli.binary,
    '--mineru-open-api-bin', upstreams.mineru_open_api.binary,
    '--temporal-cli-bin', upstreams.temporal.binary,
    '--temporal-cli-archive', upstreams.temporal.archive,
  ];
  if (options.mode === 'local-app') args.push('--app-only');
  if (options.reuseGuiViteOutput) args.push('--reuse-gui-vite-output');
  commandResult(process.execPath, args, {
    cwd: appRoot,
    env: {
      ...buildEnvironment(snapshots),
      OPL_MANUAL_LOCAL_BUILD_ID: options.mode === 'local-app'
        ? buildIdentity.local_build_id
        : '',
      OPL_MANUAL_LOCAL_SOURCE_PROVENANCE_SHA256: options.mode === 'local-app'
        ? buildIdentity.source_provenance_sha256
        : '',
      OPL_MANUAL_LOCAL_SOURCE_LOCK_SHA256: options.mode === 'local-app'
        ? buildIdentity.source_lock_sha256
        : '',
    },
    timeoutMs: 2 * 60 * 60 * 1000,
  });
}

function fullDmgEvidence(
  options: ReturnType<typeof parseOptions> & { help: false },
  buildOutDir: string,
) {
  const names = {
    dmg: `One-Person-Lab-Full-${options.version}-mac-arm64.dmg`,
    manifest: 'full-package-manifest.json',
    releaseManifest: 'opl-release-manifest.json',
  };
  const dmg = requireFile(path.join(buildOutDir, names.dmg), 'Manual Full DMG');
  const manifestPath = requireFile(path.join(buildOutDir, names.manifest), 'Full package manifest');
  const releaseManifestPath = requireFile(
    path.join(buildOutDir, names.releaseManifest),
    'Full release manifest',
  );
  const manifest = readJson(manifestPath);
  const releaseManifest = readJson(releaseManifestPath);
  if (manifest.version !== options.version || releaseManifest.version !== options.version) {
    throw new Error(
      `Manual Full output version mismatch: package=${String(manifest.version)} `
      + `release=${String(releaseManifest.version)} expected=${options.version}`,
    );
  }
  assertFullDmgCodexCarrierBoundary(manifest);
  commandResult('hdiutil', ['verify', dmg], { timeoutMs: 300_000 });
  return {
    dmg: path.join(options.outDir, names.dmg),
    dmg_sha256: fileSha256(dmg),
    dmg_size_bytes: fs.statSync(dmg).size,
    full_package_manifest: path.join(options.outDir, names.manifest),
    full_package_manifest_sha256: fileSha256(manifestPath),
    release_manifest: path.join(options.outDir, names.releaseManifest),
    release_manifest_sha256: fileSha256(releaseManifestPath),
  };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  assertManagedOutputPath(options);
  const buildOutDir = options.printPlan ? options.outDir : managedOutputStage(options.outDir);
  let completed = false;
  let outputPromoted = false;
  try {
    const snapshots = repoSnapshots(options);
    const runtimeDependencies = prepareManualRuntimeDependencies(snapshots.shellRoot);
    const upstreams = prepareLatestUpstreams(path.join(options.cacheRoot, 'upstreams'));
    const sourceProvenance = {
      schema: 'opl_manual_latest_build_source_lock.v1',
      display_version: options.version,
      updater_version: options.updaterVersion,
      source_policy: {
        self_developed: 'clean_fresh_remote_canonical_origin_main_head',
        external_companions: 'latest_official_stable_release_or_tagged_distribution_digest_verified',
        package_selection: 'actual_selected_source_commits_recorded_in_full_package_manifest',
      },
      repositories: {
        app: snapshots.app,
        shell: snapshots.shell,
        framework: snapshots.framework,
        ...snapshots.owners,
      },
      runtime_dependencies: runtimeDependencies.lock,
      upstreams,
    };
    const localAppIdentity = deriveManualLocalAppIdentity(
      options.updaterVersion,
      manualSourceProvenanceSha256(sourceProvenance),
    );
    const sourceLock = {
      ...sourceProvenance,
      local_app_identity: localAppIdentity,
    };
    fs.mkdirSync(buildOutDir, { recursive: true });
    const stagedSourceLockPath = path.join(buildOutDir, 'manual-latest-source-lock.json');
    const sourceLockPath = path.join(options.outDir, 'manual-latest-source-lock.json');
    writeJson(stagedSourceLockPath, sourceLock);
    const sourceLockSha256 = fileSha256(stagedSourceLockPath);
    const stampedLocalAppIdentity = {
      ...localAppIdentity,
      source_lock_sha256: sourceLockSha256,
    };
    if (options.printPlan) {
      console.log(JSON.stringify({
        status: 'manual_latest_plan_ready',
        source_lock: sourceLockPath,
        source_lock_sha256: sourceLockSha256,
        ...sourceLock,
      }, null, 2));
      completed = true;
      return;
    }

    const buildOptions = { ...options, outDir: buildOutDir };
    const shellBuildProjection = captureShellBuildProjection(snapshots.shellRoot);
    try {
      runBuild(
        buildOptions,
        snapshots,
        upstreams,
        stampedLocalAppIdentity,
      );
    } finally {
      restoreShellBuildProjection(shellBuildProjection);
    }
    let installation = null;
    if (options.mode === 'local-app') {
      assertDevelopmentRepoSnapshotsUnchanged(developmentRepoSnapshots(snapshots));
      try {
        installation = installLocalApp({
          builtApp: findBuiltApp(snapshots.shellRoot),
          installPath: options.installPath,
          expectedVersionIdentity: {
            display_version: options.version,
            ...stampedLocalAppIdentity,
          },
          launch: options.launch,
        });
      } catch (error) {
        if (error instanceof ManualAppInstallationError) {
          const failureReceipt = persistInstallationFailure(
            options,
            sourceLock,
            stagedSourceLockPath,
            stampedLocalAppIdentity,
            error,
          );
          console.error(JSON.stringify({
            status: 'manual_latest_local_app_installation_failed',
            failure_receipt: failureReceipt,
            installation: error.receipt,
          }, null, 2));
        }
        throw error;
      }
      writeJson(path.join(buildOutDir, 'manual-local-app-installation.json'), installation);
    }
    const output = options.mode === 'full-dmg'
      ? fullDmgEvidence(options, buildOutDir)
      : {
          installed_app: options.installPath,
          installation_receipt: path.join(options.outDir, 'manual-local-app-installation.json'),
        };
    if (options.mode === 'full-dmg') {
      assertDevelopmentRepoSnapshotsUnchanged(developmentRepoSnapshots(snapshots));
    }
    writeJson(path.join(buildOutDir, 'manual-latest-build-receipt.json'), {
      schema: 'opl_manual_latest_build_receipt.v1',
      status: 'completed',
      mode: options.mode,
      display_version: options.version,
      updater_version: options.updaterVersion,
      bundle_version: options.mode === 'local-app'
        ? stampedLocalAppIdentity.machine_version
        : options.updaterVersion,
      local_build_id: options.mode === 'local-app'
        ? stampedLocalAppIdentity.local_build_id
        : null,
      build_identity: options.mode === 'local-app' ? stampedLocalAppIdentity : null,
      source_lock: sourceLockPath,
      source_lock_sha256: sourceLockSha256,
      output,
      installation,
    });
    promoteManagedOutput(buildOutDir, options.outDir);
    outputPromoted = true;
    console.log(JSON.stringify({
      status: options.mode === 'local-app' ? 'manual_latest_local_app_ready' : 'manual_latest_full_dmg_ready',
      source_lock: sourceLockPath,
      output_dir: options.outDir,
      output,
      installation,
    }, null, 2));
    completed = true;
  } finally {
    if (!options.printPlan && !outputPromoted) {
      fs.rmSync(buildOutDir, { recursive: true, force: true });
    }
    if (!completed) {
      console.error('Manual latest build did not complete; no success claim was written.');
    }
  }
}

export function isManualLatestBuildMain(
  moduleUrl = import.meta.url,
  executablePath = process.argv[1],
) {
  return (
    Boolean(executablePath) &&
    pathToFileURL(path.resolve(executablePath)).href === moduleUrl
  );
}

if (isManualLatestBuildMain()) main();
