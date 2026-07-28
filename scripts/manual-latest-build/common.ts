import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { resolveReleaseVersionIdentity } from '../release-version.ts';

export type JsonRecord = Record<string, any>;

export type ManualLocalAppIdentity = {
  build_kind: 'local-development';
  public_updater_version: string;
  bundle_version: string;
  source_provenance_sha256: string;
};

export type StampedManualLocalAppIdentity = ManualLocalAppIdentity & {
  source_lock_sha256: string;
};

type CommandOptions = {
  cwd?: string;
  capture?: boolean;
  timeoutMs?: number;
  allowFailure?: boolean;
  env?: NodeJS.ProcessEnv;
};

export function commandResult(
  command: string,
  args: string[],
  options: CommandOptions = {},
) {
  const capture = options.capture ?? false;
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env ?? process.env,
    timeout: options.timeoutMs ?? 60_000,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (!options.allowFailure && (result.error || result.status !== 0)) {
    const detail = [result.stdout, result.stderr]
      .filter((value) => typeof value === 'string' && value.trim())
      .join('\n')
      .trim();
    throw new Error([
      `Command failed: ${command} ${args.join(' ')}`,
      result.error?.message ?? '',
      detail,
    ].filter(Boolean).join('\n'));
  }
  return result;
}

export function commandOutput(
  command: string,
  args: string[],
  options: Omit<CommandOptions, 'capture'> = {},
) {
  return String(commandResult(command, args, { ...options, capture: true }).stdout ?? '').trim();
}

export function readJson(filePath: string): JsonRecord {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonRecord;
}

export function writeJson(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function manualSourceProvenanceSha256(payload: unknown) {
  return crypto.createHash('sha256')
    .update(`${JSON.stringify(payload, null, 2)}\n`)
    .digest('hex');
}

export function deriveManualLocalAppIdentity(
  publicUpdaterVersion: string,
  sourceProvenanceSha256: string,
): ManualLocalAppIdentity {
  if (!/^\d+\.\d+\.\d+$/.test(publicUpdaterVersion)) {
    throw new Error(`Manual local App public updater version is invalid: ${publicUpdaterVersion || '<empty>'}`);
  }
  if (!/^[0-9a-f]{64}$/.test(sourceProvenanceSha256)) {
    throw new Error('Manual local App source provenance SHA-256 must be an exact lowercase hex digest');
  }
  return {
    build_kind: 'local-development',
    public_updater_version: publicUpdaterVersion,
    bundle_version: `${publicUpdaterVersion}-local.src${sourceProvenanceSha256.slice(0, 12)}`,
    source_provenance_sha256: sourceProvenanceSha256,
  };
}

export function stampManualLocalAppIdentity(
  appPath: string,
  identity: StampedManualLocalAppIdentity,
) {
  const expected = deriveManualLocalAppIdentity(
    identity.public_updater_version,
    identity.source_provenance_sha256,
  );
  if (
    identity.build_kind !== expected.build_kind
    || identity.bundle_version !== expected.bundle_version
    || !/^[0-9a-f]{64}$/.test(identity.source_lock_sha256)
  ) {
    throw new Error('Manual local App identity does not match its source provenance');
  }
  const plistPath = requireFile(
    path.join(appPath, 'Contents', 'Info.plist'),
    'Manual local App Info.plist',
  );
  const values = {
    OPLBuildKind: identity.build_kind,
    OPLPublicUpdaterVersion: identity.public_updater_version,
    OPLSourceProvenanceSHA256: identity.source_provenance_sha256,
    OPLSourceLockSHA256: identity.source_lock_sha256,
  };
  for (const [key, value] of Object.entries(values)) {
    const replaced = commandResult('plutil', [
      '-replace', key, '-string', value, plistPath,
    ], {
      capture: true,
      allowFailure: true,
    });
    if (replaced.status !== 0) {
      commandResult('plutil', ['-insert', key, '-string', value, plistPath], {
        capture: true,
      });
    }
    const observed = commandOutput('plutil', [
      '-extract', key, 'raw', '-o', '-', plistPath,
    ]);
    if (observed !== value) {
      throw new Error(`Manual local App Info.plist ${key} mismatch after stamping`);
    }
  }
  return identity;
}

export function fileSha256(filePath: string) {
  const digest = crypto.createHash('sha256');
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) digest.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return digest.digest('hex');
}

export function requireDirectory(directoryPath: string, label: string) {
  if (!fs.statSync(directoryPath, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`${label} directory is missing: ${directoryPath}`);
  }
  return directoryPath;
}

export function requireFile(filePath: string, label: string) {
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`${label} file is missing: ${filePath}`);
  }
  return filePath;
}

export function githubApi<T = JsonRecord>(apiPath: string): T {
  const gh = commandResult('gh', ['api', apiPath], {
    capture: true,
    timeoutMs: 60_000,
    allowFailure: true,
  });
  if (gh.status === 0) {
    return JSON.parse(String(gh.stdout)) as T;
  }

  const headers = [
    '-H', 'Accept: application/vnd.github+json',
    '-H', 'X-GitHub-Api-Version: 2022-11-28',
    '-H', 'User-Agent: one-person-lab-manual-latest-build',
  ];
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) headers.push('-H', `Authorization: Bearer ${token}`);
  const output = commandOutput('curl', [
    '--fail', '--silent', '--show-error', '--location',
    '--connect-timeout', '10', '--max-time', '60',
    '--retry', '3', '--retry-all-errors',
    ...headers,
    `https://api.github.com/${apiPath}`,
  ], { timeoutMs: 75_000 });
  return JSON.parse(output) as T;
}

function expectedSha256(digest: unknown, label: string) {
  if (typeof digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new Error(`${label} has no exact GitHub sha256 digest`);
  }
  return digest.slice('sha256:'.length);
}

export function downloadGithubAsset(
  asset: JsonRecord,
  targetPath: string,
  label: string,
) {
  const expected = expectedSha256(asset.digest, label);
  if (fs.statSync(targetPath, { throwIfNoEntry: false })?.isFile()
    && fileSha256(targetPath) === expected) {
    return { path: targetPath, sha256: expected, reused: true };
  }
  if (typeof asset.browser_download_url !== 'string' || !asset.browser_download_url.startsWith('https://')) {
    throw new Error(`${label} has no HTTPS download URL`);
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporary = `${targetPath}.partial-${process.pid}`;
  fs.rmSync(temporary, { force: true });
  try {
    commandResult('curl', [
      '--fail', '--show-error', '--location',
      '--connect-timeout', '10', '--max-time', '300',
      '--retry', '3', '--retry-all-errors',
      '--output', temporary,
      asset.browser_download_url,
    ], { timeoutMs: 315_000 });
    const actual = fileSha256(temporary);
    if (actual !== expected) {
      throw new Error(`${label} digest mismatch: expected=${expected} actual=${actual}`);
    }
    fs.renameSync(temporary, targetPath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return { path: targetPath, sha256: expected, reused: false };
}

export function extractVerifiedTarGz(archivePath: string, targetRoot: string) {
  const entries = commandOutput('tar', ['-tzf', archivePath], { timeoutMs: 60_000 })
    .split(/\r?\n/)
    .filter(Boolean);
  if (entries.length === 0 || entries.some((entry) => {
    const normalized = path.posix.normalize(entry);
    return path.posix.isAbsolute(entry)
      || normalized === '..'
      || normalized.startsWith('../');
  })) {
    throw new Error(`Archive contains an unsafe path: ${archivePath}`);
  }
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(targetRoot, { recursive: true });
  commandResult('tar', ['-xzf', archivePath, '-C', targetRoot], { timeoutMs: 120_000 });
}

export function verifyMacArm64Binary(binaryPath: string, versionArgs: string[], label: string) {
  requireFile(binaryPath, label);
  fs.chmodSync(binaryPath, fs.statSync(binaryPath).mode | 0o755);
  const fileOutput = commandOutput('file', [binaryPath]);
  if (!/Mach-O 64-bit executable arm64/.test(fileOutput)) {
    throw new Error(`${label} is not a macOS arm64 executable: ${fileOutput}`);
  }
  const versionOutput = commandOutput(binaryPath, versionArgs, { timeoutMs: 30_000 });
  if (process.platform === 'darwin') {
    commandResult('codesign', ['--verify', '--verbose=2', binaryPath], { timeoutMs: 30_000 });
  }
  return versionOutput;
}

export function stableVersionParts(value: string) {
  const match = value.match(/^(?:[^0-9]*)?(\d+)\.(\d+)\.(\d+)$/);
  return match ? match.slice(1).map(Number) : null;
}

export function compareStableVersions(left: string, right: string) {
  const leftParts = stableVersionParts(left);
  const rightParts = stableVersionParts(right);
  if (!leftParts || !rightParts) throw new Error(`Cannot compare stable versions: ${left}, ${right}`);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

export function manualVersions(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now).split('-').map(Number);
  const [year, month, day] = parts;
  const displayVersion = `${year - 2000}.${month}.${day}`;
  return {
    displayVersion,
    updaterVersion: resolveReleaseVersionIdentity('stable', displayVersion).updaterVersion,
  };
}

export type RepoSnapshot = {
  id: string;
  root: string;
  head: string;
  branch: string;
  local_main: string;
  origin_main: string | null;
};

export function snapshotDevelopmentRepo(id: string, root: string): RepoSnapshot {
  requireDirectory(root, `${id} repository`);
  const head = commandOutput('git', ['rev-parse', 'HEAD'], { cwd: root });
  const branch = commandOutput('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
    cwd: root,
    allowFailure: true,
  });
  const localMain = commandOutput('git', ['rev-parse', 'refs/heads/main'], { cwd: root });
  const origin = commandResult('git', ['rev-parse', '--verify', 'refs/remotes/origin/main'], {
    cwd: root,
    capture: true,
    allowFailure: true,
  });
  const originMain = origin.status === 0 ? String(origin.stdout).trim() : null;
  const status = commandOutput('git', ['status', '--porcelain'], { cwd: root });
  if (branch !== 'main' || head !== localMain) {
    throw new Error(`${id} must use its development directory main HEAD: branch=${branch || '<detached>'} head=${head} main=${localMain}`);
  }
  if (status) {
    throw new Error(`${id} development directory is not clean:\n${status}`);
  }
  return { id, root, head, branch, local_main: localMain, origin_main: originMain };
}

export function assertDevelopmentRepoSnapshotUnchanged(expected: RepoSnapshot) {
  let actual: RepoSnapshot;
  try {
    actual = snapshotDevelopmentRepo(expected.id, expected.root);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${expected.id} source snapshot became invalid during manual latest build: ${detail}`,
      { cause: error },
    );
  }

  // Remote advancement is provenance after freeze; only frozen checkout bytes can invalidate the build.
  const fields = ['head', 'branch', 'local_main'] as const;
  const differences = fields
    .filter((field) => actual[field] !== expected[field])
    .map((field) => (
      `${field} expected=${expected[field] ?? '<missing>'} actual=${actual[field] ?? '<missing>'}`
    ));
  if (differences.length > 0) {
    throw new Error(
      `${expected.id} source snapshot changed during manual latest build: ${differences.join(', ')}`,
    );
  }
}

export function assertDevelopmentRepoSnapshotsUnchanged(expected: RepoSnapshot[]) {
  for (const repository of expected) {
    assertDevelopmentRepoSnapshotUnchanged(repository);
  }
}
