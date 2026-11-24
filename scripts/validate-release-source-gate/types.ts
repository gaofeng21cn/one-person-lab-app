export const canonicalAppRepository = 'gaofeng21cn/one-person-lab-app' as const;
export const canonicalAppOwner = canonicalAppRepository.split('/')[0]!;
export const ownerReleaseNamespacePageSize = 100 as const;
export const ownerReleaseNamespacePageLimit = 20 as const;

export type CheckStatus = 'passed' | 'failed' | 'blocked';

export type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export type CommandOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

export type CommandRunner = (command: string, args: string[], options: CommandOptions) => CommandResult;

export type ReleaseSourceGateOptions = {
  version: string | null;
  operationFingerprint: string | null;
  expectedAppHead: string;
  shellRef: string;
  frameworkRef: string;
  requireShellFormat: boolean;
  runShellTests: boolean;
  repoRoot: string;
  shellRoot: string;
  frameworkRoot: string;
  output: string;
  json: boolean;
};

export type Check = {
  id: string;
  status: CheckStatus;
  message: string;
  expected?: string;
  actual?: string;
  command?: string;
};

export type RequiredGate = {
  id: string;
  required: true;
  command: string;
  cwd: string;
  executed: boolean;
  reason: string;
};

export type SourceGateBlocker = {
  schema: 'opl_app_release_source_gate_blocker.v1';
  phase: 'pre_admission' | 'required_gate_execution';
  blocker_kind: 'pre_admission_failed' | 'required_gate_failed';
  failed_check_ids: string[];
  next_action: 'repair_pre_admission' | 'repair_source_gate';
  reason: string;
};

export type ImmutableCohortIdentity = {
  version: string | null;
  operation_fingerprint: string | null;
  app_sha: string;
  shell_sha: string;
  framework_sha: string;
};

export type GithubOwnerReleaseAsset = {
  id: number;
  name: string;
  size: number;
  digest: string | null;
  browser_download_url: string;
};

export type GithubOwnerDraftReservation = {
  id: number;
  tag: string;
  target: string;
  draft: true;
  prerelease: boolean;
  assets: GithubOwnerReleaseAsset[];
};

export type GithubOwnerReleaseNamespaceEvidence = {
  schema: 'opl_github_owner_release_namespace_evidence.v1';
  status: 'verified_complete';
  repository: typeof canonicalAppRepository;
  endpoint: `repos/${typeof canonicalAppRepository}/releases`;
  checked_at: string;
  read_context: 'controller_source_gate_pre_nonce';
  owner: {
    authenticated_login: typeof canonicalAppOwner;
    repository_owner: typeof canonicalAppOwner;
    repository_full_name: typeof canonicalAppRepository;
    repository_push: true;
  };
  pagination: {
    page_size: typeof ownerReleaseNamespacePageSize;
    page_count: number;
    terminal_page_size: number;
    release_count: number;
    complete: true;
  };
  draft_reservations: GithubOwnerDraftReservation[];
  release_collection_digest: string;
  evidence_digest: string;
};

export type ReleaseSourceGateReport = {
  schema: 'opl_app_release_source_gate.v1';
  generated_at: string;
  status: 'passed' | 'failed';
  repo_root: string;
  version: string | null;
  operation_fingerprint: string | null;
  expected_app_head: string;
  app_head: string | null;
  shell_ref: string;
  shell_sha: string | null;
  shell_root: string;
  framework_ref: string;
  framework_sha: string | null;
  framework_root: string;
  require_shell_format: boolean;
  run_shell_tests: boolean;
  owner_release_namespace: GithubOwnerReleaseNamespaceEvidence | null;
  admission: {
    status: 'passed' | 'blocked';
    immutable_cohort: ImmutableCohortIdentity | null;
    failed_check_ids: string[];
    next_action: 'run_required_source_gates' | 'repair_pre_admission';
  };
  typed_blocker: SourceGateBlocker | null;
  checks: Check[];
  required_gates: RequiredGate[];
};

export type ReleaseSourceGateEnvironment = {
  pathExists?: (candidatePath: string) => boolean;
  readJson?: (candidatePath: string) => unknown;
  variables?: NodeJS.ProcessEnv;
  preparationFailure?: string;
};
