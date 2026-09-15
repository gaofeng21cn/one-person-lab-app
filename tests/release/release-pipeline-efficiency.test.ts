import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parse } from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => parse(fs.readFileSync(path.join(root, file), 'utf8'));
const build = read('.github/workflows/_build-reusable.yml').jobs;
const checks = ['workflow-lint', 'lint-format', 'typecheck', 'release-boundary', 'active-shell-tests', 'build'];
const gate = build['build-summary'].steps.find((step: any) => step.name === 'Require every applicable source and artifact gate');
function runGate(results: Record<string, string>, skip = false) {
  return spawnSync('bash', ['-c', gate.run], {
    encoding: 'utf8',
    env: { ...process.env, NEEDS_JSON: JSON.stringify(Object.fromEntries(Object.entries(results).map(([key, result]) => [key, { result }]))), SKIP_CODE_QUALITY: String(skip) },
  });
}

test('parallel artifact build cannot turn failed, skipped, missing or cancelled source checks into reusable success', () => {
  for (const check of checks) assert.ok(build['build-summary'].needs.includes(check));
  for (const check of checks.filter(check => check !== 'build')) assert.ok(!build.build.needs.includes(check));
  const passed = Object.fromEntries(checks.map(check => [check, 'success']));
  assert.equal(runGate(passed).status, 0);
  for (const check of checks) {
    for (const result of ['failure', 'skipped', 'cancelled', 'unknown']) {
      const execution = runGate({ ...passed, [check]: result });
      assert.equal(execution.status, 1, `${check}: ${result}`);
      assert.ok(execution.stderr.includes(check));
    }
    const missing = { ...passed };
    delete missing[check];
    assert.equal(runGate(missing).status, 1);
  }
  assert.equal(runGate({ build: 'success' }, true).status, 0);
  assert.equal(runGate({ build: 'failure' }, true).status, 1);
});

test('Full qualification starts from verified build and publication still joins both independent gates', () => {
  const jobs = read('.github/workflows/_release-full-addon.yml').jobs;
  const vm = jobs['full-clean-vm-qualification'];
  assert.ok(!vm.needs.includes('full-qualification'));
  assert.ok(vm.needs.includes('full-build'));
  assert.match(vm.if, /!cancelled\(\)/);
  assert.match(vm.if, /needs\.full-build\.result == 'success' \|\| needs\.materialize-full-build\.result == 'success'/);
  // Evaluate the workflow's actual eligibility expression over fresh, recovery and rejected states.
  const eligible = (stage: string, built: string, restored: string, cancelled = false) => {
    const expression = vm.if.slice(3, -2)
      .replaceAll('!cancelled()', String(!cancelled))
      .replaceAll('needs.restore-standard.result', JSON.stringify('success'))
      .replaceAll('needs.restore-standard.outputs.completed_stage', JSON.stringify(stage))
      .replaceAll('needs.full-build.result', JSON.stringify(built))
      .replaceAll('needs.materialize-full-build.result', JSON.stringify(restored));
    return Function(`return (${expression});`)();
  };
  assert.equal(eligible('standard_qualified', 'success', 'skipped'), true);
  assert.equal(eligible('full_built', 'skipped', 'success'), true);
  assert.equal(eligible('full_qualified', 'skipped', 'success'), false);
  assert.equal(eligible('full_published', 'skipped', 'success'), false);
  assert.equal(eligible('unknown', 'success', 'success'), false);
  assert.equal(eligible('full_built', 'failure', 'skipped'), false);
  assert.equal(eligible('full_built', 'success', 'skipped', true), false);
  const checkpoint = jobs['checkpoint-full'];
  assert.ok(checkpoint.needs.includes('full-qualification'));
  assert.ok(checkpoint.needs.includes('full-clean-vm-qualification'));
  const bind = checkpoint.steps.find((step: any) => step.name === 'Bind Full bytes and export additive checkpoint');
  assert.equal(bind.env.QUALIFICATION_COMPLETE, "${{ needs.full-qualification.result == 'success' && needs.full-clean-vm-qualification.result == 'success' }}");
});

test('early account preflight uses private files and removes credentials on success and failure', () => {
  const action = read('.github/actions/release-gateway-preflight/action.yml');
  const run = action.runs.steps[0].run;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-preflight-test-'));
  try {
    // A process stand-in verifies the real action transport; account semantics have their own HTTP tests.
    fs.writeFileSync(path.join(temp, 'node'), `#!/bin/bash
set -euo pipefail
test -z "\${GATEWAY_ACCOUNT_EMAIL:-}" && test -z "\${GATEWAY_ACCOUNT_PASSWORD:-}"
exec python3 - "$@" <<'PY'
import sys, os, stat
args=sys.argv[1:]
for flag in ['--email-file','--password-file']:
 p=args[args.index(flag)+1]
 assert stat.S_IMODE(os.stat(p).st_mode)==0o600
 assert len(open(p).read())>0
sys.exit(int(os.environ['PROBE_EXIT']))
PY
`, { mode: 0o755 });
    for (const status of [0, 1]) {
      const result = spawnSync('bash', ['-c', run], { encoding: 'utf8', env: {
        ...process.env, PATH: `${temp}:${process.env.PATH}`, RUNNER_TEMP: temp,
        EXECUTOR_ROOT: root, GATEWAY_ACCOUNT_EMAIL: 'test@example.invalid',
        GATEWAY_ACCOUNT_PASSWORD: 'test-only-password', PROBE_EXIT: String(status),
      } });
      assert.equal(result.status, status, result.stderr);
      assert.ok(!`${result.stdout}${result.stderr}`.includes('test-only-password'));
      assert.deepEqual(fs.readdirSync(temp), ['node']);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Standard and fresh Full run preflight before packaging; final clean VM still logs in', () => {
  const standard = read('.github/workflows/release-stable.yml').jobs['stable-admission-manifest'].steps;
  assert.ok(standard.findIndex((s: any) => s.name === 'Verify Gateway account before Standard freeze and build') < standard.findIndex((s: any) => s.id === 'manifest'));
  const full = read('.github/workflows/full-first-install-release.yml').jobs['full-first-install'].steps;
  const preflight = full.find((s: any) => s.name === 'Verify Gateway account before release-bound Full build');
  assert.equal(preflight.if, "${{ inputs.operation == 'append_full' && !inputs.cache_only }}");
  assert.ok(full.indexOf(preflight) < full.findIndex((s: any) => s.name === 'Install App shell dependencies'));
  const vm = Object.values(read('.github/workflows/opl-first-run-vm.yml').jobs).flatMap((j: any) => j.steps ?? []);
  assert.ok(vm.some((s: any) => s.name === 'Verify dedicated non-admin Gateway release-test account'));
});
