#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { standardAttestationIdentity, canonicalStableRepository } from './framework-release-adapter-bundle.ts';
import { sha256File } from './build-artifact-cohort.ts';
import { assertAppBundleLocalAuthorization } from './build-full-first-install-package/macos-trust.ts';

type Expected = {
  releaseId: string; tag: string; targetCommitish: string; bundleDigest: string;
  version: string; updaterVersion: string; appSha: string; shellSha: string; frameworkSha: string;
};
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const identity = (file: string) => ({ size_bytes: fs.statSync(file).size, sha256: `sha256:${sha256File(file)}` });
function command(cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${cmd} failed: ${result.stderr || result.stdout || result.error?.message}`);
  return result.stdout;
}
export function assertStandardBaseProductInputs(frozenAppRoot: string, packagingAppRoot: string) {
  if (!frozenAppRoot) throw new Error('Standard base requires the frozen App product inputs.');
  for (const relative of [
    'contracts/app-product-profile.json', 'contracts/app-gui-product-contract.json',
    'contracts/app-shell-adapter.json', 'scripts/official-profile-package-apply.ts',
  ]) {
    if (sha256File(path.join(frozenAppRoot, relative)) !== sha256File(path.join(packagingAppRoot, relative))) {
      throw new Error(`Standard base product input differs from the Full packager: ${relative}`);
    }
  }
}

export function expectedStandardBase(env = process.env): Expected {
  return {
    releaseId: env.OPL_FULL_STANDARD_RELEASE_ID || '', tag: env.OPL_FULL_STANDARD_RELEASE_TAG || '',
    targetCommitish: env.OPL_FULL_STANDARD_TARGET_COMMITISH || '', bundleDigest: env.OPL_RELEASE_BUNDLE_DIGEST || '',
    version: env.OPL_RELEASE_VERSION || '', updaterVersion: env.OPL_UPDATER_VERSION || '',
    appSha: env.OPL_FULL_ARTIFACT_APP_SHA || '', shellSha: env.OPL_FULL_SHELL_REF || '', frameworkSha: env.OPL_FULL_FRAMEWORK_REF || '',
  };
}

// Reuse the existing sealed Standard asset policy; this is an input optimization,
// not an alternative publication or qualification authority.
export function selectStandardBase(root: string, expected: Expected) {
  if (!/^[1-9][0-9]*$/.test(expected.releaseId)
    || ![expected.appSha, expected.shellSha, expected.frameworkSha, expected.targetCommitish].every((sha) => /^[0-9a-f]{40}$/.test(sha))
    || !/^sha256:[0-9a-f]{64}$/.test(expected.bundleDigest)) throw new Error('Standard base requires an exact release and source cohort.');
  const release = readJson(path.join(root, 'release.json'));
  if (String(release.id) !== expected.releaseId || release.tag_name !== expected.tag
    || expected.tag !== `v${expected.version}` || release.target_commitish !== expected.targetCommitish
    || release.draft !== false || release.prerelease !== false || !release.published_at) {
    throw new Error('Standard base is not the exact published Stable release.');
  }
  const proof = standardAttestationIdentity(path.join(root, 'opl-release-attestation.json'), {
    sources: { app: { repo: canonicalStableRepository } },
    release: { tag: expected.tag, version: expected.version }, bundle_digest: expected.bundleDigest,
  });
  const attestation = readJson(proof.path);
  const componentPath = path.join(root, 'opl-app-component-manifest.json');
  const componentIdentity = identity(componentPath);
  const component = readJson(componentPath);
  if (attestation.component_manifest?.sha256 !== componentIdentity.sha256
    || attestation.component_manifest?.size_bytes !== componentIdentity.size_bytes
    || component.surface_kind !== 'opl_app_component_manifest.v1'
    || component.release_tag !== expected.tag || component.release_version !== expected.version
    || component.updater_version !== expected.updaterVersion || component.quality_status !== 'stable'
    || component.qualification_disclosure?.stable_qualified !== true
    || component.source_cohort?.app_sha !== expected.appSha
    || component.source_cohort?.shell_sha !== expected.shellSha
    || component.source_cohort?.framework_sha !== expected.frameworkSha) {
    throw new Error('Standard base source cohort or machine version differs from Full; rebuild required.');
  }
  const name = `One-Person-Lab-${expected.version}-mac-arm64.zip`;
  const sealed = proof.sealed_standard_assets.find((asset: { name: string; size_bytes: number; sha256: string }) => asset.name === name);
  const consumedAssets = [name, 'opl-release-attestation.json', 'opl-app-component-manifest.json'];
  const publicBytesMatch = consumedAssets.every((assetName) => {
    const expectedAsset = proof.sealed_standard_assets.find((asset: { name: string }) => asset.name === assetName);
    const published = release.assets?.filter((asset: { name: string }) => asset.name === assetName) ?? [];
    return expectedAsset && published.length === 1 && published[0].size === expectedAsset.size_bytes
      && published[0].digest === expectedAsset.sha256;
  });
  if (!sealed || !publicBytesMatch) {
    throw new Error('Standard base ZIP is not the sealed public asset.');
  }
  return { name, ...sealed };
}

export function materializeStandardBase(root: string, expected: Expected, outputRoot: string, bundleName: string, bundleId: string) {
  const selected = selectStandardBase(root, expected);
  const zip = path.join(root, selected.name);
  const actual = identity(zip);
  if (actual.sha256 !== selected.sha256 || actual.size_bytes !== selected.size_bytes) throw new Error('Standard base ZIP bytes differ from the sealed asset.');
  fs.mkdirSync(outputRoot, { recursive: true });
  const unpacked = fs.mkdtempSync(path.join(outputRoot, '.standard-base-'));
  try {
    command('ditto', ['-x', '-k', zip, unpacked]);
    const entries = fs.readdirSync(unpacked).filter((name) => name !== '__MACOSX');
    if (entries.length !== 1 || entries[0] !== bundleName) throw new Error('Standard base ZIP must contain exactly the selected App bundle.');
    const app = path.join(unpacked, bundleName);
    const plist = JSON.parse(command('plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Contents/Info.plist')]));
    if (plist.CFBundleIdentifier !== bundleId || plist.CFBundleVersion !== expected.updaterVersion
      || plist.CFBundleShortVersionString !== expected.updaterVersion) throw new Error('Standard base App identity differs from Full.');
    assertAppBundleLocalAuthorization(app, 'Reused public Standard App');
    const target = path.join(outputRoot, bundleName);
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(app, target);
    return target;
  } finally { fs.rmSync(unpacked, { recursive: true, force: true }); }
}

function main() {
  const expected = expectedStandardBase();
  const root = path.resolve(process.argv[2]);
  fs.mkdirSync(root, { recursive: true });
  let available = false;
  let reason = '';
  try {
    assertStandardBaseProductInputs(process.env.OPL_FULL_FROZEN_APP_ROOT || '', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
    fs.writeFileSync(path.join(root, 'release.json'), command('gh', ['api', `repos/${canonicalStableRepository}/releases/${expected.releaseId}`]));
    command('gh', ['release', 'download', expected.tag, '--repo', canonicalStableRepository,
      '--pattern', 'opl-release-attestation.json', '--pattern', 'opl-app-component-manifest.json', '--dir', root, '--clobber']);
    const selected = selectStandardBase(root, expected);
    command('gh', ['release', 'download', expected.tag, '--repo', canonicalStableRepository,
      '--pattern', selected.name, '--dir', root, '--clobber']);
    const actual = identity(path.join(root, selected.name));
    if (actual.sha256 !== selected.sha256 || actual.size_bytes !== selected.size_bytes) throw new Error('Standard base ZIP download digest mismatch.');
    available = true;
  } catch (error) { reason = error instanceof Error ? error.message : String(error); }
  // A repair cohort can intentionally differ from Standard. Preserve the regular build.
  console.log(JSON.stringify({ standard_base_available: available, reason }));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `available=${available}\narchive_dir=${available ? root : ''}\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
