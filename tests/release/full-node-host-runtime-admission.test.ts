import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findNodeToolchain } from '../../scripts/build-full-first-install-package/runtime-sources.ts';

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
  assert.equal(admitted.nodeBin, fs.realpathSync(node));
  assert.equal(admitted.npmRoot, path.join(fs.realpathSync(root), 'lib/node_modules/npm'));
});
