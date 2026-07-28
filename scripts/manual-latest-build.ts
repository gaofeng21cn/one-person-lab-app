#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { resolveActiveShellPaths } from './app-shell-adapter.ts';
import { findBuiltApp } from './build-full-first-install-package/archive-output.ts';
import {
  assertReleaseVersionNotFuture,
  assertUpdaterVersionMatchesDisplay,
} from './release-version.ts';
import {
  assertDevelopmentRepoSnapshotsUnchanged,
  commandResult,
  deriveManualLocalAppIdentity,
  fileSha256,
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

const MANUAL_RUNTIME_KEY = 'darwin-arm64';
const MANAGED_CODEX_ACP_PACKAGE = '@agentclientprotocol/codex-acp';
const MANAGED_CODEX_PACKAGE = '@openai/codex';

function requiredString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`AionCore managed Codex binding is missing ${label}`);
  }
  return value.trim();
}

function requiredSha512Integrity(value: unknown, label: string) {
  const integrity = requiredString(value, label);
  if (!integrity.startsWith('sha512-')) {
    throw new Error(`AionCore managed Codex binding has invalid ${label}`);
  }
  return integrity;
}

function requiredObject(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`AionCore managed Codex binding is missing ${label}`);
  }
  return value as Record<string, any>;
}

function requireStrictDescendant(
  root: string,
  candidate: string,
  label: string,
) {
  const rootRealpath = fs.realpathSync(root);
  const candidateRealpath = fs.realpathSync(candidate);
  const relative = path.relative(rootRealpath, candidateRealpath);
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `AionCore managed Codex ${label} escapes its selected Shell resource root`,
    );
  }
  return candidateRealpath;
}

export function resolveAioncoreManagedCodexBinding(shellRoot: string) {
  const shellRealpath = fs.realpathSync(shellRoot);
  const runtimeRoot = path.join(
    shellRealpath,
    'resources',
    'bundled-aioncore',
    MANUAL_RUNTIME_KEY,
  );
  const rootManifestPath = requireFile(
    path.join(runtimeRoot, 'manifest.json'),
    'AionCore root manifest',
  );
  const managedRoot = path.join(runtimeRoot, 'managed-resources');
  const managedManifestPath = requireFile(
    path.join(managedRoot, 'manifest.json'),
    'AionCore managed-resources manifest',
  );
  const rootManifest = requiredObject(
    readJson(rootManifestPath),
    'root manifest',
  );
  const managedManifest = requiredObject(
    readJson(managedManifestPath),
    'managed-resources manifest',
  );
  const aioncoreVersion = requiredString(
    rootManifest.version,
    'AionCore version',
  );
  const source = requiredObject(rootManifest.source, 'AionCore source');
  const sourceUrl = requiredString(source.url, 'AionCore source URL');
  if (rootManifest.platform !== 'darwin' || rootManifest.arch !== 'arm64') {
    throw new Error(
      `AionCore root manifest target mismatch: expected ${MANUAL_RUNTIME_KEY}`,
    );
  }
  if (managedManifest.runtimeKey !== MANUAL_RUNTIME_KEY) {
    throw new Error(
      `AionCore managed-resources runtimeKey mismatch: expected ${MANUAL_RUNTIME_KEY}`,
    );
  }

  const tools = Array.isArray(managedManifest.acpTools)
    ? managedManifest.acpTools
    : [];
  const matches = tools.filter((tool) => tool?.slug === 'codex-acp');
  if (matches.length !== 1) {
    throw new Error(
      'AionCore managed-resources manifest must contain exactly one codex-acp tool',
    );
  }
  const tool = requiredObject(matches[0], 'codex-acp tool');
  const acpVersion = requiredString(tool.version, 'codex-acp version');
  const toolRootRelative = requiredString(tool.root, 'codex-acp root');
  const expectedToolRoot = `acp/codex-acp/${acpVersion}/${MANUAL_RUNTIME_KEY}`;
  if (
    tool.packageName !== MANAGED_CODEX_ACP_PACKAGE ||
    toolRootRelative !== expectedToolRoot
  ) {
    throw new Error(
      'AionCore managed codex-acp package identity is inconsistent',
    );
  }
  const toolRoot = requireStrictDescendant(
    managedRoot,
    path.resolve(managedRoot, toolRootRelative),
    'tool root',
  );
  if (
    !Array.isArray(tool.requiredFiles) ||
    !Array.isArray(tool.requiredDirectories)
  ) {
    throw new Error('AionCore managed codex-acp required paths are invalid');
  }
  for (const requiredFile of [
    ...tool.requiredFiles,
    requiredString(tool.manifest, 'tool manifest'),
  ]) {
    requireFile(
      path.join(toolRoot, requiredString(requiredFile, 'required file')),
      'AionCore managed Codex required',
    );
  }
  for (const requiredDirectory of tool.requiredDirectories) {
    const directory = path.join(
      toolRoot,
      requiredString(requiredDirectory, 'required directory'),
    );
    if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(
        `AionCore managed Codex directory is missing: ${directory}`,
      );
    }
  }
  requireFile(
    path.join(
      toolRoot,
      requiredString(tool.entrypoint, 'codex-acp entrypoint'),
    ),
    'AionCore managed codex-acp entrypoint',
  );

  const packageJsonPath = requireFile(
    path.join(toolRoot, 'package.json'),
    'codex-acp package.json',
  );
  const packageLockPath = requireFile(
    path.join(toolRoot, 'package-lock.json'),
    'codex-acp package-lock.json',
  );
  const packageJson = requiredObject(
    readJson(packageJsonPath),
    'codex-acp package.json',
  );
  const packageLock = requiredObject(
    readJson(packageLockPath),
    'codex-acp package-lock.json',
  );
  const lockPackages = requiredObject(
    packageLock.packages,
    'package-lock packages',
  );
  const lockRoot = requiredObject(lockPackages[''], 'package-lock root');
  const acpLock = requiredObject(
    lockPackages[`node_modules/${MANAGED_CODEX_ACP_PACKAGE}`],
    'codex-acp lock entry',
  );
  if (
    !Number.isInteger(packageLock.lockfileVersion) ||
    packageLock.lockfileVersion < 2 ||
    packageJson.dependencies?.[MANAGED_CODEX_ACP_PACKAGE] !== acpVersion ||
    lockRoot.dependencies?.[MANAGED_CODEX_ACP_PACKAGE] !== acpVersion ||
    acpLock.version !== acpVersion
  ) {
    throw new Error(
      'AionCore managed codex-acp package lock version is inconsistent',
    );
  }
  const acpIntegrity = requiredSha512Integrity(
    acpLock.integrity,
    'codex-acp lock integrity',
  );

  const codexRoot = requireStrictDescendant(
    toolRoot,
    path.join(toolRoot, 'node_modules', '@openai', 'codex'),
    'Codex package root',
  );
  const codexPackageJsonPath = requireFile(
    path.join(codexRoot, 'package.json'),
    'managed Codex package.json',
  );
  const codexPackageJson = requiredObject(
    readJson(codexPackageJsonPath),
    'managed Codex package.json',
  );
  const codexLock = requiredObject(
    lockPackages['node_modules/@openai/codex'],
    'managed Codex lock entry',
  );
  const codexVersion = requiredString(
    codexLock.version,
    'managed Codex version',
  );
  const codexIntegrity = requiredSha512Integrity(
    codexLock.integrity,
    'managed Codex lock integrity',
  );
  if (
    codexPackageJson.name !== MANAGED_CODEX_PACKAGE ||
    codexPackageJson.version !== codexVersion
  ) {
    throw new Error(
      'AionCore managed Codex package and lock versions are inconsistent',
    );
  }

  const platformPackageName = `@openai/codex-${MANUAL_RUNTIME_KEY}`;
  const platformLock = requiredObject(
    lockPackages[`node_modules/${platformPackageName}`],
    'managed Codex platform lock entry',
  );
  const platformVersion = `${codexVersion}-${MANUAL_RUNTIME_KEY}`;
  const platformIntegrity = requiredSha512Integrity(
    platformLock.integrity,
    'managed Codex platform lock integrity',
  );
  if (
    codexPackageJson.optionalDependencies?.[platformPackageName] !==
      `npm:${MANAGED_CODEX_PACKAGE}@${platformVersion}` ||
    platformLock.name !== MANAGED_CODEX_PACKAGE ||
    platformLock.version !== platformVersion
  ) {
    throw new Error(
      'AionCore managed Codex platform package and lock versions are inconsistent',
    );
  }
  const platformPackageJsonPath = requireFile(
    path.join(
      toolRoot,
      'node_modules',
      '@openai',
      `codex-${MANUAL_RUNTIME_KEY}`,
      'package.json',
    ),
    'managed Codex platform package.json',
  );
  const platformPackageJson = requiredObject(
    readJson(platformPackageJsonPath),
    'managed Codex platform package.json',
  );
  if (
    platformPackageJson.name !== MANAGED_CODEX_PACKAGE ||
    platformPackageJson.version !== platformVersion
  ) {
    throw new Error(
      'AionCore managed Codex installed platform package version is inconsistent',
    );
  }
  const platformExecutable = requireStrictDescendant(
    toolRoot,
    path.join(
      toolRoot,
      requiredString(
        tool.platformExecutable,
        'managed Codex platform executable',
      ),
    ),
    'platform executable',
  );
  requireFile(platformExecutable, 'managed Codex platform executable');
  const aioncoreBinary = requireFile(
    path.join(runtimeRoot, 'aioncore'),
    'AionCore binary',
  );

  return {
    schema: 'opl_manual_aioncore_managed_codex_binding.v1',
    runtime_key: MANUAL_RUNTIME_KEY,
    aioncore: {
      version: aioncoreVersion,
      source_type: requiredString(
        rootManifest.sourceType,
        'AionCore source type',
      ),
      source_url: sourceUrl,
      root: runtimeRoot,
      root_manifest: rootManifestPath,
      root_manifest_sha256: fileSha256(rootManifestPath),
      binary: aioncoreBinary,
      binary_sha256: fileSha256(aioncoreBinary),
    },
    managed_resources: {
      root: managedRoot,
      manifest: managedManifestPath,
      manifest_sha256: fileSha256(managedManifestPath),
    },
    codex_acp: {
      package: MANAGED_CODEX_ACP_PACKAGE,
      version: acpVersion,
      root: toolRoot,
      manifest: path.join(
        toolRoot,
        requiredString(tool.manifest, 'tool manifest'),
      ),
      package_json: packageJsonPath,
      package_json_sha256: fileSha256(packageJsonPath),
      package_lock: packageLockPath,
      package_lock_sha256: fileSha256(packageLockPath),
      lock_integrity: acpIntegrity,
      entrypoint: path.join(
        toolRoot,
        requiredString(tool.entrypoint, 'codex-acp entrypoint'),
      ),
    },
    codex_cli: {
      package: MANAGED_CODEX_PACKAGE,
      version: codexVersion,
      root: codexRoot,
      package_json: codexPackageJsonPath,
      package_json_sha256: fileSha256(codexPackageJsonPath),
      lock_resolved: requiredString(
        codexLock.resolved,
        'managed Codex lock resolved URL',
      ),
      lock_integrity: codexIntegrity,
      platform_package: platformPackageName,
      platform_version: platformVersion,
      platform_package_json: platformPackageJsonPath,
      platform_package_json_sha256: fileSha256(platformPackageJsonPath),
      platform_lock_resolved: requiredString(
        platformLock.resolved,
        'managed Codex platform lock resolved URL',
      ),
      platform_lock_integrity: platformIntegrity,
      platform_executable: platformExecutable,
      platform_executable_sha256: fileSha256(platformExecutable),
    },
  };
}

function prepareAioncoreManagedCodexBinding(shellRoot: string) {
  const prepareScript = requireFile(
    path.join(shellRoot, 'scripts', 'prepareAioncore.js'),
    'selected Shell prepareAioncore script',
  );
  commandResult(process.execPath, [prepareScript], {
    cwd: shellRoot,
    env: { ...process.env, AIONUI_BACKEND_ARCH: 'arm64' },
    timeoutMs: 20 * 60 * 1000,
  });
  return resolveAioncoreManagedCodexBinding(shellRoot);
}

export function buildManualRuntimeDependencyLock(
  binding: ReturnType<typeof resolveAioncoreManagedCodexBinding>,
) {
  return { aioncore_managed_codex: binding };
}

export function buildAioncoreManagedCodexArgs(
  binding: ReturnType<typeof resolveAioncoreManagedCodexBinding>,
) {
  return ['--codex-root', binding.codex_cli.root];
}

export function assertFullDmgCodexBinding(
  manifest: any,
  binding: ReturnType<typeof resolveAioncoreManagedCodexBinding>,
) {
  const codex = manifest?.components?.codex;
  const sourcePath = requiredString(
    codex?.source_path,
    'Full manifest Codex source_path',
  );
  const sourceRealpath = fs.realpathSync(sourcePath);
  if (sourceRealpath !== binding.codex_cli.root) {
    throw new Error(
      `Full manifest Codex source mismatch: actual=${sourceRealpath} expected=${binding.codex_cli.root}`,
    );
  }
  const expectedVersion = `codex-cli ${binding.codex_cli.version}`;
  if (codex?.version !== expectedVersion) {
    throw new Error(
      `Full manifest Codex version mismatch: actual=${String(codex?.version)} expected=${expectedVersion}`,
    );
  }
}

function assertAioncoreManagedCodexBindingUnchanged(
  expected: ReturnType<typeof resolveAioncoreManagedCodexBinding>,
  actual: ReturnType<typeof resolveAioncoreManagedCodexBinding>,
) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      'AionCore managed Codex binding changed after source-lock freeze',
    );
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
    bundle_version: buildIdentity.bundle_version,
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
      'ui-ux-pro-max-root': { type: 'string' },
      'cache-root': { type: 'string' },
      'out-dir': { type: 'string' },
      'install-path': { type: 'string' },
      'no-launch': { type: 'boolean', default: false },
      'reuse-gui-vite-output': { type: 'boolean', default: false },
      'print-plan': { type: 'boolean', default: false },
      'keep-workdir': { type: 'boolean', default: false },
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
  const defaults = manualVersions();
  const version = values.version?.trim() || defaults.displayVersion;
  const updaterVersion = values['updater-version']?.trim() || defaults.updaterVersion;
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
    uiUxProMaxRoot: values['ui-ux-pro-max-root']
      ? path.resolve(values['ui-ux-pro-max-root'])
      : null,
    cacheRoot,
    outDir,
    installPath: path.resolve(values['install-path'] || '/Applications/One Person Lab.app'),
    launch: !values['no-launch'],
    reuseGuiViteOutput: values['reuse-gui-vite-output'],
    printPlan: values['print-plan'],
    keepWorkdir: values['keep-workdir'],
  } as const;
}

function printHelp() {
  console.log(`Usage:
  bun run manual:local-app -- [options]
  bun run manual:full-dmg -- [options]

Shared policy:
  - self-developed App, Shell, Framework, and first-party packages come from clean development-directory main HEADs
  - external companions come from the latest official stable GitHub Release and must match its sha256 digest

Options:
  --version <YY.M.D>              Display version (default: current Asia/Shanghai date)
  --updater-version <YY.M.D00>    Machine updater version (default: current date + 00)
  --workspace-root <path>         Development repositories root
  --out-dir <path>                Evidence/DMG output directory
  --install-path <path>           local-app target (default: /Applications/One Person Lab.app)
  --no-launch                     Do not relaunch local-app after replacement
  --reuse-gui-vite-output         Reuse an already compiled Shell frontend
  --print-plan                    Resolve and verify inputs without building
  --keep-workdir                  Keep the temporary Framework overlay for diagnosis

Guide: docs/delivery/release/manual-latest-builds.md`);
}

function resolveUiUxRoot(workspaceRoot: string, explicit: string | null) {
  const candidates = [
    explicit,
    path.join(workspaceRoot, 'ui-ux-pro-max-skill'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const found = candidates.find((candidate) => fs.statSync(candidate, { throwIfNoEntry: false })?.isDirectory());
  if (!found) throw new Error(`UI UX Pro Max source is missing; checked: ${candidates.join(', ')}`);
  return found;
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
  const uiUxRoot = resolveUiUxRoot(options.workspaceRoot, options.uiUxProMaxRoot);
  const uiUxRepoRoot = commandResult('git', ['-C', uiUxRoot, 'rev-parse', '--show-toplevel'], {
    capture: true,
    timeoutMs: 30_000,
  }).stdout?.trim();
  if (!uiUxRepoRoot) throw new Error(`Cannot resolve UI UX Pro Max repository: ${uiUxRoot}`);
  return {
    app: snapshotDevelopmentRepo('app', appRoot),
    shell: snapshotDevelopmentRepo('shell', shellRoot),
    framework,
    owners,
    ui_ux_pro_max: snapshotDevelopmentRepo('ui-ux-pro-max', uiUxRepoRoot),
    shellRoot,
    uiUxRoot,
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
    snapshots.ui_ux_pro_max,
  ];
}

function runBuild(
  options: ReturnType<typeof parseOptions> & { help: false },
  snapshots: ReturnType<typeof repoSnapshots>,
  upstreams: ReturnType<typeof prepareLatestUpstreams>,
  aioncoreBinding: ReturnType<typeof resolveAioncoreManagedCodexBinding>,
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
    '--ui-ux-pro-max-root', snapshots.uiUxRoot,
    '--temporal-cli-bin', upstreams.temporal.binary,
    '--temporal-cli-archive', upstreams.temporal.archive,
    ...buildAioncoreManagedCodexArgs(aioncoreBinding),
  ];
  if (options.mode === 'local-app') args.push('--app-only');
  if (options.reuseGuiViteOutput) args.push('--reuse-gui-vite-output');
  commandResult(process.execPath, args, {
    cwd: appRoot,
    env: {
      ...buildEnvironment(snapshots),
      OPL_MANUAL_LOCAL_BUNDLE_VERSION: options.mode === 'local-app'
        ? buildIdentity.bundle_version
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
  aioncoreBinding: ReturnType<typeof resolveAioncoreManagedCodexBinding>,
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
  assertFullDmgCodexBinding(manifest, aioncoreBinding);
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
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-manual-latest-build-'));
  const buildOutDir = options.printPlan ? options.outDir : managedOutputStage(options.outDir);
  let completed = false;
  let outputPromoted = false;
  try {
    const snapshots = repoSnapshots(options);
    const aioncoreBinding = prepareAioncoreManagedCodexBinding(
      snapshots.shellRoot,
    );
    const upstreams = prepareLatestUpstreams(path.join(options.cacheRoot, 'upstreams'));
    const sourceProvenance = {
      schema: 'opl_manual_latest_build_source_lock.v1',
      display_version: options.version,
      updater_version: options.updaterVersion,
      source_policy: {
        self_developed: 'clean_development_directory_main_head',
        external_companions: 'latest_official_stable_github_release_digest_verified',
        package_selection: 'actual_selected_source_commits_recorded_in_full_package_manifest',
      },
      repositories: {
        app: snapshots.app,
        shell: snapshots.shell,
        framework: snapshots.framework,
        ...snapshots.owners,
        ui_ux_pro_max: snapshots.ui_ux_pro_max,
      },
      runtime_dependencies: buildManualRuntimeDependencyLock(aioncoreBinding),
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
    runBuild(
      buildOptions,
      snapshots,
      upstreams,
      aioncoreBinding,
      stampedLocalAppIdentity,
    );
    assertAioncoreManagedCodexBindingUnchanged(
      aioncoreBinding,
      resolveAioncoreManagedCodexBinding(snapshots.shellRoot),
    );
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
      ? fullDmgEvidence(options, buildOutDir, aioncoreBinding)
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
        ? stampedLocalAppIdentity.bundle_version
        : options.updaterVersion,
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
    if (!options.keepWorkdir) {
      fs.rmSync(workRoot, { recursive: true, force: true });
    } else {
      console.error(`Manual latest build workdir retained: ${workRoot}`);
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
