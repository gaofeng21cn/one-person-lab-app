import fs from 'node:fs';
import path from 'node:path';

import {
  MANUAL_FULL_PREVIEW_RELEASE_NOTES,
  assertDigestBinding,
  assertExactKeys,
  assertRegularFile,
  assetIdentity,
  compareNames,
  declaredAssetIdentity,
  derivePreviewTag,
  digestRefPattern,
  exactAssetSet,
  exactDigest,
  exactGitSha,
  exactVersion,
  expectedDmgName,
  fileSha256,
  findAsset,
  isRecord,
  manifestName,
  noncePattern,
  previewTagPattern,
  publishFixedNames,
  readJson,
  record,
  requiredFormalStableAssetNames,
  text,
  cleanupEvidenceNames,
  type AssetIdentity,
  type JsonRecord,
  type PreviewOperation,
  type ValidatedCleanupHandoff,
  type ValidatedHandoff,
  type ValidatedPublishHandoff,
} from './contract.ts';


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
  if (
    !publicDmg
    || publicDmg.size_bytes !== dmg.size_bytes
    || publicDmg.sha256 !== `sha256:${dmg.sha256}`
  ) {
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
