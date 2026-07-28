import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export type ShellCommandRunner = (
  command: string,
  args: string[],
  options?: { capture?: boolean; cwd?: string },
) => { status?: number | null; stdout: string | null; stderr?: string | null; error?: Error };

export type EnsureActiveShellCheckoutOptions = {
  shellRoot: string;
  repo: string;
  ref: string;
  /** Align an existing checkout to ref. Missing checkouts are always aligned. */
  alignRef?: boolean;
  runner?: ShellCommandRunner;
};

export type EnsureActiveShellCheckoutResult = {
  shellRoot: string;
  ref: string;
  head: string;
  materialized: boolean;
  historyHydrated: boolean;
};

export function runShellCommand(
  command: string,
  args: string[],
  options: { capture?: boolean; cwd?: string } = {},
): { status: number | null; stdout: string; stderr: string; error?: Error } {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  };
}

function runChecked(
  command: string,
  args: string[],
  options: { capture?: boolean; cwd?: string } = {},
  runner: ShellCommandRunner = runShellCommand,
): { status: number | null; stdout: string; stderr?: string | null; error?: Error } {
  const result = runner(command, args, options);
  if (result.status !== undefined && result.status !== 0) {
    const detail = options.capture
      ? [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n').trim()
      : result.error?.message || '';
    throw new Error(`Command failed: ${command} ${args.join(' ')}${detail ? `\n${detail}` : ''}`);
  }
  return { ...result, stdout: String(result.stdout || '') };
}

function commandOutput(
  command: string,
  args: string[],
  cwd: string,
  runner: ShellCommandRunner,
): string {
  return String(runChecked(command, args, { cwd, capture: true }, runner).stdout || '').trim();
}

export function isGitCheckout(
  shellRoot: string,
  runner: ShellCommandRunner = runShellCommand,
): boolean {
  try {
    if (!fs.statSync(shellRoot).isDirectory()) return false;
    const result = runner('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: shellRoot,
      capture: true,
    });
    if (result.status !== undefined && result.status !== 0) return false;
    if (String(result.stdout || '').trim() !== 'true') return false;
    const topLevel = runner('git', ['rev-parse', '--show-toplevel'], {
      cwd: shellRoot,
      capture: true,
    });
    if (topLevel.status !== undefined && topLevel.status !== 0) return false;
    const resolvedTopLevel = String(topLevel.stdout || '').trim();
    if (!resolvedTopLevel) return false;
    return path.resolve(resolvedTopLevel) === path.resolve(fs.realpathSync(shellRoot));
  } catch {
    return false;
  }
}

export function ensureShellHistory(shellRoot: string, runner: ShellCommandRunner = runShellCommand): boolean {
  const shallow = commandOutput('git', ['rev-parse', '--is-shallow-repository'], shellRoot, runner);
  if (shallow === 'false') return false;
  if (shallow !== 'true') {
    throw new Error(`Unable to determine whether ${shellRoot} has complete Git history.`);
  }
  runChecked('git', ['fetch', '--no-tags', '--unshallow', 'origin'], { cwd: shellRoot }, runner);
  return true;
}

function refCandidates(ref: string): string[] {
  if (/^[0-9a-f]{7,40}$/i.test(ref)) return [ref];
  return [ref, `refs/heads/${ref}`, `refs/remotes/origin/${ref}`, `refs/tags/${ref}`];
}

export function resolveShellRef(
  shellRoot: string,
  ref: string,
  runner: ShellCommandRunner = runShellCommand,
): string | null {
  for (const candidate of refCandidates(ref.trim())) {
    const result = runner('git', ['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`], {
      cwd: shellRoot,
      capture: true,
    });
    const resolved = String(result.stdout || '').trim().split(/\s+/)[0] || '';
    if ((result.status === undefined || result.status === 0) && /^[0-9a-f]{40}$/i.test(resolved)) {
      return resolved.toLowerCase();
    }
  }
  return null;
}

function assertCleanCheckout(shellRoot: string, runner: ShellCommandRunner): void {
  const status = commandOutput('git', ['status', '--porcelain', '--untracked-files=normal'], shellRoot, runner);
  if (status) {
    throw new Error(`Active shell checkout must be clean before ref alignment: ${status}`);
  }
}

function cloneFullCheckout(repo: string, ref: string, shellRoot: string, runner: ShellCommandRunner): void {
  fs.mkdirSync(path.dirname(shellRoot), { recursive: true });
  // Do not use --depth: upstream-intake ancestry checks require complete history.
  runChecked('git', ['clone', '--no-tags', repo, shellRoot], { capture: true }, runner);
  const resolved = resolveShellRef(shellRoot, ref, runner);
  if (!resolved) {
    runChecked('git', ['fetch', '--no-tags', 'origin', ref], { cwd: shellRoot, capture: true }, runner);
  }
}

function alignCheckout(shellRoot: string, ref: string, runner: ShellCommandRunner): string {
  let resolved = resolveShellRef(shellRoot, ref, runner);
  if (!resolved) {
    runChecked('git', ['fetch', '--no-tags', 'origin', ref], { cwd: shellRoot, capture: true }, runner);
    resolved = resolveShellRef(shellRoot, ref, runner)
      ?? resolveShellRef(shellRoot, 'FETCH_HEAD', runner);
  }
  if (!resolved) {
    throw new Error(`Active shell ref ${ref} cannot be resolved in ${shellRoot}.`);
  }

  const head = commandOutput('git', ['rev-parse', 'HEAD'], shellRoot, runner).toLowerCase();
  if (head !== resolved) {
    assertCleanCheckout(shellRoot, runner);
    runChecked('git', ['checkout', '--detach', resolved], { cwd: shellRoot, capture: true }, runner);
  }
  return commandOutput('git', ['rev-parse', 'HEAD'], shellRoot, runner).toLowerCase();
}

export function ensureActiveShellCheckout(
  options: EnsureActiveShellCheckoutOptions,
): EnsureActiveShellCheckoutResult {
  const shellRoot = path.resolve(options.shellRoot);
  const ref = options.ref.trim() || 'main';
  const runner = options.runner ?? runShellCommand;
  const checkoutWasMissing = !fs.existsSync(shellRoot);
  let materialized = false;

  try {
    if (checkoutWasMissing) {
      cloneFullCheckout(options.repo, ref, shellRoot, runner);
      materialized = true;
    } else if (!isGitCheckout(shellRoot, runner)) {
      throw new Error(
        `Active shell path ${shellRoot} exists but is not a Git checkout; archive snapshots are valid only for isolated consumer projections.`,
      );
    }

    const historyHydrated = ensureShellHistory(shellRoot, runner);
    const head = options.alignRef || materialized
      ? alignCheckout(shellRoot, ref, runner)
      : commandOutput('git', ['rev-parse', 'HEAD'], shellRoot, runner).toLowerCase();

    return { shellRoot, ref, head, materialized, historyHydrated };
  } catch (error) {
    if (checkoutWasMissing && fs.existsSync(shellRoot)) {
      fs.rmSync(shellRoot, { recursive: true, force: true });
    }
    throw error;
  }
}
