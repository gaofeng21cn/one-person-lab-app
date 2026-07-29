import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { type TestContext } from 'node:test';
import { parse as parseYaml } from 'yaml';

const appRoot = path.resolve(import.meta.dirname, '../..');
const workflowRelativePath = '.github/workflows/self-hosted-advisory.yml';
const workflowPath = path.join(appRoot, workflowRelativePath);
const workflowRef = process.env.OPL_TEST_SELF_HOSTED_ADVISORY_REF?.trim();

function readAdvisorySource(): string {
  if (!workflowRef) return fs.readFileSync(workflowPath, 'utf8');

  const result = spawnSync('git', ['show', `${workflowRef}:${workflowRelativePath}`], {
    cwd: appRoot,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `cannot read ${workflowRelativePath} from ${workflowRef}: ${result.stderr || result.stdout}`,
  );
  return result.stdout;
}

const source = readAdvisorySource();
const workflow = parseYaml(source) as Record<string, any>;
const admissionStep = (workflow.jobs?.admit?.steps ?? []).find(
  (step: Record<string, unknown>) => step.id === 'admission',
) as Record<string, any> | undefined;
assert.ok(admissionStep, 'self-hosted advisory must have a hosted admission step');
const admissionScript = String(admissionStep.run ?? '');

const macLabels = ['self-hosted', 'macOS', 'ARM64', 'opl-cert-mac-tart'];
const windowsLabels = ['self-hosted', 'Windows', 'X64', 'opl-cert-windows-wsl'];

interface GitHubRun {
  id: number;
  repository: { full_name: string };
  head_repository: { full_name: string };
  path: string;
  event: string;
  head_branch: string;
  run_attempt: number;
  status: string;
  conclusion: string;
  head_sha: string;
  display_title?: string;
}

interface AdmissionScenario {
  sourceRuns: GitHubRun[];
  historyRuns?: Array<Pick<GitHubRun, 'id' | 'display_title'>>;
  jobsByRunId?: Record<string, Array<Record<string, unknown>>>;
  runners?: Array<Record<string, unknown>>;
  historyError?: boolean;
}

interface AdmissionExecution {
  status: number | null;
  stdout: string;
  stderr: string;
  outputs: Record<string, string>;
  receipt: Record<string, any>;
  calls: string[];
}

function trustedSourceRun(id: number, sha: string): GitHubRun {
  return {
    id,
    repository: { full_name: 'gaofeng21cn/one-person-lab-app' },
    head_repository: { full_name: 'gaofeng21cn/one-person-lab-app' },
    path: '.github/workflows/non-release-validation.yml',
    event: 'push',
    head_branch: 'main',
    run_attempt: 1,
    status: 'completed',
    conclusion: 'success',
    head_sha: sha,
  };
}

function eligibleRunner(name: string, labels: string[]): Record<string, unknown> {
  return {
    id: name === 'mac' ? 24 : 23,
    name,
    os: labels.includes('Windows') ? 'Windows' : 'macOS',
    status: 'online',
    busy: false,
    labels: labels.map((label) => ({ name: label })),
  };
}

function parseOutputs(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, 'utf8').trim().split('\n')) {
    if (!line) continue;
    const separator = line.indexOf('=');
    assert.notEqual(separator, -1, `malformed workflow output line: ${line}`);
    result[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return result;
}

function executeAdmission(
  t: TestContext,
  options: {
    eventName: 'schedule' | 'workflow_dispatch';
    githubSha: string;
    sourceRunIdInput?: string;
    macLabelsInput?: string[];
    windowsLabelsInput?: string[];
    scenario: AdmissionScenario;
  },
): AdmissionExecution {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-self-hosted-admission-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fakeBin = path.join(root, 'bin');
  const outputPath = path.join(root, 'github-output.txt');
  const scenarioPath = path.join(root, 'scenario.json');
  const callsPath = path.join(root, 'calls.jsonl');
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(scenarioPath, `${JSON.stringify(options.scenario)}\n`);
  fs.writeFileSync(
    path.join(fakeBin, 'gh'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2).join(' ');
fs.appendFileSync(process.env.MOCK_GH_CALLS, JSON.stringify(args) + '\\n');
const scenario = JSON.parse(fs.readFileSync(process.env.MOCK_GH_SCENARIO, 'utf8'));

if (args.includes('actions/workflows/non-release-validation.yml/runs?')) {
  process.stdout.write(JSON.stringify([{ workflow_runs: scenario.sourceRuns || [] }]));
  process.exit(0);
}
if (args.includes('actions/workflows/self-hosted-advisory.yml/runs?')) {
  if (scenario.historyError) {
    process.stderr.write('advisory history unavailable\\n');
    process.exit(1);
  }
  process.stdout.write(JSON.stringify([{ workflow_runs: scenario.historyRuns || [] }]));
  process.exit(0);
}
const jobsMatch = args.match(/actions\\/runs\\/(\\d+)\\/jobs\\?/);
if (jobsMatch) {
  process.stdout.write(JSON.stringify({ jobs: scenario.jobsByRunId?.[jobsMatch[1]] || [] }));
  process.exit(0);
}
if (args.includes('actions/runners?')) {
  process.stdout.write(JSON.stringify({ runners: scenario.runners || [] }));
  process.exit(0);
}
process.stderr.write('unexpected gh call: ' + args + '\\n');
process.exit(2);
`,
    { mode: 0o755 },
  );

  const result = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', admissionScript], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      EVENT_NAME: options.eventName,
      GITHUB_OUTPUT: outputPath,
      GITHUB_REPOSITORY: 'gaofeng21cn/one-person-lab-app',
      GITHUB_RUN_ID: '9001',
      GITHUB_SHA: options.githubSha,
      GH_TOKEN: 'runner-inventory-read-test-token',
      RUNNER_INVENTORY_TOKEN: 'runner-inventory-read-test-token',
      WORKFLOW_RUN_ID: '',
      WORKFLOW_RUN_SHA: '',
      SOURCE_RUN_ID_INPUT: options.sourceRunIdInput ?? '',
      MAC_LABELS_INPUT: JSON.stringify(options.macLabelsInput ?? macLabels),
      WINDOWS_LABELS_INPUT: JSON.stringify(options.windowsLabelsInput ?? windowsLabels),
      MOCK_GH_SCENARIO: scenarioPath,
      MOCK_GH_CALLS: callsPath,
    },
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    outputs: fs.existsSync(outputPath) ? parseOutputs(outputPath) : {},
    receipt: fs.existsSync(path.join(root, 'self-hosted-advisory-admission.json'))
      ? JSON.parse(fs.readFileSync(path.join(root, 'self-hosted-advisory-admission.json'), 'utf8'))
      : {},
    calls: fs.existsSync(callsPath)
      ? fs.readFileSync(callsPath, 'utf8').trim().split('\n').filter(Boolean).map(String)
      : [],
  };
}

test('hosted admission accepts only trusted main-push sources and exact advisory pools', () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), ['schedule', 'workflow_dispatch', 'workflow_run']);
  assert.deepEqual(workflow.on.workflow_run.workflows, ['OPL Non-Release Validation']);
  assert.deepEqual(workflow.on.workflow_run.types, ['completed']);
  assert.equal(workflow.on.schedule.length, 1);
  assert.equal(workflow.jobs.admit['runs-on'], 'ubuntu-latest');
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(workflow.permissions.actions, 'read');
  assert.match(String(workflow.jobs.admit.if), /github\.ref == 'refs\/heads\/main'/);
  assert.match(admissionScript, /sourceRun\.event === 'push'/);
  assert.match(admissionScript, /sourceRun\.head_branch === 'main'/);
  assert.match(admissionScript, /sourceRun\.run_attempt === 1/);
  assert.match(admissionScript, /sourceRun\.conclusion === 'success'/);
  assert.match(admissionScript, /Requested labels are outside the declared advisory pool/);
  assert.deepEqual(
    workflow.on.workflow_dispatch.inputs.mac_runner_labels_json.default,
    JSON.stringify(macLabels),
  );
  assert.deepEqual(
    workflow.on.workflow_dispatch.inputs.windows_runner_labels_json.default,
    JSON.stringify(windowsLabels),
  );
});

test('scheduled and manual re-admission bind checkout to one successful immutable main run', async (t) => {
  await t.test('schedule selects the successful run for the scheduled main SHA', (t) => {
    const sourceSha = 'a'.repeat(40);
    const execution = executeAdmission(t, {
      eventName: 'schedule',
      githubSha: sourceSha,
      scenario: {
        sourceRuns: [trustedSourceRun(101, sourceSha)],
        runners: [eligibleRunner('mac', macLabels), eligibleRunner('windows', windowsLabels)],
      },
    });

    assert.equal(execution.status, 0, execution.stderr || execution.stdout);
    assert.equal(execution.outputs.source_run_id, '101');
    assert.equal(execution.outputs.source_sha, sourceSha);
    assert.equal(execution.receipt.source_run_id, '101');
    assert.equal(execution.receipt.source_sha, sourceSha);
    assert.equal(execution.receipt.retry_policy.mode, 'scheduled_re_admission');
    assert.equal(execution.receipt.retry_policy.dedupe_key, 'source_sha+target');
    assert.equal(execution.receipt.targets.mac.status, 'ready');
    assert.equal(execution.receipt.targets.windows.status, 'ready');
  });

  await t.test('manual re-admission selects the explicitly requested successful run ID', (t) => {
    const dispatchSha = 'b'.repeat(40);
    const sourceSha = 'c'.repeat(40);
    const execution = executeAdmission(t, {
      eventName: 'workflow_dispatch',
      githubSha: dispatchSha,
      sourceRunIdInput: '202',
      scenario: {
        sourceRuns: [trustedSourceRun(201, dispatchSha), trustedSourceRun(202, sourceSha)],
        runners: [eligibleRunner('mac', macLabels), eligibleRunner('windows', windowsLabels)],
      },
    });

    assert.equal(execution.status, 0, execution.stderr || execution.stdout);
    assert.equal(execution.outputs.source_run_id, '202');
    assert.equal(execution.outputs.source_sha, sourceSha);
    assert.equal(execution.receipt.source_run_id, '202');
    assert.equal(execution.receipt.source_sha, sourceSha);
    assert.equal(execution.receipt.retry_policy.mode, 'event_or_manual_admission');
  });

  for (const jobId of ['mac-advisory', 'windows-advisory']) {
    const checkout = workflow.jobs[jobId].steps.find(
      (step: Record<string, unknown>) => step.name === 'Checkout admitted source',
    );
    assert.equal(checkout.with.ref, '${{ needs.admit.outputs.source_sha }}');
  }
});

test('scheduled retry de-duplicates each source target without suppressing an unrecorded target', (t) => {
  const sourceSha = 'd'.repeat(40);
  const execution = executeAdmission(t, {
    eventName: 'schedule',
    githubSha: sourceSha,
    scenario: {
      sourceRuns: [trustedSourceRun(301, sourceSha)],
      historyRuns: [{ id: 701, display_title: `Self-hosted advisory for ${sourceSha}` }],
      jobsByRunId: {
        '701': [
          { name: 'macOS platform advisory', status: 'completed', conclusion: 'success' },
          { name: 'Windows WSL2 platform advisory', status: 'completed', conclusion: 'skipped' },
        ],
      },
      runners: [eligibleRunner('mac', macLabels), eligibleRunner('windows', windowsLabels)],
    },
  });

  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  assert.equal(execution.receipt.source_sha, sourceSha);
  assert.equal(execution.receipt.targets.mac.status, 'not_run');
  assert.equal(execution.receipt.targets.mac.reason_code, 'already_recorded');
  assert.equal(execution.receipt.targets.windows.status, 'ready');
  assert.equal(execution.outputs.mac_status, 'not_run');
  assert.equal(execution.outputs.windows_status, 'ready');
  assert.equal(execution.calls.filter((call) => call.includes('actions/runners?')).length, 1);
});

test('unreadable scheduled history fails open as not_run and never creates a self-hosted queue', (t) => {
  const sourceSha = 'e'.repeat(40);
  const execution = executeAdmission(t, {
    eventName: 'schedule',
    githubSha: sourceSha,
    scenario: {
      sourceRuns: [trustedSourceRun(401, sourceSha)],
      historyError: true,
      runners: [eligibleRunner('mac', macLabels), eligibleRunner('windows', windowsLabels)],
    },
  });

  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  for (const target of ['mac', 'windows']) {
    assert.equal(execution.receipt.targets[target].status, 'not_run');
    assert.equal(execution.receipt.targets[target].reason_code, 'operator_deferred');
    assert.match(execution.receipt.targets[target].detail, /Cannot prove scheduled retry de-duplication/);
    assert.equal(execution.outputs[`${target}_status`], 'not_run');
  }
  assert.equal(execution.calls.some((call) => call.includes('actions/runners?')), false);
  assert.equal(workflow.jobs['mac-advisory'].if, "${{ needs.admit.outputs.mac_status == 'ready' }}");
  assert.equal(workflow.jobs['windows-advisory'].if, "${{ needs.admit.outputs.windows_status == 'ready' }}");
});

test('broadened labels are not authorized and inventory is never used to queue them', (t) => {
  const sourceSha = 'f'.repeat(40);
  const execution = executeAdmission(t, {
    eventName: 'workflow_dispatch',
    githubSha: sourceSha,
    sourceRunIdInput: '501',
    macLabelsInput: [...macLabels, 'opl-ci-accelerated'],
    windowsLabelsInput: [...windowsLabels, 'opl-experiment'],
    scenario: {
      sourceRuns: [trustedSourceRun(501, sourceSha)],
      runners: [eligibleRunner('mac', macLabels), eligibleRunner('windows', windowsLabels)],
    },
  });

  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  for (const target of ['mac', 'windows']) {
    assert.equal(execution.receipt.targets[target].status, 'not_run');
    assert.equal(execution.receipt.targets[target].reason_code, 'not_authorized');
  }
  assert.equal(execution.calls.some((call) => call.includes('actions/runners?')), false);
});

test('platform jobs perform substantive bounded checks but stay advisory to Stable and Latest', () => {
  const mac = workflow.jobs['mac-advisory'];
  const windows = workflow.jobs['windows-advisory'];
  assert.equal(mac['continue-on-error'], true);
  assert.equal(windows['continue-on-error'], true);
  assert.equal(mac['timeout-minutes'], 30);
  assert.equal(windows['timeout-minutes'], 30);
  assert.equal(mac['runs-on'], '${{ fromJSON(needs.admit.outputs.mac_labels_json) }}');
  assert.equal(windows['runs-on'], '${{ fromJSON(needs.admit.outputs.windows_labels_json) }}');

  const macSmoke = mac.steps.find((step: Record<string, unknown>) => step.id === 'platform-smoke');
  assert.match(macSmoke.run, /npm run test:smoke/);
  assert.match(macSmoke.run, /tart clone "\$TART_SOURCE" "\$vm_name"/);
  assert.match(macSmoke.run, /tart run --no-graphics "\$vm_name"/);
  assert.match(macSmoke.run, /tart ip "\$vm_name"/);
  assert.match(macSmoke.run, /trap cleanup EXIT/);
  assert.match(source, /checks:\["admitted_source_smoke","clean_tart_guest_boot"\]/);

  const windowsSmoke = windows.steps.find((step: Record<string, unknown>) => step.id === 'platform-smoke');
  assert.match(windowsSmoke.run, /docker-webui-windows-installer\.test\.ts/);
  assert.match(windowsSmoke.run, /wsl\.exe --status/);
  assert.match(windowsSmoke.run, /docker version --format/);
  assert.match(source, /@\("windows_installer_behavior", "wsl2_status", "docker_engine_handshake"\)/);
  assert.match(source, /release_blocking:\s*false/);
  assert.match(source, /release_blocking = \$false/);

  for (const mandatoryWorkflow of [
    'release-stable.yml',
    '_release-bundle.yml',
    '_release-standard-publish.yml',
    '_release-full-addon.yml',
  ]) {
    const mandatorySource = fs.readFileSync(
      path.join(appRoot, '.github', 'workflows', mandatoryWorkflow),
      'utf8',
    );
    assert.doesNotMatch(
      mandatorySource,
      /self-hosted-advisory|mac-advisory|windows-advisory|opl-cert-mac-tart|opl-cert-windows-wsl/,
      `${mandatoryWorkflow} must not depend on self-hosted advisory capacity`,
    );
  }
});

test('untrusted pull requests cannot reach runner inventory credentials', () => {
  assert.equal(workflow.on.pull_request, undefined);
  assert.equal(workflow.on.pull_request_target, undefined);
  assert.doesNotMatch(source, /pull_request_target|secrets:\s*inherit/);
  const secretNames = [...source.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(secretNames)], ['OPL_RUNNER_INVENTORY_TOKEN']);
  assert.match(source, /GH_TOKEN: \$\{\{ secrets\.OPL_RUNNER_INVENTORY_TOKEN \|\| github\.token \}\}/);
});
