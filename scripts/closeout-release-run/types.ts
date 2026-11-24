export type ArtifactProfile = 'primary' | 'diagnostics' | 'readiness-inputs';

export type Options = {
  version: string;
  runId: string;
  repo: string;
  outDir: string;
  output: string;
  markdown: string;
  monitor: string;
  notification: string;
  runJsonPath: string;
  jobsJsonPath: string;
  artifactsJsonPath: string;
  artifactsDir: string;
  stableSessionPath: string;
  promotionSagaReceiptPath: string;
  completionManifest: string;
  artifactProfile: ArtifactProfile;
  noDownload: boolean;
  agentStartedAt: string;
  agentFinishedAt: string;
  agentWallTime: string;
};

export type JsonRecord = Record<string, unknown>;

export type DownloadedArtifact = {
  name: string;
  path: string;
};

export type ArtifactDownloadResult = {
  mode: 'read_existing' | 'downloaded_generation' | 'no_matching_artifacts';
  generation_id: string | null;
  committed_path: string;
  previous_generation_path: string | null;
  downloaded: DownloadedArtifact[];
};

export type ArtifactJson = {
  path: string | null;
  absolutePath: string | null;
  payload: JsonRecord | null;
};

export type AttestationVerificationSummary = {
  state: 'verified' | 'failed' | 'missing';
  role: 'build_integrity_evidence';
  source_path: string | null;
  verification: JsonRecord | null;
  verify_commands: string[];
  does_not_replace: string[];
  rule: string;
};

export type StableTerminalEvidence = {
  status: 'unavailable' | 'invalid' | 'historical_receipts_valid';
  authority: 'framework_release_checkpoint_only';
  diagnostics_only: true;
  stable_session_path: string | null;
  promotion_saga_receipt_path: string | null;
  stable_session_id: string | null;
  session_revision: number | null;
  session_phase: string | null;
  observed_run_role: 'source_release' | 'promotion' | null;
  published: boolean;
  standard_terminal: boolean;
  errors: string[];
  routes: {
    status: string;
    resume: string;
  };
};

export type OutputGeneration = {
  schema: 'opl_release_closeout_output_generation.v1';
  id: string;
  generated_at: string;
  required_output_count: 4;
  completion_manifest: string;
};

export type Job = {
  name: string;
  status: string | null;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
};

export type JobSummary = {
  count: number;
  slowest_jobs: Job[];
  failed_jobs: Job[];
};

export type RunTiming = {
  created_at: string | null;
  run_started_at: string | null;
  first_job_started_at: string | null;
  updated_at: string | null;
  workflow_wall_time_seconds: number | null;
  queue_or_admission_seconds: number | null;
  runner_execution_seconds: number | null;
  first_job_delay_seconds: number | null;
  job_span_seconds: number | null;
};

export type FailedRerunTax = {
  failed_rerun_tax_seconds: number;
  previous_failed_run_count: number;
  previous_failed_runs: JsonRecord[];
  current_failed_workflow_seconds: number | null;
  current_failed_job_tax_seconds: number;
  source: string;
  note: string;
};

export type Decision = {
  next_action: string;
  reason: string;
  command: string;
  routes: StableTerminalEvidence['routes'];
  diagnostics_only: true;
  mutation_authorized: false;
};

export type FullPackageProfile = {
  duration_seconds: JsonRecord | null;
  cache: JsonRecord | null;
  runtime_cache: JsonRecord | null;
  size_budget: JsonRecord | null;
  size_analysis: JsonRecord | null;
  size_analysis_source: string | null;
  diagnostic_runtime_cache_event_count: number;
};

export type CloseoutSummary = {
  schema: 'opl_release_closeout_summary.v1';
  version: string;
  generated_at: string;
  output_generation: OutputGeneration;
  release_repo: string;
  authority_boundary: JsonRecord;
  run: {
    id: string;
    workflow_name: string | null;
    display_title: string | null;
    status: string | null;
    conclusion: string | null;
    event: string | null;
    head_branch: string | null;
    head_sha: string | null;
    url: string | null;
    timing: RunTiming;
  };
  clock_boundary: JsonRecord;
  artifact_policy: JsonRecord;
  source_status: JsonRecord;
  source_paths: JsonRecord;
  artifact_attestation_verification: AttestationVerificationSummary;
  stable_terminal_evidence: StableTerminalEvidence;
  candidate_record: JsonRecord | null;
  release_preflight_summary: JsonRecord | null;
  remote_release_verification: JsonRecord | null;
  readiness: JsonRecord | null;
  addon_readiness: JsonRecord | null;
  failed_rerun_tax: FailedRerunTax;
  bottlenecks: JsonRecord[];
  optimization_recommendations: JsonRecord[];
  full_package_tuning: FullPackageProfile;
  jobs: JobSummary;
  decision: Decision;
  operator_loop_optimization: JsonRecord;
  monitor?: MonitorSummary;
  notification_payload?: NotificationPayload;
};

export type MonitorSummary = {
  schema: 'opl_release_run_monitor.v1';
  version: string;
  generated_at: string;
  output_generation: OutputGeneration;
  repo: string;
  run: JsonRecord;
  state: 'running' | 'failed' | 'diagnostics_only';
  next_action: string;
  recommended_next_action: JsonRecord;
  failed_gate_count: number | null;
  failed_job_count: number;
  source_status: JsonRecord;
  authority: 'diagnostics_only';
  mutation_authorized: false;
  promote_ready: false;
  published: boolean;
  terminal: boolean;
  terminal_evidence_status: StableTerminalEvidence['status'];
  no_watch_instructions: string[];
  artifact_policy: JsonRecord;
};

export type NotificationPayload = {
  schema: 'opl_release_run_notification.v1';
  topic: 'opl_release_run_monitor';
  version: string;
  output_generation: OutputGeneration;
  state: MonitorSummary['state'];
  title: string;
  body: string;
  next_action: JsonRecord;
  run_url: string | null;
  artifact: string;
  machine_payload: 'release-monitor.json';
};
