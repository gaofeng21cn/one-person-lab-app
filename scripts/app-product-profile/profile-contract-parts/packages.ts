import type { AppProductProfile } from '../types.ts';

export function assertAgentPackageRegistryProjection(profile: AppProductProfile): void {
  const projection = profile.gui.agent_package_registry;
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
    throw new Error('App product profile must consume generic Framework Package projections without private metadata or lifecycle parsers');
  }
  for (const forbiddenField of [
    'starter_package_metadata',
    'first_party_manifest_fixture_dir',
    'external_registry_policy_ref',
    'directory_lifecycle_authority',
  ]) {
    if (forbiddenField in projection) {
      throw new Error(`App product profile must not restore private Package consumer field ${forbiddenField}`);
    }
  }
  const presentation = projection.catalog_presentation_policy;
  if (
    JSON.stringify(presentation.section_order) !==
      JSON.stringify(['opl_managed', 'other_agents', 'other_capabilities']) ||
    JSON.stringify(presentation.ownership_classifier) !==
      JSON.stringify({
        source_fields: ['official', 'publisher'],
        opl_official: true,
        opl_publisher: 'one-person-lab',
        hardcoded_package_ids_allowed: false,
      }) ||
    JSON.stringify(presentation.section_policy) !==
      JSON.stringify({
        opl_managed:
          'all dynamically identified OPL-owned Package roles, with standard Agents before workflow and capability Packages',
        other_agents: 'non-OPL standard Agents',
        other_capabilities: 'non-OPL workflow, capability, and unknown Package roles',
        availability_status_is_row_state_not_grouping: true,
      }) ||
    presentation.standard_agent_name_policy !==
      'owner-projected invariant English brand name in every locale' ||
    presentation.description_locale_policy !== 'active UI locale then owner-default fallback' ||
    JSON.stringify(presentation.package_role_labels_i18n) !==
      JSON.stringify({
        standard_agent: { 'zh-CN': '专业智能体', 'en-US': 'Professional agent' },
        capability_package: { 'zh-CN': '能力包', 'en-US': 'Capability package' },
        workflow_profile: { 'zh-CN': '工作流配置', 'en-US': 'Workflow profile' },
      }) ||
    presentation.raw_package_role_visible !== false ||
    presentation.dependency_hierarchy.source !==
      'app_state.agent_packages.status_index.packages[].dependent_guard.required_by_package_ids' ||
    presentation.dependency_hierarchy.direction !==
      'a_package_with_one_visible_required_by_package_id_is_nested_under_that_parent_package' ||
    presentation.dependency_hierarchy.single_parent_policy !==
      'render_once_as_a_compact_child_row_under_the_visible_parent' ||
    presentation.dependency_hierarchy.multiple_parent_policy !==
      'render_once_in_the_ownership-matched_capability_group_with_localized_parent_labels' ||
    presentation.dependency_hierarchy.missing_or_invisible_parent_policy !==
      'render_once_in_the_ownership-matched_capability_group' ||
    presentation.dependency_hierarchy.hardcoded_package_relationships_allowed !== false ||
    presentation.dependency_hierarchy.duplicate_rows_allowed !== false ||
    presentation.dependency_hierarchy.status_and_actions_source !==
      'unchanged_Framework_directory_and_status_index_projection' ||
    presentation.developer_controls_disclosure.default_state !== 'collapsed' ||
    JSON.stringify(presentation.developer_controls_disclosure.contains) !==
      JSON.stringify([
        'global_runtime_source',
        'authorized_repository_maintenance',
        'workspace_and_repository_protection_summary',
      ]) ||
    presentation.developer_controls_disclosure.ordinary_catalog_remains_visible_when_collapsed !== true
  ) {
    throw new Error('App product profile Agent catalog must use localized product ordering and projected dependency hierarchy');
  }
}
