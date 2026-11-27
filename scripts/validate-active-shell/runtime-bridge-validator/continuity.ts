import { assertDeepEqualJson, assertFieldsMatch, assertIncludesAll } from '../assertions.ts';

export function validateCanonicalConversationContinuityPolicy(runtimeBridge) {
  const policy = runtimeBridge.canonical_conversation_continuity_policy;
  assertFieldsMatch(policy, {
    state: 'active_studio_canonical_thread_projection',
    thread_truth_owner: 'codex_core_app_server',
    thread_turn_authority: 'codex_core_app_server',
    canonical_identity: 'host_identity_plus_opaque_app_server_thread_id',
    ordinary_rail_authority: 'codex_app_server_thread_list_read_resume',
    canonical_runtime_owner: 'codex_core_app_server',
    runtime_ensure_scope: 'none_opl_codex_native_is_the_only_runtime',
    canonical_input_focus_warmup_policy: 'no_legacy_runtime_ensure',
    canonical_send_transport: 'codex_app_server_thread_resume_then_turn_start',
    shell_local_storage_role: 'ui_preferences_drafts_and_rebuildable_cache_only',
    shell_can_own_thread_history: false,
    direct_cross_shell_private_store_access_allowed: false,
    duplicate_thread_store_allowed: false,
    duplicate_row_per_canonical_thread_allowed: false,
    title_based_deduplication_allowed: false,
    e2e_fixture_storage_policy: 'isolated_storage_root_never_production_user_data',
    opl_studio_status: 'canonical_codex_app_server_thread_directory_and_resume',
    implementation_status: 'active_studio_canonical_thread_projection',
  }, 'Runtime bridge canonical conversation continuity policy');
  assertIncludesAll(
    policy?.required_operations,
    ['thread/list', 'thread/read', 'thread/resume', 'thread/name/set', 'thread/archive', 'thread/unarchive', 'thread/delete', 'turn/start'],
    'Canonical conversation continuity operations',
  );
  assertIncludesAll(
    policy?.archive_restore_operations,
    ['thread/archive', 'thread/unarchive'],
    'Canonical conversation archive and restore operations',
  );
  assertDeepEqualJson(policy?.task_action_protocols, {
    rename: 'thread/name/set',
    archive: 'thread/archive',
    restore: 'thread/unarchive',
    delete: 'thread/delete',
  }, 'Canonical conversation task action protocols');

  const binding = policy?.transport_binding_projection;
  assertFieldsMatch(binding, {
    source: 'app_state.transport_bindings',
    surface_kind: 'opl_app_transport_bindings_projection.v1',
    migration_state: 'framework_transport_binding_projection_and_studio_source_e2e_completed',
    projection_runtime_status: 'current_framework_projection_proven',
    raw_fact_owner: 'current_shell_exact_binding_store',
    projection_owner: 'one-person-lab-framework',
    native_provider_projection_owner: 'opl-studio',
    consumer_role: 'render_and_join_only',
    binding_key_normalization_or_inference_allowed: false,
    target_shell_writeback_allowed: false,
    target_workspace_leaf_or_title_inference_allowed: false,
    cached_canonical_thread_id_binding_inference_allowed: false,
    typed_client_event: 'opl/app-transport-bindings/updated',
  }, 'Canonical conversation transport binding projection');
  assertDeepEqualJson(binding?.required_projection_fields, ['surface_kind', 'status', 'bindings', 'authority_boundary'], 'Canonical conversation transport binding projection fields');
  assertDeepEqualJson(binding?.status_values, ['available', 'unavailable'], 'Canonical conversation transport binding projection status values');
  assertDeepEqualJson(binding?.binding_key_fields, ['provider_id', 'account_id', 'channel_session_id'], 'Canonical conversation transport binding projection key fields');
  assertDeepEqualJson(binding?.binding_value_fields, ['canonical_thread_host', 'canonical_thread_id'], 'Canonical conversation transport binding projection value fields');
  const recovery = binding?.exact_binding_recovery;
  assertFieldsMatch(recovery, {
    unknown_binding_policy: 'fail_closed_without_thread_start_thread_id_inference_or_binding_writeback_during_recovery',
    mismatch_policy: 'fail_closed_without_rebind_merge_overwrite_or_turn_start',
    success_readback: 'thread_read_returns_the_exact_canonical_thread_id_from_the_bound_host',
    shell_exact_binding_persistence_allowed: true,
    shell_thread_id_inference_allowed: false,
    shell_thread_or_turn_truth_allowed: false,
  }, 'Canonical conversation transport binding projection recovery');
  assertDeepEqualJson(recovery?.persisted_fields, [
    'provider_id', 'account_id', 'channel_session_id', 'canonical_thread_host', 'canonical_thread_id',
  ], 'Canonical conversation transport binding projection persisted fields');
  assertDeepEqualJson(recovery?.app_server_wire_mapping, {
    canonical_thread_id: 'threadId',
    transient_turn_id: 'turnId_not_persisted_in_the_binding',
  }, 'Canonical conversation transport binding projection wire mapping');

  const dirGroup = policy?.directory_group_policy;
  assertFieldsMatch(dirGroup, {
    role: 'presentation_new_session_cwd_shortcut_and_projectless_adoption_only',
    owns_sessions: false,
    owns_context: false,
    owns_artifacts: false,
    group_delete_action_allowed: false,
    cascade_session_delete_allowed: false,
    derived_group_registered_workspace_mutation_allowed: false,
    managed_scratch_recorded_cwd_grouping_allowed: false,
    git_origin_url_project_identity_allowed: false,
    turn_cwd_reclassifies_bound_session: false,
  }, 'Canonical conversation directory group policy');
  assertFieldsMatch(dirGroup?.project_adoption_policy, {
    eligible_state: 'canonical_thread_id_present_and_versioned_ui_affinity_absent',
    canonical_project_id_assignment_allowed: false,
    versioned_ui_affinity_writeback_allowed: true,
    versioned_ui_affinity_exact_thread_id_readback_required: true,
    recorded_runtime_cwd_preservation_required: true,
    runtime_workspace_roots_mutation_allowed: false,
    bound_session_reassignment_allowed: false,
  }, 'Canonical conversation directory group policy adoption');
}
