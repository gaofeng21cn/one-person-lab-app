import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { validateReleaseBundle } from '../../scripts/release-bundle.ts';
import { appRoot } from './app-release-boundary-cases/helpers.ts';

const cli = path.join(appRoot, 'scripts', 'release-bundle.ts');

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function historicalBundle(version = '26.7.20') {
  const digest = (character: string) => character.repeat(64);
  const assets = [
    `One-Person-Lab-${version}-mac-arm64.dmg`,
    `One-Person-Lab-${version}-mac-arm64.zip`,
    `One-Person-Lab-${version}-mac-arm64.zip.blockmap`,
    'latest-arm64-mac.yml',
    'opl-app-component-manifest.json',
    'opl-install.sh',
    'standard-gatekeeper-launch-policy.json',
    'standard-apple-notarization-receipt.json',
  ].map((name, index) => ({ name, size_bytes: index + 1, sha256: digest(String(index + 1)) }));
  const core = {
    schema: 'opl_app_release_bundle.v1',
    release: {
      channel: 'stable',
      version,
      tag: `v${version}`,
      prerelease: false,
      release_cohort_ref: `sha256:${digest('1')}`,
      source_input_sha256: digest('2'),
    },
    cohort: {
      app_sha: 'a'.repeat(40),
      shell_sha: 'b'.repeat(40),
      framework_sha: 'c'.repeat(40),
    },
    notes: {
      source: 'prepared_ai',
      format: 'markdown',
      markdown_sha256: digest('3'),
      evidence_schema: 'opl_app_release_notes_evidence.v1',
      evidence_sha256: digest('4'),
    },
    tracks: {
      standard: {
        status: 'bound',
        builder_run_id: 'historical-run-1',
        build_artifact_cohort: { schema: 'opl_app_build_artifact_cohort.v2', sha256: digest('5') },
        qualification_receipt: {
          schema: 'opl_app_artifact_qualification_receipt.v1',
          status: 'passed',
          sha256: digest('6'),
        },
        assets,
      },
      full: { status: 'absent' },
    },
    policy: {
      latest: {
        channel_allows_promotion: true,
        required_track: 'standard',
        full_required: false,
        bundle_can_claim_release_ready: false,
      },
      full: { mode: 'same_cohort_additive_only', updater_metadata_allowed: false },
      updater: { track: 'standard', metadata_asset: 'latest-arm64-mac.yml' },
    },
  };
  return {
    ...core,
    bundle_id: `sha256:${crypto.createHash('sha256').update(canonicalJson(core)).digest('hex')}`,
  };
}

function runCli(args: string[]) {
  return spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
    cwd: appRoot,
    encoding: 'utf8',
  });
}

test('historical App Bundle bytes remain parseable but cannot claim readiness', () => {
  const bundle = historicalBundle();
  assert.deepEqual(validateReleaseBundle(bundle), []);
  assert.equal(bundle.policy.latest.bundle_can_claim_release_ready, false);
  assert.equal(bundle.tracks.standard.assets.length, 8);
});

test('historical verify and status are read-only', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-historical-bundle-'));
  const bundlePath = path.join(tempRoot, 'bundle.json');
  try {
    fs.writeFileSync(bundlePath, `${JSON.stringify(historicalBundle(), null, 2)}\n`);
    for (const command of ['verify', 'status']) {
      const before = fs.readFileSync(bundlePath);
      const result = runCli([command, '--bundle', bundlePath]);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const receipt = JSON.parse(result.stdout);
      assert.equal(receipt.schema, 'opl_app_release_bundle_status.v1');
      assert.equal(receipt.content_verification, 'bundle_only');
      assert.deepEqual(fs.readFileSync(bundlePath), before);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('direct assemble returns typed retirement before reading input or writing output', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-retired-bundle-assemble-'));
  const missingInput = path.join(tempRoot, 'missing-input');
  const output = path.join(tempRoot, 'must-not-exist.json');
  try {
    const result = runCli(['assemble', '--input', missingInput, '--output', output]);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.schema, 'opl_app_historical_release_bundle_assemble_retired.v1');
    assert.equal(receipt.status, 'retired_fail_closed');
    assert.match(receipt.input_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(receipt.bundle_generated, false);
    assert.equal(receipt.output_written, false);
    assert.equal(receipt.mutation_authorized, false);
    assert.deepEqual(receipt.accepted_read_only_commands, ['verify', 'status']);
    assert.equal(fs.existsSync(output), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('invalid historical bytes fail closed', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-invalid-historical-bundle-'));
  const bundlePath = path.join(tempRoot, 'bundle.json');
  try {
    const bundle = historicalBundle();
    bundle.tracks.standard.assets[0].size_bytes += 1;
    fs.writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
    const result = runCli(['verify', '--bundle', bundlePath]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /bundle_id expected/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('legacy module exports validation only, not Bundle assembly', async () => {
  const module = await import('../../scripts/release-bundle.ts');
  assert.deepEqual(Object.keys(module), ['validateReleaseBundle']);
});

test('schema remains closed for historical byte verification', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(appRoot, 'contracts', 'app-release-bundle.schema.json'), 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.release.additionalProperties, false);
  assert.equal(schema.properties.tracks.additionalProperties, false);
  assert.equal(schema.$defs.bound_track.additionalProperties, false);
  assert.equal(schema.$defs.asset.additionalProperties, false);
});
