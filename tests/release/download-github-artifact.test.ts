import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyArchive, validateEntries } from '../../scripts/download-github-artifact.mjs';

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
  for (const entries of [[], ['../candidate.dmg'], ['/candidate.dmg'], ['a\\b'], ['.'], ['..'], ['a\nb'], ['candidate.dmg', 'candidate.dmg']]) {
    assert.throws(() => validateEntries(entries));
  }
});
