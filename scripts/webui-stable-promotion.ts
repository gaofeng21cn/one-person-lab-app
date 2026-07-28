#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { validateWebuiSourceAuthority } from './webui-source-authority.ts';

type JsonRecord = Record<string, any>;
type DescriptorStatus = 'present' | 'absent' | 'unknown';
type PromotionDecision = 'idempotent' | 'write_once' | 'conflict' | 'prestate_unknown';
type AuthorityMode = 'production_follower' | 'development_validation' | 'independent_preview';
type MovingTag = 'stable' | 'latest';

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const shaPattern = /^[0-9a-f]{40}$/;
const runPattern = /^[1-9][0-9]*$/;
const versionPattern = /^[0-9]{2}\.[0-9]{1,2}\.[0-9]{1,2}(?:-r[1-9][0-9]*|-preview\.r[1-9][0-9]*|-nightly(?:\.r[1-9][0-9]*)?)?$/;
const appRepository = 'gaofeng21cn/one-person-lab-app';
const webuiRepository = 'ghcr.io/gaofeng21cn/one-person-lab-webui';

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
  if (!['production_follower', 'development_validation', 'independent_preview'].includes(mode)) {
    throw new Error('WebUI promotion authority mode is invalid.');
  }
  return mode;
}

function promotionTags(mode: AuthorityMode): MovingTag[] {
  return mode === 'production_follower' ? ['stable', 'latest'] : ['latest'];
}

function descriptorMatches(
  observation: JsonRecord,
  expected: JsonRecord,
): boolean {
  return observation.status === expected.status && observation.digest === expected.digest;
}

function validateStableAuthorityRun(
  run: JsonRecord,
  runId: string,
  authorityMode: AuthorityMode,
  frozenAppSha: string,
): void {
  exact(String(run.id), runId, 'Stable authority run.id');
  exact(run.repository?.full_name, appRepository, 'Stable authority run.repository');
  exact(run.head_repository?.full_name, appRepository, 'Stable authority run.head_repository');
  exact(run.path, '.github/workflows/release-stable.yml', 'Stable authority run.path');
  exact(run.event, 'workflow_dispatch', 'Stable authority run.event');
  exact(run.head_branch, 'main', 'Stable authority run.head_branch');
  exact(run.status, 'completed', 'Stable authority run.status');
  if (authorityMode === 'production_follower') {
    exact(run.conclusion, 'success', 'Stable authority run.conclusion');
  } else if (!['success', 'failure'].includes(text(run.conclusion, 'Stable authority run.conclusion'))) {
    throw new Error('Development source Stable authority run must have a terminal success or failure conclusion.');
  }
  exact(run.run_attempt, 1, 'Stable authority run.run_attempt');
  const sourceAppSha = sha(run.head_sha, 'Stable authority run.head_sha');
  if (authorityMode === 'development_validation') {
    exact(sourceAppSha, frozenAppSha, 'Stable authority run.head_sha');
  }
}

function validateCarrierFollowerRun(
  run: JsonRecord,
  runId: string,
  carrierExecutorAppSha: string,
  authorityMode: AuthorityMode,
): void {
  exact(String(run.id), runId, 'carrier follower run.id');
  exact(run.repository?.full_name, appRepository, 'carrier follower run.repository');
  exact(run.head_repository?.full_name, appRepository, 'carrier follower run.head_repository');
  exact(
    run.path,
    authorityMode === 'production_follower'
      ? '.github/workflows/release-webui-follower.yml'
      : '.github/workflows/release-webui-development.yml',
    'carrier follower run.path',
  );
  exact(
    run.event,
    authorityMode === 'production_follower' ? 'workflow_run' : 'workflow_dispatch',
    'carrier follower run.event',
  );
  exact(run.head_branch, 'main', 'carrier follower run.head_branch');
  const status = text(run.status, 'carrier follower run.status');
  if (authorityMode === 'independent_preview') {
    exact(status, 'completed', 'independent Preview carrier run.status');
    exact(run.conclusion, 'success', 'independent Preview carrier run.conclusion');
  } else if (!['in_progress', 'completed'].includes(status)) {
    throw new Error('carrier follower run.status must be in_progress or completed.');
  }
  exact(run.run_attempt, 1, 'carrier follower run.run_attempt');
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
  exact(job.run_attempt, 1, 'carrier follower job.run_attempt');
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
  authorityMode: AuthorityMode,
  carrierFollowerRunId: string,
): string {
  const callerWorkflow = authorityMode === 'production_follower'
    ? '.github/workflows/release-webui-follower.yml'
    : authorityMode === 'independent_preview'
      ? '.github/workflows/release-webui-development-promote.yml'
      : runId === carrierFollowerRunId
        ? '.github/workflows/release-webui-development.yml'
        : '.github/workflows/release-webui-development-promote.yml';
  exact(String(run.id), runId, 'promotion executor run.id');
  exact(run.repository?.full_name, appRepository, 'promotion executor run.repository');
  exact(run.head_repository?.full_name, appRepository, 'promotion executor run.head_repository');
  exact(run.path, callerWorkflow, 'promotion executor run.path');
  exact(
    run.event,
    authorityMode === 'production_follower' ? 'workflow_run' : 'workflow_dispatch',
    'promotion executor run.event',
  );
  exact(run.head_branch, 'main', 'promotion executor run.head_branch');
  if (!['in_progress', 'completed'].includes(text(run.status, 'promotion executor run.status'))) {
    throw new Error('promotion executor run.status must be in_progress or completed.');
  }
  exact(run.run_attempt, 1, 'promotion executor run.run_attempt');
  exact(sha(run.head_sha, 'promotion executor run.head_sha'), promotionAppSha, 'promotion executor run.head_sha');
  if (authorityMode === 'production_follower') {
    exact(runId, carrierFollowerRunId, 'production promotion executor run id');
  } else if (authorityMode === 'independent_preview' && runId === carrierFollowerRunId) {
    throw new Error(
      'Independent Preview immutable publication cannot also execute a Latest promotion.',
    );
  }
  return callerWorkflow;
}

function appWebuiCarrier(receipt: JsonRecord): {
  release: JsonRecord;
  cohort: JsonRecord;
  carrier: JsonRecord;
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
  exact(carrier.ref, `${webuiRepository}@${carrierDigest}`, 'carrier receipt.carrier.ref');
  positiveInteger(carrier.size_bytes, 'carrier receipt.carrier.size_bytes');
  digest(carrier.content_fingerprint, 'carrier receipt.carrier.content_fingerprint');
  exact(carrier.os, 'linux', 'carrier receipt.carrier.os');
  exact(carrier.architecture, 'amd64', 'carrier receipt.carrier.architecture');
  const qualification = record(receipt.qualification, 'carrier receipt.qualification');
  exact(qualification.status, 'passed', 'carrier receipt.qualification.status');
  exact(qualification.image_digest, carrierDigest, 'carrier receipt.qualification.image_digest');
  exact(
    qualification.content_fingerprint,
    carrier.content_fingerprint,
    'carrier receipt.qualification.content_fingerprint',
  );
  return { release, cohort, carrier };
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

export type WebuiStableAdmissionInput = {
  authorityMode?: AuthorityMode;
  stableAuthorityRun?: JsonRecord;
  stableAuthorityRunPath?: string;
  stableAuthorityRunId?: string;
  triggeredByStableRunId?: string;
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
  sourceAuthority?: JsonRecord;
  sourceAuthorityPath?: string;
};

export function admitWebuiStablePromotion(input: WebuiStableAdmissionInput): JsonRecord {
  const mode = authorityMode(input.authorityMode ?? 'production_follower');
  if (!runPattern.test(input.carrierFollowerRunId)) {
    throw new Error('carrier follower run id is invalid.');
  }
  if (!runPattern.test(input.promotionExecutorRunId)) {
    throw new Error('promotion executor run id is invalid.');
  }
  if (mode !== 'independent_preview') {
    if (!input.stableAuthorityRunId || !runPattern.test(input.stableAuthorityRunId)) {
      throw new Error('Stable authority run id is invalid.');
    }
    if (!input.triggeredByStableRunId || !runPattern.test(input.triggeredByStableRunId)) {
      throw new Error('triggering Stable authority run id is invalid.');
    }
    exact(
      input.triggeredByStableRunId,
      input.stableAuthorityRunId,
      'triggering Stable authority run id',
    );
    if (!input.stableAuthorityRun || !input.stableAuthorityRunPath) {
      throw new Error('Stable authority run readback is required for this promotion mode.');
    }
  } else if (!input.sourceAuthority || !input.sourceAuthorityPath) {
    throw new Error('Independent Preview promotion requires one exact source authority readback.');
  }
  const carrierExecutorAppSha = sha(input.carrierExecutorAppSha, 'carrier executor App SHA');
  const promotionAppSha = sha(input.promotionAppSha, 'promotion App SHA');
  const { release, cohort, carrier } = appWebuiCarrier(input.carrierReceipt);
  if (mode !== 'independent_preview') {
    validateStableAuthorityRun(
      input.stableAuthorityRun!,
      input.stableAuthorityRunId!,
      mode,
      cohort.app_sha,
    );
  }
  const sourceAuthority = mode === 'independent_preview'
    ? validateIndependentSourceAuthority(
        input.sourceAuthority!,
        input.sourceAuthorityPath!,
        release,
        cohort,
        input.carrierFollowerRunId,
        carrierExecutorAppSha,
      )
    : null;
  validateCarrierFollowerRun(
    input.carrierFollowerRun,
    input.carrierFollowerRunId,
    carrierExecutorAppSha,
    mode,
  );
  validateCarrierFollowerJob(
    input.carrierFollowerJob,
    input.carrierFollowerRunId,
    carrierExecutorAppSha,
  );
  const promotionCallerWorkflow = validatePromotionExecutorRun(
    input.promotionExecutorRun,
    input.promotionExecutorRunId,
    promotionAppSha,
    mode,
    input.carrierFollowerRunId,
  );

  const immutable = descriptor(input.immutableReadback, carrier.ref, 'immutable readback');
  exact(immutable.status, 'present', 'immutable readback.status');
  exact(immutable.digest, carrier.digest, 'immutable readback.digest');
  const versionRef = `${webuiRepository}:${release.version}`;
  const version = descriptor(input.versionReadback, versionRef, 'version readback');
  exact(version.status, 'present', 'version readback.status');
  const versionDigest = digest(version.digest, 'version readback.digest');
  exact(version.child_digest, carrier.digest, 'version readback.child_digest');
  exact(version.manifest_count, 1, 'version readback.manifest_count');
  if (![
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
  ].includes(text(version.media_type, 'version readback.media_type'))) {
    throw new Error('version readback.media_type must be an OCI index or Docker manifest list.');
  }
  const stableRef = `${webuiRepository}:stable`;
  const latestRef = `${webuiRepository}:latest`;
  const stablePrestate = descriptor(input.stablePrestate, stableRef, 'Stable prestate');
  const latestPrestate = descriptor(input.latestPrestate, latestRef, 'Latest prestate');
  if (stablePrestate.status === 'unknown' || latestPrestate.status === 'unknown') {
    throw new Error('Stable/latest prestate is unknown and cannot be treated as absent.');
  }
  const aliasesAligned =
    stablePrestate.status === latestPrestate.status
    && (stablePrestate.status !== 'present' || stablePrestate.digest === latestPrestate.digest);

  const evidence = {
    stable_authority_run_readback_sha256: input.stableAuthorityRunPath
      ? fileDigest(input.stableAuthorityRunPath)
      : null,
    carrier_follower_run_readback_sha256: fileDigest(input.carrierFollowerRunPath),
    carrier_follower_job_readback_sha256: fileDigest(input.carrierFollowerJobPath),
    promotion_executor_run_readback_sha256: fileDigest(input.promotionExecutorRunPath),
    carrier_receipt_sha256: fileDigest(input.carrierReceiptPath),
    immutable_readback_sha256: fileDigest(input.immutableReadbackPath),
    version_readback_sha256: fileDigest(input.versionReadbackPath),
    stable_prestate_sha256: fileDigest(input.stablePrestatePath),
    latest_prestate_sha256: fileDigest(input.latestPrestatePath),
    source_authority_sha256: input.sourceAuthorityPath
      ? fileDigest(input.sourceAuthorityPath)
      : null,
  };
  const authority = {
    authority_mode: mode,
    classification: mode === 'development_validation' || mode === 'independent_preview'
      ? {
          quality_status: 'preview',
          build_trigger: 'manual',
          preview_kind: 'dev',
          quality_unchanged: true,
          non_stable_notice: true,
        }
      : {
          quality_status: 'stable',
          build_trigger: 'automated',
          preview_kind: null,
          quality_unchanged: true,
          non_stable_notice: false,
        },
    stable_authority: mode === 'independent_preview' ? null : {
      app_repository: appRepository,
      run_id: input.stableAuthorityRunId,
      run_attempt: 1,
      app_head_sha: input.stableAuthorityRun!.head_sha,
      workflow: '.github/workflows/release-stable.yml',
      conclusion: input.stableAuthorityRun!.conclusion,
    },
    source_authority: sourceAuthority,
    carrier_follower: {
      app_repository: appRepository,
      run_id: input.carrierFollowerRunId,
      run_attempt: 1,
      carrier_job_id: input.carrierFollowerJob.id,
      carrier_job_name: input.carrierFollowerJob.name,
      app_head_sha: carrierExecutorAppSha,
      workflow: mode === 'production_follower'
        ? '.github/workflows/release-webui-follower.yml'
        : '.github/workflows/release-webui-development.yml',
      triggering_stable_authority_run_id: mode === 'independent_preview'
        ? null
        : input.stableAuthorityRunId,
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
      repository: webuiRepository,
      immutable_ref: carrier.ref,
      version_ref: versionRef,
      stable_ref: stableRef,
      latest_ref: latestRef,
      digest: versionDigest,
      child_digest: carrier.digest,
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

export function decideWebuiStablePromotion(
  admission: JsonRecord,
  currentStableInput: JsonRecord,
  currentLatestInput: JsonRecord,
): JsonRecord {
  exact(admission.schema, 'opl_app_webui_stable_promotion_admission.v5', 'admission schema');
  exact(admission.status, 'passed', 'admission status');
  exact(admission.mutation_admitted, true, 'admission mutation authorization');
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
      (mode === 'production_follower'
        && currentStable.status === 'present'
        && currentStable.digest === target.digest)
      || ((mode === 'development_validation' || mode === 'independent_preview') && stableMatchesExpected)
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
  exact(input.admission.schema, 'opl_app_webui_stable_promotion_admission.v5', 'admission schema');
  exact(input.decision.schema, 'opl_app_webui_stable_promotion_decision.v2', 'decision schema');
  const mode = authorityMode(input.admission.authority_mode);
  const target = record(input.admission.target, 'admission.target');
  const expected = record(input.admission.expected_prestate, 'admission.expected_prestate');
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
  const stableFinalObserved = mode === 'production_follower'
    ? anonymous.status === 'present' && anonymous.digest === target.digest
    : descriptorMatches(anonymous, expectedStable);
  const latestFinalObserved =
    latestAnonymous.status === 'present' && latestAnonymous.digest === target.digest;
  const targetObserved = stableFinalObserved && latestFinalObserved;
  const boundedStableObserved = observations.some((entry) =>
    mode === 'production_follower'
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
    authority_mode: input.admission.authority_mode,
    classification: input.admission.classification,
    admission_input_digest: input.admission.input_digest,
    decision_input_digest: input.decision.input_digest,
    stable_authority: input.admission.stable_authority,
    carrier_follower: input.admission.carrier_follower,
    promotion_executor: input.admission.promotion_executor,
    release: input.admission.release,
    target,
    compare_and_swap: {
      decision,
      expected_prestate: input.admission.expected_prestate,
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
      stable_unchanged: mode === 'development_validation' || mode === 'independent_preview'
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
      'stable-authority-run': { type: 'string' },
      'authority-mode': { type: 'string' },
      'stable-authority-run-id': { type: 'string' },
      'triggered-by-stable-run-id': { type: 'string' },
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
      'source-authority': { type: 'string' },
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
    const stableAuthorityRunPath = values['stable-authority-run']
      ? required(values['stable-authority-run'], 'stable-authority-run')
      : undefined;
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
    result = admitWebuiStablePromotion({
      authorityMode,
      stableAuthorityRun: stableAuthorityRunPath
        ? readJson(stableAuthorityRunPath, 'Stable authority run')
        : undefined,
      stableAuthorityRunPath,
      stableAuthorityRunId: values['stable-authority-run-id']
        ? required(values['stable-authority-run-id'], 'stable-authority-run-id')
        : undefined,
      triggeredByStableRunId: values['triggered-by-stable-run-id']
        ? required(values['triggered-by-stable-run-id'], 'triggered-by-stable-run-id')
        : undefined,
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
      sourceAuthority: sourceAuthorityPath
        ? readJson(sourceAuthorityPath, 'WebUI source authority')
        : undefined,
      sourceAuthorityPath,
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
