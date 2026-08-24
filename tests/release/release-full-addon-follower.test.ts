import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

const appRoot = path.resolve(import.meta.dirname, '../..');
const workflowPath = path.join(appRoot, '.github/workflows/release-full-addon-follower.yml');
const source = fs.readFileSync(workflowPath, 'utf8');
const workflow = parseYaml(source) as Record<string, any>;

test('Full add-on has an independent automatic and desired-state reconciliation entry', () => {
  assert.equal(workflow.name, 'OPL Stable Full Add-on Follower');
  assert.deepEqual(Object.keys(workflow.on), ['workflow_run', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.workflow_run.workflows, ['OPL Stable Release Bundle']);
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), [
    'source_run_id', 'reconcile_confirmation',
  ]);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.reconcile_confirmation.options, [
    'reconcile_full_addon',
  ]);
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.deepEqual(Object.keys(workflow.jobs), ['reconcile-full-addon']);
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
});

test('Full follower consumes a successful Standard handoff through current canonical main', () => {
  const job = workflow.jobs['reconcile-full-addon'];
  assert.equal(job['timeout-minutes'], 20);
  assert.deepEqual(job.permissions, { contents: 'read', actions: 'write' });
  const checkout = job.steps.find((step: Record<string, unknown>) =>
    step.name === 'Checkout current canonical Full executor');
  assert.equal(checkout.with.ref, 'main');
  assert.equal(checkout.with['persist-credentials'], false);
  assert.match(source, /\.path == "\.github\/workflows\/release-stable\.yml"/);
  assert.match(source, /operation="\$\(jq -er '\.operation \| strings'/);
  assert.match(source, /standard\) artifact="opl-release-standard-checkpoint-\$SOURCE_RUN_ID"/);
  assert.match(source, /resume_standard\) artifact="opl-release-standard-operation-checkpoint-\$SOURCE_RUN_ID"/);
  assert.match(source, /standard_built\|standard_qualified/);
  assert.match(source, /\.immutable == false/);
});

test('Full follower identifies target state or performs one dispatch without waiting for completion', () => {
  assert.match(source, /state=published/);
  assert.match(source, /state=owner_identified/);
  assert.match(source, /Multiple active Full owners exist/);
  assert.match(source, /prior_ids=/);
  assert.match(source, /prior \| index\(\$id\)/);
  assert.equal((source.match(/actions\/workflows\/release-stable\.yml\/dispatches/g) ?? []).length, 1);
  assert.match(source, /operation:"append_full"/);
  assert.match(source, /for _ in \$\(seq 1 60\)/);
  assert.match(source, /waits_for_owner_completion:false/);
  assert.match(source, /opl_app_full_addon_follower\.v1/);
  assert.doesNotMatch(source, /for _ in \$\(seq 1 840\)/);
  assert.doesNotMatch(source, /actions\/runs\/\$owner_run_id[\s\S]*\.status == "completed"/);
  assert.doesNotMatch(source, /failed_(?:run|follower|recovery)_id|recovery_generation|actions\/jobs\/.*\/logs/);
  assert.doesNotMatch(source, /gh run (?:rerun|cancel)|--clobber|force/);
});
