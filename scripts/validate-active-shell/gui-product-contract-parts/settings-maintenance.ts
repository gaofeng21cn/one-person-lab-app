import { assertDeepEqualJson } from '../assertions.ts';
import {
  appOwnedSettingsAboutUpdaterStatePolicy,
  appOwnedStorageCarrierBehavior,
  appOwnedWebuiDataVolumeHostActionAbiRef,
  appOwnedWebuiDataVolumeHostActionCapabilityId,
} from '../app-contract-constants.ts';
import { validateEnvironmentModuleMaintenanceEntry } from '../managed-update-plane-validator.ts';
import { validateFrameworkModuleMaintenanceEntry } from './framework-maintenance.ts';
import { validateReadOnlyStorageLifecycleSurface } from './lifecycle.ts';
import { storageAvailabilityPresentationVariants, storageUserVisibleImplementationTermsForbidden } from './context.ts';

export function validateGuiContractSettingsMaintenanceAndStorage(guiContract) {
  const pages = guiContract.pages ?? {};
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
}
