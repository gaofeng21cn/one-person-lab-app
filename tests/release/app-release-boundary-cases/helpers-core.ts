import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import test from "node:test";

export { assert, crypto, fs, os, path, spawnSync, deflateSync, test };

export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const require = createRequire(import.meta.url);
export const externalShellRoot = process.env.OPL_APP_SHELL_ROOT?.trim() ? path.resolve(appRoot, process.env.OPL_APP_SHELL_ROOT) : null;
export const activeShellRoot = externalShellRoot ?? path.join(appRoot, JSON.parse(fs.readFileSync(path.join(appRoot, "contracts/app-shell-adapter.json"), "utf8")).shell_root);
export const legacyAionShellRoot = process.env.OPL_AIONUI_TEST_SHELL_ROOT?.trim()
  ? path.resolve(appRoot, process.env.OPL_AIONUI_TEST_SHELL_ROOT)
  : path.join(appRoot, "shells", "aionui");

export function runNode(args, options = {}) {
  return spawnSync(process.execPath, ["--experimental-strip-types", ...args], {
    cwd: appRoot,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
  });
}

export function writeFile(filePath, content = "artifact") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJsonFixture(tempRoot, relativePath, value, space) {
  writeFile(path.join(tempRoot, ...relativePath.split("/")), `${JSON.stringify(value, null, space)}\n`);
}

function writeJsonFixtures(tempRoot, fixtures, space) {
  for (const [relativePath, value] of fixtures) writeJsonFixture(tempRoot, relativePath, value, space);
}

export function writeExecutable(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, { encoding: "utf8", mode: 0o755 });
}

export function writeBinaryFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

export function writeScreenshotPng(filePath, width = 640, height = 360) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + 1 + x * 4;
      raw[offset] = (x + y) % 256;
      raw[offset + 1] = (x * 3 + y) % 256;
      raw[offset + 2] = (x + y * 3) % 256;
      raw[offset + 3] = 255;
    }
  }
  writeBinaryFile(filePath, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]));
}

export function writeAssistantRouteSmokeScreenshots(tempRoot) {
  for (const assistantId of ["mas", "mag", "rca"]) {
    writeScreenshotPng(path.join(tempRoot, "artifacts", "assistant-route-smoke", `${assistantId}.png`));
  }
}

const canonicalAssistantRouteIds = ["mas", "mag", "rca"];
const canonicalAssistantShortNames = { mas: "MAS", mag: "MAG", rca: "RCA" };
export const canonicalAssistantTargets = {
  mas: { assistant_id: "mas", shortcut_id: "research", package_id: "mas", codex_visible_entry: "med-autoscience", required_skill_ids: ["med-autoscience"], badge: "@科研" },
  mag: { assistant_id: "mag", shortcut_id: "open_grant_user_loop", package_id: "mag", codex_visible_entry: "med-autogrant", required_skill_ids: ["med-autogrant"], badge: "@基金" },
  rca: { assistant_id: "rca", shortcut_id: "invoke_product_entry", package_id: "rca", codex_visible_entry: "redcube-ai", required_skill_ids: ["redcube-ai"], badge: "@演示" },
};

function appStateFixture(profile, stageAttemptCount, actions = []) {
  return {
    app_state: {
      schema: "opl_app_state.v1",
      profile,
      operator: { summary: { stage_attempt_count: stageAttemptCount }, ...(actions.length ? { actions } : {}) },
      provider: { temporal: { status: "ready" } },
    },
  };
}

function drilldownFixture(stageAttemptCount) {
  return {
    app_operator_drilldown: {
      surface_kind: "opl_app_operator_drilldown_read_model",
      detail_level: "full",
      summary: { stage_attempt_count: stageAttemptCount },
    },
  };
}

function actionExecutionFixture(actionId, dryRun) {
  return {
    app_action_execution: {
      surface_kind: "opl_app_action_execution.v1",
      action_id: actionId,
      dry_run: dryRun,
      result: { execution: { execution_status: dryRun ? "dry_run" : "executed" } },
      authority_boundary: { can_write_domain_truth: false },
    },
  };
}

export function writeRuntimeEvidenceJsonFiles(tempRoot) {
  const triggerAction = { action_id: "provider-scheduler:temporal:trigger" };
  const stageActionId = "stage-production-attempt:medautoscience:analysis-campaign";
  writeJsonFixtures(tempRoot, [
    ["app-state-summary.json", appStateFixture("fast", 1, [triggerAction])],
    ["app-state-full.json", appStateFixture("full", 1, [triggerAction])],
    ["drilldown-full.json", drilldownFixture(1)],
    ["action-dry-run-result.json", actionExecutionFixture(stageActionId, true)],
    ["action-execute-result.json", actionExecutionFixture(stageActionId, false)],
  ]);
}

export function writeCollectorFakeOpl(fakeOpl, actionLog = "", outputs = {}) {
  const responses = {
    "app state --profile fast --json": outputs.fast ?? appStateFixture("fast", 2),
    "app state --profile full --json": outputs.full ?? appStateFixture("full", 2),
    "runtime app-operator-drilldown --detail full --json": outputs.drilldown ?? drilldownFixture(2),
  };
  writeExecutable(fakeOpl, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const responses = ${JSON.stringify(responses, null, 2)};
${actionLog ? `fs.appendFileSync(${JSON.stringify(actionLog)}, JSON.stringify(args) + '\\n');` : ""}
const key = args.join(' ');
const routeResponse = responses[key];
if (routeResponse) {
  process.stdout.write(JSON.stringify(routeResponse) + '\\n');
  process.exit(0);
}
if (args.slice(0, 4).join(' ') === 'app action execute --action') {
  const dryRun = args.includes('--dry-run');
  const execution_status = dryRun ? 'dry_run' : 'executed';
  process.stdout.write(JSON.stringify({ app_action_execution: {
    surface_kind: 'opl_app_action_execution.v1',
    action_id: args[4],
    dry_run: dryRun,
    result: { execution: { execution_status } },
    authority_boundary: { can_write_domain_truth: false }
  } }) + '\\n');
  process.exit(0);
}
console.error('unexpected opl args: ' + key);
process.exit(2);
`);
}

export function writeVmSmokeSummaryFiles(tempRoot, runtimeProfile = "full") {
  const fullRuntime = runtimeProfile === "full";
  const settingsSmoke = { status: "passed", pages: ["general"] };
  const assistantRouteSmoke = {
    status: "passed",
    verification_mode: fullRuntime ? "route_receipt" : "state_aware_launch_admission",
    assistants: canonicalAssistantRouteIds,
  };
  const requiredSkillIds = canonicalAssistantRouteIds.flatMap(
    (id) => canonicalAssistantTargets[id].required_skill_ids,
  );
  const codexFunctionalCheck = {
    schema: "opl_codex_functional_check_receipt.v1",
    status: "diagnostic_skipped",
    runtime_profile: runtimeProfile,
    assistant_route_receipts_checked: {
      status: fullRuntime ? "passed" : "not_applicable_standard",
      required: requiredSkillIds,
      checked: fullRuntime ? requiredSkillIds : [],
      deterministic: true,
    },
    assistant_launch_admissions_checked: {
      status: fullRuntime ? "not_applicable_full" : "passed",
      required: requiredSkillIds,
      checked: fullRuntime ? [] : requiredSkillIds,
      deterministic: true,
    },
    blocking_release_gate: { deterministic_fields_passed: true, llm_invocation_required: false },
  };
  const codexAiSelfCheck = {
    schema: "opl_codex_ai_self_check_receipt.v1", status: "skipped_missing_codex_config", mode: "diagnose", mutations_allowed: false, blocking_release_gate: false,
  };
  const guestSummary = {
    surface_id: "opl_packaged_gui_first_run_smoke",
    status: "passed",
    runtime_profile: runtimeProfile,
    gui_ready: { hasGuidInput: true, hasGuidSendButton: true },
    codex_config_wizard_seen: fullRuntime,
    codex_config_wizard_submitted: fullRuntime,
    settings_smoke: settingsSmoke,
    assistant_route_smoke: assistantRouteSmoke,
    codex_functional_check: codexFunctionalCheck,
    codex_ai_self_check: codexAiSelfCheck,
  };
  const assistantRouteSmokeSummary = {
    surface_id: "opl_packaged_gui_assistant_route_smoke",
    status: "passed",
    runtime_profile: runtimeProfile,
    verification_mode: fullRuntime ? "route_receipt" : "state_aware_launch_admission",
    assistants: canonicalAssistantRouteIds.map((id) => {
      const shortName = canonicalAssistantShortNames[id];
      const target = canonicalAssistantTargets[id];
      const badge = target.badge;
      return fullRuntime
        ? {
            id,
            ...target,
            badge,
            verification_mode: "route_receipt",
            ready: { badge, selectors_hidden: true },
            receipt: {
              status: "passed",
              conversation_type: "acp",
              backend: "codex",
              route: { route_kind: "builtin_capability", executor: "codex_cli", assistant_id: id, assistant_short_name: shortName, source: "opl_app_home" },
            },
          }
        : {
            id,
            ...target,
            badge,
            verification_mode: "state_aware_launch_admission",
            launch_admission: id === "mag" ? {
              visible: true,
              selectable_before_selection: true,
              selected: true,
              launch_allowed: false,
              projection_state: "unavailable",
              send_attempted: true,
              send_blocked: true,
              readiness_hint: "package_not_installed: status, doctor, repair",
              typed_reason: "package_not_installed",
              draft_preserved: true,
              repair_hint_visible: true,
              message_visible: true,
              route_receipt_claimed: false,
            } : {
              visible: true,
              selectable_before_selection: true,
              selected: true,
              launch_allowed: true,
              projection_state: "available",
              send_attempted: false,
              send_blocked: false,
              repair_hint_visible: false,
              message_visible: false,
              route_receipt_claimed: false,
            },
          };
    }),
  };
  writeJsonFixtures(tempRoot, [
    ["artifacts/smoke-summary.json", guestSummary],
    ["artifacts/codex-functional-check-summary.json", codexFunctionalCheck],
    ["artifacts/codex-ai-self-check-summary.json", codexAiSelfCheck],
    ["artifacts/assistant-route-smoke-summary.json", assistantRouteSmokeSummary],
    ["tart-smoke-summary.json", {
      surface_id: "opl_tart_gui_first_run_smoke",
      status: "passed",
      runtime_profile: runtimeProfile,
      require_codex_config_wizard: fullRuntime,
      settings_smoke: settingsSmoke,
      assistant_route_smoke: assistantRouteSmoke,
      codex_functional_check: codexFunctionalCheck,
      codex_ai_self_check: codexAiSelfCheck,
      guest_summary: guestSummary,
    }],
  ]);
}

export function writeTypedBlockerFile(tempRoot, artifactId, fields = {}) {
  writeJsonFixture(tempRoot, `typed-blockers/${artifactId}.json`, {
    artifact_id: artifactId,
    typed_blocker_ref: `typed_blocker_ref://one-person-lab-app/test/${artifactId}`,
    owner: "one-person-lab-app",
    blocker_kind: "release_evidence_producer_blocked",
    reason: `${artifactId} producer did not complete in this test environment`,
    evidence_refs: [`log_ref://one-person-lab-app/test/${artifactId}`],
    next_action: `rerun ${artifactId} producer with a reachable release environment`,
    ...fields,
  }, 2);
}

export function releaseEvidenceCohort(version = "26.6.5") {
  return {
    schema: "opl_app_release_evidence_cohort.v1",
    version,
    tag: `v${version}`,
    channel: /nightly/i.test(version) ? "nightly" : "stable",
    source: "test_fixture",
    current_cohort_evidence: true,
  };
}

export function remoteReleaseVerificationSummary(version = "26.6.5", fields = {}) {
  return {
    status: "passed",
    repo: "gaofeng21cn/one-person-lab-app",
    tag: `v${version}`,
    version,
    include_full_package: true,
    verified_asset_count: 10,
    full_first_install_budget: { status: "passed" },
    ...fields,
  };
}

export function writeRemoteReleaseVerificationSummary(
  tempRoot,
  version = "26.6.5",
  fields = {},
) {
  writeJsonFixture(tempRoot, "remote-release-verification.json", remoteReleaseVerificationSummary(version, fields));
}

export function dockerWebuiCleanVmEvidenceSummary(fields = {}) {
  const summaryForGate = (gateId, artifactName) => ({
    schema: "opl_docker_webui_clean_vm_evidence_validation.v1",
    gate_id: gateId,
    status: "passed",
    artifact_name: artifactName,
    result_path: `${gateId}/docker-webui-smoke-gate-result.json`,
    validation: { status: "passed" },
    observed_at: "2026-06-30T00:00:00.000Z",
    required_environment: gateId,
  });
  return {
    schema: "opl_docker_webui_clean_vm_evidence_validation.v1",
    status: "passed",
    required_gates: ["clean_linux_vm"],
    optional_gates: ["clean_windows_vm"],
    summaries: [
      summaryForGate("clean_linux_vm", "same_job_ubuntu_clean_vm_generated"),
      summaryForGate("clean_windows_vm", "windows-clean-evidence"),
    ],
    release_readiness_policy:
      "clean Linux Docker runtime evidence must validate as passed before release readiness aggregation; clean Windows VM evidence is optional diagnostic import.",
    ...fields,
  };
}

export function writeDockerWebuiCleanVmEvidenceSummary(tempRoot, fields = {}) {
  writeJsonFixture(tempRoot, "docker-webui-clean-vm-evidence-validation.json", dockerWebuiCleanVmEvidenceSummary(fields));
}

export function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function fileSha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function writeFakeMacosTrustCommands(binDir, options = {}) {
  const teamIdentifier = options.teamIdentifier ?? "TESTTEAMID";
  const signature = options.signature ?? "Developer ID Application: Test (TESTTEAMID)";
  writeExecutable(
    path.join(binDir, "codesign"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'if [ "$1" = "-dv" ]; then',
      `  echo ${JSON.stringify(`Signature=${signature}`)} >&2`,
      `  echo ${JSON.stringify(`TeamIdentifier=${teamIdentifier}`)} >&2`,
      `  echo ${JSON.stringify(`Authority=${signature}`)} >&2`,
      "  exit 0",
      "fi",
      "exit 0",
      "",
    ].join("\n"),
  );
  writeExecutable(
    path.join(binDir, "spctl"),
    "#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n",
  );
  writeExecutable(
    path.join(binDir, "xcrun"),
    "#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n",
  );
  writeExecutable(
    path.join(binDir, "hdiutil"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'if [ "${1:-}" = "attach" ]; then',
      '  mountpoint=""',
      '  while [ "$#" -gt 0 ]; do',
      '    if [ "$1" = "-mountpoint" ]; then shift; mountpoint="$1"; fi',
      "    shift",
      "  done",
      '  mkdir -p "$mountpoint/One Person Lab.app"',
      "fi",
      "exit 0",
      "",
    ].join("\n"),
  );
}

export function walkFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const entryPath = path.join(dir, entry.name);
      return entry.isDirectory() ? walkFiles(entryPath) : entry.isFile() ? [entryPath] : [];
    });
}
