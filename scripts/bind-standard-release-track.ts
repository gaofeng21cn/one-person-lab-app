#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

import { assertUpdaterVersionMatchesDisplay } from './release-version.ts';
import { assertAppleNotarizationReceipt, assertGatekeeperLaunchPolicy } from './macos-gatekeeper-policy.ts';

type Channel = 'stable' | 'nightly' | 'preview';

function sha256(filePath: string): string {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function requiredFile(root: string, name: string): string {
  const filePath = path.join(root, name);
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`Standard track requires a non-empty regular ${name}.`);
  }
  return filePath;
}

function validatePackagedVersion(zipPath: string, updaterVersion: string): void {
  const script = String.raw`
import pathlib
import plistlib
import sys
import tempfile
import zipfile

zip_path = pathlib.Path(sys.argv[1])
expected = sys.argv[2]
with tempfile.TemporaryDirectory(prefix='opl-standard-identity-') as temp:
    with zipfile.ZipFile(zip_path) as archive:
        archive.extractall(temp)
    plist_paths = list(pathlib.Path(temp).glob('*.app/Contents/Info.plist'))
    if len(plist_paths) != 1:
        raise SystemExit(f'expected one App Info.plist in {zip_path}, found {len(plist_paths)}')
    with plist_paths[0].open('rb') as handle:
        info = plistlib.load(handle)
    observed = {
        'CFBundleShortVersionString': str(info.get('CFBundleShortVersionString', '')),
        'CFBundleVersion': str(info.get('CFBundleVersion', '')),
    }
    if any(value != expected for value in observed.values()):
        raise SystemExit(f'candidate App machine version mismatch: expected {expected}, got {observed}')
`;
  const result = spawnSync('python3', ['-c', script, zipPath, updaterVersion], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || 'Packaged version check failed.');
}

export function bindStandardReleaseTrack(input: {
  assetsDir: string;
  version: string;
  updaterVersion: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  bundleDigest: string;
  channel: Channel;
  repository: string;
  sourceRunId: string;
  sourceRunAttempt: number;
  latestOverrideRequested?: boolean;
  componentManifestScript: string;
  componentManifestOutput: string;
  identityReceiptOutput: string;
}): void {
  assertUpdaterVersionMatchesDisplay(input.channel, input.version, input.updaterVersion);
  if (!/^[0-9a-f]{40}$/.test(input.appSha)) throw new Error('Standard track requires an exact App SHA.');
  if (!/^[0-9a-f]{40}$/.test(input.shellSha)) throw new Error('Standard track requires an exact Shell SHA.');
  if (!/^[0-9a-f]{40}$/.test(input.frameworkSha)) {
    throw new Error('Standard track requires an exact Framework SHA.');
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(input.bundleDigest)) {
    throw new Error('Standard track requires an exact Framework Bundle digest.');
  }
  if (!/^[1-9][0-9]*$/.test(input.sourceRunId) || input.sourceRunAttempt !== 1) {
    throw new Error('Standard track requires the exact first-attempt source run identity.');
  }
  if (input.channel === 'stable' && input.latestOverrideRequested === true) {
    throw new Error('Stable uses automatic Latest reclaim and cannot claim a Preview override request.');
  }
  const assetsDir = path.resolve(input.assetsDir);
  const genericMetadata = requiredFile(assetsDir, 'latest-mac.yml');
  const canonicalMetadata = path.join(assetsDir, 'latest-arm64-mac.yml');
  fs.copyFileSync(genericMetadata, canonicalMetadata);
  fs.rmSync(genericMetadata);
  fs.rmSync(path.join(assetsDir, 'standard-local-authorization-policy.json'), { force: true });

  const zipName = `One-Person-Lab-${input.version}-mac-arm64.zip`;
  const zipPath = requiredFile(assetsDir, zipName);
  const metadata = fs.readFileSync(requiredFile(assetsDir, 'latest-arm64-mac.yml'), 'utf8');
  const declared = metadata.match(/^version:\s*["']?([^\s"']+)["']?\s*$/m)?.[1] ?? '';
  if (declared !== input.updaterVersion) {
    throw new Error(`latest-arm64-mac.yml declares ${declared || '<missing>'}, expected ${input.updaterVersion}.`);
  }
  if (!metadata.includes(zipName)) {
    throw new Error(`latest-arm64-mac.yml does not reference exact updater ZIP ${zipName}.`);
  }
  validatePackagedVersion(zipPath, input.updaterVersion);

  const dmgName = `One-Person-Lab-${input.version}-mac-arm64.dmg`;
  const dmgPath = requiredFile(assetsDir, dmgName);
  const notarizationPath = requiredFile(assetsDir, 'standard-apple-notarization-receipt.json');
  const gatekeeperPath = requiredFile(assetsDir, 'standard-gatekeeper-launch-policy.json');
  const notarization = assertAppleNotarizationReceipt(
    JSON.parse(fs.readFileSync(notarizationPath, 'utf8')),
    'standard-apple-notarization-receipt.json',
  );
  const gatekeeper = assertGatekeeperLaunchPolicy(
    JSON.parse(fs.readFileSync(gatekeeperPath, 'utf8')),
    'app_standard',
    'standard-gatekeeper-launch-policy.json',
  );
  if (
    notarization.final_stapled_dmg_sha256 !== sha256(dmgPath).slice('sha256:'.length)
    || notarization.final_stapled_dmg_size_bytes !== fs.statSync(dmgPath).size
  ) {
    throw new Error(`${dmgName} is not bound by the Standard Apple notarization receipt.`);
  }
  if (
    gatekeeper.team_identifier !== notarization.team_identifier
    || gatekeeper.notarization_receipt_sha256 !== sha256(notarizationPath).slice('sha256:'.length)
  ) {
    throw new Error('Standard Gatekeeper policy is not bound to the Apple notarization receipt.');
  }

  const names = [
    dmgName,
    zipName,
    `${zipName}.blockmap`,
    'latest-arm64-mac.yml',
    'opl-install.sh',
    'opl-app-installer.sh',
    'standard-gatekeeper-launch-policy.json',
    'standard-apple-notarization-receipt.json',
  ];
  const assets = names.map((name) => {
    const filePath = requiredFile(assetsDir, name);
    return {
      name,
      url: `https://github.com/${input.repository}/releases/download/v${input.version}/${name}`,
      digest: sha256(filePath),
      size: fs.statSync(filePath).size,
      contentType: 'application/octet-stream',
    };
  });
  const componentInput = path.join(path.dirname(path.resolve(input.componentManifestOutput)), 'component-release.json');
  fs.writeFileSync(componentInput, `${JSON.stringify({
    tagName: `v${input.version}`,
    updaterVersion: input.updaterVersion,
    isPrerelease: input.channel === 'nightly',
    url: `https://github.com/${input.repository}/releases/tag/v${input.version}`,
    assets,
  }, null, 2)}\n`);
  const component = spawnSync(process.execPath, [
    '--experimental-strip-types',
    path.resolve(input.componentManifestScript),
    '--version', input.version,
    '--updater-version', input.updaterVersion,
    '--source-commit', input.appSha,
    '--shell-commit', input.shellSha,
    '--framework-commit', input.frameworkSha,
    '--release-json', componentInput,
    '--repo', input.repository,
    '--output', path.resolve(input.componentManifestOutput),
  ], { encoding: 'utf8' });
  if (component.status !== 0) {
    throw new Error(component.stderr.trim() || component.stdout.trim() || 'Component manifest binding failed.');
  }
  const componentManifest = JSON.parse(
    fs.readFileSync(path.resolve(input.componentManifestOutput), 'utf8'),
  );

  const identity = {
    schema: 'opl_standard_release_identity_receipt.v2',
    status: 'passed',
    source: {
      repository: input.repository,
      run_id: input.sourceRunId,
      run_attempt: input.sourceRunAttempt,
    },
    release: {
      channel: input.channel,
      version: input.version,
      updater_version: input.updaterVersion,
      tag: `v${input.version}`,
      bundle_digest: input.bundleDigest,
    },
    product_semantics: {
      quality_status: componentManifest.quality_status,
      build_trigger: componentManifest.build_trigger,
      preview_kind: componentManifest.preview_kind,
      distribution_pointer: {
        pointer: 'latest',
        latest_override_requested: input.latestOverrideRequested === true,
        authority: input.latestOverrideRequested === true
          ? 'protected_single_use_exact_version'
          : input.channel === 'stable'
            ? 'qualified_stable_default'
            : 'none',
        quality_unchanged: true,
        stable_reclaim: 'next_qualified_stable',
      },
      qualification_disclosure: componentManifest.qualification_disclosure,
    },
    cohort: {
      app_sha: input.appSha,
      shell_sha: input.shellSha,
      framework_sha: input.frameworkSha,
    },
    updater_metadata: { name: 'latest-arm64-mac.yml', sha256: sha256(canonicalMetadata) },
    updater_zip: { name: zipName, sha256: sha256(zipPath) },
    installer_bootstrap: {
      name: 'opl-app-installer.sh',
      sha256: sha256(requiredFile(assetsDir, 'opl-app-installer.sh')),
    },
    universal_installer: {
      name: 'opl-install.sh',
      sha256: sha256(requiredFile(assetsDir, 'opl-install.sh')),
    },
    apple_distribution_trust: {
      gatekeeper_policy: { name: 'standard-gatekeeper-launch-policy.json', sha256: sha256(gatekeeperPath) },
      notarization_receipt: { name: 'standard-apple-notarization-receipt.json', sha256: sha256(notarizationPath) },
      final_dmg: { name: dmgName, sha256: sha256(dmgPath) },
    },
    component_manifest: {
      name: 'opl-app-component-manifest.json',
      sha256: sha256(path.resolve(input.componentManifestOutput)),
    },
  };
  fs.writeFileSync(path.resolve(input.identityReceiptOutput), `${JSON.stringify(identity, null, 2)}\n`);
}

function main(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      'assets-dir': { type: 'string' },
      version: { type: 'string' },
      'updater-version': { type: 'string' },
      'app-sha': { type: 'string' },
      'shell-sha': { type: 'string' },
      'framework-sha': { type: 'string' },
      'bundle-digest': { type: 'string' },
      channel: { type: 'string' },
      repository: { type: 'string' },
      'source-run-id': { type: 'string' },
      'source-run-attempt': { type: 'string' },
      'latest-override-requested': { type: 'string', default: 'false' },
      'component-manifest-script': { type: 'string' },
      'component-manifest-output': { type: 'string' },
      'identity-receipt-output': { type: 'string' },
    },
  });
  const channel = values.channel;
  if (channel !== 'stable' && channel !== 'nightly' && channel !== 'preview') {
    throw new Error('--channel must be stable, nightly, or preview.');
  }
  const required = (name: keyof typeof values): string => {
    const value = values[name];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing --${String(name)}.`);
    return value.trim();
  };
  const sourceRunAttempt = required('source-run-attempt');
  if (sourceRunAttempt !== '1') {
    throw new Error('--source-run-attempt must be the canonical first attempt 1.');
  }
  const latestOverrideRequested = values['latest-override-requested'];
  if (latestOverrideRequested !== 'true' && latestOverrideRequested !== 'false') {
    throw new Error('--latest-override-requested must be true or false.');
  }
  bindStandardReleaseTrack({
    assetsDir: required('assets-dir'),
    version: required('version'),
    updaterVersion: required('updater-version'),
    appSha: required('app-sha'),
    shellSha: required('shell-sha'),
    frameworkSha: required('framework-sha'),
    bundleDigest: required('bundle-digest'),
    channel,
    repository: required('repository'),
    sourceRunId: required('source-run-id'),
    sourceRunAttempt: Number(sourceRunAttempt),
    latestOverrideRequested: latestOverrideRequested === 'true',
    componentManifestScript: required('component-manifest-script'),
    componentManifestOutput: required('component-manifest-output'),
    identityReceiptOutput: required('identity-receipt-output'),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
