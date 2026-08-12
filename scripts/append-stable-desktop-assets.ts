#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
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

const additiveRepairAssetNames = new Set(['opl-install.sh']);

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

function inventory(record: ReleaseRecord): ReleaseAsset[] {
  return record.assets
    .map(({ name, size, digest }) => ({ name, size, digest }))
    .sort((left, right) => left.name.localeCompare(right.name));
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

function assertExpectedState(
  record: ReleaseRecord,
  base: ReleaseAsset[],
  completed: Array<ReleaseAsset & { source_path: string }>,
) {
  const expected = [...base, ...completed.map(({ source_path: _sourcePath, ...asset }) => asset)]
    .sort((left, right) => left.name.localeCompare(right.name));
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
    .sort((left, right) => left.name.localeCompare(right.name));
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

function main() {
  const { values } = parseArgs({
    options: {
      repository: { type: 'string' },
      'release-id': { type: 'string' },
      tag: { type: 'string' },
      target: { type: 'string' },
      'asset-dir': { type: 'string' },
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

  let release = readRelease(repository, releaseId);
  assertRelease(release, { releaseId, tag, target });
  const base = inventory(release);
  const plan = buildAppendPlan(release, assets);
  const completed: Array<ReleaseAsset & { source_path: string }> = [];

  if (values.apply) {
    for (const asset of plan.upload) {
      release = readRelease(repository, releaseId);
      assertRelease(release, { releaseId, tag, target });
      assertExpectedState(release, base, completed);
      const result = spawnSync('gh', ['release', 'upload', tag, asset.source_path, '--repo', repository], {
        encoding: 'utf8', timeout: 1_800_000, env: { ...process.env, GH_PROMPT_DISABLED: '1' },
      });
      release = readRelease(repository, releaseId);
      const observed = release.assets.filter((candidate) => candidate.name === asset.name);
      if (observed.length !== 1 || observed[0].size !== asset.size || observed[0].digest !== asset.digest) {
        fail(`Upload outcome for ${asset.name} is unknown or conflicting; no retry is allowed.`);
      }
      if (result.error || result.status !== 0) {
        fail(`Upload for ${asset.name} returned failure after owner-authoritative readback.`);
      }
      completed.push(asset);
    }
  }

  release = readRelease(repository, releaseId);
  assertRelease(release, { releaseId, tag, target });
  if (values.apply) assertExpectedState(release, base, completed);
  const finalPlan = buildAppendPlan(release, assets);
  if (values.apply && finalPlan.upload.length !== 0) fail('Stable Desktop append did not reach exact completion.');

  fs.writeFileSync(output, `${JSON.stringify({
    schema: 'opl_app_stable_desktop_asset_append.v1',
    status: values.apply ? 'complete' : 'planned',
    release: { id: releaseId, tag, target_commitish: target, draft: false, prerelease: false },
    assets: assets.map(({ source_path: _sourcePath, ...asset }) => asset),
    upload: finalPlan.upload.map(({ source_path: _sourcePath, ...asset }) => asset),
    remaining: values.apply ? [] : finalPlan.upload.map((asset) => asset.name),
  }, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
