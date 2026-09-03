import { appRoot, assert, fs, os, path, test } from "./helpers.ts";
import { parse as parseYaml } from "yaml";

test("Full domain build links the pinned local Framework package into RedCube", () => {
  const workflow = fs.readFileSync(
    path.join(appRoot, ".github/workflows/full-first-install-release.yml"),
    "utf8",
  );
  assert.match(
    workflow,
    /npm install --prefix redcube-ai --no-save --package-lock=false "\$GITHUB_WORKSPACE\/one-person-lab"\s+npm run --prefix redcube-ai build/,
  );
});

test("Full workflow may select OPL Flow without a fixed Framework package catalog", () => {
  const workflow = fs.readFileSync(
    path.join(appRoot, ".github/workflows/full-first-install-release.yml"),
    "utf8",
  );
  assert.doesNotMatch(workflow, /bundled-full-runtime-package-catalog\.json/);
  assert.match(
    workflow,
    /name: Resolve default Full build inputs[\s\S]*name: Checkout OPL Flow[\s\S]*repository: gaofeng21cn\/opl-flow[\s\S]*ref: main[\s\S]*path: opl-flow/,
  );
  assert.match(
    workflow,
    /name: Validate Full source roots[\s\S]*opl-flow\/\.codex-plugin\/plugin\.json/,
  );
  assert.match(
    workflow,
    /OPL_FULL_OPL_FLOW_REF=\$\(git -C opl-flow rev-parse HEAD\)/,
  );
  assert.equal(
    workflow.match(/export OPL_FULL_OPL_FLOW_ROOT="\$GITHUB_WORKSPACE\/opl-flow"/g)?.length,
    2,
  );
});

test("Full workflow checks out MAS Scholar Skills and binds both runtime assembly passes", () => {
  const workflow = fs.readFileSync(
    path.join(appRoot, ".github/workflows/full-first-install-release.yml"),
    "utf8",
  );
  assert.doesNotMatch(workflow, /bundled-full-runtime-package-catalog\.json/);
  assert.match(
    workflow,
    /name: Checkout MAS Scholar Skills[\s\S]*repository: gaofeng21cn\/mas-scholar-skills[\s\S]*ref: main[\s\S]*path: mas-scholar-skills/,
  );
  assert.equal(
    workflow.match(
      /mas_scholar_skills_ref="\$\(git -C mas-scholar-skills rev-parse HEAD\)"/g,
    )?.length,
    1,
  );
  assert.match(
    workflow,
    /echo "OPL_FULL_MAS_SCHOLAR_SKILLS_REF=\$mas_scholar_skills_ref"[\s\S]*\} >> "\$GITHUB_ENV"/,
  );
  assert.match(
    workflow,
    /echo "mas_scholar_skills_ref=\$mas_scholar_skills_ref"[\s\S]*\} >> "\$GITHUB_OUTPUT"/,
  );
  assert.match(
    workflow,
    /name: Validate Full source roots[\s\S]*mas-scholar-skills\/\.codex-plugin\/plugin\.json[\s\S]*mas-scholar-skills\/contracts\/opl_capability_package_manifest\.json/,
  );
  assert.equal(
    workflow.match(/export OPL_FULL_MAS_SCHOLAR_SKILLS_ROOT="\$GITHUB_WORKSPACE\/mas-scholar-skills"/g)?.length,
    2,
  );
  assert.match(
    workflow,
    /assert-full-runtime-currentness\.ts[\s\S]*--mas-scholar-skills-root "\$GITHUB_WORKSPACE\/mas-scholar-skills"/,
  );
});

test("Full workflow provisions the frozen Python through uv on macOS arm64", () => {
  const workflow = fs.readFileSync(
    path.join(appRoot, ".github/workflows/full-first-install-release.yml"),
    "utf8",
  );
  const sourceManifest = JSON.parse(
    fs.readFileSync(
      path.join(appRoot, "contracts/app-full-third-party-source-manifest.json"),
      "utf8",
    ),
  );
  const prunePolicy = JSON.parse(
    fs.readFileSync(
      path.join(appRoot, "contracts/full-runtime-prune-policy.json"),
      "utf8",
    ),
  );

  assert.doesNotMatch(workflow, /actions\/setup-python@/);
  assert.match(
    workflow,
    /astral-sh\/setup-uv@20cfd1bf945f4377ade1205e4dbc17946fc9a30d[\s\S]*version: '0\.11\.29'[\s\S]*download-from-astral-mirror: false[\s\S]*uv python install --managed-python "\$EXPECTED_PYTHON_VERSION"[\s\S]*python_executable="\$\(uv python find --managed-python "\$EXPECTED_PYTHON_VERSION"\)"[\s\S]*uv pip install --python "\$toolchain_root\/bin\/python" --no-deps "uv==\$EXPECTED_UV_VERSION"[\s\S]*OPL_FULL_PYTHON_BIN=\$python_executable/,
  );
  assert.equal(sourceManifest.toolchain.python.version, "3.12.12");
  assert.equal(sourceManifest.toolchain.python.source, "uv-managed CPython standalone release");
  assert.equal(sourceManifest.toolchain.uv.source, "PyPI exact-version distribution");
  const pythonRoot = `python/cpython-${sourceManifest.toolchain.python.version}-macos-aarch64-none/`;
  const pythonExamples = [
    ...prunePolicy.validation_examples.runtime_tree.excluded,
    ...prunePolicy.validation_examples.runtime_tree.retained,
  ].filter((entry: string) => entry.startsWith("python/cpython-"));
  assert.ok(pythonExamples.length > 0);
  assert.ok(pythonExamples.every((entry: string) => entry.startsWith(pythonRoot)));
});

test("Full domain dependency sync uses the frozen carrier Python", () => {
  const workflow = fs.readFileSync(
    path.join(appRoot, ".github/workflows/full-first-install-release.yml"),
    "utf8",
  );

  assert.match(
    workflow,
    /name: Prepare domain runtime dependencies[\s\S]*domain_python="\$OPL_FULL_PYTHON_BIN"[\s\S]*test -x "\$domain_python"[\s\S]*uv sync --project med-autoscience --python "\$domain_python" --no-dev[\s\S]*uv sync --project med-autogrant --python "\$domain_python" --no-dev/,
  );
  assert.doesNotMatch(workflow, /uv sync --project med-auto(?:science|grant) --no-dev/);
});

test("Full Shell build skips the redundant inner App notarization without weakening signing", async () => {
  const { shellBuildEnvironmentWithoutRedundantNotarization } = await import(
    "../../../scripts/build-full-first-install-package.ts"
  );
  const sourceEnv: Record<string, string> = {
    identity: "Developer ID Application: Test (TESTTEAMID)",
    CSC_NAME: "Developer ID Application: Test (TESTTEAMID)",
    OPL_RUNTIME_CODESIGN_IDENTITY: "Developer ID Application: Test (TESTTEAMID)",
    appleId: "release@example.com",
    appleIdPassword: "app-password",
    teamId: "TESTTEAMID",
    OPL_NOTARYTOOL_KEYCHAIN_PROFILE: "release-notary",
    OPL_MAC_STRICT_SIGNING_CHECKS: "true",
    OPL_REQUIRE_MACOS_GATEKEEPER: "true",
    CI: "true",
  };

  const shellEnv = shellBuildEnvironmentWithoutRedundantNotarization(sourceEnv);

  assert.equal(shellEnv.identity, sourceEnv.identity);
  assert.equal(shellEnv.CSC_NAME, sourceEnv.CSC_NAME);
  assert.equal(shellEnv.OPL_RUNTIME_CODESIGN_IDENTITY, sourceEnv.OPL_RUNTIME_CODESIGN_IDENTITY);
  assert.equal(shellEnv.CI, "true");
  for (const name of [
    "appleId",
    "appleIdPassword",
    "teamId",
    "OPL_NOTARYTOOL_KEYCHAIN_PROFILE",
    "OPL_MAC_STRICT_SIGNING_CHECKS",
    "OPL_REQUIRE_MACOS_GATEKEEPER",
  ]) {
    assert.equal(shellEnv[name], undefined, name);
    assert.ok(name in sourceEnv, name);
  }
});

test("Full Shell build preserves pre-signed runtime binaries instead of signing them twice", async (context) => {
  const { withShellFullRuntimeSigningExcluded } = await import(
    "../../../scripts/build-full-first-install-package.ts"
  );
  const shellRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-shell-signing-"));
  const configDir = path.join(shellRoot, "packages", "desktop");
  const configPath = path.join(configDir, "electron-builder.yml");
  const originalConfig = [
    "appId: cn.onepersonlab.opl",
    "mac:",
    "  hardenedRuntime: true",
    "  signIgnore:",
    "    - /Contents/Resources/already-owned(?:/|$)",
    "",
  ].join("\n");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, originalConfig);
  context.after(() => fs.rmSync(shellRoot, { recursive: true, force: true }));

  assert.throws(
    () => withShellFullRuntimeSigningExcluded(shellRoot, () => {
      const effective = parseYaml(fs.readFileSync(configPath, "utf8")) as Record<string, any>;
      assert.deepEqual(effective.mac.signIgnore, [
        "/Contents/Resources/already-owned(?:/|$)",
        "/Contents/Resources/opl-full-runtime(?:/|$)",
      ]);
      throw new Error("test build failure");
    }),
    /test build failure/,
  );
  assert.equal(fs.readFileSync(configPath, "utf8"), originalConfig);
});

test("Full workflow delegates Codex to the Shell AionCore carrier without a Framework install", () => {
  const workflow = fs.readFileSync(
    path.join(appRoot, ".github/workflows/full-first-install-release.yml"),
    "utf8",
  );

  assert.doesNotMatch(workflow, /codex_tarball|codex_platform_tarball|OPL_FULL_CODEX_ROOT/);
  assert.doesNotMatch(workflow, /--codex-root|npm install -g "\$codex_tarball"/);
  const parsed = parseYaml(workflow) as Record<string, any>;
  const steps = parsed.jobs["full-first-install"].steps as Array<Record<string, any>>;
  for (const name of ["Resolve Full runtime cache keys", "Build Full first-install package"]) {
    const step = steps.find((candidate) => candidate.name === name);
    assert.equal(step?.["working-directory"], "release-executor", name);
    assert.match(String(step?.run), /npm (?:--silent )?run release:full --/, name);
    assert.match(
      String(step?.run),
      /--gui-root "\$GITHUB_WORKSPACE\/one-person-lab-app\/shells\/aionui"/,
      name,
    );
    assert.match(
      String(step?.run),
      /--out-dir "\$GITHUB_WORKSPACE\/one-person-lab-app\/dist\/opl-full-release"/,
      name,
    );
  }
  const frozenCheckout = steps.find(
    (candidate) => candidate.name === "Checkout frozen artifact App source",
  );
  assert.equal(frozenCheckout?.with?.path, "one-person-lab-app");
  assert.equal(frozenCheckout?.with?.ref, "${{ inputs.artifact_app_sha || github.sha }}");
});

test("Full runtime cache classifies hit and miss modes from one canonical key", async () => {
  const mod = await import("../../../scripts/full-first-install-package.ts");
  const cacheDir = path.join(os.tmpdir(), "opl-full-runtime-cache-test");
  const key = mod.buildFullRuntimeCacheKey({
    layerId: "opl-runtime",
    parts: {
      opl_commit: "1".repeat(40),
      package_lock_sha256: "2".repeat(64),
    },
  });

  for (const scenario of [
    {
      mode: "readwrite",
      archiveExists: false,
      expected: ["miss_written", false, true, true],
    },
    {
      mode: "readwrite",
      archiveExists: true,
      expected: ["hit", true, false, false],
    },
    {
      mode: "readonly",
      archiveExists: false,
      expected: ["miss_readonly", false, false, true],
    },
    {
      mode: "off",
      archiveExists: true,
      expected: ["disabled", false, false, true],
    },
  ] as const) {
    const result = mod.classifyFullRuntimeLayerCache({
      ...scenario,
      cacheDir,
      layerId: "opl-runtime",
      key,
    });
    assert.deepEqual(
      [result.status, result.read_archive, result.write_archive, result.build_layer],
      scenario.expected,
      scenario.mode,
    );
  }

  const layers = Object.fromEntries(
    mod.FULL_RUNTIME_CACHE_LAYER_IDS.map((id) => [id, `full-runtime-v2-${id}-test`]),
  );
  const aggregate = mod.buildFullRuntimeAggregateCacheKeyInput({ layers });
  assert.equal(aggregate.schema, "opl_full_runtime_cache_aggregate_key.v1");
  assert.deepEqual(aggregate.layer_ids, mod.FULL_RUNTIME_CACHE_LAYER_IDS);
  assert.deepEqual(aggregate.layers, layers);
  assert.deepEqual(
    aggregate.opl_runtime_bundle_consumer,
    mod.buildFullPackageManifest().opl_runtime_bundle_consumer,
  );
});
