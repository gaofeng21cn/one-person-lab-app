#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

type JsonRecord = Record<string, any>;

export const studioRepository = 'gaofeng21cn/opl-studio';
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const assetNamePattern = /^(?!\.{1,2}$)[^\\/\u0000-\u001f\u007f]+$/u;

export type StudioFullAsset = {
  name: string;
  size_bytes: number;
  sha256: string;
  source_path: string;
};

export type StudioFullReleaseRuntime = {
  run(command: string, args: string[], options: {
    input?: string;
    timeout: number;
    killSignal: NodeJS.Signals;
  }): {
    status: number | null;
    signal?: NodeJS.Signals | null;
    stdout?: string;
    stderr?: string;
    error?: Error;
  };
  now(): number;
  readTimeoutMs?: number;
  mutationTimeoutMs?: number;
};

export type StudioFullReleaseInspection = {
  release: {
    id: number;
    tag_name: string;
    name: string;
    body_sha256: string;
    draft: boolean;
    prerelease: boolean;
    immutable: boolean;
    target_commitish: string;
  };
  assets: StudioFullAsset[];
};

const defaultRuntime: StudioFullReleaseRuntime = {
  run(command, args, options) {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      input: options.input,
      env: process.env,
      maxBuffer: 64 * 1024 * 1024,
      timeout: options.timeout,
      killSignal: options.killSignal,
    });
    return {
      status: result.status,
      signal: result.signal,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      error: result.error,
    };
  },
  now: () => Date.now(),
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256Bytes(bytes: Buffer | string): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256Ref(bytes: Buffer | string): string {
  return `sha256:${sha256Bytes(bytes)}`;
}

function regularFile(filePath: string, label: string): Buffer {
  const stat = fs.lstatSync(filePath);
  invariant(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0,
    `${label} must be a non-empty regular file: ${filePath}`);
  return fs.readFileSync(filePath);
}

function safeAssetName(name: unknown, label: string): string {
  invariant(typeof name === 'string' && assetNamePattern.test(name), `${label} has an unsafe asset name.`);
  return name;
}

function readJsonFile(filePath: string, label: string): JsonRecord {
  const bytes = regularFile(filePath, label);
  try {
    const parsed = JSON.parse(bytes.toString('utf8')) as JsonRecord;
    invariant(parsed && typeof parsed === 'object' && !Array.isArray(parsed), `${label} must be a JSON object.`);
    return parsed;
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseDigest(value: unknown, label: string): string {
  invariant(typeof value === 'string' && digestPattern.test(value), `${label} must be a SHA-256 digest.`);
  return value;
}

function parsePositiveSize(value: unknown, label: string): number {
  invariant(Number.isSafeInteger(value) && Number(value) > 0, `${label} must be a positive byte count.`);
  return Number(value);
}

function canonicalAsset(name: string, sizeBytes: number, sha256: string, sourcePath: string): StudioFullAsset {
  safeAssetName(name, 'Full asset');
  parsePositiveSize(sizeBytes, `${name} size`);
  parseDigest(sha256, `${name} digest`);
  return { name, size_bytes: sizeBytes, sha256, source_path: path.resolve(sourcePath) };
}

function assertUniqueAssets(assets: StudioFullAsset[], label: string): void {
  const names = new Set<string>();
  for (const asset of assets) {
    if (names.has(asset.name)) throw new Error(`${label} contains duplicate asset ${asset.name}.`);
    names.add(asset.name);
  }
}

function assertAssetNameSetsDisjoint(left: StudioFullAsset[], right: StudioFullAsset[]): void {
  const leftNames = new Set(left.map((asset) => asset.name));
  for (const asset of right) {
    invariant(!leftNames.has(asset.name), `Standard and Full asset sets must not share asset name ${asset.name}.`);
  }
}

function assertLocalAssetMatches(asset: StudioFullAsset): void {
  const bytes = regularFile(asset.source_path, `Studio Full asset ${asset.name}`);
  invariant(bytes.byteLength === asset.size_bytes && sha256Ref(bytes) === asset.sha256,
    `Studio Full asset ${asset.name} does not match its declared local size or digest.`);
}

function manifestIdentity(manifestPath: string, dmgAsset: StudioFullAsset): JsonRecord {
  const manifest = readJsonFile(manifestPath, 'Studio Full public manifest');
  invariant(manifest.schema === 'opl_public_release_manifest.v1', 'Studio Full public manifest schema is invalid.');
  invariant(manifest.carrier?.carrier_id === 'opl-studio', 'Studio Full public manifest is not bound to opl-studio.');
  invariant(manifest.carrier?.profile_id === 'opl-studio-full-first-install', 'Studio Full carrier profile is invalid.');
  invariant(manifest.carrier?.bundle_id === 'cn.onepersonlab.opl.studio.preview', 'Studio Full bundle identity is invalid.');
  invariant(manifest.carrier?.codex_carrier === 'opl_codex_native', 'Studio Full Codex carrier identity is invalid.');
  invariant(manifest.carrier?.aioncore_required === false, 'Studio Full must not require AionCore.');
  invariant(manifest.package_kind === 'opl_studio_full_first_install_macos_arm64', 'Studio Full package kind is invalid.');
  const version = String(manifest.release_version ?? manifest.version ?? '');
  invariant(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version), 'Studio Full manifest version is invalid.');
  const expectedDmgName = `one-person-lab-preview-full-${version}-mac-arm64.dmg`;
  invariant(dmgAsset.name === expectedDmgName, `Studio Full DMG name must be ${expectedDmgName}.`);
  invariant(manifest.primary_install_asset === expectedDmgName, 'Studio Full manifest primary asset is invalid.');
  invariant(Array.isArray(manifest.assets) && manifest.assets.length === 1, 'Studio Full manifest must bind exactly one primary asset.');
  const manifestAsset = manifest.assets[0];
  invariant(manifestAsset?.name === dmgAsset.name, 'Studio Full manifest DMG name does not match the upload.');
  invariant(Number(manifestAsset?.size_bytes) === dmgAsset.size_bytes, 'Studio Full manifest DMG size does not match the upload.');
  invariant(manifestAsset?.sha256 === dmgAsset.sha256, 'Studio Full manifest DMG digest does not match the upload.');
  return { manifest, version };
}

function ghRead(runtime: StudioFullReleaseRuntime, args: string[], allow404 = false): JsonRecord | null {
  const timeout = runtime.readTimeoutMs ?? 30_000;
  const result = runtime.run('gh', args, { timeout, killSignal: 'SIGTERM' });
  if (result.status !== 0 || result.error) {
    if (allow404 && !result.error && /HTTP 404|Not Found/i.test(`${result.stderr ?? ''}\n${result.stdout ?? ''}`)) {
      return null;
    }
    throw new Error(`gh ${args.join(' ')} failed: ${result.stderr?.trim() || result.stdout?.trim() || result.error?.message || 'unknown error'}`);
  }
  try {
    return JSON.parse(String(result.stdout ?? '')) as JsonRecord;
  } catch {
    throw new Error(`gh ${args.join(' ')} did not return JSON.`);
  }
}

function releaseAssets(release: JsonRecord): StudioFullAsset[] {
  invariant(Array.isArray(release.assets), 'Studio Release asset response is invalid.');
  const assets = release.assets.map((asset: JsonRecord) => canonicalAsset(
    safeAssetName(asset.name, 'Remote asset'),
    parsePositiveSize(asset.size, `${String(asset.name)} remote size`),
    parseDigest(asset.digest, `${String(asset.name)} remote digest`),
    String(asset.browser_download_url ?? asset.name),
  ));
  assertUniqueAssets(assets, 'Remote Studio Release');
  return assets;
}

export function inspectStudioRelease(input: {
  repo: string;
  tag: string;
  studioSha: string;
  studioTree: string;
  runtime: StudioFullReleaseRuntime;
}): StudioFullReleaseInspection {
  const release = ghRead(input.runtime, ['api', `repos/${input.repo}/releases/tags/${input.tag}`]);
  invariant(release, `Studio Release ${input.tag} does not exist.`);
  const tagRef = ghRead(input.runtime, ['api', `repos/${input.repo}/git/ref/tags/${input.tag}`]);
  invariant(tagRef?.object?.type === 'commit' && tagRef.object.sha === input.studioSha,
    'Studio tag does not point to the exact admitted commit.');
  const commit = ghRead(input.runtime, ['api', `repos/${input.repo}/git/commits/${input.studioSha}`]);
  invariant(commit?.sha === input.studioSha && commit.tree?.sha === input.studioTree,
    'Studio commit does not point to the exact admitted tree.');
  invariant(release.tag_name === input.tag, 'Studio Release tag identity drifted.');
  invariant(release.draft === false && release.prerelease === false, 'Studio Full append requires a published non-prerelease Release.');
  invariant(release.immutable !== true, 'Studio Full append requires a mutable Studio Release.');
  invariant(Number.isSafeInteger(release.id) && Number(release.id) > 0, 'Studio Release id is invalid.');
  invariant(release.target_commitish === input.studioSha, 'Studio Release target commit drifted.');
  return {
    release: {
      id: release.id,
      tag_name: release.tag_name,
      name: String(release.name ?? ''),
      body_sha256: sha256Ref(String(release.body ?? '')),
      draft: release.draft,
      prerelease: release.prerelease,
      immutable: release.immutable === true,
      target_commitish: release.target_commitish,
    },
    assets: releaseAssets(release),
  };
}

function assertStandardAssets(observation: StudioFullReleaseInspection, standardAssets: StudioFullAsset[]): void {
  const remote = new Map((observation.assets as StudioFullAsset[]).map((asset) => [asset.name, asset]));
  for (const expected of standardAssets) {
    const actual = remote.get(expected.name);
    invariant(actual, `Studio Release is missing Standard asset ${expected.name}.`);
    invariant(actual.size_bytes === expected.size_bytes && actual.sha256 === expected.sha256,
      `Studio Standard asset ${expected.name} conflicts with its sealed digest.`);
  }
}

function assertFullAssetState(observation: StudioFullReleaseInspection, fullAssets: StudioFullAsset[], exact: boolean): string[] {
  const remote = new Map((observation.assets as StudioFullAsset[]).map((asset) => [asset.name, asset]));
  for (const expected of fullAssets) {
    const actual = remote.get(expected.name);
    if (actual) {
      invariant(actual.size_bytes === expected.size_bytes && actual.sha256 === expected.sha256,
        `Studio Full asset ${expected.name} conflicts with its exact size or digest.`);
    }
  }
  if (exact) {
    for (const expected of fullAssets) invariant(remote.has(expected.name), `Studio Release is missing Full asset ${expected.name}.`);
  }
  return fullAssets.filter((asset) => !remote.has(asset.name)).map((asset) => asset.name);
}

function assertReleaseStable(before: StudioFullReleaseInspection, after: StudioFullReleaseInspection): void {
  invariant(before.release.id === after.release.id, 'Studio Release id changed during Full append.');
  invariant(before.release.tag_name === after.release.tag_name, 'Studio Release tag changed during Full append.');
  invariant(before.release.name === after.release.name, 'Studio Release name changed during Full append.');
  invariant(before.release.body_sha256 === after.release.body_sha256, 'Studio Release notes changed during Full append.');
  invariant(before.release.target_commitish === after.release.target_commitish, 'Studio Release target changed during Full append.');
  invariant(before.release.draft === after.release.draft && before.release.prerelease === after.release.prerelease,
    'Studio Release publication state changed during Full append.');
  invariant(before.release.immutable === after.release.immutable, 'Studio Release mutability changed during Full append.');
}

export function buildStudioFullAssets(input: {
  dmgPath: string;
  manifestPath: string;
}): { version: string; assets: StudioFullAsset[]; manifest_sha256: string } {
  const dmgBytes = regularFile(input.dmgPath, 'Studio Full DMG');
  const dmgName = path.basename(input.dmgPath);
  const dmg = canonicalAsset(dmgName, dmgBytes.byteLength, sha256Ref(dmgBytes), input.dmgPath);
  const identity = manifestIdentity(input.manifestPath, dmg);
  const manifestBytes = regularFile(input.manifestPath, 'Studio Full public manifest');
  const manifest = canonicalAsset('opl-release-manifest.json', manifestBytes.byteLength, sha256Ref(manifestBytes), input.manifestPath);
  const assets = [dmg, manifest];
  assertUniqueAssets(assets, 'Studio Full upload set');
  return { version: identity.version, assets, manifest_sha256: manifest.sha256 };
}

export function appendStudioFullAssets(input: {
  repo?: string;
  tag: string;
  studioSha: string;
  studioTree: string;
  standardAssets: StudioFullAsset[];
  fullAssets: StudioFullAsset[];
  runtime?: StudioFullReleaseRuntime;
}): JsonRecord {
  const repo = input.repo ?? studioRepository;
  invariant(repo === studioRepository, 'Studio Full publication repository must remain gaofeng21cn/opl-studio.');
  invariant(/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(input.tag), 'Studio Full publication tag must be numeric SemVer.');
  invariant(/^[0-9a-f]{40}$/.test(input.studioSha), 'Studio commit must be an exact lowercase SHA.');
  invariant(/^[0-9a-f]{40}$/.test(input.studioTree), 'Studio tree must be an exact lowercase SHA.');
  assertUniqueAssets(input.standardAssets, 'Sealed Studio Standard asset set');
  assertUniqueAssets(input.fullAssets, 'Studio Full asset set');
  assertAssetNameSetsDisjoint(input.standardAssets, input.fullAssets);
  invariant(input.fullAssets.length === 2, 'Studio Full publication requires exactly two additive assets.');
  const version = input.tag.slice(1);
  const expectedFullNames = [
    `one-person-lab-preview-full-${version}-mac-arm64.dmg`,
    'opl-release-manifest.json',
  ].sort();
  invariant(
    JSON.stringify(input.fullAssets.map((asset) => asset.name).sort()) === JSON.stringify(expectedFullNames),
    'Studio Full publication asset names do not match the Studio carrier contract.',
  );
  invariant(input.standardAssets.some((asset) => asset.name === 'latest-mac.yml'),
    'Sealed Studio Standard assets must include latest-mac.yml.');
  invariant(input.standardAssets.some((asset) => asset.name === 'latest-arm64-mac.yml'),
    'Sealed Studio Standard assets must include latest-arm64-mac.yml.');
  for (const asset of input.fullAssets) assertLocalAssetMatches(asset);
  const runtime = input.runtime ?? defaultRuntime;
  const before = inspectStudioRelease({ ...input, repo, runtime });
  assertStandardAssets(before, input.standardAssets);
  const missing = assertFullAssetState(before, input.fullAssets, false);
  const uploaded: string[] = [];
  const reconciled: string[] = [];
  for (const asset of input.fullAssets) {
    if (!missing.includes(asset.name)) continue;
    const current = inspectStudioRelease({ ...input, repo, runtime });
    assertReleaseStable(before, current);
    assertStandardAssets(current, input.standardAssets);
    const currentMissing = assertFullAssetState(current, input.fullAssets, false);
    if (!currentMissing.includes(asset.name)) continue;
    const remainingMs = Math.max(1, (input.runtime?.mutationTimeoutMs ?? 10 * 60_000));
    const result = runtime.run('gh', ['release', 'upload', input.tag, asset.source_path, '--repo', repo], {
      timeout: remainingMs,
      killSignal: 'SIGTERM',
    });
    const after = inspectStudioRelease({ ...input, repo, runtime });
    assertReleaseStable(before, after);
    assertStandardAssets(after, input.standardAssets);
    const observed = (after.assets as StudioFullAsset[]).find((entry) => entry.name === asset.name);
    const exact = observed?.size_bytes === asset.size_bytes && observed.sha256 === asset.sha256;
    if (result.status !== 0 || result.error) {
      if (exact) {
        reconciled.push(asset.name);
        continue;
      }
      throw new Error(
        `Studio Full asset upload outcome is unknown for ${asset.name}; exact readback did not prove publication, and no retry was attempted: ${
          result.stderr?.trim() || result.stdout?.trim() || result.error?.message || 'unknown error'
        }`,
      );
    }
    invariant(exact, `Studio Full upload readback did not match ${asset.name}.`);
    uploaded.push(asset.name);
  }
  const final = inspectStudioRelease({ ...input, repo, runtime });
  assertReleaseStable(before, final);
  assertStandardAssets(final, input.standardAssets);
  assertFullAssetState(final, input.fullAssets, true);
  return {
    schema: 'opl_studio_full_same_tag_append_receipt.v1',
    status: 'complete',
    repository: repo,
    tag: input.tag,
    source: { commit_sha: input.studioSha, tree_sha: input.studioTree },
    uploaded,
    reconciled,
    assets: input.fullAssets.map(({ source_path: _sourcePath, ...asset }) => asset),
    standard_assets_modified: false,
    release_notes_modified: false,
    latest_modified: false,
    updater_metadata_modified: false,
    release: final.release,
  };
}

function readStandardAssets(filePath: string): StudioFullAsset[] {
  const document = readJsonFile(filePath, 'Studio Standard release asset manifest');
  invariant(document.schema === 'opl_studio_release_assets.v1', 'Studio Standard release asset manifest schema is invalid.');
  invariant(document.repository === studioRepository, 'Studio Standard release asset manifest repository is invalid.');
  invariant(Array.isArray(document.assets), 'Studio Standard release asset manifest assets are missing.');
  const assets = document.assets.map((asset: JsonRecord) => canonicalAsset(
    safeAssetName(asset.name, 'Standard asset'),
    parsePositiveSize(asset.size_bytes, `${String(asset.name)} size`),
    parseDigest(String(asset.sha256 ?? '').startsWith('sha256:')
      ? String(asset.sha256)
      : `sha256:${String(asset.sha256 ?? '')}`, `${String(asset.name)} digest`),
    String(asset.name),
  ));
  assertUniqueAssets(assets, 'Studio Standard release asset manifest');
  return assets;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runCli(argv: string[]): void {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      repo: { type: 'string' },
      tag: { type: 'string' },
      'studio-sha': { type: 'string' },
      'studio-tree': { type: 'string' },
      'standard-assets': { type: 'string' },
      dmg: { type: 'string' },
      manifest: { type: 'string' },
      output: { type: 'string' },
    },
  });
  invariant(positionals.length === 1 && positionals[0] === 'append', 'Usage: studio-full-release-adapter.ts append <options>');
  for (const name of ['tag', 'studio-sha', 'studio-tree', 'standard-assets', 'dmg', 'manifest', 'output'] as const) {
    invariant(values[name], `Missing required option: --${name}`);
  }
  const full = buildStudioFullAssets({ dmgPath: values.dmg!, manifestPath: values.manifest! });
  const receipt = appendStudioFullAssets({
    repo: values.repo ?? studioRepository,
    tag: values.tag!,
    studioSha: values['studio-sha']!,
    studioTree: values['studio-tree']!,
    standardAssets: readStandardAssets(values['standard-assets']!),
    fullAssets: full.assets,
  });
  writeJson(path.resolve(values.output!), receipt);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
