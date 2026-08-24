import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

const appRoot = process.cwd();
const workflowPath = path.join(appRoot, '.github/workflows/release-diagnostics.yml');

type WorkflowStep = {
  env?: Record<string, string>;
  name?: string;
  if?: string;
  run?: string;
  uses?: string;
  with?: Record<string, string>;
};

const version = '26.7.18';
const runId = '123456';
const repo = 'gaofeng21cn/one-person-lab-app';

function releaseDiagnosticSteps(): WorkflowStep[] {
  const workflow = YAML.parse(fs.readFileSync(workflowPath, 'utf8'));
  return workflow.jobs['release-diagnostics'].steps;
}

test('release diagnostics is manually invokable without Stable mutation authority', () => {
  const workflow = YAML.parse(fs.readFileSync(workflowPath, 'utf8'));

  assert.deepEqual(Object.keys(workflow.on).sort(), ['workflow_call', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.diagnostic.options, [
    'desktop',
    'apple_credentials',
    'timestamp_authority',
  ]);
  assert.ok(workflow.on.workflow_dispatch.inputs.opl_version);
  assert.ok(workflow.on.workflow_dispatch.inputs.run_vm_diagnostic);
  assert.ok(workflow.on.workflow_dispatch.inputs.build_standard_artifact);
  assert.ok(workflow.on.workflow_call.inputs.framework_ref);
  assert.ok(workflow.on.workflow_dispatch.inputs.framework_ref);
  assert.deepEqual(workflow.permissions, { actions: 'read', contents: 'read' });

  const source = fs.readFileSync(workflowPath, 'utf8');
  assert.doesNotMatch(source, /contents:\s*write|packages:\s*write/);
  assert.doesNotMatch(source, /gh release (?:create|upload|edit)/);
  assert.equal(fs.existsSync(path.join(appRoot, '.github/workflows/desktop-release-diagnostics.yml')), false);
  assert.equal(fs.existsSync(path.join(appRoot, '.github/workflows/release-apple-credentials-preflight.yml')), false);
  assert.equal(fs.existsSync(path.join(appRoot, '.github/workflows/release-timestamp-authority-diagnostic.yml')), false);
});

test('Standard VM diagnostics require and inject an exact Framework SHA', () => {
  const workflow = YAML.parse(fs.readFileSync(workflowPath, 'utf8'));
  const validation = workflow.jobs['diagnostic-inputs'].steps.find(
    (step: WorkflowStep) => step.name === 'Validate diagnostic input combinations',
  );

  assert.deepEqual(validation?.env, {
    OPL_VERSION: '${{ inputs.opl_version }}',
    RUN_VM_DIAGNOSTIC: '${{ inputs.run_vm_diagnostic }}',
    PACKAGE_PROFILE: '${{ inputs.package_profile }}',
    FRAMEWORK_REF: '${{ inputs.framework_ref }}',
  });
  assert.match(validation?.run ?? '', /RUN_VM_DIAGNOSTIC/);
  assert.match(validation?.run ?? '', /PACKAGE_PROFILE/);
  assert.match(validation?.run ?? '', /FRAMEWORK_REF/);
  assert.match(validation?.run ?? '', /\^\[0-9a-f\]\{40\}\$/);
  assert.match(validation?.run ?? '', /Standard VM diagnostics require framework_ref/);

  for (const jobId of [
    'standard-dmg-diagnostic-artifact',
    'vm-harness-diagnostics-standard-artifact',
    'vm-harness-diagnostics-release-asset',
  ]) {
    assert.equal(workflow.jobs[jobId].with.framework_ref, '${{ inputs.framework_ref }}');
  }
});

function writeFile(root: string, relativePath: string, bytes: string): Buffer {
  const payload = Buffer.from(bytes);
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, payload);
  return payload;
}

function writeCompleteGeneration(root: string) {
  const generationId = 'urn:uuid:11111111-1111-4111-8111-111111111111';
  const generation = { id: generationId };
  const outputs = [
    ['closeout_summary', 'release-diagnostics/release-closeout.json', JSON.stringify({
      version,
      release_repo: repo,
      run: { id: runId },
      output_generation: generation,
    })],
    ['closeout_markdown', 'release-diagnostics/release-closeout.md', `Generation: ${generationId}`],
    ['release_monitor', 'release-diagnostics/release-monitor.json', JSON.stringify({ output_generation: generation })],
    ['release_notification', 'release-diagnostics/release-notification.json', JSON.stringify({ output_generation: generation })],
  ] as const;
  const descriptors = outputs.map(([role, relativePath, content]) => {
    const bytes = writeFile(root, relativePath, content);
    return {
      role,
      path: relativePath,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      size_bytes: bytes.byteLength,
    };
  });
  writeFile(root, 'release-diagnostics/release-actions-timing.json', '{}');
  writeFile(root, 'release-diagnostics/release-actions-timing.md', 'timing');
  writeFile(root, 'release-diagnostics/release-closeout-completion.json', JSON.stringify({
    schema: 'opl_release_closeout_completion_manifest.v1',
    status: 'complete',
    authority: 'diagnostics_only',
    mutation_authorized: false,
    required_output_count: 4,
    completed_output_count: 4,
    generation,
    outputs: descriptors,
  }));
}

function embeddedVerifierProgram(): string {
  const verify = releaseDiagnosticSteps().find((step) => step.name === 'Verify complete release diagnostics generation');
  assert.ok(verify?.run);
  const match = verify.run.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE/);
  assert.ok(match, 'workflow must contain the inline Node verifier');
  return match[1];
}

function runEmbeddedVerifier(root: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', embeddedVerifierProgram()], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      OPL_RELEASE_VERSION: version,
      OPL_RELEASE_RUN_ID: runId,
      OPL_RELEASE_REPO: repo,
      ...env,
    },
  });
}

test('release diagnostics seals one complete generation before uploading it', () => {
  const steps = releaseDiagnosticSteps();
  const timingIndex = steps.findIndex((step) => step.name === 'Build GitHub Actions timing diagnostics');
  const closeoutIndex = steps.findIndex((step) => step.name === 'Build release closeout diagnostics and completion manifest');
  const verifyIndex = steps.findIndex((step) => step.name === 'Verify complete release diagnostics generation');
  const uploadIndex = steps.findIndex((step) => step.name === 'Upload release diagnostics');

  assert.ok(timingIndex >= 0 && timingIndex < closeoutIndex, 'closeout completion must be generated after timing diagnostics');
  assert.ok(closeoutIndex < verifyIndex && verifyIndex < uploadIndex, 'the completed generation must be verified before upload');

  const closeout = steps[closeoutIndex];
  assert.match(closeout.run ?? '', /--completion-manifest release-diagnostics\/release-closeout-completion\.json/);

  const verify = steps[verifyIndex];
  assert.match(verify.run ?? '', /opl_release_closeout_completion_manifest\.v1/);
  assert.match(verify.run ?? '', /manifest\.authority !== 'diagnostics_only'/);
  assert.match(verify.run ?? '', /manifest\.mutation_authorized !== false/);
  assert.match(verify.run ?? '', /manifest\.required_output_count !== expectedOutputs\.size/);
  assert.match(verify.run ?? '', /summary\.version !== process\.env\.OPL_RELEASE_VERSION/);
  assert.match(verify.run ?? '', /summary\.release_repo !== process\.env\.OPL_RELEASE_REPO/);
  assert.match(verify.run ?? '', /String\(summary\.run\?\.id\) !== process\.env\.OPL_RELEASE_RUN_ID/);
  assert.match(verify.run ?? '', /crypto\.createHash\('sha256'\)/);
  for (const output of [
    'release-closeout.json',
    'release-closeout.md',
    'release-monitor.json',
    'release-notification.json',
  ]) {
    assert.match(verify.run ?? '', new RegExp(`release-diagnostics/${output.replace('.', '\\.')}`));
  }
  assert.match(verify.run ?? '', /release-diagnostics\/release-actions-timing\.json/);
  assert.match(verify.run ?? '', /release-diagnostics\/release-actions-timing\.md/);

  const upload = steps[uploadIndex];
  assert.equal(upload.if, '${{ success() }}');
  assert.equal(upload.uses, 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a');
  const uploadedPaths = (upload.with?.path ?? '').trim().split('\n');
  assert.deepEqual(uploadedPaths.slice(-5), [
    'release-diagnostics/release-closeout.json',
    'release-diagnostics/release-closeout.md',
    'release-diagnostics/release-monitor.json',
    'release-diagnostics/release-notification.json',
    'release-diagnostics/release-closeout-completion.json',
  ]);
  assert.equal(uploadedPaths.at(-1), 'release-diagnostics/release-closeout-completion.json');
  assert.equal(upload.with?.['if-no-files-found'], 'error');
});

test('embedded diagnostics verifier rejects missing, tampered, or misbound output before upload', () => {
  const validRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-diagnostics-valid-'));
  writeCompleteGeneration(validRoot);
  const valid = runEmbeddedVerifier(validRoot);
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);

  for (const relativePath of [
    'release-diagnostics/release-closeout.json',
    'release-diagnostics/release-closeout.md',
    'release-diagnostics/release-monitor.json',
    'release-diagnostics/release-notification.json',
    'release-diagnostics/release-actions-timing.json',
    'release-diagnostics/release-actions-timing.md',
  ]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-diagnostics-missing-'));
    writeCompleteGeneration(root);
    fs.rmSync(path.join(root, relativePath));
    const result = runEmbeddedVerifier(root);
    assert.notEqual(result.status, 0, `${relativePath} must be required`);
  }

  const tamperedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-diagnostics-tampered-'));
  writeCompleteGeneration(tamperedRoot);
  fs.appendFileSync(path.join(tamperedRoot, 'release-diagnostics/release-monitor.json'), '\n');
  assert.notEqual(runEmbeddedVerifier(tamperedRoot).status, 0);

  const misboundRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-diagnostics-misbound-'));
  writeCompleteGeneration(misboundRoot);
  const misbound = runEmbeddedVerifier(misboundRoot, { OPL_RELEASE_VERSION: '26.7.19' });
  assert.notEqual(misbound.status, 0);
});
