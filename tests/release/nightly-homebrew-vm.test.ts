import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { parse as parseYaml } from "yaml";

const workflowPath = path.join(process.cwd(), ".github", "workflows", "opl-first-run-vm.yml");
const workflowSource = fs.readFileSync(workflowPath, "utf8");
const workflow = parseYaml(workflowSource) as Record<string, any>;

function evaluateCondition(expression: string, context: Record<string, unknown>) {
  const source = expression.replace(/^\$\{\{\s*|\s*\}\}$/g, "")
    .replaceAll("needs.validate-vm-inputs", 'needs["validate-vm-inputs"]');
  return runInNewContext(source, {
    always: () => true,
    ...context,
  });
}

test("Nightly public DMG downloads and verifies the exact producer cohort before Codex prefetch", () => {
  const follower = parseYaml(fs.readFileSync(
    path.join(process.cwd(), ".github/workflows/release-nightly-followups.yml"), "utf8",
  ));
  const caller = follower.jobs["sampled-standard-vm"];
  assert.equal(caller.with.release_cohort_artifact_name, "nightly-macos-arm64-dmg-cohort");
  assert.equal(caller.with.release_artifact_name, undefined);
  assert.equal(caller.with.release_artifact_run_id,
    "${{ github.event_name == 'workflow_dispatch' && inputs.source_run_id || github.event.workflow_run.id }}");
  assert.equal(caller.with.diagnostic_scope, "release_gate");
  assert.equal(caller.secrets, "inherit");

  const steps = workflow.jobs["clean-vm-first-run"].steps;
  const download = steps.find((step: any) => step.name === "Download published DMG cohort identity");
  const verify = steps.find((step: any) => step.name === "Verify downloaded DMG exact bytes against build cohort");
  const prefetch = steps.find((step: any) => step.id === "codex_package_preflight");
  assert.equal(download.with.name, "${{ inputs.release_cohort_artifact_name }}");
  assert.equal(download.with["run-id"], "${{ inputs.release_artifact_run_id }}");
  assert.equal(download.with.path, "artifacts/release-cohort");
  assert.notEqual(download["continue-on-error"], true);
  assert.ok(steps.indexOf(download) < steps.indexOf(verify));
  assert.ok(steps.indexOf(verify) < steps.indexOf(prefetch));
  for (const [artifact, cohort, shouldDownload, shouldVerify] of [
    ["", "nightly-macos-arm64-dmg-cohort", true, true],
    ["standard-dmg", "", false, true],
    ["", "", false, false],
  ]) {
    const context = { inputs: { release_artifact_name: artifact, release_cohort_artifact_name: cohort } };
    assert.equal(evaluateCondition(download.if, context), shouldDownload);
    assert.equal(evaluateCondition(verify.if, context), shouldVerify);
  }
  assert.match(verify.run, /--artifact "\$\{\{ steps\.dmg\.outputs\.dmg_path \}\}"/);
  assert.match(verify.run, /--actions-run-id "\$\{\{ inputs\.release_artifact_run_id \|\| github\.run_id \}\}"/);
});

test("published cohort admission rejects ambiguous artifact sources and unbound run ids", () => {
  const normalize = workflow.jobs["validate-vm-inputs"].steps.find(
    (step: any) => step.name === "Normalize diagnostic inputs",
  );
  const admission = normalize.run.split('profile="$PACKAGE_PROFILE"')[0];
  assert.equal(normalize.env.RELEASE_COHORT_ARTIFACT_NAME, "${{ inputs.release_cohort_artifact_name }}");
  assert.equal(normalize.env.RELEASE_ARTIFACT_RUN_ID, "${{ inputs.release_artifact_run_id }}");
  const valid = {
    RELEASE_COHORT_ARTIFACT_NAME: "nightly-macos-arm64-dmg-cohort",
    RELEASE_ARTIFACT_RUN_ID: "33921116172",
    RELEASE_ARTIFACT_NAME: "",
    RELEASE_TAG_INPUT: "v26.9.5-nightly",
  };
  for (const [override, success] of [
    [{}, true],
    [{ RELEASE_ARTIFACT_NAME: "some-other-dmg" }, false],
    [{ RELEASE_ARTIFACT_RUN_ID: "" }, false],
    [{ RELEASE_ARTIFACT_RUN_ID: "latest" }, false],
    [{ RELEASE_TAG_INPUT: "" }, false],
  ] as const) {
    const result = spawnSync("bash", ["-c", admission], {
      encoding: "utf8", env: { ...process.env, ...valid, ...override },
    });
    assert.equal(result.status === 0, success, result.stderr || result.stdout);
  }
});

test("sampled VM recovery pins a repair harness without changing published product refs", () => {
  const follower = parseYaml(fs.readFileSync(
    path.join(process.cwd(), ".github/workflows/release-nightly-followups.yml"), "utf8",
  ));
  const caller = follower.jobs["sampled-standard-vm"].with;
  assert.equal(caller.smoke_harness_ref, "${{ inputs.smoke_harness_ref || needs.resolve-sample.outputs.shell_ref }}");
  assert.equal(caller.shell_ref, "${{ needs.resolve-sample.outputs.shell_ref }}");
  assert.equal(caller.artifact_app_ref, "${{ needs.resolve-sample.outputs.app_ref }}");
  const step = follower.jobs["resolve-sample"].steps[0];
  assert.equal(step.env.SMOKE_HARNESS_REF, "${{ inputs.smoke_harness_ref }}");
  const admission = step.run.split('gh api "repos/')[0];
  for (const [ref, valid] of [["", true], ["a".repeat(40), true], ["main", false], ["abcd", false]] as const) {
    const result = spawnSync("bash", ["-c", admission], {
      encoding: "utf8", env: {
        ...process.env, GITHUB_RUN_ATTEMPT: "1", GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_REF: "refs/heads/main", SOURCE_RUN_ID: "33921116172", SMOKE_HARNESS_REF: ref,
      },
    });
    assert.equal(result.status === 0, valid, result.stderr || result.stdout);
  }
});

test("credential scanning skips unused credentials but remains fail-closed once preparation ran", () => {
  const scan = workflow.jobs["clean-vm-first-run"].steps.find(
    (step: any) => step.name === "Reject protected credentials in release evidence",
  );
  for (const outcome of ["skipped", "success", "failure", "cancelled"]) {
    assert.equal(evaluateCondition(scan.if, {
      steps: { gateway_credentials: { outcome } },
      needs: { "validate-vm-inputs": { outputs: { diagnostic_scope: "release_gate", package_profile: "standard" } } },
    }), outcome !== "skipped");
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-nightly-credential-scan-"));
  try {
    fs.mkdirSync(path.join(root, "artifacts"));
    const evidence = path.join(root, "artifacts", "smoke.log");
    const runScan = (password: string) => spawnSync("bash", ["-c", scan.run], {
      cwd: root, encoding: "utf8", env: { ...process.env, GATEWAY_ACCOUNT_PASSWORD: password },
    });
    fs.writeFileSync(evidence, "non-sensitive diagnostic");
    assert.equal(runScan("test-only-credential").status, 0);
    assert.notEqual(runScan("").status, 0);
    fs.writeFileSync(evidence, "leaked test-only-credential");
    assert.notEqual(runScan("test-only-credential").status, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Nightly Homebrew uses the Standard runtime smoke with the exact Nightly cask", () => {
  const normalizeInputs = String(
    workflow.jobs["validate-vm-inputs"].steps.find(
      (step: Record<string, unknown>) => step.name === "Normalize diagnostic inputs",
    ).run,
  );
  assert.match(
    normalizeInputs,
    /full \| standard \| homebrew-standard \| homebrew-nightly \| homebrew-full/,
  );
  assert.match(
    normalizeInputs,
    /package_profile=homebrew-nightly requires an exact pre-publication Cask artifact/,
  );
  assert.match(
    normalizeInputs,
    /accepted only for package_profile=homebrew-nightly or homebrew-full/,
  );

  const resolveProfile = workflow.jobs["clean-vm-first-run"].steps.find(
    (step: Record<string, unknown>) => step.name === "Resolve package profile",
  );
  const source = String(resolveProfile.run);
  assert.match(source, /homebrew-nightly\)/);
  assert.match(source, /homebrew_cask=gaofeng21cn\/one-person-lab\/one-person-lab-nightly/);
  assert.match(source, /homebrew-nightly\)[\s\S]*runtime_profile=standard/);
  assert.match(source, /homebrew-nightly\)[\s\S]*install_mode=homebrew-cask/);

  const runSmoke = workflow.jobs["clean-vm-first-run"].steps.find(
    (step: Record<string, unknown>) => step.name === "Run clean VM first launch smoke",
  );
  assert.match(
    String(runSmoke.run),
    /profile \}\}" = "homebrew-nightly"[\s\S]*--smoke-profile homebrew-nightly-cask[\s\S]*--homebrew-cask-file "\$\{\{ steps\.homebrew_candidate\.outputs\.cask_path \}\}"/,
  );
  assert.match(String(runSmoke.run), /--smoke-profile homebrew-standard-cask/);
  assert.match(
    String(runSmoke.run),
    /--homebrew-cask "\$\{\{ steps\.package_profile\.outputs\.homebrew_cask \}\}"/,
  );
});

test("Nightly candidate binding cannot fall through to Full or the public Tap", () => {
  const bindCandidate = workflow.jobs["clean-vm-first-run"].steps.find(
    (step: Record<string, unknown>) => step.name === "Bind exact pre-publication Homebrew Cask",
  );
  const source = String(bindCandidate.run);
  assert.match(source, /homebrew-nightly\)[\s\S]*expected_name=one-person-lab-nightly\.rb/);
  assert.match(source, /homebrew-full\)[\s\S]*expected_name=one-person-lab-full\.rb/);
  assert.match(source, /find artifacts\/homebrew-candidate -type f -name "\$expected_name"/);
  assert.match(source, /Nightly Cask candidate must depend on Formula opl/);
  assert.match(source, /Full Cask candidate must not depend on Formula opl/);
  assert.doesNotMatch(source, /gaofeng21cn\/one-person-lab/);
});

test("Nightly Homebrew remains a Standard qualification artifact", () => {
  const attempt = workflow.jobs["qualification-attempt-finalizer"];
  const receiptStep = attempt.steps.find(
    (step: Record<string, unknown>) => step.name === "Write durable typed attempt receipt",
  );
  const source = String(receiptStep.run);
  assert.match(source, /artifact_kind=standard/);
  assert.match(source, /case "\$profile" in full\|homebrew-full\) artifact_kind=full/);
  assert.doesNotMatch(source, /homebrew-nightly\) artifact_kind=full/);
});
