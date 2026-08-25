import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendStudioFullAssets,
  buildStudioFullAssets,
  type StudioFullAsset,
  type StudioFullReleaseRuntime,
} from '../../scripts/studio-full-release-adapter.ts';

const repo = 'gaofeng21cn/opl-studio';
const tag = 'v0.1.1';
const studioSha = 'a'.repeat(40);
const studioTree = 'b'.repeat(40);

function digest(bytes: Buffer | string): string {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function writeAsset(root: string, name: string, content: string): StudioFullAsset {
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, content);
  const bytes = fs.readFileSync(filePath);
  return { name, size_bytes: bytes.byteLength, sha256: digest(bytes), source_path: filePath };
}

function rawAsset(asset: StudioFullAsset): Record<string, unknown> {
  return { name: asset.name, size: asset.size_bytes, digest: asset.sha256, browser_download_url: asset.name };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-studio-full-adapter-'));
  const standardAssets = [
    writeAsset(root, `one-person-lab-preview-${tag.slice(1)}-mac-arm64.dmg`, 'standard-dmg'),
    writeAsset(root, `one-person-lab-preview-${tag.slice(1)}-mac-arm64.zip`, 'standard-zip'),
    writeAsset(root, `one-person-lab-preview-${tag.slice(1)}-mac-arm64.zip.blockmap`, 'standard-blockmap'),
    writeAsset(root, 'latest-mac.yml', 'latest'),
    writeAsset(root, 'latest-arm64-mac.yml', 'latest'),
  ];
  const fullDmg = writeAsset(root, `one-person-lab-preview-full-${tag.slice(1)}-mac-arm64.dmg`, 'full-dmg');
  const manifestPath = path.join(root, 'opl-release-manifest.json');
  const manifest = {
    schema: 'opl_public_release_manifest.v1',
    carrier: {
      carrier_id: 'opl-studio',
      profile_id: 'opl-studio-full-first-install',
      bundle_id: 'cn.onepersonlab.opl.studio.preview',
      codex_carrier: 'opl_codex_native',
      aioncore_required: false,
    },
    package_kind: 'opl_studio_full_first_install_macos_arm64',
    version: tag.slice(1),
    release_version: tag.slice(1),
    primary_install_asset: fullDmg.name,
    assets: [{ name: fullDmg.name, size_bytes: fullDmg.size_bytes, sha256: fullDmg.sha256 }],
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  const full = buildStudioFullAssets({ dmgPath: fullDmg.source_path, manifestPath });
  return { root, standardAssets, fullAssets: full.assets };
}

function runtimeFor(
  files: ReturnType<typeof fixture>,
  options: { initialFull?: boolean; conflictFull?: boolean; failUpload?: boolean; publishThenFail?: boolean } = {},
): { runtime: StudioFullReleaseRuntime; calls: string[][]; remoteAssets: StudioFullAsset[] } {
  const calls: string[][] = [];
  const remoteAssets = [...files.standardAssets, ...(options.initialFull ? files.fullAssets : [])];
  if (options.conflictFull) {
    remoteAssets.push({
      ...files.fullAssets[0]!,
      size_bytes: files.fullAssets[0]!.size_bytes + 1,
      sha256: digest('conflicting-full-asset'),
    });
  }
  const release = () => JSON.stringify({
    id: 1234,
    tag_name: tag,
    target_commitish: studioSha,
    name: 'One Person Lab Preview 0.1.1',
    body: 'stable notes',
    draft: false,
    prerelease: false,
    immutable: false,
    assets: remoteAssets.map(rawAsset),
  });
  const runtime: StudioFullReleaseRuntime = {
    now: () => Date.now(),
    run(_command, args) {
      calls.push(args);
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/tags/${tag}`) {
        return { status: 0, stdout: release(), stderr: '' };
      }
      if (args[0] === 'api' && args[1] === `repos/${repo}/git/ref/tags/${tag}`) {
        return { status: 0, stdout: JSON.stringify({ object: { type: 'commit', sha: studioSha } }), stderr: '' };
      }
      if (args[0] === 'api' && args[1] === `repos/${repo}/git/commits/${studioSha}`) {
        return { status: 0, stdout: JSON.stringify({ sha: studioSha, tree: { sha: studioTree } }), stderr: '' };
      }
      if (args[0] === 'release' && args[1] === 'upload') {
        const sourcePath = String(args[3]);
        const asset = files.fullAssets.find((candidate) => candidate.source_path === sourcePath);
        assert.ok(asset, `unexpected upload source ${sourcePath}`);
        if (options.publishThenFail || !options.failUpload) {
          if (!remoteAssets.some((candidate) => candidate.name === asset.name)) remoteAssets.push(asset);
        }
        if (options.failUpload) return { status: 1, stdout: '', stderr: 'upload timeout' };
        return { status: 0, stdout: '', stderr: '' };
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };
  return { runtime, calls, remoteAssets };
}

function appendArgs(files: ReturnType<typeof fixture>, runtime: StudioFullReleaseRuntime) {
  return appendStudioFullAssets({
    repo,
    tag,
    studioSha,
    studioTree,
    standardAssets: files.standardAssets,
    fullAssets: files.fullAssets,
    runtime,
  });
}

test('Studio Full appends exactly two assets and never mutates release metadata', () => {
  const files = fixture();
  const simulated = runtimeFor(files);
  const result = appendArgs(files, simulated.runtime);

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.uploaded, files.fullAssets.map((asset) => asset.name));
  assert.deepEqual(result.reconciled, []);
  assert.equal(result.standard_assets_modified, false);
  assert.equal(result.release_notes_modified, false);
  assert.equal(result.latest_modified, false);
  assert.equal(result.updater_metadata_modified, false);
  assert.equal(simulated.calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length, 2);
  assert.equal(simulated.calls.some((args) => args.includes('--clobber')), false);
  assert.equal(simulated.calls.some((args) => args.includes('create') || args.includes('edit')), false);
});

test('Studio Full append is idempotent when both exact assets already exist', () => {
  const files = fixture();
  const simulated = runtimeFor(files, { initialFull: true });
  const result = appendArgs(files, simulated.runtime);

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.uploaded, []);
  assert.deepEqual(result.reconciled, []);
  assert.equal(simulated.calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length, 0);
});

test('same-name different digest fails closed before any upload', () => {
  const files = fixture();
  const simulated = runtimeFor(files, { conflictFull: true });
  assert.throws(
    () => appendArgs(files, simulated.runtime),
    /conflicts with its exact size or digest/,
  );
  assert.equal(simulated.calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length, 0);
});

test('accepted upload with non-zero result is reconciled without retry', () => {
  const files = fixture();
  const simulated = runtimeFor(files, { failUpload: true, publishThenFail: true });
  const result = appendArgs(files, simulated.runtime);

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.uploaded, []);
  assert.deepEqual(result.reconciled, [files.fullAssets[0]!.name, files.fullAssets[1]!.name]);
  assert.equal(simulated.calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length, 2);
});

test('non-zero upload without exact readback fails closed and is never retried', () => {
  const files = fixture();
  const simulated = runtimeFor(files, { failUpload: true });
  assert.throws(() => appendArgs(files, simulated.runtime), /outcome is unknown/);
  assert.equal(simulated.calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length, 1);
});
