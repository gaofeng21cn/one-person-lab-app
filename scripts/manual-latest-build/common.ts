import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  releaseCalendarParts,
  resolveReleaseVersionIdentity,
} from '../release-version.ts';

export type JsonRecord = Record<string, any>;

export type ManualLocalAppIdentity = {
  build_kind: 'local-development';
  public_updater_version: string;
  machine_version: string;
  local_build_id: string;
  updater_policy: 'disabled-local-development';
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
    machine_version: publicUpdaterVersion,
    local_build_id: `local.src${sourceProvenanceSha256.slice(0, 12)}`,
    updater_policy: 'disabled-local-development',
    source_provenance_sha256: sourceProvenanceSha256,
  };
}

function setPlistString(plistPath: string, key: string, value: string) {
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
    || identity.machine_version !== expected.machine_version
    || identity.local_build_id !== expected.local_build_id
    || identity.updater_policy !== expected.updater_policy
    || !/^[0-9a-f]{64}$/.test(identity.source_lock_sha256)
  ) {
    throw new Error('Manual local App identity does not match its source provenance');
  }
  const plistPath = requireFile(
    path.join(appPath, 'Contents', 'Info.plist'),
    'Manual local App Info.plist',
  );
  for (const key of ['CFBundleShortVersionString', 'CFBundleVersion']) {
    const actual = commandOutput('plutil', [
      '-extract', key, 'raw', '-o', '-', plistPath,
    ]);
    if (actual !== identity.machine_version) {
      throw new Error(
        `Manual local App ${key} must retain canonical machine version `
        + `${identity.machine_version}; observed ${actual || '<empty>'}`,
      );
    }
  }
  const values = {
    OPLBuildKind: identity.build_kind,
    OPLLocalBuildID: identity.local_build_id,
    OPLPublicUpdaterVersion: identity.public_updater_version,
    OPLUpdaterPolicy: identity.updater_policy,
    OPLSourceProvenanceSHA256: identity.source_provenance_sha256,
    OPLSourceLockSHA256: identity.source_lock_sha256,
  };
  for (const [key, value] of Object.entries(values)) {
    setPlistString(plistPath, key, value);
  }
  const launchEnvironment = commandResult('plutil', [
    '-extract', 'LSEnvironment', 'json', '-o', '-', plistPath,
  ], {
    capture: true,
    allowFailure: true,
  });
  if (launchEnvironment.status !== 0) {
    commandResult('plutil', [
      '-insert', 'LSEnvironment', '-json', '{}', plistPath,
    ], {
      capture: true,
    });
  }
  setPlistString(
    plistPath,
    'LSEnvironment.AIONUI_DISABLE_AUTO_UPDATE',
    '1',
  );
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

export function manualVersions(
  now = new Date(),
  latestStableTag: string | null = null,
) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now).split('-').map(Number);
  const [year, month, day] = parts;
  const calendarDisplayVersion = `${year - 2000}.${month}.${day}`;
  let displayVersion = calendarDisplayVersion;
  if (latestStableTag) {
    const latestDisplayVersion = latestStableTag.replace(/^v/, '');
    const latestCalendar = releaseCalendarParts(
      'stable',
      latestDisplayVersion,
    );
    if (!latestCalendar) {
      throw new Error(
        `Latest public Stable tag is not canonical: ${latestStableTag}`,
      );
    }
    const latestDate = Date.UTC(
      latestCalendar.year,
      latestCalendar.month - 1,
      latestCalendar.day,
    );
    const currentDate = Date.UTC(year, month - 1, day);
    if (latestDate > currentDate) {
      throw new Error(
        `Latest public Stable tag is newer than the current Asia/Shanghai date: ${latestStableTag}`,
      );
    }
    if (latestDate === currentDate) {
      displayVersion = latestDisplayVersion;
    }
  }
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
  local_main: string | null;
  origin_main: string | null;
  remote_main: string | null;
};

export function snapshotDevelopmentRepo(id: string, root: string): RepoSnapshot {
  requireDirectory(root, `${id} repository`);
  const head = commandOutput('git', ['rev-parse', 'HEAD'], { cwd: root });
  const branch = commandOutput('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
    cwd: root,
    allowFailure: true,
  });
  const localMainResult = commandResult('git', ['rev-parse', '--verify', 'refs/heads/main'], {
    cwd: root,
    capture: true,
    allowFailure: true,
  });
  const localMain = localMainResult.status === 0
    ? String(localMainResult.stdout).trim()
    : null;
  const origin = commandResult('git', ['rev-parse', '--verify', 'refs/remotes/origin/main'], {
    cwd: root,
    capture: true,
    allowFailure: true,
  });
  const originMain = origin.status === 0 ? String(origin.stdout).trim() : null;
  const originUrl = commandResult('git', ['remote', 'get-url', 'origin'], {
    cwd: root,
    capture: true,
    allowFailure: true,
  });
  let remoteMain: string | null = null;
  if (originUrl.status === 0 && String(originUrl.stdout).trim()) {
    const remote = commandResult('git', [
      'ls-remote', '--heads', 'origin', 'refs/heads/main',
    ], {
      cwd: root,
      capture: true,
      allowFailure: true,
      timeoutMs: 60_000,
    });
    const match = remote.status === 0
      ? /^([0-9a-f]{40})\s+refs\/heads\/main$/m.exec(String(remote.stdout).trim())
      : null;
    if (!match) {
      const detail = [remote.error?.message, remote.stderr]
        .filter((value) => typeof value === 'string' && value.trim())
        .join('\n')
        .trim();
      throw new Error(
        `${id} cannot read fresh remote origin/main${detail ? `: ${detail}` : ''}`,
      );
    }
    remoteMain = match[1]!;
    if (originMain !== remoteMain) {
      throw new Error(
        `${id} fetched origin/main is stale: `
        + `origin/main=${originMain || '<missing>'} remote=${remoteMain}`,
      );
    }
  }
  const status = commandOutput('git', ['status', '--porcelain'], { cwd: root });
  if (originMain) {
    if (head !== originMain) {
      throw new Error(
        `${id} must use the fetched canonical origin/main HEAD: `
        + `branch=${branch || '<detached>'} head=${head} origin/main=${originMain}`,
      );
    }
  } else if (branch !== 'main' || !localMain || head !== localMain) {
    throw new Error(
      `${id} has no fetched origin/main and must use local main HEAD: `
      + `branch=${branch || '<detached>'} head=${head} main=${localMain || '<missing>'}`,
    );
  }
  if (status) {
    throw new Error(`${id} development directory is not clean:\n${status}`);
  }
  return {
    id,
    root,
    head,
    branch,
    local_main: localMain,
    origin_main: originMain,
    remote_main: remoteMain,
  };
}

export function assertDevelopmentRepoSnapshotUnchanged(expected: RepoSnapshot) {
  let head: string;
  let branch: string;
  let status: string;
  try {
    requireDirectory(expected.root, `${expected.id} repository`);
    head = commandOutput('git', ['rev-parse', 'HEAD'], { cwd: expected.root });
    branch = commandOutput('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
      cwd: expected.root,
      allowFailure: true,
    });
    status = commandOutput('git', ['status', '--porcelain'], { cwd: expected.root });
    if (status) {
      throw new Error(`${expected.id} development directory is not clean:\n${status}`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${expected.id} source snapshot became invalid during manual latest build: ${detail}`,
      { cause: error },
    );
  }

  const differences = [
    head === expected.head
      ? null
      : `head expected=${expected.head} actual=${head}`,
    branch === expected.branch
      ? null
      : `branch expected=${expected.branch || '<detached>'} actual=${branch || '<detached>'}`,
  ].filter((value): value is string => value !== null);
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
