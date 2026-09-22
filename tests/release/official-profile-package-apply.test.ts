import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { applyOfficialProfilePackages } from '../../scripts/official-profile-package-apply.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

type PackageState = {
  installed: boolean;
  dependencies?: Array<Record<string, unknown>>;
  action?: string | null;
};

function projectedAction(packageId: string, actionId: string) {
  return {
    action_id: actionId,
    action_ref: `app_state.actions#${actionId}`,
    payload: { package_id: packageId },
    required_payload_fields: ['package_id'],
    confirmation_required: true,
  };
}

function fastState(packages: Map<string, PackageState>) {
  const entries = [...packages].map(([packageId, state]) => {
    const action = state.action ? projectedAction(packageId, state.action) : null;
    return {
      package_id: packageId,
      installed: state.installed,
      recommended_action_ref: action,
      available_actions: action ? [action] : [],
    };
  });
  const statuses = Object.fromEntries(
    [...packages]
      .filter(([, state]) => state.installed)
      .map(([packageId, state]) => [
        packageId,
        {
          package_id: packageId,
          package_dependency_readiness: {
            dependencies: state.dependencies ?? [],
          },
        },
      ])
  );
  return {
    version: 'g2',
    app_state: {
      agent_packages: {
        directory: { entries },
        status_index: { packages: statuses },
      },
    },
  };
}

function readyDependency(packageId: string) {
  return {
    package_id: packageId,
    required: true,
    installed: true,
    enabled: true,
    status: 'current',
    reasons: [],
  };
}

function missingDependency(packageId: string) {
  return {
    package_id: packageId,
    required: true,
    installed: false,
    enabled: false,
    status: 'missing',
    reasons: ['dependency_missing'],
  };
}

test('Official Profile executes only projected actions and keeps failures local to one root', () => {
  const calls: string[][] = [];
  const packages = new Map<string, PackageState>([
    [
      'mas',
      {
        installed: false,
        dependencies: [],
        action: 'carrier_install_mas',
      },
    ],
    ['mag', { installed: true, dependencies: [], action: null }],
    [
      'rca',
      {
        installed: true,
        dependencies: [missingDependency('rca-required-capability')],
        action: 'carrier_repair_rca',
      },
    ],
    ['oma', { installed: false, dependencies: [], action: null }],
    ['obf', { installed: true, dependencies: [], action: null }],
  ]);
  const result = applyOfficialProfilePackages({
    intent: 'first_install',
    rootPackageIds: ['mas', 'mag', 'rca', 'oma', 'obf'],
    runtime: {
      execute(args) {
        calls.push(args);
        if (args.join(' ') === 'app state --profile fast --json') {
          return { status: 0, stdout: JSON.stringify(fastState(packages)), stderr: '' };
        }
        if (args[0] === 'app' && args[1] === 'action' && args[2] === 'execute') {
          const actionId = args[args.indexOf('--action') + 1];
          const payload = JSON.parse(args[args.indexOf('--payload') + 1]);
          if (actionId === 'carrier_install_mas') {
            packages.set(payload.package_id, {
              installed: true,
              dependencies: [readyDependency('mas-scholar-skills')],
              action: null,
            });
          } else if (actionId === 'carrier_repair_rca') {
            packages.set(payload.package_id, {
              installed: true,
              dependencies: [readyDependency('rca-required-capability')],
              action: null,
            });
          } else {
            return { status: 1, stdout: '', stderr: `unexpected action: ${actionId}` };
          }
          return {
            status: 0,
            stdout: JSON.stringify({ version: 'g2', result: { status: 'completed' } }),
            stderr: '',
          };
        }
        return { status: 1, stdout: '', stderr: `unexpected command: ${args.join(' ')}` };
      },
    },
  });

  assert.equal(result.official_profile_package_apply.status, 'partial_failure');
  assert.deepEqual(
    result.official_profile_package_apply.items.map((item) => [item.package_id, item.status]),
    [
      ['mas', 'installed'],
      ['mag', 'already_present'],
      ['rca', 'reconciled'],
      ['oma', 'failed'],
      ['obf', 'already_present'],
    ]
  );
  assert.deepEqual(
    result.official_profile_package_apply.items
      .filter((item) => item.changed)
      .map((item) => [item.package_id, item.action, item.action_ref]),
    [
      ['mas', 'carrier_install_mas', 'app_state.actions#carrier_install_mas'],
      ['rca', 'carrier_repair_rca', 'app_state.actions#carrier_repair_rca'],
    ]
  );
  assert.equal(
    calls.some((args) => args[0] === 'packages'),
    false,
    'Official Profile must not call the private Package lifecycle surface'
  );
  assert.equal(calls.filter((args) => args.slice(0, 3).join(' ') === 'app action execute').length, 2);
  assert.deepEqual(result.official_profile_package_apply.projection_boundary, {
    state_source: 'opl app state --profile fast --json',
    action_source: 'directory.entries[].recommended_action_ref+available_actions[]',
    action_executor: 'opl app action execute --action <projected-action-id> --json',
    direct_package_lifecycle_command_used: false,
    package_action_allowlist_owned: false,
    carrier_selection_owned: false,
  });
});

test('MAS succeeds only after its projected Scholar required closure is present', () => {
  const packages = new Map<string, PackageState>([
    [
      'mas',
      {
        installed: false,
        dependencies: [],
        action: 'carrier_install_mas',
      },
    ],
    ['mag', { installed: true, dependencies: [], action: null }],
    ['rca', { installed: true, dependencies: [], action: null }],
  ]);
  const calls: string[][] = [];
  const result = applyOfficialProfilePackages({
    intent: 'first_install',
    rootPackageIds: ['mas'],
    runtime: {
      execute(args) {
        calls.push(args);
        if (args[1] === 'state') {
          return { status: 0, stdout: JSON.stringify(fastState(packages)), stderr: '' };
        }
        packages.set('mas', {
          installed: true,
          dependencies: [readyDependency('mas-scholar-skills')],
          action: null,
        });
        return { status: 0, stdout: JSON.stringify({ status: 'completed' }), stderr: '' };
      },
    },
  });

  assert.equal(result.official_profile_package_apply.status, 'completed');
  assert.equal(packages.get('mas')?.installed, true);
  assert.deepEqual(packages.get('mas')?.dependencies, [readyDependency('mas-scholar-skills')]);
  assert.equal(
    calls.some((args) => args.includes('mag') || args.includes('rca')),
    false,
    'MAS closure convergence must not touch unrelated roots'
  );
});

test('presence-only closure ignores legacy version, ABI, and lock diagnostics', () => {
  const calls: string[][] = [];
  const packages = new Map<string, PackageState>([
    [
      'mas',
      {
        installed: true,
        action: 'must_not_execute',
        dependencies: [
          {
            ...readyDependency('mas-scholar-skills'),
            status: 'incompatible',
            version_satisfied: false,
            abi_satisfied: false,
            reasons: ['dependency_lock_missing'],
          },
        ],
      },
    ],
  ]);
  const result = applyOfficialProfilePackages({
    intent: 'first_install',
    rootPackageIds: ['mas'],
    runtime: {
      execute(args) {
        calls.push(args);
        return { status: 0, stdout: JSON.stringify(fastState(packages)), stderr: '' };
      },
    },
  });

  assert.equal(result.official_profile_package_apply.status, 'completed');
  assert.equal(result.official_profile_package_apply.items[0].status, 'already_present');
  assert.deepEqual(calls, [['app', 'state', '--profile', 'fast', '--json']]);
});

test('missing or incomplete fresh closure readback fails closed after the projected action', () => {
  for (const afterAction of [
    { installed: true, dependencies: [missingDependency('mas-scholar-skills')], action: null },
    { installed: true, dependencies: [], action: null, omitStatus: true },
  ]) {
    const packages = new Map<string, PackageState>([
      ['mas', { installed: false, dependencies: [], action: 'carrier_install_mas' }],
    ]);
    let omitStatus = false;
    const result = applyOfficialProfilePackages({
      intent: 'first_install',
      rootPackageIds: ['mas'],
      runtime: {
        execute(args) {
          if (args[1] === 'state') {
            const payload = fastState(packages);
            if (omitStatus) delete payload.app_state.agent_packages.status_index.packages.mas;
            return { status: 0, stdout: JSON.stringify(payload), stderr: '' };
          }
          packages.set('mas', afterAction);
          omitStatus = 'omitStatus' in afterAction;
          return { status: 0, stdout: JSON.stringify({ status: 'completed' }), stderr: '' };
        },
      },
    });
    assert.equal(result.official_profile_package_apply.status, 'failed');
    assert.match(result.official_profile_package_apply.items[0].error.message, /not present with its required closure/);
  }
});

test('user removal survives restart, maintenance, App update, and ordinary reconcile until explicit Restore', () => {
  let installed = false;
  const calls: string[][] = [];
  const packages = new Map<string, PackageState>([
    ['mas', { installed, dependencies: [], action: 'carrier_install_mas' }],
  ]);
  const runtime = {
    execute(args: string[]) {
      calls.push(args);
      packages.set('mas', {
        installed,
        dependencies: installed ? [readyDependency('mas-scholar-skills')] : [],
        action: installed ? null : 'carrier_install_mas',
      });
      if (args[1] === 'state') {
        return { status: 0, stdout: JSON.stringify(fastState(packages)), stderr: '' };
      }
      installed = true;
      return { status: 0, stdout: JSON.stringify({ status: 'completed' }), stderr: '' };
    },
  };

  for (const intent of ['app_restart', 'daily_maintenance', 'app_update', 'ordinary_reconcile']) {
    assert.throws(
      () =>
        applyOfficialProfilePackages({
          intent: intent as any,
          rootPackageIds: ['mas'],
          runtime,
        }),
      /first_install or explicit_restore/
    );
    assert.equal(installed, false, `${intent} must preserve the user's removal`);
    assert.equal(calls.length, 0, `${intent} must not execute an OPL command`);
  }

  const result = applyOfficialProfilePackages({
    intent: 'explicit_restore',
    rootPackageIds: ['mas'],
    runtime,
  });
  assert.equal(installed, true);
  assert.deepEqual(
    calls.map((args) => args.slice(0, 3)),
    [
      ['app', 'state', '--profile'],
      ['app', 'action', 'execute'],
      ['app', 'state', '--profile'],
    ]
  );
  assert.equal(result.official_profile_package_apply.status, 'completed');
  assert.equal(result.official_profile_package_apply.intent, 'explicit_restore');
  assert.deepEqual(result.official_profile_package_apply.persistence, {
    desired_state_saved: false,
    startup_maintenance_registered: false,
    automatic_reapply_allowed: false,
  });
});

test('unresolved duplicate carriers fail closed until W3 projects one opaque action', () => {
  const calls: string[][] = [];
  const ambiguousState = {
    version: 'g2',
    app_state: {
      agent_packages: {
        directory: {
          entries: [
            {
              package_id: 'opl-flow',
              installed: false,
              carrier_precedence: 'unresolved',
              carrier_candidates: [
                {
                  source_kind: 'retired_private',
                  nominal_version: '0.1.24',
                  content_sha256: 'private-carrier-bytes',
                },
                {
                  source_kind: 'formal',
                  nominal_version: '0.1.27',
                  content_sha256: 'formal-carrier-bytes',
                },
              ],
              recommended_action_ref: null,
              available_actions: [],
            },
          ],
        },
        status_index: { packages: {} },
      },
    },
  };
  const runtime = {
    execute(args: string[]) {
      calls.push(args);
      return { status: 0, stdout: JSON.stringify(ambiguousState), stderr: '' };
    },
  };

  for (const intent of ['app_restart', 'daily_maintenance']) {
    assert.throws(
      () =>
        applyOfficialProfilePackages({
          intent: intent as any,
          rootPackageIds: ['opl-flow'],
          runtime,
        }),
      /first_install or explicit_restore/
    );
  }
  assert.deepEqual(calls, [], 'startup and maintenance must reject before reading ambiguous carrier state');

  for (const intent of ['first_install', 'explicit_restore'] as const) {
    const callCountBefore = calls.length;
    const result = applyOfficialProfilePackages({
      intent,
      rootPackageIds: ['opl-flow'],
      runtime,
    });
    assert.equal(result.official_profile_package_apply.status, 'failed');
    assert.equal(result.official_profile_package_apply.items[0].changed, false);
    assert.match(result.official_profile_package_apply.items[0].error.message, /no projected action/);
    assert.deepEqual(calls.slice(callCountBefore), [['app', 'state', '--profile', 'fast', '--json']]);
  }

  assert.equal(
    calls.filter((args) => args.slice(0, 3).join(' ') === 'app action execute').length,
    0,
    'App must not select private or formal carrier identity when W3 has not projected an action'
  );
});

test('CLI uses only isolated fast-state reads for already-present explicit roots', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-official-profile-apply-'));
  const fakeHome = path.join(root, 'home');
  const fakeCodexHome = path.join(root, 'codex');
  const fakeOpl = path.join(root, 'opl');
  const logPath = path.join(root, 'calls.jsonl');
  fs.mkdirSync(fakeHome);
  fs.mkdirSync(fakeCodexHome);
  fs.writeFileSync(
    fakeOpl,
    `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(process.env.OPL_FAKE_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
const roots = ['mas', 'oma'];
const entries = roots.map((packageId) => ({
  package_id: packageId,
  installed: true,
  recommended_action_ref: null,
  available_actions: [],
}));
const packages = Object.fromEntries(roots.map((packageId) => [packageId, {
  package_id: packageId,
  package_dependency_readiness: { dependencies: packageId === 'mas' ? [{
    package_id: 'mas-scholar-skills',
    required: true,
    installed: true,
    enabled: true,
    status: 'current',
    reasons: [],
  }] : [] },
}]));
process.stdout.write(JSON.stringify({version:'g2',app_state:{agent_packages:{directory:{entries},status_index:{packages}}}}));
`,
    { mode: 0o755 }
  );
  try {
    const run = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        'scripts/official-profile-package-apply.ts',
        '--intent',
        'explicit_restore',
        '--root-package-id',
        'mas',
        '--root-package-id',
        'oma',
        '--opl-bin',
        fakeOpl,
      ],
      {
        cwd: appRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: fakeHome,
          CODEX_HOME: fakeCodexHome,
          OPL_FAKE_LOG: logPath,
        },
      }
    );
    assert.equal(run.status, 0, run.stderr);
    const output = JSON.parse(run.stdout);
    assert.equal(output.official_profile_package_apply.status, 'completed');
    assert.deepEqual(output.official_profile_package_apply.root_package_ids, ['mas', 'oma']);
    const calls = fs
      .readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(calls.length, 2);
    assert.equal(
      calls.every((args) => args.join(' ') === 'app state --profile fast --json'),
      true
    );
    assert.deepEqual(fs.readdirSync(fakeCodexHome), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Official Profile preserves Framework JSON errors on nonzero exit with empty stderr', () => {
  const result = applyOfficialProfilePackages({
    intent: 'first_install',
    rootPackageIds: ['test-package'],
    runtime: {
      execute: () => ({
        status: 1,
        stderr: '',
        stdout: JSON.stringify({
          error: {
            message: 'Native inventory unavailable; token=fixture-secret',
            body: 'private-response-body',
          },
          raw: 'private-response-body',
        }),
      }),
    },
  });
  assert.equal(result.official_profile_package_apply.status, 'failed');
  assert.equal(
    result.official_profile_package_apply.items[0].error.message,
    'Native inventory unavailable; token=<redacted>'
  );
  assert.ok(!JSON.stringify(result).includes('fixture-secret'));
  assert.ok(!JSON.stringify(result).includes('private-response-body'));
});

test('Official Profile reports a safe exit fallback instead of empty stderr or raw JSON', () => {
  for (const stdout of ['', 'private-response-body', JSON.stringify({ body: 'private-response-body' })]) {
    const result = applyOfficialProfilePackages({
      intent: 'first_install',
      rootPackageIds: ['test-package'],
      runtime: { execute: () => ({ status: 1, stderr: '  ', stdout }) },
    });
    assert.equal(result.official_profile_package_apply.items[0].error.message, 'opl app state exited with status 1');
    assert.ok(!JSON.stringify(result).includes('private-response-body'));
  }
});

test('Official Profile bounds diagnostic messages and redacts credentials before returning failure items', () => {
  const result = applyOfficialProfilePackages({
    intent: 'explicit_restore',
    rootPackageIds: ['test-package'],
    runtime: {
      execute: () => ({
        status: 1,
        stderr: '',
        stdout: JSON.stringify({
          error: {
            message:
              'Fetch https://user:fixture-password@example.test/?token=fixture-token failed; Bearer fixture-bearer; api_key="fixture-key"; ghp_fixturegithub; ' +
              'x'.repeat(2000) +
              '\nprivate-response-body',
          },
        }),
      }),
    },
  });
  const message = result.official_profile_package_apply.items[0].error.message;
  assert.ok(message.length <= 1024);
  assert.ok(message.includes('Fetch <redacted-url> failed'));
  for (const secret of [
    'fixture-password',
    'fixture-token',
    'fixture-bearer',
    'fixture-key',
    'ghp_fixturegithub',
    'private-response-body',
  ]) {
    assert.ok(!message.includes(secret));
  }
});

test('Official Profile extracts and redacts pretty Framework stderr JSON without leaking response bodies', () => {
  const result = applyOfficialProfilePackages({
    intent: 'first_install',
    rootPackageIds: ['obf'],
    runtime: {
      execute: () => ({
        status: 1,
        stdout: '',
        stderr: JSON.stringify(
          {
            error: {
              code: 'native_install_failed',
              message: 'Carrier inventory failed; token=fixture-secret',
              body: 'private-response-body',
            },
          },
          null,
          2,
        ),
      }),
    },
  });
  assert.deepEqual(result.official_profile_package_apply.items[0].error, {
    code: 'native_install_failed',
    message: 'Carrier inventory failed; token=<redacted>',
  });
  assert.ok(!JSON.stringify(result).includes('private-response-body'));
  assert.ok(!JSON.stringify(result).includes('fixture-secret'));
});

test('Official Profile does not expose unrelated stderr JSON or credential-shaped codes', () => {
  for (const stderr of [
    JSON.stringify({ body: 'private-response-body' }),
    JSON.stringify({
      error: { code: 'token=fixture-secret', message: 'Install failed' },
    }),
  ]) {
    const result = applyOfficialProfilePackages({
      intent: 'first_install',
      rootPackageIds: ['obf'],
      runtime: { execute: () => ({ status: 1, stdout: '', stderr }) },
    });
    assert.notEqual(
      result.official_profile_package_apply.items[0].error.message,
      '{',
    );
    assert.equal(
      result.official_profile_package_apply.items[0].error.code,
      undefined,
    );
    assert.ok(!JSON.stringify(result).includes('private-response-body'));
    assert.ok(!JSON.stringify(result).includes('fixture-secret'));
  }
});
