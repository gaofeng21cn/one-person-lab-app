import fs from 'node:fs';
import path from 'node:path';

import {
  FULL_RUNTIME_PRUNE_POLICY,
  FULL_RUNTIME_RESOURCE_DIR,
} from '../full-first-install-package.ts';
import { directorySizeBytes } from './filesystem.ts';

const APP_BUNDLE_TRIM_REPORT_SCHEMA = 'opl_full_app_bundle_trim_report.v1';
const PACKAGE_BOUNDARY_AUDIT_SCHEMA = 'opl_full_package_boundary_audit.v1';
const PACKAGE_OPTIMIZATION_SCHEMA = 'opl_full_package_optimization.v1';

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
      full_runtime_resource_dir: `Contents/Resources/${FULL_RUNTIME_RESOURCE_DIR}`,
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

export function auditFullPackageBundleBoundaries(appPath: string, manifest: Record<string, any> | null = null) {
  const entries = {
    opl_full_runtime: bundleEntry(
      appPath,
      `Contents/Resources/${FULL_RUNTIME_RESOURCE_DIR}`,
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
      standard_payload_guard: 'scripts/prepare-standard-release-payload.ts removes packaged-runtimes/opl-full-runtime before standard builds; publish-release asserts standard App bundles do not contain Contents/Resources/opl-full-runtime/runtime/current',
    },
    full_package_boundary: {
      contains_opl_full_runtime: entries.opl_full_runtime.exists,
      contains_shell_runtime: entries.aionui_bundled_runtime.exists,
      dedupe_policy: 'audit_only_without_same_cohort_full_clean_vm_evidence',
      rule: 'Do not dedupe or remove declared offline Full runtime, shell runtime, native trust, or Core readiness payloads for size alone.',
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
  const manifestRelativePaths = [
    `Contents/Resources/${FULL_RUNTIME_RESOURCE_DIR}/manifest/full-package-manifest.json`,
    `Contents/Resources/${FULL_RUNTIME_RESOURCE_DIR}/runtime/current/manifest/full-package-manifest.json`,
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
