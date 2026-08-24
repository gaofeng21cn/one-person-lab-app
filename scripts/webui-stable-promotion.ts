#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  validateWebuiImageRepository,
  validateWebuiPublicationRecord,
} from './webui-publication-record.ts';
import { validateWebuiSourceAuthority } from './webui-source-authority.ts';

type JsonRecord = Record<string, any>;
type DescriptorStatus = 'present' | 'absent' | 'unknown';
type PromotionDecision = 'idempotent' | 'write_once' | 'conflict' | 'prestate_unknown';
type AuthorityMode = 'independent_stable' | 'independent_preview';
type MovingTag = 'stable' | 'latest';

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const shaPattern = /^[0-9a-f]{40}$/;
const runPattern = /^[1-9][0-9]*$/;
const versionPattern = /^[0-9]{2}\.[0-9]{1,2}\.[0-9]{1,2}(?:-r[1-9][0-9]*|-preview\.r[1-9][0-9]*|-nightly(?:\.r[1-9][0-9]*)?)?$/;
const githubActorPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})?$/;
const appRepository = 'gaofeng21cn/one-person-lab-app';

function record(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
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

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(`${label} must be a positive integer.`);
  return Number(value);
}

function readJson(filePath: string, label: string): JsonRecord {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`${label} must be one non-empty regular JSON file.`);
  }
  return record(JSON.parse(fs.readFileSync(resolved, 'utf8')), label);
}

function fileDigest(filePath: string): string {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path.resolve(filePath))).digest('hex')}`;
}

function objectDigest(value: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function confirmationDigest(value: string): string {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function githubActor(value: unknown, label: string): string {
  const actor = text(value, label);
  if (!githubActorPattern.test(actor)) throw new Error(`${label} must be a human GitHub login.`);
  return actor;
}

function operatorAuthorization(
  mode: AuthorityMode,
  releaseVersion: string,
  operator: unknown,
  confirmation: unknown,
): JsonRecord {
  const label = mode === 'independent_stable' ? 'independent Stable' : 'independent Preview';
  const expected = mode === 'independent_stable'
    ? `move-docker-stable-and-latest:${releaseVersion}`
    : `move-docker-latest:${releaseVersion}`;
  const value = text(confirmation, `${label} operator confirmation`);
  exact(
    value,
    expected,
    `${label} operator confirmation`,
  );
  return {
    schema: 'opl_app_webui_latest_operator_authorization.v1',
    source: 'workflow_dispatch_exact_version_confirmation',
    actor: githubActor(operator, `${label} operator`),
    confirmation_digest: confirmationDigest(value),
  };
}

function descriptor(value: unknown, expectedRef: string, label: string): JsonRecord {
  const observation = record(value, label);
  exact(observation.schema, 'opl_app_webui_descriptor_readback.v1', `${label}.schema`);
  exact(observation.ref, expectedRef, `${label}.ref`);
  const status = text(observation.status, `${label}.status`) as DescriptorStatus;
  if (!['present', 'absent', 'unknown'].includes(status)) throw new Error(`${label}.status is invalid.`);
  if (status === 'present') digest(observation.digest, `${label}.digest`);
  else if (observation.digest !== null) throw new Error(`${label}.digest must be null unless present.`);
  return observation;
}

function authorityMode(value: unknown): AuthorityMode {
  const mode = text(value, 'authority mode') as AuthorityMode;
  if (!['independent_stable', 'independent_preview'].includes(mode)) {
    throw new Error('WebUI promotion authority mode is invalid.');
  }
  return mode;
}

function promotionTags(mode: AuthorityMode): MovingTag[] {
  return mode === 'independent_stable' ? ['stable', 'latest'] : ['latest'];
}

function descriptorMatches(
  observation: JsonRecord,
  expected: JsonRecord,
): boolean {
  return observation.status === expected.status && observation.digest === expected.digest;
}

function validateCarrierFollowerRun(
  run: JsonRecord,
  runId: string,
  carrierExecutorAppSha: string,
  expectedRunAttempt: number,
): void {
  exact(String(run.id), runId, 'carrier follower run.id');
  exact(run.repository?.full_name, appRepository, 'carrier follower run.repository');
  exact(run.head_repository?.full_name, appRepository, 'carrier follower run.head_repository');
  exact(
    run.path,
    '.github/workflows/release-webui-development.yml',
    'carrier follower run.path',
  );
  exact(
    run.event,
    'workflow_dispatch',
    'carrier follower run.event',
  );
  exact(run.head_branch, 'main', 'carrier follower run.head_branch');
  const status = text(run.status, 'carrier follower run.status');
  exact(status, 'completed', 'independent Docker carrier run.status');
  exact(run.conclusion, 'success', 'independent Docker carrier run.conclusion');
  exact(run.run_attempt, expectedRunAttempt, 'carrier follower run.run_attempt');
  exact(
    sha(run.head_sha, 'carrier follower run.head_sha'),
    carrierExecutorAppSha,
    'carrier follower run.head_sha',
  );
}

function validateCarrierFollowerJob(
  job: JsonRecord,
  followerRunId: string,
  carrierExecutorAppSha: string,
  expectedRunAttempt: number,
): void {
  positiveInteger(job.id, 'carrier follower job.id');
  exact(String(job.run_id), followerRunId, 'carrier follower job.run_id');
  exact(
    job.run_url,
    `https://api.github.com/repos/${appRepository}/actions/runs/${followerRunId}`,
    'carrier follower job.run_url',
  );
  exact(job.name, 'webui-carrier / publish-immutable-carrier', 'carrier follower job.name');
  exact(job.status, 'completed', 'carrier follower job.status');
  exact(job.conclusion, 'success', 'carrier follower job.conclusion');
  exact(job.run_attempt, expectedRunAttempt, 'carrier follower job.run_attempt');
  exact(
    sha(job.head_sha, 'carrier follower job.head_sha'),
    carrierExecutorAppSha,
    'carrier follower job.head_sha',
  );
}

function validatePromotionExecutorRun(
  run: JsonRecord,
  runId: string,
  promotionAppSha: string,
  carrierFollowerRunId: string,
): string {
  const callerWorkflow = '.github/workflows/release-webui-development.yml';
  exact(String(run.id), runId, 'promotion executor run.id');
  exact(run.repository?.full_name, appRepository, 'promotion executor run.repository');
  exact(run.head_repository?.full_name, appRepository, 'promotion executor run.head_repository');
  exact(run.path, callerWorkflow, 'promotion executor run.path');
  exact(
    run.event,
    'workflow_dispatch',
    'promotion executor run.event',
  );
  exact(run.head_branch, 'main', 'promotion executor run.head_branch');
  if (!['in_progress', 'completed'].includes(text(run.status, 'promotion executor run.status'))) {
    throw new Error('promotion executor run.status must be in_progress or completed.');
  }
  exact(run.run_attempt, 1, 'promotion executor run.run_attempt');
  exact(sha(run.head_sha, 'promotion executor run.head_sha'), promotionAppSha, 'promotion executor run.head_sha');
  if (runId === carrierFollowerRunId) {
    throw new Error(
      'Independent immutable publication cannot also execute moving-tag promotion.',
    );
  }
  return callerWorkflow;
}

function appWebuiCarrier(receipt: JsonRecord): {
  release: JsonRecord;
  cohort: JsonRecord;
  carrier: JsonRecord;
  repository: string;
} {
  exact(receipt.schema, 'opl_app_webui_release_carrier.v1', 'carrier receipt.schema');
  const release = record(receipt.release, 'carrier receipt.release');
  const version = text(release.version, 'carrier receipt.release.version');
  if (!versionPattern.test(version)) throw new Error('carrier receipt release.version is invalid.');
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
  const carrierDigest = digest(carrier.digest, 'carrier receipt.carrier.digest');
  const carrierRef = text(carrier.ref, 'carrier receipt.carrier.ref');
  const separator = carrierRef.lastIndexOf('@');
  if (separator <= 0) throw new Error('carrier receipt.carrier.ref must be an immutable image reference.');
  const repository = validateWebuiImageRepository(carrierRef.slice(0, separator));
  exact(carrierRef, `${repository}@${carrierDigest}`, 'carrier receipt.carrier.ref');
  positiveInteger(carrier.size_bytes, 'carrier receipt.carrier.size_bytes');
  digest(carrier.content_fingerprint, 'carrier receipt.carrier.content_fingerprint');
  exact(carrier.os, 'linux', 'carrier receipt.carrier.os');
  exact(carrier.architecture, 'multiarch', 'carrier receipt.carrier.architecture');
  if (!Array.isArray(carrier.platforms) || carrier.platforms.length !== 2) {
    throw new Error('carrier receipt must contain exactly amd64 and arm64 platforms.');
  }
  for (const [index, value] of carrier.platforms.entries()) {
    const platform = record(value, `carrier receipt.carrier.platforms[${index}]`);
    exact(platform.os, 'linux', `carrier platform ${index} os`);
    exact(platform.architecture, index === 0 ? 'amd64' : 'arm64', `carrier platform ${index} architecture`);
    const platformDigest = digest(platform.digest, `carrier platform ${index} digest`);
    exact(platform.ref, `${repository}@${platformDigest}`, `carrier platform ${index} ref`);
  }
  const qualification = record(receipt.qualification, 'carrier receipt.qualification');
  exact(qualification.status, 'passed', 'carrier receipt.qualification.status');
  exact(qualification.image_digest, carrierDigest, 'carrier receipt.qualification.image_digest');
  exact(
    qualification.content_fingerprint,
    carrier.content_fingerprint,
    'carrier receipt.qualification.content_fingerprint',
  );
  return { release, cohort, carrier, repository };
}

function validateIndependentSourceAuthority(
  authorityInput: JsonRecord,
  authorityPath: string,
  release: JsonRecord,
  cohort: JsonRecord,
  carrierFollowerRunId: string,
  carrierExecutorAppSha: string,
): JsonRecord {
  const authority = validateWebuiSourceAuthority(authorityInput);
  exact(authority.authorization.run_id, carrierFollowerRunId, 'source authority authorization.run_id');
  exact(authority.authorization.executor_sha, carrierExecutorAppSha, 'source authority authorization.executor_sha');
  exact(authority.release.version, release.version, 'source authority release.version');
  exact(
    authority.source_authority_digest,
    release.bundle_digest,
    'source authority digest and carrier release.bundle_digest',
  );
  exact(
    release.cohort_ref,
    authority.source_authority_digest,
    'carrier release.cohort_ref and source authority digest',
  );
  exact(authority.sources.app.source_commit, cohort.app_sha, 'source authority App SHA');
  exact(authority.sources.shell.source_commit, cohort.shell_sha, 'source authority Shell SHA');
  exact(authority.sources.framework.source_commit, cohort.framework_sha, 'source authority Framework SHA');
  if (!authorityPath.trim()) throw new Error('source authority readback path is empty.');
  return authority;
}

function validateIndependentPublicationRecord(
  value: unknown,
  expectedMode: 'independent_stable' | 'independent_preview',
  recordPath: string,
  release: JsonRecord,
  cohort: JsonRecord,
  carrier: JsonRecord,
  repository: string,
  carrierFollowerRunId: string,
  carrierExecutorAppSha: string,
): { publication: JsonRecord; sourceAuthority: JsonRecord; publicationRunAttempt: number } {
  if (!recordPath.trim()) throw new Error('independent Docker durable publication record path is empty.');
  const publication = validateWebuiPublicationRecord(value);
  exact(publication.status, 'published', 'durable publication status');
  const authority = record(publication.authority, 'durable publication authority');
  exact(authority.mode, expectedMode, 'durable publication authority.mode');
  exact(authority.publication_run_id, carrierFollowerRunId, 'durable publication run id');
  exact(
    authority.publication_executor_sha,
    carrierExecutorAppSha,
    'durable publication executor SHA',
  );
  const publicationRunAttempt = positiveInteger(
    authority.publication_run_attempt,
    'durable publication run attempt',
  );
  const image = record(publication.image, 'durable publication image');
  exact(image.repository, repository, 'durable publication image repository');
  exact(image.immutable_ref, carrier.ref, 'durable publication immutable ref');
  exact(image.child_digest, carrier.digest, 'durable publication child digest');
  if (JSON.stringify(image.platforms) !== JSON.stringify(carrier.platforms)) {
    throw new Error('durable publication platforms must match the exact carrier platform descriptors.');
  }
  exact(image.size_bytes, carrier.size_bytes, 'durable publication image size');
  exact(
    image.content_fingerprint,
    carrier.content_fingerprint,
    'durable publication content fingerprint',
  );
  const publicationRelease = record(publication.release, 'durable publication release');
  const publicationCohort = record(publication.cohort, 'durable publication cohort');
  exact(publicationRelease.version, release.version, 'durable publication release.version');
  exact(publicationRelease.bundle_digest, release.bundle_digest, 'durable publication bundle digest');
  exact(publicationRelease.cohort_ref, release.cohort_ref, 'durable publication cohort ref');
  exact(publicationCohort.app_sha, cohort.app_sha, 'durable publication App SHA');
  exact(publicationCohort.shell_sha, cohort.shell_sha, 'durable publication Shell SHA');
  exact(publicationCohort.framework_sha, cohort.framework_sha, 'durable publication Framework SHA');
  const disclosure = record(publication.qualification_disclosure, 'durable publication qualification disclosure');
  const runtimeQualification = record(
    disclosure.runtime_qualification,
    'durable publication runtime qualification',
  );
  exact(runtimeQualification.image_digest, carrier.digest, 'durable publication qualification image digest');
  exact(
    runtimeQualification.content_fingerprint,
    carrier.content_fingerprint,
    'durable publication qualification content fingerprint',
  );
  if (expectedMode === 'independent_stable') {
    const stable = record(disclosure.stable_qualification, 'independent Stable qualification disclosure');
    exact(stable.status, 'passed', 'independent Stable qualification status');
    exact(disclosure.non_stable_gate_disclosure, null, 'independent Stable non-Stable disclosure');
  } else {
    exact(disclosure.stable_qualification, null, 'independent Preview stable qualification disclosure');
    const nonStable = record(
      disclosure.non_stable_gate_disclosure,
      'independent Preview non-Stable disclosure',
    );
    exact(nonStable.reason, 'independent_preview_not_stable', 'independent Preview non-Stable reason');
    exact(nonStable.explicit_latest_override_required, true, 'independent Preview Latest override');
  }
  return {
    publication,
    sourceAuthority: record(authority.source_authority, 'durable publication source authority'),
    publicationRunAttempt,
  };
}

export type WebuiStableAdmissionInput = {
  authorityMode?: AuthorityMode;
  carrierFollowerRun: JsonRecord;
  carrierFollowerRunPath: string;
  carrierFollowerRunId: string;
  carrierFollowerJob: JsonRecord;
  carrierFollowerJobPath: string;
  carrierExecutorAppSha: string;
  promotionExecutorRun: JsonRecord;
  promotionExecutorRunPath: string;
  promotionExecutorRunId: string;
  promotionAppSha: string;
  carrierReceipt: JsonRecord;
  carrierReceiptPath: string;
  immutableReadback: JsonRecord;
  immutableReadbackPath: string;
  versionReadback: JsonRecord;
  versionReadbackPath: string;
  stablePrestate: JsonRecord;
  stablePrestatePath: string;
  latestPrestate: JsonRecord;
  latestPrestatePath: string;
  publicationRecord?: JsonRecord;
  publicationRecordPath?: string;
  sourceAuthority?: JsonRecord;
  sourceAuthorityPath?: string;
  operator?: string;
  operatorConfirmation?: string;
};

export function admitWebuiStablePromotion(input: WebuiStableAdmissionInput): JsonRecord {
  const mode = authorityMode(input.authorityMode ?? 'independent_stable');
  if (!runPattern.test(input.carrierFollowerRunId)) {
    throw new Error('carrier follower run id is invalid.');
  }
  if (!runPattern.test(input.promotionExecutorRunId)) {
    throw new Error('promotion executor run id is invalid.');
  }
  if (!input.publicationRecord || !input.publicationRecordPath) {
    throw new Error('Independent Docker promotion requires one exact durable publication record.');
  }
  const carrierExecutorAppSha = sha(input.carrierExecutorAppSha, 'carrier executor App SHA');
  const promotionAppSha = sha(input.promotionAppSha, 'promotion App SHA');
  const { release, cohort, carrier, repository } = appWebuiCarrier(input.carrierReceipt);
  const durablePublication = validateIndependentPublicationRecord(
        input.publicationRecord!,
        mode,
        input.publicationRecordPath!,
        release,
        cohort,
        carrier,
        repository,
        input.carrierFollowerRunId,
        carrierExecutorAppSha,
      );
  const latestOperatorAuthorization = operatorAuthorization(
    mode,
    release.version,
    input.operator,
    input.operatorConfirmation,
  );
  const sourceAuthority = validateIndependentSourceAuthority(
        durablePublication!.sourceAuthority,
        input.publicationRecordPath!,
        release,
        cohort,
        input.carrierFollowerRunId,
        carrierExecutorAppSha,
      );
  const carrierRunAttempt = durablePublication.publicationRunAttempt;
  validateCarrierFollowerRun(
    input.carrierFollowerRun,
    input.carrierFollowerRunId,
    carrierExecutorAppSha,
    carrierRunAttempt,
  );
  validateCarrierFollowerJob(
    input.carrierFollowerJob,
    input.carrierFollowerRunId,
    carrierExecutorAppSha,
    carrierRunAttempt,
  );
  const promotionCallerWorkflow = validatePromotionExecutorRun(
    input.promotionExecutorRun,
    input.promotionExecutorRunId,
    promotionAppSha,
    input.carrierFollowerRunId,
  );

  const immutable = descriptor(input.immutableReadback, carrier.ref, 'immutable readback');
  exact(immutable.status, 'present', 'immutable readback.status');
  exact(immutable.digest, carrier.digest, 'immutable readback.digest');
  const versionRef = `${repository}:${release.version}`;
  const version = descriptor(input.versionReadback, versionRef, 'version readback');
  exact(version.status, 'present', 'version readback.status');
  const versionDigest = digest(version.digest, 'version readback.digest');
  exact(version.child_digest, carrier.digest, 'version readback.child_digest');
  exact(version.manifest_count, 2, 'version readback.manifest_count');
  if (![
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
  ].includes(text(version.media_type, 'version readback.media_type'))) {
    throw new Error('version readback.media_type must be an OCI index or Docker manifest list.');
  }
  if (!Array.isArray(version.platforms) || version.platforms.length !== 2) {
    throw new Error('version readback.platforms must contain exactly amd64 and arm64.');
  }
  for (const [index, value] of version.platforms.entries()) {
    const platform = record(value, `version readback.platforms[${index}]`);
    const carrierPlatform = record(
      (carrier.platforms as JsonRecord[])[index],
      `carrier receipt.carrier.platforms[${index}]`,
    );
    exact(platform.os, 'linux', `version readback.platforms[${index}].os`);
    exact(platform.architecture, index === 0 ? 'amd64' : 'arm64', `version readback.platforms[${index}].architecture`);
    exact(platform.digest, carrierPlatform.digest, `version readback.platforms[${index}].digest`);
  }
  const stableRef = `${repository}:stable`;
  const latestRef = `${repository}:latest`;
  const stablePrestate = descriptor(input.stablePrestate, stableRef, 'Stable prestate');
  const latestPrestate = descriptor(input.latestPrestate, latestRef, 'Latest prestate');
  if (stablePrestate.status === 'unknown' || latestPrestate.status === 'unknown') {
    throw new Error('Stable/latest prestate is unknown and cannot be treated as absent.');
  }
  const aliasesAligned =
    stablePrestate.status === latestPrestate.status
    && (stablePrestate.status !== 'present' || stablePrestate.digest === latestPrestate.digest);

  const evidence = {
    carrier_follower_run_readback_sha256: fileDigest(input.carrierFollowerRunPath),
    carrier_follower_job_readback_sha256: fileDigest(input.carrierFollowerJobPath),
    promotion_executor_run_readback_sha256: fileDigest(input.promotionExecutorRunPath),
    carrier_receipt_sha256: fileDigest(input.carrierReceiptPath),
    immutable_readback_sha256: fileDigest(input.immutableReadbackPath),
    version_readback_sha256: fileDigest(input.versionReadbackPath),
    stable_prestate_sha256: fileDigest(input.stablePrestatePath),
    latest_prestate_sha256: fileDigest(input.latestPrestatePath),
    source_authority_sha256: record(durablePublication.publication.evidence, 'durable publication evidence').source_authority_sha256,
    publication_record_sha256: input.publicationRecordPath
      ? fileDigest(input.publicationRecordPath)
      : null,
  };
  const authority = {
    authority_mode: mode,
    classification: mode === 'independent_preview'
      ? {
          quality_status: 'preview',
          build_trigger: 'manual',
          preview_kind: 'dev',
          quality_unchanged: true,
          non_stable_notice: true,
        }
      : {
          quality_status: 'stable',
          build_trigger: 'manual',
          preview_kind: null,
          quality_unchanged: true,
          non_stable_notice: false,
        },
    source_authority: sourceAuthority,
    operator_authorization: latestOperatorAuthorization,
    carrier_follower: {
      app_repository: appRepository,
      run_id: input.carrierFollowerRunId,
      run_attempt: carrierRunAttempt,
      carrier_job_id: input.carrierFollowerJob.id,
      carrier_job_name: input.carrierFollowerJob.name,
      app_head_sha: carrierExecutorAppSha,
      workflow: '.github/workflows/release-webui-development.yml',
    },
    promotion_executor: {
      app_repository: appRepository,
      run_id: input.promotionExecutorRunId,
      run_attempt: 1,
      app_head_sha: promotionAppSha,
      workflow: '.github/workflows/release-webui-stable.yml',
      caller_workflow: promotionCallerWorkflow,
      job: 'promote-webui-stable',
    },
    release: {
      version: release.version,
      bundle_digest: release.bundle_digest,
      cohort_ref: release.cohort_ref,
      app_sha: cohort.app_sha,
      shell_sha: cohort.shell_sha,
      framework_sha: cohort.framework_sha,
    },
    target: {
      repository,
      immutable_ref: carrier.ref,
      version_ref: versionRef,
      stable_ref: stableRef,
      latest_ref: latestRef,
      digest: versionDigest,
      child_digest: carrier.digest,
      platforms: carrier.platforms,
      size_bytes: carrier.size_bytes,
      content_fingerprint: carrier.content_fingerprint,
      promotion_tags: promotionTags(mode),
    },
    expected_prestate: {
      aliases_aligned: aliasesAligned,
      stable: {
        status: stablePrestate.status,
        digest: stablePrestate.digest,
      },
      latest: {
        status: latestPrestate.status,
        digest: latestPrestate.digest,
      },
    },
    evidence,
  };
  return {
    schema: 'opl_app_webui_stable_promotion_admission.v5',
    status: 'passed',
    mutation_admitted: true,
    input_digest: objectDigest(authority),
    ...authority,
  };
}

function validateWebuiStablePromotionAdmission(value: unknown): JsonRecord {
  const admission = record(value, 'admission');
  exact(admission.schema, 'opl_app_webui_stable_promotion_admission.v5', 'admission schema');
  exact(admission.status, 'passed', 'admission status');
  exact(admission.mutation_admitted, true, 'admission mutation authorization');
  const mode = authorityMode(admission.authority_mode);
  const release = record(admission.release, 'admission.release');
  const target = record(admission.target, 'admission.target');
  const repository = validateWebuiImageRepository(target.repository);
  digest(target.digest, 'admission.target.digest');
  digest(target.child_digest, 'admission.target.child_digest');
  if (!Array.isArray(target.platforms) || target.platforms.length !== 2) {
    throw new Error('admission.target.platforms must contain exactly amd64 and arm64.');
  }
  for (const [index, value] of target.platforms.entries()) {
    const platform = record(value, `admission.target.platforms[${index}]`);
    const architecture = index === 0 ? 'amd64' : 'arm64';
    exact(platform.os, 'linux', `admission target platform ${index} os`);
    exact(platform.architecture, architecture, `admission target platform ${index} architecture`);
    const platformDigest = digest(platform.digest, `admission target platform ${index} digest`);
    exact(platform.ref, `${repository}@${platformDigest}`, `admission target platform ${index} ref`);
    positiveInteger(platform.size_bytes, `admission target platform ${index} size`);
    digest(platform.content_fingerprint, `admission target platform ${index} fingerprint`);
  }
  const latestOperatorAuthorization = operatorAuthorization(
    mode,
    text(release.version, 'admission.release.version'),
    record(admission.operator_authorization ?? {}, 'admission.operator_authorization').actor,
    mode === 'independent_stable'
      ? `move-docker-stable-and-latest:${text(release.version, 'admission.release.version')}`
      : mode === 'independent_preview'
        ? `move-docker-latest:${text(release.version, 'admission.release.version')}`
        : '',
  );
  if (mode === 'independent_preview' || mode === 'independent_stable') {
    const authorization = record(admission.operator_authorization, 'admission.operator_authorization');
    exact(
      authorization.confirmation_digest,
      latestOperatorAuthorization!.confirmation_digest,
      'admission.operator_authorization.confirmation_digest',
    );
    exact(authorization.source, latestOperatorAuthorization!.source, 'admission.operator_authorization.source');
    exact(authorization.schema, latestOperatorAuthorization!.schema, 'admission.operator_authorization.schema');
  } else {
    exact(admission.operator_authorization, null, 'admission.operator_authorization');
  }
  const authority = {
    authority_mode: admission.authority_mode,
    classification: admission.classification,
    source_authority: admission.source_authority,
    operator_authorization: admission.operator_authorization,
    carrier_follower: admission.carrier_follower,
    promotion_executor: admission.promotion_executor,
    release: admission.release,
    target: admission.target,
    expected_prestate: admission.expected_prestate,
    evidence: admission.evidence,
  };
  exact(admission.input_digest, objectDigest(authority), 'admission.input_digest');
  return admission;
}

export function decideWebuiStablePromotion(
  admission: JsonRecord,
  currentStableInput: JsonRecord,
  currentLatestInput: JsonRecord,
): JsonRecord {
  admission = validateWebuiStablePromotionAdmission(admission);
  const mode = authorityMode(admission.authority_mode);
  const target = record(admission.target, 'admission.target');
  if (JSON.stringify(target.promotion_tags) !== JSON.stringify(promotionTags(mode))) {
    throw new Error('admission target promotion tags do not match the authority mode.');
  }
  const expected = record(admission.expected_prestate, 'admission.expected_prestate');
  const expectedStable = record(expected.stable, 'admission.expected_prestate.stable');
  const expectedLatest = record(expected.latest, 'admission.expected_prestate.latest');
  const currentStable = descriptor(
    currentStableInput,
    text(target.stable_ref, 'target stable ref'),
    'current Stable readback',
  );
  const currentLatest = descriptor(
    currentLatestInput,
    text(target.latest_ref, 'target latest ref'),
    'current Latest readback',
  );
  const stableMatchesExpected = descriptorMatches(currentStable, expectedStable);
  const latestMatchesExpected = descriptorMatches(currentLatest, expectedLatest);
  const expectedMatchesCurrent = stableMatchesExpected && latestMatchesExpected;
  let decision: PromotionDecision;
  let writeCount = 0;
  if (currentStable.status === 'unknown' || currentLatest.status === 'unknown') {
    decision = 'prestate_unknown';
  } else if (
    currentLatest.status === 'present'
    && currentLatest.digest === target.digest
    && (
      (mode === 'independent_stable'
        && currentStable.status === 'present'
        && currentStable.digest === target.digest)
      || (mode === 'independent_preview' && stableMatchesExpected)
    )
  ) {
    decision = 'idempotent';
  } else if (expectedMatchesCurrent) {
    decision = 'write_once';
    writeCount = 1;
  } else {
    decision = 'conflict';
  }
  const authority = {
    admission_input_digest: admission.input_digest,
    stable_ref: target.stable_ref,
    latest_ref: target.latest_ref,
    target_digest: target.digest,
    authority_mode: mode,
    promotion_tags: promotionTags(mode),
    expected_prestate: expected,
    observed_prestate: {
      stable: { status: currentStable.status, digest: currentStable.digest },
      latest: { status: currentLatest.status, digest: currentLatest.digest },
    },
    decision,
    authorized_tag_attempts: writeCount,
  };
  return {
    schema: 'opl_app_webui_stable_promotion_decision.v2',
    status: decision === 'idempotent' || decision === 'write_once' ? 'admitted' : 'rejected',
    decision,
    write_performed: false,
    input_digest: objectDigest(authority),
    ...authority,
  };
}

export function writeWebuiStablePromotionReceipt(input: {
  admission: JsonRecord;
  decision: JsonRecord;
  mutation: JsonRecord;
  readbacks: JsonRecord;
  latestReadbacks: JsonRecord;
  anonymousReadback: JsonRecord;
  latestAnonymousReadback: JsonRecord;
}): JsonRecord {
  const admission = validateWebuiStablePromotionAdmission(input.admission);
  exact(input.decision.schema, 'opl_app_webui_stable_promotion_decision.v2', 'decision schema');
  exact(input.decision.admission_input_digest, admission.input_digest, 'decision.admission_input_digest');
  const mode = authorityMode(admission.authority_mode);
  const target = record(admission.target, 'admission.target');
  const expected = record(admission.expected_prestate, 'admission.expected_prestate');
  const expectedStable = record(expected.stable, 'admission.expected_prestate.stable');
  const decision = text(input.decision.decision, 'decision.decision') as PromotionDecision;
  const attemptCount = Number(input.mutation.attempt_count);
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 0 || attemptCount > 1) {
    throw new Error('mutation attempt_count must be zero or one.');
  }
  const readbacks = input.readbacks;
  exact(readbacks.schema, 'opl_app_webui_stable_reconcile_readbacks.v1', 'readbacks schema');
  if (!Array.isArray(readbacks.observations) || readbacks.observations.length > 3) {
    throw new Error('bounded reconcile must contain at most three observations.');
  }
  const observations = readbacks.observations.map((value: unknown, index: number) =>
    descriptor(value, target.stable_ref, `readbacks[${index}]`));
  const latestReadbacks = input.latestReadbacks;
  exact(latestReadbacks.schema, 'opl_app_webui_stable_reconcile_readbacks.v1', 'latest readbacks schema');
  if (!Array.isArray(latestReadbacks.observations) || latestReadbacks.observations.length > 3) {
    throw new Error('bounded Latest reconcile must contain at most three observations.');
  }
  const latestObservations = latestReadbacks.observations.map((value: unknown, index: number) =>
    descriptor(value, target.latest_ref, `latestReadbacks[${index}]`));
  const anonymous = descriptor(input.anonymousReadback, target.stable_ref, 'anonymous final readback');
  const latestAnonymous = descriptor(
    input.latestAnonymousReadback,
    target.latest_ref,
    'anonymous Latest final readback',
  );
  const stableFinalObserved = mode === 'independent_stable'
    ? anonymous.status === 'present' && anonymous.digest === target.digest
    : descriptorMatches(anonymous, expectedStable);
  const latestFinalObserved =
    latestAnonymous.status === 'present' && latestAnonymous.digest === target.digest;
  const targetObserved = stableFinalObserved && latestFinalObserved;
  const boundedStableObserved = observations.some((entry) =>
    mode === 'independent_stable'
      ? entry.status === 'present' && entry.digest === target.digest
      : descriptorMatches(entry, expectedStable));
  const boundedLatestObserved = latestObservations.some(
    (entry) => entry.status === 'present' && entry.digest === target.digest,
  );
  const boundedTargetObserved = boundedStableObserved && boundedLatestObserved;
  let status: 'complete' | 'idempotent' | 'reconciled_complete' | 'outcome_unknown' | 'failed';
  if (decision === 'idempotent') {
    if (attemptCount !== 0) throw new Error('idempotent decision cannot perform a tag mutation.');
    status = targetObserved ? 'idempotent' : 'failed';
  } else if (decision === 'write_once') {
    if (attemptCount === 0 && input.mutation.status === 'not_attempted') {
      status = 'failed';
    } else if (attemptCount !== 1) {
      throw new Error('write_once decision permits zero pre-mutation failure attempts or exactly one tag attempt.');
    } else if (targetObserved && boundedTargetObserved && input.mutation.status === 'accepted') {
      status = 'complete';
    } else if (
      targetObserved
      && boundedTargetObserved
      && input.mutation.status === 'unknown'
    ) {
      status = 'reconciled_complete';
    } else {
      status = 'outcome_unknown';
    }
  } else {
    if (attemptCount !== 0) throw new Error('rejected CAS decision cannot perform a tag mutation.');
    status = 'failed';
  }
  const evidence = {
    authority_mode: admission.authority_mode,
    classification: admission.classification,
    admission_input_digest: admission.input_digest,
    decision_input_digest: input.decision.input_digest,
    operator_authorization: admission.operator_authorization,
    carrier_follower: admission.carrier_follower,
    promotion_executor: admission.promotion_executor,
    release: admission.release,
    target,
    compare_and_swap: {
      decision,
      expected_prestate: admission.expected_prestate,
      observed_prestate: input.decision.observed_prestate,
      promotion_tags: promotionTags(mode),
      tag_attempt_count: attemptCount,
      second_tag_attempted: false,
    },
    mutation: input.mutation,
    reconcile: {
      maximum_readbacks: 3,
      performed_readbacks: Math.max(observations.length, latestObservations.length),
      stable_expected_state_observed: boundedStableObserved,
      latest_target_observed: boundedLatestObserved,
    },
    anonymous_readback: {
      stable: {
        status: anonymous.status,
        digest: anonymous.digest,
      },
      latest: {
        status: latestAnonymous.status,
        digest: latestAnonymous.digest,
      },
      logout_before_readback: input.anonymousReadback.logout_before_readback === true,
      stable_unchanged: mode === 'independent_preview'
        ? stableFinalObserved
        : null,
    },
  };
  if (status !== 'failed' && status !== 'outcome_unknown') {
    if (
      evidence.anonymous_readback.logout_before_readback !== true
      || input.latestAnonymousReadback.logout_before_readback !== true
      || !targetObserved
    ) {
      status = attemptCount === 1 ? 'outcome_unknown' : 'failed';
    }
  }
  return {
    schema: 'opl_app_webui_stable_promotion_receipt.v5',
    status,
    mutation_performed: attemptCount === 1,
    retry_allowed: false,
    input_digest: objectDigest(evidence),
    ...evidence,
  };
}

function required(value: string | undefined, flag: string): string {
  if (!value?.trim()) throw new Error(`Missing --${flag}.`);
  return value.trim();
}

function writeOutput(filePath: string, value: JsonRecord): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function main(argv: string[]): void {
  const command = argv[0];
  const { values } = parseArgs({
    args: argv.slice(1),
    strict: true,
    options: {
      'authority-mode': { type: 'string' },
      'carrier-follower-run': { type: 'string' },
      'carrier-follower-run-id': { type: 'string' },
      'carrier-follower-job': { type: 'string' },
      'carrier-executor-app-sha': { type: 'string' },
      'promotion-executor-run': { type: 'string' },
      'promotion-executor-run-id': { type: 'string' },
      'promotion-app-sha': { type: 'string' },
      'carrier-receipt': { type: 'string' },
      'immutable-readback': { type: 'string' },
      'version-readback': { type: 'string' },
      'stable-prestate': { type: 'string' },
      'latest-prestate': { type: 'string' },
      'publication-record': { type: 'string' },
      'source-authority': { type: 'string' },
      operator: { type: 'string' },
      'operator-confirmation': { type: 'string' },
      admission: { type: 'string' },
      decision: { type: 'string' },
      'current-stable': { type: 'string' },
      'current-latest': { type: 'string' },
      mutation: { type: 'string' },
      readbacks: { type: 'string' },
      'latest-readbacks': { type: 'string' },
      'anonymous-readback': { type: 'string' },
      'latest-anonymous-readback': { type: 'string' },
      output: { type: 'string' },
    },
  });
  let result: JsonRecord;
  if (command === 'admit') {
    const authorityMode = required(values['authority-mode'], 'authority-mode') as AuthorityMode;
    const carrierFollowerRunPath = required(
      values['carrier-follower-run'],
      'carrier-follower-run',
    );
    const carrierFollowerJobPath = required(
      values['carrier-follower-job'],
      'carrier-follower-job',
    );
    const promotionExecutorRunPath = required(
      values['promotion-executor-run'],
      'promotion-executor-run',
    );
    const carrierReceiptPath = required(values['carrier-receipt'], 'carrier-receipt');
    const immutableReadbackPath = required(values['immutable-readback'], 'immutable-readback');
    const versionReadbackPath = required(values['version-readback'], 'version-readback');
    const stablePrestatePath = required(values['stable-prestate'], 'stable-prestate');
    const latestPrestatePath = required(values['latest-prestate'], 'latest-prestate');
    const sourceAuthorityPath = values['source-authority']
      ? required(values['source-authority'], 'source-authority')
      : undefined;
    const publicationRecordPath = values['publication-record']
      ? required(values['publication-record'], 'publication-record')
      : undefined;
    result = admitWebuiStablePromotion({
      authorityMode,
      carrierFollowerRun: readJson(carrierFollowerRunPath, 'carrier follower run'),
      carrierFollowerRunPath,
      carrierFollowerRunId: required(
        values['carrier-follower-run-id'],
        'carrier-follower-run-id',
      ),
      carrierFollowerJob: readJson(carrierFollowerJobPath, 'carrier follower job'),
      carrierFollowerJobPath,
      carrierExecutorAppSha: required(
        values['carrier-executor-app-sha'],
        'carrier-executor-app-sha',
      ),
      promotionExecutorRun: readJson(promotionExecutorRunPath, 'promotion executor run'),
      promotionExecutorRunPath,
      promotionExecutorRunId: required(
        values['promotion-executor-run-id'],
        'promotion-executor-run-id',
      ),
      promotionAppSha: required(values['promotion-app-sha'], 'promotion-app-sha'),
      carrierReceipt: readJson(carrierReceiptPath, 'carrier receipt'),
      carrierReceiptPath,
      immutableReadback: readJson(immutableReadbackPath, 'immutable readback'),
      immutableReadbackPath,
      versionReadback: readJson(versionReadbackPath, 'version readback'),
      versionReadbackPath,
      stablePrestate: readJson(stablePrestatePath, 'Stable prestate'),
      stablePrestatePath,
      latestPrestate: readJson(latestPrestatePath, 'Latest prestate'),
      latestPrestatePath,
      publicationRecord: publicationRecordPath
        ? readJson(publicationRecordPath, 'durable publication record')
        : undefined,
      publicationRecordPath,
      sourceAuthority: sourceAuthorityPath
        ? readJson(sourceAuthorityPath, 'WebUI source authority')
        : undefined,
      sourceAuthorityPath,
      operator: values.operator ? required(values.operator, 'operator') : undefined,
      operatorConfirmation: values['operator-confirmation']
        ? required(values['operator-confirmation'], 'operator-confirmation')
        : undefined,
    });
  } else if (command === 'decide') {
    result = decideWebuiStablePromotion(
      readJson(required(values.admission, 'admission'), 'admission'),
      readJson(required(values['current-stable'], 'current-stable'), 'current Stable readback'),
      readJson(required(values['current-latest'], 'current-latest'), 'current Latest readback'),
    );
  } else if (command === 'receipt') {
    result = writeWebuiStablePromotionReceipt({
      admission: readJson(required(values.admission, 'admission'), 'admission'),
      decision: readJson(required(values.decision, 'decision'), 'decision'),
      mutation: readJson(required(values.mutation, 'mutation'), 'mutation'),
      readbacks: readJson(required(values.readbacks, 'readbacks'), 'readbacks'),
      latestReadbacks: readJson(
        required(values['latest-readbacks'], 'latest-readbacks'),
        'Latest readbacks',
      ),
      anonymousReadback: readJson(
        required(values['anonymous-readback'], 'anonymous-readback'),
        'anonymous readback',
      ),
      latestAnonymousReadback: readJson(
        required(values['latest-anonymous-readback'], 'latest-anonymous-readback'),
        'anonymous Latest readback',
      ),
    });
  } else {
    throw new Error('Usage: webui-stable-promotion.ts <admit|decide|receipt> [options].');
  }
  writeOutput(required(values.output, 'output'), result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
