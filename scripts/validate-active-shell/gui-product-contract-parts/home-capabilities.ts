import { assertDeepEqualJson, assertForbiddenCapabilityPolicy, assertIncludesAll } from '../assertions.ts';
import { assertCommandSurface } from '../value-helpers.ts';
import {
  appOwnedOplStandardAgentMembershipPolicy,
  appOwnedOrdinaryForbiddenCapabilityPolicy,
  homeActivityCenterForbiddenDisplays,
} from '../app-contract-constants.ts';
import { assertAgentReferenceAdmissionPolicy } from '../../app-product-profile-shared-validators.ts';
import { productProfile } from './context.ts';
import { validateDynamicHomeComposerStateContract } from './actions.ts';

export function validateGuiContractHomeAndCapabilities(guiContract) {
  const pages = guiContract.pages ?? {};
  const capabilitiesStateSource =
    'opl update status --json#managed_update.components[component_id=opl_base].current.dependency_catalog.flow_dependencies + Codex and shell skill/plugin registries';
  assertCommandSurface(
    pages.settings_capabilities.state_source,
    capabilitiesStateSource,
    'App GUI settings_capabilities state source',
  );
  assertCommandSurface(
    pages.settings_capabilities.refresh_source,
    capabilitiesStateSource,
    'App GUI settings_capabilities refresh source',
  );
  assertDeepEqualJson(
    pages.settings_capabilities.entity_kinds,
    [
      'capability_package',
      'skill',
      'plugin',
      'mcp_server',
      'connection_application',
      'image_generation',
      'voice_input',
    ],
    'App GUI Settings Capabilities entity kinds',
  );
  if (!pages.settings_capabilities.must_show?.includes(
    'OPL-managed default companions with installed, registered, enabled, permission, ready, version, and owner-projected action status',
  ) || !pages.settings_capabilities.must_not_show?.includes('KimiCU classified as a manual or third-party capability')) {
    throw new Error('App GUI Settings Capabilities must expose managed companions separately from manual and third-party capabilities');
  }
  if (
    pages.settings_capabilities.local_capability_configuration_source !==
      'AionUI local configuration#MCP servers + image generation + voice input' ||
    !pages.settings_capabilities.must_show?.includes(
      'AionUI-native Skills, Plugins, MCP helpers, image generation, and voice input inside local or third-party ownership instead of OPL Flow',
    ) ||
    !pages.settings_capabilities.must_not_show?.includes('voice input configuration on Preferences or Advanced') ||
    !pages.settings_theme.must_not_show?.includes('voice input provider configuration')
  ) {
    throw new Error('App GUI Settings Capabilities must own local MCP, image, and voice configuration without Preferences duplication');
  }
  if (
    !pages.guid_home.must_show?.includes(
      'all user-visible configured OPL starters in stable order without silent truncation',
    )
  ) {
    throw new Error('App GUI home must show every user-visible configured OPL starter without silent truncation');
  }
  if (
    !pages.guid_home.must_show?.includes(
      'all visible professional-agent shortcuts remain selectable while launch readiness is enforced on send with typed guidance',
    ) ||
    !pages.guid_home.must_show?.includes('prompt, compact shortcuts, and composer share one bottom reading lane') ||
    !pages.guid_home.must_show?.includes(
      'active capability shown by a quiet selected shortcut state without a second composer label',
    )
  ) {
    throw new Error('App GUI home must keep agent shortcuts selectable and subordinate to the chat-first composer');
  }
  assertIncludesAll(
    pages.guid_home.must_not_show,
    [
      'full-width professional-agent navigation row or inactive-item chevrons',
      'working directory selector inside the composer capability palette',
      'professional-agent selection disabled only because package launch is not ready',
    ],
    'App GUI Home retired agent-portal and context-cap signals',
  );
  assertIncludesAll(
    pages.guid_home.must_show,
    [
      'exactly one Home root, composer shell, and footer account or Settings entry at every viewport',
      'each canonical thread ID rendered as at most one conversation row regardless of title',
      'canonical App Server thread overview overrides Codex ACP cache rows while preserving non-Codex local rows',
      'non-managed-scratch canonical recorded cwd auto-loads a directory group and new-session cwd shortcut without creating explicit project affinity or mutating registered workspaces',
      'active AionUI primary navigation shows 运行状态 after New task and before Scheduled tasks in expanded, collapsed, and narrow drawer modes',
    ],
    'App GUI Home session-first identity signals',
  );
  assertIncludesAll(
    pages.guid_home.must_not_show,
    [
      'workspace-scoped Add context action in a directory group',
      'directory-group delete action or cascade deletion of grouped sessions',
      'title-based conversation deduplication',
      'stale Codex ACP cache rows absent from an available canonical App Server overview',
    ],
    'App GUI Home forbidden directory ownership signals',
  );
  validateDynamicHomeComposerStateContract(
    guiContract.interaction_baseline?.home?.home_composer_state_contract,
    'App GUI Home composer state contract',
  );
  validateDynamicHomeComposerStateContract(
    productProfile.gui?.home?.home_composer_state_contract,
    'App product profile Home composer state contract',
  );
  assertDeepEqualJson(
    productProfile.gui?.home?.home_composer_state_contract,
    guiContract.interaction_baseline?.home?.home_composer_state_contract,
    'App product profile Home composer state projection',
  );
  if (pages.guid_home.model_status?.display_value !== '5.6 Sol') {
    throw new Error('App GUI home model selector must keep the friendly default model without repeating reasoning');
  }
  if (
    pages.guid_home.model_status?.value_source !==
    'default_session_profile.model on Home; normalized active ACP model_info in conversation'
  ) {
    throw new Error('App GUI model selector must use the default profile on Home and active ACP model info in conversation');
  }
  if (pages.guid_home.model_status?.placement !== 'inside the Home and ordinary Codex conversation model selector buttons only') {
    throw new Error('App GUI model status must stay inside the Home and conversation selector buttons');
  }
  if (pages.guid_home.model_status?.standalone_home_subtitle_visible !== false) {
    throw new Error('App GUI home must not show a standalone model subtitle');
  }
  if (pages.guid_home.model_status?.selector_visible !== true) {
    throw new Error('App GUI home must expose the App-owned model selector');
  }
  if (
    pages.guid_home.conversation_feedback_policy?.pending_indicator !==
    'visible elapsed seconds while request is pending or backend is running'
  ) {
    throw new Error('App GUI conversation must show elapsed seconds while Codex is working');
  }
  if (
    pages.guid_home.conversation_feedback_policy?.model_status !==
    'shared session configuration menu appears in Home and Codex conversation composer with peer Model and Reasoning summary rows plus Reset to defaults; no separate status pill, additional root rows, speed, or performance tuning'
  ) {
    throw new Error('App GUI conversation must use the shared session configuration menu with no extra root rows');
  }
  for (const forbiddenField of [
    'agent_package_invocation_receipt_policy',
    'builtin_assistant_route_receipt_policy',
  ]) {
    if (forbiddenField in guiContract) {
      throw new Error(`App GUI contract must not restore private Agent route receipt field ${forbiddenField}`);
    }
  }
  if (
    pages.guid_home.agent_package_source_ref !== 'app_state.agent_packages.directory.entries' ||
    JSON.stringify(pages.guid_home.opl_standard_agent_membership_policy) !==
      JSON.stringify(appOwnedOplStandardAgentMembershipPolicy)
  ) {
    throw new Error('App GUI Home Agent source must apply the OPL ownership, role, readiness, and Codex-route membership policy');
  }
  if (
    guiContract.ordinary_capability_selector_policy?.scope !== 'home_composer_and_ordinary_conversation' ||
    guiContract.ordinary_capability_selector_policy?.authority !==
      'owner_or_carrier_skill_projection_and_mcp_negative_filter' ||
    guiContract.ordinary_capability_selector_policy?.palette_agent_catalog_source_ref !==
      'app_state.agent_packages.directory.entries' ||
    JSON.stringify(guiContract.ordinary_capability_selector_policy?.opl_standard_agent_membership_policy) !==
      JSON.stringify(appOwnedOplStandardAgentMembershipPolicy) ||
    guiContract.ordinary_capability_selector_policy?.palette_agent_status_source_ref !==
      'app_state.agent_packages.status_index.packages[]' ||
    guiContract.ordinary_capability_selector_policy?.palette_agent_availability_policy !==
      'join_by_package_id_and_use_fresh_directory_installed_plus_status_index_presence.present_and_presence.callable' ||
    guiContract.ordinary_capability_selector_policy?.palette_agent_action_policy !==
      'directory_available_actions_and_recommended_action_ref_only' ||
    guiContract.ordinary_capability_selector_policy?.palette_unknown_standard_agent_policy !==
      'include_unknown_package_ids_only_when_they_match_opl_standard_agent_membership' ||
    guiContract.ordinary_capability_selector_policy?.palette_required_agent_package_ids !== undefined ||
    JSON.stringify(guiContract.ordinary_capability_selector_policy?.palette_agent_group_label_i18n) !==
      JSON.stringify({ 'zh-CN': 'OPL 标准智能体', 'en-US': 'OPL standard agents' }) ||
    guiContract.ordinary_capability_selector_policy?.palette_home_shortcut_independence_policy !==
      'complete_opl_standard_agent_catalog_independent_of_home_shortcut_visibility_and_order' ||
    guiContract.ordinary_capability_selector_policy?.agent_owned_skill_deduplication_policy !==
      'exclude_rendered_professional_agent_required_skill_ids_from_home_new_session_standalone_skills' ||
    guiContract.ordinary_capability_selector_policy?.skill_source_ref !==
      'owner_or_carrier_projected_capability_metadata_for_the_selected_package' ||
    guiContract.ordinary_capability_selector_policy?.package_skill_source_ref !==
      'app_state.agent_packages.status_index.packages[].capability_exposure plus owner-projected capability metadata' ||
    guiContract.ordinary_capability_selector_policy?.mcp_server_source_ref !==
      'configured_user_and_third_party_mcp_servers' ||
    guiContract.ordinary_capability_selector_policy?.mcp_menu_policy !==
      'preserve_configured_user_and_third_party_servers_except_explicit_forbidden_matchers' ||
    guiContract.ordinary_capability_selector_policy?.conversation_loaded_skill_display_policy !==
      'preserve_owner_or_carrier_projected_loaded_skills' ||
    guiContract.ordinary_capability_selector_policy?.conversation_loaded_mcp_display_policy !==
      'preserve_non_forbidden_configured_servers' ||
    guiContract.ordinary_capability_selector_policy?.unmatched_mcp_policy !==
      'preserve_end_to_end_without_app_allowlist_membership' ||
    Object.prototype.hasOwnProperty.call(
      guiContract.ordinary_capability_selector_policy,
      'forbidden_skill_examples',
    )
  ) {
    throw new Error('App GUI ordinary selector must use owner/carrier Skill projection and the MCP negative filter');
  }
  assertAgentReferenceAdmissionPolicy(
    guiContract.ordinary_capability_selector_policy.agent_reference_admission_policy,
    'App GUI Agent reference admission policy',
  );
  if (
    guiContract.interaction_baseline?.capability_selection?.agent_reference_admission_policy_ref !==
    'ordinary_capability_selector_policy.agent_reference_admission_policy'
  ) {
    throw new Error('App GUI capability selection must reference the canonical Agent admission policy');
  }
  assertIncludesAll(
    guiContract.ordinary_capability_selector_policy.forbidden_mcp_examples,
    ['aionui-team', 'team_*', 'mcp__aionui-team*', 'team_mcp_stdio_config', 'team_id/teamId'],
    'App GUI ordinary selector forbidden MCP examples',
  );
  assertForbiddenCapabilityPolicy(
    guiContract.ordinary_capability_selector_policy,
    appOwnedOrdinaryForbiddenCapabilityPolicy,
    'App GUI ordinary selector forbidden MCP policy',
  );
  assertDeepEqualJson(
    guiContract.ordinary_capability_selector_policy.required_scrub_targets,
    [
      'mcp_servers entries matching forbidden_mcp_matchers',
      'mcp_statuses entries matching forbidden_mcp_matchers',
      'session_mcp_servers entries matching forbidden_mcp_matchers',
      'scrub_extra_keys',
    ],
    'App GUI ordinary selector Team scrub targets',
  );
  assertDeepEqualJson(
    guiContract.ordinary_capability_selector_policy.required_preservation_targets,
    [
      'mcp directory entries not matching forbidden_mcp_matchers',
      'mcp status entries not matching forbidden_mcp_matchers',
      'new conversation create payload mcp_servers not matching forbidden_mcp_matchers',
      'conversation snapshot mcp_servers and mcp_statuses not matching forbidden_mcp_matchers',
    ],
    'App GUI ordinary selector MCP preservation targets',
  );
  if (
    guiContract.ordinary_capability_selector_policy.conversation_snapshot_policy !==
    'scrub_disabled_team_mcp_and_team_metadata_before_rendering_or_inheriting_ordinary_conversations'
  ) {
    throw new Error('App GUI ordinary selector must scrub disabled Team MCP snapshots from ordinary conversations');
  }
  assertIncludesAll(
    pages.guid_home.must_show,
    ['ordinary Skill selector preserves owner-or-carrier projected Skills without an App allowlist'],
    'App GUI home ordinary selector must_show',
  );
  assertIncludesAll(
    pages.guid_home.must_not_show,
    [
      'AionUI implementation skills such as aionui-skills',
      'MCP servers matching the explicit Team/internal negative filter',
      'AionUI Team MCP tools such as team_members, team_list_models, and team_spawn_agent',
    ],
    'App GUI home ordinary selector must_not_show',
  );
  if (pages.guid_home.activity_center_policy?.source !== 'runtime page only; Home does not query running task lists') {
    throw new Error('App GUI home activity center must be suppressed on ordinary Home and routed to Runtime/secondary context');
  }
  if (pages.guid_home.activity_center_policy?.authority !== 'app_owned_home_minimal_command_surface') {
    throw new Error('App GUI home activity center policy must be App-owned minimal command surface');
  }
  if (pages.guid_home.activity_center_policy?.default_placement !== 'not_rendered_on_ordinary_home') {
    throw new Error('App GUI home must not render the expanded activity center on ordinary Home');
  }
  if (pages.guid_home.activity_center_policy?.home_surface_policy !== 'ordinary_home_must_not_render_activity_center_or_continue_work_grid') {
    throw new Error('App GUI home must forbid ordinary Home activity center / continue-work grid rendering');
  }
  assertDeepEqualJson(
    pages.guid_home.activity_center_policy.allowed_home_runtime_context,
    [],
    'App GUI home allowed runtime context',
  );
  assertIncludesAll(
    pages.guid_home.activity_center_policy.must_not_display,
    homeActivityCenterForbiddenDisplays,
    'App GUI home activity center forbidden displays',
  );
  for (const hiddenSignal of [
    'compact continue-work entry near the home input',
    'needs attention, active, and recent refs on Home',
    'Home footer feedback icon',
    'Home footer favorite/star icon',
    'Home footer web/access globe icon',
    'per-assistant running badges derived from module or domain lane diagnostics',
  ]) {
    if (!pages.guid_home.must_not_show?.includes(hiddenSignal)) {
      throw new Error(`App GUI home must not show ${hiddenSignal}`);
    }
  }
}
