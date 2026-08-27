import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

const appRoot = path.resolve(import.meta.dirname, '../..');
const workflowPath = path.join(appRoot, '.github/workflows/release-stable-post-success-followups.yml');
const platformWorkflowPath = path.join(appRoot, '.github/workflows/_release-desktop-platform-addon.yml');
const source = fs.readFileSync(workflowPath, 'utf8');
const platformSource = fs.readFileSync(platformWorkflowPath, 'utf8');
const workflow = parseYaml(source) as Record<string, any>;
const platformWorkflow = parseYaml(platformSource) as Record<string, any>;

test('one Stable follow-up hub owns routing while each side effect remains an independent lane', () => {
  assert.equal(workflow.name, 'OPL Stable Follow-ups');
  assert.deepEqual(Object.keys(workflow.on), ['workflow_run', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.workflow_run.workflows, ['OPL Stable Release Bundle']);
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.equal(workflow.concurrency, undefined);
  assert.deepEqual(Object.keys(workflow.jobs), [
    'route',
    'observe',
    'reconcile-full-addon',
    'publish-standard-cask',
    'resolve-homebrew-full',
    'publish-homebrew-full',
    'admit',
    'reconcile-desktop-platforms',
    'receipt',
    'repair-admit',
    'repair-additive',
  ]);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.operation.options, [
    'reconcile_full_addon',
    'reconcile_homebrew_standard',
    'reconcile_homebrew_full',
    'reconcile_desktop_platform',
    'repair_additive',
  ]);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.desktop_platform.options, [
    'linux-x64',
    'windows-x64',
  ]);
  for (const input of ['repair_source_commit', 'expected_old_asset_id', 'expected_old_asset_digest', 'operator_confirmation']) {
    assert.equal(workflow.on.workflow_dispatch.inputs[input].required, false);
  }
  for (const retired of [
    'release-attempt-observability.yml',
    'release-full-addon-follower.yml',
    'release-homebrew-standard-follower.yml',
    'release-homebrew-full-follower.yml',
  ]) {
    assert.equal(fs.existsSync(path.join(appRoot, '.github/workflows', retired)), false);
  }
});

test('automatic routing does not couple independent follower outcomes', () => {
  const route = workflow.jobs.route;
  assert.deepEqual(Object.keys(route.outputs), [
    'source_run_id',
    'source_operation',
    'observe',
    'full_addon',
    'homebrew_standard',
    'homebrew_full',
    'desktop_platforms',
    'repair_additive',
  ]);
  assert.equal(workflow.jobs.observe.if, "${{ needs.route.outputs.observe == 'true' }}");
  assert.equal(workflow.jobs['reconcile-full-addon'].if, "${{ needs.route.outputs.full_addon == 'true' }}");
  assert.equal(workflow.jobs['publish-standard-cask'].if, "${{ needs.route.outputs.homebrew_standard == 'true' }}");
  assert.equal(workflow.jobs['resolve-homebrew-full'].if, "${{ needs.route.outputs.homebrew_full == 'true' }}");
  assert.equal(workflow.jobs.admit.if, "${{ needs.route.outputs.desktop_platforms == 'true' }}");
  assert.equal(workflow.jobs['repair-admit'].if, "${{ needs.route.outputs.repair_additive == 'true' }}");
  assert.deepEqual(workflow.jobs['publish-homebrew-full'].needs, ['resolve-homebrew-full']);
  assert.equal(workflow.jobs['publish-homebrew-full'].uses, './.github/workflows/_release-homebrew-full-publish.yml');
});

test('admission binds the exact published mutable Stable source without requiring Latest', () => {
  const admit = workflow.jobs.admit;
  const sourceStep = admit.steps.find((step: Record<string, any>) => step.name === 'Validate successful Stable source run');
  assert.equal(admit.if, "${{ needs.route.outputs.desktop_platforms == 'true' }}");
  assert.equal(
    sourceStep.env.SOURCE_HEAD_SHA,
    "${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || '' }}",
  );
  assert.match(source, /opl-release-operation-admission-\$SOURCE_RUN_ID/);
  assert.match(source, /opl-release-standard-checkpoint-\$SOURCE_RUN_ID/);
  assert.match(source, /opl-release-standard-operation-checkpoint-\$SOURCE_RUN_ID/);
  assert.match(source, /\.desktop_additional_platforms/);
  assert.match(source, /platforms="\$\(jq -cn --arg platform/);
  assert.match(source, /\.immutable == false/);
  assert.doesNotMatch(source, /releases\/latest/);
});

test('Linux and Windows build and append independently with only public mutation globally locked', () => {
  const reconcile = workflow.jobs['reconcile-desktop-platforms'];
  assert.equal(reconcile.strategy['fail-fast'], false);
  assert.equal(reconcile.strategy.matrix.platform_id, '${{ fromJSON(needs.admit.outputs.desktop_platforms) }}');
  assert.match(reconcile.concurrency.group, /matrix\.platform_id/);
  assert.equal(reconcile.uses, './.github/workflows/_release-desktop-platform-addon.yml');

  assert.deepEqual(Object.keys(platformWorkflow.jobs), ['build-platform', 'append-platform', 'receipt']);
  assert.equal(platformWorkflow.jobs['build-platform'].uses, './.github/workflows/build-manual.yml');
  assert.match(platformWorkflow.jobs['build-platform'].with.platform_ids, /inputs\.platform_id/);
  const append = platformWorkflow.jobs['append-platform'];
  assert.deepEqual(append.needs, ['build-platform']);
  assert.equal(append.environment, 'release-stable');
  assert.equal(append.concurrency.group, 'opl-release-bundle-global');
  assert.deepEqual(append.permissions, { contents: 'write', actions: 'read' });
  const install = append.steps.find(
    (step: Record<string, any>) => step.name === 'Install App release tooling dependencies',
  );
  const installIndex = platformSource.indexOf('name: Install App release tooling dependencies');
  const materializeIndex = platformSource.indexOf('name: Materialize one exact Desktop platform append');
  assert.equal(install.run, 'npm ci --ignore-scripts --no-audit --no-fund');
  assert.notEqual(installIndex, -1);
  assert.ok(installIndex < materializeIndex);
  assert.match(platformSource, /--platform-manifest desktop-platform-manifest\.json/);
  assert.match(platformSource, /opl_app_desktop_platform_manifest\.v1/);
  assert.match(platformSource, /opl-stable-desktop-append-\$\{\{ inputs\.source_run_id \}\}-\$\{\{ inputs\.platform_id \}\}/);
});

test('aggregate manifest is the last platform append and no Desktop lane owns Full or Latest', () => {
  assert.match(platformSource, /Append or reconcile only this Desktop platform/);
  assert.match(platformSource, /scripts\/append-stable-desktop-assets\.ts/);
  assert.doesNotMatch(source + platformSource, /operation:"append_full"|release-stable\.yml\/dispatches/);
  assert.doesNotMatch(source + platformSource, /gh release create|make_latest/);
});

test('Desktop receipt reports the selected platform set without becoming a Standard gate', () => {
  const receipt = workflow.jobs.receipt;
  assert.equal(receipt.if, "${{ always() && needs.admit.result == 'success' }}");
  assert.deepEqual(receipt.needs, ['admit', 'reconcile-desktop-platforms']);
  assert.match(source, /opl_app_stable_desktop_followup\.v1/);
  assert.match(source, /platform_reconcile:\$result/);
  assert.match(source, /required_for_standard_or_latest:false/);
});

test('additive installer repair remains one same-tag protected compare-and-swap path', () => {
  const admit = workflow.jobs['repair-admit'];
  const repair = workflow.jobs['repair-additive'];
  assert.equal(admit.if, "${{ needs.route.outputs.repair_additive == 'true' }}");
  assert.equal(repair.if, "${{ needs.repair-admit.result == 'success' }}");
  assert.equal(repair.concurrency.group, 'opl-release-bundle-global');
  assert.deepEqual(repair.permissions, { contents: 'write', actions: 'read' });
  assert.match(source, /test "\$OPERATOR_CONFIRMATION" = 'REPAIR ADDITIVE INSTALLER'/);
  assert.match(source, /--repair-additive/);
  assert.match(source, /--expected-old-asset-id/);
  assert.doesNotMatch(source, /--clobber|gh run rerun|gh run cancel/);
});
