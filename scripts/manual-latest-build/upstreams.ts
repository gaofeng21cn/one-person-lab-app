import fs from 'node:fs';
import path from 'node:path';
import { findNodeToolchain } from '../build-full-first-install-package/runtime-sources.ts';

import {
  commandOutput,
  commandResult,
  compareStableVersions,
  downloadGithubAsset,
  extractVerifiedTarGz,
  fileSha256,
  githubApi,
  type JsonRecord,
  requireFile,
  verifyMacArm64Binary,
} from './common.ts';

export type UpstreamInputs = {
  officecli: {
    tag: string;
    version: string;
    published_at: string;
    source_root: string;
    source_commit: string;
    binary: string;
    binary_sha256: string;
    binary_version: string;
  };
  mineru_open_api: {
    tag: string;
    version: string;
    tag_commit: string;
    source_url: string;
    binary: string;
    binary_sha256: string;
    binary_version: string;
  };
};

/** Materialize Framework's frozen official Node distribution, never the build host's Node. */
export function prepareResolvedNodeToolchain(input: JsonRecord, cacheRoot: string, shellRoot: string) {
  const version = input?.version;
  if (input?.dependency_id !== 'node' || !/^\d+\.\d+\.\d+$/.test(version ?? '')) {
    throw new Error('Manual Full build requires the Framework-resolved Node distribution.');
  }
  const archiveName = `node-v${version}-darwin-arm64.tar.gz`;
  const baseUrl = `https://nodejs.org/dist/v${version}`;
  if (input.archive_url !== `${baseUrl}/${archiveName}`
    || input.source_ref !== `${baseUrl}/SHASUMS256.txt`
    || !/^[a-f0-9]{64}$/.test(input.archive_sha256 ?? '')
    || !Number.isSafeInteger(input.archive_size_bytes) || input.archive_size_bytes <= 0
    || input.install_metadata?.format !== 'tar.gz'
    || input.install_metadata?.strip_components !== 1) {
    throw new Error('Manual Full build requires an exact official Node archive and checksum identity.');
  }
  const releaseRoot = path.join(cacheRoot, 'node', `v${version}`);
  const archive = downloadGithubAsset({
    digest: `sha256:${input.archive_sha256}`,
    browser_download_url: input.archive_url,
  }, path.join(releaseRoot, archiveName), `Node v${version} macOS arm64 archive`);
  if (fs.statSync(archive.path).size !== input.archive_size_bytes) {
    throw new Error('Framework-resolved Node archive size drifted.');
  }
  const extractedRoot = path.join(releaseRoot, 'extracted');
  extractVerifiedTarGz(archive.path, extractedRoot);
  const toolchain = findNodeToolchain(
    path.join(extractedRoot, `node-v${version}-darwin-arm64`, 'bin', 'node'),
    shellRoot,
  );
  const observedVersion = commandOutput(toolchain.nodeBin, ['--version']);
  if (observedVersion !== `v${version}`) {
    throw new Error(`Official Node binary version drifted: expected=v${version} actual=${observedVersion}`);
  }
  return { ...toolchain, version, node_sha256: fileSha256(toolchain.nodeBin), archive: archive.path,
    archive_sha256: archive.sha256 };
}

function releaseTag(release: JsonRecord, label: string) {
  if (typeof release.tag_name !== 'string' || !release.tag_name) {
    throw new Error(`${label} release has no tag_name`);
  }
  return release.tag_name;
}

function releaseAsset(release: JsonRecord, name: string, label: string) {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const asset = assets.find((candidate) => candidate?.name === name);
  if (!asset) throw new Error(`${label} release is missing asset ${name}`);
  return asset as JsonRecord;
}

function releasePublishedAt(release: JsonRecord) {
  return typeof release.published_at === 'string' ? release.published_at : '';
}

function versionFromTag(tag: string, prefix: string, label: string) {
  if (!tag.startsWith(prefix) || !/^\d+\.\d+\.\d+$/.test(tag.slice(prefix.length))) {
    throw new Error(`${label} has an unsupported stable tag: ${tag}`);
  }
  return tag.slice(prefix.length);
}

function prepareOfficeCli(cacheRoot: string) {
  const release = githubApi<JsonRecord>('repos/iOfficeAI/OfficeCLI/releases/latest');
  const tag = releaseTag(release, 'OfficeCLI');
  const version = versionFromTag(tag, 'v', 'OfficeCLI');
  const binaryAsset = releaseAsset(release, 'officecli-mac-arm64', 'OfficeCLI');
  const releaseRoot = path.join(cacheRoot, 'officecli', tag);
  const binary = downloadGithubAsset(
    binaryAsset,
    path.join(releaseRoot, 'officecli-mac-arm64'),
    `OfficeCLI ${tag} macOS arm64 binary`,
  );
  fs.chmodSync(binary.path, fs.statSync(binary.path).mode | 0o755);
  const binaryVersion = verifyMacArm64Binary(binary.path, ['--version'], 'OfficeCLI');
  if (!new RegExp(`\\b${version.replaceAll('.', '\\.')}\\b`).test(binaryVersion)) {
    throw new Error(`OfficeCLI binary version does not match ${tag}: ${binaryVersion}`);
  }

  const sourceRoot = path.join(releaseRoot, 'source');
  if (!fs.existsSync(path.join(sourceRoot, '.git'))) {
    if (fs.existsSync(sourceRoot)) {
      throw new Error(`OfficeCLI cache path exists but is not a Git checkout: ${sourceRoot}`);
    }
    fs.mkdirSync(path.dirname(sourceRoot), { recursive: true });
    commandResult('git', [
      'clone', '--depth=1', '--branch', tag, '--single-branch',
      'https://github.com/iOfficeAI/OfficeCLI.git', sourceRoot,
    ], { timeoutMs: 180_000 });
  }
  const origin = commandOutput('git', ['remote', 'get-url', 'origin'], { cwd: sourceRoot });
  if (origin !== 'https://github.com/iOfficeAI/OfficeCLI.git') {
    throw new Error(`OfficeCLI cache origin drifted: ${origin}`);
  }
  const sourceCommit = commandOutput('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot });
  const tagCommit = commandOutput('git', ['rev-parse', `${tag}^{commit}`], { cwd: sourceRoot });
  if (sourceCommit !== tagCommit) {
    throw new Error(`OfficeCLI source cache is not at ${tag}: ${sourceCommit}`);
  }
  if (commandOutput('git', ['status', '--porcelain'], { cwd: sourceRoot })) {
    throw new Error(`OfficeCLI source cache is dirty: ${sourceRoot}`);
  }
  return {
    tag,
    version,
    published_at: releasePublishedAt(release),
    source_root: sourceRoot,
    source_commit: sourceCommit,
    binary: binary.path,
    binary_sha256: binary.sha256,
    binary_version: binaryVersion,
  };
}

const MINERU_TAG_PREFIX = 'refs/tags/cli/mineru-open-api/v';
const MINERU_CDN_ROOT = 'https://cdn-mineru.openxlab.org.cn/open-api-cli';

export function selectLatestMineruCliTag(refs: JsonRecord[]) {
  const candidates = refs.filter((entry) => (
    typeof entry.ref === 'string'
    && /^refs\/tags\/cli\/mineru-open-api\/v\d+\.\d+\.\d+$/.test(entry.ref)
    && entry.object?.type === 'commit'
    && typeof entry.object.sha === 'string'
    && /^[0-9a-f]{40}$/.test(entry.object.sha)
  ));
  candidates.sort((left, right) => compareStableVersions(
    String(right.ref).slice(MINERU_TAG_PREFIX.length),
    String(left.ref).slice(MINERU_TAG_PREFIX.length),
  ));
  const latest = candidates[0];
  if (!latest) throw new Error('MinerU-Ecosystem has no stable MinerU OpenAPI CLI tag');
  const version = String(latest.ref).slice(MINERU_TAG_PREFIX.length);
  return {
    tag: `cli/mineru-open-api/v${version}`,
    version,
    tag_commit: String(latest.object.sha),
  };
}

export function mineruOpenApiBinaryUrl(version: string) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`MinerU OpenAPI has an invalid stable version: ${version}`);
  }
  return `${MINERU_CDN_ROOT}/v${version}/mineru-open-api-cli-darwin-arm64`;
}

function downloadMineruBinary(sourceUrl: string, targetPath: string) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporary = `${targetPath}.partial-${process.pid}`;
  fs.rmSync(temporary, { force: true });
  try {
    commandResult('curl', [
      '--fail', '--show-error', '--location',
      '--connect-timeout', '10', '--max-time', '300',
      '--retry', '3', '--retry-all-errors',
      '--output', temporary,
      sourceUrl,
    ], { timeoutMs: 315_000 });
    const stat = fs.statSync(temporary, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.size === 0) {
      throw new Error('MinerU OpenAPI CDN returned an empty binary');
    }
    fs.chmodSync(temporary, stat.mode | 0o755);
    fs.renameSync(temporary, targetPath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return { path: targetPath, sha256: fileSha256(targetPath) };
}

function prepareMineruOpenApi(cacheRoot: string) {
  const refs = githubApi<JsonRecord[]>(
    'repos/opendatalab/MinerU-Ecosystem/git/matching-refs/tags/cli/mineru-open-api/v',
  );
  const { tag, version, tag_commit } = selectLatestMineruCliTag(refs);
  const sourceUrl = mineruOpenApiBinaryUrl(version);
  const releaseRoot = path.join(cacheRoot, 'mineru-open-api', tag.replaceAll('/', '-'));
  const binary = downloadMineruBinary(
    sourceUrl,
    path.join(releaseRoot, 'mineru-open-api-cli-darwin-arm64'),
  );
  const binaryVersion = verifyMacArm64Binary(binary.path, ['--version'], 'MinerU OpenAPI');
  if (!binaryVersion.includes(`version v${version}`)) {
    throw new Error(`MinerU OpenAPI binary version does not match ${tag}: ${binaryVersion}`);
  }
  return {
    tag,
    version,
    tag_commit,
    source_url: sourceUrl,
    binary: binary.path,
    binary_sha256: binary.sha256,
    binary_version: binaryVersion,
  };
}

export function prepareLatestUpstreams(cacheRoot: string): UpstreamInputs {
  fs.mkdirSync(cacheRoot, { recursive: true });
  return {
    officecli: prepareOfficeCli(cacheRoot),
    mineru_open_api: prepareMineruOpenApi(cacheRoot),
  };
}
