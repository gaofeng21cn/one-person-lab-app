import { appRoot, assert, fs, os, path, spawnSync, test } from './helpers.ts';
import { parse as parseYaml } from 'yaml';
import {
  collectActionsCachePolicyViolations,
} from '../../../scripts/validate-release-boundary/actions-cache-policy.ts';

function policyFixture(workflow: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-actions-cache-policy-'));
  const workflowDirectory = path.join(root, '.github', 'workflows');
  const contractDirectory = path.join(root, 'contracts');
  fs.mkdirSync(workflowDirectory, { recursive: true });
  fs.mkdirSync(contractDirectory, { recursive: true });
  fs.writeFileSync(path.join(workflowDirectory, 'fixture.yml'), workflow, 'utf8');
  fs.copyFileSync(
    path.join(appRoot, 'contracts', 'app-actions-cache-catalog.json'),
    path.join(contractDirectory, 'app-actions-cache-catalog.json'),
  );
  return root;
}

test('repository Actions caches satisfy the reusable cache policy', () => {
  assert.deepEqual(collectActionsCachePolicyViolations(appRoot), []);
});

const reusableCacheAdmission = "${{ steps.cache-admission.outputs.admitted == 'true' }}";
const exactAppSha = 'a'.repeat(40);
const exactShellSha = 'c'.repeat(40);
const exactFrameworkSha = 'd'.repeat(40);
const exactBundleDigest = `sha256:${'b'.repeat(64)}`;

function reusableBuildSteps(): Array<Record<string, any>> {
  const buildWorkflow = parseYaml(
    fs.readFileSync(path.join(appRoot, '.github', 'workflows', '_build-reusable.yml'), 'utf8'),
  ) as Record<string, any>;
  return buildWorkflow.jobs.build.steps as Array<Record<string, any>>;
}

function reusableCacheAdmissionStep(): Record<string, any> {
  const step = reusableBuildSteps().find((entry) => entry.name === 'Admit Electron/Bun cache');
  assert.equal(step?.id, 'cache-admission');
  assert.equal(typeof step?.run, 'string');
  return step!;
}

function admittedByReusableCacheStep(overrides: Record<string, string>): boolean {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cache-admission-'));
  const output = path.join(root, 'github-output');
  fs.writeFileSync(output, '');
  try {
    const result = spawnSync('bash', ['-c', String(reusableCacheAdmissionStep().run)], {
      encoding: 'utf8',
      env: {
        ...process.env,
        EVENT_NAME: '',
        REPOSITORY: 'gaofeng21cn/one-person-lab-app',
        REF: 'refs/heads/main',
        FORK: 'false',
        OPERATION: '',
        CACHE_ROLE: '',
        APP_REF: '',
        SHELL_REF: '',
        FRAMEWORK_REF: '',
        RELEASE_COHORT_REF: '',
        RELEASE_BUNDLE_DIGEST: '',
        ...overrides,
        GITHUB_OUTPUT: output,
      },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const admitted = fs.readFileSync(output, 'utf8').split('\n').find((line) => line.startsWith('admitted='));
    assert.ok(admitted === 'admitted=true' || admitted === 'admitted=false');
    return admitted === 'admitted=true';
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('shared dependency caches are restored only for direct main pushes', () => {
  const activeShellMainPushGuard =
    "${{ github.event_name == 'push' && github.ref == 'refs/heads/main' && inputs.install-dependencies == 'true' }}";
  const activeShellAction = parseYaml(
    fs.readFileSync(
      path.join(appRoot, '.github', 'actions', 'setup-active-shell-deps', 'action.yml'),
      'utf8',
    ),
  ) as Record<string, any>;
  const activeShellSteps = activeShellAction.runs.steps as Array<Record<string, any>>;
  assert.equal(
    activeShellSteps.find((step) => step.name === 'Restore Bun install cache')?.if,
    activeShellMainPushGuard,
  );
});

test('reusable Electron/Bun caches share one admission output and main-only miss saves', () => {
  const steps = reusableBuildSteps();
  const env = reusableCacheAdmissionStep().env as Record<string, string>;
  assert.equal(env.REPOSITORY, '${{ github.repository }}');
  assert.equal(env.APP_REF, '${{ inputs.ref }}');
  assert.equal(env.SHELL_REF, '${{ inputs.shell_ref }}');
  assert.equal(env.FRAMEWORK_REF, '${{ inputs.framework_ref }}');
  assert.equal(env.OPERATION, '${{ inputs.operation }}');
  assert.equal(env.CACHE_ROLE, '${{ inputs.cache_role }}');
  assert.equal(env.RELEASE_BUNDLE_DIGEST, '${{ inputs.release_bundle_digest }}');
  assert.equal(env.RELEASE_COHORT_REF, '${{ inputs.release_cohort_ref }}');
  assert.equal(steps.find((step) => step.name === 'Restore Electron artifacts cache')?.if, reusableCacheAdmission);
  assert.equal(steps.find((step) => step.name === 'Restore Bun install cache')?.if, reusableCacheAdmission);
  assert.equal(
    steps.find((step) => step.name === 'Save Electron artifacts cache')?.if,
    "${{ steps.cache-admission.outputs.admitted == 'true' && github.ref == 'refs/heads/main' && steps.electron-cache.outputs.cache-hit != 'true' }}",
  );
  assert.equal(
    steps.find((step) => step.name === 'Save Bun install cache')?.if,
    "${{ steps.cache-admission.outputs.admitted == 'true' && github.ref == 'refs/heads/main' && steps.bun-cache.outputs.cache-hit != 'true' }}",
  );
});

test('reusable Electron/Bun cache admission executes the workflow script', () => {
  const standard = {
    EVENT_NAME: 'workflow_dispatch',
    OPERATION: 'standard',
    APP_REF: exactAppSha,
    SHELL_REF: exactShellSha,
    FRAMEWORK_REF: exactFrameworkSha,
    RELEASE_BUNDLE_DIGEST: exactBundleDigest,
    RELEASE_COHORT_REF: exactBundleDigest,
  };
  const desktop = {
    EVENT_NAME: 'workflow_call',
    CACHE_ROLE: 'stable_desktop_additional',
    APP_REF: exactAppSha,
    SHELL_REF: exactShellSha,
    FRAMEWORK_REF: exactFrameworkSha,
    RELEASE_BUNDLE_DIGEST: exactBundleDigest,
    RELEASE_COHORT_REF: exactBundleDigest,
  };
  const cases: Array<[string, Record<string, string>, boolean]> = [
    ['canonical main push', { EVENT_NAME: 'push' }, true],
    ['standard workflow_dispatch', standard, true],
    ['standard workflow_call', { ...standard, EVENT_NAME: 'workflow_call' }, true],
    ['standard workflow_run', { ...standard, EVENT_NAME: 'workflow_run' }, true],
    ['desktop additional cache role', desktop, true],
    ['pull request', { ...standard, EVENT_NAME: 'pull_request' }, false],
    ['fork push', { EVENT_NAME: 'push', FORK: 'true' }, false],
    ['unknown repository', { ...standard, REPOSITORY: 'untrusted/fork' }, false],
    ['empty ref', { EVENT_NAME: 'push', REF: '' }, false],
    ['unknown ref', { EVENT_NAME: 'push', REF: 'refs/heads/feature/cache' }, false],
    ['append_full', { ...standard, OPERATION: 'append_full' }, false],
    ['empty app sha', { ...standard, APP_REF: '' }, false],
    ['non-sha app ref', { ...standard, APP_REF: 'main' }, false],
    ['uppercase app sha', { ...standard, APP_REF: 'A'.repeat(40) }, false],
    ['empty shell sha', { ...standard, SHELL_REF: '' }, false],
    ['empty framework sha', { ...standard, FRAMEWORK_REF: '' }, false],
    ['invalid bundle digest', { ...standard, RELEASE_BUNDLE_DIGEST: exactAppSha, RELEASE_COHORT_REF: exactAppSha }, false],
    ['cohort digest mismatch', { ...standard, RELEASE_COHORT_REF: `sha256:${'e'.repeat(64)}` }, false],
    ['empty cohort ref', { ...standard, RELEASE_COHORT_REF: '' }, false],
    ['unknown caller with shas', { ...desktop, CACHE_ROLE: '' }, false],
    ['unknown cache role', { ...desktop, CACHE_ROLE: 'manual' }, false],
    ['desktop pull request', { ...desktop, EVENT_NAME: 'pull_request' }, false],
  ];
  for (const [name, env, expected] of cases) {
    assert.equal(admittedByReusableCacheStep(env), expected, name);
  }
});

test('first-run Codex install seed uses full content identity and direct-main-push miss saves', () => {
  const workflowPath = path.join(appRoot, '.github', 'workflows', 'opl-first-run-vm.yml');
  const workflowText = fs.readFileSync(workflowPath, 'utf8');
  const prefetchScriptText = fs.readFileSync(
    path.join(appRoot, 'scripts', 'prefetch-codex-package-install-assets.mjs'),
    'utf8',
  );
  const workflow = parseYaml(workflowText) as Record<string, any>;
  const steps = workflow.jobs['clean-vm-first-run'].steps as Array<Record<string, any>>;
  const saveStep = steps.find((step) => step.name === 'Save Codex install asset cache');

  assert.match(
    prefetchScriptText,
    /`\$\{cacheKeyPrefix\}-\$\{version\}-\$\{tarballSha256\}-\$\{platformTarballSha256\}`/,
  );
  assert.doesNotMatch(
    prefetchScriptText,
    /cacheKey\s*=\s*[^;]{0,1024}(?:GITHUB_RUN_ID|GITHUB_RUN_ATTEMPT)/,
  );
  assert.match(prefetchScriptText, /cacheSaveRequired = Boolean\(cacheKey && restoredCacheKey !== cacheKey\)/);
  assert.match(prefetchScriptText, /`cache_save_required=\$\{cacheSaveRequired\}`/);
  assert.equal(
    saveStep?.if,
    "${{ needs.validate-vm-inputs.outputs.diagnostic_scope != 'bootstrap_only' && github.event_name == 'push' && github.ref == 'refs/heads/main' && steps.codex_package_preflight.outputs.cache_save_required == 'true' }}",
  );
  assert.equal(saveStep?.with?.key, '${{ steps.codex_package_preflight.outputs.cache_key }}');
  assert.equal(saveStep?.env?.OPL_ACTIONS_CACHE_CLASS, 'first_run_install_seed');
});

test('Actions cache policy rejects volatile identities in direct and generated keys', () => {
  const directRoot = policyFixture(`
jobs:
  cache:
    steps:
      - uses: actions/cache@0123456789012345678901234567890123456789
        with:
          path: cache
          key: dependency-\${{ github.run_id }}
`);
  assert.match(
    collectActionsCachePolicyViolations(directRoot).join('\n'),
    /reusable cache key contains volatile run identity/,
  );

  const generatedRoot = policyFixture(`
jobs:
  cache:
    steps:
      - id: resolve
        run: |
          const cacheKey = \`dependency-\${process.env.GITHUB_RUN_ATTEMPT}\`;
      - uses: actions/cache/save@0123456789012345678901234567890123456789
        if: \${{ steps.resolve.outputs.save_required == 'true' }}
        with:
          path: cache
          key: \${{ steps.resolve.outputs.cache_key }}
`);
  assert.match(
    collectActionsCachePolicyViolations(generatedRoot).join('\n'),
    /dynamically generated reusable cache key contains volatile run identity/,
  );
});

test('Actions cache policy requires explicit saves to be miss-driven', () => {
  const root = policyFixture(`
jobs:
  cache:
    steps:
      - uses: actions/cache/save@0123456789012345678901234567890123456789
        if: \${{ steps.resolve.outputs.cache_key != '' }}
        with:
          path: cache
          key: \${{ steps.resolve.outputs.cache_key }}
`);
  assert.match(
    collectActionsCachePolicyViolations(root).join('\n'),
    /explicit cache save must be guarded by a cache miss/,
  );
});

test('Actions cache policy rejects combined saves and non-main writers', () => {
  const combinedRoot = policyFixture(`
jobs:
  cache:
    steps:
      - uses: actions/cache@0123456789012345678901234567890123456789
        with:
          path: ~/.bun/install/cache
          key: bun-install-Linux-X64-lock
`);
  assert.match(
    collectActionsCachePolicyViolations(combinedRoot).join('\n'),
    /combined actions\/cache restore-save is forbidden/,
  );

  const branchWriterRoot = policyFixture(`
jobs:
  cache:
    steps:
      - uses: actions/cache/save@0123456789012345678901234567890123456789
        if: \${{ steps.restore.outputs.cache-hit != 'true' }}
        with:
          path: ~/.bun/install/cache
          key: bun-install-Linux-X64-lock
`);
  assert.match(
    collectActionsCachePolicyViolations(branchWriterRoot).join('\n'),
    /explicit cache save must be restricted to refs\/heads\/main/,
  );
});

test('Actions cache policy rejects prefix fallback for exact build output', () => {
  const root = policyFixture(`
jobs:
  cache:
    steps:
      - uses: actions/cache/restore@0123456789012345678901234567890123456789
        with:
          path: shell/out
          key: full-shell-vite-output-macOS-ARM64-26.7.20-content
          restore-keys: full-shell-vite-output-macOS-ARM64-26.7.20-
`);
  assert.match(
    collectActionsCachePolicyViolations(root).join('\n'),
    /exact-only cache class must not declare restore-keys/,
  );
});

test('Actions cache policy requires catalog ownership metadata for fully dynamic keys', () => {
  const missingClassRoot = policyFixture(`
jobs:
  cache:
    steps:
      - uses: actions/cache/restore@0123456789012345678901234567890123456789
        with:
          path: runtime
          key: \${{ steps.keys.outputs.runtime_key }}
`);
  assert.match(
    collectActionsCachePolicyViolations(missingClassRoot).join('\n'),
    /fully dynamic cache key must declare a cataloged OPL_ACTIONS_CACHE_CLASS/,
  );

  const catalogedClassRoot = policyFixture(`
jobs:
  cache:
    steps:
      - uses: actions/cache/restore@0123456789012345678901234567890123456789
        env:
          OPL_ACTIONS_CACHE_CLASS: full_runtime_layer
        with:
          path: runtime
          key: \${{ steps.keys.outputs.runtime_key }}
          restore-keys: opl-full-runtime-layer-macOS-ARM64-
`);
  assert.match(
    collectActionsCachePolicyViolations(catalogedClassRoot).join('\n'),
    /exact-only cache class must not declare restore-keys/,
  );
});
