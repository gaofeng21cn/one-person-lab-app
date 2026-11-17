import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';
import { managedUpdateCarrierAdapters, managedUpdateSoftwareObjectIds } from '../managed-update-plane-policy.ts';

function validateManagedUpdatePlane(managedUpdatePlane) {
  const lifecycle = managedUpdatePlane?.software_lifecycle;
  const kernel = managedUpdatePlane?.managed_kernel;
  if (
    managedUpdatePlane?.owner !== 'one-person-lab-app' ||
    managedUpdatePlane?.producer_owner !== 'one-person-lab' ||
    managedUpdatePlane?.framework_role !== 'own_opl_base_and_opl_packages_lifecycle_execution_truth_and_receipts' ||
    managedUpdatePlane?.action_route !== 'opl app action execute --action <action_id> [--payload <json>] [--dry-run] --json' ||
    kernel?.id !== 'opl_managed_updater_kernel' ||
    kernel?.owner !== 'one-person-lab' ||
    kernel?.app_role !== 'status_action_projection_consumer' ||
    kernel?.app_must_not_implement_kernel !== true ||
    kernel?.app_must_not_bypass_action_route !== true
  ) {
    throw new Error('Release channel managed update must keep the App as a Framework lifecycle consumer');
  }
  assertDeepEqualJson(
    managedUpdatePlane.status_source_priority,
    ['opl app state --profile fast --json#managed_update', 'opl update status --json#managed_update'],
    'Managed update status source priority',
  );
  validateSoftwareLifecycle(lifecycle);
  validateCarrierReconciliation(managedUpdatePlane?.carrier_reconciliation);
  assertIncludesAll(
    managedUpdatePlane.forbidden_app_authority,
    [
      'opl_base_mutation',
      'opl_packages_mutation',
      'framework_update_kernel_implementation',
      'runtime_truth',
      'domain_truth',
      'owner_receipt_authority',
      'homebrew_formula_or_global_tool_mutation',
    ],
    'Managed update forbidden App authority',
  );
  assertDeepEqualJson(
    managedUpdatePlane.release_boundary_required_cases,
    [
      'only_opl_base_opl_app_and_opl_packages_are_public_components',
      'opl_base_bootstrap_is_framework_owned_and_app_requested',
      'opl_packages_use_framework_package_lifecycle_only',
      'carrier_adapters_preserve_software_object_and_lifecycle_owner',
      'internal_transaction_states_are_not_peer_products_or_updaters',
      'ordinary_component_picker_and_public_component_flag_are_forbidden',
      'standard_updater_targets_opl_app_only',
      'all_app_carriers_request_the_same_framework_base_and_packages_reconciliation',
      'app_projects_framework_terminal_readback_and_apply_receipts_without_a_second_update_catalog',
      'clean_managed_targets_may_update_silently_and_dirty_or_user_managed_targets_require_attention',
      'packages_activate_after_receipt_while_base_runtime_and_app_switch_on_restart',
    ],
    'Managed update release-boundary cases',
  );
}

function validateSoftwareLifecycle(lifecycle) {
  assertDeepEqualJson(lifecycle?.public_component_keys, managedUpdateSoftwareObjectIds, 'Managed update public component keys');
  if (
    lifecycle?.schema !== 'opl_software_lifecycle.v1' ||
    lifecycle?.public_component_path !== 'managed_update.components' ||
    lifecycle?.additional_component_keys_allowed !== false ||
    lifecycle?.ordinary_component_picker_allowed !== false ||
    lifecycle?.legacy_component_mapping_allowed !== false ||
    lifecycle?.public_action_component_flag_allowed !== false
  ) {
    throw new Error('Managed update must expose exactly three software components without legacy mappings or a component flag');
  }
  const objects = lifecycle?.objects ?? {};
  if (
    objects.opl_base?.lifecycle_owner !== 'one-person-lab' ||
    objects.opl_base?.provider_id !== 'runtime_substrate' ||
    objects.opl_base?.app_mutation_allowed !== false ||
    objects.opl_base?.mutation_route !== 'framework_lifecycle_only' ||
    objects.opl_app?.lifecycle_owner !== 'one-person-lab-app' ||
    objects.opl_app?.provider_id !== 'installation_carrier' ||
    objects.opl_app?.app_mutation_allowed !== true ||
    objects.opl_packages?.lifecycle_owner !== 'one-person-lab' ||
    objects.opl_packages?.provider_id !== 'capability_packages' ||
    objects.opl_packages?.app_mutation_allowed !== false ||
    objects.opl_packages?.mutation_route !== 'framework_package_lifecycle_only' ||
    objects.opl_packages?.homebrew_distribution_allowed !== false
  ) {
    throw new Error('Managed update software-object lifecycle ownership is invalid');
  }
  assertDeepEqualJson(objects.opl_base.optional_internal_fields, ['dependency_status', 'integration_status'], 'OPL Base internal fields');
  assertDeepEqualJson(objects.opl_app.required_fields, ['host_update_route', 'host_executor_required'], 'OPL App route fields');
  assertDeepEqualJson(objects.opl_packages.optional_internal_fields, ['current', 'conditions', 'owner_route', 'status_detail'], 'OPL Packages internal fields');
  if (
    objects.opl_base.dependency_catalog_source !== 'opl update plan --json#managed_update.components.opl_base' ||
    objects.opl_base.app_dependency_catalog_allowed !== false ||
    objects.opl_packages.package_catalog_source !== 'opl update plan --json#managed_update.components.opl_packages' ||
    objects.opl_packages.app_package_update_catalog_allowed !== false
  ) {
    throw new Error('Managed update catalogs must come from the Framework plan rather than App-maintained lists');
  }
  assertDeepEqualJson(Object.keys(lifecycle.carrier_adapters ?? {}), managedUpdateCarrierAdapters, 'Managed update carrier adapters');
  if (
    lifecycle.public_actions?.bootstrap_missing_opl_base !== 'opl-install.sh --headless --skip-packages' ||
    lifecycle.public_actions?.update_opl_app !== 'standard_updater_or_carrier_host_update_route' ||
    lifecycle.public_actions?.apply_eligible_updates !== 'opl update apply --json' ||
    !String(lifecycle.public_actions?.install_opl_package).startsWith('opl packages install ') ||
    !String(lifecycle.public_actions?.update_opl_package).startsWith('opl packages update ') ||
    !String(lifecycle.public_actions?.repair_opl_package).startsWith('opl packages repair ') ||
    !String(lifecycle.public_actions?.uninstall_opl_package).startsWith('opl packages uninstall ')
  ) {
    throw new Error('Managed update public actions must use real Base/App carrier routes and the canonical OPL Packages CLI');
  }
  for (const action of Object.values(lifecycle.public_actions ?? {})) {
    if (String(action).includes('--component')) {
      throw new Error('Managed update public actions must not pass --component');
    }
  }
}

function validateCarrierReconciliation(reconcile) {
  const startup = reconcile?.cold_start_activation;
  if (startup?.required !== true ||
    startup?.trigger !== 'every_new_App_process_before_Host_App_Server_and_DSH_plugin_graph_start' ||
    startup?.compatible_installed_runtime_bypasses_currentness !== false ||
    startup?.running_process_runtime_replacement_allowed !== false ||
    startup?.activation_deferred_after_cold_start_allowed !== false ||
    startup?.preserve_user_configuration_and_enabled_package_selection !== true) {
    throw new Error('Every cold App start must activate the owner-selected current runtime before Host startup without replacing a running generation');
  }
  if (
    reconcile?.contract !== 'opl_app_carrier_reconciliation.v1' ||
    reconcile?.trigger !== 'app_startup_after_core_ready_when_running_app_version_checkpoint_is_missing_or_changed' ||
    reconcile?.carrier_neutral !== true ||
    reconcile?.installation_source_scope !== 'all_supported_app_carriers' ||
    reconcile?.installation_source_registry_ref !==
      'contracts/app-install-exposure-policy.json#installer_surfaces+distribution_channels' ||
    reconcile?.installation_source_role !== 'provide_candidate_app_or_seed_bytes_only' ||
    reconcile?.framework_execution?.owner !== 'one-person-lab' ||
    reconcile?.framework_execution?.catalog_source !== 'framework_managed_update_plan' ||
    reconcile?.framework_execution?.app_catalog_allowed !== false ||
    reconcile?.framework_execution?.single_writer_required !== true ||
    reconcile?.framework_execution?.terminal_readback_required !== true ||
    reconcile?.framework_execution?.lifecycle_receipt_required_when_apply_executed !== true ||
    reconcile?.app_role !==
      'request_framework_reconciliation_and_project_terminal_readback_and_apply_receipts_only' ||
    reconcile?.app_direct_base_or_package_mutation_allowed !== false ||
    reconcile?.idempotency !== 'once_per_running_app_version_or_image_digest_and_carrier_identity'
  ) {
    throw new Error('App carrier reconciliation must be carrier-neutral and Framework-executed without an App catalog');
  }
  assertDeepEqualJson(
    reconcile.framework_execution.auto_apply_gate,
    {
      eligibility_field: 'auto_apply.eligible',
      background_safety_field: 'app_background_safe',
      command_field: 'command_ref',
      required_boolean_value: true,
    },
    'App carrier reconciliation Framework auto-apply gate',
  );
  assertDeepEqualJson(
    reconcile.framework_execution.projection_prefetch,
    {
      command: 'opl update status --json',
      publish_when: 'valid_typed_status_readback_available',
      purpose: 'make_framework_typed_state_available_before_network_check_and_plan_complete',
      failure_policy: 'continue_reconciliation_without_clearing_last_valid_projection',
    },
    'App carrier reconciliation projection prefetch',
  );
  assertDeepEqualJson(
    reconcile.framework_execution.command_sequence,
    [
      'opl update check --json',
      'opl update plan --json',
      'opl update apply --json',
      'opl update status --json',
    ],
    'App carrier reconciliation command sequence',
  );
  assertDeepEqualJson(
    reconcile.framework_execution.software_object_scope,
    ['opl_base', 'opl_packages'],
    'App carrier reconciliation Framework scope',
  );
  assertDeepEqualJson(
    reconcile.user_experience.summary_states,
    ['current', 'updating_in_background', 'restart_to_finish', 'refresh_codex_recommended', 'attention_required'],
    'App carrier reconciliation user states',
  );
  assertDeepEqualJson(
    reconcile.attention_only_source_classes,
    ['developer_checkout', 'dirty', 'user_managed', 'global_homebrew_or_npm_or_path'],
    'App carrier reconciliation attention-only source classes',
  );
  if (
    reconcile.version_checkpoint?.key !== 'running_app_version_or_image_digest_and_carrier_identity' ||
    reconcile.version_checkpoint?.write_gate !== 'framework_reconciliation_terminal_readback_projected' ||
    reconcile.version_checkpoint?.missing_checkpoint_means_first_launch !== true ||
    reconcile.version_checkpoint?.downloaded_or_copied_version_is_not_running_version !== true
  ) {
    throw new Error('App carrier reconciliation checkpoint must commit only after terminal Framework readback');
  }
}

export { validateManagedUpdatePlane };
