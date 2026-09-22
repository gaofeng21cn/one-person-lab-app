import { assertDeepEqualJson, assertForbiddenCapabilityPolicy } from '../assertions.ts';
import {
  appOwnedOrdinaryForbiddenCapabilityPolicy,
} from '../app-contract-constants.ts';
import {
  assertAgentReferenceAdmissionPolicy,
  appOwnedOplStandardAgentMembershipPolicy,
} from '../../app-product-profile-shared-validators.ts';
import { validateSettingsControlPlaneBehavior } from '../settings-control-plane-validator.ts';

export function validateAgentPackageRegistryProjection(profile) {
  const projection = profile.gui?.agent_package_registry;
  if (
    projection?.directory_projection_authority !== 'app_state.agent_packages.directory.entries' ||
    projection?.status_projection_authority !== 'app_state.agent_packages.status_index' ||
    projection?.action_projection_authority !==
      'app_state.agent_packages.directory.entries[].available_actions[] + app_state.actions' ||
    projection?.presentation_source !== 'app_state.agent_packages.directory.entries' ||
    projection?.unknown_package_policy !== 'render_without_app_package_id_branch' ||
    projection?.manifest_lock_receipt_parser_allowed !== false ||
    projection?.action_id_allowlist_allowed !== false ||
    projection?.shell_consumption_policy !== 'generated_product_profile_only_no_renderer_literal'
  ) {
    throw new Error('Product profile must consume generic Framework Package projections without private metadata or lifecycle parsers');
  }
  for (const forbiddenField of [
    'starter_package_metadata',
    'first_party_manifest_fixture_dir',
    'external_registry_policy_ref',
    'directory_lifecycle_authority',
  ]) {
    if (forbiddenField in projection) {
      throw new Error(`Product profile must not restore private Package consumer field ${forbiddenField}`);
    }
  }
  const presentation = projection.catalog_presentation_policy;
  assertDeepEqualJson(
    presentation?.section_order,
    ['opl_managed', 'other_agents', 'other_capabilities'],
    'Product profile Agent catalog section order',
  );
  if (
    JSON.stringify(presentation?.ownership_classifier) !==
      JSON.stringify({
        source_fields: ['official', 'publisher'],
        opl_official: true,
        opl_publisher: 'one-person-lab',
        hardcoded_package_ids_allowed: false,
      }) ||
    JSON.stringify(presentation?.section_policy) !==
      JSON.stringify({
        opl_managed:
          'all dynamically identified OPL-owned Package roles, with standard Agents before workflow and capability Packages',
        other_agents: 'non-OPL standard Agents',
        other_capabilities: 'non-OPL workflow, capability, and unknown Package roles',
        availability_status_is_row_state_not_grouping: true,
      }) ||
    presentation?.standard_agent_name_policy !==
      'owner-projected invariant English brand name in every locale' ||
    presentation?.description_locale_policy !== 'active UI locale then owner-default fallback' ||
    JSON.stringify(presentation?.package_role_labels_i18n) !==
      JSON.stringify({
        standard_agent: { 'zh-CN': '专业智能体', 'en-US': 'Professional agent' },
        capability_package: { 'zh-CN': '能力包', 'en-US': 'Capability package' },
        workflow_profile: { 'zh-CN': '工作流配置', 'en-US': 'Workflow profile' },
      }) ||
    presentation?.raw_package_role_visible !== false ||
    presentation?.dependency_hierarchy?.source !==
      'app_state.agent_packages.status_index.packages[].dependent_guard.required_by_package_ids' ||
    presentation?.dependency_hierarchy?.direction !==
      'a_package_with_one_visible_required_by_package_id_is_nested_under_that_parent_package' ||
    presentation?.dependency_hierarchy?.single_parent_policy !==
      'render_once_as_a_compact_child_row_under_the_visible_parent' ||
    presentation?.dependency_hierarchy?.multiple_parent_policy !==
      'render_once_in_the_ownership-matched_capability_group_with_localized_parent_labels' ||
    presentation?.dependency_hierarchy?.missing_or_invisible_parent_policy !==
      'render_once_in_the_ownership-matched_capability_group' ||
    presentation?.dependency_hierarchy?.hardcoded_package_relationships_allowed !== false ||
    presentation?.dependency_hierarchy?.duplicate_rows_allowed !== false ||
    presentation?.dependency_hierarchy?.status_and_actions_source !==
      'unchanged_Framework_directory_and_status_index_projection' ||
    presentation?.developer_controls_disclosure?.default_state !== 'collapsed' ||
    JSON.stringify(presentation?.developer_controls_disclosure?.contains) !==
      JSON.stringify([
        'global_runtime_source',
        'authorized_repository_maintenance',
        'workspace_and_repository_protection_summary',
      ]) ||
    presentation?.developer_controls_disclosure?.ordinary_catalog_remains_visible_when_collapsed !== true
  ) {
    throw new Error('Product profile Agent catalog must use localized product ordering and projected dependency hierarchy');
  }
}

export function validateProductProfileSettings(profile) {
  validateSettingsControlPlaneBehavior({ productProfile: profile });
  const queryFreeControlPlaneRedirects = Object.fromEntries(
    Object.entries(profile.settings.control_plane.legacy_route_redirects ?? {})
      .filter(([id]) => id !== 'about')
      .map(([id, target]) => [id, String(target).split('?')[0]]),
  );
  assertDeepEqualJson(
    profile.settings?.visible_tabs,
    profile.settings.control_plane.ordinary_visible_tabs,
    'Product profile ordinary settings visible tabs',
  );
  assertDeepEqualJson(
    profile.settings?.legacy_route_redirects,
    queryFreeControlPlaneRedirects,
    'Product profile legacy settings route redirects',
  );
  if (
    profile.settings?.control_plane?.source_contract_ref !==
    'contracts/app-gui-product-contract.json#settings_navigation'
  ) {
    throw new Error('Product profile settings.control_plane must project the App Settings control plane');
  }
  assertDeepEqualJson(
    profile.settings.control_plane.ordinary_visible_tabs,
    profile.settings?.visible_tabs,
    'Product profile settings.control_plane ordinary tabs',
  );
  assertDeepEqualJson(
    profile.settings.control_plane.ordinary_routes?.map((route) => route.id),
    profile.settings.control_plane.ordinary_visible_tabs,
    'Product profile settings.control_plane ordinary route ids',
  );
  assertDeepEqualJson(
    Object.fromEntries(
      Object.entries(profile.settings.control_plane.legacy_route_redirects ?? {})
        .filter(([id]) => id !== 'about')
        .map(([id, target]) => [id, String(target).split('?')[0]]),
    ),
    profile.settings?.legacy_route_redirects,
    'Product profile settings.control_plane legacy redirects',
  );
}

export function validateProductProfileCodexSkills(profile) {
  for (const forbidden of [
    'tools',
    'ecosystem_modules',
    'management_authority',
    'upstream_packages',
    'official_codex_runtime_capabilities',
    'default_packaged_codex_skill_ids',
    'additional_package_skill_ids',
    'domain_plugin_skill_ids',
  ]) {
    if (forbidden in (profile.companion_payloads ?? {})) {
      throw new Error(`Product profile must not own capability inventory through companion_payloads.${forbidden}`);
    }
  }
}

export function validateInstallUpdateTaxonomy(profile) {
  assertDeepEqualJson(
    profile.install_update_taxonomy?.public_software_objects,
    ['opl_base', 'opl_app', 'opl_packages'],
    'Product profile public software objects',
  );
  assertDeepEqualJson(
    profile.install_update_taxonomy?.managed_update_component_keys,
    ['opl_base', 'opl_app', 'opl_packages'],
    'Product profile managed update component keys',
  );
  assertDeepEqualJson(
    profile.install_update_taxonomy?.transaction_internal_state_ids,
    ['runtime_substrate', 'capability_packages', 'companion_tools', 'codex_surface', 'workflow_profile'],
    'Product profile transaction internal state ids',
  );
  assertDeepEqualJson(
    profile.install_update_taxonomy?.ordinary_ui_must_not_expose_as_peer_objects,
    [
      'app_binary',
      'runtime_toolchain',
      'agent_package_channel',
      'capability_exposure',
      'codex_cli_fallback',
      'runtime_substrate',
      'capability_packages',
      'companion_tools',
      'codex_surface',
      'workflow_profile',
    ],
    'Product profile forbidden peer software objects',
  );
  assertDeepEqualJson(
    profile.install_update_taxonomy?.internal_detail_fields,
    {
      opl_base: ['dependency_status', 'integration_status'],
      opl_app: ['host_update_route', 'host_executor_required'],
      opl_packages: ['current', 'conditions', 'owner_route', 'status_detail'],
    },
    'Product profile managed update internal detail fields',
  );
  if (profile.install_update_taxonomy?.ordinary_component_picker_allowed !== false) {
    throw new Error('Product profile ordinary component picker must be disabled');
  }
  if (
    profile.companion_payloads?.class !== 'opl_base_integrations' ||
    profile.companion_payloads?.opl_packages_projection_ref !== 'contracts/app-install-exposure-policy.json#exposure_classes.codex_surface' ||
    profile.companion_payloads?.opl_packages_lifecycle_ref !==
      'contracts/app-install-exposure-policy.json#agent_installation_contract.managed_package_distribution'
  ) {
    throw new Error('Product profile payloads must map Base integrations and Packages projection/lifecycle without peer updater classes');
  }
}

export function validateOrdinaryCapabilitySelectorPolicy(profile) {
  const policy = profile.gui?.ordinary_capability_selector_policy;
  if (
    policy?.scope !== 'home_composer_and_ordinary_conversation' ||
    policy?.authority !== 'owner_or_carrier_skill_projection_and_mcp_negative_filter' ||
    policy?.palette_agent_catalog_source_ref !==
      'app_state.agent_packages.directory.entries' ||
    JSON.stringify(policy?.opl_standard_agent_membership_policy) !==
      JSON.stringify(appOwnedOplStandardAgentMembershipPolicy) ||
    policy?.palette_agent_status_source_ref !== 'app_state.agent_packages.status_index.packages[]' ||
    policy?.palette_agent_availability_policy !==
      'join_by_package_id_and_use_fresh_directory_installed_plus_status_index_presence.present_and_presence.callable' ||
    policy?.palette_agent_action_policy !== 'directory_available_actions_and_recommended_action_ref_only' ||
    policy?.palette_unknown_standard_agent_policy !==
      'include_unknown_package_ids_only_when_they_match_opl_standard_agent_membership' ||
    policy?.palette_required_agent_package_ids !== undefined ||
    JSON.stringify(policy?.palette_agent_group_label_i18n) !==
      JSON.stringify({ 'zh-CN': 'OPL 标准智能体', 'en-US': 'OPL standard agents' }) ||
    policy?.palette_home_shortcut_independence_policy !==
      'complete_opl_standard_agent_catalog_independent_of_home_shortcut_visibility_and_order' ||
    policy?.agent_owned_skill_deduplication_policy !==
      'exclude_rendered_professional_agent_required_skill_ids_from_home_new_session_standalone_skills' ||
    policy?.skill_source_ref !== 'owner_or_carrier_projected_capability_metadata_for_the_selected_package' ||
    policy?.conversation_loaded_skill_display_policy !==
      'preserve_owner_or_carrier_projected_loaded_skills' ||
    policy?.mcp_server_source_ref !== 'configured_user_and_third_party_mcp_servers' ||
    policy?.mcp_menu_policy !==
      'preserve_configured_user_and_third_party_servers_except_explicit_forbidden_matchers' ||
    policy?.conversation_loaded_mcp_display_policy !== 'preserve_non_forbidden_configured_servers' ||
    policy?.unmatched_mcp_policy !== 'preserve_end_to_end_without_app_allowlist_membership' ||
    Object.prototype.hasOwnProperty.call(policy, 'forbidden_skill_examples')
  ) {
    throw new Error('Product profile ordinary selector must use owner/carrier Skill projection and the MCP negative filter');
  }
  assertAgentReferenceAdmissionPolicy(
    policy.agent_reference_admission_policy,
    'Product profile Agent reference admission policy',
  );
  assertForbiddenCapabilityPolicy(
    policy,
    appOwnedOrdinaryForbiddenCapabilityPolicy,
    'Product profile ordinary forbidden MCP policy',
  );
  assertDeepEqualJson(
    policy.required_scrub_targets,
    [
      'mcp_servers entries matching forbidden_mcp_matchers',
      'mcp_statuses entries matching forbidden_mcp_matchers',
      'session_mcp_servers entries matching forbidden_mcp_matchers',
      'scrub_extra_keys',
    ],
    'Product profile ordinary Team scrub targets',
  );
  assertDeepEqualJson(
    policy.required_preservation_targets,
    [
      'mcp directory entries not matching forbidden_mcp_matchers',
      'mcp status entries not matching forbidden_mcp_matchers',
      'new conversation create payload mcp_servers not matching forbidden_mcp_matchers',
      'conversation snapshot mcp_servers and mcp_statuses not matching forbidden_mcp_matchers',
    ],
    'Product profile ordinary MCP preservation targets',
  );
  if (policy.conversation_snapshot_policy !== 'scrub_disabled_team_mcp_and_team_metadata_before_rendering_or_inheriting_ordinary_conversations') {
    throw new Error('Product profile ordinary selector must scrub disabled Team MCP snapshots');
  }
}
