import path from 'node:path';
import { assertDeepEqualJson, assertForbiddenCapabilityPolicy, assertIncludesAll, readJson } from './assertions.ts';
import {
  appOwnedHomeLayout,
  firstRunModelAccessSetupPolicy,
  forbiddenAuthorityOwners,
  focusedFirstRunPresentationPolicy,
  progressiveFirstRunRecoveryPolicy,
} from './app-contract-constants.ts';
import {
  defaultActiveShellContractPath,
  firstRunMatrixPath,
  installExposurePolicyPath,
  pageStateMatrixPath,
  root,
  settingsControlPlanePath,
  assertFile,
} from './validation-config.ts';
import {
  assertNonEmptyStringArray,
  assertFirstRunProgressModelShape,
  validateBeginnerFirstRunPresentation,
  validateOplFlowContext,
} from './shared-contract-validators.ts';
import { validateScheduledTasksProfileProjection } from './scheduled-tasks-policy-validator.ts';
import { validateMinimumCompleteProductContract } from '../validate-shell-candidates/candidate-contract.ts';
import { validateSettingsControlPlaneBehavior } from './settings-control-plane-validator.ts';
import { assertDefaultCodexSessionProfile } from '../app-product-profile-default-session.ts';
import { assertAppProductProfileIdentity } from '../app-product-profile-identity.ts';
import {
  assertAgentReferenceAdmissionPolicy,
  assertAppProductProfileCodexModelDisplayOptions,
  assertAppProductProfileGuiAuthority,
  assertAppProductProfileGuiInteractionBaseline,
  assertAppProductProfileHomeCodexPolicy,
  assertAppProductProfileSettingsVisualSystem,
  assertCapabilityReferenceListShape,
  assertHomeComposerStateContract,
  assertOfficialProfileShape,
  appOwnedOplStandardAgentMembershipPolicy,
} from '../app-product-profile-shared-validators.ts';

const ordinaryForbiddenCapabilityPolicy = {
  forbidden_mcp_matchers: {
    exact: ['aionui-team'],
    prefixes: ['team_', 'mcp__aionui-team'],
    contains: ['aionui-team'],
  },
  scrub_extra_keys: [
    'team_mcp_stdio_config',
    'team_id',
    'teamId',
    'team_lead_team_id',
    'team_lead_team_slot_id',
    'team_lead_conversation_id',
    'tl',
  ],
};

const dynamicHomeComposerAuthority = {
  shortcut_package_membership_source_ref:
    'app_state.agent_packages.directory.entries',
  opl_standard_agent_membership_policy: appOwnedOplStandardAgentMembershipPolicy,
  shortcut_preference_source_ref:
    'app_state.agent_packages.status_index.home_shortcut_preferences[]',
  shortcut_availability_source_ref:
    'app_state.agent_packages.directory.entries + app_state.agent_packages.status_index.packages[].presence',
  unknown_standard_agent_allowed: false,
  unknown_first_party_opl_standard_agent_allowed: true,
};

function validateDynamicHomeComposerStateContract(value, label) {
  const {
    shortcut_package_membership_source_ref,
    opl_standard_agent_membership_policy,
    shortcut_preference_source_ref,
    shortcut_availability_source_ref,
    unknown_standard_agent_allowed,
    unknown_first_party_opl_standard_agent_allowed,
  } = value ?? {};
  assertDeepEqualJson(
    {
      shortcut_package_membership_source_ref,
      opl_standard_agent_membership_policy,
      shortcut_preference_source_ref,
      shortcut_availability_source_ref,
      unknown_standard_agent_allowed,
      unknown_first_party_opl_standard_agent_allowed,
    },
    dynamicHomeComposerAuthority,
    `${label} dynamic authority`,
  );
  assertHomeComposerStateContract(value, label);
}

const requiredHostTools = [
  'command_line_tools',
  'homebrew',
  'node',
  'git',
];
const fullReadinessItems = [
  'domain_modules',
  'family_runtime_provider',
  'recommended_skills',
  'native_helpers',
  'repo_sync',
  'command_line_tools_install',
  'ecosystem_module_updates',
];
const deferredMaintenanceItems = [
  'repo_sync',
  'module_reconcile',
  'command_line_tools_install',
  'native_helpers',
  'companion_skills_install',
  'ecosystem_module_updates',
];
function validateProductProfileIdentity(profile) {
  assertAppProductProfileIdentity(profile, 'product profile');
}

function validateProductProfileContractRefs(profile) {
  for (const [label, expected] of Object.entries({
    active_shell: defaultActiveShellContractPath,
    page_state: pageStateMatrixPath,
    first_run: firstRunMatrixPath,
    install_exposure: installExposurePolicyPath,
    settings_control_plane: settingsControlPlanePath,
    remote_companion: path.join(root, 'contracts', 'app-remote-companion.json'),
  })) {
    const value = profile.contract_refs?.[label];
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Product profile missing contract_refs.${label}`);
    }
    assertFile(path.join(root, value), `product profile ${label} contract ref`);
    if (path.resolve(root, value) !== path.resolve(expected)) {
      throw new Error(`Unexpected product profile contract_refs.${label}: ${value}`);
    }
  }
}

function validateDeliveryTopology(profile) {
  const topology = profile.delivery_topology;
  validateMinimumCompleteProductContract(topology.minimum_complete_product);
  if (
    JSON.stringify(profile.product?.target_desktop_platforms) !== JSON.stringify(['macos', 'windows', 'linux']) ||
    JSON.stringify(profile.product?.target_runtime_forms) !==
      JSON.stringify(['electron_desktop', 'standalone_headless_webui', 'docker_webui']) ||
    Object.hasOwn(profile.product ?? {}, 'supported_release_platforms') ||
    topology?.schema !== 'opl_app_delivery_topology.v2' ||
    topology.role !== 'successor_target_only' ||
    topology.decision_status !== 'approved_target_current_release_admission_separate' ||
    topology.product_behavior_authority !== 'one-person-lab-app' ||
    topology.release_roles_source_ref !== 'release_roles'
  ) {
    throw new Error('Product profile must separate the approved target topology from current release-platform authority');
  }
  assertDeepEqualJson(
    profile.release_roles,
    {
      current: {
        shell: 'aionui',
        adapter_ref: 'contracts/app-shell-adapter.json',
        release_channel_ref: 'contracts/app-release-channel.json',
        admitted_product_platforms: ['macos-arm64'],
      },
      successor: {
        candidate_id: 'opl-studio',
        topology_ref: 'delivery_topology',
        active_release_carrier: false,
        release_admission_separate: true,
        target_platforms_are_not_current_release_evidence: true,
      },
    },
    'Product profile current and successor release roles',
  );
  assertDeepEqualJson(
    topology.shared_renderer,
    {
      product_owner: 'one-person-lab-app',
      technology: 'deepseek_harness_derived_react',
      role: 'single_opl_owned_product_renderer',
      implementation_status: 'approved_active_product_development_release_admission_separate',
      technical_evaluation_candidate: 'opl-studio',
      required_surfaces: ['electron_desktop', 'standalone_headless_webui', 'docker_webui'],
      source_reuse_policy_ref: 'docs/product/gui/deepseek-harness-composition-plan.md',
      single_active_product_renderer_required: true,
      carrier_specific_product_forks_allowed: false,
      aionui_source_or_runtime_dependency_required: false,
    },
    'Product profile shared renderer topology',
  );
  assertDeepEqualJson(
    topology.application_host,
    {
      implementation_repo: 'gaofeng21cn/opl-studio',
      role: 'deepseek_harness_cordis_application_host',
      implementation_status: 'source_implemented_release_admission_separate',
      upstream_version: '0.1.1-rc.2',
      upstream_ref: 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e',
      profile: 'opl-studio',
      profile_source: 'scripts/webui-host/dsh/cordis.yml',
      web_overlay: 'scripts/webui-host/dsh/web.patch.yml',
      dsh_base_loaded: false,
      codex_runtime_owner: 'opl-codex-native',
      framework_bridge_scope: 'framework_app_state_action_authentication_and_channel_callbacks_only',
      active_shell_adopted: false,
      release_ready: false,
    },
    'Product profile DSH Application Host topology',
  );
  assertDeepEqualJson(
    topology.shared_host_core,
    {
      technology: 'node',
      role: 'cross_carrier_application_service_facade_inside_dsh_host',
      exposes: [
        'codex_thread_and_turn_transport',
        'framework_app_state_action_bridge',
        'typed_host_events',
      ],
      lifecycle_owner: 'opl-studio_dsh_application_host',
      codex_service_owner: 'opl-codex-native',
      framework_bridge_owner: 'opl-framework-bridge',
      desktop_adapter: 'electron_main_and_preload_ipc',
      web_adapter: 'http_sse',
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
      codex_transport_by_carrier: {
        electron_desktop: 'opl_codex_native_managed_app_server_stdio',
        standalone_headless_webui: 'opl_codex_native_managed_app_server_stdio',
        docker_webui: 'opl_codex_native_managed_app_server_stdio',
      },
      opl_integration: 'framework_app_state_action_authentication_and_channel_callbacks_only',
      aioncore_allowed: false,
      aionui_required: false,
      multi_backend_abstraction_required: false,
      second_provider_or_session_store_allowed: false,
      thread_store_owner: 'codex_core_app_server',
    },
    'Product profile Codex-only runtime topology',
  );
  assertDeepEqualJson(
    topology.bridge,
    {
      abi: 'opl_app_host_bridge.v1',
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
      target_platforms: ['macos', 'windows', 'linux'],
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
      transport: 'http_sse',
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
      transport: 'http_sse',
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
        'contracts/app-shell-candidates.json#candidates/opl-studio/carrier_evidence_contract/preview_oci_admission',
      release_contract_ref: 'contracts/app-release-channel.json#distribution_semantics.cohort_policy',
    },
    'Product profile Docker WebUI topology',
  );
  assertDeepEqualJson(
    topology.mobile,
    {
      initial_surface: 'native_ios_remote_companion',
      product_name: 'OPL Link',
      home_screen_name: 'OPL Link',
      implementation_owner: 'opl-link',
      source_repository: 'https://github.com/gaofeng21cn/opl-link',
      companion_policy_ref: 'contracts/app-remote-companion.json',
      primary_user_object: 'canonical_codex_conversation',
      default_surface: 'conversation_directory',
      task_management_surface: false,
      transport_target: 'ably_free_realtime_with_cloudflare_workers_d1_control_plane',
      transport_selection_status: 'target_pending_mainland_china_probe',
      current_implementation: 'legacy_tencent_and_go_sqlite_source_not_conformant_to_target',
      access_view_type: 'remote_companion_access',
      access_view_contract_ref: 'contracts/opl-app-contributions.schema.json#/$defs/remote_companion_access_result',
      release_cohort_lock_ref: 'contracts/app-remote-companion.json#transport.release_cohort_lock',
      validation_cohort_admission: {
        authority: 'opl-link/service_cloudflare_worker_and_d1',
        active_pair_limit: 20,
        warning_threshold: 15,
        limit_scope: 'validation_cohort_not_provider_seat_limit',
        fixed_provider_seat_limit: false,
        testflight_is_capacity_authority: false,
        metadata_or_config_digest_mismatch: 'fail_closed_before_claim_or_transport_connection',
      },
      access_status_values: [
        'unavailable',
        'unpaired',
        'reserving',
        'qr_ready',
        'awaiting_confirmation',
        'active',
        'revoking',
        'attention',
      ],
      access_actions: [
        'pair.start',
        'pair.refresh',
        'pair.confirm',
        'pair.cancel',
        'device.rename',
        'pair.revoke',
      ],
      release_ready: false,
      optional_web_fallback: 'desktop_webui_remains_available_but_is_not_the_ios_product',
      separate_product_renderer_allowed: false,
      full_workbench_surface: false,
    },
    'Product profile mobile topology',
  );
  assertDeepEqualJson(
    topology.successor_product,
    {
      candidate_id: 'opl-studio',
      user_visible_product_name: 'One Person Lab',
      development_codename_user_visible: false,
      role: 'first_party_cross_platform_app_successor_implementation',
      product_development_required: true,
      current_mainline: false,
      minimum_complete_product_obligation: true,
      aionui_feature_parity_obligation: false,
      release_blocking: false,
      active_release_carrier: false,
      release_adoption_requires_separate_qualification: true,
      candidate_policy_ref: 'contracts/app-shell-candidates.json',
    },
    'Product profile successor product policy',
  );
  assertDeepEqualJson(
    topology.aionui_reference,
    {
      role: 'current_release_shell_and_bounded_requirements_evidence_only',
      target_renderer_owner: false,
      target_feature_inventory_owner: false,
      target_runtime_dependency: false,
      aioncore_target_runtime_dependency: false,
      source_reuse_requires_separate_decision: false,
      source_reuse_policy: 'bounded_pinned_dsh_visual_cohort_only_through_opl_visual_provider_and_icon_adapter',
      source_reuse_cohort_ref: 'contracts/app-gui-visual-source-cohort.json',
      active_release_shell_source_ref: 'contract_refs.active_shell',
    },
    'Product profile AionUI reference boundary',
  );
  assertDeepEqualJson(
    (({ feature_inventory_ref, functional_baseline_scope, evidence_axes, features, ...legacyMinimumProduct }) => legacyMinimumProduct)(topology.minimum_complete_product),
    {
      schema: 'opl_app_successor_minimum_complete_product.v3',
      implementation_id: 'opl-studio',
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
        studio_application_host: 'opl-studio',
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
        shared_shell_consumers: ['opl-aion-shell', 'opl-studio'],
        renderer_and_package_carrier_may_differ: true,
        independent_host_truth_allowed: false,
        second_client_composition_graph_allowed: false,
        second_package_registry_allowed: false,
        second_currentness_authority_allowed: false,
        second_state_or_action_truth_allowed: false,
      },
      explicit_non_goals: [
        'AionCore',
        'AionUI_multi_backend_or_provider_abstraction',
        'AionUI_custom_assistant_catalog',
        'AionUI_Team_or_shell_owned_agent_orchestration',
        'generic_arbitrary_code_GUI_plugins',
        'full_AionUI_feature_or_page_parity',
      ],
      cutover_policy: {
        strategy: 'establish_then_replace',
        ordered_gates: [
          'complete_minimum_product_outcomes',
          'qualify_electron_desktop_headless_webui_docker_packaging_install_update_and_release',
          'explicitly_switch_active_shell_and_release_carrier',
          'verify_installed_and_runtime_readback',
          'retire_aionui_mainline',
        ],
        aionui_remains_only_mainline_until_cutover: true,
        aionui_retirement_before_studio_qualification_allowed: false,
        source_or_local_candidate_evidence_may_trigger_cutover: false,
      },
    },
    'Product profile minimum complete successor product contract',
  );
}

function validateClientRendererCompatibility(profile) {
  assertDeepEqualJson(
    profile.client_renderer_compatibility,
    {
      schema: 'opl_app_client_renderer_compatibility.v1',
      owner: 'one-person-lab-app',
      host_composition_authority: 'one-person-lab-framework',
      host_graph_source: 'app_state.ui_contributions',
      host_projection_schema: 'opl_app_ui_contributions_projection.v1',
      contribution_abi: 'opl_app_client_contributions.v1',
      allowlist_contract: 'contracts/opl-app-contributions.schema.json',
      typed_slots: ['settings.section', 'runtime.detail', 'composer.palette'],
      standard_view_types: ['list_detail', 'timeline', 'approval_diff', 'task_board', 'artifact_view', 'activity_log', 'service_status', 'channel_access', 'remote_companion_access'],
      transport_binding_source: 'app_state.transport_bindings',
      transport_binding_schema: 'opl_app_transport_bindings_projection.v1',
      transport_binding_migration_state: 'framework_transport_binding_projection_and_dual_shell_source_e2e_completed',
      transport_binding_event: 'opl/app-transport-bindings/updated',
      typed_state_rpc: 'opl app state --profile fast --json',
      typed_action_rpc: 'opl app action execute --action <action_id> [--payload json] [--dry-run] --json',
      typed_client_event: 'opl/app-client-contributions/updated',
      state_semantics_contract: 'contracts/app-runtime-bridge.json',
      client_authority_policy: 'render_and_dispatch_only_no_plugin_discovery_install_registry_currentness_release_operation_task_package_or_product_truth',
      switch_policy: 'explicit_adapter_selection_after_compatibility_admission_never_unverified_hot_switch',
      hot_switch_without_revalidation_allowed: false,
      brand_capability_projection_policy: 'dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client',
      app_fixed_brand_registry_allowed: false,
      client_fixed_brand_registry_allowed: false,
      display_and_allowlist_owner: 'one-person-lab-app',
    },
    'App Client renderer compatibility profile',
  );
}

function validateProductProfileCodexDefaults(profile) {
  if (
    profile.codex?.app_runtime_home?.default_path !== '~/.codex' ||
    profile.codex.app_runtime_home.override_env !== 'CODEX_HOME' ||
    profile.codex.app_runtime_home.resolution_policy !== 'preserve_existing_env_else_codex_system_default' ||
    profile.codex.app_runtime_home.app_env_injection !== 'forbidden' ||
    profile.codex.app_runtime_home.startup_and_recheck_mutation !== 'forbidden' ||
    profile.codex.app_runtime_home.explicit_model_access_mutation !==
      'framework_action_atomic_merge_with_backup_and_restore'
  ) {
    throw new Error('Product profile must preserve the system Codex home without App environment injection');
  }
  if (
    profile.codex.auto_model_policy?.recommendation_authority !== 'opl-flow' ||
    profile.codex.auto_model_policy.policy_source_ref !==
      'app_state.agent_packages.status_index.packages.opl-flow.model_projection' ||
    profile.codex.auto_model_policy.projection_surface_kind !== 'opl_codex_model_policy_projection.v1' ||
    profile.codex.auto_model_policy.projection_presence_rule !==
      'consume_only_when_fresh_opl_flow_presence_installed_true_and_projection_is_valid' ||
    JSON.stringify(profile.codex.auto_model_policy.resolution_precedence) !== JSON.stringify([
      'explicit_user_selection',
      'installed_opl_flow_recommendation',
      'fresh_codex_live_default',
      'app_fallback_when_flow_unavailable',
    ]) ||
    profile.codex.auto_model_policy.app_fallback_role !==
      'configured_default_is_used_only_when_flow_projection_is_absent_invalid_or_unavailable_and_catalog_cannot_resolve' ||
    profile.codex.auto_model_policy.configured_default_role !==
      'app_fallback_not_flow_recommendation_authority'
  ) {
    throw new Error('Product profile model policy must use user, installed Flow, live Codex, then App fallback precedence');
  }
  validateOplFlowContext(profile.codex?.opl_flow_context, 'Product profile OPL Flow Context');
  const additionalInstructions = profile.codex?.new_conversation_additional_instructions;
  if (
    additionalInstructions?.content_owner !== 'user' ||
    additionalInstructions.delivery !== 'new_conversation_additional_instructions_only' ||
    additionalInstructions.storage_key !== 'codex.oplAppSessionContextAdditional' ||
    additionalInstructions.storage_key_status !== 'legacy_compatibility_storage_key' ||
    additionalInstructions.generated_base_context_allowed !== false ||
    additionalInstructions.agent_route_fallback_allowed !== false ||
    additionalInstructions.empty_value_policy !== 'inject_nothing' ||
    additionalInstructions.reset_behavior !== 'clear_additional_instructions' ||
    additionalInstructions.effect !== 'next_new_conversation'
  ) {
    throw new Error('Product profile must limit new-conversation additions to optional user-authored text');
  }
  for (const field of [
    'opl_app_session_context',
    'default_visible_skills',
    'skill_priority',
    'session_context_lines',
    'session_context_i18n',
  ]) {
    if (field in profile.codex) {
      throw new Error(`Product profile must not restore legacy Codex authority codex.${field}`);
    }
  }
  assertDefaultCodexSessionProfile(profile, { label: 'product profile', requireLiteralDefaults: true });
  assertAppProductProfileGuiAuthority(profile, 'Product profile');
  assertAppProductProfileGuiInteractionBaseline(profile, 'Product profile');
  assertAppProductProfileSettingsVisualSystem(profile, 'Product profile');
  assertAppProductProfileHomeCodexPolicy(profile, 'Product profile');
  assertAppProductProfileCodexModelDisplayOptions(profile, 'Product profile');
  validateDynamicHomeComposerStateContract(profile.gui?.home?.home_composer_state_contract, 'Product profile Home composer state contract');
  validateUiLocalePolicy(profile);
  validateHomeAssistantDefaults(profile);
  validateProductProfileSettings(profile);
  validateProductProfileCodexSkills(profile);
  validateInstallUpdateTaxonomy(profile);
  validateOrdinaryCapabilitySelectorPolicy(profile);
}

function validateUiLocalePolicy(profile) {
  const policy = profile.gui?.ui_locale_policy;
  if (
    policy?.explicit_user_preference !== 'preserve_across_launches' ||
    policy?.first_launch_without_preference !== 'detect_system_locale_before_first_render' ||
    policy?.supported_normalization !== 'zh_to_zh-CN_else_en-US' ||
    policy?.startup_must_not_overwrite_explicit_preference !== true
  ) {
    throw new Error('Product profile locale policy must detect the system language before first render while preserving explicit preferences');
  }
}

function validateHomeAssistantDefaults(profile) {
  const homeLayout = profile.gui.home.home_layout;
  if (
    homeLayout?.default_active_shortcut !== null ||
    homeLayout?.shortcut_selection_policy !==
      'explicit_user_or_navigation_selection_only_no_saved_preset_restore_and_never_disabled_by_launch_readiness' ||
    homeLayout?.starter_item_width_policy !== 'content_sized' ||
    homeLayout?.starter_count_layout_policy !== 'center_actual_visible_count_and_wrap_without_navigation_chevrons' ||
    homeLayout?.desktop_composer_max_width_px !== 736 ||
    homeLayout?.desktop_composer_min_height_px !== 98 ||
    homeLayout?.desktop_composer_corner_radius_px !== 22 ||
    homeLayout?.desktop_context_bar_height_px !== 52 ||
    homeLayout?.desktop_context_bar_overlap_px !== 13 ||
    homeLayout?.desktop_context_bar_horizontal_inset_px !== 12 ||
    homeLayout?.workspace_selector_visible !== true ||
    homeLayout?.workspace_selector_entry !== 'home.new_session_context_bar' ||
    homeLayout?.unselected_workspace_control_visible !== true ||
    homeLayout?.unselected_workspace_control_policy !==
      'localized_choose_project_directory_action_not_projectless_status_placeholder' ||
    homeLayout?.selected_working_directory_visual_policy !==
      'independent_new_session_context_bar_control_with_selected_directory_and_clear_action' ||
    homeLayout?.selected_starter_visual_policy !==
      'quiet_fill_with_aria_pressed_without_trailing_selection_glyph' ||
    homeLayout?.selected_starter_accessibility_state !== 'aria_pressed_reflects_active_shortcut'
  ) {
    throw new Error('Product profile Home must default to the base executor and require explicit professional-agent selection');
  }
  assertDeepEqualJson(
    homeLayout.workspace_selector_policy,
    appOwnedHomeLayout.workspace_selector_policy,
    'Product profile Home workspace selector session ownership policy',
  );
  if (
    profile.gui.appearance?.visual_source_cohort_ref !== 'contracts/app-gui-visual-source-cohort.json' ||
    profile.gui.appearance?.visual_reference_cohort_ref !== 'contracts/app-gui-visual-reference-cohort.json' ||
    JSON.stringify(profile.gui.appearance?.shared_visual_primitives) !==
      JSON.stringify(['composer', 'rail_row', 'icon_button', 'menu', 'settings_row'])
  ) {
    throw new Error('Product profile appearance must bind the pinned DSH visual source cohort and shared primitives');
  }
  const iconPolicy = profile.gui.home.utility_icon_policy;
  if (
    iconPolicy?.library !== 'pinned_deepseek_harness_icon_cohort_via_opl_icon_adapter' ||
    iconPolicy?.opl_owned_settings_navigation_and_overview !== 'dsh_icon_primitives_14_16px_currentcolor' ||
    iconPolicy?.settings_icon_geometry !==
      'stable_16px_slot_1_5_to_1_75px_visual_stroke_no_colored_tile_or_letter_avatar' ||
    JSON.stringify(iconPolicy?.icon_text_action_geometry) !==
      JSON.stringify({
        icon_size_px: 16,
        icon_slot_px: 16,
        icon_color: 'currentColor',
        icon_background: 'transparent_none',
        icon_label_gap_px: 4,
        source: 'pinned_dsh_Button.module.css',
        normal_typography: 'var(--dsw-font-s-14)',
        compact_typography: 'var(--dsw-font-xxs-12)',
        alignment: 'icon_slot_and_label_share_one_vertical_centerline',
        contrast_policy: 'button_foreground_color_applies_to_icon_and_label_together',
        disabled_policy: 'apply_disabled_opacity_to_the_whole_control_never_hide_only_the_icon',
      }) ||
    iconPolicy?.upstream_fork_body_bulk_icon_rewrite !== 'forbidden' ||
    iconPolicy?.refresh_actions !== 'icon_only_with_tooltip_and_accessible_name' ||
    iconPolicy?.model_reasoning_control !== 'text_and_disclosure_without_brain_icon' ||
    JSON.stringify(iconPolicy?.account_identity_avatar) !==
      JSON.stringify({
        shape: 'circle',
        background: 'semantic_success_green',
        foreground: 'inverse',
        han_name_initials: 'first_han_character_only',
        non_han_name_initials: 'first_letters_of_first_two_words_uppercase_else_first_two_codepoints',
        email_fallback_initials: 'first_two_local_part_codepoints_uppercase',
        empty_fallback: 'OP',
      }) ||
    iconPolicy?.global_feedback_action?.placement !== 'titlebar_trailing_utility' ||
    iconPolicy?.global_feedback_action?.icon !== 'circle_question' ||
    iconPolicy?.global_feedback_action?.icon_style !== 'regular_outline' ||
    iconPolicy?.global_feedback_action?.target_url !==
      'https://github.com/gaofeng21cn/one-person-lab-app/issues/new' ||
    iconPolicy?.global_feedback_action?.open_mode !== 'external_browser_user_review_and_submit' ||
    JSON.stringify(iconPolicy?.global_feedback_action?.prefill_fields) !==
      JSON.stringify(['localized_title', 'localized_body', 'current_route', 'app_release_version']) ||
    JSON.stringify(iconPolicy?.global_feedback_action?.startup_failure_action) !==
      JSON.stringify({
        placement: 'blocking_startup_failure_dialog',
        delivery_channel: 'electron_main_process_native_open_external_via_preload_ipc',
        backend_dependency: 'none',
        submission_policy: 'external_browser_user_review_and_submit',
        automatic_submission: false,
        prefill_fields: [
          'localized_title',
          'localized_body',
          'app_release_version',
          'platform',
          'architecture',
          'startup_failure_reason',
          'backend_boundary_code',
          'backend_boundary_stage',
        ],
        automatic_attachment_policy: 'forbidden_no_logs_paths_credentials_or_user_content',
      }) ||
    iconPolicy?.global_feedback_action?.shell_local_delivery_forbidden !== true
  ) {
    throw new Error('Product profile OPL utility icons must include the App-owned GitHub feedback action');
  }
  if ('home_agent_shortcuts' in profile.gui.home) {
    throw new Error('Product profile must not restore an App-owned Home shortcut list');
  }
  for (const field of [
    'default_assistants',
    'non_default_assistants',
    'professional_agent_packages',
    'professional_agent_packages_metadata_policy',
  ]) {
    if (field in profile.gui) {
      throw new Error(`Product profile must not restore fixed Agent/Home presentation field gui.${field}`);
    }
  }
  if ('home_purpose_entries' in profile.gui.home) {
    throw new Error('Product profile must not restore fixed Agent/Home presentation field gui.home.home_purpose_entries');
  }
  if (
    homeLayout?.home_presentation_source_ref !==
    'app_state.agent_packages.directory.entries + app_state.agent_packages.status_index.home_shortcut_preferences[]'
  ) {
    throw new Error('Product profile Home presentation must come from the dynamic Agent directory and shortcut compatibility metadata');
  }
  for (const retiredModel of [
    'gpt-5.3-codex-spark',
    'gpt-5.3-codex',
    'gpt-5.2-codex',
    'gpt-5.1-codex-max',
    'gpt-5.1-codex-mini',
  ]) {
    if (!profile.gui.home?.retired_codex_models_must_not_be_exposed?.includes(retiredModel)) {
      throw new Error(`Product profile GUI home must ban retired Codex model ${retiredModel}`);
    }
  }
}

function validateAgentPackageRegistryProjection(profile) {
  const projection = profile.gui?.agent_package_registry;
  if (
    projection?.directory_projection_authority !== 'app_state.agent_packages.directory.entries' ||
    projection?.status_projection_authority !== 'app_state.agent_packages.status_index' ||
    projection?.action_projection_authority !==
      'app_state.agent_packages.directory.entries[].available_actions[] + app_state.actions' ||
    projection?.presentation_source !== 'app_state.agent_packages.directory.entries' ||
    projection?.unknown_package_policy !== 'render_without_app_package_id_branch' ||
    projection?.manifest_lock_receipt_parser_allowed !== false ||
    projection?.action_id_allowlist_allowed !== false ||
    projection?.shell_consumption_policy !== 'generated_product_profile_only_no_renderer_literal'
  ) {
    throw new Error('Product profile must consume generic Framework Package projections without private metadata or lifecycle parsers');
  }
  for (const forbiddenField of [
    'starter_package_metadata',
    'first_party_manifest_fixture_dir',
    'external_registry_policy_ref',
    'directory_lifecycle_authority',
  ]) {
    if (forbiddenField in projection) {
      throw new Error(`Product profile must not restore private Package consumer field ${forbiddenField}`);
    }
  }
  const presentation = projection.catalog_presentation_policy;
  assertDeepEqualJson(
    presentation?.section_order,
    ['opl_managed', 'other_agents', 'other_capabilities'],
    'Product profile Agent catalog section order',
  );
  if (
    JSON.stringify(presentation?.ownership_classifier) !==
      JSON.stringify({
        source_fields: ['official', 'publisher'],
        opl_official: true,
        opl_publisher: 'one-person-lab',
        hardcoded_package_ids_allowed: false,
      }) ||
    JSON.stringify(presentation?.section_policy) !==
      JSON.stringify({
        opl_managed:
          'all dynamically identified OPL-owned Package roles, with standard Agents before workflow and capability Packages',
        other_agents: 'non-OPL standard Agents',
        other_capabilities: 'non-OPL workflow, capability, and unknown Package roles',
        availability_status_is_row_state_not_grouping: true,
      }) ||
    presentation?.standard_agent_name_policy !==
      'owner-projected invariant English brand name in every locale' ||
    presentation?.description_locale_policy !== 'active UI locale then owner-default fallback' ||
    JSON.stringify(presentation?.package_role_labels_i18n) !==
      JSON.stringify({
        standard_agent: { 'zh-CN': '专业智能体', 'en-US': 'Professional agent' },
        capability_package: { 'zh-CN': '能力包', 'en-US': 'Capability package' },
        workflow_profile: { 'zh-CN': '工作流配置', 'en-US': 'Workflow profile' },
      }) ||
    presentation?.raw_package_role_visible !== false ||
    presentation?.dependency_hierarchy?.source !==
      'app_state.agent_packages.status_index.packages[].dependent_guard.required_by_package_ids' ||
    presentation?.dependency_hierarchy?.direction !==
      'a_package_with_one_visible_required_by_package_id_is_nested_under_that_parent_package' ||
    presentation?.dependency_hierarchy?.single_parent_policy !==
      'render_once_as_a_compact_child_row_under_the_visible_parent' ||
    presentation?.dependency_hierarchy?.multiple_parent_policy !==
      'render_once_in_the_ownership-matched_capability_group_with_localized_parent_labels' ||
    presentation?.dependency_hierarchy?.missing_or_invisible_parent_policy !==
      'render_once_in_the_ownership-matched_capability_group' ||
    presentation?.dependency_hierarchy?.hardcoded_package_relationships_allowed !== false ||
    presentation?.dependency_hierarchy?.duplicate_rows_allowed !== false ||
    presentation?.dependency_hierarchy?.status_and_actions_source !==
      'unchanged_Framework_directory_and_status_index_projection' ||
    presentation?.developer_controls_disclosure?.default_state !== 'collapsed' ||
    JSON.stringify(presentation?.developer_controls_disclosure?.contains) !==
      JSON.stringify([
        'global_runtime_source',
        'authorized_repository_maintenance',
        'workspace_and_repository_protection_summary',
      ]) ||
    presentation?.developer_controls_disclosure?.ordinary_catalog_remains_visible_when_collapsed !== true
  ) {
    throw new Error('Product profile Agent catalog must use localized product ordering and projected dependency hierarchy');
  }
}

function validateProductProfileSettings(profile) {
  validateSettingsControlPlaneBehavior({ productProfile: profile });
  const queryFreeControlPlaneRedirects = Object.fromEntries(
    Object.entries(profile.settings.control_plane.legacy_route_redirects ?? {})
      .filter(([id]) => id !== 'about')
      .map(([id, target]) => [id, String(target).split('?')[0]]),
  );
  assertDeepEqualJson(
    profile.settings?.visible_tabs,
    profile.settings.control_plane.ordinary_visible_tabs,
    'Product profile ordinary settings visible tabs',
  );
  assertDeepEqualJson(
    profile.settings?.legacy_route_redirects,
    queryFreeControlPlaneRedirects,
    'Product profile legacy settings route redirects',
  );
  if (
    profile.settings?.control_plane?.source_contract_ref !==
    'contracts/app-gui-product-contract.json#settings_navigation'
  ) {
    throw new Error('Product profile settings.control_plane must project the App Settings control plane');
  }
  assertDeepEqualJson(
    profile.settings.control_plane.ordinary_visible_tabs,
    profile.settings?.visible_tabs,
    'Product profile settings.control_plane ordinary tabs',
  );
  assertDeepEqualJson(
    profile.settings.control_plane.ordinary_routes?.map((route) => route.id),
    profile.settings.control_plane.ordinary_visible_tabs,
    'Product profile settings.control_plane ordinary route ids',
  );
  assertDeepEqualJson(
    Object.fromEntries(
      Object.entries(profile.settings.control_plane.legacy_route_redirects ?? {})
        .filter(([id]) => id !== 'about')
        .map(([id, target]) => [id, String(target).split('?')[0]]),
    ),
    profile.settings?.legacy_route_redirects,
    'Product profile settings.control_plane legacy redirects',
  );
}

function validateProductProfileCodexSkills(profile) {
  for (const forbidden of [
    'tools',
    'ecosystem_modules',
    'management_authority',
    'upstream_packages',
    'official_codex_runtime_capabilities',
    'default_packaged_codex_skill_ids',
    'additional_package_skill_ids',
    'domain_plugin_skill_ids',
  ]) {
    if (forbidden in (profile.companion_payloads ?? {})) {
      throw new Error(`Product profile must not own capability inventory through companion_payloads.${forbidden}`);
    }
  }
}

function validateInstallUpdateTaxonomy(profile) {
  assertDeepEqualJson(
    profile.install_update_taxonomy?.public_software_objects,
    ['opl_base', 'opl_app', 'opl_packages'],
    'Product profile public software objects',
  );
  assertDeepEqualJson(
    profile.install_update_taxonomy?.managed_update_component_keys,
    ['opl_base', 'opl_app', 'opl_packages'],
    'Product profile managed update component keys',
  );
  assertDeepEqualJson(
    profile.install_update_taxonomy?.transaction_internal_state_ids,
    ['runtime_substrate', 'capability_packages', 'companion_tools', 'codex_surface', 'workflow_profile'],
    'Product profile transaction internal state ids',
  );
  assertDeepEqualJson(
    profile.install_update_taxonomy?.ordinary_ui_must_not_expose_as_peer_objects,
    [
      'app_binary',
      'runtime_toolchain',
      'agent_package_channel',
      'capability_exposure',
      'codex_cli_fallback',
      'runtime_substrate',
      'capability_packages',
      'companion_tools',
      'codex_surface',
      'workflow_profile',
    ],
    'Product profile forbidden peer software objects',
  );
  assertDeepEqualJson(
    profile.install_update_taxonomy?.internal_detail_fields,
    {
      opl_base: ['dependency_status', 'integration_status'],
      opl_app: ['host_update_route', 'host_executor_required'],
      opl_packages: ['current', 'conditions', 'owner_route', 'status_detail'],
    },
    'Product profile managed update internal detail fields',
  );
  if (profile.install_update_taxonomy?.ordinary_component_picker_allowed !== false) {
    throw new Error('Product profile ordinary component picker must be disabled');
  }
  if (
    profile.companion_payloads?.class !== 'opl_base_integrations' ||
    profile.companion_payloads?.opl_packages_projection_ref !== 'contracts/app-install-exposure-policy.json#exposure_classes.codex_surface' ||
    profile.companion_payloads?.opl_packages_lifecycle_ref !==
      'contracts/app-install-exposure-policy.json#agent_installation_contract.managed_package_distribution'
  ) {
    throw new Error('Product profile payloads must map Base integrations and Packages projection/lifecycle without peer updater classes');
  }
}

function validateOrdinaryCapabilitySelectorPolicy(profile) {
  const policy = profile.gui?.ordinary_capability_selector_policy;
  if (
    policy?.scope !== 'home_composer_and_ordinary_conversation' ||
    policy?.authority !== 'owner_or_carrier_skill_projection_and_mcp_negative_filter' ||
    policy?.palette_agent_catalog_source_ref !==
      'app_state.agent_packages.directory.entries' ||
    JSON.stringify(policy?.opl_standard_agent_membership_policy) !==
      JSON.stringify(appOwnedOplStandardAgentMembershipPolicy) ||
    policy?.palette_agent_status_source_ref !== 'app_state.agent_packages.status_index.packages[]' ||
    policy?.palette_agent_availability_policy !==
      'join_by_package_id_and_use_fresh_directory_installed_plus_status_index_presence.present_and_presence.callable' ||
    policy?.palette_agent_action_policy !== 'directory_available_actions_and_recommended_action_ref_only' ||
    policy?.palette_unknown_standard_agent_policy !==
      'include_unknown_package_ids_only_when_they_match_opl_standard_agent_membership' ||
    policy?.palette_required_agent_package_ids !== undefined ||
    JSON.stringify(policy?.palette_agent_group_label_i18n) !==
      JSON.stringify({ 'zh-CN': 'OPL 标准智能体', 'en-US': 'OPL standard agents' }) ||
    policy?.palette_home_shortcut_independence_policy !==
      'complete_opl_standard_agent_catalog_independent_of_home_shortcut_visibility_and_order' ||
    policy?.agent_owned_skill_deduplication_policy !==
      'exclude_rendered_professional_agent_required_skill_ids_from_home_new_session_standalone_skills' ||
    policy?.skill_source_ref !== 'owner_or_carrier_projected_capability_metadata_for_the_selected_package' ||
    policy?.conversation_loaded_skill_display_policy !==
      'preserve_owner_or_carrier_projected_loaded_skills' ||
    policy?.mcp_server_source_ref !== 'configured_user_and_third_party_mcp_servers' ||
    policy?.mcp_menu_policy !==
      'preserve_configured_user_and_third_party_servers_except_explicit_forbidden_matchers' ||
    policy?.conversation_loaded_mcp_display_policy !== 'preserve_non_forbidden_configured_servers' ||
    policy?.unmatched_mcp_policy !== 'preserve_end_to_end_without_app_allowlist_membership' ||
    Object.prototype.hasOwnProperty.call(policy, 'forbidden_skill_examples')
  ) {
    throw new Error('Product profile ordinary selector must use owner/carrier Skill projection and the MCP negative filter');
  }
  assertAgentReferenceAdmissionPolicy(
    policy.agent_reference_admission_policy,
    'Product profile Agent reference admission policy',
  );
  assertForbiddenCapabilityPolicy(
    policy,
    ordinaryForbiddenCapabilityPolicy,
    'Product profile ordinary forbidden MCP policy',
  );
  assertDeepEqualJson(
    policy.required_scrub_targets,
    [
      'mcp_servers entries matching forbidden_mcp_matchers',
      'mcp_statuses entries matching forbidden_mcp_matchers',
      'session_mcp_servers entries matching forbidden_mcp_matchers',
      'scrub_extra_keys',
    ],
    'Product profile ordinary Team scrub targets',
  );
  assertDeepEqualJson(
    policy.required_preservation_targets,
    [
      'mcp directory entries not matching forbidden_mcp_matchers',
      'mcp status entries not matching forbidden_mcp_matchers',
      'new conversation create payload mcp_servers not matching forbidden_mcp_matchers',
      'conversation snapshot mcp_servers and mcp_statuses not matching forbidden_mcp_matchers',
    ],
    'Product profile ordinary MCP preservation targets',
  );
  if (policy.conversation_snapshot_policy !== 'scrub_disabled_team_mcp_and_team_metadata_before_rendering_or_inheriting_ordinary_conversations') {
    throw new Error('Product profile ordinary selector must scrub disabled Team MCP snapshots');
  }
}

function validateFullFirstInstallCoreReadyPolicy(profile) {
  if (JSON.stringify(profile.first_run?.readiness_layers) !== JSON.stringify(['core'])) {
    throw new Error('Product profile ready_to_launch readiness_layers must contain only core');
  }
  const firstRunCoreItems = assertNonEmptyStringArray(
    profile.first_run?.ready_to_launch_gate?.required_core_items,
    'Product profile ready_to_launch required_core_items',
  );
  validateBeginnerFirstRunPresentation(
    profile.first_run?.beginner_presentation,
    'Product profile first-run beginner presentation',
    firstRunCoreItems,
  );
  for (const [field, expected] of Object.entries(focusedFirstRunPresentationPolicy)) {
    if (profile.first_run?.beginner_presentation?.[field] !== expected) {
      throw new Error(
        `Product profile first-run beginner presentation ${field} must be ${expected}`,
      );
    }
  }
  assertDeepEqualJson(
    profile.first_run?.beginner_presentation?.model_access_setup,
    firstRunModelAccessSetupPolicy,
    'Product profile first-run model access setup policy',
  );
  validateReadyToLaunchGate(profile, firstRunCoreItems);
  validateOfficialProfileFirstInstallPolicy(profile);
  validateFirstConversationPolicy(profile);
  validateFullFirstInstallBackgroundPolicy(profile);
  validateFirstRunProgressModel(profile);
}

function validateOfficialProfileFirstInstallPolicy(profile) {
  const execution = profile.official_profile?.first_install_execution;
  if (
    execution?.mode !== 'background_after_core_ready'
    || execution?.guid_navigation_blocking !== false
    || execution?.failure_scope !== 'package_local_nonblocking'
    || execution?.unknown_or_timeout_policy !== 'keep_guid_entry_available_and_report_background_attention'
    || execution?.retry_policy !== 'explicit_first_run_retry_or_settings_agents'
  ) {
    throw new Error('Product profile Official Profile first-install execution must remain background and non-blocking after Core ready');
  }
}

function validateReadyToLaunchGate(profile, firstRunCoreItems) {
  const launchGate = profile.first_run?.ready_to_launch_gate;
  if (
    launchGate?.id !== 'ready_to_launch' ||
    launchGate?.ui_order !== 'before_first_conversation_not_before_guid' ||
    launchGate?.guid_navigation_blocking !== false
  ) {
    throw new Error('Product profile ready_to_launch must gate first conversation without blocking /guid navigation');
  }
  for (const item of firstRunCoreItems) {
    if (!launchGate?.required_core_items?.includes(item)) {
      throw new Error(`Product profile ready_to_launch gate must require Core item ${item}`);
    }
  }
  for (const item of fullReadinessItems) {
    if (!launchGate?.must_not_require?.includes(item)) {
      throw new Error(`Product profile ready_to_launch gate must not require ${item}`);
    }
    if (!profile.first_run?.full_readiness_layers?.includes(item)) {
      throw new Error(`Product profile full readiness layers must include ${item}`);
    }
  }
  if (
    profile.first_run?.runtime_provider?.full_readiness_provider !== 'temporal'
    || profile.first_run.runtime_provider.ready_to_launch_blocking !== false
  ) {
    throw new Error('Product profile full runtime provider must stay Temporal and non-blocking for ready_to_launch');
  }
}

function validateFirstConversationPolicy(profile) {
  const firstConversation = profile.first_run?.first_conversation;
  const progressModel = profile.first_run?.progress_model;
  const firstConversationMustWaitFor = assertNonEmptyStringArray(
    firstConversation?.must_wait_for,
    'Product profile first conversation must_wait_for',
  );
  const requiredBeforePlainSend = assertNonEmptyStringArray(
    firstConversation?.required_before_plain_send,
    'Product profile first conversation required_before_plain_send',
  );
  const requiredBeforeSendWithLocalInputs = assertNonEmptyStringArray(
    firstConversation?.required_before_send_with_local_inputs,
    'Product profile first conversation required_before_send_with_local_inputs',
  );
  const requiredBeforeWorkspaceControls = assertNonEmptyStringArray(
    firstConversation?.required_before_workspace_controls,
    'Product profile first conversation required_before_workspace_controls',
  );
  if (typeof firstConversation?.failure_policy !== 'string' || !firstConversation.failure_policy.trim()) {
    throw new Error('Product profile first conversation must define a failure_policy');
  }
  assertFirstRunProgressModelShape(progressModel, 'Product profile first-run progress model');
  if (
    firstConversation?.gate !== 'capability_prerequisites_then_acp_warmup_before_initial_send' ||
    firstConversation?.runtime_readiness_method !== 'POST' ||
    firstConversation?.runtime_readiness_route !== '/api/conversations/<id>/runtime/ensure' ||
    firstConversation?.retired_route !== '/api/conversations/<id>/warmup' ||
    firstConversation?.route_failure_policy !== 'http_404_or_500_is_retryable_error_never_ready' ||
    firstConversation?.source_command !== progressModel.source_command ||
    firstConversation?.ready_to_launch_must_be_true !== false ||
    firstConversation?.unknown_readiness_policy !== 'allow_attempt_without_mutating_readiness' ||
    firstConversation?.blocked_feedback !== 'localized_inline_non_modal_setup_notice_preserves_prompt'
  ) {
    throw new Error('Product profile first conversation must apply granular prerequisites before ACP warmup');
  }
  const fullRuntimeQualification = profile.first_run?.full_runtime_package_qualification;
  if (
    fullRuntimeQualification?.source !== 'framework_resolved_selected_package_set' ||
    fullRuntimeQualification.reconciliation !== 'idempotent_selected_capability_reconciliation' ||
    fullRuntimeQualification.composition_policy !== 'open_composition_no_fixed_package_set' ||
    fullRuntimeQualification.readiness_policy !==
      'selected_capabilities_gate_only_their_dependent_features' ||
    fullRuntimeQualification.workspace_scoped_materialization_policy !==
      'package_cache_without_global_marketplace_registration_until_mas_workspace_binding' ||
    fullRuntimeQualification.global_workspace_scoped_exposure !== 'forbidden'
  ) {
    throw new Error('Product profile must enforce the Full runtime package qualification boundary');
  }
  assertDeepEqualJson(requiredBeforePlainSend, ['codex_cli', 'codex_config'], 'Product profile plain send prerequisites');
  assertDeepEqualJson(
    requiredBeforeSendWithLocalInputs,
    ['codex_cli', 'codex_config'],
    'Product profile send with local inputs prerequisites',
  );
  assertDeepEqualJson(
    requiredBeforeWorkspaceControls,
    ['workspace_root'],
    'Product profile workspace control prerequisites',
  );
  const ordinaryRecovery = profile.first_run?.ordinary_shell_recovery;
  const postLoginSetupCheck = ordinaryRecovery?.fresh_webui_login_setup_check;
  if (
    postLoginSetupCheck?.trigger !== 'successful_authenticated_webui_login_only' ||
    postLoginSetupCheck?.route_intent !== progressiveFirstRunRecoveryPolicy.fresh_webui_login_setup_check_intent ||
    postLoginSetupCheck?.state_source !== 'shared_opl_app_fast_state' ||
    postLoginSetupCheck?.known_incomplete_behavior !== 'replace_guid_with_first_run' ||
    postLoginSetupCheck?.ready_behavior !== 'keep_guid' ||
    postLoginSetupCheck?.unknown_timeout_or_read_failure_behavior !==
      progressiveFirstRunRecoveryPolicy.fresh_webui_login_unknown_policy ||
    postLoginSetupCheck?.ui_timeout_ms !== progressiveFirstRunRecoveryPolicy.fresh_webui_login_ui_timeout_ms ||
    postLoginSetupCheck?.ordinary_startup_refresh_and_deep_link_behavior !==
      'keep_guid_without_automatic_first_run' ||
    postLoginSetupCheck?.consumption_policy !== 'one_shot' ||
    ordinaryRecovery?.persistent_setup_entry?.target_route !== '/first-run' ||
    ordinaryRecovery?.persistent_setup_entry?.surface !== 'ordinary_sidebar_non_modal_entry' ||
    ordinaryRecovery?.persistent_home_composer_runtime_alert !==
      'forbidden_use_sidebar_and_send_scoped_inline_recovery_only' ||
    ordinaryRecovery?.plain_conversation?.workspace_root_required !== false ||
    ordinaryRecovery?.plain_conversation?.must_preserve_prompt !== true ||
    ordinaryRecovery?.send_scoped_local_inputs?.workspace_root_required !== false ||
    ordinaryRecovery?.workspace_controls?.plain_conversation_remains_available !== true ||
    ordinaryRecovery?.workspace_controls?.send_scoped_local_inputs_remain_available !== true ||
    ordinaryRecovery?.unknown_readiness_policy !== 'do_not_synthesize_failure_or_mutate_readiness'
  ) {
    throw new Error('Product profile ordinary shell recovery policy is invalid');
  }
  assertDeepEqualJson(
    ordinaryRecovery.plain_conversation.required_items,
    ['codex_cli', 'codex_config'],
    'Product profile ordinary plain conversation prerequisites',
  );
  assertDeepEqualJson(
    ordinaryRecovery.send_scoped_local_inputs.required_items,
    ['codex_cli', 'codex_config'],
    'Product profile ordinary send-scoped local input prerequisites',
  );
  assertDeepEqualJson(
    ordinaryRecovery.send_scoped_local_inputs.supported_inputs,
    progressiveFirstRunRecoveryPolicy.send_scoped_local_input_surfaces,
    'Product profile ordinary send-scoped local input surfaces',
  );
  assertDeepEqualJson(
    ordinaryRecovery.workspace_controls.required_items,
    ['workspace_root'],
    'Product profile ordinary workspace control prerequisites',
  );
  assertDeepEqualJson(
    ordinaryRecovery.workspace_controls.restricted_capabilities,
    progressiveFirstRunRecoveryPolicy.workspace_restricted_capabilities,
    'Product profile ordinary workspace-restricted capabilities',
  );
  assertIncludesAll(
    firstConversation.must_wait_for,
    firstConversationMustWaitFor,
    'Product profile first conversation wait-for items',
  );
  assertIncludesAll(
    firstConversation.must_not_wait_for,
    fullReadinessItems,
    'Product profile first conversation non-blocking readiness items',
  );
}

function validateFullFirstInstallBackgroundPolicy(profile) {
  const fullFirstInstall = profile.first_run?.core_ready_policy?.full_first_install_clean_machine;
  for (const tool of requiredHostTools) {
    if (!fullFirstInstall?.missing_host_tools_allowed?.includes(tool)) {
      throw new Error(`Product profile Full first-install policy must allow missing ${tool}`);
    }
  }
  if (fullFirstInstall?.initial_runtime_source !== 'bundled_runtime' || fullFirstInstall?.core_ready_without_host_tools !== true) {
    throw new Error('Product profile Full first-install must reach Core ready through bundled_runtime without host tools');
  }
  for (const blocker of deferredMaintenanceItems) {
    if (!fullFirstInstall?.must_not_block_core_ready?.includes(blocker)) {
      throw new Error(`Product profile Full first-install must not block Core ready on ${blocker}`);
    }
    if (!profile.first_run?.background_maintenance?.items?.includes(blocker)) {
      throw new Error(`Product profile background maintenance must include ${blocker}`);
    }
  }
  if (profile.first_run?.background_maintenance?.blocks_core_ready !== false) {
    throw new Error('Product profile background maintenance must not block Core ready');
  }
  if (
    profile.first_run?.background_maintenance?.mode !== 'best_effort_after_core_ready'
    || profile.first_run?.background_maintenance?.continues_after_core_ready !== true
  ) {
    throw new Error('Product profile background maintenance must continue best-effort after Core ready');
  }
  if (
    fullFirstInstall?.post_core_ready_background_policy?.mode !== 'best_effort_non_blocking'
    || fullFirstInstall?.post_core_ready_background_policy?.continues_after_core_ready !== true
  ) {
    throw new Error('Product profile Full first-install must continue best-effort maintenance after Core ready');
  }
  for (const blocker of deferredMaintenanceItems) {
    if (!fullFirstInstall?.post_core_ready_background_policy?.managed_items?.includes(blocker)) {
      throw new Error(`Product profile Full first-install post-Core maintenance must manage ${blocker}`);
    }
  }
}

function validateFirstRunProgressModel(profile) {
  assertFirstRunProgressModelShape(profile.first_run?.progress_model, 'Product profile first-run progress model');
}

function validateStandardPackagePolicy(profile) {
  const standardPackage = profile.first_run?.core_ready_policy?.standard_package;
  if (
    standardPackage?.bootstrap_owner !== 'app_managed'
    || standardPackage?.maintenance_owner !== 'app_managed'
    || standardPackage?.user_first_screen_terminal_instruction_allowed !== false
    || standardPackage?.manual_host_tool_install_terminal_state_allowed !== false
    || standardPackage?.maintenance_resolution_policy !== 'app_or_cli_managed_best_effort_until_ready'
  ) {
    throw new Error('Product profile standard package must use App-managed bootstrap/maintenance without terminal-install end states');
  }
  for (const forbidden of ['install_homebrew_first', 'install_node_first', 'install_git_first']) {
    if (!standardPackage?.forbidden_terminal_instruction_end_states?.includes(forbidden)) {
      throw new Error(`Product profile standard bootstrap must forbid ${forbidden}`);
    }
  }
}

function validateCommandLineToolsPolicy(profile) {
  if (profile.first_run?.command_line_tools?.installer_command !== 'xcode-select --install') {
    throw new Error('Product profile CLT installer command must be xcode-select --install');
  }
  if (profile.first_run?.command_line_tools?.system_installer_only !== true) {
    throw new Error('Product profile CLT installer must use the macOS system installer path');
  }
  if (profile.first_run?.command_line_tools?.waits_for_user_confirmation !== true) {
    throw new Error('Product profile CLT installer must wait for user confirmation');
  }
}

function validateStandardUpdatePolicy(profile) {
  assertDeepEqualJson(
    profile.first_run?.updates?.standard_channel?.metadata_scope,
    ['latest-mac.yml', 'latest-arm64-mac.yml'],
    'Product profile Standard updater metadata bridge',
  );
  if (
    profile.first_run?.updates?.standard_channel?.implementation_reference !== 'electron_autoUpdater_background_download_update_downloaded_restart_prompt'
    || profile.first_run?.updates?.standard_channel?.ready_prompt !== 'prompt_restart_after_download_ready'
    || profile.first_run?.updates?.standard_channel?.full_first_install_metadata_allowed !== false
    || profile.first_run?.updates?.standard_channel?.download_policy !== 'background_download'
    || profile.first_run?.updates?.standard_channel?.apply_policy !== 'restart_when_ready'
    || profile.first_run?.updates?.standard_channel?.blocks_core_ready !== false
  ) {
    throw new Error('Product profile standard updates must download in background, prompt restart after ready, exclude Full metadata, and not block Core ready');
  }
}

function validateCompanionPayloadAuthority(profile, installExposurePolicy) {
  if (profile.companion_payloads?.install_exposure_policy_ref !== 'contracts/app-install-exposure-policy.json') {
    throw new Error('Product profile companion payloads must reference app-install-exposure-policy.json');
  }
  if (profile.companion_payloads?.exposure_classes_ref !== 'contracts/app-install-exposure-policy.json#exposure_classes') {
    throw new Error('Product profile companion payloads must reference install exposure classes');
  }
  if (profile.companion_payloads?.public_abi?.primary_semantic_entry !== installExposurePolicy.public_abi?.primary_semantic_entry) {
    throw new Error('Product profile companion payload public ABI must match install exposure primary semantic entry');
  }
  if (profile.companion_payloads.public_abi.preferred_app_distribution !== 'plugin_packaged_skill') {
    throw new Error('Product profile companion payloads must prefer plugin-packaged skills for the App path');
  }
  if (profile.companion_payloads.public_abi.plugin_must_not_create_second_semantics !== true) {
    throw new Error('Product profile companion payloads must forbid second semantics from plugin packaging');
  }
  if (profile.companion_payloads.public_abi.cli_and_app_share_skill_semantics !== true) {
    throw new Error('Product profile companion payloads must keep CLI and App on shared skill semantics');
  }
  const strategy = profile.companion_payloads?.capability_strategy_consumer;
  if (
    strategy?.strategy_authority !== 'opl-flow'
    || strategy.compiler_authority !== 'opl-framework'
    || strategy.runtime_projection_ref !==
      'app_state.agent_packages.status_index.packages.opl-flow.capability_strategy'
    || strategy.full_build_lock_kind !== 'opl_flow_capability_build_lock.v1'
    || strategy.app_policy_inventory_allowed !== false
    || strategy.app_direct_workflow_policy_parse_allowed !== false
  ) {
    throw new Error('Product profile must consume the Framework-compiled OPL Flow capability strategy');
  }
  assertIncludesAll(
    profile.companion_payloads?.domain_modules,
    ['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-meta-agent', 'opl-bookforge'],
    'Product profile domain module composition',
  );
  if (profile.companion_payloads.domain_plugin_skills_must_not_be_companion_mirrors !== true) {
    throw new Error('Product profile domain plugin skills must not be companion skill mirrors');
  }
}

function validateProductProfileBoundary(profile) {
  for (const forbidden of forbiddenAuthorityOwners) {
    if (!profile.boundary?.app_does_not_own?.includes(forbidden)) {
      throw new Error(`Product profile boundary must exclude ${forbidden}`);
    }
  }
}

export function validateProductProfile(
  profile,
  installExposurePolicy,
) {
  validateProductProfileIdentity(profile);
  validateProductProfileContractRefs(profile);
  validateDeliveryTopology(profile);
  validateClientRendererCompatibility(profile);
  validateProductProfileCodexDefaults(profile);
  assertOfficialProfileShape(profile.official_profile, 'Product profile Official Profile');
  validateAgentPackageRegistryProjection(profile);
  validateFullFirstInstallCoreReadyPolicy(profile);
  validateStandardPackagePolicy(profile);
  validateCommandLineToolsPolicy(profile);
  validateStandardUpdatePolicy(profile);
  validateCompanionPayloadAuthority(profile, installExposurePolicy);
  validateScheduledTasksProfileProjection(profile.companion_payloads?.native_automation);
  validateProductProfileBoundary(profile);
}
