import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWebuiSourceAuthority,
  validateWebuiSourceAuthority,
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

test('independent WebUI source authority fails closed on version, source, or digest drift', () => {
  assert.throws(
    () => createWebuiSourceAuthority({
      version: '26.7.28',
      appSha,
      shellSha,
      frameworkSha,
      runId: '302',
      executorSha,
    }),
    /YY\.M\.D-preview\.rN/,
  );

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
