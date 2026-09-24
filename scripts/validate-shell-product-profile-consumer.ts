#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { readActiveShellBuildProfile } from './active-shell-build-profile.ts';
import { syncAppProductProfileToShell } from './app-product-profile.ts';
import { appProductProfilePath } from './app-product-profile/paths.ts';

const fullShaPattern = /^[0-9a-f]{40}$/i;
const consumerTestPath = 'tests/unit/common-config/oplProductProfile.test.ts';

type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

export type ShellProductProfileConsumerOptions = {
  shellRoot: string;
  expectedShellSha: string;
  shellId?: 'aionui' | 'opl-studio';
};

export type ShellProductProfileConsumerReport = {
  schema: 'opl_shell_product_profile_consumer_gate.v1';
  status: 'passed';
  shell_sha: string;
  app_product_profile_sha256: string;
  consumer_test: string;
  projection: 'temporary_exact_shell_archive';
  source_shell_mutated: false;
};

function run(command: string, args: string[], cwd: string, timeoutMs = 120_000): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, OPL_APP_REPO_ROOT: path.resolve(path.dirname(appProductProfilePath), '..') },
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  };
}

function commandOutput(command: string, args: string[], cwd: string): string {
  const result = run(command, args, cwd);
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout, result.error?.message].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`);
  }
  return result.stdout;
}

function fileSha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function runShellProductProfileConsumerGate(
  options: ShellProductProfileConsumerOptions,
): ShellProductProfileConsumerReport {
  const shellRoot = fs.realpathSync(options.shellRoot);
  const buildProfile = { ...readActiveShellBuildProfile(), ...(options.shellId ? { id: options.shellId } : {}) };
  const consumerTest = buildProfile.id === 'opl-studio' ? 'scripts/validate-opl-studio-candidate.mjs' : consumerTestPath;
  const expectedShellSha = options.expectedShellSha.trim().toLowerCase();
  if (!fullShaPattern.test(expectedShellSha)) {
    throw new Error('Shell product-profile consumer gate requires a full expected Shell SHA.');
  }
  const shellHead = commandOutput('git', ['rev-parse', 'HEAD'], shellRoot).trim().toLowerCase();
  if (shellHead !== expectedShellSha) {
    throw new Error(`Shell consumer checkout HEAD ${shellHead} does not match expected ${expectedShellSha}.`);
  }
  const sourceStatusBefore = commandOutput(
    'git',
    ['status', '--porcelain', '--untracked-files=normal'],
    shellRoot,
  );
  if (sourceStatusBefore.trim()) {
    throw new Error('Shell consumer checkout must be clean before creating the isolated profile projection.');
  }

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-shell-profile-consumer-'));
  let consumerFailure: unknown = null;
  try {
    const archivePath = path.join(temporaryRoot, 'shell.tar');
    commandOutput('git', ['archive', '--format=tar', '--output', archivePath, expectedShellSha], shellRoot);
    commandOutput('tar', ['-xf', archivePath, '-C', temporaryRoot], shellRoot);
    const sourceNodeModules = path.join(shellRoot, 'node_modules');
    if (!fs.existsSync(sourceNodeModules)) {
      throw new Error('Shell consumer checkout dependencies are missing; run the frozen Shell install before this gate.');
    }
    fs.symlinkSync(sourceNodeModules, path.join(temporaryRoot, 'node_modules'), 'dir');
    const sync = syncAppProductProfileToShell(temporaryRoot);
    if (!sync.synced || !sync.verified) {
      throw new Error('Current App product profile was not projected into the isolated Shell consumer.');
    }
    const consumerBinary = buildProfile.id === 'opl-studio'
      ? process.execPath : path.join(temporaryRoot, 'node_modules', '.bin', 'vitest');
    if (!fs.existsSync(consumerBinary)) {
      throw new Error('Frozen Shell consumer dependencies do not expose the required consumer runner.');
    }
    const consumer = run(consumerBinary, buildProfile.id === 'opl-studio' ? [consumerTest] : ['run', consumerTest], temporaryRoot);
    if (consumer.status !== 0) {
      const detail = [consumer.stdout, consumer.stderr, consumer.error?.message].filter(Boolean).join('\n').trim();
      throw new Error(`Current App product profile failed the exact Shell consumer test${detail ? `:\n${detail}` : ''}`);
    }
  } catch (error) {
    consumerFailure = error;
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }

  const sourceStatusAfter = commandOutput(
    'git',
    ['status', '--porcelain', '--untracked-files=normal'],
    shellRoot,
  );
  if (sourceStatusAfter !== sourceStatusBefore) {
    throw new Error('Shell consumer checkout changed while the isolated profile gate ran.');
  }
  if (consumerFailure) throw consumerFailure;
  return {
    schema: 'opl_shell_product_profile_consumer_gate.v1',
    status: 'passed',
    shell_sha: shellHead,
    app_product_profile_sha256: fileSha256(appProductProfilePath),
    consumer_test: consumerTest,
    projection: 'temporary_exact_shell_archive',
    source_shell_mutated: false,
  };
}

function isMainModule(): boolean {
  return import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
}

if (isMainModule()) {
  try {
    const { values } = parseArgs({
      options: {
        'shell-root': { type: 'string' },
        'expected-shell-sha': { type: 'string' },
        output: { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    });
    if (!values['shell-root'] || !values['expected-shell-sha']) {
      throw new Error(
        'Usage: validate-shell-product-profile-consumer.ts --shell-root <path> --expected-shell-sha <sha> [--output <path>].',
      );
    }
    const report = runShellProductProfileConsumerGate({
      shellRoot: values['shell-root'],
      expectedShellSha: values['expected-shell-sha'],
    });
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (values.output) {
      const outputPath = path.resolve(values.output);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, serialized, 'utf8');
    }
    process.stdout.write(serialized);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
