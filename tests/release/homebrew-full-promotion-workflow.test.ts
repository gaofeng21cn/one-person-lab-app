import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

const workflowRoot = path.join(process.cwd(), '.github', 'workflows');
const g32HandoffPath = path.join(process.cwd(), 'tests', 'release', 'fixtures', 'homebrew-full-handoff-g32.json');
const read = (name: string) => fs.readFileSync(path.join(workflowRoot, name), 'utf8');
const parse = (name: string) => parseYaml(read(name)) as Record<string, any>;

const g32Predicate = `
  def opl_fromdateiso8601:
    if type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?Z$")
    then sub("[.][0-9]+Z$"; "Z") | fromdateiso8601
    else error("invalid timestamp") end;
  .schema == "opl_homebrew_full_follower_handoff.v1"
  and ((.operation_control.operation_started_at | opl_fromdateiso8601) > 0)
  and ((.operation_control.operation_deadline_at | opl_fromdateiso8601) > (.operation_control.operation_started_at | opl_fromdateiso8601))
  and (.release.target_standard.tag | test("^v[0-9]+[.][0-9]+[.][0-9]+(-r[1-9][0-9]*)?$"))
  and (.release.target_standard.target_commitish | test("^[0-9a-f]{40}$"))
  and .release.target_standard.mutation_allowed == false
  and ((.release | has("base_tag")) | not)
  and ((.release | has("bundle_digest")) | not)
  and ((.release | has("cohort")) | not)
  and .build_provenance.admission_role == "observational_only"
  and .build_provenance.may_gate_install_or_runtime == false
  and (.build_provenance.bundle_digest | test("^sha256:[0-9a-f]{64}$"))
  and (.build_provenance.app_sha | test("^[0-9a-f]{40}$"))
  and (.build_provenance.shell_sha | test("^[0-9a-f]{40}$"))
  and (.build_provenance.framework_sha | test("^[0-9a-f]{40}$"))
  and (.artifact.sha256 | test("^sha256:[0-9a-f]{64}$"))
  and (.manifest.sha256 | test("^sha256:[0-9a-f]{64}$"))
`;

function validateG32(handoff: Record<string, any>) {
  return spawnSync('jq', ['-e', g32Predicate], { input: JSON.stringify(handoff), encoding: 'utf8' });
}

test('G32 Full handoff accepts fractional UTC timestamps and canonical producer fields', () => {
  const handoff = JSON.parse(fs.readFileSync(g32HandoffPath, 'utf8')) as Record<string, any>;
  assert.equal(validateG32(handoff).status, 0);
  assert.equal(handoff.operation_control.operation_started_at, '2026-08-03T00:08:08.000Z');
  assert.equal(handoff.release.target_standard.tag, 'v26.8.1-r5');
  assert.equal(handoff.build_provenance.admission_role, 'observational_only');
  assert.equal(handoff.build_provenance.may_gate_install_or_runtime, false);
});

test('Full handoff rejects retired, missing, and hostile producer shapes', () => {
  const current = JSON.parse(fs.readFileSync(g32HandoffPath, 'utf8')) as Record<string, any>;
  const retired = structuredClone(current);
  retired.release.base_tag = retired.release.target_standard.tag;
  delete retired.release.target_standard;
  const missing = structuredClone(current);
  delete missing.build_provenance.bundle_digest;
  const hostile = structuredClone(current);
  hostile.operation_control.operation_started_at = '2026-08-03T00:08:08.000Z; touch /tmp/unsafe';
  for (const candidate of [retired, missing, hostile]) assert.notEqual(validateG32(candidate).status, 0);
});

test('append_full exports exact qualification-bound handoff without mutating Homebrew', () => {
  const source = read('_release-full-addon.yml');
  for (const required of [
    'opl_homebrew_full_follower_handoff.v1',
    'operation_control',
    'operation_id',
    'operation_started_at',
    'operation_deadline_at',
    'checkpoint_transport_executor',
    'transport_run_id',
    'completed_stage:"full_qualified"',
    'qualification_receipt_sha256',
    'version:$version',
    'adjunct_tag:$adjunct_tag',
    'manifest:{name:$manifest_name,sha256:$manifest_sha,size_bytes:$manifest_size}',
    'artifact:{name:$dmg_name,sha256:$dmg_sha,size_bytes:$dmg_size}',
    'admission_role:"observational_only"',
    'may_gate_install_or_runtime:false',
    'homebrew_modified:false',
    'latest_modified:false',
    'homebrew-full-handoff.json',
  ]) assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(source, /base_tag:\$base_tag|cohort:\{app_sha/);
  assert.doesNotMatch(source, /OPL_HOMEBREW_TAP_TOKEN|update-homebrew-tap|git\b[^\n]*\bpush\b/);
});

test('Full Homebrew follower permits only automatic delivery or exact failed-run recovery', () => {
  const source = read('release-homebrew-full-follower.yml');
  const workflow = parse('release-homebrew-full-follower.yml');
  assert.deepEqual(Object.keys(workflow.on), ['workflow_run', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.workflow_run.workflows, ['OPL Stable Release Bundle']);
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), [
    'source_run_id', 'failed_follower_run_id', 'failed_recovery_run_id', 'recovery_confirmation',
  ]);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.recovery_confirmation.options, [
    'recover_exact_failed_homebrew_full_follower_v2',
  ]);
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.deepEqual(Object.keys(workflow.jobs), ['resolve-handoff', 'publish-homebrew-full']);
  assert.match(workflow.jobs['resolve-handoff'].if, /recover_exact_failed_homebrew_full_follower_v2/);
  assert.equal(workflow.jobs['publish-homebrew-full'].uses, './.github/workflows/_release-homebrew-full-publish.yml');
  assert.match(source, /homebrew-full-handoff\.json/);
  assert.match(source, /\.operation_control\.operation_id/);
  assert.match(source, /\.operation_control\.operation_deadline_at/);
  assert.match(source, /\.source\.completed_stage == "full_qualified"/);
  assert.match(source, /\.source\.checkpoint_transport_executor == "github_actions"/);
  assert.match(source, /\.source\.transport_run_id/);
  assert.match(source, /def opl_fromdateiso8601/);
  assert.match(source, /failed-follower-run\.json/);
  assert.match(source, /failed-recovery-run\.json/);
  assert.match(source, /failed_recovery_run_id/);
  assert.match(source, /\.name == "Bind immutable Homebrew Full handoff" and \.conclusion == "failure"/);
  assert.match(source, /\.name == "publish-homebrew-full" and \.conclusion == "skipped"/);
  assert.match(source, /runs\?event=workflow_dispatch&per_page=100/);
  assert.match(source, /\(\$matches \| length\) == 1/);
  assert.match(source, /\.head_branch == "main"/);
  assert.match(source, /\^OPL Stable append_full source:/);
  assert.match(source, /base_tag="\$\(jq -er \.release\.target_standard\.tag "\$handoff"\)"/);
  assert.match(source, /adjunct_tag="\$\(jq -er \.release\.adjunct_tag "\$handoff"\)"/);
  assert.match(source, /"\$base_tag"-full-/);
  assert.doesNotMatch(source, /\.release\.tag/);
  assert.doesNotMatch(source, /test "\$\(jq -er \.release\.cohort\.app_sha "\$handoff"\)" = "\$head_sha"/);
  assert.doesNotMatch(source, /\.release\.(?:base_tag|bundle_digest|cohort)/);
  assert.doesNotMatch(source, /OPL_HOMEBREW_TAP_TOKEN|git\b[^\n]*\bpush\b/);
});

test('Full Homebrew reusable publishes hosted-qualified bytes before optional physical certification', () => {
  const source = read('_release-homebrew-full-publish.yml');
  const workflow = parse('_release-homebrew-full-publish.yml');
  assert.deepEqual(Object.keys(workflow.on), ['workflow_call']);
  assert.deepEqual(Object.keys(workflow.jobs), [
    'startup-canary',
    'prepare-candidate',
    'publish-cask',
    'readback',
  ]);
  assert.deepEqual(workflow.jobs['publish-cask'].needs, ['prepare-candidate']);
  assert.equal(workflow.jobs['publish-cask'].environment, 'release-stable');
  assert.match(source, /def opl_fromdateiso8601/);
  assert.match(source, /base_tag="\$\(jq -er \.release\.target_standard\.tag handoff\.json\)"/);
  assert.match(source, /app_sha="\$\(jq -er \.build_provenance\.app_sha handoff\.json\)"/);
  assert.doesNotMatch(source, /\.release\.(?:base_tag|bundle_digest|cohort|updater_version)/);
  assert.doesNotMatch(source, /Restore (?:exact )?qualified Full|restore-release-checkpoint|framework-executor/);
  assert.doesNotMatch(source, /opl release (?:operation|publish|reconcile|checkpoint)/);
  assert.match(source, /opl_homebrew_full_observational_binding\.v2/);
  assert.match(source, /authority_model:"immutable_public_artifact_observer"/);
  assert.match(source, /release_mutation_authority_imported:false/);
  assert.match(source, /framework_checkpoint_consumed:false/);
  assert.match(source, /max_push_attempts:1/);
  assert.match(source, /homebrew-full-follower-v2:\$\{GITHUB_RUN_ID\}/);
  assert.match(source, /release-operation-deadline\.ts check/);
  assert.match(source, /no second push was attempted/);
  assert.match(source, /opl_homebrew_full_unknown_outcome\.v2/);
  assert.match(source, /required_action:"read_only_reconcile"/);
  assert.match(source, /a1561bdf1dfe6f316dad22f16152a537ddfb69d5/);
  assert.match(source, /merge-base --is-ancestor "\$embedded_base_floor" "\$shell_sha"/);
  assert.match(source, /standard_manifest_url=.*opl-app-component-manifest\.json/);
  assert.match(source, /\.source_cohort == \{app_sha:\$app,shell_sha:\$shell,framework_sha:\$framework\}/);
  assert.match(source, /git -C tap-source push --no-force origin "\$result_commit:refs\/heads\/main"/);
  assert.equal((source.match(/git -C tap-source push --no-force/g) ?? []).length, 1);
  assert.match(source, /git -C tap-source ls-remote origin refs\/heads\/main/);
  assert.match(source, /git -C tap-source fetch --no-tags --depth=1 origin "\$remote_commit"/);
  assert.match(source, /git -C tap-source show 'FETCH_HEAD:Casks\/one-person-lab-full\.rb'/);
  assert.doesNotMatch(source, /contents\/Casks\/one-person-lab-full\.rb\?ref=main/);
  assert.doesNotMatch(
    source,
    /qualify-candidate|opl-first-run-vm\.yml|tart-smoke-summary\.json|smoke_harness_sha|shell-harness|opl-first-run-tart-smoke|--homebrew-cask-file|clean_vm_receipt_sha256|formula_opl_installed_before|official_profile_first_install/,
  );
  assert.match(source, /base_tag="\$\(jq -er \.release\.target_standard\.tag handoff\.json\)"/);
  assert.match(source, /adjunct_tag="\$\(jq -er \.release\.adjunct_tag handoff\.json\)"/);
  assert.match(source, /releases\/tags\/\$adjunct_tag/);
  assert.match(source, /\.tag_name == \$tag/);
  assert.match(source, /executor_sha="\$\(jq -er \.authority\.executor_head_sha handoff\.json\)"/);
  assert.match(source, /\.target_commitish == \$executor/);
  assert.match(source, /\.browser_download_url == \$dmg_url/);
  assert.match(source, /\.browser_download_url == \$manifest_url/);
  assert.match(source, /\.target_commitish == \$target/);
  assert.match(source, /needs\.prepare-candidate\.outputs\.adjunct_tag/);
  assert.doesNotMatch(source, /jq -er \.release\.tag handoff\.json/);
  assert.doesNotMatch(source, /depends_on formula: "opl"|github-activate-latest|make_latest/);
});

test('append_full resume recognizes only exact GitHub Full or Full Cask unknown targets', () => {
  const source = read('_release-full-addon.yml');
  assert.match(source, /case "\$target" in/);
  assert.match(source, /github-release:\*\)/);
  assert.match(source, /homebrew:\*\)/);
  assert.match(source, /Casks\/one-person-lab-full\.rb\/\$\{expected_cask_sha\}/);
  assert.match(source, /test "\$publication_scope" = external_target/);
  assert.match(source, /Unsupported append_full portable unknown target/);
  assert.match(source, /publication-scope "\$publication_scope"/);
  assert.match(source, /test "\$\(jq -r \.operation_id <<<"\$marker"\)" = "\$operation_id"/);
  assert.match(source, /git -C full-resume-tap fetch --no-tags --depth=1 origin "\$remote_commit"/);
  assert.match(source, /git -C full-resume-tap show 'FETCH_HEAD:Casks\/one-person-lab-full\.rb'/);
  assert.doesNotMatch(source, /contents\/Casks\/one-person-lab-full\.rb\?ref=main/);
  assert.doesNotMatch(source, /git\b[^\n]*\bpush\b/);
});

test('VM harness retains an isolated Full Homebrew probe outside the publication DAG', () => {
  const source = read('opl-first-run-vm.yml');
  assert.match(source, /homebrew_candidate_artifact/);
  assert.match(source, /package_profile=homebrew-full requires an exact pre-publication Cask artifact/);
  assert.match(source, /--smoke-profile homebrew-full-cask/);
  assert.match(source, /--homebrew-cask-file/);
  assert.match(source, /oplProductProfile\/oplProductProfile\.generated\.json/);
  assert.match(source, /inputs\.package_profile != 'homebrew-full'/);
});
