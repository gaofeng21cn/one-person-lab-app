import { appRoot, assert, fs, os, path, spawnSync, test } from "./helpers.ts";
import { createHash } from "node:crypto";
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
  assert.match(workflow, /export PATH="\$\(dirname "\$OPL_FULL_UV_BIN"\):\$HOME\/go\/bin:\$HOME\/\.local\/bin:\$PATH"/);
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
  const finalizer = parseYaml(fs.readFileSync(path.join(appRoot, ".github/actions/finalize-full/action.yml"), "utf8")).runs.steps.find((step: any) => step.name === "Verify ARM-finalized Full distribution trust and bind manifest");
  assert.equal((finalizer.run.match(/hdiutil attach /g) ?? []).length, 1);
  assert.match(finalizer.run, /--packaged-tree "\$mounted_app_path"/);
  assert.match(finalizer.run, /trap cleanup_mount EXIT/);
  assert.equal(parseYaml(fs.readFileSync(path.join(appRoot, ".github/actions/finalize-full/action.yml"), "utf8")).runs.steps.some((step: any) => step.name === "Write ARM-finalized Full build artifact cohort manifest"), false);
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
    /assert-full-runtime-currentness\.ts[\s\S]*--mas-scholar-skills-root "\$GITHUB_WORKSPACE\/mas-scholar-skills"[\s\\]*--mas-scholar-skills-ref "\$OPL_FULL_MAS_SCHOLAR_SKILLS_REF"/,
  );
  assert.equal(
    workflow.match(/--mas-scholar-skills-ref "\$OPL_FULL_MAS_SCHOLAR_SKILLS_REF"/g)?.length,
    2,
  );
});

test("Full workflow binds selected seeds to the frozen catalog and rejects drift before cache assembly", () => {
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
    const app = path.join(tempRoot, "one-person-lab-app");
    const scripts = path.join(app, "scripts");
    const contracts = path.join(app, "contracts");
    fs.mkdirSync(scripts, { recursive: true });
    fs.mkdirSync(contracts);
    fs.symlinkSync(path.join(appRoot, "scripts/build-full-first-install-package"), path.join(scripts, "build-full-first-install-package"), "dir");
    fs.copyFileSync(path.join(appRoot, "scripts/official-software-catalog.mjs"), path.join(scripts, "official-software-catalog.mjs"));
    const projections = [];
    for (const step of checkouts) {
      const id = step.with.ref.match(/outputs\.([^ ]+) /)[1];
      const root = path.join(tempRoot, step.with.path);
      fs.mkdirSync(root, { recursive: true });
      git(root, ["init", "-q"]);
      fs.writeFileSync(path.join(root, "payload.txt"), `${id}\n`);
      git(root, ["add", "."]);
      git(root, ["commit", "-qm", "Pinned package source"]);
      pins[id] = git(root, ["rev-parse", "HEAD"]);
      projections.push({
        package_id: id,
        manifest: {
          package_id: id, version: "1.0.0", source_repo: `https://github.com/${step.with.repository}.git`,
          codex_surface: { carrier_source_commit: pins[id] },
        },
      });
    }
    const catalog = JSON.stringify({ schema_version: "opl_software_catalog_index.v1", packages: projections });
    const catalogRef = "1".repeat(40);
    fs.writeFileSync(path.join(contracts, "app-software-catalog-source.json"), JSON.stringify({
      repository: "gaofeng21cn/opl-catalog",
      ref: catalogRef,
      index_sha256: `sha256:${createHash("sha256").update(catalog).digest("hex")}`,
    }));
    const fixture = path.join(tempRoot, "catalog-fixture.json");
    fs.writeFileSync(fixture, catalog);
    fs.writeFileSync(path.join(tempRoot, "curl"), [
      "#!/bin/bash",
      'test "${!#}" = "$EXPECTED_FULL_CATALOG_URL" || exit 3',
      'cat "$FULL_CATALOG_FIXTURE"',
      "",
    ].join("\n"), { mode: 0o755 });
    const output = path.join(tempRoot, "github-output");
    const environment = path.join(tempRoot, "github-env");
    const env = {
      ...process.env,
      PATH: [tempRoot, path.dirname(process.execPath), process.env.PATH].join(path.delimiter),
      RUNNER_TEMP: tempRoot,
      GITHUB_OUTPUT: output,
      GITHUB_ENV: environment,
      MAS_SCHOLAR_SKILLS_REF: pins["mas-scholar-skills"],
      EXPECTED_FULL_CATALOG_URL: `https://raw.githubusercontent.com/gaofeng21cn/opl-catalog/${catalogRef}/catalog-index.json`,
      FULL_CATALOG_FIXTURE: fixture,
    };
    const resolved = spawnSync("bash", ["-c", sourceStep.run], { cwd: tempRoot, env, encoding: "utf8" });
    assert.equal(resolved.status, 0, resolved.stderr);
    assert.deepEqual(Object.fromEntries(fs.readFileSync(output, "utf8").trim().split("\n").map((line) => line.split("="))), pins);
    const indexPath = path.join(tempRoot, "opl-full-catalog-index.json");
    assert.equal(fs.readFileSync(environment, "utf8").trim(), `OPL_FULL_CATALOG_INDEX_PATH=${indexPath}`);
    assert.equal(fs.readFileSync(indexPath, "utf8"), catalog);
    const verify = () => spawnSync(process.execPath, ["--input-type=module"], {
      cwd: tempRoot, env: { ...env, OPL_FULL_CATALOG_INDEX_PATH: indexPath, SEED_SOURCE_REFS: JSON.stringify(pins) }, input: validationScript, encoding: "utf8",
    });
    const matched = verify();
    assert.equal(matched.status, 0, matched.stderr);
    const mas = path.join(tempRoot, "med-autoscience");
    fs.writeFileSync(path.join(mas, "payload.txt"), "same version, newer main\n");
    git(mas, ["add", "."]);
    git(mas, ["commit", "-qm", "Advance source without republishing"]);
    const drifted = verify();
    assert.notEqual(drifted.status, 0);
    assert.match(drifted.stderr, /Full source seed mas resolved .*frozen source requires/);
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
    /astral-sh\/setup-uv@[0-9a-f]{40}[\s\S]*download-from-astral-mirror: false[\s\S]*curl --fail --location --silent --show-error "\$PYTHON_ARCHIVE_URL"[\s\S]*shasum -a 256 "\$python_archive"[\s\S]*python_root="\$UV_PYTHON_INSTALL_DIR\/cpython-\$\{EXPECTED_PYTHON_VERSION\}-macos-aarch64-none"[\s\S]*rm -rf "\$python_root"[\s\S]*tar -xzf "\$python_archive" --strip-components=1[\s\S]*uv pip install --python "\$toolchain_root\/bin\/python" --no-deps "uv==\$EXPECTED_UV_VERSION"[\s\S]*OPL_FULL_PYTHON_BIN=\$python_executable/,
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

test("Full release executor installs its own script dependencies before packaging", () => {
  const workflow = fs.readFileSync(
    path.join(appRoot, ".github/workflows/full-first-install-release.yml"),
    "utf8",
  );
  assert.match(
    workflow,
    /name: Install Full release executor dependencies[\s\S]*working-directory: release-executor[\s\S]*npm ci --ignore-scripts --no-audit --no-fund/,
  );
  assert.match(
    workflow,
    /name: Install frozen artifact App dependencies[\s\S]*working-directory: one-person-lab-app[\s\S]*npm ci --ignore-scripts --no-audit --no-fund/,
  );
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

test("Full Shell build preserves carrier resource exclusions and restores the exact YAML", async (context) => {
  const { withShellFullRuntimeSigningExcluded } = await import(
    "../../../scripts/build-full-first-install-package.ts"
  );
  const shellRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-shell-data-signing-"));
  const configPath = path.join(shellRoot, "electron-builder.stable.yml");
  context.after(() => fs.rmSync(shellRoot, { recursive: true, force: true }));
  for (const declared of [
    "  signIgnore: '/fonts/[^/]+[.]ttf$'",
    "  signIgnore:\n    - '/fonts/[^/]+[.]ttf$'\n    - '/Contents/Resources/opl-studio-full-runtime(?:/|$)'",
  ]) {
    const original = `# carrier resource policy\nappId: cn.onepersonlab.opl\nmac:\n${declared}\n  hardenedRuntime: true\nlinux:\n  target: deb\n`;
    fs.writeFileSync(configPath, original);
    withShellFullRuntimeSigningExcluded(shellRoot, () => {
      const effective = parseYaml(fs.readFileSync(configPath, "utf8")) as Record<string, any>;
      assert.deepEqual(effective.mac.signIgnore, [
        "/fonts/[^/]+[.]ttf$",
        "/Contents/Resources/opl-studio-full-runtime(?:/|$)",
      ]);
      assert.equal(effective.mac.hardenedRuntime, true);
      assert.equal(effective.linux.target, "deb");
    });
    assert.equal(fs.readFileSync(configPath, "utf8"), original);
  }
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

test("Full Shell macOS build enforces open-file limit and throttles binary signing probes", async (context) => {
  const { withShellMacosSigningFsPreload } = await import(
    "../../../scripts/build-full-first-install-package.ts"
  );
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-macos-signing-preload-"));
  context.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  const guiRoot = path.join(fixtureRoot, "shell");
  const nodeModules = path.join(guiRoot, "node_modules");
  fs.mkdirSync(path.join(nodeModules, "graceful-fs"), { recursive: true });
  fs.mkdirSync(path.join(nodeModules, "p-limit"), { recursive: true });
  fs.mkdirSync(path.join(nodeModules, "@electron", "osx-sign", "node_modules", "isbinaryfile"), {
    recursive: true,
  });
  fs.writeFileSync(path.join(guiRoot, "package.json"), JSON.stringify({ name: "mock-shell" }));
  fs.writeFileSync(
    path.join(nodeModules, "graceful-fs", "index.js"),
    "exports.gracefulify = (fsMod) => { fsMod.__oplGracefulified = true; };\n",
  );
  fs.writeFileSync(
    path.join(nodeModules, "p-limit", "index.js"),
    [
      "module.exports = function pLimit(concurrency) {",
      "  let active = 0;",
      "  const queue = [];",
      "  const next = () => {",
      "    if (active >= concurrency || queue.length === 0) return;",
      "    active += 1;",
      "    const { fn, resolve, reject } = queue.shift();",
      "    Promise.resolve().then(fn).then(resolve, reject).finally(() => { active -= 1; next(); });",
      "  };",
      "  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });",
      "};",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(nodeModules, "@electron", "osx-sign", "index.js"),
    "module.exports = {};\n",
  );
  fs.writeFileSync(
    path.join(nodeModules, "@electron", "osx-sign", "node_modules", "isbinaryfile", "index.js"),
    [
      "let active = 0;",
      "let peak = 0;",
      "exports.getStats = () => ({ active, peak });",
      "exports.isBinaryFile = async () => {",
      "  active += 1;",
      "  if (active > peak) peak = active;",
      "  try { await new Promise((r) => setTimeout(r, 5)); return false; }",
      "  finally { active -= 1; }",
      "};",
    ].join("\n"),
  );

  let nonDarwinEnv: NodeJS.ProcessEnv = {};
  withShellMacosSigningFsPreload(
    guiRoot,
    { NODE_OPTIONS: "--max-old-space-size=8192" },
    (shellEnv) => {
      nonDarwinEnv = shellEnv;
    },
    "linux",
  );
  assert.equal(nonDarwinEnv.NODE_OPTIONS, "--max-old-space-size=8192");

  let existingPreloadEnv: NodeJS.ProcessEnv = {};
  withShellMacosSigningFsPreload(
    guiRoot,
    { NODE_OPTIONS: "--require=/tmp/opl-macos-signing-fs.cjs" },
    (shellEnv) => {
      existingPreloadEnv = shellEnv;
    },
    "darwin",
  );
  assert.equal(existingPreloadEnv.NODE_OPTIONS, "--require=/tmp/opl-macos-signing-fs.cjs");

  let leakedPreloadPath = "";
  assert.throws(
    () =>
      withShellMacosSigningFsPreload(
        guiRoot,
        { NODE_OPTIONS: "--max-old-space-size=8192" },
        (shellEnv) => {
          const match = String(shellEnv.NODE_OPTIONS).match(/--require="?([^"\s]+)"?/);
          assert.ok(match?.[1], shellEnv.NODE_OPTIONS);
          leakedPreloadPath = match[1];
          assert.ok(fs.existsSync(leakedPreloadPath));
          throw new Error("expected preload failure");
        },
        "darwin",
      ),
    /expected preload failure/,
  );
  assert.equal(fs.existsSync(path.dirname(leakedPreloadPath)), false);

  withShellMacosSigningFsPreload(
    guiRoot,
    { NODE_OPTIONS: "--max-old-space-size=8192" },
    (shellEnv) => {
      assert.match(String(shellEnv.NODE_OPTIONS), /^--max-old-space-size=8192 --require="/);
      const probe = spawnSync(
        process.execPath,
        [
          "-e",
          [
            "const fsMod = require('node:fs');",
            "const { createRequire } = require('node:module');",
            `const fromShell = createRequire(${JSON.stringify(path.join(guiRoot, "package.json"))});`,
            "const fromSign = createRequire(fromShell.resolve('@electron/osx-sign'));",
            "const binary = fromSign('isbinaryfile');",
            "Promise.all(Array.from({ length: 64 }, (_, i) => binary.isBinaryFile(`/tmp/file-${i}`))).then(() => {",
            "  const stats = binary.getStats();",
            "  console.log(JSON.stringify({ gracefulified: Boolean(fsMod.__oplGracefulified), peak: stats.peak }));",
            "});",
          ].join("\n"),
        ],
        { env: { ...process.env, ...shellEnv }, encoding: "utf8" },
      );
      assert.equal(probe.status, 0, probe.stderr);
      const result = JSON.parse(probe.stdout.trim());
      assert.equal(result.gracefulified, true);
      assert.ok(result.peak > 0 && result.peak <= 32, `unexpected concurrency peak ${result.peak}`);
    },
    "darwin",
  );

  const workflow = parseYaml(
    fs.readFileSync(path.join(appRoot, ".github/workflows/full-first-install-release.yml"), "utf8"),
  ) as Record<string, any>;
  const buildStep = (workflow.jobs["full-first-install"].steps as Array<Record<string, any>>).find(
    (step) => step.name === "Build Full first-install package",
  );
  const runScript = String(buildStep?.run ?? "");
  assert.doesNotMatch(runScript, /ulimit -n 65536 \|\| true/);
  assert.match(runScript, /ulimit -S -n 65536 \|\| \{/);
  assert.match(runScript, /macOS Full build open-file limit: \$\(ulimit -S -n\)/);
});
