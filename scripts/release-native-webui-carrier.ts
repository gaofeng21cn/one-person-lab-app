#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

type JsonRecord = Record<string, any>;

export type NativeWebuiLocalAsset = {
  role: string;
  name: string;
  path: string;
  size_bytes: number;
  sha256: string;
};

export type NativeWebuiRemoteAsset = {
  id?: number;
  name: string;
  size: number;
  digest: string;
  browser_download_url?: string;
};

export type NativeWebuiTarget = {
  platform: 'linux' | 'darwin';
  architecture: 'x86_64' | 'arm64';
};

export type NativeWebuiPublicationAction = NativeWebuiLocalAsset & {
  action: 'upload' | 'reuse';
};

export type NativeWebuiUploadAction = {
  action: 'upload';
  name: string;
  source_path: string;
  size_bytes: number;
  sha256: `sha256:${string}`;
};

export type NativeWebuiPublicationManifest = {
  schema: 'opl_app_native_webui_publication_manifest.v1';
  repository: string;
  tag: string;
  version: string;
  platform: NativeWebuiTarget['platform'];
  architecture: NativeWebuiTarget['architecture'];
  release_bundle_digest: string;
  stable_authority_run_id: string;
  cohort: {
    app_sha: string;
    shell_sha: string;
    framework_sha: string;
  };
  qualification_receipt: {
    path: string;
    sha256: string;
  };
  assets: NativeWebuiLocalAsset[];
};

export interface NativeWebuiGitHubRuntime {
  run(command: string, args: string[], options: {
    timeout: number;
    input?: string;
  }): {
    status: number | null;
    signal?: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    error?: Error;
  };
}

const sha256Pattern = /^[0-9a-f]{64}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const gitShaPattern = /^[0-9a-f]{40}$/;
const versionPattern = /^[0-9]{2}\.[0-9]{1,2}\.[0-9]{1,2}(?:-r[1-9][0-9]*)?$/;
const stableRunPattern = /^[1-9][0-9]*$/;
const requiredAssetRoles = [
  'runtime_tarball',
  'runtime_metadata',
  'installer',
  'installer_sha256',
  'qualification_receipt',
] as const;

function fail(message: string): never {
  throw new Error(message);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`);
  return value;
}

function sha256Bytes(value: Buffer | string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath: string): string {
  return sha256Bytes(fs.readFileSync(filePath));
}

function regularFile(filePath: string, label: string): fs.Stats {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    fail(`${label} must be a non-empty regular file: ${filePath}`);
  }
  return stat;
}

function portableFileRef(filePath: string, label: string): { ref: string; absolute: string } {
  const normalized = path.normalize(filePath);
  if (path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    fail(`${label} must be a workspace-relative path that cannot escape the checkout`);
  }
  return { ref: normalized, absolute: path.resolve(normalized) };
}

function readJson(filePath: string): JsonRecord {
  regularFile(filePath, 'JSON input');
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonRecord;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function assertTarget(target: NativeWebuiTarget): void {
  const supported =
    target.platform === 'linux' && target.architecture === 'x86_64'
    || target.platform === 'darwin' && target.architecture === 'arm64';
  if (!supported) {
    fail(`Unsupported Native WebUI target ${target.platform}-${target.architecture}`);
  }
}

function expectedAssetNames(
  version: string,
  target: NativeWebuiTarget,
): Record<(typeof requiredAssetRoles)[number], string> {
  assertTarget(target);
  const base = `one-person-lab-webui-${version}-${target.platform}-${target.architecture}`;
  return {
    runtime_tarball: `${base}.tar.gz`,
    runtime_metadata: `${base}.tar.gz.sha256`,
    installer: 'install-web.sh',
    installer_sha256: 'install-web.sh.sha256',
    qualification_receipt: `${base}.qualification.json`,
  };
}

function validateQualificationReceipt(
  receipt: JsonRecord,
  expected: {
    version: string;
    bundleDigest: string;
    stableAuthorityRunId: string;
    target: NativeWebuiTarget;
    appSha: string;
    shellSha: string;
    frameworkSha: string;
  },
): void {
  const lifecycle = record(receipt.lifecycle, 'qualification receipt.lifecycle');
  const cohort = record(receipt.cohort, 'qualification receipt.cohort');
  if (
    receipt.schema !== 'opl_app_native_webui_qualification_receipt.v1'
    || receipt.status !== 'passed'
    || receipt.version !== expected.version
    || receipt.release_bundle_digest !== expected.bundleDigest
    || String(receipt.stable_authority_run_id) !== expected.stableAuthorityRunId
    || receipt.platform !== expected.target.platform
    || receipt.architecture !== expected.target.architecture
    || receipt.non_root !== true
    || cohort.app_sha !== expected.appSha
    || cohort.shell_sha !== expected.shellSha
    || cohort.framework_sha !== expected.frameworkSha
  ) {
    fail('Native WebUI qualification receipt does not match the exact Stable handoff');
  }
  for (const gate of [
    'first_install',
    'same_version_idempotence',
    'cross_version_update',
    'rollback',
    'data_preservation',
    'http_health',
    'official_profile_first_install',
  ]) {
    if (lifecycle[gate] !== 'passed') fail(`qualification receipt lifecycle.${gate} must be passed`);
  }
}

export function planNativeWebuiAssetPublication(
  localAssets: NativeWebuiLocalAsset[],
  remoteAssets: NativeWebuiRemoteAsset[],
): NativeWebuiPublicationAction[] {
  const remoteNames = remoteAssets.map((asset) => asset.name);
  if (new Set(remoteNames).size !== remoteNames.length) {
    fail('GitHub Release contains duplicate Native WebUI asset names');
  }
  const remoteByName = new Map(remoteAssets.map((asset) => [asset.name, asset]));
  return localAssets.map((asset) => {
    const remote = remoteByName.get(asset.name);
    if (!remote) return { ...asset, action: 'upload' };
    const remoteDigest = String(remote.digest ?? '').replace(/^sha256:/, '').toLowerCase();
    if (remote.size !== asset.size_bytes || remoteDigest !== asset.sha256) {
      fail(`Published Native WebUI asset ${asset.name} already exists with different bytes; create a new version`);
    }
    return { ...asset, action: 'reuse' };
  });
}

export function sealNativeWebuiPublicationManifest(input: {
  repository: string;
  version: string;
  releaseBundleDigest: string;
  stableAuthorityRunId: string;
  platform: NativeWebuiTarget['platform'];
  architecture: NativeWebuiTarget['architecture'];
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  qualificationReceiptPath: string;
  assetPaths: Record<(typeof requiredAssetRoles)[number], string>;
}): NativeWebuiPublicationManifest {
  if (input.repository !== 'gaofeng21cn/one-person-lab-app') fail('Native WebUI publication repository is not authorized');
  if (!versionPattern.test(input.version)) fail('Native WebUI version must be a canonical Stable display version');
  const target = { platform: input.platform, architecture: input.architecture };
  assertTarget(target);
  if (!digestPattern.test(input.releaseBundleDigest)) fail('release_bundle_digest must be a SHA-256 digest reference');
  if (!stableRunPattern.test(input.stableAuthorityRunId)) fail('stable_authority_run_id must be a positive Actions run id');
  for (const [label, value] of Object.entries({
    app_sha: input.appSha,
    shell_sha: input.shellSha,
    framework_sha: input.frameworkSha,
  })) {
    if (!gitShaPattern.test(value)) fail(`${label} must be an exact Git SHA`);
  }

  const qualificationPath = portableFileRef(input.qualificationReceiptPath, 'qualification receipt');
  const qualification = readJson(qualificationPath.absolute);
  validateQualificationReceipt(qualification, {
    version: input.version,
    bundleDigest: input.releaseBundleDigest,
    stableAuthorityRunId: input.stableAuthorityRunId,
    target,
    appSha: input.appSha,
    shellSha: input.shellSha,
    frameworkSha: input.frameworkSha,
  });

  const names = expectedAssetNames(input.version, target);
  const assets = requiredAssetRoles.map((role) => {
    const assetPath = portableFileRef(input.assetPaths[role], `Native WebUI ${role}`);
    const stat = regularFile(assetPath.absolute, `Native WebUI ${role}`);
    if (path.basename(assetPath.ref) !== names[role]) {
      fail(`Native WebUI ${role} must be named ${names[role]}`);
    }
    return {
      role,
      name: names[role],
      path: assetPath.ref,
      size_bytes: stat.size,
      sha256: sha256File(assetPath.absolute),
    };
  });
  const installerDigest = assets.find((asset) => asset.role === 'installer')?.sha256;
  const installerSha = fs.readFileSync(input.assetPaths.installer_sha256, 'utf8').trim();
  if (installerSha !== `${installerDigest}  install-web.sh`) {
    fail('install-web.sh.sha256 does not bind the exact installer bytes');
  }

  return {
    schema: 'opl_app_native_webui_publication_manifest.v1',
    repository: input.repository,
    tag: `v${input.version}`,
    version: input.version,
    platform: target.platform,
    architecture: target.architecture,
    release_bundle_digest: input.releaseBundleDigest,
    stable_authority_run_id: input.stableAuthorityRunId,
    cohort: {
      app_sha: input.appSha,
      shell_sha: input.shellSha,
      framework_sha: input.frameworkSha,
    },
    qualification_receipt: {
      path: qualificationPath.ref,
      sha256: sha256File(qualificationPath.absolute),
    },
    assets,
  };
}

function validateManifest(value: unknown): NativeWebuiPublicationManifest {
  const manifest = record(value, 'Native WebUI publication manifest') as NativeWebuiPublicationManifest;
  const sealed = sealNativeWebuiPublicationManifest({
    repository: manifest.repository,
    version: manifest.version,
    releaseBundleDigest: manifest.release_bundle_digest,
    stableAuthorityRunId: String(manifest.stable_authority_run_id),
    platform: manifest.platform,
    architecture: manifest.architecture,
    appSha: manifest.cohort?.app_sha,
    shellSha: manifest.cohort?.shell_sha,
    frameworkSha: manifest.cohort?.framework_sha,
    qualificationReceiptPath: manifest.qualification_receipt?.path,
    assetPaths: Object.fromEntries(manifest.assets.map((asset) => [asset.role, asset.path])) as Record<(typeof requiredAssetRoles)[number], string>,
  });
  if (JSON.stringify(sealed) !== JSON.stringify(manifest)) fail('Native WebUI publication manifest is not canonical or its local bytes changed');
  return manifest;
}

export function nativeWebuiRemoteTarget(manifest: NativeWebuiPublicationManifest): string {
  const digest = sha256Bytes(JSON.stringify(manifest));
  return `github-native-webui:${manifest.repository}@${manifest.tag}/sha256:${digest}`;
}

const defaultRuntime: NativeWebuiGitHubRuntime = {
  run(command, args, options) {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      env: process.env,
      input: options.input,
      timeout: options.timeout,
      killSignal: 'SIGTERM',
      maxBuffer: 64 * 1024 * 1024,
    });
    return {
      status: result.status,
      signal: result.signal,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      error: result.error,
    };
  },
};

function runRead(runtime: NativeWebuiGitHubRuntime, command: string, args: string[]): string {
  const result = runtime.run(command, args, { timeout: 60_000 });
  if (result.status !== 0 || result.error) {
    fail(`${command} ${args.join(' ')} failed: ${result.stderr.trim() || result.error?.message || 'unknown error'}`);
  }
  return result.stdout;
}

function inspectRelease(manifest: NativeWebuiPublicationManifest, runtime: NativeWebuiGitHubRuntime): {
  release: JsonRecord;
  assets: NativeWebuiRemoteAsset[];
} {
  const release = JSON.parse(runRead(runtime, 'gh', [
    'api',
    `repos/${manifest.repository}/releases/tags/${manifest.tag}`,
  ])) as JsonRecord;
  if (
    release.tag_name !== manifest.tag
    || release.draft !== false
    || release.prerelease !== false
    || release.target_commitish !== manifest.cohort.app_sha
  ) {
    fail(`GitHub Release ${manifest.tag} does not match the exact Stable handoff`);
  }
  const assets = Array.isArray(release.assets) ? release.assets.map((asset: JsonRecord) => ({
    id: Number(asset.id),
    name: stringValue(asset.name, 'remote asset.name'),
    size: Number(asset.size),
    digest: stringValue(asset.digest, 'remote asset.digest'),
    browser_download_url: stringValue(asset.browser_download_url, 'remote asset.browser_download_url'),
  })) : [];
  for (const asset of assets) {
    if (!Number.isSafeInteger(asset.size) || asset.size <= 0 || !digestPattern.test(asset.digest)) {
      fail(`Remote asset ${asset.name} has no authoritative size and SHA-256 digest`);
    }
  }
  return { release, assets };
}

function anonymousReadback(
  manifest: NativeWebuiPublicationManifest,
  remoteAssets: NativeWebuiRemoteAsset[],
  runtime: NativeWebuiGitHubRuntime,
): JsonRecord[] {
  const remoteByName = new Map(remoteAssets.map((asset) => [asset.name, asset]));
  return manifest.assets.map((asset) => {
    const remote = remoteByName.get(asset.name);
    if (!remote?.browser_download_url) fail(`Remote asset ${asset.name} is missing an anonymous download URL`);
    const temp = path.join(process.env.RUNNER_TEMP || process.env.TMPDIR || '/tmp', `opl-native-${process.pid}-${crypto.randomUUID()}`);
    try {
      const result = runtime.run('curl', [
        '--fail',
        '--location',
        '--silent',
        '--show-error',
        '--connect-timeout',
        '20',
        '--max-time',
        '600',
        '--output',
        temp,
        remote.browser_download_url,
      ], { timeout: 620_000 });
      if (result.status !== 0 || result.error) fail(`Anonymous readback failed for ${asset.name}`);
      const stat = regularFile(temp, `anonymous ${asset.name}`);
      const digest = sha256File(temp);
      if (stat.size !== asset.size_bytes || digest !== asset.sha256) {
        fail(`Anonymous readback differs for ${asset.name}`);
      }
      return { name: asset.name, size_bytes: stat.size, sha256: `sha256:${digest}`, verified: true };
    } finally {
      fs.rmSync(temp, { force: true });
    }
  });
}

export function readbackNativeWebuiAssets(
  manifest: NativeWebuiPublicationManifest,
  runtime: NativeWebuiGitHubRuntime = defaultRuntime,
): JsonRecord {
  try {
    const inspection = inspectRelease(manifest, runtime);
    const plan = planNativeWebuiAssetPublication(manifest.assets, inspection.assets);
    const missing = plan.filter((action) => action.action === 'upload').map((action) => action.name);
    if (missing.length > 0) {
      return {
        schema: 'opl_app_native_webui_publication_receipt.v1',
        status: 'outcome_unknown',
        repository: manifest.repository,
        tag: manifest.tag,
        release_bundle_digest: manifest.release_bundle_digest,
        stable_authority_run_id: manifest.stable_authority_run_id,
        cohort: manifest.cohort,
        remote_target: nativeWebuiRemoteTarget(manifest),
        missing_assets: missing,
        retry_disposition: 'read_only_reconcile_only_no_upload_retry',
        authenticated_readback: inspection.assets.filter((asset) => manifest.assets.some((local) => local.name === asset.name)),
        latest_modified: false,
        container_registry_modified: false,
        homebrew_modified: false,
      };
    }
    const anonymous = anonymousReadback(manifest, inspection.assets, runtime);
    return {
      schema: 'opl_app_native_webui_publication_receipt.v1',
      status: 'complete',
      repository: manifest.repository,
      tag: manifest.tag,
      release_bundle_digest: manifest.release_bundle_digest,
      stable_authority_run_id: manifest.stable_authority_run_id,
      cohort: manifest.cohort,
      remote_target: nativeWebuiRemoteTarget(manifest),
      authenticated_readback: inspection.assets.filter((asset) => manifest.assets.some((local) => local.name === asset.name)),
      anonymous_readback: anonymous,
      latest_modified: false,
      container_registry_modified: false,
      homebrew_modified: false,
    };
  } catch (error) {
    return {
      schema: 'opl_app_native_webui_publication_receipt.v1',
      status: 'outcome_unknown',
      repository: manifest.repository,
      tag: manifest.tag,
      release_bundle_digest: manifest.release_bundle_digest,
      stable_authority_run_id: manifest.stable_authority_run_id,
      cohort: manifest.cohort,
      remote_target: nativeWebuiRemoteTarget(manifest),
      retry_disposition: 'read_only_reconcile_only_no_upload_retry',
      failure: {
        taxonomy: 'authenticated_or_anonymous_public_readback_failed',
        message: error instanceof Error ? error.message : String(error),
      },
      latest_modified: false,
      container_registry_modified: false,
      homebrew_modified: false,
    };
  }
}

export function buildNativeWebuiUploadActions(
  manifest: NativeWebuiPublicationManifest,
): JsonRecord {
  const validated = validateManifest(manifest);
  const names = validated.assets.map((asset) => asset.name);
  const sourcePaths = validated.assets.map((asset) => path.resolve(asset.path));
  if (new Set(names).size !== names.length) {
    fail('Native WebUI publication manifest contains duplicate asset names');
  }
  if (new Set(sourcePaths).size !== sourcePaths.length) {
    fail('Native WebUI publication manifest contains duplicate asset source paths');
  }
  const uploadActions: NativeWebuiUploadAction[] = validated.assets.map((asset, index) => {
    const sourcePath = sourcePaths[index];
    const stat = regularFile(sourcePath, `Native WebUI upload ${asset.name}`);
    const sha256 = sha256File(sourcePath);
    if (stat.size !== asset.size_bytes || sha256 !== asset.sha256) {
      fail(`Native WebUI upload ${asset.name} changed after manifest sealing`);
    }
    return {
      action: 'upload',
      name: asset.name,
      source_path: sourcePath,
      size_bytes: asset.size_bytes,
      sha256: `sha256:${asset.sha256}`,
    };
  });
  return {
    schema: 'opl_app_native_webui_upload_actions.v1',
    manifest_digest: `sha256:${sha256Bytes(JSON.stringify(validated))}`,
    repository: validated.repository,
    tag: validated.tag,
    release_bundle_digest: validated.release_bundle_digest,
    cohort: validated.cohort,
    upload_actions: uploadActions,
  };
}

export function publishNativeWebuiAssets(
  manifest: NativeWebuiPublicationManifest,
  mutationAttemptId: string,
  runtime: NativeWebuiGitHubRuntime = defaultRuntime,
): JsonRecord {
  void manifest;
  void mutationAttemptId;
  void runtime;
  fail('Native WebUI assets must be published by the unified Stable draft carrier; post-publish append is forbidden');
}

function option(values: Record<string, string | boolean | string[] | undefined>, name: string): string {
  const value = values[name];
  if (typeof value !== 'string' || !value.trim()) fail(`--${name} is required`);
  return value;
}

function main(): void {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
      repository: { type: 'string' },
      version: { type: 'string' },
      'release-bundle-digest': { type: 'string' },
      'stable-authority-run-id': { type: 'string' },
      platform: { type: 'string' },
      architecture: { type: 'string' },
      'app-sha': { type: 'string' },
      'shell-sha': { type: 'string' },
      'framework-sha': { type: 'string' },
      'qualification-receipt': { type: 'string' },
      'runtime-tarball': { type: 'string' },
      'runtime-metadata': { type: 'string' },
      installer: { type: 'string' },
      'installer-sha256': { type: 'string' },
      manifest: { type: 'string' },
      'mutation-attempt-id': { type: 'string' },
      output: { type: 'string' },
    },
  });
  const command = parsed.positionals[0];
  if (command === 'seal') {
    const qualificationReceipt = option(parsed.values, 'qualification-receipt');
    const manifest = sealNativeWebuiPublicationManifest({
      repository: option(parsed.values, 'repository'),
      version: option(parsed.values, 'version'),
      releaseBundleDigest: option(parsed.values, 'release-bundle-digest'),
      stableAuthorityRunId: option(parsed.values, 'stable-authority-run-id'),
      platform: option(parsed.values, 'platform') as NativeWebuiTarget['platform'],
      architecture: option(parsed.values, 'architecture') as NativeWebuiTarget['architecture'],
      appSha: option(parsed.values, 'app-sha'),
      shellSha: option(parsed.values, 'shell-sha'),
      frameworkSha: option(parsed.values, 'framework-sha'),
      qualificationReceiptPath: qualificationReceipt,
      assetPaths: {
        runtime_tarball: option(parsed.values, 'runtime-tarball'),
        runtime_metadata: option(parsed.values, 'runtime-metadata'),
        installer: option(parsed.values, 'installer'),
        installer_sha256: option(parsed.values, 'installer-sha256'),
        qualification_receipt: qualificationReceipt,
      },
    });
    writeJson(path.resolve(option(parsed.values, 'output')), manifest);
    process.stdout.write(`${JSON.stringify(manifest)}\n`);
    return;
  }
  if (command === 'upload-actions') {
    const manifest = validateManifest(readJson(path.resolve(option(parsed.values, 'manifest'))));
    const actions = buildNativeWebuiUploadActions(manifest);
    writeJson(path.resolve(option(parsed.values, 'output')), actions);
    process.stdout.write(`${JSON.stringify(actions)}\n`);
    return;
  }
  if (command === 'publish') {
    const manifest = validateManifest(readJson(path.resolve(option(parsed.values, 'manifest'))));
    const receipt = publishNativeWebuiAssets(manifest, option(parsed.values, 'mutation-attempt-id'));
    writeJson(path.resolve(option(parsed.values, 'output')), receipt);
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    if (receipt.status === 'outcome_unknown') process.exitCode = 2;
    return;
  }
  if (command === 'readback') {
    const manifest = validateManifest(readJson(path.resolve(option(parsed.values, 'manifest'))));
    const receipt = readbackNativeWebuiAssets(manifest);
    writeJson(path.resolve(option(parsed.values, 'output')), receipt);
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    if (receipt.status === 'outcome_unknown') process.exitCode = 2;
    return;
  }
  fail('Usage: release-native-webui-carrier.ts <seal|upload-actions|publish|readback> ...');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
