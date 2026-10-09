import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyCompletedWebui } from '../../scripts/reconcile-completed-webui.ts';

function input() {
  const digest = `sha256:${'a'.repeat(64)}`;
  return { runId: '123', version: '26.10.9',
    run: { id: 123, repository: { full_name: 'gaofeng21cn/one-person-lab-app' }, path: '.github/workflows/release-webui-development.yml', status: 'completed', conclusion: 'success', run_attempt: 1, head_sha: 'b'.repeat(40) },
    receipt: { schema: 'opl_app_webui_stable_promotion_receipt.v5', status: 'complete', retry_allowed: false, authority_mode: 'independent_stable',
      promotion_executor: { run_id: '123', app_head_sha: 'b'.repeat(40) },
      release: { version: '26.10.9', app_sha: 'c'.repeat(40), shell_sha: 'd'.repeat(40), framework_sha: 'e'.repeat(40), bundle_digest: digest, cohort_ref: digest },
      target: { repository: 'ghcr.io/gaofeng21cn/one-person-lab-webui', digest, platforms: [{ os: 'linux', architecture: 'arm64' }, { os: 'linux', architecture: 'amd64' }] },
      anonymous_readback: { stable: { digest }, latest: { digest } } } };
}
test('completed independent Docker keeps its own source roles', () => {
  const x = input();
  assert.equal(verifyCompletedWebui(x), x.receipt.target.digest);
});
test('rejects another version, executor, incomplete architecture or divergent pointer', () => {
  for (const mutate of [
    (x: ReturnType<typeof input>) => { x.receipt.release.version = '26.10.8'; },
    (x: ReturnType<typeof input>) => { x.run.head_sha = 'f'.repeat(40); },
    (x: ReturnType<typeof input>) => { x.receipt.target.platforms.pop(); },
    (x: ReturnType<typeof input>) => { x.receipt.anonymous_readback.latest.digest = `sha256:${'f'.repeat(64)}`; },
  ]) {
    const x = input(); mutate(x); assert.throws(() => verifyCompletedWebui(x));
  }
});
