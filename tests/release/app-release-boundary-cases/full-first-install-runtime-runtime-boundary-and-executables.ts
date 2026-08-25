import {
  assert,
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
  writeJson,
  resolveFrameworkSelectedBundleFixture,
  flowCapabilityBuildLockFixture,
  createFullRuntimeFixture,
} from "./full-first-install-runtime-fixtures.ts";

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

test("Full runtime wrapper preserves the Shell Codex executable and labels only its own Temporal default", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-wrapper-"));
  const runtimeRoot = path.join(tempRoot, "runtime");
  const runtimeCommand = path.join(runtimeRoot, "opl", "bin", "opl");
  writeExecutable(
    runtimeCommand,
    [
      "#!/bin/bash",
      "printf '%s|%s|%s\\n' \"${OPL_TEMPORAL_ADDRESS:-unset}\" \"${OPL_TEMPORAL_ADDRESS_SOURCE:-unset}\" \"${OPL_CODEX_BIN:-unset}\"",
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

    assert.equal(runWrapper(), "127.0.0.1:7233|packaged_local_default|unset");
    assert.equal(
      runWrapper({
        OPL_TEMPORAL_ADDRESS: "temporal.example:7233",
        OPL_CODEX_BIN: "/shell/managed-resources/codex",
      }),
      "temporal.example:7233|unset|/shell/managed-resources/codex",
    );
    assert.equal(
      runWrapper({ OPL_TEMPORAL_ADDRESS: "127.0.0.1:7233" }),
      "127.0.0.1:7233|unset|unset",
    );
    assert.equal(
      runWrapper({
        OPL_TEMPORAL_ADDRESS: "temporal.example:7233",
        OPL_TEMPORAL_ADDRESS_SOURCE: "operator_environment",
      }),
      "temporal.example:7233|operator_environment|unset",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Full runtime Framework packages resolve built JavaScript instead of TypeScript under node_modules", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-runtime-package-exports-"));
  const frameworkRoot = path.join(tempRoot, "framework");
  const layerRoot = path.join(tempRoot, "layer");
  const packageRoot = path.join(frameworkRoot, "node_modules", "@one-person-lab", "cordis-abi");
  try {
    writeJson(path.join(frameworkRoot, "package.json"), {
      name: "fixture-framework",
      version: "1.0.0",
      type: "module",
      exports: {
        "./cordis-profiles": "./dist/host/composition-profiles.js",
      },
      dependencies: { "@one-person-lab/cordis-abi": "0.1.0" },
    });
    writeJson(path.join(frameworkRoot, "package-lock.json"), {
      name: "fixture-framework",
      lockfileVersion: 3,
      packages: {
        "": { dependencies: { "@one-person-lab/cordis-abi": "0.1.0" } },
        "node_modules/@one-person-lab/cordis-abi": {},
      },
    });
    writeFile(
      path.join(frameworkRoot, "src", "runtime-smoke.ts"),
      "import { runtimeValue } from '@one-person-lab/cordis-abi';\nconsole.log(runtimeValue);\n",
    );
    writeJson(path.join(packageRoot, "package.json"), {
      name: "@one-person-lab/cordis-abi",
      version: "0.1.0",
      type: "module",
      exports: {
        ".": {
          types: "./src/index.ts",
          "opl-source": "./src/index.ts",
          default: "./dist/index.js",
        },
      },
    });
    writeFile(path.join(packageRoot, "src", "index.ts"), "export const runtimeValue: string = 'source';\n");
    writeFile(path.join(packageRoot, "dist", "index.js"), "export const runtimeValue = 'built';\n");
    writeFile(
      path.join(frameworkRoot, "dist", "host", "composition-profiles.js"),
      "export const startCordisChannelProviderHost = () => ({ });\n",
    );
    writeFile(path.join(frameworkRoot, "dist", "host", "other.js"), "export const other = true;\n");
    writeFile(path.join(frameworkRoot, "dist", "other.js"), "export const other = true;\n");

    const { buildOplLayer } =
      await import("../../../scripts/build-full-first-install-package/runtime-layers.ts");
    buildOplLayer(layerRoot, { frameworkRoot });

    const packagedRoot = path.join(layerRoot, "opl");
    assert.equal(
      fs.existsSync(path.join(packagedRoot, "dist", "host", "composition-profiles.js")),
      true,
    );
    assert.equal(fs.existsSync(path.join(packagedRoot, "dist", "host", "other.js")), false);
    assert.equal(fs.existsSync(path.join(packagedRoot, "dist", "other.js")), false);
    const packagedManifest = JSON.parse(
      fs.readFileSync(
        path.join(packagedRoot, "node_modules", "@one-person-lab", "cordis-abi", "package.json"),
        "utf8",
      ),
    );
    assert.equal("opl-source" in packagedManifest.exports["."], false);
    assert.equal(packagedManifest.exports["."].default, "./dist/index.js");

    const result = spawnSync(
      process.execPath,
      [
        "--conditions=opl-source",
        "--experimental-strip-types",
        path.join(packagedRoot, "src", "runtime-smoke.ts"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.trim(), "built");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Full runtime OPL layer fails closed when a required Framework export payload is missing", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-runtime-missing-export-"));
  const frameworkRoot = path.join(tempRoot, "framework");
  const layerRoot = path.join(tempRoot, "layer");
  try {
    writeJson(path.join(frameworkRoot, "package.json"), {
      name: "fixture-framework",
      version: "1.0.0",
      type: "module",
      exports: {
        "./cordis-profiles": "./dist/host/composition-profiles.js",
      },
    });

    const { buildOplLayer } =
      await import("../../../scripts/build-full-first-install-package/runtime-layers.ts");
    assert.throws(
      () => buildOplLayer(layerRoot, { frameworkRoot }),
      /required built export payload is missing: opl\/dist\/host\/composition-profiles\.js/,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Full runtime OPL layer fails closed when required Framework export metadata is missing", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-runtime-missing-export-metadata-"));
  const frameworkRoot = path.join(tempRoot, "framework");
  const layerRoot = path.join(tempRoot, "layer");
  try {
    writeFile(
      path.join(frameworkRoot, "dist", "host", "composition-profiles.js"),
      "export const startCordisChannelProviderHost = () => ({ });\n",
    );

    const { buildOplLayer } =
      await import("../../../scripts/build-full-first-install-package/runtime-layers.ts");
    assert.throws(
      () => buildOplLayer(layerRoot, { frameworkRoot }),
      /required built export package metadata is missing: opl\/package\.json/,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Full runtime executable discovery fails closed on duplicate Temporal or Python candidates", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-runtime-duplicate-candidates-"));
  const runtimeRoot = path.join(tempRoot, "runtime");
  try {
    const { writeTemporalCliWrapper } =
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
    const flowCapabilityBuildLock = flowCapabilityBuildLockFixture(fixture.sources);
    prepared = prepareRuntime(
      fixture.options,
      fixture.sources,
      {
        ...(selectedBundle
          ? { resolvedSelectedBundleDescriptor: selectedBundle.descriptor }
          : {}),
        flowCapabilityBuildLock,
      },
    );
    const currentnessCli = runNode([
      "scripts/assert-full-runtime-currentness.ts",
      "--runtime-root",
      prepared.runtimeRoot,
      "--framework-root",
      fixture.options.frameworkRoot,
      "--mas-root",
      fixture.options.masRoot,
      "--mas-scholar-skills-root",
      fixture.options.masScholarSkillsRoot,
      "--mas-scholar-skills-ref",
      fixture.options.masScholarSkillsRef,
    ]);
    assert.equal(currentnessCli.status, 0, currentnessCli.stderr);
    const currentnessCliReport = JSON.parse(currentnessCli.stdout);
    assert.equal(currentnessCliReport.status, "passed");
    assert.equal(currentnessCliReport.framework_commit, fixture.frameworkCommit);
    assert.equal(currentnessCliReport.mas_scholar_skills_commit, fixture.sourceCommit);
    assert.equal(Object.prototype.hasOwnProperty.call(prepared.manifest.components, "codex"), false);
    for (const relativePath of ["bin/codex", "bin/rg", "vendor/codex", ".runtime-cache/codex-cli"]) {
      assert.equal(fs.existsSync(path.join(prepared.runtimeRoot, relativePath)), false, relativePath);
    }
    assert.equal("codex_package_version" in prepared.runtime_cache.key_inputs.toolchain, false);
    assert.equal("codex_binary_sha256" in prepared.runtime_cache.key_inputs.toolchain, false);
    assert.equal("rg_sha256" in prepared.runtime_cache.key_inputs.toolchain, false);
    assert.equal("codex_vendor_fingerprint" in prepared.runtime_cache.key_inputs.toolchain, false);
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
        : 'owner_package_plugin_carriers_only',
    );
    assert.equal(
      prepared.manifest.components.skills.role,
      'framework_selected_package_skill_carriers_or_empty',
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
    assert.equal(resolved.package_role, "capability_package");
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
