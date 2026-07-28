import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  bindStableOperationAuthority,
  canonicalJson,
  consumeStableOperationControl,
  createStableOperationAuthority,
  stableOperationIdForFrozenCohort,
} from '../../scripts/stable-operation-control.ts';
import {
  createStableOperationPublicationRecord,
  createStableOperationPublishedCarrierBinding,
  createStableOperationMissingControlRecord,
  validateStableOperationPublicationRecord,
  validateStableOperationPublishedCarrierBinding,
  validateStableOperationMissingControlRecord,
} from '../../scripts/stable-operation-publication-record.ts';

const appSha = '1'.repeat(40);
const shellSha = '2'.repeat(40);
const frameworkSha = '3'.repeat(40);
const nonce = 'a'.repeat(32);
const objectiveFingerprint = 'fix-all-five-stable-control-gaps-20260728';
const repository = 'gaofeng21cn/one-person-lab-app';
const tag = 'v26.7.28-r4';
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
    `sha256:${'0123456789abcdef'[(index + 3) % 16]!.repeat(64)}`,
  ]),
);

function sha256(bytes: Buffer | string): string {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function sourceGate(): Record<string, unknown> {
  return {
    schema: 'opl_app_release_source_gate.v1',
    generated_at: '2026-07-28T00:15:00.000Z',
    status: 'passed',
    operation_fingerprint: objectiveFingerprint,
    typed_blocker: null,
    admission: {
      status: 'passed',
      immutable_cohort: {
        app_sha: appSha,
        shell_sha: shellSha,
        framework_sha: frameworkSha,
      },
    },
    checks: [
      {
        id: 'app_frozen_commit_reachable',
        status: 'passed',
      },
    ],
  };
}

function preNonceGuard(operationId: string): Record<string, unknown> {
  return {
    schema: 'opl_release_dispatch_guard.v1',
    phase: 'pre_nonce',
    status: 'passed',
    dispatch_allowed: true,
    operation_id: operationId,
    owner_run_match_count: 0,
    nonce_consumed: false,
    source_gate: {
      schema: 'opl_app_release_source_gate.v1',
      status: 'passed',
      exact_cohort_bound: true,
    },
  };
}

function fixture() {
  const sourceGateBytes = Buffer.from(canonicalJson(sourceGate()), 'utf8');
  const operationId = stableOperationIdForFrozenCohort({
    objectiveFingerprint,
    appSha,
    shellSha,
    frameworkSha,
    criticalBlobs,
  });
  const preNonceGuardValue = preNonceGuard(operationId);
  const preNonceGuardBytes = Buffer.from(canonicalJson(preNonceGuardValue), 'utf8');
  const authority = createStableOperationAuthority({
    authorityId: 'authority-stable-30325431854',
    operationId,
    issuer: 'gaofeng21cn',
    issuedAt: '2026-07-28T00:00:00.000Z',
    expiresAt: '2026-07-28T01:00:00.000Z',
    objectiveFingerprint,
    nonce,
    appSha,
    shellSha,
    frameworkSha,
    criticalBlobs,
    sourceGate: sourceGate(),
    preNonceGuard: preNonceGuardValue,
  });
  const runAuthorityReconcile = {
    schema: 'opl_release_dispatch_guard.v1',
    phase: 'run_bound',
    status: 'passed',
    dispatch_allowed: true,
    operation_id: authority.operation_id,
    authority_id: authority.authority_id,
    run_id: '30325431854',
    owner_run_match_count: 1,
    nonce_consumed: false,
    mutation_invocation_count: 0,
  };
  const runAuthorityReconcileBytes = Buffer.from(canonicalJson(runAuthorityReconcile), 'utf8');
  const control = bindStableOperationAuthority({
    authority,
    authorityDigest: authority.authority_digest,
    actor: authority.issuer,
    runId: '30325431854',
    runAttempt: 1,
    sourceGateDigest: sha256(sourceGateBytes),
    preNonceGuardDigest: sha256(preNonceGuardBytes),
    runAuthorityReconcileDigest: sha256(runAuthorityReconcileBytes),
    now: '2026-07-28T00:30:00.000Z',
  });
  const consumption = consumeStableOperationControl({
    control,
    operationId: control.operation_id,
    runId: control.run_id,
    runAttempt: 1,
    nonce,
  });
  return {
    authority,
    control,
    consumption,
    sourceGateBytes,
    preNonceGuardBytes,
    runAuthorityReconcileBytes,
  };
}

function publicationRecord() {
  const inputs = fixture();
  return createStableOperationPublicationRecord({
    ...inputs,
    repository,
    tag,
    plannedAssets: plannedPayloadAssets(),
  });
}

function plannedPayloadAssets() {
  return {
    assets: [
      {
        name: 'OnePersonLab-26.7.28-r4.dmg',
        digest: `sha256:${'b'.repeat(64)}`,
        size_bytes: 131_072,
      },
    ],
  };
}

function expectedAssets(record: ReturnType<typeof publicationRecord>) {
  return {
    assets: [
      ...record.publication_intent.payload_assets,
      {
        name: 'stable-operation-publication-record.json',
        digest: sha256(canonicalJson(record)),
        size_bytes: Buffer.byteLength(canonicalJson(record), 'utf8'),
      },
    ],
  };
}

function inspection(record: ReturnType<typeof publicationRecord>, options: {
  immutable?: boolean;
  assets?: unknown[];
} = {}) {
  const assets = options.assets ?? [...expectedAssets(record).assets].reverse();
  return {
    repository,
    tag,
    assets,
    release: {
      id: 360_830_750,
      draft: false,
      immutable: options.immutable ?? true,
    },
  };
}

test('publication record canonically preserves the exact authority, control, consumption, and source evidence bytes', () => {
  const inputs = fixture();
  const first = createStableOperationPublicationRecord({
    ...inputs,
    repository,
    tag,
    plannedAssets: plannedPayloadAssets(),
  });
  const second = createStableOperationPublicationRecord({
    ...inputs,
    repository,
    tag,
    plannedAssets: plannedPayloadAssets(),
  });

  assert.deepEqual(first, second);
  assert.equal(first.record_asset.name, 'stable-operation-publication-record.json');
  assert.equal(first.evidence_transport.actions_artifact.role, 'transient_transport_only');
  assert.equal(first.evidence_transport.actions_artifact.durable_authority, false);
  assert.equal(first.operation.authority.authority_digest, inputs.authority.authority_digest);
  assert.equal(first.operation.run_bound_control.run_id, inputs.control.run_id);
  assert.equal(first.operation.single_use_consumption.consumption_digest, inputs.consumption.consumption_digest);
  assert.equal(first.publication_intent.mutation, 'release_publish');
  assert.equal(first.publication_intent.publish_once_after_exact_payload_assets, true);
  assert.deepEqual(first.publication_intent.payload_assets, plannedPayloadAssets().assets);
  assert.equal('published_carrier' in first, false);
  assert.equal(validateStableOperationPublicationRecord(first).publication_record_digest, first.publication_record_digest);
  const { publication_record_digest, ...core } = first;
  assert.equal(sha256(canonicalJson(core)), publication_record_digest);
});

test('publication record rejects tampered or missing durable operation evidence', () => {
  const record = publicationRecord();
  const tampered = structuredClone(record);
  tampered.operation.pre_dispatch_evidence.source_gate.bytes_base64 = Buffer.from('{"tampered":true}', 'utf8').toString('base64');
  assert.throws(
    () => validateStableOperationPublicationRecord(tampered),
    /SHA-256 digest does not match/,
  );

  const missing = structuredClone(record) as Record<string, unknown>;
  delete ((missing.operation as Record<string, unknown>).single_use_consumption);
  assert.throws(
    () => validateStableOperationPublicationRecord(missing),
    /Stable operation consumption must be one JSON object/,
  );

  const wrongRunReconcile = structuredClone(record);
  wrongRunReconcile.operation.run_authority_reconcile.sha256 = `sha256:${'0'.repeat(64)}`;
  assert.throws(
    () => validateStableOperationPublicationRecord(wrongRunReconcile),
    /SHA-256 digest does not match/,
  );

  const changedPlan = structuredClone(record);
  changedPlan.publication_intent.payload_assets[0]!.digest = `sha256:${'0'.repeat(64)}`;
  assert.throws(
    () => validateStableOperationPublicationRecord(changedPlan),
    /digest binding is invalid/,
  );
});

test('published carrier validation binds immutable identity and exact unique asset digests', () => {
  const record = publicationRecord();
  const expected = expectedAssets(record);
  const binding = createStableOperationPublishedCarrierBinding({
    record,
    githubInspection: inspection(record),
    expectedAssets: expected,
  });

  assert.equal(binding.published_carrier.immutable, true);
  assert.deepEqual(
    binding.published_carrier.assets.map((asset) => asset.name),
    ['OnePersonLab-26.7.28-r4.dmg', 'stable-operation-publication-record.json'],
  );
  assert.equal(
    validateStableOperationPublishedCarrierBinding(binding).published_carrier_binding_digest,
    binding.published_carrier_binding_digest,
  );

  assert.throws(
    () => createStableOperationPublishedCarrierBinding({
      record,
      githubInspection: inspection(record, { immutable: false }),
      expectedAssets: expected,
    }),
    /immutable must be exactly true/,
  );

  const duplicate = [...expected.assets, { ...expected.assets[0]! }];
  assert.throws(
    () => createStableOperationPublishedCarrierBinding({
      record,
      githubInspection: inspection(record, { assets: duplicate }),
      expectedAssets: expected,
    }),
    /duplicate asset name/,
  );
});

test('create CLI writes one idempotent canonical release asset and verify-published consumes read-only JSON input', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stable-operation-publication-record-'));
  try {
    const inputs = fixture();
    const write = (name: string, value: unknown) => {
      const filePath = path.join(root, name);
      fs.writeFileSync(filePath, canonicalJson(value));
      return filePath;
    };
    const authority = write('authority.json', inputs.authority);
    const control = write('control.json', inputs.control);
    const consumption = write('consumption.json', inputs.consumption);
    const sourceGate = path.join(root, 'source-gate.json');
    const preNonceGuard = path.join(root, 'pre-nonce-guard.json');
    const runAuthorityReconcile = path.join(root, 'run-authority-reconcile.json');
    const plannedAssets = write('planned-assets.json', plannedPayloadAssets());
    fs.writeFileSync(sourceGate, inputs.sourceGateBytes);
    fs.writeFileSync(preNonceGuard, inputs.preNonceGuardBytes);
    fs.writeFileSync(runAuthorityReconcile, inputs.runAuthorityReconcileBytes);
    const output = path.join(root, 'stable-operation-publication-record.json');
    const script = path.resolve('scripts/stable-operation-publication-record.ts');
    const args = [
      '--experimental-strip-types',
      script,
      'create',
      '--authority', authority,
      '--control', control,
      '--consumption', consumption,
      '--source-gate', sourceGate,
      '--pre-nonce-guard', preNonceGuard,
      '--run-authority-reconcile', runAuthorityReconcile,
      '--planned-assets', plannedAssets,
      '--repository', repository,
      '--tag', tag,
      '--output', output,
    ];
    const first = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const second = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr);

    const record = JSON.parse(fs.readFileSync(output, 'utf8')) as ReturnType<typeof publicationRecord>;
    assert.equal(fs.readFileSync(output, 'utf8'), canonicalJson(record));

    const inspectionPath = write('inspection.json', inspection(record));
    const expectedAssetsPath = write('expected-assets.json', expectedAssets(record));
    const verified = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        script,
        'verify-published',
        '--record', output,
        '--github-inspection', inspectionPath,
        '--expected-assets', expectedAssetsPath,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(verified.status, 0, verified.stderr);
    const binding = JSON.parse(verified.stdout) as Record<string, unknown>;
    assert.equal(binding.status, 'published_immutable');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('historical r3 missing control state is explicit, digest-bound, and cannot contain retrofitted authority evidence', () => {
  const historical = createStableOperationMissingControlRecord({
    repository,
    tag: 'v26.7.28-r3',
    releaseId: 360_830_749,
    immutable: false,
  });

  assert.equal(historical.status, 'missing_control_record');
  assert.equal(historical.historical_readback.reason, 'historical_operation_predates_durable_control');
  assert.equal(
    validateStableOperationMissingControlRecord(historical).missing_control_record_digest,
    historical.missing_control_record_digest,
  );

  const fabricated = structuredClone(historical) as Record<string, unknown>;
  fabricated.operation = fixture().authority;
  assert.throws(
    () => validateStableOperationMissingControlRecord(fabricated),
    /must not fabricate authority/,
  );
});
