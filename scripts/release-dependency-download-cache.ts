#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export function dependencyDownloadCachePlan(resolved: Record<string, any>) {
  const archives = new Map<string, { url: string; sha256: string }>();
  for (const dependency of resolved.dependencies ?? []) {
    const candidates = [
      { url: dependency.archive_url, sha256: dependency.archive_sha256 },
      { url: dependency.install_metadata?.npm_platform?.tarball_url, sha256: dependency.install_metadata?.npm_platform?.tarball_sha256 },
    ];
    for (const archive of candidates) {
      if (!archive.url) continue;
      const url = new URL(archive.url);
      if (url.protocol !== 'https:' || url.username || url.password || !/^[a-f0-9]{64}$/.test(archive.sha256 ?? '')) {
        throw new Error('Download cache requires a frozen credential-free archive identity.');
      }
      const file = `${crypto.createHash('sha256').update(url.href).digest('hex')}.archive`;
      if (archives.has(file) && archives.get(file)!.sha256 !== archive.sha256) throw new Error('Conflicting frozen archive digests.');
      archives.set(file, { url: url.href, sha256: archive.sha256 });
    }
  }
  const entries = [...archives].sort(([left], [right]) => left.localeCompare(right));
  const identity = crypto.createHash('sha256').update(JSON.stringify({ platform: resolved.platform, architecture: resolved.architecture, entries })).digest('hex');
  return { key: `dependency-archives-v1-${resolved.platform}-${resolved.architecture}-${identity}`, entries };
}

export function pruneDependencyDownloadCache(cacheDir: string, plan: ReturnType<typeof dependencyDownloadCachePlan>) {
  const expected = new Map(plan.entries);
  let verified = 0;
  if (!fs.existsSync(cacheDir)) return verified;
  for (const name of fs.readdirSync(cacheDir)) {
    if (!/^[a-f0-9]{64}\.archive$/.test(name)) continue;
    const file = path.join(cacheDir, name);
    const pin = expected.get(name);
    const stat = fs.lstatSync(file);
    if (!pin || !stat.isFile() || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== pin.sha256) {
      // This directory is disposable downloaded bytes, never an installed runtime.
      if (!stat.isDirectory()) fs.rmSync(file, { force: true });
    } else verified += 1;
  }
  return verified;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: {
    resolved: { type: 'string' }, 'cache-dir': { type: 'string' }, 'github-output': { type: 'string' }, prune: { type: 'boolean' },
  } });
  if (!values.resolved) throw new Error('--resolved is required.');
  const plan = dependencyDownloadCachePlan(JSON.parse(fs.readFileSync(values.resolved, 'utf8')));
  const verified = values.prune ? pruneDependencyDownloadCache(path.resolve(values['cache-dir']!), plan) : 0;
  const saveRequired = verified > 0 && plan.key !== process.env.OPL_DEPENDENCY_CACHE_RESTORE_MATCHED_KEY;
  const outputs = `cache_key=${plan.key}\narchive_count=${verified}\ncache_save_required=${saveRequired}\n`;
  if (values['github-output']) fs.appendFileSync(values['github-output'], outputs);
  process.stdout.write(outputs);
}
