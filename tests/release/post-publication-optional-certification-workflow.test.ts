import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

const appRoot = path.resolve(import.meta.dirname, '../..');
const workflowPath = path.join(
  appRoot,
  '.github',
  'workflows',
  'release-post-publication-certification.yml',
);
const vmWorkflowPath = path.join(appRoot, '.github', 'workflows', 'opl-first-run-vm.yml');

function readWorkflow(filePath: string): { source: string; workflow: Record<string, any> } {
  const source = fs.readFileSync(filePath, 'utf8');
  return { source, workflow: parseYaml(source) as Record<string, any> };
}

function workflowStep(workflow: Record<string, any>, jobName: string, stepName: string) {
  const step = workflow.jobs[jobName].steps.find((candidate: Record<string, any>) => candidate.name === stepName);
  assert.ok(step, `missing ${jobName}/${stepName}`);
  return step as Record<string, any>;
}

function runDiagnosticNormalization(
  workflow: Record<string, any>,
  overrides: Partial<Record<string, string>> = {},
) {
  const step = workflowStep(workflow, 'validate-vm-inputs', 'Normalize diagnostic inputs');
  const script = String(step.run).replaceAll('${{ inputs.homebrew_candidate_artifact }}', '');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-post-publication-normalize-'));
  const output = path.join(root, 'github-output.txt');
  try {
    return spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', script], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: 'workflow_call',
        GITHUB_SHA: 'a'.repeat(40),
        GITHUB_OUTPUT: output,
        PACKAGE_PROFILE: 'standard',
        SHELL_REF_INPUT: 'b'.repeat(40),
        SMOKE_HARNESS_REF_INPUT: 'b'.repeat(40),
        ARTIFACT_APP_REF: 'a'.repeat(40),
        RELEASE_BUNDLE_DIGEST: '',
        RELEASE_COHORT_REF: '',
        FRAMEWORK_REF: 'c'.repeat(40),
        DIAGNOSTIC_SCOPE_INPUT: 'post_publication_optional_certification',
        RELEASE_ARTIFACT_NAME: '',
        STANDARD_IDENTITY_SHA256: '',
        HOMEBREW_CANDIDATE_ARTIFACT: '',
        RELEASE_TAG_INPUT: 'v26.7.27',
        PUBLISHED_ARTIFACT_NAME: 'One-Person-Lab-26.7.27-mac-arm64.dmg',
        PUBLISHED_ARTIFACT_DIGEST: `sha256:${'d'.repeat(64)}`,
        ...overrides,
      },
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runPostPublicationClassifier(
  workflow: Record<string, any>,
  capability: Record<string, unknown> | null,
) {
  const step = workflowStep(
    workflow,
    'clean-vm-first-run',
    'Classify post-publication optional certification outcome',
  );
  const replacements = new Map([
    ['steps.published_artifact_identity.outputs.verified', 'true'],
    ['steps.post_publication_job.outputs.started', 'true'],
    ['steps.post_publication_execution.outputs.started', 'false'],
    ['steps.post_publication_capability.outcome', 'failure'],
    ['steps.vm_smoke.outcome', 'skipped'],
    ['steps.settings_runtime_evidence.outcome', 'skipped'],
  ]);
  const script = String(step.run).replace(
    /\$\{\{\s*([^}]+?)\s*\}\}/g,
    (_match, expression: string) => replacements.get(expression.trim()) ?? '',
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-post-publication-classifier-'));
  const output = path.join(root, 'github-output.txt');
  try {
    if (capability) {
      const evidenceDir = path.join(root, 'artifacts', 'opl-first-run-vm');
      fs.mkdirSync(evidenceDir, { recursive: true });
      fs.writeFileSync(
        path.join(evidenceDir, 'post-publication-capability-admission.json'),
        `${JSON.stringify(capability)}\n`,
      );
    }
    const result = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', script], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_OUTPUT: output,
        EXPECTED_SOURCE_VM: 'opl-clean-macos',
        EXPECTED_RUNTIME_PROFILE: 'standard',
      },
    });
    return {
      result,
      output: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '',
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runCapabilityUnavailableReceiptWriter(
  workflow: Record<string, any>,
  profile: 'standard' | 'full',
) {
  const jobName = profile === 'standard' ? 'write-standard-receipts' : 'write-full-receipt';
  const stepName = profile === 'standard'
    ? 'Write Standard VM result and explicit residual not-run receipts'
    : 'Write exact Full VM certification receipt';
  const evidenceDirName = profile === 'standard'
    ? 'imported-standard-vm-evidence'
    : 'imported-full-vm-evidence';
  const outputName = profile === 'standard'
    ? 'standard-dmg-clean-machine.json'
    : 'full-dmg-clean-machine.json';
  const version = '26.7.27';
  const artifactName = profile === 'standard'
    ? `One-Person-Lab-${version}-mac-arm64.dmg`
    : `One-Person-Lab-Full-${version}-mac-arm64.dmg`;
  const sourceVm = 'opl-clean-macos';
  const script = String(workflowStep(workflow, jobName, stepName).run);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `opl-${profile}-capability-unavailable-`));
  try {
    const scriptsDir = path.join(root, 'scripts');
    fs.mkdirSync(scriptsDir);
    for (const scriptName of [
      'write-optional-certification-receipt.ts',
      'validate-optional-certification-receipt.ts',
    ]) {
      fs.copyFileSync(path.join(appRoot, 'scripts', scriptName), path.join(scriptsDir, scriptName));
    }
    const evidenceDir = path.join(root, evidenceDirName);
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(
      path.join(evidenceDir, 'published-artifact-identity.json'),
      `${JSON.stringify({
        schema: 'opl_app_post_publication_artifact_identity.v1',
        verified: true,
        release_tag: `v${version}`,
        artifact: {
          name: artifactName,
          digest: `sha256:${'d'.repeat(64)}`,
        },
        cohort: {
          app_sha: 'a'.repeat(40),
          shell_sha: 'b'.repeat(40),
          framework_sha: 'c'.repeat(40),
        },
      })}\n`,
    );
    fs.writeFileSync(
      path.join(evidenceDir, 'post-publication-job-start.json'),
      `${JSON.stringify({
        schema: 'opl_app_optional_certification_job_start.v1',
        started: true,
      })}\n`,
    );
    fs.writeFileSync(
      path.join(evidenceDir, 'post-publication-capability-admission.json'),
      `${JSON.stringify({
        schema: 'opl_app_optional_certification_vm_admission.v1',
        status: 'failed',
        reason_code: 'capability_admission_failed',
        source_vm: sourceVm,
      })}\n`,
    );
    const result = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', script], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        SOURCE_RUN_ID: '123456',
        RELEASE_TAG: `v${version}`,
        ARTIFACT_NAME: artifactName,
        ARTIFACT_DIGEST: `sha256:${'d'.repeat(64)}`,
        COMPONENT_MANIFEST_DIGEST: `sha256:${'e'.repeat(64)}`,
        APP_SHA: 'a'.repeat(40),
        SHELL_SHA: 'b'.repeat(40),
        FRAMEWORK_SHA: 'c'.repeat(40),
        VM_ADMITTED: 'true',
        VM_ADMISSION_REASON: '',
        VM_JOB_RESULT: 'failure',
        VM_STATUS: 'unavailable',
        VM_REASON_CODE: 'capability_admission_failed',
        VM_ARTIFACT_VERIFIED: 'true',
        VM_JOB_STARTED: 'true',
        VM_EXECUTION_STARTED: 'false',
        VM_CLASSIFICATION_VALID: 'true',
        GITHUB_RUN_ID: '654321',
      },
    });
    const receiptPath = path.join(root, outputName);
    return {
      result,
      receipt: fs.existsSync(receiptPath)
        ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as Record<string, any>
        : null,
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('optional certification is an automatic read-only post-publication executor', () => {
  const { source, workflow } = readWorkflow(workflowPath);
  assert.deepEqual(Object.keys(workflow.on), ['workflow_run']);
  assert.deepEqual(workflow.on.workflow_run.workflows, ['OPL Stable Release Bundle']);
  assert.deepEqual(workflow.on.workflow_run.types, ['completed']);
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.deepEqual(Object.keys(workflow.jobs), [
    'resolve-standard',
    'admit-standard-vm',
    'certify-standard-vm',
    'write-standard-receipts',
    'resolve-full',
    'admit-full-vm',
    'certify-full-vm',
    'write-full-receipt',
  ]);

  for (const profile of ['standard', 'full']) {
    const resolve = workflow.jobs[`resolve-${profile}`];
    const admit = workflow.jobs[`admit-${profile}-vm`];
    const certify = workflow.jobs[`certify-${profile}-vm`];
    const write = workflow.jobs[profile === 'standard' ? 'write-standard-receipts' : 'write-full-receipt'];

    assert.equal(resolve.needs, undefined);
    assert.deepEqual(admit.needs, [`resolve-${profile}`]);
    assert.deepEqual(certify.needs, [`resolve-${profile}`, `admit-${profile}-vm`]);
    assert.deepEqual(write.needs, [
      `resolve-${profile}`,
      `admit-${profile}-vm`,
      `certify-${profile}-vm`,
    ]);

    for (const hostedJob of [resolve, admit, write]) {
      assert.equal(hostedJob['runs-on'], 'ubuntu-latest');
      assert.deepEqual(hostedJob.permissions, { contents: 'read', actions: 'read' });
      assert.equal(hostedJob.uses, undefined);
    }
    assert.equal(certify['runs-on'], undefined);
    assert.equal(certify.steps, undefined);
    assert.equal(certify.uses, './.github/workflows/opl-first-run-vm.yml');
    assert.deepEqual(certify.permissions, { contents: 'read', actions: 'read' });
    assert.deepEqual(certify.with, {
      mode: 'execute',
      release_tag: `\${{ needs.resolve-${profile}.outputs.tag }}`,
      published_artifact_name: `\${{ needs.resolve-${profile}.outputs.artifact_name }}`,
      published_artifact_digest: `\${{ needs.resolve-${profile}.outputs.artifact_digest }}`,
      artifact_app_ref: `\${{ needs.resolve-${profile}.outputs.app_sha }}`,
      shell_ref: `\${{ needs.resolve-${profile}.outputs.shell_sha }}`,
      smoke_harness_ref: `\${{ needs.resolve-${profile}.outputs.shell_sha }}`,
      framework_ref: `\${{ needs.resolve-${profile}.outputs.framework_sha }}`,
      package_profile: profile,
      diagnostic_scope: 'post_publication_optional_certification',
      require_macos_gatekeeper: true,
    });
  }

  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.equal(
    workflow.jobs['resolve-standard'].if,
    "${{ github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main' && startsWith(github.event.workflow_run.display_title, 'OPL Stable standard ') }}",
  );
  assert.equal(
    workflow.jobs['resolve-full'].if,
    "${{ github.event.workflow_run.conclusion == 'success' && startsWith(github.event.workflow_run.display_title, 'OPL Stable append_full ') }}",
  );
  assert.match(
    String(workflow.concurrency.group),
    /opl-post-publication-certification-\$\{\{ github\.event\.workflow_run\.id \}\}/,
  );
  assert.match(source, /\.path == "\.github\/workflows\/release-stable\.yml"/);
  assert.match(source, /\.head_branch == "main"/);
  assert.match(source, /\^OPL Stable standard/);
  assert.match(source, /operation:\[A-Za-z0-9\._:-\]\{1,128\} authority:/);
  assert.match(source, /\.head_branch \| test\("\^v/);
  assert.match(source, /\^OPL Stable append_full/);
  assert.match(source, /test "\$tag" = "\$head_branch"/);
  assert.match(source, /opl-release-activation-\$\{SOURCE_RUN_ID\}/);
  assert.match(source, /opl-release-full-published-\$\{SOURCE_RUN_ID\}/);
  assert.match(source, /public-component-manifest\.json/);
  assert.match(source, /write-optional-certification-receipt\.ts/);
  assert.doesNotMatch(
    source,
    /workflow_dispatch:|contents: write|packages: write|gh workflow run|gh run (?:rerun|cancel)|gh release (?:create|edit|upload|delete)|opl release (?:build|publish|reconcile)|codesign|notarize/,
  );
});

test('Standard and Full VM certification consume the exact published DMG without rebuilding it', () => {
  const { source, workflow } = readWorkflow(workflowPath);
  const { source: vmSource, workflow: vmWorkflow } = readWorkflow(vmWorkflowPath);

  for (const profile of ['standard', 'full']) {
    const admit = workflow.jobs[`admit-${profile}-vm`];
    const certify = workflow.jobs[`certify-${profile}-vm`];
    assert.equal(admit.outputs.eligible, '${{ steps.capability.outputs.eligible }}');
    assert.equal(admit.outputs.reason_code, '${{ steps.capability.outputs.reason_code }}');
    const capabilityStep = admit.steps.find((step: Record<string, any>) => step.id === 'capability');
    assert.equal(
      capabilityStep.env.RUNNER_INVENTORY_TOKEN,
      '${{ secrets.OPL_RUNNER_INVENTORY_TOKEN || github.token }}',
    );
    assert.match(capabilityStep.run, /\[ -z "\$RUNNER_INVENTORY_TOKEN" \]/);
    assert.match(capabilityStep.run, /GH_TOKEN="\$RUNNER_INVENTORY_TOKEN" gh api/);
    assert.equal(certify.with.release_tag, `\${{ needs.resolve-${profile}.outputs.tag }}`);
    assert.equal(
      certify.with.published_artifact_name,
      `\${{ needs.resolve-${profile}.outputs.artifact_name }}`,
    );
    assert.equal(
      certify.with.published_artifact_digest,
      `\${{ needs.resolve-${profile}.outputs.artifact_digest }}`,
    );
  }

  assert.match(source, /actions\/runners\?per_page=100/);
  assert.match(source, /runner\.status === 'online' && runner\.busy === false/);
  assert.match(source, /reason_code=not_authorized/);
  assert.match(source, /reason_code=operator_deferred/);
  assert.match(source, /status=unavailable/);
  assert.match(source, /capability_admission_failed/);

  assert.equal(
    vmWorkflow.on.workflow_call.outputs.post_publication_status.value,
    '${{ jobs.clean-vm-first-run.outputs.post_publication_status }}',
  );
  assert.equal(
    vmWorkflow.on.workflow_call.outputs.post_publication_reason_code.value,
    '${{ jobs.clean-vm-first-run.outputs.post_publication_reason_code }}',
  );
  for (const output of [
    'published_artifact_verified',
    'post_publication_job_started',
    'post_publication_execution_started',
    'post_publication_classification_valid',
  ]) {
    assert.equal(
      vmWorkflow.on.workflow_call.outputs[output].value,
      `\${{ jobs.clean-vm-first-run.outputs.${output} }}`,
    );
  }
  assert.match(vmSource, /post-publication certification requires published_artifact_name/);
  assert.match(vmSource, /post-publication certification requires an exact published_artifact_digest/);
  assert.match(vmSource, /post-publication certification must consume public release bytes, not an Actions artifact/);
  assert.match(vmSource, /Verify exact published DMG identity before install/);
  assert.match(vmSource, /PUBLISHED_ARTIFACT_NAME: \$\{\{ inputs\.published_artifact_name \}\}/);
  assert.match(vmSource, /download_pattern="\$PUBLISHED_ARTIFACT_NAME"/);
  assert.doesNotMatch(vmSource, /download_pattern='\$\{\{ inputs\.published_artifact_name \}\}'/);
  assert.match(vmSource, /test "\$\(basename "\$dmg_path"\)" = "\$expected_name"/);
  assert.match(vmSource, /actual_digest="sha256:\$\(shasum -a 256 "\$dmg_path" \| awk '\{print \$1\}'\)"/);
  assert.match(vmSource, /Admit exact Tart capability for post-publication certification/);
  assert.match(vmSource, /Mark post-publication certification execution started/);
  assert.match(vmSource, /keys == \["reason_code","schema","source_vm","status"\]/);
  assert.match(vmSource, /\.source_vm == \$source_vm/);
  assert.match(vmSource, /\.framework_source_archive == null/);
  assert.match(vmSource, /clone_vm\|configure_display\|start_vm\|wait_for_ip\|wait_for_ssh/);
  assert.match(vmSource, /run_guest_smoke\|validate_guest_summary/);
  assert.match(vmSource, /needs\.validate-vm-inputs\.outputs\.diagnostic_scope != 'post_publication_optional_certification'/);
});

test('receipt projection distinguishes execution, capability absence, and residual not-run checks', () => {
  const { source } = readWorkflow(workflowPath);
  for (const output of [
    'standard-dmg-clean-machine.json',
    'homebrew-standard-clean-machine.json',
    'one-shot-installer-clean-machine.json',
    'full-dmg-clean-machine.json',
  ]) {
    assert.match(source, new RegExp(output.replaceAll('.', '\\.')));
  }
  assert.match(source, /--status "\$standard_status"/);
  assert.match(source, /--status "\$full_status"/);
  assert.match(source, /--status not_run/);
  assert.match(source, /--reason-code not_requested/);
  assert.match(source, /physical_job_dispatched:\$dispatched/);
  assert.match(source, /--certification-run-id "\$GITHUB_RUN_ID"/);
  assert.match(source, /component_manifest_digest/);
  assert.match(source, /artifact_digest/);
  assert.match(source, /app_sha/);
  assert.match(source, /shell_sha/);
  assert.match(source, /framework_sha/);
  assert.match(source, /VM_CLASSIFICATION_VALID/);
  assert.match(source, /VM_ARTIFACT_VERIFIED/);
  assert.match(source, /VM_JOB_STARTED/);
  assert.match(source, /VM_EXECUTION_STARTED/);
  assert.match(source, /passed requires a successful reusable job and a started executor/);
  assert.match(source, /failed requires a failed reusable job after execution started/);
  assert.match(source, /did not return one sealable terminal classification/);
  assert.equal((source.match(/\.source_cohort\.app_sha == \$app_sha/g) ?? []).length, 2);
  assert.equal((source.match(/\.source_cohort\.shell_sha == \$shell_sha/g) ?? []).length, 2);
  assert.equal((source.match(/\.source_cohort\.framework_sha == \$framework_sha/g) ?? []).length, 2);
  assert.match(source, /require_tart_summary\(\) \{/);
  assert.match(source, /passed\)[\s\S]+require_tart_summary[\s\S]+\.status == "passed"/);
  assert.match(source, /failed\)[\s\S]+require_tart_summary[\s\S]+\.status == "passed" or \.status == "failed"/);
  assert.match(source, /vm_admission_failed\)[\s\S]+require_tart_summary/);
  const capabilityAdmissionBranch = source.slice(
    source.indexOf('capability_admission_failed)'),
    source.indexOf(';;', source.indexOf('capability_admission_failed)')),
  );
  assert.doesNotMatch(capabilityAdmissionBranch, /require_tart_summary/);
  assert.match(capabilityAdmissionBranch, /admission_evidence="\$capability_admission"/);
  assert.match(source, /Download exact Standard VM evidence/);
  assert.match(source, /opl-first-run-vm-standard-\$\{\{ github\.run_id \}\}/);
  assert.match(source, /Download exact Full VM evidence/);
  assert.match(source, /opl-first-run-vm-full-\$\{\{ github\.run_id \}\}/);
  for (const evidence of [
    'published-artifact-identity.json',
    'post-publication-capability-admission.json',
    'post-publication-execution-start.json',
    'tart-smoke-summary.json',
    'settings-smoke-summary.json',
    'settings-runtime-refresh-verification.json',
    'installed-framework-source-identity.json',
    'full-runtime-source-identity.json',
  ]) {
    assert.match(source, new RegExp(evidence.replaceAll('.', '\\.')));
  }
  assert.match(source, /opl_framework_installed_source_identity\.v1/);
  assert.match(source, /opl_full_runtime_source_identity\.v1/);
  assert.match(source, /source == "packaged_app_resource"/);
  assert.match(source, /framework_source_archive == null/);
  assert.doesNotMatch(source, /standard-vm-evidence\.json|full-vm-evidence\.json/);
  assert.doesNotMatch(source, /\$\{VM_REASON_CODE:-capability_admission_failed\}/);
  assert.doesNotMatch(source, /\$\{VM_ADMISSION_REASON:-operator_deferred\}/);
  assert.doesNotMatch(source, /runner_offline|queued_workflow|github_auth_failure|network_failure/);
});

test('Full capability admission failure writes unavailable receipt without Tart execution evidence', () => {
  const { workflow } = readWorkflow(workflowPath);
  const step = workflowStep(
    workflow,
    'write-full-receipt',
    'Write exact Full VM certification receipt',
  );
  const writerPath = path.join(appRoot, 'scripts', 'write-optional-certification-receipt.ts');
  const script = String(step.run).replace(
    'node --experimental-strip-types scripts/write-optional-certification-receipt.ts',
    `node --experimental-strip-types ${JSON.stringify(writerPath)}`,
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-capability-receipt-'));
  const evidenceRoot = path.join(root, 'imported-full-vm-evidence');
  const artifactName = 'One-Person-Lab-Full-26.7.28-mac-arm64.dmg';
  const artifactDigest = `sha256:${'d'.repeat(64)}`;
  const appSha = 'a'.repeat(40);
  const shellSha = 'b'.repeat(40);
  const frameworkSha = 'c'.repeat(40);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'published-artifact-identity.json'), `${JSON.stringify({
    schema: 'opl_app_post_publication_artifact_identity.v1',
    verified: true,
    release_tag: 'v26.7.28',
    artifact: { name: artifactName, digest: artifactDigest },
    cohort: { app_sha: appSha, shell_sha: shellSha, framework_sha: frameworkSha },
  })}\n`);
  fs.writeFileSync(path.join(evidenceRoot, 'post-publication-job-start.json'), `${JSON.stringify({
    schema: 'opl_app_optional_certification_job_start.v1',
    started: true,
  })}\n`);
  fs.writeFileSync(path.join(evidenceRoot, 'post-publication-capability-admission.json'), `${JSON.stringify({
    schema: 'opl_app_optional_certification_vm_admission.v1',
    status: 'failed',
    reason_code: 'capability_admission_failed',
    source_vm: 'opl-clean-macos',
  })}\n`);

  try {
    const result = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', script], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        SOURCE_RUN_ID: '30123456789',
        RELEASE_TAG: 'v26.7.28',
        ARTIFACT_NAME: artifactName,
        ARTIFACT_DIGEST: artifactDigest,
        COMPONENT_MANIFEST_DIGEST: `sha256:${'e'.repeat(64)}`,
        APP_SHA: appSha,
        SHELL_SHA: shellSha,
        FRAMEWORK_SHA: frameworkSha,
        VM_ADMITTED: 'true',
        VM_ADMISSION_REASON: '',
        VM_JOB_RESULT: 'failure',
        VM_STATUS: 'unavailable',
        VM_REASON_CODE: 'capability_admission_failed',
        VM_ARTIFACT_VERIFIED: 'true',
        VM_JOB_STARTED: 'true',
        VM_EXECUTION_STARTED: 'false',
        VM_CLASSIFICATION_VALID: 'true',
        GITHUB_RUN_ID: '40123456789',
      },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const receipt = JSON.parse(fs.readFileSync(path.join(root, 'full-dmg-clean-machine.json'), 'utf8'));
    assert.equal(receipt.status, 'unavailable');
    assert.equal(receipt.admission.status, 'failed');
    assert.equal(receipt.admission.reason_code, 'capability_admission_failed');
    assert.deepEqual(receipt.result.evidence_digests, []);
    assert.equal(fs.existsSync(path.join(evidenceRoot, 'tart-smoke-summary.json')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('post-publication artifact names are derived from profile and release tag and reject hostile bytes', () => {
  const { workflow } = readWorkflow(vmWorkflowPath);
  const accepted = runDiagnosticNormalization(workflow);
  assert.equal(accepted.status, 0, accepted.stderr || accepted.stdout);

  for (const hostileName of [
    "One-Person-Lab-26.7.27-mac-arm64.dmg' && touch escaped",
    'One-Person-Lab-26.7.27-mac-arm64.dmg\nextra',
    'One-Person-Lab-Full-26.7.27-mac-arm64.dmg',
  ]) {
    const rejected = runDiagnosticNormalization(workflow, {
      PUBLISHED_ARTIFACT_NAME: hostileName,
    });
    assert.notEqual(rejected.status, 0, hostileName);
  }
});

test('only exact typed capability evidence can seal unavailable', () => {
  const { workflow } = readWorkflow(vmWorkflowPath);
  const missing = runPostPublicationClassifier(workflow, null);
  assert.equal(missing.result.status, 0, missing.result.stderr || missing.result.stdout);
  assert.match(missing.output, /valid=false/);
  assert.doesNotMatch(missing.output, /status=unavailable/);

  const exact = runPostPublicationClassifier(workflow, {
    schema: 'opl_app_optional_certification_vm_admission.v1',
    status: 'failed',
    reason_code: 'capability_admission_failed',
    source_vm: 'opl-clean-macos',
  });
  assert.equal(exact.result.status, 0, exact.result.stderr || exact.result.stdout);
  assert.match(exact.output, /valid=true/);
  assert.match(exact.output, /status=unavailable/);
  assert.match(exact.output, /reason_code=capability_admission_failed/);

  for (const invalid of [
    {
      schema: 'opl_app_optional_certification_vm_admission.v1',
      status: 'failed',
      reason_code: 'capability_admission_failed',
      source_vm: 'wrong-vm',
    },
    {
      schema: 'opl_app_optional_certification_vm_admission.v1',
      status: 'failed',
      reason_code: 'capability_admission_failed',
      source_vm: 'opl-clean-macos',
      unexpected: true,
    },
  ]) {
    const rejected = runPostPublicationClassifier(workflow, invalid);
    assert.equal(rejected.result.status, 0, rejected.result.stderr || rejected.result.stdout);
    assert.match(rejected.output, /valid=false/);
    assert.doesNotMatch(rejected.output, /status=unavailable/);
  }
});

test('capability-unavailable receipts do not require Tart execution evidence', () => {
  const { workflow } = readWorkflow(workflowPath);
  for (const profile of ['standard', 'full'] as const) {
    const { result, receipt } = runCapabilityUnavailableReceiptWriter(workflow, profile);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(receipt?.status, 'unavailable');
    assert.equal(receipt?.admission?.status, 'failed');
    assert.equal(receipt?.admission?.reason_code, 'capability_admission_failed');
    assert.deepEqual(receipt?.result?.evidence_digests, []);
  }
});
