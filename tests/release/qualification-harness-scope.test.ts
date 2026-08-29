import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildQualificationHarnessScopeProof,
  collectRemoteChangedPaths,
  validateQualificationHarnessScopeProof,
} from '../../scripts/qualification-harness-scope.ts';

const artifactAppSha = 'a'.repeat(40);
const verificationAppSha = 'b'.repeat(40);
const artifactShellSha = 'c'.repeat(40);
const verificationShellSha = 'd'.repeat(40);

test('qualification harness scope allows a paired VM smoke mechanics subset', () => {
  const appChangedPaths = [
    '.github/workflows/_release-full-addon.yml',
    '.github/workflows/opl-first-run-vm.yml',
    '.github/workflows/opl-studio-candidate-carriers.yml',
    '.github/workflows/release-stable-post-success-followups.yml',
    '.github/workflows/release-stable.yml',
    'contracts/app-shell-candidates.json',
    'scripts/qualification-harness-scope.ts',
    'scripts/validate-release-boundary/release-checks.ts',
    'scripts/validate-release-boundary/text-check-runner.ts',
    'scripts/validate-shell-candidates/candidate-contract.ts',
    'scripts/verify-release-gateway-test-account.ts',
    'tests/release/app-release-boundary-cases/gui-delivery-topology-contract.test.ts',
    'tests/release/qualification-harness-scope.test.ts',
    'tests/release/release-bundle-workflow-cutover-cases/control-and-recovery.ts',
    'tests/release/release-bundle-workflow-cutover-cases/publication-and-operation-guards.ts',
    'tests/release/release-bundle-workflow-cutover-cases/target-and-protected-evidence.ts',
    'tests/release/release-bundle-workflow-cutover-cases/vm-and-reconcile.ts',
    'tests/release/release-gateway-test-account.test.ts',
    'tests/release/release-stable-post-success-followups.test.ts',
  ];
  const proof = buildQualificationHarnessScopeProof({
    artifactAppSha,
    verificationAppSha,
    appChangedPaths,
    artifactShellSha,
    verificationShellSha,
    shellChangedPaths: [
      'scripts/opl-first-run-vm-smoke.mjs',
      'tests/unit/opl-runtime/firstRunVmSmoke.test.ts',
    ],
  });

  assert.equal(proof.classification, 'harness_mechanics_only');
  assert.equal(proof.reuse_authorization.allowed, true);
  assert.equal(proof.reuse_authorization.reason, 'harness_mechanics_only');
  assert.deepEqual(proof.reuse_authorization.forbidden_paths.app, []);
  assert.deepEqual(proof.reuse_authorization.forbidden_paths.shell, []);
  assert.equal(proof.app.base_sha, artifactAppSha);
  assert.equal(proof.app.head_sha, verificationAppSha);
  assert.equal(proof.shell.base_sha, artifactShellSha);
  assert.equal(proof.shell.head_sha, verificationShellSha);
  assert.deepEqual(validateQualificationHarnessScopeProof(proof, {
    artifactAppSha,
    verificationAppSha,
    artifactShellSha,
    verificationShellSha,
  }), []);
});

test('malicious verifier weakening cannot qualify as same-artifact by changed path alone', () => {
  const proof = buildQualificationHarnessScopeProof({
    artifactAppSha,
    verificationAppSha: artifactAppSha,
    appChangedPaths: [],
    artifactShellSha,
    verificationShellSha,
    shellChangedPaths: ['src/main/services/oplRuntime.ts'],
    artifactExpectationDigest: '1'.repeat(64),
    verificationExpectationDigest: '1'.repeat(64),
    artifactProbeDigest: '2'.repeat(64),
    verificationProbeDigest: '2'.repeat(64),
  });
  assert.equal(proof.classification, 'new_cohort_required');
  assert.equal(proof.reuse_authorization.reason, 'shell_product_or_runtime_changed');
});

test('qualification harness scope requires a new cohort for every App change', () => {
  const proof = buildQualificationHarnessScopeProof({
      artifactAppSha,
      verificationAppSha,
      appChangedPaths: ['src/modules/app-state.ts'],
      artifactShellSha,
      verificationShellSha: artifactShellSha,
      shellChangedPaths: [],
    });
  assert.equal(proof.classification, 'new_cohort_required');
});

test('qualification harness scope requires a new cohort for Shell product or runtime changes', () => {
  const proof = buildQualificationHarnessScopeProof({
      artifactAppSha,
      verificationAppSha: artifactAppSha,
      appChangedPaths: [],
      artifactShellSha,
      verificationShellSha,
      shellChangedPaths: ['src/main/services/oplRuntime.ts'],
    });
  assert.equal(proof.classification, 'new_cohort_required');
});

test('qualification harness scope requires a new cohort when semantic expectations change', () => {
  const proof = buildQualificationHarnessScopeProof({
    artifactAppSha,
    verificationAppSha: artifactAppSha,
    appChangedPaths: [],
    artifactShellSha,
    verificationShellSha: artifactShellSha,
    shellChangedPaths: [],
    artifactExpectationDigest: '1'.repeat(64),
    verificationExpectationDigest: '2'.repeat(64),
    artifactProbeDigest: '3'.repeat(64),
    verificationProbeDigest: '4'.repeat(64),
  });
  assert.equal(proof.classification, 'new_cohort_required');
  assert.equal(proof.expectations.semantic_equal, false);
  assert.equal(proof.expectations.probe_equal, false);
});

test('qualification harness scope rejects SHA changes without changed paths', () => {
  assert.throws(
    () => buildQualificationHarnessScopeProof({
      artifactAppSha,
      verificationAppSha,
      appChangedPaths: [],
      artifactShellSha,
      verificationShellSha: artifactShellSha,
      shellChangedPaths: [],
    }),
    /SHA equality is inconsistent/,
  );
});

test('qualification harness scope validator rejects missing and tampered proof', () => {
  assert.deepEqual(validateQualificationHarnessScopeProof(undefined), [
    'qualification harness scope proof is missing or malformed',
  ]);
  const proof = buildQualificationHarnessScopeProof({
    artifactAppSha,
    verificationAppSha: artifactAppSha,
    appChangedPaths: [],
    artifactShellSha,
    verificationShellSha,
    shellChangedPaths: ['scripts/opl-first-run-vm-smoke.mjs'],
  });
  const tampered = structuredClone(proof);
  tampered.app.changed_paths = ['src/modules/app-state.ts'];
  assert.match(validateQualificationHarnessScopeProof(tampered).join('; '), /fields are inconsistent|SHA equality is inconsistent/);
});

test('remote qualification diff disables rename detection so forbidden source paths stay visible', () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const changedPaths = collectRemoteChangedPaths(
    (command, args) => {
      calls.push({ command, args });
      return {
        status: 0,
        stdout: args[0] === 'diff' ? '.github/workflows/opl-first-run-vm.yml\n' : '',
        stderr: '',
      };
    },
    'gaofeng21cn/one-person-lab-app',
    artifactAppSha,
    verificationAppSha,
  );

  assert.deepEqual(changedPaths, ['.github/workflows/opl-first-run-vm.yml']);
  const diffCall = calls.find((call) => call.command === 'git' && call.args[0] === 'diff');
  assert.ok(diffCall);
  assert.ok(diffCall.args.includes('--no-renames'));
  assert.ok(diffCall.args.includes('--name-only'));
});
