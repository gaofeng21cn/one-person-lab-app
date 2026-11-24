import { classifyStableSourceOperation } from '../stable-followup-router.ts';
import {
  normalizeStableFailureFingerprint,
  stableFailureFingerprintsEqual,
  type StableFailureFingerprint,
} from '../stable-stage-result.ts';
import {
  boundedAttempts,
  readOwnerWorkflowRuns,
} from './owner-reads.ts';
import {
  extractUniqueOwnerWorkflowRun,
  normalizeOwnerRun,
  validateSourceGateReport,
} from './wire-refs.ts';
import {
  type CommandRunner,
  type OwnerWorkflowRun,
  type PostDispatchReconcileInput,
  type PreNonceGuardInput,
  type WireRefResult,
} from './types.ts';

const fullShaPattern = /^[0-9a-f]{40}$/i;
const activeRunStatuses = new Set(['queued', 'in_progress', 'waiting', 'pending']);

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
  const identities = {
    prior,
    current,
    dispatch_count: 0 as const,
  };
  return unchanged
    ? { ...identities, status: 'blocked_unchanged', unchanged: true }
    : { ...identities, status: 'changed', unchanged: false };
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
      && classifyStableSourceOperation(run.display_title) !== 'studio'
      && run.event === 'workflow_dispatch'
      && run.head_branch === 'main'
      && run.run_attempt === 1
    ));
  const operationMatches = operationId === null
    ? ownerWorkflowMatches
    : ownerWorkflowMatches.filter((run) => run.display_title.includes(operationId));
  const authorityMatches = authorityId === null
    ? operationMatches
    : operationMatches.filter((run) => run.display_title.includes(authorityId));
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
