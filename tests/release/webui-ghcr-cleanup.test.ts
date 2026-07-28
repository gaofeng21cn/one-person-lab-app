import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { appRoot } from './release-readiness/helpers.ts';
import { fakeGhEnv, writeFakeGh } from './fake-gh-fixture.ts';

function runCleanup(args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(
    process.execPath,
    ['--experimental-strip-types', 'scripts/cleanup-webui-ghcr-versions.ts', ...args],
    {
      cwd: appRoot,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    },
  );
}

function version(id: number, date: string, tags: string[]) {
  return { id, updated_at: `2026-${date}T01:11:19Z`, metadata: { container: { tags } } };
}

const versions = [
  version(101, '06-02', ['nightly', '26.6.2-nightly']),
  version(102, '06-01', ['26.6.1-nightly']),
  version(103, '05-31', ['26.5.31-nightly']),
  version(104, '05-30', ['26.5.30-nightly']),
  version(105, '05-29', ['26.5.29-nightly']),
  version(106, '05-28', ['26.5.28-nightly']),
  version(107, '05-27', ['26.5.27-nightly']),
  version(108, '05-26', ['26.5.26-nightly']),
  version(109, '05-25', ['26.5.25-nightly']),
  version(201, '06-01', ['latest', 'stable', '26.6.1']),
  version(202, '05-25', ['26.5.25']),
  version(203, '05-24', ['26.5.24']),
  version(204, '05-23', ['26.5.23']),
  version(205, '05-22', ['26.5.22']),
  version(206, '05-21', ['26.5.21']),
];

test('WebUI GHCR cleanup dry-run keeps protected tags and recent retention windows', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-ghcr-cleanup-'));
  const binDir = writeFakeGh(tempRoot);
  const summaryPath = path.join(tempRoot, 'summary.json');
  const logPath = path.join(tempRoot, 'gh.log');

  const result = runCleanup(['--owner', 'owner', '--summary-path', summaryPath, '--rollback-tag', '26.5.21'], fakeGhEnv(binDir, logPath, {
    FAKE_PACKAGE_VERSIONS_JSON: JSON.stringify(versions),
  }));

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(logPath), false, 'dry-run must not delete package versions');
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  assert.equal(summary.status, 'dry_run');
  assert.equal(summary.retention_policy.cleanup_execution_mode, 'dry_run_first_explicit_execute_required');
  assert.deepEqual(
    summary.candidates.map((candidate: { id: number }) => candidate.id),
    [109],
  );
  assert.ok(summary.protected_version_ids.includes(101));
  assert.ok(summary.protected_version_ids.includes(201));
  assert.ok(summary.protected_version_ids.includes(206));
});

test('WebUI GHCR cleanup execute deletes only dry-run candidate version ids', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-ghcr-cleanup-execute-'));
  const binDir = writeFakeGh(tempRoot);
  const summaryPath = path.join(tempRoot, 'summary.json');
  const logPath = path.join(tempRoot, 'gh.log');

  const result = runCleanup(['--owner', 'owner', '--summary-path', summaryPath, '--rollback-tag', '26.5.21', '--execute'], fakeGhEnv(binDir, logPath, {
    FAKE_PACKAGE_VERSIONS_JSON: JSON.stringify(versions),
  }));

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const deleted = fs.readFileSync(logPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(deleted, [
    [
      'api',
      '-X',
      'DELETE',
      '-H',
      'X-GitHub-Api-Version: 2022-11-28',
      '/users/owner/packages/container/one-person-lab-webui/versions/109',
    ],
  ]);
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  assert.equal(summary.status, 'deleted');
  assert.deepEqual(summary.deleted_version_ids, [109]);
});

test('WebUI GHCR cleanup retains a durable publication unit across separate package versions', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-ghcr-durable-sidecar-'));
  const binDir = writeFakeGh(tempRoot);
  const summaryPath = path.join(tempRoot, 'summary.json');
  const logPath = path.join(tempRoot, 'gh.log');
  const durableVersions = [
    ...versions,
    version(301, '05-20', ['26.5.20']),
    version(302, '05-20', ['receipt-26.5.20']),
    version(303, '05-20', ['rollback-26.5.20']),
  ];

  const result = runCleanup(['--owner', 'owner', '--summary-path', summaryPath], fakeGhEnv(binDir, logPath, {
    FAKE_PACKAGE_VERSIONS_JSON: JSON.stringify(durableVersions),
  }));

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  assert.deepEqual(summary.durable_publication_version_ids, [301, 302, 303]);
  assert.deepEqual(
    summary.candidates.map((candidate: { id: number }) => candidate.id),
    [109],
  );
});

test('WebUI GHCR cleanup retains a durable publication unit when receipt and image share a package version', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-ghcr-durable-inline-'));
  const binDir = writeFakeGh(tempRoot);
  const summaryPath = path.join(tempRoot, 'summary.json');
  const logPath = path.join(tempRoot, 'gh.log');
  const durableVersions = [
    ...versions,
    version(401, '05-20', ['26.5.20', 'receipt-26.5.20', 'rollback-26.5.20']),
  ];

  const result = runCleanup(['--owner', 'owner', '--summary-path', summaryPath], fakeGhEnv(binDir, logPath, {
    FAKE_PACKAGE_VERSIONS_JSON: JSON.stringify(durableVersions),
  }));

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  assert.deepEqual(summary.durable_publication_version_ids, [401]);
  assert.deepEqual(
    summary.candidates.map((candidate: { id: number }) => candidate.id),
    [109],
  );
});

test('WebUI GHCR cleanup does not retain unpaired or malformed durable tags', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-ghcr-invalid-durable-'));
  const binDir = writeFakeGh(tempRoot);
  const summaryPath = path.join(tempRoot, 'summary.json');
  const logPath = path.join(tempRoot, 'gh.log');
  const invalidDurableVersions = [
    version(501, '06-05', ['26.6.5']),
    version(502, '06-04', ['26.6.4']),
    version(503, '06-03', ['26.6.3']),
    version(504, '06-02', ['26.6.2']),
    version(505, '06-01', ['26.6.1']),
    version(506, '05-31', ['26.5.31', 'receipt-26.5.31-invalid']),
    version(507, '05-30', ['receipt-26.5.30']),
    version(508, '05-29', ['rollback-26.5.29']),
    version(509, '05-28', ['receipt-not-a-version']),
    version(510, '05-27', ['rollback-not-a-version']),
  ];

  const result = runCleanup(['--owner', 'owner', '--summary-path', summaryPath], fakeGhEnv(binDir, logPath, {
    FAKE_PACKAGE_VERSIONS_JSON: JSON.stringify(invalidDurableVersions),
  }));

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  assert.deepEqual(summary.durable_publication_version_ids, []);
  assert.deepEqual(
    summary.candidates.map((candidate: { id: number }) => candidate.id),
    [506, 507, 508, 509, 510],
  );
});
