#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import {
  buildPostDispatchReconcile,
  buildPreNonceDispatchGuard,
  readOwnerWorkflowRuns,
  type CommandResult,
  type CommandRunner,
  type OwnerWorkflowRun,
} from './release-dispatch-guard.ts';
import {
  createStableOperationAuthority,
  encodeStableOperationAuthorityCarrier,
  stableOperationCriticalBlobs,
  stableOperationIdForFrozenCohort,
} from './stable-operation-control.ts';

type JsonRecord = Record<string, unknown>;

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultRepository = 'gaofeng21cn/one-person-lab-app';
const defaultWorkflow = '.github/workflows/release-stable.yml';
const shellRemote = 'https://github.com/gaofeng21cn/opl-aion-shell.git';
const frameworkRemote = 'https://github.com/gaofeng21cn/one-person-lab.git';
const shaPattern = /^[0-9a-f]{40}$/;
const runIdPattern = /^[1-9][0-9]*$/;
const activeRunStatuses = new Set(['queued', 'in_progress', 'waiting', 'pending']);

export type StableDispatchOperation = 'standard' | 'resume_standard' | 'append_full';

export type WorkflowArtifact = {
  id: number;
  name: string;
  expired: boolean;
};

export type FullBuildCohort = {
  schema: 'opl_app_build_artifact_cohort.v2';
  cohort: {
    app_sha: string;
    shell_sha: string;
    framework_sha: string;
  };
  build: {
    version: string;
    kind: 'full';
  };
  artifact: {
    name: string;
    sha256: string;
    size_bytes: number;
  };
  actions: {
    run_id: string;
    run_attempt: string;
    artifact_name: string;
  };
};

export type FullRecoveryEvidence = {
  qualification_run_id: string;
  artifact_producer_run_id: string;
  smoke_harness_ref: string | null;
};

export type StableDispatchPlan = {
  schema: 'opl_app_stable_dispatch_plan.v1';
  status: 'ready';
  operation: StableDispatchOperation;
  attempt_id: string;
  version_policy: 'allocate_once_for_new_release' | 'preserve_source_tag';
  workflow_inputs: Record<string, string>;
  source: {
    run_id: string | null;
    artifact: string | null;
  };
  recovery: {
    requested_run_id: string | null;
    artifact_producer_run_id: string | null;
    qualification_run_id: string | null;
    smoke_harness_ref: string | null;
  };
  cohort: {
    app_sha: string;
    shell_sha: string;
    framework_sha: string;
  } | null;
  authority: {
    authority_id: string;
    operation_id: string;
    authority_digest: string;
  } | null;
};

export type Runtime = {
  runner: CommandRunner;
  now: () => Date;
  randomBytes: (size: number) => Buffer;
  wait: (milliseconds: number) => Promise<void>;
};

const defaultRuntime: Runtime = {
  runner(command, args, options) {
    const result = spawnSync(command, args, {
      cwd: options.cwd,
      env: process.env,
      encoding: 'utf8',
      timeout: options.timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
    });
    return {
      status: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      error: result.error,
    };
  },
  now: () => new Date(),
  randomBytes: crypto.randomBytes,
  wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be one JSON object.`);
  }
  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing.`);
  return value.trim();
}

function sha(value: unknown, label: string): string {
  const normalized = text(value, label).toLowerCase();
  if (!shaPattern.test(normalized)) throw new Error(`${label} must be an exact commit SHA.`);
  return normalized;
}

function runId(value: unknown, label: string): string {
  const normalized = text(value, label);
  if (!runIdPattern.test(normalized)) throw new Error(`${label} must be a positive GitHub run id.`);
  return normalized;
}

function commandDetail(result: CommandResult): string {
  return [result.stderr, result.stdout, result.error?.message]
    .filter(Boolean)
    .join('\n')
    .trim()
    .replace(/\s+/g, ' ');
}

function runRequired(
  runtime: Runtime,
  command: string,
  args: string[],
  timeoutMs: number,
  label: string,
): string {
  const result = runtime.runner(command, args, { cwd: appRoot, timeoutMs });
  if (result.status !== 0 || result.error) {
    throw new Error(`${label} failed: ${commandDetail(result) || `exit ${String(result.status)}`}`);
  }
  return result.stdout;
}

function readJsonFile(filePath: string): unknown {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`Expected one non-empty regular JSON file: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown;
}

function writeJson(filePath: string | undefined, value: unknown): void {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (filePath) {
    const resolved = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, serialized, 'utf8');
  }
  process.stdout.write(serialized);
}

export function selectCheckpointArtifact(artifacts: WorkflowArtifact[], sourceRunId: string): string {
  const id = runId(sourceRunId, 'source_run_id');
  const expected = new Set([
    `opl-release-standard-operation-checkpoint-${id}`,
    `opl-release-append-full-operation-checkpoint-${id}`,
  ]);
  const matches = artifacts.filter((artifact) => !artifact.expired && expected.has(artifact.name));
  if (matches.length !== 1) {
    throw new Error(`Run ${id} must expose exactly one reusable Standard or Full operation checkpoint; found ${matches.length}.`);
  }
  return matches[0]!.name;
}

export function selectFullCheckpointArtifact(
  artifacts: WorkflowArtifact[],
  sourceRunId: string,
): WorkflowArtifact | null {
  const id = runId(sourceRunId, 'source_run_id');
  const expected = `opl-release-full-checkpoint-${id}`;
  const matches = artifacts.filter((artifact) => !artifact.expired && artifact.name === expected);
  if (matches.length > 1) {
    throw new Error(`Run ${id} exposes multiple reusable qualified Full checkpoints.`);
  }
  return matches[0] ?? null;
}

export function selectFullCohortArtifact(artifacts: WorkflowArtifact[]): WorkflowArtifact {
  const matches = artifacts.filter((artifact) => (
    !artifact.expired
    && /^opl-full-first-install-dmg-.+-mac-arm64-cohort$/.test(artifact.name)
  ));
  if (matches.length !== 1) {
    throw new Error(`Full recovery requires exactly one non-expired Full DMG cohort artifact; found ${matches.length}.`);
  }
  return matches[0]!;
}

export function selectFullQualificationArtifact(
  artifacts: WorkflowArtifact[],
  recoveryRunId: string,
): WorkflowArtifact {
  const id = runId(recoveryRunId, 'recovery_run_id');
  const expected = `opl-qualification-attempt-full-${id}`;
  const matches = artifacts.filter((artifact) => !artifact.expired && artifact.name === expected);
  if (matches.length !== 1) {
    throw new Error(`Full recovery requires exactly one non-expired ${expected}; found ${matches.length}.`);
  }
  return matches[0]!;
}

export function validateFullBuildCohort(value: unknown): FullBuildCohort {
  const candidate = record(value, 'Full build cohort');
  const cohort = record(candidate.cohort, 'Full build cohort.cohort');
  const build = record(candidate.build, 'Full build cohort.build');
  const artifact = record(candidate.artifact, 'Full build cohort.artifact');
  const actions = record(candidate.actions, 'Full build cohort.actions');
  if (
    candidate.schema !== 'opl_app_build_artifact_cohort.v2'
    || build.kind !== 'full'
    || typeof build.version !== 'string'
    || !build.version.trim()
    || typeof artifact.name !== 'string'
    || !/^One-Person-Lab-Full-.+-mac-arm64\.dmg$/.test(artifact.name)
    || typeof artifact.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(artifact.sha256)
    || !Number.isSafeInteger(artifact.size_bytes)
    || Number(artifact.size_bytes) <= 0
    || actions.run_attempt !== '1'
    || typeof actions.artifact_name !== 'string'
    || !actions.artifact_name.trim()
  ) {
    throw new Error('Full build cohort identity is invalid.');
  }
  return {
    schema: 'opl_app_build_artifact_cohort.v2',
    cohort: {
      app_sha: sha(cohort.app_sha, 'cohort.app_sha'),
      shell_sha: sha(cohort.shell_sha, 'cohort.shell_sha'),
      framework_sha: sha(cohort.framework_sha, 'cohort.framework_sha'),
    },
    build: { version: build.version.trim(), kind: 'full' },
    artifact: {
      name: artifact.name,
      sha256: artifact.sha256,
      size_bytes: Number(artifact.size_bytes),
    },
    actions: {
      run_id: runId(actions.run_id, 'actions.run_id'),
      run_attempt: '1',
      artifact_name: actions.artifact_name.trim(),
    },
  };
}

export function validateFullRecoveryEvidence(
  value: unknown,
  recoveryRunId: string,
  cohort: FullBuildCohort,
): FullRecoveryEvidence {
  const candidate = record(value, 'Full qualification attempt');
  const identity = record(candidate.identity, 'Full qualification attempt.identity');
  const retry = record(candidate.retry, 'Full qualification attempt.retry');
  const outcomes = record(candidate.outcomes, 'Full qualification attempt.outcomes');
  const evidence = record(candidate.evidence, 'Full qualification attempt.evidence');
  const scope = record(evidence.scope_proof, 'Full qualification attempt.evidence.scope_proof');
  const qualificationRunId = runId(recoveryRunId, 'recovery_run_id');
  const producerRunId = runId(identity.source_artifact_run_id, 'identity.source_artifact_run_id');
  const scopeClassification = text(scope.classification, 'scope_proof.classification');
  const scopeAppBase = sha(scope.app_base_sha, 'scope_proof.app_base_sha');
  const scopeShellBase = sha(scope.shell_base_sha, 'scope_proof.shell_base_sha');
  const forbiddenAppPaths = scope.forbidden_app_paths;
  const forbiddenShellPaths = scope.forbidden_shell_paths;
  const retryDisposition = text(retry.disposition, 'retry.disposition');
  const retryEligible = retryDisposition === 'same_artifact_retry_allowed'
    || retryDisposition === 'new_cohort_required'
    || retryDisposition === 'reconcile_only';
  if (
    candidate.schema !== 'opl_app_qualification_attempt_receipt.v1'
    || candidate.status !== 'failed'
    || !retryEligible
    || identity.artifact_kind !== 'full'
    || identity.package_profile !== 'full'
    || identity.qualification_run_id !== qualificationRunId
    || identity.qualification_run_attempt !== '1'
    || producerRunId !== cohort.actions.run_id
    || identity.source_artifact_name !== cohort.actions.artifact_name
    || outcomes.validate_inputs !== 'success'
    || outcomes.clean_vm !== 'failure'
    || scopeAppBase !== cohort.cohort.app_sha
    || scopeShellBase !== cohort.cohort.shell_sha
    || !Array.isArray(forbiddenAppPaths)
    || forbiddenAppPaths.length !== 0
    || !Array.isArray(forbiddenShellPaths)
    || forbiddenShellPaths.length !== 0
    || !['same_as_artifact_cohort', 'harness_mechanics_only'].includes(scopeClassification)
  ) {
    throw new Error(
      'Full recovery receipt is not an eligible failed qualification bound to the exact recovery run and original Full producer.',
    );
  }
  return {
    qualification_run_id: qualificationRunId,
    artifact_producer_run_id: producerRunId,
    smoke_harness_ref: scopeClassification === 'harness_mechanics_only'
      ? sha(scope.shell_head_sha, 'scope_proof.shell_head_sha')
      : null,
  };
}

function normalizedOwnerRun(value: unknown): OwnerWorkflowRun | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const run = value as JsonRecord;
  if (
    !Number.isSafeInteger(run.id)
    || typeof run.path !== 'string'
    || typeof run.status !== 'string'
    || !(run.conclusion === null || typeof run.conclusion === 'string')
    || typeof run.event !== 'string'
    || typeof run.head_branch !== 'string'
    || typeof run.head_sha !== 'string'
    || !Number.isSafeInteger(run.run_attempt)
    || typeof run.created_at !== 'string'
    || typeof run.display_title !== 'string'
  ) return null;
  return run as unknown as OwnerWorkflowRun;
}

export function activeStableRunIds(runs: unknown[], workflow = defaultWorkflow): number[] {
  return runs
    .map(normalizedOwnerRun)
    .filter((run): run is OwnerWorkflowRun => run !== null)
    .filter((run) => (
      run.path === workflow
      && run.event === 'workflow_dispatch'
      && run.head_branch === 'main'
      && activeRunStatuses.has(run.status)
    ))
    .map((run) => run.id);
}

export function buildAppendFullPlan(input: {
  attemptId: string;
  sourceRunId: string;
  sourceArtifact: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  priorFullArtifactRunId?: string;
  artifactProducerRunId?: string;
  qualificationRunId?: string;
  smokeHarnessSha?: string;
  recoveryRunId?: string;
}): StableDispatchPlan {
  const sourceRunId = runId(input.sourceRunId, 'source_run_id');
  const workflowInputs: Record<string, string> = {
    operation: 'append_full',
    source_run_id: sourceRunId,
    source_artifact: text(input.sourceArtifact, 'source_artifact'),
    app_ref: sha(input.appSha, 'app_ref'),
    shell_ref: sha(input.shellSha, 'shell_ref'),
    framework_ref: sha(input.frameworkSha, 'framework_ref'),
  };
  if (input.priorFullArtifactRunId) {
    workflowInputs.prior_full_artifact_run_id = runId(
      input.priorFullArtifactRunId,
      'prior_full_artifact_run_id',
    );
  }
  if (input.smokeHarnessSha) {
    if (!input.priorFullArtifactRunId) {
      throw new Error('smoke_harness_ref requires a reusable Full artifact run.');
    }
    workflowInputs.smoke_harness_ref = sha(input.smokeHarnessSha, 'smoke_harness_ref');
  }
  return {
    schema: 'opl_app_stable_dispatch_plan.v1',
    status: 'ready',
    operation: 'append_full',
    attempt_id: text(input.attemptId, 'attempt_id'),
    version_policy: 'preserve_source_tag',
    workflow_inputs: workflowInputs,
    source: { run_id: sourceRunId, artifact: workflowInputs.source_artifact },
    recovery: {
      requested_run_id: input.recoveryRunId ?? input.priorFullArtifactRunId ?? null,
      artifact_producer_run_id: input.artifactProducerRunId ?? null,
      qualification_run_id: input.qualificationRunId ?? null,
      smoke_harness_ref: workflowInputs.smoke_harness_ref ?? null,
    },
    cohort: {
      app_sha: workflowInputs.app_ref,
      shell_sha: workflowInputs.shell_ref,
      framework_sha: workflowInputs.framework_ref,
    },
    authority: null,
  };
}

export function buildResumeStandardPlan(input: {
  attemptId: string;
  sourceRunId: string;
  sourceArtifact: string;
  frameworkSha: string;
}): StableDispatchPlan {
  const sourceRunId = runId(input.sourceRunId, 'source_run_id');
  return {
    schema: 'opl_app_stable_dispatch_plan.v1',
    status: 'ready',
    operation: 'resume_standard',
    attempt_id: text(input.attemptId, 'attempt_id'),
    version_policy: 'preserve_source_tag',
    workflow_inputs: {
      operation: 'resume_standard',
      source_run_id: sourceRunId,
      source_artifact: text(input.sourceArtifact, 'source_artifact'),
      framework_ref: sha(input.frameworkSha, 'framework_ref'),
    },
    source: { run_id: sourceRunId, artifact: input.sourceArtifact },
    recovery: {
      requested_run_id: sourceRunId,
      artifact_producer_run_id: null,
      qualification_run_id: null,
      smoke_harness_ref: null,
    },
    cohort: null,
    authority: null,
  };
}

function wireSha(runtime: Runtime, remote: string): string {
  const output = runRequired(
    runtime,
    'git',
    ['ls-remote', '--exit-code', remote, 'refs/heads/main'],
    30_000,
    `Resolve ${remote} main`,
  );
  const matches = output.trim().split(/\r?\n/).filter(Boolean);
  if (matches.length !== 1) throw new Error(`Expected one wire main ref from ${remote}; found ${matches.length}.`);
  return sha(matches[0]!.split(/\s+/)[0], `${remote} main`);
}

function workflowArtifacts(runtime: Runtime, repository: string, sourceRunId: string): WorkflowArtifact[] {
  const output = runRequired(
    runtime,
    'gh',
    ['api', `repos/${repository}/actions/runs/${runId(sourceRunId, 'source_run_id')}/artifacts?per_page=100`, '--paginate', '--slurp'],
    30_000,
    `Read artifacts for run ${sourceRunId}`,
  );
  const pages = JSON.parse(output) as unknown;
  if (!Array.isArray(pages)) throw new Error('GitHub artifact response must be an array of pages.');
  const artifacts = pages.flatMap((page) => {
    const payload = record(page, 'GitHub artifact page');
    if (!Array.isArray(payload.artifacts)) throw new Error('GitHub artifact page lacks artifacts.');
    return payload.artifacts;
  });
  return artifacts.map((value) => {
    const artifact = record(value, 'GitHub artifact');
    if (
      !Number.isSafeInteger(artifact.id)
      || typeof artifact.name !== 'string'
      || typeof artifact.expired !== 'boolean'
    ) throw new Error('GitHub artifact identity is invalid.');
    return { id: Number(artifact.id), name: artifact.name, expired: artifact.expired };
  });
}

function downloadArtifactJson(
  runtime: Runtime,
  repository: string,
  sourceRunId: string,
  artifactName: string,
  fileName: string,
): unknown {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stable-dispatch-'));
  try {
    runRequired(
      runtime,
      'gh',
      ['run', 'download', sourceRunId, '--repo', repository, '--name', artifactName, '--dir', tempRoot],
      120_000,
      `Download ${artifactName}`,
    );
    const matches = fs.globSync('**/*', { cwd: tempRoot, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name === fileName)
      .map((entry) => path.join(entry.parentPath, entry.name));
    if (matches.length !== 1) {
      throw new Error(`${artifactName} must contain exactly one ${fileName}; found ${matches.length}.`);
    }
    return readJsonFile(matches[0]!);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function resolveBundleFrameworkSha(runtime: Runtime, repository: string, sourceRunId: string): string {
  const artifacts = workflowArtifacts(runtime, repository, sourceRunId);
  const expectedName = `opl-release-bundle-${sourceRunId}`;
  const matches = artifacts.filter((artifact) => !artifact.expired && artifact.name === expectedName);
  if (matches.length !== 1) {
    throw new Error(`Run ${sourceRunId} must expose exactly one ${expectedName}; found ${matches.length}.`);
  }
  const bundle = record(
    downloadArtifactJson(runtime, repository, sourceRunId, expectedName, 'release-bundle.json'),
    'Framework release bundle',
  );
  return sha(
    record(record(bundle.sources, 'release bundle.sources').framework, 'release bundle.sources.framework').source_commit,
    'release bundle Framework source commit',
  );
}

function assertNoActiveRun(runtime: Runtime, workflow: string): void {
  const observation = readOwnerWorkflowRuns({ workflow, runner: runtime.runner, cwd: appRoot });
  if (observation.status !== 'ok') {
    throw new Error(`Stable owner-run reconciliation failed: ${observation.failure_code}.`);
  }
  const active = activeStableRunIds(observation.runs, workflow);
  if (active.length > 0) {
    throw new Error(`A Stable owner run is already active: ${active.join(', ')}.`);
  }
}

function attemptId(operation: string, runtime: Runtime): string {
  const timestamp = runtime.now().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${operation}-${timestamp}-${runtime.randomBytes(4).toString('hex')}`;
}

function sourceGate(
  runtime: Runtime,
  appSha: string,
  shellSha: string,
  frameworkSha: string,
  objectiveFingerprint: string,
): unknown {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stable-source-gate-'));
  try {
    const output = path.join(tempRoot, 'source-gate.json');
    runRequired(
      runtime,
      process.execPath,
      [
        '--experimental-strip-types',
        path.join(appRoot, 'scripts', 'validate-release-source-gate.ts'),
        '--operation-fingerprint', objectiveFingerprint,
        '--app-ref', appSha,
        '--shell-ref', shellSha,
        '--framework-ref', frameworkSha,
        '--output', output,
      ],
      30 * 60_000,
      'Stable source gate',
    );
    return readJsonFile(output);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function buildStandardPlan(input: {
  runtime: Runtime;
  workflow: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  desktopAdditionalPlatforms: string[];
}): StableDispatchPlan {
  const objectiveFingerprint = 'opl-desktop-stable-release';
  const criticalBlobs = stableOperationCriticalBlobs(appRoot);
  const operationId = stableOperationIdForFrozenCohort({
    objectiveFingerprint,
    appSha: input.appSha,
    shellSha: input.shellSha,
    frameworkSha: input.frameworkSha,
    criticalBlobs,
  });
  const nonce = input.runtime.randomBytes(16).toString('hex');
  const authorityId = `authority-${operationId}-${nonce.slice(0, 8)}`;
  const report = sourceGate(
    input.runtime,
    input.appSha,
    input.shellSha,
    input.frameworkSha,
    objectiveFingerprint,
  );
  const guard = buildPreNonceDispatchGuard({
    expectedAppSha: input.appSha,
    expectedShellSha: input.shellSha,
    expectedFrameworkSha: input.frameworkSha,
    workflow: input.workflow,
    sourceGateReport: report,
    authorityId,
    operationId,
  }, { runner: input.runtime.runner, cwd: appRoot });
  if (guard.status !== 'passed' || guard.dispatch_allowed !== true) {
    throw new Error(`Stable pre-dispatch guard blocked the operation: ${guard.reason}`);
  }
  const issuedAt = input.runtime.now();
  const authority = createStableOperationAuthority({
    authorityId,
    operationId,
    issuer: text(process.env.GITHUB_ACTOR || runRequired(
      input.runtime,
      'gh',
      ['api', 'user', '--jq', '.login'],
      30_000,
      'Resolve GitHub actor',
    ), 'issuer'),
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + 90 * 60_000).toISOString(),
    objectiveFingerprint,
    nonce,
    appSha: input.appSha,
    shellSha: input.shellSha,
    frameworkSha: input.frameworkSha,
    desktopAdditionalPlatforms: input.desktopAdditionalPlatforms,
    criticalBlobs,
    sourceGate: report,
    preNonceGuard: guard,
  });
  return {
    schema: 'opl_app_stable_dispatch_plan.v1',
    status: 'ready',
    operation: 'standard',
    attempt_id: attemptId('standard', input.runtime),
    version_policy: 'allocate_once_for_new_release',
    workflow_inputs: {
      operation: 'standard',
      authority_id: authority.authority_id,
      operation_id: authority.operation_id,
      authority_carrier: encodeStableOperationAuthorityCarrier(authority),
      authority_digest: authority.authority_digest,
      desktop_additional_platforms: JSON.stringify(authority.desktop_additional_platforms),
    },
    source: { run_id: null, artifact: null },
    recovery: {
      requested_run_id: null,
      artifact_producer_run_id: null,
      qualification_run_id: null,
      smoke_harness_ref: null,
    },
    cohort: authority.cohort,
    authority: {
      authority_id: authority.authority_id,
      operation_id: authority.operation_id,
      authority_digest: authority.authority_digest,
    },
  };
}

export function workflowDispatchArgs(
  repository: string,
  workflow: string,
  plan: StableDispatchPlan,
): string[] {
  const args = ['workflow', 'run', workflow, '--repo', repository, '--ref', 'main'];
  for (const [key, value] of Object.entries(plan.workflow_inputs).sort(([left], [right]) => left.localeCompare(right))) {
    args.push('--field', `${key}=${value}`);
  }
  return args;
}

export async function dispatchOnce(
  runtime: Runtime,
  repository: string,
  workflow: string,
  executorSha: string,
  plan: StableDispatchPlan,
) {
  const operationStartedAt = runtime.now().toISOString();
  const dispatch = runtime.runner(
    'gh',
    workflowDispatchArgs(repository, workflow, plan),
    { cwd: appRoot, timeoutMs: 60_000 },
  );
  let reconcile: ReturnType<typeof buildPostDispatchReconcile> | null = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    reconcile = buildPostDispatchReconcile({
      workflow,
      headSha: executorSha,
      operationStartedAt,
      observedAt: runtime.now().toISOString(),
      mutationInvocationCount: 1,
    }, { runner: runtime.runner, cwd: appRoot });
    if (reconcile.status === 'identified') break;
    if (attempt < 6) await runtime.wait(2_000);
  }
  return {
    schema: 'opl_app_stable_dispatch_attempt.v1',
    status: reconcile?.status === 'identified' ? 'dispatched' : 'outcome_unknown',
    operation: plan.operation,
    attempt_id: plan.attempt_id,
    version_policy: plan.version_policy,
    mutation_invocation_count: 1,
    mutation_retry_count: 0,
    dispatch_transport: {
      exit_status: dispatch.status,
      error: dispatch.status === 0 && !dispatch.error ? null : commandDetail(dispatch),
    },
    owner_run: reconcile?.status === 'identified' ? reconcile.owner_run : null,
    read_only_reconcile_only: reconcile?.status !== 'identified',
    plan: {
      source: plan.source,
      recovery: plan.recovery,
      cohort: plan.cohort,
      authority: plan.authority,
    },
  };
}

function parsePlatforms(value: string | undefined): string[] {
  if (value === undefined) return ['linux-x64', 'windows-x64'];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('--desktop-additional-platforms must contain one JSON array.');
  }
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
    throw new Error('--desktop-additional-platforms must contain one JSON string array.');
  }
  return parsed as string[];
}

function usage(): never {
  process.stderr.write(`Usage:
  npm run release:stable-dispatch -- standard [--execute]
  npm run release:stable-dispatch -- resume-standard --run-id <standard-run> [--execute]
  npm run release:stable-dispatch -- append-full --source-run-id <standard-or-full-run> [--execute]
  npm run release:stable-dispatch -- recover-full --run-id <failed-full-run> [--smoke-harness-ref <sha>] [--execute]

The command never accepts a version. Recovery operations preserve the source checkpoint tag and perform at most one workflow dispatch.
`);
  process.exit(2);
}

async function main(argv: string[], runtime: Runtime = defaultRuntime): Promise<void> {
  const command = argv[0];
  if (!command || command === '--help' || command === '-h') usage();
  const { values } = parseArgs({
    args: argv.slice(1),
    strict: true,
    options: {
      execute: { type: 'boolean', default: false },
      repo: { type: 'string', default: defaultRepository },
      workflow: { type: 'string', default: defaultWorkflow },
      'run-id': { type: 'string' },
      'source-run-id': { type: 'string' },
      'app-ref': { type: 'string' },
      'shell-ref': { type: 'string' },
      'framework-ref': { type: 'string' },
      'smoke-harness-ref': { type: 'string' },
      'desktop-additional-platforms': { type: 'string' },
      output: { type: 'string' },
    },
  });
  const repository = text(values.repo, 'repo');
  const workflow = text(values.workflow, 'workflow');
  const executorSha = wireSha(runtime, 'origin');
  let plan: StableDispatchPlan;

  if (command === 'standard') {
    const appSha = values['app-ref'] ? sha(values['app-ref'], 'app_ref') : executorSha;
    const shellSha = values['shell-ref'] ? sha(values['shell-ref'], 'shell_ref') : wireSha(runtime, shellRemote);
    const frameworkSha = values['framework-ref']
      ? sha(values['framework-ref'], 'framework_ref')
      : wireSha(runtime, frameworkRemote);
    plan = buildStandardPlan({
      runtime,
      workflow,
      appSha,
      shellSha,
      frameworkSha,
      desktopAdditionalPlatforms: parsePlatforms(values['desktop-additional-platforms']),
    });
  } else if (command === 'resume-standard') {
    const sourceRunId = runId(values['run-id'], 'run_id');
    const artifacts = workflowArtifacts(runtime, repository, sourceRunId);
    plan = buildResumeStandardPlan({
      attemptId: attemptId('resume-standard', runtime),
      sourceRunId,
      sourceArtifact: selectCheckpointArtifact(artifacts, sourceRunId),
      frameworkSha: values['framework-ref']
        ? sha(values['framework-ref'], 'framework_ref')
        : resolveBundleFrameworkSha(runtime, repository, sourceRunId),
    });
  } else if (command === 'append-full') {
    const sourceRunId = runId(values['source-run-id'], 'source_run_id');
    const artifacts = workflowArtifacts(runtime, repository, sourceRunId);
    plan = buildAppendFullPlan({
      attemptId: attemptId('append-full', runtime),
      sourceRunId,
      sourceArtifact: selectCheckpointArtifact(artifacts, sourceRunId),
      appSha: values['app-ref'] ? sha(values['app-ref'], 'app_ref') : executorSha,
      shellSha: values['shell-ref'] ? sha(values['shell-ref'], 'shell_ref') : wireSha(runtime, shellRemote),
      frameworkSha: values['framework-ref']
        ? sha(values['framework-ref'], 'framework_ref')
        : wireSha(runtime, frameworkRemote),
    });
  } else if (command === 'recover-full') {
    const recoveryRunId = runId(values['run-id'], 'run_id');
    const artifacts = workflowArtifacts(runtime, repository, recoveryRunId);
    const fullCohortArtifact = selectFullCohortArtifact(artifacts);
    const cohort = validateFullBuildCohort(downloadArtifactJson(
      runtime,
      repository,
      recoveryRunId,
      fullCohortArtifact.name,
      'opl-build-cohort.json',
    ));
    const fullCheckpoint = selectFullCheckpointArtifact(artifacts, recoveryRunId);
    if (fullCheckpoint) {
      plan = buildAppendFullPlan({
        attemptId: attemptId('recover-full', runtime),
        sourceRunId: recoveryRunId,
        sourceArtifact: fullCheckpoint.name,
        appSha: cohort.cohort.app_sha,
        shellSha: cohort.cohort.shell_sha,
        frameworkSha: cohort.cohort.framework_sha,
        artifactProducerRunId: cohort.actions.run_id,
        qualificationRunId: recoveryRunId,
        recoveryRunId,
      });
    } else {
      const qualificationArtifact = selectFullQualificationArtifact(artifacts, recoveryRunId);
      const recovery = validateFullRecoveryEvidence(downloadArtifactJson(
        runtime,
        repository,
        recoveryRunId,
        qualificationArtifact.name,
        'qualification-attempt-receipt.json',
      ), recoveryRunId, cohort);
      plan = buildAppendFullPlan({
        attemptId: attemptId('recover-full', runtime),
        sourceRunId: recoveryRunId,
        sourceArtifact: selectCheckpointArtifact(artifacts, recoveryRunId),
        appSha: cohort.cohort.app_sha,
        shellSha: cohort.cohort.shell_sha,
        frameworkSha: cohort.cohort.framework_sha,
        priorFullArtifactRunId: recoveryRunId,
        artifactProducerRunId: recovery.artifact_producer_run_id,
        qualificationRunId: recovery.qualification_run_id,
        smokeHarnessSha: values['smoke-harness-ref']
          ? sha(values['smoke-harness-ref'], 'smoke_harness_ref')
          : recovery.smoke_harness_ref ?? undefined,
      });
    }
  } else {
    usage();
  }

  if (!values.execute) {
    writeJson(values.output, {
      ...plan,
      workflow_inputs: Object.fromEntries(Object.entries(plan.workflow_inputs).map(([key, value]) => [
        key,
        key === 'authority_carrier' ? '<generated-and-digest-bound>' : value,
      ])),
      mutation_invocation_count: 0,
    });
    return;
  }

  if (plan.operation !== 'standard') assertNoActiveRun(runtime, workflow);
  const result = await dispatchOnce(runtime, repository, workflow, executorSha, plan);
  writeJson(values.output, result);
  if (result.status !== 'dispatched') process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
