import type { AppProductProfile } from '../types.ts';
import { assertIncludesAll, assertStringArray, developerProfileCapabilityAxes } from './support.ts';

export function assertSettingsProfileShape(profile: AppProductProfile): void {
  assertStringArray(profile.settings.visible_tabs, 'settings.visible_tabs');
  const controlPlane = profile.settings.control_plane;
  if (
    !controlPlane ||
    controlPlane.source_contract_ref !== 'contracts/app-gui-product-contract.json#settings_navigation'
  ) {
    throw new Error(
      'App product profile settings.control_plane must project contracts/app-gui-product-contract.json#settings_navigation'
    );
  }
  const ordinaryRoutes = Array.isArray(controlPlane.ordinary_routes) ? controlPlane.ordinary_routes : [];
  const secondaryPages = Array.isArray(controlPlane.secondary_pages) ? controlPlane.secondary_pages : [];
  const ordinaryRouteIds = ordinaryRoutes.map((route) => route.id);
  const secondaryPageIds = secondaryPages.map((page) => page.id);
  assertStringArray(controlPlane.ordinary_visible_tabs, 'settings.control_plane.ordinary_visible_tabs');
  assertStringArray(ordinaryRouteIds, 'settings.control_plane.ordinary_routes ids');
  assertStringArray(secondaryPageIds, 'settings.control_plane.secondary_pages ids');
  const controlPlaneRedirects = Object.fromEntries(
    Object.entries(controlPlane.legacy_route_redirects ?? {})
      .filter(([id]) => id !== 'about')
      .map(([id, target]) => [id, String(target).split('?')[0]]),
  );
  if (JSON.stringify(profile.settings.visible_tabs) !== JSON.stringify(controlPlane.ordinary_visible_tabs)) {
    throw new Error('App product profile settings.visible_tabs must match the projected Settings control plane ordinary tabs');
  }
  if (JSON.stringify(profile.settings.legacy_route_redirects) !== JSON.stringify(controlPlaneRedirects)) {
    throw new Error('App product profile settings.legacy_route_redirects must match query-free Settings control plane redirects');
  }
  if (JSON.stringify(controlPlane.ordinary_visible_tabs) !== JSON.stringify(ordinaryRouteIds)) {
    throw new Error('App product profile settings.control_plane must keep ordinary settings tabs on App-owned pages');
  }
  if (controlPlane.extension_tab_policy?.legacy_anchor_remap_required !== true) {
    throw new Error('App product profile settings.control_plane must require legacy extension anchor remapping');
  }
  const recommendedActionIds = controlPlane.state_action_policy?.recommended_action_ids;
  if (
    !recommendedActionIds ||
    typeof recommendedActionIds !== 'object' ||
    Array.isArray(recommendedActionIds) ||
    recommendedActionIds.doctor !== 'doctor' ||
    recommendedActionIds.repair !== 'repair'
  ) {
    throw new Error('App product profile settings.control_plane.state_action_policy.recommended_action_ids must expose doctor and repair action ids');
  }
  const declaredSlotIds = new Set(Object.keys(controlPlane.slot_registry ?? {}));
  for (const route of [...controlPlane.ordinary_routes, ...controlPlane.secondary_pages]) {
    if (!declaredSlotIds.has(route.slot_id)) {
      throw new Error(`App product profile settings.control_plane.slot_registry must declare ${route.slot_id}`);
    }
  }
  const settingsIa = profile.settings.settings_information_architecture ?? {};
  const groupIds = Array.isArray(settingsIa.ordinary_groups)
    ? settingsIa.ordinary_groups.map((group) => group.id)
    : [];
  assertStringArray(groupIds, 'settings_information_architecture.ordinary_groups ids');
  if (new Set(groupIds).size !== groupIds.length) {
    throw new Error('App product profile settings_information_architecture ordinary group ids must be unique');
  }
  const routeGroupIds = ordinaryRoutes.map((route) => route.ia_group);
  assertStringArray(routeGroupIds, 'settings.control_plane.ordinary_routes ia_group values');
  const uniqueRouteGroupIds = [...new Set(routeGroupIds)];
  if (
    uniqueRouteGroupIds.length !== groupIds.length ||
    groupIds.some((groupId) => !uniqueRouteGroupIds.includes(groupId))
  ) {
    throw new Error('App product profile settings_information_architecture must describe every Control Center IA group');
  }
  const userNavigationProjection = (
    controlPlane as typeof controlPlane & {
      user_navigation_projection?: {
        schema?: string;
        primary_group_order?: string[];
      };
    }
  ).user_navigation_projection;
  if (userNavigationProjection?.schema !== 'opl_app_settings_user_navigation.v2') {
    throw new Error('App product profile Settings user navigation projection must use v2');
  }
  assertStringArray(
    userNavigationProjection.primary_group_order,
    'settings.control_plane.user_navigation_projection.primary_group_order',
  );
  if (JSON.stringify(groupIds) !== JSON.stringify(userNavigationProjection.primary_group_order)) {
    throw new Error(
      'App product profile settings_information_architecture ordinary group order must match the v2 primary_group_order',
    );
  }
  const primaryTabIds = Object.keys(settingsIa.primary_tabs ?? {});
  assertIncludesAll(primaryTabIds, ordinaryRouteIds, 'settings_information_architecture.primary_tabs');
  for (const tabId of primaryTabIds) {
    if (![...ordinaryRouteIds, ...secondaryPageIds].includes(tabId)) {
      throw new Error(`App product profile settings_information_architecture.primary_tabs contains unknown settings route ${tabId}`);
    }
  }
  if (JSON.stringify(settingsIa.secondary_page_ids ?? []) !== JSON.stringify(secondaryPageIds)) {
    throw new Error('App product profile settings_information_architecture.secondary_page_ids must declare secondary settings pages');
  }
  const taskEntryPolicy = settingsIa.task_entry_policy;
  if (!taskEntryPolicy || typeof taskEntryPolicy !== 'object') {
    throw new Error('App product profile settings_information_architecture.task_entry_policy must be declared');
  }
  if (
    taskEntryPolicy.ordinary_entry_model !==
    'seven_primary_groups_expand_or_drill_into_second_level_destinations_backed_by_ten_stable_carrier_routes'
  ) {
    throw new Error('App product profile task_entry_policy must group ten stable carrier routes under seven primary entries');
  }
  assertIncludesAll(
    taskEntryPolicy.p0_entries ?? [],
    ['gateway_account', 'model_access', 'local_runtime_ability', 'workspace_entry', 'maintenance_hub', 'capability_status'],
    'settings_information_architecture.task_entry_policy.p0_entries',
  );
  assertIncludesAll(
    taskEntryPolicy.p1_entries ?? [],
    ['remote_access', 'advanced_deployment', 'developer_source_control', 'external_tools_voice'],
    'settings_information_architecture.task_entry_policy.p1_entries',
  );
  assertIncludesAll(
    taskEntryPolicy.hidden_as_ordinary_ui ?? [],
    ['AionUI Team', 'backend/provider raw selector', 'AG-UI implementation surface', 'AionUI implementation skills', 'raw runtime/provider internals'],
    'settings_information_architecture.task_entry_policy.hidden_as_ordinary_ui',
  );
  assertStringArray(profile.settings.environment_items, 'settings.environment_items');
  const developerProfile = profile.settings.developer_profile;
  if (!developerProfile || typeof developerProfile !== 'object') {
    throw new Error('App product profile settings.developer_profile must be declared');
  }
  if (
    developerProfile.source !== 'app_state.developer_profile + app_state.modules[].source_policy' ||
    developerProfile.default_profile !== 'standard_user' ||
    developerProfile.opt_in_policy !== 'automatic_for_matching_identity_and_authorized_repositories_with_explicit_off' ||
    developerProfile.settings_page !== 'settings_agents' ||
    developerProfile.global_control !== 'automatic_managed_developer_source_segmented_control' ||
    developerProfile.safe_maintenance_control !== 'auto_or_off_control_with_effective_state_readback' ||
    developerProfile.safe_maintenance_label_zh !== '允许维护已授权的开发仓库' ||
    developerProfile.safe_maintenance_label_en !== 'Maintain authorized development repositories' ||
    developerProfile.safe_maintenance_default !== 'auto' ||
    developerProfile.safe_maintenance_auto_policy !== 'matching developer identity plus successful full repository authority inspection activates developer_apply_safe for authorized repositories' ||
    developerProfile.safe_maintenance_fast_policy !== 'show inspection pending without claiming identity mismatch' ||
    developerProfile.shared_runtime_mutation_boundary !== 'enabled=on + mode=developer_apply_safe + source=user_config' ||
    developerProfile.safe_maintenance_independent_from_source_selection !== true ||
    developerProfile.package_source_control !== 'auto_managed_developer_segmented_control_in_package_details' ||
    developerProfile.fallback_policy !== 'developer_checkout_missing_falls_back_to_managed_with_visible_reason' ||
    developerProfile.hide_machine_status !== true
  ) {
    throw new Error('App product profile Developer Profile must preserve automatic authorized-repository maintenance with an explicit off choice');
  }
  assertIncludesAll(
    developerProfile.safe_maintenance_required_readback ?? [],
    ['effective_state', 'configuration_source', 'github_login', 'authorized_repository_scope', 'dirty_worktree_and_branch_protection', 'inactive_reason'],
    'settings.developer_profile.safe_maintenance_required_readback',
  );
  if (JSON.stringify(developerProfile.capability_axes) !== JSON.stringify(developerProfileCapabilityAxes)) {
    throw new Error('App product profile Developer Profile must declare the required capability axes');
  }
  for (const axis of developerProfileCapabilityAxes) {
    const capability = developerProfile.capabilities?.[axis];
    if (!capability || typeof capability !== 'object') {
      throw new Error(`App product profile Developer Profile capability ${axis} must be declared`);
    }
    for (const field of ['standard_default', 'developer_opt_in', 'display_policy'] as const) {
      if (typeof capability[field] !== 'string' || !capability[field].trim()) {
        throw new Error(`App product profile Developer Profile capability ${axis}.${field} must be a non-empty string`);
      }
    }
  }
  if (
    developerProfile.capabilities.source_channel.standard_default !== 'agent_rolling_latest_package_channel' ||
    developerProfile.capabilities.source_channel.developer_opt_in !== 'github_repo_or_local_checkout' ||
    developerProfile.capabilities.runtime_mutation_scope.standard_default !== 'app_action_route_only' ||
    'legacy_developer_mode_alias' in developerProfile
  ) {
    throw new Error('App product profile Developer Profile must use capability display without legacy Developer Mode aliases');
  }
}
