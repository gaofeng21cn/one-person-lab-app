import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  activeStableRunIds,
  assertLatestStandardReleaseComplete,
  buildAppendFullPlan,
  buildPublishQualifiedStandardPlan,
  buildStandardPlan,
  appendFullOwnersFromCurrentMutation,
  completeAppendFullDispatch,
  dispatchOnce,
  fullCheckpointMatchesRequestedCohort,
  reachableAppendFullRuns,
  reconcileAppendFullCheckpointCohort,
  reconcileAppendFullTarget,
  selectCheckpointArtifact,
  selectPriorFullCandidateRunId,
  selectQualifiedStandardCheckpointArtifact,
  selectReusableFullCheckpointArtifact,
  selectReusableStandardCheckpointArtifact,
  sourceGate,
  workflowDispatchArgs,
} from '../../scripts/stable-release-dispatch.ts';
import {
  stableOperationCriticalBlobs,
  stableOperationCriticalBlobPaths,
} from '../../scripts/stable-operation-control.ts';

const appRoot = path.resolve(import.meta.dirname, '../..');
const appSha = '1'.repeat(40);
const shellSha = '2'.repeat(40);
const frameworkSha = '3'.repeat(40);

test('Stable dispatch binds the existing critical control bytes without duplicating their path list', () => {
  const blobs = stableOperationCriticalBlobs(appRoot);
  assert.deepEqual(Object.keys(blobs), [...stableOperationCriticalBlobPaths]);
  for (const [relativePath, digest] of Object.entries(blobs)) {
    assert.equal(fs.statSync(path.join(appRoot, relativePath)).isFile(), true);
    assert.match(digest, /^sha256:[0-9a-f]{64}$/);
  }
});

test('Stable dispatch executes the required active Shell source gates before authority issuance', () => {
  let commandArgs: string[] = [];
  const report = { schema: 'source-gate-fixture', status: 'passed' };
  const result = sourceGate({
    runner(command, args) {
      if (command === 'git' && args.join(' ') === 'rev-parse HEAD') {
        return { status: 0, stdout: `${appSha}\n`, stderr: '' };
      }
      assert.equal(command, process.execPath);
      commandArgs = args;
      const outputIndex = args.indexOf('--output');
      assert.notEqual(outputIndex, -1);
      fs.writeFileSync(args[outputIndex + 1]!, JSON.stringify(report));
      return { status: 0, stdout: '', stderr: '' };
    },
    now: () => new Date('2026-08-27T00:00:00.000Z'),
    randomBytes: (size) => Buffer.alloc(size, 1),
    wait: async () => {},
  }, appSha, shellSha, frameworkSha, 'opl-desktop-stable-release');

  assert.deepEqual(result, report);
  assert.deepEqual(
    commandArgs.slice(commandArgs.indexOf('--require-shell-format'), commandArgs.indexOf('--output')),
    [
      '--require-shell-format', 'true',
      '--run-shell-tests', 'true',
      '--repo-root', appRoot,
      '--shell-root', path.join(appRoot, 'shells', 'aionui'),
      '--framework-root', path.resolve(appRoot, '..', 'one-person-lab'),
    ],
  );
});

test('Stable recovery validates frozen product source in an isolated worktree while keeping the current executor', () => {
  const commands: Array<{ command: string; args: string[] }> = [];
  const result = sourceGate({
    runner(command, args) {
      commands.push({ command, args });
      if (command === 'git' && args.join(' ') === 'rev-parse HEAD') {
        return { status: 0, stdout: `${'9'.repeat(40)}\n`, stderr: '' };
      }
      if (command === 'git') return { status: 0, stdout: '', stderr: '' };
      if (command === process.execPath) {
        const outputIndex = args.indexOf('--output');
        fs.writeFileSync(args[outputIndex + 1]!, JSON.stringify({ schema: 'source-gate-fixture', status: 'passed' }));
      }
      return { status: 0, stdout: '', stderr: '' };
    },
    now: () => new Date('2026-09-03T09:00:00.000Z'),
    randomBytes: (size) => Buffer.alloc(size, 1),
    wait: async () => {},
  }, appSha, shellSha, frameworkSha, 'opl-desktop-stable-release');

  assert.deepEqual(result, { schema: 'source-gate-fixture', status: 'passed' });
  const add = commands.find(({ command, args }) => command === 'git' && args.slice(0, 3).join(' ') === 'worktree add --detach');
  assert.ok(add);
  assert.equal(add.args.at(-1), appSha);
  assert.ok(commands.some(({ command, args }) => command === 'npm' && args.join(' ') === 'ci --ignore-scripts'));
  const sourceGateCommand = commands.find(({ command }) => command === process.execPath);
  assert.ok(sourceGateCommand);
  assert.notEqual(sourceGateCommand.args[sourceGateCommand.args.indexOf('--repo-root') + 1], appRoot);
  assert.ok(commands.some(({ command, args }) => command === 'git' && args.slice(0, 3).join(' ') === 'worktree remove --force'));
});

test('Standard recovery preserves the failed source tag and binds its signed artifact run', () => {
  const runtime = {
    runner(command: string, args: string[]) {
      if (command === 'git' && args.join(' ') === 'rev-parse HEAD') {
        return { status: 0, stdout: `${appSha}\n`, stderr: '' };
      }
      if (command === process.execPath) {
        const outputIndex = args.indexOf('--output');
        fs.writeFileSync(args[outputIndex + 1]!, JSON.stringify({
          schema: 'opl_app_release_source_gate.v1',
          status: 'passed',
          operation_fingerprint: 'opl-desktop-stable-release',
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
        }));
        return { status: 0, stdout: '', stderr: '' };
      }
      if (command === 'gh' && args.join(' ') === 'api user --jq .login') {
        return { status: 0, stdout: 'gaofeng21cn\n', stderr: '' };
      }
      if (command === 'gh') {
        return { status: 0, stdout: JSON.stringify([{ total_count: 0, workflow_runs: [] }]), stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    },
    now: () => new Date('2026-09-03T09:00:00.000Z'),
    randomBytes: (size: number) => Buffer.alloc(size, 1),
    wait: async () => {},
  };
  const plan = buildStandardPlan({
    runtime,
    workflow: '.github/workflows/release-stable.yml',
    appSha,
    shellSha,
    frameworkSha,
    desktopAdditionalPlatforms: ['linux-x64', 'windows-x64'],
    productChangeSummary: 'Continue the same Stable release after fixture repair.',
    priorStandardArtifactRunId: '33728918457',
  });

  assert.equal(plan.operation, 'standard');
  assert.equal(plan.version_policy, 'preserve_source_tag');
  assert.equal(plan.workflow_inputs.prior_standard_artifact_run_id, '33728918457');
  assert.equal(plan.recovery.requested_run_id, '33728918457');
  assert.equal(plan.recovery.artifact_producer_run_id, '33728918457');
});

test('checkpoint selection prefers the deepest exact non-expired checkpoint', () => {
  assert.equal(selectCheckpointArtifact([
    { id: 1, name: 'opl-release-standard-operation-checkpoint-123', expired: false },
    { id: 2, name: 'opl-release-full-checkpoint-123', expired: false },
    { id: 3, name: 'opl-release-append-full-operation-checkpoint-v2-123', expired: false },
  ], '123'), 'opl-release-full-checkpoint-123');
  assert.equal(selectReusableFullCheckpointArtifact([
    { id: 1, name: 'opl-release-append-full-operation-checkpoint-123', expired: false },
    { id: 2, name: 'opl-release-full-checkpoint-123', expired: false },
  ], '123'), 'opl-release-full-checkpoint-123');
  assert.equal(selectReusableFullCheckpointArtifact([
    { id: 1, name: 'opl-release-append-full-operation-checkpoint-123', expired: false },
    { id: 2, name: 'opl-release-append-full-operation-checkpoint-v2-123', expired: false },
  ], '123'), 'opl-release-append-full-operation-checkpoint-v2-123');
  assert.equal(selectReusableFullCheckpointArtifact([
    { id: 1, name: 'opl-release-append-full-operation-checkpoint-123', expired: false },
  ], '123'), null);
  assert.equal(selectCheckpointArtifact([
    { id: 1, name: 'opl-release-append-full-operation-checkpoint-123', expired: false },
    { id: 2, name: 'opl-release-standard-checkpoint-123', expired: false },
  ], '123'), 'opl-release-standard-checkpoint-123');
  assert.equal(selectReusableFullCheckpointArtifact([], '123'), null);
  assert.throws(() => selectCheckpointArtifact([], '123'), /no reusable Standard or Full checkpoint/);
});

test('qualified Standard publication selects only the exact qualification checkpoint', () => {
  assert.equal(selectQualifiedStandardCheckpointArtifact([
    { id: 1, name: 'opl-release-standard-checkpoint-123', expired: false },
    { id: 2, name: 'opl-release-standard-operation-checkpoint-123', expired: false },
  ], '123'), 'opl-release-standard-checkpoint-123');
  assert.throws(
    () => selectQualifiedStandardCheckpointArtifact([], '123'),
    /exactly one qualified Standard checkpoint/,
  );
});

test('Full checkpoint reuse requires an exact content cohort and otherwise returns to Standard', () => {
  const checkpointTarget = {
    state: 'dispatch_required' as const,
    root_source_run_id: '100',
    owner_run_id: null,
    source_run_id: '102',
    source_artifact: 'opl-release-full-checkpoint-102',
  };
  const checkpointCohort = {
    schema: 'opl_app_build_artifact_cohort.v2',
    build: { kind: 'full' },
    cohort: { app_sha: appSha, shell_sha: shellSha, framework_sha: frameworkSha },
  };
  const rootArtifacts = [
    { id: 1, name: 'opl-release-standard-operation-checkpoint-100', expired: false },
  ];
  assert.equal(fullCheckpointMatchesRequestedCohort(checkpointCohort, {
    appSha, shellSha, frameworkSha,
  }), true);
  assert.deepEqual(reconcileAppendFullCheckpointCohort({
    target: checkpointTarget,
    rootArtifacts,
    checkpointCohort,
    appSha,
    shellSha,
    frameworkSha,
  }), checkpointTarget);

  const currentFrameworkSha = '4'.repeat(40);
  assert.equal(fullCheckpointMatchesRequestedCohort(checkpointCohort, {
    appSha, shellSha, frameworkSha: currentFrameworkSha,
  }), false);
  assert.deepEqual(reconcileAppendFullCheckpointCohort({
    target: checkpointTarget,
    rootArtifacts,
    checkpointCohort,
    appSha,
    shellSha,
    frameworkSha: currentFrameworkSha,
  }), {
    state: 'dispatch_required',
    root_source_run_id: '100',
    owner_run_id: null,
    source_run_id: '100',
    source_artifact: 'opl-release-standard-operation-checkpoint-100',
  });
  assert.equal(selectReusableStandardCheckpointArtifact(rootArtifacts, '100'), rootArtifacts[0]!.name);
  assert.throws(() => fullCheckpointMatchesRequestedCohort({
    ...checkpointCohort,
    schema: 'unknown',
  }, { appSha, shellSha, frameworkSha }), /schema is invalid/);
});

test('a new product version requires the prior Standard publication, not optional followers', () => {
  const complete = {
    tag_name: 'v26.8.22',
    assets: [
      { name: 'One-Person-Lab-26.8.22-mac-arm64.dmg' },
      { name: 'opl-app-component-manifest.json' },
    ],
  };
  assert.doesNotThrow(() => assertLatestStandardReleaseComplete(complete));
  assert.throws(
    () => assertLatestStandardReleaseComplete({ ...complete, assets: complete.assets.slice(0, 1) }),
    /Repair that same tag before creating another product version/,
  );
});

test('Stable workflow imports the canonical Latest Standard completeness guard', () => {
  const workflow = fs.readFileSync(path.join(appRoot, '.github/workflows/release-stable.yml'), 'utf8');
  assert.match(
    workflow,
    /import \{ assertLatestStandardReleaseComplete \} from '\.\/app-executor\/scripts\/stable-release-dispatch\.ts';/,
  );
  assert.doesNotMatch(workflow, /assertLatestReleaseSetComplete/);
});

test('Full checkpoint requalification preserves the tag and accepts exact optional harness refs', () => {
  const plan = buildAppendFullPlan({
    attemptId: 'append-full-20260824-aabbccdd',
    sourceRunId: '32665218996',
    sourceArtifact: 'opl-release-append-full-operation-checkpoint-v2-32665218996',
    appSha,
    shellSha,
    frameworkSha,
    smokeHarnessSha: '4'.repeat(40),
    verificationAppSha: '5'.repeat(40),
    recoveryRunId: '32665218996',
  });
  assert.equal(plan.version_policy, 'preserve_source_tag');
  assert.equal('prior_full_artifact_run_id' in plan.workflow_inputs, false);
  assert.equal(plan.workflow_inputs.smoke_harness_ref, JSON.stringify({
    app_ref: '5'.repeat(40),
    shell_ref: '4'.repeat(40),
  }));
  assert.equal('verification_app_ref' in plan.workflow_inputs, false);
  assert.equal(plan.recovery.verification_app_ref, '5'.repeat(40));
  assert.equal('version' in plan.workflow_inputs, false);
  assert.throws(() => buildAppendFullPlan({
    attemptId: 'append-full-20260824-aabbccdd',
    sourceRunId: '32617588213',
    sourceArtifact: 'opl-release-standard-checkpoint-32617588213',
    appSha,
    shellSha,
    frameworkSha,
    smokeHarnessSha: '4'.repeat(40),
  }), /verification harness refs require a reusable Full checkpoint/);
  assert.throws(() => buildAppendFullPlan({
    attemptId: 'append-full-20260824-aabbccdd',
    sourceRunId: '32617588213',
    sourceArtifact: 'opl-release-standard-checkpoint-32617588213',
    appSha,
    shellSha,
    frameworkSha,
    verificationAppSha: '5'.repeat(40),
  }), /verification harness refs require a reusable Full checkpoint/);
});

test('append_full consumes only a successful exact-cohort Full candidate receipt', () => {
  const root = '32617588213';
  const receipt = { id: 1, name: `opl-full-candidate-receipt-${root}`, expired: false };
  const pack = { id: 2, name: 'opl-full-first-install-26.8.31-mac-arm64', expired: false };
  const cohort = { id: 3, name: 'opl-full-first-install-dmg-26.8.31-mac-arm64-cohort', expired: false };
  const dmgOnly = { id: 4, name: 'opl-full-first-install-dmg-26.8.31-mac-arm64', expired: false };
  assert.equal(selectPriorFullCandidateRunId([receipt, pack, cohort], root), root);
  assert.equal(selectPriorFullCandidateRunId([receipt, pack], root), undefined);
  assert.equal(selectPriorFullCandidateRunId([receipt, pack, { ...cohort, expired: true }], root), undefined);
  assert.equal(selectPriorFullCandidateRunId([receipt, cohort], root), undefined);
  assert.equal(selectPriorFullCandidateRunId([receipt, dmgOnly, cohort], root), undefined);
  assert.equal(selectPriorFullCandidateRunId([receipt], root), undefined);
  assert.equal(selectPriorFullCandidateRunId([pack], root), undefined);
  assert.equal(selectPriorFullCandidateRunId([{ ...receipt, expired: true }, pack, cohort], root), undefined);
  assert.equal(selectPriorFullCandidateRunId([], root), undefined);
});

test('append_full consumes an exact Standard Full candidate through prior_full_artifact_run_id', () => {
  const plan = buildAppendFullPlan({
    attemptId: 'append-full-20260831-aabbccdd',
    sourceRunId: '32617588213',
    sourceArtifact: 'opl-release-standard-checkpoint-32617588213',
    appSha,
    shellSha,
    frameworkSha,
    priorFullArtifactRunId: '32617588213',
  });
  assert.equal(plan.workflow_inputs.prior_full_artifact_run_id, '32617588213');
  assert.equal(plan.workflow_inputs.operation, 'append_full');
  assert.equal(plan.version_policy, 'preserve_source_tag');
});

test('Full target-state reconciliation follows checkpoint retries back to one Standard source', () => {
  const owner = (id: number, source: number, status: string, conclusion: string | null) => ({
    id,
    path: '.github/workflows/release-stable.yml',
    status,
    conclusion,
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: appSha,
    run_attempt: 1,
    created_at: `2026-08-24T00:00:${id % 60}.000Z`,
    display_title: `OPL Stable append_full source:${source} run:${id}`,
  });
  const runs = [
    owner(101, 100, 'completed', 'failure'),
    owner(102, 101, 'completed', 'failure'),
  ];
  assert.deepEqual(reachableAppendFullRuns(runs, '100').map((run) => run.id), [101, 102]);
  assert.deepEqual(reconcileAppendFullTarget({
    runs,
    rootSourceRunId: '100',
    artifactsByRunId: {
      100: [{ id: 1, name: 'opl-release-standard-checkpoint-100', expired: false }],
      101: [{ id: 2, name: 'opl-release-full-checkpoint-101', expired: false }],
      102: [
        { id: 3, name: 'opl-release-append-full-operation-checkpoint-v2-102', expired: false },
        { id: 4, name: 'opl-full-first-install-dmg-26.9.3-mac-arm64-cohort', expired: false },
      ],
    },
  }), {
    state: 'dispatch_required',
    root_source_run_id: '100',
    owner_run_id: null,
    source_run_id: '102',
    source_artifact: 'opl-release-append-full-operation-checkpoint-v2-102',
  });
  assert.deepEqual(reconcileAppendFullTarget({
    runs: [owner(101, 100, 'completed', 'failure')],
    rootSourceRunId: '100',
    artifactsByRunId: {
      100: [{ id: 1, name: 'opl-release-standard-checkpoint-100', expired: false }],
      101: [{ id: 2, name: 'opl-release-append-full-operation-checkpoint-v2-101', expired: false }],
    },
  }), {
    state: 'dispatch_required',
    root_source_run_id: '100',
    owner_run_id: null,
    source_run_id: '100',
    source_artifact: 'opl-release-standard-checkpoint-100',
  });

  const active = owner(103, 102, 'in_progress', null);
  assert.equal(reconcileAppendFullTarget({
    runs: [...runs, active],
    rootSourceRunId: '100',
    artifactsByRunId: {},
  }).state, 'owner_identified');

  const published = owner(104, 102, 'completed', 'success');
  assert.equal(reconcileAppendFullTarget({
    runs: [...runs, published],
    rootSourceRunId: '100',
    artifactsByRunId: {
      104: [{ id: 4, name: 'opl-release-full-published-104', expired: false }],
    },
  }).state, 'published');
});

test('qualified Standard publication preserves its source tag and derives no new version input', () => {
  const plan = buildPublishQualifiedStandardPlan({
    attemptId: 'publish-qualified-standard-20260824-aabbccdd',
    sourceRunId: '32617588213',
    sourceArtifact: 'opl-release-standard-operation-checkpoint-32617588213',
    frameworkSha,
  });
  assert.equal(plan.operation, 'resume_standard');
  assert.equal(plan.version_policy, 'preserve_source_tag');
  assert.equal('version' in plan.workflow_inputs, false);
});

test('dispatch arguments expose one workflow mutation and never add a version', () => {
  const plan = buildAppendFullPlan({
    attemptId: 'append-full-20260824-aabbccdd',
    sourceRunId: '32617588213',
    sourceArtifact: 'opl-release-standard-operation-checkpoint-32617588213',
    appSha,
    shellSha,
    frameworkSha,
  });
  const args = workflowDispatchArgs('gaofeng21cn/one-person-lab-app', '.github/workflows/release-stable.yml', plan);
  assert.deepEqual(args.slice(0, 7), [
    'workflow',
    'run',
    '.github/workflows/release-stable.yml',
    '--repo',
    'gaofeng21cn/one-person-lab-app',
    '--ref',
    'main',
  ]);
  assert.equal(args.filter((entry) => entry === 'workflow').length, 1);
  assert.equal(args.some((entry) => entry.startsWith('version=')), false);
});

test('an unknown dispatch result performs one mutation and read-only reconciliation without retry', async () => {
  const commands: Array<{ command: string; args: string[] }> = [];
  const plan = buildAppendFullPlan({
    attemptId: 'append-full-20260824-aabbccdd',
    sourceRunId: '32617588213',
    sourceArtifact: 'opl-release-standard-operation-checkpoint-32617588213',
    appSha,
    shellSha,
    frameworkSha,
  });
  const result = await dispatchOnce({
    runner(command, args) {
      commands.push({ command, args });
      if (command === 'gh' && args[0] === 'workflow') {
        return { status: 1, stdout: '', stderr: 'transport outcome unknown' };
      }
      return {
        status: 0,
        stdout: JSON.stringify([{ total_count: 0, workflow_runs: [] }]),
        stderr: '',
      };
    },
    now: () => new Date('2026-08-24T00:00:00.000Z'),
    randomBytes: (size) => Buffer.alloc(size, 1),
    wait: async () => {},
  }, 'gaofeng21cn/one-person-lab-app', '.github/workflows/release-stable.yml', appSha, plan);

  assert.equal(result.status, 'outcome_unknown');
  assert.equal(result.mutation_invocation_count, 1);
  assert.equal(result.mutation_retry_count, 0);
  assert.equal(result.read_only_reconcile_only, true);
  assert.equal(commands.filter(({ command, args }) => command === 'gh' && args[0] === 'workflow').length, 1);
  assert.equal(commands.filter(({ command, args }) => command === 'gh' && args[0] === 'api').length, 6);
});

function appendFullOwnerRun(
  id: number,
  sourceRunId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    path: '.github/workflows/release-stable.yml',
    status: 'in_progress',
    conclusion: null,
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: appSha,
    run_attempt: 1,
    created_at: '2026-08-24T00:00:08Z',
    display_title: `OPL Stable append_full source:${sourceRunId} run:${id}`,
    ...overrides,
  };
}

function staleFailedAppendFullOwner(id: number, sourceRunId: string) {
  return appendFullOwnerRun(id, sourceRunId, {
    status: 'completed',
    conclusion: 'failure',
    created_at: '2026-08-23T23:00:00Z',
  });
}

function ownerRunsPayload(runs: unknown[]) {
  return JSON.stringify([{ total_count: runs.length, workflow_runs: runs }]);
}

test('delayed Full owner identification never issues a second mutation', async () => {
  const commands: Array<{ command: string; args: string[] }> = [];
  let apiReads = 0;
  const plan = buildAppendFullPlan({
    attemptId: 'append-full-20260824-aabbccdd',
    sourceRunId: '10',
    sourceArtifact: 'opl-release-standard-checkpoint-10',
    appSha,
    shellSha,
    frameworkSha,
  });
  const result = await completeAppendFullDispatch({
    runner(command, args) {
      commands.push({ command, args });
      if (command === 'gh' && args[0] === 'workflow') {
        return { status: 0, stdout: '', stderr: '' };
      }
      apiReads += 1;
      const runs = apiReads >= 8 ? [appendFullOwnerRun(99, '10')] : [];
      return { status: 0, stdout: ownerRunsPayload(runs), stderr: '' };
    },
    now: () => new Date('2026-08-24T00:00:00.000Z'),
    randomBytes: (size) => Buffer.alloc(size, 1),
    wait: async () => {},
  }, 'gaofeng21cn/one-person-lab-app', '.github/workflows/release-stable.yml', appSha, plan, '10', 6);

  assert.equal(result.status, 'owner_identified');
  assert.equal(result.owner_run?.id, 99);
  assert.equal(result.mutation_invocation_count, 1);
  assert.equal(result.mutation_retry_count, 0);
  assert.equal(result.redispatch_allowed, false);
  assert.equal(result.human_redispatch_allowed, false);
  assert.equal(commands.filter(({ command, args }) => command === 'gh' && args[0] === 'workflow').length, 1);
});

test('unidentified Full owner after one mutation remains typed unknown without a second mutation', async () => {
  const commands: Array<{ command: string; args: string[] }> = [];
  const plan = buildAppendFullPlan({
    attemptId: 'append-full-20260824-aabbccdd',
    sourceRunId: '10',
    sourceArtifact: 'opl-release-standard-checkpoint-10',
    appSha,
    shellSha,
    frameworkSha,
  });
  const result = await completeAppendFullDispatch({
    runner(command, args) {
      commands.push({ command, args });
      if (command === 'gh' && args[0] === 'workflow') {
        return { status: 1, stdout: '', stderr: 'transport outcome unknown' };
      }
      return { status: 0, stdout: ownerRunsPayload([]), stderr: '' };
    },
    now: () => new Date('2026-08-24T00:00:00.000Z'),
    randomBytes: (size) => Buffer.alloc(size, 1),
    wait: async () => {},
  }, 'gaofeng21cn/one-person-lab-app', '.github/workflows/release-stable.yml', appSha, plan, '10', 4);

  assert.equal(result.status, 'outcome_unknown');
  assert.equal(result.owner_run, null);
  assert.equal(result.mutation_invocation_count, 1);
  assert.equal(result.mutation_retry_count, 0);
  assert.equal(result.redispatch_allowed, false);
  assert.equal(result.human_redispatch_allowed, false);
  assert.equal(commands.filter(({ command, args }) => command === 'gh' && args[0] === 'workflow').length, 1);
});

test('delayed Full owner identification ignores a stale failed reachable run until the new owner appears', async () => {
  const commands: Array<{ command: string; args: string[] }> = [];
  let apiReads = 0;
  const plan = buildAppendFullPlan({
    attemptId: 'append-full-20260824-aabbccdd',
    sourceRunId: '10',
    sourceArtifact: 'opl-release-standard-checkpoint-10',
    appSha,
    shellSha,
    frameworkSha,
  });
  const stale = staleFailedAppendFullOwner(50, '10');
  const result = await completeAppendFullDispatch({
    runner(command, args) {
      commands.push({ command, args });
      if (command === 'gh' && args[0] === 'workflow') {
        return { status: 0, stdout: '', stderr: '' };
      }
      apiReads += 1;
      const runs = apiReads >= 10 ? [stale, appendFullOwnerRun(99, '10')] : [stale];
      return { status: 0, stdout: ownerRunsPayload(runs), stderr: '' };
    },
    now: () => new Date('2026-08-24T00:00:00.000Z'),
    randomBytes: (size) => Buffer.alloc(size, 1),
    wait: async () => {},
  }, 'gaofeng21cn/one-person-lab-app', '.github/workflows/release-stable.yml', appSha, plan, '10', 6);

  assert.equal(result.status, 'owner_identified');
  assert.equal(result.owner_run?.id, 99);
  assert.equal(result.operation_started_at, '2026-08-24T00:00:00.000Z');
  assert.equal(result.mutation_invocation_count, 1);
  assert.equal(result.mutation_retry_count, 0);
  assert.equal(result.redispatch_allowed, false);
  assert.equal(result.human_redispatch_allowed, false);
  assert.ok(apiReads >= 10);
  assert.equal(commands.filter(({ command, args }) => command === 'gh' && args[0] === 'workflow').length, 1);
});

test('stale failed reachable Full owner alone remains outcome_unknown after one mutation', async () => {
  const commands: Array<{ command: string; args: string[] }> = [];
  const plan = buildAppendFullPlan({
    attemptId: 'append-full-20260824-aabbccdd',
    sourceRunId: '10',
    sourceArtifact: 'opl-release-standard-checkpoint-10',
    appSha,
    shellSha,
    frameworkSha,
  });
  const result = await completeAppendFullDispatch({
    runner(command, args) {
      commands.push({ command, args });
      if (command === 'gh' && args[0] === 'workflow') {
        return { status: 1, stdout: '', stderr: 'transport outcome unknown' };
      }
      return {
        status: 0,
        stdout: ownerRunsPayload([staleFailedAppendFullOwner(50, '10')]),
        stderr: '',
      };
    },
    now: () => new Date('2026-08-24T00:00:00.000Z'),
    randomBytes: (size) => Buffer.alloc(size, 1),
    wait: async () => {},
  }, 'gaofeng21cn/one-person-lab-app', '.github/workflows/release-stable.yml', appSha, plan, '10', 4);

  assert.equal(result.status, 'outcome_unknown');
  assert.equal(result.owner_run, null);
  assert.equal(result.operation_started_at, '2026-08-24T00:00:00.000Z');
  assert.equal(result.mutation_invocation_count, 1);
  assert.equal(result.mutation_retry_count, 0);
  assert.equal(result.redispatch_allowed, false);
  assert.equal(result.human_redispatch_allowed, false);
  assert.equal(commands.filter(({ command, args }) => command === 'gh' && args[0] === 'workflow').length, 1);
});

test('Full mutation owner window accepts same-second GitHub created_at and still excludes earlier stale runs', async () => {
  const workflow = '.github/workflows/release-stable.yml';
  const startedAt = '2026-08-24T00:00:08.500Z';
  const sameSecond = appendFullOwnerRun(99, '10', { created_at: '2026-08-24T00:00:08Z' });
  const stale = staleFailedAppendFullOwner(50, '10');
  assert.deepEqual(
    appendFullOwnersFromCurrentMutation({
      runs: [stale, sameSecond],
      rootSourceRunId: '10',
      workflow,
      headSha: appSha,
      operationStartedAt: startedAt,
    }).map((owner) => owner.id),
    [99],
  );

  const plan = buildAppendFullPlan({
    attemptId: 'append-full-20260824-aabbccdd',
    sourceRunId: '10',
    sourceArtifact: 'opl-release-standard-checkpoint-10',
    appSha,
    shellSha,
    frameworkSha,
  });
  let apiReads = 0;
  const result = await completeAppendFullDispatch({
    runner(command, args) {
      if (command === 'gh' && args[0] === 'workflow') {
        return { status: 1, stdout: '', stderr: 'transport outcome unknown' };
      }
      apiReads += 1;
      const runs = apiReads >= 8 ? [stale, sameSecond] : [stale];
      return { status: 0, stdout: ownerRunsPayload(runs), stderr: '' };
    },
    now: () => new Date(startedAt),
    randomBytes: (size) => Buffer.alloc(size, 1),
    wait: async () => {},
  }, 'gaofeng21cn/one-person-lab-app', workflow, appSha, plan, '10', 4);

  assert.equal(result.status, 'owner_identified');
  assert.equal(result.owner_run?.id, 99);
  assert.equal(result.operation_started_at, startedAt);
  assert.equal(result.mutation_invocation_count, 1);
  assert.equal(result.redispatch_allowed, false);
});

test('active owner detection blocks only the canonical Stable workflow writer', () => {
  const base = {
    id: 11,
    path: '.github/workflows/release-stable.yml',
    status: 'in_progress',
    conclusion: null,
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: appSha,
    run_attempt: 1,
    created_at: '2026-08-24T00:00:00Z',
    display_title: 'OPL Stable append_full source:10 run:11',
  };
  assert.deepEqual(activeStableRunIds([base]), [11]);
  assert.deepEqual(activeStableRunIds([{ ...base, run_attempt: 2 }]), [11]);
  assert.deepEqual(activeStableRunIds([{ ...base, status: 'completed', conclusion: 'failure' }]), []);
  assert.deepEqual(activeStableRunIds([{ ...base, path: '.github/workflows/other.yml' }]), []);
});
