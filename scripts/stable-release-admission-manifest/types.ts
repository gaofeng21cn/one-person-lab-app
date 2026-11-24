import type { PublishedRelease } from '../stable-release-version-order.ts';

export type JsonRecord = Record<string, any>;

export type StableAdmissionInput = {
  baseVersion: string;
  releaseIntent: 'new_product';
  productChangeSummary: string;
  appRef: string;
  shellRef: string;
  frameworkRef: string;
  admissionRunId: string;
};

export type WorkflowBlob = {
  path: string;
  git_blob_sha: string;
  sha256: string;
};

export type ActiveReleaseRun = {
  id: number;
  path: string;
  status: string;
  head_sha: string;
};

export type StableAdmissionFailureReceipt = {
  schema: 'opl_stable_release_admission_failure.v1';
  status: 'failed';
  checked_at: string;
  operation: 'standard';
  intent: {
    kind: 'new_product';
    product_change_summary: string;
    repair_or_publication_failure_allowed_to_allocate_version: false;
  };
  phase: 'collect_observation' | 'build_manifest';
  admission_run_id: string;
  cohort: {
    app_sha: string;
    shell_sha: string;
    framework_sha: string;
  };
  failure: {
    class: 'transport' | 'credential' | 'not_found' | 'protocol' | 'deterministic';
    code:
      | 'transport_timeout'
      | 'transport_error'
      | 'credential_failure'
      | 'not_found'
      | 'invalid_response'
      | 'admission_invariant_failed';
    message: string;
  };
  source_gate_digest: string | null;
  credential_receipt_digest: string | null;
  public_mutation_performed: false;
  old_authority_or_run_reusable: false;
  retry_disposition: 'repair_then_new_distinct_operation';
};

export type StableAdmissionObservation = {
  checkedAt: string;
  currentDate: string;
  workflowBlobs: WorkflowBlob[];
  sourceGate: JsonRecord;
  sourceGateBytes: Buffer;
  credentialReceipt: JsonRecord;
  credentialReceiptBytes: Buffer;
  publishedReleases: PublishedRelease[];
  tagRefs: string[];
  webuiTags: string[];
  homebrewCask: {
    repository: string;
    path: string;
    git_blob_sha: string;
    bytes: Buffer;
  };
  homebrewPolicy: JsonRecord;
  activeReleaseRuns: ActiveReleaseRun[];
};

export type StableAdmissionManifest = {
  schema: 'opl_stable_release_admission_manifest.v1';
  status: 'passed';
  checked_at: string;
  operation: 'standard';
  intent: {
    kind: 'new_product';
    product_change_summary: string;
    repair_or_publication_failure_allowed_to_allocate_version: false;
  };
  version: {
    base: string;
    display: string;
    updater: string;
    tag: string;
    current_date: string;
    revision: number;
  };
  cohort: {
    app_sha: string;
    shell_sha: string;
    framework_sha: string;
  };
  workflow_blobs: WorkflowBlob[];
  apple_credentials: {
    producer_run_id: string;
    producer_workflow: '.github/workflows/release-stable.yml';
    protected_environment: 'release-stable';
    executor_sha: string;
    receipt_sha256: string;
    required_secret_names: string[];
    required_secret_count: 6;
    signing_status: 'passed';
    notarization_authentication: 'passed';
    submission_performed: false;
  };
  source_gate: {
    producer_run_id: string;
    producer_workflow: '.github/workflows/release-stable.yml';
    artifact_name: string;
    source_gate_digest: string;
    source_gate_file_sha256: string;
    operation_fingerprint: string;
    owner_release_namespace_evidence_digest: string;
    owner_draft_reservation_count: number;
    frozen_cohort_reachable: true;
    full_source_gate_rerun: false;
    release_authority: false;
    namespace_reservation: false;
    final_signed_byte_authority: false;
  };
  allocator: {
    observed_namespace_versions: string[];
    observed_same_day_versions: string[];
    highest_published_stable: string;
    selected_version: string;
    selected_updater_version: string;
  };
  namespace: {
    github_release_tags: string[];
    owner_draft_release_tags: string[];
    github_tag_refs: string[];
    webui_tags: string[];
    homebrew_standard_cask_version: string;
    target_release_absent: true;
    target_tag_absent: true;
    target_webui_tag_replaceable: true;
    target_homebrew_version_absent: true;
  };
  homebrew_policy: {
    repository: string;
    cask_path: string;
    cask_git_blob_sha: string;
    cask_sha256: string;
    contract_sha256: string;
    standard_cask_install_ref: string;
    mutation_owner: string;
    write_mode: string;
  };
  active_release_runs: [];
  dispatcher_contract: {
    workflow: '.github/workflows/release-stable.yml';
    ref: 'main';
    artifact_name: string;
    accepted_inputs: ['operation', 'authority_id', 'operation_id', 'authority_carrier', 'authority_digest', 'desktop_additional_platforms'];
    raw_standard_version_or_ref_inputs_allowed: false;
    unknown_result_policy: 'read_only_reconcile_without_rerun_redispatch_or_cancel';
  };
  manifest_digest: string;
};
