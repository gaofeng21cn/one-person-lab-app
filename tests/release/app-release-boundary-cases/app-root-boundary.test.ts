import { assertAppRootBoundary } from '../../../scripts/app-root-boundary.ts';
import {
  resolveActiveShellEnvironment,
  resolveOplBuildVersions,
} from '../../../scripts/run-active-shell-command.ts';
import {
  assert,
  fs,
  os,
  path,
  test,
  appRoot,
} from './helpers.ts';

const requiredScripts = {
  'validate:app-root-boundary': 'node --experimental-strip-types scripts/app-root-boundary.ts',
  'typecheck': 'tsc --noEmit -p tsconfig.json',
  'gui': 'node --experimental-strip-types scripts/gui-launcher.ts',
  'validate:active-shell': 'node --experimental-strip-types scripts/validate-active-shell.ts',
  'validate:release-boundary': 'node --experimental-strip-types scripts/validate-release-boundary.ts',
  'validate:windows-platform-factory': 'node --experimental-strip-types scripts/validate-windows-platform-factory.ts',
  'release:prepare-standard': 'node --experimental-strip-types scripts/prepare-standard-release-payload.ts',
  'release:framework-adapter': 'node --experimental-strip-types scripts/framework-release-adapter.ts',
  'release:deadline': 'node --experimental-strip-types scripts/release-operation-deadline.ts',
  'release:bind-standard': 'node --experimental-strip-types scripts/bind-standard-release-track.ts',
  'release:historical-candidate-record:status': 'node --experimental-strip-types scripts/validate-release-candidate-record.ts --status',
  'release:historical-bundle:status': 'node --experimental-strip-types scripts/release-bundle.ts status',
  'build-mac:arm64': 'node --experimental-strip-types scripts/prepare-standard-release-payload.ts && node --experimental-strip-types scripts/run-active-shell-command.ts bun run build-mac:arm64',
};

function writeRootPackage(root: string, overrides = {}): void {
  fs.writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify({
      name: 'one-person-lab-app',
      version: '1.9.25',
      private: true,
      type: 'module',
      scripts: requiredScripts,
      devDependencies: {
        '@types/node': '22.15.3',
        ajv: '8.18.0',
        'ajv-formats': '3.0.1',
        typescript: '5.8.3',
        yaml: '2.8.1',
      },
      ...overrides,
    }, null, 2)}\n`,
    'utf8',
  );
}

test('App root boundary validator accepts the product wrapper and rejects shell-root pollution', () => {
  assertAppRootBoundary({ root: appRoot });

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-root-boundary-'));
  writeRootPackage(tempRoot);
  assert.doesNotThrow(() => assertAppRootBoundary({ root: tempRoot }));

  writeRootPackage(tempRoot, {
    name: 'one-person-lab-aion-shell',
    main: './out/main/index.js',
    workspaces: ['packages/*'],
    productName: 'One Person Lab',
  });
  assert.throws(
    () => assertAppRootBoundary({ root: tempRoot }),
    /package\.json name must stay one-person-lab-app[\s\S]*package\.json must not contain shell package field main[\s\S]*package\.json must not contain shell package field workspaces/,
  );

  writeRootPackage(tempRoot);
  fs.writeFileSync(path.join(tempRoot, 'index.js'), '"use strict";\n', 'utf8');
  assert.throws(
    () => assertAppRootBoundary({ root: tempRoot }),
    /shell build artifact must not exist at App root: index\.js/,
  );
});

test('active-shell wrapper binds each display channel to its canonical updater machine version', () => {
  assert.deepEqual(
    resolveOplBuildVersions({ OPL_RELEASE_VERSION: '26.8.19' }),
    { displayVersion: '26.8.19', updaterVersion: '26.8.1991' },
  );
  assert.throws(
    () => resolveOplBuildVersions({ OPL_RELEASE_VERSION: '26.8.19', OPL_UPDATER_VERSION: '26.8.19' }),
    /does not match 26\.8\.19; expected 26\.8\.1991/,
  );
  assert.deepEqual(
    resolveOplBuildVersions({ OPL_RELEASE_VERSION: '26.8.19-nightly' }),
    { displayVersion: '26.8.19-nightly', updaterVersion: '26.8.1991-nightly.1' },
  );
  assert.throws(
    () => resolveOplBuildVersions({
      OPL_RELEASE_VERSION: '26.8.19-nightly',
      OPL_UPDATER_VERSION: '26.8.1991',
    }),
    /does not match 26\.8\.19-nightly; expected 26\.8\.1991-nightly\.1/,
  );
  assert.deepEqual(
    resolveOplBuildVersions({ OPL_RELEASE_VERSION: '26.8.19-preview.r1' }),
    { displayVersion: '26.8.19-preview.r1', updaterVersion: '26.8.1991-preview.1' },
  );
});

test('active-shell wrapper binds Shell contract reads to the current App worktree', () => {
  const repositoryRoot = path.join(os.tmpdir(), 'opl-app-current-worktree');
  const environment = resolveActiveShellEnvironment(
    { OPL_RELEASE_VERSION: '26.8.19', OPL_APP_REPO_ROOT: '/stale/app/root' },
    repositoryRoot,
  );
  assert.equal(environment.OPL_APP_REPO_ROOT, path.resolve(repositoryRoot));
  assert.equal(
    environment.OPL_APP_RELEASE_ICON_ICNS,
    path.join(path.resolve(repositoryRoot), 'shells', 'aionui', 'resources', 'app.icns'),
  );
});

test('App verification owns one parallel release plan and one full shell execution', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  const releaseCommand = packageJson.scripts['test:release-boundary'];
  assert.match(releaseCommand, /npm run validate:release-boundary/);
  assert.match(releaseCommand, /--test-concurrency=4/);
  assert.match(releaseCommand, /--test-timeout=120000/);
  assert.match(releaseCommand, /--test-force-exit/);
  assert.match(releaseCommand, /app-release-boundary-cases\/\*\.test\.ts/);
  assert.equal((releaseCommand.match(/validate:release-boundary/g) ?? []).length, 1);

  const verify = fs.readFileSync(path.join(appRoot, 'scripts', 'verify.sh'), 'utf8');
  const fullBody = verify.match(/full\)\n([\s\S]*?)\n\s*;;/)?.[1] ?? '';
  assert.match(fullBody, /run_lane active-shell/);
  assert.match(fullBody, /run_lane release-boundary/);
  assert.match(fullBody, /run_lane candidate-shell/);
  assert.doesNotMatch(fullBody, /validate:candidate:|--candidate/);
  assert.doesNotMatch(fullBody, /npm run test:full/);

  const adapter = JSON.parse(fs.readFileSync(path.join(appRoot, 'contracts', 'app-shell-adapter.json'), 'utf8'));
  assert.equal(
    adapter.validation_commands.filter((entry: { command?: string }) => entry.command === 'bun run test:full').length,
    1,
  );
});
