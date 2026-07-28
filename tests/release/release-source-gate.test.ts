import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  buildReleaseSourceGateReport,
  parseReleaseSourceGateArgs,
  type CommandRunner,
  type ReleaseSourceGateOptions,
} from '../../scripts/validate-release-source-gate.ts';

const repoRoot = '/tmp/opl-app';
const shellRoot = path.join(repoRoot, 'shells', 'aionui');
const frameworkRoot = '/tmp/one-person-lab';
const repoLocalFrameworkRoot = path.join(repoRoot, 'one-person-lab');
const appHead = '0123456789abcdef0123456789abcdef01234567';
const shellHead = 'abcdef0123456789abcdef0123456789abcdef01';
const frameworkHead = '789abcdef0123456789abcdef0123456789abcde';
const managedUpdateProviders = {
  opl_base: 'runtime_substrate',
  opl_app: 'installation_carrier',
  opl_packages: 'capability_packages',
};

function readSourceJson(candidatePath: string, shellName = 'one-person-lab-aion-shell'): any {
  if (candidatePath.endsWith('package.json')) return { name: shellName };
  if (candidatePath.endsWith('app-release-channel.json')) {
    return {
      managed_update_plane: {
        software_lifecycle: {
          public_component_keys: Object.keys(managedUpdateProviders),
          objects: Object.fromEntries(Object.entries(managedUpdateProviders).map(([id, provider_id]) => [id, { provider_id }])),
        },
      },
    };
  }
  if (candidatePath.endsWith('managed-update-kernel-contract.json')) {
    return {
      providers: Object.entries(managedUpdateProviders).map(([lifecycle_owner, provider_id]) => ({
        lifecycle_owner,
        provider_id,
      })),
    };
  }
  throw new Error(`unexpected JSON path: ${candidatePath}`);
}

function options(overrides: Partial<ReleaseSourceGateOptions> = {}): ReleaseSourceGateOptions {
  return {
    version: '26.6.30',
    operationFingerprint: null,
    expectedAppHead: appHead,
    shellRef: 'main',
    frameworkRef: 'main',
    requireShellFormat: true,
    runShellTests: true,
    repoRoot,
    shellRoot,
    frameworkRoot,
    output: '',
    json: true,
    ...overrides,
  };
}

test('release source gate accepts explicit isolated source checkout roots', () => {
  const parsed = parseReleaseSourceGateArgs([
    '--version',
    '26.6.30',
    '--app-ref',
    appHead,
    '--shell-root',
    '/private/tmp/release-shell',
    '--framework-root',
    '/private/tmp/release-framework',
  ]);

  assert.equal(parsed.shellRoot, '/private/tmp/release-shell');
  assert.equal(parsed.frameworkRoot, '/private/tmp/release-framework');
});

function runner(overrides: Record<string, { status: number; stdout?: string; stderr?: string }> = {}): CommandRunner {
  return (command, args, commandOptions) => {
    const key = `${commandOptions.cwd} $ ${command} ${args.join(' ')}`;
    const result = overrides[key];
    if (result) {
      return {
        status: result.status,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      };
    }
    if (command === 'git' && args.join(' ') === 'rev-parse HEAD' && commandOptions.cwd === repoRoot) {
      return { status: 0, stdout: `${appHead}\n`, stderr: '' };
    }
    if (command === 'git' && args.join(' ') === 'rev-parse --show-toplevel' && commandOptions.cwd === repoRoot) {
      return { status: 0, stdout: `${repoRoot}\n`, stderr: '' };
    }
    if (command === 'git' && args.join(' ') === 'remote get-url origin' && commandOptions.cwd === repoRoot) {
      return { status: 0, stdout: 'https://github.com/gaofeng21cn/one-person-lab-app.git\n', stderr: '' };
    }
    if (
      command === 'git'
      && args.join(' ') === 'ls-remote --heads origin refs/heads/main'
      && commandOptions.cwd === repoRoot
    ) {
      return { status: 0, stdout: `${appHead}\trefs/heads/main\n`, stderr: '' };
    }
    if (
      command === 'git'
      && args[0] === 'merge-base'
      && args[1] === '--is-ancestor'
      && args[2] === appHead
      && commandOptions.cwd === repoRoot
    ) {
      return { status: 0, stdout: '', stderr: '' };
    }
    if (command === 'git' && args.join(' ') === 'status --porcelain --untracked-files=normal' && commandOptions.cwd === repoRoot) {
      return { status: 0, stdout: '', stderr: '' };
    }
    if (command === 'npm' && args.join(' ') === 'run validate:release-boundary' && commandOptions.cwd === repoRoot) {
      return { status: 0, stdout: 'release boundary ok\n', stderr: '' };
    }
    if (
      command === process.execPath
      && args.join(' ') === `--experimental-strip-types scripts/validate-shell-product-profile-consumer.ts --shell-root ${shellRoot} --expected-shell-sha ${shellHead}`
      && commandOptions.cwd === repoRoot
    ) {
      return { status: 0, stdout: 'profile consumer ok\n', stderr: '' };
    }
    if (
      command === 'git'
      && args[0] === 'rev-parse'
      && args[1] === '--verify'
      && args[2] === '--quiet'
      && commandOptions.cwd === shellRoot
    ) {
      return { status: 0, stdout: `${shellHead}\n`, stderr: '' };
    }
    if (command === 'git' && args.join(' ') === 'rev-parse HEAD' && commandOptions.cwd === shellRoot) {
      return { status: 0, stdout: `${shellHead}\n`, stderr: '' };
    }
    if (
      command === 'git'
      && args[0] === 'rev-parse'
      && args[1] === '--verify'
      && args[2] === '--quiet'
      && commandOptions.cwd === frameworkRoot
    ) {
      return { status: 0, stdout: `${frameworkHead}\n`, stderr: '' };
    }
    if (command === 'git' && args.join(' ') === 'rev-parse HEAD' && commandOptions.cwd === frameworkRoot) {
      return { status: 0, stdout: `${frameworkHead}\n`, stderr: '' };
    }
    if (command === 'git' && args.join(' ') === 'rev-parse HEAD' && commandOptions.cwd === repoLocalFrameworkRoot) {
      return { status: 0, stdout: `${frameworkHead}\n`, stderr: '' };
    }
    if (command === 'bun' && args.join(' ') === 'run format:check' && commandOptions.cwd === shellRoot) {
      return { status: 0, stdout: 'format ok\n', stderr: '' };
    }
    if (
      command === process.execPath
      && args.join(' ') === '--experimental-strip-types scripts/run-active-shell-tests.ts --project all --chunk-size 8 --max-workers 2'
      && commandOptions.cwd === repoRoot
    ) {
      return { status: 0, stdout: 'active shell tests ok\n', stderr: '' };
    }
    return { status: 1, stdout: '', stderr: `unexpected command: ${key}` };
  };
}

function checkStatus(report: ReturnType<typeof buildReleaseSourceGateReport>, id: string) {
  const check = report.checks.find((candidate) => candidate.id === id);
  assert.ok(check, `missing check ${id}`);
  return check.status;
}

function reportFor(overrides: Partial<ReleaseSourceGateOptions> = {}) {
  return buildReleaseSourceGateReport(
    options(overrides),
    runner(),
    '2026-06-30T00:00:00.000Z',
    {
      variables: {},
      pathExists: (candidatePath) => candidatePath === shellRoot || candidatePath === frameworkRoot,
      readJson: (candidatePath) => readSourceJson(candidatePath),
    },
  );
}

test('release source gate fails stale expected App HEAD before expensive release work', () => {
  const calls: string[] = [];
  const baseRunner = runner();
  const report = buildReleaseSourceGateReport(
    options({ expectedAppHead: 'fedcba9876543210fedcba9876543210fedcba98' }),
    (command, args, commandOptions) => {
      calls.push(`${command} ${args.join(' ')}`);
      return baseRunner(command, args, commandOptions);
    },
    '2026-06-30T00:00:00.000Z',
    {
      variables: {},
      pathExists: (candidatePath) => candidatePath === shellRoot || candidatePath === frameworkRoot,
      readJson: (candidatePath) => readSourceJson(candidatePath),
    },
  );

  assert.equal(report.status, 'failed');
  assert.equal(report.admission.status, 'blocked');
  assert.equal(report.typed_blocker?.next_action, 'repair_pre_admission');
  assert.equal(checkStatus(report, 'expected_app_head'), 'failed');
  assert.equal(checkStatus(report, 'app_worktree_clean'), 'passed');
  assert.equal(checkStatus(report, 'active_shell_ref_resolved'), 'passed');
  assert.equal(checkStatus(report, 'framework_ref_resolved'), 'passed');
  assert.equal(calls.some((call) => call === 'npm run validate:release-boundary'), false);
  assert.equal(calls.some((call) => call === 'bun run format:check'), false);
  assert.equal(calls.some((call) => call.includes('run-active-shell-tests.ts')), false);
});

test('release source gate rejects an abbreviated expected App SHA', () => {
  const report = reportFor({ expectedAppHead: appHead.slice(0, 12) });

  assert.equal(report.status, 'failed');
  assert.equal(report.admission.status, 'blocked');
  assert.equal(checkStatus(report, 'expected_app_head'), 'failed');
  assert.equal(checkStatus(report, 'immutable_cohort_identity'), 'failed');
  assert.equal(report.admission.immutable_cohort, null);
});

test('release source gate keeps a frozen cohort valid when live origin/main advances but retains it', () => {
  const remoteMain = 'f'.repeat(40);
  const calls: string[] = [];
  const baseRunner = runner({
    [`${repoRoot} $ git ls-remote --heads origin refs/heads/main`]: {
      status: 0,
      stdout: `${remoteMain}\trefs/heads/main\n`,
    },
    [`${repoRoot} $ git merge-base --is-ancestor ${appHead} ${remoteMain}`]: {
      status: 0,
    },
  });
  const report = buildReleaseSourceGateReport(
    options(),
    (command, args, commandOptions) => {
      calls.push(`${command} ${args.join(' ')}`);
      return baseRunner(command, args, commandOptions);
    },
    '2026-06-30T00:00:00.000Z',
    {
      variables: {},
      pathExists: (candidatePath) => candidatePath === shellRoot || candidatePath === frameworkRoot,
      readJson: (candidatePath) => readSourceJson(candidatePath),
    },
  );

  assert.equal(report.status, 'passed');
  assert.equal(report.admission.status, 'passed');
  assert.equal(checkStatus(report, 'app_remote_main_resolved'), 'passed');
  assert.equal(checkStatus(report, 'app_frozen_commit_reachable'), 'passed');
  assert.equal(report.typed_blocker, null);
});

test('release source gate rejects a shell checkout that differs from its resolved cohort ref', () => {
  const report = buildReleaseSourceGateReport(
    options(),
    runner({
      [`${shellRoot} $ git rev-parse HEAD`]: {
        status: 0,
        stdout: `${'e'.repeat(40)}\n`,
      },
    }),
    '2026-06-30T00:00:00.000Z',
    {
      variables: {},
      pathExists: (candidatePath) => candidatePath === shellRoot || candidatePath === frameworkRoot,
      readJson: (candidatePath) => readSourceJson(candidatePath),
    },
  );

  assert.equal(report.status, 'failed');
  assert.equal(report.admission.status, 'blocked');
  assert.equal(checkStatus(report, 'active_shell_ref_resolved'), 'passed');
  assert.equal(checkStatus(report, 'active_shell_checkout_identity'), 'failed');
  assert.equal(report.admission.immutable_cohort, null);
});

test('release source gate rejects environment injection before boundary execution', () => {
  const calls: string[] = [];
  const baseRunner = runner();
  const report = buildReleaseSourceGateReport(
    options(),
    (command, args, commandOptions) => {
      calls.push(`${command} ${args.join(' ')}`);
      return baseRunner(command, args, commandOptions);
    },
    '2026-06-30T00:00:00.000Z',
    {
      variables: { NODE_OPTIONS: '--require /tmp/injected.js' },
      pathExists: (candidatePath) => candidatePath === shellRoot || candidatePath === frameworkRoot,
      readJson: (candidatePath) => readSourceJson(candidatePath),
    },
  );

  assert.equal(report.status, 'failed');
  assert.equal(checkStatus(report, 'release_environment_whitelist'), 'failed');
  assert.match(report.checks.find((check) => check.id === 'release_environment_whitelist')?.message ?? '', /NODE_OPTIONS/);
  assert.equal(report.typed_blocker?.next_action, 'repair_pre_admission');
  assert.equal(calls.some((call) => call.startsWith('npm ') || call.startsWith('bun ')), false);
  assert.equal(calls.some((call) => call.includes('run-active-shell-tests.ts')), false);
});

test('release source gate strips ambient controller SHA from required gate commands', () => {
  let requiredGateEnvironment: NodeJS.ProcessEnv | undefined;
  const baseRunner = runner();
  const report = buildReleaseSourceGateReport(
    options(),
    (command, args, commandOptions) => {
      if (command === 'npm' && args.join(' ') === 'run validate:release-boundary') {
        requiredGateEnvironment = commandOptions.env;
      }
      return baseRunner(command, args, commandOptions);
    },
    '2026-06-30T00:00:00.000Z',
    {
      variables: {
        GITHUB_REPOSITORY: 'gaofeng21cn/one-person-lab-app',
        GITHUB_SHA: 'c'.repeat(40),
        PATH: '/usr/bin:/bin',
      },
      pathExists: (candidatePath) => candidatePath === shellRoot || candidatePath === frameworkRoot,
      readJson: (candidatePath) => readSourceJson(candidatePath),
    },
  );

  assert.equal(report.status, 'passed');
  assert.equal(checkStatus(report, 'release_environment_whitelist'), 'passed');
  assert.equal(requiredGateEnvironment?.GITHUB_SHA, undefined);
  assert.equal(requiredGateEnvironment?.OPL_EXPECTED_APP_HEAD, appHead);
  assert.equal(requiredGateEnvironment?.OPL_SHELL_REF, shellHead);
  assert.equal(requiredGateEnvironment?.OPL_FRAMEWORK_REF, frameworkHead);
});

test('release source gate passes for clean canonical main and an immutable source cohort', () => {
  const report = reportFor({ expectedAppHead: appHead, shellRef: 'main' });

  assert.equal(report.status, 'passed');
  assert.equal(report.version, '26.6.30');
  assert.equal(report.app_head, appHead);
  assert.equal(report.shell_sha, shellHead);
  assert.equal(report.framework_sha, frameworkHead);
  assert.equal(checkStatus(report, 'expected_app_head'), 'passed');
  assert.equal(checkStatus(report, 'app_worktree_clean'), 'passed');
  assert.equal(checkStatus(report, 'app_frozen_commit_reachable'), 'passed');
  assert.equal(checkStatus(report, 'immutable_cohort_identity'), 'passed');
  assert.equal(checkStatus(report, 'app_release_boundary_contract'), 'passed');
  assert.equal(checkStatus(report, 'shell_product_profile_consumer'), 'passed');
  assert.equal(checkStatus(report, 'active_shell_ref_resolved'), 'passed');
  assert.equal(checkStatus(report, 'active_shell_type'), 'passed');
  assert.equal(checkStatus(report, 'framework_ref_resolved'), 'passed');
  assert.equal(checkStatus(report, 'managed_update_provider_contract_aligned'), 'passed');
  assert.equal(report.admission.status, 'passed');
  assert.deepEqual(report.admission.immutable_cohort, {
    version: '26.6.30',
    operation_fingerprint: null,
    app_sha: appHead,
    shell_sha: shellHead,
    framework_sha: frameworkHead,
  });
  assert.equal(report.typed_blocker, null);
});

test('release source gate rejects managed update provider contract drift before packaging', () => {
  const report = buildReleaseSourceGateReport(
    options(),
    runner(),
    '2026-06-30T00:00:00.000Z',
    {
      variables: {},
      pathExists: (candidatePath) => candidatePath === shellRoot || candidatePath === frameworkRoot,
      readJson: (candidatePath) => {
        const value = readSourceJson(candidatePath);
        if (candidatePath.endsWith('managed-update-kernel-contract.json')) {
          value.providers[0].provider_id = 'drifted-provider';
        }
        return value;
      },
    },
  );

  assert.equal(report.status, 'failed');
  assert.equal(checkStatus(report, 'managed_update_provider_contract_aligned'), 'failed');
});

test('release source gate blocks pre-admission when required shell format is not enabled', () => {
  const policyOnly = reportFor({ requireShellFormat: false });
  const requiredGate = policyOnly.required_gates.find((gate) => gate.id === 'active_shell_format_check');
  assert.equal(policyOnly.status, 'failed');
  assert.equal(policyOnly.admission.status, 'blocked');
  assert.equal(policyOnly.admission.next_action, 'repair_pre_admission');
  assert.equal(policyOnly.typed_blocker?.phase, 'pre_admission');
  assert.equal(policyOnly.typed_blocker?.next_action, 'repair_pre_admission');
  assert.equal(requiredGate?.required, true);
  assert.equal(requiredGate?.command, 'bun run format:check');
  assert.equal(requiredGate?.cwd, shellRoot);
  assert.equal(requiredGate?.executed, false);
  assert.equal(checkStatus(policyOnly, 'active_shell_format_pre_admission'), 'blocked');
  assert.equal(checkStatus(policyOnly, 'active_shell_format_check'), 'blocked');

  const executed = reportFor({ requireShellFormat: true });
  assert.equal(executed.status, 'passed');
  assert.equal(executed.required_gates.find((gate) => gate.id === 'active_shell_format_check')?.executed, true);
  assert.equal(checkStatus(executed, 'active_shell_format_check'), 'passed');
});

test('release source gate blocks pre-admission when required shell node/dom tests are not enabled', () => {
  const policyOnly = reportFor({ runShellTests: false });
  const requiredGate = policyOnly.required_gates.find((gate) => gate.id === 'active_shell_node_dom_tests');
  assert.equal(policyOnly.status, 'failed');
  assert.equal(policyOnly.admission.status, 'blocked');
  assert.equal(policyOnly.typed_blocker?.next_action, 'repair_pre_admission');
  assert.equal(requiredGate?.required, true);
  assert.equal(
    requiredGate?.command,
    'node --experimental-strip-types scripts/run-active-shell-tests.ts --project all --chunk-size 8 --max-workers 2',
  );
  assert.equal(requiredGate?.cwd, repoRoot);
  assert.equal(requiredGate?.executed, false);
  assert.equal(checkStatus(policyOnly, 'active_shell_node_dom_pre_admission'), 'blocked');
  assert.equal(checkStatus(policyOnly, 'active_shell_node_dom_tests'), 'blocked');

  const executed = reportFor({ runShellTests: true });
  assert.equal(executed.status, 'passed');
  assert.equal(executed.required_gates.find((gate) => gate.id === 'active_shell_node_dom_tests')?.executed, true);
  assert.equal(checkStatus(executed, 'active_shell_node_dom_tests'), 'passed');
});

test('release source gate stops at the first required gate failure', () => {
  const calls: string[] = [];
  const baseRunner = runner({
    [`${repoRoot} $ npm run validate:release-boundary`]: {
      status: 1,
      stderr: 'release contract drift\n',
    },
  });
  const report = buildReleaseSourceGateReport(
    options(),
    (command, args, commandOptions) => {
      calls.push(`${command} ${args.join(' ')}`);
      return baseRunner(command, args, commandOptions);
    },
    '2026-06-30T00:00:00.000Z',
    {
      variables: {},
      pathExists: (candidatePath) => candidatePath === shellRoot || candidatePath === frameworkRoot,
      readJson: (candidatePath) => readSourceJson(candidatePath),
    },
  );

  assert.equal(report.status, 'failed');
  assert.equal(report.admission.status, 'passed');
  assert.equal(checkStatus(report, 'app_release_boundary_contract'), 'failed');
  assert.equal(checkStatus(report, 'active_shell_format_check'), 'blocked');
  assert.equal(checkStatus(report, 'active_shell_node_dom_tests'), 'blocked');
  assert.equal(checkStatus(report, 'shell_product_profile_consumer'), 'blocked');
  assert.equal(report.typed_blocker?.phase, 'required_gate_execution');
  assert.equal(report.typed_blocker?.next_action, 'repair_source_gate');
  assert.equal(calls.some((call) => call === 'bun run format:check'), false);
  assert.equal(calls.some((call) => call.includes('run-active-shell-tests.ts')), false);
});

test('release source gate stops before Shell-wide gates when current App profile fails the exact consumer', () => {
  const calls: string[] = [];
  const consumerCommand = `${repoRoot} $ ${process.execPath} --experimental-strip-types scripts/validate-shell-product-profile-consumer.ts --shell-root ${shellRoot} --expected-shell-sha ${shellHead}`;
  const baseRunner = runner({
    [consumerCommand]: {
      status: 1,
      stderr: 'gui.home.home_agent_shortcuts must be a non-empty array\n',
    },
  });
  const report = buildReleaseSourceGateReport(
    options(),
    (command, args, commandOptions) => {
      calls.push(`${command} ${args.join(' ')}`);
      return baseRunner(command, args, commandOptions);
    },
    '2026-06-30T00:00:00.000Z',
    {
      variables: {},
      pathExists: (candidatePath) => candidatePath === shellRoot || candidatePath === frameworkRoot,
      readJson: (candidatePath) => readSourceJson(candidatePath),
    },
  );

  assert.equal(report.status, 'failed');
  assert.equal(checkStatus(report, 'shell_product_profile_consumer'), 'failed');
  assert.match(
    report.checks.find((check) => check.id === 'shell_product_profile_consumer')?.message ?? '',
    /home_agent_shortcuts/,
  );
  assert.equal(checkStatus(report, 'active_shell_format_check'), 'blocked');
  assert.equal(checkStatus(report, 'active_shell_node_dom_tests'), 'blocked');
  assert.equal(calls.some((call) => call === 'bun run format:check'), false);
  assert.equal(calls.some((call) => call.includes('run-active-shell-tests.ts')), false);
  assert.equal(report.typed_blocker?.next_action, 'repair_source_gate');
});

test('release source gate fails active shell node/dom regressions before expensive release work', () => {
  const report = buildReleaseSourceGateReport(
    options({ runShellTests: true }),
    runner({
      [`${repoRoot} $ ${process.execPath} --experimental-strip-types scripts/run-active-shell-tests.ts --project all --chunk-size 8 --max-workers 2`]: {
        status: 1,
        stdout: 'dom chunk 10/12 failed\n',
        stderr: "TypeError: Cannot read properties of undefined (reading 'configureCodexInvoke')\n",
      },
    }),
    '2026-06-30T00:00:00.000Z',
    {
      variables: {},
      pathExists: (candidatePath) => candidatePath === shellRoot || candidatePath === frameworkRoot,
      readJson: (candidatePath) => readSourceJson(candidatePath),
    },
  );

  assert.equal(report.status, 'failed');
  assert.equal(checkStatus(report, 'active_shell_node_dom_tests'), 'failed');
  assert.match(
    report.checks.find((check) => check.id === 'active_shell_node_dom_tests')?.message ?? '',
    /configureCodexInvoke/,
  );
});

test('release source gate fails dirty App worktree before expensive release work', () => {
  const report = buildReleaseSourceGateReport(
    options(),
    runner({
      [`${repoRoot} $ git status --porcelain --untracked-files=normal`]: {
        status: 0,
        stdout: ' M .github/workflows/desktop-release.yml\n?? tmp.txt\n',
      },
    }),
    '2026-06-30T00:00:00.000Z',
    {
      variables: {},
      pathExists: (candidatePath) => candidatePath === shellRoot || candidatePath === frameworkRoot,
      readJson: (candidatePath) => readSourceJson(candidatePath),
    },
  );

  assert.equal(report.status, 'failed');
  assert.equal(checkStatus(report, 'app_worktree_clean'), 'failed');
});

test('release source gate ignores declared framework checkout inside App workspace only', () => {
  const report = buildReleaseSourceGateReport(
    options({ frameworkRoot: repoLocalFrameworkRoot }),
    runner({
      [`${repoRoot} $ git status --porcelain --untracked-files=normal`]: {
        status: 0,
        stdout: '?? one-person-lab/\n',
      },
      [`${repoLocalFrameworkRoot} $ git rev-parse --verify --quiet main^{commit}`]: {
        status: 0,
        stdout: `${frameworkHead}\n`,
      },
    }),
    '2026-06-30T00:00:00.000Z',
    {
      variables: {},
      pathExists: (candidatePath) => candidatePath === shellRoot || candidatePath === repoLocalFrameworkRoot,
      readJson: (candidatePath) => readSourceJson(candidatePath),
    },
  );

  assert.equal(report.status, 'passed');
  assert.equal(checkStatus(report, 'app_worktree_clean'), 'passed');

  const stillDirty = buildReleaseSourceGateReport(
    options({ frameworkRoot: repoLocalFrameworkRoot }),
    runner({
      [`${repoRoot} $ git status --porcelain --untracked-files=normal`]: {
        status: 0,
        stdout: '?? one-person-lab/\n M .github/workflows/desktop-release.yml\n',
      },
      [`${repoLocalFrameworkRoot} $ git rev-parse --verify --quiet main^{commit}`]: {
        status: 0,
        stdout: `${frameworkHead}\n`,
      },
    }),
    '2026-06-30T00:00:00.000Z',
    {
      variables: {},
      pathExists: (candidatePath) => candidatePath === shellRoot || candidatePath === repoLocalFrameworkRoot,
      readJson: (candidatePath) => readSourceJson(candidatePath),
    },
  );

  assert.equal(stillDirty.status, 'failed');
  assert.equal(checkStatus(stillDirty, 'app_worktree_clean'), 'failed');
  assert.match(stillDirty.checks.find((check) => check.id === 'app_worktree_clean')?.actual ?? '', /desktop-release/);

  const similarlyNamedUntracked = buildReleaseSourceGateReport(
    options({ frameworkRoot: repoLocalFrameworkRoot }),
    runner({
      [`${repoRoot} $ git status --porcelain --untracked-files=normal`]: {
        status: 0,
        stdout: '?? one-person-lab/\n?? one-person-lab-extra/\n',
      },
      [`${repoLocalFrameworkRoot} $ git rev-parse --verify --quiet main^{commit}`]: {
        status: 0,
        stdout: `${frameworkHead}\n`,
      },
    }),
    '2026-06-30T00:00:00.000Z',
    {
      variables: {},
      pathExists: (candidatePath) => candidatePath === shellRoot || candidatePath === repoLocalFrameworkRoot,
      readJson: (candidatePath) => readSourceJson(candidatePath),
    },
  );

  assert.equal(similarlyNamedUntracked.status, 'failed');
  assert.equal(checkStatus(similarlyNamedUntracked, 'app_worktree_clean'), 'failed');
  assert.match(
    similarlyNamedUntracked.checks.find((check) => check.id === 'app_worktree_clean')?.actual ?? '',
    /one-person-lab-extra/,
  );
});

test('release source gate fails unresolved framework ref and wrong shell type', () => {
  const report = buildReleaseSourceGateReport(
    options({ frameworkRef: 'missing-framework-ref' }),
    runner({
      [`${frameworkRoot} $ git rev-parse --verify --quiet missing-framework-ref^{commit}`]: { status: 1 },
      [`${frameworkRoot} $ git rev-parse --verify --quiet refs/heads/missing-framework-ref^{commit}`]: { status: 1 },
      [`${frameworkRoot} $ git rev-parse --verify --quiet refs/remotes/origin/missing-framework-ref^{commit}`]: { status: 1 },
      [`${frameworkRoot} $ git rev-parse --verify --quiet refs/tags/missing-framework-ref^{commit}`]: { status: 1 },
    }),
    '2026-06-30T00:00:00.000Z',
    {
      variables: {},
      pathExists: (candidatePath) => candidatePath === shellRoot || candidatePath === frameworkRoot,
      readJson: (candidatePath) => readSourceJson(candidatePath, 'unexpected-shell'),
    },
  );

  assert.equal(report.status, 'failed');
  assert.equal(checkStatus(report, 'active_shell_type'), 'failed');
  assert.equal(checkStatus(report, 'framework_ref_resolved'), 'failed');
});
