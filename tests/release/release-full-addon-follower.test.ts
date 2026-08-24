import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  assert.equal(job.steps.at(-1).uses, './.github/actions/release-followups/full-addon');
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
