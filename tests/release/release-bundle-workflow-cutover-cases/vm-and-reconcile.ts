import test from 'node:test';
import {
  assert,
  crypto,
  fs,
  os,
  path,
  spawnSync,
  readWorkflow,
  parseWorkflow,
  workflowStep,
} from "./fixtures.ts";

test('Full finalizer artifact digest normalization executes fail closed on the pinned action output', () => {
  const workflow = parseWorkflow('full-first-install-release.yml');
  const normalization = workflow.jobs['full-first-install'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Normalize immutable Full finalizer artifact digest',
  );
  const run = (rawDigest: string) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-finalizer-digest-'));
    const output = path.join(root, 'github-output');
    const result = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', String(normalization.run)], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_OUTPUT: output,
        RAW_HANDOFF_ARTIFACT_DIGEST: rawDigest,
      },
    });
    const written = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '';
    fs.rmSync(root, { recursive: true, force: true });
    return { result, written };
  };

  const digest = 'a'.repeat(64);
  const bare = run(digest);
  assert.equal(bare.result.status, 0, bare.result.stderr);
  assert.equal(bare.written, `artifact_digest=sha256:${digest}\n`);

  const canonical = run(`sha256:${digest}`);
  assert.equal(canonical.result.status, 0, canonical.result.stderr);
  assert.equal(canonical.written, `artifact_digest=sha256:${digest}\n`);

  for (const malformed of ['', 'sha256:not-a-digest', 'A'.repeat(64)]) {
    const rejected = run(malformed);
    assert.notEqual(rejected.result.status, 0, `accepted malformed digest: ${malformed}`);
    assert.equal(rejected.written, '');
    assert.match(
      `${rejected.result.stdout}${rejected.result.stderr}`,
      /Full finalizer input artifact digest is missing or malformed/,
    );
  }
});

test('real build and qualification calls recalculate and consume the same remaining operation budget', () => {
  const build = parseWorkflow('_build-reusable.yml');
  const buildBudget = build.jobs.build.steps.find(
    (step: Record<string, unknown>) => step.name === 'Recalculate immutable operation budget before release build',
  );
  assert.equal(buildBudget.if, "${{ inputs.operation != '' && startsWith(matrix.platform, 'macos') }}");
  assert.match(String(buildBudget.run), /release-operation-deadline\.ts check/);
  assert.match(String(buildBudget.run), /deadlineMs - Date\.now\(\) - evidenceReserveMs/);
  const macBuild = build.jobs.build.steps.find(
    (step: Record<string, unknown>) => step.name === 'Build with electron-builder (macOS)',
  );
  assert.match(String(macBuild.run), /RELEASE_BUILD_TIMEOUT_MS/);
  assert.match(String(macBuild.run), /process\.kill\(-child\.pid, signal\)/);
  assert.match(String(macBuild.run), /operation_deadline_elapsed/);

  const updater = parseWorkflow('opl-updater-upgrade-vm.yml');
  const updaterBudget = updater.jobs.upgrade.steps.find(
    (step: Record<string, unknown>) => step.name === 'Recalculate immutable operation budget before updater qualification',
  );
  assert.match(String(updaterBudget.run), /release-operation-deadline\.ts check/);
  assert.match(String(updaterBudget.run), /Math\.min\(1_500_000, remainingMs\)/);
  const updaterRun = updater.jobs.upgrade.steps.find(
    (step: Record<string, unknown>) => step.name === 'Run real predecessor-to-candidate updater qualification',
  );
  assert.match(String(updaterRun.run), /steps\.updater_budget\.outputs\.timeout_ms/);
  assert.doesNotMatch(String(updaterRun.run), /--timeout-ms 1500000/);

  const vm = parseWorkflow('opl-first-run-vm.yml');
  const vmBudget = vm.jobs['clean-vm-first-run'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Recalculate immutable operation budget before expensive smoke',
  );
  assert.equal(vmBudget.if, "${{ inputs.operation != '' }}");
  assert.match(String(vmBudget.run), /release-operation-deadline\.ts check/);
  const vmRun = vm.jobs['clean-vm-first-run'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Run clean VM first launch smoke',
  );
  assert.match(String(vmRun.run), /steps\.operation_smoke_budget\.outputs\.run_timeout_ms/);
});

test('first-run VM installs frozen Shell runtime dependencies before importing the harness', () => {
  const source = readWorkflow('opl-first-run-vm.yml');
  const workflow = parseWorkflow('opl-first-run-vm.yml');
  const steps = workflow.jobs['clean-vm-first-run'].steps as Array<Record<string, any>>;
  const stepIndex = (name: string) => steps.findIndex((step) => step.name === name);
  const step = (name: string) => {
    const found = steps[stepIndex(name)];
    assert.ok(found, `clean-vm-first-run is missing ${name}`);
    return found;
  };

  const checkout = step('Checkout active shell');
  assert.deepEqual(
    String(checkout.with['sparse-checkout']).trim().split('\n'),
    [
      '/scripts/',
      '/package.json',
      '/bun.lock',
      '/patches/',
      '/packages/*/package.json',
      '/packages/desktop/src/common/config/oplProductProfile/oplProductProfile.generated.json',
    ],
  );
  assert.equal(checkout.with['sparse-checkout-cone-mode'], false);
  assert.equal(stepIndex('Materialize active shell dependency metadata'), -1);

  const setupBun = step('Setup bun');
  assert.equal(setupBun.uses, 'oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6');
  assert.equal(setupBun.with['bun-version'], '1.3.14');

  const install = step('Install active shell harness dependencies');
  assert.equal(install['working-directory'], 'shells/aionui');
  assert.equal(String(install.run).trim(), 'bun install --frozen-lockfile --ignore-scripts');

  const validate = step('Validate smoke scripts');
  assert.match(String(validate.run), /await import\('\.\/shells\/aionui\/scripts\/opl-first-run-tart-smoke\.mjs'\)/);
  assert.ok(stepIndex('Checkout active shell') < stepIndex('Setup bun'));
  assert.ok(stepIndex('Setup bun') < stepIndex('Install active shell harness dependencies'));
  assert.ok(stepIndex('Install active shell harness dependencies') < stepIndex('Validate smoke scripts'));
  assert.ok(stepIndex('Validate smoke scripts') < stepIndex('Run clean VM first launch smoke'));
  assert.doesNotMatch(source, /'\/packages\/\*\/package\.json'/);
  assert.doesNotMatch(source, /git -C shells\/aionui sparse-checkout set/);
  assert.doesNotMatch(source, /\b(?:npm install|npm i|bun add)\s+smol-toml(?:@|\s|$)/);
});

test('first-run VM validates both production Runtime refresh routes before writing qualification evidence', () => {
  const workflow = parseWorkflow('opl-first-run-vm.yml');
  const steps = workflow.jobs['clean-vm-first-run'].steps as Array<Record<string, any>>;
  const stepIndex = (name: string) => steps.findIndex((step) => step.name === name);
  const validationIndex = stepIndex('Validate production Settings Runtime refresh evidence');
  const validation = steps[validationIndex];

  assert.ok(validation, 'clean-vm-first-run is missing production Settings Runtime evidence validation');
  assert.equal(validation.id, 'settings_runtime_evidence');
  assert.equal(
    validation.if,
    "${{ steps.vm_smoke.outcome == 'success' && needs.validate-vm-inputs.outputs.diagnostic_scope != 'bootstrap_only' }}",
  );
  assert.match(String(validation.run), /validate-settings-smoke-runtime-evidence\.ts/);
  assert.match(String(validation.run), /settings-smoke-summary\.json/);
  assert.match(String(validation.run), /settings-runtime-refresh-verification\.json/);
  assert.ok(stepIndex('Run clean VM first launch smoke') < validationIndex);
  const receiptIndex = stepIndex('Write exact-artifact qualification receipt');
  assert.ok(validationIndex < receiptIndex);
  assert.match(String(steps[receiptIndex].if), /steps\.settings_runtime_evidence\.outcome == 'success'/);
});

test('active release workflows fail closed on duplicate critical evidence instead of selecting the first match', () => {
  const activeWorkflows = [
    '_build-reusable.yml',
    '_release-bundle.yml',
    '_release-full-addon.yml',
    '_release-homebrew-full-publish.yml',
    '_release-standard-publish.yml',
    'full-first-install-release.yml',
    'opl-first-run-vm.yml',
  ];

  for (const workflowName of activeWorkflows) {
    const source = readWorkflow(workflowName);
    assert.doesNotMatch(source, /find[^\n]*-print -quit/, `${workflowName} still selects the first critical evidence match`);
    assert.doesNotMatch(
      source,
      /find[^\n]*\|[^\n]*head\s+-n?\s*1/,
      `${workflowName} still selects the first sorted release artifact match`,
    );
    if (!['_release-bundle.yml', '_release-homebrew-full-publish.yml'].includes(workflowName)) {
      assert.match(source, /LC_ALL=C sort/, `${workflowName} must deterministically order critical evidence matches`);
    }
  }

  assert.doesNotMatch(readWorkflow('_release-bundle.yml'), /artifact qualification receipt/);
  assert.match(readWorkflow('_release-full-addon.yml'), /must contain at most one Full build receipt/);
  assert.match(readWorkflow('_release-standard-publish.yml'), /requires exactly one publication receipt/);
  const observationalHomebrew = readWorkflow('_release-homebrew-full-publish.yml');
  assert.doesNotMatch(
    observationalHomebrew,
    /(?:standard|full)-build-receipt\.json|restore-release-checkpoint/,
  );
  assert.match(observationalHomebrew, /\[\.assets\[\] \| select\(\.digest == \$dmg\)\] \| length == 1/);
  assert.match(observationalHomebrew, /\[\.assets\[\] \| select\(\.digest == \$manifest\)\] \| length == 1/);
  assert.match(
    observationalHomebrew,
    /\[\.assets\[\] \| select\(\.name == "opl-app-component-manifest\.json"\)\] \| length == 1/,
  );
  assert.match(readWorkflow('opl-first-run-vm.yml'), /must appear at most once/);
});

test('release helpers reject duplicate mounted Apps, promotion receipts, and packaged runtime executables', () => {
  const installer = fs.readFileSync(path.join(process.cwd(), 'install.sh'), 'utf8');
  const promotion = fs.readFileSync(
    path.join(process.cwd(), 'scripts', 'framework-release-promotion-step.sh'),
    'utf8',
  );
  const runtimeLayers = fs.readFileSync(
    path.join(process.cwd(), 'scripts', 'build-full-first-install-package', 'runtime-layers.ts'),
    'utf8',
  );
  const runtimeWrappers = fs.readFileSync(
    path.join(process.cwd(), 'scripts', 'full-first-install-runtime-wrappers.ts'),
    'utf8',
  );
  const codexCarrierValidator = fs.readFileSync(
    path.join(
      process.cwd(),
      'scripts',
      'validate-active-shell',
      'release-full-first-install-payload-validator.ts',
    ),
    'utf8',
  );

  for (const source of [installer, promotion, runtimeLayers, runtimeWrappers]) {
    assert.doesNotMatch(source, /find[^\n]*(?:-print -quit|\|[^\n]*head\s+-n?\s*1)/);
    assert.match(source, /LC_ALL=C sort/);
  }
  assert.match(installer, /Mounted DMG must contain exactly one App bundle/);
  assert.match(promotion, /must contain exactly one JSON receipt/);
  assert.match(runtimeLayers, /multiple executable temporal binaries/);
  assert.match(runtimeWrappers, /multiple Python bin roots/);
  assert.match(codexCarrierValidator, /resolver_env !== 'OPL_CODEX_BIN'/);
  assert.match(
    codexCarrierValidator,
    /version_source !== 'OPL Codex-only projection derived from AionCore producer manifest'/,
  );
  assert.match(
    codexCarrierValidator,
    /projection_schema !== 'opl_aioncore_managed_resources_projection\.v1'/,
  );
  assert.match(
    codexCarrierValidator,
    /\['bin\/codex', 'bin\/rg', 'vendor\/codex', '\.runtime-cache\/codex-cli'\]/,
  );
  for (const source of [runtimeLayers, runtimeWrappers]) {
    assert.doesNotMatch(
      source,
      /writeCodexCliWrapper|createCodexCliArchive|sources\.codexBinaries|vendor\/codex|\.runtime-cache\/codex-cli/,
    );
  }
});

test('first-run VM uploads critical diagnostics only on a real failure path', () => {
  const workflow = parseWorkflow('opl-first-run-vm.yml');
  const steps = workflow.jobs['clean-vm-first-run'].steps as Array<Record<string, any>>;
  const step = (name: string) => {
    const found = steps.find((candidate) => candidate.name === name);
    assert.ok(found, `clean-vm-first-run is missing ${name}`);
    return found;
  };

  assert.equal(step('Write first-run VM critical diagnostics').if, '${{ always() }}');
  assert.equal(step('Upload first-run VM critical diagnostics').if, '${{ failure() }}');
  assert.equal(step('Upload first-run VM artifacts').if, '${{ always() }}');
});

test('first-run VM prefetches frozen Codex install assets from a physical script', () => {
  const workflow = parseWorkflow('opl-first-run-vm.yml');
  const steps = workflow.jobs['clean-vm-first-run'].steps as Array<Record<string, any>>;
  const prefetch = steps.find(
    (step) => step.name === 'Prefetch Codex package install assets',
  );
  assert.ok(prefetch);

  const run = String(prefetch.run);
  assert.equal(run, 'node scripts/prefetch-codex-package-install-assets.mjs');
  assert.doesNotMatch(run, /node\s+<<|<<['"]?NODE/);

  const scriptPath = path.join(
    process.cwd(),
    'scripts',
    'prefetch-codex-package-install-assets.mjs',
  );
  const script = fs.readFileSync(scriptPath, 'utf8');
  const syntax = spawnSync(process.execPath, ['--check', scriptPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);

  for (const token of [
    'qualification_runtime?.codex_cli',
    'frozen.npm_integrity',
    'frozen.tarball_url',
    'frozen.tarball_sha256',
    'frozen.platform.npm_integrity',
    'frozen.platform.tarball_url',
    'frozen.platform.tarball_sha256',
    'timeout: options.timeout || 120000',
    'timeout: 240000',
    'timeout: 960000',
    'timeout: 300000',
    'CODEX_CACHE_RESTORE_HIT',
    'CODEX_CACHE_RESTORE_PRIMARY_KEY',
    'CODEX_CACHE_RESTORE_MATCHED_KEY',
    'cache_save_required',
  ]) {
    assert.ok(script.includes(token), `prefetch script is missing preserved behavior: ${token}`);
  }
});

test('first-run VM records wrapper diagnostics from one offline-testable physical script', () => {
  const wrapper = workflowStep(
    'opl-first-run-vm.yml',
    'clean-vm-first-run',
    'Record first-run VM wrapper diagnostics',
  );
  const run = String(wrapper.run);
  assert.match(
    run,
    /node scripts\/record-first-run-vm-wrapper-diagnostics\.mjs 2>&1 \| tee "\$PREFLIGHT_LOG"/,
  );
  assert.doesNotMatch(run, /node\s+<<|<<['"]?NODE/);

  const scriptPath = path.join(
    process.cwd(),
    'scripts',
    'record-first-run-vm-wrapper-diagnostics.mjs',
  );
  const script = fs.readFileSync(scriptPath, 'utf8');
  const syntax = spawnSync(process.execPath, ['--check', scriptPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  for (const token of [
    'schema_version: 1',
    "purpose: 'first_run_vm_app_wrapper_diagnostics'",
    'timeout: 120000',
    "diagnosticScope === 'bootstrap_only'",
    "truth_boundary: 'install_asset_cache_preseed_not_app_readiness_truth_or_owner_receipt'",
    "console.error('Required first-run VM wrapper diagnostics failed:')",
  ]) {
    assert.ok(script.includes(token), `wrapper diagnostics script is missing preserved behavior: ${token}`);
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-wrapper-diagnostics-'));
  try {
    const fakeBin = path.join(root, 'bin');
    const artifactRoot = path.join(root, 'artifacts', 'opl-first-run-vm');
    fs.mkdirSync(fakeBin, { recursive: true });
    fs.mkdirSync(artifactRoot, { recursive: true });
    fs.writeFileSync(path.join(fakeBin, 'npm'), `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = "--version" ]; then
  printf '10.9.2\\n'
elif [ "\${1:-}" = "config" ] && [ "\${2:-}" = "get" ] && [ "\${3:-}" = "registry" ]; then
  printf 'https://registry.example.invalid/\\n'
else
  exit 98
fi
`);
    fs.writeFileSync(path.join(fakeBin, 'curl'), `#!/usr/bin/env bash
set -euo pipefail
printf 'curl 8.7.1 fixture\\n'
`);
    fs.chmodSync(path.join(fakeBin, 'npm'), 0o755);
    fs.chmodSync(path.join(fakeBin, 'curl'), 0o755);

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH || ''}`,
        DIAGNOSTIC_SCOPE: 'bootstrap_only',
        PACKAGE_PROFILE: 'standard',
        INSTALL_MODE: 'dmg',
        RUNTIME_PROFILE: 'standard',
        SOURCE_VM: 'fixture-vm',
        GUEST_USER: 'runner',
        SSH_KEY_CONFIGURED: 'true',
        RUNNER_LABELS: '["self-hosted","macOS","opl-gui-vm"]',
        NO_GRAPHICS: 'false',
        KEEP_VM: 'false',
        GUIDE_SCREENSHOTS: 'false',
        RUN_TIMEOUT_MS: '900000',
        SMOKE_TIMEOUT_MS: '600000',
        CODEX_INSTALL_PHASE_TIMEOUT_MS: '480000',
        CODEX_READINESS_PHASE_TIMEOUT_MS: '180000',
        GITHUB_RUN_ID: '424242',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_REPOSITORY: 'gaofeng21cn/one-person-lab-app',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: 'a'.repeat(40),
      },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const diagnostics = JSON.parse(
      fs.readFileSync(path.join(artifactRoot, 'app-wrapper-diagnostics.json'), 'utf8'),
    );
    assert.equal(diagnostics.schema_version, 1);
    assert.equal(diagnostics.purpose, 'first_run_vm_app_wrapper_diagnostics');
    assert.equal(diagnostics.release_inputs.diagnostic_scope, 'bootstrap_only');
    assert.equal(diagnostics.host.node.exit_code, 0);
    assert.equal(diagnostics.host.npm.exit_code, 0);
    assert.equal(diagnostics.host.curl.exit_code, 0);
    assert.equal(diagnostics.host.npm_registry.stdout, 'https://registry.example.invalid/');
    assert.equal(diagnostics.host.codex_package_preflight.skipped, true);
    assert.equal(diagnostics.host.codex_package_metadata.skipped, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex install asset prefetch preserves frozen identities and content-addressed outputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-prefetch-'));
  try {
    const fakeBin = path.join(root, 'bin');
    const artifactRoot = path.join(root, 'artifacts', 'opl-first-run-vm');
    const cohortRoot = path.join(root, 'artifacts', 'release-cohort');
    fs.mkdirSync(fakeBin, { recursive: true });
    fs.mkdirSync(path.join(artifactRoot, 'codex-npm-cache'), { recursive: true });
    fs.mkdirSync(path.join(artifactRoot, 'codex-package-tarballs'), { recursive: true });
    fs.mkdirSync(cohortRoot, { recursive: true });

    const rootTarball = 'frozen root Codex package\n';
    const platformTarball = 'frozen macOS Codex package\n';
    const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
    const frozen = {
      version: '1.2.3',
      npm_integrity: 'sha512-root-fixture',
      tarball_url: 'https://registry.example/openai-codex.tgz',
      tarball_sha256: digest(rootTarball),
      platform: {
        version: '1.2.4',
        npm_integrity: 'sha512-platform-fixture',
        tarball_url: 'https://registry.example/openai-codex-darwin-arm64.tgz',
        tarball_sha256: digest(platformTarball),
      },
    };
    fs.writeFileSync(
      path.join(cohortRoot, 'opl-build-cohort.json'),
      `${JSON.stringify({
        qualification_runtime: { codex_cli: frozen },
        digests: { qualification_input_manifest_sha256: `sha256:${'a'.repeat(64)}` },
      })}\n`,
    );

    const fakeNpm = path.join(fakeBin, 'npm');
    fs.writeFileSync(fakeNpm, `#!/usr/bin/env bash
set -euo pipefail
case "\${1:-}" in
  config)
    printf '%s\\n' 'https://registry.example/'
    ;;
  view)
    if [ "\${2:-}" = '@openai/codex@1.2.3' ]; then
      printf '%s\\n' '{"version":"1.2.3","dist.tarball":"https://registry.example/openai-codex.tgz","dist.integrity":"sha512-root-fixture"}'
    else
      printf '%s\\n' '{"name":"@openai/codex","version":"1.2.4","dist.tarball":"https://registry.example/openai-codex-darwin-arm64.tgz","dist.integrity":"sha512-platform-fixture"}'
    fi
    ;;
  cache)
    ;;
  *)
    exit 2
    ;;
esac
`);
    fs.chmodSync(fakeNpm, 0o755);

    const fakeCurl = path.join(fakeBin, 'curl');
    fs.writeFileSync(fakeCurl, `#!/usr/bin/env bash
set -euo pipefail
output=''
previous=''
for argument in "$@"; do
  if [ "$previous" = '-o' ]; then output="$argument"; fi
  previous="$argument"
done
url="\${!#}"
case "$url" in
  https://registry.example/@openai%2fcodex)
    printf '%s\\n' '{}' > "$output"
    ;;
  https://registry.example/openai-codex.tgz)
    printf '%b' '${rootTarball.replaceAll('\n', '\\n')}' > "$output"
    ;;
  https://registry.example/openai-codex-darwin-arm64.tgz)
    printf '%b' '${platformTarball.replaceAll('\n', '\\n')}' > "$output"
    ;;
  *)
    exit 2
    ;;
esac
printf '200'
`);
    fs.chmodSync(fakeCurl, 0o755);

    const output = path.join(root, 'github-output.txt');
    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), 'scripts', 'prefetch-codex-package-install-assets.mjs')],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH}`,
          GITHUB_OUTPUT: output,
          CACHE_KEY_PREFIX: 'fixture-cache',
          CODEX_CACHE_RESTORE_HIT: 'false',
          CODEX_CACHE_RESTORE_PRIMARY_KEY: 'fixture-primary',
          CODEX_CACHE_RESTORE_MATCHED_KEY: '',
        },
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const preflight = JSON.parse(
      fs.readFileSync(path.join(artifactRoot, 'codex-package-preflight.json'), 'utf8'),
    );
    assert.equal(preflight.status, 'ok');
    assert.deepEqual(preflight.package.frozen_identity, frozen);
    assert.equal(preflight.tarball.sha256, frozen.tarball_sha256);
    assert.equal(preflight.platform_tarball.sha256, frozen.platform.tarball_sha256);
    assert.equal(preflight.cache.write_scope, 'refs/heads/main_only');
    assert.equal(preflight.cache.save_required, true);
    assert.match(
      fs.readFileSync(output, 'utf8'),
      new RegExp(`cache_key=fixture-cache-1\\.2\\.3-${frozen.tarball_sha256}-${frozen.platform.tarball_sha256}`),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('deadline failures never authorize Framework reconcile without persisted unknown state', () => {
  const standard = readWorkflow('_release-standard-publish.yml');
  const full = readWorkflow('_release-full-addon.yml');
  assert.match(standard, /bounded_read_only_inspect_only_no_framework_reconcile/);
  assert.match(standard, /framework_reconcile_authorized:false/);
  assert.match(full, /framework_reconcile_authorized=false/);
  assert.match(full, /--argjson framework_reconcile_authorized "\$framework_reconcile_authorized"/);
  assert.match(standard, /push_count:0/);
  assert.match(standard, /bounded_read_only_latest_readback_only_no_second_patch_no_framework_reconcile/);
  assert.match(standard, /--latest-admission standard-latest-admission\.json/);
});

test('Full append admission binds the GitHub run id as a jq argument', () => {
  const full = readWorkflow('_release-full-addon.yml');
  const admissionStart = full.indexOf('      - name: Admit one-shot Full append operation');
  const admissionEnd = full.indexOf('      - name: Upload Full admission evidence', admissionStart);
  assert.ok(admissionStart >= 0 && admissionEnd > admissionStart);
  const admission = full.slice(admissionStart, admissionEnd);
  assert.match(admission, /--arg run_id "\$GITHUB_RUN_ID"/);
  assert.match(admission, /run_id:\$run_id/);
  assert.doesNotMatch(admission, /run_id:\$GITHUB_RUN_ID/);
});

test('Full append admission uses runner-portable static checks', () => {
  const full = readWorkflow('_release-full-addon.yml');
  const admissionStart = full.indexOf('      - name: Validate locked App dependencies and Full control-plane bindings');
  const admissionEnd = full.indexOf('      - name: Admit one-shot Full append operation', admissionStart);
  assert.ok(admissionStart >= 0 && admissionEnd > admissionStart);
  const admission = full.slice(admissionStart, admissionEnd);
  assert.equal((admission.match(/grep -E -q/g) ?? []).length, 3);
  assert.doesNotMatch(admission, /\brg\s+-q\b/);
  assert.match(admission, /working-directory: release-executor/);
  assert.match(admission, /--gui-root "\\\$GITHUB_WORKSPACE\/one-person-lab-app\/shells\/aionui"/);
  assert.match(admission, /--out-dir "\\\$GITHUB_WORKSPACE\/one-person-lab-app\/dist\/opl-full-release"/);
});
