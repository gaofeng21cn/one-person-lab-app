import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scriptPath = path.join(appRoot, 'scripts', 'write-first-run-vm-critical-diagnostics.ts');

function runDiagnostics(env: NodeJS.ProcessEnv, seed?: (cwd: string) => void) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-vm-critical-diagnostics-'));
  seed?.(cwd);
  const result = spawnSync(process.execPath, ['--experimental-strip-types', scriptPath], {
    cwd,
    env: {
      ...process.env,
      GITHUB_REPOSITORY: 'gaofeng21cn/one-person-lab-app',
      GITHUB_RUN_ID: '12345',
      PACKAGE_PROFILE: 'standard',
      DIAGNOSTIC_SCOPE: 'release_gate',
      INSTALL_MODE: 'dmg',
      ...env,
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summaryPath = path.join(
    cwd,
    'artifacts',
    'opl-first-run-vm-critical-diagnostics',
    'vm-gate-failure-summary.json',
  );
  return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
}

function writeJson(cwd: string, relativePath: string, payload: unknown) {
  const filePath = path.join(cwd, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

test('VM critical diagnostics classify failed artifact download and route recovery through Framework status only', () => {
  const summary = runDiagnostics({
    RELEASE_ARTIFACT_NAME: 'macos-build-arm64-dmg',
    RELEASE_ARTIFACT_RUN_ID: '777',
    RELEASE_ARTIFACT_DOWNLOAD_OUTCOME: 'failure',
    DMG_CONCLUSION: 'failure',
    VM_SMOKE_CONCLUSION: 'skipped',
  });

  assert.equal(summary.schema_version, 2);
  assert.equal(summary.failure.type, 'artifact_download_failed');
  assert.equal(summary.failure.boundary, 'workflow_artifact_download');
  assert.equal(summary.failure.taxonomy, 'infrastructure');
  assert.equal(summary.typed_controller_action.action, 'inspect_framework_checkpoint');
  assert.equal(summary.typed_controller_action.scope, 'framework_checkpoint_read_only');
  assert.equal(summary.typed_controller_action.rebuilds_standard_or_full_artifact, false);
  assert.equal(summary.typed_controller_action.mutation_authorized, false);
  assert.equal(summary.typed_controller_action.direct_workflow_dispatch_allowed, false);
  assert.equal(
    summary.typed_controller_action.command_template,
    'node --experimental-strip-types scripts/release-bundle-cli.ts status --bundle <sha256:bundle> --store <bundle-store> --json',
  );
  assert.equal(summary.release_inputs.release_artifact_name, 'macos-build-arm64-dmg');
  assert.equal(summary.release_inputs.release_artifact_run_id, '777');
  assert.doesNotMatch(JSON.stringify(summary), /gh workflow run|--execute|rerun/i);
});

test('VM critical diagnostics classify missing release asset before VM work', () => {
  const summary = runDiagnostics({
    RELEASE_TAG: 'v26.7.5',
    RELEASE_ARTIFACT_DOWNLOAD_OUTCOME: 'skipped',
    DMG_CONCLUSION: 'failure',
    VM_SMOKE_CONCLUSION: 'skipped',
  });

  assert.equal(summary.failure.type, 'release_asset_missing');
  assert.equal(summary.failure.boundary, 'resolve_release_dmg');
  assert.equal(summary.typed_controller_action.action, 'inspect_framework_checkpoint');
  assert.equal(summary.typed_controller_action.controller_subcommand, 'status');
  assert.equal(summary.typed_controller_action.rebuilds_standard_or_full_artifact, false);
});

test('VM critical diagnostics distinguish Tart launch failure from App readiness failure', () => {
  const launchSummary = runDiagnostics(
    {
      RELEASE_ARTIFACT_DOWNLOAD_OUTCOME: 'success',
      DMG_CONCLUSION: 'success',
      VM_SMOKE_CONCLUSION: 'failure',
    },
    (cwd) => writeJson(cwd, 'artifacts/opl-first-run-vm/tart-smoke-summary.json', {
      status: 'failed',
      failure_stage: 'wait_for_ssh',
      error: 'Timed out waiting for SSH',
    }),
  );
  assert.equal(launchSummary.failure.type, 'vm_launch_failed');
  assert.equal(launchSummary.failure.boundary, 'wait_for_ssh');
  assert.equal(launchSummary.failure.taxonomy, 'environment');

  const appReadySummary = runDiagnostics(
    {
      RELEASE_ARTIFACT_DOWNLOAD_OUTCOME: 'success',
      DMG_CONCLUSION: 'success',
      VM_SMOKE_CONCLUSION: 'failure',
    },
    (cwd) => writeJson(cwd, 'artifacts/opl-first-run-vm/tart-smoke-summary.json', {
      status: 'failed',
      failure_stage: 'run_guest_smoke',
      error: 'Guid page did not become ready before assistant route smoke',
      guest_summary: {
        status: 'failed',
        error: 'Guid page did not become ready before assistant route smoke',
      },
    }),
  );
  assert.equal(appReadySummary.failure.type, 'app_ready_failed');
  assert.equal(appReadySummary.failure.boundary, 'guest_app_ready');
  assert.equal(appReadySummary.failure.taxonomy, 'product');
});

test('VM critical diagnostics classify OPL configure-codex failures before App readiness', () => {
  const summary = runDiagnostics(
    {
      RELEASE_ARTIFACT_DOWNLOAD_OUTCOME: 'success',
      DMG_CONCLUSION: 'success',
      VM_SMOKE_CONCLUSION: 'failure',
    },
    (cwd) => writeJson(cwd, 'artifacts/opl-first-run-vm/tart-smoke-summary.json', {
      status: 'failed',
      failure_stage: 'run_guest_smoke',
      error: 'opl system configure-codex --api-key-stdin --json failed before bootstrap readiness',
    }),
  );

  assert.equal(summary.failure.type, 'opl_configure_codex_failed');
  assert.equal(summary.failure.boundary, 'guest_opl_configuration');
  assert.match(summary.failure.reason, /before App readiness checks/);
});

test('VM critical diagnostics classify OPL output buffer exhaustion as a harness failure', () => {
  const summary = runDiagnostics(
    {
      RELEASE_ARTIFACT_NAME: 'opl-full-first-install-dmg-26.7.13-mac-arm64',
      RELEASE_ARTIFACT_RUN_ID: '29246288414',
      RELEASE_ARTIFACT_DOWNLOAD_OUTCOME: 'success',
      DMG_CONCLUSION: 'success',
      VM_SMOKE_CONCLUSION: 'failure',
      GITHUB_REF_NAME: 'codex/release-26.7.13-qualification-harness-20260713',
      ARTIFACT_APP_SHA: 'a'.repeat(40),
      PRODUCT_SHELL_SHA: 'b'.repeat(40),
      SMOKE_HARNESS_SHELL_SHA: 'c'.repeat(40),
    },
    (cwd) => writeJson(cwd, 'artifacts/opl-first-run-vm/tart-smoke-summary.json', {
      status: 'failed',
      failure_stage: 'run_guest_smoke',
      error: 'opl app state --profile fast --json exceeded the 67108864-byte output buffer (ENOBUFS)',
    }),
  );

  assert.equal(summary.failure.type, 'opl_command_output_buffer_exhausted');
  assert.equal(summary.typed_controller_action.action, 'inspect_framework_checkpoint');
  assert.equal(summary.typed_controller_action.controller, 'app_release_bundle_cli');
  assert.equal(summary.typed_controller_action.rebuilds_standard_or_full_artifact, false);
  assert.equal(summary.release_inputs.artifact_app_sha, 'a'.repeat(40));
  assert.equal(summary.release_inputs.product_shell_sha, 'b'.repeat(40));
  assert.equal(summary.release_inputs.smoke_harness_shell_sha, 'c'.repeat(40));
  assert.doesNotMatch(JSON.stringify(summary), /gh workflow run|--execute|rerun/i);
});

test('VM critical diagnostics keep Settings contract failures out of App readiness', () => {
  const summary = runDiagnostics(
    {
      RELEASE_ARTIFACT_DOWNLOAD_OUTCOME: 'success',
      DMG_CONCLUSION: 'success',
      VM_SMOKE_CONCLUSION: 'failure',
    },
    (cwd) => writeJson(cwd, 'artifacts/opl-first-run-vm/tart-smoke-summary.json', {
      status: 'failed',
      failure_stage: 'run_guest_smoke',
      error: 'Advanced Settings did not expose the OPL Developer Profile status after page readiness polling',
      guest_summary: {
        status: 'failed',
        error: 'Advanced Settings did not expose the OPL Developer Profile status',
      },
    }),
  );

  assert.equal(summary.failure.type, 'settings_smoke_failed');
  assert.equal(summary.failure.boundary, 'guest_settings_smoke');
  assert.equal(summary.failure.taxonomy, 'product');
  assert.equal(summary.typed_controller_action.action, 'inspect_framework_checkpoint');
  assert.equal(
    summary.typed_controller_action.post_inspection_disposition,
    'freeze_new_bundle_if_framework_status_is_conclusive',
  );
  assert.notEqual(summary.failure.type, 'app_ready_failed');
});

test('VM critical diagnostics classify rendered Settings with a stale navigation probe as verifier drift', () => {
  const readinessDiagnostic = {
    id: 'general',
    expectedHash: '#/settings/general',
    hash: '#/settings/general',
    navPresent: false,
    contentPresent: true,
    loaderVisible: false,
    firstRunWindowVisible: false,
  };
  const summary = runDiagnostics(
    {
      RELEASE_ARTIFACT_NAME: 'macos-build-arm64-dmg',
      RELEASE_ARTIFACT_RUN_ID: '29765847113',
      RELEASE_ARTIFACT_DOWNLOAD_OUTCOME: 'success',
      DMG_CONCLUSION: 'success',
      VM_SMOKE_CONCLUSION: 'failure',
    },
    (cwd) => writeJson(cwd, 'artifacts/opl-first-run-vm/tart-smoke-summary.json', {
      status: 'failed',
      failure_stage: 'run_guest_smoke',
      error: `Settings page did not become ready: general\nSettings readiness diagnostic: ${JSON.stringify(readinessDiagnostic)}\n`,
    }),
  );

  assert.equal(summary.failure.type, 'settings_smoke_failed');
  assert.equal(summary.failure.taxonomy, 'fixture');
  assert.equal(summary.failure.classification, 'verification_harness_contract_drift');
  assert.equal(summary.typed_controller_action.action, 'inspect_framework_checkpoint');
  assert.equal(summary.typed_controller_action.scope, 'framework_checkpoint_read_only');
  assert.equal(summary.typed_controller_action.rebuilds_standard_or_full_artifact, false);
  assert.equal(summary.typed_controller_action.uses_existing_release_artifact, false);
  assert.match(summary.typed_controller_action.command_template, /^node --experimental-strip-types scripts\/release-bundle-cli\.ts status /);
});

test('VM critical diagnostics fail closed on Runtime return readiness without verifier-drift proof', () => {
  const summary = runDiagnostics(
    {
      RELEASE_ARTIFACT_NAME: 'macos-build-arm64-dmg',
      RELEASE_ARTIFACT_RUN_ID: '29637293079',
      RELEASE_ARTIFACT_DOWNLOAD_OUTCOME: 'success',
      DMG_CONCLUSION: 'success',
      VM_SMOKE_CONCLUSION: 'failure',
    },
    (cwd) => writeJson(cwd, 'artifacts/opl-first-run-vm/tart-smoke-summary.json', {
      status: 'failed',
      failure_stage: 'run_guest_smoke',
      error: 'Runtime status page did not become ready before refresh',
      guest_summary: null,
    }),
  );

  assert.equal(summary.failure.type, 'settings_smoke_failed');
  assert.equal(summary.failure.boundary, 'runtime_return_ready_marker');
  assert.equal(summary.failure.taxonomy, 'product');
  assert.notEqual(summary.failure.type, 'app_ready_failed');
  assert.equal(summary.typed_controller_action.action, 'inspect_framework_checkpoint');
  assert.equal(summary.typed_controller_action.scope, 'framework_checkpoint_read_only');
  assert.equal(summary.typed_controller_action.rebuilds_standard_or_full_artifact, false);
  assert.equal(summary.typed_controller_action.execution_mode, 'read_only');
  assert.match(summary.typed_controller_action.command_template, /^node --experimental-strip-types scripts\/release-bundle-cli\.ts status /);
});

test('VM critical diagnostics keep Home assistant route failures out of App readiness', () => {
  const summary = runDiagnostics(
    {
      RELEASE_ARTIFACT_DOWNLOAD_OUTCOME: 'success',
      DMG_CONCLUSION: 'success',
      VM_SMOKE_CONCLUSION: 'failure',
    },
    (cwd) => writeJson(cwd, 'artifacts/opl-first-run-vm/tart-smoke-summary.json', {
      status: 'failed',
      failure_stage: 'run_guest_smoke',
      error: 'Could not select OPL built-in assistant: med-autoscience',
    }),
  );

  assert.equal(summary.failure.type, 'assistant_route_smoke_failed');
  assert.equal(summary.failure.boundary, 'guest_assistant_route_smoke');
  assert.notEqual(summary.failure.type, 'app_ready_failed');
});
