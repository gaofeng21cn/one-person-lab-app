import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPostDispatchReconcile,
  buildPreNonceDispatchGuard,
  extractUniqueOwnerWorkflowRun,
  type CommandRunner,
} from '../../scripts/release-dispatch-guard.ts';
import { createStableFailureFingerprint } from '../../scripts/stable-stage-result.ts';

const appSha = '1'.repeat(40);
const shellSha = '2'.repeat(40);
const frameworkSha = '3'.repeat(40);
const workflow = '.github/workflows/release-source-qualification.yml';
const operationStartedAt = '2026-07-26T06:00:00.000Z';
const observedAt = '2026-07-26T06:01:00.000Z';

function sourceGateReport() {
  return {
    schema: 'opl_app_release_source_gate.v1',
    status: 'passed',
    typed_blocker: null,
    admission: {
      status: 'passed',
      immutable_cohort: {
        app_sha: appSha,
        shell_sha: shellSha,
        framework_sha: frameworkSha,
      },
    },
    checks: [{ id: 'app_frozen_commit_reachable', status: 'passed' }],
  };
}

function ownerRun(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    path: `${workflow}@refs/heads/main`,
    status: 'queued',
    conclusion: null,
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: appSha,
    run_attempt: 1,
    created_at: '2026-07-26T06:00:10.000Z',
    display_title: 'OPL Stable standard authority-42',
    ...overrides,
  };
}

function successfulRunner(runs: unknown[] = []): CommandRunner {
  return (command, args) => {
    if (command === 'git') {
      const remote = args[3];
      const sha = remote === 'origin'
        ? appSha
        : String(remote).includes('opl-aion-shell')
          ? shellSha
          : frameworkSha;
      return {
        status: 0,
        stdout: `${sha}\trefs/heads/main\n`,
        stderr: '',
      };
    }
    if (command === 'gh') {
      return {
        status: 0,
        stdout: JSON.stringify({ total_count: runs.length, workflow_runs: runs }),
        stderr: '',
      };
    }
    return { status: 1, stdout: '', stderr: `unexpected command ${command} ${args.join(' ')}` };
  };
}

function failureFingerprint(environmentCharacter = '5') {
  return createStableFailureFingerprint({
    cohort: {
      app_sha: appSha,
      shell_sha: shellSha,
      framework_sha: frameworkSha,
    },
    stage_id: 'clean_vm_exact_artifact_qualification',
    reason_code: 'runtime_action_evidence_unavailable',
    artifact_digest_or_input_digest: `sha256:${'4'.repeat(64)}`,
    environment_receipt_digest: `sha256:${environmentCharacter.repeat(64)}`,
  });
}

test('pre-nonce TLS handshake failure is bounded transport failure and consumes no nonce', () => {
  let calls = 0;
  const runner: CommandRunner = () => {
    calls += 1;
    return { status: 1, stdout: '', stderr: 'net/http: TLS handshake timeout' };
  };
  const report = buildPreNonceDispatchGuard({
    workflow,
    expectedAppSha: appSha,
    expectedShellSha: shellSha,
    expectedFrameworkSha: frameworkSha,
    sourceGateReport: sourceGateReport(),
  }, { runner });

  assert.equal(calls, 3);
  assert.equal(report.status, 'blocked');
  assert.equal(report.failure_class, 'transport');
  assert.equal(report.failure_code, 'tls_handshake_timeout');
  assert.equal(report.credential_failure, false);
  assert.equal(report.nonce_consumed, false);
  assert.equal(report.mutation_invocation_count, 0);
  assert.equal(report.mutation_retry_count, 0);
  assert.equal(report.read_only_guard_replacement_allowed, true);
  assert.equal(report.redispatch_allowed, false);
});

test('pre-nonce guard rejects a source-gate report that does not bind the exact cohort', () => {
  const drifted = sourceGateReport();
  drifted.admission.immutable_cohort.shell_sha = 'f'.repeat(40);
  assert.throws(
    () => buildPreNonceDispatchGuard({
      workflow,
      expectedAppSha: appSha,
      expectedShellSha: shellSha,
      expectedFrameworkSha: frameworkSha,
      sourceGateReport: drifted,
    }, { runner: successfulRunner() }),
    /does not pass and bind the exact pre-nonce cohort/,
  );
});

test('post-dispatch unexpected EOF remains outcome_unknown after one logical bounded query', () => {
  let calls = 0;
  const runner: CommandRunner = () => {
    calls += 1;
    return { status: 1, stdout: '', stderr: 'unexpected EOF while reading response body' };
  };
  const report = buildPostDispatchReconcile({
    workflow,
    headSha: appSha,
    operationStartedAt,
    observedAt,
    mutationInvocationCount: 1,
  }, { runner });

  assert.equal(calls, 3);
  assert.equal(report.status, 'outcome_unknown');
  assert.equal(report.failure_class, 'transport');
  assert.equal(report.failure_code, 'unexpected_eof');
  assert.equal(report.credential_failure, false);
  assert.equal(report.owner_run_query.logical_query_count, 1);
  assert.equal(report.nonce_consumed, true);
  assert.equal(report.mutation_invocation_count, 1);
  assert.equal(report.mutation_retry_count, 0);
  assert.equal(report.read_only_reconcile_only, true);
  assert.equal(report.replacement_allowed, false);
  assert.equal(report.redispatch_allowed, false);
});

test('structured extraction returns the unique exact first attempt and ignores unrelated runs', () => {
  const result = extractUniqueOwnerWorkflowRun([
    ownerRun(10, { head_sha: 'f'.repeat(40) }),
    ownerRun(11, { path: '.github/workflows/release-stable.yml@refs/heads/main' }),
    ownerRun(12, { run_attempt: 2 }),
    ownerRun(13),
  ], {
    workflow,
    headSha: appSha,
    operationStartedAt,
    observedAt,
  });

  assert.equal(result.status, 'unique');
  assert.equal(result.match_count, 1);
  assert.equal(result.run?.id, 13);
});

test('zero and ambiguous exact owner-run matches remain outcome_unknown', () => {
  const identity = {
    workflow,
    headSha: appSha,
    operationStartedAt,
    observedAt,
  };
  const empty = extractUniqueOwnerWorkflowRun([], identity);
  assert.equal(empty.status, 'outcome_unknown');
  assert.equal(empty.reason, 'zero_matches');
  assert.equal(empty.match_count, 0);

  const ambiguous = extractUniqueOwnerWorkflowRun([ownerRun(20), ownerRun(21)], identity);
  assert.equal(ambiguous.status, 'outcome_unknown');
  assert.equal(ambiguous.reason, 'ambiguous_matches');
  assert.equal(ambiguous.match_count, 2);
});

test('successful post-dispatch readback identifies one run without mutation retry', () => {
  const report = buildPostDispatchReconcile({
    workflow,
    headSha: appSha,
    operationStartedAt,
    observedAt,
    mutationInvocationCount: 1,
  }, { runner: successfulRunner([ownerRun(30193137575)]) });

  assert.equal(report.status, 'identified');
  assert.equal(report.owner_run?.id, 30193137575);
  assert.equal(report.owner_run_query.logical_query_count, 1);
  assert.equal(report.mutation_invocation_count, 1);
  assert.equal(report.mutation_retry_count, 0);
  assert.equal(report.replacement_allowed, false);
  assert.equal(report.redispatch_allowed, false);
});

test('pre-nonce guard consumes the frozen-reachability source gate and one owner query without moving-main checks', () => {
  const calls: string[] = [];
  const base = successfulRunner();
  const report = buildPreNonceDispatchGuard({
    workflow,
    expectedAppSha: appSha,
    expectedShellSha: shellSha,
    expectedFrameworkSha: frameworkSha,
    sourceGateReport: sourceGateReport(),
  }, {
    runner: (command, args, options) => {
      calls.push(`${command} ${args.join(' ')}`);
      return base(command, args, options);
    },
  });

  assert.equal(report.status, 'passed');
  assert.equal(calls.filter((entry) => entry.startsWith('git ls-remote')).length, 0);
  assert.equal(calls.filter((entry) => entry.startsWith('gh api')).length, 1);
  assert.equal(calls.some((entry) => /commits\/main|git\/ref\/heads\/main/.test(entry)), false);
  assert.equal(report.owner_run_query?.logical_query_count, 1);
  assert.equal(report.dispatch_allowed, true);
  assert.equal(report.nonce_consumed, false);
});

test('pre-nonce guard permits only its own authority-bound run and rejects any second matching run', () => {
  const own = ownerRun(42);
  const another = ownerRun(43);
  const reconciled = buildPreNonceDispatchGuard({
    workflow,
    expectedAppSha: appSha,
    expectedShellSha: shellSha,
    expectedFrameworkSha: frameworkSha,
    sourceGateReport: sourceGateReport(),
    currentRunId: '42',
    authorityId: 'authority-42',
  }, { runner: successfulRunner([own]) });
  assert.equal(reconciled.status, 'passed');

  const blocked = buildPreNonceDispatchGuard({
    workflow,
    expectedAppSha: appSha,
    expectedShellSha: shellSha,
    expectedFrameworkSha: frameworkSha,
    sourceGateReport: sourceGateReport(),
    currentRunId: '42',
    authorityId: 'authority-42',
  }, { runner: successfulRunner([own, another]) });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.owner_run_match_count, 2);
});

test('pre-nonce guard rejects a repeated pre-issued authority even after an earlier run completed', () => {
  const prior = ownerRun(41, { status: 'completed', conclusion: 'success' });
  const current = ownerRun(42);
  const report = buildPreNonceDispatchGuard({
    workflow,
    expectedAppSha: appSha,
    expectedShellSha: shellSha,
    expectedFrameworkSha: frameworkSha,
    sourceGateReport: sourceGateReport(),
    currentRunId: '42',
    authorityId: 'authority-42',
  }, { runner: successfulRunner([prior, current]) });
  assert.equal(report.status, 'blocked');
  assert.match(report.reason, /no prior authority consumer/);
});

test('unchanged Stable failure fingerprint denies dispatch before any wire or owner read', () => {
  let calls = 0;
  const fingerprint = failureFingerprint();
  const report = buildPreNonceDispatchGuard({
    workflow,
    expectedAppSha: appSha,
    expectedShellSha: shellSha,
    expectedFrameworkSha: frameworkSha,
    sourceGateReport: sourceGateReport(),
    priorFailureFingerprint: fingerprint,
    currentFailureFingerprint: structuredClone(fingerprint),
  }, {
    runner: () => {
      calls += 1;
      return { status: 1, stdout: '', stderr: 'must not execute' };
    },
  });

  assert.equal(calls, 0);
  assert.equal(report.status, 'blocked');
  assert.equal(report.failure_class, 'deterministic');
  assert.equal(report.failure_code, 'unchanged_failure_fingerprint');
  assert.equal(report.failure_fingerprint_guard.status, 'blocked_unchanged');
  assert.equal(report.failure_fingerprint_guard.dispatch_count, 0);
  assert.equal(report.nonce_consumed, false);
  assert.equal(report.mutation_invocation_count, 0);
  assert.equal(report.dispatch_allowed, false);
  assert.equal(report.redispatch_allowed, false);
});

test('changed environment fingerprint proceeds through the existing read-only pre-nonce gates', () => {
  const report = buildPreNonceDispatchGuard({
    workflow,
    expectedAppSha: appSha,
    expectedShellSha: shellSha,
    expectedFrameworkSha: frameworkSha,
    sourceGateReport: sourceGateReport(),
    priorFailureFingerprint: failureFingerprint('5'),
    currentFailureFingerprint: failureFingerprint('6'),
  }, { runner: successfulRunner() });

  assert.equal(report.status, 'passed');
  assert.equal(report.failure_fingerprint_guard.status, 'changed');
  assert.equal(report.failure_fingerprint_guard.unchanged, false);
  assert.equal(report.dispatch_allowed, true);
});

test('partial failure fingerprint input fails closed before transport', () => {
  assert.throws(
    () => buildPreNonceDispatchGuard({
      workflow,
      expectedAppSha: appSha,
      expectedShellSha: shellSha,
      expectedFrameworkSha: frameworkSha,
      sourceGateReport: sourceGateReport(),
      priorFailureFingerprint: failureFingerprint(),
    }, { runner: successfulRunner() }),
    /requires both prior and current failure fingerprints/,
  );
});

test('pre-nonce guard fails closed on a malformed owner run', () => {
  const report = buildPreNonceDispatchGuard({
    workflow,
    expectedAppSha: appSha,
    expectedShellSha: shellSha,
    expectedFrameworkSha: frameworkSha,
    sourceGateReport: sourceGateReport(),
  }, { runner: successfulRunner([{ id: 42, path: workflow }]) });

  assert.equal(report.status, 'blocked');
  assert.equal(report.failure_class, 'protocol');
  assert.match(report.reason, /malformed run/);
  assert.equal(report.dispatch_allowed, false);
  assert.equal(report.nonce_consumed, false);
});

test('credential failure is not retried or misclassified as transport', () => {
  let calls = 0;
  const report = buildPostDispatchReconcile({
    workflow,
    headSha: appSha,
    operationStartedAt,
    observedAt,
    mutationInvocationCount: 1,
  }, {
    runner: () => {
      calls += 1;
      return { status: 1, stdout: '', stderr: 'HTTP 401: Bad credentials' };
    },
  });

  assert.equal(calls, 1);
  assert.equal(report.status, 'outcome_unknown');
  assert.equal(report.failure_class, 'credential');
  assert.equal(report.failure_code, 'credential_failure');
  assert.equal(report.credential_failure, true);
  assert.equal(report.mutation_retry_count, 0);
});
