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

test("one-shot App installer defaults to the shared base plus optional GUI without Agents", () => {
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
});
test("Stable macOS installer binds exact release assets before mount and preserves profile selection", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-stable-installer-profile-"));
  const fakeBin = path.join(tempRoot, "bin");
  const curlArgsPath = path.join(tempRoot, "curl-args.txt");
  const ghArgsPath = path.join(tempRoot, "gh-args.txt");
  const hdiutilArgsPath = path.join(tempRoot, "hdiutil-args.txt");
  const releaseJsonPath = path.join(tempRoot, "release.json");
  const releaseListJsonPath = path.join(tempRoot, "release-list.json");
  const fullReleaseJsonPath = path.join(tempRoot, "full-release.json");
  const customDmgPath = path.join(tempRoot, "custom.dmg");
  const version = "26.7.20";
  const tag = `v${version}`;
  const fullVersion = "26.8.3";
  const bundleDigest = `sha256:${"d".repeat(64)}`;
  const appSha = "a".repeat(40);
  const shellSha = "b".repeat(40);
  const frameworkSha = "c".repeat(40);
  const fullName = `One-Person-Lab-Full-${fullVersion}-mac-arm64.dmg`;
  const standardName = `One-Person-Lab-${version}-mac-arm64.dmg`;
  const componentManifestName = "opl-app-component-manifest.json";
  const fullManifestName = "opl-release-manifest.json";
  const fullBytes = "full-dmg-bytes\n";
  const standardBytes = "standard-dmg-bytes\n";
  const digest = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
  const asset = (
    releaseTag: string,
    name: string,
    bytes: string,
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
  }: {
    primaryName?: string;
    primaryDigest?: string;
    releaseVersion?: string | null;
    primarySize?: number;
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
    });
  const fullTagForManifest = (
    options?: Parameters<typeof fullManifest>[0],
  ) => {
    const manifestBytes = fullManifest(options);
    const parsedManifest = JSON.parse(manifestBytes);
    return `v${parsedManifest.version}-full-${digest(manifestBytes).slice(0, 12)}`;
  };
  const adjunctTag = fullTagForManifest();
  const writeRelease = ({
    fullPresent = true,
    standardDigest,
    manifest,
    manifestAssetDigest,
    prerelease = false,
    duplicateFullCandidate = false,
    fullDraft = false,
    fullImmutable = true,
    fullPrerelease = false,
    fullTargetAppSha = appSha,
    fullManifestOptions,
    fullManifestAssetDigest,
    fullTag,
    extraFullTags = [] as string[],
    fullAssetSize,
  }: {
    fullPresent?: boolean;
    standardDigest?: string;
    manifest?: Parameters<typeof componentManifest>[0];
    manifestAssetDigest?: string;
    prerelease?: boolean;
    duplicateFullCandidate?: boolean;
    fullDraft?: boolean;
    fullImmutable?: boolean;
    fullPrerelease?: boolean;
    fullTargetAppSha?: string;
    fullManifestOptions?: Parameters<typeof fullManifest>[0];
    fullManifestAssetDigest?: string;
    fullTag?: string;
    extraFullTags?: string[];
    fullAssetSize?: number;
  } = {}) => {
    const manifestBytes = componentManifest({
      ...manifest,
      primaryDigest: manifest?.primaryDigest ?? standardDigest ?? digest(standardBytes),
    });
    const fullManifestBytes = fullManifest(fullManifestOptions);
    const resolvedFullTag = fullTag ?? fullTagForManifest(fullManifestOptions);
    const fullRelease = {
      tag_name: resolvedFullTag,
      draft: fullDraft,
      prerelease: fullPrerelease,
      immutable: fullImmutable,
      target_commitish: fullTargetAppSha,
      assets: [
        asset(resolvedFullTag, fullName, fullBytes, undefined, fullAssetSize),
        asset(resolvedFullTag, fullManifestName, fullManifestBytes, fullManifestAssetDigest),
      ],
    };
    fs.writeFileSync(
      releaseJsonPath,
      JSON.stringify({
        tag_name: tag,
        draft: false,
        prerelease,
        immutable: true,
        target_commitish: appSha,
        assets: [
          asset(tag, standardName, standardBytes, standardDigest),
          asset(tag, componentManifestName, manifestBytes, manifestAssetDigest),
        ],
      }),
    );
    fs.writeFileSync(fullReleaseJsonPath, JSON.stringify(fullRelease));
    fs.writeFileSync(
      releaseListJsonPath,
      JSON.stringify(
        fullPresent
          ? [
              fullRelease,
              ...(duplicateFullCandidate
                ? [
                    {
                      ...fullRelease,
                      tag_name: `v${fullVersion}-full-${"e".repeat(12)}`,
                    },
                  ]
                : []),
              ...extraFullTags.map((extraTag) => ({ ...fullRelease, tag_name: extraTag })),
            ]
          : [],
      ),
    );
    fs.writeFileSync(path.join(tempRoot, componentManifestName), manifestBytes);
    fs.writeFileSync(path.join(tempRoot, fullManifestName), fullManifestBytes);
    return resolvedFullTag;
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
  *"/releases?per_page=100&page=1")
    if [ "$OPL_FAKE_RELEASE_API_HTTP" = "200" ]; then
      cp "$OPL_FAKE_RELEASE_LIST_JSON" "$output"
      exit 0
    fi
    printf 'release-list-api-status=%s\n' "$OPL_FAKE_RELEASE_API_HTTP" >&2
    exit 22
    ;;
  *"/releases?per_page=100&page="*)
    printf '[]' > "$output"
    exit 0
    ;;
  *"/releases/tags/$OPL_FAKE_FULL_TAG")
    if [ "$OPL_FAKE_RELEASE_API_HTTP" = "200" ]; then
      cp "$OPL_FAKE_FULL_RELEASE_JSON" "$output"
      exit 0
    fi
    printf 'full-release-api-status=%s\n' "$OPL_FAKE_RELEASE_API_HTTP" >&2
    exit 22
    ;;
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
  case "$*" in
    *"releases?per_page=100&page="*)
      cat "$OPL_FAKE_RELEASE_LIST_JSON"
      ;;
    *"/releases/tags/$OPL_FAKE_FULL_TAG"*)
      cat "$OPL_FAKE_FULL_RELEASE_JSON"
      ;;
    *)
      cat "$OPL_FAKE_RELEASE_JSON"
      ;;
  esac
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
        duplicateFullCandidate = false,
        fullDraft = false,
        fullImmutable = true,
        fullPrerelease = false,
        fullTargetAppSha = appSha,
        fullManifestOptions,
        fullManifestAssetDigest,
        fullTag,
        extraFullTags = [] as string[],
        fullAssetSize,
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
        duplicateFullCandidate?: boolean;
        fullDraft?: boolean;
        fullImmutable?: boolean;
        fullPrerelease?: boolean;
        fullTargetAppSha?: string;
        fullManifestOptions?: Parameters<typeof fullManifest>[0];
        fullManifestAssetDigest?: string;
        fullTag?: string;
        extraFullTags?: string[];
        fullAssetSize?: number;
      } = {},
    ) => {
      const resolvedFullTag = writeRelease({
        fullPresent,
        standardDigest,
        manifest,
        manifestAssetDigest,
        prerelease,
        duplicateFullCandidate,
        fullDraft,
        fullImmutable,
        fullPrerelease,
        fullTargetAppSha,
        fullManifestOptions,
        fullManifestAssetDigest,
        fullTag,
        extraFullTags,
        fullAssetSize,
      });
      fs.writeFileSync(curlArgsPath, "");
      fs.writeFileSync(ghArgsPath, "");
      fs.writeFileSync(hdiutilArgsPath, "");
      return spawnSync(
        "/bin/bash",
        [
          path.join(appRoot, "install.sh"),
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
            OPL_FAKE_RELEASE_LIST_JSON: releaseListJsonPath,
            OPL_FAKE_FULL_RELEASE_JSON: fullReleaseJsonPath,
            OPL_FAKE_FULL_TAG: resolvedFullTag,
            OPL_FAKE_COMPONENT_MANIFEST: path.join(tempRoot, componentManifestName),
            OPL_FAKE_FULL_MANIFEST: path.join(tempRoot, fullManifestName),
            OPL_FAKE_FULL_HTTP: fullHttp,
            OPL_FAKE_RELEASE_API_HTTP: releaseApiHttp,
            OPL_FAKE_GH_STATUS: ghStatus,
            PATH: `${fakeBin}:/usr/bin:/bin`,
          },
        },
      );
    };

    const availableFullResult = runInstaller([]);
    assert.notEqual(
      availableFullResult.status,
      0,
      "fake hdiutil should stop after the Full download",
    );
    const availableFullCurlArgs = fs.readFileSync(curlArgsPath, "utf8");
    assert.ok(
      availableFullCurlArgs.includes(
        `/releases/download/${adjunctTag}/One-Person-Lab-Full-26.8.3-mac-arm64.dmg`,
      ),
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
        .includes(`/releases/download/${adjunctTag}/One-Person-Lab-Full-26.8.3-mac-arm64.dmg`),
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
    assert.match(unavailableCurlArgs, /One-Person-Lab-Full-26\.8\.3-mac-arm64\.dmg/);
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
      /api\.github\.com\/repos\/gaofeng21cn\/one-person-lab-app\/releases\?per_page=100&page=1/,
    );
    assert.doesNotMatch(
      fullCurlArgs,
      /releases\/download\/v26\.7\.20\/One-Person-Lab-26\.7\.20-mac-arm64\.dmg/,
    );
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const mixedShapeFullResult = runInstaller(["--full"], { duplicateFullCandidate: true });
    assert.notEqual(
      mixedShapeFullResult.status,
      0,
      "a malformed Full-shaped Release must fail closed",
    );
    assert.match(
      mixedShapeFullResult.stderr,
      /found 2 Full tag\(s\), 1 self-addressed tag\(s\), 1 eligible/,
    );
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const mutableFullResult = runInstaller(["--full"], { fullImmutable: false });
    assert.notEqual(mutableFullResult.status, 0);
    assert.match(
      mutableFullResult.stderr,
      /requires exactly one self-addressed immutable Release.*found 1 Full tag\(s\), 1 self-addressed tag\(s\), 0 eligible/,
    );
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const independentTargetFullResult = runInstaller(["--full"], {
      fullTargetAppSha: "f".repeat(40),
    });
    assert.notEqual(
      independentTargetFullResult.status,
      0,
      "fake hdiutil should stop after accepting an independently versioned Full carrier",
    );
    assert.doesNotMatch(independentTargetFullResult.stderr, /target_commitish|cohort|App SHA/);
    assert.match(fs.readFileSync(hdiutilArgsPath, "utf8"), /attach/);

    const wrongSuffix = `v${fullVersion}-full-${"e".repeat(12)}`;
    const wrongSuffixFullResult = runInstaller(["--full"], { fullTag: wrongSuffix });
    assert.notEqual(wrongSuffixFullResult.status, 0);
    assert.match(
      wrongSuffixFullResult.stderr,
      /found 1 Full tag\(s\), 0 self-addressed tag\(s\), 0 eligible/,
    );
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const implicitWrongSuffixResult = runInstaller([], { fullTag: wrongSuffix });
    assert.notEqual(implicitWrongSuffixResult.status, 0);
    assert.match(
      implicitWrongSuffixResult.stderr,
      /found 1 Full tag\(s\), 0 self-addressed tag\(s\), 0 eligible/,
    );
    assert.doesNotMatch(implicitWrongSuffixResult.stderr, /continuing with the Standard DMG/);
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    for (const [name, fullManifestOptions] of [
      ["missing Full release version", { releaseVersion: null }],
      ["wrong Full release version", { releaseVersion: version }],
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
      /Full adjunct public manifest does not bind the exact Full DMG digest and size/,
    );
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const fullManifestSizeMismatchResult = runInstaller(["--full"], {
      fullManifestOptions: { primarySize: Buffer.byteLength(fullBytes) + 1 },
    });
    assert.notEqual(fullManifestSizeMismatchResult.status, 0);
    assert.match(
      fullManifestSizeMismatchResult.stderr,
      /Full adjunct public manifest does not bind the exact Full DMG digest and size/,
    );
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const fullReleaseSizeMismatchResult = runInstaller(["--full"], {
      fullAssetSize: Buffer.byteLength(fullBytes) + 1,
    });
    assert.notEqual(fullReleaseSizeMismatchResult.status, 0);
    assert.match(
      fullReleaseSizeMismatchResult.stderr,
      /Full adjunct public manifest does not bind the exact Full DMG digest and size/,
    );
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

    const fullManifestDigestMismatchResult = runInstaller(["--full"], {
      fullManifestAssetDigest: "0".repeat(64),
    });
    assert.notEqual(fullManifestDigestMismatchResult.status, 0);
    assert.match(
      fullManifestDigestMismatchResult.stderr,
      /found 1 Full tag\(s\), 0 self-addressed tag\(s\), 0 eligible/,
    );
    assert.doesNotMatch(
      fs.readFileSync(curlArgsPath, "utf8"),
      /releases\/download\/[^/]+\/opl-release-manifest\.json/,
    );
    assert.equal(fs.readFileSync(hdiutilArgsPath, "utf8"), "");

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
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("local authorization checks each nested directory symlink path once", () => {
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
});
