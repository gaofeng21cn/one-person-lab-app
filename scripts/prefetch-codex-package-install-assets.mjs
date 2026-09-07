import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const startedAt = new Date();
const artifactRoot = 'artifacts/opl-first-run-vm';
const npmCacheDir = path.join(artifactRoot, 'codex-npm-cache');
const tarballPath = path.join(artifactRoot, 'codex-package-tarballs', 'openai-codex.tgz');
const platformTarballPath = path.join(artifactRoot, 'codex-package-tarballs', 'openai-codex-darwin-arm64.tgz');
const registryResponsePath = path.join(artifactRoot, 'codex-package-registry-response.json');
const preflightPath = path.join(artifactRoot, 'codex-package-preflight.json');
const packageName = '@openai/codex';
fs.mkdirSync(npmCacheDir, { recursive: true });
fs.mkdirSync(path.dirname(tarballPath), { recursive: true });
const prewarmManifestPath = process.env.OPL_CODEX_PREWARM_MANIFEST;
const buildCohort = prewarmManifestPath ? null
  : JSON.parse(fs.readFileSync('artifacts/release-cohort/opl-build-cohort.json', 'utf8'));
const frozen = prewarmManifestPath
  ? JSON.parse(fs.readFileSync(prewarmManifestPath, 'utf8')).runtime_payloads?.codex_cli
  : buildCohort?.qualification_runtime?.codex_cli;
if (!frozen?.version || !frozen?.npm_integrity || !frozen?.tarball_url || !frozen?.tarball_sha256 ||
    !frozen?.platform?.version || !frozen?.platform?.npm_integrity || !frozen?.platform?.tarball_url || !frozen?.platform?.tarball_sha256) {
  throw new Error('build cohort lacks frozen Codex CLI qualification identity');
}
const packageSpec = `${packageName}@${frozen.version}`;

function run(command, args = [], options = {}) {
  const started = new Date();
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeout || 120000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const ended = new Date();
  return {
    command: [command, ...args].join(' '),
    available: result.error?.code !== 'ENOENT',
    exit_code: typeof result.status === 'number' ? result.status : null,
    signal: result.signal || null,
    error: result.error ? String(result.error.message || result.error) : null,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    started_at: started.toISOString(),
    ended_at: ended.toISOString(),
    duration_ms: ended.getTime() - started.getTime(),
  };
}

function normalizeRegistryUrl(rawRegistry) {
  const registry = (rawRegistry || 'https://registry.npmjs.org/').trim();
  return registry.endsWith('/') ? registry : `${registry}/`;
}

function registryPackageMetadataUrl(registryUrl) {
  return new URL('@openai%2fcodex', registryUrl).toString();
}

function parseJson(stdout, label, failures) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    failures.push(`${label} did not return valid JSON: ${error.message}`);
    return null;
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function verifiedCachedTarball(filePath, expectedSha256) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) return null;
  const observed = sha256File(filePath);
  return observed === expectedSha256 ? { sha256: observed, size: stat.size } : null;
}

const diagnostics = [];
const blockingFailures = [];
const npmRegistry = run('npm', ['config', 'get', 'registry']);
if (npmRegistry.exit_code !== 0 || npmRegistry.error) {
  blockingFailures.push('npm config get registry failed');
}
const registryUrl = normalizeRegistryUrl(npmRegistry.stdout);
const registryMetadataUrl = registryPackageMetadataUrl(registryUrl);
const registryResponse = run('curl', [
  '-sS',
  '-L',
  '--connect-timeout',
  '30',
  '--max-time',
  '180',
  '-o',
  registryResponsePath,
  '-w',
  '%{http_code}',
  registryMetadataUrl,
], { timeout: 240000 });
const registryStatusCode = Number(registryResponse.stdout);
if (registryResponse.exit_code !== 0 || registryResponse.error) {
  diagnostics.push('registry package metadata request failed');
}
if (registryStatusCode !== 200) {
  diagnostics.push(`registry package metadata returned status ${registryResponse.stdout || 'unknown'}`);
}

const npmView = run('npm', [
  'view',
  packageSpec,
  'version',
  'dist.tarball',
  'dist.integrity',
  '--json',
], { timeout: 240000 });
if (npmView.exit_code !== 0 || npmView.error) {
  blockingFailures.push(`npm view ${packageSpec} version dist.tarball failed`);
}
const metadata = npmView.stdout ? parseJson(npmView.stdout, `npm view ${packageSpec}`, blockingFailures) : null;
const version = metadata?.version || null;
const tarballUrl = metadata?.['dist.tarball'] || metadata?.dist?.tarball || null;
const distIntegrity = metadata?.['dist.integrity'] || metadata?.dist?.integrity || null;
const platformPackageSpec = `${packageName}@${frozen.platform.version}`;
const platformPackageLabel = platformPackageSpec || '@openai/codex@<version>-darwin-arm64';
let platformNpmView = null;
let platformMetadata = null;
let platformVersion = null;
let platformTarballUrl = null;
let platformDistIntegrity = null;
let platformTarballUrlHost = null;
let tarballUrlHost = null;
if (!version) {
  blockingFailures.push('npm package metadata did not include version');
}
if (version !== frozen.version || distIntegrity !== frozen.npm_integrity || tarballUrl !== frozen.tarball_url) {
  blockingFailures.push('Codex package metadata does not match the frozen qualification identity');
}
if (!tarballUrl) {
  blockingFailures.push('npm package metadata did not include dist.tarball');
} else {
  try {
    tarballUrlHost = new URL(tarballUrl).host;
  } catch (error) {
    blockingFailures.push(`dist.tarball is not a valid URL: ${error.message}`);
  }
}

if (platformPackageSpec) {
  platformNpmView = run('npm', [
    'view',
    platformPackageSpec,
    'name',
    'version',
    'dist.tarball',
    'dist.integrity',
    '--json',
  ], { timeout: 240000 });
  if (platformNpmView.exit_code !== 0 || platformNpmView.error) {
    blockingFailures.push(`npm view ${platformPackageSpec} name version dist.tarball failed`);
  }
  platformMetadata = platformNpmView.stdout ? parseJson(platformNpmView.stdout, `npm view ${platformPackageSpec}`, blockingFailures) : null;
  platformVersion = platformMetadata?.version || null;
  platformTarballUrl = platformMetadata?.['dist.tarball'] || platformMetadata?.dist?.tarball || null;
  platformDistIntegrity = platformMetadata?.['dist.integrity'] || platformMetadata?.dist?.integrity || null;
  if (!platformVersion) {
    blockingFailures.push('npm platform package metadata did not include version');
  }
  if (
    platformVersion !== frozen.platform.version ||
    platformDistIntegrity !== frozen.platform.npm_integrity ||
    platformTarballUrl !== frozen.platform.tarball_url
  ) {
    blockingFailures.push('Codex platform package metadata does not match the frozen qualification identity');
  }
  if (!platformTarballUrl) {
    blockingFailures.push('npm platform package metadata did not include dist.tarball');
  } else {
    try {
      platformTarballUrlHost = new URL(platformTarballUrl).host;
    } catch (error) {
      blockingFailures.push(`platform dist.tarball is not a valid URL: ${error.message}`);
    }
  }
}

let tarballDownload = null;
let tarballStatusCode = null;
let tarballSha256 = null;
let tarballSizeBytes = null;
let platformTarballDownload = null;
let platformTarballStatusCode = null;
let platformTarballSha256 = null;
let platformTarballSizeBytes = null;
const cachedTarball = verifiedCachedTarball(tarballPath, frozen.tarball_sha256);
const cachedPlatformTarball = verifiedCachedTarball(platformTarballPath, frozen.platform.tarball_sha256);
if (cachedTarball) {
  tarballSha256 = cachedTarball.sha256;
  tarballSizeBytes = cachedTarball.size;
} else if (tarballUrl && tarballUrlHost) {
  const partialTarballPath = `${tarballPath}.part`;
  fs.rmSync(partialTarballPath, { force: true });
  tarballDownload = run('curl', [
    '-sS',
    '-fL',
    '--retry',
    '5',
    '--retry-all-errors',
    '--retry-delay',
    '10',
    '--connect-timeout',
    '30',
    '--max-time',
    '900',
    '-o',
    partialTarballPath,
    '-w',
    '%{http_code}',
    tarballUrl,
  ], { timeout: 960000 });
  tarballStatusCode = Number(tarballDownload.stdout);
  if (tarballDownload.exit_code === 0 && tarballStatusCode === 200) {
    fs.renameSync(partialTarballPath, tarballPath);
    const stat = fs.statSync(tarballPath);
    tarballSizeBytes = stat.size;
    tarballSha256 = sha256File(tarballPath);
    if (tarballSha256 !== frozen.tarball_sha256) {
      blockingFailures.push('downloaded Codex package tarball SHA-256 does not match the frozen qualification identity');
    }
    if (tarballSizeBytes <= 0) {
      blockingFailures.push('downloaded Codex package tarball is empty');
    }
  } else {
    fs.rmSync(partialTarballPath, { force: true });
    blockingFailures.push(`Codex package tarball download failed with status ${tarballDownload.stdout || 'unknown'}`);
  }
}
if (cachedPlatformTarball) {
  platformTarballSha256 = cachedPlatformTarball.sha256;
  platformTarballSizeBytes = cachedPlatformTarball.size;
} else if (platformTarballUrl && platformTarballUrlHost) {
  const partialPlatformTarballPath = `${platformTarballPath}.part`;
  fs.rmSync(partialPlatformTarballPath, { force: true });
  platformTarballDownload = run('curl', [
    '-sS',
    '-fL',
    '--retry',
    '5',
    '--retry-all-errors',
    '--retry-delay',
    '10',
    '--connect-timeout',
    '30',
    '--max-time',
    '900',
    '-o',
    partialPlatformTarballPath,
    '-w',
    '%{http_code}',
    platformTarballUrl,
  ], { timeout: 960000 });
  platformTarballStatusCode = Number(platformTarballDownload.stdout);
  if (platformTarballDownload.exit_code === 0 && platformTarballStatusCode === 200) {
    fs.renameSync(partialPlatformTarballPath, platformTarballPath);
    const stat = fs.statSync(platformTarballPath);
    platformTarballSizeBytes = stat.size;
    platformTarballSha256 = sha256File(platformTarballPath);
    if (platformTarballSha256 !== frozen.platform.tarball_sha256) {
      blockingFailures.push('downloaded Codex platform package tarball SHA-256 does not match the frozen qualification identity');
    }
    if (platformTarballSizeBytes <= 0) {
      blockingFailures.push('downloaded Codex platform package tarball is empty');
    }
  } else {
    fs.rmSync(partialPlatformTarballPath, { force: true });
    blockingFailures.push(`Codex platform package tarball download failed with status ${platformTarballDownload.stdout || 'unknown'}`);
  }
}

let npmCacheAdd = null;
if (fs.existsSync(tarballPath)) {
  npmCacheAdd = run('npm', [
    'cache',
    'add',
    tarballPath,
    '--cache',
    npmCacheDir,
  ], { timeout: 300000 });
  if (npmCacheAdd.exit_code !== 0 || npmCacheAdd.error) {
    blockingFailures.push('npm cache add for Codex package tarball failed');
  }
}
let platformNpmCacheAdd = null;
if (fs.existsSync(platformTarballPath)) {
  platformNpmCacheAdd = run('npm', [
    'cache',
    'add',
    platformTarballPath,
    '--cache',
    npmCacheDir,
  ], { timeout: 300000 });
  if (platformNpmCacheAdd.exit_code !== 0 || platformNpmCacheAdd.error) {
    blockingFailures.push('npm cache add for Codex platform package tarball failed');
  }
}

const endedAt = new Date();
const cacheKeyPrefix = process.env.CACHE_KEY_PREFIX || 'opl-first-run-codex-install-assets';
const restoredCacheKey = process.env.CODEX_CACHE_RESTORE_MATCHED_KEY || '';
const cacheKey = version && tarballSha256 && platformTarballSha256
  ? `${cacheKeyPrefix}-${version}-${tarballSha256}-${platformTarballSha256}`
  : '';
const cacheSaveRequired = Boolean(cacheKey && restoredCacheKey !== cacheKey);
const preflight = {
  schema_version: 1,
  owner: 'one-person-lab-app',
  purpose: 'codex_install_asset_cache_preseed',
  status: blockingFailures.length === 0 ? 'ok' : 'failed',
  generated_at: endedAt.toISOString(),
  package: {
    name: packageName,
    requested_spec: packageSpec,
    version,
    tarball_url: tarballUrl,
    tarball_url_host: tarballUrlHost,
    dist_integrity: distIntegrity,
    platform_spec: platformPackageSpec,
    platform_version: platformVersion,
    platform_tarball_url: platformTarballUrl,
    platform_tarball_url_host: platformTarballUrlHost,
    platform_dist_integrity: platformDistIntegrity,
    frozen_identity: frozen,
    qualification_input_manifest_sha256: buildCohort?.digests?.qualification_input_manifest_sha256 || null,
  },
  registry: {
    npm_registry: registryUrl,
    package_metadata_url: registryMetadataUrl,
    status_code: Number.isFinite(registryStatusCode) ? registryStatusCode : null,
    response_path: 'codex-package-registry-response.json',
    npm_view: npmView,
    platform_npm_view: platformNpmView,
    metadata_request: registryResponse,
  },
  tarball: {
    source: cachedTarball ? 'verified_cache' : 'download',
    path: 'codex-package-tarballs/openai-codex.tgz',
    workflow_path: tarballPath,
    url_host: tarballUrlHost,
    response_status_code: Number.isFinite(tarballStatusCode) ? tarballStatusCode : null,
    sha256: tarballSha256,
    size_bytes: tarballSizeBytes,
    download: tarballDownload,
  },
  platform_tarball: {
    source: cachedPlatformTarball ? 'verified_cache' : 'download',
    path: 'codex-package-tarballs/openai-codex-darwin-arm64.tgz',
    workflow_path: platformTarballPath,
    requested_spec: platformPackageLabel,
    version: platformVersion,
    url_host: platformTarballUrlHost,
    response_status_code: Number.isFinite(platformTarballStatusCode) ? platformTarballStatusCode : null,
    sha256: platformTarballSha256,
    size_bytes: platformTarballSizeBytes,
    download: platformTarballDownload,
  },
  cache: {
    npm_cache_dir: 'codex-npm-cache',
    workflow_npm_cache_dir: npmCacheDir,
    workflow_cache_key: cacheKey,
    key_schema: 'content_addressed_v1',
    save_required: cacheSaveRequired,
    write_scope: 'refs/heads/main_only',
    restore: {
      cache_hit: process.env.CODEX_CACHE_RESTORE_HIT || '',
      primary_key: process.env.CODEX_CACHE_RESTORE_PRIMARY_KEY || '',
      matched_key: restoredCacheKey,
    },
    npm_cache_add: npmCacheAdd,
    platform_npm_cache_add: platformNpmCacheAdd,
  },
  timings: {
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    elapsed_ms: endedAt.getTime() - startedAt.getTime(),
  },
  truth_boundary: 'install_asset_cache_preseed_not_app_readiness_truth_or_owner_receipt',
  diagnostics,
  blocking_failures: blockingFailures,
  warnings: diagnostics,
  failures: blockingFailures,
};

fs.writeFileSync(preflightPath, `${JSON.stringify(preflight, null, 2)}\n`);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, [
    `preflight_json=${preflightPath}`,
    `tarball_path=${tarballPath}`,
    `platform_tarball_path=${platformTarballPath}`,
    `npm_cache_dir=${npmCacheDir}`,
    `package_version=${version || ''}`,
    `cache_key=${cacheKey}`,
    `cache_save_required=${cacheSaveRequired}`,
  ].join('\n') + '\n');
}

console.log(JSON.stringify({
  preflight: preflightPath,
  status: preflight.status,
  package_version: version,
  tarball_host: tarballUrlHost,
  tarball_sha256: tarballSha256,
  tarball_size_bytes: tarballSizeBytes,
  platform_package_version: platformVersion,
  platform_tarball_host: platformTarballUrlHost,
  platform_tarball_sha256: platformTarballSha256,
  platform_tarball_size_bytes: platformTarballSizeBytes,
  cache_key: cacheKey,
  cache_save_required: cacheSaveRequired,
  elapsed_ms: preflight.timings.elapsed_ms,
}, null, 2));

for (const diagnostic of diagnostics) {
  console.error(`Codex package install asset diagnostic warning: ${diagnostic}`);
}

if (blockingFailures.length > 0) {
  console.error('Codex package install asset preflight failed:');
  for (const failure of blockingFailures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}
