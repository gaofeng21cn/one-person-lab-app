import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  arrayOrEmpty as asArray,
  recordOrNull as asRecord,
  stringField,
} from '../release-json-helpers.ts';
import {
  buildCloseoutBottlenecks,
  buildCloseoutOptimizationRecommendations,
  fullPackageTuning,
} from './full-package-tuning.ts';
import { writeCloseoutMarkdown } from './markdown.ts';
import {
  commandMaxBuffer,
  downloadArtifacts,
  fetchArtifacts,
  fetchJobs,
  fetchRun,
  forbiddenLargeArtifactPatterns,
  readArtifactJson,
  readJsonByName,
} from './remote-fetch.ts';
import {
  artifactPresenceStatus,
  failedGateSummaries,
  parseDurationSeconds,
  secondsBetween,
  sourceStatus,
  summarizeAttestationVerification,
  summarizeFailedRerunTax,
  summarizeJobs,
  summarizeRunTiming,
} from './summary-timing.ts';
import { buildDecision, buildStableTerminalEvidence, monitorState } from './terminal-evidence.ts';
import type {
  CloseoutSummary,
  Decision,
  JsonRecord,
  MonitorSummary,
  NotificationPayload,
  Options,
  OutputGeneration,
} from './types.ts';

function fsyncDirectory(directoryPath: string): void {
  const descriptor = fs.openSync(directoryPath, 'r');
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function writeFileAtomic(filePath: string, bytes: string | Buffer): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(temporaryPath, filePath);
    fsyncDirectory(path.dirname(filePath));
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
    fs.rmSync(temporaryPath, { force: true });
  }
}

export function writeJson(filePath: string, payload: unknown): void {
  writeFileAtomic(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

export function buildSummary(options: Options, outputGeneration: OutputGeneration, appRoot: string): CloseoutSummary {
  const run = fetchRun(options, appRoot);
  const jobs = fetchJobs(options, run, appRoot);
  const artifacts = fetchArtifacts(options, appRoot);
  const artifactDownload = downloadArtifacts(options, artifacts, appRoot);

  const candidateArtifact = readArtifactJson(options, `release-candidate-record-${options.version}`, 'release-candidate-record.json');
  const readinessArtifact = readArtifactJson(options, `release-readiness-summary-${options.version}`, 'release-readiness-summary.json');
  const addonReadinessArtifact = readArtifactJson(options, `release-addon-readiness-summary-${options.version}`, 'release-addon-readiness-summary.json');
  const preflightArtifact = readArtifactJson(options, `release-preflight-summary-${options.version}`, 'release-preflight-summary.json');
  const remoteArtifact = readArtifactJson(options, `remote-release-verification-${options.version}`, 'remote-release-verification.json');
  const telemetryArtifact = readArtifactJson(options, `opl-full-workflow-telemetry-${options.version}`, 'full-workflow-telemetry.json');
  const diagnosticsArtifact = readArtifactJson(options, `opl-full-diagnostics-${options.version}`, 'runtime-cache-events.json');
  const attestationVerification = summarizeAttestationVerification(options, readArtifactJson, readJsonByName);
  const jobSummary = summarizeJobs(jobs);
  const timing = summarizeRunTiming(run, jobs);
  const agentWallTimeSeconds = options.agentWallTime
    ? parseDurationSeconds(options.agentWallTime)
    : secondsBetween(options.agentStartedAt, options.agentFinishedAt);
  const terminalEvidence = buildStableTerminalEvidence(options, run);
  const decision: Decision = buildDecision({
    options,
    run,
    candidate: candidateArtifact.payload,
    candidatePath: candidateArtifact.absolutePath,
    readiness: readinessArtifact.payload,
    remote: remoteArtifact.payload,
    preflight: preflightArtifact.payload,
    jobs: jobSummary,
    terminalEvidence,
  });
  const fullPackageProfile = fullPackageTuning(
    readinessArtifact.payload,
    telemetryArtifact.payload,
    diagnosticsArtifact.payload,
  );
  const failedRerunTax = summarizeFailedRerunTax(run, jobSummary, timing);
  const bottlenecks = buildCloseoutBottlenecks({
    readiness: readinessArtifact.payload,
    jobs: jobSummary,
    fullPackage: fullPackageProfile,
    failedRerunTax,
  });
  const optimizationRecommendations = buildCloseoutOptimizationRecommendations({
    readiness: readinessArtifact.payload,
    jobs: jobSummary,
    fullPackage: fullPackageProfile,
    failedRerunTax,
    bottlenecks,
  });

  return {
    schema: 'opl_release_closeout_summary.v1',
    version: options.version,
    generated_at: outputGeneration.generated_at,
    output_generation: outputGeneration,
    release_repo: options.repo,
    authority_boundary: {
      mode: 'diagnostics_only',
      mutation_authorized: false,
      terminal_or_published_authority: 'OPL Framework portable checkpoint and operation receipts only',
      candidate_preflight_remote_artifacts_can_authorize_terminal_state: false,
    },
    run: {
      id: options.runId || stringField(run, 'databaseId') || 'local',
      workflow_name: stringField(run, 'workflowName') ?? stringField(run, 'name'),
      display_title: stringField(run, 'displayTitle'),
      status: stringField(run, 'status'),
      conclusion: stringField(run, 'conclusion'),
      event: stringField(run, 'event'),
      head_branch: stringField(run, 'headBranch'),
      head_sha: stringField(run, 'headSha'),
      url: stringField(run, 'url'),
      timing,
    },
    clock_boundary: {
      github_actions_workflow_wall_time: 'release execution KPI from GitHub Actions run timestamps',
      agent_orchestration_wall_time: 'operator loop KPI including run waits, artifact readback, local verification, docs, commits, pushes, cleanup, and model/tool round trips',
      agent_orchestration_wall_time_seconds: agentWallTimeSeconds,
      rule: 'Do not compare Agent orchestration wall time directly to GitHub Actions workflow wall time.',
    },
    artifact_policy: {
      downloads_large_artifacts: false,
      artifact_profile: options.artifactProfile,
      forbidden_large_artifact_patterns: forbiddenLargeArtifactPatterns.map((pattern) => pattern.source),
      downloaded_artifacts: artifactDownload.downloaded,
      download_generation: {
        mode: artifactDownload.mode,
        generation_id: artifactDownload.generation_id,
        committed_path: artifactDownload.committed_path,
        previous_generation_path: artifactDownload.previous_generation_path,
      },
      local_artifacts_dir: options.artifactsDir,
      rule: 'Closeout reads final summaries and small diagnostics first; download standard or Full DMG artifacts only for a named release-asset investigation.',
    },
    source_status: {
      candidate_record: sourceStatus(candidateArtifact.payload),
      release_readiness_summary: sourceStatus(readinessArtifact.payload),
      release_addon_readiness_summary: artifactPresenceStatus(addonReadinessArtifact.payload),
      release_preflight_summary: sourceStatus(preflightArtifact.payload),
      remote_release_verification: sourceStatus(remoteArtifact.payload),
    },
    source_paths: {
      candidate_record: candidateArtifact.path,
      release_readiness_summary: readinessArtifact.path,
      release_addon_readiness_summary: addonReadinessArtifact.path,
      release_preflight_summary: preflightArtifact.path,
      remote_release_verification: remoteArtifact.path,
      artifact_attestation_verification: attestationVerification.source_path,
      full_workflow_telemetry: telemetryArtifact.path,
      runtime_cache_events: diagnosticsArtifact.path,
    },
    artifact_attestation_verification: attestationVerification,
    stable_terminal_evidence: terminalEvidence,
    candidate_record: candidateArtifact.payload ? {
      status: sourceStatus(candidateArtifact.payload),
      blocked_reasons: asArray(candidateArtifact.payload.blocked_reasons),
      required_gate_failures: asArray(candidateArtifact.payload.required_gate_failures),
      release_owner_verdict: asRecord(candidateArtifact.payload.release_owner_verdict),
      decision: asRecord(candidateArtifact.payload.decision),
    } : null,
    release_preflight_summary: preflightArtifact.payload,
    remote_release_verification: remoteArtifact.payload,
    readiness: readinessArtifact.payload ? {
      status: sourceStatus(readinessArtifact.payload),
      failed_required_gates: failedGateSummaries(readinessArtifact.payload),
      warnings: asArray(readinessArtifact.payload.warnings),
      bottlenecks: asArray(readinessArtifact.payload.bottlenecks),
      optimization_recommendations: asArray(readinessArtifact.payload.optimization_recommendations),
    } : null,
    addon_readiness: addonReadinessArtifact.payload ? {
      status: artifactPresenceStatus(addonReadinessArtifact.payload),
      require_addon_gates_for_stable_readiness: addonReadinessArtifact.payload.require_addon_gates_for_stable_readiness === true,
      job_results: asRecord(addonReadinessArtifact.payload.job_results),
    } : null,
    failed_rerun_tax: failedRerunTax,
    bottlenecks,
    optimization_recommendations: optimizationRecommendations,
    full_package_tuning: fullPackageProfile,
    jobs: jobSummary,
    decision,
    operator_loop_optimization: {
      implemented_by: 'historical closeout artifact inspection only; no package or workflow mutation entrypoint',
      workflow_default_release_summary: 'release-readiness-summary job uploads release-closeout-<version> after the candidate record is written',
      reduced_manual_steps: [
        'repeated gh run watch / gh run view polling',
        'manual small-artifact selection and download',
        'large artifact downloads before structured summaries identify a need',
        'manual reconstruction of release closeout Markdown from scattered logs',
      ],
      inspect_logs_only_after: [
        'candidate record is missing',
        'readiness summary is missing',
        'readiness failed_required_gates names a job without enough reason',
        'GitHub run conclusion is failed or cancelled and no structured summary exists',
      ],
    },
  };
}

function appendAttestationMarkdown(filePath: string, summary: CloseoutSummary): void {
  const attestation = summary.artifact_attestation_verification;
  const lines = [
    '',
    '### Artifact Attestation Verification',
    '',
    `- State: ${attestation.state}`,
    `- Role: ${attestation.role}`,
    `- Source: ${attestation.source_path ?? 'not provided'}`,
    `- Rule: ${attestation.rule}`,
    `- Does not replace: ${attestation.does_not_replace.join(', ')}`,
    '',
    '### Output Generation',
    '',
    `- Generation: ${summary.output_generation.id}`,
    `- Completion manifest: ${summary.output_generation.completion_manifest}`,
    '- Authority: diagnostics_only; this closeout never authorizes a release mutation.',
  ];
  if (attestation.verify_commands.length > 0) {
    lines.push('', 'Verify commands:');
    for (const command of attestation.verify_commands) lines.push(`- \`${command}\``);
  }
  fs.appendFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

export function buildMonitorSummary(summary: CloseoutSummary): MonitorSummary {
  const state = monitorState({
    run: summary.run,
    decision: summary.decision,
    jobs: summary.jobs,
    terminalEvidence: summary.stable_terminal_evidence,
  });
  const nextAction = stringField(summary.decision, 'next_action') ?? 'unknown';
  return {
    schema: 'opl_release_run_monitor.v1',
    version: summary.version,
    generated_at: summary.generated_at,
    output_generation: summary.output_generation,
    repo: summary.release_repo,
    run: {
      id: summary.run.id,
      status: summary.run.status,
      conclusion: summary.run.conclusion,
      url: summary.run.url,
      workflow_name: summary.run.workflow_name,
      head_branch: summary.run.head_branch,
      head_sha: summary.run.head_sha,
      workflow_wall_time_seconds: summary.run.timing.workflow_wall_time_seconds,
    },
    state,
    next_action: nextAction,
    recommended_next_action: {
      action: nextAction,
      reason: summary.decision.reason,
      command: summary.decision.command,
    },
    failed_gate_count: summary.readiness?.failed_required_gates.length ?? null,
    failed_job_count: summary.jobs.failed_jobs.length,
    source_status: summary.source_status,
    authority: 'diagnostics_only',
    mutation_authorized: false,
    promote_ready: false,
    published: summary.stable_terminal_evidence.published,
    terminal: summary.stable_terminal_evidence.standard_terminal,
    terminal_evidence_status: summary.stable_terminal_evidence.status,
    no_watch_instructions: [
      `gh run view ${summary.run.id} --repo ${summary.release_repo} --json status,conclusion,url,updatedAt`,
      `gh run download ${summary.run.id} --repo ${summary.release_repo} --name release-closeout-${summary.version} --dir artifacts/release-closeout/v${summary.version}-${summary.run.id}`,
      `jq '.state,.recommended_next_action' artifacts/release-closeout/v${summary.version}-${summary.run.id}/release-monitor.json`,
    ],
    artifact_policy: {
      downloads_large_artifacts: false,
      read_small_artifact: `release-closeout-${summary.version}/release-monitor.json`,
    },
  };
}

export function buildNotificationPayload(summary: CloseoutSummary, monitor: MonitorSummary): NotificationPayload {
  return {
    schema: 'opl_release_run_notification.v1',
    topic: 'opl_release_run_monitor',
    version: summary.version,
    output_generation: summary.output_generation,
    state: monitor.state,
    title: `OPL release v${summary.version}: ${monitor.state}`,
    body: `${monitor.next_action}: ${summary.decision.reason}`,
    next_action: monitor.recommended_next_action,
    run_url: summary.run.url,
    artifact: `release-closeout-${summary.version}`,
    machine_payload: 'release-monitor.json',
  };
}

export function buildOutputGeneration(options: Options, appRoot: string): OutputGeneration {
  return {
    schema: 'opl_release_closeout_output_generation.v1',
    id: `urn:uuid:${crypto.randomUUID()}`,
    generated_at: new Date().toISOString(),
    required_output_count: 4,
    completion_manifest: path.relative(appRoot, options.completionManifest),
  };
}

export function writeMarkdownAtomic(filePath: string, summary: CloseoutSummary, monitor: MonitorSummary): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const renderPath = `${filePath}.render-${process.pid}-${crypto.randomUUID()}`;
  try {
    writeCloseoutMarkdown(renderPath, summary, monitor);
    appendAttestationMarkdown(renderPath, summary);
    writeFileAtomic(filePath, fs.readFileSync(renderPath));
  } finally {
    fs.rmSync(renderPath, { force: true });
  }
}

function outputDescriptor(role: string, filePath: string, appRoot: string) {
  const bytes = fs.readFileSync(filePath);
  return {
    role,
    path: path.relative(appRoot, filePath),
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    size_bytes: bytes.byteLength,
  };
}

export function writeCompletionManifest(options: Options, generation: OutputGeneration, appRoot: string): void {
  const outputs = [
    outputDescriptor('closeout_summary', options.output, appRoot),
    outputDescriptor('closeout_markdown', options.markdown, appRoot),
    outputDescriptor('release_monitor', options.monitor, appRoot),
    outputDescriptor('release_notification', options.notification, appRoot),
  ];
  writeJson(options.completionManifest, {
    schema: 'opl_release_closeout_completion_manifest.v1',
    status: 'complete',
    generation,
    completed_at: new Date().toISOString(),
    required_output_count: 4,
    completed_output_count: outputs.length,
    outputs,
    authority: 'diagnostics_only',
    mutation_authorized: false,
    rule: 'Consumers must verify all four output digests and their shared generation id; a missing, stale, or mismatched manifest is incomplete diagnostics and never mutation authority.',
  });
}
