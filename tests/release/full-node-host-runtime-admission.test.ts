import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { findNodeToolchain } from '../../scripts/build-full-first-install-package/runtime-sources.ts';
import { copyNodeRuntimePayload } from '../../scripts/build-full-first-install-package/filesystem.ts';

test('Full consumes the carrier Node admission and refuses an unsafe explicit toolchain', context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-node-admission-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(root, 'lib/node_modules/npm'), { recursive: true });
  for (const name of ['npm', 'npx']) fs.writeFileSync(path.join(bin, name), 'fixture');
  const node = path.join(bin, 'node');
  fs.writeFileSync(node, '#!/bin/sh\necho \'{"node":"26.10.0","electron":null}\'\n', { mode: 0o755 });
  assert.throws(() => findNodeToolchain(node, process.env.OPL_APP_SHELL_ROOT), { code: 'node_host_security_update_required' });
  fs.writeFileSync(node, '#!/bin/sh\necho \'{"node":"22.23.4","electron":null}\'\n', { mode: 0o755 });
  const admitted = findNodeToolchain(node, process.env.OPL_APP_SHELL_ROOT);
  assert.equal(admitted.nodeBin, path.resolve(node));
  assert.equal(admitted.npmRoot, path.join(fs.realpathSync(root), 'lib/node_modules/npm'));
});

test('Full resolves npm and npx from Homebrew-style shared links', context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-node-homebrew-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nodeRoot = path.join(root, 'Cellar/node/26.13.0_2');
  const bin = path.join(nodeRoot, 'bin');
  const npmRoot = path.join(root, 'lib/node_modules/npm');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(npmRoot, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(npmRoot, 'package.json'), '{"name":"npm"}\n');
  for (const name of ['npm-cli.js', 'npx-cli.js']) {
    fs.writeFileSync(path.join(npmRoot, 'bin', name), "require('../lib/cli.js');\n");
  }
  fs.mkdirSync(path.join(npmRoot, 'lib'));
  fs.writeFileSync(path.join(npmRoot, 'lib/cli.js'), "console.log('fixture-npm');\n");
  fs.symlinkSync(path.join(npmRoot, 'bin/npm-cli.js'), path.join(bin, 'npm'));
  fs.symlinkSync(path.join(npmRoot, 'bin/npx-cli.js'), path.join(bin, 'npx'));
  const node = path.join(bin, 'node');
  fs.writeFileSync(node, '#!/bin/sh\necho \'{"node":"22.23.4","electron":null}\'\n', { mode: 0o755 });

  const admitted = findNodeToolchain(node, process.env.OPL_APP_SHELL_ROOT);
  assert.equal(admitted.nodeBin, path.resolve(node));
  assert.equal(admitted.npmBin, path.join(bin, 'npm'));
  assert.equal(admitted.npxBin, path.join(bin, 'npx'));
  assert.equal(admitted.npmRoot, fs.realpathSync(npmRoot));

  const packaged = path.join(root, 'packaged');
  copyNodeRuntimePayload(nodeRoot, packaged, admitted.npmRoot);
  for (const name of ['npm', 'npx']) {
    const launcher = path.join(packaged, 'bin', name);
    assert.equal(fs.readlinkSync(launcher), `../lib/node_modules/npm/bin/${name}-cli.js`);
    const result = spawnSync(process.execPath, [launcher], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'fixture-npm');
  }
});

test('Full repairs dereferenced npm launchers when repackaging an installed toolchain', context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-node-relocated-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const npmRoot = path.join(root, 'source/lib/node_modules/npm');
  const bin = path.join(root, 'source/bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(npmRoot, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(npmRoot, 'lib'));
  fs.writeFileSync(path.join(npmRoot, 'package.json'), JSON.stringify({ name: 'npm', bin: { npm: 'bin/npm-cli.js', npx: 'bin/npx-cli.js' } }));
  fs.writeFileSync(path.join(npmRoot, 'lib/cli.js'), "console.log('relocated-npm-ready');\n");
  fs.writeFileSync(path.join(bin, 'node'), 'fixture-node');
  for (const name of ['npm', 'npx']) {
    const source = "require('../lib/cli.js');\n";
    fs.writeFileSync(path.join(bin, name), source);
    fs.writeFileSync(path.join(npmRoot, 'bin', `${name}-cli.js`), source);
  }
  const packaged = path.join(root, 'packaged');
  copyNodeRuntimePayload(path.join(root, 'source'), packaged, npmRoot);
  fs.rmSync(path.join(root, 'source'), { recursive: true });
  for (const name of ['npm', 'npx']) {
    const launcher = path.join(packaged, 'bin', name);
    const result = spawnSync(process.execPath, [launcher], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'relocated-npm-ready');
  }
});
