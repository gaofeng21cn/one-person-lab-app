#!/usr/bin/env node

import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';
import { readAppShellAdapterContract, resolveActiveShellPaths } from './app-shell-adapter.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const parsed = {
    maxWorkers: Number.parseInt(process.env.OPL_APP_TEST_MAX_WORKERS ?? '1', 10),
    project: 'all',
    fileParallelism: false,
    passThrough: [],
  };
  const { values, positionals, tokens } = parseNodeArgs({
    args: argv.slice(2),
    options: {
      'max-workers': { type: 'string' },
      project: { type: 'string' },
      'file-parallelism': { type: 'boolean' },
    } as const,
    allowPositionals: true,
    strict: true,
    tokens: true,
  });
  const hasTerminator = tokens.some((token) => token.kind === 'option-terminator');
  if (!hasTerminator && positionals.length > 0) {
    throw new Error(`Unknown argument: ${positionals[0]}`);
  }
  parsed.passThrough = hasTerminator ? positionals : [];
  if (values['max-workers']) {
    const value = Number.parseInt(values['max-workers'], 10);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error('Expected a positive integer after --max-workers');
    }
    parsed.maxWorkers = value;
  }
  if (values.project) {
    if (!['all', 'node', 'dom'].includes(values.project)) {
      throw new Error('Expected one of all, node, dom after --project');
    }
    parsed.project = values.project;
  }
  if (values['file-parallelism']) {
    parsed.fileParallelism = true;
  }

  return parsed;
}

function selectedProjects(project) {
  return project === 'all' ? ['node', 'dom'] : [project];
}

function vitestProjectEnv(projects) {
  const env = { ...process.env };
  if (projects.includes('dom')) {
    env.VITEST_INCLUDE_DOM = '1';
  }
  if (projects.includes('node')) {
    env.VITEST_INCLUDE_INTEGRATION = '1';
  }
  return env;
}

function runVitest({ shellRoot, projects, fileParallelism, maxWorkers, passThrough }) {
  const args = ['vitest', 'run'];
  for (const project of projects) {
    args.push('--project', project);
  }
  args.push(`--maxWorkers=${maxWorkers}`);
  if (!fileParallelism) {
    args.push('--no-file-parallelism');
  }
  args.push(...passThrough);

  console.log(`\n==> ${projects.join(', ')} active shell project test(s)`);
  const result = spawnSync('bunx', args, {
    cwd: shellRoot,
    stdio: 'inherit',
    env: vitestProjectEnv(projects),
  });

  if (result.status !== 0) {
    throw new Error(`${projects.join(', ')} active shell test project(s) failed`);
  }
}

const args = parseArgs(process.argv);
const contract = readAppShellAdapterContract();
const shellPaths = resolveActiveShellPaths({ contract });
const shellRoot = shellPaths.shellRoot;

if (!existsSync(shellPaths.vitestConfigPath)) {
  throw new Error(`Missing active shell Vitest config: ${path.relative(root, shellPaths.vitestConfigPath)}`);
}

const projects = selectedProjects(args.project);

runVitest({
  shellRoot,
  projects,
  fileParallelism: args.fileParallelism,
  maxWorkers: args.maxWorkers,
  passThrough: args.passThrough,
});

console.log(`\nActive shell tests passed (${projects.join(', ')} project(s)).`);
