import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scanDirectoryForSecretMarkers } from '../../scripts/docker-webui-smoke-gate/support.ts';

test('Docker/WebUI secret scan reports detector IDs without matched bytes', () => {
  const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-secret-redaction-'));
  const nestedDir = path.join(evidenceDir, 'nested');
  const keyMaterial = `sk-${'a'.repeat(24)}`;
  const bearerMaterial = 'b'.repeat(24);
  fs.mkdirSync(nestedDir);
  fs.writeFileSync(path.join(evidenceDir, 'config.env'), `OPENAI_API_KEY=${keyMaterial}\n`);
  fs.writeFileSync(path.join(nestedDir, 'request.log'), `Authorization: Bearer ${bearerMaterial}\n`);

  const markers = scanDirectoryForSecretMarkers(evidenceDir).sort();
  assert.deepEqual(markers, [
    'config.env:openai_api_key',
    'config.env:openai_secret_key',
    path.join('nested', 'request.log') + ':bearer_token',
  ]);
  const serializedMarkers = JSON.stringify(markers);
  assert.equal(serializedMarkers.includes(keyMaterial), false);
  assert.equal(serializedMarkers.includes(bearerMaterial), false);
});

test('Docker/WebUI secret scan remains fail-open for absent or ordinary evidence', () => {
  const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-secret-scan-clean-'));
  fs.writeFileSync(path.join(evidenceDir, 'status.txt'), 'status=passed\n');

  assert.deepEqual(scanDirectoryForSecretMarkers(evidenceDir), []);
  assert.deepEqual(scanDirectoryForSecretMarkers(path.join(evidenceDir, 'absent')), []);
});
