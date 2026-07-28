#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  assertReleaseSemanticsAxes,
  assertUpdaterVersionMatchesDisplay,
  type ReleaseBuildTrigger,
  type ReleasePreviewKind,
  type ReleaseQualityStatus,
} from './release-version.ts';

export type JsonRecord = Record<string, any>;
export type StandardPublicationChannel = 'stable' | 'preview' | 'nightly';

export type StandardPublicationInput = {
  publicationChannel: StandardPublicationChannel;
  bundleDigest: string;
  candidateDisplayVersion: string;
  candidateUpdaterVersion: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  standardAssetsPath: string;
  componentManifestPath: string;
  assetsDir?: string;
};

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const shaPattern = /^[0-9a-f]{40}$/;

export const hostedStandardAssetNames = (
  version: string,
  channel: StandardPublicationChannel,
): string[] => [
  `One-Person-Lab-${version}-mac-arm64.dmg`,
  `One-Person-Lab-${version}-mac-arm64.zip`,
  `One-Person-Lab-${version}-mac-arm64.zip.blockmap`,
  'latest-arm64-mac.yml',
  'opl-app-component-manifest.json',
  'opl-app-installer.sh',
  ...(channel === 'nightly'
    ? []
    : ['standard-gatekeeper-launch-policy.json', 'standard-apple-notarization-receipt.json']),
];

export function readJson(filePath: string): JsonRecord {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`Expected a non-empty regular JSON file: ${resolved}`);
  }
  const value = JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected one JSON object: ${resolved}`);
  }
  return value as JsonRecord;
}

export function sha256File(filePath: string): string {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

export function requireDigest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !digestPattern.test(value)) {
    throw new Error(`${label} must be an exact sha256 digest.`);
  }
  return value;
}

export function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return Number(value);
}

export function requireEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label} does not match the frozen Standard candidate.`);
}

export function sha256JsonWithoutDigest(value: JsonRecord, digestKey: string): string {
  const core = Object.fromEntries(Object.entries(value).filter(([key]) => key !== digestKey));
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex')}`;
}

export function expectedClassification(channel: StandardPublicationChannel): {
  qualityStatus: ReleaseQualityStatus;
  buildTrigger: ReleaseBuildTrigger;
  previewKind: ReleasePreviewKind;
} {
  if (channel === 'stable') {
    return { qualityStatus: 'stable', buildTrigger: 'manual', previewKind: null };
  }
  if (channel === 'nightly') {
    return { qualityStatus: 'preview', buildTrigger: 'automated', previewKind: 'nightly' };
  }
  return { qualityStatus: 'preview', buildTrigger: 'manual', previewKind: 'dev' };
}

function validateBaseIdentity(input: StandardPublicationInput): void {
  assertUpdaterVersionMatchesDisplay(
    input.publicationChannel,
    input.candidateDisplayVersion,
    input.candidateUpdaterVersion,
  );
  requireDigest(input.bundleDigest, 'bundle_digest');
  for (const [label, value] of [
    ['app_sha', input.appSha],
    ['shell_sha', input.shellSha],
    ['framework_sha', input.frameworkSha],
  ] as const) {
    if (!shaPattern.test(value)) throw new Error(`${label} must be an exact lowercase Git SHA.`);
  }
  if (!input.candidateDisplayVersion || !input.candidateUpdaterVersion) {
    throw new Error('Candidate display and updater versions are required.');
  }
}

export function validateComponentManifest(
  manifestPath: string,
  input: StandardPublicationInput,
): JsonRecord {
  const manifest = readJson(manifestPath);
  requireEqual(manifest.surface_kind, 'opl_app_component_manifest.v1', 'Component manifest surface_kind');
  requireEqual(manifest.component_id, 'opl-app', 'Component manifest component_id');
  requireEqual(manifest.version, input.candidateDisplayVersion, 'Component manifest version');
  requireEqual(manifest.release_version, input.candidateDisplayVersion, 'Component manifest release version');
  requireEqual(manifest.updater_version, input.candidateUpdaterVersion, 'Component manifest updater version');
  requireEqual(manifest.release_tag, `v${input.candidateDisplayVersion}`, 'Component manifest release tag');
  requireEqual(manifest.source_commit, input.appSha, 'Component manifest source commit');
  requireEqual(manifest.source_cohort?.app_sha, input.appSha, 'Component manifest cohort app_sha');
  requireEqual(manifest.source_cohort?.shell_sha, input.shellSha, 'Component manifest cohort shell_sha');
  requireEqual(manifest.source_cohort?.framework_sha, input.frameworkSha, 'Component manifest cohort framework_sha');
  const classification = expectedClassification(input.publicationChannel);
  requireEqual(manifest.quality_status, classification.qualityStatus, 'Component manifest quality_status');
  requireEqual(manifest.build_trigger, classification.buildTrigger, 'Component manifest build_trigger');
  requireEqual(manifest.preview_kind, classification.previewKind, 'Component manifest preview_kind');
  assertReleaseSemanticsAxes({
    qualityStatus: manifest.quality_status,
    buildTrigger: manifest.build_trigger,
    previewKind: manifest.preview_kind,
  });
  requireEqual(
    manifest.component_manifest_digest,
    sha256JsonWithoutDigest(manifest, 'component_manifest_digest'),
    'Component manifest self digest',
  );
  requireDigest(manifest.primary_artifact?.digest, 'Component manifest primary artifact digest');
  requirePositiveInteger(manifest.primary_artifact?.size, 'Component manifest primary artifact size');
  const expectedNames = hostedStandardAssetNames(input.candidateDisplayVersion, input.publicationChannel);
  const artifactNames = Array.isArray(manifest.artifacts)
    ? manifest.artifacts.map((asset: JsonRecord) => asset?.name).sort()
    : [];
  if (
    JSON.stringify(artifactNames)
    !== JSON.stringify([...expectedNames].filter((name) => name !== 'opl-app-component-manifest.json').sort())
  ) {
    throw new Error('Component manifest must bind the exact GitHub-hosted Standard asset set.');
  }
  if (classification.qualityStatus === 'preview') {
    requireEqual(manifest.qualification_disclosure?.stable_qualified, false, 'Preview stable_qualified disclosure');
    requireEqual(manifest.qualification_disclosure?.non_stable_notice, true, 'Preview non-Stable disclosure');
    if (
      !Array.isArray(manifest.qualification_disclosure?.skipped_gates)
      || manifest.qualification_disclosure.skipped_gates.length === 0
    ) {
      throw new Error('Preview component manifest must disclose skipped Stable gates.');
    }
  }
  return manifest;
}

function validateStagedAssets(
  standardAssetsPath: string,
  componentManifestPath: string,
  input: StandardPublicationInput,
  componentManifest: JsonRecord,
): JsonRecord {
  const standardAssets = readJson(standardAssetsPath);
  requireEqual(standardAssets.surface_kind, 'opl_release_bundle_staged_assets.v1', 'Standard assets surface_kind');
  requireEqual(standardAssets.bundle_digest, input.bundleDigest, 'Standard assets bundle_digest');
  requireEqual(standardAssets.track, 'standard', 'Standard assets track');
  if (!Array.isArray(standardAssets.assets)) {
    throw new Error('Standard assets must contain an assets array.');
  }

  const expectedNames = hostedStandardAssetNames(input.candidateDisplayVersion, input.publicationChannel);
  const actualNames = standardAssets.assets.map((asset: JsonRecord) => asset?.name).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify([...expectedNames].sort())) {
    throw new Error('Staged Standard assets must match the exact hosted asset set.');
  }
  const stagedByName = new Map<string, JsonRecord>();
  for (const asset of standardAssets.assets as JsonRecord[]) {
    const name = typeof asset?.name === 'string' ? asset.name : '';
    if (!name || stagedByName.has(name)) throw new Error(`Staged Standard assets contain a duplicate or unnamed asset: ${name || '<missing>'}.`);
    requireDigest(asset.sha256, `Staged ${name} sha256`);
    requirePositiveInteger(asset.size_bytes, `Staged ${name} size`);
    stagedByName.set(name, asset);
  }

  const manifestPath = path.resolve(componentManifestPath);
  const manifestAsset = stagedByName.get('opl-app-component-manifest.json');
  requireEqual(
    requireDigest(manifestAsset?.sha256, 'Staged component manifest sha256'),
    sha256File(manifestPath),
    'Staged component manifest sha256',
  );
  requireEqual(
    requirePositiveInteger(manifestAsset?.size_bytes, 'Staged component manifest size'),
    fs.statSync(manifestPath).size,
    'Staged component manifest size',
  );

  const artifactByName = new Map<string, JsonRecord>(
    (componentManifest.artifacts as JsonRecord[]).map((asset) => [String(asset.name), asset]),
  );
  for (const name of expectedNames.filter((entry) => entry !== 'opl-app-component-manifest.json')) {
    const manifestAssetEntry = artifactByName.get(name);
    const stagedAsset = stagedByName.get(name);
    if (!manifestAssetEntry || !stagedAsset) throw new Error(`Standard asset ${name} is not bound by both manifest and staged assets.`);
    requireEqual(
      requireDigest(stagedAsset.sha256, `Staged ${name} sha256`),
      requireDigest(manifestAssetEntry.digest, `Manifest ${name} digest`),
      `${name} digest`,
    );
    requireEqual(
      requirePositiveInteger(stagedAsset.size_bytes, `Staged ${name} size`),
      requirePositiveInteger(manifestAssetEntry.size, `Manifest ${name} size`),
      `${name} size`,
    );
  }

  if (input.assetsDir !== undefined) {
    const assetsDir = path.resolve(input.assetsDir);
    for (const name of expectedNames) {
      const filePath = path.join(assetsDir, name);
      const stat = fs.lstatSync(filePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
        throw new Error(`Standard publication input requires a non-empty regular local asset: ${filePath}`);
      }
      const staged = stagedByName.get(name)!;
      requireEqual(sha256File(filePath), staged.sha256, `${name} local sha256`);
      requireEqual(stat.size, staged.size_bytes, `${name} local size`);
    }
  }
  return standardAssets;
}

export function validateStandardPublicationInput(input: StandardPublicationInput): {
  componentManifest: JsonRecord;
  standardAssets: JsonRecord;
  expectedAssetNames: string[];
} {
  validateBaseIdentity(input);
  const componentManifest = validateComponentManifest(input.componentManifestPath, input);
  const standardAssets = validateStagedAssets(
    input.standardAssetsPath,
    input.componentManifestPath,
    input,
    componentManifest,
  );
  return {
    componentManifest,
    standardAssets,
    expectedAssetNames: hostedStandardAssetNames(input.candidateDisplayVersion, input.publicationChannel),
  };
}

function required(value: string | undefined, flag: string): string {
  if (!value?.trim()) throw new Error(`Missing --${flag}.`);
  return value.trim();
}

function main(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      bundle: { type: 'string' },
      'publication-channel': { type: 'string' },
      'candidate-display-version': { type: 'string' },
      'candidate-updater-version': { type: 'string' },
      'app-sha': { type: 'string' },
      'shell-sha': { type: 'string' },
      'framework-sha': { type: 'string' },
      'standard-assets': { type: 'string' },
      'component-manifest': { type: 'string' },
      'assets-dir': { type: 'string' },
      output: { type: 'string' },
    },
  });
  const publicationChannel = values['publication-channel'];
  if (publicationChannel !== 'stable' && publicationChannel !== 'preview' && publicationChannel !== 'nightly') {
    throw new Error('--publication-channel must be stable, preview, or nightly.');
  }
  const input: StandardPublicationInput = {
    publicationChannel,
    bundleDigest: required(values.bundle, 'bundle'),
    candidateDisplayVersion: required(values['candidate-display-version'], 'candidate-display-version'),
    candidateUpdaterVersion: required(values['candidate-updater-version'], 'candidate-updater-version'),
    appSha: required(values['app-sha'], 'app-sha'),
    shellSha: required(values['shell-sha'], 'shell-sha'),
    frameworkSha: required(values['framework-sha'], 'framework-sha'),
    standardAssetsPath: required(values['standard-assets'], 'standard-assets'),
    componentManifestPath: required(values['component-manifest'], 'component-manifest'),
    assetsDir: values['assets-dir']?.trim() || undefined,
  };
  const result = validateStandardPublicationInput(input);
  const evidence = {
    operation: 'pre_publication_admission',
    publication_channel: input.publicationChannel,
    bundle_digest: input.bundleDigest,
    candidate: {
      display_version: input.candidateDisplayVersion,
      updater_version: input.candidateUpdaterVersion,
      app_sha: input.appSha,
      shell_sha: input.shellSha,
      framework_sha: input.frameworkSha,
    },
    expected_assets: result.expectedAssetNames,
    standard_assets_sha256: sha256File(input.standardAssetsPath),
    component_manifest: {
      manifest_digest: result.componentManifest.component_manifest_digest,
      file_sha256: sha256File(input.componentManifestPath),
    },
    local_assets_verified: input.assetsDir !== undefined,
  };
  const receipt = {
    schema: 'opl_standard_pre_publication_admission_receipt.v1',
    status: 'passed',
    ...evidence,
    input_digest: `sha256:${crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}`,
  };
  const output = path.resolve(required(values.output, 'output'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
