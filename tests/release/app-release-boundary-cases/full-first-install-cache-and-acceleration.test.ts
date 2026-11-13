import { appRoot, assert, fs, os, path, spawnSync, test } from "./helpers.ts";
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
    /name: Resolve default Full build inputs[\s\S]*name: Checkout OPL Flow[\s\S]*repository: gaofeng21cn\/opl-flow[\s\S]*ref: \$\{\{ steps\.seed-sources\.outputs\.opl-flow \}\}[\s\S]*path: opl-flow/,
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

test("Full and Standard share the Electron artifact cache surface", () => {
  const full = parseYaml(fs.readFileSync(path.join(appRoot, ".github/workflows/full-first-install-release.yml"), "utf8"));
  const reusable = parseYaml(fs.readFileSync(path.join(appRoot, ".github/workflows/_build-reusable.yml"), "utf8"));
  const fullSteps = full.jobs["full-first-install"].steps as Array<Record<string, any>>;
  const standardSteps = reusable.jobs.build.steps as Array<Record<string, any>>;
  const pathValue = (steps: Array<Record<string, any>>, name: string) => String(
    steps.find((step) => step.name === name)?.with?.path ?? "",
  ).trim();
  const fullPath = pathValue(fullSteps, "Restore Electron artifacts cache");
  const standardPath = pathValue(standardSteps, "Restore Electron artifacts cache");
  assert.equal(fullPath, standardPath);
  assert.match(fullPath, /LOCALAPPDATA.*electron-builder/);
  assert.equal(
    fullSteps.find((step) => step.name === "Summarize Full caches and timings")?.if,
    "${{ always() && !inputs.cache_only }}",
  );
});

test("Standard and Full use one exact compiled renderer cache and one finalizer mount", () => {
  const full = parseYaml(fs.readFileSync(path.join(appRoot, ".github/workflows/full-first-install-release.yml"), "utf8"));
  const reusable = parseYaml(fs.readFileSync(path.join(appRoot, ".github/workflows/_build-reusable.yml"), "utf8"));
  for (const steps of [full.jobs["full-first-install"].steps, reusable.jobs.build.steps]) {
    const restore = steps.find((step: any) => step.name === "Restore exact desktop renderer");
    const save = steps.find((step: any) => step.name === "Save exact desktop renderer");
    assert.ok(restore.uses.endsWith("/.github/actions/desktop-renderer-cache"));
    assert.equal(restore.with.mode, "restore");
    assert.equal(save.with.mode, "save");
    assert.equal(restore.with["shell-root"], save.with["shell-root"]);
  }
  const action = parseYaml(fs.readFileSync(path.join(appRoot, ".github/actions/desktop-renderer-cache/action.yml"), "utf8"));
  const restore = action.runs.steps.find((step: any) => step.id === "restore");
  const save = action.runs.steps.find((step: any) => step.name === "Save compiled renderer");
  assert.equal(restore.with.path, save.with.path);
  assert.equal(restore.with["restore-keys"], undefined);
  assert.match(save.if, /github.ref == 'refs\/heads\/main'/);
  assert.match(save.if, /reusable == 'true'/);
  const finalizer = full.jobs["full-finalizer"].steps.find((step: any) => step.name === "Verify ARM-finalized Full distribution trust and bind manifest");
  assert.equal((finalizer.run.match(/hdiutil attach /g) ?? []).length, 1);
  assert.match(finalizer.run, /--packaged-tree "\$mounted_app_path"/);
  assert.match(finalizer.run, /trap cleanup_mount EXIT/);
  assert.equal(full.jobs["full-finalizer"].steps.some((step: any) => step.name === "Write ARM-finalized Full build artifact cohort manifest"), false);
});

test("Full workflow checks out MAS Scholar Skills and binds both runtime assembly passes", () => {
  const workflow = fs.readFileSync(
    path.join(appRoot, ".github/workflows/full-first-install-release.yml"),
    "utf8",
  );
  assert.doesNotMatch(workflow, /bundled-full-runtime-package-catalog\.json/);
  assert.match(
    workflow,
    /name: Checkout MAS Scholar Skills[\s\S]*repository: gaofeng21cn\/mas-scholar-skills[\s\S]*ref: \$\{\{ steps\.seed-sources\.outputs\.mas-scholar-skills \}\}[\s\S]*path: mas-scholar-skills/,
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

test("Full workflow binds selected seeds to Framework pins and rejects drift before cache assembly", () => {
  const workflow = parseYaml(fs.readFileSync(path.join(appRoot, ".github/workflows/full-first-install-release.yml"), "utf8"));
  const steps = workflow.jobs["full-first-install"].steps;
  const sourceStep = steps.find((step: any) => step.id === "seed-sources");
  const validationStep = steps.find((step: any) => step.name === "Validate Full source roots");
  const validationScript = validationStep.run.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE/)[1];
  const checkouts = steps.filter((step: any) => /^\$\{\{ steps\.seed-sources\.outputs\./.test(step.with?.ref ?? ""));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-seed-pins-"));
  const pins: Record<string, string> = {};
  const git = (cwd: string, args: string[]) => {
    const result = spawnSync("git", ["-c", "user.name=Full Seed Test", "-c", "user.email=full-seed@example.invalid", ...args], { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    fs.symlinkSync(appRoot, path.join(tempRoot, "one-person-lab-app"), "dir");
    const catalog = path.join(tempRoot, "one-person-lab/contracts/opl-framework/packages");
    fs.mkdirSync(catalog, { recursive: true });
    for (const step of checkouts) {
      const id = step.with.ref.match(/outputs\.([^ ]+) /)[1];
      const root = path.join(tempRoot, step.with.path);
      fs.mkdirSync(root, { recursive: true });
      git(root, ["init", "-q"]);
      fs.writeFileSync(path.join(root, "payload.txt"), `${id}\n`);
      git(root, ["add", "."]);
      git(root, ["commit", "-qm", "Pinned package source"]);
      pins[id] = git(root, ["rev-parse", "HEAD"]);
      fs.writeFileSync(path.join(catalog, `${id}.json`), JSON.stringify({
        package_id: id, version: "1.0.0", source_repo: `https://github.com/${step.with.repository}.git`,
        codex_surface: { carrier_source_commit: pins[id] },
      }));
    }
    const output = path.join(tempRoot, "github-output");
    const env = { ...process.env, GITHUB_OUTPUT: output, MAS_SCHOLAR_SKILLS_REF: pins["mas-scholar-skills"] };
    const resolved = spawnSync("bash", ["-c", sourceStep.run], { cwd: tempRoot, env, encoding: "utf8" });
    assert.equal(resolved.status, 0, resolved.stderr);
    assert.deepEqual(Object.fromEntries(fs.readFileSync(output, "utf8").trim().split("\n").map((line) => line.split("="))), pins);
    const verify = () => spawnSync(process.execPath, ["--input-type=module"], {
      cwd: tempRoot, env: { ...env, SEED_SOURCE_REFS: JSON.stringify(pins) }, input: validationScript, encoding: "utf8",
    });
    const matched = verify();
    assert.equal(matched.status, 0, matched.stderr);
    const mas = path.join(tempRoot, "med-autoscience");
    fs.writeFileSync(path.join(mas, "payload.txt"), "same version, newer main\n");
    git(mas, ["add", "."]);
    git(mas, ["commit", "-qm", "Advance source without republishing"]);
    const drifted = verify();
    assert.notEqual(drifted.status, 0);
    assert.match(drifted.stderr, /Full source seed mas resolved .*frozen Framework requires/);
    const conflicted = spawnSync("bash", ["-c", sourceStep.run], {
      cwd: tempRoot, env: { ...env, MAS_SCHOLAR_SKILLS_REF: "f".repeat(40) }, encoding: "utf8",
    });
    assert.notEqual(conflicted.status, 0);
    assert.match(conflicted.stderr, /Admitted Scholar Skills ref differs/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Full workflow provisions the frozen official Python archive on macOS arm64", () => {
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
    /astral-sh\/setup-uv@[0-9a-f]{40}[\s\S]*download-from-astral-mirror: false[\s\S]*curl --fail --location --silent --show-error "\$PYTHON_ARCHIVE_URL"[\s\S]*shasum -a 256 "\$python_archive"[\s\S]*tar -xzf "\$python_archive" --strip-components=1[\s\S]*uv pip install --python "\$toolchain_root\/bin\/python" --no-deps "uv==\$EXPECTED_UV_VERSION"[\s\S]*OPL_FULL_PYTHON_BIN=\$python_executable/,
  );
  for (const tool of ["python", "uv"]) {
    assert.equal(sourceManifest.toolchain[tool].dependency_id, tool);
    assert.equal(sourceManifest.toolchain[tool].selection_policy, "latest_stable_at_operation_start");
    assert.equal(sourceManifest.toolchain[tool].version, undefined);
  }
  assert.match(workflow, /python_version:\.toolchain\.python\.version/);
  const pythonExamples = [
    ...prunePolicy.validation_examples.runtime_tree.excluded,
    ...prunePolicy.validation_examples.runtime_tree.retained,
  ].filter((entry: string) => entry.startsWith("python/cpython-"));
  assert.ok(pythonExamples.length > 0);
  assert.ok(pythonExamples.every((entry: string) => /^python\/cpython-[^/]+-macos-aarch64-none\//.test(entry)));
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
  const configDir = shellRoot;
  const configPath = path.join(configDir, "electron-builder.stable.yml");
  const originalConfig = [
    "appId: cn.onepersonlab.opl",
    "mac:",
    "  hardenedRuntime: true",
    "linux:",
    "  target: deb",
    "",
  ].join("\n");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, originalConfig);
  const runtimeRoot = path.join(shellRoot, "packaged-runtimes", "opl-studio-full-runtime");
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(path.join(runtimeRoot, "manifest.json"), "preserve this payload");
  context.after(() => fs.rmSync(shellRoot, { recursive: true, force: true }));

  assert.throws(
    () => withShellFullRuntimeSigningExcluded(shellRoot, () => {
      const effective = parseYaml(fs.readFileSync(configPath, "utf8")) as Record<string, any>;
      assert.deepEqual(effective.mac.signIgnore, [
        "/Contents/Resources/opl-studio-full-runtime(?:/|$)",
      ]);
      assert.equal(effective.mac.hardenedRuntime, true);
      assert.equal(effective.linux.target, "deb");
      assert.equal(fs.existsSync(runtimeRoot), false);
      throw new Error("test build failure");
    }),
    /test build failure/,
  );
  assert.equal(fs.readFileSync(configPath, "utf8"), originalConfig);
  assert.equal(fs.readFileSync(path.join(runtimeRoot, "manifest.json"), "utf8"), "preserve this payload");
});

test("Full workflow delegates Codex to the active Shell carrier without a Framework install", () => {
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
    assert.match(String(step?.run), /npm (?:--silent )?run release:full(?::app-stable)? --/, name);
    assert.match(
      String(step?.run),
      /--gui-root "\$GITHUB_WORKSPACE\/one-person-lab-app\/\$\{\{ steps\.shell_profile\.outputs\.shell_root \}\}"/,
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
    aggregate.opl_execution_environment_consumer,
    mod.buildFullPackageManifest().opl_execution_environment_consumer,
  );
});
