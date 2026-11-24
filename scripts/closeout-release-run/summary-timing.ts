import {
  arrayOrEmpty as asArray,
  numberField,
  recordOrNull as asRecord,
  stringField,
} from '../release-json-helpers.ts';
import type {
  ArtifactJson,
  AttestationVerificationSummary,
  FailedRerunTax,
  Job,
  JobSummary,
  JsonRecord,
  Options,
  RunTiming,
} from './types.ts';

export function parseDateMs(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function secondsBetween(start: unknown, end: unknown): number | null {
  const left = parseDateMs(start);
  const right = parseDateMs(end);
  if (left === null || right === null || right < left) return null;
  return Math.round((right - left) / 1000);
}

export function parseDurationSeconds(value: string): number | null {
  if (!value.trim()) return null;
  const compact = value.trim();
  if (/^\d+$/.test(compact)) return Number(compact);
  const hms = compact.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (hms && hms[0]) {
    return Number(hms[1] ?? 0) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0);
  }
  const colon = compact.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (colon) {
    return colon[3]
      ? Number(colon[1]) * 3600 + Number(colon[2]) * 60 + Number(colon[3])
      : Number(colon[1]) * 60 + Number(colon[2]);
  }
  return null;
}

function attestationVerifyCommands(options: Options): string[] {
  return [
    `gh attestation verify <downloaded-release-asset-path> --repo ${options.repo}`,
    `gh attestation verify oci://ghcr.io/gaofeng21cn/one-person-lab-webui@sha256:<digest> --repo ${options.repo}`,
  ];
}

export function sourceStatus(record: JsonRecord | null): string {
  return stringField(record, 'status') ?? 'missing';
}

export function artifactPresenceStatus(record: JsonRecord | null): string {
  if (!record) return 'missing';
  return stringField(record, 'status') ?? 'present';
}

export function summarizeAttestationVerification(
  options: Options,
  readArtifact: (options: Options, artifactName: string, fileName: string) => ArtifactJson,
  readNamed: (options: Options, fileName: string) => ArtifactJson,
): AttestationVerificationSummary {
  const artifactName = `release-attestation-verification-${options.version}`;
  const artifact = readArtifact(options, artifactName, 'attestation-verification.json');
  const artifactSummary = artifact.payload
    ? artifact
    : readArtifact(options, artifactName, 'attestation-verification-summary.json');
  const rootSummary = artifactSummary.payload
    ? artifactSummary
    : readNamed(options, 'attestation-verification.json');
  const fallback = rootSummary.payload ? rootSummary : readNamed(options, 'attestation-verification-summary.json');
  const verification = fallback.payload;
  const status = verification ? sourceStatus(verification) : 'missing';
  const verified = status === 'passed' || status === 'success' || status === 'verified';
  return {
    state: verification ? (verified ? 'verified' : 'failed') : 'missing',
    role: 'build_integrity_evidence',
    source_path: fallback.path,
    verification,
    verify_commands: verification ? [] : attestationVerifyCommands(options),
    does_not_replace: [
      'checksum verification',
      'remote asset readback',
      'codesign/spctl',
      'clean install/VM readiness',
      'candidate-record validation',
      'release-owner receipt',
    ],
    rule: 'Artifact attestation verifies build integrity for public release bytes; it is not release readiness evidence by itself.',
  };
}

function jobDuration(job: JsonRecord): number | null {
  const started = job.startedAt ?? job.started_at;
  const completed = job.completedAt ?? job.completed_at;
  return secondsBetween(started, completed);
}

function jobName(job: JsonRecord): string {
  return stringField(job, 'name') ?? stringField(job, 'displayName') ?? stringField(job, 'job_name') ?? 'unknown';
}

export function summarizeJobs(jobs: JsonRecord[]): JobSummary {
  const slowest: Job[] = jobs
    .map((job) => ({
      name: jobName(job),
      status: stringField(job, 'status'),
      conclusion: stringField(job, 'conclusion'),
      started_at: stringField(job, 'startedAt') ?? stringField(job, 'started_at'),
      completed_at: stringField(job, 'completedAt') ?? stringField(job, 'completed_at'),
      duration_seconds: jobDuration(job),
    }))
    .sort((left, right) => Number(right.duration_seconds ?? -1) - Number(left.duration_seconds ?? -1));
  const failed = slowest.filter((job) => job.conclusion && job.conclusion !== 'success' && job.conclusion !== 'skipped');
  return {
    count: jobs.length,
    slowest_jobs: slowest.slice(0, 12),
    failed_jobs: failed,
  };
}

export function summarizeRunTiming(run: JsonRecord, jobs: JsonRecord[]): RunTiming {
  const createdAt = stringField(run, 'createdAt') ?? stringField(run, 'created_at');
  const startedAt = stringField(run, 'runStartedAt')
    ?? stringField(run, 'run_started_at')
    ?? stringField(run, 'startedAt')
    ?? stringField(run, 'started_at');
  const updatedAt = stringField(run, 'updatedAt') ?? stringField(run, 'updated_at');
  const jobStarts = jobs
    .map((job) => parseDateMs(job.startedAt ?? job.started_at))
    .filter((value): value is number => value !== null);
  const jobEnds = jobs
    .map((job) => parseDateMs(job.completedAt ?? job.completed_at))
    .filter((value): value is number => value !== null);
  const firstJobStartMs = jobStarts.length > 0 ? Math.min(...jobStarts) : null;
  const lastJobEndMs = jobEnds.length > 0 ? Math.max(...jobEnds) : null;
  const createdMs = parseDateMs(createdAt);
  const updatedMs = parseDateMs(updatedAt);
  const firstJobStartedAt = firstJobStartMs !== null ? new Date(firstJobStartMs).toISOString() : null;
  return {
    created_at: createdAt,
    run_started_at: startedAt,
    first_job_started_at: firstJobStartedAt,
    updated_at: updatedAt,
    workflow_wall_time_seconds: secondsBetween(createdAt, updatedAt),
    queue_or_admission_seconds: createdMs !== null && firstJobStartMs !== null
      ? Math.round((firstJobStartMs - createdMs) / 1000)
      : secondsBetween(createdAt, startedAt),
    runner_execution_seconds: firstJobStartMs !== null && updatedMs !== null && updatedMs >= firstJobStartMs
      ? Math.round((updatedMs - firstJobStartMs) / 1000)
      : secondsBetween(startedAt, updatedAt),
    first_job_delay_seconds: createdMs !== null && firstJobStartMs !== null
      ? Math.round((firstJobStartMs - createdMs) / 1000)
      : null,
    job_span_seconds: firstJobStartMs !== null && lastJobEndMs !== null && lastJobEndMs >= firstJobStartMs
      ? Math.round((lastJobEndMs - firstJobStartMs) / 1000)
      : null,
  };
}

export function failedGateSummaries(readiness: JsonRecord | null): JsonRecord[] {
  return asArray(readiness?.failed_required_gates)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => entry !== null)
    .map((entry) => ({
      id: stringField(entry, 'id') ?? 'unknown',
      status: stringField(entry, 'status') ?? 'unknown',
      reason: stringField(entry, 'reason') ?? 'no reason recorded',
    }));
}

function previousRunDurationSeconds(run: JsonRecord): number | null {
  return numberField(run, 'workflow_wall_time_seconds')
    ?? numberField(run, 'duration_seconds')
    ?? secondsBetween(
      run.createdAt ?? run.created_at ?? run.startedAt ?? run.started_at,
      run.updatedAt ?? run.updated_at ?? run.completedAt ?? run.completed_at,
    );
}

function failedConclusion(value: string | null): boolean {
  return Boolean(value && value !== 'success' && value !== 'skipped');
}

export function summarizeFailedRerunTax(run: JsonRecord, jobs: JobSummary, timing: RunTiming): FailedRerunTax {
  const previousRuns = [
    ...asArray(run.previous_runs),
    ...asArray(run.previousRuns),
    ...asArray(run.failed_runs),
    ...asArray(run.failedRuns),
  ]
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => entry !== null);
  const previousFailedRuns = previousRuns
    .filter((entry) => failedConclusion(stringField(entry, 'conclusion')))
    .map((entry) => ({
      id: stringField(entry, 'id') ?? stringField(entry, 'databaseId') ?? stringField(entry, 'run_id'),
      conclusion: stringField(entry, 'conclusion'),
      status: stringField(entry, 'status'),
      url: stringField(entry, 'url'),
      duration_seconds: previousRunDurationSeconds(entry),
    }));
  const previousFailedSeconds = previousFailedRuns
    .reduce((sum, entry) => sum + (entry.duration_seconds ?? 0), 0);
  const currentConclusion = stringField(run, 'conclusion');
  const currentFailedWorkflowSeconds = failedConclusion(currentConclusion)
    ? timing.workflow_wall_time_seconds
    : null;
  const currentFailedJobSeconds = jobs.failed_jobs
    .reduce((sum, job) => sum + (job.duration_seconds ?? 0), 0);
  const failedRerunTaxSeconds = previousFailedSeconds + (currentFailedWorkflowSeconds ?? 0);
  return {
    failed_rerun_tax_seconds: failedRerunTaxSeconds,
    previous_failed_run_count: previousFailedRuns.length,
    previous_failed_runs: previousFailedRuns,
    current_failed_workflow_seconds: currentFailedWorkflowSeconds,
    current_failed_job_tax_seconds: currentFailedJobSeconds,
    source: previousFailedRuns.length > 0
      ? 'run.previous_runs'
      : currentFailedWorkflowSeconds !== null
        ? 'current_run_conclusion'
        : jobs.failed_jobs.length > 0
          ? 'jobs.failed_jobs'
          : 'current_run_no_failed_rerun_tax',
    note: 'Failed rerun tax counts failed workflow wall time when the run metadata includes previous failed runs or the current run itself failed.',
  };
}
