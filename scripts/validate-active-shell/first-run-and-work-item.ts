import { assertDeepEqualJson, assertIncludesAll } from "./assertions.ts";
import {
  appOwnedAgentModuleStatusPanel,
  appOwnedGenericOwnerAcceptanceCurrentnessRefPolicy,
  appOwnedPrimaryGroupingPolicy,
  appOwnedProjectGroupExpansionPolicy,
  appOwnedQueueStatusPolicy,
  appOwnedRuntimeMentalModel,
  appOwnedRunningStatePolicy,
  runtimeAutomationStateValues,
  runtimePrimaryStateValues,
  retiredMasOwnerAcceptanceMirrorFields,
  runtimeScopeRequiredFields,
  actionEnvelopeKinds,
  actionOwnerKinds,
  domainDetailViewAvailabilityValues,
  domainDetailViewDescriptorFields,
  domainDetailViewDescriptorOptionalFields,
  domainDetailViewReadAvailabilityValues,
  systemAttentionResponsibilityFields,
  taskRunProjectionV2FieldGroups,
  taskRunProjectionV2RequiredFields,
  tokenObservationObservedFields,
  tokenObservationStates,
  workItemConditionFields,
  workItemDetailPrimarySections,
  runtimeWorkItemDetailSecondarySections,
  workItemPrimaryStateLabelsByLocale,
  workItemBusinessStates,
  workItemProjectionFieldContracts,
  workItemProjectionRequiredFields,
  workItemVisibilityStates,
} from "./app-contract-constants.ts";

import {
  assertFirstRunProgressModelMatches,
  assertFirstRunProgressModelShape,
  assertNonEmptyString,
  assertNonEmptyStringArray,
  assertSharedFirstRunProgressModelMatches,
  resourceContextOptionalTaskRefs,
} from "./validation-primitives.ts";
import { validateSettingsCapabilitiesTaskAwarenessSurface } from "./settings-and-provider.ts";

export function validateTaskAwarenessProjectionContract(projection, label) {
  if (!projection || typeof projection !== "object") {
    throw new Error(`${label} must be declared`);
  }
  for (const [field, expected] of Object.entries({
    source: "app_state.operator.workbench.task_drilldowns",
    authority: "opl_framework_refs_only_task_awareness_projection",
    display_policy: "conversation_and_inspector_task_awareness_refs_no_runtime_dashboard",
    global_surface: "none_runtime_uses_work_item_projection_v2",
    app_role: "display_only_task_awareness_consumer",
    shell_role: "thin_renderer_no_runtime_store",
  })) {
    if (projection[field] !== expected) {
      throw new Error(`${label} ${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    projection.current_task_surfaces,
    ["ordinary_conversation", "right_context_inspector"],
    `${label} current_task_surfaces`,
  );
  validateTaskRunProjectionV2Contract(projection, label);
  assertIncludesAll(
    projection.required_task_ref_fields,
    taskRunProjectionV2RequiredFields,
    `${label} required_task_ref_fields`,
  );
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
  for (const [field, expected] of Object.entries({
    artifact_or_blocker_policy: "summary_ref_only_no_artifact_body",
    review_receipt_policy: "receipt_ref_only_no_quality_or_readiness_verdict",
    action_receipt_policy: "dry_run_plan_and_execute_receipt_refs_only_via_opl_app_action",
    workflow_ref_policy: "capability_workflow_refs_only_no_app_skill_body_write",
    export_bundle_policy: "framework_domain_action_ref_only_app_displays_dry_run_execute_receipt",
    temporal_policy: "diagnostics_only_never_user_task_model",
  })) {
    if (projection[field] !== expected) {
      throw new Error(`${label} ${field} must be ${expected}`);
    }
  }
  validateSettingsCapabilitiesTaskAwarenessSurface(
    projection.settings_capabilities_surface,
    `${label} settings_capabilities_surface`,
  );
  if (projection.resource_context_policy) {
    validateResourceContextPolicy(
      projection.resource_context_policy,
      `${label} resource_context_policy`,
    );
  } else if (
    projection.resource_context_policy_ref !==
    "contracts/app-runtime-bridge.json#task_awareness_projection.resource_context_policy"
  ) {
    throw new Error(`${label} must declare resource_context_policy or resource_context_policy_ref`);
  }
  assertIncludesAll(
    projection.forbidden_claims,
    [
      "new_task_dashboard",
      "shell_runtime_truth",
      "temporal_as_user_task_model",
      "artifact_body",
      "owner_receipt_authority",
      "domain_quality_verdict",
      "domain_readiness",
      "app_release_readiness",
      "family_production_readiness",
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
    assertNonEmptyString(item?.identity?.agent_id, `${itemLabel}.identity.agent_id`);
    assertNonEmptyString(item?.identity?.project_id, `${itemLabel}.identity.project_id`);
    assertNonEmptyString(item?.identity?.work_item_id, `${itemLabel}.identity.work_item_id`);
    if (itemIds.has(item.item_id)) {
      throw new Error(`${label} item_id must be globally unique`);
    }
    itemIds.add(item.item_id);
    const mutationTuple = [
      item.identity.agent_id,
      item.identity.project_id,
      item.identity.work_item_id,
    ].join("\u0000");
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
  for (const [field, expected] of Object.entries({
    surface_kind: "opl_work_item_projection",
    schema_version: "work-item-projection.v2",
    authority: "one_person_lab_canonical_work_item_projection",
    display_policy: "canonical_work_item_axes_default_decision_fields_diagnostics_on_demand",
    app_role: "display_only_work_item_projection_consumer",
    shell_role: "thin_renderer_no_projection_inference",
  })) {
    if (projection[field] !== expected) {
      throw new Error(`${label} ${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    projection.model_chain,
    ["Agent", "Project", "Work Item", "Visibility", "Stage", "Action", "Evidence"],
    `${label} model_chain`,
  );
  assertDeepEqualJson(
    projection.required_fields,
    workItemProjectionRequiredFields,
    `${label} required_fields`,
  );
  for (const [field, requiredFields] of Object.entries(workItemProjectionFieldContracts)) {
    assertDeepEqualJson(
      projection.field_contracts?.[field]?.required_fields,
      requiredFields,
      `${label} field_contracts.${field}.required_fields`,
    );
  }
  assertDeepEqualJson(
    projection.field_contracts?.lifecycle?.primary_state_labels_by_locale,
    workItemPrimaryStateLabelsByLocale,
    `${label} lifecycle primary state labels`,
  );
  const identity = projection.field_contracts?.identity;
  for (const [field, expected] of Object.entries({
    project_display_name_source: "canonical_workspace_path_basename",
    project_display_name_must_equal_workspace_path_basename: true,
    project_id_source: "canonical_workspace_path_hash",
    workspace_directory_rename_changes_display_name: true,
    workspace_directory_rename_changes_project_id: true,
    binding_label_may_override_project_display_name: false,
    spoken_name_may_override_project_display_name: false,
    runtime_history_may_override_project_display_name: false,
    execution_fallback_allowed: false,
  })) {
    if (identity?.[field] !== expected) {
      throw new Error(`${label} identity.${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    projection.field_contracts?.lifecycle?.business_states,
    workItemBusinessStates,
    `${label} lifecycle business_states`,
  );
  for (const [field, expected] of Object.entries({
    primary_state_projection_owner: "opl_framework",
    primary_state_label_render_owner: "shell_current_app_locale",
    shell_state_derivation_allowed: false,
    projected_primary_state_label_role: "compatibility_fallback_only",
    cross_locale_projected_label_allowed: false,
  })) {
    if (projection.field_contracts?.lifecycle?.[field] !== expected) {
      throw new Error(`${label} lifecycle.${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    projection.field_contracts?.attention?.system_responsibility_required_fields,
    systemAttentionResponsibilityFields,
    `${label} system attention responsibility fields`,
  );
  if (
    projection.field_contracts?.attention?.system_attention_requires_current_generation !== true ||
    projection.field_contracts?.attention?.system_attention_requires_current_blocker !== true ||
    projection.field_contracts?.attention?.incomplete_system_responsibility_policy !==
      "do_not_emit_system_attention_keep_lifecycle_state_and_defer_diagnostics"
  ) {
    throw new Error(`${label} system attention must require a complete current responsibility envelope`);
  }
  assertDeepEqualJson(
    projection.field_contracts?.telemetry?.states,
    ["observed", "partial", "missing", "stale"],
    `${label} telemetry states`,
  );
  assertDeepEqualJson(
    projection.field_contracts?.telemetry?.token_observation?.states,
    tokenObservationStates,
    `${label} token observation states`,
  );
  assertDeepEqualJson(
    projection.field_contracts?.telemetry?.token_observation?.observed_required_fields,
    tokenObservationObservedFields,
    `${label} observed token fields`,
  );
  if (
    projection.field_contracts?.telemetry?.token_observation?.missing_required_fields?.[0] !== "reason" ||
    projection.field_contracts?.telemetry?.missing_may_render_as_zero !== false ||
    projection.field_contracts?.telemetry?.zero_requires_observed_zero !== true ||
    projection.field_contracts?.telemetry?.token_limit_configured !== false ||
    projection.field_contracts?.telemetry?.token_progress_bar_allowed !== false
  ) {
    throw new Error(`${label} token telemetry must be observed-only with no fabricated zero or limit bar`);
  }
  const visibility = projection.field_contracts?.visibility;
  assertDeepEqualJson(visibility?.states, workItemVisibilityStates, `${label} visibility states`);
  for (const [field, expected] of Object.entries({
    authority: "opl_framework_work_item_visibility",
    lifecycle_independent: true,
    generation_is_concurrency_token: true,
    mutation_requires_expected_generation_when_available: true,
    local_storage_truth_allowed: false,
  })) {
    if (visibility?.[field] !== expected) {
      throw new Error(`${label} visibility.${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    visibility?.source_values,
    ["default", "work_item_control_ledger"],
    `${label} visibility source_values`,
  );
  const action = projection.field_contracts?.action;
  assertDeepEqualJson(action?.owner_kinds, actionOwnerKinds, `${label} action owner_kinds`);
  assertDeepEqualJson(
    action?.compatibility_fallback_fields,
    ["title", "summary"],
    `${label} action compatibility_fallback_fields`,
  );
  for (const [field, expected] of Object.entries({
    message_args_policy: "single_structured_values_object_not_prelocalized_sentences",
    render_owner: "shell_current_app_locale",
    compatibility_fallback_only: true,
    cross_locale_raw_fallback_allowed: false,
    raw_owner_default_render_allowed: false,
  })) {
    if (action?.[field] !== expected) {
      throw new Error(`${label} action.${field} must be ${expected}`);
    }
  }
  const domainDetailViews = projection.field_contracts?.domain_detail_views;
  assertDeepEqualJson(
    domainDetailViews?.required_fields,
    domainDetailViewDescriptorFields,
    `${label} domain detail descriptor fields`,
  );
  assertDeepEqualJson(
    domainDetailViews?.availability_values,
    domainDetailViewAvailabilityValues,
    `${label} domain detail availability values`,
  );
  assertDeepEqualJson(
    domainDetailViews?.optional_fields,
    domainDetailViewDescriptorOptionalFields,
    `${label} domain detail optional descriptor fields`,
  );
  assertDeepEqualJson(
    domainDetailViews?.machine_only_fields,
    ["revision", "digest"],
    `${label} domain detail machine-only fields`,
  );
  for (const [field, expected] of Object.entries({
    optional: true,
    capability_id: "opl_app.typed_domain_views.v3",
    requirement_class: "optional_domain_enhancement",
    collection_kind: "typed_agent_owned_item_detail_descriptors",
    fast_profile_role: "declaration_derived_locator_and_transport_state_only",
    full_payload_in_fast_state_allowed: false,
    app_agent_id_branching_allowed: false,
    renderer_selection_field: "view_kind",
    renderer_registry_source: "shared_mcp_app_renderer_registry",
    unknown_view_kind_policy: "localized_unavailable_preserve_work_item_and_return_to_runtime",
    app_domain_schema_registry_allowed: false,
    machine_fields_default_visible: false,
  })) {
    if (domainDetailViews?.[field] !== expected) {
      throw new Error(`${label} domain detail views ${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    domainDetailViews?.absence_policy,
    {
      app_state_activation_allowed: true,
      runtime_core_unaffected: true,
      work_item_row_and_core_detail_preserved: true,
      dependent_detail_surfaces_hidden: true,
      global_failure_allowed: false,
    },
    `${label} optional domain detail absence policy`,
  );
  if (Object.hasOwn(domainDetailViews ?? {}, "registered_view_kinds")) {
    throw new Error(`${label} domain detail views must not mirror a domain-owned view registry`);
  }
  assertDeepEqualJson(
    projection.row_identity_contract,
    {
      canonical_row_key: "item_id",
      detail_selection_key: "item_id",
      item_id_scope: "globally_canonical",
      item_id_derivation: "project_id_plus_encoded_work_item_id",
      identity_work_item_id_scope: "project_local",
      duplicate_local_work_item_id_across_projects_allowed: true,
      mutation_identity_fields: ["agent_id", "project_id", "work_item_id"],
      readback_identity_fields: [
        "identity.agent_id",
        "identity.project_id",
        "identity.work_item_id",
      ],
    },
    `${label} row_identity_contract`,
  );
  for (const [field, expected] of Object.entries({
    diagnostics_items_field_required: true,
    fast_profile_detail_policy: "summary_only",
    fast_profile_nonzero_count_with_empty_items_is_valid: true,
    fast_profile_embedded_item_count_must_not_exceed_count: true,
    full_profile_detail_policy: "included",
    included_count_must_equal_embedded_item_count: true,
    valid_summary_only_preserves_projects_and_work_items: true,
  })) {
    if (projection.diagnostic_envelope_contract?.[field] !== expected) {
      throw new Error(`${label} diagnostic_envelope_contract.${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    projection.default_display_fields,
    [
      "identity.project_display_name",
      "identity.work_item_display_name",
      "identity.agent_display_name",
      "lifecycle.primary_state",
      "visibility.state",
      "execution.current_stage_display_name",
      "execution.next_stage_display_name",
      "telemetry.elapsed",
      "telemetry.current_stage_tokens",
      "telemetry.task_total_tokens",
      "action.title_key",
      "action.message_args",
      "action.owner",
      "action.owner_kind",
    ],
    `${label} default_display_fields`,
  );
  assertDeepEqualJson(
    projection.condition_contract?.required_fields,
    workItemConditionFields,
    `${label} condition required_fields`,
  );
  assertDeepEqualJson(
    projection.action_envelope_contract?.action_kinds,
    actionEnvelopeKinds,
    `${label} action envelope kinds`,
  );
  assertDeepEqualJson(
    projection.action_envelope_contract?.required_fields,
    workItemProjectionFieldContracts.action,
    `${label} action envelope required_fields`,
  );
  assertDeepEqualJson(
    projection.action_envelope_contract?.owner_kinds,
    actionOwnerKinds,
    `${label} action envelope owner_kinds`,
  );
  assertDeepEqualJson(
    projection.action_envelope_contract?.default_row_fields,
    ["kind", "title_key", "message_args", "owner", "owner_kind"],
    `${label} action envelope default_row_fields`,
  );
  assertDeepEqualJson(
    projection.action_envelope_contract?.compatibility_fallback_fields,
    ["title", "summary"],
    `${label} action envelope compatibility_fallback_fields`,
  );
  if (
    projection.action_envelope_contract?.default_action_source !==
      "current_owner_delta_or_task_action_cards" ||
    projection.action_envelope_contract?.localization_owner !== "shell_current_app_locale" ||
    projection.action_envelope_contract?.compatibility_fallback_only !== true ||
    projection.action_envelope_contract?.cross_locale_raw_fallback_allowed !== false ||
    projection.action_envelope_contract?.raw_owner_default_render_allowed !== false ||
    projection.action_envelope_contract?.mutating_actions_require_app_action_route !== true
  ) {
    throw new Error(`${label} action envelope must use semantic locale rendering and the App action route`);
  }
  const visibilityMutation = projection.visibility_mutation_contract;
  assertDeepEqualJson(
    visibilityMutation?.payload_required_fields,
    ["agent_id", "project_id", "work_item_id", "visibility_state"],
    `${label} visibility mutation payload_required_fields`,
  );
  assertDeepEqualJson(
    visibilityMutation?.payload_optional_fields,
    ["reason", "expected_generation"],
    `${label} visibility mutation payload_optional_fields`,
  );
  assertDeepEqualJson(
    visibilityMutation?.visibility_values,
    workItemVisibilityStates,
    `${label} visibility mutation values`,
  );
  for (const [field, expected] of Object.entries({
    action_id: "work_item_visibility_set",
    action_route: "opl app action execute --action work_item_visibility_set --payload <json> --json",
    expected_generation_source: "item.visibility.generation",
    expected_generation_required_when_available: true,
    concurrency_token_readback_source: "item.visibility.generation",
    optimistic_local_truth_commit_allowed: false,
    local_storage_truth_allowed: false,
    success_refresh_command: "opl app state --profile fast --json",
    success_readback_selector:
      "work_item_projection_v2.items[identity.agent_id=payload.agent_id && identity.project_id=payload.project_id && identity.work_item_id=payload.work_item_id]",
    success_requires_requested_visibility: true,
    generation_conflict_error: "work_item_control_generation_conflict",
    generation_conflict_policy: "refresh_authoritative_projection_then_prompt_retry",
    failure_preserves_authoritative_projection: true,
    visibility_mutation_may_change_lifecycle: false,
    visibility_mutation_may_stop_execution: false,
    visibility_mutation_may_delete_evidence: false,
    stop_requires_separate_framework_action: true,
  })) {
    if (visibilityMutation?.[field] !== expected) {
      throw new Error(`${label} visibility mutation ${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    visibilityMutation?.success_readback_identity_fields,
    ["identity.agent_id", "identity.project_id", "identity.work_item_id"],
    `${label} visibility mutation success_readback_identity_fields`,
  );
  assertDeepEqualJson(
    visibilityMutation?.success_readback_required_fields,
    [
      "item_id",
      "identity.agent_id",
      "identity.project_id",
      "identity.work_item_id",
      "visibility.state",
      "visibility.source",
      "visibility.updated_at",
      "visibility.control_ref",
      "visibility.generation",
      "lifecycle",
      "execution",
      "telemetry",
    ],
    `${label} visibility mutation success_readback_required_fields`,
  );
  assertIncludesAll(
    projection.stage_catalog_contract?.required_fields,
    ["stage_id", "display_name", "description", "owner_kind", "next_action_template"],
    `${label} stage catalog required_fields`,
  );
  assertDeepEqualJson(
    projection.detail_layer_contract?.primary_sections,
    workItemDetailPrimarySections,
    `${label} detail primary sections`,
  );
  assertDeepEqualJson(
    projection.detail_layer_contract?.secondary_sections,
    runtimeWorkItemDetailSecondarySections,
    `${label} detail secondary sections`,
  );
  assertDeepEqualJson(
    projection.detail_layer_contract?.domain_detail_view_entry_fields,
    ["view_id", "view_kind", "title", "availability"],
    `${label} domain detail entry fields`,
  );
  assertDeepEqualJson(
    projection.detail_layer_contract?.diagnostic_sections,
    [],
    `${label} detail diagnostic sections`,
  );
  assertIncludesAll(
    projection.detail_layer_contract?.stage_map_fields,
    ["stage_id", "display_name", "state", "owner", "elapsed", "usage", "next_action"],
    `${label} stage map fields`,
  );
  for (const forbidden of ["timeline_event_fields", "timeline_event_types"]) {
    if (Object.hasOwn(projection.detail_layer_contract ?? {}, forbidden)) {
      throw new Error(`${label} detail layer must not expose ${forbidden} in Runtime`);
    }
  }
  if (projection.detail_layer_contract?.default_visibility !== "on_selected_work_item_only") {
    throw new Error(`${label} detail layer must be opened only after selecting a work item`);
  }
  if (projection.detail_layer_contract?.selection_key !== "item_id") {
    throw new Error(`${label} detail layer must select globally canonical item_id`);
  }
  const detailRead = projection.domain_detail_view_read_contract;
  assertDeepEqualJson(
    detailRead?.availability_values,
    domainDetailViewReadAvailabilityValues,
    `${label} domain detail read availability values`,
  );
  assertDeepEqualJson(
    detailRead?.response_required_fields,
    [
      "schema_version",
      "surface_kind",
      "item_id",
      "view_id",
      "view_kind",
      "availability",
      "revision",
      "not_modified",
      "payload",
      "conditions",
    ],
    `${label} domain detail response fields`,
  );
  assertDeepEqualJson(
    detailRead?.response_optional_fields,
    ["digest", "generation", "payload_schema_ref", "payload_schema"],
    `${label} domain detail optional response fields`,
  );
  for (const [field, expected] of Object.entries({
    surface_kind: "opl_domain_detail_view",
    schema_version: "opl_domain_detail_view.v1",
    descriptor_path: "items[].domain_detail_views[]",
    command: "opl app view read --item-id <canonical-item-id> --view-id <view-id> [--if-revision <revision>] --json",
    optional_revision_argument: "--if-revision <revision>",
    compatibility_generation_policy: "deprecated_optional_alias_must_equal_revision",
    resolver_owner: "opl_framework_standard_agent_descriptor",
    app_may_submit_ref_or_path: false,
    arbitrary_path_read_allowed: false,
    workspace_containment_required: true,
    symlink_escape_allowed: false,
    schema_validation_owner: "shared_mcp_app_renderer_against_owner_declared_schema",
    app_payload_shape_interpretation_allowed: false,
    size_limit_fail_closed: true,
    digest_validation_required_when_present: true,
    availability_is_transport_state_only: true,
    transport_state_may_be_interpreted_as_scientific_outcome: false,
    owner_projection_body_kind: "typed_domain_read_model_not_artifact_body",
    app_role: "typed_display_consumer",
    shell_renderer_registry: "shared_mcp_app_view_kind_keyed_no_agent_id_branching",
  })) {
    if (detailRead?.[field] !== expected) {
      throw new Error(`${label} domain detail read ${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    detailRead?.selection_fields,
    ["item_id", "view_id"],
    `${label} domain detail read selection fields`,
  );
  if (detailRead?.unchanged_response?.not_modified !== true || detailRead?.unchanged_response?.payload !== null) {
    throw new Error(`${label} domain detail read must preserve the prior view on not_modified`);
  }
  if (Object.hasOwn(detailRead ?? {}, "payload_contracts")) {
    throw new Error(`${label} App contract must not mirror domain-owned payload schemas`);
  }
  if (
    projection.refs_only !== true ||
    projection.artifact_body_access !== false ||
    projection.owner_receipt_write_access !== false
  ) {
    throw new Error(`${label} must remain refs-only and non-authoritative`);
  }
  assertIncludesAll(
    projection.forbidden_claims,
    [
      "shell_runtime_truth",
      "domain_truth",
      "owner_receipt_authority",
      "artifact_body",
      "release_currentness",
      "live_runtime_readiness",
    ],
    `${label} forbidden_claims`,
  );
}

export function validateAgentAvailabilityProjectionContract(projection, label) {
  if (!projection || typeof projection !== "object") {
    throw new Error(`${label} must be declared`);
  }
  for (const [field, expected] of Object.entries({
    surface_kind: "opl_agent_availability_projection",
    schema_version: "agent-availability-projection.v1",
    authority: "one_person_lab_agent_catalog_and_package_readiness_projection",
    app_role: "display_only_agent_availability_consumer",
    independent_from_work_item_state: true,
  })) {
    if (projection[field] !== expected) {
      throw new Error(`${label} ${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    projection.required_fields,
    ["agent_id", "display_name", "availability", "reason", "last_checked_at"],
    `${label} required_fields`,
  );
  assertDeepEqualJson(
    projection.availability_states,
    ["available", "attention_required", "unavailable"],
    `${label} availability_states`,
  );
  if (
    projection.all_healthy_panel_state !== "collapsed_summary" ||
    projection.bare_count_or_fraction_allowed !== false ||
    projection.task_count_is_availability !== false ||
    projection.membership_source !== "app_state.agent_packages.directory installed present kind=agent entries" ||
    projection.inclusion_policy !== "installed_present_kind_agent_with_task_provider" ||
    projection.app_hardcoded_agent_ids_allowed !== false ||
    projection.dependency_packages_are_agent_options !== false
  ) {
    throw new Error(`${label} must express availability only, collapse healthy agents, and reject bare counts`);
  }
}

function validateTaskRunProjectionV2Contract(projection, label) {
  for (const [field, expected] of Object.entries({
    schema_name: "TaskRunProjection",
    schema_version: 2,
    projection_kind: "task_run_projection_v2",
    model_policy:
      "Runtime uses WorkItemProjection v2; ordinary conversation and right inspector consume filtered TaskRunProjection v2 refs.",
    slice_policy:
      "conversation_and_inspector_filtered_slices_runtime_uses_separate_work_item_projection_v2",
    domain_authority_policy: "refs_only_no_domain_authority_no_artifact_body_no_domain_verdict",
  })) {
    if (projection[field] !== expected) {
      throw new Error(`${label} ${field} must be ${expected}`);
    }
  }
  for (const [group, fields] of Object.entries(taskRunProjectionV2FieldGroups)) {
    assertDeepEqualJson(
      projection.v2_field_groups?.[group],
      fields,
      `${label} v2_field_groups.${group}`,
    );
  }
}

export function validateTaskRunProjectionV2Fixture(task, label) {
  if (!task || typeof task !== "object") {
    throw new Error(`${label} must be declared`);
  }
  for (const field of taskRunProjectionV2RequiredFields) {
    if (!Object.hasOwn(task, field)) {
      throw new Error(`${label} must include ${field}`);
    }
  }
  for (const [group, fields] of Object.entries(taskRunProjectionV2FieldGroups)) {
    if (group === "diagnostics_ref") {
      if (typeof task.diagnostics_ref !== "string" || task.diagnostics_ref.length === 0) {
        throw new Error(`${label} diagnostics_ref must be a non-empty ref`);
      }
      continue;
    }
    const value = group === "conditions" ? task.conditions?.[0] : task[group];
    if (["evidence_cards", "action_cards", "resource_cards"].includes(group)) {
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`${label} ${group} must include at least one card`);
      }
      for (const field of fields) {
        if (!Object.hasOwn(value[0], field)) {
          throw new Error(`${label} ${group}[0] must include ${field}`);
        }
      }
      if (
        ["evidence_cards", "action_cards", "resource_cards"].includes(group) &&
        (!value[0].open_action || typeof value[0].open_action !== "object")
      ) {
        throw new Error(`${label} ${group}[0] must include open_action object`);
      }
    } else {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label} ${group} must be an object`);
      }
      for (const field of fields) {
        if (!Object.hasOwn(value, field)) {
          throw new Error(`${label} ${group} must include ${field}`);
        }
      }
    }
  }
  const status = task.status;
  if (status?.primary_state && !runtimePrimaryStateValues.includes(status.primary_state)) {
    throw new Error(
      `${label} status.primary_state must be one of ${runtimePrimaryStateValues.join(", ")}`,
    );
  }
  if (status?.automation_state && !runtimeAutomationStateValues.includes(status.automation_state)) {
    throw new Error(
      `${label} status.automation_state must be one of ${runtimeAutomationStateValues.join(", ")}`,
    );
  }
  for (const forbidden of [
    "artifact_body",
    "artifact_body_preview",
    "domain_artifact_body",
    "domain_truth",
    "owner_receipt_body",
    "domain_quality_verdict",
    "quality_verdict",
    "domain_readiness",
    "domain_ready",
    "app_release_readiness",
    "production_readiness",
  ]) {
    if (Object.hasOwn(task, forbidden)) {
      throw new Error(`${label} must not project ${forbidden}`);
    }
  }
}

function validateResourceContextPolicy(policy, label) {
  if (!policy || typeof policy !== "object") {
    throw new Error(`${label} must be declared`);
  }
  assertIncludesAll(
    policy.optional_ref_fields,
    resourceContextOptionalTaskRefs,
    `${label} optional_ref_fields`,
  );
  assertDeepEqualJson(
    policy.plan_approve_execute_collect_flow,
    [
      "resource_plan_ref",
      "resource_approval_ref",
      "resource_execute_ref",
      "resource_monitor_ref",
      "resource_collect_ref",
      "resource_receipt_ref",
    ],
    `${label} plan approve execute collect flow`,
  );
  assertDeepEqualJson(
    policy.console_management_ref_fields,
    ["console_policy_ref", "quota_ref", "billing_ref", "permission_ref"],
    `${label} console management ref fields`,
  );
  assertDeepEqualJson(
    policy.environment_catalog_policy?.ref_fields,
    [
      "environment_ref",
      "environment_template_ref",
      "environment_version_ref",
      "environment_source_ref",
      "environment_task_refs",
    ],
    `${label} environment catalog ref fields`,
  );
  if (
    policy.environment_catalog_policy?.environment_body_access !== false ||
    policy.environment_catalog_policy?.package_lock_body_access !== false
  ) {
    throw new Error(`${label} environment catalog must remain refs-only`);
  }
}
