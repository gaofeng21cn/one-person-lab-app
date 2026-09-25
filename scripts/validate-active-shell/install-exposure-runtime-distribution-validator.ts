import { assertDeepEqualJson, assertIncludesAll } from './assertions.ts';
import { temporalLocalServiceDefaults, temporalManagedCommands } from './app-contract-constants.ts';

export function validateInstallExposureRuntimeAndDistribution(policy) {
  validateSoftwareLifecycle(policy.software_lifecycle);
  validateTemporalAutoConfiguration(policy.temporal_auto_configuration);
  validateHomebrewDistribution(policy.distribution_channels?.homebrew);
  validateReleaseValidation(policy.release_validation);
}

function validateSoftwareLifecycle(lifecycle) {
  assertDeepEqualJson(lifecycle?.public_objects, ['opl_base', 'opl_app', 'opl_packages'], 'Install exposure public software objects');
  assertDeepEqualJson(lifecycle?.lifecycle_owners, {
    opl_base: 'one-person-lab',
    opl_app: 'one-person-lab-app',
    opl_packages: 'configured_carrier',
  }, 'Install exposure lifecycle owners');
  assertDeepEqualJson(lifecycle?.app_mutation_scope, ['opl_app'], 'Install exposure App mutation scope');
  assertDeepEqualJson(lifecycle?.app_projection_scope, ['opl_base', 'opl_packages'], 'Install exposure App projection scope');
  if (
    lifecycle?.schema !== 'opl_software_lifecycle.v1' ||
    lifecycle?.ordinary_component_picker_allowed !== false ||
    lifecycle?.legacy_component_mapping_allowed !== false ||
    lifecycle?.package_lifecycle_carrier !== 'configured_carrier' ||
    Object.hasOwn(lifecycle ?? {}, 'transaction_internal_states')
  ) {
    throw new Error('Install exposure must use the three-object software lifecycle without legacy mappings or a component picker');
  }
  const threeLayer = lifecycle?.three_layer_contract;
  if (
    threeLayer?.installation_source?.role !== 'candidate_bytes_and_offline_seeds_only' ||
    threeLayer?.installation_source?.scope !== 'all_supported_app_carriers' ||
    threeLayer?.installation_source?.app_carrier_registry_ref !== 'installer_surfaces+distribution_channels' ||
    threeLayer?.installation_source?.may_define_base_or_package_currentness !== false ||
    threeLayer?.management_path?.owner !== 'configured_carrier' ||
    threeLayer?.management_path?.projection_ref !== 'agent_installation_contract' ||
    threeLayer?.management_path?.app_role !== 'submit_projected_actions_and_render_fresh_readback' ||
    threeLayer?.management_path?.app_side_dependency_or_package_update_catalog_allowed !== false ||
    threeLayer?.user_behavior?.carrier_choice_changes_post_launch_behavior !== false ||
    threeLayer?.user_behavior?.clean_opl_managed_targets_may_update_silently !== true ||
    threeLayer?.user_behavior?.dirty_developer_or_user_managed_targets_are_attention_only !== true ||
    threeLayer?.user_behavior?.packages_usually_activate_immediately_and_may_request_codex_refresh !== true ||
    threeLayer?.user_behavior?.base_runtime_and_app_activate_on_restart_with_rollback !== true
  ) {
    throw new Error('Install exposure must freeze source, Framework management, and user behavior as three separate layers');
  }
  if (
    lifecycle?.base_bootstrap?.bootstrap_route !== 'opl-install.sh --headless --skip-packages' ||
    lifecycle?.base_bootstrap?.executor_owner !== 'one-person-lab' ||
    lifecycle?.base_bootstrap?.mutation_owner !== 'one-person-lab' ||
    lifecycle?.base_bootstrap?.receipt_owner !== 'one-person-lab' ||
    lifecycle?.base_bootstrap?.app_role !== 'request_progress_and_receipt_projection_only' ||
    lifecycle?.base_bootstrap?.app_must_not_implement_installer !== true
  ) {
    throw new Error('Install exposure missing OPL Base bootstrap must stay Framework-owned and App-requested');
  }
  const adapters = lifecycle?.carrier_adapters ?? {};
  for (const id of ['homebrew_formula', 'framework_installer']) {
    if (adapters[id]?.carries !== 'opl_base' || adapters[id]?.lifecycle_owner !== 'one-person-lab') {
      throw new Error(`Install exposure ${id} must be a Framework-owned OPL Base carrier`);
    }
  }
  for (const id of ['homebrew_cask', 'signed_installer_or_dmg']) {
    if (adapters[id]?.carries !== 'opl_app' || adapters[id]?.lifecycle_owner !== 'one-person-lab-app') {
      throw new Error(`Install exposure ${id} must be an App-owned OPL App carrier`);
    }
  }
  assertDeepEqualJson(adapters.homebrew_cask?.payload_profiles, {
    standard: ['opl_app'],
    nightly: ['opl_app'],
    full: ['opl_app', 'opl_base_offline_seed', 'opl_package_offline_seeds'],
  }, 'Install exposure Homebrew Cask payload profiles');
  assertDeepEqualJson(adapters.signed_installer_or_dmg?.payload_profiles, {
    standard: ['opl_app'],
    full: ['opl_app', 'opl_base_offline_seed', 'opl_package_offline_seeds'],
  }, 'Install exposure DMG payload profiles');
  if (
    adapters.homebrew_cask?.full_seed_activation_owner !== 'one-person-lab' ||
    adapters.signed_installer_or_dmg?.full_seed_activation_owner !== 'one-person-lab'
  ) {
    throw new Error('Install exposure Full payload seeds must be activated by the Framework owner');
  }
}

function validateTemporalAutoConfiguration(temporalAutoConfig) {
  if (
    temporalAutoConfig?.owner !== 'one-person-lab' ||
    temporalAutoConfig?.app_role !== 'configure_defaults_and_surface_readiness_not_provider_implementation' ||
    temporalAutoConfig?.provider_env_default !== 'OPL_FAMILY_RUNTIME_PROVIDER=temporal'
  ) {
    throw new Error('Install exposure Temporal auto-configuration must keep OPL owner and App default configuration role');
  }
  assertDeepEqualJson(
    temporalAutoConfig.local_service_defaults,
    temporalLocalServiceDefaults,
    'Install exposure Temporal local service defaults',
  );
  assertDeepEqualJson(
    temporalAutoConfig.managed_commands,
    temporalManagedCommands,
    'Install exposure Temporal managed commands',
  );
  if (
    temporalAutoConfig.first_run_policy?.ready_to_launch_blocking !== false ||
    temporalAutoConfig.first_run_policy?.full_readiness_item !== 'family_runtime_provider' ||
    temporalAutoConfig.first_run_policy?.background_maintenance_owner !== 'app_or_cli_managed_background_maintenance'
  ) {
    throw new Error('Install exposure Temporal first-run policy must keep provider readiness non-blocking and background-managed');
  }
  assertIncludesAll(
    temporalAutoConfig.first_run_policy?.required_diagnostics,
    [
      'temporal_cli_version',
      'temporal_service_lifecycle',
      'temporal_service_supervisor_state',
      'temporal_worker_lifecycle_status',
      'worker_dependency_health',
    ],
    'Install exposure Temporal diagnostics',
  );
  if (
    temporalAutoConfig.startup_maintenance_policy?.must_reconcile_temporal_service_supervisor_before_worker !== true ||
    JSON.stringify(temporalAutoConfig.startup_maintenance_policy?.login_reconciliation_order) !==
      JSON.stringify(['temporal_service_supervisor', 'temporal_worker_supervisor', 'temporal_scheduler'])
  ) {
    throw new Error('Install exposure Temporal startup maintenance must reconcile service, worker, then scheduler');
  }
  if (
    temporalAutoConfig.packaged_runtime_policy?.full_wrapper_must_export_defaults !== true ||
    temporalAutoConfig.packaged_runtime_policy?.must_include_temporal_cli_wrapper !== true ||
    temporalAutoConfig.packaged_runtime_policy?.temporal_cli_wrapper_must_execute_offline_archive !== true ||
    temporalAutoConfig.packaged_runtime_policy?.must_include_temporal_node_runtime_packages !== true ||
    temporalAutoConfig.packaged_runtime_policy?.must_exclude_temporal_testing_package !== true ||
    temporalAutoConfig.packaged_runtime_policy?.service_supervisor_launcher_policy !==
      'canonical_executable_realpath_or_packaged_runtime_path_never_repo_TypeScript_checkout' ||
    temporalAutoConfig.packaged_runtime_policy?.service_supervisor_platform_scope !==
      'desktop_macos_local_managed_service' ||
    temporalAutoConfig.packaged_runtime_policy?.service_supervisor_persistent_database_path !==
      '${HOME}/Library/Application Support/OPL/state/family-runtime/temporal-server/temporal.sqlite' ||
    temporalAutoConfig.packaged_runtime_policy?.service_supervisor_persistent_database_argument !== '--db-filename' ||
    temporalAutoConfig.packaged_runtime_policy?.native_core_bridge_target !== 'aarch64-apple-darwin'
  ) {
    throw new Error('Install exposure Temporal packaged runtime policy must require wrapper defaults and macOS arm64 runtime payloads');
  }
  assertIncludesAll(
    temporalAutoConfig.fail_closed_states,
    [
      'missing_temporal_cli_wrapper',
      'missing_temporal_node_runtime_package',
      'temporal_worker_dependency_unavailable',
      'temporal_service_supervisor_unready',
      'temporal_service_supervisor_configuration_drift',
      'temporal_local_service_stale_state',
      'temporal_worker_process_exited',
      'temporal_worker_source_stale',
    ],
    'Install exposure Temporal fail-closed states',
  );
}

function validateHomebrewDistribution(homebrew) {
  validateHomebrewTransportBoundary(homebrew);
  validateFrameworkCoreCarrier(homebrew);
  validateHomebrewCaskNames(homebrew);
  validateHomebrewUserTargets(homebrew);
  validateHomebrewAgentPackPolicy(homebrew);
}

function validateFrameworkCoreCarrier(homebrew) {
  const carrier = homebrew?.framework_core_carrier;
  if (
    carrier?.component !== 'opl_framework' ||
    carrier?.selection_policy !== 'developer_mode_then_install_origin_and_formula_availability_then_compatibility_handshake'
  ) {
    throw new Error('Install exposure OPL Framework carrier must select developer mode or install-origin carrier before compatibility handshake');
  }
  assertDeepEqualJson(
    homebrew.formulae,
    { framework_core: 'opl' },
    'Install exposure Homebrew Framework formula carrier',
  );
  assertDeepEqualJson(
    carrier.locator_precedence,
    [
      {
        install_origin: 'explicit_developer_mode',
        carrier: 'developer_checkout',
        locator: '<selected-workspace>/one-person-lab',
      },
      {
        install_origin: 'homebrew_cask',
        carrier: 'system_homebrew_formula',
        formula: 'opl',
        locator: '/opt/homebrew/bin/opl or /usr/local/bin/opl',
        origin_evidence: 'Homebrew Caskroom receipt',
      },
      {
        install_origin: 'dmg_or_direct_download',
        carrier: 'framework_managed_install',
        locator: '~/.opl/one-person-lab',
        installer: 'opl-install.sh --headless --skip-packages',
      },
    ],
    'Install exposure OPL Framework locator precedence',
  );
  assertDeepEqualJson(
    carrier.pre_formula_transition,
    {
      allowed: true,
      condition: 'homebrew_cask_receipt_present_and_formula_absent',
      carrier: 'framework_managed_install',
      locator: '~/.opl/one-person-lab',
      installer: 'opl-install.sh --headless --skip-packages',
      selection_status: 'pre_formula_transition',
      must_end_when_formula_available: true,
      incompatible_formula_must_not_fallback: true,
      creates_second_framework_semantics: false,
    },
    'Install exposure OPL Framework pre-Formula transition',
  );
  assertDeepEqualJson(
    carrier.compatibility_handshake,
    {
      required_before_activation: true,
      protected_consumer_surface: 'opl app state --profile fast --json',
      producer_owner: 'one-person-lab',
      app_requirement_owner: 'one-person-lab-app',
      required_package_name: 'opl-framework',
      required_capability_source_ref:
        'contracts/opl-framework/app-component-compatibility-receipt-contract.json#producer_observation.capabilities[].capability_id',
      required_capability_ids: ['opl_dynamic_package_directory'],
      required_capability_match: 'all',
      optional_enhancement_capabilities: [
        {
          capability_id: 'opl_app.domain_detail_views.v2',
          policy_ref:
            'contracts/app-runtime-bridge.json#work_item_projection.field_contracts.domain_detail_views',
          availability_source: 'producer_capability_ids',
          missing_behavior: 'allow_app_state_activation_and_hide_dependent_detail_surfaces',
        },
      ],
      framework_api_version_policy: {
        recognized_marker: 'p19.stage-runtime',
        marker_alone_sufficient: false,
      },
      fail_closed_on_missing_required_capability_or_incompatible_framework: true,
      missing_required_capability_policy: {
        compatibility_status: 'incompatible_missing_required_capability',
        app_state_activation_allowed: false,
        recovery_owner: 'one-person-lab',
        app_role: 'request_canonical_bootstrap_or_update_and_project_receipts_only',
        canonical_bootstrap_ref:
          'contracts/app-release-channel.json#managed_update_plane.software_lifecycle.public_actions.bootstrap_missing_opl_base',
        canonical_update_ref:
          'contracts/app-release-channel.json#managed_update_plane.software_lifecycle.public_actions.apply_eligible_updates',
        canonical_reconciliation_ref:
          'contracts/app-release-channel.json#managed_update_plane.carrier_reconciliation',
        app_direct_base_mutation_allowed: false,
      },
      missing_optional_enhancement_policy: {
        app_state_activation_allowed: true,
        global_recovery_required: false,
        dependent_surface_policy_ref:
          'contracts/app-runtime-bridge.json#work_item_projection.field_contracts.domain_detail_views.absence_policy',
      },
      receipt_fields: [
        'selected_carrier',
        'framework_version',
        'framework_api_version',
        'app_required_api_range',
        'producer_capability_ids',
        'required_capability_ids',
        'missing_required_capability_ids',
        'compatibility_status',
        'selection_status',
        'active_framework_count',
      ],
    },
    'Install exposure OPL Framework compatibility handshake',
  );
  assertDeepEqualJson(
    carrier.activation_invariants,
    {
      active_framework_count: 1,
      dual_runtime_allowed: false,
      split_brain_allowed: false,
      second_framework_fallback_may_activate: false,
    },
    'Install exposure OPL Framework activation invariants',
  );
  assertDeepEqualJson(
    carrier.release_authority,
    {
      app_carrier_release_truth_owner: 'one-person-lab-app',
      opl_base_release_truth_owner: 'one-person-lab',
      app_release_must_not_publish_or_promote_opl_base: true,
    },
    'Install exposure OPL Framework release authority',
  );
}

function validateHomebrewTransportBoundary(homebrew) {
  if (
    homebrew?.role !== 'app_cask_and_framework_formula_install_index' ||
    homebrew?.tap !== 'gaofeng21cn/one-person-lab' ||
    homebrew?.must_not_own_agent_semantics !== true ||
    homebrew?.must_not_write_user_codex_state !== true ||
    homebrew?.user_state_activation_owner !== 'opl_framework'
  ) {
    throw new Error('Install exposure Homebrew distribution must index only App casks and the Framework formula, and delegate activation to OPL Framework');
  }
  assertDeepEqualJson(homebrew.carrier_adapter_semantics, {
    formula: {
      object: 'opl_base',
      formula: 'opl',
      lifecycle_owner: 'one-person-lab',
      packages_allowed: false,
    },
    cask: {
      object: 'opl_app',
      lifecycle_owner: 'one-person-lab-app',
      base_or_packages_mutation_allowed: false,
      payload_profiles: {
        standard: ['opl_app'],
        nightly: ['opl_app'],
        full: ['opl_app', 'opl_base_offline_seed', 'opl_package_offline_seeds'],
      },
      full_seed_activation_owner: 'one-person-lab',
      post_launch_reconcile_ref: 'contracts/app-release-channel.json#managed_update_plane.carrier_reconciliation',
    },
    equivalent_direct_carriers: {
      opl_base: 'framework_installer',
      opl_app: 'signed_installer_or_dmg',
    },
  }, 'Install exposure Homebrew carrier adapter semantics');
  assertIncludesAll(
    homebrew.activation_commands,
    ['opl packages update --json', 'opl connect sync-skills'],
    'Install exposure Homebrew activation commands',
  );
}

function validateHomebrewCaskNames(homebrew) {
  if (
    homebrew.casks?.standard_app !== 'one-person-lab' ||
    homebrew.casks?.nightly_standard_app !== 'one-person-lab-nightly' ||
    homebrew.casks?.full_first_install_app !== 'one-person-lab-full' ||
    homebrew.full_first_install_cask?.name !== 'one-person-lab-full' ||
    homebrew.full_first_install_cask?.standard_updater_visible !== false
  ) {
    throw new Error('Install exposure Homebrew cask names must match the App-only distribution channel contract');
  }
}

function validateHomebrewUserTargets(homebrew) {
  assertDeepEqualJson(
    homebrew.allowed_user_targets,
    ['Casks/one-person-lab.rb', 'Casks/one-person-lab-nightly.rb', 'Casks/one-person-lab-full.rb'],
    'Install exposure Homebrew allowed user targets',
  );
  assertDeepEqualJson(
    homebrew.initial_live_targets,
    ['Casks/one-person-lab.rb', 'Casks/one-person-lab-nightly.rb', 'Casks/one-person-lab-full.rb'],
    'Install exposure Homebrew initial live targets',
  );
  assertDeepEqualJson(
    homebrew.forbidden_formulae,
    ['one-person-lab-modules', 'one-person-lab-modules-nightly'],
    'Install exposure Homebrew forbidden formulae',
  );
}

function validateHomebrewAgentPackPolicy(homebrew) {
  assertDeepEqualJson(homebrew.opl_packages_boundary, {
    lifecycle_owner: 'one-person-lab',
    app_role: 'status_action_and_receipt_projection_only',
    canonical_lifecycle: 'opl packages',
    homebrew_distribution_allowed: false,
    homebrew_formula_allowed: false,
    ordinary_component_picker_allowed: false,
  }, 'Install exposure Homebrew OPL Packages boundary');
}

function validateReleaseValidation(validation) {
  if (validation?.structural_gate !== 'node --experimental-strip-types scripts/validate-active-shell.ts --quick') {
    throw new Error('Install exposure release validation structural gate must be validate-active-shell --quick');
  }
  assertDeepEqualJson(
    validation?.stable_install_gates,
    [
      'standard_dmg_clean_vm_smoke',
      'full_dmg_clean_vm_smoke',
      'docker_webui_smoke',
    ],
    'Install exposure Stable/add-on gates',
  );
  assertDeepEqualJson(
    validation?.post_publication_optional_certification_surfaces,
    [
      'stable_shell_upgrade_routes',
      'homebrew_standard_cask_clean_vm_smoke',
      'one_shot_app_installer_fresh_install_smoke',
    ],
    'Install exposure post-publication optional certification surfaces',
  );
  assertDeepEqualJson(
    validation?.same_candidate_prepublication_clean_install_gates,
    ['standard_dmg_clean_vm_smoke', 'full_dmg_clean_vm_smoke'],
    'Install exposure same-candidate clean-install gates',
  );
}
