import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  ensureActiveShellCheckout,
  ensureShellHistory,
  isGitCheckout,
} from '../../scripts/ensure-active-shell.ts';

function runGit(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function createShellRemote(root: string) {
  const source = path.join(root, 'source');
  const remote = path.join(root, 'remote.git');
  fs.mkdirSync(source, { recursive: true });
  runGit(source, ['init', '--quiet', '--initial-branch=main']);
  runGit(source, ['config', 'user.name', 'OPL Test']);
  runGit(source, ['config', 'user.email', 'opl-test@example.invalid']);

  fs.writeFileSync(path.join(source, 'package.json'), '{"name":"one-person-lab-aion-shell"}\n');
  fs.writeFileSync(path.join(source, 'AGENTS.md'), '# Shell\n');
  fs.writeFileSync(path.join(source, 'history.txt'), 'first\n');
  runGit(source, ['add', '.']);
  runGit(source, ['commit', '--quiet', '-m', 'first']);
  const first = runGit(source, ['rev-parse', 'HEAD']);

  fs.appendFileSync(path.join(source, 'history.txt'), 'second\n');
  runGit(source, ['add', 'history.txt']);
  runGit(source, ['commit', '--quiet', '-m', 'second']);
  const second = runGit(source, ['rev-parse', 'HEAD']);
  runGit(source, ['branch', 'fixture-branch', first]);
  runGit(source, ['tag', 'fixture-tag', first]);

  runGit(root, ['init', '--quiet', '--bare', remote]);
  runGit(source, ['remote', 'add', 'origin', remote]);
  runGit(source, ['push', '--quiet', 'origin', 'main', 'fixture-branch', 'fixture-tag']);
  runGit(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  return { first, remote, second };
}

test('does not treat an empty child directory as its parent Git checkout', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ensure-shell-'));
  try {
    runGit(root, ['init', '--quiet']);
    const incompleteShell = path.join(root, 'shells', 'aionui');
    fs.mkdirSync(incompleteShell, { recursive: true });

    assert.equal(isGitCheckout(incompleteShell), false);

    runGit(incompleteShell, ['init', '--quiet']);
    assert.equal(isGitCheckout(incompleteShell), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('hydrates a shallow Shell checkout before a currentness validator reads ancestry', () => {
  const calls: Array<{ command: string; args: string[]; capture?: boolean; cwd?: string }> = [];
  const shellRoot = '/tmp/opl-active-shell';
  const result = ensureShellHistory(shellRoot, (command, args, options = {}) => {
    calls.push({ command, args, ...options });
    return { stdout: args[0] === 'rev-parse' ? 'true\n' : '' };
  });

  assert.equal(result, true);
  assert.deepEqual(calls, [
    {
      command: 'git',
      args: ['rev-parse', '--is-shallow-repository'],
      capture: true,
      cwd: shellRoot,
    },
    {
      command: 'git',
      args: ['fetch', '--no-tags', '--unshallow', 'origin'],
      cwd: shellRoot,
    },
  ]);
});

test('does not fetch when the Shell checkout already has complete history', () => {
  const calls: Array<{ command: string; args: string[]; capture?: boolean; cwd?: string }> = [];
  const result = ensureShellHistory('/tmp/opl-active-shell', (command, args, options = {}) => {
    calls.push({ command, args, ...options });
    return { stdout: 'false\n' };
  });

  assert.equal(result, false);
  assert.equal(calls.length, 1);
});

test('materializes branch, tag, and exact SHA refs as standalone full-history checkouts', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-shell-materializer-'));
  try {
    const fixture = createShellRemote(root);
    const cases = [
      { label: 'branch', ref: 'fixture-branch', expected: fixture.first },
      { label: 'tag', ref: 'fixture-tag', expected: fixture.first },
      { label: 'full SHA', ref: fixture.second, expected: fixture.second },
    ];

    for (const candidate of cases) {
      await t.test(candidate.label, () => {
        const shellRoot = path.join(root, `checkout-${candidate.label.replace(/\s+/g, '-')}`);
        const result = ensureActiveShellCheckout({
          shellRoot,
          repo: pathToFileURL(fixture.remote).href,
          ref: candidate.ref,
          alignRef: true,
        });

        assert.equal(result.materialized, true);
        assert.equal(result.head, candidate.expected);
        assert.equal(isGitCheckout(shellRoot), true);
        assert.equal(runGit(shellRoot, ['rev-parse', '--is-shallow-repository']), 'false');
        assert.equal(fs.existsSync(path.join(shellRoot, 'package.json')), true);
      });
    }

    const exactCheckout = path.join(root, 'checkout-full-SHA');
    assert.equal(
      spawnSync('git', ['merge-base', '--is-ancestor', fixture.first, 'HEAD'], {
        cwd: exactCheckout,
        stdio: 'pipe',
      }).status,
      0,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('hydrates an existing shallow checkout so active-shell ancestry remains verifiable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-shell-shallow-'));
  try {
    const fixture = createShellRemote(root);
    const shellRoot = path.join(root, 'shallow');
    runGit(root, [
      'clone',
      '--quiet',
      '--depth',
      '1',
      '--branch',
      'main',
      pathToFileURL(fixture.remote).href,
      shellRoot,
    ]);
    assert.equal(runGit(shellRoot, ['rev-parse', '--is-shallow-repository']), 'true');

    const result = ensureActiveShellCheckout({
      shellRoot,
      repo: pathToFileURL(fixture.remote).href,
      ref: 'main',
    });

    assert.equal(result.materialized, false);
    assert.equal(result.historyHydrated, true);
    assert.equal(runGit(shellRoot, ['rev-parse', '--is-shallow-repository']), 'false');
    assert.equal(
      spawnSync('git', ['merge-base', '--is-ancestor', fixture.first, 'HEAD'], {
        cwd: shellRoot,
        stdio: 'pipe',
      }).status,
      0,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects an archive projection without deleting or rewriting it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-shell-archive-'));
  try {
    const shellRoot = path.join(root, 'archive');
    fs.mkdirSync(shellRoot, { recursive: true });
    const marker = path.join(shellRoot, 'archive-marker.txt');
    fs.writeFileSync(marker, 'preserve-me\n');

    assert.throws(
      () => ensureActiveShellCheckout({
        shellRoot,
        repo: pathToFileURL(path.join(root, 'unused.git')).href,
        ref: 'main',
      }),
      /exists but is not a Git checkout; archive snapshots are valid only for isolated consumer projections/,
    );
    assert.equal(fs.readFileSync(marker, 'utf8'), 'preserve-me\n');
    assert.equal(fs.existsSync(path.join(shellRoot, '.git')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('removes only a newly-created partial checkout when ref alignment fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-shell-invalid-ref-'));
  try {
    const fixture = createShellRemote(root);
    const shellRoot = path.join(root, 'failed-checkout');

    assert.throws(
      () => ensureActiveShellCheckout({
        shellRoot,
        repo: pathToFileURL(fixture.remote).href,
        ref: 'missing-ref',
        alignRef: true,
      }),
      /Command failed: git fetch --no-tags origin missing-ref/,
    );
    assert.equal(fs.existsSync(shellRoot), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
