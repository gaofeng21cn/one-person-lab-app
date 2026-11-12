import "./full-first-install-runtime-package-and-build-lock.ts";
import "./full-first-install-runtime-runtime-boundary-and-executables.ts";
import "./full-first-install-runtime-scholar-skills-and-currentness.ts";
import "./full-first-install-runtime-pruning-and-staging.ts";

import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../../../scripts/build-full-first-install-package/process.ts';

test('Full runtime probes capture JSON larger than the Node default pipe buffer', () => {
  const result = run(process.execPath, [
    '-e',
    'process.stdout.write(JSON.stringify({ payload: "x".repeat(2 * 1024 * 1024) }))',
  ], { capture: true });
  assert.equal(JSON.parse(result.stdout).payload.length, 2 * 1024 * 1024);
});

test('Full runtime probes retain the spawn error when no child can start', () => {
  assert.throws(() => run('/opl-nonexistent-build-probe', [], { capture: true }), /ENOENT/);
});
