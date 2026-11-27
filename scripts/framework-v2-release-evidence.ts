import { createHash } from 'node:crypto';
import { asRecord, objectField } from './release-json-helpers.ts';
import { validateFrameworkV2ActionResult, validateFrameworkV2State } from './framework-v2-evidence.ts';

const stateSchema = 'opl_app_release_state_readback.v2';
const actionSchema = 'opl_app_release_action_readback.v2';
const drilldownSchema = 'opl_app_release_drilldown_readback.v2';
const drilldownSections = { tasks: 'task_count', stage_runs: 'stage_run_count', attempts: 'attempt_count', ledger_refs: 'ledger_entry_count', package_operations: 'package_operation_count' };
const collectionKeys = ['packages', 'workspaces', 'connections', 'tasks', 'schedules'];
const diagnosticKeys = ['grants', 'invocations', 'recent_operations'];

function digest(payload: unknown) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function stateReadback(payload: unknown, profile: 'fast' | 'full') {
  const state = validateFrameworkV2State(payload, profile);
  const keys = profile === 'full' ? [...collectionKeys, ...diagnosticKeys] : collectionKeys;
  return {
    schema: stateSchema, method: 'app.state.get', profile, api_version: '2.0',
    revision: state.revision, response_sha256: digest(state),
    counts: Object.fromEntries(keys.map(key => [key, (state[key] as unknown[]).length])),
  };
}

export function drilldownReadback(payload: unknown) {
  const view = asRecord(payload, 'opld operator drilldown');
  const daemon = asRecord(view.daemon, 'opld drilldown daemon');
  const summary = asRecord(view.summary, 'opld drilldown summary');
  if (view.schema !== 'opl.operator_drilldown.v2' || view.detail !== 'full'
      || view.api_version !== '2.0' || typeof daemon.version !== 'string' || !daemon.version) {
    throw new Error('Invalid Framework v2 full operator drilldown.');
  }
  const counts: Record<string, number> = {};
  for (const [section, countKey] of Object.entries(drilldownSections)) {
    const rows = view[section];
    const total = summary[countKey];
    if (!Array.isArray(rows) || !Number.isSafeInteger(total) || Number(total) < rows.length) {
      throw new Error(`Invalid Framework v2 operator drilldown section ${section}.`);
    }
    counts[countKey] = Number(total);
  }
  return {
    schema: drilldownSchema, method: 'app.operatorDrilldown.get', detail: 'full',
    api_version: '2.0', counts, response_sha256: digest(view),
  };
}

export function actionReadback(payload: unknown, packageId: string, actionId: string, dryRun: boolean) {
  const response = validateFrameworkV2ActionResult(payload, actionId, dryRun);
  const result = objectField(response, 'result');
  return {
    schema: actionSchema, method: 'app.action.execute', api_version: '2.0',
    package_id: packageId, action_id: actionId, dry_run: dryRun,
    authority_boundary: response.authorityBoundary,
    response_sha256: digest(response),
    ...(dryRun ? { status: response.status } : {
      owner_receipt: { ref: result?.ref, operation: result?.operation, ok: result?.ok },
    }),
  };
}

export function validateV2ReleaseReadback(id: string, record: Record<string, unknown>): boolean {
  if (![stateSchema, actionSchema, drilldownSchema].includes(String(record.schema))) return false;
  if (record.api_version !== '2.0' || typeof record.response_sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(record.response_sha256)) {
    throw new Error(`Invalid Framework v2 response identity for ${id}.`);
  }
  if (record.schema === drilldownSchema) {
    const counts = asRecord(record.counts, `${id}.counts`);
    if (id !== 'drilldown_full' || record.method !== 'app.operatorDrilldown.get' || record.detail !== 'full'
        || Object.values(drilldownSections).some(key => !Number.isSafeInteger(counts[key]) || Number(counts[key]) < 0)) {
      throw new Error('Invalid Framework v2 full operator drilldown readback.');
    }
    return true;
  }
  if (record.schema === stateSchema) {
    const profile = id === 'app_state_summary' ? 'fast' : id === 'app_state_full' ? 'full' : null;
    const counts = asRecord(record.counts, `${id}.counts`);
    const keys = profile === 'full' ? [...collectionKeys, ...diagnosticKeys] : collectionKeys;
    if (!profile || record.method !== 'app.state.get' || record.profile !== profile
        || !Number.isSafeInteger(record.revision) || Number(record.revision) < 1
        || keys.some(key => !Number.isSafeInteger(counts[key]) || Number(counts[key]) < 0)) {
      throw new Error(`Invalid Framework v2 ${id} state readback.`);
    }
    return true;
  }
  const dryRun = id === 'action_dry_run_result';
  const receipt = objectField(record, 'owner_receipt');
  if ((!dryRun && id !== 'action_execute_result') || record.method !== 'app.action.execute'
      || record.authority_boundary !== 'app_bridge_no_domain_authority'
      || typeof record.package_id !== 'string' || !record.package_id.trim()
      || typeof record.action_id !== 'string' || !record.action_id.trim() || record.dry_run !== dryRun
      || (dryRun ? record.status !== 'preview'
        : receipt?.ok !== true || receipt.operation !== 'execute' || receipt.ref !== record.action_id)) {
    throw new Error(`Invalid Framework v2 ${id} action readback.`);
  }
  return true;
}
