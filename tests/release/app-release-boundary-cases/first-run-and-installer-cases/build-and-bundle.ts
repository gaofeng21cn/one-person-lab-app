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

test("reusable build validates the Shell consumer after syncing the App product profile", () => {
  const workflow = fs.readFileSync(
    path.join(appRoot, ".github/workflows/_build-reusable.yml"),
    "utf8",
  );
  const syncStep = workflow.indexOf("- name: Prepare standard App payload");
  const consumerGate = workflow.indexOf("- name: Validate synced App product profile consumer");

  assert.ok(syncStep >= 0, "missing App product profile sync step");
  assert.ok(
    consumerGate > syncStep,
    "Shell profile consumer gate must run after App product profile sync",
  );
  assert.match(
    workflow.slice(consumerGate),
    /npm run validate:candidate/,
  );
});

test("reusable build cohort selects the product App without counting nested Electron helpers", () => {
  const workflow = fs.readFileSync(
    path.join(appRoot, ".github/workflows/_build-reusable.yml"),
    "utf8",
  );
  const stepStart = workflow.indexOf("- name: Write build artifact cohort manifest");
  const stepEnd = workflow.indexOf("\n      - name:", stepStart + 1);
  const step = workflow.slice(stepStart, stepEnd);
  assert.ok(stepStart >= 0 && stepEnd > stepStart, "missing build cohort manifest step");
  assert.match(
    step,
    /if: success\(\) && startsWith\(matrix\.platform, 'macos'\)/,
    "DMG/App cohort generation must not run for Linux or Windows source preflight builds",
  );
  assert.match(
    step,
    /find out -maxdepth 2 -type d -name 'One Person Lab\.app' -print \| LC_ALL=C sort/,
  );
  assert.doesNotMatch(step, /find out -type d -name '\*\.app'/);
  assert.match(
    step,
    /if \[ "\$\{#dmg_paths\[@\]\}" -ne 1 \] \|\| \[ "\$\{#packaged_trees\[@\]\}" -ne 1 \]/,
  );
  assert.match(step, /test -d "\$packaged_tree" && test ! -L "\$packaged_tree"/);

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-build-cohort-selector-"));
  const outRoot = path.join(fixtureRoot, "out");
  const productApp = path.join(outRoot, "mac-arm64", "One Person Lab.app");
  const helperRoot = path.join(productApp, "Contents", "Frameworks");
  const select = (args: string[]) => {
    const result = spawnSync("find", args, { cwd: fixtureRoot, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim().split("\n").filter(Boolean);
  };

  try {
    for (const name of [
      "One Person Lab Helper.app",
      "One Person Lab Helper (GPU).app",
      "One Person Lab Helper (Plugin).app",
      "One Person Lab Helper (Renderer).app",
    ]) {
      fs.mkdirSync(path.join(helperRoot, name), { recursive: true });
    }

    assert.equal(select(["out", "-type", "d", "-name", "*.app", "-print"]).length, 5);
    assert.deepEqual(
      select(["out", "-maxdepth", "2", "-type", "d", "-name", "One Person Lab.app", "-print"]),
      ["out/mac-arm64/One Person Lab.app"],
    );

    const duplicateApp = path.join(outRoot, "duplicate", "One Person Lab.app");
    fs.mkdirSync(duplicateApp, { recursive: true });
    assert.equal(
      select(["out", "-maxdepth", "2", "-type", "d", "-name", "One Person Lab.app", "-print"])
        .length,
      2,
    );

    fs.rmSync(productApp, { recursive: true, force: true });
    fs.rmSync(duplicateApp, { recursive: true, force: true });
    assert.equal(
      select(["out", "-maxdepth", "2", "-type", "d", "-name", "One Person Lab.app", "-print"])
        .length,
      0,
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("App product profile check verifies the deterministic compatibility projection without rewriting it", () => {
  const shellRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-profile-sync-"));
  const policyPath = path.join(shellRoot, "workflow-policy.json");
  const previousPolicy = process.env.OPL_FLOW_WORKFLOW_POLICY;
  try {
    const profile = readJson("contracts/app-product-profile.json");
    const productGroupOrder =
      profile.settings.settings_information_architecture.ordinary_groups.map((group) => group.id);
    const carrierFirstSeenGroupOrder = profile.settings.control_plane.ordinary_routes
      .map((route) => route.ia_group)
      .filter((groupId, index, groups) => groups.indexOf(groupId) === index);
    assert.notDeepStrictEqual(
      productGroupOrder,
      carrierFirstSeenGroupOrder,
      "product IA order must remain independent from stable carrier route order",
    );
    assert.deepStrictEqual(
      productGroupOrder,
      profile.settings.control_plane.user_navigation_projection.primary_group_order,
      "product IA order must follow the v2 user-navigation projection",
    );

    writeFile(path.join(shellRoot, "package.json"), "{}\n");
    writeFile(
      policyPath,
      JSON.stringify({
        schema: "opl_flow_workflow_policy.v2",
        package: { id: "opl-flow" },
        provides: [],
        requires: [],
        recommends: [],
        compatible_optional: [],
      }),
    );
    process.env.OPL_FLOW_WORKFLOW_POLICY = policyPath;

    const written = syncAppProductProfileToShell(shellRoot);
    assert.equal(written.synced, true);
    assert.equal(
      fs.readFileSync(written.targetPath, "utf8"),
      fs.readFileSync(path.join(appRoot, "contracts/app-product-profile.json"), "utf8"),
      "Shell must consume the exact App product profile bytes",
    );
    assert.equal(syncAppProductProfileToShell(shellRoot, { check: true }).verified, true);

    fs.appendFileSync(written.targetPath, '{"stale":true}\n');
    assert.throws(
      () => syncAppProductProfileToShell(shellRoot, { check: true }),
      /does not match the deterministic App profile/,
    );
  } finally {
    if (previousPolicy === undefined) delete process.env.OPL_FLOW_WORKFLOW_POLICY;
    else process.env.OPL_FLOW_WORKFLOW_POLICY = previousPolicy;
    fs.rmSync(shellRoot, { recursive: true, force: true });
  }
});

test("reusable release-boundary job validates the App projection without requiring OPL Flow source", () => {
  const workflow = fs.readFileSync(
    path.join(appRoot, ".github/workflows/_build-reusable.yml"),
    "utf8",
  );
  const jobStart = workflow.indexOf("  release-boundary:");
  const jobEnd = workflow.indexOf("\n  active-shell-tests:", jobStart);
  const job = workflow.slice(jobStart, jobEnd);

  assert.ok(jobStart >= 0 && jobEnd > jobStart, "missing reusable release-boundary job");
  assert.doesNotMatch(workflow, /opl_flow_ref:/);
  assert.doesNotMatch(
    job,
    /Checkout OPL Flow policy source|gaofeng21cn\/opl-flow|OPL_FLOW_WORKFLOW_POLICY|OPL_FULL_OPL_FLOW_ROOT|contracts\/workflow-policy\.json|codex:model-policy:check|npm run test:release-boundary/,
  );
  assert.match(
    job,
    /OPL_RELEASE_VALIDATION_PROFILE: \$\{\{ inputs\.release_validation_profile \}\}/,
  );
  assert.match(job, /OPL_RELEASE_SKIP_MODEL_POLICY_CHECK: 'true'/);
  assert.match(job, /run: scripts\/verify\.sh release-boundary/);
});

test("fresh-runner release-boundary jobs install App root dependencies before validation", () => {
  const cases = [
    {
      path: ".github/workflows/release-qualification.yml",
      start: "  release-boundary:",
      end: null,
      install: "npm ci --ignore-scripts",
      validation: "npm run test:release-boundary",
    },
    {
      path: ".github/workflows/_build-reusable.yml",
      start: "  release-boundary:",
      end: "\n  active-shell-tests:",
      install: "npm ci --ignore-scripts",
      validation: "scripts/verify.sh release-boundary",
    },
    {
      path: ".github/workflows/_release-bundle.yml",
      start: "  freeze:",
      end: "\n  standard-build:",
      install: "npm --prefix app-executor ci --ignore-scripts",
      validation: "npm run validate:release-boundary",
    },
  ];

  for (const candidate of cases) {
    const workflow = fs.readFileSync(path.join(appRoot, candidate.path), "utf8");
    const jobStart = workflow.indexOf(candidate.start);
    const jobEnd =
      candidate.end === null ? workflow.length : workflow.indexOf(candidate.end, jobStart);
    const job = workflow.slice(jobStart, jobEnd);
    const install = job.indexOf(candidate.install);
    const validation = job.indexOf(candidate.validation);

    assert.ok(
      jobStart >= 0 && jobEnd > jobStart,
      `missing release-boundary job in ${candidate.path}`,
    );
    assert.ok(
      install >= 0 && validation > install,
      `${candidate.path} must install App root dependencies before validation`,
    );
  }
});

test("fresh-runner release-boundary jobs install active Shell dependencies before W6 validation", () => {
  const cases = [
    {
      path: ".github/workflows/release-qualification.yml",
      start: "  release-boundary:",
      end: null,
      validation: "npm run test:release-boundary",
    },
    {
      path: ".github/workflows/_build-reusable.yml",
      start: "  release-boundary:",
      end: "\n  active-shell-tests:",
      validation: "scripts/verify.sh release-boundary",
    },
  ];

  for (const candidate of cases) {
    const workflow = fs.readFileSync(path.join(appRoot, candidate.path), "utf8");
    const jobStart = workflow.indexOf(candidate.start);
    const jobEnd =
      candidate.end === null ? workflow.length : workflow.indexOf(candidate.end, jobStart);
    const job = workflow.slice(jobStart, jobEnd);
    const setup = job.indexOf("uses: ./.github/actions/setup-active-shell-deps");
    const installShell = job.indexOf("install-dependencies: 'true'", setup);
    const validation = job.indexOf(candidate.validation);

    assert.ok(
      jobStart >= 0 && jobEnd > jobStart,
      `missing release-boundary job in ${candidate.path}`,
    );
    assert.ok(setup >= 0, `${candidate.path} must set up the active Shell before validation`);
    assert.ok(
      installShell > setup && validation > installShell,
      `${candidate.path} must install active Shell dependencies before W6 validation`,
    );
  }
});

test("Bundle freeze gate installs frozen App and Framework dependencies before validation", () => {
  const workflow = fs.readFileSync(
    path.join(appRoot, ".github/workflows/_release-bundle.yml"),
    "utf8",
  );
  const jobStart = workflow.indexOf("  freeze:");
  const jobEnd = workflow.indexOf("\n  standard-build:", jobStart);
  const job = workflow.slice(jobStart, jobEnd);
  const setup = job.indexOf("uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1");
  const install = job.indexOf("npm --prefix app-executor ci --ignore-scripts");
  const installFramework = job.indexOf("npm --prefix framework-source ci --ignore-scripts");
  const validation = job.indexOf("- name: Validate Bundle contracts before paid work");
  const frameworkSourceTest = job.indexOf(
    "node --conditions=opl-source --experimental-strip-types --test ../framework-source/tests/src/cli/cases/release-bundle.test.ts",
  );

  assert.ok(jobStart >= 0 && jobEnd > jobStart, "missing Bundle freeze job");
  assert.ok(setup >= 0 && install > setup, "Bundle cold gate must install with pinned Node");
  assert.ok(
    installFramework > install && validation > installFramework,
    "Bundle cold gate must install frozen App and Framework dependencies before validation",
  );
  assert.ok(
    frameworkSourceTest > validation,
    "Bundle cold gate must resolve Framework workspace packages through source exports",
  );
});

test("reusable Standard build prepares the App projection without an OPL Flow carrier input", () => {
  const workflow = fs.readFileSync(
    path.join(appRoot, ".github/workflows/_build-reusable.yml"),
    "utf8",
  );
  const jobStart = workflow.indexOf("  build:");
  const job = workflow.slice(jobStart);
  const payload = job.indexOf("- name: Prepare standard App payload");

  assert.ok(jobStart >= 0, "missing reusable build job");
  assert.ok(payload >= 0, "missing standard payload preparation");
  assert.doesNotMatch(job, /Checkout OPL Flow policy source|repository: gaofeng21cn\/opl-flow/);
  assert.doesNotMatch(job.slice(payload), /OPL_FLOW_WORKFLOW_POLICY|OPL_FULL_OPL_FLOW_ROOT/);
});
