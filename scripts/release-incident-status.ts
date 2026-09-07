#!/usr/bin/env node

import { parseArgs } from 'node:util';

import { runGitHubCli } from './release-file-helpers.ts';

type JsonRecord = Record<string, unknown>;

export type ReleaseIncidentAction =
  | 'continue_current_step'
  | 'inspect_stalled_step_log'
  | 'inspect_first_failed_step'
  | 'reuse_full_built_checkpoint'
  | 'stop_external_blocker'
  | 'complete';

type VmStatus =
  | 'unknown_requires_runtime_marker'
  | 'clone_started'
  | 'start_requested'
  | 'waiting_for_ip'
  | 'guest_ip_ready';

type LogProbeStatus = 'available' | 'unavailable' | 'not_requested';

type JobLogMap = Record<string, string | null | undefined>;

export type ReleaseIncidentInput = {
  run: unknown;
  jobs: unknown;
  artifacts: unknown;
  jobLogs?: JobLogMap;
  now?: string;
};

const defaultRepository = 'gaofeng21cn/one-person-lab-app';
const nonExternalStallSeconds = 5 * 60;
const failedConclusions = new Set([
  'failure',
  'timed_out',
  'action_required',
  'startup_failure',
]);
const cancelledConclusions = new Set(['cancelled', 'stale']);
const vmAllocationStages = new Set(['clone_vm', 'start_vm', 'wait_for_ip']);

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as JsonRecord;
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.map((entry) => record(entry, 'Array entry'))
    : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringField(value: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const field = stringValue(value[key]);
    if (field !== null) return field;
  }
  return null;
}

function numberField(value: JsonRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const field = value[key];
    if (typeof field === 'number' && Number.isFinite(field)) return field;
    if (typeof field === 'string' && /^\d+$/.test(field)) return Number(field);
  }
  return null;
}

function booleanField(value: JsonRecord, key: string): boolean | null {
  return typeof value[key] === 'boolean' ? value[key] : null;
}

function timestampMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalTimestamp(value: string | null): string | null {
  const parsed = timestampMs(value);
  return parsed === null ? null : new Date(parsed).toISOString();
}

function latestTimestamp(values: Array<string | null>): string | null {
  const parsed = values
    .map(timestampMs)
    .filter((entry): entry is number => entry !== null);
  return parsed.length > 0 ? new Date(Math.max(...parsed)).toISOString() : null;
}

function normalizedJobs(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return records(value);
  const payload = record(value, 'GitHub jobs payload');
  return records(payload.jobs);
}

function normalizedArtifacts(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return records(value);
  const payload = record(value, 'GitHub artifacts payload');
  return records(payload.artifacts);
}

function jobId(job: JsonRecord): string {
  return String(numberField(job, 'id', 'databaseId', 'database_id') ?? 'unknown');
}

function jobName(job: JsonRecord): string {
  return stringField(job, 'name', 'displayName', 'display_name') ?? 'unknown';
}

function jobStatus(job: JsonRecord): string {
  return stringField(job, 'status') ?? 'unknown';
}

function jobConclusion(job: JsonRecord): string | null {
  return stringField(job, 'conclusion');
}

function jobSteps(job: JsonRecord): JsonRecord[] {
  return records(job.steps);
}

function stepNumber(step: JsonRecord): number {
  return numberField(step, 'number') ?? Number.MAX_SAFE_INTEGER;
}

function stepName(step: JsonRecord): string {
  return stringField(step, 'name') ?? 'unknown';
}

function stepStatus(step: JsonRecord): string {
  return stringField(step, 'status') ?? 'unknown';
}

function stepConclusion(step: JsonRecord): string | null {
  return stringField(step, 'conclusion');
}

function firstFailedStep(job: JsonRecord): JsonRecord | null {
  const steps = jobSteps(job)
    .filter((step) => failedConclusions.has(stepConclusion(step) ?? ''))
    .sort((left, right) => stepNumber(left) - stepNumber(right));
  return steps[0] ?? null;
}

function firstTerminalFailure(jobs: JsonRecord[]): { job: JsonRecord; step: JsonRecord | null } | null {
  const primary = jobs.filter((job) => failedConclusions.has(jobConclusion(job) ?? ''));
  const candidates = primary.length > 0
    ? primary
    : jobs.filter((job) => cancelledConclusions.has(jobConclusion(job) ?? ''));
  const sorted = candidates
    .map((job) => ({ job, step: firstFailedStep(job) }))
    .sort((left, right) => {
      const leftTime = timestampMs(stringField(
        left.step ?? left.job,
        'completed_at',
        'completedAt',
      )) ?? Number.MAX_SAFE_INTEGER;
      const rightTime = timestampMs(stringField(
        right.step ?? right.job,
        'completed_at',
        'completedAt',
      )) ?? Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return Number(jobId(left.job)) - Number(jobId(right.job));
    });
  return sorted[0] ?? null;
}

function currentStep(job: JsonRecord): JsonRecord | null {
  const active = jobSteps(job)
    .filter((step) => stepStatus(step) === 'in_progress')
    .sort((left, right) => stepNumber(left) - stepNumber(right));
  return active[0] ?? null;
}

function lastCompletedStepAt(job: JsonRecord): string | null {
  return latestTimestamp(jobSteps(job).map((step) => (
    stringField(step, 'completed_at', 'completedAt')
  )));
}

function releaseLogEvent(line: string): JsonRecord | null {
  const json = line.replace(/^\d{4}-\d{2}-\d{2}T\S+\s+/, '');
  try {
    const event = record(JSON.parse(json), 'Release runtime event');
    return ['release_stage', 'apple_notarization_observation', 'command_heartbeat'].includes(String(event.event))
      ? event : null;
  } catch { return null; }
}

function latestReleaseStage(log: string | null | undefined): JsonRecord | null {
  for (const line of (log ?? '').split(/\r?\n/).reverse()) {
    const event = releaseLogEvent(line);
    if (event && event.event !== 'command_heartbeat') return event;
  }
  return null;
}

function latestLogTimestamp(log: string | null | undefined): string | null {
  if (!log) return null;
  const timestamps: string[] = [];
  for (const line of log.split(/\r?\n/)) {
    if (releaseLogEvent(line)?.event === 'command_heartbeat') continue;
    const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s/);
    if (match?.[1]) timestamps.push(match[1]);
    try {
      const event = record(JSON.parse(line), 'Runtime event');
      const timestamp = stringField(event, 'timestamp');
      if (timestamp) timestamps.push(timestamp);
    } catch {
      // Most job log lines are not JSON runtime events.
    }
  }
  return latestTimestamp(timestamps);
}

function focusLastChangeAt(job: JsonRecord, step: JsonRecord | null, log: string | null | undefined): {
  timestamp: string | null;
  source: 'job_log' | 'step_state' | 'job_state' | 'unavailable';
} {
  const logTimestamp = latestLogTimestamp(log);
  if (logTimestamp) return { timestamp: logTimestamp, source: 'job_log' };
  const stepTimestamp = latestTimestamp([
    step ? stringField(step, 'started_at', 'startedAt') : null,
    step ? stringField(step, 'completed_at', 'completedAt') : null,
    step ? null : lastCompletedStepAt(job),
  ]);
  if (stepTimestamp) return { timestamp: stepTimestamp, source: 'step_state' };
  const jobTimestamp = latestTimestamp([
    stringField(job, 'started_at', 'startedAt', 'created_at', 'createdAt'),
    stringField(job, 'completed_at', 'completedAt'),
  ]);
  return jobTimestamp
    ? { timestamp: jobTimestamp, source: 'job_state' }
    : { timestamp: null, source: 'unavailable' };
}

function focusForActiveRun(jobs: JsonRecord[], logs: JobLogMap, nowMs: number): {
  job: JsonRecord;
  step: JsonRecord | null;
} | null {
  const activeJobs = jobs.filter((job) => jobStatus(job) === 'in_progress');
  if (activeJobs.length === 0) {
    const queued = jobs.filter((job) => jobStatus(job) === 'queued');
    return queued[0] ? { job: queued[0], step: null } : null;
  }
  return activeJobs
    .map((job) => {
      const step = currentStep(job);
      const lastChange = focusLastChangeAt(job, step, logs[jobId(job)]);
      const changedMs = timestampMs(lastChange.timestamp) ?? nowMs;
      return { job, step, stalledSeconds: Math.max(0, Math.floor((nowMs - changedMs) / 1000)) };
    })
    .sort((left, right) => right.stalledSeconds - left.stalledSeconds)[0] ?? null;
}

function logProbeStatus(job: JsonRecord | null, logs: JobLogMap): LogProbeStatus {
  if (!job) return 'not_requested';
  const id = jobId(job);
  if (!(id in logs)) return 'not_requested';
  return typeof logs[id] === 'string' ? 'available' : 'unavailable';
}

function isExternalServiceStep(job: JsonRecord, step: JsonRecord | null): boolean {
  const label = `${jobName(job)} ${step ? stepName(step) : ''}`;
  return /notari[sz]|notarytool|apple\s+(?:service|notary)|staple/i.test(label);
}

function parseRuntimeEvent(line: string): JsonRecord | null {
  try {
    const event = record(JSON.parse(line), 'Runtime event');
    return stringField(event, 'event_type') === 'host_runtime_event' ? event : null;
  } catch {
    return null;
  }
}

function vmState(logs: JobLogMap) {
  const markers: Array<{
    timestamp: string | null;
    stage: string;
    vmName: string | null;
    guestIp: string | null;
  }> = [];
  for (const log of Object.values(logs)) {
    if (!log) continue;
    for (const line of log.split(/\r?\n/)) {
      const runtimeLine = line.match(
        /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+.*\[tart-smoke\]\s+stage=([a-z0-9_]+)\s*$/,
      );
      if (runtimeLine?.[2]) {
        markers.push({
          timestamp: canonicalTimestamp(runtimeLine[1] ?? null),
          stage: runtimeLine[2],
          vmName: null,
          guestIp: null,
        });
      }
      const event = parseRuntimeEvent(line);
      const stage = event ? stringField(event, 'stage') : null;
      if (event && stage) {
        markers.push({
          timestamp: canonicalTimestamp(stringField(event, 'timestamp')),
          stage,
          vmName: stringField(event, 'vm_name'),
          guestIp: stringField(event, 'guest_ip'),
        });
      }
    }
  }
  markers.sort((left, right) => (
    (timestampMs(left.timestamp) ?? 0) - (timestampMs(right.timestamp) ?? 0)
  ));
  const latest = markers.at(-1) ?? null;
  const latestAllocation = [...markers].reverse().find((marker) => (
    vmAllocationStages.has(marker.stage)
  )) ?? null;
  const guestIpMarker = [...markers].reverse().find((marker) => marker.guestIp) ?? null;
  const vmNameMarker = [...markers].reverse().find((marker) => marker.vmName) ?? null;
  let status: VmStatus = 'unknown_requires_runtime_marker';
  if (guestIpMarker?.guestIp) status = 'guest_ip_ready';
  else if (latestAllocation?.stage === 'wait_for_ip') status = 'waiting_for_ip';
  else if (latestAllocation?.stage === 'start_vm') status = 'start_requested';
  else if (latestAllocation?.stage === 'clone_vm') status = 'clone_started';
  return {
    status,
    stage: latest?.stage ?? null,
    marker_timestamp: latest?.timestamp ?? null,
    vm_name: vmNameMarker?.vmName ?? null,
    guest_ip: guestIpMarker?.guestIp ?? null,
    marker_count: markers.length,
  };
}

function artifactSummary(artifacts: JsonRecord[]) {
  return artifacts
    .filter((artifact) => booleanField(artifact, 'expired') !== true)
    .map((artifact) => ({
      id: String(numberField(artifact, 'id') ?? 'unknown'),
      name: stringField(artifact, 'name') ?? 'unknown',
      size_bytes: numberField(artifact, 'size_in_bytes', 'sizeInBytes'),
      created_at: canonicalTimestamp(stringField(artifact, 'created_at', 'createdAt')),
      updated_at: canonicalTimestamp(stringField(artifact, 'updated_at', 'updatedAt')),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function successfulStepExists(jobs: JsonRecord[], pattern: RegExp): boolean {
  return jobs.some((job) => jobSteps(job).some((step) => (
    stepConclusion(step) === 'success' && pattern.test(stepName(step))
  )));
}

function successfulJobExists(jobs: JsonRecord[], pattern: RegExp): boolean {
  return jobs.some((job) => jobConclusion(job) === 'success' && pattern.test(jobName(job)));
}

function checkpointEvidence(jobs: JsonRecord[], artifacts: ReturnType<typeof artifactSummary>) {
  const checkpoint = artifacts.find((artifact) => /^opl-release-full-checkpoint-\d+$/.test(artifact.name));
  if (checkpoint && successfulStepExists(jobs, /Upload additive Full checkpoint/i)) {
    const completedStage = successfulJobExists(jobs, /full-qualification$/i)
      && successfulJobExists(jobs, /full-clean-vm-qualification \/ Clean VM first launch/i)
      ? 'full_qualified'
      : 'full_built';
    return { available: true, completed_stage: completedStage, artifact_name: checkpoint.name };
  }
  return { available: false, completed_stage: null, artifact_name: null };
}

function completedActualStages(
  jobs: JsonRecord[],
  artifacts: ReturnType<typeof artifactSummary>,
  checkpoint: ReturnType<typeof checkpointEvidence>,
  vm: ReturnType<typeof vmState>,
): string[] {
  const names = new Set(artifacts.map((artifact) => artifact.name));
  const stages: string[] = [];
  if (successfulJobExists(jobs, /(?:^|\/)\s*admission$/i)) stages.push('release_admission_completed');
  if (
    successfulJobExists(jobs, /full-build \/ Finalize Full DMG on ARM/i)
    && [...names].some((name) => /^opl-full-first-install-dmg-.*-mac-arm64$/.test(name))
  ) stages.push('full_candidate_built');
  if (
    successfulJobExists(jobs, /Finalize Full DMG on ARM/i)
    && [...names].some((name) => /^opl-full-notarization-evidence-/.test(name))
  ) stages.push('full_candidate_signed_and_notarized');
  if (successfulJobExists(jobs, /full-qualification$/i)) stages.push('full_hosted_core_qualification_completed');
  if (successfulJobExists(jobs, /full-clean-vm-qualification \/ Validate VM harness inputs/i)) {
    stages.push('full_vm_harness_inputs_validated');
  }
  if (vm.status !== 'unknown_requires_runtime_marker') stages.push('vm_runtime_marker_observed');
  if (successfulJobExists(jobs, /full-clean-vm-qualification \/ Clean VM first launch/i)) {
    stages.push('full_clean_vm_qualification_completed');
  }
  if (checkpoint.available) stages.push(`framework_${checkpoint.completed_stage}_checkpoint_available`);
  if (successfulJobExists(jobs, /publish-full/i)) stages.push('full_publication_completed');
  if (successfulJobExists(jobs, /standard.*build|build.*standard/i)) stages.push('standard_build_completed');
  if (successfulJobExists(jobs, /standard.*clean.*vm|clean.*vm.*standard/i)) {
    stages.push('standard_clean_vm_qualification_completed');
  }
  return [...new Set(stages)];
}

function nextAction(input: {
  runStatus: string;
  runConclusion: string | null;
  operation: string;
  focusJob: JsonRecord | null;
  focusStep: JsonRecord | null;
  stalledSeconds: number | null;
  failure: { job: JsonRecord; step: JsonRecord | null } | null;
  checkpoint: ReturnType<typeof checkpointEvidence>;
}): { code: ReleaseIncidentAction; reason: string } {
  if (input.runStatus === 'completed' && input.runConclusion === 'success') {
    if (input.operation === 'standard' || input.operation === 'resume_standard') {
      return {
        code: 'continue_current_step',
        reason: 'The Standard owner run succeeded; continue immediately into the contract-defined Full path.',
      };
    }
    return {
      code: 'complete',
      reason: 'The owner run succeeded; complete the contract-defined public and installed-runtime readback before closing the release objective.',
    };
  }
  if (
    input.runConclusion === 'action_required'
    || jobConclusion(input.failure?.job ?? {}) === 'action_required'
    || stepConclusion(input.failure?.step ?? {}) === 'action_required'
  ) {
    return {
      code: 'stop_external_blocker',
      reason: 'GitHub classified the run, job, or step as action_required.',
    };
  }
  if (input.runStatus === 'completed' && input.checkpoint.available && input.failure) {
    return {
      code: 'reuse_full_built_checkpoint',
      reason: `The failed run retained a ${input.checkpoint.completed_stage} Framework checkpoint for the exact candidate.`,
    };
  }
  if (input.failure) {
    return {
      code: 'inspect_first_failed_step',
      reason: input.failure.step
        ? `Read only the necessary log for ${jobName(input.failure.job)} / ${stepName(input.failure.step)} and repair that breakpoint.`
        : `Read only the necessary log for failed job ${jobName(input.failure.job)} and repair that breakpoint.`,
    };
  }
  if (input.focusJob && input.stalledSeconds !== null && input.stalledSeconds >= nonExternalStallSeconds) {
    if (isExternalServiceStep(input.focusJob, input.focusStep)) {
      return {
        code: 'continue_current_step',
        reason: 'The current step is an Apple notarization or equivalent external-service wait.',
      };
    }
    return {
      code: 'inspect_stalled_step_log',
      reason: `The non-external current step has no observable change for ${input.stalledSeconds} seconds.`,
    };
  }
  return {
    code: 'continue_current_step',
    reason: input.focusJob
      ? 'The owner run still has an active or queued job without a five-minute non-external stall.'
      : 'The run has no terminal failure and no active step requiring intervention.',
  };
}

export function buildReleaseIncidentStatus(input: ReleaseIncidentInput) {
  const run = record(input.run, 'GitHub run payload');
  const jobs = normalizedJobs(input.jobs);
  const artifacts = normalizedArtifacts(input.artifacts);
  const logs = input.jobLogs ?? {};
  const now = input.now ?? new Date().toISOString();
  const nowMs = timestampMs(now);
  if (nowMs === null) throw new Error('now must be an ISO-8601 timestamp.');

  const failure = firstTerminalFailure(jobs);
  const active = failure ? null : focusForActiveRun(jobs, logs, nowMs);
  const focusJob = failure?.job ?? active?.job ?? null;
  const focusStep = failure?.step ?? active?.step ?? null;
  const log = focusJob ? logs[jobId(focusJob)] : undefined;
  const lastChange = focusJob
    ? focusLastChangeAt(focusJob, focusStep, log)
    : { timestamp: null, source: 'unavailable' as const };
  const runStatus = stringField(run, 'status') ?? 'unknown';
  const runConclusion = stringField(run, 'conclusion');
  const runLabel = [
    stringField(run, 'name'),
    stringField(run, 'display_title', 'displayTitle'),
  ].filter((entry): entry is string => entry !== null).join(' ');
  const operation = /append[_ -]?full/i.test(runLabel)
    ? 'append_full'
    : /resume[_ -]?standard/i.test(runLabel)
      ? 'resume_standard'
      : /standard/i.test(runLabel)
        ? 'standard'
        : 'unknown';
  const stalledSeconds = runStatus === 'completed' || !lastChange.timestamp
    ? (runStatus === 'completed' ? 0 : null)
    : Math.max(0, Math.floor((nowMs - (timestampMs(lastChange.timestamp) ?? nowMs)) / 1000));
  const artifactList = artifactSummary(artifacts);
  const checkpoint = checkpointEvidence(jobs, artifactList);
  const vm = vmState(logs);
  const action = nextAction({
    runStatus,
    runConclusion,
    operation,
    focusJob,
    focusStep,
    stalledSeconds,
    failure,
    checkpoint,
  });

  return {
    schema: 'opl_release_incident_status.v1',
    observed_at: new Date(nowMs).toISOString(),
    authority: {
      scope: 'github_run_observation_only',
      mutation_allowed: false,
      dispatch_allowed: false,
      rerun_allowed: false,
    },
    run: {
      id: String(numberField(run, 'id', 'databaseId', 'database_id') ?? 'unknown'),
      repository: stringField(record(run.repository ?? {}, 'Run repository'), 'full_name')
        ?? defaultRepository,
      workflow: stringField(run, 'path', 'workflowName', 'workflow_name'),
      status: runStatus,
      conclusion: runConclusion,
      operation,
      head_sha: stringField(run, 'head_sha', 'headSha'),
      started_at: canonicalTimestamp(stringField(run, 'run_started_at', 'started_at', 'startedAt', 'created_at')),
      updated_at: canonicalTimestamp(stringField(run, 'updated_at', 'updatedAt')),
      url: stringField(run, 'html_url', 'url'),
    },
    focus: focusJob
      ? {
          job_id: jobId(focusJob),
          job_name: jobName(focusJob),
          job_status: jobStatus(focusJob),
          job_conclusion: jobConclusion(focusJob),
          step_number: focusStep ? stepNumber(focusStep) : null,
          step_name: focusStep ? stepName(focusStep) : null,
          step_status: focusStep ? stepStatus(focusStep) : null,
          step_conclusion: focusStep ? stepConclusion(focusStep) : null,
          step_started_at: focusStep
            ? canonicalTimestamp(stringField(focusStep, 'started_at', 'startedAt'))
            : null,
          runtime_stage: latestReleaseStage(log),
          last_change_at: lastChange.timestamp,
          last_change_source: lastChange.source,
          stalled_seconds: stalledSeconds,
          external_service_wait: isExternalServiceStep(focusJob, focusStep),
          log_probe: {
            status: logProbeStatus(focusJob, logs),
            last_log_at: latestLogTimestamp(log),
          },
        }
      : null,
    first_failure: failure
      ? {
          job_id: jobId(failure.job),
          job_name: jobName(failure.job),
          job_conclusion: jobConclusion(failure.job),
          step_number: failure.step ? stepNumber(failure.step) : null,
          step_name: failure.step ? stepName(failure.step) : null,
          step_conclusion: failure.step ? stepConclusion(failure.step) : null,
          failed_at: canonicalTimestamp(stringField(
            failure.step ?? failure.job,
            'completed_at',
            'completedAt',
          )),
        }
      : null,
    vm_state: vm,
    checkpoint_recovery: checkpoint,
    completed_actual_stages: completedActualStages(jobs, artifactList, checkpoint, vm),
    completed_jobs: jobs
      .filter((job) => jobConclusion(job) === 'success')
      .map((job) => ({
        job_id: jobId(job),
        job_name: jobName(job),
        completed_at: canonicalTimestamp(stringField(job, 'completed_at', 'completedAt')),
      })),
    produced_artifacts: artifactList,
    next_action: action,
  };
}

function paginatedPayload(endpoint: string, key: 'jobs' | 'artifacts'): JsonRecord {
  const raw = runGitHubCli(
    ['api', '--paginate', '--slurp', endpoint],
    `Read GitHub ${key}`,
    { maxBuffer: 32 * 1024 * 1024 },
  );
  const pages = records(JSON.parse(raw));
  return { [key]: pages.flatMap((page) => records(page[key])) };
}

function fetchJobLog(repository: string, job: JsonRecord): string | null {
  if (jobStatus(job) !== 'completed') return null;
  try {
    return runGitHubCli(
      ['api', `repos/${repository}/actions/jobs/${jobId(job)}/logs`],
      `Read GitHub job ${jobId(job)} log`,
      { maxBuffer: 32 * 1024 * 1024 },
    );
  } catch {
    return null;
  }
}

function usage(exitCode = 2): never {
  process.stderr.write(
    `Usage: npm run release:incident-status -- --run-id <id> [--repo <owner/name>] [--now <iso>]\n`,
  );
  process.exit(exitCode);
}

function main(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      'run-id': { type: 'string' },
      repo: { type: 'string' },
      now: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) usage(0);
  const runId = values['run-id'];
  const repository = values.repo ?? process.env.OPL_RELEASE_REPO ?? defaultRepository;
  if (!runId || !/^[1-9]\d*$/.test(runId)) usage();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('--repo must be an exact owner/name repository.');
  }

  const run = record(JSON.parse(runGitHubCli(
    ['api', `repos/${repository}/actions/runs/${runId}`],
    `Read GitHub run ${runId}`,
  )), 'GitHub run payload');
  const jobsPayload = paginatedPayload(
    `repos/${repository}/actions/runs/${runId}/jobs?per_page=100`,
    'jobs',
  );
  const artifactsPayload = paginatedPayload(
    `repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`,
    'artifacts',
  );
  const jobs = normalizedJobs(jobsPayload);
  const failure = firstTerminalFailure(jobs);
  const active = failure
    ? null
    : focusForActiveRun(jobs, {}, timestampMs(values.now ?? new Date().toISOString()) ?? Date.now());
  const focusJob = failure?.job ?? active?.job ?? null;
  const logs: JobLogMap = {};
  if (focusJob) logs[jobId(focusJob)] = fetchJobLog(repository, focusJob);

  const status = buildReleaseIncidentStatus({
    run,
    jobs: jobsPayload,
    artifacts: artifactsPayload,
    jobLogs: logs,
    now: values.now,
  });
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
