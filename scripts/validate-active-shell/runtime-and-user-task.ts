import { assertDeepEqualJson, assertFieldsMatch, assertIncludesAll } from "./assertions.ts";
import {
  appOwnedGenericOwnerAcceptanceCurrentnessRefPolicy,
  appOwnedProjectGroupExpansionPolicy,
  appOwnedQueueStatusPolicy,
  appOwnedRunningStatePolicy,
  runtimeAutomationStateValues,
  runtimePrimaryStateValues,
  retiredMasOwnerAcceptanceMirrorFields,
  workItemVisibilityStates,
} from "./app-contract-constants.ts";

import {
  assertNoForbiddenKeys,
  assertNonEmptyString,
  assertNonEmptyStringArray,
  resourceContextOptionalTaskRefs,
} from "./validation-primitives.ts";

const stageRunCockpitFields = ["stage_run_cockpit", "stage_run_cockpit_summary", "stage_run_current_owner_delta"];
const stageRunCockpitRequiredRefs = ["task_id", "stage_id", "owner", "next_visible_step", "accepted_return_shapes", "readiness_false_flag_refs"];
const stageRunCockpitSummaryFields = ["current_owner", "required_delta", "next_safe_action_ref", "artifact_or_blocker_refs"];
const stageRunForbiddenKeys = [
  "runtime_truth", "domain_truth", "owner_receipt_body", "owner_receipt_authority",
  "typed_blocker_body", "typed_blocker_authority", "artifact_body", "artifact_authority",
  "domain_ready", "domain_readiness", "app_release_readiness", "production_ready", "production_readiness",
];

export function validateStageRunCockpitProjectionContract(projection, label) {
  if (!projection || typeof projection !== "object") {
    throw new Error(`${label} must be declared`);
  }
  assertFieldsMatch(projection, {
    source: "app_state.operator.workbench.task_drilldowns.stage_run_cockpit + app_state.operator.workbench.task_drilldowns.stage_run_cockpit_summary",
    equivalent_source: "app_state.operator.workbench.task_drilldowns.stage_run_current_owner_delta",
    derived_from: "current_owner_delta",
    authority: "opl_framework_current_owner_delta_refs_projection",
    display_policy: "refs_only_stage_run_cockpit_display_guard_no_runtime_truth_claims",
    app_role: "display_only_stage_run_cockpit_consumer",
    refs_only: true,
  }, label);
  assertDeepEqualJson(projection.accepted_fast_state_fields, stageRunCockpitFields, `${label} accepted_fast_state_fields`);
  assertIncludesAll(projection.required_ref_fields, stageRunCockpitRequiredRefs, `${label} required_ref_fields`);
  assertIncludesAll(projection.summary_fields, stageRunCockpitSummaryFields, `${label} summary_fields`);
  assertNonEmptyStringArray(projection.preferred_panel_fields, `${label} preferred_panel_fields`);
  assertNonEmptyString(projection.telemetry_missing_policy, `${label} telemetry_missing_policy`);
  assertIncludesAll(
    projection.forbidden_claims,
    ["runtime_truth", "domain_truth", "owner_receipt_authority", "typed_blocker_authority", "artifact_authority", "domain_readiness", "app_release_readiness", "family_production_readiness"],
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
    if (!Object.hasOwn(cockpit, field)) throw new Error(`${label} cockpit must include ${field}`);
  }
  for (const field of stageRunCockpitSummaryFields) {
    if (!Object.hasOwn(task.stage_run_cockpit_summary, field)) throw new Error(`${label} summary must include ${field}`);
  }
  if (cockpit.refs_only !== true) throw new Error(`${label} cockpit refs_only must be true`);
  assertNoForbiddenKeys(cockpit, stageRunForbiddenKeys, label);
  assertNoForbiddenKeys(task.stage_run_cockpit_summary, stageRunForbiddenKeys, label);
}

export function validateProjectProgressDisplayContract(projectProgress, label) {
  if (!projectProgress || typeof projectProgress !== "object") {
    throw new Error(`${label} must be declared`);
  }
  assertFieldsMatch(projectProgress, {
    source: "app_state.operator.workbench.task_drilldowns",
    authority: "opl_framework_shared_project_progress_projection",
    display_policy: "project_progress_refs_secondary_no_module_runtime_dirty_as_project",
    consumer_surface: "/settings/environment?section=diagnostics",
    runtime_page_visible: false,
    diagnostics_treatment: "maintenance_diagnostics_only",
    safe_actions_treatment: "maintenance_diagnostics_only",
  }, label);
  assertIncludesAll(
    projectProgress.required_fields,
    ["task_id", "title", "domain_id", "state", "active_stage_id", "progress_delta_classification", "deliverable_progress_delta", "platform_repair_delta", "blocker_ref_count", "next_visible_step", "next_owner"],
    `${label} required_fields`,
  );
  assertIncludesAll(
    projectProgress.forbidden_running_task_sources,
    ["module_runtime dirty state", "domain lane active_task_count", "assistant purpose cards", "module readiness diagnostics"],
    `${label} forbidden_running_task_sources`,
  );
  const line = projectProgress.active_project_line_projection;
  assertFieldsMatch(line, {
    source: "app_state.operator.workbench.activity_center.active_projects + app_state.operator.visual_ref_groups.active_project_refs",
    authority: "opl_framework_refs_only_project_line_projection",
    status_preservation_required: true,
  }, `${label} active project line projection`);
  assertIncludesAll(line?.primary_grouping_policy?.default_order, runtimePrimaryStateValues, `${label} primary_grouping_policy`);
  assertDeepEqualJson(line?.project_group_expansion_policy, appOwnedProjectGroupExpansionPolicy, `${label} project_group_expansion_policy`);
  assertIncludesAll(line?.required_fields, ["task_id", "title", "state", "status", "study_id", "active_run_id", "next_visible_step"], `${label} required_fields`);
  assertIncludesAll(line?.must_not_claim, ["active_worker_run", "provider_execution_running", "domain_ready", "paper_quality_ready"], `${label} must_not_claim`);
}

export function validateUserTaskStatusProjectionContract(userTaskStatus, label, stageRunCockpitProjection) {
  if (!userTaskStatus || typeof userTaskStatus !== "object") {
    throw new Error(`${label} must be declared`);
  }
  if (!stageRunCockpitProjection || typeof stageRunCockpitProjection !== "object") {
    throw new Error(`${label} must receive Runtime bridge StageRun cockpit projection expectations`);
  }
  if (userTaskStatus === stageRunCockpitProjection) {
    throw new Error(`${label} must compare against the Runtime bridge StageRun cockpit projection, not itself`);
  }
  assertFieldsMatch(userTaskStatus, {
    source: "app_state.operator.workbench.summary_cards + app_state.operator.workbench.activity_center + app_state.operator.workbench.task_drilldowns + app_state.operator.visual_ref_groups.active_project_refs",
    authority: "opl_framework_refs_only_user_task_projection",
    running_state_policy: appOwnedRunningStatePolicy,
    queue_status_policy: appOwnedQueueStatusPolicy,
    stage_run_projection_ref: "contracts/app-runtime-bridge.json#stage_run_cockpit_projection",
    telemetry_missing_policy: stageRunCockpitProjection.telemetry_missing_policy,
    refs_only: true,
  }, label);
  assertNonEmptyString(userTaskStatus.default_user_question, `${label} default_user_question`);
  assertDeepEqualJson(userTaskStatus.generic_owner_acceptance_currentness_ref_policy, appOwnedGenericOwnerAcceptanceCurrentnessRefPolicy, `${label} generic_owner_acceptance_currentness_ref_policy`);
  assertNonEmptyStringArray(userTaskStatus.scope_fields, `${label} scope_fields`);
  assertDeepEqualJson(userTaskStatus.primary_state_values, runtimePrimaryStateValues, `${label} primary_state_values`);
  assertDeepEqualJson(userTaskStatus.automation_state_values, runtimeAutomationStateValues, `${label} automation_state_values`);
  assertIncludesAll(
    userTaskStatus.task_fields,
    [
      "task_id", "title", "status", "stage", "progress_label", "next_step", "owner",
      "last_progress", "next_owner", ...stageRunCockpitFields, "artifact_or_blocker",
      "review_receipt", "action_receipt", "workflow_refs", "export_bundle_action_ref",
      ...resourceContextOptionalTaskRefs, "connector_readiness_refs", "diagnostic_substrate_refs",
    ],
    `${label} task_fields`,
  );
  for (const retiredField of retiredMasOwnerAcceptanceMirrorFields) {
    if (Object.hasOwn(userTaskStatus, retiredField) || userTaskStatus.task_fields.includes(retiredField)) {
      throw new Error(`${label} must not mirror retired MAS owner field ${retiredField}`);
    }
  }
  assertDeepEqualJson(userTaskStatus.default_stage_run_panel_fields, stageRunCockpitProjection.preferred_panel_fields, `${label} default_stage_run_panel_fields`);
  if (!userTaskStatus.agent_module_status_panel || typeof userTaskStatus.agent_module_status_panel !== "object") {
    throw new Error(`${label} agent_module_status_panel must be declared`);
  }
  assertDeepEqualJson(userTaskStatus.work_item_visibility?.axis_values, workItemVisibilityStates, `${label} work_item_visibility axis_values`);
  assertFieldsMatch(userTaskStatus.work_item_visibility, {
    projection_path: "work_item_projection_v2.items[].visibility",
    default_projection: "visible_only",
    archived_surface: "archived_tasks_library",
    saved_status_view_allowed: false,
    archive_action_id: "work_item_visibility_set",
    restore_action_id: "work_item_visibility_set",
    expected_generation_source: "item.visibility.generation",
    concurrency_token_source: "item.visibility.generation",
    local_storage_truth_allowed: false,
    archive_changes_business_lifecycle: false,
    archive_stops_execution: false,
    archive_deletes_evidence: false,
    stop_requires_separate_action: true,
    confirmation_required: true,
  }, `${label} work_item_visibility`);
}