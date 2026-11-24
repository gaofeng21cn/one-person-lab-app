#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import {
  remoteDigest,
  type AssetIdentity,
  type JsonRecord,
  type PreviewRelease,
  type PreviewRemote,
  type ValidatedCleanupHandoff,
  type ValidatedPublishHandoff,
} from './manual-full-preview-release/contract.ts';
import {
  copyValidatedHandoff,
  resolveIngressDirectory,
  validateHandoffDirectory,
} from './manual-full-preview-release/handoff.ts';
import {
  GhPreviewRemote,
} from './manual-full-preview-release/github.ts';
import { verifyArtifactTransport } from './manual-full-preview-release/artifact-transport.ts';

export {
  MANUAL_FULL_PREVIEW_RELEASE_NOTES,
  derivePreviewTag,
  fileSha256,
} from './manual-full-preview-release/contract.ts';
export type {
  AssetIdentity,
  PreviewRelease,
  PreviewRemote,
  ValidatedCleanupHandoff,
  ValidatedHandoff,
  ValidatedPublishHandoff,
} from './manual-full-preview-release/contract.ts';
export {
  copyValidatedHandoff,
  resolveIngressDirectory,
  validateHandoffDirectory,
} from './manual-full-preview-release/handoff.ts';
export {
  GhPreviewRemote,
  releaseAssetUploadUrl,
} from './manual-full-preview-release/github.ts';
export { verifyArtifactTransport } from './manual-full-preview-release/artifact-transport.ts';

function assertReleaseIdentity(release: PreviewRelease, handoff: ValidatedPublishHandoff): void {
  if (
    release.tag_name !== handoff.previewTag
    || release.target_commitish !== handoff.sourceCommit
    || release.name !== handoff.releaseName
    || release.body !== handoff.releaseNotes
    || release.prerelease !== true
  ) {
    throw new Error(`Remote preview Release ${handoff.previewTag} identity conflicts with the immutable handoff.`);
  }
}

function assertPreviewTagState(
  release: PreviewRelease,
  handoff: ValidatedPublishHandoff,
  tagCommit: string | null,
): void {
  if (tagCommit !== null && tagCommit !== handoff.sourceCommit) {
    throw new Error(`Remote preview tag ${handoff.previewTag} points at a different source commit.`);
  }
  if (!release.draft && tagCommit !== handoff.sourceCommit) {
    throw new Error('Published preview tag readback does not match the source-lock App commit.');
  }
}

function assertRemoteAssets(release: PreviewRelease, expected: AssetIdentity[], exact: boolean): void {
  const remoteNames = release.assets.map(({ name }) => name);
  if (new Set(remoteNames).size !== remoteNames.length) throw new Error('Remote preview Release has duplicate asset names.');
  for (const asset of expected) {
    const remote = release.assets.find(({ name }) => name === asset.name);
    if (!remote) {
      if (exact) throw new Error(`Remote preview Release is missing ${asset.name}.`);
      continue;
    }
    if (remote.size !== asset.size_bytes || remoteDigest(remote.digest) !== asset.sha256) {
      throw new Error(`Remote preview asset ${asset.name} has a conflicting size or digest.`);
    }
  }
  if (exact) {
    const expectedNames = expected.map(({ name }) => name).sort();
    if (JSON.stringify([...remoteNames].sort()) !== JSON.stringify(expectedNames)) {
      throw new Error('Remote preview Release contains unexpected assets.');
    }
  }
}

function inspectUpToThree<T>(
  inspect: () => T,
  matches: (value: T) => boolean,
): { matched: true; value: T } | { matched: false } {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const value = inspect();
      if (matches(value)) return { matched: true, value };
    } catch {
      // A mutation with an unknown result permits only bounded read-only inspection.
    }
  }
  return { matched: false };
}

function mutateOnceThenRead<T>(input: {
  label: string;
  mutate: () => void;
  inspect: () => T;
  matches: (value: T) => boolean;
}): T {
  try {
    input.mutate();
  } catch (error) {
    const reconciled = inspectUpToThree(input.inspect, input.matches);
    if (reconciled.matched) return reconciled.value;
    throw new Error(
      `${input.label} outcome is unknown after three read-only inspections; mutation was not retried.`,
      { cause: error },
    );
  }
  const observed = inspectUpToThree(input.inspect, input.matches);
  if (!observed.matched) throw new Error(`${input.label} did not reach its exact postcondition.`);
  return observed.value;
}

export function publishPreview(handoff: ValidatedPublishHandoff, remote: PreviewRemote): JsonRecord {
  const latestBefore = remote.inspectLatestTag();
  if (latestBefore === handoff.previewTag) throw new Error('Preview tag cannot be GitHub Latest.');
  const existingTag = remote.inspectTag(handoff.previewTag);
  if (existingTag && existingTag !== handoff.sourceCommit) {
    throw new Error(`Remote preview tag ${handoff.previewTag} points at a different source commit.`);
  }
  let release = remote.inspectRelease(handoff.previewTag);
  if (!release) {
    release = mutateOnceThenRead({
      label: `Create preview Release ${handoff.previewTag}`,
      mutate: () => remote.createDraft({
        tag: handoff.previewTag,
        targetCommitish: handoff.sourceCommit,
        name: handoff.releaseName,
        body: handoff.releaseNotes,
      }),
      inspect: () => remote.inspectRelease(handoff.previewTag),
      matches: (value) => value !== null,
    }) as PreviewRelease;
  }
  assertReleaseIdentity(release, handoff);
  assertPreviewTagState(release, handoff, remote.inspectTag(handoff.previewTag));
  assertRemoteAssets(release, handoff.assets, false);

  for (const asset of handoff.assets) {
    const observed = release.assets.find(({ name }) => name === asset.name);
    if (observed) continue;
    release = mutateOnceThenRead({
      label: `Upload preview asset ${asset.name}`,
      mutate: () => remote.uploadAsset(release!.id, path.join(handoff.root, asset.name), asset.name),
      inspect: () => remote.inspectRelease(handoff.previewTag),
      matches: (value) => {
        if (!value) return false;
        const candidate = value.assets.find(({ name }) => name === asset.name);
        return Boolean(
          candidate
          && candidate.size === asset.size_bytes
          && remoteDigest(candidate.digest) === asset.sha256,
        );
      },
    }) as PreviewRelease;
    assertReleaseIdentity(release, handoff);
    assertPreviewTagState(release, handoff, remote.inspectTag(handoff.previewTag));
    assertRemoteAssets(release, handoff.assets, false);
  }

  assertRemoteAssets(release, handoff.assets, true);
  if (release.draft) {
    release = mutateOnceThenRead({
      label: `Publish preview Release ${handoff.previewTag}`,
      mutate: () => remote.publishRelease(release!.id, handoff.releaseName, handoff.releaseNotes),
      inspect: () => remote.inspectRelease(handoff.previewTag),
      matches: (value) => Boolean(value && value.draft === false && value.prerelease === true),
    }) as PreviewRelease;
  }
  assertReleaseIdentity(release, handoff);
  if (release.draft) throw new Error('Preview Release remained a draft.');
  assertPreviewTagState(release, handoff, remote.inspectTag(handoff.previewTag));
  assertRemoteAssets(release, handoff.assets, true);
  const latestAfter = remote.inspectLatestTag();
  if (latestAfter !== latestBefore || latestAfter === handoff.previewTag) {
    throw new Error('Preview publication changed GitHub Latest.');
  }
  return {
    schema: 'opl_manual_full_preview_publication_receipt.v1',
    status: 'published_readback_verified',
    operation: 'publish',
    preview_tag: handoff.previewTag,
    release_id: release.id,
    prerelease: true,
    latest_before: latestBefore,
    latest_after: latestAfter,
    source_commit: handoff.sourceCommit,
    source_lock_sha256: handoff.sourceLockSha256,
    manifest_sha256: handoff.manifestSha256,
    assets: handoff.assets,
    stable_or_updater_mutation_performed: false,
  };
}

function assertStableRemoteReadback(handoff: ValidatedCleanupHandoff, remote: PreviewRemote): PreviewRelease {
  const stable = remote.inspectRelease(handoff.stableTag);
  if (!stable || stable.draft || stable.prerelease || stable.tag_name !== handoff.stableTag) {
    throw new Error(`Stable Release ${handoff.stableTag} is not a published non-prerelease Release.`);
  }
  const latest = remote.inspectLatestTag();
  if (latest !== handoff.stableTag) throw new Error(`Stable Release ${handoff.stableTag} is not GitHub Latest.`);
  assertRemoteAssets(stable, handoff.stableAssets, false);
  return stable;
}

export function cleanupPreview(handoff: ValidatedCleanupHandoff, remote: PreviewRemote): JsonRecord {
  const stableBefore = assertStableRemoteReadback(handoff, remote);
  let preview = remote.inspectRelease(handoff.previewTag);
  if (preview) {
    if (preview.draft || !preview.prerelease) throw new Error('Cleanup target is not the published preview prerelease.');
    mutateOnceThenRead({
      label: `Delete preview Release ${handoff.previewTag}`,
      mutate: () => remote.deleteRelease(preview!.id),
      inspect: () => remote.inspectRelease(handoff.previewTag),
      matches: (value) => value === null,
    });
  }
  if (remote.inspectRelease(handoff.previewTag) !== null) throw new Error('Preview Release absence readback failed.');

  const previewTagCommit = remote.inspectTag(handoff.previewTag);
  if (previewTagCommit) {
    mutateOnceThenRead({
      label: `Delete preview tag ${handoff.previewTag}`,
      mutate: () => remote.deleteTag(handoff.previewTag),
      inspect: () => remote.inspectTag(handoff.previewTag),
      matches: (value) => value === null,
    });
  }
  if (remote.inspectTag(handoff.previewTag) !== null) throw new Error('Preview tag absence readback failed.');
  if (remote.inspectRelease(handoff.previewTag) !== null) throw new Error('Preview Release second absence readback failed.');
  const stableAfter = assertStableRemoteReadback(handoff, remote);
  if (stableAfter.id !== stableBefore.id) throw new Error('Stable Release changed during preview cleanup.');
  return {
    schema: 'opl_manual_full_preview_cleanup_receipt.v1',
    status: 'cleanup_readback_verified',
    operation: 'cleanup',
    preview_tag: handoff.previewTag,
    preview_release_absent: true,
    preview_tag_absent: true,
    stable_tag: handoff.stableTag,
    stable_release_id: stableAfter.id,
    stable_latest_readback_verified: true,
    source_lock_sha256: handoff.sourceLockSha256,
    manifest_sha256: handoff.manifestSha256,
    stable_or_updater_mutation_performed: false,
  };
}

function writeSummary(summaryPath: string | undefined, payload: unknown): void {
  if (summaryPath) {
    fs.mkdirSync(path.dirname(path.resolve(summaryPath)), { recursive: true });
    fs.writeFileSync(path.resolve(summaryPath), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(payload, null, 2));
}

function parseCli(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: true,
    options: {
      operation: { type: 'string' },
      'ingress-root': { type: 'string' },
      nonce: { type: 'string' },
      'manifest-sha256': { type: 'string' },
      'output-dir': { type: 'string' },
      'payload-dir': { type: 'string' },
      repo: { type: 'string' },
      'run-id': { type: 'string' },
      'artifact-id': { type: 'string' },
      'artifact-name': { type: 'string' },
      'artifact-digest': { type: 'string' },
      summary: { type: 'string' },
    },
  });
  const command = positionals[0] ?? '';
  const operation = values.operation;
  if (operation !== 'publish' && operation !== 'cleanup') throw new Error('--operation must be publish or cleanup.');
  return { command, operation, values };
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function cliMain(argv: string[]): void {
  const { command, operation, values } = parseCli(argv);
  if (command === 'ingest') {
    const ingressRoot = required(values['ingress-root'], '--ingress-root');
    const nonce = required(values.nonce, '--nonce');
    const expectedManifestSha256 = required(values['manifest-sha256'], '--manifest-sha256');
    const outputDir = required(values['output-dir'], '--output-dir');
    const source = validateHandoffDirectory(
      resolveIngressDirectory(ingressRoot, nonce),
      operation,
      expectedManifestSha256,
    );
    const copied = copyValidatedHandoff(source, outputDir);
    writeSummary(values.summary, {
      schema: 'opl_manual_full_preview_ingress_receipt.v1',
      status: 'validated_and_materialized',
      operation,
      preview_tag: copied.previewTag,
      display_version: copied.version,
      source_lock_sha256: copied.sourceLockSha256,
      manifest_sha256: copied.manifestSha256,
      file_count: fs.readdirSync(outputDir).length,
      output_dir: path.resolve(outputDir),
    });
    return;
  }
  if (command === 'verify-artifact') {
    const receipt = verifyArtifactTransport({
      operation,
      repo: required(values.repo, '--repo'),
      artifactId: required(values['artifact-id'], '--artifact-id'),
      artifactName: required(values['artifact-name'], '--artifact-name'),
      artifactDigest: required(values['artifact-digest'], '--artifact-digest'),
      runId: required(values['run-id'], '--run-id'),
    });
    writeSummary(values.summary, receipt);
    return;
  }
  if (command === 'mutate') {
    const payloadDir = required(values['payload-dir'], '--payload-dir');
    const expectedManifestSha256 = required(values['manifest-sha256'], '--manifest-sha256');
    const repo = required(values.repo, '--repo');
    const handoff = validateHandoffDirectory(payloadDir, operation, expectedManifestSha256);
    const remote = new GhPreviewRemote(repo);
    const receipt = handoff.operation === 'publish'
      ? publishPreview(handoff, remote)
      : cleanupPreview(handoff, remote);
    writeSummary(values.summary, receipt);
    return;
  }
  throw new Error('Command must be ingest, verify-artifact, or mutate.');
}

export function isManualFullPreviewReleaseMain(
  moduleUrl = import.meta.url,
  executablePath = process.argv[1],
): boolean {
  return Boolean(executablePath) && pathToFileURL(path.resolve(executablePath)).href === moduleUrl;
}

if (isManualFullPreviewReleaseMain()) {
  try {
    cliMain(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
