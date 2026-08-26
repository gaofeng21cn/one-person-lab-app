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
const indexDigest = `sha256:${'e'.repeat(64)}`;
const amd64Digest = `sha256:${'a'.repeat(64)}`;
const arm64Digest = `sha256:${'b'.repeat(64)}`;
const versionDigest = `sha256:${'f'.repeat(64)}`;
const imageRepository = 'ghcr.io/gaofeng21cn/one-person-lab-webui';
const evidenceDigest = (value: string) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

function carrierReceipt(
  version: string,
  bundleDigest = `sha256:${'1'.repeat(64)}`,
  repository = imageRepository,
) {
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
      ref: `${repository}@${indexDigest}`,
      digest: indexDigest,
      size_bytes: 123,
      content_fingerprint: `sha256:${'2'.repeat(64)}`,
      os: 'linux',
      architecture: 'multiarch',
      platforms: [
        {
          os: 'linux',
          architecture: 'amd64',
          ref: `${repository}@${amd64Digest}`,
          digest: amd64Digest,
          size_bytes: 61,
          content_fingerprint: `sha256:${'6'.repeat(64)}`,
        },
        {
          os: 'linux',
          architecture: 'arm64',
          ref: `${repository}@${arm64Digest}`,
          digest: arm64Digest,
          size_bytes: 62,
          content_fingerprint: `sha256:${'7'.repeat(64)}`,
        },
      ],
    },
    qualification: {
      schema: 'opl_app_webui_runtime_qualification.v1',
      status: 'passed',
      build_stage: 'webui_built',
      qualification_stage: 'webui_qualified',
      image_digest: indexDigest,
      build_input_digest: `sha256:${'3'.repeat(64)}`,
      content_fingerprint: `sha256:${'2'.repeat(64)}`,
      runtime_summary_sha256: `sha256:${'4'.repeat(64)}`,
      registry_readback_sha256: `sha256:${'5'.repeat(64)}`,
      runtime_image_id: `oci-index:${indexDigest}`,
      platform_qualifications: [
        {
          os: 'linux',
          architecture: 'amd64',
          image_digest: amd64Digest,
          build_input_digest: `sha256:${'8'.repeat(64)}`,
          content_fingerprint: `sha256:${'6'.repeat(64)}`,
          runtime_summary_sha256: `sha256:${'9'.repeat(64)}`,
          runtime_image_id: 'webui-amd64-image',
        },
        {
          os: 'linux',
          architecture: 'arm64',
          image_digest: arm64Digest,
          build_input_digest: `sha256:${'a'.repeat(64)}`,
          content_fingerprint: `sha256:${'7'.repeat(64)}`,
          runtime_summary_sha256: `sha256:${'b'.repeat(64)}`,
          runtime_image_id: 'webui-arm64-image',
        },
      ],
    },
  };
}

function versionReadback(version: string, repository = imageRepository) {
  return {
    schema: 'opl_app_webui_descriptor_readback.v1',
    status: 'present',
    ref: `${repository}:${version}`,
    digest: versionDigest,
    child_digest: indexDigest,
    manifest_count: 2,
    media_type: 'application/vnd.oci.image.index.v1+json',
    platforms: [
      { os: 'linux', architecture: 'amd64', digest: amd64Digest },
      { os: 'linux', architecture: 'arm64', digest: arm64Digest },
    ],
  };
}

function createSourceAuthority(version: string, runId = '302') {
  return createWebuiSourceAuthority({
    version,
    appSha,
    shellSha,
    frameworkSha,
    runId,
    executorSha,
  });
}

function createPreviewRecord() {
  const version = '26.7.28-preview.r1';
  const sourceAuthority = createSourceAuthority(version);
  return createWebuiPublicationRecord({
    authorityMode: 'independent_preview',
    imageRepository,
    carrierReceipt: carrierReceipt(version, sourceAuthority.source_authority_digest),
    carrierReceiptSha256: evidenceDigest('carrier'),
    versionReadback: versionReadback(version),
    versionReadbackSha256: evidenceDigest('version-readback'),
    publicationRunId: '302',
    publicationRunAttempt: 1,
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
  assert.equal(publication.image.receipt_ref, 'ghcr.io/gaofeng21cn/one-person-lab-webui:receipt-26.7.28-preview.r1-302-1');
  assert.equal(publication.image.immutable_ref, `ghcr.io/gaofeng21cn/one-person-lab-webui@${indexDigest}`);
  assert.deepEqual(
    publication.image.platforms.map((platform: { architecture: string }) => platform.architecture),
    ['amd64', 'arm64'],
  );
  assert.equal(publication.qualification_disclosure.stable_qualification, null);
  assert.equal(
    publication.qualification_disclosure.non_stable_gate_disclosure.reason,
    'independent_preview_not_stable',
  );
  assert.match(publication.publication_record_digest, /^sha256:[0-9a-f]{64}$/);
});

test('durable WebUI Stable record binds stable quality to independent Docker source authority', () => {
  const version = '26.7.28-r2';
  const sourceAuthority = createSourceAuthority(version, '401');
  const publication = createWebuiPublicationRecord({
    authorityMode: 'independent_stable',
    imageRepository,
    carrierReceipt: carrierReceipt(version, sourceAuthority.source_authority_digest),
    carrierReceiptSha256: evidenceDigest('stable-carrier'),
    versionReadback: versionReadback(version),
    versionReadbackSha256: evidenceDigest('stable-version-readback'),
    publicationRunId: '401',
    publicationRunAttempt: 3,
    publicationExecutorSha: executorSha,
    sourceAuthority,
    sourceAuthoritySha256: evidenceDigest('stable-source-authority'),
  });

  assert.equal(publication.classification.quality_status, 'stable');
  assert.equal(publication.classification.preview_kind, null);
  assert.equal('stable_authority_run_id' in publication.authority, false);
  assert.deepEqual(publication.authority.source_authority, sourceAuthority);
  assert.equal(publication.authority.publication_run_attempt, 3);
  assert.deepEqual(publication.qualification_disclosure.non_stable_gate_disclosure, null);
  assert.deepEqual(publication.qualification_disclosure.stable_qualification, {
    schema: 'opl_app_webui_stable_qualification_disclosure.v1',
    status: 'passed',
    source_authority_digest: sourceAuthority.source_authority_digest,
  });
  assert.deepEqual(validateWebuiPublicationRecord(publication), publication);
});

test('durable WebUI publication record fails closed on authority, digest, and source drift', () => {
  const cases: Array<[string, (publication: Record<string, any>) => void]> = [
    ['version index digest', (publication) => { publication.image.version_digest = `sha256:${'0'.repeat(64)}`; }],
    ['receipt reference', (publication) => { publication.image.receipt_ref = 'ghcr.io/gaofeng21cn/one-person-lab-webui:receipt-26.7.28'; }],
    ['quality', (publication) => { publication.classification.quality_status = 'stable'; }],
    ['qualification disclosure', (publication) => { publication.qualification_disclosure.non_stable_gate_disclosure.reason = 'invalid_non_stable_reason'; }],
    ['image repository', (publication) => { publication.image.repository = 'ghcr.io/example/other'; }],
    ['source authority', (publication) => { publication.authority.source_authority.sources.framework.source_commit = '9'.repeat(40); }],
    ['publication digest', (publication) => { publication.publication_record_digest = `sha256:${'0'.repeat(64)}`; }],
  ];
  for (const [label, mutate] of cases) {
    const publication = structuredClone(createPreviewRecord()) as Record<string, any>;
    mutate(publication);
    assert.throws(
      () => validateWebuiPublicationRecord(publication),
      /canonical digest-bound shape|publication_record_digest|source authority|carrier receipt\.carrier\.ref/i,
      label,
    );
  }
});

test('durable WebUI publication refuses missing or conflicting authority evidence', () => {
  const version = '26.7.28-preview.r1';
  assert.throws(
    () => createWebuiPublicationRecord({
      authorityMode: 'independent_preview',
      imageRepository,
      carrierReceipt: carrierReceipt(version),
      carrierReceiptSha256: evidenceDigest('carrier'),
      versionReadback: versionReadback(version),
      versionReadbackSha256: evidenceDigest('version-readback'),
      publicationRunId: '302',
      publicationRunAttempt: 1,
      publicationExecutorSha: executorSha,
    }),
    /requires one exact source authority/i,
  );

  assert.throws(
    () => createWebuiPublicationRecord({
      authorityMode: 'independent_stable',
      imageRepository,
      carrierReceipt: carrierReceipt('26.7.28-r2'),
      carrierReceiptSha256: evidenceDigest('carrier'),
      versionReadback: versionReadback('26.7.28-r2'),
      versionReadbackSha256: evidenceDigest('version-readback'),
      publicationRunId: '401',
      publicationRunAttempt: 1,
      publicationExecutorSha: executorSha,
    }),
    /requires one exact source authority/i,
  );
});

test('durable WebUI publication record supports an exact validated non-default GHCR repository', () => {
  const repository = 'ghcr.io/gaofeng21cn/one-person-lab-webui-preview';
  const version = '26.7.28-preview.r1';
  const sourceAuthority = createSourceAuthority(version);
  const publication = createWebuiPublicationRecord({
    authorityMode: 'independent_preview',
    imageRepository: repository,
    carrierReceipt: carrierReceipt(version, sourceAuthority.source_authority_digest, repository),
    carrierReceiptSha256: evidenceDigest('non-default-carrier'),
    versionReadback: versionReadback(version, repository),
    versionReadbackSha256: evidenceDigest('non-default-version'),
    publicationRunId: '302',
    publicationRunAttempt: 2,
    publicationExecutorSha: executorSha,
    sourceAuthority,
    sourceAuthoritySha256: evidenceDigest('non-default-authority'),
  });

  assert.equal(publication.image.repository, repository);
  assert.equal(publication.authority.publication_run_attempt, 2);
  assert.deepEqual(validateWebuiPublicationRecord(publication), publication);
});
