import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { dependencyDownloadCachePlan, pruneDependencyDownloadCache } from '../../scripts/release-dependency-download-cache.ts';

test('raw tool cache binds current archive digests and prunes obsolete or corrupt downloaded bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-raw-tool-cache-'));
  const bytes = Buffer.from('verified Codex archive');
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const resolved = { platform: 'darwin', architecture: 'arm64', resolved_at: 'earlier', dependencies: [{
    dependency_id: 'codex-cli', archive_url: 'https://example.test/codex.tgz', archive_sha256: sha,
    install_metadata: { npm_platform: { tarball_url: 'https://example.test/codex-arm64.tgz', tarball_sha256: sha } },
  }] };
  try {
    const plan = dependencyDownloadCachePlan(resolved);
    assert.equal(plan.entries.length, 2, 'both Codex wrapper and native platform archives are retained');
    assert.equal(dependencyDownloadCachePlan({ ...resolved, resolved_at: 'later' }).key, plan.key);
    assert.notEqual(dependencyDownloadCachePlan({ ...resolved, architecture: 'x64' }).key, plan.key);
    const changed = structuredClone(resolved);
    changed.dependencies[0].archive_sha256 = 'a'.repeat(64);
    assert.notEqual(dependencyDownloadCachePlan(changed).key, plan.key);
    fs.writeFileSync(path.join(root, plan.entries[0][0]), bytes);
    fs.writeFileSync(path.join(root, plan.entries[1][0]), 'corrupt');
    const obsolete = `${'f'.repeat(64)}.archive`;
    fs.writeFileSync(path.join(root, obsolete), bytes);
    fs.writeFileSync(path.join(root, 'unrelated'), 'preserve');
    assert.equal(pruneDependencyDownloadCache(root, plan), 1);
    assert.equal(fs.existsSync(path.join(root, obsolete)), false);
    assert.equal(fs.existsSync(path.join(root, plan.entries[1][0])), false);
    assert.equal(fs.readFileSync(path.join(root, 'unrelated'), 'utf8'), 'preserve');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Full restores raw archives before discovery and consumes the same cache before runtime assembly', () => {
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const workflow = parse(fs.readFileSync(path.join(appRoot, '.github/workflows/full-first-install-release.yml'), 'utf8'));
  const steps = workflow.jobs['full-first-install'].steps;
  const named = (name: string) => steps.find((step: any) => step.name === name);
  const restore = named('Restore verified dependency archives');
  const save = named('Save verified dependency archives');
  assert.ok(steps.indexOf(restore) < steps.indexOf(named('Resolve default Full build inputs')));
  assert.ok(steps.indexOf(save) < steps.indexOf(named('Build Full first-install package')), 'verified downloads survive a later packaging failure');
  assert.equal(restore.with.path, save.with.path);
  assert.match(save.if, /github.ref == 'refs\/heads\/main'/);
  for (const name of ['Setup exact Python and packaged uv', 'Install zstd, Temporal CLI, OfficeCLI, and MinerU']) {
    assert.match(named(name).run, /scripts\/fetch-dependency-archive\.mjs/);
    assert.match(named(name).run, /shasum -a 256/);
  }
  assert.match(named('Configure dependency archive cache').run, /OPL_DEPENDENCY_ARCHIVE_CACHE_DIR/);
  assert.ok(steps.indexOf(named('Install zstd, Temporal CLI, OfficeCLI, and MinerU')) < steps.indexOf(named('Restore Full toolchain runtime cache')));
});
