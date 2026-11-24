import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateWebuiImageRepository,
  validateWebuiPublicationRecord,
} from '../webui-publication-record.ts';
import { validateWebuiSourceAuthority } from '../webui-source-authority.ts';

export type JsonRecord = Record<string, any>;
type DescriptorStatus = 'present' | 'absent' | 'unknown';
type PromotionDecision = 'idempotent' | 'write_once' | 'conflict' | 'prestate_unknown';
export type AuthorityMode = 'independent_stable' | 'independent_preview';
type MovingTag = 'stable' | 'latest';

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const shaPattern = /^[0-9a-f]{40}$/;
const runPattern = /^[1-9][0-9]*$/;
const versionPattern = /^[0-9]{2}\.[0-9]{1,2}\.[0-9]{1,2}(?:-r[1-9][0-9]*|-preview\.r[1-9][0-9]*|-nightly(?:\.r[1-9][0-9]*)?)?$/;
const githubActorPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})?$/;
const appRepository = 'gaofeng21cn/one-person-lab-app';

export function record(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonRecord;
}

export function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

export function exact(value: unknown, expected: unknown, label: string): void {
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

function fileDigest(filePath: string): string {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path.resolve(filePath))).digest('hex')}`;
}

export function objectDigest(value: unknown): string {
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
  sourceAuthority: JsonRecord,
): JsonRecord {
  const label = mode === 'independent_stable' ? 'independent Stable' : 'independent Preview';
  const expected = mode === 'independent_stable'
    ? `move-docker-stable-and-latest:${releaseVersion}`
    : `move-docker-latest:${releaseVersion}`;
  if (sourceAuthority.authorization?.source === 'stable_standard_release') {
    exact(mode, 'independent_stable', 'automated Stable follower authority mode');
    return {
      schema: 'opl_app_webui_latest_operator_authorization.v1',
      source: 'stable_standard_same_run_follower',
      actor: githubActor(operator, 'Stable follower actor'),
      confirmation_digest: confirmationDigest(expected),
    };
  }
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

export function descriptor(value: unknown, expectedRef: string, label: string): JsonRecord {
  const observation = record(value, label);
  exact(observation.schema, 'opl_app_webui_descriptor_readback.v1', `${label}.schema`);
  exact(observation.ref, expectedRef, `${label}.ref`);
  const status = text(observation.status, `${label}.status`) as DescriptorStatus;
  if (!['present', 'absent', 'unknown'].includes(status)) throw new Error(`${label}.status is invalid.`);
  if (status === 'present') digest(observation.digest, `${label}.digest`);
  else if (observation.digest !== null) throw new Error(`${label}.digest must be null unless present.`);
  return observation;
}

export function authorityMode(value: unknown): AuthorityMode {
  const mode = text(value, 'authority mode') as AuthorityMode;
  if (!['independent_stable', 'independent_preview'].includes(mode)) {
    throw new Error('WebUI promotion authority mode is invalid.');
  }
  return mode;
}

export function promotionTags(mode: AuthorityMode): MovingTag[] {
  return mode === 'independent_stable' ? ['stable', 'latest'] : ['latest'];
}

export function descriptorMatches(
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
  sourceAuthority: JsonRecord,
): void {
  exact(String(run.id), runId, 'carrier follower run.id');
  exact(run.repository?.full_name, appRepository, 'carrier follower run.repository');
  exact(run.head_repository?.full_name, appRepository, 'carrier follower run.head_repository');
  const sourceWorkflow = text(sourceAuthority.authorization.workflow, 'source authority workflow');
  const publicationWorkflow = text(run.path, 'carrier follower run.path');
  if (![sourceWorkflow, '.github/workflows/release-webui-development.yml'].includes(publicationWorkflow)) {
    throw new Error('carrier follower run.path is not an authorized Docker publication entry.');
  }
  exact(
    run.event,
    'workflow_dispatch',
    'carrier follower run.event',
  );
  exact(run.head_branch, 'main', 'carrier follower run.head_branch');
  const status = text(run.status, 'carrier follower run.status');
  if (!['in_progress', 'completed'].includes(status)) {
    throw new Error('Docker carrier run.status must be in_progress or completed.');
  }
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
  exact(job.name, 'webui-carrier / publish-carrier', 'carrier follower job.name');
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
  sourceAuthority: JsonRecord,
): string {
  const sourceWorkflow = text(sourceAuthority.authorization.workflow, 'source authority workflow');
  const callerWorkflow = text(run.path, 'promotion executor run.path');
  if (![sourceWorkflow, '.github/workflows/release-webui-development.yml'].includes(callerWorkflow)) {
    throw new Error('promotion executor run.path is not an authorized Docker promotion entry.');
  }
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
  qualifiedArtifactRunId?: string,
): JsonRecord {
  const authority = validateWebuiSourceAuthority(authorityInput);
  if (qualifiedArtifactRunId) {
    exact(authority.authorization.run_id, qualifiedArtifactRunId, 'qualified source authority authorization.run_id');
  } else {
    exact(authority.authorization.run_id, carrierFollowerRunId, 'source authority authorization.run_id');
    exact(authority.authorization.executor_sha, carrierExecutorAppSha, 'source authority authorization.executor_sha');
  }
  exact(authority.release.version, release.version, 'source authority release.version');
  exact(
    authority.release.bundle_digest ?? authority.source_authority_digest,
    release.bundle_digest,
    'source authority digest and carrier release.bundle_digest',
  );
  exact(
    release.cohort_ref,
    authority.release.cohort_ref ?? authority.source_authority_digest,
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
  const sourceAuthority = validateIndependentSourceAuthority(
        durablePublication!.sourceAuthority,
        input.publicationRecordPath!,
        release,
        cohort,
        input.carrierFollowerRunId,
        carrierExecutorAppSha,
        durablePublication.publication.authority.qualified_artifact_run_id,
      );
  const latestOperatorAuthorization = operatorAuthorization(
    mode,
    release.version,
    input.operator,
    input.operatorConfirmation,
    sourceAuthority,
  );
  const carrierRunAttempt = durablePublication.publicationRunAttempt;
  validateCarrierFollowerRun(
    input.carrierFollowerRun,
    input.carrierFollowerRunId,
    carrierExecutorAppSha,
    carrierRunAttempt,
    sourceAuthority,
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
    sourceAuthority,
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
          build_trigger: sourceAuthority.build_trigger,
          preview_kind: 'dev',
          quality_unchanged: true,
          non_stable_notice: true,
        }
      : {
          quality_status: 'stable',
          build_trigger: sourceAuthority.build_trigger,
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
      workflow: input.carrierFollowerRun.path,
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

export function validateWebuiStablePromotionAdmission(value: unknown): JsonRecord {
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
    record(admission.source_authority, 'admission.source_authority'),
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
