#!/usr/bin/env node

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseArgs as parseNodeArgs } from 'node:util';

type RunnerInventoryEntry = {
  id?: number | string | null;
  name?: string;
  os?: string;
  status?: string;
  busy?: boolean;
  labels?: Array<string | { name?: string }>;
};

type NormalizedRunner = {
  id: number | string | null;
  name: string;
  os: string;
  status: string;
  busy: boolean;
  labels: string[];
};

type Options = {
  repo: string;
  ref: string;
  workflow: string;
  runnerLabelsJson: string;
  runnerInventoryJson: string;
  runnerInventoryFile: string;
  image: string;
  artifactName: string;
  port: string;
  healthTimeout: string;
  execute: boolean;
  json: boolean;
};

const defaultRunnerLabels = ['self-hosted', 'Windows', 'X64', 'docker-webui-clean-vm'];

function usage(): void {
  process.stdout.write(`Usage:
  node --experimental-strip-types scripts/dispatch-docker-webui-clean-windows-smoke.ts [--execute] [--json]

Options:
  --repo <owner/name>              GitHub repository. Default: gaofeng21cn/one-person-lab-app.
  --ref <ref>                      Workflow ref. Default: main.
  --workflow <file-or-name>        Workflow file/name. Default: docker-webui-clean-vm.yml.
  --runner-labels-json <json>      Required runner labels JSON array.
  --runner-inventory-json <json>   Pre-read runner inventory JSON array. If absent, gh api is used.
  --runner-inventory-file <path>   File containing runner inventory JSON array.
  --image <ref>                    Docker/WebUI image. Default: ghcr.io/gaofeng21cn/one-person-lab-webui:latest.
  --artifact-name <name>           Evidence artifact name. Default: docker-webui-clean-windows-vm-evidence.
  --port <port>                    Host port. Default: 3000.
  --health-timeout <seconds>       Health timeout. Default: 180.
  --execute                        Actually dispatch the workflow. Default is dry-run.
  --json                           Print machine-readable output.
`);
}

function defaultOptions(): Options {
  return {
    repo: 'gaofeng21cn/one-person-lab-app',
    ref: 'main',
    workflow: 'docker-webui-clean-vm.yml',
    runnerLabelsJson: JSON.stringify(defaultRunnerLabels),
    runnerInventoryJson: '',
    runnerInventoryFile: '',
    image: 'ghcr.io/gaofeng21cn/one-person-lab-webui:latest',
    artifactName: 'docker-webui-clean-windows-vm-evidence',
    port: '3000',
    healthTimeout: '180',
    execute: false,
    json: false,
  };
}

function parseArgs(argv: string[]): Options {
  const parsed = defaultOptions();
  const { values } = parseNodeArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h' },
      execute: { type: 'boolean' },
      json: { type: 'boolean' },
      repo: { type: 'string' },
      ref: { type: 'string' },
      workflow: { type: 'string' },
      'runner-labels-json': { type: 'string' },
      'runner-inventory-json': { type: 'string' },
      'runner-inventory-file': { type: 'string' },
      image: { type: 'string' },
      'artifact-name': { type: 'string' },
      port: { type: 'string' },
      'health-timeout': { type: 'string' },
    },
  });
  if (values.help) {
    usage();
    process.exit(0);
  }
  if (values.execute) parsed.execute = true;
  if (values.json) parsed.json = true;
  if (typeof values.repo === 'string') parsed.repo = values.repo;
  if (typeof values.ref === 'string') parsed.ref = values.ref;
  if (typeof values.workflow === 'string') parsed.workflow = values.workflow;
  if (typeof values['runner-labels-json'] === 'string') parsed.runnerLabelsJson = values['runner-labels-json'];
  if (typeof values['runner-inventory-json'] === 'string') parsed.runnerInventoryJson = values['runner-inventory-json'];
  if (typeof values['runner-inventory-file'] === 'string') parsed.runnerInventoryFile = values['runner-inventory-file'];
  if (typeof values.image === 'string') parsed.image = values.image;
  if (typeof values['artifact-name'] === 'string') parsed.artifactName = values['artifact-name'];
  if (typeof values.port === 'string') parsed.port = values.port;
  if (typeof values['health-timeout'] === 'string') parsed.healthTimeout = values['health-timeout'];
  return parsed;
}

function parseJsonArray<T>(label: string, value: string): T[] {
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array`);
  return parsed as T[];
}

function normalizeRunner(runner: RunnerInventoryEntry): NormalizedRunner {
  return {
    id: runner.id ?? null,
    name: runner.name ?? '',
    os: runner.os ?? '',
    status: runner.status ?? '',
    busy: Boolean(runner.busy),
    labels: (runner.labels ?? [])
      .map((label) => typeof label === 'string' ? label : label.name)
      .filter((label): label is string => Boolean(label)),
  };
}

function readInventoryFromGh(repo: string): NormalizedRunner[] {
  const result = spawnSync('gh', ['api', `repos/${repo}/actions/runners`, '--paginate'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'failed to read repository Actions runner inventory');
  }
  const runners: RunnerInventoryEntry[] = [];
  for (const line of result.stdout.split('\n').filter(Boolean)) {
    const page = JSON.parse(line);
    runners.push(...(page.runners ?? []));
  }
  return runners.map(normalizeRunner);
}

function loadInventory(options: Options): { source: string; runners: NormalizedRunner[] } {
  if (options.runnerInventoryJson.trim()) {
    return {
      source: 'cli_json',
      runners: parseJsonArray<RunnerInventoryEntry>('runner-inventory-json', options.runnerInventoryJson).map(normalizeRunner),
    };
  }
  if (options.runnerInventoryFile.trim()) {
    return {
      source: 'file',
      runners: parseJsonArray<RunnerInventoryEntry>('runner-inventory-file', fs.readFileSync(options.runnerInventoryFile, 'utf8')).map(normalizeRunner),
    };
  }
  return {
    source: 'gh_api',
    runners: readInventoryFromGh(options.repo),
  };
}

function matchingRunners(runners: NormalizedRunner[], labels: string[]): NormalizedRunner[] {
  return runners.filter((runner) => {
    const observed = new Set(runner.labels);
    return runner.status === 'online' &&
      runner.busy === false &&
      labels.every((label) => observed.has(label));
  });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const runnerLabels = parseJsonArray<string>('runner-labels-json', options.runnerLabelsJson);
  if (!runnerLabels.every((label) => typeof label === 'string' && label.trim())) {
    throw new Error('runner-labels-json must contain only non-empty strings');
  }
  const inventory = loadInventory(options);
  const eligible = matchingRunners(inventory.runners, runnerLabels);
  const runnerInventoryJson = JSON.stringify(inventory.runners);
  const fields = {
    platform: 'windows',
    runner_labels_json: JSON.stringify(runnerLabels),
    runner_inventory_json: runnerInventoryJson,
    image: options.image,
    artifact_name: options.artifactName,
    port: options.port,
    health_timeout: options.healthTimeout,
  };
  const ghArgs = [
    'workflow',
    'run',
    options.workflow,
    '--repo',
    options.repo,
    '--ref',
    options.ref,
    ...Object.entries(fields).flatMap(([key, value]) => ['-f', `${key}=${value}`]),
  ];
  const command = ['gh', ...ghArgs.map((arg) => shellQuote(arg))].join(' ');
  const summary = {
    schema: 'opl_docker_webui_clean_windows_dispatch_plan.v1',
    mode: options.execute ? 'execute' : 'dry_run',
    repo: options.repo,
    ref: options.ref,
    workflow: options.workflow,
    inventory_source: inventory.source,
    required_labels: runnerLabels,
    observed_runners: inventory.runners,
    eligible_runners: eligible,
    expected_preflight_status: eligible.length > 0 ? 'passed' : 'typed_blocker',
    expected_blocker_code: eligible.length > 0 ? null : 'missing_clean_windows_self_hosted_runner',
    gh_args: ghArgs,
    command,
    dispatch: null as null | { status: number | null; stdout: string; stderr: string },
  };

  if (options.execute) {
    const dispatched = spawnSync('gh', ghArgs, { encoding: 'utf8' });
    summary.dispatch = {
      status: dispatched.status,
      stdout: dispatched.stdout.trim(),
      stderr: dispatched.stderr.trim(),
    };
    if (dispatched.status !== 0) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      process.exit(dispatched.status ?? 1);
    }
  }

  if (options.json || options.execute) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${command}\n`);
}

main();
