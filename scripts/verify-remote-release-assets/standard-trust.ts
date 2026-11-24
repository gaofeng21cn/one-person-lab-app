import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertAppleNotarizationReceipt, assertGatekeeperLaunchPolicy } from "../macos-gatekeeper-policy.ts";
import { runCommand } from "../release-cleanup-helpers.ts";
import { parseMacosCodeSignatureOutput } from "../macos-code-signature.ts";
import {
  readText,
  runCapture,
  standardPayloadAssetNames,
} from "./release-assets.ts";

export function assertStandardMetadata(downloadDir, displayVersion, updaterVersion) {
  const expectedAssets = [
    `One-Person-Lab-${displayVersion}-mac-arm64.dmg`,
    `One-Person-Lab-${displayVersion}-mac-arm64.zip`,
  ];
  const metadataNames = displayVersion === "26.8.8"
    ? ["latest-arm64-mac.yml"]
    : ["latest-mac.yml", "latest-arm64-mac.yml"];
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
  if (
    metadataNames.length === 2
    && !fs.readFileSync(path.join(downloadDir, metadataNames[0])).equals(
      fs.readFileSync(path.join(downloadDir, metadataNames[1])),
    )
  ) {
    throw new Error("latest-mac.yml and latest-arm64-mac.yml must be byte-identical.");
  }
}

function readCodeSignature(filePath) {
  const result = runCapture("codesign", ["-dv", "--verbose=4", filePath]);
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  return parseMacosCodeSignatureOutput(output);
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

export function assertStandardUpdaterAppBundleTrust(downloadDir, displayVersion, updaterVersion, gatekeeperPolicy) {
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
      signature_kind: signature.signature_kind,
      team_identifier: signature.team_identifier,
      authorities: signature.authorities,
      codesign_status: "passed",
      spctl_status: "passed",
      apple_developer_id_required: true,
      gatekeeper_required: true,
      gatekeeper_policy: "opl-release-attestation.json#standard_trust.gatekeeper_launch_policy",
    };
  } finally {
    fs.rmSync(unzipDir, { recursive: true, force: true });
  }
}

export function assertStandardDistributionTrust(downloadDir, options, verifiedAssets) {
  const { repo, tag, version } = options;
  const dmgName = `One-Person-Lab-${version}-mac-arm64.dmg`;
  const dmgAsset = verifiedAssets.find((asset) => asset.name === dmgName);
  if (!dmgAsset) throw new Error(`Verified assets are missing ${dmgName}.`);
  const attestation = JSON.parse(readText(path.join(downloadDir, "opl-release-attestation.json")));
  const standardAssets = verifiedAssets
    .filter((asset) => standardPayloadAssetNames(version).includes(asset.name))
    .map((asset) => ({ name: asset.name, digest: `sha256:${asset.sha256}`, size_bytes: asset.size }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const attestedAssets = attestation.publication_record?.publication_intent?.payload_assets;
  const componentAsset = verifiedAssets.find((asset) => asset.name === "opl-app-component-manifest.json");
  if (
    attestation.schema !== "opl_app_release_attestation.v1"
    || attestation.status !== "passed"
    || attestation.release?.repository !== repo
    || attestation.release?.tag !== tag
    || attestation.release?.version !== version
    || !/^sha256:[0-9a-f]{64}$/.test(attestation.release?.bundle_digest ?? "")
    || attestation.protection?.github_native_immutable !== false
    || attestation.protection?.retroactive_lock_claimed !== false
    || !(attestation.protection?.standard_asset_policy === "sealed_name_size_digest_set_no_overwrite_or_delete"
      || (attestation.protection?.standard_asset_policy === "qualified_same_tag_compare_and_swap"
        && attestation.publication_record?.schema === "opl_app_same_tag_replacement_publication_record.v1"
        && attestation.same_tag_replacement?.schema === "opl_app_same_tag_replacement.v1"
        && /^sha256:[0-9a-f]{64}$/.test(attestation.same_tag_replacement?.qualification_receipt_sha256 ?? '')))
    || JSON.stringify(attestation.superseded_public_assets) !== JSON.stringify([
      "stable-operation-publication-record.json",
      "standard-apple-notarization-receipt.json",
      "standard-gatekeeper-launch-policy.json",
    ])
    || !Array.isArray(attestedAssets)
    || JSON.stringify(attestedAssets.map((asset) => ({
      name: asset?.name,
      digest: asset?.digest,
      size_bytes: asset?.size_bytes,
    })).sort((left, right) => String(left.name).localeCompare(String(right.name)))) !== JSON.stringify(standardAssets)
    || !componentAsset
    || attestation.component_manifest?.name !== componentAsset.name
    || attestation.component_manifest?.sha256 !== `sha256:${componentAsset.sha256}`
    || attestation.component_manifest?.size_bytes !== componentAsset.size
  ) {
    throw new Error("Unified Standard attestation does not bind the exact mutable Release and sealed Standard asset set.");
  }
  const policy = assertGatekeeperLaunchPolicy(
    attestation.standard_trust?.gatekeeper_launch_policy,
    "app_standard",
    "opl-release-attestation.json#standard_trust.gatekeeper_launch_policy",
  );
  const receipt = assertAppleNotarizationReceipt(
    attestation.standard_trust?.apple_notarization_receipt,
    "opl-release-attestation.json#standard_trust.apple_notarization_receipt",
  );
  if (
    policy.team_identifier !== receipt.team_identifier
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
