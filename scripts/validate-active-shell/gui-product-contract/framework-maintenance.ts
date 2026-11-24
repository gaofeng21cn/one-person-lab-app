import { assertDeepEqualJson } from '../assertions.ts';

export function validateFrameworkModuleMaintenanceEntry(entry) {
  if (
    entry?.settings_page !== 'settings_environment' ||
    entry?.display_role !== 'user_facing_module_maintenance_entry' ||
    entry?.app_role !== 'managed_update_status_action_consumer_only' ||
    entry?.kernel_implementation_allowed !== false ||
    entry?.domain_truth_write_allowed !== false ||
    entry?.developer_checkout_silent_update_allowed !== false ||
    entry?.dirty_checkout_silent_update_allowed !== false
  ) {
    throw new Error('App GUI managed update plane must expose module maintenance under Local Environment without owning the update kernel');
  }
  if (
    entry?.module_collection_source !== 'app_state.modules.items[]' ||
    entry?.module_collection_policy !==
      'render every Framework-projected Package module without an App Package-id allowlist' ||
    'must_include_modules' in entry
  ) {
    throw new Error('App GUI framework module maintenance must consume the dynamic Framework module collection');
  }
  assertDeepEqualJson(
    entry?.status_sources,
    ['opl app state --profile fast --json#managed_update', 'opl update status --json#managed_update'],
    'App GUI framework module maintenance status sources',
  );
  if (
    entry?.projected_action_source !== 'app_state.agent_packages.directory.entries[].available_actions[]' ||
    entry?.ordinary_action_policy !==
      'navigate_to_Settings_Agents_and_execute_only_the_selected_row_projected_action' ||
    entry?.private_command_mapping_allowed !== false ||
    'manual_action_mapping' in entry
  ) {
    throw new Error('App GUI framework module maintenance must delegate Package actions to the dynamic Agents directory');
  }
}
