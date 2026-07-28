import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  activatePublishedLatestPointer,
  inspectRelease,
  type GitHubAdapterRuntime,
} from '../../scripts/framework-release-adapter.ts';
import { validateLatestPointerOperation } from '../../scripts/validate-latest-pointer-operation.ts';
import { createLatestPointerOverrideAuthority } from '../../scripts/write-latest-pointer-override-authority.ts';
import { createAppComponentManifest } from '../../scripts/write-opl-app-component-manifest.ts';

const repository = 'gaofeng21cn/one-person-lab-app';
const appSha = 'a'.repeat(40);
const shellSha = 'b'.repeat(40);
const frameworkSha = 'c'.repeat(40);
const expectedCurrentLatestTag = 'v26.7.26';
const runId = '30123456789';
const startedAt = '2026-07-27T12:00:00.000Z';
const deadlineAt = '2026-07-27T12:30:00.000Z';

function sha256(bytes: Buffer | string): string {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function writeJson(root: string, name: string, value: unknown): string {
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function fixture(kind: 'stable' | 'dev' | 'nightly' = 'dev') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-latest-pointer-'));
  const version = kind === 'stable'
    ? '26.7.25'
    : kind === 'dev' ? '26.7.27-preview.r1' : '26.7.27-nightly.r1';
  const updaterVersion = kind === 'stable'
    ? '26.7.2500'
    : kind === 'dev' ? '26.7.2701' : '26.7.2791-nightly.1';
  const tag = `v${version}`;
  const assetNames = [
    'latest-arm64-mac.yml',
    `One-Person-Lab-${version}-mac-arm64.dmg`,
    `One-Person-Lab-${version}-mac-arm64.zip`,
    `One-Person-Lab-${version}-mac-arm64.zip.blockmap`,
    ...(kind !== 'nightly'
      ? ['standard-gatekeeper-launch-policy.json', 'standard-apple-notarization-receipt.json']
      : []),
  ];
  const manifest = createAppComponentManifest({
    version,
    updaterVersion,
    sourceCommit: appSha,
    shellCommit: shellSha,
    frameworkCommit: frameworkSha,
    tag,
    releaseUrl: `https://github.com/${repository}/releases/tag/${tag}`,
    repo: repository,
    assets: assetNames.map((name, index) => ({
      name,
      url: `https://github.com/${repository}/releases/download/${tag}/${name}`,
      digest: `sha256:${String(index + 1).repeat(64)}`,
      size: 100 + index,
    })),
  });
  const manifestPath = writeJson(root, 'opl-app-component-manifest.json', manifest);
  const rawRelease = {
    id: 456,
    name: `One Person Lab ${tag}`,
    body: kind === 'stable' ? 'Stable release.' : 'Preview release.',
    draft: false,
    prerelease: kind === 'nightly',
    target_commitish: appSha,
    tag_name: tag,
    assets: [
      ...manifest.artifacts.map((asset: any, index: number) => ({
        id: index + 1,
        name: asset.name,
        size: asset.size,
        digest: asset.digest,
      })),
      {
        id: 99,
        name: 'opl-app-component-manifest.json',
        size: fs.statSync(manifestPath).size,
        digest: sha256(fs.readFileSync(manifestPath)),
      },
    ],
  };
  const releaseInspection = {
    surface_kind: 'opl_app_github_release_inspection.v1',
    repository,
    tag,
    release: {
      exists: true,
      id: rawRelease.id,
      name: rawRelease.name,
      draft: rawRelease.draft,
      prerelease: rawRelease.prerelease,
      target_commitish: rawRelease.target_commitish,
      body_sha256: crypto.createHash('sha256').update(rawRelease.body).digest('hex'),
    },
    assets: rawRelease.assets.map((asset) => ({
      name: asset.name,
      size_bytes: asset.size,
      sha256: asset.digest,
    })),
  };
  const inspectionPath = writeJson(root, 'release-inspection.json', releaseInspection);
  const authority = createLatestPointerOverrideAuthority(manifest, expectedCurrentLatestTag);
  const authorityPath = writeJson(root, 'authority.json', authority);
  const input = {
    repository,
    componentManifestPath: manifestPath,
    releaseInspectionPath: inspectionPath,
    authorityPath,
    expectedCurrentLatestTag,
    runId,
    runAttempt: '1',
    operationStartedAt: startedAt,
    operationDeadlineAt: deadlineAt,
  };
  const receipt = validateLatestPointerOperation(input);
  const receiptPath = writeJson(root, 'admission.json', receipt);
  return {
    root,
    version,
    tag,
    manifest,
    manifestPath,
    rawRelease,
    inspectionPath,
    authorityPath,
    input,
    receipt,
    receiptPath,
  };
}

test('published Stable, Dev, and Nightly identities admit an exact quality-preserving Latest operation', () => {
  for (const kind of ['stable', 'dev', 'nightly'] as const) {
    const current = fixture(kind);
    try {
      assert.equal(current.receipt.status, 'passed');
      assert.equal(current.receipt.operation, 'move_latest_pointer');
      assert.equal(current.receipt.candidate.quality_status, kind === 'stable' ? 'stable' : 'preview');
      assert.equal(current.receipt.candidate.preview_kind, kind === 'stable' ? null : kind);
      assert.equal(current.receipt.candidate.quality_unchanged, true);
      assert.equal(
        current.receipt.candidate.qualification_disclosure.stable_qualified,
        kind === 'stable',
      );
      assert.equal(
        current.receipt.candidate.qualification_disclosure.non_stable_notice,
        kind !== 'stable',
      );
      assert.equal(current.receipt.pointer_authority.single_use, true);
      assert.equal(current.receipt.pointer_authority.persistent_override, false);
      assert.equal(
        current.receipt.latest_compare_and_swap.expected_current_tag,
        expectedCurrentLatestTag,
      );
      assert.equal(
        current.receipt.public_assets.filter(
          (asset: { name: string }) => asset.name === 'opl-app-component-manifest.json',
        ).length,
        1,
      );
      assert.equal(current.receipt.public_assets.length, kind === 'nightly' ? 5 : 7);
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  }
});

test('pointer admission rejects draft, asset drift, authority drift, and replay', () => {
  const current = fixture('nightly');
  try {
    const inspection = JSON.parse(fs.readFileSync(current.inspectionPath, 'utf8'));
    inspection.release.draft = true;
    writeJson(current.root, 'release-inspection.json', inspection);
    assert.throws(() => validateLatestPointerOperation(current.input), /draft state/);

    inspection.release.draft = false;
    inspection.assets[0].sha256 = `sha256:${'9'.repeat(64)}`;
    writeJson(current.root, 'release-inspection.json', inspection);
    assert.throws(() => validateLatestPointerOperation(current.input), /asset set/);

    writeJson(current.root, 'release-inspection.json', {
      ...inspection,
      assets: current.rawRelease.assets.map((asset) => ({
        name: asset.name,
        size_bytes: asset.size,
        sha256: asset.digest,
      })),
    });
    const authority = JSON.parse(fs.readFileSync(current.authorityPath, 'utf8'));
    authority.authorization.persistent_override = true;
    writeJson(current.root, 'authority.json', authority);
    assert.throws(() => validateLatestPointerOperation(current.input), /authority/);

    writeJson(
      current.root,
      'authority.json',
      createLatestPointerOverrideAuthority(current.manifest, expectedCurrentLatestTag),
    );
    assert.throws(
      () => validateLatestPointerOperation({ ...current.input, runAttempt: '2' }),
      /first-attempt/,
    );
  } finally {
    fs.rmSync(current.root, { recursive: true, force: true });
  }
});

test('pointer adapter performs one exact CAS and preserves Preview disclosure', () => {
  const current = fixture('nightly');
  let latestTag = expectedCurrentLatestTag;
  let patchCount = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => Date.parse('2026-07-27T12:05:00.000Z'),
    run: (_command, args) => {
      const route = args.at(-1);
      if (args[0] === 'api' && route === `repos/${repository}/releases/tags/${current.tag}`) {
        return { status: 0, stdout: JSON.stringify(current.rawRelease), stderr: '' };
      }
      if (args[0] === 'api' && route === `repos/${repository}/releases/latest`) {
        return { status: 0, stdout: JSON.stringify({ tag_name: latestTag }), stderr: '' };
      }
      if (args.includes('PATCH')) {
        patchCount += 1;
        latestTag = current.tag;
        return { status: 0, stdout: '{}', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: `unexpected gh args: ${args.join(' ')}` };
    },
  };
  try {
    const result = activatePublishedLatestPointer({
      repo: repository,
      tag: current.tag,
      'expected-current-latest-tag': expectedCurrentLatestTag,
      'component-manifest': current.manifestPath,
      'pointer-authority': current.authorityPath,
      'pointer-admission': current.receiptPath,
      'release-inspection': current.inspectionPath,
      operation: 'move_latest_pointer',
      'operation-id': runId,
      'attempt-id': `gha-${runId}-latest-pointer`,
      'run-attempt': '1',
      'operation-started-at': startedAt,
      'operation-deadline-at': deadlineAt,
    }, runtime);
    assert.equal(result.status, 'complete');
    assert.equal(result.quality_status, 'preview');
    assert.equal(result.preview_kind, 'nightly');
    assert.equal(result.quality_unchanged, true);
    assert.equal(result.persistent_override, false);
    assert.equal(result.stable_reclaim, 'next_qualified_stable');
    assert.equal(patchCount, 1);
  } finally {
    fs.rmSync(current.root, { recursive: true, force: true });
  }
});

test('pointer adapter may select an exact Stable without inventing Preview disclosure', () => {
  const current = fixture('stable');
  let latestTag = expectedCurrentLatestTag;
  let patchCount = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => Date.parse('2026-07-27T12:05:00.000Z'),
    run: (_command, args) => {
      const route = args.at(-1);
      if (args[0] === 'api' && route === `repos/${repository}/releases/tags/${current.tag}`) {
        return { status: 0, stdout: JSON.stringify(current.rawRelease), stderr: '' };
      }
      if (args[0] === 'api' && route === `repos/${repository}/releases/latest`) {
        return { status: 0, stdout: JSON.stringify({ tag_name: latestTag }), stderr: '' };
      }
      if (args.includes('PATCH')) {
        patchCount += 1;
        latestTag = current.tag;
        return { status: 0, stdout: '{}', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: `unexpected gh args: ${args.join(' ')}` };
    },
  };
  try {
    const result = activatePublishedLatestPointer({
      repo: repository,
      tag: current.tag,
      'expected-current-latest-tag': expectedCurrentLatestTag,
      'component-manifest': current.manifestPath,
      'pointer-authority': current.authorityPath,
      'pointer-admission': current.receiptPath,
      'release-inspection': current.inspectionPath,
      operation: 'move_latest_pointer',
      'operation-id': runId,
      'attempt-id': `gha-${runId}-latest-pointer`,
      'run-attempt': '1',
      'operation-started-at': startedAt,
      'operation-deadline-at': deadlineAt,
    }, runtime);
    assert.equal(result.status, 'complete');
    assert.equal(result.quality_status, 'stable');
    assert.equal(result.preview_kind, null);
    assert.equal(result.quality_unchanged, true);
    assert.equal(result.non_stable_notice, false);
    assert.deepEqual(result.skipped_gates, []);
    assert.equal(patchCount, 1);
  } finally {
    fs.rmSync(current.root, { recursive: true, force: true });
  }
});

test('pointer adapter rejects expected-current drift without PATCH', () => {
  const current = fixture('dev');
  let patchCount = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => Date.parse('2026-07-27T12:05:00.000Z'),
    run: (_command, args) => {
      const route = args.at(-1);
      if (args[0] === 'api' && route === `repos/${repository}/releases/tags/${current.tag}`) {
        return { status: 0, stdout: JSON.stringify(current.rawRelease), stderr: '' };
      }
      if (args[0] === 'api' && route === `repos/${repository}/releases/latest`) {
        return { status: 0, stdout: JSON.stringify({ tag_name: 'v26.7.27' }), stderr: '' };
      }
      if (args.includes('PATCH')) patchCount += 1;
      return { status: 1, stdout: '', stderr: 'unexpected mutation' };
    },
  };
  try {
    assert.throws(() => activatePublishedLatestPointer({
      repo: repository,
      tag: current.tag,
      'expected-current-latest-tag': expectedCurrentLatestTag,
      'component-manifest': current.manifestPath,
      'pointer-authority': current.authorityPath,
      'pointer-admission': current.receiptPath,
      'release-inspection': current.inspectionPath,
      operation: 'move_latest_pointer',
      'operation-id': runId,
      'attempt-id': `gha-${runId}-latest-pointer`,
      'run-attempt': '1',
      'operation-started-at': startedAt,
      'operation-deadline-at': deadlineAt,
    }, runtime), /Latest drifted/);
    assert.equal(patchCount, 0);
  } finally {
    fs.rmSync(current.root, { recursive: true, force: true });
  }
});
