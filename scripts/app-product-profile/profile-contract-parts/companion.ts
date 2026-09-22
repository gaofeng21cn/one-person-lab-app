import type { AppProductProfile } from '../types.ts';
import { assertStringArray } from './support.ts';

export function assertCompanionPayloadProfileShape(profile: AppProductProfile): void {
  assertStringArray(profile.companion_payloads.domain_modules, 'companion_payloads.domain_modules');
  const strategy = profile.companion_payloads.capability_strategy_consumer;
  if (
    strategy?.strategy_authority !== 'opl-flow'
    || strategy.compiler_authority !== 'opl-framework'
    || strategy.runtime_projection_ref !==
      'app_state.agent_packages.status_index.packages.opl-flow.capability_strategy'
    || strategy.full_build_lock_kind !== 'opl_flow_capability_build_lock.v1'
    || strategy.app_policy_inventory_allowed !== false
    || strategy.app_direct_workflow_policy_parse_allowed !== false
  ) {
    throw new Error('App product profile must consume the Framework-compiled OPL Flow capability strategy');
  }
  if (profile.companion_payloads.install_exposure_policy_ref !== 'contracts/app-install-exposure-policy.json') {
    throw new Error('App product profile companion payloads must reference app-install-exposure-policy.json');
  }
  if (profile.companion_payloads.public_abi?.primary_semantic_entry !== 'skill') {
    throw new Error('App product profile companion payloads must keep skill as the primary semantic entry');
  }
  if (profile.companion_payloads.public_abi.plugin_must_not_create_second_semantics !== true) {
    throw new Error('App product profile companion payloads must forbid second semantics from plugin packaging');
  }
  if (profile.companion_payloads.domain_plugin_skills_must_not_be_companion_mirrors !== true) {
    throw new Error('App product profile domain plugin skills must not be companion mirrors');
  }
}
