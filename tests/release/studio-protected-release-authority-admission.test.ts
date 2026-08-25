import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

import { buildStudioProtectedReleaseAdmission } from '../../scripts/studio-protected-release-admission.ts';
import type { DesktopReleaseCarrier } from '../../scripts/desktop-release-carrier.ts';

const appRoot = path.resolve(import.meta.dirname, '../..');
const releaseContract = JSON.parse(
  fs.readFileSync(path.join(appRoot, 'contracts', 'app-release-channel.json'), 'utf8'),
);
const stableWorkflowSource = fs.readFileSync(
  path.join(appRoot, '.github', 'workflows', 'release-stable.yml'),
  'utf8',
);
const stableWorkflow = parseYaml(stableWorkflowSource);
const studioWorkflow = parseYaml(fs.readFileSync(
  path.join(appRoot, '.github', 'workflows', '_release-studio.yml'),
  'utf8',
));

const studioCarrier: DesktopReleaseCarrier = {
  schema: 'opl_app_desktop_release_carrier_resolution.v1',
  authorityOwner: 'one-person-lab-app',
  frameworkDurableAuthorityRef: 'release_bundle_control_plane.framework_authority',
  carrierId: 'opl-studio',
  ownerRepo: 'gaofeng21cn/opl-studio',
  releaseRole: 'candidate_preview',
  productName: 'One Person Lab Preview',
  bundleId: 'cn.onepersonlab.opl.studio.preview',
  releaseRepository: 'gaofeng21cn/opl-studio',
  packageVersion: '0.1.0',
  artifactNameTemplate: 'one-person-lab-preview-${version}-${os}-${arch}.${ext}',
  commands: {
    install: 'npm ci',
    build_macos: 'npm run dist:mac',
    qualify_distribution: 'npm run qualify:desktop:mac',
    qualify_updater: 'npm run qualify:desktop:updater:local',
    qualify_prepublication: 'node scripts/desktop/macos-distribution.mjs --require-release-trust',
    qualify_public_release: 'node scripts/desktop/macos-distribution.mjs --require-release-trust --require-public-feed',
  },
  toolchain: {
    electron: '43.4.0',
    electron_builder: '26.15.3',
    electron_updater: '6.8.9',
  },
  macos: {
    targets: ['dmg', 'zip'],
    dmg_format: 'ULFO',
    hardened_runtime_required: true,
  },
  updater: {
    provider: 'github',
    metadata: ['latest-mac.yml', 'latest-arm64-mac.yml'],
    compatibility_metadata_byte_identical: true,
  },
  stageOrder: [
    'exact_source_checkout',
    'developer_id_signed_build',
    'apple_notarization',
    'staple_and_gatekeeper_validation',
    'exact_tag_publication',
    'anonymous_public_byte_readback',
    'carrier_release_qualification',
  ],
  manifestPath: '/fixture/contracts/desktop-release-carrier.json',
};

test('App contract keeps Studio candidate-only while defining one protected source admission', () => {
  const successor = releaseContract.successor_delivery_target;
  const admission = successor.protected_release_admission;
  const execution = successor.protected_release_execution;

  assert.equal(successor.active_shell_remains, 'aionui');
  assert.equal(successor.active_release_carrier, false);
  assert.equal(admission.authority_owner, 'one-person-lab-app');
  assert.equal(admission.workflow, '.github/workflows/release-stable.yml');
  assert.equal(admission.entry_selector, 'studio_carrier_admission');
  assert.equal(admission.framework_operation, null);
  assert.equal(admission.environment, 'release-stable');
  assert.equal(admission.repository, 'gaofeng21cn/opl-studio');
  assert.deepEqual(admission.identity_inputs, ['studio_sha', 'studio_tree', 'studio_tag']);
  assert.equal(admission.source_admission_is_release_ready, false);
  assert.equal(admission.active_release_carrier_after_admission, false);
  assert.equal(admission.framework_release_operation_created, false);
  assert.equal(admission.second_release_owner_created, false);
  assert.equal(admission.secret_custody.values_read_or_copied_by_admission, false);
  assert.deepEqual(admission.stage_order, [
    'exact_source_checkout',
    'developer_id_signed_build',
    'apple_notarization',
    'staple_and_gatekeeper_validation',
    'exact_tag_publication',
    'anonymous_public_byte_readback',
    'carrier_release_qualification',
  ]);
  assert.equal(execution.schema, 'opl_studio_protected_release_execution_policy.v2');
  assert.equal(execution.recovery.input, 'prior_studio_artifact_run_id');
  assert.equal(execution.recovery.successful_checkpoint_bytes_are_reused_without_rebuild, true);
  assert.equal(execution.recovery.release_failure_allocates_new_product_version, false);
  assert.equal(execution.serialization.scope, 'github_release_mutation_only');
  assert.equal(execution.serialization.build_or_qualification_holds_publication_mutex, false);
  assert.equal(execution.serialization.public_readback_holds_publication_mutex, false);
});

test('Stable keeps Framework mutation operations closed and admits Studio through a plan-only protected job', () => {
  assert.deepEqual(stableWorkflow.on.workflow_dispatch.inputs.operation.options, [
    'standard',
    'resume_standard',
    'append_full',
  ]);
  assert.deepEqual(stableWorkflow.on.workflow_dispatch.inputs.entry.options, [
    'framework_release',
    'studio_carrier_admission',
  ]);
  const job = stableWorkflow.jobs['studio-protected-release-admission'];
  assert.equal(job.if, "${{ inputs.entry == 'studio_carrier_admission' }}");
  assert.equal(job.environment, 'release-stable');
  assert.deepEqual(job.permissions, { contents: 'read', actions: 'read' });

  const source = job.steps.map((step: Record<string, unknown>) => String(step.run ?? '')).join('\n');
  assert.match(source, /studio-protected-release-admission\.ts plan/);
  assert.match(source, /\.public_mutation_authorized == false/);
  assert.match(source, /\.external_mutation_attempted == false/);
  assert.doesNotMatch(source, /notarytool\s+submit|gh\s+release\s+(?:create|upload|edit|delete)|framework-release-adapter\.ts\s+github-apply/);
  assert.doesNotMatch(source, /\$\{\{\s*inputs\./);
  assert.doesNotMatch(JSON.stringify(job), /secrets\./);
  assert.equal(stableWorkflow.on.workflow_dispatch.inputs.prior_studio_artifact_run_id.type, 'string');
  assert.equal(
    stableWorkflow.jobs['studio-protected-release'].with.prior_studio_artifact_run_id,
    '${{ inputs.prior_studio_artifact_run_id }}',
  );
  assert.deepEqual(stableWorkflow.jobs['studio-protected-release'].permissions, {
    contents: 'read',
    actions: 'read',
  });

  assert.deepEqual(releaseContract.release_bundle_control_plane.live_authority.stable_operations, [
    'standard',
    'resume_standard',
    'append_full',
  ]);
});

test('Studio execution keeps build, qualification, publication, and public readback independently recoverable', () => {
  assert.equal(studioWorkflow.concurrency, undefined);
  assert.deepEqual(Object.keys(studioWorkflow.jobs), [
    'build-signed-notarized',
    'resolve-checkpoint',
    'restore-checkpoint',
    'qualify-checkpoint',
    'publish',
    'public-readback',
  ]);
  const build = studioWorkflow.jobs['build-signed-notarized'];
  const qualify = studioWorkflow.jobs['qualify-checkpoint'];
  const publish = studioWorkflow.jobs.publish;
  const readback = studioWorkflow.jobs['public-readback'];
  assert.equal(build.if, "${{ inputs.prior_studio_artifact_run_id == '' }}");
  assert.equal(build.environment, 'release-stable');
  assert.equal(qualify.environment, undefined);
  assert.deepEqual(publish.concurrency, {
    group: 'opl-studio-publication-global',
    'cancel-in-progress': false,
  });
  assert.equal(publish.environment, 'release-stable');
  assert.deepEqual(publish.permissions, { actions: 'read', contents: 'read' });
  assert.equal(readback.environment, undefined);
  const buildText = JSON.stringify(build);
  const publishText = JSON.stringify(publish);
  const readbackText = JSON.stringify(readback);
  assert.match(buildText, /notarytool submit/);
  assert.doesNotMatch(buildText, /gh release (?:create|upload|edit)/);
  assert.match(publishText, /gh release create/);
  assert.match(publishText, /gh release upload/);
  assert.match(publishText, /GH_TOKEN.*OPL_GITHUB_RELEASE_ADMIN_TOKEN/);
  assert.doesNotMatch(publishText, /notarytool submit|--require-public-feed/);
  assert.match(readbackText, /--require-public-feed/);
  assert.doesNotMatch(readbackText, /OPL_GITHUB_RELEASE_ADMIN_TOKEN|gh release (?:create|upload|edit)/);
});

test('planner binds exact App and Studio identities without authorizing release mutation', () => {
  const receipt = buildStudioProtectedReleaseAdmission({
    app: { commitSha: 'a'.repeat(40), treeSha: 'b'.repeat(40) },
    studio: { commitSha: 'c'.repeat(40), treeSha: 'd'.repeat(40) },
    requestedTag: 'v0.1.0',
    carrier: studioCarrier,
  });

  assert.equal(receipt.status, 'source_admitted_pending_protected_execution');
  assert.equal(receipt.authority.entry_selector, 'studio_carrier_admission');
  assert.equal(receipt.authority.framework_operation, null);
  assert.equal(receipt.source.repository, 'gaofeng21cn/opl-studio');
  assert.equal(receipt.source.commit_sha, 'c'.repeat(40));
  assert.equal(receipt.source.tree_sha, 'd'.repeat(40));
  assert.equal(receipt.source.tag, 'v0.1.0');
  assert.equal(receipt.active_shell_unchanged, true);
  assert.equal(receipt.active_release_carrier, false);
  assert.equal(receipt.release_ready, false);
  assert.equal(receipt.public_mutation_authorized, false);
  assert.equal(receipt.external_mutation_attempted, false);
  assert.deepEqual(receipt.remaining_protected_action.required_sequence, [
    'developer_id_signed_build',
    'apple_notarization',
    'staple_and_gatekeeper_validation',
    'exact_tag_publication',
    'anonymous_public_byte_readback',
    'carrier_release_qualification',
  ]);
});

test('planner fails closed on tag, repository, trust, or qualification drift', () => {
  const base = {
    app: { commitSha: 'a'.repeat(40), treeSha: 'b'.repeat(40) },
    studio: { commitSha: 'c'.repeat(40), treeSha: 'd'.repeat(40) },
    requestedTag: 'v0.1.0',
    carrier: studioCarrier,
  };

  assert.throws(
    () => buildStudioProtectedReleaseAdmission({ ...base, requestedTag: 'v0.2.0' }),
    /must equal package version/,
  );
  assert.throws(
    () => buildStudioProtectedReleaseAdmission({
      ...base,
      carrier: { ...studioCarrier, releaseRepository: 'gaofeng21cn/other' },
    }),
    /dedicated release repository/,
  );
  assert.throws(
    () => buildStudioProtectedReleaseAdmission({
      ...base,
      carrier: { ...studioCarrier, bundleId: 'cn.onepersonlab.opl' },
    }),
    /One Person Lab bundle namespace/,
  );
  assert.throws(
    () => buildStudioProtectedReleaseAdmission({
      ...base,
      carrier: {
        ...studioCarrier,
        commands: { ...studioCarrier.commands, qualify_public_release: 'echo pass' },
      },
    }),
    /must require release trust and the public feed/,
  );
});

test('CLI rejects an observed Studio tree that differs from the protected request', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-studio-release-admission-'));
  const studioRoot = path.join(root, 'studio');
  fs.mkdirSync(studioRoot);
  fs.writeFileSync(path.join(studioRoot, 'package.json'), '{"name":"opl-studio","version":"0.1.0"}\n');
  fs.writeFileSync(path.join(studioRoot, 'electron-builder.yml'), [
    'appId: cn.onepersonlab.opl.studio.preview',
    'productName: One Person Lab Preview',
    'mac:',
    '  hardenedRuntime: true',
    '  target:',
    '    - dmg',
    '    - zip',
    'artifactName: one-person-lab-preview-${version}-${os}-${arch}.${ext}',
    'publish:',
    '  provider: github',
    '  owner: gaofeng21cn',
    '  repo: opl-studio',
    '',
  ].join('\n'));
  for (const args of [
    ['init', '-q'],
    ['config', 'user.email', 'fixture@example.invalid'],
    ['config', 'user.name', 'Fixture'],
    ['add', '.'],
    ['commit', '-qm', 'fixture'],
  ]) {
    const result = spawnSync('git', args, { cwd: studioRoot, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  const studioSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: studioRoot, encoding: 'utf8' }).stdout.trim();
  const output = path.join(root, 'receipt.json');
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    path.join(appRoot, 'scripts', 'studio-protected-release-admission.ts'),
    'plan',
    '--app-root', appRoot,
    '--studio-root', studioRoot,
    '--studio-sha', studioSha,
    '--studio-tree', 'f'.repeat(40),
    '--studio-tag', 'v0.1.0',
    '--output', output,
  ], { cwd: appRoot, encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Studio tree does not match protected request/);
  assert.equal(fs.existsSync(output), false);
  fs.rmSync(root, { recursive: true, force: true });
});
