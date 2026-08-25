import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  FULL_RUNTIME_FORBIDDEN_FRAMEWORK_CODEX_PATHS,
} from '../full-first-install-package.ts';
import { resolveFullCarrierProfile } from './carrier-profile.ts';

const PRECOMPRESSION_GATE_SCHEMA = 'opl_full_precompression_gate.v1';
const FULL_GIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const MACH_O_MAGICS = new Set([
  'cafebabe',
  'cafebabf',
  'cefaedfe',
  'cffaedfe',
  'feedface',
  'feedfacf',
  'bebafeca',
  'bfbafeca',
]);
const PORTABLE_LOAD_PATH_PREFIXES = [
  '@rpath/',
  '@loader_path/',
  '@executable_path/',
  '/usr/lib/',
  '/System/Library/',
];
const PORTABLE_RPATH_PREFIXES = [
  '@loader_path',
  '@executable_path',
  '/usr/lib',
  '/System/Library',
];

type FailureClass =
  | 'artifact_invalid'
  | 'runtime_source_invalid'
  | 'environment_transient';

type GateIssue = {
  code: string;
  failure_class: FailureClass;
  message: string;
  component?: string;
  relative_path?: string;
  dependency?: string;
  rpath?: string;
};

type ResolvedRef = Partial<{
  label: string;
  requested_ref: string | null;
  requested_ref_commit: string | null;
  resolved_commit: string | null;
}>;

type PackagedManifest = {
  resolved_refs?: Record<string, ResolvedRef>;
  runtime_assertions?: {
    offline_required_payloads?: Array<Partial<{
      path: string;
      exists: boolean;
      executable: boolean;
    }>>;
    declared_pruned_paths?: Array<Partial<{
      path: string;
      expected: string;
      present: boolean;
    }>>;
  };
  native_trust?: {
    status?: string;
  };
};

type GateInput = {
  builtAppPath: string;
  resolvedRefs: Record<string, ResolvedRef>;
  runtimeCurrentness: Record<string, unknown>;
  reportPath?: string;
};

export class FullPrecompressionGateError extends Error {
  readonly failureClass: FailureClass;
  readonly report: Record<string, unknown>;

  constructor(failureClass: FailureClass, report: Record<string, unknown>) {
    const issues = report.issues as GateIssue[];
    super([
      `Full precompression gate failed: ${failureClass}`,
      ...issues.map((issue) => `  - [${issue.code}] ${issue.message}`),
    ].join('\n'));
    this.name = 'FullPrecompressionGateError';
    this.failureClass = failureClass;
    this.report = report;
  }
}

function normalizeRelativePath(root: string, candidate: string) {
  return path.relative(root, candidate).split(path.sep).join('/');
}

function writeReport(reportPath: string | undefined, report: Record<string, unknown>) {
  if (!reportPath) return;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isMachOFile(filePath: string) {
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(4);
    if (fs.readSync(descriptor, header, 0, header.length, 0) !== header.length) {
      return false;
    }
    return MACH_O_MAGICS.has(header.toString('hex'));
  } finally {
    fs.closeSync(descriptor);
  }
}

function listMachOFiles(appPath: string) {
  const files: string[] = [];
  const stack = [appPath];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current).sort().reverse()) {
        stack.push(path.join(current, entry));
      }
      continue;
    }
    if (stat.isFile() && isMachOFile(current)) {
      files.push(current);
    }
  }
  return files.sort();
}

function parseOtoolPaths(output: string) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines
    .slice(1)
    .filter((line) => !line.endsWith(':'))
    .map((line) => line.replace(/\s+\(.*$/, '').trim())
    .filter(Boolean);
}

function inspectMachO(filePath: string, mode: '-D' | '-L') {
  // Electron helper names contain parentheses; -m disables otool's archive(member) parsing.
  const result = spawnSync('otool', [mode, '-m', filePath], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
    throw new Error('Full precompression gate requires otool on the macOS build host.');
  }
  if (result.status !== 0) {
    throw new Error([
      `otool ${mode} failed for ${filePath}`,
      result.stdout?.trim() ? `stdout:\n${result.stdout.trim()}` : '',
      result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : '',
    ].filter(Boolean).join('\n'));
  }
  return parseOtoolPaths(result.stdout ?? '');
}

function inspectMachORpaths(filePath: string) {
  const result = spawnSync('otool', ['-l', '-m', filePath], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
    throw new Error('Full precompression gate requires otool on the macOS build host.');
  }
  if (result.status !== 0) {
    throw new Error([
      `otool -l failed for ${filePath}`,
      result.stdout?.trim() ? `stdout:\n${result.stdout.trim()}` : '',
      result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : '',
    ].filter(Boolean).join('\n'));
  }

  const lines = (result.stdout ?? '').split(/\r?\n/);
  const rpaths: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.trim() !== 'cmd LC_RPATH') continue;
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 5); cursor += 1) {
      const match = lines[cursor]?.trim().match(/^path\s+(.+?)\s+\(offset\s+\d+\)$/);
      if (!match) continue;
      rpaths.push(match[1]);
      break;
    }
  }
  return rpaths;
}

function portableLoadPath(dependency: string) {
  return PORTABLE_LOAD_PATH_PREFIXES.some((prefix) => dependency.startsWith(prefix));
}

function portableRpath(rpath: string) {
  return PORTABLE_RPATH_PREFIXES.some(
    (prefix) => rpath === prefix || rpath.startsWith(`${prefix}/`),
  );
}

function dependencyIssueCode(dependency: string) {
  if (/\/(?:opt\/homebrew|usr\/local|home\/linuxbrew\/\.linuxbrew)\/Cellar\//i.test(dependency)) {
    return 'homebrew_cellar_dependency';
  }
  if (/^\/(?:Users|home)\//.test(dependency)) {
    return 'user_directory_dependency';
  }
  return path.isAbsolute(dependency)
    ? 'host_absolute_dependency'
    : 'unsupported_load_path';
}

function rpathIssueCode(rpath: string) {
  if (/\/(?:opt\/homebrew|usr\/local|home\/linuxbrew\/\.linuxbrew)\/Cellar\//i.test(rpath)) {
    return 'homebrew_cellar_rpath';
  }
  if (/^\/(?:Users|home)\//.test(rpath)) {
    return 'user_directory_rpath';
  }
  return path.isAbsolute(rpath)
    ? 'host_absolute_rpath'
    : 'unsupported_rpath';
}

function collectResolvedRefIssues(resolvedRefs: Record<string, ResolvedRef>) {
  const issues: GateIssue[] = [];
  let fullShaRefCount = 0;
  for (const [component, ref] of Object.entries(resolvedRefs)) {
    const requestedRef = ref.requested_ref?.trim() ?? '';
    const resolvedCommit = ref.resolved_commit?.trim() ?? '';
    const requestedRefCommit = ref.requested_ref_commit?.trim() ?? '';
    if (FULL_GIT_SHA_PATTERN.test(requestedRef)) {
      fullShaRefCount += 1;
      if (requestedRef.toLowerCase() !== resolvedCommit.toLowerCase()) {
        issues.push({
          code: 'requested_sha_mismatch',
          failure_class: 'runtime_source_invalid',
          component,
          message: `${ref.label ?? component} requested ${requestedRef} but packaged ${resolvedCommit || '<missing>'}.`,
        });
      }
      continue;
    }
    if (
      FULL_GIT_SHA_PATTERN.test(requestedRefCommit)
      && requestedRefCommit.toLowerCase() !== resolvedCommit.toLowerCase()
    ) {
      issues.push({
        code: 'resolved_ref_commit_mismatch',
        failure_class: 'runtime_source_invalid',
        component,
        message: `${ref.label ?? component} resolved requested ref to ${requestedRefCommit} but packaged ${resolvedCommit || '<missing>'}.`,
      });
    }
  }
  return { issues, fullShaRefCount };
}

function collectResolvedRefParityIssues(
  expectedRefs: Record<string, ResolvedRef>,
  packagedRefs: Record<string, ResolvedRef>,
) {
  const issues: GateIssue[] = [];
  for (const [component, expected] of Object.entries(expectedRefs)) {
    const packaged = packagedRefs[component];
    if (!packaged) {
      issues.push({
        code: 'packaged_resolved_ref_missing',
        failure_class: 'artifact_invalid',
        component,
        message: `Built App manifest is missing resolved ref ${component}.`,
      });
      continue;
    }
    for (const field of ['requested_ref', 'requested_ref_commit', 'resolved_commit'] as const) {
      if ((packaged[field] ?? null) !== (expected[field] ?? null)) {
        issues.push({
          code: 'packaged_resolved_ref_drift',
          failure_class: 'artifact_invalid',
          component,
          message: `Built App ${component}.${field} is ${String(packaged[field] ?? '<missing>')}, expected ${String(expected[field] ?? '<missing>')}.`,
        });
      }
    }
  }
  for (const component of Object.keys(packagedRefs)) {
    if (Object.prototype.hasOwnProperty.call(expectedRefs, component)) continue;
    issues.push({
      code: 'packaged_resolved_ref_unexpected',
      failure_class: 'artifact_invalid',
      component,
      message: `Built App manifest contains unexpected resolved ref ${component}.`,
    });
  }
  return issues;
}

function packagedManifestPath(builtAppPath: string) {
  const carrier = resolveFullCarrierProfile({ carrierId: process.env.OPL_FULL_CARRIER_ID });
  const candidates = [
    path.join(
      builtAppPath,
      'Contents',
      'Resources',
      carrier.runtimeResourceDir,
      'runtime',
      'current',
      'manifest',
      'full-package-manifest.json',
    ),
    path.join(
      builtAppPath,
      'Contents',
      'Resources',
      carrier.runtimeResourceDir,
      'manifest',
      'full-package-manifest.json',
    ),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function collectRuntimeEvidenceIssues(
  manifest: PackagedManifest | null,
  runtimeCurrentness: Record<string, unknown>,
) {
  const issues: GateIssue[] = [];
  if (runtimeCurrentness.status !== 'passed') {
    issues.push({
      code: 'runtime_currentness_not_passed',
      failure_class: 'runtime_source_invalid',
      message: `Runtime currentness status is ${String(runtimeCurrentness.status ?? '<missing>')}.`,
    });
  }
  if (!manifest) {
    issues.push({
      code: 'packaged_manifest_missing',
      failure_class: 'artifact_invalid',
      message: 'Built App does not contain the Full runtime manifest.',
    });
    return { issues, offlinePayloadCount: 0, nativeTrustStatus: null };
  }

  const offlinePayloads = manifest.runtime_assertions?.offline_required_payloads;
  if (!Array.isArray(offlinePayloads) || offlinePayloads.length === 0) {
    issues.push({
      code: 'offline_payload_evidence_missing',
      failure_class: 'artifact_invalid',
      message: 'Packaged Full manifest has no offline required payload evidence.',
    });
  } else {
    for (const payload of offlinePayloads) {
      const executableInvalid = Object.prototype.hasOwnProperty.call(payload, 'executable')
        && payload.executable !== true;
      if (payload.exists !== true || executableInvalid) {
        issues.push({
          code: 'offline_payload_invalid',
          failure_class: 'artifact_invalid',
          relative_path: String(payload.path ?? '<missing>'),
          message: `Offline payload ${String(payload.path ?? '<missing>')} is missing or not executable.`,
        });
      }
    }
  }

  const nativeTrustStatus = manifest.native_trust?.status ?? null;
  const acceptedNativeTrustStatuses = new Set([
    'signed_pending_gatekeeper_assessment',
    'local_authorized_unsigned',
  ]);
  if (!acceptedNativeTrustStatuses.has(nativeTrustStatus)) {
    issues.push({
      code: 'native_trust_invalid',
      failure_class: 'artifact_invalid',
      message: `Packaged native trust status is ${String(nativeTrustStatus ?? '<missing>')}.`,
    });
  }

  return {
    issues,
    offlinePayloadCount: Array.isArray(offlinePayloads) ? offlinePayloads.length : 0,
    nativeTrustStatus,
  };
}

function collectFrameworkCodexAbsenceIssues(
  builtAppPath: string,
  manifest: PackagedManifest | null,
) {
  const carrier = resolveFullCarrierProfile({ carrierId: process.env.OPL_FULL_CARRIER_ID });
  if (!carrier.aioncoreRequired) return [];
  const issues: GateIssue[] = [];
  const declarations = manifest?.runtime_assertions?.declared_pruned_paths ?? [];
  const declarationByPath = new Map(declarations.map((entry) => [entry.path, entry]));
  const runtimeRoot = path.join(
    builtAppPath,
    'Contents',
    'Resources',
    carrier.runtimeResourceDir,
    'runtime',
    'current',
  );

  for (const relativePath of FULL_RUNTIME_FORBIDDEN_FRAMEWORK_CODEX_PATHS) {
    const declaration = declarationByPath.get(relativePath);
    if (!declaration || declaration.expected !== 'absent' || declaration.present !== false) {
      issues.push({
        code: 'framework_codex_absence_evidence_invalid',
        failure_class: 'artifact_invalid',
        relative_path: relativePath,
        message: `Full manifest must declare Framework Codex path ${relativePath} absent.`,
      });
    }
    if (fs.existsSync(path.join(runtimeRoot, ...relativePath.split('/')))) {
      issues.push({
        code: 'framework_codex_payload_present',
        failure_class: 'artifact_invalid',
        relative_path: relativePath,
        message: `Built App contains forbidden Framework-managed Codex payload path ${relativePath}.`,
      });
    }
  }
  return issues;
}

function collectMachOPortabilityIssues(builtAppPath: string) {
  const issues: GateIssue[] = [];
  const files = listMachOFiles(builtAppPath);
  let dependencyCount = 0;
  let rpathCount = 0;
  let ignoredInstallIdCount = 0;
  for (const filePath of files) {
    const relativePath = normalizeRelativePath(builtAppPath, filePath);
    let installIds: string[];
    let dependencies: string[];
    let rpaths: string[];
    try {
      installIds = inspectMachO(filePath, '-D');
      dependencies = inspectMachO(filePath, '-L');
      rpaths = inspectMachORpaths(filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/requires otool/.test(message)) throw error;
      issues.push({
        code: 'macho_inspection_failed',
        failure_class: 'artifact_invalid',
        relative_path: relativePath,
        message,
      });
      continue;
    }
    const installIdSet = new Set(installIds);
    for (const dependency of dependencies) {
      dependencyCount += 1;
      if (installIdSet.has(dependency)) {
        ignoredInstallIdCount += 1;
        continue;
      }
      if (portableLoadPath(dependency)) continue;
      const code = dependencyIssueCode(dependency);
      issues.push({
        code,
        failure_class: 'runtime_source_invalid',
        relative_path: relativePath,
        dependency,
        message: `${relativePath} loads non-portable dependency ${dependency}.`,
      });
    }
    for (const rpath of rpaths) {
      rpathCount += 1;
      if (portableRpath(rpath)) continue;
      const code = rpathIssueCode(rpath);
      issues.push({
        code,
        failure_class: 'runtime_source_invalid',
        relative_path: relativePath,
        rpath,
        message: `${relativePath} declares non-portable LC_RPATH ${rpath}.`,
      });
    }
  }
  return {
    issues,
    machoFileCount: files.length,
    dependencyCount,
    rpathCount,
    ignoredInstallIdCount,
  };
}

function primaryFailureClass(issues: GateIssue[]): FailureClass {
  if (issues.some((issue) => issue.failure_class === 'runtime_source_invalid')) {
    return 'runtime_source_invalid';
  }
  return issues[0]?.failure_class ?? 'artifact_invalid';
}

export function runFullPackagePrecompressionGate(input: GateInput) {
  const startedAt = process.hrtime.bigint();
  const manifestPath = packagedManifestPath(input.builtAppPath);
  let manifest: PackagedManifest | null = null;
  const parseIssues: GateIssue[] = [];
  if (manifestPath) {
    try {
      const parsed = objectValue(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
      if (!parsed) {
        throw new Error('manifest root must be an object');
      }
      manifest = parsed as PackagedManifest;
    } catch (error) {
      parseIssues.push({
        code: 'packaged_manifest_unreadable',
        failure_class: 'artifact_invalid',
        message: `Packaged Full manifest is unreadable: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const packagedRefs = objectValue(manifest?.resolved_refs)
    ? manifest!.resolved_refs!
    : {};
  const refGate = collectResolvedRefIssues(packagedRefs);
  const refParityIssues = collectResolvedRefParityIssues(input.resolvedRefs, packagedRefs);
  const runtimeGate = collectRuntimeEvidenceIssues(manifest, input.runtimeCurrentness);
  const frameworkCodexAbsenceIssues = collectFrameworkCodexAbsenceIssues(
    input.builtAppPath,
    manifest,
  );
  let machoGate;
  try {
    machoGate = collectMachOPortabilityIssues(input.builtAppPath);
  } catch (error) {
    const issue: GateIssue = {
      code: 'otool_unavailable',
      failure_class: 'environment_transient',
      message: error instanceof Error ? error.message : String(error),
    };
    const report = {
      schema: PRECOMPRESSION_GATE_SCHEMA,
      status: 'failed',
      phase: 'post_shell_build_pre_dmg_compression',
      failure_classes: [issue.failure_class],
      rebuild_policy: 'retry_current_stage_after_environment_recovery',
      issues: [issue],
    };
    writeReport(input.reportPath, report);
    throw new FullPrecompressionGateError(issue.failure_class, report);
  }

  const issues = [
    ...parseIssues,
    ...refGate.issues,
    ...refParityIssues,
    ...runtimeGate.issues,
    ...frameworkCodexAbsenceIssues,
    ...machoGate.issues,
  ];
  const durationSeconds = Number(
    (Number(process.hrtime.bigint() - startedAt) / 1_000_000_000).toFixed(3),
  );
  const failureClasses = [...new Set(issues.map((issue) => issue.failure_class))].sort();
  const report = {
    schema: PRECOMPRESSION_GATE_SCHEMA,
    status: issues.length === 0 ? 'passed' : 'failed',
    phase: 'post_shell_build_pre_dmg_compression',
    failure_classes: failureClasses,
    rebuild_policy: issues.length === 0
      ? 'proceed_to_dmg_compression'
      : failureClasses.includes('runtime_source_invalid')
        ? 'fix_runtime_source_then_rebuild'
        : 'rebuild_artifact',
    duration_seconds: durationSeconds,
    gates: {
      resolved_ref_identity: {
        status: refGate.issues.length === 0 && refParityIssues.length === 0 ? 'passed' : 'failed',
        resolved_ref_count: Object.keys(packagedRefs).length,
        full_sha_requested_ref_count: refGate.fullShaRefCount,
      },
      runtime_evidence: {
        status: runtimeGate.issues.length === 0 && parseIssues.length === 0 ? 'passed' : 'failed',
        packaged_manifest_path: manifestPath
          ? normalizeRelativePath(input.builtAppPath, manifestPath)
          : null,
        currentness_status: input.runtimeCurrentness.status ?? null,
        offline_required_payload_count: runtimeGate.offlinePayloadCount,
        native_trust_status: runtimeGate.nativeTrustStatus,
      },
      framework_codex_payload_absence: {
        status: frameworkCodexAbsenceIssues.length === 0 ? 'passed' : 'failed',
        forbidden_paths: FULL_RUNTIME_FORBIDDEN_FRAMEWORK_CODEX_PATHS,
      },
      macho_portability: {
        status: machoGate.issues.length === 0 ? 'passed' : 'failed',
        macho_file_count: machoGate.machoFileCount,
        dependency_count: machoGate.dependencyCount,
        rpath_count: machoGate.rpathCount,
        ignored_install_id_count: machoGate.ignoredInstallIdCount,
        allowed_load_path_prefixes: PORTABLE_LOAD_PATH_PREFIXES,
        allowed_rpath_prefixes: PORTABLE_RPATH_PREFIXES,
      },
    },
    issues,
  };
  writeReport(input.reportPath, report);
  if (issues.length > 0) {
    throw new FullPrecompressionGateError(primaryFailureClass(issues), report);
  }
  return report;
}
