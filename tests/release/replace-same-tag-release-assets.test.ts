import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = process.cwd();
const script = path.join(root, 'scripts/replace-same-tag-release-assets.ts');
const digest = (value: string) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

test('same-tag repair stages exact assets, rejects incomplete promotion, then updates assets and body', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-same-tag-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
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
  const mock = path.join(bin, 'gh');
  fs.writeFileSync(mock, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const args = process.argv.slice(2);
const file = process.env.OPL_TEST_RELEASE_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const save = () => fs.writeFileSync(file, JSON.stringify(state));
const out = (value) => process.stdout.write(JSON.stringify(value));
if (args[0] === 'release' && args[1] === 'upload') {
  const source = args[3];
  const bytes = fs.readFileSync(source);
  state.assets.push({ id: Math.max(...state.assets.map((item) => item.id)) + 1,
    name: path.basename(source), size: bytes.length,
    digest: 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex') });
  save();
} else if (args[0] === 'api' && args[1] === '--method') {
  const method = args[2];
  const resource = args[3];
  if (resource.includes('/releases/assets/')) {
    const id = Number(resource.split('/').at(-1));
    const index = state.assets.findIndex((asset) => asset.id === id);
    if (index < 0) process.exit(2);
    if (method === 'DELETE') state.assets.splice(index, 1);
    else state.assets[index].name = args.find((arg) => arg.startsWith('name=')).slice(5);
  } else {
    state.body = JSON.parse(fs.readFileSync(args[args.indexOf('--input') + 1], 'utf8')).body;
  }
  save();
} else if (args[0] === 'api' && args[1].includes('/git/ref/tags/')) {
  out({ ref: 'refs/tags/${tag}', object: { type: 'commit', sha: '${target}' } });
} else if (args[0] === 'api' && args[1].endsWith('/releases/12')) {
  out(state);
} else process.exit(2);
`);
  fs.chmodSync(mock, 0o755);

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
  const invoke = (mode: '--stage' | '--promote') => spawnSync('node', [
    '--experimental-strip-types', script, '--plan', planPath, mode,
  ], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`,
    OPL_TEST_RELEASE_STATE: statePath } });
  const read = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));

  assert.equal(invoke('--stage').status, 0);
  assert.equal(read().assets.length, 4);
  assert.deepEqual(read().assets.slice(0, 2), oldAssets);
  const incomplete = read();
  const missingStage = incomplete.assets.pop();
  fs.writeFileSync(statePath, JSON.stringify(incomplete));
  assert.notEqual(invoke('--promote').status, 0);
  assert.deepEqual(read().assets.slice(0, 2), oldAssets);
  fs.writeFileSync(statePath, JSON.stringify({ ...incomplete, assets: [...incomplete.assets, missingStage] }));

  assert.equal(invoke('--promote').status, 0);
  const final = read();
  assert.equal(final.body, 'New checksum');
  assert.deepEqual(final.assets.map((asset: { name: string }) => asset.name), oldAssets.map((asset) => asset.name));
  for (const asset of final.assets) {
    const replacement = replacements.find((item) => item.current.name === asset.name)!;
    assert.equal(asset.digest, `sha256:${crypto.createHash('sha256').update(fs.readFileSync(replacement.file)).digest('hex')}`);
  }
});
