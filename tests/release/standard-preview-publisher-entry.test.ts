import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

import { readAppComponentManifestIdentity } from '../../scripts/read-opl-app-component-manifest-identity.ts';
import { resolvePreviewReleaseRequest } from '../../scripts/resolve-preview-release-request.ts';

const sha = (byte: string) => byte.repeat(40);
const workflowRoot = path.join(process.cwd(), '.github', 'workflows');
const readWorkflow = (name: string) => fs.readFileSync(path.join(workflowRoot, name), 'utf8');
const parseWorkflow = (name: string) => parseYaml(readWorkflow(name));

function sealManifest(value: Record<string, unknown>): Record<string, unknown> {
  const core = { ...value };
  delete core.component_manifest_digest;
  return {
    ...core,
    component_manifest_digest: `sha256:${crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex')}`,
  };
}

function currentManifest(overrides: Record<string, unknown> = {}) {
  return sealManifest({
    surface_kind: 'opl_app_component_manifest.v1',
    component_id: 'opl-app',
    version: '26.7.25-preview.r1',
    release_version: '26.7.25-preview.r1',
    updater_version: '26.7.2501',
    quality_status: 'preview',
    build_trigger: 'manual',
    preview_kind: 'dev',
    distribution_pointer_policy: {
      pointer: 'latest',
      automatic_writer: 'never',
      explicit_override: 'protected_single_use_exact_version',
      quality_unchanged: true,
      stable_reclaim: 'next_qualified_stable',
    },
    qualification_disclosure: {
      stable_qualified: false,
      passed_gates: ['standard_vm'],
      skipped_gates: ['homebrew_clean_install', 'native_webui', 'container_webui', 'full'],
      failed_gates: [],
      non_stable_notice: true,
    },
    source_commit: sha('a'),
    source_cohort: {
      app_sha: sha('a'),
      shell_sha: sha('b'),
      framework_sha: sha('c'),
    },
    release_tag: 'v26.7.25-preview.r1',
    release_url: 'https://example.invalid/releases/tag/v26.7.25-preview.r1',
    primary_artifact: { name: 'One-Person-Lab-26.7.25-preview.r1-mac-arm64.dmg' },
    ...overrides,
  });
}

test('new Manual Preview request allocates a real Preview Bundle identity and bounded Standard operation', () => {
  const result = resolvePreviewReleaseRequest({
    operation: 'preview',
    baseVersion: '26.7.25',
    appRef: sha('a'),
    shellRef: sha('b'),
    frameworkRef: sha('c'),
    existingRefs: ['refs/tags/v26.7.25', 'v26.7.25-preview.r1'],
    operationStartedAt: '2026-07-25T00:00:00.000Z',
  });

  assert.equal(result.schema, 'opl_manual_standard_preview_request.v1');
  assert.equal(result.operation, 'preview');
  assert.equal(result.publication_channel, 'preview');
  assert.equal(result.quality_status, 'preview');
  assert.equal(result.build_trigger, 'manual');
  assert.equal(result.preview_kind, 'dev');
  assert.equal(result.latest_override_requested, false);
  assert.equal(result.latest_override_authority, 'none');
  assert.deepEqual(result.qualification_disclosure, {
    stable_qualified: false,
    passed_gates: ['standard_vm'],
    skipped_gates: ['homebrew_clean_install', 'native_webui', 'container_webui', 'full'],
    failed_gates: [],
    non_stable_notice: true,
  });
  assert.equal(result.version, '26.7.25-preview.r2');
  assert.equal(result.updater_version, '26.7.2502');
  assert.equal(result.app_ref, sha('a'));
  assert.equal(result.shell_ref, sha('b'));
  assert.equal(result.framework_ref, sha('c'));
  assert.equal(result.source_run_id, null);
  assert.equal(result.source_artifact, null);
  assert.equal(result.operation_started_at, '2026-07-25T00:00:00.000Z');
  assert.match(result.operation_deadline_at, /^2026-07-25T/);
});

test('Manual Preview Latest override is explicit and does not change Preview quality', () => {
  const result = resolvePreviewReleaseRequest({
    operation: 'preview',
    baseVersion: '26.7.25',
    appRef: sha('a'),
    shellRef: sha('b'),
    frameworkRef: sha('c'),
    latestOverrideRequested: true,
    operationStartedAt: '2026-07-25T00:00:00.000Z',
  });
  assert.equal(result.latest_override_requested, true);
  assert.equal(result.latest_override_authority, 'protected_single_use_exact_version');
  assert.equal(result.quality_status, 'preview');
  assert.equal(result.preview_kind, 'dev');
  assert.equal(result.qualification_disclosure.stable_qualified, false);
});

test('Manual Preview resolver rejects mixed new/recovery authority and non-exact refs', () => {
  assert.throws(() => resolvePreviewReleaseRequest({
    operation: 'preview',
    baseVersion: '26.7.25',
    appRef: sha('a'),
    shellRef: sha('b'),
    frameworkRef: sha('c'),
    sourceRunId: '123',
  }), /cannot consume a recovery source/);
  assert.throws(() => resolvePreviewReleaseRequest({
    operation: 'resume_preview',
    baseVersion: '26.7.25',
    appRef: sha('a'),
    sourceRunId: '123',
    sourceArtifact: 'opl-release-activation-123',
  }), /consumes only its exact checkpoint identity/);
  assert.throws(() => resolvePreviewReleaseRequest({
    operation: 'preview',
    baseVersion: '26.7.25',
    appRef: 'main',
    shellRef: sha('b'),
    frameworkRef: sha('c'),
  }), /App ref must be an exact lowercase Git SHA/);
});

test('Preview recovery resolver preserves only exact checkpoint identity', () => {
  const result = resolvePreviewReleaseRequest({
    operation: 'resume_preview',
    appRef: sha('a'),
    frameworkRef: sha('c'),
    sourceRunId: '30123456789',
    sourceArtifact: 'opl-release-activation-30123456789',
  });
  assert.deepEqual(result, {
    schema: 'opl_manual_standard_preview_request.v1',
    operation: 'resume_preview',
    publication_channel: 'preview',
    quality_status: 'preview',
    build_trigger: 'manual',
    preview_kind: 'dev',
    latest_override_requested: null,
    latest_override_authority: 'checkpoint',
    qualification_disclosure: null,
    version: null,
    updater_version: null,
    app_ref: sha('a'),
    shell_ref: null,
    framework_ref: sha('c'),
    source_run_id: '30123456789',
    source_artifact: 'opl-release-activation-30123456789',
    operation_started_at: null,
    operation_deadline_at: null,
  });
});

test('current component manifest binds Preview quality, updater, source commit, visibility, and exact digest', () => {
  const identity = readAppComponentManifestIdentity(
    currentManifest(),
    'v26.7.25-preview.r1',
    false,
    sha('a'),
  );
  assert.deepEqual(identity, {
    schema: 'opl_app_component_manifest_identity.v1',
    status: 'passed',
    manifest_format: 'current',
    release_tag: 'v26.7.25-preview.r1',
    display_version: '26.7.25-preview.r1',
    updater_version: '26.7.2501',
    quality_status: 'preview',
    build_trigger: 'manual',
    preview_kind: 'dev',
    distribution_pointer_policy: {
      pointer: 'latest',
      automatic_writer: 'never',
      explicit_override: 'protected_single_use_exact_version',
      quality_unchanged: true,
      stable_reclaim: 'next_qualified_stable',
    },
    qualification_disclosure: {
      stable_qualified: false,
      passed_gates: ['standard_vm'],
      skipped_gates: ['homebrew_clean_install', 'native_webui', 'container_webui', 'full'],
      failed_gates: [],
      non_stable_notice: true,
    },
    source_commit: sha('a'),
    component_manifest_digest: currentManifest().component_manifest_digest,
  });
});

test('component manifest reader rejects partial identity, source drift, digest drift, and Preview prerelease inference', () => {
  const partial = currentManifest();
  delete partial.distribution_pointer_policy;
  const sealedPartial = sealManifest(partial);
  assert.throws(
    () => readAppComponentManifestIdentity(sealedPartial, 'v26.7.25-preview.r1', false, sha('a')),
    /complete set/,
  );
  assert.throws(
    () => readAppComponentManifestIdentity(currentManifest(), 'v26.7.25-preview.r1', false, sha('b')),
    /source_commit does not match/,
  );
  assert.throws(
    () => readAppComponentManifestIdentity({
      ...currentManifest(),
      component_manifest_digest: `sha256:${'0'.repeat(64)}`,
    }, 'v26.7.25-preview.r1', false, sha('a')),
    /digest does not match/,
  );
  assert.throws(
    () => readAppComponentManifestIdentity(currentManifest(), 'v26.7.25-preview.r1', true, sha('a')),
    /prerelease state does not match/,
  );
  assert.throws(
    () => readAppComponentManifestIdentity(
      currentManifest({ build_trigger: 'automated', preview_kind: 'nightly' }),
      'v26.7.25-preview.r1',
      false,
      sha('a'),
    ),
    /Invalid nightly App release version|Updater version/,
  );
});

test('legacy manifest bridge accepts only canonical non-prerelease Stable identity', () => {
  const legacy = sealManifest({
    surface_kind: 'opl_app_component_manifest.v1',
    component_id: 'opl-app',
    version: '26.7.24',
    source_commit: sha('d'),
    release_tag: 'v26.7.24',
    release_url: 'https://example.invalid/releases/tag/v26.7.24',
    primary_artifact: { name: 'One-Person-Lab-26.7.24-mac-arm64.dmg' },
  });
  const identity = readAppComponentManifestIdentity(legacy, 'v26.7.24', false, sha('d'));
  assert.equal(identity.manifest_format, 'legacy_stable');
  assert.equal(identity.quality_status, 'stable');
  assert.equal(identity.build_trigger, 'manual');
  assert.equal(identity.preview_kind, null);
  assert.equal(identity.updater_version, '26.7.2400');
  assert.throws(
    () => readAppComponentManifestIdentity(legacy, 'v26.7.24', true, sha('d')),
    /only for canonical non-prerelease Stable/,
  );
});

test('Manual Preview workflow and explicit Latest override keep quality separate from pointer selection', () => {
  const workflow = parseWorkflow('release-manual-preview.yml');
  const source = readWorkflow('release-manual-preview.yml');
  const pointerWorkflow = parseWorkflow('_release-preview-latest-pointer.yml');
  const pointerSource = readWorkflow('_release-preview-latest-pointer.yml');
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(
    workflow.on.workflow_dispatch.inputs.operation.options,
    ['preview', 'resume_preview', 'move_latest_pointer'],
  );
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.deepEqual(workflow.jobs.admission.permissions, { contents: 'read', actions: 'read' });
  assert.deepEqual(workflow.concurrency, { group: 'opl-release-bundle-global', 'cancel-in-progress': false });
  assert.equal(workflow.jobs.preview.uses, './.github/workflows/_release-bundle.yml');
  assert.equal(workflow.jobs.preview.with.channel, 'preview');
  assert.equal(workflow.jobs.preview.with.publication_channel, 'preview');
  assert.equal(workflow.jobs.preview.with.include_full, false);
  assert.equal(workflow.jobs['resume-preview'].uses, './.github/workflows/_release-standard-publish.yml');
  assert.equal(workflow.jobs['resume-preview'].with.operation, 'resume_standard');
  assert.equal(workflow.jobs['resume-preview'].with.publication_channel, 'preview');
  assert.equal(
    workflow.jobs['move-latest-pointer'].uses,
    './.github/workflows/_release-preview-latest-pointer.yml',
  );
  assert.equal(workflow.jobs['move-latest-pointer'].with.target_tag, '${{ needs.admission.outputs.target_tag }}');
  assert.equal(
    pointerWorkflow.on.workflow_call.inputs.target_tag.description,
    'Exact already-published Stable or Preview tag.',
  );
  assert.match(pointerSource, /test "\$quality_status" = preview \|\| test "\$quality_status" = stable/);
  assert.match(pointerSource, /qualification_disclosure\.stable_qualified/);
  assert.match(pointerSource, /non_stable_disclosure_preserved:\(\$quality_status == "preview"\)/);
  assert.match(source, /scripts\/resolve-preview-release-request\.ts/);
  assert.match(source, /scripts\/validate-latest-pointer-operation\.ts/);
  assert.doesNotMatch(source, /release create|release upload|-X PATCH|OPL_HOMEBREW_TAP_TOKEN|ghcr\.io/);
  assert.doesNotMatch(source, /append_full|include_full:\s*true|native-webui|webui-follower/);
});

test('Manual Preview recovery accepts only one failed first-attempt workflow run and its exact typed receipt', () => {
  const source = readWorkflow('release-manual-preview.yml');
  assert.match(source, /\.event == "workflow_dispatch"/);
  assert.match(source, /\.head_branch == "main"/);
  assert.match(source, /\.run_attempt == 1/);
  assert.match(source, /\.conclusion == "failure"/);
  assert.match(source, /\.path == "\.github\/workflows\/release-manual-preview\.yml"/);
  assert.match(source, /framework_reconcile_authorized == true/);
  assert.match(source, /\.resume_source == \{run_id:\$run, artifact:\$artifact\}/);
  assert.match(source, /\.resume_source_run_id == \$run/);
  assert.match(source, /\.resume_source_artifact == \$artifact/);
});

test('Standard publisher keeps Stable qualification separate from protected Preview Latest override', () => {
  const workflow = parseWorkflow('_release-standard-publish.yml');
  const source = readWorkflow('_release-standard-publish.yml');
  const activation = workflow.jobs['activate-latest'];
  const webuiSource = activation.steps.find(
    (step: Record<string, unknown>) => step.name === 'Prepare exact WebUI follower source',
  );
  const homebrewDownloads = activation.steps.filter(
    (step: Record<string, unknown>) => String(step.name ?? '').startsWith('Download Standard Homebrew'),
  );
  const activate = activation.steps.find(
    (step: Record<string, unknown>) => step.name === 'Activate Latest after exact remote parity',
  );
  const run = String(activate?.run ?? '');

  assert.equal(webuiSource.if, "${{ needs.restore.outputs.channel == 'stable' }}");
  assert.deepEqual(
    homebrewDownloads.map((step: Record<string, unknown>) => step.name),
    [
      'Download Standard Homebrew publication receipt',
      'Download Standard Homebrew readback receipt',
    ],
  );
  for (const step of homebrewDownloads) {
    assert.equal(step.if, "${{ needs.restore.outputs.channel == 'stable' }}");
  }
  assert.match(run, /write-latest-pointer-override-authority\.ts/);
  assert.match(run, /--component-manifest latest-component-manifest\.json/);
  assert.match(run, /--latest-override-authority latest-override-authority\.json/);
  assert.match(run, /--publication-channel '\$\{\{ needs\.restore\.outputs\.channel \}\}'/);
  assert.match(run, /persistent_override: false/);
  assert.doesNotMatch(run, /stable_promotion_barrier\.satisfied == true/);
  assert.doesNotMatch(run, /release_bundle_status\.latest_eligible == true/);
  assert.match(run, /if \[ '\$\{\{ needs\.restore\.outputs\.channel \}\}' = stable \]; then/);
  assert.doesNotMatch(
    source,
    /needs\.restore\.outputs\.channel == 'preview' && needs\.homebrew-standard-readback\.result == 'success'/,
  );
});
