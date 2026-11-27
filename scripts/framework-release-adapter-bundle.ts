import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export type JsonRecord = Record<string, any>;
export type Track = 'standard' | 'full';
export type StableReleaseOperation = 'standard' | 'resume_standard' | 'append_full';
export type StandardPublicationChannel = 'stable' | 'nightly' | 'preview';
export type GitHubApplyMode = 'rehearsal' | 'execute';
export type AdapterOptionValues = Record<string, string | boolean | string[] | undefined>;
export type GitHubMutationCommand =
  | 'github-apply'
  | 'github-activate-latest'
  | 'github-move-latest-pointer';
export type GitHubMutation =
  | 'tag_reserve'
  | 'release_create'
  | 'asset_upload'
  | 'release_notes_patch'
  | 'release_publish'
  | 'latest_patch';

export const digestPattern = /^sha256:[0-9a-f]{64}$/;
// Additional release assets are observational; only path traversal and control
// characters need rejection before their metadata is carried into receipts.
export const releaseAssetNamePattern = /^(?!\.{1,2}$)[^\\/\u0000-\u001f\u007f]+$/u;
export const canonicalStableRepository = 'gaofeng21cn/one-person-lab-app';
export const standardInstallerSidecarAssetNames = [
  'install-docker-webui.sh',
  'install-docker-webui.ps1',
] as const;
const staleIndependentFullGuidance =
  'Use a Full release when you need bundled runtime, Office, and document-intake payloads on a fresh machine.';
const sameStableFullAddonGuidance =
  'The Full DMG is appended later to this same Stable release for fresh-machine installation with bundled runtime, Office, and document-intake payloads.';
const sameStableFullAvailableGuidance =
  'The Full DMG is available on this Stable release for fresh-machine installation with bundled runtime, Office, and document-intake payloads.';
const sameStableFullAddonGuidanceZh =
  '完成验证后，Full DMG 会追加到同一个 Stable Release，用于在新机器上安装内置运行时、Office 和文档导入能力的完整版本。';
const sameStableFullAvailableGuidanceZh =
  'Full DMG 已追加到同一个 Stable Release，可用于在新机器上安装内置运行时、Office 和文档导入能力的完整版本。';
export const githubApplyRequiredOptionNames = [
  'bundle',
  'plan',
  'operation',
  'track',
  'run-attempt',
  'publication-channel',
  'operation-id',
  'attempt-id',
  'operation-started-at',
  'operation-deadline-at',
  'mutation-mode',
  'output',
] as const;
export const githubApplyFullRequiredOptionNames = [
  ...githubApplyRequiredOptionNames,
  'executor-app-sha',
  'standard-attestation',
] as const;
export const appStandardIdentityMode = 'app_standard_compatibility';
export const packageCompatibility = {
  abi: 'opl_packages.v1',
  version_range: '>=0.1.0 <1.0.0',
} as const;
export const frozenBuildInputIds = [
  'app_source',
  'base_image',
  'codex_cli',
  'codex_platform',
  'dockerfile',
  'framework_seed',
  'qualification_harness',
  'shell_webui_source',
] as const;

export function readJson(filePath: string): JsonRecord {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected a regular JSON file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonRecord;
}

export function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function sha256Bytes(bytes: Buffer | string): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function sha256File(filePath: string): string {
  return sha256Bytes(fs.readFileSync(filePath));
}

export function projectPublicReleaseBody(markdown: string, releaseName: string): string {
  const lines = markdown.split(/\r?\n/);
  const firstVisibleLine = lines.findIndex((line) => line.trim().length > 0);
  const candidate = firstVisibleLine >= 0 ? lines[firstVisibleLine]!.trim() : '';
  if (candidate === releaseName || candidate === `# ${releaseName}`) {
    lines.splice(0, firstVisibleLine + 1);
    while (lines[0] !== undefined && lines[0]!.trim().length === 0) lines.shift();
  }
  return lines
    .join('\n')
    .replaceAll(staleIndependentFullGuidance, sameStableFullAddonGuidance);
}

export function bundlePublicReleaseBody(bundle: JsonRecord): string {
  const releaseName = `One Person Lab v${bundle.release?.version}`;
  return projectPublicReleaseBody(String(bundle.prepared_notes?.markdown ?? ''), releaseName);
}

export function fullAddonPublicReleaseBody(bundle: JsonRecord, addon: JsonRecord, currentBody?: string): string {
  const repository = String(bundle.sources?.app?.repo ?? '');
  const tag = String(addon.tag ?? '');
  const artifact = addon.artifact as JsonRecord | undefined;
  const manifest = addon.manifest as JsonRecord | undefined;
  if (
    !artifact
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    || !/^v[0-9A-Za-z.-]+$/.test(tag)
    || !releaseAssetNamePattern.test(String(artifact?.name ?? ''))
    || !digestPattern.test(String(artifact?.sha256 ?? ''))
    || !Number.isSafeInteger(artifact?.size_bytes)
    || Number(artifact?.size_bytes) <= 0
    || manifest?.name !== 'opl-release-manifest.json'
    || !digestPattern.test(String(manifest?.sha256 ?? ''))
  ) {
    throw new Error('Full release discovery requires one exact same-tag artifact and manifest identity.');
  }
  const downloadBase = `https://github.com/${repository}/releases/download/${tag}`;
  const fullSection = [
    '## Full first-install',
    '',
    'The qualified Full package is now available as an add-on to this Stable release.',
    '',
    `- [Download Full DMG for macOS arm64](${downloadBase}/${encodeURIComponent(String(artifact.name))})`,
    `- SHA-256: \`${artifact.sha256}\``,
    `- Size: ${artifact.size_bytes} bytes`,
    `- [Full release manifest](${downloadBase}/opl-release-manifest.json)`,
  ].join('\n');
  if (currentBody?.startsWith(`${fullSection}\n\n`)) return currentBody;
  const standardBody = (currentBody ?? bundlePublicReleaseBody(bundle))
    .replaceAll(sameStableFullAddonGuidance, sameStableFullAvailableGuidance)
    .replaceAll(sameStableFullAddonGuidanceZh, sameStableFullAvailableGuidanceZh);
  return `${fullSection}\n\n${standardBody}`;
}

export function regularFileBytes(filePath: string, label: string): Buffer {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`${label} must be a non-empty regular file: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

export function exactJson(left: unknown, right: unknown, label: string): void {
  if (canonicalJson(left) !== canonicalJson(right)) throw new Error(`${label} does not match the frozen Bundle.`);
}

export function latestPointerInspectionIdentity(inspection: JsonRecord): JsonRecord {
  const release = inspection.release as JsonRecord | undefined;
  if (!release) return inspection;
  const { immutable: _immutable, ...pointerRelease } = release;
  return { ...inspection, release: pointerRelease };
}

function assertCanonicalBundleDigest(bundle: JsonRecord): void {
  const { bundle_digest: expectedDigest, ...core } = bundle;
  const actualDigest = digestRef(sha256Bytes(canonicalJson(core)));
  if (!digestPattern.test(String(expectedDigest ?? '')) || expectedDigest !== actualDigest) {
    throw new Error('Framework Bundle digest does not match its immutable canonical bytes.');
  }
}

export function gitArchiveDescriptor(root: string, ref: string, id: string): JsonRecord {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-${id}-archive-`));
  const archivePath = path.join(tempRoot, 'source.tar');
  const archiveFd = fs.openSync(archivePath, 'w');
  try {
    const result = spawnSync('git', ['-C', root, 'archive', '--format=tar', ref], {
      stdio: ['ignore', archiveFd, 'pipe'],
    });
    if (result.status !== 0) {
      throw new Error(`Cannot materialize deterministic ${id} archive at ${ref}: ${String(result.stderr).trim()}`);
    }
    const bytes = regularFileBytes(archivePath, `${id} archive`);
    return { id, ref, digest: digestRef(sha256Bytes(bytes)), size_bytes: bytes.byteLength };
  } finally {
    fs.closeSync(archiveFd);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function gitFileBytes(root: string, ref: string, relativePath: string, label: string): Buffer {
  const normalized = relativePath.split(path.sep).join('/');
  if (!normalized || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new Error(`${label} path escapes its exact checkout: ${relativePath}`);
  }
  const result = spawnSync('git', ['-C', root, 'show', `${ref}:${normalized}`], {
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout) || result.stdout.byteLength === 0) {
    throw new Error(`Cannot read exact ${label} bytes at ${ref}:${normalized}: ${String(result.stderr).trim()}`);
  }
  return result.stdout;
}

export function fileDescriptor(id: string, ref: string, bytes: Buffer): JsonRecord {
  return { id, ref, digest: digestRef(sha256Bytes(bytes)), size_bytes: bytes.byteLength };
}

export function codexArchiveDescriptor(
  id: 'codex_cli' | 'codex_platform',
  tarballPath: string,
  resolved: JsonRecord,
  cpu: 'x64' | 'arm64',
  platformVersion: string,
): JsonRecord {
  const bytes = regularFileBytes(tarballPath, 'Frozen Codex tarball');
  const descriptor = fileDescriptor(id, `${resolved.package}@${resolved.version}`, bytes);
  if (descriptor.digest !== `sha256:${resolved.tarball_sha256}` || descriptor.size_bytes !== resolved.tarball_size_bytes) {
    throw new Error(`Frozen ${id} bytes differ from the Framework-resolved archive digest or size.`);
  }
  const listing = spawnSync('tar', ['-tzf', tarballPath], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (listing.status !== 0) throw new Error(`Frozen Codex tarball is unreadable: ${listing.stderr.trim()}`);
  const identities = listing.stdout
    .split(/\r?\n/)
    .map((entry) => entry.replace(/^\.\//, ''))
    .filter((entry) => entry === 'package/package.json');
  if (identities.length !== 1) throw new Error('Frozen Codex tarball must contain exactly one package/package.json.');
  const identity = spawnSync('tar', ['-xOzf', tarballPath, 'package/package.json'], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (identity.status !== 0) throw new Error(`Cannot read frozen Codex package identity: ${identity.stderr.trim()}`);
  const packageJson = JSON.parse(identity.stdout) as JsonRecord;
  if (packageJson.name !== resolved.package || packageJson.version !== resolved.version) {
    throw new Error(`Frozen ${id} package identity differs from Framework dependency resolution.`);
  }
  if (id === 'codex_cli') {
    const platformAlias = packageJson.optionalDependencies?.[`@openai/codex-linux-${cpu}`];
    if (platformAlias !== `npm:@openai/codex@${platformVersion}`) {
      throw new Error('Frozen Codex launcher does not declare the resolved Linux platform package.');
    }
  } else if (!Array.isArray(packageJson.os) || packageJson.os.length !== 1 || packageJson.os[0] !== 'linux'
    || !Array.isArray(packageJson.cpu) || packageJson.cpu.length !== 1 || packageJson.cpu[0] !== cpu) {
    throw new Error('Frozen Codex platform archive does not support the requested Linux architecture.');
  }
  return descriptor;
}

export function digestRef(digest: string): string {
  return digest.startsWith('sha256:') ? digest : `sha256:${digest}`;
}

export function standardAttestationIdentity(filePath: string, bundle: JsonRecord): JsonRecord {
  const resolved = path.resolve(filePath);
  const bytes = regularFileBytes(resolved, 'Unified Standard release attestation');
  const attestation = JSON.parse(bytes.toString('utf8')) as JsonRecord;
  const payloadAssets = attestation.publication_record?.publication_intent?.payload_assets;
  if (
    attestation.schema !== 'opl_app_release_attestation.v1'
    || attestation.status !== 'passed'
    || attestation.release?.repository !== bundle.sources?.app?.repo
    || attestation.release?.tag !== bundle.release?.tag
    || attestation.release?.version !== bundle.release?.version
    || attestation.release?.bundle_digest !== bundle.bundle_digest
    || attestation.protection?.github_native_immutable !== false
    || attestation.protection?.retroactive_lock_claimed !== false
    || attestation.protection?.standard_asset_policy !== 'sealed_name_size_digest_set_no_overwrite_or_delete'
    || !Array.isArray(payloadAssets)
  ) {
    throw new Error('Unified Standard release attestation does not match the exact mutable Standard Bundle.');
  }
  const assets = payloadAssets.map((asset: JsonRecord) => ({
    name: String(asset?.name ?? ''),
    size_bytes: Number(asset?.size_bytes),
    sha256: String(asset?.digest ?? ''),
  }));
  assets.push({
    name: 'opl-release-attestation.json',
    size_bytes: bytes.byteLength,
    sha256: digestRef(sha256Bytes(bytes)),
  });
  const names = new Set<string>();
  for (const asset of assets) {
    if (
      !asset.name
      || names.has(asset.name)
      || !Number.isSafeInteger(asset.size_bytes)
      || asset.size_bytes <= 0
      || !digestPattern.test(asset.sha256)
    ) {
      throw new Error('Unified Standard release attestation has an invalid or duplicate sealed asset identity.');
    }
    names.add(asset.name);
  }
  return {
    path: resolved,
    name: 'opl-release-attestation.json',
    sha256: digestRef(sha256Bytes(bytes)),
    size_bytes: bytes.byteLength,
    sealed_standard_assets: assets.sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function fullManifestReleaseIdentity(
  uploadActions: JsonRecord[],
  standardAttestation: JsonRecord,
): JsonRecord {
  const manifestActions = uploadActions.filter((action) => action.name === 'opl-release-manifest.json');
  if (manifestActions.length !== 1) {
    throw new Error('Full publication requires exactly one opl-release-manifest.json upload action.');
  }
  const manifestAction = manifestActions[0];
  const manifestPath = path.resolve(String(manifestAction.source_path ?? ''));
  const manifestBytes = regularFileBytes(manifestPath, 'Full public manifest');
  const manifestSha256 = digestRef(sha256Bytes(manifestBytes));
  if (
    manifestAction.sha256 !== manifestSha256
    || manifestAction.size_bytes !== manifestBytes.byteLength
  ) {
    throw new Error('Full public manifest upload action does not match its exact bytes.');
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as JsonRecord;
  const version = String(manifest.release_version ?? '');
  const dmgName = `One-Person-Lab-Full-${version}-mac-arm64.dmg`;
  const carrierContext = manifest.carrier_context as JsonRecord | undefined;
  const targetStandard = carrierContext?.target_standard_release as JsonRecord | undefined;
  const releaseExecutor = carrierContext?.release_executor as JsonRecord | undefined;
  const fullContentSources = carrierContext?.full_content_sources as JsonRecord | undefined;
  const differences = carrierContext?.differences as JsonRecord | undefined;
  const manifestAssets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const manifestDmgAssets = manifestAssets.filter((asset: JsonRecord) => asset?.name === dmgName);
  const uploadDmgActions = uploadActions.filter((action) => action.name === dmgName);
  if (
    manifest.schema !== 'opl_public_release_manifest.v1'
    || manifest.package_kind !== 'opl_full_first_install_macos_arm64'
    || manifest.owner_authority !== 'one-person-lab-app'
    || manifest.version !== version
    || !/^[0-9]{2}\.[0-9]{1,2}\.[0-9]{1,2}(?:-r[1-9][0-9]*)?$/.test(version)
    || manifest.primary_install_asset !== dmgName
    || carrierContext?.publication_model !== 'same_tag_mutable_standard_addon'
    || !Number.isSafeInteger(targetStandard?.release_id)
    || Number(targetStandard?.release_id) <= 0
    || targetStandard?.tag !== `v${version}`
    || !/^[0-9a-f]{40}$/.test(String(targetStandard?.target_commitish ?? ''))
    || targetStandard?.immutable !== false
    || targetStandard?.full_asset_append_allowed !== true
    || targetStandard?.standard_asset_overwrite_or_delete_allowed !== false
    || carrierContext?.latest_modified !== false
    || carrierContext?.updater_metadata_modified !== false
    || carrierContext?.release_notes_modified !== true
    || carrierContext?.standard_attestation?.name !== standardAttestation.name
    || carrierContext?.standard_attestation?.sha256 !== standardAttestation.sha256
    || carrierContext?.standard_attestation?.size_bytes !== standardAttestation.size_bytes
    || !/^[0-9a-f]{40}$/.test(String(releaseExecutor?.app_sha ?? ''))
    || releaseExecutor?.notarizer_path !== 'scripts/notarize-macos-dmg.ts'
    || fullContentSources?.role !== 'observational_build_provenance_only'
    || fullContentSources?.may_gate_install_or_runtime !== false
    || !/^[0-9a-f]{40}$/.test(String(fullContentSources?.app_sha ?? ''))
    || !/^[0-9a-f]{40}$/.test(String(fullContentSources?.shell_sha ?? ''))
    || !/^[0-9a-f]{40}$/.test(String(fullContentSources?.framework_sha ?? ''))
    || differences?.executor_app_differs_from_full_content_app
      !== (releaseExecutor?.app_sha !== fullContentSources?.app_sha)
    || differences?.full_content_app_differs_from_target_standard
      !== (fullContentSources?.app_sha !== targetStandard?.target_commitish)
    || manifestDmgAssets.length !== 1
    || uploadDmgActions.length !== 1
    || uploadActions.length !== 2
  ) {
    throw new Error('Full public manifest does not define one canonical same-tag Full add-on identity.');
  }
  const manifestDmg = manifestDmgAssets[0] as JsonRecord;
  const uploadDmg = uploadDmgActions[0];
  if (
    manifestDmg.sha256 !== uploadDmg.sha256
    || manifestDmg.size_bytes !== uploadDmg.size_bytes
    || !digestPattern.test(String(uploadDmg.sha256 ?? ''))
    || !Number.isSafeInteger(uploadDmg.size_bytes)
    || Number(uploadDmg.size_bytes) <= 0
  ) {
    throw new Error('Full public manifest does not bind the exact uploaded Full DMG bytes.');
  }
  return {
    version,
    carrier_context: carrierContext,
    manifest: {
      name: 'opl-release-manifest.json',
      sha256: manifestSha256,
      size_bytes: manifestBytes.byteLength,
    },
    artifact: {
      name: dmgName,
      sha256: uploadDmg.sha256,
      size_bytes: uploadDmg.size_bytes,
    },
    standard_attestation: standardAttestation,
  };
}

export function fullAddonIdentity(
  bundle: JsonRecord,
  uploadActions: JsonRecord[],
  standardAttestationPath: string,
): JsonRecord {
  const standardAttestation = standardAttestationIdentity(standardAttestationPath, bundle);
  const releaseIdentity = fullManifestReleaseIdentity(uploadActions, standardAttestation);
  const repository = String(bundle.sources?.app?.repo ?? '');
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
  ) {
    throw new Error('Full add-on identity requires one canonical App release repository.');
  }
  const version = String(releaseIdentity.version);
  const carrierContext = releaseIdentity.carrier_context as JsonRecord;
  const targetStandard = carrierContext.target_standard_release as JsonRecord;
  const releaseExecutor = carrierContext.release_executor as JsonRecord;
  const fullContentSources = carrierContext.full_content_sources as JsonRecord;
  const differences = carrierContext.differences as JsonRecord;
  if (
    targetStandard.repository !== repository
    || targetStandard.tag !== bundle.release?.tag
  ) {
    throw new Error('Full add-on target Standard reference does not match the exact App repository and Bundle tag.');
  }
  return {
    schema: 'opl_app_same_tag_full_addon_identity.v1',
    kind: 'full_macos',
    tag: targetStandard.tag,
    release_version: version,
    manifest: releaseIdentity.manifest,
    artifact: releaseIdentity.artifact,
    standard_attestation: {
      name: standardAttestation.name,
      sha256: standardAttestation.sha256,
      size_bytes: standardAttestation.size_bytes,
    },
    sealed_standard_assets: standardAttestation.sealed_standard_assets,
    target_standard_release: targetStandard,
    release_executor: releaseExecutor,
    full_content_sources: fullContentSources,
    source_differences: differences,
  };
}

export function gitSha(root: string): string {
  const result = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (result.status !== 0 || !/^[0-9a-f]{40}$/.test(result.stdout.trim())) {
    throw new Error(`Cannot resolve exact Git SHA for ${root}: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

export function requiredAssetNames(version: string, track: Track, channel = 'stable'): string[] {
  if (track === 'standard') {
    return [
        `One-Person-Lab-${version}-mac-arm64.dmg`,
        `One-Person-Lab-${version}-mac-arm64.zip`,
        `One-Person-Lab-${version}-mac-arm64.zip.blockmap`,
        ...(channel === 'preview' ? [`One-Person-Lab-${version}-linux-x64.deb`] : []),
        'latest-mac.yml',
        'latest-arm64-mac.yml',
        'opl-app-component-manifest.json',
        'opl-install.sh',
      ];
  }
  return [`One-Person-Lab-Full-${version}-mac-arm64.dmg`, 'opl-release-manifest.json'];
}
