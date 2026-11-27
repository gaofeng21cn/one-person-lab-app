import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const appRoot = path.resolve(import.meta.dirname, '../..');
const statusCommand = 'node --experimental-strip-types scripts/release-bundle-cli.ts status --bundle <sha256:digest> --store <directory>';

function runScript(script: string, args: string[]) {
  return spawnSync(process.execPath, ['--experimental-strip-types', script, ...args], {
    cwd: appRoot,
    encoding: 'utf8',
  });
}

function historicalRecord() {
  return {
    schema: 'opl_release_candidate_record.v1',
    status: 'ready_to_promote',
    version: '26.7.21',
    tag: 'v26.7.21',
    decision: {
      can_promote: true,
      promote_command: 'legacy mutation command must never be echoed',
    },
    release_owner_verdict: {
      status: 'release_owner_receipt_recorded',
      release_owner_verdict_ref: null,
      release_owner_receipt_ref: 'release_owner_receipt_ref://historical/receipt',
    },
  };
}

test('candidate validator inspects historical evidence without returning promotion admission', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-candidate-inspection-'));
  const recordPath = path.join(tempRoot, 'release-candidate-record.json');
  try {
    const bytes = Buffer.from(`${JSON.stringify(historicalRecord(), null, 2)}\n`);
    fs.writeFileSync(recordPath, bytes);
    const result = runScript('scripts/validate-release-candidate-record.ts', [
      '--status',
      '--version', '26.7.21',
      '--record', recordPath,
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.schema, 'opl_app_historical_release_candidate_inspection.v1');
    assert.equal(summary.status, 'historical_read_only');
    assert.equal(summary.inspection_valid, true);
    assert.equal(summary.authoritative_for_new_release, false);
    assert.equal(summary.promote_ready, false);
    assert.equal(summary.mutation_authorized, false);
    assert.equal(summary.historical_claims.promotion_status_present, true);
    assert.equal(summary.historical_claims.promotion_decision_present, true);
    assert.equal(summary.historical_claims.promotion_command_present, true);
    assert.equal(summary.framework_handoff.status_command, statusCommand);
    assert.equal(
      summary.source_sha256,
      `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
    );
    assert.doesNotMatch(result.stdout, /legacy mutation command|release:stable|--execute/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('legacy promote-ready validator flag remains fail-closed and returns only read-only handoff', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-candidate-admission-retired-'));
  const recordPath = path.join(tempRoot, 'release-candidate-record.json');
  try {
    fs.writeFileSync(recordPath, `${JSON.stringify(historicalRecord(), null, 2)}\n`);
    const result = runScript('scripts/validate-release-candidate-record.ts', [
      '--promote-ready',
      '--version', '26.7.21',
      '--record', recordPath,
    ]);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.lifecycle, 'historical_read_only');
    assert.equal(summary.promote_ready, false);
    assert.equal(summary.mutation_authorized, false);
    assert.equal(summary.framework_handoff.status_command, statusCommand);
    assert.match(result.stderr, /promotion admission is retired/);
    assert.doesNotMatch(result.stdout, /legacy mutation command|release:stable|--execute/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('historical inspection reports schema or version mismatch without mutation authority', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-candidate-invalid-history-'));
  const recordPath = path.join(tempRoot, 'release-candidate-record.json');
  try {
    fs.writeFileSync(recordPath, `${JSON.stringify({ schema: 'unknown', version: '26.7.20' })}\n`);
    const result = runScript('scripts/validate-release-candidate-record.ts', [
      '--status',
      '--version', '26.7.21',
      '--record', recordPath,
    ]);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.inspection_valid, false);
    assert.equal(summary.mutation_authorized, false);
    assert.equal(summary.errors.length, 2);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
