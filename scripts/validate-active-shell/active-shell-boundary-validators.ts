import path from 'node:path';
import {
  DEFAULT_RELEASE_SHELL_OWNED_SURFACE,
  FORBIDDEN_GUI_TRUTH_SOURCES,
  FORBIDDEN_SHELL_OWNED_SURFACES,
  REQUIRED_BASE_SHELL_OWNED_SURFACES,
  REQUIRED_GUI_AUTHORITY_PRODUCT_CONTRACTS,
  STATE_SURFACE_CONTRACT_EXPECTATIONS,
  assertShellReplacementAdoptionGates,
} from '../app-shell-adapter.ts';
import {
  validateGuiProductContractPolicyFields,
  validateValidationCommandShape,
} from '../app-shell-adapter-contract-validators.ts';
import { assertFile, root } from './validation-config.ts';

export function validateGuiAuthority(contract, isDefaultReleaseAdapter) {
  if (contract.gui_authority?.source_of_truth !== 'one-person-lab-app') {
    throw new Error('Active shell GUI authority must stay in one-person-lab-app');
  }
  const expectedImplementationRole = contract.release_role === 'experimental_candidate_shell'
      ? 'foreground_alternative_candidate_implementation_carrier'
      : 'active_shell_implementation_carrier';
  if (contract.gui_authority.implementation_role !== expectedImplementationRole) {
    throw new Error(`Active shell GUI implementation role must be ${expectedImplementationRole}`);
  }
  for (const contractRef of REQUIRED_GUI_AUTHORITY_PRODUCT_CONTRACTS) {
    if (!contract.gui_authority.product_contracts?.includes(contractRef)) {
      throw new Error(`Active shell GUI authority must include product contract ${contractRef}`);
    }
    assertFile(path.join(root, contractRef), `GUI authority contract ${contractRef}`);
  }
  const requiredShellOwnedSurface: string[] = [...REQUIRED_BASE_SHELL_OWNED_SURFACES];
  if (isDefaultReleaseAdapter && contract.active_shell === 'aionui') {
    requiredShellOwnedSurface.push(DEFAULT_RELEASE_SHELL_OWNED_SURFACE);
  }
  for (const allowed of requiredShellOwnedSurface) {
    if (!contract.gui_authority.shell_may_own?.includes(allowed)) {
      throw new Error(`Active shell GUI authority must declare shell-owned surface ${allowed}`);
    }
  }
  for (const forbidden of FORBIDDEN_SHELL_OWNED_SURFACES) {
    if (!contract.gui_authority.shell_must_not_own?.includes(forbidden)) {
      throw new Error(`Active shell GUI authority must exclude shell ownership of ${forbidden}`);
    }
  }
  if (contract.gui_authority.upstream_intake_policy !== 'check_against_app_owned_gui_contracts_before_acceptance') {
    throw new Error(`Unexpected GUI upstream intake policy: ${contract.gui_authority.upstream_intake_policy}`);
  }
}

export function validateShellReplacementPolicy(contract) {
  if (contract.shell_replacement_policy?.candidate_root_pattern !== 'shells/<candidate>') {
    throw new Error('Shell replacement policy must keep candidates under shells/<candidate>');
  }
  const expectedCandidateState = contract.release_role === 'experimental_candidate_shell'
      ? 'active_product_development_pre_adoption'
      : 'candidate_until_contracts_and_tests_complete';
  if (contract.shell_replacement_policy.candidate_state !== expectedCandidateState) {
    throw new Error(`Unexpected shell candidate state: ${contract.shell_replacement_policy.candidate_state}`);
  }
  if (contract.shell_replacement_policy.authority_transfer_allowed !== false) {
    throw new Error('Shell replacement must not transfer App GUI authority');
  }
  assertShellReplacementAdoptionGates(
    contract.release_role,
    contract.shell_replacement_policy.adoption_gate,
    (gate) => `Shell replacement policy missing gate ${gate}`,
  );
}

export function validateShellContractCapabilities(contract) {
  if (contract.release_role === 'experimental_candidate_shell') {
    for (const capability of [
      'candidate_app_bundle_package',
      'app_owned_gui_product_contract',
      'app_owned_runtime_bridge_contract',
      'app_gui_release_channel_gating',
    ]) {
      if (!contract.shell_contract.capabilities?.includes(capability)) {
        throw new Error(`Candidate shell capability missing ${capability}`);
      }
    }
    return;
  }
  for (const capability of [
    'app_owned_gui_product_contract',
    'app_owned_runtime_bridge_contract',
    'opl_app_state_bridge',
    'opl_app_action_bridge',
    'app_gui_release_channel_gating',
  ]) {
    if (!contract.shell_contract.capabilities?.includes(capability)) {
      throw new Error(`Active shell capability missing ${capability}`);
    }
  }
}

export function validateGuiProductContractPolicy(contract) {
  validateGuiProductContractPolicyFields(contract, { subject: 'Active shell' });
}

export function validateStateSurfaceContract(contract) {
  const stateSurface = contract.state_surface_contract;
  for (const [field, expected] of Object.entries(STATE_SURFACE_CONTRACT_EXPECTATIONS)) {
    if (stateSurface?.[field] !== expected) {
      throw new Error(`Active shell state_surface_contract.${field} must be ${expected}`);
    }
  }
  for (const forbiddenSource of FORBIDDEN_GUI_TRUTH_SOURCES) {
    if (!stateSurface?.forbidden_gui_truth_sources?.includes(forbiddenSource)) {
      throw new Error(`Active shell state surface must forbid ${forbiddenSource}`);
    }
  }
}

export function validateValidationCommands(contract, shellPaths, resolveValidationCwd) {
  for (const entry of validateValidationCommandShape(contract)) {
    assertFile(resolveValidationCwd(entry, contract, shellPaths), `validation cwd for ${entry.id}`);
  }
}
