import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppProductProfile } from './app-product-profile/types.ts';
import {
  validateGuiProductContractPolicyFields,
  validateValidationCommandShape,
} from './app-shell-adapter-contract-validators.ts';
import { assertRepositoryRelativePath } from './value-assertions.ts';

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

export const DEFAULT_RELEASE_SHELL_OWNED_SURFACE = 'upstream AionUI intake';

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

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultContractRef = 'contracts/app-shell-adapter.json';
const contractPath = path.join(appRoot, defaultContractRef);
const productProfilePath = path.join(appRoot, 'contracts/app-product-profile.json');

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertRelativePath(value: unknown, label: string): asserts value is string {
  assertRepositoryRelativePath(value, {
    empty: `Invalid active shell ${label}: expected non-empty relative path`,
    unsafe: `Invalid active shell ${label}: must be a repository-relative path`,
  });
}

function resolveRepoRelativePath(value: string, label: string): string {
  assertRelativePath(value, label);
  return path.join(appRoot, value);
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => typeof entry === 'string' && entry.trim())) {
    throw new Error(`Invalid active shell ${label}: expected non-empty string array`);
  }
}

function resolveAdapterContractPath(): string {
  const override = process.env.OPL_APP_SHELL_ADAPTER_CONTRACT?.trim();
  if (!override) {
    return contractPath;
  }
  if (!override.startsWith('contracts/') || !override.endsWith('.json')) {
    throw new Error('OPL_APP_SHELL_ADAPTER_CONTRACT must point at a repository-relative contracts/*.json file');
  }
  return resolveRepoRelativePath(override, 'OPL_APP_SHELL_ADAPTER_CONTRACT');
}

function isExplicitAdapterOverride(filePath: string): boolean {
  return path.resolve(filePath) !== path.resolve(contractPath);
}

export function resolveShellAdapterIdentity(contract: ShellAdapterContract): string {
  const identity = contract.active_shell ?? contract.candidate_shell ?? contract.adapter_id;
  if (typeof identity !== 'string' || !identity.trim()) {
    throw new Error('active shell adapter contract must declare active_shell or candidate_shell identity');
  }
  return identity;
}

function readClientRendererProductProfile(): Record<string, unknown> {
  return readJson(productProfilePath) as Record<string, unknown>;
}

export function resolveClientRendererAdmission(
  contract: ShellAdapterContract,
  productProfile: Record<string, unknown> = readClientRendererProductProfile(),
): ClientRendererAdmission | null {
  const declaration = contract.client_renderer_admission;
  const compatibility = productProfile.client_renderer_compatibility as ClientRendererCompatibilityProfile | undefined;
  const deliveryTopology = productProfile.delivery_topology as Record<string, unknown> | undefined;
  const minimumProduct = deliveryTopology?.minimum_complete_product as Record<string, unknown> | undefined;
  const composition = minimumProduct?.composition_model as Record<string, unknown> | undefined;
  const compatibilityKeys = [
    'allowlist_contract',
    'app_fixed_brand_registry_allowed',
    'brand_capability_projection_policy',
    'client_authority_policy',
    'client_fixed_brand_registry_allowed',
    'contribution_abi',
    'display_and_allowlist_owner',
    'host_composition_authority',
    'host_graph_source',
    'host_projection_schema',
    'hot_switch_without_revalidation_allowed',
    'owner',
    'schema',
    'standard_view_types',
    'state_semantics_contract',
    'switch_policy',
    'transport_binding_event',
    'transport_binding_migration_state',
    'transport_binding_schema',
    'transport_binding_source',
    'typed_action_rpc',
    'typed_client_event',
    'typed_slots',
    'typed_state_rpc',
  ];
  if (
    !compatibility ||
    JSON.stringify(Object.keys(compatibility).sort()) !== JSON.stringify(compatibilityKeys) ||
    compatibility.schema !== 'opl_app_client_renderer_compatibility.v1' ||
    compatibility.owner !== 'one-person-lab-app' ||
    compatibility.host_composition_authority !== 'one-person-lab-framework' ||
    compatibility.host_graph_source !== 'app_state.ui_contributions' ||
    compatibility.host_projection_schema !== 'opl_app_ui_contributions_projection.v1' ||
    compatibility.contribution_abi !== 'opl_app_client_contributions.v1' ||
    compatibility.allowlist_contract !== 'contracts/opl-app-contributions.schema.json' ||
    JSON.stringify(compatibility.typed_slots) !==
      JSON.stringify(['settings.section', 'runtime.detail', 'composer.palette']) ||
    JSON.stringify(compatibility.standard_view_types) !==
      JSON.stringify([
        'list_detail',
        'timeline',
        'approval_diff',
        'task_board',
        'artifact_view',
        'activity_log',
        'service_status',
        'channel_access',
        'remote_companion_access',
      ]) ||
    compatibility.transport_binding_source !== 'app_state.transport_bindings' ||
    compatibility.transport_binding_schema !== 'opl_app_transport_bindings_projection.v1' ||
    compatibility.transport_binding_migration_state !==
      'framework_transport_binding_projection_and_dual_shell_source_e2e_completed' ||
    compatibility.transport_binding_event !== 'opl/app-transport-bindings/updated' ||
    compatibility.typed_state_rpc !== 'opl app state --profile fast --json' ||
    compatibility.typed_action_rpc !==
      'opl app action execute --action <action_id> [--payload json] [--dry-run] --json' ||
    compatibility.typed_client_event !== 'opl/app-client-contributions/updated' ||
    compatibility.state_semantics_contract !== 'contracts/app-runtime-bridge.json' ||
    compatibility.client_authority_policy !==
      'render_and_dispatch_only_no_plugin_discovery_install_registry_currentness_release_operation_task_package_or_product_truth' ||
    compatibility.switch_policy !==
      'explicit_adapter_selection_after_compatibility_admission_never_unverified_hot_switch' ||
    compatibility.hot_switch_without_revalidation_allowed !== false ||
    compatibility.brand_capability_projection_policy !==
      'dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client' ||
    compatibility.app_fixed_brand_registry_allowed !== false ||
    compatibility.client_fixed_brand_registry_allowed !== false ||
    compatibility.display_and_allowlist_owner !== 'one-person-lab-app' ||
    composition?.client_authority_policy !== compatibility.client_authority_policy ||
    composition?.client_renderer_compatibility_profile !== 'client_renderer_compatibility' ||
    composition?.client_renderer_switch_policy !== compatibility.switch_policy ||
    composition?.brand_capability_projection_policy !== compatibility.brand_capability_projection_policy
  ) {
    throw new Error('App Client renderer compatibility profile is invalid');
  }

  const rendererId = resolveShellAdapterIdentity(contract);
  const candidate = contract.candidate_shell === 'opl-studio';
  const expectedRole = candidate ? 'foreground_alternative_candidate_renderer' : 'active_release_renderer';
  const expectedStatus = candidate
    ? 'candidate_validation_only_not_active_shell_admitted'
    : 'admitted_current_active_shell';
  if (
    !declaration ||
    JSON.stringify(Object.keys(declaration).sort()) !== JSON.stringify([
      'hot_switch_without_revalidation_allowed',
      'implementation_repo',
      'implementation_role',
      'profile_ref',
      'renderer_id',
      'status',
    ]) ||
    declaration.profile_ref !== 'contracts/app-product-profile.json#client_renderer_compatibility' ||
    declaration.renderer_id !== rendererId ||
    declaration.implementation_repo !== contract.shell_source.owner_repo ||
    declaration.implementation_role !== expectedRole ||
    declaration.status !== expectedStatus ||
    declaration.hot_switch_without_revalidation_allowed !== false
  ) {
    throw new Error(`Shell ${rendererId} is not compatible with the App Client renderer admission contract`);
  }

  return Object.freeze({
    schema: 'opl_app_client_renderer_admission.v1',
    rendererId,
    status: expectedStatus,
    selectionMode: candidate ? 'candidate_validation_only' : 'active_release_adapter',
    compatibility: Object.freeze(compatibility),
  });
}

export function readAppShellAdapterContract(filePath = resolveAdapterContractPath()): ShellAdapterContract {
  const contract = readJson(filePath) as ShellAdapterContract;
  assertAdapterContractIdentity(contract, { explicitOverride: isExplicitAdapterOverride(filePath) });
  resolveClientRendererAdmission(contract);
  validateCodexExecutableContract(contract);
  const shellIdentity = contract.active_shell ?? contract.candidate_shell ?? contract.adapter_id;
  if (shellIdentity === 'aionui' || shellIdentity === 'opl-studio') {
    validateChannelThreadBindingBoundary(contract.channel_thread_binding_boundary, shellIdentity);
  }
  assertAdapterGuiAuthority(contract);
  assertActiveShellSpecificPolicy(contract);
  assertShellReplacementPolicy(contract);
  assertShellContractPathsAndCapabilities(contract);
  validateGuiProductContractPolicyFields(contract);
  assertStateSurfaceContract(contract);
  assertValidationCommandPaths(contract);
  return contract;
}

export function validateChannelThreadBindingBoundary(
  boundary: ChannelThreadBindingBoundary | undefined,
  shellIdentity: string | undefined,
): void {
  const expectedKeys = [
    'binding_key_fields',
    'binding_key_normalization_or_inference_allowed',
    'binding_schema',
    'binding_value_fields',
    'implementation_status',
    'mismatch_policy',
    'persistence_role',
    'restart_recovery_transport',
    'second_session_truth_allowed',
    'shell_thread_id_inference_allowed',
    'source_ref',
    'thread_turn_authority',
    'unknown_binding_policy',
  ];
  const expectedImplementationStatus = shellIdentity === 'aionui'
    ? 'framework_projection_consumer_without_cached_conversation_binding_source_e2e_completed'
    : shellIdentity === 'opl-studio'
      ? 'framework_projection_consumer_and_exact_binding_source_e2e_completed'
      : null;
  if (
    !boundary
    || !expectedImplementationStatus
    || JSON.stringify(Object.keys(boundary).sort()) !== JSON.stringify(expectedKeys)
    || boundary.source_ref !==
      'contracts/app-runtime-bridge.json#canonical_conversation_continuity_policy.transport_binding_projection'
    || boundary.binding_schema !== 'opl_app_transport_bindings_projection.v1'
    || JSON.stringify(boundary.binding_key_fields) !==
      JSON.stringify(['provider_id', 'account_id', 'channel_session_id'])
    || JSON.stringify(boundary.binding_value_fields) !==
      JSON.stringify(['canonical_thread_host', 'canonical_thread_id'])
    || boundary.thread_turn_authority !== 'codex_core_app_server'
    || boundary.persistence_role !==
      'exact_binding_adapter_state_only_not_thread_history_turn_state_or_session_truth'
    || boundary.restart_recovery_transport !==
      'exact_binding_lookup_then_thread_read_then_thread_resume_same_threadId'
    || boundary.unknown_binding_policy !==
      'fail_closed_without_thread_start_or_thread_id_inference_during_recovery'
    || boundary.mismatch_policy !==
      'fail_closed_without_rebind_merge_overwrite_or_turn_start'
    || boundary.binding_key_normalization_or_inference_allowed !== false
    || boundary.shell_thread_id_inference_allowed !== false
    || boundary.second_session_truth_allowed !== false
    || boundary.implementation_status !== expectedImplementationStatus
  ) {
    throw new Error(
      'shell channel thread binding must recover only an exact provider/account/session binding through the canonical Codex App Server',
    );
  }
}

export function validateCodexExecutableContract(contract: ShellAdapterContract): void {
  const executable = contract.codex_executable_contract;
  if (!executable) {
    if (contract.active_shell !== 'aionui' && contract.candidate_shell !== 'opl-studio') {
      return;
    }
    throw new Error('shell adapter must declare codex_executable_contract');
  }
  if (executable.resolver_env !== 'OPL_CODEX_BIN') {
    throw new Error('shell Codex executable resolver must remain OPL_CODEX_BIN');
  }
  if (executable.protocol !== 'codex_app_server_stdio') {
    throw new Error('shell Codex protocol must remain codex_app_server_stdio');
  }
  if (executable.thread_store_owner !== 'codex_core_app_server') {
    throw new Error('shell Codex thread store authority must remain codex_core_app_server');
  }
  if (executable.codex_home_policy !== 'preserve_existing_env_else_codex_system_default') {
    throw new Error('shell Codex home policy must preserve existing env or use the Codex system default');
  }
  if (executable.carrier_scope !== 'shell_adapter_only') {
    throw new Error('shell Codex carrier knowledge must remain scoped to the shell adapter');
  }
  if (executable.carrier.framework_managed_payload_in_app_bundle_allowed !== false) {
    throw new Error('App bundles must not embed the Framework-managed Codex payload');
  }
  if (executable.framework_headless_carrier_policy !== 'preserved_outside_app_bundle') {
    throw new Error('Framework headless Codex carrier policy must remain outside the App bundle');
  }

  if (contract.active_shell === 'aionui') {
    const target = executable.carrier.target_packaging_policy;
    if (
      executable.carrier.kind !== 'aioncore_managed_resources_manifest' ||
      executable.carrier.source_ref !==
        'manual_qualification_contract.runtime_dependencies.aioncore.resource_authority' ||
      executable.carrier.manifest_parser_owner !== 'gaofeng21cn/opl-aion-shell' ||
      executable.carrier.aioncore_required !== true
    ) {
      throw new Error('active AionUI must resolve its Codex executable only from the bundled AionCore manifest');
    }
    if (
      target?.schema !== 'opl_aioncore_codex_only_packaging_policy.v1' ||
      target?.implementation_status !== 'verified_shell_composition_and_packaged_smoke' ||
      target?.aioncore_modification_policy !== 'consume_upstream_release_without_fork_or_patch' ||
      target?.producer_export?.owner !== 'AionCore' ||
      target?.producer_export?.role !== 'build_intermediate_node_only' ||
      target?.producer_export?.schema_version !== 2 ||
      JSON.stringify(target?.producer_export?.required_cli_names) !== JSON.stringify([]) ||
      target?.producer_export?.distributed_manifest_allowed !== false ||
      target?.codex_carrier?.owner !== 'gaofeng21cn/opl-aion-shell' ||
      target?.codex_carrier?.package !== '@openai/codex' ||
      target?.codex_carrier?.version_and_digest_source !==
        'contracts/aionui-upstream-intake.json#managed_runtime.codex_cli' ||
      target?.codex_carrier?.authority !== 'official_npm_platform_package' ||
      target?.codex_carrier?.aioncore_compatibility_source !==
        'contracts/aionui-upstream-intake.json#managed_runtime.codex_cli.verified_by_aioncore' ||
      target?.packaged_projection?.owner !== 'gaofeng21cn/opl-aion-shell' ||
      target?.packaged_projection?.schema !== 'opl_aioncore_managed_resources_projection.v1' ||
      target?.packaged_projection?.authority_path !==
        'bundled-aioncore/<platform>-<arch>/managed-resources/manifest.json' ||
      JSON.stringify(target?.packaged_projection?.included_cli_names) !== JSON.stringify(['codex']) ||
      JSON.stringify(target?.packaged_projection?.excluded_cli_names) !== JSON.stringify(['claude']) ||
      target?.packaged_projection?.version_and_digest_source !==
        'aioncore_node_export_plus_opl_selected_official_codex_package' ||
      JSON.stringify(target?.distributed_bundle?.applies_to) !== JSON.stringify(['standard', 'full']) ||
      JSON.stringify(target?.distributed_bundle?.required_runtime_components) !==
        JSON.stringify(['aioncore', 'node_runtime', 'codex_cli']) ||
      JSON.stringify(target?.distributed_bundle?.required_metadata) !==
        JSON.stringify(['projection_manifest', 'producer_manifest_digest_provenance', 'codex_source_identity']) ||
      JSON.stringify(target?.distributed_bundle?.cli_names_exact) !== JSON.stringify(['codex']) ||
      JSON.stringify(target?.distributed_bundle?.required_absence_checks) !== JSON.stringify([
        {
          id: 'managed_claude_subtree',
          scope: 'distributed_bundle_root',
          matcher: 'path_glob',
          patterns: [
            'bundled-aioncore/<platform>-<arch>/managed-resources/cli/claude',
            'bundled-aioncore/<platform>-<arch>/managed-resources/cli/claude/**',
          ],
          expected_match_count: 0,
        },
        {
          id: 'claude_executable_or_symlink',
          scope: 'distributed_bundle_root',
          matcher: 'executable_or_symlink_basename',
          patterns: ['claude', 'claude.exe'],
          expected_match_count: 0,
        },
        {
          id: 'anthropic_package_or_archive',
          scope: 'distributed_bundle_root',
          matcher: 'path_glob',
          patterns: [
            '**/node_modules/@anthropic-ai/claude-code/**',
            '**/claude-code*.tgz',
            '**/claude-code*.tar.gz',
          ],
          expected_match_count: 0,
        },
        {
          id: 'claude_distribution_cache_entry',
          scope: 'distributed_bundle_root',
          matcher: 'path_glob',
          patterns: ['**/.cache/**/claude*', '**/cache/**/claude*'],
          expected_match_count: 0,
        },
        {
          id: 'raw_producer_manifest',
          scope: 'distributed_bundle_root',
          matcher: 'root_manifest_schema_version_equals',
          patterns: ['**/managed-resources/manifest.json'],
          values: ['2'],
          expected_match_count: 0,
        },
      ]) ||
      target?.opl_selected_official_codex_carrier_required !== true ||
      target?.second_codex_carrier_or_registry_allowed !== false
    ) {
      throw new Error(
        'active AionUI must compose the official AionCore Node export with one OPL-selected official Codex carrier without modifying AionCore or adding a second carrier or registry',
      );
    }
    return;
  }

  if (contract.candidate_shell === 'opl-studio') {
    if (
      executable.carrier.kind !== 'candidate_owned_or_exact_external_binary' ||
      executable.carrier.source_ref !== null ||
      executable.carrier.manifest_parser_owner !== null ||
      executable.carrier.aioncore_required !== false
    ) {
      throw new Error('OPL Studio Codex carrier must remain independent from AionCore');
    }
  }
}

function assertAdapterContractIdentity(contract: ShellAdapterContract, options: { explicitOverride: boolean }): void {
  if (contract.owner !== 'one-person-lab-app') {
    throw new Error(`Unexpected active shell owner: ${contract.owner}`);
  }
  if (contract.purpose !== 'active_shell_adapter') {
    throw new Error(`Unexpected active shell purpose: ${contract.purpose}`);
  }
  if (contract.state !== 'active') {
    throw new Error(`Unexpected active shell state: ${contract.state}`);
  }
  if (contract.app_repo !== 'gaofeng21cn/one-person-lab-app') {
    throw new Error(`Unexpected active shell app_repo: ${contract.app_repo}`);
  }
  const adapterIdentity = resolveShellAdapterIdentity(contract);
  if (!options.explicitOverride) {
    if (contract.active_shell !== 'aionui' || adapterIdentity !== 'aionui') {
      throw new Error(`Default active shell adapter must remain aionui: ${adapterIdentity}`);
    }
    if (contract.candidate_shell || contract.adapter_id || contract.adapter_role) {
      throw new Error('Default active shell adapter must not declare foreground candidate identity');
    }
  } else if (contract.candidate_shell) {
    if (contract.active_shell !== undefined) {
      throw new Error(`${contract.candidate_shell} foreground candidate adapter must not declare active_shell`);
    }
    if (contract.adapter_id !== contract.candidate_shell || contract.adapter_role !== 'foreground_alternative_candidate_adapter') {
      throw new Error(`${contract.candidate_shell} foreground candidate adapter identity is inconsistent`);
    }
  }
  if (contract.shell_source?.history_policy !== 'external_checkout_not_merged_into_app_default_branch') {
    throw new Error(`Unexpected shell history policy: ${contract.shell_source?.history_policy}`);
  }
}

function assertAdapterGuiAuthority(contract: ShellAdapterContract): void {
  if (contract.gui_authority?.source_of_truth !== 'one-person-lab-app') {
    throw new Error('active shell GUI authority must stay in one-person-lab-app');
  }
  const expectedImplementationRole = contract.candidate_shell && contract.adapter_role === 'foreground_alternative_candidate_adapter'
      ? 'foreground_alternative_candidate_implementation_carrier'
      : 'active_shell_implementation_carrier';
  if (contract.gui_authority.implementation_role !== expectedImplementationRole) {
    throw new Error(`active shell GUI implementation role must be ${expectedImplementationRole}`);
  }
  assertStringArray(contract.gui_authority.product_contracts, 'gui_authority.product_contracts');
  assertStringArray(contract.gui_authority.shell_may_own, 'gui_authority.shell_may_own');
  assertStringArray(contract.gui_authority.shell_must_not_own, 'gui_authority.shell_must_not_own');
  if (contract.gui_authority.upstream_intake_policy !== 'check_against_app_owned_gui_contracts_before_acceptance') {
    throw new Error(`Unexpected GUI upstream intake policy: ${contract.gui_authority.upstream_intake_policy}`);
  }
}

function assertActiveShellSpecificPolicy(contract: ShellAdapterContract): void {
  if (contract.active_shell === 'aionui') {
    if (
      contract.upstream_intake?.classification_policy !==
      'classify_every_required_capability_and_dependency_before_app_release'
    ) {
      throw new Error('active shell upstream intake must classify required capabilities and dependencies before release');
    }
    if (!contract.upstream_intake.capability_classifications?.some((entry) => (
      entry.id === 'aionui_team' &&
      entry.classification === 'rejected' &&
      entry.ordinary_surface === 'forbidden'
    ))) {
      throw new Error('active shell upstream intake must reject AionUI Team for ordinary surfaces');
    }
    if (contract.implementation_probes?.aionui_team_disabled_surface?.policy !== 'fail_closed_required_for_active_shell_upgrade') {
      throw new Error('active shell must declare fail-closed AionUI Team implementation probes');
    }
    if (contract.disabled_feature_policy?.aionui_team?.agent_switching_policy !== 'must_not_inherit_team_mcp') {
      throw new Error('active shell disabled Team policy must prevent Team MCP inheritance during agent switching');
    }
  }
}

function assertShellReplacementPolicy(contract: ShellAdapterContract): void {
  if (contract.shell_replacement_policy?.candidate_root_pattern !== 'shells/<candidate>') {
    throw new Error('active shell replacement policy must keep candidates under shells/<candidate>');
  }
  const allowedCandidateStates = contract.candidate_shell && contract.adapter_role === 'foreground_alternative_candidate_adapter'
      ? ['active_product_development_pre_adoption']
      : ['candidate_until_contracts_and_tests_complete'];
  if (!allowedCandidateStates.includes(contract.shell_replacement_policy.candidate_state)) {
    throw new Error(`Unexpected shell candidate state: ${contract.shell_replacement_policy.candidate_state}`);
  }
  if (contract.shell_replacement_policy.authority_transfer_allowed !== false) {
    throw new Error('active shell replacement must not transfer App GUI authority');
  }
  assertStringArray(contract.shell_replacement_policy.adoption_gate, 'shell_replacement_policy.adoption_gate');
  assertShellReplacementAdoptionGates(
    contract.release_role,
    contract.shell_replacement_policy.adoption_gate,
    (gate) => `active shell replacement policy missing gate ${gate}`,
    'active shell replacement policy must not declare candidates inside contracts/app-shell-adapter.json',
  );
}

function assertShellContractPathsAndCapabilities(contract: ShellAdapterContract): void {
  assertRelativePath(contract.shell_root, 'shell_root');
  assertRelativePath(contract.runtime_bridge_contract, 'runtime_bridge_contract');
  assertRelativePath(contract.shell_source?.checkout_path, 'shell_source.checkout_path');
  if (contract.shell_source.checkout_path !== contract.shell_root) {
    throw new Error('shell_source.checkout_path must match shell_root');
  }

  const paths = contract.shell_contract?.paths;
  if (!paths) {
    throw new Error('active shell contract must declare shell_contract.paths');
  }
  for (const [label, value] of Object.entries(paths)) {
    assertRelativePath(value, `shell_contract.paths.${label}`);
  }
  assertStringArray(contract.shell_contract.capabilities, 'shell_contract.capabilities');
  if (contract.release_role === 'experimental_candidate_shell') {
    if (!contract.shell_contract.capabilities.includes('candidate_app_bundle_package')) {
      throw new Error('candidate shell capabilities must include candidate_app_bundle_package');
    }
    if (!contract.shell_contract.capabilities.includes('app_owned_gui_product_contract')) {
      throw new Error('candidate shell capabilities must keep app_owned_gui_product_contract boundary');
    }
    if (!contract.shell_contract.capabilities.includes('app_owned_runtime_bridge_contract')) {
      throw new Error('candidate shell capabilities must keep app_owned_runtime_bridge_contract boundary');
    }
    return;
  }
  if (!contract.shell_contract.capabilities.includes('app_product_profile_generated_config')) {
    throw new Error('active shell capabilities must include app_product_profile_generated_config');
  }
  if (!contract.shell_contract.capabilities.includes('opl_packaged_runtime_extra_resource')) {
    throw new Error('active shell capabilities must include opl_packaged_runtime_extra_resource');
  }
  for (const capability of [
    'app_owned_gui_product_contract',
    'app_owned_runtime_bridge_contract',
    'opl_app_state_bridge',
    'opl_app_action_bridge',
    'app_gui_release_channel_gating',
  ]) {
    if (!contract.shell_contract.capabilities.includes(capability)) {
      throw new Error(`active shell capabilities must include ${capability}`);
    }
  }
}

function assertStateSurfaceContract(contract: ShellAdapterContract): void {
  const stateSurface = contract.state_surface_contract;
  if (stateSurface?.primary_read_command !== STATE_SURFACE_CONTRACT_EXPECTATIONS.primary_read_command) {
    throw new Error(`Unexpected active shell primary state read command: ${stateSurface?.primary_read_command}`);
  }
  if (stateSurface.refresh_read_command !== STATE_SURFACE_CONTRACT_EXPECTATIONS.refresh_read_command) {
    throw new Error(`Unexpected active shell refresh state read command: ${stateSurface.refresh_read_command}`);
  }
  if (stateSurface.full_state_read_command !== STATE_SURFACE_CONTRACT_EXPECTATIONS.full_state_read_command) {
    throw new Error(`Unexpected active shell full state read command: ${stateSurface.full_state_read_command}`);
  }
  if (stateSurface.full_state_policy !== STATE_SURFACE_CONTRACT_EXPECTATIONS.full_state_policy) {
    throw new Error(`Unexpected active shell full state policy: ${stateSurface.full_state_policy}`);
  }
  if (stateSurface.action_command !== STATE_SURFACE_CONTRACT_EXPECTATIONS.action_command) {
    throw new Error(`Unexpected active shell action command: ${stateSurface.action_command}`);
  }
  if (stateSurface.full_drilldown_exception !== STATE_SURFACE_CONTRACT_EXPECTATIONS.full_drilldown_exception) {
    throw new Error(`Unexpected active shell full drilldown exception: ${stateSurface.full_drilldown_exception}`);
  }
  assertStringArray(stateSurface.forbidden_gui_truth_sources, 'state_surface_contract.forbidden_gui_truth_sources');
}

function assertValidationCommandPaths(contract: ShellAdapterContract): void {
  for (const entry of validateValidationCommandShape(contract)) {
    assertRelativePath(entry.cwd, `validation_commands.${entry.id}.cwd`);
  }
}

function resolveActiveShellRoot(contract = readAppShellAdapterContract()): string {
  const override = process.env.OPL_APP_SHELL_ROOT?.trim();
  return override ? path.resolve(appRoot, override) : path.join(appRoot, contract.shell_root);
}

export function resolveActiveShellPaths(options: { shellRoot?: string; contract?: ShellAdapterContract } = {}): ActiveShellPaths {
  const contract = options.contract ?? readAppShellAdapterContract();
  const clientRendererAdmission = resolveClientRendererAdmission(contract);
  const shellRoot = options.shellRoot ? path.resolve(options.shellRoot) : resolveActiveShellRoot(contract);
  const paths = contract.shell_contract.paths;
  const shellRootEnv = process.env.OPL_APP_SHELL_ROOT?.trim();
  return {
    contract,
    clientRendererAdmission,
    shellRoot,
    shellRootForDisplay: options.shellRoot ?? (shellRootEnv || contract.shell_root),
    packageManifestPath: path.join(shellRoot, paths.package_manifest),
    agentsGuidePath: path.join(shellRoot, paths.agents_guide),
    vitestConfigPath: path.join(shellRoot, paths.vitest_config),
    electronBuilderConfigPath: path.join(shellRoot, paths.electron_builder_config),
    desktopReleaseCarrierManifestPath: paths.desktop_release_carrier_manifest
      ? path.join(shellRoot, paths.desktop_release_carrier_manifest)
      : null,
    buildOutputDir: path.join(shellRoot, paths.build_output_dir),
    productProfileTargetPath: path.join(shellRoot, paths.product_profile_target),
    packagedRuntimeRoot: path.join(shellRoot, paths.packaged_runtime_root),
    packagedRuntimeValidatorPath: path.join(shellRoot, paths.packaged_runtime_validator),
    releasePrepareScriptPath: path.join(shellRoot, paths.release_prepare_script),
    releaseVerifyScriptPath: path.join(shellRoot, paths.release_verify_script),
  };
}
