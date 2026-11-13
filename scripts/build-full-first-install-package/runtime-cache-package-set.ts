import crypto from 'node:crypto';

import { readAppProductProfile } from '../app-product-profile/profile-contract.ts';
import { readGitHead } from './git.ts';
import { directoryFingerprint } from './hashing.ts';

export const FULL_RUNTIME_DEFAULT_DEPENDENCY_CLOSURE = [
  'mas',
  'mag',
  'rca',
  'oma',
  'obf',
  'mas-scholar-skills',
  'med-autocast',
  'opl-flow',
] as const;

export type FullRuntimePackageProfile = {
  profile_id: string;
  package_ids: readonly string[];
  dependency_closure: readonly string[];
};

export function buildFullRuntimeStarterProfile(productProfile: {
  official_profile: {
    desired_root_package_ids: readonly string[];
  };
}): FullRuntimePackageProfile {
  return {
    profile_id: 'starter',
    package_ids: [...productProfile.official_profile.desired_root_package_ids],
    dependency_closure: FULL_RUNTIME_DEFAULT_DEPENDENCY_CLOSURE,
  };
}

export const FULL_RUNTIME_STARTER_PROFILE = buildFullRuntimeStarterProfile(
  readAppProductProfile(),
);

type JsonRecord = Record<string, any>;

const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const runtimeModulePaths: Record<string, string> = {
  mas: 'modules/mas',
  mag: 'modules/mag',
  rca: 'modules/rca',
  oma: 'modules/meta-agent',
  obf: 'modules/bookforge',
  'mas-scholar-skills': 'modules/mas-scholar-skills',
  'opl-flow': 'modules/opl-flow',
};

function digestJson(value: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty string array`);
  }
  const values = value.map((entry, index) => requireString(entry, `${label}[${index}]`));
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicate package ids`);
  }
  return values;
}

function normalizePackageProfile(
  profile: FullRuntimePackageProfile = FULL_RUNTIME_STARTER_PROFILE,
): { profileId: string; packageIds: string[]; dependencyClosure: string[] } {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('Full runtime package profile must be an object');
  }
  const profileId = requireString(profile.profile_id, 'Full runtime package profile_id');
  const packageIds = requireStringList(profile.package_ids, 'Full runtime package profile package_ids');
  const dependencyClosure = requireStringList(
    profile.dependency_closure,
    'Full runtime package profile dependency_closure',
  );
  return { profileId, packageIds, dependencyClosure };
}

function safeRuntimeModulePath(value: unknown, label: string): string {
  const relativePath = requireString(value, label);
  if (
    !relativePath.startsWith('modules/') ||
    relativePath.includes('..') ||
    relativePath.startsWith('/')
  ) {
    throw new Error(`${label} must stay under the Full runtime modules root`);
  }
  return relativePath;
}

export function validateSelectedPackageSetInput(packageSet: JsonRecord): void {
  if (!packageSet || typeof packageSet !== 'object' || Array.isArray(packageSet)) {
    throw new Error('Selected package set must be an object');
  }
  if (packageSet.schema !== 'opl_full_runtime_selected_package_set.v1') {
    throw new Error('Selected package set schema is unsupported');
  }
  const { profileId, packageIds, dependencyClosure } = normalizePackageProfile({
    profile_id: packageSet.profile_id,
    package_ids: packageSet.package_ids,
    dependency_closure: packageSet.dependency_closure,
  });
  const packages = Array.isArray(packageSet.packages) ? packageSet.packages as JsonRecord[] : [];
  const actualIds = packages.map((entry) => entry.package_id);
  if (JSON.stringify(actualIds) !== JSON.stringify(dependencyClosure)) {
    throw new Error(
      `Selected package set must contain the ordered dependency closure for profile ${profileId}`,
    );
  }
  if (JSON.stringify(packageIds) !== JSON.stringify(packageSet.package_ids)) {
    throw new Error('Selected package set package_ids must be normalized');
  }
  for (const entry of packages) {
    const packageId = requireString(entry.package_id, 'Selected package package_id');
    if (!shaPattern.test(String(entry.source_commit ?? ''))) {
      throw new Error(`Selected package ${packageId} source commit must be exact`);
    }
    if (!digestPattern.test(String(entry.source_fingerprint ?? ''))) {
      throw new Error(`Selected package ${packageId} source fingerprint must be exact`);
    }
    safeRuntimeModulePath(
      entry.runtime_module_relative_path,
      `${packageId} runtime_module_relative_path`,
    );
  }
  if (!digestPattern.test(String(packageSet.identity ?? ''))) {
    throw new Error('Selected package set identity must be exact');
  }
  const { identity, ...payload } = packageSet;
  if (digestJson(payload) !== identity) {
    throw new Error('Selected package set identity does not match its payload');
  }
}

export function buildSelectedPackageSetInput(input: {
  packageProfile?: FullRuntimePackageProfile;
  packages: Array<{
    package_id: string;
    source_commit: string;
    source_fingerprint: string;
    runtime_module_relative_path: string;
  }>;
}) {
  const packageProfile = input.packageProfile ?? FULL_RUNTIME_STARTER_PROFILE;
  const { profileId, packageIds, dependencyClosure } = normalizePackageProfile(packageProfile);
  const payload = {
    schema: 'opl_full_runtime_selected_package_set.v1',
    profile_id: profileId,
    package_ids: packageIds,
    dependency_closure: dependencyClosure,
    packages: input.packages,
  };
  const result = {
    ...payload,
    identity: digestJson(payload),
  };
  validateSelectedPackageSetInput(result);
  return result;
}

export function resolveSelectedPackageSetInput(
  options: JsonRecord,
  packageProfile: FullRuntimePackageProfile = FULL_RUNTIME_STARTER_PROFILE,
) {
  const normalizedProfile = normalizePackageProfile(packageProfile);
  const defaultSourceRoots: Record<string, string | undefined> = {
    mas: options.masRoot,
    'med-autocast': options.macRoot,
    mag: options.magRoot,
    rca: options.rcaRoot,
    oma: options.metaAgentRoot,
    obf: options.bookforgeRoot,
    'mas-scholar-skills': options.masScholarSkillsRoot,
    'opl-flow': options.oplFlowRoot,
  };
  const customSourceRoots =
    options.packageRoots && typeof options.packageRoots === 'object' && !Array.isArray(options.packageRoots)
      ? options.packageRoots as Record<string, string>
      : {};
  const customRuntimeModulePaths =
    options.packageRuntimeModulePaths
      && typeof options.packageRuntimeModulePaths === 'object'
      && !Array.isArray(options.packageRuntimeModulePaths)
      ? options.packageRuntimeModulePaths as Record<string, string>
      : {};

  const packages = normalizedProfile.dependencyClosure.map((packageId) => {
    const sourceRoot = customSourceRoots[packageId] ?? defaultSourceRoots[packageId];
    if (typeof sourceRoot !== 'string' || sourceRoot.trim() === '') {
      throw new Error(`Selected package ${packageId} source root is missing`);
    }
    const sourceCommit = readGitHead(sourceRoot);
    if (!sourceCommit || !shaPattern.test(sourceCommit)) {
      throw new Error(`Selected package ${packageId} source commit is unavailable`);
    }
    const runtimeModulePath = safeRuntimeModulePath(
      customRuntimeModulePaths[packageId] ?? runtimeModulePaths[packageId] ?? `modules/${packageId}`,
      `${packageId} runtime_module_relative_path`,
    );
    const sourceFingerprint = directoryFingerprint(sourceRoot, runtimeModulePath);
    if (!sourceFingerprint) {
      throw new Error(`Selected package ${packageId} source fingerprint is unavailable`);
    }
    return {
      package_id: packageId,
      source_commit: sourceCommit,
      source_fingerprint: `sha256:${sourceFingerprint}`,
      runtime_module_relative_path: runtimeModulePath,
    };
  });

  return buildSelectedPackageSetInput({ packageProfile, packages });
}
