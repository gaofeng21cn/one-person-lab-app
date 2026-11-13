import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { reusableFullFinalizerInput } from '../../scripts/stable-release-dispatch-parts/artifact-retrieval.ts';
import { reconcileAppendFullTarget } from '../../scripts/stable-release-dispatch-parts/owner-run-reconciliation.ts';
import { resolveAppendFullCohort } from '../../scripts/stable-release-dispatch-parts/plan-source-guards.ts';
import { downloadArtifact } from '../../scripts/download-github-artifact.mjs';

const workflow = parse(fs.readFileSync('.github/workflows/full-first-install-release.yml', 'utf8'));
const action = parse(fs.readFileSync('.github/actions/finalize-full/action.yml', 'utf8'));
const refs = { app_sha: 'a'.repeat(40), shell_sha: 'b'.repeat(40), framework_sha: 'c'.repeat(40), mas_scholar_skills_sha: 'd'.repeat(40) };
const artifact = { id: 2, name: 'opl-full-finalizer-input-26.11.13-101', expired: false };

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
  for (const mutation of ['none', 'payload', 'source', 'extra']) {
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
      fs.writeFileSync(path.join(input, 'handoff-manifest.json'), JSON.stringify({ schema: 'opl_full_finalizer_input.v1', release_version: '26.11.13', source_runner: { label: 'macos-latest', arch: 'arm64' }, full_content_sources: refs, files: Object.entries(files).map(([name, content]) => ({ path: name, size_bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') })) }));
      if (mutation === 'payload') fs.appendFileSync(path.join(input, Object.keys(files)[0]!), 'changed');
      if (mutation === 'extra') fs.writeFileSync(path.join(input, 'unlisted'), 'changed');
      const result = spawnSync('bash', ['-c', step.run], { encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: temp, GITHUB_WORKSPACE: temp, GITHUB_OUTPUT: path.join(temp, 'output'), EXPECTED_HANDOFF_ARTIFACT_DIGEST: `sha256:${'f'.repeat(64)}`, EXPECTED_APP_SHA: mutation === 'source' ? '0'.repeat(40) : refs.app_sha, EXPECTED_SHELL_SHA: refs.shell_sha, EXPECTED_FRAMEWORK_SHA: refs.framework_sha, EXPECTED_MAS_SCHOLAR_SKILLS_SHA: refs.mas_scholar_skills_sha, OPL_RELEASE_VERSION: '26.11.13' } });
      if (mutation === 'none') {
        assert.equal(result.status, 0, result.stderr);
        assert.match(fs.readFileSync(path.join(temp, 'output'), 'utf8'), /mas_ref=eeee/);
      } else assert.notEqual(result.status, 0, `accepted ${mutation}`);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  }
});
