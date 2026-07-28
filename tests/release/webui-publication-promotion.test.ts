import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import {
  createWebuiPublicationRecord,
  type JsonRecord,
} from '../../scripts/webui-publication-record.ts';
import {
  admitWebuiPublicationLatestPromotion,
  consumeWebuiPublicationLatestPromotion,
  decideWebuiPublicationLatestPromotion,
  writeWebuiPublicationLatestPromotionReceipt,
} from '../../scripts/webui-publication-promotion.ts';
import { createWebuiSourceAuthority } from '../../scripts/webui-source-authority.ts';
import {
  isAuthorizedWebuiPublicationLatestPromotionWriteJob,
  validateWorkflowDispatchWriteAuthority,
} from '../../scripts/validate-release-boundary/text-check-runner.ts';

const appRoot = process.cwd();
const workflowPath = path.join(
  appRoot,
  '.github',
  'workflows',
  'release-webui-publication-promote.yml',
);
const appSha = 'a'.repeat(40);
const shellSha = 'b'.repeat(40);
const frameworkSha = 'c'.repeat(40);
const executorSha = 'd'.repeat(40);
const childDigest = digest('e');
const versionDigest = digest('f');
const stableDigest = digest('1');
const latestDigest = digest('2');
const promotionRunId = '9001';
const promotionActor = 'gaofeng21cn';

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function evidenceDigest(value: string): string {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function observation(
  ref: string,
  status: 'present' | 'absent' | 'unknown',
  observedDigest: string | null,
  logoutBeforeReadback?: boolean,
): JsonRecord {
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

function recordFor(version = '26.7.28-preview.r1'): JsonRecord {
  const sourceAuthority = createWebuiSourceAuthority({
    version,
    appSha,
    shellSha,
    frameworkSha,
    runId: '302',
    executorSha,
  });
  return createWebuiPublicationRecord({
    authorityMode: 'independent_preview',
    carrierReceipt: {
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
        ref: `ghcr.io/gaofeng21cn/one-person-lab-webui@${childDigest}`,
        digest: childDigest,
        size_bytes: 123,
        content_fingerprint: digest('3'),
      },
      qualification: {
        status: 'passed',
        image_digest: childDigest,
        content_fingerprint: digest('3'),
      },
    },
    carrierReceiptSha256: evidenceDigest('carrier'),
    versionReadback: {
      ...observation(`ghcr.io/gaofeng21cn/one-person-lab-webui:${version}`, 'present', versionDigest),
      child_digest: childDigest,
      manifest_count: 1,
      media_type: 'application/vnd.oci.image.index.v1+json',
    },
    versionReadbackSha256: evidenceDigest('version'),
    publicationRunId: '302',
    publicationExecutorSha: executorSha,
    sourceAuthority,
    sourceAuthoritySha256: evidenceDigest('source-authority'),
  });
}

function fixture() {
  const publication = recordFor();
  const version = publication.release.version as string;
  const versionRef = publication.image.version_ref as string;
  const stableRef = 'ghcr.io/gaofeng21cn/one-person-lab-webui:stable';
  const latestRef = 'ghcr.io/gaofeng21cn/one-person-lab-webui:latest';
  const admission = admitWebuiPublicationLatestPromotion({
    publicationVersion: version,
    publicationRecord: publication,
    versionReadback: {
      ...observation(versionRef, 'present', versionDigest),
      child_digest: childDigest,
      manifest_count: 1,
      media_type: 'application/vnd.oci.image.index.v1+json',
    },
    stablePrestate: observation(stableRef, 'present', stableDigest),
    latestPrestate: observation(latestRef, 'present', latestDigest),
    actor: promotionActor,
    operatorConfirmation: `move-docker-latest:${version}`,
    runId: promotionRunId,
    runAttempt: 1,
  });
  return { publication, version, versionRef, stableRef, latestRef, admission };
}

test('durable record selector admits a retained Stable or Preview version without changing quality', () => {
  const { admission, version, stableRef, latestRef } = fixture();
  assert.equal(admission.status, 'passed');
  assert.equal(admission.selector.source, 'durable_webui_publication_record');
  assert.equal(admission.selector.publication_version, version);
  assert.equal(admission.selector.quality_status, 'preview');
  assert.equal(admission.operator_evidence.actor, promotionActor);
  assert.equal(admission.operator_evidence.run_id, promotionRunId);
  assert.equal(admission.operator_evidence.run_attempt, 1);
  assert.equal(admission.operator_evidence.mutation_limit, 1);
  assert.equal(admission.operator_evidence.issuance.cryptographic_signature, false);
  assert.match(admission.operator_evidence.operator_confirmation_digest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(admission.target.promotion_tags, ['latest']);
  assert.equal(admission.target.stable_ref, stableRef);
  assert.equal(admission.target.latest_ref, latestRef);
  assert.equal(admission.expected_prestate.stable.digest, stableDigest);
  assert.equal(admission.expected_prestate.latest.digest, latestDigest);
});

test('selector decision permits only one Latest write while Stable remains frozen', () => {
  const { admission, stableRef, latestRef } = fixture();
  const cases: Array<[JsonRecord, JsonRecord, string, number]> = [
    [
      observation(stableRef, 'present', stableDigest),
      observation(latestRef, 'present', latestDigest),
      'write_once',
      1,
    ],
    [
      observation(stableRef, 'present', stableDigest),
      observation(latestRef, 'present', versionDigest),
      'idempotent',
      0,
    ],
    [
      observation(stableRef, 'present', digest('0')),
      observation(latestRef, 'present', latestDigest),
      'stable_conflict',
      0,
    ],
    [
      observation(stableRef, 'present', stableDigest),
      observation(latestRef, 'present', digest('0')),
      'latest_conflict',
      0,
    ],
    [
      observation(stableRef, 'unknown', null),
      observation(latestRef, 'present', latestDigest),
      'prestate_unknown',
      0,
    ],
  ];
  for (const [stable, latest, decision, attempts] of cases) {
    const actual = decideWebuiPublicationLatestPromotion(admission, stable, latest);
    assert.equal(actual.decision, decision);
    assert.equal(actual.authorized_tag_attempts, attempts);
  }
});

test('selector consumes run-bound operator evidence exactly once before a Latest write', () => {
  const { admission, stableRef, latestRef } = fixture();
  const decision = decideWebuiPublicationLatestPromotion(
    admission,
    observation(stableRef, 'present', stableDigest),
    observation(latestRef, 'present', latestDigest),
  );
  const consumption = consumeWebuiPublicationLatestPromotion({
    admission,
    decision,
    runId: promotionRunId,
    runAttempt: 1,
  });
  assert.equal(consumption.status, 'consumed');
  assert.equal(consumption.run_id, promotionRunId);
  assert.equal(consumption.authorized_tag_attempts, 1);
  assert.throws(
    () => consumeWebuiPublicationLatestPromotion({
      admission,
      decision,
      runId: '9002',
      runAttempt: 1,
    }),
    /operator evidence\.run_id/,
  );
  assert.throws(
    () => admitWebuiPublicationLatestPromotion({
      publicationVersion: admission.selector.publication_version as string,
      publicationRecord: fixture().publication,
      versionReadback: {
        ...observation(admission.target.version_ref as string, 'present', versionDigest),
        child_digest: childDigest,
        manifest_count: 1,
        media_type: 'application/vnd.oci.image.index.v1+json',
      },
      stablePrestate: observation(stableRef, 'present', stableDigest),
      latestPrestate: observation(latestRef, 'present', latestDigest),
      actor: promotionActor,
      operatorConfirmation: 'move-docker-latest:wrong-version',
      runId: promotionRunId,
      runAttempt: 1,
    }),
    /operator confirmation/,
  );
});

test('consume CLI creates one non-overwritable run-bound receipt', () => {
  const { admission, stableRef, latestRef } = fixture();
  const decision = decideWebuiPublicationLatestPromotion(
    admission,
    observation(stableRef, 'present', stableDigest),
    observation(latestRef, 'present', latestDigest),
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-latest-consume-'));
  try {
    const admissionPath = path.join(root, 'admission.json');
    const decisionPath = path.join(root, 'decision.json');
    const outputPath = path.join(root, 'consumption.json');
    fs.writeFileSync(admissionPath, `${JSON.stringify(admission)}\n`);
    fs.writeFileSync(decisionPath, `${JSON.stringify(decision)}\n`);
    const args = [
      '--experimental-strip-types',
      'scripts/webui-publication-promotion.ts',
      'consume',
      '--admission', admissionPath,
      '--decision', decisionPath,
      '--run-id', promotionRunId,
      '--run-attempt', '1',
      '--output', outputPath,
    ];
    const first = spawnSync(process.execPath, args, {
      cwd: appRoot,
      encoding: 'utf8',
    });
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const second = spawnSync(process.execPath, args, {
      cwd: appRoot,
      encoding: 'utf8',
    });
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /EEXIST/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('selector rejects a non-retained version reference or version digest drift', () => {
  const { publication, stableRef, latestRef } = fixture();
  assert.throws(
    () => admitWebuiPublicationLatestPromotion({
      publicationVersion: '26.7.28-preview.r2',
      publicationRecord: publication,
      versionReadback: {
        ...observation(publication.image.version_ref as string, 'present', versionDigest),
        child_digest: childDigest,
        manifest_count: 1,
        media_type: 'application/vnd.oci.image.index.v1+json',
      },
      stablePrestate: observation(stableRef, 'present', stableDigest),
      latestPrestate: observation(latestRef, 'present', latestDigest),
      actor: promotionActor,
      operatorConfirmation: `move-docker-latest:${publication.release.version as string}`,
    }),
    /selected publication version/,
  );
  assert.throws(
    () => admitWebuiPublicationLatestPromotion({
      publicationVersion: publication.release.version as string,
      publicationRecord: publication,
      versionReadback: {
        ...observation(publication.image.version_ref as string, 'present', digest('0')),
        child_digest: childDigest,
        manifest_count: 1,
        media_type: 'application/vnd.oci.image.index.v1+json',
      },
      stablePrestate: observation(stableRef, 'present', stableDigest),
      latestPrestate: observation(latestRef, 'present', latestDigest),
      actor: promotionActor,
      operatorConfirmation: `move-docker-latest:${publication.release.version as string}`,
    }),
    /version readback.digest/,
  );
});

test('terminal receipt distinguishes complete, reconciled, idempotent, and inconclusive states', () => {
  const { admission, stableRef, latestRef } = fixture();
  const writeDecision = decideWebuiPublicationLatestPromotion(
    admission,
    observation(stableRef, 'present', stableDigest),
    observation(latestRef, 'present', latestDigest),
  );
  const stableTarget = observation(stableRef, 'present', stableDigest, true);
  const latestTarget = observation(latestRef, 'present', versionDigest, true);
  const readbacks = {
    schema: 'opl_app_webui_publication_latest_reconcile_readbacks.v1',
    observations: [stableTarget],
  };
  const latestReadbacks = {
    schema: 'opl_app_webui_publication_latest_reconcile_readbacks.v1',
    observations: [latestTarget],
  };
  const consumption = consumeWebuiPublicationLatestPromotion({
    admission,
    decision: writeDecision,
    runId: promotionRunId,
    runAttempt: 1,
  });
  const accepted = {
    schema: 'opl_app_webui_publication_latest_mutation_attempt.v1',
    status: 'accepted',
    attempt_count: 1,
    run_id: promotionRunId,
    run_attempt: 1,
    operator_evidence_digest: admission.operator_evidence.operator_evidence_digest,
    consumption_digest: consumption.consumption_digest,
  };
  assert.equal(writeWebuiPublicationLatestPromotionReceipt({
    admission,
    decision: writeDecision,
    mutation: accepted,
    consumption,
    stableReadbacks: readbacks,
    latestReadbacks,
    anonymousStableReadback: stableTarget,
    anonymousLatestReadback: latestTarget,
  }).status, 'complete');
  assert.equal(writeWebuiPublicationLatestPromotionReceipt({
    admission,
    decision: writeDecision,
    mutation: { ...accepted, status: 'unknown' },
    consumption,
    stableReadbacks: readbacks,
    latestReadbacks,
    anonymousStableReadback: stableTarget,
    anonymousLatestReadback: latestTarget,
  }).status, 'reconciled_complete');
  const idempotentDecision = decideWebuiPublicationLatestPromotion(
    admission,
    observation(stableRef, 'present', stableDigest),
    observation(latestRef, 'present', versionDigest),
  );
  assert.equal(writeWebuiPublicationLatestPromotionReceipt({
    admission,
    decision: idempotentDecision,
    mutation: {
      schema: 'opl_app_webui_publication_latest_mutation_attempt.v1',
      status: 'not_attempted',
      attempt_count: 0,
    },
    stableReadbacks: {
      schema: 'opl_app_webui_publication_latest_reconcile_readbacks.v1',
      observations: [],
    },
    latestReadbacks: {
      schema: 'opl_app_webui_publication_latest_reconcile_readbacks.v1',
      observations: [],
    },
    anonymousStableReadback: stableTarget,
    anonymousLatestReadback: latestTarget,
  }).status, 'idempotent');
  assert.equal(writeWebuiPublicationLatestPromotionReceipt({
    admission,
    decision: writeDecision,
    mutation: { ...accepted, status: 'unknown' },
    consumption,
    stableReadbacks: {
      schema: 'opl_app_webui_publication_latest_reconcile_readbacks.v1',
      observations: [observation(stableRef, 'unknown', null)],
    },
    latestReadbacks: {
      schema: 'opl_app_webui_publication_latest_reconcile_readbacks.v1',
      observations: [observation(latestRef, 'unknown', null)],
    },
    anonymousStableReadback: observation(stableRef, 'unknown', null, true),
    anonymousLatestReadback: observation(latestRef, 'unknown', null, true),
  }).status, 'outcome_unknown');
});

test('manual workflow accepts one durable version selector and has one protected Latest-only writer', () => {
  const source = fs.readFileSync(workflowPath, 'utf8');
  const workflow = YAML.parse(source);
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs).sort(), ['operator_confirmation', 'publication_version']);
  assert.equal(workflow.permissions.actions, 'read');
  assert.equal(workflow.permissions.contents, 'read');
  assert.deepEqual(workflow.concurrency, {
    group: 'opl-webui-stable-promotion-global',
    'cancel-in-progress': false,
  });
  assert.deepEqual(Object.keys(workflow.jobs), ['admission', 'promote-latest']);
  assert.deepEqual(workflow.jobs.admission.permissions, { actions: 'read', contents: 'read' });
  assert.equal(workflow.jobs['promote-latest'].needs, 'admission');
  assert.equal(workflow.jobs['promote-latest'].environment, 'release-preview-publication');
  assert.deepEqual(workflow.jobs['promote-latest'].permissions, {
    actions: 'read',
    contents: 'read',
    packages: 'write',
  });
  assert.equal(
    isAuthorizedWebuiPublicationLatestPromotionWriteJob(
      '.github/workflows/release-webui-publication-promote.yml',
      'promote-latest',
      workflow.jobs['promote-latest'],
    ),
    true,
  );
  assert.match(source, /oras pull "\$receipt_ref"/);
  assert.match(source, /webui-publication-record\.ts[\s\\]+validate/);
  assert.match(source, /webui-publication-promotion\.ts admit/);
  assert.match(source, /webui-publication-promotion\.ts consume/);
  assert.match(source, /operator_confirmation/);
  assert.match(source, /operator_evidence/);
  assert.match(source, /terminal\/consumption\.json/);
  assert.match(source, /oras tag "\$target_ref" latest/);
  assert.match(source, /stable_unchanged:true/);
  assert.doesNotMatch(source, /\boras tag\b[^\n]*\bstable\b/);
  assert.doesNotMatch(source, /randomBytes|openssl rand|--nonce/);
  assert.doesNotMatch(source, /release-webui-development\.yml|release-webui-stable\.yml|gh workflow run|--force/);
  assert.equal(validateWorkflowDispatchWriteAuthority(appRoot), 0);
});
