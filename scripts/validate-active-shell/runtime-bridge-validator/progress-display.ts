import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';
import { appOwnedGenericOwnerAcceptanceCurrentnessRefPolicy } from '../app-contract-constants.ts';

export function validateRuntimeProgressPageDisplayPolicy(runtimeBridge) {
  const policy = runtimeBridge.runtime_progress_page_display_policy;
  assertDeepEqualJson(
    runtimeBridge.user_task_status_projection?.generic_owner_acceptance_currentness_ref_policy,
    appOwnedGenericOwnerAcceptanceCurrentnessRefPolicy,
    'Runtime generic owner acceptance/currentness ref policy',
  );
  if (policy?.owner !== 'one-person-lab-app') {
    throw new Error('Runtime progress page display policy must be App-owned');
  }
  if (policy?.default_surface !== 'work_item_projection_v2_list') {
    throw new Error('Runtime progress page default surface must be WorkItemProjection v2 list');
  }
  if (policy?.advanced_surface !== 'selected_work_item_stage_popover_or_detail_drawer') {
    throw new Error('Runtime progress page advanced surface must be selected work-item detail only');
  }
  if (policy?.page_role !== 'minimal_project_work_status_not_platform_operations') {
    throw new Error('Runtime progress page must be project work status, not platform operations');
  }
  if (policy?.work_item_projection_ref !== 'contracts/app-runtime-bridge.json#work_item_projection') {
    throw new Error('Runtime progress page must point at the canonical WorkItemProjection contract');
  }
  if (policy?.detail_layer_ref !== 'contracts/app-runtime-bridge.json#work_item_projection.detail_layer_contract') {
    throw new Error('Runtime progress page must point at the WorkItemProjection detail layer contract');
  }
  assertDeepEqualJson(policy?.default_task_row_spine, [
    'project_and_work_item',
    'status',
    'progress_and_next_step',
    'elapsed_and_tokens',
  ], 'Runtime progress page default task row spine');
  assertDeepEqualJson(policy?.default_page_sections, [
    'top_scope_and_refresh',
    'compact_status_filter',
    'archived_tasks_entry',
    'work_item_list',
  ], 'Runtime progress page default sections');
  assertDeepEqualJson(policy?.layout_regions, {
    top: ['top_scope_and_refresh', 'compact_status_filter', 'archived_tasks_entry'],
    main: ['work_item_list'],
  }, 'Runtime progress page layout regions');
  assertIncludesAll(policy?.default_field_allowlist ?? [], [
    'identity.project_display_name',
    'identity.work_item_display_name',
    'identity.agent_display_name',
    'lifecycle.primary_state',
    'visibility.state',
    'execution.state',
    'execution.current_stage_display_name',
    'execution.next_stage_display_name',
    'telemetry.elapsed',
    'telemetry.current_stage_tokens',
    'telemetry.task_total_tokens',
    'action.title_key',
    'action.message_args',
    'action.owner',
    'action.owner_kind',
  ], 'Runtime progress page default field allowlist');
  assertIncludesAll(policy?.default_visible_field_groups?.work_item_list ?? [], [
    'identity.project_display_name',
    'identity.work_item_display_name',
    'identity.agent_display_name',
    'lifecycle.primary_state',
    'visibility.state',
    'execution.state',
    'execution.current_stage_display_name',
    'execution.next_stage_display_name',
    'telemetry.elapsed',
    'telemetry.current_stage_tokens',
    'telemetry.task_total_tokens',
    'action.title_key',
    'action.message_args',
    'action.owner',
    'action.owner_kind',
  ], 'Runtime progress page work item list fields');
  for (const forbiddenField of [
    'action.title_args',
    'action.summary_args',
    'action.copy_locale',
    'visibility.token',
    'identity.generation',
  ]) {
    if (
      policy?.default_field_allowlist?.includes(forbiddenField)
      || Object.values(policy?.default_visible_field_groups ?? {}).some(
        (fields) => Array.isArray(fields) && fields.includes(forbiddenField),
      )
    ) {
      throw new Error(`Runtime progress page must not consume nonexistent field ${forbiddenField}`);
    }
  }
  const defaultFieldAllowlist = new Set(policy?.default_field_allowlist ?? []);
  for (const [groupName, fields] of Object.entries(policy?.default_visible_field_groups ?? {})) {
    if (!Array.isArray(fields)) {
      throw new Error(`Runtime progress page default visible field group ${groupName} must be an array`);
    }
    for (const field of fields) {
      if (!defaultFieldAllowlist.has(field)) {
        throw new Error(`Runtime progress page default field ${groupName}.${field} must be included in default_field_allowlist`);
      }
    }
  }
  if (
    policy?.default_label_policy?.primary_state_label_render_owner !== 'shell_current_app_locale' ||
    policy?.default_label_policy?.action_label_render_owner !== 'shell_current_app_locale' ||
    policy?.default_label_policy?.framework_hardcoded_locale_copy_default_allowed !== false
  ) {
    throw new Error('Runtime progress page labels must render from semantic state/action fields in the current App locale');
  }
  if (
    policy?.task_deduplication_policy?.canonical_row_key !== 'item_id' ||
    policy?.task_deduplication_policy?.detail_selection_key !== 'item_id' ||
    policy?.task_deduplication_policy?.identity_work_item_id_scope !== 'project_local' ||
    policy?.task_deduplication_policy?.duplicate_local_work_item_id_across_projects_allowed !== true ||
    policy?.task_deduplication_policy?.dedupe_owner !== 'opl_framework' ||
    policy?.task_deduplication_policy?.one_row_per_work_item !== true ||
    policy?.task_deduplication_policy?.shell_heuristic_deduplication_allowed !== false ||
    policy?.task_deduplication_policy?.module_runtime_rows_policy !==
    'module_runtime_and_module_health_never_enter_runtime_page_route_to_settings'
  ) {
    throw new Error('Runtime progress page must project one canonical row per work item and keep module runtime separate');
  }
  if (policy?.task_deduplication_policy?.raw_duplicate_refs_default_visible !== false) {
    throw new Error('Runtime progress page raw duplicate refs must stay hidden by default');
  }
  const visibilityPolicy = policy?.work_item_visibility_policy;
  assertDeepEqualJson(
    visibilityPolicy?.axis_values,
    ['visible', 'archived'],
    'Runtime progress page visibility axis values',
  );
  for (const [field, expected] of Object.entries({
    axis: 'work_item_projection.visibility.state',
    default_list_visibility: 'visible',
    archived_library_visibility: 'archived',
    archived_library_is_saved_status_view: false,
    archived_library_scope: 'same_agent_then_project_scope',
    status_filters_include_agent_project_or_visibility: false,
    restore_returns_item_to_default_list: true,
    local_storage_truth_allowed: false,
    mutation_contract_ref:
      'contracts/app-runtime-bridge.json#work_item_projection.visibility_mutation_contract',
  })) {
    if (visibilityPolicy?.[field] !== expected) {
      throw new Error(`Runtime progress page visibility ${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    policy?.next_step_copy_policy?.source_priority,
    ['action.title_key + action.message_args', 'action.summary_key + action.message_args'],
    'Runtime progress page next-step semantic source priority',
  );
  assertDeepEqualJson(
    policy?.next_step_copy_policy?.compatibility_fallback_fields,
    ['action.title', 'action.summary'],
    'Runtime progress page next-step compatibility fallback fields',
  );
  if (
    policy?.next_step_copy_policy?.render_owner !== 'shell_current_app_locale' ||
    policy?.next_step_copy_policy?.long_text_policy !==
      'framework_projects_locale_independent_action_semantics_shell_renders_current_app_locale' ||
    policy?.next_step_copy_policy?.compatibility_fallback_only !== true ||
    policy?.next_step_copy_policy?.cross_locale_raw_fallback_allowed !== false ||
    policy?.next_step_copy_policy?.missing_semantics_policy !==
      'localized_generic_action_copy_from_action_kind'
  ) {
    throw new Error('Runtime progress page must render Framework action semantics in the current App locale');
  }
  if (policy?.next_step_copy_policy?.raw_route_or_command_default_visible !== false) {
    throw new Error('Runtime progress page raw route/command next steps must stay hidden by default');
  }
  assertDeepEqualJson(
    policy?.responsive_acceptance?.viewport_widths_px,
    [375, 768, 1024, 1440],
    'Runtime progress page responsive viewport matrix',
  );
  if (
    policy?.responsive_acceptance?.desktop_layout !== 'four_columns' ||
    policy?.responsive_acceptance?.narrow_layout !== 'semantic_row_reflow' ||
    policy?.responsive_acceptance?.horizontal_page_overflow_allowed !== false ||
    policy?.responsive_acceptance?.text_overlap_allowed !== false
  ) {
    throw new Error('Runtime progress page must reflow without horizontal page overflow or text overlap');
  }
  assertDeepEqualJson(policy?.advanced_only_fields, [
    'raw_proof_ref',
    'receipt_refs',
    'stage_attempt_ids',
    'run_id',
    'active_run_id',
    'workflow_id',
    'workflow_refs',
    'raw_blocker_route',
    'typed_blocker_resolution_ref',
    'raw_readback',
    'readback_ref',
    'readback_text',
    'runtime_readback_ref',
    'runtime_closeout_ref',
    'stage_run_current_owner_delta.accepted_return_shapes',
    'stage_run_current_owner_delta.artifact_or_blocker_refs',
    'stage_run_current_owner_delta.readiness_false_flag_refs',
    'provider',
    'projection',
    'ledger',
    'current_control_state',
    'full_drilldown',
  ], 'Runtime progress page advanced-only fields');
  assertDeepEqualJson(policy?.surface_exclusions?.runtime_page_forbidden, [
    'operator_summary',
    'safe_action_catalog',
    'software_install_or_update_actions',
    'platform_repair_actions',
    'module_health_panel',
    'provider_diagnostics',
    'raw_runtime_readback',
  ], 'Runtime progress page forbidden surfaces');
  assertDeepEqualJson(policy?.surface_exclusions?.settings_owner_routes, {
    software_updates: '/settings/environment?section=updates',
    platform_repair: '/settings/environment?section=services',
    agent_package_management: '/settings/agents',
    capability_management: '/settings/capabilities',
    diagnostics: '/settings/environment?section=diagnostics',
  }, 'Runtime progress page Settings routes');
  const stagePopover = runtimeBridge.work_item_projection?.stage_popover_contract;
  assertDeepEqualJson(stagePopover?.required_fields, [
    'stage_map',
    'stage_map[].display_names',
    'execution.current_stage_display_name',
    'execution.next_stage_display_name',
    'execution.attempt_id',
  ], 'Runtime Stage popover required fields');
  assertDeepEqualJson(stagePopover?.viewport_widths_px, [375, 768, 1024, 1440], 'Runtime Stage popover viewports');
  for (const [field, expected] of Object.entries({
    trigger_field: 'execution.current_stage_display_name',
    trigger_does_not_open_task_drawer: true,
    label_source: 'stage_map[].display_names[current_app_locale]',
    label_fallback: 'stage_map[].display_name',
    locale_owner: 'shell_current_app_locale',
    current_attempt_visible_here: true,
    current_attempt_default_row_visible: false,
    historical_attempt_ids_visible: false,
    horizontal_overflow_allowed: false,
  })) {
    if (stagePopover?.[field] !== expected) {
      throw new Error(`Runtime Stage popover ${field} must be ${expected}`);
    }
  }
  for (const claim of [
    'second_runtime_truth_source',
    'live_runtime_readiness',
    'release_currentness',
    'owner_receipt_authority',
    'shell_runtime_truth',
  ]) {
    if (!policy?.forbidden_claims?.includes(claim)) {
      throw new Error(`Runtime progress page display policy must forbid ${claim}`);
    }
  }
}
