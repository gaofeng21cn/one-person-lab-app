#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  normalizeStableFailureFingerprint,
  stableFailureFingerprintsEqual,
  type StableFailureFingerprint,
} from './stable-stage-result.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRepository = 'gaofeng21cn/one-person-lab-app';
const repositoryRemotes = {
  app: 'origin',
  shell: 'https://github.com/gaofeng21cn/opl-aion-shell.git',
  framework: 'https://github.com/gaofeng21cn/one-person-lab.git',
} as const;
const fullShaPattern = /^[0-9a-f]{40}$/i;
const activeRunStatuses = new Set(['queued', 'in_progress', 'waiting', 'pending']);
const defaultMaxReadAttempts = 3;
const defaultReadTimeoutMs = 30_000;
export const defaultIdentityWindowMs = 5 * 60_000;
export const createdAtClockSkewMs = 30_000;
const ownerRunPageSize = 100;
const ownerRunMaxPages = 10;
export const ownerRunParser = 'node_structured_json_without_jq' as const;

export type ReadFailureKind = 'transport' | 'credential' | 'not_found' | 'protocol' | 'deterministic';
export type ReadFailureCode =
  | 'tls_handshake_timeout'
  | 'unexpected_eof'
  | 'transport_timeout'
  | 'transport_error'
  | 'credential_failure'
  | 'not_found'
  | 'invalid_response'
  | 'truncated_response'
  | 'unchanged_failure_fingerprint';

export type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

export type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number },
) => CommandResult;

export type BoundedReadResult =
  | {
      status: 'ok';
      stdout: string;
      attempts: number;
    }
  | {
      status: 'failed';
      failure_kind: ReadFailureKind;
      failure_code: ReadFailureCode;
      detail: string;
      attempts: number;
    };

export type WireRefResult =
  | {
      status: 'ok';
      repository: string;
      ref: string;
      sha: string;
      attempts: number;
      transport: 'git_wire';
    }
  | {
      status: 'failed';
      repository: string;
      ref: string;
      sha: null;
      attempts: number;
      transport: 'git_wire';
      failure_kind: ReadFailureKind;
      failure_code: ReadFailureCode;
      detail: string;
    };

export type OwnerWorkflowRun = {
  id: number;
  path: string;
  status: string;
  conclusion: string | null;
  event: string;
  head_branch: string;
  head_sha: string;
  run_attempt: number;
  created_at: string;
  display_title: string;
};

export type OwnerRunsResult =
  | {
      status: 'ok';
      endpoint: string;
      attempts: number;
      logical_query_count: 1;
      parser: typeof ownerRunParser;
      runs: unknown[];
    }
  | {
      status: 'failed';
      endpoint: string;
      attempts: number;
      logical_query_count: 1;
      parser: typeof ownerRunParser;
      failure_kind: ReadFailureKind;
      failure_code: ReadFailureCode;
      detail: string;
    };

export type OwnerRunIdentity = {
  workflow: string;
  headSha: string;
  operationStartedAt: string;
  observedAt?: string;
  identityWindowMs?: number;
};

export type UniqueOwnerRunResult =
  | {
      status: 'unique';
      match_count: 1;
      run: OwnerWorkflowRun;
    }
  | {
      status: 'outcome_unknown';
      match_count: number;
      run: null;
      reason: 'zero_matches' | 'ambiguous_matches';
    };

export type PreNonceGuardInput = {
  expectedAppSha: string;
  expectedShellSha: string;
  expectedFrameworkSha: string;
  workflow: string;
  sourceGateReport: unknown;
  currentRunId?: string;
  authorityId?: string;
  operationId?: string;
  priorFailureFingerprint?: unknown;
  currentFailureFingerprint?: unknown;
  maxReadAttempts?: number;
};

export type PostDispatchReconcileInput = OwnerRunIdentity & {
  mutationInvocationCount: 1;
  maxReadAttempts?: number;
};

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

function boundedAttempts(value = defaultMaxReadAttempts): number {
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

function normalizeWireRef(ref: string): string {
  const value = ref.trim();
  if (!value || value === 'main') return 'refs/heads/main';
  if (!value.startsWith('refs/heads/')) {
    throw new Error(`Wire identity requires an exact branch ref, got ${ref}.`);
  }
  return value;
}

export function resolveGitWireRef(options: {
  repository: string;
  remote: string;
  ref?: string;
  maxAttempts?: number;
  runner?: CommandRunner;
  cwd?: string;
}): WireRefResult {
  const ref = normalizeWireRef(options.ref ?? 'refs/heads/main');
  const read = runBoundedReadOnly(
    'git',
    ['ls-remote', '--exit-code', '--heads', options.remote, ref],
    {
      runner: options.runner,
      cwd: options.cwd,
      maxAttempts: options.maxAttempts,
    },
  );
  if (read.status === 'failed') {
    return {
      status: 'failed',
      repository: options.repository,
      ref,
      sha: null,
      attempts: read.attempts,
      transport: 'git_wire',
      failure_kind: read.failure_kind,
      failure_code: read.failure_code,
      detail: read.detail,
    };
  }
  const matches = read.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length === 2 && parts[1] === ref && fullShaPattern.test(parts[0] ?? ''));
  if (matches.length !== 1) {
    return {
      status: 'failed',
      repository: options.repository,
      ref,
      sha: null,
      attempts: read.attempts,
      transport: 'git_wire',
      failure_kind: 'protocol',
      failure_code: 'invalid_response',
      detail: `${options.repository}@${ref} returned ${matches.length} exact wire identities.`,
    };
  }
  return {
    status: 'ok',
    repository: options.repository,
    ref,
    sha: matches[0]![0]!.toLowerCase(),
    attempts: read.attempts,
    transport: 'git_wire',
  };
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
  const endpoint = workflowEndpoint(options.workflow);
  const args = [
    'api',
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
      maxAttempts: options.maxAttempts,
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

function normalizeOwnerRun(value: unknown): OwnerWorkflowRun | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const run = value as Record<string, unknown>;
  const id = Number(run.id);
  const workflowPath = typeof run.path === 'string' ? run.path.split('@')[0] ?? '' : '';
  const conclusion = run.conclusion === null || typeof run.conclusion === 'string'
    ? run.conclusion as string | null
    : null;
  if (
    !Number.isSafeInteger(id)
    || id <= 0
    || !workflowPath
    || typeof run.status !== 'string'
    || typeof run.event !== 'string'
    || typeof run.head_branch !== 'string'
    || typeof run.head_sha !== 'string'
    || !fullShaPattern.test(run.head_sha)
    || !Number.isSafeInteger(Number(run.run_attempt))
    || typeof run.created_at !== 'string'
    || !Number.isFinite(Date.parse(run.created_at))
    || typeof run.display_title !== 'string'
  ) {
    return null;
  }
  return {
    id,
    path: workflowPath,
    status: run.status,
    conclusion,
    event: run.event,
    head_branch: run.head_branch,
    head_sha: run.head_sha.toLowerCase(),
    run_attempt: Number(run.run_attempt),
    created_at: run.created_at,
    display_title: run.display_title,
  };
}

function matchingOwnerRuns(runs: unknown[], identity: OwnerRunIdentity): OwnerWorkflowRun[] {
  if (!fullShaPattern.test(identity.headSha)) throw new Error('Owner-run identity requires a full App SHA.');
  const startedAt = Date.parse(identity.operationStartedAt);
  const observedAt = Date.parse(identity.observedAt ?? new Date().toISOString());
  const identityWindowMs = identity.identityWindowMs ?? defaultIdentityWindowMs;
  if (!Number.isFinite(startedAt) || !Number.isFinite(observedAt)) {
    throw new Error('Owner-run identity requires valid operation and observation timestamps.');
  }
  if (!Number.isInteger(identityWindowMs) || identityWindowMs < 1 || identityWindowMs > defaultIdentityWindowMs) {
    throw new Error(`Owner-run identity window must be between 1 and ${defaultIdentityWindowMs}ms.`);
  }
  const upperBound = Math.min(startedAt + identityWindowMs, observedAt + createdAtClockSkewMs);
  return runs
    .map(normalizeOwnerRun)
    .filter((run): run is OwnerWorkflowRun => run !== null)
    .filter((run) => (
      run.path === identity.workflow
      && run.head_sha === identity.headSha.toLowerCase()
      && run.event === 'workflow_dispatch'
      && run.head_branch === 'main'
      && run.run_attempt === 1
      && Date.parse(run.created_at) >= startedAt - createdAtClockSkewMs
      && Date.parse(run.created_at) <= upperBound
    ))
    .sort((left, right) => left.id - right.id);
}

export function extractUniqueOwnerWorkflowRun(
  runs: unknown[],
  identity: OwnerRunIdentity,
): UniqueOwnerRunResult {
  const matches = matchingOwnerRuns(runs, identity);
  if (matches.length === 1) {
    return { status: 'unique', match_count: 1, run: matches[0]! };
  }
  return {
    status: 'outcome_unknown',
    match_count: matches.length,
    run: null,
    reason: matches.length === 0 ? 'zero_matches' : 'ambiguous_matches',
  };
}

function validateSourceGateReport(input: PreNonceGuardInput): {
  schema: 'opl_app_release_source_gate.v1';
  status: 'passed';
  exact_cohort_bound: true;
} {
  if (!input.sourceGateReport || typeof input.sourceGateReport !== 'object' || Array.isArray(input.sourceGateReport)) {
    throw new Error('Pre-nonce dispatch guard requires a source-gate report.');
  }
  const report = input.sourceGateReport as Record<string, any>;
  const cohort = report.admission?.immutable_cohort;
  if (
    report.schema !== 'opl_app_release_source_gate.v1'
    || report.status !== 'passed'
    || report.admission?.status !== 'passed'
    || report.typed_blocker !== null
    || cohort?.app_sha !== input.expectedAppSha.toLowerCase()
    || cohort?.shell_sha !== input.expectedShellSha.toLowerCase()
    || cohort?.framework_sha !== input.expectedFrameworkSha.toLowerCase()
  ) {
    throw new Error('Source-gate report does not pass and bind the exact pre-nonce cohort.');
  }
  const frozenCohortReachable = Array.isArray(report.checks)
    && report.checks.some(
      (check: unknown) => check !== null
        && typeof check === 'object'
        && !Array.isArray(check)
        && (check as Record<string, unknown>).id === 'app_frozen_commit_reachable'
        && (check as Record<string, unknown>).status === 'passed',
    );
  if (!frozenCohortReachable) {
    throw new Error('Source-gate report does not prove that the frozen App commit remains reachable.');
  }
  return {
    schema: 'opl_app_release_source_gate.v1',
    status: 'passed',
    exact_cohort_bound: true,
  };
}

export type FailureFingerprintGuard =
  | {
      status: 'no_prior_failure';
      prior: null;
      current: null;
      unchanged: false;
      dispatch_count: 0;
    }
  | {
      status: 'changed';
      prior: StableFailureFingerprint;
      current: StableFailureFingerprint;
      unchanged: false;
      dispatch_count: 0;
    }
  | {
      status: 'blocked_unchanged';
      prior: StableFailureFingerprint;
      current: StableFailureFingerprint;
      unchanged: true;
      dispatch_count: 0;
    };

export function evaluateFailureFingerprintGuard(input: {
  priorFailureFingerprint?: unknown;
  currentFailureFingerprint?: unknown;
}): FailureFingerprintGuard {
  if (input.priorFailureFingerprint === undefined && input.currentFailureFingerprint === undefined) {
    return {
      status: 'no_prior_failure',
      prior: null,
      current: null,
      unchanged: false,
      dispatch_count: 0,
    };
  }
  if (input.priorFailureFingerprint === undefined || input.currentFailureFingerprint === undefined) {
    throw new Error('Stable dispatch requires both prior and current failure fingerprints when either is provided.');
  }
  const prior = normalizeStableFailureFingerprint(input.priorFailureFingerprint);
  const current = normalizeStableFailureFingerprint(input.currentFailureFingerprint);
  const unchanged = stableFailureFingerprintsEqual(prior, current);
  return {
    status: unchanged ? 'blocked_unchanged' : 'changed',
    prior,
    current,
    unchanged,
    dispatch_count: 0,
  };
}

export function buildPreNonceDispatchGuard(
  input: PreNonceGuardInput,
  dependencies: { runner?: CommandRunner; cwd?: string } = {},
) {
  const maxAttempts = boundedAttempts(input.maxReadAttempts);
  for (const [label, value] of Object.entries({
    app: input.expectedAppSha,
    shell: input.expectedShellSha,
    framework: input.expectedFrameworkSha,
  })) {
    if (!fullShaPattern.test(value)) throw new Error(`Expected ${label} identity must be a full SHA.`);
  }
  const sourceGate = validateSourceGateReport(input);
  if (input.currentRunId !== undefined && !/^[1-9][0-9]*$/.test(input.currentRunId)) {
    throw new Error('Current GitHub run id must be a positive integer when provided.');
  }
  if (
    input.authorityId !== undefined
    && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.authorityId)
  ) {
    throw new Error('Stable operation authority_id is not canonical.');
  }
  if (
    input.operationId !== undefined
    && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.operationId)
  ) {
    throw new Error('Stable operation operation_id is not canonical.');
  }
  if ((input.authorityId === undefined) !== (input.operationId === undefined)) {
    throw new Error('Stable authority preflight requires both authority_id and operation_id.');
  }
  if (input.currentRunId !== undefined && input.authorityId === undefined) {
    throw new Error('Run-bound Stable authority reconciliation requires current_run_id, authority_id, and operation_id.');
  }
  const phase = input.currentRunId === undefined ? 'pre_nonce' : 'run_bound';
  const authorityId = input.authorityId ?? null;
  const operationId = input.operationId ?? null;
  const runId = input.currentRunId ?? null;
  const failureFingerprintGuard = evaluateFailureFingerprintGuard(input);
  const identities: Record<'app' | 'shell' | 'framework', WireRefResult | null> = {
    app: null,
    shell: null,
    framework: null,
  };
  if (failureFingerprintGuard.status === 'blocked_unchanged') {
    return {
      schema: 'opl_release_dispatch_guard.v1',
      phase,
      status: 'blocked',
      failure_class: 'deterministic',
      failure_code: 'unchanged_failure_fingerprint',
      credential_failure: false,
      reason: 'The prior Stable failure fingerprint is unchanged; repair source or change the bound environment receipt before dispatch.',
      source_gate: sourceGate,
      failure_fingerprint_guard: failureFingerprintGuard,
      wire_identities: identities,
      owner_run_query: null,
      owner_run_match_count: null,
      authority_id: authorityId,
      operation_id: operationId,
      run_id: runId,
      nonce_consumed: false,
      mutation_invocation_count: 0,
      mutation_retry_count: 0,
      read_only_reconcile_allowed: true,
      guard_replacement_allowed: false,
      dispatch_allowed: false,
      redispatch_allowed: false,
    } as const;
  }
  const ownerRuns = readOwnerWorkflowRuns({
    workflow: input.workflow,
    maxAttempts,
    runner: dependencies.runner,
    cwd: dependencies.cwd,
  });
  if (ownerRuns.status === 'failed') {
    return {
      schema: 'opl_release_dispatch_guard.v1',
      phase,
      status: 'blocked',
      failure_class: ownerRuns.failure_kind,
      failure_code: ownerRuns.failure_code,
      credential_failure: ownerRuns.failure_kind === 'credential',
      reason: ownerRuns.detail,
      source_gate: sourceGate,
      failure_fingerprint_guard: failureFingerprintGuard,
      wire_identities: identities,
      owner_run_query: ownerRuns,
      owner_run_match_count: null,
      authority_id: authorityId,
      operation_id: operationId,
      run_id: runId,
      nonce_consumed: false,
      mutation_invocation_count: 0,
      mutation_retry_count: 0,
      read_only_reconcile_allowed: true,
      guard_replacement_allowed: false,
      dispatch_allowed: false,
      redispatch_allowed: false,
    } as const;
  }
  const normalizedRuns = ownerRuns.runs.map(normalizeOwnerRun);
  if (normalizedRuns.some((run) => run === null)) {
    return {
      schema: 'opl_release_dispatch_guard.v1',
      phase,
      status: 'blocked',
      failure_class: 'protocol',
      failure_code: 'invalid_response',
      credential_failure: false,
      reason: 'Owner workflow-runs API returned a malformed run.',
      source_gate: sourceGate,
      failure_fingerprint_guard: failureFingerprintGuard,
      wire_identities: identities,
      owner_run_query: {
        endpoint: ownerRuns.endpoint,
        attempts: ownerRuns.attempts,
        logical_query_count: ownerRuns.logical_query_count,
        parser: ownerRuns.parser,
      },
      owner_run_match_count: null,
      authority_id: authorityId,
      operation_id: operationId,
      run_id: runId,
      nonce_consumed: false,
      mutation_invocation_count: 0,
      mutation_retry_count: 0,
      read_only_reconcile_allowed: true,
      guard_replacement_allowed: false,
      dispatch_allowed: false,
      redispatch_allowed: false,
    } as const;
  }
  const ownerWorkflowMatches = normalizedRuns
    .filter((run): run is OwnerWorkflowRun => run !== null)
    .filter((run) => (
      run.path === input.workflow
      && run.event === 'workflow_dispatch'
      && run.head_branch === 'main'
      && run.run_attempt === 1
    ));
  const operationMatches = input.operationId === undefined
    ? ownerWorkflowMatches
    : ownerWorkflowMatches.filter((run) => run.display_title.includes(input.operationId));
  const authorityMatches = input.authorityId === undefined
    ? operationMatches
    : operationMatches.filter((run) => run.display_title.includes(input.authorityId));
  const activeStableMatches = ownerWorkflowMatches.filter((run) => activeRunStatuses.has(run.status));
  const ownRunMatches = input.currentRunId === undefined
    ? []
    : authorityMatches.filter((run) => String(run.id) === input.currentRunId);
  const priorOperationMatches = input.currentRunId === undefined
    ? []
    : operationMatches.filter((run) => String(run.id) !== input.currentRunId);
  const otherActiveStableMatches = input.currentRunId === undefined
    ? activeStableMatches
    : activeStableMatches.filter((run) => String(run.id) !== input.currentRunId);
  const uniqueRuns = (runs: OwnerWorkflowRun[]) => [...new Map(runs.map((run) => [run.id, run])).values()];
  const preNonceObservedMatches = input.operationId === undefined
    ? activeStableMatches
    : uniqueRuns([...operationMatches, ...activeStableMatches]);
  const runBoundObservedMatches = uniqueRuns([...operationMatches, ...otherActiveStableMatches]);
  const passed = input.currentRunId === undefined
    ? preNonceObservedMatches.length === 0
    : ownRunMatches.length === 1
      && priorOperationMatches.length === 0
      && otherActiveStableMatches.length === 0;
  return {
    schema: 'opl_release_dispatch_guard.v1',
    phase,
    status: passed ? 'passed' : 'blocked',
    failure_class: passed ? null : 'protocol',
    failure_code: passed ? null : 'invalid_response',
    credential_failure: false,
    reason: passed
      ? input.currentRunId === undefined
        ? input.authorityId === undefined
          ? 'The source gate proves the frozen cohort remains reachable and the single owner workflow-runs query found no active Stable authority run.'
          : 'The source gate proves the frozen cohort remains reachable and the single owner workflow-runs query found no prior matching frozen operation or other active Stable authority run.'
        : 'The source gate proves the frozen cohort remains reachable and exactly one current run owns the pre-issued authority with no prior frozen-operation consumer or other active Stable authority run.'
      : input.currentRunId === undefined
        ? input.authorityId === undefined
          ? `Found ${activeStableMatches.length} active Stable authority run(s); a new dispatch is forbidden.`
          : operationMatches.length > 0
            ? `Found ${operationMatches.length} prior exact frozen-operation run(s); authority replacement is forbidden.`
            : `Found ${otherActiveStableMatches.length} other active Stable authority run(s); a parallel Stable authority is forbidden.`
        : `Authority reconciliation requires exactly the current authority run, no prior frozen-operation consumer, and no other active Stable authority run; observed current=${ownRunMatches.length} prior=${priorOperationMatches.length} other_active=${otherActiveStableMatches.length}.`,
    source_gate: sourceGate,
    failure_fingerprint_guard: failureFingerprintGuard,
    wire_identities: identities,
    owner_run_query: {
      endpoint: ownerRuns.endpoint,
      attempts: ownerRuns.attempts,
      logical_query_count: ownerRuns.logical_query_count,
      parser: ownerRuns.parser,
    },
    owner_run_match_count: input.currentRunId === undefined
      ? preNonceObservedMatches.length
      : runBoundObservedMatches.length,
    authority_id: authorityId,
    operation_id: operationId,
    run_id: runId,
    nonce_consumed: false,
    mutation_invocation_count: 0,
    mutation_retry_count: 0,
    read_only_reconcile_allowed: true,
    guard_replacement_allowed: false,
    dispatch_allowed: passed,
    redispatch_allowed: false,
  } as const;
}

export function verifyPreDispatchAuthorityEvidence(input: {
  expectedAppSha: string;
  expectedShellSha: string;
  expectedFrameworkSha: string;
  expectedObjectiveFingerprint: string;
  expectedOperationId: string;
  sourceGateReport: unknown;
  preNonceGuardReport: unknown;
}) {
  const sourceGate = validateSourceGateReport({
    expectedAppSha: input.expectedAppSha,
    expectedShellSha: input.expectedShellSha,
    expectedFrameworkSha: input.expectedFrameworkSha,
    workflow: '.github/workflows/release-stable.yml',
    sourceGateReport: input.sourceGateReport,
  });
  if (
    !input.sourceGateReport
    || typeof input.sourceGateReport !== 'object'
    || Array.isArray(input.sourceGateReport)
    || (input.sourceGateReport as Record<string, unknown>).operation_fingerprint
      !== input.expectedObjectiveFingerprint
  ) {
    throw new Error('Pre-dispatch source-gate evidence does not match the issued authority objective fingerprint.');
  }
  const guard = input.preNonceGuardReport;
  if (
    !guard
    || typeof guard !== 'object'
    || Array.isArray(guard)
    || (guard as Record<string, unknown>).schema !== 'opl_release_dispatch_guard.v1'
    || (guard as Record<string, unknown>).phase !== 'pre_nonce'
    || (guard as Record<string, unknown>).status !== 'passed'
    || (guard as Record<string, unknown>).dispatch_allowed !== true
    || (guard as Record<string, unknown>).operation_id !== input.expectedOperationId
    || (guard as Record<string, unknown>).owner_run_match_count !== 0
    || (guard as Record<string, unknown>).nonce_consumed !== false
    || (guard as Record<string, unknown>).mutation_invocation_count !== 0
  ) {
    throw new Error('Pre-dispatch guard evidence must prove a passed zero-consumer admission before workflow dispatch.');
  }
  return {
    schema: 'opl_release_dispatch_guard_evidence_verification.v1',
    status: 'passed',
    source_gate: sourceGate,
    pre_nonce_guard: {
      status: 'passed',
      owner_run_match_count: 0,
      dispatch_allowed: true,
    },
  } as const;
}

export function buildPostDispatchReconcile(
  input: PostDispatchReconcileInput,
  dependencies: { runner?: CommandRunner; cwd?: string } = {},
) {
  if (input.mutationInvocationCount !== 1) {
    throw new Error('Post-dispatch reconciliation requires exactly one mutation invocation.');
  }
  const ownerRuns = readOwnerWorkflowRuns({
    workflow: input.workflow,
    maxAttempts: boundedAttempts(input.maxReadAttempts),
    runner: dependencies.runner,
    cwd: dependencies.cwd,
  });
  if (ownerRuns.status === 'failed') {
    return {
      schema: 'opl_release_dispatch_guard.v1',
      phase: 'post_dispatch',
      status: 'outcome_unknown',
      failure_class: ownerRuns.failure_kind,
      failure_code: ownerRuns.failure_code,
      credential_failure: ownerRuns.failure_kind === 'credential',
      owner_run_query: ownerRuns,
      owner_run: null,
      owner_run_match_count: null,
      nonce_consumed: true,
      mutation_invocation_count: 1,
      mutation_retry_count: 0,
      read_only_reconcile_only: true,
      replacement_allowed: false,
      redispatch_allowed: false,
    } as const;
  }
  const extraction = extractUniqueOwnerWorkflowRun(ownerRuns.runs, input);
  return {
    schema: 'opl_release_dispatch_guard.v1',
    phase: 'post_dispatch',
    status: extraction.status === 'unique' ? 'identified' : 'outcome_unknown',
    failure_class: extraction.status === 'unique' ? null : 'protocol',
    failure_code: extraction.status === 'unique' ? null : 'invalid_response',
    credential_failure: false,
    owner_run_query: {
      endpoint: ownerRuns.endpoint,
      attempts: ownerRuns.attempts,
      logical_query_count: ownerRuns.logical_query_count,
      parser: ownerRuns.parser,
    },
    owner_run: extraction.run,
    owner_run_match_count: extraction.match_count,
    nonce_consumed: true,
    mutation_invocation_count: 1,
    mutation_retry_count: 0,
    read_only_reconcile_only: true,
    replacement_allowed: false,
    redispatch_allowed: false,
  } as const;
}

function requiredOption(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing required option --${name}.`);
  return value.trim();
}

function writeResult(output: string | undefined, value: unknown): void {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (output) {
    const outputPath = path.resolve(output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialized, 'utf8');
  }
  process.stdout.write(serialized);
}

function isMainModule(): boolean {
  return import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
}

if (isMainModule()) {
  try {
    const command = process.argv[2];
    const { values } = parseArgs({
      args: process.argv.slice(3),
      options: {
        workflow: { type: 'string' },
        'expected-app-sha': { type: 'string' },
        'expected-shell-sha': { type: 'string' },
        'expected-framework-sha': { type: 'string' },
        'expected-objective-fingerprint': { type: 'string' },
        'expected-operation-id': { type: 'string' },
        'source-gate-report': { type: 'string' },
        'pre-nonce-guard-report': { type: 'string' },
        'current-run-id': { type: 'string' },
        'authority-id': { type: 'string' },
        'operation-id': { type: 'string' },
        'prior-failure-fingerprint': { type: 'string' },
        'current-failure-fingerprint': { type: 'string' },
        'operation-started-at': { type: 'string' },
        'observed-at': { type: 'string' },
        output: { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    });
    let result:
      | ReturnType<typeof buildPreNonceDispatchGuard>
      | ReturnType<typeof verifyPreDispatchAuthorityEvidence>
      | ReturnType<typeof buildPostDispatchReconcile>;
    if (command === 'preflight') {
      result = buildPreNonceDispatchGuard({
        workflow: requiredOption(values.workflow, 'workflow'),
        expectedAppSha: requiredOption(values['expected-app-sha'], 'expected-app-sha'),
        expectedShellSha: requiredOption(values['expected-shell-sha'], 'expected-shell-sha'),
        expectedFrameworkSha: requiredOption(values['expected-framework-sha'], 'expected-framework-sha'),
        sourceGateReport: JSON.parse(fs.readFileSync(
          path.resolve(requiredOption(values['source-gate-report'], 'source-gate-report')),
          'utf8',
        )),
        currentRunId: typeof values['current-run-id'] === 'string'
          ? values['current-run-id']
          : undefined,
        authorityId: typeof values['authority-id'] === 'string'
          ? values['authority-id']
          : undefined,
        operationId: typeof values['operation-id'] === 'string'
          ? values['operation-id']
          : undefined,
        priorFailureFingerprint: typeof values['prior-failure-fingerprint'] === 'string'
          ? JSON.parse(fs.readFileSync(path.resolve(values['prior-failure-fingerprint']), 'utf8'))
          : undefined,
        currentFailureFingerprint: typeof values['current-failure-fingerprint'] === 'string'
          ? JSON.parse(fs.readFileSync(path.resolve(values['current-failure-fingerprint']), 'utf8'))
          : undefined,
      });
    } else if (command === 'verify-evidence') {
      result = verifyPreDispatchAuthorityEvidence({
        expectedAppSha: requiredOption(values['expected-app-sha'], 'expected-app-sha'),
        expectedShellSha: requiredOption(values['expected-shell-sha'], 'expected-shell-sha'),
        expectedFrameworkSha: requiredOption(values['expected-framework-sha'], 'expected-framework-sha'),
        expectedObjectiveFingerprint: requiredOption(
          values['expected-objective-fingerprint'],
          'expected-objective-fingerprint',
        ),
        expectedOperationId: requiredOption(values['expected-operation-id'], 'expected-operation-id'),
        sourceGateReport: JSON.parse(fs.readFileSync(
          path.resolve(requiredOption(values['source-gate-report'], 'source-gate-report')),
          'utf8',
        )),
        preNonceGuardReport: JSON.parse(fs.readFileSync(
          path.resolve(requiredOption(values['pre-nonce-guard-report'], 'pre-nonce-guard-report')),
          'utf8',
        )),
      });
    } else if (command === 'reconcile') {
      result = buildPostDispatchReconcile({
        workflow: requiredOption(values.workflow, 'workflow'),
        headSha: requiredOption(values['expected-app-sha'], 'expected-app-sha'),
        operationStartedAt: requiredOption(values['operation-started-at'], 'operation-started-at'),
        observedAt: typeof values['observed-at'] === 'string' ? values['observed-at'] : undefined,
        mutationInvocationCount: 1,
      });
    } else {
      throw new Error('Usage: release-dispatch-guard.ts <preflight|verify-evidence|reconcile> [options].');
    }
    writeResult(values.output, result);
    if (!['passed', 'identified'].includes(result.status)) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
