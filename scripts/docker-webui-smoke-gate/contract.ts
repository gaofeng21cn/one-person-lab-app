import type { validateDockerWebuiDiagnostics } from '../validate-docker-webui-diagnostics.ts';

export type ImageIdentity = ReturnType<typeof validateDockerWebuiDiagnostics>['image_identity'];

export type GateId = 'clean_linux_vm' | 'clean_windows_vm' | 'existing_docker' | 'existing_old_onepersonlab_data_dir';

export type GateOptions = {
  gate: GateId | '';
  artifacts: string;
  evidence: string;
  validateResult: string;
  image: string;
  port: number;
  healthTimeout: number;
  noOpen: boolean;
  json: boolean;
};

export type GateResult = {
  schema: 'opl_docker_webui_smoke_gate_result.v1';
  gate: GateId;
  gate_id: GateId;
  status: 'passed' | 'typed_blocker' | 'failed';
  typed_blocker: GateResultBlocker | null;
  observed_at: string;
  host_platform: NodeJS.Platform;
  required_environment: string;
  artifact_dir: string;
  diagnostics_dir: string;
  diagnostics_validation?: ReturnType<typeof validateDockerWebuiDiagnostics>;
  evidence_validation?: {
    status: 'passed' | 'failed';
    evidence_dir: string;
    manifest_path: string;
    errors: string[];
    forbidden_secret_markers: string[];
  };
  blocker?: GateResultBlocker;
  health: { url: string; status: 'passed' | 'failed' | 'not_run'; http_status: number | null };
  compose: { path: string; status: 'present' | 'missing' | 'not_run' };
  container: { name: string; status: string; id: string | null };
  image: {
    ref: string;
    status: 'present' | 'missing' | 'not_run';
    id: string | null;
    repo_digests: string[];
    digest: string | null;
    remote_ref: string | null;
    remote_digest: string | null;
    currentness_status: 'not_checked' | 'current' | 'update_available' | 'unknown';
    currentness_evidence_source: string | null;
    currentness_claim: false;
  };
  data_preservation: { status: 'passed' | 'failed' | 'not_run'; verdict: string | null; summary: string };
  api_key_flow: {
    status: 'passed' | 'failed' | 'not_run';
    mode: 'webui_proxy_configure_codex' | 'imported_evidence' | 'not_run';
    endpoint: string | null;
    command: string | null;
    stdin_transport: boolean;
    receipt_path: string | null;
    errors: string[];
  };
  ordinary_user_status: OrdinaryUserStatus;
  secret_scan: { status: 'passed' | 'failed' | 'not_run'; forbidden_secret_markers: string[] };
  commands: Array<{ command: string; status: number | null; stdout_path: string; stderr_path: string }>;
  evidence: Record<string, string>;
};

export type OrdinaryUserStatus = {
  path_id: 'ordinary_docker_webui_user_path';
  priority: 'ordinary_user_path_before_evidence_bundle_language';
  one_click_install: OrdinaryStatusRow;
  browser_webui: OrdinaryStatusRow;
  access_key_settings: OrdinaryStatusRow;
  runtime_proxy: OrdinaryStatusRow;
  startup_recovery: OrdinaryStatusRow;
  data_preservation: OrdinaryStatusRow;
  host_update: OrdinaryStatusRow;
  image_seed_selection: string;
  settings_entry: 'Settings -> Account & Access';
  must_not_claim: string[];
};

type OrdinaryStatusRow = {
  status: 'passed' | 'typed_blocker' | 'failed' | 'not_run';
  summary: string;
  next_action: string | null;
  evidence_ref: string | null;
};

type GateResultBlocker = {
  code: string;
  owner: string;
  message: string;
  required_next_action: string;
};

export type GateResultValidation = {
  status: 'passed' | 'failed';
  missing_fields: string[];
  invalid_fields: string[];
};

export const resultSchema = 'opl_docker_webui_smoke_gate_result.v1';
export const windowsEvidenceManifestName = 'windows-smoke-evidence.json';
export const windowsEvidenceSchema = 'opl_docker_webui_windows_smoke_evidence.v1';
export const apiKeyFlowEvidenceSchema = 'opl_docker_webui_api_key_flow_evidence.v1';

export const requiredResultFields = [
  'schema',
  'gate',
  'gate_id',
  'status',
  'typed_blocker',
  'observed_at',
  'host_platform',
  'required_environment',
  'artifact_dir',
  'diagnostics_dir',
  'diagnostics_validation',
  'health',
  'compose',
  'container',
  'image',
  'data_preservation',
  'api_key_flow',
  'ordinary_user_status',
  'secret_scan',
  'commands',
  'evidence',
];

export const ordinaryStatusRows = [
  'one_click_install',
  'browser_webui',
  'access_key_settings',
  'runtime_proxy',
  'startup_recovery',
  'data_preservation',
  'host_update',
] as const;

export const expectedImageSeedSelection = 'Default latest image must use the WebUI full seed; --tag/--image are explicit advanced overrides.';
export const ordinaryMustNotClaim = [
  'desktop_release_ready',
  'real_install_ready',
  'clean_windows_vm_pass_without_clean_windows_evidence',
  'release_ready',
] as const;
export const imageCurrentnessStatuses = ['not_checked', 'current', 'update_available', 'unknown'] as const;
