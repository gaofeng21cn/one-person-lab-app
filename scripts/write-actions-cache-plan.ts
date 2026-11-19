#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  FULL_RUNTIME_CACHE_LAYER_IDS,
  buildFullRuntimeAggregateCacheKeyInput,
  buildFullRuntimeCacheKey,
} from './full-first-install-package.ts';
import { validateSelectedPackageSetInput } from './build-full-first-install-package/runtime-cache-package-set.ts';

const PLAN_SCHEMA = 'opl_actions_cache_plan.v2';
const RECEIPT_SCHEMA = 'opl_actions_cache_receipt.v2';
const DEFAULT_WRITER_REF = 'refs/heads/main';
const RUNTIME_LAYER_IDS = FULL_RUNTIME_CACHE_LAYER_IDS;
const SAVE_OUTCOMES = ['success', 'failure', 'skipped'] as const;
const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const truthBoundary = 'Cache evidence is acceleration evidence only and cannot claim artifact identity or release readiness.';

type RuntimeLayerId = typeof RUNTIME_LAYER_IDS[number];
type SaveOutcome = typeof SAVE_OUTCOMES[number];
type JsonRecord = Record<string, any>;

export type ActionsCachePlanInput = {
  mode: 'cache_only_warmup' | 'full_package';
  workflow: string;
  ref: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  runnerOs: string;
  runnerArch: string;
  cacheCatalogSha256: string;
  runtimeKeyReport: JsonRecord;
};

export type ActionsCacheReceiptInput = {
  plan: JsonRecord;
  // Local layer reuse is independent of the GitHub cache transport outcome.
  runtimeEvents: JsonRecord;
  saveOutcomes: Record<RuntimeLayerId, SaveOutcome>;
};

function digestJson(value: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function fileSha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJson(filePath: string): JsonRecord {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonRecord;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireSha(value: string, label: string): string {
  const normalized = value.toLowerCase();
  if (!shaPattern.test(normalized)) {
    throw new Error(`${label} must be an exact 40-character Git SHA`);
  }
  return normalized;
}

function requireDuration(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
  return value;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function runtimeLayersFromReport(report: JsonRecord, runnerOs: string, runnerArch: string) {
  const layers = report.layers as JsonRecord | undefined;
  if (!layers) throw new Error('runtime key report must contain layers');
  const layerKeyInputs = report.layer_key_inputs as JsonRecord | undefined;
  if (!layerKeyInputs) throw new Error('runtime key report must contain layer_key_inputs');
  const expectedAggregate = buildFullRuntimeAggregateCacheKeyInput({
    layers: layers as Record<RuntimeLayerId, string>,
  });
  if (!sameJson(report.aggregate_key_input, expectedAggregate)) {
    throw new Error('runtime key report aggregate key input does not match canonical runtime layers');
  }
  return RUNTIME_LAYER_IDS.map((layerId) => {
    const runtimeKey = requireString(layers[layerId], `runtime key ${layerId}`);
    const keyInput = layerKeyInputs[layerId];
    if (!keyInput || typeof keyInput !== 'object' || Array.isArray(keyInput)) {
      throw new Error(`runtime key input ${layerId} must be an object`);
    }
    const expectedRuntimeKey = buildFullRuntimeCacheKey({ layerId, parts: keyInput });
    if (runtimeKey !== expectedRuntimeKey) {
      throw new Error(`runtime key ${layerId} does not match its structured key input`);
    }
    return {
      layer_id: layerId,
      runtime_key: runtimeKey,
      actions_key: `opl-full-runtime-layer-${runnerOs}-${runnerArch}-${runtimeKey}`,
      key_input_digest: digestJson(keyInput),
      restore_mode: 'exact_only',
    };
  });
}

export function buildActionsCachePlan(input: ActionsCachePlanInput): JsonRecord {
  if (!['cache_only_warmup', 'full_package'].includes(input.mode)) {
    throw new Error(`unsupported cache plan mode: ${input.mode}`);
  }
  const ref = requireString(input.ref, 'ref');
  if (input.mode === 'cache_only_warmup' && ref !== DEFAULT_WRITER_REF) {
    throw new Error(`cache-only warmup plans must use ${DEFAULT_WRITER_REF}`);
  }
  if (!/^[0-9a-f]{64}$/.test(input.cacheCatalogSha256)) {
    throw new Error('cacheCatalogSha256 must be a 64-character SHA-256 digest');
  }
  const runner = {
    os: requireString(input.runnerOs, 'runnerOs'),
    arch: requireString(input.runnerArch, 'runnerArch'),
  };
  const selectedPackageSet = input.runtimeKeyReport.selected_package_set as JsonRecord | undefined;
  if (!selectedPackageSet) {
    throw new Error('runtime key report must contain selected_package_set');
  }
  validateSelectedPackageSetInput(selectedPackageSet);
  const frameworkSha = requireSha(input.frameworkSha, 'frameworkSha');
  const payload = {
    schema: PLAN_SCHEMA,
    mode: input.mode,
    workflow: requireString(input.workflow, 'workflow'),
    ref,
    writer_eligible: ref === DEFAULT_WRITER_REF,
    cohort: {
      app_sha: requireSha(input.appSha, 'appSha'),
      shell_sha: requireSha(input.shellSha, 'shellSha'),
      framework_sha: frameworkSha,
    },
    runner,
    cache_catalog_sha256: input.cacheCatalogSha256,
    selected_package_set: selectedPackageSet,
    runtime_cache_aggregate_key_input: input.runtimeKeyReport.aggregate_key_input,
    runtime_layers: runtimeLayersFromReport(
      input.runtimeKeyReport,
      runner.os,
      runner.arch,
    ),
    truth_boundary: truthBoundary,
  };
  const plan = {
    ...payload,
    identity: digestJson(payload),
  };
  validateActionsCachePlan(plan);
  return plan;
}

export function validateActionsCachePlan(plan: JsonRecord): void {
  if (plan.schema !== PLAN_SCHEMA) throw new Error(`cache plan schema must be ${PLAN_SCHEMA}`);
  if (!digestPattern.test(String(plan.identity ?? ''))) throw new Error('cache plan identity must be sha256:<digest>');
  const { identity, ...payload } = plan;
  if (digestJson(payload) !== identity) throw new Error('cache plan identity does not match its payload');
  if (!['cache_only_warmup', 'full_package'].includes(plan.mode)) {
    throw new Error('cache plan mode is unsupported');
  }
  requireString(plan.workflow, 'cache plan workflow');
  const ref = requireString(plan.ref, 'cache plan ref');
  if (plan.writer_eligible !== (ref === DEFAULT_WRITER_REF)) {
    throw new Error('cache plan writer eligibility does not match its ref');
  }
  if (plan.mode === 'cache_only_warmup' && ref !== DEFAULT_WRITER_REF) {
    throw new Error(`cache-only warmup plans must use ${DEFAULT_WRITER_REF}`);
  }
  const runnerOs = requireString(plan.runner?.os, 'cache plan runner os');
  const runnerArch = requireString(plan.runner?.arch, 'cache plan runner arch');
  for (const [field, value] of Object.entries({
    app_sha: plan.cohort?.app_sha,
    shell_sha: plan.cohort?.shell_sha,
    framework_sha: plan.cohort?.framework_sha,
  })) {
    if (typeof value !== 'string' || !shaPattern.test(value)) {
      throw new Error(`cache plan cohort ${field} must be an exact Git SHA`);
    }
  }
  if (
    !plan.selected_package_set ||
    typeof plan.selected_package_set !== 'object' ||
    Array.isArray(plan.selected_package_set)
  ) {
    throw new Error('cache plan selected package set must be an object');
  }
  validateSelectedPackageSetInput(plan.selected_package_set as JsonRecord);
  if (!/^[0-9a-f]{64}$/.test(String(plan.cache_catalog_sha256 ?? ''))) {
    throw new Error('cache plan cache catalog digest is invalid');
  }
  const layers = Array.isArray(plan.runtime_layers) ? plan.runtime_layers as Array<JsonRecord> : [];
  const layerIds = layers.map((layer) => layer.layer_id);
  if (JSON.stringify(layerIds) !== JSON.stringify(RUNTIME_LAYER_IDS)) {
    throw new Error('cache plan runtime layers must use the canonical ordered layer set');
  }
  const expectedAggregate = buildFullRuntimeAggregateCacheKeyInput({
    layers: Object.fromEntries(
      layers.map((layer) => [layer.layer_id, layer.runtime_key]),
    ) as Record<RuntimeLayerId, string>,
  });
  if (!sameJson(plan.runtime_cache_aggregate_key_input, expectedAggregate)) {
    throw new Error('cache plan aggregate key input does not match its runtime layers');
  }
  for (const layer of layers) {
    const runtimeKeyPattern = new RegExp(`^full-runtime-v2-${layer.layer_id}-[0-9a-f]{24}$`);
    if (
      typeof layer.runtime_key !== 'string' || !runtimeKeyPattern.test(layer.runtime_key) ||
      layer.actions_key !== `opl-full-runtime-layer-${runnerOs}-${runnerArch}-${layer.runtime_key}` ||
      !digestPattern.test(String(layer.key_input_digest ?? '')) ||
      layer.restore_mode !== 'exact_only'
    ) {
      throw new Error(`cache plan runtime layer ${String(layer.layer_id)} is invalid`);
    }
  }
  if (plan.truth_boundary !== truthBoundary) {
    throw new Error('cache plan truth boundary is invalid');
  }
}

function assertSaveOutcome(
  layerId: RuntimeLayerId,
  outcome: unknown,
  writerEligible: boolean,
): asserts outcome is SaveOutcome {
  if (!SAVE_OUTCOMES.includes(outcome as SaveOutcome)) {
    throw new Error(`save outcome for ${layerId} must be success, failure, or skipped`);
  }
  if (!writerEligible && outcome !== 'skipped') {
    throw new Error(`save outcome for ${layerId} must be skipped when the plan is not writer eligible`);
  }
  // A local hit may need an upload when the remote cache missed or was rebuilt.
  // A local miss does not establish whether the remote save was attempted.
  // The caller records that transport result; the local event proves layer reuse.
}

function buildReceiptMetrics(
  runtimeLayerEvents: Array<JsonRecord>,
  saveOutcomes: Record<string, unknown>,
) {
  const hitCount = runtimeLayerEvents.filter((event) => event.status === 'hit').length;
  const missCount = runtimeLayerEvents.filter((event) => event.status === 'miss_written').length;
  const saveValues = Object.values(saveOutcomes);
  return {
    layer_count: runtimeLayerEvents.length,
    hit_count: hitCount,
    miss_count: missCount,
    hit_ratio: Number((hitCount / runtimeLayerEvents.length).toFixed(4)),
    total_duration_seconds: Number(runtimeLayerEvents
      .reduce((sum, event) => sum + Number(event.duration_seconds), 0)
      .toFixed(3)),
    save_attempt_count: saveValues.filter((outcome) => outcome === 'success' || outcome === 'failure').length,
    save_success_count: saveValues.filter((outcome) => outcome === 'success').length,
    save_failure_count: saveValues.filter((outcome) => outcome === 'failure').length,
    save_skipped_count: saveValues.filter((outcome) => outcome === 'skipped').length,
  };
}

export function buildActionsCacheReceipt(input: ActionsCacheReceiptInput): JsonRecord {
  validateActionsCachePlan(input.plan);
  const currentness = input.runtimeEvents.currentness as JsonRecord | undefined;
  if (
    !currentness ||
    currentness.schema !== 'opl_full_runtime_currentness_probe.v1' ||
    currentness.status !== 'passed'
  ) {
    throw new Error('runtime currentness must be a passed Full runtime currentness probe');
  }
  if (currentness.framework_commit !== input.plan.cohort.framework_sha) {
    throw new Error('runtime currentness Framework commit does not match the cache plan cohort');
  }
  const runtimePackageSet = input.runtimeEvents.selected_package_set as JsonRecord | undefined;
  if (!runtimePackageSet) throw new Error('runtime events must contain selected_package_set');
  validateSelectedPackageSetInput(runtimePackageSet);
  if (!sameJson(runtimePackageSet, input.plan.selected_package_set)) {
    throw new Error('runtime selected package set does not match the cache plan');
  }
  const events = Array.isArray(input.runtimeEvents.events) ? input.runtimeEvents.events : [];
  if (events.length !== RUNTIME_LAYER_IDS.length) {
    throw new Error('runtime events must contain exactly one event for each canonical cache layer');
  }
  const eventLayerIds = events.map((event: JsonRecord) => event.layer_id);
  if (
    new Set(eventLayerIds).size !== RUNTIME_LAYER_IDS.length ||
    eventLayerIds.some((layerId: unknown) => !RUNTIME_LAYER_IDS.includes(layerId as RuntimeLayerId))
  ) {
    throw new Error('runtime events contain a missing, duplicated, or unsupported cache layer');
  }
  const eventByLayer = new Map(events.map((event: JsonRecord) => [event.layer_id, event]));
  const planLayers = input.plan.runtime_layers as Array<JsonRecord>;
  const runtimeLayerEvents = planLayers.map((layer) => {
    const event = eventByLayer.get(layer.layer_id) as JsonRecord | undefined;
    if (
      !event ||
      event.key !== layer.runtime_key ||
      input.runtimeEvents.keys?.[layer.layer_id] !== layer.runtime_key
    ) {
      throw new Error(`runtime event for ${layer.layer_id} is missing or does not match the cache plan`);
    }
    const keyInput = input.runtimeEvents.key_inputs?.[layer.layer_id];
    if (!keyInput || digestJson(keyInput) !== layer.key_input_digest) {
      throw new Error(`runtime key input for ${layer.layer_id} does not match the cache plan`);
    }
    const validEventShape =
      (event.status === 'hit' && event.read_archive === true && event.write_archive === false) ||
      (event.status === 'miss_written' && event.read_archive === false && event.write_archive === true);
    if (!validEventShape) {
      throw new Error(`runtime event for ${layer.layer_id} has an invalid status or archive disposition`);
    }
    return {
      layer_id: layer.layer_id,
      runtime_key: layer.runtime_key,
      actions_key: layer.actions_key,
      key_input_digest: layer.key_input_digest,
      status: event.status,
      duration_seconds: requireDuration(event.duration_seconds, `runtime event duration for ${layer.layer_id}`),
      read_archive: event.read_archive === true,
      write_archive: event.write_archive === true,
    };
  });
  const saveOutcomes = Object.fromEntries(RUNTIME_LAYER_IDS.map((layerId) => {
    const outcome = input.saveOutcomes[layerId];
    assertSaveOutcome(layerId, outcome, input.plan.writer_eligible);
    return [layerId, outcome];
  })) as Record<RuntimeLayerId, SaveOutcome>;
  const payload = {
    schema: RECEIPT_SCHEMA,
    plan_identity: input.plan.identity,
    mode: input.plan.mode,
    writer_eligible: input.plan.writer_eligible,
    selected_package_set_identity: input.plan.selected_package_set.identity,
    runtime_currentness: currentness,
    runtime_layer_events: runtimeLayerEvents,
    save_outcomes: saveOutcomes,
    metrics: buildReceiptMetrics(runtimeLayerEvents, saveOutcomes),
    truth_boundary: truthBoundary,
  };
  const receipt = {
    ...payload,
    identity: digestJson(payload),
  };
  validateActionsCacheReceipt(receipt, input.plan);
  return receipt;
}

export function validateActionsCacheReceipt(receipt: JsonRecord, plan?: JsonRecord): void {
  if (receipt.schema !== RECEIPT_SCHEMA) {
    throw new Error(`cache receipt schema must be ${RECEIPT_SCHEMA}`);
  }
  if (!digestPattern.test(String(receipt.identity ?? ''))) {
    throw new Error('cache receipt identity must be sha256:<digest>');
  }
  const { identity, ...payload } = receipt;
  if (digestJson(payload) !== identity) {
    throw new Error('cache receipt identity does not match its payload');
  }
  if (!['cache_only_warmup', 'full_package'].includes(receipt.mode)) {
    throw new Error('cache receipt mode is unsupported');
  }
  if (typeof receipt.writer_eligible !== 'boolean') {
    throw new Error('cache receipt writer eligibility must be boolean');
  }
  if (!digestPattern.test(String(receipt.plan_identity ?? ''))) {
    throw new Error('cache receipt plan identity must be exact');
  }
  const currentness = receipt.runtime_currentness as JsonRecord | undefined;
  if (
    !currentness ||
    currentness.schema !== 'opl_full_runtime_currentness_probe.v1' ||
    currentness.status !== 'passed' ||
    !shaPattern.test(String(currentness.framework_commit ?? ''))
  ) {
    throw new Error('cache receipt runtime currentness is invalid');
  }
  const events = Array.isArray(receipt.runtime_layer_events)
    ? receipt.runtime_layer_events as JsonRecord[]
    : [];
  if (!sameJson(events.map((event) => event.layer_id), RUNTIME_LAYER_IDS)) {
    throw new Error('cache receipt runtime layers must use the canonical ordered layer set');
  }
  if (!sameJson(Object.keys(receipt.save_outcomes ?? {}), RUNTIME_LAYER_IDS)) {
    throw new Error('cache receipt save outcomes must use the canonical ordered layer set');
  }
  for (const event of events) {
    const layerId = event.layer_id as RuntimeLayerId;
    const runtimeKeyPattern = new RegExp(`^full-runtime-v2-${layerId}-[0-9a-f]{24}$`);
    const validEventShape =
      (event.status === 'hit' && event.read_archive === true && event.write_archive === false) ||
      (event.status === 'miss_written' && event.read_archive === false && event.write_archive === true);
    if (
      !runtimeKeyPattern.test(String(event.runtime_key ?? '')) ||
      !digestPattern.test(String(event.key_input_digest ?? '')) ||
      !validEventShape
    ) {
      throw new Error(`cache receipt runtime event ${layerId} is invalid`);
    }
    requireString(event.actions_key, `cache receipt actions key for ${layerId}`);
    requireDuration(event.duration_seconds, `cache receipt duration for ${layerId}`);
    assertSaveOutcome(layerId, receipt.save_outcomes?.[layerId], receipt.writer_eligible);
  }
  const expectedMetrics = buildReceiptMetrics(events, receipt.save_outcomes ?? {});
  if (!sameJson(receipt.metrics, expectedMetrics)) {
    throw new Error('cache receipt metrics do not match runtime events and save outcomes');
  }
  if (!digestPattern.test(String(receipt.selected_package_set_identity ?? ''))) {
    throw new Error('cache receipt selected package set identity is invalid');
  }
  if (receipt.truth_boundary !== truthBoundary) {
    throw new Error('cache receipt truth boundary is invalid');
  }
  if (plan) {
    validateActionsCachePlan(plan);
    if (
      receipt.plan_identity !== plan.identity ||
      receipt.mode !== plan.mode ||
      receipt.writer_eligible !== plan.writer_eligible ||
      receipt.selected_package_set_identity !== plan.selected_package_set.identity ||
      currentness.framework_commit !== plan.cohort.framework_sha
    ) {
      throw new Error('cache receipt does not match its cache plan');
    }
    for (const [index, event] of events.entries()) {
      const planLayer = plan.runtime_layers[index];
      if (
        event.runtime_key !== planLayer.runtime_key ||
        event.actions_key !== planLayer.actions_key ||
        event.key_input_digest !== planLayer.key_input_digest
      ) {
        throw new Error(`cache receipt runtime event ${event.layer_id} does not match its cache plan`);
      }
    }
  }
}

function parseSaveOutcomes(values: string[] | undefined): Record<RuntimeLayerId, SaveOutcome> {
  const outcomes: Partial<Record<RuntimeLayerId, SaveOutcome>> = {};
  for (const value of values ?? []) {
    const separator = value.indexOf('=');
    const layerId = value.slice(0, separator) as RuntimeLayerId;
    const outcome = value.slice(separator + 1);
    if (
      separator <= 0 ||
      !RUNTIME_LAYER_IDS.includes(layerId) ||
      !SAVE_OUTCOMES.includes(outcome as SaveOutcome) ||
      outcomes[layerId] !== undefined
    ) {
      throw new Error(`invalid --save-outcome value: ${value}`);
    }
    outcomes[layerId] = outcome as SaveOutcome;
  }
  const missing = RUNTIME_LAYER_IDS.filter((layerId) => outcomes[layerId] === undefined);
  if (missing.length > 0) {
    throw new Error(`missing --save-outcome values for: ${missing.join(', ')}`);
  }
  return outcomes as Record<RuntimeLayerId, SaveOutcome>;
}

function parseCommand(argv: string[]) {
  const [command, ...args] = argv;
  if (command !== 'plan' && command !== 'receipt') {
    throw new Error('usage: write-actions-cache-plan.ts <plan|receipt> [options]');
  }
  const { values } = parseArgs({
    args,
    options: {
      output: { type: 'string' },
      'cache-catalog': { type: 'string' },
      'runtime-key-report': { type: 'string' },
      'runtime-events': { type: 'string' },
      plan: { type: 'string' },
      mode: { type: 'string' },
      workflow: { type: 'string' },
      ref: { type: 'string' },
      'app-sha': { type: 'string' },
      'shell-sha': { type: 'string' },
      'framework-sha': { type: 'string' },
      'runner-os': { type: 'string' },
      'runner-arch': { type: 'string' },
      'save-outcome': { type: 'string', multiple: true },
    },
    allowPositionals: false,
  });
  return { command, values };
}

function requiredOption(value: string | undefined, name: string): string {
  if (!value) throw new Error(`missing required option --${name}`);
  return value;
}

function main(argv: string[]): void {
  const { command, values } = parseCommand(argv);
  const output = path.resolve(requiredOption(values.output, 'output'));
  if (command === 'plan') {
    const catalogPath = path.resolve(requiredOption(values['cache-catalog'], 'cache-catalog'));
    const runtimeKeyReportPath = path.resolve(requiredOption(values['runtime-key-report'], 'runtime-key-report'));
    const plan = buildActionsCachePlan({
      mode: requiredOption(values.mode, 'mode') as ActionsCachePlanInput['mode'],
      workflow: requiredOption(values.workflow, 'workflow'),
      ref: requiredOption(values.ref, 'ref'),
      appSha: requiredOption(values['app-sha'], 'app-sha'),
      shellSha: requiredOption(values['shell-sha'], 'shell-sha'),
      frameworkSha: requiredOption(values['framework-sha'], 'framework-sha'),
      runnerOs: requiredOption(values['runner-os'], 'runner-os'),
      runnerArch: requiredOption(values['runner-arch'], 'runner-arch'),
      cacheCatalogSha256: fileSha256(catalogPath),
      runtimeKeyReport: readJson(runtimeKeyReportPath),
    });
    writeJson(output, plan);
    return;
  }

  const receipt = buildActionsCacheReceipt({
    plan: readJson(path.resolve(requiredOption(values.plan, 'plan'))),
    runtimeEvents: readJson(path.resolve(requiredOption(values['runtime-events'], 'runtime-events'))),
    saveOutcomes: parseSaveOutcomes(values['save-outcome']),
  });
  writeJson(output, receipt);
}

const isEntrypoint = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isEntrypoint) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
