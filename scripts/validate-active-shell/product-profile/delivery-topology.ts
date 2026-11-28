import { validateMobileCompanionTopology } from '../remote-companion-validator.ts';
import { readAppShellAdapterContract } from '../../app-shell-adapter.ts';
import { assertDeepEqualJson, readJson } from '../assertions.ts';
import { defaultActiveShellContractPath, releaseChannelPath } from '../validation-config.ts';
import { validateMinimumCompleteProductContract } from '../../validate-shell-candidates/candidate-contract.ts';

export function validateDeliveryTopology(profile, releaseChannel = readJson(releaseChannelPath)) {
  const topology = profile.delivery_topology;
  const adapter = readJson(defaultActiveShellContractPath);
  const adapterTopology = adapter.delivery_topology;
  const stablePlatforms = releaseChannel.release_platform_matrix.policies.stable_required.platforms;
  const runtimeForms = [
    topology?.desktop?.carrier_id,
    topology?.headless_webui?.carrier_id,
    topology?.docker_webui?.carrier_id,
  ];
  const topologyLabel = 'Product profile must separate the approved target topology from current release-platform authority';
  assertDeepEqualJson(profile.product?.target_desktop_platforms, adapterTopology.desktop_platforms, topologyLabel);
  assertDeepEqualJson(profile.product?.target_runtime_forms, runtimeForms, topologyLabel);
  assertDeepEqualJson(Object.keys(adapterTopology.carrier_entries), runtimeForms, 'Shell adapter delivery carrier entries');
  validateMinimumCompleteProductContract(topology.minimum_complete_product);
  if (
    Object.hasOwn(profile.product ?? {}, 'supported_release_platforms') ||
    topology?.schema !== 'opl_app_delivery_topology.v2' ||
    topology.role !== 'active_product_and_release_target' ||
    topology.decision_status !== 'active_studio_only_aionui_retired' ||
    topology.product_behavior_authority !== 'one-person-lab-app' ||
    topology.release_roles_source_ref !== 'release_roles'
  ) {
    throw new Error(topologyLabel);
  }
  assertDeepEqualJson(
    profile.release_roles,
    {
      current: {
        shell: readAppShellAdapterContract().active_shell,
        adapter_ref: 'contracts/app-shell-adapter.json',
        release_channel_ref: 'contracts/app-release-channel.json',
        admitted_product_platforms: stablePlatforms,
      },
      successor: {
        candidate_id: 'opl-studio',
        topology_ref: 'delivery_topology',
        active_release_carrier: true,
        release_admission_separate: false,
        target_platforms_are_not_current_release_evidence: false,
      },
    },
    'Product profile current and successor release roles',
  );
  assertDeepEqualJson(
    topology.shared_renderer,
    {
      product_owner: 'one-person-lab-app',
      technology: adapterTopology.renderer,
      role: 'single_opl_owned_product_renderer',
      implementation_status: 'active_product_implementation',
      technical_evaluation_candidate: 'opl-studio',
      required_surfaces: runtimeForms,
      source_reuse_policy_ref: 'docs/product/gui/deepseek-harness-composition-plan.md',
      single_active_product_renderer_required: true,
      carrier_specific_product_forks_allowed: false,
      aionui_source_or_runtime_dependency_required: false,
    },
    'Product profile shared renderer topology',
  );
  const host = adapter.application_host;
  assertDeepEqualJson(
    topology.application_host,
    {
      implementation_repo: adapter.shell_source.owner_repo,
      role: host.role,
      implementation_status: 'source_implemented_active_shell_carrier_qualification_separate',
      upstream_version: host.upstream_version,
      upstream_ref: host.upstream_ref,
      profile: host.profile,
      profile_source: host.profile_source,
      web_overlay: host.web_overlay,
      dsh_base_loaded: false,
      codex_runtime_owner: 'opl-codex-native',
      framework_bridge_scope: 'framework_app_state_action_authentication_and_channel_callbacks_only',
      active_shell_adopted: true,
      release_ready: false,
    },
    'Product profile DSH Application Host topology',
  );
  assertDeepEqualJson(
    topology.shared_host_core,
    {
      technology: 'node',
      role: adapterTopology.shared_host_core_role,
      exposes: [
        'codex_thread_and_turn_transport',
        'framework_app_state_action_bridge',
        'typed_host_events',
      ],
      lifecycle_owner: 'opl-studio_dsh_application_host',
      codex_service_owner: topology.application_host.codex_runtime_owner,
      framework_bridge_owner: 'opl-framework-bridge',
      desktop_adapter: 'electron_main_and_preload_ipc',
      web_adapter: adapterTopology.web_adapter,
      same_core_required_across_carriers: true,
      carrier_specific_business_logic_allowed: false,
      second_session_store_or_action_bus_allowed: false,
    },
    'Product profile shared Node host core topology',
  );
  assertDeepEqualJson(
    topology.runtime,
    {
      supported_backend_scope: 'codex_cli_only',
      codex_interface: 'codex_app_server',
      codex_transport_by_carrier: Object.fromEntries(
        runtimeForms.map((carrier) => [carrier, 'opl_codex_native_managed_app_server_stdio']),
      ),
      opl_integration: 'framework_app_state_action_authentication_and_channel_callbacks_only',
      aioncore_allowed: false,
      aionui_required: false,
      multi_backend_abstraction_required: false,
      second_provider_or_session_store_allowed: false,
      thread_store_owner: adapter.codex_executable_contract.thread_store_owner,
    },
    'Product profile Codex-only runtime topology',
  );
  assertDeepEqualJson(
    topology.bridge,
    {
      abi: adapterTopology.bridge_abi,
      product_runtime_interface: 'opl_app_state_action_and_codex_app_server_thread_event_contracts',
      shared_typed_bridge_shape_required: true,
      desktop_transport_adapter: 'electron_preload_ipc_to_shared_node_host_core',
      web_transport_adapter: 'http_sse_to_shared_node_host_core',
      renderer_api_semantics_identical_across_adapters: true,
      second_control_plane_or_session_store_allowed: false,
    },
    'Product profile carrier bridge topology',
  );
  assertDeepEqualJson(
    topology.desktop,
    {
      carrier_id: 'electron_desktop',
      role: 'approved_target_architecture',
      technical_evaluation_candidate: 'opl-studio',
      implementation_status: 'electron_package_and_updater_adapter_source_implemented_distribution_update_release_wiring_open',
      host_technology: 'electron_thin_shell',
      target_platforms: adapterTopology.desktop_platforms,
      mainline_implementation_assigned: false,
      active_release_carrier: false,
      package_source_implemented: true,
      update_adapter_source_implemented: true,
      distribution_wiring_complete: false,
      update_command_wiring_complete: false,
      release_admission_complete: false,
      platform_support_claim_allowed_before_platform_admission: false,
      electron_role: 'window_preload_os_integration_packaging_signing_and_updater_only',
      platform_runtime_placement: 'adapter_owned_and_unresolved_until_platform_evidence',
      windows_native_or_wsl_placement_predecided: false,
      swift_appkit_wkwebview_product_host_allowed: false,
      platform_specific_renderer_fork_allowed: false,
      aioncore_required: false,
      container_runtime_role: 'none',
    },
    'Product profile Electron desktop topology',
  );
  assertDeepEqualJson(
    topology.headless_webui,
    {
      carrier_id: 'standalone_headless_webui',
      product_name: 'One Person Lab',
      role: 'standalone_service_and_browser_access',
      technical_evaluation_candidate: 'opl-studio',
      implementation_status: 'foreground_cli_user_service_installer_and_update_adapter_source_implemented_distribution_update_release_wiring_open',
      mainline_implementation_assigned: false,
      host_technology: 'shared_node_host_core',
      transport: adapterTopology.web_adapter,
      runtime_process: 'codex_cli_app_server_child_process',
      install_and_launch_modes: ['foreground_cli', 'background_service'],
      foreground_cli_source_implemented: true,
      user_service_manager_source_implemented: true,
      installer_source_implemented: true,
      distribution_installer_wiring_complete: false,
      carrier_update_adapter_source_implemented: true,
      carrier_update_command_wiring_complete: false,
      release_admission_complete: false,
      explicit_cli_mode_required: true,
      legacy_headless_flag_semantics: 'base_only_unchanged_until_separate_migration',
      existing_packaged_desktop_webui_counts_as_standalone_host: false,
      implementation_gap: 'wire_the_existing_installer_service_manager_and_update_adapter_into_app_distribution_then_qualify_each_platform',
      electron_required: false,
      aioncore_required: false,
      same_renderer_host_core_and_bridge_abi_required: true,
      desktop_database_reuse_required: false,
      codex_state_volume_required: true,
      multi_tenant_claim_allowed: false,
    },
    'Product profile standalone headless WebUI topology',
  );
  assertDeepEqualJson(
    topology.docker_webui,
    {
      carrier_id: 'docker_webui',
      product_name: 'One Person Lab',
      role: 'containerized_shared_host_core_and_webui',
      technical_evaluation_candidate: 'opl-studio',
      implementation_status: 'successor_oci_preview_admission_implemented_cloud_activation_open',
      mainline_implementation_assigned: false,
      host_technology: 'shared_node_host_core',
      transport: adapterTopology.web_adapter,
      runtime_process: 'codex_cli_app_server_child_process',
      container_source_implemented: true,
      shared_renderer_reuse_implemented: true,
      shared_host_core_reuse_implemented: true,
      distribution_manager_source_implemented: true,
      distribution_wiring_complete: false,
      image_update_adapter_source_implemented: true,
      image_update_command_wiring_complete: false,
      multi_arch_build_plan_source_implemented: true,
      multi_arch_qualification_complete: true,
      release_tier: 'additional_nonblocking',
      qualification_trigger: 'manual_non_public_qualification_or_protected_publication',
      included_in_pr_or_main_ci: false,
      required_oci_platforms: ['linux/amd64', 'linux/arm64'],
      native_runner_qualification: {
        amd64: 'ubuntu-24.04',
        arm64: 'ubuntu-24.04-arm',
        emulation_allowed_as_runtime_qualification: false,
      },
      signature_verification_implemented: true,
      security_admission_complete: true,
      preview_release_admission_implemented: true,
      release_admission_complete: false,
      existing_aionui_container_counts_as_successor_implementation: false,
      electron_in_container_allowed: false,
      aionui_in_container_allowed: false,
      aioncore_in_container_allowed: false,
      same_renderer_host_core_and_bridge_abi_required: true,
      independent_runtime_persistence_and_release_required: true,
      codex_state_volume_required: true,
      multi_tenant_claim_allowed: false,
      security_admission_ref:
        'contracts/app-install-exposure-policy.json#installer_surfaces.docker_webui.installer_model.cloud_deployment_model',
      preview_admission_ref:
        'contracts/app-shell-adapter.json#carrier_evidence_contract/preview_oci_admission',
      release_contract_ref: 'contracts/app-release-channel.json#distribution_semantics.cohort_policy',
    },
    'Product profile Docker WebUI topology',
  );
  validateMobileCompanionTopology(topology.mobile);
  assertDeepEqualJson(
    topology.successor_product,
    {
      candidate_id: 'opl-studio',
      user_visible_product_name: 'One Person Lab',
      development_codename_user_visible: false,
      role: 'active_first_party_app_implementation',
      product_development_required: true,
      current_mainline: true,
      minimum_complete_product_obligation: true,
      aionui_feature_parity_obligation: false,
      release_blocking: false,
      active_release_carrier: true,
      release_qualification_remains_carrier_specific: true,
      candidate_policy_ref: 'contracts/app-shell-adapter.json#candidate_policy',
    },
    'Product profile successor product policy',
  );
  assertDeepEqualJson(
    (({ schema, implementation_id, feature_inventory_ref, functional_baseline_scope, evidence_axes, features, startup_history_continuity, ...legacyMinimumProduct }) => legacyMinimumProduct)(topology.minimum_complete_product),
    {
      completion_rule:
        'all_required_user_outcomes_have_owner_backed_state_action_and_post_action_readback_without_a_second_runtime_or_truth_store',
      required_user_outcomes: [
        'codex_project_thread_turn_streaming_and_lifecycle',
        'current_agent_run_status_and_package_contributed_hypothesis_roadmap',
        'files_results_and_artifact_refs_in_an_on_demand_detail_surface',
        'gateway_model_working_directory_preferences_and_diagnostics',
        'dynamic_agent_catalog_search_filter_source_policy_home_visibility_order_and_lifecycle',
        'dynamic_capability_directory_and_package_settings_contributions',
        'provider_projected_channel_access_and_canonical_transport_binding',
        'remote_companion_access_pairing_and_device_projection_without_channel_view_filtering',
        'separate_app_base_and_packages_update_status_actions_and_fresh_readback',
        'service_health_safe_recovery_and_owner_routed_diagnostics',
      ],
      update_ownership: {
        opl_app:
          'one_app_update_contract_with_carrier_specific_desktop_headless_and_container_adapters_owned_by_one-person-lab-app',
        opl_base: 'framework_managed_update_component_projection_and_owner_actions',
        opl_packages: 'framework_package_projection_owner_actions_and_managed_automatic_update_policy',
        agent_packages: 'part_of_opl_packages_never_a_fourth_updater',
      },
      composition_model: {
        kernel_owns: [
          'navigation',
          'codex_thread_and_turn_client',
          'settings_host',
          'permission_and_action_broker',
        ],
        package_contribution_slots: ['settings.section', 'runtime.detail', 'composer.palette'],
        registration_lifecycle:
          'reuse_pinned_deepseek_harness_slot_registration_ordering_error_isolation_and_disposal',
        spatial_scope: 'contributions_mount_only_in_declared_slots',
        temporal_scope: 'contributions_register_and_dispose_with_package_session_or_page_scope',
        app_client_contribution_abi: 'opl_app_client_contributions.v1',
        framework_host_graph_source: 'app_state.ui_contributions',
        framework_host_projection_schema: 'opl_app_ui_contributions_projection.v1',
        host_projection_graph_policy: 'allowlisted_closed_graph_from_framework_projection_only',
        host_projection_allowlist_contract: 'contracts/opl-app-contributions.schema.json',
        typed_slot_policy: 'mount_only_app_product_profile_declared_slots',
        typed_action_policy: 'action_refs_only_via_canonical_app_action_bridge',
        framework_host_composition_authority: 'one-person-lab-framework',
        framework_host_composition_authority_scope: 'framework_runtime_package_graph_and_app_projection',
        framework_runtime_and_package_composition_authority: 'one-person-lab-framework',
        studio_application_host: adapter.active_shell,
        studio_application_host_scope: 'dsh_profile_plugin_lifecycle_codex_and_delivery_transport_composition',
        studio_application_host_may_exist_without_authority_transfer: true,
        app_authority_policy: 'one-person-lab-app_owns_product_profile_gui_abi_active_shell_and_release',
        framework_projection_runtime_status: 'framework_host_projection_active',
        shared_transport_policy: 'framework_host_projected_typed_rpc_reads_typed_events_and_canonical_app_actions',
        shared_product_state_semantics: true,
        package_gui_contribution_policy: 'app_schema_admitted_declarative_only_then_framework_host_projected',
        client_authority_policy: 'render_and_dispatch_only_no_plugin_discovery_install_registry_currentness_release_operation_task_package_or_product_truth',
        client_cordis_graph: 'derived_from_framework_host_graph_and_app_product_profile_slot_policy',
        client_renderer_compatibility_profile: 'client_renderer_compatibility',
        client_renderer_switch_policy: 'explicit_adapter_selection_after_compatibility_admission_never_unverified_hot_switch',
        brand_capability_projection_policy: 'dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client',
        shared_shell_consumers: [adapter.active_shell],
        renderer_and_package_carrier_may_differ: true,
        independent_host_truth_allowed: false,
        second_client_composition_graph_allowed: false,
        second_package_registry_allowed: false,
        second_currentness_authority_allowed: false,
        second_state_or_action_truth_allowed: false,
      },
      generic_capability_reuse_policy: 'discover_official_and_community_DSH_plugins_first_keep_upstream_current_adapt_canonical_OPL_interfaces_maintain_custom_plugins_for_OPL_specific_outcomes',
      explicit_non_goals: [
        'AionCore',
        'AionUI_multi_backend_or_provider_abstraction',
        'AionUI_custom_assistant_catalog',
        'AionUI_Team_or_shell_owned_agent_orchestration',
        'unreviewed_arbitrary_code_GUI_plugins',
        'full_AionUI_feature_or_page_parity',
        'built_in_rich_artifact_preview_plugin_can_supply_it',
        'dedicated_git_workbench_is_not_an_initial_cutover_gate',
        'destructive_storage_cleanup_ui_for_initial_cutover',
      ],
      cutover_policy: {
        strategy: 'studio_active_aionui_retired',
        ordered_gates: [
          'maintain_studio_product_outcomes',
          'qualify_each_published_studio_carrier_independently',
          'verify_installed_and_runtime_readback',
        ],
        aionui_mainline_retired: true,
        aionui_source_or_runtime_required: false,
        historical_aionui_data_auto_discovery_or_import_allowed: false,
        source_or_local_candidate_evidence_implies_release_ready: false,
      },
    },
    'Product profile minimum complete successor product contract',
  );
}
