#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

type ReleaseAsset = { id?: number; name: string; size: number; digest: string };
type ReleaseRecord = {
  id: number;
  tag_name: string;
  target_commitish: string;
  draft: boolean;
  prerelease: boolean;
  immutable: boolean;
  body: string;
  assets: ReleaseAsset[];
};

type ExpectedRepairAsset = Required<Pick<ReleaseAsset, 'id' | 'name' | 'size' | 'digest'>>;

export type DesktopPlatformId = 'linux-x64' | 'windows-x64';
type ManifestAsset = Pick<ReleaseAsset, 'name' | 'size' | 'digest'>;
type DesktopManifestIdentity = {
  release: { version: string; updater_version: string };
  source: { run_id: string; bundle_digest: string };
  cohort: { app_sha: string; shell_sha: string; framework_sha: string };
};
export type DesktopPlatformManifest = DesktopManifestIdentity & {
  schema: 'opl_app_desktop_platform_manifest.v1';
  platform: DesktopPlatformId;
  assets: ManifestAsset[];
};
export type DesktopReleaseSetManifest = DesktopManifestIdentity & {
  schema: 'opl_app_desktop_release_set_manifest.v1';
  platforms: DesktopPlatformId[];
  assets: ManifestAsset[];
};

const aggregateManifestName = 'opl-desktop-platforms-manifest.json';
const aggregateManifestStagePattern = /^opl-desktop-platforms-manifest\.([0-9a-f]{64})\.json$/;
const desktopPlatformOrder: DesktopPlatformId[] = ['linux-x64', 'windows-x64'];

const additiveRepairAssetNames = new Set(['opl-install.sh']);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message: string): never {
  throw new Error(message);
}

function runGh(args: string[], input?: string): string {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    input,
    timeout: 120_000,
    env: { ...process.env, GH_PROMPT_DISABLED: '1' },
  });
  if (result.error || result.status !== 0) {
    fail(`gh ${args.join(' ')} failed: ${(result.stderr || result.error?.message || '').trim()}`);
  }
  return result.stdout;
}

function readRelease(repository: string, releaseId: number): ReleaseRecord {
  const value = JSON.parse(runGh(['api', `repos/${repository}/releases/${releaseId}`])) as ReleaseRecord;
  if (!Number.isInteger(value.id) || !Array.isArray(value.assets)) fail('GitHub returned an invalid Release record.');
  return value;
}

function assertTagTarget(repository: string, tag: string, target: string) {
  const value = JSON.parse(runGh(['api', `repos/${repository}/git/ref/tags/${tag}`])) as {
    ref?: string;
    object?: { type?: string; sha?: string };
  };
  if (value.ref !== `refs/tags/${tag}` || value.object?.type !== 'commit' || value.object.sha !== target) {
    fail('Stable Release tag ref drifted during additive repair.');
  }
}

function digestFile(file: string): ReleaseAsset & { source_path: string } {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size <= 0) fail(`Desktop asset must be a nonempty regular file: ${file}`);
  return {
    name: path.basename(file),
    size: stat.size,
    digest: `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`,
    source_path: file,
  };
}

function digestBytes(value: string): ManifestAsset {
  return {
    name: aggregateManifestName,
    size: Buffer.byteLength(value),
    digest: `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`,
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be one object.`);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value.trim() || (pattern && !pattern.test(value))) {
    fail(`${label} is invalid.`);
  }
  return value;
}

function manifestAsset(value: unknown, label: string): ManifestAsset {
  const candidate = record(value, label);
  const name = requiredString(candidate.name, `${label}.name`, /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
  if (!Number.isSafeInteger(candidate.size) || Number(candidate.size) <= 0) fail(`${label}.size is invalid.`);
  const digest = requiredString(candidate.digest, `${label}.digest`, /^sha256:[0-9a-f]{64}$/);
  return { name, size: Number(candidate.size), digest };
}

function manifestIdentity(value: Record<string, unknown>, label: string): DesktopManifestIdentity {
  const release = record(value.release, `${label}.release`);
  const source = record(value.source, `${label}.source`);
  const cohort = record(value.cohort, `${label}.cohort`);
  return {
    release: {
      version: requiredString(release.version, `${label}.release.version`, /^[0-9]+\.[0-9]+\.[0-9]+(?:-r[1-9][0-9]*)?$/),
      updater_version: requiredString(release.updater_version, `${label}.release.updater_version`, /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/),
    },
    source: {
      run_id: requiredString(source.run_id, `${label}.source.run_id`, /^[1-9][0-9]*$/),
      bundle_digest: requiredString(source.bundle_digest, `${label}.source.bundle_digest`, /^sha256:[0-9a-f]{64}$/),
    },
    cohort: {
      app_sha: requiredString(cohort.app_sha, `${label}.cohort.app_sha`, /^[0-9a-f]{40}$/),
      shell_sha: requiredString(cohort.shell_sha, `${label}.cohort.shell_sha`, /^[0-9a-f]{40}$/),
      framework_sha: requiredString(cohort.framework_sha, `${label}.cohort.framework_sha`, /^[0-9a-f]{40}$/),
    },
  };
}

function expectedPlatformAssetNames(platform: DesktopPlatformId, version: string): string[] {
  if (platform === 'linux-x64') return [`One-Person-Lab-${version}-linux-x64.deb`];
  return [
    `One-Person-Lab-${version}-win-x64.exe`,
    `One-Person-Lab-${version}-win-x64.exe.blockmap`,
    'latest.yml',
    'opl-windows-updater-assets.json',
  ].sort(compareText);
}

function assertPlatformAssets(platform: DesktopPlatformId, version: string, assets: ManifestAsset[]): void {
  const names = assets.map((asset) => asset.name).sort(compareText);
  if (new Set(names).size !== names.length) fail(`Desktop ${platform} manifest contains duplicate assets.`);
  if (JSON.stringify(names) !== JSON.stringify(expectedPlatformAssetNames(platform, version))) {
    fail(`Desktop ${platform} manifest contains the wrong asset set.`);
  }
}

function sortedAssets(assets: ManifestAsset[]): ManifestAsset[] {
  return [...assets].sort((left, right) => compareText(left.name, right.name));
}

function sameAssets(left: ManifestAsset[], right: ManifestAsset[]): boolean {
  return JSON.stringify(sortedAssets(left)) === JSON.stringify(sortedAssets(right));
}

export function validateDesktopPlatformManifest(
  value: unknown,
  localAssets: ManifestAsset[],
): DesktopPlatformManifest {
  const candidate = record(value, 'Desktop platform manifest');
  if (candidate.schema !== 'opl_app_desktop_platform_manifest.v1') fail('Desktop platform manifest schema is invalid.');
  const platform = requiredString(candidate.platform, 'Desktop platform manifest.platform') as DesktopPlatformId;
  if (!desktopPlatformOrder.includes(platform)) fail('Desktop platform manifest platform is invalid.');
  if (!Array.isArray(candidate.assets)) fail('Desktop platform manifest assets are missing.');
  const identity = manifestIdentity(candidate, 'Desktop platform manifest');
  const assets = sortedAssets(candidate.assets.map((asset, index) => manifestAsset(asset, `Desktop platform manifest.assets[${index}]`)));
  assertPlatformAssets(platform, identity.release.version, assets);
  if (!sameAssets(assets, localAssets)) fail('Desktop platform manifest does not match the exact local assets.');
  return {
    schema: 'opl_app_desktop_platform_manifest.v1',
    ...identity,
    platform,
    assets,
  };
}

export function validateDesktopReleaseSetManifest(value: unknown): DesktopReleaseSetManifest {
  const candidate = record(value, 'Desktop Release Set manifest');
  if (candidate.schema !== 'opl_app_desktop_release_set_manifest.v1') fail('Desktop Release Set manifest schema is invalid.');
  if (!Array.isArray(candidate.platforms) || !Array.isArray(candidate.assets)) {
    fail('Desktop Release Set manifest platforms or assets are missing.');
  }
  const identity = manifestIdentity(candidate, 'Desktop Release Set manifest');
  const platforms = candidate.platforms.map((platform, index) => {
    const id = requiredString(platform, `Desktop Release Set manifest.platforms[${index}]`) as DesktopPlatformId;
    if (!desktopPlatformOrder.includes(id)) fail(`Unsupported Desktop platform ${id}.`);
    return id;
  });
  const canonicalPlatforms = desktopPlatformOrder.filter((platform) => platforms.includes(platform));
  if (new Set(platforms).size !== platforms.length || JSON.stringify(platforms) !== JSON.stringify(canonicalPlatforms)) {
    fail('Desktop Release Set manifest platform order or uniqueness is invalid.');
  }
  const assets = sortedAssets(candidate.assets.map((asset, index) => manifestAsset(asset, `Desktop Release Set manifest.assets[${index}]`)));
  const expectedNames = platforms.flatMap((platform) => expectedPlatformAssetNames(platform, identity.release.version)).sort();
  if (JSON.stringify(assets.map((asset) => asset.name)) !== JSON.stringify(expectedNames)) {
    fail('Desktop Release Set manifest asset ownership is invalid.');
  }
  return {
    schema: 'opl_app_desktop_release_set_manifest.v1',
    ...identity,
    platforms,
    assets,
  };
}

function sameManifestIdentity(left: DesktopManifestIdentity, right: DesktopManifestIdentity): boolean {
  return JSON.stringify({ release: left.release, source: left.source, cohort: left.cohort })
    === JSON.stringify({ release: right.release, source: right.source, cohort: right.cohort });
}

export function mergeDesktopPlatformManifest(
  existing: DesktopReleaseSetManifest | null,
  incoming: DesktopPlatformManifest,
): { manifest: DesktopReleaseSetManifest; changed: boolean } {
  if (!existing) {
    return {
      manifest: {
        schema: 'opl_app_desktop_release_set_manifest.v1',
        release: incoming.release,
        source: incoming.source,
        cohort: incoming.cohort,
        platforms: [incoming.platform],
        assets: incoming.assets,
      },
      changed: true,
    };
  }
  if (!sameManifestIdentity(existing, incoming)) fail('Desktop platform cohort conflicts with the published aggregate manifest.');
  const expectedIncomingNames = new Set(expectedPlatformAssetNames(incoming.platform, incoming.release.version));
  const existingPlatformAssets = existing.assets.filter((asset) => expectedIncomingNames.has(asset.name));
  if (existing.platforms.includes(incoming.platform)) {
    if (!sameAssets(existingPlatformAssets, incoming.assets)) {
      fail(`Published Desktop ${incoming.platform} manifest conflicts with the requested bytes.`);
    }
    return { manifest: existing, changed: false };
  }
  if (existingPlatformAssets.length > 0) fail(`Published aggregate already contains unowned ${incoming.platform} assets.`);
  return {
    manifest: {
      schema: 'opl_app_desktop_release_set_manifest.v1',
      release: existing.release,
      source: existing.source,
      cohort: existing.cohort,
      platforms: desktopPlatformOrder.filter((platform) => [...existing.platforms, incoming.platform].includes(platform)),
      assets: sortedAssets([...existing.assets, ...incoming.assets]),
    },
    changed: true,
  };
}

function canonicalJson(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (!item || typeof item !== 'object') return item;
    return Object.fromEntries(Object.entries(item as Record<string, unknown>)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, nested]) => [key, sort(nested)]));
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

function inventory(record: ReleaseRecord): ReleaseAsset[] {
  return record.assets
    .map(({ name, size, digest }) => ({ name, size, digest }))
    .sort((left, right) => compareText(left.name, right.name));
}

function bodyDigest(record: ReleaseRecord): string {
  if (typeof record.body !== 'string') fail('Stable Release body is unavailable.');
  return `sha256:${crypto.createHash('sha256').update(record.body).digest('hex')}`;
}

function assertRelease(record: ReleaseRecord, expected: {
  releaseId: number;
  tag: string;
  target: string;
}) {
  if (
    record.id !== expected.releaseId
    || record.tag_name !== expected.tag
    || record.target_commitish !== expected.target
    || record.draft !== false
    || record.prerelease !== false
    || record.immutable !== false
  ) {
    fail('Stable Desktop append requires the exact published mutable non-prerelease Release.');
  }
  const names = record.assets.map((asset) => asset.name);
  if (new Set(names).size !== names.length) fail('Stable Release contains duplicate asset names.');
}

function requiredRemoteAsset(asset: ReleaseAsset, label: string): ExpectedRepairAsset {
  if (
    !Number.isSafeInteger(asset.id)
    || Number(asset.id) <= 0
    || !Number.isSafeInteger(asset.size)
    || asset.size <= 0
    || !/^sha256:[0-9a-f]{64}$/.test(asset.digest)
  ) fail(`${label} has no exact GitHub asset identity.`);
  return { id: Number(asset.id), name: asset.name, size: asset.size, digest: asset.digest };
}

function readReleaseAssetText(repository: string, asset: ExpectedRepairAsset): string {
  const bytes = runGh([
    'api',
    '-H', 'Accept: application/octet-stream',
    `repos/${repository}/releases/assets/${asset.id}`,
  ]);
  const observed = {
    size: Buffer.byteLength(bytes),
    digest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
  };
  if (observed.size !== asset.size || observed.digest !== asset.digest) {
    fail(`Downloaded GitHub asset ${asset.name} does not match its exact API identity.`);
  }
  return bytes;
}

function aggregateAssets(record: ReleaseRecord): {
  canonical: ExpectedRepairAsset | null;
  stages: ExpectedRepairAsset[];
} {
  const canonicalMatches = record.assets.filter((asset) => asset.name === aggregateManifestName);
  if (canonicalMatches.length > 1) fail('Stable Release contains duplicate aggregate Desktop manifests.');
  const stages = record.assets
    .filter((asset) => aggregateManifestStagePattern.test(asset.name))
    .map((asset) => requiredRemoteAsset(asset, 'Staged Desktop aggregate manifest'));
  if (stages.length > 1) fail('Stable Release contains multiple staged Desktop aggregate manifests.');
  return {
    canonical: canonicalMatches[0]
      ? requiredRemoteAsset(canonicalMatches[0], 'Desktop aggregate manifest')
      : null,
    stages,
  };
}

function assertExactAsset(record: ReleaseRecord, expected: ManifestAsset & { id?: number }, label: string): ExpectedRepairAsset {
  const matches = record.assets.filter((asset) => asset.name === expected.name);
  if (matches.length !== 1) fail(`${label} is absent or duplicated after mutation.`);
  const observed = requiredRemoteAsset(matches[0]!, label);
  if (
    observed.size !== expected.size
    || observed.digest !== expected.digest
    || (expected.id !== undefined && observed.id !== expected.id)
  ) fail(`${label} differs from the expected bytes after mutation.`);
  return observed;
}

function assertExpectedState(
  record: ReleaseRecord,
  base: ReleaseAsset[],
  completed: Array<ReleaseAsset & { source_path: string }>,
) {
  const expected = [...base, ...completed.map(({ source_path: _sourcePath, ...asset }) => asset)]
    .sort((left, right) => compareText(left.name, right.name));
  if (JSON.stringify(inventory(record)) !== JSON.stringify(expected)) {
    fail('Stable Release inventory changed outside this append operation.');
  }
}

export function buildAppendPlan(record: ReleaseRecord, assets: Array<ReleaseAsset & { source_path: string }>) {
  const remoteByName = new Map(record.assets.map((asset) => [asset.name, asset]));
  const upload: Array<ReleaseAsset & { source_path: string }> = [];
  for (const asset of assets) {
    const remote = remoteByName.get(asset.name);
    if (!remote) {
      upload.push(asset);
      continue;
    }
    if (remote.size !== asset.size || remote.digest !== asset.digest) {
      fail(`Stable Release asset conflict for ${asset.name}.`);
    }
  }
  return { upload, already_complete: assets.filter((asset) => !upload.includes(asset)) };
}

export function buildAdditiveRepairPlan(
  record: ReleaseRecord,
  replacement: ReleaseAsset & { source_path: string },
  expectedCurrent: ExpectedRepairAsset,
) {
  if (!additiveRepairAssetNames.has(replacement.name) || replacement.name !== expectedCurrent.name) {
    fail(`Stable additive repair is not allowed for ${replacement.name}.`);
  }
  const matches = record.assets.filter((asset) => asset.name === expectedCurrent.name);
  if (matches.length !== 1) fail(`Stable additive repair requires one current ${expectedCurrent.name} asset.`);
  const current = matches[0];
  if (
    current.id !== expectedCurrent.id
    || current.size !== expectedCurrent.size
    || current.digest !== expectedCurrent.digest
  ) {
    fail(`Stable additive repair compare-and-swap mismatch for ${expectedCurrent.name}.`);
  }
  if (replacement.size === current.size && replacement.digest === current.digest) {
    fail(`Stable additive repair replacement for ${replacement.name} has unchanged bytes.`);
  }
  return { current, replacement };
}

export function assertFrozenReleaseAssets(record: ReleaseRecord, frozen: ReleaseAsset[]) {
  const frozenNames = frozen.map((asset) => asset.name);
  if (new Set(frozenNames).size !== frozenNames.length) {
    fail('Stable frozen asset set contains duplicate names.');
  }
  const remoteByName = new Map(record.assets.map((asset) => [asset.name, asset]));
  for (const expected of frozen) {
    if (expected.size <= 0 || !/^sha256:[0-9a-f]{64}$/.test(expected.digest)) {
      fail(`Stable frozen asset identity is invalid for ${expected.name}.`);
    }
    const remote = remoteByName.get(expected.name);
    if (!remote || remote.size !== expected.size || remote.digest !== expected.digest) {
      fail(`Stable primary asset drift for ${expected.name}.`);
    }
  }
}

function assertInventory(record: ReleaseRecord, expected: ReleaseAsset[]) {
  const normalized = expected
    .map(({ name, size, digest }) => ({ name, size, digest }))
    .sort((left, right) => compareText(left.name, right.name));
  if (JSON.stringify(inventory(record)) !== JSON.stringify(normalized)) {
    fail('Stable Release inventory changed outside this additive repair operation.');
  }
}

function mutateAndReadback(
  repository: string,
  releaseId: number,
  args: string[],
): { result: ReturnType<typeof spawnSync>; release: ReleaseRecord } {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    timeout: 1_800_000,
    env: { ...process.env, GH_PROMPT_DISABLED: '1' },
  });
  return { result, release: readRelease(repository, releaseId) };
}

function uploadAsset(
  repository: string,
  releaseId: number,
  tag: string,
  target: string,
  asset: ManifestAsset & { source_path: string },
): { release: ReleaseRecord; asset: ExpectedRepairAsset } {
  const mutation = mutateAndReadback(repository, releaseId, [
    'release', 'upload', tag, asset.source_path, '--repo', repository,
  ]);
  assertRelease(mutation.release, { releaseId, tag, target });
  assertTagTarget(repository, tag, target);
  const observed = assertExactAsset(mutation.release, asset, `Upload ${asset.name}`);
  return { release: mutation.release, asset: observed };
}

function deleteAsset(
  repository: string,
  releaseId: number,
  tag: string,
  target: string,
  asset: ExpectedRepairAsset,
): ReleaseRecord {
  const before = readRelease(repository, releaseId);
  assertRelease(before, { releaseId, tag, target });
  assertTagTarget(repository, tag, target);
  assertExactAsset(before, asset, `Delete CAS ${asset.name}`);
  const mutation = mutateAndReadback(repository, releaseId, [
    'api', '--method', 'DELETE', `repos/${repository}/releases/assets/${asset.id}`,
  ]);
  assertRelease(mutation.release, { releaseId, tag, target });
  assertTagTarget(repository, tag, target);
  if (mutation.release.assets.some((candidate) => candidate.id === asset.id || candidate.name === asset.name)) {
    fail(`Delete outcome for ${asset.name} is unknown; no duplicate mutation is allowed.`);
  }
  return mutation.release;
}

function renameAsset(
  repository: string,
  releaseId: number,
  tag: string,
  target: string,
  asset: ExpectedRepairAsset,
  name: string,
): { release: ReleaseRecord; asset: ExpectedRepairAsset } {
  const before = readRelease(repository, releaseId);
  assertRelease(before, { releaseId, tag, target });
  assertTagTarget(repository, tag, target);
  assertExactAsset(before, asset, `Rename CAS ${asset.name}`);
  const mutation = mutateAndReadback(repository, releaseId, [
    'api', '--method', 'PATCH', `repos/${repository}/releases/assets/${asset.id}`, '-f', `name=${name}`,
  ]);
  assertRelease(mutation.release, { releaseId, tag, target });
  assertTagTarget(repository, tag, target);
  const observed = assertExactAsset(
    mutation.release,
    { id: asset.id, name, size: asset.size, digest: asset.digest },
    `Rename ${asset.name} to ${name}`,
  );
  return { release: mutation.release, asset: observed };
}

function assertManifestSuccessor(
  current: DesktopReleaseSetManifest | null,
  staged: DesktopReleaseSetManifest,
): void {
  if (!current) return;
  if (!sameManifestIdentity(current, staged)) fail('Staged Desktop manifest cohort conflicts with the current aggregate.');
  for (const platform of current.platforms) {
    if (!staged.platforms.includes(platform)) fail('Staged Desktop manifest removes an already published platform.');
  }
  const stagedAssets = new Map(staged.assets.map((asset) => [asset.name, asset]));
  for (const asset of current.assets) {
    const successor = stagedAssets.get(asset.name);
    if (!successor || successor.size !== asset.size || successor.digest !== asset.digest) {
      fail(`Staged Desktop manifest changes already published asset ${asset.name}.`);
    }
  }
}

function readAggregateManifest(
  repository: string,
  asset: ExpectedRepairAsset,
): { manifest: DesktopReleaseSetManifest; bytes: string } {
  const bytes = readReleaseAssetText(repository, asset);
  let value: unknown;
  try {
    value = JSON.parse(bytes) as unknown;
  } catch {
    fail(`Published Desktop manifest ${asset.name} is not JSON.`);
  }
  return { manifest: validateDesktopReleaseSetManifest(value), bytes };
}

function main() {
  const { values } = parseArgs({
    options: {
      repository: { type: 'string' },
      'release-id': { type: 'string' },
      tag: { type: 'string' },
      target: { type: 'string' },
      'asset-dir': { type: 'string' },
      'platform-manifest': { type: 'string' },
      output: { type: 'string' },
      apply: { type: 'boolean', default: false },
      'repair-additive': { type: 'boolean', default: false },
      'expected-old-asset-id': { type: 'string' },
      'expected-old-asset-size': { type: 'string' },
      'expected-old-asset-digest': { type: 'string' },
      'expected-body-digest': { type: 'string' },
      'frozen-assets': { type: 'string' },
      'repair-source': { type: 'string' },
      'source-run-id': { type: 'string' },
      'public-receipt-name': { type: 'string' },
    },
  });
  const repository = values.repository || fail('--repository is required.');
  const releaseId = Number(values['release-id'] || fail('--release-id is required.'));
  const tag = values.tag || fail('--tag is required.');
  const target = values.target || fail('--target is required.');
  const assetDir = path.resolve(values['asset-dir'] || fail('--asset-dir is required.'));
  const output = path.resolve(values.output || fail('--output is required.'));
  if (!Number.isInteger(releaseId) || releaseId <= 0) fail('--release-id must be a positive integer.');
  if (!/^v[0-9][0-9A-Za-z._-]*$/.test(tag)) fail('--tag must be an exact v-prefixed Release tag.');
  if (!/^[0-9a-f]{40}$/.test(target)) fail('--target must be an exact Git SHA.');

  const files = fs.readdirSync(assetDir)
    .map((name) => path.join(assetDir, name))
    .filter((file) => fs.statSync(file).isFile())
    .sort();
  if (files.length === 0) fail('Desktop append asset directory is empty.');
  const assets = files.map(digestFile);
  if (new Set(assets.map((asset) => asset.name)).size !== assets.length) fail('Desktop append contains duplicate names.');

  if (values['repair-additive']) {
    if (assets.length !== 1) fail('Stable additive repair requires exactly one replacement asset.');
    const replacement = assets[0];
    const expectedCurrent: ExpectedRepairAsset = {
      id: Number(values['expected-old-asset-id'] || fail('--expected-old-asset-id is required.')),
      name: replacement.name,
      size: Number(values['expected-old-asset-size'] || fail('--expected-old-asset-size is required.')),
      digest: values['expected-old-asset-digest'] || fail('--expected-old-asset-digest is required.'),
    };
    const expectedBodyDigest = values['expected-body-digest'] || fail('--expected-body-digest is required.');
    const frozenPath = path.resolve(values['frozen-assets'] || fail('--frozen-assets is required.'));
    const frozen = JSON.parse(fs.readFileSync(frozenPath, 'utf8')) as ReleaseAsset[];
    const repairSource = values['repair-source'] || fail('--repair-source is required.');
    const sourceRunId = values['source-run-id'] || fail('--source-run-id is required.');
    const publicReceiptName = values['public-receipt-name'] || fail('--public-receipt-name is required.');
    if (!Number.isInteger(expectedCurrent.id) || expectedCurrent.id <= 0) fail('--expected-old-asset-id must be positive.');
    if (!Number.isInteger(expectedCurrent.size) || expectedCurrent.size <= 0) fail('--expected-old-asset-size must be positive.');
    if (!/^sha256:[0-9a-f]{64}$/.test(expectedCurrent.digest)) fail('--expected-old-asset-digest is invalid.');
    if (!/^sha256:[0-9a-f]{64}$/.test(expectedBodyDigest)) fail('--expected-body-digest is invalid.');
    if (!/^[0-9a-f]{40}$/.test(repairSource)) fail('--repair-source must be an exact Git SHA.');
    if (!/^[1-9][0-9]*$/.test(sourceRunId)) fail('--source-run-id must be a positive run id.');
    if (!/^opl-additive-repair-[0-9a-f]{12}\.json$/.test(publicReceiptName)) {
      fail('--public-receipt-name is invalid.');
    }
    if (!Array.isArray(frozen) || frozen.length === 0) fail('--frozen-assets must contain release assets.');

    let release = readRelease(repository, releaseId);
    assertRelease(release, { releaseId, tag, target });
    assertTagTarget(repository, tag, target);
    if (bodyDigest(release) !== expectedBodyDigest) fail('Stable Release body drifted before additive repair.');
    assertFrozenReleaseAssets(release, frozen);
    const plan = buildAdditiveRepairPlan(release, replacement, expectedCurrent);
    const base = inventory(release);

    if (!values.apply) {
      fs.writeFileSync(output, `${JSON.stringify({
        schema: 'opl_app_stable_additive_repair.v1',
        status: 'planned',
        release: { id: releaseId, tag, target_commitish: target, body_digest: expectedBodyDigest },
        source_run_id: sourceRunId,
        repair_source_commit: repairSource,
        frozen_assets: frozen,
        replacement: { previous: expectedCurrent, next: { name: replacement.name, size: replacement.size, digest: replacement.digest } },
        public_receipt: publicReceiptName,
        remaining: ['replace_asset', 'publish_receipt'],
      }, null, 2)}\n`);
      return;
    }

    let mutation = mutateAndReadback(repository, releaseId, [
      'api', '--method', 'DELETE', `repos/${repository}/releases/assets/${plan.current.id}`,
    ]);
    release = mutation.release;
    assertRelease(release, { releaseId, tag, target });
    assertTagTarget(repository, tag, target);
    if (bodyDigest(release) !== expectedBodyDigest) fail('Stable Release body drifted during additive repair.');
    assertFrozenReleaseAssets(release, frozen);
    assertInventory(release, base.filter((asset) => asset.name !== replacement.name));
    if (mutation.result.error || mutation.result.status !== 0) {
      // The owner-authoritative absence proves deletion completed; no delete retry is made.
      if (release.assets.some((asset) => asset.name === replacement.name)) {
        fail(`Delete outcome for ${replacement.name} is unknown; no retry is allowed.`);
      }
    }

    mutation = mutateAndReadback(repository, releaseId, [
      'release', 'upload', tag, replacement.source_path, '--repo', repository,
    ]);
    release = mutation.release;
    assertRelease(release, { releaseId, tag, target });
    assertTagTarget(repository, tag, target);
    if (bodyDigest(release) !== expectedBodyDigest) fail('Stable Release body drifted during additive repair.');
    assertFrozenReleaseAssets(release, frozen);
    assertInventory(release, [
      ...base.filter((asset) => asset.name !== replacement.name),
      replacement,
    ]);
    const observedReplacement = release.assets.filter((asset) => asset.name === replacement.name);
    if (
      observedReplacement.length !== 1
      || observedReplacement[0].size !== replacement.size
      || observedReplacement[0].digest !== replacement.digest
    ) {
      fail(`Upload outcome for ${replacement.name} is unknown or conflicting; no retry is allowed.`);
    }
    if (mutation.result.error || mutation.result.status !== 0) {
      // Exact readback is terminal even when the client returned a transport failure.
    }

    const receipt = {
      schema: 'opl_app_stable_additive_repair.v1',
      status: 'complete',
      release: {
        id: releaseId,
        tag,
        target_commitish: target,
        body_digest: expectedBodyDigest,
        draft: false,
        prerelease: false,
      },
      source_run_id: sourceRunId,
      repair_source_commit: repairSource,
      frozen_assets: frozen,
      replacement: {
        previous: expectedCurrent,
        next: { name: replacement.name, size: replacement.size, digest: replacement.digest },
      },
      public_receipt: publicReceiptName,
      remaining: [],
    };
    fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
    if (path.basename(output) !== publicReceiptName) {
      fail('Additive repair output basename must equal --public-receipt-name.');
    }

    mutation = mutateAndReadback(repository, releaseId, [
      'release', 'upload', tag, output, '--repo', repository,
    ]);
    release = mutation.release;
    assertRelease(release, { releaseId, tag, target });
    assertTagTarget(repository, tag, target);
    if (bodyDigest(release) !== expectedBodyDigest) fail('Stable Release body drifted while publishing repair receipt.');
    assertFrozenReleaseAssets(release, frozen);
    const receiptBytes = digestFile(output);
    assertInventory(release, [
      ...base.filter((asset) => asset.name !== replacement.name),
      replacement,
      receiptBytes,
    ]);
    const observedReceipt = release.assets.filter((asset) => asset.name === publicReceiptName);
    if (
      observedReceipt.length !== 1
      || observedReceipt[0].size !== receiptBytes.size
      || observedReceipt[0].digest !== receiptBytes.digest
    ) {
      fail('Public additive repair receipt outcome is unknown or conflicting; no retry is allowed.');
    }
    return;
  }

  const platformManifestPath = path.resolve(values['platform-manifest'] || fail('--platform-manifest is required.'));
  const platformManifestStat = fs.lstatSync(platformManifestPath);
  if (!platformManifestStat.isFile() || platformManifestStat.isSymbolicLink() || platformManifestStat.size <= 0) {
    fail('--platform-manifest must be one nonempty regular file.');
  }
  let platformManifestValue: unknown;
  try {
    platformManifestValue = JSON.parse(fs.readFileSync(platformManifestPath, 'utf8')) as unknown;
  } catch {
    fail('--platform-manifest must contain JSON.');
  }
  const localAssetIdentities = assets.map(({ source_path: _sourcePath, ...asset }) => asset);
  const platformManifest = validateDesktopPlatformManifest(platformManifestValue, localAssetIdentities);
  if (tag !== `v${platformManifest.release.version}` || target !== platformManifest.cohort.app_sha) {
    fail('Desktop platform manifest does not match the exact Stable Release tag and target.');
  }

  let release = readRelease(repository, releaseId);
  assertRelease(release, { releaseId, tag, target });
  assertTagTarget(repository, tag, target);

  let aggregate = aggregateAssets(release);
  let currentManifest: DesktopReleaseSetManifest | null = null;
  let currentManifestBytes: string | null = null;
  if (aggregate.canonical) {
    const current = readAggregateManifest(repository, aggregate.canonical);
    currentManifest = current.manifest;
    currentManifestBytes = current.bytes;
  }

  let stagedRecoveryRequired = false;
  if (aggregate.stages.length === 1) {
    const stagedAsset = aggregate.stages[0]!;
    const stagedDigest = aggregateManifestStagePattern.exec(stagedAsset.name)?.[1];
    if (`sha256:${stagedDigest}` !== stagedAsset.digest) fail('Staged Desktop manifest name and digest disagree.');
    const staged = readAggregateManifest(repository, stagedAsset);
    assertManifestSuccessor(currentManifest, staged.manifest);
    stagedRecoveryRequired = true;
    if (values.apply) {
      if (
        aggregate.canonical
        && aggregate.canonical.size === stagedAsset.size
        && aggregate.canonical.digest === stagedAsset.digest
      ) {
        release = deleteAsset(repository, releaseId, tag, target, stagedAsset);
      } else {
        if (aggregate.canonical) {
          release = deleteAsset(repository, releaseId, tag, target, aggregate.canonical);
        }
        const promoted = renameAsset(repository, releaseId, tag, target, stagedAsset, aggregateManifestName);
        release = promoted.release;
      }
      aggregate = aggregateAssets(release);
      if (!aggregate.canonical || aggregate.stages.length !== 0) {
        fail('Staged Desktop manifest recovery did not converge to one canonical manifest.');
      }
      const recovered = readAggregateManifest(repository, aggregate.canonical);
      currentManifest = recovered.manifest;
      currentManifestBytes = recovered.bytes;
    } else {
      currentManifest = staged.manifest;
      currentManifestBytes = staged.bytes;
    }
  }

  const initialMerge = mergeDesktopPlatformManifest(currentManifest, platformManifest);
  const initialDesiredBytes = initialMerge.changed || !currentManifestBytes
    ? canonicalJson(initialMerge.manifest)
    : currentManifestBytes;
  const initialDesiredManifestAsset = digestBytes(initialDesiredBytes);
  const initialAppendPlan = buildAppendPlan(release, assets);
  const plannedRemaining = [
    ...initialAppendPlan.upload.map((asset) => asset.name),
    ...(stagedRecoveryRequired && !values.apply ? ['resume_staged_desktop_manifest'] : []),
    ...(initialMerge.changed ? [aggregateManifestName] : []),
  ];

  if (values.apply) {
    const base = inventory(release);
    const completed: Array<ReleaseAsset & { source_path: string }> = [];
    for (const asset of initialAppendPlan.upload) {
      release = readRelease(repository, releaseId);
      assertRelease(release, { releaseId, tag, target });
      assertExpectedState(release, base, completed);
      const uploaded = uploadAsset(repository, releaseId, tag, target, asset);
      release = uploaded.release;
      completed.push(asset);
    }
    release = readRelease(repository, releaseId);
    assertRelease(release, { releaseId, tag, target });
    assertExpectedState(release, base, completed);

    aggregate = aggregateAssets(release);
    if (aggregate.stages.length !== 0) fail('No staged Desktop manifest may remain before a new aggregate mutation.');
    let liveManifest: DesktopReleaseSetManifest | null = null;
    let liveManifestBytes: string | null = null;
    if (aggregate.canonical) {
      const current = readAggregateManifest(repository, aggregate.canonical);
      liveManifest = current.manifest;
      liveManifestBytes = current.bytes;
    }
    const liveMerge = mergeDesktopPlatformManifest(liveManifest, platformManifest);
    const desiredBytes = liveMerge.changed || !liveManifestBytes
      ? canonicalJson(liveMerge.manifest)
      : liveManifestBytes;
    const desiredManifestAsset = digestBytes(desiredBytes);

    if (liveMerge.changed) {
      const expectedCanonical = aggregate.canonical;
      const stageName = `opl-desktop-platforms-manifest.${desiredManifestAsset.digest.slice('sha256:'.length)}.json`;
      const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-desktop-manifest-'));
      try {
        const stagePath = path.join(temporaryRoot, stageName);
        fs.writeFileSync(stagePath, desiredBytes, 'utf8');
        const stagedUpload = uploadAsset(repository, releaseId, tag, target, {
          ...desiredManifestAsset,
          name: stageName,
          source_path: stagePath,
        });
        release = stagedUpload.release;
        aggregate = aggregateAssets(release);
        if (expectedCanonical) {
          if (
            !aggregate.canonical
            || aggregate.canonical.id !== expectedCanonical.id
            || aggregate.canonical.size !== expectedCanonical.size
            || aggregate.canonical.digest !== expectedCanonical.digest
          ) fail('Desktop aggregate manifest changed before compare-and-swap replacement.');
          release = deleteAsset(repository, releaseId, tag, target, expectedCanonical);
        } else if (aggregate.canonical) {
          fail('Desktop aggregate manifest appeared before first publication.');
        }
        const promoted = renameAsset(
          repository,
          releaseId,
          tag,
          target,
          stagedUpload.asset,
          aggregateManifestName,
        );
        release = promoted.release;
      } finally {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
      }
    }

    release = readRelease(repository, releaseId);
    assertRelease(release, { releaseId, tag, target });
    assertTagTarget(repository, tag, target);
    const finalPlan = buildAppendPlan(release, assets);
    if (finalPlan.upload.length !== 0) fail('Stable Desktop platform append did not reach exact completion.');
    aggregate = aggregateAssets(release);
    if (!aggregate.canonical || aggregate.stages.length !== 0) {
      fail('Stable Desktop aggregate manifest did not reach one canonical asset.');
    }
    const finalAggregate = readAggregateManifest(repository, aggregate.canonical);
    const finalMerge = mergeDesktopPlatformManifest(finalAggregate.manifest, platformManifest);
    if (finalMerge.changed) fail('Stable Desktop aggregate manifest did not include the completed platform.');
    currentManifest = finalAggregate.manifest;
    currentManifestBytes = finalAggregate.bytes;
  }

  const manifestAsset = values.apply
    ? requiredRemoteAsset(aggregateAssets(release).canonical || fail('Desktop aggregate manifest is absent.'), 'Desktop aggregate manifest')
    : initialDesiredManifestAsset;
  fs.writeFileSync(output, `${JSON.stringify({
    schema: 'opl_app_stable_desktop_asset_append.v1',
    status: values.apply ? 'complete' : 'planned',
    platform: platformManifest.platform,
    release: { id: releaseId, tag, target_commitish: target, draft: false, prerelease: false },
    source: platformManifest.source,
    cohort: platformManifest.cohort,
    assets: sortedAssets([...localAssetIdentities, {
      name: aggregateManifestName,
      size: manifestAsset.size,
      digest: manifestAsset.digest,
    }]),
    upload: values.apply ? [] : initialAppendPlan.upload.map(({ source_path: _sourcePath, ...asset }) => asset),
    aggregate_manifest: {
      name: aggregateManifestName,
      asset_id: values.apply ? manifestAsset.id : null,
      size: manifestAsset.size,
      digest: manifestAsset.digest,
      platforms: currentManifest?.platforms ?? initialMerge.manifest.platforms,
      staged_recovery_performed: values.apply && stagedRecoveryRequired,
    },
    remaining: values.apply ? [] : plannedRemaining,
  }, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
