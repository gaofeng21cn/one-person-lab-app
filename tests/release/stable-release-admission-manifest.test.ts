import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  buildStableReleaseAdmissionManifest,
  canonicalJson,
  firstDifference,
  parseGitHubJsonLookup,
  stableAdmissionManifestDigest,
  type StableAdmissionInput,
  type StableAdmissionObservation,
} from '../../scripts/stable-release-admission-manifest.ts';
import * as stableOperationControlSource from '../../scripts/stable-operation-control.ts';

const appRoot = path.resolve(import.meta.dirname, '../..');
const appRef = '1'.repeat(40);
const shellRef = '2'.repeat(40);
const frameworkRef = '3'.repeat(40);
const admissionRunId = '30150000001';
const workflowPaths = [
  '.github/workflows/release-stable.yml',
  '.github/workflows/_release-bundle.yml',
  '.github/workflows/_release-standard-publish.yml',
  'scripts/validate-release-source-gate.ts',
  'scripts/stable-release-admission-manifest.ts',
  'scripts/release-dispatch-guard.ts',
  'scripts/stable-operation-control.ts',
  'scripts/verify-apple-release-credentials.ts',
  'contracts/app-release-channel.json',
];
const stableOperationControl = stableOperationControlSource as unknown as {
  canonicalJson(value: unknown): string;
  stableOperationIdForFrozenCohort(input: Record<string, unknown>): string;
  createStableOperationAuthority(input: Record<string, unknown>): any;
  validateStableOperationAuthority(value: unknown): any;
  bindStableOperationAuthority(input: Record<string, unknown>): any;
  consumeStableOperationControl(input: Record<string, unknown>): any;
  validateStableOperationConsumption(value: unknown, control: unknown): any;
};
const operationControlPaths = [
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
const operationControlBlobs = Object.fromEntries(
  operationControlPaths.map((file, index) => [
    file,
    `sha256:${'0123456789abcdef'[(index + 1) % 16]!.repeat(64)}`,
  ]),
);
const requiredSecretNames = [
  'BUILD_CERTIFICATE_BASE64',
  'P12_PASSWORD',
  'APPLE_ID',
  'APPLE_ID_PASSWORD',
  'TEAM_ID',
  'IDENTITY',
];

function input(): StableAdmissionInput {
  return {
    baseVersion: '26.7.25',
    appRef,
    shellRef,
    frameworkRef,
    admissionRunId,
  };
}

function receipt() {
  return {
    schema: 'opl_apple_release_credentials_preflight.v1',
    status: 'passed',
    checked_at: '2026-07-25T05:00:00.000Z',
    platform: 'darwin',
    protected_environment: 'release-stable',
    execution: {
      environment: 'github_actions',
      admission_eligible: true,
      repository: 'gaofeng21cn/one-person-lab-app',
      workflow_ref:
        'gaofeng21cn/one-person-lab-app/.github/workflows/release-stable.yml@refs/heads/main',
      run_id: admissionRunId,
      run_attempt: 1,
      event_name: 'workflow_dispatch',
      ref: 'refs/heads/main',
      head_sha: appRef,
    },
    required_secret_names: [...requiredSecretNames],
    required_secret_count: requiredSecretNames.length,
    signing: {
      configured_identity_selector_resolved: true,
      configured_team_id_match: true,
      developer_id_application: true,
      hardened_runtime: true,
      trusted_timestamp: true,
      probe_codesign_strict: 'passed',
    },
    notarization: {
      authentication: 'passed',
      command: 'xcrun notarytool history',
      history_count: 1,
      submission_performed: false,
    },
    mutation: {
      release_dispatch_performed: false,
      notarization_submission_performed: false,
      public_asset_write_performed: false,
    },
  };
}

function sourceGate(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'opl_app_release_source_gate.v1',
    generated_at: '2026-07-28T00:10:00.000Z',
    status: 'passed',
    typed_blocker: null,
    operation_fingerprint: 'fix-all-five-stable-control-gaps-20260728',
    observed_main_sha: appRef,
    admission: {
      status: 'passed',
      immutable_cohort: {
        app_sha: appRef,
        shell_sha: shellRef,
        framework_sha: frameworkRef,
      },
    },
    checks: [{ id: 'app_frozen_commit_reachable', status: 'passed' }],
    ...overrides,
  };
}

function preNonceGuard(operationId: string) {
  return {
    schema: 'opl_release_dispatch_guard.v1',
    phase: 'pre_nonce',
    status: 'passed',
    dispatch_allowed: true,
    operation_id: operationId,
    owner_run_match_count: 0,
    nonce_consumed: false,
    mutation_invocation_count: 0,
  };
}

function runAuthorityReconcile(input: { operationId: string; authorityId: string; runId: string }) {
  return {
    schema: 'opl_release_dispatch_guard.v1',
    phase: 'run_bound',
    status: 'passed',
    dispatch_allowed: true,
    operation_id: input.operationId,
    authority_id: input.authorityId,
    run_id: input.runId,
    owner_run_match_count: 1,
    nonce_consumed: false,
    mutation_invocation_count: 0,
  };
}

function evidenceDigest(value: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(stableOperationControl.canonicalJson(value)).digest('hex')}`;
}

function observation(overrides: Partial<StableAdmissionObservation> = {}): StableAdmissionObservation {
  const credentialReceipt = receipt();
  const frozenSourceGate = sourceGate();
  const releaseContract = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts', 'app-release-channel.json'), 'utf8'),
  );
  return {
    checkedAt: '2026-07-25T05:01:00.000Z',
    currentDate: '2026-07-25',
    workflowBlobs: workflowPaths.map((workflowPath, index) => ({
      path: workflowPath,
      git_blob_sha: (index + 4).toString(16).repeat(40),
      sha256: `sha256:${((index + 11) % 16).toString(16).repeat(64)}`,
    })),
    sourceGate: frozenSourceGate,
    sourceGateBytes: Buffer.from(`${JSON.stringify(frozenSourceGate)}\n`),
    credentialReceipt,
    credentialReceiptBytes: Buffer.from(`${JSON.stringify(credentialReceipt)}\n`),
    publishedReleases: [
      { tag_name: 'v26.7.24-r3', draft: false, prerelease: false },
      { tag_name: 'v26.7.24', draft: false, prerelease: false },
    ],
    tagRefs: [],
    webuiTags: ['latest', 'stable', '26.7.25', '26.7.24-r3'],
    homebrewCask: {
      repository: 'gaofeng21cn/homebrew-one-person-lab',
      path: 'Casks/one-person-lab.rb',
      git_blob_sha: 'b'.repeat(40),
      bytes: Buffer.from('cask "one-person-lab" do\n  version "26.7.24"\nend\n'),
    },
    homebrewPolicy: releaseContract,
    activeReleaseRuns: [],
    ...overrides,
  };
}

test('single Stable admission manifest allocates the first unused cross-namespace revision', () => {
  const manifest = buildStableReleaseAdmissionManifest(input(), observation());
  assert.equal(manifest.status, 'passed');
  assert.deepEqual(manifest.cohort, {
    app_sha: appRef,
    shell_sha: shellRef,
    framework_sha: frameworkRef,
  });
  assert.equal(manifest.version.display, '26.7.25-r1');
  assert.equal(manifest.version.updater, '26.7.2501');
  assert.equal(manifest.version.tag, 'v26.7.25-r1');
  assert.deepEqual(manifest.allocator.observed_same_day_versions, ['26.7.25']);
  assert.deepEqual(manifest.namespace.webui_tags, ['26.7.25']);
  assert.equal(manifest.apple_credentials.required_secret_count, 6);
  assert.equal(manifest.source_gate.producer_run_id, admissionRunId);
  assert.equal(manifest.source_gate.frozen_cohort_reachable, true);
  assert.equal(manifest.source_gate.release_authority, false);
  assert.equal(manifest.source_gate.final_signed_byte_authority, false);
  assert.deepEqual(manifest.apple_credentials.required_secret_names, requiredSecretNames);
  assert.deepEqual(manifest.dispatcher_contract.accepted_inputs, [
    'operation',
    'authority_id',
    'operation_id',
    'authority_carrier',
    'authority_digest',
  ]);
  assert.equal(manifest.dispatcher_contract.raw_standard_version_or_ref_inputs_allowed, false);
  const { manifest_digest: digest, ...core } = manifest;
  assert.equal(digest, stableAdmissionManifestDigest(core));
  assert.equal(canonicalJson(manifest), canonicalJson(JSON.parse(JSON.stringify(manifest))));
});

test('admission retains the frozen three-repository cohort without reading moving main', () => {
  const manifest = buildStableReleaseAdmissionManifest(input(), observation());
  assert.deepEqual(manifest.cohort, {
    app_sha: appRef,
    shell_sha: shellRef,
    framework_sha: frameworkRef,
  });
});

test('admission records an executor SHA independently from the frozen App cohort', () => {
  const credentialReceipt = receipt();
  credentialReceipt.execution.head_sha = 'd'.repeat(40);
  const manifest = buildStableReleaseAdmissionManifest(input(), observation({
    credentialReceipt,
    credentialReceiptBytes: Buffer.from(`${JSON.stringify(credentialReceipt)}\n`),
  }));
  assert.equal(manifest.cohort.app_sha, appRef);
  assert.equal(manifest.apple_credentials.executor_sha, 'd'.repeat(40));
});

test('admission retains its frozen Framework cohort from the source gate', () => {
  const manifest = buildStableReleaseAdmissionManifest(input(), observation());
  assert.equal(manifest.cohort.framework_sha, frameworkRef);
  assert.equal(manifest.source_gate.frozen_cohort_reachable, true);
});

test('admission fails closed when the frozen source gate does not bind the exact Stable cohort', () => {
  const frozenSourceGate = sourceGate({
    admission: {
      status: 'passed',
      immutable_cohort: { app_sha: appRef, shell_sha: 'f'.repeat(40), framework_sha: frameworkRef },
    },
  });
  assert.throws(
    () => buildStableReleaseAdmissionManifest(input(), observation({
      sourceGate: frozenSourceGate,
      sourceGateBytes: Buffer.from(`${JSON.stringify(frozenSourceGate)}\n`),
    })),
    /does not prove the exact reachable Stable cohort/,
  );
});

test('admission rejects a source gate without a frozen operation fingerprint', () => {
  const frozenSourceGate = sourceGate({ operation_fingerprint: '' });
  assert.throws(
    () => buildStableReleaseAdmissionManifest(input(), observation({
      sourceGate: frozenSourceGate,
      sourceGateBytes: Buffer.from(`${JSON.stringify(frozenSourceGate)}\n`),
    })),
    /operation fingerprint/,
  );
});

test('pre-issued authority binds distinct frozen source, pre-nonce, and run-bound evidence', () => {
  const objectiveFingerprint = 'fix-all-five-stable-control-gaps-20260728';
  const operationId = stableOperationControl.stableOperationIdForFrozenCohort({
    objectiveFingerprint,
    appSha: appRef,
    shellSha: shellRef,
    frameworkSha: frameworkRef,
    criticalBlobs: operationControlBlobs,
  });
  const frozenSourceGate = sourceGate({ operation_fingerprint: objectiveFingerprint });
  const frozenPreNonceGuard = preNonceGuard(operationId);
  const authority = stableOperationControl.createStableOperationAuthority({
    authorityId: 'authority-stable-30150000001',
    operationId,
    issuer: 'gaofeng21cn',
    issuedAt: '2026-07-28T00:00:00.000Z',
    expiresAt: '2026-07-28T01:00:00.000Z',
    objectiveFingerprint,
    nonce: 'a'.repeat(32),
    appSha: appRef,
    shellSha: shellRef,
    frameworkSha: frameworkRef,
    criticalBlobs: operationControlBlobs,
    sourceGate: frozenSourceGate,
    preNonceGuard: frozenPreNonceGuard,
  });
  assert.equal(stableOperationControl.validateStableOperationAuthority(authority).authority_digest, authority.authority_digest);

  const laterObservation = sourceGate({
    generated_at: '2026-07-28T00:20:00.000Z',
    observed_main_sha: '4'.repeat(40),
    operation_fingerprint: objectiveFingerprint,
  });
  assert.notEqual(evidenceDigest(frozenSourceGate), evidenceDigest(laterObservation));
  assert.equal(
    stableOperationControl.stableOperationIdForFrozenCohort({
      objectiveFingerprint,
      appSha: appRef,
      shellSha: shellRef,
      frameworkSha: frameworkRef,
      criticalBlobs: operationControlBlobs,
    }),
    operationId,
  );
  assert.equal(stableOperationControl.validateStableOperationAuthority(authority).operation_id, operationId);

  const tamperedAuthority = structuredClone(authority);
  tamperedAuthority.pre_dispatch_evidence.source_gate.generated_at = '2026-07-28T00:30:00.000Z';
  assert.throws(() => stableOperationControl.validateStableOperationAuthority(tamperedAuthority));

  const runBoundEvidence = runAuthorityReconcile({
    operationId,
    authorityId: authority.authority_id,
    runId: admissionRunId,
  });
  const laterRunReadback = runAuthorityReconcile({
    operationId,
    authorityId: authority.authority_id,
    runId: '30150000002',
  });
  assert.notEqual(evidenceDigest(runBoundEvidence), evidenceDigest(laterRunReadback));
  assert.equal(
    stableOperationControl.validateStableOperationAuthority(authority).operation_id,
    operationId,
    'later run readback and live-main observations do not replace the pre-issued frozen authority',
  );
  assert.throws(() => stableOperationControl.bindStableOperationAuthority({
    authority,
    authorityDigest: authority.authority_digest,
    actor: 'gaofeng21cn',
    runId: admissionRunId,
    runAttempt: 1,
    sourceGateDigest: authority.pre_nonce_guard_digest,
    preNonceGuardDigest: authority.source_gate_digest,
    runAuthorityReconcileDigest: evidenceDigest(runBoundEvidence),
    now: '2026-07-28T00:30:00.000Z',
  }));

  const control = stableOperationControl.bindStableOperationAuthority({
    authority,
    authorityDigest: authority.authority_digest,
    actor: 'gaofeng21cn',
    runId: admissionRunId,
    runAttempt: 1,
    sourceGateDigest: authority.source_gate_digest,
    preNonceGuardDigest: authority.pre_nonce_guard_digest,
    runAuthorityReconcileDigest: evidenceDigest(runBoundEvidence),
    now: '2026-07-28T00:30:00.000Z',
  });
  const consumption = stableOperationControl.consumeStableOperationControl({
    control,
    operationId,
    runId: admissionRunId,
    runAttempt: 1,
    nonce: authority.nonce,
  });
  const tamperedConsumption = structuredClone(consumption);
  tamperedConsumption.run_authority_reconcile_digest = control.source_gate_digest;
  assert.throws(
    () => stableOperationControl.validateStableOperationConsumption(tamperedConsumption, control),
  );
});

test('admission fails closed when a release writer is already active', () => {
  const active = observation({
    activeReleaseRuns: [{
      id: 30150000002,
      path: '.github/workflows/release-stable.yml',
      status: 'in_progress',
      head_sha: appRef,
    }],
  });
  assert.throws(
    () => buildStableReleaseAdmissionManifest(input(), active),
    /zero other active release runs/,
  );
});

test('admission requires exact 6/6 Apple secret names and runtime proof', () => {
  const credentialReceipt = receipt();
  credentialReceipt.required_secret_names.pop();
  credentialReceipt.required_secret_count = 5;
  assert.throws(
    () => buildStableReleaseAdmissionManifest(input(), observation({
      credentialReceipt,
      credentialReceiptBytes: Buffer.from(JSON.stringify(credentialReceipt)),
    })),
    /exact 6\/6 protected secret names/,
  );
});

test('admission rejects Homebrew policy drift before Standard dispatch', () => {
  const homebrewPolicy = structuredClone(observation().homebrewPolicy);
  homebrewPolicy.homebrew_tap_distribution.tap_update_policy.app_release_workflow_write_mode =
    'unprotected_retrying_push';
  assert.throws(
    () => buildStableReleaseAdmissionManifest(input(), observation({ homebrewPolicy })),
    /Homebrew tap update policy/,
  );
});

test('admission rejects a stale base version and an occupied allocated namespace', () => {
  assert.throws(
    () => buildStableReleaseAdmissionManifest(
      { ...input(), baseVersion: '26.7.24' },
      observation(),
    ),
    /must match Asia\/Shanghai date/,
  );
  const fullyOccupied = observation({
    webuiTags: [
      '26.7.25',
      '26.7.25-r1',
      '26.7.25-r2',
      '26.7.25-r3',
      '26.7.25-r4',
      '26.7.25-r5',
      '26.7.25-r6',
      '26.7.25-r7',
      '26.7.25-r8',
      '26.7.25-r9',
    ],
  });
  assert.throws(
    () => buildStableReleaseAdmissionManifest(input(), fullyOccupied),
    /revisions stop at r9/,
  );
});

test('GitHub lookup failures and non-JSON responses fail closed', () => {
  assert.throws(
    () => parseGitHubJsonLookup('repos/example/releases', {
      status: 1,
      stdout: '',
      stderr: 'HTTP 503',
    }),
    /GitHub lookup repos\/example\/releases failed[\s\S]*HTTP 503/,
  );
  assert.throws(
    () => parseGitHubJsonLookup('repos/example/releases', {
      status: 0,
      stdout: '<html>bad gateway</html>',
      stderr: '',
    }),
    /did not return JSON/,
  );
});

test('manifest comparison accepts equal nested objects and reports exact drift pointers', () => {
  const actual = {
    allocator: {
      selected_version: '26.7.25-r1',
      observed_same_day_versions: ['26.7.25'],
    },
  };
  assert.equal(firstDifference(actual, structuredClone(actual)), null);
  assert.equal(
    firstDifference(actual, {
      allocator: {
        ...actual.allocator,
        selected_version: '26.7.25-r2',
      },
    }),
    '$.allocator.selected_version',
  );
});

test('manifest digest changes for workflow or receipt drift', () => {
  const current = buildStableReleaseAdmissionManifest(input(), observation());
  const workflowDrift = observation();
  workflowDrift.workflowBlobs[0] = {
    ...workflowDrift.workflowBlobs[0]!,
    sha256: `sha256:${'f'.repeat(64)}`,
  };
  const changed = buildStableReleaseAdmissionManifest(input(), workflowDrift);
  assert.notEqual(changed.manifest_digest, current.manifest_digest);
});
