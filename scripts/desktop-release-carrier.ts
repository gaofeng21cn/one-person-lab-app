import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
  resolveActiveShellPaths,
  resolveShellAdapterIdentity,
  type ShellAdapterContract,
} from './app-shell-adapter.ts';

type CarrierRole = 'active_stable' | 'candidate_preview';

type DesktopReleaseToolchain = {
  electron: string;
  electron_builder: string;
  electron_updater: string;
};

type DesktopReleaseCarrierManifest = {
  schema: 'opl_app_desktop_release_carrier.v1';
  owner_repo: string;
  carrier_id: string;
  product_name: string;
  bundle_id: string;
  release_role: CarrierRole;
  release_repository: string;
  package_manager: 'bun' | 'npm';
  commands: {
    install: string;
    build_macos: string;
    qualify_distribution: string;
    qualify_updater: string;
    qualify_prepublication: string;
    qualify_public_release: string;
  };
  artifact_name_template: string;
  entitlements: string | null;
  carrier_specific_payload: string[];
};

type DesktopReleaseKernelContract = {
  schema: 'opl_app_desktop_release_kernel.v1';
  authority_owner: 'one-person-lab-app';
  framework_durable_authority_ref: string;
  implementation: string;
  carrier_manifest_schema: 'opl_app_desktop_release_carrier.v1';
  carrier_manifest_adapter_path: string;
  toolchain_profile_selector: 'carrier_id';
  toolchain_profiles: Record<string, DesktopReleaseToolchain>;
  macos: {
    targets: string[];
    dmg_format: string;
    hardened_runtime_required: boolean;
  };
  updater: {
    provider: string;
    metadata: string[];
    compatibility_metadata_byte_identical: boolean;
  };
  stage_order: string[];
  app_owned: string[];
  carrier_owned: string[];
  candidate_identity_policy: string;
  active_product_bundle_id: string;
  studio_preview_bundle_id: string;
};

type PackageManifest = {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type BuilderConfig = {
  appId?: string;
  productName?: string;
  artifactName?: string;
  mac?: {
    target?: unknown[];
    hardenedRuntime?: boolean;
    artifactName?: string;
    entitlements?: string;
  };
  dmg?: { format?: string };
  publish?: { provider?: string; owner?: string; repo?: string };
};

export type DesktopReleaseCarrier = {
  readonly schema: 'opl_app_desktop_release_carrier_resolution.v1';
  readonly authorityOwner: 'one-person-lab-app';
  readonly frameworkDurableAuthorityRef: string;
  readonly carrierId: string;
  readonly ownerRepo: string;
  readonly releaseRole: CarrierRole;
  readonly productName: string;
  readonly bundleId: string;
  readonly releaseRepository: string;
  readonly packageVersion: string;
  readonly artifactNameTemplate: string;
  readonly commands: Readonly<DesktopReleaseCarrierManifest['commands']>;
  readonly toolchain: Readonly<DesktopReleaseToolchain>;
  readonly macos: Readonly<Omit<DesktopReleaseKernelContract['macos'], 'targets'> & {
    targets: readonly string[];
  }>;
  readonly updater: Readonly<Omit<DesktopReleaseKernelContract['updater'], 'metadata'> & {
    metadata: readonly string[];
  }>;
  readonly stageOrder: readonly string[];
  readonly manifestPath: string;
};

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseContractPath = path.join(appRoot, 'contracts', 'app-release-channel.json');

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stringArray(value: unknown, label: string): asserts value is string[] {
  invariant(
    Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === 'string' && entry.trim()),
    `${label} must be a non-empty string array.`,
  );
}

function normalizedTargets(targets: unknown[] | undefined): string[] {
  if (!Array.isArray(targets)) return [];
  return targets.map((target) => {
    if (typeof target === 'string') return target;
    if (target && typeof target === 'object' && 'target' in target) {
      return String((target as { target?: unknown }).target ?? '');
    }
    return '';
  }).filter(Boolean);
}

function dependencyVersion(pkg: PackageManifest, name: string): string {
  return pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? '';
}

function validateKernel(value: unknown): DesktopReleaseKernelContract {
  const kernel = value as DesktopReleaseKernelContract;
  invariant(kernel?.schema === 'opl_app_desktop_release_kernel.v1', 'Desktop release kernel schema is invalid.');
  invariant(kernel.authority_owner === 'one-person-lab-app', 'Desktop release kernel authority must remain in App.');
  invariant(
    kernel.carrier_manifest_schema === 'opl_app_desktop_release_carrier.v1'
      && kernel.carrier_manifest_adapter_path === 'shell_contract.paths.desktop_release_carrier_manifest',
    'Desktop release carrier manifest seam is invalid.',
  );
  invariant(kernel.toolchain_profile_selector === 'carrier_id', 'Desktop release toolchain profiles must be selected by carrier id.');
  invariant(
    kernel.toolchain_profiles?.aionui?.electron === '41.10.3'
      && kernel.toolchain_profiles.aionui.electron_builder === '26.15.3'
      && kernel.toolchain_profiles.aionui.electron_updater === '6.8.9'
      && kernel.toolchain_profiles['opl-studio']?.electron === '44.0.0'
      && kernel.toolchain_profiles['opl-studio'].electron_builder === '26.15.3'
      && kernel.toolchain_profiles['opl-studio'].electron_updater === '6.8.9'
      && JSON.stringify(Object.keys(kernel.toolchain_profiles).sort()) === JSON.stringify(['aionui', 'opl-studio']),
    'Desktop release toolchain profiles must use the App-owned exact carrier versions.',
  );
  invariant(
    JSON.stringify(kernel.macos?.targets) === JSON.stringify(['dmg', 'zip'])
      && kernel.macos.dmg_format === 'ULFO'
      && kernel.macos.hardened_runtime_required === true,
    'Desktop release macOS policy is invalid.',
  );
  invariant(
    kernel.updater?.provider === 'github'
      && JSON.stringify(kernel.updater.metadata) === JSON.stringify(['latest-mac.yml', 'latest-arm64-mac.yml'])
      && kernel.updater.compatibility_metadata_byte_identical === true,
    'Desktop release updater policy is invalid.',
  );
  stringArray(kernel.stage_order, 'Desktop release stage order');
  stringArray(kernel.app_owned, 'Desktop release App-owned fields');
  stringArray(kernel.carrier_owned, 'Desktop release carrier-owned fields');
  return kernel;
}

function readKernel(): DesktopReleaseKernelContract {
  const release = readJson(releaseContractPath) as { desktop_release_kernel?: unknown };
  return validateKernel(release.desktop_release_kernel);
}

function validateManifest(value: unknown): DesktopReleaseCarrierManifest {
  const manifest = value as DesktopReleaseCarrierManifest;
  invariant(manifest?.schema === 'opl_app_desktop_release_carrier.v1', 'Desktop release carrier manifest schema is invalid.');
  invariant(typeof manifest.owner_repo === 'string' && manifest.owner_repo.includes('/'), 'Desktop release carrier owner repo is invalid.');
  invariant(typeof manifest.carrier_id === 'string' && manifest.carrier_id.trim(), 'Desktop release carrier id is required.');
  invariant(typeof manifest.product_name === 'string' && manifest.product_name.trim(), 'Desktop release product name is required.');
  invariant(typeof manifest.bundle_id === 'string' && manifest.bundle_id.startsWith('cn.onepersonlab.'), 'Desktop release bundle id must use the One Person Lab brand domain.');
  invariant(['active_stable', 'candidate_preview'].includes(manifest.release_role), 'Desktop release carrier role is invalid.');
  invariant(typeof manifest.release_repository === 'string' && manifest.release_repository.includes('/'), 'Desktop release repository is invalid.');
  invariant(manifest.package_manager === 'bun' || manifest.package_manager === 'npm', 'Desktop release package manager is invalid.');
  invariant(
    manifest.commands
      && Object.values(manifest.commands).every((command) => typeof command === 'string' && command.trim()),
    'Desktop release carrier commands are incomplete.',
  );
  invariant(typeof manifest.artifact_name_template === 'string' && manifest.artifact_name_template.trim(), 'Desktop release artifact template is required.');
  invariant(manifest.entitlements === null || typeof manifest.entitlements === 'string', 'Desktop release entitlements must be a path or null.');
  stringArray(manifest.carrier_specific_payload, 'Desktop release carrier payload');
  return manifest;
}

function validatePackageCommand(command: string, packageManager: string, scripts: Record<string, string> | undefined): void {
  const match = command.match(new RegExp(`^${packageManager} run ([^ ]+)$`));
  if (!match) return;
  invariant(typeof scripts?.[match[1]] === 'string', `Desktop release command references missing package script ${match[1]}.`);
}

export function resolveDesktopReleaseCarrier(options: {
  contract?: ShellAdapterContract;
  shellRoot?: string;
} = {}): DesktopReleaseCarrier {
  const shell = resolveActiveShellPaths(options);
  const manifestPath = shell.desktopReleaseCarrierManifestPath;
  invariant(manifestPath, `Shell ${resolveShellAdapterIdentity(shell.contract)} has no desktop release carrier manifest.`);
  invariant(fs.existsSync(manifestPath), `Desktop release carrier manifest is missing: ${manifestPath}`);

  const kernel = readKernel();
  const manifest = validateManifest(readJson(manifestPath));
  const pkg = readJson(shell.packageManifestPath) as PackageManifest;
  const builder = parseYaml(fs.readFileSync(shell.electronBuilderConfigPath, 'utf8')) as BuilderConfig;
  const carrierId = resolveShellAdapterIdentity(shell.contract);
  const expectedRole: CarrierRole = shell.contract.candidate_shell ? 'candidate_preview' : 'active_stable';
  const expectedBundleId = expectedRole === 'candidate_preview'
    ? kernel.studio_preview_bundle_id
    : kernel.active_product_bundle_id;

  invariant(manifest.carrier_id === carrierId, 'Desktop release carrier id does not match the selected shell adapter.');
  const toolchain = kernel.toolchain_profiles[carrierId];
  invariant(toolchain, `Desktop release carrier ${carrierId} has no App-admitted toolchain profile.`);
  invariant(manifest.owner_repo === shell.contract.shell_source.owner_repo, 'Desktop release carrier owner does not match the shell source.');
  invariant(manifest.release_role === expectedRole, 'Desktop release carrier role does not match shell adoption state.');
  invariant(manifest.bundle_id === expectedBundleId, 'Desktop release carrier bundle id does not match App product policy.');
  invariant(builder.appId === manifest.bundle_id, 'electron-builder appId does not match the carrier manifest.');
  invariant(builder.productName === manifest.product_name, 'electron-builder productName does not match the carrier manifest.');
  invariant(
    `${builder.publish?.owner}/${builder.publish?.repo}` === manifest.release_repository
      && builder.publish.provider === kernel.updater.provider,
    'electron-builder publish target does not match the App-admitted carrier feed.',
  );
  invariant(
    dependencyVersion(pkg, 'electron') === toolchain.electron
      && dependencyVersion(pkg, 'electron-builder') === toolchain.electron_builder
      && dependencyVersion(pkg, 'electron-updater') === toolchain.electron_updater,
    'Desktop release carrier Electron toolchain drifted from its App-admitted profile.',
  );
  const targets = normalizedTargets(builder.mac?.target);
  invariant(kernel.macos.targets.every((target) => targets.includes(target)), 'Desktop release carrier must build DMG and ZIP on macOS.');
  invariant(builder.mac?.hardenedRuntime === true, 'Desktop release carrier must enable hardened runtime.');
  invariant(builder.dmg?.format === kernel.macos.dmg_format, 'Desktop release carrier DMG format drifted from the App kernel.');
  invariant(
    (builder.mac?.artifactName ?? builder.artifactName) === manifest.artifact_name_template,
    'Desktop release artifact namespace does not match the carrier manifest.',
  );
  invariant((builder.mac?.entitlements ?? null) === manifest.entitlements, 'Desktop release entitlements do not match the carrier manifest.');
  invariant(typeof pkg.version === 'string' && pkg.version.trim(), 'Desktop release carrier package version is required.');
  for (const command of Object.values(manifest.commands)) {
    validatePackageCommand(command, manifest.package_manager, pkg.scripts);
  }

  return Object.freeze({
    schema: 'opl_app_desktop_release_carrier_resolution.v1',
    authorityOwner: 'one-person-lab-app',
    frameworkDurableAuthorityRef: kernel.framework_durable_authority_ref,
    carrierId,
    ownerRepo: manifest.owner_repo,
    releaseRole: manifest.release_role,
    productName: manifest.product_name,
    bundleId: manifest.bundle_id,
    releaseRepository: manifest.release_repository,
    packageVersion: pkg.version,
    artifactNameTemplate: manifest.artifact_name_template,
    commands: Object.freeze({ ...manifest.commands }),
    toolchain: Object.freeze({ ...toolchain }),
    macos: Object.freeze({ ...kernel.macos, targets: Object.freeze([...kernel.macos.targets]) }),
    updater: Object.freeze({ ...kernel.updater, metadata: Object.freeze([...kernel.updater.metadata]) }),
    stageOrder: Object.freeze([...kernel.stage_order]),
    manifestPath,
  });
}
