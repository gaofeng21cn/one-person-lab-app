import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  notarizationObservationDeadlineMs,
  notarizationWaitTimeoutSeconds,
  preNotarizationCommandTimeoutMs,
  timestampSigningMaximumAttempts,
  timestampSigningTimeoutMs,
} from '../../scripts/notarize-macos-dmg.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scriptPath = path.join(appRoot, 'scripts', 'notarize-macos-dmg.ts');
const teamId = 'SVVC4TA784';
const identity = `Developer ID Application: FENG GAO (${teamId})`;
const submissionId = '00000000-0000-0000-0000-000000000001';
const timestampAuthoritySelection = 'system_default';

function writeExecutable(filePath: string, source: string): void {
  fs.writeFileSync(filePath, source, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

function fixture(
  waitStatus: 'Accepted' | 'In Progress' | 'unknown',
  timestampSigningBehavior:
    | 'success'
    | 'probe-timeout'
    | 'probe-timeout-once'
    | 'probe-timeout-all'
    | 'probe-fail'
    | 'timeout-once'
    | 'timeout-three'
    | 'timeout-all'
    | 'fail' = 'success',
  notaryInfoStatuses: Array<'Accepted' | 'In Progress' | 'Rejected' | 'Invalid' | 'unknown'> = [waitStatus],
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-notarize-dmg-test-'));
  const binaryRoot = path.join(root, 'bin');
  const commandLog = path.join(root, 'commands.log');
  const dmgPath = path.join(root, 'One-Person-Lab-Full.dmg');
  const outputPath = path.join(root, 'receipt.json');
  const submittedCandidateOutputPath = path.join(root, 'submitted-candidate.dmg');
  const timestampSigningAttemptFile = path.join(root, 'timestamp-signing-attempts');
  const timestampProbeAttemptFile = path.join(root, 'timestamp-probe-attempts');
  const notaryInfoAttemptFile = path.join(root, 'notary-info-attempts');
  const notaryInfoStatusFile = path.join(root, 'notary-info-statuses');
  fs.mkdirSync(binaryRoot);
  fs.writeFileSync(dmgPath, 'full-dmg-fixture', 'utf8');
  fs.writeFileSync(notaryInfoStatusFile, `${notaryInfoStatuses.join('\n')}\n`, 'utf8');

  writeExecutable(path.join(binaryRoot, 'hdiutil'), `#!/bin/sh
printf 'hdiutil %s\n' "$*" >> "$OPL_TEST_COMMAND_LOG"
if [ "$1" = attach ]; then
  mountpoint=''
  previous=''
  for argument in "$@"; do
    if [ "$previous" = -mountpoint ]; then mountpoint="$argument"; fi
    previous="$argument"
  done
  mkdir -p "$mountpoint/One Person Lab.app/Contents/MacOS"
fi
exit 0
`);
  writeExecutable(path.join(binaryRoot, 'codesign'), `#!/bin/sh
printf 'codesign %s\n' "$*" >> "$OPL_TEST_COMMAND_LOG"
if [ "$1" = --force ]; then
  target=''
  for argument in "$@"; do target="$argument"; done
  case "$target" in
    *timestamp-service-probe)
      probe_attempt=0
      if [ -f "$OPL_TEST_TIMESTAMP_PROBE_ATTEMPT_FILE" ]; then
        probe_attempt=$(cat "$OPL_TEST_TIMESTAMP_PROBE_ATTEMPT_FILE")
      fi
      probe_attempt=$((probe_attempt + 1))
      printf '%s' "$probe_attempt" > "$OPL_TEST_TIMESTAMP_PROBE_ATTEMPT_FILE"
      if [ "$OPL_TEST_TIMESTAMP_SIGNING_BEHAVIOR" = probe-timeout ] || [ "$OPL_TEST_TIMESTAMP_SIGNING_BEHAVIOR" = probe-timeout-all ] || { [ "$OPL_TEST_TIMESTAMP_SIGNING_BEHAVIOR" = probe-timeout-once ] && [ "$probe_attempt" -eq 1 ]; }; then
        sleep 2
        exit 0
      fi
      if [ "$OPL_TEST_TIMESTAMP_SIGNING_BEHAVIOR" = probe-fail ]; then
        echo 'timestamp service probe failed' >&2
        exit 42
      fi
      exit 0
      ;;
  esac
fi
if [ "$1" = --force ]; then
  case "$2" in
    --timestamp) ;;
    *) exit 0 ;;
  esac
  attempt=0
  if [ -f "$OPL_TEST_TIMESTAMP_SIGNING_ATTEMPT_FILE" ]; then
    attempt=$(cat "$OPL_TEST_TIMESTAMP_SIGNING_ATTEMPT_FILE")
  fi
  attempt=$((attempt + 1))
  printf '%s' "$attempt" > "$OPL_TEST_TIMESTAMP_SIGNING_ATTEMPT_FILE"
  if [ "$OPL_TEST_TIMESTAMP_SIGNING_BEHAVIOR" = timeout-once ] && [ "$attempt" -eq 1 ]; then
    printf '%s' '-partial-signature' >> "$target"
    sleep 2
    exit 0
  fi
  if [ "$OPL_TEST_TIMESTAMP_SIGNING_BEHAVIOR" = timeout-three ] && [ "$attempt" -le 3 ]; then
    printf '%s' '-partial-signature' >> "$target"
    sleep 2
    exit 0
  fi
  if [ "$OPL_TEST_TIMESTAMP_SIGNING_BEHAVIOR" = timeout-all ]; then
    printf '%s' '-partial-signature' >> "$target"
    sleep 2
    exit 0
  fi
  if { [ "$OPL_TEST_TIMESTAMP_SIGNING_BEHAVIOR" = timeout-once ] || [ "$OPL_TEST_TIMESTAMP_SIGNING_BEHAVIOR" = timeout-three ]; } && [ "$(cat "$target")" != full-dmg-fixture ]; then
    echo 'retry candidate was not restored from the original DMG' >&2
    exit 42
  fi
  if [ "$OPL_TEST_TIMESTAMP_SIGNING_BEHAVIOR" = fail ]; then
    echo 'timestamp service rejected signing' >&2
    exit 42
  fi
fi
case "$*" in
  *"-dv --verbose=4"*)
    echo 'Authority=${identity}' >&2
    echo 'Authority=Developer ID Certification Authority' >&2
    echo 'Authority=Apple Root CA' >&2
    echo 'Timestamp=Aug 2, 2026 at 00:00:00' >&2
    echo 'TeamIdentifier=${teamId}' >&2
    echo 'Runtime Version=26.0.0' >&2
    ;;
esac
exit 0
`);
  writeExecutable(path.join(binaryRoot, 'spctl'), `#!/bin/sh
printf 'spctl %s\n' "$*" >> "$OPL_TEST_COMMAND_LOG"
exit 0
`);
  writeExecutable(path.join(binaryRoot, 'xcrun'), `#!/bin/sh
printf 'xcrun %s\n' "$*" >> "$OPL_TEST_COMMAND_LOG"
if [ "$1" = notarytool ] && [ "$2" = submit ]; then
  printf '%s\n' '{"id":"${submissionId}","status":"In Progress"}'
  exit 0
fi
if [ "$1" = notarytool ] && [ "$2" = wait ]; then
  printf '%s\n' '{"id":"${submissionId}","status":"${waitStatus}"}'
  if [ '${waitStatus}' = Accepted ]; then exit 0; else exit 1; fi
fi
if [ "$1" = notarytool ] && [ "$2" = info ]; then
  attempt=0
  if [ -f "$OPL_TEST_NOTARY_INFO_ATTEMPT_FILE" ]; then
    attempt=$(cat "$OPL_TEST_NOTARY_INFO_ATTEMPT_FILE")
  fi
  attempt=$((attempt + 1))
  printf '%s' "$attempt" > "$OPL_TEST_NOTARY_INFO_ATTEMPT_FILE"
  status=$(sed -n "\${attempt}p" "$OPL_TEST_NOTARY_INFO_STATUS_FILE")
  if [ -z "$status" ]; then status=$(tail -n 1 "$OPL_TEST_NOTARY_INFO_STATUS_FILE"); fi
  printf '{"id":"${submissionId}","status":"%s"}\n' "$status"
  exit 0
fi
exit 0
`);

  const deadlineAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    scriptPath,
    '--dmg',
    dmgPath,
    '--output',
    outputPath,
    '--submitted-candidate-output',
    submittedCandidateOutputPath,
    '--operation-deadline-at',
    deadlineAt,
  ], {
    cwd: appRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      OPL_NOTARIZATION_TEST_MODE: 'true',
      OPL_NOTARIZATION_TEST_COMMAND_ROOT: binaryRoot,
      OPL_TEST_COMMAND_LOG: commandLog,
      OPL_TEST_TIMESTAMP_SIGNING_ATTEMPT_FILE: timestampSigningAttemptFile,
      OPL_TEST_TIMESTAMP_PROBE_ATTEMPT_FILE: timestampProbeAttemptFile,
      OPL_TEST_NOTARY_INFO_ATTEMPT_FILE: notaryInfoAttemptFile,
      OPL_TEST_NOTARY_INFO_STATUS_FILE: notaryInfoStatusFile,
      OPL_NOTARIZATION_TEST_NOTARY_POLL_INTERVAL_MS: '1',
      OPL_NOTARIZATION_TEST_NOTARY_POLL_MAX_MS: '25',
      OPL_TEST_TIMESTAMP_SIGNING_BEHAVIOR: timestampSigningBehavior,
      ...(timestampSigningBehavior === 'timeout-once'
        || timestampSigningBehavior === 'timeout-three'
        || timestampSigningBehavior === 'timeout-all'
        ? { OPL_NOTARIZATION_TEST_TIMESTAMP_SIGNING_TIMEOUT_MS: '500' }
        : {}),
      ...(timestampSigningBehavior === 'probe-timeout'
        || timestampSigningBehavior === 'probe-timeout-once'
        || timestampSigningBehavior === 'probe-timeout-all'
        ? { OPL_NOTARIZATION_TEST_TIMESTAMP_PROBE_TIMEOUT_MS: '500' }
        : {}),
      OPL_RUNTIME_CODESIGN_IDENTITY: identity,
      appleId: 'release-owner@example.invalid',
      appleIdPassword: 'test-app-password',
      teamId,
    },
  });

  return {
    root,
    result,
    receipt: JSON.parse(fs.readFileSync(outputPath, 'utf8')) as Record<string, any>,
    submittedCandidateOutputPath,
    commands: fs.readFileSync(commandLog, 'utf8'),
    timestampSigningAttempts: fs.existsSync(timestampSigningAttemptFile)
      ? Number(fs.readFileSync(timestampSigningAttemptFile, 'utf8'))
      : 0,
    timestampProbeAttempts: fs.existsSync(timestampProbeAttemptFile)
      ? Number(fs.readFileSync(timestampProbeAttemptFile, 'utf8'))
      : 0,
    notaryInfoAttempts: fs.existsSync(notaryInfoAttemptFile)
      ? Number(fs.readFileSync(notaryInfoAttemptFile, 'utf8'))
      : 0,
  };
}

function fullTimestampSigningCommandCount(commands: string): number {
  return commands.split('\n').filter((line) => (
    line.startsWith('codesign --force --timestamp --sign ')
    && line.endsWith('.notarizing.dmg')
  )).length;
}

test('notarization wait budget preserves the exact post-notarization reserve', () => {
  assert.equal(notarizationWaitTimeoutSeconds({
    operationDeadlineAt: '2026-08-01T02:00:00.000Z',
    nowMs: Date.parse('2026-08-01T01:00:00.000Z'),
  }), 40 * 60);
  assert.throws(() => notarizationWaitTimeoutSeconds({
    operationDeadlineAt: '2026-08-01T01:20:59.000Z',
    nowMs: Date.parse('2026-08-01T01:00:00.000Z'),
  }), /twenty minutes of operation reserve/);
});

test('notarization observation is capped below the ARM runner timeout while preserving operation reserve', () => {
  const nowMs = Date.parse('2026-08-01T01:00:00.000Z');
  assert.equal(notarizationObservationDeadlineMs({
    operationDeadlineAt: '2026-08-01T03:00:00.000Z',
    nowMs,
  }), nowMs + 30 * 60_000);
  assert.equal(notarizationObservationDeadlineMs({
    operationDeadlineAt: '2026-08-01T01:25:00.000Z',
    nowMs,
  }), nowMs + 5 * 60_000);
});

test('pre-notarization commands use the remaining operation budget without consuming notarization reserve', () => {
  assert.equal(preNotarizationCommandTimeoutMs({}), 45 * 60_000);
  assert.equal(preNotarizationCommandTimeoutMs({
    operationDeadlineAt: '2026-08-01T02:00:00.000Z',
    nowMs: Date.parse('2026-08-01T00:23:00.000Z'),
  }), 76 * 60_000);
  assert.equal(preNotarizationCommandTimeoutMs({
    operationDeadlineAt: '2026-08-01T01:30:00.000Z',
    nowMs: Date.parse('2026-08-01T01:00:00.000Z'),
  }), 9 * 60_000);
  assert.throws(() => preNotarizationCommandTimeoutMs({
    operationDeadlineAt: '2026-08-01T01:20:59.000Z',
    nowMs: Date.parse('2026-08-01T01:00:00.000Z'),
  }), /twenty minutes of operation reserve/);
});

test('timestamp signing caps each attempt while preserving the notary and post-notary reserves', () => {
  assert.equal(timestampSigningTimeoutMs({}), 5 * 60_000);
  assert.equal(timestampSigningTimeoutMs({
    operationDeadlineAt: '2026-08-01T02:00:00.000Z',
    nowMs: Date.parse('2026-08-01T01:00:00.000Z'),
  }), 5 * 60_000);
  assert.equal(timestampSigningTimeoutMs({
    operationDeadlineAt: '2026-08-01T01:45:00.000Z',
    nowMs: Date.parse('2026-08-01T01:00:00.000Z'),
  }), 5 * 60_000);
  assert.throws(() => timestampSigningTimeoutMs({
    operationDeadlineAt: '2026-08-01T01:40:00.000Z',
    nowMs: Date.parse('2026-08-01T01:00:00.000Z'),
  }), /twenty minutes of operation reserve/);
});

test('large DMG signing uses two bounded attempts after the timestamp service probe', () => {
  const largeDmgBytes = 512 * 1024 * 1024;
  const nowMs = Date.parse('2026-08-01T01:00:00.000Z');
  const operationDeadlineAt = '2026-08-01T02:40:00.000Z';

  assert.equal(timestampSigningMaximumAttempts(largeDmgBytes - 1), 4);
  assert.equal(timestampSigningMaximumAttempts(largeDmgBytes), 2);
  assert.equal(timestampSigningTimeoutMs({
    operationDeadlineAt,
    nowMs,
    artifactSizeBytes: largeDmgBytes,
    attemptNumber: 1,
  }), 5 * 60_000);
  assert.equal(timestampSigningTimeoutMs({
    operationDeadlineAt,
    nowMs: nowMs + 50 * 60_000,
    artifactSizeBytes: largeDmgBytes,
    attemptNumber: 2,
  }), 5 * 60_000);
  assert.equal(timestampSigningTimeoutMs({
    operationDeadlineAt,
    nowMs,
    artifactSizeBytes: largeDmgBytes,
    attemptNumber: 1,
    attemptLimitMs: 500,
  }), 500);
});

test('timestamp service probe fails before the Full DMG or notary is invoked', () => {
  const value = fixture('Accepted', 'probe-timeout');
  try {
    assert.notEqual(value.result.status, 0);
    assert.equal(value.timestampSigningAttempts, 0);
    assert.equal(value.timestampProbeAttempts, 2);
    assert.equal(value.receipt.timestamp_signing.authority_endpoint, timestampAuthoritySelection);
    assert.equal(value.receipt.timestamp_signing.probe_status, 'failed');
    assert.equal(value.receipt.timestamp_signing.probe_attempts, 2);
    assert.equal(value.receipt.timestamp_signing.probe_retry_count, 1);
    assert.deepEqual(value.receipt.timestamp_signing.probe_attempt_timeouts_seconds, [0, 0]);
    assert.equal(value.receipt.failure.code, 'timestamp_service_probe_failed');
    assert.equal(value.receipt.failure.stage, 'probe_timestamp_service');
    assert.equal(fullTimestampSigningCommandCount(value.commands), 0);
    assert.doesNotMatch(value.commands, /notarytool submit/);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('timestamp service probe retries one timeout from a fresh probe copy', () => {
  const value = fixture('Accepted', 'probe-timeout-once');
  try {
    assert.equal(value.result.status, 0, value.result.stderr);
    assert.equal(value.timestampProbeAttempts, 2);
    assert.equal(value.receipt.timestamp_signing.probe_status, 'passed');
    assert.equal(value.receipt.timestamp_signing.probe_attempts, 2);
    assert.equal(value.receipt.timestamp_signing.probe_retry_count, 1);
    assert.deepEqual(value.receipt.timestamp_signing.probe_attempt_timeouts_seconds, [0, 0]);
    assert.equal(fullTimestampSigningCommandCount(value.commands), 1);
    assert.equal((value.commands.match(/notarytool submit/g) ?? []).length, 1);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('timestamp service probe does not retry a non-timeout failure', () => {
  const value = fixture('Accepted', 'probe-fail');
  try {
    assert.notEqual(value.result.status, 0);
    assert.equal(value.timestampProbeAttempts, 1);
    assert.equal(value.receipt.timestamp_signing.probe_attempts, 1);
    assert.equal(value.receipt.timestamp_signing.probe_retry_count, 0);
    assert.equal(value.receipt.failure.code, 'timestamp_service_probe_failed');
    assert.equal(value.receipt.failure.retry_disposition, 'new_operation_required_no_retry');
    assert.equal(fullTimestampSigningCommandCount(value.commands), 0);
    assert.doesNotMatch(value.commands, /notarytool submit/);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('timestamp signing retries one timeout from a fresh original DMG copy', () => {
  const value = fixture('Accepted', 'timeout-once');
  try {
    assert.equal(value.result.status, 0, value.result.stderr);
    assert.equal(value.timestampSigningAttempts, 2);
    assert.equal(value.receipt.timestamp_signing.probe_status, 'passed');
    assert.equal(value.receipt.timestamp_signing.authority_endpoint, timestampAuthoritySelection);
    assert.equal(value.receipt.timestamp_signing.attempts, 2);
    assert.equal(value.receipt.timestamp_signing.retry_count, 1);
    assert.deepEqual(value.receipt.timestamp_signing.attempt_timeouts_seconds, [0, 0]);
    assert.equal(value.receipt.timestamp_signing.strategy, 'small_dmg_bounded_attempts');
    assert.equal(fullTimestampSigningCommandCount(value.commands), 2);
    assert.equal((value.commands.match(/notarytool submit/g) ?? []).length, 1);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('timestamp signing consumes the bounded retry budget after consecutive timeouts', () => {
  const value = fixture('Accepted', 'timeout-three');
  try {
    assert.equal(value.result.status, 0, value.result.stderr);
    assert.equal(value.timestampSigningAttempts, 4);
    assert.equal(value.receipt.timestamp_signing.attempts, 4);
    assert.equal(value.receipt.timestamp_signing.retry_count, 3);
    assert.equal(fullTimestampSigningCommandCount(value.commands), 4);
    assert.equal((value.commands.match(/notarytool submit/g) ?? []).length, 1);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('timestamp signing fails after four bounded timeouts without submitting to notary', () => {
  const value = fixture('Accepted', 'timeout-all');
  try {
    assert.notEqual(value.result.status, 0);
    assert.equal(value.timestampSigningAttempts, 4);
    assert.equal(value.receipt.timestamp_signing.attempts, 4);
    assert.equal(value.receipt.timestamp_signing.retry_count, 3);
    assert.equal(value.receipt.timestamp_signing.attempt_timeout_seconds, 0);
    assert.equal(value.receipt.failure.stage, 'sign_dmg');
    assert.equal(value.receipt.failure.retry_disposition, 'new_operation_required_no_retry');
    assert.equal(fullTimestampSigningCommandCount(value.commands), 4);
    assert.doesNotMatch(value.commands, /notarytool submit/);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('timestamp signing never retries a non-timeout failure', () => {
  const value = fixture('Accepted', 'fail');
  try {
    assert.notEqual(value.result.status, 0);
    assert.equal(value.timestampSigningAttempts, 1);
    assert.equal(value.receipt.failure.stage, 'sign_dmg');
    assert.equal(value.receipt.failure.retry_disposition, 'new_operation_required_no_retry');
    assert.equal(fullTimestampSigningCommandCount(value.commands), 1);
    assert.doesNotMatch(value.commands, /notarytool submit/);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('notarization persists the submission id before a separate bounded wait', () => {
  const value = fixture('Accepted');
  try {
    assert.equal(value.result.status, 0, value.result.stderr);
    assert.equal(value.receipt.status, 'passed');
    assert.equal(value.receipt.notarization.id, submissionId);
    assert.equal(value.receipt.notarization.status, 'Accepted');
    assert.match(value.commands, /xcrun notarytool submit .* --output-format json/);
    assert.doesNotMatch(
      value.commands.split('\n').find((line) => line.includes('notarytool submit')) ?? '',
      /--wait/,
    );
    assert.match(value.commands, new RegExp(`xcrun notarytool wait ${submissionId} .* --timeout [1-9][0-9]*s`));
    assert.equal(value.receipt.notarization.wait_timeout_seconds, 300);
    assert.doesNotMatch(value.commands, /notarytool info/);
    assert.equal(value.receipt.notarization.info_poll_attempts, 0);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('an incomplete notary wait polls the existing submission until Apple accepts it', () => {
  const value = fixture('In Progress', 'success', ['In Progress', 'Accepted']);
  try {
    assert.equal(value.result.status, 0, value.result.stderr);
    assert.equal(value.receipt.status, 'passed');
    assert.equal(value.receipt.notarization.id, submissionId);
    assert.equal(value.receipt.notarization.status, 'Accepted');
    assert.equal(value.receipt.notarization.info_poll_attempts, 2);
    assert.equal(value.notaryInfoAttempts, 2);
    assert.equal((value.commands.match(/notarytool submit/g) ?? []).length, 1);
    assert.equal((value.commands.match(/notarytool wait/g) ?? []).length, 1);
    assert.equal((value.commands.match(/notarytool info/g) ?? []).length, 2);
    assert.match(value.commands, /stapler staple/);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('an unknown notary response keeps polling the existing submission without resubmitting', () => {
  const value = fixture('unknown', 'success', ['unknown', 'Accepted']);
  try {
    assert.equal(value.result.status, 0, value.result.stderr);
    assert.equal(value.receipt.status, 'passed');
    assert.equal(value.receipt.notarization.status, 'Accepted');
    assert.equal(value.notaryInfoAttempts, 2);
    assert.equal((value.commands.match(/notarytool submit/g) ?? []).length, 1);
    assert.equal((value.commands.match(/notarytool wait/g) ?? []).length, 1);
    assert.equal((value.commands.match(/notarytool info/g) ?? []).length, 2);
    assert.equal(fs.existsSync(value.submittedCandidateOutputPath), false);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('an incomplete bounded wait emits durable typed reconcile evidence and never staples', () => {
  const value = fixture('In Progress');
  try {
    assert.notEqual(value.result.status, 0);
    assert.equal(value.receipt.status, 'failed');
    assert.equal(value.receipt.notarization.id, submissionId);
    assert.equal(value.receipt.notarization.status, 'In Progress');
    assert.equal(value.receipt.failure.code, 'notarization_submission_incomplete');
    assert.equal(value.receipt.failure.retry_disposition, 'read_only_reconcile_submission_no_retry');
    assert.equal(value.receipt.submitted_candidate.retained_for_reconcile, true);
    assert.equal(value.receipt.submitted_candidate.recovery_file, 'submitted-candidate.dmg');
    assert.match(value.receipt.submitted_candidate.sha256, /^[0-9a-f]{64}$/);
    assert.equal(fs.existsSync(value.submittedCandidateOutputPath), true);
    assert.equal(
      fs.readFileSync(value.submittedCandidateOutputPath, 'utf8'),
      'full-dmg-fixture',
    );
    assert.equal((value.commands.match(/notarytool submit/g) ?? []).length, 1);
    assert.equal((value.commands.match(/notarytool wait/g) ?? []).length, 1);
    assert.ok(value.notaryInfoAttempts >= 1);
    assert.equal(value.receipt.notarization.info_poll_attempts, value.notaryInfoAttempts);
    assert.equal((value.commands.match(/notarytool info/g) ?? []).length, value.notaryInfoAttempts);
    assert.doesNotMatch(value.commands, /stapler staple/);
    const logged = JSON.parse(value.result.stderr.trim()) as Record<string, any>;
    assert.equal(logged.schema, 'opl_notarization_failure_log.v1');
    assert.equal(logged.failure.code, 'notarization_submission_incomplete');
    assert.equal(logged.notarization.id, submissionId);
    assert.equal(logged.submitted_candidate.retained_for_reconcile, true);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('a permanent notarization rejection fails closed without polling or stapling', () => {
  const value = fixture('In Progress', 'success', ['Rejected']);
  try {
    assert.notEqual(value.result.status, 0);
    assert.equal(value.receipt.status, 'failed');
    assert.equal(value.receipt.notarization.id, submissionId);
    assert.equal(value.receipt.notarization.status, 'Rejected');
    assert.equal(value.receipt.notarization.info_poll_attempts, 1);
    assert.equal(value.receipt.failure.code, 'notarization_submission_rejected');
    assert.equal(value.receipt.failure.retry_disposition, 'new_operation_required_no_retry');
    assert.equal((value.commands.match(/notarytool submit/g) ?? []).length, 1);
    assert.equal((value.commands.match(/notarytool wait/g) ?? []).length, 1);
    assert.equal((value.commands.match(/notarytool info/g) ?? []).length, 1);
    assert.doesNotMatch(value.commands, /stapler staple/);
    const logged = JSON.parse(value.result.stderr.trim()) as Record<string, any>;
    assert.equal(logged.failure.code, 'notarization_submission_rejected');
    assert.equal(logged.notarization.status, 'Rejected');
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});
