import {
  appRoot,
  assert,
  fs,
  os,
  path,
  spawnSync,
  test,
  writeFile,
} from './helpers.ts';
import {
  FULL_RUNTIME_CACHE_LAYER_IDS,
  FULL_RUNTIME_PRUNE_POLICY,
  buildFullRuntimePrunePolicyCacheHash,
} from '../../../scripts/full-first-install-package.ts';
import {
  FULL_RUNTIME_DEFAULT_DEPENDENCY_CLOSURE,
  FULL_RUNTIME_STARTER_PROFILE,
  buildFullRuntimeStarterProfile,
  resolveSelectedPackageSetInput,
  validateSelectedPackageSetInput,
} from '../../../scripts/build-full-first-install-package/runtime-cache-package-set.ts';

function runGit(repoRoot: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function commitRepo(repoRoot: string, message: string) {
  runGit(repoRoot, ['add', '.']);
  runGit(repoRoot, ['commit', '-q', '-m', message]);
  return runGit(repoRoot, ['rev-parse', 'HEAD']);
}

function initializeRepo(repoRoot: string) {
  fs.mkdirSync(repoRoot, { recursive: true });
  runGit(repoRoot, ['init', '-q']);
  runGit(repoRoot, ['config', 'user.name', 'Runtime Cache Test']);
  runGit(repoRoot, ['config', 'user.email', 'runtime-cache-test@example.invalid']);
}

test('Full runtime prune policy changes invalidate only affected cache layers', () => {
  const baseline = Object.fromEntries(FULL_RUNTIME_CACHE_LAYER_IDS.map((layerId) => [
    layerId,
    buildFullRuntimePrunePolicyCacheHash(layerId),
  ]));
  const domainPolicy = structuredClone(FULL_RUNTIME_PRUNE_POLICY);
  domainPolicy.runtime_tree.excluded_path_patterns.push('^modules/cache-fixture(?:/|$)');
  const domainChanged = Object.fromEntries(FULL_RUNTIME_CACHE_LAYER_IDS.map((layerId) => [
    layerId,
    buildFullRuntimePrunePolicyCacheHash(layerId, domainPolicy),
  ]));
  assert.notEqual(domainChanged['domain-runtime'], baseline['domain-runtime']);
  assert.equal(domainChanged.toolchain, baseline.toolchain);
  assert.equal(domainChanged['opl-runtime'], baseline['opl-runtime']);
  assert.equal(domainChanged.skills, baseline.skills);

  const oplPolicy = structuredClone(FULL_RUNTIME_PRUNE_POLICY);
  oplPolicy.production_node_modules.excluded_path_patterns.push('(?:^|/)fixture(?:/|$)');
  assert.notEqual(
    buildFullRuntimePrunePolicyCacheHash('opl-runtime', oplPolicy),
    baseline['opl-runtime'],
  );
  for (const layerId of ['toolchain', 'domain-runtime', 'skills'] as const) {
    assert.equal(buildFullRuntimePrunePolicyCacheHash(layerId, oplPolicy), baseline[layerId]);
  }

  const requiredExportPolicy = structuredClone(FULL_RUNTIME_PRUNE_POLICY);
  requiredExportPolicy.required_built_exports[0].runtime_path = 'opl/dist/host/alternate.js';
  assert.notEqual(
    buildFullRuntimePrunePolicyCacheHash('opl-runtime', requiredExportPolicy),
    baseline['opl-runtime'],
  );
  for (const layerId of ['toolchain', 'domain-runtime', 'skills'] as const) {
    assert.equal(buildFullRuntimePrunePolicyCacheHash(layerId, requiredExportPolicy), baseline[layerId]);
  }

  const unknownPolicy = structuredClone(FULL_RUNTIME_PRUNE_POLICY);
  unknownPolicy.runtime_tree.excluded_path_patterns.push('^future-layer/cache(?:/|$)');
  for (const layerId of FULL_RUNTIME_CACHE_LAYER_IDS) {
    assert.notEqual(buildFullRuntimePrunePolicyCacheHash(layerId, unknownPolicy), baseline[layerId]);
  }
});

test('selected package set uses Official Profile roots and records the offline dependency closure', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-package-set-'));
  const sourceRoots: Record<string, string> = {};
  const sourceCommits: Record<string, string> = {};
  try {
    for (const packageId of FULL_RUNTIME_DEFAULT_DEPENDENCY_CLOSURE) {
      const sourceRoot = path.join(tempRoot, packageId);
      initializeRepo(sourceRoot);
      writeFile(path.join(sourceRoot, 'payload.txt'), `${packageId}\n`);
      sourceRoots[packageId] = sourceRoot;
      sourceCommits[packageId] = commitRepo(sourceRoot, `fixture ${packageId}`);
    }

    const options = {
      masRoot: sourceRoots.mas,
      magRoot: sourceRoots.mag,
      rcaRoot: sourceRoots.rca,
      metaAgentRoot: sourceRoots.oma,
      bookforgeRoot: sourceRoots.obf,
      masScholarSkillsRoot: sourceRoots['mas-scholar-skills'],
      oplFlowRoot: sourceRoots['opl-flow'],
    };

    const packageSet = resolveSelectedPackageSetInput(options);
    assert.deepEqual(packageSet.package_ids, FULL_RUNTIME_STARTER_PROFILE.package_ids);
    assert.equal(packageSet.package_ids.includes('mas-scholar-skills'), false);
    assert.equal(packageSet.dependency_closure.includes('mas-scholar-skills'), true);
    assert.equal(packageSet.package_ids.includes('opl-channel-weixin'), true);
    assert.equal(packageSet.dependency_closure.includes('opl-channel-weixin'), false);
    assert.deepEqual(
      packageSet.packages.map((entry) => entry.package_id),
      FULL_RUNTIME_DEFAULT_DEPENDENCY_CLOSURE,
    );
    assert.deepEqual(Object.keys(packageSet), [
      'schema',
      'profile_id',
      'package_ids',
      'dependency_closure',
      'packages',
      'identity',
    ]);
    for (const entry of packageSet.packages) {
      assert.equal(entry.source_commit, sourceCommits[entry.package_id]);
      assert.match(entry.source_fingerprint, /^sha256:[0-9a-f]{64}$/);
    }
    assert.doesNotThrow(() => validateSelectedPackageSetInput(packageSet));

    writeFile(path.join(sourceRoots.mag, 'owner-drift.txt'), 'owner drift\n');
    commitRepo(sourceRoots.mag, 'owner drift');
    const drifted = resolveSelectedPackageSetInput(options);
    assert.notEqual(
      drifted.packages.find((entry) => entry.package_id === 'mag')?.source_commit,
      sourceCommits.mag,
    );
    assert.notEqual(drifted.identity, packageSet.identity);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('Full runtime starter profile follows the supplied Official Profile roots', () => {
  const packageProfile = buildFullRuntimeStarterProfile({
    official_profile: {
      desired_root_package_ids: ['opl-flow', 'mas', 'native-carrier-only'],
    },
  });
  assert.deepEqual(packageProfile.package_ids, ['opl-flow', 'mas', 'native-carrier-only']);
  assert.deepEqual(
    packageProfile.dependency_closure,
    FULL_RUNTIME_DEFAULT_DEPENDENCY_CLOSURE,
  );
});

test('Framework package profile resolves a custom dependency closure without changing the helper', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-custom-profile-'));
  try {
    const packageIds = ['custom-agent', 'custom-capability'];
    const sourceRoots: Record<string, string> = {};
    const sourceCommits: Record<string, string> = {};
    for (const packageId of packageIds) {
      const sourceRoot = path.join(tempRoot, packageId);
      initializeRepo(sourceRoot);
      writeFile(path.join(sourceRoot, 'payload.txt'), `${packageId}\n`);
      sourceRoots[packageId] = sourceRoot;
      sourceCommits[packageId] = commitRepo(sourceRoot, `fixture ${packageId}`);
    }
    const customProfile = {
      profile_id: 'custom',
      package_ids: ['custom-agent'],
      dependency_closure: packageIds,
    } as const;

    const packageSet = resolveSelectedPackageSetInput({
      packageRoots: sourceRoots,
    }, customProfile);
    assert.deepEqual(
      packageSet.packages.map((entry) => entry.package_id),
      packageIds,
    );
    assert.equal(packageSet.packages[0].source_commit, sourceCommits['custom-agent']);
    assert.equal(packageSet.packages[1].source_commit, sourceCommits['custom-capability']);
    assert.doesNotThrow(() => validateSelectedPackageSetInput(packageSet));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('App release contract declares the v2 Full runtime cache layout', () => {
  const releaseContract = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts', 'app-release-channel.json'), 'utf8'),
  );
  const runtimeCache = releaseContract.release_acceleration.full_runtime_cache;
  for (const layerId of FULL_RUNTIME_CACHE_LAYER_IDS) {
    assert.match(runtimeCache.restore_prefixes[layerId], /full-runtime-v2-/);
  }
});
