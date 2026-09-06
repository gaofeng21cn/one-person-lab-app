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
    shell: 'aionui';
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
    upstream_version: '0.1.1-rc.2';
    upstream_ref: 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e';
    profile: 'opl-studio';
    profile_source: 'scripts/webui-host/dsh/cordis.yml';
    web_overlay: 'scripts/webui-host/dsh/web.patch.yml';
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
      shared_shell_consumers: ['opl-aion-shell', 'opl-studio'];
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

export type AppProductProfile = {
  schema_version: 2;
  owner: string;
  purpose: string;
  state: string;
  machine_boundary: string;
  app_repo: string;
  product: {
    id: string;
    display_name: string;
    ordinary_chrome_name: string;
    primary_surface: string;
    target_desktop_platforms: Array<'macos' | 'windows' | 'linux'>;
    target_runtime_forms: AppRuntimeForm[];
    positioning: string;
    primary_user_path: string;
  };
  contract_refs: Record<string, string>;
  release_roles: AppReleaseRoles;
  delivery_topology: AppDeliveryTopology;
  client_renderer_compatibility: {
    schema: 'opl_app_client_renderer_compatibility.v1';
    owner: 'one-person-lab-app';
    host_composition_authority: 'one-person-lab-framework';
    host_graph_source: 'app_state.ui_contributions';
    host_projection_schema: 'opl_app_ui_contributions_projection.v1';
    contribution_abi: 'opl_app_client_contributions.v1';
    allowlist_contract: 'contracts/opl-app-contributions.schema.json';
    typed_slots: ['settings.section', 'runtime.detail', 'composer.palette'];
    standard_view_types: [
      'list_detail',
      'timeline',
      'approval_diff',
      'task_board',
      'artifact_view',
      'activity_log',
      'service_status',
      'channel_access',
      'remote_companion_access',
    ];
    transport_binding_source: 'app_state.transport_bindings';
    transport_binding_schema: 'opl_app_transport_bindings_projection.v1';
    transport_binding_migration_state: 'framework_transport_binding_projection_and_dual_shell_source_e2e_completed';
    transport_binding_event: 'opl/app-transport-bindings/updated';
    typed_state_rpc: 'opl app state --profile fast --json';
    typed_action_rpc: 'opl app action execute --action <action_id> [--payload json] [--dry-run] --json';
    typed_client_event: 'opl/app-client-contributions/updated';
    state_semantics_contract: 'contracts/app-runtime-bridge.json';
    client_authority_policy: 'render_and_dispatch_only_no_plugin_discovery_install_registry_currentness_release_operation_task_package_or_product_truth';
    switch_policy: 'explicit_adapter_selection_after_compatibility_admission_never_unverified_hot_switch';
    hot_switch_without_revalidation_allowed: false;
    brand_capability_projection_policy: 'dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client';
    app_fixed_brand_registry_allowed: false;
    client_fixed_brand_registry_allowed: false;
    display_and_allowlist_owner: 'one-person-lab-app';
  };
  official_profile: {
    profile_id: 'opl-official';
    authority: 'one-person-lab-app';
    additional_official_profiles_allowed: false;
    user_composed_profiles_allowed: true;
    desired_root_package_ids: string[];
    apply_on: Array<'first_install' | 'explicit_restore'>;
    never_apply_on: Array<'app_startup' | 'silent_package_update' | 'app_update'>;
    user_removal_policy: {
      explicit_uninstall_is_persistent_preference: true;
      reinstall_before_explicit_restore_allowed: false;
    };
    composition_policy: {
      required_dependency_resolution: string;
      optional_dependency_absence_blocks: false;
      composition_gate: 'identity_presence_only';
      forbidden_composition_or_readiness_gates: string[];
    };
    distribution_forms: {
      standard: {
        desired_roots_source: 'official_profile.desired_root_package_ids';
        offline_seed: false;
      };
      full: {
        desired_roots_source: 'official_profile.desired_root_package_ids';
        offline_seed: true;
      };
      same_desired_roots_required: true;
      full_difference: 'offline_seed_only';
      full_additional_desired_roots_allowed: false;
    };
    package_currentness_policy: {
      published_current_stable_authority: 'package_owner_declared_publication_or_configured_native_carrier';
      installed_callable_authority: 'framework_fresh_aggregation_of_configured_carrier_readback';
      app_carrier_authority: false;
      app_release_authority: false;
      shared_release_set_ordinary_update_authority: false;
    };
  };
  default_session_profile: {
    provider: string;
    provider_name: string;
    existing_provider_name_policy: string;
    base_url: string;
    executor: string;
    model: string;
    reasoning_effort: string;
    applies_after: string;
    authority: string;
  };
  gui: {
    authority: string;
    implementation_carrier: string;
    appearance: {
      default_css_theme_id: string;
      default_css_theme_name: string;
      codex_theme_default_enabled: boolean;
      visual_source_cohort_ref: string;
      visual_reference_cohort_ref: string;
      shared_visual_primitives: string[];
    };
    ui_locale_policy: {
      explicit_user_preference: string;
      first_launch_without_preference: string;
      supported_normalization: string;
      startup_must_not_overwrite_explicit_preference: boolean;
    };
    home: {
      primary_input_surface: string;
      nested_input_card_frames_allowed: boolean;
      codex_cli_fixed_executor: boolean;
      home_executor_selector_visible: boolean;
      codex_model_selector_visible: boolean;
      codex_model_list_visible: boolean;
      codex_model_policy: string;
      codex_model_auto_option_visible: boolean;
      codex_default_model: string;
      codex_default_reasoning_effort: string;
      codex_default_permission_mode: string;
      permission_mode_selector_visible: boolean;
      home_composer_state_contract: {
        contract_id: 'opl_home_composer_state.v1';
        executor: 'codex';
        shortcut_package_membership_source_ref: string;
        opl_standard_agent_membership_policy: OplStandardAgentMembershipPolicy;
        shortcut_preference_source_ref: string;
        shortcut_availability_source_ref: string;
        unknown_standard_agent_allowed: boolean;
        unknown_first_party_opl_standard_agent_allowed: boolean;
        viewports: string[];
        availability_states: string[];
        invariants: {
          model_reasoning_visible: boolean;
          permission_access_visible: boolean;
          executor_selector_visible: boolean;
          active_shortcut_changes_executor: boolean;
          default_visibility_governs_execution: boolean;
          single_home_root: boolean;
          single_composer_shell: boolean;
          single_footer_account_settings_entry: boolean;
        };
        semantic_probe: {
          root_test_id: string;
          instance_counts: Record<string, number>;
          instance_count_groups: Record<string, { test_ids: string[]; total: number }>;
          state_attributes: Record<string, string>;
          desktop_required_controls: string[];
          mobile_required_controls: string[];
          forbidden_controls: string[];
          failure_field: string;
        };
      };
      conversation_backend_selector_visible: boolean;
      conversation_model_selector_visible: boolean;
      conversation_permission_mode_selector_visible: boolean;
      codex_home_model_status_label: string;
      codex_home_model_status_label_en: string;
      codex_precise_model_display_policy: string;
      codex_auto_model_selection: {
        policy_source_ref: string;
        user_can_override_model: boolean;
        user_can_override_reasoning_effort: boolean;
        user_can_restore_auto: boolean;
        selection_persists_into_conversation: boolean;
      };
      codex_model_display_options: {
        display_policy: string;
        button_label_policy: string;
        raw_model_id_visible_in_ordinary_ui: boolean;
        reasoning_effort_visible_for_every_option: boolean;
        reasoning_effort_menu_visible: boolean;
        reasoning_menu_title_zh: string;
        reasoning_menu_title_en: string;
        reasoning_effort_override_surface: string;
        reasoning_effort_options_source: string;
        default_reasoning_effort: string;
        auto_option_current_resolution_visible: boolean;
        model_menu_policy: string;
        menu_structure: {
          root_rows: string[];
          additional_root_rows_allowed: boolean;
          performance_tuning_row_allowed: boolean;
          summary_row_policy: string;
          reset_defaults_policy: string;
          reset_label_zh: string;
          reset_label_en: string;
          summary_row_icon_policy: string;
          reset_icon_policy: string;
          home_and_conversation_share_menu_component: boolean;
        };
        auto_option: {
          id: string;
          label_zh: string;
          label_en: string;
          description_zh: string;
          description_en: string;
          catalog_unavailable_fallback_model: string;
          catalog_unavailable_fallback_reasoning_effort: string;
          follows_latest_strongest: boolean;
        };
        fixed_model_description_zh: string;
        fixed_model_description_en: string;
        reasoning_labels: Record<string, { zh: string; en: string }>;
        user_reasoning_effort_options: string[];
        visible_models: Array<{
          id: string;
          label_zh: string;
          label_en: string;
        }>;
      };
      home_agent_shortcuts_metadata_policy: {
        role: 'owner_projected_package_presentation';
        shortcut_source_ref: string;
        preference_source_ref: string;
        package_id_allowlist_allowed: boolean;
        fallback_policy: string;
      };
      retired_codex_models_must_not_be_exposed: string[];
      activity_center_policy: {
        source: string;
        authority: string;
        role: string;
        default_placement: string;
        home_surface_policy: string;
        allowed_home_runtime_context: string[];
        must_not_display: string[];
        footer_quick_actions_policy: string;
      };
      home_layout: {
        default_mode: string;
        default_active_shortcut: null;
        shortcut_selection_policy: string;
        first_screen_policy: string;
        composer_position: string;
        composer_primary: boolean;
        workspace_selector_visible: boolean;
        workspace_selector_entry: string;
        unselected_workspace_control_visible: boolean;
        unselected_workspace_control_policy: string;
        home_presentation_source_ref: string;
        home_shortcut_visibility_source_ref: string;
        opl_standard_agent_membership_policy: OplStandardAgentMembershipPolicy;
        home_shortcut_placement: string;
        dynamic_question_title: boolean;
        starter_limit: number | null;
        starter_visibility_policy: string;
        starter_order_policy: string;
        shortcut_membership_source_ref: string;
        shortcut_preference_source_ref: string;
        unknown_standard_agent_policy: string;
        starter_layout_policy: string;
        starter_item_width_policy: string;
        starter_count_layout_policy: string;
        desktop_composer_max_width_px: number;
        desktop_composer_min_height_px: number;
        desktop_composer_corner_radius_px: number;
        desktop_context_bar_height_px: number;
        desktop_context_bar_overlap_px: number;
        desktop_context_bar_horizontal_inset_px: number;
        starter_truncation_allowed: boolean;
        selected_starter_visual_policy: string;
        selected_starter_accessibility_state: string;
        selected_working_directory_visual_policy: string;
        workspace_selector_policy: {
          primary_scope: string;
          inactive_recent_directories_visible: boolean;
          management_entry: string;
          management_scope: string;
          selection_effect: string;
          unregister_effect: string;
          filesystem_delete_allowed: boolean;
          active_conversation_change_on_unregister: boolean;
          session_ownership_effect: string;
          cascade_session_delete_allowed: boolean;
        };
        home_shortcut_mutation_policy: {
          pending_scope: string;
          pending_key: string;
          other_shortcuts_remain_interactive: boolean;
          readback_mode: string;
        };
        projectless_conversation_supported: boolean;
        text_chat_without_workspace: string;
        workspace_session_rail_default_state: string;
        active_aionui_primary_navigation: {
          scope: string;
          ordered_entry_ids: string[];
          runtime_entry: {
            route: string;
            label_i18n: Record<'zh-CN' | 'en-US', string>;
            placement: string;
            visibility: string;
            expanded_behavior: string;
            collapsed_behavior: string;
            narrow_drawer_behavior: string;
            keyboard_reachable: boolean;
            home_content_effect: string;
            route_gate_boundary: string;
          };
        };
        right_context_inspector_default_state: string;
        must_not_show: string[];
      };
      utility_icon_policy: {
        library: string;
        opl_owned_settings_navigation_and_overview: string;
        settings_icon_geometry: string;
        icon_text_action_geometry: {
          icon_size_px: number;
          icon_slot_px: number;
          icon_color: string;
          icon_background: string;
          icon_label_gap_px: number;
          source: string;
          normal_typography: string;
          compact_typography: string;
          alignment: string;
          contrast_policy: string;
          disabled_policy: string;
        };
        upstream_fork_body_bulk_icon_rewrite: string;
        refresh_actions: string;
        model_reasoning_control: string;
        account_identity_avatar: {
          shape: string;
          background: string;
          foreground: string;
          han_name_initials: string;
          non_han_name_initials: string;
          email_fallback_initials: string;
          empty_fallback: string;
        };
        global_feedback_action: {
          placement: string;
          icon: string;
          icon_style: string;
          target_url: string;
          open_mode: string;
          prefill_fields: string[];
          startup_failure_action: {
            placement: string;
            delivery_channel: string;
            backend_dependency: string;
            submission_policy: string;
            automatic_submission: boolean;
            prefill_fields: string[];
            automatic_attachment_policy: string;
          };
          shell_local_delivery_forbidden: boolean;
        };
        scope: string;
      };
    };
    ordinary_conversation: {
      path_id: string;
      entry_source: string;
      executor: string;
      composer_position: string;
      active_capability_chip_visible: boolean;
      persistent_purpose_selector_visible: boolean;
      backend_selector_visible: boolean;
      model_selector_visible: boolean;
      permission_mode_selector_visible: boolean;
      permission_mode_language_policy: string;
      provider_selector_visible: boolean;
      model_status_surface: string;
      technical_details_policy: string;
      composer_placeholder_policy: string;
      composer_context_strip: string[];
      composer_send_scoped_inputs: string[];
      composer_send_scoped_consumption_policy: string;
      send_failure_input_policy: {
        must_preserve_send_scoped_local_inputs: boolean;
        failure_scopes: string[];
        preserved_inputs: string[];
        success_consumption_policy: string;
        failure_restore_policy: string;
        concurrent_edit_merge_policy: string;
        initial_message_handoff_policy: string;
      };
      composer_forbidden_persistent_context: string[];
      composer_bottom_action_row: string[];
      composer_optional_actions: string[];
      mobile_action_sheet: {
        trigger: string;
        allowed_actions: string[];
        send_stop_location: string;
        forbidden_actions: string[];
      };
      unified_context_menu: {
        trigger: string;
        placement: string;
        trigger_dispatch_policy: string;
        direct_file_picker_fallback_allowed: boolean;
        shared_desktop_mobile_content: boolean;
        presentation: string;
        searchable: boolean;
        search_field_policy: string;
        keyboard_navigation: boolean;
        keyboard_commands: string[];
        escape_focus_return: string;
        query_fields: string[];
        desktop_panel_width_policy: string;
        desktop_panel_max_width_px: number;
        desktop_panel_alignment: string;
        mobile_panel_policy: string;
        item_content_policy: string;
        group_heading_policy: string;
        viewport_policy: string;
        scroll_region_policy: string;
        empty_state_policy: string;
        capability_catalog_empty_policy: string;
        groups: Array<{
          id: string;
          scope: string;
          source?: string;
          source_ref?: string;
          label_i18n?: Record<'zh-CN' | 'en-US', string>;
          catalog_membership_source_ref?: string;
          opl_standard_agent_membership_policy?: OplStandardAgentMembershipPolicy;
          status_source_ref?: string;
          required_package_ids?: string[];
          catalog_order_policy?: string;
          home_shortcut_independence_policy?: string;
          availability_policy?: string;
          action_policy?: string;
          unknown_standard_agent_policy?: string;
          agent_owned_skill_deduplication_policy?: string;
          label_policy?: string;
          mode_deduplication_policy?: string;
          existing_session_rebinding_allowed?: boolean;
          surface_actions: {
            home_new_session: string[];
            existing_conversation: string[];
          };
        }>;
        selected_context_presentation: {
          workspace_or_initial_cwd: string;
          attachments: string;
          agent_packages_skills_modes_and_connections: string;
        };
        surface_behavior: {
          home_new_session: string;
          existing_conversation: string;
          settings_route_policy: string;
        };
        authority_policy: string;
        forbidden_entries: string[];
      };
      projectless_conversation_supported: boolean;
      session_workspace_model: {
        primary_unit: string;
        identity_authority: string;
        project_affinity_states: string[];
        project_affinity_cardinality: string;
        projectless_session_semantics: string;
        projectless_detection: string;
        project_affinity_role: string;
        workspace_binding_role: string;
        workspace_path_projection: {
          picker_result: string;
          host_path_role: string;
          runtime_path_role: string;
          windows_projection: string;
          non_windows_projection: string;
          native_windows_backend_fallback_allowed: boolean;
          generic_local_picker_projection_allowed: boolean;
        };
        runtime_pwd_role: string;
        turn_cwd_override_allowed: boolean;
        writable_roots_role: string;
        core_workspace_application: string;
        runtime_pwd_changes_project_affinity: boolean;
        project_affinity_changes_writable_roots: boolean;
        project_adoption_transition: string;
        bound_project_reassignment: string;
        workspace_owns_session: boolean;
        workspace_owns_context: boolean;
        workspace_owns_artifacts: boolean;
        workspace_group_cascade_session_delete_allowed: boolean;
      };
      explicit_session_input_policy: {
        scope: string;
        surfaces: string[];
        selection_scope: string;
        workspace_required: boolean;
        access_authority: string;
        shell_extra_path_authorization_allowed: boolean;
        user_initiated_only: boolean;
        workspace_preload_allowed: boolean;
        workspace_scoped_persistence_allowed: boolean;
        implicit_workspace_context_injection_allowed: boolean;
        composer_consumption: string;
        composer_persistence_after_send: string;
        workspace_readiness_boundary: {
          gates: string[];
          plain_local_conversation_requires_workspace_root: boolean;
          send_scoped_local_file_inputs_require_workspace_root: boolean;
          agent_package_workspace_requirement_policy: string;
          ordinary_codex_conversation_independent_of_agent_package_readiness: boolean;
          codex_and_model_prerequisites_unchanged: boolean;
        };
      };
      codex_subagent_activity: {
        feature_id: 'B0-11';
        product_role: string;
        source: string;
        metadata_authority: {
          collaboration: string;
          subagent: string;
        };
        state_mapping: {
          active_agent_states: string[];
          done_agent_states: string[];
          active_tool_call_statuses: string[];
          done_tool_call_statuses: string[];
          unknown_or_malformed: string;
          canonical_child_thread_status_not_loaded_is_not_activity_state: boolean;
        };
        display: {
          groups: string[];
          read_only: boolean;
          detail_fields: string[];
          open_thread_action: string;
          open_failure_policy: string;
        };
        forbidden_layers: string[];
      };
      transcript_export: {
        scope: string;
        history_loading_policy: string;
        incomplete_history_policy: string;
        silent_truncation_allowed: boolean;
        shareable_roles: string[];
        shareable_message_types: string[];
        excluded_content: string[];
        default_format: string;
        allowed_formats: string[];
        strict_json_document_fields: string[];
        strict_json_message_fields: string[];
        redaction_required: boolean;
        explicit_directory_required: boolean;
        explicit_filename_required: boolean;
        filename_extension_follows_format: boolean;
        errors_visible: boolean;
        workspace_bundle_authorized: boolean;
      };
    };
    right_context_inspector: {
      compatibility_name: string;
      product_role: string;
      placement: string;
      surface_kind: string;
      default_state: string;
      default_third_column_visible: boolean;
      opens_on_user_or_task_request_only: boolean;
      chat_canvas_remains_primary: boolean;
      scope: string;
      workspace_surface: Record<string, unknown>;
      preview_surface: Record<string, unknown>;
      review_surface: Record<string, unknown>;
      on_demand_task_tools: Record<string, unknown>;
      equal_weight_tool_taxonomy_allowed: boolean;
      legacy_taxonomy_ids_forbidden: string[];
      runtime_duplicate_allowed: boolean;
      environment_popover_ref: string;
      must_not_own: string[];
    };
    ordinary_capability_selector_policy: {
      scope: string;
      authority: string;
      recommendation_authority: string;
      palette_agent_catalog_source_ref: string;
      opl_standard_agent_membership_policy: OplStandardAgentMembershipPolicy;
      palette_agent_status_source_ref: string;
      palette_agent_availability_policy: string;
      palette_agent_action_policy: string;
      palette_unknown_standard_agent_policy: string;
      palette_required_agent_package_ids?: string[];
      palette_home_shortcut_independence_policy: string;
      palette_agent_group_label_i18n: Record<'zh-CN' | 'en-US', string>;
      agent_owned_skill_deduplication_policy: string;
      agent_reference_admission_policy: {
        active_agent_package_cardinality: string;
        selection_authority: string;
        at_mention_agent_selection_allowed: boolean;
        at_mention_semantics: string;
        at_mention_requires_user_selection: boolean;
        plain_text_agent_reference_changes_active_package: boolean;
        multiple_agent_reference_policy: string;
        cross_agent_semantic_admission_owner: string;
        deterministic_cross_agent_routing_allowed: boolean;
        oma_engineering_admission: string;
        deliverable_failure_policy: string;
        existing_conversation_rebinding_allowed: boolean;
      };
      skill_source_ref: string;
      skill_menu_policy: string;
      conversation_loaded_skill_display_policy: string;
      package_skill_source_ref?: string;
      mcp_server_source_ref: string;
      mcp_menu_policy: string;
      conversation_loaded_mcp_display_policy: string;
      forbidden_mcp_policy: string;
      forbidden_mcp_examples: string[];
      conversation_snapshot_policy: string;
      forbidden_mcp_matchers: {
        exact: string[];
        prefixes: string[];
        contains: string[];
      };
      scrub_extra_keys: string[];
      required_scrub_targets: string[];
      unmatched_mcp_policy: string;
      required_preservation_targets: string[];
    };
    agent_package_registry: {
      directory_projection_authority: string;
      status_projection_authority: string;
      action_projection_authority: string;
      presentation_source: string;
      unknown_package_policy: string;
      manifest_lock_receipt_parser_allowed: boolean;
      action_id_allowlist_allowed: boolean;
      catalog_presentation_policy: {
        section_order: string[];
        professional_agent_order_source: string;
        professional_agent_order_policy: string;
        workflow_profile_policy: string;
        package_role_labels_i18n: Record<string, Record<'zh-CN' | 'en-US', string>>;
        raw_package_role_visible: boolean;
        dependency_hierarchy: {
          source: string;
          direction: string;
          single_parent_policy: string;
          multiple_parent_policy: string;
          missing_or_invisible_parent_policy: string;
          hardcoded_package_relationships_allowed: boolean;
          duplicate_rows_allowed: boolean;
          status_and_actions_source: string;
        };
        developer_controls_disclosure: {
          default_state: string;
          contains: string[];
          ordinary_catalog_remains_visible_when_collapsed: boolean;
        };
      };
      shell_consumption_policy: string;
    };
  };
  codex: {
    default_model: string;
    default_model_description: string;
    default_reasoning_effort: string;
    app_runtime_home: {
      default_path: string;
      override_env: string;
      resolution_policy: string;
      app_env_injection: string;
      startup_and_recheck_mutation: string;
      explicit_model_access_mutation: string;
    };
    auto_model_policy: {
      authority: string;
      recommendation_authority: string;
      policy_source_ref: string;
      projection_surface_kind: string;
      projection_presence_rule: string;
      app_role: string;
      resolution_precedence: string[];
      app_fallback_role: string;
      configured_default: {
        model: string;
        reasoning_effort: string;
      };
      configured_default_role: string;
      mode_default: string;
      model_catalog_source: string;
      catalog_response_models_field: string;
      catalog_default_model_field: string;
      catalog_supported_reasoning_efforts_field: string;
      catalog_supported_reasoning_effort_option_value_field: string;
      catalog_reasoning_effort_order_policy: string;
      catalog_pagination_request_cursor_field: string;
      catalog_pagination_response_cursor_field: string;
      catalog_pagination_completion_policy: string;
      catalog_hidden_model_field: string;
      catalog_hidden_model_policy: string;
      frontier_model_preference_order_role: string;
      frontier_model_preference_order: string[];
      known_model_reasoning_effort_overrides: Record<string, string>;
      unknown_default_model_policy: string;
      unknown_model_reasoning_effort_policy: string;
      catalog_without_default_policy: string;
      catalog_unavailable_fallback: {
        model: string;
        reasoning_effort: string;
      };
      persistence_policy: {
        auto: string;
        fixed: string;
        state_encoding: string;
        reasoning_override_from_auto: string;
        stale_fixed_model: string;
      };
    };
    opl_flow_context: {
      flow_id: string;
      source: string;
      presence_source_ref: string;
      presence_rule: string;
      delivery: string;
      absence_policy: string;
      status_source_ref: string;
      status_planes: string[];
      user_agents_policy: string;
      language_policy: string;
      app_role: string;
      flow_policy_parsing: string;
      companion_inventory_storage: string;
    };
    new_conversation_additional_instructions: {
      content_owner: 'user';
      delivery: string;
      storage_key: string;
      storage_key_status: 'legacy_compatibility_storage_key';
      generated_base_context_allowed: boolean;
      agent_route_fallback_allowed: boolean;
      empty_value_policy: string;
      reset_behavior: string;
      effect: string;
    };
  };
  first_run: {
    readiness_layers: string[];
    ready_to_launch_gate: {
      id: string;
      ui_order: string;
      guid_navigation_blocking: boolean;
      required_core_items: string[];
      must_not_require: string[];
    };
    full_readiness_layers: string[];
    deferred_blockers: string[];
    runtime_provider: {
      full_readiness_provider: string;
      ready_to_launch_blocking: boolean;
    };
    full_runtime_package_qualification: {
      source: string;
      reconciliation: string;
      composition_policy: string;
      readiness_policy: string;
      workspace_scoped_materialization_policy: string;
      global_workspace_scoped_exposure: string;
    };
    first_conversation: {
      gate: string;
      runtime_readiness_method: string;
      runtime_readiness_route: string;
      retired_route: string;
      route_failure_policy: string;
      source_command: string;
      ready_to_launch_must_be_true: boolean;
      required_before_plain_send: string[];
      required_before_send_with_local_inputs: string[];
      required_before_workspace_controls: string[];
      unknown_readiness_policy: string;
      blocked_feedback: string;
      must_wait_for: string[];
      must_not_wait_for: string[];
      failure_policy: string;
    };
    ordinary_shell_recovery: {
      fresh_webui_login_setup_check: {
        trigger: string;
        route_intent: string;
        state_source: string;
        known_incomplete_behavior: string;
        ready_behavior: string;
        unknown_timeout_or_read_failure_behavior: string;
        ui_timeout_ms: number;
        ordinary_startup_refresh_and_deep_link_behavior: string;
        consumption_policy: string;
      };
      persistent_setup_entry: {
        visibility: string;
        surface: string;
        target_route: string;
        label_policy: string;
        must_preserve_current_route_until_clicked: boolean;
      };
      persistent_home_composer_runtime_alert: string;
      plain_conversation: {
        required_items: string[];
        workspace_root_required: boolean;
        blocked_feedback: string;
        must_preserve_prompt: boolean;
      };
      send_scoped_local_inputs: {
        required_items: string[];
        workspace_root_required: boolean;
        supported_inputs: string[];
      };
      workspace_controls: {
        required_items: string[];
        restricted_capabilities: string[];
        blocked_feedback: string;
        plain_conversation_remains_available: boolean;
        send_scoped_local_inputs_remain_available: boolean;
      };
      unknown_readiness_policy: string;
    };
    progress_model: {
      source_command: string;
      source_path: string;
      renderer_truth_policy: string;
      required_setup_flow_fields: string[];
      required_progress_fields: string[];
      required_checklist_fields: string[];
      required_visible_elements: string[];
    };
    command_line_tools: {
      auto_request_installer: boolean;
      blocks_full_first_launch: boolean;
      messages: string[];
    };
    beginner_presentation: {
      audience: string;
      presentation_mode: string;
      primary_user_goal: string;
      primary_steps: string[];
      primary_progress_signal: string;
      advanced_progress_disclosure: string;
      background_maintenance_presentation: string;
      technical_detail_policy: string;
      layout_mode: string;
      ordinary_navigation_policy: string;
      step_navigation_policy: string;
      current_task_policy: string;
      current_task_selection_policy: string;
      progress_display_policy: string;
      model_access_choice_policy: string;
      model_access_inflight_policy: string;
      model_access_setup: {
        desktop_default_method: string;
        desktop_method_order: string[];
        gateway_account: {
          credentials: string[];
          device_label_policy: string;
          secret_bridge_ref: string;
          post_login_state_source: string;
          unique_group_action: string;
          post_setup_state_refresh: string;
          model_access_action: string;
          model_access_action_policy: string;
          model_access_confirmation: {
            trigger: string;
            label_zh: string;
            label_en: string;
            danger_level: string;
            confirmation_required: boolean;
            gateway_login_counts_as_confirmation: boolean;
            action_visibility: string;
            fresh_state_required_before_execute: boolean;
            fresh_state_required_after_execute: boolean;
          };
          shared_fast_state_cache_policy: string;
          unresolved_group_error: string;
          ready_claim_policy: string;
          password_clear_policy: string;
          diagnostic_policy: string;
        };
        api_key: {
          role: string;
          bridge: string;
          transport: string;
          redaction_policy: string;
        };
        existing_codex_recheck: {
          role: string;
          bridge: string;
          mutates_configuration: boolean;
        };
        webui: {
          default_method: string;
          allowed_methods: string[];
          gateway_password_login: boolean;
          gateway_login_route: string;
          transport: string;
        };
      };
      completion_transition_policy: string;
      completion_navigation_policy: string;
      defer_navigation_policy: string;
      technical_detail_navigation_policy: string;
      request_exclusivity_policy: string;
      pending_state_policy: string;
      core_readiness_status_policy: string;
      minimum_window_primary_action_policy: string;
      background_shell_interaction_policy: string;
      window_control_policy: string;
      raw_error_policy: string;
      secret_diagnostic_policy: string;
      accessible_name_policy: string;
      post_install_ai_self_check_entry: {
        trigger: string;
        target_route: string;
        route_state: string;
        prompt_policy: string;
        target_state_checks: string[];
        mutation_policy: string;
        release_gate_policy: string;
      };
    };
  };
  settings: {
    visible_tabs: string[];
    legacy_route_redirects: Record<string, string>;
    control_plane?: {
      source_contract_ref: string;
      default_route: string;
      route_identity_policy: string;
      ordinary_visible_tabs: string[];
      ordinary_routes: Array<{
        id: string;
        path: string;
        label_key: string;
        default_label_en: string;
        default_label_zh: string;
        icon_token: string;
        ia_group: string;
        slot_id: string;
        state_source: string;
        refresh_source: string;
      }>;
      secondary_pages: Array<{
        id: string;
        path: string;
        ia_group: string;
        slot_id: string;
        visibility: string;
      }>;
      legacy_route_redirects: Record<string, string>;
      extension_anchor_remap: Record<string, string>;
      extension_tab_policy: Record<string, unknown>;
      slot_registry: Record<string, {
        component_key: string;
        wrapper_policy: string;
        subroute_query_param?: string;
        legacy_subroutes?: Record<string, string>;
      }>;
      state_action_policy: Record<string, unknown>;
    };
    settings_information_architecture?: Record<string, {
      label_zh: string;
      label_en: string;
      role: string;
      primary_question: string;
    }>;
    environment_items: string[];
    developer_profile: {
      label_key: string;
      description_key: string;
      hide_machine_status: boolean;
      source: string;
      default_profile: string;
      opt_in_policy: string;
      settings_page: string;
      global_control: string;
      safe_maintenance_control: string;
      safe_maintenance_label_zh: string;
      safe_maintenance_label_en: string;
      safe_maintenance_default: string;
      safe_maintenance_auto_policy: string;
      safe_maintenance_fast_policy: string;
      safe_maintenance_required_readback: string[];
      shared_runtime_mutation_boundary: string;
      safe_maintenance_independent_from_source_selection: boolean;
      package_source_control: string;
      fallback_policy: string;
      capability_axes: string[];
      capabilities: Record<string, {
        standard_default: string;
        developer_opt_in: string;
        display_policy: string;
      }>;
      state_keys: Record<string, string>;
    };
  };
  companion_payloads: {
    class: string;
    install_exposure_policy_ref: string;
    exposure_classes_ref: string;
    opl_packages_projection_ref: string;
    opl_packages_lifecycle_ref: string;
    public_abi: {
      primary_semantic_entry: string;
      preferred_app_distribution: string;
      plugin_must_not_create_second_semantics: boolean;
      cli_and_app_share_skill_semantics: boolean;
    };
    domain_modules: string[];
    capability_strategy_consumer: {
      strategy_authority: string;
      compiler_authority: string;
      runtime_projection_ref: string;
      full_build_lock_kind: string;
      app_policy_inventory_allowed: boolean;
      app_direct_workflow_policy_parse_allowed: boolean;
    };
    native_automation: {
      owner: string;
      cron_skill_packaged: boolean;
      exposure: string;
      product_policy_ref: string;
      route: string;
      scheduler_authority: string;
      single_scheduler_store_required: boolean;
      ordinary_sider_entry_visible: boolean;
      executor: string;
      executor_selector_visible: boolean;
    };
    domain_plugin_skills_must_not_be_companion_mirrors: boolean;
  };
  boundary: {
    app_owns: string[];
    app_consumes: string[];
    app_does_not_own: string[];
  };
  install_update_taxonomy: {
    source_refs: string[];
    public_software_objects: string[];
    managed_update_component_keys: string[];
    ordinary_component_picker_allowed: boolean;
    transaction_internal_state_ids: string[];
    ordinary_ui_must_not_expose_as_peer_objects: string[];
    internal_detail_fields: {
      opl_base: string[];
      opl_app: string[];
      opl_packages: string[];
    };
  };
};
