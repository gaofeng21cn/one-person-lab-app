import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type { PublishedRelease } from '../stable-release-version-order.ts';
import { classifyStableSourceOperation } from '../stable-followup-router.ts';
import {
  activeReleaseStatuses,
  activeRunLookupTimeoutMs,
  activeRunPageSize,
  appRepository,
  fullSha,
  homebrewCaskPath,
  homebrewRepository,
  object,
  requiredString,
  requiredWorkflowPaths,
  sha256Bytes,
  stableAuthorityWorkflowPath,
  releaseNamespacePageLimit,
  releaseNamespacePageSize,
} from './policy.ts';
import type {
  ActiveReleaseRun,
  ActiveReleaseStatus,
  JsonRecord,
  StableAdmissionInput,
  StableAdmissionObservation,
  WorkflowBlob,
} from './types.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

function run(command: string, args: string[], cwd = appRoot): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    timeout: 45_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`);
  }
  return result.stdout;
}

export function parseGitHubJsonLookup(endpoint: string, result: CommandResult): unknown {
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n').trim();
    throw new Error(`GitHub lookup ${endpoint} failed${detail ? `:\n${detail}` : ''}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`GitHub lookup ${endpoint} did not return JSON.`);
  }
}

function ghJson(
  endpoint: string,
  fields: Record<string, string> = {},
  timeoutMs = 45_000,
): unknown {
  const args = ['api', '-X', 'GET', endpoint];
  for (const [key, value] of Object.entries(fields)) args.push('-f', `${key}=${value}`);
  const result = spawnSync('gh', args, {
    cwd: appRoot,
    encoding: 'utf8',
    env: process.env,
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  return parseGitHubJsonLookup(endpoint, {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  });
}

function localWorkflowBlobs(executorRef: string): WorkflowBlob[] {
  const head = fullSha(run('git', ['rev-parse', 'HEAD']).trim(), 'Local App HEAD');
  if (head !== executorRef) {
    throw new Error(`Local App executor HEAD ${head} does not match credential executor ref ${executorRef}.`);
  }
  return requiredWorkflowPaths.map((workflowPath) => {
    const bytes = Buffer.from(run('git', ['show', `${executorRef}:${workflowPath}`]));
    const gitBlobSha = fullSha(
      run('git', ['rev-parse', `${executorRef}:${workflowPath}`]).trim(),
      `Git blob ${workflowPath}`,
    );
    return {
      path: workflowPath,
      git_blob_sha: gitBlobSha,
      sha256: sha256Bytes(bytes),
    };
  });
}

function verifyFrozenAppCheckout(appSourceRoot: string, appRef: string): void {
  const head = fullSha(
    run('git', ['rev-parse', 'HEAD'], appSourceRoot).trim(),
    'Frozen App product HEAD',
  );
  if (head !== appRef) {
    throw new Error(`Frozen App product HEAD ${head} does not match admission App ref ${appRef}.`);
  }
}

export function parseGitHubReleaseNamespacePages(
  pages: unknown[],
  pageSize = releaseNamespacePageSize,
): PublishedRelease[] {
  if (
    !Number.isSafeInteger(pageSize)
    || pageSize <= 0
    || !Array.isArray(pages)
    || pages.length === 0
    || pages.length > releaseNamespacePageLimit
  ) {
    throw new Error('GitHub release namespace pagination is invalid or exceeds its bounded page limit.');
  }
  const releaseIds = new Set<number>();
  const releaseTags = new Set<string>();
  const releases: PublishedRelease[] = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    if (!Array.isArray(page) || page.length > pageSize) {
      throw new Error(`GitHub release namespace page ${pageIndex + 1} is malformed.`);
    }
    const isFinalPage = pageIndex === pages.length - 1;
    if ((!isFinalPage && page.length !== pageSize) || (isFinalPage && page.length === pageSize)) {
      throw new Error(
        `GitHub release namespace pages are incomplete at page ${pageIndex + 1}; `
        + `page_size=${page.length} limit=${pageSize}.`,
      );
    }
    for (let entryIndex = 0; entryIndex < page.length; entryIndex += 1) {
      const label = `GitHub release page ${pageIndex + 1} entry ${entryIndex}`;
      const release = object(page[entryIndex], label);
      const id = Number(release.id);
      const tagName = requiredString(release.tag_name, `${label} tag`);
      requiredString(release.target_commitish, `${label} target`);
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error(`${label} id must be a positive safe integer.`);
      }
      if (typeof release.draft !== 'boolean' || typeof release.prerelease !== 'boolean') {
        throw new Error(`${label} must declare boolean draft and prerelease state.`);
      }
      if (releaseIds.has(id) || releaseTags.has(tagName)) {
        throw new Error(`${label} duplicates a prior release id or tag.`);
      }
      releaseIds.add(id);
      releaseTags.add(tagName);
      releases.push({
        tag_name: tagName,
        draft: release.draft,
        prerelease: release.prerelease,
      });
    }
  }
  return releases;
}

function publishedReleases(): PublishedRelease[] {
  const pages: unknown[] = [];
  for (let page = 1; page <= releaseNamespacePageLimit; page += 1) {
    const payload = ghJson(`repos/${appRepository}/releases`, {
      per_page: String(releaseNamespacePageSize),
      page: String(page),
    });
    if (!Array.isArray(payload) || payload.length > releaseNamespacePageSize) {
      throw new Error(`GitHub release namespace page ${page} is malformed.`);
    }
    pages.push(payload);
    if (payload.length < releaseNamespacePageSize) {
      return parseGitHubReleaseNamespacePages(pages);
    }
  }
  throw new Error(
    `GitHub release namespace pagination remained full after ${releaseNamespacePageLimit} pages; response is incomplete.`,
  );
}

function matchingTagRefs(baseVersion: string): string[] {
  const payload = ghJson(`repos/${appRepository}/git/matching-refs/tags/v${baseVersion}`);
  if (!Array.isArray(payload)) throw new Error('GitHub matching tag lookup did not return an array.');
  return payload.map((entry, index) => requiredString(
    object(entry, `GitHub tag ref ${index}`).ref,
    `GitHub tag ref ${index}`,
  ));
}

async function anonymousWebuiTags(): Promise<string[]> {
  const tokenResponse = await fetch(
    'https://ghcr.io/token?scope=repository:gaofeng21cn/one-person-lab-webui:pull',
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!tokenResponse.ok) throw new Error(`Anonymous GHCR token lookup failed with HTTP ${tokenResponse.status}.`);
  const token = requiredString(
    object(await tokenResponse.json(), 'Anonymous GHCR token response').token,
    'Anonymous GHCR token',
  );
  const tags = new Set<string>();
  const visited = new Set<string>();
  let nextUrl: string | null =
    'https://ghcr.io/v2/gaofeng21cn/one-person-lab-webui/tags/list?n=1000';
  for (let page = 0; nextUrl; page += 1) {
    if (page >= 20 || visited.has(nextUrl)) {
      throw new Error('Anonymous GHCR tag pagination exceeded its bounded unique-page limit.');
    }
    visited.add(nextUrl);
    const tagsResponse = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!tagsResponse.ok) throw new Error(`Anonymous GHCR tag lookup failed with HTTP ${tagsResponse.status}.`);
    const pageTags = object(await tagsResponse.json(), 'Anonymous GHCR tag response').tags;
    if (!Array.isArray(pageTags) || !pageTags.every((entry) => typeof entry === 'string')) {
      throw new Error('Anonymous GHCR tag lookup did not return string tags.');
    }
    for (const tag of pageTags) tags.add(tag);
    const nextLink = tagsResponse.headers.get('link')
      ?.split(',')
      .map((entry) => entry.trim())
      .find((entry) => /;\s*rel="next"$/.test(entry))
      ?.match(/^<([^>]+)>/)?.[1] ?? null;
    if (!nextLink) {
      nextUrl = null;
      continue;
    }
    const resolved = new URL(nextLink, nextUrl);
    if (
      resolved.protocol !== 'https:'
      || resolved.host !== 'ghcr.io'
      || resolved.pathname !== '/v2/gaofeng21cn/one-person-lab-webui/tags/list'
    ) {
      throw new Error('Anonymous GHCR tag pagination escaped the exact public WebUI namespace.');
    }
    nextUrl = resolved.href;
  }
  return [...tags].sort();
}

function homebrewCaskObservation(): StableAdmissionObservation['homebrewCask'] {
  const payload = object(
    ghJson(`repos/${homebrewRepository}/contents/${homebrewCaskPath}`, { ref: 'main' }),
    'Homebrew Standard cask lookup',
  );
  if (payload.encoding !== 'base64') throw new Error('Homebrew Standard cask lookup is not base64 encoded.');
  return {
    repository: homebrewRepository,
    path: homebrewCaskPath,
    git_blob_sha: fullSha(payload.sha, 'Homebrew Standard cask Git blob'),
    bytes: Buffer.from(requiredString(payload.content, 'Homebrew Standard cask content').replace(/\s+/g, ''), 'base64'),
  };
}

function isStableAuthorityWorkflowPath(value: string): boolean {
  const workflowPath = value.split('@')[0] ?? '';
  return workflowPath === stableAuthorityWorkflowPath;
}

export function parseActiveReleaseRunLookups(
  lookups: Array<{ status: ActiveReleaseStatus; payload: unknown }>,
  excludedRunId: string,
): ActiveReleaseRun[] {
  const observedStatuses = lookups.map((lookup) => lookup.status);
  if (
    lookups.length !== activeReleaseStatuses.length
    || !activeReleaseStatuses.every(
      (status) => observedStatuses.filter((candidate) => candidate === status).length === 1,
    )
  ) {
    throw new Error('Stable admission must query every active GitHub Actions status exactly once.');
  }
  const runs = new Map<number, ActiveReleaseRun>();
  for (const lookup of lookups) {
    const page = object(lookup.payload, `GitHub ${lookup.status} runs lookup`);
    const totalCount = Number(page.total_count);
    if (!Number.isSafeInteger(totalCount) || totalCount < 0 || !Array.isArray(page.workflow_runs)) {
      throw new Error(`GitHub ${lookup.status} runs lookup did not return total_count and workflow_runs[].`);
    }
    if (totalCount !== page.workflow_runs.length || totalCount > activeRunPageSize) {
      throw new Error(
        `GitHub ${lookup.status} bounded active-run page is incomplete: `
        + `total=${totalCount} page=${page.workflow_runs.length} limit=${activeRunPageSize}.`,
      );
    }
    for (const entry of page.workflow_runs) {
      const candidate = object(entry, `GitHub ${lookup.status} Actions run`);
      const id = Number(candidate.id);
      const runPath = requiredString(candidate.path, 'GitHub Actions run path');
      const status = requiredString(candidate.status, 'GitHub Actions run status');
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error('GitHub Actions run id must be a positive safe integer.');
      }
      if (status !== lookup.status) {
        throw new Error(
          `GitHub ${lookup.status} runs lookup returned mismatched status ${status}.`,
        );
      }
      if (String(id) === excludedRunId || !isStableAuthorityWorkflowPath(runPath)) continue;
      if (classifyStableSourceOperation(typeof candidate.display_title === 'string' ? candidate.display_title : '') === 'studio') continue;
      if (runs.has(id)) throw new Error(`GitHub active release run ${id} appeared in multiple status pages.`);
      runs.set(id, {
        id,
        path: runPath.split('@')[0]!,
        status,
        head_sha: fullSha(candidate.head_sha, 'GitHub Actions run head'),
      });
    }
  }
  return [...runs.values()].sort((left, right) => left.id - right.id);
}

function readOwnerWorkflowRuns(excludedRunId: string): ActiveReleaseRun[] {
  const endpoint = `repos/${appRepository}/actions/runs`;
  return parseActiveReleaseRunLookups(
    activeReleaseStatuses.map((status) => ({
      status,
      payload: ghJson(endpoint, {
        branch: 'main',
        status,
        per_page: String(activeRunPageSize),
        page: '1',
      }, activeRunLookupTimeoutMs),
    })),
    excludedRunId,
  );
}

function activeReleaseRuns(excludedRunId: string): ActiveReleaseRun[] {
  return readOwnerWorkflowRuns(excludedRunId);
}

function shanghaiDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function collectObservation(
  input: StableAdmissionInput,
  sourceGatePath: string,
  credentialReceiptPath: string,
  excludedRunId: string,
  appSourceRoot: string,
  checkedAt = new Date().toISOString(),
): Promise<StableAdmissionObservation> {
  const sourceGateBytes = fs.readFileSync(sourceGatePath);
  const credentialReceiptBytes = fs.readFileSync(credentialReceiptPath);
  const credentialReceipt = object(
    JSON.parse(credentialReceiptBytes.toString('utf8')),
    'Apple credential receipt',
  );
  const credentialExecution = object(
    credentialReceipt.execution,
    'Apple credential receipt execution',
  );
  const executorRef = fullSha(
    credentialExecution.head_sha,
    'Apple credential receipt executor SHA',
  );
  verifyFrozenAppCheckout(appSourceRoot, input.appRef);
  const releaseContractBytes = fs.readFileSync(path.join(appRoot, 'contracts', 'app-release-channel.json'));
  const releaseContract = object(JSON.parse(releaseContractBytes.toString('utf8')), 'App release contract');
  return {
    checkedAt,
    currentDate: shanghaiDate(),
    workflowBlobs: localWorkflowBlobs(executorRef),
    sourceGate: object(
      JSON.parse(sourceGateBytes.toString('utf8')),
      'Frozen source-gate evidence',
    ),
    sourceGateBytes,
    credentialReceipt,
    credentialReceiptBytes,
    publishedReleases: publishedReleases(),
    tagRefs: matchingTagRefs(input.baseVersion),
    webuiTags: await anonymousWebuiTags(),
    homebrewCask: homebrewCaskObservation(),
    homebrewPolicy: releaseContract,
    activeReleaseRuns: activeReleaseRuns(excludedRunId),
  };
}
