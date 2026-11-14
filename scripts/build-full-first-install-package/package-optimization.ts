import fs from 'node:fs';
import path from 'node:path';

import {
  FULL_RUNTIME_PRUNE_POLICY,
  FULL_RUNTIME_FORBIDDEN_FRAMEWORK_CODEX_PATHS,
} from '../full-first-install-package.ts';
import { directorySizeBytes } from './filesystem.ts';
import { resolveFullCarrierProfile } from './carrier-profile.ts';
import { assertFullCodexOfflineSeed } from './codex-offline-seed.ts';

const APP_BUNDLE_TRIM_REPORT_SCHEMA = 'opl_full_app_bundle_trim_report.v1';
const PACKAGE_BOUNDARY_AUDIT_SCHEMA = 'opl_full_package_boundary_audit.v2';
const PACKAGE_OPTIMIZATION_SCHEMA = 'opl_full_package_optimization.v1';

const STAGED_APP_TRIM_DIRECTORY_BASENAMES =
  FULL_RUNTIME_PRUNE_POLICY.app_bundle_staging.trim_directory_basenames as string[];
const STAGED_APP_TRIM_FILE_SUFFIXES =
  FULL_RUNTIME_PRUNE_POLICY.app_bundle_staging.trim_file_suffixes as string[];
const STAGED_APP_TRIM_NODE_MODULE_DIRECTORY_BASENAMES =
  FULL_RUNTIME_PRUNE_POLICY.app_bundle_staging.trim_node_module_directory_basenames as string[];
function protectedAppBundlePayloads(carrier): string[] {
  return [
    `Contents/Resources/${carrier.runtimeResourceDir}`,
    ...(carrier.shellRuntimePath ? [carrier.shellRuntimePath] : []),
    ...(FULL_RUNTIME_PRUNE_POLICY.app_bundle_staging.protected_payloads as string[])
      .filter((entry) => entry !== 'Contents/Resources/opl-full-runtime'),
  ];
}

function normalizeBundleRelativePath(relativePath: string) {
  return relativePath.split(path.sep).join('/').replace(/^\/+/, '');
}

function appRelativePath(appPath: string, candidatePath: string) {
  return normalizeBundleRelativePath(path.relative(appPath, candidatePath));
}

function pathHasSegment(relativePath: string, segment: string) {
  return relativePath.split('/').includes(segment);
}

function isInsideProtectedAppBundlePayload(relativePath: string, protectedPayloads: string[]) {
  return protectedPayloads.some((protectedPath) => {
    return relativePath === protectedPath || relativePath.startsWith(`${protectedPath}/`);
  });
}

function trimReason(relativePath: string, stat: fs.Stats, protectedPayloads: string[]) {
  if (!relativePath || isInsideProtectedAppBundlePayload(relativePath, protectedPayloads)) {
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

// One operation-local inventory supplies trim accounting and boundary sizes.
// Protected payloads are measured without evaluating trim rules for their children.
function trimAndInventory(appPath: string, protectedPayloads: string[]) {
  const candidates: Array<{ path: string; absolute_path: string; size_bytes: number; reason: string }> = [];
  const sizes = new Map<string, number>();
  const walk = (current: string, protectedTree = false, removedTree = false): { before: number; after: number } => {
    const stat = fs.lstatSync(current);
    const relativePath = appRelativePath(appPath, current);
    const protectedHere = protectedTree || isInsideProtectedAppBundlePayload(relativePath, protectedPayloads);
    const reason = protectedHere || removedTree ? null : trimReason(relativePath, stat, protectedPayloads);
    const removing = removedTree || Boolean(reason);
    let before = stat.isDirectory() ? 0 : stat.size;
    let after = removing ? 0 : before;
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current).sort()) {
        const child = walk(path.join(current, entry), protectedHere, removing);
        before += child.before;
        after += child.after;
      }
    }
    if (reason) candidates.push({ path: relativePath, absolute_path: current, size_bytes: before, reason });
    sizes.set(relativePath, after);
    return { before, after };
  };
  const totals = walk(appPath);
  for (const candidate of candidates) fs.rmSync(candidate.absolute_path, { recursive: true, force: true });
  return { candidates: candidates.sort((a, b) => a.path.localeCompare(b.path)), sizes, ...totals };
}

function trimWithInventory(appPath: string) {
  const carrier = resolveFullCarrierProfile({ carrierId: process.env.OPL_FULL_CARRIER_ID });
  const protectedPayloads = protectedAppBundlePayloads(carrier);
  const { candidates, sizes, before, after } = trimAndInventory(appPath, protectedPayloads);
  const trimReport = {
    schema: APP_BUNDLE_TRIM_REPORT_SCHEMA,
    mode: 'explicit_non_runtime_prune_only',
    app_bundle_path: appPath,
    required_payload_boundary: {
      full_runtime_resource_dir: `Contents/Resources/${carrier.runtimeResourceDir}`,
      protected_payloads: protectedPayloads,
      preserved: true,
      rule: 'never trim the declared Full offline runtime payload from the App bundle staging pass',
    },
    before_bytes: before,
    after_bytes: after,
    bytes_removed: before - after,
    removed_count: candidates.length,
    removed_paths: candidates.map(({ path: relativePath, size_bytes, reason }) => ({ path: relativePath, size_bytes, reason })),
  };
  return { trimReport, sizes, carrier };
}

export function trimFullAppBundleForDmg(appPath: string) {
  return trimWithInventory(appPath).trimReport;
}

export function optimizeFullAppBundleForDmg(appPath: string, manifest: Record<string, any> | null = null) {
  const { trimReport, sizes, carrier } = trimWithInventory(appPath);
  return { trimReport, boundaryAudit: auditFullPackageBundleBoundaries(appPath, manifest, { sizes, carrier }) };
}

function bundleEntry(appPath: string, relativePath: string, owner: string, role: string, sizes?: Map<string, number>) {
  const absolutePath = path.join(appPath, ...relativePath.split('/'));
  const exists = fs.existsSync(absolutePath);
  return {
    path: relativePath,
    owner,
    role,
    exists,
    size_bytes: exists ? (sizes?.get(relativePath) ?? directorySizeBytes(absolutePath)) : 0,
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

export function auditFullPackageBundleBoundaries(appPath: string, manifest: Record<string, any> | null = null, inventory?: { sizes: Map<string, number>; carrier: ReturnType<typeof resolveFullCarrierProfile> }) {
  const carrier = inventory?.carrier ?? resolveFullCarrierProfile({ carrierId: process.env.OPL_FULL_CARRIER_ID });
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
  const codexOfflineSeedPresent = manifest?.codex_offline_seed
    ? assertFullCodexOfflineSeed(fullRuntimeRoot, manifest.codex_offline_seed) : false;
  const codexCarrierAudit = {
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
      inventory?.sizes,
    ),
    studio_shell_runtime: bundleEntry(
      appPath,
      carrier.shellRuntimePath ?? 'Contents/Resources/opl-studio-runtime',
      'gaofeng21cn/opl-studio',
      'Studio shell runtime; the current carrier intentionally embeds no shell runtime',
      inventory?.sizes,
    ),
    app_asar: bundleEntry(
      appPath,
      'Contents/Resources/app.asar',
      'gaofeng21cn/opl-studio',
      'Studio renderer and process bundle',
      inventory?.sizes,
    ),
    app_asar_unpacked: bundleEntry(
      appPath,
      'Contents/Resources/app.asar.unpacked',
      'gaofeng21cn/opl-studio',
      'Studio native unpacked resources',
      inventory?.sizes,
    ),
    electron_framework: bundleEntry(
      appPath,
      'Contents/Frameworks/Electron Framework.framework',
      'active_shell/electron',
      'Electron runtime framework',
      inventory?.sizes,
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
      contains_shell_runtime: entries.studio_shell_runtime.exists,
      native_codex_external_carrier_present: carrier.codexCarrier === 'opl_codex_native',
      native_codex_embedded_payload_present: false,
      codex_offline_seed_present: codexOfflineSeedPresent,
      claude_payload_absent: codexCarrierAudit.claude_payload_absent,
      codex_carrier_audit: codexCarrierAudit,
      framework_codex_payload_absent: forbiddenFrameworkCodexPaths.every((entry) => !entry.exists),
      forbidden_framework_codex_paths: forbiddenFrameworkCodexPaths,
      dedupe_policy: 'studio_offline_seed_with_framework_owned_first_install_and_updates_without_packaged_duplicate_runtime',
      rule: 'Keep one Studio first-install seed and reject duplicate Framework Codex runtime paths.',
    },
    entries,
  };
}

function offlineFirstInstallCompletenessPreserved(args: {
  trimReport: Record<string, any>;
  boundaryAudit: Record<string, any>;
}) {
  const entries = args.boundaryAudit.entries ?? {};
  const carrier = resolveFullCarrierProfile({ carrierId: process.env.OPL_FULL_CARRIER_ID });
  const boundary = args.boundaryAudit.full_package_boundary ?? {};
  return args.trimReport.required_payload_boundary?.preserved === true
    && boundary.contains_opl_full_runtime === true
    && boundary.contains_shell_runtime === carrier.shellRuntimeRequired
    && boundary.native_codex_external_carrier_present === true
    && boundary.native_codex_embedded_payload_present === false
    && boundary.claude_payload_absent === true
    && boundary.framework_codex_payload_absent === true
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
      native_codex_external_carrier_present:
        args.boundaryAudit.full_package_boundary?.native_codex_external_carrier_present,
      native_codex_embedded_payload_present:
        args.boundaryAudit.full_package_boundary?.native_codex_embedded_payload_present,
      claude_payload_absent:
        args.boundaryAudit.full_package_boundary?.claude_payload_absent,
      codex_carrier_audit:
        args.boundaryAudit.full_package_boundary?.codex_carrier_audit,
      framework_codex_payload_absent:
        args.boundaryAudit.full_package_boundary?.framework_codex_payload_absent,
      codex_offline_seed_present:
        args.boundaryAudit.full_package_boundary?.codex_offline_seed_present,
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
