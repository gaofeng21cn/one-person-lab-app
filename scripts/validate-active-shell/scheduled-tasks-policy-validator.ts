import { assertDeepEqualJson, assertIncludesAll } from './assertions.ts';

const schedulerAuthority = 'framework_temporal_schedule_and_history';
const adapterContractRef = 'contracts/app-shell-adapter.json#scheduled_tasks_adapter';
const productPolicyRef = 'contracts/app-gui-product-contract.json#scheduled_tasks_policy';
const executorIdentity = 'opl_codex_native_canonical_app_server_transport';
const implementationStatus = 'source_implemented_release_qualification_separate';
const capabilities = ['list', 'create', 'update', 'delete', 'run_now', 'pause', 'resume', 'history'];

export function validateScheduledTasksProductPolicy(policy, label = 'Scheduled Tasks product policy') {
  if (policy?.feature_id !== 'B0-12' || policy.product_role !== 'ordinary_scheduled_codex_tasks'
    || policy.route !== '/scheduled' || policy.scheduler_authority !== schedulerAuthority
    || policy.single_scheduler_store_required !== true || policy.active_adapter_contract_ref !== adapterContractRef
    || 'active_aionui_contract_ref' in policy || 'legacy_non_codex_job_policy' in policy) {
    throw new Error(`${label} must use the current Framework workbench service and one Temporal store`);
  }
  assertDeepEqualJson(policy.capabilities, capabilities, `${label} capabilities`);
  assertDeepEqualJson(policy.navigation, {
    ordinary_sider_entry_visible: true,
    placement: 'primary_navigation_between_runtime_and_archived',
    primary_view: 'schedules',
  }, `${label} navigation`);
  assertDeepEqualJson(policy.executor_composition, {
    executor: 'codex_cli', executor_selector_visible: false, executor_identity_source: executorIdentity,
    unavailable_policy: 'scheduled_tasks_local_error_with_recovery_guidance', ordinary_app_remains_available: true,
  }, `${label} executor`);
  assertDeepEqualJson(policy.execution_policy, {
    app_must_remain_running: true, schedule_kinds: ['once', 'daily', 'weekly', 'interval'],
    timezone: 'explicit_iana_timezone_on_write', permissions: [':read-only', ':workspace'],
    write_confirmation: 'framework_preview_then_explicit_confirm', overlap_policy: 'skip', late_start_limit_minutes: 5,
  }, `${label} execution`);
  assertDeepEqualJson(policy.ui_reuse, {
    components: [
      '@deepseek-ai/dsh-client-ui-schedule/TaskManagerPage',
      '@deepseek-ai/dsh-client-ui-schedule/TaskDetail',
    ],
    reuse_mode: 'official_schedule_ui_with_framework_temporal_owner_adapter',
    catalog_owner: 'framework_workbench_services_temporal',
    action_owner: 'framework_workbench_services_task_actions',
    run_history_owner: 'framework_temporal_workflow_history',
    execution_result_owner: 'opl_codex_native_canonical_thread_turn',
    native_dsh_schedule_host_loaded: false,
    native_dsh_schedule_session_authority_adopted: false,
  }, `${label} UI reuse`);
  assertIncludesAll(policy.forbidden_implementation_layers, ['second_scheduler', 'second_task_store', 'scheduler_migration_ledger'], `${label} owner boundaries`);
  assertDeepEqualJson(policy.evidence_axes, {
    contract_implies_source: false, source_implies_pixel: false, source_implies_install: false, source_implies_release: false,
  }, `${label} evidence axes`);
}

// Resolve the current adapter fragment before checking its owner and callable refs.
// A historical adapter fixture cannot prove the active product contract resolves.
export function validateScheduledTasksAdapter(adapter, productPolicy) {
  const ref = productPolicy?.active_adapter_contract_ref;
  if (ref !== adapterContractRef || (adapter?.active_shell ?? adapter?.candidate_shell) !== 'opl-studio') {
    throw new Error('Scheduled Tasks adapter must resolve from the active Studio product contract');
  }
  const fragment = ref.split('#')[1].split('.').reduce((value, key) => value?.[key], adapter);
  if (!fragment) throw new Error(`Scheduled Tasks adapter reference does not resolve: ${ref}`);
  assertDeepEqualJson(fragment, {
    product_policy_ref: productPolicyRef, owner: 'OPL Framework', service_id: 'opl-workbench-services',
    schema_version: 'opl-workbench-services.v1', scheduler_authority: schedulerAuthority,
    state_path: 'workbench_services.tasks',
    read_refs: { list: 'workbench#tasks', history: 'workbench#history' },
    action_refs: {
      create: 'workbench#task_create', update: 'workbench#task_update', delete: 'workbench#task_delete',
      run_now: 'workbench#task_run', pause: 'workbench#task_pause', resume: 'workbench#task_resume',
    },
    framework_export: 'startCordisWorkbenchServicesHost', executor_bridge: 'createWorkbenchTaskExecutor',
    executor_owner: 'opl-codex-native', runtime_availability: 'workbench_services.tasks.status',
    implementation_status: implementationStatus,
  }, 'Scheduled Tasks adapter');
}

export function validateScheduledTasksPageContract(page, productPolicy) {
  if (page?.state_source !== 'framework_workbench_services_tasks_and_history'
    || page.action_source !== 'framework_workbench_services_task_actions'
    || page.policy_ref !== 'scheduled_tasks_policy' || page.route !== productPolicy?.route
    || page.page_kind !== 'ordinary_product_page' || page.ia_group !== 'automation') {
    throw new Error('Scheduled Tasks page must bind the ordinary route to Framework workbench services');
  }
}

export function validateScheduledTasksPageState(page, productPolicy) {
  if (page?.expected_source !== 'Framework workbench services and App-owned Scheduled Tasks policy'
    || page.machine_source !== `${productPolicyRef} + ${adapterContractRef}`
    || page.page_contract !== 'ordinary_scheduled_codex_tasks') {
    throw new Error('Scheduled Tasks page-state entry must reference the App product and current adapter contracts');
  }
  assertDeepEqualJson(page.scheduled_tasks_view_model, {
    product_policy_ref: productPolicyRef, active_adapter_contract_ref: adapterContractRef,
    route: productPolicy?.route, scheduler_authority: productPolicy?.scheduler_authority,
    ordinary_sider_entry_visible: true, primary_view: 'schedules', executor: 'codex_cli',
    executor_selector_visible: false, executor_identity_source: executorIdentity,
    service_unavailable_scope: 'scheduled_tasks', ordinary_app_remains_available: true,
    app_must_remain_running: true, second_scheduler_store_allowed: false,
  }, 'Scheduled Tasks page-state view model');
  assertDeepEqualJson(page.states, ['loading', 'empty', 'ready', 'service_unavailable', 'read_error'], 'Scheduled Tasks page states');
}

export function validateScheduledTasksProfileProjection(nativeAutomation) {
  assertDeepEqualJson(nativeAutomation, {
    owner: 'app_automation_surface', cron_skill_packaged: false, exposure: 'automation_page_and_task_routing',
    product_policy_ref: productPolicyRef, active_adapter_contract_ref: adapterContractRef,
    route: '/scheduled', scheduler_authority: schedulerAuthority, single_scheduler_store_required: true,
    ordinary_sider_entry_visible: true, executor: 'codex_cli', executor_selector_visible: false,
    implementation_status: implementationStatus,
  }, 'Product profile Scheduled Tasks projection');
}
