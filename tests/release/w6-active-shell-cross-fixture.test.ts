import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveActiveShellPaths } from '../../scripts/app-shell-adapter.ts';

const appRoot = path.resolve(import.meta.dirname, '../..');
const appFixturePaths = [
  'contracts/fixtures/opl-app-state-fast.fixture.json',
  'contracts/fixtures/opl-app-state-runtime-v2-mas-detail.fixture.json',
  'contracts/fixtures/opl-app-state-runtime-v2-unknown-agent.fixture.json',
  'contracts/fixtures/opl-app-state-unknown-agent.fixture.json',
] as const;
const appFixtureRef = process.env.OPL_APP_FIXTURE_REF?.trim() || 'HEAD';

function assertAppFixtureAuthority(): void {
  for (const relativePath of appFixturePaths) {
    const fixturePath = path.join(appRoot, relativePath);
    assert.ok(fs.statSync(fixturePath).isFile(), `Missing App-owned fixture: ${relativePath}`);

    const tracked = spawnSync('git', ['-C', appRoot, 'ls-files', '--error-unmatch', '--', relativePath], {
      encoding: 'utf8',
    });
    assert.equal(tracked.status, 0, `App fixture is not tracked: ${relativePath}`);

    const committed = spawnSync('git', ['-C', appRoot, 'show', `HEAD:${relativePath}`]);
    assert.equal(committed.status, 0, `Unable to read committed App fixture: ${relativePath}`);
    assert.ok(Buffer.isBuffer(committed.stdout), `Committed fixture output was not bytes: ${relativePath}`);
    assert.deepEqual(
      fs.readFileSync(fixturePath),
      committed.stdout,
      `Working-tree fixture drifted from the committed App authority: ${relativePath}`,
    );
    const canonical = spawnSync('git', ['-C', appRoot, 'show', `${appFixtureRef}:${relativePath}`]);
    assert.equal(canonical.status, 0, `Unable to read canonical App fixture: ${relativePath}`);
    assert.ok(Buffer.isBuffer(canonical.stdout), `Canonical fixture output was not bytes: ${relativePath}`);
    assert.deepEqual(
      committed.stdout,
      canonical.stdout,
      `Committed App fixture drifted from ${appFixtureRef}: ${relativePath}`,
    );
  }
}

function isolatedEnvironment(root: string, shellRoot: string, overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const home = path.join(root, 'home');
  const config = path.join(root, 'config');
  const cache = path.join(root, 'cache');
  const tmp = path.join(root, 'tmp');
  for (const directory of [home, config, cache, tmp]) fs.mkdirSync(directory, { recursive: true });

  return {
    ...process.env,
    ...overrides,
    HOME: home,
    XDG_CONFIG_HOME: config,
    XDG_CACHE_HOME: cache,
    TMPDIR: tmp,
    NO_COLOR: '1',
    OPL_APP_ROOT: appRoot,
    OPL_APP_SHELL_ADAPTER_CONTRACT: 'contracts/app-shell-adapter.json',
    OPL_APP_FIXTURE_REF: 'HEAD',
    OPL_APP_SHELL_ROOT: shellRoot,
    OPL_APP_TEST_MAX_WORKERS: '1',
  };
}

function outputOf(result: ReturnType<typeof spawnSync>): string {
  return [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n');
}

function makeTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opl-w6-cross-fixture-'));
}

test('W6 App fixture authority is tracked and committed without a copied JSON fixture', () => {
  assertAppFixtureAuthority();
});

test('W6 Studio consumes canonical App fixture bytes through its actual Host and renderer projections', (t) => {
  assertAppFixtureAuthority();
  const studioRoot = resolveActiveShellPaths().shellRoot;
  const root = makeTempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'studio-cross-fixture.mts');
  fs.writeFileSync(file, `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { compactFastState } from ${JSON.stringify(path.join(studioRoot, 'scripts/webui-host/opl-passthrough.mjs'))};
    import { deriveWorkbenchModelFromState } from ${JSON.stringify(path.join(studioRoot, 'src/workbench/workbenchModel.ts'))};
    for (const relative of ${JSON.stringify(appFixturePaths)}) {
      const fixture = JSON.parse(fs.readFileSync(${JSON.stringify(appRoot)} + '/' + relative, 'utf8'));
      const compacted = compactFastState(fixture);
      const model = deriveWorkbenchModelFromState(compacted);
      for (const entry of fixture.app_state?.agent_packages?.directory?.entries ?? []) {
        const actual = model.packageLifecycle.find(item => item.packageId === entry.package_id);
        assert.ok(actual, 'Missing canonical package ' + entry.package_id);
      }
      const projection = fixture.app_state?.operator?.workbench?.work_item_projection_v2;
      if (projection) {
        assert.equal(model.workItemRuntime?.schemaVersion, 'work-item-projection.v2');
        assert.deepEqual(model.workItemRuntime.agents.map(item => item.id), projection.agent_catalog.map(item => item.agent_id));
        assert.deepEqual(model.workItemRuntime.projects.map(item => item.id), projection.project_catalog.map(item => item.project_id));
      }
    }
    console.log('OPL_STUDIO_APP_CROSS_FIXTURE_PASSED');
  `);
  const result = spawnSync('bun', [file], { cwd: studioRoot, encoding: 'utf8', timeout: 30_000,
    env: isolatedEnvironment(root, studioRoot) });
  assert.equal(result.status, 0, outputOf(result));
  assert.match(result.stdout, /OPL_STUDIO_APP_CROSS_FIXTURE_PASSED/);
});
