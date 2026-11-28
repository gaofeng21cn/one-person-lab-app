import { assertDeepEqualJson, assertFieldsMatch, assertIncludesAll } from './assertions.ts';
export function validateInstallExposureRuntimeAndDistribution(policy) {
  validateSoftwareLifecycle(policy.software_lifecycle);
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
  assertDeepEqualJson(homebrew.formulae, { framework_core: 'opl' }, 'Install exposure Homebrew Framework formula carrier');
  assertDeepEqualJson(
    carrier.locator_precedence?.map((entry) => entry?.install_origin),
    ['explicit_developer_mode', 'homebrew_cask', 'dmg_or_direct_download'],
    'Install exposure OPL Framework locator precedence order',
  );
  assertDeepEqualJson(
    carrier.locator_precedence?.map((entry) => entry?.carrier),
    ['developer_checkout', 'system_homebrew_formula', 'framework_managed_install'],
    'Install exposure OPL Framework locator carriers',
  );
  assertFieldsMatch(carrier.pre_formula_transition, {
    allowed: true,
    condition: 'homebrew_cask_receipt_present_and_formula_absent',
    carrier: 'framework_managed_install',
    must_end_when_formula_available: true,
    incompatible_formula_must_not_fallback: true,
    creates_second_framework_semantics: false,
  }, 'Install exposure OPL Framework pre-Formula transition');
  const handshake = carrier.compatibility_handshake;
  assertFieldsMatch(handshake, {
    required_before_activation: true,
    protected_consumer_surface: 'opl app state --profile fast --json',
    producer_owner: 'one-person-lab',
    app_requirement_owner: 'one-person-lab-app',
    required_package_name: 'opl-framework',
    required_capability_match: 'all',
    fail_closed_on_missing_required_capability_or_incompatible_framework: true,
  }, 'Install exposure OPL Framework compatibility handshake');
  assertDeepEqualJson(handshake?.required_capability_ids, ['opl_dynamic_package_directory'], 'Install exposure OPL Framework compatibility handshake required capability ids');
  assertFieldsMatch(handshake?.framework_api_version_policy, {
    recognized_marker: 'p19.stage-runtime',
    marker_alone_sufficient: false,
  }, 'Install exposure OPL Framework compatibility handshake api_version');
  assertFieldsMatch(handshake?.missing_required_capability_policy, {
    compatibility_status: 'incompatible_missing_required_capability',
    app_state_activation_allowed: false,
    recovery_owner: 'one-person-lab',
    app_role: 'request_canonical_bootstrap_or_update_and_project_receipts_only',
    app_direct_base_mutation_allowed: false,
  }, 'Install exposure OPL Framework compatibility handshake missing_required');
  assertFieldsMatch(handshake?.missing_optional_enhancement_policy, {
    app_state_activation_allowed: true,
    global_recovery_required: false,
  }, 'Install exposure OPL Framework compatibility handshake missing_optional');
  assertIncludesAll(handshake?.receipt_fields, [
    'selected_carrier', 'framework_version', 'framework_api_version', 'app_required_api_range',
    'producer_capability_ids', 'required_capability_ids', 'compatibility_status', 'active_framework_count',
  ], 'Install exposure OPL Framework compatibility handshake receipt_fields');
  assertFieldsMatch(carrier.activation_invariants, {
    active_framework_count: 1,
    dual_runtime_allowed: false,
    split_brain_allowed: false,
    second_framework_fallback_may_activate: false,
  }, 'Install exposure OPL Framework activation invariants');
  assertFieldsMatch(carrier.release_authority, {
    app_carrier_release_truth_owner: 'one-person-lab-app',
    opl_base_release_truth_owner: 'one-person-lab',
    app_release_must_not_publish_or_promote_opl_base: true,
  }, 'Install exposure OPL Framework release authority');
}

function validateHomebrewTransportBoundary(homebrew) {
  assertFieldsMatch(homebrew, {
    role: 'app_cask_and_framework_formula_install_index',
    tap: 'gaofeng21cn/one-person-lab',
    must_not_own_agent_semantics: true,
    must_not_write_user_codex_state: true,
    user_state_activation_owner: 'opl_framework',
  }, 'Install exposure Homebrew distribution');
  assertFieldsMatch(homebrew.carrier_adapter_semantics?.formula, {
    object: 'opl_base',
    formula: 'opl',
    lifecycle_owner: 'one-person-lab',
    packages_allowed: false,
  }, 'Install exposure Homebrew Formula semantics');
  assertFieldsMatch(homebrew.carrier_adapter_semantics?.cask, {
    object: 'opl_app',
    lifecycle_owner: 'one-person-lab-app',
    base_or_packages_mutation_allowed: false,
    full_seed_activation_owner: 'one-person-lab',
    post_launch_reconcile_ref: 'contracts/app-release-channel.json#managed_update_plane.carrier_reconciliation',
  }, 'Install exposure Homebrew Cask semantics');
  assertDeepEqualJson(homebrew.carrier_adapter_semantics?.cask?.payload_profiles, {
    standard: ['opl_app'],
    nightly: ['opl_app'],
    full: ['opl_app', 'opl_base_offline_seed', 'opl_package_offline_seeds'],
  }, 'Install exposure Homebrew Cask payload profiles');
  assertIncludesAll(homebrew.activation_commands, ['opl packages update --json', 'opl connect sync-skills'], 'Install exposure Homebrew activation commands');
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
    canonical_lifecycle: 'opl pack',
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
