import { budgetStatus, percent } from './release-size-reporting.ts';
import {
  arrayField,
  numberField,
  objectField,
  recordOrNull,
  stringField,
} from './release-json-helpers.ts';

type GateFieldsSource = {
  fields?: Record<string, unknown> | null;
};

export function summarizeFullSizeBudget(remoteGate: GateFieldsSource) {
  const budget = objectField(remoteGate.fields ?? null, 'full_first_install_budget');
  if (!budget) return null;
  const fullDmgSizeBytes = numberField(budget, 'full_dmg_size_bytes');
  const warningFullDmgBytes = numberField(budget, 'warning_full_dmg_bytes') ?? 600000000;
  const explicitFullDmgSizeStatus = typeof budget.full_dmg_size_status === 'string'
    ? budget.full_dmg_size_status
    : null;
  const fullDmgSizeStatus = explicitFullDmgSizeStatus
    ?? (fullDmgSizeBytes !== null && warningFullDmgBytes !== null
      ? fullDmgSizeBytes >= warningFullDmgBytes
        ? 'warning'
        : 'passed'
      : null);
  return {
    ...budget,
    warning_full_dmg_bytes: warningFullDmgBytes,
    full_dmg_size_status: fullDmgSizeStatus,
  };
}

export function warningsFromFullSizeBudget(sizeBudget: Record<string, unknown> | null) {
  if (!sizeBudget) return [];
  const explicitWarnings = arrayField(sizeBudget, 'warnings')
    .filter((warning) => warning && typeof warning === 'object' && !Array.isArray(warning));
  if (explicitWarnings.length > 0) return explicitWarnings;
  if (sizeBudget.full_dmg_size_status !== 'warning') return [];
  return [{
    code: 'full_dmg_size_warning',
    message: `Full DMG size ${String(sizeBudget.full_dmg_size_bytes)} is above warning threshold ${String(sizeBudget.warning_full_dmg_bytes)}.`,
  }];
}

export function summarizeRuntimeCacheEvents(payload: Record<string, unknown> | null) {
  const events = arrayField(payload, 'events')
    .filter((event) => event && typeof event === 'object' && !Array.isArray(event)) as Record<string, unknown>[];
  const layerStatusCounts: Record<string, number> = {};
  const missWrittenLayers: string[] = [];
  const writtenLayers: string[] = [];
  for (const event of events) {
    const status = typeof event.status === 'string' ? event.status : 'unknown';
    const layerId = typeof event.layer_id === 'string' ? event.layer_id : 'unknown';
    layerStatusCounts[status] = (layerStatusCounts[status] ?? 0) + 1;
    if (status === 'miss_written') missWrittenLayers.push(layerId);
    if (event.write_archive === true) writtenLayers.push(layerId);
  }
  return {
    mode: typeof payload?.mode === 'string' ? payload.mode : null,
    dir: typeof payload?.dir === 'string' ? payload.dir : null,
    layer_status_counts: layerStatusCounts,
    miss_written_layers: missWrittenLayers,
    miss_written_count: missWrittenLayers.length,
    written_layers: writtenLayers,
    written_layer_count: writtenLayers.length,
  };
}

function fullSizeEntries(source: unknown, totalRuntimeBytes: number | null, limit = 8) {
  const record = recordOrNull(source);
  return Object.entries(record ?? {})
    .map(([id, value]) => {
      const entry = recordOrNull(value);
      const sizeBytes = numberField(entry, 'size_bytes');
      return {
        id,
        size_bytes: sizeBytes,
        runtime_percent: sizeBytes !== null && totalRuntimeBytes !== null ? percent(sizeBytes, totalRuntimeBytes) : null,
      };
    })
    .filter((entry) => entry.size_bytes !== null)
    .sort((left, right) => Number(right.size_bytes) - Number(left.size_bytes))
    .slice(0, limit)
    .map((entry, index) => ({ rank: index + 1, ...entry }));
}

export function buildManifestSizeAnalysis(
  manifest: Record<string, unknown> | null,
  sizeBudget: Record<string, unknown> | null,
) {
  if (!manifest) return null;
  const sizeBreakdown = objectField(manifest, 'size_breakdown');
  const budget = objectField(manifest, 'size_budget');
  const totalRuntimeBytes = numberField(sizeBreakdown, 'total_runtime_uncompressed_bytes');
  const maxRuntimeBytes = numberField(budget, 'max_runtime_uncompressed_bytes');
  const warningFullDmgBytes = numberField(sizeBudget, 'warning_full_dmg_bytes') ?? numberField(budget, 'warning_full_dmg_bytes');
  const maxFullDmgBytes = numberField(sizeBudget, 'max_full_dmg_bytes') ?? numberField(budget, 'max_full_dmg_bytes');
  const fullDmgSizeBytes = numberField(sizeBudget, 'full_dmg_size_bytes');
  const layers = fullSizeEntries(objectField(sizeBreakdown, 'layers'), totalRuntimeBytes);
  const components = fullSizeEntries(objectField(manifest, 'components'), totalRuntimeBytes);
  const candidates = [...layers.map((entry) => ({ kind: 'layer', reason: 'largest_runtime_layer', ...entry })), ...components.map((entry) => ({ kind: 'component', reason: 'largest_packaged_component', ...entry }))]
    .sort((left, right) => Number(right.size_bytes) - Number(left.size_bytes))
    .slice(0, 8)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  return {
    schema: 'opl_full_package_size_summary.v1',
    source: 'derived_from_full_package_manifest',
    budget: {
      compressed_full_dmg: {
        measurement_source: 'remote_release_verification_asset_size_bytes',
        full_dmg_size_bytes: fullDmgSizeBytes,
        warning_full_dmg_bytes: warningFullDmgBytes,
        max_full_dmg_bytes: maxFullDmgBytes,
        warning_status: budgetStatus(fullDmgSizeBytes, warningFullDmgBytes, 'warning_at_or_above'),
        review_threshold_status: budgetStatus(fullDmgSizeBytes, maxFullDmgBytes, 'review_above'),
        release_blocking: false,
      },
      runtime_uncompressed: {
        measurement_source: 'full-package-manifest.json#size_breakdown.total_runtime_uncompressed_bytes',
        total_runtime_uncompressed_bytes: totalRuntimeBytes,
        max_runtime_uncompressed_bytes: maxRuntimeBytes,
        status: budgetStatus(totalRuntimeBytes, maxRuntimeBytes, 'fail_above'),
        used_percent: totalRuntimeBytes !== null && maxRuntimeBytes !== null ? percent(totalRuntimeBytes, maxRuntimeBytes) : null,
        release_blocking: true,
      },
    },
    top_contributors: {
      layers,
      components,
      manifest_size_hotspots: [],
    },
    optimization_candidates: candidates,
  };
}

function durationBreakdownEntries(duration: Record<string, unknown> | null) {
  const breakdown = objectField(duration, 'full_package_build_breakdown');
  const totalSeconds = numberField(duration, 'full_package_build');
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
      source: 'full-workflow-telemetry.json#duration_seconds.full_package_build_breakdown',
      ...entry,
      full_package_build_percent: totalSeconds !== null ? percent(entry.duration_seconds, totalSeconds) : null,
      reason: index === 0 ? 'slowest_full_build_segment' : 'full_build_segment_time',
    }));
}

function sizeOptimizationCandidates(sizeAnalysis: Record<string, unknown> | null, limit = 8) {
  return arrayField(sizeAnalysis, 'optimization_candidates')
    .map((entry) => recordOrNull(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .slice(0, limit);
}

function fullDmgSizeBottleneck(
  sizeAnalysis: Record<string, unknown> | null,
  sizeBudget: Record<string, unknown> | null,
) {
  const budget = objectField(sizeAnalysis, 'budget');
  const compressedFullDmg = objectField(budget, 'compressed_full_dmg');
  const fullDmgSizeBytes = numberField(compressedFullDmg, 'full_dmg_size_bytes') ?? numberField(sizeBudget, 'full_dmg_size_bytes');
  const warningStatus = stringField(compressedFullDmg, 'warning_status')
    ?? stringField(sizeBudget, 'full_dmg_size_status');
  const reviewStatus = stringField(compressedFullDmg, 'review_threshold_status');
  if (fullDmgSizeBytes === null) return null;
  if (warningStatus !== 'warning' && reviewStatus !== 'above_review_threshold') return null;
  return {
    id: 'full_dmg_size',
    category: 'full_package_size',
    source: 'remote-release-verification.json#full_first_install_budget and full-package-size-summary.json',
    size_bytes: fullDmgSizeBytes,
    warning_status: warningStatus,
    review_threshold_status: reviewStatus,
    reason: reviewStatus === 'above_review_threshold'
      ? 'full_dmg_above_review_threshold'
      : 'full_dmg_above_warning_threshold',
    release_blocking: compressedFullDmg?.release_blocking === true,
  };
}

function runtimeCacheBottleneck(runtimeCache: Record<string, unknown> | null) {
  const missWrittenCount = numberField(runtimeCache, 'miss_written_count') ?? 0;
  if (missWrittenCount <= 0) return null;
  return {
    id: 'runtime_cache_miss_written',
    category: 'full_runtime_cache',
    source: 'runtime-cache-events.json',
    miss_written_count: missWrittenCount,
    miss_written_layers: arrayField(runtimeCache, 'miss_written_layers').map((entry) => String(entry)),
    reason: 'runtime_cache_layers_written_during_release_build',
  };
}

export function buildReadinessBottlenecks(inputs: {
  duration: Record<string, unknown> | null;
  runtimeCache: Record<string, unknown> | null;
  sizeBudget: Record<string, unknown> | null;
  sizeAnalysis: Record<string, unknown> | null;
}) {
  const durationEntries = durationBreakdownEntries(inputs.duration).slice(0, 8);
  const sizeBottleneck = fullDmgSizeBottleneck(inputs.sizeAnalysis, inputs.sizeBudget);
  const cacheBottleneck = runtimeCacheBottleneck(inputs.runtimeCache);
  return [
    ...durationEntries,
    ...(sizeBottleneck ? [sizeBottleneck] : []),
    ...(cacheBottleneck ? [cacheBottleneck] : []),
  ];
}

export function buildReadinessOptimizationRecommendations(inputs: {
  duration: Record<string, unknown> | null;
  runtimeCache: Record<string, unknown> | null;
  sizeAnalysis: Record<string, unknown> | null;
  bottlenecks: Record<string, unknown>[];
}) {
  const recommendations: Record<string, unknown>[] = [];
  const durationEntries = durationBreakdownEntries(inputs.duration);
  const topDuration = durationEntries[0];
  const dmgCompression = durationEntries.find((entry) => entry.id === 'dmg_package_compression');
  const candidates = sizeOptimizationCandidates(inputs.sizeAnalysis, 5);
  const sizeBottleneck = inputs.bottlenecks.find((entry) => entry.id === 'full_dmg_size');
  const cacheBottleneck = inputs.bottlenecks.find((entry) => entry.id === 'runtime_cache_miss_written');

  if (topDuration) {
    recommendations.push({
      id: 'profile_slowest_full_build_segment',
      category: 'full_build_time',
      source: topDuration.source,
      reason: `${topDuration.id} is the slowest measured Full build segment in this readiness input.`,
      target: topDuration,
    });
  }

  if (dmgCompression) {
    recommendations.push({
      id: 'reduce_dmg_package_compression_time',
      category: 'full_build_time',
      source: dmgCompression.source,
      reason: 'DMG compression has explicit Full build timing evidence and should stay visible in release profiling.',
      target: dmgCompression,
    });
  }

  if (sizeBottleneck && candidates.length > 0) {
    recommendations.push({
      id: 'review_full_size_optimization_candidates',
      category: 'full_package_size',
      source: 'full-package-size-summary.json#optimization_candidates',
      reason: 'Full DMG size crossed a recorded warning or review threshold; inspect the largest packaged contributors first.',
      targets: candidates,
    });
  }

  if (cacheBottleneck) {
    recommendations.push({
      id: 'seed_full_runtime_cache',
      category: 'full_runtime_cache',
      source: 'runtime-cache-events.json',
      reason: 'One or more Full runtime layers were written during this build instead of being cache hits.',
      target: cacheBottleneck,
    });
  }

  return recommendations;
}
