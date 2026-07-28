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
  writeFile(receiptPath, `${JSON.stringify(appleNotarizationReceipt(outDir, dmgName), null, 2)}\n`);
  writeFile(
    path.join(outDir, "standard-gatekeeper-launch-policy.json"),
    `${JSON.stringify(gatekeeperLaunchPolicy("app_standard", fileSha256(receiptPath)), null, 2)}\n`,
  );
}

function defaultReleaseBody(tagName) {
  const version = tagName.startsWith("v") ? tagName.slice(1) : tagName;
  return [
    `One Person Lab v${version}`,
    "This Stable release is for users installing or upgrading One Person Lab App.",
    "## Highlights",
    "- Use one Stable install path for the App plus refreshed research tools.",
    "## Technical details",
    "## OPL agents and runtime payload",
    "- Full first-install package includes the OPL Framework runtime, Codex CLI, MAS, MAG, RCA, OPL Meta Agent, OfficeCLI, MinerU, and packaged Codex skills.",
    "- Packaged component refs: MAS @ 1234567.",
    "- Component updates since previous Stable: MAS 0000000 -> 1234567.",
    `**Full Changelog**: https://github.com/gaofeng21cn/one-person-lab-app/compare/v26.0.0...v${version}`,
  ].join("\n\n");
}

export function buildRemoteReleaseView(
  assetDir,
  names,
  tagName,
  body = defaultReleaseBody(tagName),
) {
  return {
    tagName,
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
  return [
    `One-Person-Lab-${version}-mac-arm64.dmg`,
    `One-Person-Lab-${version}-mac-arm64.zip`,
    `One-Person-Lab-${version}-mac-arm64.zip.blockmap`,
    "latest-arm64-mac.yml",
    "opl-install.sh",
    "opl-app-installer.sh",
    "standard-gatekeeper-launch-policy.json",
    "standard-apple-notarization-receipt.json",
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
  writeExecutable(path.join(outDir, "opl-app-installer.sh"), "#!/usr/bin/env bash\nexit 0\n");
  writeStandardDistributionTrust(outDir, version);
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
  if (options.legacyMetadata) {
    writeFile(path.join(outDir, "latest-mac.yml"), metadata);
  }
  return names;
}

export function writeFullRemoteAssets(outDir, version) {
  const fullDmgName = `One-Person-Lab-Full-${version}-mac-arm64.dmg`;
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
    schema: "opl_full_package_boundary_audit.v1",
    package_kind: "opl_full_first_install_macos_arm64",
    version,
    standard_app_boundary: { standard_package_allowed_to_contain_full_runtime: false },
    full_package_boundary: {
      contains_opl_full_runtime: true,
      contains_shell_runtime: true,
      dedupe_policy: "audit_only_without_same_cohort_full_clean_vm_evidence",
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
        codex: {
          source_path: "/tmp/codex",
          version: "codex-cli 0.137.0",
          size_bytes: 801,
          role: "default_agent_cli_offline_archive_wrapper",
          required: true,
          binary_path: null,
          archive_path: "runtime/current/vendor/codex/codex_cli_darwin_arm64.tar.gz",
          archive_size_bytes: 83978603,
        },
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
            sha256: fileSha256(path.join(outDir, fullDmgName)),
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
