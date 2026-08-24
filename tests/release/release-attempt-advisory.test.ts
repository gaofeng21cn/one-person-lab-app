import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fullWorkflow = fs.readFileSync(
  path.join(appRoot, ".github", "workflows", "full-first-install-release.yml"),
  "utf8",
);
const fullAddonWorkflow = fs.readFileSync(
  path.join(appRoot, ".github", "workflows", "_release-full-addon.yml"),
  "utf8",
);
const dockerCleanVmWorkflow = fs.readFileSync(
  path.join(appRoot, ".github", "workflows", "docker-webui-clean-vm.yml"),
  "utf8",
);
const firstRunVmWorkflow = fs.readFileSync(
  path.join(appRoot, ".github", "workflows", "opl-first-run-vm.yml"),
  "utf8",
);
test("Full DMG artifacts carry the cohort manifest required by the VM gate", () => {
  assert.equal(
    (fullWorkflow.match(/upload_full_package_artifact:[\s\S]*?default: false/g) ?? []).length,
    1,
    "large Full package uploads should be opt-in for the reusable build call",
  );
  assert.match(
    fullWorkflow,
    /full-finalizer:[\s\S]*name: Upload Full package workflow artifact\n\s+if: \$\{\{ success\(\) \}\}/,
  );
  assert.match(fullWorkflow, /name: Write Full build artifact cohort manifest/);
  assert.match(
    fullWorkflow,
    /full-finalizer:[\s\S]*name: Write ARM-finalized Full build artifact cohort manifest/,
  );
  assert.match(fullWorkflow, /write-build-artifact-cohort\.ts/);
  assert.match(fullWorkflow, /--kind full/);
  assert.match(fullWorkflow, /--framework-sha "\$\(git -C one-person-lab rev-parse HEAD\)"/);
  assert.match(
    fullWorkflow,
    /name: opl-full-first-install-dmg-\$\{\{ env\.OPL_RELEASE_VERSION \}\}-mac-arm64-cohort/,
  );
  assert.match(fullWorkflow, /path: \$\{\{ runner\.temp \}\}\/opl-build-cohort\.json/);
  assert.match(
    fullWorkflow,
    /full-finalizer:[\s\S]*name: Upload Full build artifact cohort manifest\n\s+if: \$\{\{ success\(\) \}\}/,
  );
  assert.match(
    fullWorkflow,
    /full-finalizer:[\s\S]*name: Upload Full DMG-only workflow artifact\n\s+if: \$\{\{ success\(\) \}\}/,
  );
});

test("Full VM validation rejects Framework injection into an already-built DMG", () => {
  assert.match(
    firstRunVmWorkflow,
    /package_profile=full executes the Framework bundled inside the DMG; framework_ref cannot override/,
  );
  assert.match(firstRunVmWorkflow, /framework_args=\(--framework-sha/);
});

test("Full build artifacts survive optional upload while the real publication caller rehearses", () => {
  assert.match(fullWorkflow, /id: full_package_build/);
  assert.doesNotMatch(fullWorkflow, /scripts\/publish-release\.ts|OPL_RELEASE_NOTES_MODE: template/);
  assert.doesNotMatch(fullWorkflow, /OPL_RELEASE_NOTES_CODEX_API_KEY:[\s\S]*release:notes:prepare/);
  assert.match(
    fullAddonWorkflow,
    /framework-release-adapter\.ts github-apply[\s\S]*--executor-app-sha "\$full_manifest_executor_app_sha"[\s\S]*--mutation-mode rehearsal/,
  );
  assert.match(
    fullAddonWorkflow,
    /framework-release-adapter\.ts github-apply[\s\S]*--executor-app-sha "\$full_manifest_executor_app_sha"[\s\S]*--mutation-mode execute/,
  );
  assert.match(
    fullWorkflow,
    /name: Upload Full DMG-only workflow artifact\n\s+if: \$\{\{ success\(\) && steps\.full_package_build\.outcome == 'success'/,
  );
});

test("Full build rejects App and Shell product profile drift before Electron packaging", () => {
  const profileGate = fullWorkflow.indexOf(
    "name: Verify App product profile against Shell consumer",
  );
  const electronRebuild = fullWorkflow.indexOf(
    "name: Rebuild App shell native modules for Electron",
  );
  const packageBuild = fullWorkflow.indexOf("id: full_package_build");

  assert.ok(profileGate >= 0, "missing Full product-profile compatibility gate");
  assert.match(
    fullWorkflow.slice(profileGate, electronRebuild),
    /node --experimental-strip-types scripts\/app-product-profile\.ts[\s\S]*bun vitest run tests\/unit\/common-config\/oplProductProfile\.test\.ts/,
  );
  assert.ok(profileGate < electronRebuild, "profile gate must run before Electron native rebuild");
  assert.ok(profileGate < packageBuild, "profile gate must run before Full package build");
});

test("Full build verifies managed carrier and Home readiness before expensive packaging", () => {
  const carrierGate = fullWorkflow.indexOf(
    "name: Verify Full bootstrap and Home readiness before packaging",
  );
  const packageBuild = fullWorkflow.indexOf("id: full_package_build");

  assert.ok(carrierGate >= 0, "missing managed Full carrier bootstrap gate");
  assert.match(
    fullWorkflow.slice(carrierGate, packageBuild),
    /bun vitest run[\s\S]*tests\/unit\/opl-runtime\/oplRuntimeBridge\.test\.ts[\s\S]*tests\/unit\/opl-runtime\/firstRunVmSmoke\.test\.ts[\s\S]*tests\/unit\/opl-runtime\/firstRunVmSmokeScripts\.test\.ts[\s\S]*tests\/unit\/guid\/oplHomeAssistants\.test\.ts[\s\S]*VITEST_INCLUDE_DOM=1 bun vitest run --project dom[\s\S]*tests\/unit\/guid\/HomeStarters\.dom\.test\.tsx[\s\S]*tests\/unit\/guid\/useGuidSend\.oplWhitelist\.dom\.test\.tsx/,
  );
  assert.ok(carrierGate < packageBuild, "managed carrier gate must run before Full package build");
});

test("desktop Stable leaves WebUI GHCR independent while Docker evidence still prunes seeded data", () => {
  assert.match(
    dockerCleanVmWorkflow,
    /name: Stop Docker\/WebUI smoke container and prune generated volumes[\s\S]*sudo rm -rf[\s\S]*OnePersonLab\/data[\s\S]*OnePersonLab\/projects[\s\S]*name: Upload clean Linux VM Docker\/WebUI evidence/,
  );
});

test("VM evidence upload excludes preseed caches and package inputs", () => {
  assert.match(
    firstRunVmWorkflow,
    /name: Prune VM preseed inputs before evidence upload[\s\S]*codex-npm-cache[\s\S]*codex-package-tarballs[\s\S]*framework-source[\s\S]*name: Upload first-run VM artifacts/,
  );
});

test("VM job summary bounds large smoke diagnostics instead of exceeding GitHub limits", () => {
  assert.doesNotMatch(
    firstRunVmWorkflow,
    /cat artifacts\/opl-first-run-vm\/tart-smoke-summary\.json/,
  );
  assert.match(firstRunVmWorkflow, /const max=64\*1024/);
  assert.match(firstRunVmWorkflow, /summary truncated at 65536 bytes/);
});
