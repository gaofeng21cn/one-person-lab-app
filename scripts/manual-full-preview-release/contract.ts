import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type JsonRecord = Record<string, any>;
export type PreviewOperation = 'publish' | 'cleanup';

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

export const releaseRepo = 'gaofeng21cn/one-person-lab-app';
export const digestPattern = /^[0-9a-f]{64}$/;
export const digestRefPattern = /^sha256:[0-9a-f]{64}$/;
export const gitShaPattern = /^[0-9a-f]{40}$/;
export const versionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
export const noncePattern = /^[0-9a-f]{32}$/;
export const previewTagPattern = /^manual-full-preview-(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-m1-[0-9a-f]{12}$/;
export const manifestName = 'manual-full-preview-manifest.json';
export const largeAssetUploadTimeoutMs = 20 * 60_000;
export const githubCommandMaxBufferBytes = 32 * 1024 * 1024;
export const publishFixedNames = [
  'full-package-manifest.json',
  'manual-full-host-qa-receipt.json',
  'manual-full-m1-delivery-receipt.json',
  'manual-latest-build-receipt.json',
  'manual-latest-source-lock.json',
  'opl-release-manifest.json',
] as const;
export const cleanupEvidenceNames = [
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

export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
}

export function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

export function exactDigest(value: unknown, label: string): string {
  const digest = text(value, label);
  if (!digestPattern.test(digest)) throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  return digest;
}

export function exactGitSha(value: unknown, label: string): string {
  const sha = text(value, label);
  if (!gitShaPattern.test(sha)) throw new Error(`${label} must be an exact lowercase Git SHA.`);
  return sha;
}

export function exactVersion(value: unknown, label: string): string {
  const version = text(value, label);
  if (!versionPattern.test(version)) throw new Error(`${label} must be an exact CalVer display version.`);
  return version;
}

export function exactInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return Number(value);
}

export function readJson(filePath: string, label = path.basename(filePath)): JsonRecord {
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

export function assertExactKeys(value: JsonRecord, label: string, keys: string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} keys must be exactly ${expected.join(', ')}; got ${actual.join(', ')}.`);
  }
}

export function compareNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function assertRegularFile(filePath: string, label: string): fs.Stats {
  const stat = fs.lstatSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`${label} must be a non-empty regular file.`);
  }
  return stat;
}

export function declaredAssetIdentity(value: unknown, label: string): AssetIdentity {
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

export function assetIdentity(root: string, value: unknown, label: string): AssetIdentity {
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

export function exactAssetSet(root: string, values: unknown, label: string): AssetIdentity[] {
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

export function expectedDmgName(version: string): string {
  return `One-Person-Lab-Full-${version}-mac-arm64.dmg`;
}

export function requiredFormalStableAssetNames(version: string): string[] {
  return [
    `One-Person-Lab-${version}-mac-arm64.dmg`,
    `One-Person-Lab-${version}-mac-arm64.zip`,
    `One-Person-Lab-${version}-mac-arm64.zip.blockmap`,
    `One-Person-Lab-${version}-linux-x64.deb`,
    expectedDmgName(version),
    'latest-mac.yml',
    'latest-arm64-mac.yml',
    'opl-app-component-manifest.json',
    'opl-install.sh',
    'opl-release-manifest.json',
    'opl-release-attestation.json',
  ].sort();
}

export function findAsset(assets: AssetIdentity[], name: string, label: string): AssetIdentity {
  const asset = assets.find((entry) => entry.name === name);
  if (!asset) throw new Error(`${label} does not contain ${name}.`);
  return asset;
}

export function assertDigestBinding(value: unknown, expected: string, label: string): void {
  if (value !== expected) throw new Error(`${label} does not match the exact handoff bytes.`);
}

export function remoteDigest(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.startsWith('sha256:') && digestRefPattern.test(value) ? value.slice(7) : null;
}

export function assertPreviewTag(tag: string): void {
  if (!previewTagPattern.test(tag) || tag.startsWith('v')) throw new Error('Remote mutation target is not a preview-only tag.');
}
