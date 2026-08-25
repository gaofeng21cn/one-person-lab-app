import {
  assert,
  fs,
  os,
  path,
  test,
  appRoot,
  runNode,
  writeFile,
  writeExecutable,
  writeJson,
  writeFlowCapabilityBuildLockFixture,
  writeAuthorityFunctionInventory,
} from "./full-first-install-runtime-fixtures.ts";

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
  writeFlowCapabilityBuildLockFixture(auditRuntimeRoot);
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
  const managedResourcesRoot = path.join(
    appPath,
    "Contents",
    "Resources",
    "bundled-aioncore",
    "darwin-arm64",
    "managed-resources",
  );
  writeFile(
    path.join(managedResourcesRoot, "node", "node-v24.11.0-darwin-arm64", "bin", "node"),
    "node-runtime",
  );
  const codexExecutablePath = path.join(
    managedResourcesRoot,
    "cli",
    "codex",
    "0.144.6",
    "darwin-arm64",
    "vendor",
    "aarch64-apple-darwin",
    "bin",
    "codex",
  );
  writeFile(codexExecutablePath, "codex-runtime");
  writeFile(
    path.join(managedResourcesRoot, "manifest.json"),
    JSON.stringify({
      schema: "opl_aioncore_managed_resources_projection.v1",
      runtimeKey: "darwin-arm64",
      source: {
        schemaVersion: 2,
        manifestSha256: "a".repeat(64),
        cliNames: [],
      },
      node: {
        version: "24.11.0",
        root: "node/node-v24.11.0-darwin-arm64",
        executable: "bin/node",
      },
      clis: [{
        name: "codex",
        version: "0.144.6",
        root: "cli/codex/0.144.6/darwin-arm64",
        platformDirectory: "darwin-arm64",
        executable: "vendor/aarch64-apple-darwin/bin/codex",
        requiredFiles: [],
        requiredDirectories: [],
      }],
      projection: {
        includedCliNames: ["codex"],
        excludedCliNames: ["claude"],
        requiredAbsentPaths: [
          "cli/claude",
          "acp",
          "node_modules/@anthropic-ai/claude-code",
          "node_modules/claude-code",
          "claude",
        ],
      },
    }),
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
  assert.equal(
    boundaryAudit.full_package_boundary.aioncore_codex_only_projection_present,
    true,
  );
  assert.equal(
    boundaryAudit.full_package_boundary.aioncore_claude_payload_absent,
    true,
  );
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

  fs.rmSync(codexExecutablePath);
  const missingCodexAudit = auditFullPackageBundleBoundaries(appPath, {
    package_kind: "opl_full_first_install_macos_arm64",
    version: "26.6.21-size-opt",
  });
  assert.equal(
    missingCodexAudit.full_package_boundary.aioncore_codex_only_projection_present,
    false,
  );
  writeFile(codexExecutablePath, "codex-runtime");

  writeFile(
    path.join(managedResourcesRoot, "cli", "claude", "2.1.215", "darwin-arm64", "claude"),
    "claude-runtime",
  );
  const claudeAudit = auditFullPackageBundleBoundaries(appPath, {
    package_kind: "opl_full_first_install_macos_arm64",
    version: "26.6.21-size-opt",
  });
  assert.equal(
    claudeAudit.full_package_boundary.aioncore_claude_payload_absent,
    false,
  );
  assert.throws(
    () =>
      withFullPackageOptimization(
        { manifest_version: 2, package_kind: "opl_full_first_install_macos_arm64" },
        { trimReport, boundaryAudit: claudeAudit },
      ),
    /did not preserve the declared offline first-install App bundle boundary/,
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
  writeExecutable(path.join(runtimeRoot, "bin", "temporal"), "#!/bin/sh\nexit 0\n");
  writeFile(
    path.join(runtimeRoot, "vendor", "temporal", "temporal_cli_darwin_arm64.tar.gz"),
    "temporal archive",
  );
  writeFile(
    path.join(runtimeRoot, "opl", "node_modules", "@swc", "core-darwin-arm64", "swc.darwin-arm64.node"),
    "swc native binding",
  );
  writeJson(path.join(runtimeRoot, "opl", "package.json"), {
    name: "opl-framework",
    exports: {
      "./cordis-profiles": "./dist/host/composition-profiles.js",
    },
  });
  writeFile(
    path.join(runtimeRoot, "opl", "dist", "host", "composition-profiles.js"),
    "export const startCordisChannelProviderHost = () => ({ });\n",
  );
  writeExecutable(path.join(runtimeRoot, "uv", "bin", "uv"), "#!/bin/sh\nexit 0\n");
  writeExecutable(path.join(runtimeRoot, "bin", "officecli"), "#!/bin/sh\nexit 0\n");
  writeExecutable(path.join(runtimeRoot, "bin", "mineru-open-api"), "#!/bin/sh\nexit 0\n");
  writeFlowCapabilityBuildLockFixture(runtimeRoot, [
    'cli:officecli',
    'cli:mineru-open-api',
  ]);
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
  for (const relativePath of ["bin/codex", "bin/rg", "vendor/codex", ".runtime-cache/codex-cli"]) {
    assert.equal(
      assertions.declared_pruned_paths.find((entry) => entry.path === relativePath)?.present,
      false,
      relativePath,
    );
  }
  writeExecutable(path.join(runtimeRoot, "bin", "codex"), "#!/bin/sh\nexit 0\n");
  assert.throws(
    () =>
      writeFullRuntimeManifest(
        runtimeRoot,
        { version: "26.7.7-test" },
        "2026-07-07T00:00:00.000Z",
        {},
        {},
      ),
    /bin\/codex/,
  );
  fs.rmSync(path.join(runtimeRoot, "bin", "codex"));
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
