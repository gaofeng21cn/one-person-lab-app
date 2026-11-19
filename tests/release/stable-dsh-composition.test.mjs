import assert from 'node:assert/strict';
import test from 'node:test';
import { readCompositionFingerprint, verifyCompositionReceipt } from '../../scripts/stable-dsh-composition.mjs';

const appSha = 'a'.repeat(40);
const shellSha = 'b'.repeat(40);

test('composition fingerprint binds the exact producer run and archive digest', () => {
  const fingerprint = `opl-desktop-stable-release:dsh-composition:123456:deadbeef${'0'.repeat(56)}`;
  assert.deepEqual(readCompositionFingerprint(fingerprint), {
    runId: '123456',
    digest: `sha256:${'deadbeef'}${'0'.repeat(56)}`,
  });
  assert.equal(readCompositionFingerprint('opl-desktop-stable-release'), null);
  assert.throws(() => readCompositionFingerprint('opl-desktop-stable-release:dsh-composition:123:bad'), /Malformed/);
});

test('composition receipt is bound to frozen App and Studio commits', () => {
  const receipt = {
    schema: 'opl_dsh_plugin_composition_receipt.v1',
    registry: 'https://npm.pkg.github.com',
    app_product_commit: appSha,
    tested_on_sha: shellSha,
  };
  assert.doesNotThrow(() => verifyCompositionReceipt(receipt, { appSha, shellSha }));
  assert.throws(() => verifyCompositionReceipt({ ...receipt, tested_on_sha: 'c'.repeat(40) }, { appSha, shellSha }), /differs/);
});
