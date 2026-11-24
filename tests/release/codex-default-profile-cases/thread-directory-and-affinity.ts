import {
  assert,
  test,
  readJson,
} from "./fixtures.ts";

test('recorded cwd compatibility auto-loads a directory group without creating project affinity', () => {
  const contract = readJson('contracts/app-gui-product-contract.json');
  const threadDirectory = contract.interaction_baseline.navigation_rail.thread_directory_policy;
  assert.equal(
    threadDirectory.directory_group_policy.recorded_cwd_compatibility_policy,
    'non_managed_scratch_recorded_cwd_supplies_derived_directory_group_without_creating_or_blocking_project_affinity',
  );
  assert.equal(threadDirectory.directory_group_policy.derived_group_registered_workspace_mutation_allowed, false);
  assert.equal(threadDirectory.directory_group_policy.managed_scratch_recorded_cwd_grouping_allowed, false);
  const runtimeBridge = readJson('contracts/app-runtime-bridge.json');
  assert.equal(
    runtimeBridge.canonical_conversation_continuity_policy.directory_group_policy.recorded_cwd_compatibility_policy,
    threadDirectory.directory_group_policy.recorded_cwd_compatibility_policy,
  );
  assert.equal(
    contract.interaction_baseline.conversation_scope.session_workspace_model.project_affinity_source,
    'opl_studio_versioned_ui_metadata_keyed_by_canonical_thread_id',
  );

  const pageStateMatrix = readJson('contracts/app-page-state-matrix.json');
  assert.match(
    JSON.stringify(pageStateMatrix),
    /non-managed-scratch canonical recorded cwd auto-loads a directory group/,
  );
  assert.match(JSON.stringify(pageStateMatrix), /recorded cwd alone treated as explicit Project affinity/);
});

test('OPL Link projects a projectless canonical conversation binding without Shell inference', () => {
  const contract = readJson('contracts/app-gui-product-contract.json');
  const remoteCompanionAccess = contract.pages.settings_resources.remote_companion_access;
  const runtimeBridge = readJson('contracts/app-runtime-bridge.json');
  const projection = runtimeBridge.canonical_conversation_continuity_policy.transport_binding_projection;
  const pageStateMatrix = readJson('contracts/app-page-state-matrix.json');
  const pageRemoteCompanionAccess = pageStateMatrix.pages.find((page: any) => page.id === 'settings_resources')
    .remote_companion_access;

  assert.equal(remoteCompanionAccess.source, 'framework_projected_remote_companion_connector_route');
  assert.deepEqual(remoteCompanionAccess.source_by_renderer, {
    aionui: 'app_state.ui_contributions.slots.settings.section',
    opl_studio: 'app_state.ui_contributions.slots.settings.section',
  });
  assert.equal(remoteCompanionAccess.standard_view_type, 'remote_companion_access');
  assert.equal(remoteCompanionAccess.framework_remote_companion_host_activation_in_aionui_allowed, true);
  assert.equal(remoteCompanionAccess.single_active_provider_path_per_renderer_required, true);
  assert.equal(
    remoteCompanionAccess.provider_absent_policy,
    'project_unavailable_without_fabricated_pair_or_device_state_and_keep_the_desktop_workbench_usable',
  );
  assert.equal(projection.source, 'app_state.transport_bindings');
  assert.equal(projection.surface_kind, 'opl_app_transport_bindings_projection.v1');
  assert.equal(projection.migration_state, 'framework_transport_binding_projection_and_studio_source_e2e_completed');
  assert.equal(projection.projection_runtime_status, 'current_framework_projection_proven');
  assert.equal(projection.binding_field_contract.project_affinity, 'projectless');
  assert.equal(projection.binding_field_contract.status, 'bound');
  assert.equal(projection.canonical_row_policy, 'one_visible_row_per_canonical_thread_identity_even_when_a_transport_binding_exists');
  assert.match(
    projection.provider_absent_policy,
    /producer_absent_without_shell_inference_or_writeback/,
  );
  assert.equal(projection.target_workspace_leaf_or_title_inference_allowed, false);
  assert.equal(projection.target_shell_writeback_allowed, false);
  assert.equal('temporary_legacy_fallback' in projection, false);
  assert.equal('legacy_shell_read_compatibility' in projection, false);
  assert.equal('existing_exact_canonical_thread_id_read_compatibility' in projection, false);
  assert.equal(projection.cached_canonical_thread_id_binding_inference_allowed, false);
  assert.match(projection.binding_unavailable_policy, /preserve_the_transport_row_fail_open_without_fabricated_binding/);
  assert.match(pageRemoteCompanionAccess.provider_absent_policy, /project_unavailable_without_fabricated_pair_or_device_state/);
  assert.deepEqual(pageRemoteCompanionAccess.status_values, [
    'unavailable',
    'unpaired',
    'reserving',
    'qr_ready',
    'awaiting_confirmation',
    'active',
    'revoking',
    'attention',
  ]);
});
