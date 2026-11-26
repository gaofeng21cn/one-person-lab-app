import { assertDeepEqualJson, assertIncludesAll } from './assertions.ts';
import {
  appOwnedCurrentTaskSlice,
  appOwnedDirectoryGroupPolicy,
  appOwnedActiveStudioPrimaryNavigation,
  appOwnedArtifactPreview,
  appOwnedOplStandardAgentMembershipPolicy,
  appOwnedReviewSurfaceSourceEvidence,
  appOwnedRightContextInspectorForbiddenOwners,
  appOwnedRightContextInspectorPolicy,
} from './app-contract-constants.ts';
import { validateGuiProductAuthority } from './gui-product-authority-validator.ts';
import { productProfile } from './gui-product-contract/context.ts';
import { assertNonEmptyStringArray } from './validation-primitives.ts';

const dynamicPackageShortcutIconPolicy = {
  role: 'owner_projected_package_presentation',
  source_ref: 'app_state.agent_packages.directory.entries[].home_shortcuts[].icon_id',
  token_policy: 'owner_declared_opaque_token_consumed_by_shell_dsh_resolver',
  inference_allowed: false,
  consumer: 'active_shell_opl_visual_provider',
  missing_or_invalid_policy: 'dsh_agent_fallback',
};

function validateGuiProductIdentity(guiContract) {
  if (guiContract.schema_version !== 2) {
    throw new Error('App GUI product contract schema_version must be 2');
  }
  if (guiContract.owner !== 'one-person-lab-app') {
    throw new Error(`Unexpected App GUI product contract owner: ${guiContract.owner}`);
  }
  if (guiContract.purpose !== 'app_owned_gui_product_contract') {
    throw new Error(`Unexpected App GUI product contract purpose: ${guiContract.purpose}`);
  }
  if (guiContract.state !== 'active') {
    throw new Error(`Unexpected App GUI product contract state: ${guiContract.state}`);
  }
  if (guiContract.product_authority?.source_of_truth !== 'one-person-lab-app') {
    throw new Error('App GUI product contract source of truth must be one-person-lab-app');
  }
  if (guiContract.product_authority.active_shell_role !== 'implementation_carrier') {
    throw new Error('App GUI product contract must treat the active shell as implementation carrier');
  }
  if (guiContract.product_authority.upstream_gui_role !== 'implementation_material_only') {
    throw new Error('App GUI product contract must keep upstream GUI behavior as implementation material only');
  }
  if (guiContract.product_authority.upstream_behavior_acceptance_policy !== 'must_match_app_owned_gui_product_contract_before_release') {
    throw new Error('App GUI product contract must gate upstream behavior against App-owned GUI requirements');
  }
  validateGuiProductAuthority(guiContract.product_authority);
}

function validateExecutorPolicy(guiContract) {
  if (guiContract.executor_policy?.default_executor !== 'codex_cli') {
    throw new Error('App GUI default executor must be Codex CLI');
  }
  if (guiContract.executor_policy.codex_only_default !== true) {
    throw new Error('App GUI default executor policy must be Codex-only');
  }
  if (guiContract.executor_policy.executor_tab_visible_when_single_executor !== false) {
    throw new Error('App GUI must hide executor tab when Codex CLI is the only executor');
  }
}

function validateHomeLayout(guiContract) {
  const layout = guiContract.home_layout;
  if (
    layout?.default_mode !== 'composer_first_chat_canvas' ||
    layout?.default_active_shortcut !== null ||
    layout?.shortcut_selection_policy !==
      'explicit_user_or_navigation_selection_only_no_saved_preset_restore_and_never_disabled_by_launch_readiness' ||
    layout?.composer_primary !== true ||
    layout?.composer_position !== 'floating_bottom_with_safe_inset' ||
    layout?.workspace_selector_visible !== true ||
    layout?.workspace_selector_entry !== 'home.new_session_context_bar' ||
    layout?.unselected_workspace_control_visible !== true ||
    layout?.projectless_conversation_supported !== true ||
    layout?.text_chat_without_workspace !== 'available' ||
    layout?.right_context_inspector_default_state !== 'collapsed'
  ) {
    throw new Error('App GUI home layout must keep the composer primary and allow ordinary chat before workspace selection');
  }
  if (
    layout?.starter_limit !== null ||
    layout?.starter_truncation_allowed !== false ||
    layout?.selected_starter_accessibility_state !== 'aria_pressed_reflects_active_shortcut' ||
    layout?.shortcut_membership_source_ref !== 'app_state.agent_packages.directory.entries' ||
    layout?.shortcut_preference_source_ref !== 'app_state.agent_packages.status_index.home_shortcut_preferences[]' ||
    layout?.home_shortcut_visibility_source_ref !==
      'app_state.agent_packages.directory.entries + app_state.agent_packages.status_index.home_shortcut_preferences[visible=true]' ||
    layout?.unknown_standard_agent_policy !==
      'render_unknown_package_ids_only_when_they_match_opl_standard_agent_membership_without_app_allowlist'
  ) {
    throw new Error('App GUI home layout must expose all selectable owner-projected shortcuts');
  }
  assertDeepEqualJson(
    layout.opl_standard_agent_membership_policy,
    appOwnedOplStandardAgentMembershipPolicy,
    'App GUI Home Agent membership',
  );
  assertDeepEqualJson(
    layout.workspace_selector_policy,
    {
      primary_scope: "active_workspace_only",
      inactive_recent_directories_visible: false,
      management_entry: "registered_directories_modal",
      management_scope: "registered_workspaces",
      selection_effect: "set_new_session_initial_cwd_only",
      unregister_effect: "remove_registration_only",
      filesystem_delete_allowed: false,
      active_conversation_change_on_unregister: false,
      session_ownership_effect: "none",
      cascade_session_delete_allowed: false,
    },
    'App GUI Home workspace selector session ownership policy',
  );
  assertDeepEqualJson(
    layout.home_shortcut_mutation_policy,
    {
      pending_scope: "single_shortcut",
      pending_key: "shortcut_id",
      other_shortcuts_remain_interactive: true,
      readback_mode: "background_no_page_loading",
    },
    'App GUI Home independent shortcut mutation and readback',
  );
  assertDeepEqualJson(
    layout.active_studio_primary_navigation,
    appOwnedActiveStudioPrimaryNavigation,
    'App GUI Home active Studio primary navigation',
  );
  const visualStructure = guiContract.interaction_baseline?.home?.visual_structure;
  for (const field of [
    'desktop_composer_max_width_px',
    'desktop_composer_min_height_px',
    'desktop_composer_corner_radius_px',
    'desktop_context_bar_height_px',
    'desktop_context_bar_overlap_px',
    'desktop_context_bar_horizontal_inset_px',
  ]) {
    if (!Number.isInteger(layout[field]) || layout[field] < 1 || visualStructure?.[field] !== layout[field]) {
      throw new Error(`App GUI home layout ${field} must agree with the visual baseline`);
    }
  }
  assertNonEmptyStringArray(layout.must_not_show, 'App GUI home layout exclusions');
  if (layout.runtime_notice_policy_ref !== 'ui_experience_contract.home.runtime_notice') {
    throw new Error('App GUI Home Runtime notice must use the exception-only UI experience contract');
  }
}

function validateUtilityIconPolicy(guiContract) {
  const icons = guiContract.utility_icon_policy;
  const feedback = icons?.global_feedback_action;
  const startup = feedback?.startup_failure_action;
  if (
    icons?.library !== 'pinned_deepseek_harness_icon_cohort_via_opl_icon_adapter' ||
    icons?.upstream_fork_body_bulk_icon_rewrite !== 'forbidden' ||
    icons?.refresh_actions !== 'icon_only_with_tooltip_and_accessible_name' ||
    feedback?.placement !== 'titlebar_trailing_utility' ||
    feedback?.target_url !== 'https://github.com/gaofeng21cn/one-person-lab-app/issues/new' ||
    feedback?.open_mode !== 'external_browser_user_review_and_submit' ||
    feedback?.shell_local_delivery_forbidden !== true ||
    startup?.placement !== 'blocking_startup_failure_dialog' ||
    startup?.delivery_channel !== 'electron_main_process_native_open_external_via_preload_ipc' ||
    startup?.backend_dependency !== 'none' ||
    startup?.submission_policy !== feedback.open_mode ||
    startup?.automatic_submission !== false ||
    startup?.automatic_attachment_policy !== 'forbidden_no_logs_paths_credentials_or_user_content'
  ) {
    throw new Error('App GUI utility icon policy must bind the global feedback action to OPL App GitHub issues');
  }
  assertDeepEqualJson(
    feedback.prefill_fields,
    ['localized_title', 'localized_body', 'current_route', 'app_release_version'],
    'App GUI utility icon policy feedback fields',
  );
  assertDeepEqualJson(
    startup.prefill_fields,
    [
      'localized_title',
      'localized_body',
      'app_release_version',
      'platform',
      'architecture',
      'startup_failure_reason',
      'backend_boundary_code',
      'backend_boundary_stage',
    ],
    'App GUI utility icon policy startup feedback fields',
  );
}

function validateOrdinaryConversation(guiContract) {
  const {
    current_task_slice: taskSlice,
    artifact_preview: artifactPreview,
    ...ordinaryConversation
  } = guiContract.ordinary_conversation ?? {};
  const profileConversation = productProfile.gui.ordinary_conversation;
  const conversationScope = guiContract.interaction_baseline?.conversation_scope;
  assertDeepEqualJson(
    conversationScope?.session_workspace_model,
    ordinaryConversation.session_workspace_model,
    'App GUI interaction session workspace model',
  );
  assertDeepEqualJson(
    conversationScope?.explicit_session_input_policy,
    ordinaryConversation.explicit_session_input_policy,
    'App GUI interaction explicit session input policy',
  );
  assertDeepEqualJson(ordinaryConversation, profileConversation, 'App GUI ordinary conversation contract');
  assertDeepEqualJson(
    artifactPreview,
    appOwnedArtifactPreview,
    'App GUI ordinary conversation contract artifact preview',
  );
  const { fields, ...taskPolicy } = taskSlice ?? {};
  const { fields: expectedFields, ...expectedTaskPolicy } = appOwnedCurrentTaskSlice;
  assertDeepEqualJson(taskPolicy, expectedTaskPolicy, 'App GUI ordinary conversation current task slice shell policy');
  assertIncludesAll(fields, expectedFields, 'App GUI ordinary conversation current task slice fields');
  assertIncludesAll(guiContract.pages?.ordinary_conversation?.must_show, [
    'desktop unified plus menu, permission and access, model and reasoning, and send or stop controls in the composer',
    'mobile plus sheet reusing the unified context menu with access, model and reasoning, and active capability actions',
    'composer-width searchable grouped plus palette for files, folders, real owner-or-carrier projected capabilities, adapter-reported nonduplicate modes, and available App connections without workspace selection',
    'explicit attachments, file or directory selection, paste, drop, and /open consumed by the current session send only',
    'failed conversation creation, initial send, or in-conversation send restores prompt and attachments without overwriting post-submit input',
    'workspace readiness gates project selection and OPL workspace controls only, never plain local conversation or send-scoped local file inputs',
    'read-only Conversation Environment showing the recorded workspace and live Git context when available',
    'single current task instance in the message timeline, inline and unpinned for ordinary tasks',
    'current task becomes sticky only after user pin or a true long_running signal',
    'read-only Codex subagent activity grouped as Active and Done with detail, result, and open canonical task',
    'complete paginated redacted transcript export with Markdown default, strict JSON, explicit directory and filename',
    'Preview accepts only explicit session attachments, visible conversation results, or user-selected legal absolute local paths',
  ], 'App GUI ordinary conversation visible 41301 signals');
  assertIncludesAll(guiContract.pages?.ordinary_conversation?.must_not_show, [
    'persistent project, workspace, locality, branch, attachment, or workspace-context-ref context strip',
    'workspace-scoped project context inputs or an Add context action in the directory rail',
    'workspaceRootReady or workspace membership used as a file-access gate',
    'backend, provider, Team, raw MCP, or arbitrary skills in the mobile plus sheet',
    'bound-session arbitrary project or working-directory reassignment controls',
    'Local or Worktree launch modes, starting branch, managed worktree, handoff, snapshot, restore, cleanup, or deletion controls',
    'cross-host task handoff controls',
    'duplicate current task or Runtime summary outside the message timeline',
    'AionUI Team, second App Server client, background polling, Team store, subagent scheduler, Shell execution authority, or direct subagent control buttons',
    'workspace bundle export authorization',
    'standalone projectless or no working directory placeholder row',
  ], 'App GUI ordinary conversation forbidden 41301 signals');
}

function validateSessionDirectoryPolicy(guiContract) {
  const policy = guiContract.interaction_baseline?.navigation_rail?.thread_directory_policy;
  if (
    policy?.canonical_authority !== 'codex_app_server_thread_list_read_resume' ||
    policy.codex_session_directory_authority !== 'canonical_app_server_thread_overview_when_available' ||
    policy.canonical_overview_unavailable_policy !==
      'fallback_to_shell_cache_without_reclassifying_cache_as_authority' ||
    policy.stale_codex_acp_cache_row_policy !==
      'exclude_from_ordinary_projection_when_absent_from_available_canonical_overview' ||
    policy.non_codex_local_row_policy !== 'preserve' ||
    policy.shell_local_storage_role !== 'drafts_preferences_and_rebuildable_cache_only' ||
    policy.shell_thread_history_authority !== false ||
    policy.workspace_directory_role !==
      'new_session_initial_cwd_projectless_adoption_grouping_and_visible_metadata_only' ||
    policy.row_identity !== 'canonical_thread_id' ||
    policy.duplicate_row_per_canonical_thread_allowed !== false ||
    policy.title_based_deduplication_allowed !== false
  ) {
    throw new Error('App GUI thread directory must prefer canonical App Server sessions and use Shell rows as cache only');
  }
  assertDeepEqualJson(
    policy.directory_group_policy,
    appOwnedDirectoryGroupPolicy,
    'App GUI directory group ownership policy',
  );
  if ('local_worktree_lifecycle' in (guiContract.interaction_baseline?.conversation_scope ?? {})) {
    throw new Error('App GUI conversation scope must not expose a managed Worktree lifecycle');
  }
}

function validateUiLocalePolicy(guiContract) {
  const policy = guiContract.ui_locale_policy;
  if (
    policy?.explicit_user_preference !== 'preserve_across_launches' ||
    policy?.first_launch_without_preference !== 'detect_system_locale_before_first_render' ||
    policy?.supported_normalization !== 'zh_to_zh-CN_else_en-US' ||
    policy?.startup_must_not_overwrite_explicit_preference !== true
  ) {
    throw new Error('App GUI locale policy must detect the system language before first render while preserving explicit preferences');
  }
}

function validateAiFirstInteractionModel(guiContract) {
  const model = guiContract.ai_first_interaction_model;
  if (
    !model ||
    model.default_visual_basis !== 'chat_first_composer_layout_with_pinned_deepseek_harness_visual_source' ||
    model.primary_policy !== 'maximize_direct_ai_interaction_on_the_chat_canvas' ||
    model.default_failure_semantics !==
      'fail_open_with_bounded_self_repair_jit_preparation_degradation_or_fallback' ||
    model.progress_policy !== 'preserve_user_momentum_and_attempt_safe_progress_before_requesting_manual_repair' ||
    model.fault_isolation_policy !==
      'a_selected_capability_failure_may_block_only_that_capability_while_plain_Codex_other_Agents_drafts_and_existing_sessions_remain_available' ||
    model.error_visibility_policy !==
      'never_swallow_or_relabel_a_real_failure_and_always_keep_a_user_comprehensible_reason_and_next_action' ||
    model.right_context_policy !== 'on_demand_advanced_surfaces_no_default_third_column' ||
    model.mas_autonomy_policy !== 'MAS_runs_as_autonomous_research_execution_not_co_scientist_pair_work' ||
    model.open_science_learning_policy !== 'adopt_artifact_provenance_review_and_plain_language_data_flow_patterns_as_secondary_context_only'
  ) {
    throw new Error('App GUI AI-first interaction model must keep Codex App composer-first defaults and collapsed secondary context');
  }
  assertIncludesAll(
    model.recovery_order,
    [
      'consume_owner_projected_action_or_self_repair',
      'prepare_missing_use_boundary_state_just_in_time',
      'continue_in_degraded_mode_or_use_a_safe_fallback',
      'preserve_draft_and_offer_an_owner_route_when_the_selected_capability_is_unavailable',
    ],
    'App GUI AI-first recovery order',
  );
  assertIncludesAll(
    model.must_not_preemptively_block_on,
    [
      'stale_or_verification_deferred_status',
      'update_available',
      'optional_dependency_missing',
      'optional_receipt_or_binding_absent',
      'workspace_absent_when_the_owner_projected_action_does_not_require_target_workspace',
    ],
    'App GUI AI-first fail-open signals',
  );
  assertIncludesAll(
    model.localized_fail_closed_boundaries,
    [
      'selected_package_identity_or_incompatible_version_mismatch',
      'selected_package_entrypoint_missing',
      'unsafe_managed_target_or_path_traversal',
      'permission_sandbox_or_account_authorization_denial',
      'unconfirmed_irreversible_external_mutation',
      'success_or_authority_claim_cannot_be_truthfully_supported',
    ],
    'App GUI AI-first localized fail-closed boundaries',
  );
  assertIncludesAll(
    model.allowed_adoptions,
    [
      'artifact_provenance_review_refs_in_on_demand_preview_or_timeline_disclosure',
      'plain_language_data_flow_and_safety_copy',
      'workflow_starters_as_purpose_entries_or_app_actions',
      'scientific_preview_affordances_on_demand',
    ],
    'App GUI AI-first allowed external learning adoptions',
  );
  assertIncludesAll(
    model.must_not_default_to,
    [
      'three-column scientific workbench',
      'open artifact inspector',
      'side-by-side co-scientist monitoring',
      'Home activity cockpit',
      'foreign runtime or domain authority',
    ],
    'App GUI AI-first forbidden defaults',
  );
}

function reviewSurfaceProductPolicy(reviewSurface) {
  const sourceEvidenceFields = Object.keys(appOwnedReviewSurfaceSourceEvidence);
  return Object.fromEntries(
    Object.entries(reviewSurface).filter(([key]) => !sourceEvidenceFields.includes(key)),
  );
}

function validateReviewSurface(reviewSurface, label) {
  const sourceEvidenceFields = Object.keys(appOwnedReviewSurfaceSourceEvidence);
  assertDeepEqualJson(
    reviewSurfaceProductPolicy(reviewSurface),
    appOwnedRightContextInspectorPolicy.review_surface,
    `${label} product policy`,
  );
  assertDeepEqualJson(
    Object.fromEntries(sourceEvidenceFields.map((key) => [key, reviewSurface[key]])),
    appOwnedReviewSurfaceSourceEvidence,
    `${label} source evidence`,
  );
}

function validateRightContextInspector(guiContract) {
  const inspector = guiContract.right_context_inspector ?? {};
  const reviewSurface = inspector.review_surface ?? {};
  const interactionReviewSurface = guiContract.interaction_baseline?.context_surfaces?.review_pane ?? {};
  const productPolicy = {
    ...inspector,
    review_surface: reviewSurfaceProductPolicy(reviewSurface),
  };
  assertDeepEqualJson(
    Object.fromEntries(
      Object.entries(productPolicy).filter(([key]) => !['current_task_evidence', 'must_not_own'].includes(key)),
    ),
    appOwnedRightContextInspectorPolicy,
    'App GUI on-demand advanced workspace surface policy',
  );
  validateReviewSurface(reviewSurface, 'App GUI right-context Review');
  validateReviewSurface(interactionReviewSurface, 'App GUI interaction-baseline Review');
  assertDeepEqualJson(
    guiContract.interaction_baseline?.context_surfaces?.side_panel?.toggle_ownership,
    appOwnedRightContextInspectorPolicy.toggle_ownership,
    'App GUI interaction side-panel toggle ownership',
  );
  for (const legacyField of ['tabs', 'primary_tools', 'secondary_sections']) {
    if (legacyField in inspector) {
      throw new Error(`App GUI must not restore legacy equal-weight inspector taxonomy field ${legacyField}`);
    }
  }
  if (inspector.runtime_duplicate_allowed !== false) {
    throw new Error('App GUI advanced workspace surfaces must not duplicate Runtime');
  }
  for (const forbiddenOwner of appOwnedRightContextInspectorForbiddenOwners) {
    if (!inspector.must_not_own?.includes(forbiddenOwner)) {
      throw new Error(`App GUI right context inspector must not own ${forbiddenOwner}`);
    }
  }
  assertIncludesAll(guiContract.pages?.right_context_inspector?.must_show, [
    'no third column mounted by default',
    'Files and Changes workspace surface opened only by user or task need',
    'exactly one Files and Changes panel toggle visible per viewport state, owned by conversation header while closed and panel header while open',
    'Preview opened as an independent surface for artifact, file, URL, or result',
    'Terminal and Browser opened from Environment or task need',
  ], 'App GUI advanced workspace visible signals');
  assertIncludesAll(guiContract.pages?.right_context_inspector?.must_not_show, [
    'legacy equal-weight Review, Terminal, Browser, Files, Artifacts, Runtime, Actions, and Memory taxonomy',
    'Runtime duplicate outside the message timeline current task instance',
    'advanced work surfaces open by default',
    'duplicate Files and Changes panel toggles in the global titlebar, conversation header, panel header, or floating handle',
  ], 'App GUI advanced workspace forbidden signals');
}

function validateHomeShortcutCompatibilityMetadata(guiContract) {
  const layout = guiContract.home_layout;
  const policy = guiContract.home_agent_shortcuts_metadata_policy;
  if (
    policy?.role !== 'owner_projected_package_presentation' ||
    policy?.shortcut_source_ref !== `${layout.shortcut_membership_source_ref}[].home_shortcuts[]` ||
    policy?.preference_source_ref !== layout.shortcut_preference_source_ref ||
    policy?.package_id_allowlist_allowed !== false ||
    policy?.fallback_policy !== 'omit_invalid_shortcut_and_preserve_other_packages'
  ) {
    throw new Error('App GUI contract Home shortcut projection policy must consume dynamic owner metadata');
  }
}

function validateHomeShortcutIconMetadata(guiContract) {
  assertDeepEqualJson(
    guiContract.home_shortcut_icon_metadata_policy,
    dynamicPackageShortcutIconPolicy,
    'App GUI contract Home shortcut icon policy',
  );
}

function validateNoFixedAgentHomePresentation(guiContract) {
  for (const field of [
    'default_assistants',
    'non_default_assistants',
    'home_purpose_entries',
    'retired_domain_agents',
    'professional_agent_packages',
    'professional_agent_packages_metadata_policy',
    'home_agent_shortcuts',
  ]) {
    if (field in guiContract) {
      throw new Error(`App GUI contract must not restore fixed Agent/Home presentation field ${field}`);
    }
  }
  if (
    guiContract.home_layout?.home_presentation_source_ref !==
    'app_state.agent_packages.directory.entries + app_state.agent_packages.status_index.home_shortcut_preferences[]'
  ) {
    throw new Error('App GUI Home presentation must come from the dynamic Agent directory and preferences');
  }
}

export function validateGuiProductHomeContract(guiContract) {
  validateGuiProductIdentity(guiContract);
  validateExecutorPolicy(guiContract);
  validateUiLocalePolicy(guiContract);
  validateHomeLayout(guiContract);
  validateUtilityIconPolicy(guiContract);
  validateOrdinaryConversation(guiContract);
  validateSessionDirectoryPolicy(guiContract);
  validateAiFirstInteractionModel(guiContract);
  validateRightContextInspector(guiContract);
  validateHomeShortcutCompatibilityMetadata(guiContract);
  validateHomeShortcutIconMetadata(guiContract);
  validateNoFixedAgentHomePresentation(guiContract);
}
