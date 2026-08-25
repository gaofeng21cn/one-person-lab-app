import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  decodeBase64Strict,
  type CommandRunner,
  verifyAppleReleaseCredentials,
} from '../../scripts/verify-apple-release-credentials.ts';
import { createPosixModeTempRoot } from './native-posix-temp.ts';

const teamId = 'SVVC4TA784';
const identitySha = 'A'.repeat(40);
const identity = `Developer ID Application: Example Owner (${teamId})`;
const normalizedIdentity = `Example Owner (${teamId})`;
const originalKeychain = '/Users/runner/Library/Keychains/login.keychain-db';
const credentialEnv = {
  BUILD_CERTIFICATE_BASE64: Buffer.from('fixture-p12').toString('base64'),
  P12_PASSWORD: 'fixture-p12-password',
  APPLE_ID: 'release@example.invalid',
  APPLE_ID_PASSWORD: 'fixture-app-password',
  TEAM_ID: teamId,
  IDENTITY: normalizedIdentity,
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'gaofeng21cn/one-person-lab-app',
  GITHUB_WORKFLOW_REF:
    'gaofeng21cn/one-person-lab-app/.github/workflows/release-stable.yml@refs/heads/main',
  GITHUB_RUN_ID: '123456789',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: 'd'.repeat(40),
};

function successfulRunner(overrides: {
  teamId?: string;
  failCodesignArgs?: string[];
  codesignStderr?: string;
  failImport?: boolean;
  identityOutput?: string;
  notaryStdout?: string;
  notaryInfoStdout?: string;
  notaryLogStdout?: string;
  largeDmgOutputBytes?: number;
  failLargeDmgCodesign?: boolean;
} = {}) {
  const calls: Array<{
    command: string;
    args: string[];
    redactedArgs?: string[];
    timeoutMs?: number;
  }> = [];
  const runner: CommandRunner = (command, args, options) => {
    calls.push({
      command,
      args,
      redactedArgs: options?.redactedArgs,
      timeoutMs: options?.timeoutMs,
    });
    if (overrides.failImport && command === 'security' && args[0] === 'import') {
      return {
        status: 1,
        stdout: '',
        stderr: 'fixture import failed for fixture-p12-password',
      };
    }
    if (command === 'security' && args[0] === 'find-identity') {
      return {
        status: 0,
        stdout: overrides.identityOutput ?? `  1) ${identitySha} "${identity}"\n`,
        stderr: '',
      };
    }
    if (command === 'security' && args.join(' ') === 'list-keychains -d user') {
      return { status: 0, stdout: `    "${originalKeychain}"\n`, stderr: '' };
    }
    if (command === 'security' && args.join(' ') === 'default-keychain -d user') {
      return { status: 0, stdout: `    "${originalKeychain}"\n`, stderr: '' };
    }
    if (command === 'hdiutil' && args[0] === 'create') {
      fs.writeFileSync(args.at(-1)!, Buffer.alloc(overrides.largeDmgOutputBytes ?? 2_048, 0xa5));
      return { status: 0, stdout: '', stderr: '' };
    }
    if (
      overrides.failLargeDmgCodesign
      && command === 'codesign'
      && args.includes('--sign')
      && args.at(-1)?.endsWith('.dmg')
    ) {
      return {
        status: null,
        stdout: '',
        stderr: '',
        error: new Error('spawnSync codesign ETIMEDOUT'),
      };
    }
    if (
      overrides.failCodesignArgs
      && command === 'codesign'
      && overrides.failCodesignArgs.every((argument) => args.includes(argument))
    ) {
      return {
        status: 1,
        stdout: '',
        stderr: overrides.codesignStderr ?? 'fixture codesign failed',
      };
    }
    if (command === 'codesign' && args[0] === '-dv') {
      return {
        status: 0,
        stdout: '',
        stderr: [
          `Authority=${identity}`,
          `TeamIdentifier=${overrides.teamId ?? teamId}`,
          'Runtime Version=15.0.0',
          'Timestamp=Jul 25, 2026 at 12:00:00',
        ].join('\n'),
      };
    }
    if (command === 'xcrun') {
      if (args[1] === 'info') {
        return {
          status: 0,
          stdout: overrides.notaryInfoStdout ?? JSON.stringify({
            id: args[2],
            status: 'Accepted',
            createdDate: '2026-08-07T12:45:30.000Z',
            name: 'One-Person-Lab-Full.dmg',
          }),
          stderr: '',
        };
      }
      if (args[1] === 'log') {
        return {
          status: 0,
          stdout: overrides.notaryLogStdout ?? JSON.stringify({
            statusCode: 4000,
            statusSummary: 'Archive contains critical validation errors',
            issues: [{ severity: 'error', message: 'fixture issue' }],
          }),
          stderr: '',
        };
      }
      return {
        status: 0,
        stdout: overrides.notaryStdout ?? JSON.stringify({ history: [{
          id: '5AA959AB-6FD1-45BB-83EA-E5C9ED3E78F2',
          status: 'Accepted',
          createdDate: '2026-08-07T12:45:30.000Z',
          name: 'One-Person-Lab-Full.dmg',
        }] }),
        stderr: '',
      };
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  return { runner, calls };
}

test('strict base64 decoding rejects malformed or non-canonical certificate bytes', () => {
  assert.equal(decodeBase64Strict(Buffer.from('certificate').toString('base64')).toString(), 'certificate');
  assert.throws(() => decodeBase64Strict('not base64'), /not valid base64/);
  assert.throws(() => decodeBase64Strict('YQ==='), /not valid base64/);
});

test('large DMG canary signs a Full-sized ULMO shape with the system-default timestamp path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-apple-large-dmg-canary-'));
  const outputPath = path.join(root, 'receipt.json');
  const fixture = successfulRunner({ largeDmgOutputBytes: 2_048 });
  const receipt = verifyAppleReleaseCredentials({
    outputPath,
    largeDmgCanary: true,
    largeDmgCanaryPayloadBytes: 1_024,
    largeDmgCanaryMinimumBytes: 1_024,
    largeDmgCanaryMaximumBytes: 4_096,
    env: { ...credentialEnv, RUNNER_ARCH: 'ARM64', ImageOS: 'macos26', OPL_MACOS_RUNNER_LABEL: 'macos-latest' },
    platform: 'darwin',
    runner: fixture.runner,
  });

  assert.equal(receipt.signing.large_dmg_canary.status, 'passed');
  assert.equal(receipt.signing.large_dmg_canary.format, 'ULMO');
  assert.equal(receipt.signing.large_dmg_canary.timestamp_mode, 'system_default');
  assert.equal((receipt.signing.large_dmg_canary.runner as Record<string, unknown>).label, 'macos-latest');
  assert.equal((receipt.signing.large_dmg_canary.runner as Record<string, unknown>).architecture, 'ARM64');
  assert.equal(receipt.signing.large_dmg_canary.notarization_submission_performed, false);
  const create = fixture.calls.find((call) => call.command === 'hdiutil' && call.args[0] === 'create');
  assert.ok(create);
  assert.equal(create.args[create.args.indexOf('-format') + 1], 'ULMO');
  const largeSign = fixture.calls.find((call) => (
    call.command === 'codesign'
    && call.args.includes('--sign')
    && call.args.at(-1)?.endsWith('.dmg')
  ));
  assert.ok(largeSign);
  assert.equal(largeSign.args.includes('--timestamp'), true);
  assert.equal(largeSign.args.some((arg) => arg.startsWith('--timestamp=')), false);
  assert.equal(largeSign.timeoutMs, 20 * 60_000);
  assert.equal(
    fixture.calls.some((call) => call.command === 'xcrun' && call.args.includes('submit')),
    false,
  );
});

test('large DMG canary persists a sanitized typed timeout receipt without a notary submission', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-apple-large-dmg-timeout-'));
  const outputPath = path.join(root, 'receipt.json');
  const fixture = successfulRunner({
    largeDmgOutputBytes: 2_048,
    failLargeDmgCodesign: true,
  });
  assert.throws(
    () => verifyAppleReleaseCredentials({
      outputPath,
      largeDmgCanary: true,
      largeDmgCanaryPayloadBytes: 1_024,
      largeDmgCanaryMinimumBytes: 1_024,
      largeDmgCanaryMaximumBytes: 4_096,
      env: { ...credentialEnv, RUNNER_ARCH: 'X64' },
      platform: 'darwin',
      runner: fixture.runner,
    }),
    /ETIMEDOUT/,
  );
  const receiptText = fs.readFileSync(outputPath, 'utf8');
  const receipt = JSON.parse(receiptText);
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.signing.large_dmg_canary.failure.type, 'large_dmg_codesign_timeout');
  assert.equal(receipt.signing.large_dmg_canary.failure.stage, 'codesign_large_dmg');
  assert.equal(receipt.notarization.submission_performed, false);
  assert.equal(receipt.mutation.public_asset_write_performed, false);
  for (const sensitiveValue of [
    credentialEnv.IDENTITY,
    identity,
    identitySha,
    identitySha.toLowerCase(),
    credentialEnv.BUILD_CERTIFICATE_BASE64,
    credentialEnv.P12_PASSWORD,
    credentialEnv.APPLE_ID,
    credentialEnv.APPLE_ID_PASSWORD,
  ]) {
    assert.equal(receiptText.includes(sensitiveValue), false);
  }
});

test('large DMG canary rejects an unknown runner architecture before allocating its payload', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-apple-large-dmg-runner-'));
  const outputPath = path.join(root, 'receipt.json');
  const fixture = successfulRunner();
  assert.throws(
    () => verifyAppleReleaseCredentials({
      outputPath,
      largeDmgCanary: true,
      largeDmgCanaryPayloadBytes: 1_024,
      largeDmgCanaryMinimumBytes: 1_024,
      largeDmgCanaryMaximumBytes: 4_096,
      env: { ...credentialEnv, RUNNER_ARCH: 'PPC64' },
      platform: 'darwin',
      runner: fixture.runner,
    }),
    /requires a supported macOS GitHub runner architecture/,
  );
  const receipt = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(receipt.signing.large_dmg_canary.failure.type, 'large_dmg_runner_identity_failed');
  assert.equal(receipt.signing.large_dmg_canary.failure.stage, 'validate_runner');
  assert.equal(
    fixture.calls.some((call) => call.command === 'hdiutil'),
    false,
  );
});

test('Apple credential preflight imports the P12, signs a probe, and authenticates notarization read-only', () => {
  const root = createPosixModeTempRoot('opl-apple-credential-test-');
  const outputPath = path.join(root, 'receipt.json');
  const fixture = successfulRunner();
  const receipt = verifyAppleReleaseCredentials({
    outputPath,
    env: credentialEnv,
    platform: 'darwin',
    runner: fixture.runner,
    now: () => new Date('2026-07-25T04:00:00.000Z'),
  });

  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.execution.admission_eligible, true);
  assert.equal(receipt.execution.head_sha, 'd'.repeat(40));
  assert.equal(receipt.signing.configured_team_id_match, true);
  assert.equal(receipt.signing.configured_identity_selector_resolved, true);
  assert.equal(receipt.signing.probe_codesign_strict, 'passed');
  assert.equal(receipt.notarization.authentication, 'passed');
  assert.equal(receipt.notarization.history_count, 1);
  assert.deepEqual(receipt.notarization.recent_submissions, [{
    id: '5aa959ab-6fd1-45bb-83ea-e5c9ed3e78f2',
    status: 'Accepted',
    created_at: '2026-08-07T12:45:30.000Z',
    name: 'One-Person-Lab-Full.dmg',
  }]);
  assert.equal(receipt.notarization.submission_performed, false);
  assert.equal(receipt.mutation.release_dispatch_performed, false);
  assert.equal(receipt.mutation.public_asset_write_performed, false);
  assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
  assert.equal(
    fixture.calls.some((call) => call.command === 'codesign' && call.args.includes('--timestamp')),
    true,
  );
  assert.equal(
    fixture.calls.some((call) => (
      call.command === 'codesign'
      && call.args[call.args.indexOf('--sign') + 1] === identitySha
    )),
    true,
  );
  const signingCall = fixture.calls.find((call) => call.command === 'codesign' && call.args.includes('--sign'));
  assert.equal(signingCall?.redactedArgs?.[signingCall.redactedArgs.indexOf('--sign') + 1], '<resolved-imported-developer-id>');
  assert.equal(
    fixture.calls.some((call) => call.command === 'xcrun' && call.args.slice(0, 2).join(' ') === 'notarytool history'),
    true,
  );
  const keychainSearchUpdates = fixture.calls.filter((call) => (
    call.command === 'security'
    && call.args[0] === 'list-keychains'
    && call.args.includes('-s')
  ));
  assert.equal(keychainSearchUpdates.length, 2);
  assert.deepEqual(keychainSearchUpdates.at(-1)?.args, [
    'list-keychains',
    '-d',
    'user',
    '-s',
    originalKeychain,
  ]);
  const defaultKeychainUpdates = fixture.calls.filter((call) => (
    call.command === 'security'
    && call.args[0] === 'default-keychain'
    && call.args.includes('-s')
  ));
  assert.equal(defaultKeychainUpdates.length, 2);
  assert.deepEqual(defaultKeychainUpdates.at(-1)?.args, [
    'default-keychain',
    '-d',
    'user',
    '-s',
    originalKeychain,
  ]);
  const receiptText = fs.readFileSync(outputPath, 'utf8');
  for (const sensitiveValue of [
    credentialEnv.IDENTITY,
    identity,
    identitySha,
    identitySha.toLowerCase(),
    credentialEnv.BUILD_CERTIFICATE_BASE64,
    credentialEnv.P12_PASSWORD,
    credentialEnv.APPLE_ID,
    credentialEnv.APPLE_ID_PASSWORD,
  ]) {
    assert.doesNotMatch(receiptText, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Apple credential preflight reconciles one exact existing submission without submit, wait, or staple', () => {
  const root = createPosixModeTempRoot('opl-apple-submission-reconcile-');
  const outputPath = path.join(root, 'receipt.json');
  const submissionId = '5aa959ab-6fd1-45bb-83ea-e5c9ed3e78f2';
  const fixture = successfulRunner();
  const receipt = verifyAppleReleaseCredentials({
    outputPath,
    notarySubmissionId: submissionId,
    env: credentialEnv,
    platform: 'darwin',
    runner: fixture.runner,
  });

  assert.equal(receipt.notarization.submission_reconcile.submission_id, submissionId);
  assert.equal(receipt.notarization.submission_reconcile.apple_status, 'Accepted');
  assert.equal(receipt.notarization.submission_reconcile.log_fetched, false);
  assert.equal(receipt.mutation.notarization_submission_performed, false);
  assert.equal(receipt.mutation.notarization_resume_performed, false);
  assert.equal(receipt.mutation.notarization_staple_performed, false);
  const notaryCommands = fixture.calls
    .filter((call) => call.command === 'xcrun')
    .map((call) => call.args.slice(0, 2).join(' '));
  assert.deepEqual(notaryCommands, ['notarytool history', 'notarytool info']);
  assert.equal(fixture.calls.some((call) => call.args.includes('submit')), false);
  assert.equal(fixture.calls.some((call) => call.args.includes('wait')), false);
  assert.equal(fixture.calls.some((call) => call.args.includes('staple')), false);
});

test('Apple credential preflight fetches the exact log only for an invalid existing submission', () => {
  const root = createPosixModeTempRoot('opl-apple-submission-invalid-');
  const outputPath = path.join(root, 'receipt.json');
  const submissionId = '5aa959ab-6fd1-45bb-83ea-e5c9ed3e78f2';
  const fixture = successfulRunner({
    notaryInfoStdout: JSON.stringify({ id: submissionId, status: 'Invalid' }),
  });
  const receipt = verifyAppleReleaseCredentials({
    outputPath,
    notarySubmissionId: submissionId,
    env: credentialEnv,
    platform: 'darwin',
    runner: fixture.runner,
  });

  assert.equal(receipt.notarization.submission_reconcile.apple_status, 'Invalid');
  assert.equal(receipt.notarization.submission_reconcile.log_fetched, true);
  assert.equal(receipt.notarization.submission_reconcile.log.status_code, 4000);
  assert.equal(
    fixture.calls.some((call) => call.command === 'xcrun' && call.args[1] === 'log'),
    true,
  );
  assert.equal(fixture.calls.some((call) => call.args.includes('submit')), false);
});

test('Apple credential preflight rejects malformed and mismatched submission identities', () => {
  const root = createPosixModeTempRoot('opl-apple-submission-identity-');
  assert.throws(() => verifyAppleReleaseCredentials({
    outputPath: path.join(root, 'malformed.json'),
    notarySubmissionId: 'not-a-submission',
    env: credentialEnv,
    platform: 'darwin',
    runner: successfulRunner().runner,
  }), /exact UUID/);
  assert.throws(() => verifyAppleReleaseCredentials({
    outputPath: path.join(root, 'mismatch.json'),
    notarySubmissionId: '5aa959ab-6fd1-45bb-83ea-e5c9ed3e78f2',
    env: credentialEnv,
    platform: 'darwin',
    runner: successfulRunner({
      notaryInfoStdout: JSON.stringify({
        id: '00000000-0000-0000-0000-000000000001',
        status: 'Accepted',
      }),
    }).runner,
  }), /different submission ID/);
});

test('Apple credential preflight resolves normalized, full-name, and SHA-1 selectors to the imported SHA-1', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-apple-credential-selectors-'));
  for (const [index, selector] of [normalizedIdentity, identity, identitySha].entries()) {
    const fixture = successfulRunner();
    verifyAppleReleaseCredentials({
      outputPath: path.join(root, `selector-${index}.json`),
      env: { ...credentialEnv, IDENTITY: selector },
      platform: 'darwin',
      runner: fixture.runner,
    });
    const signingCall = fixture.calls.find((call) => call.command === 'codesign' && call.args.includes('--sign'));
    assert.equal(signingCall?.args[signingCall.args.indexOf('--sign') + 1], identitySha);
    assert.equal(
      signingCall?.redactedArgs?.[signingCall.redactedArgs.indexOf('--sign') + 1],
      '<resolved-imported-developer-id>',
    );
  }
});

test('Apple credential preflight rejects zero, duplicate, and wrong-Team selector matches before codesign', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-apple-credential-selector-failures-'));
  const noMatch = successfulRunner();
  assert.throws(
    () => verifyAppleReleaseCredentials({
      outputPath: path.join(root, 'no-match.json'),
      env: { ...credentialEnv, IDENTITY: 'Example Owner' },
      platform: 'darwin',
      runner: noMatch.runner,
    }),
    /does not resolve to an imported Developer ID Application identity/,
  );
  assert.equal(noMatch.calls.some((call) => call.command === 'codesign'), false);

  const duplicate = successfulRunner({
    identityOutput: [
      `  1) ${identitySha} "${identity}"`,
      `  2) ${'B'.repeat(40)} "${identity}"`,
      '     2 valid identities found',
    ].join('\n'),
  });
  assert.throws(
    () => verifyAppleReleaseCredentials({
      outputPath: path.join(root, 'duplicate.json'),
      env: credentialEnv,
      platform: 'darwin',
      runner: duplicate.runner,
    }),
    /resolves to multiple imported Developer ID Application identities/,
  );
  assert.equal(duplicate.calls.some((call) => call.command === 'codesign'), false);

  const wrongTeamSha = 'C'.repeat(40);
  const wrongTeamIdentity = 'Developer ID Application: Example Owner (OTHERTEAM1)';
  const wrongTeam = successfulRunner({
    identityOutput: `  1) ${wrongTeamSha} "${wrongTeamIdentity}"\n`,
  });
  assert.throws(
    () => verifyAppleReleaseCredentials({
      outputPath: path.join(root, 'wrong-team.json'),
      env: { ...credentialEnv, IDENTITY: wrongTeamSha },
      platform: 'darwin',
      runner: wrongTeam.runner,
    }),
    /identity Team ID does not match configured TEAM_ID/,
  );
  assert.equal(wrongTeam.calls.some((call) => call.command === 'codesign'), false);
});

test('Apple credential preflight fails closed on platform, Team ID, and notary response drift', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-apple-credential-failures-'));
  assert.throws(
    () => verifyAppleReleaseCredentials({
      outputPath: path.join(root, 'linux.json'),
      env: credentialEnv,
      platform: 'linux',
      runner: successfulRunner().runner,
    }),
    /requires a macOS runner/,
  );
  assert.throws(
    () => verifyAppleReleaseCredentials({
      outputPath: path.join(root, 'team.json'),
      env: credentialEnv,
      platform: 'darwin',
      runner: successfulRunner({ teamId: 'OTHERTEAM1' }).runner,
    }),
    /TeamIdentifier mismatch/,
  );
  assert.throws(
    () => verifyAppleReleaseCredentials({
      outputPath: path.join(root, 'ad-hoc.json'),
      env: { ...credentialEnv, IDENTITY: '-' },
      platform: 'darwin',
      runner: successfulRunner().runner,
    }),
    /ad-hoc signing is forbidden/,
  );
  assert.throws(
    () => verifyAppleReleaseCredentials({
      outputPath: path.join(root, 'notary.json'),
      env: credentialEnv,
      platform: 'darwin',
      runner: successfulRunner({ notaryStdout: 'not-json' }).runner,
    }),
    /did not return a JSON object/,
  );
  assert.throws(
    () => verifyAppleReleaseCredentials({
      outputPath: path.join(root, 'identity.json'),
      env: credentialEnv,
      platform: 'darwin',
      runner: successfulRunner({
        identityOutput: `  1) ${'B'.repeat(40)} "Apple Development: Example Owner (TEAM123456)"\n`,
      }).runner,
    }),
    /does not expose a Developer ID Application identity/,
  );
});

test('GitHub admission receipt requires canonical main and first-attempt workflow dispatch identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-apple-credential-authority-'));
  assert.throws(
    () => verifyAppleReleaseCredentials({
      outputPath: path.join(root, 'branch.json'),
      env: { ...credentialEnv, GITHUB_REF: 'refs/heads/feature' },
      platform: 'darwin',
      runner: successfulRunner().runner,
    }),
    /first-attempt workflow_dispatch on canonical App main/,
  );
  const receipt = verifyAppleReleaseCredentials({
    outputPath: path.join(root, 'local.json'),
    env: Object.fromEntries(
      Object.entries(credentialEnv).filter(([name]) => !name.startsWith('GITHUB_')),
    ),
    platform: 'darwin',
    runner: successfulRunner().runner,
  });
  assert.equal(receipt.execution.environment, 'local');
  assert.equal(receipt.execution.admission_eligible, false);
  assert.match(receipt.truth_boundary, /not_dispatch_admission/);
});

test('command diagnostics redact certificate and notarization passwords', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-apple-credential-redaction-'));
  assert.throws(
    () => verifyAppleReleaseCredentials({
      outputPath: path.join(root, 'receipt.json'),
      env: credentialEnv,
      platform: 'darwin',
      runner: successfulRunner({ failImport: true }).runner,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /fixture-p12-password|fixture-app-password/);
      assert.match(error.message, /<redacted>/);
      return true;
    },
  );
});

test('codesign diagnostics redact selector, full name, SHA-1, P12, and Apple credentials', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-apple-credential-identity-redaction-'));
  const diagnostic = [
    credentialEnv.IDENTITY,
    identity,
    identitySha,
    identitySha.toLowerCase(),
    credentialEnv.BUILD_CERTIFICATE_BASE64,
    credentialEnv.P12_PASSWORD,
    credentialEnv.APPLE_ID,
    credentialEnv.APPLE_ID_PASSWORD,
  ].join(' ');
  for (const failCodesignArgs of [['--sign'], ['--verify'], ['-dv']]) {
    const fixture = successfulRunner({ failCodesignArgs, codesignStderr: diagnostic });
    assert.throws(
      () => verifyAppleReleaseCredentials({
        outputPath: path.join(root, 'receipt.json'),
        env: credentialEnv,
        platform: 'darwin',
        runner: fixture.runner,
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        if (failCodesignArgs.includes('--sign')) {
          assert.match(error.message, /<resolved-imported-developer-id>/);
        }
        for (const sensitiveValue of [
          credentialEnv.IDENTITY,
          identity,
          identitySha,
          identitySha.toLowerCase(),
          credentialEnv.BUILD_CERTIFICATE_BASE64,
          credentialEnv.P12_PASSWORD,
          credentialEnv.APPLE_ID,
          credentialEnv.APPLE_ID_PASSWORD,
        ]) {
          assert.equal(error.message.includes(sensitiveValue), false);
        }
        return true;
      },
    );
    const keychainSearchUpdates = fixture.calls.filter((call) => (
      call.command === 'security'
      && call.args[0] === 'list-keychains'
      && call.args.includes('-s')
    ));
    assert.equal(keychainSearchUpdates.length, 2);
    assert.deepEqual(keychainSearchUpdates.at(-1)?.args, [
      'list-keychains',
      '-d',
      'user',
      '-s',
      originalKeychain,
    ]);
    const defaultKeychainUpdates = fixture.calls.filter((call) => (
      call.command === 'security'
      && call.args[0] === 'default-keychain'
      && call.args.includes('-s')
    ));
    assert.equal(defaultKeychainUpdates.length, 2);
    assert.deepEqual(defaultKeychainUpdates.at(-1)?.args, [
      'default-keychain',
      '-d',
      'user',
      '-s',
      originalKeychain,
    ]);
  }
});
