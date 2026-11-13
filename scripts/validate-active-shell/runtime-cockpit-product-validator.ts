import { assertDeepEqualJson } from './assertions.ts';
import {
  domainDetailViewAvailabilityValues,
  systemAttentionResponsibilityFields,
  workItemDetailPrimarySections,
  runtimeWorkItemDetailSecondarySections,
  workItemPrimaryStateLabelsByLocale,
  runtimeVisibilityPageStateIds,
} from './app-contract-constants.ts';

const runtimeCockpitProductContractRef =
  'contracts/app-gui-product-contract.json#pages.runtime_status.runtime_cockpit_product_contract';
const runtimeCockpitPageStateRef =
  'contracts/app-page-state-matrix.json#pages[id=runtime].runtime_view_model.runtime_cockpit_acceptance';
const workItemProjectionRef = 'contracts/app-runtime-bridge.json#work_item_projection';

const defaultLayerRequiredAnswers = [
  'selected_agent_and_project_scope',
  'user_cognitive_work_item_status',
  'current_and_next_stage',
  'next_action_and_owner',
  'runtime_and_telemetry_credibility',
];

const defaultListColumns = [
  'project_and_work_item',
  'status',
  'progress_and_next_step',
  'elapsed_and_tokens',
];

const savedViewIds = [
  'all',
  'automatically_advancing',
  'awaiting_user_decision',
  'system_attention',
  'delivered_or_paused',
  'stopped',
  'sync_pending',
];

const responsiveViewportWidths = [375, 768, 1024, 1440];

const responsiveLayoutByWidth = {
  '375': 'one_column',
  '768': 'two_columns',
  '1024': 'two_columns',
  '1440': 'four_columns',
};

const responsiveRequiredAssertions = [
  'scope_cascade_visible',
  'one_row_per_work_item',
  'semantic_column_reflow',
  'no_horizontal_page_overflow',
  'detail_progressive_disclosure',
  'stage_popover_progressive_disclosure',
];

const deliveredStageMapTerminalSignals = [
  'lifecycle.primary_state=delivered_auto_paused',
  'lifecycle.package_status=milestone_delivered',
];

const runtimeCockpitRequiredInvariants = [
  'collaboration_console_not_observability_dashboard',
  'work_item_projection_v2_required_axes',
  'agent_then_project_scope_work_items_excluded',
  'saved_views_status_only_no_package_or_agent_specific_view',
  'four_column_default_list_agent_as_secondary_label',
  'one_row_per_canonical_work_item',
  'global_item_id_row_and_detail_identity_full_tuple_mutation_readback',
  'project_display_name_equals_canonical_workspace_path_basename',
  'framework_state_semantics_shell_locale_rendering_no_cross_locale_copy',
  'visibility_library_separate_from_lifecycle_scope_and_saved_status_views',
  'visibility_mutation_framework_action_generation_refresh_readback',
  'system_attention_requires_complete_current_responsibility',
  'observed_token_usage_missing_never_zero_no_limit_progress',
  'detail_core_plus_typed_domain_detail_summary_no_diagnostics',
  'domain_detail_view_lazy_read_by_item_and_view_id_no_path_input',
  'agent_scope_membership_from_dynamic_agent_catalog_no_app_ids',
  'typed_domain_view_renderer_selected_by_view_kind_not_agent_id',
  'unknown_view_kind_degrades_locally_without_hiding_work_item',
  'delivered_stage_map_completed_history_only_action_envelope_next_step',
  'stage_popover_complete_order_current_next_and_attempt_without_opening_drawer',
  'stage_labels_follow_current_app_locale_when_projection_supplies_display_names',
  'platform_maintenance_and_module_health_excluded_from_runtime_routed_to_settings',
  'thin_renderer_no_raw_ids_or_projection_inference',
  'ordinary_text_normal_word_boundary_technical_tokens_emergency_break_only',
  'responsive_layout_has_no_horizontal_page_overflow',
  'contract_framework_shell_and_live_evidence_accounted_separately',
];

function assertExpectedFields(actual, expected, label) {
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (actual?.[field] !== expectedValue) {
      throw new Error(`${label}.${field} must be ${expectedValue}`);
    }
  }
}

export function validateRuntimeCockpitProductContract(contract, label) {
  if (!contract || typeof contract !== 'object') {
    throw new Error(`${label} must be declared`);
  }
  assertExpectedFields(contract.status_presentation, {
    task_readback_and_service_readiness_separate: true,
    overall_availability_from_service_recovery_allowed: false,
    task_counts_scope: 'selected_agent_project_and_visibility_before_status_filter',
    service_issue_in_task_attention_count_allowed: false,
    service_notice: 'localized_first_causal_reason_plus_maintenance_link',
    missing_readback: 'unknown_neutral_not_confirmed_failure',
    cached_readback: 'explicit_last_known_state_not_current_health',
    maintenance_destination: 'services',
    service_mutation_on_runtime_allowed: false,
  }, `${label}.status_presentation`);
  assertDeepEqualJson(contract.status_presentation?.service_notice_actions,
    ['refresh', 'open_maintenance'], `${label}.status_presentation.service_notice_actions`);
  assertExpectedFields(
    contract,
    {
      owner: 'one-person-lab-app',
      role: 'minimal_project_work_status_console',
      observability_dashboard_allowed: false,
      work_item_projection_ref: workItemProjectionRef,
      operator_drilldown_allowed: false,
      platform_maintenance_actions_allowed: false,
      software_update_actions_allowed: false,
      module_health_panel_allowed: false,
    },
    label,
  );
  assertDeepEqualJson(
    contract.default_layer_required_answers,
    defaultLayerRequiredAnswers,
    `${label}.default_layer_required_answers`,
  );

  assertExpectedFields(
    contract.scope_hierarchy,
    {
      mode: 'two_level_agent_then_project_cascade',
      work_item_scope_allowed: false,
      visibility_axis_outside_scope: true,
    },
    `${label}.scope_hierarchy`,
  );
  assertExpectedFields(
    contract.scope_hierarchy?.agent_level,
    {
      all_option: 'all_agents',
      full_display_names_required: true,
      membership_source: 'work_item_projection_v2.agent_catalog',
      inclusion_policy: 'installed_present_kind_agent_with_task_provider',
      app_hardcoded_agent_ids_allowed: false,
    },
    `${label}.scope_hierarchy.agent_level`,
  );
  assertExpectedFields(
    contract.scope_hierarchy?.project_level,
    {
      all_option: 'all_projects',
      source: 'canonical_project_registry_for_selected_agent',
      display_name_source: 'canonical_workspace_path_basename',
      display_name_must_equal_workspace_path_basename: true,
      depends_on_selected_agent: true,
      work_item_options_allowed: false,
    },
    `${label}.scope_hierarchy.project_level`,
  );
  assertExpectedFields(
    contract.scope_hierarchy?.saved_views,
    {
      dimension: 'primary_state_only',
      agent_or_project_views_allowed: false,
      visibility_views_allowed: false,
      package_or_agent_specific_ids_allowed: false,
    },
    `${label}.scope_hierarchy.saved_views`,
  );
  assertDeepEqualJson(
    contract.scope_hierarchy?.saved_views?.required_ids,
    savedViewIds,
    `${label}.scope_hierarchy.saved_views.required_ids`,
  );
  assertDeepEqualJson(contract.default_list?.columns, defaultListColumns, `${label}.default_list.columns`);
  assertExpectedFields(
    contract.default_list,
    {
      agent_placement: 'secondary_label_under_identity',
      one_row_per_work_item: true,
      canonical_row_key: 'item_id',
      detail_selection_key: 'item_id',
      identity_work_item_id_scope: 'project_local',
      duplicate_local_work_item_id_across_projects_allowed: true,
      dedupe_owner: 'framework_projection',
      shell_heuristic_deduplication_allowed: false,
      default_visibility: 'visible',
      archived_items_surface: 'separate_archived_tasks_library',
      status_filter_control: 'single_select',
      summary_metric_cards_allowed: false,
      operator_action_panel_allowed: false,
    },
    `${label}.default_list`,
  );
  assertDeepEqualJson(
    contract.default_list?.responsive_acceptance?.viewport_widths_px,
    responsiveViewportWidths,
    `${label}.default_list.responsive_acceptance.viewport_widths_px`,
  );
  assertDeepEqualJson(
    contract.default_list?.responsive_acceptance?.layout_by_viewport,
    responsiveLayoutByWidth,
    `${label}.default_list.responsive_acceptance.layout_by_viewport`,
  );
  assertDeepEqualJson(
    contract.default_list?.responsive_acceptance?.required_assertions,
    responsiveRequiredAssertions,
    `${label}.default_list.responsive_acceptance.required_assertions`,
  );
  assertExpectedFields(
    contract.default_list?.responsive_acceptance,
    {
      desktop_layout: 'four_columns',
      narrow_layout: 'semantic_row_reflow',
      horizontal_page_overflow_allowed: false,
      text_overlap_allowed: false,
      evidence_mode: 'deterministic_static_fixture_playwright',
      screenshot_per_viewport_required: true,
      detail_drawer_screenshot_required: true,
    },
    `${label}.default_list.responsive_acceptance`,
  );

  assertExpectedFields(
    contract.text_wrapping,
    {
      ordinary_user_text_policy: 'normal_word_boundaries',
      unbroken_technical_string_policy: 'break_only_when_required_to_prevent_horizontal_overflow',
    },
    `${label}.text_wrapping`,
  );

  assertDeepEqualJson(
    contract.primary_state_language?.labels_by_locale,
    workItemPrimaryStateLabelsByLocale,
    `${label}.primary_state_language.labels_by_locale`,
  );
  assertExpectedFields(
    contract.primary_state_language,
    {
      state_projection_owner: 'opl_framework',
      label_render_owner: 'shell_current_app_locale',
      shell_state_derivation_allowed: false,
      framework_projected_label_role: 'compatibility_fallback_only',
      cross_locale_projected_label_allowed: false,
      fallback_when_current_state_unavailable: 'sync_pending',
    },
    `${label}.primary_state_language`,
  );

  assertExpectedFields(
    contract.state_separation,
    {
      lifecycle_axis: 'work_item_projection.lifecycle',
      execution_axis: 'work_item_projection.execution',
      attention_axis: 'work_item_projection.attention',
      telemetry_axis: 'work_item_projection.telemetry',
      visibility_axis: 'work_item_projection.visibility',
      agent_availability_axis: 'agent_availability_projection.availability',
      combined_source_state_allowed: false,
      visibility_may_infer_lifecycle_state: false,
      lifecycle_state_may_infer_visibility: false,
      availability_may_infer_work_item_state: false,
      work_item_state_may_infer_availability: false,
    },
    `${label}.state_separation`,
  );

  assertDeepEqualJson(
    contract.system_attention?.required_fields,
    systemAttentionResponsibilityFields,
    `${label}.system_attention.required_fields`,
  );
  assertExpectedFields(
    contract.system_attention,
    {
      primary_state: 'system_attention',
      complete_responsibility_envelope_required: true,
      current_generation_required: true,
      currently_blocks_execution_required: true,
      empty_or_generic_state_allowed: false,
      incomplete_envelope_policy: 'keep_lifecycle_state_and_defer_diagnostics',
    },
    `${label}.system_attention`,
  );

  assertExpectedFields(
    contract.project_identity,
    {
      source: 'canonical_registered_project_identity',
      workspace_path_field: 'identity.workspace_path',
      display_name_source: 'canonical_workspace_path_basename',
      display_name_must_equal_workspace_path_basename: true,
      project_id_field: 'identity.project_id',
      project_id_source: 'canonical_workspace_path_hash',
      workspace_directory_rename_changes_display_name: true,
      workspace_directory_rename_changes_project_id: true,
      binding_label_may_override_display_name: false,
      spoken_name_may_override_display_name: false,
      runtime_history_may_override_display_name: false,
      execution_history_may_define_identity: false,
      provider_or_attempt_may_define_identity: false,
      shell_fallback_to_active_project_allowed: false,
    },
    `${label}.project_identity`,
  );
  assertDeepEqualJson(
    contract.project_identity?.display_name_examples,
    ['DM-CVD-Mortality-Risk', 'NF-PitNET', 'Obesity'],
    `${label}.project_identity.display_name_examples`,
  );
  assertDeepEqualJson(
    contract.action_localization?.required_semantic_fields,
    ['title_key', 'summary_key', 'message_args', 'owner', 'owner_kind'],
    `${label}.action_localization.required_semantic_fields`,
  );
  assertDeepEqualJson(
    contract.action_localization?.raw_compatibility_fields,
    ['title', 'summary'],
    `${label}.action_localization.raw_compatibility_fields`,
  );
  assertExpectedFields(
    contract.action_localization,
    {
      source: 'work_item_projection.action',
      render_owner: 'shell_current_app_locale',
      app_locale_source: 'contracts/app-gui-product-contract.json#ui_locale_policy',
      owner_kind_rendered_by_shell: true,
      raw_title_summary_role: 'compatibility_fallback_only',
      raw_owner_default_render_allowed: false,
      cross_locale_raw_fallback_allowed: false,
      framework_hardcoded_locale_copy_may_override_semantics: false,
      missing_semantics_policy: 'localized_generic_action_copy_from_action_kind',
      status_inference_owner: 'opl_framework',
      shell_status_inference_allowed: false,
    },
    `${label}.action_localization`,
  );
  assertDeepEqualJson(
    contract.work_item_visibility?.states,
    ['visible', 'archived'],
    `${label}.work_item_visibility.states`,
  );
  assertDeepEqualJson(
    contract.work_item_visibility?.visibility_required_fields,
    ['state', 'source', 'updated_at', 'control_ref', 'generation'],
    `${label}.work_item_visibility.visibility_required_fields`,
  );
  assertDeepEqualJson(
    contract.work_item_visibility?.required_page_state_ids,
    runtimeVisibilityPageStateIds,
    `${label}.work_item_visibility.required_page_state_ids`,
  );
  assertExpectedFields(
    contract.work_item_visibility,
    {
      axis: 'work_item_projection.visibility',
      generation_is_concurrency_token: true,
      default_runtime_surface: 'visible_only',
      archived_surface: 'archived_tasks_library',
      archived_surface_is_saved_status_view: false,
      archived_surface_scope: 'same_agent_then_project_scope',
      status_filters_may_include_agent_project_or_visibility: false,
      lifecycle_independent: true,
      archive_changes_business_lifecycle: false,
      archive_stops_execution: false,
      archive_deletes_evidence: false,
      archived_item_preserves_status_stage_usage: true,
      restore_returns_to_default_runtime_surface: true,
      stop_requires_separate_action: true,
      local_storage_truth_allowed: false,
      confirmation_required: true,
      confirmation_must_explain_archive_does_not_stop_work: true,
      mutation_contract_ref:
        'contracts/app-runtime-bridge.json#work_item_projection.visibility_mutation_contract',
    },
    `${label}.work_item_visibility`,
  );
  assertExpectedFields(
    contract.work_item_inventory,
    {
      source: 'canonical_agent_work_item_inventory',
      temporal_history_required: false,
      provider_attempt_history_required: false,
      fast_profile_must_preserve_every_work_item: true,
      missing_detail_may_drop_row: false,
      row_without_attempt_history_allowed: true,
    },
    `${label}.work_item_inventory`,
  );

  assertDeepEqualJson(
    contract.token_usage?.default_fields,
    ['telemetry.current_stage_tokens', 'telemetry.task_total_tokens'],
    `${label}.token_usage.default_fields`,
  );
  assertExpectedFields(
    contract.token_usage,
    {
      observed_values_only: true,
      estimated_or_inferred_values_allowed: false,
      missing_value_requires_reason: true,
      missing_value_may_render_as_zero: false,
      zero_requires_observed_zero: true,
      configured_limit_present: false,
      progress_bar_allowed: false,
    },
    `${label}.token_usage`,
  );

  assertDeepEqualJson(
    contract.work_item_detail?.primary_sections,
    workItemDetailPrimarySections,
    `${label}.work_item_detail.primary_sections`,
  );
  assertDeepEqualJson(
    contract.work_item_detail?.secondary_sections,
    runtimeWorkItemDetailSecondarySections,
    `${label}.work_item_detail.secondary_sections`,
  );
  assertDeepEqualJson(
    contract.work_item_detail?.domain_detail_view_entry_fields,
    ['view_id', 'view_kind', 'title', 'availability'],
    `${label}.work_item_detail.domain_detail_view_entry_fields`,
  );
  assertDeepEqualJson(
    contract.work_item_detail?.diagnostic_sections,
    [],
    `${label}.work_item_detail.diagnostic_sections`,
  );
  assertExpectedFields(
    contract.work_item_detail,
    {
      selection_key: 'item_id',
      primary_sections_visible_on_open: true,
      diagnostic_sections_allowed: false,
      diagnostics_owner_surface: '/settings/environment?section=diagnostics',
      artifacts_owner_surface: 'right_context_inspector',
      timeline_owner_surface: '/settings/environment?section=diagnostics',
      equal_weight_tab_wall_allowed: false,
      current_attempt_visibility: 'stage_popover_and_selected_work_item_detail_only',
      domain_detail_view_summary_visibility: 'only_when_typed_descriptor_is_present',
      domain_detail_view_open_command: 'button_with_route_map_icon',
    },
    `${label}.work_item_detail`,
  );
  assertDeepEqualJson(
    contract.work_item_detail?.delivered_stage_map_terminal_boundary?.terminal_signals,
    deliveredStageMapTerminalSignals,
    `${label}.work_item_detail.delivered_stage_map_terminal_boundary.terminal_signals`,
  );
  assertDeepEqualJson(
    contract.work_item_detail?.delivered_stage_map_terminal_boundary?.visible_stage_states,
    ['completed'],
    `${label}.work_item_detail.delivered_stage_map_terminal_boundary.visible_stage_states`,
  );
  assertExpectedFields(
    contract.work_item_detail?.delivered_stage_map_terminal_boundary,
    {
      empty_stage_map_allowed: true,
      post_delivery_next_step_source: 'work_item_projection.action',
    },
    `${label}.work_item_detail.delivered_stage_map_terminal_boundary`,
  );

  const domainViews = contract.domain_detail_views;
  assertExpectedFields(
    domainViews,
    {
      owner: 'domain_agent_projection_via_opl_framework',
      capability_policy_ref:
        'contracts/app-runtime-bridge.json#work_item_projection.field_contracts.domain_detail_views',
      requirement_class: 'optional_domain_enhancement',
      app_activation_gate: false,
      runtime_route_gate: false,
      renderer_selection: 'typed_registry_by_view_kind',
      renderer_registry_source: 'shared_mcp_app_renderer_registry',
      agent_id_branching_allowed: false,
      app_domain_schema_registry_allowed: false,
      unknown_view_kind_policy: 'localized_unavailable_preserve_work_item_and_return_to_runtime',
      availability_copy_policy: 'localized_generic_view_transport_state_no_machine_enum',
      not_modified_policy: 'retain_last_valid_view',
      full_payload_in_fast_state_allowed: false,
      markdown_or_session_parsing_in_app_allowed: false,
      domain_truth_or_evidence_judgment_allowed: false,
    },
    `${label}.domain_detail_views`,
  );
  assertDeepEqualJson(
    domainViews?.capability_absent_behavior,
    {
      runtime_page_preserved: true,
      work_item_list_preserved: true,
      selected_item_core_detail_preserved: true,
      dependent_view_entries_hidden: true,
      direct_detail_route: 'localized_unavailable_with_return_to_runtime',
      global_failure_allowed: false,
    },
    `${label}.domain_detail_views.capability_absent_behavior`,
  );
  assertDeepEqualJson(
    domainViews?.renderer_extension_abi,
    {
      schema: 'opl_app.domain_detail_renderer_extension.v1',
      delivery_owner: 'domain_agent_package_owner',
      registry_composition_owner: 'framework_shared_mcp_app',
      delivery_mode: 'owner_contract_rendered_by_shared_mcp_app',
      registration_key: 'view_kind',
      registration_required_fields: [
        'view_kind',
        'owner_package_id',
        'renderer_id',
        'schema_compatibility',
        'component',
      ],
      schema_compatibility_source: 'owner_declared_payload_schema',
      payload_schema_and_validation_owner: 'domain_owner_schema_via_framework',
      runtime_dynamic_code_loading_allowed: false,
      descriptor_supplied_module_path_or_url_allowed: false,
      agent_id_branching_allowed: false,
      app_registered_view_kind_or_domain_schema_mirror_allowed: false,
      unknown_or_incompatible_policy: 'localized_unavailable_preserve_work_item_and_return_to_runtime',
      registered_renderer_removal_policy: {
        opaque_generic_fallback_is_equivalent_replacement: false,
        removal_requires: [
          'owner_producer_retirement_evidence_for_view_kind',
          'or_compatible_replacement_renderer_with_equivalent_user_visible_acceptance',
        ],
      },
    },
    `${label}.domain_detail_views.renderer_extension_abi`,
  );
  assertDeepEqualJson(
    domainViews?.availability_states,
    domainDetailViewAvailabilityValues,
    `${label}.domain_detail_views.availability_states`,
  );
  assertExpectedFields(
    domainViews?.layout_contract,
    {
      route: '/runtime/item/:itemId/insights/:viewId',
      surface: 'full_width_owner_view',
      horizontal_page_overflow_allowed: false,
      keyboard_access_required: true,
      machine_fields_visible: false,
    },
    `${label}.domain_detail_views.layout_contract`,
  );
  if (
    domainViews?.availability_is_transport_state_only !== true
    || domainViews?.transport_state_may_be_interpreted_as_domain_outcome !== false
  ) {
    throw new Error(`${label}.domain_detail_views availability must remain transport-only`);
  }
  assertDeepEqualJson(
    domainViews?.layout_contract?.responsive_viewport_widths_px,
    responsiveViewportWidths,
    `${label}.domain_detail_views.layout_contract.responsive_viewport_widths_px`,
  );
  for (const forbidden of ['registered_view_kinds', 'medical_prose_policy', 'trajectory_snapshot', 'medical_copy_vocabulary']) {
    if (Object.hasOwn(domainViews ?? {}, forbidden)) {
      throw new Error(`${label}.domain_detail_views must not mirror domain field ${forbidden}`);
    }
  }

  assertExpectedFields(
    contract.agent_availability_routing,
    {
      runtime_page_visible: false,
      settings_owner: '/settings/agents',
      projection_remains_available_to_settings: true,
      task_counts_are_not_availability: true,
      dependency_packages_are_agent_options: false,
    },
    `${label}.agent_availability_routing`,
  );

  assertDeepEqualJson(
    contract.stage_popover?.required_fields,
    [
      'stage_map',
      'stage_map[].display_names',
      'execution.current_stage_display_name',
      'execution.next_stage_display_name',
      'execution.attempt_id',
    ],
    `${label}.stage_popover.required_fields`,
  );
  assertDeepEqualJson(
    contract.stage_popover?.viewport_widths_px,
    responsiveViewportWidths,
    `${label}.stage_popover.viewport_widths_px`,
  );
  assertExpectedFields(
    contract.stage_popover,
    {
      trigger_field: 'execution.current_stage_display_name',
      trigger_does_not_open_task_drawer: true,
      label_source: 'stage_map[].display_names[current_app_locale]',
      label_fallback: 'stage_map[].display_name',
      locale_owner: 'shell_current_app_locale',
      current_attempt_visible_here: true,
      current_attempt_default_row_visible: false,
      historical_attempt_ids_visible: false,
      horizontal_overflow_allowed: false,
    },
    `${label}.stage_popover`,
  );

  assertExpectedFields(
    contract.progressive_disclosure,
    {
      default_layer: 'decision_and_action_fields_only',
      raw_technical_fields_default_visible: false,
      current_attempt_exception: 'visible_only_in_stage_popover_or_selected_work_item_detail',
      excluded_technical_detail_owner: '/settings/environment?section=diagnostics',
    },
    `${label}.progressive_disclosure`,
  );

  assertDeepEqualJson(
    contract.runtime_surface_exclusions?.forbidden,
    [
      'operator_summary',
      'safe_action_catalog',
      'software_install_or_update_actions',
      'platform_repair_actions',
      'module_health_panel',
      'provider_diagnostics',
      'state_index',
      'artifact_provenance',
      'release_evidence',
      'historical_attempts',
      'raw_logs',
      'raw_refs',
      'raw_runtime_readback',
    ],
    `${label}.runtime_surface_exclusions.forbidden`,
  );
  assertDeepEqualJson(
    contract.runtime_surface_exclusions?.settings_owner_routes,
    {
      software_updates: '/settings/environment?section=updates',
      platform_repair: '/settings/environment?section=services',
      agent_package_management: '/settings/agents',
      capability_management: '/settings/capabilities',
      diagnostics: '/settings/environment?section=diagnostics',
      state_index: '/settings/environment?section=diagnostics',
      artifact_provenance: 'right_context_inspector',
      release_evidence: 'release_evidence_tooling',
    },
    `${label}.runtime_surface_exclusions.settings_owner_routes`,
  );

  assertExpectedFields(
    contract.renderer_policy,
    {
      shell_role: 'thin_renderer',
      projection_inference_allowed: false,
      identity_inference_allowed: false,
      status_derivation_allowed: false,
      localization_owner: 'shell_current_app_locale',
      local_storage_visibility_truth_allowed: false,
      technical_execution_stage_may_replace_business_stage: false,
      raw_id_default_visibility: false,
    },
    `${label}.renderer_policy`,
  );

  assertDeepEqualJson(
    contract.evidence_accounting?.independent_dimensions,
    ['product_contract', 'framework_producer', 'shell_consumer', 'live_evidence'],
    `${label}.evidence_accounting.independent_dimensions`,
  );
  assertExpectedFields(
    contract.evidence_accounting,
    {
      contract_completion_implies_framework_producer: false,
      contract_completion_implies_shell_consumer: false,
      contract_completion_implies_live_evidence: false,
      focused_tests_imply_live_readiness: false,
    },
    `${label}.evidence_accounting`,
  );
}

export function validateRuntimeCockpitPageStateAcceptance(acceptance, productContract, label) {
  if (!acceptance || typeof acceptance !== 'object') {
    throw new Error(`${label} must be declared`);
  }
  assertExpectedFields(
    acceptance,
    {
      product_contract_ref: runtimeCockpitProductContractRef,
      work_item_projection_ref: workItemProjectionRef,
      page_role: productContract?.role,
      scope_hierarchy: 'agent_then_project_work_items_excluded',
      one_row_per_work_item: true,
      canonical_row_key: 'item_id',
      detail_selection_key: 'item_id',
      status_filter_control: 'single_select',
      summary_metric_cards_allowed: false,
      operator_drilldown_allowed: false,
      platform_maintenance_actions_allowed: false,
      module_health_panel_allowed: false,
      raw_ids_default_visible: false,
      horizontal_page_overflow_allowed: false,
      viewport_evidence_mode: 'deterministic_static_fixture_playwright',
      viewport_screenshots_required: true,
      selected_item_core_detail_evidence_required: true,
      stage_popover_required: true,
      stage_popover_current_attempt_visible: true,
      stage_popover_trigger_opens_drawer: false,
      stage_popover_viewport_evidence_required: true,
      source_or_upstream_parity_may_override: false,
      feature_removal_or_weakening_allowed: false,
      contract_page_state_validator_tests_update_required: true,
    },
    label,
  );
  assertDeepEqualJson(acceptance.default_list_columns, defaultListColumns, `${label}.default_list_columns`);
  assertDeepEqualJson(
    acceptance.responsive_viewport_widths_px,
    responsiveViewportWidths,
    `${label}.responsive_viewport_widths_px`,
  );
  assertDeepEqualJson(
    acceptance.responsive_layout_by_width,
    responsiveLayoutByWidth,
    `${label}.responsive_layout_by_width`,
  );
  assertDeepEqualJson(
    acceptance.required_invariants,
    runtimeCockpitRequiredInvariants,
    `${label}.required_invariants`,
  );
}

export function validateRuntimeCockpitPreservationPolicy(policy, label) {
  if (!policy || typeof policy !== 'object') {
    throw new Error(`${label} must be declared`);
  }
  assertExpectedFields(
    policy,
    {
      product_contract_ref: runtimeCockpitProductContractRef,
      page_state_ref: runtimeCockpitPageStateRef,
      route_classification: 'core_dynamic_agent_runtime',
      default_product_requirement: true,
      default_release_gate: true,
      adopted_shell_requirement: true,
      active_studio_navigation_requirement: true,
      active_studio_navigation_may_remove_or_weaken: false,
      explicit_validation_command: 'npm run validate:runtime-route',
    },
    label,
  );
  assertDeepEqualJson(
    policy.route_change_requirements,
    ['product_contract', 'page_state_acceptance', 'explicit_route_validator', 'route_tests'],
    `${label}.route_change_requirements`,
  );
}

export function validateRuntimeCockpitAcceptanceBoundary(boundary, label) {
  assertExpectedFields(
    boundary,
    {
      runtime_product_contract_ref: runtimeCockpitProductContractRef,
      runtime_route_classification: 'core_dynamic_agent_runtime',
      runtime_default_product_required: true,
      runtime_default_release_gate_required: true,
      runtime_adopted_shell_required: true,
      runtime_explicit_validation_command: 'npm run validate:runtime-route',
      runtime_acceptance_requires_contract_page_state_validators_tests: 'when_route_selected_or_changed',
      runtime_contract_implies_framework_producer_complete: false,
      runtime_contract_implies_shell_consumer_complete: false,
      runtime_contract_implies_live_evidence_complete: false,
    },
    label,
  );
}
