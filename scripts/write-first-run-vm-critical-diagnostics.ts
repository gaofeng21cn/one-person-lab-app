#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

type JsonRecord = Record<string, unknown>;

type FailureType =
  | 'none'
  | 'artifact_download_failed'
  | 'release_asset_missing'
  | 'vm_launch_failed'
  | 'opl_configure_codex_failed'
  | 'settings_smoke_failed'
  | 'assistant_route_smoke_failed'
  | 'opl_command_output_buffer_exhausted'
  | 'app_ready_failed'
  | 'vm_smoke_failed'
  | 'vm_harness_preflight_failed';

type QualificationFailureTaxonomy =
  | 'none'
  | 'product'
  | 'fixture'
  | 'environment'
  | 'infrastructure';

const outputDir = 'artifacts/opl-first-run-vm-critical-diagnostics';
const vmArtifactDir = 'artifacts/opl-first-run-vm';

function env(name: string): string {
  return process.env[name] || '';
}

function readJson(relativePath: string): JsonRecord | null {
  try {
    const absolutePath = path.resolve(relativePath);
    if (!fs.existsSync(absolutePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as JsonRecord
      : null;
  } catch {
    return null;
  }
}

function stringField(record: JsonRecord | null | undefined, key: string): string {
  const value = record?.[key];
  return typeof value === 'string' ? value : '';
}

function recordField(record: JsonRecord | null | undefined, key: string): JsonRecord | null {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function failed(value: string): boolean {
  return !['', 'success', 'skipped'].includes(value);
}

function includesAny(value: string, needles: string[]): boolean {
  const normalized = value.toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

function failureErrorText(classification: {
  tartSummary: JsonRecord | null;
  guestSummary: JsonRecord | null;
}): string {
  return [
    stringField(classification.tartSummary, 'error'),
    stringField(recordField(classification.tartSummary, 'error_classification'), 'message'),
    stringField(classification.guestSummary, 'error'),
    stringField(recordField(classification.guestSummary, 'bootstrap_launch_diagnostics'), 'error'),
  ].join('\n');
}

function readSettingsReadinessDiagnostic(errorText: string): JsonRecord | null {
  const marker = 'Settings readiness diagnostic: ';
  const markerIndex = errorText.lastIndexOf(marker);
  if (markerIndex < 0) return null;
  const payload = errorText.slice(markerIndex + marker.length).split(/\r?\n/, 1)[0]?.trim();
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as JsonRecord
      : null;
  } catch {
    return null;
  }
}

function qualificationFailure(
  failureType: FailureType,
  errorText: string,
): { taxonomy: QualificationFailureTaxonomy; classification: string } {
  if (failureType === 'none') return { taxonomy: 'none', classification: 'passed' };
  if (failureType === 'artifact_download_failed' || failureType === 'release_asset_missing') {
    return { taxonomy: 'infrastructure', classification: failureType };
  }
  if (failureType === 'vm_launch_failed') {
    return { taxonomy: 'environment', classification: 'vm_environment_failure' };
  }
  if (failureType === 'vm_harness_preflight_failed' || failureType === 'opl_command_output_buffer_exhausted') {
    return { taxonomy: 'fixture', classification: failureType };
  }
  if (failureType === 'settings_smoke_failed') {
    const diagnostic = readSettingsReadinessDiagnostic(errorText);
    const renderedContentWithoutLegacyNavigation =
      diagnostic?.expectedHash === diagnostic?.hash &&
      diagnostic?.contentPresent === true &&
      diagnostic?.navPresent === false &&
      diagnostic?.loaderVisible === false &&
      diagnostic?.firstRunWindowVisible === false;
    if (renderedContentWithoutLegacyNavigation) {
      return { taxonomy: 'fixture', classification: 'verification_harness_contract_drift' };
    }
  }
  return { taxonomy: 'product', classification: `${failureType}_product_failure` };
}

function classifyFailure(): {
  type: FailureType;
  boundary: string;
  reason: string;
  tartSummary: JsonRecord | null;
  guestSummary: JsonRecord | null;
} {
  const smokeConclusion = env('VM_SMOKE_CONCLUSION') || 'unknown';
  const dmgConclusion = env('DMG_CONCLUSION') || 'unknown';
  const artifactDownloadOutcome = env('RELEASE_ARTIFACT_DOWNLOAD_OUTCOME') || 'skipped';
  const releaseArtifactRequested = Boolean(env('RELEASE_ARTIFACT_NAME'));
  const installMode = env('INSTALL_MODE') || 'dmg';
  const tartSummary = readJson(`${vmArtifactDir}/tart-smoke-summary.json`);
  const guestSummary =
    recordField(tartSummary, 'guest_summary') ||
    readJson(`${vmArtifactDir}/artifacts/smoke-summary.json`);
  const failureStage = stringField(tartSummary, 'failure_stage') || stringField(tartSummary, 'stage');
  const errorText = [
    stringField(tartSummary, 'error'),
    stringField(recordField(tartSummary, 'error_classification'), 'message'),
    stringField(guestSummary, 'error'),
    stringField(recordField(guestSummary, 'bootstrap_launch_diagnostics'), 'error'),
  ].join('\n');

  if (smokeConclusion === 'success') {
    return { type: 'none', boundary: 'passed', reason: 'VM smoke passed.', tartSummary, guestSummary };
  }
  if (releaseArtifactRequested && failed(artifactDownloadOutcome) && failed(dmgConclusion)) {
    return {
      type: 'artifact_download_failed',
      boundary: 'workflow_artifact_download',
      reason: `release_artifact_name was requested, download-artifact concluded ${artifactDownloadOutcome}, and DMG resolution did not recover.`,
      tartSummary,
      guestSummary,
    };
  }
  if (installMode !== 'homebrew-cask' && failed(dmgConclusion)) {
    return {
      type: 'release_asset_missing',
      boundary: 'resolve_release_dmg',
      reason: 'Resolve release DMG failed before the VM smoke could use an installer.',
      tartSummary,
      guestSummary,
    };
  }
  if (smokeConclusion === 'skipped') {
    return {
      type: 'vm_harness_preflight_failed',
      boundary: 'vm_harness_preflight',
      reason: 'VM smoke was skipped after an earlier harness step failed.',
      tartSummary,
      guestSummary,
    };
  }
  if (!tartSummary) {
    return {
      type: 'vm_launch_failed',
      boundary: 'tart_harness',
      reason: 'VM smoke failed before tart-smoke-summary.json was written.',
      tartSummary,
      guestSummary,
    };
  }
  if (['clone_vm', 'configure_display', 'start_vm', 'wait_for_ip', 'wait_for_ssh'].includes(failureStage)) {
    return {
      type: 'vm_launch_failed',
      boundary: failureStage,
      reason: `Tart VM failed during ${failureStage}.`,
      tartSummary,
      guestSummary,
    };
  }
  if (
    failureStage === 'run_guest_smoke' &&
    includesAny(errorText, ['opl system configure-codex', "'system' 'configure-codex'"])
  ) {
    return {
      type: 'opl_configure_codex_failed',
      boundary: 'guest_opl_configuration',
      reason: 'Guest OPL configure-codex failed before App readiness checks. Inspect the codex-configure diagnostics in the VM artifact.',
      tartSummary,
      guestSummary,
    };
  }
  if (
    failureStage === 'run_guest_smoke' &&
    includesAny(errorText, ['enobufs', 'output buffer', 'buffer_exhausted'])
  ) {
    return {
      type: 'opl_command_output_buffer_exhausted',
      boundary: 'guest_opl_command_output_buffer',
      reason: 'Guest App and OPL command execution reached the runtime evidence stage, but the frozen smoke harness exhausted its bounded command-output buffer. Reconcile the Stable session before deciding whether a newly frozen cohort is required.',
      tartSummary,
      guestSummary,
    };
  }
  if (
    failureStage === 'run_guest_smoke' &&
    includesAny(errorText, ['runtime status page did not become ready before refresh'])
  ) {
    return {
      type: 'settings_smoke_failed',
      boundary: 'runtime_return_ready_marker',
      reason: 'Guest App completed the Settings traversal, but the Runtime return-route ready marker did not pass before refresh.',
      tartSummary,
      guestSummary,
    };
  }
  if (
    failureStage === 'run_guest_smoke' &&
    includesAny(errorText, [
      'could not select opl built-in assistant',
      'selected opl built-in assistant',
      'could not create opl built-in assistant route receipt',
      'created conversation did not expose the opl assistant route receipt',
    ])
  ) {
    return {
      type: 'assistant_route_smoke_failed',
      boundary: 'guest_assistant_route_smoke',
      reason: 'Guest App launched, but a Home assistant shortcut route contract did not pass.',
      tartSummary,
      guestSummary,
    };
  }
  if (
    failureStage === 'run_guest_smoke' &&
    includesAny(errorText, [
      'advanced settings',
      'settings smoke',
      'settings did not expose',
      'settings page did not',
    ])
  ) {
    return {
      type: 'settings_smoke_failed',
      boundary: 'guest_settings_smoke',
      reason: 'Guest App launched, but a Settings page contract did not pass.',
      tartSummary,
      guestSummary,
    };
  }
  if (
    failureStage === 'run_guest_smoke' &&
    includesAny(errorText, ['ready', 'launch', 'bootstrap', 'guid page', 'runtime status page'])
  ) {
    return {
      type: 'app_ready_failed',
      boundary: 'guest_app_ready',
      reason: 'Guest smoke reached the App but readiness/bootstrap evidence did not pass.',
      tartSummary,
      guestSummary,
    };
  }
  return {
    type: 'vm_smoke_failed',
    boundary: failureStage || 'vm_smoke',
    reason: failureStage ? `VM smoke failed during ${failureStage}.` : 'VM smoke failed without a narrower stage.',
    tartSummary,
    guestSummary,
  };
}

function typedControllerAction(
  failureType: FailureType,
  qualification: { taxonomy: QualificationFailureTaxonomy; classification: string },
) {
  const profile = env('PACKAGE_PROFILE') || 'unknown';
  const newCohortRequired =
    qualification.taxonomy === 'product' ||
    qualification.classification === 'verification_harness_contract_drift';
  const action = failureType === 'none' ? 'none' : 'inspect_framework_checkpoint';
  return {
    action,
    scope: action === 'none' ? 'none' : 'framework_checkpoint_read_only',
    controller: action === 'none' ? null : 'app_release_bundle_cli',
    controller_subcommand: action === 'none' ? null : 'status',
    state_ref: action === 'none' ? null : 'framework_portable_checkpoint',
    command_template: action === 'none'
      ? ''
      : 'node --experimental-strip-types scripts/release-bundle-cli.ts status --bundle <sha256:bundle> --store <bundle-store> --json',
    execution_mode: 'read_only',
    execute_flag_included: false,
    mutation_authorized: false,
    direct_workflow_dispatch_allowed: false,
    rebuilds_standard_or_full_artifact: false,
    post_inspection_disposition: newCohortRequired
      ? 'freeze_new_bundle_if_framework_status_is_conclusive'
      : 'follow_framework_status_without_retry_or_redispatch',
    uses_existing_release_artifact: Boolean(
      !newCohortRequired &&
      (env('RELEASE_ARTIFACT_NAME') || env('RELEASE_DMG_URL_CONFIGURED') === 'true' || env('RELEASE_TAG'))
    ),
  };
}

function main(): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const summaryJsonPath = `${outputDir}/vm-gate-failure-summary.json`;
  const summaryMdPath = `${outputDir}/vm-gate-failure-summary.md`;
  const classification = classifyFailure();
  const qualification = qualificationFailure(classification.type, failureErrorText(classification));
  const controllerAction = typedControllerAction(classification.type, qualification);
  const releaseArtifactRunId =
    env('RELEASE_ARTIFACT_EFFECTIVE_RUN_ID') ||
    env('RELEASE_ARTIFACT_RUN_ID') ||
    env('GITHUB_RUN_ID');
  const expectedNextAction = controllerAction.action;

  const summary = {
    schema_version: 2,
    owner: 'one-person-lab-app',
    purpose: 'first_run_vm_gate_failure_critical_diagnostics',
    generated_at: new Date().toISOString(),
    workflow: {
      name: 'OPL GUI First-Run VM',
      job: 'clean-vm-first-run',
      run_id: env('GITHUB_RUN_ID'),
      run_attempt: env('GITHUB_RUN_ATTEMPT'),
      repository: env('GITHUB_REPOSITORY'),
      ref: env('GITHUB_REF'),
      sha: env('GITHUB_SHA'),
    },
    release_inputs: {
      package_profile: env('PACKAGE_PROFILE'),
      diagnostic_scope: env('DIAGNOSTIC_SCOPE'),
      release_tag: env('RELEASE_TAG'),
      release_dmg_url_configured: env('RELEASE_DMG_URL_CONFIGURED') === 'true',
      release_artifact_name: env('RELEASE_ARTIFACT_NAME'),
      release_artifact_run_id: releaseArtifactRunId,
      release_artifact_run_id_input: env('RELEASE_ARTIFACT_RUN_ID'),
      artifact_app_sha: env('ARTIFACT_APP_SHA'),
      product_shell_sha: env('PRODUCT_SHELL_SHA'),
      smoke_harness_app_sha: env('SMOKE_HARNESS_APP_SHA'),
      smoke_harness_shell_sha: env('SMOKE_HARNESS_SHELL_SHA'),
    },
    step_conclusions: {
      tart_source: env('TART_SOURCE_CONCLUSION') || 'unknown',
      package_profile: env('PACKAGE_PROFILE_CONCLUSION') || 'unknown',
      release_artifact_download: env('RELEASE_ARTIFACT_DOWNLOAD_OUTCOME') || 'skipped',
      resolve_release_dmg: env('DMG_CONCLUSION') || 'unknown',
      codex_package_preflight: env('CODEX_PACKAGE_PREFLIGHT_CONCLUSION') || 'skipped',
      vm_smoke: env('VM_SMOKE_CONCLUSION') || 'unknown',
    },
    failure: {
      type: classification.type,
      boundary: classification.boundary,
      reason: classification.reason,
      taxonomy: qualification.taxonomy,
      classification: qualification.classification,
      tart_failure_stage: stringField(classification.tartSummary, 'failure_stage'),
      tart_status: stringField(classification.tartSummary, 'status'),
      guest_status: stringField(classification.guestSummary, 'status'),
    },
    vm_gate: {
      step_name: 'Run clean VM first launch smoke',
      step_id: 'vm_smoke',
      step_conclusion: env('VM_SMOKE_CONCLUSION') || 'unknown',
      expected_next_action: expectedNextAction,
    },
    typed_controller_action: controllerAction,
    artifact_upload_failure_boundary: {
      critical_diagnostics_artifact_name: `opl-first-run-vm-critical-diagnostics-${env('PACKAGE_PROFILE') || 'unknown'}-${env('GITHUB_RUN_ID') || 'unknown'}`,
      critical_diagnostics_paths: [
        'vm-gate-failure-summary.json',
        'vm-gate-failure-summary.md',
      ],
      critical_diagnostics_if_no_files_found: 'error',
      critical_diagnostics_retention_days: 7,
      large_vm_artifact_name: `opl-first-run-vm-${env('PACKAGE_PROFILE') || 'unknown'}-${env('GITHUB_RUN_ID') || 'unknown'}`,
      large_vm_artifact_path: vmArtifactDir,
      large_vm_artifact_if_no_files_found: 'warn',
      truth_boundary: 'critical diagnostics are not release-ready evidence and do not replace the VM smoke artifact, release readiness summary, candidate record, or owner receipt',
    },
  };

  fs.writeFileSync(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(
    summaryMdPath,
    [
      '# First-run VM critical diagnostics',
      '',
      `- Run id: ${summary.workflow.run_id}`,
      `- Package profile: ${summary.release_inputs.package_profile}`,
      `- Diagnostic scope: ${summary.release_inputs.diagnostic_scope}`,
      `- Release tag: ${summary.release_inputs.release_tag}`,
      `- Release artifact name: ${summary.release_inputs.release_artifact_name}`,
      `- Release artifact run id: ${summary.release_inputs.release_artifact_run_id}`,
      `- Smoke step conclusion: ${summary.vm_gate.step_conclusion}`,
      `- Failure type: ${summary.failure.type}`,
      `- Failure boundary: ${summary.failure.boundary}`,
      `- Failure taxonomy: ${summary.failure.taxonomy}`,
      `- Failure classification: ${summary.failure.classification}`,
      `- Expected next action: ${summary.vm_gate.expected_next_action}`,
      `- Stable controller route: ${summary.typed_controller_action.command_template || 'none'}`,
      `- Mutation authorized: ${String(summary.typed_controller_action.mutation_authorized)}`,
      `- Artifact upload failure boundary: critical diagnostics use if-no-files-found=error; large VM artifacts use if-no-files-found=warn.`,
      `- Truth boundary: ${summary.artifact_upload_failure_boundary.truth_boundary}.`,
      '',
    ].join('\n')
  );
}

main();
