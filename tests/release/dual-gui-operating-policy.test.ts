import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  readAppShellAdapterContract,
  resolveClientRendererAdmission,
} from '../../scripts/app-shell-adapter.ts';
import { appOwnedOplStandardAgentMembershipPolicy } from '../../scripts/validate-active-shell/app-contract-constants.ts';
import { validateRuntimeBridgeContract } from '../../scripts/validate-active-shell/runtime-bridge-validator.ts';
import { validateMinimumCompleteProductContract } from '../../scripts/validate-shell-candidates/candidate-contract.ts';
import {
  validateRegistryShape,
  validateShellTransitionPolicy,
} from '../../scripts/validate-shell-candidates/registry.ts';
import type {
  ShellCandidateRegistry,
  ShellTransitionPolicy,
} from '../../scripts/validate-shell-candidates/types.ts';

const readJson = <T>(relativePath: string): T => JSON.parse(fs.readFileSync(relativePath, 'utf8')) as T;

test('Studio minimum-complete baseline keeps core switching outcomes and explicitly defers the dedicated Git workbench and Cron', () => {
  const profile = readJson<any>('contracts/app-product-profile.json');
  const baseline = profile.delivery_topology.minimum_complete_product;
  assert.doesNotThrow(() => validateMinimumCompleteProductContract(baseline));
  assert.equal(baseline.features.length, 27);
  assert.equal(baseline.features.find((feature: any) => feature.feature_id === 'B0-08').cutover_blocking, false);
  assert.equal(baseline.features.find((feature: any) => feature.feature_id === 'B0-07').capability_id, 'workspace_file_browse_search_and_external_open_or_download');

  const missingFeature = structuredClone(baseline);
  missingFeature.features = missingFeature.features.filter((feature: any) => feature.feature_id !== 'B0-08');
  assert.throws(
    () => validateMinimumCompleteProductContract(missingFeature),
    /each B0, R1, and U1 feature exactly once/,
  );

  const duplicateFeature = structuredClone(baseline);
  duplicateFeature.features[1].feature_id = 'B0-01';
  assert.throws(
    () => validateMinimumCompleteProductContract(duplicateFeature),
    /each B0, R1, and U1 feature exactly once/,
  );

  const deferredRequiredFeature = structuredClone(baseline);
  deferredRequiredFeature.features.find((feature: any) => feature.feature_id === 'R1-01').disposition = 'deferred';
  assert.throws(
    () => validateMinimumCompleteProductContract(deferredRequiredFeature),
    /R1-01 must remain required/,
  );

  const weakenedBackgroundContinuity = structuredClone(baseline);
  weakenedBackgroundContinuity.features
    .find((feature: any) => feature.feature_id === 'B0-12')
    .components.find((component: any) => component.id === 'background_turn_continuity')
    .cutover_blocking = false;
  assert.throws(
    () => validateMinimumCompleteProductContract(weakenedBackgroundContinuity),
    /background_turn_continuity must remain required and cutover-blocking/,
  );

  const substitutedEvidence = structuredClone(baseline);
  substitutedEvidence.evidence_axes.required.splice(3, 1);
  assert.throws(
    () => validateMinimumCompleteProductContract(substitutedEvidence),
    /evidence axes must be complete, ordered, owner-backed, and non-substitutable/,
  );
});

test('dual GUI launcher selection stays separate from release adoption', () => {
  const registry = readJson<ShellCandidateRegistry>('contracts/app-shell-candidates.json');
  assert.doesNotThrow(() => validateRegistryShape(registry));

  const invalid = structuredClone(registry);
  invalid.interactive_launcher_policy.selection_mutates_release_adoption = true;
  assert.throws(
    () => validateRegistryShape(invalid),
    /selection_mutates_release_adoption must remain false/,
  );

  const removedTarget = structuredClone(registry);
  removedTarget.interactive_launcher_policy.selectable_shells.push('removed-shell');
  assert.throws(
    () => validateRegistryShape(removedTarget),
    /selectable_shells must be exactly the active mainline and foreground alternative/,
  );

  const candidateDetailDrift = structuredClone(registry);
  const native = candidateDetailDrift.candidates.find((candidate) => candidate.id === 'opl-studio');
  assert.ok(native);
  native.required_capabilities = [];
  native.dsh_source_reuse_contract!.default_model = 'candidate-only-drift';
  assert.doesNotThrow(() => validateRegistryShape(candidateDetailDrift));
});

test('shell transition preserves the active App identity and uses an exact Preview handoff', () => {
  const release = readJson<{ shell_transition_policy: ShellTransitionPolicy }>('contracts/app-release-channel.json');
  const policy = release.shell_transition_policy;
  assert.doesNotThrow(() => validateShellTransitionPolicy(policy));

  const previewImpersonatesActive = structuredClone(policy);
  previewImpersonatesActive.identities.studio_preview.release_repository =
    previewImpersonatesActive.identities.active_app.release_repository;
  assert.throws(
    () => validateShellTransitionPolicy(previewImpersonatesActive),
    /Studio Preview must retain an isolated identity and repository/,
  );

  const databaseCopy = structuredClone(policy);
  databaseCopy.state_continuity.shell_local_migration.direct_database_copy_allowed = true;
  assert.throws(
    () => validateShellTransitionPolicy(databaseCopy),
    /shell-local migration must stay allowlisted, versioned, idempotent, recoverable, and secret-free/,
  );

  const prematurePreviewCleanup = structuredClone(policy);
  prematurePreviewCleanup.upgrade_routes.studio_preview_to_target
    .preview_cleanup_requires_successful_target_launch_migration_and_owner_readback = false;
  assert.throws(
    () => validateShellTransitionPolicy(prematurePreviewCleanup),
    /Studio Preview route must use an exact signed handoff/,
  );

  const bridgeOnly = structuredClone(policy);
  bridgeOnly.upgrade_routes.aionui_mainline_to_target
    .intermediate_aionui_bridge_release_required_for_correctness = true;
  assert.throws(
    () => validateShellTransitionPolicy(bridgeOnly),
    /AionUI route must be a direct in-place update/,
  );
});

test('explicit Studio adapter keeps its candidate implementation role', () => {
  const contract = readAppShellAdapterContract('contracts/shell-adapters/opl-studio.json');
  const admission = resolveClientRendererAdmission(contract);

  const adapter = readJson<any>('contracts/shell-adapters/opl-studio.json');
  assert.equal(
    adapter.gui_authority.implementation_role,
    'foreground_alternative_candidate_implementation_carrier',
  );
  assert.deepEqual(admission && {
    rendererId: admission.rendererId,
    status: admission.status,
    selectionMode: admission.selectionMode,
  }, {
    rendererId: 'opl-studio',
    status: 'candidate_validation_only_not_active_shell_admitted',
    selectionMode: 'candidate_validation_only',
  });
  assert.equal(admission?.compatibility.hot_switch_without_revalidation_allowed, false);
});

test('retired Hermes and AGUI GUI candidate chains stay physically absent', () => {
  const registry = readJson<ShellCandidateRegistry>('contracts/app-shell-candidates.json');
  assert.deepEqual(registry.candidates.map((candidate) => candidate.id), ['opl-studio']);
  for (const retiredField of ['archived_reason', 'default_update_policy', 'role_tombstone', 'replay']) {
    const restoredField = structuredClone(registry) as any;
    restoredField.candidates[0][retiredField] = 'restored';
    assert.throws(
      () => validateRegistryShape(restoredField),
      new RegExp(`must not declare retired candidate field ${retiredField}`),
    );
  }
  for (const retiredPath of [
    'contracts/shell-adapters/hermes-codex.json',
    'contracts/shell-adapters/agui-codex.json',
    'scripts/validate-hermes-candidate.ts',
    'scripts/smoke-hermes-candidate-tart.ts',
    'docs/product/shell-alternatives/hermes-first-run-flow.md',
    'docs/product/shell-alternatives/hermes-gui-adaptation-plan.md',
    'docs/history/shell-candidates/agui-codex-candidate-verification.md',
  ]) {
    assert.equal(fs.existsSync(retiredPath), false, `${retiredPath} must stay retired`);
  }
  const packageScripts = readJson<{ scripts: Record<string, string> }>('package.json').scripts;
  assert.equal(packageScripts['validate:candidate:agui'], undefined);
});

test('DeepSeek Harness Application Host and full GUI reuse stay Studio-only while AionUI gets only the bounded visual cohort', () => {
  const registry = readJson<ShellCandidateRegistry>('contracts/app-shell-candidates.json');
  const reference = registry.design_references?.find(({ id }) => id === 'deepseek-harness');
  const visualCohort = readJson<any>('contracts/app-gui-visual-source-cohort.json');
  const governance = (registry as any).design_system_governance;

  assert.equal(reference?.evaluated_ref, 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e');
  assert.equal(reference?.license, 'MIT');
  assert.equal(reference?.source_usage, 'approved_application_host_runtime_and_gui_source_reuse');
  assert.equal(reference?.adopted_packages['@deepseek-ai/dsh-app-boot'], '0.1.1-rc.2');
  assert.equal(reference?.adopted_packages['@deepseek-ai/dsh-client-ui-slots'], '0.1.1-rc.2');
  assert.equal(reference?.adopted_packages['@deepseek-ai/dsh-invariants'], '0.1.1-rc.2');
  assert.equal(reference?.adopted_packages['@deepseek-ai/dsh-client-web-react'], undefined);
  assert.equal(reference?.adopted_packages['use-sync-external-store'], '1.2.0');
  assert.equal(reference?.adopted_source?.root, 'src/vendor/deepseek-harness');
  assert.equal(reference?.adopted_source?.path_policy, 'preserve_upstream_package_relative_paths');
  assert.ok(reference?.adopted_source?.files.includes('packages/client/ui-layout/src/client/AppFrame.tsx'));
  assert.ok(reference?.adopted_source?.files.includes('packages/client/ui-sidebar/src/client/SidebarRoot.tsx'));
  assert.ok(reference?.adopted_source?.files.includes('packages/client/ui-conversation/src/client/skeleton/InputBar.tsx'));
  assert.ok(reference?.adopted_source?.files.includes('packages/client/ui-settings-general/src/client/SettingsRoot.tsx'));
  assert.ok(reference?.adopted_source?.files.includes('packages/client/ui-theme/src/styles/design-platform.css'));
  assert.ok(reference?.adopted_source?.files.includes('packages/client/ui-renderer/src/client/scoped-slots.tsx'));
  assert.equal(reference?.adopted_source?.package_roots.length, 11);
  assert.equal(reference?.upstream_intake?.floating_ref_allowed, false);
  assert.equal(reference?.upstream_intake?.automatic_promotion_allowed, false);
  assert.equal(visualCohort.upstream.commit, '47f943859bef60e4160492346772ded9b24f765a');
  assert.notEqual(visualCohort.upstream.commit, reference?.evaluated_ref);
  assert.deepEqual(visualCohort.phase_one_surfaces, [
    'titlebar',
    'navigation_rail',
    'home',
    'composer',
    'settings_navigation',
  ]);
  assert.equal(governance.visual_source.cohort, 'contracts/app-gui-visual-source-cohort.json');
  assert.equal(
    governance.interaction_reference.comparison_baseline,
    'historical ChatGPT Codex macOS workflow and spatial interaction observation',
  );
  assert.doesNotThrow(() => validateRegistryShape(registry));

  const privateFork = structuredClone(registry);
  const privateForkReference = privateFork.design_references?.find(({ id }) => id === 'deepseek-harness');
  assert.ok(privateForkReference?.upstream_intake);
  privateForkReference.upstream_intake.opl_delta_policy = 'edit_vendor_files_in_place';
  assert.throws(
    () => validateRegistryShape(privateFork),
    /DeepSeek Harness upstream_intake/,
  );

  const secondShell = structuredClone(registry);
  const driftedReference = secondShell.design_references?.find(({ id }) => id === 'deepseek-harness');
  assert.ok(driftedReference);
  driftedReference.opl_mapping = driftedReference.opl_mapping.filter(
    (item) => !item.startsWith('OPL Studio runs the complete pinned DeepSeek Harness Application Host'),
  );
  assert.throws(
    () => validateRegistryShape(secondShell),
    /DeepSeek Harness opl_mapping must include OPL Studio runs the complete pinned DeepSeek Harness Application Host/,
  );

  const runtimeTakeover = structuredClone(registry);
  const takeoverReference = runtimeTakeover.design_references?.find(({ id }) => id === 'deepseek-harness');
  assert.ok(takeoverReference);
  takeoverReference.forbidden_reuse = takeoverReference.forbidden_reuse.filter(
    (item) => !item.startsWith('do not create a second OPL Package registry'),
  );
  assert.throws(
    () => validateRegistryShape(runtimeTakeover),
    /DeepSeek Harness forbidden_reuse must include do not create a second OPL Package registry/,
  );
});

test('Framework transport binding projection and renderer-specific Weixin routes stay separate', () => {
  const gui = readJson<any>('contracts/app-gui-product-contract.json');
  const profile = readJson<any>('contracts/app-product-profile.json');
  const runtimeBridge = readJson<any>('contracts/app-runtime-bridge.json');
  const activeAdapter = readJson<any>('contracts/app-shell-adapter.json');
  const registry = readJson<ShellCandidateRegistry>('contracts/app-shell-candidates.json');
  const studio = registry.candidates.find((candidate) => candidate.id === 'opl-studio');

  assert.equal(
    gui.framework_surfaces.package_app_contributions.standard_view_contracts.channel_access.runtime_status,
    'aionui_builtin_source_path_present_successor_package_source_and_host_path_present_each_requires_its_own_installed_live_e2e',
  );
  assert.equal(
    gui.framework_surfaces.package_app_contributions.standard_view_contracts.channel_access.migration_state,
    'renderer_specific_activation_selected_aionui_keeps_aioncore_and_successor_uses_app_owned_provider_package',
  );
  assert.equal(
    gui.framework_surfaces.package_app_contributions.standard_view_contracts.remote_companion_access.renderer_activation_policy.aionui
      .framework_projected_remote_companion_access_rendering_allowed,
    true,
  );
  assert.ok(profile.client_renderer_compatibility.standard_view_types.includes('channel_access'));
  assert.ok(profile.client_renderer_compatibility.standard_view_types.includes('remote_companion_access'));
  assert.equal(profile.client_renderer_compatibility.transport_binding_source, 'app_state.transport_bindings');
  assert.equal(
    profile.client_renderer_compatibility.transport_binding_migration_state,
    'framework_transport_binding_projection_and_dual_shell_source_e2e_completed',
  );
  assert.equal(
    runtimeBridge.canonical_conversation_continuity_policy.transport_binding_projection
      .projection_runtime_status,
    'current_framework_projection_proven',
  );
  assert.equal(
    'temporary_legacy_fallback' in
      runtimeBridge.canonical_conversation_continuity_policy.transport_binding_projection,
    false,
  );
  assert.equal(
    runtimeBridge.canonical_conversation_continuity_policy.transport_binding_projection
      .cached_canonical_thread_id_binding_inference_allowed,
    false,
  );
  assert.equal(
    activeAdapter.channel_thread_binding_boundary.implementation_status,
    'framework_projection_consumer_without_cached_conversation_binding_source_e2e_completed',
  );
  assert.ok(studio?.required_capabilities.includes('channel_access_standard_view'));
  assert.ok(studio?.required_capabilities.includes('remote_companion_access_standard_view'));
  assert.ok(studio?.required_capabilities.includes('framework_transport_bindings_projection'));
});

test('dual GUI runtime parity admits compatible capabilities and treats exact source identity as provenance', () => {
  const runtimeBridge = readJson<any>('contracts/app-runtime-bridge.json');
  const activeAdapter = readJson<any>('contracts/app-shell-adapter.json');
  const target = runtimeBridge.command_resolution_policy.shared_gui_target;
  const policy = runtimeBridge.shared_gui_runtime_resolution_policy;
  const nativeAgentLaunch = runtimeBridge.native_minimum_product_bridge.agent_conversation_launch;

  assert.doesNotThrow(() => validateRuntimeBridgeContract(runtimeBridge, activeAdapter));
  assert.equal(nativeAgentLaunch.catalog_source, 'app_state.agent_packages.directory.entries');
  assert.deepEqual(
    nativeAgentLaunch.opl_standard_agent_membership_policy,
    appOwnedOplStandardAgentMembershipPolicy,
  );
  const sourceMarkerMembershipDrift = structuredClone(runtimeBridge);
  sourceMarkerMembershipDrift.native_minimum_product_bridge.agent_conversation_launch
    .opl_standard_agent_membership_policy.ownership_match_policy =
      'source_explanation.kind_equals_first_party_framework_projection';
  assert.throws(
    () => validateRuntimeBridgeContract(sourceMarkerMembershipDrift, activeAdapter),
    /Native standard Agent membership policy/,
  );
  assert.equal('same_cohort_runtime_identity_required_for_parity' in policy, false);
  assert.equal(policy.parity_admission_basis, 'compatible_runtime_capability_and_versioned_schema_range');
  assert.equal(policy.exact_runtime_identity_equality_may_gate_install_or_runtime, false);
  assert.equal(policy.runtime_identity_owner, 'gaofeng21cn/opl-aion-shell');
  assert.equal(policy.same_physical_runtime_currently_claimed, true);
  assert.equal(
    policy.implementation_status,
    'source_identity_binding_and_full_standard_finder_evidence_complete',
  );
  assert.deepEqual(
    policy.runtime_identity_contract.required_fields,
    [
      'path',
      'realpath',
      'version',
      'sha256',
      'codex_home',
      'runtime_key',
      'runtime_cohort_ref',
      'carrier.producer_manifest_sha256',
      'carrier.projection_manifest_sha256',
    ],
  );
  assert.deepEqual(
    policy.packaged_evidence_contract.required_run_ids,
    ['full_clean_install_finder', 'standard_update_after_full_finder'],
  );
  assert.equal(policy.runtime_identity_contract.aioncore_modification_required, false);
  assert.equal(policy.runtime_identity_contract.aioncore_native_readback_required, false);
  assert.equal(policy.runtime_identity_contract.aioncore_native_readback_claim_allowed, false);
  assert.equal(policy.packaged_evidence_contract.referenced_file_sha256_required, true);
  assert.equal(policy.packaged_evidence_contract.artifact_trigger_status, 'complete');
  assert.equal(
    policy.packaged_evidence_contract.evidence_receipt,
    'docs/delivery/release-evidence/issue-122-codex-runtime-identity-v26.8.1-r5.json',
  );
  assert.deepEqual(
    target.compatibility_requirements.map(({ component_id, capability_id, schema_range }: any) => ({
      component_id,
      capability_id,
      schema_range,
    })),
    [
      { component_id: 'opl_framework', capability_id: 'opl_app_state_fast', schema_range: '>=1 <2' },
      { component_id: 'opl_framework', capability_id: 'opl_app_action_execute', schema_range: '>=1 <2' },
      { component_id: 'codex_cli', capability_id: 'codex_app_server', schema_range: '>=1 <2' },
    ],
  );
  assert.deepEqual(
    target.observational_build_provenance.fields,
    ['opl_path', 'opl_version', 'codex_path', 'codex_version', 'runtime_cohort_ref'],
  );
  assert.equal(target.observational_build_provenance.may_gate_install_or_runtime, false);

  const hostPathOnly = structuredClone(runtimeBridge);
  hostPathOnly.shared_gui_runtime_resolution_policy.host_path_only_resolution_can_prove_parity = true;
  assert.throws(
    () => validateRuntimeBridgeContract(hostPathOnly, activeAdapter),
    /host_path_only_resolution_can_prove_parity must be false/,
  );

  const sameCohortGate = structuredClone(runtimeBridge);
  sameCohortGate.shared_gui_runtime_resolution_policy.same_cohort_runtime_identity_required_for_parity = true;
  assert.throws(
    () => validateRuntimeBridgeContract(sameCohortGate, activeAdapter),
    /must not retain the same_cohort_runtime_identity_required_for_parity gate/,
  );

  const exactIdentityGate = structuredClone(runtimeBridge);
  exactIdentityGate.shared_gui_runtime_resolution_policy.exact_runtime_identity_equality_may_gate_install_or_runtime =
    true;
  assert.throws(
    () => validateRuntimeBridgeContract(exactIdentityGate, activeAdapter),
    /exact_runtime_identity_equality_may_gate_install_or_runtime must be false/,
  );

  const unknownRequirement = structuredClone(runtimeBridge);
  unknownRequirement.command_resolution_policy.shared_gui_target.compatibility_requirements[0].kind =
    'exact_component_identity';
  assert.throws(
    () => validateRuntimeBridgeContract(unknownRequirement, activeAdapter),
    /compatibility requirement kind exact_component_identity is unsupported/,
  );

  const provenanceGate = structuredClone(runtimeBridge);
  provenanceGate.command_resolution_policy.shared_gui_target.observational_build_provenance.may_gate_install_or_runtime =
    true;
  assert.throws(
    () => validateRuntimeBridgeContract(provenanceGate, activeAdapter),
    /observational build provenance may_gate_install_or_runtime must be false/,
  );

  const inventedAionCoreReadback = structuredClone(runtimeBridge);
  inventedAionCoreReadback.shared_gui_runtime_resolution_policy.runtime_identity_contract
    .aioncore_native_readback_claim_allowed = true;
  assert.throws(
    () => validateRuntimeBridgeContract(inventedAionCoreReadback, activeAdapter),
    /aioncore_native_readback_claim_allowed must be false/,
  );

  const missingArtifactRun = structuredClone(runtimeBridge);
  missingArtifactRun.shared_gui_runtime_resolution_policy.packaged_evidence_contract.required_run_ids = [
    'full_clean_install_finder',
  ];
  assert.throws(
    () => validateRuntimeBridgeContract(missingArtifactRun, activeAdapter),
    /packaged evidence runs/,
  );
});

test('Runtime keeps its Framework producer and is required for every adopted shell', () => {
  const runtimeBridge = readJson<any>('contracts/app-runtime-bridge.json');
  const activeAdapter = readJson<any>('contracts/app-shell-adapter.json');
  const runtimeRow = runtimeBridge.canonical_state_display_action_map.rows.find(
    (row: any) => row.semantic_area === 'runtime',
  );

  assert.equal(runtimeRow.route_classification, 'core_dynamic_agent_runtime');
  assert.equal(runtimeRow.producer_required, true);
  assert.equal(runtimeRow.aionui_route_required, true);
  assert.equal(runtimeRow.adopted_shell_route_required, true);
  assert.equal(
    runtimeBridge.canonical_state_display_action_map.shells.opl_studio.role,
    'foreground_candidate_must_implement_core_runtime_before_adoption',
  );
  assert.doesNotThrow(() => validateRuntimeBridgeContract(runtimeBridge, activeAdapter));

  const weakenedProducer = structuredClone(runtimeBridge);
  weakenedProducer.canonical_state_display_action_map.rows.find(
    (row: any) => row.semantic_area === 'runtime',
  ).producer_required = false;
  assert.throws(
    () => validateRuntimeBridgeContract(weakenedProducer, activeAdapter),
    /preserve the Framework producer/,
  );
});

test('dual GUI conversation continuity rejects shell-owned thread history', () => {
  const runtimeBridge = readJson<any>('contracts/app-runtime-bridge.json');
  const activeAdapter = readJson<any>('contracts/app-shell-adapter.json');
  const invalid = structuredClone(runtimeBridge);
  invalid.canonical_conversation_continuity_policy.shell_can_own_thread_history = true;

  assert.throws(
    () => validateRuntimeBridgeContract(invalid, activeAdapter),
    /shell_can_own_thread_history must be false/,
  );
});

test('dual GUI conversation continuity stores one-time affinity as versioned UI metadata keyed by canonical thread', () => {
  const runtimeBridge = readJson<any>('contracts/app-runtime-bridge.json');
  const activeAdapter = readJson<any>('contracts/app-shell-adapter.json');
  assert.doesNotThrow(() => validateRuntimeBridgeContract(runtimeBridge, activeAdapter));

  const policy = runtimeBridge.canonical_conversation_continuity_policy.directory_group_policy
    .project_adoption_policy;
  assert.equal(policy.canonical_project_id_assignment_allowed, false);
  assert.equal(policy.canonical_project_id_exact_readback_required, false);
  assert.equal(policy.versioned_ui_affinity_writeback_allowed, true);
  assert.equal(policy.versioned_ui_affinity_exact_thread_id_readback_required, true);
  assert.equal(policy.recorded_runtime_cwd_preservation_required, true);
  assert.equal(policy.recorded_runtime_cwd_blocks_assignment, false);
  assert.equal(policy.runtime_workspace_roots_mutation_allowed, false);
  assert.equal(policy.private_pending_deferred_revision_state_allowed, false);
  assert.equal(
    policy.core_workspace_application,
    'thread_read_exact_canonical_thread_id_then_versioned_ui_metadata_projection_without_app_server_project_id_writeback',
  );
  assert.equal(
    policy.turn_or_command_pwd_requirement,
    'never_used_for_project_affinity_eligibility_or_ui_metadata_readback',
  );
  assert.equal(policy.transport, 'single_active_codex_app_server_adapter_plus_versioned_ui_metadata_store');
  assert.equal(
    runtimeBridge.canonical_conversation_continuity_policy.required_operations.includes('thread/settings/update'),
    false,
  );

  const invalid = structuredClone(runtimeBridge);
  invalid.canonical_conversation_continuity_policy.directory_group_policy
    .project_adoption_policy.bound_session_reassignment_allowed = true;

  assert.throws(
    () => validateRuntimeBridgeContract(invalid, activeAdapter),
    /Canonical conversation directory group policy/,
  );

  const missingUiThreadReadback = structuredClone(runtimeBridge);
  missingUiThreadReadback.canonical_conversation_continuity_policy.directory_group_policy
    .project_adoption_policy.versioned_ui_affinity_exact_thread_id_readback_required = false;

  assert.throws(
    () => validateRuntimeBridgeContract(missingUiThreadReadback, activeAdapter),
    /Canonical conversation directory group policy/,
  );

  const mutatesRecordedCwd = structuredClone(runtimeBridge);
  mutatesRecordedCwd.canonical_conversation_continuity_policy.directory_group_policy
    .project_adoption_policy.recorded_runtime_cwd_preservation_required = false;

  assert.throws(
    () => validateRuntimeBridgeContract(mutatesRecordedCwd, activeAdapter),
    /Canonical conversation directory group policy/,
  );

  const missingCanonicalRead = structuredClone(runtimeBridge);
  missingCanonicalRead.canonical_conversation_continuity_policy.required_operations =
    missingCanonicalRead.canonical_conversation_continuity_policy.required_operations.filter(
      (operation: string) => operation !== 'thread/read',
    );

  assert.throws(
    () => validateRuntimeBridgeContract(missingCanonicalRead, activeAdapter),
    /Canonical conversation continuity operations/,
  );
});

test('runtime bridge rejects a reintroduced managed Worktree handoff policy', () => {
  const runtimeBridge = readJson<any>('contracts/app-runtime-bridge.json');
  const activeAdapter = readJson<any>('contracts/app-shell-adapter.json');
  const invalid = structuredClone(runtimeBridge);
  invalid.codex_local_worktree_handoff_policy = {
    bridge_role: 'state_authority',
    state_authority: 'shell_owned_git_and_thread_store',
  };

  assert.throws(
    () => validateRuntimeBridgeContract(invalid, activeAdapter),
    /must not own a Local or Worktree handoff policy/,
  );
});
