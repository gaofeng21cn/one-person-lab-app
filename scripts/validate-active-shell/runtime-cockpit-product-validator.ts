import { assertDeepEqualJson, assertIncludesAll, readJson } from './assertions.ts';
import { assertNonEmptyStringArray } from './shared-contract-validators.ts';
import { runtimeBridgePath } from './validation-config.ts';
import {
  workItemPrimaryStateLabelsByLocale,
  runtimeVisibilityPageStateIds,
} from './app-contract-constants.ts';

const runtimeCockpitProductContractRef =
  'contracts/app-gui-product-contract.json#pages.runtime_status.runtime_cockpit_product_contract';
const runtimeCockpitPageStateRef =
  'contracts/app-page-state-matrix.json#pages[id=runtime].runtime_view_model.runtime_cockpit_acceptance';
const workItemProjectionRef = 'contracts/app-runtime-bridge.json#work_item_projection';
const workItemProjection = readJson(runtimeBridgePath).work_item_projection;

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

function assertExpectedFields(actual, expected, label) {
  for (const [field, expectedValue] of Object.entries(expected)) {
    assertDeepEqualJson(actual?.[field], expectedValue, `${label}.${field}`);
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
    service_notice_actions: ['refresh', 'open_maintenance'],
  }, `${label}.status_presentation`);
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
      default_layer_required_answers: defaultLayerRequiredAnswers,
    },
    label,
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
      required_ids: savedViewIds,
    },
    `${label}.scope_hierarchy.saved_views`,
  );
  assertExpectedFields(
    contract.default_list,
    {
      columns: defaultListColumns,
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
  assertExpectedFields(
    contract.default_list?.responsive_acceptance,
    {
      viewport_widths_px: responsiveViewportWidths,
      layout_by_viewport: responsiveLayoutByWidth,
      required_assertions: responsiveRequiredAssertions,
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

  assertExpectedFields(
    contract.primary_state_language,
    {
      labels_by_locale: workItemPrimaryStateLabelsByLocale,
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

  const attention = workItemProjection.field_contracts.attention;
  assertExpectedFields(
    contract.system_attention,
    {
      required_fields: attention.system_responsibility_required_fields,
      primary_state: 'system_attention',
      complete_responsibility_envelope_required: true,
      current_generation_required: attention.system_attention_requires_current_generation,
      currently_blocks_execution_required: attention.system_attention_requires_current_blocker,
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
  const actionProjection = workItemProjection.action_envelope_contract;
  assertExpectedFields(
    contract.action_localization,
    {
      required_semantic_fields: ['title_key', 'summary_key', 'message_args', 'owner', 'owner_kind'],
      raw_compatibility_fields: actionProjection.compatibility_fallback_fields,
      source: 'work_item_projection.action',
      render_owner: actionProjection.localization_owner,
      app_locale_source: 'contracts/app-gui-product-contract.json#ui_locale_policy',
      owner_kind_rendered_by_shell: true,
      raw_title_summary_role: 'compatibility_fallback_only',
      raw_owner_default_render_allowed: actionProjection.raw_owner_default_render_allowed,
      cross_locale_raw_fallback_allowed: actionProjection.cross_locale_raw_fallback_allowed,
      framework_hardcoded_locale_copy_may_override_semantics: false,
      missing_semantics_policy: 'localized_generic_action_copy_from_action_kind',
      status_inference_owner: 'opl_framework',
      shell_status_inference_allowed: false,
    },
    `${label}.action_localization`,
  );
  const visibility = workItemProjection.field_contracts.visibility;
  const visibilityMutation = workItemProjection.visibility_mutation_contract;
  assertExpectedFields(
    contract.work_item_visibility,
    {
      states: visibility.states,
      visibility_required_fields: visibility.required_fields,
      required_page_state_ids: runtimeVisibilityPageStateIds,
      axis: 'work_item_projection.visibility',
      generation_is_concurrency_token: visibility.generation_is_concurrency_token,
      default_runtime_surface: 'visible_only',
      archived_surface: 'archived_tasks_library',
      archived_surface_is_saved_status_view: false,
      archived_surface_scope: 'same_agent_then_project_scope',
      status_filters_may_include_agent_project_or_visibility: false,
      lifecycle_independent: visibility.lifecycle_independent,
      archive_changes_business_lifecycle: visibilityMutation.visibility_mutation_may_change_lifecycle,
      archive_stops_execution: visibilityMutation.visibility_mutation_may_stop_execution,
      archive_deletes_evidence: visibilityMutation.visibility_mutation_may_delete_evidence,
      archived_item_preserves_status_stage_usage: true,
      restore_returns_to_default_runtime_surface: true,
      stop_requires_separate_action: visibilityMutation.stop_requires_separate_framework_action,
      local_storage_truth_allowed: visibility.local_storage_truth_allowed,
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
      provider_attempt_history_required: false,
      fast_profile_must_preserve_every_work_item: true,
      missing_detail_may_drop_row: false,
      row_without_attempt_history_allowed: true,
    },
    `${label}.work_item_inventory`,
  );

  assertExpectedFields(
    contract.token_usage,
    {
      default_fields: ['telemetry.current_stage_tokens', 'telemetry.task_total_tokens'],
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

  const detailProjection = workItemProjection.detail_layer_contract;
  assertExpectedFields(
    contract.work_item_detail,
    {
      primary_sections: detailProjection.primary_sections,
      secondary_sections: detailProjection.secondary_sections,
      domain_detail_view_entry_fields: detailProjection.domain_detail_view_entry_fields,
      diagnostic_sections: detailProjection.diagnostic_sections,
      selection_key: detailProjection.selection_key,
      primary_sections_visible_on_open: true,
      diagnostic_sections_allowed: false,
      diagnostics_owner_surface: detailProjection.diagnostics_owner_surface,
      artifacts_owner_surface: detailProjection.artifacts_owner_surface,
      timeline_owner_surface: detailProjection.timeline_owner_surface,
      equal_weight_tab_wall_allowed: detailProjection.equal_weight_tab_wall_allowed,
      current_attempt_visibility: 'stage_popover_and_selected_work_item_detail_only',
      domain_detail_view_summary_visibility: 'only_when_typed_descriptor_is_present',
      domain_detail_view_open_command: 'button_with_route_map_icon',
    },
    `${label}.work_item_detail`,
  );
  assertExpectedFields(
    contract.work_item_detail?.delivered_stage_map_terminal_boundary,
    {
      terminal_signals: deliveredStageMapTerminalSignals,
      visible_stage_states: ['completed'],
      empty_stage_map_allowed: true,
      post_delivery_next_step_source: 'work_item_projection.action',
    },
    `${label}.work_item_detail.delivered_stage_map_terminal_boundary`,
  );

  const domainViews = contract.domain_detail_views;
  const domainProjection = workItemProjection.field_contracts.domain_detail_views;
  assertExpectedFields(
    domainViews,
    {
      owner: 'domain_agent_projection_via_opl_framework',
      capability_policy_ref:
        'contracts/app-runtime-bridge.json#work_item_projection.field_contracts.domain_detail_views',
      requirement_class: domainProjection.requirement_class,
      app_activation_gate: false,
      runtime_route_gate: false,
      renderer_selection: 'typed_registry_by_view_kind',
      renderer_registry_source: domainProjection.renderer_registry_source,
      agent_id_branching_allowed: domainProjection.app_agent_id_branching_allowed,
      app_domain_schema_registry_allowed: domainProjection.app_domain_schema_registry_allowed,
      unknown_view_kind_policy: domainProjection.unknown_view_kind_policy,
      availability_copy_policy: 'localized_generic_view_transport_state_no_machine_enum',
      availability_states: domainProjection.availability_values,
      not_modified_policy: workItemProjection.domain_detail_view_read_contract.unchanged_response.shell_policy,
      full_payload_in_fast_state_allowed: domainProjection.full_payload_in_fast_state_allowed,
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
  assertExpectedFields(
    domainViews?.layout_contract,
    {
      route: detailProjection.domain_detail_view_route,
      surface: 'full_width_owner_view',
      horizontal_page_overflow_allowed: false,
      keyboard_access_required: true,
      machine_fields_visible: detailProjection.domain_detail_view_machine_fields_visible,
      responsive_viewport_widths_px: responsiveViewportWidths,
    },
    `${label}.domain_detail_views.layout_contract`,
  );
  if (
    domainViews?.availability_is_transport_state_only !== true
    || domainViews?.transport_state_may_be_interpreted_as_domain_outcome !== false
  ) {
    throw new Error(`${label}.domain_detail_views availability must remain transport-only`);
  }
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

  assertExpectedFields(contract.stage_popover, workItemProjection.stage_popover_contract, `${label}.stage_popover`);

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

  assertNonEmptyStringArray(
    contract.runtime_surface_exclusions?.forbidden,
    `${label}.runtime_surface_exclusions.forbidden`,
  );
  assertIncludesAll(
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

  assertExpectedFields(
    contract.evidence_accounting,
    {
      independent_dimensions: ['product_contract', 'framework_producer', 'shell_consumer', 'live_evidence'],
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
  if (!productContract?.default_list?.responsive_acceptance || !productContract?.stage_popover || !productContract?.renderer_policy) {
    throw new Error(`${label} requires the Runtime product contract`);
  }
  const list = productContract.default_list;
  const responsive = list.responsive_acceptance;
  const popover = productContract.stage_popover;
  assertExpectedFields(
    acceptance,
    {
      product_contract_ref: runtimeCockpitProductContractRef,
      work_item_projection_ref: workItemProjectionRef,
      page_role: productContract.role,
      scope_hierarchy: 'agent_then_project_work_items_excluded',
      default_list_columns: list.columns,
      one_row_per_work_item: list.one_row_per_work_item,
      canonical_row_key: list.canonical_row_key,
      detail_selection_key: list.detail_selection_key,
      status_filter_control: list.status_filter_control,
      summary_metric_cards_allowed: list.summary_metric_cards_allowed,
      operator_drilldown_allowed: productContract.operator_drilldown_allowed,
      platform_maintenance_actions_allowed: productContract.platform_maintenance_actions_allowed,
      module_health_panel_allowed: productContract.module_health_panel_allowed,
      raw_ids_default_visible: productContract.renderer_policy.raw_id_default_visibility,
      horizontal_page_overflow_allowed: responsive.horizontal_page_overflow_allowed,
      viewport_evidence_mode: responsive.evidence_mode,
      viewport_screenshots_required: responsive.screenshot_per_viewport_required,
      responsive_viewport_widths_px: responsive.viewport_widths_px,
      responsive_layout_by_width: responsive.layout_by_viewport,
      selected_item_core_detail_evidence_required: responsive.detail_drawer_screenshot_required,
      stage_popover_required: true,
      stage_popover_current_attempt_visible: popover.current_attempt_visible_here,
      stage_popover_trigger_opens_drawer: !popover.trigger_does_not_open_task_drawer,
      stage_popover_viewport_evidence_required: true,
      source_or_upstream_parity_may_override: false,
      feature_removal_or_weakening_allowed: false,
      contract_page_state_validator_tests_update_required: true,
    },
    label,
  );
  // Detailed behavior is validated in the product and bridge contracts. Keep the
  // Stage and text-wrapping evidence explicit because they are separate visual checks.
  const requiredInvariants = assertNonEmptyStringArray(acceptance.required_invariants, `${label}.required_invariants`);
  if (new Set(requiredInvariants).size !== requiredInvariants.length) {
    throw new Error(`${label}.required_invariants must be unique`);
  }
  assertIncludesAll(requiredInvariants, [
    'delivered_stage_map_completed_history_only_action_envelope_next_step',
    'ordinary_text_normal_word_boundary_technical_tokens_emergency_break_only',
  ], `${label}.required_invariants`);
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
