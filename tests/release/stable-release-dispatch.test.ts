import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  activeStableRunIds,
  assertLatestReleaseSetComplete,
  buildAppendFullPlan,
  buildFullCheckpointRecoveryPlan,
  buildPublishQualifiedStandardPlan,
  dispatchOnce,
  selectCheckpointArtifact,
  selectQualifiedStandardCheckpointArtifact,
  selectFullCheckpointArtifact,
  selectFullCohortArtifact,
  selectFullQualificationArtifact,
  validateFullBuildCohort,
  validateFullRecoveryEvidence,
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

test('checkpoint recovery selects one exact non-expired operation checkpoint', () => {
  assert.equal(selectCheckpointArtifact([
    { id: 1, name: 'opl-release-standard-operation-checkpoint-123', expired: false },
    { id: 2, name: 'unrelated', expired: false },
  ], '123'), 'opl-release-standard-operation-checkpoint-123');
  assert.throws(
    () => selectCheckpointArtifact([], '123'),
    /exactly one reusable Standard or Full operation checkpoint/,
  );
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

test('a new product version is blocked while Latest is not a complete Release Set', () => {
  const complete = {
    tag_name: 'v26.8.22',
    assets: [
      { name: 'One-Person-Lab-26.8.22-mac-arm64.dmg' },
      { name: 'One-Person-Lab-Full-26.8.22-mac-arm64.dmg' },
      { name: 'opl-app-component-manifest.json' },
      { name: 'opl-release-manifest.json' },
    ],
  };
  assert.doesNotThrow(() => assertLatestReleaseSetComplete(complete));
  assert.throws(
    () => assertLatestReleaseSetComplete({ ...complete, assets: complete.assets.slice(0, 2) }),
    /Finish or repair that same tag before creating another product version/,
  );
});

test('Full recovery keeps the recovery and original producer identities distinct', () => {
  const cohort = validateFullBuildCohort({
    schema: 'opl_app_build_artifact_cohort.v2',
    cohort: { app_sha: appSha, shell_sha: shellSha, framework_sha: frameworkSha },
    build: { version: '26.8.23-r1', kind: 'full' },
    artifact: {
      name: 'One-Person-Lab-Full-26.8.23-r1-mac-arm64.dmg',
      sha256: 'a'.repeat(64),
      size_bytes: 123,
    },
    actions: {
      run_id: '32660259139',
      run_attempt: '1',
      artifact_name: 'opl-full-first-install-dmg-26.8.23-r1-mac-arm64',
    },
  });
  const plan = buildAppendFullPlan({
    attemptId: 'recover-full-20260824-aabbccdd',
    sourceRunId: '32665218996',
    sourceArtifact: 'opl-release-append-full-operation-checkpoint-32665218996',
    appSha: cohort.cohort.app_sha,
    shellSha: cohort.cohort.shell_sha,
    frameworkSha: cohort.cohort.framework_sha,
    priorFullArtifactRunId: '32665218996',
    artifactProducerRunId: cohort.actions.run_id,
    qualificationRunId: '32665218996',
    smokeHarnessSha: '4'.repeat(40),
  });

  assert.equal(plan.version_policy, 'preserve_source_tag');
  assert.equal(plan.workflow_inputs.prior_full_artifact_run_id, '32665218996');
  assert.equal(plan.recovery.artifact_producer_run_id, '32660259139');
  assert.equal(plan.recovery.qualification_run_id, '32665218996');
  assert.equal(plan.workflow_inputs.smoke_harness_ref, '4'.repeat(40));
  assert.equal('version' in plan.workflow_inputs, false);
});

test('Full publication recovery consumes one qualified checkpoint without rebuilding or requalifying', () => {
  const artifacts = [{
    id: 7,
    name: 'opl-release-full-checkpoint-32675178143',
    expired: false,
  }];
  const checkpoint = selectFullCheckpointArtifact(artifacts, '32675178143');
  assert.equal(checkpoint, artifacts[0]);
  assert.throws(
    () => selectFullCheckpointArtifact([...artifacts, { ...artifacts[0]!, id: 8 }], '32675178143'),
    /multiple reusable qualified Full checkpoints/,
  );

  const plan = buildAppendFullPlan({
    attemptId: 'recover-full-20260824-aabbccdd',
    sourceRunId: '32675178143',
    sourceArtifact: checkpoint!.name,
    appSha,
    shellSha,
    frameworkSha,
    artifactProducerRunId: '32660259139',
    qualificationRunId: '32675178143',
    recoveryRunId: '32675178143',
  });

  assert.equal(plan.source.artifact, 'opl-release-full-checkpoint-32675178143');
  assert.equal(plan.recovery.requested_run_id, '32675178143');
  assert.equal(plan.recovery.artifact_producer_run_id, '32660259139');
  assert.equal(plan.recovery.qualification_run_id, '32675178143');
  assert.equal('prior_full_artifact_run_id' in plan.workflow_inputs, false);
  assert.equal('smoke_harness_ref' in plan.workflow_inputs, false);
  assert.equal('version' in plan.workflow_inputs, false);
});

test('Full checkpoint recovery binds an override harness to the checkpoint source run', () => {
  const checkpoint = {
    id: 7,
    name: 'opl-release-full-checkpoint-32680048326',
    expired: false,
  };
  const cohort = validateFullBuildCohort({
    schema: 'opl_app_build_artifact_cohort.v2',
    cohort: { app_sha: appSha, shell_sha: shellSha, framework_sha: frameworkSha },
    build: { version: '26.8.22', kind: 'full' },
    artifact: {
      name: 'One-Person-Lab-Full-26.8.22-mac-arm64.dmg',
      sha256: 'a'.repeat(64),
      size_bytes: 123,
    },
    actions: {
      run_id: '32680048326',
      run_attempt: '1',
      artifact_name: 'opl-full-first-install-dmg-26.8.22-mac-arm64',
    },
  });
  const plan = buildFullCheckpointRecoveryPlan({
    attemptId: 'recover-full-20260824-aabbccdd',
    recoveryRunId: '32680048326',
    fullCheckpoint: checkpoint,
    cohort,
    smokeHarnessSha: '4'.repeat(40),
  });

  assert.equal(plan.source.artifact, checkpoint.name);
  assert.equal(plan.workflow_inputs.prior_full_artifact_run_id, '32680048326');
  assert.equal(plan.workflow_inputs.smoke_harness_ref, '4'.repeat(40));
  assert.equal(plan.recovery.artifact_producer_run_id, '32680048326');
});

test('Full cohort selection and validation fail closed on ambiguity or malformed identity', () => {
  const artifact = { id: 1, name: 'opl-full-first-install-dmg-26.8.23-r1-mac-arm64-cohort', expired: false };
  assert.equal(selectFullCohortArtifact([artifact]), artifact);
  assert.throws(() => selectFullCohortArtifact([artifact, { ...artifact, id: 2 }]), /exactly one/);
  assert.throws(() => validateFullBuildCohort({ schema: 'opl_app_build_artifact_cohort.v2' }), /must be one JSON object/);
});

test('Full recovery derives the verification Shell from the exact failed qualification receipt', () => {
  const cohort = validateFullBuildCohort({
    schema: 'opl_app_build_artifact_cohort.v2',
    cohort: { app_sha: appSha, shell_sha: shellSha, framework_sha: frameworkSha },
    build: { version: '26.8.23-r1', kind: 'full' },
    artifact: {
      name: 'One-Person-Lab-Full-26.8.23-r1-mac-arm64.dmg',
      sha256: 'a'.repeat(64),
      size_bytes: 123,
    },
    actions: {
      run_id: '32660259139',
      run_attempt: '1',
      artifact_name: 'opl-full-first-install-dmg-26.8.23-r1-mac-arm64',
    },
  });
  const artifacts = [{
    id: 9,
    name: 'opl-qualification-attempt-full-32665218996',
    expired: false,
  }];
  assert.equal(
    selectFullQualificationArtifact(artifacts, '32665218996'),
    artifacts[0],
  );
  const recovery = validateFullRecoveryEvidence({
    schema: 'opl_app_qualification_attempt_receipt.v1',
    status: 'failed',
    retry: { disposition: 'reconcile_only' },
    identity: {
      artifact_kind: 'full',
      package_profile: 'full',
      qualification_run_id: '32665218996',
      qualification_run_attempt: '1',
      source_artifact_run_id: '32660259139',
      source_artifact_name: 'opl-full-first-install-dmg-26.8.23-r1-mac-arm64',
    },
    outcomes: { validate_inputs: 'success', clean_vm: 'failure' },
    evidence: {
      scope_proof: {
        classification: 'harness_mechanics_only',
        app_base_sha: appSha,
        app_head_sha: '4'.repeat(40),
        shell_base_sha: shellSha,
        shell_head_sha: '5'.repeat(40),
        forbidden_app_paths: [],
        forbidden_shell_paths: [],
      },
    },
  }, '32665218996', cohort);
  assert.deepEqual(recovery, {
    qualification_run_id: '32665218996',
    artifact_producer_run_id: '32660259139',
    smoke_harness_ref: '5'.repeat(40),
  });
});

test('Full recovery rejects a later passed run or a mismatched original producer before dispatch', () => {
  const cohort = validateFullBuildCohort({
    schema: 'opl_app_build_artifact_cohort.v2',
    cohort: { app_sha: appSha, shell_sha: shellSha, framework_sha: frameworkSha },
    build: { version: '26.8.23-r1', kind: 'full' },
    artifact: {
      name: 'One-Person-Lab-Full-26.8.23-r1-mac-arm64.dmg',
      sha256: 'a'.repeat(64),
      size_bytes: 123,
    },
    actions: {
      run_id: '32660259139',
      run_attempt: '1',
      artifact_name: 'opl-full-first-install-dmg-26.8.23-r1-mac-arm64',
    },
  });
  const receipt = {
    schema: 'opl_app_qualification_attempt_receipt.v1',
    status: 'failed',
    retry: { disposition: 'reconcile_only' },
    identity: {
      artifact_kind: 'full',
      package_profile: 'full',
      qualification_run_id: '32665218996',
      qualification_run_attempt: '1',
      source_artifact_run_id: '32665218996',
      source_artifact_name: 'opl-full-first-install-dmg-26.8.23-r1-mac-arm64',
    },
    outcomes: { validate_inputs: 'success', clean_vm: 'failure' },
    evidence: {
      scope_proof: {
        classification: 'harness_mechanics_only',
        app_base_sha: appSha,
        app_head_sha: '4'.repeat(40),
        shell_base_sha: shellSha,
        shell_head_sha: '5'.repeat(40),
        forbidden_app_paths: [],
        forbidden_shell_paths: [],
      },
    },
  };
  assert.throws(
    () => validateFullRecoveryEvidence(receipt, '32665218996', cohort),
    /original Full producer/,
  );
  assert.throws(
    () => validateFullRecoveryEvidence({ ...receipt, status: 'passed' }, '32665218996', cohort),
    /eligible failed qualification/,
  );
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
