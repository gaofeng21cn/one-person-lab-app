import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

const appRoot = path.resolve(import.meta.dirname, '../..');
const workflowPath = path.join(appRoot, '.github/workflows/release-stable-post-success-followups.yml');
const actionPath = path.join(appRoot, '.github/actions/release-followups/full-addon/action.yml');
const source = fs.readFileSync(workflowPath, 'utf8');
const actionSource = fs.readFileSync(actionPath, 'utf8');
const workflow = parseYaml(source) as Record<string, any>;
const action = parseYaml(actionSource) as Record<string, any>;

test('Full add-on is one independently rerunnable lane in the Stable follow-up hub', () => {
  assert.equal(workflow.name, 'OPL Stable Follow-ups');
  assert.deepEqual(Object.keys(workflow.on), ['workflow_run', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.workflow_run.workflows, ['OPL Stable Release Bundle']);
  assert.equal(workflow.on.workflow_dispatch.inputs.operation.options.includes('reconcile_full_addon'), true);
  assert.equal(workflow.on.workflow_dispatch.inputs.source_run_id.required, true);
  assert.equal(workflow.on.workflow_dispatch.inputs.smoke_harness_ref.required, false);
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  const job = workflow.jobs['reconcile-full-addon'];
  assert.equal(job.if, "${{ needs.route.outputs.full_addon == 'true' }}");
  assert.deepEqual(job.needs, ['route']);
  assert.equal(job.concurrency['cancel-in-progress'], false);
  assert.equal(job.outputs.owner_run_id, '${{ steps.full.outputs.owner_run_id }}');
  assert.equal(job.outputs.state, '${{ steps.full.outputs.state }}');
  assert.equal(job.steps.at(-1).uses, './.github/actions/release-followups/full-addon');
  assert.equal(job.steps.at(-1).id, 'full');
  assert.equal(action.outputs.owner_run_id.value, '${{ steps.owner.outputs.owner_run_id }}');
  assert.equal(action.runs.using, 'composite');
  assert.equal(fs.existsSync(path.join(appRoot, '.github/workflows/release-full-addon-follower.yml')), false);
});

test('Full follower consumes a successful Standard handoff through current canonical main', () => {
  const job = workflow.jobs['reconcile-full-addon'];
  assert.equal(job['timeout-minutes'], 20);
  assert.deepEqual(job.permissions, { contents: 'read', actions: 'write' });
  const checkout = job.steps.find((step: Record<string, unknown>) =>
    step.name === 'Checkout canonical Full follower');
  assert.equal(checkout.with.ref, 'main');
  assert.equal(checkout.with['persist-credentials'], false);
  assert.match(actionSource, /\.path == "\.github\/workflows\/release-stable\.yml"/);
  assert.match(actionSource, /operation="\$\(jq -er '\.operation \| strings'/);
  assert.match(actionSource, /standard\) artifact="opl-release-standard-checkpoint-\$SOURCE_RUN_ID"/);
  assert.match(actionSource, /resume_standard\) artifact="opl-release-standard-operation-checkpoint-\$SOURCE_RUN_ID"/);
  assert.match(actionSource, /standard_built\|standard_qualified/);
  assert.match(actionSource, /\.immutable == false/);
});

test('Full follower delegates desired-state reconciliation and at-most-once dispatch to the canonical controller', () => {
  assert.match(actionSource, /scripts\/stable-release-dispatch\.ts "\$\{args\[@\]\}"/);
  assert.match(actionSource, /append-full/);
  assert.match(actionSource, /--source-run-id "\$SOURCE_RUN_ID"/);
  assert.match(actionSource, /--smoke-harness-ref "\$SMOKE_HARNESS_REF"/);
  assert.match(actionSource, /--execute/);
  assert.match(actionSource, /published\|owner_identified\|dispatched/);
  assert.match(actionSource, /outcome_unknown/);
  assert.match(actionSource, /mutation_retry_count/);
  assert.match(actionSource, /read_only_reconcile_only/);
  assert.match(actionSource, /\.plan\.source\.run_id/);
  assert.match(actionSource, /root_source_run_id/);
  assert.match(actionSource, /waits_for_owner_completion:false/);
  assert.match(actionSource, /opl_app_full_addon_follower\.v1/);
  assert.doesNotMatch(actionSource, /actions\/workflows\/release-stable\.yml\/dispatches/);
  assert.doesNotMatch(actionSource, /prior_ids=|prior \| index\(\$id\)|for _ in \$\(seq 1 (?:60|840)\)/);
  assert.doesNotMatch(actionSource, /actions\/runs\/\$owner_run_id[\s\S]*\.status == "completed"/);
  assert.doesNotMatch(actionSource, /failed_(?:run|follower|recovery)_id|recovery_generation|actions\/jobs\/.*\/logs/);
  assert.doesNotMatch(actionSource, /gh run (?:rerun|cancel)|--clobber|force/);
});

function ownerReconcileTail(): string {
  const run = String(action.runs.steps.find((step: Record<string, any>) => step.id === 'owner')?.run);
  const marker = 'test -f stable-full-reconcile.json';
  const index = run.indexOf(marker);
  assert.ok(index >= 0);
  return run.slice(index);
}

function evaluateOwnerReconcile(input: {
  status: string;
  dispatchStatus: number;
  mutationCount?: number;
  retryCount?: number;
  readOnly?: boolean;
  ownerRunId?: number | null;
}): { status: number | null; ownerRunId: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-owner-'));
  const output = path.join(root, 'github-output');
  fs.writeFileSync(output, '');
  fs.writeFileSync(path.join(root, 'stable-full-reconcile.json'), `${JSON.stringify({
    status: input.status,
    mutation_invocation_count: input.mutationCount ?? 0,
    mutation_retry_count: input.retryCount ?? 0,
    read_only_reconcile_only: input.readOnly ?? false,
    redispatch_allowed: false,
    human_redispatch_allowed: input.status !== 'outcome_unknown',
    owner_run: input.ownerRunId == null ? null : { id: input.ownerRunId },
    plan: { source: { run_id: '11', artifact: 'checkpoint' } },
  })}\n`);
  try {
    const result = spawnSync('bash', ['-c', `set -euo pipefail\ndispatch_status=${input.dispatchStatus}\n${ownerReconcileTail()}`], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: output },
    });
    const ownerLine = fs.readFileSync(output, 'utf8').split('\n').find((line) => line.startsWith('owner_run_id='));
    return {
      status: result.status,
      ownerRunId: ownerLine?.slice('owner_run_id='.length) ?? '',
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('Full follower retains owner run id and does not redispatch outcome_unknown', () => {
  assert.equal(evaluateOwnerReconcile({
    status: 'dispatched',
    dispatchStatus: 0,
    ownerRunId: 99,
  }).ownerRunId, '99');
  assert.equal(evaluateOwnerReconcile({
    status: 'published',
    dispatchStatus: 0,
    ownerRunId: 77,
  }).ownerRunId, '77');
  const unknown = evaluateOwnerReconcile({
    status: 'outcome_unknown',
    dispatchStatus: 2,
    mutationCount: 1,
    retryCount: 0,
    readOnly: true,
    ownerRunId: null,
  });
  assert.equal(unknown.status, 0);
  assert.equal(unknown.ownerRunId, '');
  assert.equal(evaluateOwnerReconcile({
    status: 'outcome_unknown',
    dispatchStatus: 0,
    mutationCount: 1,
    retryCount: 0,
    readOnly: true,
    ownerRunId: null,
  }).status, 1);
  assert.equal(evaluateOwnerReconcile({
    status: 'outcome_unknown',
    dispatchStatus: 2,
    mutationCount: 2,
    retryCount: 0,
    readOnly: true,
    ownerRunId: null,
  }).status, 1);
  assert.equal(evaluateOwnerReconcile({
    status: 'failed',
    dispatchStatus: 1,
    ownerRunId: null,
  }).status, 1);
});

function writeHandoffScript(): string {
  const run = String(action.runs.steps.find((step: Record<string, any>) =>
    step.name === 'Write thin Full follower handoff')?.run);
  assert.match(run, /human_redispatch_allowed:false/);
  assert.match(run, /owner_locked:\(\$owner \| test\("\^\[1-9\]\[0-9\]\*\$"\)\)/);
  return run;
}

function evaluateFollowerReceipt(input: {
  state: string;
  ownerRunId: string;
  mutationCount?: number;
}): Record<string, unknown> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-handoff-'));
  try {
    const result = spawnSync('bash', ['-c', writeHandoffScript()], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        STATE: input.state,
        OWNER_RUN_ID: input.ownerRunId,
        MUTATION_COUNT: String(input.mutationCount ?? 1),
        SOURCE_RUN_ID: '11',
        SOURCE_ARTIFACT: 'opl-release-standard-checkpoint-11',
        RESOLVED_SOURCE_RUN_ID: '11',
        RESOLVED_SOURCE_ARTIFACT: 'opl-release-standard-checkpoint-11',
        RELEASE_TAG: 'v26.8.31',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(fs.readFileSync(path.join(root, 'full-addon-follower.json'), 'utf8')) as Record<string, unknown>;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('Full follower receipt forbids human redispatch and locks owner only from an exact owner_run_id', () => {
  for (const state of ['dispatched', 'owner_identified', 'outcome_unknown']) {
    const receipt = evaluateFollowerReceipt({
      state,
      ownerRunId: state === 'outcome_unknown' ? '' : '99',
    });
    assert.equal(receipt.status, state);
    assert.equal(receipt.human_redispatch_allowed, false);
    assert.equal(receipt.redispatch_allowed, false);
    assert.equal(receipt.owner_locked, state !== 'outcome_unknown');
    assert.equal(receipt.owner_run_id, state === 'outcome_unknown' ? null : '99');
  }
  const unlocked = evaluateFollowerReceipt({ state: 'dispatched', ownerRunId: '' });
  assert.equal(unlocked.owner_locked, false);
  assert.equal(unlocked.owner_run_id, null);
  assert.equal(unlocked.human_redispatch_allowed, false);
  const nonNumeric = evaluateFollowerReceipt({ state: 'owner_identified', ownerRunId: 'owner' });
  assert.equal(nonNumeric.owner_locked, false);
  assert.equal(nonNumeric.human_redispatch_allowed, false);
});
