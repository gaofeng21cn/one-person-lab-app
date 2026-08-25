import { fileSha256, fs, os, path, sha256, spawnSync, writeExecutable, writeFile } from "./helpers-core.ts";
import { buildFullPackageManifest } from "../../../scripts/full-first-install-package.ts";
import { withFullPackageOptimization } from "../../../scripts/build-full-first-install-package/package-optimization.ts";

const FULL_BUNDLED_EVIDENCE_ASSET_NAMES = [
  "full-package-manifest.json",
  "runtime-cache-events.json",
  "full-runtime-currentness-probe.json",
  "full-runtime-native-trust.json",
  "full-app-bundle-trim-report.json",
  "full-package-boundary-audit.json",
];

export function writeReleaseMetadata(outDir, version, assetName) {
  writeFile(
    path.join(outDir, "latest-arm64-mac.yml"),
    [
      `version: ${version}`,
      "files:",
      `  - url: ${assetName}`,
      "    sha512: test",
      "    size: 1",
      `path: ${assetName}`,
      "sha512: test",
      "",
    ].join("\n"),
  );
}

export function localAuthorizationPolicy(packageKind) {
  return `${JSON.stringify(
    {
      schema: "opl_local_authorized_macos_policy.v1",
      package_kind: packageKind,
      release_install_path: "local_authorized_unsigned",
      apple_developer_id_required: false,
      gatekeeper_required: false,
      local_authorization_required: true,
      quarantine_removal_required: true,
      install_entrypoint: "install.sh --stable-macos-install --yes",
      compatibility_entrypoints: [],
      default_package_profile: packageKind === "app_full_first_install" ? "full" : "standard",
      user_prompt_policy:
        "one_terminal_command_no_system_settings_override_expected_after_quarantine_clear",
      app_path: "/Applications/One Person Lab.app",
      codesign_status: "passed",
      spctl_status: "rejected_allowed_unsigned",
      quarantine_status: "absent",
      quarantine_attribute_count: 0,
    },
    null,
    2,
  )}\n`;
}

export function writeStandardLocalAuthorizationPolicy(outDir) {
  writeFile(
    path.join(outDir, "standard-local-authorization-policy.json"),
    localAuthorizationPolicy("app_standard"),
  );
}

function appleNotarizationReceipt(outDir, artifactName) {
  const artifactPath = path.join(outDir, artifactName);
  return {
    schema: "opl_apple_notarized_dmg_receipt.v1",
    status: "passed",
    artifact: artifactName,
    team_identifier: "TESTTEAMID",
    signing_identity: "Developer ID Application: Test (TESTTEAMID)",
    credential_mode: "test_fixture",
    notarization: {
      id: "00000000-0000-0000-0000-000000000001",
      status: "Accepted",
    },
    stapler_validate_status: "passed",
    dmg_spctl_status: "passed",
    app_spctl_status: "passed",
    final_stapled_dmg_sha256: fileSha256(artifactPath),
    final_stapled_dmg_size_bytes: fs.statSync(artifactPath).size,
  };
}

function gatekeeperLaunchPolicy(packageKind, notarizationReceiptSha256, nativeTrust = null) {
  return {
    schema: "opl_gatekeeper_launch_policy.v1",
    package_kind: packageKind,
    distribution_mode: "developer_id_notarized",
    app_path: "/Applications/One Person Lab.app",
    team_identifier: "TESTTEAMID",
    codesign_status: "passed",
    spctl_status: "passed",
    dmg_codesign_status: "passed",
    dmg_spctl_status: "passed",
    stapler_validate_status: "passed",
    notarization_status: "Accepted",
    notarization_receipt_sha256: notarizationReceiptSha256,
    ...(nativeTrust
      ? {
          runtime_native_trust_status: nativeTrust.status,
          runtime_native_executable_count: nativeTrust.executable_count,
        }
      : {}),
    local_authorization_required: false,
    quarantine_removal_required: false,
  };
}

export function writeStandardDistributionTrust(outDir, version) {
  const dmgName = `One-Person-Lab-${version}-mac-arm64.dmg`;
  const receiptPath = path.join(outDir, "standard-apple-notarization-receipt.json");
  const receipt = appleNotarizationReceipt(outDir, dmgName);
  writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  const policy = gatekeeperLaunchPolicy("app_standard", fileSha256(receiptPath));
  writeFile(
    path.join(outDir, "standard-gatekeeper-launch-policy.json"),
    `${JSON.stringify(policy, null, 2)}\n`,
  );
  return { policy, receipt };
}

function defaultReleaseBody(tagName) {
  const version = tagName.startsWith("v") ? tagName.slice(1) : tagName;
  return [
    "This Stable release is for users installing or upgrading One Person Lab App.",
    "## Highlights",
    "- Use one Stable install path for the App plus refreshed research tools.",
    "## What improved",
    "- Refreshed research tools.",
    "## Compatibility and action required",
    "- The Full DMG is appended later to this same Stable release for fresh-machine installation with bundled runtime, Office, and document-intake payloads.",
    "## Technical details",
    "## OPL agents and runtime payload",
    "- Standard notes remain frozen while the same-tag Full manifest carries Full payload details.",
    "## OPL family updates",
    "- Updated OPL family tools.",
    "## Install Stable",
    "`brew install --cask gaofeng21cn/one-person-lab/one-person-lab`",
    "## Release scope",
    "- Standard macOS arm64 updater package plus same-tag Full DMG add-on.",
    `**Full Changelog**: https://github.com/gaofeng21cn/one-person-lab-app/compare/v26.0.0...v${version}`,
  ].join("\n\n");
}

export function buildRemoteReleaseView(
  assetDir,
  names,
  tagName,
  body = defaultReleaseBody(tagName),
) {
  const version = tagName.startsWith("v") ? tagName.slice(1) : tagName;
  return {
    tagName,
    name: `One Person Lab v${version}`,
    isDraft: false,
    isPrerelease: false,
    body,
    assets: names.map((name) => {
      const filePath = path.join(assetDir, name);
      return {
        name,
        size: fs.statSync(filePath).size,
        digest: `sha256:${fileSha256(filePath)}`,
      };
    }),
  };
}

export function standardRemoteAssetNames(version) {
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
    "opl-release-attestation.json",
    "install-docker-webui.sh",
    "install-docker-webui.ps1",
  ];
}

function writeMinimalMacosAppBundle(appRoot, version) {
  const contentsDir = path.join(appRoot, "Contents");
  const macosDir = path.join(contentsDir, "MacOS");
  writeFile(
    path.join(contentsDir, "Info.plist"),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      "<dict>",
      "  <key>CFBundleExecutable</key>",
      "  <string>One Person Lab</string>",
      "  <key>CFBundleIdentifier</key>",
      "  <string>com.onepersonlab.app</string>",
      "  <key>CFBundleShortVersionString</key>",
      `  <string>${version}</string>`,
      "  <key>CFBundleVersion</key>",
      `  <string>${version}</string>`,
      "</dict>",
      "</plist>",
      "",
    ].join("\n"),
  );
  writeExecutable(path.join(macosDir, "One Person Lab"), "#!/usr/bin/env bash\nexit 0\n");
}

function writeStandardUpdaterZip(zipPath, version) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-standard-updater-zip-"));
  try {
    writeMinimalMacosAppBundle(path.join(tempRoot, "One Person Lab.app"), version);
    const result = spawnSync("zip", ["-qry", zipPath, "One Person Lab.app"], {
      cwd: tempRoot,
      encoding: "utf8",
      stdio: "pipe",
    });
    if (result.status !== 0) {
      throw new Error(`zip failed: ${result.stderr || result.stdout}`);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function writeStandardRemoteAssets(outDir, version, options = {}) {
  const updaterVersion = options.updaterVersion ?? version;
  const names = standardRemoteAssetNames(version);
  const dmgName = `One-Person-Lab-${version}-mac-arm64.dmg`;
  const zipName = `One-Person-Lab-${version}-mac-arm64.zip`;
  writeFile(path.join(outDir, dmgName), "standard-dmg");
  writeStandardUpdaterZip(path.join(outDir, zipName), updaterVersion);
  writeFile(path.join(outDir, `${zipName}.blockmap`), "standard-zip-blockmap");
  writeExecutable(path.join(outDir, "opl-install.sh"), "#!/usr/bin/env bash\nexit 0\n");
  writeExecutable(path.join(outDir, "install-docker-webui.sh"), "#!/usr/bin/env bash\nexit 0\n");
  writeFile(path.join(outDir, "install-docker-webui.ps1"), "exit 0\n");
  const componentManifestPath = path.join(outDir, "opl-app-component-manifest.json");
  writeFile(componentManifestPath, `${JSON.stringify({ surface_kind: "opl_app_component_manifest.v1" })}\n`);
  const trust = writeStandardDistributionTrust(outDir, version);
  const metadata = [
    `version: ${updaterVersion}`,
    "files:",
    `  - url: ${dmgName}`,
    "    sha512: test-dmg",
    "    size: 12",
    `  - url: ${zipName}`,
    "    sha512: test-zip",
    "    size: 12",
    `path: ${dmgName}`,
    "sha512: test-dmg",
    ...(options.fullLeak ? [`notes: One-Person-Lab-Full-${version}-mac-arm64.dmg`] : []),
    "",
  ].join("\n");
  writeFile(path.join(outDir, "latest-arm64-mac.yml"), metadata);
  if (names.includes("latest-mac.yml")) {
    writeFile(path.join(outDir, "latest-mac.yml"), metadata);
  }
  const payloadNames = names.filter((name) => ![
    "opl-release-attestation.json",
    "install-docker-webui.sh",
    "install-docker-webui.ps1",
  ].includes(name));
  const payloadAssets = payloadNames.map((name) => ({
    name,
    digest: `sha256:${fileSha256(path.join(outDir, name))}`,
    size_bytes: fs.statSync(path.join(outDir, name)).size,
  }));
  const componentIdentity = payloadAssets.find((asset) => asset.name === "opl-app-component-manifest.json");
  writeFile(
    path.join(outDir, "opl-release-attestation.json"),
    `${JSON.stringify({
      schema: "opl_app_release_attestation.v1",
      status: "passed",
      release: {
        repository: "gaofeng21cn/one-person-lab-app",
        tag: `v${version}`,
        version,
        bundle_digest: `sha256:${"a".repeat(64)}`,
      },
      publication_record: { publication_intent: { payload_assets: payloadAssets } },
      standard_trust: {
        gatekeeper_launch_policy: trust.policy,
        apple_notarization_receipt: trust.receipt,
      },
      component_manifest: {
        name: componentIdentity.name,
        sha256: componentIdentity.digest,
        size_bytes: componentIdentity.size_bytes,
      },
      protection: {
        github_native_immutable: false,
        retroactive_lock_claimed: false,
        standard_asset_policy: "sealed_name_size_digest_set_no_overwrite_or_delete",
        full_binding: "full_manifest_binds_this_attestation_and_exact_full_assets",
      },
      superseded_public_assets: [
        "stable-operation-publication-record.json",
        "standard-apple-notarization-receipt.json",
        "standard-gatekeeper-launch-policy.json",
      ],
    }, null, 2)}\n`,
  );
  return names;
}

export function writeFullRemoteAssets(outDir, version) {
  const fullDmgName = `One-Person-Lab-Full-${version}-mac-arm64.dmg`;
  const forbiddenFrameworkCodexPaths = [
    "bin/codex",
    "bin/rg",
    "vendor/codex",
    ".runtime-cache/codex-cli",
  ];
  const protectedPayloads = [
    "Contents/Resources/opl-full-runtime",
    "Contents/Resources/bundled-aioncore",
    "Contents/Resources/app.asar",
    "Contents/Frameworks/Electron Framework.framework",
  ];
  const trimReport = {
    schema: "opl_full_app_bundle_trim_report.v1",
    mode: "explicit_non_runtime_prune_only",
    before_bytes: 1024,
    after_bytes: 960,
    bytes_removed: 64,
    removed_count: 2,
    required_payload_boundary: {
      full_runtime_resource_dir: protectedPayloads[0],
      protected_payloads: protectedPayloads,
      preserved: true,
      rule: "never trim the declared Full offline runtime payload from the App bundle staging pass",
    },
  };
  const boundaryAudit = {
    schema: "opl_full_package_boundary_audit.v2",
    package_kind: "opl_full_first_install_macos_arm64",
    version,
    standard_app_boundary: { standard_package_allowed_to_contain_full_runtime: false },
    full_package_boundary: {
      contains_opl_full_runtime: true,
      contains_shell_runtime: true,
      aioncore_codex_carrier_present: true,
      aioncore_codex_only_projection_present: true,
      aioncore_claude_payload_absent: true,
      aioncore_codex_only_projection_audit: {
        schema: "opl_aioncore_codex_only_projection_audit.v1",
        runtime_count: 1,
        runtimes: [{
          runtime_key: "darwin-arm64",
          manifest_path:
            "Contents/Resources/bundled-aioncore/darwin-arm64/managed-resources/manifest.json",
          projection_valid: true,
          cli_names: ["codex"],
          producer_manifest_sha256: "a".repeat(64),
        }],
        required_absence_checks: [
          "managed_claude_subtree",
          "claude_executable_or_symlink",
          "anthropic_package_or_archive",
          "claude_distribution_cache_entry",
          "raw_producer_manifest",
        ].map((id) => ({
          id,
          matches: [],
          expected_match_count: 0,
          match_count: 0,
        })),
        projection_present: true,
        claude_payload_absent: true,
      },
      framework_codex_payload_absent: true,
      forbidden_framework_codex_paths: forbiddenFrameworkCodexPaths.map((relativePath) => ({
        path: relativePath,
        exists: false,
      })),
      dedupe_policy: "aioncore_is_the_only_codex_carrier_in_the_aionui_app_bundle",
    },
    entries: {
      opl_full_runtime: {
        path: protectedPayloads[0],
        owner: "gaofeng21cn/one-person-lab",
        exists: true,
        size_bytes: 128,
      },
      aionui_bundled_runtime: {
        path: protectedPayloads[1],
        owner: "active_shell",
        exists: true,
        size_bytes: 256,
      },
      app_asar: { path: protectedPayloads[2], owner: "active_shell", exists: true, size_bytes: 64 },
      electron_framework: {
        path: protectedPayloads[3],
        owner: "active_shell/electron",
        exists: true,
        size_bytes: 512,
      },
    },
  };
  const nativeTrust = {
    schema: "opl_full_runtime_native_trust.v1",
    status: "passed",
    executable_count: 1,
    executables: [
      {
        relative_path: "runtime/current/node/bin/node",
        assessment_kind: "launched_executable",
        codesign_status: "passed",
        spctl_status: "passed",
        team_identifier: "TESTTEAMID",
        signature: "Developer ID Application: Test",
        signature_kind: "developer_id_application",
        trusted_timestamp: true,
        hardened_runtime: true,
        quarantine_status: "absent",
        provenance_status: "absent",
      },
    ],
  };
  const manifest = withFullPackageOptimization(
    buildFullPackageManifest({
      version,
      runtimeAssertions: {
        temporal_core_bridge_releases: ["aarch64-apple-darwin"],
        excluded_module_venv_count: 0,
        declared_pruned_paths: forbiddenFrameworkCodexPaths.map((relativePath) => ({
          path: relativePath,
          expected: "absent",
          present: false,
        })),
      },
      nativeTrust,
      sizeBreakdown: {
        total_runtime_uncompressed_bytes: 128,
        layers: {
          toolchain: { size_bytes: 64 },
          "domain-runtime": { size_bytes: 32 },
          "opl-runtime": { size_bytes: 24 },
          skills: { size_bytes: 8 },
        },
      },
      components: {
        temporal_cli: {
          source_path: "/tmp/temporal",
          version: "temporal version 1.7.0",
          size_bytes: 801,
          role: "temporal_cli_offline_archive_wrapper",
          required: true,
          binary_path: null,
          archive_path: "runtime/current/vendor/temporal/temporal_cli_darwin_arm64.tar.gz",
          archive_size_bytes: 114835528,
        },
      },
      optionalComponents: {
        bun: {
          source_path: null,
          version: null,
          size_bytes: 0,
          role: "optional_bun_cli_runtime_payload",
          required: false,
          status: "not_packaged",
        },
      },
    }),
    { trimReport, boundaryAudit },
  );
  const runtimeCacheEvents = {
    mode: "readwrite",
    dir: "/tmp/opl-full-runtime-cache-test",
    events: [
      {
        layer_id: "toolchain",
        key: "full-runtime-v2-toolchain-test",
        status: "hit",
        read_archive: true,
        write_archive: false,
        build_layer: false,
      },
    ],
  };
  const runtimeCurrentnessProbe = {
    schema: "opl_full_runtime_currentness_probe.v1",
    status: "passed",
    framework_commit: "a".repeat(40),
    managed_update_surface_id: "opl_managed_updater_kernel",
    managed_update_components: ["opl_app", "opl_base", "opl_packages"],
    managed_update_component_providers: {
      opl_app: "installation_carrier",
      opl_base: "runtime_substrate",
      opl_packages: "capability_packages",
    },
    app_state_schema_version: "opl_app_state.v1",
    app_state_surface_ref: "app_state.runtime_source_carriers",
    app_state_runtime_source_carrier_count: 5,
    app_state_module_count: 5,
  };
  const readme = "One Person Lab Full First-Install Package\n";
  writeFile(path.join(outDir, fullDmgName), "full-dmg");
  const notarizationReceipt = appleNotarizationReceipt(outDir, fullDmgName);
  const notarizationReceiptText = `${JSON.stringify(notarizationReceipt, null, 2)}\n`;
  const notarizationReceiptSha256 = sha256(notarizationReceiptText);
  writeFile(
    path.join(outDir, "opl-release-manifest.json"),
    `${JSON.stringify(
      {
        schema: "opl_public_release_manifest.v1",
        package_kind: "opl_full_first_install_macos_arm64",
        version,
        primary_install_asset: fullDmgName,
        assets: [
          {
            name: fullDmgName,
            role: "full_first_install_carrier",
            size_bytes: fs.statSync(path.join(outDir, fullDmgName)).size,
            sha256: `sha256:${fileSha256(path.join(outDir, fullDmgName))}`,
          },
        ],
        manifest,
        evidence: {
          runtime_cache_events: runtimeCacheEvents,
          runtime_currentness_probe: runtimeCurrentnessProbe,
          runtime_native_trust: nativeTrust,
          app_bundle_trim_report: trimReport,
          package_boundary_audit: boundaryAudit,
          gatekeeper_launch_policy: gatekeeperLaunchPolicy(
            "app_full_first_install",
            notarizationReceiptSha256,
            nativeTrust,
          ),
          apple_notarization_receipt: notarizationReceipt,
          local_authorization_policy: null,
          readme_text: readme,
        },
        transition_legacy_assets: FULL_BUNDLED_EVIDENCE_ASSET_NAMES,
      },
      null,
      2,
    )}\n`,
  );
  return [fullDmgName, "opl-release-manifest.json"];
}
