#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';
import { resolveActiveShellPaths } from './app-shell-adapter.ts';
import { assertFullRuntimeNativeTrustObject } from './full-runtime-native-trust.ts';
import { assertAppleNotarizationReceipt, assertGatekeeperLaunchPolicy } from './macos-gatekeeper-policy.ts';
import { fileSha256 } from './release-file-helpers.ts';
import { buildReleaseNotesDocument, buildReleaseNotesEvidence } from './release-notes.ts';
import { buildAiReleaseNotesDocument, validateAiReleaseNotes } from './release-notes-ai-writer.ts';
import { assertReleaseVersionNotFuture, currentReleaseCalendarDate } from './release-version.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalRepository = 'gaofeng21cn/one-person-lab-app';

type Options = {
  shellRoot: string;
  releaseRepo: string;
  version: string;
  macArch: string;
  standardArtifactsDir: string;
  fullPackageDir: string;
  releaseNotesFile: string;
  includeFullPackage: boolean;
  fullPackageOnly: boolean;
  dryRun: boolean;
};

function defaultReleaseVersion() {
  const calendarDate = process.env.OPL_RELEASE_DATE || currentReleaseCalendarDate();
  const match = calendarDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid OPL_RELEASE_DATE: ${calendarDate}`);
  return `${Number(match[1]) - 2000}.${Number(match[2])}.${Number(match[3])}`;
}

function parseArgs(argv: string[]): Options {
  const { values } = parseNodeArgs({
    args: argv,
    options: {
      'no-build': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      'force-upload': { type: 'boolean' },
      draft: { type: 'boolean' },
      'include-full-package': { type: 'boolean' },
      'full-package-only': { type: 'boolean' },
      'shell-root': { type: 'string' },
      repo: { type: 'string' },
      version: { type: 'string' },
      'mac-arch': { type: 'string' },
      'standard-artifacts-dir': { type: 'string' },
      'full-package-dir': { type: 'string' },
      'release-notes-file': { type: 'string' },
    },
    allowPositionals: false,
    strict: true,
  });
  const shellRoot = path.resolve(
    values['shell-root']
      || process.env.OPL_APP_SHELL_ROOT
      || process.env.OPL_AION_SHELL_ROOT
      || resolveActiveShellPaths().shellRoot,
  );
  const fullPackageOnly = values['full-package-only'] === true;
  const fullPackageDir = path.resolve(
    values['full-package-dir']
      || process.env.OPL_FULL_PACKAGE_DIR
      || path.join(repoRoot, 'dist', 'opl-full-release'),
  );
  const macArch = values['mac-arch'] || process.env.OPL_RELEASE_MAC_ARCH || 'arm64';
  if (!['arm64', 'x64', 'universal'].includes(macArch)) {
    throw new Error(`Unsupported macOS release architecture: ${macArch}`);
  }
  return {
    shellRoot,
    releaseRepo: values.repo || process.env.OPL_RELEASE_REPO || canonicalRepository,
    version: values.version || process.env.OPL_RELEASE_VERSION || defaultReleaseVersion(),
    macArch,
    standardArtifactsDir: values['standard-artifacts-dir']
      ? path.resolve(values['standard-artifacts-dir'])
      : process.env.OPL_STANDARD_ARTIFACTS_DIR
        ? path.resolve(process.env.OPL_STANDARD_ARTIFACTS_DIR)
        : '',
    fullPackageDir,
    releaseNotesFile: values['release-notes-file']
      ? path.resolve(values['release-notes-file'])
      : process.env.OPL_RELEASE_NOTES_FILE
        ? path.resolve(process.env.OPL_RELEASE_NOTES_FILE)
        : '',
    includeFullPackage: values['include-full-package'] === true || fullPackageOnly || values['full-package-dir'] !== undefined,
    fullPackageOnly,
    dryRun: values['dry-run'] === true,
  };
}

function retirementReceipt(argv: string[]) {
  const message = 'Direct release publication is retired; only local --dry-run asset inspection remains available.';
  return {
    schema: 'opl_app_direct_release_publisher_retired.v1',
    status: 'retired_fail_closed',
    lifecycle: 'historical_dry_run_asset_inspector_only',
    failure: {
      kind: 'retired_direct_entrypoint',
      input_digest: `sha256:${crypto.createHash('sha256').update(JSON.stringify(argv)).digest('hex')}`,
      stdout: '',
      stderr: message,
    },
    mutation_authorized: false,
    remote_read_attempted: false,
    remote_write_attempted: false,
    release_mutation_attempted: false,
    framework_handoff: {
      state_authority: 'opl_release_bundle_checkpoint.v1',
      executor: 'scripts/framework-release-adapter.ts',
      allowed_stable_operations: ['standard', 'resume_standard', 'append_full'],
    },
  };
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertUpdaterMetadataDoesNotReferenceFull(releaseDir: string, names: string[]) {
  for (const name of names.filter((entry) => /^latest.*\.yml$/.test(entry))) {
    if (/One[ .-]Person[ .-]Lab[ .-]Full-|One-Person-Lab-Full-/.test(fs.readFileSync(path.join(releaseDir, name), 'utf8'))) {
      throw new Error(`${name} must not reference One Person Lab Full assets.`);
    }
  }
}

function assertStandardArtifactDoesNotContainFullRuntime(
  shellRoot: string,
  version: string,
  macArch: string,
) {
  const appPath = path.join(
    resolveActiveShellPaths({ shellRoot }).buildOutputDir,
    `mac-${macArch}`,
    'One Person Lab.app',
  );
  if (!fs.existsSync(appPath)) return;
  const fullRuntimePath = path.join(
    appPath,
    'Contents',
    'Resources',
    'opl-full-runtime',
    'runtime',
    'current',
  );
  if (fs.existsSync(fullRuntimePath)) {
    throw new Error(
      `Standard App release ${version} ${macArch} contains Full runtime payload at ${fullRuntimePath}; run release:prepare-standard before building standard assets.`,
    );
  }
}

function assertStandardAuthorization(releaseDir: string, version: string, macArch: string) {
  const policyPath = path.join(releaseDir, 'standard-gatekeeper-launch-policy.json');
  const receiptPath = path.join(releaseDir, 'standard-apple-notarization-receipt.json');
  const dmgPath = path.join(releaseDir, `One-Person-Lab-${version}-mac-${macArch}.dmg`);
  if (!fs.existsSync(policyPath) || !fs.existsSync(receiptPath) || !fs.existsSync(dmgPath)) {
    throw new Error('Missing Standard Developer ID/notarization evidence or final DMG.');
  }
  const policy = assertGatekeeperLaunchPolicy(readJson(policyPath), 'app_standard', path.basename(policyPath));
  const receipt = assertAppleNotarizationReceipt(readJson(receiptPath), path.basename(receiptPath));
  if (
    policy.team_identifier !== receipt.team_identifier
    || policy.notarization_receipt_sha256 !== fileSha256(receiptPath)
    || receipt.final_stapled_dmg_sha256 !== fileSha256(dmgPath)
    || receipt.final_stapled_dmg_size_bytes !== fs.statSync(dmgPath).size
  ) {
    throw new Error('Standard Apple distribution evidence does not bind the final DMG bytes.');
  }
}

function standardArtifactNames(releaseDir: string, version: string, macArch: string) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const artifact = new RegExp(`^One(?:[ .-])Person(?:[ .-])Lab-${escaped}-mac-${macArch}\\.(?:dmg|zip|zip\\.blockmap)$`);
  const metadata = new RegExp(`^latest-${macArch}-mac\\.yml$`);
  return fs.readdirSync(releaseDir).filter((name) => (
    artifact.test(name)
    || metadata.test(name)
    || name === 'opl-install.sh'
    || name === 'standard-gatekeeper-launch-policy.json'
    || name === 'standard-apple-notarization-receipt.json'
  ));
}

function inspectStandardArtifacts(options: Options) {
  if (options.fullPackageOnly) return [];
  const shellPaths = resolveActiveShellPaths({ shellRoot: options.shellRoot });
  const releaseDir = options.standardArtifactsDir || [
    path.join(options.shellRoot, 'release'),
    shellPaths.buildOutputDir,
  ].find((candidate) => fs.existsSync(candidate));
  if (!releaseDir || !fs.existsSync(releaseDir)) {
    throw new Error('Missing prebuilt Standard asset directory; this retired inspector never builds assets.');
  }
  const names = standardArtifactNames(releaseDir, options.version, options.macArch);
  for (const [label, predicate] of [
    ['DMG', (name: string) => name.endsWith('.dmg')],
    ['ZIP', (name: string) => name.endsWith('.zip')],
    [`latest-${options.macArch}-mac.yml`, (name: string) => name === `latest-${options.macArch}-mac.yml`],
  ] as const) {
    if (!names.some(predicate)) throw new Error(`Missing prebuilt Standard asset: ${label}`);
  }
  assertStandardArtifactDoesNotContainFullRuntime(
    options.shellRoot,
    options.version,
    options.macArch,
  );
  assertUpdaterMetadataDoesNotReferenceFull(releaseDir, names);
  assertStandardAuthorization(releaseDir, options.version, options.macArch);
  return names.map((name) => path.join(releaseDir, name)).sort();
}

function inspectFullArtifacts(options: Options) {
  if (!options.includeFullPackage) return [];
  if (options.macArch !== 'arm64') throw new Error('Full first-install assets support macOS arm64 only.');
  const dmgName = `One-Person-Lab-Full-${options.version}-mac-arm64.dmg`;
  const manifestPath = path.join(options.fullPackageDir, 'opl-release-manifest.json');
  const dmgPath = path.join(options.fullPackageDir, dmgName);
  if (!fs.existsSync(dmgPath) || !fs.existsSync(manifestPath)) {
    throw new Error(`Missing Full asset pair under ${options.fullPackageDir}.`);
  }
  const releaseManifest = readJson(manifestPath);
  if (releaseManifest.schema !== 'opl_public_release_manifest.v1'
    || releaseManifest.package_kind !== 'opl_full_first_install_macos_arm64'
    || releaseManifest.version !== options.version
    || releaseManifest.primary_install_asset !== dmgName) {
    throw new Error('Full public release manifest identity is invalid.');
  }
  const asset = Array.isArray(releaseManifest.assets)
    ? releaseManifest.assets.find((entry: any) => entry?.name === dmgName)
    : null;
  if (!asset
    || asset.size_bytes !== fs.statSync(dmgPath).size
    || asset.sha256 !== fileSha256(dmgPath)) {
    throw new Error(`Full public release manifest does not bind ${dmgName} bytes.`);
  }
  if (releaseManifest.manifest?.distribution?.updater_metadata_allowed !== false) {
    throw new Error('Full first-install assets cannot supply updater metadata.');
  }
  const gatekeeperPolicy = assertGatekeeperLaunchPolicy(
    releaseManifest.evidence?.gatekeeper_launch_policy,
    'app_full_first_install',
    'opl-release-manifest.json#evidence.gatekeeper_launch_policy',
  );
  const notarizationReceipt = assertAppleNotarizationReceipt(
    releaseManifest.evidence?.apple_notarization_receipt,
    'opl-release-manifest.json#evidence.apple_notarization_receipt',
  );
  const notarizationReceiptSha256 = crypto
    .createHash('sha256')
    .update(`${JSON.stringify(notarizationReceipt, null, 2)}\n`)
    .digest('hex');
  if (
    gatekeeperPolicy.team_identifier !== notarizationReceipt.team_identifier
    || gatekeeperPolicy.notarization_receipt_sha256 !== notarizationReceiptSha256
    || notarizationReceipt.final_stapled_dmg_sha256 !== asset.sha256
    || notarizationReceipt.final_stapled_dmg_size_bytes !== asset.size_bytes) {
    throw new Error(`Full Apple distribution evidence does not bind ${dmgName} to one Developer ID identity.`);
  }
  const runtimeNativeTrust = releaseManifest.evidence?.runtime_native_trust;
  assertFullRuntimeNativeTrustObject(
    runtimeNativeTrust,
    releaseManifest.manifest,
    {
      missingMessage: 'Full public release manifest is missing runtime native trust evidence.',
      requireProductionTrust: true,
      expectedTeamIdentifier: notarizationReceipt.team_identifier,
    },
  );
  if (
    gatekeeperPolicy.runtime_native_trust_status !== runtimeNativeTrust.status
    || gatekeeperPolicy.runtime_native_executable_count !== runtimeNativeTrust.executable_count
  ) {
    throw new Error('Full Gatekeeper policy does not bind the embedded runtime native trust receipt.');
  }
  return [dmgPath, manifestPath];
}

function releaseNotesMode() {
  const mode = (process.env.OPL_RELEASE_NOTES_MODE || 'ai').trim().toLowerCase();
  if (!['ai', 'template'].includes(mode)) throw new Error(`Unsupported OPL_RELEASE_NOTES_MODE: ${mode}`);
  return mode;
}

function inspectPreparedNotes(options: Options, fullManifest: unknown) {
  const input = {
    version: options.version,
    channel: options.version.includes('-nightly') ? 'nightly' : 'stable',
    releaseRepo: options.releaseRepo,
    shellRoot: options.shellRoot,
    includeFullPackage: options.includeFullPackage,
    fullPackageManifest: fullManifest,
    currentTag: `v${options.version}`,
  };
  const evidence = buildReleaseNotesEvidence(input);
  if (options.releaseNotesFile) {
    const notes = fs.readFileSync(options.releaseNotesFile, 'utf8');
    validateAiReleaseNotes(notes, evidence);
    return { mode: 'file', notes };
  }
  const mode = releaseNotesMode();
  return {
    mode,
    notes: mode === 'template' ? buildReleaseNotesDocument(input) : buildAiReleaseNotesDocument(evidence),
  };
}

function assetIdentity(filePath: string) {
  return {
    name: path.basename(filePath),
    path: filePath,
    size_bytes: fs.statSync(filePath).size,
    sha256: `sha256:${fileSha256(filePath)}`,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const options = parseArgs(argv);
  if (!options.dryRun) {
    const receipt = retirementReceipt(argv);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    console.error(receipt.failure.stderr);
    process.exitCode = 2;
    return;
  }
  assertReleaseVersionNotFuture(options.version.includes('-nightly') ? 'nightly' : 'stable', options.version);
  if (options.releaseRepo !== canonicalRepository) {
    throw new Error(`Asset inspection is restricted to ${canonicalRepository}.`);
  }
  const standardArtifacts = inspectStandardArtifacts(options);
  const fullArtifacts = inspectFullArtifacts(options);
  const fullManifest = options.includeFullPackage
    ? readJson(path.join(options.fullPackageDir, 'opl-release-manifest.json')).manifest ?? null
    : null;
  const releaseNotes = inspectPreparedNotes(options, fullManifest);
  const assets = [...standardArtifacts, ...fullArtifacts].map(assetIdentity);
  process.stdout.write(`${JSON.stringify({
    schema: 'opl_app_release_asset_inspection.v1',
    status: 'dry_run_complete',
    lifecycle: 'historical_non_authoritative',
    release_repo: options.releaseRepo,
    version: options.version,
    tag: `v${options.version}`,
    shell_root: options.shellRoot,
    mac_arch: options.macArch,
    standard_artifacts_dir: options.standardArtifactsDir || null,
    full_package_only: options.fullPackageOnly,
    release_notes_file: options.releaseNotesFile || null,
    artifacts: assets.map((asset) => asset.path),
    standard_artifacts: standardArtifacts,
    full_package_artifacts: fullArtifacts,
    asset_identities: assets,
    release_notes_mode: releaseNotes.mode,
    release_notes: releaseNotes.notes,
    build_performed: false,
    remote_inspection_performed: false,
    remote_mutation_attempted: false,
    mutation_authorized: false,
  }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
