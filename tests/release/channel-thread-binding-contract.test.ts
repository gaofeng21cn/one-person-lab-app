import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  validateChannelThreadBindingBoundary,
} from '../../scripts/app-shell-adapter.ts';
import { validateRuntimeBridgeContract } from '../../scripts/validate-active-shell/runtime-bridge-validator.ts';

const readJson = <T = any>(relativePath: string): T =>
  JSON.parse(fs.readFileSync(relativePath, 'utf8')) as T;

test('channel thread bindings use one exact provider account session key and canonical App Server value', () => {
  const runtimeBridge = readJson('contracts/app-runtime-bridge.json');
  const projection = runtimeBridge.canonical_conversation_continuity_policy.transport_binding_projection;
  const recovery = projection.exact_binding_recovery;
  const gui = readJson('contracts/app-gui-product-contract.json');
  const guiBinding = gui.interaction_baseline.thread_coordination.channel_thread_binding;

  assert.equal(runtimeBridge.canonical_conversation_continuity_policy.thread_turn_authority, 'codex_core_app_server');
  assert.deepEqual(projection.binding_key_fields, ['provider_id', 'account_id', 'channel_session_id']);
  assert.deepEqual(projection.binding_value_fields, ['canonical_thread_host', 'canonical_thread_id']);
  assert.deepEqual(recovery.persisted_fields, [
    'provider_id',
    'account_id',
    'channel_session_id',
    'canonical_thread_host',
    'canonical_thread_id',
  ]);
  assert.equal(projection.binding_key_normalization_or_inference_allowed, false);
  assert.equal(recovery.shell_exact_binding_persistence_allowed, true);
  assert.equal(recovery.shell_thread_id_inference_allowed, false);
  assert.equal(recovery.shell_thread_or_turn_truth_allowed, false);
  assert.deepEqual(guiBinding.binding_key_fields, projection.binding_key_fields);
  assert.deepEqual(guiBinding.binding_value_fields, projection.binding_value_fields);
  assert.equal(guiBinding.thread_turn_authority, 'codex_core_app_server');
  assert.equal(guiBinding.second_session_truth_allowed, false);
});

test('restart recovery reads and resumes only the exact persisted canonical thread identity', () => {
  const runtimeBridge = readJson('contracts/app-runtime-bridge.json');
  const recovery = runtimeBridge.canonical_conversation_continuity_policy
    .transport_binding_projection.exact_binding_recovery;

  assert.deepEqual(recovery.restart_recovery_sequence, [
    'load_the_exact_persisted_binding_record',
    'match_provider_id_account_id_channel_session_id_without_normalization_alias_or_fallback',
    'verify_canonical_thread_host_matches_the_active_codex_app_server_host',
    'thread_read_the_exact_canonical_thread_id',
    'thread_resume_the_same_canonical_thread_id_before_turn_start',
  ]);
  assert.equal(
    recovery.success_readback,
    'thread_read_returns_the_exact_canonical_thread_id_from_the_bound_host',
  );
  assert.deepEqual(recovery.app_server_wire_mapping, {
    canonical_thread_id: 'threadId',
    transient_turn_id: 'turnId_not_persisted_in_the_binding',
  });
  assert.match(recovery.unknown_binding_policy, /^fail_closed_/);
  assert.match(recovery.mismatch_policy, /^fail_closed_/);
  assert.match(recovery.app_server_unavailable_policy, /without_claiming_recovery_or_resumed_state$/);
});

test('runtime bridge validation rejects inferred, unknown, or mismatched binding recovery', () => {
  const runtimeBridge = readJson('contracts/app-runtime-bridge.json');
  const activeAdapter = readJson('contracts/app-shell-adapter.json');
  assert.doesNotThrow(() => validateRuntimeBridgeContract(runtimeBridge, activeAdapter));

  const drifts: Array<(candidate: any) => void> = [
    (candidate) => {
      candidate.canonical_conversation_continuity_policy.transport_binding_projection
        .binding_key_fields = ['provider_id', 'channel_session_id'];
    },
    (candidate) => {
      candidate.canonical_conversation_continuity_policy.transport_binding_projection
        .exact_binding_recovery.shell_thread_id_inference_allowed = true;
    },
    (candidate) => {
      candidate.canonical_conversation_continuity_policy.transport_binding_projection
        .exact_binding_recovery.unknown_binding_policy = 'start_a_new_thread';
    },
    (candidate) => {
      candidate.canonical_conversation_continuity_policy.transport_binding_projection
        .exact_binding_recovery.mismatch_policy = 'overwrite_the_saved_binding';
    },
  ];

  for (const drift of drifts) {
    const candidate = structuredClone(runtimeBridge);
    drift(candidate);
    assert.throws(
      () => validateRuntimeBridgeContract(candidate, activeAdapter),
      /Canonical conversation transport binding projection/,
    );
  }
});

test('both shell adapters persist exact bindings without owning thread or turn truth', () => {
  const cases = [
    ['aionui', readJson('contracts/shell-adapters/aionui.json')],
    ['opl-studio', readJson('contracts/shell-adapters/opl-studio.json')],
  ] as const;

  for (const [shellIdentity, adapter] of cases) {
    const boundary = adapter.channel_thread_binding_boundary;
    assert.doesNotThrow(() => validateChannelThreadBindingBoundary(boundary, shellIdentity));
    assert.deepEqual(boundary.binding_key_fields, ['provider_id', 'account_id', 'channel_session_id']);
    assert.deepEqual(boundary.binding_value_fields, ['canonical_thread_host', 'canonical_thread_id']);
    assert.equal(boundary.thread_turn_authority, 'codex_core_app_server');
    assert.equal(boundary.shell_thread_id_inference_allowed, false);
    assert.equal(boundary.second_session_truth_allowed, false);

    for (const mutate of [
      (candidate: any) => { candidate.shell_thread_id_inference_allowed = true; },
      (candidate: any) => { candidate.unknown_binding_policy = 'infer_from_title'; },
      (candidate: any) => { candidate.mismatch_policy = 'replace_thread_id'; },
      (candidate: any) => { candidate.second_session_truth_allowed = true; },
    ]) {
      const candidate = structuredClone(boundary);
      mutate(candidate);
      assert.throws(
        () => validateChannelThreadBindingBoundary(candidate, shellIdentity),
        /recover only an exact provider\/account\/session binding/,
      );
    }
  }
});

test('active shell validation follows the canonical provider account session key', () => {
  const validator = fs.readFileSync(
    'scripts/validate-active-shell/shell-ordinary-experience-validator.ts',
    'utf8',
  );

  assert.match(
    validator,
    /binding\.providerId\}:\$\{binding\.accountId\}:\$\{binding\.channelSessionId/,
  );
  assert.match(validator, /new Set\(bindingIdentities\)\.size !== bindingIdentities\.length/);
  assert.doesNotMatch(validator, /current && current !== target/);
});
