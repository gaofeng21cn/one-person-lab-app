import type { ShellAdapterContract } from './types.ts';
import { STATE_SURFACE_CONTRACT_EXPECTATIONS } from './types.ts';
import { assertRelativePath, assertStringArray } from './reader.ts';
import { validateValidationCommandShape } from '../app-shell-adapter-contract-validators.ts';

export function assertStateSurfaceContract(contract: ShellAdapterContract): void {
  const stateSurface = contract.state_surface_contract;
  if (stateSurface?.primary_read_command !== STATE_SURFACE_CONTRACT_EXPECTATIONS.primary_read_command) {
    throw new Error(`Unexpected active shell primary state read command: ${stateSurface?.primary_read_command}`);
  }
  if (stateSurface.refresh_read_command !== STATE_SURFACE_CONTRACT_EXPECTATIONS.refresh_read_command) {
    throw new Error(`Unexpected active shell refresh state read command: ${stateSurface.refresh_read_command}`);
  }
  if (stateSurface.full_state_read_command !== STATE_SURFACE_CONTRACT_EXPECTATIONS.full_state_read_command) {
    throw new Error(`Unexpected active shell full state read command: ${stateSurface.full_state_read_command}`);
  }
  if (stateSurface.full_state_policy !== STATE_SURFACE_CONTRACT_EXPECTATIONS.full_state_policy) {
    throw new Error(`Unexpected active shell full state policy: ${stateSurface.full_state_policy}`);
  }
  if (stateSurface.action_command !== STATE_SURFACE_CONTRACT_EXPECTATIONS.action_command) {
    throw new Error(`Unexpected active shell action command: ${stateSurface.action_command}`);
  }
  if (stateSurface.full_drilldown_exception !== STATE_SURFACE_CONTRACT_EXPECTATIONS.full_drilldown_exception) {
    throw new Error(`Unexpected active shell full drilldown exception: ${stateSurface.full_drilldown_exception}`);
  }
  assertStringArray(stateSurface.forbidden_gui_truth_sources, 'state_surface_contract.forbidden_gui_truth_sources');
}

export function assertValidationCommandPaths(contract: ShellAdapterContract): void {
  for (const entry of validateValidationCommandShape(contract)) {
    assertRelativePath(entry.cwd, `validation_commands.${entry.id}.cwd`);
  }
}
