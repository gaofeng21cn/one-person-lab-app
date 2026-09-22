import { validateScheduledTasksPageContract, validateScheduledTasksProductPolicy } from '../scheduled-tasks-policy-validator.ts';
import { validateGuiFrameworkSurfaces } from '../gui-framework-surfaces-validator.ts';
import { validateGuiProductHomeContract } from '../gui-product-home-validator.ts';
import { validateSettingsControlPlaneBehavior } from '../settings-control-plane-validator.ts';
import { validateCodexModelPolicy, validateVisualTokenBindings } from './model.ts';
import { validateDesktopTrayPolicy, validateDesktopApplicationIconPolicy, validateBrandedDeepLinkPolicy } from './desktop.ts';

export function validateGuiContractBootstrap(guiContract, releaseChannel, installExposurePolicy) {
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
}
