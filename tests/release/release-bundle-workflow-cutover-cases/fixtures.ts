import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { assertReleaseOperationDeadline } from "../../../scripts/release-operation-deadline.ts";
import { resolveGithubReleaseCommit } from "../../../scripts/resolve-github-target-commit.ts";
import { createGithubOwnerReleaseNamespaceEvidence } from "../../../scripts/validate-release-source-gate.ts";

export {
  assert,
  crypto,
  fs,
  os,
  path,
  spawnSync,
  parseYaml,
  assertReleaseOperationDeadline,
  resolveGithubReleaseCommit,
  createGithubOwnerReleaseNamespaceEvidence,
};



export const workflowRoot = path.join(process.cwd(), '.github', 'workflows');


export const readWorkflow = (name: string) => fs.readFileSync(path.join(workflowRoot, name), 'utf8');


export const parseWorkflow = (name: string) => parseYaml(readWorkflow(name));


export const readAdapter = () => fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'framework-release-adapter.ts'),
  'utf8',
);


export const rejectedBundle = 'sha256:91d5ea069757fca6bb9aa2280615dc952caeff55b6b4bc13e08e40df32378f49';


export const transportProvenanceFields = [
  'checkpoint_transport_executor',
  'transport_run_id',
] as const;


export const frameworkOwnedLineageFields = [
  'source_build_executor',
  'source_build_run_id',
  'standard_source_build_executor',
  'standard_source_build_run_id',
  'full_source_build_executor',
  'full_source_build_run_id',
] as const;



export function runStandardCheckpointStageGuard(
  tracks: Record<string, unknown>,
  checkpointStage: string,
) {
  const workflow = parseWorkflow('_release-bundle.yml');
  const checkpointStep = workflow.jobs['checkpoint-standard'].steps.find(
    (step: Record<string, unknown>) =>
      step.name === 'Bind Desktop bytes and export one portable checkpoint',
  );
  const run = String(checkpointStep?.run ?? '');
  const guardStart = run.indexOf("if jq -e '.tracks.webui'");
  assert.notEqual(guardStart, -1, 'Standard checkpoint step must derive its expected stage');
  const guard = run.slice(guardStart);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-checkpoint-stage-'));
  try {
    fs.mkdirSync(path.join(root, 'bundle'));
    fs.writeFileSync(
      path.join(root, 'bundle', 'release-bundle.json'),
      `${JSON.stringify({ tracks })}\n`,
    );
    fs.writeFileSync(
      path.join(root, 'checkpoint-export.json'),
      `${JSON.stringify({
        release_bundle_checkpoint_export: {
          checkpoint_stage: checkpointStage,
        },
      })}\n`,
    );
    return spawnSync('bash', ['-e', '-u', '-o', 'pipefail', '-c', guard], {
      cwd: root,
      encoding: 'utf8',
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}



export function gitFixture(root: string, name: string) {
  const directory = path.join(root, name);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'fixture.txt'), `${name}\n`);
  for (const args of [
    ['init', '-q'],
    ['config', 'user.email', 'fixture@example.invalid'],
    ['config', 'user.name', 'Fixture'],
    ['add', '.'],
    ['commit', '-qm', 'fixture'],
  ]) {
    const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  return directory;
}



export function adapterFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-adapter-'));
  const appRoot = gitFixture(root, 'app');
  const shellRoot = gitFixture(root, 'shell');
  const frameworkRoot = gitFixture(root, 'framework');
  const notesPath = path.join(root, 'notes.md');
  const evidencePath = path.join(root, 'notes-evidence.json');
  fs.writeFileSync(notesPath, '# One Person Lab v26.7.20\n\nFixture notes.\n\n<!-- OPL_RELEASE_NOTES_GENERATOR:online-ai -->\n');
  fs.writeFileSync(evidencePath, `${JSON.stringify({
    schema: 'opl_app_release_notes_evidence.v1',
    payload: { include_full_package: false },
  })}\n`);
  return {
    root,
    appRoot,
    shellRoot,
    frameworkRoot,
    notesPath,
    evidencePath,
  };
}



export function runFreezeRequest(fixture: ReturnType<typeof adapterFixture>, output: string) {
  return spawnSync(process.execPath, [
    '--experimental-strip-types',
    path.join(process.cwd(), 'scripts', 'framework-release-adapter.ts'),
    'freeze-request',
    '--channel', 'stable',
    '--version', '26.7.20',
    '--updater-version', '26.7.20',
    '--app-root', fixture.appRoot,
    '--shell-root', fixture.shellRoot,
    '--framework-root', fixture.frameworkRoot,
    '--notes', fixture.notesPath,
    '--notes-evidence', fixture.evidencePath,
    '--include-full-package', 'false',
    '--package-compatibility-abi', 'opl_packages.v1',
    '--package-compatibility-version-range', '>=0.1.0 <1.0.0',
    '--output', output,
  ], { cwd: process.cwd(), encoding: 'utf8' });
}



export function workflowStep(workflowName: string, jobName: string, stepName: string): Record<string, any> {
  const workflow = parseWorkflow(workflowName);
  const step = workflow.jobs[jobName].steps.find((candidate: Record<string, unknown>) => candidate.name === stepName);
  assert.ok(step, `${workflowName}:${jobName} is missing ${stepName}`);
  return step;
}



export function runExpectedImmutableReleaseAssetsBuilder() {
  const step = workflowStep(
    '_release-standard-publish.yml',
    'remote-digest-verify',
    'Read back exact remote Standard digests',
  );
  const run = String(step.run ?? '');
  const start = run.search(/jq \\\n\s+--null-input \\\n\s+--slurpfile plan/);
  const end = run.slice(start).search(/jq -e \\\n\s+--slurpfile expected/) + start;
  assert.notEqual(start, -1, 'remote digest step must build the expected mutable Standard asset set');
  assert.notEqual(end, -1, 'remote digest step must verify the exact mutable Standard carrier');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-expected-release-assets-'));
  const plan = path.join(root, 'publish-plan.json');
  const sidecarActions = path.join(root, 'standard-publication-upload-actions.json');
  const attestationBytes = `${JSON.stringify({ schema: 'opl_app_release_attestation.v1' })}\n`;
  const uploaded = {
    name: 'One-Person-Lab-26.7.31-r2-mac-arm64.dmg',
    digest: `sha256:${'a'.repeat(64)}`,
    size_bytes: 123,
  };
  fs.writeFileSync(plan, `${JSON.stringify({
    release_bundle_publish: {
      receipt: {
        details: {
          upload_actions: [{
            name: uploaded.name,
            sha256: uploaded.digest,
            size_bytes: uploaded.size_bytes,
          }],
        },
      },
    },
  })}\n`);
  const sidecars = [
    {
      name: 'install-docker-webui.sh',
      digest: `sha256:${'b'.repeat(64)}`,
      size_bytes: 456,
    },
    {
      name: 'install-docker-webui.ps1',
      digest: `sha256:${'c'.repeat(64)}`,
      size_bytes: 789,
    },
  ];
  fs.writeFileSync(sidecarActions, `${JSON.stringify({
    upload_actions: sidecars.map((asset) => ({
      name: asset.name,
      sha256: asset.digest,
      size_bytes: asset.size_bytes,
    })),
  })}\n`);

  try {
    const result = spawnSync(
      'bash',
      ['-e', '-u', '-o', 'pipefail', '-c', [
        `attestation_sha=sha256:${crypto.createHash('sha256').update(attestationBytes).digest('hex')}`,
        `attestation_size=${Buffer.byteLength(attestationBytes)}`,
        `plans=(${JSON.stringify(plan)})`,
        `sidecar_actions=${JSON.stringify(sidecarActions)}`,
        run.slice(start, end),
        'test -s expected-mutable-standard-assets.json',
      ].join('\n')],
      { cwd: root, encoding: 'utf8' },
    );
    const outputPath = path.join(root, 'expected-mutable-standard-assets.json');
    const output = result.status === 0
      ? JSON.parse(fs.readFileSync(outputPath, 'utf8'))
      : null;
    return {
      result,
      output,
      expected: {
        assets: [
          uploaded,
          {
            name: 'opl-release-attestation.json',
            digest: `sha256:${crypto.createHash('sha256').update(attestationBytes).digest('hex')}`,
            size_bytes: Buffer.byteLength(attestationBytes),
          },
          ...sidecars,
        ],
      },
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}



export function runAdmissionGate(
  workflowName: string,
  jobName: string,
  stepName: string,
  inputs: Record<string, string>,
) {
  const step = workflowStep(workflowName, jobName, stepName);
  const script = String(step.run).replace(
    /\$\{\{\s*inputs\.([A-Za-z0-9_]+)\s*\}\}/g,
    (_match, name: string) => inputs[name] ?? '',
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-workflow-gate-'));
  try {
    return spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_RUN_ID: '424242',
        RUNNER_TEMP: root,
      },
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}



export function runStableRestoreVersionIdentity(
  version: string,
  sourceGate: Record<string, unknown>,
) {
  const run = String(workflowStep(
    '_release-standard-publish.yml',
    'restore',
    'Resolve checkpoint and predecessor identity',
  ).run);
  const stableStart = run.indexOf('BASE_VERSION="${version%-r*}"');
  const heredocStart = run.indexOf("<<'NODE'\n", stableStart);
  const heredocEnd = run.indexOf('\nNODE', heredocStart);
  assert.ok(stableStart >= 0 && heredocStart >= 0 && heredocEnd > heredocStart);
  const script = run.slice(heredocStart + "<<'NODE'\n".length, heredocEnd);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stable-restore-version-'));
  try {
    fs.symlinkSync(process.cwd(), path.join(root, 'app-source'), 'dir');
    fs.mkdirSync(path.join(root, 'stable-operation-control'));
    const publicReleasesPath = path.join(root, 'public-releases.json');
    const publicTagsPath = path.join(root, 'public-tags.txt');
    const sourceGatePath = path.join(root, 'stable-operation-control', 'source-gate.json');
    fs.writeFileSync(publicReleasesPath, `${JSON.stringify([[
      {
        id: 360830749,
        tag_name: 'v26.7.28-r3',
        target_commitish: 'd'.repeat(40),
        draft: false,
        prerelease: false,
        assets: [],
      },
    ]])}\n`);
    fs.writeFileSync(publicTagsPath, '');
    fs.writeFileSync(sourceGatePath, `${JSON.stringify(sourceGate)}\n`);
    return spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--input-type=module'],
      {
        cwd: root,
        encoding: 'utf8',
        input: script,
        env: {
          ...process.env,
          BASE_VERSION: '26.7.31',
          VERSION: version,
          PUBLIC_RELEASES: publicReleasesPath,
          PUBLIC_TAGS: publicTagsPath,
          OWNER_SOURCE_GATE: sourceGatePath,
          GITHUB_REPOSITORY: 'gaofeng21cn/one-person-lab-app',
        },
      },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}



export function runPortableStandardBuildReceiptStep(jobName: string, receiptFixture: number | 'symlink-only') {
  const step = workflowStep(
    '_release-standard-publish.yml',
    jobName,
    'Materialize unique Standard build receipt for portable recovery',
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-receipt-transport-'));
  const sourceBytes = Buffer.from('exact App-owned Standard build receipt\n');
  try {
    fs.mkdirSync(path.join(root, 'imported-checkpoint'), { recursive: true });
    if (receiptFixture === 'symlink-only') {
      const receiptDir = path.join(root, 'imported-checkpoint', 'symlink-source');
      const targetPath = path.join(root, 'receipt-target.json');
      fs.mkdirSync(receiptDir, { recursive: true });
      fs.writeFileSync(targetPath, sourceBytes);
      fs.symlinkSync(targetPath, path.join(receiptDir, 'standard-build-receipt.json'));
    } else {
      for (let index = 0; index < receiptFixture; index += 1) {
        const receiptDir = path.join(root, 'imported-checkpoint', `source-${index}`);
        fs.mkdirSync(receiptDir, { recursive: true });
        fs.writeFileSync(
          path.join(receiptDir, 'standard-build-receipt.json'),
          index === 0 ? sourceBytes : Buffer.from(`conflicting receipt ${index}\n`),
        );
      }
    }
    const result = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', String(step.run)], {
      cwd: root,
      encoding: 'utf8',
    });
    const outputPath = path.join(root, 'standard-build-receipt.json');
    return {
      result,
      sourceBytes,
      outputBytes: fs.existsSync(outputPath) ? fs.readFileSync(outputPath) : null,
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
