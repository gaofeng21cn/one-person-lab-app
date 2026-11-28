import fs from 'node:fs';
import { catalogPackageSeed } from './catalog-package-seed.ts';
import os from 'node:os';
import path from 'node:path';

import {
  FULL_RUNTIME_CACHE_LAYER_IDS,
  buildFullRuntimeAggregateCacheKeyInput,
  buildFullRuntimeCacheArchivePath,
  buildFullRuntimeCacheKey,
  buildFullRuntimePruneImplementationHash,
  buildFullRuntimePrunePolicyCacheHash,
  classifyFullRuntimeLayerCache,
  type FullRuntimeCacheLayerId,
} from '../full-first-install-package.ts';
import { archiveLayer, extractLayer } from './archive-output.ts';
import { copyPathContents } from './filesystem.ts';
import { readGitHead } from './git.ts';
import {
  directoryFingerprint,
  existingFileSha256,
  packageJsonVersion,
  productionNodeModulesFingerprint,
} from './hashing.ts';
import { commandOutput, durationSeconds, monotonicSeconds } from './process.ts';
import { flowCapabilityBuildLockCacheInput } from './flow-capability-build-lock.ts';
import { resolvedSelectedBundleCacheInput } from './resolved-selected-bundle-descriptor.ts';
import {
  FULL_RUNTIME_STARTER_PROFILE,
  resolveSelectedPackageSetInput,
  type FullRuntimePackageProfile,
} from './runtime-cache-package-set.ts';
import { buildRuntimeLayerImplementationHash } from './runtime-layers.ts';
import { selectedLocalComponentSeedInputs } from './local-component-seeds.ts';
import { OFFICIAL_SOFTWARE_CATALOG } from '../official-software-catalog.mjs';

function buildLayerImplementationInput(layerId: FullRuntimeCacheLayerId) {
  return {
    schema: 'opl_full_runtime_layer_implementation_input.v1',
    layer_id: layerId,
    layer_builder_sha256: buildRuntimeLayerImplementationHash(layerId),
    prune_implementation_sha256: buildFullRuntimePruneImplementationHash(),
    prune_policy_sha256: buildFullRuntimePrunePolicyCacheHash(layerId),
  };
}

function domainSourceFingerprints(options) {
  const catalog = catalogPackageSeed(options.macMediaAssetsRoot);
  return {
    ...(catalog ? { [catalog.packageId]: catalog.digest.replace(/^sha256:/, '') } : {}),
    mas: directoryFingerprint(options.masRoot, 'modules/mas'),
    'med-autocast': directoryFingerprint(options.macRoot, 'modules/med-autocast'),
    mag: directoryFingerprint(options.magRoot, 'modules/mag'),
    rca: directoryFingerprint(options.rcaRoot, 'modules/rca'),
    oma: directoryFingerprint(options.metaAgentRoot, 'modules/meta-agent'),
    obf: directoryFingerprint(options.bookforgeRoot, 'modules/bookforge'),
    'mas-scholar-skills': directoryFingerprint(
      options.masScholarSkillsRoot,
      'modules/mas-scholar-skills',
    ),
    'opl-flow': directoryFingerprint(options.oplFlowRoot, 'modules/opl-flow'),
  };
}

export function buildRuntimeCacheKeyInputs(
  options,
  sources,
  selectedPackageSet = null,
  packageProfile: FullRuntimePackageProfile = FULL_RUNTIME_STARTER_PROFILE,
  resolvedSelectedBundleDescriptor: unknown = null,
  flowCapabilityBuildLock: unknown = null,
) {
  if (!flowCapabilityBuildLock) {
    throw new Error('Full runtime cache identity requires the Framework-generated Flow capability build lock.');
  }
  const packageSet = selectedPackageSet ?? resolveSelectedPackageSetInput(options, packageProfile);
  const nodeRoot = path.dirname(path.dirname(sources.nodeToolchain.nodeBin));
  const pythonRootName = path.basename(sources.pythonRoot);

  return {
    toolchain: {
      node_sha256: existingFileSha256(sources.nodeToolchain.nodeBin),
      npm_bin_sha256: existingFileSha256(sources.nodeToolchain.npmBin),
      npx_bin_sha256: existingFileSha256(sources.nodeToolchain.npxBin),
      npm_package_version: packageJsonVersion(path.join(sources.nodeToolchain.npmRoot, 'package.json')),
        npm_package_fingerprint: directoryFingerprint(sources.nodeToolchain.npmRoot, 'node/lib/node_modules/npm'),
        node_runtime_fingerprint: directoryFingerprint(nodeRoot, 'node'),
        bun_runtime_included: options.includeBunRuntime,
        bun_sha256: sources.bunBin ? existingFileSha256(sources.bunBin) : null,
        uv_sha256: existingFileSha256(sources.uvBin),
        flow_capability_build_lock: flowCapabilityBuildLockCacheInput(flowCapabilityBuildLock),
        python_root_name: pythonRootName,
        python_version: commandOutput(path.join(sources.pythonRoot, 'bin', 'python3'), ['--version']),
        python_runtime_fingerprint: directoryFingerprint(
          sources.pythonRoot,
          `python/${pythonRootName}`,
        ),
        implementation: buildLayerImplementationInput('toolchain'),
    },
    'domain-runtime': {
        selected_package_set: packageSet,
        source_fingerprints: domainSourceFingerprints(options),
        local_component_seeds: selectedLocalComponentSeedInputs(
          options,
          packageProfile.package_ids,
        ).map(({ payload, ...identity }) => identity),
        implementation: buildLayerImplementationInput('domain-runtime'),
    },
    'opl-runtime': {
        opl_commit: readGitHead(options.frameworkRoot),
        ...(options.catalogIndexPath ? { software_catalog: OFFICIAL_SOFTWARE_CATALOG } : {}),
        framework_runtime_fingerprint: directoryFingerprint(options.frameworkRoot, 'opl'),
        package_json_sha256: existingFileSha256(path.join(options.frameworkRoot, 'package.json')),
        package_lock_sha256: existingFileSha256(path.join(options.frameworkRoot, 'package-lock.json')),
        production_node_modules_fingerprint: productionNodeModulesFingerprint(options.frameworkRoot),
        tsconfig_sha256: existingFileSha256(path.join(options.frameworkRoot, 'tsconfig.json')),
        implementation: buildLayerImplementationInput('opl-runtime'),
    },
    skills: {
        selected_package_set_identity: packageSet.identity,
        ...(resolvedSelectedBundleDescriptor
          ? {
              resolved_selected_bundle: resolvedSelectedBundleCacheInput(resolvedSelectedBundleDescriptor),
            }
          : {
              resolved_selected_bundle: null,
              source: 'owner_package_plugin_carriers_only',
            }),
        implementation: buildLayerImplementationInput('skills'),
    },
  };
}

export function buildRuntimeCacheKeysFromInputs(layerInputs) {
  return {
    toolchain: buildFullRuntimeCacheKey({
      layerId: 'toolchain',
      parts: layerInputs.toolchain,
    }),
    'domain-runtime': buildFullRuntimeCacheKey({
      layerId: 'domain-runtime',
      parts: layerInputs['domain-runtime'],
    }),
    'opl-runtime': buildFullRuntimeCacheKey({
      layerId: 'opl-runtime',
      parts: layerInputs['opl-runtime'],
    }),
    skills: buildFullRuntimeCacheKey({
      layerId: 'skills',
      parts: layerInputs.skills,
    }),
  };
}

export function buildRuntimeCacheContext(
  options,
  sources,
  packageProfile: FullRuntimePackageProfile = FULL_RUNTIME_STARTER_PROFILE,
  resolvedSelectedBundleDescriptor: unknown = null,
  flowCapabilityBuildLock: unknown = null,
) {
  const selectedPackageSet = resolveSelectedPackageSetInput(options, packageProfile);
  const layerKeyInputs = buildRuntimeCacheKeyInputs(
    options,
    sources,
    selectedPackageSet,
    packageProfile,
    resolvedSelectedBundleDescriptor,
    flowCapabilityBuildLock,
  );
  return {
    selectedPackageSet,
    layerKeyInputs,
    layers: buildRuntimeCacheKeysFromInputs(layerKeyInputs),
  };
}

function cacheLayerArchivePath(options, layerId, key) {
  return buildFullRuntimeCacheArchivePath({
    cacheDir: options.runtimeCacheDir,
    layerId,
    key,
  });
}

export function buildRuntimeCacheKeyReport(
  options,
  sources,
  packageProfile: FullRuntimePackageProfile = FULL_RUNTIME_STARTER_PROFILE,
  resolvedSelectedBundleDescriptor: unknown = null,
  flowCapabilityBuildLock: unknown = null,
) {
  const { selectedPackageSet, layerKeyInputs, layers } = buildRuntimeCacheContext(
    options,
    sources,
    packageProfile,
    resolvedSelectedBundleDescriptor,
    flowCapabilityBuildLock,
  );
  return {
    status: 'runtime_cache_keys',
    version: options.version,
    runtime_cache_mode: options.runtimeCacheMode,
    runtime_cache_dir: options.runtimeCacheDir || null,
    selected_package_set: selectedPackageSet,
    aggregate_key_input: buildFullRuntimeAggregateCacheKeyInput({ layers }),
    layer_key_inputs: layerKeyInputs,
    layers,
    layer_ids: FULL_RUNTIME_CACHE_LAYER_IDS,
  };
}

export const DEFAULT_RUNTIME_LAYER_CACHE_MAX_ARCHIVES = 2;
export const DEFAULT_RUNTIME_LAYER_CACHE_MAX_AGE_DAYS = 14;

function positiveIntOption(value: string | undefined, fallback: number): number {
  const raw = value?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function pruneFullRuntimeLayerCache(
  cacheDir: string | null | undefined,
  layerId: FullRuntimeCacheLayerId,
  activeArchivePath: string | null | undefined,
  options: {
    maxArchives?: number;
    maxAgeMs?: number;
    nowMs?: number;
  } = {},
) {
  const summary = {
    layer_id: layerId,
    layer_dir: cacheDir ? path.join(path.resolve(cacheDir), layerId) : null,
    removed_archives: [] as string[],
    retained_archives: [] as string[],
  };
  if (!summary.layer_dir) return summary;
  let dirStat: fs.Stats;
  try {
    dirStat = fs.lstatSync(summary.layer_dir);
  } catch {
    return summary;
  }
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) return summary;

  const resolvedActive = activeArchivePath ? path.resolve(activeArchivePath) : null;
  const nowMs = options.nowMs ?? Date.now();
  const maxArchives = options.maxArchives
    ?? positiveIntOption(process.env.OPL_FULL_RUNTIME_CACHE_MAX_ARCHIVES, DEFAULT_RUNTIME_LAYER_CACHE_MAX_ARCHIVES);
  const maxAgeMs = options.maxAgeMs
    ?? positiveIntOption(process.env.OPL_FULL_RUNTIME_CACHE_MAX_AGE_DAYS, DEFAULT_RUNTIME_LAYER_CACHE_MAX_AGE_DAYS)
      * 24 * 60 * 60 * 1000;

  const candidates: Array<{ path: string; mtimeMs: number; active: boolean }> = [];
  for (const entry of fs.readdirSync(summary.layer_dir, { withFileTypes: true })) {
    if (!entry.name.endsWith('.tar.zst')) continue;
    const candidatePath = path.join(summary.layer_dir, entry.name);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(candidatePath);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    candidates.push({
      path: candidatePath,
      mtimeMs: stat.mtimeMs,
      active: candidatePath === resolvedActive,
    });
  }
  candidates.sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    return right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path);
  });

  let retained = 0;
  for (const candidate of candidates) {
    const expired = Number.isFinite(maxAgeMs) && maxAgeMs >= 0 && (nowMs - candidate.mtimeMs) > maxAgeMs;
    if (candidate.active || (!expired && retained < maxArchives)) {
      summary.retained_archives.push(candidate.path);
      retained += 1;
      continue;
    }
    fs.rmSync(candidate.path, { force: true });
    summary.removed_archives.push(candidate.path);
  }
  return summary;
}

export function runCachedLayer(options, layerId, key, targetRoot, builder) {
  const startedAt = monotonicSeconds();
  const archivePath = cacheLayerArchivePath(options, layerId, key);
  const cacheEvent = classifyFullRuntimeLayerCache({
    mode: options.runtimeCacheMode,
    cacheDir: options.runtimeCacheDir || null,
    layerId,
    key,
    archiveExists: fs.existsSync(archivePath),
  });

  if (cacheEvent.read_archive) {
    extractLayer(archivePath, targetRoot);
    return {
      ...cacheEvent,
      duration_seconds: durationSeconds(startedAt, monotonicSeconds()),
    };
  }

  const tempLayerRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-full-${layerId}-`));
  try {
    builder(tempLayerRoot);
    copyPathContents(tempLayerRoot, targetRoot);
    if (cacheEvent.write_archive) {
      archiveLayer(tempLayerRoot, archivePath);
      try {
        pruneFullRuntimeLayerCache(options.runtimeCacheDir, layerId, archivePath);
      } catch {
        // Best-effort layer cache pruning must not fail a verified build.
      }
    }
    return {
      ...cacheEvent,
      duration_seconds: durationSeconds(startedAt, monotonicSeconds()),
    };
  } finally {
    fs.rmSync(tempLayerRoot, { recursive: true, force: true });
  }
}
