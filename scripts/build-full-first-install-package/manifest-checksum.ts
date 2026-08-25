import fs from 'node:fs';
import path from 'node:path';

import {
  buildFullPackageManifest,
  FULL_RUNTIME_CACHE_LAYER_TAXONOMY,
  FULL_RUNTIME_FORBIDDEN_FRAMEWORK_CODEX_PATHS,
} from '../full-first-install-package.ts';
import { directorySizeBytes } from './filesystem.ts';
import { readGitHead, readGitOriginUrl } from './git.ts';
import { existingFileSha256, packageJsonVersion } from './hashing.ts';
import { run } from './process.ts';
import { collectRuntimeAssertions } from './runtime-layers.ts';
import { resolveFullCarrierProfile } from './carrier-profile.ts';

const MAS_PACKAGE_ID = 'mas';
const MAS_SCHOLAR_SKILLS_PACKAGE_ID = 'mas-scholar-skills';
const MAS_SCHOLAR_SKILLS_RUNTIME_MODULE_PATH = 'modules/mas-scholar-skills';
const MAS_SOURCE_MANIFEST_REF = 'contracts/opl_agent_package_manifest.json';
const MAS_SCHOLAR_SKILLS_SOURCE_MANIFEST_REF = 'contracts/opl_capability_package_manifest.json';

function objectValue(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Full runtime ${label} must be an object.`);
  }
  return value;
}

function stringValue(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Full runtime ${label} must be a non-empty string.`);
  }
  return value;
}

function assertMasScholarSkillsConsumer(manifest, label) {
  const primaryConsumer = objectValue(
    manifest.primary_consumer,
    `${label} primary_consumer`,
  );
  for (const [field, expected] of [
    ['agent_id', MAS_PACKAGE_ID],
    ['package_id', MAS_PACKAGE_ID],
    ['dependency_kind', 'hard_runtime_dependency'],
    ['required', true],
  ]) {
    if (primaryConsumer[field] !== expected) {
      throw new Error(
        `Full runtime ${label} primary_consumer.${field} drifted: expected ${String(expected)}, found ${String(primaryConsumer[field])}.`,
      );
    }
  }
  const consumerPolicy = objectValue(
    manifest.consumer_policy,
    `${label} consumer_policy`,
  );
  if (
    JSON.stringify(consumerPolicy.supported_required_by) !== JSON.stringify([MAS_PACKAGE_ID])
    || consumerPolicy.non_primary_runtime_dependency_supported !== false
  ) {
    throw new Error(
      `Full runtime ${label} consumer policy must keep MAS as the sole supported runtime dependency owner.`,
    );
  }
  return primaryConsumer;
}

function safeRelativePath(value, label) {
  const relativePath = stringValue(value, label);
  const normalized = path.posix.normalize(relativePath).replace(/^\.\//, '');
  if (
    normalized === ''
    || normalized === '.'
    || normalized === '..'
    || normalized.startsWith('../')
    || path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`Full runtime ${label} is unsafe: ${relativePath}`);
  }
  return normalized;
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`Full runtime ${label} is missing: ${filePath}`);
  }
  return filePath;
}

function sha256RefForFile(filePath, label) {
  const checksum = existingFileSha256(requireFile(filePath, label));
  if (!checksum) {
    throw new Error(`Full runtime ${label} checksum could not be read: ${filePath}`);
  }
  return `sha256:${checksum}`;
}

function assertFileChecksum(filePath, expectedChecksum, label) {
  const expected = stringValue(expectedChecksum, `${label} expected checksum`);
  const actual = sha256RefForFile(filePath, label);
  if (actual !== expected) {
    throw new Error(
      `Full runtime ${label} checksum drifted: expected ${expected}, found ${actual} at ${filePath}.`,
    );
  }
  return actual;
}

function readJsonFile(filePath, label) {
  try {
    return objectValue(JSON.parse(fs.readFileSync(filePath, 'utf8')), label);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Full runtime ${label} is not valid JSON: ${filePath}`);
    }
    throw error;
  }
}

function resolveRequestedGitCommit(sourceRoot, requestedRef, label) {
  const ref = stringValue(requestedRef, `${label} requested ref`);
  const result = run('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
    cwd: sourceRoot,
    capture: true,
  });
  const resolvedCommit = result.stdout.trim();
  if (!/^[0-9a-f]{40}$/i.test(resolvedCommit)) {
    throw new Error(`Full runtime ${label} ref ${ref} did not resolve to a commit.`);
  }
  return resolvedCommit;
}

export function resolveMasScholarSkillsFullRuntimeSource(options) {
  const sourceRoot = options.masScholarSkillsRoot;
  if (!sourceRoot || !fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    throw new Error(`Full runtime MAS Scholar Skills root is missing: ${sourceRoot || '<unset>'}`);
  }
  const sourceCommit = readGitHead(sourceRoot);
  if (!sourceCommit) {
    throw new Error(`Full runtime MAS Scholar Skills root has no readable git HEAD: ${sourceRoot}`);
  }
  const requestedRefCommit = resolveRequestedGitCommit(
    sourceRoot,
    options.masScholarSkillsRef,
    'MAS Scholar Skills',
  );
  if (requestedRefCommit !== sourceCommit) {
    throw new Error(
      `Full runtime MAS Scholar Skills checkout HEAD ${sourceCommit} does not match requested ref ${options.masScholarSkillsRef} (${requestedRefCommit}).`,
    );
  }

  const masManifestPath = requireFile(
    path.join(options.masRoot, ...MAS_SOURCE_MANIFEST_REF.split('/')),
    'MAS owner package manifest',
  );
  const masManifest = readJsonFile(masManifestPath, 'MAS owner package manifest');
  for (const [field, expected] of [
    ['surface_kind', 'opl_agent_package_manifest.v1'],
    ['package_id', MAS_PACKAGE_ID],
  ]) {
    if (masManifest[field] !== expected) {
      throw new Error(
        `Full runtime MAS owner package manifest ${field} drifted: expected ${expected}, found ${String(masManifest[field])}.`,
      );
    }
  }
  if (!Array.isArray(masManifest.capability_dependencies)) {
    throw new Error('Full runtime MAS package manifest declares no capability_dependencies.');
  }
  const masScholarDependencies = masManifest.capability_dependencies.filter(
    (dependency) => dependency?.package_id === MAS_SCHOLAR_SKILLS_PACKAGE_ID,
  );
  const [masScholarDependency] = masScholarDependencies;
  if (
    masScholarDependencies.length !== 1
    || !masScholarDependency
    || typeof masScholarDependency !== 'object'
    || masScholarDependency.required !== true
  ) {
    throw new Error(
      'Full runtime MAS package manifest must require MAS Scholar Skills exactly once.',
    );
  }

  const sourceManifestPath = requireFile(
    path.join(sourceRoot, ...MAS_SCHOLAR_SKILLS_SOURCE_MANIFEST_REF.split('/')),
    'MAS Scholar Skills owner capability manifest',
  );
  const sourceManifest = readJsonFile(sourceManifestPath, 'MAS Scholar Skills owner capability manifest');
  if (sourceManifest.surface_kind !== 'opl_capability_package_manifest.v2') {
    throw new Error(
      `Full runtime MAS Scholar Skills owner manifest surface_kind drifted: ${String(sourceManifest.surface_kind)}.`,
    );
  }
  if (sourceManifest.package_id !== MAS_SCHOLAR_SKILLS_PACKAGE_ID) {
    throw new Error(`Full runtime MAS Scholar Skills owner manifest package_id drifted: ${String(sourceManifest.package_id)}.`);
  }
  const packageVersion = stringValue(sourceManifest.version, 'MAS Scholar Skills owner manifest version');
  if (sourceManifest.package_role !== 'capability_package') {
    throw new Error(
      `Full runtime MAS Scholar Skills owner manifest package_role drifted: ${String(sourceManifest.package_role)}.`,
    );
  }
  const capabilityAbi = objectValue(sourceManifest.capability_abi, 'MAS Scholar Skills capability_abi');
  if (capabilityAbi.id !== masScholarDependency.capability_abi) {
    throw new Error('Full runtime MAS Scholar Skills ABI does not satisfy the MAS owner manifest.');
  }
  const contentLock = objectValue(sourceManifest.content_lock, 'MAS Scholar Skills owner manifest content_lock');
  if (!Array.isArray(contentLock.paths) || contentLock.paths.length === 0) {
    throw new Error('Full runtime MAS Scholar Skills owner content_lock declares no paths.');
  }
  const payloadFiles = contentLock.paths.map((relativePath, index) => {
    const safePath = safeRelativePath(
      relativePath,
      `MAS Scholar Skills owner content_lock.paths[${index}]`,
    );
    const sourcePath = requireFile(
      path.join(sourceRoot, ...safePath.split('/')),
      `MAS Scholar Skills selected source ${safePath}`,
    );
    return { path: safePath, sha256: sha256RefForFile(sourcePath, `MAS Scholar Skills selected source ${safePath}`) };
  });

  return {
    package_id: MAS_SCHOLAR_SKILLS_PACKAGE_ID,
    package_role: sourceManifest.package_role,
    package_version: packageVersion,
    source_path: sourceRoot,
    source_commit: sourceCommit,
    requested_ref: options.masScholarSkillsRef,
    requested_ref_commit: requestedRefCommit,
    owner_source_commit: sourceCommit,
    runtime_module_relative_path: MAS_SCHOLAR_SKILLS_RUNTIME_MODULE_PATH,
    mas_manifest_ref: MAS_SOURCE_MANIFEST_REF,
    mas_manifest_sha256: sha256RefForFile(masManifestPath, 'MAS owner package manifest'),
    source_manifest_ref: MAS_SCHOLAR_SKILLS_SOURCE_MANIFEST_REF,
    source_manifest_sha256: sha256RefForFile(sourceManifestPath, 'MAS Scholar Skills owner capability manifest'),
    content_lock_digest: stringValue(contentLock.digest, 'MAS Scholar Skills owner manifest content_lock.digest'),
    payload_file_count: payloadFiles.length,
    payload_files: payloadFiles,
    checksum_status: 'verified',
    currentness_status: 'current',
    currentness: {
      requested_ref_matches_selected_source: true,
      mas_dependency_edge_matches_owner_manifests: true,
      selected_source_files_verified: true,
    },
  };
}

export function assertMasScholarSkillsRuntimePayload(runtimeRoot, resolution) {
  const moduleRoot = path.join(
    runtimeRoot,
    ...resolution.runtime_module_relative_path.split('/'),
  );
  if (!fs.existsSync(moduleRoot) || !fs.statSync(moduleRoot).isDirectory()) {
    throw new Error(`Full runtime MAS Scholar Skills module root is missing: ${moduleRoot}`);
  }
  assertFileChecksum(
    path.join(moduleRoot, ...resolution.source_manifest_ref.split('/')),
    resolution.source_manifest_sha256,
    'packaged MAS Scholar Skills owner capability manifest',
  );
  for (const payloadFile of resolution.payload_files) {
    assertFileChecksum(
      path.join(moduleRoot, ...payloadFile.path.split('/')),
      payloadFile.sha256,
      `packaged MAS Scholar Skills payload ${payloadFile.path}`,
    );
  }
  return {
    runtime_module_relative_path: resolution.runtime_module_relative_path,
    payload_file_count: resolution.payload_files.length,
    checksum_status: 'verified',
  };
}

export function buildResolvedFullPayloadRefs(options, sources, components, sourceResolutions = {}) {
  const mineruRepoRoot = sources.mineruRepoRoot || options.mineruRoot;
  const masScholarSkills = sourceResolutions.masScholarSkills
    ?? resolveMasScholarSkillsFullRuntimeSource(options);
  const flowCapabilityBuildLock = sourceResolutions.flowCapabilityBuildLock;
  if (!flowCapabilityBuildLock) {
    throw new Error('Full runtime resolved refs require the Framework-generated Flow capability build lock.');
  }
  return {
    opl_framework: {
      label: 'OPL Framework',
      source_path: options.frameworkRoot,
      repository: readGitOriginUrl(options.frameworkRoot) || 'gaofeng21cn/one-person-lab',
      requested_ref: options.frameworkRef || 'main',
      resolved_commit: components.opl?.git_commit ?? readGitHead(options.frameworkRoot),
    },
    opl_runtime_environment_substrate: {
      label: 'OPL Runtime Environment Substrate',
      source_path: path.join(options.frameworkRoot, 'contracts', 'opl-framework', 'runtime-environment-substrate-contract.json'),
      repository: readGitOriginUrl(options.frameworkRoot) || 'gaofeng21cn/one-person-lab',
      requested_ref: options.frameworkRef || 'main',
      resolved_commit: components.opl?.git_commit ?? readGitHead(options.frameworkRoot),
      contract_path: 'contracts/opl-framework/runtime-environment-substrate-contract.json',
      readback_commands: [
        'opl runtime env contract --json',
        'opl runtime env build --domain <domain> --profile <profile> --platform <platform> --json',
        'opl runtime env materialize --domain <domain> --profile <profile> --platform <platform> --dry-run --json',
        'opl runtime env run-context --domain <domain> --profile <profile> --platform <platform> --json',
      ],
    },
    mas: {
      label: 'MAS',
      source_path: options.masRoot,
      repository: readGitOriginUrl(options.masRoot) || 'gaofeng21cn/med-autoscience',
      requested_ref: options.masRef,
      resolved_commit: components.mas?.git_commit ?? readGitHead(options.masRoot),
    },
    mas_scholar_skills: {
      label: 'MAS Scholar Skills',
      source_path: options.masScholarSkillsRoot,
      repository: readGitOriginUrl(options.masScholarSkillsRoot) || 'gaofeng21cn/mas-scholar-skills',
      requested_ref: options.masScholarSkillsRef,
      requested_ref_commit: masScholarSkills.requested_ref_commit,
      resolved_commit: masScholarSkills.source_commit,
      package_role: masScholarSkills.package_role,
      package_version: masScholarSkills.package_version,
      owner_source_commit: masScholarSkills.owner_source_commit,
      runtime_module_relative_path: masScholarSkills.runtime_module_relative_path,
      mas_manifest_ref: masScholarSkills.mas_manifest_ref,
      mas_manifest_sha256: masScholarSkills.mas_manifest_sha256,
      source_manifest_ref: masScholarSkills.source_manifest_ref,
      source_manifest_sha256: masScholarSkills.source_manifest_sha256,
      content_lock_digest: masScholarSkills.content_lock_digest,
      payload_file_count: masScholarSkills.payload_file_count,
      checksum_status: masScholarSkills.checksum_status,
      currentness_status: masScholarSkills.currentness_status,
      currentness: masScholarSkills.currentness,
    },
    mag: {
      label: 'MAG',
      source_path: options.magRoot,
      repository: readGitOriginUrl(options.magRoot) || 'gaofeng21cn/med-autogrant',
      requested_ref: options.magRef,
      resolved_commit: components.mag?.git_commit ?? readGitHead(options.magRoot),
    },
    rca: {
      label: 'RCA',
      source_path: options.rcaRoot,
      repository: readGitOriginUrl(options.rcaRoot) || 'gaofeng21cn/redcube-ai',
      requested_ref: options.rcaRef,
      resolved_commit: components.rca?.git_commit ?? readGitHead(options.rcaRoot),
    },
    opl_meta_agent: {
      label: 'OPL Meta Agent',
      source_path: options.metaAgentRoot,
      repository: readGitOriginUrl(options.metaAgentRoot) || 'gaofeng21cn/opl-meta-agent',
      requested_ref: options.metaAgentRef,
      resolved_commit: components.meta_agent?.git_commit ?? readGitHead(options.metaAgentRoot),
    },
    opl_bookforge: {
      label: 'OPL Book Forge',
      source_path: options.bookforgeRoot,
      repository: readGitOriginUrl(options.bookforgeRoot) || 'gaofeng21cn/opl-bookforge',
      requested_ref: options.bookforgeRef,
      resolved_commit: components.bookforge?.git_commit ?? readGitHead(options.bookforgeRoot),
    },
    opl_flow: {
      label: 'OPL Flow',
      source_path: options.oplFlowRoot,
      repository: readGitOriginUrl(options.oplFlowRoot) || 'gaofeng21cn/opl-flow',
      requested_ref: options.oplFlowRef,
      resolved_commit: components.opl_flow?.git_commit ?? readGitHead(options.oplFlowRoot),
      package_kind: 'workflow_plugin_package',
    },
    flow_capability_build_lock: {
      label: 'OPL Flow capability build lock',
      authority: flowCapabilityBuildLock.authority,
      surface_kind: flowCapabilityBuildLock.surface_kind,
      target: flowCapabilityBuildLock.target,
      lock_digest: flowCapabilityBuildLock.lock_digest,
      flow_package: flowCapabilityBuildLock.flow_package,
      items: flowCapabilityBuildLock.items.map((item) => ({
        capability_ref: item.capability_ref,
        source_ref: item.source_ref,
        source_sha256: item.source_sha256,
        version: item.version,
      })),
    },
    ...(components.officecli
      ? {
          officecli: {
            label: 'OfficeCLI',
            source_path: options.officeCliRoot,
            repository: readGitOriginUrl(options.officeCliRoot) || 'iOfficeAI/OfficeCLI',
            requested_ref: options.officeCliRelease?.requested_ref ?? options.officeCliRef,
            resolved_ref: options.officeCliRelease?.resolved_ref ?? options.officeCliRef,
            resolved_commit: options.officeCliRelease?.resolved_commit ?? readGitHead(options.officeCliRoot),
            latest_stable_verified: options.officeCliRelease?.latest_stable_verified ?? false,
            source_policy: options.officeCliRelease?.policy ?? 'unverified',
            version: components.officecli.version,
          },
        }
      : {}),
    ...(components.mineru_open_api
      ? {
          mineru: {
            label: 'MinerU',
            source_path: mineruRepoRoot,
            repository: 'opendatalab/MinerU-Ecosystem',
            requested_ref: options.mineruRef,
            resolved_commit: readGitHead(mineruRepoRoot),
            version: components.mineru_open_api.version,
          },
        }
      : {}),
  };
}

function directoryChildSizes(root) {
  if (!fs.existsSync(root)) {
    return {};
  }
  return Object.fromEntries(
    fs.readdirSync(root)
      .sort()
      .map((entry) => [
        entry,
        {
          relative_path: entry,
          size_bytes: directorySizeBytes(path.join(root, entry)),
        },
      ]),
  );
}

function sizeBreakdownEntry(runtimeRoot, relativePath, children = undefined) {
  const absolutePath = path.join(runtimeRoot, ...relativePath.split('/').filter(Boolean));
  return {
    relative_path: relativePath,
    size_bytes: directorySizeBytes(absolutePath),
    ...(children ? { children } : {}),
  };
}

function collectFullRuntimeSizeBreakdown(runtimeRoot) {
  return {
    measurement_policy: 'uncompressed_file_bytes_after_full_runtime_pruning',
    total_runtime_uncompressed_bytes: directorySizeBytes(runtimeRoot),
    opl_layer_taxonomy: FULL_RUNTIME_CACHE_LAYER_TAXONOMY,
    layers: {
      toolchain: {
        relative_paths: ['bin', 'node', 'python', 'uv', 'vendor'],
        size_bytes: directorySizeBytes(path.join(runtimeRoot, 'bin'))
          + directorySizeBytes(path.join(runtimeRoot, 'node'))
          + directorySizeBytes(path.join(runtimeRoot, 'python'))
          + directorySizeBytes(path.join(runtimeRoot, 'uv'))
          + directorySizeBytes(path.join(runtimeRoot, 'vendor')),
        children: {
          bin: sizeBreakdownEntry(runtimeRoot, 'bin', directoryChildSizes(path.join(runtimeRoot, 'bin'))),
          node: sizeBreakdownEntry(runtimeRoot, 'node'),
          python: sizeBreakdownEntry(runtimeRoot, 'python'),
          uv: sizeBreakdownEntry(runtimeRoot, 'uv'),
          vendor: sizeBreakdownEntry(runtimeRoot, 'vendor', directoryChildSizes(path.join(runtimeRoot, 'vendor'))),
        },
      },
      'domain-runtime': sizeBreakdownEntry(runtimeRoot, 'modules', directoryChildSizes(path.join(runtimeRoot, 'modules'))),
      'opl-runtime': sizeBreakdownEntry(runtimeRoot, 'opl', {
        'node_modules': sizeBreakdownEntry(runtimeRoot, 'opl/node_modules'),
      }),
      skills: sizeBreakdownEntry(runtimeRoot, 'skills', directoryChildSizes(path.join(runtimeRoot, 'skills'))),
    },
  };
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function assertOfflineRequiredPayloadsPresent(runtimeAssertions) {
  const missingPayloads = (runtimeAssertions.offline_required_payloads ?? []).filter((entry) => {
    if (entry.exists !== true) return true;
    return Object.prototype.hasOwnProperty.call(entry, 'executable') && entry.executable !== true;
  });
  if (missingPayloads.length > 0) {
    throw new Error(
      [
        'Full runtime package is missing required offline payload(s):',
        ...missingPayloads.map((entry) =>
          Object.prototype.hasOwnProperty.call(entry, 'executable') && entry.executable !== true
            ? `  - ${entry.path} (not executable)`
            : `  - ${entry.path}`,
        ),
      ].join('\n'),
    );
  }
}

function assertDeclaredPrunedPathsAbsent(runtimeAssertions) {
  const declarations = runtimeAssertions.declared_pruned_paths ?? [];
  const declarationByPath = new Map(declarations.map((entry) => [entry.path, entry]));
  const invalidPaths = FULL_RUNTIME_FORBIDDEN_FRAMEWORK_CODEX_PATHS.filter((relativePath) => {
    const declaration = declarationByPath.get(relativePath);
    return !declaration || declaration.expected !== 'absent' || declaration.present !== false;
  });
  if (invalidPaths.length > 0) {
    throw new Error([
      'Full runtime package contains or failed to prove absence of Framework-managed Codex payload path(s):',
      ...invalidPaths.map((relativePath) => `  - ${relativePath}`),
    ].join('\n'));
  }
}

export function writeFullRuntimeManifest(runtimeRoot, options, packagedAt, components, resolvedRefs, optionalComponents = {}, nativeTrust = undefined) {
  const carrier = resolveFullCarrierProfile({ carrierId: options.carrierId });
  const manifestDir = path.join(runtimeRoot, 'manifest');
  const manifestPath = path.join(manifestDir, 'full-package-manifest.json');
  fs.mkdirSync(manifestDir, { recursive: true });

  const runtimeAssertions = collectRuntimeAssertions(runtimeRoot);
  assertOfflineRequiredPayloadsPresent(runtimeAssertions);
  assertDeclaredPrunedPathsAbsent(runtimeAssertions);
  let manifest = buildFullPackageManifest({
    version: options.version,
    generatedAt: packagedAt,
    components,
    optionalComponents,
    resolvedRefs,
    runtimeAssertions,
    nativeTrust,
    carrier,
  });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const sizeBreakdown = collectFullRuntimeSizeBreakdown(runtimeRoot);
    const nextRuntimeAssertions = collectRuntimeAssertions(runtimeRoot);
    assertOfflineRequiredPayloadsPresent(nextRuntimeAssertions);
    assertDeclaredPrunedPathsAbsent(nextRuntimeAssertions);
    const nextManifest = buildFullPackageManifest({
      version: options.version,
      generatedAt: packagedAt,
      components,
      optionalComponents,
      resolvedRefs,
      runtimeAssertions: nextRuntimeAssertions,
      nativeTrust,
      sizeBreakdown,
      carrier,
    });
    fs.writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8');

    if (JSON.stringify(sizeBreakdown) === JSON.stringify(collectFullRuntimeSizeBreakdown(runtimeRoot))) {
      return nextManifest;
    }
    manifest = nextManifest;
  }

  throw new Error('Full runtime manifest size_breakdown did not stabilize.');
}

export function writeChecksums(outDir, files) {
  const lines = files.map((filePath) => {
    const result = run('shasum', ['-a', '256', filePath], { capture: true });
    const hash = result.stdout.trim().split(/\s+/)[0];
    return `${hash}  ${path.basename(filePath)}`;
  });
  const checksumPath = path.join(outDir, 'SHA256SUMS.txt');
  fs.writeFileSync(checksumPath, `${lines.join('\n')}\n`, 'utf8');
  return checksumPath;
}
