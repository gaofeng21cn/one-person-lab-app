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
  if (input.smokeHarnessSha) {
    const checkpointRecovery = input.sourceArtifact === `opl-release-full-checkpoint-${sourceRunId}`
      || input.sourceArtifact === `opl-release-append-full-operation-checkpoint-v2-${sourceRunId}`;
    if (!input.priorFullArtifactRunId && !checkpointRecovery) {
      throw new Error('smoke_harness_ref requires a reusable Full checkpoint.');
    }
    workflowInputs.smoke_harness_ref = sha(input.smokeHarnessSha, 'smoke_harness_ref');
  }
  if (input.verificationAppSha) {
    const checkpointRecovery = input.sourceArtifact === `opl-release-full-checkpoint-${sourceRunId}`
      || input.sourceArtifact === `opl-release-append-full-operation-checkpoint-v2-${sourceRunId}`;
    if (!input.priorFullArtifactRunId && !checkpointRecovery) {
      throw new Error('verification_app_ref requires a reusable Full checkpoint.');
    }
    workflowInputs.verification_app_ref = sha(input.verificationAppSha, 'verification_app_ref');
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
      verification_app_ref: workflowInputs.verification_app_ref ?? null,
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

function buildStandardPlan(input: {
  runtime: Runtime;
  workflow: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  desktopAdditionalPlatforms: string[];
  productChangeSummary: string;
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
    version_policy: 'explicit_new_product_release',
    workflow_inputs: {
      operation: 'standard',
      release_intent: 'new_product',
      product_change_summary: text(input.productChangeSummary, 'product_change_summary'),
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
  npm run release:stable-dispatch -- new-product-release --product-change-summary <summary> [--execute]
  npm run release:stable-dispatch -- publish-qualified-standard --run-id <qualification-run> [--execute]
  npm run release:stable-dispatch -- append-full --source-run-id <standard-or-full-checkpoint-run> [--smoke-harness-ref <sha>] [--verification-app-ref <sha>] [--execute]

Only new-product-release may allocate a tag, and it requires an explicit product-change summary. Publication, repair, and Full operations preserve the source tag and perform at most one workflow dispatch.
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
    const target = reconcileAppendFullTarget({
      runs: observation.runs,
      rootSourceRunId,
      artifactsByRunId,
      workflow,
    });
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
      appSha: values['app-ref'] ? sha(values['app-ref'], 'app_ref') : executorSha,
      shellSha: values['shell-ref'] ? sha(values['shell-ref'], 'shell_ref') : wireSha(runtime, shellRemote),
      frameworkSha: values['framework-ref']
        ? sha(values['framework-ref'], 'framework_ref')
        : wireSha(runtime, frameworkRemote),
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
