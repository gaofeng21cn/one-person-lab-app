import fs from 'node:fs';
import path from 'node:path';
import { sizeOptimizationCandidates, type JsonRecord } from './full-package-tuning.ts';
import {
  arrayOrEmpty as asArray,
  numberField,
  recordOrNull as asRecord,
  stringField,
} from '../release-json-helpers.ts';

type CloseoutSummary = JsonRecord;
type CloseoutMonitor = JsonRecord;

function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'n/a';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}h${minutes}m${rest}s`;
  if (minutes > 0) return `${minutes}m${rest}s`;
  return `${rest}s`;
}

export function writeCloseoutMarkdown(filePath: string, summary: CloseoutSummary, monitor: CloseoutMonitor) {
  const lines = [
    '## Release Closeout',
    '',
    `- Version: ${summary.version}`,
    `- Run: ${summary.run.id}`,
    `- Monitor state: ${monitor.state}`,
    `- Status: ${String(summary.run.status ?? 'unknown')}`,
    `- Conclusion: ${String(summary.run.conclusion ?? 'unknown')}`,
    `- Workflow wall time: ${formatDuration(summary.run.timing.workflow_wall_time_seconds)}`,
    `- Queue/admission: ${formatDuration(summary.run.timing.queue_or_admission_seconds)}`,
    `- Runner execution: ${formatDuration(summary.run.timing.runner_execution_seconds)}`,
    `- Agent orchestration wall time: ${formatDuration(summary.clock_boundary.agent_orchestration_wall_time_seconds)}`,
    '',
    'Clock boundary: GitHub Actions workflow wall time is the release execution KPI; Agent orchestration wall time includes waits, artifact readback, local verification, docs, commits, pushes, cleanup, and model/tool round trips.',
    '',
    `Next action: ${summary.decision.next_action}`,
    `Reason: ${summary.decision.reason}`,
    `Command: \`${summary.decision.command}\``,
    '',
    'No-watch monitor:',
    `- Artifact: release-closeout-${summary.version}/release-monitor.json`,
    `- Read: \`jq '.state,.recommended_next_action' release-monitor.json\``,
    '',
    '| Source | Status | Path |',
    '| --- | --- | --- |',
    `| candidate_record | ${summary.source_status.candidate_record} | ${summary.source_paths.candidate_record ?? ''} |`,
    `| release_readiness_summary | ${summary.source_status.release_readiness_summary} | ${summary.source_paths.release_readiness_summary ?? ''} |`,
    `| release_preflight_summary | ${summary.source_status.release_preflight_summary} | ${summary.source_paths.release_preflight_summary ?? ''} |`,
    `| remote_release_verification | ${summary.source_status.remote_release_verification} | ${summary.source_paths.remote_release_verification ?? ''} |`,
    '',
    '### Failed Gates',
    '',
  ];
  const failedGates = summary.readiness?.failed_required_gates ?? [];
  if (failedGates.length === 0) {
    lines.push('- none');
  } else {
    for (const gate of failedGates) {
      lines.push(`- ${gate.id}: ${gate.reason}`);
    }
  }
  const blockedReasons = summary.candidate_record?.blocked_reasons ?? [];
  if (blockedReasons.length > 0) {
    lines.push('', '### Candidate Blockers', '');
    for (const reason of blockedReasons) lines.push(`- ${String(reason)}`);
  }
  const postPublish = asRecord(summary.decision.post_publish);
  if (postPublish) {
    lines.push('', '### Post-Publish Follow-Up', '');
    lines.push('- Published release readback: true');
    lines.push('- Rule: Do not conflate published release/tap state with post-publish Homebrew VM proof completion.');
    for (const job of asArray(postPublish.failed_followup_jobs).map((entry) => asRecord(entry)).filter((entry): entry is JsonRecord => entry !== null)) {
      lines.push(`- ${stringField(job, 'name') ?? 'unknown'}: ${stringField(job, 'conclusion') ?? stringField(job, 'status') ?? 'unknown'}`);
    }
  }
  lines.push('', '### Slowest Jobs', '', '| Job | Conclusion | Duration |', '| --- | --- | ---: |');
  for (const job of summary.jobs.slowest_jobs.slice(0, 8)) {
    lines.push(`| ${job.name} | ${job.conclusion ?? job.status ?? ''} | ${formatDuration(job.duration_seconds)} |`);
  }
  lines.push(
    '',
    '### Failed Rerun Tax',
    '',
    `- Failed rerun tax: ${formatDuration(summary.failed_rerun_tax.failed_rerun_tax_seconds)}`,
    `- Previous failed runs: ${String(summary.failed_rerun_tax.previous_failed_run_count)}`,
    `- Source: ${summary.failed_rerun_tax.source}`,
  );
  const bottlenecks = summary.bottlenecks as JsonRecord[];
  if (bottlenecks.length > 0) {
    lines.push(
      '',
      '### Bottlenecks',
      '',
      '| Bottleneck | Category | Evidence | Signal | Reason |',
      '| --- | --- | --- | --- | --- |',
    );
    for (const bottleneck of bottlenecks.slice(0, 16)) {
      const signal = [
        numberField(bottleneck, 'duration_seconds') !== null ? formatDuration(numberField(bottleneck, 'duration_seconds')) : '',
        numberField(bottleneck, 'size_bytes') !== null ? `${String(numberField(bottleneck, 'size_bytes'))} bytes` : '',
        numberField(bottleneck, 'miss_written_count') !== null ? `${String(numberField(bottleneck, 'miss_written_count'))} cache writes` : '',
      ].find((value) => value !== '') ?? '';
      lines.push(`| ${stringField(bottleneck, 'id') ?? ''} | ${stringField(bottleneck, 'category') ?? ''} | ${stringField(bottleneck, 'source') ?? ''} | ${signal} | ${stringField(bottleneck, 'reason') ?? ''} |`);
    }
  }
  const recommendations = summary.optimization_recommendations as JsonRecord[];
  if (recommendations.length > 0) {
    lines.push(
      '',
      '### Optimization Recommendations',
      '',
      '| Recommendation | Category | Evidence | Reason |',
      '| --- | --- | --- | --- |',
    );
    for (const recommendation of recommendations.slice(0, 16)) {
      lines.push(`| ${stringField(recommendation, 'id') ?? ''} | ${stringField(recommendation, 'category') ?? ''} | ${stringField(recommendation, 'source') ?? ''} | ${stringField(recommendation, 'reason') ?? ''} |`);
    }
  }
  const fullDuration = summary.full_package_tuning.duration_seconds as JsonRecord | null;
  const breakdown = asRecord(fullDuration?.full_package_build_breakdown);
  if (breakdown) {
    lines.push('', '### Full Package Timing', '', '| Segment | Seconds |', '| --- | ---: |');
    for (const [key, value] of Object.entries(breakdown)) {
      lines.push(`| ${key} | ${String(value)} |`);
    }
  }
  const sizeAnalysis = asRecord(summary.full_package_tuning.size_analysis);
  const optimizationCandidates = sizeOptimizationCandidates(sizeAnalysis, 8);
  if (optimizationCandidates.length > 0) {
    lines.push(
      '',
      '### Full Size Optimization Candidates',
      '',
      '| Candidate | Kind | Size bytes | Reason |',
      '| --- | --- | ---: | --- |',
    );
    for (const candidate of optimizationCandidates) {
      lines.push(`| ${stringField(candidate, 'id') ?? ''} | ${stringField(candidate, 'kind') ?? ''} | ${String(numberField(candidate, 'size_bytes') ?? 'n/a')} | ${stringField(candidate, 'reason') ?? ''} |`);
    }
  }
  const runtimeCache = asRecord(summary.full_package_tuning.runtime_cache);
  const missWrittenLayers = asArray(runtimeCache?.miss_written_layers).map((entry) => String(entry));
  if (missWrittenLayers.length > 0) {
    lines.push('', `- Runtime cache miss_written layers: ${missWrittenLayers.join(', ')}`);
  }
  lines.push(
    '',
    'Artifact policy: closeout reads final summaries and small diagnostics first; it does not download standard or Full DMG artifacts.',
    '',
  );
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}
