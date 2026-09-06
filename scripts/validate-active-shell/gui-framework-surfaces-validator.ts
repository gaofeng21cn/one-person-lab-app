import path from 'node:path';
import { assertDeepEqualJson, assertIncludesAll, readJson } from './assertions.ts';
import { appOwnedProjectGroupExpansionPolicy } from './app-contract-constants.ts';
import { managedUpdateIpcSurfaces } from './managed-update-plane-validator.ts';
import {
  validateArtifactNativeDrilldownProjectionContract,
  validateProviderReadinessRepairProjectionContract,
  validateStateIndexSidecarProjectionContract,
} from './shared-contract-validators.ts';
import { root } from './validation-config.ts';
import { assertCommandSurface } from './value-helpers.ts';

const appContributionCollections = ['navigation', 'views', 'commands', 'badges', 'ui'];
const appContributionViewTypes = [
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
const appContributionSchemaPath = path.join(root, 'contracts', 'opl-app-contributions.schema.json');

export function validatePackageAppContributionsProductContract(contract) {
  const schema = readJson(appContributionSchemaPath);
  if (
    schema.$schema !== 'https://json-schema.org/draft/2020-12/schema'
    || schema.$id !== 'https://onepersonlab.dev/contracts/opl-app-contributions.schema.json'
    || schema.additionalProperties !== false
    || schema.properties?.schema_version?.const !== 'opl-app-contributions.v1'
  ) {
    throw new Error('App contributions schema must be the closed opl-app-contributions.v1 App-owned contract');
  }
  assertDeepEqualJson(
    schema.anyOf,
    appContributionCollections.map((collection) => ({
      required: [collection],
      properties: { [collection]: { minItems: 1 } },
    })),
    'App contributions schema non-empty collection alternatives',
  );
  for (const [collection, entry] of Object.entries({
    navigation: 'navigation',
    views: 'view',
    commands: 'command',
    badges: 'badge',
    ui: 'ui_placement',
  })) {
    const collectionSchema = schema.properties?.[collection];
    if (
      collectionSchema?.type !== 'array'
      || collectionSchema.maxItems !== 100
      || collectionSchema.uniqueItems !== true
      || collectionSchema.items?.$ref !== `#/$defs/${entry}`
    ) {
      throw new Error(`App contributions schema ${collection} must be a bounded unique structured collection`);
    }
  }
  for (const field of ['command_ids', 'badge_ids']) {
    if (schema.$defs?.view?.properties?.[field]?.maxItems !== 100) {
      throw new Error(`App contributions schema view.${field} must be bounded to 100 entries`);
    }
  }
  assertDeepEqualJson(
    schema.$defs?.view?.properties?.view_type?.enum,
    appContributionViewTypes,
    'App contributions schema view types',
  );
  const channelAccess = schema.$defs?.channel_access_result;
  if (
    channelAccess?.additionalProperties !== false
    || channelAccess?.properties?.schema_version?.const !== 'opl-app-channel-access.v1'
    || JSON.stringify(channelAccess?.properties?.status?.enum) !== JSON.stringify(['available', 'unavailable'])
    || channelAccess?.properties?.pending_pairings?.maxItems !== 100
    || channelAccess?.properties?.authorized_users?.maxItems !== 100
    || schema.$defs?.channel_access_qr_challenge?.properties?.payload?.maxLength !== 8192
    || schema.$defs?.channel_access_qr_challenge?.properties?.expires_at_ms?.minimum !== 1
  ) {
    throw new Error('App contributions schema channel_access result must stay closed, bounded, and versioned');
  }
  assertDeepEqualJson(
    schema.$defs?.channel_access_connection?.oneOf,
    [
      {
        properties: { state: { const: 'qr_ready' } },
      },
      {
        properties: {
          state: {
            enum: ['disconnected', 'connecting', 'qr_scanned', 'connected', 'attention'],
          },
        },
        not: { required: ['qr_challenge'] },
      },
    ],
    'App contributions schema channel_access QR state boundary',
  );
  assertDeepEqualJson(
    schema.$defs?.channel_access_action_input?.oneOf,
    [
      { $ref: '#/$defs/channel_action_input' },
      { $ref: '#/$defs/channel_pairing_action_input' },
      { $ref: '#/$defs/channel_user_action_input' },
    ],
    'App contributions schema channel_access action inputs',
  );
  const remoteCompanionAccess = schema.$defs?.remote_companion_access_result;
  if (
    remoteCompanionAccess?.additionalProperties !== false
    || remoteCompanionAccess?.properties?.schema_version?.const !== 'opl-app-remote-companion-access.v1'
    || JSON.stringify(remoteCompanionAccess?.properties?.status?.enum) !== JSON.stringify([
      'unavailable',
      'unpaired',
      'reserving',
      'qr_ready',
      'awaiting_confirmation',
      'active',
      'revoking',
      'attention',
    ])
    || remoteCompanionAccess?.properties?.actions?.$ref !== '#/$defs/remote_companion_access_action_list'
    || remoteCompanionAccess?.properties?.devices?.maxItems !== 2
    || schema.$defs?.remote_companion_access_pairing?.additionalProperties !== false
    || schema.$defs?.remote_companion_access_pairing?.properties?.manual_code?.pattern !== '^[0-9A-HJKMNP-TV-Z]{12}$'
    || schema.$defs?.remote_companion_access_pairing?.properties?.authentication_digits?.pattern !== '^[0-9]{6}$'
    || schema.$defs?.remote_companion_access_pairing?.properties?.qr_payload?.maxLength !== 8192
    || schema.$defs?.remote_companion_access_nonsecret_pairing?.allOf?.[1]?.not?.anyOf?.length !== 3
    || schema.$defs?.remote_companion_access_awaiting_confirmation_pairing?.allOf?.[1]?.required?.join('|') !== 'authentication_digits'
    || schema.$defs?.remote_companion_access_qr_ready_pairing?.allOf?.[1]?.required?.join('|') !== 'manual_code|qr_payload'
    || schema.$defs?.remote_companion_access_qr_ready_pairing?.allOf?.[2]?.not?.required?.join('|') !== 'authentication_digits'
    || schema.$defs?.remote_companion_access_active_pairing?.$ref !== '#/$defs/remote_companion_access_nonsecret_pairing'
    || schema.$defs?.remote_companion_access_device?.additionalProperties !== false
  ) {
    throw new Error('App contributions schema remote_companion_access result must stay closed, bounded, versioned, and state-scoped');
  }
  const serviceStatus = schema.$defs?.service_status_result;
  if (
    serviceStatus?.additionalProperties !== false
    || serviceStatus?.properties?.schema_version?.const !== 'opl-app-service-status.v1'
    || serviceStatus?.required !== undefined
    || serviceStatus?.properties?.native_carrier?.oneOf?.length !== 2
    || serviceStatus?.properties?.freshness?.$ref !== '#/$defs/service_status_summary_object'
    || serviceStatus?.properties?.payload?.$ref !== '#/$defs/service_status_summary_object'
    || serviceStatus?.oneOf !== undefined
    || serviceStatus?.anyOf?.length !== 3
    || schema.$defs?.service_status_summary_object?.additionalProperties?.$ref !== '#/$defs/service_status_value'
    || schema.$defs?.service_status_summary_object?.maxProperties !== 64
    || schema.$defs?.service_status_value?.oneOf?.length !== 6
  ) {
    throw new Error('App contributions schema service_status result must stay closed, bounded, versioned, and generic');
  }
  assertDeepEqualJson(
    schema.$defs?.remote_companion_access_secret_boundary,
    {
      type: 'object',
      required: [
        'transient_interaction_fields',
        'forbidden_projection_fields',
        'forbidden_action_readback_fields',
        'qr_payload_projection_rule',
      ],
      properties: {
        transient_interaction_fields: {
          const: ['invitation_code', 'manual_code', 'qr_payload', 'authentication_digits'],
        },
        forbidden_projection_fields: {
          const: ['claim_secret', 'claim_material', 'device_credential', 'provider_credential'],
        },
        forbidden_action_readback_fields: {
          const: ['invitation_code', 'manual_code', 'qr_payload', 'claim_secret', 'claim_material'],
        },
        qr_payload_projection_rule: {
          const: 'complete_qr_payload_is_allowed_only_in_qr_ready_pairing_projection_and_must_be_bounded_and_expiring',
        },
      },
      additionalProperties: false,
    },
    'App contributions schema remote_companion_access secret boundary',
  );
  assertDeepEqualJson(
    schema.$defs?.remote_companion_access_action?.oneOf,
    [
      { $ref: '#/$defs/remote_companion_access_pair_start_action' },
      { $ref: '#/$defs/remote_companion_access_pair_refresh_action' },
      { $ref: '#/$defs/remote_companion_access_pair_confirm_action' },
      { $ref: '#/$defs/remote_companion_access_pair_cancel_action' },
      { $ref: '#/$defs/remote_companion_access_device_rename_action' },
      { $ref: '#/$defs/remote_companion_access_pair_revoke_action' },
    ],
    'App contributions schema remote_companion_access action allowlist',
  );
  for (const [definition, requiredFields] of Object.entries({
    remote_companion_access_pair_start_action_input: ['invitation_code', 'display_name'],
    remote_companion_access_pairing_id_action_input: ['pairing_id'],
    remote_companion_access_pair_confirm_action_input: ['pairing_id', 'authentication_digits'],
    remote_companion_access_device_rename_action_input: ['device_id', 'display_name'],
  })) {
    if (
      schema.$defs?.[definition]?.additionalProperties !== false ||
      JSON.stringify(schema.$defs?.[definition]?.required) !== JSON.stringify(requiredFields)
    ) {
      throw new Error(`App contributions schema ${definition} must use its exact closed input shape`);
    }
  }
  for (const [entry, requiredFields] of Object.entries({
    navigation: ['navigation_id', 'label_i18n', 'view_id'],
    view: ['view_id', 'view_type', 'title_i18n', 'data_ref'],
    command: ['command_id', 'label_i18n', 'action_ref'],
    badge: ['badge_id', 'label_i18n', 'data_ref'],
    ui_placement: ['contribution_id', 'slot', 'contribution_kind', 'trust_tier', 'scope'],
  })) {
    if (schema.$defs?.[entry]?.additionalProperties !== false) {
      throw new Error(`App contributions schema ${entry} entries must reject arbitrary fields`);
    }
    assertDeepEqualJson(
      schema.$defs?.[entry]?.required,
      requiredFields,
      `App contributions schema ${entry} required fields`,
    );
    for (const forbiddenField of ['component', 'code', 'html', 'path', 'url']) {
      if (forbiddenField in (schema.$defs?.[entry]?.properties ?? {})) {
        throw new Error(`App contributions schema ${entry} must not expose ${forbiddenField}`);
      }
    }
  }

  if (
    contract?.schema_ref !== 'contracts/opl-app-contributions.schema.json'
    || contract.schema_version !== 'opl-app-contributions.v1'
    || contract.source_ref !== 'app_state.agent_packages.directory.entries[].app_contributions'
    || contract.package_role_policy !== 'role_agnostic_no_package_role_filter'
    || contract.at_least_one_non_empty_collection_required !== true
    || contract.id_uniqueness_scope !== 'per_package_per_collection'
    || contract.data_resolution_policy !== 'resolve_data_ref_from_framework_projected_state_only'
    || contract.action_execution_policy !== 'resolve_action_ref_through_the_descriptor_neutral_app_contribution_execute_broker'
    || JSON.stringify(contract.navigation_identity) !== JSON.stringify(['package_id', 'navigation_id'])
    || contract.navigation_source_ref !== 'app_state.agent_packages.directory.entries[].app_contributions.navigation[]'
    || contract.route_resolution_policy
      !== 'resolve_navigation_view_and_command_refs_from_the_same_current_directory_entry_then_require_broker_descriptor_revalidation'
    || contract.read_broker_command
      !== 'opl app contribution read --package-id <package_id> --ref <data_ref> [--input <json>|--input-stdin]'
    || contract.execute_broker_command
      !== 'opl app contribution execute --package-id <package_id> --ref <action_ref> [--input <json>|--input-stdin] [--confirm]'
    || contract.broker_revalidation_policy
      !== 'broker_must_recheck_the_current_installed_descriptor_carrier_readiness_and_declared_ref_before_each_read_or_execute'
    || contract.confirmation_policy
      !== 'descriptor_declared_confirmation_is_enforced_by_the_execute_broker_and_never_inferred_or_bypassed_by_the_shell'
    || contract.invalid_or_stale_projection_policy
      !== 'fail_closed_do_not_render_or_fabricate_a_route_when_the_directory_entry_descriptor_or_broker_response_is_missing_stale_or_malformed'
    || contract.legacy_package_manager_state_allowed !== false
    || contract.invalid_block_policy !== 'reject_entire_package_app_contributions_block_and_preserve_other_packages'
    || contract.shell_rendering_policy !== 'render_standard_structured_views_only'
    || contract.arbitrary_plugin_ui_code_allowed !== false
  ) {
    throw new Error('App GUI Package contributions must stay role-agnostic, broker-routed, structured, reference-only, and fail closed per Package');
  }
  assertDeepEqualJson(
    contract.optional_collections,
    appContributionCollections,
    'App GUI Package contribution collections',
  );
  assertDeepEqualJson(
    contract.supported_view_types,
    appContributionViewTypes,
    'App GUI Package contribution view types',
  );
  assertDeepEqualJson(
    contract.standard_view_contracts?.channel_access,
    {
      result_schema_ref: 'contracts/opl-app-contributions.schema.json#/$defs/channel_access_result',
      placement: 'settings.section',
      trust_tier: 'declarative',
      owner: 'one-person-lab-app',
      data_truth_owner: 'installed_transport_provider_or_native_carrier',
      projection_owner: 'one-person-lab-framework',
      renderer_activation_policy: {
        aionui: {
          provider_owner: 'aioncore_builtin_weixin',
          settings_surface: 'aioncore_channel_settings',
          framework_channel_provider_host_activation_allowed: false,
          framework_projected_channel_access_rendering_allowed: false,
        },
        opl_studio: {
          provider_owner: 'installed_channel_provider_package',
          settings_surface: 'app_standard_channel_access',
          framework_channel_provider_host_activation_allowed: true,
          framework_projected_channel_access_rendering_allowed: true,
        },
        single_active_provider_path_per_renderer_required: true,
      },
      migration_state: 'renderer_specific_activation_selected_aionui_keeps_aioncore_and_successor_uses_app_owned_provider_package',
      runtime_status: 'aionui_builtin_source_path_present_successor_package_source_and_host_path_present_each_requires_its_own_installed_live_e2e',
      command_input_source: 'validated_channel_access_result_entity_actions',
      command_resolution: 'resolve_command_id_against_the_same_current_descriptor_then_dispatch_its_action_ref_with_the_exact_validated_entity_input',
      post_action_readback: 'fresh_contribution_read_required_after_action_success_and_while_refresh_after_ms_is_projected',
      qr_payload_policy: 'ephemeral_login_challenge_render_only_never_persist_log_or_copy_into_shell_state',
      provider_absent_policy: 'no_contribution_entry_is_a_normal_unavailable_state_for_the_successor_and_must_not_block_the_aionui_mainline',
      arbitrary_renderer_code_allowed: false,
    },
    'App GUI channel_access standard view contract',
  );
  assertDeepEqualJson(
    contract.standard_view_contracts?.remote_companion_access,
    {
      result_schema_ref: 'contracts/opl-app-contributions.schema.json#/$defs/remote_companion_access_result',
      placement: 'settings.section',
      trust_tier: 'declarative',
      owner: 'one-person-lab-app',
      data_truth_owner: 'opl-link_desktop_connector_and_opl_link_service',
      projection_owner: 'one-person-lab-framework',
      renderer_activation_policy: {
        aionui: {
          provider_owner: 'opl_link_desktop_connector',
          settings_surface: 'app_standard_remote_companion_access',
          framework_remote_companion_host_activation_allowed: true,
          framework_projected_remote_companion_access_rendering_allowed: true,
        },
        opl_studio: {
          provider_owner: 'opl_link_desktop_connector',
          settings_surface: 'app_standard_remote_companion_access',
          framework_remote_companion_host_activation_allowed: true,
          framework_projected_remote_companion_access_rendering_allowed: true,
        },
        single_active_provider_path_per_renderer_required: true,
      },
      migration_state: 'source_baseline_frozen_caller_cutover_and_live_qualification_pending',
      runtime_status: 'target_projection_contract_only_service_connector_ios_shell_network_apns_and_testflight_qualification_unverified',
      command_input_source: 'validated_remote_companion_access_action_inputs',
      command_resolution: 'resolve_fixed_action_id_against_the_same_current_descriptor_then_dispatch_only_the_declared_closed_input_shape',
      post_action_readback: 'fresh_remote_companion_access_read_required_after_action_success',
      secret_boundary: {
        transient_interaction_fields: ['invitation_code', 'manual_code', 'qr_payload', 'authentication_digits'],
        never_cached_logged_or_returned_by_app_action: ['invitation_code', 'manual_code', 'qr_payload', 'claim_secret', 'claim_material'],
        qr_payload_only_in_status: 'qr_ready',
        qr_payload_max_length: 8192,
      },
      provider_absent_policy: 'project_unavailable_without_fabricated_pair_or_device_state_and_keep_the_desktop_workbench_usable',
      arbitrary_renderer_code_allowed: false,
    },
    'App GUI remote_companion_access standard view contract',
  );
  assertDeepEqualJson(
    contract.standard_view_contracts?.service_status,
    {
      result_schema_ref: 'contracts/opl-app-contributions.schema.json#/$defs/service_status_result',
      placement: 'settings.section',
      trust_tier: 'declarative',
      owner: 'one-person-lab-app',
      data_truth_owner: 'installed_native_carrier_or_provider',
      projection_owner: 'one-person-lab-framework',
      settings_destination: 'settings.services.installed_services',
      status_field_policy: 'status_and_bounded_summary_objects_are_provider_defined_without_an_App_or_Fleet_business_field_allowlist',
      command_input_source: 'descriptor_declared_action_inputs',
      command_resolution: 'resolve_command_id_against_the_same_current_descriptor_then_dispatch_its_action_ref_with_the_exact_validated_input',
      post_action_readback: 'fresh_contribution_read_required_after_action_success',
      provider_absent_policy: 'project_unavailable_without_fabricated_service_or_node_state_and_keep_the_desktop_workbench_usable',
      arbitrary_renderer_code_allowed: false,
    },
    'App GUI service_status standard view contract',
  );
  assertDeepEqualJson(
    contract.stable_id_fields,
    ['navigation_id', 'view_id', 'command_id', 'badge_id', 'contribution_id'],
    'App GUI Package contribution stable ids',
  );
  assertDeepEqualJson(
    contract.reference_integrity,
    {
      navigation_view_id: 'must_reference_local_views_view_id',
      view_command_ids: 'must_reference_local_commands_command_id',
      ui_view_id: 'must_reference_local_views_view_id',
      ui_command_ids: 'must_reference_local_commands_command_id',
    },
    'App GUI Package contribution reference integrity',
  );
  assertDeepEqualJson(
    contract.ui_composition,
    {
      app_client_contribution_abi: 'opl_app_client_contributions.v1',
      projection_source: 'app_state.ui_contributions',
      projection_schema: 'opl_app_ui_contributions_projection.v1',
      framework_host_graph_owner: 'one-person-lab-framework',
      client_cordis_graph_policy: 'derive_from_framework_host_graph_projection_and_app_product_profile_slot_policy',
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
      client_renderer_compatibility_profile_ref: 'contracts/app-product-profile.json#client_renderer_compatibility',
      client_renderer_switch_policy: 'explicit_adapter_selection_after_compatibility_admission_never_unverified_hot_switch',
      hot_switch_without_revalidation_allowed: false,
      typed_state_rpc: 'opl app state --profile fast --json',
      typed_action_rpc: 'opl app action execute --action <action_id> [--payload json] [--dry-run] --json',
      typed_client_event: 'opl/app-client-contributions/updated',
      state_semantics_contract: 'contracts/app-runtime-bridge.json',
      brand_capability_projection_policy: 'dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client',
      app_fixed_brand_registry_allowed: false,
      client_fixed_brand_registry_allowed: false,
      shared_shell_consumers: ['opl-aion-shell', 'opl-studio'],
      renderer_and_package_carrier_may_differ: true,
      slots: ['composer.palette', 'runtime.detail', 'settings.section'],
      contribution_kinds: ['view', 'command_group'],
      trust_tiers: ['declarative', 'trusted_first_party_renderer'],
      scopes: ['root', 'work_item'],
      settings_placement_policy: {
        channel_access: {
          destination: 'settings.resources.messages_and_connections',
          app_admission_required: true,
          admission_basis: ['current_user_task', 'app_placement_policy'],
        },
        remote_companion_access: {
          destination: 'settings.resources.messages_and_connections',
          app_admission_required: true,
          admission_basis: ['current_user_task', 'app_placement_policy'],
        },
        activity_log: {
          destination: null,
          app_admission_required: true,
          admission_basis: ['current_user_task', 'app_placement_policy'],
          ordinary_settings_without_explicit_app_admission: 'hidden_from_ordinary_settings',
        },
        service_status: {
          destination: 'settings.services.installed_services',
          app_admission_required: true,
          admission_basis: ['current_user_task', 'app_placement_policy'],
        },
        other_settings_section: {
          destination: 'settings.capabilities.module_extensions',
          app_admission_required: true,
          admission_basis: ['current_user_task', 'app_placement_policy'],
        },
        ordinary_visibility: {
          package_installation: 'availability_only',
          dynamic_discovery: 'availability_only',
          declared_standard_view_type: 'placement_candidate_only',
          unadmitted_contribution: {
            ordinary_settings_row: 'omit',
            ordinary_settings_route: 'omit',
          },
        },
        top_level_settings_navigation: 'client_static_destinations_only_package_contributions_never_create_navigation_entries',
        same_package_grouping: 'group_entries_by_package_id_within_their_declared_destination_and_preserve_declared_order_within_each_group',
        ordinary_presentation: 'show_package_display_name_and_view_title_without_package_id_or_trust_carrier_provenance',
        technical_provenance: 'available_only_when_the_user_enables_developer_details',
        native_app_inference: 'a_package_contribution_does_not_establish_that_a_separate_native_os_app_is_installed_running_or_equivalent',
      },
      ordering_policy: 'sort_order_then_package_id_then_contribution_id',
      identity_policy: 'package_id_colon_contribution_id',
      unknown_kind_policy: 'render_local_fallback_without_disabling_other_contributions',
      lifecycle_policy: 'register_from_current_projection_and_remove_immediately_when_package_is_disabled_or_uninstalled',
      shell_implementation_policy: 'consume_the_host_derived_client_graph_through_renderer_native_extension_surfaces_without_independent_package_discovery_or_plugin_manager',
      native_candidate_host: 'host_derived_Client_Cordis_via_DeepSeek_Harness_SlotCore_createSlotRenderer_and_ui_primitives',
      active_aionui_host: 'host_derived_Client_Cordis_via_thin_OPL_owned_adapter_over_existing_AionUI_components',
      independent_host_truth_allowed: false,
      second_package_registry_allowed: false,
      second_currentness_authority_allowed: false,
      second_state_or_action_authority_allowed: false,
      second_client_composition_graph_allowed: false,
      active_shell_adopted: true,
      release_ready: false,
      clean_vm_ready: false,
    },
    'App GUI Package contribution UI composition',
  );
  assertDeepEqualJson(
    contract.forbidden_descriptor_fields,
    ['component', 'code', 'html', 'path', 'url'],
    'App GUI Package contribution forbidden descriptor fields',
  );
  assertDeepEqualJson(
    contract.forbidden_legacy_truth_sources,
    [
      'registry_cache',
      'package_lock',
      'lifecycle_receipt',
      'payload',
      'last_known_good',
      'rollback',
      'currentness_mirror',
    ],
    'App GUI Package contribution forbidden legacy truth sources',
  );
}

export function validateGuiFrameworkSurfaces(guiContract, releaseChannel, installExposurePolicy) {
  const installExposure = guiContract.framework_surfaces?.install_exposure_policy;
  if (installExposure?.contract !== 'contracts/app-install-exposure-policy.json') {
    throw new Error('App GUI contract must reference app-install-exposure-policy.json');
  }
  if (installExposure.skill_role !== installExposurePolicy.public_abi?.skill_role) {
    throw new Error('App GUI install exposure skill role must match install exposure policy');
  }
  if (installExposure.plugin_role !== installExposurePolicy.public_abi?.plugin_role) {
    throw new Error('App GUI install exposure plugin role must match install exposure policy');
  }
  if (installExposure.default_presentation !== 'hide_skill_plugin_packaging_mechanics_by_default') {
    throw new Error('App GUI install exposure must hide skill/plugin mechanics by default');
  }
  if (installExposure.duplicate_skill_policy !== 'plugin_packaged_domain_skills_must_not_be_mirrored_as_duplicate_bare_skills') {
    throw new Error('App GUI install exposure must reject duplicate bare skill mirrors');
  }
  validatePackageAppContributionsProductContract(guiContract.framework_surfaces?.package_app_contributions);

  const managedUpdateSurface = guiContract.framework_surfaces?.managed_update_plane;
  const softwareLifecycle = releaseChannel.managed_update_plane?.software_lifecycle;
  if (
    managedUpdateSurface?.contract !== 'contracts/app-release-channel.json#managed_update_plane.software_lifecycle' ||
    managedUpdateSurface?.status_command !== 'opl update status --json' ||
    managedUpdateSurface?.app_state_source !== 'opl app state --profile fast --json#managed_update' ||
    managedUpdateSurface?.app_role !== 'opl_app_carrier_owner_and_framework_base_packages_request_receipt_consumer' ||
    managedUpdateSurface?.framework_role !== 'opl_base_and_opl_packages_catalog_plan_execution_receipt_owner' ||
    managedUpdateSurface?.ordinary_component_picker_allowed !== false ||
    softwareLifecycle?.ordinary_component_picker_allowed !== false ||
    softwareLifecycle?.public_action_component_flag_allowed !== false ||
    managedUpdateSurface?.artifact_body_access !== false ||
    managedUpdateSurface?.domain_truth_write_access !== false ||
    managedUpdateSurface?.owner_receipt_write_access !== false ||
    managedUpdateSurface?.quality_verdict_authority !== false ||
    managedUpdateSurface?.export_verdict_authority !== false ||
    managedUpdateSurface?.global_tool_mutation_allowed !== false ||
    managedUpdateSurface?.developer_checkout_mutation_allowed !== false
  ) {
    throw new Error('App GUI contract must expose the three-object software lifecycle without Base, Packages, artifact, domain, verdict, global tool, or checkout authority');
  }
  assertDeepEqualJson(
    managedUpdateSurface.software_objects,
    softwareLifecycle.public_component_keys,
    'App GUI managed update software objects',
  );
  assertDeepEqualJson(
    managedUpdateSurface.ui_actions,
    softwareLifecycle.public_actions,
    'App GUI managed update public actions',
  );
  if (
    managedUpdateSurface.carrier_reconciliation?.contract_ref !==
      'contracts/app-release-channel.json#managed_update_plane.carrier_reconciliation' ||
    managedUpdateSurface.carrier_reconciliation?.app_catalog_allowed !== false ||
    managedUpdateSurface.carrier_reconciliation?.app_role !==
      'request_and_project_framework_terminal_readback_and_apply_receipts_only'
  ) {
    throw new Error('App GUI carrier reconciliation must request and project the Framework-owned plan without an App update catalog');
  }
  assertDeepEqualJson(
    managedUpdateSurface.ipc_bridge_required,
    managedUpdateIpcSurfaces,
    'App GUI managed update IPC bridge',
  );
  if (managedUpdateSurface.background_scheduler_required !== 'startup_daily_and_manual_check_with_lock_and_backoff') {
    throw new Error('App GUI managed update surface must require startup/daily/manual scheduling with lock/backoff');
  }
  assertDeepEqualJson(
    managedUpdateSurface.forbidden_shell_behaviors,
    [
      'read_artifact_body',
      'read_or_write_domain_truth',
      'write_owner_receipt',
      'mutate_dirty_or_developer_checkout',
      'mutate_homebrew_or_system_tools',
      'bypass_framework_update_kernel',
    ],
    'App GUI managed update forbidden shell behaviors',
  );

  assertCommandSurface(guiContract.framework_surfaces?.canonical_state?.default_command, 'opl app state --profile fast --json', 'App GUI default state command');
  assertCommandSurface(guiContract.framework_surfaces.canonical_state.refresh_command, 'opl app state --profile fast --json', 'App GUI refresh state command');
  if (guiContract.framework_surfaces.canonical_state.default_operator_payload !== 'current_owner_delta') {
    throw new Error('App GUI default operator payload must be current_owner_delta');
  }
  if ('compatibility_operator_payload' in guiContract.framework_surfaces.canonical_state) {
    throw new Error('App GUI canonical state must not declare compatibility_operator_payload');
  }
  if (guiContract.framework_surfaces.canonical_state.default_profile !== 'fast') {
    throw new Error('App GUI default state profile must be fast');
  }
  if (guiContract.framework_surfaces.canonical_state.manual_refresh_profile !== 'fast') {
    throw new Error('App GUI manual refresh profile must be fast');
  }
  if (guiContract.framework_surfaces.canonical_state.full_profile_policy !== 'diagnostic_or_release_evidence_only') {
    throw new Error('App GUI full state profile must be reserved for diagnostics or release evidence');
  }
  const guiDefaultReadPolicy = guiContract.framework_surfaces.canonical_state.default_read_surface_policy;
  for (const [field, expected] of Object.entries({
    default_projection: 'opl_current_owner_delta',
    source_path: 'app_state.operator.default_read_surface_policy',
    foundry_agent_os_cockpit_policy: 'first_screen_current_owner_delta_only_raw_worklist_evidence_provider_trace_drilldown_only',
    default_next_action_source: 'current_owner_delta',
    raw_worklist_generates_default_next_action: false,
    release_evidence_counts_as_release_ready: false,
    stage_run_cockpit_projection_ref: 'contracts/app-runtime-bridge.json#stage_run_cockpit_projection',
    full_detail_policy: 'explicit_full_detail_or_lazy_diagnostic_only',
    raw_refs_policy: 'raw_refs_require_explicit_full_detail',
    full_detail_auto_poll: false,
    shell_must_not_use_full_drilldown_as_normal_state: true,
    shell_must_not_derive_layout_from_raw_runtime_projection: true,
  })) {
    if (guiDefaultReadPolicy?.[field] !== expected) {
      throw new Error(`App GUI default_read_surface_policy.${field} must be ${expected}`);
    }
  }
  if (guiDefaultReadPolicy && 'compatibility_projection' in guiDefaultReadPolicy) {
    throw new Error('App GUI default_read_surface_policy must not declare compatibility_projection');
  }
  for (const field of [
    'next_safe_action_or_none',
    'current_owner',
    'required_delta',
    'accepted_return_shapes',
    'readiness_false_flags',
    'count_summary',
  ]) {
    if (!guiDefaultReadPolicy?.first_screen_answers?.includes(field)) {
      throw new Error(`App GUI default_read_surface_policy.first_screen_answers must include ${field}`);
    }
  }
  for (const field of [
    'runtime_tray_snapshot',
    'raw_evidence_envelope',
    'stage_replay_packet_body',
    'private_residue_inventory_body',
    'provider_internal_ledger_body',
  ]) {
    if (!guiDefaultReadPolicy?.forbidden_default_state_fields?.includes(field)) {
      throw new Error(`App GUI default_read_surface_policy.forbidden_default_state_fields must include ${field}`);
    }
  }
  assertCommandSurface(
    guiContract.framework_surfaces.canonical_action?.command,
    'opl app action execute --action <action_id> [--payload json] [--dry-run] --json',
    'App GUI action command',
  );
  assertCommandSurface(
    guiContract.framework_surfaces.advanced_full_drilldown?.command,
    'opl runtime app-operator-drilldown --detail full --json',
    'App GUI advanced full drilldown',
  );
  const advancedFullDrilldown = guiContract.framework_surfaces.advanced_full_drilldown;
  if ('runtime_full_drilldown' in guiContract.framework_surfaces) {
    throw new Error('App GUI must not classify full operator drilldown as a Runtime surface');
  }
  if (
    advancedFullDrilldown.policy !== 'settings_maintenance_diagnostics_or_release_evidence_only'
    || advancedFullDrilldown.runtime_page_allowed !== false
  ) {
    throw new Error('App GUI full drilldown must be limited to Maintenance diagnostics or release evidence');
  }
  assertDeepEqualJson(
    advancedFullDrilldown.consumer_surfaces,
    ['/settings/environment?section=diagnostics', 'release_evidence_tooling'],
    'App GUI advanced full drilldown consumer surfaces',
  );
  validateStateIndexSidecarProjectionContract(
    guiContract.framework_surfaces.state_index_sidecar,
    'App GUI State Index sidecar framework surface',
  );
  validateArtifactNativeDrilldownProjectionContract(
    guiContract.framework_surfaces.artifact_native_drilldown,
    'App GUI Stage Artifact drilldown framework surface',
  );
  const guiStageRunCockpit = guiContract.framework_surfaces.stage_run_cockpit;
  for (const [field, expected] of Object.entries({
    projection_ref: 'contracts/app-runtime-bridge.json#stage_run_cockpit_projection',
    source: 'app_state.operator.workbench.task_drilldowns.stage_run_cockpit + app_state.operator.workbench.task_drilldowns.stage_run_cockpit_summary',
    equivalent_source: 'app_state.operator.workbench.task_drilldowns.stage_run_current_owner_delta',
    derived_from: 'current_owner_delta',
    display_policy: 'refs_only_stage_run_cockpit_display_guard_no_runtime_truth_claims',
    ordinary_fast_state_required: true,
    app_role: 'display_only_stage_run_cockpit_consumer',
  })) {
    if (guiStageRunCockpit?.[field] !== expected) {
      throw new Error(`App GUI StageRun cockpit ${field} must be ${expected}`);
    }
  }
  validateProviderReadinessRepairProjectionContract(
    guiContract.framework_surfaces.provider_readiness_repair,
    'App GUI provider readiness repair framework surface',
    { requireProjectionRef: true },
  );
  const runtimeDefaultAttention = guiContract.framework_surfaces.runtime_default_attention;
  if (runtimeDefaultAttention?.default_mode !== 'user_task_status_first') {
    throw new Error('App GUI runtime default attention must be user_task_status_first');
  }
  assertDeepEqualJson(
    runtimeDefaultAttention?.primary_fields,
    ['running_task_count', 'active_project_count', 'queued_project_count', 'attention_count'],
    'App GUI runtime default attention primary fields',
  );
  assertDeepEqualJson(
    runtimeDefaultAttention?.owner_action_fields,
    [
      'task title',
      'task status',
      'task stage',
      'progress label',
      'next step',
      'next owner',
      'owner',
      'accepted answer shape',
      'artifact or blocker',
      'last progress',
    ],
    'App GUI runtime default attention owner action fields',
  );
  assertIncludesAll(
    runtimeDefaultAttention?.active_project_line_fields,
    [
      'app_state.operator.workbench.summary_cards[active_projects]',
      'app_state.operator.workbench.activity_center.active_projects',
      'app_state.operator.visual_ref_groups.active_project_refs',
    ],
    'App GUI runtime default attention active_project_line_fields',
  );
  if (
    runtimeDefaultAttention?.active_project_line_policy
    !== 'queued_or_escalated_owner_handled_project_lines_count_as_user_visible_active_projects_without_claiming_active_worker_run'
  ) {
    throw new Error('App GUI runtime default attention must separate active project lines from active worker runs');
  }
  assertDeepEqualJson(
    runtimeDefaultAttention?.project_group_expansion_policy,
    appOwnedProjectGroupExpansionPolicy,
    'App GUI runtime default attention project_group_expansion_policy',
  );
  assertDeepEqualJson(
    runtimeDefaultAttention?.must_not_default_display_terms,
    [
      'Temporal',
      'provider',
      'projection',
      'ref',
      'stage attempt',
      'ledger',
      'current_control_state',
      'AionUI',
      'backend selector',
      'shell candidate',
      'runtime implementation selector',
    ],
    'App GUI runtime default attention forbidden default terms',
  );
  assertDeepEqualJson(
    guiContract.ordinary_cockpit_surface_budget,
    {
      surface_id: 'ordinary_app_cockpit_surface_budget',
      purpose: 'keep Home, Runtime, and Settings focused on purpose, task status, next owner, artifact/blocker, and release facts',
      stage_run_cockpit_projection_ref: 'contracts/app-runtime-bridge.json#stage_run_cockpit_projection',
      stage_run_consumption_policy: 'ordinary fast App state must consume refs-only stage_run_cockpit, stage_run_cockpit_summary, or equivalent stage_run_current_owner_delta derived from current_owner_delta as display guard only',
      foundry_agent_os_cockpit_policy: 'first_screen_current_owner_delta_only_raw_worklist_evidence_provider_trace_drilldown_only',
      default_next_action_source: 'current_owner_delta',
      raw_worklist_generates_default_next_action: false,
      release_evidence_counts_as_release_ready: false,
      applies_to_pages: [
        'guid_home',
        'runtime',
        'settings_general',
        'access',
        'capabilities',
        'environment',
        'settings_theme',
        'about',
        'update',
        'settings_resources',
      ],
      ordinary_allowed_answer_shapes: [
        'purpose_entry',
        'task_status',
        'next_owner',
        'accepted_answer_shape',
        'artifact_or_blocker',
        'release_fact',
        'app_profile',
        'access_status',
        'agent_capability',
        'local_environment_status',
        'appearance_preference',
        'maintenance_diagnostic_link',
        'about_update_fact',
        'provider_readiness_repair',
      ],
      ordinary_must_not_default_display_terms: [
        'Temporal',
        'provider',
        'ledger',
        'projection',
        'stage attempt',
        'AionUI',
        'backend selector',
        'shell candidate',
        'runtime implementation selector',
      ],
      diagnostics_escape_hatch: 'Advanced, release evidence, developer detail, or explicit full-detail drilldown only',
      source_policy: 'ordinary views consume opl app state --profile fast --json and must not derive first-screen layout from raw runtime drilldown',
    },
    'App GUI ordinary cockpit surface budget',
  );
  for (const forbiddenSource of [
    'direct opl connect modules --json page aggregation',
    'direct opl system developer-supervisor page aggregation',
    'direct opl family-runtime worker status page aggregation',
    'application.systemInfo as OPL path truth',
    'application.appVersions as OPL release truth',
    'direct reads of OPL internal state files',
    'direct reads of OPL SQLite sidecar files',
    'direct State Index Kernel writes',
  ]) {
    if (!guiContract.framework_surfaces.forbidden_gui_truth_sources?.includes(forbiddenSource)) {
      throw new Error(`App GUI contract must forbid ${forbiddenSource}`);
    }
  }
}
