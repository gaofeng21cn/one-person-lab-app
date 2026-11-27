import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { appRoot, readJson, writeJson } from './release-readiness/helpers.ts';

const VERSION = '26.5.99';
type JsonRecord = Record<string, unknown>;

function fixture(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const artifactsRoot = path.join(root, 'artifacts');
  const outDir = path.join(root, 'out');
  const runPath = path.join(root, 'run.json');
  const jobsPath = path.join(root, 'jobs.json');
  fs.mkdirSync(artifactsRoot, { recursive: true });
  return { root, artifactsRoot, outDir, runPath, jobsPath };
}

function writeRun(filePath: string, fields: JsonRecord = {}) {
  writeJson(filePath, {
    databaseId: '12345',
    status: 'completed',
    conclusion: 'success',
    createdAt: '2026-06-12T10:38:58Z',
    startedAt: '2026-06-12T10:38:58Z',
    updatedAt: '2026-06-12T11:18:25Z',
    workflowName: 'Historical OPL Desktop Release',
    headSha: 'a'.repeat(40),
    ...fields,
  });
}

function writeArtifact(root: string, artifact: string, file: string, payload: JsonRecord) {
  writeJson(path.join(root, `${artifact}-${VERSION}`, file), payload);
}

function runCloseout(input: ReturnType<typeof fixture>, extra: string[] = []) {
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    'scripts/closeout-release-run.ts',
    '--version', VERSION,
    '--run-json', input.runPath,
    '--jobs-json', input.jobsPath,
    '--artifacts-dir', input.artifactsRoot,
    '--out-dir', input.outDir,
    '--no-download',
    ...extra,
  ], { cwd: appRoot, encoding: 'utf8' });
  return result;
}

function readOutputs(input: ReturnType<typeof fixture>) {
  return {
    summary: readJson(path.join(input.outDir, 'release-closeout.json')),
    monitor: readJson(path.join(input.outDir, 'release-monitor.json')),
    notification: readJson(path.join(input.outDir, 'release-notification.json')),
    completion: readJson(path.join(input.outDir, 'release-closeout-completion.json')),
  };
}

test('historical closeout preserves timing and evidence without release authority', () => {
  const input = fixture('opl-release-closeout-historical-');
  writeRun(input.runPath, {
    previous_runs: [{
      id: '12222',
      status: 'completed',
      conclusion: 'failure',
      createdAt: '2026-06-12T09:00:00Z',
      updatedAt: '2026-06-12T09:31:01Z',
    }],
  });
  writeJson(input.jobsPath, {
    jobs: [
      {
        name: 'Build historical Full assets', status: 'completed', conclusion: 'success',
        startedAt: '2026-06-12T10:50:00Z', completedAt: '2026-06-12T11:04:42Z',
      },
      {
        name: 'Summarize historical readiness', status: 'completed', conclusion: 'success',
        startedAt: '2026-06-12T11:17:00Z', completedAt: '2026-06-12T11:18:25Z',
      },
    ],
  });
  writeArtifact(input.artifactsRoot, 'release-candidate-record', 'release-candidate-record.json', {
    schema: 'opl_release_candidate_record.v1',
    status: 'ready_to_promote',
  });

  const result = runCloseout(input, ['--agent-wall-time', '2h6m43s']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const stdout = JSON.parse(result.stdout);
  const { summary, monitor, notification, completion } = readOutputs(input);

  assert.equal(stdout.status, 'diagnostics_only');
  assert.equal(stdout.mutation_authorized, false);
  assert.equal(stdout.next_action, 'inspect_historical_release_evidence');
  assert.equal(summary.source_status.candidate_record, 'ready_to_promote');
  assert.equal(summary.authority_boundary.mutation_authorized, false);
  assert.equal(summary.stable_terminal_evidence.authority, 'framework_release_checkpoint_only');
  assert.equal(summary.stable_terminal_evidence.status, 'unavailable');
  assert.equal(summary.jobs.slowest_jobs[0].name, 'Build historical Full assets');
  assert.equal(summary.failed_rerun_tax.failed_rerun_tax_seconds, 1861);
  assert.equal(monitor.state, 'diagnostics_only');
  assert.equal(monitor.promote_ready, false);
  assert.equal(monitor.published, false);
  assert.equal(monitor.terminal, false);
  assert.equal(monitor.mutation_authorized, false);
  assert.doesNotMatch(summary.decision.command, /\bpromote\b|\brerun\b|\bcancel\b|--execute/i);
  assert.equal(completion.status, 'complete');
  assert.equal(completion.mutation_authorized, false);
  assert.equal(completion.generation.id, summary.output_generation.id);
  assert.equal(monitor.output_generation.id, summary.output_generation.id);
  assert.equal(notification.output_generation.id, summary.output_generation.id);
  assert.equal(completion.outputs.length, 4);
});

test('nonterminal historical runs hand off to read-only Framework Bundle status', () => {
  const input = fixture('opl-release-closeout-running-');
  writeRun(input.runPath, { status: 'in_progress', conclusion: null });
  writeJson(input.jobsPath, { jobs: [] });

  const result = runCloseout(input);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const stdout = JSON.parse(result.stdout);
  const { summary, monitor } = readOutputs(input);

  assert.equal(stdout.next_action, 'inspect_framework_bundle_status');
  assert.equal(stdout.mutation_authorized, false);
  assert.equal(summary.decision.command, 'node --experimental-strip-types scripts/release-bundle-cli.ts status --bundle <sha256:digest> --store <directory>');
  assert.equal(summary.decision.routes.resume.includes('manual handoff only'), true);
  assert.equal(summary.decision.routes.resume.includes('cannot authorize or execute release mutation'), true);
  assert.equal(monitor.state, 'running');
  assert.equal(monitor.mutation_authorized, false);
});

test('historical attestation bytes remain inspectable but cannot become readiness authority', () => {
  const input = fixture('opl-release-closeout-attestation-');
  writeRun(input.runPath);
  writeJson(input.jobsPath, { jobs: [] });
  writeArtifact(input.artifactsRoot, 'release-attestation-verification', 'attestation-verification.json', {
    schema: 'opl_release_attestation_verification.v1',
    status: 'passed',
    verified_assets: [{
      name: `One-Person-Lab-${VERSION}-arm64.dmg`,
      predicate_type: 'https://slsa.dev/provenance/v1',
      workflow_run_id: '12345',
    }],
  });

  const result = runCloseout(input);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const { summary, monitor } = readOutputs(input);
  assert.equal(summary.artifact_attestation_verification.state, 'verified');
  assert.equal(summary.artifact_attestation_verification.role, 'build_integrity_evidence');
  assert.equal(summary.artifact_attestation_verification.verification.status, 'passed');
  assert.equal(summary.authority_boundary.mutation_authorized, false);
  assert.equal(monitor.promote_ready, false);
  assert.equal(monitor.mutation_authorized, false);
});

test('historical closeout never replaces a completion receipt after a partial output failure', () => {
  const input = fixture('opl-release-closeout-partial-output-');
  writeRun(input.runPath);
  writeJson(input.jobsPath, { jobs: [] });
  const notificationDirectory = path.join(input.root, 'notification-directory');
  const completionPath = path.join(input.root, 'completion.json');
  fs.mkdirSync(notificationDirectory);
  writeJson(completionPath, { schema: 'old-completion', generation: { id: 'old-generation' } });

  const result = runCloseout(input, [
    '--notification', notificationDirectory,
    '--completion-manifest', completionPath,
  ]);

  assert.notEqual(result.status, 0);
  assert.equal(readJson(completionPath).generation.id, 'old-generation');
  assert.equal(fs.readdirSync(input.root).some((name) => name.includes('.tmp-')), false);
});
