import {
  assert,
  crypto,
  fs,
  os,
  path,
  spawnSync,
  test,
  appRoot,
  require,
  activeShellRoot,
  runNode,
  writeFile,
  writeExecutable,
  writeReleaseMetadata,
} from "./helpers.ts";
import { pathToFileURL } from "node:url";
import { listFullRuntimeProductionNodeModulePaths } from "../../../scripts/full-first-install-package.ts";
import {
  copyOfficeCliUpstreamSkill,
  copyUiUxProMaxSkill,
} from "../../../scripts/build-full-first-install-package/skills.ts";

function writeJson(filePath, value) {
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function resolveFrameworkSelectedBundleFixture(tempRoot) {
  const producerModulePath = process.env.OPL_FRAMEWORK_DESCRIPTOR_MODULE;
  if (!producerModulePath) return null;
  const { resolveSelectedBundleDescriptor } = await import(
    pathToFileURL(path.resolve(producerModulePath)).href,
  );
  const packageRecord = (packageId, skillRoot) => {
    const carrierRoot = path.join(tempRoot, 'resolved-selected-bundle', packageId);
    writeJson(path.join(carrierRoot, 'owner.json'), { package_id: packageId });
    writeJson(path.join(carrierRoot, '.codex-plugin', 'plugin.json'), {
      name: `${packageId}-plugin`,
      skills: skillRoot ? [skillRoot] : [],
    });
    if (skillRoot) {
      writeFile(path.join(carrierRoot, skillRoot, 'SKILL.md'), `# ${packageId}\n`);
      writeFile(path.join(carrierRoot, skillRoot, 'references', 'nested.md'), 'nested descriptor resource\n');
    }
    return {
      packageId,
      carrierRoot,
      ownerManifestPath: 'owner.json',
      pluginManifestPath: '.codex-plugin/plugin.json',
    };
  };
  const zeroSkill = packageRecord('runtime-zero-skill', '');
  const selectedSkill = packageRecord('runtime-selected-skill', 'skills/runtime-selected-skill');
  const unselected = packageRecord('runtime-unselected-fixed-package', 'skills/runtime-unselected-fixed-package');
  const descriptor = resolveSelectedBundleDescriptor([zeroSkill, selectedSkill]);
  return { descriptor, unselected };
}

function fileSha256Ref(filePath) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
}

function runGit(repoRoot, args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function initializeGitRepo(repoRoot) {
  fs.mkdirSync(repoRoot, { recursive: true });
  runGit(repoRoot, ["init", "-q"]);
  runGit(repoRoot, ["config", "user.name", "Full Runtime Test"]);
  runGit(repoRoot, ["config", "user.email", "full-runtime-test@example.invalid"]);
}

function commitFixtureRepo(repoRoot, message) {
  runGit(repoRoot, ["add", "."]);
  runGit(repoRoot, ["commit", "-q", "-m", message]);
  return runGit(repoRoot, ["rev-parse", "HEAD"]);
}

function writeVersionExecutable(filePath, output) {
  writeExecutable(filePath, `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(output)}\n`);
}

function writeDomainPlugin(root, pluginId) {
  writeJson(path.join(root, "plugins", pluginId, ".codex-plugin", "plugin.json"), {
    name: pluginId,
    skills: "./skills/",
  });
  writeFile(
    path.join(root, "plugins", pluginId, "skills", pluginId, "SKILL.md"),
    `# ${pluginId}\n`,
  );
}

function writeAuthorityFunctionInventory(root, label) {
  writeJson(path.join(root, "contracts", "pack_compiler_input.json"), {
    source_refs: {
      authority_functions_source_ref: "runtime/authority_functions/README.md",
    },
  });
  writeFile(
    path.join(root, "runtime", "authority_functions", "README.md"),
    `# ${label} authority function inventory\n`,
  );
}

test("Full runtime keeps only macOS arm64 platform packages from optional production dependencies", () => {
  const selected = listFullRuntimeProductionNodeModulePaths({
    packages: {
      "": {},
      "node_modules/@swc/core": {},
      "node_modules/@swc/core-darwin-arm64": { optional: true, os: ["darwin"], cpu: ["arm64"] },
      "node_modules/@swc/core-darwin-x64": { optional: true, os: ["darwin"], cpu: ["x64"] },
      "node_modules/@swc/core-linux-arm64-gnu": { optional: true, os: ["linux"], cpu: ["arm64"] },
      "node_modules/e2b": { optional: true },
      "node_modules/test-only": { dev: true },
    },
  });

  assert.deepEqual(selected, [
    "node_modules/@swc/core",
    "node_modules/@swc/core-darwin-arm64",
  ]);
});

test("Full companion skill packaging preserves resource closure and normalizes known upstream frontmatter", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-companion-skills-"));
  const targetRoot = path.join(tempRoot, "packaged");
  const uiUxProMaxRoot = path.join(tempRoot, "ui-ux-pro-max-skill");
  const uiSkillRoot = path.join(uiUxProMaxRoot, ".claude", "skills", "ui-ux-pro-max");
  const officeCliRoot = path.join(tempRoot, "OfficeCLI");
  try {
    writeFile(
      path.join(uiSkillRoot, "SKILL.md"),
      "---\nname: ui-ux-pro-max\ndescription: Fixture skill.\n---\n\nRead `references/pro-rules.md` and `references/quick-reference.md`.\n",
    );
    writeFile(path.join(uiSkillRoot, "references", "pro-rules.md"), "# Pro rules\n");
    writeFile(path.join(uiSkillRoot, "references", "quick-reference.md"), "# Quick reference\n");
    writeFile(path.join(uiSkillRoot, "scripts", "search.py"), "# fixture\n");
    copyUiUxProMaxSkill(targetRoot, { uiUxProMaxRoot });
    assert.equal(fs.existsSync(path.join(targetRoot, "ui-ux-pro-max", "references", "pro-rules.md")), true);
    assert.equal(fs.existsSync(path.join(targetRoot, "ui-ux-pro-max", "references", "quick-reference.md")), true);
    assert.equal(fs.existsSync(path.join(targetRoot, "ui-ux-pro-max", "scripts", "search.py")), true);

    writeFile(
      path.join(officeCliRoot, "skills", "officecli-data-dashboard", "SKILL.md"),
      "---\nname: officecli-data-dashboard\ndescription: Use for a weekly report with ≤ 1 chart and < 10 rows (use xlsx).\n---\n\n# Dashboard\n",
    );
    copyOfficeCliUpstreamSkill("officecli-data-dashboard", targetRoot, { officeCliRoot });
    const packagedDashboard = fs.readFileSync(
      path.join(targetRoot, "officecli-data-dashboard", "SKILL.md"),
      "utf8",
    );
    assert.match(packagedDashboard, /at most 1 chart and fewer than 10 rows/);
    assert.doesNotMatch(packagedDashboard.split("---", 3)[1], /[<>]/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

function writeFrameworkRuntimeSource(frameworkRoot) {
  const temporalPackages = [
    "@temporalio/activity",
    "@temporalio/client",
    "@temporalio/common",
    "@temporalio/worker",
    "@temporalio/workflow",
  ];
  const dependencies = Object.fromEntries(temporalPackages.map((packageName) => [packageName, "1.0.0"]));
  const lockPackages = {
    "": { dependencies },
    ...Object.fromEntries(temporalPackages.map((packageName) => [`node_modules/${packageName}`, {}])),
    "node_modules/@temporalio/core-bridge": {},
    "node_modules/@swc/core": {},
    "node_modules/@swc/core-darwin-arm64": { optional: true, os: ["darwin"], cpu: ["arm64"] },
    "node_modules/@swc/core-linux-x64-gnu": { optional: true, os: ["linux"], cpu: ["x64"] },
    "node_modules/e2b": { optional: true },
  };
  writeJson(path.join(frameworkRoot, "package.json"), {
    name: "fixture-opl-framework",
    version: "0.0.0",
    dependencies,
  });
  writeJson(path.join(frameworkRoot, "package-lock.json"), {
    name: "fixture-opl-framework",
    lockfileVersion: 3,
    packages: lockPackages,
  });
  writeJson(path.join(frameworkRoot, "tsconfig.json"), {});
  for (const packageName of temporalPackages) {
    writeJson(path.join(frameworkRoot, "node_modules", ...packageName.split("/"), "package.json"), {
      name: packageName,
      version: "1.0.0",
    });
  }
  writeFile(
    path.join(
      frameworkRoot,
      "node_modules",
      "@temporalio",
      "core-bridge",
      "releases",
      "aarch64-apple-darwin",
      "index.node",
    ),
    "fixture native module",
  );
  writeJson(path.join(frameworkRoot, "node_modules", "@swc", "core", "package.json"), {
    name: "@swc/core",
    version: "1.0.0",
  });
  writeJson(path.join(frameworkRoot, "node_modules", "@swc", "core-darwin-arm64", "package.json"), {
    name: "@swc/core-darwin-arm64",
    version: "1.0.0",
  });
  writeFile(
    path.join(frameworkRoot, "node_modules", "@swc", "core-darwin-arm64", "swc.darwin-arm64.node"),
    "fixture swc native module",
  );

  const managedUpdate = {
    managed_update: {
      surface_id: "opl_managed_updater_kernel",
      components: [
        { component_id: "opl_base", provider_id: "runtime_substrate" },
        {
          component_id: "opl_app",
          provider_id: "installation_carrier",
          current: { host_update_route: "fixture_host_update" },
          owner_route: { route_kind: "fixture_owner_route" },
        },
        {
          component_id: "opl_packages",
          provider_id: "capability_packages",
          projection_status: { status: "current" },
          profile_migration_status: {
            semantic_merge_required: true,
            silent_overwrite_allowed: false,
          },
        },
      ],
    },
  };
  const appState = {
    app_state: {
      schema_version: "opl_app_state.v1",
      runtime_source_carriers: {
        items: [{ carrier_id: "medautoscience", source_health_status: "ready" }],
      },
    },
  };
  writeExecutable(path.join(frameworkRoot, "bin", "opl"), `#!/bin/sh
expected_scholar_root="$OPL_FULL_RUNTIME_HOME/modules/mas-scholar-skills"
if [ "\${OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS:-}" != "$expected_scholar_root" ]; then
  printf 'MAS Scholar Skills wrapper env mismatch: %s != %s\\n' "\${OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS:-unset}" "$expected_scholar_root" >&2
  exit 3
fi
if [ ! -f "$OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS/.codex-plugin/plugin.json" ]; then
  printf 'MAS Scholar Skills packaged root is incomplete: %s\\n' "$OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS" >&2
  exit 4
fi
case "$*" in
  "update status --json") printf '%s\\n' '${JSON.stringify(managedUpdate)}' ;;
  "app state --profile fast --json") printf '%s\\n' '${JSON.stringify(appState)}' ;;
  *) printf 'unexpected fixture opl args: %s\\n' "$*" >&2; exit 2 ;;
esac
`);
}

function createFullRuntimeFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-scholar-runtime-"));
  const scholarRoot = path.join(tempRoot, "mas-scholar-skills");
  initializeGitRepo(scholarRoot);
  const contentLockPaths = [
    ".codex-plugin/plugin.json",
    "contracts/scholar-skills-capability-modules.json",
    "runtime/reference-provider-adapters/index.ts",
    "skills/mas-scholar-skills/SKILL.md",
  ];
  writeJson(path.join(scholarRoot, ".codex-plugin", "plugin.json"), {
    name: "mas-scholar-skills",
    version: "0.2.3",
    skills: "./skills/",
  });
  writeJson(
    path.join(scholarRoot, "contracts", "scholar-skills-capability-modules.json"),
    { package_id: "mas-scholar-skills" },
  );
  writeFile(path.join(scholarRoot, "skills", "mas-scholar-skills", "SKILL.md"), "# Scholar Skills\n");
  writeFile(
    path.join(scholarRoot, "runtime", "reference-provider-adapters", "index.ts"),
    "export const fixtureAdapter = true;\n",
  );
  const contentLock = {
    algorithm: "sha256",
    canonicalization: "ordered_path_length_file_length_bytes",
    paths: contentLockPaths,
    digest: `sha256:${"a".repeat(64)}`,
  };
  writeJson(path.join(scholarRoot, "contracts", "opl_capability_package_manifest.json"), {
    surface_kind: "opl_capability_package_manifest.v2",
    package_id: "mas-scholar-skills",
    package_role: "framework_capability_package",
    version: "0.2.3",
    capability_abi: {
      id: "mas-scholar-skills.v1",
      version: "1.0.0",
    },
    primary_consumer: {
      agent_id: "mas",
      package_id: "mas",
      dependency_kind: "hard_runtime_dependency",
      required: true,
      version_requirement: ">=0.2.0 <0.3.0",
      capability_abi: "mas-scholar-skills.v1",
    },
    consumer_policy: {
      supported_required_by: ["mas"],
      non_primary_runtime_dependency_supported: false,
    },
    content_lock: contentLock,
  });
  const sourceCommit = commitFixtureRepo(scholarRoot, "fixture scholar source");
  runGit(scholarRoot, ["branch", "scholar-fixture-ref", sourceCommit]);

  const frameworkRoot = path.join(tempRoot, "one-person-lab");
  initializeGitRepo(frameworkRoot);
  writeFrameworkRuntimeSource(frameworkRoot);
  const frameworkCommit = commitFixtureRepo(frameworkRoot, "fixture framework source");

  const masRoot = path.join(tempRoot, "med-autoscience");
  const magRoot = path.join(tempRoot, "med-autogrant");
  const rcaRoot = path.join(tempRoot, "redcube-ai");
  const metaAgentRoot = path.join(tempRoot, "opl-meta-agent");
  const bookforgeRoot = path.join(tempRoot, "opl-bookforge");
  const oplFlowRoot = path.join(tempRoot, "opl-flow");
  writeDomainPlugin(masRoot, "med-autoscience");
  writeDomainPlugin(magRoot, "med-autogrant");
  writeDomainPlugin(rcaRoot, "redcube-ai");
  writeDomainPlugin(metaAgentRoot, "opl-meta-agent");
  writeDomainPlugin(bookforgeRoot, "opl-bookforge");
  writeJson(path.join(masRoot, "contracts", "opl_agent_package_manifest.json"), {
    surface_kind: "opl_agent_package_manifest.v1",
    package_id: "mas",
    version: "0.2.6",
    capability_dependencies: [
      {
        package_id: "mas-scholar-skills",
        kind: "framework_capability_package",
        required: true,
        version_requirement: ">=0.2.0 <0.3.0",
        capability_abi: "mas-scholar-skills.v1",
      },
    ],
  });
  for (const [root, label] of [
    [masRoot, "MAS"],
    [magRoot, "MAG"],
    [rcaRoot, "RCA"],
    [bookforgeRoot, "OBF"],
  ]) {
    writeAuthorityFunctionInventory(root, label);
  }
  writeJson(path.join(metaAgentRoot, "contracts", "pack_compiler_input.json"), {
    source_refs: {},
  });
  writeJson(path.join(oplFlowRoot, ".codex-plugin", "plugin.json"), {
    name: "opl-flow",
    skills: "./skills/",
  });
  writeJson(path.join(oplFlowRoot, "contracts", "workflow-policy.json"), {
    schema: "opl_flow_workflow_policy.v3",
    package: { id: "opl-flow" },
    provides: [],
    requires: [
      {
        kind: "codex_skill",
        id: "agent-reach",
        source: "https://github.com/Panniantong/Agent-Reach",
        source_path: "agent_reach/skill",
      },
    ],
    recommends: [],
    compatible_optional: [],
  });
  writeFile(path.join(oplFlowRoot, "templates", "AGENTS.md"), "# OPL Flow fixture\n");
  writeFile(path.join(oplFlowRoot, "skills", "opl-flow", "SKILL.md"), "# OPL Flow\n");

  const packageRoots = {
    mas: masRoot,
    mag: magRoot,
    rca: rcaRoot,
    oma: metaAgentRoot,
    obf: bookforgeRoot,
    "mas-scholar-skills": scholarRoot,
    "opl-flow": oplFlowRoot,
  };
  for (const [packageId, sourceRoot] of Object.entries(packageRoots)) {
    if (packageId === "mas-scholar-skills") continue;
    initializeGitRepo(sourceRoot);
    commitFixtureRepo(sourceRoot, `fixture ${packageId} source`);
  }

  const officeCliRoot = path.join(tempRoot, "OfficeCLI");
  const mineruRoot = path.join(tempRoot, "MinerU-Ecosystem");
  const mineruDocumentExtractorRoot = path.join(tempRoot, "mineru-document-extractor");
  const uiUxProMaxRoot = path.join(tempRoot, "ui-ux-pro-max-skill");
  for (const root of [officeCliRoot, mineruRoot, mineruDocumentExtractorRoot, uiUxProMaxRoot]) {
    fs.mkdirSync(root, { recursive: true });
  }

  const toolsRoot = path.join(tempRoot, "tools");
  const codexRoot = path.join(toolsRoot, "codex-package");
  const codexVendorRoot = path.join(toolsRoot, "codex-vendor", "aarch64-apple-darwin");
  const codexBin = path.join(codexVendorRoot, "bin", "codex");
  const rgBin = path.join(codexVendorRoot, "codex-path", "rg");
  writeJson(path.join(codexRoot, "package.json"), { name: "@openai/codex", version: "1.0.0" });
  writeVersionExecutable(codexBin, "codex-cli 1.0.0");
  writeVersionExecutable(rgBin, "ripgrep 1.0.0");

  const nodeRoot = path.join(toolsRoot, "node");
  const nodeBin = path.join(nodeRoot, "bin", "node");
  const npmBin = path.join(nodeRoot, "bin", "npm");
  const npxBin = path.join(nodeRoot, "bin", "npx");
  const npmRoot = path.join(nodeRoot, "lib", "node_modules", "npm");
  writeVersionExecutable(nodeBin, "v22.0.0");
  writeVersionExecutable(npmBin, "10.0.0");
  writeVersionExecutable(npxBin, "10.0.0");
  writeJson(path.join(npmRoot, "package.json"), { name: "npm", version: "10.0.0" });
  writeFile(path.join(npmRoot, "lib", "cli.js"), "// npm fixture\n");

  const pythonRoot = path.join(toolsRoot, "cpython-3.12-fixture-macos-aarch64-none");
  const uvBin = path.join(toolsRoot, "uv");
  const temporalCliBin = path.join(toolsRoot, "temporal");
  const temporalCliArchive = path.join(toolsRoot, "temporal.tar.gz");
  const officeCliBin = path.join(toolsRoot, "officecli");
  const mineruOpenApiBin = path.join(toolsRoot, "mineru-open-api");
  writeVersionExecutable(path.join(pythonRoot, "bin", "python3"), "Python 3.12.0");
  writeVersionExecutable(uvBin, "uv 0.1.0");
  writeVersionExecutable(temporalCliBin, "temporal 1.0.0");
  writeFile(temporalCliArchive, "fixture temporal archive");
  writeVersionExecutable(officeCliBin, "officecli 0.0.1");
  writeVersionExecutable(mineruOpenApiBin, "mineru-open-api 0.0.1");

  const options = {
    version: "26.7.15-scholar-fixture",
    outDir: path.join(tempRoot, "out"),
    frameworkRoot,
    frameworkRef: "framework-fixture-ref",
    guiRoot: path.join(tempRoot, "gui"),
    masRoot,
    masRef: "mas-fixture-ref",
    masScholarSkillsRoot: scholarRoot,
    masScholarSkillsRef: "scholar-fixture-ref",
    magRoot,
    magRef: "mag-fixture-ref",
    rcaRoot,
    rcaRef: "rca-fixture-ref",
    metaAgentRoot,
    metaAgentRef: "oma-fixture-ref",
    bookforgeRoot,
    bookforgeRef: "obf-fixture-ref",
    oplFlowRoot,
    oplFlowRef: "flow-fixture-ref",
    officeCliRoot,
    officeCliRef: "v0.0.1",
    officeCliRelease: {
      requested_ref: "v0.0.1",
      resolved_ref: "v0.0.1",
      resolved_commit: null,
      latest_stable_verified: true,
      policy: "fixture",
      version: "0.0.1",
    },
    mineruRoot,
    mineruRef: "mineru-fixture-ref",
    mineruDocumentExtractorRoot,
    uiUxProMaxRoot,
    uiUxProMaxRef: "ui-fixture-ref",
    includeBunRuntime: false,
    runtimeCacheDir: path.join(tempRoot, "cache"),
    runtimeCacheMode: "off",
  };
  const sources = {
    codexRoot,
    codexBinaries: { vendorRoot: codexVendorRoot, codex: codexBin, rg: rgBin },
    nodeToolchain: { nodeBin, npmBin, npxBin, npmRoot },
    bunBin: null,
    pythonRoot,
    uvBin,
    temporalCliBin,
    temporalCliArchive,
    officeCliBin,
    mineruOpenApiBin,
    mineruRepoRoot: null,
  };
  return { tempRoot, options, sources, sourceCommit, frameworkCommit };
}

test("publish rejects standard App artifacts that contain the Full runtime payload", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-app-release-full-leak-"));
  const shellRoot = path.join(tempRoot, "shells", "aionui");
  const outDir = path.join(shellRoot, "out");
  const version = "26.5.15";
  const dmgName = `One-Person-Lab-${version}-mac-arm64.dmg`;

  writeFile(path.join(outDir, dmgName));
  writeFile(path.join(outDir, `One-Person-Lab-${version}-mac-arm64.zip`));
  writeReleaseMetadata(outDir, version, dmgName);
  writeFile(
    path.join(
      shellRoot,
      "out",
      "mac-arm64",
      "One Person Lab.app",
      "Contents",
      "Resources",
      "opl-full-runtime",
      "runtime",
      "current",
      "manifest",
      "full-package-manifest.json",
    ),
    "{}\n",
  );

  const result = runNode([
    "scripts/publish-release.ts",
    "--no-build",
    "--dry-run",
    "--shell-root",
    shellRoot,
    "--version",
    version,
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /contains Full runtime payload/);
});

test("packaged runtime validator only requires Full runtime when explicitly requested", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-app-packaged-runtime-"));
  const resourcesRoot = path.join(tempRoot, "One Person Lab.app", "Contents", "Resources");
  const asarPath = path.join(resourcesRoot, "app.asar");

  fs.mkdirSync(resourcesRoot, { recursive: true });
  fs.writeFileSync(asarPath, "", "utf8");

  const validator = require(path.join(activeShellRoot, "scripts", "validate-packaged-runtime.js"));
  const optional = validator.validateFullRuntimeResources(resourcesRoot, { require: false });
  const required = validator.validateFullRuntimeResources(resourcesRoot, { require: true });

  assert.equal(optional.checked, false);
  assert.deepEqual(optional.issues, []);
  assert.equal(required.checked, false);
  assert.match(required.issues.join("\n"), /missing opl-full-runtime extraResource/);
});

test("Full first-install manifest consumes the OPL runtime bundle boundary instead of owning dependency truth", async () => {
  const mod = await import("../../../scripts/full-first-install-package.ts");
  const manifest = mod.buildFullPackageManifest({ version: "26.6.21-bundle-consumer" });

  assert.equal(manifest.opl_runtime_bundle_consumer.app_repo_role, "consumer_only");
  assert.equal(manifest.opl_runtime_bundle_consumer.dependency_truth_owner, false);
  assert.equal(
    manifest.opl_runtime_bundle_consumer.consumption_boundary
      .keeps_full_offline_first_install_payloads,
    true,
  );
  assert.equal(
    manifest.opl_runtime_bundle_consumer.consumption_boundary
      .can_delete_required_offline_payloads_for_size,
    false,
  );
  const releaseContract = JSON.parse(
    fs.readFileSync(path.join(appRoot, "contracts", "app-release-channel.json"), "utf8"),
  );
  assert.ok(
    releaseContract.full_first_install.payload_boundary.allowed_actions.includes(
      "copy_framework_catalog_declared_capability_package_payloads",
    ),
  );
});

test("Full runtime wrapper labels only its own Temporal default as packaged local", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-wrapper-"));
  const runtimeRoot = path.join(tempRoot, "runtime");
  const runtimeCommand = path.join(runtimeRoot, "opl", "bin", "opl");
  writeExecutable(
    runtimeCommand,
    [
      "#!/bin/bash",
      "printf '%s|%s\\n' \"${OPL_TEMPORAL_ADDRESS:-unset}\" \"${OPL_TEMPORAL_ADDRESS_SOURCE:-unset}\"",
      "",
    ].join("\n"),
  );

  try {
    const { writeRuntimeWrappers } =
      await import("../../../scripts/full-first-install-runtime-wrappers.ts");
    writeRuntimeWrappers(runtimeRoot);
    const wrapperPath = path.join(runtimeRoot, "bin", "opl");
    const baseEnv = { ...process.env };
    delete baseEnv.OPL_TEMPORAL_ADDRESS;
    delete baseEnv.OPL_TEMPORAL_ADDRESS_SOURCE;

    const runWrapper = (overrides = {}) => {
      const result = spawnSync(wrapperPath, [], {
        encoding: "utf8",
        env: { ...baseEnv, ...overrides },
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      return result.stdout.trim();
    };

    assert.equal(runWrapper(), "127.0.0.1:7233|packaged_local_default");
    assert.equal(
      runWrapper({ OPL_TEMPORAL_ADDRESS: "temporal.example:7233" }),
      "temporal.example:7233|unset",
    );
    assert.equal(
      runWrapper({ OPL_TEMPORAL_ADDRESS: "127.0.0.1:7233" }),
      "127.0.0.1:7233|unset",
    );
    assert.equal(
      runWrapper({
        OPL_TEMPORAL_ADDRESS: "temporal.example:7233",
        OPL_TEMPORAL_ADDRESS_SOURCE: "operator_environment",
      }),
      "temporal.example:7233|operator_environment",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Full runtime executable discovery fails closed on duplicate archive or Python candidates", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-runtime-duplicate-candidates-"));
  const runtimeRoot = path.join(tempRoot, "runtime");
  try {
    const { writeTemporalCliWrapper, writeCodexCliWrapper } =
      await import("../../../scripts/build-full-first-install-package/runtime-layers.ts");
    const { writeRuntimeWrappers } =
      await import("../../../scripts/full-first-install-runtime-wrappers.ts");

    const makeDuplicateArchive = (archivePath, relativePaths) => {
      const sourceRoot = fs.mkdtempSync(path.join(tempRoot, "archive-source-"));
      for (const relativePath of relativePaths) {
        writeExecutable(path.join(sourceRoot, relativePath), "#!/bin/sh\nexit 0\n");
      }
      fs.mkdirSync(path.dirname(archivePath), { recursive: true });
      const result = spawnSync("tar", ["-czf", archivePath, "-C", sourceRoot, "."], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    };

    const temporalWrapper = path.join(runtimeRoot, "bin", "temporal");
    writeTemporalCliWrapper(temporalWrapper, "temporal 1.0.0");
    makeDuplicateArchive(
      path.join(runtimeRoot, "vendor", "temporal", "temporal_cli_darwin_arm64.tar.gz"),
      ["one/temporal", "two/temporal"],
    );
    const temporal = spawnSync(temporalWrapper, ["server"], { encoding: "utf8" });
    assert.notEqual(temporal.status, 0);
    assert.match(temporal.stderr, /multiple executable temporal binaries/);

    const codexWrapper = path.join(runtimeRoot, "bin", "codex");
    writeCodexCliWrapper(codexWrapper, "codex-cli 1.0.0");
    makeDuplicateArchive(
      path.join(runtimeRoot, "vendor", "codex", "codex_cli_darwin_arm64.tar.gz"),
      ["one/bin/codex", "two/bin/codex"],
    );
    const codex = spawnSync(codexWrapper, ["exec"], { encoding: "utf8" });
    assert.notEqual(codex.status, 0);
    assert.match(codex.stderr, /multiple executable codex binaries/);

    writeExecutable(path.join(runtimeRoot, "opl", "bin", "opl"), "#!/bin/sh\nexit 0\n");
    fs.mkdirSync(path.join(runtimeRoot, "python", "3.11", "bin"), { recursive: true });
    fs.mkdirSync(path.join(runtimeRoot, "python", "3.12", "bin"), { recursive: true });
    writeRuntimeWrappers(runtimeRoot);
    const opl = spawnSync(path.join(runtimeRoot, "bin", "opl"), [], { encoding: "utf8" });
    assert.notEqual(opl.status, 0);
    assert.match(opl.stderr, /multiple Python bin roots/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("real Full domain and prepareRuntime builders package the current MAS Scholar Skills closure", async () => {
  const fixture = createFullRuntimeFixture();
  const selectedBundle = await resolveFrameworkSelectedBundleFixture(fixture.tempRoot);
  const previousStrictSigning = process.env.OPL_MAC_STRICT_SIGNING_CHECKS;
  process.env.OPL_MAC_STRICT_SIGNING_CHECKS = "false";
  let prepared;
  try {
    const { buildDomainLayer, writeDomainMarkers } =
      await import("../../../scripts/build-full-first-install-package/runtime-layers.ts");
    const directLayerRoot = path.join(fixture.tempRoot, "direct-domain-layer");
    buildDomainLayer(directLayerRoot, fixture.options);
    const directScholarRoot = path.join(
      directLayerRoot,
      "modules",
      "mas-scholar-skills",
    );
    assert.equal(
      fs.readFileSync(path.join(directScholarRoot, "skills", "mas-scholar-skills", "SKILL.md"), "utf8"),
      "# Scholar Skills\n",
    );
    assert.equal(
      fs.existsSync(path.join(directScholarRoot, "runtime", "reference-provider-adapters", "index.ts")),
      true,
    );
    writeDomainMarkers(directLayerRoot, fixture.options, "2026-07-15T00:00:00.000Z");
    assert.equal(fs.existsSync(path.join(directScholarRoot, "opl-runtime-module.json")), false);

    const { prepareRuntime } =
      await import("../../../scripts/build-full-first-install-package/staging.ts");
    prepared = prepareRuntime(
      fixture.options,
      fixture.sources,
      selectedBundle ? { resolvedSelectedBundleDescriptor: selectedBundle.descriptor } : {},
    );
    const packagedSkillsRoot = path.join(prepared.runtimeRoot, "skills");
    assert.equal(
      fs.existsSync(path.join(packagedSkillsRoot, "agent-reach")),
      false,
      "Flow dependencies must be installed by Framework reconciliation, not copied by App packaging",
    );
    assert.equal(
      prepared.manifest.components.skills.source_path,
      selectedBundle
        ? 'resolved_selected_bundle_descriptor'
        : "contracts/app-product-profile.json#companion_payloads",
    );
    assert.equal(
      prepared.manifest.components.skills.role,
      "packaged_codex_skill_carrier_seeds_declared_by_app_product_profile",
    );
    if (selectedBundle) {
      assert.equal(
        prepared.manifest.components.skills.source_path,
        'resolved_selected_bundle_descriptor',
      );
      assert.deepEqual(fs.readdirSync(packagedSkillsRoot).sort(), ['runtime-selected-skill']);
      assert.equal(
        fs.readFileSync(path.join(packagedSkillsRoot, 'runtime-selected-skill', 'references', 'nested.md'), 'utf8'),
        'nested descriptor resource\n',
      );
      assert.equal(
        fs.existsSync(path.join(packagedSkillsRoot, selectedBundle.unselected.packageId)),
        false,
      );
      assert.equal(
        prepared.runtime_cache.key_inputs.skills.resolved_selected_bundle.digest,
        selectedBundle.descriptor.digest,
      );
      assert.deepEqual(
        prepared.runtime_cache.key_inputs.skills.resolved_selected_bundle.package_ids,
        ['runtime-zero-skill', 'runtime-selected-skill'],
      );
      assert.equal(
        prepared.manifest.runtime_assertions.resolved_selected_bundle_descriptor.digest,
        selectedBundle.descriptor.digest,
      );
      assert.equal(
        prepared.runtime_cache.currentness.resolved_selected_bundle_checksum_status,
        'verified',
      );
      assert.equal('app_product_profile_sha256' in prepared.runtime_cache.key_inputs.skills, false);
      assert.equal('med_autoscience_skill_source' in prepared.runtime_cache.key_inputs.skills, false);
      assert.equal('skills_packager_sha256' in prepared.runtime_cache.key_inputs.skills, false);
      fs.rmSync(path.join(fixture.tempRoot, 'resolved-selected-bundle'), {
        recursive: true,
        force: true,
      });
      const { assertFullRuntimeCurrentness: assertSourceFreeCurrentness } =
        await import("../../../scripts/build-full-first-install-package/runtime-currentness.ts");
      const sourceFreeCurrentness = assertSourceFreeCurrentness(prepared.runtimeRoot, {
        frameworkRoot: fixture.options.frameworkRoot,
        masRoot: fixture.options.masRoot,
        masScholarSkillsRoot: fixture.options.masScholarSkillsRoot,
        masScholarSkillsRef: fixture.options.masScholarSkillsRef,
      });
      assert.equal(sourceFreeCurrentness.resolved_selected_bundle_descriptor_digest, selectedBundle.descriptor.digest);
      assert.equal(sourceFreeCurrentness.resolved_selected_bundle_checksum_status, 'verified');
    }
    const skillsCacheInputs = prepared.runtime_cache.key_inputs.skills;
    assert.equal("opl_flow_commit" in skillsCacheInputs, false);
    assert.equal("opl_flow_workflow_policy_sha256" in skillsCacheInputs, false);
    const packagedScholarRoot = path.join(
      prepared.runtimeRoot,
      "modules",
      "mas-scholar-skills",
    );
    assert.equal(
      fs.readFileSync(path.join(packagedScholarRoot, "skills", "mas-scholar-skills", "SKILL.md"), "utf8"),
      "# Scholar Skills\n",
    );
    assert.equal(
      fs.existsSync(path.join(packagedScholarRoot, "runtime", "reference-provider-adapters", "index.ts")),
      true,
    );
    assert.equal(fs.existsSync(path.join(packagedScholarRoot, "opl-runtime-module.json")), false);

    const wrapper = fs.readFileSync(path.join(prepared.runtimeRoot, "bin", "opl"), "utf8");
    assert.match(
      wrapper,
      /export OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS="\$RUNTIME_HOME\/modules\/mas-scholar-skills"/,
    );

    const component = prepared.manifest.components.mas_scholar_skills;
    assert.equal(component.source_path, fixture.options.masScholarSkillsRoot);
    assert.equal(component.git_commit, fixture.sourceCommit);
    assert.equal(component.required, true);
    assert.deepEqual(component.required_by, ["mas"]);
    assert.equal(component.visible_in_first_run_ui, false);
    assert.equal(component.standard_domain_agent, false);

    const resolved = prepared.resolved_refs.mas_scholar_skills;
    assert.equal(resolved.requested_ref, "scholar-fixture-ref");
    assert.equal(resolved.requested_ref_commit, fixture.sourceCommit);
    assert.equal(resolved.resolved_commit, fixture.sourceCommit);
    assert.equal(resolved.owner_source_commit, fixture.sourceCommit);
    assert.equal(resolved.package_role, "framework_capability_package");
    assert.equal(resolved.runtime_module_relative_path, "modules/mas-scholar-skills");
    assert.equal(resolved.mas_manifest_ref, "contracts/opl_agent_package_manifest.json");
    assert.match(resolved.mas_manifest_sha256, /^sha256:[a-f0-9]{64}$/);
    assert.match(resolved.source_manifest_sha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(resolved.payload_file_count, 4);
    assert.equal(resolved.checksum_status, "verified");
    assert.equal(resolved.currentness_status, "current");
    assert.equal(resolved.currentness.mas_dependency_edge_matches_owner_manifests, true);
    assert.equal(resolved.currentness.requested_ref_matches_selected_source, true);
    assert.equal(resolved.currentness.selected_source_files_verified, true);

    const requiredPayloads = prepared.manifest.runtime_assertions.offline_required_payloads;
    assert.equal(
      new Set(requiredPayloads.map((entry) => entry.path)).size,
      requiredPayloads.length,
      "offline required payload assertions must have unique paths",
    );
    for (const entryPath of [
      "opl/node_modules/@swc/core-darwin-arm64/swc.darwin-arm64.node",
      "modules/mas-scholar-skills/.codex-plugin/plugin.json",
      "modules/mas-scholar-skills/contracts/opl_capability_package_manifest.json",
      "modules/mas-scholar-skills/runtime/reference-provider-adapters/index.ts",
      "modules/mas-scholar-skills/skills/mas-scholar-skills/SKILL.md",
    ]) {
      assert.equal(
        requiredPayloads.find((entry) => entry.path === entryPath)?.exists,
        true,
        entryPath,
      );
    }

    const domainCacheInputs = prepared.runtime_cache.key_inputs["domain-runtime"];
    assert.equal(domainCacheInputs.selected_package_set.profile_id, "starter");
    assert.equal(domainCacheInputs.selected_package_set.packages.length, 7);
    assert.equal(
      domainCacheInputs.selected_package_set.packages.find(
        (entry) => entry.package_id === "mas-scholar-skills",
      ).source_commit,
      fixture.sourceCommit,
    );
    assert.match(
      domainCacheInputs.source_fingerprints["mas-scholar-skills"],
      /^[a-f0-9]{64}$/,
    );
    assert.equal(
      prepared.runtime_cache.selected_package_set.identity,
      domainCacheInputs.selected_package_set.identity,
    );
    assert.equal(prepared.runtime_cache.currentness.framework_commit, fixture.frameworkCommit);
    assert.equal(
      prepared.runtime_cache.currentness.mas_scholar_skills_commit,
      fixture.sourceCommit,
    );
    assert.equal(
      prepared.runtime_cache.currentness.mas_scholar_skills_checksum_status,
      "verified",
    );
    assert.equal(
      prepared.runtime_cache.currentness.mas_scholar_skills_currentness_status,
      "current",
    );
    assert.equal(
      prepared.runtime_cache.currentness.mas_scholar_skills_payload_file_count,
      4,
    );

    const { assertFullRuntimeCurrentness } =
      await import("../../../scripts/build-full-first-install-package/runtime-currentness.ts");
    writeFile(
      path.join(packagedScholarRoot, "skills", "mas-scholar-skills", "SKILL.md"),
      "# drifted packaged Scholar Skills\n",
    );
    assert.throws(
      () => assertFullRuntimeCurrentness(prepared.runtimeRoot, {
        frameworkRoot: fixture.options.frameworkRoot,
        masRoot: fixture.options.masRoot,
        masScholarSkillsRoot: fixture.options.masScholarSkillsRoot,
        masScholarSkillsRef: fixture.options.masScholarSkillsRef,
      }),
      /packaged MAS Scholar Skills payload skills\/mas-scholar-skills\/SKILL\.md checksum drifted/,
    );
    writeFile(
      path.join(packagedScholarRoot, "skills", "mas-scholar-skills", "SKILL.md"),
      "# Scholar Skills\n",
    );
    const packagedOwnerManifestPath = path.join(
      packagedScholarRoot,
      "contracts",
      "opl_capability_package_manifest.json",
    );
    const packagedOwnerManifest = JSON.parse(
      fs.readFileSync(packagedOwnerManifestPath, "utf8"),
    );
    packagedOwnerManifest.package_id = "mas-scholar-skills-drifted";
    writeJson(packagedOwnerManifestPath, packagedOwnerManifest);
    assert.throws(
      () => assertFullRuntimeCurrentness(prepared.runtimeRoot, {
        frameworkRoot: fixture.options.frameworkRoot,
        masRoot: fixture.options.masRoot,
        masScholarSkillsRoot: fixture.options.masScholarSkillsRoot,
        masScholarSkillsRef: fixture.options.masScholarSkillsRef,
      }),
      /packaged MAS Scholar Skills owner capability manifest checksum drifted/,
    );
    fs.copyFileSync(
      path.join(
        fixture.options.masScholarSkillsRoot,
        "contracts",
        "opl_capability_package_manifest.json",
      ),
      packagedOwnerManifestPath,
    );
    const packagedManifestPath = path.join(
      prepared.runtimeRoot,
      "manifest",
      "full-package-manifest.json",
    );
    const packagedManifest = JSON.parse(fs.readFileSync(packagedManifestPath, "utf8"));
    packagedManifest.resolved_refs.mas_scholar_skills.mas_manifest_ref =
      "contracts/drifted-mas-manifest.json";
    writeJson(packagedManifestPath, packagedManifest);
    assert.throws(
      () => assertFullRuntimeCurrentness(prepared.runtimeRoot, {
        frameworkRoot: fixture.options.frameworkRoot,
        masRoot: fixture.options.masRoot,
        masScholarSkillsRoot: fixture.options.masScholarSkillsRoot,
        masScholarSkillsRef: fixture.options.masScholarSkillsRef,
      }),
      /resolved MAS Scholar Skills mas_manifest_ref drifted/,
    );
  } finally {
    if (previousStrictSigning === undefined) delete process.env.OPL_MAC_STRICT_SIGNING_CHECKS;
    else process.env.OPL_MAC_STRICT_SIGNING_CHECKS = previousStrictSigning;
    if (prepared?.stagingRoot) {
      fs.rmSync(prepared.stagingRoot, { recursive: true, force: true });
    }
    fs.rmSync(fixture.tempRoot, { recursive: true, force: true });
  }
});

test("MAS Scholar Skills source resolution requires the selected ref and records selected bytes", async () => {
  const fixture = createFullRuntimeFixture();
  try {
    const { resolveMasScholarSkillsFullRuntimeSource } =
      await import("../../../scripts/build-full-first-install-package/manifest-checksum.ts");
    assert.throws(
      () => resolveMasScholarSkillsFullRuntimeSource({
        ...fixture.options,
        masScholarSkillsRoot: path.join(fixture.tempRoot, "missing-mas-scholar-skills"),
      }),
      /MAS Scholar Skills root is missing/,
    );
    assert.throws(
      () => resolveMasScholarSkillsFullRuntimeSource({
        ...fixture.options,
        masScholarSkillsRef: "missing-scholar-ref",
      }),
      /git rev-parse --verify missing-scholar-ref\^\{commit\}/,
    );

    const current = resolveMasScholarSkillsFullRuntimeSource(fixture.options);
    assert.equal(current.source_commit, fixture.sourceCommit);
    assert.equal(current.checksum_status, "verified");
    const skillPath = path.join(
      fixture.options.masScholarSkillsRoot,
      "skills",
      "mas-scholar-skills",
      "SKILL.md",
    );
    const originalSkillChecksum = current.payload_files.find(
      (entry) => entry.path === "skills/mas-scholar-skills/SKILL.md",
    ).sha256;
    writeFile(
      skillPath,
      "# drifted Scholar Skills\n",
    );
    const changed = resolveMasScholarSkillsFullRuntimeSource(fixture.options);
    assert.notEqual(
      changed.payload_files.find(
        (entry) => entry.path === "skills/mas-scholar-skills/SKILL.md",
      ).sha256,
      originalSkillChecksum,
    );
  } finally {
    fs.rmSync(fixture.tempRoot, { recursive: true, force: true });
  }
});

test("MAS Scholar Skills source resolution rejects ref, owner dependency, ABI, and content-path drift", async () => {
  const { resolveMasScholarSkillsFullRuntimeSource } =
    await import("../../../scripts/build-full-first-install-package/manifest-checksum.ts");
  const commitFixture = createFullRuntimeFixture();
  const ownerFixture = createFullRuntimeFixture();
  const dependencyFixture = createFullRuntimeFixture();
  const contentLockFixture = createFullRuntimeFixture();
  try {
    writeFile(
      path.join(commitFixture.options.masScholarSkillsRoot, "README.md"),
      "commit drift\n",
    );
    const driftCommit = commitFixtureRepo(
      commitFixture.options.masScholarSkillsRoot,
      "fixture source commit drift",
    );
    assert.match(driftCommit, /^[a-f0-9]{40}$/);
    assert.throws(
      () => resolveMasScholarSkillsFullRuntimeSource(commitFixture.options),
      /checkout HEAD .* does not match requested ref scholar-fixture-ref/,
    );

    const ownerManifestPath = path.join(
      ownerFixture.options.masScholarSkillsRoot,
      "contracts",
      "opl_capability_package_manifest.json",
    );
    const ownerManifest = JSON.parse(fs.readFileSync(ownerManifestPath, "utf8"));
    ownerManifest.package_id = "mas-scholar-skills-drifted";
    writeJson(ownerManifestPath, ownerManifest);
    assert.throws(
      () => resolveMasScholarSkillsFullRuntimeSource(ownerFixture.options),
      /owner manifest package_id drifted/,
    );

    const masManifestPath = path.join(
      dependencyFixture.options.masRoot,
      "contracts",
      "opl_agent_package_manifest.json",
    );
    const masManifest = JSON.parse(fs.readFileSync(masManifestPath, "utf8"));
    const scholarDependency = { ...masManifest.capability_dependencies[0] };
    const assertInvalidMasDependency = () => {
      writeJson(masManifestPath, masManifest);
      assert.throws(
        () => resolveMasScholarSkillsFullRuntimeSource(dependencyFixture.options),
        /must require MAS Scholar Skills exactly once/,
      );
    };

    masManifest.capability_dependencies = [];
    assertInvalidMasDependency();
    masManifest.capability_dependencies = [
      { ...scholarDependency, package_id: "mas-scholar-skills-drifted" },
    ];
    assertInvalidMasDependency();
    masManifest.capability_dependencies = [{ ...scholarDependency, required: false }];
    assertInvalidMasDependency();
    masManifest.capability_dependencies = [scholarDependency, { ...scholarDependency }];
    assertInvalidMasDependency();

    masManifest.capability_dependencies = [scholarDependency];
    writeJson(masManifestPath, masManifest);
    const sourceManifestPath = path.join(
      dependencyFixture.options.masScholarSkillsRoot,
      "contracts",
      "opl_capability_package_manifest.json",
    );
    const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
    sourceManifest.capability_abi.id = "mas-scholar-skills.v2";
    writeJson(sourceManifestPath, sourceManifest);
    assert.throws(
      () => resolveMasScholarSkillsFullRuntimeSource(dependencyFixture.options),
      /ABI does not satisfy the MAS owner manifest/,
    );

    const contentManifestPath = path.join(
      contentLockFixture.options.masScholarSkillsRoot,
      "contracts",
      "opl_capability_package_manifest.json",
    );
    const contentManifest = JSON.parse(fs.readFileSync(contentManifestPath, "utf8"));
    contentManifest.content_lock.paths.push("skills/missing/SKILL.md");
    writeJson(contentManifestPath, contentManifest);
    assert.throws(
      () => resolveMasScholarSkillsFullRuntimeSource(contentLockFixture.options),
      /selected source skills\/missing\/SKILL\.md is missing/,
    );
  } finally {
    for (const fixture of [commitFixture, ownerFixture, dependencyFixture, contentLockFixture]) {
      fs.rmSync(fixture.tempRoot, { recursive: true, force: true });
    }
  }
});

test("Full runtime currentness consumes the Framework managed update component array", async () => {
  const { assertManagedUpdateProbe } =
    await import("../../../scripts/build-full-first-install-package/runtime-currentness.ts");
  const components = Object.entries({
    opl_app: "installation_carrier",
    opl_base: "runtime_substrate",
    opl_packages: "capability_packages",
  }).map(([component_id, provider_id]) => ({ component_id, provider_id }));
  Object.assign(components[0], {
    current: { host_update_route: "carrier_specific_host_update_route_required" },
    owner_route: { route_kind: "manual_owner_route" },
  });
  Object.assign(components[2], {
    projection_status: { status: "current" },
    profile_migration_status: { semantic_merge_required: true, silent_overwrite_allowed: false },
  });

  const current = assertManagedUpdateProbe({
    managed_update: {
      surface_id: "opl_managed_updater_kernel",
      components,
    },
  });
  assert.equal(current.components, components);
  assert.throws(
    () =>
      assertManagedUpdateProbe({
        managed_update: {
          surface_id: "opl_managed_updater_kernel",
          components: components.map((component) =>
            component.component_id === "opl_base"
              ? { ...component, provider_id: "wrong-provider" }
              : component,
          ),
        },
      }),
    /component opl_base uses provider wrong-provider/,
  );
  assert.throws(
    () =>
      assertManagedUpdateProbe({
        managed_update: {
          surface_id: "opl_managed_updater_kernel",
          components: Object.fromEntries(
            components.map((component) => [component.component_id, component]),
          ),
        },
      }),
    /expected array at managed_update.components/,
  );
});

test("Full runtime currentness consumes the canonical runtime source carrier projection", async () => {
  const { assertAppStateProbe } =
    await import("../../../scripts/build-full-first-install-package/runtime-currentness.ts");
  const appState = assertAppStateProbe({
    app_state: {
      schema_version: "opl_app_state.v1",
      runtime_source_carriers: {
        items: [{ carrier_id: "medautoscience", source_health_status: "ready" }],
      },
    },
  });

  assert.equal(appState.schema_version, "opl_app_state.v1");
  assert.throws(
    () =>
      assertAppStateProbe({
        app_state: {
          schema_version: "opl_app_state.v1",
          modules: { items: [{ module_id: "medautoscience", health_status: "ready" }] },
        },
      }),
    /expected object at app_state\.runtime_source_carriers/,
  );
});

test("Full runtime pruning keeps macOS arm64 launch payloads without development environments", async () => {
  const mod = await import("../../../scripts/full-first-install-package.ts");
  const policy = JSON.parse(
    fs.readFileSync(path.join(appRoot, "contracts", "full-runtime-prune-policy.json"), "utf8"),
  );

  for (const relativePath of policy.validation_examples.runtime_tree.excluded) {
    assert.equal(mod.shouldExcludeRuntimePath(relativePath), true, relativePath);
  }
  for (const relativePath of policy.validation_examples.runtime_tree.retained) {
    assert.equal(mod.shouldExcludeRuntimePath(relativePath), false, relativePath);
  }
  for (const relativePath of policy.validation_examples.production_node_modules.excluded) {
    assert.equal(mod.shouldExcludeProductionNodeModulePath(relativePath), true, relativePath);
  }
  for (const relativePath of policy.validation_examples.production_node_modules.retained) {
    assert.equal(mod.shouldExcludeProductionNodeModulePath(relativePath), false, relativePath);
  }
  for (const relativePath of policy.validation_examples.node_toolchain_global_packages.excluded) {
    assert.equal(mod.shouldExcludeNodeToolchainPackagePath(relativePath), true, relativePath);
  }
  for (const relativePath of policy.validation_examples.node_toolchain_global_packages.retained) {
    assert.equal(mod.shouldExcludeNodeToolchainPackagePath(relativePath), false, relativePath);
  }

  assert.equal(mod.FULL_RUNTIME_PRUNE_POLICY.schema, "opl_full_runtime_prune_policy.v1");
  assert.equal(mod.FULL_RUNTIME_PRUNE_POLICY.id, "full_runtime_offline_first_install_slim_v1");
  assert.equal(mod.FULL_RUNTIME_PRUNE_POLICY.mode, "explicit_non_runtime_prune_only");
  assert.equal(
    mod.FULL_RUNTIME_PRUNE_POLICY_PATH,
    path.join(appRoot, "contracts", "full-runtime-prune-policy.json"),
  );
  assert.deepEqual(mod.FULL_RUNTIME_PRUNE_POLICY.runtime_tree, policy.runtime_tree);
  assert.match(mod.buildFullRuntimePrunePolicyHash(), /^[a-f0-9]{64}$/);
  assert.equal(
    mod.buildFullPackageManifest({ version: "26.5.15" }).runtime_prune_policy.id,
    mod.FULL_RUNTIME_PRUNE_POLICY.id,
  );

  const auditResult = runNode(["scripts/audit-full-runtime-prune-policy.ts", "--json"]);
  assert.equal(auditResult.status, 0, auditResult.stderr);
  const audit = JSON.parse(auditResult.stdout);
  assert.equal(audit.schema, "opl_full_runtime_prune_policy_audit.v1");
  assert.equal(audit.source_of_truth, "contracts/full-runtime-prune-policy.json");
  assert.equal(audit.policy_id, policy.id);
  assert.equal(audit.policy_hash, mod.buildFullRuntimePrunePolicyHash());
  assert.equal(audit.examples.status, "passed");
  assert.equal(audit.examples.failures.length, 0);

  const auditRuntimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-prune-audit-runtime-"));
  writeFile(path.join(auditRuntimeRoot, "modules", "mas", "logs", "latest.log"), "log");
  writeFile(path.join(auditRuntimeRoot, "modules", "mas", "src", "index.py"), 'print("ok")');
  writeFile(
    path.join(auditRuntimeRoot, "node", "lib", "node_modules", "npm", "docs", "readme.md"),
    "docs",
  );
  writeFile(
    path.join(auditRuntimeRoot, "node", "lib", "node_modules", "npm", "lib", "cli.js"),
    "cli",
  );
  writeFile(path.join(auditRuntimeRoot, "node", "bin", "node"), "node");
  writeFile(
    path.join(auditRuntimeRoot, "opl", "node_modules", "@temporalio", "client", "docs", "api.md"),
    "docs",
  );
  writeFile(
    path.join(auditRuntimeRoot, "opl", "node_modules", "@temporalio", "client", "lib", "index.js"),
    "client",
  );
  const baselinePath = path.join(auditRuntimeRoot, "baseline-audit.json");
  writeFile(
    baselinePath,
    JSON.stringify({
      runtime_scan: {
        excluded_paths: ["modules/mas/tmp/old.tmp", "node/lib/node_modules/npm/docs"],
      },
    }),
  );
  const scanResult = runNode([
    "scripts/audit-full-runtime-prune-policy.ts",
    "--json",
    "--runtime-root",
    auditRuntimeRoot,
    "--baseline",
    baselinePath,
    "--top",
    "5",
  ]);
  assert.equal(scanResult.status, 0, scanResult.stderr);
  const scanAudit = JSON.parse(scanResult.stdout);
  assert.equal(scanAudit.runtime_scan.runtime_root, auditRuntimeRoot);
  assert.ok(scanAudit.runtime_scan.excluded_paths.includes("modules/mas/logs"));
  assert.ok(scanAudit.runtime_scan.excluded_paths.includes("modules/mas/logs/latest.log"));
  assert.ok(scanAudit.runtime_scan.excluded_paths.includes("node/lib/node_modules/npm/docs"));
  assert.ok(
    scanAudit.runtime_scan.excluded_paths.includes("node/lib/node_modules/npm/docs/readme.md"),
  );
  assert.ok(
    scanAudit.runtime_scan.excluded_paths.includes("opl/node_modules/@temporalio/client/docs"),
  );
  assert.ok(
    scanAudit.runtime_scan.excluded_paths.includes(
      "opl/node_modules/@temporalio/client/docs/api.md",
    ),
  );
  assert.ok(
    !scanAudit.runtime_scan.excluded_paths.includes("node/lib/node_modules/npm/lib/cli.js"),
  );
  assert.ok(!scanAudit.runtime_scan.excluded_paths.includes("opl/node_modules"));
  assert.ok(!scanAudit.runtime_scan.excluded_paths.includes("opl/node_modules/@temporalio/client"));
  assert.ok(
    !scanAudit.runtime_scan.excluded_paths.includes(
      "opl/node_modules/@temporalio/client/lib/index.js",
    ),
  );
  assert.ok(scanAudit.runtime_scan.excluded_bytes > 0);
  assert.ok(scanAudit.runtime_scan.excluded_by_surface.runtime_tree >= 2);
  assert.ok(scanAudit.runtime_scan.excluded_by_surface.node_toolchain_global_packages >= 2);
  assert.ok(scanAudit.runtime_scan.excluded_by_surface.production_node_modules >= 2);
  assert.ok(scanAudit.runtime_scan.top_excluded_paths.length <= 5);
  assert.equal(scanAudit.runtime_scan.runtime_assertions.prune_policy_id, policy.id);
  assert.equal(
    scanAudit.runtime_scan.runtime_assertions.prune_policy_hash,
    mod.buildFullRuntimePrunePolicyHash(),
  );
  assert.ok(
    scanAudit.runtime_scan.runtime_assertions.declared_pruned_paths.some(
      (entry) => entry.path === "node/lib/node_modules/npm/docs" && entry.expected === "absent",
    ),
  );
  assert.ok(scanAudit.runtime_scan_diff.added_excluded_paths.includes("modules/mas/logs"));
  assert.ok(scanAudit.runtime_scan_diff.removed_excluded_paths.includes("modules/mas/tmp/old.tmp"));
});

test("Full domain copy keeps only contract-declared authority inventories from runtime trees", async () => {
  const { buildDomainLayer } =
    await import("../../../scripts/build-full-first-install-package/runtime-layers.ts");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-mas-authority-inventory-"));
  const sourceRoot = path.join(tempRoot, "source");
  const layerRoot = path.join(tempRoot, "layer");
  const options = {
    masRoot: path.join(sourceRoot, "mas"),
    masScholarSkillsRoot: path.join(sourceRoot, "mas-scholar-skills"),
    magRoot: path.join(sourceRoot, "mag"),
    rcaRoot: path.join(sourceRoot, "rca"),
    metaAgentRoot: path.join(sourceRoot, "meta-agent"),
    bookforgeRoot: path.join(sourceRoot, "bookforge"),
    oplFlowRoot: path.join(sourceRoot, "opl-flow"),
  };

  try {
    for (const moduleRoot of Object.values(options)) {
      fs.mkdirSync(moduleRoot, { recursive: true });
    }
    const declaredModules = [
      [options.masRoot, "mas", "MAS"],
      [options.magRoot, "mag", "MAG"],
      [options.rcaRoot, "rca", "RCA"],
      [options.bookforgeRoot, "bookforge", "OBF"],
    ];
    for (const [moduleRoot, moduleName, label] of declaredModules) {
      writeAuthorityFunctionInventory(moduleRoot, label);
      writeFile(path.join(moduleRoot, "runtime", "authority_functions", "debug-cache.json"), "{}\n");
      writeFile(path.join(moduleRoot, "runtime", "legacy-state.json"), "{}\n");
      writeFile(path.join(moduleRoot, "src", "index.py"), 'print("ready")\n');
    }
    writeJson(path.join(options.metaAgentRoot, "contracts", "pack_compiler_input.json"), {
      source_refs: {},
    });
    writeFile(path.join(options.masRoot, "runtime-state", "checkpoint.json"), "{}\n");
    writeFile(path.join(options.masRoot, "runs", "latest.json"), "{}\n");
    writeFile(path.join(options.masRoot, "sessions", "current.json"), "{}\n");
    writeFile(path.join(options.masRoot, "cache", "result.json"), "{}\n");
    buildDomainLayer(layerRoot, options);

    for (const relativePath of declaredModules.flatMap(([, moduleName]) => [
      `modules/${moduleName}/runtime/authority_functions/README.md`,
      `modules/${moduleName}/src/index.py`,
    ])) {
      assert.equal(fs.existsSync(path.join(layerRoot, relativePath)), true, relativePath);
    }
    for (const relativePath of [
      ...declaredModules.flatMap(([, moduleName]) => [
        `modules/${moduleName}/runtime/authority_functions/debug-cache.json`,
        `modules/${moduleName}/runtime/legacy-state.json`,
      ]),
      "modules/mas/runtime-state/checkpoint.json",
      "modules/mas/runs/latest.json",
      "modules/mas/sessions/current.json",
      "modules/mas/cache/result.json",
      "modules/meta-agent/runtime/authority_functions/README.md",
    ]) {
      assert.equal(fs.existsSync(path.join(layerRoot, relativePath)), false, relativePath);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Full App bundle staging trim removes non-runtime artifacts while preserving offline runtime payloads", async () => {
  const { trimFullAppBundleForDmg, auditFullPackageBundleBoundaries, withFullPackageOptimization } =
    await import("../../../scripts/build-full-first-install-package/package-optimization.ts");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-app-bundle-trim-"));
  const appPath = path.join(tempRoot, "One Person Lab.app");
  writeFile(path.join(appPath, "Contents", "Resources", "app.asar"), "app");
  writeFile(path.join(appPath, "Contents", "Resources", "app.asar.map"), "map");
  writeFile(
    path.join(appPath, "Contents", "Resources", "bundled-aioncore", "runtime.js.map"),
    "shell map",
  );
  writeFile(
    path.join(appPath, "Contents", "Resources", "app.asar.unpacked", "native.node.map"),
    "native map",
  );
  writeFile(
    path.join(
      appPath,
      "Contents",
      "Frameworks",
      "Electron Framework.framework",
      "Resources",
      "electron.js.map",
    ),
    "electron map",
  );
  writeFile(path.join(appPath, "Contents", "Resources", "test-results", "result.json"), "{}");
  writeFile(
    path.join(
      appPath,
      "Contents",
      "Resources",
      "opl-full-runtime",
      "runtime",
      "current",
      "bin",
      "opl",
    ),
    "runtime",
  );
  writeFile(
    path.join(appPath, "Contents", "Resources", "bundled-aioncore", "node"),
    "shell-runtime",
  );
  writeFile(
    path.join(
      appPath,
      "Contents",
      "Frameworks",
      "Electron Framework.framework",
      "Electron Framework",
    ),
    "electron",
  );

  const trimReport = trimFullAppBundleForDmg(appPath);
  assert.equal(trimReport.schema, "opl_full_app_bundle_trim_report.v1");
  assert.equal(trimReport.required_payload_boundary.preserved, true);
  assert.equal(fs.existsSync(path.join(appPath, "Contents", "Resources", "app.asar.map")), false);
  assert.equal(fs.existsSync(path.join(appPath, "Contents", "Resources", "test-results")), false);
  assert.equal(
    fs.existsSync(
      path.join(
        appPath,
        "Contents",
        "Resources",
        "opl-full-runtime",
        "runtime",
        "current",
        "bin",
        "opl",
      ),
    ),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(appPath, "Contents", "Resources", "bundled-aioncore", "node")),
    true,
  );
  assert.equal(
    fs.existsSync(
      path.join(appPath, "Contents", "Resources", "bundled-aioncore", "runtime.js.map"),
    ),
    true,
  );
  assert.equal(
    fs.existsSync(
      path.join(appPath, "Contents", "Resources", "app.asar.unpacked", "native.node.map"),
    ),
    true,
  );
  assert.equal(
    fs.existsSync(
      path.join(
        appPath,
        "Contents",
        "Frameworks",
        "Electron Framework.framework",
        "Resources",
        "electron.js.map",
      ),
    ),
    true,
  );

  const boundaryAudit = auditFullPackageBundleBoundaries(appPath, {
    package_kind: "opl_full_first_install_macos_arm64",
    version: "26.6.21-size-opt",
  });
  assert.equal(
    boundaryAudit.standard_app_boundary.standard_package_allowed_to_contain_full_runtime,
    false,
  );
  assert.equal(boundaryAudit.full_package_boundary.contains_opl_full_runtime, true);
  assert.equal(boundaryAudit.full_package_boundary.contains_shell_runtime, true);
  const manifest = withFullPackageOptimization(
    { manifest_version: 2, package_kind: "opl_full_first_install_macos_arm64" },
    { trimReport, boundaryAudit },
  );
  assert.equal(manifest.package_optimization.offline_first_install_completeness_preserved, true);
  assert.equal(manifest.package_optimization.size_review_release_blocking_by_size_alone, false);
  assert.deepEqual(manifest.package_optimization.required_evidence, [
    'full-package-manifest.json#runtime_assertions.offline_required_payloads',
    'full-runtime-native-trust.json',
  ]);
  assert.deepEqual(manifest.package_optimization.optional_certification_evidence, [
    {
      id: 'full_dmg_clean_vm_smoke',
      policy: 'post_publication_optional_non_blocking',
      allowed_statuses: ['passed', 'failed', 'not_run', 'unavailable'],
    },
  ]);
  assert.equal(
    manifest.package_optimization.app_bundle_trim.bytes_removed,
    trimReport.bytes_removed,
  );

  const incompleteAudit = auditFullPackageBundleBoundaries(path.join(tempRoot, "Incomplete.app"), {
    package_kind: "opl_full_first_install_macos_arm64",
    version: "26.6.21-size-opt",
  });
  assert.throws(
    () =>
      withFullPackageOptimization(
        { manifest_version: 2, package_kind: "opl_full_first_install_macos_arm64" },
        { trimReport, boundaryAudit: incompleteAudit },
      ),
    /did not preserve the declared offline first-install App bundle boundary/,
  );
});

test("Full runtime node payload prunes package-only docs while preserving offline launch executables", async () => {
  const { copyNodeRuntimePayload } =
    await import("../../../scripts/build-full-first-install-package/filesystem.ts");
  const { collectRuntimeAssertions } =
    await import("../../../scripts/build-full-first-install-package/runtime-layers.ts");
  const { writeFullRuntimeManifest } =
    await import("../../../scripts/build-full-first-install-package/manifest-checksum.ts");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-node-prune-"));
  const sourceRoot = path.join(tempRoot, "node-source");
  const targetRoot = path.join(tempRoot, "runtime", "node");

  writeExecutable(path.join(sourceRoot, "bin", "node"), "#!/bin/sh\nexit 0\n");
  writeExecutable(path.join(sourceRoot, "bin", "npm"), "#!/bin/sh\nexit 0\n");
  writeExecutable(path.join(sourceRoot, "bin", "npx"), "#!/bin/sh\nexit 0\n");
  writeFile(path.join(sourceRoot, "include", "node", "node.h"), "header");
  writeFile(path.join(sourceRoot, "share", "man", "man1", "node.1"), "manual");
  writeFile(
    path.join(sourceRoot, "lib", "node_modules", "npm", "package.json"),
    '{"name":"npm"}\n',
  );
  writeFile(path.join(sourceRoot, "lib", "node_modules", "npm", "lib", "cli.js"), "runtime");
  writeFile(
    path.join(
      sourceRoot,
      "lib",
      "node_modules",
      "npm",
      "node_modules",
      "@npmcli",
      "arborist",
      "lib",
      "index.js",
    ),
    "runtime",
  );
  writeFile(path.join(sourceRoot, "lib", "node_modules", "npm", "docs", "config.md"), "docs");
  writeFile(path.join(sourceRoot, "lib", "node_modules", "npm", "man", "man1", "npm.1"), "manual");
  writeFile(
    path.join(sourceRoot, "lib", "node_modules", "npm", "tap-snapshots", "install.snap"),
    "snapshot",
  );
  writeFile(
    path.join(sourceRoot, "lib", "node_modules", "corepack", "dist", "corepack.js"),
    "runtime",
  );
  writeFile(
    path.join(sourceRoot, "lib", "node_modules", "corepack", "tests", "corepack.test.js"),
    "test",
  );

  copyNodeRuntimePayload(sourceRoot, targetRoot);

  for (const relativePath of [
    "bin/node",
    "bin/npm",
    "bin/npx",
    "lib/node_modules/npm/lib/cli.js",
    "lib/node_modules/npm/node_modules/@npmcli/arborist/lib/index.js",
    "lib/node_modules/corepack/dist/corepack.js",
  ]) {
    assert.equal(fs.existsSync(path.join(targetRoot, relativePath)), true, relativePath);
  }
  for (const relativePath of [
    "include",
    "share",
    "lib/node_modules/npm/docs",
    "lib/node_modules/npm/man",
    "lib/node_modules/npm/tap-snapshots",
    "lib/node_modules/corepack/tests",
  ]) {
    assert.equal(fs.existsSync(path.join(targetRoot, relativePath)), false, relativePath);
  }

  const runtimeRoot = path.join(tempRoot, "runtime");
  writeExecutable(path.join(runtimeRoot, "bin", "codex"), "#!/bin/sh\nexit 0\n");
  writeFile(
    path.join(runtimeRoot, "vendor", "codex", "codex_cli_darwin_arm64.tar.gz"),
    "codex archive",
  );
  writeExecutable(path.join(runtimeRoot, "bin", "temporal"), "#!/bin/sh\nexit 0\n");
  writeFile(
    path.join(runtimeRoot, "vendor", "temporal", "temporal_cli_darwin_arm64.tar.gz"),
    "temporal archive",
  );
  writeFile(
    path.join(runtimeRoot, "opl", "node_modules", "@swc", "core-darwin-arm64", "swc.darwin-arm64.node"),
    "swc native binding",
  );
  writeExecutable(path.join(runtimeRoot, "uv", "bin", "uv"), "#!/bin/sh\nexit 0\n");
  writeExecutable(path.join(runtimeRoot, "bin", "officecli"), "#!/bin/sh\nexit 0\n");
  writeExecutable(path.join(runtimeRoot, "bin", "mineru-open-api"), "#!/bin/sh\nexit 0\n");
  for (const skillId of ["med-autoscience", "med-autogrant", "redcube-ai", "opl-bookforge"]) {
    writeFile(path.join(runtimeRoot, "skills", skillId, "SKILL.md"), "# skill\n");
  }
  for (const [modulePath, pluginId] of [
    ["modules/mas", "med-autoscience"],
    ["modules/mag", "med-autogrant"],
    ["modules/rca", "redcube-ai"],
  ]) {
    writeFile(
      path.join(runtimeRoot, modulePath, "plugins", pluginId, ".codex-plugin", "plugin.json"),
      "{}\n",
    );
    writeFile(
      path.join(runtimeRoot, modulePath, "plugins", pluginId, "skills", pluginId, "SKILL.md"),
      "# skill\n",
    );
  }
  const authorityFunctionModules = [
    ["modules/mas", "MAS"],
    ["modules/mag", "MAG"],
    ["modules/rca", "RCA"],
    ["modules/bookforge", "OBF"],
  ];
  for (const [modulePath, label] of authorityFunctionModules) {
    writeAuthorityFunctionInventory(path.join(runtimeRoot, modulePath), label);
  }
  writeJson(path.join(runtimeRoot, "modules/meta-agent/contracts/pack_compiler_input.json"), {
    source_refs: {},
  });
  for (const relativePath of [
    "modules/opl-flow/contracts/workflow-policy.json",
    "modules/opl-flow/templates/AGENTS.md",
    "modules/opl-flow/skills/opl-flow/SKILL.md",
    "modules/opl-flow/skills/future-flow-skill/SKILL.md",
  ]) {
    writeFile(
      path.join(runtimeRoot, relativePath),
      relativePath.endsWith(".json") ? "{}\n" : "# fixture\n",
    );
  }
  writeFile(
    path.join(runtimeRoot, "modules/opl-flow/.codex-plugin/plugin.json"),
    '{"skills":"./skills/"}\n',
  );
  writeFile(
    path.join(runtimeRoot, "modules/mas-scholar-skills/.codex-plugin/plugin.json"),
    '{"name":"mas-scholar-skills","skills":"./skills/"}\n',
  );
  writeFile(
    path.join(runtimeRoot, "modules/mas-scholar-skills/skills/mas-scholar-skills/SKILL.md"),
    "# Scholar Skills\n",
  );
  writeFile(
    path.join(
      runtimeRoot,
      "modules/mas-scholar-skills/contracts/opl_capability_package_manifest.json",
    ),
    JSON.stringify({
      package_id: "mas-scholar-skills",
      content_lock: {
        paths: [
          ".codex-plugin/plugin.json",
          "skills/mas-scholar-skills/SKILL.md",
        ],
      },
    }),
  );

  const assertions = collectRuntimeAssertions(runtimeRoot);
  assert.equal(assertions.prune_policy_id, "full_runtime_offline_first_install_slim_v1");
  assert.match(assertions.prune_policy_hash, /^[a-f0-9]{64}$/);
  assert.deepEqual(assertions.packaged_global_node_packages, ["corepack", "npm"]);
  for (const [entryPath, field] of [
    ["vendor/codex/codex_cli_darwin_arm64.tar.gz", "exists"],
    ["vendor/temporal/temporal_cli_darwin_arm64.tar.gz", "exists"],
    ["opl/node_modules/@swc/core-darwin-arm64/swc.darwin-arm64.node", "exists"],
    ["node/bin/npm", "executable"],
    ...authorityFunctionModules.map(([modulePath]) => [
      `${modulePath}/runtime/authority_functions/README.md`,
      "exists",
    ]),
    ["modules/mag/plugins/med-autogrant/.codex-plugin/plugin.json", "exists"],
    ["modules/mag/plugins/med-autogrant/skills/med-autogrant/SKILL.md", "exists"],
    ["modules/mas-scholar-skills/.codex-plugin/plugin.json", "exists"],
    ["modules/mas-scholar-skills/skills/mas-scholar-skills/SKILL.md", "exists"],
  ]) {
    assert.equal(
      assertions.offline_required_payloads.find((entry) => entry.path === entryPath)?.[field],
      true,
      entryPath,
    );
  }
  assert.equal(
    assertions.offline_required_payloads.some((entry) => entry.path.includes("codex-ops-kit")),
    false,
  );
  assert.equal(
    assertions.offline_required_payloads.find(
      (entry) => entry.path === "modules/opl-flow/skills/future-flow-skill/SKILL.md",
    )?.exists,
    true,
  );
  assert.doesNotThrow(() =>
    writeFullRuntimeManifest(
      runtimeRoot,
      { version: "26.7.7-test" },
      "2026-07-07T00:00:00.000Z",
      {},
      {},
    ),
  );
  assert.equal(
    assertions.offline_required_payloads.some(
      (entry) => entry.path === "modules/meta-agent/runtime/authority_functions/README.md",
    ),
    false,
  );
  for (const [modulePath, label] of authorityFunctionModules) {
    const inventoryPath = `${modulePath}/runtime/authority_functions/README.md`;
    fs.rmSync(path.join(runtimeRoot, inventoryPath));
    assert.throws(
      () =>
        writeFullRuntimeManifest(
          runtimeRoot,
          { version: "26.7.7-test" },
          "2026-07-07T00:00:00.000Z",
          {},
          {},
        ),
      new RegExp(inventoryPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    writeFile(
      path.join(runtimeRoot, inventoryPath),
      `# ${label} authority function inventory\n`,
    );
  }
  fs.rmSync(path.join(runtimeRoot, "modules", "opl-flow", "skills"), {
    recursive: true,
    force: true,
  });
  assert.throws(
    () => collectRuntimeAssertions(runtimeRoot),
    /declared skill root contains no SKILL\.md/,
  );
  writeFile(
    path.join(runtimeRoot, "modules/opl-flow/skills/opl-flow/SKILL.md"),
    "# skill\n",
  );
  fs.rmSync(path.join(runtimeRoot, "modules", "mag", "plugins", "med-autogrant", ".codex-plugin"), {
    recursive: true,
    force: true,
  });
  assert.throws(
    () =>
      writeFullRuntimeManifest(
        runtimeRoot,
        { version: "26.7.7-test" },
        "2026-07-07T00:00:00.000Z",
        {},
        {},
      ),
    /modules\/mag\/plugins\/med-autogrant\/\.codex-plugin\/plugin\.json/,
  );
  for (const entryPath of ["node/include", "node/lib/node_modules/npm/docs"]) {
    assert.equal(
      assertions.declared_pruned_paths.find((entry) => entry.path === entryPath)?.present,
      false,
      entryPath,
    );
  }
});
