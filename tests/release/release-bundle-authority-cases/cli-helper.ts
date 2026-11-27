import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseJsonText } from '../../../scripts/release-bundle-authority/support.ts';

export const repoRoot = path.resolve(import.meta.dirname, '../../..');
const cliEntryPath = path.join(repoRoot, 'scripts', 'release-bundle-cli.ts');

let isolatedStateDir: string | null = null;

function cliTestStateDir() {
  if (!isolatedStateDir) {
    isolatedStateDir = fs.mkdtempSync(path.join(os.tmpdir(), `opl-app-rb-cli-state-${process.pid}-`));
    process.once('exit', () => {
      if (isolatedStateDir) {
        fs.rmSync(isolatedStateDir, { recursive: true, force: true });
      }
    });
  }
  return isolatedStateDir;
}

function runCliProcess(args: string[], cwd: string, envOverrides: Record<string, string> = {}): SpawnSyncReturns<string> {
  const options: SpawnSyncOptionsWithStringEncoding = {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      OPL_STATE_DIR: cliTestStateDir(),
      ...envOverrides,
    },
    timeout: 30_000,
    killSignal: 'SIGTERM',
  };
  return spawnSync(process.execPath, ['--experimental-strip-types', cliEntryPath, ...args], options);
}

export function runCliInCwd(args: string[], cwd: string, envOverrides: Record<string, string> = {}) {
  const result = runCliProcess(args, cwd, envOverrides);
  assert.equal(
    result.status,
    0,
    `CLI command failed: ${cliEntryPath} ${args.join(' ')}\nstatus=${result.status}\nstdout=${result.stdout}\nstderr=${result.stderr}`,
  );
  return parseJsonText(result.stdout) as any;
}

export function runCliFailureInCwd(args: string[], cwd: string, envOverrides: Record<string, string> = {}) {
  const result = runCliProcess(args, cwd, envOverrides);
  assert.notEqual(result.status, 0, `Expected failure for ${args.join(' ')}`);
  return {
    status: result.status ?? 1,
    payload: parseJsonText(result.stderr) as any,
  };
}
