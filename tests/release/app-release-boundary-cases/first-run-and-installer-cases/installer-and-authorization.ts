import {
  assert,
  fs,
  os,
  path,
  test,
  appRoot,
  runNode,
  writeExecutable,
  writeFile,
  spawnSync,
  createHash,
  validateFirstRunMatrix,
  validateReleaseChannelContract,
  syncAppProductProfileToShell,
  releaseBoundaryChecks,
  readJson,
  requireReleaseBoundaryCheck,
} from "./fixtures.ts";

const installerScenarioGroup = process.env.OPL_INSTALLER_SCENARIO_GROUP;
const isInstallerScenarioGroup = (group: string) => installerScenarioGroup === group;
const registerInstallerTest = (groups: string[], name: string, body: () => void) => {
  if (installerScenarioGroup && groups.includes(installerScenarioGroup)) test(name, body);
};

registerInstallerTest(
  ["basics"],
  "one-shot App installer defaults to the shared base plus optional GUI without Agents",
  () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-app-installer-args-"));
  const fakeCurl = path.join(tempRoot, "curl");
  const capturePath = path.join(tempRoot, "args.txt");
  writeExecutable(
    fakeCurl,
    `#!/bin/sh
cat <<'INNER'
#!/bin/bash
printf '%s\\n' "$*" > "$OPL_INSTALL_ARGS_CAPTURE"
INNER
`,
  );
  writeExecutable(
    path.join(tempRoot, "uname"),
    `#!/bin/sh
if [ "\${1:-}" = "-m" ]; then
  printf 'arm64\\n'
else
  printf 'Darwin\\n'
fi
`,
  );

  try {
    const result = spawnSync("/bin/bash", [path.join(appRoot, "install.sh")], {
      cwd: appRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        OPL_INSTALL_ARGS_CAPTURE: capturePath,
        PATH: `${tempRoot}:/usr/bin:/bin`,
      },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(fs.readFileSync(capturePath, "utf8").trim(), "--with-app");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  },
);
registerInstallerTest(
  ["routing", "repair-and-quality", "full-integrity", "custom-sources"],
  "Stable macOS installer binds exact release assets before mount and preserves profile selection",
  () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-stable-installer-profile-"));
  const fakeBin = path.join(tempRoot, "bin");
  const curlArgsPath = path.join(tempRoot, "curl-args.txt");
  const ghArgsPath = path.join(tempRoot, "gh-args.txt");
  const hdiutilArgsPath = path.join(tempRoot, "hdiutil-args.txt");
  const releaseJsonPath = path.join(tempRoot, "release.json");
  const customDmgPath = path.join(tempRoot, "custom.dmg");
  const version = "26.7.20";
  const tag = `v${version}`;
  const fullVersion = version;
  const bundleDigest = `sha256:${"d".repeat(64)}`;
  const appSha = "a".repeat(40);
  const shellSha = "b".repeat(40);
  const frameworkSha = "c".repeat(40);
  const fullName = `One-Person-Lab-Full-${fullVersion}-mac-arm64.dmg`;
  const standardName = `One-Person-Lab-${version}-mac-arm64.dmg`;
  const componentManifestName = "opl-app-component-manifest.json";
  const fullManifestName = "opl-release-manifest.json";
  const attestationName = "opl-release-attestation.json";
  const fullBytes = "full-dmg-bytes\n";
  const standardBytes = "standard-dmg-bytes\n";
  const attestationBytes = "unified-release-attestation\n";
  const installerBytes = fs.readFileSync(path.join(appRoot, "install.sh"));
  const releaseInstallerPath = path.join(tempRoot, "opl-install.sh");
  fs.writeFileSync(releaseInstallerPath, installerBytes, { mode: 0o755 });
  const originalInstallerBytes = "original-installer-bootstrap\n";
  const intermediateInstallerBytes = "intermediate-installer-bootstrap\n";
  const releaseId = 123456;
  const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
  const asset = (
    releaseTag: string,
    name: string,
    bytes: Buffer | string,
    digestOverride?: string,
    sizeOverride?: number,
  ) => ({
    name,
    digest: `sha256:${digestOverride ?? digest(bytes)}`,
    size: sizeOverride ?? Buffer.byteLength(bytes),
    browser_download_url: `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/${releaseTag}/${name}`,
  });
  const componentManifest = ({
    qualityStatus = "stable",
    buildTrigger = "manual",
    previewKind = null,
    stableQualified = true,
    nonStableNotice = false,
    skippedGates = [] as string[],
    primaryDigest,
    primaryName = standardName,
    legacyV3Manifest = false,
    legacyV3Fields = {} as Record<string, unknown>,
    componentBundleDigest = bundleDigest,
    installerIdentity = installerBytes,
  }: {
    qualityStatus?: string;
    buildTrigger?: string;
    previewKind?: string | null;
    stableQualified?: boolean;
    nonStableNotice?: boolean;
    skippedGates?: string[];
    primaryDigest?: string;
    primaryName?: string;
    legacyV3Manifest?: boolean;
    legacyV3Fields?: Record<string, unknown>;
    componentBundleDigest?: string | null;
    installerIdentity?: Buffer | string;
  } = {}) =>
    JSON.stringify({
      surface_kind: "opl_app_component_manifest.v1",
      component_id: "opl-app",
      version,
      release_tag: tag,
      release_url: `https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/${tag}`,
      component_manifest_ref: `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/${tag}/${componentManifestName}`,
      component_manifest_digest: `sha256:${"a".repeat(64)}`,
      ...(componentBundleDigest === null ? {} : { bundle_digest: componentBundleDigest }),
      source_cohort: {
        app_sha: appSha,
        shell_sha: shellSha,
        framework_sha: frameworkSha,
      },
      primary_artifact: {
        name: primaryName,
        digest: `sha256:${primaryDigest ?? digest(standardBytes)}`,
      },
      artifacts: [
        {
          name: standardName,
          digest: `sha256:${primaryDigest ?? digest(standardBytes)}`,
          ref: `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/${tag}/${standardName}`,
        },
        {
          name: "opl-install.sh",
          digest: `sha256:${digest(installerIdentity)}`,
          size: Buffer.byteLength(installerIdentity),
          ref: `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/${tag}/opl-install.sh`,
        },
      ],
      ...(legacyV3Manifest
        ? legacyV3Fields
        : {
            release_version: version,
            quality_status: qualityStatus,
            build_trigger: buildTrigger,
            preview_kind: previewKind,
            qualification_disclosure: {
              stable_qualified: stableQualified,
              non_stable_notice: nonStableNotice,
              skipped_gates: skippedGates,
              failed_gates: [],
            },
          }),
    });
  const fullManifest = ({
    primaryName = fullName,
    primaryDigest = digest(fullBytes),
    releaseVersion = fullVersion,
    primarySize = Buffer.byteLength(fullBytes),
    standardAttestationDigest = digest(attestationBytes),
  }: {
    primaryName?: string;
    primaryDigest?: string;
    releaseVersion?: string | null;
    primarySize?: number;
    standardAttestationDigest?: string;
  } = {}) =>
    JSON.stringify({
      schema: "opl_public_release_manifest.v1",
      package_kind: "opl_full_first_install_macos_arm64",
      owner_authority: "one-person-lab-app",
      version: fullVersion,
      ...(releaseVersion === null ? {} : { release_version: releaseVersion }),
      primary_install_asset: primaryName,
      assets: [
        {
          name: fullName,
          role: "full_first_install_carrier",
          size_bytes: primarySize,
          sha256: `sha256:${primaryDigest}`,
        },
      ],
      carrier_context: {
        standard_attestation: {
          name: attestationName,
          sha256: `sha256:${standardAttestationDigest}`,
        },
      },
    });
  const writeRelease = ({
    fullPresent = true,
    standardDigest,
    manifest,
    manifestAssetDigest,
    prerelease = false,
    duplicateFullAsset = false,
    fullManifestOptions,
    fullManifestAssetDigest,
    fullAssetSize,
    attestationAssetDigest,
    archivedAttestation,
    repairReceipts = "none",
  }: {
    fullPresent?: boolean;
    standardDigest?: string;
    manifest?: Parameters<typeof componentManifest>[0];
    manifestAssetDigest?: string;
    prerelease?: boolean;
    duplicateFullAsset?: boolean;
    fullManifestOptions?: Parameters<typeof fullManifest>[0];
    fullManifestAssetDigest?: string;
    fullAssetSize?: number;
    attestationAssetDigest?: string;
    archivedAttestation?: boolean;
    repairReceipts?: "none" | "valid" | "gap" | "fork" | "digest-drift";
  } = {}) => {
    const repairCommitOne = "d".repeat(40);
    const repairCommitTwo = "e".repeat(40);
    const repairCommitFork = "f".repeat(40);
    const receiptName = (commit: string) => `opl-additive-repair-${commit.slice(0, 12)}.json`;
    const receipt = (
      commit: string,
      previousId: number,
      previousBytes: Buffer | string,
      nextBytes: Buffer | string,
    ) => JSON.stringify({
      schema: "opl_app_stable_additive_repair.v1",
      status: "complete",
      release: {
        id: releaseId,
        tag,
        target_commitish: appSha,
        body_digest: `sha256:${"9".repeat(64)}`,
        draft: false,
        prerelease: false,
      },
      source_run_id: "31518428559",
      repair_source_commit: commit,
      frozen_assets: [],
      replacement: {
        previous: {
          id: previousId,
          name: "opl-install.sh",
          size: Buffer.byteLength(previousBytes),
          digest: `sha256:${digest(previousBytes)}`,
        },
        next: {
          name: "opl-install.sh",
          size: Buffer.byteLength(nextBytes),
          digest: `sha256:${digest(nextBytes)}`,
        },
      },
      public_receipt: receiptName(commit),
      remaining: [],
    });
    const receiptEntries = [
      [repairCommitOne, receipt(repairCommitOne, 51, originalInstallerBytes, intermediateInstallerBytes)],
      [repairCommitTwo, receipt(repairCommitTwo, 52, intermediateInstallerBytes, installerBytes)],
      ...(repairReceipts === "fork"
        ? [[repairCommitFork, receipt(repairCommitFork, 51, originalInstallerBytes, "forked-installer\n")]]
        : []),
    ] as Array<[string, string]>;
    const selectedReceipts = repairReceipts === "none"
      ? []
      : receiptEntries.filter(([commit]) => repairReceipts !== "gap" || commit !== repairCommitOne);
    for (const [commit, bytes] of selectedReceipts) {
      fs.writeFileSync(path.join(tempRoot, receiptName(commit)), bytes);
    }
    const manifestBytes = componentManifest({
      ...manifest,
      primaryDigest: manifest?.primaryDigest ?? standardDigest ?? digest(standardBytes),
      installerIdentity: repairReceipts === "none" ? installerBytes : originalInstallerBytes,
    });
    const fullManifestBytes = fullManifest(fullManifestOptions);
    const fullAssets = fullPresent
      ? [
          asset(tag, fullName, fullBytes, undefined, fullAssetSize),
          ...(duplicateFullAsset ? [asset(tag, fullName, fullBytes)] : []),
          asset(tag, fullManifestName, fullManifestBytes, fullManifestAssetDigest),
        ]
      : [];
    fs.writeFileSync(
      releaseJsonPath,
      JSON.stringify({
        id: releaseId,
        tag_name: tag,
        draft: false,
        prerelease,
        immutable: false,
        target_commitish: appSha,
        assets: [
          asset(tag, standardName, standardBytes, standardDigest),
          asset(tag, componentManifestName, manifestBytes, manifestAssetDigest),
          asset(tag, "opl-install.sh", installerBytes),
          ...selectedReceipts.map(([commit, bytes], index) => asset(
            tag,
            receiptName(commit),
            bytes,
            repairReceipts === "digest-drift" && index === 0 ? "0".repeat(64) : undefined,
          )),
          asset(tag, attestationName, attestationBytes, attestationAssetDigest),
          ...(archivedAttestation ? [asset(tag, "opl-release-attestation-26.8.591.json", attestationBytes)] : []),
          ...fullAssets,
        ],
      }),
    );
    fs.writeFileSync(path.join(tempRoot, componentManifestName), manifestBytes);
    fs.writeFileSync(path.join(tempRoot, fullManifestName), fullManifestBytes);
    fs.writeFileSync(path.join(tempRoot, attestationName), attestationBytes);
  };
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(customDmgPath, standardBytes);

  writeExecutable(
    path.join(fakeBin, "uname"),
    `#!/bin/sh
case "\${1:-}" in
  -m) printf 'arm64\\n' ;;
  *) printf 'Darwin\\n' ;;
esac
`,
  );
  writeExecutable(
    path.join(fakeBin, "curl"),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$OPL_CURL_ARGS_CAPTURE"
output=''
url=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o)
      output="$2"
      shift 2
      ;;
    http://*|https://*)
      url="$1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done
case "$url" in
  https://api.github.com/*)
    if [ "$OPL_FAKE_RELEASE_API_HTTP" = "200" ]; then
      cp "$OPL_FAKE_RELEASE_JSON" "$output"
      exit 0
    fi
    printf 'release-api-status=%s\n' "$OPL_FAKE_RELEASE_API_HTTP" >&2
    exit 22
    ;;
  *One-Person-Lab-Full-*)
    if [ "$OPL_FAKE_FULL_HTTP" = "200" ]; then
      printf 'full-dmg-bytes\\n' > "$output"
      printf '200'
      exit 0
    fi
    printf '%s' "$OPL_FAKE_FULL_HTTP"
    exit 22
    ;;
  *One-Person-Lab-*)
    printf 'standard-dmg-bytes\\n' > "$output"
    printf '200'
    exit 0
    ;;
  *opl-app-component-manifest.json)
    cp "$OPL_FAKE_COMPONENT_MANIFEST" "$output"
    printf '200'
    exit 0
    ;;
  *opl-additive-repair-*.json)
    cp "$OPL_FAKE_RECEIPT_DIR/\${url##*/}" "$output"
    printf '200'
    exit 0
    ;;
  *opl-release-manifest.json)
    cp "$OPL_FAKE_FULL_MANIFEST" "$output"
    printf '200'
    exit 0
    ;;
  https://example.invalid/custom.dmg)
    printf 'standard-dmg-bytes\\n' > "$output"
    printf '200'
    exit 0
    ;;
  *)
    exit 22
    ;;
esac
`,
  );
  writeExecutable(
    path.join(fakeBin, "gh"),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$OPL_GH_ARGS_CAPTURE"
if [ "$1" = "api" ] && [ "$OPL_FAKE_GH_STATUS" = "0" ]; then
  cat "$OPL_FAKE_RELEASE_JSON"
  exit 0
fi
exit 1
`,
  );
  writeExecutable(
    path.join(fakeBin, "plutil"),
    `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] !== "-extract" || !["raw", "json"].includes(args[2]) || args[3] !== "-o" || args[4] !== "-") process.exit(2);
let value = JSON.parse(fs.readFileSync(args[5], "utf8"));
for (const part of args[1].split(".")) {
  if (value == null || !(part in value)) process.exit(1);
  value = value[part];
}
// macOS plutil raw exits nonzero for JSON null instead of printing "null".
if (args[2] === "raw" && value === null) process.exit(1);
process.stdout.write(args[2] === "json" ? JSON.stringify(value) : String(value));
`,
  );
  writeExecutable(
    path.join(fakeBin, "hdiutil"),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$OPL_HDIUTIL_ARGS_CAPTURE"
exit 1
`,
  );
  for (const command of ["ditto", "find", "xattr"]) {
    writeExecutable(
      path.join(fakeBin, command),
      `#!/bin/sh
exit 1
`,
    );
  }

  try {
    const runInstaller = (
      profileArgs: string[],
      {
        fullHttp = "200",
        fullPresent = true,
        standardDigest,
        releaseTag = true,
        manifest,
        manifestAssetDigest,
        prerelease,
        releaseApiHttp = "200",
        ghStatus = "1",
        stableMacosInstall = true,
        duplicateFullAsset = false,
        fullManifestOptions,
        fullManifestAssetDigest,
        fullAssetSize,
        attestationAssetDigest,
        archivedAttestation,
        repairReceipts,
      }: {
        fullHttp?: string;
        fullPresent?: boolean;
        standardDigest?: string;
        releaseTag?: boolean;
        manifest?: Parameters<typeof componentManifest>[0];
        manifestAssetDigest?: string;
        prerelease?: boolean;
        releaseApiHttp?: string;
        ghStatus?: string;
        stableMacosInstall?: boolean;
        duplicateFullAsset?: boolean;
        fullManifestOptions?: Parameters<typeof fullManifest>[0];
        fullManifestAssetDigest?: string;
        fullAssetSize?: number;
        attestationAssetDigest?: string;
        archivedAttestation?: boolean;
        repairReceipts?: "none" | "valid" | "gap" | "fork" | "digest-drift";
      } = {},
    ) => {
      writeRelease({
        fullPresent,
        standardDigest,
        manifest,
        manifestAssetDigest,
        prerelease,
        duplicateFullAsset,
        fullManifestOptions,
        fullManifestAssetDigest,
        fullAssetSize,
        attestationAssetDigest,
        archivedAttestation,
        repairReceipts,
      });
      fs.writeFileSync(curlArgsPath, "");
      fs.writeFileSync(ghArgsPath, "");
      fs.writeFileSync(hdiutilArgsPath, "");
      return spawnSync(
        "/bin/bash",
        [
          repairReceipts === "none" ? path.join(appRoot, "install.sh") : releaseInstallerPath,
          ...(stableMacosInstall ? ["--stable-macos-install"] : []),
          ...profileArgs,
          ...(releaseTag ? ["--release-tag", tag] : []),
          "--yes",
          "--no-open",
        ],
        {
          cwd: appRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            OPL_CURL_ARGS_CAPTURE: curlArgsPath,
            OPL_GH_ARGS_CAPTURE: ghArgsPath,
            OPL_HDIUTIL_ARGS_CAPTURE: hdiutilArgsPath,
            OPL_FAKE_RELEASE_JSON: releaseJsonPath,
            OPL_FAKE_COMPONENT_MANIFEST: path.join(tempRoot, componentManifestName),
            OPL_FAKE_FULL_MANIFEST: path.join(tempRoot, fullManifestName),
            OPL_FAKE_RECEIPT_DIR: tempRoot,
            OPL_FAKE_FULL_HTTP: fullHttp,
            OPL_FAKE_RELEASE_API_HTTP: releaseApiHttp,
            OPL_FAKE_GH_STATUS: ghStatus,
            PATH: `${fakeBin}:/usr/bin:/bin`,
          },
        },
      );
    };

    if (isInstallerScenarioGroup("routing")) {
    const availableFullResult = runInstaller([]);
    assert.notEqual(
      availableFullResult.status,
      0,
      "fake hdiutil should stop after the Full download",
    );
    const availableFullCurlArgs = fs.readFileSync(curlArgsPath, "utf8");
    assert.ok(
      availableFullCurlArgs.includes(
        `/releases/download/${tag}/One-Person-Lab-Full-${version}-mac-arm64.dmg`,
      ),
      availableFullResult.stderr || availableFullResult.stdout,
    );
    assert.doesNotMatch(
      availableFullCurlArgs,
      /releases\/download\/v26\.7\.20\/One-Person-Lab-26\.7\.20-mac-arm64\.dmg/,
    );
    assert.match(
      fs.readFileSync(hdiutilArgsPath, "utf8"),
      /attach/,
      availableFullResult.stderr || availableFullResult.stdout,
    );

    const universalFullResult = runInstaller(["--full"], { stableMacosInstall: false });
    assert.notEqual(
      universalFullResult.status,
      0,
      "fake hdiutil should stop after the universal Desktop route selects Full",
    );
    assert.ok(
      fs
        .readFileSync(curlArgsPath, "utf8")
        .includes(`/releases/download/${tag}/One-Person-Lab-Full-${version}-mac-arm64.dmg`),
    );
    assert.match(fs.readFileSync(hdiutilArgsPath, "utf8"), /attach/);

    const latestResult = runInstaller(["--standard"], { releaseTag: false });
    assert.notEqual(
      latestResult.status,
      0,
      "fake hdiutil should stop after Latest DMG verification",
    );
    assert.match(
      fs.readFileSync(curlArgsPath, "utf8"),
      /api\.github\.com\/repos\/gaofeng21cn\/one-person-lab-app\/releases\/latest/,
    );
    assert.match(latestResult.stdout, /Release quality: Stable/);
    assert.match(fs.readFileSync(hdiutilArgsPath, "utf8"), /attach/);

    const apiFallbackResult = runInstaller(["--standard"], {
      releaseApiHttp: "403",
      ghStatus: "0",
    });
    assert.notEqual(
      apiFallbackResult.status,
      0,
      "fake hdiutil should stop after gh API fallback verification",
    );
    assert.match(apiFallbackResult.stderr, /used authenticated gh fallback/);
    assert.match(
      fs.readFileSync(curlArgsPath, "utf8"),
      /api\.github\.com\/repos\/gaofeng21cn\/one-person-lab-app\/releases\/tags\/v26\.7\.20/,
    );
    assert.match(
      fs.readFileSync(ghArgsPath, "utf8"),
      /api --hostname github\.com .*repos\/gaofeng21cn\/one-person-lab-app\/releases\/tags\/v26\.7\.20/,
    );
    assert.match(fs.readFileSync(hdiutilArgsPath, "utf8"), /attach/);

    const legacyReleaseResult = runInstaller(["--standard"], {
      manifest: { legacyV3Manifest: true },
    });
    assert.notEqual(
      legacyReleaseResult.status,
      0,
      "fake hdiutil should stop after a legacy release download",
    );
    assert.match(
      legacyReleaseResult.stdout,
      /Release quality: unasserted legacy release \(V3 Stable\/Preview metadata unavailable\)/,
    );
    assert.match(
      legacyReleaseResult.stdout,
      /Legacy release manifest predates V3 qualification disclosure/,
    );
    assert.doesNotMatch(legacyReleaseResult.stdout, /Release quality: Stable/);
    assert.match(fs.readFileSync(hdiutilArgsPath, "utf8"), /attach/);
    }

    if (isInstallerScenarioGroup("repair-and-quality")) {
    const repairedInstallerResult = runInstaller(["--standard"], { repairReceipts: "valid" });
    assert.notEqual(repairedInstallerResult.status, 0, "fake hdiutil should stop after receipt-chain verification");
    assert.match(fs.readFileSync(hdiutilArgsPath, "utf8"), /attach/);
    assert.match(fs.readFileSync(curlArgsPath, "utf8"), /opl-additive-repair-dddddddddddd\.json/);
    assert.match(fs.readFileSync(curlArgsPath, "utf8"), /opl-additive-repair-eeeeeeeeeeee\.json/);

    for (const [repairReceipts, label] of [
      ["gap", "missing receipt link"],
      ["fork", "forked receipt chain"],
      ["digest-drift", "receipt asset digest drift"],
    ] as const) {
      const result = runInstaller(["--standard"], { repairReceipts });
      assert.notEqual(result.status, 0, label);
      assert.match(result.stderr, /not connected to the component manifest by one exact additive repair receipt chain/, label);
      assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "", label);
    }

    const partialLegacyReleaseResult = runInstaller(["--standard"], {
      manifest: {
        legacyV3Manifest: true,
        legacyV3Fields: { quality_status: "preview" },
      },
    });
    assert.notEqual(partialLegacyReleaseResult.status, 0);
    assert.match(
      partialLegacyReleaseResult.stderr,
      /must provide every V3 quality and qualification disclosure field/,
    );
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const devPreviewResult = runInstaller(["--standard"], {
      manifest: {
        qualityStatus: "preview",
        buildTrigger: "manual",
        previewKind: "dev",
        stableQualified: false,
        nonStableNotice: true,
        skippedGates: ["homebrew_clean_install"],
      },
    });
    assert.notEqual(
      devPreviewResult.status,
      0,
      "fake hdiutil should stop after a disclosed Dev Preview download",
    );
    assert.match(devPreviewResult.stdout, /Release quality: Preview \(Dev\)/);
    assert.match(
      devPreviewResult.stdout,
      /Latest pointer selects this exact release but does not change its declared quality/,
    );
    assert.match(devPreviewResult.stdout, /Non-Stable release/);
    assert.match(devPreviewResult.stdout, /homebrew_clean_install/);
    assert.doesNotMatch(devPreviewResult.stdout, /Release quality: Stable/);
    assert.match(fs.readFileSync(hdiutilArgsPath, "utf8"), /attach/);

    const nightlyPreviewResult = runInstaller(["--standard"], {
      prerelease: true,
      manifest: {
        qualityStatus: "preview",
        buildTrigger: "automated",
        previewKind: "nightly",
        stableQualified: false,
        nonStableNotice: true,
        skippedGates: ["stable_heavy_vm"],
      },
    });
    assert.notEqual(
      nightlyPreviewResult.status,
      0,
      "fake hdiutil should stop after a disclosed Nightly Preview download",
    );
    assert.match(nightlyPreviewResult.stdout, /Release quality: Preview \(Nightly\)/);
    assert.match(
      nightlyPreviewResult.stdout,
      /Latest pointer selects this exact release but does not change its declared quality/,
    );
    assert.match(nightlyPreviewResult.stdout, /Non-Stable release/);
    assert.match(nightlyPreviewResult.stdout, /stable_heavy_vm/);
    assert.doesNotMatch(nightlyPreviewResult.stdout, /Release quality: Stable/);
    assert.match(fs.readFileSync(hdiutilArgsPath, "utf8"), /attach/);

    const undisclosedPreviewResult = runInstaller(["--standard"], {
      manifest: {
        qualityStatus: "preview",
        buildTrigger: "manual",
        previewKind: "dev",
        stableQualified: false,
        nonStableNotice: true,
        skippedGates: [],
      },
    });
    assert.notEqual(undisclosedPreviewResult.status, 0);
    assert.match(undisclosedPreviewResult.stderr, /must disclose skipped qualification gates/);
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");
    }

    if (isInstallerScenarioGroup("full-integrity")) {
    const fallbackResult = runInstaller([], { fullPresent: false });
    assert.notEqual(
      fallbackResult.status,
      0,
      "fake Standard download should stop after the fallback",
    );
    const fallbackCurlArgs = fs.readFileSync(curlArgsPath, "utf8");
    assert.match(
      fallbackCurlArgs,
      /releases\/download\/v26\.7\.20\/One-Person-Lab-26\.7\.20-mac-arm64\.dmg/,
    );
    assert.match(fallbackResult.stderr, /continuing with the Standard DMG/);
    assert.match(fs.readFileSync(hdiutilArgsPath, "utf8"), /attach/);

    const unavailableResult = runInstaller([], { fullHttp: "503" });
    assert.notEqual(
      unavailableResult.status,
      0,
      "Full server failures must not select a different package",
    );
    const unavailableCurlArgs = fs.readFileSync(curlArgsPath, "utf8");
    assert.match(unavailableCurlArgs, /One-Person-Lab-Full-26\.7\.20-mac-arm64\.dmg/);
    assert.doesNotMatch(
      unavailableCurlArgs,
      /releases\/download\/v26\.7\.20\/One-Person-Lab-26\.7\.20-mac-arm64\.dmg/,
    );
    assert.doesNotMatch(unavailableResult.stderr, /continuing with the Standard DMG/);
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const fullResult = runInstaller(["--full"], { fullPresent: false });
    assert.notEqual(fullResult.status, 0, "missing explicit Full must fail without fallback");
    const fullCurlArgs = fs.readFileSync(curlArgsPath, "utf8");
    assert.match(
      fullCurlArgs,
      /api\.github\.com\/repos\/gaofeng21cn\/one-person-lab-app\/releases\/tags\/v26\.7\.20/,
    );
    assert.match(fullResult.stderr, /No same-tag Full module is published/);
    assert.doesNotMatch(
      fullCurlArgs,
      /releases\/download\/v26\.7\.20\/One-Person-Lab-26\.7\.20-mac-arm64\.dmg/,
    );
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const mixedShapeFullResult = runInstaller(["--full"], { duplicateFullAsset: true });
    assert.notEqual(
      mixedShapeFullResult.status,
      0,
      "duplicate same-tag Full asset names must fail closed",
    );
    assert.match(mixedShapeFullResult.stderr, /No same-tag Full module is published/);
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const previewFullResult = runInstaller(["--full"], {
      manifest: {
        qualityStatus: "preview",
        buildTrigger: "manual",
        previewKind: "dev",
        stableQualified: false,
        nonStableNotice: true,
        skippedGates: ["stable_release"],
      },
    });
    assert.notEqual(previewFullResult.status, 0);
    assert.match(previewFullResult.stderr, /requires one qualified non-prerelease Standard Release/);
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    for (const [name, fullManifestOptions] of [
      ["missing Full release version", { releaseVersion: null }],
      ["wrong Full release version", { releaseVersion: "26.8.3" }],
    ] as const) {
      const result = runInstaller(["--full"], { fullManifestOptions });
      assert.notEqual(result.status, 0, name);
      assert.match(
        result.stderr,
        /Full carrier public manifest does not match its own Release version and asset identity/,
        name,
      );
      assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "", name);
    }

    const fullManifestIdentityMismatchResult = runInstaller(["--full"], {
      fullManifestOptions: { primaryDigest: "0".repeat(64) },
    });
    assert.notEqual(fullManifestIdentityMismatchResult.status, 0);
    assert.match(
      fullManifestIdentityMismatchResult.stderr,
      /Full public manifest does not bind the exact Full DMG digest and size/,
    );
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const fullManifestSizeMismatchResult = runInstaller(["--full"], {
      fullManifestOptions: { primarySize: Buffer.byteLength(fullBytes) + 1 },
    });
    assert.notEqual(fullManifestSizeMismatchResult.status, 0);
    assert.match(
      fullManifestSizeMismatchResult.stderr,
      /Full public manifest does not bind the exact Full DMG digest and size/,
    );
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const fullReleaseSizeMismatchResult = runInstaller(["--full"], {
      fullAssetSize: Buffer.byteLength(fullBytes) + 1,
    });
    assert.notEqual(fullReleaseSizeMismatchResult.status, 0);
    assert.match(
      fullReleaseSizeMismatchResult.stderr,
      /Full public manifest does not bind the exact Full DMG digest and size/,
    );
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const attestationBindingMismatchResult = runInstaller(["--full"], {
      fullManifestOptions: { standardAttestationDigest: "0".repeat(64) },
    });
    assert.notEqual(attestationBindingMismatchResult.status, 0);
    assert.match(
      attestationBindingMismatchResult.stderr,
      /Full public manifest does not bind the exact Standard release attestation/,
    );
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const retainedAttestationResult = runInstaller(["--full"], {
      attestationAssetDigest: "1".repeat(64), archivedAttestation: true,
    });
    assert.notEqual(retainedAttestationResult.status, 0, "fake mount stops after successful identity checks");
    assert.doesNotMatch(retainedAttestationResult.stderr, /does not bind the exact Standard release attestation/);
    assert.match(fs.readFileSync(hdiutilArgsPath, "utf8"), /attach/);

    const fullManifestDigestMismatchResult = runInstaller(["--full"], {
      fullManifestAssetDigest: "0".repeat(64),
    });
    assert.notEqual(fullManifestDigestMismatchResult.status, 0);
    assert.match(
      fullManifestDigestMismatchResult.stderr,
      /Full release manifest SHA256 mismatch/,
    );
    assert.match(
      fs.readFileSync(curlArgsPath, "utf8"),
      /releases\/download\/v26\.7\.20\/opl-release-manifest\.json/,
    );
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");
    }

    if (isInstallerScenarioGroup("custom-sources")) {
    const mismatchResult = runInstaller(["--standard"], { standardDigest: "0".repeat(64) });
    assert.notEqual(mismatchResult.status, 0);
    assert.match(mismatchResult.stderr, /DMG SHA256 mismatch/);
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const manifestIdentityMismatchResult = runInstaller(["--standard"], {
      manifest: { primaryDigest: "0".repeat(64) },
    });
    assert.notEqual(manifestIdentityMismatchResult.status, 0);
    assert.match(
      manifestIdentityMismatchResult.stderr,
      /Component manifest primary Standard DMG identity does not match the selected Release/,
    );
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const manifestDigestMismatchResult = runInstaller(["--standard"], {
      manifestAssetDigest: "0".repeat(64),
    });
    assert.notEqual(manifestDigestMismatchResult.status, 0);
    assert.match(manifestDigestMismatchResult.stderr, /Component manifest SHA256 mismatch/);
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const malformedRecordResult = runInstaller(["--standard"], { standardDigest: "missing" });
    assert.notEqual(malformedRecordResult.status, 0);
    assert.match(malformedRecordResult.stderr, /no unique digest-bound Standard DMG asset/);
    assert.doesNotMatch(
      fs.readFileSync(curlArgsPath, "utf8"),
      /releases\/download\/v26\.7\.20\/One-Person-Lab-26\.7\.20-mac-arm64\.dmg/,
    );
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const customWithoutDigest = runInstaller(["--dmg-path", customDmgPath]);
    assert.notEqual(customWithoutDigest.status, 0);
    assert.match(customWithoutDigest.stderr, /requires --dmg-sha256/);
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const customUrlWithoutDigest = runInstaller([
      "--dmg-url",
      "https://example.invalid/custom.dmg",
    ]);
    assert.notEqual(customUrlWithoutDigest.status, 0);
    assert.match(customUrlWithoutDigest.stderr, /requires --dmg-sha256/);
    assert.equal(fs.readFileSync(curlArgsPath, "utf8"), "");
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const customMismatch = runInstaller([
      "--dmg-path",
      customDmgPath,
      "--dmg-sha256",
      "0".repeat(64),
    ]);
    assert.notEqual(customMismatch.status, 0);
    assert.match(customMismatch.stderr, /DMG SHA256 mismatch/);
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const customVerified = runInstaller([
      "--dmg-path",
      customDmgPath,
      "--dmg-sha256",
      digest(standardBytes),
    ]);
    assert.notEqual(
      customVerified.status,
      0,
      "fake hdiutil should stop after custom DMG verification",
    );
    assert.match(customVerified.stdout, /Release quality: not asserted for a custom DMG source/);
    assert.doesNotMatch(fs.readFileSync(curlArgsPath, "utf8"), /api\.github\.com\/repos/);
    assert.match(fs.readFileSync(hdiutilArgsPath, "utf8"), /attach/);

    const customUrlVerified = runInstaller([
      "--dmg-url",
      "https://example.invalid/custom.dmg",
      "--dmg-sha256",
      digest(standardBytes),
    ]);
    assert.notEqual(
      customUrlVerified.status,
      0,
      "fake hdiutil should stop after custom URL verification",
    );
    assert.match(customUrlVerified.stdout, /Release quality: not asserted for a custom DMG source/);
    assert.doesNotMatch(fs.readFileSync(curlArgsPath, "utf8"), /opl-app-component-manifest/);
    assert.match(fs.readFileSync(hdiutilArgsPath, "utf8"), /attach/);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  },
);

registerInstallerTest(
  ["basics"],
  "local authorization checks each nested directory symlink path once",
  () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-local-authorization-symlink-"));
  const appPath = path.join(tempRoot, "One Person Lab.app");
  writeFile(path.join(appPath, "real", "sub", "f"), "abc");
  fs.mkdirSync(path.join(appPath, "plain"), { recursive: true });
  fs.symlinkSync("../real", path.join(appPath, "plain", "link"));

  const fakeBin = path.join(tempRoot, "bin");
  const xattrLog = path.join(tempRoot, "xattr.log");
  const output = path.join(tempRoot, "local-authorization-policy.json");
  writeExecutable(
    path.join(fakeBin, "xattr"),
    `#!/bin/sh
printf '%s\\n' "$3" >> "$OPL_XATTR_LOG"
exit 0
`,
  );

  const result = runNode(
    [
      "scripts/local-authorization-policy.ts",
      "--package-kind",
      "app_standard",
      "--app-path",
      appPath,
      "--output",
      output,
    ],
    {
      env: {
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
        OPL_XATTR_LOG: xattrLog,
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must prove quarantine is absent or removed/);
  const checkedPaths = fs.readFileSync(xattrLog, "utf8").trim().split("\n");
  assert.deepEqual(checkedPaths.map((entry) => path.relative(appPath, entry) || ".").sort(), [
    ".",
    "plain",
    "plain/link",
    "real",
    "real/sub",
    "real/sub/f",
  ]);
  assert.equal(JSON.parse(fs.readFileSync(output, "utf8")).quarantine_attribute_count, 6);
  },
);
