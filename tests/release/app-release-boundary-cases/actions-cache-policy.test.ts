import { appRoot, assert, fs, os, path, test } from './helpers.ts';
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

test('shared dependency caches are restored only for direct main pushes', () => {
  const mainPushGuard = "${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}";
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

  const buildWorkflow = parseYaml(
    fs.readFileSync(path.join(appRoot, '.github', 'workflows', '_build-reusable.yml'), 'utf8'),
  ) as Record<string, any>;
  const buildSteps = buildWorkflow.jobs.build.steps as Array<Record<string, any>>;
  assert.equal(
    buildSteps.find((step) => step.name === 'Restore Electron artifacts cache')?.if,
    mainPushGuard,
  );
  assert.equal(
    buildSteps.find((step) => step.name === 'Restore Bun install cache')?.if,
    mainPushGuard,
  );
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
