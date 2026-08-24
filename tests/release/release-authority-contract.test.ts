import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const appRoot = path.resolve(import.meta.dirname, '../..');
const releaseGuide = fs.readFileSync(
  path.join(appRoot, 'docs', 'delivery', 'release', 'README.md'),
  'utf8',
);
const releaseContract = JSON.parse(
  fs.readFileSync(path.join(appRoot, 'contracts', 'app-release-channel.json'), 'utf8'),
);
const control = releaseContract.release_bundle_control_plane;

test('release contract keeps Framework checkpoint as the only live release state authority', () => {
  assert.equal(control.framework_authority.cli, 'opl release');
  assert.equal(control.framework_authority.checkpoint_and_receipt_state_authority_exclusive, true);
  assert.equal(control.framework_authority.app_may_define_checkpoint_or_receipt_schema, false);
  assert.equal(control.live_authority.single_live_mutation_authority, true);
  assert.equal(control.checkpoint_transport.portable_between_executors, true);
  assert.equal(control.checkpoint_transport.completed_stage_behavior, 'skip_with_rebuild_performed_false');
});

test('release contract exposes only the three Stable operations and validation-only Canary', () => {
  assert.deepEqual(control.live_authority.stable_operations, [
    'standard',
    'resume_standard',
    'append_full',
  ]);
  assert.equal(control.validation_canary.mode, 'validation_only');
  assert.equal(control.validation_canary.secrets_allowed, false);
  assert.equal(control.validation_canary.build_or_vm_execution_allowed, false);
  assert.equal(control.validation_canary.external_write_allowed, false);
  assert.equal(control.validation_canary.stable_mutation_allowed, false);
});

test('release guide separates independent Docker authority from Desktop Stable', () => {
  assert.match(releaseGuide, /release-webui-development\.yml/);
  assert.match(releaseGuide, /operation=qualify\|publish\|promote/);
  assert.doesNotMatch(releaseGuide, /release-webui-development-promote\.yml/);
  assert.match(releaseGuide, /independent source authority/);
  assert.match(releaseGuide, /not accepted authority/);
  assert.doesNotMatch(releaseGuide, /release-webui-follower\.yml/);
});

test('release contract retires broker session and operator mutation authority', () => {
  assert.equal(control.legacy_compatibility.authority_class, 'historical_read_only');
  assert.equal(control.legacy_compatibility.authoritative, false);
  assert.equal(
    control.legacy_compatibility.legacy_broker_and_stable_state_machine_live_mutation_authority,
    false,
  );
  assert.deepEqual(control.legacy_compatibility.accepted_read_only_commands, ['verify', 'status']);
  for (const capability of ['dispatch', 'rerun', 'cancel', 'publish', 'promote']) {
    assert.ok(control.legacy_compatibility.parser_forbidden_capabilities.includes(capability));
  }
});

test('release contract retains protected environment and credential isolation', () => {
  assert.equal(control.protected_environment_control.environment, 'release-stable');
  assert.equal(control.protected_environment_control.daily_codex_credential_may_mutate, false);
  assert.equal(control.validation_canary.secrets_allowed, false);
});
