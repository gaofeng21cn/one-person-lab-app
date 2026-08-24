import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertStandardLatestAdmissionReceipt,
  validateStandardLatestAdmission,
  type StandardLatestAdmissionInput,
} from '../../scripts/validate-standard-latest-admission.ts';
import { createLatestPointerOverrideAuthority } from '../../scripts/write-latest-pointer-override-authority.ts';
import { createAppComponentManifest } from '../../scripts/write-opl-app-component-manifest.ts';

const bundleDigest = `sha256:${'a'.repeat(64)}`;
const appSha = '1'.repeat(40);
const shellSha = '2'.repeat(40);
const frameworkSha = '3'.repeat(40);
const zipSha = 'b'.repeat(64);
const zipSize = 1_234_567;
const dmgSha = 'e'.repeat(64);
const dmgSize = 2_345_678;

function writeJson(root: string, relative: string, value: unknown): string {
  const filePath = path.join(root, relative);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function sha256(filePath: string): string {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function configureCandidate(
  root: string,
  input: StandardLatestAdmissionInput,
  publicationChannel: 'stable' | 'preview' | 'nightly',
  version: string,
  updaterVersion: string,
  includeInstaller = true,
): void {
  input.publicationChannel = publicationChannel;
  input.candidateDisplayVersion = version;
  input.candidateUpdaterVersion = updaterVersion;
  const expectedAssetNames = [
    'latest-mac.yml',
    'latest-arm64-mac.yml',
    `One-Person-Lab-${version}-mac-arm64.dmg`,
    `One-Person-Lab-${version}-mac-arm64.zip`,
    `One-Person-Lab-${version}-mac-arm64.zip.blockmap`,
    ...(publicationChannel === 'preview' ? [`One-Person-Lab-${version}-linux-x64.deb`] : []),
    ...(includeInstaller ? ['opl-install.sh'] : []),
  ];
  const manifest = createAppComponentManifest({
    version,
    updaterVersion,
    sourceCommit: appSha,
    shellCommit: shellSha,
    frameworkCommit: frameworkSha,
    tag: `v${version}`,
    releaseUrl: `https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/v${version}`,
    repo: 'gaofeng21cn/one-person-lab-app',
    assets: expectedAssetNames.map((name, index) => ({
      name,
      url: `https://example.invalid/${name}`,
      digest: name.endsWith('.dmg')
        ? `sha256:${dmgSha}`
        : name.endsWith('.zip')
          ? `sha256:${zipSha}`
          : `sha256:${String(index + 1).repeat(64)}`,
      size: name.endsWith('.dmg') ? dmgSize : name.endsWith('.zip') ? zipSize : 42,
    })),
  });
  writeJson(root, 'component-manifest.json', manifest);

  const staged = JSON.parse(fs.readFileSync(input.standardAssetsPath, 'utf8'));
  staged.assets = [
    ...manifest.artifacts.map((asset: any) => ({
      name: asset.name,
      sha256: asset.digest,
      size_bytes: asset.size,
    })),
    {
    name: 'opl-app-component-manifest.json',
    sha256: sha256(input.componentManifestPath),
    size_bytes: fs.statSync(input.componentManifestPath).size,
    },
  ];
  fs.writeFileSync(input.standardAssetsPath, `${JSON.stringify(staged, null, 2)}\n`);

  if (publicationChannel === 'stable') {
    input.latestOverrideAuthorityPath = undefined;
    return;
  }
  input.latestOverrideAuthorityPath = writeJson(
    root,
    'latest-override-authority.json',
    createLatestPointerOverrideAuthority(manifest, input.expectedCurrentLatestTag),
  );
}

function createFixture(): { root: string; input: StandardLatestAdmissionInput } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-latest-admission-'));
  const standardAssetsPath = writeJson(root, 'checkpoint/tracks/standard/assets.json', {
    surface_kind: 'opl_release_bundle_staged_assets.v1',
    bundle_digest: bundleDigest,
    track: 'standard',
    assets: [
      {
        name: 'One-Person-Lab-26.7.21-r1-mac-arm64.zip',
        sha256: `sha256:${zipSha}`,
        size_bytes: zipSize,
      },
      {
        name: 'One-Person-Lab-26.7.21-r1-mac-arm64.dmg',
        sha256: `sha256:${dmgSha}`,
        size_bytes: dmgSize,
      },
    ],
  });
  const input: StandardLatestAdmissionInput = {
    publicationChannel: 'stable',
    bundleDigest,
    candidateDisplayVersion: '26.7.21-r1',
    candidateUpdaterVersion: '26.7.2101',
    appSha,
    shellSha,
    frameworkSha,
    standardAssetsPath,
    componentManifestPath: path.join(root, 'component-manifest.json'),
    expectedCurrentLatestTag: 'v26.7.20',
  };
  configureCandidate(root, input, 'stable', '26.7.21-r1', '26.7.2101');
  return { root, input };
}

function stableAuthority(receipt: Record<string, any>): Record<string, any> {
  const assets = JSON.parse(fs.readFileSync(receipt.__standardAssetsPath, 'utf8')).assets;
  return {
    publicationChannel: 'stable',
    bundleDigest,
    candidateDisplayVersion: '26.7.21-r1',
    candidateUpdaterVersion: '26.7.2101',
    appSha,
    shellSha,
    frameworkSha,
    standardAssets: assets,
  };
}

test('Latest admission binds the hosted publication floor and exact Standard bytes without Homebrew', () => {
  const fixture = createFixture();
  try {
    const receipt = validateStandardLatestAdmission(fixture.input);
    assert.equal(receipt.status, 'passed');
    assert.equal(receipt.latest_activation_admitted, true);
    assert.deepEqual(receipt.candidate.zip, {
      name: 'One-Person-Lab-26.7.21-r1-mac-arm64.zip',
      sha256: `sha256:${zipSha}`,
      size_bytes: zipSize,
    });
    assert.deepEqual(receipt.candidate.dmg, {
      name: 'One-Person-Lab-26.7.21-r1-mac-arm64.dmg',
      sha256: `sha256:${dmgSha}`,
      size_bytes: dmgSize,
    });
    assert.deepEqual(receipt.latest_compare_and_swap, {
      expected_current: { tag: 'v26.7.20' },
      candidate: { tag: 'v26.7.21-r1' },
    });
    assert.deepEqual(receipt.hosted_publication_floor, {
      schema: 'opl_standard_hosted_publication_floor.v1',
      source_contract_build_preflight: 'passed',
      remote_digest_readback: 'passed',
      required_assets: [
        'One-Person-Lab-26.7.21-r1-mac-arm64.dmg',
        'One-Person-Lab-26.7.21-r1-mac-arm64.zip',
        'One-Person-Lab-26.7.21-r1-mac-arm64.zip.blockmap',
        'latest-mac.yml',
        'latest-arm64-mac.yml',
        'opl-app-component-manifest.json',
        'opl-install.sh',
        'opl-release-attestation.json',
      ],
      self_hosted_ancestor_count: 0,
      vm_ancestor_count: 0,
      tart_ancestor_count: 0,
    });
    assert.equal(receipt.homebrew, null);
    assert.equal('updater_predecessor_policy' in receipt, false);
    assert.equal('updater_receipts' in receipt, false);
    assert.equal('optional_certification' in receipt, false);
    assert.match(receipt.input_digest, /^sha256:[0-9a-f]{64}$/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Latest admission rejects a hosted Standard set without the frozen universal installer', () => {
  const fixture = createFixture();
  try {
    configureCandidate(
      fixture.root,
      fixture.input,
      'stable',
      '26.7.21-r1',
      '26.7.2101',
      false,
    );
    assert.throws(
      () => validateStandardLatestAdmission(fixture.input),
      /exact GitHub-hosted Standard asset set/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Latest admission rejects a self-consistent primary artifact not bound to the staged DMG', () => {
  const fixture = createFixture();
  try {
    const manifest = JSON.parse(fs.readFileSync(fixture.input.componentManifestPath, 'utf8'));
    manifest.primary_artifact.digest = `sha256:${'f'.repeat(64)}`;
    const core = Object.fromEntries(
      Object.entries(manifest).filter(([key]) => key !== 'component_manifest_digest'),
    );
    manifest.component_manifest_digest =
      `sha256:${crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex')}`;
    fs.writeFileSync(fixture.input.componentManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const staged = JSON.parse(fs.readFileSync(fixture.input.standardAssetsPath, 'utf8'));
    const stagedManifest = staged.assets.find(
      (asset: Record<string, unknown>) => asset.name === 'opl-app-component-manifest.json',
    );
    stagedManifest.sha256 = sha256(fixture.input.componentManifestPath);
    stagedManifest.size_bytes = fs.statSync(fixture.input.componentManifestPath).size;
    fs.writeFileSync(fixture.input.standardAssetsPath, `${JSON.stringify(staged, null, 2)}\n`);

    assert.throws(
      () => validateStandardLatestAdmission(fixture.input),
      /primary artifact digest does not match/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Latest admission accepts a qualified Preview tag as the Stable compare-and-swap predecessor', () => {
  const fixture = createFixture();
  try {
    fixture.input.expectedCurrentLatestTag = 'v26.7.20-preview.r1';
    const receipt = validateStandardLatestAdmission(fixture.input);
    assert.equal(receipt.latest_compare_and_swap.expected_current.tag, 'v26.7.20-preview.r1');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

for (const preview of [
  { channel: 'preview' as const, version: '26.7.21-preview.r1', updater: '26.7.2101' },
  { channel: 'nightly' as const, version: '26.7.21-nightly.r1', updater: '26.7.2191-nightly.1' },
]) {
  test(`explicit single-use authority may move Latest to ${preview.channel} without changing quality`, () => {
    const fixture = createFixture();
    try {
      fixture.input.homebrewPublicationPath = undefined;
      fixture.input.homebrewReadbackPath = undefined;
      configureCandidate(fixture.root, fixture.input, preview.channel, preview.version, preview.updater);
      const receipt = validateStandardLatestAdmission(fixture.input);
      assert.equal(receipt.publication_channel, preview.channel);
      assert.equal(receipt.classification.quality_status, 'preview');
      assert.equal(receipt.classification.quality_unchanged, true);
      assert.equal(receipt.pointer_authority.mode, 'protected_single_use_exact_version');
      assert.equal(receipt.homebrew, null);
      assert.equal(receipt.latest_compare_and_swap.candidate.tag, `v${preview.version}`);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
}

test('Preview Latest admission fails closed without exact single-use authority', () => {
  const fixture = createFixture();
  try {
    fixture.input.homebrewPublicationPath = undefined;
    fixture.input.homebrewReadbackPath = undefined;
    configureCandidate(fixture.root, fixture.input, 'preview', '26.7.21-preview.r1', '26.7.2101');
    fixture.input.latestOverrideAuthorityPath = undefined;
    assert.throws(
      () => validateStandardLatestAdmission(fixture.input),
      /requires protected single-use user authority/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Latest admission input digest binds the exact current Latest tag', () => {
  const fixture = createFixture();
  try {
    const first = validateStandardLatestAdmission(fixture.input);
    fixture.input.expectedCurrentLatestTag = 'v26.7.21';
    const second = validateStandardLatestAdmission(fixture.input);
    assert.notEqual(first.input_digest, second.input_digest);
    assert.equal(second.latest_compare_and_swap.expected_current.tag, 'v26.7.21');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Latest admission accepts the candidate as current for observational idempotent completion', () => {
  const fixture = createFixture();
  try {
    fixture.input.expectedCurrentLatestTag = 'v26.7.21-r1';
    const receipt = validateStandardLatestAdmission(fixture.input);
    assert.deepEqual(receipt.latest_compare_and_swap, {
      expected_current: { tag: 'v26.7.21-r1' },
      candidate: { tag: 'v26.7.21-r1' },
    });
    assert.doesNotThrow(() => assertStandardLatestAdmissionReceipt(receipt, stableAuthority({
      ...receipt,
      __standardAssetsPath: fixture.input.standardAssetsPath,
    })));
    assert.match(receipt.input_digest, /^sha256:[0-9a-f]{64}$/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Latest admission rejects legacy Homebrew evidence because the Cask runs as a follower', () => {
  const fixture = createFixture();
  try {
    fixture.input.homebrewPublicationPath = path.join(fixture.root, 'legacy-homebrew-publication.json');
    assert.throws(
      () => validateStandardLatestAdmission(fixture.input),
      /Homebrew runs as a non-blocking follower/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Latest admission rejects optional-certification evidence', () => {
  const fixture = createFixture();
  try {
    const receipt = validateStandardLatestAdmission(fixture.input);
    receipt.optional_certification = { status: 'passed' };
    assert.throws(
      () => assertStandardLatestAdmissionReceipt(receipt, stableAuthority({
        ...receipt,
        __standardAssetsPath: fixture.input.standardAssetsPath,
      })),
      /must not consume optional_certification/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
