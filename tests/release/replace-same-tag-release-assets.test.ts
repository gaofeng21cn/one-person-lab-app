import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { executeSameTagReplacement, type GhRunner } from '../../scripts/replace-same-tag-release-assets.ts';

const root = process.cwd();
const script = path.join(root, 'scripts/replace-same-tag-release-assets.ts');
const digest = (value: string) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

test('same-tag repair stages exact assets, rejects incomplete promotion, then updates assets and body', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-same-tag-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const statePath = path.join(dir, 'release.json');
  const tag = 'v26.9.22';
  const target = 'a'.repeat(40);
  const oldAssets = ['first.dmg', 'manifest.json'].map((name, index) => {
    const body = `old-${name}`;
    return { id: 100 + index, name, size: Buffer.byteLength(body), digest: digest(body) };
  });
  const initial = { id: 12, tag_name: tag, target_commitish: target,
    immutable: false, draft: false, body: 'Old checksum', assets: oldAssets };
  fs.writeFileSync(statePath, JSON.stringify(initial));

  const inMemoryGh: GhRunner = (args) => {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const save = () => fs.writeFileSync(statePath, JSON.stringify(state));
    if (args[0] === 'release' && args[1] === 'upload') {
      const source = args[3];
      const bytes = fs.readFileSync(source);
      state.assets.push({
        id: Math.max(...state.assets.map((item: { id: number }) => item.id)) + 1,
        name: path.basename(source),
        size: bytes.length,
        digest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
      });
      save();
      return { ok: true, output: '', error: '' };
    }
    if (args[0] === 'api' && args[1] === '--method') {
      const method = args[2];
      const resource = args[3];
      if (resource.includes('/releases/assets/')) {
        const id = Number(resource.split('/').at(-1));
        const index = state.assets.findIndex((asset: { id: number }) => asset.id === id);
        if (index < 0) return { ok: false, output: '', error: 'asset not found' };
        if (method === 'DELETE') state.assets.splice(index, 1);
        else state.assets[index].name = args.find((arg) => arg.startsWith('name='))!.slice(5);
      } else {
        state.body = JSON.parse(fs.readFileSync(args[args.indexOf('--input') + 1], 'utf8')).body;
      }
      save();
      return { ok: true, output: '', error: '' };
    }
    if (args[0] === 'api' && args[1].includes('/git/ref/tags/')) {
      return { ok: true, output: JSON.stringify({ ref: `refs/tags/${tag}`, object: { type: 'commit', sha: target } }), error: '' };
    }
    if (args[0] === 'api' && args[1].endsWith('/releases/12')) {
      return { ok: true, output: JSON.stringify(state), error: '' };
    }
    return { ok: false, output: '', error: `unexpected gh args: ${args.join(' ')}` };
  };

  const replacements = oldAssets.map((current, index) => {
    const file = path.join(dir, current.name);
    fs.writeFileSync(file, `new-${index}-${current.name}`);
    return { current, file };
  });
  const bodyFile = path.join(dir, 'body.txt');
  fs.writeFileSync(bodyFile, 'New checksum');
  const planPath = path.join(dir, 'plan.json');
  fs.writeFileSync(planPath, JSON.stringify({ repository: 'example/app', release_id: 12,
    tag, target_commitish: target, replacements,
    expected_body_sha256: digest(initial.body).slice(7), body_file: bodyFile }));
  const read = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));

  executeSameTagReplacement(planPath, 'stage', { runGh: inMemoryGh });
  assert.equal(read().assets.length, 4);
  assert.deepEqual(read().assets.slice(0, 2), oldAssets);
  const incomplete = read();
  const missingStage = incomplete.assets.pop();
  fs.writeFileSync(statePath, JSON.stringify(incomplete));
  assert.throws(() => executeSameTagReplacement(planPath, 'promote', { runGh: inMemoryGh }));
  assert.deepEqual(read().assets.slice(0, 2), oldAssets);
  fs.writeFileSync(statePath, JSON.stringify({ ...incomplete, assets: [...incomplete.assets, missingStage] }));

  executeSameTagReplacement(planPath, 'promote', { runGh: inMemoryGh });
  const final = read();
  assert.equal(final.body, 'New checksum');
  assert.deepEqual(final.assets.map((asset: { name: string }) => asset.name), oldAssets.map((asset) => asset.name));
  for (const asset of final.assets) {
    const replacement = replacements.find((item) => item.current.name === asset.name)!;
    assert.equal(asset.digest, `sha256:${crypto.createHash('sha256').update(fs.readFileSync(replacement.file)).digest('hex')}`);
  }
});

test('same-tag repair CLI rejects missing mode flags with usage', () => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', script], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage: replace-same-tag-release-assets\.ts/);
});
