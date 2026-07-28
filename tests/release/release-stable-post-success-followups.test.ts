import assert from "node:assert/strict";
import crypto from "node:crypto";
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

function sha256(bytes: string): string {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function runFullIdentityAdmission(remoteMutation?: (release: Record<string, any>) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-followup-identity-"));
  try {
    const app = "a".repeat(40);
    const shell = "b".repeat(40);
    const framework = "c".repeat(40);
    const bundleDigest = `sha256:${"d".repeat(64)}`;
    const version = "26.7.28-r4";
    const tag = `v${version}`;
    const artifactBytes = "exact-standard-dmg";
    const artifactName = `One-Person-Lab-${version}-mac-arm64.dmg`;
    const manifest = {
      surface_kind: "opl_app_component_manifest.v1",
      version,
      release_tag: tag,
      artifacts: [{
        name: artifactName,
        digest: sha256(artifactBytes),
        size: Buffer.byteLength(artifactBytes),
      }],
    };
    const manifestBytes = `${JSON.stringify(manifest)}\n`;
    const manifestDigest = sha256(manifestBytes);
    const bundle = {
      bundle_digest: bundleDigest,
      release: {
        channel: "stable",
        version,
        updater_version: "26.7.2804",
        tag,
      },
      sources: {
        app: { source_commit: app },
        shell: { source_commit: shell },
        framework: { source_commit: framework },
      },
    };
    const identity = {
      schema: "opl_standard_release_identity_receipt.v2",
      status: "passed",
      release: {
        channel: "stable",
        version,
        tag,
        bundle_digest: bundleDigest,
      },
      cohort: {
        app_sha: app,
        shell_sha: shell,
        framework_sha: framework,
      },
      component_manifest: {
        name: "opl-app-component-manifest.json",
        sha256: manifestDigest,
      },
    };
    const release = {
      tag_name: tag,
      draft: false,
      prerelease: false,
      assets: [
        {
          name: artifactName,
          digest: sha256(artifactBytes),
          size: Buffer.byteLength(artifactBytes),
        },
        {
          name: "opl-app-component-manifest.json",
          digest: manifestDigest,
          size: Buffer.byteLength(manifestBytes),
        },
      ],
    };
    remoteMutation?.(release);

    fs.mkdirSync(path.join(root, "checkpoint-identity-bootstrap"));
    fs.mkdirSync(path.join(root, "standard-activation"));
    fs.mkdirSync(path.join(root, "bin"));
    fs.writeFileSync(path.join(root, "bundle.json"), `${JSON.stringify(bundle)}\n`);
    fs.writeFileSync(
      path.join(root, "checkpoint-identity-bootstrap", "standard-identity-receipt.json"),
      `${JSON.stringify(identity)}\n`,
    );
    fs.writeFileSync(
      path.join(root, "standard-activation", "latest-component-manifest.json"),
      manifestBytes,
    );
    fs.writeFileSync(path.join(root, "remote-release.json"), `${JSON.stringify(release)}\n`);
    const ghPath = path.join(root, "bin", "gh");
    fs.writeFileSync(ghPath, "#!/bin/sh\ncat \"$OPL_TEST_REMOTE_RELEASE\"\n");
    fs.chmodSync(ghPath, 0o755);

    const identityStep = fullAddon.jobs["restore-standard"].steps.find(
      (candidate: Record<string, any>) =>
        candidate.name === "Require exact Stable Standard identity and Full eligibility",
    );
    assert.ok(identityStep);
    const script = String(identityStep.run)
      .replaceAll("${{ inputs.source_format }}", "checkpoint_v1")
      .replaceAll("${{ steps.checkpoint.outputs.completed_stage }}", "standard_built")
      .replaceAll("${{ steps.checkpoint.outputs.bundle_path }}", "bundle.json")
      .replaceAll("${{ steps.checkpoint.outputs.bundle_digest }}", bundleDigest);
    return spawnSync("/bin/bash", ["-euo", "pipefail", "-c", script], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
        GITHUB_REPOSITORY: "gaofeng21cn/one-person-lab-app",
        GITHUB_RUN_ID: "123456789",
        GITHUB_OUTPUT: path.join(root, "github-output.txt"),
        OPL_TEST_REMOTE_RELEASE: path.join(root, "remote-release.json"),
      },
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("Stable success has one independent Full append successor trigger", () => {
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
    "dispatch",
    "receipt",
  ]);
  assert.equal(
    workflow.jobs.admit.if,
    "${{ github.event.workflow_run.conclusion == 'success' && startsWith(github.event.workflow_run.display_title, 'OPL Stable standard ') }}",
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
  assert.deepEqual(workflow.jobs.receipt.needs, ["admit", "dispatch"]);
  assert.deepEqual(workflow.jobs.receipt.permissions, {
    contents: "read",
    actions: "read",
  });
});

test("admission binds Standard run, exact checkpoint, cohort, and stable publication", () => {
  assert.match(source, /\.path == "\.github\/workflows\/release-stable\.yml"/);
  assert.match(source, /\.display_title \| test\("\^OPL Stable standard/);
  assert.match(source, /operation:\[A-Za-z0-9\._:-\]\{1,128\} authority:/);
  assert.match(source, /\.run_attempt == 1/);
  assert.match(
    source,
    /opl-release-standard-checkpoint-\$\{\{ github\.event\.workflow_run\.id \}\}/,
  );
  assert.match(
    source,
    /opl-release-activation-\$\{\{ github\.event\.workflow_run\.id \}\}/,
  );
  assert.match(source, /standard_built\|standard_qualified/);
  assert.doesNotMatch(source, /standard_checkpoint_not_qualified/);
  assert.doesNotMatch(source, /status:"deferred"/);
  assert.match(source, /\.sources\.app\.source_commit == \$head/);
  assert.match(source, /\.source_cohort == \{app_sha:\$head,shell_sha:\$shell,framework_sha:\$framework\}/);
  assert.match(source, /\.version == \$version/);
  assert.match(source, /\.release_tag == \$tag/);
  assert.match(source, /all\(\.artifacts\[\];/);
  assert.match(fullAddonSource, /\[\.artifacts\[\]\?\.name\]/);
  assert.match(fullAddonSource, /required_assets=/);
  assert.doesNotMatch(fullAddonSource, /tracks\.standard\.required_asset_names/);
  assert.match(source, /source_bundle_digest/);
  assert.match(source, /\.bundle_digest "\$bundle"/);
  assert.match(source, /dispatch_payload=.*--argjson inputs "\$inputs_json"/);
  assert.match(source, /dispatch_ref="v\$\{VERSION\}"/);
  assert.match(source, /--arg ref "\$dispatch_ref"/);
  assert.match(source, /'\{ref:\$ref,inputs:\$inputs\}'/);
  assert.match(source, /--input - <<<"\$dispatch_payload"/);
  assert.doesNotMatch(source, /current_main_sha/);
});

test("successor dispatch is exactly one append_full JSON input set with no legacy qualification input", () => {
  const dispatches =
    source.match(
      /gh api --method POST "repos\/\$GITHUB_REPOSITORY\/actions\/workflows\/release-stable\.yml\/dispatches"/g,
    ) ?? [];
  assert.equal(dispatches.length, 1);
  assert.match(source, /inputs_json=/);
  assert.match(source, /operation:"append_full"/);
  assert.match(source, /include_full:"false"/);
  assert.match(source, /source_qualification_run_id:""/);
  assert.match(source, /source_qualification_receipt_digest:""/);
  assert.doesNotMatch(source, /-f "inputs=\$inputs_json"/);
  assert.doesNotMatch(
    source,
    /gh workflow run|gh run rerun|gh run cancel|gh release (?:create|edit|upload|delete)|git tag|make_latest/,
  );
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
  assert.match(source, /\.head_sha == \$head/);
  assert.match(source, /unique \| \.\[\]/);
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
});

test("Full admission accepts exact Standard bytes and rejects remote digest or size drift", () => {
  const exact = runFullIdentityAdmission();
  assert.equal(exact.status, 0, exact.stderr || exact.stdout);

  const digestDrift = runFullIdentityAdmission((release) => {
    release.assets[0].digest = `sha256:${"e".repeat(64)}`;
  });
  assert.notEqual(digestDrift.status, 0);
  assert.match(
    `${digestDrift.stdout}${digestDrift.stderr}`,
    /Exact Standard release asset digests are not present remotely/,
  );

  const sizeDrift = runFullIdentityAdmission((release) => {
    release.assets[0].size += 1;
  });
  assert.notEqual(sizeDrift.status, 0);
  assert.match(
    `${sizeDrift.stdout}${sizeDrift.stderr}`,
    /Exact Standard release asset digests are not present remotely/,
  );
});
