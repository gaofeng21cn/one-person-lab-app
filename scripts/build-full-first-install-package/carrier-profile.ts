import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readAppShellAdapterContract,
  resolveShellAdapterIdentity,
  type ShellAdapterContract,
} from '../app-shell-adapter.ts';

export type FullCarrierId = 'aionui' | 'opl-studio';

export type FullCarrierProfile = {
  schema: 'opl_app_full_payload_carrier_profile.v1';
  carrierId: FullCarrierId;
  profileId: string;
  productName: string;
  appBundleName: string;
  bundleId: string;
  packageKind: string;
  artifactNameTemplate: string;
  runtimeArtifactNameTemplate: string;
  standardArtifactNameTemplate: string;
  standardZipArtifactNameTemplate: string;
  runtimeResourceDir: string;
  runtimeInstallRootTemplate: string;
  runtimeVersionMetadataPath: string;
  dmgVolumeNameTemplate: string;
  shellRuntimePath: string | null;
  shellRuntimeRequired: boolean;
  codexCarrier: 'aioncore_codex_only' | 'opl_codex_native';
  aioncoreRequired: boolean;
  fullRuntimeCodexPayloadAllowed: false;
};

type CarrierProfileContract = {
  schema: 'opl_app_full_payload_carrier_profile.v1';
  carrier_id: FullCarrierId;
  profile_id: string;
  product_name: string;
  app_bundle_name: string;
  bundle_id: string;
  package_kind: string;
  artifact_name_template: string;
  runtime_artifact_name_template: string;
  standard_artifact_name_template: string;
  standard_zip_artifact_name_template: string;
  runtime_resource_dir: string;
  runtime_install_root_template: string;
  runtime_version_metadata_path: string;
  dmg_volume_name_template: string;
  shell_runtime_path: string | null;
  shell_runtime_required: boolean;
  codex_carrier: FullCarrierProfile['codexCarrier'];
  aioncore_required: boolean;
  full_runtime_codex_payload_allowed: false;
};

type CarrierProfileOptions = {
  carrierId?: string | null;
  contract?: ShellAdapterContract;
};

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const releaseContractPath = path.join(appRoot, 'contracts', 'app-release-channel.json');

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readCarrierProfiles(): Record<string, CarrierProfileContract> {
  const release = readJson(releaseContractPath) as {
    full_first_install?: { carrier_profiles?: unknown };
  };
  const profiles = release.full_first_install?.carrier_profiles as Record<string, CarrierProfileContract>;
  invariant(profiles && typeof profiles === 'object' && !Array.isArray(profiles),
    'App Full payload carrier profiles are missing.');
  return profiles;
}

function validateProfile(value: unknown, carrierId: string): CarrierProfileContract {
  const profile = value as CarrierProfileContract;
  invariant(profile?.schema === 'opl_app_full_payload_carrier_profile.v1',
    `Full payload carrier profile ${carrierId} has an invalid schema.`);
  invariant(profile.carrier_id === carrierId, `Full payload carrier profile ${carrierId} has an invalid carrier_id.`);
  invariant(profile.carrier_id === 'aionui' || profile.carrier_id === 'opl-studio',
    `Unsupported Full payload carrier: ${carrierId}`);
  for (const [key, valueToCheck] of Object.entries(profile)) {
    if (key === 'shell_runtime_path') {
      invariant(valueToCheck === null || typeof valueToCheck === 'string',
        `${carrierId} Full payload profile shell_runtime_path is invalid.`);
    } else if (key === 'shell_runtime_required' || key === 'aioncore_required') {
      invariant(typeof valueToCheck === 'boolean',
        `${carrierId} Full payload profile ${key} is invalid.`);
    } else if (key === 'full_runtime_codex_payload_allowed') {
      invariant(valueToCheck === false,
        `${carrierId} Full payload profile must forbid Framework Codex payloads.`);
    } else {
      invariant(typeof valueToCheck === 'string' && valueToCheck.trim(),
        `${carrierId} Full payload profile ${key} is invalid.`);
    }
  }
  invariant(profile.shell_runtime_required === (profile.shell_runtime_path !== null),
    `${carrierId} Full payload profile shell runtime requirement is inconsistent.`);
  invariant(profile.aioncore_required === (profile.codex_carrier === 'aioncore_codex_only'),
    `${carrierId} Full payload profile Codex carrier is inconsistent with AionCore requirement.`);
  invariant(profile.full_runtime_codex_payload_allowed === false,
    `${carrierId} Full payload profile must not embed a Framework-managed Codex payload.`);
  return profile;
}

export function resolveFullCarrierProfile(options: CarrierProfileOptions = {}): FullCarrierProfile {
  const contract = options.contract ?? readAppShellAdapterContract();
  const explicitCarrierId = options.carrierId?.trim() || process.env.OPL_FULL_CARRIER_ID?.trim() || '';
  const carrierId = (explicitCarrierId || resolveShellAdapterIdentity(contract)) as FullCarrierId;
  const profile = validateProfile(readCarrierProfiles()[carrierId], carrierId);
  if (!explicitCarrierId && contract.candidate_shell === 'opl-studio' && carrierId !== 'opl-studio') {
    throw new Error('OPL Studio Full build must resolve the opl-studio payload carrier profile.');
  }
  if (!explicitCarrierId && contract.active_shell === 'aionui' && carrierId !== 'aionui') {
    throw new Error('AionUI Full build must resolve the aionui payload carrier profile.');
  }
  return Object.freeze({
    schema: profile.schema,
    carrierId: profile.carrier_id,
    profileId: profile.profile_id,
    productName: profile.product_name,
    appBundleName: profile.app_bundle_name,
    bundleId: profile.bundle_id,
    packageKind: profile.package_kind,
    artifactNameTemplate: profile.artifact_name_template,
    runtimeArtifactNameTemplate: profile.runtime_artifact_name_template,
    standardArtifactNameTemplate: profile.standard_artifact_name_template,
    standardZipArtifactNameTemplate: profile.standard_zip_artifact_name_template,
    runtimeResourceDir: profile.runtime_resource_dir,
    runtimeInstallRootTemplate: profile.runtime_install_root_template,
    runtimeVersionMetadataPath: profile.runtime_version_metadata_path,
    dmgVolumeNameTemplate: profile.dmg_volume_name_template,
    shellRuntimePath: profile.shell_runtime_path,
    shellRuntimeRequired: profile.shell_runtime_required,
    codexCarrier: profile.codex_carrier,
    aioncoreRequired: profile.aioncore_required,
    fullRuntimeCodexPayloadAllowed: profile.full_runtime_codex_payload_allowed,
  });
}

export function formatCarrierTemplate(template: string, input: { version: string; arch?: string }): string {
  return template
    .replaceAll('${version}', input.version)
    .replaceAll('${arch}', input.arch ?? 'mac-arm64');
}
