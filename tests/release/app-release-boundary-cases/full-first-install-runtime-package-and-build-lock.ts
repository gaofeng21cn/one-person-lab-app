import {
  assert,
  fs,
  os,
  path,
  test,
  writeFile,
  writeExecutable,
  listFullRuntimeProductionNodeModulePaths,
  flowCapabilityBuildLockFixture,
  writeVersionExecutable,
} from "./full-first-install-runtime-fixtures.ts";

test("Full runtime keeps only macOS arm64 platform packages from optional production dependencies", () => {
  const selected = listFullRuntimeProductionNodeModulePaths({
    packages: {
      "": {},
      "node_modules/@swc/core": {},
      "node_modules/@swc/core-darwin-arm64": { optional: true, os: ["darwin"], cpu: ["arm64"] },
      "node_modules/@swc/core-darwin-x64": { optional: true, os: ["darwin"], cpu: ["x64"] },
      "node_modules/@swc/core-linux-arm64-gnu": { optional: true, os: ["linux"], cpu: ["arm64"] },
      "node_modules/e2b": { optional: true },
      "node_modules/test-only": { dev: true },
    },
  });

  assert.deepEqual(selected, [
    "node_modules/@swc/core",
    "node_modules/@swc/core-darwin-arm64",
  ]);
});

test('Full capability build lock rejects unsupported selection and payload drift', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-capability-lock-'));
  const sources = {
    officeCliBin: path.join(tempRoot, 'sources', 'officecli'),
    mineruOpenApiBin: path.join(tempRoot, 'sources', 'mineru-open-api'),
  };
  writeVersionExecutable(sources.officeCliBin, 'officecli 0.0.1');
  writeVersionExecutable(sources.mineruOpenApiBin, 'mineru-open-api 0.0.1');
  const {
    assertMaterializedFlowCapabilityBuildLock,
    materializeFlowCapabilityBuildLock,
    selectedFlowFullCapabilityRefs,
  } = await import(
    '../../../scripts/build-full-first-install-package/flow-capability-build-lock.ts'
  );
  const strategy = (items) => ({
    surface_kind: 'opl_flow_capability_strategy_projection.v1',
    authority: 'opl-flow',
    policy_schema: 'opl_flow_workflow_policy.v4',
    strategy_digest: '3'.repeat(64),
    full_distribution_plan: {
      target: 'full_offline_seed',
      items,
    },
  });

  try {
    assert.throws(
      () => selectedFlowFullCapabilityRefs(strategy([
        { capability_ref: 'cli:unknown', id: 'unknown' },
      ])),
      /no adapter for cli:unknown/,
    );
    assert.throws(
      () => selectedFlowFullCapabilityRefs(strategy([
        { capability_ref: 'cli:officecli', id: 'officecli' },
        { capability_ref: 'cli:officecli', id: 'officecli' },
      ])),
      /duplicate capability refs/,
    );

    const lock = flowCapabilityBuildLockFixture(sources, ['cli:officecli']);
    const runtimeRoot = path.join(tempRoot, 'runtime');
    materializeFlowCapabilityBuildLock(runtimeRoot, sources, lock);
    assert.deepEqual(
      assertMaterializedFlowCapabilityBuildLock(runtimeRoot).items.map(
        (item) => item.capability_ref,
      ),
      ['cli:officecli'],
    );

    writeExecutable(path.join(runtimeRoot, 'bin', 'mineru-open-api'), '#!/bin/sh\nexit 0\n');
    assert.throws(
      () => assertMaterializedFlowCapabilityBuildLock(runtimeRoot),
      /unselected Flow capability payload/,
    );
    fs.rmSync(path.join(runtimeRoot, 'bin', 'mineru-open-api'));
    fs.rmSync(path.join(runtimeRoot, 'bin', 'officecli'));
    assert.throws(
      () => assertMaterializedFlowCapabilityBuildLock(runtimeRoot),
      /missing selected Flow capability payload/,
    );

    writeFile(sources.officeCliBin, '#!/bin/sh\nprintf drift\n');
    assert.throws(
      () => materializeFlowCapabilityBuildLock(path.join(tempRoot, 'drifted'), sources, lock),
      /source drifted after build-lock compilation/,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
