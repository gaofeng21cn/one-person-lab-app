import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parse as parseYaml } from "yaml";

const workflowName = "release-stable-post-success-followups.yml";
const workflowPath = path.join(
  process.cwd(),
  ".github",
  "workflows",
  workflowName,
);
const source = fs.readFileSync(workflowPath, "utf8");
const workflow = parseYaml(source) as Record<string, any>;
const fullAddonSource = fs.readFileSync(
  path.join(process.cwd(), ".github", "workflows", "_release-full-addon.yml"),
  "utf8",
);
const fullAddon = parseYaml(fullAddonSource) as Record<string, any>;

function runSourceValidationStep(displayTitle: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-successor-source-"));
  try {
    const bin = path.join(root, "bin");
    const outputPath = path.join(root, "github-output.txt");
    fs.mkdirSync(bin);
    const fakeGh = path.join(bin, "gh");
    fs.writeFileSync(
      fakeGh,
      String.raw`#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  id: Number(process.env.SOURCE_RUN_ID),
  repository: { full_name: "gaofeng21cn/one-person-lab-app" },
  head_repository: { full_name: "gaofeng21cn/one-person-lab-app" },
  path: ".github/workflows/release-stable.yml",
  event: "workflow_dispatch",
  head_branch: "main",
  head_sha: process.env.SOURCE_HEAD_SHA,
  run_attempt: 1,
  status: "completed",
  conclusion: "success",
  display_title: process.env.OPL_TEST_SOURCE_TITLE,
}));
`,
    );
    fs.chmodSync(fakeGh, 0o755);
    const sourceStep = workflow.jobs.admit.steps.find(
      (candidate: Record<string, any>) => candidate.name === "Validate successful Standard source run",
    );
    assert.ok(sourceStep);
    const result = spawnSync("/bin/bash", ["-euo", "pipefail", "-c", String(sourceStep.run)], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_OUTPUT: outputPath,
        GITHUB_REPOSITORY: "gaofeng21cn/one-person-lab-app",
        GITHUB_RUN_ATTEMPT: "1",
        SOURCE_RUN_ID: "30859273345",
        SOURCE_HEAD_SHA: "a".repeat(40),
        OPL_TEST_SOURCE_TITLE: displayTitle,
      },
    });
    return {
      result,
      output: fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "",
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runSuccessorDispatchStep({
  sourceArtifact = "opl-release-standard-checkpoint-30123456789",
}: {
  sourceArtifact?: string;
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-successor-dispatch-"));
  try {
    const bin = path.join(root, "bin");
    const payloadPath = path.join(root, "dispatch-payload.json");
    const statePath = path.join(root, "state");
    const outputPath = path.join(root, "github-output.txt");
    fs.mkdirSync(bin);
    const fakeGh = path.join(bin, "gh");
    fs.writeFileSync(
      fakeGh,
      String.raw`#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const payloadPath = process.env.OPL_TEST_DISPATCH_PAYLOAD;
const statePath = process.env.OPL_TEST_DISPATCH_STATE;
const runId = "40100000003";
const sourceRunId = process.env.SOURCE_RUN_ID;
if (args.includes("--method") && args.includes("POST")) {
  fs.writeFileSync(payloadPath, fs.readFileSync(0, "utf8"));
  fs.writeFileSync(statePath, "posted\n");
  process.exit(0);
}

if (args.some((arg) => arg.endsWith("/actions/runs/" + runId))) {
  process.stdout.write(JSON.stringify({
    id: Number(runId),
    repository: { full_name: "gaofeng21cn/one-person-lab-app" },
    head_repository: { full_name: "gaofeng21cn/one-person-lab-app" },
    path: ".github/workflows/release-stable.yml",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: "a".repeat(40),
    run_attempt: 1,
    display_title: "OPL Stable append_full source:" + sourceRunId + " run:" + runId,
  }));
  process.exit(0);
}
const posted = fs.existsSync(statePath);
process.stdout.write(JSON.stringify({
  total_count: posted ? 1 : 0,
  workflow_runs: posted ? [{
    id: Number(runId),
    path: ".github/workflows/release-stable.yml",
    head_branch: "main",
    head_sha: "a".repeat(40),
    run_attempt: 1,
    created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    display_title: "OPL Stable append_full source:" + sourceRunId + " run:" + runId,
  }] : [],
}));
`,
    );
    fs.chmodSync(fakeGh, 0o755);
    const dispatchStep = workflow.jobs.dispatch.steps.find(
      (candidate: Record<string, any>) =>
        candidate.name === "Dispatch exactly one same-tag Full append operation",
    );
    assert.ok(dispatchStep);
    const result = spawnSync("/bin/bash", ["-euo", "pipefail", "-c", String(dispatchStep.run)], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_REPOSITORY: "gaofeng21cn/one-person-lab-app",
        GITHUB_OUTPUT: outputPath,
        SOURCE_RUN_ID: "30123456789",
        SOURCE_ARTIFACT: sourceArtifact,
        FRAMEWORK_REF: "c".repeat(40),
        APP_REF: "a".repeat(40),
        SHELL_REF: "b".repeat(40),
        VERSION: "26.7.31-r3",
        OPL_TEST_DISPATCH_PAYLOAD: payloadPath,
        OPL_TEST_DISPATCH_STATE: statePath,
      },
    });
    return {
      result,
      payload: fs.existsSync(payloadPath)
        ? JSON.parse(fs.readFileSync(payloadPath, "utf8")) as Record<string, any>
        : null,
      output: fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "",
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runSourceBindingStep({
  transportHead = "1".repeat(40),
  frozenApp = "a".repeat(40),
  mutateIdentity,
  mutateHandoff,
}: {
  transportHead?: string;
  frozenApp?: string;
  mutateIdentity?: (identity: Record<string, any>) => void;
  mutateHandoff?: (handoff: Record<string, any>) => void;
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-successor-bind-"));
  try {
    const sourceRunId = "30870000001";
    const sourceArtifact = `opl-release-standard-operation-checkpoint-${sourceRunId}`;
    const shell = "b".repeat(40);
    const framework = "c".repeat(40);
    const bundleDigest = `sha256:${"d".repeat(64)}`;
    const version = "26.8.4";
    const updaterVersion = "26.8.490";
    const tag = `v${version}`;
    const checkpointRoot = path.join(root, "standard-checkpoint");
    const activationRoot = path.join(root, "standard-activation");
    const followerRoot = path.join(activationRoot, "webui-follower");
    fs.mkdirSync(path.join(checkpointRoot, "stable-operation-control"), { recursive: true });
    fs.mkdirSync(followerRoot, { recursive: true });
    const bundle = {
      bundle_digest: bundleDigest,
      release: { channel: "stable", version, updater_version: updaterVersion, tag, prerelease: false },
      sources: {
        app: { source_commit: frozenApp },
        shell: { source_commit: shell },
        framework: { source_commit: framework },
      },
    };
    fs.writeFileSync(path.join(checkpointRoot, "checkpoint.json"), `${JSON.stringify({ checkpoint_stage: "standard_built" })}\n`);
    fs.writeFileSync(path.join(checkpointRoot, "bundle.json"), `${JSON.stringify(bundle)}\n`);
    fs.writeFileSync(
      path.join(checkpointRoot, "stable-operation-control", "stable-operation-control.json"),
      `${JSON.stringify({ cohort: { app_sha: frozenApp, shell_sha: shell, framework_sha: framework }, optional_platforms: [] })}\n`,
    );
    const identity = {
      schema: "opl_standard_release_identity_receipt.v2",
      status: "passed",
      source: { run_id: "30850184002", run_attempt: 1 },
      release: { channel: "stable", version, updater_version: updaterVersion, tag, bundle_digest: bundleDigest },
      cohort: { app_sha: frozenApp, shell_sha: shell, framework_sha: framework },
    };
    mutateIdentity?.(identity);
    const identityPath = path.join(followerRoot, "standard-identity-receipt.json");
    fs.writeFileSync(identityPath, `${JSON.stringify(identity)}\n`);
    const identitySha256 = `sha256:${spawnSync("shasum", ["-a", "256", identityPath], { encoding: "utf8" }).stdout.split(/\s+/)[0]}`;
    const handoff = {
      schema: "opl_app_webui_follower_handoff.v1",
      status: "ready",
      stable_authority: { run_id: sourceRunId, run_attempt: 1, executor_head_sha: transportHead },
      source: { artifact_run_id: sourceRunId, checkpoint_artifact: sourceArtifact, standard_identity_sha256: identitySha256 },
      release: { version, bundle_digest: bundleDigest, cohort: { app_sha: frozenApp, shell_sha: shell, framework_sha: framework } },
    };
    mutateHandoff?.(handoff);
    fs.writeFileSync(path.join(activationRoot, "webui-follower-handoff.json"), `${JSON.stringify(handoff)}\n`);
    fs.writeFileSync(
      path.join(activationRoot, "latest-component-manifest.json"),
      `${JSON.stringify({
        surface_kind: "opl_app_component_manifest.v1",
        quality_status: "stable",
        source_commit: frozenApp,
        source_cohort: { app_sha: frozenApp, shell_sha: shell, framework_sha: framework },
        version,
        updater_version: updaterVersion,
        release_tag: tag,
        artifacts: Array.from({ length: 6 }, (_, index) => ({
          name: `asset-${index}`,
          digest: `sha256:${String(index).repeat(64)}`,
          size: index + 1,
        })),
      })}\n`,
    );
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "gh"), "#!/bin/sh\nprintf '%s\\n' '{\"artifacts\":[]}'\n");
    fs.chmodSync(path.join(bin, "gh"), 0o755);
    const outputPath = path.join(root, "github-output.txt");
    const bindStep = workflow.jobs.admit.steps.find(
      (candidate: Record<string, any>) => candidate.name === "Bind source checkpoint, cohort, and idempotency",
    );
    assert.ok(bindStep);
    const result = spawnSync("/bin/bash", ["-euo", "pipefail", "-c", String(bindStep.run)], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_OUTPUT: outputPath,
        GITHUB_REPOSITORY: "gaofeng21cn/one-person-lab-app",
        SOURCE_RUN_ID: sourceRunId,
        SOURCE_HEAD_SHA: transportHead,
        SOURCE_ARTIFACT: sourceArtifact,
      },
    });
    return {
      result,
      output: fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "",
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runFullBuildProvenanceAdmission({
  completedStage = "standard_built",
  mutateBundle,
}: {
  completedStage?: string;
  mutateBundle?: (bundle: Record<string, any>) => void;
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-followup-identity-"));
  try {
    const app = "a".repeat(40);
    const shell = "b".repeat(40);
    const framework = "c".repeat(40);
    const bundleDigest = `sha256:${"d".repeat(64)}`;
    const version = "26.7.28-r4";
    const repository = "gaofeng21cn/one-person-lab-app";
    const targetStandardCommit = "e".repeat(40);
    const tag = `v${version}`;
    const bundle = {
      bundle_digest: bundleDigest,
      release: {
        channel: "stable",
        version,
        updater_version: "26.7.2804",
        tag,
      },
      sources: {
        app: { repo: repository, source_commit: app },
        shell: { source_commit: shell },
        framework: { source_commit: framework },
      },
    };
    mutateBundle?.(bundle);
    fs.writeFileSync(path.join(root, "bundle.json"), `${JSON.stringify(bundle)}\n`);
    const outputPath = path.join(root, "github-output.txt");
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    const fakeGh = path.join(bin, "gh");
    fs.writeFileSync(fakeGh, [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "const tag = process.env.OPL_TEST_STANDARD_TAG;",
      "if (args[0] !== 'api' || !args[1]?.endsWith('/releases/tags/' + tag)) process.exit(2);",
      "process.stdout.write(JSON.stringify({",
      "  id: 363488678,",
      "  tag_name: tag,",
      "  target_commitish: process.env.OPL_TEST_STANDARD_TARGET,",
      "  draft: false,",
      "  prerelease: false,",
      "  immutable: false,",
      "  published_at: '2026-08-01T09:50:34Z',",
      "  assets: [{",
      "    name: 'opl-release-attestation.json',",
      "    size: 4096,",
      "    digest: 'sha256:' + 'f'.repeat(64),",
      "  }],",
      "}) + '\\n');",
      "",
    ].join("\n"));
    fs.chmodSync(fakeGh, 0o755);

    const identityStep = fullAddon.jobs["restore-standard"].steps.find(
      (candidate: Record<string, any>) =>
        candidate.name === "Bind checkpoint build provenance and exact Standard reference",
    );
    assert.ok(identityStep);
    const script = String(identityStep.run)
      .replaceAll("${{ inputs.source_format }}", "checkpoint_v1")
      .replaceAll("${{ steps.checkpoint.outputs.completed_stage }}", completedStage)
      .replaceAll("${{ steps.checkpoint.outputs.bundle_path }}", "bundle.json")
      .replaceAll("${{ steps.checkpoint.outputs.bundle_digest }}", bundleDigest);
    const result = spawnSync("/bin/bash", ["-euo", "pipefail", "-c", script], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: [bin, process.env.PATH].join(path.delimiter),
        GITHUB_RUN_ID: "123456789",
        GITHUB_OUTPUT: outputPath,
        OPL_TEST_STANDARD_TAG: tag,
        OPL_TEST_STANDARD_TARGET: targetStandardCommit,
      },
    });
    return {
      result,
      output: fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "",
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("Stable success has one same-tag Full append successor trigger", () => {
  assert.deepEqual(Object.keys(workflow.on), ["workflow_run"]);
  assert.deepEqual(workflow.on.workflow_run.workflows, [
    "OPL Stable Release Bundle",
  ]);
  assert.deepEqual(workflow.on.workflow_run.types, ["completed"]);
  assert.deepEqual(workflow.permissions, { contents: "read", actions: "read" });
  assert.equal(
    workflow.concurrency.group,
    "opl-full-append-successor-${{ github.event.workflow_run.id }}",
  );
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.deepEqual(Object.keys(workflow.jobs), [
    "admit",
    "publish-optional-platforms",
    "dispatch",
    "receipt",
  ]);
  assert.equal(
    workflow.jobs.admit.if,
    "${{ github.event.workflow_run.conclusion == 'success' && (startsWith(github.event.workflow_run.display_title, 'OPL Stable standard ') || startsWith(github.event.workflow_run.display_title, 'OPL Stable resume_standard ')) }}",
  );
  assert.equal(
    workflow.jobs.dispatch.if,
    "${{ needs.admit.outputs.eligible == 'true' }}",
  );
  assert.deepEqual(workflow.jobs.dispatch.needs, ["admit"]);
  assert.deepEqual(workflow.jobs.dispatch.permissions, {
    contents: "read",
    actions: "write",
  });
  assert.equal(
    workflow.jobs["publish-optional-platforms"].if,
    "${{ needs.admit.outputs.optional_platforms_enabled == 'true' }}",
  );
  assert.equal(
    workflow.jobs["publish-optional-platforms"].uses,
    "./.github/workflows/build-manual.yml",
  );
  assert.equal(
    workflow.jobs["publish-optional-platforms"].with.platform_policy,
    "stable_optional",
  );
  assert.equal(
    workflow.jobs["publish-optional-platforms"].with.opl_updater_version,
    "${{ needs.admit.outputs.updater_version }}",
  );
  assert.deepEqual(workflow.jobs.receipt.needs, ["admit", "dispatch"]);
  assert.equal(
    workflow.jobs.receipt.if,
    "${{ always() && github.event.workflow_run.conclusion == 'success' && (startsWith(github.event.workflow_run.display_title, 'OPL Stable standard ') || startsWith(github.event.workflow_run.display_title, 'OPL Stable resume_standard ')) }}",
  );
  assert.deepEqual(workflow.jobs.receipt.permissions, {
    contents: "read",
    actions: "read",
  });
});

test("admission binds the Standard source run and exact checkpoint without making it a Full content identity", () => {
  assert.match(source, /\.path == "\.github\/workflows\/release-stable\.yml"/);
  assert.match(source, /\.display_title \| test\("\^OPL Stable \(\?:standard/);
  assert.match(source, /\|resume_standard \[1-9\]\[0-9\]\*\)\$"/);
  assert.match(source, /operation:\[A-Za-z0-9\._:-\]\{1,128\} authority:/);
  assert.match(source, /\.run_attempt == 1/);
  assert.match(
    source,
    /name: \$\{\{ steps\.source\.outputs\.source_artifact \}\}/,
  );
  assert.match(source, /opl-release-standard-checkpoint-\$SOURCE_RUN_ID/);
  assert.match(source, /opl-release-standard-operation-checkpoint-\$SOURCE_RUN_ID/);
  assert.match(
    source,
    /opl-release-activation-\$\{\{ github\.event\.workflow_run\.id \}\}/,
  );
  assert.match(source, /standard_built\|standard_qualified/);
  assert.doesNotMatch(source, /standard_checkpoint_not_qualified/);
  assert.doesNotMatch(source, /status:"deferred"/);
  assert.match(source, /\.stable_authority\.executor_head_sha == \$head/);
  assert.match(source, /\.source_commit == \$app/);
  assert.match(source, /\.source_cohort == \{app_sha:\$app,shell_sha:\$shell,framework_sha:\$framework\}/);
  assert.doesNotMatch(source, /\.sources\.app\.source_commit == \$head/);
  assert.match(source, /\.version == \$version/);
  assert.match(source, /\.updater_version == \$updater/);
  assert.match(source, /updater_version="\$\(jq -er \.release\.updater_version/);
  assert.match(source, /\.release_tag == \$tag/);
  assert.match(source, /all\(\.artifacts\[\];/);
  assert.match(
    fullAddonSource,
    /Bind checkpoint build provenance and exact Standard reference/,
  );
  assert.match(fullAddonSource, /target-standard-release\.json/);
  assert.match(fullAddonSource, /\.target_commitish == \$target/);
  assert.doesNotMatch(fullAddonSource, /\[\.artifacts\[\]\?\.name\]/);
  assert.doesNotMatch(fullAddonSource, /required_assets=/);
  assert.doesNotMatch(fullAddonSource, /standard-identity-receipt\.json|standard-activation/);
  assert.doesNotMatch(fullAddonSource, /Exact Standard release asset digests are not present remotely/);
  assert.doesNotMatch(fullAddonSource, /tracks\.standard\.required_asset_names/);
  assert.match(source, /source_bundle_digest/);
  assert.match(source, /\.bundle_digest "\$bundle"/);
  assert.match(source, /dispatch_payload=.*--argjson inputs "\$inputs_json"/);
  assert.match(source, /dispatch_ref="main"/);
  assert.match(source, /append_full_run_name_regex="\^OPL Stable append_full source:\$\{SOURCE_RUN_ID\} run:\[1-9\]\[0-9\]\*\$"/);
  assert.match(source, /prior_run_ids="\$\(/);
  assert.match(source, /--arg append_full_run_name_regex "\$append_full_run_name_regex"/);
  assert.match(source, /--argjson prior_run_ids "\$prior_run_ids"/);
  assert.match(source, /--arg append_full_run_name_regex "\$append_full_run_name_regex"/);
  assert.match(source, /select\(\(\$prior_run_ids \| index\(\$candidate_id\)\) \| not\)/);
  assert.equal((source.match(/test\(\$append_full_run_name_regex\)/g) ?? []).length, 3);
  assert.match(source, /executor_run_head_sha="\$\(jq -er '\.head_sha/);
  assert.match(source, /echo "executor_run_head_sha=\$executor_run_head_sha"/);
  assert.match(source, /--arg ref "\$dispatch_ref"/);
  assert.match(source, /'\{ref:\$ref,inputs:\$inputs\}'/);
  assert.match(source, /--input - <<<"\$dispatch_payload"/);
  assert.doesNotMatch(source, /current_main_sha/);
});

test("Full successor admits both initial and resumed Standard success titles, but no other operation", () => {
  const titlePattern = /^OPL Stable (?:standard (?:[1-9][0-9]*|operation:[A-Za-z0-9._:-]{1,128} authority:[A-Za-z0-9._:-]{1,128} run:[1-9][0-9]*)|resume_standard [1-9][0-9]*)$/;
  assert.match("OPL Stable standard operation:stable-op authority:stable-auth run:30800000001", titlePattern);
  assert.match("OPL Stable resume_standard 30859273345", titlePattern);
  assert.doesNotMatch("OPL Stable append_full source:30859273345 run:30860184622", titlePattern);
  assert.doesNotMatch("OPL Stable resume_standard operation:stable-op run:30859273345", titlePattern);

  const initial = runSourceValidationStep(
    "OPL Stable standard operation:stable-op authority:stable-auth run:30859273345",
  );
  assert.equal(initial.result.status, 0, initial.result.stderr || initial.result.stdout);
  assert.match(initial.output, /source_artifact=opl-release-standard-checkpoint-30859273345/);

  const resumed = runSourceValidationStep("OPL Stable resume_standard 30859273345");
  assert.equal(resumed.result.status, 0, resumed.result.stderr || resumed.result.stdout);
  assert.match(
    resumed.output,
    /source_artifact=opl-release-standard-operation-checkpoint-30859273345/,
  );

  const appendFull = runSourceValidationStep(
    "OPL Stable append_full source:30859273345 run:30860184622",
  );
  assert.notEqual(appendFull.result.status, 0);
  const forgedResume = runSourceValidationStep(
    "OPL Stable resume_standard operation:stable-op run:30859273345",
  );
  assert.notEqual(forgedResume.result.status, 0);
});

test("resumed Full successor separates transport executor head from the frozen Standard cohort", () => {
  const resumed = runSourceBindingStep();
  assert.equal(resumed.result.status, 0, resumed.result.stderr || resumed.result.stdout);
  assert.match(resumed.output, /eligible=true/);
  assert.match(resumed.output, /app_ref=a{40}/);
  assert.match(resumed.output, /framework_ref=c{40}/);

  const hostileIdentity = runSourceBindingStep({
    mutateIdentity(identity) {
      identity.cohort.app_sha = "e".repeat(40);
    },
  });
  assert.notEqual(hostileIdentity.result.status, 0);

  const hostileTransport = runSourceBindingStep({
    mutateHandoff(handoff) {
      handoff.stable_authority.executor_head_sha = "f".repeat(40);
    },
  });
  assert.notEqual(hostileTransport.result.status, 0);
});

test("append_full dispatch binds candidates and final readback to one exact Standard source run", () => {
  const stableWorkflow = parseYaml(
    fs.readFileSync(path.join(process.cwd(), ".github", "workflows", "release-stable.yml"), "utf8"),
  ) as Record<string, any>;
  const sourceRunId = "30123456789";
  const concurrentSourceRunId = "30123456790";
  const sourceBoundTitle = (runId: string, appendRunId: string) =>
    `OPL Stable append_full source:${runId} run:${appendRunId}`;
  const sourceBoundPattern = new RegExp(
    `^OPL Stable append_full source:${sourceRunId} run:[1-9][0-9]*$`,
  );
  const dispatchSnapshot = ["40100000001"];
  const dispatchCandidates = [
    {
      id: "40100000002",
      created_at: "2026-07-29T00:00:01Z",
      display_title: sourceBoundTitle(concurrentSourceRunId, "40100000002"),
    },
    {
      id: "40100000003",
      created_at: "2026-07-29T00:00:02Z",
      display_title: sourceBoundTitle(sourceRunId, "40100000003"),
    },
  ];

  assert.match(
    String(stableWorkflow["run-name"]),
    /format\('OPL Stable append_full source:\{0\} run:\{1\}', inputs\.source_run_id, github\.run_id\)/,
  );
  const selected = dispatchCandidates.filter(
    (candidate) => !dispatchSnapshot.includes(candidate.id) && sourceBoundPattern.test(candidate.display_title),
  );
  assert.deepEqual(selected.map((candidate) => candidate.id), ["40100000003"]);
  assert.doesNotMatch(dispatchCandidates[0].display_title, sourceBoundPattern);
  assert.match(dispatchCandidates[1].display_title, sourceBoundPattern);
});

test("successor dispatch is exactly one append_full JSON input set with no legacy qualification input", () => {
  const stableWorkflow = parseYaml(
    fs.readFileSync(path.join(process.cwd(), ".github", "workflows", "release-stable.yml"), "utf8"),
  ) as Record<string, any>;
  const dispatches =
    source.match(
      /gh api --method POST "repos\/\$GITHUB_REPOSITORY\/actions\/workflows\/release-stable\.yml\/dispatches"/g,
    ) ?? [];
  assert.equal(dispatches.length, 1);
  assert.match(source, /inputs_json=/);
  assert.match(source, /operation:"append_full"/);
  assert.match(source, /include_full:"false"/);
  assert.doesNotMatch(source, /-f "inputs=\$inputs_json"/);
  assert.doesNotMatch(
    source,
    /gh workflow run|gh run rerun|gh run cancel|gh release (?:create|edit|upload|delete)|git tag|make_latest/,
  );

  const execution = runSuccessorDispatchStep();
  assert.equal(execution.result.status, 0, execution.result.stderr || execution.result.stdout);
  assert.match(execution.output, /status=dispatched/);
  assert.equal(execution.payload?.ref, "main");
  assert.deepEqual(Object.keys(execution.payload?.inputs ?? {}).sort(), [
    "framework_ref",
    "include_full",
    "operation",
    "shell_ref",
    "source_artifact",
    "source_run_id",
    "version",
  ]);
  const canonicalInputKeys = new Set(Object.keys(stableWorkflow.on.workflow_dispatch.inputs));
  assert.ok(
    Object.keys(execution.payload.inputs).every((input) => canonicalInputKeys.has(input)),
    "successor POST payload must contain only canonical release-stable workflow inputs",
  );
  assert.equal(execution.payload.inputs.operation, "append_full");
  assert.equal(execution.payload.inputs.source_run_id, "30123456789");
  assert.equal(
    execution.payload.inputs.source_artifact,
    "opl-release-standard-checkpoint-30123456789",
  );
  const resumedExecution = runSuccessorDispatchStep({
    sourceArtifact: "opl-release-standard-operation-checkpoint-30123456789",
  });
  assert.equal(
    resumedExecution.result.status,
    0,
    resumedExecution.result.stderr || resumedExecution.result.stdout,
  );
  assert.equal(
    resumedExecution.payload?.inputs.source_artifact,
    "opl-release-standard-operation-checkpoint-30123456789",
  );
  assert.equal("source_qualification_run_id" in execution.payload.inputs, false);
  assert.equal("source_qualification_receipt_digest" in execution.payload.inputs, false);
});

test("successor is idempotent and does not retry an unknown dispatch result", () => {
  assert.match(source, /existing_append_full_for_cohort/);
  assert.match(source, /actions\/artifacts\?name=\$successor_intent_name/);
  assert.match(source, /one_successor_per_standard_run:true/);
  assert.doesNotMatch(source, /one_successor_per_standard_head/);
  assert.match(source, /cancel-in-progress: false/);
  assert.match(source, /no retry is allowed/);
  assert.match(source, /status=unknown/);
  assert.match(source, /run_attempt == 1/);
  assert.match(source, /\.head_branch == \$branch/);
  assert.match(source, /\.head_sha \| type == "string" and test/);
  assert.match(source, /executor_run_head_sha/);
  assert.match(source, /unique \| \.\[\]/);
  assert.doesNotMatch(source, /--paginate|--slurp/);
  assert.equal((source.match(/-f page=1/g) ?? []).length, 2);
  assert.equal((source.match(/-f per_page=100/g) ?? []).length, 2);
  assert.equal((source.match(/-f branch=main/g) ?? []).length, 2);
  assert.equal((source.match(/\[\.workflow_runs\[\]\?/g) ?? []).length, 2);
});

test("successor receipt declares additive and non-blocking boundaries", () => {
  assert.match(source, /opl_app_stable_full_successor_receipt\.v1/);
  assert.match(source, /standard_assets_modified:false/);
  assert.match(source, /latest_modified:false/);
  assert.match(source, /homebrew_modified:false/);
  assert.match(source, /certification_blocking:false/);
  assert.match(source, /opl-full-append-successor-intent-/);
  assert.match(source, /opl-full-append-dispatch-readback-/);
  assert.match(source, /opl-full-append-successor-receipt-/);
  assert.match(source, /executor_run_head_sha/);
});

test("Full admission CAS-binds a published Standard reference without locking Full content sources", () => {
  const exact = runFullBuildProvenanceAdmission();
  assert.equal(exact.result.status, 0, exact.result.stderr || exact.result.stdout);
  assert.match(exact.output, /bundle_digest=sha256:d{64}/);
  assert.match(exact.output, /app_ref=a{40}/);
  assert.match(exact.output, /shell_ref=b{40}/);
  assert.match(exact.output, /framework_source_ref=c{40}/);
  assert.match(exact.output, /target_standard_release_id=363488678/);
  assert.match(exact.output, /target_standard_release_tag=v26\.7\.28-r4/);
  assert.match(exact.output, /target_standard_target_commitish=e{40}/);

  const independentSources = runFullBuildProvenanceAdmission({
    mutateBundle(bundle) {
      bundle.sources.app.source_commit = "1".repeat(40);
      bundle.sources.shell.source_commit = "2".repeat(40);
      bundle.sources.framework.source_commit = "3".repeat(40);
    },
  });
  assert.equal(
    independentSources.result.status,
    0,
    independentSources.result.stderr || independentSources.result.stdout,
  );
  assert.match(independentSources.output, /app_ref=1{40}/);
  assert.match(independentSources.output, /shell_ref=2{40}/);
  assert.match(independentSources.output, /framework_source_ref=3{40}/);
  assert.match(independentSources.output, /target_standard_target_commitish=e{40}/);

  const channelDrift = runFullBuildProvenanceAdmission({
    mutateBundle(bundle) {
      bundle.release.channel = "preview";
    },
  });
  assert.notEqual(channelDrift.result.status, 0);

  const stageDrift = runFullBuildProvenanceAdmission({
    completedStage: "standard_started",
  });
  assert.notEqual(stageDrift.result.status, 0);
  assert.match(
    `${stageDrift.result.stdout}${stageDrift.result.stderr}`,
    /requires standard_built, standard_qualified, full_built, or full_qualified/,
  );
});
