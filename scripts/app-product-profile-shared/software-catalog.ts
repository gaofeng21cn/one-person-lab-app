const maintenanceScopes = ['opl', 'external', 'components'];
const catalogColumns = ['software', 'software_type', 'installed_version', 'available_version', 'status', 'action'];
const catalogStatuses = ['not_installed', 'installed', 'update_available', 'attention', 'unknown'];

function same(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

/** Shared by active-shell validation and the packaging profile reader. */
export function assertSoftwareCatalogPresentation(presentation: any): void {
  const ownership = presentation?.ownership_classifier;
  const sections = presentation?.section_policy;
  const dependencies = presentation?.dependency_hierarchy;
  if (
    !same(presentation?.section_order, maintenanceScopes) ||
    !same(ownership?.source_fields, ['catalog_origin', 'origin_basis', 'catalog_source', 'catalog_scope']) ||
    ownership?.opl_origin !== 'opl' ||
    ownership?.unknown_origin !== 'external' ||
    ownership?.publisher_or_name_inference_allowed !== false ||
    ownership?.maintenance_origin_grants_trust_or_actions !== false ||
    ownership?.hardcoded_package_ids_allowed !== false ||
    sections?.product_type_is_filter_not_section !== true ||
    sections?.availability_status_is_row_state_not_grouping !== true ||
    maintenanceScopes.some(scope => typeof sections?.[scope] !== 'string' || !sections[scope].trim()) ||
    !same(presentation?.list_columns, catalogColumns) ||
    !same(presentation?.row_statuses, catalogStatuses) ||
    presentation?.standard_agent_name_policy !== 'owner-projected invariant English brand name in every locale' ||
    presentation?.description_locale_policy !== 'active UI locale then owner-default fallback' ||
    !same(presentation?.package_role_labels_i18n, {
      standard_agent: { 'zh-CN': '专业智能体', 'en-US': 'Professional agent' },
      capability_package: { 'zh-CN': '能力包', 'en-US': 'Capability package' },
      workflow_profile: { 'zh-CN': '工作流配置', 'en-US': 'Workflow profile' },
    }) ||
    presentation?.raw_package_role_visible !== false ||
    dependencies?.source !== 'app_state.agent_packages.status_index.packages[].dependent_guard.required_by_package_ids' ||
    dependencies?.presentation !== 'details_and_uninstall_impact' ||
    dependencies?.ordinary_list_policy !== 'one_product_one_row_without_inline_dependency_tree' ||
    dependencies?.hardcoded_package_relationships_allowed !== false ||
    dependencies?.duplicate_rows_allowed !== false ||
    dependencies?.status_and_actions_source !== 'unchanged_Framework_directory_and_status_index_projection' ||
    presentation?.developer_controls_disclosure?.default_state !== 'collapsed' ||
    !same(presentation?.developer_controls_disclosure?.contains, [
      'global_runtime_source',
      'authorized_repository_maintenance',
      'workspace_and_repository_protection_summary',
    ]) ||
    presentation?.developer_controls_disclosure?.ordinary_catalog_remains_visible_when_collapsed !== true
  ) {
    throw new Error('Software catalog must use projected maintenance scopes, concise rows, and owner-provided lifecycle actions');
  }
}
