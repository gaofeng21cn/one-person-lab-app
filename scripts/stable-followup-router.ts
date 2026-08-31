#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

type JsonRecord = Record<string, unknown>;

export type StableSourceOperation =
  | 'standard'
  | 'resume_standard'
  | 'append_full'
  | 'studio'
  | 'unknown';

export type StableManualFollowup =
  | 'reconcile_full_addon'
  | 'reconcile_homebrew_standard'
  | 'reconcile_homebrew_full'
  | 'reconcile_desktop_platform'
  | 'repair_additive';

export type StableFollowupRoute = {
  schema: 'opl_app_stable_followup_route.v1';
  trigger: 'workflow_run' | 'workflow_dispatch';
  source_run_id: string;
  source_operation: StableSourceOperation;
  source_conclusion: string | null;
  manual_operation: StableManualFollowup | null;
  lanes: {
    observe: boolean;
    full_addon: boolean;
    homebrew_standard: boolean;
    homebrew_full: boolean;
    desktop_platforms: boolean;
    repair_additive: boolean;
  };
};

const positiveIntegerPattern = /^[1-9][0-9]*$/;
const exactShaPattern = /^[0-9a-f]{40}$/;
const manualOperations = new Set<StableManualFollowup>([
  'reconcile_full_addon',
  'reconcile_homebrew_standard',
  'reconcile_homebrew_full',
  'reconcile_desktop_platform',
  'repair_additive',
]);

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as JsonRecord;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required.`);
  return value.trim();
}

function positiveRunId(value: unknown, label: string): string {
  const runId = requiredString(String(value ?? ''), label);
  if (!positiveIntegerPattern.test(runId)) throw new Error(`${label} must be a positive decimal integer.`);
  return runId;
}

export function classifyStableSourceOperation(displayTitle: string): StableSourceOperation {
  if (displayTitle.startsWith('OPL Stable standard ')) return 'standard';
  if (displayTitle.startsWith('OPL Stable resume_standard ')) return 'resume_standard';
  if (displayTitle.startsWith('OPL Stable append_full ')) return 'append_full';
  if (displayTitle.startsWith('OPL Stable Studio release ')) return 'studio';
  return 'unknown';
}

export function routeCompletedStableRun(value: unknown): StableFollowupRoute {
  const run = record(value, 'Stable run');
  const repository = record(run.repository, 'Stable run repository');
  const headRepository = record(run.head_repository, 'Stable run head repository');
  const sourceRunId = positiveRunId(run.id, 'Stable run id');
  const displayTitle = requiredString(run.display_title, 'Stable run display title');
  const conclusion = requiredString(run.conclusion, 'Stable run conclusion');
  const headSha = requiredString(run.head_sha, 'Stable run head SHA');
  if (
    repository.full_name !== 'gaofeng21cn/one-person-lab-app'
    || headRepository.full_name !== 'gaofeng21cn/one-person-lab-app'
    || run.path !== '.github/workflows/release-stable.yml'
    || run.event !== 'workflow_dispatch'
    || run.head_branch !== 'main'
    || run.run_attempt !== 1
    || run.status !== 'completed'
    || !exactShaPattern.test(headSha)
  ) {
    throw new Error('Stable follow-up routing requires one completed first-attempt canonical Stable run.');
  }

  const sourceOperation = classifyStableSourceOperation(displayTitle);
  const successful = conclusion === 'success';
  const standardPublication = successful
    && (sourceOperation === 'standard' || sourceOperation === 'resume_standard');
  return {
    schema: 'opl_app_stable_followup_route.v1',
    trigger: 'workflow_run',
    source_run_id: sourceRunId,
    source_operation: sourceOperation,
    source_conclusion: conclusion,
    manual_operation: null,
    lanes: {
      observe: true,
      full_addon: standardPublication,
      homebrew_standard: standardPublication,
      homebrew_full: false,
      desktop_platforms: standardPublication,
      repair_additive: false,
    },
  };
}

export function routeManualStableFollowup(input: {
  sourceRunId: string;
  operation: string;
}): StableFollowupRoute {
  const sourceRunId = positiveRunId(input.sourceRunId, 'Stable source run id');
  if (!manualOperations.has(input.operation as StableManualFollowup)) {
    throw new Error(`Unsupported Stable follow-up operation: ${input.operation || '<empty>'}.`);
  }
  const operation = input.operation as StableManualFollowup;
  return {
    schema: 'opl_app_stable_followup_route.v1',
    trigger: 'workflow_dispatch',
    source_run_id: sourceRunId,
    source_operation: 'unknown',
    source_conclusion: null,
    manual_operation: operation,
    lanes: {
      observe: false,
      full_addon: operation === 'reconcile_full_addon',
      homebrew_standard: operation === 'reconcile_homebrew_standard',
      homebrew_full: operation === 'reconcile_homebrew_full',
      desktop_platforms: operation === 'reconcile_desktop_platform',
      repair_additive: operation === 'repair_additive',
    },
  };
}

function writeRoute(route: StableFollowupRoute, outputPath: string, githubOutputPath?: string): void {
  const resolvedOutput = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, `${JSON.stringify(route, null, 2)}\n`, 'utf8');
  if (githubOutputPath) {
    const outputs = [
      `source_run_id=${route.source_run_id}`,
      `source_operation=${route.source_operation}`,
      `observe=${route.lanes.observe}`,
      `full_addon=${route.lanes.full_addon}`,
      `homebrew_standard=${route.lanes.homebrew_standard}`,
      `homebrew_full=${route.lanes.homebrew_full}`,
      `desktop_platforms=${route.lanes.desktop_platforms}`,
      `repair_additive=${route.lanes.repair_additive}`,
    ];
    fs.appendFileSync(path.resolve(githubOutputPath), `${outputs.join('\n')}\n`, 'utf8');
  }
}

function main(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      event: { type: 'string' },
      run: { type: 'string' },
      operation: { type: 'string' },
      'source-run-id': { type: 'string' },
      output: { type: 'string' },
      'github-output': { type: 'string' },
    },
    strict: true,
  });
  const event = requiredString(values.event, '--event');
  const output = requiredString(values.output, '--output');
  let route: StableFollowupRoute;
  if (event === 'workflow_run') {
    const runPath = requiredString(values.run, '--run');
    route = routeCompletedStableRun(JSON.parse(fs.readFileSync(path.resolve(runPath), 'utf8')));
  } else if (event === 'workflow_dispatch') {
    route = routeManualStableFollowup({
      sourceRunId: requiredString(values['source-run-id'], '--source-run-id'),
      operation: requiredString(values.operation, '--operation'),
    });
  } else {
    throw new Error(`Unsupported Stable follow-up event: ${event}.`);
  }
  writeRoute(route, output, values['github-output']);
  process.stdout.write(`${JSON.stringify(route)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
