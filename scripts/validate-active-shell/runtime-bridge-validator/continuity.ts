import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';

export function validateCanonicalConversationContinuityPolicy(runtimeBridge) {
  const policy = runtimeBridge.canonical_conversation_continuity_policy;
  for (const [field, expected] of Object.entries({
    state: 'active_studio_canonical_thread_projection',
    thread_truth_owner: 'codex_core_app_server',
    thread_turn_authority: 'codex_core_app_server',
    canonical_identity: 'host_identity_plus_opaque_app_server_thread_id',
    ordinary_rail_authority: 'codex_app_server_thread_list_read_resume',
    canonical_runtime_owner: 'codex_core_app_server',
    runtime_ensure_scope: 'none_opl_codex_native_is_the_only_runtime',
    canonical_input_focus_warmup_policy: 'no_legacy_runtime_ensure',
    canonical_send_transport: 'codex_app_server_thread_resume_then_turn_start',
    stale_acp_resume_anchor_policy: 'ignore_for_canonical_history_and_turn_execution',
    shell_local_storage_role: 'ui_preferences_drafts_and_rebuildable_cache_only',
    shell_can_own_thread_history: false,
    codex_session_directory_authority: 'canonical_app_server_thread_overview_when_available',
    canonical_overview_unavailable_policy: 'fallback_to_shell_cache_without_reclassifying_cache_as_authority',
    stale_codex_acp_cache_row_policy:
      'exclude_from_ordinary_projection_when_absent_from_available_canonical_overview',
    non_codex_local_row_policy: 'preserve',
    direct_cross_shell_private_store_access_allowed: false,
    duplicate_thread_store_allowed: false,
    simultaneous_same_thread_write_safety_claimed: false,
    historical_aionui_status: 'retired_historical_provenance_only',
    opl_studio_status: 'canonical_codex_app_server_thread_directory_and_resume',
    pin_role: 'shell_ui_metadata_only',
    local_reset_role: 'studio_local_metadata_reset_without_codex_app_server_history_reset',
    workspace_directory_role:
      'new_session_initial_cwd_projectless_adoption_grouping_and_visible_metadata_only_not_authorization_domain',
    row_identity: 'canonical_thread_id',
    duplicate_row_per_canonical_thread_allowed: false,
    title_based_deduplication_allowed: false,
    e2e_fixture_storage_policy: 'isolated_storage_root_never_production_user_data',
    acceptance: 'opl_studio_projects_codex_app_server_threads_and_resumes_by_canonical_identity',
    implementation_status: 'active_studio_canonical_thread_projection',
  })) {
    if (policy?.[field] !== expected) {
      throw new Error(`Runtime bridge canonical conversation continuity policy ${field} must be ${expected}`);
    }
  }
  assertIncludesAll(
    policy?.required_operations,
    [
      'thread/list',
      'thread/read',
      'thread/resume',
      'thread/name/set',
      'thread/archive',
      'thread/unarchive',
      'thread/delete',
      'turn/start',
    ],
    'Canonical conversation continuity operations',
  );
  assertIncludesAll(
    policy?.archive_restore_operations,
    ['thread/archive', 'thread/unarchive'],
    'Canonical conversation archive and restore operations',
  );
  assertDeepEqualJson(
    policy?.task_action_protocols,
    {
      rename: 'thread/name/set',
      archive: 'thread/archive',
      restore: 'thread/unarchive',
      delete: 'thread/delete',
    },
    'Canonical conversation task action protocols',
  );
  assertDeepEqualJson(
    policy?.transport_binding_projection,
    {
      source: 'app_state.transport_bindings',
      surface_kind: 'opl_app_transport_bindings_projection.v1',
      migration_state: 'framework_transport_binding_projection_and_studio_source_e2e_completed',
      projection_runtime_status: 'current_framework_projection_proven',
      raw_fact_owner: 'current_shell_exact_binding_store',
      projection_owner: 'one-person-lab-framework',
      consumer_role: 'render_and_join_only',
      required_projection_fields: ['surface_kind', 'status', 'bindings', 'authority_boundary'],
      status_values: ['available', 'unavailable'],
      unavailable_reason_values: ['producer_absent', 'projection_unavailable', 'invalid_projection'],
      required_binding_fields: [
        'binding_id',
        'provider_id',
        'account_id',
        'channel_session_id',
        'canonical_thread_host',
        'canonical_thread_id',
        'project_affinity',
        'status',
      ],
      binding_key_fields: ['provider_id', 'account_id', 'channel_session_id'],
      binding_value_fields: ['canonical_thread_host', 'canonical_thread_id'],
      binding_field_contract: {
        binding_id: 'opaque_provider_stable_binding_identity',
        provider_id: 'stable_installed_transport_provider_identity',
        account_id: 'opaque_provider_scoped_channel_account_identity',
        channel_session_id: 'opaque_account_scoped_channel_session_identity',
        canonical_thread_host: 'canonical_codex_app_server_host_identity',
        canonical_thread_id: 'opaque_codex_app_server_threadId_identity',
        project_affinity: 'projectless',
        status: 'bound',
      },
      available_empty_policy: 'valid_no_current_bindings',
      unavailable_policy: 'bindings_must_be_empty_and_unavailable_reason_required',
      provider_absent_policy:
        'status_unavailable_reason_producer_absent_without_shell_inference_or_writeback',
      binding_identity_policy: 'one_entry_per_exact_provider_id_account_id_channel_session_id_tuple',
      binding_key_normalization_or_inference_allowed: false,
      canonical_join_policy: 'join_only_by_exact_canonical_thread_host_and_canonical_thread_id',
      canonical_row_policy: 'one_visible_row_per_canonical_thread_identity_even_when_a_transport_binding_exists',
      projectless_policy: 'binding_never_creates_project_affinity_and_recorded_cwd_is_execution_metadata_only_not_a_binding_key',
      target_shell_writeback_allowed: false,
      target_workspace_leaf_or_title_inference_allowed: false,
      exact_binding_recovery: {
        persistence_role:
          'shell_may_persist_only_the_exact_binding_record_as_recoverable_adapter_state_not_thread_or_turn_truth',
        persisted_fields: [
          'provider_id',
          'account_id',
          'channel_session_id',
          'canonical_thread_host',
          'canonical_thread_id',
        ],
        initial_binding_sequence: [
          'validate_the_exact_provider_id_account_id_channel_session_id_tuple',
          'request_thread_start_from_the_canonical_codex_app_server',
          'thread_read_the_returned_threadId_on_the_same_host',
          'persist_the_exact_tuple_to_canonical_thread_identity_only_after_exact_readback',
        ],
        restart_recovery_sequence: [
          'load_the_exact_persisted_binding_record',
          'match_provider_id_account_id_channel_session_id_without_normalization_alias_or_fallback',
          'verify_canonical_thread_host_matches_the_active_codex_app_server_host',
          'thread_read_the_exact_canonical_thread_id',
          'thread_resume_the_same_canonical_thread_id_before_turn_start',
        ],
        success_readback:
          'thread_read_returns_the_exact_canonical_thread_id_from_the_bound_host',
        app_server_wire_mapping: {
          canonical_thread_id: 'threadId',
          transient_turn_id: 'turnId_not_persisted_in_the_binding',
        },
        unknown_binding_policy:
          'fail_closed_without_thread_start_thread_id_inference_or_binding_writeback_during_recovery',
        mismatch_policy: 'fail_closed_without_rebind_merge_overwrite_or_turn_start',
        app_server_unavailable_policy:
          'retain_the_exact_binding_for_later_retry_without_claiming_recovery_or_resumed_state',
        shell_exact_binding_persistence_allowed: true,
        shell_thread_id_inference_allowed: false,
        shell_thread_or_turn_truth_allowed: false,
      },
      current_missing_surface_policy:
        'treat_as_unavailable_without_blocking_the_current_mainline_or_enabling_shell_inference_or_writeback',
      cached_canonical_thread_id_binding_inference_allowed: false,
      binding_unavailable_policy:
        'preserve_the_transport_row_fail_open_without_fabricated_binding_even_if_the_canonical_directory_also_contains_the_cached_thread_id',
      typed_client_event: 'opl/app-transport-bindings/updated',
    },
    'Canonical conversation transport binding projection',
  );
  assertDeepEqualJson(
    policy?.directory_group_policy,
    {
      source:
        'opl_studio_versioned_ui_metadata_affinity_else_non_managed_scratch_canonical_recorded_cwd_joined_by_canonical_thread_id',
      role: 'presentation_new_session_cwd_shortcut_and_projectless_adoption_only',
      owns_sessions: false,
      owns_context: false,
      owns_artifacts: false,
      group_delete_action_allowed: false,
      cascade_session_delete_allowed: false,
      new_session_action_language: 'use_this_working_directory_not_create_project_child',
      project_directory_cardinality:
        'one_explicit_project_affinity_or_one_derived_recorded_cwd_group_per_canonical_thread',
      recorded_cwd_compatibility_policy:
        'non_managed_scratch_recorded_cwd_supplies_derived_directory_group_without_creating_or_blocking_project_affinity',
      derived_group_registered_workspace_mutation_allowed: false,
      managed_scratch_recorded_cwd_grouping_allowed: false,
      git_origin_url_project_identity_allowed: false,
      turn_cwd_reclassifies_bound_session: false,
      project_adoption_policy: {
        eligible_state: 'canonical_thread_id_present_and_versioned_ui_affinity_absent',
        triggers: ['drag_to_directory_group', 'keyboard_move_to_project_action'],
        destination_policy:
          'one_user_selected_canonical_project_directory_independent_of_explicit_inputs_turn_cwd_and_writable_roots',
        result:
          'persist_versioned_ui_project_affinity_keyed_by_canonical_thread_id_without_claiming_app_server_project_id',
        assignment_commit_policy:
          'only_after_canonical_thread_id_readback_then_versioned_ui_metadata_writeback_with_recorded_cwd_unchanged',
        transport: 'single_active_codex_app_server_adapter_plus_versioned_ui_metadata_store',
        core_workspace_application:
          'thread_read_exact_canonical_thread_id_then_versioned_ui_metadata_projection_without_app_server_project_id_writeback',
        turn_or_command_pwd_requirement:
          'never_used_for_project_affinity_eligibility_or_ui_metadata_readback',
        assignment_failure_policy: 'keep_unbound_conversation_available_and_show_lightweight_error',
        canonical_project_id_assignment_allowed: false,
        canonical_project_id_exact_readback_required: false,
        versioned_ui_affinity_writeback_allowed: true,
        versioned_ui_affinity_exact_thread_id_readback_required: true,
        recorded_runtime_cwd_preservation_required: true,
        recorded_runtime_cwd_blocks_assignment: false,
        runtime_workspace_roots_mutation_allowed: false,
        bound_session_reassignment_allowed: false,
        managed_handoff_or_receipt_layer_allowed: false,
        private_pending_deferred_revision_state_allowed: false,
      },
    },
    'Canonical conversation directory group policy',
  );
}
