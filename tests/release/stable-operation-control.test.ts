import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
  canonicalJson,
  decodeStableOperationAuthorityCarrier,
  encodeStableOperationAuthorityCarrier,
  stableOperationIdForFrozenCohort,
  validateStableOperationAuthority,
  validateStableOperationAuthorityExecutorBinding,
  validateStableOperationConsumption,
  validateStableOperationControl,
  validateStableOperationRuntimeBinding,
} from '../../scripts/stable-operation-control.ts';

const appSha = '1'.repeat(40);
const shellSha = '2'.repeat(40);
const frameworkSha = '3'.repeat(40);
const nonce = 'a'.repeat(32);
const objectiveFingerprint = 'fix-all-five-stable-control-gaps-20260728';
const criticalBlobPaths = [
  '.github/workflows/release-stable.yml',
  '.github/workflows/_release-bundle.yml',
  '.github/workflows/_release-standard-publish.yml',
  '.github/workflows/_release-native-webui-carrier.yml',
  'contracts/app-release-channel.json',
  'scripts/framework-release-adapter.ts',
  'scripts/release-dispatch-guard.ts',
  'scripts/stable-operation-control.ts',
  'scripts/stable-operation-publication-record.ts',
  'scripts/stable-release-admission-manifest.ts',
  'scripts/validate-release-source-gate.ts',
];
const criticalBlobs = Object.fromEntries(
  criticalBlobPaths.map((file, index) => [
    file,
    `sha256:${'0123456789abcdef'[(index + 6) % 16]!.repeat(64)}`,
  ]),
);
const operationId = stableOperationIdForFrozenCohort({
  objectiveFingerprint,
  appSha,
  shellSha,
  frameworkSha,
  criticalBlobs,
});

function sourceGate(input: {
  generatedAt?: string;
  observedMainSha?: string;
  appSha?: string;
  shellSha?: string;
  frameworkSha?: string;
  objectiveFingerprint?: string;
} = {}) {
  return {
    schema: 'opl_app_release_source_gate.v1',
    generated_at: input.generatedAt ?? '2026-07-28T00:10:00.000Z',
    status: 'passed',
    operation_fingerprint: input.objectiveFingerprint ?? objectiveFingerprint,
    observed_main_sha: input.observedMainSha ?? appSha,
    admission: {
      status: 'passed',
      immutable_cohort: {
        app_sha: input.appSha ?? appSha,
        shell_sha: input.shellSha ?? shellSha,
        framework_sha: input.frameworkSha ?? frameworkSha,
      },
    },
    typed_blocker: null,
    checks: [{ id: 'app_frozen_commit_reachable', status: 'passed' }],
  };
}

function runAuthorityReconcile(input: {
  authorityId?: string;
  operationId?: string;
  runId?: string;
  ownerRunMatchCount?: number;
} = {}) {
  return {
    schema: 'opl_release_dispatch_guard.v1',
    phase: 'run_bound',
    status: 'passed',
    dispatch_allowed: true,
    operation_id: input.operationId ?? operationId,
    authority_id: input.authorityId ?? 'authority-stable-30325431854',
    run_id: input.runId ?? '30325431854',
    owner_run_match_count: input.ownerRunMatchCount ?? 1,
    nonce_consumed: false,
    mutation_invocation_count: 0,
  };
}

function preNonceGuard(input: { operationId?: string } = {}) {
  return {
    schema: 'opl_release_dispatch_guard.v1',
    phase: 'pre_nonce',
    status: 'passed',
    dispatch_allowed: true,
    operation_id: input.operationId ?? operationId,
    owner_run_match_count: 0,
    nonce_consumed: false,
    mutation_invocation_count: 0,
  };
}

function evidenceDigest(value: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function issuedAuthority(input: {
  criticalBlobs?: Record<string, string>;
  issuer?: string;
  nonce?: string;
  sourceGate?: Record<string, unknown>;
  preNonceGuard?: Record<string, unknown>;
} = {}) {
  const authorityCriticalBlobs = input.criticalBlobs ?? criticalBlobs;
  const authorityOperationId = stableOperationIdForFrozenCohort({
    objectiveFingerprint,
    appSha,
    shellSha,
    frameworkSha,
    criticalBlobs: authorityCriticalBlobs,
  });
  return createStableOperationAuthority({
    authorityId: 'authority-stable-30325431854',
    operationId: authorityOperationId,
    issuer: input.issuer ?? 'gaofeng21cn',
    issuedAt: '2026-07-28T00:00:00.000Z',
    expiresAt: '2026-07-28T01:00:00.000Z',
    objectiveFingerprint,
    nonce: input.nonce ?? nonce,
    appSha,
    shellSha,
    frameworkSha,
    criticalBlobs: authorityCriticalBlobs,
    sourceGate: input.sourceGate ?? sourceGate(),
    preNonceGuard: input.preNonceGuard ?? preNonceGuard({ operationId: authorityOperationId }),
  });
}

function control() {
  return createStableOperationControl({
    operationId,
    actor: 'gaofeng21cn',
    runId: '30325431854',
    runAttempt: 1,
    nonce,
    appSha,
    shellSha,
    frameworkSha,
    criticalBlobs,
    sourceGateDigest: evidenceDigest(sourceGate()),
    preNonceGuardDigest: evidenceDigest(preNonceGuard()),
    runAuthorityReconcileDigest: evidenceDigest(runAuthorityReconcile()),
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
  assert.throws(() => validateStableOperationControl(legacy), /Stable operation authority must be one JSON object/);
  assert.throws(
    () => createStableOperationControl({
      operationId,
      actor: 'gaofeng21cn',
      runId: '30325431854',
      runAttempt: 1,
      nonce,
      appSha,
      shellSha,
      frameworkSha,
      criticalBlobs,
      sourceGateDigest: evidenceDigest(sourceGate()),
      preNonceGuardDigest: evidenceDigest(preNonceGuard()),
      runAuthorityReconcileDigest: evidenceDigest(runAuthorityReconcile()),
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

test('Stable authority fixes pre-submit bytes while later generated_at and observed main changes stay observational', () => {
  const authority = issuedAuthority({
    sourceGate: sourceGate({
      generatedAt: '2026-07-28T00:10:00.000Z',
      observedMainSha: appSha,
    }),
  });
  const laterObservation = sourceGate({
    generatedAt: '2026-07-28T00:20:00.000Z',
    observedMainSha: '4'.repeat(40),
  });
  assert.notEqual(
    evidenceDigest(authority.pre_dispatch_evidence.source_gate),
    evidenceDigest(laterObservation),
  );
  assert.equal(
    validateStableOperationAuthority(authority).authority_digest,
    authority.authority_digest,
  );
  assert.throws(
    () => issuedAuthority({ sourceGate: sourceGate({ shellSha: '5'.repeat(40) }) }),
    /Pre-dispatch authority evidence must contain one passed zero-consumer pre-nonce guard/,
  );
});

test('Stable executor may advance on unrelated main bytes while the frozen authority remains valid', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stable-operation-executor-'));
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    git('init');
    git('config', 'user.name', 'OPL Test');
    git('config', 'user.email', 'opl-test@example.invalid');
    for (const relativePath of criticalBlobPaths) {
      const destination = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, `${relativePath}\n`);
    }
    git('add', '.');
    git('commit', '-m', 'frozen stable authority');
    const frozenAppSha = git('rev-parse', 'HEAD');
    const runtimeCriticalBlobs = Object.fromEntries(
      criticalBlobPaths.map((relativePath) => [
        relativePath,
        `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relativePath))).digest('hex')}`,
      ]),
    );
    const frozenOperationId = stableOperationIdForFrozenCohort({
      objectiveFingerprint,
      appSha: frozenAppSha,
      shellSha,
      frameworkSha,
      criticalBlobs: runtimeCriticalBlobs,
    });
    const frozenSourceGate = sourceGate({
      appSha: frozenAppSha,
      observedMainSha: frozenAppSha,
    });
    const authority = createStableOperationAuthority({
      authorityId: 'authority-stable-unrelated-main-advance',
      operationId: frozenOperationId,
      issuer: 'gaofeng21cn',
      issuedAt: '2026-07-28T00:00:00.000Z',
      expiresAt: '2026-07-28T01:00:00.000Z',
      objectiveFingerprint,
      nonce,
      appSha: frozenAppSha,
      shellSha,
      frameworkSha,
      criticalBlobs: runtimeCriticalBlobs,
      sourceGate: frozenSourceGate,
      preNonceGuard: preNonceGuard({ operationId: frozenOperationId }),
    });

    fs.writeFileSync(path.join(root, 'unrelated-main-advance.txt'), 'unrelated\n');
    git('add', 'unrelated-main-advance.txt');
    git('commit', '-m', 'unrelated main advance');
    const executorSha = git('rev-parse', 'HEAD');
    assert.notEqual(executorSha, frozenAppSha);
    assert.equal(
      validateStableOperationAuthorityExecutorBinding({
        authority,
        appRoot: root,
        expectedActor: 'gaofeng21cn',
        expectedExecutorSha: executorSha,
      }).cohort.app_sha,
      frozenAppSha,
    );

    fs.writeFileSync(path.join(root, 'scripts', 'stable-operation-control.ts'), 'drifted\n');
    assert.throws(
      () => validateStableOperationAuthorityExecutorBinding({
        authority,
        appRoot: root,
        expectedActor: 'gaofeng21cn',
        expectedExecutorSha: executorSha,
      }),
      /critical blob drifted/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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
  const tampered = structuredClone(consumed);
  tampered.run_authority_reconcile_digest = admitted.source_gate_digest;
  assert.throws(
    () => validateStableOperationConsumption(tampered, admitted),
    /does not bind one exact control record/,
  );
});

test('Stable operation control rejects a drifted critical blob and a mismatched nonce', () => {
  const admitted = control();
  const drifted = structuredClone(admitted);
  drifted.critical_blobs['contracts/app-release-channel.json'] = `sha256:${'9'.repeat(64)}`;
  assert.throws(() => validateStableOperationControl(drifted), /cohort or critical blob bindings do not match/);
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

test('Stable operation authority requires the terminal publication verifier in its frozen critical blobs', () => {
  const omittedVerifier = { ...criticalBlobs };
  delete omittedVerifier['scripts/stable-operation-publication-record.ts'];
  assert.throws(
    () => issuedAuthority({ criticalBlobs: omittedVerifier }),
    /critical_blobs must bind exactly the Stable control paths/,
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
    const runAuthorityReconcilePath = path.join(root, 'run-authority-reconcile.json');
    fs.writeFileSync(sourceGatePath, canonicalJson(sourceGate()));
    const sha = (file: string) => `sha256:${createHash(fs.readFileSync(file))}`;
    const runtimeCriticalBlobs = Object.fromEntries(
      criticalBlobPaths.map((relativePath) => [relativePath, sha(path.join(root, relativePath))]),
    );
    const authority = issuedAuthority({
      criticalBlobs: runtimeCriticalBlobs,
      sourceGate: sourceGate(),
    });
    fs.writeFileSync(
      preNonceGuardPath,
      canonicalJson(preNonceGuard({ operationId: authority.operation_id })),
    );
    fs.writeFileSync(
      runAuthorityReconcilePath,
      canonicalJson(runAuthorityReconcile({ operationId: authority.operation_id })),
    );
    const admitted = createStableOperationControl({
      operationId: authority.operation_id,
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
      runAuthorityReconcileDigest: sha(runAuthorityReconcilePath),
      issuedAuthority: authority,
    });
    assert.equal(validateStableOperationRuntimeBinding({
      control: admitted,
      appRoot: root,
      sourceGatePath,
      preNonceGuardPath,
      runAuthorityReconcilePath,
      expectedRunId: admitted.run_id,
      expectedActor: admitted.actor,
      expectedAppSha: appSha,
      expectedShellSha: shellSha,
      expectedFrameworkSha: frameworkSha,
    }).authority_digest, admitted.authority_digest);
    fs.writeFileSync(
      runAuthorityReconcilePath,
      canonicalJson(runAuthorityReconcile({
        authorityId: authority.authority_id,
        operationId: authority.operation_id,
        runId: '30325431855',
      })),
    );
    assert.throws(
      () => validateStableOperationRuntimeBinding({
        control: admitted,
        appRoot: root,
        sourceGatePath,
        preNonceGuardPath,
        runAuthorityReconcilePath,
        expectedRunId: admitted.run_id,
        expectedActor: admitted.actor,
        expectedAppSha: appSha,
        expectedShellSha: shellSha,
        expectedFrameworkSha: frameworkSha,
      }),
      /run-authority reconcile digest drifted/,
    );
    fs.writeFileSync(
      runAuthorityReconcilePath,
      canonicalJson(runAuthorityReconcile({
        authorityId: authority.authority_id,
        operationId: authority.operation_id,
        runId: admitted.run_id,
      })),
    );
    fs.writeFileSync(path.join(root, '.github', 'workflows', '_release-bundle.yml'), 'drifted\n');
    assert.throws(
      () => validateStableOperationRuntimeBinding({
        control: admitted,
        appRoot: root,
        sourceGatePath,
        preNonceGuardPath,
        runAuthorityReconcilePath,
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
    sourceGateDigest: evidenceDigest(sourceGate()),
    preNonceGuardDigest: evidenceDigest(preNonceGuard()),
    runAuthorityReconcileDigest: evidenceDigest(runAuthorityReconcile()),
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
      sourceGateDigest: evidenceDigest(sourceGate()),
      preNonceGuardDigest: evidenceDigest(preNonceGuard()),
      runAuthorityReconcileDigest: evidenceDigest(runAuthorityReconcile()),
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
      sourceGateDigest: evidenceDigest(sourceGate()),
      preNonceGuardDigest: evidenceDigest(preNonceGuard()),
      runAuthorityReconcileDigest: evidenceDigest(runAuthorityReconcile()),
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
      preNonceGuardDigest: evidenceDigest(preNonceGuard()),
      runAuthorityReconcileDigest: evidenceDigest(runAuthorityReconcile()),
      now: '2026-07-28T00:30:00.000Z',
    }),
    /source-gate digest does not match/,
  );
  assert.throws(
    () => bindStableOperationAuthority({
      authority: issued,
      authorityDigest: issued.authority_digest,
      actor: 'gaofeng21cn',
      runId: '30325431854',
      runAttempt: 1,
      sourceGateDigest: evidenceDigest(sourceGate()),
      preNonceGuardDigest: evidenceDigest(sourceGate()),
      runAuthorityReconcileDigest: evidenceDigest(runAuthorityReconcile()),
      now: '2026-07-28T00:30:00.000Z',
    }),
    /pre-nonce guard digest does not match/,
  );
});

function createHash(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
