export type ReleaseChannel = 'stable' | 'nightly' | 'preview';

export type ReleaseNoteOptions = {
  version: string;
  channel: ReleaseChannel;
  releaseRepo?: string;
  shellRoot?: string;
  includeFullPackage?: boolean;
  fullPackageManifest?: unknown;
  fullPayloadAuthoritySha256?: string;
  previousFullPackageManifest?: unknown;
  previousTag?: string;
  currentTag?: string;
  previousAppRef?: string;
  currentAppRef?: string;
  previousShellRef?: string;
  currentShellRef?: string;
};

export type ChangeBucketId = 'agents' | 'first_run' | 'release' | 'ui_settings' | 'docs' | 'quality';

export type ChangeBucket = {
  title: string;
  bullets: string[];
};

export type AgentRuntimeChange = {
  label: string;
  component: string;
  role: string;
  previous_ref: string | null;
  current_ref: string | null;
  audit_ref: string | null;
  change_subjects: string[];
  user_value_hint: string;
  change_summary_hint: string | null;
};

export type FamilyRepoChange = {
  label: string;
  repository: string;
  previous_ref: string | null;
  current_ref: string | null;
  previous_version: string | null;
  current_version: string | null;
  compare_url: string | null;
  compare_status: string | null;
  commit_count: number | null;
  change_subjects: string[];
  change_summary_hint: string | null;
};

export type ReleaseNotesEvidence = {
  schema: 'opl_app_release_notes_evidence.v1';
  shell_transition?: { previous_repository: string; current_repository: string; summary: string };
  version: string;
  channel: ReleaseChannel;
  release_title: string;
  release_repo: string;
  current_tag: string;
  previous_tag: string | null;
  app_commit_subjects: string[];
  shell_commit_subjects: string[];
  grouped_changes: ChangeBucket[];
  payload: {
    include_full_package: boolean;
    full_payload_authority_sha256: string | null;
    lines: string[];
    bundled_refs: string[];
    updates_since_previous_stable: string[];
  };
  agent_runtime_changes: AgentRuntimeChange[];
  family_repo_changes: FamilyRepoChange[];
  release_scope: string;
  install_command: string | null;
  full_changelog_url: string | null;
};
