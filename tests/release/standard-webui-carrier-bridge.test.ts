import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { bindStandardReleaseTrack } from '../../scripts/bind-standard-release-track.ts';
import { writeStandardDistributionTrust } from './app-release-boundary-cases/helpers.ts';

const appRoot = path.resolve(import.meta.dirname, '../..');
const adapterPath = path.join(appRoot, 'scripts', 'framework-release-adapter.ts');
const version = '26.7.24';
const updaterVersion = '26.7.2400';
const bundleDigest = `sha256:${'a'.repeat(64)}`;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function digest(value: Buffer | string): string {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function gitFixture(root: string, name: string, files: Record<string, string>): {
  root: string;
  sha: string;
} {
  const repository = path.join(root, name);
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(repository, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }
  for (const args of [
    ['init', '-q'],
    ['config', 'user.email', 'fixture@example.invalid'],
    ['config', 'user.name', 'Fixture'],
    ['add', '.'],
    ['commit', '-qm', 'fixture'],
  ]) {
    const result = spawnSync('git', args, { cwd: repository, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' });
  assert.equal(sha.status, 0, sha.stderr);
  return { root: repository, sha: sha.stdout.trim() };
}

function standardAssets(root: string): string {
  const zipName = `One-Person-Lab-${version}-mac-arm64.zip`;
  const payloadRoot = path.join(root, 'zip-payload');
  const plistPath = path.join(payloadRoot, 'One Person Lab.app', 'Contents', 'Info.plist');
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.writeFileSync(plistPath, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleShortVersionString</key><string>${updaterVersion}</string>
<key>CFBundleVersion</key><string>${updaterVersion}</string>
</dict></plist>
`);
  const zip = spawnSync('zip', ['-qry', path.join(root, zipName), 'One Person Lab.app'], {
    cwd: payloadRoot,
    encoding: 'utf8',
  });
  assert.equal(zip.status, 0, zip.stderr);
  fs.writeFileSync(path.join(root, 'latest-mac.yml'), `version: ${updaterVersion}\npath: ${zipName}\n`);
  fs.writeFileSync(path.join(root, `One-Person-Lab-${version}-mac-arm64.dmg`), 'dmg\n');
  fs.writeFileSync(path.join(root, `${zipName}.blockmap`), 'blockmap\n');
  fs.writeFileSync(path.join(root, 'opl-install.sh'), '#!/usr/bin/env bash\nexit 0\n', {
    mode: 0o755,
  });
  fs.writeFileSync(path.join(root, 'opl-app-installer.sh'), '#!/usr/bin/env bash\nexit 0\n', {
    mode: 0o755,
  });
  writeStandardDistributionTrust(root, version);
  return zipName;
}

test('Standard identity v2 binds the exact Bundle cohort and first source run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-identity-v2-'));
  const zipName = standardAssets(root);
  const componentOutput = path.join(root, 'opl-app-component-manifest.json');
  const identityOutput = path.join(root, 'standard-identity-receipt.json');
  const appSha = '1'.repeat(40);
  const shellSha = '2'.repeat(40);
  const frameworkSha = '3'.repeat(40);

  bindStandardReleaseTrack({
    assetsDir: root,
    version,
    updaterVersion,
    appSha,
    shellSha,
    frameworkSha,
    bundleDigest,
    channel: 'stable',
    repository: 'gaofeng21cn/one-person-lab-app',
    sourceRunId: '123456789',
    sourceRunAttempt: 1,
    componentManifestScript: path.join(appRoot, 'scripts', 'write-opl-app-component-manifest.ts'),
    componentManifestOutput: componentOutput,
    identityReceiptOutput: identityOutput,
  });

  const identity = JSON.parse(fs.readFileSync(identityOutput, 'utf8'));
  assert.deepEqual(identity.source, {
    repository: 'gaofeng21cn/one-person-lab-app',
    run_id: '123456789',
    run_attempt: 1,
  });
  assert.deepEqual(identity.release, {
    channel: 'stable',
    version,
    updater_version: updaterVersion,
    tag: `v${version}`,
    bundle_digest: bundleDigest,
  });
  assert.deepEqual(identity.cohort, {
    app_sha: appSha,
    shell_sha: shellSha,
    framework_sha: frameworkSha,
  });
  assert.equal(identity.schema, 'opl_standard_release_identity_receipt.v2');
  assert.equal(identity.updater_zip.name, zipName);
  assert.match(identity.updater_metadata.sha256, /^sha256:[0-9a-f]{64}$/);
  assert.match(identity.updater_zip.sha256, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(identity.installer_bootstrap, {
    name: 'opl-app-installer.sh',
    sha256: digest(fs.readFileSync(path.join(root, 'opl-app-installer.sh'))),
  });
  assert.deepEqual(identity.universal_installer, {
    name: 'opl-install.sh',
    sha256: digest(fs.readFileSync(path.join(root, 'opl-install.sh'))),
  });
  assert.match(identity.component_manifest.sha256, /^sha256:[0-9a-f]{64}$/);

  assert.throws(() => bindStandardReleaseTrack({
    assetsDir: root,
    version,
    updaterVersion,
    appSha,
    shellSha,
    frameworkSha,
    bundleDigest,
    channel: 'stable',
    repository: 'gaofeng21cn/one-person-lab-app',
    sourceRunId: '123456789',
    sourceRunAttempt: 2,
    componentManifestScript: path.join(appRoot, 'scripts', 'write-opl-app-component-manifest.ts'),
    componentManifestOutput: componentOutput,
    identityReceiptOutput: identityOutput,
  }), /exact first-attempt source run identity/);
});

function bridgeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-bridge-'));
  const app = gitFixture(root, 'app', {
    'scripts/validate-webui-runtime-image.ts': 'export const fixture = true;\n',
  });
  const shell = gitFixture(root, 'shell', {
    Dockerfile: 'FROM node:22-bookworm-slim\n',
    'contracts/aionui-upstream-intake.json': `${JSON.stringify({
      managed_runtime: { codex_cli: { package: '@openai/codex', version: '1.2.3' } },
    })}\n`,
  });
  const framework = gitFixture(root, 'framework', { 'fixture.txt': 'framework\n' });
  const baseImageIndex = path.join(root, 'base-image-index.json');
  writeJson(baseImageIndex, {
    manifests: [{
      digest: `sha256:${'b'.repeat(64)}`,
      size: 1234,
      platform: { os: 'linux', architecture: 'amd64' },
    }],
  });
  const codexSource = path.join(root, 'codex-source', 'package');
  fs.mkdirSync(codexSource, { recursive: true });
  writeJson(path.join(codexSource, 'package.json'), { name: '@openai/codex', version: '1.2.3' });
  const codexTarball = path.join(root, 'codex-cli.tgz');
  const tar = spawnSync('tar', ['-czf', codexTarball, 'package'], {
    cwd: path.dirname(codexSource),
    encoding: 'utf8',
  });
  assert.equal(tar.status, 0, tar.stderr);

  const bundleCore = {
    surface_kind: 'opl_release_bundle.v1',
    schema_ref: 'contracts/opl-framework/release-bundle.schema.json',
    release: {
      channel: 'stable',
      version,
      display_version: version,
      updater_version: updaterVersion,
      tag: `v${version}`,
      prerelease: false,
    },
    sources: {
      app: { repo: 'gaofeng21cn/one-person-lab-app', source_commit: app.sha },
      shell: { repo: 'gaofeng21cn/opl-aion-shell', source_commit: shell.sha },
      framework: { repo: 'gaofeng21cn/one-person-lab', source_commit: framework.sha },
    },
    identity_mode: 'app_standard_compatibility',
    package_compatibility: { abi: 'opl_packages.v1', version_range: '>=0.1.0 <1.0.0' },
    tracks: {
      standard: { required_for_latest: true },
      full: { required_for_latest: false },
    },
    policy: { latest_required_track: 'standard' },
  };
  const exactBundleDigest = digest(canonicalJson(bundleCore));
  const bundle = { ...bundleCore, bundle_digest: exactBundleDigest };
  const bundlePath = path.join(root, 'release-bundle.json');
  writeJson(bundlePath, bundle);
  const identityPath = path.join(root, 'standard-identity-receipt.json');
  writeJson(identityPath, {
    schema: 'opl_standard_release_identity_receipt.v2',
    status: 'passed',
    source: {
      repository: 'gaofeng21cn/one-person-lab-app',
      run_id: '987654321',
      run_attempt: 1,
    },
    release: {
      channel: 'stable',
      version,
      updater_version: updaterVersion,
      tag: `v${version}`,
      bundle_digest: exactBundleDigest,
    },
    cohort: {
      app_sha: app.sha,
      shell_sha: shell.sha,
      framework_sha: framework.sha,
    },
    updater_metadata: { name: 'latest-arm64-mac.yml', sha256: `sha256:${'4'.repeat(64)}` },
    updater_zip: { name: `One-Person-Lab-${version}-mac-arm64.zip`, sha256: `sha256:${'5'.repeat(64)}` },
    component_manifest: { name: 'opl-app-component-manifest.json', sha256: `sha256:${'6'.repeat(64)}` },
  });
  return {
    root,
    app,
    shell,
    framework,
    baseImageIndex,
    codexTarball,
    bundlePath,
    identityPath,
    exactBundleDigest,
  };
}

function runAdapter(args: string[]) {
  return spawnSync(process.execPath, ['--experimental-strip-types', adapterPath, ...args], {
    cwd: appRoot,
    encoding: 'utf8',
  });
}

test('Standard freeze request contains only Desktop Standard and optional Full tracks', () => {
  const fixture = bridgeFixture();
  const notesPath = path.join(fixture.root, 'notes.md');
  const evidencePath = path.join(fixture.root, 'notes-evidence.json');
  const output = path.join(fixture.root, 'freeze-request.json');
  fs.writeFileSync(notesPath, '# Stable\n\n<!-- OPL_RELEASE_NOTES_GENERATOR:online-ai -->\n');
  writeJson(evidencePath, {
    schema: 'opl_app_release_notes_evidence.v1',
    payload: { include_full_package: false },
  });
  const result = runAdapter([
    'freeze-request',
    '--channel', 'stable',
    '--version', version,
    '--updater-version', updaterVersion,
    '--app-root', fixture.app.root,
    '--shell-root', fixture.shell.root,
    '--framework-root', fixture.framework.root,
    '--notes', notesPath,
    '--notes-evidence', evidencePath,
    '--include-full-package', 'false',
    '--package-compatibility-abi', 'opl_packages.v1',
    '--package-compatibility-version-range', '>=0.1.0 <1.0.0',
    '--output', output,
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const request = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.deepEqual(Object.keys(request.tracks).sort(), ['full', 'standard']);
  assert.equal(request.tracks.standard.required_for_latest, true);
  assert.equal(request.tracks.webui, undefined);
  assert.equal(request.source_cutoff, undefined);
  assert.equal(request.frozen_build_inputs, undefined);
  assert.deepEqual(request.package_compatibility, {
    abi: 'opl_packages.v1',
    version_range: '>=0.1.0 <1.0.0',
  });
});

test('WebUI build input derives from Standard identity without entering the Standard Bundle track', () => {
  const fixture = bridgeFixture();
  const output = path.join(fixture.root, 'webui-build-input-draft.json');
  const result = runAdapter([
    'webui-build-input',
    '--standard-identity', fixture.identityPath,
    '--bundle', fixture.bundlePath,
    '--app-root', fixture.app.root,
    '--shell-root', fixture.shell.root,
    '--framework-root', fixture.framework.root,
    '--source-cutoff-observed-at', '2026-07-24T00:00:00.000Z',
    '--base-image-index', fixture.baseImageIndex,
    '--frozen-codex-tarball', fixture.codexTarball,
    '--output', output,
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const buildInput = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.deepEqual(buildInput.release, {
    version,
    bundle_digest: fixture.exactBundleDigest,
    cohort_ref: fixture.exactBundleDigest,
  });
  assert.deepEqual(buildInput.cohort, {
    app_sha: fixture.app.sha,
    shell_sha: fixture.shell.sha,
    framework_sha: fixture.framework.sha,
  });
  assert.equal(buildInput.source_cutoff.frozen_base_release_set, null);
  assert.deepEqual(buildInput.inputs.map((input: { id: string }) => input.id), [
    'app_source',
    'base_image',
    'codex_cli',
    'dockerfile',
    'framework_seed',
    'qualification_harness',
    'shell_webui_source',
  ]);
  assert.equal(buildInput.inputs.some((input: { id: string }) => input.id === 'first_party_packages'), false);
  assert.equal(buildInput.inputs.some((input: { id: string }) => input.id === 'opl_flow'), false);

  const bundle = JSON.parse(fs.readFileSync(fixture.bundlePath, 'utf8'));
  assert.equal(bundle.tracks.webui, undefined);
  assert.equal(bundle.source_cutoff, undefined);
  assert.equal(bundle.frozen_build_inputs, undefined);
  assert.equal(bundle.policy.latest_required_track, 'standard');
  assert.equal(bundle.policy.latest_required_tracks, undefined);
});

test('WebUI bridge rejects tampered Bundle bytes and Framework WebUI track receipts', () => {
  const fixture = bridgeFixture();
  const tamperedPath = path.join(fixture.root, 'tampered-bundle.json');
  const tampered = JSON.parse(fs.readFileSync(fixture.bundlePath, 'utf8'));
  tampered.release.version = '26.7.25';
  writeJson(tamperedPath, tampered);
  const rejected = runAdapter([
    'webui-build-input',
    '--standard-identity', fixture.identityPath,
    '--bundle', tamperedPath,
    '--app-root', fixture.app.root,
    '--shell-root', fixture.shell.root,
    '--framework-root', fixture.framework.root,
    '--source-cutoff-observed-at', '2026-07-24T00:00:00.000Z',
    '--base-image-index', fixture.baseImageIndex,
    '--frozen-codex-tarball', fixture.codexTarball,
  ]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Bundle digest does not match/);

  const executor = runAdapter([
    'executor-receipt',
    '--operation', 'build',
    '--release-operation', 'standard',
    '--operation-id', 'standard',
    '--executor', 'remote',
    '--attempt-id', 'webui',
    '--remote-target', 'github-actions:fixture',
    '--bundle', fixture.bundlePath,
    '--track', 'webui',
    '--outcome', 'complete',
  ]);
  assert.notEqual(executor.status, 0);
  assert.match(executor.stderr, /Invalid track/);

  const qualification = runAdapter([
    'qualification-receipt',
    '--bundle', fixture.bundlePath,
    '--track', 'webui',
  ]);
  assert.notEqual(qualification.status, 0);
  assert.match(qualification.stderr, /track must be standard or full/);
});
