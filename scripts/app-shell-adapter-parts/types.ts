import type { AppProductProfile } from '../app-product-profile/types.ts';

export type ShellPathContract = {
  package_manifest: string;
  agents_guide: string;
  vitest_config: string;
  electron_builder_config: string;
  desktop_release_carrier_manifest?: string;
  build_output_dir: string;
  standard_bootstrap_resource_root?: string;
  standard_bootstrap_installer?: string;
  standard_bootstrap_manifest?: string;
  product_profile_target: string;
  packaged_runtime_root: string;
  packaged_runtime_validator: string;
  release_prepare_script: string;
  release_verify_script: string;
};

export type ValidationCommand = {
  id: string;
  cwd: string;
  command: string;
  optional?: boolean;
};

export type FirstRunContract = {
  owner: string;
  ui_reuse_policy: string;
  forbidden_default_action: string;
  startup_model: string;
  startup_check_sequence: string[];
  one_time_initialization_trigger: string[];
  one_time_initialization_sequence: string[];
  model_access_wizard: {
    trigger: string;
    api_key_provider: string;
    api_key_command: string;
    provider_base_url: string;
    default_model: string;
    api_key_env: string;
    ordinary_ui_policy: string;
  };
  background_refresh_sequence: string[];
  blocking_policy: string;
  skip_to_chat_policy?: {
    trigger: string;
    marker_state: string;
    must_not_claim: string[];
  };
  api_key_missing_behavior: string;
  api_key_present_behavior: string;
  ready_check: string;
  packaged_smoke_must_prove: string[];
};

export type IconContract = {
  source: string;
  macos_safe_margin_required: boolean;
  max_alpha_bounds_px: number;
  current_expected_alpha_bounds_px: string;
  applies_to: string[];
};

export const REQUIRED_GUI_AUTHORITY_PRODUCT_CONTRACTS = [
  'contracts/app-gui-product-contract.json',
  'contracts/app-remote-companion.json',
  'contracts/app-runtime-bridge.json',
  'contracts/app-product-profile.json',
  'contracts/app-install-exposure-policy.json',
  'contracts/app-page-state-matrix.json',
  'contracts/app-first-run-test-matrix.json',
  'contracts/app-release-channel.json',
] as const;

export const REQUIRED_BASE_SHELL_OWNED_SURFACES = [
  'concrete renderer implementation',
  'process and preload implementation',
  'shell package metadata',
  'shell tests and release hooks',
] as const;

export const DEFAULT_RELEASE_SHELL_OWNED_SURFACE = 'OPL Studio implementation';

export const FORBIDDEN_SHELL_OWNED_SURFACES = [
  'App GUI product truth',
  'App user-facing page-state authority',
  'App model-selection policy',
  'App onboarding policy',
  'App release/user documentation authority',
  'OPL runtime truth',
  'domain truth',
  'provider implementation',
] as const;

const CANDIDATE_ADOPTION_GATES = [
  'declare candidate in contracts/app-shell-candidates.json',
  'implement contracts/app-gui-product-contract.json',
  'sync App product profile into the candidate shell target',
  'pass App page-state and first-run matrices',
  'pass App-root active shell validation',
  'pass GUI package compile through App wrapper',
  'preserve external checkout history policy',
] as const;

export function assertShellReplacementAdoptionGates(
  releaseRole: string,
  adoptionGate: readonly string[] | undefined,
  missingGateMessage: (gate: string) => string,
  forbiddenAdapterCandidateMessage = 'Shell replacement policy must not declare candidates inside contracts/app-shell-adapter.json',
): void {
  for (const gate of CANDIDATE_ADOPTION_GATES) {
    if (!adoptionGate?.includes(gate)) {
      throw new Error(missingGateMessage(gate));
    }
  }
  if (adoptionGate?.includes('declare candidate in contracts/app-shell-adapter.json')) {
    throw new Error(forbiddenAdapterCandidateMessage);
  }
}

export const STATE_SURFACE_CONTRACT_EXPECTATIONS = {
  primary_read_command: 'opl app state --profile fast --json',
  refresh_read_command: 'opl app state --profile fast --json',
  full_state_read_command: 'opl app state --profile full --json',
  full_state_policy: 'diagnostic_or_release_evidence_only',
  action_command: 'opl app action execute --action <action_id> [--payload json] [--dry-run] --json',
  full_drilldown_exception: 'opl runtime app-operator-drilldown --detail full --json',
} as const;

export const FORBIDDEN_GUI_TRUTH_SOURCES = [
  'direct opl connect modules --json page aggregation',
  'direct opl system developer-supervisor page aggregation',
  'direct opl family-runtime worker status page aggregation',
  'application.systemInfo as OPL path truth',
  'application.appVersions as OPL release truth',
  'direct reads of OPL internal state files',
] as const;

type UpstreamIntakeRecord = {
  id: string;
  upstream_surface: string;
  classification: string;
  ordinary_surface?: string;
  owner_ref: string;
  release_gate: string;
  remediation_ref?: string;
  dependencies: string[];
  evidence: string[];
};

type UpstreamIntakeDependencyRecord = UpstreamIntakeRecord & {
  version_gate?: {
    field_ref: string;
    minimum_version: string;
    evaluated_upstream_version: string;
    selected_version_source: string;
    state: string;
  };
  capability_gate?: {
    required_boundary_code: string;
    accepted_failure_boundaries: Array<{
      stage: string;
      required_corruption_markers_any_of: string[];
    }>;
    recovery_success_boundary: {
      code: string;
      stage: string;
    };
    state: string;
    required_evidence: string;
    evidence: string[];
  };
};

export type ClientRendererAdmissionDeclaration = {
  profile_ref: 'contracts/app-product-profile.json#client_renderer_compatibility';
  renderer_id: string;
  implementation_repo: string;
  implementation_role: 'active_release_renderer' | 'foreground_alternative_candidate_renderer';
  status: 'admitted_current_active_shell' | 'candidate_validation_only_not_active_shell_admitted';
  hot_switch_without_revalidation_allowed: false;
};

export type ClientRendererCompatibilityProfile = AppProductProfile['client_renderer_compatibility'];

export type ClientRendererAdmission = {
  schema: 'opl_app_client_renderer_admission.v1';
  rendererId: string;
  status: ClientRendererAdmissionDeclaration['status'];
  selectionMode: 'active_release_adapter' | 'candidate_validation_only';
  compatibility: ClientRendererCompatibilityProfile;
};

export type ChannelThreadBindingBoundary = {
  source_ref: string;
  binding_schema: string;
  binding_key_fields: string[];
  binding_value_fields: string[];
  thread_turn_authority: string;
  persistence_role: string;
  restart_recovery_transport: string;
  unknown_binding_policy: string;
  mismatch_policy: string;
  binding_key_normalization_or_inference_allowed: boolean;
  shell_thread_id_inference_allowed: boolean;
  second_session_truth_allowed: boolean;
  implementation_status: string;
};

export type ShellAdapterContract = {
  schema_version: number;
  owner: string;
  purpose: string;
  state: string;
  app_repo: string;
  active_shell?: string;
  adapter_id?: string;
  candidate_shell?: string;
  adapter_role?: string;
  shell_root: string;
  runtime_bridge_contract: string;
  codex_executable_contract?: {
    resolver_env: string;
    protocol: string;
    thread_store_owner: string;
    codex_home_policy: string;
    carrier_scope: string;
    carrier: {
      kind: string;
      source_ref: string | null;
      manifest_parser_owner: string | null;
      aioncore_required: boolean;
      framework_managed_payload_in_app_bundle_allowed: boolean;
      target_packaging_policy?: {
        schema: string;
        implementation_status: string;
        aioncore_modification_policy: string;
        producer_export: {
          owner: string;
          role: string;
          schema_version: number;
          required_cli_names: string[];
          distributed_manifest_allowed: boolean;
        };
        codex_carrier: {
          owner: string;
          package: string;
          version_and_digest_source: string;
          authority: string;
          aioncore_compatibility_source: string;
        };
        packaged_projection: {
          owner: string;
          schema: string;
          authority_path: string;
          included_cli_names: string[];
          excluded_cli_names: string[];
          version_and_digest_source: string;
        };
        distributed_bundle: {
          applies_to: string[];
          required_runtime_components: string[];
          required_metadata: string[];
          cli_names_exact: string[];
          required_absence_checks: Array<{
            id: string;
            scope: string;
            matcher: string;
            patterns: string[];
            values?: string[];
            expected_match_count: number;
          }>;
        };
        opl_selected_official_codex_carrier_required: boolean;
        second_codex_carrier_or_registry_allowed: boolean;
      };
    };
    framework_headless_carrier_policy: string;
    full_offline_seed_contract_ref?: string;
  };
  qualification_external_carrier?: {
    schema: 'opl_studio_external_codex_qualification_input.v1';
    owner: 'one-person-lab-app';
    scope: 'opl-studio-preview-clean-vm-only';
    package: {
      name: '@openai/codex';
      version: string;
      npm_integrity: string;
      tarball_url: string;
      tarball_sha256: string;
    };
    platform: {
      name: '@openai/codex';
      version: string;
      npm_integrity: string;
      tarball_url: string;
      tarball_sha256: string;
      binary_path: string;
      os: 'darwin';
      cpu: 'arm64';
    };
    injection: {
      resolver_env: 'OPL_CODEX_BIN';
      bundle_included: false;
      guest_preparation: string;
      app_bundle_codex_forbidden: true;
    };
  };
  upstream_family: string;
  release_role: string;
  candidate_stage?: string;
  channel_thread_binding_boundary?: ChannelThreadBindingBoundary;
  shell_source: {
    owner_repo: string;
    default_ref: string;
    checkout_path: string;
    history_policy: string;
    upstream_ref?: string;
    upstream_ref_role?: string;
    current_head_source?: string;
    current_head_must_contain_upstream_ref?: boolean;
  };
  gui_authority: {
    source_of_truth: string;
    implementation_role: string;
    product_contracts: string[];
    shell_may_own: string[];
    shell_must_not_own: string[];
    upstream_intake_policy: string;
  };
  client_renderer_admission?: ClientRendererAdmissionDeclaration;
  upstream_intake?: {
    schema_version: number;
    classification_policy: string;
    stable_currentness_receipt: {
      path: string;
      schema: string;
      channel: string;
      read_policy: string;
      implementation_ancestry_policy: string;
      managed_runtime_bindings: Record<string, string>;
      required_policy: Record<string, string>;
    };
    source_refs: {
      fork_base: { ref: string; role: string };
      evaluated_upstream: { release: string; ref: string; role: string };
      selective_absorption_head: { ref: string; role: string };
    };
    allowed_classifications: string[];
    required_capability_ids: string[];
    required_dependency_ids: string[];
    required_record_fields: string[];
    capability_classifications: UpstreamIntakeRecord[];
    dependency_classifications: UpstreamIntakeDependencyRecord[];
  };
  implementation_probes?: Record<string, {
    source: string;
    policy: string;
    probes: Array<{
      id: string;
      source_ref: string;
      required: boolean;
      required_evidence: string[];
    }>;
  }>;
  disabled_feature_policy?: Record<string, Record<string, string>>;
  shell_replacement_policy: {
    candidate_root_pattern: string;
    candidate_state: string;
    authority_transfer_allowed: boolean;
    adoption_gate: string[];
  };
  shell_contract: {
    layout_id: string;
    source_topology: string;
    implementation_validation?: string;
    paths: ShellPathContract;
    capabilities: string[];
  };
  first_run_contract?: FirstRunContract;
  icon_contract?: IconContract;
  gui_product_contract: string;
  gui_product_contract_policy: {
    must_implement: boolean;
    source_of_truth: string;
    upstream_override_allowed: boolean;
    upstream_family_role: string;
    upstream_must_not_override_app_truth?: boolean;
    aionui_upstream_must_not_override_app_truth?: boolean;
  };
  state_surface_contract: {
    primary_read_command: string;
    refresh_read_command: string;
    full_state_read_command: string;
    full_state_policy: string;
    action_command: string;
    full_drilldown_exception: string;
    forbidden_gui_truth_sources: string[];
  };
  deferred_until_feature_comparison?: {
    policy: string;
    surfaces: string[];
  };
  validation_commands: ValidationCommand[];
  manual_verification_commands?: Array<ValidationCommand & { policy?: string }>;
};

export type ActiveShellPaths = {
  contract: ShellAdapterContract;
  clientRendererAdmission: ClientRendererAdmission | null;
  shellRoot: string;
  shellRootForDisplay: string;
  packageManifestPath: string;
  agentsGuidePath: string;
  vitestConfigPath: string;
  electronBuilderConfigPath: string;
  desktopReleaseCarrierManifestPath: string | null;
  buildOutputDir: string;
  productProfileTargetPath: string;
  packagedRuntimeRoot: string;
  packagedRuntimeValidatorPath: string;
  releasePrepareScriptPath: string;
  releaseVerifyScriptPath: string;
};
