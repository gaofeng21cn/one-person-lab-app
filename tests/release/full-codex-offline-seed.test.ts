import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { materializeFullCodexOfflineSeed, assertFullCodexOfflineSeed } from '../../scripts/build-full-first-install-package/codex-offline-seed.ts';

test('Full packages both operation-resolved Codex archives and rejects drift', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'full-codex-seed-'));
  try {
    const archives = ['package', 'platform'].map((kind) => {
      const bytes = Buffer.from(`exact ${kind} bytes`);
      const file = path.join(root, `${kind}.tgz`);
      fs.writeFileSync(file, bytes);
      return { file, tarball_url: `https://example.invalid/${kind}.tgz`, tarball_size_bytes: bytes.length,
        tarball_sha256: crypto.createHash('sha256').update(bytes).digest('hex'), npm_integrity: 'sha512-fixture' };
    });
    const identity = { ...archives[0], package: '@openai/codex', version: '1.2.3',
      platform: { ...archives[1], os: 'darwin', cpu: 'arm64', version: '1.2.3-darwin-arm64' } };
    const prepared = { runtimeRoot: path.join(root, 'runtime'), manifest: { size_breakdown: {}, runtime_assertions: { offline_required_payloads: [] } } as any };
    const seed = materializeFullCodexOfflineSeed(prepared, { identity, packagePath: archives[0].file, platformPath: archives[1].file });
    assert.equal(seed.version, '1.2.3');
    assert.equal(seed.selection_policy, 'latest_stable_at_operation_start');
    assert.equal(assertFullCodexOfflineSeed(prepared.runtimeRoot, seed), true);
    assert.equal(prepared.manifest.runtime_assertions.offline_required_payloads.length, 2);
    assert.equal(fs.existsSync(path.join(prepared.runtimeRoot, 'bin', 'codex')), false);
    assert.ok(prepared.manifest.size_breakdown.total_runtime_uncompressed_bytes > 30);
    fs.appendFileSync(path.join(prepared.runtimeRoot, seed.archives.platform.path), 'drift');
    assert.throws(() => assertFullCodexOfflineSeed(prepared.runtimeRoot, seed), /size drifted/);
    assert.throws(() => materializeFullCodexOfflineSeed(prepared, { identity: { ...identity, version: undefined } }), /operation-resolved/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
