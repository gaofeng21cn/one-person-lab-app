import { assertDeepEqualJson, assertIncludesAll } from "./assertions.ts";

export function validateBeginnerFirstRunPresentation(presentation, label, expectedCoreItems) {
  if (presentation?.audience !== "beginner_non_technical_users") {
    throw new Error(`${label} must target beginner_non_technical_users`);
  }
  if (presentation.presentation_mode !== "simplified_first_run") {
    throw new Error(`${label} must use simplified_first_run presentation`);
  }
  if (presentation.primary_user_goal !== "enter_guid_now_or_complete_guided_setup_first") {
    throw new Error(`${label} must keep /guid explicitly available before readiness while preserving guided setup`);
  }
  assertIncludesAll(presentation.primary_steps, expectedCoreItems, `${label} primary steps`);
  for (const [field, expected] of Object.entries({
    advanced_progress_disclosure: "collapsed_or_secondary",
    background_maintenance_presentation: "collapsed_technical_non_blocking",
    technical_detail_policy: "hidden_until_expanded_or_error",
  })) {
    if (presentation[field] !== expected) {
      throw new Error(`${label}.${field} must be ${expected}`);
    }
  }
  const selfCheck = presentation.post_install_ai_self_check_entry;
  if (!selfCheck || typeof selfCheck !== "object") {
    throw new Error(`${label} must define post_install_ai_self_check_entry`);
  }
  for (const [field, expected] of Object.entries({
    trigger: "explicit ready entry after ready_to_launch first-run completion",
    target_route: "/guid",
    route_state: "postInstallSelfCheck",
    prompt_policy:
      "localized Codex CLI post-install diagnostic prompt using canonical Framework state and package-scoped readback",
    mutation_policy: "diagnose_first_no_file_mutation_without_user_confirmation",
    release_gate_policy: "user_visible_entry_complements_non_blocking_codex_ai_self_check_receipt",
  })) {
    if (selfCheck[field] !== expected) {
      throw new Error(`${label}.post_install_ai_self_check_entry.${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    selfCheck.target_state_checks,
    [
      "framework_fast_state_first",
      "codex_cli_and_model_access_core_state",
      "core_ready_separate_from_background_maintenance",
      "ui_language_policy",
      "user_authored_additional_instructions_optional_and_never_generated",
      "user_and_repo_agents_md_respected_no_overwrite",
      "official_profile_user_preferences_and_presence_only_package_scope",
      "installed_or_selected_package_configured_carrier_readback",
      "required_dependencies_and_routes_checked_per_package",
      "opl_flow_context_only_when_installed",
      "user_removed_or_optional_package_absence_not_global_failure",
      "post_maintenance_fresh_state_continuity",
    ],
    `${label}.post_install_ai_self_check_entry target_state_checks`,
  );
}

export function validateOplFlowContext(context, label) {
  if (!context || typeof context !== "object") {
    throw new Error(`${label} must be declared`);
  }
  for (const [field, expected] of Object.entries({
    flow_id: "opl-flow",
    source: "framework-agent-package-projection",
    presence_source_ref: "app_state.agent_packages.status_index.packages.opl-flow.presence",
    presence_rule: "inject_only_when_fresh_presence_installed_true",
    delivery: "installed_package_metadata_only",
    absence_policy: "omit_opl_flow_context",
    status_source_ref: "app_state.agent_packages.status_index.packages.opl-flow",
    user_agents_policy: "respect_user_agents_no_overwrite_detect_conflicts",
    language_policy: "follow_ui_locale_zh_only_when_ui_zh",
    app_role: "consume_generic_framework_projection_and_execute_projected_actions_only",
    flow_policy_parsing: "forbidden",
    companion_inventory_storage: "forbidden",
  })) {
    if (context[field] !== expected) {
      throw new Error(`${label}.${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    context.status_planes,
    ["package_operational", "experience_baseline", "specialized_capabilities"],
    `${label}.status_planes`,
  );
  for (const retiredField of ["ponytail_mode_routing", "optional_user_modes"]) {
    if (retiredField in context) throw new Error(`${label} must not retain ${retiredField}`);
  }
}
