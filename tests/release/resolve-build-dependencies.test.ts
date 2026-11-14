import test from 'node:test';
import assert from 'node:assert/strict';
import { projectResolvedBuildDependencies } from '../../scripts/resolve-build-dependencies.ts';

test('projects one Framework resolution into Full and qualification inputs', () => {
  const resolved = {
    dependencies: [
      { dependency_id: 'officecli', version: '2.0.0', source_ref: 'v2.0.0', resolved_commit: 'a'.repeat(40), archive_url: 'https://example.test/office', archive_sha256: 'a'.repeat(64), archive_size_bytes: 1 },
      { dependency_id: 'mineru-open-api', version: '3.0.0', source_ref: 'v3.0.0', resolved_commit: 'b'.repeat(40), archive_url: 'https://example.test/mineru', archive_sha256: 'b'.repeat(64), archive_size_bytes: 1 },
      { dependency_id: 'temporal-cli', version: '1.9.0', source_ref: 'v1.9.0', archive_url: 'https://example.test/temporal', archive_sha256: 'c'.repeat(64), archive_size_bytes: 1 },
      { dependency_id: 'kimi-cu', version: '0.6.6', source_ref: '0.6.6', archive_url: 'https://example.test/kimi', archive_sha256: 'd'.repeat(64), archive_size_bytes: 1 },
      { dependency_id: 'codex-cli', version: '1.0.0', source_ref: '1.0.0', archive_url: 'https://example.test/codex', archive_sha256: 'e'.repeat(64), archive_size_bytes: 1, npm_integrity: 'sha512-codex', install_metadata: { npm_platform: { package: '@openai/codex-darwin-arm64', version: '1.0.0', npm_integrity: 'sha512-platform', tarball_url: 'https://example.test/platform', tarball_sha256: 'f'.repeat(64), tarball_size_bytes: 1 } } },
    ],
  };
  const full = { sources: { officecli: {}, mineru: {} }, toolchain: {}, runtime_payloads: { temporal_cli: {}, kimi_cu: {} } };
  const qualification = { runtime_payloads: { codex_cli: { package: '@openai/codex', platform: {} }, kimi_cu: {} } };
  const projected = projectResolvedBuildDependencies(resolved, full, qualification);
  assert.equal(projected.qualification.runtime_payloads.codex_cli.version, '1.0.0');
  assert.equal(projected.qualification.runtime_payloads.codex_cli.tarball_size_bytes, 1);
  assert.equal(projected.qualification.runtime_payloads.codex_cli.platform.tarball_sha256, 'f'.repeat(64));
  assert.equal(projected.qualification.runtime_payloads.kimi_cu.version, '0.6.6');
  assert.equal(projected.full.runtime_payloads.temporal_cli.version, '1.9.0');
  assert.equal(projected.full.sources.officecli.ref, 'a'.repeat(40));
});

test('rejects an unverified archive result', () => {
  assert.throws(() => projectResolvedBuildDependencies({ dependencies: [{ dependency_id: 'kimi-cu', version: '0.6.6', source_ref: '0.6.6' }] }, { sources: {}, toolchain: {}, runtime_payloads: {} }, { runtime_payloads: { kimi_cu: {} } }), /verified archive identity/);
});
