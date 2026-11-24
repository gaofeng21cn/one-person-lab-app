import { assertDeepEqualJson } from '../assertions.ts';
import {
  validateArtifactNativeDrilldownProjectionContract,
  validateArtifactProvenanceBundleProjectionContract,
  validateAgentAvailabilityProjectionContract,
  validateOpenScienceConsoleProjectionContract,
  validateProviderReadinessRepairProjectionContract,
  validateProgressDeltaDisplayContract,
  validateProjectProgressDisplayContract,
  validateRefLevelFollowUpProjectionContract,
  validateStageRunCockpitProjectionContract,
  validateStateIndexSidecarProjectionContract,
  validateStructuredResultPanelProjectionContract,
  validateWorkflowSkillCandidateProjectionContract,
  validateWorkItemProjectionContract,
} from '../shared-contract-validators.ts';
import {
  runtimeBridgePackageDirectoryEntryFields,
  runtimeBridgeProjectedActionFields,
} from './app-state.ts';

export function validateRuntimeBridgeProjectionContracts(runtimeBridge) {
  validateWorkItemProjectionContract(
    runtimeBridge.work_item_projection,
    'Runtime bridge WorkItemProjection',
  );
  validateAgentAvailabilityProjectionContract(
    runtimeBridge.agent_availability_projection,
    'Runtime bridge agent availability projection',
  );
  validateProjectProgressDisplayContract(runtimeBridge.project_progress_projection, 'Runtime bridge project progress projection');
  validateProgressDeltaDisplayContract(
    runtimeBridge.progress_delta_projection,
    'Runtime bridge progress delta projection',
  );
  validateProviderReadinessRepairProjectionContract(
    runtimeBridge.provider_readiness_repair_projection,
    'Runtime bridge provider readiness repair projection',
  );
  validateStateIndexSidecarProjectionContract(
    runtimeBridge.state_index_sidecar_projection,
    'Runtime bridge State Index sidecar projection',
  );
  validateArtifactNativeDrilldownProjectionContract(
    runtimeBridge.artifact_native_drilldown_projection,
    'Runtime bridge Stage Artifact drilldown projection',
    { requireProvenanceBundle: true },
  );
  validateArtifactProvenanceBundleProjectionContract(
    runtimeBridge.artifact_provenance_bundle_projection,
    'Runtime bridge Artifact Provenance Bundle projection',
  );
  validateStructuredResultPanelProjectionContract(
    runtimeBridge.structured_result_panel_projection,
    'Runtime bridge structured result panel projection',
  );
  validateRefLevelFollowUpProjectionContract(
    runtimeBridge.ref_level_follow_up_projection,
    'Runtime bridge ref-level follow-up projection',
  );
  validateWorkflowSkillCandidateProjectionContract(
    runtimeBridge.workflow_skill_candidate_projection,
    'Runtime bridge workflow/skill candidate projection',
  );
  validateOpenScienceConsoleProjectionContract(
    runtimeBridge.openscience_console_projection,
    'Runtime bridge OpenScience Console projection',
  );
  validateStageRunCockpitProjectionContract(
    runtimeBridge.stage_run_cockpit_projection,
    'Runtime bridge StageRun cockpit projection',
  );
  const advancedOperator = runtimeBridge.advanced_operator_drilldown;
  if (
    advancedOperator?.command !== 'opl runtime app-operator-drilldown --json'
    || advancedOperator.runtime_page_allowed !== false
  ) {
    throw new Error('Runtime bridge operator drilldown must stay outside Runtime');
  }
  assertDeepEqualJson(
    advancedOperator.consumer_surfaces,
    ['/settings/environment?section=diagnostics', 'release_evidence_tooling'],
    'Runtime bridge operator drilldown consumer surfaces',
  );
  if (
    runtimeBridge.running_task_projection?.consumer_surface !== '/settings/environment?section=diagnostics'
    || runtimeBridge.running_task_projection.runtime_page_visible !== false
  ) {
    throw new Error('Runtime bridge provider-attempt projection must be Maintenance diagnostics only');
  }
}

export function validatePackageReadinessProjection(runtimeBridge) {
  const rows = runtimeBridge.canonical_state_display_action_map?.rows;
  const runtimeRow = Array.isArray(rows) ? rows.find((row) => row?.semantic_area === 'runtime') : null;
  const packageRow = Array.isArray(rows) ? rows.find((row) => row?.semantic_area === 'package') : null;
  const nativeShellRole = runtimeBridge.canonical_state_display_action_map?.shells?.opl_studio?.role;
  if (
    runtimeRow?.route_classification !== 'core_dynamic_agent_runtime'
    || runtimeRow.producer_required !== true
    || runtimeRow.active_shell_route_required !== true
    || runtimeRow.adopted_shell_route_required !== true
    || runtimeRow?.canonical_source !==
      'opl app state --profile fast --json#app_state.operator.workbench.work_item_projection_v2'
    || runtimeRow.studio_display_role !==
      'WorkItem status, Stage, Attempt, Token, next action, and archive/restore'
    || runtimeRow.workbench_display_role !== 'core Runtime consumer required in the active shell'
    || nativeShellRole !== 'active_release_shell_thin_display_consumer'
  ) {
    throw new Error('Runtime bridge canonical Runtime row must preserve the Framework producer and require the core route in every adopted shell');
  }
  assertDeepEqualJson(
    runtimeRow.allowed_action_refs,
    ['work_item_visibility_set'],
    'Runtime bridge canonical Runtime actions',
  );
  if (
    runtimeRow.fallback_policy?.allowed_fallback_source !== 'selected item from work_item_projection_v2'
    || runtimeRow.fallback_policy.allowed_when !== 'selected work item core detail only'
    || runtimeRow.fallback_policy.operator_drilldown_allowed !== false
  ) {
    throw new Error('Runtime bridge canonical Runtime fallback must remain selected-item-only');
  }
  const advancedDetail = runtimeBridge.canonical_state_display_action_map?.advanced_detail_surface;
  if (
    advancedDetail?.command !== 'opl runtime app-operator-drilldown --detail full --json'
    || advancedDetail.runtime_page_allowed !== false
  ) {
    throw new Error('Runtime bridge advanced detail must stay outside Runtime');
  }
  assertDeepEqualJson(
    advancedDetail.consumer_surfaces,
    ['/settings/environment?section=diagnostics', 'release_evidence_tooling'],
    'Runtime bridge advanced detail consumer surfaces',
  );
  if (
    packageRow?.canonical_source !==
    'opl app state --profile fast --json#app_state.agent_packages.directory.entries + app_state.agent_packages.status_index + app_state.runtime_source_carriers.items[]'
  ) {
    throw new Error('Runtime bridge package rows must use directory.entries as collection truth plus diagnostic enrichments');
  }
  assertDeepEqualJson(
    packageRow?.required_projection_fields?.['directory.entries[]'],
    runtimeBridgePackageDirectoryEntryFields,
    'Runtime bridge Package directory entry fields',
  );
  assertDeepEqualJson(
    packageRow?.required_projection_fields?.['directory.entries[].available_actions[]'],
    runtimeBridgeProjectedActionFields,
    'Runtime bridge projected Settings action fields',
  );
  assertDeepEqualJson(
    packageRow?.required_projection_fields?.['status_index.packages[package_id]'],
    ['presence', 'dependent_guard', 'capability_exposure', 'runtime_source_readiness', 'status_read_error'],
    'Runtime bridge Package diagnostic join fields',
  );
  assertDeepEqualJson(
    packageRow?.optional_enrichment_fields?.['runtime_source_carriers.items[package_id]'],
    ['source_origin', 'source_policy', 'git'],
    'Runtime bridge optional active source diagnostic fields',
  );
  if (
    packageRow?.settings_action_source !== 'app_state.agent_packages.directory.entries[].available_actions[]'
    || packageRow.action_id_allowlist_allowed !== false
    || packageRow.shell_action_inference_allowed !== false
    || Object.hasOwn(packageRow, 'allowed_action_refs')
    || Object.hasOwn(packageRow, 'framework_stage_runtime_internal_action_refs')
    || Object.hasOwn(packageRow, 'agent_package_activation_contract')
  ) {
    throw new Error('Runtime bridge Package rows must consume generic projected Settings actions without private action authority');
  }
  if (
    !packageRow?.projection_authority_policy?.includes('directory.entries owns catalog membership')
    || !packageRow.projection_authority_policy.includes('cannot override directory lifecycle, readiness, or action availability')
    || packageRow?.fallback_policy?.manageable_collection_fallback !== null
    || packageRow?.fallback_policy?.can_define_collection_membership !== false
    || packageRow?.fallback_policy?.can_define_actions !== false
    || packageRow?.fallback_policy?.canonical_directory_absent_policy !==
      'show loading, empty, last-good stale, or failed without synthesizing rows or actions'
  ) {
    throw new Error('Runtime bridge package projection must keep directory entries and actions authoritative without a fallback collection');
  }
  if (
    Object.hasOwn(packageRow?.required_projection_fields ?? {}, 'directory.installed_packages[]')
    || Object.hasOwn(packageRow?.optional_enrichment_fields ?? {}, 'status_index.packages[package_id]')
  ) {
    throw new Error('Runtime bridge package projection must not retain installed_packages or demote canonical status-index diagnostics to optional legacy enrichment');
  }
}
