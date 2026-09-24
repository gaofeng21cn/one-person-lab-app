#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readActiveShellBuildProfile } from './active-shell-build-profile.ts';

type ArtifactProfile =
  | 'stable_required'
  | 'nightly_standard'
  | 'preview_standard'
  | 'stable_desktop_additional'
  | 'manual';

type PlatformCapability = {
  default_enabled: boolean;
  quality_channels: string[];
  stable_allowed: boolean;
  blocks_stable: boolean;
  build_available: boolean;
  build_route: string;
  publication_status: string;
  publication_route: string | null;
  build: {
    os: string;
    command: string;
    artifact_commands?: Partial<Record<ArtifactProfile, string>>;
    arch: string;
    native_arch?: string;
    artifact_names: Partial<Record<ArtifactProfile, string>>;
  };
};

type PlatformPolicy = {
  quality_channel: string;
  platforms: string[];
  default_enabled: boolean;
  required: boolean;
  blocks_base_terminal: boolean;
  selection_mode?: 'capability_default_enabled_only';
  artifact_profile: ArtifactProfile;
};

type ReleasePlatformContract = {
  schema: 'opl_app_release_platform_matrix.v1';
  resolver: string;
  capabilities: Record<string, PlatformCapability>;
  policies: Record<string, PlatformPolicy>;
};

export type ReleaseBuildMatrixEntry = {
  platform: string;
  os: string;
  command: string;
  'artifact-name': string;
  arch: string;
  native_arch?: string;
};

export type ReleaseBuildMatrix = {
  include: ReleaseBuildMatrixEntry[];
};

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readContract(contractPath = path.join(appRoot, 'contracts', 'app-release-channel.json')) {
  const document = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as {
    release_platform_matrix?: ReleasePlatformContract;
  };
  const contract = document.release_platform_matrix;
  if (
    contract?.schema !== 'opl_app_release_platform_matrix.v1'
    || contract.resolver !== 'scripts/resolve-release-platform-matrix.ts'
  ) {
    throw new Error('Release platform matrix contract is missing or unsupported.');
  }
  return contract;
}

function matrixEntry(
  platform: string,
  capability: PlatformCapability,
  artifactProfile: ArtifactProfile,
): ReleaseBuildMatrixEntry {
  if (!capability.build_available) {
    throw new Error(`Platform ${platform} is not build-capable.`);
  }
  const artifactName = capability.build.artifact_names[artifactProfile];
  if (!artifactName) {
    throw new Error(`Platform ${platform} has no audited artifact for ${artifactProfile}.`);
  }
  return {
    platform,
    os: capability.build.os,
    command: readActiveShellBuildProfile().id === 'opl-studio'
      ? `node scripts/desktop/build-release.mjs --platform ${platform.startsWith('macos') ? 'darwin' : platform.startsWith('windows') ? 'win32' : 'linux'} --arch ${capability.build.arch}`
      : capability.build.artifact_commands?.[artifactProfile] ?? capability.build.command,
    'artifact-name': artifactName,
    arch: capability.build.arch,
    ...(capability.build.native_arch ? { native_arch: capability.build.native_arch } : {}),
  };
}

export function resolveReleasePlatformMatrix(input: {
  policy: string;
  platform?: string;
  platforms?: string[];
  contractPath?: string;
}): ReleaseBuildMatrix {
  const contract = readContract(input.contractPath);
  const policy = contract.policies[input.policy];
  if (!policy) throw new Error(`Unknown audited release platform policy: ${input.policy}.`);

  let platforms = policy.selection_mode === 'capability_default_enabled_only'
    ? policy.platforms.filter((platform) => contract.capabilities[platform]?.default_enabled === true)
    : policy.platforms;
  if (input.platform !== undefined && input.platforms !== undefined) {
    throw new Error('Use either one --platform or one audited platform ID list, never both.');
  }
  if (input.platforms !== undefined) {
    if (input.policy !== 'stable_desktop_additional') {
      throw new Error('An explicit platform ID list is allowed only with stable_desktop_additional.');
    }
    if (!Array.isArray(input.platforms) || input.platforms.some(
      (platform) => typeof platform !== 'string' || !platform.trim() || platform.trim() !== platform,
    )) {
      throw new Error('Explicit additional Desktop platforms must be one JSON array of audited platform IDs.');
    }
    platforms = input.platforms;
  } else if (input.platform !== undefined) {
    if (input.policy !== 'manual_all') {
      throw new Error('An explicit platform ID is allowed only with manual_all.');
    }
    platforms = input.platform === 'all' ? policy.platforms : [input.platform];
  }

  if (new Set(platforms).size !== platforms.length) {
    throw new Error(`Policy ${input.policy} must select unique platform IDs.`);
  }

  return {
    include: platforms.map((platform) => {
      if (!policy.platforms.includes(platform)) {
        throw new Error(`Platform ${platform} is outside audited policy ${input.policy}.`);
      }
      const capability = contract.capabilities[platform];
      if (!capability) throw new Error(`Unknown audited release platform ID: ${platform}.`);
      if (!capability.quality_channels.includes(policy.quality_channel)) {
        throw new Error(
          `Platform ${platform} does not allow quality channel ${policy.quality_channel}.`,
        );
      }
      if (input.policy === 'stable_required' && !capability.blocks_stable) {
        throw new Error(`Required policy ${input.policy} selected non-blocking platform ${platform}.`);
      }
      if (input.policy === 'stable_desktop_additional' && capability.blocks_stable) {
        throw new Error(`Additional Desktop policy ${input.policy} selected Stable blocker ${platform}.`);
      }
      return matrixEntry(platform, capability, policy.artifact_profile);
    }),
  };
}

function main(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      policy: { type: 'string' },
      platform: { type: 'string' },
      'platforms-json': { type: 'string' },
      'github-output': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  const policy = values.policy?.trim();
  if (!policy) throw new Error('Missing --policy.');
  const platform = values.platform?.trim();
  if (values.platform !== undefined && !platform) throw new Error('--platform cannot be empty.');
  let platforms: string[] | undefined;
  if (values['platforms-json'] !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(values['platforms-json']);
    } catch {
      throw new Error('--platforms-json must contain one JSON array.');
    }
    if (!Array.isArray(parsed)) throw new Error('--platforms-json must contain one JSON array.');
    platforms = parsed as string[];
  }

  const matrix = resolveReleasePlatformMatrix({ policy, platform, platforms });
  const json = JSON.stringify(matrix);
  if (values['github-output']) {
    fs.appendFileSync(path.resolve(values['github-output']), `${[
      `matrix=${json}`,
      `platform_count=${matrix.include.length}`,
      `platform_ids=${JSON.stringify(matrix.include.map((entry) => entry.platform))}`,
      `artifact_names=${JSON.stringify(matrix.include.map((entry) => entry['artifact-name']))}`,
    ].join('\n')}\n`);
  }
  process.stdout.write(`${json}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
