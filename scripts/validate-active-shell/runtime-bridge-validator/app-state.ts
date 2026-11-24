import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';
import { forbiddenAuthorityOwners } from '../app-contract-constants.ts';
import { assertFile, commandMaxBuffer, root } from '../validation-config.ts';
import { lookupPath } from '../value-helpers.ts';
import {
  validateArtifactNativeDrilldownFixture,
  validateArtifactNativeDrilldownProjectionContract,
  validateArtifactProvenanceBundleProjectionContract,
  validateAgentAvailabilityProjectionContract,
  validateOpenScienceAcceptedItemsFixture,
  validateOpenScienceConsoleProjectionContract,
  validateProviderReadinessRepairProjectionContract,
  validateProgressDeltaDisplayContract,
  validateProjectProgressDisplayContract,
  validateRefLevelFollowUpProjectionContract,
  validateStageRunCockpitFixture,
  validateStageRunCockpitProjectionContract,
  validateStateIndexSidecarFixture,
  validateStateIndexSidecarProjectionContract,
  validateStructuredResultPanelProjectionContract,
  validateTaskRunProjectionV2Fixture,
  validateWorkflowSkillCandidateProjectionContract,
  validateWorkItemProjectionContract,
  validateUserTaskStatusProjectionContract,
} from '../shared-contract-validators.ts';
import { validateGatewayAccountFixture } from './gateway-account.ts';

export const runtimeBridgePackageDirectoryEntryFields = [
  'package_id',
  'package_kind',
  'package_role',
  'display_name',
  'description',
  'display_name_i18n',
  'description_i18n',
  'tags',
  'installed',
  'activated',
  'readiness',
  'home_shortcuts',
  'capability_metadata',
  'recommended_action_ref',
  'available_actions',
];
export const runtimeBridgeProjectedActionFields = [
  'action_id',
  'action_ref',
  'semantic',
  'surface',
  'payload',
  'required_payload_fields',
  'confirmation_required',
];

export function validateOplAppStateFastAgentPackageDirectoryFixture(fixture) {
  const directory = lookupPath(fixture, 'app_state.agent_packages.directory');
  if (!directory || !Array.isArray(directory.entries) || directory.entries.length === 0) {
    throw new Error('Agent Package directory fixture must expose at least one projected entry');
  }
  const seenPackageIds = new Set();
  for (const entry of directory.entries) {
    if (
      typeof entry?.package_id !== 'string'
      || typeof entry.display_name !== 'string'
      || typeof entry.description !== 'string'
      || typeof entry.package_role !== 'string'
      || typeof entry.installed !== 'boolean'
      || !entry.readiness
      || typeof entry.readiness !== 'object'
      || !Array.isArray(entry.available_actions)
    ) {
      throw new Error('Agent Package directory fixture entries must expose a generic identity, presentation, readiness, and action envelope');
    }
    if (seenPackageIds.has(entry.package_id)) {
      throw new Error('Agent Package directory fixture must not duplicate package ids');
    }
    seenPackageIds.add(entry.package_id);
  }
  const statusIndex = lookupPath(fixture, 'app_state.agent_packages.status_index');
  if (statusIndex !== undefined && (!statusIndex || typeof statusIndex !== 'object' || Array.isArray(statusIndex))) {
    throw new Error('Agent Package status index fixture must be an optional package-id-keyed diagnostic projection');
  }
}


function resolveLiveGateEnabled(gate) {
  const envName = gate?.enable_env;
  return typeof envName === 'string' && process.env[envName]?.trim() === '1';
}

function runLiveJsonCommand(oplRoot, args, label, maxStdoutBytes = commandMaxBuffer) {
  const result = spawnSync('./bin/opl', args, {
    cwd: oplRoot,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: Math.max(commandMaxBuffer, maxStdoutBytes),
  });
  if (result.error) {
    throw new Error(`Live OPL ${label} failed to launch: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error([
      `Live OPL ${label} failed: ./bin/opl ${args.join(' ')}`,
      result.stderr.trim(),
      result.stdout.trim(),
    ].filter(Boolean).join('\n'));
  }
  const stdoutBytes = Buffer.byteLength(result.stdout, 'utf8');
  if (stdoutBytes > maxStdoutBytes) {
    throw new Error(`Live OPL ${label} exceeded ${maxStdoutBytes} bytes: ${stdoutBytes}`);
  }
  try {
    return {
      payload: JSON.parse(result.stdout),
      stdoutBytes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Live OPL ${label} returned invalid JSON: ${message}`);
  }
}

export function validateLiveConformanceContract(gate) {
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) {
    throw new Error('Runtime bridge must declare live_conformance_gate');
  }
  if (gate.owner !== 'one-person-lab-app') {
    throw new Error(`Unexpected live conformance owner: ${gate.owner}`);
  }
  if (gate.producer_owner !== 'one-person-lab') {
    throw new Error(`Unexpected live conformance producer owner: ${gate.producer_owner}`);
  }
  if (gate.mode !== 'explicit_env_opt_in') {
    throw new Error(`Unexpected live conformance mode: ${gate.mode}`);
  }
  if (gate.default_enforcement !== 'disabled') {
    throw new Error(`Unexpected live conformance default enforcement: ${gate.default_enforcement}`);
  }
  for (const [field, expected] of Object.entries({
    enable_env: 'OPL_APP_LIVE_CONFORMANCE',
    opl_root_env: 'OPL_APP_LIVE_OPL_ROOT',
    action_fixture_env: 'OPL_APP_LIVE_ACTION_FIXTURE',
    opl_bin: './bin/opl',
    fast_state_command: './bin/opl app state --profile fast --json',
    full_state_command: './bin/opl app state --profile full --json',
    action_dry_run_command: './bin/opl app action execute --action <fixture> --dry-run --json',
    required_state_schema: 'opl_app_state.v1',
    golden_fast_state_fixture: 'contracts/fixtures/opl-app-state-fast.fixture.json',
    app_role: 'protocol_conformance_consumer',
  })) {
    if (gate[field] !== expected) {
      throw new Error(`Runtime bridge live_conformance_gate.${field} must be ${expected}`);
    }
  }
  if (gate.fast_state_max_bytes !== 500000) {
    throw new Error('Runtime bridge live_conformance_gate.fast_state_max_bytes must be 500000');
  }
  for (const schemaPath of ['app_state.schema_version', 'app_state.surface_kind', 'app_state.schema', 'app_state.surface', 'schema', 'surface']) {
    if (!gate.state_schema_paths?.includes(schemaPath)) {
      throw new Error(`Runtime bridge live conformance schema paths must include ${schemaPath}`);
    }
  }
  for (const assertion of [
    'fast App state command returns JSON',
    'full App state command returns JSON',
    'dry-run App action command returns JSON',
    'fast App state output stays below 500KB',
    'fast App state declares opl_app_state.v1 schema or surface',
  ]) {
    if (!gate.assertions?.includes(assertion)) {
      throw new Error(`Runtime bridge live conformance assertions must include ${assertion}`);
    }
  }
  for (const forbidden of forbiddenAuthorityOwners) {
    if (!gate.forbidden_authority?.includes(forbidden)) {
      throw new Error(`Runtime bridge live conformance must exclude ${forbidden}`);
    }
  }
  validateGoldenAppStateFixture(gate);
}

function validateGoldenAppStateFixture(gate) {
  const fixturePath = path.join(root, gate.golden_fast_state_fixture);
  assertFile(fixturePath, 'OPL App state golden fixture');
  const fixtureText = readFileSync(fixturePath, 'utf8');
  const fixture = JSON.parse(fixtureText);
  validateGoldenAppStateFixtureBasics(fixtureText, fixture, gate);
  validateCurrentOwnerDeltaCockpitFixture(fixture);
  validateGoldenAppStateTaskDrilldowns(fixture);
  validateGoldenAppStateActiveProjects(fixture);
  validateGoldenAppStateRequiredCollections(fixture);
  validateGatewayAccountFixture(fixture);
  validateOplAppStateFastAgentPackageDirectoryFixture(fixture);
}

function validateGoldenAppStateFixtureBasics(fixtureText, fixture, gate) {
  if (Buffer.byteLength(fixtureText, 'utf8') >= gate.fast_state_max_bytes) {
    throw new Error(`OPL App state golden fixture must stay below ${gate.fast_state_max_bytes} bytes.`);
  }
  if (lookupPath(fixture, 'app_state.schema_version') !== gate.required_state_schema) {
    throw new Error('OPL App state golden fixture must declare app_state.schema_version.');
  }
  if (lookupPath(fixture, 'app_state.surface_kind') !== gate.required_state_schema) {
    throw new Error('OPL App state golden fixture must declare app_state.surface_kind.');
  }
  if (lookupPath(fixture, 'app_state.meta.profile') !== 'fast') {
    throw new Error('OPL App state golden fixture must use the fast profile.');
  }
  if (lookupPath(fixture, 'app_state.operator.workbench.view_model_schema') !== 'opl_app_operator_workbench.v1') {
    throw new Error('OPL App state golden fixture must include typed operator workbench.');
  }
  if (lookupPath(fixture, 'app_state.operator.workbench.performance_policy.fast_json_max_bytes') !== gate.fast_state_max_bytes) {
    throw new Error('OPL App state golden fixture must carry the App fast JSON max budget.');
  }
  if (lookupPath(fixture, 'app_state.operator.workbench.performance_policy.shell_must_not_derive_layout_from_raw_runtime_projection') !== true) {
    throw new Error('OPL App state golden fixture must forbid shell-side layout derivation from raw runtime projection.');
  }
}

function validateGoldenAppStateTaskDrilldowns(fixture) {
  const taskDrilldowns = lookupPath(fixture, 'app_state.operator.workbench.task_drilldowns') ?? [];
  const platformRepairExample = taskDrilldowns.find(
    (task) => task?.progress_delta_classification === 'platform_repair',
  );
  if (!platformRepairExample) {
    throw new Error('OPL App state golden fixture must include a platform_repair task example.');
  }
  if (
    platformRepairExample.deliverable_progress_delta?.count !== 0
    || !(platformRepairExample.platform_repair_delta?.count > 0)
    || platformRepairExample.user_facing_progress_claim_allowed !== false
    || platformRepairExample.progress_display_bucket !== 'platform_repair'
  ) {
    throw new Error('OPL App state platform repair example must not claim deliverable progress.');
  }
  if (/deliverable|paper|manuscript|submission/i.test(platformRepairExample.progress_display_label ?? '')) {
    throw new Error('OPL App state platform repair label must not present repair as deliverable progress.');
  }
  const taskRunProjection = lookupPath(fixture, 'app_state.operator.workbench.task_run_projection_v2');
  if (
    taskRunProjection?.surface_kind !== 'task_run_projection_v2'
    || taskRunProjection?.schema_version !== 'task-run-projection.v2'
    || taskRunProjection?.refs_only !== true
    || !Array.isArray(taskRunProjection?.tasks)
    || taskRunProjection.tasks.length === 0
  ) {
    throw new Error('OPL App state golden fixture must include workbench.task_run_projection_v2.');
  }
  validateTaskRunProjectionV2Fixture(
    taskRunProjection.tasks[0],
    'OPL App state golden fixture TaskRunProjection v2 task',
  );
  validateOpenScienceAcceptedItemsFixture(
    taskRunProjection.tasks[0],
    'OPL App state golden fixture OpenScience accepted item task',
  );
  validateOpenScienceAcceptedItemsFixture(
    taskDrilldowns[0],
    'OPL App state golden fixture OpenScience accepted item drilldown',
  );
  const stateIndexSidecarExample = taskDrilldowns.find((task) => task?.state_index_sidecar_projection);
  if (!stateIndexSidecarExample) {
    throw new Error('OPL App state golden fixture must include a State Index sidecar read-model projection example.');
  }
  validateStateIndexSidecarFixture(
    stateIndexSidecarExample.state_index_sidecar_projection,
    'OPL App state golden fixture State Index sidecar projection',
  );
  const artifactNativeDrilldownExample = taskDrilldowns.find((task) => task?.artifact_native_drilldown);
  if (!artifactNativeDrilldownExample) {
    throw new Error('OPL App state golden fixture must include a Stage Artifact refs-only drilldown example.');
  }
  validateArtifactNativeDrilldownFixture(
    artifactNativeDrilldownExample.artifact_native_drilldown,
    'OPL App state golden fixture Stage Artifact drilldown',
  );
  const stageRunCockpitExample = taskDrilldowns.find(
    (task) => task?.stage_run_cockpit || task?.stage_run_current_owner_delta,
  );
  if (!stageRunCockpitExample) {
    throw new Error('OPL App state golden fixture must include a refs-only StageRun cockpit projection example.');
  }
  validateStageRunCockpitFixture(
    stageRunCockpitExample,
    'OPL App state golden fixture StageRun cockpit projection',
  );
}

function validateGoldenAppStateActiveProjects(fixture) {
  const activeProjectSummaryCard = (lookupPath(fixture, 'app_state.operator.workbench.summary_cards') ?? []).find(
    (card) => card?.card_id === 'active_projects',
  );
  if (!activeProjectSummaryCard) {
    throw new Error('OPL App state golden fixture must include an active_projects summary card.');
  }
  const activeProjects = lookupPath(fixture, 'app_state.operator.workbench.activity_center.active_projects');
  if (!Array.isArray(activeProjects) || activeProjects.length === 0) {
    throw new Error('OPL App state golden fixture must include activity_center.active_projects.');
  }
  const visualActiveProjectRefs = lookupPath(fixture, 'app_state.operator.visual_ref_groups.active_project_refs');
  if (!Array.isArray(visualActiveProjectRefs) || visualActiveProjectRefs.length === 0) {
    throw new Error('OPL App state golden fixture must include visual_ref_groups.active_project_refs.');
  }
  const queuedOrEscalatedProject = activeProjects.find((project) => ['queued', 'escalated'].includes(project?.status));
  if (!queuedOrEscalatedProject) {
    throw new Error('OPL App state golden fixture must include a queued or escalated active project line.');
  }
  for (const field of ['task_id', 'title', 'state', 'status', 'study_id', 'active_run_id', 'next_visible_step']) {
    if (!(field in queuedOrEscalatedProject)) {
      throw new Error(`OPL App state active project line must preserve ${field}.`);
    }
  }
  if (queuedOrEscalatedProject.active_worker_run === true || queuedOrEscalatedProject.provider_execution_running === true) {
    throw new Error('OPL App state active project line must not claim an active worker run.');
  }
}

function validateGoldenAppStateRequiredCollections(fixture) {
  for (const [pathName, label] of Object.entries({
    'app_state.operator.workbench.summary_cards': 'summary cards',
    'app_state.operator.workbench.sections': 'sections',
    'app_state.operator.workbench.activity_center.active_projects': 'active project lines',
    'app_state.operator.workbench.action_queue.items': 'action queue items',
    'app_state.operator.workbench.domain_lane_map.lanes': 'domain lanes',
    'app_state.operator.workbench.task_drilldowns': 'task drilldowns',
    'app_state.operator.workbench.safe_action_routes': 'safe action routes',
    'app_state.operator.workbench.lazy_refs': 'lazy refs',
    'app_state.operator.visual_ref_groups.active_project_refs': 'visual active project refs',
  })) {
    const value = lookupPath(fixture, pathName);
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(`OPL App state golden fixture must include ${label}.`);
    }
  }
}

function validateCurrentOwnerDeltaCockpitFixture(fixture) {
  const label = 'OPL App state golden fixture current_owner_delta cockpit';
  const defaultReadSurfacePolicy = lookupPath(fixture, 'app_state.operator.default_read_surface_policy');
  const currentOwnerDelta = lookupPath(fixture, 'app_state.operator.current_owner_delta');
  const currentOwnerDeltaNextAction = lookupPath(fixture, 'app_state.operator.current_owner_delta_next_action');
  const ordinaryCockpit = lookupPath(fixture, 'app_state.operator.ordinary_cockpit');

  if (!defaultReadSurfacePolicy || typeof defaultReadSurfacePolicy !== 'object') {
    throw new Error(`${label} must include app_state.operator.default_read_surface_policy`);
  }
  if (!currentOwnerDelta || typeof currentOwnerDelta !== 'object') {
    throw new Error(`${label} must include app_state.operator.current_owner_delta`);
  }
  if (!currentOwnerDeltaNextAction || typeof currentOwnerDeltaNextAction !== 'object') {
    throw new Error(`${label} must include app_state.operator.current_owner_delta_next_action`);
  }
  if (!ordinaryCockpit || typeof ordinaryCockpit !== 'object') {
    throw new Error(`${label} must include app_state.operator.ordinary_cockpit`);
  }

  for (const [pathName, expected] of Object.entries({
    'app_state.operator.operator_next_action_source': 'current_owner_delta',
    'app_state.operator.default_read_surface_policy.default_operator_payload': 'ordinary_cockpit',
    'app_state.operator.default_read_surface_policy.default_planning_root': 'current_owner_delta',
    'app_state.operator.default_read_surface_policy.authority_boundary.raw_worklist_can_generate_default_next_action': false,
    'app_state.operator.default_read_surface_policy.authority_boundary.raw_evidence_can_generate_default_next_action': false,
    'app_state.operator.default_read_surface_policy.authority_boundary.can_claim_app_release_ready': false,
    'app_state.operator.default_read_surface_policy.authority_boundary.can_claim_production_ready': false,
    'app_state.operator.current_owner_delta.default_planning_root': 'current_owner_delta',
    'app_state.operator.current_owner_delta.ordinary_progress_spine.default_next_action_derives_from': 'current_owner_delta',
    'app_state.operator.current_owner_delta.ordinary_progress_spine.raw_worklist_can_generate_default_next_action': false,
    'app_state.operator.current_owner_delta.authority_boundary.raw_worklist_can_drive_default_planning': false,
    'app_state.operator.current_owner_delta.authority_boundary.can_claim_production_ready': false,
    'app_state.operator.current_owner_delta_next_action.derivation_source': 'current_owner_delta',
    'app_state.operator.current_owner_delta_next_action.default_planning_root': 'current_owner_delta',
    'app_state.operator.current_owner_delta_next_action.raw_worklist_can_drive_default_planning': false,
    'app_state.operator.current_owner_delta_next_action.can_claim_domain_ready': false,
    'app_state.operator.current_owner_delta_next_action.can_claim_production_ready': false,
    'app_state.operator.current_owner_delta_next_action.worklist_item_is_completion_claim': false,
    'app_state.operator.ordinary_cockpit.surface_kind': 'opl_app_ordinary_cockpit',
    'app_state.operator.ordinary_cockpit.display_payload_policy': 'purpose_task_current_owner_next_action_artifact_or_blocker_only',
    'app_state.operator.ordinary_cockpit.ordinary_progress_spine.default_next_action_derives_from': 'current_owner_delta',
    'app_state.operator.ordinary_cockpit.ordinary_progress_spine.raw_worklist_can_generate_default_next_action': false,
    'app_state.operator.ordinary_cockpit.display_payload.next_action.source_ref': 'app_state.operator.current_owner_delta',
    'app_state.operator.ordinary_cockpit.display_payload.artifact_or_blocker.content_policy': 'refs_only_no_artifact_or_receipt_body',
    'app_state.operator.ordinary_cockpit.authority_boundary.default_planning_root': 'current_owner_delta',
    'app_state.operator.ordinary_cockpit.authority_boundary.default_next_action_derives_from': 'derive_default_next_action_only_from_current_owner_delta',
    'app_state.operator.ordinary_cockpit.authority_boundary.can_claim_app_release_ready': false,
    'app_state.operator.ordinary_cockpit.authority_boundary.can_claim_production_ready': false,
  })) {
    const actual = lookupPath(fixture, pathName);
    if (actual !== expected) {
      throw new Error(`${label} ${pathName} must be ${expected}`);
    }
  }

  assertIncludesAll(
    currentOwnerDelta.ordinary_progress_spine?.default_next_action_must_not_derive_from,
    ['raw_worklist', 'raw_evidence', 'provider_trace', 'replay_packet', 'typed_blocker_group', 'private_residue_inventory', 'audit_sidecar'],
    `${label} current owner delta forbidden next-action sources`,
  );
  assertIncludesAll(
    ordinaryCockpit.display_payload_fields,
    ['purpose', 'task', 'current_owner', 'next_action', 'artifact_or_blocker'],
    `${label} ordinary cockpit display payload fields`,
  );
  assertIncludesAll(
    ordinaryCockpit.developer_full_drilldown_only,
    ['provider', 'ledger', 'worklist', 'mcp_tool_catalog', 'raw_receipts', 'release_evidence'],
    `${label} ordinary cockpit drilldown-only fields`,
  );
  for (const forbidden of [
    'raw_worklist',
    'raw_evidence',
    'provider_trace',
    'release_evidence',
    'app_release_ready',
    'production_ready',
    'domain_ready',
  ]) {
    if (Object.hasOwn(ordinaryCockpit.display_payload ?? {}, forbidden)) {
      throw new Error(`${label} ordinary cockpit display_payload must not include ${forbidden}`);
    }
  }
}

export function validateLiveOplConformance(runtimeBridge) {
  const gate = runtimeBridge.live_conformance_gate;
  validateLiveConformanceContract(gate);
  if (!resolveLiveGateEnabled(gate)) {
    return;
  }

  const oplRoot = process.env[gate.opl_root_env]?.trim();
  if (!oplRoot) {
    throw new Error(`Set ${gate.opl_root_env} to the local OPL Framework root when ${gate.enable_env}=1.`);
  }
  const resolvedOplRoot = path.resolve(oplRoot);
  assertFile(path.join(resolvedOplRoot, 'bin', 'opl'), 'live OPL ./bin/opl');

  const actionFixture = process.env[gate.action_fixture_env]?.trim();
  if (!actionFixture) {
    throw new Error(`Set ${gate.action_fixture_env} to a safe OPL App action id when ${gate.enable_env}=1.`);
  }

  const fast = runLiveJsonCommand(
    resolvedOplRoot,
    ['app', 'state', '--profile', 'fast', '--json'],
    'fast App state',
    gate.fast_state_max_bytes,
  );
  const full = runLiveJsonCommand(resolvedOplRoot, ['app', 'state', '--profile', 'full', '--json'], 'full App state');
  const action = runLiveJsonCommand(
    resolvedOplRoot,
    ['app', 'action', 'execute', '--action', actionFixture, '--dry-run', '--json'],
    'App action dry-run',
  );

  if (fast.stdoutBytes >= gate.fast_state_max_bytes) {
    throw new Error(`Live OPL fast App state must stay below ${gate.fast_state_max_bytes} bytes.`);
  }
  const declaredSchema = gate.state_schema_paths
    .map((schemaPath) => lookupPath(fast.payload, schemaPath))
    .find((value) => typeof value === 'string' && value.trim());
  if (declaredSchema !== gate.required_state_schema) {
    throw new Error(`Live OPL fast App state must declare ${gate.required_state_schema} schema/surface.`);
  }
  if (lookupPath(fast.payload, 'app_state.meta.profile') !== 'fast') {
    throw new Error('Live OPL fast App state must declare app_state.meta.profile=fast.');
  }
  if (lookupPath(full.payload, 'app_state.meta.profile') !== 'full') {
    throw new Error('Live OPL full App state must declare app_state.meta.profile=full.');
  }
  if (lookupPath(action.payload, 'app_action_execution.surface_kind') !== 'opl_app_action_execution.v1') {
    throw new Error('Live OPL App action dry-run must declare opl_app_action_execution.v1.');
  }
  if (lookupPath(action.payload, 'app_action_execution.dry_run') !== true) {
    throw new Error('Live OPL App action dry-run must return dry_run=true.');
  }

  console.log('Live OPL App state/action conformance passed.');
}
