import { assertDeepEqualJson, assertForbiddenCapabilityPolicy, assertIncludesAll, readJson } from './assertions.ts';
import {
  appActionRoute,
  appOwnedSettingsAboutUpdaterStatePolicy,
  appOwnedAgentPackageOrdinaryStatusInputMapping,
  appOwnedAgentPackageUserStatusProjection,
  appOwnedOplStandardAgentMembershipPolicy,
  appOwnedSettingsResourcesBrowserEntry,
  appOwnedSettingsCapabilitiesTabContract,
  appOwnedSettingsManagedDependencySummary,
  appOwnedSettingsResourceActionBehavior,
  appOwnedStorageCarrierBehavior,
  appOwnedOrdinaryForbiddenCapabilityPolicy,
  appOwnedWebuiDataVolumeHostActionAbiRef,
  appOwnedWebuiDataVolumeHostActionCapabilityId,
  appOwnedTaskAwarenessRefFields,
  firstRunModelAccessSetupPolicy,
  focusedFirstRunPresentationPolicy,
  homeActivityCenterForbiddenDisplays,
  progressiveFirstRunRecoveryPolicy,
  progressiveFirstRunRecoveryTestIds,
} from './app-contract-constants.ts';
import { validateGuiFrameworkSurfaces } from './gui-framework-surfaces-validator.ts';
import { validateGuiProductHomeContract } from './gui-product-home-validator.ts';
import { assertCommandSurface } from './value-helpers.ts';
import {
  assertAgentReferenceAdmissionPolicy,
  assertHomeComposerDynamicAuthority,
  assertHomeComposerStateContract,
} from '../app-product-profile-shared-validators.ts';
import {
  validateEnvironmentModuleMaintenanceEntry,
} from './managed-update-plane-validator.ts';
import { productProfilePath, settingsControlPlanePath } from './validation-config.ts';
import { validateSettingsControlPlaneBehavior } from './settings-control-plane-validator.ts';
import {
  validateRuntimeCockpitPreservationPolicy,
} from './runtime-cockpit-product-validator.ts';
import {
  assertNonEmptyStringArray,
  validateBeginnerFirstRunPresentation,
  validateOplFlowContext,
  validateRefLevelFollowUpProjectionContract,
  validateStructuredResultPanelProjectionContract,
  validateTaskAwarenessProjectionContract,
  validateWorkflowSkillCandidateProjectionContract,
  assertFirstRunProgressModelMatches,
} from './shared-contract-validators.ts';

export const appOwnedOfficialProfileRestoreAction = {
  id: 'official_profile_restore',
  owner: 'one-person-lab-app',
  surface: 'settings_agents_secondary_action',
  scope: 'whole_official_profile',
  confirmation_required: true,
  invocation_policy: 'explicit_user_confirmation_only',
  request: {
    bridge: 'ipcBridge.oplRuntime.applyOfficialProfile',
    helper: 'official-profile-package-apply',
    payload: { intent: 'explicit_restore' },
  },
  desired_roots_source_ref: 'contracts/app-product-profile.json#official_profile.desired_root_package_ids',
  framework_projected_single_package_action: false,
  automatic_invocation: {
    app_startup_or_restart: false,
    daily_maintenance: false,
    app_update_or_carrier_change: false,
  },
  persistence: {
    desired_state_saved: false,
    startup_maintenance_registered: false,
    automatic_reapply_allowed: false,
  },
  post_success_readback: {
    source: 'opl app state --profile fast --json',
    force_fresh: true,
  },
  required_dom_testid: 'settings-agents-restore-official-profile',
};

function validateDynamicHomeComposerStateContract(value, label) {
  assertHomeComposerDynamicAuthority(value, label);
  assertHomeComposerStateContract(value, label);
}
import {
  validateScheduledTasksPageContract,
  validateScheduledTasksProductPolicy,
} from './scheduled-tasks-policy-validator.ts';

const storageAvailabilityPresentationVariants = {
  web_statistics_not_connected: {
    condition: 'webui_has_no_valid_owner_storage_projection_and_no_explicit_error',
    severity: 'info',
    title_intent: 'current_web_version_cannot_display_storage_usage',
    required_explanation: [
      'browser_access_context',
      'deployment_not_connected_to_storage_statistics_service',
      'existing_data_and_other_features_unaffected',
    ],
    visible_action: {
      id: 'view_deployment_status',
      route: '/settings/environment?section=services',
    },
    retry_visible: false,
  },
  operational_failure: {
    condition: 'explicit_permission_service_ipc_or_unknown_error',
    severity: 'warning',
    localized_reason_required: true,
    recovery_action_required: true,
    retry_policy: 'show_only_when_action_rechecks_the_failed_source',
    technical_details_default: 'collapsed',
  },
};

const storageUserVisibleImplementationTermsForbidden = [
  'desktop storage carrier',
  'owner projection',
  'carrier host',
];

const aionuiTeamProbeIds = [
  'team_mode_disabled',
  'team_route_redirect',
  'team_sidebar_gate',
  'team_created_redirect_noop',
  'ordinary_conversation_team_snapshot_scrub',
  'agent_switching_drops_team_mcp',
  'team_deep_link_not_whitelisted',
  'team_bridge_mutation_gate',
];
const productProfile = readJson(productProfilePath);
const settingsControlPlane = readJson(settingsControlPlanePath);
const expectedFirstRunProgressModel = productProfile.first_run?.progress_model;
const expectedFirstRunCoreItems = assertNonEmptyStringArray(
  productProfile.first_run?.ready_to_launch_gate?.required_core_items,
  'Product profile ready_to_launch required_core_items',
);
const expectedFullReadinessItems = (productProfile.first_run?.full_readiness_layers ?? [])
  .filter((item) => item !== 'core');

function validateCodexModelPolicy(guiContract) {
  const executorPolicy = guiContract.executor_policy ?? {};
  const productHome = productProfile.gui?.home ?? {};
  assertDeepEqualJson(
    {
      default_model: executorPolicy.default_model,
      default_reasoning_effort: executorPolicy.default_reasoning_effort,
      default_model_display_value: executorPolicy.default_model_display_value,
      home_model_status_label: executorPolicy.home_model_status_label,
      home_model_status_label_en: executorPolicy.home_model_status_label_en,
      auto_model_policy_source_ref: executorPolicy.auto_model_policy_source_ref,
      display_policy: executorPolicy.model_display_options_policy?.display_policy,
      button_label_policy: executorPolicy.model_display_options_policy?.button_label_policy,
      reasoning_menu_title_zh: executorPolicy.model_display_options_policy?.reasoning_menu_title_zh,
      reasoning_menu_title_en: executorPolicy.model_display_options_policy?.reasoning_menu_title_en,
      reasoning_effort_override_surface:
        executorPolicy.model_display_options_policy?.reasoning_effort_override_surface,
      model_menu_policy: executorPolicy.model_display_options_policy?.model_menu_policy,
      menu_structure: executorPolicy.model_display_options_policy?.menu_structure,
      user_reasoning_effort_options: executorPolicy.model_display_options_policy?.user_reasoning_effort_options,
      known_visible_models_follow_frontier_preference_order:
        executorPolicy.model_display_options_policy?.known_visible_models_follow_frontier_preference_order,
      unknown_catalog_default_must_remain_visible_in_auto:
        executorPolicy.model_display_options_policy?.unknown_catalog_default_must_remain_visible_in_auto,
    },
    {
      default_model: productProfile.codex?.default_model,
      default_reasoning_effort: productProfile.codex?.default_reasoning_effort,
      default_model_display_value: productHome.codex_home_model_status_label,
      home_model_status_label: productHome.codex_home_model_status_label,
      home_model_status_label_en: productHome.codex_home_model_status_label_en,
      auto_model_policy_source_ref: productHome.codex_auto_model_selection?.policy_source_ref,
      display_policy: productHome.codex_model_display_options?.display_policy,
      button_label_policy: productHome.codex_model_display_options?.button_label_policy,
      reasoning_menu_title_zh: productHome.codex_model_display_options?.reasoning_menu_title_zh,
      reasoning_menu_title_en: productHome.codex_model_display_options?.reasoning_menu_title_en,
      reasoning_effort_override_surface: productHome.codex_model_display_options?.reasoning_effort_override_surface,
      model_menu_policy: productHome.codex_model_display_options?.model_menu_policy,
      menu_structure: productHome.codex_model_display_options?.menu_structure,
      user_reasoning_effort_options: productHome.codex_model_display_options?.user_reasoning_effort_options,
      known_visible_models_follow_frontier_preference_order: true,
      unknown_catalog_default_must_remain_visible_in_auto: true,
    },
    'App GUI Codex model policy',
  );
}

function validateVisualTokenBindings(guiContract) {
  const visualTarget = guiContract.interaction_baseline?.visual_target;
  const lightRail = visualTarget?.light_surfaces?.navigation_rail;
  const darkRail = visualTarget?.dark_surfaces?.navigation_rail;
  const bindings = visualTarget?.shell_token_bindings;
  assertDeepEqualJson(
    bindings?.navigation_rail,
    {
      css_variable: '--opl-sidebar-bg',
      light_css_value: 'var(--dsw-specific-sidebar-fill)',
      dark_css_value: 'var(--dsw-specific-sidebar-fill)',
      surface_selector: '.layout-sider.arco-layout-sider',
      surface_background_value: 'var(--opl-sidebar-bg)',
      layout_background_utility_allowed: false,
    },
    'App GUI navigation rail shell token binding',
  );
  assertDeepEqualJson(
    bindings?.text_semantics,
    {
      uno_t_primary_value: 'var(--text-primary)',
      uno_t_tertiary_value: 'var(--color-text-3)',
      text_primary_bridge_value: 'var(--dsw-alias-label-primary)',
      body_color_value: 'var(--text-primary)',
    },
    'App GUI shell text semantic token binding',
  );
  if (
    typeof lightRail !== 'string' ||
    typeof darkRail !== 'string' ||
    lightRail.toLowerCase() !== bindings.navigation_rail.light_css_value ||
    darkRail.toLowerCase() !== bindings.navigation_rail.dark_css_value
  ) {
    throw new Error('App GUI shell rail token values must project the visual surface authority exactly');
  }
}
function validateManagedUpdatePageSurface(page, label) {
  validateManagedUpdatePageBasics(page, label, {
    actionSourceError: `${label} must expose managed update actions through the shell IPC bridge`,
  });
  validateManagedUpdatePlaneBinding(page?.managed_update_plane, label, {
    requirePageId: true,
    requireStateSources: true,
    requireStatusConsumptionPolicy: true,
    bindingError: `${label} must bind to the App managed update plane as a status/action consumer`,
  });
}

function validateReadOnlyStorageLifecycleSurface(surface, label) {
  if (
    surface?.role !== 'read_only_storage_lifecycle_product_surface' ||
    surface.app_role !== 'display_only_consumer_of_opl_mas_read_model_refs' ||
    surface.source_policy !== 'consume_opl_mas_read_model_refs_from_app_state_or_framework_projection_only'
  ) {
    throw new Error(`${label} must be a read-only OPL/MAS read-model consumer`);
  }
  assertIncludesAll(
    surface.source_refs,
    [
      'OPL App state storage lifecycle refs',
      'MAS read-model lifecycle refs when a study/workspace exposes them',
      'runtime compact dry-run refs from OPL Framework projections',
      'completed-project closeout refs from OPL/MAS projections',
    ],
    `${label} source refs`,
  );
  assertIncludesAll(
    surface.display_planes,
    [
      'data_lifecycle_planes',
      'large_body_refs',
      'small_file_pressure_refs',
      'runtime_compact_dry_run_refs',
      'completed_project_closeout_refs',
      'forbidden_generic_cleanup_boundary',
    ],
    `${label} display planes`,
  );
  assertIncludesAll(
    surface.required_ref_fields,
    [
      'plane_id',
      'label',
      'summary',
      'size_or_pressure_ref',
      'recommended_action_ref',
      'dry_run_ref',
      'closeout_ref',
      'authority_boundary',
    ],
    `${label} required ref fields`,
  );
  for (const [field, expected] of Object.entries({
    sqlite_access: 'forbidden',
    file_delete: 'forbidden',
    data_authority_owner: 'OPL Framework and domain owners',
    app_authority: 'read_model_display_only',
    generic_cleanup_policy: 'forbidden_without_owner_ref_and_dry_run_or_closeout_ref',
  })) {
    if (surface.authority_boundary?.[field] !== expected) {
      throw new Error(`${label} authority_boundary.${field} must be ${expected}`);
    }
  }
  assertIncludesAll(
    surface.must_not_read,
    [
      'SQLite files directly',
      'domain artifact bodies',
      'raw runtime private ledgers',
      'workspace filesystem trees to infer cleanup candidates',
    ],
    `${label} must_not_read`,
  );
  assertIncludesAll(
    surface.must_not_write,
    [
      'SQLite files',
      'runtime or domain truth',
      'owner receipts',
      'typed blockers',
      'filesystem deletes or cleanup execution',
    ],
    `${label} must_not_write`,
  );
}

function validateAgentPackageLifecycleUx(surface, label) {
  if (
    surface?.requirement_scope !== 'product_requirement_not_runtime_authority' ||
    surface.primary_state_surface !== 'app_state.agent_packages.directory.entries + app_state.agent_packages.status_index' ||
    surface.runtime_source_surface !== 'app_state.runtime_source_carriers.items[]' ||
    surface.action_ref_source !== 'app_state.actions' ||
    surface.action_route !== appActionRoute
  ) {
    throw new Error(label + ' must consume the generic Framework Package directory and action projection');
  }
  for (const forbiddenField of ['fallback_state_surface', 'fallback_policy', 'receipt_physical_surface_detail_policy']) {
    if (forbiddenField in surface) {
      throw new Error(label + ' must not restore private Package fallback or lifecycle detail field ' + forbiddenField);
    }
  }

  const directory = surface.directory_collection_contract;
  if (
    directory?.source !== 'app_state.agent_packages.directory.entries' ||
    directory.collection_owner !== 'one-person-lab' ||
    directory.consumer_policy !==
      'render every projected entry without a shell allowlist, first-party seed, or installed-only filter' ||
    directory.first_party_policy !==
      'first-party and third-party packages use the same directory entries and action contract' ||
    'static_metadata_overlay_source' in directory ||
    'static_metadata_overlay_policy' in directory ||
    'static_metadata_overlay_fields' in directory
  ) {
    throw new Error(label + ' must use owner-projected directory presentation without App metadata overlays');
  }
  assertIncludesAll(
    directory.required_entry_fields,
    ['package_id', 'display_name', 'description', 'package_role', 'installed', 'readiness', 'recommended_action_ref', 'available_actions'],
    label + ' generic directory entry fields',
  );
  assertDeepEqualJson(
    surface.ordinary_user_status_input_mapping,
    appOwnedAgentPackageOrdinaryStatusInputMapping,
    label + ' ordinary user status input mapping',
  );
  assertDeepEqualJson(
    surface.user_facing_status_projection,
    appOwnedAgentPackageUserStatusProjection,
    label + ' user-facing status projection',
  );

  const controls = surface.directory_controls;
  if (
    controls?.row_actions_source !== 'directory.entries[].available_actions[]' ||
    controls.row_action_policy !==
      'render every complete Framework-projected Settings action without an App or Shell action-id allowlist' ||
    controls.catalog_search_is_settings_global_search !== false ||
    'row_actions' in controls
  ) {
    throw new Error(label + ' must render projected Settings actions without a fixed action list');
  }

  const actionContract = surface.canonical_action_contract;
  assertDeepEqualJson(
    actionContract?.required_action_fields,
    ['action_id', 'action_ref', 'semantic', 'surface', 'payload', 'required_payload_fields', 'confirmation_required'],
    label + ' projected action fields',
  );
  if (
    actionContract?.semantic_policy !==
      'render generic Framework-projected semantics and accept custom without mapping package ids or private lifecycle verbs' ||
    actionContract.surface_policy !== 'Settings executes only actions projected for the settings surface' ||
    actionContract.shell_action_inference_allowed !== false
  ) {
    throw new Error(label + ' must keep action semantic, surface, payload, and confirmation Framework-projected');
  }
  assertDeepEqualJson(
    surface.manual_agent_install_entry,
    {
      source: 'app_state.actions[action_id=install_from_manifest_url]',
      destination: 'settings.agents.catalog',
      visibility_policy: 'show_only_when_the_current_App_action_declares_manifest_url_and_trust_tier_with_dry_run_and_confirmation',
      input_fields: ['manifest_url', 'trust_tier'],
      trust_tier_policy: 'user_explicit_third_party_unverified_or_third_party_verified',
      execution_policy: 'submit_the_current_projected_App_action_then_refresh_fast_state',
      directory_policy: 'this_is_a_manual_entry_point_not_a_directory_row_or_static_package_registry',
      lifecycle_authority: 'configured_native_carrier_readback_only',
    },
    label + ' manual Agent install entry',
  );

  const projection = surface.package_projection_contract;
  if (
    projection?.schema !== 'opl_app_package_consumer_projection.v1' ||
    projection.directory_collection_source !== 'app_state.agent_packages.directory.entries' ||
    projection.action_semantics_policy !==
      'Framework projects semantic and surface; App and Shell do not maintain action-id or Package-id allowlists' ||
    !projection.projected_action_fields?.includes('semantic') ||
    !projection.projected_action_fields?.includes('surface')
  ) {
    throw new Error(label + ' must define the generic Package consumer projection');
  }
  assertIncludesAll(
    projection.forbidden_private_fields,
    ['manifest', 'package_lock_ref', 'materialization_readiness', 'lifecycle_receipt_ref', 'receipt_refs', 'rollback_ref', 'physical_surface', 'last_known_good'],
    label + ' forbidden private lifecycle fields',
  );

  const interaction = surface.consistent_action_interaction;
  if (
    interaction?.action_source !== 'directory.entries[].available_actions[]' ||
    interaction.action_id_allowlist_allowed !== false ||
    interaction.semantic_source !== 'directory.entries[].available_actions[].semantic' ||
    interaction.surface_policy !== 'execute only complete actions projected for the settings surface'
  ) {
    throw new Error(label + ' must forward projected actions without a private lifecycle action map');
  }
  if ('workspace_activation_contract' in surface) {
    throw new Error(label + ' must not restore a private Package activation contract');
  }

  const { package_projection_contract: _declarativeForbiddenFieldPolicy, ...consumerSurface } = surface;
  const serialized = JSON.stringify(consumerSurface);
  for (const forbidden of [
    'starter_package_metadata',
    'first_party_manifest_fixture_dir',
    'package_lock_receipt',
    'lifecycle_receipt_ref',
    'action_receipt_ref',
    'rollback_ref',
  ]) {
    if (serialized.includes(forbidden)) {
      throw new Error(label + ' must not parse private Package lifecycle field ' + forbidden);
    }
  }
}

function validateDesktopTrayPolicy(guiContract) {
  const trayPolicy = guiContract.desktop_tray_policy;
  const iconPolicy = trayPolicy?.icon_policy;
  assertDeepEqualJson(
    iconPolicy,
    {
      macos_asset_role: 'dedicated_monochrome_geometric_template_image',
      macos_brand_motif: 'opl_segmented_workflow_orbit_with_single_person_core',
      macos_base_point_size: 16,
      macos_scale_factors: [1, 2],
      macos_template_image_required: true,
      macos_transparency_required: true,
      macos_color_policy: 'black_alpha_mask_only',
      macos_forbidden_source: 'scaled_full_color_application_icon',
      other_platforms: 'retain_application_icon_unless_platform_specific_asset_is_defined',
    },
    'App GUI desktop tray icon policy',
  );
}

function validateDesktopApplicationIconPolicy(guiContract) {
  assertDeepEqualJson(
    guiContract.theme_and_branding?.desktop_app_icon_policy,
    {
      source_asset: 'active_shell/resources/icon.png',
      source_artwork_unchanged: true,
      macos_canvas_px: 1024,
      macos_alpha_threshold_percent: 50,
      macos_expected_alpha_bounds: '824x824+100+100',
      macos_safe_margin_required: true,
      macos_derived_assets: [
        'active_shell/resources/app.png',
        'active_shell/resources/app_dev.png',
        'active_shell/resources/app.icns',
        'packaged .app Contents/Resources/icon.icns',
      ],
      pwa_and_in_app_brand_assets_unchanged: true,
    },
    'App GUI desktop application icon policy',
  );
}

export function validateBrandedDeepLinkPolicy(policy) {
  assertDeepEqualJson(
    policy,
    {
      schema: 'opl_app_branded_deep_link.v1',
      carrier_scope: 'desktop_shell_only',
      scheme: 'opl',
      accepted_schemes: ['opl'],
      legacy_scheme_policy:
        'reject_unless_an_explicit_compatibility_contract_and_live_evidence_are_added',
      action_authority: 'url_hostname_only_with_empty_path',
      allowed_actions: ['navigate'],
      action_schemas: {
        navigate: {
          required_params: ['route'],
          optional_params: [],
          additional_params_allowed: false,
          duplicate_params_allowed: false,
          route_value_policy: 'single_url_decoded_absolute_app_path',
        },
      },
      forbidden_credential_actions: ['add-provider', 'provider/add'],
      forbidden_parameter_names: [
        'data',
        'api_key',
        'apikey',
        'authorization',
        'credential',
        'key',
        'password',
        'secret',
        'token',
      ],
      secret_like_value_prefixes: ['Bearer ', 'eyJ', 'ghp_', 'github_pat_', 'sk-'],
      opaque_payload_policy: 'base64_json_and_other_encoded_payloads_are_forbidden',
      validation_layers: {
        main_process:
          'validate_scheme_action_path_query_cardinality_and_secret_policy_before_queue_or_emit',
        renderer: 'validate_route_against_app_owned_exact_route_registry_before_navigation',
      },
      route_registry: {
        static_exact_routes: ['/guid', '/archived', '/scheduled'],
        settings_route_source_ref:
          'contracts/app-settings-control-plane.json#ordinary_routes+secondary_pages',
        settings_route_fields: ['ordinary_routes[].path', 'secondary_pages[].path'],
        match_policy: 'exact_path_only_no_query_hash_or_dynamic_segments',
        forbidden_route_classes: [
          'conversation_id',
          'runtime',
          'first_run',
          'authentication',
          'extension',
          'test_or_developer',
        ],
      },
      delivery_paths: [
        'cold_start_argv',
        'warm_macos_open_url',
        'second_instance_additional_data_or_argv',
      ],
      delivery_policy: 'all_delivery_paths_use_the_same_parser_and_validation_result',
      invalid_input_policy: {
        interaction: 'drop_only_the_invalid_link_and_keep_the_app_current_route_and_input_usable',
        logging: 'warn_with_reason_code_and_redacted_structure_only',
        raw_url_logging_allowed: false,
        parameter_value_logging_allowed: false,
        pending_invalid_state_allowed: false,
        global_startup_block_allowed: false,
      },
    },
    'App GUI branded deep-link policy',
  );

  const settingsRoutes = [
    ...(settingsControlPlane.ordinary_routes ?? []),
    ...(settingsControlPlane.secondary_pages ?? []),
  ].map((route) => route.path);
  if (
    settingsRoutes.length === 0 ||
    new Set(settingsRoutes).size !== settingsRoutes.length ||
    settingsRoutes.some(
      (route) =>
        typeof route !== 'string' ||
        !route.startsWith('/settings/') ||
        /[?#:]/.test(route),
    )
  ) {
    throw new Error('App Settings deep-link registry must contain unique exact /settings/* paths');
  }
}

export function validateAppGuiProductContract(guiContract, releaseChannel, installExposurePolicy) {
  if ('agent_package_activation_policy' in guiContract) {
    throw new Error('App GUI contract must not restore private Package activation authority');
  }
  validateBrandedDeepLinkPolicy(guiContract.branded_deep_link_policy);
  validateScheduledTasksProductPolicy(guiContract.scheduled_tasks_policy);
  validateScheduledTasksPageContract(guiContract.pages?.scheduled_tasks, guiContract.scheduled_tasks_policy);
  validateGuiProductHomeContract(guiContract);
  validateCodexModelPolicy(guiContract);
  validateVisualTokenBindings(guiContract);
  validateGuiFrameworkSurfaces(guiContract, releaseChannel, installExposurePolicy);
  validateSettingsControlPlaneBehavior({ guiContract });
  validateDesktopTrayPolicy(guiContract);
  validateDesktopApplicationIconPolicy(guiContract);

  const remoteCompanion = guiContract.remote_companion;
  if (
    JSON.stringify(remoteCompanion) !== JSON.stringify({
      policy_ref: 'contracts/app-remote-companion.json',
      surface_id: 'remote_companion',
      app_store_name: 'OPL Link',
      home_screen_name: 'OPL Link',
      implementation_owner: 'opl-link',
      product_role: 'remote_companion_channel_not_a_runtime_or_third_workbench',
      primary_user_object: 'canonical_codex_conversation',
      default_ios_surface: 'conversation_directory',
      task_grouping_policy:
        'optional_metadata_or_external_opl_flow_ledger_linear_reference_not_an_opl_link_control_plane',
      desktop_workbench_remains_canonical: true,
      transport_target: 'ably_free_realtime_with_cloudflare_workers_d1_control_plane',
      transport_selection_status: 'target_pending_mainland_china_probe',
      current_connector_implementation: 'legacy_tencent_source_requires_migration',
      release_ready: false,
      standard_view_type: 'remote_companion_access',
      standard_view_contract_ref: 'framework_surfaces.package_app_contributions.standard_view_contracts.remote_companion_access',
      pairing_access_gate: 'one_time_invitation_and_worker_d1_pair_admission_with_release_cohort_metadata_lock',
      release_cohort_lock_ref: 'contracts/app-remote-companion.json#transport.release_cohort_lock',
      pairing_capacity_policy: {
        authority: 'opl-link/service_cloudflare_worker_and_d1',
        active_pair_limit: 20,
        warning_threshold: 15,
        limit_scope: 'validation_cohort_not_provider_seat_limit',
        warning_projection: 'service_capacity_warning_when_active_pair_count_at_or_above_15',
        hard_stop: 'service_rejects_new_pairing_when_active_pair_count_at_or_above_20',
        metadata_or_config_digest_mismatch: 'fail_closed_before_claim_or_transport_connection',
        testflight_is_capacity_authority: false,
      },
      pairing_surface: 'settings_resources_desktop_pairing_qr_and_ios_scan',
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
      secret_boundary: {
        transient_interaction_fields: ['invitation_code', 'manual_code', 'qr_payload', 'authentication_digits'],
        never_cached_logged_or_returned_by_app_action: [
          'invitation_code',
          'manual_code',
          'qr_payload',
          'claim_secret',
          'claim_material',
        ],
        qr_payload_only_in_status: 'qr_ready',
        qr_payload_max_length: 8192,
      },
      ordinary_ios_actions: [
        'conversation.list',
        'conversation.open',
        'conversation.refresh',
        'conversation.start',
        'conversation.send_text',
        'conversation.turn.stop',
        'conversation.approval.respond',
        'pair.revoke',
      ],
      forbidden_ios_controls: [
        'provider_or_model_editor',
        'permission_policy_editor',
        'package_lifecycle_editor',
        'arbitrary_shell_or_file_command',
        'offline_command_queue',
      ],
      missing_provider_or_transport_policy:
        'show_unavailable_without_fabricated_online_or_conversation_state_and_keep_desktop_workbench_usable',
    })
  ) {
    throw new Error('App GUI remote companion contract must match the App-owned companion policy');
  }

  const startupReadModelPolicy = guiContract.framework_surfaces?.canonical_state?.startup_read_model_policy;
  if (
    startupReadModelPolicy?.blocking_policy !==
    'ordinary_startup_waits_only_for_fast_state_agent_conversation_model_and_capability_catalog_reads_then_core_failures_restrict_only_dependent_capabilities'
  ) {
    throw new Error('App GUI startup read model must wait only for the bounded ordinary-use catalogs');
  }
  if (
    startupReadModelPolicy?.ordinary_entry_route !== '/guid' ||
    startupReadModelPolicy?.visible_startup_gate !== 'bounded_core_catalog_readiness_overlay' ||
    startupReadModelPolicy?.navigation_wait_for_fast_state_ms !== 20000 ||
    startupReadModelPolicy?.state_hydration !==
      'last_good_allowlisted_renderer_cache_then_single_flight_background_refresh' ||
    startupReadModelPolicy?.background_refresh_soft_deadline_ms !== 1500 ||
    startupReadModelPolicy?.background_refresh_deadline_behavior !==
      'keep_startup_stage_visible_then_offer_limited_entry_without_false_ready'
  ) {
    throw new Error('App GUI startup read model must expose bounded quantitative readiness before Guid interaction');
  }
  const installedLaunchTarget = startupReadModelPolicy.installed_launch_target;
  if (
    installedLaunchTarget?.target_ms !== 1500 ||
    installedLaunchTarget?.measurement_scope !== 'OS_launch_request_to_branded_startup_loader_visible' ||
    installedLaunchTarget?.status !== 'required_unverified_installed_target_not_current_measurement_or_SLA' ||
    installedLaunchTarget?.fast_state_hydration_in_target !== false
  ) {
    throw new Error('App GUI startup read model must keep the 1500 ms installed Guid target explicit and evidence-bound');
  }

  if (guiContract.theme_and_branding?.default_theme_id !== 'default-theme') {
    throw new Error('App GUI default theme must be default-theme');
  }
  if (
    guiContract.theme_and_branding?.ordinary_chrome_product_name !== productProfile.product?.ordinary_chrome_name ||
    guiContract.theme_and_branding?.ordinary_navigation_brand_presentation?.identity !== 'text_only' ||
    guiContract.theme_and_branding?.ordinary_navigation_brand_presentation?.logo_visible !== false ||
    guiContract.theme_and_branding?.ordinary_navigation_brand_presentation?.theme_variant_asset_required !== false
  ) {
    throw new Error('App GUI ordinary navigation branding must use the profile-owned text-only product name');
  }
  if (!guiContract.theme_and_branding?.visible_branding_surfaces?.includes('navigation_rail_brand')) {
    throw new Error('App GUI visible branding surfaces must include navigation_rail_brand');
  }
  if (
    !Array.isArray(guiContract.theme_and_branding?.allowed_theme_ids) ||
    guiContract.theme_and_branding.allowed_theme_ids.length !== 1 ||
    guiContract.theme_and_branding.allowed_theme_ids[0] !== 'default-theme'
  ) {
    throw new Error('App GUI theme list must expose only default-theme');
  }
  for (const section of [
    'general',
    'gateway',
    'access',
    'workspace',
    'agents',
    'capabilities',
    'resources',
    'environment',
    'storage',
    'appearance',
    'about',
  ]) {
    if (!guiContract.settings_navigation?.required_sections?.includes(section)) {
      throw new Error(`App GUI settings navigation must include ${section}`);
    }
  }
  assertDeepEqualJson(
    guiContract.settings_navigation?.ordinary_visible_tabs,
    settingsControlPlane.ordinary_visible_tabs,
    'App GUI settings navigation ordinary visible tabs',
  );
  assertDeepEqualJson(
    guiContract.settings_navigation?.secondary_page_ids,
    settingsControlPlane.secondary_pages?.map((route) => route.id),
    'App GUI settings navigation secondary page ids',
  );
  assertDeepEqualJson(
    guiContract.settings_navigation?.compatibility_redirects,
    settingsControlPlane.compatibility_redirects,
    'App GUI settings compatibility redirects',
  );
  assertDeepEqualJson(
    guiContract.settings_navigation?.ordinary_hidden_compatibility_routes,
    ['update', 'theme', 'local-services', 'personalization'],
    'App GUI hidden compatibility routes',
  );
  assertDeepEqualJson(
    guiContract.settings_navigation?.legacy_route_redirects,
    Object.fromEntries(
      Object.entries(settingsControlPlane.legacy_route_redirects ?? {})
        .filter(([id]) => id !== 'about')
        .map(([id, target]) => [id, target]),
    ),
    'App GUI settings navigation legacy route redirects',
  );
  assertDeepEqualJson(
    guiContract.settings_navigation?.ordinary_hidden_legacy_tabs,
    Object.keys(guiContract.settings_navigation?.legacy_route_redirects ?? {}),
    'App GUI settings navigation ordinary hidden legacy tabs',
  );
  if (
    guiContract.settings_navigation?.legacy_route_redirects?.about ||
    settingsControlPlane.legacy_route_redirects?.about
  ) {
    throw new Error('App GUI About must remain an independent /settings/about page');
  }
  if (
    guiContract.settings_navigation?.legacy_route_redirects?.assistants !==
    'capabilities#third-party'
  ) {
    throw new Error('App GUI legacy assistants route must target the OPL capability directory');
  }
  assertIncludesAll(
    guiContract.settings_navigation?.ordinary_hidden_upstream_surfaces,
    ['AionUI Team', 'Team nav entry', 'Team leader configuration', 'team deep link navigation'],
    'App GUI settings hidden upstream surfaces',
  );
  for (const [field, expected] of Object.entries({
    ordinary_visible: false,
    route_policy: 'disabled_or_redirect_to_app_owned_home',
    deep_link_policy: 'not_whitelisted',
    rationale: 'upstream AionUI Team is configured around shell-local agents and is not an OPL ordinary-user capability',
  })) {
    if (guiContract.settings_navigation?.team_surface_policy?.[field] !== expected) {
      throw new Error(`App GUI settings team_surface_policy.${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    guiContract.settings_navigation.team_surface_policy.required_probes,
    aionuiTeamProbeIds,
    'App GUI Team surface required probes',
  );
  if (
    guiContract.settings_navigation.source !==
      'persisted_narrow_settings_snapshot_then_opl_app_state_fast_background_refresh_and_full_explicit_detail'
  ) {
    throw new Error('App GUI settings navigation must render persisted narrow state before background fast App state hydration');
  }
  if (guiContract.settings_navigation.refresh_source !== 'opl app state --profile fast --json') {
    throw new Error('App GUI settings navigation refresh must use fast App state');
  }
  const firstLaunchPolicy = guiContract.first_launch_readiness_policy;
  if (
    firstLaunchPolicy?.launch_gate !== 'ready_to_launch' ||
    firstLaunchPolicy?.ui_order !== 'before_first_conversation_not_before_guid' ||
    firstLaunchPolicy?.guid_navigation_blocking !== false
  ) {
    throw new Error('App GUI first-launch readiness must gate first conversation without blocking /guid navigation');
  }
  for (const item of expectedFirstRunCoreItems) {
    if (!firstLaunchPolicy?.core_required_items?.includes(item)) {
      throw new Error(`App GUI first-launch readiness must require Core item ${item}`);
    }
  }
  for (const item of expectedFullReadinessItems) {
    if (!firstLaunchPolicy?.full_readiness_items?.includes(item)) {
      throw new Error(`App GUI first-launch readiness must keep ${item} in full readiness`);
    }
  }
  for (const [field, expected] of Object.entries({
    full_readiness_blocks_launch: false,
    default_provider: 'oplgateway',
    default_provider_name: 'OPL Gateway',
    existing_provider_name_policy: 'preserve_existing_provider_name_no_migration',
    default_base_url: 'https://gateway.medopl.com/v1',
    default_model: productProfile.codex.default_model,
    default_reasoning_effort: productProfile.codex.default_reasoning_effort,
    default_executor: 'codex_cli',
    full_runtime_provider: 'temporal',
  })) {
    if (firstLaunchPolicy?.[field] !== expected) {
      throw new Error(`App GUI first-launch readiness ${field} must be ${expected}`);
    }
  }
  validateBeginnerFirstRunPresentation(
    firstLaunchPolicy?.beginner_presentation,
    'App GUI first-launch beginner presentation',
    expectedFirstRunCoreItems,
  );
  for (const [field, expected] of Object.entries(focusedFirstRunPresentationPolicy)) {
    if (firstLaunchPolicy?.beginner_presentation?.[field] !== expected) {
      throw new Error(`App GUI first-launch beginner presentation ${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    firstLaunchPolicy?.beginner_presentation?.model_access_setup,
    firstRunModelAccessSetupPolicy,
    'App GUI first-launch model access setup policy',
  );
  assertDeepEqualJson(
    firstLaunchPolicy?.beginner_presentation?.primary_steps,
    expectedFirstRunCoreItems,
    "App GUI first-launch beginner presentation primary steps",
  );
  assertFirstRunProgressModelMatches(
    firstLaunchPolicy?.progress_model,
    expectedFirstRunProgressModel,
    'App GUI first-launch',
  );
  for (const [field, expected] of Object.entries({
    default_launch_command: 'opl app state --profile fast --json',
    default_launch_mode: 'bounded_readiness_overlay_then_guid',
    first_run_route_policy: 'authenticated_standalone_route_outside_ordinary_product_layout',
    ordinary_entry_route: '/guid',
    visible_startup_gate: 'bounded_core_catalog_readiness_overlay',
    navigation_wait_for_fast_state_ms: 20000,
    unknown_readiness_policy: 'show_truthful_pending_stage_then_allow_explicit_limited_guid_without_mutating_readiness',
    guid_navigation_blocked_by_readiness: true,
    core_capability_use_blocked_when_prerequisites_fail: true,
  })) {
    if (firstLaunchPolicy?.startup_runtime_policy?.[field] !== expected) {
      throw new Error('App GUI first-launch startup runtime ' + field + ' must be ' + expected);
    }
  }
  if (firstLaunchPolicy?.startup_runtime_policy?.limited_guid_entry_after_failure_or_timeout !== true) {
    throw new Error('App GUI first-launch startup runtime must allow explicit limited entry after a failed or timed-out stage');
  }
  const postLoginSetupCheck = firstLaunchPolicy?.startup_runtime_policy?.fresh_webui_login_setup_check;
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
    postLoginSetupCheck?.consumption_policy !== 'one_shot'
  ) {
    throw new Error('App GUI fresh WebUI login setup check policy is invalid');
  }
  const ordinaryRecovery = firstLaunchPolicy?.ordinary_shell_recovery_policy;
  if (
    ordinaryRecovery?.persistent_setup_entry?.target_route !==
      progressiveFirstRunRecoveryPolicy.persistent_setup_entry_route ||
    ordinaryRecovery?.persistent_setup_entry?.surface !== 'ordinary_sidebar_non_modal_entry' ||
    ordinaryRecovery?.persistent_setup_entry?.must_preserve_current_route_until_clicked !== true ||
    ordinaryRecovery?.persistent_home_composer_runtime_alert !==
      'forbidden_use_sidebar_and_send_scoped_inline_recovery_only' ||
    ordinaryRecovery?.plain_conversation?.workspace_root_required !== false ||
    ordinaryRecovery?.plain_conversation?.must_preserve_prompt !== true ||
    ordinaryRecovery?.send_scoped_local_inputs?.workspace_root_required !== false ||
    ordinaryRecovery?.workspace_controls?.plain_conversation_remains_available !== true ||
    ordinaryRecovery?.workspace_controls?.send_scoped_local_inputs_remain_available !== true ||
    ordinaryRecovery?.unknown_readiness_policy !== progressiveFirstRunRecoveryPolicy.unknown_readiness_policy
  ) {
    throw new Error('App GUI first-launch ordinary shell recovery policy is invalid');
  }
  assertDeepEqualJson(
    ordinaryRecovery.plain_conversation.required_items,
    progressiveFirstRunRecoveryPolicy.plain_conversation_required_items,
    'App GUI first-launch plain conversation prerequisites',
  );
  assertDeepEqualJson(
    ordinaryRecovery.send_scoped_local_inputs.required_items,
    progressiveFirstRunRecoveryPolicy.send_scoped_local_input_required_items,
    'App GUI first-launch send-scoped local input prerequisites',
  );
  assertDeepEqualJson(
    ordinaryRecovery.send_scoped_local_inputs.supported_inputs,
    progressiveFirstRunRecoveryPolicy.send_scoped_local_input_surfaces,
    'App GUI first-launch send-scoped local input surfaces',
  );
  assertDeepEqualJson(
    ordinaryRecovery.workspace_controls.required_items,
    progressiveFirstRunRecoveryPolicy.workspace_control_required_items,
    'App GUI first-launch workspace control prerequisites',
  );
  assertDeepEqualJson(
    ordinaryRecovery.workspace_controls.restricted_capabilities,
    progressiveFirstRunRecoveryPolicy.workspace_restricted_capabilities,
    'App GUI first-launch workspace-restricted capabilities',
  );
  assertIncludesAll(
    ordinaryRecovery.required_shell_testids,
    progressiveFirstRunRecoveryTestIds,
    'App GUI first-launch progressive recovery shell test ids',
  );

  const modulePathPolicy = guiContract.module_path_source_policy;
  if (modulePathPolicy?.source !== 'app_state.modules[].source + app_state.modules[].path + app_state.paths') {
    throw new Error('App GUI module path explanation must come from App state module/path refs');
  }
  for (const explanation of [
    'whether a module comes from the bundled Full runtime payload',
    'which compatible source the Framework resolver selected for a package',
    'whether an exact installed lock or build artifact records the selected bytes',
    'whether a module comes from a local domain repository checkout',
    'whether Developer Profile source_channel uses a GitHub repo or local checkout',
    'whether a module is managed by App/CLI maintenance',
    'that module path display is refs-only and not domain truth authority',
  ]) {
    if (!modulePathPolicy.must_explain?.includes(explanation)) {
      throw new Error(`App GUI module path source policy must explain ${explanation}`);
    }
  }
  if (
    modulePathPolicy.ordinary_user_source !== 'framework_resolved_compatible_source' ||
    modulePathPolicy.ordinary_user_transport !== 'framework_package_lifecycle'
  ) {
    throw new Error('App GUI module path source policy must keep ordinary users on Framework-resolved package maintenance');
  }
  if (modulePathPolicy.developer_override_surface !== 'Developer Profile source_channel capability') {
    throw new Error('App GUI module path source policy must route repo/checkout override through Developer Profile source_channel');
  }
  if (modulePathPolicy.developer_override_policy !== 'explicit_opt_in_only') {
    throw new Error('App GUI module path source policy must require explicit opt-in for Developer Profile checkout override');
  }
  if (modulePathPolicy.developer_profile_ref !== 'developer_profile.capabilities.source_channel') {
    throw new Error('App GUI module path source policy must link to Developer Profile source_channel');
  }
  if (!modulePathPolicy.must_not_use?.includes('raw OPL_MODULE_SOURCE_MODE as ordinary Settings UI')) {
    throw new Error('App GUI module path source policy must not expose raw OPL_MODULE_SOURCE_MODE as ordinary Settings UI');
  }

  const developerProfile = guiContract.developer_profile;
  if (!developerProfile || typeof developerProfile !== 'object') {
    throw new Error('App GUI contract must declare Developer Profile capabilities');
  }
  const developerProfileCapabilityAxes = developerProfile.capability_axes;
  if (!Array.isArray(developerProfileCapabilityAxes) || developerProfileCapabilityAxes.length === 0) {
    throw new Error('App GUI Developer Profile must declare capability axes');
  }
  assertDeepEqualJson(
    Object.keys(developerProfile.capabilities ?? {}),
    developerProfileCapabilityAxes,
    'App GUI Developer Profile capability axes and capability map keys',
  );
  if (
    developerProfile.default_profile !== 'standard_user' ||
    developerProfile.opt_in_policy !== 'automatic_for_matching_identity_and_authorized_repositories_with_explicit_off' ||
    developerProfile.ordinary_user_defaults?.source_channel !== 'agent_rolling_latest_package_channel' ||
    developerProfile.ordinary_user_defaults?.agent_automation !== 'automatic_clean_managed_agent_package_updates'
  ) {
    throw new Error('App GUI Developer Profile must preserve standard user defaults and explicit opt-in');
  }
  for (const axis of developerProfileCapabilityAxes) {
    const capability = developerProfile.capabilities?.[axis];
    if (!capability?.standard_default || !capability.developer_opt_in || !capability.display_policy) {
      throw new Error(`App GUI Developer Profile capability ${axis} must declare defaults, opt-in, and display policy`);
    }
  }
  if (
    developerProfile.capabilities.source_channel.developer_opt_in !== 'github_repo_or_local_checkout' ||
    developerProfile.capabilities.agent_automation.standard_default !== 'automatic_clean_managed_agent_package_updates' ||
    developerProfile.capabilities.runtime_mutation_scope.standard_default !== 'app_action_route_only' ||
    developerProfile.settings_pages?.length !== 1 ||
    developerProfile.settings_pages[0] !== 'settings_agents' ||
    developerProfile.control_model?.source_mode?.control !== 'three_state_segmented_control' ||
    JSON.stringify(developerProfile.control_model?.source_mode?.values) !== JSON.stringify(['auto', 'managed', 'developer']) ||
    JSON.stringify(developerProfile.control_model?.source_mode?.labels) !==
      JSON.stringify(['automatic', 'managed', 'developer']) ||
    developerProfile.control_model?.safe_maintenance?.control !== 'auto_or_off_control_with_effective_state_readback' ||
    developerProfile.control_model.safe_maintenance.default !== 'auto' ||
    JSON.stringify(developerProfile.control_model.safe_maintenance.values) !== JSON.stringify(['auto', 'off']) ||
    developerProfile.control_model.safe_maintenance.off_value !== 'external_observe' ||
    developerProfile.control_model.safe_maintenance.effective_value !== 'developer_apply_safe' ||
    developerProfile.control_model.safe_maintenance.fast_profile_policy !==
      'show inspection pending without claiming identity mismatch' ||
    developerProfile.control_model.safe_maintenance.shared_runtime_mutation_boundary !==
      'enabled=on + mode=developer_apply_safe + source=user_config' ||
    developerProfile.control_model?.safe_maintenance?.independent_from_source_selection !== true ||
    developerProfile.control_model?.package_source?.control !== 'segmented_control_in_package_details' ||
    !developerProfile.must_show?.includes(
      'Maintain authorized development repositories auto/off control with effective state',
    ) ||
    !developerProfile.must_show?.includes('per-package auto managed developer source control') ||
    !developerProfile.must_not_show?.includes('five equal capability-axis cards')
  ) {
    throw new Error('App GUI Developer Profile must keep source controls and automatic safe-maintenance readback on Agents');
  }

  assertDeepEqualJson(
    guiContract.release_channel_policy?.stable?.must_gate,
    releaseChannel.release_validation_profiles.stable.required_lanes,
    'App GUI stable release required lanes',
  );
  assertDeepEqualJson(
    guiContract.release_channel_policy?.nightly?.must_gate,
    releaseChannel.release_validation_profiles.nightly_standard.required_lanes,
    'App GUI nightly release required lanes',
  );
  for (const lane of releaseChannel.release_validation_profiles.nightly_standard.forbidden_lanes) {
    if (!guiContract.release_channel_policy?.nightly?.must_not_gate?.includes(lane)) {
      throw new Error(`App GUI nightly release policy must exclude ${lane}`);
    }
  }

  const pages = guiContract.pages ?? {};
  for (const pageId of [
    'guid_home',
    'settings_general',
    'settings_gateway',
    'settings_access',
    'settings_workspace',
    'settings_agents',
    'settings_capabilities',
    'settings_resources',
    'settings_environment',
    'settings_storage',
    'about',
    'update',
    'settings_theme',
    'settings_local_services',
    'settings_personalization',
  ]) {
    if (!pages[pageId]) {
      throw new Error(`App GUI contract missing page ${pageId}`);
    }
  }
  for (const pageId of [
    'guid_home',
    'settings_general',
    'settings_gateway',
    'settings_access',
    'settings_agents',
    'settings_environment',
    'about',
    'update',
    'settings_theme',
  ]) {
    const expectedStateSource = pageId === 'settings_gateway'
      ? 'dedicated cached Gateway projection followed by app_action_execution.result.gateway_account'
      : pageId === 'settings_environment'
      ? 'opl app state --profile fast --json + application.systemInfo.logDir when the carrier exposes systemInfo'
      : 'opl app state --profile fast --json';
    assertCommandSurface(pages[pageId].state_source, expectedStateSource, `App GUI ${pageId} state source`);
    const expectedRefreshSource = pageId === 'settings_gateway'
      ? 'opl app action execute --action gateway_account_refresh --json'
      : pageId === 'settings_general'
      ? 'background opl app state --profile fast --json with bounded retry'
      : pageId === 'about'
        ? 'startup check once or explicit manual check updates the same shared store'
        : 'opl app state --profile fast --json';
    assertCommandSurface(pages[pageId].refresh_source, expectedRefreshSource, `App GUI ${pageId} refresh source`);
  }
  const capabilitiesStateSource =
    'opl update status --json#managed_update.components[component_id=opl_base].current.dependency_catalog.flow_dependencies + Codex and shell skill/plugin registries';
  assertCommandSurface(
    pages.settings_capabilities.state_source,
    capabilitiesStateSource,
    'App GUI settings_capabilities state source',
  );
  assertCommandSurface(
    pages.settings_capabilities.refresh_source,
    capabilitiesStateSource,
    'App GUI settings_capabilities refresh source',
  );
  assertDeepEqualJson(
    pages.settings_capabilities.entity_kinds,
    [
      'capability_package',
      'skill',
      'plugin',
      'mcp_server',
      'connection_application',
      'image_generation',
      'voice_input',
    ],
    'App GUI Settings Capabilities entity kinds',
  );
  if (!pages.settings_capabilities.must_show?.includes(
    'OPL-managed default companions with installed, registered, enabled, permission, ready, version, and owner-projected action status',
  ) || !pages.settings_capabilities.must_not_show?.includes('KimiCU classified as a manual or third-party capability')) {
    throw new Error('App GUI Settings Capabilities must expose managed companions separately from manual and third-party capabilities');
  }
  if (
    pages.settings_capabilities.local_capability_configuration_source !==
      'AionUI local configuration#MCP servers + image generation + voice input' ||
    !pages.settings_capabilities.must_show?.includes(
      'AionUI-native Skills, Plugins, MCP helpers, image generation, and voice input inside local or third-party ownership instead of OPL Flow',
    ) ||
    !pages.settings_capabilities.must_not_show?.includes('voice input configuration on Preferences or Advanced') ||
    !pages.settings_theme.must_not_show?.includes('voice input provider configuration')
  ) {
    throw new Error('App GUI Settings Capabilities must own local MCP, image, and voice configuration without Preferences duplication');
  }
  if (
    !pages.guid_home.must_show?.includes(
      'all user-visible configured OPL starters in stable order without silent truncation',
    )
  ) {
    throw new Error('App GUI home must show every user-visible configured OPL starter without silent truncation');
  }
  if (
    !pages.guid_home.must_show?.includes(
      'all visible professional-agent shortcuts remain selectable while launch readiness is enforced on send with typed guidance',
    ) ||
    !pages.guid_home.must_show?.includes('prompt, compact shortcuts, and composer share one bottom reading lane') ||
    !pages.guid_home.must_show?.includes(
      'active capability shown by a quiet selected shortcut state without a second composer label',
    )
  ) {
    throw new Error('App GUI home must keep agent shortcuts selectable and subordinate to the chat-first composer');
  }
  assertIncludesAll(
    pages.guid_home.must_not_show,
    [
      'full-width professional-agent navigation row or inactive-item chevrons',
      'working directory selector inside the composer capability palette',
      'professional-agent selection disabled only because package launch is not ready',
    ],
    'App GUI Home retired agent-portal and context-cap signals',
  );
  assertIncludesAll(
    pages.guid_home.must_show,
    [
      'exactly one Home root, composer shell, and footer account or Settings entry at every viewport',
      'each canonical thread ID rendered as at most one conversation row regardless of title',
      'canonical App Server thread overview overrides Codex ACP cache rows while preserving non-Codex local rows',
      'non-managed-scratch canonical recorded cwd auto-loads a directory group and new-session cwd shortcut without creating explicit project affinity or mutating registered workspaces',
      'active AionUI primary navigation shows 运行状态 after New task and before Scheduled tasks in expanded, collapsed, and narrow drawer modes',
    ],
    'App GUI Home session-first identity signals',
  );
  assertIncludesAll(
    pages.guid_home.must_not_show,
    [
      'workspace-scoped Add context action in a directory group',
      'directory-group delete action or cascade deletion of grouped sessions',
      'title-based conversation deduplication',
      'stale Codex ACP cache rows absent from an available canonical App Server overview',
    ],
    'App GUI Home forbidden directory ownership signals',
  );
  validateDynamicHomeComposerStateContract(
    guiContract.interaction_baseline?.home?.home_composer_state_contract,
    'App GUI Home composer state contract',
  );
  validateDynamicHomeComposerStateContract(
    productProfile.gui?.home?.home_composer_state_contract,
    'App product profile Home composer state contract',
  );
  assertDeepEqualJson(
    productProfile.gui?.home?.home_composer_state_contract,
    guiContract.interaction_baseline?.home?.home_composer_state_contract,
    'App product profile Home composer state projection',
  );
  if (pages.guid_home.model_status?.display_value !== '5.6 Sol') {
    throw new Error('App GUI home model selector must keep the friendly default model without repeating reasoning');
  }
  if (
    pages.guid_home.model_status?.value_source !==
    'default_session_profile.model on Home; normalized active ACP model_info in conversation'
  ) {
    throw new Error('App GUI model selector must use the default profile on Home and active ACP model info in conversation');
  }
  if (pages.guid_home.model_status?.placement !== 'inside the Home and ordinary Codex conversation model selector buttons only') {
    throw new Error('App GUI model status must stay inside the Home and conversation selector buttons');
  }
  if (pages.guid_home.model_status?.standalone_home_subtitle_visible !== false) {
    throw new Error('App GUI home must not show a standalone model subtitle');
  }
  if (pages.guid_home.model_status?.selector_visible !== true) {
    throw new Error('App GUI home must expose the App-owned model selector');
  }
  if (
    pages.guid_home.conversation_feedback_policy?.pending_indicator !==
    'visible elapsed seconds while request is pending or backend is running'
  ) {
    throw new Error('App GUI conversation must show elapsed seconds while Codex is working');
  }
  if (
    pages.guid_home.conversation_feedback_policy?.model_status !==
    'shared session configuration menu appears in Home and Codex conversation composer with peer Model and Reasoning summary rows plus Reset to defaults; no separate status pill, additional root rows, speed, or performance tuning'
  ) {
    throw new Error('App GUI conversation must use the shared session configuration menu with no extra root rows');
  }
  for (const forbiddenField of [
    'agent_package_invocation_receipt_policy',
    'builtin_assistant_route_receipt_policy',
  ]) {
    if (forbiddenField in guiContract) {
      throw new Error(`App GUI contract must not restore private Agent route receipt field ${forbiddenField}`);
    }
  }
  if (
    pages.guid_home.agent_package_source_ref !== 'app_state.agent_packages.directory.entries' ||
    JSON.stringify(pages.guid_home.opl_standard_agent_membership_policy) !==
      JSON.stringify(appOwnedOplStandardAgentMembershipPolicy)
  ) {
    throw new Error('App GUI Home Agent source must apply the OPL ownership, role, readiness, and Codex-route membership policy');
  }
  if (
    guiContract.ordinary_capability_selector_policy?.scope !== 'home_composer_and_ordinary_conversation' ||
    guiContract.ordinary_capability_selector_policy?.authority !==
      'owner_or_carrier_skill_projection_and_mcp_negative_filter' ||
    guiContract.ordinary_capability_selector_policy?.palette_agent_catalog_source_ref !==
      'app_state.agent_packages.directory.entries' ||
    JSON.stringify(guiContract.ordinary_capability_selector_policy?.opl_standard_agent_membership_policy) !==
      JSON.stringify(appOwnedOplStandardAgentMembershipPolicy) ||
    guiContract.ordinary_capability_selector_policy?.palette_agent_status_source_ref !==
      'app_state.agent_packages.status_index.packages[]' ||
    guiContract.ordinary_capability_selector_policy?.palette_agent_availability_policy !==
      'join_by_package_id_and_use_fresh_directory_installed_plus_status_index_presence.present_and_presence.callable' ||
    guiContract.ordinary_capability_selector_policy?.palette_agent_action_policy !==
      'directory_available_actions_and_recommended_action_ref_only' ||
    guiContract.ordinary_capability_selector_policy?.palette_unknown_standard_agent_policy !==
      'include_unknown_package_ids_only_when_they_match_opl_standard_agent_membership' ||
    guiContract.ordinary_capability_selector_policy?.palette_required_agent_package_ids !== undefined ||
    JSON.stringify(guiContract.ordinary_capability_selector_policy?.palette_agent_group_label_i18n) !==
      JSON.stringify({ 'zh-CN': 'OPL 标准智能体', 'en-US': 'OPL standard agents' }) ||
    guiContract.ordinary_capability_selector_policy?.palette_home_shortcut_independence_policy !==
      'complete_opl_standard_agent_catalog_independent_of_home_shortcut_visibility_and_order' ||
    guiContract.ordinary_capability_selector_policy?.agent_owned_skill_deduplication_policy !==
      'exclude_rendered_professional_agent_required_skill_ids_from_home_new_session_standalone_skills' ||
    guiContract.ordinary_capability_selector_policy?.skill_source_ref !==
      'owner_or_carrier_projected_capability_metadata_for_the_selected_package' ||
    guiContract.ordinary_capability_selector_policy?.package_skill_source_ref !==
      'app_state.agent_packages.status_index.packages[].capability_exposure plus owner-projected capability metadata' ||
    guiContract.ordinary_capability_selector_policy?.mcp_server_source_ref !==
      'configured_user_and_third_party_mcp_servers' ||
    guiContract.ordinary_capability_selector_policy?.mcp_menu_policy !==
      'preserve_configured_user_and_third_party_servers_except_explicit_forbidden_matchers' ||
    guiContract.ordinary_capability_selector_policy?.conversation_loaded_skill_display_policy !==
      'preserve_owner_or_carrier_projected_loaded_skills' ||
    guiContract.ordinary_capability_selector_policy?.conversation_loaded_mcp_display_policy !==
      'preserve_non_forbidden_configured_servers' ||
    guiContract.ordinary_capability_selector_policy?.unmatched_mcp_policy !==
      'preserve_end_to_end_without_app_allowlist_membership' ||
    Object.prototype.hasOwnProperty.call(
      guiContract.ordinary_capability_selector_policy,
      'forbidden_skill_examples',
    )
  ) {
    throw new Error('App GUI ordinary selector must use owner/carrier Skill projection and the MCP negative filter');
  }
  assertAgentReferenceAdmissionPolicy(
    guiContract.ordinary_capability_selector_policy.agent_reference_admission_policy,
    'App GUI Agent reference admission policy',
  );
  if (
    guiContract.interaction_baseline?.capability_selection?.agent_reference_admission_policy_ref !==
    'ordinary_capability_selector_policy.agent_reference_admission_policy'
  ) {
    throw new Error('App GUI capability selection must reference the canonical Agent admission policy');
  }
  assertIncludesAll(
    guiContract.ordinary_capability_selector_policy.forbidden_mcp_examples,
    ['aionui-team', 'team_*', 'mcp__aionui-team*', 'team_mcp_stdio_config', 'team_id/teamId'],
    'App GUI ordinary selector forbidden MCP examples',
  );
  assertForbiddenCapabilityPolicy(
    guiContract.ordinary_capability_selector_policy,
    appOwnedOrdinaryForbiddenCapabilityPolicy,
    'App GUI ordinary selector forbidden MCP policy',
  );
  assertDeepEqualJson(
    guiContract.ordinary_capability_selector_policy.required_scrub_targets,
    [
      'mcp_servers entries matching forbidden_mcp_matchers',
      'mcp_statuses entries matching forbidden_mcp_matchers',
      'session_mcp_servers entries matching forbidden_mcp_matchers',
      'scrub_extra_keys',
    ],
    'App GUI ordinary selector Team scrub targets',
  );
  assertDeepEqualJson(
    guiContract.ordinary_capability_selector_policy.required_preservation_targets,
    [
      'mcp directory entries not matching forbidden_mcp_matchers',
      'mcp status entries not matching forbidden_mcp_matchers',
      'new conversation create payload mcp_servers not matching forbidden_mcp_matchers',
      'conversation snapshot mcp_servers and mcp_statuses not matching forbidden_mcp_matchers',
    ],
    'App GUI ordinary selector MCP preservation targets',
  );
  if (
    guiContract.ordinary_capability_selector_policy.conversation_snapshot_policy !==
    'scrub_disabled_team_mcp_and_team_metadata_before_rendering_or_inheriting_ordinary_conversations'
  ) {
    throw new Error('App GUI ordinary selector must scrub disabled Team MCP snapshots from ordinary conversations');
  }
  assertIncludesAll(
    pages.guid_home.must_show,
    ['ordinary Skill selector preserves owner-or-carrier projected Skills without an App allowlist'],
    'App GUI home ordinary selector must_show',
  );
  assertIncludesAll(
    pages.guid_home.must_not_show,
    [
      'AionUI implementation skills such as aionui-skills',
      'MCP servers matching the explicit Team/internal negative filter',
      'AionUI Team MCP tools such as team_members, team_list_models, and team_spawn_agent',
    ],
    'App GUI home ordinary selector must_not_show',
  );
  if (pages.guid_home.activity_center_policy?.source !== 'runtime page only; Home does not query running task lists') {
    throw new Error('App GUI home activity center must be suppressed on ordinary Home and routed to Runtime/secondary context');
  }
  if (pages.guid_home.activity_center_policy?.authority !== 'app_owned_home_minimal_command_surface') {
    throw new Error('App GUI home activity center policy must be App-owned minimal command surface');
  }
  if (pages.guid_home.activity_center_policy?.default_placement !== 'not_rendered_on_ordinary_home') {
    throw new Error('App GUI home must not render the expanded activity center on ordinary Home');
  }
  if (pages.guid_home.activity_center_policy?.home_surface_policy !== 'ordinary_home_must_not_render_activity_center_or_continue_work_grid') {
    throw new Error('App GUI home must forbid ordinary Home activity center / continue-work grid rendering');
  }
  assertDeepEqualJson(
    pages.guid_home.activity_center_policy.allowed_home_runtime_context,
    [],
    'App GUI home allowed runtime context',
  );
  assertIncludesAll(
    pages.guid_home.activity_center_policy.must_not_display,
    homeActivityCenterForbiddenDisplays,
    'App GUI home activity center forbidden displays',
  );
  for (const hiddenSignal of [
    'compact continue-work entry near the home input',
    'needs attention, active, and recent refs on Home',
    'Home footer feedback icon',
    'Home footer favorite/star icon',
    'Home footer web/access globe icon',
    'per-assistant running badges derived from module or domain lane diagnostics',
  ]) {
    if (!pages.guid_home.must_not_show?.includes(hiddenSignal)) {
      throw new Error(`App GUI home must not show ${hiddenSignal}`);
    }
  }
  for (const [pageId, page] of Object.entries(pages).filter(([id]) => id === 'about' || id === 'update' || id.startsWith('settings_'))) {
    assertNonEmptyStringArray(page.sections, `App GUI ${pageId} sections`);
    assertNonEmptyStringArray(page.must_show, `App GUI ${pageId} must_show`);
    assertNonEmptyStringArray(page.must_not_show, `App GUI ${pageId} must_not_show`);
  }
  const settingsExperiencePages = {
    settings_general: 'overview',
    settings_gateway: 'gateway',
    settings_access: 'models',
    settings_workspace: 'workspace',
    settings_agents: 'agents',
    settings_capabilities: 'capabilities',
    settings_resources: 'resources',
    settings_environment: 'maintenance',
    settings_storage: 'storage',
    settings_theme: 'preferences',
    about: 'about',
  };
  for (const [pageId, productPageId] of Object.entries(settingsExperiencePages)) {
    if (
      pages[pageId]?.product_page_id !== productPageId ||
      pages[pageId]?.experience_contract_ref !==
        `contracts/app-settings-control-plane.json#experience_contract.page_contracts.${productPageId}`
    ) {
      throw new Error(`App GUI ${pageId} must reference the ${productPageId} experience contract`);
    }
  }
  assertDeepEqualJson(
    pages.settings_environment.managed_dependency_summary,
    appOwnedSettingsManagedDependencySummary,
    'App GUI Maintenance managed dependency summary',
  );
  if (pages.settings_access.model_access_source !== 'app_state.core.codex.model_access_source') {
    throw new Error('Settings Access must use app_state.core.codex.model_access_source');
  }
  const gatewayAccount = pages.settings_gateway.opl_gateway_account;
  if (
    gatewayAccount?.projection_ref !== 'contracts/app-runtime-bridge.json#opl_gateway_account_projection' ||
    gatewayAccount.projection_path !== 'app_state.settings_control_center.app_settings_read_model.opl_gateway_account' ||
    gatewayAccount.secret_bridge_ref !== 'contracts/app-runtime-bridge.json#opl_gateway_account_secret_bridge' ||
    gatewayAccount.account_card_visibility !== 'account_connection_only' ||
    gatewayAccount.manual_api_key_card_policy !== 'model_access_status_only_no_account_balance_or_account_usage' ||
    gatewayAccount.cache_ttl_seconds !== 900 ||
    gatewayAccount.stale_policy !== 'show_cached_values_with_stale_marker_and_manual_refresh' ||
    gatewayAccount.first_run_scope !== 'gateway_account_default_desktop_and_webui_with_manual_api_key_compatibility' ||
    gatewayAccount.personal_profile_navigation !== 'not_added'
  ) {
    throw new Error('Settings Account & Access must declare the canonical OPL Gateway account product contract');
  }
  assertDeepEqualJson(gatewayAccount.access_paths, ['account_login', 'manual_api_key'], 'Settings Gateway access paths');
  assertDeepEqualJson(
    gatewayAccount.error_states,
    ['auth_expired', 'managed_key_missing', 'managed_key_conflict', 'managed_key_identity_drift', 'disconnect_pending'],
    'Settings Gateway visible repair states',
  );
  assertIncludesAll(
    pages.settings_gateway.must_not_show,
    [
      'password, access token, refresh token, API Key material, remote Key id, credential path, raw response, or raw error',
      'Gateway account card in manual API-key mode or when no Gateway account is connected',
    ],
    'Settings Gateway privacy and visibility boundaries',
  );
  assertIncludesAll(
    pages.settings_access.must_show,
    ['page label Models or 模型', 'selected and default model', 'one route to Account & Access when credentials need attention'],
    'Settings Models user entry contract',
  );
  assertIncludesAll(
    pages.settings_access.must_not_show,
    ['Gateway account card, balance, usage, login form, managed Key lifecycle, or manual API-key form'],
    'Settings Models Gateway deduplication boundary',
  );
  if (pages.settings_access.browser_access_entry !== undefined) {
    throw new Error('Settings Models must not own browser access');
  }
  assertDeepEqualJson(
    pages.settings_resources.browser_access_entry,
    appOwnedSettingsResourcesBrowserEntry,
    'Settings Resources browser entry',
  );
  assertIncludesAll(
    pages.settings_resources.must_show,
    [
      'browser access to this computer with port, account, and password management entry',
      'resource readiness and action executability as separate states',
    ],
    'Settings Resources readiness boundary',
  );
  assertIncludesAll(
    pages.settings_resources.must_not_show,
    [
      'selected local workspace path, change-workspace controls, or permission summary duplicated from Workspace',
      'built-in OPL Gateway connection or Gateway count owned by Account & Access',
      'dry-run success presented as resource opened, diagnosis completed, deployment completed, or mutation completed',
    ],
    'Settings Resources Workspace deduplication',
  );
  assertDeepEqualJson(
    pages.settings_resources.action_behavior,
    appOwnedSettingsResourceActionBehavior,
    'Settings Resources action behavior',
  );
  assertDeepEqualJson(
    pages.settings_capabilities.tab_contract,
    appOwnedSettingsCapabilitiesTabContract,
    'Settings Capabilities source-group tab contract',
  );
  assertDeepEqualJson(
    pages.settings_capabilities.entity_kinds,
    [
      'capability_package',
      'skill',
      'plugin',
      'mcp_server',
      'connection_application',
      'image_generation',
      'voice_input',
    ],
    'Settings Capabilities entity kinds',
  );
  if (
    pages.settings_capabilities.lifecycle_policy?.hardcoded_app_skill_list_allowed !== false ||
    pages.settings_capabilities.lifecycle_policy?.cli_currentness_owner !== 'opl_base' ||
    pages.settings_capabilities.lifecycle_policy?.flow_role !== 'dependency_and_profile_intent_only_not_a_second_updater'
  ) {
    throw new Error('Settings Capabilities must derive Flow membership from package closure and leave CLI currentness to OPL Base');
  }
  const agentDirectoryTarget = pages.settings_agents.codex_plugin_directory_target;
  const agentStatusModel = pages.settings_agents.status_model;
  assertDeepEqualJson(
    pages.settings_agents.brand_identity_policy,
    {
      source_fields: ['official', 'publisher'],
      opl_official: true,
      opl_publisher: 'one-person-lab',
      match_policy: 'official_equals_true_or_publisher_equals_one-person-lab',
      row_presentation: 'compact OPL brand badge immediately after the localized display name on every matching row',
      scope_policy:
        'all package roles; the badge remains visible whenever its matching row is visible under any source filter',
      catalog_group_order: ['opl_managed', 'other_agents', 'other_capabilities'],
      grouping_policy:
        'classify every projected row dynamically by OPL ownership and package role; render the OPL-managed group before non-OPL agents and capabilities without a package-id allowlist',
      standard_agent_name_policy:
        'the owner projects the invariant English brand name for every locale; the App and Shell never translate or replace that brand name',
      description_policy:
        'select the owner-projected description for the active UI locale with the owner default as fallback',
      managed_update_policy: {
        ordinary_install_source: 'per-Package owner latest-stable channel through the native carrier adapter',
        ordinary_auto_update_projection:
          'source_explanation.effective_source_policy.package_channel_auto_update=true',
        scope: 'all OPL-managed Agent, workflow, and capability Packages',
        developer_override:
          'an active trusted developer checkout remains authoritative and projects package_channel_auto_update=false so automatic updates never overwrite developer bytes',
        ui_inference_forbidden: true,
      },
      third_party_policy: 'do not show the OPL brand badge',
    },
    'Settings Agents OPL brand identity policy',
  );
  assertDeepEqualJson(
    pages.settings_agents.official_profile_restore_action,
    appOwnedOfficialProfileRestoreAction,
    'Settings Agents Official Profile restore action',
  );
  assertDeepEqualJson(
    settingsControlPlane.experience_contract?.page_contracts?.agents?.official_profile_restore_action,
    appOwnedOfficialProfileRestoreAction,
    'Settings Agents experience Official Profile restore action',
  );
  if (
    agentDirectoryTarget?.primary_layout !==
      'compact_grouped_package_list_with_inline_dependency_children_and_right_details_panel' ||
    agentDirectoryTarget?.catalog_presentation_policy_ref !==
      'contracts/app-product-profile.json#gui.agent_package_registry.catalog_presentation_policy' ||
    agentDirectoryTarget?.developer_configuration_disclosure !==
      'collapsed_by_default_above_the_catalog' ||
    pages.settings_agents.list_density_policy?.grouping_policy_ref !==
      'contracts/app-product-profile.json#gui.agent_package_registry.catalog_presentation_policy' ||
    pages.settings_agents.list_density_policy?.brand_identity_policy_ref !==
      'contracts/app-gui-product-contract.json#pages.settings_agents.brand_identity_policy' ||
    pages.settings_agents.list_density_policy?.row_hierarchy_policy !==
      'one_projected_package_one_row_with_single_parent_dependencies_nested_and_capability_packages_grouped' ||
    agentStatusModel?.user_facing_projection_ref !==
      'contracts/app-gui-product-contract.json#pages.settings_agents.agent_package_lifecycle_ux.user_facing_status_projection' ||
    agentStatusModel?.localized_metadata_source_ref !== 'app_state.agent_packages.directory.entries' ||
    pages.settings_agents.developer_mode_control?.default_disclosure !== 'collapsed'
  ) {
    throw new Error('Settings Agents must use the App-owned grouped catalog presentation with collapsed developer controls');
  }
  assertIncludesAll(
    pages.settings_agents.must_show,
    [
      'localized package role labels with no raw internal enum on the ordinary row',
      'professional Agents ordered by Home shortcut preference then localized display name, workflow profiles separated, and dependency packages grouped from dependent_guard.required_by_package_ids',
      'runtime source and authorized repository maintenance controls collapsed as advanced configuration by default',
      'owner-projected localized names and descriptions for every Package directory item, including unknown future Agents',
      'an OPL-managed group before other Agents and capabilities, with a compact OPL brand badge on every OPL-owned row and no Package-id allowlist',
      'locale-invariant English brand names for OPL standard Agents and owner-localized descriptions selected by the active UI locale',
      'owner latest-stable automatic updates for every ordinarily managed OPL Agent, workflow, and capability Package while trusted Developer Mode checkouts remain non-overwritten',
      'verification deferred or scope materialization missing on an installed exposed Agent shown as 可用 with no preflight Settings action; domain StageRun readiness stays Framework-owned',
      'one localized status, one concrete explanation, and at most one most relevant action per package with technical status axes confined to details',
    ],
    'Settings Agents grouped catalog signals',
  );
  assertIncludesAll(
    pages.settings_agents.must_not_show,
    [
      'hardcoded package parent-child relationships or duplicate dependency rows',
      'raw setup_required, local_check_not_completed, verification_deferred, scope_materialization_missing, 待验证, 需关注, 不可使用, or contradictory availability labels on ordinary Agent rows',
      'Shell-inferred Package activation, workspace targeting, or private lifecycle action ids',
      'scope materialization missing presented as a Settings attention state or preflight action',
      'aggregate ready or unavailable counts used as the status of every package',
    ],
    'Settings Agents forbidden dependency synthesis',
  );
  validateAgentPackageLifecycleUx(
    pages.settings_agents.agent_package_lifecycle_ux,
    'Settings Agents Agent Package lifecycle UX',
  );
  validateOplFlowContext(guiContract.opl_flow_context, 'App GUI OPL Flow Context');
  const additionalInstructions = guiContract.new_conversation_additional_instructions;
  if (
    additionalInstructions?.content_owner !== 'user' ||
    additionalInstructions.delivery !== 'new_conversation_additional_instructions_only' ||
    additionalInstructions.storage_key !== 'codex.oplAppSessionContextAdditional' ||
    additionalInstructions.storage_key_status !== 'legacy_compatibility_storage_key' ||
    additionalInstructions.generated_base_context_allowed !== false ||
    additionalInstructions.agent_route_fallback_allowed !== false ||
    additionalInstructions.empty_value_policy !== 'inject_nothing' ||
    additionalInstructions.reset_behavior !== 'clear_additional_instructions' ||
    additionalInstructions.effect !== 'next_new_conversation' ||
    Object.prototype.hasOwnProperty.call(guiContract, 'opl_app_session_context')
  ) {
    throw new Error('App GUI must limit new-conversation additions to optional user-authored text');
  }
  if (
    pages.settings_workspace?.ia_group !== 'workspace' ||
    !pages.settings_workspace.sections?.includes('system_agents') ||
    !pages.settings_workspace.sections?.includes('new_conversation_additional_instructions') ||
    !pages.settings_workspace.must_show?.includes(
      'Workspace as a top-level Settings group with Working Directory and Data & Storage destinations',
    ) ||
    !pages.settings_workspace.must_show?.includes(
      'content-width responsive single-column rows when the Settings reading lane is narrow',
    ) ||
    !pages.settings_workspace.must_show?.includes('Codex instruction editors use unframed field groups without nested cards') ||
    !pages.settings_workspace.must_not_show?.includes('App log directory controls owned by Logs & Diagnostics') ||
    !pages.settings_workspace.must_not_show?.includes('System AGENTS.md or new-conversation instructions presented as Workspace children') ||
    !pages.settings_workspace.must_not_show?.includes('App log directory presented as a Workspace child') ||
    !pages.settings_workspace.must_not_show?.includes('Framework and raw paths duplicated from Maintenance diagnostics')
  ) {
    throw new Error('Settings Workspace must retain carrier transport while exposing only working directory and data storage as Workspace children');
  }
  if (
    pages.settings_storage.sections?.includes('log_directory') ||
    !pages.settings_storage.must_show?.includes(
      'read-only Logs & Diagnostics-owned log path reference',
    ) ||
    !pages.settings_storage.must_not_show?.includes('log directory edit control') ||
    pages.settings_theme.sections?.includes('personalization')
  ) {
    throw new Error('Settings Storage may reference App logs read-only and Preferences must not duplicate Workspace personalization');
  }
  if (
    pages.settings_local_services?.page_kind !== 'compatibility_redirect' ||
    pages.settings_local_services.compatibility_redirect?.target_route_id !== 'environment' ||
    pages.settings_local_services.compatibility_redirect?.anchor !== 'services'
  ) {
    throw new Error('Settings Local Services must redirect to Maintenance#services');
  }
  if (pages.settings_environment.module_path_source_policy_ref !== 'module_path_source_policy') {
    throw new Error('Settings Environment must reference the App GUI module path source policy');
  }
  if (
    !pages.settings_environment.must_show?.includes(
      'check, apply, repair, rollback, and package maintenance directly on the daily Maintenance page with progressive confirmation and fresh readback',
    ) ||
    !pages.settings_environment.must_show?.includes(
      'one advanced read-only diagnostics disclosure for localized component, path, and receipt evidence',
    ) ||
    !pages.settings_environment.must_not_show?.includes(
      'a separate large management modal overlapping the advanced diagnostics disclosure',
    ) ||
    !pages.settings_environment.must_not_show?.includes(
      'raw internal status keys, action ids, command mappings, or payload field names anywhere in user-facing Maintenance UI',
    )
  ) {
    throw new Error('Settings Maintenance must own daily actions and one read-only diagnostics disclosure without overlapping modals or raw keys');
  }
  const maintenanceActionPolicy = pages.settings_environment.maintenance_action_policy;
  assertDeepEqualJson(
    maintenanceActionPolicy?.required_action_roles,
    [
      'refresh_status',
      'check_updates',
      'apply_update',
      'repair_component',
      'rollback_component',
      'bootstrap_missing_opl_base',
      'update_opl_app',
      'install_or_update_opl_package',
      'repair_or_uninstall_opl_package',
    ],
    'Settings Maintenance daily action roles',
  );
  if (
    maintenanceActionPolicy?.advanced_actions_policy !==
      'nonrecommended actions stay in the same page action area or progressive confirmation and never move into diagnostics or a second large management modal' ||
    maintenanceActionPolicy?.surface_owner_policy !==
      'daily_Maintenance_page_owns_check_apply_repair_and_rollback'
  ) {
    throw new Error('Settings Maintenance actions must stay on the page and outside the read-only diagnostics disclosure');
  }
  validateEnvironmentModuleMaintenanceEntry(pages.settings_environment.module_maintenance_entry, 'Settings Environment');
  if (!pages.settings_environment.must_not_show?.includes('Med Deep Scientist as a default module')) {
    throw new Error('Settings Environment must keep MDS out of default module display');
  }
  if (
    pages.settings_environment.software_lifecycle_ref !==
    'contracts/app-release-channel.json#managed_update_plane.software_lifecycle'
  ) {
    throw new Error('Settings Environment must reference the canonical three-object software lifecycle');
  }
  validateFrameworkModuleMaintenanceEntry(guiContract.framework_surfaces?.managed_update_plane?.ordinary_module_maintenance_entry);
  const carrierReconcile = guiContract.framework_surfaces?.managed_update_plane?.carrier_reconciliation;
  if (
    carrierReconcile?.contract_ref !== 'contracts/app-release-channel.json#managed_update_plane.carrier_reconciliation' ||
    carrierReconcile?.trigger !== 'app_startup_after_core_ready_when_running_app_version_checkpoint_is_missing_or_changed' ||
    carrierReconcile?.installation_source_scope !== 'all_supported_app_carriers' ||
    carrierReconcile?.installation_source_registry_ref !==
      'contracts/app-install-exposure-policy.json#installer_surfaces+distribution_channels' ||
    carrierReconcile?.execution_owner !== 'one-person-lab' ||
    carrierReconcile?.catalog_source !== 'framework_managed_update_plan' ||
    carrierReconcile?.app_catalog_allowed !== false ||
    carrierReconcile?.app_role !== 'request_and_project_framework_terminal_readback_and_apply_receipts_only' ||
    carrierReconcile?.idempotency !== 'once_per_running_app_version_or_image_digest_and_carrier_identity' ||
    carrierReconcile?.readback !== 'opl app state --profile fast --json#managed_update' ||
    carrierReconcile?.silent_apply_source !== 'framework_plan_auto_apply.eligible_and_app_background_safe_with_command_ref' ||
    carrierReconcile?.direct_skill_delete_allowed !== false ||
    carrierReconcile?.direct_agents_write_allowed !== false
  ) {
    throw new Error('App GUI must request carrier-neutral Framework reconciliation and project terminal readback plus apply receipts without a second catalog');
  }
  assertDeepEqualJson(
    carrierReconcile?.projection_prefetch,
    {
      command: 'opl update status --json',
      publish_when: 'valid_typed_status_readback_available',
      purpose: 'make_framework_typed_state_available_before_network_check_and_plan_complete',
      failure_policy: 'continue_reconciliation_without_clearing_last_valid_projection',
    },
    'App GUI carrier reconciliation projection prefetch',
  );
  assertDeepEqualJson(
    carrierReconcile?.command_sequence,
    [
      'opl update check --json',
      'opl update plan --json',
      'opl update apply --json',
      'opl update status --json',
    ],
    'App GUI carrier reconciliation command sequence',
  );
  assertDeepEqualJson(carrierReconcile?.software_object_scope, ['opl_base', 'opl_packages'], 'App GUI carrier reconciliation scope');
  if (pages.settings_storage.release_contract_ref !== 'contracts/app-release-channel.json#local_data_lifecycle') {
    throw new Error('Settings Storage must reference the App local data lifecycle contract');
  }
  const storageUnavailableExperience = guiContract.ui_experience_contract?.settings_details?.storage_unavailable;
  assertDeepEqualJson(
    storageUnavailableExperience?.required_information,
    ['localized_reason', 'user_visible_context_and_impact', 'recovery_action'],
    'App GUI Storage unavailable information',
  );
  assertDeepEqualJson(
    storageUnavailableExperience?.presentation_variants,
    storageAvailabilityPresentationVariants,
    'App GUI Storage availability presentation variants',
  );
  assertDeepEqualJson(
    storageUnavailableExperience?.user_visible_implementation_terms_forbidden,
    storageUserVisibleImplementationTermsForbidden,
    'App GUI Storage user-visible implementation terms',
  );
  assertDeepEqualJson(
    pages.settings_storage.unavailable_state?.presentation_variants,
    storageAvailabilityPresentationVariants,
    'Settings Storage availability presentation variants',
  );
  assertDeepEqualJson(
    pages.settings_storage.unavailable_state?.required_information,
    ['localized_reason', 'user_visible_context_and_impact', 'recovery_action'],
    'Settings Storage unavailable information',
  );
  assertDeepEqualJson(
    pages.settings_storage.unavailable_state?.user_visible_implementation_terms_forbidden,
    storageUserVisibleImplementationTermsForbidden,
    'Settings Storage user-visible implementation terms',
  );
  if (
    storageUnavailableExperience?.refresh_only_empty_state_allowed !== false ||
    pages.settings_storage.unavailable_state?.refresh_only_allowed !== false ||
    pages.settings_storage.unavailable_state?.raw_host_path_visible !== false
  ) {
    throw new Error('Settings Storage availability states must remain actionable without exposing raw host paths');
  }
  if (
    pages.settings_storage.state_source !==
      'active shell local data lifecycle service + Framework and carrier-host owner projections from opl app state --profile fast --json + contracts/app-release-channel.json#local_data_lifecycle'
  ) {
    throw new Error('Settings Storage must merge Shell lifecycle state with Framework and carrier-host owner projections');
  }
  assertDeepEqualJson(
    pages.settings_storage.cleanup_preview_interaction,
    {
      presentation: 'modal_item_selector_before_confirmation',
      required_summary_fields: [
        'category_total_bytes',
        'candidate_count',
        'candidate_bytes',
        'selected_bytes',
        'retained_bytes',
        'retained_reason',
      ],
      candidate_presentation: {
        selection: 'checkbox_per_candidate_default_selected',
        visible_fields: ['friendly_name', 'bytes', 'localized_reason'],
        raw_path: 'collapsed_technical_detail_only',
      },
      inventory_composition_presentation: {
        source: 'same_inventory_snapshot_as_category_total',
        visible_fields: ['root_friendly_name', 'bytes', 'cleanup_boundary', 'localized_reason'],
        boundary_states: ['covered_by_this_cleanup', 'reported_only_not_cleanable_here'],
        raw_path: 'collapsed_technical_detail_only',
      },
      retained_presentation: 'always_explain_total_minus_candidates_and_why_it_is_not_selectable',
      execution_policy: {
        selection_scope: 'non_empty_subset_of_exact_dry_run_candidates_only',
        empty_selection: 'disabled',
        revalidation: 'full_plan_hash_live_authority_and_selected_subset_membership_before_delete',
      },
    },
    'Settings Storage cleanup preview interaction',
  );
  const ownerStorage = pages.settings_storage.owner_storage_projections;
  assertDeepEqualJson(
    ownerStorage?.sections,
    ['agent_package_store', 'webui_data_volume'],
    'Settings Storage owner projection sections',
  );
  assertDeepEqualJson(
    ownerStorage?.common_required_fields,
    ['status', 'observed_at', 'stale', 'bytes', 'reclaimable_bytes', 'owner_route', 'projected_action'],
    'Settings Storage owner projection fields',
  );
  assertDeepEqualJson(
    ownerStorage?.status_presentation_policy,
    {
      never_observed:
        'not_inventoried_when_observed_at_null_and_inventory_cache_missing_or_invalid_never_out_of_date',
      observed_stale: 'out_of_date_only_when_observed_at_present_and_stale_true',
      not_configured: 'not_configured_without_out_of_date_or_zero_bytes',
      attention_required: 'usage_unavailable_with_localized_reason_never_raw_reason_code',
      unknown_bytes: 'awaiting_inventory_when_never_observed_else_usage_unavailable_never_zero',
    },
    'Settings Storage owner projection status presentation policy',
  );
  if (
    ownerStorage?.projection_source !== 'opl app state --profile fast --json' ||
    ownerStorage?.missing_projection_policy !== 'fail_open_keep_shell_owned_categories_available' ||
    ownerStorage?.unknown_bytes_policy !== 'unavailable_never_zero' ||
    ownerStorage?.agent_package_store?.owner_route !== '/settings/agents' ||
    ownerStorage?.agent_package_store?.direct_storage_mutation_allowed !== false ||
    ownerStorage?.webui_data_volume?.data_volume_mapping !== 'OnePersonLab/data -> /data' ||
    ownerStorage?.webui_data_volume?.host_action_capability_id !== appOwnedWebuiDataVolumeHostActionCapabilityId ||
    ownerStorage?.webui_data_volume?.host_action_abi_ref !== appOwnedWebuiDataVolumeHostActionAbiRef ||
    ownerStorage?.webui_data_volume?.generic_docker_prune_allowed !== false ||
    ownerStorage?.webui_data_volume?.shell_direct_path_delete_allowed !== false
  ) {
    throw new Error('Settings Storage owner projections must remain fail-open and owner-routed without direct Shell cleanup');
  }
  assertDeepEqualJson(
    pages.settings_storage.storage_carrier_behavior,
    appOwnedStorageCarrierBehavior,
    'Settings Storage carrier behavior',
  );
  validateReadOnlyStorageLifecycleSurface(
    pages.settings_storage.read_only_lifecycle_surface,
    'Settings Storage read-only lifecycle surface',
  );
  if (!pages.about.must_show?.includes('App release channel')) {
    throw new Error('About page must show the App release channel');
  }
  if (
    !pages.about.must_show?.includes('cached update status from the one startup check or last manual check') ||
    !pages.about.must_show?.includes('one Check for updates action') ||
    !pages.about.must_not_show?.includes('about redirected to Advanced') ||
    pages.about.product_page_id !== 'about'
  ) {
    throw new Error('About must remain independent with version, channel, and update status');
  }
  assertDeepEqualJson(
    pages.about.updater_state_policy,
    appOwnedSettingsAboutUpdaterStatePolicy,
    'About updater state policy',
  );
  if (
    pages.update?.page_kind !== 'compatibility_redirect' ||
    pages.update.compatibility_redirect?.target_route_id !== 'environment' ||
    pages.update.compatibility_redirect?.anchor !== 'updates'
  ) {
    throw new Error('Update must redirect to Maintenance#updates');
  }
  if (
    pages.settings_theme.product_page_id !== 'preferences' ||
    !pages.settings_theme.must_show?.includes('application behavior and notifications in a full-width group') ||
    !pages.settings_theme.must_show?.includes(
      'reply waiting time, idle-assistant release, and hardware acceleration in a named performance and background activity group',
    ) ||
    !pages.settings_theme.must_show?.includes('System, Light, and Dark appearance choices under the display anchor') ||
    !pages.settings_theme.must_not_show?.includes('CSS theme preset gallery or Codex preset selector') ||
    !pages.settings_theme.must_not_show?.includes('custom theme editor in the ordinary Preferences surface')
  ) {
    throw new Error('Settings Preferences must expose behavior, performance, and governed appearance configuration');
  }
  if (
    pages.settings_personalization?.page_kind !== 'compatibility_redirect' ||
    pages.settings_personalization.compatibility_redirect?.target_route_id !== 'workspace' ||
    pages.settings_personalization.compatibility_redirect?.anchor !== 'personalization'
  ) {
    throw new Error('Personalization must redirect to Workspace#personalization');
  }
  validateRuntimeCockpitPreservationPolicy(
    guiContract.interaction_baseline?.feature_preservation_policy?.runtime_preservation_gate,
    'App GUI Runtime cockpit preservation gate',
  );
  const runtimeStatus = pages.runtime_status;
  if (
    runtimeStatus &&
    (runtimeStatus.route_classification !== 'core_dynamic_agent_runtime' ||
      runtimeStatus.default_product_requirement !== true ||
      runtimeStatus.default_release_gate !== true ||
      runtimeStatus.adopted_shell_requirement !== true ||
      runtimeStatus.explicit_validation_command !== 'npm run validate:runtime-route')
  ) {
    throw new Error('Core Runtime route must remain required by the default release gate and adopted shells');
  }
  validateTaskAwarenessProjectionContract(
    guiContract.framework_surfaces?.task_awareness,
    'App GUI framework task awareness',
  );
  validateStructuredResultPanelProjectionContract(
    guiContract.framework_surfaces?.structured_result_panel,
    'App GUI framework structured result panel',
  );
  validateRefLevelFollowUpProjectionContract(
    guiContract.framework_surfaces?.ref_level_follow_up,
    'App GUI framework ref-level follow-up',
  );
  validateWorkflowSkillCandidateProjectionContract(
    guiContract.framework_surfaces?.workflow_skill_candidate,
    'App GUI framework workflow/skill candidate',
  );
  if ('docker_webui' in guiContract) {
    throw new Error('App GUI contract must not include withdrawn Docker/WebUI username, title, logo, or branding requirements');
  }
}

function validateFrameworkModuleMaintenanceEntry(entry) {
  if (
    entry?.settings_page !== 'settings_environment' ||
    entry?.display_role !== 'user_facing_module_maintenance_entry' ||
    entry?.app_role !== 'managed_update_status_action_consumer_only' ||
    entry?.kernel_implementation_allowed !== false ||
    entry?.domain_truth_write_allowed !== false ||
    entry?.developer_checkout_silent_update_allowed !== false ||
    entry?.dirty_checkout_silent_update_allowed !== false
  ) {
    throw new Error('App GUI managed update plane must expose module maintenance under Local Environment without owning the update kernel');
  }
  if (
    entry?.module_collection_source !== 'app_state.modules.items[]' ||
    entry?.module_collection_policy !==
      'render every Framework-projected Package module without an App Package-id allowlist' ||
    'must_include_modules' in entry
  ) {
    throw new Error('App GUI framework module maintenance must consume the dynamic Framework module collection');
  }
  assertDeepEqualJson(
    entry?.status_sources,
    ['opl app state --profile fast --json#managed_update', 'opl update status --json#managed_update'],
    'App GUI framework module maintenance status sources',
  );
  if (
    entry?.projected_action_source !== 'app_state.agent_packages.directory.entries[].available_actions[]' ||
    entry?.ordinary_action_policy !==
      'navigate_to_Settings_Agents_and_execute_only_the_selected_row_projected_action' ||
    entry?.private_command_mapping_allowed !== false ||
    'manual_action_mapping' in entry
  ) {
    throw new Error('App GUI framework module maintenance must delegate Package actions to the dynamic Agents directory');
  }
}
