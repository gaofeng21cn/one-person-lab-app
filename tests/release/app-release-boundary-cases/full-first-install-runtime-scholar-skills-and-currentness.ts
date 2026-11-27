import os from "node:os";
import {
  assert,
  fs,
  path,
  test,
  writeFile,
  writeJson,
  commitFixtureRepo,
  createFullRuntimeFixture,
} from "./full-first-install-runtime-fixtures.ts";

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
    const dependencyWithoutLegacyKind = { ...scholarDependency };
    delete dependencyWithoutLegacyKind.kind;
    masManifest.capability_dependencies = [dependencyWithoutLegacyKind];
    writeJson(masManifestPath, masManifest);
    assert.doesNotThrow(() => resolveMasScholarSkillsFullRuntimeSource(dependencyFixture.options));
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
    current: {
      currentness_authority: "installed_owner_descriptor_and_native_carrier",
      projection_source: "installed_owner_descriptor",
      installed_package_count: 1,
    },
    conditions: [{ type: "Ready", status: "True" }],
    owner_route: { route_kind: "clean_managed_package_executor" },
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

test("Full runtime currentness checks and stops the isolated Framework v2 daemon", async () => {
  const { probeFullFrameworkDaemon } = await import("../../../scripts/build-full-first-install-package/runtime-currentness.ts");
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-daemon-probe-"));
  const command = path.join(stateDir, "opl");
  const calls = path.join(stateDir, "calls");
  try {
    fs.writeFileSync(command, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2, -1).join(' ');
const state = process.env.OPL_STATE_DIR;
fs.appendFileSync(path.join(state, 'calls'), args + '\\n');
const version = { api_version: '2.0', version: '2.0.0' };
const replies = {
  '--version': version,
  'daemon doctor --include-first-run': { ...version, ok: true,
    paths: { state_dir: state }, sqlite: { db_file: path.join(state, 'opl.db'), schema_version: 4001 },
    first_run: { needs_onboarding: true, installed_package_count: 0 } },
  'pack list': { packages: process.env.OPL_PROBE_DIRTY === '1' ? [{ package_id: 'unexpected' }] : [] },
  'daemon stop': { ok: true, stopped: true },
};
process.stdout.write(JSON.stringify(replies[args]));
`, { mode: 0o755 });
    const env = { ...process.env, OPL_STATE_DIR: stateDir };
    const receipt = probeFullFrameworkDaemon(command, env, "2.0.0");
    assert.equal(receipt.sqlite_schema_version, 4001);
    assert.equal(receipt.initial_installed_package_count, 0);
    assert.equal(fs.readFileSync(calls, "utf8"), "--version\ndaemon doctor --include-first-run\npack list\ndaemon stop\n");
    fs.writeFileSync(calls, "");
    assert.throws(() => probeFullFrameworkDaemon(command, { ...env, OPL_PROBE_DIRTY: "1" }, "2.0.0"), /clean v2 state/);
    assert.match(fs.readFileSync(calls, "utf8"), /daemon stop\n$/);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
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
