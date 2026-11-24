import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  assertPreviewTag,
  assertRegularFile,
  exactGitSha,
  exactInteger,
  githubCommandMaxBufferBytes,
  largeAssetUploadTimeoutMs,
  record,
  releaseRepo,
  text,
  type JsonRecord,
  type PreviewRelease,
  type PreviewRemote,
} from './contract.ts';


type CommandResult = { status: number | null; stdout: string; stderr: string; error?: Error };

function runGh(args: string[], allowFailure = false, timeoutMs = 30_000): CommandResult {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: githubCommandMaxBufferBytes,
    env: process.env,
  });
  const output = {
    status: result.status,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
    error: result.error,
  };
  if (!allowFailure && (result.error || result.status !== 0)) {
    throw new Error(`gh ${args.join(' ')} failed: ${result.error?.message ?? output.stderr.trim() ?? 'unknown error'}`);
  }
  return output;
}

export function ghJson(
  args: string[],
  allowNotFound = false,
  executeGh: typeof runGh = runGh,
): JsonRecord | null {
  const result = executeGh(args, allowNotFound);
  if (result.status !== 0) {
    if (allowNotFound && /(?:HTTP\s+404|Not Found|status code 404)/i.test(result.stderr)) return null;
    throw new Error(`GitHub read failed: gh ${args.join(' ')}: ${result.stderr.trim()}`);
  }
  return record(JSON.parse(result.stdout) as unknown, 'GitHub response');
}

function ghPaginatedRecords(args: string[], executeGh: typeof runGh = runGh): JsonRecord[] {
  const result = executeGh(args);
  if (result.error || result.status !== 0) {
    throw new Error(`GitHub read failed: gh ${args.join(' ')}: ${result.error?.message ?? result.stderr.trim()}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(result.stdout) as unknown;
  } catch (error) {
    throw new Error(`GitHub paginated response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(value)) throw new Error('GitHub paginated response must be an array of pages.');
  const entries: JsonRecord[] = [];
  for (const page of value) {
    if (!Array.isArray(page)) throw new Error('GitHub paginated response page must be an array.');
    for (const entry of page) entries.push(record(entry, 'GitHub paginated release'));
  }
  return entries;
}

function normalizeRelease(value: JsonRecord): PreviewRelease {
  return {
    id: exactInteger(value.id, 'release.id'),
    tag_name: text(value.tag_name, 'release.tag_name'),
    target_commitish: typeof value.target_commitish === 'string' ? value.target_commitish : undefined,
    name: typeof value.name === 'string' ? value.name : '',
    body: typeof value.body === 'string' ? value.body : '',
    draft: value.draft === true,
    prerelease: value.prerelease === true,
    published_at: typeof value.published_at === 'string' ? value.published_at : null,
    assets: Array.isArray(value.assets)
      ? value.assets.map((entry: unknown) => {
          const asset = record(entry, 'release asset');
          return {
            id: exactInteger(asset.id, 'release asset id'),
            name: text(asset.name, 'release asset name'),
            size: exactInteger(asset.size, 'release asset size'),
            digest: typeof asset.digest === 'string' ? asset.digest : null,
          };
        })
      : [],
  };
}

function ghInput(payload: unknown): string {
  const tempRoot = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || process.cwd(), '.manual-preview-gh-'));
  const inputPath = path.join(tempRoot, 'input.json');
  fs.writeFileSync(inputPath, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
  return inputPath;
}

function withGhInput(payload: unknown, run: (inputPath: string) => void): void {
  const inputPath = ghInput(payload);
  try {
    run(inputPath);
  } finally {
    fs.rmSync(path.dirname(inputPath), { recursive: true, force: true });
  }
}

export class GhPreviewRemote implements PreviewRemote {
  readonly repo: string;
  private readonly executeGh: typeof runGh;

  constructor(repo: string, executeGh: typeof runGh = runGh) {
    if (repo !== releaseRepo) throw new Error(`Manual preview publisher is fixed to ${releaseRepo}.`);
    this.repo = repo;
    this.executeGh = executeGh;
  }

  inspectRelease(tag: string): PreviewRelease | null {
    assertPreviewTag(tag);
    const value = ghJson(['api', `repos/${this.repo}/releases/tags/${tag}`], true, this.executeGh);
    if (value) {
      const release = normalizeRelease(value);
      if (release.tag_name !== tag) throw new Error(`GitHub Release tag metadata conflicts with ${tag}.`);
      return release;
    }
    const matches = ghPaginatedRecords([
      'api',
      '--paginate',
      '--slurp',
      `repos/${this.repo}/releases?per_page=100`,
    ], this.executeGh).filter((entry) => text(entry.tag_name, 'release.tag_name') === tag);
    if (matches.length > 1) throw new Error(`GitHub release list contains multiple Releases for ${tag}.`);
    return matches.length === 1 ? normalizeRelease(matches[0]) : null;
  }

  inspectTag(tag: string): string | null {
    assertPreviewTag(tag);
    const value = ghJson(['api', `repos/${this.repo}/git/ref/tags/${tag}`], true, this.executeGh);
    if (!value) return null;
    return exactGitSha(record(value.object, 'tag ref object').sha, 'preview tag commit');
  }

  inspectLatestTag(): string | null {
    const value = ghJson(['api', `repos/${this.repo}/releases/latest`], true, this.executeGh);
    return value ? text(value.tag_name, 'Latest tag') : null;
  }

  createDraft(input: { tag: string; targetCommitish: string; name: string; body: string }): void {
    assertPreviewTag(input.tag);
    exactGitSha(input.targetCommitish, 'preview target commit');
    withGhInput({
      tag_name: input.tag,
      target_commitish: input.targetCommitish,
      name: input.name,
      body: input.body,
      draft: true,
      prerelease: true,
      make_latest: 'false',
    }, (inputPath) => {
      this.executeGh(['api', '--method', 'POST', `repos/${this.repo}/releases`, '--input', inputPath]);
    });
  }

  uploadAsset(releaseId: number, filePath: string, name: string): void {
    assertRegularFile(filePath, `preview asset ${name}`);
    this.executeGh([
      'api',
      '--method', 'POST',
      '-H', 'Content-Type: application/octet-stream',
      releaseAssetUploadUrl(this.repo, releaseId, name),
      '--input', filePath,
    ], false, largeAssetUploadTimeoutMs);
  }

  publishRelease(releaseId: number, name: string, body: string): void {
    exactInteger(releaseId, 'release id');
    withGhInput({ name, body, draft: false, prerelease: true, make_latest: 'false' }, (inputPath) => {
      this.executeGh(['api', '--method', 'PATCH', `repos/${this.repo}/releases/${releaseId}`, '--input', inputPath]);
    });
  }

  deleteRelease(releaseId: number): void {
    exactInteger(releaseId, 'release id');
    this.executeGh(['api', '--method', 'DELETE', `repos/${this.repo}/releases/${releaseId}`]);
  }

  deleteTag(tag: string): void {
    assertPreviewTag(tag);
    this.executeGh(['api', '--method', 'DELETE', `repos/${this.repo}/git/refs/tags/${tag}`]);
  }
}

export function releaseAssetUploadUrl(repo: string, releaseId: number, name: string): string {
  if (repo !== releaseRepo) throw new Error(`Manual preview publisher is fixed to ${releaseRepo}.`);
  exactInteger(releaseId, 'release id');
  if (!name || path.basename(name) !== name || name === '.' || name === '..') {
    throw new Error('Preview asset name is invalid.');
  }
  return `https://uploads.github.com/repos/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`;
}
