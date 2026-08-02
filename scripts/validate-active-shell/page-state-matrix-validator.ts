import { assertDeepEqualJson, assertIncludesAll, readJson } from './assertions.ts';
import { isDefaultReleaseAdapter } from './active-shell-contract.ts';
import {
  beginnerFirstRunTestIds,
  domainDetailViewDescriptorFields,
  domainDetailViewDescriptorOptionalFields,
  firstRunModelAccessSetupPolicy,
  focusedFirstRunPresentationPolicy,
  progressiveFirstRunRecoveryPolicy,
  progressiveFirstRunRecoveryTestIds,
  runtimeVisibilityPageStateIds,
} from './app-contract-constants.ts';
import {
  assertNonEmptyStringArray,
  validateBeginnerFirstRunPresentation,
  assertFirstRunProgressModelMatches,
} from './shared-contract-validators.ts';
import {
  validateAppSettingsPages,
} from './page-state-app-settings-validator.ts';
import { validatePrimaryInteractionPages } from './page-state-primary-interaction-validator.ts';
import { productProfilePath } from './validation-config.ts';
import {
  validateRuntimeCockpitAcceptanceBoundary,
  validateRuntimeCockpitPageStateAcceptance,
} from './runtime-cockpit-product-validator.ts';
import { validateScheduledTasksPageState } from './scheduled-tasks-policy-validator.ts';

const productProfile = readJson(productProfilePath);
const expectedFirstRunProgressModel = productProfile.first_run?.progress_model;
const expectedFirstRunCoreItems = assertNonEmptyStringArray(
  productProfile.first_run?.ready_to_launch_gate?.required_core_items,
  'Product profile ready_to_launch required_core_items',
);
const expectedFullReadinessItems = (productProfile.first_run?.full_readiness_layers ?? [])
  .filter((item) => item !== 'core');

function validateRuntimeVisibilityPageStateMatrix(stateMatrix, label) {
  for (const [field, expected] of Object.entries({
    authority: 'opl_framework_work_item_visibility',
    projection_path: 'app_state.operator.workbench.work_item_projection_v2.items[].visibility',
    default_surface: 'runtime_main_visible_only',
    archived_surface: 'archived_tasks_library',
    archived_surface_is_saved_status_view: false,
    scope_hierarchy: 'agent_then_project_for_both_surfaces',
    status_filters_include_agent_project_or_visibility: false,
    local_storage_truth_allowed: false,
  })) {
    if (stateMatrix?.[field] !== expected) {
      throw new Error(`${label}.${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    stateMatrix?.visibility_values,
    ['visible', 'archived'],
    `${label}.visibility_values`,
  );
  assertDeepEqualJson(
    stateMatrix?.visibility_required_fields,
    ['state', 'source', 'updated_at', 'control_ref', 'generation'],
    `${label}.visibility_required_fields`,
  );
  if (stateMatrix?.generation_is_concurrency_token !== true) {
    throw new Error(`${label}.generation_is_concurrency_token must be true`);
  }
  const mutation = stateMatrix?.mutation;
  for (const [field, expected] of Object.entries({
    action_id: 'work_item_visibility_set',
    command: 'opl app action execute --action work_item_visibility_set --payload <json> --json',
    expected_generation_source: 'item.visibility.generation',
    expected_generation_required_when_available: true,
    concurrency_token_source: 'item.visibility.generation',
    refresh_after_execute: 'opl app state --profile fast --json',
    readback_selector:
      'work_item_projection_v2.items[identity.agent_id=payload.agent_id && identity.project_id=payload.project_id && identity.work_item_id=payload.work_item_id]',
    readback_must_match_requested_visibility: true,
    optimistic_local_truth_commit_allowed: false,
    failure_preserves_authoritative_projection: true,
  })) {
    if (mutation?.[field] !== expected) {
      throw new Error(`${label}.mutation.${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    mutation?.payload_required_fields,
    ['agent_id', 'project_id', 'work_item_id', 'visibility_state'],
    `${label}.mutation.payload_required_fields`,
  );
  assertDeepEqualJson(
    mutation?.payload_optional_fields,
    ['reason', 'expected_generation'],
    `${label}.mutation.payload_optional_fields`,
  );
  assertDeepEqualJson(
    mutation?.readback_identity_fields,
    ['identity.agent_id', 'identity.project_id', 'identity.work_item_id'],
    `${label}.mutation.readback_identity_fields`,
  );
  assertDeepEqualJson(
    mutation?.readback_required_fields,
    [
      'item_id',
      'identity.agent_id',
      'identity.project_id',
      'identity.work_item_id',
      'visibility.state',
      'visibility.source',
      'visibility.updated_at',
      'visibility.control_ref',
      'visibility.generation',
      'lifecycle',
      'execution',
      'telemetry',
    ],
    `${label}.mutation.readback_required_fields`,
  );
  assertDeepEqualJson(
    stateMatrix?.archive_confirmation,
    {
      required: true,
      must_explain: [
        'archive_changes_visibility_only',
        'archive_does_not_change_lifecycle_or_delete_evidence',
        'work_may_continue_running',
        'stopping_work_requires_a_separate_action',
      ],
    },
    `${label}.archive_confirmation`,
  );
  const pageStates = stateMatrix?.page_states;
  if (!Array.isArray(pageStates)) {
    throw new Error(`${label}.page_states must be an array`);
  }
  assertDeepEqualJson(
    pageStates.map((state) => state?.id),
    runtimeVisibilityPageStateIds,
    `${label}.page_states ids`,
  );
  if (pageStates.some((state) => typeof state?.required_ui !== 'string' || !state.required_ui)) {
    throw new Error(`${label}.page_states must declare required_ui for every state`);
  }
  const conflict = pageStates.find((state) => state.id === 'stale_generation_conflict');
  if (
    conflict?.when !== 'work_item_control_generation_conflict'
    || conflict?.required_ui !== 'refresh_authoritative_projection_then_prompt_user_to_retry'
    || conflict?.automatic_overwrite_allowed !== false
  ) {
    throw new Error(`${label} stale generation conflict must refresh and prompt retry without overwrite`);
  }
  const en = pageStates.find((state) => state.id === 'locale_en_us');
  const zh = pageStates.find((state) => state.id === 'locale_zh_cn');
  if (
    en?.when !== 'current_app_locale_en-US'
    || en?.forbidden_ui !== 'framework_hardcoded_chinese_copy_or_cross_locale_raw_fallback'
    || zh?.when !== 'current_app_locale_zh-CN'
    || zh?.forbidden_ui !== 'framework_hardcoded_english_copy_or_cross_locale_raw_fallback'
  ) {
    throw new Error(`${label} must cover English and Chinese semantic-copy rendering without cross-locale fallback`);
  }
}

export function validatePageStateMatrix(matrix, contract, guiProductContract) {
  if (isDefaultReleaseAdapter(contract) && (matrix.active_shell !== contract.active_shell || matrix.shell_root !== contract.shell_root)) {
    throw new Error('Page-state matrix must target the active shell contract');
  }

  const requiredPages = new Set([
    'guid_home',
    'scheduled_tasks',
    'settings_general',
    'gateway',
    'access',
    'settings_workspace',
    'agents',
    'capabilities',
    'settings_resources',
    'environment',
    'storage',
    'about',
    'update',
    'settings_theme',
    'settings_local_services',
    'settings_personalization',
    'first_launch_readiness',
    'runtime',
  ]);
  for (const page of matrix.pages ?? []) {
    requiredPages.delete(page.id);
    if (!page.expected_source || !Array.isArray(page.must_show) || page.must_show.length === 0) {
      throw new Error(`Invalid page-state entry: ${JSON.stringify(page)}`);
    }
  }
  if (requiredPages.size > 0) {
    throw new Error(`Page-state matrix is missing required page(s): ${[...requiredPages].join(', ')}`);
  }
  const runtimePage = (matrix.pages ?? []).find((page) => page.id === 'runtime');
  for (const [field, expected] of Object.entries({
    route_classification: 'core_dynamic_agent_runtime',
    default_product_required: true,
    adopted_shell_required: true,
    explicit_validation_command: 'npm run validate:runtime-route',
  })) {
    if (runtimePage[field] !== expected) {
      throw new Error(`Core Runtime page ${field} must be ${expected}`);
    }
  }
  if ((matrix.pages ?? []).some((page) => page.id === 'docker_webui')) {
    throw new Error('Page-state matrix must not include withdrawn Docker/WebUI username, title, logo, or branding requirements');
  }

  validatePrimaryInteractionPages(matrix);
  validateAppSettingsPages(matrix, guiProductContract);
  validateScheduledTasksPageState(
    (matrix.pages ?? []).find((page) => page.id === 'scheduled_tasks'),
    guiProductContract.scheduled_tasks_policy,
  );

  const firstLaunchPage = (matrix.pages ?? []).find((page) => page.id === 'first_launch_readiness');
  if (!firstLaunchPage) {
    throw new Error('Page-state matrix is missing first_launch_readiness page');
  }
  if (
    firstLaunchPage.launch_gate?.id !== 'ready_to_launch' ||
    firstLaunchPage.launch_gate?.ui_order !== 'before_first_conversation_not_before_guid' ||
    firstLaunchPage.launch_gate?.guid_navigation_blocking !== false
  ) {
    throw new Error('First-launch readiness page must gate first conversation without blocking /guid navigation');
  }
  if (firstLaunchPage.launch_gate?.full_readiness_blocks_ready_to_launch !== false) {
    throw new Error('First-launch readiness page must keep full readiness non-blocking for ready_to_launch');
  }
  validateBeginnerFirstRunPresentation(
    firstLaunchPage.beginner_view_model,
    'First-launch readiness beginner view model',
    expectedFirstRunCoreItems,
  );
  for (const [field, expected] of Object.entries(focusedFirstRunPresentationPolicy)) {
    if (firstLaunchPage.beginner_view_model?.[field] !== expected) {
      throw new Error(`First-launch readiness beginner view model ${field} must be ${expected}`);
    }
  }
  assertDeepEqualJson(
    firstLaunchPage.beginner_view_model?.model_access_setup,
    firstRunModelAccessSetupPolicy,
    'First-launch readiness model access setup policy',
  );
  assertDeepEqualJson(
    firstLaunchPage.beginner_view_model?.primary_steps,
    expectedFirstRunCoreItems,
    "First-launch readiness beginner primary steps",
  );
  assertIncludesAll(
    firstLaunchPage.beginner_view_model?.required_shell_testids,
    beginnerFirstRunTestIds,
    'First-launch readiness beginner shell test ids',
  );
  const ordinaryRecovery = firstLaunchPage.ordinary_shell_recovery;
  if (
    ordinaryRecovery?.fresh_webui_login_setup_check_intent !==
      progressiveFirstRunRecoveryPolicy.fresh_webui_login_setup_check_intent ||
    ordinaryRecovery?.fresh_webui_login_known_incomplete_route !==
      progressiveFirstRunRecoveryPolicy.fresh_webui_login_known_incomplete_route ||
    ordinaryRecovery?.fresh_webui_login_unknown_policy !==
      progressiveFirstRunRecoveryPolicy.fresh_webui_login_unknown_policy ||
    ordinaryRecovery?.fresh_webui_login_ui_timeout_ms !==
      progressiveFirstRunRecoveryPolicy.fresh_webui_login_ui_timeout_ms ||
    ordinaryRecovery?.persistent_setup_entry_route !== progressiveFirstRunRecoveryPolicy.persistent_setup_entry_route ||
    ordinaryRecovery?.persistent_home_composer_runtime_alert !==
      progressiveFirstRunRecoveryPolicy.persistent_home_composer_runtime_alert ||
    ordinaryRecovery?.unknown_readiness_policy !== progressiveFirstRunRecoveryPolicy.unknown_readiness_policy
  ) {
    throw new Error('First-launch page-state ordinary shell recovery policy is invalid');
  }
  assertDeepEqualJson(
    ordinaryRecovery.plain_conversation_required_items,
    progressiveFirstRunRecoveryPolicy.plain_conversation_required_items,
    'First-launch page-state plain conversation prerequisites',
  );
  assertDeepEqualJson(
    ordinaryRecovery.send_scoped_local_input_required_items,
    progressiveFirstRunRecoveryPolicy.send_scoped_local_input_required_items,
    'First-launch page-state send-scoped local input prerequisites',
  );
  assertDeepEqualJson(
    ordinaryRecovery.workspace_control_required_items,
    progressiveFirstRunRecoveryPolicy.workspace_control_required_items,
    'First-launch page-state workspace control prerequisites',
  );
  assertIncludesAll(
    ordinaryRecovery.required_shell_testids,
    progressiveFirstRunRecoveryTestIds,
    'First-launch page-state progressive recovery shell test ids',
  );
  for (const item of expectedFirstRunCoreItems) {
    if (!firstLaunchPage.launch_gate?.required_core_items?.includes(item)) {
      throw new Error(`First-launch readiness page must require Core item ${item}`);
    }
  }
  for (const item of expectedFullReadinessItems) {
    if (!firstLaunchPage.launch_gate?.full_readiness_items?.includes(item)) {
      throw new Error(`First-launch readiness page must list ${item} as full readiness`);
    }
  }
  for (const signal of [
    'workspace root readiness',
    'Codex CLI readiness',
    'Codex model access readiness',
    'ready_to_launch before first conversation, not before /guid',
    'full readiness and background maintenance state',
    'current initialization phase',
    'Core completed and total count',
    'Full readiness completed and total count',
    'background maintenance completed and total count',
    'next visible step',
    'beginner-facing readiness summary',
    'primary start action',
    'focused setup workspace before user enters /guid',
    'fixed three-step rail with one current task panel',
    'active rail step and task panel stay aligned to the first unready Core item',
    'authenticated standalone first-run route outside the ordinary product layout',
    'ordinary startup enters /guid with zero fast-state navigation wait while unknown readiness refreshes in the background without mutation',
    'explicit enter OPL action before readiness without mutating readiness',
    'Desktop and WebUI model access default to OPL Gateway account login with email and password while API Key remains a compatibility choice',
    'existing Codex recheck remains a secondary action outside the account and API Key method switch',
    'WebUI Gateway account login reuses the existing OPL runtime HTTP proxy and dedicated credentials stdin bridge',
    'model access method switching and alternate actions disabled while a request is active',
    'pending state without premature ready or no-blocker claims',
    'required Core checklist items reject disabled status as ready',
    '400x600 minimum window keeps the current primary action visible',
    'background shell inert and aria-hidden while first-run is active',
    'macOS traffic-light safe area and non-mac desktop window controls',
    'localized accessible names without testid labels',
    'localized inline errors with raw diagnostics only in technical details',
    'background maintenance collapsed technical disclosure',
    'technical details toggle',
  ]) {
    if (!firstLaunchPage.must_show?.includes(signal)) {
      throw new Error(`First-launch readiness page must show ${signal}`);
    }
  }
  for (const hiddenSignal of [
    'Homebrew, Node, Git, CLT, module, provider, or runtime maintenance as primary first-screen terminal goals',
    'Full readiness progress as the dominant first-screen message',
    'raw command output in the beginner primary area',
    'English runtime checklist labels in the Chinese beginner primary area',
    'Codex API Configuration, Unknown, or Needs setup in the Chinese beginner primary area',
    'background maintenance counters or labels in the beginner primary area',
    'ordinary product navigation before the user enters /guid',
    'focusable or screen-reader-visible ordinary shell before the user enters /guid',
    'navigation to /guid mutating or synthesizing ready_to_launch',
    'ordinary shortcut, tray, deep-link, or notification navigation mounted during first-run',
    'percentage progress as the dominant first-run signal',
    'simultaneous competing primary actions',
    'ready or no-blocker claims before initialize returns',
    'raw technical errors in beginner toasts',
    'testid strings as accessible names',
    'concurrent model access method actions',
    'automatic navigation away from the FirstRun completion state',
    'ordinary Settings routes from FirstRun technical details',
    'Gateway account device label controls during first-run',
    'submitted Gateway passwords or access keys in renderer errors or diagnostics',
  ]) {
    if (!firstLaunchPage.must_not_show?.includes(hiddenSignal)) {
      throw new Error(`First-launch readiness page must not show ${hiddenSignal}`);
    }
  }
  const localizationPolicy = firstLaunchPage.beginner_view_model?.localization_policy;
  assertIncludesAll(
    localizationPolicy?.chinese_primary_labels,
    ['工作目录', '本机助手', '模型访问'],
    'First-launch readiness beginner localization labels',
  );
  assertIncludesAll(
    localizationPolicy?.forbidden_primary_area_text,
    ['Codex API Configuration', 'Unknown', 'Needs setup', 'setup_flow', 'opl system'],
    'First-launch readiness beginner forbidden primary text',
  );
  if (
    localizationPolicy?.technical_label_policy !==
    'map_initialize_item_ids_to_app_owned_beginner_labels_before_rendering_primary_area'
  ) {
    throw new Error('First-launch readiness beginner localization must map initialize item ids before rendering');
  }
  assertFirstRunProgressModelMatches(
    firstLaunchPage.progress_model,
    expectedFirstRunProgressModel,
    'First-launch readiness page',
  );

  if (runtimePage.machine_source !== 'opl app state --profile fast --json') {
    throw new Error(`Runtime page machine_source must be fast App state, got: ${runtimePage.machine_source}`);
  }
  if (runtimePage.default_state_source !== 'opl app state --profile fast --json') {
    throw new Error(`Runtime page default_state_source must be fast App state, got: ${runtimePage.default_state_source}`);
  }
  if (runtimePage.diagnostic_source !== 'settings_control_center_only') {
    throw new Error(`Runtime diagnostics must be routed to Settings, got: ${runtimePage.diagnostic_source}`);
  }
  if (runtimePage.primary_projection !== 'app_state.operator.workbench.work_item_projection_v2') {
    throw new Error(`Runtime page primary_projection must be WorkItemProjection v2, got: ${runtimePage.primary_projection}`);
  }
  if (runtimePage.framework_command !== 'opl app state --profile fast --json') {
    throw new Error(`Runtime page must use the OPL App state command, got: ${runtimePage.framework_command}`);
  }
  if (runtimePage.framework_full_detail_command !== null) {
    throw new Error('Runtime page must not expose a global operator drilldown command');
  }
  for (const forbidden of [
    'framework_operator_summary_command',
    'operator_evidence_acceptance_path',
    'operator_evidence_path',
    'must_not_default_show',
  ]) {
    if (Object.hasOwn(runtimePage, forbidden)) {
      throw new Error(`Runtime page must not retain legacy ${forbidden}`);
    }
  }
  if (
    runtimePage.framework_action_command
    !== 'opl app action execute --action work_item_visibility_set --payload <json> --json'
  ) {
    throw new Error(`Runtime page must expose only work-item archive/restore, got: ${runtimePage.framework_action_command}`);
  }
  const acceptancePath = runtimePage.runtime_acceptance_path;
  if (acceptancePath?.role !== 'runtime_page_work_item_visibility_acceptance') {
    throw new Error('Runtime page must declare selected work-item visibility acceptance');
  }
  if (acceptancePath.accepts_refs_only_json !== true) {
    throw new Error('Runtime page acceptance must be refs-only JSON');
  }
  for (const [field, expected] of Object.entries({
    summary_state_command: 'opl app state --profile fast --json',
    refresh_state_command: 'opl app state --profile fast --json',
    full_drilldown_command: null,
    action_execute_command: 'opl app action execute --action work_item_visibility_set --payload <json> --json',
    action_route_source: 'work_item_projection.visibility',
    action_execution_policy: 'archive_or_restore_selected_work_item_only',
  })) {
    if (acceptancePath[field] !== expected) {
      throw new Error(`Runtime page acceptance ${field} must be ${expected}`);
    }
  }
  const runtimeViewModel = runtimePage.runtime_view_model;
  if (runtimeViewModel?.role !== 'opl_runtime_user_task_status') {
    throw new Error('Runtime page must declare OPL runtime user task status view model');
  }
  if (runtimeViewModel.bridge_contract !== 'contracts/app-runtime-bridge.json') {
    throw new Error(`Runtime page view model must reference app-runtime-bridge.json, got: ${runtimeViewModel.bridge_contract}`);
  }
  if (runtimeViewModel.default_mode !== 'user_task_status_first') {
    throw new Error('Runtime page view model must default to user_task_status_first');
  }
  if (runtimeViewModel.full_detail_policy !== 'selected_work_item_core_plus_typed_domain_detail_view_no_global_operator_drilldown') {
    throw new Error('Runtime page detail must stay selected-work-item only with typed domain detail views');
  }
  validateRuntimeCockpitAcceptanceBoundary(
    matrix.acceptance_boundary,
    'Runtime page-state acceptance boundary',
  );
  validateRuntimeCockpitPageStateAcceptance(
    runtimeViewModel.runtime_cockpit_acceptance,
    guiProductContract.pages?.runtime_status?.runtime_cockpit_product_contract,
    'Runtime page cockpit acceptance',
  );
  validateRuntimeVisibilityPageStateMatrix(
    runtimeViewModel.work_item_visibility_state_matrix,
    'Runtime work-item visibility page-state matrix',
  );
  if (
    runtimeViewModel.polling_fallback?.interval_seconds_min !== 5
    || runtimeViewModel.polling_fallback?.interval_seconds_max !== 10
    || runtimeViewModel.polling_fallback?.policy !== 'lightweight_polling_until_push_projection_available'
  ) {
    throw new Error('Runtime page polling fallback must be lightweight 5-10 second polling');
  }
  const domainDetail = runtimeViewModel.domain_detail_view;
  assertDeepEqualJson(
    domainDetail?.descriptor_required_fields,
    domainDetailViewDescriptorFields,
    'Runtime domain detail descriptor required fields',
  );
  assertDeepEqualJson(
    domainDetail?.descriptor_optional_fields,
    domainDetailViewDescriptorOptionalFields,
    'Runtime domain detail descriptor optional fields',
  );
  if (
    domainDetail?.capability_policy_ref !==
      'contracts/app-runtime-bridge.json#work_item_projection.field_contracts.domain_detail_views'
  ) {
    throw new Error('Runtime domain detail view must reference the optional bridge capability policy');
  }
  assertDeepEqualJson(
    domainDetail?.capability_absent,
    {
      runtime_page: 'preserved',
      work_item_list: 'preserved',
      selected_item_core_detail: 'preserved',
      dependent_view_entries: 'hidden',
      direct_detail_route: 'localized_unavailable_with_return_to_runtime',
      global_failure: 'forbidden',
    },
    'Runtime optional domain detail capability absence state',
  );
  if (
    domainDetail?.lazy_read_command !==
      'opl app view read --item-id <canonical-item-id> --view-id <view-id> [--if-revision <revision>] --json'
    || domainDetail?.renderer_selection_field !== 'view_kind'
    || domainDetail?.agent_id_branching_allowed !== false
    || domainDetail?.full_payload_in_fast_state_allowed !== false
    || domainDetail?.machine_fields_visible !== false
  ) {
    throw new Error('Runtime domain detail views must be lazy, typed, agent-agnostic, and hide machine fields');
  }
  if (
    domainDetail?.renderer_registry_source !== 'shell_extension_registry'
    || domainDetail?.generic_view?.route !== '/runtime/item/:itemId/insights/:viewId'
    || domainDetail?.generic_view?.renderer_selection_field !== 'view_kind'
    || domainDetail?.generic_view?.renderer_registry_source !== 'shell_extension_registry'
    || domainDetail?.generic_view?.unknown_view_kind_policy !== 'localized_unavailable_preserve_work_item_and_return_to_runtime'
    || domainDetail?.generic_view?.layout !== 'full_width_owner_view'
    || domainDetail?.generic_view?.app_domain_payload_interpretation_allowed !== false
  ) {
    throw new Error('Runtime typed owner views must use the generic item-scoped route and local unknown-kind degradation');
  }
  if (domainDetail?.full_payload_in_fast_state_allowed !== false) {
    throw new Error('Runtime typed owner views must not embed full payloads in fast state');
  }
  assertDeepEqualJson(
    domainDetail?.generic_view?.app_validation_scope,
    ['generic_envelope', 'transport_state', 'responsive_layout', 'keyboard_access'],
    'Runtime generic owner view App validation scope',
  );
  assertDeepEqualJson(
    domainDetail?.states?.map((state) => state.id),
    ['loading', 'unread', 'available', 'missing', 'stale', 'invalid', 'read_error', 'not_modified'],
    'Runtime domain detail view states',
  );
  for (const [field, expected] of Object.entries({
    primary_state_source: 'opl app state --profile fast --json',
    refresh_state_source: 'opl app state --profile fast --json',
    summary_source: 'app_state.operator.workbench.work_item_projection_v2',
    full_detail_source: 'selected_work_item_from_work_item_projection_v2_plus_item_scoped_domain_detail_view',
    'action_queue.runtime_page_allowed_action': 'fresh_projection_enumerated_selected_work_item_contextual_actions_only',
    'action_queue.platform_action_catalog_visible': false,
    'action_queue.platform_action_owner_surface': '/settings/environment',
    'authority_boundary.action_execution_owner': 'opl_framework',
    'authority_boundary.domain_verdict_owner': 'domain_agent',
  })) {
    const actual = field.split('.').reduce((value, key) => value?.[key], runtimeViewModel);
    if (actual !== expected) {
      throw new Error(`Runtime page view model ${field} must be ${expected}`);
    }
  }
  if (runtimeViewModel.diagnostics?.default_visibility !== 'absent_from_runtime') {
    throw new Error('Runtime page diagnostics must be absent and owned by Settings');
  }
  assertDeepEqualJson(
    runtimeViewModel.diagnostics?.sections,
    [],
    'Runtime page diagnostics sections',
  );
  if (runtimeViewModel.diagnostics?.owner_surface !== '/settings/environment?section=diagnostics') {
    throw new Error('Runtime diagnostics owner surface must be Maintenance diagnostics');
  }
  if (runtimeViewModel.authority_boundary?.refs_only !== true) {
    throw new Error('Runtime page view model must be refs-only');
  }
  if (runtimeViewModel.authority_boundary?.non_authority_display_only !== true) {
    throw new Error('Runtime page view model must be display-only for non-authority domain refs');
  }
  const requiredEvidencePath = [
    'WorkItemProjection v2 project status',
    'top-level item_id row and detail identity with full agent_id plus project_id plus work_item_id mutation and readback tuple',
    'project display name from canonical workspace_path basename',
    'action title_key and summary_key with one message_args object plus owner and owner_kind rendered in the current App locale',
    'visible Runtime main list and separate archived tasks library using the same Agent then Project scope',
    'work_item_visibility_set expected generation execute, fast refresh, and authoritative readback',
    'generation conflict refresh followed by user retry',
    'task title, lifecycle status, execution state, current Stage, next Stage, next action, owner, elapsed time, and Token usage',
    'Stage popover with complete Stage order and current Attempt',
    'Stage popover click independent from task detail drawer',
    'telemetry missing fallback when elapsed, heartbeat, or usage are absent',
    'fast App state refresh',
    'operator summaries, safe actions, software updates, platform repair, module health, and provider diagnostics excluded from Runtime and routed to Settings',
  ];
  assertDeepEqualJson(runtimePage.runtime_acceptance_evidence, requiredEvidencePath, 'Runtime page acceptance evidence');
  const requiredRuntimeSignals = [
    'WorkItemProjection v2 project status',
    'two-level Agent then Project scope',
    'single-select status filter and Archived tasks entry',
    'top-level item_id row and detail identity with full mutation and readback tuple',
    'canonical workspace_path basename as the Runtime Project display name',
    'localized action, Next Step, and owner copy from semantic keys and owner kind',
    'visible-only Runtime main list and separate Archived tasks library with restore',
    'work_item_visibility_set mutation with expected generation, refresh, and readback',
    'stale generation conflict refresh and retry state',
    'task title, lifecycle status, execution state, current Stage, next Stage, next action, owner, and elapsed time',
    'current stage usage and task total usage or telemetry missing',
    'clickable current Stage popover with complete Stage order, next Stage, and current Attempt',
    'Stage click does not open the task detail drawer',
    'selected task detail drawer with Stage Map, heartbeat, Token, and action only',
    'operator summaries, safe actions, software updates, platform repair, module health, and provider diagnostics excluded from Runtime and routed to Settings',
    'responsive semantic row reflow without horizontal page overflow',
    'localized failure summary with Retry and Open Maintenance actions',
    'collapsed copyable technical details that wrap without clipping at 375px and 400px',
    'mutually exclusive loading, ready, empty, error, and unavailable states',
  ];
  assertDeepEqualJson(runtimePage.must_show, requiredRuntimeSignals, 'Runtime page must_show');
  assertDeepEqualJson(
    runtimePage.must_not_show,
    [
      'operator summary',
      'safe action catalog',
      'software updates',
      'platform maintenance actions',
      'module health panel',
      'provider diagnostics',
      'State Index',
      'artifact provenance',
      'raw IDs',
      'raw logs',
      'raw refs',
      'receipt refs',
      'workflow IDs and historical attempt IDs',
      'Temporal',
      'raw projection',
      'evidence ledger',
      'current_control_state',
      'release evidence',
      'raw JSON, absolute paths, or Node warnings on the primary failure surface',
      'simultaneous refresh-failed and unavailable panels',
    ],
    'Runtime page forbidden display terms',
  );
  const forbiddenRuntimeOwners = [
    'runtime truth',
    'provider implementation',
    'domain truth',
    'memory body',
    'artifact body',
    'domain artifact body',
    'artifact authority',
    'SQLite sidecar write authority',
    'State Index Kernel mutation authority',
    'quality/readiness/export verdict',
    'deliverable progress truth',
    'platform repair truth',
    'action route authority',
    'localStorage work-item visibility truth',
    'domain action approval override',
    'owner receipt authority',
    'family production readiness',
  ];
  for (const owner of forbiddenRuntimeOwners) {
    if (!runtimePage.must_not_own?.includes(owner)) {
      throw new Error(`Runtime page must not own ${owner}`);
    }
  }
  if (matrix.canonical_state_surface?.default_command !== 'opl app state --profile fast --json') {
    throw new Error('Page-state matrix canonical default state command must be fast App state');
  }
  if (matrix.canonical_state_surface.refresh_command !== 'opl app state --profile fast --json') {
    throw new Error('Page-state matrix canonical refresh state command must be fast App state');
  }
  if (matrix.canonical_action_surface?.command !== 'opl app action execute --action <action_id> [--payload json] [--dry-run] --json') {
    throw new Error('Page-state matrix canonical action command must be the OPL App action execute boundary');
  }
  const advancedDetail = matrix.advanced_detail_surface;
  if (
    advancedDetail?.command !== 'opl runtime app-operator-drilldown --detail full --json'
    || advancedDetail.policy !== 'settings_maintenance_diagnostics_or_release_evidence_only'
    || advancedDetail.runtime_page_allowed !== false
  ) {
    throw new Error('Page-state matrix full detail must be limited to Maintenance diagnostics or release evidence');
  }
  assertDeepEqualJson(
    advancedDetail.consumer_surfaces,
    ['/settings/environment?section=diagnostics', 'release_evidence_tooling'],
    'Page-state matrix advanced detail consumer surfaces',
  );
}
