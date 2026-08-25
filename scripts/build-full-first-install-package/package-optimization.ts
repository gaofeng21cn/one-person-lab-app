import fs from 'node:fs';
import path from 'node:path';

import {
  FULL_RUNTIME_PRUNE_POLICY,
  FULL_RUNTIME_FORBIDDEN_FRAMEWORK_CODEX_PATHS,
} from '../full-first-install-package.ts';
import { directorySizeBytes } from './filesystem.ts';
import { resolveFullCarrierProfile } from './carrier-profile.ts';

const APP_BUNDLE_TRIM_REPORT_SCHEMA = 'opl_full_app_bundle_trim_report.v1';
const PACKAGE_BOUNDARY_AUDIT_SCHEMA = 'opl_full_package_boundary_audit.v2';
const PACKAGE_OPTIMIZATION_SCHEMA = 'opl_full_package_optimization.v1';
const MANAGED_RESOURCES_REQUIRED_ABSENT_PATHS = [
  'cli/claude',
  'acp',
  'node_modules/@anthropic-ai/claude-code',
  'node_modules/claude-code',
  'claude',
];

const STAGED_APP_TRIM_DIRECTORY_BASENAMES =
  FULL_RUNTIME_PRUNE_POLICY.app_bundle_staging.trim_directory_basenames as string[];
const STAGED_APP_TRIM_FILE_SUFFIXES =
  FULL_RUNTIME_PRUNE_POLICY.app_bundle_staging.trim_file_suffixes as string[];
const STAGED_APP_TRIM_NODE_MODULE_DIRECTORY_BASENAMES =
  FULL_RUNTIME_PRUNE_POLICY.app_bundle_staging.trim_node_module_directory_basenames as string[];
const PROTECTED_APP_BUNDLE_PAYLOADS =
  FULL_RUNTIME_PRUNE_POLICY.app_bundle_staging.protected_payloads as string[];

function normalizeBundleRelativePath(relativePath: string) {
  return relativePath.split(path.sep).join('/').replace(/^\/+/, '');
}

function appRelativePath(appPath: string, candidatePath: string) {
  return normalizeBundleRelativePath(path.relative(appPath, candidatePath));
}

function pathHasSegment(relativePath: string, segment: string) {
  return relativePath.split('/').includes(segment);
}

function isInsideProtectedAppBundlePayload(relativePath: string) {
  return PROTECTED_APP_BUNDLE_PAYLOADS.some((protectedPath) => {
    return relativePath === protectedPath || relativePath.startsWith(`${protectedPath}/`);
  });
}

function trimReason(relativePath: string, stat: fs.Stats) {
  if (!relativePath || isInsideProtectedAppBundlePayload(relativePath)) {
    return null;
  }

  const baseName = path.posix.basename(relativePath);
  if (stat.isDirectory() && STAGED_APP_TRIM_DIRECTORY_BASENAMES.includes(baseName)) {
    return 'staged_app_non_runtime_directory';
  }
  if (
    stat.isFile()
    && STAGED_APP_TRIM_FILE_SUFFIXES.some((suffix) => baseName.endsWith(suffix))
  ) {
    return 'staged_app_non_runtime_file';
  }
  if (
    stat.isDirectory()
    && pathHasSegment(relativePath, 'node_modules')
    && STAGED_APP_TRIM_NODE_MODULE_DIRECTORY_BASENAMES.includes(baseName)
  ) {
    return 'staged_app_node_module_non_runtime_directory';
  }
  return null;
}

function collectTrimCandidates(appPath: string) {
  const candidates: Array<{
    path: string;
    absolute_path: string;
    size_bytes: number;
    reason: string;
  }> = [];
  const stack = [appPath];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const stat = fs.lstatSync(current);
    const relativePath = appRelativePath(appPath, current);
    const reason = trimReason(relativePath, stat);
    if (reason) {
      candidates.push({
        path: relativePath,
        absolute_path: current,
        size_bytes: directorySizeBytes(current),
        reason,
      });
      continue;
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current).sort().reverse()) {
        stack.push(path.join(current, entry));
      }
    }
  }
  return candidates.sort((left, right) => left.path.localeCompare(right.path));
}

export function trimFullAppBundleForDmg(appPath: string) {
  const carrier = resolveFullCarrierProfile({ carrierId: process.env.OPL_FULL_CARRIER_ID });
  const beforeBytes = directorySizeBytes(appPath);
  const candidates = collectTrimCandidates(appPath);
  for (const candidate of candidates) {
    fs.rmSync(candidate.absolute_path, { recursive: true, force: true });
  }
  const afterBytes = directorySizeBytes(appPath);
  return {
    schema: APP_BUNDLE_TRIM_REPORT_SCHEMA,
    mode: 'explicit_non_runtime_prune_only',
    app_bundle_path: appPath,
    required_payload_boundary: {
      full_runtime_resource_dir: `Contents/Resources/${carrier.runtimeResourceDir}`,
      protected_payloads: [...PROTECTED_APP_BUNDLE_PAYLOADS],
      preserved: true,
      rule: 'never trim the declared Full offline runtime payload from the App bundle staging pass',
    },
    before_bytes: beforeBytes,
    after_bytes: afterBytes,
    bytes_removed: Math.max(0, beforeBytes - afterBytes),
    removed_count: candidates.length,
    removed_paths: candidates.map(({ path: relativePath, size_bytes, reason }) => ({
      path: relativePath,
      size_bytes,
      reason,
    })),
  };
}

function bundleEntry(appPath: string, relativePath: string, owner: string, role: string) {
  const absolutePath = path.join(appPath, ...relativePath.split('/'));
  const exists = fs.existsSync(absolutePath);
  return {
    path: relativePath,
    owner,
    role,
    exists,
    size_bytes: exists ? directorySizeBytes(absolutePath) : 0,
  };
}

function collectBundlePaths(root: string) {
  const entries: Array<{ path: string; basename: string; symlink: boolean }> = [];
  if (!fs.existsSync(root)) return entries;
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = normalizeBundleRelativePath(path.relative(root, absolutePath));
      entries.push({
        path: relativePath,
        basename: entry.name,
        symlink: entry.isSymbolicLink(),
      });
      if (entry.isDirectory() && !entry.isSymbolicLink()) walk(absolutePath);
    }
  };
  walk(root);
  return entries;
}

function safeManagedRelativePath(value: unknown) {
  return typeof value === 'string'
    && value.length > 0
    && !value.includes('\\')
    && !path.posix.isAbsolute(value)
    && path.posix.normalize(value) === value
    && value.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

function managedEntryPresent(
  managedRoot: string,
  relativePath: unknown,
  kind: 'file' | 'directory',
) {
  if (!safeManagedRelativePath(relativePath)) return false;
  const candidate = path.join(managedRoot, ...String(relativePath).split('/'));
  const stat = fs.lstatSync(candidate, { throwIfNoEntry: false });
  return Boolean(
    stat
    && !stat.isSymbolicLink()
    && (kind === 'file' ? stat.isFile() : stat.isDirectory()),
  );
}

function managedDescriptorValid(
  managedRoot: string,
  descriptor: Record<string, any> | null,
) {
  if (!descriptor) return false;
  if (
    !safeManagedRelativePath(descriptor.root)
    || !safeManagedRelativePath(descriptor.executable)
  ) return false;
  const root = path.join(managedRoot, ...descriptor.root.split('/'));
  if (!managedEntryPresent(managedRoot, descriptor.root, 'directory')) return false;
  if (!managedEntryPresent(root, descriptor.executable, 'file')) return false;
  if (
    descriptor.requiredFiles !== undefined
    && (
      !Array.isArray(descriptor.requiredFiles)
      || descriptor.requiredFiles.some((entry: unknown) =>
        !managedEntryPresent(root, entry, 'file'))
    )
  ) return false;
  if (
    descriptor.requiredDirectories !== undefined
    && (
      !Array.isArray(descriptor.requiredDirectories)
      || descriptor.requiredDirectories.some((entry: unknown) =>
        !managedEntryPresent(root, entry, 'directory'))
    )
  ) return false;
  return true;
}

function auditAioncoreCodexOnlyProjection(appPath: string) {
  const bundledRoot = path.join(appPath, 'Contents', 'Resources', 'bundled-aioncore');
  const paths = collectBundlePaths(bundledRoot);
  const runtimeKeys = fs.existsSync(bundledRoot)
    ? fs.readdirSync(bundledRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort()
    : [];
  const runtimes = runtimeKeys.map((runtimeKey) => {
    const managedRoot = path.join(bundledRoot, runtimeKey, 'managed-resources');
    const manifestPath = path.join(managedRoot, 'manifest.json');
    let manifest: Record<string, any> | null = null;
    try {
      const candidate = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        manifest = candidate;
      }
    } catch {}
    const cliNames = Array.isArray(manifest?.clis)
      ? manifest.clis.map((entry: any) => entry?.name)
      : [];
    const codex = cliNames.length === 1 && cliNames[0] === 'codex'
      ? manifest?.clis?.[0]
      : null;
    const valid = (
      manifest?.schema === 'opl_aioncore_managed_resources_projection.v1'
      && manifest?.runtimeKey === runtimeKey
      && manifest?.source?.schemaVersion === 2
      && /^[a-f0-9]{64}$/.test(String(manifest?.source?.manifestSha256 ?? ''))
      && JSON.stringify(manifest?.source?.cliNames) === JSON.stringify([])
      && JSON.stringify(manifest?.projection?.includedCliNames) === JSON.stringify(['codex'])
      && JSON.stringify(manifest?.projection?.excludedCliNames) === JSON.stringify(['claude'])
      && JSON.stringify(manifest?.projection?.requiredAbsentPaths)
        === JSON.stringify(MANAGED_RESOURCES_REQUIRED_ABSENT_PATHS)
      && JSON.stringify(cliNames) === JSON.stringify(['codex'])
      && typeof manifest?.node === 'object'
      && manifest.node !== null
      && managedDescriptorValid(managedRoot, manifest.node)
      && managedDescriptorValid(managedRoot, codex)
    );
    return {
      runtime_key: runtimeKey,
      manifest_path: normalizeBundleRelativePath(path.relative(appPath, manifestPath)),
      projection_valid: valid,
      cli_names: cliNames,
      producer_manifest_sha256: manifest?.source?.manifestSha256 ?? null,
    };
  });
  const matchPaths = (predicate: (entry: { path: string; basename: string; symlink: boolean }) => boolean) =>
    paths.filter(predicate).map((entry) => entry.path).sort();
  const absenceChecks = [
    {
      id: 'managed_claude_subtree',
      matches: matchPaths((entry) =>
        /(^|\/)managed-resources\/cli\/claude(\/|$)/.test(entry.path)),
    },
    {
      id: 'claude_executable_or_symlink',
      matches: matchPaths((entry) =>
        entry.basename === 'claude' || entry.basename === 'claude.exe'),
    },
    {
      id: 'anthropic_package_or_archive',
      matches: matchPaths((entry) =>
        /(^|\/)node_modules\/@anthropic-ai\/claude-code(\/|$)/.test(entry.path)
        || /^claude-code.*\.(?:tgz|tar\.gz)$/.test(entry.basename)),
    },
    {
      id: 'claude_distribution_cache_entry',
      matches: matchPaths((entry) => {
        const segments = entry.path.split('/');
        const cacheIndex = segments.findIndex((segment) =>
          segment === '.cache' || segment === 'cache');
        return cacheIndex >= 0
          && segments.slice(cacheIndex + 1).some((segment) => segment.startsWith('claude'));
      }),
    },
    {
      id: 'raw_producer_manifest',
      matches: runtimes
        .filter((runtime) => runtime.projection_valid !== true)
        .map((runtime) => runtime.manifest_path),
    },
  ].map((check) => ({
    ...check,
    expected_match_count: 0,
    match_count: check.matches.length,
  }));
  return {
    schema: 'opl_aioncore_codex_only_projection_audit.v1',
    runtime_count: runtimes.length,
    runtimes,
    required_absence_checks: absenceChecks,
    projection_present: runtimes.length > 0
      && runtimes.every((runtime) => runtime.projection_valid),
    claude_payload_absent: absenceChecks.every((check) => check.match_count === 0),
  };
}

export function auditFullPackageBundleBoundaries(appPath: string, manifest: Record<string, any> | null = null) {
  const carrier = resolveFullCarrierProfile({ carrierId: process.env.OPL_FULL_CARRIER_ID });
  const fullRuntimeRoot = path.join(
    appPath,
    'Contents',
    'Resources',
    carrier.runtimeResourceDir,
    'runtime',
    'current',
  );
  const forbiddenFrameworkCodexPaths = FULL_RUNTIME_FORBIDDEN_FRAMEWORK_CODEX_PATHS.map(
    (relativePath) => ({
      path: relativePath,
      exists: fs.existsSync(path.join(fullRuntimeRoot, ...relativePath.split('/'))),
    }),
  );
  const aioncoreCodexOnlyProjection = carrier.aioncoreRequired ? auditAioncoreCodexOnlyProjection(appPath) : {
    schema: 'opl_codex_native_carrier_audit.v1',
    runtime_count: 0,
    runtimes: [],
    required_absence_checks: [],
    projection_present: false,
    claude_payload_absent: true,
  };
  const entries = {
    opl_full_runtime: bundleEntry(
      appPath,
      `Contents/Resources/${carrier.runtimeResourceDir}`,
      'gaofeng21cn/one-person-lab',
      'Full offline first-install runtime payload assembled by the App repo as consumer/packager',
    ),
    aionui_bundled_runtime: bundleEntry(
      appPath,
      'Contents/Resources/bundled-aioncore',
      'active_shell',
      'AionUI shell runtime required by the App bundle',
    ),
    app_asar: bundleEntry(
      appPath,
      'Contents/Resources/app.asar',
      'active_shell',
      'AionUI renderer and process bundle',
    ),
    app_asar_unpacked: bundleEntry(
      appPath,
      'Contents/Resources/app.asar.unpacked',
      'active_shell',
      'Native unpacked shell resources',
    ),
    electron_framework: bundleEntry(
      appPath,
      'Contents/Frameworks/Electron Framework.framework',
      'active_shell/electron',
      'Electron runtime framework',
    ),
  };
  return {
    schema: PACKAGE_BOUNDARY_AUDIT_SCHEMA,
    app_bundle_path: appPath,
    package_kind: manifest?.package_kind ?? 'opl_full_first_install_macos_arm64',
    version: manifest?.version ?? null,
    standard_app_boundary: {
      standard_package_allowed_to_contain_full_runtime: false,
      standard_payload_guard: 'scripts/prepare-standard-release-payload.ts removes packaged-runtimes/opl-full-runtime before standard builds; Standard publication validation rejects Full runtime payloads',
    },
    full_package_boundary: {
      contains_opl_full_runtime: entries.opl_full_runtime.exists,
      contains_shell_runtime: entries.aionui_bundled_runtime.exists,
      aioncore_codex_carrier_present: carrier.aioncoreRequired ? entries.aionui_bundled_runtime.exists : false,
      aioncore_codex_only_projection_present: carrier.aioncoreRequired ? aioncoreCodexOnlyProjection.projection_present : false,
      aioncore_claude_payload_absent: aioncoreCodexOnlyProjection.claude_payload_absent,
      aioncore_codex_only_projection_audit: aioncoreCodexOnlyProjection,
      framework_codex_payload_absent: forbiddenFrameworkCodexPaths.every((entry) => !entry.exists),
      forbidden_framework_codex_paths: forbiddenFrameworkCodexPaths,
      dedupe_policy: carrier.aioncoreRequired ? 'aioncore_is_the_only_codex_carrier_in_the_aionui_app_bundle' : 'opl_codex_native_is_the_only_codex_carrier_in_the_studio_app_bundle',
      rule: 'Keep the bundled AionCore shell carrier and reject every Framework-managed Codex archive, wrapper, cache, or companion rg path from the Full runtime.',
    },
    entries,
  };
}

function offlineFirstInstallCompletenessPreserved(args: {
  trimReport: Record<string, any>;
  boundaryAudit: Record<string, any>;
}) {
  const entries = args.boundaryAudit.entries ?? {};
  return args.trimReport.required_payload_boundary?.preserved === true
    && args.boundaryAudit.full_package_boundary?.contains_opl_full_runtime === true
    && args.boundaryAudit.full_package_boundary?.contains_shell_runtime === true
    && args.boundaryAudit.full_package_boundary?.aioncore_codex_carrier_present === true
    && args.boundaryAudit.full_package_boundary?.aioncore_codex_only_projection_present === true
    && args.boundaryAudit.full_package_boundary?.aioncore_claude_payload_absent === true
    && args.boundaryAudit.full_package_boundary?.framework_codex_payload_absent === true
    && entries.app_asar?.exists === true
    && entries.electron_framework?.exists === true;
}

function buildFullPackageOptimizationSection(args: {
  trimReport: Record<string, any>;
  boundaryAudit: Record<string, any>;
}) {
  const completenessPreserved = offlineFirstInstallCompletenessPreserved(args);
  return {
    schema: PACKAGE_OPTIMIZATION_SCHEMA,
    offline_first_install_completeness_preserved: completenessPreserved,
    size_review_release_blocking_by_size_alone: false,
    required_evidence: [
      'full-package-manifest.json#runtime_assertions.offline_required_payloads',
      'full-runtime-native-trust.json',
    ],
    optional_certification_evidence: [
      {
        id: 'full_dmg_clean_vm_smoke',
        policy: 'post_publication_optional_non_blocking',
        allowed_statuses: ['passed', 'failed', 'not_run', 'unavailable'],
      },
    ],
    app_bundle_trim: {
      schema: args.trimReport.schema,
      mode: args.trimReport.mode,
      before_bytes: args.trimReport.before_bytes,
      after_bytes: args.trimReport.after_bytes,
      bytes_removed: args.trimReport.bytes_removed,
      removed_count: args.trimReport.removed_count,
      required_payload_boundary: args.trimReport.required_payload_boundary,
    },
    package_boundary_audit: {
      schema: args.boundaryAudit.schema,
      standard_package_allowed_to_contain_full_runtime:
        args.boundaryAudit.standard_app_boundary?.standard_package_allowed_to_contain_full_runtime,
      contains_opl_full_runtime: args.boundaryAudit.full_package_boundary?.contains_opl_full_runtime,
      contains_shell_runtime: args.boundaryAudit.full_package_boundary?.contains_shell_runtime,
      aioncore_codex_carrier_present:
        args.boundaryAudit.full_package_boundary?.aioncore_codex_carrier_present,
      aioncore_codex_only_projection_present:
        args.boundaryAudit.full_package_boundary?.aioncore_codex_only_projection_present,
      aioncore_claude_payload_absent:
        args.boundaryAudit.full_package_boundary?.aioncore_claude_payload_absent,
      aioncore_codex_only_projection_audit:
        args.boundaryAudit.full_package_boundary?.aioncore_codex_only_projection_audit,
      framework_codex_payload_absent:
        args.boundaryAudit.full_package_boundary?.framework_codex_payload_absent,
      forbidden_framework_codex_paths:
        args.boundaryAudit.full_package_boundary?.forbidden_framework_codex_paths,
      dedupe_policy: args.boundaryAudit.full_package_boundary?.dedupe_policy,
      audited_entries: Object.fromEntries(
        Object.entries(args.boundaryAudit.entries ?? {}).map(([id, value]) => [
          id,
          {
            path: (value as any).path,
            owner: (value as any).owner,
            exists: (value as any).exists,
            size_bytes: (value as any).size_bytes,
          },
        ]),
      ),
    },
  };
}

function assertFullPackageOptimizationPreservesOfflineBoundary(optimization: Record<string, any>) {
  if (optimization.offline_first_install_completeness_preserved !== true) {
    throw new Error(
      'Full package optimization did not preserve the declared offline first-install App bundle boundary.',
    );
  }
}

export function withFullPackageOptimization(manifest: Record<string, any>, args: {
  trimReport: Record<string, any>;
  boundaryAudit: Record<string, any>;
}) {
  const packageOptimization = buildFullPackageOptimizationSection(args);
  assertFullPackageOptimizationPreservesOfflineBoundary(packageOptimization);
  return {
    ...manifest,
    package_optimization: packageOptimization,
  };
}

export function writeFullPackageManifestIntoApp(appPath: string, manifest: Record<string, any>) {
  const carrier = resolveFullCarrierProfile({ carrierId: process.env.OPL_FULL_CARRIER_ID });
  const manifestRelativePaths = [
    `Contents/Resources/${carrier.runtimeResourceDir}/manifest/full-package-manifest.json`,
    `Contents/Resources/${carrier.runtimeResourceDir}/runtime/current/manifest/full-package-manifest.json`,
  ];
  const written: string[] = [];
  for (const relativePath of manifestRelativePaths) {
    const manifestPath = path.join(appPath, ...relativePath.split('/'));
    if (!fs.existsSync(path.dirname(manifestPath))) {
      continue;
    }
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    written.push(relativePath);
  }
  return written;
}
