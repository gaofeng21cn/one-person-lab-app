import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scriptPath = path.join(appRoot, 'scripts', 'dispatch-docker-webui-clean-windows-smoke.ts');

function runDispatch(args: string[]) {
  return spawnSync(process.execPath, ['--experimental-strip-types', scriptPath, ...args], {
    cwd: appRoot,
    encoding: 'utf8',
    env: process.env,
  });
}

test('Docker/WebUI clean Windows dispatch dry-run records missing runner blocker from supplied inventory', () => {
  const inventory = JSON.stringify([
    {
      id: 21,
      name: 'gaofeng-mac-opl-app-gui-vm',
      os: 'macOS',
      status: 'online',
      busy: false,
      labels: ['self-hosted', 'macOS', 'ARM64', 'opl-gui-vm'],
    },
  ]);
  const result = runDispatch(['--runner-inventory-json', inventory, '--json']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.schema, 'opl_docker_webui_clean_windows_dispatch_plan.v1');
  assert.equal(plan.mode, 'dry_run');
  assert.equal(plan.inventory_source, 'cli_json');
  assert.deepEqual(plan.required_labels, ['self-hosted', 'Windows', 'X64', 'docker-webui-clean-vm']);
  assert.equal(plan.observed_runners.length, 1);
  assert.equal(plan.eligible_runners.length, 0);
  assert.equal(plan.expected_preflight_status, 'typed_blocker');
  assert.equal(plan.expected_blocker_code, 'missing_clean_windows_self_hosted_runner');
  assert.equal(plan.dispatch, null);
  assert.match(plan.command, /gh 'workflow' 'run' 'docker-webui-clean-vm\.yml'/);
  assert.match(plan.command, /platform=windows/);
  assert.match(plan.command, /runner_inventory_json=/);
});

test('Docker/WebUI clean Windows dispatch dry-run recognizes an eligible Windows runner', () => {
  const inventory = JSON.stringify([
    {
      id: 42,
      name: 'clean-windows-opl',
      os: 'Windows',
      status: 'online',
      busy: false,
      labels: ['self-hosted', 'Windows', 'X64', 'docker-webui-clean-vm'],
    },
  ]);
  const result = runDispatch(['--runner-inventory-json', inventory, '--json']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.expected_preflight_status, 'passed');
  assert.equal(plan.expected_blocker_code, null);
  assert.equal(plan.eligible_runners.length, 1);
  assert.equal(plan.eligible_runners[0].name, 'clean-windows-opl');
});

test('Docker/WebUI clean Windows dispatch rejects malformed inventory input', () => {
  const result = runDispatch(['--runner-inventory-json', '{"not":"array"}', '--json']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /runner-inventory-json must be a JSON array/);
});
