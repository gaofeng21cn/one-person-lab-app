import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

const appRoot = path.resolve(import.meta.dirname, '../..');
const workflowPath = path.join(appRoot, '.github', 'workflows', 'release-source-qualification.yml');

test('source qualification is a reusable GitHub-hosted Stable preflight', () => {
  const source = fs.readFileSync(workflowPath, 'utf8');
  const workflow = parseYaml(source) as Record<string, any>;
  assert.deepEqual(Object.keys(workflow.on).sort(), ['workflow_call', 'workflow_dispatch']);
  assert.equal(
    workflow.on.workflow_call.inputs.operation_scope.default,
    'stable_operation_source_preflight',
  );
  assert.equal(
    workflow.on.workflow_call.outputs.receipt_digest.value,
    '${{ jobs.qualify.outputs.receipt_digest }}',
  );
  assert.equal(workflow.on.workflow_call.outputs.app_ref.value, '${{ jobs.qualify.outputs.app_ref }}');
  assert.equal(workflow.on.workflow_call.outputs.shell_ref.value, '${{ jobs.qualify.outputs.shell_ref }}');
  assert.equal(
    workflow.on.workflow_call.outputs.framework_ref.value,
    '${{ jobs.qualify.outputs.framework_ref }}',
  );
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.deepEqual(Object.keys(workflow.jobs), [
    'resolve-cohort',
    'source-contract-build-preflight',
    'qualify',
  ]);
  assert.equal(workflow.jobs['resolve-cohort']['runs-on'], 'ubuntu-latest');
  assert.equal(
    workflow.jobs['source-contract-build-preflight'].uses,
    './.github/workflows/_build-reusable.yml',
  );
  assert.equal(
    workflow.jobs['source-contract-build-preflight'].with.require_macos_gatekeeper,
    false,
  );
  assert.match(
    String(workflow.jobs['source-contract-build-preflight'].with.matrix),
    /"os":"ubuntu-latest"/,
  );
  assert.equal(workflow.jobs.qualify.environment, undefined);
  assert.deepEqual(workflow.jobs.qualify.permissions, { contents: 'read', actions: 'read' });
  assert.equal(workflow.jobs.qualify['runs-on'], 'ubuntu-latest');
  assert.match(source, /test "\$GITHUB_RUN_ATTEMPT" = 1/);
  assert.match(source, /test "\$GITHUB_REF" = refs\/heads\/main/);
  assert.match(source, /git ls-remote --exit-code --heads "\$remote" refs\/heads\/main/);
  assert.match(source, /resolve_main_wire "\$shell_repository"/);
  assert.match(source, /resolve_main_wire gaofeng21cn\/one-person-lab/);
  assert.match(source, /for attempt in 1 2 3/);
  assert.doesNotMatch(source, /repos\/gaofeng21cn\/(?:opl-aion-shell|one-person-lab)\/commits\/main/);
  assert.match(source, /build_invocation_count: 1/);
  assert.match(source, /formal_candidate_build_count: 0/);
  assert.match(source, /self_hosted_invocation_count: 0/);
  assert.match(source, /tart_vm_invocation_count: 0/);
  assert.match(source, /source-contract-build-preflight\.json/);
  assert.match(source, /source-qualification-receipt\.ts create/);
  assert.match(source, /--operation-scope "\$OPERATION_SCOPE"/);
  assert.match(source, /validate-source-qualification-receipt\.ts/);
  assert.match(source, /name: opl-source-qualification-\$\{\{ github\.run_id \}\}/);
  assert.doesNotMatch(source, /runs-on:[^\n]*self-hosted|opl-first-run-tart-smoke|tart list/i);
  assert.doesNotMatch(source, /secrets\./);
  assert.doesNotMatch(source, /contents: write|packages: write|id-token: write/);
  assert.doesNotMatch(source, /release create|release upload|github-activate-latest|make_latest|brew bump-cask-pr/);
});

test('source qualification uploads only receipt and hosted preflight evidence', () => {
  const workflow = parseYaml(fs.readFileSync(workflowPath, 'utf8')) as Record<string, any>;
  const upload = workflow.jobs.qualify.steps.find(
    (step: Record<string, unknown>) => step.name === 'Upload immutable source preflight evidence',
  );
  const paths = String(upload.with.path);
  assert.match(paths, /source-qualification-receipt\.json/);
  assert.match(paths, /source-contract-build-preflight\.json/);
  assert.match(paths, /source-preflight-cohort\.json/);
  assert.doesNotMatch(paths, /\.dmg|tart|vm-closeout/i);
});
