import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

import {
  cleanupPreview,
  derivePreviewTag,
  fileSha256,
  GhPreviewRemote,
  MANUAL_FULL_PREVIEW_RELEASE_NOTES,
  publishPreview,
  releaseAssetUploadUrl,
  resolveIngressDirectory,
  type AssetIdentity,
  type PreviewRelease,
  type PreviewRemote,
  validateHandoffDirectory,
  verifyArtifactTransport,
} from '../../scripts/manual-full-preview-release.ts';
import {
  validateManualFullPreviewControlPlane,
  validateWorkflowDispatchWriteAuthority,
} from '../../scripts/validate-release-boundary/text-check-runner.ts';

const appSha = 'a'.repeat(40);

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function identity(root: string, name: string): AssetIdentity {
  const filePath = path.join(root, name);
  return {
    name,
    size_bytes: fs.statSync(filePath).size,
    sha256: fileSha256(filePath),
  };
}

function tempRoot(t: test.TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-manual-preview-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function createPublishHandoff(t: test.TestContext, version = '26.7.22') {
  const root = tempRoot(t);
  const dmgName = `One-Person-Lab-Full-${version}-mac-arm64.dmg`;
  fs.writeFileSync(path.join(root, dmgName), 'exact manual full dmg bytes\n');
  writeJson(path.join(root, 'full-package-manifest.json'), { version, payload: 'fixture' });
  const dmg = identity(root, dmgName);
  writeJson(path.join(root, 'opl-release-manifest.json'), {
    schema: 'opl_public_release_manifest.v1',
    package_kind: 'opl_full_first_install_macos_arm64',
    version,
    primary_install_asset: dmgName,
    assets: [{ name: dmgName, role: 'full_first_install_carrier', size_bytes: dmg.size_bytes, sha256: dmg.sha256 }],
    manifest: { version },
  });
  writeJson(path.join(root, 'manual-latest-source-lock.json'), {
    schema: 'opl_manual_latest_build_source_lock.v1',
    display_version: version,
    updater_version: '26.7.2200',
    repositories: {
      app: { id: 'app', root: '/source/app', head: appSha, branch: 'main', local_main: appSha, origin_main: appSha },
    },
  });
  const sourceLock = identity(root, 'manual-latest-source-lock.json');
  const fullManifest = identity(root, 'full-package-manifest.json');
  const releaseManifest = identity(root, 'opl-release-manifest.json');
  writeJson(path.join(root, 'manual-latest-build-receipt.json'), {
    schema: 'opl_manual_latest_build_receipt.v1',
    status: 'completed',
    mode: 'full-dmg',
    display_version: version,
    updater_version: '26.7.2200',
    source_lock: '/output/manual-latest-source-lock.json',
    source_lock_sha256: sourceLock.sha256,
    output: {
      dmg: `/output/${dmgName}`,
      dmg_sha256: dmg.sha256,
      dmg_size_bytes: dmg.size_bytes,
      full_package_manifest: '/output/full-package-manifest.json',
      full_package_manifest_sha256: fullManifest.sha256,
      release_manifest: '/output/opl-release-manifest.json',
      release_manifest_sha256: releaseManifest.sha256,
    },
    installation: null,
  });
  writeJson(path.join(root, 'manual-full-host-qa-receipt.json'), {
    schema: 'opl_manual_full_host_qa_receipt.v1',
    status: 'passed',
    qualification: 'minimum_host_qa',
    display_version: version,
    source_lock_sha256: sourceLock.sha256,
    dmg,
  });
  const buildReceipt = identity(root, 'manual-latest-build-receipt.json');
  const hostQa = identity(root, 'manual-full-host-qa-receipt.json');
  writeJson(path.join(root, 'manual-full-m1-delivery-receipt.json'), {
    schema: 'opl_manual_full_m1_delivery_receipt.v1',
    status: 'MANUAL_USABLE_DELIVERED',
    display_version: version,
    source_lock_sha256: sourceLock.sha256,
    dmg,
    build_receipt_sha256: buildReceipt.sha256,
    host_qa_receipt_sha256: hostQa.sha256,
    full_package_manifest_sha256: fullManifest.sha256,
    release_manifest_sha256: releaseManifest.sha256,
  });
  const payloadNames = [
    dmgName,
    'full-package-manifest.json',
    'manual-full-host-qa-receipt.json',
    'manual-full-m1-delivery-receipt.json',
    'manual-latest-build-receipt.json',
    'manual-latest-source-lock.json',
    'opl-release-manifest.json',
  ].sort();
  const previewTag = derivePreviewTag(version, sourceLock.sha256);
  writeJson(path.join(root, 'manual-full-preview-manifest.json'), {
    schema: 'opl_manual_full_preview_manifest.v1',
    operation: 'publish',
    display_version: version,
    source_lock_sha256: sourceLock.sha256,
    preview_tag: previewTag,
    notes: MANUAL_FULL_PREVIEW_RELEASE_NOTES,
    assets: payloadNames.map((name) => identity(root, name)),
  });
  return {
    root,
    version,
    dmg,
    releaseManifest,
    sourceLockSha256: sourceLock.sha256,
    previewTag,
    manifestSha256: fileSha256(path.join(root, 'manual-full-preview-manifest.json')),
  };
}

function createCleanupHandoff(
  t: test.TestContext,
  publish: ReturnType<typeof createPublishHandoff>,
  stableTag = `v${publish.version}`,
) {
  const root = tempRoot(t);
  const stableAssets = [
    publish.dmg,
    { name: `One-Person-Lab-${publish.version}-mac-arm64.dmg`, size_bytes: 21, sha256: '1'.repeat(64) },
    { name: `One-Person-Lab-${publish.version}-mac-arm64.zip`, size_bytes: 22, sha256: '2'.repeat(64) },
    { name: `One-Person-Lab-${publish.version}-mac-arm64.zip.blockmap`, size_bytes: 23, sha256: '3'.repeat(64) },
    { name: 'latest-arm64-mac.yml', size_bytes: 27, sha256: 'b'.repeat(64) },
    { name: 'opl-app-component-manifest.json', size_bytes: 24, sha256: '4'.repeat(64) },
    { name: 'opl-install.sh', size_bytes: 28, sha256: '7'.repeat(64) },
    publish.releaseManifest,
    { name: 'standard-gatekeeper-launch-policy.json', size_bytes: 25, sha256: '5'.repeat(64) },
    { name: 'standard-apple-notarization-receipt.json', size_bytes: 26, sha256: '6'.repeat(64) },
  ].sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  const bundleDigest = `sha256:${'d'.repeat(64)}`;
  writeJson(path.join(root, 'manual-full-m2-qualification-receipt.json'), {
    schema: 'opl_manual_full_m2_qualification_receipt.v1',
    status: 'standard_qualified',
    display_version: publish.version,
    preview_tag: publish.previewTag,
    source_lock_sha256: publish.sourceLockSha256,
    bundle_digest: bundleDigest,
    dmg: publish.dmg,
    release_manifest: publish.releaseManifest,
    clean_vm: { status: 'passed', full_qualification: 'passed' },
    cleanup: { status: 'complete' },
  });
  writeJson(path.join(root, 'stable-append-full-readback-receipt.json'), {
    schema: 'opl_manual_preview_stable_append_full_readback.v1',
    status: 'verified',
    display_version: publish.version,
    preview_tag: publish.previewTag,
    stable_tag: stableTag,
    source_lock_sha256: publish.sourceLockSha256,
    bundle_digest: bundleDigest,
    standard: { status: 'published_latest_readback_verified' },
    append_full: { status: 'published_readback_verified' },
    updater_metadata: { status: 'verified' },
    assets: stableAssets,
  });
  const evidence = [
    identity(root, 'manual-full-m2-qualification-receipt.json'),
    identity(root, 'stable-append-full-readback-receipt.json'),
  ].sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  writeJson(path.join(root, 'manual-full-preview-manifest.json'), {
    schema: 'opl_manual_full_preview_manifest.v1',
    operation: 'cleanup',
    display_version: publish.version,
    source_lock_sha256: publish.sourceLockSha256,
    preview_tag: publish.previewTag,
    stable_tag: stableTag,
    stable_assets: stableAssets,
    evidence,
  });
  return {
    root,
    stableTag,
    stableAssets,
    manifestSha256: fileSha256(path.join(root, 'manual-full-preview-manifest.json')),
  };
}

class FakeRemote implements PreviewRemote {
  releases = new Map<string, PreviewRelease>();
  tags = new Map<string, string>();
  latestTag: string | null = 'v26.7.20';
  calls: string[] = [];
  unknownAfter = new Set<string>();
  unknownBefore = new Set<string>();
  tagAtAssetUpload: Array<string | null> = [];
  inspectCount = 0;
  nextReleaseId = 100;
  nextAssetId = 1000;

  inspectRelease(tag: string): PreviewRelease | null {
    this.inspectCount += 1;
    return this.releases.get(tag) ?? null;
  }

  inspectTag(tag: string): string | null {
    return this.tags.get(tag) ?? null;
  }

  inspectLatestTag(): string | null {
    return this.latestTag;
  }

  private before(label: string): void {
    this.calls.push(label);
    if (this.unknownBefore.has(label)) throw new Error(`${label} transport unknown before acceptance`);
  }

  private after(label: string): void {
    if (this.unknownAfter.has(label)) throw new Error(`${label} transport unknown after acceptance`);
  }

  createDraft(input: { tag: string; targetCommitish: string; name: string; body: string }): void {
    const label = 'create';
    this.before(label);
    this.releases.set(input.tag, {
      id: this.nextReleaseId++,
      tag_name: input.tag,
      target_commitish: input.targetCommitish,
      name: input.name,
      body: input.body,
      draft: true,
      prerelease: true,
      assets: [],
    });
    this.after(label);
  }

  uploadAsset(releaseId: number, filePath: string, name: string): void {
    const label = `upload:${name}`;
    this.before(label);
    const release = [...this.releases.values()].find(({ id }) => id === releaseId);
    assert.ok(release);
    this.tagAtAssetUpload.push(this.tags.get(release.tag_name) ?? null);
    release.assets.push({
      id: this.nextAssetId++,
      name,
      size: fs.statSync(filePath).size,
      digest: `sha256:${fileSha256(filePath)}`,
    });
    this.after(label);
  }

  publishRelease(releaseId: number, name: string, body: string): void {
    const label = 'publish';
    this.before(label);
    const release = [...this.releases.values()].find(({ id }) => id === releaseId);
    assert.ok(release);
    release.name = name;
    release.body = body;
    release.draft = false;
    release.prerelease = true;
    assert.ok(release.target_commitish);
    this.tags.set(release.tag_name, release.target_commitish);
    this.after(label);
  }

  deleteRelease(releaseId: number): void {
    const label = 'delete-release';
    this.before(label);
    const entry = [...this.releases.entries()].find(([, release]) => release.id === releaseId);
    if (entry) this.releases.delete(entry[0]);
    this.after(label);
  }

  deleteTag(tag: string): void {
    const label = 'delete-tag';
    this.before(label);
    this.tags.delete(tag);
    this.after(label);
  }
}

function publishedPreview(remote: FakeRemote, publish: ReturnType<typeof createPublishHandoff>): void {
  const handoff = validateHandoffDirectory(publish.root, 'publish', publish.manifestSha256);
  assert.equal(handoff.operation, 'publish');
  publishPreview(handoff, remote);
}

test('preview tag is deterministic and cannot enter the Stable v-tag namespace', () => {
  const tag = derivePreviewTag('26.7.22', '1'.repeat(64));
  assert.equal(tag, 'manual-full-preview-26.7.22-m1-111111111111');
  assert.ok(!tag.startsWith('v'));
});

test('release asset upload is fixed to uploads.github.com with an encoded plain name', () => {
  assert.equal(
    releaseAssetUploadUrl('gaofeng21cn/one-person-lab-app', 42, 'One Person Lab.dmg'),
    'https://uploads.github.com/repos/gaofeng21cn/one-person-lab-app/releases/42/assets?name=One%20Person%20Lab.dmg',
  );
  assert.throws(
    () => releaseAssetUploadUrl('gaofeng21cn/one-person-lab-app', 42, '../Stable.dmg'),
    /asset name is invalid/,
  );
});

test('artifact transport binds the raw action digest to the API digest, operation, and run', () => {
  const digest = '6'.repeat(64);
  const expiresAt = '2026-07-30T00:00:00Z';
  const inspect = () => ({
    id: 123,
    name: 'opl-manual-full-preview-publish-456',
    digest: `sha256:${digest}`,
    expired: false,
    expires_at: expiresAt,
    workflow_run: { id: 456 },
  });
  const receipt = verifyArtifactTransport({
    operation: 'publish',
    repo: 'gaofeng21cn/one-person-lab-app',
    artifactId: '123',
    artifactName: 'opl-manual-full-preview-publish-456',
    artifactDigest: digest,
    runId: '456',
    now: new Date('2026-07-23T00:00:00Z'),
  }, inspect);
  assert.equal(receipt.artifact_digest, `sha256:${digest}`);
  assert.throws(() => verifyArtifactTransport({
    operation: 'cleanup',
    repo: 'gaofeng21cn/one-person-lab-app',
    artifactId: '123',
    artifactName: 'opl-manual-full-preview-publish-456',
    artifactDigest: digest,
    runId: '456',
    now: new Date('2026-07-23T00:00:00Z'),
  }, inspect), /not run-scoped/);
  assert.throws(() => verifyArtifactTransport({
    operation: 'publish',
    repo: 'gaofeng21cn/one-person-lab-app',
    artifactId: '123',
    artifactName: 'opl-manual-full-preview-publish-456',
    artifactDigest: `sha256:${digest}`,
    runId: '456',
    now: new Date('2026-07-23T00:00:00Z'),
  }, inspect), /action output digest/);
});

test('publish handoff validates exact M1 bytes and rejects extra files', (t) => {
  const fixture = createPublishHandoff(t);
  const handoff = validateHandoffDirectory(fixture.root, 'publish', fixture.manifestSha256);
  assert.equal(handoff.operation, 'publish');
  assert.equal(handoff.previewTag, fixture.previewTag);
  assert.equal(handoff.assets.length, 8);
  fs.writeFileSync(path.join(fixture.root, 'unexpected.txt'), 'extra\n');
  assert.throws(
    () => validateHandoffDirectory(fixture.root, 'publish', fixture.manifestSha256),
    /files must be exactly/,
  );
});

test('fixed ingress rejects a nonce symlink that escapes the dedicated root', (t) => {
  const root = tempRoot(t);
  const outside = tempRoot(t);
  const nonce = '1'.repeat(32);
  fs.symlinkSync(outside, path.join(root, nonce));
  assert.throws(() => resolveIngressDirectory(root, nonce), /real directory/);
});

test('publish creates one prerelease, uploads exact assets, and preserves Latest', (t) => {
  const fixture = createPublishHandoff(t);
  const remote = new FakeRemote();
  const handoff = validateHandoffDirectory(fixture.root, 'publish', fixture.manifestSha256);
  assert.equal(handoff.operation, 'publish');
  const receipt = publishPreview(handoff, remote);
  assert.equal(receipt.status, 'published_readback_verified');
  assert.equal(remote.latestTag, 'v26.7.20');
  const release = remote.releases.get(fixture.previewTag);
  assert.ok(release);
  assert.equal(release.draft, false);
  assert.equal(release.prerelease, true);
  assert.equal(release.assets.length, 8);
  assert.deepEqual(remote.tagAtAssetUpload, Array(8).fill(null));
  assert.equal(remote.tags.get(fixture.previewTag), appSha);
  assert.deepEqual(remote.calls.filter((call) => call === 'create'), ['create']);
  assert.deepEqual(remote.calls.filter((call) => call === 'publish'), ['publish']);
});

test('publish resumes the unique exact draft while its Git tag is absent', (t) => {
  const fixture = createPublishHandoff(t);
  const remote = new FakeRemote();
  const handoff = validateHandoffDirectory(fixture.root, 'publish', fixture.manifestSha256);
  assert.equal(handoff.operation, 'publish');
  remote.releases.set(fixture.previewTag, {
    id: 358387778,
    tag_name: fixture.previewTag,
    target_commitish: appSha,
    name: handoff.releaseName,
    body: handoff.releaseNotes,
    draft: true,
    prerelease: true,
    published_at: null,
    assets: [],
  });
  const receipt = publishPreview(handoff, remote);
  assert.equal(receipt.release_id, 358387778);
  assert.equal(remote.calls.includes('create'), false);
  assert.deepEqual(remote.tagAtAssetUpload, Array(8).fill(null));
  assert.equal(remote.tags.get(fixture.previewTag), appSha);
});

test('draft lookup falls back to the authenticated paginated release list and requires uniqueness', () => {
  const tag = 'manual-full-preview-26.7.22-m1-111111111111';
  const draft = {
    id: 358387778,
    tag_name: tag,
    target_commitish: appSha,
    name: 'One Person Lab 26.7.22 Manual Full Preview',
    body: MANUAL_FULL_PREVIEW_RELEASE_NOTES,
    draft: true,
    prerelease: true,
    published_at: null,
    assets: [],
  };
  let pages: unknown = [[draft]];
  const calls: string[][] = [];
  const executeGh = (args: string[], allowFailure = false) => {
    calls.push(args);
    if (args[1] === `repos/gaofeng21cn/one-person-lab-app/releases/tags/${tag}`) {
      assert.equal(allowFailure, true);
      return { status: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)\n' };
    }
    assert.deepEqual(args, [
      'api',
      '--paginate',
      '--slurp',
      'repos/gaofeng21cn/one-person-lab-app/releases?per_page=100',
    ]);
    assert.equal(allowFailure, false);
    return { status: 0, stdout: JSON.stringify(pages), stderr: '' };
  };
  const remote = new GhPreviewRemote('gaofeng21cn/one-person-lab-app', executeGh);
  assert.deepEqual(remote.inspectRelease(tag), draft);
  assert.equal(calls.length, 2);

  pages = [[]];
  assert.equal(remote.inspectRelease(tag), null);

  pages = [[draft], [{ ...draft, id: 358387779 }]];
  assert.throws(() => remote.inspectRelease(tag), /multiple Releases/);
});

test('draft tag or target metadata conflicts fail before any publication mutation', (t) => {
  const fixture = createPublishHandoff(t);
  const handoff = validateHandoffDirectory(fixture.root, 'publish', fixture.manifestSha256);
  assert.equal(handoff.operation, 'publish');

  const wrongTarget = new FakeRemote();
  wrongTarget.releases.set(fixture.previewTag, {
    id: 358387778,
    tag_name: fixture.previewTag,
    target_commitish: 'b'.repeat(40),
    name: handoff.releaseName,
    body: handoff.releaseNotes,
    draft: true,
    prerelease: true,
    assets: [],
  });
  assert.throws(() => publishPreview(handoff, wrongTarget), /identity conflicts/);
  assert.deepEqual(wrongTarget.calls, []);

  const wrongTag = new FakeRemote();
  wrongTag.releases.set(fixture.previewTag, {
    id: 358387778,
    tag_name: fixture.previewTag,
    target_commitish: appSha,
    name: handoff.releaseName,
    body: handoff.releaseNotes,
    draft: true,
    prerelease: true,
    assets: [],
  });
  wrongTag.tags.set(fixture.previewTag, 'b'.repeat(40));
  assert.throws(() => publishPreview(handoff, wrongTag), /different source commit/);
  assert.deepEqual(wrongTag.calls, []);
});

test('published preview requires an exact source-lock Git tag readback', (t) => {
  const fixture = createPublishHandoff(t);
  const remote = new FakeRemote();
  const handoff = validateHandoffDirectory(fixture.root, 'publish', fixture.manifestSha256);
  assert.equal(handoff.operation, 'publish');
  remote.releases.set(fixture.previewTag, {
    id: 358387778,
    tag_name: fixture.previewTag,
    target_commitish: appSha,
    name: handoff.releaseName,
    body: handoff.releaseNotes,
    draft: false,
    prerelease: true,
    assets: handoff.assets.map((asset, index) => ({
      id: 4000 + index,
      name: asset.name,
      size: asset.size_bytes,
      digest: `sha256:${asset.sha256}`,
    })),
  });
  assert.throws(() => publishPreview(handoff, remote), /Published preview tag readback/);
  assert.deepEqual(remote.calls, []);
});

test('same-name same-digest publication is idempotent and conflicting bytes fail closed', (t) => {
  const fixture = createPublishHandoff(t);
  const remote = new FakeRemote();
  publishedPreview(remote, fixture);
  const callsAfterFirst = [...remote.calls];
  publishedPreview(remote, fixture);
  assert.deepEqual(remote.calls, callsAfterFirst);

  const release = remote.releases.get(fixture.previewTag)!;
  release.assets[0].digest = `sha256:${'f'.repeat(64)}`;
  const handoff = validateHandoffDirectory(fixture.root, 'publish', fixture.manifestSha256);
  assert.equal(handoff.operation, 'publish');
  assert.throws(() => publishPreview(handoff, remote), /conflicting size or digest/);
  assert.deepEqual(remote.calls, callsAfterFirst);
});

test('accepted unknown create is reconciled read-only without a second mutation', (t) => {
  const fixture = createPublishHandoff(t);
  const remote = new FakeRemote();
  remote.unknownAfter.add('create');
  publishedPreview(remote, fixture);
  assert.equal(remote.calls.filter((call) => call === 'create').length, 1);
  assert.equal(remote.releases.get(fixture.previewTag)?.draft, false);
});

test('unresolved unknown upload fails after bounded inspection without retry', (t) => {
  const fixture = createPublishHandoff(t);
  const remote = new FakeRemote();
  const firstAssetName = validateHandoffDirectory(fixture.root, 'publish', fixture.manifestSha256).assets[0].name;
  remote.unknownBefore.add(`upload:${firstAssetName}`);
  const handoff = validateHandoffDirectory(fixture.root, 'publish', fixture.manifestSha256);
  assert.equal(handoff.operation, 'publish');
  assert.throws(() => publishPreview(handoff, remote), /three read-only inspections/);
  assert.equal(remote.calls.filter((call) => call === `upload:${firstAssetName}`).length, 1);
});

test('cleanup requires M2 and Stable readback, then removes Release before tag and rechecks Stable', (t) => {
  const publish = createPublishHandoff(t);
  const cleanup = createCleanupHandoff(t, publish);
  const remote = new FakeRemote();
  publishedPreview(remote, publish);
  remote.releases.set(cleanup.stableTag, {
    id: 900,
    tag_name: cleanup.stableTag,
    name: `One Person Lab ${cleanup.stableTag}`,
    body: 'Stable',
    draft: false,
    prerelease: false,
    assets: cleanup.stableAssets.map((asset, index) => ({
      id: 2000 + index,
      name: asset.name,
      size: asset.size_bytes,
      digest: `sha256:${asset.sha256}`,
    })),
  });
  remote.latestTag = cleanup.stableTag;
  remote.calls = [];
  const handoff = validateHandoffDirectory(cleanup.root, 'cleanup', cleanup.manifestSha256);
  assert.equal(handoff.operation, 'cleanup');
  const receipt = cleanupPreview(handoff, remote);
  assert.equal(receipt.status, 'cleanup_readback_verified');
  assert.deepEqual(remote.calls, ['delete-release', 'delete-tag']);
  assert.equal(remote.releases.has(publish.previewTag), false);
  assert.equal(remote.tags.has(publish.previewTag), false);
  assert.equal(remote.releases.get(cleanup.stableTag)?.id, 900);
});

test('cleanup rejects a formal Stable readback that omits the universal installer', (t) => {
  const publish = createPublishHandoff(t);
  const cleanup = createCleanupHandoff(t, publish);
  const manifestPath = path.join(cleanup.root, 'manual-full-preview-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.stable_assets = manifest.stable_assets.filter(
    (asset: AssetIdentity) => asset.name !== 'opl-install.sh',
  );
  writeJson(manifestPath, manifest);
  assert.throws(
    () => validateHandoffDirectory(cleanup.root, 'cleanup', fileSha256(manifestPath)),
    /exact required formal Stable asset set/,
  );
});

test('cleanup fails before mutation when formal Stable is not Latest', (t) => {
  const publish = createPublishHandoff(t);
  const cleanup = createCleanupHandoff(t, publish);
  const remote = new FakeRemote();
  publishedPreview(remote, publish);
  remote.releases.set(cleanup.stableTag, {
    id: 900,
    tag_name: cleanup.stableTag,
    name: 'Stable',
    body: 'Stable',
    draft: false,
    prerelease: false,
    assets: cleanup.stableAssets.map((asset, index) => ({
      id: 3000 + index,
      name: asset.name,
      size: asset.size_bytes,
      digest: `sha256:${asset.sha256}`,
    })),
  });
  remote.latestTag = 'v26.7.20';
  remote.calls = [];
  const handoff = validateHandoffDirectory(cleanup.root, 'cleanup', cleanup.manifestSha256);
  assert.equal(handoff.operation, 'cleanup');
  assert.throws(() => cleanupPreview(handoff, remote), /is not GitHub Latest/);
  assert.deepEqual(remote.calls, []);
});

test('workflow and release contract expose only the protected preview exception', () => {
  const workflow = parseYaml(fs.readFileSync('.github/workflows/release-manual-full-preview.yml', 'utf8')) as any;
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.operation.options, ['publish', 'cleanup']);
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.deepEqual(workflow.jobs.ingress['runs-on'], ['self-hosted', 'macOS', 'ARM64', 'opl-gui-vm']);
  assert.equal(workflow.jobs.mutate.environment, 'release-stable');
  assert.deepEqual(workflow.jobs.mutate.permissions, { contents: 'write', actions: 'read' });
  assert.equal(workflow.concurrency.group, 'opl-release-bundle-global');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);

  const release = JSON.parse(fs.readFileSync('contracts/app-release-channel.json', 'utf8'));
  const freeze = release.release_bundle_control_plane.source_freeze_currentness_policy;
  assert.equal(freeze.freeze_admission.remote_and_current_authority_read_mode, 'single_cutoff_read');
  assert.equal(freeze.task_local_projection.canonical_live_catalog_equality_is_prebuild_precondition, false);
  assert.equal(freeze.task_local_projection.host_installed_or_effective_state_is_prebuild_precondition, false);
  assert.equal(freeze.post_freeze_validation.module_main_or_tag_advancement_triggers_rebuild, false);
  assert.equal(freeze.post_build_qualification.stable_latest_still_requires_applicable_qualification, false);
  assert.equal(freeze.post_build_qualification.failed_qualification_may_block_publication_or_latest, false);
  assert.deepEqual(freeze.cohort_invalidation_causes, [
    'frozen byte tree or digest mismatch',
    'artifact build or integrity failure',
    'explicit security revocation bound to the frozen ref or digest',
  ]);
  const preview = release.release_bundle_control_plane.publication.manual_full_preview;
  assert.equal(preview.workflow, '.github/workflows/release-manual-full-preview.yml');
  assert.deepEqual(preview.operations, ['publish', 'cleanup']);
  assert.equal(preview.publication.make_latest, false);
  assert.equal(preview.unknown_outcome.read_only_inspection_maximum, 3);
  assert.equal(preview.cleanup.same_bundle_digest_required, true);
  assert.equal(preview.cleanup.required_formal_stable_assets.length, 10);
  assert.equal(preview.cleanup.required_formal_stable_assets.includes('opl-install.sh'), true);
  assert.equal(preview.cleanup.release_and_tag_double_absence_readback_required, true);
  assert.equal(validateManualFullPreviewControlPlane(process.cwd()), 0);
  assert.equal(validateWorkflowDispatchWriteAuthority(process.cwd()), 0);
});
