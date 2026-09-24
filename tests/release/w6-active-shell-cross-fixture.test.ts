import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveActiveShellPaths } from '../../scripts/app-shell-adapter.ts';

const appRoot = path.resolve(import.meta.dirname, '../..');
const activeShellTestRunner = path.join(appRoot, 'scripts', 'run-active-shell-tests.ts');
const crossFixtureTests = {
  node: 'tests/unit/opl-runtime/runtime-v2/appStateCrossFixture.test.ts',
  dom: 'tests/unit/guid/AppStateCrossFixture.dom.test.tsx',
} as const;
const appFixturePaths = [
  'contracts/fixtures/opl-app-state-fast.fixture.json',
  'contracts/fixtures/opl-app-state-runtime-v2-mas-detail.fixture.json',
  'contracts/fixtures/opl-app-state-runtime-v2-unknown-agent.fixture.json',
  'contracts/fixtures/opl-app-state-unknown-agent.fixture.json',
] as const;
const appFixtureRef = process.env.OPL_APP_FIXTURE_REF?.trim() || 'HEAD';

type Project = keyof typeof crossFixtureTests;

function configuredShellRoot(): string {
  const contract = JSON.parse(fs.readFileSync(path.join(appRoot, 'contracts/shell-adapters/aionui.json'), 'utf8'));
  const shellRoot = path.join(appRoot, contract.shell_root);
  assert.ok(fs.existsSync(shellRoot), `Active Shell worktree is missing: ${shellRoot}`);
  assert.ok(fs.statSync(shellRoot).isDirectory(), `Active Shell root is not a directory: ${shellRoot}`);
  return shellRoot;
}

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
    OPL_APP_SHELL_ADAPTER_CONTRACT: 'contracts/shell-adapters/aionui.json',
    OPL_APP_FIXTURE_REF: 'HEAD',
    OPL_APP_SHELL_ROOT: shellRoot,
    OPL_APP_TEST_MAX_WORKERS: '1',
  };
}

function runCrossFixtureProject(
  project: Project,
  shellRoot: string,
  root: string,
  overrides: NodeJS.ProcessEnv = {},
) {
  return spawnSync(process.execPath, [
    '--experimental-strip-types',
    activeShellTestRunner,
    '--project',
    project,
    '--max-workers',
    '1',
    '--',
    crossFixtureTests[project],
  ], {
    cwd: appRoot,
    encoding: 'utf8',
    env: isolatedEnvironment(root, shellRoot, overrides),
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function outputOf(result: ReturnType<typeof spawnSync>): string {
  return [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n');
}

function assertProjectPassed(project: Project, result: ReturnType<typeof spawnSync>): void {
  const output = outputOf(result);
  assert.equal(result.status, 0, `${project} cross-fixture command failed:\n${output}`);
  assert.equal(result.error, undefined, `${project} cross-fixture command could not execute:\n${output}`);
  assert.doesNotMatch(output, /\b\d+\s+skipped\b/i, `${project} cross-fixture tests were skipped:\n${output}`);
  const passed = output.match(/Tests\s+(\d+)\s+passed\b/i);
  assert.ok(passed, `${project} cross-fixture output did not report passed tests:\n${output}`);
  assert.ok(Number(passed[1]) > 0, `${project} cross-fixture reported no executed tests:\n${output}`);
}

function makeTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opl-w6-cross-fixture-'));
}

test('W6 App fixture authority is tracked and committed without a copied JSON fixture', () => {
  assertAppFixtureAuthority();
});

test('W6 App gate preserves legacy AionUI node cross-fixture tests with the App root bound', (t) => {
  const shellRoot = configuredShellRoot();
  const root = makeTempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.ok(fs.statSync(path.join(shellRoot, 'vitest.config.ts')).isFile(), 'Active Shell Vitest config is missing.');
  assert.ok(fs.statSync(path.join(shellRoot, crossFixtureTests.node)).isFile(), 'Active Shell node cross-fixture test is missing.');

  const result = runCrossFixtureProject('node', shellRoot, root);
  assertProjectPassed('node', result);
});

test('W6 App gate preserves legacy AionUI DOM cross-fixture tests with the App root bound', (t) => {
  const shellRoot = configuredShellRoot();
  const root = makeTempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.ok(fs.statSync(path.join(shellRoot, 'vitest.config.ts')).isFile(), 'Active Shell Vitest config is missing.');
  assert.ok(fs.statSync(path.join(shellRoot, crossFixtureTests.dom)).isFile(), 'Active Shell DOM cross-fixture test is missing.');

  const result = runCrossFixtureProject('dom', shellRoot, root);
  assertProjectPassed('dom', result);
});

test('W6 legacy App gate fails closed when the active Shell worktree is missing', (t) => {
  const root = makeTempRoot();
  const missingShellRoot = path.join(root, 'missing-shell');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = runCrossFixtureProject('node', missingShellRoot, root);
  assert.notEqual(result.status, 0, 'A missing active Shell must not be treated as a skipped pass.');
  assert.match(outputOf(result), /Missing active shell Vitest config|ENOENT|missing/i);
});

test('W6 legacy App gate fails closed when the active Shell test command cannot execute', (t) => {
  const shellRoot = configuredShellRoot();
  const root = makeTempRoot();
  const emptyPath = path.join(root, 'empty-bin');
  fs.mkdirSync(emptyPath, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = runCrossFixtureProject('node', shellRoot, root, { PATH: emptyPath });
  assert.notEqual(result.status, 0, 'An unexecutable active Shell test command must fail closed.');
  assert.match(outputOf(result), /bunx|failed|ENOENT/i);
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
