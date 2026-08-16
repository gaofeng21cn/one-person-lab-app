#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs as parseNodeArgs } from 'node:util';
import { runGitHubCli as runGh } from './release-file-helpers.ts';
import {
  arrayOrEmpty as asArray,
  numberField,
  readJsonFile as readJson,
  recordOrNull as asRecord,
  stringField,
} from './release-json-helpers.ts';

type JsonRecord = Record<string, unknown>;

type Options = {
  repo: string;
  runIds: string[];
  runJsonPaths: string[];
  output: string;
  markdown: string;
  top: number;
  agentWallTime: string;
  operationKind: string;
};

const defaultRepo = 'gaofeng21cn/one-person-lab-app';
const commandMaxBuffer = 32 * 1024 * 1024;

function defaultOptions(): Options {
  return {
    repo: process.env.OPL_RELEASE_REPO || defaultRepo,
    runIds: [],
    runJsonPaths: [],
    output: '',
    markdown: '',
    top: 12,
    agentWallTime: '',
    operationKind: '',
  };
}

function usage(): void {
  process.stdout.write(`Usage:
  npm run release:actions-timing -- --run-id <github-actions-run-id> [--run-id <id> ...]
  npm run release:actions-timing -- --run-json <path> [--run-json <path> ...]

Options:
  --repo <owner/name>        GitHub repository. Default: ${defaultRepo}
  --run-id <id>             Fetch one GitHub Actions run with gh.
  --run-json <path>         Read a saved gh run JSON payload.
  --output <path>           Write JSON summary.
  --markdown <path>         Write Markdown summary.
  --top <n>                 Number of slow jobs/steps to include. Default: 12.
  --agent-wall-time <dur>   Operator-loop duration, for example 2h6m43s.
  --operation-kind <kind>   Structured operation label to carry into the summary (standard|resume_standard|append_full|certification).
  --help                    Show this message.
`);
}

function parseArgs(argv: string[]): Options {
  const parsed = defaultOptions();
  const { values } = parseNodeArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h' },
      repo: { type: 'string' },
      'run-id': { type: 'string', multiple: true },
      'run-json': { type: 'string', multiple: true },
      output: { type: 'string' },
      markdown: { type: 'string' },
      top: { type: 'string' },
      'agent-wall-time': { type: 'string' },
      'operation-kind': { type: 'string' },
    },
  });

  if (values.help) {
    usage();
    process.exit(0);
  }

  parsed.runIds = values['run-id'] ?? parsed.runIds;
  parsed.runJsonPaths = values['run-json']?.map((filePath) => path.resolve(filePath)) ?? parsed.runJsonPaths;
  parsed.repo = values.repo ?? parsed.repo;
  parsed.output = values.output ? path.resolve(values.output) : parsed.output;
  parsed.markdown = values.markdown ? path.resolve(values.markdown) : parsed.markdown;
  parsed.agentWallTime = values['agent-wall-time'] ?? parsed.agentWallTime;
  parsed.operationKind = values['operation-kind'] ?? parsed.operationKind;
  if (values.top) parsed.top = parsePositiveInteger(values.top, '--top');

  if (parsed.runIds.length === 0 && parsed.runJsonPaths.length === 0) {
    throw new Error('Pass at least one --run-id <id> or --run-json <file>.');
  }
  return parsed;
}

function parsePositiveInteger(value: string, label: string): number {
  if (!/^\d+$/.test(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return Number(value);
}

function parseDateMs(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim() || value.startsWith('0001-01-01')) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function secondsBetween(start: unknown, end: unknown): number | null {
  const left = parseDateMs(start);
  const right = parseDateMs(end);
  if (left === null || right === null || right < left) return null;
  return Math.round((right - left) / 1000);
}

function parseDurationSeconds(value: string): number | null {
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

function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'n/a';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}h${minutes}m${rest}s`;
  if (minutes > 0) return `${minutes}m${rest}s`;
  return `${rest}s`;
}

function writeJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function normalizeRunPayload(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) {
    return payload.map((entry) => asRecord(entry)).filter((entry): entry is JsonRecord => entry !== null);
  }
  const record = asRecord(payload);
  if (!record) throw new Error('Run JSON must be an object or array.');
  const nestedRuns = asArray(record.runs);
  if (nestedRuns.length > 0) {
    return nestedRuns.map((entry) => asRecord(entry)).filter((entry): entry is JsonRecord => entry !== null);
  }
  return [record];
}

function fetchRunFromGh(options: Options, runId: string): JsonRecord {
  const stdout = runGh([
    'run',
    'view',
    runId,
    '--repo',
    options.repo,
    '--json',
    [
      'databaseId',
      'status',
      'conclusion',
      'createdAt',
      'updatedAt',
      'startedAt',
      'headSha',
      'headBranch',
      'workflowName',
      'displayTitle',
      'event',
      'url',
      'jobs',
    ].join(','),
  ], `Fetch GitHub Actions run ${runId}`, { maxBuffer: commandMaxBuffer });
  return normalizeRunPayload(JSON.parse(stdout))[0];
}

function loadRuns(options: Options): JsonRecord[] {
  const fromFiles = options.runJsonPaths.flatMap((filePath) => normalizeRunPayload(readJson(filePath)));
  const fromGh = options.runIds.map((runId) => fetchRunFromGh(options, runId));
  return [...fromFiles, ...fromGh].sort((left, right) => {
    const leftMs = parseDateMs(left.createdAt ?? left.created_at) ?? 0;
    const rightMs = parseDateMs(right.createdAt ?? right.created_at) ?? 0;
    return leftMs - rightMs;
  });
}

function runId(run: JsonRecord): string {
  const value = run.databaseId ?? run.database_id ?? run.id;
  return value === undefined || value === null ? 'unknown' : String(value);
}

function jobName(job: JsonRecord): string {
  return stringField(job, 'name') ?? stringField(job, 'displayName') ?? stringField(job, 'job_name') ?? 'unknown';
}

function stepName(step: JsonRecord): string {
  return stringField(step, 'name') ?? stringField(step, 'displayName') ?? 'unknown';
}

function jobDuration(job: JsonRecord): number | null {
  return secondsBetween(job.startedAt ?? job.started_at, job.completedAt ?? job.completed_at);
}

function stepDuration(step: JsonRecord): number | null {
  return secondsBetween(step.startedAt ?? step.started_at, step.completedAt ?? step.completed_at);
}

function runWallSeconds(run: JsonRecord): number | null {
  return numberField(run, 'workflow_wall_time_seconds')
    ?? secondsBetween(run.createdAt ?? run.created_at, run.updatedAt ?? run.updated_at ?? run.completedAt ?? run.completed_at);
}

function runJobs(run: JsonRecord): JsonRecord[] {
  return asArray(run.jobs ?? run.workflow_jobs)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => entry !== null);
}

function conclusion(run: JsonRecord): string {
  return stringField(run, 'conclusion') || stringField(run, 'status') || 'unknown';
}

function isSuccessful(run: JsonRecord): boolean {
  return conclusion(run) === 'success';
}

const failedOrCancelledConclusions = new Set(['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure']);

function isFailedOrCancelled(run: JsonRecord): boolean {
  return failedOrCancelledConclusions.has(conclusion(run));
}

function earliestIso(values: Array<unknown>): string | null {
  const timestamps = values.map(parseDateMs).filter((value): value is number => value !== null);
  return timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : null;
}

function latestIso(values: Array<unknown>): string | null {
  const timestamps = values.map(parseDateMs).filter((value): value is number => value !== null);
  return timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;
}

function buildRunSummaries(runs: JsonRecord[], top: number) {
  return runs.map((run) => {
    const jobs = runJobs(run);
    const createdAt = stringField(run, 'createdAt') ?? stringField(run, 'created_at');
    const updatedAt = stringField(run, 'updatedAt') ?? stringField(run, 'updated_at') ?? stringField(run, 'completedAt') ?? stringField(run, 'completed_at');
    const firstJobStartedAt = earliestIso(jobs.map((job) => job.startedAt ?? job.started_at));
    const lastJobCompletedAt = latestIso(jobs.map((job) => job.completedAt ?? job.completed_at));
    const createdMs = parseDateMs(createdAt);
    const firstJobMs = parseDateMs(firstJobStartedAt);
    const phaseDurations = Object.fromEntries([
      ['admission', /admission|admit|preflight/i],
      ['build', /build|package|compile|finalizer/i],
      ['apple_wait', /notar|apple|staple/i],
      // "release" also appears in read-only resolver jobs such as
      // resolve-release-set. Keep publication tied to mutation/readback verbs.
      ['publication', /publish|upload|homebrew|latest/i],
      ['certification', /certif|vm smoke|first-run/i],
    ].map(([phase, pattern]) => {
      // Keep ordinary phases tied to their job taxonomy. Apple notarization is
      // emitted by the Full finalizer job, whose name carries the phase even
      // when its individual steps mention unrelated Apple preflight checks.
      const phasePattern = phase === 'apple_wait'
        ? /notar|apple|staple|finaliz/i
        : pattern;
      const phaseJobs = jobs.filter((job) => (
        stringField(job, 'conclusion') !== 'skipped' && phasePattern.test(jobName(job))
      ));
      const started = earliestIso(phaseJobs.map((job) => job.startedAt ?? job.started_at));
      const completed = latestIso(phaseJobs.map((job) => job.completedAt ?? job.completed_at));
      return [phase, started && completed ? secondsBetween(started, completed) : null];
    }));
    return {
      id: runId(run),
      workflow_name: stringField(run, 'workflowName') ?? stringField(run, 'workflow_name'),
      display_title: stringField(run, 'displayTitle') ?? stringField(run, 'display_title'),
      operation_kind: stringField(run, 'operationKind')
        ?? stringField(run, 'operation_kind')
        ?? inferOperationKind(stringField(run, 'displayTitle') ?? stringField(run, 'display_title')),
      status: stringField(run, 'status'),
      conclusion: stringField(run, 'conclusion'),
      url: stringField(run, 'url'),
      created_at: createdAt,
      first_job_started_at: firstJobStartedAt,
      updated_at: updatedAt,
      workflow_wall_time_seconds: runWallSeconds(run),
      queue_or_admission_seconds: createdMs !== null && firstJobMs !== null
        ? Math.round((firstJobMs - createdMs) / 1000)
        : null,
      job_span_seconds: firstJobStartedAt && lastJobCompletedAt ? secondsBetween(firstJobStartedAt, lastJobCompletedAt) : null,
      stage_durations_seconds: phaseDurations,
      slowest_jobs: jobs
        .map((job) => ({
          name: jobName(job),
          status: stringField(job, 'status'),
          conclusion: stringField(job, 'conclusion'),
          started_at: stringField(job, 'startedAt') ?? stringField(job, 'started_at'),
          completed_at: stringField(job, 'completedAt') ?? stringField(job, 'completed_at'),
          duration_seconds: jobDuration(job),
        }))
        .sort((left, right) => Number(right.duration_seconds ?? -1) - Number(left.duration_seconds ?? -1))
        .slice(0, top),
    };
  });
}

function inferOperationKind(title: string | null): string | null {
  if (!title) return null;
  if (/append_full|full append/i.test(title)) return 'append_full';
  if (/resume_standard/i.test(title)) return 'resume_standard';
  if (/certif/i.test(title)) return 'certification';
  if (/standard/i.test(title)) return 'standard';
  return null;
}

function buildTopSteps(runs: JsonRecord[], top: number) {
  return runs.flatMap((run) => runJobs(run).flatMap((job) => asArray(job.steps)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => entry !== null)
    .map((step) => ({
      run_id: runId(run),
      run_conclusion: conclusion(run),
      job_name: jobName(job),
      name: stepName(step),
      status: stringField(step, 'status'),
      conclusion: stringField(step, 'conclusion'),
      started_at: stringField(step, 'startedAt') ?? stringField(step, 'started_at'),
      completed_at: stringField(step, 'completedAt') ?? stringField(step, 'completed_at'),
      duration_seconds: stepDuration(step),
    }))))
    .sort((left, right) => Number(right.duration_seconds ?? -1) - Number(left.duration_seconds ?? -1))
    .slice(0, top);
}

function buildTopJobs(runs: JsonRecord[], top: number) {
  return runs.flatMap((run) => runJobs(run).map((job) => ({
    run_id: runId(run),
    run_conclusion: conclusion(run),
    name: jobName(job),
    status: stringField(job, 'status'),
    conclusion: stringField(job, 'conclusion'),
    started_at: stringField(job, 'startedAt') ?? stringField(job, 'started_at'),
    completed_at: stringField(job, 'completedAt') ?? stringField(job, 'completed_at'),
    duration_seconds: jobDuration(job),
  })))
    .sort((left, right) => Number(right.duration_seconds ?? -1) - Number(left.duration_seconds ?? -1))
    .slice(0, top);
}

function sumDurations(values: Array<number | null>): number {
  return values.reduce((sum, value) => sum + (value ?? 0), 0);
}

function buildSummary(options: Options, runs: JsonRecord[]) {
  const firstCreatedAt = earliestIso(runs.map((run) => run.createdAt ?? run.created_at));
  const lastUpdatedAt = latestIso(runs.map((run) => run.updatedAt ?? run.updated_at ?? run.completedAt ?? run.completed_at));
  const runSummaries = buildRunSummaries(runs, options.top);
  const runWalls = runSummaries.map((run) => run.workflow_wall_time_seconds);
  const failedOrCancelled = runs.filter(isFailedOrCancelled);
  const agentWallTimeSeconds = parseDurationSeconds(options.agentWallTime);
  const totalSpanSeconds = firstCreatedAt && lastUpdatedAt ? secondsBetween(firstCreatedAt, lastUpdatedAt) : null;
  const conclusionCounts = runs.reduce<Record<string, number>>((counts, run) => {
    const value = conclusion(run);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
  const recoveryGaps = runs.slice(1).map((run, index) => ({
    from_run_id: runId(runs[index]!),
    to_run_id: runId(run),
    seconds: secondsBetween(
      runs[index]!.updatedAt ?? runs[index]!.updated_at ?? runs[index]!.completedAt ?? runs[index]!.completed_at,
      run.createdAt ?? run.created_at,
    ),
  }));
  const explicitOperationKind = options.operationKind.trim() || null;
  return {
    schema: 'opl_github_actions_timing_summary.v1',
    repo: options.repo,
    generated_at: new Date().toISOString(),
    source: {
      run_ids: runs.map(runId),
      run_json_paths: options.runJsonPaths,
      operation_kind: explicitOperationKind,
      gh_command: 'gh run view <run-id> --json databaseId,status,conclusion,createdAt,updatedAt,startedAt,headSha,headBranch,workflowName,displayTitle,event,url,jobs',
    },
    timing: {
      first_created_at: firstCreatedAt,
      last_updated_at: lastUpdatedAt,
      total_span_seconds: totalSpanSeconds,
      accumulated_run_wall_seconds: sumDurations(runWalls),
      successful_run_wall_seconds: sumDurations(runSummaries
        .filter((_, index) => isSuccessful(runs[index]))
        .map((run) => run.workflow_wall_time_seconds)),
      failed_or_cancelled_run_wall_seconds: sumDurations(failedOrCancelled.map(runWallSeconds)),
      failed_or_cancelled_run_count: failedOrCancelled.length,
      agent_wall_time_seconds: agentWallTimeSeconds,
      unaccounted_operator_seconds: agentWallTimeSeconds !== null && totalSpanSeconds !== null && agentWallTimeSeconds >= totalSpanSeconds
        ? agentWallTimeSeconds - totalSpanSeconds
        : null,
      recovery_gap_seconds: sumDurations(recoveryGaps.map((gap) => gap.seconds)),
      recovery_gaps: recoveryGaps,
    },
    conclusion_counts: conclusionCounts,
    operation_kind: explicitOperationKind
      ?? ([...new Set(runSummaries.map((run) => run.operation_kind).filter(Boolean))].join(',') || null),
    runs: runSummaries,
    top_jobs: buildTopJobs(runs, options.top),
    top_steps: buildTopSteps(runs, options.top),
  };
}

function markdownRows(entries: Array<Record<string, unknown>>, columns: string[]): string[] {
  if (entries.length === 0) return ['_No entries._'];
  return [
    `| ${columns.join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...entries.map((entry) => `| ${columns.map((column) => {
      const value = entry[column];
      if (column.endsWith('seconds')) return formatDuration(typeof value === 'number' ? value : null);
      return String(value ?? 'n/a')
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|')
        .replace(/[\r\n]+/g, ' ');
    }).join(' | ')} |`),
  ];
}

function buildMarkdown(summary: ReturnType<typeof buildSummary>): string {
  const timing = summary.timing;
  const lines = [
    '# GitHub Actions Timing Summary',
    '',
    `- Repo: \`${summary.repo}\``,
    `- Runs: ${summary.source.run_ids.map((id) => `\`${id}\``).join(', ')}`,
    `- Operation kind: ${summary.operation_kind ?? 'n/a'}`,
    `- Total span: ${formatDuration(timing.total_span_seconds)}`,
    `- Accumulated run wall time: ${formatDuration(timing.accumulated_run_wall_seconds)}`,
    `- Recovery gaps between runs: ${formatDuration(timing.recovery_gap_seconds)}`,
    `- Failed/cancelled run tax: ${formatDuration(timing.failed_or_cancelled_run_wall_seconds)} across ${timing.failed_or_cancelled_run_count} run(s)`,
  ];
  if (timing.agent_wall_time_seconds !== null) {
    lines.push(`- Agent/operator wall time: ${formatDuration(timing.agent_wall_time_seconds)}`);
    lines.push(`- Unaccounted operator time outside Actions span: ${formatDuration(timing.unaccounted_operator_seconds)}`);
  }
  lines.push('', '## Runs', '');
  lines.push(...markdownRows(summary.runs as Array<Record<string, unknown>>, [
    'id',
    'workflow_name',
    'conclusion',
    'workflow_wall_time_seconds',
    'queue_or_admission_seconds',
    'job_span_seconds',
    'operation_kind',
  ]));
  lines.push('', '## Top Jobs', '');
  lines.push(...markdownRows(summary.top_jobs as Array<Record<string, unknown>>, [
    'run_id',
    'run_conclusion',
    'name',
    'conclusion',
    'duration_seconds',
  ]));
  lines.push('', '## Top Steps', '');
  lines.push(...markdownRows(summary.top_steps as Array<Record<string, unknown>>, [
    'run_id',
    'job_name',
    'name',
    'conclusion',
    'duration_seconds',
  ]));
  return `${lines.join('\n')}\n`;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const runs = loadRuns(options);
  const summary = buildSummary(options, runs);
  if (options.output) writeJson(options.output, summary);
  if (options.markdown) writeText(options.markdown, buildMarkdown(summary));
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main();
