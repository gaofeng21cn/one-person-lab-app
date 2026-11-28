import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  candidateValidationPolicyFromRegistry,
  validateCandidate,
  validateNativeP1BaselineBridge,
} from '../../scripts/validate-shell-candidates/candidate-contract.ts';
import type {
  NativeP1BaselineBridge,
  ShellCandidateRegistry,
} from '../../scripts/validate-shell-candidates/types.ts';

const readJson = <T>(relativePath: string): T =>
  JSON.parse(fs.readFileSync(relativePath, 'utf8')) as T;

type NativeMinimumProductBridge = {
  authority_split: {
    shell_owned_action_bus_allowed: boolean;
    second_package_registry_allowed: boolean;
    second_updater_allowed: boolean;
  };
  agent_conversation_launch: {
    selection_snapshot_fields: string[];
    new_conversation_protocol: string[];
    selection_mutates_package_or_framework_state: boolean;
    app_action_id_required: boolean;
    launch_success_readback: string;
  };
  active_turn_submission: {
    when_active_turn_accepts_input: string;
    when_no_active_turn: string;
    queue_role: string;
    failure_policy: string;
    persistent_shell_queue_allowed: boolean;
    host_queue_allowed: boolean;
    framework_action_route_allowed: boolean;
  };
  gateway_account: {
    login_bridge_id: string;
    projected_action_ids: string[];
    login_via_generic_app_action_allowed: boolean;
    renderer_secret_persistence_allowed: boolean;
  };
  agent_package_lifecycle: {
    action_source: string;
    required_action_fields: string[];
    action_id_allowlist_allowed: boolean;
    semantic_inference_from_action_id_allowed: boolean;
    automatic_update_policy_ref: string;
    developer_checkout_automatic_mutation_allowed: boolean;
  };
  software_updates: {
    public_objects: string[];
    opl_base_and_packages: {
      host_capabilities: string[];
      direct_shell_mutation_allowed: boolean;
      terminal_readback_required: boolean;
    };
    opl_app: {
      logical_host_capabilities: string[];
      downloaded_state_is_success: boolean;
      base_or_packages_mutation_allowed: boolean;
    };
    agent_packages_are_fourth_updater: boolean;
  };
};

const runtimeBridge = readJson<{
  native_minimum_product_bridge: NativeMinimumProductBridge;
}>('contracts/app-runtime-bridge.json').native_minimum_product_bridge;

test('Native P1 launches a selected standard Agent through canonical Codex thread and turn methods', () => {
  assert.deepEqual(runtimeBridge.agent_conversation_launch.selection_snapshot_fields, [
    'package_id',
    'shortcut_id',
    'codex_visible_entry',
    'required_skill_ids',
  ]);
  assert.deepEqual(runtimeBridge.agent_conversation_launch.new_conversation_protocol, [
    'thread/start',
    'turn/start',
  ]);
  assert.equal(runtimeBridge.agent_conversation_launch.selection_mutates_package_or_framework_state, false);
  assert.equal(runtimeBridge.agent_conversation_launch.app_action_id_required, false);
  assert.match(runtimeBridge.agent_conversation_launch.launch_success_readback, /thread\/read includeTurns=true/);
});

test('Native P1 uses turn steer as the active-turn queue without a private host queue', () => {
  const submission = runtimeBridge.active_turn_submission;
  assert.equal(submission.when_active_turn_accepts_input, 'turn/steer');
  assert.equal(submission.when_no_active_turn, 'turn/start');
  assert.match(submission.queue_role, /renderer_ephemeral_submission_state/);
  assert.match(submission.failure_policy, /restore_unsent_input_to_the_composer/);
  assert.equal(submission.persistent_shell_queue_allowed, false);
  assert.equal(submission.host_queue_allowed, false);
  assert.equal(submission.framework_action_route_allowed, false);
  assert.equal(runtimeBridge.authority_split.shell_owned_action_bus_allowed, false);
});

test('Native P1 binds Gateway and Agent lifecycle to their existing owner surfaces', () => {
  assert.equal(runtimeBridge.gateway_account.login_bridge_id, 'loginGatewayAccount');
  assert.deepEqual(runtimeBridge.gateway_account.projected_action_ids, [
    'gateway_account_complete_setup',
    'gateway_account_refresh',
    'gateway_account_repair',
    'gateway_account_use_for_model_access',
    'gateway_account_disconnect',
  ]);
  assert.equal(runtimeBridge.gateway_account.login_via_generic_app_action_allowed, false);
  assert.equal(runtimeBridge.gateway_account.renderer_secret_persistence_allowed, false);

  const lifecycle = runtimeBridge.agent_package_lifecycle;
  assert.equal(lifecycle.action_source, 'app_state.agent_packages.directory.entries[].available_actions[]');
  assert.deepEqual(lifecycle.required_action_fields, [
    'action_id',
    'action_ref',
    'semantic',
    'surface',
    'payload',
    'required_payload_fields',
    'confirmation_required',
  ]);
  assert.equal(lifecycle.action_id_allowlist_allowed, false);
  assert.equal(lifecycle.semantic_inference_from_action_id_allowed, false);
  assert.match(lifecycle.automatic_update_policy_ref, /managed_update_policy/);
  assert.equal(lifecycle.developer_checkout_automatic_mutation_allowed, false);
});

test('Native P1 keeps App, Base, and Packages update ownership separate', () => {
  const updates = runtimeBridge.software_updates;
  assert.deepEqual(updates.public_objects, ['opl_app', 'opl_base', 'opl_packages']);
  assert.deepEqual(updates.opl_base_and_packages.host_capabilities, [
    'opl-runtime.get-managed-update-status',
    'opl-runtime.get-managed-update-check',
    'opl-runtime.get-managed-update-plan',
    'opl-runtime.run-managed-update-apply',
    'opl-runtime.run-managed-update-repair',
    'opl-runtime.run-managed-update-rollback',
  ]);
  assert.equal(updates.opl_base_and_packages.direct_shell_mutation_allowed, false);
  assert.equal(updates.opl_base_and_packages.terminal_readback_required, true);
  assert.deepEqual(updates.opl_app.logical_host_capabilities, [
    'app_update_check',
    'app_update_install_downloaded',
    'application_restart',
  ]);
  assert.equal(updates.opl_app.downloaded_state_is_success, false);
  assert.equal(updates.opl_app.base_or_packages_mutation_allowed, false);
  assert.equal(updates.agent_packages_are_fourth_updater, false);
  assert.equal(runtimeBridge.authority_split.second_package_registry_allowed, false);
  assert.equal(runtimeBridge.authority_split.second_updater_allowed, false);
});

test('OPL Studio adapter and candidate expose the complete P1 baseline', () => {
  const adapter = readJson<{ p1_baseline_bridge: NativeP1BaselineBridge }>(
    'contracts/app-shell-adapter.json',
  );
  assert.doesNotThrow(() => validateNativeP1BaselineBridge(adapter.p1_baseline_bridge));

  const privateQueue = structuredClone(adapter.p1_baseline_bridge);
  privateQueue.shell_owned_persistent_queue_allowed = true;
  assert.throws(
    () => validateNativeP1BaselineBridge(privateQueue),
    /without a parallel action bus, package registry, or persistent queue/,
  );

  const registry = readJson<ShellCandidateRegistry>('contracts/app-shell-adapter.json');
  const candidate = registry.candidates.find((entry) => entry.id === 'opl-studio');
  assert.ok(candidate);
  assert.doesNotThrow(() => validateCandidate(candidate, candidateValidationPolicyFromRegistry(registry)));
});
