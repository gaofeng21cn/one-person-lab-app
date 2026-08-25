import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const readWorkflow = (name: string) => parseYaml(
  fs.readFileSync(path.join(root, '.github', 'workflows', name), 'utf8'),
);
const stable = readWorkflow('release-stable.yml');
const full = readWorkflow('_release-studio-full.yml');
const readSteps = (job: Record<string, any>) => (job.steps ?? []) as Array<Record<string, any>>;
const runText = (job: Record<string, any>) => readSteps(job)
  .map((step) => `${step.name ?? ''}\n${step.run ?? ''}\n${step.uses ?? ''}\n${JSON.stringify(step.with ?? {})}`)
  .join('\n');

test('Studio Full uses a separate same-tag append entry', () => {
  assert.equal(Object.keys(stable.on.workflow_dispatch.inputs).length, 25);
  for (const derivedInput of ['version', 'include_full', 'operation_deadline_at']) {
    assert.equal(stable.on.workflow_dispatch.inputs[derivedInput], undefined);
  }
  assert.deepEqual(stable.on.workflow_dispatch.inputs.entry.options, [
    'framework_release',
    'studio_carrier_admission',
    'studio_full_append',
  ]);
  assert.equal(stable.jobs['studio-full-append-admission'].if, "${{ inputs.entry == 'studio_full_append' }}");
  assert.equal(stable.jobs['studio-full-append'].uses, './.github/workflows/_release-studio-full.yml');
  assert.deepEqual(stable.jobs['studio-full-append'].needs, ['studio-full-append-admission']);
  assert.equal(stable.jobs['studio-full-append'].secrets, 'inherit');
  assert.deepEqual(stable.jobs['studio-full-append'].permissions, { contents: 'read', actions: 'read' });
  assert.equal(
    stable.jobs['studio-full-append'].with.app_ref,
    '${{ needs.studio-full-append-admission.outputs.app_ref }}',
  );
  assert.equal(
    stable.jobs['studio-full-append-admission'].steps[0].env.REQUESTED_APP_REF,
    '${{ inputs.app_ref }}',
  );
  assert.match(String(stable.jobs['studio-full-append-admission'].steps[0].run), /test -z "\$REQUESTED_APP_REF"/);
});

test('Studio Full reusable workflow has one build, one append, and one anonymous readback path', () => {
  assert.deepEqual(Object.keys(full.on), ['workflow_call']);
  assert.equal(full.concurrency, undefined);
  assert.deepEqual(Object.keys(full.jobs), [
    'build-full-signed-notarized',
    'restore-full',
    'publish-full',
    'public-readback',
  ]);

  const build = full.jobs['build-full-signed-notarized'];
  const restore = full.jobs['restore-full'];
  const publish = full.jobs['publish-full'];
  const readback = full.jobs['public-readback'];
  assert.equal(build.if, "${{ inputs.prior_studio_full_artifact_run_id == '' }}");
  assert.equal(restore.if, "${{ inputs.prior_studio_full_artifact_run_id != '' }}");
  assert.deepEqual(publish.needs, ['build-full-signed-notarized', 'restore-full']);
  assert.deepEqual(publish.concurrency, {
    group: 'opl-studio-publication-global',
    'cancel-in-progress': false,
  });
  assert.deepEqual(readback.needs, ['publish-full']);
  assert.equal(readback.environment, undefined);

  const evidence = [build, restore, publish, readback].map(runText).join('\n');
  assert.equal(build.steps.some((step: Record<string, any>) => step.with?.repository === 'gaofeng21cn/one-person-lab-app'), true);
  assert.equal(build.steps.some((step: Record<string, any>) => step.with?.repository === 'gaofeng21cn/opl-studio'), true);
  assert.equal(build.steps.some((step: Record<string, any>) => step.with?.repository === 'gaofeng21cn/one-person-lab'), true);
  const desktopBuild = build.steps.find((step: Record<string, any>) => step.name === 'Build the exact Studio desktop directory');
  assert.equal(desktopBuild?.env?.OPL_APP_REPO_ROOT, '${{ github.workspace }}/app-source');
  const fullBuild = build.steps.find((step: Record<string, any>) => step.name === 'Build Studio Full through the App Full builder');
  assert.ok(fullBuild);
  for (const [environmentName, inputName] of Object.entries({
    OPL_FULL_FRAMEWORK_REF: 'framework_ref',
    OPL_FULL_MAS_REF: 'mas_ref',
    OPL_FULL_MAS_SCHOLAR_SKILLS_REF: 'mas_scholar_skills_ref',
    OPL_FULL_MAG_REF: 'mag_ref',
    OPL_FULL_RCA_REF: 'rca_ref',
    OPL_FULL_META_AGENT_REF: 'meta_agent_ref',
    OPL_FULL_BOOKFORGE_REF: 'bookforge_ref',
    OPL_FULL_OPL_FLOW_REF: 'opl_flow_ref',
    OPL_FULL_OFFICECLI_REF: 'officecli_ref',
    OPL_FULL_MINERU_REF: 'mineru_ref',
  })) {
    assert.equal(fullBuild.env?.[environmentName], `\${{ inputs.${inputName} }}`);
  }
  for (const required of [
    'scripts/verify-apple-release-credentials.ts',
    'npm --prefix app-source run release:full',
    'scripts/notarize-macos-dmg.ts',
    'xcrun stapler validate',
    'studio-full-release-adapter.ts append',
    'Read back public Standard and Full bytes anonymously',
    'public-asset-readback.json',
  ]) {
    assert.ok(evidence.includes(required), required);
  }
  assert.doesNotMatch(evidence, /gh\s+release\s+(?:create|edit|upload|delete)|--clobber/);
  assert.doesNotMatch(evidence, /bundled-aioncore|aioncore_codex_only|gaofeng21cn\/aionui/i);
  assert.doesNotMatch(evidence, /curl -fsSL "https:\/\/api\.github\.com/);
  assert.match(evidence, /gh api "repos\/\$STUDIO_REPOSITORY\/releases\/latest"/);
  assert.match(evidence, /releases\/latest\/download\/\$name/);
  assert.match(evidence, /cmp "public-assets\/\$name" "public-latest-assets\/\$name"/);

  const notarize = build.steps.find((step: Record<string, any>) => step.name === 'Notarize and staple the final Studio Full DMG');
  assert.equal(notarize?.id, 'notarize-studio-full');
  assert.match(String(notarize?.run), /--submitted-candidate-output/);
  const capture = build.steps.find((step: Record<string, any>) => step.name === 'Capture Studio Full notarization failure evidence');
  assert.equal(capture?.if, "${{ failure() && steps.notarize-studio-full.outcome == 'failure' }}");
  assert.match(String(capture?.run), /notarytool log/);
  const recovery = build.steps.find((step: Record<string, any>) => step.name === 'Upload Studio Full notarization recovery evidence');
  assert.equal(recovery?.if, "${{ failure() && steps.notarize-studio-full.outcome == 'failure' }}");
  assert.match(String(recovery?.with?.name), /opl-studio-full-notarization-recovery/);
  assert.match(String(recovery?.with?.path), /full-apple-notarization-receipt\.json/);
  assert.match(String(recovery?.with?.path), /submitted-for-notarization\.dmg/);
});

test('Studio Full contract keeps its additive asset set explicit', () => {
  const release = JSON.parse(fs.readFileSync(
    path.join(root, 'contracts', 'app-release-channel.json'),
    'utf8',
  ));
  const policy = release.full_first_install.studio_same_tag_append;
  assert.equal(policy.schema, 'opl_studio_full_same_tag_append_policy.v1');
  assert.equal(policy.target_release, 'already_published_mutable_standard_release_same_tag');
  assert.deepEqual(policy.allowed_assets, [
    'one-person-lab-preview-full-<version>-mac-arm64.dmg',
    'opl-release-manifest.json',
  ]);
  assert.ok(policy.forbidden_mutations.includes('standard_asset_overwrite'));
  assert.ok(policy.forbidden_mutations.includes('latest_pointer'));
  assert.ok(policy.forbidden_mutations.includes('latest-mac.yml'));
  assert.equal(policy.unknown_upload_result, 'readback_only_no_retry');
});
