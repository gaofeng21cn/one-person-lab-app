#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';
import {
  FULL_RELEASE_OUTPUT_DIR,
  FULL_RUNTIME_CACHE_LAYER_IDS,
} from './full-first-install-package.ts';
import { budgetStatus, formatBytes, percent } from './release-size-reporting.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultManifestPath = path.join(appRoot, FULL_RELEASE_OUTPUT_DIR, 'full-package-manifest.json');
const ALL_DESCENDANTS = ['**/*', '**/.*', '**/.*/**/*'];

function parseArgs(argv: string[]) {
  const { values, tokens } = parseNodeArgs({
    args: argv,
    options: {
      manifest: { type: 'string' },
      'previous-manifest': { type: 'string' },
      'runtime-root': { type: 'string' },
      'full-dmg-size-bytes': { type: 'string' },
      'previous-full-dmg-size-bytes': { type: 'string' },
      top: { type: 'string' },
      markdown: { type: 'boolean' },
      json: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
    tokens: true,
  });
  const parsed = {
    manifestPath: defaultManifestPath,
    previousManifestPath: '',
    runtimeRoot: '',
    fullDmgSizeBytes: null as number | null,
    previousFullDmgSizeBytes: null as number | null,
    top: 12,
    markdown: false,
  };

  if (values.manifest !== undefined) parsed.manifestPath = path.resolve(values.manifest);
  if (values['previous-manifest'] !== undefined) parsed.previousManifestPath = path.resolve(values['previous-manifest']);
  if (values['runtime-root'] !== undefined) parsed.runtimeRoot = path.resolve(values['runtime-root']);
  if (values['full-dmg-size-bytes'] !== undefined) {
    if (!/^\d+$/.test(values['full-dmg-size-bytes'])) throw new Error('--full-dmg-size-bytes requires a non-negative integer.');
    parsed.fullDmgSizeBytes = Number(values['full-dmg-size-bytes']);
  }
  if (values['previous-full-dmg-size-bytes'] !== undefined) {
    if (!/^\d+$/.test(values['previous-full-dmg-size-bytes'])) {
      throw new Error('--previous-full-dmg-size-bytes requires a non-negative integer.');
    }
    parsed.previousFullDmgSizeBytes = Number(values['previous-full-dmg-size-bytes']);
  }
  if (values.top !== undefined) {
    if (!/^\d+$/.test(values.top)) throw new Error('--top requires a positive integer.');
    parsed.top = Number(values.top);
  }
  for (const token of tokens) {
    if (token.kind !== 'option') continue;
    if (token.name === 'markdown') parsed.markdown = true;
    if (token.name === 'json') parsed.markdown = false;
  }

  return parsed;
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sizeBytes(root: string): number {
  if (!root || !fs.existsSync(root)) return 0;
  const stat = fs.lstatSync(root);
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;
  return fs.globSync(ALL_DESCENDANTS, {
    cwd: root,
    withFileTypes: true,
    exclude: (entry) => entry.isSymbolicLink(),
  }).reduce((total, entry) => (
    entry.isFile() ? total + fs.lstatSync(path.join(entry.parentPath, entry.name)).size : total
  ), 0);
}

function compressedFullDmgStatus(args: {
  fullDmgWarningStatus: string;
  fullDmgReviewThresholdStatus: string;
  fullDmgHardLimitStatus: string;
}) {
  if (args.fullDmgHardLimitStatus === 'failed') return 'failed';
  if (args.fullDmgReviewThresholdStatus === 'above_review_threshold') return 'requires_review';
  if (args.fullDmgWarningStatus === 'warning') return 'warning';
  if (args.fullDmgWarningStatus === 'unavailable') return 'unavailable';
  return 'passed';
}

function componentEntries(manifest: Record<string, any>) {
  return Object.entries(manifest.components ?? {})
    .map(([id, component]) => ({
      id,
      size_bytes: Number.isFinite((component as any)?.size_bytes) ? (component as any).size_bytes : null,
      version: (component as any)?.version ?? null,
      git_commit: (component as any)?.git_commit ?? null,
      role: (component as any)?.role ?? null,
    }))
    .sort((left, right) => (right.size_bytes ?? -1) - (left.size_bytes ?? -1));
}

function layerEntries(manifest: Record<string, any>) {
  const layers = manifest.size_breakdown?.layers ?? {};
  const explicit = Object.entries(layers).map(([id, layer]) => ({
    id,
    size_bytes: Number.isFinite((layer as any)?.size_bytes) ? (layer as any).size_bytes : null,
  }));
  const missing = FULL_RUNTIME_CACHE_LAYER_IDS
    .filter((id) => !Object.prototype.hasOwnProperty.call(layers, id))
    .map((id) => ({ id, size_bytes: null }));
  return [...explicit, ...missing].sort((left, right) => (right.size_bytes ?? -1) - (left.size_bytes ?? -1));
}

function collectManifestSizeHotspots(manifest: Record<string, any>, top: number) {
  const layers = manifest.size_breakdown?.layers ?? {};
  const entries: Array<{ path: string; size_bytes: number }> = [];

  const visit = (prefix: string, node: any) => {
    const entryPath = prefix.replace(/^\/+/, '');
    if (Number.isFinite(node?.size_bytes) && entryPath) {
      entries.push({
        path: entryPath,
        size_bytes: node.size_bytes,
      });
    }
    const children = node?.children && typeof node.children === 'object' ? node.children : {};
    for (const [childId, child] of Object.entries(children)) {
      visit(entryPath ? `${entryPath}/${childId}` : childId, child);
    }
  };

  for (const [layerId, layer] of Object.entries(layers)) {
    visit(layerId, layer);
  }

  return entries
    .sort((left, right) => right.size_bytes - left.size_bytes)
    .slice(0, top);
}

function runtimeRootEntries(runtimeRoot: string, top: number) {
  if (!runtimeRoot || !fs.existsSync(runtimeRoot)) return [];
  return fs.readdirSync(runtimeRoot)
    .map((entry) => {
      const absolutePath = path.join(runtimeRoot, entry);
      return {
        path: entry,
        size_bytes: sizeBytes(absolutePath),
      };
    })
    .sort((left, right) => right.size_bytes - left.size_bytes)
    .slice(0, top);
}

function numericDelta(current: number | null, previous: number | null) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return null;
  }
  const deltaBytes = (current as number) - (previous as number);
  return {
    previous_bytes: previous,
    current_bytes: current,
    delta_bytes: deltaBytes,
    delta_percent: percent(deltaBytes, previous as number),
  };
}

function topEntryMap(entries: Array<{ id?: string; path?: string; size_bytes: number | null }>) {
  return new Map(entries
    .filter((entry) => entry.size_bytes !== null && (entry.id || entry.path))
    .map((entry) => [String(entry.id ?? entry.path), entry.size_bytes as number]));
}

function entryDeltas(
  current: Array<{ id?: string; path?: string; size_bytes: number | null }>,
  previous: Array<{ id?: string; path?: string; size_bytes: number | null }>,
  top: number,
) {
  const currentMap = topEntryMap(current);
  const previousMap = topEntryMap(previous);
  const ids = [...new Set([...currentMap.keys(), ...previousMap.keys()])].sort();
  return ids
    .map((id) => {
      const currentBytes = currentMap.get(id) ?? null;
      const previousBytes = previousMap.get(id) ?? null;
      const delta = numericDelta(currentBytes, previousBytes);
      return delta ? { id, ...delta } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => Math.abs(right.delta_bytes) - Math.abs(left.delta_bytes))
    .slice(0, top);
}

function ranked<T extends { size_bytes: number | null }>(entries: T[], totalBytes: number | null, top: number) {
  return entries
    .filter((entry) => Number.isFinite(entry.size_bytes))
    .slice(0, top)
    .map((entry, index) => ({
      rank: index + 1,
      ...entry,
      runtime_percent: Number.isFinite(entry.size_bytes) && Number.isFinite(totalBytes)
        ? percent(entry.size_bytes as number, totalBytes as number)
        : null,
    }));
}

function optimizationCandidates(args: {
  components: ReturnType<typeof componentEntries>;
  layers: ReturnType<typeof layerEntries>;
  hotspots: Array<{ path: string; size_bytes: number }>;
  totalRuntimeBytes: number | null;
  top: number;
}) {
  const candidates: Array<Record<string, unknown>> = [];
  for (const layer of ranked(args.layers, args.totalRuntimeBytes, Math.min(args.top, 5))) {
    candidates.push({
      kind: 'layer',
      id: layer.id,
      size_bytes: layer.size_bytes,
      runtime_percent: layer.runtime_percent,
      reason: 'largest_runtime_layer',
    });
  }
  for (const component of ranked(args.components, args.totalRuntimeBytes, Math.min(args.top, 5))) {
    candidates.push({
      kind: 'component',
      id: component.id,
      size_bytes: component.size_bytes,
      runtime_percent: component.runtime_percent,
      reason: 'largest_packaged_component',
    });
  }
  for (const hotspot of args.hotspots.slice(0, Math.min(args.top, 5))) {
    candidates.push({
      kind: 'manifest_path',
      id: hotspot.path,
      size_bytes: hotspot.size_bytes,
      runtime_percent: Number.isFinite(args.totalRuntimeBytes)
        ? percent(hotspot.size_bytes, args.totalRuntimeBytes as number)
        : null,
      reason: 'largest_manifest_hotspot',
    });
  }
  return candidates
    .sort((left, right) => Number(right.size_bytes ?? -1) - Number(left.size_bytes ?? -1))
    .slice(0, args.top)
    .map((candidate, index) => ({
      rank: index + 1,
      ...candidate,
    }));
}

function buildSummary(options: ReturnType<typeof parseArgs>) {
  if (!fs.existsSync(options.manifestPath)) {
    throw new Error(`Full package manifest not found: ${options.manifestPath}`);
  }
  const manifest = readJson(options.manifestPath);
  const previousManifest = options.previousManifestPath
    ? readJson(options.previousManifestPath)
    : null;
  const totalRuntimeBytes = manifest.size_breakdown?.total_runtime_uncompressed_bytes ?? null;
  const maxRuntimeBytes = manifest.size_budget?.max_runtime_uncompressed_bytes ?? null;
  const warningFullDmgBytes = manifest.size_budget?.warning_full_dmg_bytes ?? null;
  const maxFullDmgBytes = manifest.size_budget?.max_full_dmg_bytes ?? null;
  const hardFullDmgBytes = manifest.size_budget?.hard_full_dmg_bytes ?? null;
  const budgetPercent = Number.isFinite(totalRuntimeBytes) && Number.isFinite(maxRuntimeBytes)
    ? percent(totalRuntimeBytes, maxRuntimeBytes)
    : null;
  const components = componentEntries(manifest);
  const layers = layerEntries(manifest);
  const previousComponents = previousManifest ? componentEntries(previousManifest) : [];
  const previousLayers = previousManifest ? layerEntries(previousManifest) : [];
  const manifestSizeHotspots = collectManifestSizeHotspots(manifest, options.top);
  const previousManifestSizeHotspots = previousManifest
    ? collectManifestSizeHotspots(previousManifest, options.top)
    : [];
  const fullDmgWarningStatus = budgetStatus(options.fullDmgSizeBytes, warningFullDmgBytes, 'warning_at_or_above');
  const fullDmgReviewThresholdStatus = budgetStatus(options.fullDmgSizeBytes, maxFullDmgBytes, 'review_above');
  const fullDmgHardLimitStatus = budgetStatus(options.fullDmgSizeBytes, hardFullDmgBytes, 'fail_above');
  const compressedFullDmgBudgetStatus = compressedFullDmgStatus({
    fullDmgWarningStatus,
    fullDmgReviewThresholdStatus,
    fullDmgHardLimitStatus,
  });
  const runtimeUncompressedStatus = budgetStatus(totalRuntimeBytes, maxRuntimeBytes, 'fail_above');
  const topComponents = ranked(components, totalRuntimeBytes, options.top);
  const topLayers = ranked(layers, totalRuntimeBytes, options.top);

  return {
    schema: 'opl_full_package_size_summary.v1',
    manifest_path: options.manifestPath,
    manifest_version: manifest.manifest_version ?? null,
    version: manifest.version ?? null,
    package_kind: manifest.package_kind ?? null,
    opl_execution_environment_consumer: manifest.opl_execution_environment_consumer ?? null,
    opl_layer_taxonomy: manifest.size_breakdown?.opl_layer_taxonomy
      ?? manifest.opl_execution_environment_consumer?.layer_taxonomy
      ?? null,
    budget: {
      status: runtimeUncompressedStatus === 'failed' || compressedFullDmgBudgetStatus === 'failed'
        ? 'failed'
        : compressedFullDmgBudgetStatus === 'requires_review'
          ? 'requires_review'
          : 'passed',
      compressed_full_dmg: {
        measurement_source: options.fullDmgSizeBytes === null ? 'not_provided' : 'local_full_dmg_file_size_bytes',
        full_dmg_size_bytes: options.fullDmgSizeBytes,
        warning_full_dmg_bytes: warningFullDmgBytes,
        review_full_dmg_bytes: maxFullDmgBytes,
        max_full_dmg_bytes: maxFullDmgBytes,
        hard_full_dmg_bytes: hardFullDmgBytes,
        status: compressedFullDmgBudgetStatus,
        warning_status: fullDmgWarningStatus,
        review_threshold_status: fullDmgReviewThresholdStatus,
        hard_limit_status: fullDmgHardLimitStatus,
        review_required: fullDmgReviewThresholdStatus === 'above_review_threshold',
        release_blocking: fullDmgHardLimitStatus === 'failed',
      },
      runtime_uncompressed: {
        measurement_source: 'full-package-manifest.json#size_breakdown.total_runtime_uncompressed_bytes',
        total_runtime_uncompressed_bytes: totalRuntimeBytes,
        max_runtime_uncompressed_bytes: maxRuntimeBytes,
        status: runtimeUncompressedStatus,
        used_percent: budgetPercent,
        release_blocking: true,
      },
    },
    size_delta: {
      previous_manifest_path: options.previousManifestPath || null,
      compressed_full_dmg: numericDelta(options.fullDmgSizeBytes, options.previousFullDmgSizeBytes),
      runtime_uncompressed: numericDelta(
        totalRuntimeBytes,
        previousManifest?.size_breakdown?.total_runtime_uncompressed_bytes ?? null,
      ),
      layers: entryDeltas(layers, previousLayers, options.top),
      components: entryDeltas(components, previousComponents, options.top),
      manifest_size_hotspots: entryDeltas(
        manifestSizeHotspots.map((entry) => ({ path: entry.path, size_bytes: entry.size_bytes })),
        previousManifestSizeHotspots.map((entry) => ({ path: entry.path, size_bytes: entry.size_bytes })),
        options.top,
      ),
    },
    package_optimization: manifest.package_optimization ?? null,
    total_runtime_uncompressed_bytes: totalRuntimeBytes,
    full_dmg_size_bytes: options.fullDmgSizeBytes,
    warning_full_dmg_bytes: warningFullDmgBytes,
    review_full_dmg_bytes: maxFullDmgBytes,
    max_full_dmg_bytes: maxFullDmgBytes,
    hard_full_dmg_bytes: hardFullDmgBytes,
    max_runtime_uncompressed_bytes: maxRuntimeBytes,
    runtime_budget_used_percent: budgetPercent,
    components: components.map((component) => ({
      ...component,
      runtime_percent: Number.isFinite(component.size_bytes) && Number.isFinite(totalRuntimeBytes)
        ? percent(component.size_bytes as number, totalRuntimeBytes)
        : null,
    })),
    layers: layers.map((layer) => ({
      ...layer,
      runtime_percent: Number.isFinite(layer.size_bytes) && Number.isFinite(totalRuntimeBytes)
        ? percent(layer.size_bytes as number, totalRuntimeBytes)
        : null,
    })),
    top_contributors: {
      components: topComponents,
      layers: topLayers,
      manifest_size_hotspots: manifestSizeHotspots.map((entry, index) => ({
        rank: index + 1,
        ...entry,
        runtime_percent: Number.isFinite(totalRuntimeBytes)
          ? percent(entry.size_bytes, totalRuntimeBytes as number)
          : null,
      })),
    },
    optimization_candidates: optimizationCandidates({
      components,
      layers,
      hotspots: manifestSizeHotspots,
      totalRuntimeBytes,
      top: options.top,
    }),
    manifest_size_hotspots: manifestSizeHotspots,
    runtime_root: options.runtimeRoot || null,
    runtime_root_top_entries: runtimeRootEntries(options.runtimeRoot, options.top),
  };
}

function renderTable(headers: string[], rows: string[][]) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function renderMarkdown(summary: ReturnType<typeof buildSummary>, top: number) {
  const lines = [
    '## Full Package Size',
    '',
    `- Version: ${summary.version ?? 'unknown'}`,
    `- Manifest: ${summary.manifest_path}`,
    `- Full DMG size: ${formatBytes(summary.full_dmg_size_bytes)} (${summary.budget.compressed_full_dmg.warning_status})`,
    `- Runtime total: ${formatBytes(summary.total_runtime_uncompressed_bytes)}`,
    `- Full DMG warning threshold: ${formatBytes(summary.warning_full_dmg_bytes)}`,
    `- Full DMG review threshold: ${formatBytes(summary.max_full_dmg_bytes)}`,
    `- Full DMG hard limit: ${formatBytes(summary.hard_full_dmg_bytes)}`,
    `- Full DMG gate status: ${summary.budget.compressed_full_dmg.status}`,
    `- Runtime budget: ${formatBytes(summary.max_runtime_uncompressed_bytes)}${summary.runtime_budget_used_percent === null ? '' : ` (${summary.runtime_budget_used_percent}% used, ${summary.budget.runtime_uncompressed.status})`}`,
    summary.size_delta.compressed_full_dmg
      ? `- Full DMG delta: ${formatBytes(summary.size_delta.compressed_full_dmg.delta_bytes)} (${summary.size_delta.compressed_full_dmg.delta_percent}%)`
      : null,
    summary.size_delta.runtime_uncompressed
      ? `- Runtime delta: ${formatBytes(summary.size_delta.runtime_uncompressed.delta_bytes)} (${summary.size_delta.runtime_uncompressed.delta_percent}%)`
      : null,
    summary.opl_execution_environment_consumer
      ? `- OPL execution environment role: ${summary.opl_execution_environment_consumer.app_repo_role}`
      : null,
    '',
    '### Layers',
    '',
    renderTable(
      ['Layer', 'Size', 'Runtime %'],
      summary.layers.map((layer) => [
        layer.id,
        formatBytes(layer.size_bytes),
        layer.runtime_percent === null ? 'n/a' : `${layer.runtime_percent}%`,
      ]),
    ),
    '',
    '### Components',
    '',
    renderTable(
      ['Component', 'Size', 'Runtime %', 'Version / Commit'],
      summary.components.slice(0, top).map((component) => [
        component.id,
        formatBytes(component.size_bytes),
        component.runtime_percent === null ? 'n/a' : `${component.runtime_percent}%`,
        String(component.version ?? component.git_commit ?? ''),
      ]),
    ),
  ].filter((line) => line !== null);

  if (summary.opl_layer_taxonomy) {
    lines.push(
      '',
      '### OPL Runtime Bundle Layer Taxonomy',
      '',
      renderTable(
        ['Assembly layer', 'Canonical OPL layer ids'],
        Object.entries(summary.opl_layer_taxonomy.legacy_assembly_layer_mapping ?? {}).map(([layerId, canonicalIds]) => [
          layerId,
          Array.isArray(canonicalIds) ? canonicalIds.join(', ') : String(canonicalIds),
        ]),
      ),
    );
  }

  if (summary.package_optimization) {
    const trim = summary.package_optimization.app_bundle_trim ?? {};
    lines.push(
      '',
      '### Full Package Optimization',
      '',
      `- Offline first-install completeness preserved: ${summary.package_optimization.offline_first_install_completeness_preserved}`,
      `- Size review release-blocking by size alone: ${summary.package_optimization.size_review_release_blocking_by_size_alone}`,
      `- App bundle trim removed: ${formatBytes(trim.bytes_removed)} from ${String(trim.removed_count ?? 0)} path(s)`,
      `- Full runtime preserved: ${summary.package_optimization.package_boundary_audit?.contains_opl_full_runtime}`,
      `- Shell runtime preserved: ${summary.package_optimization.package_boundary_audit?.contains_shell_runtime}`,
    );
  }

  if (summary.manifest_size_hotspots.length > 0) {
    lines.push(
      '',
      '### Manifest Size Hotspots',
      '',
      renderTable(
        ['Path', 'Size'],
        summary.manifest_size_hotspots.map((entry) => [entry.path, formatBytes(entry.size_bytes)]),
      ),
    );
  }

  if (summary.runtime_root_top_entries.length > 0) {
    lines.push(
      '',
      '### Runtime Root Entries',
      '',
      renderTable(
        ['Path', 'Size'],
        summary.runtime_root_top_entries.map((entry) => [entry.path, formatBytes(entry.size_bytes)]),
      ),
    );
  }

  if (summary.optimization_candidates.length > 0) {
    lines.push(
      '',
      '### Optimization Candidates',
      '',
      renderTable(
        ['Rank', 'Kind', 'ID', 'Size', 'Runtime %', 'Reason'],
        summary.optimization_candidates.map((candidate) => [
          String(candidate.rank),
          String(candidate.kind),
          String(candidate.id),
          formatBytes(candidate.size_bytes as number),
          candidate.runtime_percent === null ? 'n/a' : `${String(candidate.runtime_percent)}%`,
          String(candidate.reason),
        ]),
      ),
    );
  }

  return lines.join('\n');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = buildSummary(options);
  if (options.markdown) {
    console.log(renderMarkdown(summary, options.top));
  } else {
    console.log(JSON.stringify(summary, null, 2));
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
