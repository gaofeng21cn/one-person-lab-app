import {
  arrayOrEmpty as asArray,
  numberField,
  recordOrNull as asRecord,
  stringField,
} from '../release-json-helpers.ts';

export type JsonRecord = Record<string, unknown>;

type JobSummary = {
  slowest_jobs: Array<{
    name: string;
    status: string | null;
    conclusion: string | null;
    started_at: string | null;
    completed_at: string | null;
    duration_seconds: number | null;
  }>;
  failed_jobs: unknown[];
};

type FailedRerunTax = {
  failed_rerun_tax_seconds: number;
  previous_failed_run_count: number;
  source: string;
};

export function fullPackageTuning(readiness: JsonRecord | null, telemetry: JsonRecord | null, diagnostics: JsonRecord | null) {
  const fullPackage = asRecord(readiness?.full_package);
  const duration = asRecord(fullPackage?.duration_seconds) ?? asRecord(telemetry?.duration_seconds);
  const cache = asRecord(fullPackage?.cache) ?? asRecord(telemetry?.cache);
  const runtimeCache = asRecord(fullPackage?.runtime_cache) ?? summarizeRuntimeCacheEvents(diagnostics);
  const sizeAnalysis = asRecord(fullPackage?.size_analysis);
  const sizeBudget = asRecord(fullPackage?.size_budget);
  const diagnosticEvents = asArray(diagnostics?.events);
  return {
    duration_seconds: duration,
    cache,
    runtime_cache: runtimeCache,
    size_budget: sizeBudget,
    size_analysis: sizeAnalysis,
    size_analysis_source: stringField(sizeAnalysis, 'source'),
    diagnostic_runtime_cache_event_count: diagnosticEvents.length,
  };
}

function summarizeRuntimeCacheEvents(payload: JsonRecord | null) {
  const events = asArray(payload?.events)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => entry !== null);
  if (events.length === 0) return null;
  const layerStatusCounts: Record<string, number> = {};
  const missWrittenLayers: string[] = [];
  const writtenLayers: string[] = [];
  for (const event of events) {
    const status = stringField(event, 'status') ?? 'unknown';
    const layerId = stringField(event, 'layer_id') ?? 'unknown';
    layerStatusCounts[status] = (layerStatusCounts[status] ?? 0) + 1;
    if (status === 'miss_written') missWrittenLayers.push(layerId);
    if (event.write_archive === true) writtenLayers.push(layerId);
  }
  return {
    mode: stringField(payload, 'mode'),
    dir: stringField(payload, 'dir'),
    layer_status_counts: layerStatusCounts,
    miss_written_layers: missWrittenLayers,
    miss_written_count: missWrittenLayers.length,
    written_layers: writtenLayers,
    written_layer_count: writtenLayers.length,
  };
}

function durationBreakdownEntries(duration: JsonRecord | null) {
  const breakdown = asRecord(duration?.full_package_build_breakdown);
  return Object.entries(breakdown ?? {})
    .map(([id, value]) => ({
      id,
      duration_seconds: typeof value === 'number' && Number.isFinite(value) ? value : null,
    }))
    .filter((entry): entry is { id: string; duration_seconds: number } => entry.duration_seconds !== null)
    .sort((left, right) => right.duration_seconds - left.duration_seconds)
    .map((entry, index) => ({
      rank: index + 1,
      category: 'full_build_segment',
      source: 'release-readiness-summary.json#full_package.duration_seconds.full_package_build_breakdown',
      ...entry,
      reason: index === 0 ? 'slowest_full_build_segment' : 'full_build_segment_time',
    }));
}

export function sizeOptimizationCandidates(sizeAnalysis: JsonRecord | null, limit = 8) {
  return asArray(sizeAnalysis?.optimization_candidates)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => entry !== null)
    .slice(0, limit);
}

function fullDmgSizeBottleneck(sizeAnalysis: JsonRecord | null, sizeBudget: JsonRecord | null) {
  const budget = asRecord(sizeAnalysis?.budget);
  const compressedFullDmg = asRecord(budget?.compressed_full_dmg);
  const fullDmgSizeBytes = numberField(compressedFullDmg, 'full_dmg_size_bytes')
    ?? numberField(sizeBudget, 'full_dmg_size_bytes');
  const warningStatus = stringField(compressedFullDmg, 'warning_status')
    ?? stringField(sizeBudget, 'full_dmg_size_status');
  const reviewStatus = stringField(compressedFullDmg, 'review_threshold_status');
  if (fullDmgSizeBytes === null) return null;
  if (warningStatus !== 'warning' && reviewStatus !== 'above_review_threshold') return null;
  return {
    id: 'full_dmg_size',
    category: 'full_package_size',
    source: 'release-readiness-summary.json#full_package.size_analysis',
    size_bytes: fullDmgSizeBytes,
    warning_status: warningStatus,
    review_threshold_status: reviewStatus,
    reason: reviewStatus === 'above_review_threshold'
      ? 'full_dmg_above_review_threshold'
      : 'full_dmg_above_warning_threshold',
    release_blocking: compressedFullDmg?.release_blocking === true,
  };
}

function runtimeCacheBottleneck(runtimeCache: JsonRecord | null) {
  const missWrittenCount = numberField(runtimeCache, 'miss_written_count') ?? 0;
  if (missWrittenCount <= 0) return null;
  return {
    id: 'runtime_cache_miss_written',
    category: 'full_runtime_cache',
    source: 'release-readiness-summary.json#full_package.runtime_cache or runtime-cache-events.json',
    miss_written_count: missWrittenCount,
    miss_written_layers: asArray(runtimeCache?.miss_written_layers).map((entry) => String(entry)),
    reason: 'runtime_cache_layers_written_during_release_build',
  };
}

export function buildCloseoutBottlenecks(inputs: {
  readiness: JsonRecord | null;
  jobs: JobSummary;
  fullPackage: ReturnType<typeof fullPackageTuning>;
  failedRerunTax: FailedRerunTax;
}) {
  const readinessBottlenecks = asArray(inputs.readiness?.bottlenecks)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => entry !== null);
  const derivedFullBottlenecks = readinessBottlenecks.length > 0
    ? []
    : [
        ...durationBreakdownEntries(asRecord(inputs.fullPackage.duration_seconds)).slice(0, 8),
        fullDmgSizeBottleneck(
          asRecord(inputs.fullPackage.size_analysis),
          asRecord(inputs.fullPackage.size_budget),
        ),
        runtimeCacheBottleneck(asRecord(inputs.fullPackage.runtime_cache)),
      ].filter((entry): entry is JsonRecord => entry !== null);
  const jobBottlenecks = inputs.jobs.slowest_jobs
    .filter((job) => job.duration_seconds !== null)
    .slice(0, 8)
    .map((job, index) => ({
      rank: index + 1,
      id: job.name,
      category: 'github_actions_job',
      source: 'github_actions_jobs',
      duration_seconds: job.duration_seconds,
      conclusion: job.conclusion,
      reason: index === 0 ? 'slowest_github_actions_job' : 'github_actions_job_time',
    }));
  const failedRerunBottleneck = inputs.failedRerunTax.failed_rerun_tax_seconds > 0
    ? [{
        id: 'failed_rerun_tax',
        category: 'operator_rerun_tax',
        source: inputs.failedRerunTax.source,
        duration_seconds: inputs.failedRerunTax.failed_rerun_tax_seconds,
        previous_failed_run_count: inputs.failedRerunTax.previous_failed_run_count,
        reason: 'failed_workflow_attempt_time_before_success_or_closeout',
      }]
    : [];
  return [
    ...failedRerunBottleneck,
    ...jobBottlenecks,
    ...readinessBottlenecks,
    ...derivedFullBottlenecks,
  ];
}

export function buildCloseoutOptimizationRecommendations(inputs: {
  readiness: JsonRecord | null;
  jobs: JobSummary;
  fullPackage: ReturnType<typeof fullPackageTuning>;
  failedRerunTax: FailedRerunTax;
  bottlenecks: JsonRecord[];
}) {
  const readinessRecommendations = asArray(inputs.readiness?.optimization_recommendations)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => entry !== null);
  const recommendations: JsonRecord[] = [...readinessRecommendations];
  const slowestJob = inputs.jobs.slowest_jobs.find((job) => job.duration_seconds !== null);
  const durationEntries = durationBreakdownEntries(asRecord(inputs.fullPackage.duration_seconds));
  const dmgCompression = durationEntries.find((entry) => entry.id === 'dmg_package_compression');
  const sizeBottleneck = inputs.bottlenecks.find((entry) => entry.id === 'full_dmg_size');
  const cacheBottleneck = inputs.bottlenecks.find((entry) => entry.id === 'runtime_cache_miss_written');

  if (slowestJob) {
    recommendations.push({
      id: 'profile_slowest_github_actions_job',
      category: 'github_actions_workflow_time',
      source: 'github_actions_jobs',
      reason: `${slowestJob.name} is the slowest measured GitHub Actions job in this closeout input.`,
      target: slowestJob,
    });
  }
  if (inputs.failedRerunTax.failed_rerun_tax_seconds > 0) {
    recommendations.push({
      id: 'reduce_failed_rerun_tax',
      category: 'operator_rerun_tax',
      source: inputs.failedRerunTax.source,
      reason: 'A failed workflow attempt consumed measurable wall time before successful closeout; prefer structured failed gate diagnostics before raw log spelunking.',
      target: inputs.failedRerunTax,
    });
  }
  if (dmgCompression && !readinessRecommendations.some((entry) => entry.id === 'reduce_dmg_package_compression_time')) {
    recommendations.push({
      id: 'reduce_dmg_package_compression_time',
      category: 'full_build_time',
      source: dmgCompression.source,
      reason: 'DMG compression has explicit Full build timing evidence and should stay visible in release profiling.',
      target: dmgCompression,
    });
  }
  if (sizeBottleneck && !readinessRecommendations.some((entry) => entry.id === 'review_full_size_optimization_candidates')) {
    recommendations.push({
      id: 'review_full_size_optimization_candidates',
      category: 'full_package_size',
      source: 'release-readiness-summary.json#full_package.size_analysis.optimization_candidates',
      reason: 'Full DMG size crossed a recorded warning or review threshold; inspect the largest packaged contributors first.',
      targets: sizeOptimizationCandidates(asRecord(inputs.fullPackage.size_analysis), 5),
    });
  }
  if (cacheBottleneck && !readinessRecommendations.some((entry) => entry.id === 'seed_full_runtime_cache')) {
    recommendations.push({
      id: 'seed_full_runtime_cache',
      category: 'full_runtime_cache',
      source: String(cacheBottleneck.source ?? 'runtime-cache-events.json'),
      reason: 'One or more Full runtime layers were written during this build instead of being cache hits.',
      target: cacheBottleneck,
    });
  }
  return recommendations;
}
