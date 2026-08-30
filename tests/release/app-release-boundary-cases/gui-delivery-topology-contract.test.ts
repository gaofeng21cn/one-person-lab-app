import { validateProductProfile } from '../../../scripts/validate-active-shell/product-profile-validator.ts';
import { assert, fs, path, test, appRoot } from './helpers.ts';
import { parse as parseYaml } from 'yaml';

function readJson(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), 'utf8'));
}

test('App approves one DSH-derived renderer and Node host core across desktop, headless, and Docker', () => {
  const profile = readJson('contracts/app-product-profile.json');
  const release = readJson('contracts/app-release-channel.json');
  const candidates = readJson('contracts/app-shell-candidates.json');
  const gui = readJson('contracts/app-gui-product-contract.json');

  assert.deepEqual(profile.product.target_desktop_platforms, ['macos', 'windows', 'linux']);
  assert.deepEqual(profile.product.target_runtime_forms, [
    'electron_desktop',
    'standalone_headless_webui',
    'docker_webui',
  ]);
  assert.equal('supported_release_platforms' in profile.product, false);
  assert.deepEqual(profile.release_roles.current.admitted_product_platforms, ['macos-arm64']);
  assert.equal(profile.release_roles.successor.active_release_carrier, false);
  assert.equal(profile.delivery_topology.role, 'successor_target_only');
  assert.equal(profile.delivery_topology.shared_renderer.product_owner, 'one-person-lab-app');
  assert.equal(profile.delivery_topology.shared_renderer.technology, 'deepseek_harness_derived_react');
  assert.equal(profile.delivery_topology.shared_renderer.implementation_status, 'approved_active_product_development_release_admission_separate');
  assert.equal(profile.delivery_topology.shared_host_core.technology, 'node');
  assert.equal(profile.delivery_topology.shared_host_core.same_core_required_across_carriers, true);
  assert.equal(profile.delivery_topology.runtime.supported_backend_scope, 'codex_cli_only');
  assert.equal(profile.delivery_topology.runtime.aioncore_allowed, false);
  assert.equal(profile.delivery_topology.bridge.abi, 'opl_app_host_bridge.v1');
  assert.equal(profile.delivery_topology.desktop.host_technology, 'electron_thin_shell');
  assert.deepEqual(profile.delivery_topology.desktop.target_platforms, ['macos', 'windows', 'linux']);
  assert.equal(profile.delivery_topology.desktop.package_source_implemented, true);
  assert.equal(profile.delivery_topology.desktop.update_adapter_source_implemented, true);
  assert.equal(profile.delivery_topology.desktop.distribution_wiring_complete, false);
  assert.equal(profile.delivery_topology.desktop.update_command_wiring_complete, false);
  assert.equal(profile.delivery_topology.desktop.release_admission_complete, false);
  assert.equal(profile.delivery_topology.desktop.windows_native_or_wsl_placement_predecided, false);
  assert.equal(profile.delivery_topology.desktop.swift_appkit_wkwebview_product_host_allowed, false);
  assert.equal(profile.delivery_topology.desktop.platform_support_claim_allowed_before_platform_admission, false);
  assert.equal(profile.delivery_topology.headless_webui.host_technology, 'shared_node_host_core');
  assert.equal(profile.delivery_topology.headless_webui.electron_required, false);
  assert.equal(profile.delivery_topology.headless_webui.user_service_manager_source_implemented, true);
  assert.equal(profile.delivery_topology.headless_webui.installer_source_implemented, true);
  assert.equal(profile.delivery_topology.headless_webui.distribution_installer_wiring_complete, false);
  assert.equal(profile.delivery_topology.headless_webui.carrier_update_adapter_source_implemented, true);
  assert.equal(profile.delivery_topology.headless_webui.carrier_update_command_wiring_complete, false);
  assert.equal('background_service_source_implemented' in profile.delivery_topology.headless_webui, false);
  assert.equal('update_source_implemented' in profile.delivery_topology.headless_webui, false);
  assert.equal(profile.delivery_topology.headless_webui.legacy_headless_flag_semantics, 'base_only_unchanged_until_separate_migration');
  assert.equal(profile.delivery_topology.headless_webui.existing_packaged_desktop_webui_counts_as_standalone_host, false);
  assert.equal(profile.delivery_topology.docker_webui.electron_in_container_allowed, false);
  assert.equal(profile.delivery_topology.docker_webui.aioncore_in_container_allowed, false);
  assert.equal(profile.delivery_topology.docker_webui.distribution_manager_source_implemented, true);
  assert.equal(profile.delivery_topology.docker_webui.distribution_wiring_complete, false);
  assert.equal(profile.delivery_topology.docker_webui.image_update_adapter_source_implemented, true);
  assert.equal(profile.delivery_topology.docker_webui.image_update_command_wiring_complete, false);
  assert.equal(profile.delivery_topology.docker_webui.multi_arch_build_plan_source_implemented, true);
  assert.equal(profile.delivery_topology.docker_webui.multi_arch_qualification_complete, true);
  assert.equal(profile.delivery_topology.docker_webui.release_tier, 'additional_nonblocking');
  assert.equal(profile.delivery_topology.docker_webui.qualification_trigger, 'manual_non_public_qualification_or_protected_publication');
  assert.equal(profile.delivery_topology.docker_webui.included_in_pr_or_main_ci, false);
  assert.deepEqual(profile.delivery_topology.docker_webui.required_oci_platforms, ['linux/amd64', 'linux/arm64']);
  assert.deepEqual(profile.delivery_topology.docker_webui.native_runner_qualification, {
    amd64: 'ubuntu-24.04',
    arm64: 'ubuntu-24.04-arm',
    emulation_allowed_as_runtime_qualification: false,
  });
  assert.equal(profile.delivery_topology.docker_webui.signature_verification_implemented, true);
  assert.equal(profile.delivery_topology.docker_webui.security_admission_complete, true);
  assert.equal(profile.delivery_topology.docker_webui.preview_release_admission_implemented, true);
  assert.equal(profile.delivery_topology.docker_webui.release_admission_complete, false);
  assert.equal(profile.delivery_topology.docker_webui.same_renderer_host_core_and_bridge_abi_required, true);
  assert.equal(profile.delivery_topology.docker_webui.existing_aionui_container_counts_as_successor_implementation, false);
  assert.equal(profile.delivery_topology.successor_product.product_development_required, true);
  assert.equal(profile.delivery_topology.successor_product.current_mainline, false);
  assert.equal(profile.delivery_topology.successor_product.minimum_complete_product_obligation, true);
  assert.equal(profile.delivery_topology.successor_product.aionui_feature_parity_obligation, false);
  assert.equal(gui.successor_delivery_policy.renderer, 'single_deepseek_harness_derived_react_renderer');
  assert.equal(gui.successor_delivery_policy.topology_authority, false);
  assert.equal(gui.successor_delivery_policy.carrier_and_bridge_shape_source, 'contracts/app-product-profile.json#delivery_topology');
  assert.equal(gui.successor_delivery_policy.swift_appkit_wkwebview_product_host_allowed, false);
  assert.equal(profile.delivery_topology.aionui_reference.target_renderer_owner, false);
  assert.equal(profile.delivery_topology.aionui_reference.target_feature_inventory_owner, false);
  assert.deepEqual(profile.delivery_topology.minimum_complete_product.composition_model.package_contribution_slots, [
    'settings.section',
    'runtime.detail',
    'composer.palette',
  ]);
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.app_client_contribution_abi, 'opl_app_client_contributions.v1');
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.framework_host_projection_schema, 'opl_app_ui_contributions_projection.v1');
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.host_projection_graph_policy, 'allowlisted_closed_graph_from_framework_projection_only');
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.host_projection_allowlist_contract, 'contracts/opl-app-contributions.schema.json');
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.typed_slot_policy, 'mount_only_app_product_profile_declared_slots');
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.typed_action_policy, 'action_refs_only_via_canonical_app_action_bridge');
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.framework_host_composition_authority, 'one-person-lab-framework');
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.app_authority_policy, 'one-person-lab-app_owns_product_profile_gui_abi_active_shell_and_release');
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.framework_projection_runtime_status, 'framework_host_projection_active');
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.shared_transport_policy, 'framework_host_projected_typed_rpc_reads_typed_events_and_canonical_app_actions');
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.shared_product_state_semantics, true);
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.package_gui_contribution_policy, 'app_schema_admitted_declarative_only_then_framework_host_projected');
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.client_authority_policy, 'render_and_dispatch_only_no_plugin_discovery_install_registry_currentness_release_operation_task_package_or_product_truth');
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.client_cordis_graph, 'derived_from_framework_host_graph_and_app_product_profile_slot_policy');
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.client_renderer_compatibility_profile, 'client_renderer_compatibility');
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.client_renderer_switch_policy, 'explicit_adapter_selection_after_compatibility_admission_never_unverified_hot_switch');
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.brand_capability_projection_policy, 'dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client');
  assert.deepEqual(profile.delivery_topology.minimum_complete_product.composition_model.shared_shell_consumers, ['opl-aion-shell', 'opl-studio']);
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.independent_host_truth_allowed, false);
  assert.equal(profile.delivery_topology.minimum_complete_product.composition_model.second_client_composition_graph_allowed, false);
  assert.equal(profile.delivery_topology.minimum_complete_product.update_ownership.agent_packages, 'part_of_opl_packages_never_a_fourth_updater');
  assert.equal(profile.delivery_topology.minimum_complete_product.cutover_policy.strategy, 'establish_then_replace');
  assert.equal(profile.delivery_topology.minimum_complete_product.cutover_policy.aionui_remains_only_mainline_until_cutover, true);
  assert.deepEqual(profile.client_renderer_compatibility, {
    schema: 'opl_app_client_renderer_compatibility.v1',
    owner: 'one-person-lab-app',
    host_composition_authority: 'one-person-lab-framework',
    host_graph_source: 'app_state.ui_contributions',
    host_projection_schema: 'opl_app_ui_contributions_projection.v1',
    contribution_abi: 'opl_app_client_contributions.v1',
    allowlist_contract: 'contracts/opl-app-contributions.schema.json',
    typed_slots: ['settings.section', 'runtime.detail', 'composer.palette'],
    standard_view_types: ['list_detail', 'timeline', 'approval_diff', 'task_board', 'artifact_view', 'activity_log', 'service_status', 'channel_access', 'remote_companion_access'],
    transport_binding_source: 'app_state.transport_bindings',
    transport_binding_schema: 'opl_app_transport_bindings_projection.v1',
    transport_binding_migration_state: 'framework_transport_binding_projection_and_dual_shell_source_e2e_completed',
    transport_binding_event: 'opl/app-transport-bindings/updated',
    typed_state_rpc: 'opl app state --profile fast --json',
    typed_action_rpc: 'opl app action execute --action <action_id> [--payload json] [--dry-run] --json',
    typed_client_event: 'opl/app-client-contributions/updated',
    state_semantics_contract: 'contracts/app-runtime-bridge.json',
    client_authority_policy: 'render_and_dispatch_only_no_plugin_discovery_install_registry_currentness_release_operation_task_package_or_product_truth',
    switch_policy: 'explicit_adapter_selection_after_compatibility_admission_never_unverified_hot_switch',
    hot_switch_without_revalidation_allowed: false,
    brand_capability_projection_policy: 'dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client',
    app_fixed_brand_registry_allowed: false,
    client_fixed_brand_registry_allowed: false,
    display_and_allowlist_owner: 'one-person-lab-app',
  });
  assert.equal(candidates.active_shell_unchanged, 'aionui');
  const studio = candidates.candidates.find((entry) => entry.id === 'opl-studio');
  assert.ok(studio);
  assert.deepEqual(studio.carrier_evidence_contract.required_entries, [
    'electron_desktop',
    'standalone_headless_webui',
    'docker_webui',
  ]);
  assert.equal(studio.carrier_evidence_contract.candidate_only, true);
  assert.equal(studio.carrier_evidence_contract.release_authority, false);
  assert.equal(studio.carrier_evidence_contract.current_aionui_release_evidence_may_close_successor_entry, false);
  assert.deepEqual(studio.carrier_evidence_contract.preview_oci_admission, {
    schema: 'opl_studio_cloud_workspace_image_handoff.v1',
    schema_ref: 'contracts/opl-studio-cloud-workspace-image-handoff.schema.json',
    validator: 'scripts/validate-studio-cloud-handoff.ts',
    repository: 'ghcr.io/gaofeng21cn/opl-studio-webui',
    workflow_identity: 'https://github.com/gaofeng21cn/opl-studio/.github/workflows/studio-webui-preview.yml@refs/heads/main',
    oidc_issuer: 'https://token.actions.githubusercontent.com',
    required_platforms: ['linux/amd64', 'linux/arm64'],
    immutable_tags: ['v<studio_version>', 'sha-<studio_sha>'],
    channel_tag: 'preview',
    forbidden_tags: ['stable', 'latest'],
    cloud_activation_owner: 'opl-cloud',
    active_shell_adopted: false,
    release_ready: false,
  });
  assert.deepEqual(
    studio.carrier_evidence_contract.entries.electron_desktop.qualification_commands,
    [
      'npm run test:desktop',
      'npm run package:desktop',
      'npm run smoke:desktop-live',
      'npm run validate:package',
    ],
  );
  const desktopQualificationStep = parseYaml(
    fs.readFileSync(path.join(appRoot, '.github/workflows/opl-studio-candidate-carriers.yml'), 'utf8'),
  ).jobs['desktop-headless'].steps.find(
    (step: { name?: string }) => step.name === 'Build and validate Electron candidate package',
  );
  assert.ok(desktopQualificationStep);
  assert.deepEqual(
    desktopQualificationStep.run.trim().split('\n').map((line: string) => line.trim()),
    [
      'npm run package:desktop',
      'npm run smoke:desktop-live',
      'npm run validate:package',
    ],
  );
  const studioAdapter = readJson('contracts/shell-adapters/opl-studio.json');
  assert.equal(studioAdapter.delivery_topology.carrier_evidence_manifest.candidate_only, true);
  assert.equal(studioAdapter.delivery_topology.carrier_evidence_manifest.release_authority, false);
  assert.deepEqual(Object.keys(studioAdapter.delivery_topology.carrier_entries), [
    'electron_desktop',
    'standalone_headless_webui',
    'docker_webui',
  ]);
  assert.equal(release.successor_delivery_target.role, 'target_only_not_current_release_authority');
  assert.equal(release.successor_delivery_target.topology_authority, false);
  assert.equal(release.successor_delivery_target.current_release_platform_matrix_is_successor_admission_evidence, false);
  assert.equal(
    release.distribution_semantics.cohort_policy.approved_production_target.model,
    'one_app_product_multiple_independently_versioned_carriers',
  );
  assert.deepEqual(
    release.distribution_semantics.cohort_policy.approved_production_target.runtime_forms,
    ['desktop', 'container_webui'],
  );
  assert.doesNotThrow(() =>
    validateProductProfile(profile, readJson('contracts/app-install-exposure-policy.json')),
  );
});

test('delivery topology validator rejects runtime duplication, host drift, or premature platform promotion', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const mutations = [
    {
      error: /shared renderer topology/,
      mutate: (profile) => { profile.delivery_topology.shared_renderer.carrier_specific_product_forks_allowed = true; },
    },
    {
      error: /Codex-only runtime topology/,
      mutate: (profile) => { profile.delivery_topology.runtime.aioncore_allowed = true; },
    },
    {
      error: /shared Node host core topology/,
      mutate: (profile) => { profile.delivery_topology.shared_host_core.same_core_required_across_carriers = false; },
    },
    {
      error: /Electron desktop topology/,
      mutate: (profile) => { profile.delivery_topology.desktop.swift_appkit_wkwebview_product_host_allowed = true; },
    },
    {
      error: /Docker WebUI topology/,
      mutate: (profile) => { profile.delivery_topology.docker_webui.electron_in_container_allowed = true; },
    },
    {
      error: /standalone headless WebUI topology/,
      mutate: (profile) => { profile.delivery_topology.headless_webui.distribution_installer_wiring_complete = true; },
    },
    {
      error: /Docker WebUI topology/,
      mutate: (profile) => { profile.delivery_topology.docker_webui.multi_arch_qualification_complete = false; },
    },
    {
      error: /successor product policy/,
      mutate: (profile) => { profile.delivery_topology.successor_product.product_development_required = false; },
    },
    {
      error: /AionUI reference boundary/,
      mutate: (profile) => { profile.delivery_topology.aionui_reference.target_renderer_owner = true; },
    },
  ];

  for (const { error, mutate } of mutations) {
    const profile = readJson('contracts/app-product-profile.json');
    mutate(profile);
    assert.throws(() => validateProductProfile(profile, installExposure), error);
  }
});

test('Studio carrier workflow creates candidate evidence without release or publication authority', () => {
  const workflowPath = path.join(appRoot, '.github/workflows/opl-studio-candidate-carriers.yml');
  const source = fs.readFileSync(workflowPath, 'utf8');
  const workflow = parseYaml(source);

  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(workflow.jobs), [
    'resolve-studio',
    'desktop-headless',
    'docker-webui',
    'validate-manifest',
  ]);
  assert.match(source, /opl-studio-carrier-evidence-manifest\.json/);
  assert.match(source, /standalone-headless-webui\.tgz/);
  assert.doesNotMatch(source, /headless-index\.html/);
  assert.match(source, /release_authority: false/);
  for (const forbidden of ['git push', 'docker push', 'gh release', 'npm publish', 'packages: write']) {
    assert.equal(source.includes(forbidden), false, `candidate workflow must not contain ${forbidden}`);
  }
});
