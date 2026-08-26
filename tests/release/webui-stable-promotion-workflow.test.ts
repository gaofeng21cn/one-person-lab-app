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
import { createWebuiPublicationRecord } from '../../scripts/webui-publication-record.ts';
import { createWebuiSourceAuthority } from '../../scripts/webui-source-authority.ts';

const appRoot = process.cwd();
const imageRepository = 'ghcr.io/gaofeng21cn/one-person-lab-webui';
const appSha = 'a'.repeat(40);
const shellSha = 'b'.repeat(40);
const frameworkSha = 'c'.repeat(40);
const carrierExecutorSha = 'd'.repeat(40);
const promotionExecutorSha = 'e'.repeat(40);
const imageDigest = digest('3');
const versionDigest = digest('4');
const predecessorDigest = digest('5');
const amd64Digest = digest('6');
const arm64Digest = digest('7');

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function fileDigest(filePath: string): string {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function writeJson(root: string, name: string, value: unknown): string {
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function observation(ref: string, status: 'present' | 'absent' | 'unknown', observedDigest: string | null, anonymous = false) {
  return {
    schema: 'opl_app_webui_descriptor_readback.v1',
    ref,
    status,
    digest: observedDigest,
    ...(anonymous ? { logout_before_readback: true } : {}),
  };
}

function fixture(mode: 'independent_stable' | 'independent_preview') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-independent-webui-'));
  const version = mode === 'independent_stable' ? '26.8.5' : '26.8.5-preview.r1';
  const carrierRunId = '302';
  const promotionRunId = '303';
  const sourceAuthority = createWebuiSourceAuthority({
    version,
    appSha,
    shellSha,
    frameworkSha,
    runId: carrierRunId,
    executorSha: carrierExecutorSha,
  });
  const carrierReceipt = {
    schema: 'opl_app_webui_release_carrier.v1',
    release: {
      version,
      bundle_digest: sourceAuthority.source_authority_digest,
      cohort_ref: sourceAuthority.source_authority_digest,
    },
    cohort: { app_sha: appSha, shell_sha: shellSha, framework_sha: frameworkSha },
    carrier: {
      carrier_id: 'docker_webui',
      carrier_kind: 'oci_image',
      package_profile: 'webui-full',
      ref: `${imageRepository}@${imageDigest}`,
      digest: imageDigest,
      size_bytes: 123456,
      content_fingerprint: digest('6'),
      os: 'linux',
      architecture: 'multiarch',
      platforms: [
        {
          os: 'linux',
          architecture: 'amd64',
          ref: `${imageRepository}@${amd64Digest}`,
          digest: amd64Digest,
          size_bytes: 61234,
          content_fingerprint: digest('8'),
        },
        {
          os: 'linux',
          architecture: 'arm64',
          ref: `${imageRepository}@${arm64Digest}`,
          digest: arm64Digest,
          size_bytes: 62222,
          content_fingerprint: digest('9'),
        },
      ],
    },
    qualification: {
      schema: 'opl_app_webui_runtime_qualification.v1',
      status: 'passed',
      build_stage: 'webui_built',
      qualification_stage: 'webui_qualified',
      image_digest: imageDigest,
      build_input_digest: digest('7'),
      content_fingerprint: digest('6'),
      runtime_summary_sha256: digest('8'),
      registry_readback_sha256: digest('9'),
      runtime_image_id: `oci-index:${imageDigest}`,
      platform_qualifications: [
        {
          os: 'linux',
          architecture: 'amd64',
          image_digest: amd64Digest,
          build_input_digest: digest('a'),
          content_fingerprint: digest('8'),
          runtime_summary_sha256: digest('b'),
          runtime_image_id: 'qualified-amd64-image',
        },
        {
          os: 'linux',
          architecture: 'arm64',
          image_digest: arm64Digest,
          build_input_digest: digest('c'),
          content_fingerprint: digest('9'),
          runtime_summary_sha256: digest('d'),
          runtime_image_id: 'qualified-arm64-image',
        },
      ],
    },
  };
  const versionReadback = {
    ...observation(`${imageRepository}:${version}`, 'present', versionDigest),
    child_digest: imageDigest,
    manifest_count: 2,
    media_type: 'application/vnd.oci.image.index.v1+json',
    platforms: [
      { os: 'linux', architecture: 'amd64', digest: amd64Digest },
      { os: 'linux', architecture: 'arm64', digest: arm64Digest },
    ],
  };
  const carrierRun = {
    id: Number(carrierRunId),
    repository: { full_name: 'gaofeng21cn/one-person-lab-app' },
    head_repository: { full_name: 'gaofeng21cn/one-person-lab-app' },
    path: '.github/workflows/release-webui-development.yml',
    event: 'workflow_dispatch',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    head_sha: carrierExecutorSha,
  };
  const carrierJob = {
    id: 501,
    run_id: Number(carrierRunId),
    run_url: `https://api.github.com/repos/gaofeng21cn/one-person-lab-app/actions/runs/${carrierRunId}`,
    name: 'webui-carrier / publish-carrier',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    head_sha: carrierExecutorSha,
  };
  const promotionRun = {
    id: Number(promotionRunId),
    repository: { full_name: 'gaofeng21cn/one-person-lab-app' },
    head_repository: { full_name: 'gaofeng21cn/one-person-lab-app' },
    path: '.github/workflows/release-webui-development.yml',
    event: 'workflow_dispatch',
    head_branch: 'main',
    status: 'in_progress',
    conclusion: null,
    run_attempt: 1,
    head_sha: promotionExecutorSha,
  };
  const publicationRecord = createWebuiPublicationRecord({
    authorityMode: mode,
    imageRepository,
    carrierReceipt,
    carrierReceiptSha256: digest('a'),
    versionReadback,
    versionReadbackSha256: digest('b'),
    publicationRunId: carrierRunId,
    publicationRunAttempt: 1,
    publicationExecutorSha: carrierExecutorSha,
    sourceAuthority,
    sourceAuthoritySha256: digest('c'),
  });
  const stablePrestate = observation(`${imageRepository}:stable`, 'present', predecessorDigest);
  const latestPrestate = observation(`${imageRepository}:latest`, 'present', predecessorDigest);
  const paths = {
    carrierRun: writeJson(root, 'carrier-run.json', carrierRun),
    carrierJob: writeJson(root, 'carrier-job.json', carrierJob),
    promotionRun: writeJson(root, 'promotion-run.json', promotionRun),
    carrierReceipt: writeJson(root, 'carrier-receipt.json', carrierReceipt),
    immutable: writeJson(root, 'immutable.json', observation(`${imageRepository}@${imageDigest}`, 'present', imageDigest)),
    version: writeJson(root, 'version.json', versionReadback),
    stable: writeJson(root, 'stable.json', stablePrestate),
    latest: writeJson(root, 'latest.json', latestPrestate),
    publication: writeJson(root, 'publication.json', publicationRecord),
  };
  const input: WebuiStableAdmissionInput = {
    authorityMode: mode,
    carrierFollowerRun: carrierRun,
    carrierFollowerRunPath: paths.carrierRun,
    carrierFollowerRunId: carrierRunId,
    carrierFollowerJob: carrierJob,
    carrierFollowerJobPath: paths.carrierJob,
    carrierExecutorAppSha: carrierExecutorSha,
    promotionExecutorRun: promotionRun,
    promotionExecutorRunPath: paths.promotionRun,
    promotionExecutorRunId: promotionRunId,
    promotionAppSha: promotionExecutorSha,
    carrierReceipt,
    carrierReceiptPath: paths.carrierReceipt,
    immutableReadback: observation(`${imageRepository}@${imageDigest}`, 'present', imageDigest),
    immutableReadbackPath: paths.immutable,
    versionReadback,
    versionReadbackPath: paths.version,
    stablePrestate,
    stablePrestatePath: paths.stable,
    latestPrestate,
    latestPrestatePath: paths.latest,
    publicationRecord,
    publicationRecordPath: paths.publication,
    operator: 'gaofeng21cn',
    operatorConfirmation: mode === 'independent_stable'
      ? `move-docker-stable-and-latest:${version}`
      : `move-docker-latest:${version}`,
  };
  return { input, version };
}

test('Docker WebUI workflows expose one independent Stable and Preview lane with no Desktop follower', () => {
  const operations = YAML.parse(fs.readFileSync(path.join(appRoot, '.github/workflows/release-webui-development.yml'), 'utf8'));
  const stable = YAML.parse(fs.readFileSync(path.join(appRoot, '.github/workflows/release-webui-stable.yml'), 'utf8'));
  assert.equal(operations.concurrency, undefined);
  assert.equal(stable.concurrency, undefined);
  assert.equal(stable.jobs.admission.concurrency, undefined);
  assert.deepEqual(stable.jobs['promote-webui-stable'].concurrency, {
    group: 'opl-webui-stable-promotion-global',
    'cancel-in-progress': false,
  });
  assert.deepEqual(operations.on.workflow_dispatch.inputs.operation.options, ['qualify', 'publish', 'promote']);
  assert.deepEqual(operations.on.workflow_dispatch.inputs.channel.options, ['stable', 'preview']);
  assert.equal(operations.jobs['webui-carrier'].with.authority_mode, '${{ needs.source-authority.outputs.authority_mode }}');
  assert.match(operations.jobs['promote-webui-latest'].with.authority_mode, /independent_stable/);
  assert.equal(fs.existsSync(path.join(appRoot, '.github/workflows/release-webui-development-promote.yml')), false);
  const admissionSteps = stable.jobs.admission.steps as Array<{ name: string; run?: string }>;
  const materialize = admissionSteps.find((step) => step.name.startsWith('Materialize carrier'))?.run ?? '';
  const authorityRead = admissionSteps.find((step) => step.name.startsWith('Read immutable'))?.run ?? '';
  assert.match(materialize, /architecture:"multiarch"/);
  assert.match(materialize, /platforms:.image.platforms/);
  assert.match(materialize, /\.authority\.source_authority \| select\(type == "object"\)/);
  assert.doesNotMatch(materialize, /\.authority\.source_authority \| type == "object"/);
  assert.match(authorityRead, /select\(length == 2\)/);
  assert.match(authorityRead, /platforms:\$platforms/);
  assert.doesNotMatch(authorityRead, /select\(length == 1\)/);
  const terminalSteps = stable.jobs['promote-webui-stable'].steps as Array<{ name: string; run?: string }>;
  const publicReadback = terminalSteps.find((step) => step.name.startsWith('Read back the complete public OCI'))?.run ?? '';
  assert.match(publicReadback, /for architecture in amd64 arm64/);
  assert.match(publicReadback, /opl_app_webui_public_oci_readback\.v2/);
  assert.match(publicReadback, /children:\$children/);
  assert.doesNotMatch(publicReadback, /child:\{/);
  assert.equal(fs.existsSync(path.join(appRoot, '.github/workflows/release-webui-follower.yml')), false);
});

test('independent Stable admission binds a durable Docker record and moves stable plus latest', () => {
  const { input } = fixture('independent_stable');
  const admission = admitWebuiStablePromotion(input);
  assert.equal('stable_authority' in admission, false);
  assert.equal(admission.source_authority.source_authority_digest, input.carrierReceipt.release.bundle_digest);
  assert.deepEqual(admission.target.promotion_tags, ['stable', 'latest']);
  assert.deepEqual(
    admission.target.platforms.map((platform: { architecture: string }) => platform.architecture),
    ['amd64', 'arm64'],
  );
  const decision = decideWebuiStablePromotion(admission, input.stablePrestate, input.latestPrestate);
  assert.equal(decision.decision, 'write_once');
  assert.equal(decision.authorized_tag_attempts, 1);
});

test('independent Preview admission moves latest only and freezes stable', () => {
  const { input } = fixture('independent_preview');
  const admission = admitWebuiStablePromotion(input);
  assert.equal('stable_authority' in admission, false);
  assert.deepEqual(admission.target.promotion_tags, ['latest']);
  const decision = decideWebuiStablePromotion(admission, input.stablePrestate, input.latestPrestate);
  assert.equal(decision.decision, 'write_once');
});

test('independent Stable rejects a wrong explicit confirmation', () => {
  const { input } = fixture('independent_stable');
  input.operatorConfirmation = 'move-docker-latest:26.8.5';
  assert.throws(() => admitWebuiStablePromotion(input), /independent Stable operator confirmation/i);
});

test('Stable CAS is idempotent only when both moving tags already equal the target', () => {
  const { input } = fixture('independent_stable');
  const admission = admitWebuiStablePromotion(input);
  const stable = observation(admission.target.stable_ref, 'present', admission.target.digest);
  const latest = observation(admission.target.latest_ref, 'present', admission.target.digest);
  const decision = decideWebuiStablePromotion(admission, stable, latest);
  assert.equal(decision.decision, 'idempotent');
  assert.equal(decision.authorized_tag_attempts, 0);
});

test('Stable terminal receipt closes one accepted CAS with anonymous digest readback', () => {
  const { input } = fixture('independent_stable');
  const admission = admitWebuiStablePromotion(input);
  const decision = decideWebuiStablePromotion(admission, input.stablePrestate, input.latestPrestate);
  const stable = observation(admission.target.stable_ref, 'present', admission.target.digest, true);
  const latest = observation(admission.target.latest_ref, 'present', admission.target.digest, true);
  const receipt = writeWebuiStablePromotionReceipt({
    admission,
    decision,
    mutation: { status: 'accepted', attempt_count: 1 },
    readbacks: { schema: 'opl_app_webui_stable_reconcile_readbacks.v1', observations: [stable] },
    latestReadbacks: { schema: 'opl_app_webui_stable_reconcile_readbacks.v1', observations: [latest] },
    anonymousReadback: stable,
    latestAnonymousReadback: latest,
  });
  assert.equal(receipt.status, 'complete');
  assert.equal(receipt.retry_allowed, false);
  assert.equal(receipt.compare_and_swap.tag_attempt_count, 1);
});

test('durable publication evidence paths are digest-bound', () => {
  const { input } = fixture('independent_stable');
  const admission = admitWebuiStablePromotion(input);
  assert.equal(admission.evidence.publication_record_sha256, fileDigest(input.publicationRecordPath!));
});
