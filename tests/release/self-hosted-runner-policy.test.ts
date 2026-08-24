import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

import {
  projectOptionalCertificationStatus,
  validateOptionalCertificationReceipt,
  type OptionalCertificationExpectation,
} from '../../scripts/validate-optional-certification-receipt.ts';
import { writeOptionalCertificationReceipt } from '../../scripts/write-optional-certification-receipt.ts';

const appRoot = path.resolve(import.meta.dirname, '../..');
const workflowRoot = path.join(appRoot, '.github', 'workflows');

function readWorkflow(name: string): { source: string; workflow: Record<string, any> } {
  const source = fs.readFileSync(path.join(workflowRoot, name), 'utf8');
  return { source, workflow: parseYaml(source) as Record<string, any> };
}

function needsList(job: Record<string, any>): string[] {
  if (typeof job.needs === 'string') return [job.needs];
  return Array.isArray(job.needs) ? job.needs.map(String) : [];
}

test('Stable and Latest allow only the exact protected Standard/Full clean-install ancestor', () => {
  const mandatoryWorkflows = [
    'release-source-qualification.yml',
    'release-stable.yml',
    '_release-bundle.yml',
    '_release-standard-publish.yml',
    '_release-full-addon.yml',
  ];

  for (const name of mandatoryWorkflows) {
    const { workflow } = readWorkflow(name);
    for (const [jobId, job] of Object.entries(workflow.jobs ?? {}) as Array<[string, Record<string, any>]>) {
      const protectedGate =
        (name === '_release-bundle.yml' && jobId === 'standard-clean-vm-qualification')
        || (name === '_release-full-addon.yml' && jobId === 'full-clean-vm-qualification');
      const runsOn = JSON.stringify(job['runs-on'] ?? '');
      assert.doesNotMatch(runsOn, /self-hosted/i, `${name}:${jobId} must remain GitHub-hosted`);
      if (protectedGate) {
        assert.equal(job.uses, './.github/workflows/opl-first-run-vm.yml');
        assert.equal(job.with.diagnostic_scope, 'release_gate');
        assert.equal(job.with.require_macos_gatekeeper, true);
        assert.deepEqual(job.permissions, { contents: 'read', actions: 'read' });
        assert.equal(job.secrets, 'inherit');
      } else {
        assert.doesNotMatch(
          String(job.uses ?? ''),
          /opl-first-run-vm|release-post-publication-certification/i,
          `${name}:${jobId} must not call optional or advisory certification`,
        );
      }
      const allowedVmDependency =
        (name === '_release-bundle.yml'
          && jobId === 'checkpoint-standard'
          && needsList(job).filter((dependency) => /vm|certification|tart/i.test(dependency)).join(',') ===
            'standard-clean-vm-qualification')
        || (name === '_release-full-addon.yml'
          && jobId === 'checkpoint-full'
          && needsList(job).filter((dependency) => /vm|certification|tart/i.test(dependency)).join(',') ===
            'full-clean-vm-qualification');
      assert.equal(
        needsList(job).some((dependency) => /vm|certification|tart/i.test(dependency)),
        allowedVmDependency,
        `${name}:${jobId} may depend only on its protected exact-candidate clean-install gate`,
      );
    }
  }

  const stableSource = readWorkflow('release-stable.yml').source;
  assert.doesNotMatch(stableSource, /self-hosted|opl-first-run-vm|release-post-publication-certification/i);
});

test('Manual Full Preview keeps its explicit self-hosted exception outside Stable/Latest', () => {
  const { workflow: manual } = readWorkflow('release-manual-full-preview.yml');
  assert.deepEqual(manual.jobs.ingress['runs-on'], ['self-hosted', 'macOS', 'ARM64', 'opl-gui-vm']);
  assert.doesNotMatch(
    readWorkflow('release-stable.yml').source,
    /release-manual-full-preview\.yml/,
  );
});

test('Tart VM consumers and routine advisory jobs use distinct exact capability pools', () => {
  const postPublication = readWorkflow('release-post-publication-certification.yml').source;
  assert.equal((postPublication.match(/opl-cert-mac-tart/g) || []).length >= 1, true);
  assert.doesNotMatch(postPublication, /opl-gui-vm/);

  const firstRun = readWorkflow('opl-first-run-vm.yml').workflow;
  assert.deepEqual(
    firstRun.jobs['clean-vm-first-run']['runs-on'],
    ['self-hosted', 'macOS', 'ARM64', 'opl-cert-mac-tart'],
  );
  assert.equal(
    firstRun.jobs['clean-vm-first-run'].environment,
    "${{ needs.validate-vm-inputs.outputs.diagnostic_scope == 'release_gate' && 'release-stable' || null }}",
  );
  assert.deepEqual(Object.keys(firstRun.on.workflow_call.secrets), [
    'OPL_GATEWAY_RELEASE_TEST_ACCOUNT_PASSWORD',
  ]);
  assert.equal(
    firstRun.on.workflow_call.secrets.OPL_GATEWAY_RELEASE_TEST_ACCOUNT_PASSWORD.required,
    false,
  );
  const advisory = readWorkflow('self-hosted-advisory.yml');
  assert.match(advisory.source, /Requested labels are outside the declared advisory pool/);
  assert.deepEqual(
    advisory.workflow.on.workflow_dispatch.inputs.mac_runner_labels_json.default,
    '["self-hosted","macOS","ARM64","opl-cert-mac-tart"]',
  );
  assert.deepEqual(
    advisory.workflow.on.workflow_dispatch.inputs.windows_runner_labels_json.default,
    '["self-hosted","Windows","X64","opl-cert-windows-wsl"]',
  );
  assert.deepEqual(
    advisory.workflow.on.workflow_dispatch.inputs.mac_gui_runner_labels_json.default,
    '["self-hosted","macOS","ARM64","opl-gui-vm"]',
  );
  assert.deepEqual(
    advisory.workflow.on.workflow_dispatch.inputs.mac_vmware_runner_labels_json.default,
    '["self-hosted","macOS","X64","opl-vmware-intel-host"]',
  );

  assert.equal(
    advisory.workflow.jobs['mac-gui-advisory']['runs-on'],
    '${{ fromJSON(needs.admit.outputs.mac_gui_labels_json) }}',
  );
  assert.equal(
    advisory.workflow.jobs['mac-vmware-advisory']['runs-on'],
    '${{ fromJSON(needs.admit.outputs.mac_vmware_labels_json) }}',
  );
  assert.equal(advisory.workflow.jobs['mac-gui-advisory']['continue-on-error'], true);
  assert.equal(advisory.workflow.jobs['mac-vmware-advisory']['continue-on-error'], true);
});

test('runner policy contract limits publication to one protected self-hosted gate per release track', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(appRoot, 'contracts', 'app-release-channel.json'), 'utf8'));
  const policy = contract.release_acceleration.runner_policy;
  const pools = Object.fromEntries(policy.pools.map((pool: Record<string, any>) => [pool.id, pool]));

  assert.deepEqual(pools['mac-gui'].labels, ['self-hosted', 'macOS', 'ARM64', 'opl-gui-vm']);
  assert.deepEqual(
    pools['mac-vmware-intel'].labels,
    ['self-hosted', 'macOS', 'X64', 'opl-vmware-intel-host'],
  );
  assert.deepEqual(pools['mac-tart'].labels, ['self-hosted', 'macOS', 'ARM64', 'opl-cert-mac-tart']);
  assert.deepEqual(
    pools['windows-wsl'].labels,
    ['self-hosted', 'Windows', 'X64', 'opl-cert-windows-wsl'],
  );
  assert.deepEqual(policy.routine_advisory.targets, [
    'mac-gui',
    'mac-vmware-intel',
    'mac-tart',
    'windows-wsl',
  ]);
  assert.equal(policy.routine_advisory.source_identity, 'source_run_id+source_sha+target');
  assert.equal(policy.routine_advisory.artifact_identity_allowed, false);
  assert.equal(policy.routine_advisory.queue_when_not_ready, false);
  assert.equal(policy.routine_advisory.release_blocking, false);
  assert.equal(policy.routine_advisory.merge_blocking, false);
  assert.equal(policy.routine_advisory.untrusted_pull_request_execution_allowed, false);
  assert.equal(policy.routine_advisory.inventory_token_least_privilege_verified, false);
  assert.equal(policy.publication_floor.stable_and_latest_executor, 'github_hosted');
  assert.equal(policy.publication_floor.self_hosted_ancestor_count, 1);
  assert.equal(
    policy.publication_floor.self_hosted_ancestor_scope,
    'exact_profile_protected_clean_install_only',
  );
  assert.equal(policy.publication_floor.optional_or_advisory_self_hosted_ancestor_count, 0);
  assert.deepEqual(policy.protected_macos_clean_install_gate.required_profiles, ['standard', 'full']);
  assert.equal(policy.protected_macos_clean_install_gate.credentials_environment, 'release-stable');
  assert.equal(
    policy.protected_macos_clean_install_gate.missing_runner_or_credential_effect,
    'fail_closed_without_publication',
  );
});

test('offline self-hosted inventory is deferred before queueing and cannot become a publication dependency', () => {
  const { workflow } = readWorkflow('release-post-publication-certification.yml');
  const capability = workflow.jobs['admit-macos-vm'].steps.find(
    (step: Record<string, unknown>) => step.id === 'capability',
  ) as Record<string, any> | undefined;
  assert.ok(capability, 'missing Standard capability preflight');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runner-policy-offline-'));
  const fakeBin = path.join(root, 'bin');
  const output = path.join(root, 'github-output.txt');
  fs.mkdirSync(fakeBin, { recursive: true });
  const offlineInventory = [
    {
      runners: [{
        id: 22,
        name: 'gaofeng-imac-opl-vmware-host',
        status: 'offline',
        busy: false,
        labels: [
          { name: 'self-hosted' },
          { name: 'macOS' },
          { name: 'X64' },
          { name: 'opl-vmware-intel-host' },
        ],
      }],
    },
  ];
  fs.writeFileSync(
    path.join(fakeBin, 'gh'),
    `#!/bin/sh\nprintf '%s\\n' '${JSON.stringify(offlineInventory)}'\n`,
    { mode: 0o755 },
  );

  try {
    const result = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', String(capability.run)], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        GITHUB_OUTPUT: output,
        GITHUB_REPOSITORY: 'gaofeng21cn/one-person-lab-app',
        RUNNER_INVENTORY_TOKEN: 'read-only-test-token',
        TART_SOURCE: 'tart-base',
        RUNNER_LABELS: '["self-hosted","macOS","ARM64","opl-cert-mac-tart"]',
      },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(
      fs.readFileSync(output, 'utf8'),
      'eligible=false\nreason_code=operator_deferred\n',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  const { workflow: stable } = readWorkflow('release-stable.yml');
  for (const job of Object.values(stable.jobs ?? {}) as Array<Record<string, any>>) {
    assert.equal(
      needsList(job).some((dependency) => dependency === 'admit-standard-vm' || dependency === 'certify-standard-vm'),
      false,
    );
  }
});

test('operator-deferred certification produces explicit not_run without a physical job', (t) => {
  const expected: OptionalCertificationExpectation = {
    releaseTag: 'v26.7.28',
    artifactName: 'One-Person-Lab-26.7.28-mac-arm64.dmg',
    artifactDigest: `sha256:${'a'.repeat(64)}`,
    componentManifestDigest: `sha256:${'b'.repeat(64)}`,
    appSha: '1'.repeat(40),
    shellSha: '2'.repeat(40),
    frameworkSha: '3'.repeat(40),
    sourceRunId: '30280000001',
  };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runner-policy-receipt-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const admissionPath = path.join(root, 'dispatch-admission.json');
  fs.writeFileSync(
    admissionPath,
    `${JSON.stringify({
      schema: 'opl_app_optional_certification_dispatch_admission.v1',
      status: 'not_started',
      reason_code: 'operator_deferred',
      source_run_id: expected.sourceRunId,
      release_tag: expected.releaseTag,
      physical_job_dispatched: false,
    })}\n`,
  );

  const receipt = writeOptionalCertificationReceipt({
    expected,
    status: 'not_run',
    certification: {
      kind: 'clean_machine_install',
      platform: 'macos',
      capability: 'tart-clean-macos',
    },
    admissionEvidencePath: admissionPath,
    reasonCode: 'operator_deferred',
    certificationRunId: null,
    evidencePaths: [],
    createdAt: '2026-07-28T01:00:00.000Z',
  });

  assert.deepEqual(validateOptionalCertificationReceipt(receipt, expected), []);
  assert.equal(projectOptionalCertificationStatus(receipt, expected), 'not_run');
  assert.equal(receipt.run.job_started, false);
  assert.equal(receipt.admission.reason_code, 'operator_deferred');
  assert.equal(receipt.artifact_handling.downloaded_from_published_release, false);
});
