#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const defaultAppRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supportedShells = ['aionui', 'opl-studio'] as const;

export type GuiShellId = (typeof supportedShells)[number];
export type GuiLaunchMode = 'packaged' | 'dev';

export type GuiLauncherArgs = {
  shell?: GuiShellId;
  mode?: GuiLaunchMode;
  rebuild: boolean;
  plan: boolean;
  workspace?: string;
  allowActions: boolean;
};

export type RuntimeExecutableIdentity = {
  schema: 'app_runtime_executable_identity.v1';
  opl_path: string;
  opl_version: string;
  codex_path: string;
  codex_version: string;
  runtime_cohort_ref: string;
};

type LaunchProfile = {
  adapter_contract: string;
  default_mode: GuiLaunchMode;
  supported_modes: GuiLaunchMode[];
  bundle_id: string;
  packaged_app_path?: string;
  bundle_relative_path?: string;
  dev_command?: string[];
  package_command?: string[];
};

type ShellCandidateRegistry = {
  interactive_launcher_policy: {
    selectable_shells: string[];
    selection_mutates_release_adoption: boolean;
    candidate_launch_implies_adoption: boolean;
    launch_profiles: Record<string, LaunchProfile>;
  };
};

type ActiveShellAdapter = {
  active_shell: string;
  shell_root: string;
};

export type GuiLaunchPlan = {
  status: 'gui_launch_planned';
  shell: GuiShellId;
  mode: GuiLaunchMode;
  shell_root: string | null;
  app_path: string | null;
  package_app_path: string | null;
  bundle_id: string;
  bundle_identity_isolated: boolean;
  build_required: boolean;
  rebuild_requested: boolean;
  workspace: string | null;
  candidate_actions: 'not_applicable' | 'dry_run_only' | 'explicitly_allowed';
  runtime_identity: RuntimeExecutableIdentity;
  package_command: { executable: string; args: string[]; cwd: string } | null;
  command: { executable: string; args: string[]; cwd: string };
  release_adoption_changed: false;
  updater_channel_changed: false;
};

export type GuiLauncherResult = Omit<GuiLaunchPlan, 'status'> & {
  status: 'gui_launch_planned' | 'gui_launched';
};

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function assertGuiShell(value: string): asserts value is GuiShellId {
  if (!supportedShells.includes(value as GuiShellId)) {
    throw new Error(`Unsupported GUI shell ${JSON.stringify(value)}; expected ${supportedShells.join(' or ')}`);
  }
}

function assertLaunchMode(value: string): asserts value is GuiLaunchMode {
  if (value !== 'packaged' && value !== 'dev') {
    throw new Error(`Unsupported GUI launch mode ${JSON.stringify(value)}; expected packaged or dev`);
  }
}

export function parseGuiLauncherArgs(argv: string[]): GuiLauncherArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      shell: { type: 'string' },
      mode: { type: 'string' },
      rebuild: { type: 'boolean', default: false },
      plan: { type: 'boolean', default: false },
      workspace: { type: 'string' },
      'allow-actions': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values.shell !== undefined) assertGuiShell(values.shell);
  if (values.mode !== undefined) assertLaunchMode(values.mode);
  return {
    shell: values.shell,
    mode: values.mode,
    rebuild: values.rebuild,
    plan: values.plan,
    workspace: values.workspace,
    allowActions: values['allow-actions'],
  };
}

function executableCandidates(name: string, env: NodeJS.ProcessEnv): string[] {
  if (path.isAbsolute(name)) return [name];
  return (env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .map((entry) => path.join(entry, name));
}

function resolveExecutable(name: string, env: NodeJS.ProcessEnv): string {
  for (const candidate of executableCandidates(name, env)) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return path.resolve(candidate);
    } catch {
      // Continue through PATH until an executable candidate is found.
    }
  }
  throw new Error(`Unable to resolve executable ${name} from PATH`);
}

function readOplPackageVersion(executable: string): string | null {
  let current = path.dirname(fs.realpathSync(executable));
  while (true) {
    const packagePath = path.join(current, 'package.json');
    if (fs.existsSync(packagePath)) {
      const packageJson = readJson<{ name?: string; version?: string }>(packagePath);
      if (packageJson.name === 'opl-framework' && packageJson.version) {
        return `${packageJson.name} ${packageJson.version}`;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function readExecutableVersion(executable: string, env: NodeJS.ProcessEnv): string {
  const result = spawnSync(executable, ['--version'], { encoding: 'utf8', env });
  if (result.status !== 0) {
    throw new Error(`Unable to read ${executable} version: ${(result.stderr || result.stdout).trim()}`);
  }
  const version = result.stdout.trim() || result.stderr.trim();
  if (!version) throw new Error(`Executable ${executable} returned an empty version`);
  return version.split(/\r?\n/, 1)[0];
}

export function resolveGuiRuntimeIdentity(options: {
  env?: NodeJS.ProcessEnv;
  oplCommand?: string;
  codexCommand?: string;
} = {}): RuntimeExecutableIdentity {
  const env = options.env ?? process.env;
  const oplPath = resolveExecutable(options.oplCommand ?? 'opl', env);
  const codexPath = resolveExecutable(options.codexCommand ?? 'codex', env);
  const oplVersion = readOplPackageVersion(oplPath) ?? readExecutableVersion(oplPath, env);
  const codexVersion = readExecutableVersion(codexPath, env);
  const cohortPayload = JSON.stringify({
    opl_path: oplPath,
    opl_version: oplVersion,
    codex_path: codexPath,
    codex_version: codexVersion,
  });
  const cohortHash = crypto.createHash('sha256').update(cohortPayload).digest('hex');
  return {
    schema: 'app_runtime_executable_identity.v1',
    opl_path: oplPath,
    opl_version: oplVersion,
    codex_path: codexPath,
    codex_version: codexVersion,
    runtime_cohort_ref: `sha256:${cohortHash}`,
  };
}

export function buildNativeCandidateOpenArgs(options: {
  appPath: string;
  runtimeIdentity: RuntimeExecutableIdentity;
  workspace: string;
  allowActions: boolean;
  env?: NodeJS.ProcessEnv;
}): string[] {
  const env = options.env ?? process.env;
  const injectedEnvironment: Record<string, string> = {
    PATH: env.PATH ?? '',
    OPL_APP_OPL_BIN: options.runtimeIdentity.opl_path,
    OPL_CODEX_BIN: options.runtimeIdentity.codex_path,
    OPL_NATIVE_WORKBENCH_CODEX_CWD: options.workspace,
    OPL_NATIVE_WORKBENCH_READ_ONLY: options.allowActions ? '0' : '1',
    OPL_APP_RUNTIME_IDENTITY_JSON: JSON.stringify(options.runtimeIdentity),
  };
  return [
    options.appPath,
    ...Object.entries(injectedEnvironment).flatMap(([name, value]) => ['--env', `${name}=${value}`]),
  ];
}

function resolveShellRoot(appRoot: string, shell: GuiShellId): string | null {
  const localRoot = path.join(appRoot, 'shells', shell);
  const siblingName = shell === 'aionui' ? 'opl-aion-shell' : 'opl-studio';
  const siblingRoot = path.resolve(appRoot, '..', siblingName);
  for (const candidate of [localRoot, siblingRoot]) {
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
  }
  return null;
}

function validateLauncherContracts(
  registry: ShellCandidateRegistry,
  activeAdapter: ActiveShellAdapter,
): Record<GuiShellId, LaunchProfile> {
  if (registry.interactive_launcher_policy.selectable_shells.join(',') !== supportedShells.join(',')) {
    throw new Error('Launcher contract selectable_shells must be exactly aionui and opl-studio');
  }
  if (
    registry.interactive_launcher_policy.selection_mutates_release_adoption ||
    registry.interactive_launcher_policy.candidate_launch_implies_adoption
  ) {
    throw new Error('Launcher contract must keep local selection separate from release adoption');
  }
  assertGuiShell(activeAdapter.active_shell);
  const profiles = registry.interactive_launcher_policy.launch_profiles;
  const aionui = profiles.aionui;
  const native = profiles['opl-studio'];
  if (!aionui || !native) throw new Error('Launcher contract is missing a required launch profile');
  if (aionui.bundle_id === native.bundle_id) {
    throw new Error('Mainline and candidate GUI bundle identities must differ');
  }
  return { aionui, 'opl-studio': native };
}

function resolveWorkspace(workspace: string | undefined): string {
  const resolved = path.resolve(workspace ?? process.cwd());
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`GUI workspace is not a directory: ${resolved}`);
  }
  return resolved;
}

export function createGuiLaunchPlan(options: {
  args: GuiLauncherArgs;
  appRoot?: string;
  env?: NodeJS.ProcessEnv;
}): GuiLaunchPlan {
  const appRoot = path.resolve(options.appRoot ?? defaultAppRoot);
  const env = options.env ?? process.env;
  const registry = readJson<ShellCandidateRegistry>(path.join(appRoot, 'contracts/app-shell-candidates.json'));
  const activeAdapter = readJson<ActiveShellAdapter>(path.join(appRoot, 'contracts/app-shell-adapter.json'));
  const profiles = validateLauncherContracts(registry, activeAdapter);
  const shell = options.args.shell ?? activeAdapter.active_shell;
  assertGuiShell(shell);
  const activeStudioDefault = !options.args.shell && activeAdapter.active_shell === 'opl-studio';
  const profile: LaunchProfile = activeStudioDefault
    ? { adapter_contract: 'contracts/app-shell-adapter.json', default_mode: 'packaged', supported_modes: ['packaged', 'dev'], bundle_id: 'cn.onepersonlab.opl', packaged_app_path: '/Applications/One Person Lab.app', dev_command: ['npm', 'run', 'dev:desktop'] }
    : profiles[shell];
  const mode = options.args.mode ?? profile.default_mode;
  if (!profile.supported_modes.includes(mode)) {
    throw new Error(`GUI shell ${shell} does not support ${mode} mode`);
  }
  if (shell !== 'opl-studio' && (options.args.rebuild || options.args.workspace || options.args.allowActions)) {
    throw new Error('--rebuild, --workspace and --allow-actions apply only to opl-studio');
  }

  const runtimeIdentity = resolveGuiRuntimeIdentity({ env });
  const shellRoot = resolveShellRoot(appRoot, shell);
  let appPath: string | null = null;
  let packageAppPath: string | null = null;
  let executable: string;
  let commandArgs: string[];
  let commandCwd = appRoot;
  let packageCommand: GuiLaunchPlan['package_command'] = null;
  let workspace: string | null = null;
  let buildRequired = false;

  if (mode === 'dev') {
    if (!shellRoot || !profile.dev_command) {
      throw new Error(`Missing ${shell} checkout required for dev launch`);
    }
    [executable, ...commandArgs] = profile.dev_command;
    commandCwd = shellRoot;
  } else if (shell === 'aionui' || activeStudioDefault) {
    appPath = profile.packaged_app_path ?? null;
    if (!appPath || !fs.existsSync(appPath)) {
      throw new Error(`Installed mainline GUI is missing at ${appPath ?? 'an unspecified path'}`);
    }
    executable = '/usr/bin/open';
    commandArgs = [appPath];
  } else {
    if (!profile.packaged_app_path || !profile.bundle_relative_path || !profile.package_command) {
      throw new Error('Native launch profile must declare installed path, package output, and package command');
    }
    appPath = profile.packaged_app_path;
    buildRequired = options.args.rebuild || !fs.existsSync(appPath);
    if (buildRequired && !shellRoot) {
      throw new Error('Missing opl-studio checkout required to build the installed Native app');
    }
    if (shellRoot) {
      packageAppPath = path.join(shellRoot, profile.bundle_relative_path);
      const [packageExecutable, ...packageArgs] = profile.package_command;
      packageCommand = { executable: packageExecutable, args: packageArgs, cwd: shellRoot };
    }
    workspace = resolveWorkspace(options.args.workspace);
    executable = '/usr/bin/open';
    commandArgs = buildNativeCandidateOpenArgs({
      appPath,
      runtimeIdentity,
      workspace,
      allowActions: options.args.allowActions,
      env,
    });
    commandCwd = shellRoot ?? appRoot;
  }

  return {
    status: 'gui_launch_planned',
    shell,
    mode,
    shell_root: shellRoot,
    app_path: appPath,
    package_app_path: packageAppPath,
    bundle_id: profile.bundle_id,
    bundle_identity_isolated: profiles.aionui.bundle_id !== profiles['opl-studio'].bundle_id,
    build_required: buildRequired,
    rebuild_requested: options.args.rebuild,
    workspace,
    candidate_actions: shell === 'opl-studio' && !activeStudioDefault
      ? (options.args.allowActions ? 'explicitly_allowed' : 'dry_run_only')
      : 'not_applicable',
    runtime_identity: runtimeIdentity,
    package_command: packageCommand,
    command: { executable, args: commandArgs, cwd: commandCwd },
    release_adoption_changed: false,
    updater_channel_changed: false,
  };
}

function runChecked(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, label: string): void {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
}

export function readAppBundleIdentifier(appPath: string): string {
  const plistPath = path.join(appPath, 'Contents', 'Info.plist');
  if (!fs.existsSync(plistPath)) throw new Error(`App bundle is missing Info.plist: ${appPath}`);
  const result = spawnSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plistPath], {
    encoding: 'utf8',
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const bundleId = stdout.trim();
  if (result.status !== 0 || !bundleId) {
    const detail = stderr.trim() || stdout.trim() || result.error?.message || `exit ${result.status ?? 'unknown'}`;
    throw new Error(`Unable to read CFBundleIdentifier from ${appPath}: ${detail}`);
  }
  return bundleId;
}

export type AppBundleOperations = {
  readIdentifier: (appPath: string) => string;
  copy: (sourceAppPath: string, stagedAppPath: string, installDir: string, env: NodeJS.ProcessEnv) => void;
};

const macOsAppBundleOperations: AppBundleOperations = {
  readIdentifier: readAppBundleIdentifier,
  copy: (sourceAppPath, stagedAppPath, installDir, env) => {
    runChecked('/usr/bin/ditto', [sourceAppPath, stagedAppPath], installDir, env, 'Native app staging');
  },
};

function assertAppBundleIdentity(
  appPath: string,
  expectedBundleId: string,
  appBundleOperations: AppBundleOperations = macOsAppBundleOperations,
): void {
  const actualBundleId = appBundleOperations.readIdentifier(appPath);
  if (actualBundleId !== expectedBundleId) {
    throw new Error(`Refusing app bundle ${appPath}: expected ${expectedBundleId}, found ${actualBundleId}`);
  }
}

export function installAppBundleAtomically(options: {
  sourceAppPath: string;
  installedAppPath: string;
  expectedBundleId: string;
  env?: NodeJS.ProcessEnv;
  appBundleOperations?: AppBundleOperations;
}): void {
  const sourceAppPath = path.resolve(options.sourceAppPath);
  const installedAppPath = path.resolve(options.installedAppPath);
  const appBundleOperations = options.appBundleOperations ?? macOsAppBundleOperations;
  if (sourceAppPath === installedAppPath) throw new Error('Package source and installed app paths must differ');
  if (!fs.existsSync(sourceAppPath)) throw new Error(`Packaged Native app is missing at ${sourceAppPath}`);
  assertAppBundleIdentity(sourceAppPath, options.expectedBundleId, appBundleOperations);
  if (fs.existsSync(installedAppPath)) {
    assertAppBundleIdentity(installedAppPath, options.expectedBundleId, appBundleOperations);
  }

  const installDir = path.dirname(installedAppPath);
  fs.mkdirSync(installDir, { recursive: true });
  const nonce = `${process.pid}-${Date.now()}`;
  const stagedPath = path.join(installDir, `.${path.basename(installedAppPath)}.install-${nonce}`);
  const backupPath = path.join(installDir, `.${path.basename(installedAppPath)}.backup-${nonce}`);
  fs.rmSync(stagedPath, { recursive: true, force: true });
  fs.rmSync(backupPath, { recursive: true, force: true });

  appBundleOperations.copy(sourceAppPath, stagedPath, installDir, options.env ?? process.env);
  assertAppBundleIdentity(stagedPath, options.expectedBundleId, appBundleOperations);
  const hadExistingApp = fs.existsSync(installedAppPath);
  try {
    if (hadExistingApp) fs.renameSync(installedAppPath, backupPath);
    fs.renameSync(stagedPath, installedAppPath);
  } catch (error) {
    fs.rmSync(stagedPath, { recursive: true, force: true });
    if (hadExistingApp && fs.existsSync(backupPath) && !fs.existsSync(installedAppPath)) {
      fs.renameSync(backupPath, installedAppPath);
    }
    throw error;
  }
  fs.rmSync(backupPath, { recursive: true, force: true });
  assertAppBundleIdentity(installedAppPath, options.expectedBundleId, appBundleOperations);
}

export function executeGuiLaunchPlan(plan: GuiLaunchPlan, env: NodeJS.ProcessEnv = process.env): void {
  if (plan.build_required) {
    if (!plan.package_command || !plan.package_app_path || !plan.app_path) {
      throw new Error(`No package/install plan is declared for ${plan.shell}`);
    }
    runChecked(
      plan.package_command.executable,
      plan.package_command.args,
      plan.package_command.cwd,
      env,
      `${plan.shell} package`,
    );
    installAppBundleAtomically({
      sourceAppPath: plan.package_app_path,
      installedAppPath: plan.app_path,
      expectedBundleId: plan.bundle_id,
      env,
    });
  }
  if (plan.app_path) assertAppBundleIdentity(plan.app_path, plan.bundle_id);
  runChecked(plan.command.executable, plan.command.args, plan.command.cwd, env, `${plan.shell} launch`);
}

export function runGuiLauncher(argv: string[], options: {
  appRoot?: string;
  env?: NodeJS.ProcessEnv;
} = {}): GuiLauncherResult {
  const args = parseGuiLauncherArgs(argv);
  const plan = createGuiLaunchPlan({ args, appRoot: options.appRoot, env: options.env });
  if (!args.plan) executeGuiLaunchPlan(plan, options.env);
  return { ...plan, status: args.plan ? 'gui_launch_planned' : 'gui_launched' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runGuiLauncher(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      status: 'gui_launch_blocked',
      error: error instanceof Error ? error.message : String(error),
      release_adoption_changed: false,
      updater_channel_changed: false,
    }, null, 2));
    process.exitCode = 1;
  }
}
