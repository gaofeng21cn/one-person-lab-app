import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parse } from 'yaml';
import { buildQualificationHarnessScopeProof } from '../../scripts/qualification-harness-scope.ts';

const appRoot = path.resolve(import.meta.dirname, '../..');
const workflow = (name: string) => parse(fs.readFileSync(path.join(appRoot, '.github/workflows', name), 'utf8'));

test('VM input validation exercises the exact selected receipt consumer before allocating a VM', () => {
  const vm = workflow('opl-first-run-vm.yml');
  const steps = vm.jobs['validate-vm-inputs'].steps;
  const consumer = steps.find((step: any) => step.name === 'Verify selected receipt scope consumer before VM');
  assert.ok(steps.indexOf(consumer) > steps.findIndex((step: any) => step.id === 'qualification_scope'));
  assert.ok(vm.jobs['clean-vm-first-run'].needs.includes('validate-vm-inputs'));
  const appSha = '1'.repeat(40);
  const shellSha = '2'.repeat(40);
  const verifierSha = '3'.repeat(40);
  const proof = buildQualificationHarnessScopeProof({
    artifactAppSha: appSha, verificationAppSha: appSha, appChangedPaths: [],
    artifactShellSha: shellSha, verificationShellSha: verifierSha,
    shellChangedPaths: ['scripts/desktop/preview-smoke.mjs'], shellRepository: 'gaofeng21cn/opl-studio', profile: 'full',
  });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-selected-scope-consumer-'));
  const source = fs.readFileSync(path.join(appRoot, 'scripts/qualification-harness-scope.ts'), 'utf8');
  const env = { ...process.env, QUALIFICATION_SCOPE_BASE64: Buffer.from(JSON.stringify(proof)).toString('base64'),
    ARTIFACT_APP_SHA: appSha, VERIFICATION_APP_SHA: appSha, ARTIFACT_SHELL_SHA: shellSha, VERIFICATION_SHELL_SHA: verifierSha };
  try {
    fs.mkdirSync(path.join(temp, 'scripts'));
    // Reproduce the previous verifier which did not admit the shared Preview probe.
    fs.writeFileSync(path.join(temp, 'scripts/qualification-harness-scope.ts'), source.replace("    'scripts/desktop/preview-smoke.mjs',\n", ''));
    const old = spawnSync('bash', ['-c', consumer.run], { cwd: temp, env, encoding: 'utf8' });
    assert.notEqual(old.status, 0);
    assert.match(old.stderr, /Selected verification App cannot consume.*fields are inconsistent/);
    assert.match(old.stderr, /verification-app-ref/);
    fs.writeFileSync(path.join(temp, 'scripts/qualification-harness-scope.ts'), source);
    const current = spawnSync('bash', ['-c', consumer.run], { cwd: temp, env, encoding: 'utf8' });
    assert.equal(current.status, 0, current.stderr);
    const mismatched = spawnSync('bash', ['-c', consumer.run], { cwd: temp, env: { ...env, ARTIFACT_APP_SHA: '4'.repeat(40) }, encoding: 'utf8' });
    assert.notEqual(mismatched.status, 0);
    assert.match(mismatched.stderr, /artifact App SHA/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('prepared input artifact is exposed only after a successful primary or retry upload', () => {
  const steps = workflow('_prepare-clean-vm-inputs.yml').jobs.prepare.steps;
  const identity = steps.find((step: any) => step.id === 'identity');
  assert.ok(steps.find((step: any) => step.id === 'retry_upload_tarballs'));
  const expression = identity.if.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  const evaluate = (primary: string, retry: string) => {
    const values = { upload_tarballs: { outcome: primary }, retry_upload_tarballs: { outcome: retry } };
    return Function('steps', 'return (' + expression + ')')(values);
  };
  assert.equal(evaluate('success', 'skipped'), true);
  assert.equal(evaluate('failure', 'success'), true);
  assert.equal(evaluate('failure', 'failure'), false);
  assert.equal(evaluate('failure', 'skipped'), false);
  assert.equal(evaluate('skipped', 'skipped'), false);
});

test('Windows guest Host builder installs build dependencies and the active Bun toolchain before invoking Studio', () => {
  const steps = workflow('_build-reusable.yml').jobs['prepare-studio-wsl-host'].steps;
  const bun = steps.findIndex((step: any) => String(step.uses ?? '').startsWith('oven-sh/setup-bun@'));
  const build = steps.findIndex((step: any) => String(step.run ?? '').includes('scripts/desktop/prepare-wsl-host-payload.mjs'));
  assert.ok(bun >= 0 && build > bun, 'Linux guest Host build must have Bun on PATH first');
  assert.equal(steps[bun].with['bun-version'], '1.4.0');
  const install = steps.findIndex((step: any) => step['working-directory'] === 'studio' && String(step.run ?? '').includes('npm ci'));
  assert.ok(install >= 0 && build > install, 'Linux guest Host build must install Studio build dependencies first');
  assert.ok(!steps[install].run.includes('--omit=dev'), 'Studio plugin compilation requires its build dependencies');
});
