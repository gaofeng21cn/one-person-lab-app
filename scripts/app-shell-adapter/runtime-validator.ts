import type {
  ChannelThreadBindingBoundary,
  ShellAdapterContract,
} from './types.ts';
import {
  assertShellReplacementAdoptionGates,
} from './types.ts';
import {
  assertRelativePath,
  assertStringArray,
  resolveShellAdapterIdentity,
} from './reader.ts';
import { validateGuiProductContractPolicyFields } from '../app-shell-adapter-contract-validators.ts';

export function validateChannelThreadBindingBoundary(
  boundary: ChannelThreadBindingBoundary | undefined,
  shellIdentity: string | undefined,
): void {
  const expectedKeys = [
    'binding_key_fields',
    'binding_key_normalization_or_inference_allowed',
    'binding_schema',
    'binding_value_fields',
    'implementation_status',
    'mismatch_policy',
    'persistence_role',
    'restart_recovery_transport',
    'second_session_truth_allowed',
    'shell_thread_id_inference_allowed',
    'source_ref',
    'thread_turn_authority',
    'unknown_binding_policy',
  ];
  const expectedImplementationStatus = shellIdentity === 'opl-studio'
    ? 'framework_projection_consumer_and_exact_binding_source_e2e_completed'
    : null;
  if (
    !boundary
    || !expectedImplementationStatus
    || JSON.stringify(Object.keys(boundary).sort()) !== JSON.stringify(expectedKeys)
    || boundary.source_ref !==
      'contracts/app-runtime-bridge.json#canonical_conversation_continuity_policy.transport_binding_projection'
    || boundary.binding_schema !== 'opl_app_transport_bindings_projection.v1'
    || JSON.stringify(boundary.binding_key_fields) !==
      JSON.stringify(['provider_id', 'account_id', 'channel_session_id'])
    || JSON.stringify(boundary.binding_value_fields) !==
      JSON.stringify(['canonical_thread_host', 'canonical_thread_id'])
    || boundary.thread_turn_authority !== 'codex_core_app_server'
    || boundary.persistence_role !==
      'exact_binding_adapter_state_only_not_thread_history_turn_state_or_session_truth'
    || boundary.restart_recovery_transport !==
      'exact_binding_lookup_then_thread_read_then_thread_resume_same_threadId'
    || boundary.unknown_binding_policy !==
      'fail_closed_without_thread_start_or_thread_id_inference_during_recovery'
    || boundary.mismatch_policy !==
      'fail_closed_without_rebind_merge_overwrite_or_turn_start'
    || boundary.binding_key_normalization_or_inference_allowed !== false
    || boundary.shell_thread_id_inference_allowed !== false
    || boundary.second_session_truth_allowed !== false
    || boundary.implementation_status !== expectedImplementationStatus
  ) {
    throw new Error(
      'shell channel thread binding must recover only an exact provider/account/session binding through the canonical Codex App Server',
    );
  }
}

export function validateCodexExecutableContract(contract: ShellAdapterContract): void {
  const executable = contract.codex_executable_contract;
  if (!executable) {
    if (contract.active_shell !== 'opl-studio' && contract.candidate_shell !== 'opl-studio') {
      return;
    }
    throw new Error('shell adapter must declare codex_executable_contract');
  }
  if (executable.resolver_env !== 'OPL_CODEX_BIN') {
    throw new Error('shell Codex executable resolver must remain OPL_CODEX_BIN');
  }
  if (executable.protocol !== 'codex_app_server_stdio') {
    throw new Error('shell Codex protocol must remain codex_app_server_stdio');
  }
  if (executable.thread_store_owner !== 'codex_core_app_server') {
    throw new Error('shell Codex thread store authority must remain codex_core_app_server');
  }
  if (executable.codex_home_policy !== 'preserve_existing_env_else_codex_system_default') {
    throw new Error('shell Codex home policy must preserve existing env or use the Codex system default');
  }
  if (executable.carrier_scope !== 'shell_adapter_only') {
    throw new Error('shell Codex carrier knowledge must remain scoped to the shell adapter');
  }
  if (executable.carrier.framework_managed_payload_in_app_bundle_allowed !== false) {
    throw new Error('App bundles must not embed the Framework-managed Codex payload');
  }
  if (executable.framework_headless_carrier_policy !== 'preserved_outside_app_bundle') {
    throw new Error('Framework headless Codex carrier policy must remain outside the App bundle');
  }

  if (contract.candidate_shell === 'opl-studio') {
    if (
      executable.carrier.kind !== 'candidate_owned_or_exact_external_binary' ||
      executable.carrier.source_ref !== null ||
      executable.carrier.manifest_parser_owner !== null ||
      executable.carrier.aioncore_required !== false
    ) {
      throw new Error('OPL Studio Codex carrier must remain independent from AionCore');
    }
  }
}

export function assertAdapterContractIdentity(contract: ShellAdapterContract, options: { explicitOverride: boolean }): void {
  if (contract.owner !== 'one-person-lab-app') {
    throw new Error(`Unexpected active shell owner: ${contract.owner}`);
  }
  if (contract.purpose !== 'active_shell_adapter') {
    throw new Error(`Unexpected active shell purpose: ${contract.purpose}`);
  }
  if (contract.state !== 'active') {
    throw new Error(`Unexpected active shell state: ${contract.state}`);
  }
  if (contract.app_repo !== 'gaofeng21cn/one-person-lab-app') {
    throw new Error(`Unexpected active shell app_repo: ${contract.app_repo}`);
  }
  const adapterIdentity = resolveShellAdapterIdentity(contract);
  if (!options.explicitOverride) {
  if (contract.active_shell !== 'opl-studio' || adapterIdentity !== contract.active_shell) {
      throw new Error(`Default active shell adapter identity is invalid: ${adapterIdentity}`);
    }
    if (contract.candidate_shell || contract.adapter_id || contract.adapter_role) {
      throw new Error('Default active shell adapter must not declare foreground candidate identity');
    }
  } else if (contract.candidate_shell) {
    if (contract.active_shell !== undefined) {
      throw new Error(`${contract.candidate_shell} foreground candidate adapter must not declare active_shell`);
    }
    if (contract.adapter_id !== contract.candidate_shell || contract.adapter_role !== 'foreground_alternative_candidate_adapter') {
      throw new Error(`${contract.candidate_shell} foreground candidate adapter identity is inconsistent`);
    }
  }
  if (contract.shell_source?.history_policy !== 'external_checkout_not_merged_into_app_default_branch') {
    throw new Error(`Unexpected shell history policy: ${contract.shell_source?.history_policy}`);
  }
}

export function assertAdapterGuiAuthority(contract: ShellAdapterContract): void {
  if (contract.gui_authority?.source_of_truth !== 'one-person-lab-app') {
    throw new Error('active shell GUI authority must stay in one-person-lab-app');
  }
  const expectedImplementationRole = contract.candidate_shell && contract.adapter_role === 'foreground_alternative_candidate_adapter'
      ? 'foreground_alternative_candidate_implementation_carrier'
      : 'active_shell_implementation_carrier';
  if (contract.gui_authority.implementation_role !== expectedImplementationRole) {
    throw new Error(`active shell GUI implementation role must be ${expectedImplementationRole}`);
  }
  assertStringArray(contract.gui_authority.product_contracts, 'gui_authority.product_contracts');
  assertStringArray(contract.gui_authority.shell_may_own, 'gui_authority.shell_may_own');
  assertStringArray(contract.gui_authority.shell_must_not_own, 'gui_authority.shell_must_not_own');
  if (contract.gui_authority.upstream_intake_policy !== 'check_against_app_owned_gui_contracts_before_acceptance') {
    throw new Error(`Unexpected GUI upstream intake policy: ${contract.gui_authority.upstream_intake_policy}`);
  }
}

export function assertActiveShellSpecificPolicy(contract: ShellAdapterContract): void {
  if (contract.release_role === 'experimental_candidate_shell') {
    if (contract.candidate_shell !== 'opl-studio') {
      throw new Error('Only OPL Studio may be the candidate shell');
    }
    return;
  }
  if (contract.active_shell !== 'opl-studio') throw new Error('Only OPL Studio may be the active release shell');
}

export function assertShellReplacementPolicy(contract: ShellAdapterContract): void {
  if (contract.shell_replacement_policy?.candidate_root_pattern !== 'shells/<candidate>') {
    throw new Error('active shell replacement policy must keep candidates under shells/<candidate>');
  }
  const allowedCandidateStates = contract.candidate_shell && contract.adapter_role === 'foreground_alternative_candidate_adapter'
      ? ['active_product_development_pre_adoption']
      : ['candidate_until_contracts_and_tests_complete'];
  if (!allowedCandidateStates.includes(contract.shell_replacement_policy.candidate_state)) {
    throw new Error(`Unexpected shell candidate state: ${contract.shell_replacement_policy.candidate_state}`);
  }
  if (contract.shell_replacement_policy.authority_transfer_allowed !== false) {
    throw new Error('active shell replacement must not transfer App GUI authority');
  }
  assertStringArray(contract.shell_replacement_policy.adoption_gate, 'shell_replacement_policy.adoption_gate');
  assertShellReplacementAdoptionGates(
    contract.release_role,
    contract.shell_replacement_policy.adoption_gate,
    (gate) => `active shell replacement policy missing gate ${gate}`,
    'active shell replacement policy must not declare candidates inside contracts/app-shell-adapter.json',
  );
}

export function assertShellContractPathsAndCapabilities(contract: ShellAdapterContract): void {
  assertRelativePath(contract.shell_root, 'shell_root');
  assertRelativePath(contract.runtime_bridge_contract, 'runtime_bridge_contract');
  assertRelativePath(contract.shell_source?.checkout_path, 'shell_source.checkout_path');
  if (contract.shell_source.checkout_path !== contract.shell_root) {
    throw new Error('shell_source.checkout_path must match shell_root');
  }

  const paths = contract.shell_contract?.paths;
  if (!paths) {
    throw new Error('active shell contract must declare shell_contract.paths');
  }
  for (const [label, value] of Object.entries(paths)) {
    assertRelativePath(value, `shell_contract.paths.${label}`);
  }
  assertStringArray(contract.shell_contract.capabilities, 'shell_contract.capabilities');
  if (contract.release_role === 'experimental_candidate_shell') {
    if (!contract.shell_contract.capabilities.includes('candidate_app_bundle_package')) {
      throw new Error('candidate shell capabilities must include candidate_app_bundle_package');
    }
    if (!contract.shell_contract.capabilities.includes('app_owned_gui_product_contract')) {
      throw new Error('candidate shell capabilities must keep app_owned_gui_product_contract boundary');
    }
    if (!contract.shell_contract.capabilities.includes('app_owned_runtime_bridge_contract')) {
      throw new Error('candidate shell capabilities must keep app_owned_runtime_bridge_contract boundary');
    }
    return;
  }
  if (!contract.shell_contract.capabilities.includes('app_product_profile_generated_config')) {
    throw new Error('active shell capabilities must include app_product_profile_generated_config');
  }
  if (!contract.shell_contract.capabilities.includes('opl_packaged_runtime_extra_resource')) {
    throw new Error('active shell capabilities must include opl_packaged_runtime_extra_resource');
  }
  for (const capability of [
    'app_owned_gui_product_contract',
    'app_owned_runtime_bridge_contract',
    'opl_app_state_bridge',
    'opl_app_action_bridge',
    'app_gui_release_channel_gating',
  ]) {
    if (!contract.shell_contract.capabilities.includes(capability)) {
      throw new Error(`active shell capabilities must include ${capability}`);
    }
  }
}
