#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertLocalAuthorizationPolicy } from "./local-authorization-policy.ts";
import { assertAppleNotarizationReceipt, assertGatekeeperLaunchPolicy } from "./macos-gatekeeper-policy.ts";
import { fileSha256 } from "./release-file-helpers.ts";
import { runCommand } from "./release-cleanup-helpers.ts";
import { assertFullRuntimeNativeTrustObject } from "./full-runtime-native-trust.ts";
import { readManagedUpdateLifecycleProviderMap } from "./managed-update-lifecycle-contract.ts";

function parseArgs(argv) {
  const parsed = {
    repo: process.env.OPL_RELEASE_REPO || "gaofeng21cn/one-person-lab-app",
    version: process.env.OPL_RELEASE_VERSION || "",
    updaterVersion: process.env.OPL_UPDATER_VERSION || "",
    tag: process.env.OPL_RELEASE_TAG || "",
    includeFullPackage: false,
    downloadDir: process.env.OPL_REMOTE_RELEASE_DOWNLOAD_DIR || "",
    noDownload: false,
    keepDownload: false,
    summaryPath: process.env.OPL_REMOTE_RELEASE_SUMMARY_PATH || "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--include-full-package") {
      parsed.includeFullPackage = true;
      continue;
    }
    if (token === "--no-download") {
      parsed.noDownload = true;
      continue;
    }
    if (token === "--keep-download") {
      parsed.keepDownload = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }
    index += 1;
    if (token === "--repo") parsed.repo = value;
    else if (token === "--version") parsed.version = value;
    else if (token === "--updater-version") parsed.updaterVersion = value;
    else if (token === "--tag") parsed.tag = value;
    else if (token === "--download-dir") parsed.downloadDir = path.resolve(value);
    else if (token === "--summary-path") parsed.summaryPath = path.resolve(value);
    else throw new Error(`Unknown argument: ${token}`);
  }

  if (!parsed.tag && parsed.version) {
    parsed.tag = `v${parsed.version}`;
  }
  if (!parsed.version && /^v/.test(parsed.tag)) {
    parsed.version = parsed.tag.slice(1);
  }
  if (!parsed.version || !parsed.tag) {
    throw new Error("Pass --version <version> or --tag <tag>.");
  }
  if (!/^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$/.test(parsed.version)) {
    throw new Error(`Invalid OPL release version: ${parsed.version}`);
  }
  if (!parsed.updaterVersion) {
    parsed.updaterVersion = parsed.version;
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(parsed.updaterVersion)) {
    throw new Error(`Invalid OPL updater machine version: ${parsed.updaterVersion}`);
  }
  return parsed;
}

function runCapture(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: process.env,
  });
}

function readReleaseView(repo, tag) {
  if (process.env.OPL_REMOTE_RELEASE_VIEW_JSON?.trim()) {
    return JSON.parse(process.env.OPL_REMOTE_RELEASE_VIEW_JSON);
  }
  const result = runCommand(
    "gh",
    [
      "release",
      "view",
      tag,
      "--repo",
      repo,
      "--json",
      "tagName,name,isDraft,isPrerelease,publishedAt,body,assets",
    ],
    { capture: true },
  );
  return JSON.parse(result.stdout);
}

function releaseHasAsset(releaseView, name) {
  return (
    Array.isArray(releaseView.assets) && releaseView.assets.some((asset) => asset?.name === name)
  );
}

function requiredAssetNames(version, includeFullPackage, releaseView) {
  const standard = [
    `One-Person-Lab-${version}-mac-arm64.dmg`,
    `One-Person-Lab-${version}-mac-arm64.zip`,
    `One-Person-Lab-${version}-mac-arm64.zip.blockmap`,
    "latest-arm64-mac.yml",
    "opl-install.sh",
    "opl-app-installer.sh",
    "standard-gatekeeper-launch-policy.json",
    "standard-apple-notarization-receipt.json",
  ];
  if (!includeFullPackage) {
    return standard;
  }
  return [
    ...standard,
    `One-Person-Lab-Full-${version}-mac-arm64.dmg`,
    ...(releaseHasAsset(releaseView, "opl-release-manifest.json")
      ? ["opl-release-manifest.json"]
      : [
          "full-package-manifest.json",
          "runtime-cache-events.json",
          "full-runtime-currentness-probe.json",
          "full-runtime-native-trust.json",
          "full-app-bundle-trim-report.json",
          "full-package-boundary-audit.json",
          "README-Full-First-Install.txt",
          "SHA256SUMS.txt",
          "full-local-authorization-policy.json",
        ]),
  ];
}

const forbiddenPublicAssetNames = new Set([
  "full-package-build-timing.json",
  "full-package-size-summary.json",
  "full-package-size-summary.md",
  "full-workflow-telemetry.json",
  "standard-release-notes-evidence.json",
  "full-release-notes-evidence.json",
]);

function assertNoForbiddenPublicAssets(releaseView) {
  const assets = Array.isArray(releaseView.assets) ? releaseView.assets : [];
  const found = assets
    .map((asset) => asset?.name)
    .filter((name) => forbiddenPublicAssetNames.has(name));
  if (found.length > 0) {
    throw new Error(
      `GitHub Release public assets include diagnostic-only files: ${found.join(", ")}. Keep release evidence, size summaries, and workflow telemetry in Actions artifacts or step summaries instead.`,
    );
  }
}

function assertReleaseNotesBody(releaseView, options) {
  if (
    !options.includeFullPackage ||
    options.version.includes("-nightly") ||
    releaseView.isPrerelease
  ) {
    return null;
  }
  const body = typeof releaseView.body === "string" ? releaseView.body : "";
  const required = [
    `One Person Lab v${options.version}`,
    "## Highlights",
    "## What improved",
    "## Compatibility and action required",
    "## Technical details",
    "## OPL agents and runtime payload",
    "Full first-install package includes",
    "Packaged component refs:",
    "Component updates since previous Stable:",
    "## OPL family updates",
    "## Install Stable",
    "## Release scope",
    "Full Changelog",
  ];
  const missing = required.filter((marker) => !body.includes(marker));
  if (missing.length > 0) {
    throw new Error(
      `Stable Full GitHub Release notes are incomplete; missing: ${missing.join(", ")}`,
    );
  }
  return {
    status: "passed",
    body_length: body.length,
  };
}

function normalizeDigest(digest) {
  if (typeof digest !== "string") {
    return "";
  }
  const match = digest.trim().match(/^sha256:(?<hash>[a-f0-9]{64})$/i);
  return match?.groups?.hash?.toLowerCase() || "";
}

function downloadAssets(options, names, downloadDir) {
  fs.mkdirSync(downloadDir, { recursive: true });
  if (options.noDownload) {
    return;
  }
  for (const name of names) {
    runCommand("gh", [
      "release",
      "download",
      options.tag,
      "--repo",
      options.repo,
      "--pattern",
      name,
      "--dir",
      downloadDir,
      "--clobber",
    ]);
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function readOptionalJson(downloadDir, name) {
  const filePath = path.join(downloadDir, name);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return readJson(filePath);
}

function readFullPublicReleaseManifest(downloadDir) {
  return readOptionalJson(downloadDir, "opl-release-manifest.json");
}

function readFullReleaseSection(downloadDir, sectionName, legacyName) {
  const releaseManifest = readFullPublicReleaseManifest(downloadDir);
  const section = releaseManifest?.evidence?.[sectionName] ?? releaseManifest?.[sectionName];
  if (section) {
    return section;
  }
  const legacy = readOptionalJson(downloadDir, legacyName);
  if (legacy) {
    return legacy;
  }
  throw new Error(
    `Full release manifest is missing ${sectionName}, and legacy asset ${legacyName} is absent.`,
  );
}

function readFullPackageManifest(downloadDir) {
  const releaseManifest = readFullPublicReleaseManifest(downloadDir);
  if (releaseManifest?.schema === "opl_public_release_manifest.v1") {
    return releaseManifest.manifest;
  }
  return readOptionalJson(downloadDir, "full-package-manifest.json");
}

function readFullLocalAuthorizationPolicy(downloadDir) {
  const releaseManifest = readFullPublicReleaseManifest(downloadDir);
  return (
    releaseManifest?.evidence?.local_authorization_policy ??
    readOptionalJson(downloadDir, "full-local-authorization-policy.json")
  );
}

function readFullGatekeeperLaunchPolicy(downloadDir) {
  const releaseManifest = readFullPublicReleaseManifest(downloadDir);
  return releaseManifest?.evidence?.gatekeeper_launch_policy ?? null;
}

function readFullAppleNotarizationReceipt(downloadDir) {
  const releaseManifest = readFullPublicReleaseManifest(downloadDir);
  return releaseManifest?.evidence?.apple_notarization_receipt ?? null;
}

function assertStandardMetadata(downloadDir, displayVersion, updaterVersion) {
  const expectedAssets = [
    `One-Person-Lab-${displayVersion}-mac-arm64.dmg`,
    `One-Person-Lab-${displayVersion}-mac-arm64.zip`,
  ];
  const metadataNames = ["latest-arm64-mac.yml"];
  const legacyMetadataPath = path.join(downloadDir, "latest-mac.yml");
  if (fs.existsSync(legacyMetadataPath)) {
    metadataNames.push("latest-mac.yml");
  }
  for (const name of metadataNames) {
    const metadataPath = path.join(downloadDir, name);
    const text = readText(metadataPath);
    if (/One[ .-]Person[ .-]Lab[ .-]Full-|One-Person-Lab-Full-|Full-/i.test(text)) {
      throw new Error(`${name} references Full first-install assets.`);
    }
    if (
      !new RegExp(
        `^version:\\s*['"]?${updaterVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]?\\s*$`,
        "m",
      ).test(text)
    ) {
      throw new Error(`${name} does not declare updater version ${updaterVersion}.`);
    }
    for (const expectedAsset of expectedAssets) {
      if (!text.includes(expectedAsset)) {
        throw new Error(`${name} does not reference ${expectedAsset}.`);
      }
    }
  }
}

function assertLocalAuthorizationPolicyObject(policy, packageKind, name) {
  assertLocalAuthorizationPolicy(policy, packageKind, name);
  return policy;
}

function readCodeSignature(filePath) {
  const result = runCapture("codesign", ["-dv", "--verbose=4", filePath]);
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  return {
    signature: output.match(/^Signature=(.+)$/m)?.[1]?.trim() || null,
    team_identifier: output.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim() || null,
    authorities: [...output.matchAll(/^Authority=(.+)$/gm)].map((match) => match[1].trim()),
  };
}

function findStandardAppBundle(rootDir) {
  const matches = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory()) {
      continue;
    }
    if (path.basename(current) === "One Person Lab.app") {
      matches.push(current);
      continue;
    }
    for (const entry of fs.readdirSync(current).sort().reverse()) {
      stack.push(path.join(current, entry));
    }
  }
  if (matches.length !== 1) {
    throw new Error(
      `standard updater ZIP must contain exactly one One Person Lab.app bundle; found ${matches.length}.`,
    );
  }
  return matches[0];
}

function decodeXmlText(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function readPlistStringValue(plistPath, key) {
  const plistBuddy = "/usr/libexec/PlistBuddy";
  if (fs.existsSync(plistBuddy)) {
    const result = runCapture(plistBuddy, ["-c", `Print :${key}`, plistPath]);
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  }
  const text = readText(plistPath);
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(
    new RegExp(`<key>\\s*${escapedKey}\\s*</key>\\s*<string>([^<]*)</string>`),
  );
  return match?.[1] ? decodeXmlText(match[1].trim()) : "";
}

function assertStandardUpdaterAppBundleTrust(downloadDir, displayVersion, updaterVersion, gatekeeperPolicy) {
  const zipName = `One-Person-Lab-${displayVersion}-mac-arm64.zip`;
  const zipPath = path.join(downloadDir, zipName);
  const unzipDir = fs.mkdtempSync(path.join(os.tmpdir(), "opl-standard-updater-app-"));
  try {
    runCommand("unzip", ["-q", zipPath, "-d", unzipDir], { capture: true });
    const appPath = findStandardAppBundle(unzipDir);
    const infoPlistPath = path.join(appPath, "Contents", "Info.plist");
    if (!fs.existsSync(infoPlistPath)) {
      throw new Error("standard updater ZIP App bundle is missing Contents/Info.plist.");
    }
    const shortVersion = readPlistStringValue(infoPlistPath, "CFBundleShortVersionString");
    const bundleVersion = readPlistStringValue(infoPlistPath, "CFBundleVersion");
    if (shortVersion !== updaterVersion || bundleVersion !== updaterVersion) {
      throw new Error(
        `standard updater ZIP App bundle version mismatch: expected updater version ${updaterVersion}, got CFBundleShortVersionString=${shortVersion || "(empty)"} CFBundleVersion=${bundleVersion || "(empty)"}.`,
      );
    }

    const codesignResult = runCapture("codesign", [
      "--verify",
      "--deep",
      "--strict",
      "--verbose=2",
      appPath,
    ]);
    const signature = readCodeSignature(appPath);
    const spctlResult = runCapture("spctl", [
      "--assess",
      "--type",
      "execute",
      "--verbose=4",
      appPath,
    ]);
    const codesignPassed = codesignResult.status === 0;
    const spctlPassed = spctlResult.status === 0;
    const hasDeveloperIdSignature = signature.team_identifier === gatekeeperPolicy.team_identifier
      && signature.authorities.some((authority) => authority.startsWith("Developer ID Application:"));
    if (!hasDeveloperIdSignature || !codesignPassed || !spctlPassed) {
      throw new Error([
        `Downloaded Standard updater App failed Developer ID/Gatekeeper verification: ${zipName}`,
        `team_identifier=${signature.team_identifier || "missing"}`,
        `codesign_status=${codesignResult.status}`,
        `spctl_status=${spctlResult.status}`,
        codesignResult.stderr || codesignResult.stdout || "",
        spctlResult.stderr || spctlResult.stdout || "",
      ].filter(Boolean).join("\n"));
    }
    return {
      status: "passed",
      asset: zipName,
      version: displayVersion,
      display_version: displayVersion,
      updater_version: updaterVersion,
      bundle_version: bundleVersion || null,
      short_version: shortVersion || null,
      signature: signature.signature,
      team_identifier: signature.team_identifier,
      authorities: signature.authorities,
      codesign_status: "passed",
      spctl_status: "passed",
      apple_developer_id_required: true,
      gatekeeper_required: true,
      gatekeeper_policy: "standard-gatekeeper-launch-policy.json",
    };
  } finally {
    fs.rmSync(unzipDir, { recursive: true, force: true });
  }
}

function assertStandardDistributionTrust(downloadDir, version, verifiedAssets) {
  const dmgName = `One-Person-Lab-${version}-mac-arm64.dmg`;
  const dmgAsset = verifiedAssets.find((asset) => asset.name === dmgName);
  if (!dmgAsset) throw new Error(`Verified assets are missing ${dmgName}.`);
  const policyPath = path.join(downloadDir, "standard-gatekeeper-launch-policy.json");
  const receiptPath = path.join(downloadDir, "standard-apple-notarization-receipt.json");
  const policy = assertGatekeeperLaunchPolicy(
    JSON.parse(readText(policyPath)),
    "app_standard",
    "standard-gatekeeper-launch-policy.json",
  );
  const receipt = assertAppleNotarizationReceipt(
    JSON.parse(readText(receiptPath)),
    "standard-apple-notarization-receipt.json",
  );
  if (
    policy.team_identifier !== receipt.team_identifier
    || policy.notarization_receipt_sha256 !== fileSha256(receiptPath)
    || receipt.final_stapled_dmg_sha256 !== dmgAsset.sha256
    || receipt.final_stapled_dmg_size_bytes !== dmgAsset.size
  ) {
    throw new Error(`Standard Developer ID/notarization evidence does not bind ${dmgName} downloaded bytes.`);
  }
  if (process.platform !== "darwin") {
    throw new Error("Standard public Developer ID/notarization verification requires a macOS runner.");
  }
  const dmgPath = path.join(downloadDir, dmgName);
  for (const [command, args] of [
    ["codesign", ["--verify", "--strict", "--verbose=2", dmgPath]],
    ["xcrun", ["stapler", "validate", dmgPath]],
    ["spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=4", dmgPath]],
  ]) {
    const result = runCapture(command, args);
    if (result.status !== 0) {
      throw new Error(`Downloaded Standard DMG failed ${command} validation: ${result.stderr || result.stdout || result.status}`);
    }
  }
  const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), "opl-standard-public-dmg-"));
  let mounted = false;
  try {
    const attach = runCapture("hdiutil", ["attach", dmgPath, "-nobrowse", "-readonly", "-mountpoint", mountPoint]);
    if (attach.status !== 0) throw new Error(`Downloaded Standard DMG could not be mounted: ${attach.stderr || attach.stdout}`);
    mounted = true;
    const appPath = path.join(mountPoint, "One Person Lab.app");
    if (!fs.existsSync(appPath)) throw new Error("Downloaded Standard DMG does not contain One Person Lab.app.");
    for (const [command, args] of [
      ["codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]],
      ["spctl", ["--assess", "--type", "execute", "--verbose=4", appPath]],
    ]) {
      const result = runCapture(command, args);
      if (result.status !== 0) {
        throw new Error(`Downloaded Standard App failed ${command} validation: ${result.stderr || result.stdout || result.status}`);
      }
    }
  } finally {
    if (mounted) runCapture("hdiutil", ["detach", mountPoint]);
    fs.rmSync(mountPoint, { recursive: true, force: true });
  }
  return policy;
}

function assertFullRuntimeNativeTrust(downloadDir, manifest, options = {}) {
  const trust = readFullReleaseSection(downloadDir, "runtime_native_trust", "full-runtime-native-trust.json");
  assertFullRuntimeNativeTrustObject(
    trust,
    manifest,
    options,
  );
  return trust;
}

function assertFullRuntimeCurrentnessProbe(downloadDir, manifest) {
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

function assertFullPackageOptimizationArtifacts(downloadDir, manifest) {
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
    "Contents/Resources/opl-full-runtime"
  ) {
    throw new Error(
      "Full app bundle trim report must identify Contents/Resources/opl-full-runtime as protected.",
    );
  }
  const protectedPayloads = trimReport.required_payload_boundary?.protected_payloads;
  for (const requiredPayload of [
    "Contents/Resources/opl-full-runtime",
    "Contents/Resources/bundled-aioncore",
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
  if (boundaryAudit.schema !== "opl_full_package_boundary_audit.v1") {
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
  if (boundaryAudit.full_package_boundary?.contains_shell_runtime !== true) {
    throw new Error(
      "Full package boundary audit must prove the Full package still contains the shell runtime.",
    );
  }
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

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function assertSafePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function parseSha256Sums(text) {
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

function readFullRuntimeUncompressedBytes(manifest) {
  const sizeBreakdown = assertPlainObject(manifest?.size_breakdown, "Full manifest size_breakdown");
  return assertSafePositiveInteger(
    sizeBreakdown.total_runtime_uncompressed_bytes,
    "Full manifest size_breakdown.total_runtime_uncompressed_bytes",
  );
}

function assertFullComponent(manifest, componentId) {
  const components = assertPlainObject(manifest.components, "Full manifest components");
  return assertPlainObject(components[componentId], `Full manifest components.${componentId}`);
}

function assertFullOptionalComponent(manifest, componentId) {
  const optionalComponents = assertPlainObject(
    manifest.optional_components,
    "Full manifest optional_components",
  );
  return assertPlainObject(
    optionalComponents[componentId],
    `Full manifest optional_components.${componentId}`,
  );
}

function assertFullSizeBudget(manifest, fullDmgAssetSize) {
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
  const codex = assertFullComponent(manifest, "codex");
  if (codex.required !== true || codex.role !== "default_agent_cli_offline_archive_wrapper") {
    throw new Error(
      "Full manifest components.codex must be a required default_agent_cli_offline_archive_wrapper component.",
    );
  }
  if (!String(codex.version || "").startsWith("codex-cli ")) {
    throw new Error(
      `Full manifest components.codex.version must record codex --version; got ${codex.version}`,
    );
  }
  if (codex.binary_path !== null) {
    throw new Error(
      `Full manifest components.codex.binary_path must be null for archive-only packaging; got ${codex.binary_path}`,
    );
  }
  if (codex.archive_path !== "runtime/current/vendor/codex/codex_cli_darwin_arm64.tar.gz") {
    throw new Error(
      `Full manifest components.codex.archive_path is unexpected: ${codex.archive_path}`,
    );
  }
  assertSafePositiveInteger(
    codex.archive_size_bytes,
    "Full manifest components.codex.archive_size_bytes",
  );

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

function assertFullAssets(downloadDir, version, verifiedAssets) {
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
  if (releaseManifest && fullDmgManifestAsset?.sha256 !== fullDmgAsset.sha256) {
    throw new Error(`Full release manifest sha256 mismatch for ${fullDmgName}.`);
  }
  return {
    ...assertFullSizeBudget(manifest, fullDmgAsset.size),
    package_optimization: optimizationArtifacts,
  };
}

function verifyDownloadedAssets(releaseView, options, names, downloadDir) {
  const assets = Array.isArray(releaseView.assets) ? releaseView.assets : [];
  const assetsByName = new Map(assets.map((asset) => [asset?.name, asset]));
  const verified = [];

  for (const name of names) {
    const asset = assetsByName.get(name);
    if (!asset) {
      throw new Error(`Remote release ${options.tag} is missing asset ${name}.`);
    }
    const filePath = path.join(downloadDir, name);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Downloaded release asset not found: ${filePath}`);
    }
    const stat = fs.statSync(filePath);
    if (Number(asset.size) !== stat.size) {
      throw new Error(
        `Remote asset size mismatch for ${name}: expected ${asset.size}, got ${stat.size}.`,
      );
    }
    const expectedDigest = normalizeDigest(asset.digest);
    const actualDigest = fileSha256(filePath);
    if (!expectedDigest) {
      throw new Error(`Remote asset ${name} does not expose a sha256 digest.`);
    }
    if (actualDigest !== expectedDigest) {
      throw new Error(
        `Remote asset sha256 mismatch for ${name}: expected ${expectedDigest}, got ${actualDigest}.`,
      );
    }
    verified.push({
      name,
      size: stat.size,
      sha256: actualDigest,
    });
  }

  assertStandardMetadata(downloadDir, options.version, options.updaterVersion);
  const standardGatekeeperPolicy = assertStandardDistributionTrust(
    downloadDir,
    options.version,
    verified,
  );
  const standardUpdaterAppBundleTrust = assertStandardUpdaterAppBundleTrust(
    downloadDir,
    options.version,
    options.updaterVersion,
    standardGatekeeperPolicy,
  );
  let fullFirstInstallBudget = null;
  if (options.includeFullPackage) {
    fullFirstInstallBudget = assertFullAssets(downloadDir, options.version, verified);
  }
  return {
    verified,
    standardUpdaterAppBundleTrust,
    fullFirstInstallBudget,
  };
}

function writeSummary(summaryPath, summary) {
  if (!summaryPath) {
    return;
  }
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const downloadDir =
    options.downloadDir || fs.mkdtempSync(path.join(os.tmpdir(), "opl-remote-release-"));
  const releaseView = readReleaseView(options.repo, options.tag);
  const names = requiredAssetNames(options.version, options.includeFullPackage, releaseView);

  if (releaseView.tagName && releaseView.tagName !== options.tag) {
    throw new Error(`Release tag mismatch: expected ${options.tag}, got ${releaseView.tagName}`);
  }
  assertNoForbiddenPublicAssets(releaseView);
  const releaseNotes = assertReleaseNotesBody(releaseView, options);

  downloadAssets(options, names, downloadDir);
  const verification = verifyDownloadedAssets(releaseView, options, names, downloadDir);
  const summary = {
    status: "passed",
    repo: options.repo,
    tag: options.tag,
    version: options.version,
    display_version: options.version,
    updater_version: options.updaterVersion,
    include_full_package: options.includeFullPackage,
    download_dir: options.keepDownload || options.noDownload ? downloadDir : null,
    verified_asset_count: verification.verified.length,
    verified_assets: verification.verified,
    standard_updater_app_bundle_trust: verification.standardUpdaterAppBundleTrust,
    ...(releaseNotes ? { release_notes: releaseNotes } : {}),
    ...(verification.fullFirstInstallBudget
      ? { full_first_install_budget: verification.fullFirstInstallBudget }
      : {}),
  };
  writeSummary(options.summaryPath, summary);
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
