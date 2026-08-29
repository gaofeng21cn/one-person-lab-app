import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  activeStableRunIds,
  assertLatestStandardReleaseComplete,
  buildAppendFullPlan,
  buildPublishQualifiedStandardPlan,
  dispatchOnce,
  reachableAppendFullRuns,
  reconcileAppendFullTarget,
  selectCheckpointArtifact,
  selectQualifiedStandardCheckpointArtifact,
  selectReusableFullCheckpointArtifact,
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
    ['--require-shell-format', 'true', '--run-shell-tests', 'true'],
  );
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
  assert.equal(plan.workflow_inputs.smoke_harness_ref, '4'.repeat(40));
  assert.equal(plan.workflow_inputs.verification_app_ref, '5'.repeat(40));
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
  }), /reusable Full checkpoint/);
  assert.throws(() => buildAppendFullPlan({
    attemptId: 'append-full-20260824-aabbccdd',
    sourceRunId: '32617588213',
    sourceArtifact: 'opl-release-standard-checkpoint-32617588213',
    appSha,
    shellSha,
    frameworkSha,
    verificationAppSha: '5'.repeat(40),
  }), /verification_app_ref requires a reusable Full checkpoint/);
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
      102: [{ id: 3, name: 'opl-release-append-full-operation-checkpoint-v2-102', expired: false }],
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
      101: [{ id: 2, name: 'opl-release-append-full-operation-checkpoint-101', expired: false }],
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
