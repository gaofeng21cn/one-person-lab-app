import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertLocalAuthorizationPolicy } from "../local-authorization-policy.ts";
import { runCommand } from "../release-cleanup-helpers.ts";

export function runCapture(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: process.env,
  });
}

export function readReleaseView(repo, tag) {
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

export function standardPayloadAssetNames(version) {
  const metadataNames = version === "26.8.8"
    ? ["latest-arm64-mac.yml"]
    : ["latest-mac.yml", "latest-arm64-mac.yml"];
  return [
    `One-Person-Lab-${version}-mac-arm64.dmg`,
    `One-Person-Lab-${version}-mac-arm64.zip`,
    `One-Person-Lab-${version}-mac-arm64.zip.blockmap`,
    ...metadataNames,
    "opl-install.sh",
    "opl-app-component-manifest.json",
  ];
}

export function requiredAssetNames(version, includeFullPackage, isPrerelease) {
  const standard = [
    ...standardPayloadAssetNames(version),
    "opl-release-attestation.json",
    ...(isPrerelease ? [] : ["install-docker-webui.sh", "install-docker-webui.ps1"]),
  ];
  if (!includeFullPackage) {
    return standard;
  }
  return [
    ...standard,
    `One-Person-Lab-Full-${version}-mac-arm64.dmg`,
    "opl-release-manifest.json",
  ];
}

const forbiddenPublicAssetNames = new Set([
  "full-package-build-timing.json",
  "full-package-size-summary.json",
  "full-package-size-summary.md",
  "full-workflow-telemetry.json",
  "standard-release-notes-evidence.json",
  "full-release-notes-evidence.json",
  "opl-app-installer.sh",
  "stable-operation-publication-record.json",
  "standard-gatekeeper-launch-policy.json",
  "standard-apple-notarization-receipt.json",
]);

export function assertNoForbiddenPublicAssets(releaseView) {
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

export function assertExactPublicAssetSet(releaseView, requiredNames) {
  const assets = Array.isArray(releaseView.assets) ? releaseView.assets : [];
  const actualNames = assets.map((asset) => asset?.name).filter(Boolean);
  const actualSet = new Set(actualNames);
  const requiredSet = new Set(requiredNames);
  if (actualNames.length !== actualSet.size) {
    throw new Error("GitHub Release public assets contain duplicate names.");
  }
  const missing = requiredNames.filter((name) => !actualSet.has(name));
  const unexpected = actualNames.filter((name) => !requiredSet.has(name));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `GitHub Release public asset set is not exact; missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}.`,
    );
  }
}

export function assertReleaseNotesBody(releaseView, options) {
  if (
    !options.includeFullPackage ||
    options.version.includes("-nightly") ||
    releaseView.isPrerelease
  ) {
    return null;
  }
  const body = typeof releaseView.body === "string" ? releaseView.body : "";
  const releaseName = typeof releaseView.name === "string"
    ? releaseView.name
    : `One Person Lab v${options.version}`;
  const firstVisibleLine = body
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0)
    ?.trim() || "";
  if (firstVisibleLine === releaseName || firstVisibleLine === `# ${releaseName}`) {
    throw new Error("Stable GitHub Release body repeats the GitHub Release name as its visible title.");
  }
  const required = [
    "## Highlights",
    "## What improved",
    "## Compatibility and action required",
    "## Technical details",
    "## OPL agents and runtime payload",
    "## OPL family updates",
    "## Install Stable",
    "## Release scope",
    "Full DMG",
    "same Stable release",
    "Full Changelog",
  ];
  const missing = required.filter((marker) => !body.includes(marker));
  if (missing.length > 0) {
    throw new Error(
      `Stable GitHub Release notes are incomplete; missing: ${missing.join(", ")}`,
    );
  }
  return {
    status: "passed",
    body_length: body.length,
  };
}

export function normalizeDigest(digest) {
  if (typeof digest !== "string") {
    return "";
  }
  const match = digest.trim().match(/^sha256:(?<hash>[a-f0-9]{64})$/i);
  return match?.groups?.hash?.toLowerCase() || "";
}

export function downloadAssets(options, names, downloadDir) {
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

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

export function readOptionalJson(downloadDir, name) {
  const filePath = path.join(downloadDir, name);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return readJson(filePath);
}

export function readFullPublicReleaseManifest(downloadDir) {
  return readOptionalJson(downloadDir, "opl-release-manifest.json");
}

export function readFullReleaseSection(downloadDir, sectionName, legacyName) {
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

export function readFullPackageManifest(downloadDir) {
  const releaseManifest = readFullPublicReleaseManifest(downloadDir);
  if (releaseManifest?.schema === "opl_public_release_manifest.v1") {
    return releaseManifest.manifest;
  }
  return readOptionalJson(downloadDir, "full-package-manifest.json");
}

export function readFullLocalAuthorizationPolicy(downloadDir) {
  const releaseManifest = readFullPublicReleaseManifest(downloadDir);
  return (
    releaseManifest?.evidence?.local_authorization_policy ??
    readOptionalJson(downloadDir, "full-local-authorization-policy.json")
  );
}

export function readFullGatekeeperLaunchPolicy(downloadDir) {
  const releaseManifest = readFullPublicReleaseManifest(downloadDir);
  return releaseManifest?.evidence?.gatekeeper_launch_policy ?? null;
}

export function readFullAppleNotarizationReceipt(downloadDir) {
  const releaseManifest = readFullPublicReleaseManifest(downloadDir);
  return releaseManifest?.evidence?.apple_notarization_receipt ?? null;
}

export function assertLocalAuthorizationPolicyObject(policy, packageKind, name) {
  assertLocalAuthorizationPolicy(policy, packageKind, name);
  return policy;
}
