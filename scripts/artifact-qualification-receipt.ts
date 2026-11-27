import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { validateFullFrameworkDaemonProof } from './full-framework-daemon-proof.ts';
import type { BuildArtifactCohortV2 } from './build-artifact-cohort.ts';
import { sha256File, validateFrozenCodexCliIdentity } from './build-artifact-cohort.ts';
import {
  validateQualificationHarnessScopeProof,
  type QualificationHarnessScopeProof,
} from './qualification-harness-scope.ts';

export type TemporalServiceSupervisorProofV1 = {
  schema: 'opl_temporal_service_supervisor_proof.v1';
  status: 'passed';
  runtime_profile: 'full';
  applicable: true;
  required: true;
  supervisor_label: string;
  start_action: Record<string, unknown>;
  restart_action: Record<string, unknown>;
  plist: Record<string, unknown>;
  initial_readback: Record<string, unknown>;
  keep_alive_recovery: Record<string, unknown>;
  restart_readback: Record<string, unknown>;
  session_reload: Record<string, unknown>;
  persistent_database: Record<string, unknown>;
};

export type ArtifactQualificationReceiptV1 = {
  schema: 'opl_app_artifact_qualification_receipt.v1';
  status: 'passed' | 'failed';
  stable_session_id: string;
  release_cohort_ref: string;
  version: string;
  package_profile: 'standard' | 'full' | 'homebrew-standard' | 'homebrew-full';
  qualification: {
    run_id: string;
    source_artifact_run_id: string;
    source_artifact_name: string;
    evidence_ref: string;
    result: 'passed' | 'failed';
  };
  artifact: BuildArtifactCohortV2['artifact'];
  cohort: BuildArtifactCohortV2['cohort'];
  build_manifest: {
    schema: BuildArtifactCohortV2['schema'];
    sha256: string;
    smoke_harness_sha256: string;
    qualification_input_manifest_sha256: string;
    full_input_manifest_sha256: string | null;
    full_package_manifest_sha256: string | null;
    full_toolchain_observation_receipt_sha256: string | null;
  };
  qualification_runtime: BuildArtifactCohortV2['qualification_runtime'];
  verification_harness: {
    app_sha: string;
    shell_sha: string;
    smoke_harness_sha256: string;
    differs_from_artifact_cohort: boolean;
    change_scope: 'same_as_artifact_cohort' | 'harness_mechanics_only';
    scope_proof: QualificationHarnessScopeProof;
  } | null;
  smoke_summary: {
    path: string | null;
    sha256: string | null;
    temporal_service_supervisor_proof: TemporalServiceSupervisorProofV1 | null;
    framework_daemon_proof?: Record<string, unknown>;
  };
};

const digestPattern = /^[0-9a-f]{64}$/;
const digestRefPattern = /^sha256:[0-9a-f]{64}$/;
const shaPattern = /^[0-9a-f]{40}$/i;
const temporalSupervisorLabel = 'ai.opl.family-runtime.temporal-service';
const temporalDatabasePathPattern = /\/Library\/Application Support\/OPL\/state\/family-runtime\/temporal-server\/temporal\.sqlite$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : null;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function validateReadyTemporalSupervisorReadback(
  value: unknown,
  label: string,
  expectedDatabasePath: string,
): string[] {
  const errors: string[] = [];
  const readback = isRecord(value) ? value : {};
  const supervisor = isRecord(readback.supervisor) ? readback.supervisor : {};
  if (readback.service_ready !== true) errors.push(`${label}.service_ready is not true`);
  if (readback.server_reachable !== true) errors.push(`${label}.server_reachable is not true`);
  for (const field of [
    'installed',
    'loaded',
    'ready',
    'supported',
    'applicable',
    'required',
    'configuration_current',
    'run_at_load',
    'keep_alive',
    'schedule_independent',
  ]) {
    if (supervisor[field] !== true) errors.push(`${label}.supervisor.${field} is not true`);
  }
  if (supervisor.process_state !== 'running') {
    errors.push(`${label}.supervisor.process_state is ${String(supervisor.process_state)}`);
  }
  if (!positiveInteger(supervisor.pid)) errors.push(`${label}.supervisor.pid is invalid`);
  if (supervisor.error !== null) errors.push(`${label}.supervisor.error is ${String(supervisor.error)}`);
  if (typeof supervisor.observed_at !== 'string' || !supervisor.observed_at) {
    errors.push(`${label}.supervisor.observed_at is invalid`);
  }
  if (supervisor.database_path !== expectedDatabasePath) {
    errors.push(`${label}.supervisor.database_path is ${String(supervisor.database_path)}`);
  }
  return errors;
}

function temporalReadbackPid(value: unknown): number | null {
  const readback = isRecord(value) ? value : {};
  const supervisor = isRecord(readback.supervisor) ? readback.supervisor : {};
  return positiveInteger(supervisor.pid) ? supervisor.pid : null;
}

function validateManagedTemporalServiceStatus(value: unknown, label: string): string[] {
  const errors: string[] = [];
  const status = isRecord(value) ? value : {};
  const supervisor = isRecord(status.supervisor) ? status.supervisor : {};
  if (status.service_status !== 'running') {
    errors.push(`${label}.service_status is ${String(status.service_status)}`);
  }
  if (status.server_reachable !== true) errors.push(`${label}.server_reachable is not true`);
  for (const field of [
    'supported',
    'applicable',
    'required',
    'installed',
    'loaded',
    'ready',
    'configuration_current',
  ]) {
    if (supervisor[field] !== true) errors.push(`${label}.supervisor.${field} is not true`);
  }
  if (supervisor.process_state !== 'running') {
    errors.push(`${label}.supervisor.process_state is ${String(supervisor.process_state)}`);
  }
  if (!positiveInteger(supervisor.pid)) errors.push(`${label}.supervisor.pid is invalid`);
  if (supervisor.error !== null) errors.push(`${label}.supervisor.error is ${String(supervisor.error)}`);
  return errors;
}

function validateTemporalActionEnvelope(
  value: unknown,
  label: string,
  actionId: string,
  delegatedSurface: string,
): { errors: string[]; service: Record<string, unknown> } {
  const action = isRecord(value) ? value : {};
  const errors: string[] = [];
  if (action.action_id !== actionId) errors.push(`${label}.action_id is ${String(action.action_id)}`);
  if (action.dry_run !== false) errors.push(`${label}.dry_run is not false`);
  if (action.delegated_surface !== delegatedSurface) {
    errors.push(`${label}.delegated_surface is ${String(action.delegated_surface)}`);
  }
  const result = isRecord(action.result) ? action.result : {};
  if (!isRecord(action.result)) errors.push(`${label}.result is missing`);
  const service = isRecord(result.family_runtime_service) ? result.family_runtime_service : {};
  if (!isRecord(result.family_runtime_service)) {
    errors.push(`${label}.result.family_runtime_service is missing`);
  }
  return { errors, service };
}

function temporalActionService(value: unknown): Record<string, unknown> {
  const action = isRecord(value) ? value : {};
  const result = isRecord(action.result) ? action.result : {};
  return isRecord(result.family_runtime_service) ? result.family_runtime_service : {};
}

function temporalActionStatusPid(value: unknown): number | null {
  const service = temporalActionService(value);
  const status = isRecord(service.status) ? service.status : {};
  const supervisor = isRecord(status.supervisor) ? status.supervisor : {};
  return positiveInteger(supervisor.pid) ? supervisor.pid : null;
}

function validateTemporalStartAction(value: unknown): string[] {
  const label = 'start_action';
  const { errors, service } = validateTemporalActionEnvelope(
    value,
    label,
    'provider_service_start',
    'opl family-runtime service start --provider temporal',
  );
  if (service.action !== 'start') errors.push(`${label}.result.family_runtime_service.action is ${String(service.action)}`);
  if (service.start_status !== 'started_supervised' && service.start_status !== 'already_running') {
    errors.push(`${label}.result.family_runtime_service.start_status is ${String(service.start_status)}`);
  }
  errors.push(...validateManagedTemporalServiceStatus(
    service.status,
    `${label}.result.family_runtime_service.status`,
  ));
  return errors;
}

function validateTemporalRestartAction(value: unknown): string[] {
  const label = 'restart_action';
  const { errors, service } = validateTemporalActionEnvelope(
    value,
    label,
    'provider_service_restart',
    'opl family-runtime service restart --provider temporal',
  );
  if (service.action !== 'restart') {
    errors.push(`${label}.result.family_runtime_service.action is ${String(service.action)}`);
  }
  if (service.restart_status !== 'restarted') {
    errors.push(`${label}.result.family_runtime_service.restart_status is ${String(service.restart_status)}`);
  }
  if (service.applicable !== true) errors.push(`${label}.result.family_runtime_service.applicable is not true`);
  if (service.ready !== true) errors.push(`${label}.result.family_runtime_service.ready is not true`);
  if (service.supervisor_pid_changed !== true) {
    errors.push(`${label}.result.family_runtime_service.supervisor_pid_changed is not true`);
  }
  const previousPid = positiveInteger(service.previous_supervisor_pid) ? service.previous_supervisor_pid : null;
  const currentPid = positiveInteger(service.supervisor_pid) ? service.supervisor_pid : null;
  if (previousPid === null) {
    errors.push(`${label}.result.family_runtime_service.previous_supervisor_pid is invalid`);
  }
  if (currentPid === null) errors.push(`${label}.result.family_runtime_service.supervisor_pid is invalid`);
  if (previousPid !== null && currentPid !== null && previousPid === currentPid) {
    errors.push(`${label}.result.family_runtime_service supervisor PID did not change`);
  }
  errors.push(...validateManagedTemporalServiceStatus(
    service.status,
    `${label}.result.family_runtime_service.status`,
  ));
  const status = isRecord(service.status) ? service.status : {};
  const supervisor = isRecord(status.supervisor) ? status.supervisor : {};
  if (currentPid !== null && supervisor.pid !== currentPid) {
    errors.push(`${label}.result.family_runtime_service.status.supervisor.pid does not match supervisor_pid`);
  }
  return errors;
}

export function validateTemporalServiceSupervisorProof(proof: unknown): string[] {
  const errors: string[] = [];
  const value = isRecord(proof) ? proof : {};
  if (value.schema !== 'opl_temporal_service_supervisor_proof.v1') {
    errors.push(`temporal supervisor proof schema is ${String(value.schema)}`);
  }
  if (value.status !== 'passed') errors.push(`temporal supervisor proof status is ${String(value.status)}`);
  if (value.runtime_profile !== 'full') {
    errors.push(`temporal supervisor proof runtime_profile is ${String(value.runtime_profile)}`);
  }
  if (value.applicable !== true) errors.push('temporal supervisor proof applicable is not true');
  if (value.required !== true) errors.push('temporal supervisor proof required is not true');
  if (value.supervisor_label !== temporalSupervisorLabel) {
    errors.push(`temporal supervisor label is ${String(value.supervisor_label)}`);
  }

  errors.push(...validateTemporalStartAction(value.start_action));
  errors.push(...validateTemporalRestartAction(value.restart_action));

  const persistentDatabase = isRecord(value.persistent_database) ? value.persistent_database : {};
  const databasePath = typeof persistentDatabase.path === 'string' ? persistentDatabase.path : '';
  if (!path.isAbsolute(databasePath) || !temporalDatabasePathPattern.test(databasePath)) {
    errors.push(`temporal persistent database path is ${databasePath || 'missing'}`);
  }
  if (persistentDatabase.sqlite_header_valid !== true) {
    errors.push('temporal persistent database sqlite_header_valid is not true');
  }
  if (typeof persistentDatabase.file_identity !== 'string' || !persistentDatabase.file_identity) {
    errors.push('temporal persistent database file_identity is missing');
  }
  for (const field of [
    'same_file_after_keep_alive_recovery',
    'same_file_after_restart',
    'same_file_after_session_reload',
  ]) {
    if (persistentDatabase[field] !== true) {
      errors.push(`temporal persistent database ${field} is not true`);
    }
  }

  const plist = isRecord(value.plist) ? value.plist : {};
  const plistPath = typeof plist.path === 'string' ? plist.path : '';
  const programArguments = stringArray(plist.program_arguments) ?? [];
  const databaseArgumentIndex = programArguments.indexOf('--db-filename');
  if (!path.isAbsolute(plistPath) || !plistPath.endsWith(`/Library/LaunchAgents/${temporalSupervisorLabel}.plist`)) {
    errors.push(`temporal supervisor plist path is ${plistPath || 'missing'}`);
  }
  if (plist.label !== temporalSupervisorLabel) errors.push(`temporal supervisor plist label is ${String(plist.label)}`);
  if (plist.run_at_load !== true) errors.push('temporal supervisor plist run_at_load is not true');
  if (plist.keep_alive !== true) errors.push('temporal supervisor plist keep_alive is not true');
  if (!programArguments.includes('server') || !programArguments.includes('start-dev')) {
    errors.push('temporal supervisor plist ProgramArguments does not start the Temporal server');
  }
  if (databaseArgumentIndex < 0 || programArguments[databaseArgumentIndex + 1] !== databasePath) {
    errors.push('temporal supervisor plist ProgramArguments has an invalid --db-filename');
  }
  if (plist.database_path !== databasePath) errors.push('temporal supervisor plist database_path is inconsistent');

  errors.push(...validateReadyTemporalSupervisorReadback(value.initial_readback, 'initial_readback', databasePath));
  const keepAliveRecovery = isRecord(value.keep_alive_recovery) ? value.keep_alive_recovery : {};
  errors.push(...validateReadyTemporalSupervisorReadback(
    keepAliveRecovery.readback,
    'keep_alive_recovery.readback',
    databasePath,
  ));
  errors.push(...validateReadyTemporalSupervisorReadback(value.restart_readback, 'restart_readback', databasePath));
  const sessionReload = isRecord(value.session_reload) ? value.session_reload : {};
  errors.push(...validateReadyTemporalSupervisorReadback(
    sessionReload.readback,
    'session_reload.readback',
    databasePath,
  ));

  const initialPid = temporalReadbackPid(value.initial_readback);
  const keepAlivePid = temporalReadbackPid(keepAliveRecovery.readback);
  const restartPid = temporalReadbackPid(value.restart_readback);
  const sessionReloadPid = temporalReadbackPid(sessionReload.readback);
  const startActionPid = temporalActionStatusPid(value.start_action);
  const restartActionService = temporalActionService(value.restart_action);
  const restartActionPreviousPid = positiveInteger(restartActionService.previous_supervisor_pid)
    ? restartActionService.previous_supervisor_pid
    : null;
  const restartActionPid = positiveInteger(restartActionService.supervisor_pid)
    ? restartActionService.supervisor_pid
    : null;
  const termination = isRecord(keepAliveRecovery.termination) ? keepAliveRecovery.termination : {};
  if (termination.pid !== initialPid || termination.signal !== 'SIGTERM' || termination.status !== 'sent') {
    errors.push('temporal supervisor KeepAlive termination receipt is inconsistent');
  }
  if (initialPid !== null && keepAlivePid === initialPid) {
    errors.push('temporal supervisor KeepAlive recovery did not produce a fresh PID');
  }
  if (keepAlivePid !== null && restartPid === keepAlivePid) {
    errors.push('temporal supervisor restart did not produce a fresh PID');
  }
  if (restartPid !== null && sessionReloadPid === restartPid) {
    errors.push('temporal supervisor session reload did not produce a fresh PID');
  }
  if (startActionPid !== null && initialPid !== null && startActionPid !== initialPid) {
    errors.push('temporal supervisor start action PID does not match initial readback PID');
  }
  if (
    restartActionPreviousPid !== null &&
    keepAlivePid !== null &&
    restartActionPreviousPid !== keepAlivePid
  ) {
    errors.push('temporal supervisor restart action previous PID does not match KeepAlive readback PID');
  }
  if (restartActionPid !== null && restartPid !== null && restartActionPid !== restartPid) {
    errors.push('temporal supervisor restart action PID does not match restart readback PID');
  }

  const bootout = isRecord(sessionReload.bootout) ? sessionReload.bootout : {};
  const bootstrap = isRecord(sessionReload.bootstrap) ? sessionReload.bootstrap : {};
  const bootoutArgs = stringArray(bootout.args) ?? [];
  const bootstrapArgs = stringArray(bootstrap.args) ?? [];
  const expectedTargetPattern = new RegExp(`^gui/\\d+/${temporalSupervisorLabel.replaceAll('.', '\\.')}$`);
  const expectedDomainPattern = /^gui\/\d+$/;
  if (
    bootout.status !== 0 ||
    bootoutArgs.length !== 2 ||
    bootoutArgs[0] !== 'bootout' ||
    !expectedTargetPattern.test(bootoutArgs[1] ?? '')
  ) {
    errors.push('temporal supervisor launchd bootout receipt is invalid');
  }
  if (
    bootstrap.status !== 0 ||
    bootstrapArgs.length !== 3 ||
    bootstrapArgs[0] !== 'bootstrap' ||
    !expectedDomainPattern.test(bootstrapArgs[1] ?? '') ||
    bootstrapArgs[2] !== plistPath
  ) {
    errors.push('temporal supervisor launchd bootstrap receipt is invalid');
  }
  if (bootoutArgs[1]?.split('/').slice(0, 2).join('/') !== bootstrapArgs[1]) {
    errors.push('temporal supervisor launchd bootout/bootstrap domains differ');
  }
  return errors;
}

export function buildArtifactQualificationReceipt(input: {
  manifest: BuildArtifactCohortV2;
  manifestPath: string;
  result: 'passed' | 'failed';
  packageProfile: ArtifactQualificationReceiptV1['package_profile'];
  qualificationRunId: string;
  sourceArtifactRunId: string;
  sourceArtifactName: string;
  evidenceRef: string;
  smokeSummaryPath?: string;
  verificationHarness?: {
    appSha: string;
    shellSha: string;
    smokeHarnessPath: string;
    scopeProof: QualificationHarnessScopeProof;
  };
}): ArtifactQualificationReceiptV1 {
  if (!input.manifest.release.stable_session_id || !input.manifest.release.release_cohort_ref) {
    throw new Error('Qualification receipt requires a release-bound artifact manifest with stable session and cohort refs.');
  }
  const smokeSummaryExists = Boolean(input.smokeSummaryPath && fs.existsSync(input.smokeSummaryPath));
  let frameworkDaemonProof: Record<string, unknown> | undefined;
  let temporalServiceSupervisorProof: TemporalServiceSupervisorProofV1 | null = null;
  if (smokeSummaryExists) {
    try {
      const smokeSummary = JSON.parse(fs.readFileSync(input.smokeSummaryPath!, 'utf8')) as Record<string, unknown>;
      if (isRecord(smokeSummary.framework_daemon_proof)) frameworkDaemonProof = smokeSummary.framework_daemon_proof;
      temporalServiceSupervisorProof = isRecord(smokeSummary.temporal_service_supervisor_proof)
        ? smokeSummary.temporal_service_supervisor_proof as TemporalServiceSupervisorProofV1
        : null;
    } catch (error) {
      throw new Error(`Qualification smoke summary is not valid JSON: ${String(error)}`);
    }
  }
  const fullPassed = input.result === 'passed' && ['full', 'homebrew-full'].includes(input.packageProfile);
  const framework = input.manifest.qualification_runtime.framework;
  if (fullPassed && framework !== undefined) {
    const errors = validateFullFrameworkDaemonProof(frameworkDaemonProof, framework, input.manifest.cohort.framework_sha,
      input.manifest.digests.full_package_manifest_sha256 ?? null);
    if (errors.length > 0) throw new Error(errors.join('; '));
  } else if (fullPassed) {
    const errors = validateTemporalServiceSupervisorProof(temporalServiceSupervisorProof);
    if (errors.length > 0) throw new Error(`Passed Full qualification requires a valid Temporal service supervisor proof: ${errors.join('; ')}`);
  }
  const verificationSmokeHarnessSha256 = input.verificationHarness
    ? sha256File(input.verificationHarness.smokeHarnessPath)
    : null;
  const verificationScope = input.verificationHarness?.scopeProof.classification;
  if (input.verificationHarness) {
    const scopeErrors = validateQualificationHarnessScopeProof(input.verificationHarness.scopeProof, {
      artifactAppSha: input.manifest.cohort.app_sha,
      verificationAppSha: input.verificationHarness.appSha,
      artifactShellSha: input.manifest.cohort.shell_sha,
      verificationShellSha: input.verificationHarness.shellSha,
    });
    if (scopeErrors.length > 0) {
      throw new Error(`Invalid qualification harness scope proof: ${scopeErrors.join('; ')}`);
    }
    if (verificationScope === 'new_cohort_required') {
      throw new Error('Qualification harness changes require a new artifact cohort and cannot produce a same-artifact receipt.');
    }
    if (
      input.verificationHarness.scopeProof.classification === 'same_as_artifact_cohort' &&
      verificationSmokeHarnessSha256 !== input.manifest.digests.smoke_harness_sha256
    ) {
      throw new Error('Verification smoke harness digest changed without a changed-path scope proof.');
    }
  }
  const verificationDiffersFromArtifactCohort = input.verificationHarness
    ? input.verificationHarness.appSha !== input.manifest.cohort.app_sha ||
      input.verificationHarness.shellSha !== input.manifest.cohort.shell_sha ||
      verificationSmokeHarnessSha256 !== input.manifest.digests.smoke_harness_sha256
    : false;
  const verificationHarness = input.verificationHarness && verificationSmokeHarnessSha256
    ? {
        app_sha: input.verificationHarness.appSha,
        shell_sha: input.verificationHarness.shellSha,
        smoke_harness_sha256: verificationSmokeHarnessSha256,
        differs_from_artifact_cohort: verificationDiffersFromArtifactCohort,
        change_scope: verificationScope as 'same_as_artifact_cohort' | 'harness_mechanics_only',
        scope_proof: input.verificationHarness.scopeProof,
      }
    : null;
  return {
    schema: 'opl_app_artifact_qualification_receipt.v1',
    status: input.result,
    stable_session_id: input.manifest.release.stable_session_id,
    release_cohort_ref: input.manifest.release.release_cohort_ref,
    version: input.manifest.build.version,
    package_profile: input.packageProfile,
    qualification: {
      run_id: input.qualificationRunId,
      source_artifact_run_id: input.sourceArtifactRunId,
      source_artifact_name: input.sourceArtifactName,
      evidence_ref: input.evidenceRef,
      result: input.result,
    },
    artifact: input.manifest.artifact,
    cohort: input.manifest.cohort,
    build_manifest: {
      schema: input.manifest.schema,
      sha256: sha256File(input.manifestPath),
      smoke_harness_sha256: input.manifest.digests.smoke_harness_sha256,
      qualification_input_manifest_sha256: input.manifest.digests.qualification_input_manifest_sha256,
      full_input_manifest_sha256: input.manifest.digests.full_input_manifest_sha256 ?? null,
      full_package_manifest_sha256: input.manifest.digests.full_package_manifest_sha256 ?? null,
      full_toolchain_observation_receipt_sha256: input.manifest.digests.full_toolchain_observation_receipt_sha256 ?? null,
    },
    qualification_runtime: input.manifest.qualification_runtime,
    verification_harness: verificationHarness,
    smoke_summary: {
      path: smokeSummaryExists ? input.smokeSummaryPath! : null,
      sha256: smokeSummaryExists ? sha256File(input.smokeSummaryPath!) : null,
      temporal_service_supervisor_proof: temporalServiceSupervisorProof,
      ...(frameworkDaemonProof ? { framework_daemon_proof: frameworkDaemonProof } : {}),
    },
  };
}

export function validateArtifactQualificationReceipt(
  receipt: ArtifactQualificationReceiptV1,
  expected: {
    stableSessionId: string;
    releaseCohortRef: string;
    version: string;
    packageProfile: ArtifactQualificationReceiptV1['package_profile'];
    result?: 'passed' | 'failed';
    qualificationRunId?: string;
    sourceArtifactRunId?: string;
    sourceArtifactName?: string;
    artifactSha256?: string;
    appSha?: string;
    shellSha?: string;
    frameworkSha?: string;
    verificationAppSha?: string;
    verificationShellSha?: string;
    verificationSmokeHarnessSha256?: string;
    verificationScopeProof?: QualificationHarnessScopeProof;
    fullInputManifestDigest?: string;
    fullPackageManifestDigest?: string;
    qualificationInputManifestDigest?: string;
    qualificationRuntime?: BuildArtifactCohortV2['qualification_runtime'];
    fullToolchainObservationReceiptDigest?: string;
  },
): string[] {
  const errors: string[] = [];
  if (receipt.schema !== 'opl_app_artifact_qualification_receipt.v1') errors.push(`schema is ${String(receipt.schema)}`);
  if (receipt.stable_session_id !== expected.stableSessionId || !digestRefPattern.test(receipt.stable_session_id)) errors.push(`stable_session_id is ${receipt.stable_session_id}`);
  if (receipt.release_cohort_ref !== expected.releaseCohortRef || !digestRefPattern.test(receipt.release_cohort_ref)) errors.push(`release_cohort_ref is ${receipt.release_cohort_ref}`);
  if (receipt.version !== expected.version) errors.push(`version is ${receipt.version}`);
  if (receipt.package_profile !== expected.packageProfile) errors.push(`package_profile is ${receipt.package_profile}`);
  if (expected.result && (receipt.status !== expected.result || receipt.qualification.result !== expected.result)) errors.push(`qualification result is ${receipt.status}/${receipt.qualification.result}`);
  for (const [key, value] of [
    ['run_id', expected.qualificationRunId],
    ['source_artifact_run_id', expected.sourceArtifactRunId],
    ['source_artifact_name', expected.sourceArtifactName],
  ] as const) {
    if (value && receipt.qualification[key] !== value) errors.push(`${key} is ${receipt.qualification[key]}`);
  }
  if (expected.artifactSha256 && receipt.artifact.sha256 !== expected.artifactSha256) errors.push(`artifact sha256 is ${receipt.artifact.sha256}`);
  if (!digestPattern.test(receipt.artifact.sha256) || !digestPattern.test(receipt.build_manifest.sha256) || !digestPattern.test(receipt.build_manifest.smoke_harness_sha256) || !digestPattern.test(receipt.build_manifest.qualification_input_manifest_sha256)) errors.push('qualification receipt contains an invalid digest');
  if (expected.qualificationInputManifestDigest && receipt.build_manifest.qualification_input_manifest_sha256 !== expected.qualificationInputManifestDigest) errors.push('Qualification input manifest digest does not match');
  errors.push(...validateFrozenCodexCliIdentity(receipt.qualification_runtime?.codex_cli));
  if (expected.qualificationRuntime && !isDeepStrictEqual(expected.qualificationRuntime, receipt.qualification_runtime)) {
    errors.push('Qualification runtime does not match the frozen build');
  }
  const fullProfile = receipt.package_profile === 'full' || receipt.package_profile === 'homebrew-full';
  if (fullProfile && (
    !digestPattern.test(receipt.build_manifest.full_input_manifest_sha256 || '') ||
    !digestPattern.test(receipt.build_manifest.full_package_manifest_sha256 || '') ||
    !digestPattern.test(receipt.build_manifest.full_toolchain_observation_receipt_sha256 || '')
  )) errors.push('Full qualification receipt lacks frozen input authority digests');
  if (expected.fullInputManifestDigest && receipt.build_manifest.full_input_manifest_sha256 !== expected.fullInputManifestDigest) errors.push('Full input manifest digest does not match');
  if (expected.fullPackageManifestDigest && receipt.build_manifest.full_package_manifest_sha256 !== expected.fullPackageManifestDigest) errors.push('Full package manifest digest does not match');
  if (expected.fullToolchainObservationReceiptDigest && receipt.build_manifest.full_toolchain_observation_receipt_sha256 !== expected.fullToolchainObservationReceiptDigest) errors.push('Full toolchain observation receipt digest does not match');
  for (const [key, value] of [
    ['app_sha', expected.appSha], ['shell_sha', expected.shellSha], ['framework_sha', expected.frameworkSha],
  ] as const) {
    if (value && receipt.cohort[key] !== value) errors.push(`${key} is ${String(receipt.cohort[key])}`);
  }
  const verificationHarness = receipt.verification_harness;
  if (verificationHarness) {
    if (!shaPattern.test(verificationHarness.app_sha) || !shaPattern.test(verificationHarness.shell_sha)) {
      errors.push('verification harness contains an invalid Git SHA');
    }
    if (!digestPattern.test(verificationHarness.smoke_harness_sha256)) {
      errors.push('verification harness contains an invalid smoke harness digest');
    }
    const differsFromArtifactCohort =
      verificationHarness.app_sha !== receipt.cohort.app_sha ||
      verificationHarness.shell_sha !== receipt.cohort.shell_sha ||
      verificationHarness.smoke_harness_sha256 !== receipt.build_manifest.smoke_harness_sha256;
    if (verificationHarness.differs_from_artifact_cohort !== differsFromArtifactCohort) {
      errors.push('verification harness differs_from_artifact_cohort is inconsistent');
    }
    const expectedScope = differsFromArtifactCohort
      ? 'harness_mechanics_only'
      : 'same_as_artifact_cohort';
    if (verificationHarness.change_scope !== expectedScope) {
      errors.push(`verification harness change_scope is ${verificationHarness.change_scope}`);
    }
    const scopeErrors = validateQualificationHarnessScopeProof(verificationHarness.scope_proof, {
      artifactAppSha: receipt.cohort.app_sha,
      verificationAppSha: verificationHarness.app_sha,
      artifactShellSha: receipt.cohort.shell_sha,
      verificationShellSha: verificationHarness.shell_sha,
    });
    errors.push(...scopeErrors);
    if (verificationHarness.scope_proof?.classification !== verificationHarness.change_scope) {
      errors.push('verification harness scope proof classification is inconsistent');
    }
    if (verificationHarness.scope_proof?.reuse_authorization?.allowed !== true) {
      errors.push('verification harness scope proof does not authorize artifact reuse');
    }
  }
  for (const [label, actual, expectedValue] of [
    ['verification app_sha', verificationHarness?.app_sha, expected.verificationAppSha],
    ['verification shell_sha', verificationHarness?.shell_sha, expected.verificationShellSha],
    ['verification smoke_harness_sha256', verificationHarness?.smoke_harness_sha256, expected.verificationSmokeHarnessSha256],
  ] as const) {
    if (expectedValue && actual !== expectedValue) errors.push(`${label} is ${String(actual)}`);
  }
  if (
    expected.verificationScopeProof &&
    JSON.stringify(verificationHarness?.scope_proof) !== JSON.stringify(expected.verificationScopeProof)
  ) {
    errors.push('verification harness scope proof does not match the release session');
  }
  const passed =
    receipt.status === 'passed' &&
    receipt.qualification.result === 'passed';
  if (passed) {
    if (!receipt.smoke_summary?.path || !digestPattern.test(receipt.smoke_summary?.sha256 ?? '')) {
      errors.push('passed qualification receipt is missing its smoke summary binding');
    }
  }
  const fullPassed = passed && (receipt.package_profile === 'full' || receipt.package_profile === 'homebrew-full');
  const framework = receipt.qualification_runtime?.framework;
  if (fullPassed && framework !== undefined) {
    errors.push(...validateFullFrameworkDaemonProof(receipt.smoke_summary?.framework_daemon_proof, framework,
      receipt.cohort.framework_sha, receipt.build_manifest.full_package_manifest_sha256));
  } else if (fullPassed) {
    errors.push(...validateTemporalServiceSupervisorProof(
      receipt.smoke_summary?.temporal_service_supervisor_proof,
    ));
  }
  return errors;
}
