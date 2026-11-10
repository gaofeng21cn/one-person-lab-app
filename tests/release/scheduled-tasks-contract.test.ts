import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  validateScheduledTasksAdapter,
  validateScheduledTasksPageContract,
  validateScheduledTasksPageState,
  validateScheduledTasksProductPolicy,
  validateScheduledTasksProfileProjection,
} from '../../scripts/validate-active-shell/scheduled-tasks-policy-validator.ts';

const readJson = (relativePath: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), relativePath), 'utf8'));

function readContracts() {
  return {
    gui: readJson('contracts/app-gui-product-contract.json'),
    matrix: readJson('contracts/app-page-state-matrix.json'),
    profile: readJson('contracts/app-product-profile.json'),
    adapter: readJson('contracts/app-shell-adapter.json'),
  };
}

test('Scheduled Tasks contracts share one fail-open fixed-Codex composition', () => {
  const { gui, matrix, profile, adapter } = readContracts();
  const pageState = matrix.pages.find((page) => page.id === 'scheduled_tasks');

  assert.doesNotThrow(() => validateScheduledTasksProductPolicy(gui.scheduled_tasks_policy));
  assert.doesNotThrow(() => validateScheduledTasksPageContract(gui.pages.scheduled_tasks, gui.scheduled_tasks_policy));
  assert.doesNotThrow(() => validateScheduledTasksPageState(pageState, gui.scheduled_tasks_policy));
  assert.doesNotThrow(() => validateScheduledTasksProfileProjection(profile.companion_payloads.native_automation));
  assert.doesNotThrow(() =>
    validateScheduledTasksAdapter(adapter, gui.scheduled_tasks_policy),
  );
  assert.doesNotThrow(() =>
    validateScheduledTasksAdapter(readJson('contracts/shell-adapters/opl-studio.json'), gui.scheduled_tasks_policy),
  );
});

test('Scheduled Tasks rejects a missing active adapter fragment and obsolete references', () => {
  const { adapter, gui } = readContracts();
  delete adapter.scheduled_tasks_adapter;
  assert.throws(() => validateScheduledTasksAdapter(adapter, gui.scheduled_tasks_policy), /reference does not resolve/);
  gui.scheduled_tasks_policy.active_adapter_contract_ref =
    'contracts/app-shell-adapter.json#upstream_intake.managed_agent_api_contract.write_contracts.cron';
  assert.throws(() => validateScheduledTasksAdapter(adapter, gui.scheduled_tasks_policy), /active Studio product contract/);
});

test('Scheduled Tasks product policy rejects an executor selector or a second scheduler', () => {
  const { gui } = readContracts();
  const selector = structuredClone(gui.scheduled_tasks_policy);
  selector.executor_composition.executor_selector_visible = true;
  assert.throws(() => validateScheduledTasksProductPolicy(selector), /Scheduled Tasks product policy/);

  const secondStore = structuredClone(gui.scheduled_tasks_policy);
  secondStore.single_scheduler_store_required = false;
  assert.throws(() => validateScheduledTasksProductPolicy(secondStore), /Scheduled Tasks product policy/);
});

test('Scheduled Tasks reuses official UI while keeping the DSH schedule Host unloaded', () => {
  const { gui } = readContracts();
  const ownerLeak = structuredClone(gui.scheduled_tasks_policy);
  ownerLeak.ui_reuse.native_dsh_schedule_host_loaded = true;
  assert.throws(() => validateScheduledTasksProductPolicy(ownerLeak), /Scheduled Tasks product policy UI reuse/);

  const componentFork = structuredClone(gui.scheduled_tasks_policy);
  componentFork.ui_reuse.components = ['OPL-private-TaskManager'];
  assert.throws(() => validateScheduledTasksProductPolicy(componentFork), /Scheduled Tasks product policy UI reuse/);

  const historyLeak = structuredClone(gui.scheduled_tasks_policy);
  historyLeak.ui_reuse.run_history_owner = 'dsh_schedule_inbox_delivery_receipt';
  assert.throws(() => validateScheduledTasksProductPolicy(historyLeak), /Scheduled Tasks product policy UI reuse/);
});

test('Scheduled Tasks page state keeps service failures local', () => {
  const { gui, matrix } = readContracts();
  const page = structuredClone(matrix.pages.find((entry) => entry.id === 'scheduled_tasks'));
  page.scheduled_tasks_view_model.ordinary_app_remains_available = false;
  assert.throws(
    () => validateScheduledTasksPageState(page, gui.scheduled_tasks_policy),
    /Scheduled Tasks page-state view model/,
  );
});

test('Scheduled Tasks adapter rejects the retired AionUI contract shape', () => {
  const { adapter, gui } = readContracts();
  const current = structuredClone(adapter);
  current.scheduled_tasks_adapter.owner = 'AionUI';
  assert.throws(() => validateScheduledTasksAdapter(current, gui.scheduled_tasks_policy), /Scheduled Tasks adapter/);
});

test('Scheduled Tasks profile keeps the ordinary route on fixed Codex', () => {
  const { profile } = readContracts();
  const nativeAutomation = structuredClone(profile.companion_payloads.native_automation);
  nativeAutomation.executor_selector_visible = true;
  assert.throws(
    () => validateScheduledTasksProfileProjection(nativeAutomation),
    /Product profile Scheduled Tasks projection/,
  );
});
