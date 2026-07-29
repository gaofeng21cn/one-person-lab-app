#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

type JsonRecord = Record<string, any>;
type PreviewOperation = 'publish' | 'cleanup';

export type AssetIdentity = {
  name: string;
  size_bytes: number;
  sha256: string;
};

export type PreviewRelease = {
  id: number;
  tag_name: string;
  target_commitish?: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  published_at?: string | null;
  assets: Array<{
    id: number;
    name: string;
    size: number;
    digest?: string | null;
  }>;
};

export type PreviewRemote = {
  inspectRelease(tag: string): PreviewRelease | null;
  inspectTag(tag: string): string | null;
  inspectLatestTag(): string | null;
  createDraft(input: {
    tag: string;
    targetCommitish: string;
    name: string;
    body: string;
  }): void;
  uploadAsset(releaseId: number, filePath: string, name: string): void;
  publishRelease(releaseId: number, name: string, body: string): void;
  deleteRelease(releaseId: number): void;
  deleteTag(tag: string): void;
};

export type ValidatedPublishHandoff = {
  operation: 'publish';
  root: string;
  manifest: JsonRecord;
  manifestSha256: string;
  version: string;
  previewTag: string;
  sourceCommit: string;
  sourceLockSha256: string;
  releaseName: string;
  releaseNotes: string;
  assets: AssetIdentity[];
};

export type ValidatedCleanupHandoff = {
  operation: 'cleanup';
  root: string;
  manifest: JsonRecord;
  manifestSha256: string;
  version: string;
  previewTag: string;
  sourceLockSha256: string;
  stableTag: string;
  stableAssets: AssetIdentity[];
  evidence: AssetIdentity[];
};

export type ValidatedHandoff = ValidatedPublishHandoff | ValidatedCleanupHandoff;

const releaseRepo = 'gaofeng21cn/one-person-lab-app';
const digestPattern = /^[0-9a-f]{64}$/;
const digestRefPattern = /^sha256:[0-9a-f]{64}$/;
const gitShaPattern = /^[0-9a-f]{40}$/;
const versionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const noncePattern = /^[0-9a-f]{32}$/;
const previewTagPattern = /^manual-full-preview-(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-m1-[0-9a-f]{12}$/;
const manifestName = 'manual-full-preview-manifest.json';
const largeAssetUploadTimeoutMs = 20 * 60_000;
const githubCommandMaxBufferBytes = 32 * 1024 * 1024;
const publishFixedNames = [
  'full-package-manifest.json',
  'manual-full-host-qa-receipt.json',
  'manual-full-m1-delivery-receipt.json',
  'manual-latest-build-receipt.json',
  'manual-latest-source-lock.json',
  'opl-release-manifest.json',
] as const;
const cleanupEvidenceNames = [
  'manual-full-m2-qualification-receipt.json',
  'stable-append-full-readback-receipt.json',
] as const;

export const MANUAL_FULL_PREVIEW_RELEASE_NOTES = [
  '# Manual Full preview',
  '',
  'Minimum Host QA passed.',
  '',
  'M2 clean VM/full qualification pending.',
  '',
  'This is not Stable and is not an automatic update.',
  '',
  'Stable Latest, updater metadata, Homebrew, and the Standard checkpoint remain unchanged.',
].join('\n');

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function exactDigest(value: unknown, label: string): string {
  const digest = text(value, label);
  if (!digestPattern.test(digest)) throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  return digest;
}

function exactGitSha(value: unknown, label: string): string {
  const sha = text(value, label);
  if (!gitShaPattern.test(sha)) throw new Error(`${label} must be an exact lowercase Git SHA.`);
  return sha;
}

function exactVersion(value: unknown, label: string): string {
  const version = text(value, label);
  if (!versionPattern.test(version)) throw new Error(`${label} must be an exact CalVer display version.`);
  return version;
}

function exactInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return Number(value);
}

function readJson(filePath: string, label = path.basename(filePath)): JsonRecord {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return record(value, label);
}

export function fileSha256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

function assertExactKeys(value: JsonRecord, label: string, keys: string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} keys must be exactly ${expected.join(', ')}; got ${actual.join(', ')}.`);
  }
}

function compareNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertRegularFile(filePath: string, label: string): fs.Stats {
  const stat = fs.lstatSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`${label} must be a non-empty regular file.`);
  }
  return stat;
}

function declaredAssetIdentity(value: unknown, label: string): AssetIdentity {
  const asset = record(value, label);
  assertExactKeys(asset, label, ['name', 'size_bytes', 'sha256']);
  const name = text(asset.name, `${label}.name`);
  if (path.basename(name) !== name || name === '.' || name === '..') {
    throw new Error(`${label}.name must be a plain file name.`);
  }
  const sizeBytes = exactInteger(asset.size_bytes, `${label}.size_bytes`);
  const sha256 = exactDigest(asset.sha256, `${label}.sha256`);
  return { name, size_bytes: sizeBytes, sha256 };
}

function assetIdentity(root: string, value: unknown, label: string): AssetIdentity {
  const identity = declaredAssetIdentity(value, label);
  const { name, size_bytes: sizeBytes, sha256 } = identity;
  const filePath = path.join(root, name);
  const stat = assertRegularFile(filePath, label);
  if (stat.size !== sizeBytes) {
    throw new Error(`${label} size mismatch: expected=${sizeBytes} actual=${stat.size}.`);
  }
  const actualDigest = fileSha256(filePath);
  if (actualDigest !== sha256) {
    throw new Error(`${label} digest mismatch: expected=${sha256} actual=${actualDigest}.`);
  }
  return identity;
}

function exactAssetSet(root: string, values: unknown, label: string): AssetIdentity[] {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`${label} must be a non-empty array.`);
  const assets = values.map((value, index) => assetIdentity(root, value, `${label}[${index}]`));
  const names = assets.map(({ name }) => name);
  if (new Set(names).size !== names.length || JSON.stringify(names) !== JSON.stringify([...names].sort())) {
    throw new Error(`${label} names must be unique and sorted.`);
  }
  return assets;
}

export function derivePreviewTag(version: string, sourceLockSha256: string): string {
  exactVersion(version, 'display version');
  exactDigest(sourceLockSha256, 'source-lock digest');
  return `manual-full-preview-${version}-m1-${sourceLockSha256.slice(0, 12)}`;
}

function expectedDmgName(version: string): string {
  return `One-Person-Lab-Full-${version}-mac-arm64.dmg`;
}

function requiredFormalStableAssetNames(version: string): string[] {
  return [
    `One-Person-Lab-${version}-mac-arm64.dmg`,
    `One-Person-Lab-${version}-mac-arm64.zip`,
    `One-Person-Lab-${version}-mac-arm64.zip.blockmap`,
    expectedDmgName(version),
    'latest-arm64-mac.yml',
    'opl-app-component-manifest.json',
    'opl-install.sh',
    'opl-release-manifest.json',
    'standard-gatekeeper-launch-policy.json',
    'standard-apple-notarization-receipt.json',
  ].sort();
}

function findAsset(assets: AssetIdentity[], name: string, label: string): AssetIdentity {
  const asset = assets.find((entry) => entry.name === name);
  if (!asset) throw new Error(`${label} does not contain ${name}.`);
  return asset;
}

function assertDigestBinding(value: unknown, expected: string, label: string): void {
  if (value !== expected) throw new Error(`${label} does not match the exact handoff bytes.`);
}

function validatePublishReceipts(
  root: string,
  version: string,
  sourceLockSha256: string,
  assets: AssetIdentity[],
): string {
  const dmg = findAsset(assets, expectedDmgName(version), 'publish assets');
  const sourceLockAsset = findAsset(assets, 'manual-latest-source-lock.json', 'publish assets');
  const buildAsset = findAsset(assets, 'manual-latest-build-receipt.json', 'publish assets');
  const hostQaAsset = findAsset(assets, 'manual-full-host-qa-receipt.json', 'publish assets');
  const m1Asset = findAsset(assets, 'manual-full-m1-delivery-receipt.json', 'publish assets');
  const fullManifestAsset = findAsset(assets, 'full-package-manifest.json', 'publish assets');
  const releaseManifestAsset = findAsset(assets, 'opl-release-manifest.json', 'publish assets');

  assertDigestBinding(sourceLockAsset.sha256, sourceLockSha256, 'source-lock manifest digest');
  const sourceLock = readJson(path.join(root, sourceLockAsset.name));
  if (sourceLock.schema !== 'opl_manual_latest_build_source_lock.v1') {
    throw new Error('manual-latest-source-lock.json schema is invalid.');
  }
  if (sourceLock.display_version !== version) throw new Error('source-lock display version is invalid.');
  const sourceCommit = exactGitSha(
    record(record(sourceLock.repositories, 'source-lock repositories').app, 'source-lock App repository').head,
    'source-lock App HEAD',
  );

  const build = readJson(path.join(root, buildAsset.name));
  if (build.schema !== 'opl_manual_latest_build_receipt.v1' || build.status !== 'completed' || build.mode !== 'full-dmg') {
    throw new Error('manual-latest-build-receipt.json must be a completed Full DMG receipt.');
  }
  if (build.display_version !== version) throw new Error('manual build receipt display version is invalid.');
  assertDigestBinding(build.source_lock_sha256, sourceLockSha256, 'manual build source-lock digest');
  const buildOutput = record(build.output, 'manual build output');
  assertDigestBinding(buildOutput.dmg_sha256, dmg.sha256, 'manual build DMG digest');
  if (buildOutput.dmg_size_bytes !== dmg.size_bytes) throw new Error('manual build DMG size is invalid.');
  assertDigestBinding(
    buildOutput.full_package_manifest_sha256,
    fullManifestAsset.sha256,
    'manual build Full package manifest digest',
  );
  assertDigestBinding(
    buildOutput.release_manifest_sha256,
    releaseManifestAsset.sha256,
    'manual build public manifest digest',
  );

  const hostQa = readJson(path.join(root, hostQaAsset.name));
  if (
    hostQa.schema !== 'opl_manual_full_host_qa_receipt.v1'
    || hostQa.status !== 'passed'
    || hostQa.qualification !== 'minimum_host_qa'
  ) {
    throw new Error('Manual Full Host QA receipt must record passed minimum_host_qa.');
  }
  if (hostQa.display_version !== version) throw new Error('Host QA display version is invalid.');
  assertDigestBinding(hostQa.source_lock_sha256, sourceLockSha256, 'Host QA source-lock digest');
  const hostQaDmg = record(hostQa.dmg, 'Host QA DMG');
  if (hostQaDmg.name !== dmg.name || hostQaDmg.size_bytes !== dmg.size_bytes || hostQaDmg.sha256 !== dmg.sha256) {
    throw new Error('Host QA receipt is not bound to the exact DMG.');
  }

  const m1 = readJson(path.join(root, m1Asset.name));
  if (m1.schema !== 'opl_manual_full_m1_delivery_receipt.v1' || m1.status !== 'MANUAL_USABLE_DELIVERED') {
    throw new Error('M1 delivery receipt must record MANUAL_USABLE_DELIVERED.');
  }
  if (m1.display_version !== version) throw new Error('M1 display version is invalid.');
  assertDigestBinding(m1.source_lock_sha256, sourceLockSha256, 'M1 source-lock digest');
  assertDigestBinding(m1.build_receipt_sha256, buildAsset.sha256, 'M1 build receipt digest');
  assertDigestBinding(m1.host_qa_receipt_sha256, hostQaAsset.sha256, 'M1 Host QA receipt digest');
  assertDigestBinding(
    m1.full_package_manifest_sha256,
    fullManifestAsset.sha256,
    'M1 Full package manifest digest',
  );
  assertDigestBinding(m1.release_manifest_sha256, releaseManifestAsset.sha256, 'M1 public manifest digest');
  const m1Dmg = record(m1.dmg, 'M1 DMG');
  if (m1Dmg.name !== dmg.name || m1Dmg.size_bytes !== dmg.size_bytes || m1Dmg.sha256 !== dmg.sha256) {
    throw new Error('M1 delivery receipt is not bound to the exact DMG.');
  }

  const fullManifest = readJson(path.join(root, fullManifestAsset.name));
  if (fullManifest.version !== version) throw new Error('Full package manifest version is invalid.');
  const publicManifest = readJson(path.join(root, releaseManifestAsset.name));
  if (
    publicManifest.schema !== 'opl_public_release_manifest.v1'
    || publicManifest.version !== version
    || publicManifest.primary_install_asset !== dmg.name
  ) {
    throw new Error('Public Full manifest identity is invalid.');
  }
  const publicDmg = Array.isArray(publicManifest.assets)
    ? publicManifest.assets.find((entry: unknown) => isRecord(entry) && entry.name === dmg.name)
    : null;
  if (!publicDmg || publicDmg.size_bytes !== dmg.size_bytes || publicDmg.sha256 !== dmg.sha256) {
    throw new Error('Public Full manifest is not bound to the exact DMG.');
  }
  return sourceCommit;
}

function validatePublishManifest(root: string, manifest: JsonRecord, manifestSha256: string): ValidatedPublishHandoff {
  assertExactKeys(manifest, manifestName, [
    'assets',
    'display_version',
    'notes',
    'operation',
    'preview_tag',
    'schema',
    'source_lock_sha256',
  ]);
  if (manifest.schema !== 'opl_manual_full_preview_manifest.v1' || manifest.operation !== 'publish') {
    throw new Error('Publish handoff manifest schema/operation is invalid.');
  }
  const version = exactVersion(manifest.display_version, 'publish display_version');
  const sourceLockSha256 = exactDigest(manifest.source_lock_sha256, 'publish source_lock_sha256');
  const previewTag = derivePreviewTag(version, sourceLockSha256);
  if (manifest.preview_tag !== previewTag || !previewTagPattern.test(previewTag) || previewTag.startsWith('v')) {
    throw new Error('Publish preview_tag is not the deterministic preview-only tag.');
  }
  if (manifest.notes !== MANUAL_FULL_PREVIEW_RELEASE_NOTES) throw new Error('Publish notes do not match the required Manual Full preview warning.');
  const assets = exactAssetSet(root, manifest.assets, 'publish assets');
  const requiredNames = [...publishFixedNames, expectedDmgName(version)].sort();
  if (JSON.stringify(assets.map(({ name }) => name)) !== JSON.stringify(requiredNames)) {
    throw new Error(`Publish assets must be exactly ${requiredNames.join(', ')}.`);
  }
  const sourceCommit = validatePublishReceipts(root, version, sourceLockSha256, assets);
  const manifestAsset: AssetIdentity = {
    name: manifestName,
    size_bytes: assertRegularFile(path.join(root, manifestName), manifestName).size,
    sha256: manifestSha256,
  };
  return {
    operation: 'publish',
    root,
    manifest,
    manifestSha256,
    version,
    previewTag,
    sourceCommit,
    sourceLockSha256,
    releaseName: `One Person Lab Manual Full Preview v${version}`,
    releaseNotes: MANUAL_FULL_PREVIEW_RELEASE_NOTES,
    assets: [...assets, manifestAsset].sort((left, right) => compareNames(left.name, right.name)),
  };
}

function validateCleanupReceipts(
  root: string,
  version: string,
  sourceLockSha256: string,
  previewTag: string,
  stableTag: string,
  evidence: AssetIdentity[],
  stableAssets: AssetIdentity[],
): void {
  const m2Asset = findAsset(evidence, cleanupEvidenceNames[0], 'cleanup evidence');
  const stableReceiptAsset = findAsset(evidence, cleanupEvidenceNames[1], 'cleanup evidence');
  const m2 = readJson(path.join(root, m2Asset.name));
  if (m2.schema !== 'opl_manual_full_m2_qualification_receipt.v1' || m2.status !== 'standard_qualified') {
    throw new Error('M2 receipt must record standard_qualified.');
  }
  if (m2.display_version !== version || m2.preview_tag !== previewTag) {
    throw new Error('M2 receipt preview identity is invalid.');
  }
  assertDigestBinding(m2.source_lock_sha256, sourceLockSha256, 'M2 source-lock digest');
  const m2BundleDigest = text(m2.bundle_digest, 'M2 Bundle digest');
  if (!digestRefPattern.test(m2BundleDigest)) throw new Error('M2 receipt lacks an exact Bundle digest.');
  const m2Dmg = declaredAssetIdentity(m2.dmg, 'M2 DMG');
  const m2ReleaseManifest = declaredAssetIdentity(m2.release_manifest, 'M2 release manifest');
  const stableDmg = findAsset(stableAssets, expectedDmgName(version), 'Stable assets');
  const stableReleaseManifest = findAsset(stableAssets, 'opl-release-manifest.json', 'Stable assets');
  if (JSON.stringify(m2Dmg) !== JSON.stringify(stableDmg)) {
    throw new Error('M2 receipt and formal Stable do not bind the same Full DMG.');
  }
  if (JSON.stringify(m2ReleaseManifest) !== JSON.stringify(stableReleaseManifest)) {
    throw new Error('M2 receipt and formal Stable do not bind the same Full release manifest.');
  }
  const cleanVm = record(m2.clean_vm, 'M2 clean_vm');
  if (cleanVm.status !== 'passed' || cleanVm.full_qualification !== 'passed') {
    throw new Error('M2 clean VM/full qualification did not pass.');
  }
  const cleanup = record(m2.cleanup, 'M2 cleanup');
  if (cleanup.status !== 'complete') throw new Error('M2 builder cleanup is not complete.');

  const stable = readJson(path.join(root, stableReceiptAsset.name));
  if (stable.schema !== 'opl_manual_preview_stable_append_full_readback.v1' || stable.status !== 'verified') {
    throw new Error('Stable append/readback receipt is invalid.');
  }
  if (
    stable.display_version !== version
    || stable.preview_tag !== previewTag
    || stable.stable_tag !== stableTag
    || stable.source_lock_sha256 !== sourceLockSha256
  ) {
    throw new Error('Stable append/readback receipt cohort identity is invalid.');
  }
  if (!digestRefPattern.test(String(stable.bundle_digest ?? ''))) {
    throw new Error('Stable append/readback receipt lacks an exact Bundle digest.');
  }
  if (stable.bundle_digest !== m2BundleDigest) {
    throw new Error('M2 and Stable append/readback receipts do not bind the same Bundle.');
  }
  if (
    record(stable.standard, 'Stable Standard readback').status !== 'published_latest_readback_verified'
    || record(stable.append_full, 'Stable append_full readback').status !== 'published_readback_verified'
    || record(stable.updater_metadata, 'Stable updater metadata').status !== 'verified'
  ) {
    throw new Error('Stable Standard/append_full/updater readback is incomplete.');
  }
  const receiptAssets = Array.isArray(stable.assets) ? stable.assets : [];
  if (JSON.stringify(receiptAssets) !== JSON.stringify(stableAssets)) {
    throw new Error('Stable append/readback receipt assets do not match the cleanup manifest.');
  }
}

function validateCleanupManifest(root: string, manifest: JsonRecord, manifestSha256: string): ValidatedCleanupHandoff {
  assertExactKeys(manifest, manifestName, [
    'display_version',
    'evidence',
    'operation',
    'preview_tag',
    'schema',
    'source_lock_sha256',
    'stable_assets',
    'stable_tag',
  ]);
  if (manifest.schema !== 'opl_manual_full_preview_manifest.v1' || manifest.operation !== 'cleanup') {
    throw new Error('Cleanup handoff manifest schema/operation is invalid.');
  }
  const version = exactVersion(manifest.display_version, 'cleanup display_version');
  const sourceLockSha256 = exactDigest(manifest.source_lock_sha256, 'cleanup source_lock_sha256');
  const previewTag = derivePreviewTag(version, sourceLockSha256);
  if (manifest.preview_tag !== previewTag || !previewTagPattern.test(previewTag)) {
    throw new Error('Cleanup preview_tag is invalid.');
  }
  const stableTag = text(manifest.stable_tag, 'cleanup stable_tag');
  if (!/^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-r[1-9][0-9]*)?$/.test(stableTag)) {
    throw new Error('Cleanup stable_tag must be an exact Stable tag.');
  }
  const evidence = exactAssetSet(root, manifest.evidence, 'cleanup evidence');
  if (JSON.stringify(evidence.map(({ name }) => name)) !== JSON.stringify([...cleanupEvidenceNames].sort())) {
    throw new Error(`Cleanup evidence must be exactly ${[...cleanupEvidenceNames].sort().join(', ')}.`);
  }
  const stableAssets = Array.isArray(manifest.stable_assets)
    ? manifest.stable_assets.map((value: unknown, index: number) =>
        declaredAssetIdentity(value, `stable_assets[${index}]`))
    : [];
  const stableNames = stableAssets.map(({ name }) => name);
  const requiredStableNames = requiredFormalStableAssetNames(version);
  if (
    JSON.stringify(stableNames) !== JSON.stringify(requiredStableNames)
    || new Set(stableNames).size !== stableNames.length
    || JSON.stringify(stableNames) !== JSON.stringify([...stableNames].sort())
  ) {
    throw new Error('Cleanup stable_assets must be the exact required formal Stable asset set.');
  }
  validateCleanupReceipts(root, version, sourceLockSha256, previewTag, stableTag, evidence, stableAssets);
  return {
    operation: 'cleanup',
    root,
    manifest,
    manifestSha256,
    version,
    previewTag,
    sourceLockSha256,
    stableTag,
    stableAssets,
    evidence,
  };
}

export function validateHandoffDirectory(
  root: string,
  operation: PreviewOperation,
  expectedManifestSha256: string,
): ValidatedHandoff {
  const resolvedRoot = path.resolve(root);
  const rootStat = fs.lstatSync(resolvedRoot, { throwIfNoEntry: false });
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Handoff root must be a real directory.');
  const manifestPath = path.join(resolvedRoot, manifestName);
  assertRegularFile(manifestPath, manifestName);
  const manifestSha256 = fileSha256(manifestPath);
  if (manifestSha256 !== exactDigest(expectedManifestSha256, 'expected manifest digest')) {
    throw new Error(`Handoff manifest digest mismatch: expected=${expectedManifestSha256} actual=${manifestSha256}.`);
  }
  const manifest = readJson(manifestPath);
  const validated = operation === 'publish'
    ? validatePublishManifest(resolvedRoot, manifest, manifestSha256)
    : validateCleanupManifest(resolvedRoot, manifest, manifestSha256);
  const expectedNames = validated.operation === 'publish'
    ? validated.assets.map(({ name }) => name)
    : [manifestName, ...validated.evidence.map(({ name }) => name)].sort();
  const actualNames = fs.readdirSync(resolvedRoot).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify([...expectedNames].sort())) {
    throw new Error(`Handoff directory files must be exactly ${[...expectedNames].sort().join(', ')}.`);
  }
  for (const name of actualNames) assertRegularFile(path.join(resolvedRoot, name), `handoff ${name}`);
  return validated;
}

export function resolveIngressDirectory(ingressRoot: string, nonce: string): string {
  if (!noncePattern.test(nonce)) throw new Error('handoff_nonce must be exactly 32 lowercase hexadecimal characters.');
  const configuredRoot = path.resolve(ingressRoot);
  const rootStat = fs.lstatSync(configuredRoot, { throwIfNoEntry: false });
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('OPL_MANUAL_PREVIEW_INGRESS_ROOT must be a real directory.');
  }
  const realRoot = fs.realpathSync(configuredRoot);
  const candidate = path.join(realRoot, nonce);
  const candidateStat = fs.lstatSync(candidate, { throwIfNoEntry: false });
  if (!candidateStat?.isDirectory() || candidateStat.isSymbolicLink()) {
    throw new Error('The nonce handoff directory must be a real directory.');
  }
  const realCandidate = fs.realpathSync(candidate);
  if (path.dirname(realCandidate) !== realRoot) {
    throw new Error('The nonce handoff directory escapes the fixed ingress root.');
  }
  return realCandidate;
}

export function copyValidatedHandoff(validated: ValidatedHandoff, outputDir: string): ValidatedHandoff {
  const destination = path.resolve(outputDir);
  if (fs.existsSync(destination)) throw new Error(`Immutable ingress output already exists: ${destination}`);
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  const names = validated.operation === 'publish'
    ? validated.assets.map(({ name }) => name)
    : [manifestName, ...validated.evidence.map(({ name }) => name)];
  try {
    for (const name of names) {
      fs.copyFileSync(path.join(validated.root, name), path.join(destination, name), fs.constants.COPYFILE_EXCL);
    }
    return validateHandoffDirectory(destination, validated.operation, validated.manifestSha256);
  } catch (error) {
    fs.rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}

function remoteDigest(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.startsWith('sha256:') && digestRefPattern.test(value) ? value.slice(7) : null;
}

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

type CommandResult = { status: number | null; stdout: string; stderr: string; error?: Error };

function runGh(args: string[], allowFailure = false, timeoutMs = 30_000): CommandResult {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: githubCommandMaxBufferBytes,
    env: process.env,
  });
  const output = {
    status: result.status,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
    error: result.error,
  };
  if (!allowFailure && (result.error || result.status !== 0)) {
    throw new Error(`gh ${args.join(' ')} failed: ${result.error?.message ?? output.stderr.trim() ?? 'unknown error'}`);
  }
  return output;
}

function ghJson(
  args: string[],
  allowNotFound = false,
  executeGh: typeof runGh = runGh,
): JsonRecord | null {
  const result = executeGh(args, allowNotFound);
  if (result.status !== 0) {
    if (allowNotFound && /(?:HTTP\s+404|Not Found|status code 404)/i.test(result.stderr)) return null;
    throw new Error(`GitHub read failed: gh ${args.join(' ')}: ${result.stderr.trim()}`);
  }
  return record(JSON.parse(result.stdout) as unknown, 'GitHub response');
}

function ghPaginatedRecords(args: string[], executeGh: typeof runGh = runGh): JsonRecord[] {
  const result = executeGh(args);
  if (result.error || result.status !== 0) {
    throw new Error(`GitHub read failed: gh ${args.join(' ')}: ${result.error?.message ?? result.stderr.trim()}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(result.stdout) as unknown;
  } catch (error) {
    throw new Error(`GitHub paginated response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(value)) throw new Error('GitHub paginated response must be an array of pages.');
  const entries: JsonRecord[] = [];
  for (const page of value) {
    if (!Array.isArray(page)) throw new Error('GitHub paginated response page must be an array.');
    for (const entry of page) entries.push(record(entry, 'GitHub paginated release'));
  }
  return entries;
}

function normalizeRelease(value: JsonRecord): PreviewRelease {
  return {
    id: exactInteger(value.id, 'release.id'),
    tag_name: text(value.tag_name, 'release.tag_name'),
    target_commitish: typeof value.target_commitish === 'string' ? value.target_commitish : undefined,
    name: typeof value.name === 'string' ? value.name : '',
    body: typeof value.body === 'string' ? value.body : '',
    draft: value.draft === true,
    prerelease: value.prerelease === true,
    published_at: typeof value.published_at === 'string' ? value.published_at : null,
    assets: Array.isArray(value.assets)
      ? value.assets.map((entry: unknown) => {
          const asset = record(entry, 'release asset');
          return {
            id: exactInteger(asset.id, 'release asset id'),
            name: text(asset.name, 'release asset name'),
            size: exactInteger(asset.size, 'release asset size'),
            digest: typeof asset.digest === 'string' ? asset.digest : null,
          };
        })
      : [],
  };
}

function ghInput(payload: unknown): string {
  const tempRoot = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || process.cwd(), '.manual-preview-gh-'));
  const inputPath = path.join(tempRoot, 'input.json');
  fs.writeFileSync(inputPath, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
  return inputPath;
}

function withGhInput(payload: unknown, run: (inputPath: string) => void): void {
  const inputPath = ghInput(payload);
  try {
    run(inputPath);
  } finally {
    fs.rmSync(path.dirname(inputPath), { recursive: true, force: true });
  }
}

export class GhPreviewRemote implements PreviewRemote {
  readonly repo: string;
  private readonly executeGh: typeof runGh;

  constructor(repo: string, executeGh: typeof runGh = runGh) {
    if (repo !== releaseRepo) throw new Error(`Manual preview publisher is fixed to ${releaseRepo}.`);
    this.repo = repo;
    this.executeGh = executeGh;
  }

  inspectRelease(tag: string): PreviewRelease | null {
    assertPreviewTag(tag);
    const value = ghJson(['api', `repos/${this.repo}/releases/tags/${tag}`], true, this.executeGh);
    if (value) {
      const release = normalizeRelease(value);
      if (release.tag_name !== tag) throw new Error(`GitHub Release tag metadata conflicts with ${tag}.`);
      return release;
    }
    const matches = ghPaginatedRecords([
      'api',
      '--paginate',
      '--slurp',
      `repos/${this.repo}/releases?per_page=100`,
    ], this.executeGh).filter((entry) => text(entry.tag_name, 'release.tag_name') === tag);
    if (matches.length > 1) throw new Error(`GitHub release list contains multiple Releases for ${tag}.`);
    return matches.length === 1 ? normalizeRelease(matches[0]) : null;
  }

  inspectTag(tag: string): string | null {
    assertPreviewTag(tag);
    const value = ghJson(['api', `repos/${this.repo}/git/ref/tags/${tag}`], true, this.executeGh);
    if (!value) return null;
    return exactGitSha(record(value.object, 'tag ref object').sha, 'preview tag commit');
  }

  inspectLatestTag(): string | null {
    const value = ghJson(['api', `repos/${this.repo}/releases/latest`], true, this.executeGh);
    return value ? text(value.tag_name, 'Latest tag') : null;
  }

  createDraft(input: { tag: string; targetCommitish: string; name: string; body: string }): void {
    assertPreviewTag(input.tag);
    exactGitSha(input.targetCommitish, 'preview target commit');
    withGhInput({
      tag_name: input.tag,
      target_commitish: input.targetCommitish,
      name: input.name,
      body: input.body,
      draft: true,
      prerelease: true,
      make_latest: 'false',
    }, (inputPath) => {
      this.executeGh(['api', '--method', 'POST', `repos/${this.repo}/releases`, '--input', inputPath]);
    });
  }

  uploadAsset(releaseId: number, filePath: string, name: string): void {
    assertRegularFile(filePath, `preview asset ${name}`);
    this.executeGh([
      'api',
      '--method', 'POST',
      '-H', 'Content-Type: application/octet-stream',
      releaseAssetUploadUrl(this.repo, releaseId, name),
      '--input', filePath,
    ], false, largeAssetUploadTimeoutMs);
  }

  publishRelease(releaseId: number, name: string, body: string): void {
    exactInteger(releaseId, 'release id');
    withGhInput({ name, body, draft: false, prerelease: true, make_latest: 'false' }, (inputPath) => {
      this.executeGh(['api', '--method', 'PATCH', `repos/${this.repo}/releases/${releaseId}`, '--input', inputPath]);
    });
  }

  deleteRelease(releaseId: number): void {
    exactInteger(releaseId, 'release id');
    this.executeGh(['api', '--method', 'DELETE', `repos/${this.repo}/releases/${releaseId}`]);
  }

  deleteTag(tag: string): void {
    assertPreviewTag(tag);
    this.executeGh(['api', '--method', 'DELETE', `repos/${this.repo}/git/refs/tags/${tag}`]);
  }
}

export function releaseAssetUploadUrl(repo: string, releaseId: number, name: string): string {
  if (repo !== releaseRepo) throw new Error(`Manual preview publisher is fixed to ${releaseRepo}.`);
  exactInteger(releaseId, 'release id');
  if (!name || path.basename(name) !== name || name === '.' || name === '..') {
    throw new Error('Preview asset name is invalid.');
  }
  return `https://uploads.github.com/repos/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`;
}

function assertPreviewTag(tag: string): void {
  if (!previewTagPattern.test(tag) || tag.startsWith('v')) throw new Error('Remote mutation target is not a preview-only tag.');
}

export function verifyArtifactTransport(input: {
  operation: PreviewOperation;
  repo: string;
  artifactId: string;
  artifactName: string;
  artifactDigest: string;
  runId: string;
  now?: Date;
}, inspectArtifact: (repo: string, artifactId: string) => JsonRecord | null = (repo, artifactId) =>
  ghJson(['api', `repos/${repo}/actions/artifacts/${artifactId}`])): JsonRecord {
  if (input.repo !== releaseRepo) throw new Error(`Artifact transport is fixed to ${releaseRepo}.`);
  if (!/^[1-9][0-9]*$/.test(input.artifactId) || !/^[1-9][0-9]*$/.test(input.runId)) {
    throw new Error('Artifact and run ids must be positive decimal identifiers.');
  }
  if (input.artifactName !== `opl-manual-full-preview-${input.operation}-${input.runId}`) {
    throw new Error('Artifact name is not run-scoped to the Manual Full preview workflow.');
  }
  if (!digestPattern.test(input.artifactDigest)) {
    throw new Error('Artifact action output digest must be an exact lowercase SHA-256 digest.');
  }
  const artifactDigestRef = `sha256:${input.artifactDigest}`;
  const artifact = inspectArtifact(input.repo, input.artifactId);
  if (!artifact) throw new Error('Actions artifact is missing.');
  const workflowRun = record(artifact.workflow_run, 'artifact workflow_run');
  const expiresAt = Date.parse(text(artifact.expires_at, 'artifact expires_at'));
  const now = (input.now ?? new Date()).getTime();
  if (
    String(artifact.id) !== input.artifactId
    || artifact.name !== input.artifactName
    || String(workflowRun.id) !== input.runId
    || artifact.expired === true
    || !Number.isFinite(expiresAt)
    || expiresAt <= now
    || artifact.digest !== artifactDigestRef
  ) {
    throw new Error('Actions artifact identity, ownership, expiry, or digest readback is invalid.');
  }
  return {
    schema: 'opl_manual_full_preview_artifact_transport_receipt.v1',
    status: 'verified',
    repository: input.repo,
    run_id: input.runId,
    artifact_id: input.artifactId,
    artifact_name: input.artifactName,
    artifact_digest: artifactDigestRef,
    expires_at: artifact.expires_at,
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
