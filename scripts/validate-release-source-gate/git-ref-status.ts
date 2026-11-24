import fs from 'node:fs';
import path from 'node:path';
import type {
  CommandResult,
  CommandRunner,
} from './types.ts';

export function firstLine(text: string): string {
  return text.trim().split(/\r?\n/).find((line) => line.trim())?.trim() ?? '';
}

export function isFullSha(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value.trim());
}

export function normalizedSha(value: string): string {
  return value.trim().toLowerCase();
}

export function sameSha(left: string, right: string): boolean {
  return isFullSha(left) && isFullSha(right) && normalizedSha(left) === normalizedSha(right);
}

export function canonicalPath(candidatePath: string): string {
  try {
    return fs.realpathSync(candidatePath);
  } catch {
    return path.resolve(candidatePath);
  }
}

export function canonicalGithubRepository(remoteUrl: string): string | null {
  const normalized = remoteUrl.trim().replace(/\.git$/i, '');
  const match = normalized.match(/github\.com(?::\d+)?[/:]([^/]+\/[^/]+)$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function remoteHeadSha(result: CommandResult, ref: string): string | null {
  if (result.status !== 0) return null;
  const matches = result.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length === 2 && parts[1] === ref && isFullSha(parts[0]));
  return matches.length === 1 ? normalizedSha(matches[0][0]) : null;
}

function refCandidates(ref: string): string[] {
  if (/^[0-9a-f]{7,40}$/i.test(ref)) return [ref];
  return [
    ref,
    `refs/heads/${ref}`,
    `refs/remotes/origin/${ref}`,
    `refs/tags/${ref}`,
  ];
}

export function resolveGitRef(root: string, ref: string, runner: CommandRunner, env: NodeJS.ProcessEnv): string | null {
  for (const candidate of refCandidates(ref)) {
    const result = runner('git', ['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`], { cwd: root, env });
    const resolved = firstLine(result.stdout);
    if (result.status === 0 && isFullSha(resolved)) return normalizedSha(resolved);
  }
  return null;
}

function pathForGitStatus(candidatePath: string): string {
  return candidatePath.split(path.sep).join('/');
}

function ignoredFrameworkCheckoutStatusPrefixes(repoRoot: string, frameworkRoot: string): string[] {
  const relative = path.relative(repoRoot, frameworkRoot);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return [];
  const normalized = pathForGitStatus(relative).replace(/\/+$/, '');
  return normalized ? [`?? ${normalized}`, `?? ${normalized}/`] : [];
}

function isIgnoredFrameworkCheckoutStatusLine(line: string, ignoredPrefixes: string[]): boolean {
  const exactDirectory = ignoredPrefixes[0];
  const directoryContents = ignoredPrefixes[1];
  return line === exactDirectory || Boolean(directoryContents && line.startsWith(directoryContents));
}

export function statusTextWithoutDeclaredFrameworkCheckout(
  statusText: string,
  repoRoot: string,
  frameworkRoot: string,
): string {
  const ignoredPrefixes = ignoredFrameworkCheckoutStatusPrefixes(repoRoot, frameworkRoot);
  if (ignoredPrefixes.length === 0) return statusText;
  return statusText
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trimEnd();
      if (!trimmed) return false;
      return !isIgnoredFrameworkCheckoutStatusLine(trimmed, ignoredPrefixes);
    })
    .join('\n');
}
