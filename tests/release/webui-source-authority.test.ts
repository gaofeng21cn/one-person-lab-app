import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import {
  createWebuiSourceAuthority,
  validateWebuiSourceAuthority,
  resolveWebuiShellSource,
} from '../../scripts/webui-source-authority.ts';

const appSha = 'a'.repeat(40);
const shellSha = 'b'.repeat(40);
const frameworkSha = 'c'.repeat(40);
const executorSha = 'd'.repeat(40);

function fixture() {
  return createWebuiSourceAuthority({
    version: '26.7.28-preview.r1',
    appSha,
    shellSha,
    frameworkSha,
    runId: '302',
    executorSha,
  });
}

test('independent WebUI source authority binds the exact Preview cohort and dispatcher', () => {
  const authority = fixture();
  const validated = validateWebuiSourceAuthority(authority);

  assert.deepEqual(validated, authority);
  assert.equal(authority.schema, 'opl_app_webui_source_authority.v1');
  assert.equal(authority.status, 'admitted');
  assert.equal(authority.quality_status, 'preview');
  assert.equal(authority.build_trigger, 'manual');
  assert.equal(authority.preview_kind, 'dev');
  assert.equal(authority.release.version, '26.7.28-preview.r1');
  assert.equal(authority.sources.app.source_commit, appSha);
  assert.equal(authority.sources.shell.source_commit, shellSha);
  assert.equal(authority.sources.framework.source_commit, frameworkSha);
  assert.equal(authority.authorization.run_id, '302');
  assert.equal(authority.authorization.executor_sha, executorSha);
  assert.match(authority.source_authority_digest, /^sha256:[0-9a-f]{64}$/);
});

test('Studio Desktop cutover resolves the active Studio WebUI source and rejects source substitution', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-source-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'contracts'));
  const adapterFile = path.join(root, 'contracts/app-shell-adapter.json');
  const releaseFile = path.join(root, 'contracts/app-release-channel.json');
  fs.writeFileSync(adapterFile, JSON.stringify({ active_shell: 'opl-studio' }));
  const source = { repository: 'gaofeng21cn/opl-studio', source_commit: shellSha, checkout_path: 'shells/studio', policy: 'active_studio_source' };
  const write = (value: unknown) => fs.writeFileSync(releaseFile, JSON.stringify({ webui_ghcr_image: { shell_source: value } }));
  write(source);
  assert.deepEqual(resolveWebuiShellSource(root, executorSha), {
    repository: source.repository, source_commit: executorSha, checkout_path: source.checkout_path,
  });
  for (const invalid of [{ ...source, policy: 'independent_pinned_webui_source' }, { ...source, repository: 'gaofeng21cn/opl-aion-shell' }, undefined]) {
    write(invalid);
    assert.throws(() => resolveWebuiShellSource(root, executorSha));
  }
  write(source);
  assert.throws(() => resolveWebuiShellSource(root, 'main'));
  fs.writeFileSync(adapterFile, JSON.stringify({ active_shell: 'aionui' }));
  assert.throws(() => resolveWebuiShellSource(root, executorSha));
});

test('WebUI qualification and post-publication authority consume the same independent source policy', () => {
  const workflow = (name: string) => parse(fs.readFileSync(path.join(process.cwd(), '.github/workflows', name), 'utf8'));
  const bundle = workflow('_release-bundle.yml');
  const carrier = workflow('_release-webui-carrier.yml');
  const stable = workflow('release-stable.yml');
  assert.equal(bundle.jobs['webui-qualify'].with.shell_ref, '${{ needs.webui-source-authority.outputs.webui_shell_ref }}');
  const checkout = carrier.jobs['build-and-qualify'].steps.find(step => step.name === 'Checkout exact independent WebUI Shell source');
  assert.equal(checkout.with.repository, 'gaofeng21cn/opl-studio');
  assert.equal(checkout.with.ref, '${{ inputs.shell_ref }}');
  assert.equal(checkout.with.path, 'shells/studio');
  assert.equal(carrier.jobs['build-and-qualify'].steps.some(step => step.uses === './.github/actions/setup-active-shell-deps'), false);
  for (const job of [bundle.jobs['webui-source-authority'], stable.jobs['webui-source-authority']]) {
    const run = job.steps.map(step => step.run ?? '').join('\n');
    assert.match(run, /webui-source-authority\.ts resolve-shell/);
    assert.match(run, /--app-root webui-app-source --desktop-shell-sha/);
  }
  const postPublication = stable.jobs['webui-source-authority'].steps.map(step => step.run ?? '').join('\n');
  assert.match(postPublication, /--arg shell "\$webui_shell_ref"/);
  assert.match(postPublication, /--shell-sha "\$webui_shell_ref"/);
  assert.match(postPublication, /echo "shell_ref=\$webui_shell_ref"/);
});

test('independent WebUI source authority admits Stable and fails closed on source or digest drift', () => {
  const stable = createWebuiSourceAuthority({
      version: '26.7.28',
      appSha,
      shellSha,
      frameworkSha,
      runId: '302',
      executorSha,
    });
  assert.equal(stable.quality_status, 'stable');
  assert.equal(stable.preview_kind, null);

  const cases: Array<[string, (authority: Record<string, any>) => void]> = [
    ['source commit', (authority) => { authority.sources.shell.source_commit = 'e'.repeat(40); }],
    ['digest', (authority) => { authority.source_authority_digest = `sha256:${'0'.repeat(64)}`; }],
    ['dispatcher', (authority) => { authority.authorization.workflow = '.github/workflows/release-stable.yml'; }],
  ];
  for (const [label, mutate] of cases) {
    const authority = JSON.parse(JSON.stringify(fixture())) as Record<string, any>;
    mutate(authority);
    assert.throws(
      () => validateWebuiSourceAuthority(authority),
      /exact canonical digest-bound shape/,
      label,
    );
  }
});
