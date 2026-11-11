import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildPackagedModuleMarker, PACKAGED_MODULE_MARKER_FILE } from '../full-first-install-package.ts';
import { appRepoRoot } from './paths.ts';
import { FULL_RUNTIME_STARTER_PROFILE } from './runtime-cache-package-set.ts';

const digest = (bytes: Buffer) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;

function relativePath(value: unknown): string {
  if (typeof value !== 'string' || !value || path.posix.isAbsolute(value)
    || value.includes('\\') || value.includes('\0') || value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Full component seed requires a safe owner-relative path.');
  }
  return value;
}

function repository(value: string): string {
  const match = value.match(/(?:github\.com|ssh\.github\.com)(?::\d+)?[/:]([^/]+\/[^/]+?)(?:\.git)?$/);
  if (!match) throw new Error('Full component seed requires its declared GitHub owner repository.');
  return match[1];
}

// Consume the frozen Framework projection and payload; do not maintain an App component list.
export function selectedLocalComponentSeedInputs(options: Record<string, any>, packageIds = FULL_RUNTIME_STARTER_PROFILE.package_ids) {
  const projectionRoot = path.join(options.frameworkRoot ?? '', 'contracts/opl-framework/packages');
  if (!fs.existsSync(projectionRoot)) return [];
  const selected = new Set(packageIds);
  return fs.readdirSync(projectionRoot).filter(name => name.endsWith('.json')).sort().flatMap(name => {
    const ownerBytes = fs.readFileSync(path.join(projectionRoot, name));
    const owner = JSON.parse(ownerBytes.toString('utf8'));
    if (!selected.has(owner.package_id) || owner.management_scope !== 'local_component') return [];
    if (owner.codex_surface?.configured_codex_plugin_carrier?.publication_ref != null) return [];
    if (typeof owner.package_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(owner.package_id)) {
      throw new Error('Full component seed owner package id is invalid.');
    }
    const surface = owner.codex_surface;
    const payloadRef = relativePath(surface?.plugin_payload_manifest_url);
    const payloadBytes = fs.readFileSync(path.join(projectionRoot, payloadRef));
    const payload = JSON.parse(payloadBytes.toString('utf8'));
    if (!/^[a-f0-9]{40}$/.test(surface?.carrier_source_commit ?? '')
      || payload.source_commit !== surface.carrier_source_commit || payload.package_id !== owner.package_id
      || payload.package_version !== owner.version || payload.source_repo !== owner.source_repo
      || !Array.isArray(payload.files) || !payload.files.length) {
      throw new Error(`Full component seed owner/payload identity drifted: ${owner.package_id}`);
    }
    relativePath(payload.source_root);
    return [{ package_id: owner.package_id, source_repo: owner.source_repo, source_commit: payload.source_commit,
      owner_sha256: digest(ownerBytes), payload_sha256: digest(payloadBytes), payload }];
  });
}

export function materializeSelectedLocalComponentSeeds(runtimeRoot: string, options: Record<string, any>, packageIds = FULL_RUNTIME_STARTER_PROFILE.package_ids) {
  for (const seed of selectedLocalComponentSeedInputs(options, packageIds)) {
    const ownerRepo = repository(seed.source_repo);
    const roots = [options.appRepoRoot ?? appRepoRoot,
      ...Object.entries(options).filter(([key, value]) => key.endsWith('Root') && typeof value === 'string').map(([, value]) => value as string)];
    const sourceRoot = roots.find(root => {
      try { return repository(execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()) === ownerRepo; }
      catch { return false; }
    });
    if (!sourceRoot) throw new Error(`Full component source checkout is unavailable: ${ownerRepo}`);
    try { execFileSync('git', ['cat-file', '-e', `${seed.source_commit}^{commit}`], { cwd: sourceRoot, stdio: 'ignore' }); }
    catch { execFileSync('git', ['fetch', '--no-tags', 'origin', seed.source_commit], { cwd: sourceRoot, stdio: 'inherit' }); }
    const targetRoot = path.join(runtimeRoot, 'modules', seed.package_id);
    if (fs.existsSync(targetRoot)) throw new Error(`Full component seed collides with a runtime module: ${seed.package_id}`);
    const seen = new Set<string>();
    for (const file of seed.payload.files) {
      const source = new URL(file.source_url);
      const prefix = `/${ownerRepo}/${seed.source_commit}/`;
      if (source.protocol !== 'https:' || source.hostname !== 'raw.githubusercontent.com' || !source.pathname.startsWith(prefix)) {
        throw new Error(`Full component payload URL does not bind its owner commit: ${seed.package_id}`);
      }
      const sourcePath = relativePath(decodeURIComponent(source.pathname.slice(prefix.length)));
      if (sourcePath !== `${seed.payload.source_root}/${relativePath(file.path)}` || seen.has(sourcePath)) {
        throw new Error(`Full component payload path drifted: ${seed.package_id}`);
      }
      seen.add(sourcePath);
      const treeEntry = execFileSync('git', ['ls-tree', '-z', seed.source_commit, '--', sourcePath], {
        cwd: sourceRoot, encoding: 'utf8',
      }).trim().split('\t');
      const [mode, type] = (treeEntry[0] ?? '').split(' ');
      if (mode !== file.mode || type !== 'blob' || !['100644', '100755'].includes(file.mode)) {
        throw new Error(`Full component payload file mode drifted: ${seed.package_id}/${file.path}`);
      }
      const bytes = execFileSync('git', ['show', `${seed.source_commit}:${sourcePath}`], { cwd: sourceRoot, maxBuffer: 128 * 1024 * 1024 });
      if (digest(bytes) !== file.sha256) {
        throw new Error(`Full component payload bytes or mode drifted: ${seed.package_id}/${file.path}`);
      }
      const target = path.join(targetRoot, sourcePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes, { mode: file.mode === '100755' ? 0o755 : 0o644 });
    }
    fs.writeFileSync(path.join(targetRoot, PACKAGED_MODULE_MARKER_FILE), `${JSON.stringify(buildPackagedModuleMarker({
      moduleId: seed.package_id, repoName: path.posix.basename(ownerRepo), sourcePath: sourceRoot, headSha: seed.source_commit,
    }), null, 2)}\n`);
  }
}
