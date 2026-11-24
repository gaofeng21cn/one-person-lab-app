import { classifyStableSourceOperation } from '../stable-followup-router.ts';
import {
  createdAtClockSkewMs,
  defaultIdentityWindowMs,
  type CommandRunner,
  type OwnerRunIdentity,
  type OwnerWorkflowRun,
  type PreNonceGuardInput,
  type UniqueOwnerRunResult,
  type WireRefResult,
} from './types.ts';
import { runBoundedReadOnly } from './owner-reads.ts';

const fullShaPattern = /^[0-9a-f]{40}$/i;

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

export function normalizeOwnerRun(value: unknown): OwnerWorkflowRun | null {
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
      && classifyStableSourceOperation(run.display_title) !== 'studio'
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

export function validateSourceGateReport(input: PreNonceGuardInput): {
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
