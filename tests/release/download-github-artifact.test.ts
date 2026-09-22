import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyArchive, validateEntries, extractArchive } from '../../scripts/download-github-artifact.mjs';

test('cached archive must match both GitHub byte size and SHA-256', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-artifact-integrity-'));
  const file = path.join(dir, 'archive.zip');
  try {
    fs.writeFileSync(file, 'signed candidate');
    const artifact = { size_in_bytes: 16, digest: `sha256:${createHash('sha256').update('signed candidate').digest('hex')}` };
    verifyArchive(file, artifact);
    assert.throws(() => verifyArchive(file, { ...artifact, size_in_bytes: 15 }), /size mismatch/);
    fs.writeFileSync(file, 'changed contents');
    assert.throws(() => verifyArchive(file, artifact), /digest mismatch/);
    assert.throws(() => verifyArchive(file, { ...artifact, digest: null }), /no SHA-256/);
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test('artifact extraction cannot escape its directory or alias another member', () => {
  assert.deepEqual(validateEntries(['candidate.dmg', 'cohort.json']), ['candidate.dmg', 'cohort.json']);
  for (const entries of [[], ['../candidate.dmg'], ['/candidate.dmg'], ['a\\b'], ['.'], ['..'], ['a\nb'], ['assets/../candidate.dmg'], ['assets//candidate.dmg'], ['assets/./candidate.dmg'], ['assets/'], ['C:/candidate.dmg'], ['assets', 'assets/candidate.dmg'], ['candidate.dmg', 'candidate.dmg']]) {
    assert.throws(() => validateEntries(entries));
  }
});

test('nested bound Standard artifacts extract without following parent or leaf symlinks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-artifact-nested-'));
  try {
    const source = path.join(root, 'source');
    fs.mkdirSync(path.join(source, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(source, 'assets', 'candidate.dmg'), 'signed bytes');
    fs.writeFileSync(path.join(source, 'receipt.json'), '{}');
    const archive = path.join(root, 'bound.zip');
    execFileSync('zip', ['-q', archive, 'assets/candidate.dmg', 'receipt.json'], { cwd: source });
    const output = path.join(root, 'output');
    assert.deepEqual(extractArchive(archive, output), ['assets/candidate.dmg', 'receipt.json']);
    assert.equal(fs.readFileSync(path.join(output, 'assets', 'candidate.dmg'), 'utf8'), 'signed bytes');
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    fs.rmSync(path.join(output, 'assets'), { recursive: true });
    fs.symlinkSync(outside, path.join(output, 'assets'));
    assert.throws(() => extractArchive(archive, output), /real directory/);
    assert.deepEqual(fs.readdirSync(outside), []);
    fs.unlinkSync(path.join(output, 'assets'));
    fs.mkdirSync(path.join(output, 'assets'));
    const sentinel = path.join(outside, 'sentinel');
    fs.writeFileSync(sentinel, 'unchanged');
    fs.symlinkSync(sentinel, path.join(output, 'assets', 'candidate.dmg'));
    assert.throws(() => extractArchive(archive, output));
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'unchanged');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
