#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export type JsonRecord = Record<string, any>;

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const shaPattern = /^[0-9a-f]{40}$/;
const runPattern = /^[1-9][0-9]*$/;
const previewVersionPattern = /^[0-9]{2}\.(?:[1-9]|1[0-2])\.(?:[1-9]|[12][0-9]|3[01])-preview\.r[1-9][0-9]*$/;

const sourceRepos = {
  app: 'gaofeng21cn/one-person-lab-app',
  shell: 'gaofeng21cn/opl-aion-shell',
  framework: 'gaofeng21cn/one-person-lab',
} as const;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !digestPattern.test(value)) {
    throw new Error(`${label} must be an exact sha256 digest.`);
  }
  return value;
}

function sha(value: unknown, label: string): string {
  if (typeof value !== 'string' || !shaPattern.test(value)) {
    throw new Error(`${label} must be a full lowercase Git SHA.`);
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function runId(value: unknown, label: string): string {
  const normalized = text(value, label);
  if (!runPattern.test(normalized)) throw new Error(`${label} must be a positive Actions run id.`);
  return normalized;
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as JsonRecord;
}

function authorityCore(input: {
  version: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  runId: string;
  executorSha: string;
}): JsonRecord {
  if (!previewVersionPattern.test(input.version)) {
    throw new Error('Independent WebUI preview version must use YY.M.D-preview.rN.');
  }
  const appSha = sha(input.appSha, 'App source SHA');
  const shellSha = sha(input.shellSha, 'Shell source SHA');
  const frameworkSha = sha(input.frameworkSha, 'Framework source SHA');
  const executorSha = sha(input.executorSha, 'Workflow executor SHA');
  const run = runId(input.runId, 'Workflow run id');
  return {
    schema: 'opl_app_webui_source_authority.v1',
    status: 'admitted',
    carrier: 'container_webui',
    quality_status: 'preview',
    build_trigger: 'manual',
    preview_kind: 'dev',
    release: {
      version: input.version,
      tag: input.version,
    },
    sources: {
      app: { repo: sourceRepos.app, source_commit: appSha },
      shell: { repo: sourceRepos.shell, source_commit: shellSha },
      framework: { repo: sourceRepos.framework, source_commit: frameworkSha },
    },
    authorization: {
      source: 'user_explicit_workflow_dispatch',
      workflow: '.github/workflows/release-webui-development.yml',
      run_id: run,
      run_attempt: 1,
      executor_sha: executorSha,
    },
  };
}

export function createWebuiSourceAuthority(input: {
  version: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  runId: string;
  executorSha: string;
}): JsonRecord {
  const core = authorityCore(input);
  return {
    ...core,
    source_authority_digest: `sha256:${crypto.createHash('sha256').update(canonicalJson(core)).digest('hex')}`,
  };
}

export function validateWebuiSourceAuthority(value: unknown): JsonRecord {
  const authority = record(value, 'WebUI source authority');
  const expected = createWebuiSourceAuthority({
    version: text(record(authority.release, 'release').version, 'release.version'),
    appSha: text(record(record(authority.sources, 'sources').app, 'sources.app').source_commit, 'sources.app.source_commit'),
    shellSha: text(record(record(authority.sources, 'sources').shell, 'sources.shell').source_commit, 'sources.shell.source_commit'),
    frameworkSha: text(record(record(authority.sources, 'sources').framework, 'sources.framework').source_commit, 'sources.framework.source_commit'),
    runId: text(record(authority.authorization, 'authorization').run_id, 'authorization.run_id'),
    executorSha: text(record(authority.authorization, 'authorization').executor_sha, 'authorization.executor_sha'),
  });
  if (canonicalJson(authority) !== canonicalJson(expected)) {
    throw new Error('WebUI source authority does not match its exact canonical digest-bound shape.');
  }
  digest(authority.source_authority_digest, 'source_authority_digest');
  return expected;
}

function required(value: string | undefined, flag: string): string {
  if (!value?.trim()) throw new Error(`Missing --${flag}.`);
  return value.trim();
}

function readJson(filePath: string): unknown {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`Expected one non-empty regular JSON file: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown;
}

function main(argv: string[]): void {
  const command = argv[0];
  const { values } = parseArgs({
    args: argv.slice(1),
    strict: true,
    options: {
      version: { type: 'string' },
      'app-sha': { type: 'string' },
      'shell-sha': { type: 'string' },
      'framework-sha': { type: 'string' },
      'run-id': { type: 'string' },
      'executor-sha': { type: 'string' },
      input: { type: 'string' },
      output: { type: 'string' },
    },
  });
  if (command === 'create') {
    const authority = createWebuiSourceAuthority({
      version: required(values.version, 'version'),
      appSha: required(values['app-sha'], 'app-sha'),
      shellSha: required(values['shell-sha'], 'shell-sha'),
      frameworkSha: required(values['framework-sha'], 'framework-sha'),
      runId: required(values['run-id'], 'run-id'),
      executorSha: required(values['executor-sha'], 'executor-sha'),
    });
    const output = path.resolve(required(values.output, 'output'));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(authority, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(authority)}\n`);
    return;
  }
  if (command === 'validate') {
    const authority = validateWebuiSourceAuthority(readJson(required(values.input, 'input')));
    process.stdout.write(`${JSON.stringify({
      status: 'verified',
      source_authority_digest: authority.source_authority_digest,
      version: authority.release.version,
    })}\n`);
    return;
  }
  throw new Error('Usage: webui-source-authority.ts <create|validate> ...');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
