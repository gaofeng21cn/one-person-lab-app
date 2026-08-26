import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { validateWebuiSourceAuthority, type JsonRecord } from './webui-source-authority.ts';

export type WebuiPublicationAuthorityMode =
  | 'independent_stable'
  | 'independent_preview';

const appRepository = 'gaofeng21cn/one-person-lab-app';
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const shaPattern = /^[0-9a-f]{40}$/;
const runPattern = /^[1-9][0-9]*$/;
const imageRepositoryPattern = /^ghcr\.io\/[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/;
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
  if (!['independent_stable', 'independent_preview'].includes(mode)) {
    throw new Error('WebUI publication authority mode is invalid.');
  }
  return mode;
}

export function validateWebuiImageRepository(value: unknown): string {
  const repository = text(value, 'WebUI image repository');
  if (!imageRepositoryPattern.test(repository)) {
    throw new Error('WebUI image repository must be one lowercase ghcr.io repository without a tag or digest.');
  }
  return repository;
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

function publicationClassification(mode: WebuiPublicationAuthorityMode, sourceAuthority: JsonRecord): JsonRecord {
  return mode === 'independent_stable'
    ? {
        quality_status: 'stable',
        build_trigger: sourceAuthority.build_trigger,
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

function expectedPublicationWorkflow(sourceAuthority: JsonRecord): string {
  return text(sourceAuthority.authorization?.workflow, 'source authority publication workflow');
}

function validateCarrierReceipt(
  value: unknown,
  imageRepository: string,
): {
  release: JsonRecord;
  cohort: JsonRecord;
  carrier: JsonRecord;
  qualification: JsonRecord;
  platforms: JsonRecord[];
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
  exact(carrier.ref, `${imageRepository}@${childDigest}`, 'carrier receipt.carrier.ref');
  positiveInteger(carrier.size_bytes, 'carrier receipt.carrier.size_bytes');
  digest(carrier.content_fingerprint, 'carrier receipt.carrier.content_fingerprint');
  exact(carrier.os, 'linux', 'carrier receipt.carrier.os');
  exact(carrier.architecture, 'multiarch', 'carrier receipt.carrier.architecture');
  if (!Array.isArray(carrier.platforms) || carrier.platforms.length !== 2) {
    throw new Error('carrier receipt.carrier.platforms must contain exactly amd64 and arm64.');
  }
  const platforms = carrier.platforms.map((value, index) => {
    const platform = record(value, `carrier receipt.carrier.platforms[${index}]`);
    const architecture = index === 0 ? 'amd64' : 'arm64';
    exact(platform.os, 'linux', `carrier receipt.carrier.platforms[${index}].os`);
    exact(platform.architecture, architecture, `carrier receipt.carrier.platforms[${index}].architecture`);
    const platformDigest = digest(platform.digest, `carrier receipt.carrier.platforms[${index}].digest`);
    exact(platform.ref, `${imageRepository}@${platformDigest}`, `carrier receipt.carrier.platforms[${index}].ref`);
    positiveInteger(platform.size_bytes, `carrier receipt.carrier.platforms[${index}].size_bytes`);
    digest(platform.content_fingerprint, `carrier receipt.carrier.platforms[${index}].content_fingerprint`);
    return platform;
  });
  const qualification = record(receipt.qualification, 'carrier receipt.qualification');
  exact(qualification.schema, 'opl_app_webui_runtime_qualification.v1', 'carrier receipt.qualification.schema');
  exact(qualification.status, 'passed', 'carrier receipt.qualification.status');
  exact(qualification.build_stage, 'webui_built', 'carrier receipt.qualification.build_stage');
  exact(qualification.qualification_stage, 'webui_qualified', 'carrier receipt.qualification.qualification_stage');
  exact(qualification.image_digest, childDigest, 'carrier receipt.qualification.image_digest');
  digest(qualification.build_input_digest, 'carrier receipt.qualification.build_input_digest');
  exact(
    qualification.content_fingerprint,
    carrier.content_fingerprint,
    'carrier receipt.qualification.content_fingerprint',
  );
  digest(qualification.runtime_summary_sha256, 'carrier receipt.qualification.runtime_summary_sha256');
  digest(qualification.registry_readback_sha256, 'carrier receipt.qualification.registry_readback_sha256');
  text(qualification.runtime_image_id, 'carrier receipt.qualification.runtime_image_id');
  if (!Array.isArray(qualification.platform_qualifications) || qualification.platform_qualifications.length !== 2) {
    throw new Error('carrier receipt qualification must contain exactly amd64 and arm64 runtime qualifications.');
  }
  for (const [index, value] of qualification.platform_qualifications.entries()) {
    const platform = record(value, `carrier receipt.qualification.platform_qualifications[${index}]`);
    exact(platform.os, 'linux', `platform qualification ${index} os`);
    exact(platform.architecture, index === 0 ? 'amd64' : 'arm64', `platform qualification ${index} architecture`);
    exact(platform.image_digest, platforms[index].digest, `platform qualification ${index} image digest`);
    digest(platform.build_input_digest, `platform qualification ${index} build input digest`);
    exact(platform.content_fingerprint, platforms[index].content_fingerprint, `platform qualification ${index} fingerprint`);
    digest(platform.runtime_summary_sha256, `platform qualification ${index} runtime summary`);
    text(platform.runtime_image_id, `platform qualification ${index} runtime image id`);
  }
  return { release, cohort, carrier, qualification, platforms };
}

function validateVersionReadback(
  value: unknown,
  version: string,
  childDigest: string,
  imageRepository: string,
  carrierPlatforms: JsonRecord[],
): JsonRecord {
  const readback = record(value, 'version readback');
  exact(readback.schema, 'opl_app_webui_descriptor_readback.v1', 'version readback.schema');
  exact(readback.ref, `${imageRepository}:${version}`, 'version readback.ref');
  exact(readback.status, 'present', 'version readback.status');
  digest(readback.digest, 'version readback.digest');
  exact(readback.child_digest, childDigest, 'version readback.child_digest');
  exact(readback.manifest_count, 2, 'version readback.manifest_count');
  if (![
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
  ].includes(text(readback.media_type, 'version readback.media_type'))) {
    throw new Error('version readback.media_type must be an OCI index or Docker manifest list.');
  }
  if (!Array.isArray(readback.platforms) || readback.platforms.length !== 2) {
    throw new Error('version readback.platforms must contain exactly amd64 and arm64.');
  }
  for (const [index, value] of readback.platforms.entries()) {
    const platform = record(value, `version readback.platforms[${index}]`);
    exact(platform.os, 'linux', `version readback.platforms[${index}].os`);
    exact(platform.architecture, index === 0 ? 'amd64' : 'arm64', `version readback.platforms[${index}].architecture`);
    exact(platform.digest, carrierPlatforms[index].digest, `version readback.platforms[${index}].digest`);
  }
  return readback;
}

function qualificationDisclosure(
  mode: WebuiPublicationAuthorityMode,
  qualificationInput: unknown,
  sourceAuthority: JsonRecord,
): JsonRecord {
  const runtimeQualification = record(qualificationInput, 'runtime qualification disclosure');
  exact(runtimeQualification.schema, 'opl_app_webui_runtime_qualification.v1', 'runtime qualification disclosure.schema');
  exact(runtimeQualification.status, 'passed', 'runtime qualification disclosure.status');
  exact(runtimeQualification.build_stage, 'webui_built', 'runtime qualification disclosure.build_stage');
  exact(runtimeQualification.qualification_stage, 'webui_qualified', 'runtime qualification disclosure.qualification_stage');
  digest(runtimeQualification.image_digest, 'runtime qualification disclosure.image_digest');
  digest(runtimeQualification.build_input_digest, 'runtime qualification disclosure.build_input_digest');
  digest(runtimeQualification.content_fingerprint, 'runtime qualification disclosure.content_fingerprint');
  digest(runtimeQualification.runtime_summary_sha256, 'runtime qualification disclosure.runtime_summary_sha256');
  digest(runtimeQualification.registry_readback_sha256, 'runtime qualification disclosure.registry_readback_sha256');
  text(runtimeQualification.runtime_image_id, 'runtime qualification disclosure.runtime_image_id');

  const stableQualification = mode === 'independent_stable'
    ? {
      schema: 'opl_app_webui_stable_qualification_disclosure.v1',
      status: 'passed',
      source_authority_digest: sourceAuthority.source_authority_digest,
      }
    : null;
  const nonStableGateDisclosure = mode === 'independent_stable'
    ? null
    : {
        schema: 'opl_app_webui_non_stable_gate_disclosure.v1',
        status: 'skipped',
        reason: 'independent_preview_not_stable',
        source_authority_digest: sourceAuthority.source_authority_digest,
        explicit_latest_override_required: true,
      };
  return {
    runtime_qualification: runtimeQualification,
    stable_qualification: stableQualification,
    non_stable_gate_disclosure: nonStableGateDisclosure,
  };
}

function canonicalCore(recordValue: JsonRecord): JsonRecord {
  const { publication_record_digest: _digest, ...core } = recordValue;
  return core;
}

export type CreateWebuiPublicationRecordInput = {
  authorityMode: WebuiPublicationAuthorityMode;
  imageRepository: string;
  carrierReceipt: JsonRecord;
  carrierReceiptSha256: string;
  versionReadback: JsonRecord;
  versionReadbackSha256: string;
  publicationRunId: string;
  publicationRunAttempt: number;
  publicationExecutorSha: string;
  sourceAuthority?: JsonRecord;
  sourceAuthoritySha256?: string;
};

export function createWebuiPublicationRecord(input: CreateWebuiPublicationRecordInput): JsonRecord {
  const mode = authorityMode(input.authorityMode);
  const imageRepository = validateWebuiImageRepository(input.imageRepository);
  const { release, cohort, carrier, qualification, platforms } = validateCarrierReceipt(input.carrierReceipt, imageRepository);
  const version = text(release.version, 'carrier receipt.release.version');
  const versionReadback = validateVersionReadback(
    input.versionReadback,
    version,
    String(carrier.digest),
    imageRepository,
    platforms,
  );
  const publicationRun = runId(input.publicationRunId, 'publication run id');
  const publicationRunAttempt = positiveInteger(input.publicationRunAttempt, 'publication run attempt');
  const publicationExecutorSha = sha(input.publicationExecutorSha, 'publication executor SHA');
  const sourceAuthority = input.sourceAuthority ? validateWebuiSourceAuthority(input.sourceAuthority) : null;

  if (!sourceAuthority || !input.sourceAuthoritySha256) {
    throw new Error('Independent Docker publication requires one exact source authority record.');
  }
  if (mode === 'independent_preview' && !previewVersionPattern.test(version)) {
    throw new Error('Independent Preview durable publication version must use YY.M.D-preview.rN.');
  }
  if (mode === 'independent_stable' && previewVersionPattern.test(version)) {
    throw new Error('Independent Stable durable publication must use a non-Preview version.');
  }
  exact(sourceAuthority.release.version, version, 'source authority release.version');
  exact(
    sourceAuthority.release.bundle_digest ?? sourceAuthority.source_authority_digest,
    release.bundle_digest,
    'source authority Release Bundle digest',
  );
  exact(
    sourceAuthority.release.cohort_ref ?? sourceAuthority.source_authority_digest,
    release.cohort_ref,
    'source authority release cohort ref',
  );
  exact(sourceAuthority.sources.app.source_commit, cohort.app_sha, 'source authority App SHA');
  exact(sourceAuthority.sources.shell.source_commit, cohort.shell_sha, 'source authority Shell SHA');
  exact(sourceAuthority.sources.framework.source_commit, cohort.framework_sha, 'source authority Framework SHA');
  exact(sourceAuthority.authorization.run_id, publicationRun, 'source authority publication run id');
  exact(sourceAuthority.authorization.executor_sha, publicationExecutorSha, 'source authority executor SHA');

  const classification = publicationClassification(mode, sourceAuthority);
  const disclosure = qualificationDisclosure(mode, qualification, sourceAuthority);
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
      repository: imageRepository,
      version_ref: `${imageRepository}:${version}`,
      receipt_ref: `${imageRepository}:receipt-${version}-${publicationRun}-${publicationRunAttempt}`,
      immutable_ref: `${imageRepository}@${carrier.digest}`,
      version_digest: versionDigest,
      child_digest: digest(carrier.digest, 'carrier receipt.carrier.digest'),
      size_bytes: positiveInteger(carrier.size_bytes, 'carrier receipt.carrier.size_bytes'),
      content_fingerprint: digest(carrier.content_fingerprint, 'carrier receipt.carrier.content_fingerprint'),
      platforms,
    },
    authority: {
      mode,
      publication_workflow: expectedPublicationWorkflow(sourceAuthority),
      publication_run_id: publicationRun,
      publication_run_attempt: publicationRunAttempt,
      publication_executor_sha: publicationExecutorSha,
      source_authority: sourceAuthority,
    },
    evidence: {
      carrier_receipt_sha256: digest(input.carrierReceiptSha256, 'carrier receipt SHA-256'),
      version_readback_sha256: digest(input.versionReadbackSha256, 'version readback SHA-256'),
      source_authority_sha256: digest(input.sourceAuthoritySha256, 'source authority SHA-256'),
    },
    qualification_disclosure: disclosure,
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
  const image = record(recordValue.image, 'publication image');
  const disclosure = record(recordValue.qualification_disclosure, 'qualification disclosure');
  const rebuilt = createWebuiPublicationRecord({
    authorityMode: authorityMode(authority.mode),
    imageRepository: validateWebuiImageRepository(image.repository),
    carrierReceipt: {
      schema: 'opl_app_webui_release_carrier.v1',
      release: recordValue.release,
      cohort: recordValue.cohort,
      carrier: {
        carrier_id: 'docker_webui',
        carrier_kind: 'oci_image',
        package_profile: 'webui-full',
        ref: image.immutable_ref,
        digest: image.child_digest,
        size_bytes: image.size_bytes,
        content_fingerprint: image.content_fingerprint,
        os: 'linux',
        architecture: 'multiarch',
        platforms: image.platforms,
      },
      qualification: record(disclosure.runtime_qualification, 'qualification disclosure.runtime_qualification'),
    },
    carrierReceiptSha256: evidence.carrier_receipt_sha256,
    versionReadback: {
      schema: 'opl_app_webui_descriptor_readback.v1',
      status: 'present',
      ref: image.version_ref,
      digest: image.version_digest,
      child_digest: image.child_digest,
      manifest_count: 2,
      media_type: 'application/vnd.oci.image.index.v1+json',
      platforms: (image.platforms as JsonRecord[]).map((platform) => ({
        os: platform.os,
        architecture: platform.architecture,
        digest: platform.digest,
      })),
    },
    versionReadbackSha256: evidence.version_readback_sha256,
    publicationRunId: authority.publication_run_id,
    publicationRunAttempt: authority.publication_run_attempt,
    publicationExecutorSha: authority.publication_executor_sha,
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
      'publication-run-attempt': { type: 'string' },
      'publication-executor-sha': { type: 'string' },
      'image-repository': { type: 'string' },
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
      imageRepository: required(values['image-repository'], 'image-repository'),
      carrierReceipt: readJson(carrierReceiptPath, 'carrier receipt'),
      carrierReceiptSha256: fileDigest(carrierReceiptPath, 'carrier receipt'),
      versionReadback: readJson(versionReadbackPath, 'version readback'),
      versionReadbackSha256: fileDigest(versionReadbackPath, 'version readback'),
      publicationRunId: required(values['publication-run-id'], 'publication-run-id'),
      publicationRunAttempt: positiveInteger(
        Number(required(values['publication-run-attempt'], 'publication-run-attempt')),
        'publication run attempt',
      ),
      publicationExecutorSha: required(values['publication-executor-sha'], 'publication-executor-sha'),
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
  if (command === 'validate-repository') {
    const imageRepository = validateWebuiImageRepository(required(values['image-repository'], 'image-repository'));
    process.stdout.write(`${JSON.stringify({ status: 'verified', image_repository: imageRepository })}\n`);
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
  throw new Error('Usage: webui-publication-record.ts <create|validate|validate-repository> ...');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
