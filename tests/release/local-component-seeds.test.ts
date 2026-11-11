import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { materializeSelectedLocalComponentSeeds, selectedLocalComponentSeedInputs } from '../../scripts/build-full-first-install-package/local-component-seeds.ts';

test('Full components use selected frozen owner payload bytes and reject changed digests', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-component-seed-'));
  const componentRoot = path.join(root, 'source');
  const frameworkRoot = path.join(root, 'framework');
  const projectionRoot = path.join(frameworkRoot, 'contracts/opl-framework/packages');
  const pluginPath = 'packages/fixture-component';
  const git = (...args: string[]) => execFileSync('git', args, { cwd: componentRoot, encoding: 'utf8' }).trim();
  const write = (ref: string, value: string) => {
    const target = path.join(componentRoot, ref); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value);
  };
  try {
    fs.mkdirSync(componentRoot, { recursive: true });
    git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    git('remote', 'add', 'origin', 'ssh://git@ssh.github.com:443/owner/component.git');
    const owner = { package_id: 'fixture-component', version: '1.0.0', management_scope: 'local_component', source_repo: 'https://github.com/owner/component.git' };
    write(`${pluginPath}/opl-package.json`, JSON.stringify(owner));
    write(`${pluginPath}/index.js`, 'export const committed = true;\n');
    git('add', '.'); git('commit', '-qm', 'Fixture owner payload');
    const commit = git('rev-parse', 'HEAD');
    const payload = { package_id: owner.package_id, package_version: owner.version, source_repo: owner.source_repo,
      source_commit: commit, source_root: pluginPath, files: ['opl-package.json', 'index.js'].map(ref => ({
        path: ref, mode: '100644', source_url: `https://raw.githubusercontent.com/owner/component/${commit}/${pluginPath}/${ref}`,
        sha256: `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path.join(componentRoot, pluginPath, ref))).digest('hex')}`,
      })) };
    fs.mkdirSync(projectionRoot, { recursive: true });
    fs.writeFileSync(path.join(projectionRoot, 'fixture-component.json'), JSON.stringify({ ...owner,
      codex_surface: { carrier_source_commit: commit, plugin_payload_manifest_url: 'payloads/fixture.json' } }));
    fs.mkdirSync(path.join(projectionRoot, 'payloads'));
    const payloadPath = path.join(projectionRoot, 'payloads/fixture.json');
    fs.writeFileSync(payloadPath, JSON.stringify(payload));
    write(`${pluginPath}/index.js`, 'dirty current source must not be packaged');
    const options = { frameworkRoot, componentRoot };
    const selection = ['fixture-component'];
    assert.deepEqual(selectedLocalComponentSeedInputs(options, []), []);
    const identity = selectedLocalComponentSeedInputs(options, selection)[0].payload_sha256;
    const runtime = path.join(root, 'runtime');
    materializeSelectedLocalComponentSeeds(runtime, options, selection);
    const seed = path.join(runtime, 'modules/fixture-component');
    assert.equal(fs.readFileSync(path.join(seed, pluginPath, 'index.js'), 'utf8'), 'export const committed = true;\n');
    assert.equal(JSON.parse(fs.readFileSync(path.join(seed, 'opl-runtime-module.json'), 'utf8')).source_git.head_sha, commit);
    payload.files[1].sha256 = `sha256:${'0'.repeat(64)}`;
    fs.writeFileSync(payloadPath, JSON.stringify(payload));
    assert.notEqual(selectedLocalComponentSeedInputs(options, selection)[0].payload_sha256, identity);
    assert.throws(() => materializeSelectedLocalComponentSeeds(path.join(root, 'corrupt'), options, selection), /payload bytes or mode drifted/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
