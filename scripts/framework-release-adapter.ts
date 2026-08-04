#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  validateArtifactQualificationReceipt,
  type ArtifactQualificationReceiptV1,
} from './artifact-qualification-receipt.ts';
import { assertUpdaterVersionMatchesDisplay } from './release-version.ts';
import {
  assertReleaseOperationDeadline,
  releaseOperationDeadlineTimestamp,
  remainingReleaseOperationMilliseconds,
} from './release-operation-deadline.ts';
import { assertLatestPointerOperationAdmissionReceipt } from './validate-latest-pointer-operation.ts';
import { assertStandardLatestAdmissionReceipt } from './validate-standard-latest-admission.ts';
import { validateWebuiSourceAuthority } from './webui-source-authority.ts';
import { validateGithubImmutableReleaseCapabilityEvidence } from './stable-operation-control.ts';
import { validateStableOperationPublicationRecord } from './stable-operation-publication-record.ts';
import { assertImmutabilitySettingReceipt } from './github-release-immutability-setting.ts';

type JsonRecord = Record<string, any>;
type Track = 'standard' | 'full';
type StableReleaseOperation = 'standard' | 'resume_standard' | 'append_full';
type StandardPublicationChannel = 'stable' | 'nightly' | 'preview';
type GitHubApplyMode = 'rehearsal' | 'execute';
type AdapterOptionValues = Record<string, string | boolean | string[] | undefined>;
type GitHubMutationCommand =
  | 'github-apply'
  | 'github-activate-latest'
  | 'github-move-latest-pointer';
type GitHubMutation =
  | 'tag_reserve'
  | 'release_create'
  | 'asset_upload'
  | 'release_publish'
  | 'latest_patch';

const packageIds = [
  'mas',
  'mag',
  'rca',
  'oma',
  'obf',
  'mas-scholar-skills',
  'opl-flow',
] as const;
const aiNotesMarker = '<!-- OPL_RELEASE_NOTES_GENERATOR:online-ai -->';
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const canonicalStableRepository = 'gaofeng21cn/one-person-lab-app';
const staleIndependentFullGuidance =
  'Use a Full release when you need bundled runtime, Office, and document-intake payloads on a fresh machine.';
const sameStableFullAddonGuidance =
  'The Full DMG is appended later to this same Stable release for fresh-machine installation with bundled runtime, Office, and document-intake payloads.';
export const githubApplyRequiredOptionNames = [
  'bundle',
  'plan',
  'operation',
  'track',
  'run-attempt',
  'publication-channel',
  'operation-id',
  'attempt-id',
  'operation-started-at',
  'operation-deadline-at',
  'mutation-mode',
  'output',
] as const;
export const githubApplyFullRequiredOptionNames = [
  ...githubApplyRequiredOptionNames,
  'executor-app-sha',
  'standard-attestation',
] as const;
const appStandardIdentityMode = 'app_standard_compatibility';
const packageCompatibility = {
  abi: 'opl_packages.v1',
  version_range: '>=0.1.0 <1.0.0',
} as const;
const frozenBuildInputIds = [
  'app_source',
  'base_image',
  'codex_cli',
  'dockerfile',
  'framework_seed',
  'qualification_harness',
  'shell_webui_source',
] as const;

function readJson(filePath: string): JsonRecord {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected a regular JSON file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonRecord;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256Bytes(bytes: Buffer | string): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filePath: string): string {
  return sha256Bytes(fs.readFileSync(filePath));
}

export function projectPublicReleaseBody(markdown: string, releaseName: string): string {
  const lines = markdown.split(/\r?\n/);
  const firstVisibleLine = lines.findIndex((line) => line.trim().length > 0);
  const candidate = firstVisibleLine >= 0 ? lines[firstVisibleLine]!.trim() : '';
  if (candidate === releaseName || candidate === `# ${releaseName}`) {
    lines.splice(0, firstVisibleLine + 1);
    while (lines[0] !== undefined && lines[0]!.trim().length === 0) lines.shift();
  }
  return lines
    .join('\n')
    .replaceAll(staleIndependentFullGuidance, sameStableFullAddonGuidance);
}

function bundlePublicReleaseBody(bundle: JsonRecord): string {
  const releaseName = `One Person Lab v${bundle.release?.version}`;
  return projectPublicReleaseBody(String(bundle.prepared_notes?.markdown ?? ''), releaseName);
}

function regularFileBytes(filePath: string, label: string): Buffer {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`${label} must be a non-empty regular file: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function exactJson(left: unknown, right: unknown, label: string): void {
  if (canonicalJson(left) !== canonicalJson(right)) throw new Error(`${label} does not match the frozen Bundle.`);
}

function latestPointerInspectionIdentity(inspection: JsonRecord): JsonRecord {
  const release = inspection.release as JsonRecord | undefined;
  if (!release) return inspection;
  const { immutable: _immutable, ...pointerRelease } = release;
  return { ...inspection, release: pointerRelease };
}

function assertCanonicalBundleDigest(bundle: JsonRecord): void {
  const { bundle_digest: expectedDigest, ...core } = bundle;
  const actualDigest = digestRef(sha256Bytes(canonicalJson(core)));
  if (!digestPattern.test(String(expectedDigest ?? '')) || expectedDigest !== actualDigest) {
    throw new Error('Framework Bundle digest does not match its immutable canonical bytes.');
  }
}

function gitArchiveDescriptor(root: string, ref: string, id: string): JsonRecord {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-${id}-archive-`));
  const archivePath = path.join(tempRoot, 'source.tar');
  const archiveFd = fs.openSync(archivePath, 'w');
  try {
    const result = spawnSync('git', ['-C', root, 'archive', '--format=tar', ref], {
      stdio: ['ignore', archiveFd, 'pipe'],
    });
    if (result.status !== 0) {
      throw new Error(`Cannot materialize deterministic ${id} archive at ${ref}: ${String(result.stderr).trim()}`);
    }
    const bytes = regularFileBytes(archivePath, `${id} archive`);
    return { id, ref, digest: digestRef(sha256Bytes(bytes)), size_bytes: bytes.byteLength };
  } finally {
    fs.closeSync(archiveFd);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function gitFileBytes(root: string, ref: string, relativePath: string, label: string): Buffer {
  const normalized = relativePath.split(path.sep).join('/');
  if (!normalized || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new Error(`${label} path escapes its exact checkout: ${relativePath}`);
  }
  const result = spawnSync('git', ['-C', root, 'show', `${ref}:${normalized}`], {
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout) || result.stdout.byteLength === 0) {
    throw new Error(`Cannot read exact ${label} bytes at ${ref}:${normalized}: ${String(result.stderr).trim()}`);
  }
  return result.stdout;
}

function fileDescriptor(id: string, ref: string, bytes: Buffer): JsonRecord {
  return { id, ref, digest: digestRef(sha256Bytes(bytes)), size_bytes: bytes.byteLength };
}

function verifyCodexTarball(tarballPath: string, expectedVersion: string): Buffer {
  const bytes = regularFileBytes(tarballPath, 'Frozen Codex tarball');
  const listing = spawnSync('tar', ['-tzf', tarballPath], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (listing.status !== 0) throw new Error(`Frozen Codex tarball is unreadable: ${listing.stderr.trim()}`);
  const identities = listing.stdout
    .split(/\r?\n/)
    .map((entry) => entry.replace(/^\.\//, ''))
    .filter((entry) => entry === 'package/package.json');
  if (identities.length !== 1) throw new Error('Frozen Codex tarball must contain exactly one package/package.json.');
  const identity = spawnSync('tar', ['-xOzf', tarballPath, 'package/package.json'], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (identity.status !== 0) throw new Error(`Cannot read frozen Codex package identity: ${identity.stderr.trim()}`);
  const packageJson = JSON.parse(identity.stdout) as JsonRecord;
  if (packageJson.name !== '@openai/codex' || packageJson.version !== expectedVersion) {
    throw new Error('Frozen Codex tarball package identity does not match the exact Shell intake contract.');
  }
  return bytes;
}

function digestRef(digest: string): string {
  return digest.startsWith('sha256:') ? digest : `sha256:${digest}`;
}

function standardAttestationIdentity(filePath: string, bundle: JsonRecord): JsonRecord {
  const resolved = path.resolve(filePath);
  const bytes = regularFileBytes(resolved, 'Unified Standard release attestation');
  const attestation = JSON.parse(bytes.toString('utf8')) as JsonRecord;
  const payloadAssets = attestation.publication_record?.publication_intent?.payload_assets;
  if (
    attestation.schema !== 'opl_app_release_attestation.v1'
    || attestation.status !== 'passed'
    || attestation.release?.repository !== bundle.sources?.app?.repo
    || attestation.release?.tag !== bundle.release?.tag
    || attestation.release?.version !== bundle.release?.version
    || attestation.release?.bundle_digest !== bundle.bundle_digest
    || attestation.protection?.github_native_immutable !== false
    || attestation.protection?.retroactive_lock_claimed !== false
    || attestation.protection?.standard_asset_policy !== 'sealed_name_size_digest_set_no_overwrite_or_delete'
    || !Array.isArray(payloadAssets)
  ) {
    throw new Error('Unified Standard release attestation does not match the exact mutable Standard Bundle.');
  }
  const assets = payloadAssets.map((asset: JsonRecord) => ({
    name: String(asset?.name ?? ''),
    size_bytes: Number(asset?.size_bytes),
    sha256: String(asset?.digest ?? ''),
  }));
  assets.push({
    name: 'opl-release-attestation.json',
    size_bytes: bytes.byteLength,
    sha256: digestRef(sha256Bytes(bytes)),
  });
  const names = new Set<string>();
  for (const asset of assets) {
    if (
      !asset.name
      || names.has(asset.name)
      || !Number.isSafeInteger(asset.size_bytes)
      || asset.size_bytes <= 0
      || !digestPattern.test(asset.sha256)
    ) {
      throw new Error('Unified Standard release attestation has an invalid or duplicate sealed asset identity.');
    }
    names.add(asset.name);
  }
  return {
    path: resolved,
    name: 'opl-release-attestation.json',
    sha256: digestRef(sha256Bytes(bytes)),
    size_bytes: bytes.byteLength,
    sealed_standard_assets: assets.sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function fullManifestReleaseIdentity(
  uploadActions: JsonRecord[],
  standardAttestation: JsonRecord,
): JsonRecord {
  const manifestActions = uploadActions.filter((action) => action.name === 'opl-release-manifest.json');
  if (manifestActions.length !== 1) {
    throw new Error('Full publication requires exactly one opl-release-manifest.json upload action.');
  }
  const manifestAction = manifestActions[0];
  const manifestPath = path.resolve(String(manifestAction.source_path ?? ''));
  const manifestBytes = regularFileBytes(manifestPath, 'Full public manifest');
  const manifestSha256 = digestRef(sha256Bytes(manifestBytes));
  if (
    manifestAction.sha256 !== manifestSha256
    || manifestAction.size_bytes !== manifestBytes.byteLength
  ) {
    throw new Error('Full public manifest upload action does not match its exact bytes.');
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as JsonRecord;
  const version = String(manifest.release_version ?? '');
  const dmgName = `One-Person-Lab-Full-${version}-mac-arm64.dmg`;
  const carrierContext = manifest.carrier_context as JsonRecord | undefined;
  const targetStandard = carrierContext?.target_standard_release as JsonRecord | undefined;
  const releaseExecutor = carrierContext?.release_executor as JsonRecord | undefined;
  const fullContentSources = carrierContext?.full_content_sources as JsonRecord | undefined;
  const differences = carrierContext?.differences as JsonRecord | undefined;
  const manifestAssets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const manifestDmgAssets = manifestAssets.filter((asset: JsonRecord) => asset?.name === dmgName);
  const uploadDmgActions = uploadActions.filter((action) => action.name === dmgName);
  if (
    manifest.schema !== 'opl_public_release_manifest.v1'
    || manifest.package_kind !== 'opl_full_first_install_macos_arm64'
    || manifest.owner_authority !== 'one-person-lab-app'
    || manifest.version !== version
    || !/^[0-9]{2}\.[0-9]{1,2}\.[0-9]{1,2}(?:-r[1-9][0-9]*)?$/.test(version)
    || manifest.primary_install_asset !== dmgName
    || carrierContext?.publication_model !== 'same_tag_mutable_standard_addon'
    || !Number.isSafeInteger(targetStandard?.release_id)
    || Number(targetStandard?.release_id) <= 0
    || targetStandard?.tag !== `v${version}`
    || !/^[0-9a-f]{40}$/.test(String(targetStandard?.target_commitish ?? ''))
    || targetStandard?.immutable !== false
    || targetStandard?.full_asset_append_allowed !== true
    || targetStandard?.standard_asset_overwrite_or_delete_allowed !== false
    || carrierContext?.latest_modified !== false
    || carrierContext?.updater_metadata_modified !== false
    || carrierContext?.release_notes_modified !== false
    || carrierContext?.standard_attestation?.name !== standardAttestation.name
    || carrierContext?.standard_attestation?.sha256 !== standardAttestation.sha256
    || carrierContext?.standard_attestation?.size_bytes !== standardAttestation.size_bytes
    || !/^[0-9a-f]{40}$/.test(String(releaseExecutor?.app_sha ?? ''))
    || releaseExecutor?.notarizer_path !== 'scripts/notarize-macos-dmg.ts'
    || fullContentSources?.role !== 'observational_build_provenance_only'
    || fullContentSources?.may_gate_install_or_runtime !== false
    || !/^[0-9a-f]{40}$/.test(String(fullContentSources?.app_sha ?? ''))
    || !/^[0-9a-f]{40}$/.test(String(fullContentSources?.shell_sha ?? ''))
    || !/^[0-9a-f]{40}$/.test(String(fullContentSources?.framework_sha ?? ''))
    || differences?.executor_app_differs_from_full_content_app
      !== (releaseExecutor?.app_sha !== fullContentSources?.app_sha)
    || differences?.full_content_app_differs_from_target_standard
      !== (fullContentSources?.app_sha !== targetStandard?.target_commitish)
    || manifestDmgAssets.length !== 1
    || uploadDmgActions.length !== 1
    || uploadActions.length !== 2
  ) {
    throw new Error('Full public manifest does not define one canonical same-tag Full add-on identity.');
  }
  const manifestDmg = manifestDmgAssets[0] as JsonRecord;
  const uploadDmg = uploadDmgActions[0];
  if (
    manifestDmg.sha256 !== uploadDmg.sha256
    || manifestDmg.size_bytes !== uploadDmg.size_bytes
    || !digestPattern.test(String(uploadDmg.sha256 ?? ''))
    || !Number.isSafeInteger(uploadDmg.size_bytes)
    || Number(uploadDmg.size_bytes) <= 0
  ) {
    throw new Error('Full public manifest does not bind the exact uploaded Full DMG bytes.');
  }
  return {
    version,
    carrier_context: carrierContext,
    manifest: {
      name: 'opl-release-manifest.json',
      sha256: manifestSha256,
      size_bytes: manifestBytes.byteLength,
    },
    artifact: {
      name: dmgName,
      sha256: uploadDmg.sha256,
      size_bytes: uploadDmg.size_bytes,
    },
    standard_attestation: standardAttestation,
  };
}

export function fullAddonIdentity(
  bundle: JsonRecord,
  uploadActions: JsonRecord[],
  standardAttestationPath: string,
): JsonRecord {
  const standardAttestation = standardAttestationIdentity(standardAttestationPath, bundle);
  const releaseIdentity = fullManifestReleaseIdentity(uploadActions, standardAttestation);
  const repository = String(bundle.sources?.app?.repo ?? '');
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
  ) {
    throw new Error('Full add-on identity requires one canonical App release repository.');
  }
  const version = String(releaseIdentity.version);
  const carrierContext = releaseIdentity.carrier_context as JsonRecord;
  const targetStandard = carrierContext.target_standard_release as JsonRecord;
  const releaseExecutor = carrierContext.release_executor as JsonRecord;
  const fullContentSources = carrierContext.full_content_sources as JsonRecord;
  const differences = carrierContext.differences as JsonRecord;
  if (
    targetStandard.repository !== repository
    || targetStandard.tag !== bundle.release?.tag
  ) {
    throw new Error('Full add-on target Standard reference does not match the exact App repository and Bundle tag.');
  }
  return {
    schema: 'opl_app_same_tag_full_addon_identity.v1',
    kind: 'full_macos',
    tag: targetStandard.tag,
    release_version: version,
    manifest: releaseIdentity.manifest,
    artifact: releaseIdentity.artifact,
    standard_attestation: {
      name: standardAttestation.name,
      sha256: standardAttestation.sha256,
      size_bytes: standardAttestation.size_bytes,
    },
    sealed_standard_assets: standardAttestation.sealed_standard_assets,
    target_standard_release: targetStandard,
    release_executor: releaseExecutor,
    full_content_sources: fullContentSources,
    source_differences: differences,
  };
}

function gitSha(root: string): string {
  const result = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (result.status !== 0 || !/^[0-9a-f]{40}$/.test(result.stdout.trim())) {
    throw new Error(`Cannot resolve exact Git SHA for ${root}: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function requiredAssetNames(version: string, track: Track, channel = 'stable'): string[] {
  if (track === 'standard') {
    return [
        `One-Person-Lab-${version}-mac-arm64.dmg`,
        `One-Person-Lab-${version}-mac-arm64.zip`,
        `One-Person-Lab-${version}-mac-arm64.zip.blockmap`,
        ...(channel === 'stable' ? [] : [`One-Person-Lab-${version}-linux-x64.deb`]),
        'latest-arm64-mac.yml',
        'opl-app-component-manifest.json',
        'opl-install.sh',
      ];
  }
  return [`One-Person-Lab-Full-${version}-mac-arm64.dmg`, 'opl-release-manifest.json'];
}

function requireOption(values: AdapterOptionValues, key: string): string {
  const value = values[key];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing --${key}.`);
  return value.trim();
}

function requireBooleanOption(values: AdapterOptionValues, key: string): boolean {
  const value = requireOption(values, key);
  if (value !== 'true' && value !== 'false') throw new Error(`--${key} must be true or false.`);
  return value === 'true';
}

function parseCommon(argv: string[]) {
  return parseArgs({
    args: argv,
    options: {
      channel: { type: 'string' },
      version: { type: 'string' },
      'updater-version': { type: 'string' },
      'app-root': { type: 'string' },
      'shell-root': { type: 'string' },
      'framework-root': { type: 'string' },
      notes: { type: 'string' },
      'notes-evidence': { type: 'string' },
      'include-full-package': { type: 'string' },
      'package-compatibility-abi': { type: 'string' },
      'package-compatibility-version-range': { type: 'string' },
      'source-cutoff-observed-at': { type: 'string' },
      'base-image-index': { type: 'string' },
      'frozen-codex-tarball': { type: 'string' },
      'standard-identity': { type: 'string' },
      'source-authority': { type: 'string' },
      output: { type: 'string' },
      operation: { type: 'string' },
      'release-operation': { type: 'string' },
      'operation-id': { type: 'string' },
      executor: { type: 'string' },
      'attempt-id': { type: 'string' },
      'remote-target': { type: 'string' },
      'prior-attempt-id': { type: 'string' },
      'publication-scope': { type: 'string' },
      bundle: { type: 'string' },
      track: { type: 'string' },
      outcome: { type: 'string' },
      'assets-dir': { type: 'string' },
      inspection: { type: 'string' },
      'legacy-qualification': { type: 'string' },
      'hosted-core-qualification': { type: 'string' },
      status: { type: 'string' },
      repo: { type: 'string' },
      tag: { type: 'string' },
      name: { type: 'string' },
      plan: { type: 'string' },
      prerelease: { type: 'boolean' },
      'publication-channel': { type: 'string' },
      'mutation-mode': { type: 'string' },
      'executor-app-sha': { type: 'string' },
      'operation-started-at': { type: 'string' },
      'operation-deadline-at': { type: 'string' },
      'additional-upload-actions': { type: 'string' },
      'publication-record': { type: 'string' },
      'disabled-setting-receipt': { type: 'string' },
      'preflight-setting-receipt': { type: 'string' },
      'standard-attestation': { type: 'string' },
      'authority-run-id': { type: 'string' },
      'latest-admission': { type: 'string' },
      'pointer-admission': { type: 'string' },
      'component-manifest': { type: 'string' },
      'pointer-authority': { type: 'string' },
      'release-inspection': { type: 'string' },
      'expected-current-latest-tag': { type: 'string' },
      'run-attempt': { type: 'string' },
      'allow-same-tag-full-assets': { type: 'string' },
      'stable-framework-ref': { type: 'string' },
      'webui-recovery-authority-digest': { type: 'string' },
      'webui-recovery-stable-authority-run-id': { type: 'string' },
      'webui-recovery-failed-follower-run-id': { type: 'string' },
      'webui-recovery-failed-v1-run-id': { type: 'string' },
      'webui-recovery-failed-v2-run-id': { type: 'string' },
      'webui-recovery-failed-v3-run-id': { type: 'string' },
      'webui-recovery-failed-v4-run-id': { type: 'string' },
      'webui-recovery-executor-app-sha': { type: 'string' },
    },
    allowPositionals: true,
    strict: true,
  });
}

function frozenBaseImageDescriptor(indexPath: string): JsonRecord {
  const index = readJson(path.resolve(indexPath));
  const manifests = Array.isArray(index.manifests) ? index.manifests : [];
  const linuxAmd64 = manifests.filter((descriptor: JsonRecord) => (
    descriptor?.platform?.os === 'linux'
    && descriptor?.platform?.architecture === 'amd64'
    && (descriptor?.platform?.variant === undefined || descriptor.platform.variant === '')
  ));
  if (linuxAmd64.length !== 1) {
    throw new Error('Frozen node base index must contain exactly one linux/amd64 descriptor without a variant.');
  }
  const descriptor = linuxAmd64[0];
  if (!digestPattern.test(String(descriptor.digest ?? ''))
    || !Number.isSafeInteger(descriptor.size)
    || Number(descriptor.size) <= 0) {
    throw new Error('Frozen node base linux/amd64 descriptor has no exact digest and positive manifest size.');
  }
  return {
    id: 'base_image',
    ref: `docker.io/library/node@${descriptor.digest}`,
    digest: descriptor.digest,
    size_bytes: Number(descriptor.size),
  };
}

function frozenBuildInputs(input: {
  values: AdapterOptionValues;
  appRoot: string;
  appRef: string;
  shellRoot: string;
  shellRef: string;
  frameworkRoot: string;
  frameworkRef: string;
}): JsonRecord[] {
  const dockerfileRef = 'Dockerfile';
  const dockerfileBytes = gitFileBytes(input.shellRoot, input.shellRef, dockerfileRef, 'Shell Dockerfile');
  const dockerfile = dockerfileBytes.toString('utf8');
  if (!dockerfile.includes('FROM node:22-bookworm-slim')) {
    throw new Error('Exact Shell Dockerfile no longer contains FROM node:22-bookworm-slim.');
  }
  const intakeBytes = gitFileBytes(
    input.shellRoot,
    input.shellRef,
    'contracts/aionui-upstream-intake.json',
    'Shell upstream intake contract',
  );
  const intake = JSON.parse(intakeBytes.toString('utf8')) as JsonRecord;
  if (intake.managed_runtime?.codex_cli?.package !== '@openai/codex') {
    throw new Error('Shell intake contract does not bind @openai/codex.');
  }
  const codexVersion = String(intake.managed_runtime?.codex_cli?.version ?? '');
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(codexVersion)) {
    throw new Error('Shell intake contract does not bind an exact Codex version.');
  }
  const codexBytes = verifyCodexTarball(
    path.resolve(requireOption(input.values, 'frozen-codex-tarball')),
    codexVersion,
  );
  const qualificationHarnessRef = 'scripts/validate-webui-runtime-image.ts';
  const qualificationHarnessBytes = gitFileBytes(
    input.appRoot,
    input.appRef,
    qualificationHarnessRef,
    'WebUI qualification harness',
  );
  const descriptors = [
    gitArchiveDescriptor(input.appRoot, input.appRef, 'app_source'),
    frozenBaseImageDescriptor(requireOption(input.values, 'base-image-index')),
    fileDescriptor('codex_cli', `@openai/codex@${codexVersion}`, codexBytes),
    fileDescriptor('dockerfile', 'shells/aionui/Dockerfile', dockerfileBytes),
    gitArchiveDescriptor(input.frameworkRoot, input.frameworkRef, 'framework_seed'),
    fileDescriptor('qualification_harness', qualificationHarnessRef, qualificationHarnessBytes),
    gitArchiveDescriptor(input.shellRoot, input.shellRef, 'shell_webui_source'),
  ];
  const ids = descriptors.map((descriptor) => descriptor.id);
  if (ids.some((id, index) => id !== frozenBuildInputIds[index]) || new Set(ids).size !== ids.length) {
    throw new Error('Frozen WebUI build inputs are not the canonical exact-seven ordered set.');
  }
  for (const descriptor of descriptors) {
    if (typeof descriptor.ref !== 'string' || descriptor.ref.length === 0
      || !digestPattern.test(String(descriptor.digest ?? ''))
      || !Number.isSafeInteger(descriptor.size_bytes)
      || Number(descriptor.size_bytes) <= 0) {
      throw new Error(`Frozen WebUI build input ${descriptor.id} has no exact ref/digest/size identity.`);
    }
  }
  return descriptors;
}

function buildFreezeRequest(values: AdapterOptionValues): JsonRecord {
  const channel = requireOption(values, 'channel');
  if (channel !== 'stable' && channel !== 'nightly' && channel !== 'preview') {
    throw new Error('--channel must be stable, nightly, or preview.');
  }
  const publicationChannel = values['publication-channel'] ?? channel;
  if (publicationChannel !== channel) {
    throw new Error('Publication channel must match the Framework Bundle channel.');
  }
  const version = requireOption(values, 'version');
  const updaterVersion = requireOption(values, 'updater-version');
  assertUpdaterVersionMatchesDisplay(channel, version, updaterVersion);
  const appRoot = path.resolve(requireOption(values, 'app-root'));
  const shellRoot = path.resolve(requireOption(values, 'shell-root'));
  const frameworkRoot = path.resolve(requireOption(values, 'framework-root'));
  const notesPath = path.resolve(requireOption(values, 'notes'));
  const evidencePath = path.resolve(requireOption(values, 'notes-evidence'));
  const includeFullPackage = requireBooleanOption(values, 'include-full-package');
  if (channel !== 'stable' && includeFullPackage) {
    throw new Error('Only Stable publication may include Full Package inputs.');
  }
  if (
    requireOption(values, 'package-compatibility-abi') !== packageCompatibility.abi
    || requireOption(values, 'package-compatibility-version-range') !== packageCompatibility.version_range
  ) {
    throw new Error('App Standard Package compatibility must use the supported typed ABI and range.');
  }
  const preparedNotes = fs.readFileSync(notesPath, 'utf8');
  if (!preparedNotes.includes(aiNotesMarker)) {
    throw new Error('Prepared release notes are not bound to the online AI writer.');
  }
  const notesEvidence = readJson(evidencePath);
  if (notesEvidence.schema !== 'opl_app_release_notes_evidence.v1') {
    throw new Error('Prepared release notes evidence has an unsupported schema.');
  }
  const notesIdentityKeys = ['channel', 'version', 'current_tag'] as const;
  const presentNotesIdentityKeys = notesIdentityKeys.filter((key) => notesEvidence[key] !== undefined);
  if (presentNotesIdentityKeys.length === 0) {
    if (channel !== 'stable') {
      throw new Error('Non-Stable prepared notes require the complete exact publication identity.');
    }
  } else if (
    presentNotesIdentityKeys.length !== notesIdentityKeys.length
    || notesEvidence.channel !== channel
    || notesEvidence.version !== version
    || notesEvidence.current_tag !== `v${version}`
  ) {
    throw new Error('Prepared release notes evidence does not match the complete exact publication identity.');
  }
  if (notesEvidence.payload?.include_full_package !== false) {
    throw new Error(
      'App Standard prepared notes must not bind a future Full Package payload.',
    );
  }
  const appRef = gitSha(appRoot);
  const shellRef = gitSha(shellRoot);
  const frameworkRef = gitSha(frameworkRoot);
  if (
    notesEvidence.payload?.full_payload_authority_sha256 !== undefined
    && notesEvidence.payload?.full_payload_authority_sha256 !== null
  ) {
    throw new Error('App Standard prepared notes cannot bind a Full payload authority digest.');
  }
  return {
    surface_kind: 'opl_release_bundle_freeze_request.v1',
    schema_ref: 'contracts/opl-framework/release-bundle-freeze-request.schema.json',
    release: {
      channel,
      version,
      display_version: version,
      updater_version: updaterVersion,
      tag: `v${version}`,
      prerelease: channel === 'nightly',
    },
    sources: {
      app: { repo: 'gaofeng21cn/one-person-lab-app', source_commit: appRef },
      shell: { repo: 'gaofeng21cn/opl-aion-shell', source_commit: shellRef },
      framework: { repo: 'gaofeng21cn/one-person-lab', source_commit: frameworkRef },
    },
    identity_mode: appStandardIdentityMode,
    package_compatibility: packageCompatibility,
    prepared_notes: {
      source: 'prepared_ai',
      format: 'markdown',
      markdown: preparedNotes,
      evidence: notesEvidence,
    },
    tracks: {
      standard: {
        required_asset_names: requiredAssetNames(version, 'standard', channel),
        required_for_latest: true,
        additive_only: false,
        updater_metadata_allowed: true,
      },
      full: {
        required_asset_names: requiredAssetNames(version, 'full'),
        required_for_latest: false,
        additive_only: true,
        updater_metadata_allowed: false,
      },
    },
  };
}

function buildWebuiBuildInput(values: AdapterOptionValues): JsonRecord {
  if (values['source-authority'] !== undefined) {
    if (values['standard-identity'] !== undefined || values.bundle !== undefined) {
      throw new Error('Independent WebUI source authority cannot be combined with a Stable Bundle input.');
    }
    return buildWebuiBuildInputFromSourceAuthority(values);
  }
  if (values['standard-identity'] === undefined) {
    return buildWebuiBuildInputFromFrozenBundle(values);
  }
  const identity = readJson(path.resolve(requireOption(values, 'standard-identity')));
  if (identity.schema !== 'opl_standard_release_identity_receipt.v2' || identity.status !== 'passed') {
    throw new Error('WebUI carrier requires a passed Standard release identity receipt v2.');
  }
  if (
    identity.source?.repository !== 'gaofeng21cn/one-person-lab-app'
    || typeof identity.source?.run_id !== 'string'
    || !/^[1-9][0-9]*$/.test(identity.source.run_id)
    || identity.source?.run_attempt !== 1
  ) {
    throw new Error('Standard release identity does not bind one exact first-attempt App run.');
  }
  const release = identity.release;
  if (
    release?.channel !== 'stable'
    || typeof release.version !== 'string'
    || typeof release.updater_version !== 'string'
    || release.tag !== `v${release.version}`
    || !digestPattern.test(String(release.bundle_digest ?? ''))
  ) {
    throw new Error('Standard release identity has no exact Stable release identity.');
  }
  assertUpdaterVersionMatchesDisplay('stable', release.version, release.updater_version);
  const standardArtifacts = {
    updater_metadata: {
      identity: identity.updater_metadata,
      name: 'latest-arm64-mac.yml',
    },
    updater_zip: {
      identity: identity.updater_zip,
      name: `One-Person-Lab-${release.version}-mac-arm64.zip`,
    },
    component_manifest: {
      identity: identity.component_manifest,
      name: 'opl-app-component-manifest.json',
    },
  };
  for (const [name, artifact] of Object.entries(standardArtifacts)) {
    if (artifact.identity?.name !== artifact.name) {
      throw new Error(`Standard release identity ${name} has the wrong artifact name.`);
    }
    const digest = artifact.identity?.sha256;
    if (!digestPattern.test(String(digest ?? ''))) {
      throw new Error(`Standard release identity ${name} must bind an exact digest.`);
    }
  }
  const cohort = identity.cohort;
  for (const [name, value] of Object.entries({
    app_sha: cohort?.app_sha,
    shell_sha: cohort?.shell_sha,
    framework_sha: cohort?.framework_sha,
  })) {
    if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
      throw new Error(`Standard release identity ${name} must be an exact Git SHA.`);
    }
  }

  const bundle = readJson(path.resolve(requireOption(values, 'bundle')));
  assertCanonicalBundleDigest(bundle);
  if (
    bundle.surface_kind !== 'opl_release_bundle.v1'
    || bundle.bundle_digest !== release.bundle_digest
    || bundle.release?.channel !== 'stable'
    || bundle.release?.version !== release.version
    || bundle.release?.updater_version !== release.updater_version
    || bundle.release?.tag !== release.tag
    || bundle.release?.prerelease !== false
    || bundle.sources?.app?.repo !== 'gaofeng21cn/one-person-lab-app'
    || bundle.sources?.shell?.repo !== 'gaofeng21cn/opl-aion-shell'
    || bundle.sources?.framework?.repo !== 'gaofeng21cn/one-person-lab'
    || bundle.sources?.app?.source_commit !== cohort.app_sha
    || bundle.sources?.shell?.source_commit !== cohort.shell_sha
    || bundle.sources?.framework?.source_commit !== cohort.framework_sha
    || bundle.identity_mode !== appStandardIdentityMode
    || canonicalJson(bundle.package_compatibility) !== canonicalJson(packageCompatibility)
    || bundle.tracks?.standard?.required_for_latest !== true
    || bundle.tracks?.webui !== undefined
    || bundle.source_cutoff !== undefined
    || bundle.frozen_build_inputs !== undefined
    || bundle.policy?.latest_required_track !== 'standard'
    || bundle.policy?.latest_required_tracks !== undefined
  ) {
    throw new Error('Standard release identity does not reverse-bind one Desktop-only Framework Bundle.');
  }

  const appRoot = path.resolve(requireOption(values, 'app-root'));
  const shellRoot = path.resolve(requireOption(values, 'shell-root'));
  const frameworkRoot = path.resolve(requireOption(values, 'framework-root'));
  const recoveryKeys = [
    'stable-framework-ref',
    'webui-recovery-authority-digest',
    'webui-recovery-stable-authority-run-id',
    'webui-recovery-failed-follower-run-id',
    'webui-recovery-failed-v1-run-id',
    'webui-recovery-failed-v2-run-id',
    'webui-recovery-executor-app-sha',
  ] as const;
  const recoveryV3RunId = values['webui-recovery-failed-v3-run-id'];
  const recoveryV4RunId = values['webui-recovery-failed-v4-run-id'];
  const presentRecoveryKeys = recoveryKeys.filter((key) => values[key] !== undefined);
  if (
    (presentRecoveryKeys.length !== 0 && presentRecoveryKeys.length !== recoveryKeys.length)
    || (recoveryV3RunId !== undefined && presentRecoveryKeys.length !== recoveryKeys.length)
    || (recoveryV4RunId !== undefined && recoveryV3RunId === undefined)
  ) {
    throw new Error('WebUI production recovery authority requires every exact recovery binding.');
  }
  const recoveryFrameworkRef = gitSha(frameworkRoot);
  let cohortRef = release.bundle_digest;
  let admittedFrameworkRef = cohort.framework_sha;
  if (presentRecoveryKeys.length === recoveryKeys.length) {
    const stableFrameworkRef = requireOption(values, 'stable-framework-ref');
    const executorAppSha = requireOption(values, 'webui-recovery-executor-app-sha');
    const recoveryRunIds = {
      stable_authority_run_id: requireOption(values, 'webui-recovery-stable-authority-run-id'),
      failed_follower_run_id: requireOption(values, 'webui-recovery-failed-follower-run-id'),
      failed_recovery_v1_run_id: requireOption(values, 'webui-recovery-failed-v1-run-id'),
      failed_recovery_v2_run_id: requireOption(values, 'webui-recovery-failed-v2-run-id'),
      ...(recoveryV3RunId === undefined
        ? {}
        : { failed_recovery_v3_run_id: recoveryV3RunId }),
      ...(recoveryV4RunId === undefined
        ? {}
        : { failed_recovery_v4_run_id: recoveryV4RunId }),
    };
    if (
      stableFrameworkRef !== cohort.framework_sha
      || recoveryFrameworkRef === stableFrameworkRef
      || !/^[0-9a-f]{40}$/.test(recoveryFrameworkRef)
      || !/^[0-9a-f]{40}$/.test(executorAppSha)
      || Object.values(recoveryRunIds).some((runId) => !/^[1-9][0-9]*$/.test(runId))
    ) {
      throw new Error('WebUI production recovery source identity is invalid or does not bind the Stable cohort.');
    }
    const recoveryAuthorityCore = {
      schema: 'opl_app_webui_framework_recovery_authority.v1',
      status: 'admitted',
      stable_authority_run_id: recoveryRunIds.stable_authority_run_id,
      failed_follower_run_id: recoveryRunIds.failed_follower_run_id,
      failed_recovery_v1_run_id: recoveryRunIds.failed_recovery_v1_run_id,
      failed_recovery_v2_run_id: recoveryRunIds.failed_recovery_v2_run_id,
      ...(recoveryV3RunId === undefined
        ? {}
        : { failed_recovery_v3_run_id: recoveryV3RunId }),
      ...(recoveryV4RunId === undefined
        ? {}
        : { failed_recovery_v4_run_id: recoveryV4RunId }),
      release: {
        version: release.version,
        bundle_digest: release.bundle_digest,
      },
      stable_cohort: {
        app_sha: cohort.app_sha,
        shell_sha: cohort.shell_sha,
        framework_sha: stableFrameworkRef,
      },
      recovery_source: {
        executor_app_sha: executorAppSha,
        framework_sha: recoveryFrameworkRef,
      },
    };
    const expectedAuthorityDigest = digestRef(sha256Bytes(canonicalJson(recoveryAuthorityCore)));
    if (requireOption(values, 'webui-recovery-authority-digest') !== expectedAuthorityDigest) {
      throw new Error('WebUI production recovery authority digest does not bind the exact source transition.');
    }
    cohortRef = expectedAuthorityDigest;
    admittedFrameworkRef = recoveryFrameworkRef;
  }
  if (
    gitSha(appRoot) !== cohort.app_sha
    || gitSha(shellRoot) !== cohort.shell_sha
    || recoveryFrameworkRef !== admittedFrameworkRef
  ) {
    throw new Error('WebUI carrier source checkouts do not match the admitted Standard or recovery source authority.');
  }
  const observedAt = requireOption(values, 'source-cutoff-observed-at');
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(observedAt)
    || Number.isNaN(Date.parse(observedAt))
  ) {
    throw new Error('WebUI source cutoff observed_at must be a canonical UTC timestamp with milliseconds.');
  }
  return {
    schema: 'opl_app_webui_build_input.v1',
    release: {
      version: release.version,
      bundle_digest: release.bundle_digest,
      cohort_ref: cohortRef,
    },
    source_cutoff: {
      observed_at: observedAt,
      policy: 'single_read_at_freeze_admission',
      frozen_base_release_set: null,
      post_freeze_remote_refresh_allowed: false,
      later_authority_advancement_invalidates_bundle: false,
    },
    cohort: {
      app_sha: cohort.app_sha,
      shell_sha: cohort.shell_sha,
      framework_sha: admittedFrameworkRef,
    },
    platform: { os: 'linux', architecture: 'amd64' },
    inputs: frozenBuildInputs({
      values,
      appRoot,
      appRef: cohort.app_sha,
      shellRoot,
      shellRef: cohort.shell_sha,
      frameworkRoot,
      frameworkRef: admittedFrameworkRef,
    }),
  };
}

function buildWebuiBuildInputFromSourceAuthority(values: AdapterOptionValues): JsonRecord {
  const authority = validateWebuiSourceAuthority(
    readJson(path.resolve(requireOption(values, 'source-authority'))),
  );
  const appRoot = path.resolve(requireOption(values, 'app-root'));
  const shellRoot = path.resolve(requireOption(values, 'shell-root'));
  const frameworkRoot = path.resolve(requireOption(values, 'framework-root'));
  const cohort = {
    app_sha: authority.sources.app.source_commit,
    shell_sha: authority.sources.shell.source_commit,
    framework_sha: authority.sources.framework.source_commit,
  };
  if (
    gitSha(appRoot) !== cohort.app_sha
    || gitSha(shellRoot) !== cohort.shell_sha
    || gitSha(frameworkRoot) !== cohort.framework_sha
  ) {
    throw new Error('Independent WebUI source checkouts do not match the source authority.');
  }
  const observedAt = requireOption(values, 'source-cutoff-observed-at');
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(observedAt)
    || Number.isNaN(Date.parse(observedAt))
  ) {
    throw new Error('WebUI source cutoff observed_at must be a canonical UTC timestamp with milliseconds.');
  }
  const sourceAuthorityDigest = authority.source_authority_digest;
  return {
    schema: 'opl_app_webui_build_input.v1',
    release: {
      version: authority.release.version,
      bundle_digest: sourceAuthorityDigest,
      cohort_ref: sourceAuthorityDigest,
    },
    source_cutoff: {
      observed_at: observedAt,
      policy: 'single_read_at_freeze_admission',
      frozen_base_release_set: null,
      post_freeze_remote_refresh_allowed: false,
      later_authority_advancement_invalidates_bundle: false,
    },
    cohort,
    platform: { os: 'linux', architecture: 'amd64' },
    inputs: frozenBuildInputs({
      values,
      appRoot,
      appRef: cohort.app_sha,
      shellRoot,
      shellRef: cohort.shell_sha,
      frameworkRoot,
      frameworkRef: cohort.framework_sha,
    }),
  };
}

function buildWebuiBuildInputFromFrozenBundle(values: AdapterOptionValues): JsonRecord {
  const bundle = readJson(path.resolve(requireOption(values, 'bundle')));
  assertCanonicalBundleDigest(bundle);
  if (
    bundle.surface_kind !== 'opl_release_bundle.v1'
    || bundle.release?.channel !== 'stable'
    || typeof bundle.release?.version !== 'string'
    || typeof bundle.release?.updater_version !== 'string'
    || bundle.release?.tag !== `v${bundle.release.version}`
    || bundle.release?.prerelease !== false
    || bundle.sources?.app?.repo !== 'gaofeng21cn/one-person-lab-app'
    || bundle.sources?.shell?.repo !== 'gaofeng21cn/opl-aion-shell'
    || bundle.sources?.framework?.repo !== 'gaofeng21cn/one-person-lab'
    || bundle.identity_mode !== appStandardIdentityMode
    || canonicalJson(bundle.package_compatibility) !== canonicalJson(packageCompatibility)
    || bundle.tracks?.standard?.required_for_latest !== true
    || bundle.tracks?.webui !== undefined
    || bundle.source_cutoff !== undefined
    || bundle.frozen_build_inputs !== undefined
    || bundle.policy?.latest_required_track !== 'standard'
    || bundle.policy?.latest_required_tracks !== undefined
  ) {
    throw new Error('WebUI development carrier requires one exact Desktop-only Stable Framework Bundle.');
  }
  assertUpdaterVersionMatchesDisplay(
    'stable',
    bundle.release.version,
    bundle.release.updater_version,
  );
  const cohort = {
    app_sha: bundle.sources.app.source_commit,
    shell_sha: bundle.sources.shell.source_commit,
    framework_sha: bundle.sources.framework.source_commit,
  };
  for (const [name, value] of Object.entries(cohort)) {
    if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
      throw new Error(`Frozen WebUI Bundle ${name} must be an exact Git SHA.`);
    }
  }
  const appRoot = path.resolve(requireOption(values, 'app-root'));
  const shellRoot = path.resolve(requireOption(values, 'shell-root'));
  const frameworkRoot = path.resolve(requireOption(values, 'framework-root'));
  if (
    gitSha(appRoot) !== cohort.app_sha
    || gitSha(shellRoot) !== cohort.shell_sha
    || gitSha(frameworkRoot) !== cohort.framework_sha
  ) {
    throw new Error('WebUI carrier source checkouts do not match the frozen Framework Bundle.');
  }
  const observedAt = requireOption(values, 'source-cutoff-observed-at');
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(observedAt)
    || Number.isNaN(Date.parse(observedAt))
  ) {
    throw new Error('WebUI source cutoff observed_at must be a canonical UTC timestamp with milliseconds.');
  }
  return {
    schema: 'opl_app_webui_build_input.v1',
    release: {
      version: bundle.release.version,
      bundle_digest: bundle.bundle_digest,
      cohort_ref: bundle.bundle_digest,
    },
    source_cutoff: {
      observed_at: observedAt,
      policy: 'single_read_at_freeze_admission',
      frozen_base_release_set: null,
      post_freeze_remote_refresh_allowed: false,
      later_authority_advancement_invalidates_bundle: false,
    },
    cohort,
    platform: { os: 'linux', architecture: 'amd64' },
    inputs: frozenBuildInputs({
      values,
      appRoot,
      appRef: cohort.app_sha,
      shellRoot,
      shellRef: cohort.shell_sha,
      frameworkRoot,
      frameworkRef: cohort.framework_sha,
    }),
  };
}

function qualificationCohort(bundle: JsonRecord): JsonRecord {
  const sources = {
    app_sha: bundle.sources.app.source_commit,
    shell_sha: bundle.sources.shell.source_commit,
    framework_sha: bundle.sources.framework.source_commit,
  };
  if (bundle.identity_mode === appStandardIdentityMode) {
    exactJson(
      bundle.package_compatibility,
      packageCompatibility,
      'App Standard Package compatibility',
    );
    return {
      ...sources,
      identity_mode: appStandardIdentityMode,
      package_compatibility: packageCompatibility,
    };
  }
  return {
    ...sources,
    framework_release_set_digest: bundle.framework_release_set.digest,
    package_payload_manifest_sha256: Object.fromEntries(
      packageIds.map((packageId) => [packageId, bundle.packages[packageId].payload_manifest_sha256]),
    ),
  };
}

function bundleDocument(bundlePath: string): JsonRecord {
  const bundle = readJson(path.resolve(bundlePath));
  if (bundle.surface_kind !== 'opl_release_bundle.v1' || typeof bundle.bundle_digest !== 'string') {
    throw new Error('Bundle must be an opl_release_bundle.v1 document.');
  }
  return bundle;
}

export function buildExecutorReceipt(values: AdapterOptionValues): JsonRecord {
  const operation = requireOption(values, 'operation');
  const releaseOperation = requireOption(values, 'release-operation') as StableReleaseOperation;
  const operationId = requireOption(values, 'operation-id');
  const executor = requireOption(values, 'executor');
  const attemptId = requireOption(values, 'attempt-id');
  const remoteTarget = requireOption(values, 'remote-target');
  const priorAttemptId = typeof values['prior-attempt-id'] === 'string'
    ? requireOption(values, 'prior-attempt-id')
    : null;
  const track = requireOption(values, 'track') as Track;
  const outcome = requireOption(values, 'outcome');
  if (operation !== 'build' && operation !== 'remote_inspect') throw new Error('Invalid executor operation.');
  if (!['standard', 'resume_standard', 'append_full'].includes(releaseOperation)) {
    throw new Error('Invalid release operation.');
  }
  if (executor !== 'local' && executor !== 'remote') throw new Error('Invalid executor.');
  if (track !== 'standard' && track !== 'full') throw new Error('Invalid track.');
  if (outcome !== 'complete' && outcome !== 'unknown') throw new Error('Invalid outcome.');
  if (
    (track === 'standard' && releaseOperation === 'append_full')
    || (track === 'full' && releaseOperation !== 'append_full')
  ) {
    throw new Error('Release operation does not match the executor receipt track.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(operationId)) {
    throw new Error('--operation-id is not canonical.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(attemptId)) {
    throw new Error('--attempt-id is not canonical.');
  }
  if (priorAttemptId !== null && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(priorAttemptId)) {
    throw new Error('--prior-attempt-id is not canonical.');
  }
  if (!/^[a-z][a-z0-9+.-]{0,31}:[A-Za-z0-9][A-Za-z0-9._~:/?#@!$&'()*+,;=%-]*$/.test(remoteTarget)) {
    throw new Error('--remote-target is not canonical.');
  }
  const publicationScope = values['publication-scope'];
  if (operation === 'build' && publicationScope !== undefined) {
    throw new Error('Build executor receipts must not carry --publication-scope.');
  }
  if (
    operation === 'remote_inspect'
    && publicationScope !== 'track_assets'
    && publicationScope !== 'external_target'
  ) {
    throw new Error('Remote inspection requires --publication-scope track_assets or external_target.');
  }
  const bundle = bundleDocument(requireOption(values, 'bundle'));
  const requiredNames = bundle.tracks?.[track]?.required_asset_names;
  if (!Array.isArray(requiredNames) || requiredNames.some((name) => typeof name !== 'string')) {
    throw new Error(`Bundle ${track} track has no closed required_asset_names.`);
  }
  let assets: JsonRecord[] = [];
  if (outcome === 'complete' && operation === 'build') {
    const root = path.resolve(requireOption(values, 'assets-dir'));
    assets = requiredNames.map((name: string) => {
      const filePath = path.join(root, name);
      const stat = fs.lstatSync(filePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
        throw new Error(`Invalid ${track} asset: ${filePath}`);
      }
      return { name, size_bytes: stat.size, sha256: digestRef(sha256File(filePath)), path: filePath };
    });
  } else if (
    outcome === 'complete'
    && operation === 'remote_inspect'
    && publicationScope === 'track_assets'
  ) {
    const inspection = readJson(path.resolve(requireOption(values, 'inspection')));
    if (inspection.release?.exists === false) {
      if (!Array.isArray(inspection.assets) || inspection.assets.length !== 0) {
        throw new Error(`Remote ${track} absent-release inspection must contain an empty asset list.`);
      }
    } else if (inspection.release?.exists === true) {
      const inspectedAssets = Array.isArray(inspection.assets) ? inspection.assets : [];
      const allowSameTagFullAssets = values['allow-same-tag-full-assets'];
      if (allowSameTagFullAssets !== undefined && allowSameTagFullAssets !== 'true') {
        throw new Error('--allow-same-tag-full-assets only accepts true when explicitly admitted.');
      }
      if (
        allowSameTagFullAssets === 'true'
        && (
          track !== 'standard'
          || releaseOperation !== 'resume_standard'
          || bundle.release?.channel !== 'stable'
          || bundle.release?.tag !== `v${bundle.release?.version}`
          || !Array.isArray(bundle.tracks?.full?.required_asset_names)
          || bundle.tracks.full.required_asset_names.length !== 2
          || bundle.tracks.full.required_asset_names.some((name: unknown) => typeof name !== 'string')
        )
      ) {
        throw new Error(
          'Same-tag Full asset admission requires one Stable resume_standard inspection with a closed Full asset set.',
        );
      }
      const permittedCarrierNames = track === 'full'
        ? (bundle.tracks?.standard?.required_asset_names ?? [])
        : allowSameTagFullAssets === 'true'
          ? bundle.tracks.full.required_asset_names
          : [];
      // The attestation seals the payload set, so it is generated after the Bundle
      // and cannot recursively appear in required_asset_names.
      const permittedEvidenceNames = bundle.release?.channel === 'stable'
        ? ['opl-release-attestation.json']
        : [];
      const allowedNameSet = new Set([
        ...requiredNames,
        ...permittedCarrierNames,
        ...permittedEvidenceNames,
      ]);
      const remoteAssets = new Map<string, JsonRecord>();
      for (const inspectedAsset of inspectedAssets) {
        const asset = inspectedAsset as JsonRecord;
        const name = typeof asset?.name === 'string' ? asset.name : '';
        if (!allowedNameSet.has(name)) {
          throw new Error(`Remote ${track} inspection contains unknown asset ${name || '<missing>'}.`);
        }
        if (remoteAssets.has(name)) {
          throw new Error(`Remote ${track} inspection contains duplicate asset ${name}.`);
        }
        if (!Number.isSafeInteger(asset.size_bytes) || Number(asset.size_bytes) <= 0
          || !digestPattern.test(String(asset.sha256 ?? ''))) {
          throw new Error(`Remote ${track} asset ${name} has no exact digest and positive size.`);
        }
        remoteAssets.set(name, asset);
      }
      assets = requiredNames
        .filter((name: string) => remoteAssets.has(name))
        .map((name: string) => {
          const asset = remoteAssets.get(name) as JsonRecord;
          return { name, size_bytes: asset.size_bytes, sha256: asset.sha256 };
        });
    } else {
      throw new Error(`Remote ${track} inspection has no definitive Release existence state.`);
    }
  }
  return {
    surface_kind: 'opl_release_bundle_executor_receipt.v1',
    schema_ref: 'contracts/opl-framework/release-bundle-executor-receipt.schema.json',
    operation,
    executor,
    attempt_id: attemptId,
    bundle_digest: bundle.bundle_digest,
    track,
    outcome,
    release_operation: releaseOperation,
    operation_id: operationId,
    remote_target: remoteTarget,
    prior_attempt_id: priorAttemptId,
    ...(operation === 'remote_inspect' ? { publication_scope: publicationScope } : {}),
    assets,
  };
}

function buildQualificationReceipt(values: AdapterOptionValues): JsonRecord {
  const bundle = bundleDocument(requireOption(values, 'bundle'));
  const track = requireOption(values, 'track') as Track;
  if (track !== 'standard' && track !== 'full') throw new Error('--track must be standard or full.');
  const legacyQualification = values['legacy-qualification'];
  const hostedCoreQualification = values['hosted-core-qualification'];
  if (Boolean(legacyQualification) === Boolean(hostedCoreQualification)) {
    throw new Error('Pass exactly one of --legacy-qualification or --hosted-core-qualification.');
  }
  if (hostedCoreQualification) {
    if (track !== 'full') throw new Error('--hosted-core-qualification supports only the Full track.');
    const hostedPath = path.resolve(hostedCoreQualification);
    const hosted = readJson(hostedPath);
    const subjectName = String(hosted.subject?.asset_name ?? '');
    const sizeBytes = Number(hosted.subject?.size_bytes);
    const artifactSha256 = String(hosted.subject?.sha256 ?? '');
    const requiredNames = bundle.tracks?.full?.required_asset_names;
    const verification = hosted.verification ?? {};
    if (
      hosted.schema !== 'opl_app_hosted_full_core_qualification.v1'
      || hosted.status !== 'passed'
      || hosted.execution?.execution_class !== 'github_hosted'
      || hosted.execution?.runner !== 'macos-14'
      || hosted.execution?.run_attempt !== 1
      || !/^[1-9][0-9]*$/.test(String(hosted.execution?.run_id ?? ''))
      || hosted.release?.version !== bundle.release.version
      || !Array.isArray(requiredNames)
      || !requiredNames.includes(subjectName)
      || !Number.isSafeInteger(sizeBytes)
      || sizeBytes <= 0
      || !digestPattern.test(artifactSha256)
      || hosted.manifest?.asset_name !== 'opl-release-manifest.json'
      || !digestPattern.test(String(hosted.manifest?.sha256 ?? ''))
      || verification.dmg_verified !== true
      || verification.read_only_mount !== true
      || verification.exact_single_app !== true
      || verification.codesign !== true
      || verification.stapler !== true
      || verification.gatekeeper !== true
      || verification.manifest_bound !== true
      || verification.full_runtime_native_trust !== true
      || typeof hosted.evidence_ref !== 'string'
      || hosted.evidence_ref.trim() === ''
    ) {
      throw new Error('Hosted Full core qualification does not bind the exact Full artifact and macOS trust evidence.');
    }
    return {
      surface_kind: 'opl_release_bundle_qualification_receipt.v1',
      schema_ref: 'contracts/opl-framework/release-bundle-qualification-receipt.schema.json',
      bundle_digest: bundle.bundle_digest,
      track,
      subject: {
        asset_name: subjectName,
        size_bytes: sizeBytes,
        sha256: artifactSha256,
      },
      cohort: qualificationCohort(bundle),
      qualification: {
        kind: 'installed_artifact',
        result: 'passed',
        installed_artifact_same_bytes: true,
        harness_sha256: digestRef(sha256File(hostedPath)),
        evidence_refs: [hosted.evidence_ref],
      },
    };
  }
  const legacyPath = path.resolve(String(legacyQualification));
  const legacy = readJson(legacyPath) as ArtifactQualificationReceiptV1;
  const packageProfile = track;
  const artifactSha256 = String(legacy.artifact?.sha256 ?? '').replace(/^sha256:/, '');
  const validationErrors = validateArtifactQualificationReceipt(legacy, {
    stableSessionId: bundle.bundle_digest,
    releaseCohortRef: bundle.bundle_digest,
    version: bundle.release.version,
    packageProfile,
    result: 'passed',
    artifactSha256,
    appSha: bundle.sources.app.source_commit,
    shellSha: bundle.sources.shell.source_commit,
    frameworkSha: bundle.sources.framework.source_commit,
  });
  if (validationErrors.length > 0) {
    throw new Error(`Legacy qualification receipt does not bind this Bundle: ${validationErrors.join('; ')}`);
  }
  const requiredNames = bundle.tracks?.[track]?.required_asset_names;
  const subjectName = String(legacy.artifact?.name ?? '');
  if (!Array.isArray(requiredNames) || !requiredNames.includes(subjectName)) {
    throw new Error(`Qualified artifact ${subjectName || '<missing>'} is not a required ${track} Bundle asset.`);
  }
  const sizeBytes = Number(legacy.artifact?.size_bytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error('Legacy qualification receipt has no positive artifact size.');
  }
  const harnessSha256 = legacy.verification_harness?.smoke_harness_sha256
    ?? legacy.build_manifest?.smoke_harness_sha256;
  const evidenceRef = legacy.qualification?.evidence_ref;
  if (typeof harnessSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(harnessSha256)) {
    throw new Error('Legacy qualification receipt has no valid smoke harness digest.');
  }
  if (typeof evidenceRef !== 'string' || evidenceRef.trim() === '') {
    throw new Error('Legacy qualification receipt has no durable evidence ref.');
  }
  return {
    surface_kind: 'opl_release_bundle_qualification_receipt.v1',
    schema_ref: 'contracts/opl-framework/release-bundle-qualification-receipt.schema.json',
    bundle_digest: bundle.bundle_digest,
    track,
    subject: {
      asset_name: subjectName,
      size_bytes: sizeBytes,
      sha256: digestRef(artifactSha256),
    },
    cohort: qualificationCohort(bundle),
    qualification: {
      kind: 'installed_artifact',
      result: 'passed',
      installed_artifact_same_bytes: true,
      harness_sha256: digestRef(harnessSha256),
      evidence_refs: [evidenceRef],
    },
  };
}

const githubReadTimeoutMs = 30_000;
const githubMutationTimeoutMs = 10 * 60_000;
const acceptedTagReadbackDelaysMs = [0, 500, 1_500] as const;
const immutabilitySettingReadbackDelaysMs = [0, 500, 1_500] as const;

export interface GitHubCommandResult {
  status: number | null;
  signal?: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export interface GitHubCommandOptions {
  input?: string;
  timeout: number;
  killSignal: NodeJS.Signals;
}

export interface GitHubAdapterRuntime {
  run(command: string, args: string[], options: GitHubCommandOptions): GitHubCommandResult;
  now(): number;
  wait?(milliseconds: number): void;
  onMutationAttempt?(evidence: JsonRecord): void;
  readTimeoutMs?: number;
  mutationTimeoutMs?: number;
}

export function githubCommandEnvironment(
  command: string,
  args: string[],
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const endpoint = args[0] === 'api' && typeof args[1] === 'string' ? args[1] : '';
  const adminToken = baseEnvironment.OPL_GITHUB_RELEASE_ADMIN_TOKEN?.trim();
  if (
    command === 'gh'
    && args[0] === 'api'
    && /^repos\/[^/]+\/[^/]+\/immutable-releases$/.test(endpoint)
    && !args.includes('--method')
    && adminToken
  ) {
    return { ...baseEnvironment, GH_TOKEN: adminToken };
  }
  return baseEnvironment;
}

const defaultGitHubRuntime: GitHubAdapterRuntime = {
  run(command, args, options) {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      input: options.input,
      env: githubCommandEnvironment(command, args),
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
  wait(milliseconds) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  },
};

function commandEvidence(
  args: string[],
  input: string | undefined,
  result: GitHubCommandResult | undefined,
  timeoutMs: number,
): JsonRecord {
  const errorCode = (result?.error as NodeJS.ErrnoException | undefined)?.code;
  return {
    input_digest: digestRef(sha256Bytes(JSON.stringify({
      command: 'gh',
      args,
      input_sha256: input === undefined ? null : digestRef(sha256Bytes(input)),
    }))),
    timeout_ms: timeoutMs,
    exit_status: result?.status ?? null,
    signal: result?.signal ?? null,
    timed_out: errorCode === 'ETIMEDOUT',
    error_code: errorCode ?? null,
    error_message: result?.error?.message ?? null,
    stdout: result?.stdout ?? '',
    stderr: result?.stderr ?? '',
  };
}

class GitHubReadError extends Error {
  readonly evidence: JsonRecord;

  constructor(message: string, evidence: JsonRecord) {
    super(message);
    this.name = 'GitHubReadError';
    this.evidence = evidence;
  }
}

export class GitHubMutationFailure extends Error {
  readonly result: JsonRecord;

  constructor(message: string, result: JsonRecord) {
    super(message);
    this.name = 'GitHubMutationFailure';
    this.result = result;
  }
}

function githubMutationFailure(
  command: GitHubMutationCommand,
  values: AdapterOptionValues,
  failureTaxonomy: string,
  message: string,
  details: JsonRecord = {},
  commandFailure?: JsonRecord,
  retryDisposition = 'fail_closed_no_github_call',
): GitHubMutationFailure {
  const inputEvidence = {
    command,
    operation: values.operation ?? null,
    operation_id: values['operation-id'] ?? null,
    attempt_id: values['attempt-id'] ?? null,
    track: values.track ?? null,
    run_attempt: values['run-attempt'] ?? null,
    bundle: values.bundle ?? null,
    plan: values.plan ?? null,
    status: values.status ?? null,
    latest_admission: values['latest-admission'] ?? null,
    operation_started_at: values['operation-started-at'] ?? null,
    operation_deadline_at: values['operation-deadline-at'] ?? null,
  };
  const stdout = typeof commandFailure?.stdout === 'string' ? commandFailure.stdout : '';
  const commandStderr = typeof commandFailure?.stderr === 'string' ? commandFailure.stderr.trim() : '';
  return new GitHubMutationFailure(message, {
    surface_kind: 'opl_app_github_mutation_result.v1',
    status: 'failed',
    retry_disposition: retryDisposition,
    failure: {
      schema: 'opl_release_mutation_failure_receipt.v1',
      failure_taxonomy: failureTaxonomy,
      mutation: command,
      input_digest: digestRef(sha256Bytes(JSON.stringify(inputEvidence))),
      stdout,
      stderr: commandStderr ? `${commandStderr}\n${message}` : message,
      ...details,
    },
  });
}

function rejectGitHubMutation(
  command: GitHubMutationCommand,
  values: AdapterOptionValues,
  failureTaxonomy: string,
  message: string,
  details: JsonRecord = {},
  retryDisposition?: string,
): never {
  throw githubMutationFailure(
    command,
    values,
    failureTaxonomy,
    message,
    details,
    undefined,
    retryDisposition,
  );
}

function persistGitHubMutationFailure(
  command: GitHubMutationCommand,
  values: AdapterOptionValues,
  result: JsonRecord,
): void {
  const evidenceRoot = path.resolve(
    process.env.RUNNER_TEMP?.trim() || process.env.TMPDIR?.trim() || '/tmp',
    'opl-release-mutation-failure',
    command,
  );
  writeJson(path.join(evidenceRoot, 'failure.json'), result);
  fs.writeFileSync(path.join(evidenceRoot, 'input-digest.txt'), `${String(result.failure.input_digest)}\n`);
  fs.writeFileSync(path.join(evidenceRoot, 'stdout.txt'), String(result.failure.stdout ?? ''));
  fs.writeFileSync(path.join(evidenceRoot, 'stderr.txt'), String(result.failure.stderr ?? ''));
  if (typeof values.output === 'string' && values.output.trim()) {
    writeJson(path.resolve(values.output), result);
  }
}

function assertStableGitHubMutationAdmission(
  command: 'github-apply' | 'github-activate-latest',
  values: AdapterOptionValues,
  requiredTrack?: Track,
): {
  operation: StableReleaseOperation;
  operationId: string;
  operationStartedAt: string;
  attemptId: string;
  track: Track;
} {
  const runAttempt = values['run-attempt'];
  if (runAttempt !== '1') {
    rejectGitHubMutation(
      command,
      values,
      'github_mutation_run_attempt_rejected',
      'GitHub mutation requires --run-attempt 1.',
    );
  }
  const operation = values.operation;
  if (operation !== 'standard' && operation !== 'resume_standard' && operation !== 'append_full') {
    rejectGitHubMutation(
      command,
      values,
      'github_mutation_operation_rejected',
      'GitHub mutation requires --operation standard, resume_standard, or append_full.',
    );
  }
  const track = values.track;
  if (track !== 'standard' && track !== 'full') {
    rejectGitHubMutation(
      command,
      values,
      'github_mutation_track_rejected',
      'GitHub mutation requires --track standard or full.',
    );
  }
  if (
    (track === 'standard' && operation === 'append_full')
    || (track === 'full' && operation !== 'append_full')
    || (requiredTrack !== undefined && track !== requiredTrack)
  ) {
    rejectGitHubMutation(
      command,
      values,
      'github_mutation_operation_track_mismatch',
      `${command} rejects operation ${operation} for track ${track}.`,
      { operation, track, required_track: requiredTrack ?? null },
    );
  }
  const operationId = values['operation-id'];
  if (typeof operationId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(operationId)) {
    rejectGitHubMutation(
      command,
      values,
      'github_mutation_operation_id_rejected',
      'GitHub mutation requires one canonical --operation-id.',
    );
  }
  const attemptId = values['attempt-id'];
  if (typeof attemptId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(attemptId)) {
    rejectGitHubMutation(
      command,
      values,
      'github_mutation_attempt_id_rejected',
      'GitHub mutation requires one canonical --attempt-id.',
    );
  }
  const operationStartedAt = values['operation-started-at'];
  if (typeof operationStartedAt !== 'string' || !operationStartedAt.trim()) {
    rejectGitHubMutation(
      command,
      values,
      'github_mutation_operation_start_rejected',
      'GitHub mutation requires the immutable --operation-started-at.',
    );
  }
  return { operation, operationId, operationStartedAt, attemptId, track };
}

function standardPublicationChannel(
  command: 'github-apply' | 'github-activate-latest',
  values: AdapterOptionValues,
  bundle: JsonRecord,
): StandardPublicationChannel {
  const requested = values['publication-channel'];
  if (requested !== 'stable' && requested !== 'nightly' && requested !== 'preview') {
    rejectGitHubMutation(
      command,
      values,
      'github_mutation_publication_channel_rejected',
      'Missing --publication-channel or invalid value; expected stable, nightly, or preview.',
    );
  }
  const publicationChannel = requested as StandardPublicationChannel;
  const expectedPrerelease = publicationChannel === 'nightly';
  if (
    bundle.release?.channel !== publicationChannel
    || bundle.release?.prerelease !== expectedPrerelease
  ) {
    rejectGitHubMutation(
      command,
      values,
      'github_mutation_publication_bundle_mismatch',
      `Publication channel ${publicationChannel} requires a ${publicationChannel} Bundle with prerelease=${expectedPrerelease}.`,
      { publication_channel: publicationChannel },
    );
  }
  return publicationChannel;
}

function githubApplyMode(values: AdapterOptionValues): GitHubApplyMode {
  const mode = values['mutation-mode'];
  if (mode !== 'rehearsal' && mode !== 'execute') {
    rejectGitHubMutation(
      'github-apply',
      values,
      'github_mutation_mode_rejected',
      'Missing --mutation-mode or invalid value; expected rehearsal or execute.',
    );
  }
  return mode as GitHubApplyMode;
}

function publicationTagTargetCommitish(
  values: AdapterOptionValues,
  bundle: JsonRecord,
  fullAddon: JsonRecord | null,
): string {
  const bundleAppSource = String(bundle.sources?.app?.source_commit ?? '');
  if (!/^[0-9a-f]{40}$/.test(bundleAppSource)) {
    throw new Error('Framework Bundle App source commit is not an exact lowercase SHA.');
  }
  if (!fullAddon) return bundleAppSource;

  const executorAppSha = requireOption(values, 'executor-app-sha');
  const manifestExecutorAppSha = String(fullAddon.release_executor?.app_sha ?? '');
  if (!/^[0-9a-f]{40}$/.test(executorAppSha) || executorAppSha !== manifestExecutorAppSha) {
    rejectGitHubMutation(
      'github-apply',
      values,
      'github_full_executor_identity_rejected',
      'Full publication executor SHA must match the exact release executor recorded by the Full manifest.',
      {
        executor_app_sha: executorAppSha,
        manifest_executor_app_sha: manifestExecutorAppSha || null,
      },
    );
  }
  return String(fullAddon.target_standard_release?.target_commitish ?? '');
}

function ghRead(
  args: string[],
  runtime: GitHubAdapterRuntime,
  options: { allow404?: boolean } = {},
): JsonRecord | string | null {
  const timeoutMs = runtime.readTimeoutMs ?? githubReadTimeoutMs;
  const result = runtime.run('gh', args, { timeout: timeoutMs, killSignal: 'SIGTERM' });
  if (result.status !== 0 || result.error) {
    if (options.allow404 && !result.error && /HTTP 404|Not Found/i.test(`${result.stderr}\n${result.stdout}`)) {
      return null;
    }
    const evidence = commandEvidence(args, undefined, result, timeoutMs);
    throw new GitHubReadError(
      `gh ${args.join(' ')} read failed: ${result.stderr.trim() || result.stdout.trim() || result.error?.message || 'unknown error'}`,
      evidence,
    );
  }
  const output = result.stdout.trim();
  if (!output) return '';
  try {
    return JSON.parse(output) as JsonRecord;
  } catch {
    return output;
  }
}

function readDisabledImmutabilitySetting(
  repo: string,
  operationDeadlineAt: string,
  runtime: GitHubAdapterRuntime,
): JsonRecord | string | null {
  const attempts: JsonRecord[] = [];
  for (const delayMs of immutabilitySettingReadbackDelaysMs) {
    if (delayMs > 0) {
      const remainingMs = remainingReleaseOperationMilliseconds({
        deadlineAt: operationDeadlineAt,
        nowMs: runtime.now(),
      });
      if (remainingMs <= delayMs) break;
      runtime.wait?.(delayMs);
    }
    try {
      return ghRead([
        'api',
        `repos/${repo}/immutable-releases`,
        '-H',
        'X-GitHub-Api-Version: 2026-03-10',
      ], runtime);
    } catch (error) {
      if (!(error instanceof GitHubReadError)) throw error;
      attempts.push(error.evidence);
    }
  }
  throw new GitHubReadError(
    'Repository immutability disabled-state readback exhausted its bounded attempts.',
    {
      schema: 'opl_app_github_read_failure_evidence.v1',
      endpoint: `repos/${repo}/immutable-releases`,
      attempt_count: attempts.length,
      attempts,
    },
  );
}

export function inspectRelease(
  repo: string,
  tag: string,
  runtime: GitHubAdapterRuntime = defaultGitHubRuntime,
): JsonRecord {
  const release = ghRead(
    ['api', `repos/${repo}/releases/tags/${tag}`],
    runtime,
    { allow404: true },
  ) as JsonRecord | null;
  if (!release) {
    const hiddenRelease = ghRead(
      ['release', 'view', tag, '--repo', repo, '--json', 'databaseId,tagName'],
      runtime,
      { allow404: true },
    ) as JsonRecord | null;
    if (hiddenRelease) {
      if (
        !Number.isSafeInteger(hiddenRelease.databaseId)
        || Number(hiddenRelease.databaseId) <= 0
        || hiddenRelease.tagName !== tag
      ) {
        throw new Error(`GitHub Release discovery identity conflicts with ${tag}.`);
      }
      return inspectReleaseById(repo, tag, Number(hiddenRelease.databaseId), runtime);
    }
    return {
      surface_kind: 'opl_app_github_release_inspection.v1',
      repository: repo,
      tag,
      release: { exists: false },
      assets: [],
    };
  }
  const assets = (Array.isArray(release.assets) ? release.assets : []).map((asset: JsonRecord) => {
    const digest = typeof asset.digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(asset.digest)
      ? asset.digest
      : null;
    if (!digest) throw new Error(`GitHub asset ${asset.name} has no authoritative SHA-256 digest.`);
    return { name: asset.name, size_bytes: asset.size, sha256: digest };
  });
  return {
    surface_kind: 'opl_app_github_release_inspection.v1',
    repository: repo,
    tag,
    release: {
      exists: true,
      id: release.id,
      name: release.name,
      draft: release.draft,
      prerelease: release.prerelease,
      target_commitish: release.target_commitish,
      body_sha256: sha256Bytes(String(release.body ?? '')),
      immutable: release.immutable === true,
    },
    assets,
  };
}

function inspectReleaseById(
  repo: string,
  tag: string,
  releaseId: number,
  runtime: GitHubAdapterRuntime,
): JsonRecord {
  if (!Number.isSafeInteger(releaseId) || releaseId <= 0) {
    throw new Error(`GitHub Release ${tag} has an invalid numeric identity.`);
  }
  const release = ghRead(
    ['api', `repos/${repo}/releases/${releaseId}`],
    runtime,
    { allow404: true },
  ) as JsonRecord | null;
  if (!release) {
    return {
      surface_kind: 'opl_app_github_release_inspection.v1',
      repository: repo,
      tag,
      release: { exists: false, id: releaseId },
      assets: [],
    };
  }
  if (release.id !== releaseId || release.tag_name !== tag) {
    throw new Error(`GitHub Release ${releaseId} identity conflicts with ${tag}.`);
  }
  const assets = (Array.isArray(release.assets) ? release.assets : []).map((asset: JsonRecord) => {
    const digest = typeof asset.digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(asset.digest)
      ? asset.digest
      : null;
    if (!digest) throw new Error(`GitHub asset ${asset.name} has no authoritative SHA-256 digest.`);
    return { name: asset.name, size_bytes: asset.size, sha256: digest };
  });
  return {
    surface_kind: 'opl_app_github_release_inspection.v1',
    repository: repo,
    tag,
    release: {
      exists: true,
      id: release.id,
      name: release.name,
      draft: release.draft,
      prerelease: release.prerelease,
      target_commitish: release.target_commitish,
      body_sha256: sha256Bytes(String(release.body ?? '')),
      immutable: release.immutable === true,
    },
    assets,
  };
}

function assertImmutableReleasesEnabled(
  values: AdapterOptionValues,
  repo: string,
  runtime: GitHubAdapterRuntime,
  bundle: JsonRecord,
  admission: { operationId: string; track: Track },
  actions: JsonRecord[],
): void {
  const publicationRecordPath = values['publication-record'];
  if (typeof publicationRecordPath === 'string' && publicationRecordPath.trim()) {
    try {
      if (bundle.release?.channel !== 'stable') {
        throw new Error('A Stable publication record cannot authorize a non-Stable carrier.');
      }
      const publicationRecord = validateStableOperationPublicationRecord(
        readJson(path.resolve(publicationRecordPath)),
      );
      const authority = publicationRecord.operation.authority;
      if (
        publicationRecord.publication_target.repository !== repo
        || publicationRecord.publication_target.tag !== bundle.release?.tag
        || authority.cohort.app_sha !== bundle.sources?.app?.source_commit
        || authority.cohort.shell_sha !== bundle.sources?.shell?.source_commit
        || authority.cohort.framework_sha !== bundle.sources?.framework?.source_commit
      ) {
        throw new Error('Publication record repository, base tag, or cohort does not match the exact Bundle.');
      }
      const sourceGateEvidence = publicationRecord.operation.pre_dispatch_evidence.source_gate;
      const sourceGate = JSON.parse(
        Buffer.from(sourceGateEvidence.bytes_base64, 'base64').toString('utf8'),
      ) as JsonRecord;
      const capability = validateGithubImmutableReleaseCapabilityEvidence(
        sourceGate.immutable_release_capability,
        repo,
      );
      if (capability.checked_at !== sourceGate.generated_at) {
        throw new Error('Immutable release capability time does not match the bound source gate.');
      }
      if (admission.track === 'standard') {
        // Stable authority and Framework Bundle publication are distinct operation domains.
        const authorityRunId = values['authority-run-id'];
        if (
          typeof authorityRunId !== 'string'
          || !/^[1-9][0-9]*$/.test(authorityRunId)
          || publicationRecord.operation.run_bound_control.run_id !== authorityRunId
        ) {
          throw new Error('Publication record authority run does not match the admitted Stable source run.');
        }
        const recordBytes = regularFileBytes(
          path.resolve(publicationRecordPath),
          'Stable operation publication record',
        );
        if (canonicalJson(JSON.parse(recordBytes.toString('utf8'))) !== canonicalJson(publicationRecord)) {
          throw new Error('Durable publication record file does not match the validated internal evidence.');
        }
        const expectedPayload = publicationRecord.publication_intent.payload_assets
          .map((asset) => ({
            name: asset.name,
            digest: asset.digest,
            size_bytes: asset.size_bytes,
          }))
          .sort((left, right) => left.name.localeCompare(right.name));
        const actualPayload = actions
          .filter((action) => action.name !== 'opl-release-attestation.json')
          .map((action) => ({
            name: String(action.name),
            digest: String(action.sha256),
            size_bytes: Number(action.size_bytes),
          }))
          .sort((left, right) => left.name.localeCompare(right.name));
        if (canonicalJson(actualPayload) !== canonicalJson(expectedPayload)) {
          throw new Error('Publication record payload assets do not match the exact Standard publish plan.');
        }
      }
      return;
    } catch (error) {
      rejectGitHubMutation(
        'github-apply',
        values,
        'github_immutable_releases_evidence_invalid',
        'Bound GitHub immutable Releases capability evidence is invalid.',
        {
          repository: repo,
          publication_record: publicationRecordPath,
          validation_error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }
  if (bundle.release?.channel === 'stable' && repo === canonicalStableRepository) {
    rejectGitHubMutation(
      'github-apply',
      values,
      'github_immutable_releases_evidence_invalid',
      'Canonical Stable publication requires the source-gate-bound immutable Releases capability record.',
      { repository: repo, publication_record: null },
    );
  }
  let capability: JsonRecord | string | null;
  try {
    capability = ghRead([
      'api',
      `repos/${repo}/immutable-releases`,
      '-H',
      'X-GitHub-Api-Version: 2026-03-10',
    ], runtime);
  } catch (error) {
    rejectGitHubMutation(
      'github-apply',
      values,
      'github_immutable_releases_capability_unavailable',
      'GitHub immutable Releases capability could not be verified before publication.',
      {
        repository: repo,
        read_failure: error instanceof GitHubReadError
          ? error.evidence
          : { error_message: error instanceof Error ? error.message : String(error) },
      },
    );
  }
  if (
    capability === null
    || typeof capability !== 'object'
    || capability.enabled !== true
  ) {
    rejectGitHubMutation(
      'github-apply',
      values,
      'github_immutable_releases_disabled',
      'GitHub immutable Releases must be enabled before creating or publishing a release carrier.',
      {
        repository: repo,
        enabled: typeof capability === 'object' && capability !== null
          ? capability.enabled ?? null
          : null,
        enforced_by_owner: typeof capability === 'object' && capability !== null
          ? capability.enforced_by_owner ?? null
          : null,
      },
    );
  }
}

function assertCanonicalMutableStandardWindow(
  values: AdapterOptionValues,
  repo: string,
  runtime: GitHubAdapterRuntime,
  bundle: JsonRecord,
  admission: { operationId: string; track: Track },
  actions: JsonRecord[],
): void {
  assertImmutableReleasesEnabled(values, repo, runtime, bundle, admission, actions);
  const attestationActions = actions.filter((action) => action.name === 'opl-release-attestation.json');
  if (attestationActions.length !== 1) {
    rejectGitHubMutation(
      'github-apply',
      values,
      'github_standard_attestation_missing',
      'Canonical Stable publication requires exactly one unified public attestation.',
    );
  }
  const attestationIdentity = standardAttestationIdentity(
    String(attestationActions[0]!.source_path),
    bundle,
  );
  if (
    attestationActions[0]!.sha256 !== attestationIdentity.sha256
    || attestationActions[0]!.size_bytes !== attestationIdentity.size_bytes
  ) {
    rejectGitHubMutation(
      'github-apply',
      values,
      'github_standard_attestation_mismatch',
      'Unified public attestation upload action does not match its exact bytes.',
    );
  }
  let receipt: JsonRecord;
  try {
    const preflight = readJson(path.resolve(requireOption(values, 'preflight-setting-receipt')));
    receipt = assertImmutabilitySettingReceipt(
      readJson(path.resolve(requireOption(values, 'disabled-setting-receipt'))),
      'disabled',
      preflight,
    );
  } catch (error) {
    rejectGitHubMutation(
      'github-apply',
      values,
      'github_immutability_disabled_receipt_invalid',
      'Canonical Stable publication requires the exact disabled-setting receipt.',
      { validation_error: error instanceof Error ? error.message : String(error) },
    );
  }
  if (receipt.repository !== repo || receipt.setting?.enabled !== false) {
    rejectGitHubMutation(
      'github-apply',
      values,
      'github_immutability_disabled_receipt_invalid',
      'Disabled-setting receipt does not bind the canonical Stable repository.',
      { repository: repo, receipt_repository: receipt.repository ?? null },
    );
  }
  let setting: JsonRecord | string | null;
  try {
    setting = readDisabledImmutabilitySetting(
      repo,
      requireOption(values, 'operation-deadline-at'),
      runtime,
    );
  } catch (error) {
    rejectGitHubMutation(
      'github-apply',
      values,
      'github_immutability_disabled_readback_unavailable',
      'Repository immutability disabled-state readback failed before Standard publication.',
      {
        read_failure: error instanceof GitHubReadError
          ? error.evidence
          : { error_message: error instanceof Error ? error.message : String(error) },
      },
    );
  }
  if (
    !setting
    || typeof setting !== 'object'
    || setting.enabled !== false
    || setting.enforced_by_owner !== false
  ) {
    rejectGitHubMutation(
      'github-apply',
      values,
      'github_immutability_disabled_readback_mismatch',
      'Repository immutability must read back disabled and not owner-enforced before Standard publication.',
      { observed_setting: setting ?? null },
    );
  }
}

function inspectReleaseForReconcile(repo: string, tag: string, runtime: GitHubAdapterRuntime): JsonRecord {
  try {
    return { status: 'complete', observation: inspectRelease(repo, tag, runtime) };
  } catch (error) {
    return {
      status: 'inspect_failed',
      failure: error instanceof GitHubReadError
        ? error.evidence
        : { error_message: error instanceof Error ? error.message : String(error) },
    };
  }
}

function inspectReleaseTagRef(repo: string, tag: string, runtime: GitHubAdapterRuntime): JsonRecord {
  const expectedRef = `refs/tags/${tag}`;
  const observed = ghRead(
    ['api', `repos/${repo}/git/ref/tags/${tag}`],
    runtime,
    { allow404: true },
  ) as JsonRecord | null;
  if (!observed) {
    return {
      surface_kind: 'opl_app_github_release_tag_reservation.v1',
      repository: repo,
      tag,
      ref: expectedRef,
      exists: false,
      target_commitish: null,
    };
  }
  if (
    observed.ref !== expectedRef
    || observed.object?.type !== 'commit'
    || typeof observed.object?.sha !== 'string'
    || !/^[0-9a-f]{40}$/.test(observed.object.sha)
  ) {
    throw new Error(`GitHub tag reservation identity conflicts with ${expectedRef}.`);
  }
  return {
    surface_kind: 'opl_app_github_release_tag_reservation.v1',
    repository: repo,
    tag,
    ref: expectedRef,
    exists: true,
    target_commitish: observed.object.sha,
  };
}

function inspectReleaseTagRefForReconcile(
  repo: string,
  tag: string,
  runtime: GitHubAdapterRuntime,
): JsonRecord {
  try {
    return { status: 'complete', observation: inspectReleaseTagRef(repo, tag, runtime) };
  } catch (error) {
    return {
      status: 'inspect_failed',
      failure: error instanceof GitHubReadError
        ? error.evidence
        : { error_message: error instanceof Error ? error.message : String(error) },
    };
  }
}

function reconcileAcceptedTagReservation(input: {
  repo: string;
  tag: string;
  operationDeadlineAt: string;
  runtime: GitHubAdapterRuntime;
}): JsonRecord {
  let reconciliation: JsonRecord = {
    status: 'inspect_failed',
    failure: { error_message: 'Tag reservation readback did not run.' },
  };
  for (const delayMs of acceptedTagReadbackDelaysMs) {
    if (delayMs > 0) {
      const remainingMs = remainingReleaseOperationMilliseconds({
        deadlineAt: input.operationDeadlineAt,
        nowMs: input.runtime.now(),
      });
      if (remainingMs <= delayMs) break;
      input.runtime.wait?.(delayMs);
    }
    reconciliation = inspectReleaseTagRefForReconcile(
      input.repo,
      input.tag,
      input.runtime,
    );
    if (
      reconciliation.status === 'complete'
      && reconciliation.observation.exists === true
    ) {
      return reconciliation;
    }
  }
  return reconciliation;
}

function inspectReleaseByIdForReconcile(
  repo: string,
  tag: string,
  releaseId: number,
  runtime: GitHubAdapterRuntime,
): JsonRecord {
  try {
    return { status: 'complete', observation: inspectReleaseById(repo, tag, releaseId, runtime) };
  } catch (error) {
    return {
      status: 'inspect_failed',
      failure: error instanceof GitHubReadError
        ? error.evidence
        : { error_message: error instanceof Error ? error.message : String(error) },
    };
  }
}

function inspectLatestForReconcile(repo: string, runtime: GitHubAdapterRuntime): JsonRecord {
  try {
    const latest = ghRead(['api', `repos/${repo}/releases/latest`], runtime, { allow404: true });
    return { status: 'complete', observation: latest };
  } catch (error) {
    return {
      status: 'inspect_failed',
      failure: error instanceof GitHubReadError
        ? error.evidence
        : { error_message: error instanceof Error ? error.message : String(error) },
    };
  }
}

type GitHubMutationAttempt =
  | { status: 'accepted'; evidence: JsonRecord }
  | { status: 'deadline_elapsed' | 'outcome_unknown'; failure: JsonRecord };

function mutationAttemptId(
  baseAttemptId: string,
  mutation: GitHubMutation,
  remoteTarget: string,
  subject: string,
): string {
  return `gha:${sha256Bytes(JSON.stringify({
    base_attempt_id: baseAttemptId,
    mutation,
    remote_target: remoteTarget,
    subject,
  })).slice(0, 48)}`;
}

function runGitHubMutation(input: {
  mutation: GitHubMutation;
  attemptId: string;
  remoteTarget: string;
  args: string[];
  body?: string;
  operationDeadlineAt: string;
  runtime: GitHubAdapterRuntime;
}): GitHubMutationAttempt {
  const remainingMs = remainingReleaseOperationMilliseconds({
    deadlineAt: input.operationDeadlineAt,
    nowMs: input.runtime.now(),
  });
  if (remainingMs <= 0) {
    return {
      status: 'deadline_elapsed',
      failure: {
        failure_taxonomy: 'github_mutation_deadline_elapsed',
        mutation: input.mutation,
        mutation_attempt_id: input.attemptId,
        remote_target: input.remoteTarget,
        operation_deadline_at: input.operationDeadlineAt,
        ...commandEvidence(input.args, input.body, undefined, 0),
      },
    };
  }
  const timeoutMs = Math.max(1, Math.min(Math.floor(remainingMs), input.runtime.mutationTimeoutMs ?? githubMutationTimeoutMs));
  const result = input.runtime.run('gh', input.args, {
    input: input.body,
    timeout: timeoutMs,
    killSignal: 'SIGTERM',
  });
  const evidence: JsonRecord = {
    mutation_attempt_id: input.attemptId,
    remote_target: input.remoteTarget,
    ...commandEvidence(input.args, input.body, result, timeoutMs),
  };
  input.runtime.onMutationAttempt?.(evidence);
  if (result.status !== 0 || result.error) {
    return {
      status: 'outcome_unknown',
      failure: {
        failure_taxonomy: evidence.timed_out
          ? 'github_mutation_timeout'
          : 'github_mutation_outcome_unknown',
        mutation: input.mutation,
        operation_deadline_at: input.operationDeadlineAt,
        ...evidence,
      },
    };
  }
  return { status: 'accepted', evidence };
}

function stoppedMutation(input: {
  attempt: Exclude<GitHubMutationAttempt, { status: 'accepted' }>;
  repo: string;
  tag: string;
  uploaded?: string[];
  unresolvedAsset?: string;
  reconciliation: JsonRecord;
}): JsonRecord {
  return {
    surface_kind: 'opl_app_github_mutation_result.v1',
    status: input.attempt.status,
    repository: input.repo,
    tag: input.tag,
    uploaded: input.uploaded ?? [],
    unresolved_asset: input.unresolvedAsset ?? null,
    mutation_attempt_id: input.attempt.failure.mutation_attempt_id ?? null,
    remote_target: input.attempt.failure.remote_target ?? null,
    retry_disposition: 'read_only_reconcile_only',
    failure: input.attempt.failure,
    reconciliation: input.reconciliation,
  };
}

function unknownAfterAcceptedMutation(input: {
  mutation: string;
  operationDeadlineAt: string;
  attemptEvidence: JsonRecord;
  repo: string;
  tag: string;
  uploaded?: string[];
  unresolvedAsset?: string;
  reconciliation: JsonRecord;
  reason: string;
}): JsonRecord {
  return {
    surface_kind: 'opl_app_github_mutation_result.v1',
    status: 'outcome_unknown',
    repository: input.repo,
    tag: input.tag,
    uploaded: input.uploaded ?? [],
    unresolved_asset: input.unresolvedAsset ?? null,
    mutation_attempt_id: input.attemptEvidence.mutation_attempt_id ?? null,
    remote_target: input.attemptEvidence.remote_target ?? null,
    retry_disposition: 'read_only_reconcile_only',
    failure: {
      failure_taxonomy: 'github_mutation_readback_unknown',
      mutation: input.mutation,
      operation_deadline_at: input.operationDeadlineAt,
      reason: input.reason,
      mutation_attempt: input.attemptEvidence,
    },
    reconciliation: input.reconciliation,
  };
}

function assertReleaseIdentity(inspection: JsonRecord, options: {
  tag: string;
  name: string;
  notes: string;
  targetCommitish: string;
  prerelease: boolean;
  draft: boolean;
}): void {
  const release = inspection.release;
  if (
    release.name !== options.name
    || release.prerelease !== options.prerelease
    || release.draft !== options.draft
    || release.target_commitish !== options.targetCommitish
  ) {
    throw new Error(`Existing ${options.tag} Release identity conflicts with the Bundle.`);
  }
  if (release.body_sha256 !== sha256Bytes(options.notes)) {
    throw new Error(`Existing ${options.tag} Release notes conflict with the prepared Bundle notes.`);
  }
}

function acceptedDraftReleaseId(
  attemptEvidence: JsonRecord,
  options: {
    tag: string;
    name: string;
    notes: string;
    targetCommitish: string;
    prerelease: boolean;
  },
): number {
  let response: JsonRecord;
  try {
    response = JSON.parse(String(attemptEvidence.stdout ?? '')) as JsonRecord;
  } catch {
    throw new Error('Accepted GitHub Release creation returned no structured response.');
  }
  if (
    !response
    || typeof response !== 'object'
    || Array.isArray(response)
    || !Number.isSafeInteger(response.id)
    || response.id <= 0
    || response.tag_name !== options.tag
    || response.target_commitish !== options.targetCommitish
    || response.name !== options.name
    || response.draft !== true
    || response.prerelease !== options.prerelease
    || sha256Bytes(String(response.body ?? '')) !== sha256Bytes(options.notes)
    || !Array.isArray(response.assets)
    || response.assets.length !== 0
  ) {
    throw new Error('Accepted GitHub Release creation response conflicts with the exact draft identity.');
  }
  return response.id;
}

function plannedUploadActions(actions: unknown): JsonRecord[] {
  if (!Array.isArray(actions)) {
    throw new Error('Framework publish plan has no structured upload_actions.');
  }
  const names = new Set<string>();
  for (const action of actions as JsonRecord[]) {
    if (
      action.action !== 'upload'
      || typeof action.name !== 'string'
      || action.name.trim() !== action.name
      || action.name.length === 0
      || typeof action.source_path !== 'string'
      || action.source_path.length === 0
      || !Number.isSafeInteger(action.size_bytes)
      || Number(action.size_bytes) <= 0
      || !digestPattern.test(String(action.sha256 ?? ''))
      || names.has(action.name)
    ) {
      throw new Error('Framework publish plan contains duplicate or invalid asset names.');
    }
    names.add(action.name);
  }
  return actions as JsonRecord[];
}

function supplementalUploadActions(values: AdapterOptionValues): JsonRecord[] {
  const source = values['additional-upload-actions'];
  if (source === undefined || source === '') return [];
  if (typeof source !== 'string') {
    throw new Error('Additional immutable upload actions must be one JSON file path.');
  }
  const document = readJson(path.resolve(source));
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('Additional immutable upload actions must be one JSON object.');
  }
  const actions = (document as JsonRecord).upload_actions;
  if (!Array.isArray(actions)) {
    throw new Error('Additional immutable upload actions must expose upload_actions.');
  }
  return actions as JsonRecord[];
}

function assertReleaseAssetSet(
  inspection: JsonRecord,
  actions: JsonRecord[],
  exact: boolean,
): void {
  const planned = new Map(actions.map((action) => [String(action.name), action]));
  const remoteNames = new Set<string>();
  for (const asset of inspection.assets as JsonRecord[]) {
    const name = String(asset.name ?? '');
    if (!name || remoteNames.has(name)) {
      throw new Error(`Remote Release contains duplicate asset name ${name || '<missing>'}.`);
    }
    remoteNames.add(name);
    const expected = planned.get(name);
    if (!expected) {
      throw new Error(`Remote Release contains unexpected asset outside the exact planned set: ${name}.`);
    }
    if (asset.sha256 !== expected.sha256 || asset.size_bytes !== expected.size_bytes) {
      throw new Error(`Remote asset ${name} conflicts with the immutable publish plan.`);
    }
  }
  if (
    exact
    && (
      remoteNames.size !== planned.size
      || [...planned.keys()].some((name) => !remoteNames.has(name))
    )
  ) {
    throw new Error('Remote Release asset set is incomplete for immutable publication.');
  }
}

function assertMutableStandardIdentity(inspection: JsonRecord, bundle: JsonRecord, addon: JsonRecord): void {
  const target = addon.target_standard_release as JsonRecord;
  if (
    inspection.release?.exists !== true
    || inspection.release?.id !== target.release_id
    || inspection.tag !== target.tag
    || inspection.release?.draft !== false
    || inspection.release?.prerelease !== false
    || inspection.release?.immutable !== false
    || inspection.release?.target_commitish !== target.target_commitish
    || inspection.release?.name !== `One Person Lab v${bundle.release?.version}`
    || inspection.release?.body_sha256 !== sha256Bytes(bundlePublicReleaseBody(bundle))
  ) {
    throw new Error('Full append target is not the exact published mutable Standard Release.');
  }
}

function assertSameTagFullAssetPolicy(
  inspection: JsonRecord,
  addon: JsonRecord,
  actions: JsonRecord[],
  exactFull: boolean,
): void {
  const standard = new Map(
    (addon.sealed_standard_assets as JsonRecord[]).map((asset) => [String(asset.name), asset]),
  );
  const full = new Map(actions.map((asset) => [String(asset.name), asset]));
  const remote = new Map<string, JsonRecord>();
  for (const asset of inspection.assets as JsonRecord[]) {
    const name = String(asset.name ?? '');
    if (!name || remote.has(name)) throw new Error(`Remote Release contains duplicate asset name ${name || '<missing>'}.`);
    remote.set(name, asset);
    const expected = standard.get(name) ?? full.get(name);
    if (!expected) throw new Error(`Remote mutable Standard contains an unsealed asset: ${name}.`);
    if (asset.sha256 !== expected.sha256 || asset.size_bytes !== expected.size_bytes) {
      throw new Error(`Remote asset ${name} conflicts with its sealed name, size, or digest.`);
    }
  }
  for (const name of standard.keys()) {
    if (!remote.has(name)) throw new Error(`Remote mutable Standard is missing sealed Standard asset ${name}.`);
  }
  if (exactFull) {
    for (const name of full.keys()) {
      if (!remote.has(name)) throw new Error(`Remote mutable Standard is missing appended Full asset ${name}.`);
    }
  }
}

function publishedMutablePolicyViolation(input: {
  repo: string;
  tag: string;
  attemptEvidence?: JsonRecord;
  inspection: JsonRecord;
}): JsonRecord {
  return {
    surface_kind: 'opl_app_github_mutation_result.v1',
    status: 'failed',
    repository: input.repo,
    tag: input.tag,
    uploaded: [],
    mutation_attempt_id: input.attemptEvidence?.mutation_attempt_id ?? null,
    remote_target: input.attemptEvidence?.remote_target
      ?? `github-release:${input.repo}@${input.tag}`,
    retry_disposition: 'read_only_reconcile_only_no_retry',
    failure: {
      schema: 'opl_release_mutation_failure_receipt.v1',
      failure_taxonomy: 'published_mutable_policy_violation',
      mutation: 'release_publish',
      mutation_attempt_id: input.attemptEvidence?.mutation_attempt_id ?? null,
      remote_target: input.attemptEvidence?.remote_target
        ?? `github-release:${input.repo}@${input.tag}`,
      reason: input.attemptEvidence
        ? 'GitHub accepted publication but did not report immutable=true.'
        : 'The existing published carrier does not report immutable=true.',
      mutation_attempt: input.attemptEvidence ?? null,
      observed_release: input.inspection.release,
    },
    reconciliation: {
      status: 'complete',
      observation: input.inspection,
    },
  };
}

function ensureRelease(options: {
  baseAttemptId: string;
  repo: string;
  tag: string;
  name: string;
  notes: string;
  targetCommitish: string;
  prerelease: boolean;
  operationDeadlineAt: string;
  runtime: GitHubAdapterRuntime;
  initialInspection?: JsonRecord;
}): JsonRecord {
  const expectedBody = options.notes;
  const remoteTarget = `github-release:${options.repo}@${options.tag}`;
  let inspection = options.initialInspection ?? inspectRelease(options.repo, options.tag, options.runtime);
  if (!inspection.release.exists) {
    const expectedRef = `refs/tags/${options.tag}`;
    const tagRemoteTarget = `github-ref:${options.repo}@${expectedRef}`;
    const existingTagRef = inspectReleaseTagRef(options.repo, options.tag, options.runtime);
    if (existingTagRef.exists) {
      if (existingTagRef.target_commitish !== options.targetCommitish) {
        throw new Error(
          `Existing ${expectedRef} points to ${existingTagRef.target_commitish}, expected ${options.targetCommitish}.`,
        );
      }
      throw new Error(
        `Existing ${expectedRef} already reserves this Release identity without an exact Release; allocate a new tag.`,
      );
    }
    const tagPayload = JSON.stringify({
      ref: expectedRef,
      sha: options.targetCommitish,
    });
    const tagAttempt = runGitHubMutation({
      mutation: 'tag_reserve',
      attemptId: mutationAttemptId(
        options.baseAttemptId,
        'tag_reserve',
        tagRemoteTarget,
        options.targetCommitish,
      ),
      remoteTarget: tagRemoteTarget,
      args: ['api', '--method', 'POST', `repos/${options.repo}/git/refs`, '--input', '-'],
      body: tagPayload,
      operationDeadlineAt: options.operationDeadlineAt,
      runtime: options.runtime,
    });
    if (tagAttempt.status !== 'accepted') {
      return stoppedMutation({
        attempt: tagAttempt,
        repo: options.repo,
        tag: options.tag,
        reconciliation: inspectReleaseTagRefForReconcile(options.repo, options.tag, options.runtime),
      });
    }
    const tagReconciliation = reconcileAcceptedTagReservation({
      repo: options.repo,
      tag: options.tag,
      operationDeadlineAt: options.operationDeadlineAt,
      runtime: options.runtime,
    });
    if (
      tagReconciliation.status !== 'complete'
      || tagReconciliation.observation.exists !== true
      || tagReconciliation.observation.target_commitish !== options.targetCommitish
    ) {
      return unknownAfterAcceptedMutation({
        mutation: 'tag_reserve',
        operationDeadlineAt: options.operationDeadlineAt,
        attemptEvidence: tagAttempt.evidence,
        repo: options.repo,
        tag: options.tag,
        reconciliation: tagReconciliation,
        reason: 'GitHub accepted tag reservation but exact frozen App SHA readback did not complete.',
      });
    }
    const payload = JSON.stringify({
      tag_name: options.tag,
      target_commitish: options.targetCommitish,
      name: options.name,
      body: expectedBody,
      draft: true,
      prerelease: options.prerelease,
      make_latest: 'false',
    });
    const attempt = runGitHubMutation({
      mutation: 'release_create',
      attemptId: mutationAttemptId(options.baseAttemptId, 'release_create', remoteTarget, options.tag),
      remoteTarget,
      args: ['api', '--method', 'POST', `repos/${options.repo}/releases`, '--input', '-'],
      body: payload,
      operationDeadlineAt: options.operationDeadlineAt,
      runtime: options.runtime,
    });
    if (attempt.status !== 'accepted') {
      return stoppedMutation({
        attempt,
        repo: options.repo,
        tag: options.tag,
        reconciliation: inspectReleaseForReconcile(options.repo, options.tag, options.runtime),
      });
    }
    let releaseId: number;
    try {
      releaseId = acceptedDraftReleaseId(attempt.evidence, options);
    } catch (error) {
      const fallback = inspectReleaseForReconcile(options.repo, options.tag, options.runtime);
      return unknownAfterAcceptedMutation({
        mutation: 'release_create',
        operationDeadlineAt: options.operationDeadlineAt,
        attemptEvidence: attempt.evidence,
        repo: options.repo,
        tag: options.tag,
        reconciliation: {
          status: 'create_response_invalid',
          failure: { error_message: error instanceof Error ? error.message : String(error) },
          fallback,
        },
        reason: 'GitHub accepted Release creation but returned an invalid draft identity response.',
      });
    }
    const reconciliation = inspectReleaseByIdForReconcile(
      options.repo,
      options.tag,
      releaseId,
      options.runtime,
    );
    if (reconciliation.status !== 'complete' || !reconciliation.observation.release.exists) {
      return unknownAfterAcceptedMutation({
        mutation: 'release_create',
        operationDeadlineAt: options.operationDeadlineAt,
        attemptEvidence: attempt.evidence,
        repo: options.repo,
        tag: options.tag,
        reconciliation,
        reason: 'GitHub accepted Release creation but exact identity readback did not complete.',
      });
    }
    inspection = reconciliation.observation;
  }
  if (inspection.release.draft === true) {
    assertReleaseIdentity(inspection, { ...options, draft: true });
  } else if (inspection.release.draft === false) {
    assertReleaseIdentity(inspection, { ...options, draft: false });
  } else {
    throw new Error(`Existing ${options.tag} Release has an invalid draft state.`);
  }
  return { status: 'complete', inspection };
}

function publishDraftRelease(options: {
  baseAttemptId: string;
  values: AdapterOptionValues;
  repo: string;
  tag: string;
  name: string;
  notes: string;
  targetCommitish: string;
  prerelease: boolean;
  releaseId: number;
  actions: JsonRecord[];
  operationDeadlineAt: string;
  runtime: GitHubAdapterRuntime;
  bundle: JsonRecord;
  nativeImmutableRequired: boolean;
}): JsonRecord {
  const before = inspectReleaseById(options.repo, options.tag, options.releaseId, options.runtime);
  assertReleaseIdentity(before, { ...options, draft: true });
  assertReleaseAssetSet(before, options.actions, true);
  if (options.nativeImmutableRequired) {
    assertImmutableReleasesEnabled(
      options.values,
      options.repo,
      options.runtime,
      options.bundle,
      {
        operationId: requireOption(options.values, 'operation-id'),
        track: requireOption(options.values, 'track') as Track,
      },
      options.actions,
    );
  } else {
    assertCanonicalMutableStandardWindow(
      options.values,
      options.repo,
      options.runtime,
      options.bundle,
      {
        operationId: requireOption(options.values, 'operation-id'),
        track: requireOption(options.values, 'track') as Track,
      },
      options.actions,
    );
  }
  const remoteTarget = `github-release:${options.repo}@${options.tag}`;
  const attempt = runGitHubMutation({
    mutation: 'release_publish',
    attemptId: mutationAttemptId(
      options.baseAttemptId,
      'release_publish',
      remoteTarget,
      options.tag,
    ),
    remoteTarget,
    args: [
      'api',
      '--method',
      'PATCH',
      `repos/${options.repo}/releases/${before.release.id}`,
      '--input',
      '-',
    ],
    body: JSON.stringify({ draft: false, make_latest: 'false' }),
    operationDeadlineAt: options.operationDeadlineAt,
    runtime: options.runtime,
  });
  if (attempt.status !== 'accepted') {
    return stoppedMutation({
      attempt,
      repo: options.repo,
      tag: options.tag,
      reconciliation: inspectReleaseByIdForReconcile(
        options.repo,
        options.tag,
        options.releaseId,
        options.runtime,
      ),
    });
  }
  const reconciliation = inspectReleaseByIdForReconcile(
    options.repo,
    options.tag,
    options.releaseId,
    options.runtime,
  );
  if (reconciliation.status !== 'complete' || !reconciliation.observation.release.exists) {
    return unknownAfterAcceptedMutation({
      mutation: 'release_publish',
      operationDeadlineAt: options.operationDeadlineAt,
      attemptEvidence: attempt.evidence,
      repo: options.repo,
      tag: options.tag,
      reconciliation,
      reason: 'GitHub accepted draft publication but exact release readback did not complete.',
    });
  }
  const published = reconciliation.observation;
  if (published.release.immutable !== options.nativeImmutableRequired) {
    if (!options.nativeImmutableRequired) {
      return unknownAfterAcceptedMutation({
        mutation: 'release_publish',
        operationDeadlineAt: options.operationDeadlineAt,
        attemptEvidence: attempt.evidence,
        repo: options.repo,
        tag: options.tag,
        reconciliation,
        reason: 'GitHub accepted the controlled mutable Standard publication but readback reported immutable=true.',
      });
    }
    return publishedMutablePolicyViolation({
      repo: options.repo,
      tag: options.tag,
      attemptEvidence: attempt.evidence,
      inspection: published,
    });
  }
  try {
    assertReleaseIdentity(published, { ...options, draft: false });
    assertReleaseAssetSet(published, options.actions, true);
  } catch (error) {
    return unknownAfterAcceptedMutation({
      mutation: 'release_publish',
      operationDeadlineAt: options.operationDeadlineAt,
      attemptEvidence: attempt.evidence,
      repo: options.repo,
      tag: options.tag,
      reconciliation,
      reason: `GitHub accepted draft publication but exact identity or asset readback failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
  return {
    status: 'complete',
    repository: options.repo,
    tag: options.tag,
    uploaded: [],
    release_publish: attempt.evidence,
    inspection: published,
    github_native_immutable: options.nativeImmutableRequired,
    mutable_standard_protection: options.nativeImmutableRequired
      ? null
      : 'workflow_asset_name_digest_cas_and_unified_attestation',
  };
}

function applyFullAddonPlan(input: {
  values: AdapterOptionValues;
  runtime: GitHubAdapterRuntime;
  bundle: JsonRecord;
  admission: JsonRecord;
  uploadActions: JsonRecord[];
  operationDeadlineAt: string;
  mutationMode: GitHubApplyMode;
  publicationStatus: string;
}): JsonRecord {
  const addon = fullAddonIdentity(
    input.bundle,
    input.uploadActions,
    requireOption(input.values, 'standard-attestation'),
  );
  const repo = String(input.bundle.sources?.app?.repo ?? '');
  const tag = String(addon.tag);
  const targetCommitish = publicationTagTargetCommitish(input.values, input.bundle, addon);
  if (input.publicationStatus === 'reconcile_only') {
    const observation = inspectReleaseForReconcile(repo, tag, input.runtime);
    if (observation.status !== 'complete') {
      return {
        surface_kind: 'opl_app_github_same_tag_full_reconcile.v1',
        status: 'reconcile_only',
        repository: repo,
        tag,
        mutation_authorized: false,
        mutation_attempted: false,
        retry_disposition: 'read_only_reconcile_only_no_retry',
        reconciliation: { classification: 'unknown', ...observation },
        addon,
      };
    }
    try {
      assertMutableStandardIdentity(observation.observation, input.bundle, addon);
      assertSameTagFullAssetPolicy(observation.observation, addon, input.uploadActions, false);
      const missing = input.uploadActions
        .filter((action) => !observation.observation.assets.some(
          (asset: JsonRecord) => asset.name === action.name,
        ))
        .map((action) => action.name);
      return {
        surface_kind: 'opl_app_github_same_tag_full_reconcile.v1',
        status: 'reconcile_only',
        repository: repo,
        tag,
        mutation_authorized: false,
        mutation_attempted: false,
        retry_disposition: 'read_only_reconcile_only_no_retry',
        reconciliation: {
          classification: missing.length === 0 ? 'complete' : 'incomplete',
          missing_full_assets: missing,
          observation: observation.observation,
        },
        addon,
      };
    } catch (error) {
      return {
        surface_kind: 'opl_app_github_same_tag_full_reconcile.v1',
        status: 'reconcile_only',
        repository: repo,
        tag,
        mutation_authorized: false,
        mutation_attempted: false,
        retry_disposition: 'read_only_reconcile_only_no_retry',
        reconciliation: {
          classification: 'conflict',
          reason: error instanceof Error ? error.message : String(error),
          observation: observation.observation,
        },
        addon,
      };
    }
  }
  const preexisting = inspectReleaseForReconcile(repo, tag, input.runtime);
  if (preexisting.status !== 'complete') {
    throw new Error('Full append requires a complete read-only inspection of the exact Standard Release.');
  }
  assertMutableStandardIdentity(preexisting.observation, input.bundle, addon);
  assertSameTagFullAssetPolicy(preexisting.observation, addon, input.uploadActions, false);
  if (input.mutationMode === 'rehearsal') {
    return {
      surface_kind: 'opl_app_github_publication_rehearsal.v1',
      status: 'rehearsal_complete',
      mutation_authorized: false,
      mutation_attempted: false,
      repository: repo,
      tag,
      track: 'full',
      operation: input.admission.operation,
      operation_id: input.admission.operationId,
      publication_channel: 'stable',
      target_commitish: targetCommitish,
      upload_actions: input.uploadActions.map((action) => ({
        name: action.name,
        size_bytes: action.size_bytes,
        sha256: action.sha256,
      })),
      preexisting_release: preexisting.observation.release,
      addon,
      forbidden_mutations: ['tag_reserve', 'release_create', 'release_publish', 'latest_patch'],
    };
  }

  const uploaded: string[] = [];
  const releaseId = Number(addon.target_standard_release.release_id);
  for (const action of input.uploadActions) {
    const before = inspectReleaseById(repo, tag, releaseId, input.runtime);
    assertMutableStandardIdentity(before, input.bundle, addon);
    assertSameTagFullAssetPolicy(before, addon, input.uploadActions, false);
    const current = before.assets.find((asset: JsonRecord) => asset.name === action.name);
    if (current) continue;
    const attempt = runGitHubMutation({
      mutation: 'asset_upload',
      attemptId: mutationAttemptId(
        input.admission.attemptId,
        'asset_upload',
        `github-release:${repo}@${tag}`,
        String(action.name),
      ),
      remoteTarget: `github-release:${repo}@${tag}`,
      args: ['release', 'upload', tag, action.source_path, '--repo', repo],
      operationDeadlineAt: input.operationDeadlineAt,
      runtime: input.runtime,
    });
    if (attempt.status !== 'accepted') {
      return stoppedMutation({
        attempt,
        repo,
        tag,
        uploaded,
        unresolvedAsset: action.name,
        reconciliation: inspectReleaseByIdForReconcile(repo, tag, releaseId, input.runtime),
      });
    }
    const reconciliation = inspectReleaseByIdForReconcile(repo, tag, releaseId, input.runtime);
    if (reconciliation.status !== 'complete') {
      return unknownAfterAcceptedMutation({
        mutation: 'asset_upload',
        operationDeadlineAt: input.operationDeadlineAt,
        attemptEvidence: attempt.evidence,
        repo,
        tag,
        uploaded,
        unresolvedAsset: action.name,
        reconciliation,
        reason: `GitHub accepted ${action.name} append but exact digest readback failed.`,
      });
    }
    const after = reconciliation.observation;
    try {
      assertMutableStandardIdentity(after, input.bundle, addon);
      assertSameTagFullAssetPolicy(after, addon, input.uploadActions, false);
    } catch (error) {
      return unknownAfterAcceptedMutation({
        mutation: 'asset_upload',
        operationDeadlineAt: input.operationDeadlineAt,
        attemptEvidence: attempt.evidence,
        repo,
        tag,
        uploaded,
        unresolvedAsset: action.name,
        reconciliation,
        reason: `GitHub accepted ${action.name} append but the sealed Standard or release identity changed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
    const observed = after.assets.find((asset: JsonRecord) => asset.name === action.name);
    if (observed?.sha256 === action.sha256 && observed?.size_bytes === action.size_bytes) {
      uploaded.push(action.name);
      continue;
    }
    return unknownAfterAcceptedMutation({
      mutation: 'asset_upload',
      operationDeadlineAt: input.operationDeadlineAt,
      attemptEvidence: attempt.evidence,
      repo,
      tag,
      uploaded,
      unresolvedAsset: action.name,
      reconciliation,
      reason: `GitHub accepted ${action.name} append but did not expose the exact digest.`,
    });
  }
  const finalInspection = inspectReleaseById(repo, tag, releaseId, input.runtime);
  assertMutableStandardIdentity(finalInspection, input.bundle, addon);
  assertSameTagFullAssetPolicy(finalInspection, addon, input.uploadActions, true);
  return {
    surface_kind: 'opl_app_github_same_tag_full_append_result.v1',
    status: 'complete',
    repository: repo,
    tag,
    uploaded,
    inspection: finalInspection,
    addon: {
      ...addon,
      release_url: `https://github.com/${repo}/releases/tag/${tag}`,
      asset_download_base_url: `https://github.com/${repo}/releases/download/${tag}`,
    },
    standard_assets_modified: false,
    release_notes_modified: false,
    latest_modified: false,
    updater_metadata_modified: false,
  };
}

function applyPublishPlanInternal(
  values: AdapterOptionValues,
  runtime: GitHubAdapterRuntime = defaultGitHubRuntime,
): JsonRecord {
  const admission = assertStableGitHubMutationAdmission('github-apply', values);
  const mutationMode = githubApplyMode(values);
  const operationDeadlineAt = requireOption(values, 'operation-deadline-at');
  releaseOperationDeadlineTimestamp(operationDeadlineAt);
  const bundle = bundleDocument(requireOption(values, 'bundle'));
  const publicationChannel = standardPublicationChannel('github-apply', values, bundle);
  if (admission.track === 'full' && publicationChannel !== 'stable') {
    rejectGitHubMutation(
      'github-apply',
      values,
      'github_mutation_non_stable_full_publication',
      'Full publication requires the Stable publication channel.',
      { publication_channel: publicationChannel, operation: admission.operation, track: admission.track },
    );
  }
  assertUpdaterVersionMatchesDisplay(
    publicationChannel,
    String(bundle.release?.version ?? ''),
    String(bundle.release?.updater_version ?? ''),
  );
  const repo = bundle.sources.app.repo;
  const plan = readJson(path.resolve(requireOption(values, 'plan')));
  const publication = plan.release_bundle_publish;
  if (publication?.bundle_digest !== bundle.bundle_digest) {
    throw new Error('Framework publish plan is bound to a different Bundle.');
  }
  if (publication.track !== admission.track) {
    rejectGitHubMutation(
      'github-apply',
      values,
      'github_mutation_framework_track_mismatch',
      `Framework publish plan track ${String(publication.track ?? '<missing>')} does not match admitted ${admission.track}.`,
      {
        operation: admission.operation,
        admitted_track: admission.track,
        framework_plan_track: publication.track ?? null,
      },
    );
  }
  const frameworkControl = publication.receipt?.operation_control;
  if (
    publication.receipt?.release_operation !== admission.operation
    || frameworkControl?.operation_id !== admission.operationId
    || frameworkControl?.operation_started_at !== admission.operationStartedAt
    || frameworkControl?.operation_deadline_at !== operationDeadlineAt
  ) {
    rejectGitHubMutation(
      'github-apply',
      values,
      'github_mutation_framework_operation_mismatch',
      'Framework publish plan does not match the exact admitted operation control.',
      {
        admitted_operation: admission.operation,
        admitted_operation_id: admission.operationId,
        framework_operation: publication.receipt?.release_operation ?? null,
        framework_operation_control: frameworkControl ?? null,
      },
    );
  }
  const actions = publication.receipt?.details?.upload_actions;
  const uploadActions = plannedUploadActions([
    ...plannedUploadActions(actions),
    ...supplementalUploadActions(values),
  ]);
  if (admission.track === 'full') {
    return applyFullAddonPlan({
      values,
      runtime,
      bundle,
      admission,
      uploadActions,
      operationDeadlineAt,
      mutationMode,
      publicationStatus: String(publication.status ?? ''),
    });
  }
  const targetCommitish = publicationTagTargetCommitish(values, bundle, null);
  const tag = bundle.release.tag;
  if (publication.status === 'reconcile_only') {
    return { status: 'reconcile_only', repository: repo, tag, uploaded: [] };
  }
  const name = `One Person Lab v${bundle.release.version}`;
  const notes = bundlePublicReleaseBody(bundle);
  const preexisting = inspectReleaseForReconcile(repo, tag, runtime);
  const canonicalMutableStandard = repo === canonicalStableRepository && publicationChannel === 'stable';
  const exactPublishedCarrier = preexisting.status === 'complete'
    && preexisting.observation.release.exists === true
    && preexisting.observation.release.draft === false;
  if (!exactPublishedCarrier) {
    if (canonicalMutableStandard) {
      assertCanonicalMutableStandardWindow(values, repo, runtime, bundle, admission, uploadActions);
    } else {
      assertImmutableReleasesEnabled(values, repo, runtime, bundle, admission, uploadActions);
    }
  }
  if (mutationMode === 'rehearsal') {
    return {
      surface_kind: 'opl_app_github_publication_rehearsal.v1',
      status: 'rehearsal_complete',
      mutation_authorized: false,
      mutation_attempted: false,
      repository: repo,
      tag,
      track: admission.track,
      operation: admission.operation,
      operation_id: admission.operationId,
      publication_channel: publicationChannel,
      target_commitish: targetCommitish,
      upload_actions: uploadActions.map((action) => ({
        name: action.name,
        size_bytes: action.size_bytes,
        sha256: action.sha256,
      })),
      preexisting_release: preexisting.status === 'complete'
        ? preexisting.observation.release
        : null,
      github_native_immutable_expected: !canonicalMutableStandard,
    };
  }
  const releaseResult = ensureRelease({
    baseAttemptId: admission.attemptId,
    repo,
    tag,
    name,
    notes,
    targetCommitish,
    prerelease: publicationChannel === 'nightly',
    operationDeadlineAt,
    runtime,
    initialInspection: preexisting.status === 'complete' ? preexisting.observation : undefined,
  });
  if (releaseResult.status !== 'complete') return releaseResult;
  if (releaseResult.inspection.release.draft === false) {
    assertReleaseAssetSet(releaseResult.inspection, uploadActions, true);
    if (releaseResult.inspection.release.immutable !== !canonicalMutableStandard) {
      if (canonicalMutableStandard) {
        throw new Error('Controlled mutable Standard readback unexpectedly reports immutable=true.');
      }
      return publishedMutablePolicyViolation({
        repo,
        tag,
        inspection: releaseResult.inspection,
      });
    }
    return {
      status: 'complete',
      repository: repo,
      tag,
      uploaded: [],
      inspection: releaseResult.inspection,
      github_native_immutable: !canonicalMutableStandard,
    };
  }
  assertReleaseAssetSet(releaseResult.inspection, uploadActions, false);
  const uploaded: string[] = [];
  const releaseId = Number(releaseResult.inspection.release.id);
  for (const action of uploadActions) {
    const expectedDigest = action.sha256;
    const expectedSize = action.size_bytes;
    const before = inspectReleaseById(repo, tag, releaseId, runtime);
    assertReleaseIdentity(before, {
      tag,
      name,
      notes,
      targetCommitish,
      prerelease: publicationChannel === 'nightly',
      draft: true,
    });
    assertReleaseAssetSet(before, uploadActions, false);
    const current = before.assets.find((asset: JsonRecord) => asset.name === action.name);
    if (current) {
      if (current.sha256 === expectedDigest && current.size_bytes === expectedSize) continue;
      throw new Error(`Remote asset ${action.name} conflicts with the immutable Bundle.`);
    }
    const attempt = runGitHubMutation({
      mutation: 'asset_upload',
      attemptId: mutationAttemptId(
        admission.attemptId,
        'asset_upload',
        `github-release:${repo}@${tag}`,
        String(action.name),
      ),
      remoteTarget: `github-release:${repo}@${tag}`,
      args: ['release', 'upload', tag, action.source_path, '--repo', repo],
      operationDeadlineAt,
      runtime,
    });
    if (attempt.status !== 'accepted') {
      return stoppedMutation({
        attempt,
        repo,
        tag,
        uploaded,
        unresolvedAsset: action.name,
        reconciliation: inspectReleaseByIdForReconcile(repo, tag, releaseId, runtime),
      });
    }
    const reconciliation = inspectReleaseByIdForReconcile(repo, tag, releaseId, runtime);
    if (reconciliation.status !== 'complete') {
      return unknownAfterAcceptedMutation({
        mutation: 'asset_upload',
        operationDeadlineAt,
        attemptEvidence: attempt.evidence,
        repo,
        tag,
        uploaded,
        unresolvedAsset: action.name,
        reconciliation,
        reason: `GitHub accepted ${action.name} upload but immutable digest readback failed.`,
      });
    }
    const after = reconciliation.observation;
    assertReleaseIdentity(after, {
      tag,
      name,
      notes,
      targetCommitish,
      prerelease: publicationChannel === 'nightly',
      draft: true,
    });
    assertReleaseAssetSet(after, uploadActions, false);
    const observed = after.assets.find((asset: JsonRecord) => asset.name === action.name);
    if (observed?.sha256 === expectedDigest && observed?.size_bytes === expectedSize) {
      uploaded.push(action.name);
      continue;
    }
    if (observed) throw new Error(`Remote asset ${action.name} digest changed during upload.`);
    return unknownAfterAcceptedMutation({
      mutation: 'asset_upload',
      operationDeadlineAt,
      attemptEvidence: attempt.evidence,
      repo,
      tag,
      uploaded,
      unresolvedAsset: action.name,
      reconciliation,
      reason: 'GitHub accepted the upload but did not expose its immutable digest.',
    });
  }
  const publicationResult = publishDraftRelease({
    baseAttemptId: admission.attemptId,
    values,
    repo,
    tag,
    name,
    notes,
    targetCommitish,
    prerelease: publicationChannel === 'nightly',
    releaseId,
    actions: uploadActions,
    operationDeadlineAt,
    runtime,
    bundle,
    nativeImmutableRequired: !canonicalMutableStandard,
  });
  if (publicationResult.status !== 'complete') {
    return { ...publicationResult, uploaded };
  }
  return {
    ...publicationResult,
    uploaded,
  };
}

export function applyPublishPlan(
  values: AdapterOptionValues,
  runtime: GitHubAdapterRuntime = defaultGitHubRuntime,
): JsonRecord {
  const mutationAttempts: JsonRecord[] = [];
  const trackedRuntime: GitHubAdapterRuntime = {
    ...runtime,
    run: runtime.run.bind(runtime),
    now: runtime.now.bind(runtime),
    ...(runtime.wait ? { wait: runtime.wait.bind(runtime) } : {}),
    onMutationAttempt(evidence) {
      mutationAttempts.push(evidence);
      runtime.onMutationAttempt?.(evidence);
    },
  };
  try {
    return applyPublishPlanInternal(values, trackedRuntime);
  } catch (error) {
    if (mutationAttempts.length === 0) throw error;
    if (error instanceof GitHubMutationFailure) {
      throw new GitHubMutationFailure(error.message, {
        ...error.result,
        mutation_attempted: true,
        mutation_attempts: mutationAttempts,
        retry_disposition: 'read_only_reconcile_only_no_retry',
        failure: {
          ...error.result.failure,
          mutation_attempted: true,
          mutation_attempts: mutationAttempts,
        },
      });
    }
    const typed = githubMutationFailure(
      'github-apply',
      values,
      'github_mutation_failed',
      error instanceof Error ? error.message : String(error),
      {
        mutation_attempted: true,
        mutation_attempts: mutationAttempts,
      },
      error instanceof GitHubReadError ? error.evidence : undefined,
      'read_only_reconcile_only_no_retry',
    );
    typed.result.mutation_attempted = true;
    typed.result.mutation_attempts = mutationAttempts;
    throw typed;
  }
}

function activateLatestCas(input: {
  command: GitHubMutationCommand;
  values: AdapterOptionValues;
  repo: string;
  tag: string;
  expectedCurrentLatestTag: string;
  attemptId: string;
  operationDeadlineAt: string;
  runtime: GitHubAdapterRuntime;
}): JsonRecord {
  const inspection = inspectRelease(input.repo, input.tag, input.runtime);
  if (!inspection.release.exists || !inspection.release.id) {
    throw new Error(`Release ${input.tag} is missing.`);
  }
  const latest = ghRead(
    ['api', `repos/${input.repo}/releases/latest`],
    input.runtime,
    { allow404: true },
  ) as JsonRecord | null;
  const observedLatestTag = typeof latest?.tag_name === 'string' ? latest.tag_name : null;
  if (observedLatestTag === input.tag) {
    return {
      status: 'idempotent',
      repository: input.repo,
      tag: input.tag,
      latest_compare_and_swap: {
        expected_current_tag: input.expectedCurrentLatestTag,
        observed_current_tag: observedLatestTag,
        patch_performed: false,
      },
    };
  }
  if (observedLatestTag !== input.expectedCurrentLatestTag) {
    rejectGitHubMutation(
      input.command,
      input.values,
      'github_latest_compare_and_swap_drift',
      `Latest drifted: expected ${input.expectedCurrentLatestTag}, observed ${observedLatestTag ?? '<missing>'}.`,
      {
        expected_current_tag: input.expectedCurrentLatestTag,
        observed_current_tag: observedLatestTag,
        candidate_tag: input.tag,
      },
      'inspect_only_no_patch_require_new_admission',
    );
  }
  const attempt = runGitHubMutation({
    mutation: 'latest_patch',
    attemptId: mutationAttemptId(
      input.attemptId,
      'latest_patch',
      `github-latest:${input.repo}@${input.tag}`,
      input.tag,
    ),
    remoteTarget: `github-latest:${input.repo}@${input.tag}`,
    args: [
      'api',
      '--method',
      'PATCH',
      `repos/${input.repo}/releases/${inspection.release.id}`,
      '--input',
      '-',
    ],
    body: JSON.stringify({ make_latest: 'true' }),
    operationDeadlineAt: input.operationDeadlineAt,
    runtime: input.runtime,
  });
  if (attempt.status !== 'accepted') {
    return stoppedMutation({
      attempt,
      repo: input.repo,
      tag: input.tag,
      reconciliation: inspectLatestForReconcile(input.repo, input.runtime),
    });
  }
  const reconciliation = inspectLatestForReconcile(input.repo, input.runtime);
  if (
    reconciliation.status !== 'complete'
    || reconciliation.observation?.tag_name !== input.tag
  ) {
    return unknownAfterAcceptedMutation({
      mutation: 'latest_patch',
      operationDeadlineAt: input.operationDeadlineAt,
      attemptEvidence: attempt.evidence,
      repo: input.repo,
      tag: input.tag,
      reconciliation,
      reason: `Latest readback did not prove ${input.tag}.`,
    });
  }
  return {
    status: 'complete',
    repository: input.repo,
    tag: input.tag,
    latest_compare_and_swap: {
      expected_current_tag: input.expectedCurrentLatestTag,
      observed_current_tag: observedLatestTag,
      patch_performed: true,
    },
  };
}

export function activateLatest(
  values: AdapterOptionValues,
  runtime: GitHubAdapterRuntime = defaultGitHubRuntime,
): JsonRecord {
  const admission = assertStableGitHubMutationAdmission('github-activate-latest', values, 'standard');
  const operationDeadlineAt = requireOption(values, 'operation-deadline-at');
  releaseOperationDeadlineTimestamp(operationDeadlineAt);
  const bundle = bundleDocument(requireOption(values, 'bundle'));
  const publicationChannel = standardPublicationChannel('github-activate-latest', values, bundle);
  assertUpdaterVersionMatchesDisplay(
    publicationChannel,
    String(bundle.release?.version ?? ''),
    String(bundle.release?.updater_version ?? ''),
  );
  const status = readJson(path.resolve(requireOption(values, 'status'))).release_bundle_status;
  if (status?.bundle_digest !== bundle.bundle_digest) {
    throw new Error('Framework status does not describe the immutable Bundle input.');
  }
  const statusBundle = status.bundle;
  if (
    statusBundle?.bundle_digest !== bundle.bundle_digest
    || statusBundle?.release?.channel !== bundle.release.channel
    || statusBundle?.release?.version !== bundle.release.version
    || statusBundle?.release?.updater_version !== bundle.release.updater_version
    || statusBundle?.release?.tag !== bundle.release.tag
    || statusBundle?.release?.prerelease !== bundle.release.prerelease
    || statusBundle?.sources?.app?.source_commit !== bundle.sources.app.source_commit
    || statusBundle?.sources?.shell?.source_commit !== bundle.sources.shell.source_commit
    || statusBundle?.sources?.framework?.source_commit !== bundle.sources.framework.source_commit
  ) {
    throw new Error('Framework status Bundle projection does not match the immutable Bundle input.');
  }
  if (!Array.isArray(status.tracks?.standard?.assets)) {
    throw new Error('Framework status has no verified Standard staged assets.');
  }
  const standardControl = status.operation_controls?.standard;
  if (
    standardControl?.operation_id !== admission.operationId
    || standardControl?.operation_started_at !== admission.operationStartedAt
    || standardControl?.operation_deadline_at !== operationDeadlineAt
  ) {
    throw new Error('Framework status does not match the exact admitted Standard operation control.');
  }
  const latestAdmission = readJson(path.resolve(requireOption(values, 'latest-admission')));
  assertStandardLatestAdmissionReceipt(latestAdmission, {
    publicationChannel,
    bundleDigest: bundle.bundle_digest,
    candidateDisplayVersion: bundle.release.version,
    candidateUpdaterVersion: bundle.release.updater_version,
    appSha: bundle.sources.app.source_commit,
    shellSha: bundle.sources.shell.source_commit,
    frameworkSha: bundle.sources.framework.source_commit,
    standardAssets: status.tracks.standard.assets,
  });
  const repo = bundle.sources.app.repo;
  const tag = bundle.release.tag;
  const expectedCurrentLatestTag = latestAdmission.latest_compare_and_swap.expected_current.tag;
  return activateLatestCas({
    command: 'github-activate-latest',
    values,
    repo,
    tag,
    expectedCurrentLatestTag,
    attemptId: admission.attemptId,
    operationDeadlineAt,
    runtime,
  });
}

export function activatePublishedLatestPointer(
  values: AdapterOptionValues,
  runtime: GitHubAdapterRuntime = defaultGitHubRuntime,
): JsonRecord {
  if (values['run-attempt'] !== '1' || values.operation !== 'move_latest_pointer') {
    rejectGitHubMutation(
      'github-move-latest-pointer',
      values,
      'github_pointer_operation_rejected',
      'Published Latest pointer mutation requires move_latest_pointer on run attempt 1.',
    );
  }
  const operationId = requireOption(values, 'operation-id');
  const attemptId = requireOption(values, 'attempt-id');
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(operationId)
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(attemptId)
  ) {
    rejectGitHubMutation(
      'github-move-latest-pointer',
      values,
      'github_pointer_operation_identity_rejected',
      'Published Latest pointer mutation requires exact operation and attempt identities.',
    );
  }
  const operationStartedAt = requireOption(values, 'operation-started-at');
  const operationDeadlineAt = requireOption(values, 'operation-deadline-at');
  assertReleaseOperationDeadline({
    operation: 'move_latest_pointer',
    startedAt: operationStartedAt,
    deadlineAt: operationDeadlineAt,
    now: new Date(runtime.now()).toISOString(),
  });
  const repo = requireOption(values, 'repo');
  const tag = requireOption(values, 'tag');
  const expectedCurrentLatestTag = requireOption(values, 'expected-current-latest-tag');
  const releaseInspectionPath = path.resolve(requireOption(values, 'release-inspection'));
  const pointerInput = {
    repository: repo,
    componentManifestPath: path.resolve(requireOption(values, 'component-manifest')),
    releaseInspectionPath,
    authorityPath: path.resolve(requireOption(values, 'pointer-authority')),
    expectedCurrentLatestTag,
    runId: operationId,
    runAttempt: requireOption(values, 'run-attempt'),
    operationStartedAt,
    operationDeadlineAt,
  };
  const receipt = readJson(path.resolve(requireOption(values, 'pointer-admission')));
  assertLatestPointerOperationAdmissionReceipt(receipt, pointerInput);
  const freshInspection = inspectRelease(repo, tag, runtime);
  exactJson(
    latestPointerInspectionIdentity(freshInspection),
    latestPointerInspectionIdentity(readJson(releaseInspectionPath)),
    'Published exact release inspection',
  );
  if (
    tag !== receipt.candidate?.tag
    || expectedCurrentLatestTag
      !== receipt.latest_compare_and_swap?.expected_current_tag
  ) {
    rejectGitHubMutation(
      'github-move-latest-pointer',
      values,
      'github_pointer_receipt_identity_rejected',
      'Published Latest pointer mutation differs from its exact admission receipt.',
    );
  }
  const result = activateLatestCas({
    command: 'github-move-latest-pointer',
    values,
    repo,
    tag,
    expectedCurrentLatestTag,
    attemptId,
    operationDeadlineAt,
    runtime,
  });
  return {
    ...result,
    operation: 'move_latest_pointer',
    component_manifest_digest: receipt.candidate.component_manifest_digest,
    quality_status: receipt.candidate.quality_status,
    build_trigger: receipt.candidate.build_trigger,
    preview_kind: receipt.candidate.preview_kind,
    quality_unchanged: true,
    non_stable_notice: receipt.candidate.quality_status === 'preview',
    skipped_gates: receipt.candidate.qualification_disclosure.skipped_gates,
    persistent_override: false,
    stable_reclaim: 'next_qualified_stable',
  };
}

function main(): void {
  const { values, positionals } = parseCommon(process.argv.slice(2));
  const command = positionals[0];
  try {
    let output: JsonRecord;
    if (command === 'freeze-request') {
      output = buildFreezeRequest(values);
    } else if (command === 'webui-build-input') {
      output = buildWebuiBuildInput(values);
    } else if (command === 'executor-receipt') {
      output = buildExecutorReceipt(values);
    } else if (command === 'qualification-receipt') {
      output = buildQualificationReceipt(values);
    } else if (command === 'github-inspect') {
      if (typeof values['operation-deadline-at'] === 'string') {
        releaseOperationDeadlineTimestamp(values['operation-deadline-at']);
      }
      output = inspectRelease(requireOption(values, 'repo'), requireOption(values, 'tag'));
    } else if (command === 'github-apply') {
      output = applyPublishPlan(values);
    } else if (command === 'github-activate-latest') {
      output = activateLatest(values);
    } else if (command === 'github-move-latest-pointer') {
      output = activatePublishedLatestPointer(values);
    } else {
      throw new Error('Usage: framework-release-adapter <freeze-request|webui-build-input|executor-receipt|qualification-receipt|github-inspect|github-apply|github-activate-latest|github-move-latest-pointer> ...');
    }
    if (typeof values.output === 'string' && values.output.trim()) writeJson(path.resolve(values.output), output);
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    if (
      command === 'github-apply'
      || command === 'github-activate-latest'
      || command === 'github-move-latest-pointer'
    ) {
      const typed = error instanceof GitHubMutationFailure
        ? error
        : githubMutationFailure(
            command,
            values,
            'github_mutation_failed',
            error instanceof Error ? error.message : String(error),
            {},
            error instanceof GitHubReadError ? error.evidence : undefined,
          );
      persistGitHubMutationFailure(command, values, typed.result);
      throw typed;
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
