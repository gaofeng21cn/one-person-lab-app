import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { reusableFullFinalizerInput, readOriginalStandardCheckpoint } from '../../scripts/stable-release-dispatch/artifact-retrieval.ts';
import { reconcileAppendFullTarget } from '../../scripts/stable-release-dispatch/owner-run-reconciliation.ts';
import { resolveAppendFullCohort, buildAppendFullPlan } from '../../scripts/stable-release-dispatch/plan-source-guards.ts';
import { downloadArtifact } from '../../scripts/download-github-artifact.mjs';
import {
  ownedFullRecoveryBaseDir,
  pruneRetainedFullRecoveryRuns,
  verifyAcceptedFullDmg,
  verifyRetainedHandoff,
} from '../../scripts/restore-retained-full-finalizer.mjs';
import { pruneFullRuntimeLayerCache } from '../../scripts/build-full-first-install-package/runtime-cache.ts';

const workflow = parse(fs.readFileSync('.github/workflows/full-first-install-release.yml', 'utf8'));
const action = parse(fs.readFileSync('.github/actions/finalize-full/action.yml', 'utf8'));
const refs = { app_sha: 'a'.repeat(40), shell_sha: 'b'.repeat(40), framework_sha: 'c'.repeat(40), mas_scholar_skills_sha: 'd'.repeat(40) };
const artifact = { id: 2, name: 'opl-full-finalizer-input-26.11.13-101', expired: false };

test('prefinalization recovery uses original Standard authority with a separately bound handoff', () => {
  const runtime = { now: () => new Date(), randomBytes: (n: number) => Buffer.alloc(n), wait: async () => {},
    runner(_command: string, args: string[]) {
      const route = args[1]!;
      const value = route.includes('/artifacts?')
        ? [{ artifacts: route.includes('/100/') ? [{ id: 1, name: 'opl-release-standard-checkpoint-100', expired: false }] : [artifact] }]
        : { path: '.github/workflows/release-stable.yml', event: 'workflow_dispatch', display_title: 'OPL Stable append_full source:100 run:101' };
      return { status: 0, stdout: JSON.stringify(value), stderr: '' };
    } };
  const standard = readOriginalStandardCheckpoint(runtime, 'owner/repo', '101');
  assert.deepEqual(standard, { runId: '100', artifact: 'opl-release-standard-checkpoint-100' });
  const input = { attemptId: 'recover', sourceRunId: standard.runId, sourceArtifact: standard.artifact, appSha: refs.app_sha, shellSha: refs.shell_sha, frameworkSha: refs.framework_sha, priorFullFinalizerRunId: '101' };
  const plan = buildAppendFullPlan(input);
  assert.equal(plan.workflow_inputs.source_run_id, '100');
  assert.deepEqual(JSON.parse(plan.workflow_inputs.prior_full_artifact_run_id!), { finalizer_input_run_id: '101' });
  assert.throws(() => buildAppendFullPlan({ ...input, sourceRunId: '101', sourceArtifact: 'opl-release-append-full-operation-checkpoint-v2-101' }), /original Standard authority/);

  const stable = parse(fs.readFileSync('.github/workflows/release-stable.yml', 'utf8'));
  assert.ok(Object.keys(stable.on.workflow_dispatch.inputs).length <= 25);
  const admission = stable.jobs.admission.steps.find((step: any) => step.id === 'admission').run;
  const prefix = admission.slice(0, admission.indexOf('test "$GITHUB_RUN_ATTEMPT"'));
  for (const [raw, operation, expected] of [[plan.workflow_inputs.prior_full_artifact_run_id, 'append_full', 0], ['{"finalizer_input_run_id":"101","extra":true}', 'append_full', 1], [plan.workflow_inputs.prior_full_artifact_run_id, 'standard', 1]] as const) {
    const result = spawnSync('bash', ['-c', prefix + '\nprintf "%s|%s" "$PRIOR_FULL_ARTIFACT_RUN_ID" "$PRIOR_FULL_FINALIZER_RUN_ID"'], { encoding: 'utf8', env: { ...process.env, PRIOR_FULL_ARTIFACT_RUN_ID: raw, OPERATION: operation, SOURCE_RUN_ID: '100' } });
    if (expected === 0) { assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, '|101'); }
    else assert.notEqual(result.status, 0);
  }
});

test('fresh Full finalization stays on its ARM builder; recovery skips the builder', () => {
  const build = workflow.jobs['full-first-install'];
  const resume = workflow.jobs['full-finalizer'];
  assert.equal(build.if, "${{ inputs.finalizer_source_run_id == '' }}");
  assert.match(resume.if, /inputs.finalizer_source_run_id != ''/);
  assert.equal(resume.needs, undefined);
  for (const [job, reuse] of [[build, 'true'], [resume, 'false']] as const) {
    const finalize = job.steps.find((step: any) => step.id === 'finalized');
    assert.equal(finalize.uses, './release-executor/.github/actions/finalize-full');
    assert.equal(finalize.with.reuse_build_workspace, reuse);
  }
  assert.match(action.runs.steps.find((step: any) => step.name === 'Download immutable Full finalizer input').if, /reuse_build_workspace != 'true'/);
  assert.match(action.runs.steps.find((step: any) => step.name === 'Import Developer ID identity for ARM finalization').if, /reuse_build_workspace != 'true'/);
});

test('an unsubmitted handoff wins over the Standard checkpoint without claiming Full qualification', () => {
  const owner = { id: 101, path: '.github/workflows/release-stable.yml', status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', head_branch: 'main', head_sha: refs.app_sha, run_attempt: 1, created_at: '2026-11-13T18:17:14Z', display_title: 'OPL Stable append_full source:100 run:101' };
  const target = reconcileAppendFullTarget({ runs: [owner], rootSourceRunId: '100', artifactsByRunId: {
    100: [{ id: 1, name: 'opl-release-standard-checkpoint-100', expired: false }],
    101: [artifact, { id: 3, name: 'opl-release-append-full-operation-checkpoint-v2-101', expired: false }],
  } });
  assert.equal(target.source_run_id, '101');
  assert.equal(target.source_artifact, 'opl-release-append-full-operation-checkpoint-v2-101');
  const handoff = { schema: 'opl_full_finalizer_input.v1', source_runner: { label: 'macos-latest', arch: 'arm64' }, full_content_sources: refs };
  assert.deepEqual(resolveAppendFullCohort(handoff, {}, () => { throw new Error('must not follow main'); }), { appSha: refs.app_sha, shellSha: refs.shell_sha, frameworkSha: refs.framework_sha });
  assert.throws(() => reusableFullFinalizerInput([artifact, { id: 4, name: 'opl-full-apple-recovery-26.11.13-101', expired: false }], '101'), /reconcile that submission/);
  assert.equal(reusableFullFinalizerInput([{ ...artifact, expired: true }], '101'), undefined);
  assert.throws(() => reusableFullFinalizerInput([artifact, { ...artifact, id: 4 }], '101'), /multiple/);
});

test('recovery rejects a changed archive digest before downloading or extracting', async () => {
  const originalFetch = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async () => {
    reads++;
    return new Response(JSON.stringify({ artifacts: [{ ...artifact, digest: `sha256:${'e'.repeat(64)}` }] }));
  };
  try {
    await assert.rejects(downloadArtifact({ GH_TOKEN: 'test-only', GITHUB_REPOSITORY: 'owner/repo', OPL_ARTIFACT_RUN_ID: '101', OPL_ARTIFACT_NAME: artifact.name, OPL_ARTIFACT_DEST: '/unused', OPL_ARTIFACT_CACHE: '/unused', OPL_ARTIFACT_EXPECTED_DIGEST: `sha256:${'f'.repeat(64)}` }), /differs from the admitted handoff/);
    assert.equal(reads, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('the real finalizer verifies every retained file and frozen source before consuming the handoff', () => {
  const step = action.runs.steps.find((step: any) => step.id === 'handoff');
  for (const mutation of ['none', 'owned-runner', 'wrong-runner', 'payload', 'source', 'extra']) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-recovery-'));
    try {
      const input = path.join(temp, 'opl-full-finalizer-input');
      const files = {
        'full-output/One-Person-Lab-Full-26.11.13-mac-arm64.dmg': 'retained candidate',
        'full-output/full-package-manifest.json': JSON.stringify({ components: { mas: { git_commit: 'e'.repeat(40) } } }),
        'dependency-resolution/full-input-manifest.json': '{}',
        'opl-full-toolchain-observation-receipt.json': '{}',
      };
      for (const [name, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(input, name)), { recursive: true });
        fs.writeFileSync(path.join(input, name), content);
      }
      fs.writeFileSync(path.join(input, 'handoff-manifest.json'), JSON.stringify({ schema: 'opl_full_finalizer_input.v1', release_version: '26.11.13', source_runner: { label: mutation === 'owned-runner' ? 'opl-release-macos-arm64' : mutation === 'wrong-runner' ? 'unknown' : 'macos-latest', arch: 'arm64' }, full_content_sources: refs, files: Object.entries(files).map(([name, content]) => ({ path: name, size_bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') })) }));
      if (mutation === 'payload') fs.appendFileSync(path.join(input, Object.keys(files)[0]!), 'changed');
      if (mutation === 'extra') fs.writeFileSync(path.join(input, 'unlisted'), 'changed');
      const result = spawnSync('bash', ['-c', step.run], { encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: temp, GITHUB_WORKSPACE: temp, GITHUB_OUTPUT: path.join(temp, 'output'), EXPECTED_HANDOFF_ARTIFACT_DIGEST: `sha256:${'f'.repeat(64)}`, EXPECTED_APP_SHA: mutation === 'source' ? '0'.repeat(40) : refs.app_sha, EXPECTED_SHELL_SHA: refs.shell_sha, EXPECTED_FRAMEWORK_SHA: refs.framework_sha, EXPECTED_MAS_SCHOLAR_SKILLS_SHA: refs.mas_scholar_skills_sha, OPL_RELEASE_VERSION: '26.11.13', OPL_MACOS_RUNNER_LABEL: 'opl-release-macos-arm64' } });
      if (mutation === 'none' || mutation === 'owned-runner') {
        assert.equal(result.status, 0, result.stderr);
        assert.match(fs.readFileSync(path.join(temp, 'output'), 'utf8'), /mas_ref=eeee/);
      } else assert.notEqual(result.status, 0, `accepted ${mutation}`);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  }
});

test('same-runner recovery admits only the original notarized Full bytes and run-bound handoff', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stapled-full-'));
  try {
    const handoffRoot = path.join(temp, 'handoff');
    fs.mkdirSync(handoffRoot);
    const manifestPath = path.join(handoffRoot, 'handoff-manifest.json');
    const manifest = { schema: 'opl_full_finalizer_input.v1', release_version: '26.11.13', full_content_sources: refs };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const archiveDigest = `sha256:${'a'.repeat(64)}`;
    fs.writeFileSync(path.join(temp, 'full-finalizer-handoff-receipt.json'), JSON.stringify({
      schema: 'opl_full_finalizer_handoff_receipt.v1',
      status: 'passed',
      artifact_digest: archiveDigest,
      handoff_manifest_sha256: createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex'),
    }));
    const handoff = { localRoot: temp, evidenceRoot: temp, expectedArchiveDigest: archiveDigest };
    assert.deepEqual(verifyRetainedHandoff(handoff), manifest);
    assert.throws(() => verifyRetainedHandoff({ ...handoff, expectedArchiveDigest: `sha256:${'b'.repeat(64)}` }), /archive and manifest digests/);
    fs.appendFileSync(manifestPath, '\n');
    assert.throws(() => verifyRetainedHandoff(handoff), /archive and manifest digests/);

    const dmgName = 'One-Person-Lab-Full-26.11.13-mac-arm64.dmg';
    const dmgPath = path.join(temp, dmgName);
    const receiptPath = path.join(temp, 'full-apple-notarization-receipt.json');
    const dmgBytes = 'original staple';
    fs.writeFileSync(dmgPath, dmgBytes);
    const expected = { dmgPath, receiptPath, expectedName: dmgName, expectedTeamId: 'TESTTEAM01' };
    const evidence = {
      schema: 'opl_apple_notarized_dmg_receipt.v1',
      artifact: dmgName,
      status: 'passed',
      team_identifier: expected.expectedTeamId,
      notarization: { status: 'Accepted', id: '12345678-1234-1234-1234-123456789012' },
      stapler_validate_status: 'passed',
      final_stapled_dmg_size_bytes: Buffer.byteLength(dmgBytes),
      final_stapled_dmg_sha256: createHash('sha256').update(dmgBytes).digest('hex'),
    };
    fs.writeFileSync(receiptPath, JSON.stringify(evidence));
    assert.deepEqual(await verifyAcceptedFullDmg(expected), evidence);
    await assert.rejects(verifyAcceptedFullDmg({ ...expected, expectedTeamId: 'OTHERTEAM1' }), /does not admit/);
    fs.writeFileSync(dmgPath, 'modified staple');
    await assert.rejects(verifyAcceptedFullDmg(expected), /differs from the prior notarization receipt/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('retained Full recovery pruning keeps only the protected/latest run, enforces TTL, and skips symlinks or non-run entries', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-recovery-prune-'));
  try {
    const baseDir = ownedFullRecoveryBaseDir({ HOME: temp });
    fs.mkdirSync(baseDir, { recursive: true });
    const nowMs = Date.UTC(2026, 10, 26, 12, 0, 0);
    const setMtime = (target: string, mtimeMs: number) => fs.utimesSync(target, mtimeMs / 1000, mtimeMs / 1000);

    const oldRun = path.join(baseDir, '1001');
    const olderRun = path.join(baseDir, '1002');
    const latestRun = path.join(baseDir, '1003');
    const nonRunDir = path.join(baseDir, 'manual-note');
    const outside = path.join(temp, 'outside');
    const symlinkRun = path.join(baseDir, '1004');
    for (const dir of [oldRun, olderRun, latestRun, nonRunDir, outside]) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'marker.txt'), 'ok');
    }
    fs.symlinkSync(outside, symlinkRun);
    setMtime(oldRun, nowMs - 10 * 24 * 60 * 60 * 1000);
    setMtime(olderRun, nowMs - 2 * 60 * 60 * 1000);
    setMtime(latestRun, nowMs - 10 * 60 * 1000);

    const pruned = pruneRetainedFullRecoveryRuns({
      baseDir,
      keepRunIds: ['1003'],
      maxRetainedRuns: 1,
      nowMs,
    });
    assert.deepEqual(pruned.retained_run_ids, ['1003']);
    assert.deepEqual(pruned.removed_run_ids.sort(), ['1001', '1002']);
    assert.deepEqual(pruned.skipped_entries.sort(), ['1004', 'manual-note']);
    assert.equal(fs.existsSync(latestRun), true);
    assert.equal(fs.existsSync(oldRun), false);
    assert.equal(fs.existsSync(olderRun), false);
    assert.equal(fs.existsSync(nonRunDir), true);
    assert.equal(fs.existsSync(path.join(outside, 'marker.txt')), true);

    // CLI --prune mode respects HOME and OPL_RECOVERY_KEEP_RUN_ID.
    const nextRun = path.join(baseDir, '1005');
    fs.mkdirSync(nextRun, { recursive: true });
    setMtime(nextRun, nowMs);
    const cli = spawnSync(process.execPath, ['scripts/restore-retained-full-finalizer.mjs', '--prune'], {
      encoding: 'utf8',
      env: { ...process.env, HOME: temp, OPL_RECOVERY_KEEP_RUN_ID: '1005', OPL_RECOVERY_MAX_RETAINED_RUNS: '1' },
    });
    assert.equal(cli.status, 0, cli.stderr);
    const parsed = JSON.parse(cli.stdout);
    assert.deepEqual(parsed.retained_run_ids, ['1005']);
    assert.deepEqual(parsed.removed_run_ids, ['1003']);
    assert.equal(fs.existsSync(nextRun), true);
    assert.equal(fs.existsSync(latestRun), false);

    // Workflow retain step wires automatic pruning.
    const retainStep = action.runs.steps.find((step: any) => step.name === 'Retain verified Full inputs and notarized DMG on the owned runner');
    assert.match(retainStep.run, /restore-retained-full-finalizer\.mjs --prune/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('full-runtime layer cache pruning retains active and newest archives per layer and ignores non-archive or symlink entries', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-layer-cache-prune-'));
  try {
    const layerDir = path.join(temp, 'toolchain');
    fs.mkdirSync(layerDir, { recursive: true });
    const nowMs = Date.UTC(2026, 10, 26, 12, 0, 0);
    const setMtime = (target: string, mtimeMs: number) => fs.utimesSync(target, mtimeMs / 1000, mtimeMs / 1000);

    const expired = path.join(layerDir, 'old-expired.tar.zst');
    const oldest = path.join(layerDir, 'recent-1.tar.zst');
    const newer = path.join(layerDir, 'recent-2.tar.zst');
    const active = path.join(layerDir, 'active-3.tar.zst');
    const note = path.join(layerDir, 'README.txt');
    const outside = path.join(temp, 'outside.tar.zst');
    const symlinkArchive = path.join(layerDir, 'linked.tar.zst');
    for (const file of [expired, oldest, newer, active, note, outside]) fs.writeFileSync(file, 'data');
    fs.symlinkSync(outside, symlinkArchive);
    setMtime(expired, nowMs - 20 * 24 * 60 * 60 * 1000);
    setMtime(oldest, nowMs - 3 * 60 * 60 * 1000);
    setMtime(newer, nowMs - 2 * 60 * 60 * 1000);
    setMtime(active, nowMs - 10 * 60 * 1000);

    const summary = pruneFullRuntimeLayerCache(temp, 'toolchain', active, {
      maxArchives: 2,
      maxAgeMs: 14 * 24 * 60 * 60 * 1000,
      nowMs,
    });
    assert.deepEqual(summary.retained_archives.sort(), [active, newer].sort());
    assert.deepEqual(summary.removed_archives.sort(), [expired, oldest].sort());
    assert.equal(fs.existsSync(active), true);
    assert.equal(fs.existsSync(newer), true);
    assert.equal(fs.existsSync(expired), false);
    assert.equal(fs.existsSync(oldest), false);
    assert.equal(fs.existsSync(note), true);
    assert.equal(fs.existsSync(outside), true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
