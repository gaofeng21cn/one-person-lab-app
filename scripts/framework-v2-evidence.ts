import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolveExecutable } from './gui-launcher.ts';
import { arrayField, asRecord, objectField, recordOrNull } from './release-json-helpers.ts';

type RecordValue = Record<string, unknown>;
type FrameworkRpc = (method: string, params: RecordValue) => Promise<unknown>;

export function isFrameworkV2Evidence(oplBin: string): boolean {
  const probe = spawnSync(oplBin, ['--version', '--json'], { encoding: 'utf8', timeout: 15_000 });
  if (probe.error) throw probe.error;
  if (probe.status !== 0) return false;
  try {
    return JSON.parse(probe.stdout)?.api_version === '2.0';
  } catch {
    // Older installations print a plain version.
    return false;
  }
}

export async function openFrameworkV2Evidence(oplBin: string): Promise<FrameworkRpc> {
  const command = oplBin.includes(path.sep) ? path.resolve(oplBin) : resolveExecutable(oplBin, process.env);
  const fromFramework = createRequire(fs.realpathSync(command));
  const daemon = await import(pathToFileURL(fromFramework.resolve('@opl/daemon')).href);
  return daemon.callDaemonRpc;
}

export function validateFrameworkV2State(payload: unknown, profile: 'fast' | 'full'): RecordValue {
  const state = asRecord(payload, 'opld app.state.get result');
  if (objectField(state, 'daemon')?.api_version !== '2.0' || state.profile !== profile
      || !Number.isSafeInteger(state.revision) || Number(state.revision) < 1) {
    throw new Error(`Invalid opld ${profile} state identity or revision.`);
  }
  const nested = asRecord(state.app_state, 'opld app_state');
  for (const key of ['packages', 'workspaces', 'connections', 'tasks', 'schedules']) {
    if (!Array.isArray(nested[key]) || !Array.isArray(state[key])) {
      throw new Error(`Missing opld ${profile} state collection ${key}.`);
    }
  }
  if (profile === 'full' && !['grants', 'invocations', 'recent_operations'].every(key => Array.isArray(state[key]))) {
    throw new Error('Incomplete opld full state diagnostics.');
  }
  return state;
}

export function resolveFrameworkV2Action(state: RecordValue, actionRef: string) {
  const matches = new Set<string>();
  for (const candidate of arrayField(state, 'packages')) {
    const pkg = recordOrNull(candidate);
    if (!pkg || pkg.enabled !== true || typeof pkg.package_id !== 'string'
        || !objectField(objectField(pkg, 'provides'), 'contribution_handler')) continue;
    const views = arrayField(objectField(objectField(pkg, 'ui'), 'declarative'), 'views');
    if (views.some(view => arrayField(recordOrNull(view), 'actions')
      .some(action => recordOrNull(action)?.action_ref === actionRef))) {
      matches.add(pkg.package_id);
    }
  }
  if (matches.size > 1) throw new Error(`Multiple installed Packages declare action ref ${actionRef}.`);
  const [packageId] = matches;
  return packageId ? { packageId, actionId: actionRef } : null;
}

export function validateFrameworkV2ActionResult(payload: unknown, actionId: string, dryRun: boolean): RecordValue {
  const response = asRecord(payload, 'opld app.action.execute result');
  if (response.ok !== true || response.action_id !== actionId || response.dry_run !== dryRun
      || response.authorityBoundary !== 'app_bridge_no_domain_authority') {
    throw new Error('Unexpected opld action identity, mode or authority.');
  }
  if (dryRun) {
    if (response.status !== 'preview') throw new Error('Missing opld action preview.');
  } else {
    const result = asRecord(response.result, 'opld Package action result');
    if (result.ok !== true || result.operation !== 'execute' || result.ref !== actionId) {
      throw new Error('The Package did not return a successful execution receipt for the selected action.');
    }
  }
  return response;
}
