import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createFullDmgImage } from '../../scripts/build-full-first-install-package/archive-output.ts';

test('ULMO uses all available compression tasks and cleans its intermediate image on success and failure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-parallel-ulmo-'));
  const bin = path.join(root, 'bin');
  const log = path.join(root, 'commands.jsonl');
  const previous = { PATH: process.env.PATH, fail: process.env.OPL_TEST_CONVERT_FAIL };
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'hdiutil'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'info') process.exit(0);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
if (args[0] === 'convert' && process.env.OPL_TEST_CONVERT_FAIL === '1') process.exit(7);
fs.writeFileSync(args[0] === 'create' ? args[1] : args[args.indexOf('-o') + 1], 'image');
`, { mode: 0o755 });
  process.env.PATH = `${bin}${path.delimiter}${previous.PATH ?? ''}`;
  const stage = path.join(root, 'staging');
  fs.mkdirSync(stage);
  const target = path.join(root, 'Full.dmg');
  const scratchDirs = () => fs.readdirSync(root).filter((name) => name.startsWith('.opl-full-compression-'));
  try {
    const result = createFullDmgImage(target, stage, 'Full', 'ULMO');
    assert.equal(result.tasks, os.availableParallelism());
    const commands = fs.readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(commands.length, 2);
    assert.equal(commands[0][0], 'create');
    assert.equal(commands[0][commands[0].indexOf('-format') + 1], 'UDRW');
    assert.equal(path.relative(stage, commands[0][1]).startsWith('..'), true);
    assert.deepEqual(commands[1], ['convert', commands[0][1], '-format', 'ULMO', '-tasks', String(os.availableParallelism()), '-o', target, '-ov']);
    assert.deepEqual(scratchDirs(), []);
    assert.equal(fs.existsSync(target), true);
    process.env.OPL_TEST_CONVERT_FAIL = '1';
    assert.throws(() => createFullDmgImage(target, stage, 'Full', 'ULMO'), /Command failed: hdiutil convert/);
    assert.deepEqual(scratchDirs(), []);
    assert.equal(fs.existsSync(target), false);
    delete process.env.OPL_TEST_CONVERT_FAIL;
    fs.writeFileSync(log, '');
    assert.equal(createFullDmgImage(target, stage, 'Full', 'UDZO', '9').method, 'direct_create');
    const direct = JSON.parse(fs.readFileSync(log, 'utf8').trim());
    assert.deepEqual(direct.slice(-2), ['-imagekey', 'zlib-level=9']);
  } finally {
    if (previous.PATH === undefined) delete process.env.PATH; else process.env.PATH = previous.PATH;
    if (previous.fail === undefined) delete process.env.OPL_TEST_CONVERT_FAIL; else process.env.OPL_TEST_CONVERT_FAIL = previous.fail;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
