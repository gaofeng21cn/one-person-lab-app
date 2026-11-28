import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectResolvedBuildDependencies } from '../../scripts/resolve-build-dependencies.ts';

test('projects one Framework resolution into Full and qualification inputs', () => {
  const resolved = {
    dependencies: [
      { dependency_id: 'officecli', version: '2.0.0', source_ref: 'v2.0.0', resolved_commit: 'a'.repeat(40), archive_url: 'https://example.test/office', archive_sha256: 'a'.repeat(64), archive_size_bytes: 1 },
      { dependency_id: 'mineru-open-api', version: '3.0.0', source_ref: 'v3.0.0', resolved_commit: 'b'.repeat(40), archive_url: 'https://example.test/mineru', archive_sha256: 'b'.repeat(64), archive_size_bytes: 1 },
      { dependency_id: 'codex-cli', platform: 'darwin', architecture: 'arm64', version: '1.0.0', source_ref: '1.0.0', archive_url: 'https://example.test/codex', archive_sha256: 'e'.repeat(64), archive_size_bytes: 1, npm_integrity: 'sha512-codex', install_metadata: { npm_platform: { package: '@openai/codex', version: '1.0.0-darwin-arm64', npm_integrity: 'sha512-platform', tarball_url: 'https://example.test/platform', tarball_sha256: 'f'.repeat(64), tarball_size_bytes: 1 } } },
    ],
  };
  const full = { sources: { officecli: {}, mineru: {} }, toolchain: {}, runtime_payloads: { officecli: {} } };
  const qualification = { runtime_payloads: { codex_cli: { package: '@openai/codex', platform: {} } } };
  const projected = projectResolvedBuildDependencies(resolved, full, qualification);
  assert.equal(projected.qualification.runtime_payloads.codex_cli.version, '1.0.0');
  assert.equal(projected.qualification.runtime_payloads.codex_cli.tarball_size_bytes, 1);
  assert.equal(projected.qualification.runtime_payloads.codex_cli.platform.tarball_sha256, 'f'.repeat(64));
  assert.equal(projected.qualification.runtime_payloads.kimi_cu, undefined);
  assert.equal(projected.full.runtime_payloads.officecli.darwin_arm64_asset_sha256, 'a'.repeat(64));
  assert.equal(projected.full.sources.officecli.ref, 'a'.repeat(40));
});

test('rejects an unverified archive result', () => {
  assert.throws(() => projectResolvedBuildDependencies({ dependencies: [{ dependency_id: 'officecli', version: '2.0.0', source_ref: 'v2.0.0', resolved_commit: 'a'.repeat(40) }] }, { sources: { officecli: {} }, toolchain: {}, runtime_payloads: { officecli: {} } }, { runtime_payloads: { codex_cli: { package: '@openai/codex', platform: {} } } }), /verified archive identity/);
});

test('projects the selected Codex native archive over the macOS qualification template', () => {
  const policy = JSON.parse(readFileSync(new URL('../../contracts/app-release-qualification-input-manifest.json', import.meta.url), 'utf8'));
  const targets = [
    ['linux', 'x64', 'x86_64-unknown-linux-musl/bin/codex'],
    ['linux', 'arm64', 'aarch64-unknown-linux-musl/bin/codex'],
    ['darwin', 'x64', 'x86_64-apple-darwin/bin/codex'],
    ['darwin', 'arm64', 'aarch64-apple-darwin/bin/codex'],
    ['win32', 'x64', 'x86_64-pc-windows-msvc/bin/codex.exe'],
    ['win32', 'arm64', 'aarch64-pc-windows-msvc/bin/codex.exe'],
  ];
  for (const [os, cpu, executable] of targets) {
    const version = '0.172.0';
    const platformVersion = `${version}-${os}-${cpu}`;
    const archive = {
      package: '@openai/codex', version: platformVersion, npm_integrity: 'sha512-cGxhdGZvcm0=',
      tarball_url: `https://registry.npmjs.org/@openai/codex/-/codex-${platformVersion}.tgz`,
      tarball_sha256: 'f'.repeat(64), tarball_size_bytes: 120,
    };
    const codex = {
      dependency_id: 'codex-cli', platform: os, architecture: cpu,
      version, source_ref: 'https://registry.npmjs.org/@openai/codex/latest',
      archive_url: `https://registry.npmjs.org/@openai/codex/-/codex-${version}.tgz`,
      archive_sha256: 'b'.repeat(64), archive_size_bytes: 100,
      npm_integrity: 'sha512-Y29kZXg=', install_metadata: { npm_platform: archive },
    };
    const { qualification } = projectResolvedBuildDependencies({ dependencies: [codex] }, {}, policy);
    assert.deepEqual(qualification.runtime_payloads.codex_cli.platform, {
      ...archive, os, cpu, binary_path: `package/vendor/${executable}`,
    });
  }
});
