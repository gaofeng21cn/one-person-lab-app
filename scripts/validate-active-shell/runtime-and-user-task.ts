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
  workItemVisibilityStates,
} from "./app-contract-constants.ts";

import {
  assertNonEmptyString,
  assertNonEmptyStringArray,
  resourceContextOptionalTaskRefs,
} from "./validation-primitives.ts";

const stageRunCockpitFields = [
  "stage_run_cockpit",
  "stage_run_cockpit_summary",
  "stage_run_current_owner_delta",
];

const stageRunCockpitRequiredRefs = [
  "task_id",
  "stage_id",
  "owner",
  "next_visible_step",
  "accepted_return_shapes",
  "readiness_false_flag_refs",
];

const stageRunCockpitSummaryFields = [
  "current_owner",
  "required_delta",
  "next_safe_action_ref",
  "artifact_or_blocker_refs",
];

export function validateStageRunCockpitProjectionContract(projection, label) {
  if (!projection || typeof projection !== "object") {
    throw new Error(`${label} must be declared`);
  }
  for (const [field, expected] of Object.entries({
    source:
      "app_state.operator.workbench.task_drilldowns.stage_run_cockpit + app_state.operator.workbench.task_drilldowns.stage_run_cockpit_summary",
    equivalent_source: "app_state.operator.workbench.task_drilldowns.stage_run_current_owner_delta",
    derived_from: "current_owner_delta",
    authority: "opl_framework_current_owner_delta_refs_projection",
    display_policy: "refs_only_stage_run_cockpit_display_guard_no_runtime_truth_claims",
    app_role: "display_only_stage_run_cockpit_consumer",
  })) {
    if (projection[field] !== expected) {
      throw new Error(`${label} ${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    projection.accepted_fast_state_fields,
    stageRunCockpitFields,
    `${label} accepted_fast_state_fields`,
  );
  assertIncludesAll(
    projection.required_ref_fields,
    stageRunCockpitRequiredRefs,
    `${label} required_ref_fields`,
  );
  assertDeepEqualJson(
    projection.optional_ref_fields,
    [
      "elapsed_seconds",
      "last_heartbeat_at",
      "running_proof_ref",
      "stage_usage",
      "task_total_usage",
      "typed_blocker_summary",
      "typed_blocker_owner",
      "typed_blocker_resolution_ref",
    ],
    `${label} optional_ref_fields`,
  );
  assertIncludesAll(
    projection.summary_fields,
    stageRunCockpitSummaryFields,
    `${label} summary_fields`,
  );
  assertNonEmptyStringArray(projection.preferred_panel_fields, `${label} preferred_panel_fields`);
  assertNonEmptyString(projection.telemetry_missing_policy, `${label} telemetry_missing_policy`);
  if (projection.refs_only !== true) {
    throw new Error(`${label} refs_only must be true`);
  }
  assertIncludesAll(
    projection.forbidden_claims,
    [
      "runtime_truth",
      "domain_truth",
      "owner_receipt_authority",
      "typed_blocker_authority",
      "artifact_authority",
      "domain_readiness",
      "app_release_readiness",
      "family_production_readiness",
    ],
    `${label} forbidden_claims`,
  );
}

export function validateStageRunCockpitFixture(task, label) {
  if (!task || typeof task !== "object") {
    throw new Error(`${label} task must be declared`);
  }
  const cockpit = task.stage_run_cockpit ?? task.stage_run_current_owner_delta;
  if (!cockpit || typeof cockpit !== "object") {
    throw new Error(`${label} must include stage_run_cockpit or stage_run_current_owner_delta`);
  }
  if (!task.stage_run_cockpit_summary || typeof task.stage_run_cockpit_summary !== "object") {
    throw new Error(`${label} must include stage_run_cockpit_summary`);
  }
  if (cockpit.derived_from !== "current_owner_delta") {
    throw new Error(`${label} must derive from current_owner_delta`);
  }
  for (const field of stageRunCockpitRequiredRefs) {
    if (!Object.hasOwn(cockpit, field)) {
      throw new Error(`${label} cockpit must include ${field}`);
    }
  }
  for (const field of stageRunCockpitSummaryFields) {
    if (!Object.hasOwn(task.stage_run_cockpit_summary, field)) {
      throw new Error(`${label} summary must include ${field}`);
    }
  }
  if (cockpit.refs_only !== true) {
    throw new Error(`${label} cockpit refs_only must be true`);
  }
  for (const forbidden of [
    "runtime_truth",
    "domain_truth",
    "owner_receipt_body",
    "owner_receipt_authority",
    "typed_blocker_body",
    "typed_blocker_authority",
    "artifact_body",
    "artifact_authority",
    "domain_ready",
    "domain_readiness",
    "app_release_ready",
    "app_release_readiness",
    "production_ready",
    "production_readiness",
  ]) {
    if (
      Object.hasOwn(cockpit, forbidden) ||
      Object.hasOwn(task.stage_run_cockpit_summary, forbidden)
    ) {
      throw new Error(`${label} must not project ${forbidden}`);
    }
  }
}

function validateActiveProjectLineProjectionContract(activeProjectLineProjection, label) {
  if (!activeProjectLineProjection || typeof activeProjectLineProjection !== "object") {
    throw new Error(`${label} must be declared`);
  }
  for (const [field, expected] of Object.entries({
    source:
      "app_state.operator.workbench.activity_center.active_projects + app_state.operator.visual_ref_groups.active_project_refs",
    authority: "opl_framework_refs_only_project_line_projection",
    display_policy:
      "active_project_line_count_can_include_queued_or_escalated_owner_handled_lines_without_active_worker_run",
  })) {
    if (activeProjectLineProjection[field] !== expected) {
      throw new Error(`${label} ${field} must be ${expected}`);
    }
  }
  if (activeProjectLineProjection.status_preservation_required !== true) {
    throw new Error(`${label} must preserve status, active_run_id, and next_visible_step`);
  }
  assertDeepEqualJson(
    activeProjectLineProjection.primary_grouping_policy,
    appOwnedPrimaryGroupingPolicy,
    `${label} primary_grouping_policy`,
  );
  assertDeepEqualJson(
    activeProjectLineProjection.project_group_expansion_policy,
    appOwnedProjectGroupExpansionPolicy,
    `${label} project_group_expansion_policy`,
  );
  assertIncludesAll(
    activeProjectLineProjection.required_fields,
    ["task_id", "title", "state", "status", "study_id", "active_run_id", "next_visible_step"],
    `${label} required_fields`,
  );
  assertIncludesAll(
    activeProjectLineProjection.must_not_claim,
    ["active_worker_run", "provider_execution_running", "domain_ready", "paper_quality_ready"],
    `${label} must_not_claim`,
  );
}

export function validateProjectProgressDisplayContract(projectProgress, label) {
  if (!projectProgress || typeof projectProgress !== "object") {
    throw new Error(`${label} must be declared`);
  }
  for (const [field, expected] of Object.entries({
    source: "app_state.operator.workbench.task_drilldowns",
    authority: "opl_framework_shared_project_progress_projection",
    display_policy: "project_progress_refs_secondary_no_module_runtime_dirty_as_project",
    consumer_surface: "/settings/environment?section=diagnostics",
    runtime_page_visible: false,
    diagnostics_treatment: "maintenance_diagnostics_only",
    safe_actions_treatment: "maintenance_diagnostics_only",
  })) {
    if (projectProgress[field] !== expected) {
      throw new Error(`${label} ${field} must be ${expected}`);
    }
  }
  assertIncludesAll(
    projectProgress.required_fields,
    [
      "task_id",
      "title",
      "domain_id",
      "state",
      "active_stage_id",
      "progress_delta_classification",
      "deliverable_progress_delta",
      "platform_repair_delta",
      "blocker_ref_count",
      "next_visible_step",
      "next_owner",
    ],
    `${label} required_fields`,
  );
  assertIncludesAll(
    projectProgress.optional_user_fields,
    ["domain_label", "active_stage_label", "next_visible_step", "next_owner", "last_progress_at"],
    `${label} optional_user_fields`,
  );
  assertIncludesAll(
    projectProgress.forbidden_running_task_sources,
    [
      "module_runtime dirty state",
      "domain lane active_task_count",
      "assistant purpose cards",
      "module readiness diagnostics",
    ],
    `${label} forbidden_running_task_sources`,
  );
  validateActiveProjectLineProjectionContract(
    projectProgress.active_project_line_projection,
    `${label} active project line projection`,
  );
}

export function validateUserTaskStatusProjectionContract(
  userTaskStatus,
  label,
  stageRunCockpitProjection,
) {
  if (!userTaskStatus || typeof userTaskStatus !== "object") {
    throw new Error(`${label} must be declared`);
  }
  if (!stageRunCockpitProjection || typeof stageRunCockpitProjection !== "object") {
    throw new Error(
      `${label} must receive Runtime bridge StageRun cockpit projection expectations`,
    );
  }
  if (userTaskStatus === stageRunCockpitProjection) {
    throw new Error(
      `${label} must compare against the Runtime bridge StageRun cockpit projection, not itself`,
    );
  }
  for (const [field, expected] of Object.entries({
    source:
      "app_state.operator.workbench.summary_cards + app_state.operator.workbench.activity_center + app_state.operator.workbench.task_drilldowns + app_state.operator.visual_ref_groups.active_project_refs",
    authority: "opl_framework_refs_only_user_task_projection",
    display_policy: "scope_switchable_user_task_status_first_provider_projection_diagnostic_only",
    progress_label_policy:
      "render framework progress classification and stage labels as human task progress labels without exposing raw projection or ledger names",
    diagnostic_source_policy:
      "provider/projection/ref/ledger/current_control_state details stay secondary and are not the default page language",
  })) {
    if (userTaskStatus[field] !== expected) {
      throw new Error(`${label} ${field} must be ${expected}`);
    }
  }
  assertNonEmptyString(userTaskStatus.default_user_question, `${label} default_user_question`);
  assertDeepEqualJson(
    userTaskStatus.generic_owner_acceptance_currentness_ref_policy,
    appOwnedGenericOwnerAcceptanceCurrentnessRefPolicy,
    `${label} generic_owner_acceptance_currentness_ref_policy`,
  );
  assertDeepEqualJson(
    userTaskStatus.scope_fields,
    runtimeScopeRequiredFields,
    `${label} scope_fields`,
  );
  const countPolicies = {
    running_task_count:
      "count user tasks projected as actively running or advancing, never raw provider attempts",
    active_project_count:
      "count active user-visible project lines from the framework project-line projection",
    queued_project_count:
      "count queued or waiting user-visible project/task lines without claiming active worker runs",
    attention_count:
      "count user-visible blockers, human gates, failed safe actions, or owner attention states",
  };
  assertDeepEqualJson(
    userTaskStatus.summary_fields,
    Object.keys(countPolicies),
    `${label} summary_fields`,
  );
  assertDeepEqualJson(
    userTaskStatus.primary_state_summary_fields,
    [
      "in_progress_count",
      "delivered_auto_paused_count",
      "paused_count",
      "owner_decision_count",
      "system_attention_count",
      "automation_running_count",
    ],
    `${label} primary_state_summary_fields`,
  );
  assertDeepEqualJson(
    userTaskStatus.primary_state_fields,
    ["primary_state", "primary_state_label", "primary_state_reason"],
    `${label} primary_state_fields`,
  );
  assertDeepEqualJson(
    userTaskStatus.automation_state_fields,
    ["automation_state", "automation_state_label", "automation_state_reason"],
    `${label} automation_state_fields`,
  );
  assertDeepEqualJson(
    userTaskStatus.primary_state_values,
    runtimePrimaryStateValues,
    `${label} primary_state_values`,
  );
  assertDeepEqualJson(
    userTaskStatus.automation_state_values,
    runtimeAutomationStateValues,
    `${label} automation_state_values`,
  );
  assertDeepEqualJson(
    userTaskStatus.mental_model_layers,
    appOwnedRuntimeMentalModel,
    `${label} mental_model_layers`,
  );
  assertIncludesAll(
    userTaskStatus.task_fields,
    [
      "task_id",
      "title",
      "status",
      "stage",
      "progress_label",
      "next_step",
      "owner",
      "last_progress",
      "next_owner",
      ...stageRunCockpitFields,
      "artifact_or_blocker",
      "review_receipt",
      "action_receipt",
      "workflow_refs",
      "export_bundle_action_ref",
      ...resourceContextOptionalTaskRefs,
      "connector_readiness_refs",
      "diagnostic_substrate_refs",
    ],
    `${label} task_fields`,
  );
  for (const retiredField of retiredMasOwnerAcceptanceMirrorFields) {
    if (
      Object.hasOwn(userTaskStatus, retiredField)
      || userTaskStatus.task_fields.includes(retiredField)
    ) {
      throw new Error(`${label} must not mirror retired MAS owner field ${retiredField}`);
    }
  }
  for (const [field, expected] of Object.entries(countPolicies)) {
    if (userTaskStatus.count_policies?.[field] !== expected) {
      throw new Error(`${label} count_policies.${field} must be ${expected}`);
    }
  }
  if (userTaskStatus.running_state_policy !== appOwnedRunningStatePolicy) {
    throw new Error(`${label} running_state_policy must be ${appOwnedRunningStatePolicy}`);
  }
  if (userTaskStatus.queue_status_policy !== appOwnedQueueStatusPolicy) {
    throw new Error(`${label} queue_status_policy must be ${appOwnedQueueStatusPolicy}`);
  }
  if (
    userTaskStatus.stage_run_projection_ref !==
    "contracts/app-runtime-bridge.json#stage_run_cockpit_projection"
  ) {
    throw new Error(
      `${label} stage_run_projection_ref must point to the Runtime bridge StageRun cockpit projection`,
    );
  }
  assertDeepEqualJson(
    userTaskStatus.default_stage_run_panel_fields,
    stageRunCockpitProjection.preferred_panel_fields,
    `${label} default_stage_run_panel_fields`,
  );
  if (
    userTaskStatus.telemetry_missing_policy !== stageRunCockpitProjection.telemetry_missing_policy
  ) {
    throw new Error(
      `${label} telemetry_missing_policy must match Runtime bridge StageRun cockpit projection`,
    );
  }
  assertDeepEqualJson(
    userTaskStatus.agent_module_status_panel,
    appOwnedAgentModuleStatusPanel,
    `${label} agent_module_status_panel`,
  );
  assertDeepEqualJson(
    userTaskStatus.work_item_visibility,
    {
      projection_path: "work_item_projection_v2.items[].visibility",
      axis_values: workItemVisibilityStates,
      default_projection: "visible_only",
      archived_surface: "archived_tasks_library",
      archived_surface_scope: "same_agent_then_project_scope",
      saved_status_view_allowed: false,
      status_filter_may_include_visibility: false,
      archive_action_id: "work_item_visibility_set",
      restore_action_id: "work_item_visibility_set",
      archive_payload: { visibility_state: "archived" },
      restore_payload: { visibility_state: "visible" },
      expected_generation_source: "item.visibility.generation",
      expected_generation_required_when_available: true,
      concurrency_token_source: "item.visibility.generation",
      refresh_after_mutation: "opl app state --profile fast --json",
      readback_required: true,
      generation_conflict_policy: "refresh_authoritative_projection_then_prompt_retry",
      local_storage_truth_allowed: false,
      archive_changes_business_lifecycle: false,
      archive_stops_execution: false,
      archive_deletes_evidence: false,
      archived_item_preserves_status_stage_usage: true,
      restore_returns_to_main_surface: true,
      stop_requires_separate_action: true,
      confirmation_required: true,
      confirmation_must_explain_archive_does_not_stop_work: true,
    },
    `${label} work_item_visibility`,
  );
  assertDeepEqualJson(
    userTaskStatus.must_not_default_display_terms,
    [
      "Temporal",
      "provider",
      "projection",
      "ref",
      "stage attempt",
      "ledger",
      "current_control_state",
    ],
    `${label} must_not_default_display_terms`,
  );
  if (userTaskStatus.refs_only !== true) {
    throw new Error(`${label} must be refs-only`);
  }
}
