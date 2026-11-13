import type {
  AppDeliveryTopology,
  AppReleaseRoles,
  AppRuntimeForm,
} from './types-parts/architecture.ts';
import type { AppGuiCapabilitiesProfile } from './types-parts/gui-capabilities.ts';
import type { AppGuiConversationProfile } from './types-parts/gui-conversation.ts';
import type { AppGuiHomeProfile } from './types-parts/gui-home.ts';
import type { AppCodexProfile } from './types-parts/codex.ts';
import type { AppFirstRunProfile } from './types-parts/first-run.ts';

export type {
  AppDeliveryTopology,
  AppReleaseRoles,
  AppRuntimeForm,
  OplStandardAgentMembershipPolicy,
} from './types-parts/architecture.ts';

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
    transport_binding_migration_state: 'framework_transport_binding_projection_and_studio_source_e2e_completed';
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
        post_launch_dependency_payloads?: {
          excluded_from_installer: string[];
          installation: string;
          before_domain_use: string;
          blocks_core_startup: false;
        };
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
    home: AppGuiHomeProfile;
    ordinary_conversation: AppGuiConversationProfile;
    right_context_inspector: AppGuiCapabilitiesProfile['right_context_inspector'];
    ordinary_capability_selector_policy: AppGuiCapabilitiesProfile['ordinary_capability_selector_policy'];
    agent_package_registry: AppGuiCapabilitiesProfile['agent_package_registry'];
  };
  codex: AppCodexProfile;
  first_run: AppFirstRunProfile;
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
