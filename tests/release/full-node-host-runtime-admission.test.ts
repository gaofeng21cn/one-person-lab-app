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
  const nodeRoot = path.join(root, 'Cellar/node/26.13.1_2');
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

test('Full rejects a Node toolchain with build-machine dylibs before runtime assembly', { skip: process.platform !== 'darwin' }, context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-node-nonportable-'));
  const originalPath = process.env.PATH;
  context.after(() => { process.env.PATH = originalPath; fs.rmSync(root, { recursive: true, force: true }); });
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(root, 'lib/node_modules/npm'), { recursive: true });
  for (const name of ['npm', 'npx']) fs.writeFileSync(path.join(bin, name), 'fixture');
  const node = path.join(bin, 'node');
  fs.writeFileSync(node, '#!/bin/sh\necho \'{"node":"26.13.1","electron":null}\'\n', { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'lib/libnode.dylib'), Buffer.from('cffaedfe', 'hex'));
  fs.writeFileSync(path.join(bin, 'otool'), `#!/bin/sh
printf '%s:\\n' "$3"
if [ "$1" = '-L' ]; then printf '\\t/opt/homebrew/opt/libuv/lib/libuv.1.dylib (compatibility version 1.0.0)\\n'; fi
`, { mode: 0o755 });
  process.env.PATH = `${bin}${path.delimiter}${originalPath ?? ''}`;
  assert.throws(() => findNodeToolchain(node, process.env.OPL_APP_SHELL_ROOT),
    /Full Node toolchain is not portable:[\s\S]*\/opt\/homebrew\/opt\/libuv/);
  const entrypointRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-node-entrypoint-'));
  context.after(() => fs.rmSync(entrypointRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(entrypointRoot, 'bin'));
  const entrypoint = path.join(entrypointRoot, 'bin/node');
  fs.symlinkSync(node, entrypoint);
  assert.throws(() => findNodeToolchain(entrypoint, process.env.OPL_APP_SHELL_ROOT),
    /Full Node toolchain is not portable:[\s\S]*\/opt\/homebrew\/opt\/libuv/);
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
  fs.writeFileSync(path.join(bin, 'node'), `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' "$@"\n`, { mode: 0o755 });
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

test('Full rejects npm that cannot load from the copied package', context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-node-broken-npm-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const npmRoot = path.join(root, 'source/lib/node_modules/npm');
  fs.mkdirSync(path.join(root, 'source/bin'), { recursive: true });
  fs.mkdirSync(path.join(npmRoot, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(npmRoot, 'package.json'), '{"name":"npm"}');
  for (const name of ['npm', 'npx']) fs.writeFileSync(path.join(npmRoot, 'bin', `${name}-cli.js`), "require('../lib/missing.js');\n");
  fs.writeFileSync(path.join(root, 'source/bin/node'), `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' "$@"\n`, { mode: 0o755 });
  assert.throws(() => copyNodeRuntimePayload(path.join(root, 'source'), path.join(root, 'target'), npmRoot),
    /Packaged Node npm launcher failed:[\s\S]*Cannot find module/);
});
