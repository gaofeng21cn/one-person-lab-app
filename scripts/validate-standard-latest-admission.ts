#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  expectedClassification,
  hostedStandardAssetNames,
  readJson,
  requireDigest,
  requireEqual,
  requirePositiveInteger,
  sha256File,
  sha256JsonWithoutDigest,
  validateStandardPublicationInput,
  type JsonRecord,
  type StandardPublicationChannel,
} from './validate-standard-publication-input.ts';
import { assertUpdaterVersionMatchesDisplay } from './release-version.ts';

export type StandardLatestAdmissionInput = {
  publicationChannel: StandardPublicationChannel;
  bundleDigest: string;
  candidateDisplayVersion: string;
  candidateUpdaterVersion: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  standardAssetsPath: string;
  componentManifestPath: string;
  expectedCurrentLatestTag: string;
  latestOverrideAuthorityPath?: string;
  homebrewPublicationPath?: string;
  homebrewReadbackPath?: string;
};

export type StandardLatestAdmissionAuthority = {
  publicationChannel?: StandardPublicationChannel;
  bundleDigest: string;
  candidateDisplayVersion: string;
  candidateUpdaterVersion: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  standardAssets: JsonRecord[];
};

const shaPattern = /^[0-9a-f]{40}$/;
const standardTapRepository = 'gaofeng21cn/homebrew-one-person-lab';
const standardCaskPath = 'Casks/one-person-lab.rb';


function requireLatestReleaseTag(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^v[0-9]+\.[0-9]+\.[0-9]+(?:(?:-r[1-9][0-9]*)|(?:-preview\.r[1-9][0-9]*)|(?:-nightly(?:\.r[1-9][0-9]*)?))?$/.test(value)
  ) {
    throw new Error(`${label} must be an exact Stable, Dev Preview, or Nightly Preview Latest tag.`);
  }
  return value;
}

function requireStableReleaseTag(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^v[0-9]+\.[0-9]+\.[0-9]+(?:-r[1-9][0-9]*)?$/.test(value)) {
    throw new Error(`${label} must be an exact Stable release tag.`);
  }
  return value;
}

function requireCandidateReleaseTag(
  value: unknown,
  channel: StandardPublicationChannel,
  label: string,
): string {
  if (channel === 'stable') return requireStableReleaseTag(value, label);
  const pattern = channel === 'preview'
    ? /^v[0-9]+\.[0-9]+\.[0-9]+-preview\.r[1-9][0-9]*$/
    : /^v[0-9]+\.[0-9]+\.[0-9]+-nightly(?:\.r[1-9][0-9]*)?$/;
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`${label} must be an exact ${channel === 'preview' ? 'Dev' : 'Nightly'} Preview release tag.`);
  }
  return value;
}

function validateLatestOverrideAuthority(
  authorityPath: string,
  manifest: JsonRecord,
  expectedCurrentLatestTag: string,
): JsonRecord {
  const authority = readJson(authorityPath);
  requireEqual(authority.schema, 'opl_app_latest_pointer_override_authority.v1', 'Latest override authority schema');
  requireEqual(authority.status, 'admitted', 'Latest override authority status');
  requireEqual(authority.operation, 'move_latest_pointer', 'Latest override operation');
  requireEqual(authority.authorization?.source, 'user_explicit', 'Latest override authority source');
  requireEqual(
    authority.authorization?.protected_environment,
    'release-preview-latest',
    'Latest override protected environment',
  );
  requireEqual(authority.authorization?.single_use, true, 'Latest override single-use policy');
  requireEqual(authority.authorization?.persistent_override, false, 'Latest override persistent policy');
  requireEqual(authority.candidate?.tag, manifest.release_tag, 'Latest override candidate tag');
  requireEqual(
    authority.candidate?.component_manifest_digest,
    manifest.component_manifest_digest,
    'Latest override component manifest digest',
  );
  requireEqual(
    authority.candidate?.artifact_digest,
    manifest.primary_artifact?.digest,
    'Latest override artifact digest',
  );
  requireEqual(authority.candidate?.quality_status, manifest.quality_status, 'Latest override quality_status');
  requireEqual(authority.candidate?.build_trigger, manifest.build_trigger, 'Latest override build_trigger');
  requireEqual(authority.candidate?.preview_kind, manifest.preview_kind, 'Latest override preview_kind');
  requireEqual(authority.candidate?.quality_unchanged, true, 'Latest override quality policy');
  requireEqual(authority.candidate?.non_stable_notice, true, 'Latest override non-Stable disclosure');
  if (
    JSON.stringify(authority.candidate?.skipped_gates)
    !== JSON.stringify(manifest.qualification_disclosure?.skipped_gates)
  ) {
    throw new Error('Latest override skipped-gate disclosure must match the immutable component manifest.');
  }
  requireEqual(
    authority.compare_and_swap?.expected_current_tag,
    expectedCurrentLatestTag,
    'Latest override expected-current tag',
  );
  requireEqual(authority.compare_and_swap?.exact_expected_current, true, 'Latest override exact CAS policy');
  requireEqual(authority.readback?.required, true, 'Latest override readback requirement');
  requireEqual(
    authority.readback?.policy,
    'exact_public_tag_latest_and_quality_disclosure',
    'Latest override readback policy',
  );
  requireEqual(
    authority.authority_digest,
    sha256JsonWithoutDigest(authority, 'authority_digest'),
    'Latest override authority digest',
  );
  return authority;
}

export function assertStandardLatestAdmissionReceipt(
  receipt: JsonRecord,
  authority: StandardLatestAdmissionAuthority,
): void {
  const receiptPublicationChannel = receipt.publication_channel;
  const publicationChannel = authority.publicationChannel
    ?? (receiptPublicationChannel === undefined ? 'stable' : receiptPublicationChannel);
  if (
    publicationChannel !== 'stable'
    && publicationChannel !== 'preview'
    && publicationChannel !== 'nightly'
  ) {
    throw new Error('Latest admission publication channel must be stable, preview, or nightly.');
  }
  requireEqual(receipt.schema, 'opl_standard_latest_admission_receipt.v1', 'Latest admission schema');
  requireEqual(receipt.status, 'passed', 'Latest admission status');
  requireEqual(receipt.operation, 'move_latest_pointer', 'Latest admission operation');
  requireEqual(receipt.latest_activation_admitted, true, 'Latest activation admission');
  if (receiptPublicationChannel === undefined) {
    if (publicationChannel !== 'stable') {
      throw new Error('Preview Latest admission receipt must bind its publication route.');
    }
  } else {
    requireEqual(receiptPublicationChannel, publicationChannel, 'Latest admission publication channel');
  }
  const classification = expectedClassification(publicationChannel);
  requireEqual(receipt.classification?.quality_status, classification.qualityStatus, 'Latest admission quality_status');
  requireEqual(receipt.classification?.build_trigger, classification.buildTrigger, 'Latest admission build_trigger');
  requireEqual(receipt.classification?.preview_kind, classification.previewKind, 'Latest admission preview_kind');
  requireEqual(receipt.classification?.quality_unchanged, true, 'Latest admission quality policy');
  requireEqual(
    receipt.classification?.non_stable_notice,
    publicationChannel === 'stable' ? false : true,
    'Latest admission non-Stable disclosure',
  );
  requireDigest(receipt.component_manifest?.manifest_digest, 'Latest admission component manifest digest');
  const manifestAsset = authority.standardAssets.filter(
    (asset) => asset?.name === 'opl-app-component-manifest.json',
  );
  if (manifestAsset.length !== 1) {
    throw new Error('Framework status must contain exactly one opl-app-component-manifest.json.');
  }
  requireEqual(
    requireDigest(receipt.component_manifest?.file_sha256, 'Latest admission component manifest sha256'),
    requireDigest(manifestAsset[0].sha256, 'Framework status component manifest sha256'),
    'Latest admission component manifest sha256',
  );
  if (publicationChannel === 'stable') {
    requireEqual(receipt.pointer_authority?.mode, 'qualified_stable_default', 'Stable Latest authority mode');
    requireEqual(receipt.pointer_authority?.single_use, false, 'Stable Latest single-use policy');
    requireEqual(receipt.pointer_authority?.persistent_override, false, 'Stable Latest persistent policy');
    requireEqual(receipt.pointer_authority?.authority_digest, null, 'Stable Latest authority digest');
  } else {
    requireEqual(
      receipt.pointer_authority?.mode,
      'protected_single_use_exact_version',
      'Preview Latest authority mode',
    );
    requireEqual(receipt.pointer_authority?.single_use, true, 'Preview Latest single-use policy');
    requireEqual(receipt.pointer_authority?.persistent_override, false, 'Preview Latest persistent policy');
    requireDigest(receipt.pointer_authority?.authority_digest, 'Preview Latest authority digest');
  }
  requireEqual(
    receipt.pointer_authority?.failure_policy,
    'preserve_current_latest_lkg',
    'Latest failure policy',
  );
  requireEqual(
    receipt.pointer_authority?.stable_reclaim,
    'next_qualified_stable',
    'Latest Stable reclaim policy',
  );
  requireEqual(receipt.bundle_digest, authority.bundleDigest, 'Latest admission bundle_digest');
  requireEqual(receipt.candidate?.display_version, authority.candidateDisplayVersion, 'Latest admission display version');
  requireEqual(receipt.candidate?.updater_version, authority.candidateUpdaterVersion, 'Latest admission updater version');
  requireEqual(receipt.candidate?.app_sha, authority.appSha, 'Latest admission app_sha');
  requireEqual(receipt.candidate?.shell_sha, authority.shellSha, 'Latest admission shell_sha');
  requireEqual(receipt.candidate?.framework_sha, authority.frameworkSha, 'Latest admission framework_sha');

  const expectedZipName = `One-Person-Lab-${authority.candidateDisplayVersion}-mac-arm64.zip`;
  const statusZip = authority.standardAssets.filter((asset) => asset?.name === expectedZipName);
  if (statusZip.length !== 1) {
    throw new Error(`Framework status must contain exactly one ${expectedZipName}.`);
  }
  requireEqual(receipt.candidate?.zip?.name, expectedZipName, 'Latest admission ZIP name');
  requireEqual(
    requireDigest(receipt.candidate?.zip?.sha256, 'Latest admission ZIP sha256'),
    requireDigest(statusZip[0].sha256, 'Framework status ZIP sha256'),
    'Latest admission ZIP sha256',
  );
  requireEqual(
    requirePositiveInteger(receipt.candidate?.zip?.size_bytes, 'Latest admission ZIP size'),
    requirePositiveInteger(statusZip[0].size_bytes, 'Framework status ZIP size'),
    'Latest admission ZIP size',
  );
  const expectedDmgName = `One-Person-Lab-${authority.candidateDisplayVersion}-mac-arm64.dmg`;
  const statusDmg = authority.standardAssets.filter((asset) => asset?.name === expectedDmgName);
  if (statusDmg.length !== 1) {
    throw new Error(`Framework status must contain exactly one ${expectedDmgName}.`);
  }
  requireEqual(receipt.candidate?.dmg?.name, expectedDmgName, 'Latest admission DMG name');
  requireEqual(
    requireDigest(receipt.candidate?.dmg?.sha256, 'Latest admission DMG sha256'),
    requireDigest(statusDmg[0].sha256, 'Framework status DMG sha256'),
    'Latest admission DMG sha256',
  );
  requireEqual(
    requirePositiveInteger(receipt.candidate?.dmg?.size_bytes, 'Latest admission DMG size'),
    requirePositiveInteger(statusDmg[0].size_bytes, 'Framework status DMG size'),
    'Latest admission DMG size',
  );

  const expectedCurrentTag = requireLatestReleaseTag(
    receipt.latest_compare_and_swap?.expected_current?.tag,
    'Latest admission expected current tag',
  );
  requireEqual(
    requireCandidateReleaseTag(
      receipt.latest_compare_and_swap?.candidate?.tag,
      publicationChannel,
      'Latest admission candidate tag',
    ),
    `v${authority.candidateDisplayVersion}`,
    'Latest admission candidate tag',
  );
  if (expectedCurrentTag === receipt.latest_compare_and_swap.candidate.tag) {
    throw new Error('Latest admission compare-and-swap predecessor must differ from the candidate.');
  }
  requireDigest(receipt.standard_assets_sha256, 'Standard assets receipt sha256');
  requireEqual(
    receipt.hosted_publication_floor?.schema,
    'opl_standard_hosted_publication_floor.v1',
    'Hosted publication floor schema',
  );
  requireEqual(receipt.hosted_publication_floor?.source_contract_build_preflight, 'passed', 'Hosted preflight');
  requireEqual(receipt.hosted_publication_floor?.remote_digest_readback, 'passed', 'Remote digest readback');
  requireEqual(receipt.hosted_publication_floor?.self_hosted_ancestor_count, 0, 'Self-hosted ancestor count');
  requireEqual(receipt.hosted_publication_floor?.vm_ancestor_count, 0, 'VM ancestor count');
  requireEqual(receipt.hosted_publication_floor?.tart_ancestor_count, 0, 'Tart ancestor count');
  if (
    JSON.stringify(receipt.hosted_publication_floor?.required_assets)
    !== JSON.stringify(hostedStandardAssetNames(authority.candidateDisplayVersion, publicationChannel))
  ) {
    throw new Error('Hosted publication floor asset set does not match the frozen Standard candidate.');
  }
  if (publicationChannel === 'stable') {
    requireDigest(receipt.homebrew?.publication_receipt_sha256, 'Homebrew publication receipt sha256');
    requireDigest(receipt.homebrew?.readback_receipt_sha256, 'Homebrew readback receipt sha256');
    if ('clean_vm_receipt_sha256' in receipt.homebrew) {
      throw new Error('Latest admission must not consume Homebrew clean-VM evidence.');
    }
  } else if (receipt.homebrew !== null) {
    throw new Error('Preview Latest admission must not claim Homebrew publication evidence.');
  }
  for (const forbidden of ['updater_predecessor_policy', 'updater_receipts', 'optional_certification']) {
    if (forbidden in receipt) throw new Error(`Latest admission must not consume ${forbidden}.`);
  }

  const inputEvidence = {
    ...(receiptPublicationChannel === undefined ? {} : { publication_channel: receiptPublicationChannel }),
    operation: receipt.operation,
    classification: receipt.classification,
    component_manifest: receipt.component_manifest,
    pointer_authority: receipt.pointer_authority,
    bundle_digest: receipt.bundle_digest,
    candidate: receipt.candidate,
    standard_assets_sha256: receipt.standard_assets_sha256,
    hosted_publication_floor: receipt.hosted_publication_floor,
    homebrew: receipt.homebrew,
    latest_compare_and_swap: receipt.latest_compare_and_swap,
  };
  requireEqual(
    receipt.input_digest,
    `sha256:${crypto.createHash('sha256').update(JSON.stringify(inputEvidence)).digest('hex')}`,
    'Latest admission input_digest',
  );
}

export function validateStandardLatestAdmission(input: StandardLatestAdmissionInput): JsonRecord {
  assertUpdaterVersionMatchesDisplay(
    input.publicationChannel,
    input.candidateDisplayVersion,
    input.candidateUpdaterVersion,
  );
  const bundleDigest = requireDigest(input.bundleDigest, 'bundle_digest');
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

  const expectedCurrentLatestTag = requireLatestReleaseTag(
    input.expectedCurrentLatestTag,
    'Expected current Latest tag',
  );
  if (expectedCurrentLatestTag === `v${input.candidateDisplayVersion}`) {
    throw new Error('Expected current Latest tag must differ from the candidate tag.');
  }
  const componentManifestPath = path.resolve(input.componentManifestPath);
  const publicationInput = validateStandardPublicationInput({
    ...input,
    assetsDir: undefined,
  });
  const componentManifest = publicationInput.componentManifest;
  let pointerAuthority: JsonRecord;
  if (input.publicationChannel === 'stable') {
    if (input.latestOverrideAuthorityPath !== undefined) {
      throw new Error('Qualified Stable Latest admission must not consume Preview override authority.');
    }
    pointerAuthority = {
      mode: 'qualified_stable_default',
      single_use: false,
      persistent_override: false,
      authority_digest: null,
      failure_policy: 'preserve_current_latest_lkg',
      stable_reclaim: 'next_qualified_stable',
    };
  } else {
    if (!input.latestOverrideAuthorityPath) {
      throw new Error('Preview Latest admission requires protected single-use user authority.');
    }
    const overrideAuthority = validateLatestOverrideAuthority(
      input.latestOverrideAuthorityPath,
      componentManifest,
      expectedCurrentLatestTag,
    );
    pointerAuthority = {
      mode: 'protected_single_use_exact_version',
      single_use: true,
      persistent_override: false,
      authority_digest: overrideAuthority.authority_digest,
      failure_policy: 'preserve_current_latest_lkg',
      stable_reclaim: 'next_qualified_stable',
    };
  }

  const standardAssetsPath = path.resolve(input.standardAssetsPath);
  const standardAssets = publicationInput.standardAssets;
  const zipName = `One-Person-Lab-${input.candidateDisplayVersion}-mac-arm64.zip`;
  const zipEntries = Array.isArray(standardAssets.assets)
    ? standardAssets.assets.filter((entry: JsonRecord) => entry?.name === zipName)
    : [];
  if (zipEntries.length !== 1) throw new Error(`Standard assets must contain exactly one ${zipName}.`);
  const bundleZip = {
    name: zipName,
    sha256: requireDigest(zipEntries[0].sha256, 'Standard candidate ZIP sha256'),
    size_bytes: requirePositiveInteger(zipEntries[0].size_bytes, 'Standard candidate ZIP size'),
  };
  const dmgName = `One-Person-Lab-${input.candidateDisplayVersion}-mac-arm64.dmg`;
  const dmgEntries = Array.isArray(standardAssets.assets)
    ? standardAssets.assets.filter((entry: JsonRecord) => entry?.name === dmgName)
    : [];
  if (dmgEntries.length !== 1) throw new Error(`Standard assets must contain exactly one ${dmgName}.`);
  const bundleDmg = {
    name: dmgName,
    sha256: requireDigest(dmgEntries[0].sha256, 'Standard candidate DMG sha256'),
    size_bytes: requirePositiveInteger(dmgEntries[0].size_bytes, 'Standard candidate DMG size'),
  };
  const componentManifestEntries = standardAssets.assets.filter(
    (entry: JsonRecord) => entry?.name === 'opl-app-component-manifest.json',
  );
  requireEqual(
    requireDigest(componentManifestEntries[0].sha256, 'Staged component manifest sha256'),
    sha256File(componentManifestPath),
    'Staged component manifest sha256',
  );

  let homebrewEvidence: JsonRecord | null = null;
  if (input.publicationChannel === 'stable') {
    const publicationPath = path.resolve(required(input.homebrewPublicationPath, 'homebrew-publication'));
    const readbackPath = path.resolve(required(input.homebrewReadbackPath, 'homebrew-readback'));
    const publication = readJson(publicationPath);
    const readback = readJson(readbackPath);
    requireEqual(publication.schema, 'opl_bundle_homebrew_publication_receipt.v1', 'Homebrew publication schema');
    requireEqual(publication.status, 'passed', 'Homebrew publication status');
    requireEqual(publication.track, 'standard', 'Homebrew publication track');
    requireEqual(publication.bundle_digest, bundleDigest, 'Homebrew publication bundle_digest');
    requireEqual(publication.release_version, input.candidateDisplayVersion, 'Homebrew release version');
    requireEqual(publication.updater_version, input.candidateUpdaterVersion, 'Homebrew updater version');
    requireEqual(publication.tap_repository, standardTapRepository, 'Homebrew tap repository');
    if (!shaPattern.test(String(publication.tap_commit ?? ''))) {
      throw new Error('Homebrew publication tap_commit must be exact.');
    }
    requireEqual(publication.cask?.path, standardCaskPath, 'Homebrew Standard cask path');
    requireDigest(publication.cask?.sha256, 'Homebrew cask sha256');
    requireEqual(publication.artifact?.name, bundleDmg.name, 'Homebrew DMG name');
    requireEqual(
      requireDigest(publication.artifact?.sha256, 'Homebrew DMG sha256'),
      bundleDmg.sha256,
      'Homebrew DMG sha256',
    );
    const releaseBase = `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v${input.candidateDisplayVersion}`;
    requireEqual(publication.artifact?.url, `${releaseBase}/${bundleDmg.name}`, 'Homebrew DMG URL');
    requireEqual(
      publication.component_manifest_url,
      `${releaseBase}/opl-app-component-manifest.json`,
      'Homebrew component manifest URL',
    );
    requireEqual(
      readback.schema,
      'opl_bundle_homebrew_publication_readback_receipt.v1',
      'Homebrew readback schema',
    );
    requireEqual(readback.status, 'passed', 'Homebrew readback status');
    requireEqual(readback.track, 'standard', 'Homebrew readback track');
    requireEqual(readback.bundle_digest, bundleDigest, 'Homebrew readback bundle_digest');
    requireEqual(readback.release_version, input.candidateDisplayVersion, 'Homebrew readback release version');
    requireEqual(readback.updater_version, input.candidateUpdaterVersion, 'Homebrew readback updater version');
    requireEqual(
      readback.publication_receipt_sha256,
      sha256File(publicationPath),
      'Homebrew publication receipt digest',
    );
    if ('clean_vm_receipt_sha256' in readback) {
      throw new Error('Hosted Homebrew readback must not bind clean-VM evidence.');
    }
    homebrewEvidence = {
      publication_receipt_sha256: sha256File(publicationPath),
      readback_receipt_sha256: sha256File(readbackPath),
    };
  } else if (
    input.homebrewPublicationPath !== undefined
    || input.homebrewReadbackPath !== undefined
  ) {
    throw new Error('Preview Latest admission rejects Homebrew evidence.');
  }

  const classification = expectedClassification(input.publicationChannel);
  const inputEvidence = {
    publication_channel: input.publicationChannel,
    operation: 'move_latest_pointer',
    classification: {
      quality_status: classification.qualityStatus,
      build_trigger: classification.buildTrigger,
      preview_kind: classification.previewKind,
      quality_unchanged: true,
      non_stable_notice: classification.qualityStatus === 'preview',
      skipped_gates: componentManifest.qualification_disclosure?.skipped_gates ?? [],
      failed_gates: componentManifest.qualification_disclosure?.failed_gates ?? [],
    },
    component_manifest: {
      manifest_digest: componentManifest.component_manifest_digest,
      file_sha256: sha256File(componentManifestPath),
      source_commit: componentManifest.source_commit,
      artifact_digest: componentManifest.primary_artifact.digest,
    },
    pointer_authority: pointerAuthority,
    bundle_digest: bundleDigest,
    candidate: {
      display_version: input.candidateDisplayVersion,
      updater_version: input.candidateUpdaterVersion,
      app_sha: input.appSha,
      shell_sha: input.shellSha,
      framework_sha: input.frameworkSha,
      zip: bundleZip,
      dmg: bundleDmg,
    },
    standard_assets_sha256: sha256File(standardAssetsPath),
    hosted_publication_floor: {
      schema: 'opl_standard_hosted_publication_floor.v1',
      source_contract_build_preflight: 'passed',
      remote_digest_readback: 'passed',
      required_assets: hostedStandardAssetNames(input.candidateDisplayVersion, input.publicationChannel),
      self_hosted_ancestor_count: 0,
      vm_ancestor_count: 0,
      tart_ancestor_count: 0,
    },
    homebrew: homebrewEvidence,
    latest_compare_and_swap: {
      expected_current: { tag: expectedCurrentLatestTag },
      candidate: { tag: `v${input.candidateDisplayVersion}` },
    },
  };
  return {
    schema: 'opl_standard_latest_admission_receipt.v1',
    status: 'passed',
    latest_activation_admitted: true,
    input_digest: `sha256:${crypto.createHash('sha256').update(JSON.stringify(inputEvidence)).digest('hex')}`,
    ...inputEvidence,
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
      'expected-current-latest-tag': { type: 'string' },
      'latest-override-authority': { type: 'string' },
      'homebrew-publication': { type: 'string' },
      'homebrew-readback': { type: 'string' },
      output: { type: 'string' },
    },
  });
  if (
    values['publication-channel'] !== 'stable'
    && values['publication-channel'] !== 'preview'
    && values['publication-channel'] !== 'nightly'
  ) {
    throw new Error('--publication-channel must be stable, preview, or nightly.');
  }
  const receipt = validateStandardLatestAdmission({
    publicationChannel: values['publication-channel'],
    bundleDigest: required(values.bundle, 'bundle'),
    candidateDisplayVersion: required(values['candidate-display-version'], 'candidate-display-version'),
    candidateUpdaterVersion: required(values['candidate-updater-version'], 'candidate-updater-version'),
    appSha: required(values['app-sha'], 'app-sha'),
    shellSha: required(values['shell-sha'], 'shell-sha'),
    frameworkSha: required(values['framework-sha'], 'framework-sha'),
    standardAssetsPath: required(values['standard-assets'], 'standard-assets'),
    componentManifestPath: required(values['component-manifest'], 'component-manifest'),
    expectedCurrentLatestTag: required(values['expected-current-latest-tag'], 'expected-current-latest-tag'),
    latestOverrideAuthorityPath: values['latest-override-authority']?.trim() || undefined,
    homebrewPublicationPath: values['homebrew-publication']?.trim() || undefined,
    homebrewReadbackPath: values['homebrew-readback']?.trim() || undefined,
  });
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
