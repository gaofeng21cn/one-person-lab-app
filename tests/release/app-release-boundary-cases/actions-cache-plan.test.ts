import crypto from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { appRoot, assert, fs, path, test } from './helpers.ts';
import {
  FULL_RUNTIME_CACHE_LAYER_IDS,
  buildFullRuntimeAggregateCacheKeyInput,
  buildFullRuntimeCacheKey,
} from '../../../scripts/full-first-install-package.ts';
import {
  buildSelectedPackageSetInput,
} from '../../../scripts/build-full-first-install-package/runtime-cache-package-set.ts';
import {
  buildActionsCachePlan,
  buildActionsCacheReceipt,
  validateActionsCachePlan,
  validateActionsCacheReceipt,
} from '../../../scripts/write-actions-cache-plan.ts';

function digestJson(value: unknown) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function resign(value: Record<string, any>) {
  const { identity: _identity, ...payload } = value;
  value.identity = digestJson(payload);
  return value;
}

function testFrameworkPackageSet(frameworkSha: string) {
  void frameworkSha;
  const packageIds = ['custom-agent', 'custom-capability'];
  return buildSelectedPackageSetInput({
    packageProfile: {
      profile_id: 'custom',
      package_ids: ['custom-agent'],
      dependency_closure: packageIds,
    },
    packages: packageIds.map((packageId, index) => ({
      package_id: packageId,
      source_commit: ((index + 1).toString(16)).repeat(40),
      source_fingerprint: `sha256:${((index + 3).toString(16)).repeat(64)}`,
      runtime_module_relative_path: `modules/${packageId}`,
    })),
  });
}

function testRuntimeReport(frameworkSha: string) {
  const layerKeyInputs = Object.fromEntries(FULL_RUNTIME_CACHE_LAYER_IDS.map((layerId, index) => [
    layerId,
    {
      schema: 'opl_full_runtime_layer_key_input.test.v1',
      layer_id: layerId,
      source_digest: `sha256:${((index + 1).toString(16)).repeat(64)}`,
    },
  ]));
  const layers = Object.fromEntries(FULL_RUNTIME_CACHE_LAYER_IDS.map((layerId) => [
    layerId,
    buildFullRuntimeCacheKey({ layerId, parts: layerKeyInputs[layerId] }),
  ]));
  return {
    selected_package_set: testFrameworkPackageSet(frameworkSha),
    layer_key_inputs: layerKeyInputs,
    layers,
    aggregate_key_input: buildFullRuntimeAggregateCacheKeyInput({ layers: layers as never }),
  };
}

function testPlan(input: {
  mode?: 'cache_only_warmup' | 'full_package';
  ref?: string;
  frameworkSha?: string;
} = {}) {
  const frameworkSha = input.frameworkSha ?? '3'.repeat(40);
  return buildActionsCachePlan({
    mode: input.mode ?? 'full_package',
    workflow: 'full-first-install-release.yml',
    ref: input.ref ?? 'refs/heads/main',
    appSha: '1'.repeat(40),
    shellSha: '2'.repeat(40),
    frameworkSha,
    runnerOs: 'macOS',
    runnerArch: 'ARM64',
    cacheCatalogSha256: '4'.repeat(64),
    runtimeKeyReport: testRuntimeReport(frameworkSha),
  });
}

function testRuntimeEvents(plan: Record<string, any>) {
  const report = testRuntimeReport(plan.cohort.framework_sha);
  return {
    keys: report.layers,
    key_inputs: report.layer_key_inputs,
    selected_package_set: report.selected_package_set,
    currentness: {
      schema: 'opl_full_runtime_currentness_probe.v1',
      status: 'passed',
      framework_commit: plan.cohort.framework_sha,
    },
    events: FULL_RUNTIME_CACHE_LAYER_IDS.map((layerId, index) => ({
      layer_id: layerId,
      key: report.layers[layerId],
      status: index === 0 ? 'hit' : 'miss_written',
      duration_seconds: index + 0.25,
      read_archive: index === 0,
      write_archive: index !== 0,
    })),
  };
}

test('Actions cache plan binds exact cohort, selected packages, and structured runtime keys', () => {
  const frameworkSha = 'c'.repeat(40);
  const report = testRuntimeReport(frameworkSha);
  const plan = buildActionsCachePlan({
    mode: 'cache_only_warmup',
    workflow: 'full-first-install-release.yml',
    ref: 'refs/heads/main',
    appSha: 'a'.repeat(40),
    shellSha: 'b'.repeat(40),
    frameworkSha,
    runnerOs: 'macOS',
    runnerArch: 'ARM64',
    cacheCatalogSha256: 'd'.repeat(64),
    runtimeKeyReport: report,
  });

  validateActionsCachePlan(plan);
  assert.equal(plan.schema, 'opl_actions_cache_plan.v2');
  assert.equal(plan.writer_eligible, true);
  assert.deepEqual(plan.selected_package_set.package_ids, ['custom-agent']);
  assert.deepEqual(
    plan.selected_package_set.dependency_closure,
    ['custom-agent', 'custom-capability'],
  );
  assert.deepEqual(plan.runner, { os: 'macOS', arch: 'ARM64' });
  assert.equal(plan.runtime_layers.length, 4);
  assert.equal(
    plan.runtime_layers[0].actions_key,
    `opl-full-runtime-layer-macOS-ARM64-${report.layers.toolchain}`,
  );
  assert.match(plan.runtime_layers[0].key_input_digest, /^sha256:[0-9a-f]{64}$/);
  assert.match(plan.identity, /^sha256:[0-9a-f]{64}$/);
});

test('Actions cache receipt requires current evidence and records reuse metrics', () => {
  const plan = testPlan();
  const events = testRuntimeEvents(plan);
  const receipt = buildActionsCacheReceipt({
    plan,
    runtimeEvents: events,
    saveOutcomes: {
      toolchain: 'skipped',
      'domain-runtime': 'failure',
      'opl-runtime': 'success',
      skills: 'success',
    },
  });

  validateActionsCacheReceipt(receipt, plan);
  assert.equal(receipt.schema, 'opl_actions_cache_receipt.v2');
  assert.equal(receipt.plan_identity, plan.identity);
  assert.equal(receipt.runtime_layer_events.length, 4);
  assert.deepEqual(receipt.metrics, {
    layer_count: 4,
    hit_count: 1,
    miss_count: 3,
    hit_ratio: 0.25,
    total_duration_seconds: 7,
    save_attempt_count: 3,
    save_success_count: 2,
    save_failure_count: 1,
    save_skipped_count: 1,
  });
  assert.match(receipt.identity, /^sha256:[0-9a-f]{64}$/);

  const driftedEvents = structuredClone(events);
  driftedEvents.events[0].key = 'full-runtime-v2-toolchain-drifted';
  assert.throws(
    () => buildActionsCacheReceipt({
      plan,
      runtimeEvents: driftedEvents,
      saveOutcomes: {
        toolchain: 'skipped',
        'domain-runtime': 'success',
        'opl-runtime': 'success',
        skills: 'success',
      },
    }),
    /does not match the cache plan/,
  );

  const staleEvents = structuredClone(events);
  staleEvents.currentness.status = 'failed';
  assert.throws(
    () => buildActionsCacheReceipt({
      plan,
      runtimeEvents: staleEvents,
      saveOutcomes: {
        toolchain: 'skipped',
        'domain-runtime': 'success',
        'opl-runtime': 'success',
        skills: 'success',
      },
    }),
    /runtime currentness must be a passed/,
  );

  const keyInputDrift = structuredClone(events);
  keyInputDrift.key_inputs.skills.source_digest = `sha256:${'e'.repeat(64)}`;
  assert.throws(
    () => buildActionsCacheReceipt({
      plan,
      runtimeEvents: keyInputDrift,
      saveOutcomes: {
        toolchain: 'skipped',
        'domain-runtime': 'success',
        'opl-runtime': 'success',
        skills: 'success',
      },
    }),
    /runtime key input for skills/,
  );

  const invalidDuration = structuredClone(events);
  invalidDuration.events[1].duration_seconds = -1;
  assert.throws(
    () => buildActionsCacheReceipt({
      plan,
      runtimeEvents: invalidDuration,
      saveOutcomes: {
        toolchain: 'skipped',
        'domain-runtime': 'success',
        'opl-runtime': 'success',
        skills: 'success',
      },
    }),
    /finite non-negative number/,
  );

  const tamperedReceipt = structuredClone(receipt);
  tamperedReceipt.metrics.hit_count = 4;
  resign(tamperedReceipt);
  assert.throws(
    () => validateActionsCacheReceipt(tamperedReceipt, plan),
    /metrics do not match/,
  );
});

test('Actions cache plan rejects writer, aggregate, and package identity drift', () => {
  assert.throws(
    () => testPlan({
      mode: 'cache_only_warmup',
      ref: 'refs/heads/feature/cache-test',
      frameworkSha: '7'.repeat(40),
    }),
    /cache-only warmup plans must use refs\/heads\/main/,
  );

  const plan = testPlan({
    ref: 'refs/heads/feature/cache-test',
    frameworkSha: '7'.repeat(40),
  });
  assert.equal(plan.writer_eligible, false);

  const drifted = structuredClone(plan);
  drifted.writer_eligible = true;
  resign(drifted);
  assert.throws(() => validateActionsCachePlan(drifted), /writer eligibility/);

  const aggregateDrifted = structuredClone(plan);
  aggregateDrifted.runtime_cache_aggregate_key_input.layers.skills =
    aggregateDrifted.runtime_layers[0].runtime_key;
  resign(aggregateDrifted);
  assert.throws(() => validateActionsCachePlan(aggregateDrifted), /aggregate key input/);

  const packageDrifted = structuredClone(plan);
  packageDrifted.selected_package_set.packages[0].source_commit = 'e'.repeat(40);
  resign(packageDrifted);
  assert.throws(() => validateActionsCachePlan(packageDrifted), /package set identity|owner source/);

  const runnerDrifted = structuredClone(plan);
  runnerDrifted.runner.arch = 'X64';
  resign(runnerDrifted);
  assert.throws(() => validateActionsCachePlan(runnerDrifted), /runtime layer toolchain is invalid/);
});

test('Full cache-only workflow freezes exact refs and cannot emit release assets', () => {
  const fullPath = path.join(appRoot, '.github', 'workflows', 'full-first-install-release.yml');
  const warmupPath = path.join(appRoot, '.github', 'workflows', 'full-runtime-cache-warmup.yml');
  const fullText = fs.readFileSync(fullPath, 'utf8');
  const full = parseYaml(fullText) as Record<string, any>;
  const fullSteps = full.jobs['full-first-install'].steps as Array<Record<string, any>>;
  const fullStep = (name: string) => fullSteps.find((step) => step.name === name);

  assert.equal(fs.existsSync(warmupPath), false);
  assert.deepEqual(Object.keys(full.on), ['workflow_call']);
  assert.equal(full.on.workflow_call.inputs.cache_only.default, false);
  assert.match(String(fullStep('Enforce cache-only warmup boundary')?.if), /inputs\.cache_only/);
  assert.match(String(fullStep('Build Full first-install package')?.run), /--warm-runtime-cache-only/);
  assert.equal(
    fullStep('Restore Bun install cache')?.with?.key,
    "bun-install-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('one-person-lab-app/shells/aionui/package.json', 'one-person-lab-app/shells/aionui/bun.lock') }}",
  );
  for (const name of [
    'Restore Full toolchain runtime cache',
    'Restore Full domain runtime cache',
    'Restore Full OPL runtime cache',
    'Restore Full skills runtime cache',
    'Save Full toolchain runtime cache',
    'Save Full domain runtime cache',
    'Save Full OPL runtime cache',
    'Save Full skills runtime cache',
  ]) {
    assert.equal(fullStep(name)?.env?.OPL_ACTIONS_CACHE_CLASS, 'full_runtime_layer', name);
  }
  assert.equal(
    fullStep('Restore Electron artifacts cache')?.with?.key,
    "electron-cache-macos-arm64-arm64-${{ hashFiles('one-person-lab-app/shells/aionui/package.json', 'one-person-lab-app/shells/aionui/bun.lock') }}",
  );
  assert.ok(
    fullSteps.indexOf(fullStep('Write exact-cohort Actions cache plan')!) <
      fullSteps.indexOf(fullStep('Restore Full toolchain runtime cache')!),
  );
  for (const name of [
    'Install App shell dependencies',
    'Verify Full package checksums and distribution trust',
    'Upload Full DMG-only workflow artifact',
  ]) {
    assert.match(String(fullStep(name)?.if), /!inputs\.cache_only/, name);
  }

  assert.equal(full.on.workflow_call.inputs.framework_ref.required, true);
  assert.equal(full.on.workflow_call.inputs.shell_ref.required, true);
  assert.match(fullText, /mode='cache_only_warmup'/);
});

test('Full cache-only builder returns before payload sync and DMG construction', () => {
  const source = fs.readFileSync(
    path.join(appRoot, 'scripts', 'build-full-first-install-package.ts'),
    'utf8',
  );
  const cacheOnlyBranch = source.indexOf('if (options.warmRuntimeCacheOnly)');
  const payloadSync = source.indexOf('syncRuntimePayloadToBuildRoots(');
  assert.ok(cacheOnlyBranch >= 0 && payloadSync > cacheOnlyBranch);
  assert.match(source.slice(cacheOnlyBranch, payloadSync), /fs\.rmSync\(prepared\.stagingRoot/);
  assert.match(source.slice(cacheOnlyBranch, payloadSync), /status: 'runtime_cache_warmed'/);
});
