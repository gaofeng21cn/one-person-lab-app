import { assertDeepEqualJson, assertIncludesAll } from './assertions.ts';

const requiredActions = [
  'conversation.list',
  'conversation.open',
  'conversation.refresh',
  'conversation.start',
  'conversation.send_text',
  'conversation.turn.stop',
  'conversation.approval.respond',
  'pair.revoke',
];

const forbiddenActions = [
  'shell.exec',
  'arbitrary_file.read',
  'arbitrary_file.write',
  'provider.update',
  'model.update',
  'permission_policy.update',
  'package.install',
  'package.remove',
  'cloud_workspace.create',
  'cloud_workspace.migrate',
];

const remoteCompanionAccessStatuses = [
  'unavailable',
  'unpaired',
  'reserving',
  'qr_ready',
  'awaiting_confirmation',
  'active',
  'revoking',
  'attention',
];

const remoteCompanionAccessActions = [
  'pair.start',
  'pair.refresh',
  'pair.confirm',
  'pair.cancel',
  'device.rename',
  'pair.revoke',
];

export function validateRemoteCompanionContract(policy: Record<string, any>): void {
  if (
    policy?.schema !== 'opl_app_remote_companion.v4' ||
    policy.owner !== 'one-person-lab-app' ||
    policy.state !== 'frozen_source_baseline_live_qualification_pending'
  ) {
    throw new Error('OPL Link contract identity or target state is invalid');
  }

  const service = policy.service_boundary;
  if (
    service?.owner !== 'opl-link/service' ||
    service.repository !== 'opl-link' ||
    service.path !== 'service' ||
    service.target_runtime?.compute !== 'cloudflare_workers_free' ||
    service.target_runtime?.persistence !== 'cloudflare_d1_free' ||
    service.target_runtime?.always_on_server_required !== false ||
    service.target_runtime?.user_managed_server_required !== false ||
    service.target_runtime?.local_resident_service_required !== false ||
    service.target_runtime?.cloudflare_tunnel_required !== false ||
    service.target_runtime?.periodic_manual_renewal_required !== false ||
    service.runtime_dependency_for_opl_link !== true ||
    service.release_dependency_for_opl_link !== true
  ) {
    throw new Error('OPL Link control plane must be the serverless Workers and D1 service');
  }
  assertIncludesAll(service.must_not_store, [
    'conversation_history',
    'conversation_content',
    'pair_master_key',
    'plaintext_long_lived_device_credential',
  ], 'OPL Link control-plane storage exclusions');

  assertDeepEqualJson(
    policy.optional_cloud_host,
    {
      product: 'OPL Cloud',
      role: 'optional_workspace_webui_host',
      repository: 'one-person-lab-cloud',
      runtime_dependency_for_opl_link: false,
      release_dependency_for_opl_link: false,
      release_prerequisite_for_opl_link: false,
    },
    'OPL Link optional Cloud boundary',
  );

  const identity = policy.product_identity;
  if (
    identity?.app_store_name !== 'OPL Link' ||
    identity.home_screen_name !== 'OPL Link' ||
    identity.client_kind !== 'independent_ios_client' ||
    identity.product_role !== 'remote_companion_channel_not_a_runtime_or_third_workbench' ||
    identity.local_ios_runtime !== false ||
    identity.local_ios_conversation_history_authority !== false ||
    identity.local_ios_provider_or_model_authority !== false ||
    identity.local_ios_agent_package_authority !== false
  ) {
    throw new Error('OPL Link must remain a bounded native iOS conversation connector');
  }

  if (
    policy.desktop_connector_boundary?.settings_contribution?.view_type !== 'remote_companion_access' ||
    policy.desktop_connector_boundary.settings_contribution.standard_view_contract_ref !==
      'framework_surfaces.package_app_contributions.standard_view_contracts.remote_companion_access'
  ) {
    throw new Error('OPL Link desktop Connector must use the remote_companion_access standard view');
  }
  const access = policy.app_access_contract;
  if (
    access?.view_type !== 'remote_companion_access' ||
    access.result_schema_ref !== 'contracts/opl-app-contributions.schema.json#/$defs/remote_companion_access_result' ||
    JSON.stringify(access.status_values) !== JSON.stringify(remoteCompanionAccessStatuses) ||
    JSON.stringify(access.actions) !== JSON.stringify(remoteCompanionAccessActions) ||
    access.product_model !== 'conversation_and_canonical_thread_not_task_control_plane' ||
    JSON.stringify(access.secret_boundary?.transient_interaction_fields) !==
      JSON.stringify(['invitation_code', 'manual_code', 'qr_payload', 'authentication_digits']) ||
    JSON.stringify(access.secret_boundary?.never_cached_logged_or_returned_by_app_action) !==
      JSON.stringify(['invitation_code', 'manual_code', 'qr_payload', 'claim_secret', 'claim_material']) ||
    access.secret_boundary?.qr_payload_state !== 'complete_qr_payload_only_in_qr_ready_projection' ||
    access.secret_boundary?.qr_payload_max_length !== 8192
  ) {
    throw new Error('OPL Link remote_companion_access contract must be closed, bounded, and conversation-first');
  }

  const transport = policy.transport;
  const target = transport?.target_architecture;
  const strategy = transport?.provider_strategy;
  if (
    transport?.protocol !== 'opl_remote_transport.v1' ||
    target?.realtime_provider !== 'ably' ||
    target.provider_plan !== 'free' ||
    target.control_plane_compute !== 'cloudflare_workers_free' ||
    target.control_plane_persistence !== 'cloudflare_d1_free' ||
    target.fixed_monthly_infrastructure_cost_within_free_quotas !== 0 ||
    target.desktop_public_address_required !== false ||
    target.always_on_application_server_required !== false ||
    strategy?.selected_provider !== 'ably' ||
    strategy.selected_plan !== 'free' ||
    strategy.selection_status !== 'target_current_decision_pending_mainland_china_probe' ||
    strategy.single_provider_per_release_cohort !== true ||
    strategy.runtime_dual_write !== false ||
    strategy.automatic_provider_fallback !== false ||
    strategy.conditional_alternative !== 'tencent_cloud_im' ||
    strategy.conditional_alternative_status !== 'not_selected' ||
    strategy.switch_without_explicit_decision_allowed !== false ||
    strategy.selection_gate?.status !== 'not_run' ||
    transport.public_desktop_address_required !== false ||
    transport.lan_or_vpn_configuration_required !== false ||
    transport.provider_secret_embedded_in_client !== false
  ) {
    throw new Error('OPL Link target must be Ably Free plus Workers and D1 with an explicit probe-gated alternative');
  }
  assertIncludesAll(strategy.selection_gate.networks, [
    'china_mobile',
    'china_unicom',
    'china_telecom',
    'representative_wifi',
  ], 'OPL Link mainland network selection gate');

  const authentication = transport.authentication;
  if (
    authentication?.mode !== 'pair_specific_device_identity_with_short_lived_ably_jwt' ||
    authentication.credential_issuer !== 'opl-link/service_on_cloudflare_workers' ||
    authentication.token_format !== 'ably_jwt' ||
    authentication.token_ttl_minutes_max > 60 ||
    authentication.automatic_refresh !== true ||
    authentication.ably_api_key_in_client !== false ||
    authentication.credential_reuse_across_pairs !== false
  ) {
    throw new Error('OPL Link target authentication must use short-lived pair-scoped Ably JWTs');
  }

  const messages = transport.message_policy;
  if (
    messages?.route !== 'two_pair_specific_directional_ably_channels' ||
    messages.channels_per_active_pair !== 2 ||
    messages.group_or_public_channel_used !== false ||
    messages.command_delivery !== 'online_realtime_only_without_cloud_command_queue' ||
    messages.provider_history_used_for_business_reads !== false ||
    messages.ids_must_be_opaque !== true ||
    messages.user_text_or_workspace_path_in_provider_route !== false ||
    transport.presence_policy?.source !== 'encrypted_pair_heartbeat_and_timeout' ||
    transport.presence_policy?.provider_presence_required !== false ||
    transport.presence_policy?.transport_connected_is_product_ready !== false
  ) {
    throw new Error('OPL Link transport must remain pair-scoped, online-only, and independent of provider history');
  }

  const confidentiality = transport.payload_confidentiality;
  if (
    confidentiality?.required !== true ||
    confidentiality.scheme !== 'x25519_key_agreement_hkdf_sha256_two_directional_aes_256_gcm_keys' ||
    confidentiality.provider_plaintext_conversation_content !== false ||
    confidentiality.cloud_plaintext_conversation_content !== false ||
    confidentiality.aead_associated_data !==
      'protocol_version_pair_id_sender_device_id_recipient_device_id_key_epoch_sender_sequence_and_channel_direction' ||
    confidentiality.nonce_policy !==
      'cryptographically_random_96_bit_nonce_with_duplicate_rejection_per_directional_key'
  ) {
    throw new Error('OPL Link encryption must keep conversation content opaque and reject nonce reuse');
  }

  const guardrails = transport.usage_guardrails;
  if (
    guardrails?.provider !== 'ably' ||
    guardrails.plan !== 'free' ||
    guardrails.monthly_message_limit !== 6000000 ||
    guardrails.peak_connection_limit !== 200 ||
    guardrails.peak_channel_limit !== 200 ||
    guardrails.peak_message_rate_per_second !== 500 ||
    guardrails.fixed_pair_limit_in_ios_or_testflight !== false ||
    guardrails.admission_authority !== 'opl-link/service_cloudflare_worker_and_d1' ||
    guardrails.validation_cohort_limit !== 'release_cohort_lock_active_pair_limit_20' ||
    guardrails.validation_cohort_warning_threshold !== 15 ||
    guardrails.validation_cohort_limit_scope !== 'validation_cohort_not_provider_seat_limit' ||
    guardrails.new_pairing_stops_when_configured_cohort_or_quota_headroom_is_exhausted !== true ||
    guardrails.limits_must_be_rechecked_before_beta_and_public_release !== true
  ) {
    throw new Error('OPL Link free-plan guardrails must use the locked validation cohort without a provider seat rule');
  }

  assertDeepEqualJson(
    transport.credential_boundary,
    {
      public_core_fields: [
        'transport_provider',
        'transport_credential',
        'key_epoch',
        'credential_expires_at',
        'push_recipient_id',
      ],
      opaque_field: 'transport_credential',
      opaque_to: [
        'one-person-lab-app',
        'opl-aion-shell',
        'opl-studio',
        'one-person-lab-framework',
        'codex_core_app_server',
      ],
      decoder_owner: 'opl-link_selected_provider_adapter',
      provider_adapter_may_decode: true,
      provider_specific_public_fields_forbidden: [
        'transport_client_id',
        'publish_channel',
        'subscribe_channel',
        'channel_epoch',
        'capability_token',
        'capability_expires_at',
      ],
    },
    'OPL Link provider-neutral transport credential boundary',
  );

  const cohort = transport.release_cohort_lock;
  if (
    cohort?.source !== 'opl-link/release-cohort.json' ||
    cohort.owner !== 'opl-link/service' ||
    cohort.source_status !== 'source_integrated_validation_placeholder_not_live_qualified' ||
    cohort.environment !== 'validation' ||
    cohort.cohort_id !== 'ably-validation-20260819' ||
    cohort.protocol_version !== 'opl_remote_transport.v1' ||
    cohort.provider !== 'ably' ||
    cohort.service_origin !== 'https://validation.invalid' ||
    cohort.service_origin_source !== 'validation_placeholder' ||
    cohort.deployment_state !== 'not_live_qualified' ||
    cohort.config_digest !== 'sha256:721fce8b69d45bc311857fe774201427add86e038cf36243d80b3efa673a9718' ||
    cohort.config_digest_algorithm !== 'sha256' ||
    JSON.stringify(cohort.config_digest_canonical_fields) !==
      JSON.stringify(['environment', 'cohort_id', 'protocol_version', 'provider', 'service_origin', 'config_summary']) ||
    cohort.metadata_match_required_before_pairing !== true ||
    cohort.mismatch_policy !== 'fail_closed_before_claim_or_transport_connection' ||
    cohort.runtime_enforcement_status !== 'source_implemented_not_live_verified'
  ) {
    throw new Error('OPL Link validation release cohort lock identity or fail-closed policy is invalid');
  }
  assertDeepEqualJson(
    cohort.admission,
    {
      authority: 'opl-link/service_cloudflare_worker_and_d1',
      active_pair_limit: 20,
      warning_threshold: 15,
      limit_scope: 'validation_cohort_not_provider_seat_limit',
      fixed_provider_seat_limit: false,
      testflight_is_capacity_authority: false,
    },
    'OPL Link validation cohort admission lock',
  );
  assertDeepEqualJson(
    cohort.config_summary,
    {
      active_pair_limit: 20,
      warning_threshold: 15,
      pair_ttl_seconds: 300,
      invitation_default_ttl_seconds: 259200,
      invitation_max_ttl_seconds: 604800,
      manual_code_max_attempts: 5,
      jwt_max_ttl_seconds: 3600,
      idempotency_response_ttl_seconds: 600,
      clock_skew_seconds: 30,
    },
    'OPL Link validation cohort config summary',
  );
  if (cohort.config_summary.active_pair_limit !== cohort.admission.active_pair_limit || cohort.config_summary.warning_threshold !== cohort.admission.warning_threshold) {
    throw new Error('OPL Link validation cohort config summary must carry the locked 20/15 admission values');
  }

  if (
    policy.distribution_and_access?.beta_carrier !== 'testflight' ||
    policy.distribution_and_access?.public_carrier !== 'apple_app_store' ||
    policy.distribution_and_access?.invitation_required_for_pairing !== true ||
    policy.distribution_and_access?.testflight_is_capacity_or_entitlement_authority !== false ||
    policy.distribution_and_access?.install_launch_or_invite_entry_consumes_transport_capacity !== false ||
    policy.distribution_and_access?.successful_pairing_consumes_one_control_plane_active_pair_admission !== true
  ) {
    throw new Error('OPL Link must separate Apple distribution from Worker and D1 admission');
  }

  assertDeepEqualJson(
    policy.pairing?.qr_payload,
    [
      'service_url',
      'opaque_pairing_id',
      'one_time_random_256_bit_qr_claim_secret',
      'desktop_pair_specific_public_key',
      'short_lived_pairing_expiry',
    ],
    'OPL Link target QR payload',
  );
  if (
    policy.pairing?.account_required !== false ||
    policy.pairing?.fallback_method !== 'short_manual_code_or_paste_full_pairing_payload' ||
    policy.pairing?.manual_code_resolution?.endpoint !== '/v1/remote-companion/pairings/resolve' ||
    !policy.pairing?.manual_code_resolution?.response_fields?.includes('service_url') ||
    policy.pairing?.manual_code_resolution?.response_must_not_include?.join('|') !==
      'claim_secret|desktop_pair_token|ios_claim_token|provider_credential' ||
    !policy.pairing?.claim_protocol?.includes(
      'worker_validates_one_time_invitation_and_atomically_reserves_one_configured_pair_admission_in_d1',
    ) ||
    !policy.pairing?.claim_protocol?.includes(
      'worker_activates_pair_specific_device_authorizations_and_key_epoch_then_issues_provider_scoped_short_lived_opaque_transport_credentials',
    ) ||
    policy.pairing?.control_plane_persistence?.owner !== 'opl-link/service_on_cloudflare_d1' ||
    policy.pairing?.control_plane_persistence?.allowed?.includes('plaintext_qr_claim_secret') ||
    policy.pairing?.control_plane_persistence?.atomic_claim_and_pair_admission_required !== true ||
    policy.pairing?.admission_lifecycle?.owner !== 'opl-link/service_on_cloudflare_workers_and_d1' ||
    policy.pairing?.admission_lifecycle?.limit_source !== 'release_cohort_lock_active_pair_limit_20_with_warning_at_15' ||
    policy.pairing?.admission_lifecycle?.client_must_not_allocate_reclaim_or_infer_capacity !== true ||
    policy.pairing?.device_lifecycle?.provider_user_account_deletion_required !== false ||
    policy.pairing?.device_lifecycle?.repair_required_after_provider_switch !== true
  ) {
    throw new Error('OPL Link pairing must use Worker and D1 authorization without Tencent account lifecycle');
  }

  const pending = policy.pairing.ios_pending_pairing_persistence;
  assertIncludesAll(pending?.material, [
    'opaque_pairing_id',
    'service_url',
    'ios_pair_specific_private_key',
    'desktop_pair_specific_public_key',
    'ios_claim_token',
    'short_lived_pairing_expiry',
  ], 'OPL Link pending pairing material');
  if (
    pending?.owner !== 'opl-link' ||
    pending.storage !== 'ios_keychain_when_unlocked_this_device_only_until_activation_expiry_or_local_reset' ||
    JSON.stringify(pending.clear_on) !== JSON.stringify([
      'active_pair_material_persisted_after_activation',
      'pairing_expiry',
      'failed_claim',
      'terminal_revocation',
    ])
  ) {
    throw new Error('OPL Link must persist pending pairing material for bounded cold-start recovery');
  }

  assertIncludesAll(policy.action_policy?.product_action_names, requiredActions, 'OPL Link product actions');
  assertIncludesAll(policy.action_policy?.forbidden_actions, forbiddenActions, 'OPL Link forbidden actions');
  if (
    policy.action_policy?.action_authority !== 'desktop_canonical_app_action_bridge' ||
    policy.action_policy?.wire_action_ids_are_internal_aliases !== true ||
    policy.action_policy?.idempotency?.offline_command_queue !== false
  ) {
    throw new Error('OPL Link actions must remain desktop-authoritative, idempotent, and online-only');
  }

  if (
    policy.surface_boundary?.conversation_model?.primary_object !== 'canonical_codex_conversation' ||
    policy.surface_boundary?.conversation_model?.canonical_identity !== 'canonical_thread_id' ||
    policy.state_sync?.canonical_state_owner !== 'codex_core_app_server_and_desktop_opl_app_projection' ||
    policy.state_sync?.history_policy !== 'do_not_use_provider_history_as_canonical_conversation_truth' ||
    policy.notifications?.background_transport !== 'ably_push_to_apns_generic_signal' ||
    policy.notifications?.push_registration?.owner !== 'opl-link/service_with_ably_push' ||
    policy.notifications?.push_registration?.client_must_not_receive_push_admin_capability !== true ||
    policy.ownership?.invitation_device_authorization_jwt_and_revoke_control_plane !==
      'opl-link/service_on_cloudflare_workers_and_d1' ||
    policy.ownership?.realtime_service !== 'ably'
  ) {
    throw new Error('OPL Link state, push, and control-plane ownership must follow the selected target');
  }

  const status = policy.implementation_status;
  if (
    status?.product_name_decided !== true ||
    status.target_transport_and_control_plane_decided !== true ||
    status.conversation_first_ios_source_implemented !== true ||
    status.legacy_tencent_ios_adapter_source_present !== true ||
    status.legacy_tencent_desktop_adapter_source_present !== true ||
    status.legacy_go_sqlite_service_source_present !== true ||
    status.legacy_stack_conforms_to_selected_architecture !== false ||
    status.ably_adapter_source_implemented !== true ||
    status.cloudflare_worker_source_implemented !== true ||
    status.cloudflare_d1_schema_implemented !== true ||
    status.mainland_china_selection_probe_completed !== false ||
    status.testflight_carrier_build_evidence_exists !== true ||
    status.testflight_product_qualification_completed !== false ||
    status.release_ready_claim_allowed !== false
  ) {
    throw new Error('OPL Link must distinguish the selected target, legacy source, carrier evidence, and live gaps');
  }

  assertDeepEqualJson(
    policy.delivery_governance?.required_order,
    [
      'run_selected_provider_and_control_plane_mainland_network_probe',
      'implement_and_prove_one_minimum_real_vertical_pair_token_message_and_revoke_path',
      'complete_the_conversation_feature_surface_on_the_proven_transport',
      'qualify_real_devices_apns_three_networks_clean_install_and_testflight',
      'only_then_allow_release_ready_or_app_store_claims',
    ],
    'OPL Link delivery order',
  );
  if (
    policy.delivery_governance?.process_correction?.finding !== 'incorrect_delivery_sequence' ||
    policy.delivery_governance?.process_correction?.must_not_repeat !== true ||
    policy.delivery_governance?.process_correction?.product_acceptance_value_of_existing_testflight_build !==
      'none_for_opl_link_usability; carrier_build_and_signing_evidence_only'
  ) {
    throw new Error('OPL Link must preserve the release-sequencing correction');
  }
}
