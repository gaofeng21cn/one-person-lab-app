import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { validateWebuiSourceAuthority, type JsonRecord } from './webui-source-authority.ts';

export type WebuiPublicationAuthorityMode =
  | 'production_follower'
  | 'development_validation'
  | 'independent_preview';

const appRepository = 'gaofeng21cn/one-person-lab-app';
const webuiRepository = 'ghcr.io/gaofeng21cn/one-person-lab-webui';
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const shaPattern = /^[0-9a-f]{40}$/;
const runPattern = /^[1-9][0-9]*$/;
const versionPattern = /^[0-9]{2}\.[0-9]{1,2}\.[0-9]{1,2}(?:-r[1-9][0-9]*|-preview\.r[1-9][0-9]*|-nightly(?:\.r[1-9][0-9]*)?)?$/;
const previewVersionPattern = /^[0-9]{2}\.[0-9]{1,2}\.[0-9]{1,2}-preview\.r[1-9][0-9]*$/;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as JsonRecord;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) throw new Error(`${label} must equal ${String(expected)}.`);
}

function digest(value: unknown, label: string): string {
  const normalized = text(value, label);
  if (!digestPattern.test(normalized)) throw new Error(`${label} must be an exact sha256 digest.`);
  return normalized;
}

function sha(value: unknown, label: string): string {
  const normalized = text(value, label);
  if (!shaPattern.test(normalized)) throw new Error(`${label} must be a full lowercase Git SHA.`);
  return normalized;
}

function runId(value: unknown, label: string): string {
  const normalized = text(value, label);
  if (!runPattern.test(normalized)) throw new Error(`${label} must be a positive Actions run id.`);
  return normalized;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return Number(value);
}

function authorityMode(value: unknown): WebuiPublicationAuthorityMode {
  const mode = text(value, 'authority mode') as WebuiPublicationAuthorityMode;
  if (!['production_follower', 'development_validation', 'independent_preview'].includes(mode)) {
    throw new Error('WebUI publication authority mode is invalid.');
  }
  return mode;
}

function fileDigest(filePath: string, label: string): string {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`${label} must be one non-empty regular file.`);
  }
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(resolved)).digest('hex')}`;
}

function readJson(filePath: string, label: string): JsonRecord {
  const resolved = path.resolve(filePath);
  fileDigest(resolved, label);
  return record(JSON.parse(fs.readFileSync(resolved, 'utf8')), label);
}

function publicationClassification(mode: WebuiPublicationAuthorityMode): JsonRecord {
  return mode === 'production_follower'
    ? {
        quality_status: 'stable',
        build_trigger: 'automated',
        preview_kind: null,
        quality_unchanged: true,
      }
    : {
        quality_status: 'preview',
        build_trigger: 'manual',
        preview_kind: 'dev',
        quality_unchanged: true,
      };
}

function expectedPublicationWorkflow(mode: WebuiPublicationAuthorityMode): string {
  return mode === 'production_follower'
    ? '.github/workflows/release-webui-follower.yml'
    : '.github/workflows/release-webui-development.yml';
}

function validateCarrierReceipt(value: unknown): {
  release: JsonRecord;
  cohort: JsonRecord;
  carrier: JsonRecord;
} {
  const receipt = record(value, 'WebUI carrier receipt');
  exact(receipt.schema, 'opl_app_webui_release_carrier.v1', 'carrier receipt.schema');
  const release = record(receipt.release, 'carrier receipt.release');
  const version = text(release.version, 'carrier receipt.release.version');
  if (!versionPattern.test(version)) throw new Error('carrier receipt.release.version is invalid.');
  digest(release.bundle_digest, 'carrier receipt.release.bundle_digest');
  digest(release.cohort_ref, 'carrier receipt.release.cohort_ref');
  const cohort = record(receipt.cohort, 'carrier receipt.cohort');
  sha(cohort.app_sha, 'carrier receipt.cohort.app_sha');
  sha(cohort.shell_sha, 'carrier receipt.cohort.shell_sha');
  sha(cohort.framework_sha, 'carrier receipt.cohort.framework_sha');
  const carrier = record(receipt.carrier, 'carrier receipt.carrier');
  exact(carrier.carrier_id, 'docker_webui', 'carrier receipt.carrier.carrier_id');
  exact(carrier.carrier_kind, 'oci_image', 'carrier receipt.carrier.carrier_kind');
  exact(carrier.package_profile, 'webui-full', 'carrier receipt.carrier.package_profile');
  const childDigest = digest(carrier.digest, 'carrier receipt.carrier.digest');
  exact(carrier.ref, `${webuiRepository}@${childDigest}`, 'carrier receipt.carrier.ref');
  positiveInteger(carrier.size_bytes, 'carrier receipt.carrier.size_bytes');
  digest(carrier.content_fingerprint, 'carrier receipt.carrier.content_fingerprint');
  const qualification = record(receipt.qualification, 'carrier receipt.qualification');
  exact(qualification.status, 'passed', 'carrier receipt.qualification.status');
  exact(qualification.image_digest, childDigest, 'carrier receipt.qualification.image_digest');
  exact(
    qualification.content_fingerprint,
    carrier.content_fingerprint,
    'carrier receipt.qualification.content_fingerprint',
  );
  return { release, cohort, carrier };
}

function validateVersionReadback(value: unknown, version: string, childDigest: string): JsonRecord {
  const readback = record(value, 'version readback');
  exact(readback.schema, 'opl_app_webui_descriptor_readback.v1', 'version readback.schema');
  exact(readback.ref, `${webuiRepository}:${version}`, 'version readback.ref');
  exact(readback.status, 'present', 'version readback.status');
  digest(readback.digest, 'version readback.digest');
  exact(readback.child_digest, childDigest, 'version readback.child_digest');
  exact(readback.manifest_count, 1, 'version readback.manifest_count');
  if (![
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
  ].includes(text(readback.media_type, 'version readback.media_type'))) {
    throw new Error('version readback.media_type must be an OCI index or Docker manifest list.');
  }
  return readback;
}

function canonicalCore(recordValue: JsonRecord): JsonRecord {
  const { publication_record_digest: _digest, ...core } = recordValue;
  return core;
}

export type CreateWebuiPublicationRecordInput = {
  authorityMode: WebuiPublicationAuthorityMode;
  carrierReceipt: JsonRecord;
  carrierReceiptSha256: string;
  versionReadback: JsonRecord;
  versionReadbackSha256: string;
  publicationRunId: string;
  publicationExecutorSha: string;
  stableAuthorityRunId?: string;
  sourceAuthority?: JsonRecord;
  sourceAuthoritySha256?: string;
};

export function createWebuiPublicationRecord(input: CreateWebuiPublicationRecordInput): JsonRecord {
  const mode = authorityMode(input.authorityMode);
  const { release, cohort, carrier } = validateCarrierReceipt(input.carrierReceipt);
  const version = text(release.version, 'carrier receipt.release.version');
  const versionReadback = validateVersionReadback(input.versionReadback, version, String(carrier.digest));
  const publicationRun = runId(input.publicationRunId, 'publication run id');
  const publicationExecutorSha = sha(input.publicationExecutorSha, 'publication executor SHA');
  const stableRun = input.stableAuthorityRunId
    ? runId(input.stableAuthorityRunId, 'Stable authority run id')
    : null;
  const sourceAuthority = input.sourceAuthority ? validateWebuiSourceAuthority(input.sourceAuthority) : null;

  if (mode === 'independent_preview') {
    if (!sourceAuthority || !input.sourceAuthoritySha256) {
      throw new Error('Independent Preview durable publication requires one exact source authority record.');
    }
    if (!previewVersionPattern.test(version)) {
      throw new Error('Independent Preview durable publication version must use YY.M.D-preview.rN.');
    }
    exact(sourceAuthority.release.version, version, 'source authority release.version');
    exact(sourceAuthority.source_authority_digest, release.bundle_digest, 'source authority digest');
    exact(sourceAuthority.sources.app.source_commit, cohort.app_sha, 'source authority App SHA');
    exact(sourceAuthority.sources.shell.source_commit, cohort.shell_sha, 'source authority Shell SHA');
    exact(sourceAuthority.sources.framework.source_commit, cohort.framework_sha, 'source authority Framework SHA');
    exact(sourceAuthority.authorization.run_id, publicationRun, 'source authority publication run id');
    exact(sourceAuthority.authorization.executor_sha, publicationExecutorSha, 'source authority executor SHA');
    if (stableRun !== null) throw new Error('Independent Preview durable publication must not bind a Stable authority run.');
  } else {
    if (!stableRun) throw new Error('Stable-derived durable publication requires one Stable authority run id.');
    if (sourceAuthority !== null || input.sourceAuthoritySha256) {
      throw new Error('Stable-derived durable publication must not carry independent source authority.');
    }
  }

  const classification = publicationClassification(mode);
  const versionDigest = digest(versionReadback.digest, 'version readback.digest');
  const core = {
    schema: 'opl_app_webui_publication_record.v1',
    status: 'published',
    carrier: 'container_webui',
    publication_id: `docker-webui:${version}@${versionDigest}`,
    classification,
    release: {
      version,
      bundle_digest: digest(release.bundle_digest, 'carrier receipt.release.bundle_digest'),
      cohort_ref: digest(release.cohort_ref, 'carrier receipt.release.cohort_ref'),
    },
    cohort: {
      app_sha: sha(cohort.app_sha, 'carrier receipt.cohort.app_sha'),
      shell_sha: sha(cohort.shell_sha, 'carrier receipt.cohort.shell_sha'),
      framework_sha: sha(cohort.framework_sha, 'carrier receipt.cohort.framework_sha'),
    },
    image: {
      repository: webuiRepository,
      version_ref: `${webuiRepository}:${version}`,
      receipt_ref: `${webuiRepository}:receipt-${version}`,
      immutable_ref: `${webuiRepository}@${carrier.digest}`,
      version_digest: versionDigest,
      child_digest: digest(carrier.digest, 'carrier receipt.carrier.digest'),
      size_bytes: positiveInteger(carrier.size_bytes, 'carrier receipt.carrier.size_bytes'),
      content_fingerprint: digest(carrier.content_fingerprint, 'carrier receipt.carrier.content_fingerprint'),
    },
    authority: {
      mode,
      publication_workflow: expectedPublicationWorkflow(mode),
      publication_run_id: publicationRun,
      publication_run_attempt: 1,
      publication_executor_sha: publicationExecutorSha,
      stable_authority_run_id: stableRun,
      source_authority: sourceAuthority,
    },
    evidence: {
      carrier_receipt_sha256: digest(input.carrierReceiptSha256, 'carrier receipt SHA-256'),
      version_readback_sha256: digest(input.versionReadbackSha256, 'version readback SHA-256'),
      source_authority_sha256: input.sourceAuthoritySha256
        ? digest(input.sourceAuthoritySha256, 'source authority SHA-256')
        : null,
    },
  };
  return {
    ...core,
    publication_record_digest: `sha256:${crypto.createHash('sha256').update(canonicalJson(core)).digest('hex')}`,
  };
}

export function validateWebuiPublicationRecord(value: unknown): JsonRecord {
  const recordValue = record(value, 'WebUI durable publication record');
  const authority = record(recordValue.authority, 'publication authority');
  const evidence = record(recordValue.evidence, 'publication evidence');
  const rebuilt = createWebuiPublicationRecord({
    authorityMode: authorityMode(authority.mode),
    carrierReceipt: {
      schema: 'opl_app_webui_release_carrier.v1',
      release: recordValue.release,
      cohort: recordValue.cohort,
      carrier: {
        carrier_id: 'docker_webui',
        carrier_kind: 'oci_image',
        package_profile: 'webui-full',
        ref: record(recordValue.image, 'publication image').immutable_ref,
        digest: record(recordValue.image, 'publication image').child_digest,
        size_bytes: record(recordValue.image, 'publication image').size_bytes,
        content_fingerprint: record(recordValue.image, 'publication image').content_fingerprint,
      },
      qualification: {
        status: 'passed',
        image_digest: record(recordValue.image, 'publication image').child_digest,
        content_fingerprint: record(recordValue.image, 'publication image').content_fingerprint,
      },
    },
    carrierReceiptSha256: evidence.carrier_receipt_sha256,
    versionReadback: {
      schema: 'opl_app_webui_descriptor_readback.v1',
      status: 'present',
      ref: record(recordValue.image, 'publication image').version_ref,
      digest: record(recordValue.image, 'publication image').version_digest,
      child_digest: record(recordValue.image, 'publication image').child_digest,
      manifest_count: 1,
      media_type: 'application/vnd.oci.image.index.v1+json',
    },
    versionReadbackSha256: evidence.version_readback_sha256,
    publicationRunId: authority.publication_run_id,
    publicationExecutorSha: authority.publication_executor_sha,
    stableAuthorityRunId: authority.stable_authority_run_id ?? undefined,
    sourceAuthority: authority.source_authority ?? undefined,
    sourceAuthoritySha256: evidence.source_authority_sha256 ?? undefined,
  });
  if (canonicalJson(recordValue) !== canonicalJson(rebuilt)) {
    throw new Error('WebUI durable publication record does not match its exact canonical digest-bound shape.');
  }
  exact(
    recordValue.publication_record_digest,
    `sha256:${crypto.createHash('sha256').update(canonicalJson(canonicalCore(recordValue))).digest('hex')}`,
    'publication_record_digest',
  );
  return rebuilt;
}

function required(value: string | undefined, flag: string): string {
  if (!value?.trim()) throw new Error(`Missing --${flag}.`);
  return value.trim();
}

function main(argv: string[]): void {
  const command = argv[0];
  const { values } = parseArgs({
    args: argv.slice(1),
    strict: true,
    options: {
      'authority-mode': { type: 'string' },
      'carrier-receipt': { type: 'string' },
      'version-readback': { type: 'string' },
      'publication-run-id': { type: 'string' },
      'publication-executor-sha': { type: 'string' },
      'stable-authority-run-id': { type: 'string' },
      'source-authority': { type: 'string' },
      input: { type: 'string' },
      output: { type: 'string' },
    },
  });
  if (command === 'create') {
    const carrierReceiptPath = required(values['carrier-receipt'], 'carrier-receipt');
    const versionReadbackPath = required(values['version-readback'], 'version-readback');
    const sourceAuthorityPath = values['source-authority']?.trim();
    const publication = createWebuiPublicationRecord({
      authorityMode: authorityMode(required(values['authority-mode'], 'authority-mode')),
      carrierReceipt: readJson(carrierReceiptPath, 'carrier receipt'),
      carrierReceiptSha256: fileDigest(carrierReceiptPath, 'carrier receipt'),
      versionReadback: readJson(versionReadbackPath, 'version readback'),
      versionReadbackSha256: fileDigest(versionReadbackPath, 'version readback'),
      publicationRunId: required(values['publication-run-id'], 'publication-run-id'),
      publicationExecutorSha: required(values['publication-executor-sha'], 'publication-executor-sha'),
      stableAuthorityRunId: values['stable-authority-run-id']?.trim(),
      sourceAuthority: sourceAuthorityPath ? readJson(sourceAuthorityPath, 'source authority') : undefined,
      sourceAuthoritySha256: sourceAuthorityPath
        ? fileDigest(sourceAuthorityPath, 'source authority')
        : undefined,
    });
    const output = path.resolve(required(values.output, 'output'));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(publication, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({
      status: 'written',
      publication_id: publication.publication_id,
      receipt_ref: publication.image.receipt_ref,
      publication_record_digest: publication.publication_record_digest,
    })}\n`);
    return;
  }
  if (command === 'validate') {
    const publication = validateWebuiPublicationRecord(readJson(required(values.input, 'input'), 'publication record'));
    process.stdout.write(`${JSON.stringify({
      status: 'verified',
      publication_id: publication.publication_id,
      receipt_ref: publication.image.receipt_ref,
      publication_record_digest: publication.publication_record_digest,
    })}\n`);
    return;
  }
  throw new Error('Usage: webui-publication-record.ts <create|validate> ...');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
