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
  createdAtClockSkewMs,
  defaultIdentityWindowMs,
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
export const appendFullOwnerIdentifyAttempts = 12;
export const appendFullOwnerIdentifyWaitMs = 5_000;

export type StableDispatchOperation = 'standard' | 'resume_standard' | 'append_full';

export type WorkflowArtifact = {
  id: number;
  name: string;
  expired: boolean;
};

export type AppendFullTargetState =
  | {
    state: 'published' | 'owner_identified';
    root_source_run_id: string;
    owner_run_id: number;
    source_run_id: null;
    source_artifact: null;
  }
  | {
    state: 'dispatch_required';
    root_source_run_id: string;
    owner_run_id: null;
    source_run_id: string;
    source_artifact: string;
  };

export type StableDispatchPlan = {
  schema: 'opl_app_stable_dispatch_plan.v1';
  status: 'ready';
  operation: StableDispatchOperation;
  attempt_id: string;
  version_policy: 'explicit_new_product_release' | 'preserve_source_tag';
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
    verification_app_ref: string | null;
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
  const preferredNames = [
    `opl-release-full-checkpoint-${id}`,
    `opl-release-append-full-operation-checkpoint-v2-${id}`,
    `opl-release-standard-operation-checkpoint-${id}`,
    `opl-release-standard-checkpoint-${id}`,
  ];
  for (const expected of preferredNames) {
    const matches = artifacts.filter((artifact) => !artifact.expired && artifact.name === expected);
    if (matches.length > 1) {
      throw new Error(`Run ${id} exposes multiple reusable ${expected} artifacts.`);
    }
    if (matches.length === 1) return expected;
  }
  throw new Error(`Run ${id} exposes no reusable Standard or Full checkpoint.`);
}

export function selectReusableFullCheckpointArtifact(
  artifacts: WorkflowArtifact[],
  sourceRunId: string,
): string | null {
  const id = runId(sourceRunId, 'source_run_id');
  for (const expected of [
    `opl-release-full-checkpoint-${id}`,
    `opl-release-append-full-operation-checkpoint-v2-${id}`,
  ]) {
    const matches = artifacts.filter((artifact) => !artifact.expired && artifact.name === expected);
    if (matches.length > 1) {
      throw new Error(`Run ${id} exposes multiple reusable ${expected} artifacts.`);
    }
    if (matches.length === 1) return expected;
  }
  return null;
}

export function selectQualifiedStandardCheckpointArtifact(
  artifacts: WorkflowArtifact[],
  sourceRunId: string,
): string {
  const id = runId(sourceRunId, 'source_run_id');
  const expected = `opl-release-standard-checkpoint-${id}`;
  const matches = artifacts.filter((artifact) => !artifact.expired && artifact.name === expected);
  if (matches.length !== 1) {
    throw new Error(`Run ${id} must expose exactly one qualified Standard checkpoint; found ${matches.length}.`);
  }
  return matches[0]!.name;
}

export function selectReusableStandardCheckpointArtifact(
  artifacts: WorkflowArtifact[],
  sourceRunId: string,
): string {
  const id = runId(sourceRunId, 'source_run_id');
  for (const expected of [
    `opl-release-standard-operation-checkpoint-${id}`,
    `opl-release-standard-checkpoint-${id}`,
  ]) {
    const matches = artifacts.filter((artifact) => !artifact.expired && artifact.name === expected);
    if (matches.length > 1) {
      throw new Error(`Run ${id} exposes multiple reusable ${expected} artifacts.`);
    }
    if (matches.length === 1) return expected;
  }
  throw new Error(`Run ${id} exposes no reusable Standard checkpoint.`);
}

function isFullCheckpointArtifact(sourceArtifact: string, sourceRunId: string): boolean {
  return sourceArtifact === `opl-release-full-checkpoint-${sourceRunId}`
    || sourceArtifact === `opl-release-append-full-operation-checkpoint-v2-${sourceRunId}`;
}

export function fullCheckpointMatchesRequestedCohort(
  value: unknown,
  requested: { appSha: string; shellSha: string; frameworkSha: string },
): boolean {
  const manifest = record(value, 'Full checkpoint build cohort');
  if (manifest.schema !== 'opl_app_build_artifact_cohort.v2') {
    throw new Error('Full checkpoint build cohort schema is invalid.');
  }
  const build = record(manifest.build, 'Full checkpoint build identity');
  if (build.kind !== 'full') throw new Error('Full checkpoint build cohort is not a Full artifact.');
  const cohort = record(manifest.cohort, 'Full checkpoint content cohort');
  const actual = {
    appSha: sha(cohort.app_sha, 'Full checkpoint app_sha'),
    shellSha: sha(cohort.shell_sha, 'Full checkpoint shell_sha'),
    frameworkSha: sha(cohort.framework_sha, 'Full checkpoint framework_sha'),
  };
  return actual.appSha === sha(requested.appSha, 'requested app_sha')
    && actual.shellSha === sha(requested.shellSha, 'requested shell_sha')
    && actual.frameworkSha === sha(requested.frameworkSha, 'requested framework_sha');
}

export function reconcileAppendFullCheckpointCohort(input: {
  target: AppendFullTargetState;
  rootArtifacts: WorkflowArtifact[];
  checkpointCohort: unknown;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
}): AppendFullTargetState {
  if (input.target.state !== 'dispatch_required') return input.target;
  if (!isFullCheckpointArtifact(input.target.source_artifact, input.target.source_run_id)) {
    return input.target;
  }
  if (fullCheckpointMatchesRequestedCohort(input.checkpointCohort, input)) return input.target;
  const rootSourceRunId = input.target.root_source_run_id;
  return {
    state: 'dispatch_required',
    root_source_run_id: rootSourceRunId,
    owner_run_id: null,
    source_run_id: rootSourceRunId,
    source_artifact: selectReusableStandardCheckpointArtifact(input.rootArtifacts, rootSourceRunId),
  };
}

function readFullCheckpointCohort(
  runtime: Runtime,
  repository: string,
  sourceRunId: string,
  artifacts: WorkflowArtifact[],
): unknown {
  const matches = artifacts.filter((artifact) => (
    !artifact.expired
    && /^opl-full-first-install-dmg-.+-mac-arm64-cohort$/.test(artifact.name)
  ));
  if (matches.length !== 1) {
    throw new Error(`Run ${sourceRunId} must expose exactly one reusable Full build cohort; found ${matches.length}.`);
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-checkpoint-cohort-'));
  try {
    runRequired(
      runtime,
      'gh',
      [
        'run', 'download', sourceRunId,
        '--repo', repository,
        '--name', matches[0]!.name,
        '--dir', tempRoot,
      ],
      2 * 60_000,
      `Download Full build cohort for run ${sourceRunId}`,
    );
    return readJsonFile(path.join(tempRoot, 'opl-build-cohort.json'));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
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

function appendFullSourceRunId(run: OwnerWorkflowRun): string | null {
  const match = /^OPL Stable append_full source:([1-9][0-9]*) run:([1-9][0-9]*)$/.exec(
    run.display_title,
  );
  if (!match || Number(match[2]) !== run.id) return null;
  return match[1]!;
}

function isAppendFullOwnerRun(run: OwnerWorkflowRun, workflow: string): boolean {
  return run.path === workflow
    && run.event === 'workflow_dispatch'
    && run.head_branch === 'main'
    && run.run_attempt === 1
    && appendFullSourceRunId(run) !== null;
}

export function reachableAppendFullRuns(
  runs: unknown[],
  rootSourceRunId: string,
  workflow = defaultWorkflow,
): OwnerWorkflowRun[] {
  const root = runId(rootSourceRunId, 'root_source_run_id');
  const owners = runs
    .map(normalizedOwnerRun)
    .filter((run): run is OwnerWorkflowRun => run !== null)
    .filter((run) => isAppendFullOwnerRun(run, workflow))
    .sort((left, right) => left.id - right.id);
  const reachableSources = new Set([root]);
  const selected = new Map<number, OwnerWorkflowRun>();

  let changed = true;
  while (changed) {
    changed = false;
    for (const owner of owners) {
      if (selected.has(owner.id)) continue;
      const source = appendFullSourceRunId(owner);
      if (!source || !reachableSources.has(source)) continue;
      selected.set(owner.id, owner);
      reachableSources.add(String(owner.id));
      changed = true;
    }
  }
  return [...selected.values()].sort((left, right) => left.id - right.id);
}

export function reconcileAppendFullTarget(input: {
  runs: unknown[];
  rootSourceRunId: string;
  artifactsByRunId: Readonly<Record<string, readonly WorkflowArtifact[]>>;
  workflow?: string;
}): AppendFullTargetState {
  const workflow = input.workflow ?? defaultWorkflow;
  const root = runId(input.rootSourceRunId, 'root_source_run_id');
  const normalized = input.runs
    .map(normalizedOwnerRun)
    .filter((run): run is OwnerWorkflowRun => run !== null);
  const reachable = reachableAppendFullRuns(normalized, root, workflow);
  const rootOwner = normalized.find((run) => run.id === Number(root) && isAppendFullOwnerRun(run, workflow));
  const owners = rootOwner && !reachable.some((run) => run.id === rootOwner.id)
    ? [rootOwner, ...reachable]
    : reachable;

  for (const owner of [...owners].sort((left, right) => right.id - left.id)) {
    if (owner.status !== 'completed' || owner.conclusion !== 'success') continue;
    const expected = `opl-release-full-published-${owner.id}`;
    const published = (input.artifactsByRunId[String(owner.id)] ?? [])
      .filter((artifact) => !artifact.expired && artifact.name === expected);
    if (published.length > 1) {
      throw new Error(`Full owner run ${owner.id} exposes multiple ${expected} artifacts.`);
    }
    if (published.length === 1) {
      return {
        state: 'published',
        root_source_run_id: root,
        owner_run_id: owner.id,
        source_run_id: null,
        source_artifact: null,
      };
    }
  }

  const active = owners.filter((owner) => activeRunStatuses.has(owner.status));
  if (active.length > 1) {
    throw new Error(`Multiple active Full owners exist for Standard source ${root}: ${active.map((run) => run.id).join(', ')}.`);
  }
  if (active.length === 1) {
    return {
      state: 'owner_identified',
      root_source_run_id: root,
      owner_run_id: active[0]!.id,
      source_run_id: null,
      source_artifact: null,
    };
  }

  const unprovenSuccess = owners.find((owner) => owner.status === 'completed' && owner.conclusion === 'success');
  if (unprovenSuccess) {
    throw new Error(
      `Full owner run ${unprovenSuccess.id} succeeded but its exact publication receipt is unavailable; reconcile public state before dispatch.`,
    );
  }

  for (const owner of [...owners].sort((left, right) => right.id - left.id)) {
    if (owner.status !== 'completed' || owner.conclusion === 'success') continue;
    const checkpoint = selectReusableFullCheckpointArtifact(
      [...(input.artifactsByRunId[String(owner.id)] ?? [])],
      String(owner.id),
    );
    if (checkpoint) {
      return {
        state: 'dispatch_required',
        root_source_run_id: root,
        owner_run_id: null,
        source_run_id: String(owner.id),
        source_artifact: checkpoint,
      };
    }
  }

  const rootArtifacts = [...(input.artifactsByRunId[root] ?? [])];
  return {
    state: 'dispatch_required',
    root_source_run_id: root,
    owner_run_id: null,
    source_run_id: root,
    source_artifact: selectCheckpointArtifact(rootArtifacts, root),
  };
}

export function assertLatestStandardReleaseComplete(value: unknown): void {
  const release = record(value, 'Latest GitHub Release');
  const tag = text(release.tag_name, 'Latest GitHub Release tag');
  if (!tag.startsWith('v')) throw new Error('Latest GitHub Release tag must start with v.');
  if (!Array.isArray(release.assets)) throw new Error('Latest GitHub Release assets are missing.');
  const version = tag.slice(1);
  const names = new Set(release.assets.map((item) =>
    text(record(item, 'Latest GitHub Release asset').name, 'Latest GitHub Release asset name')));
  const required = [
    `One-Person-Lab-${version}-mac-arm64.dmg`,
    'opl-app-component-manifest.json',
  ];
  const missing = required.filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(
      `Latest ${tag} is missing required Standard publication assets (${missing.join(', ')}). `
      + 'Repair that same tag before creating another product version.',
    );
  }
}

function latestRelease(runtime: Runtime, repository: string): unknown {
  return JSON.parse(runRequired(
    runtime,
    'gh',
    ['api', `repos/${repository}/releases/latest`],
    30_000,
    'Read Latest Release Set',
  ));
}

const fullCandidatePackageName = /^opl-full-first-install-(?!dmg-).+-mac-arm64$/;
const fullCandidateCohortName = /^opl-full-first-install-dmg-.+-mac-arm64-cohort$/;

export function selectPriorFullCandidateRunId(
  artifacts: readonly WorkflowArtifact[],
  rootSourceRunId: string,
): string | undefined {
  const root = runId(rootSourceRunId, 'root_source_run_id');
  const live = artifacts.filter((artifact) => !artifact.expired);
  const hasReceipt = live.some((artifact) => artifact.name === `opl-full-candidate-receipt-${root}`);
  const hasPackage = live.some((artifact) => fullCandidatePackageName.test(artifact.name));
  const hasCohort = live.some((artifact) => fullCandidateCohortName.test(artifact.name));
  return hasReceipt && hasPackage && hasCohort ? root : undefined;
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
  verificationAppSha?: string;
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
  if (input.smokeHarnessSha || input.verificationAppSha) {
    const checkpointRecovery = input.sourceArtifact === `opl-release-full-checkpoint-${sourceRunId}`
      || input.sourceArtifact === `opl-release-append-full-operation-checkpoint-v2-${sourceRunId}`;
    if (!input.priorFullArtifactRunId && !checkpointRecovery) {
      throw new Error('verification harness refs require a reusable Full checkpoint.');
    }
    const smokeHarnessRef = input.smokeHarnessSha
      ? sha(input.smokeHarnessSha, 'smoke_harness_ref')
      : null;
    const verificationAppRef = input.verificationAppSha
      ? sha(input.verificationAppSha, 'verification_app_ref')
      : null;
    workflowInputs.smoke_harness_ref = verificationAppRef
      ? JSON.stringify({ app_ref: verificationAppRef, shell_ref: smokeHarnessRef })
      : smokeHarnessRef!;
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
      smoke_harness_ref: input.smokeHarnessSha ? sha(input.smokeHarnessSha, 'smoke_harness_ref') : null,
      verification_app_ref: input.verificationAppSha ? sha(input.verificationAppSha, 'verification_app_ref') : null,
    },
    cohort: {
      app_sha: workflowInputs.app_ref,
      shell_sha: workflowInputs.shell_ref,
      framework_sha: workflowInputs.framework_ref,
    },
    authority: null,
  };
}

export function buildPublishQualifiedStandardPlan(input: {
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
      verification_app_ref: null,
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

export function conflictingStableRunIds(
  runs: unknown[],
  plan: StableDispatchPlan,
  workflow = defaultWorkflow,
): number[] {
  return runs
    .map(normalizedOwnerRun)
    .filter((run): run is OwnerWorkflowRun => run !== null)
    .filter((run) => (
      run.path === workflow
      && run.event === 'workflow_dispatch'
      && run.head_branch === 'main'
      && activeRunStatuses.has(run.status)
    ))
    .filter((run) => {
      if (plan.operation === 'standard') {
        return plan.authority !== null
          && run.display_title === `OPL Stable standard operation:${plan.authority.operation_id} authority:${plan.authority.authority_id} run:${run.id}`;
      }
      const sourceRunId = plan.source.run_id;
      if (!sourceRunId) return false;
      return run.display_title === `OPL Stable ${plan.operation} source:${sourceRunId} run:${run.id}`
        || run.display_title === `OPL Stable ${plan.operation} ${run.id}`;
    })
    .map((run) => run.id);
}

function assertNoConflictingActiveRun(runtime: Runtime, workflow: string, plan: StableDispatchPlan): void {
  const observation = readOwnerWorkflowRuns({ workflow, runner: runtime.runner, cwd: appRoot });
  if (observation.status !== 'ok') {
    throw new Error(`Stable owner-run reconciliation failed: ${observation.failure_code}.`);
  }
  const active = conflictingStableRunIds(observation.runs, plan, workflow);
  if (active.length > 0) {
    throw new Error(`A matching ${plan.operation} owner run is already active: ${active.join(', ')}.`);
  }
}

function attemptId(operation: string, runtime: Runtime): string {
  const timestamp = runtime.now().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${operation}-${timestamp}-${runtime.randomBytes(4).toString('hex')}`;
}

export function sourceGate(
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
        '--require-shell-format', 'true',
        '--run-shell-tests', 'true',
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

export function buildStandardPlan(input: {
  runtime: Runtime;
  workflow: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  desktopAdditionalPlatforms: string[];
  productChangeSummary: string;
  priorStandardArtifactRunId?: string;
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
  const priorStandardArtifactRunId = input.priorStandardArtifactRunId
    ? runId(input.priorStandardArtifactRunId, 'prior_standard_artifact_run_id')
    : null;
  const workflowInputs: Record<string, string> = {
    operation: 'standard',
    release_intent: 'new_product',
    product_change_summary: text(input.productChangeSummary, 'product_change_summary'),
    authority_id: authority.authority_id,
    operation_id: authority.operation_id,
    authority_carrier: encodeStableOperationAuthorityCarrier(authority),
    authority_digest: authority.authority_digest,
    desktop_additional_platforms: JSON.stringify(authority.desktop_additional_platforms),
  };
  if (priorStandardArtifactRunId) {
    workflowInputs.prior_standard_artifact_run_id = priorStandardArtifactRunId;
  }
  return {
    schema: 'opl_app_stable_dispatch_plan.v1',
    status: 'ready',
    operation: 'standard',
    attempt_id: attemptId('standard', input.runtime),
    version_policy: priorStandardArtifactRunId ? 'preserve_source_tag' : 'explicit_new_product_release',
    workflow_inputs: workflowInputs,
    source: { run_id: null, artifact: null },
    recovery: {
      requested_run_id: priorStandardArtifactRunId,
      artifact_producer_run_id: priorStandardArtifactRunId,
      qualification_run_id: null,
      smoke_harness_ref: null,
      verification_app_ref: null,
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
    operation_started_at: operationStartedAt,
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

export function appendFullOwnersFromCurrentMutation(input: {
  runs: unknown[];
  rootSourceRunId: string;
  workflow: string;
  headSha: string;
  operationStartedAt: string;
}): OwnerWorkflowRun[] {
  const startedAt = Date.parse(input.operationStartedAt);
  if (!Number.isFinite(startedAt)) {
    throw new Error('operation_started_at must be a valid timestamp.');
  }
  const headSha = sha(input.headSha, 'head_sha');
  return reachableAppendFullRuns(input.runs, input.rootSourceRunId, input.workflow).filter((owner) => {
    const createdAt = Date.parse(owner.created_at);
    return Number.isFinite(createdAt)
      && createdAt >= startedAt - createdAtClockSkewMs
      && createdAt <= startedAt + defaultIdentityWindowMs
      && owner.head_sha.toLowerCase() === headSha;
  });
}

export async function identifyAppendFullOwnerAfterMutation(input: {
  runtime: Runtime;
  workflow: string;
  rootSourceRunId: string;
  headSha: string;
  operationStartedAt: string;
  maxAttempts?: number;
}): Promise<{
  status: 'owner_identified' | 'outcome_unknown';
  owner_run: OwnerWorkflowRun | null;
  attempts: number;
  mutation_invocation_count: 1;
  mutation_retry_count: 0;
  redispatch_allowed: false;
  human_redispatch_allowed: false;
}> {
  const root = runId(input.rootSourceRunId, 'root_source_run_id');
  const maxAttempts = input.maxAttempts ?? appendFullOwnerIdentifyAttempts;
  let attempts = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    const observation = readOwnerWorkflowRuns({
      workflow: input.workflow,
      maxAttempts: 1,
      runner: input.runtime.runner,
      cwd: appRoot,
    });
    if (observation.status === 'ok') {
      const mutationOwners = appendFullOwnersFromCurrentMutation({
        runs: observation.runs,
        rootSourceRunId: root,
        workflow: input.workflow,
        headSha: input.headSha,
        operationStartedAt: input.operationStartedAt,
      });
      const active = mutationOwners.filter((owner) => activeRunStatuses.has(owner.status));
      if (active.length > 1) {
        throw new Error(
          `Multiple active Full owners exist for Standard source ${root}: ${active.map((run) => run.id).join(', ')}.`,
        );
      }
      const owner = active[0] ?? (mutationOwners.length === 1 ? mutationOwners[0] : undefined);
      if (owner) {
        return {
          status: 'owner_identified',
          owner_run: owner,
          attempts,
          mutation_invocation_count: 1,
          mutation_retry_count: 0,
          redispatch_allowed: false,
          human_redispatch_allowed: false,
        };
      }
    }
    if (attempt < maxAttempts) await input.runtime.wait(appendFullOwnerIdentifyWaitMs);
  }
  return {
    status: 'outcome_unknown',
    owner_run: null,
    attempts,
    mutation_invocation_count: 1,
    mutation_retry_count: 0,
    redispatch_allowed: false,
    human_redispatch_allowed: false,
  };
}

export async function completeAppendFullDispatch(
  runtime: Runtime,
  repository: string,
  workflow: string,
  executorSha: string,
  plan: StableDispatchPlan,
  rootSourceRunId: string,
  maxIdentifyAttempts?: number,
) {
  const dispatched = await dispatchOnce(runtime, repository, workflow, executorSha, plan);
  if (dispatched.status !== 'outcome_unknown') {
    return {
      ...dispatched,
      redispatch_allowed: false,
      human_redispatch_allowed: false,
    };
  }
  const identified = await identifyAppendFullOwnerAfterMutation({
    runtime,
    workflow,
    rootSourceRunId,
    headSha: executorSha,
    operationStartedAt: dispatched.operation_started_at,
    maxAttempts: maxIdentifyAttempts,
  });
  if (identified.status === 'owner_identified') {
    return {
      ...dispatched,
      status: 'owner_identified' as const,
      owner_run: identified.owner_run,
      read_only_reconcile_only: true,
      redispatch_allowed: false,
      human_redispatch_allowed: false,
    };
  }
  return {
    ...dispatched,
    redispatch_allowed: false,
    human_redispatch_allowed: false,
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
  npm run release:stable-dispatch -- new-product-release --product-change-summary <summary> [--reuse-standard-run-id <failed-run>] [--execute]
  npm run release:stable-dispatch -- publish-qualified-standard --run-id <qualification-run> [--execute]
  npm run release:stable-dispatch -- append-full --source-run-id <standard-or-full-checkpoint-run> [--smoke-harness-ref <sha>] [--verification-app-ref <sha>] [--execute]

Only new-product-release may allocate a tag, and it requires an explicit product-change summary. When --reuse-standard-run-id is present, it continues that failed same-version operation with its already signed and notarized Standard bytes. Publication, repair, and Full operations preserve the source tag and perform at most one workflow dispatch.
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
      'reuse-standard-run-id': { type: 'string' },
      'source-run-id': { type: 'string' },
      'app-ref': { type: 'string' },
      'shell-ref': { type: 'string' },
      'framework-ref': { type: 'string' },
      'smoke-harness-ref': { type: 'string' },
      'verification-app-ref': { type: 'string' },
      'desktop-additional-platforms': { type: 'string' },
      'product-change-summary': { type: 'string' },
      output: { type: 'string' },
    },
  });
  const repository = text(values.repo, 'repo');
  const workflow = text(values.workflow, 'workflow');
  const executorSha = wireSha(runtime, 'origin');
  let plan: StableDispatchPlan;

  if (command === 'new-product-release') {
    assertLatestStandardReleaseComplete(latestRelease(runtime, repository));
    const priorStandardArtifactRunId = values['reuse-standard-run-id']
      ? runId(values['reuse-standard-run-id'], 'reuse_standard_run_id')
      : undefined;
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
      productChangeSummary: text(values['product-change-summary'], 'product_change_summary'),
      priorStandardArtifactRunId,
    });
  } else if (command === 'publish-qualified-standard') {
    const sourceRunId = runId(values['run-id'], 'run_id');
    const artifacts = workflowArtifacts(runtime, repository, sourceRunId);
    plan = buildPublishQualifiedStandardPlan({
      attemptId: attemptId('publish-qualified-standard', runtime),
      sourceRunId,
      sourceArtifact: selectQualifiedStandardCheckpointArtifact(artifacts, sourceRunId),
      frameworkSha: values['framework-ref']
        ? sha(values['framework-ref'], 'framework_ref')
        : wireSha(runtime, frameworkRemote),
    });
  } else if (command === 'append-full') {
    const rootSourceRunId = runId(values['source-run-id'], 'source_run_id');
    const observation = readOwnerWorkflowRuns({ workflow, runner: runtime.runner, cwd: appRoot });
    if (observation.status !== 'ok') {
      throw new Error(`Stable owner-run reconciliation failed: ${observation.failure_code}.`);
    }
    const reachable = reachableAppendFullRuns(observation.runs, rootSourceRunId, workflow);
    const artifactRunIds = new Set([
      rootSourceRunId,
      ...reachable
        .filter((owner) => owner.status === 'completed')
        .map((owner) => String(owner.id)),
    ]);
    const artifactsByRunId: Record<string, WorkflowArtifact[]> = {};
    for (const artifactRunId of artifactRunIds) {
      artifactsByRunId[artifactRunId] = workflowArtifacts(runtime, repository, artifactRunId);
    }
    const appSha = values['app-ref'] ? sha(values['app-ref'], 'app_ref') : executorSha;
    const shellSha = values['shell-ref'] ? sha(values['shell-ref'], 'shell_ref') : wireSha(runtime, shellRemote);
    const frameworkSha = values['framework-ref']
      ? sha(values['framework-ref'], 'framework_ref')
      : wireSha(runtime, frameworkRemote);
    let target = reconcileAppendFullTarget({
      runs: observation.runs,
      rootSourceRunId,
      artifactsByRunId,
      workflow,
    });
    if (target.state === 'dispatch_required'
      && isFullCheckpointArtifact(target.source_artifact, target.source_run_id)) {
      target = reconcileAppendFullCheckpointCohort({
        target,
        rootArtifacts: artifactsByRunId[rootSourceRunId] ?? [],
        checkpointCohort: readFullCheckpointCohort(
          runtime,
          repository,
          target.source_run_id,
          artifactsByRunId[target.source_run_id] ?? [],
        ),
        appSha,
        shellSha,
        frameworkSha,
      });
    }
    const appendAttemptId = attemptId('append-full', runtime);
    if (target.state !== 'dispatch_required') {
      const ownerRun = observation.runs
        .map(normalizedOwnerRun)
        .find((owner) => owner?.id === target.owner_run_id) ?? null;
      writeJson(values.output, {
        schema: 'opl_app_stable_dispatch_attempt.v1',
        status: target.state,
        operation: 'append_full',
        attempt_id: appendAttemptId,
        version_policy: 'preserve_source_tag',
        mutation_invocation_count: 0,
        mutation_retry_count: 0,
        dispatch_transport: null,
        owner_run: ownerRun,
        read_only_reconcile_only: true,
        plan: {
          root_source_run_id: rootSourceRunId,
          source: { run_id: null, artifact: null },
          recovery: null,
          cohort: null,
          authority: null,
        },
      });
      return;
    }
    const sourceRunId = target.source_run_id;
    const sourceArtifact = target.source_artifact;
    const isFullRecovery = sourceArtifact === `opl-release-full-checkpoint-${sourceRunId}`
      || sourceArtifact === `opl-release-append-full-operation-checkpoint-v2-${sourceRunId}`;
    plan = buildAppendFullPlan({
      attemptId: appendAttemptId,
      sourceRunId,
      sourceArtifact,
      appSha,
      shellSha,
      frameworkSha,
      priorFullArtifactRunId: isFullRecovery
        ? undefined
        : selectPriorFullCandidateRunId(artifactsByRunId[rootSourceRunId] ?? [], rootSourceRunId),
      smokeHarnessSha: values['smoke-harness-ref'],
      verificationAppSha: values['verification-app-ref'],
      recoveryRunId: isFullRecovery ? sourceRunId : rootSourceRunId,
    });
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

  if (plan.operation !== 'standard') assertNoConflictingActiveRun(runtime, workflow, plan);
  if (command === 'append-full') {
    const result = await completeAppendFullDispatch(
      runtime,
      repository,
      workflow,
      executorSha,
      plan,
      runId(values['source-run-id'], 'source_run_id'),
    );
    writeJson(values.output, result);
    if (result.status !== 'dispatched' && result.status !== 'owner_identified') process.exitCode = 2;
    return;
  }
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
