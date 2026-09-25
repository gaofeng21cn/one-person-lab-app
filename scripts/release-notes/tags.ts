import fs from 'node:fs';
import path from 'node:path';
import { commandOutput, gitOutput, gitRefExists } from './command.ts';
import type { ReleaseChannel, ReleaseNoteOptions } from './types.ts';

function normalizeReleaseVersion(versionOrTag: string) {
  return versionOrTag.startsWith('v') ? versionOrTag.slice(1) : versionOrTag;
}

export function buildReleaseTitle(versionOrTag: string) {
  return `One Person Lab v${normalizeReleaseVersion(versionOrTag)}`;
}

export function normalizeTag(versionOrTag: string) {
  return versionOrTag.startsWith('v') ? versionOrTag : `v${versionOrTag}`;
}

function releaseTimestamp(release: any) {
  const value = release.publishedAt || release.published_at || release.createdAt || release.created_at || '';
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareReleaseVersions(left: string, right: string) {
  const leftMatch = left.match(/^v?(\d+)\.(\d+)\.(\d+)(-nightly)?$/);
  const rightMatch = right.match(/^v?(\d+)\.(\d+)\.(\d+)(-nightly)?$/);
  if (!leftMatch || !rightMatch) {
    return 0;
  }
  for (let index = 1; index <= 3; index += 1) {
    const delta = Number(leftMatch[index]) - Number(rightMatch[index]);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function listRemoteReleaseTags(channel: ReleaseChannel, repo: string, currentTag: string) {
  const raw = commandOutput('gh', ['release', 'list', '--repo', repo, '--limit', '100', '--json', 'tagName,isDraft,isPrerelease,createdAt,publishedAt']);
  if (!raw) {
    return [];
  }
  try {
    const releases = JSON.parse(raw);
    const currentRelease = releases.find((release: any) => release.tagName === currentTag);
    const currentTimestamp = currentRelease ? releaseTimestamp(currentRelease) : 0;
    return releases
      .filter((release: any) => !release.isDraft)
      .filter((release: any) => release.tagName !== currentTag)
      .filter((release: any) => {
        if (channel === 'nightly') {
          return release.isPrerelease === true && /^v\d+\.\d+\.\d+-nightly$/.test(release.tagName);
        }
        return release.isPrerelease !== true && /^v\d+\.\d+\.\d+$/.test(release.tagName);
      })
      .filter((release: any) => {
        if (currentTimestamp > 0) {
          return releaseTimestamp(release) < currentTimestamp;
        }
        return compareReleaseVersions(release.tagName, currentTag) < 0;
      })
      .sort((left: any, right: any) => releaseTimestamp(right) - releaseTimestamp(left))
      .map((release: any) => release.tagName);
  } catch {
    return [];
  }
}

function listLocalTags(channel: ReleaseChannel, currentTag: string) {
  const pattern = channel === 'nightly' ? 'v*-nightly' : 'v[0-9]*.[0-9]*.[0-9]*';
  const raw = commandOutput('git', ['tag', '--list', pattern, '--sort=-creatordate']);
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((tag) => tag !== currentTag)
    .filter((tag) => (channel === 'nightly' ? /^v\d+\.\d+\.\d+-nightly$/.test(tag) : /^v\d+\.\d+\.\d+$/.test(tag)))
    .filter((tag) => compareReleaseVersions(tag, currentTag) < 0);
}

export function resolvePreviousTag(options: ReleaseNoteOptions, currentTag: string) {
  if (options.previousTag) {
    return normalizeTag(options.previousTag);
  }
  const releaseRepo = options.releaseRepo || 'gaofeng21cn/one-person-lab-app';
  const [remoteTag] = listRemoteReleaseTags(options.channel, releaseRepo, currentTag);
  if (remoteTag) {
    return remoteTag;
  }
  const [localTag] = listLocalTags(options.channel, currentTag);
  return localTag || null;
}

export function readAppShellRepositoryAt(appRef: string | null) {
  if (!appRef || !gitRefExists(appRef, process.cwd())) return null;
  const raw = gitOutput(['show', `${appRef}:contracts/app-shell-adapter.json`], process.cwd());
  try { return JSON.parse(raw)?.shell_source?.owner_repo || null; } catch { return null; }
}

function readAppShellRefAt(appRef: string | null) {
  if (!appRef || !gitRefExists(appRef, process.cwd())) {
    return null;
  }
  const raw = gitOutput(['show', `${appRef}:contracts/app-shell-adapter.json`], process.cwd());
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw)?.shell_source?.upstream_ref || null;
  } catch {
    return null;
  }
}

export function resolveShellRef(shellRoot: string | null, explicitRef: string | undefined, fallbackAppRef: string | null) {
  if (explicitRef) {
    return explicitRef;
  }
  const fromAppContract = readAppShellRefAt(fallbackAppRef);
  if (fromAppContract) {
    return fromAppContract;
  }
  if (shellRoot && fs.existsSync(path.join(shellRoot, '.git'))) {
    const ref = gitOutput(['rev-parse', 'HEAD'], shellRoot);
    if (ref) {
      return ref;
    }
  }
  return null;
}

export function resolvePreviousShellRef(shellRoot: string | null, explicitRef: string | undefined, previousAppRef: string | null) {
  if (explicitRef) {
    return explicitRef;
  }
  const fromAppContract = readAppShellRefAt(previousAppRef);
  if (fromAppContract) {
    return fromAppContract;
  }
  if (shellRoot && fs.existsSync(path.join(shellRoot, '.git'))) {
    return gitOutput(['describe', '--tags', '--abbrev=0', 'HEAD^'], shellRoot) || null;
  }
  return null;
}
