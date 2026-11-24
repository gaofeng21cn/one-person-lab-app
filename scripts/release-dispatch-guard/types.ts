export const defaultIdentityWindowMs = 5 * 60_000;
export const createdAtClockSkewMs = 30_000;
export const ownerRunParser = 'node_structured_json_without_jq' as const;

export type ReadFailureKind = 'transport' | 'credential' | 'not_found' | 'protocol' | 'deterministic';
export type ReadFailureCode =
  | 'tls_handshake_timeout'
  | 'unexpected_eof'
  | 'transport_timeout'
  | 'transport_error'
  | 'credential_failure'
  | 'not_found'
  | 'invalid_response'
  | 'truncated_response'
  | 'unchanged_failure_fingerprint';

export type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

export type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number },
) => CommandResult;

export type BoundedReadResult =
  | {
      status: 'ok';
      stdout: string;
      attempts: number;
    }
  | {
      status: 'failed';
      failure_kind: ReadFailureKind;
      failure_code: ReadFailureCode;
      detail: string;
      attempts: number;
    };

export type WireRefResult =
  | {
      status: 'ok';
      repository: string;
      ref: string;
      sha: string;
      attempts: number;
      transport: 'git_wire';
    }
  | {
      status: 'failed';
      repository: string;
      ref: string;
      sha: null;
      attempts: number;
      transport: 'git_wire';
      failure_kind: ReadFailureKind;
      failure_code: ReadFailureCode;
      detail: string;
    };

export type OwnerWorkflowRun = {
  id: number;
  path: string;
  status: string;
  conclusion: string | null;
  event: string;
  head_branch: string;
  head_sha: string;
  run_attempt: number;
  created_at: string;
  display_title: string;
};

export type OwnerRunsResult =
  | {
      status: 'ok';
      endpoint: string;
      attempts: number;
      logical_query_count: 1;
      parser: typeof ownerRunParser;
      runs: unknown[];
    }
  | {
      status: 'failed';
      endpoint: string;
      attempts: number;
      logical_query_count: 1;
      parser: typeof ownerRunParser;
      failure_kind: ReadFailureKind;
      failure_code: ReadFailureCode;
      detail: string;
    };

export type OwnerRunIdentity = {
  workflow: string;
  headSha: string;
  operationStartedAt: string;
  observedAt?: string;
  identityWindowMs?: number;
};

export type UniqueOwnerRunResult =
  | {
      status: 'unique';
      match_count: 1;
      run: OwnerWorkflowRun;
    }
  | {
      status: 'outcome_unknown';
      match_count: number;
      run: null;
      reason: 'zero_matches' | 'ambiguous_matches';
    };

export type PreNonceGuardInput = {
  expectedAppSha: string;
  expectedShellSha: string;
  expectedFrameworkSha: string;
  workflow: string;
  sourceGateReport: unknown;
  currentRunId?: string;
  authorityId?: string;
  operationId?: string;
  priorFailureFingerprint?: unknown;
  currentFailureFingerprint?: unknown;
  maxReadAttempts?: number;
};

export type PostDispatchReconcileInput = OwnerRunIdentity & {
  mutationInvocationCount: 1;
  maxReadAttempts?: number;
};
