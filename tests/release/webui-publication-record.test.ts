import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  createWebuiPublicationRecord,
  validateWebuiPublicationRecord,
} from '../../scripts/webui-publication-record.ts';
import { createWebuiSourceAuthority } from '../../scripts/webui-source-authority.ts';

const appSha = 'a'.repeat(40);
const shellSha = 'b'.repeat(40);
const frameworkSha = 'c'.repeat(40);
const executorSha = 'd'.repeat(40);
const childDigest = `sha256:${'e'.repeat(64)}`;
const versionDigest = `sha256:${'f'.repeat(64)}`;
const evidenceDigest = (value: string) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

function carrierReceipt(version: string, bundleDigest = `sha256:${'1'.repeat(64)}`) {
  return {
    schema: 'opl_app_webui_release_carrier.v1',
    release: {
      version,
      bundle_digest: bundleDigest,
      cohort_ref: bundleDigest,
    },
    cohort: {
      app_sha: appSha,
      shell_sha: shellSha,
      framework_sha: frameworkSha,
    },
    carrier: {
      carrier_id: 'docker_webui',
      carrier_kind: 'oci_image',
      package_profile: 'webui-full',
      ref: `ghcr.io/gaofeng21cn/one-person-lab-webui@${childDigest}`,
      digest: childDigest,
      size_bytes: 123,
      content_fingerprint: `sha256:${'2'.repeat(64)}`,
    },
    qualification: {
      status: 'passed',
      image_digest: childDigest,
      content_fingerprint: `sha256:${'2'.repeat(64)}`,
    },
  };
}

function versionReadback(version: string) {
  return {
    schema: 'opl_app_webui_descriptor_readback.v1',
    status: 'present',
    ref: `ghcr.io/gaofeng21cn/one-person-lab-webui:${version}`,
    digest: versionDigest,
    child_digest: childDigest,
    manifest_count: 1,
    media_type: 'application/vnd.oci.image.index.v1+json',
  };
}

function previewSourceAuthority(version: string) {
  return createWebuiSourceAuthority({
    version,
    appSha,
    shellSha,
    frameworkSha,
    runId: '302',
    executorSha,
  });
}

function createPreviewRecord() {
  const version = '26.7.28-preview.r1';
  const sourceAuthority = previewSourceAuthority(version);
  return createWebuiPublicationRecord({
    authorityMode: 'independent_preview',
    carrierReceipt: carrierReceipt(version, sourceAuthority.source_authority_digest),
    carrierReceiptSha256: evidenceDigest('carrier'),
    versionReadback: versionReadback(version),
    versionReadbackSha256: evidenceDigest('version-readback'),
    publicationRunId: '302',
    publicationExecutorSha: executorSha,
    sourceAuthority,
    sourceAuthoritySha256: evidenceDigest('source-authority'),
  });
}

test('durable WebUI Preview record binds a selector to exact immutable carrier bytes', () => {
  const publication = createPreviewRecord();
  const validated = validateWebuiPublicationRecord(publication);

  assert.deepEqual(validated, publication);
  assert.equal(publication.schema, 'opl_app_webui_publication_record.v1');
  assert.equal(publication.status, 'published');
  assert.equal(publication.publication_id, `docker-webui:26.7.28-preview.r1@${versionDigest}`);
  assert.equal(publication.classification.quality_status, 'preview');
  assert.equal(publication.classification.preview_kind, 'dev');
  assert.equal(publication.image.receipt_ref, 'ghcr.io/gaofeng21cn/one-person-lab-webui:receipt-26.7.28-preview.r1');
  assert.equal(publication.image.immutable_ref, `ghcr.io/gaofeng21cn/one-person-lab-webui@${childDigest}`);
  assert.match(publication.publication_record_digest, /^sha256:[0-9a-f]{64}$/);
});

test('durable WebUI Stable record binds stable quality to a Stable authority run', () => {
  const version = '26.7.28-r2';
  const publication = createWebuiPublicationRecord({
    authorityMode: 'production_follower',
    carrierReceipt: carrierReceipt(version),
    carrierReceiptSha256: evidenceDigest('stable-carrier'),
    versionReadback: versionReadback(version),
    versionReadbackSha256: evidenceDigest('stable-version-readback'),
    publicationRunId: '401',
    publicationExecutorSha: executorSha,
    stableAuthorityRunId: '400',
  });

  assert.equal(publication.classification.quality_status, 'stable');
  assert.equal(publication.classification.preview_kind, null);
  assert.equal(publication.authority.stable_authority_run_id, '400');
  assert.equal(publication.authority.source_authority, null);
  assert.deepEqual(validateWebuiPublicationRecord(publication), publication);
});

test('durable WebUI publication record fails closed on authority, digest, and source drift', () => {
  const cases: Array<[string, (publication: Record<string, any>) => void]> = [
    ['version index digest', (publication) => { publication.image.version_digest = `sha256:${'0'.repeat(64)}`; }],
    ['receipt reference', (publication) => { publication.image.receipt_ref = 'ghcr.io/gaofeng21cn/one-person-lab-webui:receipt-26.7.28'; }],
    ['quality', (publication) => { publication.classification.quality_status = 'stable'; }],
    ['source authority', (publication) => { publication.authority.source_authority.sources.framework.source_commit = '9'.repeat(40); }],
    ['publication digest', (publication) => { publication.publication_record_digest = `sha256:${'0'.repeat(64)}`; }],
  ];
  for (const [label, mutate] of cases) {
    const publication = structuredClone(createPreviewRecord()) as Record<string, any>;
    mutate(publication);
    assert.throws(
      () => validateWebuiPublicationRecord(publication),
      /canonical digest-bound shape|publication_record_digest|source authority/i,
      label,
    );
  }
});

test('durable WebUI publication refuses missing or conflicting authority evidence', () => {
  const version = '26.7.28-preview.r1';
  assert.throws(
    () => createWebuiPublicationRecord({
      authorityMode: 'independent_preview',
      carrierReceipt: carrierReceipt(version),
      carrierReceiptSha256: evidenceDigest('carrier'),
      versionReadback: versionReadback(version),
      versionReadbackSha256: evidenceDigest('version-readback'),
      publicationRunId: '302',
      publicationExecutorSha: executorSha,
    }),
    /requires one exact source authority/i,
  );

  assert.throws(
    () => createWebuiPublicationRecord({
      authorityMode: 'production_follower',
      carrierReceipt: carrierReceipt('26.7.28-r2'),
      carrierReceiptSha256: evidenceDigest('carrier'),
      versionReadback: versionReadback('26.7.28-r2'),
      versionReadbackSha256: evidenceDigest('version-readback'),
      publicationRunId: '401',
      publicationExecutorSha: executorSha,
    }),
    /requires one Stable authority run/i,
  );
});
