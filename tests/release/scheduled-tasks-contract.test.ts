import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  validateScheduledTasksAionuiAdapter,
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
    adapter: readJson('contracts/shell-adapters/aionui.json'),
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
    validateScheduledTasksAionuiAdapter(adapter.upstream_intake.managed_agent_api_contract.write_contracts.cron),
  );
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

test('Scheduled Tasks page state keeps assistant discovery failures local', () => {
  const { gui, matrix } = readContracts();
  const page = structuredClone(matrix.pages.find((entry) => entry.id === 'scheduled_tasks'));
  page.scheduled_tasks_view_model.existing_task_management_remains_available = false;
  assert.throws(
    () => validateScheduledTasksPageState(page, gui.scheduled_tasks_policy),
    /Scheduled Tasks page-state view model/,
  );
});

test('Scheduled Tasks adapter preserves legacy executor identity', () => {
  const { adapter } = readContracts();
  const cron = structuredClone(adapter.upstream_intake.managed_agent_api_contract.write_contracts.cron);
  cron.legacy_non_codex_job_policy.silent_migration_allowed = true;
  assert.throws(() => validateScheduledTasksAionuiAdapter(cron), /AionUI Scheduled Tasks adapter/);
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
