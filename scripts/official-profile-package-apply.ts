#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type OfficialProfileApplyIntent = 'first_install' | 'explicit_restore';

type OplExecution = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

type OfficialProfileApplyRuntime = {
  execute: (args: string[]) => OplExecution;
  wait?: (milliseconds: number) => void;
};

type JsonRecord = Record<string, any>;

type ProjectedPackageAction = {
  action_id: string;
  action_ref: string;
  payload: JsonRecord;
  required_payload_fields: string[];
  confirmation_required: boolean;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeFailureMessage(message: string): string {
  // Package failures are diagnostics, not a transport for raw command output or credentials.
  let safe = message;
  for (const [key, value] of Object.entries(process.env)) {
    if (
      value &&
      value.length >= 4 &&
      /token|secret|password|passwd|credential|api.?key|authorization|cookie/i.test(key)
    ) {
      safe = safe.split(value).join('<redacted>');
    }
  }
  return safe
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '<redacted>')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+/gi, '<redacted-url>')
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi, '<redacted>')
    .replace(/\b(?:sk-[a-z0-9_-]+|gh[pousr]_[a-z0-9_]+|github_pat_[a-z0-9_]+)\b/gi, '<redacted>')
    .replace(
      /((?:[a-z0-9_.-]*(?:key|token|secret|password|passwd|credential|authorization|cookie))["']?\s*(?:=|:)\s*)(?:\[REDACTED\]|"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&}\]]+)/gi,
      '$1<redacted>'
    )
    .replace(
      /((?:--?)[a-z0-9_.-]*(?:key|token|secret|password|passwd|credential)\s+)(?:"[^"\r\n]*"|'[^'\r\n]*'|\S+)/gi,
      '$1<redacted>'
    )
    .split(/\r?\n/, 1)[0]
    .trim()
    .slice(0, 1024);
}

class OplCommandFailure extends Error {
  code?: string;
}

function parseJsonOutput(output: string): unknown {
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function parseErrorOutput(output: string): unknown {
  const direct = parseJsonOutput(output);
  if (direct !== null) return direct;
  // Node can append runtime warnings after Framework's pretty-printed JSON.
  // Parse only a complete JSON object, never expose the mixed raw stream.
  const start = output.indexOf('{');
  if (start < 0) return null;
  for (let end = output.lastIndexOf('}'); end > start; end = output.lastIndexOf('}', end - 1)) {
    const candidate = parseJsonOutput(output.slice(start, end + 1));
    if (isRecord(candidate) && isRecord(candidate.error)) return candidate;
  }
  return null;
}

function parseJsonResult(result: OplExecution, args: string[]) {
  const parsed = parseJsonOutput(result.stdout);
  const command = `opl ${args.slice(0, args[1] === 'action' ? 3 : 2).join(' ')}`;
  if (result.error || result.status !== 0) {
    const stderrJson = parseErrorOutput(result.stderr);
    const error = [parsed, stderrJson]
      .filter(isRecord)
      .map((payload) => payload.error)
      .find((candidate) => isRecord(candidate) && typeof candidate.message === 'string' && candidate.message.trim());
    const failure = new OplCommandFailure(
      error?.message ||
        result.error?.message ||
        (stderrJson === null ? result.stderr.trim() : '') ||
        `${command} exited with status ${String(result.status)}`
    );
    if (typeof error?.code === 'string' && /^[a-z][a-z0-9_.-]{0,127}$/i.test(error.code)) {
      failure.code = safeFailureMessage(error.code);
    }
    throw failure;
  }
  if (!isRecord(parsed)) throw new Error(`${command} returned invalid JSON.`);
  return parsed;
}

function fastAppState(runtime: OfficialProfileApplyRuntime) {
  const args = ['app', 'state', '--profile', 'fast', '--json'];
  return parseJsonResult(runtime.execute(args), args);
}

// The version handshake advertises the CLI surface, independently from the
// daemon. Older v2 clients can still inspect packages when paired with this App.
function v2PackageMode(runtime: OfficialProfileApplyRuntime): 'ensure' | 'inspect' | null {
  const args = ['--version', '--json'];
  try {
    const version = parseJsonResult(runtime.execute(args), args);
    if (version.api_version !== '2.0') return null;
    return Array.isArray(version.features) && version.features.includes('pack.ensure') ? 'ensure' : 'inspect';
  } catch {
    return null;
  }
}

function ensureV2Package(runtime: OfficialProfileApplyRuntime, packageId: string, dryRun: boolean) {
  const args = ['pack', 'ensure', packageId, ...(dryRun ? ['--dry-run'] : []), '--json'];
  const result = parseJsonResult(runtime.execute(args), args);
  const allowed = dryRun ? ['validated', 'already_present'] : ['installed', 'reconciled', 'already_present'];
  if (result.package_id !== packageId || !allowed.includes(result.status)
    || result.changed !== (result.status === 'installed' || result.status === 'reconciled')) {
    throw new Error(`Framework returned an invalid Package convergence result for ${packageId}.`);
  }
  return {
    package_id: packageId, status: result.status, changed: result.changed, error: null,
    action: result.status === 'already_present' ? null : 'pack.ensure',
    action_ref: null,
  };
}

function requireInstalledV2Closure(runtime: OfficialProfileApplyRuntime, packageId: string, seen = new Set<string>()) {
  if (seen.has(packageId)) return;
  if (packageId.length > 128 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(packageId)) {
    throw new Error('Framework v2 Package inspection requires a valid Package identity.');
  }
  const args = ['pack', 'inspect', packageId, '--json'];
  let inspected: JsonRecord;
  try {
    inspected = parseJsonResult(runtime.execute(args), args);
  } catch (error) {
    if (!(error instanceof OplCommandFailure) || error.code !== 'PACK_NOT_FOUND') throw error;
    inspected = {};
  }
  if (!inspected.installed || inspected.installed.enabled === false) {
    const failure = new OplCommandFailure(
      `Package ${packageId} is missing or disabled. Framework v2 does not yet provide an Official Profile install action for this Package.`
    );
    failure.code = 'OFFICIAL_PROFILE_PACKAGE_SOURCE_UNAVAILABLE';
    throw failure;
  }
  const manifest = inspected.manifest;
  if (inspected.installed.enabled !== true || inspected.installed.package_id !== packageId
    || manifest?.schema_version !== 'opl.package.v2' || manifest.identity?.id !== packageId) {
    throw new Error(`Framework v2 returned invalid installed Package identity for ${packageId}.`);
  }
  seen.add(packageId);
  for (const dependency of manifest.dependencies?.packages ?? []) {
    if (dependency.optional === true || dependency.presence === 'optional') continue;
    if (typeof dependency.id !== 'string') {
      throw new Error(`Framework v2 returned an invalid required dependency for ${packageId}.`);
    }
    requireInstalledV2Closure(runtime, dependency.id, seen);
    if (dependency.required_capabilities?.length) {
      const failure = new OplCommandFailure(
        `Framework v2 does not yet report the required capabilities of Package ${dependency.id} for ${packageId}.`
      );
      failure.code = 'OFFICIAL_PROFILE_PACKAGE_CAPABILITIES_UNVERIFIED';
      throw failure;
    }
  }
}

function appStateRecord(payload: JsonRecord) {
  if (isRecord(payload.app_state)) return payload.app_state;
  if (isRecord(payload.opl_app_state) && isRecord(payload.opl_app_state.app_state)) {
    return payload.opl_app_state.app_state;
  }
  throw new Error('Fast App state readback is missing app_state.');
}

function statusIndexPackage(statusIndex: JsonRecord, packageId: string) {
  if (isRecord(statusIndex.packages)) {
    const status = statusIndex.packages[packageId];
    return isRecord(status) ? status : null;
  }
  if (Array.isArray(statusIndex.packages)) {
    return statusIndex.packages.find((entry: unknown) => isRecord(entry) && entry.package_id === packageId) ?? null;
  }
  return null;
}

const dependencyAbsenceStatuses = new Set([
  'absent',
  'disabled',
  'missing',
  'not_installed',
  'physical_unavailable',
  'unavailable',
]);

function requiredDependencyPresent(dependency: JsonRecord) {
  if (dependency.required === false) return true;
  if (dependency.installed === false || dependency.enabled === false) return false;
  if (typeof dependency.status === 'string' && dependencyAbsenceStatuses.has(dependency.status)) {
    return false;
  }
  if (dependency.exports_satisfied === false) return false;
  if (Array.isArray(dependency.missing_required_export_ids) && dependency.missing_required_export_ids.length > 0) {
    return false;
  }
  if (Array.isArray(dependency.missing_required_module_ids) && dependency.missing_required_module_ids.length > 0) {
    return false;
  }
  const reasons = Array.isArray(dependency.reasons)
    ? dependency.reasons
    : Array.isArray(dependency.failure_reasons)
      ? dependency.failure_reasons
      : [];
  const absenceReasons = new Set([
    'dependency_disabled',
    'dependency_missing',
    'physical_unavailable',
    'required_exports_missing',
    'required_modules_missing',
  ]);
  return !reasons.some((reason: unknown) => typeof reason === 'string' && absenceReasons.has(reason));
}

function requiredClosurePresent(status: JsonRecord) {
  const packageReadiness = isRecord(status.package_dependency_readiness) ? status.package_dependency_readiness : {};
  if (typeof packageReadiness.status === 'string' && dependencyAbsenceStatuses.has(packageReadiness.status)) {
    return false;
  }
  const dependencyReadiness = isRecord(status.dependency_readiness) ? status.dependency_readiness : {};
  const dependencies = [
    ...(Array.isArray(packageReadiness.dependencies) ? packageReadiness.dependencies : []),
    ...(Array.isArray(dependencyReadiness.checks) ? dependencyReadiness.checks : []),
  ].filter(isRecord);
  return dependencies.every(requiredDependencyPresent);
}

function projectedAction(entry: JsonRecord, packageId: string): ProjectedPackageAction {
  const recommended = entry.recommended_action_ref;
  if (!isRecord(recommended)) {
    throw new Error(`Package ${packageId} has no projected action for Official Profile convergence.`);
  }
  const availableActions = Array.isArray(entry.available_actions) ? entry.available_actions.filter(isRecord) : [];
  const action = availableActions.find(
    (candidate) => candidate.action_id === recommended.action_id && candidate.action_ref === recommended.action_ref
  );
  if (!action) {
    throw new Error(`Package ${packageId} recommended action is not present in available_actions.`);
  }
  if (
    typeof action.action_id !== 'string' ||
    action.action_id.trim() === '' ||
    typeof action.action_ref !== 'string' ||
    action.action_ref.trim() === '' ||
    !isRecord(action.payload) ||
    !Array.isArray(action.required_payload_fields) ||
    action.required_payload_fields.some((field: unknown) => typeof field !== 'string') ||
    typeof action.confirmation_required !== 'boolean'
  ) {
    throw new Error(`Package ${packageId} projected action has an invalid canonical action shape.`);
  }
  if (action.payload.package_id !== packageId) {
    throw new Error(`Package ${packageId} projected action payload targets another Package.`);
  }
  for (const field of action.required_payload_fields) {
    if (!(field in action.payload)) {
      throw new Error(`Package ${packageId} projected action payload is missing ${field}.`);
    }
  }
  return action as ProjectedPackageAction;
}

function packageSnapshot(payload: JsonRecord, packageId: string) {
  const appState = appStateRecord(payload);
  const agentPackages = isRecord(appState.agent_packages) ? appState.agent_packages : {};
  const directory = isRecord(agentPackages.directory) ? agentPackages.directory : {};
  const entries = Array.isArray(directory.entries) ? directory.entries.filter(isRecord) : [];
  const entry = entries.find((candidate) => candidate.package_id === packageId);
  if (!entry) {
    throw new Error(`Official Profile Package ${packageId} is absent from the canonical Package directory.`);
  }
  const statusIndex = isRecord(agentPackages.status_index) ? agentPackages.status_index : {};
  const status = statusIndexPackage(statusIndex, packageId);
  return {
    entry,
    installed: entry.installed === true,
    requiredClosurePresent: status !== null && requiredClosurePresent(status),
  };
}

function executeProjectedAction(runtime: OfficialProfileApplyRuntime, action: ProjectedPackageAction, dryRun: boolean) {
  const args = [
    'app',
    'action',
    'execute',
    '--action',
    action.action_id,
    ...(dryRun ? ['--dry-run'] : []),
    ...(Object.keys(action.payload).length > 0 ? ['--payload', JSON.stringify(action.payload)] : []),
    '--json',
  ];
  return parseJsonResult(runtime.execute(args), args);
}

// Observe Framework's existing worker; App does not own transfer or installed state.
function executeObservedPackageAction(runtime: OfficialProfileApplyRuntime, action: ProjectedPackageAction, dryRun: boolean) {
  if (dryRun || !['agent_package_install', 'agent_package_update', 'agent_package_repair'].includes(action.action_id)) return executeProjectedAction(runtime, action, dryRun);
  const invoke = (id: string, payload: JsonRecord) => {
    const args = ['app', 'action', 'execute', '--action', id, '--payload', JSON.stringify(payload), '--json'];
    return parseJsonResult(runtime.execute(args), args);
  };
  // This generic transport is not a Package directory action. Discover its
  // read-only status endpoint before any write, as the software center does.
  let supportsObservation = false;
  try { supportsObservation = Array.isArray(invoke('package_operation_status', {}).app_action_execution?.result?.operations); }
  catch { /* Older Frameworks keep their canonical synchronous action. */ }
  if (!supportsObservation) return executeProjectedAction(runtime, action, dryRun);
  const started = invoke('package_operation_start', { action_id: action.action_id, package_id: action.payload.package_id });
  const operation = started.app_action_execution?.result?.operation;
  if (!isRecord(operation) || typeof operation.operation_id !== 'string') throw new Error('Package installation result is not confirmed; inspect software status before retrying.');
  const deadline = Date.now() + 840_000;
  while (Date.now() < deadline) {
    const result = invoke('package_operation_status', { operation_id: operation.operation_id });
    const current = result.app_action_execution?.result?.operations?.find((item: JsonRecord) => item.operation_id === operation.operation_id);
    if (!isRecord(current)) throw new Error('Package installation progress is unavailable; inspect software status before retrying.');
    if (current.status === 'completed') return result;
    if (current.status !== 'running') {
      const failure = new OplCommandFailure('Package installation did not complete. Check this item in Software Center and retry.');
      if (typeof current.error_code === 'string') failure.code = current.error_code;
      throw failure;
    }
    if (runtime.wait) runtime.wait(1000);
    else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  throw new Error('Package installation is still unconfirmed; inspect software status before retrying.');
}

function normalizeRoots(rootPackageIds: string[]) {
  const roots = rootPackageIds.map((value) => value.trim()).filter(Boolean);
  if (roots.length === 0) throw new Error('Official Profile requires at least one desired root Package identity.');
  return [...new Set(roots)];
}

export function applyOfficialProfilePackages(input: {
  intent: OfficialProfileApplyIntent;
  rootPackageIds: string[];
  dryRun?: boolean;
  runtime: OfficialProfileApplyRuntime;
  onProgress?: (progress: JsonRecord) => void;
}) {
  if (input.intent !== 'first_install' && input.intent !== 'explicit_restore') {
    throw new Error('Official Profile may only be applied for first_install or explicit_restore.');
  }
  const roots = normalizeRoots(input.rootPackageIds);
  const items: JsonRecord[] = [];
  let v2Mode: ReturnType<typeof v2PackageMode> = null;
  const report = (packageId: string, status: string) => input.onProgress?.({
    schema: 'opl_official_profile_install_progress.v1', package_id: packageId, status,
    root_package_ids: roots, completed: items.filter(item => item.status !== 'failed').length,
    total: roots.length, package_results: items.map(item => ({ package_id: item.package_id, status: item.status })),
  });
  for (const packageId of roots) {
    report(packageId, 'installing');
    try {
      let before;
      if (v2Mode === null) {
        try {
          const state = fastAppState(input.runtime);
          // v2 app state can also be reached through a compatibility CLI.
          if (state.daemon?.api_version === '2.0') v2Mode = v2PackageMode(input.runtime);
          if (v2Mode === null) before = packageSnapshot(state, packageId);
        } catch (error) {
          if (!(error instanceof OplCommandFailure) || error.code !== 'METHOD_NOT_FOUND') throw error;
          v2Mode = v2PackageMode(input.runtime);
          if (v2Mode === null) throw error;
        }
      }
      if (v2Mode === 'ensure') {
        try {
          items.push(ensureV2Package(input.runtime, packageId, input.dryRun === true));
          continue;
        } catch (error) {
          // An older daemon may serve the socket of a newer CLI.
          if (!(error instanceof OplCommandFailure) || error.code !== 'METHOD_NOT_FOUND') throw error;
          v2Mode = 'inspect';
        }
      }
      if (!before) {
        requireInstalledV2Closure(input.runtime, packageId);
      }
      if (!before || (before.installed && before.requiredClosurePresent)) {
        items.push({
          package_id: packageId,
          status: 'already_present',
          action: null,
          action_ref: null,
          changed: false,
          error: null,
        });
        continue;
      }

      const action = projectedAction(before.entry, packageId);
      const actionReadback = executeObservedPackageAction(input.runtime, action, input.dryRun === true);
      if (input.dryRun) {
        items.push({
          package_id: packageId,
          status: 'validated',
          action: action.action_id,
          action_ref: action.action_ref,
          changed: false,
          action_readback: actionReadback,
          error: null,
        });
        continue;
      }

      const after = packageSnapshot(fastAppState(input.runtime), packageId);
      if (!after.installed || !after.requiredClosurePresent) {
        throw new Error(`Package ${packageId} is not present with its required closure after ${action.action_id}.`);
      }
      items.push({
        package_id: packageId,
        status: before.installed ? 'reconciled' : 'installed',
        action: action.action_id,
        action_ref: action.action_ref,
        changed: true,
        action_readback: actionReadback,
        error: null,
      });
    } catch (error) {
      items.push({
        package_id: packageId,
        status: 'failed',
        action: null,
        action_ref: null,
        changed: false,
        error: {
          ...(error instanceof OplCommandFailure && error.code ? { code: error.code } : {}),
          message: safeFailureMessage(error instanceof Error ? error.message : String(error)),
        },
      });
    } finally {
      report(packageId, items.at(-1)?.status === 'failed' ? 'attention' : 'ready');
    }
  }

  const failed = items.filter((item) => item.status === 'failed').length;
  const succeeded = items.length - failed;
  return {
    version: 'g2',
    official_profile_package_apply: {
      surface_kind: 'opl_app_official_profile_package_apply.v1',
      status: failed === 0 ? (input.dryRun ? 'validated' : 'completed') : succeeded > 0 ? 'partial_failure' : 'failed',
      intent: input.intent,
      dry_run: input.dryRun === true,
      root_package_ids: roots,
      summary: {
        total: items.length,
        succeeded,
        failed,
        changed: items.filter((item) => item.changed === true).length,
        already_present: items.filter((item) => item.status === 'already_present').length,
      },
      items,
      persistence: {
        desired_state_saved: false,
        startup_maintenance_registered: false,
        automatic_reapply_allowed: false,
      },
      projection_boundary: {
        state_source: v2Mode === 'ensure' ? 'pack.ensure' : v2Mode === 'inspect' ? 'opl pack inspect <package-id> --json' : 'opl app state --profile fast --json',
        action_source: v2Mode === 'ensure' ? 'pack.ensure' : v2Mode === 'inspect' ? null : 'directory.entries[].recommended_action_ref+available_actions[]',
        action_executor: v2Mode === 'ensure' ? 'opl pack ensure <package-id> --json' : v2Mode === 'inspect' ? null : 'opl app action execute --action <projected-action-id> --json',
        ...(v2Mode ? { readback_scope: v2Mode === 'ensure' ? 'required_packages_and_capabilities' : 'enabled_required_package_identity_presence' } : {}),
        direct_package_lifecycle_command_used: false,
        package_action_allowlist_owned: false,
        carrier_selection_owned: false,
      },
    },
  };
}

function parseArgs(argv: string[]) {
  let intent: string | null = null;
  let profilePath: string | undefined;
  const rootPackageIds: string[] = [];
  let oplBin = process.env.OPL_BIN?.trim() || 'opl';
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--intent') intent = argv[++index] ?? null;
    else if (token === '--profile') profilePath = argv[++index];
    else if (token === '--root-package-id') rootPackageIds.push(argv[++index] ?? '');
    else if (token === '--opl-bin') oplBin = argv[++index] ?? '';
    else if (token === '--dry-run') dryRun = true;
    else throw new Error(`Unknown option: ${token}`);
  }
  if (intent !== 'first_install' && intent !== 'explicit_restore') {
    throw new Error('--intent must be first_install or explicit_restore.');
  }
  if (!oplBin) throw new Error('--opl-bin must not be empty.');
  if (rootPackageIds.length === 0 && !profilePath) {
    throw new Error('Provide --root-package-id at least once, or --profile for App-repo development use.');
  }
  return { intent, profilePath, rootPackageIds, oplBin, dryRun } as const;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let rootPackageIds = options.rootPackageIds;
  if (rootPackageIds.length === 0) {
    const { readAppProductProfile } = await import('./app-product-profile/profile-contract.ts');
    const profile = readAppProductProfile(options.profilePath);
    if (!profile.official_profile.apply_on.includes(options.intent)) {
      throw new Error(`Official Profile does not allow ${options.intent}.`);
    }
    rootPackageIds = profile.official_profile.desired_root_package_ids;
  }
  const result = applyOfficialProfilePackages({
    intent: options.intent,
    rootPackageIds,
    dryRun: options.dryRun,
    onProgress: progress => process.stderr.write(`OPL_PROFILE_PROGRESS ${JSON.stringify(progress)}\n`),
    runtime: {
      execute: (args) =>
        spawnSync(options.oplBin, args, {
          encoding: 'utf8',
          env: process.env,
          maxBuffer: 32 * 1024 * 1024,
        }),
    },
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.official_profile_package_apply.summary.failed > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
