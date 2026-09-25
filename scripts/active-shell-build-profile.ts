import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export type ActiveShellBuildProfile = {
  id: 'aionui' | 'opl-studio';
  repository: string;
  root: string;
  packageName: string;
  packageManager: 'bun' | 'npm';
  lockfile: string;
  builderConfig: string;
  smokeHarness: string;
  fullRuntimeResourceDir: string;
};

export function readActiveShellBuildProfile(repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'))): ActiveShellBuildProfile {
  const adapter = readJson(path.join(repositoryRoot, 'contracts/app-shell-adapter.json'));
  const id = adapter.active_shell;
  if (id !== 'aionui' && id !== 'opl-studio') throw new Error(`Unsupported active Shell build identity: ${String(id)}`);
  const expectedRepository = id === 'opl-studio' ? 'gaofeng21cn/opl-studio' : 'gaofeng21cn/opl-aion-shell';
  if (adapter.shell_source?.owner_repo !== expectedRepository) throw new Error('Active Shell repository does not match its build identity.');
  const root = adapter.shell_root;
  if (root !== `shells/${id}` || adapter.shell_source?.checkout_path !== root) throw new Error('Active Shell checkout path does not match its build identity.');
  const builderConfig = adapter.shell_contract?.paths?.electron_builder_config;
  if (typeof builderConfig !== 'string' || path.isAbsolute(builderConfig) || builderConfig.split(/[\\/]/).includes('..')) throw new Error('Active Shell builder configuration must be repository-relative.');
  return {
    id,
    repository: expectedRepository,
    root,
    packageName: id === 'opl-studio' ? 'opl-studio' : 'one-person-lab-aion-shell',
    packageManager: id === 'opl-studio' ? 'npm' : 'bun',
    lockfile: id === 'opl-studio' ? 'package-lock.json' : 'bun.lock',
    builderConfig,
    fullRuntimeResourceDir: path.posix.basename(adapter.shell_contract.paths.packaged_runtime_root),
    smokeHarness: id === 'opl-studio' ? 'scripts/desktop/stable-smoke.mjs' : 'scripts/opl-first-run-vm-smoke.mjs',
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values } = parseArgs({ options: { 'app-root': { type: 'string' }, 'github-output': { type: 'string' } }, strict: true });
  const profile = readActiveShellBuildProfile(values['app-root']);
  if (values['github-output']) {
    fs.appendFileSync(values['github-output'], Object.entries({
      shell_id: profile.id, shell_repository: profile.repository, shell_root: profile.root,
      package_manager: profile.packageManager, package_lock: profile.lockfile,
      builder_config: profile.builderConfig, smoke_harness: profile.smokeHarness,
      full_runtime_resource_dir: profile.fullRuntimeResourceDir,
    }).map(([key, value]) => `${key}=${value}\n`).join(''));
  }
  process.stdout.write(`${JSON.stringify(profile, null, 2)}\n`);
}
