import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import YAML from 'yaml';

const appRoot = path.resolve(import.meta.dirname, '../..');
const workflowPath = path.join(appRoot, '.github/workflows/release-post-publication-certification.yml');

function readWorkflow(): { source: string; workflow: Record<string, any> } {
  const source = fs.readFileSync(workflowPath, 'utf8');
  return { source, workflow: YAML.parse(source) };
}

test('Desktop Release Set certification follows the one Stable follow-up hub', () => {
  const { source, workflow } = readWorkflow();
  assert.deepEqual(Object.keys(workflow.on), ['workflow_run', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.workflow_run.workflows, ['OPL Stable Follow-ups']);
  assert.deepEqual(workflow.on.workflow_run.types, ['completed']);
  assert.deepEqual(Object.keys(workflow.jobs), [
    'resolve-release-set',
    'certify-linux-x64',
    'admit-macos-vm',
    'certify-standard-vm',
    'receipt',
  ]);
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.doesNotMatch(source, /optional[_-]platform|adjunct|release-stable-optional-existing-base/);
  assert.doesNotMatch(source, /contents: write|packages: write|gh release (?:create|edit|upload|delete)/);
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), [
    'operation', 'source_run_id', 'followup_run_id', 'verification_source_commit', 'operator_confirmation',
  ]);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.operation.options, ['verify_existing_repair']);
  assert.match(source, /VERIFY EXISTING ADDITIVE REPAIR/);
  assert.match(source, /existing_repair_verification/);
  assert.match(source, /current-main\.json/);
  assert.match(source, /followup_run_id/);
});

test('non-Desktop Stable operations complete certification as not applicable', () => {
  const { source, workflow } = readWorkflow();
  const resolve = workflow.jobs['resolve-release-set'];
  assert.equal(resolve.outputs.applicable, '${{ steps.authority.outputs.applicable }}');
  assert.equal(resolve.outputs.reason_code, '${{ steps.authority.outputs.reason_code }}');
  assert.equal(resolve.outputs.certification_kind, '${{ steps.authority.outputs.certification_kind }}');
  assert.equal(resolve.outputs.source_run_id, '${{ steps.authority.outputs.source_run_id }}');
  assert.match(source, /source_run_not_successful/);
  assert.match(source, /source_operation_append_full/);
  assert.match(source, /opl-stable-followup-route-\$source_run_id/);
  assert.match(source, /opl-release-operation-admission-\$source_run_id/);
  assert.ok(
    source.indexOf('opl-stable-followup-route-$source_run_id') <
      source.indexOf('opl-release-operation-admission-$source_run_id'),
    'the typed follow-up route must gate the source admission download',
  );
  assert.doesNotMatch(source, /display_title \| startswith\("OPL Stable standard/);
  assert.match(
    source,
    /status:\(if \$applicable != "true" then "not_applicable" elif \$kind == "repair_additive" and \$linux != "success" then "failed" else "complete" end\)/,
  );

  for (const stepName of [
    'Download exact Release Set follow-up receipt',
    'Download exact Desktop append receipt',
    'Bind completed follow-up identity',
    'Bind one public Desktop Release Set',
  ]) {
    const step = resolve.steps.find((candidate: Record<string, unknown>) => candidate.name === stepName);
    assert.equal(step.if, "${{ steps.authority.outputs.applicable == 'true' && steps.authority.outputs.certification_kind == 'desktop_release_set' }}");
  }

  assert.equal(
    workflow.jobs['certify-linux-x64'].if,
    "${{ needs.resolve-release-set.outputs.applicable == 'true' }}",
  );
  assert.equal(
    workflow.jobs['admit-macos-vm'].if,
    "${{ needs.resolve-release-set.outputs.applicable == 'true' && needs.resolve-release-set.outputs.certify_macos == 'true' }}",
  );
});

test('Linux certification consumes the exact public same-tag Desktop assets', () => {
  const { source, workflow } = readWorkflow();
  const resolve = workflow.jobs['resolve-release-set'];
  const linux = workflow.jobs['certify-linux-x64'];
  assert.deepEqual(linux.needs, ['resolve-release-set']);
  assert.equal(linux['runs-on'], 'ubuntu-latest');
  assert.equal(linux.permissions, undefined);
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.match(resolve.outputs.linux_artifact_name, /steps\.repair_identity\.outputs\.linux_artifact_name/);
  assert.match(resolve.outputs.linux_artifact_digest, /steps\.repair_identity\.outputs\.linux_artifact_digest/);
  assert.match(source, /opl-desktop-platforms-manifest\.json/);
  assert.match(source, /releases\/download\/\$\{RELEASE_TAG\}/);
  assert.match(source, /opl_app_linux_same_tag_desktop_install\.v1/);
  assert.match(source, /linux-x64-same-tag-install\.json/);
  assert.match(source, /rebuilt:false/);
  assert.equal(source.includes("dpkg-query -W -f='${Version}'"), true);
  assert.equal(source.includes("dpkg-query -W -f='${Architecture}'"), true);
  assert.equal(source.includes("dpkg-query -W -f='\\${Version}'"), false);
  assert.equal(source.includes("dpkg-query -W -f='\\${Architecture}'"), false);
});

test('Desktop macOS certification remains read-only and Standard-only', () => {
  const { workflow } = readWorkflow();
  const certify = workflow.jobs['certify-standard-vm'];
  assert.deepEqual(certify.needs, ['resolve-release-set', 'admit-macos-vm']);
  assert.equal(certify.uses, './.github/workflows/opl-first-run-vm.yml');
  assert.deepEqual(certify.permissions, { contents: 'read', actions: 'read' });
  assert.equal(certify.with.release_tag, '${{ needs.resolve-release-set.outputs.tag }}');
  assert.equal(certify.with.package_profile, 'standard');
  assert.equal(workflow.jobs['certify-full-vm'], undefined);
});

test('additive repair certification binds public receipt and old/new installer digests', () => {
  const { source, workflow } = readWorkflow();
  const resolve = workflow.jobs['resolve-release-set'];
  for (const stepName of [
    'Download exact additive repair receipt',
    'Download original Stable source bundle',
    'Bind public additive repair and installer digest chain',
  ]) {
    const step = resolve.steps.find((candidate: Record<string, unknown>) => candidate.name === stepName);
    assert.equal(step.if, "${{ steps.authority.outputs.applicable == 'true' && steps.authority.outputs.certification_kind == 'repair_additive' }}");
  }
  assert.match(source, /certification_kind=repair_additive/);
  assert.match(source, /cmp "\$receipt" public-repair-receipt\.json/);
  assert.match(source, /\.replacement\.previous\.digest != \.replacement\.next\.digest/);
  assert.match(source, /installer_digest_chain/);
  assert.match(source, /then \["linux_clean_install"\] else \[\] end/);
  assert.match(source, /Require clean Linux certification for additive installer repair/);
  assert.equal(
    workflow.jobs['admit-macos-vm'].if,
    "${{ needs.resolve-release-set.outputs.applicable == 'true' && needs.resolve-release-set.outputs.certify_macos == 'true' }}",
  );
});
