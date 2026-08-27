import {
  assert,
  fs,
  test,
  validateAppGuiProductContract,
  validatePrimaryInteractionPages,
  validateProductProfile,
  assertCanonicalThreadDirectoryGroupingSources,
  assertCanonicalThreadDirectoryTimeoutBoundarySources,
  assertCanonicalThreadAffinityConvergenceSources,
  assertCurrentGuidHomeSelectionSources,
  assertProjectlessGuidFileAccessSources,
  assertRuntimePageSourceBoundary,
  assertSkillsHubScopeSource,
  validateShellVisualTokenBindings,
  assertCodexModelPolicyProjection,
  projectCodexModelPolicyContracts,
  readJson,
  readModelPolicyBundle,
} from "./fixtures.ts";

test('Skills Hub exposes global and projected Skill scopes without upstream auto-injected UI', () => {
  const current = [
    'const skills = await ipcBridge.fs.listAvailableSkills.invoke();',
    'setAvailableSkills(skills);',
    "flowManagedSkillIds === undefined ? 'my-skills-section' : 'manual-and-third-party-capabilities'",
    "t('settings.skillsHub.mySkillsTitle', { defaultValue: 'Global User Skills' })",
    "t('settings.skillsHub.globalUserSkillsPath', { path: skillPaths.user_skills_dir })",
  ].join('\n');
  assert.doesNotThrow(() => assertSkillsHubScopeSource(current));
  assert.throws(
    () => assertSkillsHubScopeSource(`${current}\nipcBridge.fs.listBuiltinAutoSkills.invoke();`),
    /auto-injected Skill scope/,
  );
  assert.throws(
    () => assertSkillsHubScopeSource(current.replace('Global User Skills', 'My Skills')),
    /Global User Skills/,
  );
});

test('conversation history and managed scratch keep identity, cwd, and Project affinity distinct', () => {
  const guiProductContract = readJson('contracts/app-gui-product-contract.json');
  const pageStateMatrix = readJson('contracts/app-page-state-matrix.json');
  const threadDirectoryPolicy = guiProductContract.interaction_baseline.navigation_rail.thread_directory_policy;
  const surfaces = threadDirectoryPolicy.conversation_history_surfaces;
  const guiWorkspaceModel = guiProductContract.interaction_baseline.conversation_scope.session_workspace_model;
  const profileWorkspaceModel = readJson('contracts/app-product-profile.json')
    .gui.ordinary_conversation.session_workspace_model;
  const home = pageStateMatrix.pages.find((page: { id: string }) => page.id === 'guid_home');
  const ordinaryConversation = pageStateMatrix.pages.find(
    (page: { id: string }) => page.id === 'ordinary_conversation',
  );

  assert.equal(
    surfaces.default_rail.membership,
    'canonical_unarchived_thread_directory',
  );
  assert.equal(surfaces.default_rail.authority, 'codex_app_server_thread_list_archived_false');
  assert.equal(surfaces.default_rail.thread_classification_required, false);
  assert.equal(
    surfaces.default_rail.archived_false_role,
    'directory_membership_only_never_running_status',
  );
  for (const unsupportedClassificationField of [
    'thread_classification_authority',
    'classification_values',
    'unclassified_codex_policy',
  ]) {
    assert.equal(unsupportedClassificationField in surfaces.default_rail, false);
  }
  assert.equal('unclassified_codex_label' in surfaces.all_search, false);
  assert.equal(surfaces.running_now.authority, 'same_codex_desktop_runtime_task_status');
  assert.equal(surfaces.archived.membership, 'canonical_archived_thread_directory');
  assert.equal(surfaces.all_search.may_replace_default_rail, false);
  assert.equal(
    surfaces.acceptance_comparison,
    'same_instant_same_authority_exact_thread_id_set_and_archived_bit',
  );
  assert.equal(surfaces.fixed_count_assertion_allowed, false);
  assert.deepEqual(surfaces.project_row_new_conversation_action, {
    placement: 'project_row_trailing',
    visibility: {
      desktop_fine_pointer: {
        resting: 'hidden',
        show_on: ['own_project_row_hover', 'focus_visible'],
      },
      coarse_pointer: 'visible',
      mobile: 'visible',
    },
    accessibility: {
      role: 'button',
      tab_reachable: true,
      activation: ['click', 'Enter', 'Space'],
      accessible_name_required: true,
      tooltip_required: true,
    },
    workspace_scope: 'own_project_row',
    handler: 'existing_workspace_scoped_new_conversation_handler',
    route: '/guid',
    route_state: 'workspace',
  });
  assert.deepEqual(surfaces.ordinary_conversation_row_visual, {
    source: 'pinned_deepseek_harness_history_row_visual_cohort',
    expanded_row_leading_content: 'none',
    leading_icon_policy:
      'do_not_render_assistant_backend_or_generic_message_icons_for_ordinary_conversations',
    status_exception_policy: 'render_only_real_cron_or_generation_status_when_present',
    collapsed_row_policy: 'compact_identity_glyph_allowed_when_title_is_hidden',
    managed_worktree_policy: 'preserve_localized_standard_git_branch_indicator_as_non_leading_metadata',
    typography: {
      title_font_size_px: 13,
      title_font_weight: 400,
      title_line_height_px: 20,
      letter_spacing_px: 0,
    },
    geometry: {
      row_min_height_px: 30,
      row_padding_block_px: 4,
      row_padding_inline_end_px: 4,
      row_padding_inline_start_px: 28,
      row_gap_px: 1,
      row_radius_px: 6,
    },
    interaction_invariants: [
      'click_context_menu_keyboard_focus_tooltip_and_selection_semantics_unchanged',
      'project_folder_and_cron_status_markers_remain_semantic',
      'pinned_and_managed_worktree_metadata_must_not_become_leading_conversation_icons',
    ],
  });
  assert.deepEqual(surfaces.project_affinity_presentation, {
    recorded_cwd_role:
      'canonical_runtime_workspace_and_unregistered_directory_group_fallback_when_explicit_project_id_absent',
    project_affinity_role:
      'explicit_project_id_wins_for_sidebar_grouping_otherwise_non_managed_scratch_recorded_cwd_supplies_derived_directory_group_without_identity_writeback',
    managed_projectless_workspace_roots: [
      'user_documents_codex_subtree',
      'user_codex_worktrees_subtree',
    ],
    managed_root_grouping_policy:
      'preserve_runtime_cwd_and_render_unbound_without_leaf_directory_project_groups',
    unregistered_directory_grouping_policy:
      'auto_load_one_read_only_directory_group_and_new_session_cwd_shortcut_from_non_managed_scratch_recorded_cwd_without_project_id_assignment_or_registered_workspace_mutation',
    projectless_adoption_eligibility:
      'explicit_project_id_absent_and_canonical_thread_read_confirms_project_id_absent_independent_of_recorded_cwd',
    managed_worktree_row_indicator: {
      source: 'canonical_runtime_or_preserved_cleaned_recorded_cwd_under_user_codex_worktrees',
      presentation: 'inline_standard_git_branch_icon_with_localized_tooltip_and_accessible_name',
      glyph_source: 'icon_park_branch_compatibility_glyph',
      explicit_project_affinity_behavior: 'preserve_indicator_while_project_id_remains_grouping_authority',
      changes_project_affinity: false,
      mutation_action: 'none',
    },
  });
  assert.deepEqual(surfaces.missing_workspace_continuity, {
    authority: 'canonical_thread_identity_and_history_are_independent_of_workspace_directory_lifecycle',
    trigger: 'canonical_recorded_cwd_unavailable_during_local_projection_materialization',
    materialization: 'create_rebuildable_local_projection_with_backend_provided_temporary_workspace',
    runtime_transition: 'retarget_canonical_thread_cwd_to_temporary_workspace_with_exact_readback',
    recorded_fact: 'preserve_original_cwd_as_canonical_recorded_workspace_with_workspace_unavailable_true',
    conversation_behavior: 'history_remains_visible_and_composer_remains_enabled',
    status_presentation: 'localized_workspace_directory_cleaned_status_below_timeline',
    refresh_behavior: 'canonical_directory_refresh_preserves_one_thread_row_and_cleaned_workspace_metadata',
    project_affinity_behavior: 'no_automatic_project_affinity_assignment_or_workspace_picker',
    forbidden: [
      'automatic_directory_selection_modal',
      'thread_removal_because_recorded_cwd_is_unavailable',
      'read_only_downgrade',
      'silent_project_affinity_mutation',
    ],
  });
  assert.equal(
    threadDirectoryPolicy.directory_group_policy_authority,
    'app_owned_explicit_project_affinity_and_recorded_cwd_fallback_contract_implemented_by_active_shell',
  );
  assert.equal(
    threadDirectoryPolicy.project_affinity_presentation_authority_ref,
    'conversation_history_surfaces.project_affinity_presentation',
  );
  assert.equal(
    threadDirectoryPolicy.strict_project_affinity_producer,
    'opl_studio_versioned_ui_metadata_keyed_by_canonical_thread_id',
  );
  assert.equal(
    guiWorkspaceModel.projectless_detection,
    'explicit_project_id_absent_defines_unbound_identity_while_managed_scratch_recorded_cwd_including_user_documents_codex_and_user_codex_worktrees_never_creates_directory_group',
  );
  assert.equal(
    guiWorkspaceModel.recorded_cwd_role,
    'canonical_runtime_workspace_and_derived_directory_group_fallback_when_explicit_project_id_absent_and_not_managed_scratch',
  );
  assert.equal(guiWorkspaceModel.project_affinity_source, 'opl_studio_versioned_ui_metadata_keyed_by_canonical_thread_id');
  assert.equal(
    guiWorkspaceModel.project_affinity_role,
    'explicit_project_id_wins_for_sidebar_grouping_non_managed_scratch_recorded_cwd_only_supplies_derived_directory_group',
  );
  assert.equal(
    guiWorkspaceModel.managed_scratch_presentation,
    'user_documents_codex_and_user_codex_worktrees_subtrees_preserve_recorded_cwd_and_render_unbound_without_leaf_directory_project_groups',
  );
  assert.equal(
    guiWorkspaceModel.core_workspace_application,
    'thread_resume_or_turn_start_cwd_records_runtime_workspace_only',
  );
  assert.equal(
    guiWorkspaceModel.project_adoption_transition,
    'unbound_to_bound_once_via_versioned_ui_metadata_assignment',
  );
  assert.deepEqual(profileWorkspaceModel, guiWorkspaceModel);
  assert.deepEqual(ordinaryConversation.conversation_view_model.session_workspace_model, guiWorkspaceModel);
  assert.equal(
    guiProductContract.interaction_baseline.conversation_scope.session_workspace_model_authority,
    'app_owned_contract_with_active_shell_explicit_project_affinity_adapter',
  );
  assert.equal(
    guiProductContract.interaction_baseline.conversation_scope.project_affinity_presentation_authority_ref,
    'interaction_baseline.navigation_rail.thread_directory_policy.conversation_history_surfaces.project_affinity_presentation',
  );
  assert.deepEqual(home.home_view_model.conversation_history_surfaces, {
    policy_ref:
      'contracts/app-gui-product-contract.json#interaction_baseline.navigation_rail.thread_directory_policy.conversation_history_surfaces',
    default_rail: 'canonical_unarchived_thread_directory',
    running_now: 'same_codex_desktop_runtime_task_status_or_explicit_unavailable',
    archived: 'independent_canonical_archived_thread_directory',
    all_search: 'explicit_canonical_historical_search_never_default_rail',
    project_affinity_presentation:
      'recorded_cwd_preserved_explicit_project_id_wins_non_managed_scratch_cwd_auto_groups_managed_user_documents_codex_and_user_codex_worktrees_unbound_with_inline_managed_worktree_indicator',
    managed_worktree_row_indicator: {
      source: 'canonical_runtime_or_preserved_cleaned_recorded_cwd_under_user_codex_worktrees',
      presentation: 'inline_standard_git_branch_icon_with_localized_tooltip_and_accessible_name',
      glyph_source: 'icon_park_branch_compatibility_glyph',
      changes_project_affinity: false,
      mutation_action: 'none',
    },
    missing_workspace_continuity: {
      identity_and_history: 'preserved_from_canonical_thread_directory',
      runtime_workspace: 'backend_provided_temporary_workspace_with_canonical_cwd_readback',
      original_workspace: 'preserved_as_cleaned_fact',
      conversation: 'continues_with_enabled_composer',
      status: 'localized_workspace_directory_cleaned_below_timeline',
      refresh: 'one_thread_row_remains_visible',
      directory_picker: 'forbidden',
    },
    visible_id_consumers: ['default_rail', 'archived', 'pinned', 'workspace_groups', 'timeline'],
    fixed_count_acceptance_allowed: false,
  });
});

test('active-shell Runtime source gate allows canonical action refs but rejects legacy fallback reconstruction', () => {
  const canonicalActionRefs = [
    "actionId: 'work_item_visibility_set'",
    'payload.expected_generation = selectedItem.visibility.generation',
    'const refreshedItem = findReadbackWorkItem(refreshedPayload, selectedItem)',
    'const workflow_id = canonicalWorkItem.workflowId',
  ].join('\n');

  assert.doesNotThrow(() => assertRuntimePageSourceBoundary(canonicalActionRefs));
  for (const legacyFallback of [
    'normalizeRuntimeProjection(appState)',
    'dedupeTaskItems(items)',
    'runtimeTaskItem(task, controlStates)',
    'appStateToRuntimeProjection(appState)',
    'compactCurrentControlState(state)',
    'controlStateFallbackForTask(task, controlStates)',
    'record(controlState?.provider_run)',
  ]) {
    assert.throws(() => assertRuntimePageSourceBoundary(`${canonicalActionRefs}\n${legacyFallback}`));
  }
});
