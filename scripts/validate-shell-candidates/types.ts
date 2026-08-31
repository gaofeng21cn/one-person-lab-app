import type {
  FirstRunContract,
  IconContract,
  ValidationCommand,
} from '../app-shell-adapter.ts';

export type { ValidationCommand };

export type ActiveProjectLineStateModel = {
  authority: string;
  validation_command: string;
  consumed_projection: string;
  required_fields: string[];
  forbidden_claims: string[];
};

export type NativeThreadAdapterBoundary = {
  source_ref: string;
  adapter: string;
  protocol_owner: string;
  thread_store_owner: string;
  user_initiated_only: boolean;
  supported_protocols: string[];
  codex_subagent_projection: {
    mode: string;
    thread_source_kinds: string[];
    thread_item_types: string[];
    metadata_fields: string[];
  };
  private_coordination_layer_allowed: boolean;
};

export type NativeP1BaselineBridge = {
  contract_ref: string;
  agent_launch_transport: string;
  active_turn_transport: string;
  gateway_projection_ref: string;
  gateway_secret_bridge_ref: string;
  package_action_source: string;
  managed_update_ref: string;
  app_updater_ref: string;
  required_host_capabilities: string[];
  shell_owned_action_bus_allowed: boolean;
  shell_owned_package_registry_allowed: boolean;
  shell_owned_persistent_queue_allowed: boolean;
};

export type OPLStudioCarrierId =
  | 'electron_desktop'
  | 'standalone_headless_webui'
  | 'docker_webui';

export type OPLStudioCarrierEvidenceExpectation = {
  source_refs: string[];
  package_artifact_kind: string;
  qualification_commands: string[];
  user_service_manager_source: {
    status: 'implemented' | 'not_applicable';
    platforms: Array<'macos' | 'linux' | 'windows'>;
  };
  distribution_wiring_status: 'not_wired';
  update_adapter_source: {
    status: 'implemented';
    ref: string;
  };
  update_wiring_status: 'not_wired';
  release: {
    signed: 'not_proven' | 'not_applicable';
    notarized: 'not_proven' | 'not_applicable';
    public_feed: 'not_published';
    release_admission: 'not_admitted';
  };
  multi_arch_qualification?: 'plan_only_not_qualified';
  signature_verification?: 'not_implemented';
};

export type OPLStudioCarrierEvidenceContract = {
  schema: 'opl_studio_carrier_evidence.v1';
  manifest_path: 'out/opl-studio-carrier-evidence-manifest.json';
  candidate_only: true;
  release_authority: false;
  product_profile_owner: 'one-person-lab-app';
  shared_renderer: 'deepseek_harness_derived_react';
  shared_host_core: 'scripts/webui-host/host-core.mjs';
  bridge_abi: 'opl_app_host_bridge.v1';
  required_entries: OPLStudioCarrierId[];
  current_aionui_release_evidence_may_close_successor_entry: false;
  preview_oci_admission: {
    schema: 'opl_studio_cloud_workspace_image_handoff.v1';
    schema_ref: 'contracts/opl-studio-cloud-workspace-image-handoff.schema.json';
    validator: 'scripts/validate-studio-cloud-handoff.ts';
    repository: 'ghcr.io/gaofeng21cn/opl-studio-webui';
    workflow_identity: string;
    oidc_issuer: 'https://token.actions.githubusercontent.com';
    required_platforms: Array<'linux/amd64' | 'linux/arm64'>;
    immutable_tags: ['v<studio_version>', 'sha-<studio_sha>'];
    channel_tag: 'preview';
    forbidden_tags: ['stable'];
    cloud_activation_owner: 'opl-cloud';
    active_shell_adopted: false;
    release_ready: false;
  };
  entries: Record<OPLStudioCarrierId, OPLStudioCarrierEvidenceExpectation>;
};

export type DSHSourceReuseContract = {
  source_cohort: string;
  vendor_byte_policy: string;
  contract_role: string;
  reuse_method: string;
  visual_style_baseline?: string;
  visual_style_scope?: string;
  visual_token_source?: string;
  font_asset_policy?: string;
  dsh_owned_visual_properties: string[];
  opl_injection_boundary: string[];
  parallel_opl_visual_system_allowed: boolean;
  css_override_policy: string;
  pixel_evidence_role: string;
  current_reference_status: string;
  superseded_observations?: string[];
  regression_floor?: string;
  source_usage?: string;
  application_host_runtime_adopted: boolean;
  dsh_product_runtime_authority_adopted: boolean;
  minimum_bar: string;
  model_policy_source: string;
  default_model: string;
  default_reasoning_effort: string;
  required_surfaces: string[];
  required_evidence: string[];
  docs_or_contract_only_completion_allowed: boolean;
};

export type DSHApplicationHostContract = {
  role: 'deepseek_harness_cordis_application_host';
  implementation_status: 'source_implemented_release_admission_separate';
  upstream_version: '0.1.1-rc.2';
  upstream_ref: 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e';
  profile: 'opl-studio';
  profile_source: 'scripts/webui-host/dsh/cordis.yml';
  web_overlay: 'scripts/webui-host/dsh/web.patch.yml';
  profile_home: '$DSH_HOME/profiles/opl-studio';
  dsh_base_loaded: false;
  loaded_dsh_services: string[];
  studio_plugins: string[];
  codex_runtime_owner: 'opl-codex-native';
  codex_owned_state: string[];
  dsh_tool_bridge: 'authenticated_stateful_loopback_mcp';
  dsh_tool_plugin_compatibility: 'plugins_registering_tools_in_ctx_tools_are_exposed_to_codex';
  excluded_upstream_authorities: string[];
  framework_bridge: 'consume_framework_app_state_action_authentication_and_channel_callbacks_only';
  startup_order: string[];
  shutdown_order: string[];
  upstream_upgrade_contract: 'update_one_pinned_ref_and_package_cohort_then_regenerate_vendor_manifest_replay_profile_patches_and_run_host_mcp_renderer_candidate_gates';
  active_shell_adopted: false;
  release_ready: false;
};

export type ShellCandidate = {
  id: string;
  state: string;
  candidate_root: string;
  adapter_contract: string;
  source_topology: string;
  release_participation: string;
  minimum_complete_contract_ref?: string;
  maintenance_policy?: {
    mode: string;
    automatic_or_scheduled_work_allowed: boolean;
    product_development_required: boolean;
    current_mainline: boolean;
    minimum_complete_product_obligation: boolean;
    aionui_feature_parity_obligation: boolean;
    release_blocking: boolean;
  };
  runtime_dependency_policy?: {
    aioncore_required: boolean;
    aionui_required: boolean;
    codex_app_server_source: string;
    opl_integration: string;
    multi_backend_abstraction_required: boolean;
    thread_store_owner: string;
    forbidden_dependencies: string[];
  };
  carrier_evidence_contract?: OPLStudioCarrierEvidenceContract;
  dsh_source_reuse_contract?: DSHSourceReuseContract;
  application_host_contract?: DSHApplicationHostContract;
  p1_baseline_contract?: {
    runtime_bridge_ref: string;
    adapter_binding_ref: string;
    required_user_outcomes: string[];
    forbidden_parallel_control_planes: string[];
  };
  implementation_basis: string[];
  source_upstream?: {
    repo: string;
    app_path: string;
    license: string;
  };
  foreground_alternative_role?: string;
  required_replacements?: string[];
  architecture_policy?: {
    baseline_order: string[];
    minimal_delta: string[];
    extension_points: Record<string, string>;
    ordinary_user_experience: string;
    webui_strategy: string;
  };
  checkout_policy?: {
    primary_path: string;
    accepted_alternate_path: string;
    missing_checkout_status: string;
  };
  build_wrapper?: {
    adapter_contract: string;
    app_root_command: string;
    missing_checkout_blocker_allowed: boolean;
  };
  candidate_stage?: string;
  first_run_contract?: FirstRunContract;
  icon_contract?: IconContract;
  deferred_until_feature_comparison?: string[];
  codex_app_like_chat_target?: {
    scope: string;
    primary_user_flow: string;
    capability_inventory: string[];
  };
  ai_first_interaction_model?: {
    default_visual_basis: string;
    primary_policy: string;
    right_context_policy: string;
    mas_autonomy_policy: string;
    on_demand_context_policy: string[];
    must_not: string[];
  };
  webui_transport?: {
    shared_renderer: boolean;
    shared_host_core: string;
    bridge_abi: string;
    desktop_surface: string;
    web_surface: string;
    desktop_adapter: string;
    web_bridge: string;
    event_stream: string;
    gateway: string;
    desktop_picker_policy: string;
    electron_in_headless_or_container_allowed: boolean;
  };
  target_product_shape: {
    codex_cli_fixed_executor: boolean;
    home_executor_selector_visible: boolean;
    home_backend_selector_visible: boolean;
    home_model_selector_visible: boolean;
    permission_mode_selector_visible: boolean;
    workspace_session_rail_default_visible: boolean;
    inspector_default_visible: boolean;
    default_visual_basis?: string;
    right_context_user_request_only?: boolean;
    co_scientist_split_screen_default?: boolean;
    mas_autonomous_research_default?: boolean;
    left_rail_items: string[];
    right_context_modules: string[];
    right_context_default: string;
    runtime_status_sources: string[];
    runtime_detail_slot: string;
    files_input_policy: string;
    results_policy: string;
    package_lifecycle_surface: string;
    product_identity: {
      visible_text: string[];
      logo_visible: boolean;
      bundle_icon_allowed: boolean;
    };
    purpose_entries: string[];
    runtime_page_policy?: string;
    settings_policy: string;
    account_footer_policy?: {
      source_ref: string;
      projection_path: string;
      connected_identity_source: string;
      connected_visibility: string;
      connected_statuses: string[];
      connected_secondary_label: string;
      fallback_display_name: string;
      fallback_secondary_label: string;
      interaction: string;
      forbidden_identity_sources: string[];
    };
  };
  technical_verification?: {
    app_root_commands?: ValidationCommand[];
    candidate_shell_commands?: ValidationCommand[];
    manual_verification_commands?: ValidationCommand[];
    minimum_acceptance?: string[];
  };
  framework_surfaces: Record<string, string>;
  active_project_line_state_model?: ActiveProjectLineStateModel;
  foundry_agent_series_display_contract?: {
    authority: string;
    display_policy: string;
    required_shared_progress_fields: string[];
    forbidden_domain_fields: string[];
  };
  required_capabilities: string[];
  must_not_own: string[];
  forbidden_home_controls: string[];
  validation_commands: ValidationCommand[];
  non_goals: string[];
};

export type ShellCandidateRegistry = {
  schema_version: number;
  owner: string;
  purpose: string;
  state: string;
  active_shell_unchanged: string;
  active_gui_mainline?: {
    shell: string;
    shell_root: string;
    source_repo: string;
    role: string;
    product_truth_owner: string;
  };
  alternative_gui_policy?: {
    only_foreground_alternative: string;
    basis: string;
    default_candidate_validation_scope: string[];
    explicit_candidate_validation_scope: string[];
    active_shell_switch_policy: string;
  };
  interactive_launcher_policy: {
    state: string;
    topology: string;
    selectable_shells: string[];
    selection_scope: string;
    default_target_source: string;
    target_interface: string;
    target_command: string;
    release_adoption_contract: string;
    selection_mutates_release_adoption: boolean;
    candidate_launch_implies_adoption: boolean;
    selection_changes_updater_channel: boolean;
    side_by_side_bundle_identity_required: boolean;
    simultaneous_same_workspace_write_safety_claimed: boolean;
    concurrent_mainline_policy: string;
    candidate_default_mutation_policy: string;
    missing_target_policy: string;
    implementation_status: string;
    launch_profiles: Record<string, {
      adapter_contract: string;
      default_mode: string;
      supported_modes: string[];
      bundle_id: string;
      packaged_app_path?: string;
      bundle_relative_path?: string;
      launcher_env_abi?: string[];
      dev_command?: string[];
      package_command?: string[];
    }>;
  };
  release_shell_contract: string;
  shell_transition_policy_ref: string;
  gui_product_contract: string;
  runtime_bridge_contract: string;
  product_profile_contract: string;
  page_state_matrix: string;
  first_run_matrix: string;
  candidate_policy: {
    candidate_root_pattern: string;
    candidate_state: string;
    release_participation_until_adopted: string;
    authority_transfer_allowed: boolean;
    release_scripts_must_use_active_shell_adapter: boolean;
    candidate_validation_script: string;
    adoption_gate: string[];
    default_validation_scope?: string;
    default_validation_contract?: string;
  };
  design_reference_policy?: {
    purpose: string;
    source_code_use: string;
    runtime_authority_transfer_allowed: boolean;
    license_gate_required_before_code_reuse: boolean;
    candidate_promotion_route: string;
  };
  design_references?: Array<{
    id: string;
    source_repo: string;
    evaluated_ref: string;
    evaluated_at: string;
    evaluated_version?: string;
    license: string;
    source_usage: string;
    adopted_packages?: Record<string, string>;
    adopted_source?: {
      root: string;
      ref: string;
      path_policy?: string;
      byte_policy?: string;
      package_roots?: string[];
      files: string[];
    };
    adopted_surface?: string[];
    upstream_intake?: {
      mode: string;
      vendor_source_policy: string;
      opl_delta_policy: string;
      update_policy: string;
      floating_ref_allowed: boolean;
      automatic_promotion_allowed: boolean;
      stop_condition: string;
    };
    reference_value: string[];
    opl_mapping: string[];
    forbidden_reuse: string[];
  }>;
  candidates: ShellCandidate[];
};

export type ShellTransitionPolicy = {
  schema: string;
  state: string;
  authority_owner: string;
  initial_carrier: string;
  current_active_shell: string;
  current_candidate_shell: string;
  target_active_shell: string;
  execution_requires_separate_authorization: boolean;
  identities: Record<'active_app' | 'studio_preview' | 'target_app', {
    product_name: string;
    shell?: string;
    bundle_id: string;
    install_path: string;
    user_data_root: string;
    release_repository: string;
    updater_metadata: string[];
    transition_role: string;
  }>;
  version_lines: {
    active_app: string;
    studio_preview: string;
    merge_policy: string;
    target_first_version_rule: string;
    source_window_rule: string;
  };
  upgrade_routes: {
    aionui_mainline_to_target: Record<string, unknown>;
    studio_preview_to_target: Record<string, unknown>;
  };
  state_continuity: {
    canonical_shared_state: Array<{ id: string; owner: string; transition: string }>;
    shell_local_migration: Record<string, unknown> & {
      allowlisted_classes: string[];
      excluded_classes: string[];
    };
  };
  cutover_sequence: string[];
  cutover_gates: string[];
  rollback_policy: Record<string, unknown>;
  forbidden: string[];
};
