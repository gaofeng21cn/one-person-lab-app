import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  consumeStableOperationControl,
  bindStableOperationAuthority,
  createStableOperationAuthority,
  createStableOperationControl,
  decodeStableOperationAuthorityCarrier,
  encodeStableOperationAuthorityCarrier,
  validateStableOperationConsumption,
  validateStableOperationControl,
  validateStableOperationRuntimeBinding,
} from '../../scripts/stable-operation-control.ts';

const appSha = '1'.repeat(40);
const shellSha = '2'.repeat(40);
const frameworkSha = '3'.repeat(40);
const sourceGateDigest = `sha256:${'4'.repeat(64)}`;
const preNonceGuardDigest = `sha256:${'5'.repeat(64)}`;
const nonce = 'a'.repeat(32);
const criticalBlobPaths = [
  '.github/workflows/release-stable.yml',
  '.github/workflows/release-source-qualification.yml',
  '.github/workflows/_release-bundle.yml',
  '.github/workflows/_release-standard-publish.yml',
  '.github/workflows/_release-full-addon.yml',
  '.github/workflows/_release-webui-carrier.yml',
  '.github/workflows/release-webui-publication-promote.yml',
  'contracts/app-release-channel.json',
];
const criticalBlobs = Object.fromEntries(
  criticalBlobPaths.map((file, index) => [file, `sha256:${(index + 6).toString(16).repeat(64)}`]),
);

function issuedAuthority(input: {
  criticalBlobs?: Record<string, string>;
  issuer?: string;
  nonce?: string;
  sourceGateDigest?: string;
  preNonceGuardDigest?: string;
} = {}) {
  return createStableOperationAuthority({
    authorityId: 'authority-stable-30325431854',
    operationId: 'stable-30325431854',
    issuer: input.issuer ?? 'gaofeng21cn',
    issuedAt: '2026-07-28T00:00:00.000Z',
    expiresAt: '2026-07-28T01:00:00.000Z',
    objectiveFingerprint: 'fix-all-five-stable-control-gaps-20260728',
    nonce: input.nonce ?? nonce,
    appSha,
    shellSha,
    frameworkSha,
    criticalBlobs: input.criticalBlobs ?? criticalBlobs,
    sourceGateDigest: input.sourceGateDigest ?? sourceGateDigest,
    preNonceGuardDigest: input.preNonceGuardDigest ?? preNonceGuardDigest,
  });
}

function control() {
  return createStableOperationControl({
    operationId: 'stable-30325431854',
    actor: 'gaofeng21cn',
    runId: '30325431854',
    runAttempt: 1,
    nonce,
    appSha,
    shellSha,
    frameworkSha,
    criticalBlobs,
    sourceGateDigest,
    preNonceGuardDigest,
    issuedAuthority: issuedAuthority(),
  });
}

test('Stable operation control binds one actor, exact frozen cohort, critical blobs, and nonce', () => {
  const actual = control();
  assert.equal(actual.status, 'admitted');
  assert.equal(actual.consumed_once, false);
  assert.equal(actual.cohort.app_sha, appSha);
  assert.match(actual.nonce_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(validateStableOperationControl(actual).authority_digest, actual.authority_digest);
});

test('Stable operation control rejects a missing issued authority reference', () => {
  const legacy = structuredClone(control()) as Record<string, unknown>;
  delete legacy.issued_authority;
  assert.throws(() => validateStableOperationControl(legacy), /issued_authority must be one JSON object/);
  assert.throws(
    () => createStableOperationControl({
      operationId: 'stable-30325431854',
      actor: 'gaofeng21cn',
      runId: '30325431854',
      runAttempt: 1,
      nonce,
      appSha,
      shellSha,
      frameworkSha,
      criticalBlobs,
      sourceGateDigest,
      preNonceGuardDigest,
      issuedAuthority: undefined as unknown as ReturnType<typeof issuedAuthority>,
    }),
    /Stable operation authority must be one JSON object/,
  );
});

test('Stable authority carrier is canonical, digest-bound, and cannot be self-issued by a different carrier', () => {
  const authority = issuedAuthority();
  const carrier = encodeStableOperationAuthorityCarrier(authority);
  const decoded = decodeStableOperationAuthorityCarrier({
    carrier,
    authorityDigest: authority.authority_digest,
    authorityId: authority.authority_id,
  });
  assert.equal(decoded.authority_digest, authority.authority_digest);
  assert.throws(
    () => decodeStableOperationAuthorityCarrier({
      carrier,
      authorityDigest: `sha256:${'0'.repeat(64)}`,
      authorityId: authority.authority_id,
    }),
    /digest does not match/,
  );
  assert.throws(
    () => decodeStableOperationAuthorityCarrier({
      carrier: Buffer.from(JSON.stringify(authority), 'utf8').toString('base64url'),
      authorityDigest: authority.authority_digest,
      authorityId: authority.authority_id,
    }),
    /canonical authority JSON bytes/,
  );
});

test('Stable operation control permits exactly one matching run-bound consumption receipt', () => {
  const admitted = control();
  const consumed = consumeStableOperationControl({
    control: admitted,
    operationId: admitted.operation_id,
    runId: admitted.run_id,
    runAttempt: 1,
    nonce,
  });
  assert.equal(consumed.status, 'consumed');
  assert.equal(consumed.consumed_once, true);
  assert.equal(validateStableOperationConsumption(consumed, admitted).consumption_digest, consumed.consumption_digest);
  assert.throws(
    () => consumeStableOperationControl({
      control: admitted,
      operationId: admitted.operation_id,
      runId: '30325431855',
      runAttempt: 1,
      nonce,
    }),
    /run_id does not match/,
  );
});

test('Stable operation control rejects a drifted critical blob and a mismatched nonce', () => {
  const admitted = control();
  const drifted = structuredClone(admitted);
  drifted.critical_blobs['contracts/app-release-channel.json'] = `sha256:${'9'.repeat(64)}`;
  assert.throws(() => validateStableOperationControl(drifted), /digest binding is invalid/);
  assert.throws(
    () => consumeStableOperationControl({
      control: admitted,
      operationId: admitted.operation_id,
      runId: admitted.run_id,
      runAttempt: 1,
      nonce: 'c'.repeat(32),
    }),
    /nonce does not match/,
  );
});

test('Stable operation control verifies frozen critical bytes and source evidence before consumption', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stable-operation-control-'));
  try {
    for (const relativePath of criticalBlobPaths) {
      const destination = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, `${relativePath}\n`);
    }
    const sourceGatePath = path.join(root, 'source-gate.json');
    const preNonceGuardPath = path.join(root, 'pre-nonce-guard.json');
    fs.writeFileSync(sourceGatePath, '{"status":"passed"}\n');
    fs.writeFileSync(preNonceGuardPath, '{"status":"passed"}\n');
    const sha = (file: string) => `sha256:${createHash(fs.readFileSync(file))}`;
    const runtimeCriticalBlobs = Object.fromEntries(
      criticalBlobPaths.map((relativePath) => [relativePath, sha(path.join(root, relativePath))]),
    );
    const authority = issuedAuthority({
      criticalBlobs: runtimeCriticalBlobs,
      sourceGateDigest: sha(sourceGatePath),
      preNonceGuardDigest: sha(preNonceGuardPath),
    });
    const admitted = createStableOperationControl({
      operationId: 'stable-30325431854',
      actor: 'gaofeng21cn',
      runId: '30325431854',
      runAttempt: 1,
      nonce,
      appSha,
      shellSha,
      frameworkSha,
      criticalBlobs: runtimeCriticalBlobs,
      sourceGateDigest: sha(sourceGatePath),
      preNonceGuardDigest: sha(preNonceGuardPath),
      issuedAuthority: authority,
    });
    assert.equal(validateStableOperationRuntimeBinding({
      control: admitted,
      appRoot: root,
      sourceGatePath,
      preNonceGuardPath,
      expectedRunId: admitted.run_id,
      expectedActor: admitted.actor,
      expectedAppSha: appSha,
      expectedShellSha: shellSha,
      expectedFrameworkSha: frameworkSha,
    }).authority_digest, admitted.authority_digest);
    fs.writeFileSync(path.join(root, '.github', 'workflows', '_release-bundle.yml'), 'drifted\n');
    assert.throws(
      () => validateStableOperationRuntimeBinding({
        control: admitted,
        appRoot: root,
        sourceGatePath,
        preNonceGuardPath,
        expectedRunId: admitted.run_id,
        expectedActor: admitted.actor,
        expectedAppSha: appSha,
        expectedShellSha: shellSha,
        expectedFrameworkSha: frameworkSha,
      }),
      /critical blob drifted/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pre-issued authority binds one matching actor and run, while expiry and issuer drift fail closed', () => {
  const issued = issuedAuthority();
  const control = bindStableOperationAuthority({
    authority: issued,
    authorityDigest: issued.authority_digest,
    actor: 'gaofeng21cn',
    runId: '30325431854',
    runAttempt: 1,
    sourceGateDigest,
    preNonceGuardDigest,
    now: '2026-07-28T00:30:00.000Z',
  });
  assert.equal(control.issued_authority.authority_id, issued.authority_id);
  assert.throws(
    () => bindStableOperationAuthority({
      authority: issued,
      authorityDigest: issued.authority_digest,
      actor: 'another-actor',
      runId: '30325431854',
      runAttempt: 1,
      sourceGateDigest,
      preNonceGuardDigest,
      now: '2026-07-28T00:30:00.000Z',
    }),
    /issuer does not match/,
  );
  assert.throws(
    () => bindStableOperationAuthority({
      authority: issued,
      authorityDigest: issued.authority_digest,
      actor: 'gaofeng21cn',
      runId: '30325431854',
      runAttempt: 1,
      sourceGateDigest,
      preNonceGuardDigest,
      now: '2026-07-28T01:00:00.000Z',
    }),
    /not currently valid/,
  );
  assert.throws(
    () => bindStableOperationAuthority({
      authority: issued,
      authorityDigest: issued.authority_digest,
      actor: 'gaofeng21cn',
      runId: '30325431854',
      runAttempt: 1,
      sourceGateDigest: `sha256:${'0'.repeat(64)}`,
      preNonceGuardDigest,
      now: '2026-07-28T00:30:00.000Z',
    }),
    /source-gate digest does not match/,
  );
});

function createHash(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
