#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>;

// Discovery belongs to Framework. App only projects its frozen result into
// existing build/qualification inputs; no provider or latest-version algorithm.
export function projectResolvedBuildDependencies(resolved: Json, fullPolicy: Json, qualificationPolicy: Json) {
  const byId = new Map<string, Json>((resolved.dependencies ?? []).map((entry: Json) => [entry.dependency_id, entry]));
  function dependency(id: string) {
    const entry = byId.get(id);
    if (!entry?.version || !entry.source_ref) throw new Error(`Framework resolution is missing ${id}.`);
    return entry;
  }
  function archive(id: string) {
    const entry = dependency(id);
    if (!/^https:\/\//.test(entry.archive_url ?? '') || !/^[a-f0-9]{64}$/.test(entry.archive_sha256 ?? '') || !Number.isSafeInteger(entry.archive_size_bytes) || entry.archive_size_bytes <= 0) {
      throw new Error(`Framework resolution is missing verified archive identity for ${id}.`);
    }
    return entry;
  }
  const full = structuredClone(fullPolicy);
  for (const [key, policy] of Object.entries<Json>(full.toolchain ?? {})) {
    if (!byId.has(policy.dependency_id ?? key)) continue;
    const entry = dependency(policy.dependency_id ?? key);
    full.toolchain[key] = { ...policy, version: entry.version, source_ref: entry.source_ref };
  }
  for (const [key, id] of [['officecli', 'officecli'], ['mineru', 'mineru-open-api']]) {
    if (!byId.has(id)) continue;
    const entry = dependency(id);
    if (!/^[a-f0-9]{40}$/.test(entry.resolved_commit ?? '')) throw new Error(`Framework resolution is missing source commit for ${id}.`);
    full.sources[key] = { ...full.sources[key], ref: entry.resolved_commit, release_tag: entry.install_metadata?.release_tag ?? entry.source_ref };
  }
  for (const [key, policy] of Object.entries<Json>(full.runtime_payloads ?? {})) {
    if (!byId.has(policy.dependency_id ?? key.replaceAll('_', '-'))) continue;
    const entry = dependency(policy.dependency_id ?? key.replaceAll('_', '-'));
    full.runtime_payloads[key] = { ...policy, version: entry.version, archive_url: entry.archive_url, archive_sha256: entry.archive_sha256, archive_size_bytes: entry.archive_size_bytes };
  }
  if (byId.has('temporal-cli')) {
  const temporal = archive('temporal-cli');
  full.runtime_payloads.temporal_cli.darwin_arm64_archive_sha256 = temporal.archive_sha256;
  }
  if (byId.has('officecli')) full.runtime_payloads.officecli = {
    ...(full.runtime_payloads.officecli ?? {}),
    darwin_arm64_asset_sha256: archive('officecli').archive_sha256,
  };
  const qualification = structuredClone(qualificationPolicy);
  if (byId.has('codex-cli')) {
  const codex = archive('codex-cli');
  const platform = codex.install_metadata?.npm_platform;
  if (!codex.npm_integrity || !platform?.package || !platform.version || !platform.npm_integrity || !platform.tarball_url || !/^[a-f0-9]{64}$/.test(platform.tarball_sha256 ?? '')) {
    throw new Error('Framework Codex resolution lacks npm/platform qualification identity.');
  }
  qualification.runtime_payloads.codex_cli = {
    ...qualification.runtime_payloads.codex_cli,
    version: codex.version, npm_integrity: codex.npm_integrity,
    tarball_url: codex.archive_url, tarball_sha256: codex.archive_sha256,
    platform: { ...qualification.runtime_payloads.codex_cli.platform, ...platform },
  };
  }
  if (byId.has('kimi-cu')) {
  const kimi = archive('kimi-cu');
  qualification.runtime_payloads.kimi_cu = {
    ...qualification.runtime_payloads.kimi_cu,
    version: kimi.version, archive_url: kimi.archive_url,
    archive_sha256: kimi.archive_sha256, archive_size_bytes: kimi.archive_size_bytes,
  };
  }
  return { full, qualification };
}

function main() {
  const { values } = parseArgs({ options: {
    'app-root': { type: 'string', default: '.' }, 'framework-root': { type: 'string' },
    output: { type: 'string' }, 'resolved-input': { type: 'string' },
    platform: { type: 'string', default: 'darwin' }, arch: { type: 'string', default: 'arm64' },
    'github-output': { type: 'string' }, dependency: { type: 'string', multiple: true },
  } });
  if (!values.output) throw new Error('--output is required.');
  const appRoot = path.resolve(values['app-root']);
  const output = path.resolve(values.output);
  if (fs.existsSync(path.join(output, 'dependency-resolution.json'))) throw new Error('Build dependencies are already frozen; consume the existing input instead of resolving again.');
  fs.mkdirSync(output, { recursive: true });
  const read = (name: string) => JSON.parse(fs.readFileSync(path.join(appRoot, 'contracts', name), 'utf8'));
  const fullPolicy = read('app-full-third-party-source-manifest.json');
  const qualificationPolicy = read('app-release-qualification-input-manifest.json');
  let resolved: Json;
  if (values['resolved-input']) resolved = JSON.parse(fs.readFileSync(path.resolve(values['resolved-input']), 'utf8'));
  else {
    if (!values['framework-root']) throw new Error('--framework-root or --resolved-input is required.');
    const ids = new Set<string>(values.dependency ?? ['node', 'mineru-open-api', 'officecli', 'temporal-cli', 'kimi-cu', 'codex-cli', 'playwright-mcp']);
    if (!values.dependency) for (const [key, policy] of Object.entries<Json>(fullPolicy.toolchain ?? {})) ids.add(policy.dependency_id ?? key);
    const result = spawnSync(process.execPath, [path.resolve(values['framework-root'], 'scripts/resolve-dependency-releases.mjs'),
      ...[...ids].flatMap((id) => ['--dependency', id]), '--platform', values.platform, '--arch', values.arch,
      '--output', path.join(output, 'dependency-resolution.json')], { encoding: 'utf8', env: process.env, maxBuffer: 8 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`Framework dependency resolution failed: ${result.stderr || result.error?.message}`);
    resolved = JSON.parse(fs.readFileSync(path.join(output, 'dependency-resolution.json'), 'utf8'));
  }
  const projected = projectResolvedBuildDependencies(resolved, fullPolicy, qualificationPolicy);
  for (const [name, data] of Object.entries({ 'dependency-resolution.json': resolved, 'full-input-manifest.json': projected.full, 'qualification-input-manifest.json': projected.qualification })) {
    fs.writeFileSync(path.join(output, name), `${JSON.stringify(data, null, 2)}\n`);
  }
  if (values['github-output']) {
    const outputs: Record<string, string> = { qualification_manifest: path.join(output, 'qualification-input-manifest.json'), full_manifest: path.join(output, 'full-input-manifest.json') };
    for (const [key, entry] of Object.entries<Json>(projected.full.toolchain)) if (entry.version) outputs[`${key}_version`] = entry.version;
    for (const key of ['officecli', 'mineru']) if (projected.full.sources[key].ref) outputs[`${key}_ref`] = projected.full.sources[key].ref;
    for (const [key, id] of [['temporal', 'temporal-cli'], ['officecli', 'officecli'], ['node', 'node'], ['python', 'python']]) {
      const entry = resolved.dependencies.find((entry: Json) => entry.dependency_id === id);
      if (!entry) continue;
      outputs[`${key}_version`] = entry.version;
      outputs[`${key}_url`] = entry.archive_url;
      outputs[`${key}_sha256`] = entry.archive_sha256;
    }
    fs.appendFileSync(values['github-output'], Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(''));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
