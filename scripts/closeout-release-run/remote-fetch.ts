import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { findFileByName, runGitHubCli as runGh } from '../release-file-helpers.ts';
import {
  arrayOrEmpty as asArray,
  readJsonFile as readJson,
  recordOrNull as asRecord,
  stringField,
} from '../release-json-helpers.ts';
import type { ArtifactDownloadResult, ArtifactJson, JsonRecord, Options } from './types.ts';

export const commandMaxBuffer = 16 * 1024 * 1024;
export const forbiddenLargeArtifactPatterns = [
  /^macos-build-/,
  /^opl-full-first-install-\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?-mac-arm64$/,
];

function normalizeRunPayload(payload: unknown): JsonRecord {
  const record = asRecord(payload);
  if (!record) throw new Error('Run JSON must be an object.');
  return record;
}

function normalizeJobsPayload(payload: unknown): JsonRecord[] {
  const record = asRecord(payload);
  const source = Array.isArray(payload)
    ? payload
    : asArray(record?.jobs ?? record?.workflow_jobs);
  return source
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => entry !== null);
}

function normalizeArtifactsPayload(payload: unknown): JsonRecord[] {
  const record = asRecord(payload);
  const source = Array.isArray(payload) ? payload : asArray(record?.artifacts);
  return source
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => entry !== null);
}

export function fetchRun(options: Options, appRoot: string): JsonRecord {
  if (options.runJsonPath) return normalizeRunPayload(readJson(options.runJsonPath));
  const stdout = runGh([
    'run',
    'view',
    options.runId,
    '--repo',
    options.repo,
    '--json',
    [
      'databaseId',
      'status',
      'conclusion',
      'createdAt',
      'updatedAt',
      'startedAt',
      'headSha',
      'headBranch',
      'workflowName',
      'displayTitle',
      'event',
      'url',
      'jobs',
    ].join(','),
  ], 'Fetch release run', { cwd: appRoot, maxBuffer: commandMaxBuffer });
  return normalizeRunPayload(JSON.parse(stdout));
}

export function fetchJobs(options: Options, run: JsonRecord, appRoot: string): JsonRecord[] {
  if (options.jobsJsonPath) return normalizeJobsPayload(readJson(options.jobsJsonPath));
  const embedded = normalizeJobsPayload(run.jobs ? { jobs: run.jobs } : []);
  if (embedded.length > 0) return embedded;
  if (!options.runId) return [];
  const stdout = runGh([
    'run',
    'view',
    options.runId,
    '--repo',
    options.repo,
    '--json',
    'jobs',
  ], 'Fetch release run jobs', { cwd: appRoot, maxBuffer: commandMaxBuffer });
  return normalizeJobsPayload(JSON.parse(stdout));
}

export function fetchArtifacts(options: Options, appRoot: string): JsonRecord[] {
  if (options.artifactsJsonPath) return normalizeArtifactsPayload(readJson(options.artifactsJsonPath));
  if (!options.runId || options.noDownload) return [];
  const [owner, repoName] = options.repo.split('/');
  if (!owner || !repoName) throw new Error(`Repository must use owner/name form: ${options.repo}`);
  const stdout = runGh([
    'api',
    `/repos/${owner}/${repoName}/actions/runs/${options.runId}/artifacts`,
    '-H',
    'Accept: application/vnd.github+json',
  ], 'Fetch release run artifacts', { cwd: appRoot, maxBuffer: commandMaxBuffer });
  return normalizeArtifactsPayload(JSON.parse(stdout));
}

function artifactNames(options: Options): string[] {
  const base = [
    `release-candidate-record-${options.version}`,
    `release-readiness-summary-${options.version}`,
    `release-addon-readiness-summary-${options.version}`,
    `release-preflight-summary-${options.version}`,
    `remote-release-verification-${options.version}`,
  ];
  const diagnostics = [
    `opl-full-workflow-telemetry-${options.version}`,
    `opl-full-diagnostics-${options.version}`,
  ];
  const readinessInputs = [
    `opl-first-run-vm-standard-${options.runId}`,
    `opl-first-run-vm-homebrew-standard-${options.runId}`,
    `homebrew-tap-plan-stable-app_standard-${options.version}`,
    `homebrew-tap-plan-stable-app_full_first_install-${options.version}`,
    `opl-first-run-vm-full-${options.runId}`,
    `one-shot-app-installer-smoke-${options.version}`,
    `docker-webui-smoke-${options.version}`,
    `webui-ghcr-publish-${options.version}`,
    `release-evidence-bundle-${options.version}`,
  ].filter((name) => !name.endsWith('-'));
  if (options.artifactProfile === 'primary') return base;
  if (options.artifactProfile === 'diagnostics') return [...base, ...diagnostics];
  return [...base, ...diagnostics, ...readinessInputs];
}

function isForbiddenLargeArtifact(name: string): boolean {
  return forbiddenLargeArtifactPatterns.some((pattern) => pattern.test(name));
}

function fsyncDirectory(directoryPath: string): void {
  const descriptor = fs.openSync(directoryPath, 'r');
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function validateDownloadedArtifactDirectory(artifactName: string, artifactDirectory: string): void {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      const relative = path.relative(artifactDirectory, entryPath);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Downloaded artifact ${artifactName} escaped its staging directory.`);
      }
      if (entry.isSymbolicLink()) {
        throw new Error(`Downloaded artifact ${artifactName} contains a symbolic link: ${relative}`);
      }
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`Downloaded artifact ${artifactName} contains a non-file entry: ${relative}`);
      }
      files.push(entryPath);
      if (entry.name.endsWith('.json')) {
        JSON.parse(fs.readFileSync(entryPath, 'utf8'));
      }
    }
  };
  if (!fs.statSync(artifactDirectory).isDirectory()) {
    throw new Error(`Downloaded artifact ${artifactName} is not a directory.`);
  }
  visit(artifactDirectory);
  if (files.length === 0) throw new Error(`Downloaded artifact ${artifactName} is empty.`);
}

export function downloadArtifacts(options: Options, artifacts: JsonRecord[], appRoot: string): ArtifactDownloadResult {
  if (options.noDownload || !options.runId) {
    return {
      mode: 'read_existing',
      generation_id: null,
      committed_path: options.artifactsDir,
      previous_generation_path: null,
      downloaded: [],
    };
  }
  fs.mkdirSync(path.dirname(options.artifactsDir), { recursive: true });
  const available = new Set(artifacts.map((artifact) => stringField(artifact, 'name')).filter(Boolean) as string[]);
  const downloaded: Array<{ name: string; path: string }> = [];
  const generationToken = `${Date.now()}-${process.pid}-${crypto.randomUUID()}`;
  const stagingRoot = `${options.artifactsDir}.staging-${generationToken}`;
  const previousRoot = `${options.artifactsDir}.previous-${generationToken}`;
  let previousMoved = false;
  let generationCommitted = false;
  fs.mkdirSync(stagingRoot, { recursive: false });
  try {
    for (const name of artifactNames(options)) {
      if (isForbiddenLargeArtifact(name)) {
        throw new Error(`Refusing to download large release artifact: ${name}`);
      }
      if (available.size > 0 && !available.has(name)) continue;
      const stagedArtifactDir = path.join(stagingRoot, name);
      fs.mkdirSync(stagedArtifactDir, { recursive: true });
      runGh([
        'run',
        'download',
        options.runId,
        '--repo',
        options.repo,
        '--name',
        name,
        '--dir',
        stagedArtifactDir,
      ], `Download artifact ${name}`, { cwd: appRoot, maxBuffer: commandMaxBuffer });
      validateDownloadedArtifactDirectory(name, stagedArtifactDir);
      downloaded.push({ name, path: path.join(options.artifactsDir, name) });
    }
    if (downloaded.length === 0) {
      return {
        mode: 'no_matching_artifacts',
        generation_id: generationToken,
        committed_path: options.artifactsDir,
        previous_generation_path: null,
        downloaded,
      };
    }
    if (fs.existsSync(options.artifactsDir)) {
      fs.renameSync(options.artifactsDir, previousRoot);
      previousMoved = true;
    }
    try {
      fs.renameSync(stagingRoot, options.artifactsDir);
      fsyncDirectory(path.dirname(options.artifactsDir));
      generationCommitted = true;
    } catch (error) {
      if (previousMoved && !fs.existsSync(options.artifactsDir)) {
        fs.renameSync(previousRoot, options.artifactsDir);
        fsyncDirectory(path.dirname(options.artifactsDir));
      }
      throw error;
    }
    return {
      mode: 'downloaded_generation',
      generation_id: generationToken,
      committed_path: options.artifactsDir,
      previous_generation_path: previousMoved ? previousRoot : null,
      downloaded,
    };
  } finally {
    if (!generationCommitted) fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}

export function readArtifactJson(options: Options, artifactName: string, fileName: string): ArtifactJson {
  const root = path.join(options.artifactsDir, artifactName);
  const filePath = findFileByName(root, fileName);
  if (!filePath) return { path: null, absolutePath: null, payload: null };
  return {
    path: path.relative(options.outDir, filePath),
    absolutePath: filePath,
    payload: asRecord(readJson(filePath)),
  };
}

export function readJsonByName(options: Options, fileName: string): ArtifactJson {
  const filePath = findFileByName(options.artifactsDir, fileName);
  if (!filePath) return { path: null, absolutePath: null, payload: null };
  return {
    path: path.relative(options.outDir, filePath),
    absolutePath: filePath,
    payload: asRecord(readJson(filePath)),
  };
}
