import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReleaseIncidentStatus } from '../../scripts/release-incident-status.ts';

const runId = 32538379742;
const appSha = '7'.repeat(40);

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    name: `OPL Stable append_full run:${runId}`,
    repository: { full_name: 'gaofeng21cn/one-person-lab-app' },
    path: '.github/workflows/release-stable.yml',
    status: 'completed',
    conclusion: 'failure',
    head_sha: appSha,
    run_started_at: '2026-08-22T00:00:00Z',
    updated_at: '2026-08-22T00:30:00Z',
    html_url: `https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/${runId}`,
    ...overrides,
  };
}

function step(
  number: number,
  name: string,
  conclusion: string | null,
  startedAt: string,
  completedAt: string | null,
) {
  return {
    number,
    name,
    status: conclusion === null ? 'in_progress' : 'completed',
    conclusion,
    started_at: startedAt,
    completed_at: completedAt,
  };
}

function completedJob(id: number, name: string, steps: unknown[] = []) {
  return {
    id,
    name,
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-08-22T00:00:00Z',
    completed_at: '2026-08-22T00:20:00Z',
    steps,
  };
}

function artifact(id: number, name: string, size = 100) {
  return {
    id,
    name,
    size_in_bytes: size,
    expired: false,
    created_at: '2026-08-22T00:20:00Z',
    updated_at: '2026-08-22T00:20:01Z',
  };
}

test('completed Full failure reports the exact failed step and does not invent VM progress', () => {
  const jobs = [
    completedJob(1, 'append-full / admission'),
    completedJob(2, 'append-full / full-build / Finalize Full DMG on ARM'),
    completedJob(3, 'append-full / full-qualification'),
    completedJob(4, 'append-full / full-clean-vm-qualification / Validate VM harness inputs'),
    {
      id: 5,
      name: 'append-full / full-clean-vm-qualification / Clean VM first launch',
      status: 'completed',
      conclusion: 'failure',
      started_at: '2026-08-22T00:26:44Z',
      completed_at: '2026-08-22T00:28:39Z',
      steps: [
        step(32, 'Verify dedicated non-admin Gateway release-test account', 'success', '2026-08-22T00:28:11Z', '2026-08-22T00:28:12Z'),
        step(33, 'Provision Framework-owned MAS qualification workspace', 'failure', '2026-08-22T00:28:12Z', '2026-08-22T00:28:21Z'),
        step(34, 'Run clean VM first launch smoke', 'skipped', '2026-08-22T00:28:21Z', '2026-08-22T00:28:21Z'),
      ],
    },
  ];
  const fakeSourceLog = [
    '2026-08-22T00:28:12Z echo "stage=clone_vm"',
    '2026-08-22T00:28:21Z Process completed with exit code 3.',
  ].join('\n');
  const status = buildReleaseIncidentStatus({
    run: run(),
    jobs: { jobs },
    artifacts: {
      artifacts: [
        artifact(1, 'opl-full-first-install-dmg-26.8.22-mac-arm64', 616_900_985),
        artifact(2, `opl-full-notarization-evidence-26.8.22-${runId}`),
        artifact(3, `opl-hosted-full-core-qualification-${runId}`),
      ],
    },
    jobLogs: { 5: fakeSourceLog },
    now: '2026-08-22T00:30:00Z',
  });

  assert.deepEqual(status.first_failure, {
    job_id: '5',
    job_name: 'append-full / full-clean-vm-qualification / Clean VM first launch',
    job_conclusion: 'failure',
    step_number: 33,
    step_name: 'Provision Framework-owned MAS qualification workspace',
    step_conclusion: 'failure',
    failed_at: '2026-08-22T00:28:21.000Z',
  });
  assert.equal(status.vm_state.status, 'unknown_requires_runtime_marker');
  assert.equal(status.vm_state.marker_count, 0);
  assert.equal(status.checkpoint_recovery.available, false);
  assert.equal(status.next_action.code, 'inspect_first_failed_step');
  assert.match(status.next_action.reason, /Provision Framework-owned MAS qualification workspace/);
  assert.deepEqual(status.completed_actual_stages, [
    'release_admission_completed',
    'full_candidate_built',
    'full_candidate_signed_and_notarized',
    'full_hosted_core_qualification_completed',
    'full_vm_harness_inputs_validated',
  ]);
});

test('non-external active step becomes actionable after five minutes without observable change', () => {
  const status = buildReleaseIncidentStatus({
    run: run({ status: 'in_progress', conclusion: null, updated_at: '2026-08-22T00:10:00Z' }),
    jobs: {
      jobs: [{
        id: 10,
        name: 'append-full / full-clean-vm-qualification / Clean VM first launch',
        status: 'in_progress',
        conclusion: null,
        started_at: '2026-08-22T00:04:00Z',
        completed_at: null,
        steps: [step(34, 'Run clean VM first launch smoke', null, '2026-08-22T00:04:00Z', null)],
      }],
    },
    artifacts: { artifacts: [] },
    jobLogs: { 10: null },
    now: '2026-08-22T00:10:00Z',
  });

  assert.equal(status.focus?.stalled_seconds, 360);
  assert.equal(status.focus?.last_change_source, 'step_state');
  assert.equal(status.focus?.log_probe.status, 'unavailable');
  assert.equal(status.next_action.code, 'inspect_stalled_step_log');
  assert.equal(status.vm_state.status, 'unknown_requires_runtime_marker');
});

test('heartbeat cannot hide a stalled build or create VM evidence', () => {
  const stage = { timestamp: '2026-08-22T00:04:01Z', event: 'release_stage', stage: 'build_full_shell' };
  const heartbeat = { timestamp: '2026-08-22T00:09:59Z', event: 'command_heartbeat', child_running: true, progress_claimed: false };
  for (const prefix of [true, false]) {
    const log = [stage, heartbeat].map(event => `${prefix ? `${event.timestamp} ` : ''}${JSON.stringify(event)}`).join('\n');
    const status = buildReleaseIncidentStatus({
      run: run({ status: 'in_progress', conclusion: null }),
      jobs: { jobs: [{
        id: 10, name: 'append-full / full-build', status: 'in_progress', conclusion: null,
        started_at: '2026-08-22T00:04:00Z', completed_at: null,
        steps: [step(10, 'Build Full package', null, '2026-08-22T00:04:00Z', null)],
      }] },
      artifacts: { artifacts: [] }, jobLogs: { 10: log }, now: '2026-08-22T00:10:00Z',
    });
    assert.deepEqual(status.focus?.runtime_stage, stage);
    assert.equal(status.focus?.last_change_at, '2026-08-22T00:04:01.000Z');
    assert.equal(status.focus?.stalled_seconds, 359);
    assert.equal(status.next_action.code, 'inspect_stalled_step_log');
    assert.equal(status.vm_state.marker_count, 0);
  }
});

test('Apple notarization remains an external-service wait rather than a false stall', () => {
  const status = buildReleaseIncidentStatus({
    run: run({ status: 'in_progress', conclusion: null }),
    jobs: {
      jobs: [{
        id: 20,
        name: 'append-full / full-build / Finalize Full DMG on ARM',
        status: 'in_progress',
        conclusion: null,
        started_at: '2026-08-22T00:00:00Z',
        completed_at: null,
        steps: [step(10, 'Finalize Full Developer ID signing and notarization on ARM', null, '2026-08-22T00:00:00Z', null)],
      }],
    },
    artifacts: { artifacts: [] },
    now: '2026-08-22T00:20:00Z',
  });

  assert.equal(status.focus?.external_service_wait, true);
  assert.equal(status.focus?.stalled_seconds, 1200);
  assert.equal(status.next_action.code, 'continue_current_step');
});

test('runtime markers distinguish VM allocation from a merely visible VM step', () => {
  const log = [
    '2026-08-22T00:04:01.123Z [tart-smoke] stage=clone_vm',
    JSON.stringify({
      timestamp: '2026-08-22T00:04:08Z',
      event_type: 'host_runtime_event',
      stage: 'start_vm',
      vm_name: 'opl-first-run-20260822-000401',
      guest_ip: null,
    }),
    JSON.stringify({
      timestamp: '2026-08-22T00:04:10Z',
      event_type: 'host_runtime_event',
      stage: 'wait_for_ip',
      vm_name: 'opl-first-run-20260822-000401',
      guest_ip: null,
    }),
    JSON.stringify({
      timestamp: '2026-08-22T00:04:12Z',
      event_type: 'host_runtime_event',
      stage: 'wait_for_ssh',
      vm_name: 'opl-first-run-20260822-000401',
      guest_ip: '192.168.64.4',
    }),
    JSON.stringify({
      timestamp: '2026-08-22T00:04:14Z',
      event_type: 'host_runtime_event',
      stage: 'run_guest_smoke',
      vm_name: 'opl-first-run-20260822-000401',
      guest_ip: '192.168.64.4',
    }),
  ].join('\n');
  const status = buildReleaseIncidentStatus({
    run: run({ status: 'in_progress', conclusion: null }),
    jobs: {
      jobs: [{
        id: 30,
        name: 'append-full / full-clean-vm-qualification / Clean VM first launch',
        status: 'in_progress',
        conclusion: null,
        started_at: '2026-08-22T00:04:00Z',
        completed_at: null,
        steps: [step(34, 'Run clean VM first launch smoke', null, '2026-08-22T00:04:00Z', null)],
      }],
    },
    artifacts: { artifacts: [] },
    jobLogs: { 30: log },
    now: '2026-08-22T00:04:20Z',
  });

  assert.deepEqual(status.vm_state, {
    status: 'guest_ip_ready',
    stage: 'run_guest_smoke',
    marker_timestamp: '2026-08-22T00:04:14.000Z',
    vm_name: 'opl-first-run-20260822-000401',
    guest_ip: '192.168.64.4',
    marker_count: 5,
  });
  assert.equal(status.focus?.last_change_at, '2026-08-22T00:04:14.000Z');
  assert.equal(status.next_action.code, 'continue_current_step');
});

test('exact Full checkpoint is required before recommending checkpoint recovery', () => {
  const failure = {
    id: 40,
    name: 'append-full / publish-full',
    status: 'completed',
    conclusion: 'failure',
    started_at: '2026-08-22T00:25:00Z',
    completed_at: '2026-08-22T00:26:00Z',
    steps: [step(2, 'Append Full assets', 'failure', '2026-08-22T00:25:10Z', '2026-08-22T00:25:20Z')],
  };
  const checkpointUpload = completedJob(41, 'append-full / checkpoint-full', [
    step(9, 'Upload additive Full checkpoint', 'success', '2026-08-22T00:24:00Z', '2026-08-22T00:24:10Z'),
  ]);
  const status = buildReleaseIncidentStatus({
    run: run(),
    jobs: { jobs: [
      completedJob(38, 'append-full / full-qualification'),
      completedJob(39, 'append-full / full-clean-vm-qualification / Clean VM first launch'),
      checkpointUpload,
      failure,
    ] },
    artifacts: { artifacts: [artifact(10, `opl-release-full-checkpoint-${runId}`)] },
    now: '2026-08-22T00:30:00Z',
  });

  assert.deepEqual(status.checkpoint_recovery, {
    available: true,
    completed_stage: 'full_qualified',
    artifact_name: `opl-release-full-checkpoint-${runId}`,
  });
  assert.equal(status.next_action.code, 'reuse_full_built_checkpoint');
});

test('failed Full qualification preserves a recoverable full_built checkpoint', () => {
  const qualificationFailure = {
    id: 42,
    name: 'append-full / full-clean-vm-qualification / Clean VM first launch',
    status: 'completed',
    conclusion: 'failure',
    started_at: '2026-08-22T00:25:00Z',
    completed_at: '2026-08-22T00:26:00Z',
    steps: [step(2, 'Run clean VM first launch smoke', 'failure', '2026-08-22T00:25:10Z', '2026-08-22T00:25:20Z')],
  };
  const checkpointUpload = completedJob(43, 'append-full / checkpoint-full', [
    step(9, 'Upload additive Full checkpoint', 'success', '2026-08-22T00:26:10Z', '2026-08-22T00:26:20Z'),
  ]);
  const status = buildReleaseIncidentStatus({
    run: run(),
    jobs: { jobs: [qualificationFailure, checkpointUpload] },
    artifacts: { artifacts: [artifact(11, `opl-release-full-checkpoint-${runId}`)] },
    now: '2026-08-22T00:30:00Z',
  });

  assert.deepEqual(status.checkpoint_recovery, {
    available: true,
    completed_stage: 'full_built',
    artifact_name: `opl-release-full-checkpoint-${runId}`,
  });
  assert.equal(status.next_action.code, 'reuse_full_built_checkpoint');
});

test('successful owner run is terminal without proposing another dispatch', () => {
  const status = buildReleaseIncidentStatus({
    run: run({ status: 'completed', conclusion: 'success' }),
    jobs: { jobs: [completedJob(50, 'publish-full')] },
    artifacts: { artifacts: [] },
    now: '2026-08-22T00:30:00Z',
  });

  assert.equal(status.first_failure, null);
  assert.equal(status.next_action.code, 'complete');
  assert.match(status.next_action.reason, /public and installed-runtime readback/);
  assert.equal(status.authority.dispatch_allowed, false);
});

test('successful Standard run continues directly into Full instead of closing the objective', () => {
  const status = buildReleaseIncidentStatus({
    run: run({
      name: `OPL Stable standard run:${runId}`,
      status: 'completed',
      conclusion: 'success',
    }),
    jobs: { jobs: [completedJob(60, 'standard')] },
    artifacts: { artifacts: [] },
    now: '2026-08-22T00:30:00Z',
  });

  assert.equal(status.run.operation, 'standard');
  assert.equal(status.next_action.code, 'continue_current_step');
  assert.match(status.next_action.reason, /contract-defined Full path/);
});
