import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyStableSourceOperation } from '../stable-followup-router.ts';
import {
  createdAtClockSkewMs,
  defaultIdentityWindowMs,
  readOwnerWorkflowRuns,
  type OwnerWorkflowRun,
} from '../release-dispatch-guard.ts';
import {
  reusableFullBuildCohorts,
  reusableFullFinalizerInput,
  selectCheckpointArtifact,
  selectReusableFullCheckpointArtifact,
} from './artifact-retrieval.ts';
import {
  activeRunStatuses,
  defaultWorkflow,
  runId,
  sha,
  type AppendFullTargetState,
  type Runtime,
  type StableDispatchPlan,
  type JsonRecord,
} from './types.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const appendFullOwnerIdentifyAttempts = 12;
export const appendFullOwnerIdentifyWaitMs = 5_000;

export function normalizedOwnerRun(value: unknown): OwnerWorkflowRun | null {
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
      && classifyStableSourceOperation(run.display_title) !== 'studio'
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
  artifactsByRunId: Readonly<Record<string, readonly import('./types.ts').WorkflowArtifact[]>>;
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
    const ownerArtifacts = [...(input.artifactsByRunId[String(owner.id)] ?? [])];
    const checkpoint = selectReusableFullCheckpointArtifact(
      ownerArtifacts,
      String(owner.id),
    );
    if (checkpoint) {
      const fullBuildCohorts = reusableFullBuildCohorts(ownerArtifacts);
      if (fullBuildCohorts.length > 1) {
        throw new Error(
          `Run ${owner.id} must expose at most one reusable Full build cohort; found ${fullBuildCohorts.length}.`,
        );
      }
      if (fullBuildCohorts.length === 0 && !reusableFullFinalizerInput(ownerArtifacts, String(owner.id))) continue;
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

export function assertNoConflictingActiveRun(
  runtime: Runtime,
  workflow: string,
  plan: StableDispatchPlan,
): void {
  const observation = readOwnerWorkflowRuns({ workflow, runner: runtime.runner, cwd: appRoot });
  if (observation.status !== 'ok') {
    throw new Error(`Stable owner-run reconciliation failed: ${observation.failure_code}.`);
  }
  const active = conflictingStableRunIds(observation.runs, plan, workflow);
  if (active.length > 0) {
    throw new Error(`A matching ${plan.operation} owner run is already active: ${active.join(', ')}.`);
  }
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
