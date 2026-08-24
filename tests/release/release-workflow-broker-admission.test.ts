import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';
import { stableReleaseActionPaths } from '../../scripts/validate-release-boundary/text-check-runner.ts';

const workflowRoot = path.join(process.cwd(), '.github', 'workflows');
const readWorkflow = (name: string) => fs.readFileSync(path.join(workflowRoot, name), 'utf8');
const parseWorkflow = (name: string) => parseYaml(readWorkflow(name));

test('Stable has one dispatch and exactly three Framework Bundle operations', () => {
  const source = readWorkflow('release-stable.yml');
  const workflow = parseWorkflow('release-stable.yml');
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.operation.options, [
    'standard',
    'resume_standard',
    'append_full',
  ]);
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs).sort(), [
    'app_ref',
    'authority_carrier',
    'authority_digest',
    'authority_id',
    'desktop_additional_platforms',
    'entry',
    'framework_ref',
    'include_full',
    'operation',
    'operation_id',
    'prior_full_artifact_run_id',
    'prior_standard_artifact_run_id',
    'product_change_summary',
    'release_intent',
    'shell_ref',
    'smoke_harness_ref',
    'source_artifact',
    'source_run_id',
    'studio_sha',
    'studio_tag',
    'studio_tree',
    'version',
  ]);
  assert.match(source, /test "\$GITHUB_RUN_ATTEMPT" = 1/);
  assert.doesNotMatch(source, /broker|session|pre_api_admission|release_mutation_payload/i);
  assert.doesNotMatch(source, /gh run rerun|gh run cancel/);
});

test('Stable serializes only public mutation jobs and never locks admission', () => {
  const workflow = parseWorkflow('release-stable.yml');
  const mutationMutex = { group: 'opl-release-bundle-global', 'cancel-in-progress': false };
  assert.equal(workflow.concurrency, undefined);
  assert.equal(workflow.jobs.admission.concurrency, undefined);
  assert.equal(workflow.jobs['protected-operation-admission'].concurrency, undefined);
  assert.deepEqual(workflow.jobs['resume-standard'].concurrency, mutationMutex);
  assert.deepEqual(
    parseWorkflow('_release-bundle.yml').jobs['publish-standard'].concurrency,
    mutationMutex,
  );
  assert.deepEqual(
    parseWorkflow('_release-full-addon.yml').jobs['publish-full'].concurrency,
    mutationMutex,
  );
  assert.deepEqual(workflow.jobs.admission.permissions, { contents: 'read', actions: 'read' });
  assert.equal(workflow.jobs['protected-operation-admission'].environment, 'release-stable');
  assert.deepEqual(workflow.jobs['protected-operation-admission'].permissions, { contents: 'read', actions: 'read' });
});

test('the three operation jobs are step-free reusable calls behind admission', () => {
  const jobs = parseWorkflow('release-stable.yml').jobs;
  const expected = {
    standard: './.github/workflows/_release-bundle.yml',
    'resume-standard': './.github/workflows/_release-standard-publish.yml',
    'append-full': './.github/workflows/_release-full-addon.yml',
  };
  for (const [jobId, reusable] of Object.entries(expected)) {
    assert.deepEqual(
      jobs[jobId].needs,
      jobId === 'standard'
        ? ['admission', 'protected-operation-admission', 'stable-admission-manifest']
        : ['admission'],
    );
    assert.equal(jobs[jobId].uses, reusable);
    assert.equal(jobs[jobId].steps, undefined);
    assert.equal(jobs[jobId].secrets, 'inherit');
  }
});

test('legacy broker workflows stay absent while compatibility is historical read-only', () => {
  const release = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'contracts/app-release-channel.json'), 'utf8'));
  const legacy = release.release_bundle_control_plane.legacy_compatibility;
  assert.equal(legacy.authority_class, 'historical_read_only');
  assert.equal(legacy.broker_session_operator_authority, 'historical_read_only');
  for (const name of [
    'desktop-release.yml',
    'desktop-release-promote.yml',
    'desktop-release-full-addon.yml',
    'desktop-release-cleanup-drafts.yml',
  ]) {
    assert.equal(fs.existsSync(path.join(process.cwd(), '.github', 'workflows', name)), false);
  }
});

test('new low-level qualification call edges have no live broker admission dependency', () => {
  const forbiddenInputs = new Set([
    'pre_api_admission_receipt_base64',
    'release_mutation_payload_sha256',
    'broker_admission_validation_sha256',
    'release_mutation',
    'release_workflow',
  ]);
  for (const name of ['_release-bundle.yml', '_release-standard-publish.yml', '_release-full-addon.yml']) {
    const jobs = parseWorkflow(name).jobs;
    for (const job of Object.values(jobs) as Array<any>) {
      for (const key of Object.keys(job.with ?? {})) {
        assert.equal(forbiddenInputs.has(key), false, `${name}:${key}`);
      }
    }
  }
  for (const name of ['opl-first-run-vm.yml', 'full-first-install-release.yml']) {
    const jobs = parseWorkflow(name).jobs;
    const admission = (Object.values(jobs) as Array<any>)
      .flatMap((job) => job.steps ?? [])
      .find((step) => /Admit one-shot release-bound/.test(step.name ?? ''));
    assert.ok(admission, `${name} admission step`);
    assert.doesNotMatch(admission.run, /broker|pre_api_admission|release_mutation_payload/i, name);
  }
});

test('reusable first-run VM does not request OIDC write permission', () => {
  const vm = readWorkflow('opl-first-run-vm.yml');
  assert.doesNotMatch(vm, /id-token:\s*write/);
  const document = parseWorkflow('opl-first-run-vm.yml');
  assert.deepEqual(document.jobs['validate-vm-inputs'].permissions, { contents: 'read', actions: 'read' });
});

test('the complete Stable action DAG pins external Actions to immutable commits', () => {
  for (const relativePath of stableReleaseActionPaths) {
    const document = parseYaml(fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8'));
    const steps = relativePath.includes('/actions/')
      ? document.runs.steps
      : Object.values(document.jobs).flatMap((job: any) => job.steps ?? []);
    for (const step of steps) {
      if (typeof step.uses !== 'string' || step.uses.startsWith('./')) continue;
      assert.match(step.uses, /@[0-9a-f]{40}$/, `${relativePath}: ${step.uses}`);
    }
  }
});
