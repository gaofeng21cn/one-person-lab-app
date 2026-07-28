#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';
import { readAppShellAdapterContract, resolveActiveShellPaths } from './app-shell-adapter.ts';
import {
  ensureActiveShellCheckout,
  ensureShellHistory,
  isGitCheckout,
} from './active-shell-checkout.ts';

export { ensureActiveShellCheckout, ensureShellHistory, isGitCheckout } from './active-shell-checkout.ts';

function parseArgs(argv) {
  const { values } = parseNodeArgs({
    args: argv.slice(2),
    options: {
      ref: { type: 'string' },
      repo: { type: 'string' },
      reset: { type: 'boolean' },
    } as const,
    allowPositionals: false,
    strict: true,
  });
  return {
    ref: values.ref ?? process.env.OPL_APP_SHELL_REF ?? '',
    repo: values.repo ?? process.env.OPL_APP_SHELL_REPO ?? '',
    reset: values.reset === true,
  };
}

function resolveShellSourceLayout(shellRoot) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: shellRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) throw new Error(`Unable to resolve active shell Git root: ${result.stderr || ''}`);
  const topLevel = result.stdout.trim();
  const resolvedShellRoot = fs.realpathSync(shellRoot);
  return path.resolve(topLevel) === path.resolve(resolvedShellRoot) ? 'external_checkout_root' : 'local_nested_source';
}

function main() {
  const args = parseArgs(process.argv);
  const contract = readAppShellAdapterContract();
  const source = contract.shell_source;
  const shellPaths = resolveActiveShellPaths({ contract });
  const shellRoot = shellPaths.shellRoot;
  const repo = args.repo || `git@github.com:${source.owner_repo}.git`;
  const ref = args.ref || source.default_ref || 'main';

  if (args.reset) {
    fs.rmSync(shellRoot, { recursive: true, force: true });
  }

  ensureActiveShellCheckout({
    shellRoot,
    repo,
    ref,
    alignRef: true,
  });

  const packageJsonPath = shellPaths.packageManifestPath;
  const agentsPath = shellPaths.agentsGuidePath;
  if (!fs.existsSync(packageJsonPath) || !fs.existsSync(agentsPath)) {
    throw new Error(`${source.checkout_path} is missing required shell files.`);
  }

  const headResult = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    cwd: shellRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (headResult.status !== 0) throw new Error(`Unable to resolve active shell HEAD: ${headResult.stderr || ''}`);
  const head = headResult.stdout.trim();
  console.log(JSON.stringify({
    status: 'active_shell_ready',
    shell_root: shellPaths.shellRootForDisplay,
    source_repo: source.owner_repo,
    ref,
    head,
    source_layout: resolveShellSourceLayout(shellRoot),
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
