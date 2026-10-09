#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { readActiveShellBuildProfile } from './active-shell-build-profile.ts';
import { inspectQualificationHarnessScope, validateQualificationHarnessConsumer } from './qualification-harness-scope.ts';
import { buildPostDispatchReconcile, readOwnerWorkflowRuns } from './release-dispatch-guard.ts';
import {
  activeStableRunIds,
  appendFullOwnerIdentifyAttempts,
  appendFullOwnerIdentifyWaitMs,
  appendFullOwnersFromCurrentMutation,
  assertNoConflictingActiveRun,
  conflictingStableRunIds,
  identifyAppendFullOwnerAfterMutation,
  normalizedOwnerRun,
  reachableAppendFullRuns,
  reconcileAppendFullTarget,
} from './stable-release-dispatch-parts/owner-run-reconciliation.ts';
import {
  downloadExactWorkflowArtifact,
  downloadStableSourceEvidence,
  isFullCheckpointArtifact,
  readFullCheckpointCohort,
  readReusableStandardSourceGate,
  selectCheckpointArtifact,
  selectPriorFullCandidateRunId,
  selectQualifiedStandardCheckpointArtifact,
  selectReusableFullCheckpointArtifact,
  selectReusableStandardCheckpointArtifact,
  workflowArtifacts,
} from './stable-release-dispatch-parts/artifact-retrieval.ts';
import {
  assertLatestStandardReleaseComplete,
  attemptId,
  buildAppendFullPlan,
  buildPublishQualifiedStandardPlan,
  buildStandardPlan,
  fullCheckpointMatchesRequestedCohort,
  latestRelease,
  reconcileAppendFullCheckpointCohort,
  resolveAppendFullCohort,
  sourceGate,
  validateShellSmokeHarness,
  wireSha,
  workflowDispatchArgs,
} from './stable-release-dispatch-parts/plan-source-guards.ts';
import {
  commandDetail,
  defaultWorkflow,
  runId,
  sha,
  text,
  type Runtime,
  type StableDispatchPlan,
  type WorkflowArtifact,
} from './stable-release-dispatch-parts/types.ts';

export {
  activeStableRunIds,
  appendFullOwnerIdentifyAttempts,
  appendFullOwnerIdentifyWaitMs,
  appendFullOwnersFromCurrentMutation,
  assertLatestStandardReleaseComplete,
  assertNoConflictingActiveRun,
  buildAppendFullPlan,
  buildPublishQualifiedStandardPlan,
  buildStandardPlan,
  commandDetail,
  conflictingStableRunIds,
  downloadExactWorkflowArtifact,
  downloadStableSourceEvidence,
  fullCheckpointMatchesRequestedCohort,
  identifyAppendFullOwnerAfterMutation,
  readFullCheckpointCohort,
  readReusableStandardSourceGate,
  reachableAppendFullRuns,
  reconcileAppendFullCheckpointCohort,
  reconcileAppendFullTarget,
  resolveAppendFullCohort,
  selectCheckpointArtifact,
  selectPriorFullCandidateRunId,
  selectQualifiedStandardCheckpointArtifact,
  selectReusableFullCheckpointArtifact,
  selectReusableStandardCheckpointArtifact,
  sourceGate,
  validateShellSmokeHarness,
  workflowDispatchArgs,
};
export type {
  AppendFullTargetState,
  FullSourceRefs,
  JsonRecord,
  Runtime,
  StableDispatchOperation,
  StableDispatchPlan,
  WorkflowArtifact,
} from './stable-release-dispatch-parts/types.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const activeShellBuild = readActiveShellBuildProfile(appRoot);
const defaultRepository = 'gaofeng21cn/one-person-lab-app';
const shellRemote = `https://github.com/${activeShellBuild.repository}.git`;
const frameworkRemote = 'https://github.com/gaofeng21cn/one-person-lab.git';

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

function writeJson(filePath: string | undefined, value: unknown): void {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (filePath) {
    const resolved = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, serialized, 'utf8');
  }
  process.stdout.write(serialized);
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
  npm run release:stable-dispatch -- new-product-release --product-change-summary <summary> [--reuse-standard-run-id <failed-run> --smoke-harness-ref <sha>] [--execute]
  npm run release:stable-dispatch -- publish-qualified-standard --run-id <qualification-run> [--source-artifact <exact-publication-checkpoint>] [--execute]
  npm run release:stable-dispatch -- append-full --source-run-id <standard-or-full-checkpoint-run> [--source-artifact <exact-full-checkpoint>] [--smoke-harness-ref <sha>] [--verification-app-ref <sha>] [--execute]

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
      'source-gate-run-id': { type: 'string' },
      'source-run-id': { type: 'string' },
      'source-artifact': { type: 'string' },
      'completed-webui-run-id': { type: 'string' },
      'app-ref': { type: 'string' },
      'shell-ref': { type: 'string' },
      'framework-ref': { type: 'string' },
      'framework-executor-ref': { type: 'string' },
      'smoke-harness-ref': { type: 'string' },
      'verification-app-ref': { type: 'string' },
      'desktop-additional-platforms': { type: 'string' },
      'product-change-summary': { type: 'string' },
      output: { type: 'string' },
    },
  });
  const repository = text(values.repo, 'repo');
  const workflow = text(values.workflow, 'workflow');
  if (values['smoke-harness-ref']) validateShellSmokeHarness(runtime, values['smoke-harness-ref']);
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
      smokeHarnessSha: values['smoke-harness-ref'],
      reusableSourceGate: (values['source-gate-run-id'] || priorStandardArtifactRunId)
        ? readReusableStandardSourceGate(runtime, repository, runId(values['source-gate-run-id'] || priorStandardArtifactRunId!, 'source_gate_run_id'))
        : undefined,
    });
  } else if (command === 'publish-qualified-standard') {
    const sourceRunId = runId(values['run-id'], 'run_id');
    const artifacts = workflowArtifacts(runtime, repository, sourceRunId);
    plan = buildPublishQualifiedStandardPlan({
      attemptId: attemptId('publish-qualified-standard', runtime),
      sourceRunId,
      sourceArtifact: selectQualifiedStandardCheckpointArtifact(artifacts, sourceRunId, values['source-artifact']),
      frameworkSha: values['framework-ref']
        ? sha(values['framework-ref'], 'framework_ref')
        : wireSha(runtime, frameworkRemote),
    });
  } else if (command === 'append-full') {
    const rootSourceRunId = runId(values['source-run-id'], 'source_run_id');
    const observation = readOwnerWorkflowRuns({
      workflow,
      runner: runtime.runner,
      cwd: appRoot,
    });
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
    const requestedSourceArtifact = values['source-artifact']
      ? text(values['source-artifact'], 'source_artifact')
      : null;
    let target = requestedSourceArtifact
      ? (() => {
          if (!isFullCheckpointArtifact(requestedSourceArtifact, rootSourceRunId)) {
            throw new Error(
              `append-full --source-artifact must be an exact Full checkpoint for source run ${rootSourceRunId}.`,
            );
          }
          const matching = (artifactsByRunId[rootSourceRunId] ?? [])
            .filter((artifact) => !artifact.expired && artifact.name === requestedSourceArtifact);
          if (matching.length !== 1) {
            throw new Error(
              `Source run ${rootSourceRunId} must expose exactly one requested Full checkpoint artifact.`,
            );
          }
          return {
            state: 'dispatch_required' as const,
            root_source_run_id: rootSourceRunId,
            owner_run_id: null,
            source_run_id: rootSourceRunId,
            source_artifact: requestedSourceArtifact,
          };
        })()
      : reconcileAppendFullTarget({
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
    const checkpointCohort = isFullCheckpointArtifact(target.source_artifact, target.source_run_id)
      ? readFullCheckpointCohort(runtime, repository, target.source_run_id, artifactsByRunId[target.source_run_id] ?? [])
      : undefined;
    const { appSha, shellSha, frameworkSha } = resolveAppendFullCohort(checkpointCohort, {
      appSha: values['app-ref'], shellSha: values['shell-ref'], frameworkSha: values['framework-ref'],
    }, (key) => key === 'appSha' ? executorSha : wireSha(runtime, key === 'shellSha' ? shellRemote : frameworkRemote));
    if (checkpointCohort !== undefined) {
      target = reconcileAppendFullCheckpointCohort({
        target, rootArtifacts: artifactsByRunId[rootSourceRunId] ?? [], checkpointCohort,
        exactArtifactRequested: Boolean(requestedSourceArtifact),
        appSha, shellSha, frameworkSha,
      });
    }
    if (target.state !== 'dispatch_required' || target.source_run_id === null || target.source_artifact === null) {
      throw new Error('Append Full target reconciliation did not produce a dispatch-required source.');
    }
    const sourceRunId = target.source_run_id;
    const sourceArtifact = target.source_artifact;
    const isFullRecovery = isFullCheckpointArtifact(sourceArtifact, sourceRunId);
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
      frameworkExecutorSha: values['framework-executor-ref']
        ? sha(values['framework-executor-ref'], 'framework_executor_ref')
        : wireSha(runtime, frameworkRemote),
    });
  } else {
    usage();
  }

  if (values['smoke-harness-ref'] || values['verification-app-ref']) {
    const cohort = plan.cohort;
    if (!cohort) throw new Error('Verification harness refs require an exact artifact cohort.');
    const scopeRunner = (command: string, args: string[], options?: { cwd?: string }) =>
      runtime.runner(command, args, { cwd: options?.cwd ?? appRoot, timeoutMs: 120_000 });
    const proof = inspectQualificationHarnessScope(scopeRunner, {
      artifactAppSha: cohort.app_sha,
      verificationAppSha: values['verification-app-ref'] || cohort.app_sha,
      artifactShellSha: cohort.shell_sha,
      verificationShellSha: values['smoke-harness-ref'] || cohort.shell_sha,
      profile: command === 'append-full' ? 'full' : 'standard',
    });
    validateQualificationHarnessConsumer(scopeRunner, proof);
  }

  if (values['completed-webui-run-id']) {
    if (command !== 'publish-qualified-standard' && !(command === 'new-product-release' && values['reuse-standard-run-id'])) {
      throw new Error('--completed-webui-run-id requires publish-qualified-standard or signed Standard recovery.');
    }
    plan.workflow_inputs.source_artifact = JSON.stringify({
      ...(command === 'publish-qualified-standard' ? { checkpoint: plan.workflow_inputs.source_artifact } : {}),
      completed_webui_run_id: runId(values['completed-webui-run-id'], 'completed_webui_run_id'),
    });
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
