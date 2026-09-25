import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertDeepEqualJson, assertIncludesAll } from './assertions.ts';
import {
  appOwnedGenericOwnerAcceptanceCurrentnessRefPolicy,
  appOwnedOplStandardAgentMembershipPolicy,
  forbiddenAuthorityOwners,
} from './app-contract-constants.ts';
import { isDefaultReleaseAdapter } from './active-shell-contract.ts';
import { assertFile, commandMaxBuffer, root } from './validation-config.ts';
import { lookupPath } from './value-helpers.ts';
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
} from './shared-contract-validators.ts';

const gatewayAccountProjectionPath =
  'app_state.settings_control_center.app_settings_read_model.opl_gateway_account';
const gatewayAccountConnectionModes = ['none', 'manual_key', 'account'];
const gatewayAccountStatusValues = [
  'not_connected',
  'setup_required',
  'connected',
  'reauth_required',
  'attention_needed',
  'disconnect_pending',
];
const gatewayAccountTopLevelFields = [
  'surface_kind',
  'connection_mode',
  'status',
  'account_card_visible',
  'account',
  'usage',
  'managed_key',
  'installation',
  'available_groups',
  'freshness',
  'capabilities',
  'actions',
];
const gatewayAccountNestedFields = {
  account: ['display_name', 'email', 'status', 'balance'],
  'account.balance': ['amount', 'currency'],
  usage: ['today_tokens', 'total_tokens', 'today_actual_cost', 'total_actual_cost', 'currency', 'day_timezone'],
  managed_key: ['name', 'status', 'ownership'],
  installation: ['device_label', 'short_id'],
  'available_groups[]': ['group_id', 'label'],
  freshness: ['observed_at', 'stale_after', 'stale', 'last_error_code'],
  capabilities: ['account_login_supported', 'manual_key_supported'],
  actions: ['complete_setup', 'refresh', 'repair', 'use_for_model_access', 'disconnect'],
};
const gatewayAccountForbiddenFields = [
  'password',
  'access_token',
  'refresh_token',
  'api_key',
  'key_material',
  'key_id',
  'remote_key_id',
  'credential_path',
  'raw_response',
  'raw_error',
];
const gatewayAccountErrorCodes = [
  'invalid_credentials',
  'account_disabled',
  'mfa_or_challenge_required',
  'session_not_persistable',
  'group_selection_required',
  'auth_expired',
  'network_unreachable',
  'rate_limited',
  'managed_key_missing',
  'managed_key_conflict',
  'managed_key_identity_drift',
  'disconnect_pending',
  'manual_override_preserved',
];
const gatewayAccountActionIds = [
  'gateway_account_complete_setup',
  'gateway_account_refresh',
  'gateway_account_repair',
  'gateway_account_use_for_model_access',
  'gateway_account_disconnect',
];
const gatewayAccountDisplayPolicy = {
  identity: 'show_full_account_email_because_it_is_not_secret_material',
  account_status: 'localized_user_facing_label_with_active_rendered_as_激活_in_zh_CN',
  token_counts: 'compact_decimal_units_K_M_B_T_with_up_to_two_fraction_digits',
  day_timezone: 'not_user_visible',
  observed_at: 'format_with_local_device_locale_and_timezone',
  refresh_action: 'icon_only_immediately_after_observed_at_with_tooltip_and_accessible_name',
  normal_actions: ['refresh', 'disconnect'],
  exception_actions: ['sign_in_again'],
  forbidden_normal_controls: ['group_selector', 'complete_setup', 'repair', 'use_for_model_access'],
};
const gatewayAccountGroupResolutionPolicy = {
  default_group_match: 'single_case_insensitive_label_containing_Codex_then_single_available_group_fallback',
  ordinary_user_selector: 'not_rendered',
  managed_key_setup_action:
    'auto_execute_complete_setup_once_when_action_exposed_managed_key_missing_and_default_group_resolves_without_rendering_control',
  unresolved_state: 'show_localized_error_without_arbitrary_group_selection',
  retry_policy: 'retry_after_manual_refresh_or_new_authoritative_projection',
};

function collectObjectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, keys);
    return keys;
  }
  if (!value || typeof value !== 'object') return keys;
  for (const [key, nested] of Object.entries(value)) {
    keys.add(key);
    collectObjectKeys(nested, keys);
  }
  return keys;
}

function validateGatewayAccountFixture(fixture) {
  const projection = lookupPath(fixture, gatewayAccountProjectionPath);
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) {
    throw new Error(`OPL App state golden fixture must include ${gatewayAccountProjectionPath}`);
  }
  assertDeepEqualJson(Object.keys(projection), gatewayAccountTopLevelFields, 'Gateway account fixture top-level fields');
  if (
    projection.surface_kind !== 'opl_gateway_account_read_model.v1'
    || !gatewayAccountConnectionModes.includes(projection.connection_mode)
    || !gatewayAccountStatusValues.includes(projection.status)
  ) {
    throw new Error('Gateway account fixture must use the canonical v1 surface, connection mode, and status');
  }
  if (projection.account_card_visible !== (projection.connection_mode === 'account')) {
    throw new Error('Gateway account fixture account card visibility must follow account connection mode');
  }
  for (const [field, expectedFields] of Object.entries(gatewayAccountNestedFields)) {
    const value = field === 'available_groups[]'
      ? projection.available_groups
      : field === 'account.balance'
        ? projection.account?.balance
        : projection[field];
    if (field === 'available_groups[]') {
      if (!Array.isArray(value)) throw new Error('Gateway account fixture available_groups must be an array');
      for (const group of value) {
        assertDeepEqualJson(Object.keys(group), expectedFields, 'Gateway account fixture available group fields');
      }
      continue;
    }
    assertDeepEqualJson(Object.keys(value ?? {}), expectedFields, `Gateway account fixture ${field} fields`);
  }
  const observedKeys = collectObjectKeys(projection);
  for (const forbidden of gatewayAccountForbiddenFields) {
    if (observedKeys.has(forbidden)) {
      throw new Error(`Gateway account fixture must not expose secret or remote identity field ${forbidden}`);
    }
  }
  const actionValues = Object.values(projection.actions).filter(Boolean);
  if (!actionValues.every((action) => gatewayAccountActionIds.includes(action))) {
    throw new Error('Gateway account fixture actions must use canonical non-secret App action ids');
  }
}

const runtimeBridgePackageDirectoryEntryFields = [
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
const runtimeBridgeProjectedActionFields = [
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

export function validateOplGatewayAccountContract(runtimeBridge) {
  const projection = runtimeBridge.opl_gateway_account_projection;
  if (
    projection?.surface_kind !== 'opl_gateway_account_read_model.v1'
    || projection.source_path !== 'app_state.settings_control_center.app_settings_read_model.opl_gateway_account'
    || projection.producer_owner !== 'one-person-lab'
    || projection.consumer_owner !== 'one-person-lab-app'
    || projection.shell_role !== 'display_and_declared_action_consumer_only'
  ) {
    throw new Error('Runtime bridge must declare the canonical OPL Gateway account projection ownership and path');
  }
  assertDeepEqualJson(projection.connection_modes, gatewayAccountConnectionModes, 'Gateway account connection modes');
  assertDeepEqualJson(projection.status_values, gatewayAccountStatusValues, 'Gateway account status values');
  assertDeepEqualJson(projection.top_level_field_allowlist, gatewayAccountTopLevelFields, 'Gateway account top-level fields');
  assertDeepEqualJson(projection.nested_field_allowlist, gatewayAccountNestedFields, 'Gateway account nested fields');
  assertDeepEqualJson(projection.forbidden_fields, gatewayAccountForbiddenFields, 'Gateway account forbidden fields');
  assertDeepEqualJson(projection.error_codes, gatewayAccountErrorCodes, 'Gateway account error codes');
  assertDeepEqualJson(projection.app_action_ids, gatewayAccountActionIds, 'Gateway account App action ids');
  assertDeepEqualJson(projection.display_policy, gatewayAccountDisplayPolicy, 'Gateway account display policy');
  assertDeepEqualJson(
    projection.group_resolution_policy,
    gatewayAccountGroupResolutionPolicy,
    'Gateway account group resolution policy',
  );
  if (
    projection.account_card_visibility !== 'account_card_visible_true_only'
    || projection.refresh_policy?.ttl_seconds !== 900
    || projection.refresh_policy?.page_entry !== 'show_cached_then_refresh_once_when_stale'
    || projection.refresh_policy?.manual_refresh !== 'bypass_ttl'
    || projection.refresh_policy?.network_failure !== 'preserve_cached_values_and_mark_stale'
    || projection.renderer_bootstrap_cache?.role !== 'derived_last_known_good_projection_not_truth'
    || projection.renderer_bootstrap_cache?.storage_scope !==
      'dedicated_gateway_projection_cache_independent_of_full_app_state_cache'
    || projection.renderer_bootstrap_cache?.field_policy !== 'persist_projection_top_level_and_nested_allowlists_only'
    || projection.renderer_bootstrap_cache?.initial_render !== 'show_cached_account_before_gateway_account_refresh_action'
    || projection.renderer_bootstrap_cache?.legacy_cache_without_projection !==
      'keep_account_state_resolving_until_authoritative_readback'
    || projection.renderer_bootstrap_cache?.refresh_failure !== 'retain_cached_account_and_surface_stale_or_error'
    || projection.renderer_bootstrap_cache?.invalidation !==
      'replace_only_after_authoritative_gateway_action_or_readback_confirms_new_projection'
    || projection.generic_action_secret_policy !==
      'password_tokens_and_api_key_material_forbidden_in_action_payload_log_state_error_and_receipt'
  ) {
    throw new Error('Gateway account projection must preserve visibility, 15-minute freshness, stale, and secret boundaries');
  }

  const secretBridge = runtimeBridge.opl_gateway_account_secret_bridge;
  if (
    secretBridge?.bridge_id !== 'loginGatewayAccount'
    || secretBridge.desktop_only !== false
    || secretBridge.webui_password_login_allowed !== true
    || secretBridge.webui_route !== '/api/opl-runtime/gateway-account-login'
    || secretBridge.command !== 'opl connect gateway login --credentials-stdin --json'
    || secretBridge.transport !==
      'runtime_provider_via_desktop_typed_ipc_or_existing_webui_http_proxy_to_dedicated_stdin_no_generic_app_action_payload'
    || secretBridge.secret_persistence !== false
    || secretBridge.secret_diagnostics !== false
    || secretBridge.secret_receipt_fields !== false
  ) {
    throw new Error('Gateway account login must use the runtime provider and dedicated stdin-only secret bridge');
  }
  assertDeepEqualJson(secretBridge.request_fields, ['email', 'password', 'deviceLabel'], 'Gateway login request fields');
  assertDeepEqualJson(secretBridge.optional_request_fields, ['deviceLabel'], 'Gateway login optional request fields');
  assertDeepEqualJson(secretBridge.response_fields, ['ok', 'errorCode', 'stateRefreshRequired'], 'Gateway login response fields');
  assertDeepEqualJson(secretBridge.secret_fields, ['password'], 'Gateway login secret fields');
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

function validateLiveConformanceContract(gate) {
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

function validateRuntimeBridgeIdentity(runtimeBridge, contract) {
  if (runtimeBridge.owner !== 'one-person-lab-app') {
    throw new Error(`Unexpected runtime bridge owner: ${runtimeBridge.owner}`);
  }
  if (runtimeBridge.purpose !== 'runtime_bridge_abstraction') {
    throw new Error(`Unexpected runtime bridge purpose: ${runtimeBridge.purpose}`);
  }
  if (runtimeBridge.state !== 'active') {
    throw new Error(`Unexpected runtime bridge state: ${runtimeBridge.state}`);
  }
  if (isDefaultReleaseAdapter(contract) && runtimeBridge.active_adapter !== contract.active_shell) {
    throw new Error(`Runtime bridge active adapter must match active shell: ${runtimeBridge.active_adapter}`);
  }
  if (runtimeBridge.adapter_role !== 'replaceable_gui_shell_adapter') {
    throw new Error(`Unexpected runtime bridge adapter role: ${runtimeBridge.adapter_role}`);
  }
  if (runtimeBridge.protocol_owner !== 'one-person-lab') {
    throw new Error(`Unexpected runtime bridge protocol owner: ${runtimeBridge.protocol_owner}`);
  }
  if (runtimeBridge.ui_contract_owner !== 'one-person-lab-app') {
    throw new Error(`Unexpected runtime bridge UI contract owner: ${runtimeBridge.ui_contract_owner}`);
  }
  if (isDefaultReleaseAdapter(contract) && runtimeBridge.default_adapter_repo !== contract.shell_source?.owner_repo) {
    throw new Error(`Runtime bridge adapter repo must match active shell source: ${runtimeBridge.default_adapter_repo}`);
  }
  if (isDefaultReleaseAdapter(contract) && runtimeBridge.default_adapter_path !== contract.shell_root) {
    throw new Error(`Runtime bridge adapter path must match active shell root: ${runtimeBridge.default_adapter_path}`);
  }
}

function validateRuntimeBridgeDeclaredSurfaces(runtimeBridge) {
  for (const [field, expected] of Object.entries({
    summary_command: 'opl app state --profile fast --json',
    refresh_command: 'opl app state --profile fast --json',
    default_operator_payload: 'current_owner_delta',
    full_state_command: 'opl app state --profile full --json',
    full_state_policy: 'diagnostic_or_release_evidence_only',
    full_detail_command: 'opl runtime app-operator-drilldown --detail full --json',
    runtime_page_full_detail_allowed: false,
    action_command: 'opl app action execute --action <action_id> [--payload json] [--dry-run] --json',
    'projection_sources.primary': 'app_state.operator.workbench.work_item_projection_v2',
    'projection_sources.provider': 'runtime_tray_snapshot.app_operator_drilldown.current_control_state.states.provider_run',
    'projection_sources.actions': 'app_state.actions',
    'projection_sources.full_detail': 'runtime_tray_snapshot.app_operator_drilldown',
    'projection_sources.policy': 'work_item_projection_v2_primary_provider_projection_diagnostic_only',
  })) {
    const actual = field.split('.').reduce((value, key) => value?.[key], runtimeBridge);
    if (actual !== expected) {
      throw new Error(`Runtime bridge ${field} must be ${expected}`);
    }
  }
  if ('compatibility_operator_payload' in runtimeBridge) {
    throw new Error('Runtime bridge must not declare compatibility_operator_payload');
  }
  assertDeepEqualJson(
    runtimeBridge.full_detail_consumer_surfaces,
    ['/settings/environment?section=diagnostics', 'release_evidence_tooling'],
    'Runtime bridge full detail consumer surfaces',
  );
}

function validateRuntimeBridgeDefaultReadSurfacePolicy(runtimeBridge) {
  const defaultReadSurfacePolicy = runtimeBridge.default_read_surface_policy;
  for (const [field, expected] of Object.entries({
    default_projection: 'opl_current_owner_delta',
    source_path: 'app_state.operator.default_read_surface_policy',
    foundry_agent_os_cockpit_policy: 'first_screen_current_owner_delta_only_raw_worklist_evidence_provider_trace_drilldown_only',
    default_next_action_source: 'current_owner_delta',
    raw_worklist_generates_default_next_action: false,
    release_evidence_counts_as_release_ready: false,
    stage_run_cockpit_projection_ref: 'contracts/app-runtime-bridge.json#stage_run_cockpit_projection',
    full_detail_policy: 'explicit_full_detail_or_lazy_diagnostic_only',
    raw_refs_policy: 'raw_refs_require_explicit_full_detail',
    full_detail_auto_poll: false,
    shell_must_not_use_full_drilldown_as_normal_state: true,
    shell_must_not_derive_layout_from_raw_runtime_projection: true,
  })) {
    if (defaultReadSurfacePolicy?.[field] !== expected) {
      throw new Error(`Runtime bridge default_read_surface_policy.${field} must be ${expected}`);
    }
  }
  if (defaultReadSurfacePolicy && 'compatibility_projection' in defaultReadSurfacePolicy) {
    throw new Error('Runtime bridge default_read_surface_policy must not declare compatibility_projection');
  }
  for (const field of [
    'next_safe_action_or_none',
    'current_owner',
    'required_delta',
    'accepted_return_shapes',
    'readiness_false_flags',
    'count_summary',
  ]) {
    if (!defaultReadSurfacePolicy?.first_screen_answers?.includes(field)) {
      throw new Error(`Runtime bridge default_read_surface_policy.first_screen_answers must include ${field}`);
    }
  }
  for (const field of [
    'runtime_tray_snapshot',
    'raw_evidence_envelope',
    'stage_replay_packet_body',
    'private_residue_inventory_body',
    'provider_internal_ledger_body',
  ]) {
    if (!defaultReadSurfacePolicy?.forbidden_default_state_fields?.includes(field)) {
      throw new Error(`Runtime bridge default_read_surface_policy.forbidden_default_state_fields must include ${field}`);
    }
  }
}

function validateRuntimeBridgeUserTaskStatus(runtimeBridge) {
  validateUserTaskStatusProjectionContract(
    runtimeBridge.user_task_status_projection,
    'Runtime bridge user task status projection',
    runtimeBridge.stage_run_cockpit_projection,
  );
  if (runtimeBridge.user_task_status_projection?.app_role !== 'display_only_user_task_status_consumer') {
    throw new Error('Runtime bridge user task status projection must be a display-only consumer');
  }
}

export function validateRuntimeProgressPageDisplayPolicy(runtimeBridge) {
  const policy = runtimeBridge.runtime_progress_page_display_policy;
  assertDeepEqualJson(
    runtimeBridge.user_task_status_projection?.generic_owner_acceptance_currentness_ref_policy,
    appOwnedGenericOwnerAcceptanceCurrentnessRefPolicy,
    'Runtime generic owner acceptance/currentness ref policy',
  );
  if (policy?.owner !== 'one-person-lab-app') {
    throw new Error('Runtime progress page display policy must be App-owned');
  }
  if (policy?.default_surface !== 'work_item_projection_v2_list') {
    throw new Error('Runtime progress page default surface must be WorkItemProjection v2 list');
  }
  if (policy?.advanced_surface !== 'selected_work_item_stage_popover_or_detail_drawer') {
    throw new Error('Runtime progress page advanced surface must be selected work-item detail only');
  }
  if (policy?.page_role !== 'minimal_project_work_status_not_platform_operations') {
    throw new Error('Runtime progress page must be project work status, not platform operations');
  }
  if (policy?.work_item_projection_ref !== 'contracts/app-runtime-bridge.json#work_item_projection') {
    throw new Error('Runtime progress page must point at the canonical WorkItemProjection contract');
  }
  if (policy?.detail_layer_ref !== 'contracts/app-runtime-bridge.json#work_item_projection.detail_layer_contract') {
    throw new Error('Runtime progress page must point at the WorkItemProjection detail layer contract');
  }
  assertDeepEqualJson(policy?.default_task_row_spine, [
    'project_and_work_item',
    'status',
    'progress_and_next_step',
    'elapsed_and_tokens',
  ], 'Runtime progress page default task row spine');
  assertDeepEqualJson(policy?.default_page_sections, [
    'top_scope_and_refresh',
    'compact_status_filter',
    'archived_tasks_entry',
    'work_item_list',
  ], 'Runtime progress page default sections');
  assertDeepEqualJson(policy?.layout_regions, {
    top: ['top_scope_and_refresh', 'compact_status_filter', 'archived_tasks_entry'],
    main: ['work_item_list'],
  }, 'Runtime progress page layout regions');
  assertIncludesAll(policy?.default_field_allowlist ?? [], [
    'identity.project_display_name',
    'identity.work_item_display_name',
    'identity.agent_display_name',
    'lifecycle.primary_state',
    'visibility.state',
    'execution.state',
    'execution.current_stage_display_name',
    'execution.next_stage_display_name',
    'telemetry.elapsed',
    'telemetry.current_stage_tokens',
    'telemetry.task_total_tokens',
    'action.title_key',
    'action.message_args',
    'action.owner',
    'action.owner_kind',
  ], 'Runtime progress page default field allowlist');
  assertIncludesAll(policy?.default_visible_field_groups?.work_item_list ?? [], [
    'identity.project_display_name',
    'identity.work_item_display_name',
    'identity.agent_display_name',
    'lifecycle.primary_state',
    'visibility.state',
    'execution.state',
    'execution.current_stage_display_name',
    'execution.next_stage_display_name',
    'telemetry.elapsed',
    'telemetry.current_stage_tokens',
    'telemetry.task_total_tokens',
    'action.title_key',
    'action.message_args',
    'action.owner',
    'action.owner_kind',
  ], 'Runtime progress page work item list fields');
  for (const forbiddenField of [
    'action.title_args',
    'action.summary_args',
    'action.copy_locale',
    'visibility.token',
    'identity.generation',
  ]) {
    if (
      policy?.default_field_allowlist?.includes(forbiddenField)
      || Object.values(policy?.default_visible_field_groups ?? {}).some(
        (fields) => Array.isArray(fields) && fields.includes(forbiddenField),
      )
    ) {
      throw new Error(`Runtime progress page must not consume nonexistent field ${forbiddenField}`);
    }
  }
  const defaultFieldAllowlist = new Set(policy?.default_field_allowlist ?? []);
  for (const [groupName, fields] of Object.entries(policy?.default_visible_field_groups ?? {})) {
    if (!Array.isArray(fields)) {
      throw new Error(`Runtime progress page default visible field group ${groupName} must be an array`);
    }
    for (const field of fields) {
      if (!defaultFieldAllowlist.has(field)) {
        throw new Error(`Runtime progress page default field ${groupName}.${field} must be included in default_field_allowlist`);
      }
    }
  }
  if (
    policy?.default_label_policy?.primary_state_label_render_owner !== 'shell_current_app_locale' ||
    policy?.default_label_policy?.action_label_render_owner !== 'shell_current_app_locale' ||
    policy?.default_label_policy?.framework_hardcoded_locale_copy_default_allowed !== false
  ) {
    throw new Error('Runtime progress page labels must render from semantic state/action fields in the current App locale');
  }
  if (
    policy?.task_deduplication_policy?.canonical_row_key !== 'item_id' ||
    policy?.task_deduplication_policy?.detail_selection_key !== 'item_id' ||
    policy?.task_deduplication_policy?.identity_work_item_id_scope !== 'project_local' ||
    policy?.task_deduplication_policy?.duplicate_local_work_item_id_across_projects_allowed !== true ||
    policy?.task_deduplication_policy?.dedupe_owner !== 'opl_framework' ||
    policy?.task_deduplication_policy?.one_row_per_work_item !== true ||
    policy?.task_deduplication_policy?.shell_heuristic_deduplication_allowed !== false ||
    policy?.task_deduplication_policy?.module_runtime_rows_policy !==
    'module_runtime_and_module_health_never_enter_runtime_page_route_to_settings'
  ) {
    throw new Error('Runtime progress page must project one canonical row per work item and keep module runtime separate');
  }
  if (policy?.task_deduplication_policy?.raw_duplicate_refs_default_visible !== false) {
    throw new Error('Runtime progress page raw duplicate refs must stay hidden by default');
  }
  const visibilityPolicy = policy?.work_item_visibility_policy;
  assertDeepEqualJson(
    visibilityPolicy?.axis_values,
    ['visible', 'archived'],
    'Runtime progress page visibility axis values',
  );
  for (const [field, expected] of Object.entries({
    axis: 'work_item_projection.visibility.state',
    default_list_visibility: 'visible',
    archived_library_visibility: 'archived',
    archived_library_is_saved_status_view: false,
    archived_library_scope: 'same_agent_then_project_scope',
    status_filters_include_agent_project_or_visibility: false,
    restore_returns_item_to_default_list: true,
    local_storage_truth_allowed: false,
    mutation_contract_ref:
      'contracts/app-runtime-bridge.json#work_item_projection.visibility_mutation_contract',
  })) {
    if (visibilityPolicy?.[field] !== expected) {
      throw new Error(`Runtime progress page visibility ${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    policy?.next_step_copy_policy?.source_priority,
    ['action.title_key + action.message_args', 'action.summary_key + action.message_args'],
    'Runtime progress page next-step semantic source priority',
  );
  assertDeepEqualJson(
    policy?.next_step_copy_policy?.compatibility_fallback_fields,
    ['action.title', 'action.summary'],
    'Runtime progress page next-step compatibility fallback fields',
  );
  if (
    policy?.next_step_copy_policy?.render_owner !== 'shell_current_app_locale' ||
    policy?.next_step_copy_policy?.long_text_policy !==
      'framework_projects_locale_independent_action_semantics_shell_renders_current_app_locale' ||
    policy?.next_step_copy_policy?.compatibility_fallback_only !== true ||
    policy?.next_step_copy_policy?.cross_locale_raw_fallback_allowed !== false ||
    policy?.next_step_copy_policy?.missing_semantics_policy !==
      'localized_generic_action_copy_from_action_kind'
  ) {
    throw new Error('Runtime progress page must render Framework action semantics in the current App locale');
  }
  if (policy?.next_step_copy_policy?.raw_route_or_command_default_visible !== false) {
    throw new Error('Runtime progress page raw route/command next steps must stay hidden by default');
  }
  assertDeepEqualJson(
    policy?.responsive_acceptance?.viewport_widths_px,
    [375, 768, 1024, 1440],
    'Runtime progress page responsive viewport matrix',
  );
  if (
    policy?.responsive_acceptance?.desktop_layout !== 'four_columns' ||
    policy?.responsive_acceptance?.narrow_layout !== 'semantic_row_reflow' ||
    policy?.responsive_acceptance?.horizontal_page_overflow_allowed !== false ||
    policy?.responsive_acceptance?.text_overlap_allowed !== false
  ) {
    throw new Error('Runtime progress page must reflow without horizontal page overflow or text overlap');
  }
  assertDeepEqualJson(policy?.advanced_only_fields, [
    'raw_proof_ref',
    'receipt_refs',
    'stage_attempt_ids',
    'run_id',
    'active_run_id',
    'workflow_id',
    'workflow_refs',
    'raw_blocker_route',
    'typed_blocker_resolution_ref',
    'raw_readback',
    'readback_ref',
    'readback_text',
    'runtime_readback_ref',
    'runtime_closeout_ref',
    'stage_run_current_owner_delta.accepted_return_shapes',
    'stage_run_current_owner_delta.artifact_or_blocker_refs',
    'stage_run_current_owner_delta.readiness_false_flag_refs',
    'provider',
    'projection',
    'ledger',
    'current_control_state',
    'full_drilldown',
  ], 'Runtime progress page advanced-only fields');
  assertDeepEqualJson(policy?.surface_exclusions?.runtime_page_forbidden, [
    'operator_summary',
    'safe_action_catalog',
    'software_install_or_update_actions',
    'platform_repair_actions',
    'module_health_panel',
    'provider_diagnostics',
    'raw_runtime_readback',
  ], 'Runtime progress page forbidden surfaces');
  assertDeepEqualJson(policy?.surface_exclusions?.settings_owner_routes, {
    software_updates: '/settings/environment?section=updates',
    platform_repair: '/settings/environment?section=services',
    agent_package_management: '/settings/agents',
    capability_management: '/settings/capabilities',
    diagnostics: '/settings/environment?section=diagnostics',
  }, 'Runtime progress page Settings routes');
  const stagePopover = runtimeBridge.work_item_projection?.stage_popover_contract;
  assertDeepEqualJson(stagePopover?.required_fields, [
    'stage_map',
    'stage_map[].display_names',
    'execution.current_stage_display_name',
    'execution.next_stage_display_name',
    'execution.attempt_id',
  ], 'Runtime Stage popover required fields');
  assertDeepEqualJson(stagePopover?.viewport_widths_px, [375, 768, 1024, 1440], 'Runtime Stage popover viewports');
  for (const [field, expected] of Object.entries({
    trigger_field: 'execution.current_stage_display_name',
    trigger_does_not_open_task_drawer: true,
    label_source: 'stage_map[].display_names[current_app_locale]',
    label_fallback: 'stage_map[].display_name',
    locale_owner: 'shell_current_app_locale',
    current_attempt_visible_here: true,
    current_attempt_default_row_visible: false,
    historical_attempt_ids_visible: false,
    horizontal_overflow_allowed: false,
  })) {
    if (stagePopover?.[field] !== expected) {
      throw new Error(`Runtime Stage popover ${field} must be ${expected}`);
    }
  }
  for (const claim of [
    'second_runtime_truth_source',
    'live_runtime_readiness',
    'release_currentness',
    'owner_receipt_authority',
    'shell_runtime_truth',
  ]) {
    if (!policy?.forbidden_claims?.includes(claim)) {
      throw new Error(`Runtime progress page display policy must forbid ${claim}`);
    }
  }
}

function validateRuntimeBridgeCommandResolutionPolicy(runtimeBridge) {
  const commandResolutionPolicy = runtimeBridge.command_resolution_policy;
  if (commandResolutionPolicy?.owner !== 'one-person-lab-app') {
    throw new Error('Runtime bridge command resolution policy must be App-owned');
  }
  if (commandResolutionPolicy?.adapter_responsibility !== 'resolve_healthy_opl_cli_before_running_declared_surfaces') {
    throw new Error('Runtime bridge command resolution policy must require healthy OPL CLI resolution');
  }
  if (commandResolutionPolicy?.managed_opl_priority !== 'prefer_only_when_shim_targets_existing_cli_payload') {
    throw new Error('Runtime bridge must prefer managed OPL only when its shim targets an existing CLI payload');
  }
  if (commandResolutionPolicy?.broken_managed_shim_policy !== 'skip_and_fall_through_to_system_opl') {
    throw new Error('Runtime bridge must skip broken managed OPL shims and fall through to system OPL');
  }
  for (const fallbackPath of ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']) {
    if (!commandResolutionPolicy?.system_opl_fallback_paths?.includes(fallbackPath)) {
      throw new Error(`Runtime bridge command resolution policy must include fallback path ${fallbackPath}`);
    }
  }
  for (const forbidden of [
    'let stale managed Node opl shims shadow a healthy system opl',
    'rewrite App runtime truth from shell-private state',
    'treat missing managed bootstrap artifacts as first-run UI truth',
  ]) {
    if (!commandResolutionPolicy?.must_not?.includes(forbidden)) {
      throw new Error(`Runtime bridge command resolution policy must forbid: ${forbidden}`);
    }
  }
  const sharedGuiTarget = commandResolutionPolicy?.shared_gui_target;
  for (const [field, expected] of Object.entries({
    implementation_status:
      'candidate_launcher_runtime_provenance_readback_implemented_compatibility_parity_not_proven',
    producer: 'app_host_runtime_resolver',
    producer_status: 'implemented_for_local_gui_launcher',
  })) {
    if (sharedGuiTarget?.[field] !== expected) {
      throw new Error(`Runtime bridge shared GUI command resolver target ${field} must be ${expected}`);
    }
  }
  assertIncludesAll(sharedGuiTarget?.required_executables, ['opl', 'codex'], 'Shared GUI runtime executables');
  const compatibilityRequirements = sharedGuiTarget?.compatibility_requirements;
  if (!Array.isArray(compatibilityRequirements)) {
    throw new Error('Shared GUI runtime compatibility requirements must be an array');
  }
  for (const requirement of compatibilityRequirements) {
    if (requirement?.kind !== 'capability_id_with_versioned_schema') {
      throw new Error(`Shared GUI runtime compatibility requirement kind ${requirement?.kind ?? '(missing)'} is unsupported`);
    }
  }
  assertDeepEqualJson(
    compatibilityRequirements,
    [
      {
        kind: 'capability_id_with_versioned_schema',
        component_id: 'opl_framework',
        capability_id: 'opl_app_state_fast',
        schema_range: '>=1 <2',
      },
      {
        kind: 'capability_id_with_versioned_schema',
        component_id: 'opl_framework',
        capability_id: 'opl_app_action_execute',
        schema_range: '>=1 <2',
      },
      {
        kind: 'capability_id_with_versioned_schema',
        component_id: 'codex_cli',
        capability_id: 'codex_app_server',
        schema_range: '>=1 <2',
      },
    ],
    'Shared GUI runtime compatibility requirements',
  );
  if (sharedGuiTarget?.observational_build_provenance?.may_gate_install_or_runtime !== false) {
    throw new Error('Shared GUI runtime observational build provenance may_gate_install_or_runtime must be false');
  }
  assertDeepEqualJson(
    sharedGuiTarget?.observational_build_provenance,
    {
      schema: 'app_runtime_executable_identity.v1',
      fields: ['opl_path', 'opl_version', 'codex_path', 'codex_version', 'runtime_cohort_ref'],
      role: 'per_gui_artifact_source_observation_only',
      may_gate_install_or_runtime: false,
    },
    'Shared GUI runtime observational build provenance',
  );
}

function validateSharedGuiRuntimeResolutionPolicy(runtimeBridge) {
  const policy = runtimeBridge.shared_gui_runtime_resolution_policy;
  if ('same_cohort_runtime_identity_required_for_parity' in (policy ?? {})) {
    throw new Error('Runtime parity must not retain the same_cohort_runtime_identity_required_for_parity gate');
  }
  for (const [field, expected] of Object.entries({
    state: 'source_binding_and_packaged_artifact_evidence_complete',
    policy_owner: 'one-person-lab-app',
    runtime_identity_owner: 'gaofeng21cn/opl-aion-shell',
    resolver_source: 'contracts/app-runtime-bridge.json#command_resolution_policy.shared_gui_target',
    logical_control_plane_shared: true,
    parity_admission_basis: 'compatible_runtime_capability_and_versioned_schema_range',
    exact_runtime_identity_equality_may_gate_install_or_runtime: false,
    host_path_only_resolution_can_prove_parity: false,
    active_aionui_status: 'aioncore_managed_identity_binding_packaged_full_standard_finder_replay_passed',
    opl_studio_status: 'launcher_explicit_runtime_resolution_implemented_direct_launch_host_path_fallback_remains',
    same_physical_runtime_currently_claimed: true,
    implementation_status: 'source_identity_binding_and_full_standard_finder_evidence_complete',
  })) {
    if (policy?.[field] !== expected) {
      throw new Error(`Runtime bridge shared GUI runtime resolution policy ${field} must be ${expected}`);
    }
  }

  const identityContract = policy?.runtime_identity_contract;
  for (const [field, expected] of Object.entries({
    schema: 'opl_codex_runtime_identity.v1',
    contract_owner: 'one-person-lab-app',
    producer_owner: 'gaofeng21cn/opl-aion-shell',
    carrier: 'aioncore_managed_resources_projection',
    direct_app_server_binding: 'identity_verified_before_exact_codex_app_server_spawn',
    aioncore_acp_binding:
      'unique_managed_candidate_plus_inherited_environment_plus_successful_conversation_handshake',
    aioncore_modification_required: false,
    aioncore_native_readback_required: false,
    aioncore_native_readback_currently_available: false,
    aioncore_native_readback_claim_allowed: false,
  })) {
    if (identityContract?.[field] !== expected) {
      throw new Error(`Runtime bridge Codex identity contract ${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    identityContract?.required_fields,
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
    'Runtime bridge Codex identity fields',
  );
  assertDeepEqualJson(
    identityContract?.environment_binding_fields,
    [
      'OPL_CODEX_BIN',
      'CODEX_HOME',
      'OPL_CODEX_RUNTIME_IDENTITY_JSON',
      'OPL_CODEX_RUNTIME_COHORT_REF',
      'PATH',
    ],
    'Runtime bridge Codex identity environment binding',
  );
  assertDeepEqualJson(
    identityContract?.typed_error_codes,
    [
      'USER_AGENT_NOT_INSTALLED',
      'USER_AGENT_COMMAND_NOT_FOUND',
      'MANAGED_RUNTIME_UNAVAILABLE',
      'RUNTIME_ACTIVATION_REQUIRED',
      'RUNTIME_IDENTITY_MISMATCH',
    ],
    'Runtime bridge Codex identity typed errors',
  );

  const evidenceContract = policy?.packaged_evidence_contract;
  for (const [field, expected] of Object.entries({
    schema_ref: 'contracts/opl-codex-runtime-identity-evidence.schema.json',
    launch_entrypoint: 'finder',
    minimal_path: '/usr/bin:/bin',
    global_codex_required: false,
    referenced_file_sha256_required: true,
    claim_scope: 'opl_controlled_input_and_successful_handshake_without_aioncore_native_readback',
    artifact_trigger_status: 'complete',
    evidence_receipt: 'docs/delivery/release-evidence/issue-122-codex-runtime-identity-v26.8.1-r5.json',
  })) {
    if (evidenceContract?.[field] !== expected) {
      throw new Error(`Runtime bridge Codex packaged evidence ${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    evidenceContract?.required_run_ids,
    ['full_clean_install_finder', 'standard_update_after_full_finder'],
    'Runtime bridge Codex packaged evidence runs',
  );
  assertDeepEqualJson(
    evidenceContract?.identity_comparison_fields,
    ['path', 'realpath', 'version', 'sha256', 'codex_home', 'runtime_cohort_ref'],
    'Runtime bridge Codex packaged identity comparison fields',
  );
  assertDeepEqualJson(
    evidenceContract?.required_handshakes,
    ['direct_app_server_initialize', 'aioncore_acp_ordinary_conversation_real_response'],
    'Runtime bridge Codex packaged handshakes',
  );
}

function validateCanonicalConversationContinuityPolicy(runtimeBridge) {
  const policy = runtimeBridge.canonical_conversation_continuity_policy;
  for (const [field, expected] of Object.entries({
    state: 'target_with_current_shell_deviations',
    thread_truth_owner: 'codex_core_app_server',
    thread_turn_authority: 'codex_core_app_server',
    canonical_identity: 'host_identity_plus_opaque_app_server_thread_id',
    ordinary_rail_authority: 'codex_app_server_thread_list_read_resume',
    canonical_runtime_owner: 'codex_core_app_server',
    aioncore_runtime_ensure_scope: 'non_canonical_acp_conversations_only',
    canonical_input_focus_warmup_policy: 'skip_aioncore_runtime_ensure',
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
    active_aionui_status: 'shell_local_conversation_repository_requires_canonical_projection',
    opl_studio_status: 'resume_capable_full_local_transcript_cache_requires_canonical_thread_directory',
    pin_role: 'shell_ui_metadata_only',
    local_reset_role: 'retain_existing_aionui_conversation_semantics_not_app_server_history_reset',
    workspace_directory_role:
      'new_session_initial_cwd_projectless_adoption_grouping_and_visible_metadata_only_not_authorization_domain',
    row_identity: 'canonical_thread_id',
    duplicate_row_per_canonical_thread_allowed: false,
    title_based_deduplication_allowed: false,
    e2e_fixture_storage_policy: 'isolated_storage_root_never_production_user_data',
    acceptance: 'both_shells_project_the_same_app_server_thread_directory_and_resume_by_canonical_identity',
    implementation_status:
      'project_affinity_source_implemented_other_continuity_not_proven_across_both_shells',
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
      migration_state: 'framework_transport_binding_projection_and_dual_shell_source_e2e_completed',
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

function validateCodexParityAdapterPolicies(runtimeBridge) {
  if ('codex_local_worktree_handoff_policy' in runtimeBridge) {
    throw new Error('Runtime bridge must not own a Local or Worktree handoff policy');
  }
  assertDeepEqualJson(
    runtimeBridge.codex_review_surface_policy,
    {
      state:
        'source_partial_last_turn_and_custom_target_instructions_implemented_review_focus_and_inline_comments_protocol_blocked',
      host_surface: 'existing_files_changes_diff_surface',
      review_targets: ['uncommitted', 'base_branch', 'commit', 'custom'],
      delivery_modes: ['inline', 'detached'],
      default_section: 'unstaged',
      sections: ['unstaged', 'staged', 'commit', 'branch', 'last_turn'],
      capabilities: ['pull_request_context', 'inline_comments', 'stage', 'commit', 'push'],
      source_capability_status: {
        last_turn: 'source_implemented_existing_message_store',
        review_focus_context: 'source_blocked_missing_public_review_focus_protocol',
        inline_comments: 'source_blocked_missing_typed_codex_protocol',
      },
      last_turn_source_policy: 'latest_visible_user_message_then_completed_workspace_edit_tool_calls',
      review_focus_delivery_policy:
        'custom_target_instructions_via_review_start_target_custom_only_non_custom_focus_not_exposed',
      review_focus_failure_policy:
        'non_custom_focus_protocol_unavailable_before_review_start_without_turn_steer_fallback_fake_success_audit_or_side_effects',
      inline_comment_protocol_requirement:
        'typed_codex_app_server_file_line_comment_request_location_and_failure_semantics',
      inline_comment_forbidden_fallbacks: ['shell_local_annotation_store', 'fake_success'],
      pull_request_context_dependency: 'gh',
      pull_request_context_unavailable_policy: 'show_explicit_unavailable_state',
      git_authority: 'existing_codex_git_integration',
      shell_role: 'thin_adapter_only',
      duplicate_git_store_allowed: false,
    },
    'Codex Review surface policy',
  );
}

function validateRuntimeBridgeProjectionContracts(runtimeBridge) {
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

function validatePackageReadinessProjection(runtimeBridge) {
  const rows = runtimeBridge.canonical_state_display_action_map?.rows;
  const runtimeRow = Array.isArray(rows) ? rows.find((row) => row?.semantic_area === 'runtime') : null;
  const packageRow = Array.isArray(rows) ? rows.find((row) => row?.semantic_area === 'package') : null;
  const nativeShellRole = runtimeBridge.canonical_state_display_action_map?.shells?.opl_studio?.role;
  if (
    runtimeRow?.route_classification !== 'core_dynamic_agent_runtime'
    || runtimeRow.producer_required !== true
    || runtimeRow.aionui_route_required !== true
    || runtimeRow.adopted_shell_route_required !== true
    || runtimeRow?.canonical_source !==
      'opl app state --profile fast --json#app_state.operator.workbench.work_item_projection_v2'
    || runtimeRow.aion_display_role !==
      'minimal WorkItem status, Stage, Attempt, Token, next action, and archive/restore'
    || runtimeRow.workbench_display_role !== 'core Runtime consumer required before shell adoption'
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

function validateNativeMinimumProductBridge(runtimeBridge) {
  const launch = runtimeBridge.native_minimum_product_bridge?.agent_conversation_launch;
  if (launch?.catalog_source !== 'app_state.agent_packages.directory.entries') {
    throw new Error('Native Agent launch catalog must read the raw Framework directory before applying App membership');
  }
  assertDeepEqualJson(
    launch?.opl_standard_agent_membership_policy,
    appOwnedOplStandardAgentMembershipPolicy,
    'Native standard Agent membership policy',
  );
}

function validateRuntimeSurfaceOwnerMatrix(runtimeBridge) {
  const matrix = runtimeBridge.runtime_surface_owner_matrix;
  for (const [field, expected] of Object.entries({
    purpose: 'keep_runtime_resource_task_data_lifecycle_refs_single_sourced',
    app_policy_owner: 'one-person-lab-app',
    family_projection_owner: 'one-person-lab',
    active_shell_role: 'thin_renderer_consumer',
    distribution_mirror_role: 'release_transport_only',
  })) {
    if (matrix?.[field] !== expected) {
      throw new Error(`Runtime surface owner matrix ${field} must be ${expected}`);
    }
  }
  const rows = matrix?.surface_rows;
  if (!Array.isArray(rows) || rows.length !== 5) {
    throw new Error('Runtime surface owner matrix must declare five surface rows');
  }
  const rowBySurface = new Map(rows.map((row) => [row?.surface, row]));
  for (const [surface, owner] of Object.entries({
    'OPL Runtime Fabric': 'one-person-lab-app',
    'Environment Materializer': 'one-person-lab',
    'TaskRunProjection v2': 'one-person-lab',
    'OPL Fabric resource refs': 'one-person-lab',
    'Local data lifecycle': 'one-person-lab-app',
  })) {
    const row = rowBySurface.get(surface);
    if (row?.source_owner !== owner) {
      throw new Error(`Runtime surface owner matrix ${surface} source_owner must be ${owner}`);
    }
    if (typeof row?.producer_owner !== 'string' || !row.producer_owner) {
      throw new Error(`Runtime surface owner matrix ${surface} must declare producer_owner`);
    }
    if (!Array.isArray(row?.forbidden_second_truth) || row.forbidden_second_truth.length === 0) {
      throw new Error(`Runtime surface owner matrix ${surface} must declare forbidden_second_truth`);
    }
  }
  if (!matrix?.homebrew_policy?.includes('must not decide runtime, task, resource, data lifecycle')) {
    throw new Error('Runtime surface owner matrix must keep Homebrew as release transport only');
  }
  for (const forbidden of [
    'second_resource_state_machine',
    'shell_owned_task_queue',
    'app_owned_domain_receipts',
    'homebrew_currentness_gate',
    'health_platform_runtime_authority',
  ]) {
    if (!matrix?.must_not_add_layers?.includes(forbidden)) {
      throw new Error(`Runtime surface owner matrix must forbid ${forbidden}`);
    }
  }
}

function validateRuntimeBridgeAuthorityBoundary(runtimeBridge) {
  for (const [field, expected] of Object.entries({
    shell_adapter_can_own_runtime_truth: false,
    app_can_own_runtime_truth: false,
    app_can_write_domain_truth: false,
    app_can_read_artifact_body: false,
    app_can_read_memory_body: false,
    app_can_authorize_quality_verdict: false,
    app_can_authorize_export_verdict: false,
    app_can_write_sqlite_sidecar: false,
    app_can_mutate_state_index_kernel: false,
    app_can_write_owner_receipt: false,
    app_can_authorize_readiness: false,
    app_can_authorize_artifact_authority: false,
    provider_completion_is_domain_ready: false,
  })) {
    if (runtimeBridge.authority_boundary?.[field] !== expected) {
      throw new Error(`Runtime bridge authority_boundary.${field} must be ${expected}`);
    }
  }
}

function validateRuntimeBridgeReplacementPolicy(runtimeBridge) {
  for (const [field, expected] of Object.entries({
    runtime_protocol_stable_across_shell_replacement: true,
    shell_adapter_must_call_declared_opl_cli_surfaces: true,
    new_shell_adapter_must_pass_active_shell_validation: true,
    direct_domain_repo_reads_are_forbidden: true,
    direct_runtime_state_file_reads_are_forbidden: true,
    direct_sqlite_sidecar_reads_are_forbidden: true,
    direct_state_index_kernel_writes_are_forbidden: true,
  })) {
    if (runtimeBridge.replacement_policy?.[field] !== expected) {
      throw new Error(`Runtime bridge replacement_policy.${field} must be ${expected}`);
    }
  }
}

function validateRuntimeBridgeForbiddenTruthSources(runtimeBridge) {
  for (const forbidden of [
    'direct_domain_repo_reads',
    'direct_runtime_state_file_reads',
    'direct_opl_internal_state_file_reads',
    'direct_opl_sqlite_sidecar_reads',
    'direct_state_index_kernel_file_reads',
    'direct_state_index_kernel_writes',
    'domain_artifact_body_reads',
    'domain_memory_body_reads',
    'shell_private_runtime_status',
    'shell_local_storage_work_item_visibility',
  ]) {
    if (!runtimeBridge.forbidden_truth_sources?.includes(forbidden)) {
      throw new Error(`Runtime bridge must forbid ${forbidden}`);
    }
  }
}

export function validateRuntimeBridgeContract(runtimeBridge, contract) {
  validateRuntimeBridgeIdentity(runtimeBridge, contract);
  validateRuntimeBridgeDeclaredSurfaces(runtimeBridge);
  validateOplGatewayAccountContract(runtimeBridge);
  validateRuntimeBridgeDefaultReadSurfacePolicy(runtimeBridge);
  validateRuntimeBridgeCommandResolutionPolicy(runtimeBridge);
  validateSharedGuiRuntimeResolutionPolicy(runtimeBridge);
  validateCanonicalConversationContinuityPolicy(runtimeBridge);
  validateCodexParityAdapterPolicies(runtimeBridge);
  validateRuntimeBridgeProjectionContracts(runtimeBridge);
  validatePackageReadinessProjection(runtimeBridge);
  validateNativeMinimumProductBridge(runtimeBridge);
  validateRuntimeBridgeUserTaskStatus(runtimeBridge);
  validateRuntimeSurfaceOwnerMatrix(runtimeBridge);
  validateRuntimeBridgeAuthorityBoundary(runtimeBridge);
  validateRuntimeBridgeReplacementPolicy(runtimeBridge);
  validateRuntimeBridgeForbiddenTruthSources(runtimeBridge);
  validateLiveConformanceContract(runtimeBridge.live_conformance_gate);
}
