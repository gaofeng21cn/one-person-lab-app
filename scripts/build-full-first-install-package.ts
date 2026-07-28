#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { syncAppProductProfileToShell } from './app-product-profile.ts';
import {
  buildFullFirstInstallReadme,
  buildFullPackageArtifactNames,
} from './full-first-install-package.ts';
import {
  createFullDmgFromVerifiedApp,
  ensureFullDmgLocalAuthorization,
  findBuiltApp,
  maybeCreateRuntimeTar,
  removeStandardGuiArtifacts,
  resolveFullDmgCompressionLevel,
  resolveFullDmgFormat,
  syncRuntimePayloadToBuildRoots,
} from './build-full-first-install-package/archive-output.ts';
import { parseArgs } from './build-full-first-install-package/env.ts';
import { requirePath } from './build-full-first-install-package/filesystem.ts';
import {
  assertAppBundleLocalAuthorization,
  ensureAppBundleAdHocCodesign,
} from './build-full-first-install-package/macos-trust.ts';
import {
  resolveMasScholarSkillsFullRuntimeSource,
  writeChecksums,
  writeJsonFile,
} from './build-full-first-install-package/manifest-checksum.ts';
import { appRepoRoot } from './build-full-first-install-package/paths.ts';
import { durationSeconds, monotonicSeconds, run } from './build-full-first-install-package/process.ts';
import { runFullPackagePrecompressionGate } from './build-full-first-install-package/precompression.ts';
import { buildRuntimeCacheKeyReport } from './build-full-first-install-package/runtime-cache.ts';
import { resolveRuntimeSources } from './build-full-first-install-package/runtime-sources.ts';
import { prepareRuntime } from './build-full-first-install-package/staging.ts';
import { resolveOfficeCliReleaseSource } from './build-full-first-install-package/upstream-release.ts';
import { fileSha256 } from './release-file-helpers.ts';
import {
  deriveManualLocalAppIdentity,
  stampManualLocalAppIdentity,
} from './manual-latest-build/common.ts';
import {
  assertReleaseVersionNotFuture,
  assertUpdaterVersionMatchesDisplay,
} from './release-version.ts';

const MANUAL_LOCAL_BUNDLE_VERSION_ENV = 'OPL_MANUAL_LOCAL_BUNDLE_VERSION';
const MANUAL_LOCAL_SOURCE_PROVENANCE_ENV = 'OPL_MANUAL_LOCAL_SOURCE_PROVENANCE_SHA256';
const MANUAL_LOCAL_SOURCE_LOCK_ENV = 'OPL_MANUAL_LOCAL_SOURCE_LOCK_SHA256';

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildFullPublicReleaseManifest(input) {
  return {
    schema: 'opl_public_release_manifest.v1',
    package_kind: 'opl_full_first_install_macos_arm64',
    version: input.version,
    release_version: input.version,
    updater_version: input.updaterVersion,
    primary_install_asset: input.artifactNames.dmg,
    assets: [
      {
        name: input.artifactNames.dmg,
        role: 'full_first_install_carrier',
        size_bytes: fs.statSync(input.fullDmgPath).size,
        sha256: fileSha256(input.fullDmgPath),
      },
    ],
    manifest: input.fullPackageManifest,
    evidence: {
      runtime_cache_events: input.runtimeCacheEvents,
      runtime_currentness_probe: readJsonIfExists(input.runtimeCurrentnessProbePath),
      runtime_native_trust: input.runtimeNativeTrust,
      app_bundle_trim_report: input.appBundleTrimReport,
      package_boundary_audit: input.packageBoundaryAudit,
      precompression_gate: input.precompressionGate,
      local_authorization_policy: readJsonIfExists(path.join(input.outDir, 'full-local-authorization-policy.json')),
      readme_asset: input.artifactNames.readme,
    },
    transition_legacy_assets: [
      input.artifactNames.manifest,
      input.artifactNames.runtimeCacheEvents,
      'full-runtime-currentness-probe.json',
      'full-runtime-native-trust.json',
      'full-app-bundle-trim-report.json',
      'full-package-boundary-audit.json',
    ],
  };
}

function resolveManualLocalAppIdentity(options) {
  const bundleVersion = process.env[MANUAL_LOCAL_BUNDLE_VERSION_ENV]?.trim() || '';
  const sourceProvenanceSha256 = process.env[MANUAL_LOCAL_SOURCE_PROVENANCE_ENV]?.trim() || '';
  const sourceLockSha256 = process.env[MANUAL_LOCAL_SOURCE_LOCK_ENV]?.trim() || '';
  const supplied = [bundleVersion, sourceProvenanceSha256, sourceLockSha256].some(Boolean);
  if (!options.appOnly) {
    if (supplied) {
      throw new Error('Manual local App identity is allowed only with --app-only');
    }
    return null;
  }
  if (!bundleVersion || !sourceProvenanceSha256 || !sourceLockSha256) {
    throw new Error(
      'Manual local App build requires bundle version, source provenance, and source-lock identity',
    );
  }
  const expected = deriveManualLocalAppIdentity(
    options.updaterVersion,
    sourceProvenanceSha256,
  );
  if (bundleVersion !== expected.bundle_version || !/^[0-9a-f]{64}$/.test(sourceLockSha256)) {
    throw new Error('Manual local App build identity does not match its public updater and source lock');
  }
  return {
    ...expected,
    source_lock_sha256: sourceLockSha256,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  assertReleaseVersionNotFuture('stable', options.version);
  assertUpdaterVersionMatchesDisplay('stable', options.version, options.updaterVersion);
  const manualLocalAppIdentity = resolveManualLocalAppIdentity(options);
  const artifactNames = buildFullPackageArtifactNames(options.version);
  fs.mkdirSync(options.outDir, { recursive: true });

  for (const [label, source] of [
    ['GUI root', options.guiRoot],
    ['Framework root', options.frameworkRoot],
    ['MAS root', options.masRoot],
    ['MAS Scholar Skills root', options.masScholarSkillsRoot],
    ['MAG root', options.magRoot],
    ['RCA root', options.rcaRoot],
    ['OPL Meta Agent root', options.metaAgentRoot],
    ['OPL Book Forge root', options.bookforgeRoot],
    ['OPL Flow root', options.oplFlowRoot],
    ['OfficeCLI root', options.officeCliRoot],
  ]) {
    requirePath(source, label);
  }

  options.officeCliRelease = resolveOfficeCliReleaseSource(options.officeCliRoot, options.officeCliRef);
  const sourceResolutions = {
    masScholarSkills: resolveMasScholarSkillsFullRuntimeSource(options),
  };
  const sources = resolveRuntimeSources(options);
  if (options.printRuntimeCacheKeys) {
    console.log(JSON.stringify(buildRuntimeCacheKeyReport(options, sources), null, 2));
    return;
  }

  const timings = {};
  const buildStartedAt = monotonicSeconds();
  const prepared = prepareRuntime(options, sources, sourceResolutions);
  const runtimePreparedAt = monotonicSeconds();
  timings.runtime_materialize = durationSeconds(buildStartedAt, runtimePreparedAt);
  timings.runtime_cache_materialize = Number(prepared.runtime_cache.events.reduce((sum, event) => {
    return sum + (typeof event.duration_seconds === 'number' ? event.duration_seconds : 0);
  }, 0).toFixed(3));
  const runtimeCacheEventsPath = path.join(options.outDir, artifactNames.runtimeCacheEvents);
  writeJsonFile(runtimeCacheEventsPath, prepared.runtime_cache);
  const runtimeCurrentnessProbePath = path.join(options.outDir, 'full-runtime-currentness-probe.json');
  writeJsonFile(runtimeCurrentnessProbePath, prepared.runtime_cache.currentness);
  const runtimeNativeTrustPath = path.join(options.outDir, 'full-runtime-native-trust.json');
  writeJsonFile(runtimeNativeTrustPath, prepared.manifest.native_trust);

  if (options.warmRuntimeCacheOnly) {
    fs.rmSync(prepared.stagingRoot, { recursive: true, force: true });
    console.log(JSON.stringify({
      status: 'runtime_cache_warmed',
      version: options.version,
      out_dir: options.outDir,
      runtime_cache_events: runtimeCacheEventsPath,
      runtime_currentness_probe: runtimeCurrentnessProbePath,
      runtime_native_trust: runtimeNativeTrustPath,
      runtime_cache: prepared.runtime_cache,
      resolved_refs: prepared.resolved_refs,
      duration_seconds: {
        runtime_materialize: timings.runtime_materialize,
        runtime_cache_materialize: timings.runtime_cache_materialize,
      },
    }, null, 2));
    return;
  }

  const cacheEventsWrittenAt = monotonicSeconds();
  const payloadRoots = syncRuntimePayloadToBuildRoots(prepared.runtimeRoot, prepared.manifest, options.guiRoot);
  const payloadSyncedAt = monotonicSeconds();
  timings.payload_sync = durationSeconds(cacheEventsWrittenAt, payloadSyncedAt);
  const productProfileSync = syncAppProductProfileToShell(options.guiRoot);

  if (!options.skipGuiBuild) {
    const shellBuildStartedAt = monotonicSeconds();
    const shellBuildArgs = ['run', 'build-mac:arm64', '--', '--dir-only'];
    if (options.reuseGuiViteOutput) {
      shellBuildArgs.push('--skip-vite');
    }
    run('npm', shellBuildArgs, {
      cwd: options.guiRoot,
      env: {
        ...process.env,
        OPL_RELEASE_VERSION: options.version,
        OPL_UPDATER_VERSION: manualLocalAppIdentity?.bundle_version ?? options.updaterVersion,
        OPL_REQUIRE_FULL_RUNTIME: '1',
      },
    });
    timings.shell_build = durationSeconds(shellBuildStartedAt, monotonicSeconds());
  } else {
    timings.shell_build = 0;
  }

  const dmgFormat = resolveFullDmgFormat();
  process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL = resolveFullDmgCompressionLevel();
  const builtApp = findBuiltApp(options.guiRoot);
  if (manualLocalAppIdentity) {
    stampManualLocalAppIdentity(builtApp, manualLocalAppIdentity);
  }
  const precompressionGatePath = path.join(options.outDir, 'full-precompression-gate.json');
  const precompressionStartedAt = monotonicSeconds();
  const precompressionGate = runFullPackagePrecompressionGate({
    builtAppPath: builtApp,
    resolvedRefs: prepared.resolved_refs,
    runtimeCurrentness: prepared.runtime_cache.currentness,
    reportPath: precompressionGatePath,
  });
  timings.precompression_gate = durationSeconds(precompressionStartedAt, monotonicSeconds());

  if (options.appOnly) {
    ensureAppBundleAdHocCodesign(builtApp, 'Full local App bundle');
    assertAppBundleLocalAuthorization(builtApp, 'Full local App bundle');
    fs.rmSync(prepared.stagingRoot, { recursive: true, force: true });
    console.log(JSON.stringify({
      status: 'full_local_app_built',
      version: options.version,
      updater_version: options.updaterVersion,
      bundle_version: manualLocalAppIdentity.bundle_version,
      build_identity: manualLocalAppIdentity,
      app_bundle: builtApp,
      runtime_cache_events: runtimeCacheEventsPath,
      runtime_currentness_probe: runtimeCurrentnessProbePath,
      runtime_native_trust: runtimeNativeTrustPath,
      precompression_gate: precompressionGatePath,
      resolved_refs: prepared.resolved_refs,
      duration_seconds: {
        runtime_materialize: timings.runtime_materialize,
        runtime_cache_materialize: timings.runtime_cache_materialize,
        payload_sync: timings.payload_sync,
        shell_build: timings.shell_build,
        precompression_gate: timings.precompression_gate,
        total: durationSeconds(buildStartedAt, monotonicSeconds()),
      },
    }, null, 2));
    return;
  }

  const packageCompressionStartedAt = monotonicSeconds();
  ensureAppBundleAdHocCodesign(builtApp, 'Full built app bundle');
  const targetDmg = path.join(options.outDir, artifactNames.dmg);
  let optimizedPackage = createFullDmgFromVerifiedApp(
    options.guiRoot,
    builtApp,
    targetDmg,
    options.version,
    prepared.manifest,
    dmgFormat,
  );
  if (optimizedPackage?.manifest) {
    prepared.manifest = optimizedPackage.manifest;
  }
  const rebuiltOptimizedPackage = ensureFullDmgLocalAuthorization(
    options.guiRoot,
    targetDmg,
    options.version,
    prepared.manifest,
    dmgFormat,
  );
  if (rebuiltOptimizedPackage) {
    optimizedPackage = rebuiltOptimizedPackage;
    if (rebuiltOptimizedPackage.manifest) {
      prepared.manifest = rebuiltOptimizedPackage.manifest;
    }
  }
  removeStandardGuiArtifacts(options.guiRoot, options.version);
  const runtimeTar = maybeCreateRuntimeTar(options, prepared.runtimeRoot, artifactNames);
  timings.dmg_package_compression = durationSeconds(packageCompressionStartedAt, monotonicSeconds());

  const manifestChecksumStartedAt = monotonicSeconds();
  const manifestPath = path.join(options.outDir, artifactNames.manifest);
  fs.writeFileSync(manifestPath, `${JSON.stringify(prepared.manifest, null, 2)}\n`, 'utf8');
  const appBundleTrimPath = path.join(options.outDir, 'full-app-bundle-trim-report.json');
  const packageBoundaryAuditPath = path.join(options.outDir, 'full-package-boundary-audit.json');
  if (optimizedPackage?.app_bundle_trim) {
    writeJsonFile(appBundleTrimPath, optimizedPackage.app_bundle_trim);
  }
  if (optimizedPackage?.package_boundary_audit) {
    writeJsonFile(packageBoundaryAuditPath, optimizedPackage.package_boundary_audit);
  }
  const readmePath = path.join(options.outDir, artifactNames.readme);
  fs.writeFileSync(readmePath, buildFullFirstInstallReadme({
    version: options.version,
    dmgName: artifactNames.dmg,
    runtimeTarName: runtimeTar ? artifactNames.runtimeTar : null,
    notarized: process.env.OPL_FULL_PACKAGE_NOTARIZED === 'true',
  }), 'utf8');
  const releaseManifestPath = path.join(options.outDir, artifactNames.releaseManifest);
  writeJsonFile(releaseManifestPath, buildFullPublicReleaseManifest({
    version: options.version,
    updaterVersion: options.updaterVersion,
    artifactNames,
    outDir: options.outDir,
    fullDmgPath: targetDmg,
    fullPackageManifest: prepared.manifest,
    runtimeCacheEvents: prepared.runtime_cache,
    runtimeCurrentnessProbePath,
    runtimeNativeTrust: prepared.manifest.native_trust,
    appBundleTrimReport: optimizedPackage?.app_bundle_trim ?? null,
    packageBoundaryAudit: optimizedPackage?.package_boundary_audit ?? null,
    precompressionGate,
  }));
  const checksumPath = writeChecksums(options.outDir, [
    targetDmg,
    releaseManifestPath,
    readmePath,
    ...(runtimeTar ? [runtimeTar] : []),
  ]);
  timings.manifest_checksum = durationSeconds(manifestChecksumStartedAt, monotonicSeconds());
  const buildFinishedAt = monotonicSeconds();
  const timingPath = path.join(options.outDir, 'full-package-build-timing.json');
  writeJsonFile(timingPath, {
    schema: 'opl_full_package_build_timing.v1',
    version: options.version,
    dmg_format: dmgFormat,
    dmg_compression_level: process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL,
    duration_seconds: {
      full_package_build: durationSeconds(buildStartedAt, buildFinishedAt),
      full_package_build_breakdown: timings,
    },
    resolved_refs: prepared.resolved_refs,
  });

  console.log(JSON.stringify({
    status: 'completed',
    version: options.version,
    dmg_format: dmgFormat,
    dmg_compression_level: process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL,
    out_dir: options.outDir,
    app_repo_root: appRepoRoot,
    framework_root: options.frameworkRoot,
    dmg: targetDmg,
    runtime_tar: runtimeTar,
    manifest: manifestPath,
    release_manifest: releaseManifestPath,
    runtime_cache_events: runtimeCacheEventsPath,
    runtime_native_trust: runtimeNativeTrustPath,
    app_bundle_trim_report: optimizedPackage?.app_bundle_trim ? appBundleTrimPath : null,
    package_boundary_audit: optimizedPackage?.package_boundary_audit ? packageBoundaryAuditPath : null,
    precompression_gate: precompressionGatePath,
    timing: timingPath,
    readme: readmePath,
    checksums: checksumPath,
    payload_roots: payloadRoots,
    product_profile: productProfileSync,
    staging_root: prepared.stagingRoot,
    runtime_cache: prepared.runtime_cache,
    package_optimization: prepared.manifest.package_optimization ?? null,
    resolved_refs: prepared.resolved_refs,
    duration_seconds: {
      full_package_build: durationSeconds(buildStartedAt, buildFinishedAt),
      full_package_build_breakdown: timings,
    },
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
