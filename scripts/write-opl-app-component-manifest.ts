#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  assertUpdaterVersionMatchesDisplay,
  derivePreviewKind,
  type ReleaseBuildTrigger,
  type ReleaseQualityStatus,
} from './release-version.ts';

export type ReleaseAsset = {
  name?: string;
  url?: string;
  digest?: string;
  size?: number;
  contentType?: string;
};

export type AppComponentManifestInput = {
  version: string;
  updaterVersion: string;
  sourceCommit: string;
  shellCommit: string;
  frameworkCommit: string;
  tag: string;
  releaseUrl: string;
  assets: ReleaseAsset[];
  repo: string;
};

function releaseIdentity(version: string, updaterVersion: string) {
  const versionChannel = version.includes('-nightly')
    ? 'nightly'
    : version.includes('-preview.')
      ? 'preview'
      : 'stable';
  assertUpdaterVersionMatchesDisplay(versionChannel, version, updaterVersion);
  const qualityStatus: ReleaseQualityStatus = versionChannel === 'stable' ? 'stable' : 'preview';
  const buildTrigger: ReleaseBuildTrigger = versionChannel === 'nightly' ? 'automated' : 'manual';
  const previewKind = derivePreviewKind(qualityStatus, buildTrigger);
  const qualificationDisclosure = qualityStatus === 'stable'
    ? {
        stable_qualified: true,
        passed_gates: ['standard_vm'],
        skipped_gates: [],
        failed_gates: [],
        non_stable_notice: false,
      }
    : previewKind === 'nightly'
      ? {
          stable_qualified: false,
          passed_gates: [],
          skipped_gates: [
            'stable_heavy_vm',
            'homebrew_clean_install',
            'native_webui',
            'container_webui',
            'full',
          ],
          failed_gates: [],
          non_stable_notice: true,
        }
      : {
          stable_qualified: false,
          passed_gates: ['standard_vm'],
          skipped_gates: ['homebrew_clean_install', 'native_webui', 'container_webui', 'full'],
          failed_gates: [],
          non_stable_notice: true,
        };
  return {
    versionChannel,
    qualityStatus,
    buildTrigger,
    previewKind,
    qualificationDisclosure,
    distributionPointerPolicy: qualityStatus === 'stable'
      ? {
          pointer: 'latest',
          automatic_writer: 'qualified_stable_default',
          explicit_override: 'protected_single_use_exact_version',
          quality_unchanged: true,
          stable_reclaim: 'next_qualified_stable',
        }
      : {
          pointer: 'latest',
          automatic_writer: 'never',
          explicit_override: 'protected_single_use_exact_version',
          quality_unchanged: true,
          stable_reclaim: 'next_qualified_stable',
        },
  } as const;
}

function options(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      version: { type: 'string' },
      'updater-version': { type: 'string' },
      'source-commit': { type: 'string' },
      'shell-commit': { type: 'string' },
      'framework-commit': { type: 'string' },
      'release-json': { type: 'string' },
      output: { type: 'string' },
      repo: { type: 'string', default: 'gaofeng21cn/one-person-lab-app' },
    },
    strict: true,
  });
  const version = values.version?.trim() ?? '';
  const updaterVersion = values['updater-version']?.trim() ?? '';
  const sourceCommit = values['source-commit']?.trim() ?? '';
  const shellCommit = values['shell-commit']?.trim() ?? '';
  const frameworkCommit = values['framework-commit']?.trim() ?? '';
  if (!/^\d{2}\.\d{1,2}\.\d{1,2}(?:(?:-r[1-9][0-9]*)|-nightly(?:\.r[1-9][0-9]*)?|-preview\.r[1-9][0-9]*)?$/.test(version)
    || !updaterVersion
    || !/^[0-9a-f]{40}$/.test(sourceCommit)
    || !/^[0-9a-f]{40}$/.test(shellCommit)
    || !/^[0-9a-f]{40}$/.test(frameworkCommit)
    || !values['release-json']
    || !values.output) {
    throw new Error('Pass --version <display-version> --updater-version <machine-semver> --source-commit <sha> --shell-commit <sha> --framework-commit <sha> --release-json <json> --output <json>.');
  }
  return {
    version,
    updaterVersion,
    sourceCommit,
    shellCommit,
    frameworkCommit,
    releaseJson: path.resolve(values['release-json']),
    output: path.resolve(values.output),
    repo: values.repo?.trim() ?? 'gaofeng21cn/one-person-lab-app',
  };
}

function normalizeAsset(asset: ReleaseAsset) {
  const name = asset.name?.trim() ?? '';
  const ref = asset.url?.trim() ?? '';
  const digest = asset.digest?.trim() ?? '';
  if (!name || !ref || !/^sha256:[0-9a-f]{64}$/.test(digest) || !Number.isFinite(asset.size) || Number(asset.size) <= 0) {
    throw new Error(`Release asset is not immutable: ${name || 'unnamed'}`);
  }
  return {
    name,
    ref,
    digest,
    size: Number(asset.size),
    content_type: asset.contentType?.trim() || 'application/octet-stream',
  };
}

export function createAppComponentManifest(input: AppComponentManifestInput) {
  const identity = releaseIdentity(input.version, input.updaterVersion);
  if (input.tag !== `v${input.version}`) {
    throw new Error(`Release tag does not describe v${input.version}.`);
  }
  const hasInstallerBootstrap = input.assets.some(
    (asset) => asset.name?.trim() === 'opl-app-installer.sh',
  );
  const hasUniversalInstaller = input.assets.some(
    (asset) => asset.name?.trim() === 'opl-install.sh',
  );
  const standardAssetNames = new Set([
    'latest-arm64-mac.yml',
    `One-Person-Lab-${input.version}-mac-arm64.dmg`,
    `One-Person-Lab-${input.version}-mac-arm64.zip`,
    `One-Person-Lab-${input.version}-mac-arm64.zip.blockmap`,
    ...(hasUniversalInstaller ? ['opl-install.sh'] : []),
    ...(hasInstallerBootstrap ? ['opl-app-installer.sh'] : []),
    ...(identity.versionChannel === 'nightly'
      ? []
      : ['standard-gatekeeper-launch-policy.json', 'standard-apple-notarization-receipt.json']),
  ]);
  const artifacts = input.assets
    .filter((asset: ReleaseAsset) => standardAssetNames.has(asset.name ?? ''))
    .map(normalizeAsset)
    .sort((left, right) => left.name.localeCompare(right.name));
  const primaryArtifact = artifacts.find((asset) => asset.name === `One-Person-Lab-${input.version}-mac-arm64.dmg`);
  if (!primaryArtifact) throw new Error(`Release v${input.version} has no canonical mac-arm64 DMG.`);
  if (artifacts.length !== standardAssetNames.size) throw new Error(`Release v${input.version} is missing standard App assets.`);
  const core = {
    surface_kind: 'opl_app_component_manifest.v1',
    component_id: 'opl-app',
    version: input.version,
    release_version: input.version,
    updater_version: input.updaterVersion,
    quality_status: identity.qualityStatus,
    build_trigger: identity.buildTrigger,
    preview_kind: identity.previewKind,
    distribution_pointer_policy: identity.distributionPointerPolicy,
    qualification_disclosure: identity.qualificationDisclosure,
    source_commit: input.sourceCommit,
    source_cohort: {
      app_sha: input.sourceCommit,
      shell_sha: input.shellCommit,
      framework_sha: input.frameworkCommit,
    },
    release_tag: input.tag,
    release_url: input.releaseUrl,
    primary_artifact: primaryArtifact,
    artifacts,
    component_manifest_ref: `https://github.com/${input.repo}/releases/download/${input.tag}/opl-app-component-manifest.json`,
  };
  return {
    ...core,
    component_manifest_digest: `sha256:${crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex')}`,
  };
}

function main() {
  const input = options(process.argv.slice(2));
  const release = JSON.parse(fs.readFileSync(input.releaseJson, 'utf8')) as Record<string, unknown>;
  const tag = String(release.tagName ?? '');
  const identity = releaseIdentity(input.version, input.updaterVersion);
  const expectedPrerelease = identity.versionChannel === 'nightly';
  if (tag !== `v${input.version}` || release.isPrerelease !== expectedPrerelease) {
    throw new Error(`Release JSON does not describe v${input.version} with the expected channel.`);
  }
  const component = createAppComponentManifest({
    version: input.version,
    updaterVersion: input.updaterVersion,
    sourceCommit: input.sourceCommit,
    shellCommit: input.shellCommit,
    frameworkCommit: input.frameworkCommit,
    tag,
    releaseUrl: String(release.url ?? ''),
    assets: Array.isArray(release.assets) ? release.assets : [],
    repo: input.repo,
  });
  fs.mkdirSync(path.dirname(input.output), { recursive: true });
  fs.writeFileSync(input.output, `${JSON.stringify(component, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ status: 'written', output: input.output, component_manifest_digest: component.component_manifest_digest })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
