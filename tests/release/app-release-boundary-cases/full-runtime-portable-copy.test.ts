import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  copyRuntimePayloadTree,
  copyAppBundleForDmg,
  syncRuntimePayloadToBuiltApp,
} from '../../../scripts/build-full-first-install-package/archive-output.ts';

test('Full runtime copy preserves internal relative symlinks inside the packaged tree', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-runtime-copy-'));
  try {
    const sourceRoot = path.join(tempRoot, 'source');
    const targetRoot = path.join(tempRoot, 'target');
    const packageBin = path.join(sourceRoot, 'node', 'lib', 'node_modules', 'npm', 'node_modules', '.bin');
    const executable = path.join(sourceRoot, 'node', 'lib', 'node_modules', 'npm', 'node_modules', 'which', 'bin', 'which.js');
    fs.mkdirSync(packageBin, { recursive: true });
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, '#!/usr/bin/env node\n', 'utf8');
    fs.symlinkSync('../which/bin/which.js', path.join(packageBin, 'node-which'));

    copyRuntimePayloadTree(sourceRoot, targetRoot);

    const copiedLink = path.join(targetRoot, path.relative(sourceRoot, path.join(packageBin, 'node-which')));
    assert.equal(fs.readlinkSync(copiedLink), '../which/bin/which.js');
    assert.equal(
      fs.realpathSync(copiedLink),
      fs.realpathSync(path.join(targetRoot, path.relative(sourceRoot, executable))),
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('Full runtime copy rejects absolute links before App signing', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-runtime-copy-external-'));
  try {
    const sourceRoot = path.join(tempRoot, 'source');
    const targetRoot = path.join(tempRoot, 'target');
    fs.mkdirSync(sourceRoot, { recursive: true });
    fs.symlinkSync('/tmp/outside-full-runtime', path.join(sourceRoot, 'outside'));

    assert.throws(
      () => copyRuntimePayloadTree(sourceRoot, targetRoot),
      /Packaged Full runtime contains external symlink/,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('skip-build Full packaging injects the prepared runtime into the existing carrier App bundle', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-runtime-built-app-'));
  const previousCarrier = process.env.OPL_FULL_CARRIER_ID;
  process.env.OPL_FULL_CARRIER_ID = 'opl-studio';
  try {
    const runtimeRoot = path.join(tempRoot, 'runtime');
    const builtAppPath = path.join(tempRoot, 'One Person Lab Preview.app');
    const oldRuntimeRoot = path.join(
      builtAppPath,
      'Contents',
      'Resources',
      'opl-studio-full-runtime',
      'runtime',
      'old',
    );
    fs.mkdirSync(path.join(runtimeRoot, 'manifest'), { recursive: true });
    fs.writeFileSync(path.join(runtimeRoot, 'manifest', 'full-package-manifest.json'), '{"source":"runtime"}\n');
    fs.writeFileSync(path.join(runtimeRoot, 'payload.txt'), 'prepared-runtime\n');
    fs.mkdirSync(oldRuntimeRoot, { recursive: true });
    fs.writeFileSync(path.join(oldRuntimeRoot, 'stale.txt'), 'stale\n');
    const manifest = { schema: 'opl_full_package_manifest.v1', resolved_refs: { opl_framework: {} } };

    const payloadRoot = syncRuntimePayloadToBuiltApp(runtimeRoot, manifest, builtAppPath);

    assert.equal(
      payloadRoot,
      path.join(builtAppPath, 'Contents', 'Resources', 'opl-studio-full-runtime'),
    );
    assert.equal(fs.existsSync(oldRuntimeRoot), false);
    assert.equal(
      fs.readFileSync(path.join(payloadRoot, 'runtime', 'current', 'payload.txt'), 'utf8'),
      'prepared-runtime\n',
    );
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(payloadRoot, 'manifest', 'full-package-manifest.json'), 'utf8')),
      manifest,
    );
    assert.equal(
      fs.readFileSync(path.join(runtimeRoot, 'payload.txt'), 'utf8'),
      'prepared-runtime\n',
    );
  } finally {
    if (previousCarrier === undefined) delete process.env.OPL_FULL_CARRIER_ID;
    else process.env.OPL_FULL_CARRIER_ID = previousCarrier;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});


test('Full staging clone and ditto fallback preserve metadata and independent file bytes', { skip: process.platform !== 'darwin' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-app-clone-'));
  const source = path.join(root, 'Source.app');
  const target = path.join(root, 'Target.app');
  const executable = path.join(source, 'bin', 'tool');
  const previousPath = process.env.PATH;
  try {
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, 'original', { mode: 0o755 });
    fs.symlinkSync('tool', path.join(source, 'bin', 'link'));
    assert.equal(spawnSync('xattr', ['-w', 'org.opl.test', 'preserved', executable]).status, 0);
    copyAppBundleForDmg(source, target);
    const check = () => {
      assert.equal(fs.readFileSync(path.join(target, 'bin', 'tool'), 'utf8'), 'original');
      assert.equal(fs.statSync(path.join(target, 'bin', 'tool')).mode & 0o777, 0o755);
      assert.equal(fs.readlinkSync(path.join(target, 'bin', 'link')), 'tool');
      assert.equal(spawnSync('xattr', ['-p', 'org.opl.test', path.join(target, 'bin', 'tool')], { encoding: 'utf8' }).stdout.trim(), 'preserved');
    };
    check();
    fs.writeFileSync(path.join(target, 'bin', 'tool'), 'changed');
    assert.equal(fs.readFileSync(executable, 'utf8'), 'original');
    fs.rmSync(target, { recursive: true });
    const bin = path.join(root, 'commands');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'cp'), '#!/bin/sh\nmkdir -p "$4"\ntouch "$4/partial"\nexit 1\n', { mode: 0o755 });
    process.env.PATH = `${bin}${path.delimiter}${previousPath ?? ''}`;
    assert.equal(copyAppBundleForDmg(source, target), 'ditto');
    assert.equal(fs.existsSync(path.join(target, 'partial')), false);
    check();
  } finally {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
