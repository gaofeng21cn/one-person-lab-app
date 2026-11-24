import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertFullRuntimeNativeTrustObject } from "../full-runtime-native-trust.ts";
import { assertAppleNotarizationReceipt, assertGatekeeperLaunchPolicy } from "../macos-gatekeeper-policy.ts";
import { fileSha256 } from "../release-file-helpers.ts";
import { readManagedUpdateLifecycleProviderMap } from "../managed-update-lifecycle-contract.ts";
import { FULL_RUNTIME_FORBIDDEN_FRAMEWORK_CODEX_PATHS } from "../full-first-install-package.ts";
import { assertFrameworkCodexCarrierBoundary } from "./carrier-boundary.ts";
import {
  assertLocalAuthorizationPolicyObject,
  readFullAppleNotarizationReceipt,
  readFullGatekeeperLaunchPolicy,
  readFullLocalAuthorizationPolicy,
  readFullPackageManifest,
  readFullPublicReleaseManifest,
  readFullReleaseSection,
  readText,
  runCapture,
} from "./release-assets.ts";

export function assertFullRuntimeNativeTrust(downloadDir, manifest, options = {}) {
  const trust = readFullReleaseSection(downloadDir, "runtime_native_trust", "full-runtime-native-trust.json");
  assertFullRuntimeNativeTrustObject(
    trust,
    manifest,
    options,
  );
  return trust;
}

export function assertFullRuntimeCurrentnessProbe(downloadDir, manifest) {
  const probe = readFullReleaseSection(
    downloadDir,
    "runtime_currentness_probe",
    "full-runtime-currentness-probe.json",
  );
  if (probe?.schema !== "opl_full_runtime_currentness_probe.v1") {
    throw new Error(`Full runtime currentness probe schema is unexpected: ${probe?.schema}`);
  }
  if (probe.status !== "passed") {
    throw new Error(`Full runtime currentness probe did not pass: ${probe.status || "(empty)"}`);
  }
  if (probe.managed_update_surface_id !== "opl_managed_updater_kernel") {
    throw new Error(
      `Full runtime currentness probe used unexpected managed update surface: ${probe.managed_update_surface_id || "(empty)"}`,
    );
  }
  const componentIds = new Set(
    Array.isArray(probe.managed_update_components) ? probe.managed_update_components : [],
  );
  const requiredProviders = readManagedUpdateLifecycleProviderMap();
  for (const required of Object.keys(requiredProviders)) {
    if (!componentIds.has(required)) {
      throw new Error(
        `Full runtime currentness probe is missing managed update component: ${required}`,
      );
    }
  }
  for (const [componentId, providerId] of Object.entries(requiredProviders)) {
    if (probe.managed_update_component_providers?.[componentId] !== providerId) {
      throw new Error(`Full runtime currentness probe provider mismatch for ${componentId}.`);
    }
  }
  const expectedCommit =
    manifest?.components?.opl?.git_commit ||
    manifest?.resolved_refs?.opl_framework?.resolved_commit;
  if (expectedCommit && probe.framework_commit !== expectedCommit) {
    throw new Error(
      `Full runtime currentness probe Framework commit mismatch: expected ${expectedCommit}, got ${probe.framework_commit || "(empty)"}`,
    );
  }
  if (probe.app_state_schema_version !== "opl_app_state.v1") {
    throw new Error(
      `Full runtime currentness probe App state schema is unexpected: ${probe.app_state_schema_version || "(empty)"}`,
    );
  }
  if (probe.app_state_surface_ref !== "app_state.runtime_source_carriers") {
    throw new Error(
      `Full runtime currentness probe App state surface is unexpected: ${probe.app_state_surface_ref || "(empty)"}`,
    );
  }
  const runtimeSourceCarrierCount = Number(
    probe.app_state_runtime_source_carrier_count ?? probe.app_state_module_count,
  );
  if (!(runtimeSourceCarrierCount > 0)) {
    throw new Error(
      "Full runtime currentness probe must record at least one runtime source carrier.",
    );
  }
}

export function assertFullPackageOptimizationArtifacts(downloadDir, manifest) {
  const carrier = manifest.carrier;
  if (
    carrier?.carrier_id !== 'opl-studio'
    || carrier.bundle_id !== 'cn.onepersonlab.opl'
    || carrier.codex_carrier !== 'opl_codex_native'
    || carrier.aioncore_required !== false
    || carrier.runtime_resource_dir !== 'opl-studio-full-runtime'
  ) {
    throw new Error('Full manifest must use the Studio Stable carrier identity.');
  }
  const runtimeResource = 'Contents/Resources/opl-studio-full-runtime';

  const trimReport = readFullReleaseSection(
    downloadDir,
    "app_bundle_trim_report",
    "full-app-bundle-trim-report.json",
  );
  const boundaryAudit = readFullReleaseSection(
    downloadDir,
    "package_boundary_audit",
    "full-package-boundary-audit.json",
  );
  if (trimReport.schema !== "opl_full_app_bundle_trim_report.v1") {
    throw new Error(`Full app bundle trim report schema is unexpected: ${trimReport.schema}`);
  }
  if (trimReport.mode !== "explicit_non_runtime_prune_only") {
    throw new Error(`Full app bundle trim report mode is unexpected: ${trimReport.mode}`);
  }
  if (trimReport.required_payload_boundary?.preserved !== true) {
    throw new Error(
      "Full app bundle trim report must preserve the declared Full runtime payload boundary.",
    );
  }
  if (
    trimReport.required_payload_boundary?.full_runtime_resource_dir !==
    runtimeResource
  ) {
    throw new Error(
      "Full app bundle trim report must identify Contents/Resources/opl-full-runtime as protected.",
    );
  }
  const protectedPayloads = trimReport.required_payload_boundary?.protected_payloads;
  for (const requiredPayload of [
    runtimeResource,
    "Contents/Resources/app.asar",
    "Contents/Frameworks/Electron Framework.framework",
  ]) {
    if (!Array.isArray(protectedPayloads) || !protectedPayloads.includes(requiredPayload)) {
      throw new Error(`Full app bundle trim report must protect ${requiredPayload}.`);
    }
  }
  if (Number(trimReport.after_bytes) > Number(trimReport.before_bytes)) {
    throw new Error("Full app bundle trim report after_bytes must not exceed before_bytes.");
  }
  if (boundaryAudit.schema !== "opl_full_package_boundary_audit.v2") {
    throw new Error(`Full package boundary audit schema is unexpected: ${boundaryAudit.schema}`);
  }
  if (
    boundaryAudit.standard_app_boundary?.standard_package_allowed_to_contain_full_runtime !== false
  ) {
    throw new Error(
      "Full package boundary audit must keep standard App package disallowed from containing the Full runtime.",
    );
  }
  if (boundaryAudit.full_package_boundary?.contains_opl_full_runtime !== true) {
    throw new Error(
      "Full package boundary audit must prove the Full package still contains the OPL Full runtime.",
    );
  }
  if (boundaryAudit.full_package_boundary?.contains_shell_runtime !== false) {
    throw new Error(
      "Full package boundary audit must prove the Studio Full package contains no embedded shell runtime.",
    );
  }
  assertFrameworkCodexCarrierBoundary(
    boundaryAudit.full_package_boundary,
    "Full package boundary audit",
    true,
  );
  if (boundaryAudit.entries?.app_asar?.exists !== true) {
    throw new Error(
      "Full package boundary audit must prove the App app.asar payload is still present.",
    );
  }
  if (boundaryAudit.entries?.electron_framework?.exists !== true) {
    throw new Error(
      "Full package boundary audit must prove the Electron framework payload is still present.",
    );
  }
  if (manifest.package_optimization?.offline_first_install_completeness_preserved !== true) {
    throw new Error(
      "Full manifest package_optimization must preserve offline first-install completeness.",
    );
  }
  if (manifest.package_optimization?.size_review_release_blocking_by_size_alone !== false) {
    throw new Error(
      "Full manifest package_optimization must keep size review non-blocking by size alone.",
    );
  }
  if (
    manifest.package_optimization?.package_boundary_audit?.audited_entries?.app_asar?.exists !==
    true
  ) {
    throw new Error("Full manifest package_optimization must record app_asar as present.");
  }
  if (
    manifest.package_optimization?.package_boundary_audit?.audited_entries?.electron_framework
      ?.exists !== true
  ) {
    throw new Error(
      "Full manifest package_optimization must record electron_framework as present.",
    );
  }
  assertFrameworkCodexCarrierBoundary(
    manifest.package_optimization?.package_boundary_audit,
    "Full manifest package_optimization",
    true,
  );
  return {
    app_bundle_trim: {
      before_bytes: trimReport.before_bytes,
      after_bytes: trimReport.after_bytes,
      bytes_removed: trimReport.bytes_removed,
      removed_count: trimReport.removed_count,
    },
    package_boundary_audit: {
      contains_opl_full_runtime: boundaryAudit.full_package_boundary?.contains_opl_full_runtime,
      contains_shell_runtime: boundaryAudit.full_package_boundary?.contains_shell_runtime,
      standard_package_allowed_to_contain_full_runtime:
        boundaryAudit.standard_app_boundary?.standard_package_allowed_to_contain_full_runtime,
    },
  };
}

export function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

export function assertSafePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

export function parseSha256Sums(text) {
  const entries = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const match = trimmed.match(/^(?<hash>[a-f0-9]{64})\s+\*?(?<name>.+)$/i);
    if (!match?.groups) {
      throw new Error(`Invalid SHA256SUMS.txt line: ${line}`);
    }
    entries.set(match.groups.name.trim(), match.groups.hash.toLowerCase());
  }
  return entries;
}

export function readFullRuntimeUncompressedBytes(manifest) {
  const sizeBreakdown = assertPlainObject(manifest?.size_breakdown, "Full manifest size_breakdown");
  return assertSafePositiveInteger(
    sizeBreakdown.total_runtime_uncompressed_bytes,
    "Full manifest size_breakdown.total_runtime_uncompressed_bytes",
  );
}

export function assertFullComponent(manifest, componentId) {
  const components = assertPlainObject(manifest.components, "Full manifest components");
  return assertPlainObject(components[componentId], `Full manifest components.${componentId}`);
}

export function assertFullOptionalComponent(manifest, componentId) {
  const optionalComponents = assertPlainObject(
    manifest.optional_components,
    "Full manifest optional_components",
  );
  return assertPlainObject(
    optionalComponents[componentId],
    `Full manifest optional_components.${componentId}`,
  );
}

export function assertFullSizeBudget(manifest, fullDmgAssetSize) {
  if (manifest?.manifest_version !== 2) {
    throw new Error(
      `Full manifest must declare manifest_version=2; got ${manifest?.manifest_version}`,
    );
  }

  const sizeBudget = assertPlainObject(manifest.size_budget, "Full manifest size_budget");
  const measurementPolicy = assertPlainObject(
    manifest.measurement_policy,
    "Full manifest measurement_policy",
  );
  if (sizeBudget.platform_scope !== "macos-arm64") {
    throw new Error(
      `Full size budget platform_scope must be macos-arm64; got ${sizeBudget.platform_scope}`,
    );
  }
  if (measurementPolicy.full_dmg_bytes !== "github_release_asset_size_bytes") {
    throw new Error(
      `Full measurement policy full_dmg_bytes must be github_release_asset_size_bytes; got ${measurementPolicy.full_dmg_bytes}`,
    );
  }
  if (
    measurementPolicy.runtime_uncompressed_bytes !==
    "manifest_size_breakdown_total_runtime_uncompressed_bytes"
  ) {
    throw new Error(
      `Full measurement policy runtime_uncompressed_bytes must be manifest_size_breakdown_total_runtime_uncompressed_bytes; got ${measurementPolicy.runtime_uncompressed_bytes}`,
    );
  }

  const warningFullDmgBytes = assertSafePositiveInteger(
    sizeBudget.warning_full_dmg_bytes,
    "Full manifest size_budget.warning_full_dmg_bytes",
  );
  const maxFullDmgBytes = assertSafePositiveInteger(
    sizeBudget.max_full_dmg_bytes,
    "Full manifest size_budget.max_full_dmg_bytes",
  );
  const maxRuntimeUncompressedBytes = assertSafePositiveInteger(
    sizeBudget.max_runtime_uncompressed_bytes,
    "Full manifest size_budget.max_runtime_uncompressed_bytes",
  );
  const runtimeUncompressedBytes = readFullRuntimeUncompressedBytes(manifest);
  const runtimeAssertions = assertPlainObject(
    manifest.runtime_assertions,
    "Full manifest runtime_assertions",
  );
  if (!Array.isArray(runtimeAssertions.temporal_core_bridge_releases)) {
    throw new Error(
      "Full manifest runtime_assertions.temporal_core_bridge_releases must be an array.",
    );
  }
  if (
    runtimeAssertions.temporal_core_bridge_releases.length !== 1 ||
    runtimeAssertions.temporal_core_bridge_releases[0] !== "aarch64-apple-darwin"
  ) {
    throw new Error(
      `Full runtime Temporal core-bridge releases must be only aarch64-apple-darwin; got ${runtimeAssertions.temporal_core_bridge_releases.join(", ")}`,
    );
  }
  if (runtimeAssertions.excluded_module_venv_count !== 0) {
    throw new Error(
      `Full runtime must not package modules/*/.venv directories; count=${runtimeAssertions.excluded_module_venv_count}`,
    );
  }
  const components = assertPlainObject(manifest.components, "Full manifest components");
  if (Object.prototype.hasOwnProperty.call(components, "codex")) {
    throw new Error("Full manifest must not contain components.codex.");
  }
  const declaredPrunedPaths = runtimeAssertions.declared_pruned_paths;
  if (!Array.isArray(declaredPrunedPaths)) {
    throw new Error(
      "Full manifest runtime_assertions.declared_pruned_paths must be an array.",
    );
  }
  const declarationByPath = new Map(
    declaredPrunedPaths.map((entry) => [entry?.path, entry]),
  );
  for (const relativePath of FULL_RUNTIME_FORBIDDEN_FRAMEWORK_CODEX_PATHS) {
    const declaration = declarationByPath.get(relativePath);
    if (declaration?.expected !== "absent" || declaration?.present !== false) {
      throw new Error(
        `Full manifest must prove Framework Codex path ${relativePath} absent.`,
      );
    }
  }

  const temporalCli = assertFullComponent(manifest, "temporal_cli");
  if (
    temporalCli.required !== true ||
    temporalCli.role !== "temporal_cli_offline_archive_wrapper"
  ) {
    throw new Error(
      "Full manifest components.temporal_cli must be a required temporal_cli_offline_archive_wrapper component.",
    );
  }
  if (!String(temporalCli.version || "").startsWith("temporal version ")) {
    throw new Error(
      `Full manifest components.temporal_cli.version must record temporal --version; got ${temporalCli.version}`,
    );
  }
  if (temporalCli.binary_path !== null) {
    throw new Error(
      `Full manifest components.temporal_cli.binary_path must be null for archive-only packaging; got ${temporalCli.binary_path}`,
    );
  }
  if (
    temporalCli.archive_path !== "runtime/current/vendor/temporal/temporal_cli_darwin_arm64.tar.gz"
  ) {
    throw new Error(
      `Full manifest components.temporal_cli.archive_path is unexpected: ${temporalCli.archive_path}`,
    );
  }
  assertSafePositiveInteger(
    temporalCli.archive_size_bytes,
    "Full manifest components.temporal_cli.archive_size_bytes",
  );

  const bun = assertFullOptionalComponent(manifest, "bun");
  if (bun.required !== false || bun.role !== "optional_bun_cli_runtime_payload") {
    throw new Error(
      "Full manifest optional_components.bun must be optional_bun_cli_runtime_payload and not required.",
    );
  }
  if (!["packaged", "not_packaged"].includes(bun.status)) {
    throw new Error(
      `Full manifest optional_components.bun.status must be packaged or not_packaged; got ${bun.status}`,
    );
  }
  if (bun.status === "packaged" && !bun.version) {
    throw new Error(
      "Full manifest optional_components.bun.version is required when Bun is packaged.",
    );
  }

  if (runtimeUncompressedBytes > maxRuntimeUncompressedBytes) {
    throw new Error(
      `Full runtime uncompressed size budget exceeded: ${runtimeUncompressedBytes} > ${maxRuntimeUncompressedBytes}`,
    );
  }

  const warnings = [];
  const fullDmgSizeStatus = fullDmgAssetSize >= warningFullDmgBytes ? "warning" : "passed";
  if (fullDmgAssetSize > maxFullDmgBytes) {
    warnings.push({
      code: "full_dmg_size_above_review_threshold",
      message: `Full DMG size ${fullDmgAssetSize} is above review threshold ${maxFullDmgBytes}.`,
      full_dmg_size_bytes: fullDmgAssetSize,
      threshold_bytes: maxFullDmgBytes,
    });
  } else if (fullDmgAssetSize >= warningFullDmgBytes) {
    warnings.push({
      code: "full_dmg_size_warning",
      message: `Full DMG size ${fullDmgAssetSize} is above warning threshold ${warningFullDmgBytes}.`,
      full_dmg_size_bytes: fullDmgAssetSize,
      threshold_bytes: warningFullDmgBytes,
    });
  }

  return {
    status: "passed",
    platform_scope: sizeBudget.platform_scope,
    full_dmg_bytes_policy: measurementPolicy.full_dmg_bytes,
    runtime_uncompressed_bytes_policy: measurementPolicy.runtime_uncompressed_bytes,
    warning_full_dmg_bytes: warningFullDmgBytes,
    max_full_dmg_bytes: maxFullDmgBytes,
    max_runtime_uncompressed_bytes: maxRuntimeUncompressedBytes,
    full_dmg_size_bytes: fullDmgAssetSize,
    full_dmg_size_status: fullDmgSizeStatus,
    runtime_uncompressed_bytes: runtimeUncompressedBytes,
    warnings,
    temporal_core_bridge_releases: runtimeAssertions.temporal_core_bridge_releases,
    excluded_module_venv_count: runtimeAssertions.excluded_module_venv_count,
    required_components: {
      temporal_cli: {
        version: temporalCli.version,
        size_bytes: temporalCli.size_bytes,
        archive_path: temporalCli.archive_path,
        archive_size_bytes: temporalCli.archive_size_bytes,
      },
    },
    optional_components: {
      bun: {
        status: bun.status,
        version: bun.version ?? null,
        size_bytes: bun.size_bytes ?? 0,
      },
    },
  };
}

export function assertFullAssets(downloadDir, version, verifiedAssets) {
  const fullDmgName = `One-Person-Lab-Full-${version}-mac-arm64.dmg`;
  const releaseManifest = readFullPublicReleaseManifest(downloadDir);
  if (releaseManifest) {
    if (releaseManifest.schema !== "opl_public_release_manifest.v1") {
      throw new Error(`Full release manifest schema is unexpected: ${releaseManifest.schema}`);
    }
    if (releaseManifest.package_kind !== "opl_full_first_install_macos_arm64") {
      throw new Error(
        `Full release manifest package_kind is unexpected: ${releaseManifest.package_kind}`,
      );
    }
    if (releaseManifest.version !== version) {
      throw new Error(
        `Full release manifest version mismatch: expected ${version}, got ${releaseManifest.version}`,
      );
    }
    if (releaseManifest.primary_install_asset !== fullDmgName) {
      throw new Error(
        `Full release manifest primary_install_asset mismatch: expected ${fullDmgName}, got ${releaseManifest.primary_install_asset || "(empty)"}`,
      );
    }
  }
  if (!releaseManifest) {
    const checksumEntries = parseSha256Sums(readText(path.join(downloadDir, "SHA256SUMS.txt")));
    for (const name of [
      fullDmgName,
      "full-package-manifest.json",
      "runtime-cache-events.json",
      "full-runtime-currentness-probe.json",
      "full-runtime-native-trust.json",
      "full-app-bundle-trim-report.json",
      "full-package-boundary-audit.json",
      "README-Full-First-Install.txt",
      "full-local-authorization-policy.json",
    ]) {
      const expected = checksumEntries.get(name);
      if (!expected) {
        throw new Error(`SHA256SUMS.txt is missing ${name}.`);
      }
      const actual = fileSha256(path.join(downloadDir, name));
      if (actual !== expected) {
        throw new Error(
          `SHA256SUMS.txt mismatch for ${name}: expected ${expected}, got ${actual}.`,
        );
      }
    }
  }
  const manifest = readFullPackageManifest(downloadDir);
  if (manifest.version !== version) {
    throw new Error(`Full manifest version mismatch: expected ${version}, got ${manifest.version}`);
  }
  if (manifest?.distribution?.updater_metadata_allowed !== false) {
    throw new Error("Full manifest must declare distribution.updater_metadata_allowed=false.");
  }
  if (manifest?.package_kind !== "opl_full_first_install_macos_arm64") {
    throw new Error(`Unexpected Full manifest package_kind: ${manifest?.package_kind}`);
  }
  const fullDmgAsset = verifiedAssets.find((asset) => asset.name === fullDmgName);
  if (!fullDmgAsset) {
    throw new Error(`Verified assets are missing ${fullDmgName}.`);
  }
  let fullGatekeeperPolicy = null;
  let fullNotarizationReceipt = null;
  if (releaseManifest) {
    fullGatekeeperPolicy = assertGatekeeperLaunchPolicy(
      readFullGatekeeperLaunchPolicy(downloadDir),
      "app_full_first_install",
      "opl-release-manifest.json#evidence.gatekeeper_launch_policy",
    );
    fullNotarizationReceipt = assertAppleNotarizationReceipt(
      readFullAppleNotarizationReceipt(downloadDir),
      "opl-release-manifest.json#evidence.apple_notarization_receipt",
    );
    const notarizationReceiptSha256 = crypto
      .createHash("sha256")
      .update(`${JSON.stringify(fullNotarizationReceipt, null, 2)}\n`)
      .digest("hex");
    if (
      fullGatekeeperPolicy.team_identifier !== fullNotarizationReceipt.team_identifier
      || fullGatekeeperPolicy.notarization_receipt_sha256 !== notarizationReceiptSha256
      || fullNotarizationReceipt.final_stapled_dmg_sha256 !== fullDmgAsset.sha256
      || fullNotarizationReceipt.final_stapled_dmg_size_bytes !== fullDmgAsset.size
    ) {
      throw new Error(`Full Apple distribution evidence does not bind ${fullDmgName} to one Developer ID identity.`);
    }
    if (process.platform !== "darwin") {
      throw new Error("Full public Developer ID/notarization verification requires a macOS runner.");
    }
    const dmgPath = path.join(downloadDir, fullDmgName);
    for (const [command, args] of [
      ["codesign", ["--verify", "--strict", "--verbose=2", dmgPath]],
      ["xcrun", ["stapler", "validate", dmgPath]],
      ["spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=4", dmgPath]],
    ]) {
      const result = runCapture(command, args);
      if (result.status !== 0) {
        throw new Error(`Downloaded Full DMG failed ${command} validation: ${result.stderr || result.stdout || result.status}`);
      }
    }
    const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-public-dmg-"));
    let mounted = false;
    try {
      const attach = runCapture("hdiutil", ["attach", dmgPath, "-nobrowse", "-readonly", "-mountpoint", mountPoint]);
      if (attach.status !== 0) throw new Error(`Downloaded Full DMG could not be mounted: ${attach.stderr || attach.stdout}`);
      mounted = true;
      const appPath = path.join(mountPoint, "One Person Lab.app");
      if (!fs.existsSync(appPath)) throw new Error("Downloaded Full DMG does not contain One Person Lab.app.");
      for (const [command, args] of [
        ["codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]],
        ["spctl", ["--assess", "--type", "execute", "--verbose=4", appPath]],
      ]) {
        const result = runCapture(command, args);
        if (result.status !== 0) {
          throw new Error(`Downloaded Full App failed ${command} validation: ${result.stderr || result.stdout || result.status}`);
        }
      }
    } finally {
      if (mounted) runCapture("hdiutil", ["detach", mountPoint]);
      fs.rmSync(mountPoint, { recursive: true, force: true });
    }
  } else {
    assertLocalAuthorizationPolicyObject(
      readFullLocalAuthorizationPolicy(downloadDir),
      "app_full_first_install",
      "full-local-authorization-policy.json",
    );
  }
  assertFullRuntimeCurrentnessProbe(downloadDir, manifest);
  const runtimeNativeTrust = assertFullRuntimeNativeTrust(
    downloadDir,
    manifest,
    releaseManifest
      ? {
          requireProductionTrust: true,
          expectedTeamIdentifier: fullNotarizationReceipt.team_identifier,
        }
      : {},
  );
  if (
    releaseManifest
    && (
      fullGatekeeperPolicy.runtime_native_trust_status !== runtimeNativeTrust.status
      || fullGatekeeperPolicy.runtime_native_executable_count !== runtimeNativeTrust.executable_count
    )
  ) {
    throw new Error("Full Gatekeeper policy does not bind the embedded runtime native trust receipt.");
  }
  const optimizationArtifacts = assertFullPackageOptimizationArtifacts(downloadDir, manifest);

  const runtimeCacheEvents = readFullReleaseSection(
    downloadDir,
    "runtime_cache_events",
    "runtime-cache-events.json",
  );
  if (!Array.isArray(runtimeCacheEvents?.events) || runtimeCacheEvents.events.length === 0) {
    throw new Error("runtime-cache-events.json must include non-empty runtime cache events.");
  }

  const readme =
    releaseManifest?.evidence?.readme_text ??
    readText(path.join(downloadDir, "README-Full-First-Install.txt"));
  if (/[\u3400-\u9fff]/.test(readme)) {
    throw new Error("README-Full-First-Install.txt must remain English-only.");
  }

  const fullDmgManifestAsset = releaseManifest?.assets?.find(
    (asset) => asset?.name === fullDmgName,
  );
  if (releaseManifest && fullDmgManifestAsset?.sha256 !== `sha256:${fullDmgAsset.sha256}`) {
    throw new Error(`Full release manifest sha256 mismatch for ${fullDmgName}.`);
  }
  return {
    ...assertFullSizeBudget(manifest, fullDmgAsset.size),
    package_optimization: optimizationArtifacts,
  };
}
