import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { resolveFullReplacementCandidate } from '../../scripts/resolve-full-replacement-candidate.ts';

function fixture() {
  const app = 'a'.repeat(40), shell = 'b'.repeat(40), framework = 'c'.repeat(40);
  return {
    repository: 'owner/app', runId: '123', tag: 'v26.10.23', app, shell, framework,
    run: { id: 123, status: 'completed', run_attempt: 1, repository: { full_name: 'owner/app' }, path: '.github/workflows/build-manual.yml', conclusion: 'failure' },
    jobs: [{ name: 'Build the same-tag Full replacement / Build App-owned Full first-install DMG', conclusion: 'success' }],
    cohort: { schema: 'opl_app_build_artifact_cohort.v2', cohort: { app_sha: app, shell_sha: shell, framework_sha: framework }, build: { version: '26.10.23', kind: 'full' },
      actions: { run_id: '123', run_attempt: '1', artifact_name: 'opl-full-first-install-dmg-26.10.23-mac-arm64' },
      artifact: { name: 'One-Person-Lab-Full-26.10.23-mac-arm64.dmg', sha256: 'd'.repeat(64), size_bytes: 12345 } },
    manifest: { version: '26.10.23', resolved_refs: { opl_framework: { resolved_commit: framework }, mas: { resolved_commit: 'e'.repeat(40) }, mas_scholar_skills: { resolved_commit: 'f'.repeat(40) } } },
    notarization: { status: 'passed', notarization: { status: 'Accepted' }, final_stapled_dmg_sha256: 'd'.repeat(64), final_stapled_dmg_size_bytes: 12345 },
    trust: { status: 'passed' },
  };
}

test('Full recovery reuses a successful build even when a later VM admission failed', () => {
  assert.deepEqual(resolveFullReplacementCandidate(fixture()), { full_mas_ref: 'e'.repeat(40), full_mas_scholar_skills_ref: 'f'.repeat(40) });
});

test('Full recovery rejects failed builds, changed cohorts, wrong producers, and unsigned bytes', () => {
  for (const change of [
    (x: any) => { x.jobs[0].conclusion = 'failure'; },
    (x: any) => { x.cohort.cohort.app_sha = '0'.repeat(40); },
    (x: any) => { x.cohort.actions.run_id = '124'; },
    (x: any) => { x.notarization.final_stapled_dmg_sha256 = '0'.repeat(64); },
    (x: any) => { x.notarization.notarization.status = 'Rejected'; },
    (x: any) => { x.trust.status = 'failed'; },
  ]) {
    const input = fixture(); change(input);
    assert.throws(() => resolveFullReplacementCandidate(input));
  }
});

test('same-tag qualification defaults to the frozen App and skips rebuilding a reused Full', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/build-manual.yml', import.meta.url), 'utf8');
  assert.equal(workflow.match(/verification_app_ref: \$\{\{ inputs\.verification_app_ref \|\| needs\.prepare-matrix\.outputs\.app_ref \}\}/g)?.length, 2);
  assert.match(workflow, /build-full-replacement:[\s\S]*if:.*inputs\.replacement_full_candidate_run_id == ''/);
  assert.match(workflow, /qualify-full-replacement:[\s\S]*release_artifact_run_id: \$\{\{ inputs\.replacement_full_candidate_run_id \|\| github\.run_id \}\}/);
  const full = workflow.slice(workflow.indexOf('  qualify-full-replacement:'));
  assert.match(full, /smoke_harness_ref: \$\{\{ inputs\.replacement_smoke_harness_ref \|\| inputs\.shell_ref \}\}/);
  assert.match(full, /framework_executor_ref: \$\{\{ inputs\.framework_ref \}\}/);
  assert.match(full, /codex_qualification_cohort_artifact_name: opl-full-first-install-dmg-\$\{\{ needs\.prepare-matrix\.outputs\.candidate_version \}\}-mac-arm64-cohort/);
});
