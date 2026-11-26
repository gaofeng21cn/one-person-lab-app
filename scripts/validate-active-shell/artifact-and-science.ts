import { assertDeepEqualJson, assertFieldsMatch, assertIncludesAll } from "./assertions.ts";
import {
  refLevelFollowUpRequiredRefFields,
  structuredResultPanelRequiredRefFields,
  structuredResultPanelSurfaces,
  workflowSkillCandidateActions,
  workflowSkillCandidateRequiredRefFields,
} from "./settings-and-provider.ts";
import { assertNoForbiddenKeys, assertNonEmptyString, assertNonEmptyStringArray } from "./validation-primitives.ts";

const stateIndexRequiredRefFields = ["state_index_ref", "stage_folder_ref", "task_ref", "owner_ref", "updated_at"];
const stateIndexOptionalRefFields = [
  "artifact_index_refs", "receipt_index_refs", "blocker_index_refs",
  "readiness_false_flag_refs", "cache_generation_ref",
];
const stateIndexDisabledAccessFields = [
  "sqlite_direct_read_access", "sqlite_write_access", "sidecar_mutation_access",
  "domain_truth_write_access", "owner_receipt_write_access", "artifact_body_access",
  "readiness_authority", "artifact_authority", "quality_verdict_authority",
];
const nativeDrilldownRequiredRefFields = [
  "current_pointer_ref", "canonical_artifact_refs", "export_artifact_refs",
  "lineage_refs", "retention_policy_ref", "conformance_summary_ref",
];
const nativeDrilldownOptionalRefFields = [
  "content_hash_refs", "attempt_manifest_refs", "owner_receipt_refs",
  "typed_blocker_refs", "decision_receipt_refs",
];
const provenanceRefFields = [
  "provenance_bundle_refs", "provenance_index_ref", "ro_crate_metadata_ref",
  "replay_status_ref", "agent_trace_refs", "review_refs", "typed_issues",
];
const nativeDrilldownForbiddenKeys = [
  "artifact_body", "artifact_body_preview", "domain_artifact_body",
  "domain_quality_verdict", "quality_verdict", "domain_export_readiness",
  "export_readiness", "domain_readiness", "domain_ready",
  "app_release_readiness", "production_readiness",
];
const provenanceProjectionRef = "contracts/app-runtime-bridge.json#artifact_provenance_bundle_projection";
const taskDrilldownCommand = "opl runtime app-operator-drilldown --task <task_id> --json";

function assertAllFalse(obj, fields, label) {
  for (const field of fields) {
    if (obj[field] !== false) {
      throw new Error(`${label} ${field} must be false`);
    }
  }
}

export function validateStateIndexSidecarProjectionContract(projection, label) {
  if (!projection || typeof projection !== "object") {
    throw new Error(`${label} must be declared`);
  }
  assertFieldsMatch(projection, {
    source: "app_state.operator.workbench.task_drilldowns.state_index_sidecar_projection",
    detail_source: taskDrilldownCommand,
    authority: "opl_framework_state_index_kernel_sqlite_sidecar_projection",
    kernel_owner: "one-person-lab",
    storage_kind: "sqlite_sidecar_read_model_cache",
    app_access_mode: "read_only_projection_consumer",
    settings_owner_surface: "/settings/environment?section=diagnostics",
    consumer_surface: "/settings/environment?section=diagnostics",
    runtime_page_visible: false,
    drilldown_target_policy: "refs_drill_down_to_stage_folder_not_domain_body",
    app_role: "display_only_state_index_read_model_consumer",
  }, label);
  assertDeepEqualJson(projection.allowed_input_surfaces, ["opl app state --profile fast --json", "opl app state --profile full --json", taskDrilldownCommand], `${label} allowed_input_surfaces`);
  assertDeepEqualJson(projection.required_ref_fields, stateIndexRequiredRefFields, `${label} required_ref_fields`);
  assertDeepEqualJson(projection.optional_ref_fields, stateIndexOptionalRefFields, `${label} optional_ref_fields`);
  assertAllFalse(projection, stateIndexDisabledAccessFields, label);
  assertIncludesAll(
    projection.forbidden_claims,
    ["sqlite_truth_owner", "sqlite_sidecar_writer", "state_index_kernel_owner", "domain_truth", "owner_receipt_authority", "artifact_body", "artifact_authority", "domain_readiness", "quality_verdict", "export_readiness", "app_release_readiness", "family_production_readiness"],
    `${label} forbidden_claims`,
  );
}

export function validateStateIndexSidecarFixture(projection, label) {
  if (!projection || typeof projection !== "object") {
    throw new Error(`${label} must be declared`);
  }
  if (projection.surface_kind !== "opl_state_index_kernel_sidecar_read_model") {
    throw new Error(`${label} surface_kind must be opl_state_index_kernel_sidecar_read_model`);
  }
  for (const field of [...stateIndexRequiredRefFields, ...stateIndexOptionalRefFields]) {
    if (!Object.hasOwn(projection, field)) {
      throw new Error(`${label} must include ${field}`);
    }
  }
  assertAllFalse(projection, stateIndexDisabledAccessFields, label);
  assertNoForbiddenKeys(
    projection,
    ["sqlite_path", "sqlite_connection_string", "sqlite_write_query", "state_index_kernel_mutation", "domain_truth", "owner_receipt_body", ...nativeDrilldownForbiddenKeys],
    label,
  );
}

export function validateArtifactNativeDrilldownProjectionContract(projection, label, options = {}) {
  if (!projection || typeof projection !== "object") {
    throw new Error(`${label} must be declared`);
  }
  assertFieldsMatch(projection, {
    source: "app_state.operator.workbench.task_drilldowns.artifact_native_drilldown",
    detail_source: taskDrilldownCommand,
    authority: "opl_framework_stage_artifact_kernel_refs_projection",
    framework_contract_ref: "one-person-lab/contracts/opl-framework/stage-artifact-runtime-contract.json",
    surface_kind: "opl_stage_artifact_runtime_workbench",
    consumer_surface: "right_context_inspector",
    technical_details_owner_surface: "/settings/environment?section=diagnostics",
    runtime_page_visible: false,
    full_detail_policy: "on_demand_task_drilldown_only",
    app_role: "display_only_stage_artifact_kernel_refs_consumer",
    artifact_body_access: false,
    domain_verdict_authority: false,
  }, label);
  assertDeepEqualJson(projection.required_ref_fields, nativeDrilldownRequiredRefFields, `${label} required_ref_fields`);
  const optionalRefFields = options.requireProvenanceBundle ? [...nativeDrilldownOptionalRefFields, ...provenanceRefFields] : nativeDrilldownOptionalRefFields;
  assertDeepEqualJson(projection.optional_ref_fields, optionalRefFields, `${label} optional_ref_fields`);
  if (options.requireProvenanceBundle && projection.provenance_projection_ref !== provenanceProjectionRef) {
    throw new Error(`${label} provenance_projection_ref must point at artifact provenance bundle projection`);
  }
  for (const optionalFalse of ["quality_verdict_authority", "readiness_authority"]) {
    if (projection[optionalFalse] !== undefined && projection[optionalFalse] !== false) {
      throw new Error(`${label} ${optionalFalse} must be false`);
    }
  }
  assertIncludesAll(
    projection.forbidden_claims,
    ["artifact_body", "domain_artifact_body", "domain_artifact_authority", "domain_quality_verdict", "domain_export_readiness", "domain_readiness", "app_release_readiness", "family_production_readiness"],
    `${label} forbidden_claims`,
  );
  if (options.requireProvenanceBundle) {
    assertIncludesAll(projection.forbidden_claims, ["quality_verdict", "readiness_authority"], `${label} provenance forbidden_claims`);
  }
}

export function validateArtifactNativeDrilldownFixture(projection, label) {
  if (!projection || typeof projection !== "object") {
    throw new Error(`${label} must be declared`);
  }
  if (projection.surface_kind !== "opl_stage_artifact_runtime_workbench") {
    throw new Error(`${label} surface_kind must be opl_stage_artifact_runtime_workbench`);
  }
  for (const field of [...nativeDrilldownRequiredRefFields, ...nativeDrilldownOptionalRefFields, ...provenanceRefFields]) {
    if (!Object.hasOwn(projection, field)) throw new Error(`${label} must include ${field}`);
  }
  assertFieldsMatch(projection, {
    provenance_projection_kind: "artifact_provenance_bundle_projection",
    provenance_projection_ref: provenanceProjectionRef,
    artifact_body_access: false,
    domain_verdict_authority: false,
    quality_verdict_authority: false,
    readiness_authority: false,
  }, label);
  for (const field of ["provenance_bundle_refs", "agent_trace_refs", "review_refs", "typed_issues"]) {
    if (!Array.isArray(projection[field]) || projection[field].length === 0) {
      throw new Error(`${label} ${field} must include at least one refs-only example`);
    }
  }
  for (const field of ["provenance_index_ref", "ro_crate_metadata_ref", "replay_status_ref"]) {
    assertNonEmptyString(projection[field], `${label} ${field}`);
  }
  if (
    projection.provenance_drawer?.projection_ref !== provenanceProjectionRef ||
    projection.provenance_drawer?.open_action?.required_mode !== "read_only" ||
    projection.provenance_drawer?.shell_implementation_status !== "opl_studio_refs_only_drawer_implemented"
  ) {
    throw new Error(`${label} provenance_drawer must stay read_only and reference artifact provenance bundle projection`);
  }
  assertNoForbiddenKeys(projection, nativeDrilldownForbiddenKeys, label);
}

export function validateArtifactProvenanceBundleProjectionContract(projection, label) {
  if (!projection || typeof projection !== "object") {
    throw new Error(`${label} must be declared`);
  }
  assertFieldsMatch(projection, {
    source: "app_state.operator.workbench.task_drilldowns.artifact_native_drilldown.provenance_bundle_refs",
    detail_source: taskDrilldownCommand,
    authority: "opl_ledger_artifact_provenance_bundle_refs_projection",
    projection_kind: "artifact_provenance_bundle_projection",
    surface_kind: "artifact_provenance_bundle_projection",
    drawer_surface: "right_context_inspector.artifacts.provenance_drawer",
    card_surface: "right_context_inspector.artifacts.provenance_card",
    app_role: "display_only_artifact_provenance_bundle_refs_consumer",
    shell_implementation_status: "opl_studio_refs_only_drawer_implemented",
    refs_only: true,
    artifact_body_access: false,
    memory_body_access: false,
    domain_truth_write_access: false,
    owner_receipt_write_access: false,
    domain_verdict_authority: false,
    quality_verdict_authority: false,
    readiness_authority: false,
  }, label);
  assertDeepEqualJson(projection.input_sources, ["opl app state --profile fast --json", taskDrilldownCommand, "OPL Ledger artifact provenance bundle record"], `${label} input_sources`);
  assertDeepEqualJson(projection.required_ref_fields, provenanceRefFields, `${label} required_ref_fields`);
  assertIncludesAll(
    projection.optional_ref_fields,
    ["ledger_record_refs", "code_refs", "input_refs", "output_refs", "environment_refs", "content_hash_refs", "visual_review_refs", "turn_summary_refs", "redacted_transcript_export_refs"],
    `${label} optional_ref_fields`,
  );
  assertIncludesAll(
    projection.forbidden_claims,
    ["artifact_body", "domain_artifact_body", "domain_artifact_authority", "domain_quality_verdict", "quality_verdict", "domain_export_readiness", "domain_readiness", "owner_receipt_authority", "app_release_readiness", "family_production_readiness"],
    `${label} forbidden_claims`,
  );
}

export function validateOpenScienceAcceptedItemsFixture(task, label) {
  if (!task || typeof task !== "object") {
    throw new Error(`${label} task must be declared`);
  }
  const panel = task.structured_result_panel;
  if (
    panel?.surface_kind !== "structured_result_panel" ||
    panel.projection_ref !== "contracts/app-runtime-bridge.json#structured_result_panel_projection" ||
    panel.new_dashboard_allowed !== false ||
    panel.content_policy !== "refs_only_no_artifact_body_no_domain_verdict"
  ) {
    throw new Error(`${label} structured_result_panel must stay inside existing refs-only task surfaces`);
  }
  assertDeepEqualJson(panel.display_surfaces, structuredResultPanelSurfaces, `${label} structured_result_panel display_surfaces`);
  for (const field of structuredResultPanelRequiredRefFields) {
    if (!Object.hasOwn(panel, field)) throw new Error(`${label} structured_result_panel must include ${field}`);
  }
  const provenanceCard = task.artifact_provenance_card;
  if (
    provenanceCard?.surface_kind !== "artifact_provenance_card" ||
    provenanceCard.projection_ref !== provenanceProjectionRef ||
    provenanceCard.artifact_body_access !== false ||
    provenanceCard.readiness_authority !== false ||
    provenanceCard.quality_verdict_authority !== false
  ) {
    throw new Error(`${label} artifact_provenance_card must be refs-only and non-authoritative`);
  }
  const followUps = task.ref_level_follow_up_refs;
  if (!Array.isArray(followUps) || followUps.length === 0) {
    throw new Error(`${label} must include ref_level_follow_up_refs`);
  }
  assertIncludesAll(Object.keys(followUps[0]), refLevelFollowUpRequiredRefFields, `${label} ref_level_follow_up_refs[0] fields`);
  if (followUps[0].app_annotation_store_write !== false || followUps[0].owner_receipt_write_access !== false || followUps[0].content_policy !== "refs_only_no_comment_body_no_app_annotation_store") {
    throw new Error(`${label} ref_level_follow_up_refs must not create an App annotation store`);
  }
  const candidates = task.workflow_skill_candidate_refs;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error(`${label} must include workflow_skill_candidate_refs`);
  }
  assertIncludesAll(Object.keys(candidates[0]), workflowSkillCandidateRequiredRefFields, `${label} workflow_skill_candidate_refs[0] fields`);
  assertDeepEqualJson(candidates[0].available_actions, workflowSkillCandidateActions, `${label} candidate actions`);
  if (candidates[0].display_surface !== "settings_capabilities" || candidates[0].report_first !== true || candidates[0].auto_enable !== false || candidates[0].skill_body_write_access !== false || candidates[0].workflow_body_access !== false) {
    throw new Error(`${label} workflow_skill_candidate_refs must stay report-first and no-auto-enable`);
  }
  assertNoForbiddenKeys(task, ["artifact_body", "domain_artifact_body", "review_body", "skill_body", "workflow_body", "app_annotation_store"], label);
}

export function validateOpenScienceConsoleProjectionContract(projection, label) {
  if (!projection || typeof projection !== "object") {
    throw new Error(`${label} must be declared`);
  }
  assertFieldsMatch(projection, {
    source: "app_state.operator.workbench.task_drilldowns.openscience_console_projection",
    detail_source: taskDrilldownCommand,
    authority: "opl_framework_refs_only_console_projection",
    projection_kind: "openscience_console_watch_projection",
    surface_kind: "opl_console_watch_only_drilldown_projection",
    full_detail_policy: "on_demand_task_drilldown_only",
    app_role: "display_only_openscience_console_projection_consumer",
    refs_only: true,
    watch_only: true,
    artifact_body_access: false,
    memory_body_access: false,
    domain_truth_write_access: false,
    owner_receipt_write_access: false,
    storage_truth_authority: false,
    compute_policy_authority: false,
    source_readiness_authority: false,
    publication_verdict_authority: false,
    release_readiness_authority: false,
  }, label);
  const sourceModes = assertNonEmptyStringArray(projection.mode_label_policy?.adapted_source_modes, `${label} mode_label_policy.adapted_source_modes`);
  const displayTerms = assertNonEmptyStringArray(projection.mode_label_policy?.app_display_terms, `${label} mode_label_policy.app_display_terms`);
  if (sourceModes.length !== displayTerms.length || new Set(sourceModes).size !== sourceModes.length || new Set(displayTerms).size !== displayTerms.length) {
    throw new Error(`${label} mode labels must map source modes to unique display terms`);
  }
  assertFieldsMatch(projection.mode_label_policy, {
    mode_labels_are_navigation_only: true,
    medical_evidence_authority_owner: "domain_agent",
    can_authorize_medical_advice: false,
    can_authorize_medical_evidence_verdict: false,
    can_override_domain_mode: false,
  }, `${label} mode_label_policy`, ".");
  assertDeepEqualJson(projection.required_projection_cards, ["artifact_graph", "claim_warning", "project_local_ledger_pointer", "native_viewer_preview"], `${label} required_projection_cards`);
  assertDeepEqualJson(projection.required_ref_fields, ["artifact_graph_refs", "claim_warning_refs", "project_local_ledger_ref", "native_viewer_preview_ref"], `${label} required_ref_fields`);
  assertIncludesAll(
    projection.optional_ref_fields,
    ["artifact_node_refs", "artifact_edge_refs", "claim_source_refs", "claim_severity_refs", "ledger_record_refs", "viewer_renderer_ref", "preview_thumbnail_ref", "open_in_native_viewer_action_ref"],
    `${label} optional_ref_fields`,
  );
  assertIncludesAll(
    projection.forbidden_claims,
    ["release_readiness", "source_readiness", "publication_verdict", "owner_receipt_authority", "storage_truth", "compute_policy", "artifact_body", "domain_truth", "domain_quality_verdict", "app_release_readiness", "family_production_readiness"],
    `${label} forbidden_claims`,
  );
}