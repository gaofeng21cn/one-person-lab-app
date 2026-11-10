export type OplStandardAgentMembershipPolicy = {
  ownership_source_fields: ['official', 'publisher'];
  ownership_match_policy: string;
  required_package_role: 'standard_agent';
  required_readiness: 'selectable';
  required_codex_route: {
    source: 'home_shortcuts[].route';
    route_kind: 'agent_package_shortcut';
    executor: 'codex_cli';
    codex_visible_entry: 'non_empty';
  };
  generic_skills_plugins_connections_group_policy: 'separate_never_in_opl_standard_agent_group';
  package_id_allowlist_allowed: false;
};

export type AppRuntimeForm =
  | 'electron_desktop'
  | 'standalone_headless_webui'
  | 'docker_webui';

export type AppReleaseRoles = {
  current: {
    shell: 'aionui' | 'opl-studio';
    adapter_ref: string;
    release_channel_ref: string;
    admitted_product_platforms: string[];
  };
  successor: {
    candidate_id: 'opl-studio';
    topology_ref: 'delivery_topology';
    active_release_carrier: false;
    release_admission_separate: true;
    target_platforms_are_not_current_release_evidence: true;
  };
};

export type AppDeliveryTopology = {
  schema: 'opl_app_delivery_topology.v2';
  role: 'successor_target_only';
  decision_status: 'approved_target_current_release_admission_separate';
  product_behavior_authority: 'one-person-lab-app';
  release_roles_source_ref: 'release_roles';
  shared_renderer: {
    product_owner: 'one-person-lab-app';
    technology: 'deepseek_harness_derived_react';
    role: 'single_opl_owned_product_renderer';
    implementation_status: 'approved_active_product_development_release_admission_separate';
    technical_evaluation_candidate: 'opl-studio';
    required_surfaces: AppRuntimeForm[];
    source_reuse_policy_ref: string;
    single_active_product_renderer_required: true;
    carrier_specific_product_forks_allowed: false;
    aionui_source_or_runtime_dependency_required: false;
  };
  application_host: {
    implementation_repo: 'gaofeng21cn/opl-studio';
    role: 'deepseek_harness_cordis_application_host';
    implementation_status: 'source_implemented_release_admission_separate';
    upstream_version: '0.2.2-rc.1';
    upstream_ref: 'fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159';
    profile: 'opl-studio';
    profile_source: 'src/host/dsh/cordis.yml';
    web_overlay: 'src/host/dsh/web.patch.yml';
    dsh_base_loaded: false;
    codex_runtime_owner: 'opl-codex-native';
    framework_bridge_scope: 'framework_app_state_action_authentication_and_channel_callbacks_only';
    active_shell_adopted: false;
    release_ready: false;
  };
  shared_host_core: {
    technology: 'node';
    role: 'cross_carrier_application_service_facade_inside_dsh_host';
    exposes: string[];
    lifecycle_owner: 'opl-studio_dsh_application_host';
    codex_service_owner: 'opl-codex-native';
    framework_bridge_owner: 'opl-framework-bridge';
    desktop_adapter: 'electron_main_and_preload_ipc';
    web_adapter: 'http_sse';
    same_core_required_across_carriers: true;
    carrier_specific_business_logic_allowed: false;
    second_session_store_or_action_bus_allowed: false;
  };
  runtime: {
    supported_backend_scope: 'codex_cli_only';
    codex_interface: 'codex_app_server';
    codex_transport_by_carrier: Record<AppRuntimeForm, 'opl_codex_native_managed_app_server_stdio'>;
    opl_integration: 'framework_app_state_action_authentication_and_channel_callbacks_only';
    aioncore_allowed: false;
    aionui_required: false;
    multi_backend_abstraction_required: false;
    second_provider_or_session_store_allowed: false;
    thread_store_owner: 'codex_core_app_server';
  };
  bridge: {
    abi: 'opl_app_host_bridge.v1';
    product_runtime_interface: string;
    shared_typed_bridge_shape_required: true;
    desktop_transport_adapter: 'electron_preload_ipc_to_shared_node_host_core';
    web_transport_adapter: 'http_sse_to_shared_node_host_core';
    renderer_api_semantics_identical_across_adapters: true;
    second_control_plane_or_session_store_allowed: false;
  };
  desktop: {
    carrier_id: 'electron_desktop';
    role: 'approved_target_architecture';
    technical_evaluation_candidate: 'opl-studio';
    implementation_status: 'electron_package_and_updater_adapter_source_implemented_distribution_update_release_wiring_open';
    host_technology: 'electron_thin_shell';
    target_platforms: Array<'macos' | 'windows' | 'linux'>;
    mainline_implementation_assigned: false;
    active_release_carrier: false;
    package_source_implemented: true;
    update_adapter_source_implemented: true;
    distribution_wiring_complete: false;
    update_command_wiring_complete: false;
    release_admission_complete: false;
    platform_support_claim_allowed_before_platform_admission: false;
    electron_role: string;
    platform_runtime_placement: string;
    windows_native_or_wsl_placement_predecided: false;
    swift_appkit_wkwebview_product_host_allowed: false;
    platform_specific_renderer_fork_allowed: false;
    aioncore_required: false;
    container_runtime_role: 'none';
  };
  headless_webui: {
    carrier_id: 'standalone_headless_webui';
    product_name: 'One Person Lab';
    role: 'standalone_service_and_browser_access';
    technical_evaluation_candidate: 'opl-studio';
    implementation_status: 'foreground_cli_user_service_installer_and_update_adapter_source_implemented_distribution_update_release_wiring_open';
    mainline_implementation_assigned: false;
    host_technology: 'shared_node_host_core';
    transport: 'http_sse';
    runtime_process: 'codex_cli_app_server_child_process';
    install_and_launch_modes: Array<'foreground_cli' | 'background_service'>;
    foreground_cli_source_implemented: true;
    user_service_manager_source_implemented: true;
    installer_source_implemented: true;
    distribution_installer_wiring_complete: false;
    carrier_update_adapter_source_implemented: true;
    carrier_update_command_wiring_complete: false;
    release_admission_complete: false;
    explicit_cli_mode_required: true;
    legacy_headless_flag_semantics: 'base_only_unchanged_until_separate_migration';
    existing_packaged_desktop_webui_counts_as_standalone_host: false;
    implementation_gap: string;
    electron_required: false;
    aioncore_required: false;
    same_renderer_host_core_and_bridge_abi_required: true;
    desktop_database_reuse_required: false;
    codex_state_volume_required: true;
    multi_tenant_claim_allowed: false;
  };
  docker_webui: {
    carrier_id: 'docker_webui';
    product_name: 'One Person Lab';
    role: 'containerized_shared_host_core_and_webui';
    technical_evaluation_candidate: 'opl-studio';
    implementation_status: 'successor_oci_preview_admission_implemented_cloud_activation_open';
    mainline_implementation_assigned: false;
    host_technology: 'shared_node_host_core';
    transport: 'http_sse';
    runtime_process: 'codex_cli_app_server_child_process';
    container_source_implemented: true;
    shared_renderer_reuse_implemented: true;
    shared_host_core_reuse_implemented: true;
    distribution_manager_source_implemented: true;
    distribution_wiring_complete: false;
    image_update_adapter_source_implemented: true;
    image_update_command_wiring_complete: false;
    multi_arch_build_plan_source_implemented: true;
    multi_arch_qualification_complete: true;
    release_tier: 'additional_nonblocking';
    qualification_trigger: 'manual_non_public_qualification_or_protected_publication';
    included_in_pr_or_main_ci: false;
    required_oci_platforms: Array<'linux/amd64' | 'linux/arm64'>;
    native_runner_qualification: {
      amd64: 'ubuntu-24.04';
      arm64: 'ubuntu-24.04-arm';
      emulation_allowed_as_runtime_qualification: false;
    };
    signature_verification_implemented: true;
    security_admission_complete: true;
    preview_release_admission_implemented: true;
    release_admission_complete: false;
    existing_aionui_container_counts_as_successor_implementation: false;
    electron_in_container_allowed: false;
    aionui_in_container_allowed: false;
    aioncore_in_container_allowed: false;
    same_renderer_host_core_and_bridge_abi_required: true;
    independent_runtime_persistence_and_release_required: true;
    codex_state_volume_required: true;
    multi_tenant_claim_allowed: false;
    security_admission_ref: string;
    preview_admission_ref: string;
    release_contract_ref: string;
  };
  mobile: {
    initial_surface: 'native_ios_remote_companion';
    product_name: 'OPL Link';
    home_screen_name: 'OPL Link';
    implementation_owner: 'opl-link';
    source_repository: 'https://github.com/gaofeng21cn/opl-link';
    companion_policy_ref: 'contracts/app-remote-companion.json';
    primary_user_object: 'canonical_codex_conversation';
    default_surface: 'conversation_directory';
    task_management_surface: false;
    transport_target: 'ably_free_realtime_with_cloudflare_workers_d1_control_plane';
    transport_selection_status: 'target_pending_mainland_china_probe';
    current_implementation: 'legacy_tencent_and_go_sqlite_source_not_conformant_to_target';
    access_view_type: 'remote_companion_access';
    access_view_contract_ref: 'contracts/opl-app-contributions.schema.json#/$defs/remote_companion_access_result';
    access_status_values: [
      'unavailable',
      'unpaired',
      'reserving',
      'qr_ready',
      'awaiting_confirmation',
      'active',
      'revoking',
      'attention',
    ];
    access_actions: [
      'pair.start',
      'pair.refresh',
      'pair.confirm',
      'pair.cancel',
      'device.rename',
      'pair.revoke',
    ];
    release_ready: false;
    optional_web_fallback: 'desktop_webui_remains_available_but_is_not_the_ios_product';
    separate_product_renderer_allowed: false;
    full_workbench_surface: false;
  };
  successor_product: {
    candidate_id: 'opl-studio';
    user_visible_product_name: 'One Person Lab';
    development_codename_user_visible: false;
    role: 'first_party_cross_platform_app_successor_implementation';
    product_development_required: true;
    current_mainline: false;
    minimum_complete_product_obligation: true;
    aionui_feature_parity_obligation: false;
    release_blocking: false;
    active_release_carrier: false;
    release_adoption_requires_separate_qualification: true;
    candidate_policy_ref: string;
  };
  aionui_reference: {
    role: 'current_release_shell_and_bounded_requirements_evidence_only';
    target_renderer_owner: false;
    target_feature_inventory_owner: false;
    target_runtime_dependency: false;
    aioncore_target_runtime_dependency: false;
    source_reuse_requires_separate_decision: false;
    source_reuse_policy: string;
    source_reuse_cohort_ref: string;
    active_release_shell_source_ref: string;
  };
  minimum_complete_product: {
    schema: 'opl_app_successor_minimum_complete_product.v3';
    implementation_id: 'opl-studio';
    completion_rule: string;
    feature_inventory_ref: string;
    functional_baseline_scope: {
      first_qualification_platform: 'macos';
      macos_full_functional_baseline_required_before_cutover: true;
      windows_linux_full_vm_required_before_declared_platform_support: true;
      source_portability_may_substitute_for_platform_vm_evidence: false;
      current_state: 'candidate_validation_only_not_active_shell_admitted';
    };
    evidence_axes: {
      non_substitution_rule: string;
      required: Array<{
        id: 'contract' | 'source_behavior' | 'rendered' | 'installed_macos' | 'clean_vm';
        owner: string;
        cutover_required: true;
      }>;
    };
    features: Array<{
      feature_id: string;
      capability_id: string;
      owner: string;
      disposition: 'required' | 'mixed';
      cutover_blocking: true;
      components?: Array<{
        id: string;
        disposition: 'required' | 'deferred';
        cutover_blocking: boolean;
        deferral_boundary?: string;
        implementation_status?: string;
        adapter_contract_ref?: string;
      }>;
    }>;
    required_user_outcomes: string[];
    update_ownership: {
      opl_app: string;
      opl_base: string;
      opl_packages: string;
      agent_packages: string;
    };
    composition_model: {
      kernel_owns: string[];
      package_contribution_slots: string[];
      registration_lifecycle: string;
      spatial_scope: string;
      temporal_scope: string;
      app_client_contribution_abi: 'opl_app_client_contributions.v1';
      framework_host_graph_source: 'app_state.ui_contributions';
      framework_host_projection_schema: 'opl_app_ui_contributions_projection.v1';
      host_projection_graph_policy: 'allowlisted_closed_graph_from_framework_projection_only';
      host_projection_allowlist_contract: 'contracts/opl-app-contributions.schema.json';
      typed_slot_policy: 'mount_only_app_product_profile_declared_slots';
      typed_action_policy: 'action_refs_only_via_canonical_app_action_bridge';
      framework_host_composition_authority: 'one-person-lab-framework';
      framework_host_composition_authority_scope: 'framework_runtime_package_graph_and_app_projection';
      framework_runtime_and_package_composition_authority: 'one-person-lab-framework';
      studio_application_host: 'opl-studio';
      studio_application_host_scope: 'dsh_profile_plugin_lifecycle_codex_and_delivery_transport_composition';
      studio_application_host_may_exist_without_authority_transfer: true;
      app_authority_policy: 'one-person-lab-app_owns_product_profile_gui_abi_active_shell_and_release';
      framework_projection_runtime_status: 'framework_host_projection_active';
      shared_transport_policy: 'framework_host_projected_typed_rpc_reads_typed_events_and_canonical_app_actions';
      shared_product_state_semantics: true;
      package_gui_contribution_policy: 'app_schema_admitted_declarative_only_then_framework_host_projected';
      client_authority_policy: 'render_and_dispatch_only_no_plugin_discovery_install_registry_currentness_release_operation_task_package_or_product_truth';
      client_cordis_graph: string;
      client_renderer_compatibility_profile: 'client_renderer_compatibility';
      client_renderer_switch_policy: 'explicit_adapter_selection_after_compatibility_admission_never_unverified_hot_switch';
      brand_capability_projection_policy: 'dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client';
      shared_shell_consumers: ['opl-studio'];
      renderer_and_package_carrier_may_differ: true;
      independent_host_truth_allowed: false;
      second_client_composition_graph_allowed: false;
      second_package_registry_allowed: false;
      second_currentness_authority_allowed: false;
      second_state_or_action_truth_allowed: false;
    };
    explicit_non_goals: string[];
    cutover_policy: {
      strategy: 'establish_then_replace';
      ordered_gates: string[];
      aionui_remains_only_mainline_until_cutover: true;
      aionui_retirement_before_studio_qualification_allowed: false;
      source_or_local_candidate_evidence_may_trigger_cutover: false;
    };
  };
};
