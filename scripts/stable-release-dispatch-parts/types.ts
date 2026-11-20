import { redactReleaseCommandDetail } from '../release-file-helpers.ts';
import type {
  CommandResult,
  CommandRunner,
} from '../release-dispatch-guard.ts';

export type JsonRecord = Record<string, unknown>;

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
    prior_full_artifact_run_id?: string;
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

export type FullSourceRefs = {
  appSha: string;
  shellSha: string;
  frameworkSha: string;
};

export const defaultWorkflow = '.github/workflows/release-stable.yml';
export const activeRunStatuses = new Set(['queued', 'in_progress', 'waiting', 'pending']);

const shaPattern = /^[0-9a-f]{40}$/;
const runIdPattern = /^[1-9][0-9]*$/;

export function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be one JSON object.`);
  }
  return value as JsonRecord;
}

export function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing.`);
  return value.trim();
}

export function sha(value: unknown, label: string): string {
  const normalized = text(value, label).toLowerCase();
  if (!shaPattern.test(normalized)) throw new Error(`${label} must be an exact commit SHA.`);
  return normalized;
}

export function runId(value: unknown, label: string): string {
  const normalized = text(value, label);
  if (!runIdPattern.test(normalized)) throw new Error(`${label} must be a positive GitHub run id.`);
  return normalized;
}

export function commandDetail(result: CommandResult): string {
  return redactReleaseCommandDetail([result.stderr, result.stdout, result.error?.message]
    .filter(Boolean)
    .join('\n')
    .trim()
    .replace(/\s+/g, ' '));
}

export function runRequired(
  runtime: Runtime,
  command: string,
  args: string[],
  timeoutMs: number,
  label: string,
  cwd: string,
): string {
  const result = runtime.runner(command, args, { cwd, timeoutMs });
  if (result.status !== 0 || result.error) {
    throw new Error(`${label} failed: ${commandDetail(result) || `exit ${String(result.status)}`}`);
  }
  return result.stdout;
}
