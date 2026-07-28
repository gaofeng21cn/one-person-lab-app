import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';
import { assertReleaseOperationDeadline } from '../../scripts/release-operation-deadline.ts';
import { resolveGithubReleaseCommit } from '../../scripts/resolve-github-target-commit.ts';

const workflowRoot = path.join(process.cwd(), '.github', 'workflows');
const readWorkflow = (name: string) => fs.readFileSync(path.join(workflowRoot, name), 'utf8');
const parseWorkflow = (name: string) => parseYaml(readWorkflow(name));
const readAdapter = () => fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'framework-release-adapter.ts'),
  'utf8',
);
const minimumCompatibleFrameworkAbiRef = 'ad09977d7cdfc6cb3d1c04f7f1e6fd9358a7a2fc';
const rejectedBundle = 'sha256:91d5ea069757fca6bb9aa2280615dc952caeff55b6b4bc13e08e40df32378f49';
const transportProvenanceFields = [
  'checkpoint_transport_executor',
  'transport_run_id',
] as const;
const frameworkOwnedLineageFields = [
  'source_build_executor',
  'source_build_run_id',
  'standard_source_build_executor',
  'standard_source_build_run_id',
  'full_source_build_executor',
  'full_source_build_run_id',
] as const;

test('Latest target_commitish resolves immutable commit identity from SHA, branch, or tag', () => {
  const appSha = 'a'.repeat(40);
  const tagSha = 'b'.repeat(40);
  const calls: string[] = [];
  const api = (request: string): unknown => {
    calls.push(request);
    const responses: Record<string, unknown> = {
      'repos/test/repo/git/ref/tags/v-release': { object: { type: 'commit', sha: appSha } },
      'repos/test/repo/git/ref/heads/main': { object: { type: 'commit', sha: tagSha } },
      'repos/test/repo/git/ref/tags/v1': { object: { type: 'commit', sha: tagSha } },
      'repos/test/repo/git/ref/heads/annotated': { object: { type: 'tag', sha: 'c'.repeat(40) } },
      [`repos/test/repo/git/tags/${'c'.repeat(40)}`]: { object: { type: 'commit', sha: tagSha } },
    };
    if (request in responses) return responses[request];
    throw new Error('HTTP 404');
  };
  const previousRepository = process.env.GITHUB_REPOSITORY;
  process.env.GITHUB_REPOSITORY = 'test/repo';
  try {
    assert.equal(resolveGithubReleaseCommit(appSha, 'v-release', api), appSha);
    assert.equal(resolveGithubReleaseCommit('main', 'v-release', api), appSha);
    assert.equal(resolveGithubReleaseCommit('v1', 'v-release', api), appSha);
    assert.equal(resolveGithubReleaseCommit('annotated', 'v-release', api), appSha);
    assert.deepEqual(calls, [
      'repos/test/repo/git/ref/tags/v-release',
      'repos/test/repo/git/ref/tags/v-release',
      'repos/test/repo/git/ref/heads/main',
      'repos/test/repo/git/ref/tags/main',
      'repos/test/repo/git/ref/tags/v-release',
      'repos/test/repo/git/ref/heads/v1',
      'repos/test/repo/git/ref/tags/v1',
      'repos/test/repo/git/ref/tags/v-release',
      'repos/test/repo/git/ref/heads/annotated',
      'repos/test/repo/git/tags/' + 'c'.repeat(40),
      'repos/test/repo/git/ref/tags/annotated',
    ]);
  } finally {
    if (previousRepository === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = previousRepository;
  }
});

test('Latest target_commitish rejects missing, ambiguous, and non-commit refs', () => {
  const appSha = 'a'.repeat(40);
  const otherSha = 'b'.repeat(40);
  const api = (request: string): unknown => {
    const responses: Record<string, unknown> = {
      'repos/test/repo/git/ref/tags/v-release': { object: { type: 'commit', sha: appSha } },
      'repos/test/repo/git/ref/heads/ambiguous': { object: { type: 'commit', sha: appSha } },
      'repos/test/repo/git/ref/tags/ambiguous': { object: { type: 'commit', sha: otherSha } },
      'repos/test/repo/git/ref/heads/same-target': { object: { type: 'commit', sha: appSha } },
      'repos/test/repo/git/ref/tags/same-target': { object: { type: 'commit', sha: appSha } },
      'repos/test/repo/git/ref/heads/tree': { object: { type: 'tree', sha: otherSha } },
    };
    if (request in responses) return responses[request];
    throw new Error('HTTP 404');
  };
  const previousRepository = process.env.GITHUB_REPOSITORY;
  process.env.GITHUB_REPOSITORY = 'test/repo';
  try {
    assert.throws(() => resolveGithubReleaseCommit('missing', 'v-release', api), /was not found/);
    assert.throws(() => resolveGithubReleaseCommit('ambiguous', 'v-release', api), /ambiguous/);
    assert.throws(() => resolveGithubReleaseCommit('same-target', 'v-release', api), /ambiguous/);
    assert.throws(() => resolveGithubReleaseCommit('tree', 'v-release', api), /must resolve to a commit object/);
    assert.throws(() => resolveGithubReleaseCommit('../invalid', 'v-release', api), /valid branch\/tag ref/);
    assert.throws(() => resolveGithubReleaseCommit(otherSha, 'v-release', api), /does not match/);
  } finally {
    if (previousRepository === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = previousRepository;
  }
});

function runStandardCheckpointStageGuard(
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

function gitFixture(root: string, name: string) {
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

function adapterFixture() {
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

function runFreezeRequest(fixture: ReturnType<typeof adapterFixture>, output: string) {
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

function workflowStep(workflowName: string, jobName: string, stepName: string): Record<string, any> {
  const workflow = parseWorkflow(workflowName);
  const step = workflow.jobs[jobName].steps.find((candidate: Record<string, unknown>) => candidate.name === stepName);
  assert.ok(step, `${workflowName}:${jobName} is missing ${stepName}`);
  return step;
}

function sourceQualificationReceiptResolver(run: string): string {
  const startMarker = '# source-qualification-receipt-resolver:start';
  const endMarker = '# source-qualification-receipt-resolver:end';
  const start = run.indexOf(startMarker);
  const end = run.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, 'source qualification receipt resolver start marker');
  assert.notEqual(end, -1, 'source qualification receipt resolver end marker');
  return run.slice(start + startMarker.length, end);
}

function runSourceQualificationReceiptResolver(
  resolver: string,
  fixture: 'nested' | 'missing' | 'duplicate' | 'symlink-only' | 'empty',
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-source-qualification-receipt-'));
  const evidenceRoot = path.join(root, 'source-qualification-evidence');
  try {
    fs.mkdirSync(evidenceRoot, { recursive: true });
    if (fixture === 'nested' || fixture === 'duplicate' || fixture === 'empty') {
      const nestedRoot = path.join(evidenceRoot, '_temp', 'opl-source-qualification-30214273664');
      fs.mkdirSync(nestedRoot, { recursive: true });
      fs.writeFileSync(
        path.join(nestedRoot, 'source-qualification-receipt.json'),
        fixture === 'empty' ? '' : '{"status":"passed"}\n',
      );
    }
    if (fixture === 'duplicate') {
      const duplicateRoot = path.join(evidenceRoot, 'one-person-lab-app', 'evidence');
      fs.mkdirSync(duplicateRoot, { recursive: true });
      fs.writeFileSync(path.join(duplicateRoot, 'source-qualification-receipt.json'), '{}\n');
    }
    if (fixture === 'symlink-only') {
      const target = path.join(root, 'source-qualification-receipt-target.json');
      fs.writeFileSync(target, '{}\n');
      fs.symlinkSync(target, path.join(evidenceRoot, 'source-qualification-receipt.json'));
    }
    return spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', [
      resolver,
      'printf "%s\\n" "$qualification_receipt_path"',
    ].join('\n')], {
      cwd: root,
      encoding: 'utf8',
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('active shell ancestry checks receive full history without broadening routine checkouts', () => {
  const setupAction = parseYaml(fs.readFileSync(
    path.join(process.cwd(), '.github', 'actions', 'setup-active-shell-deps', 'action.yml'),
    'utf8',
  ));
  assert.equal(setupAction.inputs['fetch-depth'].default, '1');
  const shellCheckout = setupAction.runs.steps.find(
    (step: Record<string, any>) => step.name === 'Checkout active shell',
  );
  assert.ok(shellCheckout);
  assert.equal(shellCheckout.with['fetch-depth'], '${{ inputs.fetch-depth }}');

  const workflow = parseWorkflow('_build-reusable.yml');
  const resolvedShellRef = '${{ needs.resolve-active-shell-ref.outputs.shell_sha }}';
  for (const [jobId, job] of Object.entries(workflow.jobs) as Array<[string, Record<string, any>]>) {
    const setup = job.steps?.find(
      (step: Record<string, any>) => step.uses === './.github/actions/setup-active-shell-deps',
    );
    if (!setup) continue;
    if (jobId === 'active-shell-tests') {
      assert.equal(setup.with['fetch-depth'], '0');
    } else {
      assert.equal(setup.with['fetch-depth'], undefined, `${jobId} must retain the shallow default`);
    }
    assert.equal(setup.with['shell-ref'], resolvedShellRef, `${jobId} must use the resolved immutable Shell SHA`);
  }
});

function runAdmissionGate(
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
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_RUN_ID: '424242',
        RUNNER_TEMP: root,
      },
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runPortableStandardBuildReceiptStep(jobName: string, receiptFixture: number | 'symlink-only') {
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

test('Stable and protected Manual Preview are isolated from scheduled Nightly and Canary', () => {
  const stable = parseWorkflow('release-stable.yml');
  const canary = parseWorkflow('release-bundle-canary.yml');
  const nightly = parseWorkflow('release-nightly.yml');

  assert.deepEqual(Object.keys(stable.on), ['workflow_dispatch']);
  assert.deepEqual(stable.on.workflow_dispatch.inputs.operation.options, [
    'standard',
    'resume_standard',
    'append_full',
  ]);
  assert.deepEqual(stable.concurrency, { group: 'opl-release-bundle-global', 'cancel-in-progress': false });
  assert.deepEqual(Object.keys(canary.on).sort(), ['pull_request', 'push', 'schedule']);
  assert.deepEqual(canary.on.schedule, [{ cron: '0 13 * * *' }]);
  assert.deepEqual(canary.concurrency, {
    group: 'opl-release-validation-canary-${{ github.ref }}',
    'cancel-in-progress': true,
  });
  assert.deepEqual(Object.keys(nightly.on), ['schedule']);
  assert.deepEqual(nightly.on.schedule, [{ cron: '17 19 * * *' }]);
  assert.deepEqual(nightly.concurrency, {
    group: 'opl-standard-nightly',
    'cancel-in-progress': false,
  });
  assert.equal(nightly.jobs['standard-build'].uses, './.github/workflows/_build-reusable.yml');
  assert.equal(nightly.jobs['standard-build'].with.require_macos_gatekeeper, false);
  assert.equal(nightly.jobs['qualify-and-publish'].environment, 'release-nightly');
  assert.equal(stable.jobs.standard.uses, './.github/workflows/_release-bundle.yml');
  assert.equal(stable.jobs['resume-standard'].uses, './.github/workflows/_release-standard-publish.yml');
  assert.equal(stable.jobs['append-full'].uses, './.github/workflows/_release-full-addon.yml');
  assert.equal(Object.hasOwn(stable.jobs['resume-standard'].with, 'operation_started_at'), false);
  assert.equal(Object.hasOwn(stable.jobs['resume-standard'].with, 'operation_deadline_at'), false);
  const stableSource = readWorkflow('release-stable.yml');
  assert.match(stableSource, /if \[ "\$OPERATION" = standard \] \|\| \[ "\$OPERATION" = append_full \]; then[\s\S]*actions\/runs\/\$GITHUB_RUN_ID" --jq \.created_at/);
  assert.match(stableSource, /--started-at "\$operation_created_at"/);
  assert.match(stableSource, /operation_started_at="\$\(jq -er \.started_at release-operation-admission\.json\)"/);
  assert.match(stableSource, /operation_deadline_at="\$\(jq -er \.deadline_at release-operation-admission\.json\)"/);
  assert.doesNotMatch(stableSource, /operation_started_at="\$\(timeout[\s\S]*actions\/runs\/\$GITHUB_RUN_ID/);
  assert.match(stableSource, /if: \$\{\{ steps\.admission\.outputs\.operation != 'resume_standard' \}\}/);
  assert.doesNotMatch(stableSource, /run_started_at/);
  const bundleSource = readWorkflow('_release-bundle.yml');
  assert.match(bundleSource, /stable:stable\|preview:preview/);
  assert.match(bundleSource, /stable_does_not_use_preview_override/);
  assert.doesNotMatch(bundleSource, /nightly:nightly/);
  assert.doesNotMatch(bundleSource, /resolveNightlyReleaseVersion|nightly-operation-request/);
  const standardPublishSource = readWorkflow('_release-standard-publish.yml');
  assert.match(standardPublishSource, /reason=unsupported_publication_channel/);
  assert.doesNotMatch(standardPublishSource, /^\s*nightly-terminal:/m);
  for (const workflow of ['_release-bundle.yml', '_release-standard-publish.yml', '_release-full-addon.yml']) {
    assert.doesNotMatch(readWorkflow(workflow), /opl-release-bundle-global/);
  }
});

test('new Standard runs source preflight and seals protected admission in the same run', () => {
  const stable = parseWorkflow('release-stable.yml');
  assert.equal(stable.env.OPL_FRAMEWORK_RELEASE_ABI_REF, undefined);
  assert.equal(stable.on.workflow_dispatch.inputs.source_qualification_run_id.required, false);
  assert.equal(stable.on.workflow_dispatch.inputs.source_qualification_receipt_digest.required, false);
  assert.equal(
    stable.jobs['source-qualification'].uses,
    './.github/workflows/release-source-qualification.yml',
  );
  assert.equal(
    stable.jobs['source-qualification'].with.operation_scope,
    'stable_operation_source_preflight',
  );
  assert.deepEqual(stable.jobs.admission.needs, ['source-qualification']);
  assert.match(
    String(stable.jobs.admission.if),
    /inputs\.operation != 'standard'.*needs\.source-qualification\.result == 'success'/,
  );
  const stableAdmission = String(stable.jobs.admission.steps.find(
    (step: Record<string, unknown>) => step.name === 'Admit one bounded Bundle operation',
  )?.run ?? '');
  assert.match(
    stableAdmission,
    /test -z "\$REQUESTED_VERSION\$REQUESTED_SHELL_REF\$REQUESTED_FRAMEWORK_REF\$SOURCE_RUN_ID\$SOURCE_ARTIFACT\$LEGACY_SOURCE_QUALIFICATION_RUN_ID\$LEGACY_SOURCE_QUALIFICATION_RECEIPT_DIGEST"/,
  );
  assert.match(stableAdmission, /SOURCE_QUALIFICATION_RUN_ID="\$GITHUB_RUN_ID"/);
  assert.match(
    stableAdmission,
    /SOURCE_QUALIFICATION_RECEIPT_DIGEST='\$\{\{ needs\.source-qualification\.outputs\.receipt_digest \}\}'/,
  );
  assert.doesNotMatch(stableAdmission, /actions\/runs\/\$SOURCE_QUALIFICATION_RUN_ID/);
  assert.doesNotMatch(stableAdmission, /gh run download/);
  assert.match(stableAdmission, /source-qualification-receipt\.ts verify/);
  assert.match(stableAdmission, /--expected-digest "\$SOURCE_QUALIFICATION_RECEIPT_DIGEST"/);
  assert.match(stableAdmission, /SHELL_REF="\$\(jq -er \.cohort\.shell\.sha verified-source-qualification\.json\)"/);
  assert.match(stableAdmission, /FRAMEWORK_REF="\$\(jq -er \.cohort\.framework\.sha verified-source-qualification\.json\)"/);
  assert.doesNotMatch(stableAdmission, /canonical_(?:app|shell|framework)_sha/);
  assert.doesNotMatch(stableAdmission, /ls-remote/);
  assert.doesNotMatch(stableAdmission, /OPL_FRAMEWORK_(?:RELEASE|CHECKPOINT)_ABI_REF/);
  assert.match(stableAdmission, /resume_standard\|append_full\)[\s\S]*if \[ -n "\$REQUESTED_FRAMEWORK_REF" \]/);
  assert.match(stableAdmission, /framework_executor_ref=\$FRAMEWORK_REF/);
  assert.doesNotMatch(
    stableAdmission.slice(stableAdmission.indexOf('resume_standard|append_full)')),
    /canonical_framework_sha|OPL_FRAMEWORK_RELEASE_ABI_REF/,
  );
  const protectedAdmission = stable.jobs['protected-admission'];
  assert.equal(protectedAdmission.environment, 'release-stable');
  assert.deepEqual(protectedAdmission.needs, ['admission']);
  assert.equal(protectedAdmission.steps.some(
    (step: Record<string, unknown>) => step.name === 'Verify protected Apple credentials in the Stable entry',
  ), true);
  assert.equal(protectedAdmission.steps.some(
    (step: Record<string, unknown>) => String(step.run ?? '').includes('stable-release-admission-manifest.ts create'),
  ), true);
  assert.equal(stable.jobs.standard.needs.includes('protected-admission'), true);

  for (const name of ['_release-standard-publish.yml', '_release-full-addon.yml']) {
    const workflow = parseWorkflow(name);
    const input = workflow.on.workflow_call.inputs.framework_executor_ref;
    assert.equal(input.required, false);
    assert.equal(input.default, '');
    assert.equal(workflow.env.OPL_FRAMEWORK_CANARY_MINIMUM_ABI_REF, minimumCompatibleFrameworkAbiRef);
    const source = readWorkflow(name);
    assert.match(source, /Download checkpoint identity bootstrap/);
    assert.match(source, /Resolve Bundle-bound Framework identity/);
    assert.match(source, /framework_source_ref=.*sources\.framework\.source_commit/);
    assert.match(source, /Checkpoint Framework source differs from the optional caller expectation/);
    assert.doesNotMatch(source, /OPL_FRAMEWORK_CHECKPOINT_ABI/);
  }

  const standardRestore = workflowStep(
    '_release-standard-publish.yml',
    'restore',
    'Restore portable checkpoint',
  );
  assert.equal(
    standardRestore.with['framework-executor-ref'],
    '${{ steps.framework-binding.outputs.framework_source_ref }}',
  );
  const fullRestore = workflowStep(
    '_release-full-addon.yml',
    'restore-standard',
    'Restore verified Standard checkpoint',
  );
  assert.equal(
    fullRestore.with['framework-executor-ref'],
    '${{ steps.framework-binding.outputs.framework_source_ref }}',
  );
});

test('one signed Standard build is sealed once and every final consumer binds its identity digest', () => {
  const bundle = parseWorkflow('_release-bundle.yml');
  const source = readWorkflow('_release-bundle.yml');
  assert.equal((source.match(/uses: \.\/\.github\/workflows\/_build-reusable\.yml/g) ?? []).length, 1);
  assert.deepEqual(bundle.jobs['seal-standard-identity'].needs, ['freeze', 'standard-build']);
  assert.equal(bundle.jobs['standard-qualification'], undefined);
  assert.deepEqual(
    bundle.jobs['checkpoint-standard'].needs,
    ['freeze', 'seal-standard-identity'],
  );
  assert.equal(
    bundle.jobs['publish-standard'].with.standard_identity_sha256,
    '${{ needs.checkpoint-standard.outputs.standard_identity_sha256 }}',
  );
  assert.match(source, /bind-standard-release-track\.ts/);
  assert.match(source, /opl-release-standard-bound-\$\{GITHUB_RUN_ID\}/);
  assert.match(source, /Standard identity digest mismatch/);

  const firstRun = parseWorkflow('opl-first-run-vm.yml');
  assert.equal(firstRun.on.workflow_call.inputs.standard_identity_sha256.required, false);
  assert.match(readWorkflow('opl-first-run-vm.yml'), /Standard identity digest mismatch/);

  const publish = parseWorkflow('_release-standard-publish.yml');
  assert.equal(publish.on.workflow_call.inputs.standard_identity_sha256.required, false);
  assert.match(readWorkflow('_release-standard-publish.yml'), /Standard identity digest mismatch/);
  assert.equal(publish.jobs['updater-upgrade-qualification'], undefined);
  assert.equal(publish.jobs['updater-upgrade-qualification-highest'], undefined);

  const updater = parseWorkflow('opl-updater-upgrade-vm.yml');
  assert.equal(updater.on.workflow_call.inputs.standard_identity_sha256.required, false);
  assert.match(readWorkflow('opl-updater-upgrade-vm.yml'), /Standard identity digest mismatch/);
  assert.doesNotMatch(
    [
      source,
      readWorkflow('_release-standard-publish.yml'),
      readWorkflow('opl-first-run-vm.yml'),
      readWorkflow('opl-updater-upgrade-vm.yml'),
    ].join('\n'),
    /package_release_set|package-release-set|release_set_manifest|\bbom\b/i,
  );
});

test('Stable resolves the unique nested source qualification receipt and fails closed on unsafe layouts', () => {
  const stable = parseWorkflow('release-stable.yml');
  const admissionRun = String(stable.jobs.admission.steps.find(
    (step: Record<string, unknown>) => step.name === 'Admit one bounded Bundle operation',
  )?.run ?? '');
  const protectedAdmission = stable.jobs['protected-admission'];
  const protectedRun = String(protectedAdmission.steps.find(
    (step: Record<string, unknown>) => step.name === 'Seal one same-run Stable admission manifest',
  )?.run ?? '');

  for (const [name, run] of [['admission', admissionRun], ['protected-admission', protectedRun]] as const) {
    const resolver = sourceQualificationReceiptResolver(run);
    const nested = runSourceQualificationReceiptResolver(resolver, 'nested');
    assert.equal(nested.status, 0, `${name}: ${nested.stderr}`);
    assert.equal(
      nested.stdout.trim(),
      'source-qualification-evidence/_temp/opl-source-qualification-30214273664/source-qualification-receipt.json',
    );
    for (const fixture of ['missing', 'duplicate', 'symlink-only', 'empty'] as const) {
      const rejected = runSourceQualificationReceiptResolver(resolver, fixture);
      assert.notEqual(rejected.status, 0, `${name} must reject ${fixture}`);
    }
  }

  assert.match(admissionRun, /--receipt "\$qualification_receipt_path"/);
  assert.match(protectedRun, /--receipt "\$qualification_receipt_path"/);
  assert.match(protectedRun, /--source-qualification-receipt "\$qualification_receipt_path"/);
  const protectedUpload = protectedAdmission.steps.find(
    (step: Record<string, unknown>) => step.name === 'Upload same-run protected admission evidence',
  );
  assert.match(
    String(protectedUpload?.with?.path ?? ''),
    /\$\{\{ steps\.manifest\.outputs\.qualification_receipt_path \}\}/,
  );
});

test('Standard notes and Bundle freeze stay independent from Full and Package authority', () => {
  const workflow = parseWorkflow('_release-bundle.yml');
  const source = readWorkflow('_release-bundle.yml');
  const standardPublishSource = readWorkflow('_release-standard-publish.yml');
  const frameworkCheckout = workflowStep(
    '_release-bundle.yml',
    'freeze',
    'Checkout Framework source and executor',
  );
  assert.equal(frameworkCheckout.with.repository, 'gaofeng21cn/one-person-lab');
  assert.equal(frameworkCheckout.with.ref, "${{ inputs.framework_ref || 'main' }}");
  assert.equal(frameworkCheckout.with.path, 'framework-source');
  const identityScript = String(workflowStep(
    '_release-bundle.yml',
    'freeze',
    'Freeze source, version, and compatibility identity',
  ).run);
  assert.match(identityScript, /\[ "\$app_sha" = "\$REQUESTED_APP_REF" \]/);
  assert.match(identityScript, /\[ "\$shell_sha" = "\$REQUESTED_SHELL_REF" \]/);
  assert.match(identityScript, /\[ "\$framework_sha" = "\$REQUESTED_FRAMEWORK_REF" \]/);
  assert.doesNotMatch(identityScript, /canonical_(?:app|shell|framework)_sha/);
  assert.doesNotMatch(identityScript, /ls-remote[^\n]*refs\/heads\/main/);
  for (const scratchPath of [
    '$RUNNER_TEMP/opl-published-releases-$GITHUB_RUN_ID.json',
    '$RUNNER_TEMP/opl-published-tags-$GITHUB_RUN_ID.txt',
    '$RUNNER_TEMP/opl-stable-version-order-$GITHUB_RUN_ID.json',
    '$RUNNER_TEMP/opl-previous-latest-$GITHUB_RUN_ID.json',
  ]) {
    assert.ok(identityScript.includes(scratchPath), `identity scratch is not outside the App tree: ${scratchPath}`);
  }
  assert.doesNotMatch(identityScript, /nightly-tags|resolveNightlyReleaseVersion/);
  assert.doesNotMatch(
    identityScript,
    /> (?:published-releases\.json|published-tags\.txt|stable-version-order\.json|previous-latest\.json|nightly-tags\.txt)/,
  );
  assert.equal(workflow.jobs['full-notes-authority'], undefined);
  assert.deepEqual(workflow.jobs.freeze.needs, ['admission']);
  assert.equal(workflow.jobs.freeze['runs-on'], 'macos-latest');
  assert.doesNotMatch(source, /prepare-release-notes-full-payload-authority|notes-full-payload-authority/);
  assert.doesNotMatch(source, /release_set_manifest|latest-stable-descriptor|base-release-set/);
  assert.match(source, /resolve-github-target-commit\.ts/);
  assert.match(standardPublishSource, /resolve-github-target-commit\.ts/);

  const step = workflowStep(
    '_release-bundle.yml',
    'freeze',
    'Prepare and validate online AI notes',
  );
  assert.equal(step.env.OPL_RELEASE_NOTES_MODE, 'ai');
  assert.equal(step.env.OPL_RELEASE_NOTES_PROVIDER, 'openai_compatible');
  assert.equal(step.env.OPL_RELEASE_NOTES_MODEL, 'gpt-5.6-luna');
  assert.equal(
    step.env.OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_MODELS,
    'gpt-5.6-luna,gpt-5.4',
  );
  const script = String(step.run);
  assert.doesNotMatch(script, /--include-full-package|--full-payload-authority|--full-package-manifest/);
  assert.match(script, /notes_root="\$RUNNER_TEMP\/opl-release-prepared-notes-\$GITHUB_RUN_ID"/);
  assert.match(script, /set --\nif \(\( \$\{#notes_intent_args\[@\]\} \)\); then/);
  assert.match(script, /set -- "\$\{notes_intent_args\[@\]\}"/);
  assert.match(script, /^\s*"\$@"\s*\\$/m);
  assert.doesNotMatch(script, /^\s*"\$\{notes_intent_args\[@\]\}"\s*\\$/m);
  assert.match(script, /--evidence-output "\$notes_root\/notes-evidence\.json"/);
  assert.doesNotMatch(script, /One-Person-Lab-Manual|dist\/opl-full-release|full-package-manifest\.json/);
  const guard = script.match(/set --\n\s*if \(\( \$\{#notes_intent_args\[@\]\} \)\); then\n\s*set -- "\$\{notes_intent_args\[@\]\}"\n\s*fi/)?.[0];
  assert.ok(guard);
  for (const [name, initial, expected] of [
    ['empty', 'notes_intent_args=()', []],
    ['nonempty', 'notes_intent_args=(one "two words" three)', ['one', 'two words', 'three']],
  ] as const) {
    const result = spawnSync('/bin/bash', ['-u', '-c', [
      initial,
      guard,
      'printf "%s\\0" "$@"',
    ].join('\n')], { encoding: 'buffer' });
    assert.equal(result.status, 0, `${name}: ${String(result.stderr)}`);
    assert.deepEqual(
      result.stdout.toString().split('\0').filter(Boolean),
      expected,
      `${name} Bash 3.2 argument forwarding drifted`,
    );
  }

  const freezeScript = String(workflowStep(
    '_release-bundle.yml',
    'freeze',
    'Freeze canonical Framework Bundle',
  ).run);
  assert.match(freezeScript, /--notes "\$notes_root\/notes\.md"/);
  assert.match(freezeScript, /--notes-evidence "\$notes_root\/notes-evidence\.json"/);
  assert.match(freezeScript, /--package-compatibility-abi '\$\{\{ inputs\.package_compatibility_abi \}\}'/);
  assert.match(freezeScript, /--package-compatibility-version-range '\$\{\{ inputs\.package_compatibility_version_range \}\}'/);
  assert.doesNotMatch(freezeScript, /--release-set-manifest|--frozen-base-release-set|--notes-full-payload-authority/);
  assert.doesNotMatch(freezeScript, /oras manifest fetch|npm view|--base-image-index|--frozen-codex-tarball/);
  assert.doesNotMatch(freezeScript, /(?:^|\n)\s*docker(?:\s|$)/);
  assert.ok(
    freezeScript.indexOf('scripts/framework-release-adapter.ts freeze-request')
      < freezeScript.indexOf('cp "$notes_root/notes-evidence.json" notes-evidence.json'),
  );

  const releaseContract = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'contracts', 'app-release-channel.json'), 'utf8'),
  );
  const binding = releaseContract.release_bundle_control_plane.prepared_notes.full_payload_authority_binding;
  assert.equal(binding.schema, 'opl_app_release_notes_full_payload_authority.v1');
  assert.equal(binding.evidence_digest_path, 'payload.full_payload_authority_sha256');
  assert.equal(binding.comparison, 'canonical_json_exact_field_set_and_values');
  assert.equal(binding.new_standard_consumes_same_file, false);
  assert.equal(binding.legacy_bundle_read_compatibility_only, true);
});

test('every release-bound low-level admission rejects missing, invalid, or permanently rejected identity', () => {
  const digest = `sha256:${'a'.repeat(64)}`;
  const baseInputs = {
    operation_started_at: '2026-07-21T00:00:00.000Z',
    operation_deadline_at: '2099-07-21T00:00:00.000Z',
    release_bundle_digest: digest,
    ref: '1'.repeat(40),
    artifact_app_ref: '1'.repeat(40),
    app_ref: '1'.repeat(40),
    artifact_app_sha: '1'.repeat(40),
    shell_ref: '2'.repeat(40),
    framework_ref: '3'.repeat(40),
    baseline_dmg_sha256: '4'.repeat(64),
    standard_identity_sha256: `sha256:${'5'.repeat(64)}`,
  };
  const gates = [
    {
      workflow: '_build-reusable.yml',
      job: 'build',
      step: 'Admit one-shot release-bound build',
      operation: 'standard',
      fields: ['release_bundle_digest', 'ref', 'shell_ref', 'framework_ref'],
    },
    {
      workflow: 'opl-first-run-vm.yml',
      job: 'validate-vm-inputs',
      step: 'Admit one-shot release-bound qualification',
      operation: 'standard',
      fields: ['release_bundle_digest', 'artifact_app_ref', 'shell_ref', 'framework_ref'],
    },
    {
      workflow: 'opl-updater-upgrade-vm.yml',
      job: 'upgrade',
      step: 'Reject replay and invalid frozen identities',
      operation: 'resume_standard',
      fields: ['release_bundle_digest', 'app_ref', 'shell_ref', 'framework_ref'],
    },
    {
      workflow: 'full-first-install-release.yml',
      job: 'full-first-install',
      step: 'Admit one-shot release-bound Full build',
      operation: 'append_full',
      fields: ['release_bundle_digest', 'artifact_app_sha', 'shell_ref', 'framework_ref'],
    },
  ] as const;

  for (const gate of gates) {
    const admission = workflowStep(gate.workflow, gate.job, gate.step);
    const source = String(admission.run);
    assert.match(source, /opl_release_nested_admission_receipt\.v1/);
    assert.match(source, /input-digest\.txt/);
    assert.match(source, /stdout\.txt/);
    assert.match(source, /stderr\.txt/);
    assert.match(source, /input_digest:\$input_digest/);
    assert.match(source, new RegExp(rejectedBundle));
    const validInputs = { ...baseInputs, operation: gate.operation };
    const valid = runAdmissionGate(gate.workflow, gate.job, gate.step, validInputs);
    assert.equal(valid.status, 0, `${gate.workflow} valid gate failed: ${valid.stderr}`);

    for (const field of gate.fields) {
      const missing = runAdmissionGate(gate.workflow, gate.job, gate.step, { ...validInputs, [field]: '' });
      assert.notEqual(missing.status, 0, `${gate.workflow} accepted missing ${field}`);
      const invalidValue = field === 'release_bundle_digest' ? 'sha256:not-exact' : 'A'.repeat(40);
      const invalid = runAdmissionGate(gate.workflow, gate.job, gate.step, {
        ...validInputs,
        [field]: invalidValue,
      });
      assert.notEqual(invalid.status, 0, `${gate.workflow} accepted invalid ${field}`);
    }

    const rejected = runAdmissionGate(gate.workflow, gate.job, gate.step, {
      ...validInputs,
      release_bundle_digest: rejectedBundle,
    });
    assert.notEqual(rejected.status, 0, `${gate.workflow} accepted the permanently rejected Bundle`);
  }

  for (const [workflow, job, step] of [
    ['_build-reusable.yml', 'build', 'Admit one-shot release-bound build'],
    ['opl-first-run-vm.yml', 'validate-vm-inputs', 'Admit one-shot release-bound qualification'],
    ['full-first-install-release.yml', 'full-first-install', 'Admit one-shot release-bound Full build'],
  ]) {
    assert.equal(workflowStep(workflow, job, step).if, "${{ inputs.operation != '' }}");
  }
});

test('the live control plane is split into Standard build, Standard publish, and additive Full workflows', () => {
  const bundle = parseWorkflow('_release-bundle.yml');
  const standard = parseWorkflow('_release-standard-publish.yml');
  const full = parseWorkflow('_release-full-addon.yml');

  assert.deepEqual(Object.keys(bundle.on), ['workflow_call']);
  assert.deepEqual(Object.keys(standard.on), ['workflow_call']);
  assert.deepEqual(Object.keys(full.on), ['workflow_call']);
  assert.equal(bundle.permissions, undefined);
  assert.equal(standard.permissions, undefined);
  assert.equal(full.permissions, undefined);
  assert.deepEqual(Object.keys(bundle.jobs), [
    'startup-canary',
    'admission',
    'freeze',
    'standard-build',
    'seal-standard-identity',
    'checkpoint-standard',
    'prepare-native-webui',
    'publish-standard',
    'publish-native-webui',
  ]);
  assert.ok(standard.jobs.restore);
  assert.equal(standard.jobs['updater-upgrade-qualification'], undefined);
  assert.equal(standard.jobs['homebrew-standard-vm'], undefined);
  assert.ok(standard.jobs['publish-standard-nonlatest']);
  assert.ok(standard.jobs['activate-latest']);
  assert.ok(full.jobs['restore-standard']);
  assert.ok(full.jobs['materialize-full-build']);
  assert.ok(full.jobs['checkpoint-full']);
  assert.ok(full.jobs.provenance);
  assert.ok(full.jobs['publish-full']);
  for (const [workflow, inheritedMutationJobs] of [
    [bundle, new Set(['publish-standard', 'publish-native-webui'])],
    [standard, new Set(['publish-standard-nonlatest', 'activate-latest'])],
    [full, new Set(['publish-full'])],
  ] as const) {
    for (const [jobId, job] of Object.entries(workflow.jobs) as Array<[string, Record<string, any>]>) {
      if (inheritedMutationJobs.has(jobId)) {
        assert.equal(job.permissions, undefined, `${jobId} must inherit the caller permission ceiling`);
      } else {
        assert.deepEqual(job.permissions, { contents: 'read', actions: 'read' }, `${jobId} must be read-only`);
      }
    }
  }
  assert.doesNotMatch(`${readWorkflow('_release-bundle.yml')}\n${readWorkflow('_release-standard-publish.yml')}\n${readWorkflow('_release-full-addon.yml')}`, /release[_ -]broker|stable[_ -]session[_ -]lease/i);
});

test('resume admission restores and preserves the checkpoint-owned Standard operation control', () => {
  const workflow = parseWorkflow('_release-standard-publish.yml');
  const source = readWorkflow('_release-standard-publish.yml');
  const restore = workflow.jobs.restore;
  const reconcile = workflowStep(
    '_release-standard-publish.yml',
    'restore',
    'Reconcile imported outcome and reuse immutable Standard control',
  );
  const reconcileRun = String(reconcile.run);
  const operationRef = '${{ needs.restore.outputs.release_operation }}';
  const originalStartedAt = '2026-07-24T09:04:32Z';
  const originalDeadlineAt = '2026-07-24T10:34:32Z';

  assert.doesNotThrow(() => assertReleaseOperationDeadline({
    operation: 'resume_standard',
    startedAt: originalStartedAt,
    deadlineAt: '2026-07-24T09:34:32Z',
    now: '2026-07-24T09:20:00Z',
  }));
  assert.doesNotThrow(() => assertReleaseOperationDeadline({
    operation: 'standard',
    startedAt: originalStartedAt,
    deadlineAt: originalDeadlineAt,
    now: '2026-07-24T10:20:00Z',
  }));
  assert.throws(() => assertReleaseOperationDeadline({
    operation: 'resume_standard',
    startedAt: originalStartedAt,
    deadlineAt: originalDeadlineAt,
    now: '2026-07-24T09:20:00Z',
  }), /exactly 30 minutes/);

  assert.equal(restore.outputs.release_operation, '${{ steps.operation.outputs.release_operation }}');
  assert.match(reconcileRun, /requested_operation='\$\{\{ inputs\.operation \}\}'/);
  assert.match(reconcileRun, /case "\$requested_operation" in standard\|resume_standard/);
  assert.match(reconcileRun, /release_operation=standard/);
  assert.match(reconcileRun, /operation_started_at="\$\(jq -er '[^']*operation_controls\.standard\.operation_started_at/);
  assert.match(reconcileRun, /operation_deadline_at="\$\(jq -er '[^']*operation_controls\.standard\.operation_deadline_at/);
  assert.match(reconcileRun, /echo "release_operation=\$release_operation"/);
  assert.match(reconcileRun, /echo "operation_started_at=\$operation_started_at"/);
  assert.match(reconcileRun, /echo "operation_deadline_at=\$operation_deadline_at"/);

  for (const jobId of [
    'publish-standard-nonlatest',
    'remote-digest-verify',
    'publish-homebrew-standard',
  ]) {
    const jobSource = JSON.stringify(workflow.jobs[jobId]);
    assert.match(jobSource, /needs\.restore\.outputs\.release_operation/);
    assert.doesNotMatch(jobSource, /inputs\.operation/);
  }

  assert.match(source, /test "\$\(jq -r \.rebuild_performed <<<"\$CHECKPOINT_IMPORT"\)" = false/);
  assert.doesNotMatch(source, /uses:\s*\.\/\.github\/workflows\/_release-bundle\.yml/);
  assert.doesNotMatch(source, /opl release (?:freeze|build|verify)\b/);
});

test('checkpoint state lineage remains Framework-owned while App exposes transport provenance only', () => {
  for (const name of ['_release-bundle.yml', '_release-standard-publish.yml', '_release-full-addon.yml']) {
    const workflow = parseWorkflow(name);
    const inputs = workflow.on.workflow_call.inputs;
    const outputs = workflow.on.workflow_call.outputs;
    for (const field of [...transportProvenanceFields, ...frameworkOwnedLineageFields]) {
      assert.equal(inputs[field], undefined, `${name} must not accept operator-supplied ${field}`);
    }
    for (const field of transportProvenanceFields) {
      assert.ok(outputs[field], `${name} must expose ${field}`);
    }
    for (const field of frameworkOwnedLineageFields) {
      assert.equal(outputs[field], undefined, `${name} must not project Framework-owned ${field}`);
    }
    assert.match(readWorkflow(name), new RegExp(minimumCompatibleFrameworkAbiRef));
    assert.match(readWorkflow(name), new RegExp(rejectedBundle));
  }

  const bundleSource = readWorkflow('_release-bundle.yml');
  assert.match(bundleSource, /standard-build-receipt\.json/);
  assert.match(bundleSource, /checkpoint_transport_executor=github_actions/);
  const fullSource = readWorkflow('_release-full-addon.yml');
  assert.match(fullSource, /standard-build-receipt\.json/);
  assert.match(fullSource, /full-build-receipt\.json/);
  assert.doesNotMatch(readWorkflow('_release-standard-publish.yml'), /bound_standard_v1|checkpoint-migration/);

  const action = fs.readFileSync(path.join(process.cwd(), '.github', 'actions', 'restore-release-checkpoint', 'action.yml'), 'utf8');
  assert.match(action, /rebuild_performed/);
  assert.match(action, /publish_state_imported/);
  assert.match(action, /opl release checkpoint import/);
  assert.match(action, /opl release status/);
  assert.doesNotMatch(action, /standard-build-receipt\.json|full-build-receipt\.json/);
  for (const field of transportProvenanceFields) assert.match(action, new RegExp(field));
  for (const field of frameworkOwnedLineageFields) assert.doesNotMatch(action, new RegExp(field));
});

test('completed Full stages skip work already proven by the checkpoint', () => {
  const full = parseWorkflow('_release-full-addon.yml');
  assert.match(String(full.jobs['full-build'].if), /standard_qualified/);
  assert.match(String(full.jobs['materialize-full-build'].if), /full_built/);
  assert.match(String(full.jobs['full-qualification'].if), /standard_qualified/);
  assert.match(String(full.jobs['full-qualification'].if), /full_built/);
  assert.match(String(full.jobs['checkpoint-full'].if), /full_qualified/);
  assert.match(String(full.jobs.provenance.if), /full_qualified/);

  const bind = full.jobs['checkpoint-full'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Bind Full bytes and export additive checkpoint',
  );
  const run = String(bind?.run ?? '');
  assert.match(run, /standard_qualified\)/);
  assert.match(run, /full_built\)/);
  assert.match(run, /cp "\$original_full_receipt" full-build-receipt\.json/);
  assert.equal((run.match(/opl release build/g) ?? []).length, 1);
  assert.match(run, /--hosted-core-qualification "\$hosted_receipt"/);
  assert.doesNotMatch(run, /--legacy-qualification/);
  const qualification = full.jobs['full-qualification'];
  assert.equal(qualification['runs-on'], 'macos-14');
  assert.equal(qualification.uses, undefined);
  assert.deepEqual(qualification.permissions, { contents: 'read', actions: 'read' });
  const qualificationRun = qualification.steps
    .map((step: Record<string, unknown>) => String(step.run ?? ''))
    .join('\n');
  assert.match(qualificationRun, /hdiutil attach "\$dmg_path" -nobrowse -readonly/);
  assert.match(qualificationRun, /codesign --verify --deep --strict/);
  assert.match(qualificationRun, /xcrun stapler validate/);
  assert.match(qualificationRun, /spctl --assess/);
  assert.doesNotMatch(qualificationRun, /opl-first-run-vm|tart\b/i);
  assert.match(readWorkflow('_release-full-addon.yml'), /rebuild_performed/);
});

test('mandatory publication ancestors contain no self-hosted, VM, or Tart job', () => {
  const releaseContract = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'contracts', 'app-release-channel.json'), 'utf8'),
  );
  const vmGates = releaseContract.release_acceleration.vm_gates;
  assert.deepEqual(
    vmGates.map((gate: Record<string, unknown>) => gate.id),
    [
      'standard_dmg_clean_vm_smoke',
      'homebrew_standard_cask_clean_vm_smoke',
      'full_dmg_clean_vm_smoke',
    ],
  );
  for (const gate of vmGates) {
    assert.equal(gate.diagnostic_scope, 'post_publication_optional_certification');
    assert.equal(gate.gate_policy, 'optional_non_blocking_same_published_artifact');
    assert.ok(Array.isArray(gate.certification_readiness));
    assert.equal('release_blocking_readiness' in gate, false);
  }
  const stableValidation = releaseContract.release_validation_profiles.stable;
  assert.equal(stableValidation.addon_gate_blocking_standard_terminal, false);
  assert.equal(stableValidation.addon_lanes.includes('full_dmg_clean_vm_smoke'), false);
  assert.equal(
    stableValidation.post_publication_optional_certification_surfaces.includes('full_dmg_clean_vm_smoke'),
    true,
  );

  const standard = parseWorkflow('_release-standard-publish.yml');
  const publish = standard.jobs['publish-standard-nonlatest'];
  const homebrew = standard.jobs['publish-homebrew-standard'];
  const latest = standard.jobs['activate-latest'];

  const ancestors = (jobName: string): string[] => {
    const found = new Set<string>();
    const visit = (name: string) => {
      for (const dependency of standard.jobs[name]?.needs ?? []) {
        if (!found.has(dependency)) {
          found.add(dependency);
          visit(dependency);
        }
      }
    };
    visit(jobName);
    return [...found].sort();
  };
  for (const jobName of [
    'publish-standard-nonlatest',
    'remote-digest-verify',
    'publish-homebrew-standard',
    'homebrew-standard-readback',
  ]) {
    for (const ancestor of ancestors(jobName)) {
      const source = JSON.stringify(standard.jobs[ancestor]);
      assert.doesNotMatch(
        source,
        /self-hosted|(?:^|[^a-z])tart(?:[^a-z]|$)|(?:^|[^a-z])vm(?:[^a-z]|$)/i,
        `${jobName} depends on ${ancestor}`,
      );
    }
  }
  assert.deepEqual(publish.needs, ['restore', 'pre-publication-admission']);
  assert.ok(homebrew.needs.includes('remote-digest-verify'));
  assert.equal(
    latest.if,
    "${{ needs.restore.result == 'success' && needs.remote-digest-verify.result == 'success' }}",
  );
  assert.deepEqual(latest.needs, ['restore', 'remote-digest-verify', 'homebrew-standard-readback']);
  const full = parseWorkflow('_release-full-addon.yml');
  const fullAncestors = (jobName: string): string[] => {
    const found = new Set<string>();
    const visit = (name: string) => {
      const needs = full.jobs[name]?.needs;
      for (const dependency of typeof needs === 'string' ? [needs] : needs ?? []) {
        if (!found.has(dependency)) {
          found.add(dependency);
          visit(dependency);
        }
      }
    };
    visit(jobName);
    return [...found].sort();
  };
  assert.ok(fullAncestors('publish-full').includes('full-qualification'));
  for (const ancestor of fullAncestors('publish-full')) {
    const source = JSON.stringify(full.jobs[ancestor]);
    assert.doesNotMatch(
      source,
      /self-hosted|(?:^|[^a-z])tart(?:[^a-z]|$)|opl-first-run-vm/i,
      `publish-full depends on ${ancestor}`,
    );
  }
  assert.equal(standard.jobs['updater-upgrade-qualification'], undefined);
  assert.equal(standard.jobs['updater-upgrade-qualification-highest'], undefined);
  assert.equal(standard.jobs['homebrew-standard-vm'], undefined);
  assert.match(readWorkflow('_release-standard-publish.yml'), /highest_public_stable/);
  assert.match(readWorkflow('_release-bundle.yml'), /resolveStableReleaseVersion/);
  assert.match(readWorkflow('_release-bundle.yml'), /ghcr\.io\/token\?scope=repository:gaofeng21cn\/one-person-lab-webui:pull/);
  assert.match(readWorkflow('_release-bundle.yml'), /ghcr\.io\/v2\/gaofeng21cn\/one-person-lab-webui\/manifests/);
  assert.match(readWorkflow('_release-bundle.yml'), /PUBLISHED_WEBUI_TAGS_TXT/);
  assert.match(readWorkflow('_release-bundle.yml'), /--published-releases-json/);

  const updater = readWorkflow('opl-updater-upgrade-vm.yml');
  assert.match(updater, /candidate_zip_size/);
  assert.match(updater, /candidate_zip_sha256/);
  assert.match(updater, /tracks\/standard\/assets\.json/);
  assert.match(updater, /candidate ZIP entry must be unique/);
  assert.match(updater, /sha256:\$candidate_zip_sha256.*\$checkpoint_zip_sha256/);
  assert.match(updater, /candidate_zip_size.*checkpoint_zip_size/);
  assert.match(updater, /metadata_declared_sha512/);
  assert.match(updater, /metadata_declared_size/);
  assert.match(updater, /same_candidate_zip_downloaded/);

  const fingerprint = String(workflowStep(
    'opl-updater-upgrade-vm.yml',
    'upgrade',
    'Download and fingerprint the installed predecessor',
  ).run);
  const metadataParser = fingerprint.match(
    /metadata_json="\$\(ruby -ryaml -rjson -e '\n([\s\S]*?)\n\s*' "\$metadata" "\$\(basename "\$zip"\)"\)"/,
  )?.[1];
  assert.ok(metadataParser, 'updater metadata parser is missing');
  assert.match(
    metadataParser,
    /YAML\.safe_load\(File\.read\(ARGV\[0\]\), permitted_classes: \[Time\], aliases: true\)/,
  );
  assert.match(metadataParser, /File\.basename\(candidate\["url"\]\.to_s\) == name/);
  assert.match(fingerprint, /Candidate ZIP SHA-256 does not match tracks\/standard\/assets\.json/);
  assert.match(fingerprint, /Candidate ZIP size does not match tracks\/standard\/assets\.json/);
  assert.match(fingerprint, /Updater metadata SHA-512 does not match candidate ZIP/);
  assert.match(fingerprint, /Updater metadata size does not match candidate ZIP/);

  const metadataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-updater-time-metadata-'));
  const zipName = 'One-Person-Lab-26.7.26-mac-arm64.zip';
  const metadataPath = path.join(metadataRoot, 'latest-arm64-mac.yml');
  try {
    fs.writeFileSync(metadataPath, [
      'version: 26.7.2600',
      'releaseDate: 2026-07-25T21:29:28Z',
      'files:',
      `  - url: ${zipName}`,
      '    sha512: updater-sha512',
      '    size: 465998660',
      '',
    ].join('\n'));
    const parsedMetadata = spawnSync('ruby', [
      '-ryaml',
      '-rjson',
      '-e',
      metadataParser,
      metadataPath,
      zipName,
    ], { encoding: 'utf8' });
    assert.equal(parsedMetadata.status, 0, parsedMetadata.stderr);
    assert.deepEqual(JSON.parse(parsedMetadata.stdout), {
      sha512: 'updater-sha512',
      size: 465998660,
      url: zipName,
    });
  } finally {
    fs.rmSync(metadataRoot, { recursive: true, force: true });
  }

  const sha512Command = fingerprint.match(/^\s*actual_sha512="\$\((.+)\)"$/m)?.[1];
  assert.ok(sha512Command, 'updater SHA-512 calculation is missing');
  assert.match(sha512Command, /openssl dgst -sha512 -binary "\$zip" \| base64 \| awk '\{printf "%s", \$0\}'/);

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-updater-sha512-'));
  const fixture = path.join(fixtureRoot, 'candidate.zip');
  fs.writeFileSync(fixture, 'opl-updater-sha512-regression-2\n');
  const expected = crypto.createHash('sha512').update(fs.readFileSync(fixture)).digest('base64');
  assert.ok(expected.includes('n'), 'regression fixture must exercise lowercase n in the Base64 alphabet');
  const calculated = spawnSync('/bin/bash', ['-c', [
    'set -euo pipefail',
    `zip=${JSON.stringify(fixture)}`,
    `actual_sha512="$(${sha512Command})"`,
    'printf %s "$actual_sha512"',
  ].join('\n')], { encoding: 'utf8' });
  assert.equal(calculated.status, 0, calculated.stderr);
  assert.equal(calculated.stdout, expected);
});

test('hosted publication restores built checkpoints without reintroducing VM-qualified admission', () => {
  const source = readWorkflow('_release-standard-publish.yml');
  assert.match(source, /standard_built\|standard_qualified\|full_built\|full_qualified/);
  assert.match(source, /stable_built\|stable_qualified\|full_built\|full_qualified/);
  assert.match(source, /Hosted Standard publication requires a checkpoint at or after standard_built/);
  assert.match(source, /Unified hosted publication requires a checkpoint at or after stable_built/);
  assert.doesNotMatch(source, /requires a checkpoint at or after standard_qualified/);
  assert.doesNotMatch(source, /requires an exact stable_qualified checkpoint/);
});

test('mutation unknown states persist evidence and only use bounded read-only reconciliation', () => {
  for (const name of ['_release-standard-publish.yml', '_release-full-addon.yml']) {
    const source = readWorkflow(name);
    assert.match(source, /input-digest\.txt/);
    assert.match(source, /stdout\.txt/);
    assert.match(source, /stderr\.txt/);
    assert.match(source, /if: \$\{\{ always\(\) \}\}/);
    assert.match(source, /--operation-id/);
    assert.match(source, /--operation-started-at/);
    assert.match(source, /--operation-deadline-at/);
  }
  const homebrew = readWorkflow('_release-standard-publish.yml');
  assert.match(homebrew, /timeout --foreground --signal=TERM --kill-after=5s/);
  assert.match(homebrew, /readonly_timeout_seconds=30/);
  assert.match(homebrew, /git -C tap-source ls-remote origin refs\/heads\/main/);
  assert.doesNotMatch(homebrew, /for attempt in 1 2 3|three read-only reconciliations/);
  assert.match(homebrew, /push_count=0/);
  assert.match(homebrew, /test "\$push_count" -eq 1/);
  assert.equal((homebrew.match(/git -C tap-source push --no-force origin/g) ?? []).length, 1);
  const standardSource = readWorkflow('_release-standard-publish.yml');
  const fullSource = readWorkflow('_release-full-addon.yml');
  assert.match(standardSource, /release_bundle_status\.tracks\.standard\.reconcile_required/);
  assert.match(fullSource, /release_bundle_status\.tracks\.full\.reconcile_required/);
  for (const source of [standardSource, fullSource]) {
    assert.match(source, /release_bundle_status\.active_unknown_markers/);
    assert.match(source, /prior_mutation_attempt_id/);
    assert.match(source, /publication_scope/);
    assert.match(source, /outcome_unknown[\s\S]*--outcome unknown[\s\S]*opl release publish[\s\S]*opl release status[\s\S]*opl release reconcile/);
    assert.match(source, /deadline_elapsed[\s\S]*reconcile is not authorized without a persisted unknown outcome/);
  }
  assert.equal((standardSource.match(/framework-release-adapter\.ts github-activate-latest/g) ?? []).length, 1);
  assert.match(standardSource, /case "\$latest_status" in[\s\S]*complete\|idempotent/);
  assert.match(standardSource, /Latest activation was not conclusively read back; no retry was attempted/);
  assert.match(readWorkflow('_release-standard-publish.yml'), /fresh_bounded_read_only_inspect_then_framework_reconcile/);
  assert.match(readWorkflow('_release-full-addon.yml'), /fresh_bounded_read_only_inspect_then_framework_reconcile/);
});

test('Stable recovery scripts avoid Bash 4-only mapfile on macOS runners', () => {
  for (const relativePath of [
    '.github/workflows/_release-standard-publish.yml',
    '.github/workflows/_release-full-addon.yml',
    '.github/actions/restore-release-checkpoint/action.yml',
  ]) {
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
    assert.doesNotMatch(source, /\bmapfile\b/, relativePath);
  }
});

test('every recoverable Standard unknown artifact carries exactly one original build receipt', () => {
  const workflow = parseWorkflow('_release-standard-publish.yml');
  const jobs = [
    {
      name: 'publish-standard-nonlatest',
      uploadStep: 'Upload Standard publication receipt',
      artifact: 'opl-release-standard-published-${{ github.run_id }}',
      checkpoint: 'standard-github-unknown-checkpoint',
    },
    {
      name: 'publish-homebrew-standard',
      uploadStep: 'Upload Standard Homebrew publication receipt',
      artifact: 'opl-release-homebrew-standard-${{ github.run_id }}',
      checkpoint: 'homebrew-unknown-checkpoint',
    },
    {
      name: 'activate-latest',
      uploadStep: 'Upload Latest activation receipt',
      artifact: 'opl-release-activation-${{ github.run_id }}',
      checkpoint: 'latest-unknown-checkpoint',
    },
  ] as const;

  for (const job of jobs) {
    const positive = runPortableStandardBuildReceiptStep(job.name, 1);
    assert.equal(positive.result.status, 0, `${job.name}: ${positive.result.stderr}`);
    assert.deepEqual(positive.outputBytes, positive.sourceBytes, job.name);

    for (const receiptCount of [0, 2]) {
      const rejected = runPortableStandardBuildReceiptStep(job.name, receiptCount);
      assert.notEqual(rejected.result.status, 0, `${job.name}:${receiptCount}`);
      assert.equal(rejected.outputBytes, null, `${job.name}:${receiptCount}`);
      assert.match(
        `${rejected.result.stdout}\n${rejected.result.stderr}`,
        new RegExp(`exactly one App-owned standard-build-receipt\\.json; found ${receiptCount}`),
        `${job.name}:${receiptCount}`,
      );
    }

    const symlinkOnly = runPortableStandardBuildReceiptStep(job.name, 'symlink-only');
    assert.notEqual(symlinkOnly.result.status, 0, `${job.name}:symlink-only`);
    assert.equal(symlinkOnly.outputBytes, null, `${job.name}:symlink-only`);
    assert.match(
      `${symlinkOnly.result.stdout}\n${symlinkOnly.result.stderr}`,
      /exactly one App-owned standard-build-receipt\.json; found 0/,
      `${job.name}:symlink-only`,
    );

    const upload = workflow.jobs[job.name].steps.find(
      (step: Record<string, unknown>) => step.name === job.uploadStep,
    );
    assert.ok(upload, `${job.name}:${job.uploadStep}`);
    assert.equal(upload.with.name, job.artifact);
    assert.match(String(upload.with.path), new RegExp(`(?:^|\\n)${job.checkpoint}(?:\\n|$)`));
    assert.match(String(upload.with.path), /(?:^|\n)standard-build-receipt\.json(?:\n|$)/);
  }

  const standardFailure = String(
    workflowStep(
      '_release-standard-publish.yml',
      'publish-standard-nonlatest',
      'Persist typed Standard publication failure',
    ).run,
  );
  assert.match(standardFailure, /opl-release-standard-published-\$\{GITHUB_RUN_ID\}/);
  assert.match(standardFailure, /resume_source:\(if \$framework_reconcile_authorized then \{run_id:\$resume_source_run_id,artifact:\$resume_source_artifact\}/);

  const homebrewMutation = String(
    workflowStep(
      '_release-standard-publish.yml',
      'publish-homebrew-standard',
      'Publish one digest-bound Standard cask commit',
    ).run,
  );
  assert.match(homebrewMutation, /true "opl-release-homebrew-standard-\$\{GITHUB_RUN_ID\}"/);
  assert.match(homebrewMutation, /resume_source_run_id:\(if \$resume_source_artifact == "" then null else \$resume_source_run_id end\)/);

  const latestFailure = String(
    workflowStep(
      '_release-standard-publish.yml',
      'activate-latest',
      'Persist typed Latest activation failure',
    ).run,
  );
  assert.match(latestFailure, /opl-release-activation-\$\{GITHUB_RUN_ID\}/);
  assert.match(latestFailure, /resume_source_run_id:\(if \$framework_reconcile_authorized then \$resume_source_run_id else null end\)/);
});

test('every real release build, VM, and mutation job rejects a partial rerun locally', () => {
  const guardedJobs = [
    ['_build-reusable.yml', 'build'],
    ['full-first-install-release.yml', 'full-first-install'],
    ['opl-first-run-vm.yml', 'clean-vm-first-run'],
    ['_release-standard-publish.yml', 'publish-standard-nonlatest'],
    ['_release-standard-publish.yml', 'publish-homebrew-standard'],
    ['_release-standard-publish.yml', 'activate-latest'],
    ['_release-full-addon.yml', 'publish-full'],
  ] as const;

  for (const [workflowName, jobName] of guardedJobs) {
    const workflow = parseWorkflow(workflowName);
    const source = JSON.stringify(workflow.jobs[jobName].steps ?? []);
    assert.match(source, /GITHUB_RUN_ATTEMPT/, `${workflowName}:${jobName}`);
    assert.match(source, /workflow_rerun|Partial rerun/, `${workflowName}:${jobName}`);
  }
  for (const workflowName of ['_release-standard-publish.yml', '_release-full-addon.yml']) {
    const source = readWorkflow(workflowName);
    assert.match(source, /failure_taxonomy:\"workflow_rerun\"/);
    assert.match(source, /input-digest\.txt/);
  }
});

test('the remote Canary starts all three reusable workflows with one synthetic checkpoint handle', () => {
  const canary = parseWorkflow('release-bundle-canary.yml');
  assert.ok(canary.on.push);
  assert.ok(canary.on.pull_request !== undefined);
  assert.deepEqual(canary.on.schedule, [{ cron: '0 13 * * *' }]);
  assert.equal(canary.on.workflow_dispatch, undefined);
  assert.deepEqual(canary.permissions, { contents: 'read', actions: 'read' });
  assert.equal(canary.jobs.standard.uses, './.github/workflows/_release-bundle.yml');
  assert.equal(canary.jobs['resume-standard'].uses, './.github/workflows/_release-standard-publish.yml');
  assert.equal(canary.jobs['append-full'].uses, './.github/workflows/_release-full-addon.yml');
  assert.equal(canary.jobs['nested-standard-build'].uses, './.github/workflows/_build-reusable.yml');
  assert.equal(canary.jobs['nested-standard-qualification'].uses, './.github/workflows/opl-first-run-vm.yml');
  assert.equal(canary.jobs['nested-webui-carrier'].uses, './.github/workflows/_release-webui-carrier.yml');
  assert.equal(canary.jobs['nested-webui-stable'].uses, './.github/workflows/release-webui-stable.yml');
  assert.equal(canary.jobs['nested-native-webui'].uses, './.github/workflows/_release-native-webui-carrier.yml');
  assert.equal(canary.jobs['nested-updater-qualification'].uses, './.github/workflows/opl-updater-upgrade-vm.yml');
  assert.equal(canary.jobs['nested-full-build'].uses, './.github/workflows/full-first-install-release.yml');
  const compileCeilingPermissions = { contents: 'read', actions: 'read', packages: 'write' };
  assert.deepEqual(canary.jobs.standard.permissions, { contents: 'read', actions: 'read' });
  assert.deepEqual(canary.jobs['nested-webui-carrier'].permissions, compileCeilingPermissions);
  assert.deepEqual(canary.jobs['nested-webui-stable'].permissions, compileCeilingPermissions);
  assert.equal(canary.jobs['resume-standard'].with.source_run_id, '424242');
  assert.equal(canary.jobs['append-full'].with.source_run_id, '424242');
  assert.equal(canary.jobs['resume-standard'].with.source_artifact, 'opl-release-canary-checkpoint-424242');
  assert.equal(canary.jobs['append-full'].with.source_artifact, 'opl-release-canary-checkpoint-424242');
  for (const [jobId, job] of Object.entries(canary.jobs) as Array<[string, Record<string, any>]>) {
    const permissions = job.permissions ?? canary.permissions;
    assert.equal(permissions.contents, 'read');
    assert.notEqual(permissions['id-token'], 'write');
    if (!['nested-webui-carrier', 'nested-webui-stable'].includes(jobId)) {
      assert.notEqual(permissions.packages, 'write');
    }
  }
  assert.doesNotMatch(readWorkflow('release-bundle-canary.yml'), /secrets:\s+inherit/);
  for (const name of ['_release-bundle.yml', '_release-standard-publish.yml', '_release-full-addon.yml']) {
    const workflow = parseWorkflow(name);
    assert.equal(workflow.jobs['startup-canary'].if, "${{ inputs.mode == 'canary' }}");
  }
  const bundle = parseWorkflow('_release-bundle.yml');
  assert.deepEqual(bundle.jobs['startup-canary'].permissions, { contents: 'read', actions: 'read' });
  const webui = parseWorkflow('_release-webui-carrier.yml');
  assert.deepEqual(webui.permissions, { contents: 'read' });
  assert.equal(webui.jobs['startup-canary'].if, "${{ inputs.mode == 'canary' }}");
  assert.equal(webui.jobs['build-and-qualify'].if, "${{ inputs.mode == 'execute' }}");
  assert.equal(webui.jobs['publish-immutable-carrier'].if, "${{ inputs.mode == 'execute' }}");
  assert.deepEqual(webui.jobs['publish-immutable-carrier'].permissions, {
    contents: 'read',
    packages: 'write',
  });
  for (const name of [
    '_build-reusable.yml',
    'full-first-install-release.yml',
    'opl-first-run-vm.yml',
    'opl-updater-upgrade-vm.yml',
  ]) {
    const workflow = parseWorkflow(name);
    assert.equal(workflow.jobs['startup-canary'].if, "${{ inputs.mode == 'canary' }}");
    assert.match(readWorkflow(name), new RegExp(minimumCompatibleFrameworkAbiRef));
  }
});

test('release-bound nested workflows inherit one operation and absolute deadline', () => {
  for (const name of [
    '_build-reusable.yml',
    'full-first-install-release.yml',
    'opl-first-run-vm.yml',
    'opl-updater-upgrade-vm.yml',
  ]) {
    const workflow = parseWorkflow(name);
    for (const input of ['operation', 'operation_started_at', 'operation_deadline_at']) {
      assert.ok(workflow.on.workflow_call.inputs[input], `${name} is missing ${input}`);
    }
    const source = readWorkflow(name);
    assert.match(source, /GITHUB_RUN_ATTEMPT/);
    assert.match(source, /operation_deadline_at/);
    assert.match(source, /opl_release_nested_admission_receipt\.v1/);
  }

  const bundle = readWorkflow('_release-bundle.yml');
  const standard = readWorkflow('_release-standard-publish.yml');
  const full = readWorkflow('_release-full-addon.yml');
  for (const input of ['operation:', 'operation_started_at:', 'operation_deadline_at:']) {
    assert.match(bundle, new RegExp(input));
    assert.match(standard, new RegExp(input));
    assert.match(full, new RegExp(input));
  }
  const bundleWorkflow = parseWorkflow('_release-bundle.yml');
  assert.equal(
    bundleWorkflow.jobs['standard-build'].with.operation,
    "${{ inputs.mode == 'execute' && inputs.operation || '' }}",
  );
  assert.equal(bundleWorkflow.jobs['standard-qualification'], undefined);
});

test('production Standard and Full builds fail closed on Apple distribution trust', () => {
  const bundle = parseWorkflow('_release-bundle.yml');
  const reusableBuild = parseWorkflow('_build-reusable.yml');
  const credentialPreflight = parseWorkflow('release-apple-credentials-preflight.yml');
  const canary = parseWorkflow('release-bundle-canary.yml');
  const fullAddon = parseWorkflow('_release-full-addon.yml');
  const fullBuild = parseWorkflow('full-first-install-release.yml');
  const protectedPreflightEnvironment = "${{ inputs.require_macos_gatekeeper && 'release-stable' || null }}";
  const protectedMacosBuildEnvironment = "${{ inputs.require_macos_gatekeeper && startsWith(matrix.platform, 'macos') && 'release-stable' || null }}";
  const signingPreflight = reusableBuild.jobs['macos-signing-preflight'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Import Developer ID identity and authenticate notarization',
  );
  const signingPreflightCheckout = reusableBuild.jobs['macos-signing-preflight'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Checkout exact credential preflight source',
  );
  const signingPreflightUpload = reusableBuild.jobs['macos-signing-preflight'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Upload sanitized Apple credential preflight receipt',
  );
  const setupSigning = reusableBuild.jobs.build.steps.find(
    (step: Record<string, unknown>) => step.name === 'Setup macOS code signing (macOS only)',
  );
  const macosBuild = reusableBuild.jobs.build.steps.find(
    (step: Record<string, unknown>) => step.name === 'Build with electron-builder (macOS)',
  );
  const standardFinalizer = reusableBuild.jobs.build.steps.find(
    (step: Record<string, unknown>) => step.name === 'Finalize Standard Developer ID signing and notarization',
  );
  const cleanupSigning = reusableBuild.jobs.build.steps.find(
    (step: Record<string, unknown>) => step.name === 'Clean up keychain (macOS only)',
  );

  assert.equal(bundle.jobs['standard-build'].with.require_macos_gatekeeper, true);
  assert.equal(bundle.jobs['standard-build'].secrets, 'inherit');
  assert.deepEqual(bundle.jobs['standard-build'].permissions, {
    contents: 'read',
    actions: 'read',
  });
  assert.equal(reusableBuild.permissions, undefined);
  assert.equal(reusableBuild.jobs['macos-signing-preflight']['runs-on'], 'macos-14');
  assert.equal(reusableBuild.jobs['macos-signing-preflight']['timeout-minutes'], 10);
  assert.equal(reusableBuild.jobs['macos-signing-preflight'].environment, protectedPreflightEnvironment);
  assert.equal(reusableBuild.jobs.build.environment, protectedMacosBuildEnvironment);
  assert.deepEqual(
    Object.entries(reusableBuild.jobs)
      .filter(([, job]: [string, any]) => job.environment !== undefined)
      .map(([jobName]) => jobName),
    ['macos-signing-preflight', 'build'],
  );
  assert.equal(canary.jobs['nested-standard-build'].with.require_macos_gatekeeper, undefined);
  assert.equal(canary.jobs['nested-standard-build'].secrets, undefined);
  assert.deepEqual(canary.jobs['nested-standard-build'].permissions, {
    contents: 'read',
    actions: 'read',
  });
  assert.deepEqual(signingPreflight.env, {
    BUILD_CERTIFICATE_BASE64: '${{ secrets.BUILD_CERTIFICATE_BASE64 }}',
    P12_PASSWORD: '${{ secrets.P12_PASSWORD }}',
    APPLE_ID: '${{ secrets.APPLE_ID }}',
    APPLE_ID_PASSWORD: '${{ secrets.APPLE_ID_PASSWORD }}',
    TEAM_ID: '${{ secrets.TEAM_ID }}',
    IDENTITY: '${{ secrets.IDENTITY }}',
  });
  assert.equal(signingPreflightCheckout.with.ref, '${{ inputs.ref }}');
  assert.match(String(signingPreflight.run), /verify-apple-release-credentials\.ts/);
  assert.equal(
    signingPreflightUpload.with.name,
    'opl-apple-release-credentials-preflight-${{ github.run_id }}',
  );
  assert.deepEqual(Object.keys(credentialPreflight.on), ['workflow_dispatch']);
  assert.deepEqual(credentialPreflight.permissions, { contents: 'read', actions: 'read' });
  assert.equal(credentialPreflight.jobs.validate['runs-on'], 'macos-14');
  assert.equal(credentialPreflight.jobs.validate.environment, 'release-stable');
  assert.equal(credentialPreflight.jobs.validate['timeout-minutes'], 15);
  assert.equal(credentialPreflight.concurrency['cancel-in-progress'], false);
  assert.equal(
    credentialPreflight.jobs.validate.steps.some(
      (step: Record<string, unknown>) => String(step.run ?? '').includes('verify-apple-release-credentials.ts'),
    ),
    true,
  );
  assert.equal(
    credentialPreflight.jobs.validate.steps.some(
      (step: Record<string, unknown>) => String(step.run ?? '').includes('stable-release-admission-manifest.ts create'),
    ),
    false,
  );
  assert.equal(
    credentialPreflight.jobs.validate.steps.some(
      (step: Record<string, any>) => step.with?.name === 'opl-stable-admission-${{ github.run_id }}',
    ),
    false,
  );
  const stableWorkflow = parseWorkflow('release-stable.yml');
  assert.equal(stableWorkflow.jobs['protected-admission'].environment, 'release-stable');
  assert.equal(stableWorkflow.jobs['protected-admission'].steps.some(
    (step: Record<string, unknown>) => String(step.run ?? '').includes('stable-release-admission-manifest.ts create'),
  ), true);
  assert.equal(setupSigning.env.BUILD_CERTIFICATE_BASE64, '${{ secrets.BUILD_CERTIFICATE_BASE64 }}');
  assert.equal(setupSigning.env.P12_PASSWORD, '${{ secrets.P12_PASSWORD }}');
  assert.match(String(setupSigning.run), /security set-keychain-settings -lut 21600 build\.keychain/);
  assert.match(String(setupSigning.run), /security default-keychain -d user -s build\.keychain/);
  assert.match(String(setupSigning.run), /security list-keychains -d user -s build\.keychain/);
  assert.equal(macosBuild.env.appleId, '${{ secrets.APPLE_ID }}');
  assert.equal(macosBuild.env.appleIdPassword, '${{ secrets.APPLE_ID_PASSWORD }}');
  assert.equal(macosBuild.env.teamId, '${{ secrets.TEAM_ID }}');
  assert.equal(macosBuild.env.identity, '${{ secrets.IDENTITY }}');
  assert.equal(standardFinalizer.env.KEYCHAIN_PASSWORD, "${{ secrets.KEYCHAIN_PASSWORD || 'temp-keychain-password' }}");
  assert.match(String(standardFinalizer.run), /security unlock-keychain -p "\$KEYCHAIN_PASSWORD" build\.keychain/);
  assert.match(String(standardFinalizer.run), /security default-keychain -d user -s build\.keychain/);
  assert.match(String(standardFinalizer.run), /security list-keychains -d user -s build\.keychain/);
  assert.match(
    String(standardFinalizer.run),
    /security find-identity -v -p codesigning build\.keychain \| grep -F "\$OPL_RUNTIME_CODESIGN_IDENTITY" >\/dev\/null/,
  );
  const buildSteps = reusableBuild.jobs.build.steps;
  assert.ok(buildSteps.indexOf(setupSigning) < buildSteps.indexOf(standardFinalizer));
  assert.ok(buildSteps.indexOf(standardFinalizer) < buildSteps.indexOf(cleanupSigning));
  assert.equal(cleanupSigning.if, "startsWith(matrix.platform, 'macos') && always()");
  assert.match(String(cleanupSigning.run), /security delete-keychain build\.keychain/);
  assert.equal(fullAddon.jobs['full-build'].secrets, 'inherit');

  const credentialGate = fullBuild.jobs['full-first-install'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Verify Full signing and notarization credentials',
  );
  assert.match(
    String(credentialGate.run),
    /production_release="\$\{\{ inputs\.operation == 'append_full' && inputs\.upload_full_package_artifact \}\}"/,
  );
  assert.match(String(credentialGate.run), /Production Full assets require Developer ID signing and Apple notarization/);
  assert.match(String(credentialGate.run), /Development-only Full build has no Apple credentials/);
  assert.match(String(credentialGate.run), /exit 1/);

  const finalizer = fullBuild.jobs['full-first-install'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Finalize Full Developer ID signing and notarization',
  );
  assert.equal(finalizer.if, '${{ !inputs.cache_only }}');
  assert.match(String(finalizer.run), /Production Full notarization cannot run without strict Developer ID signing/);
  assert.match(String(finalizer.run), /Skipping notarization for development-only non-distributable Full output/);
  assert.match(String(finalizer.run), /notarize-macos-dmg\.ts/);
  assert.match(String(finalizer.run), /full-apple-notarization-receipt\.json/);

  for (const name of [
    'Upload Full package workflow artifact',
    'Upload Full build artifact cohort manifest',
    'Upload Full DMG-only workflow artifact',
  ]) {
    const upload = fullBuild.jobs['full-first-install'].steps.find(
      (step: Record<string, unknown>) => step.name === name,
    );
    assert.match(String(upload.if), /success\(\)/, `${name} must not upload after notarization or trust failure`);
  }
});

test('real build and qualification calls recalculate and consume the same remaining operation budget', () => {
  const build = parseWorkflow('_build-reusable.yml');
  const buildBudget = build.jobs.build.steps.find(
    (step: Record<string, unknown>) => step.name === 'Recalculate immutable operation budget before release build',
  );
  assert.equal(buildBudget.if, "${{ inputs.operation != '' && startsWith(matrix.platform, 'macos') }}");
  assert.match(String(buildBudget.run), /release-operation-deadline\.ts check/);
  assert.match(String(buildBudget.run), /deadlineMs - Date\.now\(\) - evidenceReserveMs/);
  const macBuild = build.jobs.build.steps.find(
    (step: Record<string, unknown>) => step.name === 'Build with electron-builder (macOS)',
  );
  assert.match(String(macBuild.run), /RELEASE_BUILD_TIMEOUT_MS/);
  assert.match(String(macBuild.run), /process\.kill\(-child\.pid, signal\)/);
  assert.match(String(macBuild.run), /operation_deadline_elapsed/);

  const updater = parseWorkflow('opl-updater-upgrade-vm.yml');
  const updaterBudget = updater.jobs.upgrade.steps.find(
    (step: Record<string, unknown>) => step.name === 'Recalculate immutable operation budget before updater qualification',
  );
  assert.match(String(updaterBudget.run), /release-operation-deadline\.ts check/);
  assert.match(String(updaterBudget.run), /Math\.min\(1_500_000, remainingMs\)/);
  const updaterRun = updater.jobs.upgrade.steps.find(
    (step: Record<string, unknown>) => step.name === 'Run real predecessor-to-candidate updater qualification',
  );
  assert.match(String(updaterRun.run), /steps\.updater_budget\.outputs\.timeout_ms/);
  assert.doesNotMatch(String(updaterRun.run), /--timeout-ms 1500000/);

  const vm = parseWorkflow('opl-first-run-vm.yml');
  const vmBudget = vm.jobs['clean-vm-first-run'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Recalculate immutable operation budget before expensive smoke',
  );
  assert.equal(vmBudget.if, "${{ inputs.operation != '' }}");
  assert.match(String(vmBudget.run), /release-operation-deadline\.ts check/);
  const vmRun = vm.jobs['clean-vm-first-run'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Run clean VM first launch smoke',
  );
  assert.match(String(vmRun.run), /steps\.operation_smoke_budget\.outputs\.run_timeout_ms/);
});

test('first-run VM installs frozen Shell runtime dependencies before importing the harness', () => {
  const source = readWorkflow('opl-first-run-vm.yml');
  const workflow = parseWorkflow('opl-first-run-vm.yml');
  const steps = workflow.jobs['clean-vm-first-run'].steps as Array<Record<string, any>>;
  const stepIndex = (name: string) => steps.findIndex((step) => step.name === name);
  const step = (name: string) => {
    const found = steps[stepIndex(name)];
    assert.ok(found, `clean-vm-first-run is missing ${name}`);
    return found;
  };

  const checkout = step('Checkout active shell');
  assert.deepEqual(
    String(checkout.with['sparse-checkout']).trim().split('\n'),
    [
      '/scripts/',
      '/package.json',
      '/bun.lock',
      '/patches/',
      '/packages/*/package.json',
      '/packages/desktop/src/common/config/oplProductProfile/oplProductProfile.generated.json',
    ],
  );
  assert.equal(checkout.with['sparse-checkout-cone-mode'], false);
  assert.equal(stepIndex('Materialize active shell dependency metadata'), -1);

  const setupBun = step('Setup bun');
  assert.equal(setupBun.uses, 'oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6');
  assert.equal(setupBun.with['bun-version'], '1.3.14');

  const install = step('Install active shell harness dependencies');
  assert.equal(install['working-directory'], 'shells/aionui');
  assert.equal(String(install.run).trim(), 'bun install --frozen-lockfile --ignore-scripts');

  const validate = step('Validate smoke scripts');
  assert.match(String(validate.run), /await import\('\.\/shells\/aionui\/scripts\/opl-first-run-tart-smoke\.mjs'\)/);
  assert.ok(stepIndex('Checkout active shell') < stepIndex('Setup bun'));
  assert.ok(stepIndex('Setup bun') < stepIndex('Install active shell harness dependencies'));
  assert.ok(stepIndex('Install active shell harness dependencies') < stepIndex('Validate smoke scripts'));
  assert.ok(stepIndex('Validate smoke scripts') < stepIndex('Run clean VM first launch smoke'));
  assert.doesNotMatch(source, /'\/packages\/\*\/package\.json'/);
  assert.doesNotMatch(source, /git -C shells\/aionui sparse-checkout set/);
  assert.doesNotMatch(source, /\b(?:npm install|npm i|bun add)\s+smol-toml(?:@|\s|$)/);
});

test('first-run VM validates both production Runtime refresh routes before writing qualification evidence', () => {
  const workflow = parseWorkflow('opl-first-run-vm.yml');
  const steps = workflow.jobs['clean-vm-first-run'].steps as Array<Record<string, any>>;
  const stepIndex = (name: string) => steps.findIndex((step) => step.name === name);
  const validationIndex = stepIndex('Validate production Settings Runtime refresh evidence');
  const validation = steps[validationIndex];

  assert.ok(validation, 'clean-vm-first-run is missing production Settings Runtime evidence validation');
  assert.equal(validation.id, 'settings_runtime_evidence');
  assert.equal(
    validation.if,
    "${{ steps.vm_smoke.outcome == 'success' && needs.validate-vm-inputs.outputs.diagnostic_scope != 'bootstrap_only' }}",
  );
  assert.match(String(validation.run), /validate-settings-smoke-runtime-evidence\.ts/);
  assert.match(String(validation.run), /settings-smoke-summary\.json/);
  assert.match(String(validation.run), /settings-runtime-refresh-verification\.json/);
  assert.ok(stepIndex('Run clean VM first launch smoke') < validationIndex);
  const receiptIndex = stepIndex('Write exact-artifact qualification receipt');
  assert.ok(validationIndex < receiptIndex);
  assert.match(String(steps[receiptIndex].if), /steps\.settings_runtime_evidence\.outcome == 'success'/);
});

test('active release workflows fail closed on duplicate critical evidence instead of selecting the first match', () => {
  const activeWorkflows = [
    '_build-reusable.yml',
    '_release-bundle.yml',
    '_release-full-addon.yml',
    '_release-homebrew-full-publish.yml',
    '_release-standard-publish.yml',
    'full-first-install-release.yml',
    'opl-first-run-vm.yml',
  ];

  for (const workflowName of activeWorkflows) {
    const source = readWorkflow(workflowName);
    assert.doesNotMatch(source, /find[^\n]*-print -quit/, `${workflowName} still selects the first critical evidence match`);
    assert.doesNotMatch(
      source,
      /find[^\n]*\|[^\n]*head\s+-n?\s*1/,
      `${workflowName} still selects the first sorted release artifact match`,
    );
    if (workflowName !== '_release-bundle.yml') {
      assert.match(source, /LC_ALL=C sort/, `${workflowName} must deterministically order critical evidence matches`);
    }
  }

  assert.doesNotMatch(readWorkflow('_release-bundle.yml'), /artifact qualification receipt/);
  assert.match(readWorkflow('_release-full-addon.yml'), /must contain at most one Full build receipt/);
  assert.match(readWorkflow('_release-standard-publish.yml'), /requires exactly one publication receipt/);
  assert.match(readWorkflow('_release-homebrew-full-publish.yml'), /requires exactly one Standard and one Full build receipt/);
  assert.match(readWorkflow('opl-first-run-vm.yml'), /must appear at most once/);
});

test('release helpers reject duplicate mounted Apps, promotion receipts, and packaged runtime executables', () => {
  const installer = fs.readFileSync(path.join(process.cwd(), 'install.sh'), 'utf8');
  const promotion = fs.readFileSync(
    path.join(process.cwd(), 'scripts', 'framework-release-promotion-step.sh'),
    'utf8',
  );
  const runtimeLayers = fs.readFileSync(
    path.join(process.cwd(), 'scripts', 'build-full-first-install-package', 'runtime-layers.ts'),
    'utf8',
  );
  const runtimeWrappers = fs.readFileSync(
    path.join(process.cwd(), 'scripts', 'full-first-install-runtime-wrappers.ts'),
    'utf8',
  );

  for (const source of [installer, promotion, runtimeLayers, runtimeWrappers]) {
    assert.doesNotMatch(source, /find[^\n]*(?:-print -quit|\|[^\n]*head\s+-n?\s*1)/);
    assert.match(source, /LC_ALL=C sort/);
  }
  assert.match(installer, /Mounted DMG must contain exactly one App bundle/);
  assert.match(promotion, /must contain exactly one JSON receipt/);
  assert.match(runtimeLayers, /multiple executable temporal binaries/);
  assert.match(runtimeLayers, /multiple executable codex binaries/);
  assert.match(runtimeWrappers, /multiple Python bin roots/);
});

test('first-run VM uploads critical diagnostics only on a real failure path', () => {
  const workflow = parseWorkflow('opl-first-run-vm.yml');
  const steps = workflow.jobs['clean-vm-first-run'].steps as Array<Record<string, any>>;
  const step = (name: string) => {
    const found = steps.find((candidate) => candidate.name === name);
    assert.ok(found, `clean-vm-first-run is missing ${name}`);
    return found;
  };

  assert.equal(step('Write first-run VM critical diagnostics').if, '${{ always() }}');
  assert.equal(step('Upload first-run VM critical diagnostics').if, '${{ failure() }}');
  assert.equal(step('Upload first-run VM artifacts').if, '${{ always() }}');
});

test('first-run VM prefetches frozen Codex install assets from a physical script', () => {
  const workflow = parseWorkflow('opl-first-run-vm.yml');
  const steps = workflow.jobs['clean-vm-first-run'].steps as Array<Record<string, any>>;
  const prefetch = steps.find(
    (step) => step.name === 'Prefetch Codex package install assets',
  );
  assert.ok(prefetch);

  const run = String(prefetch.run);
  assert.equal(run, 'node scripts/prefetch-codex-package-install-assets.mjs');
  assert.doesNotMatch(run, /node\s+<<|<<['"]?NODE/);

  const scriptPath = path.join(
    process.cwd(),
    'scripts',
    'prefetch-codex-package-install-assets.mjs',
  );
  const script = fs.readFileSync(scriptPath, 'utf8');
  const syntax = spawnSync(process.execPath, ['--check', scriptPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);

  for (const token of [
    'qualification_runtime?.codex_cli',
    'frozen.npm_integrity',
    'frozen.tarball_url',
    'frozen.tarball_sha256',
    'frozen.platform.npm_integrity',
    'frozen.platform.tarball_url',
    'frozen.platform.tarball_sha256',
    'timeout: options.timeout || 120000',
    'timeout: 240000',
    'timeout: 960000',
    'timeout: 300000',
    'CODEX_CACHE_RESTORE_HIT',
    'CODEX_CACHE_RESTORE_PRIMARY_KEY',
    'CODEX_CACHE_RESTORE_MATCHED_KEY',
    'cache_save_required',
  ]) {
    assert.ok(script.includes(token), `prefetch script is missing preserved behavior: ${token}`);
  }
});

test('first-run VM records wrapper diagnostics from one offline-testable physical script', () => {
  const wrapper = workflowStep(
    'opl-first-run-vm.yml',
    'clean-vm-first-run',
    'Record first-run VM wrapper diagnostics',
  );
  const run = String(wrapper.run);
  assert.match(
    run,
    /node scripts\/record-first-run-vm-wrapper-diagnostics\.mjs 2>&1 \| tee "\$PREFLIGHT_LOG"/,
  );
  assert.doesNotMatch(run, /node\s+<<|<<['"]?NODE/);

  const scriptPath = path.join(
    process.cwd(),
    'scripts',
    'record-first-run-vm-wrapper-diagnostics.mjs',
  );
  const script = fs.readFileSync(scriptPath, 'utf8');
  const syntax = spawnSync(process.execPath, ['--check', scriptPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  for (const token of [
    'schema_version: 1',
    "purpose: 'first_run_vm_app_wrapper_diagnostics'",
    'timeout: 120000',
    "diagnosticScope === 'bootstrap_only'",
    "truth_boundary: 'install_asset_cache_preseed_not_app_readiness_truth_or_owner_receipt'",
    "console.error('Required first-run VM wrapper diagnostics failed:')",
  ]) {
    assert.ok(script.includes(token), `wrapper diagnostics script is missing preserved behavior: ${token}`);
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-wrapper-diagnostics-'));
  try {
    const fakeBin = path.join(root, 'bin');
    const artifactRoot = path.join(root, 'artifacts', 'opl-first-run-vm');
    fs.mkdirSync(fakeBin, { recursive: true });
    fs.mkdirSync(artifactRoot, { recursive: true });
    fs.writeFileSync(path.join(fakeBin, 'npm'), `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = "--version" ]; then
  printf '10.9.2\\n'
elif [ "\${1:-}" = "config" ] && [ "\${2:-}" = "get" ] && [ "\${3:-}" = "registry" ]; then
  printf 'https://registry.example.invalid/\\n'
else
  exit 98
fi
`);
    fs.writeFileSync(path.join(fakeBin, 'curl'), `#!/usr/bin/env bash
set -euo pipefail
printf 'curl 8.7.1 fixture\\n'
`);
    fs.chmodSync(path.join(fakeBin, 'npm'), 0o755);
    fs.chmodSync(path.join(fakeBin, 'curl'), 0o755);

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH || ''}`,
        DIAGNOSTIC_SCOPE: 'bootstrap_only',
        PACKAGE_PROFILE: 'standard',
        INSTALL_MODE: 'dmg',
        RUNTIME_PROFILE: 'standard',
        SOURCE_VM: 'fixture-vm',
        GUEST_USER: 'runner',
        SSH_KEY_CONFIGURED: 'true',
        RUNNER_LABELS: '["self-hosted","macOS","opl-gui-vm"]',
        NO_GRAPHICS: 'false',
        KEEP_VM: 'false',
        GUIDE_SCREENSHOTS: 'false',
        RUN_TIMEOUT_MS: '900000',
        SMOKE_TIMEOUT_MS: '600000',
        CODEX_INSTALL_PHASE_TIMEOUT_MS: '480000',
        CODEX_READINESS_PHASE_TIMEOUT_MS: '180000',
        GITHUB_RUN_ID: '424242',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_REPOSITORY: 'gaofeng21cn/one-person-lab-app',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: 'a'.repeat(40),
      },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const diagnostics = JSON.parse(
      fs.readFileSync(path.join(artifactRoot, 'app-wrapper-diagnostics.json'), 'utf8'),
    );
    assert.equal(diagnostics.schema_version, 1);
    assert.equal(diagnostics.purpose, 'first_run_vm_app_wrapper_diagnostics');
    assert.equal(diagnostics.release_inputs.diagnostic_scope, 'bootstrap_only');
    assert.equal(diagnostics.host.node.exit_code, 0);
    assert.equal(diagnostics.host.npm.exit_code, 0);
    assert.equal(diagnostics.host.curl.exit_code, 0);
    assert.equal(diagnostics.host.npm_registry.stdout, 'https://registry.example.invalid/');
    assert.equal(diagnostics.host.codex_package_preflight.skipped, true);
    assert.equal(diagnostics.host.codex_package_metadata.skipped, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex install asset prefetch preserves frozen identities and content-addressed outputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-prefetch-'));
  try {
    const fakeBin = path.join(root, 'bin');
    const artifactRoot = path.join(root, 'artifacts', 'opl-first-run-vm');
    const cohortRoot = path.join(root, 'artifacts', 'release-cohort');
    fs.mkdirSync(fakeBin, { recursive: true });
    fs.mkdirSync(path.join(artifactRoot, 'codex-npm-cache'), { recursive: true });
    fs.mkdirSync(path.join(artifactRoot, 'codex-package-tarballs'), { recursive: true });
    fs.mkdirSync(cohortRoot, { recursive: true });

    const rootTarball = 'frozen root Codex package\n';
    const platformTarball = 'frozen macOS Codex package\n';
    const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
    const frozen = {
      version: '1.2.3',
      npm_integrity: 'sha512-root-fixture',
      tarball_url: 'https://registry.example/openai-codex.tgz',
      tarball_sha256: digest(rootTarball),
      platform: {
        version: '1.2.4',
        npm_integrity: 'sha512-platform-fixture',
        tarball_url: 'https://registry.example/openai-codex-darwin-arm64.tgz',
        tarball_sha256: digest(platformTarball),
      },
    };
    fs.writeFileSync(
      path.join(cohortRoot, 'opl-build-cohort.json'),
      `${JSON.stringify({
        qualification_runtime: { codex_cli: frozen },
        digests: { qualification_input_manifest_sha256: `sha256:${'a'.repeat(64)}` },
      })}\n`,
    );

    const fakeNpm = path.join(fakeBin, 'npm');
    fs.writeFileSync(fakeNpm, `#!/usr/bin/env bash
set -euo pipefail
case "\${1:-}" in
  config)
    printf '%s\\n' 'https://registry.example/'
    ;;
  view)
    if [ "\${2:-}" = '@openai/codex@1.2.3' ]; then
      printf '%s\\n' '{"version":"1.2.3","dist.tarball":"https://registry.example/openai-codex.tgz","dist.integrity":"sha512-root-fixture"}'
    else
      printf '%s\\n' '{"name":"@openai/codex","version":"1.2.4","dist.tarball":"https://registry.example/openai-codex-darwin-arm64.tgz","dist.integrity":"sha512-platform-fixture"}'
    fi
    ;;
  cache)
    ;;
  *)
    exit 2
    ;;
esac
`);
    fs.chmodSync(fakeNpm, 0o755);

    const fakeCurl = path.join(fakeBin, 'curl');
    fs.writeFileSync(fakeCurl, `#!/usr/bin/env bash
set -euo pipefail
output=''
previous=''
for argument in "$@"; do
  if [ "$previous" = '-o' ]; then output="$argument"; fi
  previous="$argument"
done
url="\${!#}"
case "$url" in
  https://registry.example/@openai%2fcodex)
    printf '%s\\n' '{}' > "$output"
    ;;
  https://registry.example/openai-codex.tgz)
    printf '%b' '${rootTarball.replace('\n', '\\n')}' > "$output"
    ;;
  https://registry.example/openai-codex-darwin-arm64.tgz)
    printf '%b' '${platformTarball.replace('\n', '\\n')}' > "$output"
    ;;
  *)
    exit 2
    ;;
esac
printf '200'
`);
    fs.chmodSync(fakeCurl, 0o755);

    const output = path.join(root, 'github-output.txt');
    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), 'scripts', 'prefetch-codex-package-install-assets.mjs')],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH}`,
          GITHUB_OUTPUT: output,
          CACHE_KEY_PREFIX: 'fixture-cache',
          CODEX_CACHE_RESTORE_HIT: 'false',
          CODEX_CACHE_RESTORE_PRIMARY_KEY: 'fixture-primary',
          CODEX_CACHE_RESTORE_MATCHED_KEY: '',
        },
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const preflight = JSON.parse(
      fs.readFileSync(path.join(artifactRoot, 'codex-package-preflight.json'), 'utf8'),
    );
    assert.equal(preflight.status, 'ok');
    assert.deepEqual(preflight.package.frozen_identity, frozen);
    assert.equal(preflight.tarball.sha256, frozen.tarball_sha256);
    assert.equal(preflight.platform_tarball.sha256, frozen.platform.tarball_sha256);
    assert.equal(preflight.cache.write_scope, 'refs/heads/main_only');
    assert.equal(preflight.cache.save_required, true);
    assert.match(
      fs.readFileSync(output, 'utf8'),
      new RegExp(`cache_key=fixture-cache-1\\.2\\.3-${frozen.tarball_sha256}-${frozen.platform.tarball_sha256}`),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('deadline failures never authorize Framework reconcile without persisted unknown state', () => {
  const standard = readWorkflow('_release-standard-publish.yml');
  const full = readWorkflow('_release-full-addon.yml');
  assert.match(standard, /bounded_read_only_inspect_only_no_framework_reconcile/);
  assert.match(standard, /framework_reconcile_authorized:false/);
  assert.match(full, /framework_reconcile_authorized=false/);
  assert.match(full, /--argjson framework_reconcile_authorized "\$framework_reconcile_authorized"/);
  assert.match(standard, /push_count:0/);
  assert.match(standard, /bounded_read_only_latest_readback_only_no_second_patch_no_framework_reconcile/);
  assert.match(standard, /--latest-admission standard-latest-admission\.json/);
});

test('append_full delegates Full Homebrew without mutating Standard publication surfaces', () => {
  const full = parseWorkflow('_release-full-addon.yml');
  const source = readWorkflow('_release-full-addon.yml');
  for (const retiredJob of ['publish-homebrew-full', 'homebrew-full-vm', 'homebrew-full-readback']) {
    assert.equal(full.jobs[retiredJob], undefined, retiredJob);
  }
  assert.doesNotMatch(
    source,
    /publish-homebrew-full|update-homebrew-tap|OPL_HOMEBREW_TAP_TOKEN|tap-source|Casks\/one-person-lab\.rb|git\b[^\n]*\bpush\b/,
  );
  assert.match(source, /opl_homebrew_full_follower_handoff\.v1/);
  assert.match(source, /completed_stage:"full_qualified"/);
  assert.match(source, /qualification_receipt_sha256/);
  assert.match(source, /operation_control/);
  assert.match(source, /operation_id/);
  assert.match(source, /operation_started_at/);
  assert.match(source, /operation_deadline_at/);
  assert.match(source, /checkpoint_transport_executor/);
  assert.match(source, /transport_run_id/);
  assert.match(source, /homebrew:\*\)/);
  assert.match(source, /Casks\/one-person-lab-full\.rb/);
  assert.match(source, /publication-scope "\$publication_scope"/);
  assert.match(source, /test "\$\(jq -r \.operation_id <<<"\$marker"\)" = "\$operation_id"/);
  assert.match(source, /git -C full-resume-tap fetch --no-tags --depth=1 origin "\$remote_commit"/);
  assert.match(source, /git -C full-resume-tap show 'FETCH_HEAD:Casks\/one-person-lab-full\.rb'/);
  assert.doesNotMatch(source, /contents\/Casks\/one-person-lab-full\.rb\?ref=main/);
  assert.doesNotMatch(source, /github-activate-latest|opl-updater-upgrade-vm\.yml|latest-arm64-mac\.yml/);
  for (const immutableSurface of [
    'standard_assets_modified:false',
    'prepared_notes_modified:false',
    'standard_updater_metadata_modified:false',
    'homebrew_modified:false',
    'latest_modified:false',
  ]) {
    assert.match(source, new RegExp(immutableSurface));
  }
});

test('Standard Homebrew uses inspect-before-write CAS and one bounded non-force push', () => {
  const workflow = parseWorkflow('_release-standard-publish.yml');
  const source = String(
    workflow.jobs['publish-homebrew-standard'].steps.find(
      (step: Record<string, unknown>) => step.name === 'Publish one digest-bound Standard cask commit',
    )?.run ?? '',
  );
  assert.ok(source.indexOf('preplan_remote_commit="$(inspect_remote_head)"') < source.indexOf('--remote-write-mode inspect_only'));
  assert.ok(source.indexOf('--remote-write-mode inspect_only') < source.indexOf('--remote-write-mode direct_commit'));
  assert.match(source, /case "\$cas_decision" in[\s\S]*idempotent\)[\s\S]*write_homebrew_success idempotent "\$base_commit" 0[\s\S]*exit 0/);
  assert.ok(source.indexOf('write_homebrew_success idempotent "$base_commit" 0') < source.indexOf('git -C tap-source commit '));
  assert.ok(source.indexOf('write_homebrew_success idempotent "$base_commit" 0') < source.indexOf('git -C tap-source push --no-force'));
  assert.match(source, /version_conflict\)[\s\S]*new_release_revision_required[\s\S]*exit 1/);
  assert.match(source, /--expected-current-cask-sha256 "\$current_cask_sha"/);
  assert.equal((source.match(/git -C tap-source commit /g) ?? []).length, 1);
  assert.equal((source.match(/git -C tap-source push --no-force/g) ?? []).length, 1);
  assert.match(source, /push_count=\$\(\(push_count \+ 1\)\)[\s\S]*test "\$push_count" -eq 1/);
  assert.doesNotMatch(source, /for attempt in 1 2 3|three read-only reconciliations/);
  assert.match(source, /write_framework_homebrew_receipt unknown/);
  assert.match(source, /opl release publish[\s\S]*homebrew-unknown-persisted\.json/);
  assert.match(source, /opl release checkpoint export[\s\S]*homebrew-unknown-checkpoint/);
  assert.match(source, /opl release status[\s\S]*active_unknown_markers/);
  assert.match(source, /write_framework_homebrew_receipt complete[\s\S]*opl release reconcile/);
  assert.match(source, /--prior-attempt-id/);
  assert.match(source, /--publication-scope external_target/);
  assert.match(source, /push_exit_status/);
  assert.match(source, /release-failure-evidence\/stdout\.txt/);
  assert.match(source, /release-failure-evidence\/stderr\.txt/);
});

test('new Bundle callers do not activate legacy broker or Stable-session admission', () => {
  for (const name of ['_release-bundle.yml', '_release-standard-publish.yml', '_release-full-addon.yml']) {
    const workflow = parseWorkflow(name);
    for (const job of Object.values(workflow.jobs) as Array<Record<string, any>>) {
      if (!job.uses || !String(job.uses).startsWith('./.github/workflows/')) continue;
      assert.equal(job.with?.stable_session_id, undefined, `${name} must not pass legacy stable_session_id`);
      assert.equal(job.with?.release_mutation, undefined, `${name} must not pass legacy release_mutation`);
      assert.equal(job.with?.release_session_lease_base64, undefined, `${name} must not pass a broker lease`);
    }
  }
  for (const name of ['_build-reusable.yml', 'full-first-install-release.yml', 'opl-first-run-vm.yml']) {
    const workflow = parseWorkflow(name);
    const inputs = workflow.on.workflow_call.inputs;
    for (const legacyInput of [
      'stable_session_id',
      'release_session_lease_base64',
      'release_attempt_id',
      'pre_api_admission_receipt_base64',
      'release_mutation',
      'broker_admission_validation_sha256',
    ]) {
      assert.equal(inputs[legacyInput], undefined, `${name} must not declare legacy ${legacyInput}`);
    }
    assert.doesNotMatch(readWorkflow(name), /verify-release-(?:broker-acceptance|session-lease)\.ts/);
  }
});

test('the App adapter freezes the App Standard compatibility union without Package authority', () => {
  const fixture = adapterFixture();
  try {
    const output = path.join(fixture.root, 'freeze-request.json');
    const first = runFreezeRequest(fixture, output);
    assert.equal(first.status, 0, first.stderr);
    const request = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(request.surface_kind, 'opl_release_bundle_freeze_request.v1');
    assert.equal(request.schema_ref, 'contracts/opl-framework/release-bundle-freeze-request.schema.json');
    assert.equal(request.identity_mode, 'app_standard_compatibility');
    assert.deepEqual(request.package_compatibility, {
      abi: 'opl_packages.v1',
      version_range: '>=0.1.0 <1.0.0',
    });
    assert.equal(request.framework_release_set, undefined);
    assert.equal(request.packages, undefined);
    assert.equal(request.source_cutoff, undefined);
    assert.equal(request.frozen_build_inputs, undefined);
    assert.deepEqual(Object.keys(request.tracks), ['standard', 'full']);
    assert.equal(request.tracks.standard.required_for_latest, true);
    assert.deepEqual(request.tracks.standard.required_asset_names, [
      'One-Person-Lab-26.7.20-mac-arm64.dmg',
      'One-Person-Lab-26.7.20-mac-arm64.zip',
      'One-Person-Lab-26.7.20-mac-arm64.zip.blockmap',
      'latest-arm64-mac.yml',
      'opl-app-component-manifest.json',
      'opl-app-installer.sh',
      'standard-gatekeeper-launch-policy.json',
      'standard-apple-notarization-receipt.json',
    ]);
    assert.equal(request.tracks.full.required_for_latest, false);
    assert.equal(request.tracks.webui, undefined);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('the App adapter rejects notes without online AI provenance before build', () => {
  const fixture = adapterFixture();
  try {
    fs.writeFileSync(fixture.notesPath, '# One Person Lab v26.7.20\n\nTemplate notes.\n');
    const result = runFreezeRequest(fixture, path.join(fixture.root, 'untrusted-notes.json'));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not bound to the online AI writer/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('the App adapter rejects prepared notes that bind a future Full Package payload', () => {
  const fixture = adapterFixture();
  try {
    fs.writeFileSync(fixture.evidencePath, `${JSON.stringify({
      schema: 'opl_app_release_notes_evidence.v1',
      payload: { include_full_package: true },
    })}\n`);
    const result = runFreezeRequest(fixture, path.join(fixture.root, 'mismatched-notes-intent.json'));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not bind a future Full Package payload/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Standard checkpoint is Desktop-only and WebUI follows without blocking Desktop publication', () => {
  const workflow = parseWorkflow('_release-bundle.yml');
  const follower = parseWorkflow('release-webui-follower.yml');
  const source = readWorkflow('_release-bundle.yml');
  const standardSource = readWorkflow('_release-standard-publish.yml');
  const followerSource = readWorkflow('release-webui-follower.yml');
  const webuiSource = readWorkflow('_release-webui-carrier.yml');
  const adapterSource = readAdapter();
  assert.deepEqual(workflow.jobs['standard-build'].needs, ['freeze']);
  assert.deepEqual(
    workflow.jobs['checkpoint-standard'].needs,
    ['freeze', 'seal-standard-identity'],
  );
  assert.deepEqual(workflow.jobs['publish-standard'].needs, ['freeze', 'checkpoint-standard']);
  assert.deepEqual(workflow.jobs['prepare-native-webui'].needs, ['freeze']);
  assert.deepEqual(
    workflow.jobs['publish-native-webui'].needs,
    ['freeze', 'checkpoint-standard', 'prepare-native-webui', 'publish-standard'],
  );
  assert.equal(workflow.jobs['webui-carrier'], undefined);
  assert.equal(workflow.jobs['promote-webui-stable'], undefined);
  assert.deepEqual(Object.keys(follower.on), ['workflow_run']);
  assert.deepEqual(follower.on.workflow_run.workflows, ['OPL Stable Release Bundle']);
  assert.deepEqual(follower.on.workflow_run.types, ['completed']);
  assert.equal(follower.on.workflow_dispatch, undefined);
  assert.equal(follower.jobs['webui-carrier'].needs[0], 'resolve-handoff');
  assert.deepEqual(
    follower.jobs['promote-webui-stable'].needs,
    ['resolve-handoff', 'webui-carrier'],
  );
  assert.equal(
    follower.jobs['webui-carrier'].with.source_artifact_run_id,
    '${{ needs.resolve-handoff.outputs.source_artifact_run_id }}',
  );
  assert.equal(
    follower.jobs['webui-carrier'].with.standard_checkpoint_artifact_name,
    '${{ needs.resolve-handoff.outputs.standard_checkpoint_artifact_name }}',
  );
  assert.doesNotMatch(followerSource, /continue-on-error/);
  assert.match(followerSource, /executor_head_sha:\s*\$head/);
  assert.match(followerSource, /\.release\.cohort\.app_sha \| test/);
  assert.doesNotMatch(
    followerSource,
    /\.release\.cohort\.app_sha == \$head/,
    'resume_standard must keep the original Bundle App SHA independent from the current executor SHA',
  );
  assert.match(standardSource, /webui-follower-handoff\.json/);
  assert.match(standardSource, /test "\$framework_terminal_status" = complete/);
  assert.match(standardSource, /framework_terminal_status:\s*\$framework_terminal_status/);
  for (const id of [
    'app_source',
    'base_image',
    'codex_cli',
    'dockerfile',
    'framework_seed',
    'qualification_harness',
    'shell_webui_source',
  ]) {
    assert.match(adapterSource, new RegExp(id));
  }
  assert.doesNotMatch(adapterSource, /first_party_packages|framework_release_set:|release-set-manifest/);
  assert.equal((source.match(/oras manifest fetch --descriptor "\$\{carrier\}:latest-stable"/g) ?? []).length, 0);
  assert.doesNotMatch(source, /oras login|--password-stdin/);
  assert.doesNotMatch(source, /single_read_at_freeze_admission|--source-cutoff-observed-at/);
  assert.match(webuiSource, /single_read_at_freeze_admission|--source-cutoff-observed-at/);
  assert.doesNotMatch(source, /--frozen-base-release-set-generation|--release-set-manifest/);
  assert.match(source, /--package-compatibility-abi/);
  assert.match(source, /--package-compatibility-version-range/);
  assert.doesNotMatch(source, /--base-image-index|--frozen-codex-tarball/);
  assert.match(webuiSource, /--base-image-index/);
  assert.match(webuiSource, /--frozen-codex-tarball/);
  assert.doesNotMatch(source, /--track webui|webui-qualification-receipt|opl-webui-carrier\.json/);
  assert.match(source, /jq -e '\.tracks\.webui' bundle\/release-bundle\.json/);
  assert.match(source, /expected_checkpoint_stage=standard_built/);
  assert.match(source, /expected_checkpoint_stage=stable_built/);
  assert.doesNotMatch(
    source.slice(source.indexOf('Freeze canonical Framework Bundle')),
    /npm view[^\n]+latest|git ls-remote[^\n]+(?:shells\/aionui|framework-source)[^\n]+after-freeze/,
  );
});

test('Standard checkpoint stage follows the immutable Bundle track set', () => {
  for (const fixture of [
    {
      label: 'Desktop-only Bundle',
      tracks: { standard: {}, full: {} },
      stage: 'standard_built',
    },
    {
      label: 'unified WebUI Bundle',
      tracks: { standard: {}, webui: {}, full: {} },
      stage: 'stable_built',
    },
  ]) {
    const result = runStandardCheckpointStageGuard(fixture.tracks, fixture.stage);
    assert.equal(result.status, 0, `${fixture.label}: ${result.stderr || result.stdout}`);
  }

  for (const fixture of [
    {
      label: 'Desktop-only Bundle rejects unified stage',
      tracks: { standard: {}, full: {} },
      stage: 'stable_built',
      expected: 'standard_built',
    },
    {
      label: 'unified WebUI Bundle rejects Desktop-only stage',
      tracks: { standard: {}, webui: {}, full: {} },
      stage: 'standard_built',
      expected: 'stable_built',
    },
  ]) {
    const result = runStandardCheckpointStageGuard(fixture.tracks, fixture.stage);
    assert.notEqual(result.status, 0, fixture.label);
    assert.match(result.stdout, new RegExp(`expected ${fixture.expected}`));
    assert.match(result.stdout, new RegExp(`got ${fixture.stage}`));
  }
});

test('Standard moving pointers require exact Desktop readback and hosted admission without VM qualification state', () => {
  const workflow = parseWorkflow('_release-standard-publish.yml');
  const source = readWorkflow('_release-standard-publish.yml');
  assert.ok(workflow.jobs['publish-homebrew-standard'].needs.includes('remote-digest-verify'));
  assert.ok(workflow.jobs['activate-latest'].needs.includes('remote-digest-verify'));
  assert.doesNotMatch(source, /docker buildx imagetools inspect "\$(?:latest_)?webui_ref"/);
  assert.doesNotMatch(source, /--track webui --outcome complete/);
  assert.doesNotMatch(source, /stable_promotion_barrier\.satisfied == true/);
  assert.doesNotMatch(source, /latest_eligible == true/);
  assert.match(source, /Unified hosted publication requires a checkpoint at or after stable_built/);
  assert.match(source, /Hosted Standard publication requires a checkpoint at or after standard_built/);
  assert.doesNotMatch(source, /requires a checkpoint at or after standard_qualified/);
  assert.equal(
    (source.match(/if jq -e '\.tracks\.webui' "\$bundle"/g) ?? []).length,
    1,
    'only the historical checkpoint compatibility reader may inspect a legacy WebUI track',
  );
  assert.equal((source.match(/\.release_bundle_status\.tracks\.standard\.reconcile_required == false/g) ?? []).length, 2);
  assert.doesNotMatch(source, /opl-webui-carrier\.json/);
  assert.doesNotMatch(source, /oras tag[^\n]+stable|docker buildx imagetools create[^\n]+stable/);
});
