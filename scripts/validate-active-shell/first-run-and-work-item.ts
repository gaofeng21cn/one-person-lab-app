import { assertDeepEqualJson, assertFieldsMatch, assertIncludesAll } from "./assertions.ts";
import {
  runtimeAutomationStateValues,
  runtimePrimaryStateValues,
  domainDetailViewAvailabilityValues,
  domainDetailViewDescriptorFields,
  domainDetailViewDescriptorOptionalFields,
  systemAttentionResponsibilityFields,
  workItemDetailPrimarySections,
  runtimeWorkItemDetailSecondarySections,
  workItemPrimaryStateLabelsByLocale,
  workItemVisibilityStates,
} from "./app-contract-constants.ts";

import {
  assertNoForbiddenKeys,
  assertNonEmptyString,
  assertNonEmptyStringArray,
  resourceContextOptionalTaskRefs,
} from "./validation-primitives.ts";
import { validateSettingsCapabilitiesTaskAwarenessSurface } from "./settings-and-provider.ts";

const workItemIdentityFields = ["agent_id", "project_id", "work_item_id"];
const workItemReadbackIdentityFields = workItemIdentityFields.map((field) => `identity.${field}`);
const taskRunRequiredFields = [
  "task_identity", "status", "progress", "conditions",
  "evidence_cards", "action_cards", "resource_cards", "diagnostics_ref",
];

export function validateTaskAwarenessProjectionContract(projection, label) {
  if (!projection || typeof projection !== "object") {
    throw new Error(`${label} must be declared`);
  }
  assertFieldsMatch(projection, {
    source: "app_state.operator.workbench.task_drilldowns",
    authority: "opl_framework_refs_only_task_awareness_projection",
    display_policy: "conversation_and_inspector_task_awareness_refs_no_runtime_dashboard",
    global_surface: "none_runtime_uses_work_item_projection_v2",
    app_role: "display_only_task_awareness_consumer",
    shell_role: "thin_renderer_no_runtime_store",
    artifact_or_blocker_policy: "summary_ref_only_no_artifact_body",
    review_receipt_policy: "receipt_ref_only_no_quality_or_readiness_verdict",
    action_receipt_policy: "dry_run_plan_and_execute_receipt_refs_only_via_opl_app_action",
    workflow_ref_policy: "capability_workflow_refs_only_no_app_skill_body_write",
    export_bundle_policy: "framework_domain_action_ref_only_app_displays_dry_run_execute_receipt",
    temporal_policy: "diagnostics_only_never_user_task_model",
  }, label);
  assertDeepEqualJson(
    projection.current_task_surfaces,
    ["ordinary_conversation", "right_context_inspector"],
    `${label} current_task_surfaces`,
  );
  assertFieldsMatch(projection, {
    schema_name: "TaskRunProjection",
    schema_version: 2,
    projection_kind: "task_run_projection_v2",
    domain_authority_policy: "refs_only_no_domain_authority_no_artifact_body_no_domain_verdict",
  }, label);
  if (!projection.v2_field_groups || typeof projection.v2_field_groups !== "object") {
    throw new Error(`${label} v2_field_groups must be declared`);
  }
  for (const field of taskRunRequiredFields) {
    assertNonEmptyStringArray(projection.v2_field_groups[field], `${label} v2_field_groups.${field}`);
  }
  assertIncludesAll(projection.required_task_ref_fields, taskRunRequiredFields, `${label} required_task_ref_fields`);
  assertIncludesAll(
    projection.optional_task_ref_fields,
    [
      "capability_health_refs",
      "workflow_refs",
      "export_bundle_action_ref",
      "connector_readiness_refs",
      "openscience_console_projection_ref",
      "diagnostic_substrate_refs",
      "structured_result_panel",
      "artifact_provenance_card",
      "ref_level_follow_up_refs",
      "workflow_skill_candidate_refs",
      ...resourceContextOptionalTaskRefs,
    ],
    `${label} optional_task_ref_fields`,
  );
  validateSettingsCapabilitiesTaskAwarenessSurface(
    projection.settings_capabilities_surface,
    `${label} settings_capabilities_surface`,
  );
  if (projection.resource_context_policy) {
    validateResourceContextPolicy(projection.resource_context_policy, `${label} resource_context_policy`);
  } else if (
    projection.resource_context_policy_ref !==
    "contracts/app-runtime-bridge.json#task_awareness_projection.resource_context_policy"
  ) {
    throw new Error(`${label} must declare resource_context_policy or resource_context_policy_ref`);
  }
  assertIncludesAll(
    projection.forbidden_claims,
    [
      "new_task_dashboard", "shell_runtime_truth", "temporal_as_user_task_model",
      "artifact_body", "owner_receipt_authority", "domain_quality_verdict",
      "domain_readiness", "app_release_readiness", "family_production_readiness",
    ],
    `${label} forbidden_claims`,
  );
}

export function validateWorkItemRowIdentityFixture(
  items,
  label,
  { requireCrossProjectLocalIdCollision = false } = {},
) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`${label} must include work-item rows`);
  }
  const itemIds = new Set();
  const mutationTuples = new Set();
  const projectsByLocalWorkItemId = new Map();
  for (const [index, item] of items.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertNonEmptyString(item?.item_id, `${itemLabel}.item_id`);
    const identityTuple = workItemIdentityFields.map((field) => {
      const value = item?.identity?.[field];
      assertNonEmptyString(value, `${itemLabel}.identity.${field}`);
      return value;
    });
    if (itemIds.has(item.item_id)) {
      throw new Error(`${label} item_id must be globally unique`);
    }
    itemIds.add(item.item_id);
    const mutationTuple = JSON.stringify(identityTuple);
    if (mutationTuples.has(mutationTuple)) {
      throw new Error(`${label} mutation identity tuple must be unique`);
    }
    mutationTuples.add(mutationTuple);
    const projectIds = projectsByLocalWorkItemId.get(item.identity.work_item_id) ?? new Set();
    projectIds.add(item.identity.project_id);
    projectsByLocalWorkItemId.set(item.identity.work_item_id, projectIds);
  }
  if (
    requireCrossProjectLocalIdCollision
    && ![...projectsByLocalWorkItemId.values()].some((projectIds) => projectIds.size > 1)
  ) {
    throw new Error(`${label} must exercise a project-local work_item_id collision`);
  }
}

export function validateWorkItemProjectionContract(projection, label) {
  if (!projection || typeof projection !== "object") {
    throw new Error(`${label} must be declared`);
  }
  assertFieldsMatch(projection, {
    surface_kind: "opl_work_item_projection",
    schema_version: "work-item-projection.v2",
    authority: "one_person_lab_canonical_work_item_projection",
    app_role: "display_only_work_item_projection_consumer",
    shell_role: "thin_renderer_no_projection_inference",
    refs_only: true,
    artifact_body_access: false,
    owner_receipt_write_access: false,
  }, label);
  const requiredAxes = [
    "item_id", "identity", "lifecycle", "execution",
    "attention", "telemetry", "conditions", "freshness", "visibility", "action",
  ];
  assertDeepEqualJson(projection.required_fields, requiredAxes, `${label} required_fields`);
  const contracts = projection.field_contracts ?? {};
  assertDeepEqualJson(
    contracts.identity?.required_fields,
    ["agent_id", "agent_display_name", "project_id", "workspace_path", "project_display_name", "work_item_id", "work_item_display_name"],
    `${label} field_contracts.identity.required_fields`,
  );
  for (const section of ["lifecycle", "execution", "attention", "telemetry", "freshness"]) {
    assertNonEmptyStringArray(contracts[section]?.required_fields, `${label} field_contracts.${section}.required_fields`);
  }
  assertDeepEqualJson(
    contracts.lifecycle?.primary_state_labels_by_locale,
    workItemPrimaryStateLabelsByLocale,
    `${label} lifecycle primary state labels`,
  );
  assertDeepEqualJson(
    contracts.lifecycle?.business_states,
    ["active", "delivered_paused", "paused", "stopped", "archived", "unknown"],
    `${label} lifecycle business_states`,
  );
  assertFieldsMatch(contracts.identity, {
    project_display_name_source: "canonical_workspace_path_basename",
    project_display_name_must_equal_workspace_path_basename: true,
    project_id_source: "canonical_workspace_path_hash",
    workspace_directory_rename_changes_display_name: true,
    workspace_directory_rename_changes_project_id: true,
    binding_label_may_override_project_display_name: false,
    spoken_name_may_override_project_display_name: false,
    runtime_history_may_override_project_display_name: false,
    execution_fallback_allowed: false,
  }, `${label} identity`, ".");
  assertFieldsMatch(contracts.lifecycle, {
    primary_state_projection_owner: "opl_framework",
    primary_state_label_render_owner: "shell_current_app_locale",
    shell_state_derivation_allowed: false,
    cross_locale_projected_label_allowed: false,
  }, `${label} lifecycle`, ".");
  assertDeepEqualJson(
    contracts.attention?.system_responsibility_required_fields,
    systemAttentionResponsibilityFields,
    `${label} system attention responsibility fields`,
  );
  if (
    contracts.attention?.system_attention_requires_current_generation !== true ||
    contracts.attention?.system_attention_requires_current_blocker !== true ||
    contracts.attention?.incomplete_system_responsibility_policy !==
      "do_not_emit_system_attention_keep_lifecycle_state_and_defer_diagnostics"
  ) {
    throw new Error(`${label} system attention must require a complete current responsibility envelope`);
  }
  if (
    contracts.telemetry?.token_observation?.missing_required_fields?.[0] !== "reason" ||
    contracts.telemetry?.missing_may_render_as_zero !== false ||
    contracts.telemetry?.zero_requires_observed_zero !== true ||
    contracts.telemetry?.token_limit_configured !== false ||
    contracts.telemetry?.token_progress_bar_allowed !== false
  ) {
    throw new Error(`${label} token telemetry must be observed-only with no fabricated zero or limit bar`);
  }
  const visibility = contracts.visibility;
  assertDeepEqualJson(visibility?.states, workItemVisibilityStates, `${label} visibility states`);
  assertDeepEqualJson(
    visibility?.required_fields,
    ["state", "source", "updated_at", "control_ref", "generation"],
    `${label} visibility required_fields`,
  );
  assertFieldsMatch(visibility, {
    authority: "opl_framework_work_item_visibility",
    lifecycle_independent: true,
    generation_is_concurrency_token: true,
    mutation_requires_expected_generation_when_available: true,
    local_storage_truth_allowed: false,
  }, `${label} visibility`, ".");
  const action = contracts.action;
  assertDeepEqualJson(
    action?.required_fields,
    ["kind", "title", "title_key", "summary", "summary_key", "message_args", "owner", "owner_kind", "action_ref", "dry_run_required"],
    `${label} action required_fields`,
  );
  assertDeepEqualJson(action?.owner_kinds, ["user", "system", "agent", "other"], `${label} action owner_kinds`);
  assertDeepEqualJson(action?.compatibility_fallback_fields, ["title", "summary"], `${label} action compatibility_fallback_fields`);
  assertFieldsMatch(action, {
    message_args_policy: "single_structured_values_object_not_prelocalized_sentences",
    render_owner: "shell_current_app_locale",
    compatibility_fallback_only: true,
    cross_locale_raw_fallback_allowed: false,
    raw_owner_default_render_allowed: false,
  }, `${label} action`, ".");

  const domainDetailViews = contracts.domain_detail_views;
  assertDeepEqualJson(domainDetailViews?.required_fields, domainDetailViewDescriptorFields, `${label} domain detail descriptor fields`);
  assertDeepEqualJson(domainDetailViews?.availability_values, domainDetailViewAvailabilityValues, `${label} domain detail availability values`);
  assertDeepEqualJson(domainDetailViews?.optional_fields, domainDetailViewDescriptorOptionalFields, `${label} domain detail optional descriptor fields`);
  assertFieldsMatch(domainDetailViews, {
    optional: true,
    capability_id: "opl_app.typed_domain_views.v3",
    requirement_class: "optional_domain_enhancement",
    fast_profile_role: "declaration_derived_locator_and_transport_state_only",
    full_payload_in_fast_state_allowed: false,
    app_agent_id_branching_allowed: false,
    renderer_selection_field: "view_kind",
    renderer_registry_source: "shared_mcp_app_renderer_registry",
    unknown_view_kind_policy: "localized_unavailable_preserve_work_item_and_return_to_runtime",
    app_domain_schema_registry_allowed: false,
    machine_fields_default_visible: false,
  }, `${label} domain detail views`);
  assertFieldsMatch(domainDetailViews?.absence_policy, {
    app_state_activation_allowed: true,
    runtime_core_unaffected: true,
    work_item_row_and_core_detail_preserved: true,
    dependent_detail_surfaces_hidden: true,
    global_failure_allowed: false,
  }, `${label} optional domain detail absence policy`);
  if (Object.hasOwn(domainDetailViews ?? {}, "registered_view_kinds")) {
    throw new Error(`${label} domain detail views must not mirror a domain-owned view registry`);
  }
  assertDeepEqualJson(projection.row_identity_contract?.mutation_identity_fields, workItemIdentityFields, `${label} mutation_identity_fields`);
  assertDeepEqualJson(projection.row_identity_contract?.readback_identity_fields, workItemReadbackIdentityFields, `${label} readback_identity_fields`);
  assertFieldsMatch(projection.row_identity_contract, {
    canonical_row_key: "item_id",
    detail_selection_key: "item_id",
    item_id_scope: "globally_canonical",
    identity_work_item_id_scope: "project_local",
    duplicate_local_work_item_id_across_projects_allowed: true,
  }, `${label} row_identity_contract`, ".");
  assertFieldsMatch(projection.diagnostic_envelope_contract, {
    diagnostics_items_field_required: true,
    fast_profile_detail_policy: "summary_only",
    fast_profile_nonzero_count_with_empty_items_is_valid: true,
    fast_profile_embedded_item_count_must_not_exceed_count: true,
    full_profile_detail_policy: "included",
    included_count_must_equal_embedded_item_count: true,
    valid_summary_only_preserves_projects_and_work_items: true,
  }, `${label} diagnostic_envelope_contract`, ".");
  assertDeepEqualJson(projection.action_envelope_contract?.required_fields, action.required_fields, `${label} action envelope required_fields`);
  assertDeepEqualJson(projection.action_envelope_contract?.owner_kinds, action.owner_kinds, `${label} action envelope owner_kinds`);
  assertDeepEqualJson(projection.action_envelope_contract?.default_row_fields, ["kind", "title_key", "message_args", "owner", "owner_kind"], `${label} action envelope default_row_fields`);
  assertDeepEqualJson(projection.action_envelope_contract?.compatibility_fallback_fields, action.compatibility_fallback_fields, `${label} action envelope compatibility_fallback_fields`);
  if (
    projection.action_envelope_contract?.localization_owner !== "shell_current_app_locale" ||
    projection.action_envelope_contract?.cross_locale_raw_fallback_allowed !== false ||
    projection.action_envelope_contract?.raw_owner_default_render_allowed !== false ||
    projection.action_envelope_contract?.mutating_actions_require_app_action_route !== true
  ) {
    throw new Error(`${label} action envelope must use semantic locale rendering and the App action route`);
  }

  const visibilityMutation = projection.visibility_mutation_contract;
  assertDeepEqualJson(visibilityMutation?.payload_required_fields, [...workItemIdentityFields, "visibility_state"], `${label} visibility mutation payload_required_fields`);
  assertDeepEqualJson(visibilityMutation?.payload_optional_fields, ["reason", "expected_generation"], `${label} visibility mutation payload_optional_fields`);
  assertDeepEqualJson(visibilityMutation?.visibility_values, visibility.states, `${label} visibility mutation values`);
  assertDeepEqualJson(visibilityMutation?.success_readback_identity_fields, workItemReadbackIdentityFields, `${label} visibility mutation success_readback_identity_fields`);
  assertFieldsMatch(visibilityMutation, {
    action_id: "work_item_visibility_set",
    action_route: "opl app action execute --action work_item_visibility_set --payload <json> --json",
    expected_generation_source: "item.visibility.generation",
    expected_generation_required_when_available: true,
    concurrency_token_readback_source: "item.visibility.generation",
    optimistic_local_truth_commit_allowed: false,
    local_storage_truth_allowed: false,
    success_refresh_command: "opl app state --profile fast --json",
    success_readback_selector: "work_item_projection_v2.items[identity.agent_id=payload.agent_id && identity.project_id=payload.project_id && identity.work_item_id=payload.work_item_id]",
    success_requires_requested_visibility: true,
    generation_conflict_error: "work_item_control_generation_conflict",
    failure_preserves_authoritative_projection: true,
    visibility_mutation_may_change_lifecycle: false,
    visibility_mutation_may_stop_execution: false,
    visibility_mutation_may_delete_evidence: false,
    stop_requires_separate_framework_action: true,
  }, `${label} visibility mutation`);

  assertDeepEqualJson(projection.detail_layer_contract?.primary_sections, workItemDetailPrimarySections, `${label} detail primary sections`);
  assertDeepEqualJson(projection.detail_layer_contract?.secondary_sections, runtimeWorkItemDetailSecondarySections, `${label} detail secondary sections`);
  assertDeepEqualJson(projection.detail_layer_contract?.diagnostic_sections, [], `${label} detail diagnostic sections`);
  assertIncludesAll(projection.detail_layer_contract?.stage_map_fields, ["stage_id", "display_name", "state", "owner", "elapsed", "usage", "next_action"], `${label} stage map fields`);
  for (const forbidden of ["timeline_event_fields", "timeline_event_types"]) {
    if (Object.hasOwn(projection.detail_layer_contract ?? {}, forbidden)) {
      throw new Error(`${label} detail layer must not expose ${forbidden} in Runtime`);
    }
  }
  if (projection.detail_layer_contract?.default_visibility !== "on_selected_work_item_only" || projection.detail_layer_contract?.selection_key !== "item_id") {
    throw new Error(`${label} detail layer must select globally canonical item_id after work-item selection`);
  }

  const detailRead = projection.domain_detail_view_read_contract;
  assertDeepEqualJson(detailRead?.availability_values, ["available", "missing", "stale", "invalid", "read_error"], `${label} domain detail read availability values`);
  assertDeepEqualJson(detailRead?.response_optional_fields, ["digest", "generation", "payload_schema_ref", "payload_schema"], `${label} domain detail optional response fields`);
  assertFieldsMatch(detailRead, {
    surface_kind: "opl_domain_detail_view",
    schema_version: "opl_domain_detail_view.v1",
    command: "opl app view read --item-id <canonical-item-id> --view-id <view-id> [--if-revision <revision>] --json",
    optional_revision_argument: "--if-revision <revision>",
    resolver_owner: "opl_framework_standard_agent_descriptor",
    app_may_submit_ref_or_path: false,
    arbitrary_path_read_allowed: false,
    workspace_containment_required: true,
    symlink_escape_allowed: false,
    app_payload_shape_interpretation_allowed: false,
    size_limit_fail_closed: true,
    digest_validation_required_when_present: true,
    availability_is_transport_state_only: true,
    transport_state_may_be_interpreted_as_scientific_outcome: false,
    app_role: "typed_display_consumer",
    shell_renderer_registry: "shared_mcp_app_view_kind_keyed_no_agent_id_branching",
  }, `${label} domain detail read`);
  if (detailRead?.unchanged_response?.not_modified !== true || detailRead?.unchanged_response?.payload !== null) {
    throw new Error(`${label} domain detail read must preserve the prior view on not_modified`);
  }
  if (Object.hasOwn(detailRead ?? {}, "payload_contracts")) {
    throw new Error(`${label} App contract must not mirror domain-owned payload schemas`);
  }
  assertIncludesAll(
    projection.forbidden_claims,
    ["shell_runtime_truth", "domain_truth", "owner_receipt_authority", "artifact_body", "release_currentness", "live_runtime_readiness"],
    `${label} forbidden_claims`,
  );
}

export function validateAgentAvailabilityProjectionContract(projection, label) {
  if (!projection || typeof projection !== "object") {
    throw new Error(`${label} must be declared`);
  }
  assertFieldsMatch(projection, {
    surface_kind: "opl_agent_availability_projection",
    schema_version: "agent-availability-projection.v1",
    authority: "one_person_lab_agent_catalog_and_package_readiness_projection",
    app_role: "display_only_agent_availability_consumer",
    independent_from_work_item_state: true,
    all_healthy_panel_state: "collapsed_summary",
    bare_count_or_fraction_allowed: false,
    task_count_is_availability: false,
    membership_source: "app_state.agent_packages.directory installed present kind=agent entries",
    inclusion_policy: "installed_present_kind_agent_with_task_provider",
    app_hardcoded_agent_ids_allowed: false,
    dependency_packages_are_agent_options: false,
  }, label);
  assertDeepEqualJson(projection.required_fields, ["agent_id", "display_name", "availability", "reason", "last_checked_at"], `${label} required_fields`);
  assertDeepEqualJson(projection.availability_states, ["available", "attention_required", "unavailable"], `${label} availability_states`);
}

export function validateTaskRunProjectionV2Fixture(task, label) {
  if (!task || typeof task !== "object") {
    throw new Error(`${label} must be declared`);
  }
  for (const field of taskRunRequiredFields) {
    if (!Object.hasOwn(task, field)) {
      throw new Error(`${label} must include ${field}`);
    }
  }
  if (typeof task.diagnostics_ref !== "string" || task.diagnostics_ref.length === 0) {
    throw new Error(`${label} diagnostics_ref must be a non-empty ref`);
  }
  for (const group of ["evidence_cards", "action_cards", "resource_cards"]) {
    if (!Array.isArray(task[group]) || task[group].length === 0) {
      throw new Error(`${label} ${group} must include at least one card`);
    }
    if (!task[group][0]?.open_action || typeof task[group][0].open_action !== "object") {
      throw new Error(`${label} ${group}[0] must include open_action object`);
    }
  }
  for (const group of ["task_identity", "status", "progress"]) {
    if (!task[group] || typeof task[group] !== "object" || Array.isArray(task[group])) {
      throw new Error(`${label} ${group} must be an object`);
    }
  }
  if (!task.conditions?.[0] || typeof task.conditions[0] !== "object") {
    throw new Error(`${label} conditions must include an object`);
  }
  if (task.status?.primary_state && !runtimePrimaryStateValues.includes(task.status.primary_state)) {
    throw new Error(`${label} status.primary_state must be one of ${runtimePrimaryStateValues.join(", ")}`);
  }
  if (task.status?.automation_state && !runtimeAutomationStateValues.includes(task.status.automation_state)) {
    throw new Error(`${label} status.automation_state must be one of ${runtimeAutomationStateValues.join(", ")}`);
  }
  assertNoForbiddenKeys(task, [
    "artifact_body", "artifact_body_preview", "domain_artifact_body", "domain_truth",
    "owner_receipt_body", "domain_quality_verdict", "quality_verdict", "domain_readiness",
    "domain_ready", "app_release_readiness", "production_readiness",
  ], label);
}

function validateResourceContextPolicy(policy, label) {
  if (!policy || typeof policy !== "object") {
    throw new Error(`${label} must be declared`);
  }
  assertIncludesAll(policy.optional_ref_fields, resourceContextOptionalTaskRefs, `${label} optional_ref_fields`);
  assertNonEmptyStringArray(policy.plan_approve_execute_collect_flow, `${label} plan_approve_execute_collect_flow`);
  assertNonEmptyStringArray(policy.console_management_ref_fields, `${label} console_management_ref_fields`);
  assertNonEmptyStringArray(policy.environment_catalog_policy?.ref_fields, `${label} environment catalog ref fields`);
  if (
    policy.environment_catalog_policy?.environment_body_access !== false ||
    policy.environment_catalog_policy?.package_lock_body_access !== false
  ) {
    throw new Error(`${label} environment catalog must remain refs-only`);
  }
}