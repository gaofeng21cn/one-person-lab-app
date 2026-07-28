import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import {
  admitWebuiStablePromotion,
  decideWebuiStablePromotion,
  writeWebuiStablePromotionReceipt,
  type WebuiStableAdmissionInput,
} from '../../scripts/webui-stable-promotion.ts';
import { createWebuiSourceAuthority } from '../../scripts/webui-source-authority.ts';
import {
  isAuthorizedWebuiStablePromotionWriteJob,
  validateWorkflowDispatchWriteAuthority,
} from '../../scripts/validate-release-boundary/text-check-runner.ts';

const appRoot = process.cwd();
const workflowPath = path.join(appRoot, '.github', 'workflows', 'release-webui-stable.yml');
const developmentWorkflowPath = path.join(
  appRoot,
  '.github',
  'workflows',
  'release-webui-development.yml',
);
const developmentPromotionWorkflowPath = path.join(
  appRoot,
  '.github',
  'workflows',
  'release-webui-development-promote.yml',
);
const sourceAppSha = 'a'.repeat(40);
const stableExecutorAppSha = 'e'.repeat(40);
const promotionAppSha = 'd'.repeat(40);
const carrierExecutorAppSha = promotionAppSha;
const shellSha = 'b'.repeat(40);
const frameworkSha = 'c'.repeat(40);
const stableAuthorityRunId = '301';
const carrierFollowerRunId = '302';
const carrierJobId = 501;
const version = '26.7.23';
const bundleDigest = digest('1');
const cohortRef = digest('2');
const imageDigest = digest('3');
const fingerprint = digest('4');
const versionDigest = digest('5');

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function sha256File(filePath: string): string {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function writeJson(root: string, name: string, value: unknown): string {
  const filePath = path.join(root, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function observation(
  ref: string,
  status: 'present' | 'absent' | 'unknown',
  observedDigest: string | null,
  logoutBeforeReadback?: boolean,
) {
  return {
    schema: 'opl_app_webui_descriptor_readback.v1',
    ref,
    status,
    digest: observedDigest,
    ...(logoutBeforeReadback === undefined
      ? {}
      : { logout_before_readback: logoutBeforeReadback }),
  };
}

function carrierReceipt() {
  return {
    schema: 'opl_app_webui_release_carrier.v1',
    release: { version, bundle_digest: bundleDigest, cohort_ref: cohortRef },
    cohort: { app_sha: sourceAppSha, shell_sha: shellSha, framework_sha: frameworkSha },
    carrier: {
      carrier_id: 'docker_webui',
      carrier_kind: 'oci_image',
      package_profile: 'webui-full',
      ref: `ghcr.io/gaofeng21cn/one-person-lab-webui@${imageDigest}`,
      digest: imageDigest,
      size_bytes: 123456,
      content_fingerprint: fingerprint,
      os: 'linux',
      architecture: 'amd64',
    },
    qualification: {
      status: 'passed',
      image_digest: imageDigest,
      content_fingerprint: fingerprint,
    },
  };
}

function stableAuthorityRun() {
  return {
    id: Number(stableAuthorityRunId),
    repository: { full_name: 'gaofeng21cn/one-person-lab-app' },
    head_repository: { full_name: 'gaofeng21cn/one-person-lab-app' },
    path: '.github/workflows/release-stable.yml',
    event: 'workflow_dispatch',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    head_sha: stableExecutorAppSha,
  };
}

function carrierFollowerRun(status: 'in_progress' | 'completed' = 'in_progress') {
  return {
    id: Number(carrierFollowerRunId),
    repository: { full_name: 'gaofeng21cn/one-person-lab-app' },
    head_repository: { full_name: 'gaofeng21cn/one-person-lab-app' },
    path: '.github/workflows/release-webui-follower.yml',
    event: 'workflow_run',
    head_branch: 'main',
    status,
    conclusion: status === 'completed' ? 'success' : null,
    run_attempt: 1,
    head_sha: promotionAppSha,
  };
}

function promotionExecutorRun(
  runId = carrierFollowerRunId,
  appSha = promotionAppSha,
  workflow = '.github/workflows/release-webui-follower.yml',
) {
  return {
    id: Number(runId),
    repository: { full_name: 'gaofeng21cn/one-person-lab-app' },
    head_repository: { full_name: 'gaofeng21cn/one-person-lab-app' },
    path: workflow,
    event: workflow.endsWith('release-webui-follower.yml') ? 'workflow_run' : 'workflow_dispatch',
    head_branch: 'main',
    status: 'in_progress',
    conclusion: null,
    run_attempt: 1,
    head_sha: appSha,
  };
}

function carrierFollowerJob() {
  return {
    id: carrierJobId,
    run_id: Number(carrierFollowerRunId),
    run_url: `https://api.github.com/repos/gaofeng21cn/one-person-lab-app/actions/runs/${carrierFollowerRunId}`,
    name: 'webui-carrier / publish-immutable-carrier',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    head_sha: promotionAppSha,
  };
}

function fixture(status: 'in_progress' | 'completed' = 'in_progress') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-stable-'));
  const carrier = carrierReceipt();
  const immutableRef = carrier.carrier.ref;
  const versionRef = `ghcr.io/gaofeng21cn/one-person-lab-webui:${version}`;
  const stableRef = 'ghcr.io/gaofeng21cn/one-person-lab-webui:stable';
  const latestRef = 'ghcr.io/gaofeng21cn/one-person-lab-webui:latest';
  const immutable = observation(immutableRef, 'present', imageDigest);
  const versionReadback = {
    ...observation(versionRef, 'present', versionDigest),
    child_digest: imageDigest,
    manifest_count: 1,
    media_type: 'application/vnd.oci.image.index.v1+json',
  };
  const stablePrestate = observation(stableRef, 'present', digest('f'));
  const latestPrestate = observation(latestRef, 'present', digest('f'));
  const paths = {
    stableAuthorityRun: writeJson(root, 'stable-authority-run.json', stableAuthorityRun()),
    carrierFollowerRun: writeJson(root, 'carrier-follower-run.json', carrierFollowerRun(status)),
    carrierFollowerJob: writeJson(root, 'carrier-follower-job.json', carrierFollowerJob()),
    promotionExecutorRun: writeJson(
      root,
      'promotion-executor-run.json',
      promotionExecutorRun(),
    ),
    carrier: writeJson(root, 'carrier.json', carrier),
    immutable: writeJson(root, 'immutable.json', immutable),
    version: writeJson(root, 'version.json', versionReadback),
    stablePrestate: writeJson(root, 'stable-prestate.json', stablePrestate),
    latestPrestate: writeJson(root, 'latest-prestate.json', latestPrestate),
  };
  const input: WebuiStableAdmissionInput = {
    stableAuthorityRun: stableAuthorityRun(),
    stableAuthorityRunPath: paths.stableAuthorityRun,
    stableAuthorityRunId,
    triggeredByStableRunId: stableAuthorityRunId,
    carrierFollowerRun: carrierFollowerRun(status),
    carrierFollowerRunPath: paths.carrierFollowerRun,
    carrierFollowerRunId,
    carrierFollowerJob: carrierFollowerJob(),
    carrierFollowerJobPath: paths.carrierFollowerJob,
    carrierExecutorAppSha,
    promotionExecutorRun: promotionExecutorRun(),
    promotionExecutorRunPath: paths.promotionExecutorRun,
    promotionExecutorRunId: carrierFollowerRunId,
    promotionAppSha,
    carrierReceipt: carrier,
    carrierReceiptPath: paths.carrier,
    immutableReadback: immutable,
    immutableReadbackPath: paths.immutable,
    versionReadback,
    versionReadbackPath: paths.version,
    stablePrestate,
    stablePrestatePath: paths.stablePrestate,
    latestPrestate,
    latestPrestatePath: paths.latestPrestate,
  };
  return { root, paths, input };
}

function independentPreviewFixture() {
  const current = fixture('completed');
  const previewVersion = '26.7.28-preview.r1';
  const sourceAuthority = createWebuiSourceAuthority({
    version: previewVersion,
    appSha: sourceAppSha,
    shellSha,
    frameworkSha,
    runId: carrierFollowerRunId,
    executorSha: carrierExecutorAppSha,
  });
  current.input.authorityMode = 'independent_preview';
  current.input.stableAuthorityRun = undefined;
  current.input.stableAuthorityRunPath = undefined;
  current.input.stableAuthorityRunId = undefined;
  current.input.triggeredByStableRunId = undefined;
  current.input.carrierFollowerRun = {
    ...current.input.carrierFollowerRun,
    path: '.github/workflows/release-webui-development.yml',
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
  };
  current.input.carrierReceipt = {
    ...current.input.carrierReceipt,
    release: {
      ...current.input.carrierReceipt.release,
      version: previewVersion,
      bundle_digest: sourceAuthority.source_authority_digest,
      cohort_ref: sourceAuthority.source_authority_digest,
    },
  };
  current.input.versionReadback = {
    ...current.input.versionReadback,
    ref: `ghcr.io/gaofeng21cn/one-person-lab-webui:${previewVersion}`,
  };
  current.input.promotionExecutorRunId = '303';
  current.input.promotionAppSha = 'f'.repeat(40);
  current.input.promotionExecutorRun = promotionExecutorRun(
    current.input.promotionExecutorRunId,
    current.input.promotionAppSha,
    '.github/workflows/release-webui-development-promote.yml',
  );
  current.input.sourceAuthority = sourceAuthority;
  current.paths.carrierFollowerRun = writeJson(
    current.root,
    'carrier-follower-run.json',
    current.input.carrierFollowerRun,
  );
  current.paths.carrier = writeJson(current.root, 'carrier.json', current.input.carrierReceipt);
  current.paths.version = writeJson(current.root, 'version.json', current.input.versionReadback);
  current.paths.promotionExecutorRun = writeJson(
    current.root,
    'promotion-executor-run.json',
    current.input.promotionExecutorRun,
  );
  const sourceAuthorityPath = writeJson(current.root, 'source-authority.json', sourceAuthority);
  current.input.carrierFollowerRunPath = current.paths.carrierFollowerRun;
  current.input.carrierReceiptPath = current.paths.carrier;
  current.input.versionReadbackPath = current.paths.version;
  current.input.promotionExecutorRunPath = current.paths.promotionExecutorRun;
  current.input.sourceAuthorityPath = sourceAuthorityPath;
  return { ...current, sourceAuthorityPath };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test('contract separates Stable qualification from carrier Latest selection', () => {
  const document = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts', 'app-release-channel.json'), 'utf8'),
  );
  const latestPolicy = document.distribution_semantics.latest_policy;
  const contract = document.webui_ghcr_image;
  const promotion = contract.stable_promotion;

  assert.equal(latestPolicy.default_behavior, 'each_carrier_advances_its_own_latest_pointer_when_that_carrier_publishes_a_new_qualified_stable');
  assert.deepEqual(latestPolicy.explicit_user_override.quality_statuses, ['stable', 'preview']);
  assert.equal(latestPolicy.move_latest_pointer.stable_or_preview_candidate_allowed, true);
  assert.equal(contract.stable_promotion_requires.applies_to, 'production_follower_only');
  assert.deepEqual(contract.stable_promotion_requires.requires, [
    'successful_stable_authority_run_after_latest_activation',
    'workflow_run_follower_bound_to_that_stable_authority',
    'unique_successful_carrier_follower_job',
    'qualified_webui_carrier_receipt',
    'immutable_version_digest',
  ]);
  assert.equal(promotion.schema, 'opl_app_webui_stable_promotion_contract.v5');
  assert.equal(promotion.writer_scope, 'single_ghcr_alias_writer_for_stable_and_latest');
  assert.deepEqual(promotion.task_modes.production_release.promotion_tags, ['stable', 'latest']);
  assert.equal(promotion.task_modes.production_release.desktop_latest_required, true);

  const independent = promotion.task_modes.independent_preview;
  assert.equal(independent.desktop_stable_required, false);
  assert.equal(independent.desktop_latest_required, false);
  assert.equal(independent.immutable_publication_required, true);
  assert.equal(independent.publication_does_not_move_stable_or_latest, true);
  assert.equal(independent.promotion_requires_explicit_user_dispatch, true);
  assert.deepEqual(independent.promotion_tags, ['latest']);
  assert.equal(independent.stable_alias_mutation_allowed, false);
  assert.equal(independent.stable_prestate_must_remain_unchanged, true);
  assert.deepEqual(independent.publication_entry_inputs, [
    'version',
    'app_ref',
    'shell_ref',
    'framework_ref',
  ]);
  assert.deepEqual(independent.promotion_entry_inputs, [
    'carrier_follower_run_id',
    'carrier_executor_ref',
    'carrier_artifact_name',
  ]);
  assert.equal(independent.source_authority_schema, 'opl_app_webui_source_authority.v1');
  assert.equal(independent.source_authority_digest_must_equal_carrier_release_bundle_and_cohort_ref, true);
  assert.equal(independent.stable_run_dependency, false);
  assert.equal(independent.desktop_latest_dependency, false);
  assert.equal(independent.promotion_protected_environment, 'release-preview-publication');
  assert.deepEqual(
    promotion.compare_and_swap.promotion_tags_by_authority_mode.independent_preview,
    ['latest'],
  );
  assert.equal(
    promotion.compare_and_swap.mutation_command_by_authority_mode.independent_preview,
    'oras tag <repository>@<target_digest> latest',
  );
  assert.equal(promotion.compare_and_swap.independent_preview_requires_stable_prestate_unchanged, true);
  assert.equal(
    promotion.ordering.independent_preview_may_publish_and_move_webui_latest_without_desktop_stable_or_desktop_latest,
    true,
  );
  assert.equal(promotion.ordering.independent_preview_immutable_publication_precedes_explicit_latest_only_promotion, true);
  assert.equal(promotion.ordering.independent_preview_never_moves_webui_stable, true);
  assert.equal(promotion.admission_schema, 'opl_app_webui_stable_promotion_admission.v5');
  assert.equal(promotion.decision_schema, 'opl_app_webui_stable_promotion_decision.v2');
  assert.equal(promotion.receipt_schema, 'opl_app_webui_stable_promotion_receipt.v5');
});

test('shared alias writer binds production Stable and independent Preview authority modes', () => {
  const source = fs.readFileSync(workflowPath, 'utf8');
  const workflow = YAML.parse(source);
  assert.deepEqual(Object.keys(workflow.on), ['workflow_call']);
  assert.deepEqual(Object.keys(workflow.on.workflow_call.inputs), [
    'mode',
    'authority_mode',
    'stable_authority_run_id',
    'carrier_follower_run_id',
    'carrier_executor_ref',
    'carrier_artifact_name',
  ]);
  assert.equal(
    workflow.concurrency.group,
    "${{ inputs.mode == 'execute' && 'opl-webui-stable-promotion-global' || format('opl-webui-stable-canary-{0}', github.ref) }}",
  );
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  const writers = Object.entries(workflow.jobs).filter(
    ([, job]: [string, any]) => job.permissions?.packages === 'write',
  );
  assert.equal(writers.length, 1);
  assert.equal(writers[0]![0], 'promote-webui-stable');
  assert.equal((writers[0]![1] as any).needs, 'admission');
  assert.equal(
    (writers[0]![1] as any).environment,
    "${{ needs.admission.outputs.authority_mode == 'independent_preview' && 'release-preview-publication' || 'release-stable' }}",
  );
  assert.equal(workflow.jobs.admission.permissions.packages, undefined);
  assert.equal(workflow.jobs['promote-webui-stable'].permissions.actions, 'read');
  assert.equal(workflow.jobs['promote-webui-stable'].permissions.contents, 'read');
  assert.equal((source.match(/\boras tag\b/g) ?? []).length, 1);
  assert.match(source, /oras tag "\$target_ref" "\$\{promotion_tags\[@\]\}"/);
  assert.match(source, /test "\$\{promotion_tags\[\*\]\}" = "stable latest"/);
  assert.match(source, /test "\$\{promotion_tags\[\*\]\}" = latest/);
  assert.doesNotMatch(source, /framework_candidate_run_id|framework_latest_stable_run_id/);
  assert.doesNotMatch(source, /inputs\.source_app_run_id|^\s+workflow_dispatch:/m);
  assert.doesNotMatch(source, /homebrew|github-latest|releases\/latest/i);
  assert.doesNotMatch(source, /gh workflow run|gh run rerun|gh run cancel|--force|secrets:\s*inherit/);
  assert.match(source, /test "\$GITHUB_RUN_ATTEMPT" = 1/);
  assert.match(source, /test "\$GITHUB_REF" = refs\/heads\/main/);
  assert.match(source, /STABLE_AUTHORITY_RUN_ID: \$\{\{ inputs\.stable_authority_run_id \}\}/);
  assert.match(
    source,
    /TRIGGERED_BY_STABLE_RUN_ID: \$\{\{ inputs\.authority_mode == 'production_follower' && github\.event\.workflow_run\.id \|\| inputs\.stable_authority_run_id \}\}/,
  );
  assert.match(
    source,
    /CARRIER_FOLLOWER_RUN_ID: \$\{\{ inputs\.carrier_follower_run_id \|\| github\.run_id \}\}/,
  );
  assert.match(
    source,
    /CARRIER_EXECUTOR_REF: \$\{\{ inputs\.carrier_executor_ref \|\| github\.sha \}\}/,
  );
  assert.doesNotMatch(source, /inputs\.carrier_run_id/);
  assert.match(source, /carrier-follower-jobs\.json/);
  assert.match(source, /carrier-follower-job\.json/);
  assert.match(source, /Materialize and verify independent source authority/);
  assert.match(source, /admission_args\+=\(--source-authority evidence\/source-authority\.json\)/);
  assert.match(source, /in_progress.*completed/);
  assert.match(source, /version-manifest\.json/);
  assert.match(source, /child_digest/);
  assert.match(source, /public-oci-readback\.json/);
  assert.match(source, /oras blob fetch --descriptor/);
  assert.match(source, /layer-descriptors\.json/);
  assert.match(source, /version_and_latest_identical_bytes:true/);
  assert.match(source, /config_descriptor_verified:true/);
  assert.match(source, /carrier_artifact="\$CARRIER_ARTIFACT_NAME"/);
  assert.doesNotMatch(source, /basename "\$\(dirname "\$carrier_source"\)"/);
});

test('independent Preview dispatch publishes an immutable carrier without moving either alias', () => {
  const source = fs.readFileSync(developmentWorkflowPath, 'utf8');
  const workflow = YAML.parse(source);
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), [
    'version',
    'app_ref',
    'shell_ref',
    'framework_ref',
  ]);
  for (const input of ['version', 'app_ref', 'shell_ref', 'framework_ref']) {
    assert.equal(workflow.on.workflow_dispatch.inputs[input].required, true);
    assert.equal(workflow.on.workflow_dispatch.inputs[input].type, 'string');
  }
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(workflow.permissions.actions, 'read');
  assert.equal(workflow.concurrency.group, 'opl-webui-independent-preview-publication-global');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.deepEqual(Object.keys(workflow.jobs), ['source-authority', 'webui-carrier']);
  assert.equal(workflow.jobs['webui-carrier'].needs, 'source-authority');
  assert.equal(workflow.jobs['webui-carrier'].with.authority_mode, 'independent_preview');
  assert.equal(workflow.jobs['webui-carrier'].with.release_bundle_digest, '${{ needs.source-authority.outputs.source_authority_digest }}');
  assert.equal(workflow.jobs['webui-carrier'].with.release_cohort_ref, '${{ needs.source-authority.outputs.source_authority_digest }}');
  assert.match(source, /webui-source-authority\.ts[\s\\]+create/);
  assert.match(source, /webui-source-authority\.ts[\s\\]+validate/);
  assert.match(source, /source_authority_artifact_name/);
  assert.match(source, /test "\$GITHUB_RUN_ATTEMPT" = 1/);
  assert.match(source, /test "\$GITHUB_REF" = refs\/heads\/main/);
  assert.doesNotMatch(source, /release-bundle\.json|resolve-frozen-bundle|promote-webui-stable/);
  assert.doesNotMatch(source, /releases\/latest|github-latest|homebrew/i);
  assert.doesNotMatch(source, /gh workflow run|gh run rerun|gh run cancel|--force/);
});

test('independent Preview Latest dispatch reuses one exact immutable carrier without a rebuild lane', () => {
  const source = fs.readFileSync(developmentPromotionWorkflowPath, 'utf8');
  const workflow = YAML.parse(source);
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), [
    'carrier_follower_run_id',
    'carrier_executor_ref',
    'carrier_artifact_name',
  ]);
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(workflow.permissions.actions, 'read');
  assert.equal(workflow.concurrency.group, 'opl-webui-independent-preview-latest-global');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.deepEqual(Object.keys(workflow.jobs), ['promote-webui-latest']);
  const promotion = workflow.jobs['promote-webui-latest'];
  assert.equal(promotion.uses, './.github/workflows/release-webui-stable.yml');
  assert.equal(promotion.with.mode, 'execute');
  assert.equal(promotion.with.authority_mode, 'independent_preview');
  assert.deepEqual(promotion.permissions, {
    contents: 'read',
    actions: 'read',
    packages: 'write',
  });
  assert.equal(promotion.steps, undefined);
  assert.equal(promotion.with.stable_authority_run_id, undefined);
  assert.doesNotMatch(source, /_release-webui-carrier|build-and-qualify|publish-immutable-carrier/);
  assert.doesNotMatch(source, /gh workflow run|gh run rerun|gh run cancel|--force/);
});

test('write authority is closed to the exact protected promotion job and exact action pins', () => {
  const workflow = YAML.parse(fs.readFileSync(workflowPath, 'utf8'));
  const job = workflow.jobs['promote-webui-stable'];
  assert.equal(
    isAuthorizedWebuiStablePromotionWriteJob(
      '.github/workflows/release-webui-stable.yml',
      'promote-webui-stable',
      job,
    ),
    true,
  );
  assert.equal(validateWorkflowDispatchWriteAuthority(appRoot), 0);
  const rejected: Array<[string, string, Record<string, unknown>]> = [
    ['.github/workflows/release-stable.yml', 'promote-webui-stable', job],
    ['.github/workflows/release-webui-stable.yml', 'publish', job],
    [
      '.github/workflows/release-webui-stable.yml',
      'promote-webui-stable',
      { ...job, needs: ['admission', 'other'] },
    ],
    [
      '.github/workflows/release-webui-stable.yml',
      'promote-webui-stable',
      { ...job, environment: 'release-webui' },
    ],
    [
      '.github/workflows/release-webui-stable.yml',
      'promote-webui-stable',
      { ...job, permissions: { ...job.permissions, issues: 'write' } },
    ],
  ];
  for (const [candidateWorkflow, candidateJob, candidate] of rejected) {
    assert.equal(
      isAuthorizedWebuiStablePromotionWriteJob(candidateWorkflow, candidateJob, candidate),
      false,
    );
  }
});

test('workflow reads exact source and carrier evidence before the protected alias CAS', () => {
  const source = fs.readFileSync(workflowPath, 'utf8');
  const ordered = [
    'Reject noncanonical or partial promotion runs',
    'Download exact App WebUI carrier artifact',
    'Materialize exactly one carrier receipt from the exact follower run',
    'Materialize and verify independent source authority',
    'Read immutable, version, Stable, and Latest authority',
    'Seal one immutable WebUI Stable admission',
    'Re-read Stable and Latest prestate and derive CAS decision',
    'Execute at most one admitted WebUI tag mutation and reconcile read-only',
    'Write terminal WebUI Stable receipt',
    'Upload terminal WebUI Stable evidence',
  ].map((entry) => source.indexOf(entry));
  assert.ok(ordered.every((index) => index >= 0));
  assert.deepEqual([...ordered].sort((left, right) => left - right), ordered);
  for (const relativePath of [
    '.github/workflows/_release-webui-carrier.yml',
    '.github/workflows/_release-standard-publish.yml',
  ]) {
    const existing = fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
    assert.doesNotMatch(existing, /\boras tag\b.*one-person-lab-webui|\bone-person-lab-webui:stable\b/);
  }
});

test('admission binds Stable authority, carrier follower, and promotion executor separately', () => {
  for (const status of ['in_progress', 'completed'] as const) {
    const current = fixture(status);
    const admission = admitWebuiStablePromotion(current.input);
    assert.equal(admission.status, 'passed');
    assert.equal(admission.authority_mode, 'production_follower');
    assert.equal(admission.stable_authority.run_id, stableAuthorityRunId);
    assert.equal(admission.stable_authority.app_head_sha, stableExecutorAppSha);
    assert.equal(admission.carrier_follower.run_id, carrierFollowerRunId);
    assert.equal(admission.carrier_follower.carrier_job_id, carrierJobId);
    assert.equal(admission.carrier_follower.app_head_sha, carrierExecutorAppSha);
    assert.equal(
      admission.carrier_follower.triggering_stable_authority_run_id,
      stableAuthorityRunId,
    );
    assert.equal(admission.promotion_executor.run_id, carrierFollowerRunId);
    assert.equal(admission.promotion_executor.app_head_sha, promotionAppSha);
    assert.equal(admission.target.digest, versionDigest);
    assert.equal(admission.target.child_digest, imageDigest);
    assert.equal(admission.expected_prestate.stable.digest, digest('f'));
    assert.equal(admission.expected_prestate.latest.digest, digest('f'));
    assert.equal(admission.framework, undefined);
    assert.equal(admission.evidence.carrier_receipt_sha256, sha256File(current.paths.carrier));
  }
});

test('development admission accepts only the exact failed Stable Bundle source and dispatch executor', () => {
  const current = fixture('in_progress');
  current.input.authorityMode = 'development_validation';
  current.input.stableAuthorityRun.conclusion = 'failure';
  current.input.stableAuthorityRun.head_sha = sourceAppSha;
  current.input.carrierFollowerRun.path = '.github/workflows/release-webui-development.yml';
  current.input.carrierFollowerRun.event = 'workflow_dispatch';
  current.input.promotionExecutorRun.path = '.github/workflows/release-webui-development.yml';
  current.input.promotionExecutorRun.event = 'workflow_dispatch';
  const admission = admitWebuiStablePromotion(current.input);
  assert.equal(admission.authority_mode, 'development_validation');
  assert.equal(admission.stable_authority.conclusion, 'failure');
  assert.equal(
    admission.promotion_executor.caller_workflow,
    '.github/workflows/release-webui-development.yml',
  );

  const drift = clone(current.input);
  drift.stableAuthorityRun.head_sha = stableExecutorAppSha;
  assert.throws(() => admitWebuiStablePromotion(drift), /Stable authority run.head_sha/);
});

test('independent Preview admission needs no Desktop Stable and binds a separate promotion run', () => {
  const current = independentPreviewFixture();
  const admission = admitWebuiStablePromotion(current.input);
  assert.equal(admission.authority_mode, 'independent_preview');
  assert.equal(admission.stable_authority, null);
  assert.equal(admission.source_authority.release.version, '26.7.28-preview.r1');
  assert.equal(
    admission.source_authority.source_authority_digest,
    current.input.carrierReceipt.release.bundle_digest,
  );
  assert.equal(admission.carrier_follower.run_id, carrierFollowerRunId);
  assert.equal(admission.carrier_follower.app_head_sha, carrierExecutorAppSha);
  assert.equal(admission.carrier_follower.triggering_stable_authority_run_id, null);
  assert.equal(admission.promotion_executor.run_id, '303');
  assert.equal(admission.promotion_executor.app_head_sha, 'f'.repeat(40));
  assert.equal(
    admission.promotion_executor.caller_workflow,
    '.github/workflows/release-webui-development-promote.yml',
  );
  assert.deepEqual(admission.target.promotion_tags, ['latest']);
  assert.equal(admission.classification.quality_status, 'preview');
  assert.equal(admission.evidence.stable_authority_run_readback_sha256, null);
  assert.equal(
    admission.evidence.source_authority_sha256,
    sha256File(current.sourceAuthorityPath),
  );
});

test('independent Preview admission rejects source drift, incomplete publication, or implicit promotion', () => {
  const sourceDigestDrift = independentPreviewFixture();
  sourceDigestDrift.input.carrierReceipt.release.bundle_digest = digest('0');
  assert.throws(
    () => admitWebuiStablePromotion(sourceDigestDrift.input),
    /source authority digest and carrier release\.bundle_digest/,
  );

  const sourceRefDrift = independentPreviewFixture();
  const mismatchedAuthority = createWebuiSourceAuthority({
    version: sourceRefDrift.input.carrierReceipt.release.version,
    appSha: sourceAppSha,
    shellSha: 'e'.repeat(40),
    frameworkSha,
    runId: carrierFollowerRunId,
    executorSha: carrierExecutorAppSha,
  });
  sourceRefDrift.input.sourceAuthority = mismatchedAuthority;
  sourceRefDrift.input.carrierReceipt.release.bundle_digest = mismatchedAuthority.source_authority_digest;
  sourceRefDrift.input.carrierReceipt.release.cohort_ref = mismatchedAuthority.source_authority_digest;
  assert.throws(
    () => admitWebuiStablePromotion(sourceRefDrift.input),
    /source authority Shell SHA/,
  );

  const incomplete = independentPreviewFixture();
  incomplete.input.carrierFollowerRun.status = 'in_progress';
  incomplete.input.carrierFollowerRun.conclusion = null;
  assert.throws(
    () => admitWebuiStablePromotion(incomplete.input),
    /independent Preview carrier run\.status/,
  );

  const implicit = independentPreviewFixture();
  implicit.input.promotionExecutorRunId = carrierFollowerRunId;
  implicit.input.promotionExecutorRun.id = Number(carrierFollowerRunId);
  assert.throws(
    () => admitWebuiStablePromotion(implicit.input),
    /cannot also execute a Latest promotion/,
  );
});

test('admission rejects stale or ambiguous source and carrier authority', () => {
  const cases: Array<[string, (input: WebuiStableAdmissionInput) => void, RegExp]> = [
    ['Stable conclusion', (input) => { input.stableAuthorityRun.conclusion = 'failure'; }, /Stable authority run.conclusion/],
    ['Stable attempt', (input) => { input.stableAuthorityRun.run_attempt = 2; }, /Stable authority run.run_attempt/],
    ['trigger mismatch', (input) => { input.triggeredByStableRunId = '999'; }, /triggering Stable authority run id/],
    ['follower status', (input) => { input.carrierFollowerRun.status = 'queued'; }, /in_progress or completed/],
    ['follower job name', (input) => { input.carrierFollowerJob.name = 'webui-carrier / desktop'; }, /carrier follower job.name/],
    ['follower job attempt', (input) => { input.carrierFollowerJob.run_attempt = 2; }, /carrier follower job.run_attempt/],
    ['carrier digest', (input) => { input.carrierReceipt.carrier.digest = digest('0'); }, /carrier receipt.carrier.ref/],
    ['version child digest', (input) => {
      input.versionReadback.child_digest = digest('0');
    }, /version readback.child_digest/],
    ['prestate unknown', (input) => {
      input.stablePrestate.status = 'unknown';
      input.stablePrestate.digest = null;
    }, /prestate is unknown/],
    ['Latest prestate unknown', (input) => {
      input.latestPrestate.status = 'unknown';
      input.latestPrestate.digest = null;
    }, /prestate is unknown/],
  ];
  for (const [label, mutate, error] of cases) {
    const current = fixture();
    const input = clone(current.input);
    mutate(input);
    assert.throws(() => admitWebuiStablePromotion(input), error, label);
  }
});

test('CAS decision table permits target idempotence or frozen predecessor to target only', () => {
  const current = fixture();
  const admission = admitWebuiStablePromotion(current.input);
  const stableRef = admission.target.stable_ref;
  const latestRef = admission.target.latest_ref;
  const states: Array<[
    ReturnType<typeof observation>,
    ReturnType<typeof observation>,
    string,
    number,
  ]> = [
    [
      observation(stableRef, 'present', versionDigest),
      observation(latestRef, 'present', versionDigest),
      'idempotent',
      0,
    ],
    [
      observation(stableRef, 'present', digest('f')),
      observation(latestRef, 'present', digest('f')),
      'write_once',
      1,
    ],
    [
      observation(stableRef, 'present', digest('0')),
      observation(latestRef, 'present', digest('0')),
      'conflict',
      0,
    ],
    [
      observation(stableRef, 'absent', null),
      observation(latestRef, 'absent', null),
      'conflict',
      0,
    ],
    [
      observation(stableRef, 'present', digest('f')),
      observation(latestRef, 'present', digest('0')),
      'conflict',
      0,
    ],
    [
      observation(stableRef, 'unknown', null),
      observation(latestRef, 'present', digest('f')),
      'prestate_unknown',
      0,
    ],
  ];
  for (const [stableState, latestState, decision, attempts] of states) {
    const result = decideWebuiStablePromotion(admission, stableState, latestState);
    assert.equal(result.decision, decision);
    assert.equal(result.authorized_tag_attempts, attempts);
  }
});

test('definitive Stable/Latest drift may reconcile only through the same qualified gate', () => {
  const current = fixture();
  current.input.latestPrestate.digest = digest('0');
  writeJson(current.root, 'latest-prestate.json', current.input.latestPrestate);
  const admission = admitWebuiStablePromotion(current.input);
  assert.equal(admission.expected_prestate.aliases_aligned, false);
  const decision = decideWebuiStablePromotion(
    admission,
    observation(admission.target.stable_ref, 'present', digest('f')),
    observation(admission.target.latest_ref, 'present', digest('0')),
  );
  assert.equal(decision.decision, 'write_once');
  assert.equal(decision.authorized_tag_attempts, 1);
});

test('development CAS advances Latest only while freezing the Stable prestate', () => {
  const current = fixture('in_progress');
  current.input.authorityMode = 'development_validation';
  current.input.stableAuthorityRun.conclusion = 'failure';
  current.input.stableAuthorityRun.head_sha = sourceAppSha;
  current.input.carrierFollowerRun.path = '.github/workflows/release-webui-development.yml';
  current.input.carrierFollowerRun.event = 'workflow_dispatch';
  current.input.promotionExecutorRun.path = '.github/workflows/release-webui-development.yml';
  current.input.promotionExecutorRun.event = 'workflow_dispatch';
  const admission = admitWebuiStablePromotion(current.input);
  const stableRef = admission.target.stable_ref;
  const latestRef = admission.target.latest_ref;

  assert.deepEqual(admission.target.promotion_tags, ['latest']);
  assert.deepEqual(admission.classification, {
    quality_status: 'preview',
    build_trigger: 'manual',
    preview_kind: 'dev',
    quality_unchanged: true,
    non_stable_notice: true,
  });
  assert.equal(decideWebuiStablePromotion(
    admission,
    observation(stableRef, 'present', digest('f')),
    observation(latestRef, 'present', digest('f')),
  ).decision, 'write_once');
  assert.equal(decideWebuiStablePromotion(
    admission,
    observation(stableRef, 'present', digest('f')),
    observation(latestRef, 'present', versionDigest),
  ).decision, 'idempotent');
  assert.equal(decideWebuiStablePromotion(
    admission,
    observation(stableRef, 'present', digest('0')),
    observation(latestRef, 'present', digest('f')),
  ).decision, 'conflict');
});

test('terminal receipt closes complete, reconciled, unknown, idempotent, rejected, and bounded outcomes', () => {
  const current = fixture();
  const admission = admitWebuiStablePromotion(current.input);
  const stableRef = admission.target.stable_ref;
  const latestRef = admission.target.latest_ref;
  const writeDecision = decideWebuiStablePromotion(
    admission,
    observation(stableRef, 'present', digest('f')),
    observation(latestRef, 'present', digest('f')),
  );
  const targetObservation = observation(stableRef, 'present', versionDigest);
  const latestTargetObservation = observation(latestRef, 'present', versionDigest);
  const targetAnonymous = observation(stableRef, 'present', versionDigest, true);
  const latestTargetAnonymous = observation(latestRef, 'present', versionDigest, true);
  const accepted = {
    schema: 'opl_app_webui_stable_mutation_attempt.v1',
    status: 'accepted',
    attempt_count: 1,
    attempt_id: 'attempt-1',
  };
  const unknown = { ...accepted, status: 'unknown' };
  const targetReadbacks = {
    schema: 'opl_app_webui_stable_reconcile_readbacks.v1',
    observations: [targetObservation],
  };
  const latestTargetReadbacks = {
    schema: 'opl_app_webui_stable_reconcile_readbacks.v1',
    observations: [latestTargetObservation],
  };
  assert.equal(writeWebuiStablePromotionReceipt({
    admission,
    decision: writeDecision,
    mutation: accepted,
    readbacks: targetReadbacks,
    latestReadbacks: latestTargetReadbacks,
    anonymousReadback: targetAnonymous,
    latestAnonymousReadback: latestTargetAnonymous,
  }).status, 'complete');
  assert.equal(writeWebuiStablePromotionReceipt({
    admission,
    decision: writeDecision,
    mutation: unknown,
    readbacks: targetReadbacks,
    latestReadbacks: latestTargetReadbacks,
    anonymousReadback: targetAnonymous,
    latestAnonymousReadback: latestTargetAnonymous,
  }).status, 'reconciled_complete');
  assert.equal(writeWebuiStablePromotionReceipt({
    admission,
    decision: writeDecision,
    mutation: unknown,
    readbacks: {
      schema: 'opl_app_webui_stable_reconcile_readbacks.v1',
      observations: [observation(stableRef, 'unknown', null)],
    },
    latestReadbacks: {
      schema: 'opl_app_webui_stable_reconcile_readbacks.v1',
      observations: [observation(latestRef, 'unknown', null)],
    },
    anonymousReadback: observation(stableRef, 'unknown', null, true),
    latestAnonymousReadback: observation(latestRef, 'unknown', null, true),
  }).status, 'outcome_unknown');
  const idempotent = decideWebuiStablePromotion(
    admission,
    observation(stableRef, 'present', versionDigest),
    observation(latestRef, 'present', versionDigest),
  );
  assert.equal(writeWebuiStablePromotionReceipt({
    admission,
    decision: idempotent,
    mutation: { status: 'not_attempted', attempt_count: 0 },
    readbacks: { schema: 'opl_app_webui_stable_reconcile_readbacks.v1', observations: [] },
    latestReadbacks: {
      schema: 'opl_app_webui_stable_reconcile_readbacks.v1',
      observations: [],
    },
    anonymousReadback: targetAnonymous,
    latestAnonymousReadback: latestTargetAnonymous,
  }).status, 'idempotent');
  const conflict = decideWebuiStablePromotion(
    admission,
    observation(stableRef, 'present', digest('0')),
    observation(latestRef, 'present', digest('0')),
  );
  assert.equal(writeWebuiStablePromotionReceipt({
    admission,
    decision: conflict,
    mutation: { status: 'not_attempted', attempt_count: 0 },
    readbacks: { schema: 'opl_app_webui_stable_reconcile_readbacks.v1', observations: [] },
    latestReadbacks: {
      schema: 'opl_app_webui_stable_reconcile_readbacks.v1',
      observations: [],
    },
    anonymousReadback: observation(stableRef, 'present', digest('0'), true),
    latestAnonymousReadback: observation(latestRef, 'present', digest('0'), true),
  }).status, 'failed');
  assert.throws(() => writeWebuiStablePromotionReceipt({
    admission,
    decision: writeDecision,
    mutation: unknown,
    readbacks: {
      schema: 'opl_app_webui_stable_reconcile_readbacks.v1',
      observations: Array.from({ length: 4 }, () => targetObservation),
    },
    latestReadbacks: latestTargetReadbacks,
    anonymousReadback: targetAnonymous,
    latestAnonymousReadback: latestTargetAnonymous,
  }), /at most three/);
});

test('independent Preview receipt proves Latest-only mutation and unchanged Stable alias', () => {
  const current = independentPreviewFixture();
  const admission = admitWebuiStablePromotion(current.input);
  const stableRef = admission.target.stable_ref;
  const latestRef = admission.target.latest_ref;
  const decision = decideWebuiStablePromotion(
    admission,
    observation(stableRef, 'present', digest('f')),
    observation(latestRef, 'present', digest('f')),
  );
  const stableUnchanged = observation(stableRef, 'present', digest('f'), true);
  const latestTarget = observation(latestRef, 'present', versionDigest, true);
  const receipt = writeWebuiStablePromotionReceipt({
    admission,
    decision,
    mutation: {
      schema: 'opl_app_webui_stable_mutation_attempt.v1',
      status: 'accepted',
      attempt_count: 1,
      attempt_id: 'attempt-1',
    },
    readbacks: {
      schema: 'opl_app_webui_stable_reconcile_readbacks.v1',
      observations: [stableUnchanged],
    },
    latestReadbacks: {
      schema: 'opl_app_webui_stable_reconcile_readbacks.v1',
      observations: [latestTarget],
    },
    anonymousReadback: stableUnchanged,
    latestAnonymousReadback: latestTarget,
  });

  assert.equal(receipt.status, 'complete');
  assert.equal(receipt.schema, 'opl_app_webui_stable_promotion_receipt.v5');
  assert.equal(receipt.authority_mode, 'independent_preview');
  assert.deepEqual(receipt.compare_and_swap.promotion_tags, ['latest']);
  assert.equal(receipt.classification.quality_status, 'preview');
  assert.equal(receipt.classification.build_trigger, 'manual');
  assert.equal(receipt.classification.preview_kind, 'dev');
  assert.equal(receipt.classification.non_stable_notice, true);
  assert.equal(receipt.anonymous_readback.stable_unchanged, true);
});
