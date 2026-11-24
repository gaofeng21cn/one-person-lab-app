import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  ownerRunParser,
  type BoundedReadResult,
  type CommandResult,
  type CommandRunner,
  type OwnerRunsResult,
  type ReadFailureCode,
  type ReadFailureKind,
} from './types.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appRepository = 'gaofeng21cn/one-person-lab-app';
const defaultMaxReadAttempts = 3;
const defaultReadTimeoutMs = 30_000;
const ownerRunPageSize = 100;
const ownerRunMaxPages = 10;

function defaultRunner(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number },
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: process.env,
    timeout: options.timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  };
}

export function boundedAttempts(value = defaultMaxReadAttempts): number {
  if (!Number.isInteger(value) || value < 1 || value > defaultMaxReadAttempts) {
    throw new Error(`Read-only transport attempts must be between 1 and ${defaultMaxReadAttempts}.`);
  }
  return value;
}

function commandDetail(result: CommandResult): string {
  return [result.stderr, result.stdout, result.error?.message]
    .filter(Boolean)
    .join('\n')
    .trim()
    .replace(/\s+/g, ' ');
}

export function classifyReadFailure(result: CommandResult): {
  failure_kind: ReadFailureKind;
  failure_code: ReadFailureCode;
  detail: string;
} {
  const detail = commandDetail(result) || `read command exited ${String(result.status)}`;
  if (/TLS handshake timeout|TLS connect error|SSL connection timeout/i.test(detail)) {
    return { failure_kind: 'transport', failure_code: 'tls_handshake_timeout', detail };
  }
  if (/unexpected EOF|early EOF|curl:\s*\(18\)|curl:\s*\(56\)|connection reset by peer/i.test(detail)) {
    return { failure_kind: 'transport', failure_code: 'unexpected_eof', detail };
  }
  if (/ETIMEDOUT|timed out|timeout|signal: killed/i.test(detail)) {
    return { failure_kind: 'transport', failure_code: 'transport_timeout', detail };
  }
  if (/HTTP 401|HTTP 403|bad credentials|authentication failed|requires authentication|permission denied/i.test(detail)) {
    return { failure_kind: 'credential', failure_code: 'credential_failure', detail };
  }
  if (result.status === 2 || /HTTP 404|not found|no matching refs?/i.test(detail)) {
    return { failure_kind: 'not_found', failure_code: 'not_found', detail };
  }
  if (
    result.status === null
    || /network|could not resolve host|failed to connect|connection refused|remote end hung up/i.test(detail)
  ) {
    return { failure_kind: 'transport', failure_code: 'transport_error', detail };
  }
  return { failure_kind: 'protocol', failure_code: 'invalid_response', detail };
}

export function runBoundedReadOnly(
  command: string,
  args: string[],
  options: {
    runner?: CommandRunner;
    cwd?: string;
    maxAttempts?: number;
    timeoutMs?: number;
  } = {},
): BoundedReadResult {
  const runner = options.runner ?? defaultRunner;
  const maxAttempts = boundedAttempts(options.maxAttempts);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runner(command, args, {
      cwd: options.cwd ?? appRoot,
      timeoutMs: options.timeoutMs ?? defaultReadTimeoutMs,
    });
    if (result.status === 0) {
      return { status: 'ok', stdout: result.stdout, attempts: attempt };
    }
    const failure = classifyReadFailure(result);
    if (failure.failure_kind !== 'transport' || attempt === maxAttempts) {
      return { status: 'failed', attempts: attempt, ...failure };
    }
  }
  throw new Error('Unreachable bounded read-only transport state.');
}

function workflowEndpoint(workflow?: string): string {
  if (!workflow) return `repos/${appRepository}/actions/runs`;
  const workflowName = path.posix.basename(workflow.trim());
  if (!/^[-A-Za-z0-9_.]+\.ya?ml$/.test(workflowName)) {
    throw new Error(`Invalid owner workflow path: ${workflow}.`);
  }
  return `repos/${appRepository}/actions/workflows/${workflowName}/runs`;
}

function ownerRunsProtocolFailure(options: {
  endpoint: string;
  attempts: number;
  failureCode: 'invalid_response' | 'truncated_response';
  detail: string;
}): Extract<OwnerRunsResult, { status: 'failed' }> {
  return {
    status: 'failed',
    endpoint: options.endpoint,
    attempts: options.attempts,
    logical_query_count: 1,
    parser: ownerRunParser,
    failure_kind: 'protocol',
    failure_code: options.failureCode,
    detail: options.detail,
  };
}

export function readOwnerWorkflowRuns(options: {
  workflow?: string;
  maxAttempts?: number;
  runner?: CommandRunner;
  cwd?: string;
} = {}): OwnerRunsResult {
  const maxAttempts = boundedAttempts(options.maxAttempts);
  const endpoint = workflowEndpoint(options.workflow);
  const args = [
    'api',
    '-H',
    'Cache-Control: no-cache',
    '-X',
    'GET',
    endpoint,
    '-f',
    'branch=main',
    '-f',
    `per_page=${ownerRunPageSize}`,
    '--paginate',
    '--slurp',
  ];
  if (options.workflow) args.push('-f', 'event=workflow_dispatch');
  const read = runBoundedReadOnly(
    'gh',
    args,
    {
      runner: options.runner,
      cwd: options.cwd,
      maxAttempts,
    },
  );
  if (read.status === 'failed') {
    return {
      status: 'failed',
      endpoint,
      attempts: read.attempts,
      logical_query_count: 1,
      parser: ownerRunParser,
      failure_kind: read.failure_kind,
      failure_code: read.failure_code,
      detail: read.detail,
    };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(read.stdout);
  } catch {
    return {
      status: 'failed',
      endpoint,
      attempts: read.attempts,
      logical_query_count: 1,
      parser: ownerRunParser,
      failure_kind: 'protocol',
      failure_code: 'invalid_response',
      detail: 'Owner workflow-runs API did not return JSON.',
    };
  }
  if (!Array.isArray(payload) || payload.length === 0) {
    return ownerRunsProtocolFailure({
      endpoint,
      attempts: read.attempts,
      failureCode: 'invalid_response',
      detail: 'Owner workflow-runs API did not return a nonempty paginated page array.',
    });
  }
  if (payload.length > ownerRunMaxPages) {
    return ownerRunsProtocolFailure({
      endpoint,
      attempts: read.attempts,
      failureCode: 'truncated_response',
      detail: `Owner workflow-runs API returned ${payload.length} pages, exceeding the bounded ${ownerRunMaxPages}-page query limit.`,
    });
  }

  let totalCount = -1;
  const pages: unknown[][] = [];
  for (const [index, page] of payload.entries()) {
    const response = page && typeof page === 'object' && !Array.isArray(page)
      ? page as Record<string, unknown>
      : null;
    if (!response || !Array.isArray(response.workflow_runs)) {
      return ownerRunsProtocolFailure({
        endpoint,
        attempts: read.attempts,
        failureCode: 'invalid_response',
        detail: `Owner workflow-runs API page ${index + 1} did not return workflow_runs[].`,
      });
    }
    const pageTotalCount = response.total_count;
    if (
      typeof pageTotalCount !== 'number'
      || !Number.isSafeInteger(pageTotalCount)
      || pageTotalCount < 0
    ) {
      return ownerRunsProtocolFailure({
        endpoint,
        attempts: read.attempts,
        failureCode: 'invalid_response',
        detail: `Owner workflow-runs API page ${index + 1} did not return a nonnegative safe integer total_count.`,
      });
    }
    if (index > 0 && pageTotalCount !== totalCount) {
      // GitHub pagination is not a snapshot. Discard the entire inconsistent
      // read and retry within the same bounded read budget, never combine pages.
      if (read.attempts < maxAttempts) {
        const fresh = readOwnerWorkflowRuns({ ...options, maxAttempts: maxAttempts - read.attempts });
        return { ...fresh, attempts: read.attempts + fresh.attempts };
      }
      return ownerRunsProtocolFailure({
        endpoint,
        attempts: read.attempts,
        failureCode: 'invalid_response',
        detail: `Owner workflow-runs API total_count drifted from ${totalCount} to ${pageTotalCount} on page ${index + 1}.`,
      });
    }
    totalCount = pageTotalCount;
    pages.push(response.workflow_runs);
  }

  const expectedPageCount = totalCount === 0 ? 1 : Math.ceil(totalCount / ownerRunPageSize);
  if (expectedPageCount > ownerRunMaxPages) {
    return ownerRunsProtocolFailure({
      endpoint,
      attempts: read.attempts,
      failureCode: 'truncated_response',
      detail: `Owner workflow-runs API declared ${totalCount} runs, exceeding the bounded ${ownerRunMaxPages}-page query limit.`,
    });
  }
  if (pages.length !== expectedPageCount) {
    return ownerRunsProtocolFailure({
      endpoint,
      attempts: read.attempts,
      failureCode: pages.length < expectedPageCount ? 'truncated_response' : 'invalid_response',
      detail: `Owner workflow-runs API returned ${pages.length} of ${expectedPageCount} expected pages for ${totalCount} runs.`,
    });
  }

  const workflowRuns: unknown[] = [];
  const runIds = new Set<number>();
  for (const [index, page] of pages.entries()) {
    const expectedPageLength = index < expectedPageCount - 1
      ? ownerRunPageSize
      : totalCount - ownerRunPageSize * (expectedPageCount - 1);
    if (page.length !== expectedPageLength) {
      return ownerRunsProtocolFailure({
        endpoint,
        attempts: read.attempts,
        failureCode: page.length < expectedPageLength ? 'truncated_response' : 'invalid_response',
        detail: `Owner workflow-runs API page ${index + 1} returned ${page.length} of ${expectedPageLength} expected runs.`,
      });
    }
    for (const run of page) {
      if (run && typeof run === 'object' && !Array.isArray(run)) {
        const runId = Number((run as Record<string, unknown>).id);
        if (Number.isSafeInteger(runId) && runId > 0) {
          if (runIds.has(runId)) {
            return ownerRunsProtocolFailure({
              endpoint,
              attempts: read.attempts,
              failureCode: 'invalid_response',
              detail: `Owner workflow-runs API returned duplicate run id ${runId} across paginated pages.`,
            });
          }
          runIds.add(runId);
        }
      }
      workflowRuns.push(run);
    }
  }
  return {
    status: 'ok',
    endpoint,
    attempts: read.attempts,
    logical_query_count: 1,
    parser: ownerRunParser,
    runs: workflowRuns,
  };
}
