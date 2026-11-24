#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileSha256 } from "./release-file-helpers.ts";
import {
  assertExactPublicAssetSet,
  assertNoForbiddenPublicAssets,
  assertReleaseNotesBody,
  downloadAssets,
  normalizeDigest,
  readReleaseView,
  requiredAssetNames,
} from "./verify-remote-release-assets/release-assets.ts";
import {
  assertStandardDistributionTrust,
  assertStandardMetadata,
  assertStandardUpdaterAppBundleTrust,
} from "./verify-remote-release-assets/standard-trust.ts";
import { assertFullAssets } from "./verify-remote-release-assets/full-trust.ts";

export function parseArgs(argv) {
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

export function verifyDownloadedAssets(releaseView, options, names, downloadDir) {
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
    { ...options, isPrerelease: releaseView.isPrerelease === true },
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

export function writeSummary(summaryPath, summary) {
  if (!summaryPath) {
    return;
  }
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

export function main() {
  const options = parseArgs(process.argv.slice(2));
  const downloadDir =
    options.downloadDir || fs.mkdtempSync(path.join(os.tmpdir(), "opl-remote-release-"));
  const releaseView = readReleaseView(options.repo, options.tag);
  const names = requiredAssetNames(
    options.version,
    options.includeFullPackage,
    releaseView.isPrerelease === true,
  );

  if (releaseView.tagName && releaseView.tagName !== options.tag) {
    throw new Error(`Release tag mismatch: expected ${options.tag}, got ${releaseView.tagName}`);
  }
  assertNoForbiddenPublicAssets(releaseView);
  assertExactPublicAssetSet(releaseView, names);
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

export function isMain() {
  return process.argv[1]
    ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
    : false;
}

if (isMain()) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
