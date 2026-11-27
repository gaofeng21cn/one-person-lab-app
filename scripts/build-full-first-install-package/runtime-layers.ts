import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  FULL_RUNTIME_PRUNE_POLICY,
  buildFullRuntimePrunePolicyHash,
  PACKAGED_MODULE_MARKER_FILE,
  buildPackagedModuleMarker,
  listFullRuntimeProductionNodeModulePaths,
  type FullRuntimeCacheLayerId,
} from '../full-first-install-package.ts';
import { writeRuntimeWrappers } from '../full-first-install-runtime-wrappers.ts';
import {
  MACOS_ARM64_TEMPORAL_CORE_BRIDGE_TARGET,
} from './paths.ts';
import {
  copyNodeRuntimePayload,
  copyProductionNodeModules,
  copySingleFile,
  copyTreeFiltered,
} from './filesystem.ts';
import { readGitHead } from './git.ts';
import { catalogPackageSeed, copyCatalogPackageSeed } from './catalog-package-seed.ts';
import { materializeSelectedLocalComponentSeeds } from './local-component-seeds.ts';
import { stageOfficialSoftwareCatalog } from '../official-software-catalog.mjs';
import { commandOutput } from './process.ts';
import {
  FLOW_CAPABILITY_BUILD_LOCK_RELATIVE_PATH,
  assertMaterializedFlowCapabilityBuildLock,
  materializeFlowCapabilityBuildLock,
} from './flow-capability-build-lock.ts';
import {
  materializeResolvedSelectedBundleDescriptor,
  readMaterializedResolvedSelectedBundleDescriptor,
} from './resolved-selected-bundle-descriptor.ts';


export function assertOplRuntimeProductionDependencies(oplRoot) {
  const packageJsonPath = path.join(oplRoot, 'package.json');
  const packageLockPath = path.join(oplRoot, 'package-lock.json');
  if (!fs.existsSync(packageJsonPath) || !fs.existsSync(packageLockPath)) {
    throw new Error(`Full runtime OPL payload is missing package metadata under ${oplRoot}`);
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const dependencies = packageJson.dependencies ?? {};
  const requiredTemporalPackages = [
    '@temporalio/activity',
    '@temporalio/client',
    '@temporalio/common',
    '@temporalio/worker',
    '@temporalio/workflow',
  ];
  const missingDeclared = requiredTemporalPackages.filter((packageName) => typeof dependencies[packageName] !== 'string');
  if (missingDeclared.length > 0) {
    throw new Error(
      `Full runtime OPL payload has Temporal runtime packages outside dependencies: ${missingDeclared.join(', ')}`,
    );
  }

  const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
  const missingProductionPaths = listFullRuntimeProductionNodeModulePaths(packageLock)
    .filter((relativePath) => !fs.existsSync(path.join(oplRoot, relativePath)));
  if (missingProductionPaths.length > 0) {
    throw new Error([
      `Full runtime OPL payload is missing ${missingProductionPaths.length} production node module path(s).`,
      ...missingProductionPaths.slice(0, 20).map((relativePath) => `  - ${relativePath}`),
      missingProductionPaths.length > 20 ? `  ... ${missingProductionPaths.length - 20} more omitted` : '',
    ].filter(Boolean).join('\n'));
  }

  const temporalTestingPath = path.join(oplRoot, 'node_modules', '@temporalio', 'testing');
  if (fs.existsSync(temporalTestingPath)) {
    throw new Error('Full runtime OPL payload includes @temporalio/testing, which is a dev-only test server package.');
  }
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function writeTemporalCliWrapper(targetPath, versionOutput) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `#!/bin/bash
set -euo pipefail
TEMPORAL_VERSION_OUTPUT=${shellSingleQuote(versionOutput)}
if [[ "\${1:-}" == "--version" ]]; then
  printf '%s\\n' "$TEMPORAL_VERSION_OUTPUT"
  exit 0
fi
RUNTIME_HOME="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE="$RUNTIME_HOME/vendor/temporal/temporal_cli_darwin_arm64.tar.gz"
EXTRACT_ROOT="$RUNTIME_HOME/.runtime-cache/temporal-cli"
TEMPORAL_BIN="$EXTRACT_ROOT/temporal"
if [[ ! -x "$TEMPORAL_BIN" ]]; then
  if [[ ! -f "$ARCHIVE" ]]; then
    printf 'Packaged Temporal CLI archive is missing: %s\\n' "$ARCHIVE" >&2
    exit 1
  fi
  rm -rf "$EXTRACT_ROOT"
  mkdir -p "$EXTRACT_ROOT"
  tar -xzf "$ARCHIVE" -C "$EXTRACT_ROOT"
  if [[ ! -x "$TEMPORAL_BIN" ]]; then
    candidates=()
    while IFS= read -r candidate; do candidates+=("$candidate"); done < <(
      find "$EXTRACT_ROOT" -type f -name temporal -perm -111 -print | LC_ALL=C sort
    )
    if [[ "\${#candidates[@]}" -gt 1 ]]; then
      printf 'Packaged Temporal CLI archive contains multiple executable temporal binaries: %s\n' "\${#candidates[@]}" >&2
      exit 1
    fi
    if [[ "\${#candidates[@]}" -eq 1 ]]; then
      TEMPORAL_BIN="\${candidates[0]}"
    fi
  fi
fi
if [[ ! -x "$TEMPORAL_BIN" ]]; then
  printf 'Packaged Temporal CLI archive did not contain an executable temporal binary: %s\\n' "$ARCHIVE" >&2
  exit 1
fi
exec "$TEMPORAL_BIN" "$@"
`, 'utf8');
  fs.chmodSync(targetPath, 0o755);
}

function temporalCoreBridgeReleasesRoot(nodeModulesRoot) {
  return path.join(nodeModulesRoot, '@temporalio', 'core-bridge', 'releases');
}

function listTemporalCoreBridgeReleases(nodeModulesRoot) {
  const releasesRoot = temporalCoreBridgeReleasesRoot(nodeModulesRoot);
  if (!fs.existsSync(releasesRoot)) {
    return [];
  }
  return fs.readdirSync(releasesRoot)
    .filter((entry) => fs.statSync(path.join(releasesRoot, entry)).isDirectory())
    .sort();
}

export function pruneTemporalCoreBridgeReleases(nodeModulesRoot) {
  const releasesRoot = temporalCoreBridgeReleasesRoot(nodeModulesRoot);
  if (!fs.existsSync(releasesRoot)) {
    return;
  }
  for (const releaseName of fs.readdirSync(releasesRoot)) {
    if (releaseName === MACOS_ARM64_TEMPORAL_CORE_BRIDGE_TARGET) {
      continue;
    }
    fs.rmSync(path.join(releasesRoot, releaseName), { recursive: true, force: true });
  }
}

export function assertTemporalCoreBridgeMacosArm64Only(nodeModulesRoot) {
  const releasesRoot = temporalCoreBridgeReleasesRoot(nodeModulesRoot);
  const releases = listTemporalCoreBridgeReleases(nodeModulesRoot);
  if (!releases.includes(MACOS_ARM64_TEMPORAL_CORE_BRIDGE_TARGET)) {
    throw new Error(`Full runtime Temporal core-bridge is missing ${MACOS_ARM64_TEMPORAL_CORE_BRIDGE_TARGET}.`);
  }
  if (releases.length !== 1) {
    throw new Error(`Full runtime Temporal core-bridge must include only ${MACOS_ARM64_TEMPORAL_CORE_BRIDGE_TARGET}; found ${releases.join(', ')}.`);
  }
  const nativeModule = path.join(releasesRoot, MACOS_ARM64_TEMPORAL_CORE_BRIDGE_TARGET, 'index.node');
  if (!fs.existsSync(nativeModule)) {
    throw new Error(`Full runtime Temporal core-bridge native module missing: ${nativeModule}`);
  }
}

function countRuntimeModuleVenvDirectories(runtimeRoot) {
  const modulesRoot = path.join(runtimeRoot, 'modules');
  if (!fs.existsSync(modulesRoot)) {
    return 0;
  }
  let count = 0;
  for (const moduleName of fs.readdirSync(modulesRoot)) {
    if (fs.existsSync(path.join(modulesRoot, moduleName, '.venv'))) {
      count += 1;
    }
  }
  return count;
}

function runtimePayloadStatus(runtimeRoot, relativePath, options = {}) {
  const absolutePath = path.join(runtimeRoot, ...relativePath.split('/'));
  const exists = fs.existsSync(absolutePath);
  const stat = exists ? fs.statSync(absolutePath) : null;
  const executable = stat?.isFile()
    ? Boolean(stat.mode & 0o111)
    : false;
  return {
    path: relativePath,
    exists,
    ...(options.executable ? { executable } : {}),
    ...(stat?.isFile() ? { size_bytes: stat.size } : {}),
  };
}

function publicExportTarget(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value.import ?? value.node ?? value.default;
}

function normalizeRequiredRuntimePath(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Full runtime required built export ${label} must be a non-empty string.`);
  }
  const normalized = path.posix.normalize(value).replace(/^\.\//, '');
  if (
    normalized === ''
    || normalized === '.'
    || normalized === '..'
    || normalized.startsWith('../')
    || path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`Full runtime required built export ${label} is unsafe: ${value}`);
  }
  return normalized;
}

function normalizePublicExportKey(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Full runtime required built export export_key must be a non-empty string.');
  }
  const normalized = path.posix.normalize(value).replace(/^\.\//, '');
  if (
    normalized === ''
    || normalized.includes('..')
    || path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`Full runtime required built export export_key is unsafe: ${value}`);
  }
  return `./${normalized}`;
}

function requiredBuiltExportPayloadStatuses(runtimeRoot, { strict = false } = {}) {
  const declarations = FULL_RUNTIME_PRUNE_POLICY.required_built_exports ?? [];
  if (!Array.isArray(declarations)) {
    throw new Error('Full runtime prune policy required_built_exports must be an array.');
  }

  return declarations.map((declaration) => {
    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
      throw new Error('Full runtime required built export declaration must be an object.');
    }
    const packageRoot = normalizeRequiredRuntimePath(declaration.package_root, 'package_root');
    const packageJson = normalizeRequiredRuntimePath(declaration.package_json, 'package_json');
    const exportKey = normalizePublicExportKey(declaration.export_key);
    const runtimePath = normalizeRequiredRuntimePath(declaration.runtime_path, 'runtime_path');
    if (!packageJson.startsWith(`${packageRoot}/`)) {
      throw new Error(`Full runtime required built export package_json escapes package_root: ${packageJson}`);
    }
    if (!runtimePath.startsWith(`${packageRoot}/`)) {
      throw new Error(`Full runtime required built export runtime_path escapes package_root: ${runtimePath}`);
    }

    const packageJsonPath = path.join(runtimeRoot, ...packageJson.split('/'));
    if (!fs.existsSync(packageJsonPath)) {
      if (strict) {
        throw new Error(`Full runtime required built export package metadata is missing: ${packageJson}`);
      }
      return {
        ...runtimePayloadStatus(runtimeRoot, runtimePath),
        role: declaration.role ?? null,
        export_key: exportKey,
        package_json: packageJson,
      };
    }
    const packageManifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const exportValue = packageManifest.exports?.[exportKey];
    const target = publicExportTarget(exportValue);
    if (typeof target !== 'string' || target.trim() === '') {
      throw new Error(`Full runtime required built export is missing from ${packageJson} at ${exportKey}.`);
    }
    const normalizedTarget = normalizeRequiredRuntimePath(target, `${packageJson} ${exportKey}`);
    const resolvedRuntimePath = path.posix.join(packageRoot, normalizedTarget);
    if (resolvedRuntimePath !== runtimePath) {
      throw new Error(
        `Full runtime required built export target drifted: ${packageJson} ${exportKey} resolves to `
          + `${resolvedRuntimePath}, expected ${runtimePath}.`,
      );
    }
    const status = runtimePayloadStatus(runtimeRoot, runtimePath);
    if (!status.exists) {
      throw new Error(`Full runtime required built export payload is missing: ${runtimePath}`);
    }
    if (strict) {
      // An entry file alone is insufficient: Node must resolve its complete
      // dependency graph from the packaged tree, without the source checkout.
      const probe = spawnSync(process.execPath, [
        '--input-type=module', '--eval', 'await import(process.argv[1]);',
        pathToFileURL(path.join(runtimeRoot, ...runtimePath.split('/'))).href,
      ], { cwd: path.join(runtimeRoot, packageRoot), encoding: 'utf8', timeout: 30_000 });
      if (probe.status !== 0 || probe.error) {
        throw new Error(`Full runtime required built export cannot load: ${runtimePath}\n`
          + (probe.error?.message ?? probe.stderr ?? probe.stdout));
      }
    }
    return {
      ...status,
      role: declaration.role ?? null,
      export_key: exportKey,
      package_json: packageJson,
    };
  });
}

const FULL_RUNTIME_DOMAIN_PLUGIN_PAYLOADS = [
  { modulePath: 'modules/mas', pluginId: 'med-autoscience', skillId: 'med-autoscience' },
  { modulePath: 'modules/mag', pluginId: 'med-autogrant', skillId: 'med-autogrant' },
  { modulePath: 'modules/rca', pluginId: 'redcube-ai', skillId: 'redcube-ai' },
];

function domainPluginPayloadStatuses(runtimeRoot) {
  return FULL_RUNTIME_DOMAIN_PLUGIN_PAYLOADS.flatMap(({ modulePath, pluginId, skillId }) => [
    runtimePayloadStatus(runtimeRoot, `${modulePath}/plugins/${pluginId}/.codex-plugin/plugin.json`),
    runtimePayloadStatus(runtimeRoot, `${modulePath}/plugins/${pluginId}/skills/${skillId}/SKILL.md`),
  ]);
}

function oplFlowPluginPayloadStatuses(runtimeRoot) {
  const modulePath = 'modules/opl-flow';
  const manifestPath = `${modulePath}/.codex-plugin/plugin.json`;
  const manifestStatus = runtimePayloadStatus(runtimeRoot, manifestPath);
  if (!manifestStatus.exists) return [manifestStatus];

  const manifest = JSON.parse(fs.readFileSync(path.join(runtimeRoot, ...manifestPath.split('/')), 'utf8'));
  const declaredSkillRoots = Array.isArray(manifest.skills) ? manifest.skills : [manifest.skills];
  if (declaredSkillRoots.length === 0 || declaredSkillRoots.some((value) => typeof value !== 'string')) {
    throw new Error('Full runtime OPL Flow plugin manifest must declare a relative skills path.');
  }

  const payloads = [manifestStatus];
  for (const declaredRoot of declaredSkillRoots) {
    const normalizedRoot = path.posix.normalize(declaredRoot).replace(/^\.\//, '').replace(/\/$/, '');
    if (
      normalizedRoot === ''
      || normalizedRoot === '..'
      || normalizedRoot.startsWith('../')
      || path.posix.isAbsolute(normalizedRoot)
    ) {
      throw new Error(`Full runtime OPL Flow plugin manifest declares an unsafe skills path: ${declaredRoot}`);
    }
    const skillRoot = `${modulePath}/${normalizedRoot}`;
    payloads.push(runtimePayloadStatus(runtimeRoot, skillRoot));
    const skillEntryPoints = listRuntimeRelativePaths(runtimeRoot)
      .filter((relativePath) => relativePath.startsWith(`${skillRoot}/`) && relativePath.endsWith('/SKILL.md'))
      .sort();
    if (skillEntryPoints.length === 0) {
      throw new Error(`Full runtime OPL Flow declared skill root contains no SKILL.md: ${skillRoot}`);
    }
    payloads.push(...skillEntryPoints.map((relativePath) => runtimePayloadStatus(runtimeRoot, relativePath)));
  }
  return payloads;
}

function masScholarSkillsPayloadStatuses(runtimeRoot) {
  const modulePath = 'modules/mas-scholar-skills';
  const pluginManifestPath = `${modulePath}/.codex-plugin/plugin.json`;
  const capabilityManifestPath = `${modulePath}/contracts/opl_capability_package_manifest.json`;
  const payloads = [
    runtimePayloadStatus(runtimeRoot, pluginManifestPath),
    runtimePayloadStatus(runtimeRoot, capabilityManifestPath),
  ];
  if (!payloads.every((entry) => entry.exists)) {
    return payloads;
  }

  const pluginManifest = JSON.parse(
    fs.readFileSync(path.join(runtimeRoot, ...pluginManifestPath.split('/')), 'utf8'),
  );
  if (pluginManifest.name !== 'mas-scholar-skills') {
    throw new Error(`Full runtime MAS Scholar Skills plugin identity drifted: ${String(pluginManifest.name)}.`);
  }
  const declaredSkillRoots = Array.isArray(pluginManifest.skills)
    ? pluginManifest.skills
    : [pluginManifest.skills];
  if (declaredSkillRoots.length === 0 || declaredSkillRoots.some((value) => typeof value !== 'string')) {
    throw new Error('Full runtime MAS Scholar Skills plugin manifest must declare a relative skills path.');
  }

  const capabilityManifest = JSON.parse(
    fs.readFileSync(path.join(runtimeRoot, ...capabilityManifestPath.split('/')), 'utf8'),
  );
  if (capabilityManifest.package_id !== 'mas-scholar-skills') {
    throw new Error(
      `Full runtime MAS Scholar Skills capability manifest identity drifted: ${String(capabilityManifest.package_id)}.`,
    );
  }
  const contentLockPaths = capabilityManifest.content_lock?.paths;
  if (!Array.isArray(contentLockPaths) || contentLockPaths.length === 0) {
    throw new Error('Full runtime MAS Scholar Skills capability manifest declares no content_lock paths.');
  }

  const normalizedContentPaths = contentLockPaths.map((relativePath) => {
    if (typeof relativePath !== 'string') {
      throw new Error('Full runtime MAS Scholar Skills content_lock path must be a string.');
    }
    const normalized = path.posix.normalize(relativePath).replace(/^\.\//, '');
    if (
      normalized === ''
      || normalized === '.'
      || normalized === '..'
      || normalized.startsWith('../')
      || path.posix.isAbsolute(normalized)
    ) {
      throw new Error(`Full runtime MAS Scholar Skills content_lock path is unsafe: ${relativePath}`);
    }
    return normalized;
  });
  if (new Set(normalizedContentPaths).size !== normalizedContentPaths.length) {
    throw new Error('Full runtime MAS Scholar Skills content_lock contains duplicate paths.');
  }

  for (const declaredRoot of declaredSkillRoots) {
    const normalizedRoot = path.posix.normalize(declaredRoot).replace(/^\.\//, '').replace(/\/$/, '');
    if (
      normalizedRoot === ''
      || normalizedRoot === '..'
      || normalizedRoot.startsWith('../')
      || path.posix.isAbsolute(normalizedRoot)
    ) {
      throw new Error(`Full runtime MAS Scholar Skills plugin manifest declares an unsafe skills path: ${declaredRoot}`);
    }
    const skillPrefix = `${normalizedRoot}/`;
    if (!normalizedContentPaths.some((relativePath) => (
      relativePath.startsWith(skillPrefix) && relativePath.endsWith('/SKILL.md')
    ))) {
      throw new Error(
        `Full runtime MAS Scholar Skills content_lock contains no SKILL.md under declared root: ${normalizedRoot}`,
      );
    }
  }

  payloads.push(...normalizedContentPaths.map((relativePath) => (
    runtimePayloadStatus(runtimeRoot, `${modulePath}/${relativePath}`)
  )));
  return [...new Map(payloads.map((entry) => [entry.path, entry])).values()];
}

function listRuntimeRelativePaths(runtimeRoot) {
  if (!fs.existsSync(runtimeRoot)) return [];
  const paths = [];
  const stack = [''];
  while (stack.length > 0) {
    const relativePath = stack.pop();
    const absolutePath = relativePath ? path.join(runtimeRoot, ...relativePath.split('/')) : runtimeRoot;
    const stat = fs.lstatSync(absolutePath);
    if (!relativePath) {
      for (const entry of fs.readdirSync(absolutePath)) stack.push(entry);
      continue;
    }
    paths.push(relativePath);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolutePath)) {
        stack.push(path.posix.join(relativePath, entry));
      }
    }
  }
  return paths;
}

function runtimePathPattern(relativePath) {
  const escaped = relativePath
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]+');
  return new RegExp(`^${escaped}(?:/|$)`);
}

function declaredPrunedPathAssertions(runtimeRoot) {
  const runtimePaths = listRuntimeRelativePaths(runtimeRoot);
  const expectedAbsent = FULL_RUNTIME_PRUNE_POLICY.runtime_assertions?.expected_absent_paths ?? [];
  const pathExists = (relativePath) => fs.existsSync(path.join(runtimeRoot, ...relativePath.split('/')));
  return expectedAbsent.map((relativePath) => ({
    path: relativePath,
    expected: 'absent',
    ...(relativePath.includes('*')
      ? { match_count: runtimePaths.filter((runtimePath) => runtimePathPattern(relativePath).test(runtimePath)).length }
      : { present: pathExists(relativePath) }),
  }));
}

function declaredAuthorityFunctionPayloadStatuses(runtimeRoot) {
  const modulesRoot = path.join(runtimeRoot, 'modules');
  if (!fs.existsSync(modulesRoot)) return [];

  return fs.readdirSync(modulesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const contractPath = path.join(modulesRoot, entry.name, 'contracts', 'pack_compiler_input.json');
      if (!fs.existsSync(contractPath)) return [];

      const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
      const sourceRefs = contract.source_refs;
      if (
        !sourceRefs
        || typeof sourceRefs !== 'object'
        || !Object.prototype.hasOwnProperty.call(sourceRefs, 'authority_functions_source_ref')
      ) {
        return [];
      }

      const declaredRef = sourceRefs.authority_functions_source_ref;
      if (typeof declaredRef !== 'string' || declaredRef.trim() === '') {
        throw new Error(
          `Full runtime ${entry.name} pack compiler authority_functions_source_ref must be a non-empty string.`,
        );
      }
      const normalizedRef = path.posix.normalize(declaredRef).replace(/^\.\//, '');
      if (
        normalizedRef === ''
        || normalizedRef === '.'
        || normalizedRef === '..'
        || normalizedRef.startsWith('../')
        || path.posix.isAbsolute(normalizedRef)
      ) {
        throw new Error(
          `Full runtime ${entry.name} pack compiler authority_functions_source_ref is unsafe: ${declaredRef}`,
        );
      }

      const relativePath = `modules/${entry.name}/${normalizedRef}`;
      const absolutePath = path.join(runtimeRoot, ...relativePath.split('/'));
      if (fs.existsSync(absolutePath) && !fs.statSync(absolutePath).isFile()) {
        throw new Error(`Full runtime declared authority function inventory is not a file: ${relativePath}`);
      }
      return [runtimePayloadStatus(runtimeRoot, relativePath)];
    });
}

export function collectRuntimeAssertions(runtimeRoot) {
  const resolvedSelectedBundle = readMaterializedResolvedSelectedBundleDescriptor(runtimeRoot);
  const flowCapabilityAssembly = assertMaterializedFlowCapabilityBuildLock(runtimeRoot);
  return {
    prune_policy_id: FULL_RUNTIME_PRUNE_POLICY.id,
    prune_policy_hash: buildFullRuntimePrunePolicyHash(),
    temporal_core_bridge_releases: listTemporalCoreBridgeReleases(path.join(runtimeRoot, 'opl', 'node_modules')),
    excluded_module_venv_count: countRuntimeModuleVenvDirectories(runtimeRoot),
    packaged_global_node_packages: fs.existsSync(path.join(runtimeRoot, 'node', 'lib', 'node_modules'))
      ? fs.readdirSync(path.join(runtimeRoot, 'node', 'lib', 'node_modules')).sort()
      : [],
    offline_required_payloads: [
      runtimePayloadStatus(runtimeRoot, 'bin/temporal', { executable: true }),
      runtimePayloadStatus(runtimeRoot, 'vendor/temporal/temporal_cli_darwin_arm64.tar.gz'),
      runtimePayloadStatus(runtimeRoot, 'opl/node_modules/@swc/core-darwin-arm64/swc.darwin-arm64.node'),
      runtimePayloadStatus(runtimeRoot, 'node/bin/node', { executable: true }),
      runtimePayloadStatus(runtimeRoot, 'node/bin/npm', { executable: true }),
      runtimePayloadStatus(runtimeRoot, 'node/bin/npx', { executable: true }),
      runtimePayloadStatus(runtimeRoot, 'uv/bin/uv', { executable: true }),
      ...requiredBuiltExportPayloadStatuses(runtimeRoot),
      runtimePayloadStatus(runtimeRoot, FLOW_CAPABILITY_BUILD_LOCK_RELATIVE_PATH),
      ...flowCapabilityAssembly.items.map((item) => (
        runtimePayloadStatus(runtimeRoot, item.runtime_relative_path, { executable: true })
      )),
      ...declaredAuthorityFunctionPayloadStatuses(runtimeRoot),
      runtimePayloadStatus(runtimeRoot, 'modules/opl-flow/contracts/workflow-policy.json'),
      runtimePayloadStatus(runtimeRoot, 'modules/opl-flow/templates/AGENTS.md'),
      ...masScholarSkillsPayloadStatuses(runtimeRoot),
      ...oplFlowPluginPayloadStatuses(runtimeRoot),
      ...domainPluginPayloadStatuses(runtimeRoot),
      ...(resolvedSelectedBundle?.payloads ?? []),
    ],
    resolved_selected_bundle_descriptor: resolvedSelectedBundle?.assertion ?? {
      status: 'not_provided',
    },
    flow_capability_assembly: flowCapabilityAssembly,
    declared_pruned_paths: declaredPrunedPathAssertions(runtimeRoot),
  };
}

function writePackagedModuleMarker(moduleRoot, marker) {
  fs.writeFileSync(path.join(moduleRoot, PACKAGED_MODULE_MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
}

export function buildToolchainLayer(layerRoot, sources, flowCapabilityBuildLock) {
  if (sources.bunBin) {
    copySingleFile(sources.bunBin, path.join(layerRoot, 'bin', 'bun'));
  }
  copySingleFile(sources.temporalCliArchive, path.join(layerRoot, 'vendor', 'temporal', 'temporal_cli_darwin_arm64.tar.gz'));
  writeTemporalCliWrapper(path.join(layerRoot, 'bin', 'temporal'), commandOutput(sources.temporalCliBin, ['--version']));
  materializeFlowCapabilityBuildLock(layerRoot, sources, flowCapabilityBuildLock);
  copyNodeRuntimePayload(path.dirname(path.dirname(sources.nodeToolchain.nodeBin)), path.join(layerRoot, 'node'), sources.nodeToolchain.npmRoot);
  copySingleFile(sources.uvBin, path.join(layerRoot, 'uv', 'bin', 'uv'));
  copyTreeFiltered(
    sources.pythonRoot,
    path.join(layerRoot, 'python', path.basename(sources.pythonRoot)),
    `python/${path.basename(sources.pythonRoot)}`,
  );
  writeRuntimeWrappers(layerRoot);
}

export function buildDomainLayer(layerRoot, options) {
  copyCatalogPackageSeed(options.macMediaAssetsRoot, path.join(layerRoot, 'modules', 'mac-media-assets'));
  copyTreeFiltered(options.macRoot, path.join(layerRoot, 'modules', 'med-autocast'), 'modules/med-autocast');
  copyTreeFiltered(options.masRoot, path.join(layerRoot, 'modules', 'mas'), 'modules/mas');
  copyTreeFiltered(
    options.masScholarSkillsRoot,
    path.join(layerRoot, 'modules', 'mas-scholar-skills'),
    'modules/mas-scholar-skills',
  );
  copyTreeFiltered(options.magRoot, path.join(layerRoot, 'modules', 'mag'), 'modules/mag');
  copyTreeFiltered(options.rcaRoot, path.join(layerRoot, 'modules', 'rca'), 'modules/rca');
  copyTreeFiltered(options.metaAgentRoot, path.join(layerRoot, 'modules', 'meta-agent'), 'modules/meta-agent');
  copyTreeFiltered(options.bookforgeRoot, path.join(layerRoot, 'modules', 'bookforge'), 'modules/bookforge');
  copyTreeFiltered(options.oplFlowRoot, path.join(layerRoot, 'modules', 'opl-flow'), 'modules/opl-flow');
  materializeSelectedLocalComponentSeeds(layerRoot, options);
}

export function writeDomainMarkers(runtimeRoot, options, packagedAt) {
  if (fs.existsSync(path.join(runtimeRoot, 'modules', 'mac-media-assets', 'opl-package.json'))) {
    writePackagedModuleMarker(path.join(runtimeRoot, 'modules', 'mac-media-assets'), buildPackagedModuleMarker({
      moduleId: 'mac-media-assets', repoName: 'mac-media-assets', sourcePath: options.macMediaAssetsRoot,
      headSha: readGitHead(options.macMediaAssetsRoot), packagedAt,
    }));
  }
  for (const [repoName, sourcePath] of [['med-autocast', options.macRoot]]) {
    writePackagedModuleMarker(path.join(runtimeRoot, 'modules', repoName), buildPackagedModuleMarker({
      moduleId: repoName, repoName, sourcePath, headSha: readGitHead(sourcePath), packagedAt,
    }));
  }
  writePackagedModuleMarker(path.join(runtimeRoot, 'modules', 'mas'), buildPackagedModuleMarker({
    moduleId: 'medautoscience',
    repoName: 'med-autoscience',
    sourcePath: options.masRoot,
    headSha: readGitHead(options.masRoot),
    packagedAt,
  }));
  writePackagedModuleMarker(path.join(runtimeRoot, 'modules', 'mag'), buildPackagedModuleMarker({
    moduleId: 'medautogrant',
    repoName: 'med-autogrant',
    sourcePath: options.magRoot,
    headSha: readGitHead(options.magRoot),
    packagedAt,
  }));
  writePackagedModuleMarker(path.join(runtimeRoot, 'modules', 'rca'), buildPackagedModuleMarker({
    moduleId: 'redcube',
    repoName: 'redcube-ai',
    sourcePath: options.rcaRoot,
    headSha: readGitHead(options.rcaRoot),
    packagedAt,
  }));
  writePackagedModuleMarker(path.join(runtimeRoot, 'modules', 'meta-agent'), buildPackagedModuleMarker({
    moduleId: 'oplmetaagent',
    repoName: 'opl-meta-agent',
    sourcePath: options.metaAgentRoot,
    headSha: readGitHead(options.metaAgentRoot),
    packagedAt,
  }));
  writePackagedModuleMarker(path.join(runtimeRoot, 'modules', 'bookforge'), buildPackagedModuleMarker({
    moduleId: 'oplbookforge',
    repoName: 'opl-bookforge',
    sourcePath: options.bookforgeRoot,
    headSha: readGitHead(options.bookforgeRoot),
    packagedAt,
  }));
  writePackagedModuleMarker(path.join(runtimeRoot, 'modules', 'opl-flow'), buildPackagedModuleMarker({
    moduleId: 'oplflow',
    repoName: 'opl-flow',
    sourcePath: options.oplFlowRoot,
    headSha: readGitHead(options.oplFlowRoot),
    packagedAt,
  }));
}

function repoBaseName(sourceRepo: unknown) {
  if (typeof sourceRepo !== 'string' || !sourceRepo.trim()) return null;
  try {
    return path.posix.basename(new URL(sourceRepo).pathname.replace(/\/$/, '').replace(/\.git$/, ''));
  } catch {
    return null;
  }
}

export function assertPackagedCatalogSeedPayloadsComplete(runtimeRoot: string) {
  const catalogSeedRoot = path.join(runtimeRoot, 'opl', 'catalog-seed');
  const catalogIndexPath = path.join(catalogSeedRoot, 'catalog-index.json');
  const modulesRoot = path.join(runtimeRoot, 'modules');
  if (!fs.existsSync(catalogIndexPath) || !fs.existsSync(modulesRoot)) {
    return { checked_packages: 0, checked_files: 0 };
  }
  const index = JSON.parse(fs.readFileSync(catalogIndexPath, 'utf8'));
  const markersByRepo = new Map<string, { moduleDir: string; commit: string }>();
  for (const entry of fs.readdirSync(modulesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const moduleDir = path.join(modulesRoot, entry.name);
    const markerPath = path.join(moduleDir, PACKAGED_MODULE_MARKER_FILE);
    if (!fs.existsSync(markerPath)) continue;
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    if (marker?.packaged_runtime === true && typeof marker.repo_name === 'string' && typeof marker.source_git?.head_sha === 'string') {
      markersByRepo.set(marker.repo_name, { moduleDir, commit: marker.source_git.head_sha });
    }
  }
  let checkedPackages = 0;
  let checkedFiles = 0;
  const failures: string[] = [];
  for (const pkg of index.packages ?? []) {
    if (typeof pkg.manifest_path !== 'string') continue;
    const ownerPath = path.join(catalogSeedRoot, pkg.manifest_path);
    if (!fs.existsSync(ownerPath)) continue;
    const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
    const repoName = repoBaseName(owner.source_repo);
    if (!repoName) continue;
    const marker = markersByRepo.get(repoName);
    if (!marker) continue;
    const payloadRel = pkg.payload_manifest_path ?? pkg.payload_path ?? `packages/payloads/${pkg.package_id}-${owner.version}.json`;
    const payloadPath = path.join(catalogSeedRoot, payloadRel);
    if (!fs.existsSync(payloadPath)) continue;
    const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    if (payload.source_commit !== marker.commit) continue;
    checkedPackages += 1;
    const expectedPrefix = `${new URL(String(owner.source_repo)).pathname.replace(/\/$/, '').replace(/\.git$/, '')}/${marker.commit}/`;
    const missing: string[] = [];
    for (const file of payload.files ?? []) {
      checkedFiles += 1;
      try {
        const parsed = new URL(String(file.source_url));
        if (parsed.protocol !== 'https:' || parsed.hostname !== 'raw.githubusercontent.com' || !parsed.pathname.startsWith(expectedPrefix)) {
          missing.push(`${String(file.path ?? file.source_url)} (invalid source_url)`);
          continue;
        }
        const relativePath = decodeURIComponent(parsed.pathname.slice(expectedPrefix.length));
        const resolvedModule = fs.realpathSync(marker.moduleDir);
        const resolvedTarget = path.resolve(resolvedModule, relativePath);
        if (!resolvedTarget.startsWith(`${resolvedModule}${path.sep}`) || !fs.existsSync(resolvedTarget)) {
          missing.push(relativePath);
        }
      } catch {
        missing.push(String(file.path ?? file.source_url));
      }
    }
    if (missing.length > 0) {
      failures.push(`${pkg.package_id} (${missing.length} missing): ${missing.slice(0, 10).join(', ')}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Packaged Full modules are missing catalog payload files:\n  - ${failures.join('\n  - ')}`);
  }
  return { checked_packages: checkedPackages, checked_files: checkedFiles };
}

export function buildOplLayer(layerRoot, options) {
  const targetRoot = path.join(layerRoot, 'opl');
  copyTreeFiltered(options.frameworkRoot, targetRoot, 'opl');
  if (options.catalogIndexPath) stageOfficialSoftwareCatalog(options.catalogIndexPath, path.join(targetRoot, 'catalog-seed'));
  copyProductionNodeModules(options.frameworkRoot, targetRoot);
  removePackagedSourceExportConditions(path.join(targetRoot, 'node_modules'));
  pruneTemporalCoreBridgeReleases(path.join(targetRoot, 'node_modules'));
  requiredBuiltExportPayloadStatuses(layerRoot, { strict: true });
}

function removeOplSourceCondition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'opl-source')
      .map(([key, child]) => [key, removeOplSourceCondition(child)]),
  );
}

export function removePackagedSourceExportConditions(nodeModulesRoot) {
  if (!fs.existsSync(nodeModulesRoot)) return [];
  const rewritten = [];
  for (const relativePackageJsonPath of fs.globSync('**/package.json', { cwd: nodeModulesRoot })) {
    const packageJsonPath = path.join(nodeModulesRoot, relativePackageJsonPath);
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (!JSON.stringify(packageJson.exports ?? {}).includes('"opl-source"')) continue;
    packageJson.exports = removeOplSourceCondition(packageJson.exports);
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
    rewritten.push(path.relative(nodeModulesRoot, packageJsonPath).split(path.sep).join('/'));
  }
  return rewritten.sort();
}

export function buildSkillsLayer(layerRoot, options, resolvedSelectedBundleDescriptor: unknown = null) {
  if (resolvedSelectedBundleDescriptor) {
    fs.mkdirSync(path.join(layerRoot, 'skills'), { recursive: true });
    materializeResolvedSelectedBundleDescriptor(layerRoot, resolvedSelectedBundleDescriptor);
    return;
  }
  fs.mkdirSync(path.join(layerRoot, 'skills'), { recursive: true });
}

export function buildRuntimeLayerImplementationHash(layerId: FullRuntimeCacheLayerId) {
  type LayerImplementation = (...args: any[]) => unknown;
  const functions: Record<FullRuntimeCacheLayerId, LayerImplementation[]> = {
    toolchain: [
      shellSingleQuote,
      writeTemporalCliWrapper,
      copySingleFile,
      copyNodeRuntimePayload,
      copyTreeFiltered,
      writeRuntimeWrappers,
      buildToolchainLayer,
    ],
    'domain-runtime': [
      copyTreeFiltered,
      catalogPackageSeed,
      copyCatalogPackageSeed,
      materializeSelectedLocalComponentSeeds,
      buildDomainLayer,
    ],
    'opl-runtime': [
      temporalCoreBridgeReleasesRoot,
      pruneTemporalCoreBridgeReleases,
      copyTreeFiltered,
      copyProductionNodeModules,
      publicExportTarget,
      normalizeRequiredRuntimePath,
      normalizePublicExportKey,
      requiredBuiltExportPayloadStatuses,
      removeOplSourceCondition,
      removePackagedSourceExportConditions,
      stageOfficialSoftwareCatalog,
      buildOplLayer,
    ],
    skills: [materializeResolvedSelectedBundleDescriptor, buildSkillsLayer],
  };
  return crypto.createHash('sha256')
    .update(functions[layerId].map((fn) => fn.toString()).join('\n\n'))
    .digest('hex');
}
