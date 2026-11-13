import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createFullBuildTiming } from '../../scripts/build-full-first-install-package/build-timing.ts';

test('Full timing persists completed stages and the exact failing stage without admitting a build', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-timing-'));
  const file = path.join(root, 'timing.json');
  const read = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  try {
    const timing = createFullBuildTiming(file, { version: 'test' });
    timing.start('runtime_materialize');
    assert.equal(read().current_stage, 'runtime_materialize');
    timing.start('shell_build');
    assert.equal(read().stages[0].status, 'completed');
    timing.finish('failed');
    const failed = read();
    assert.equal(failed.status, 'failed');
    assert.equal(failed.current_stage, 'shell_build');
    assert.equal(failed.stages[1].status, 'failed');
    assert.ok(failed.duration_seconds.full_package_build_breakdown.runtime_materialize >= 0);
    assert.ok(failed.duration_seconds.full_package_build_breakdown.shell_build >= 0);
    const successful = createFullBuildTiming(file, { version: 'test' });
    successful.start('dmg_package_compression');
    successful.finish('completed');
    assert.equal(read().current_stage, null);
    assert.equal(read().status, 'completed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
