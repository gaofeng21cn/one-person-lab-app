import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

const appRoot = path.resolve(import.meta.dirname, '../..');
const workflowPath = path.join(appRoot, '.github/workflows/release-stable-post-success-followups.yml');
const source = fs.readFileSync(workflowPath, 'utf8');
const workflow = parseYaml(source) as Record<string, any>;

test('Stable success and protected installer repair share one Desktop Release Set owner', () => {
  assert.equal(workflow.name, 'OPL Stable Desktop Release Set Follow-up');
  assert.deepEqual(Object.keys(workflow.on), ['workflow_run', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.workflow_run.workflows, ['OPL Stable Release Bundle']);
  assert.deepEqual(workflow.on.workflow_run.types, ['completed']);
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.deepEqual(Object.keys(workflow.jobs), [
    'admit',
    'build-desktop-platforms',
    'append-desktop-platforms',
    'dispatch-full',
    'receipt',
    'repair-admit',
    'repair-additive',
  ]);
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), [
    'operation',
    'source_run_id',
    'repair_source_commit',
    'expected_old_asset_id',
    'expected_old_asset_digest',
    'operator_confirmation',
  ]);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.operation.options, ['repair_additive']);
  assert.doesNotMatch(source, /recovery_confirmation|skipped_followup/);
});

test('admission binds one published mutable Stable Release and the frozen Desktop selection', () => {
  const admit = workflow.jobs.admit;
  assert.match(admit.if.replace(/\s+/g, ' '), /workflow_run\.conclusion == 'success'/);
  assert.match(source, /opl-release-operation-admission-\$SOURCE_RUN_ID/);
  assert.match(source, /operation_kind=\$operation_kind/);
  assert.match(source, /applicable=\$applicable/);
  assert.match(source, /\.path == "\.github\/workflows\/release-stable\.yml"/);
  assert.match(source, /\.event == "workflow_dispatch"/);
  assert.match(source, /\.run_attempt == 1/);
  assert.match(source, /opl-release-standard-checkpoint-\$SOURCE_RUN_ID/);
  assert.match(source, /opl-release-standard-operation-checkpoint-\$SOURCE_RUN_ID/);
  assert.match(source, /\.desktop_additional_platforms/);
  assert.match(source, /test "\$platforms" = '\["linux-x64","windows-x64"\]'/);
  assert.match(source, /\.immutable == false/);
  assert.match(source, /releases\/latest/);
});

test('additional Desktop builds are build-only and authority-bound', () => {
  const build = workflow.jobs['build-desktop-platforms'];
  assert.equal(build.if, "${{ github.event_name == 'workflow_run' && needs.admit.outputs.applicable == 'true' }}");
  assert.equal(build.uses, './.github/workflows/build-manual.yml');
  assert.equal(build.with.invocation_mode, 'stable_release_set_build');
  assert.equal(build.with.platform_policy, 'stable_desktop_additional');
  assert.equal(build.with.platform_ids, '${{ needs.admit.outputs.desktop_platforms }}');
  assert.equal(build.with.source_bundle_digest, '${{ needs.admit.outputs.source_bundle_digest }}');
});

test('Desktop assets append to the same Release through one CAS controller', () => {
  const append = workflow.jobs['append-desktop-platforms'];
  assert.equal(append.if, "${{ github.event_name == 'workflow_run' && needs.admit.outputs.applicable == 'true' }}");
  assert.deepEqual(append.needs, ['admit', 'build-desktop-platforms']);
  assert.equal(append.environment, 'release-stable');
  assert.deepEqual(append.permissions, { contents: 'write', actions: 'read' });
  const setupIndex = append.steps.findIndex(
    (step: Record<string, unknown>) => step.name === 'Setup Node.js',
  );
  const installIndex = append.steps.findIndex(
    (step: Record<string, unknown>) => step.name === 'Install App root validation dependencies',
  );
  const materializeIndex = append.steps.findIndex(
    (step: Record<string, unknown>) => step.name === 'Materialize exact Desktop Release Set append',
  );
  assert.deepEqual(append.steps[setupIndex], {
    name: 'Setup Node.js',
    uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
    with: { 'node-version': '24' },
  });
  assert.equal(append.steps[installIndex].run, 'npm ci --ignore-scripts');
  assert.ok(setupIndex < installIndex && installIndex < materializeIndex);
  assert.match(source, /scripts\/append-stable-desktop-assets\.ts/);
  assert.match(source, /--release-id "\$\{\{ needs\.admit\.outputs\.release_id \}\}"/);
  assert.match(source, /--tag "\$\{\{ needs\.admit\.outputs\.release_tag \}\}"/);
  assert.match(source, /opl_app_desktop_release_set_manifest\.v1/);
  assert.match(source, /opl-desktop-platforms-manifest\.json/);
  assert.doesNotMatch(source, /gh release create|releases\/tags\/.*optional|make_latest/);
});

test('Full append starts only after Desktop append and binds exactly one new successful run', () => {
  const full = workflow.jobs['dispatch-full'];
  assert.equal(full.if, "${{ github.event_name == 'workflow_run' && needs.admit.outputs.applicable == 'true' }}");
  assert.deepEqual(full.needs, ['admit', 'append-desktop-platforms']);
  assert.equal(full['timeout-minutes'], 160);
  assert.deepEqual(full.permissions, { contents: 'read', actions: 'write' });
  assert.match(source, /prior_ids=/);
  assert.match(source, /prior \| index\(\$id\)/);
  assert.equal((source.match(/actions\/workflows\/release-stable\.yml\/dispatches/g) ?? []).length, 1);
  assert.match(source, /operation:"append_full"/);
  assert.match(source, /if ! gh api --paginate --slurp/);
  assert.match(source, /Full dispatch outcome is unknown; do not redispatch/);
  assert.match(source, /for _ in \$\(seq 1 840\)/);
  assert.match(source, /reconcile that run read-only and do not redispatch/);
  assert.match(source, /opl-release-full-published-\$\{full_run_id\}/);
  assert.doesNotMatch(source, /--rerun|rerun-failed|cancel\/|force/);
});

test('follow-up receipt is terminal only after Desktop and Full completion', () => {
  const receipt = workflow.jobs.receipt;
  assert.equal(receipt.if, "${{ always() && github.event_name == 'workflow_run' && needs.admit.result != 'skipped' }}");
  assert.deepEqual(receipt.needs, [
    'admit',
    'build-desktop-platforms',
    'append-desktop-platforms',
    'dispatch-full',
  ]);
  assert.match(source, /opl_app_stable_desktop_release_set_followup\.v2/);
  assert.match(source, /operation_kind:\$operation_kind/);
  assert.match(source, /applicable:\(\$applicable == "true"\)/);
  assert.match(source, /desktop_platform_append:\$desktop/);
  assert.match(source, /full_append:\$full/);
  assert.match(source, /full_run_id:\$full_run_id/);
  assert.match(source, /remaining:\(if .* then \[\] else \["followup_failure"\]/);
});

test('additive repair is one protected opl-install.sh compare-and-swap path', () => {
  const admit = workflow.jobs['repair-admit'];
  const repair = workflow.jobs['repair-additive'];
  assert.equal(admit.if, "${{ github.event_name == 'workflow_dispatch' && inputs.operation == 'repair_additive' }}");
  assert.equal(repair.if, "${{ needs.repair-admit.result == 'success' }}");
  assert.deepEqual(repair.needs, ['repair-admit']);
  assert.equal(repair.environment, 'release-stable');
  assert.deepEqual(repair.permissions, { contents: 'write', actions: 'read' });
  assert.match(source, /test "\$GITHUB_REF" = refs\/heads\/main/);
  assert.match(source, /test "\$OPERATOR_CONFIRMATION" = 'REPAIR ADDITIVE INSTALLER'/);
  assert.match(source, /opl-release-standard-remote-verify-\$SOURCE_RUN_ID/);
  assert.match(source, /live_installer=.*EXPECTED_OLD_ASSET_ID.*EXPECTED_OLD_ASSET_DIGEST/s);
  assert.match(source, /expected_old_size=.*\.size <<<"\$live_installer"/);
  assert.doesNotMatch(source, /original_installer=.*terminal/s);
  assert.match(source, /generate-frozen-universal-installer\.ts/);
  assert.match(source, /jq -e 'select\(length == 5 and \(\[\.\[\]\.name\] \| length == \(unique \| length\)\)\)'/);
  assert.doesNotMatch(source, /jq -e 'length == 5 and \(\[\.\[\]\.name\] \| length == \(unique \| length\)\)'/);
  assert.match(source, /--repair-additive/);
  assert.match(source, /--expected-old-asset-id/);
  assert.match(source, /--expected-old-asset-digest/);
  assert.match(source, /opl-stable-additive-repair-plan-/);
  assert.match(source, /opl-stable-additive-repair-/);
  assert.doesNotMatch(source, /--clobber|gh run rerun|gh run cancel/);
});
