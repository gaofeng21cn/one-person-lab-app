import type { AppProductProfile } from '../types.ts';
import { assertIncludesAll } from './support.ts';
import {
  appOwnedOplStandardAgentMembershipPolicy,
  assertAgentReferenceAdmissionPolicy,
} from '../../app-product-profile-shared-validators.ts';

export function assertOrdinaryCapabilitySelectorPolicy(profile: AppProductProfile): void {
  const ordinarySelector = profile.gui.ordinary_capability_selector_policy;
  if (!ordinarySelector || typeof ordinarySelector !== 'object') {
    throw new Error('App product profile must declare ordinary_capability_selector_policy');
  }
  assertAgentReferenceAdmissionPolicy(
    ordinarySelector.agent_reference_admission_policy,
    'App product profile Agent reference admission policy',
  );
  if (
    ordinarySelector.scope !== 'home_composer_and_ordinary_conversation' ||
    ordinarySelector.authority !== 'owner_or_carrier_skill_projection_and_mcp_negative_filter' ||
    ordinarySelector.palette_agent_catalog_source_ref !==
      'app_state.agent_packages.directory.entries' ||
    JSON.stringify(ordinarySelector.opl_standard_agent_membership_policy) !==
      JSON.stringify(appOwnedOplStandardAgentMembershipPolicy) ||
    ordinarySelector.palette_agent_status_source_ref !==
      'app_state.agent_packages.status_index.packages[]' ||
    ordinarySelector.palette_agent_availability_policy !==
      'join_by_package_id_and_use_fresh_directory_installed_plus_status_index_presence.present_and_presence.callable' ||
    ordinarySelector.palette_agent_action_policy !==
      'directory_available_actions_and_recommended_action_ref_only' ||
    ordinarySelector.palette_unknown_standard_agent_policy !==
      'include_unknown_package_ids_only_when_they_match_opl_standard_agent_membership' ||
    ordinarySelector.palette_required_agent_package_ids !== undefined ||
    ordinarySelector.palette_home_shortcut_independence_policy !==
      'complete_opl_standard_agent_catalog_independent_of_home_shortcut_visibility_and_order' ||
    JSON.stringify(ordinarySelector.palette_agent_group_label_i18n) !==
      JSON.stringify({ 'zh-CN': 'OPL 标准智能体', 'en-US': 'OPL standard agents' }) ||
    ordinarySelector.agent_owned_skill_deduplication_policy !==
      'exclude_rendered_professional_agent_required_skill_ids_from_home_new_session_standalone_skills' ||
    ordinarySelector.skill_source_ref !==
      'owner_or_carrier_projected_capability_metadata_for_the_selected_package' ||
    ordinarySelector.skill_menu_policy !== 'assistant_scoped_required_checked_optional_visible' ||
    ordinarySelector.conversation_loaded_skill_display_policy !== 'preserve_owner_or_carrier_projected_loaded_skills' ||
    ordinarySelector.mcp_server_source_ref !== 'configured_user_and_third_party_mcp_servers' ||
    ordinarySelector.mcp_menu_policy !==
      'preserve_configured_user_and_third_party_servers_except_explicit_forbidden_matchers' ||
    ordinarySelector.conversation_loaded_mcp_display_policy !== 'preserve_non_forbidden_configured_servers' ||
    ordinarySelector.forbidden_mcp_policy !==
      'exclude_only_explicit_team_or_internal_matches_preserve_all_other_user_and_third_party_servers' ||
    ordinarySelector.unmatched_mcp_policy !== 'preserve_end_to_end_without_app_allowlist_membership' ||
    Object.prototype.hasOwnProperty.call(ordinarySelector, 'forbidden_skill_examples')
  ) {
    throw new Error('App product profile ordinary capability selector must use owner/carrier Skill projection and the MCP negative filter');
  }
  assertIncludesAll(
    ordinarySelector.forbidden_mcp_examples,
    ['aionui-team', 'team_*', 'mcp__aionui-team*', 'team_mcp_stdio_config', 'team_id/teamId'],
    'gui.ordinary_capability_selector_policy.forbidden_mcp_examples',
  );
  if (
    JSON.stringify(ordinarySelector.forbidden_mcp_matchers) !==
    JSON.stringify({
      exact: ['aionui-team'],
      prefixes: ['team_', 'mcp__aionui-team'],
      contains: ['aionui-team'],
    })
  ) {
    throw new Error('App product profile ordinary selector must carry Team MCP forbidden matchers');
  }
  if (
    JSON.stringify(ordinarySelector.scrub_extra_keys) !==
    JSON.stringify([
      'team_mcp_stdio_config',
      'team_id',
      'teamId',
      'team_lead_team_id',
      'team_lead_team_slot_id',
      'team_lead_conversation_id',
      'tl',
    ])
  ) {
    throw new Error('App product profile ordinary selector must carry Team extra scrub keys');
  }
  if (
    JSON.stringify(ordinarySelector.required_scrub_targets) !==
    JSON.stringify([
      'mcp_servers entries matching forbidden_mcp_matchers',
      'mcp_statuses entries matching forbidden_mcp_matchers',
      'session_mcp_servers entries matching forbidden_mcp_matchers',
      'scrub_extra_keys',
    ])
  ) {
    throw new Error('App product profile ordinary selector must carry executable Team scrub targets');
  }
  if (
    ordinarySelector.conversation_snapshot_policy !==
    'scrub_disabled_team_mcp_and_team_metadata_before_rendering_or_inheriting_ordinary_conversations'
  ) {
    throw new Error('App product profile ordinary capability selector must scrub disabled Team MCP snapshots');
  }
  if (
    JSON.stringify(ordinarySelector.required_preservation_targets) !==
    JSON.stringify([
      'mcp directory entries not matching forbidden_mcp_matchers',
      'mcp status entries not matching forbidden_mcp_matchers',
      'new conversation create payload mcp_servers not matching forbidden_mcp_matchers',
      'conversation snapshot mcp_servers and mcp_statuses not matching forbidden_mcp_matchers',
    ])
  ) {
    throw new Error('App product profile ordinary MCP selector must preserve every non-forbidden MCP carrier');
  }
}
