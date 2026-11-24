import { assertDeepEqualJson, assertIncludesAll } from "../assertions.ts";
import {
  appActionRoute,
  appOwnedSecondarySettingsPages,
  appOwnedSettingsResourcesBrowserEntry,
  appOwnedSettingsCompatibilityRedirects,
  appOwnedSettingsCardFields,
  appOwnedSettingsCapabilitiesTabContract,
  appOwnedSettingsConfirmationFields,
  appOwnedSettingsIaGroupIds,
  appOwnedSettingsIssueStatuses,
  appOwnedSettingsAboutUpdaterStatePolicy,
  appOwnedSettingsAppUpdateStatePolicy,
  appOwnedSettingsAppUpdateStatePolicyRef,
  appOwnedSettingsMakeUsableAllowedSteps,
  appOwnedSettingsMakeUsableForbiddenSteps,
  appOwnedSettingsManagedDependencySummary,
  appOwnedSettingsManagedUpdateRepairPolicy,
  appOwnedSettingsManagedUpdateRepairPolicyRef,
  appOwnedSettingsNavigationDestinationIds,
  appOwnedSettingsNavigationDestinationOwners,
  appOwnedSettingsNavigationGroupLabels,
  appOwnedSettingsProductSystemItemIds,
  appOwnedSettingsProductSystemTracks,
  appOwnedSettingsProjectionItemFields,
  appOwnedSettingsProjectionSectionIds,
  appOwnedSettingsPostUpdateNoticeFields,
  appOwnedSettingsPageExperienceFields,
  appOwnedSettingsPageAnchors,
  appOwnedSettingsPageSearchEntryIds,
  appOwnedSettingsProductPageIds,
  appOwnedSettingsResourceActionBehavior,
  appOwnedStorageCarrierBehavior,
  appOwnedWebuiDataVolumeHostActionAbiRef,
  appOwnedWebuiDataVolumeHostActionCapabilityId,
  appOwnedSettingsRouteScopes,
  appOwnedSettingsSearchEntryFields,
  appOwnedSettingsSearchProtocol,
  appOwnedSettingsTabs,
  appOwnedSettingsTaskEntryMetadataFields,
  appOwnedSettingsTechnicalDetailsDefault,
  appOwnedSettingsTopLevelEntryIds,
  appOwnedSettingsTopLevelLabels,
  appOwnedSettingsUpstreamIntakeClassifications,
  appOwnedSettingsTaskEntryIds,
  appOwnedSettingsVisualQaTargets,
  appOwnedSettingsVisualSystem,
  legacySettingsRouteRedirects,
} from "../app-contract-constants.ts";
import { validateSettingsCapabilitiesTaskAwarenessSurface } from "../shared-contract-validators.ts";

import {
  settingsIaRef,
} from "./constants.ts";
import {
  assertKnownSettingsRoute,
  settingsRouteResolution,
} from "./shared.ts";

export function buildHydratedSettingsRegistry(controlPlane) {
  return {
    ordinary_routes: (controlPlane.ordinary_routes ?? []).map((route) => {
      const slot = controlPlane.slot_registry?.[route.slot_id];
      return {
        id: route.id,
        path: route.path,
        route_scope: "ordinary",
        ia_group: route.ia_group,
        slot_id: route.slot_id,
        component_key: slot?.component_key ?? null,
        wrapper_policy: slot?.wrapper_policy ?? null,
      };
    }),
    secondary_pages: (controlPlane.secondary_pages ?? []).map((page) => {
      const slot = controlPlane.slot_registry?.[page.slot_id];
      return {
        id: page.id,
        path: page.path,
        route_scope: page.visibility,
        ia_group: page.ia_group,
        slot_id: page.slot_id,
        component_key: slot?.component_key ?? null,
      };
    }),
    compatibility_redirects: controlPlane.compatibility_redirects ?? {},
    legacy_route_redirects: controlPlane.legacy_route_redirects ?? {},
    extension_anchor_remap: controlPlane.extension_anchor_remap ?? {},
  };
}

export function resolveSettingsControlPlaneRoute(controlPlane, routeId) {
  const registry = buildHydratedSettingsRegistry(controlPlane);
  const ordinaryRoute = registry.ordinary_routes.find(
    (route) => route.id === routeId,
  );
  if (ordinaryRoute) {
    return settingsRouteResolution(
      routeId,
      ordinaryRoute.id,
      ordinaryRoute,
      "ordinary",
    );
  }
  const secondaryRoute = registry.secondary_pages.find(
    (route) => route.id === routeId,
  );
  if (secondaryRoute) {
    return settingsRouteResolution(
      routeId,
      secondaryRoute.id,
      secondaryRoute,
      "secondary_or_deep_link",
    );
  }
  const compatibilityRedirect = registry.compatibility_redirects[routeId];
  if (compatibilityRedirect) {
    const targetRoute = registry.ordinary_routes.find(
      (route) => route.id === compatibilityRedirect.target_route_id,
    );
    if (!targetRoute) {
      throw new Error(
        `Settings compatibility route ${routeId} redirects to unknown Settings route ${compatibilityRedirect.target_route_id}`,
      );
    }
    return settingsRouteResolution(
      routeId,
      targetRoute.id,
      targetRoute,
      "compatibility_redirect",
      compatibilityRedirect.anchor,
      compatibilityRedirect.anchor_query_param,
    );
  }
  const redirectTarget = registry.legacy_route_redirects[routeId];
  if (redirectTarget) {
    const [targetWithQuery, anchor] = String(redirectTarget).split("#");
    const [targetId, query] = targetWithQuery.split("?");
    const targetRoute =
      registry.ordinary_routes.find((route) => route.id === targetId) ??
      registry.secondary_pages.find((route) => route.id === targetId);
    if (!targetRoute) {
      throw new Error(
        `Settings legacy route ${routeId} redirects to unknown Settings route ${targetId}`,
      );
    }
    return settingsRouteResolution(
      routeId,
      targetRoute.id,
      {
        ...targetRoute,
        path: buildSettingsRoutePath(targetRoute.path, query, anchor),
      },
      "legacy_redirect",
      anchor ?? null,
      anchor ? "section" : null,
    );
  }
  return settingsRouteResolution(
    routeId,
    "general",
    registry.ordinary_routes.find((route) => route.id === "general"),
    "unknown_redirect",
  );
}

export function buildSettingsRoutePath(path, query, anchor) {
  const parameters = [
    query,
    anchor ? `section=${encodeURIComponent(anchor)}` : null,
  ].filter(Boolean);
  return parameters.length > 0 ? `${path}?${parameters.join("&")}` : path;
}

export function remapSettingsExtensionAnchor(controlPlane, anchorId) {
  const remapped = controlPlane.extension_anchor_remap?.[anchorId];
  if (remapped) {
    return remapped;
  }
  throw new Error(`Settings extension anchor ${anchorId} is unknown`);
}

export function validateCrossContractConsistency(
  controlPlane,
  guiContract,
  pageStateMatrix,
  productProfile,
) {
  const settingsNavigation = guiContract?.settings_navigation;
  assertDeepEqualJson(
    settingsNavigation?.ordinary_visible_tabs,
    controlPlane.ordinary_visible_tabs,
    "Settings control plane ordinary tabs vs GUI contract",
  );
  assertDeepEqualJson(
    settingsNavigation?.settings_ia?.ordinary_route_ids,
    controlPlane.ordinary_routes.map((route) => route.id),
    "Settings control plane route ids vs GUI contract settings IA",
  );
  assertDeepEqualJson(
    settingsNavigation?.settings_ia?.secondary_or_deep_link_route_ids,
    controlPlane.secondary_pages.map((page) => page.id),
    "Settings control plane secondary pages vs GUI contract settings IA",
  );
  assertDeepEqualJson(
    settingsNavigation?.compatibility_redirects,
    controlPlane.compatibility_redirects,
    "Settings control plane compatibility redirects vs GUI contract",
  );
  assertDeepEqualJson(
    guiContract?.pages?.settings_resources?.browser_access_entry,
    controlPlane.experience_contract?.page_contracts?.resources
      ?.browser_access_entry,
    "Settings Resources browser entry vs GUI contract",
  );
  assertDeepEqualJson(
    guiContract?.pages?.settings_agents?.codex_plugin_directory_target
      ?.tab_contract,
    controlPlane.experience_contract?.page_contracts?.agents
      ?.tab_contract,
    "Settings Agents compatibility tab contract vs GUI contract",
  );
  assertDeepEqualJson(
    guiContract?.pages?.settings_resources?.action_behavior,
    controlPlane.experience_contract?.page_contracts?.resources
      ?.action_behavior,
    "Settings Resources action behavior vs GUI contract",
  );
  assertDeepEqualJson(
    Object.fromEntries(
      Object.entries(controlPlane.legacy_route_redirects)
        .filter(([id]) => id !== "about")
        .map(([id, target]) => [
          id,
          id === "assistants" ? target : String(target).split("?")[0],
        ]),
    ),
    settingsNavigation?.legacy_route_redirects,
    "Settings control plane legacy redirects vs GUI contract",
  );
  const pageIds = new Set(
    (pageStateMatrix?.pages ?? []).map((page) => page.id),
  );
  for (const route of controlPlane.ordinary_routes) {
    if (
      !pageIds.has(route.id) &&
      !pageIds.has(route.slot_id) &&
      !pageIds.has(`settings_${route.id}`)
    ) {
      throw new Error(
        `Settings control plane route ${route.id} must have a page-state matrix entry`,
      );
    }
  }
  assertDeepEqualJson(
    productProfile?.settings?.control_plane?.ordinary_visible_tabs,
    controlPlane.ordinary_visible_tabs,
    "Product profile settings.control_plane ordinary tabs",
  );
  assertDeepEqualJson(
    productProfile?.settings?.control_plane?.ordinary_routes?.map(
      (route) => route.id,
    ),
    controlPlane.ordinary_routes.map((route) => route.id),
    "Product profile settings.control_plane ordinary route ids",
  );
  assertDeepEqualJson(
    Object.fromEntries(
      Object.entries(
        productProfile?.settings?.control_plane?.legacy_route_redirects ?? {},
      ).filter(([id]) => id !== "about" && id !== "assistants"),
    ),
    Object.fromEntries(
      Object.entries(controlPlane.legacy_route_redirects).filter(
        ([id]) => id !== "assistants",
      ),
    ),
    "Product profile settings.control_plane legacy redirects",
  );
  assertDeepEqualJson(
    Object.fromEntries(
      Object.entries(
        productProfile?.settings?.control_plane?.extension_anchor_remap ?? {},
      ).filter(([id]) => id !== "about"),
    ),
    controlPlane.extension_anchor_remap,
    "Product profile settings.control_plane extension anchors",
  );
  assertDeepEqualJson(
    productProfile?.settings?.control_plane?.slot_registry,
    controlPlane.slot_registry,
    "Product profile settings.control_plane slot registry",
  );
  assertDeepEqualJson(
    productProfile?.settings?.control_plane?.state_action_policy
      ?.recommended_action_ids,
    controlPlane.state_action_policy?.recommended_action_ids,
    "Product profile settings.control_plane recommended action ids",
  );
  assertDeepEqualJson(
    productProfile?.settings?.control_plane?.experience_contract?.visual_system,
    controlPlane.experience_contract?.visual_system,
    "Product profile Settings visual system vs control plane",
  );
}

export function assertEveryRouteHasSlot(controlPlane) {
  const slotRegistry = controlPlane.slot_registry ?? {};
  for (const route of [
    ...(controlPlane.ordinary_routes ?? []),
    ...(controlPlane.secondary_pages ?? []),
  ]) {
    if (!slotRegistry[route.slot_id]) {
      throw new Error(
        `Settings control plane slot registry must declare ${route.slot_id}`,
      );
    }
  }
}

export function validateCustomAssistantDataBoundary(controlPlane) {
  assertDeepEqualJson(
    controlPlane.aionui_custom_assistant_boundary,
    {
      opl_app_product_surface: false,
      ordinary_navigation_entry_allowed: false,
      entry_may_be_hidden: true,
      legacy_assistants_target: "capabilities#third-party",
      underlying_user_data_owner: "aionui",
      underlying_user_data_deletion_policy:
        "forbidden_without_explicit_app_contract_and_migration_or_deletion_evidence",
      route_or_entry_removal_proves_data_migration: false,
    },
    "Settings AionUI custom-assistant product and data boundary",
  );
}

export function validateSettingsUserNavigationProjection(projection, settingsIa) {
  if (
    projection?.schema !== "opl_app_settings_user_navigation.v2" ||
    projection.source_ref !== settingsIaRef ||
    projection.carrier_route_policy !==
      "ten_stable_ordinary_route_ids_paths_slots_and_anchors_remain_addressable_but_are_not_rendered_as_ten_primary_navigation_items"
  ) {
    throw new Error(
      "Settings user navigation projection must separate seven visible groups from ten stable carrier routes",
    );
  }
  assertDeepEqualJson(
    projection.primary_group_order,
    appOwnedSettingsIaGroupIds,
    "Settings user navigation primary group order",
  );
  assertDeepEqualJson(
    (projection.primary_groups ?? []).map((group) => group.id),
    appOwnedSettingsIaGroupIds,
    "Settings user navigation primary group ids",
  );
  assertDeepEqualJson(
    Object.fromEntries(
      (projection.primary_groups ?? []).map((group) => [
        group.id,
        { label_zh: group.label_zh, label_en: group.label_en },
      ]),
    ),
    appOwnedSettingsNavigationGroupLabels,
    "Settings user navigation primary group labels",
  );
  const destinationIds = (projection.destinations ?? []).map(
    (destination) => destination.id,
  );
  assertDeepEqualJson(
    destinationIds,
    appOwnedSettingsNavigationDestinationIds,
    "Settings user navigation destination ids",
  );
  for (const group of projection.primary_groups ?? []) {
    if (
      !Array.isArray(group.destination_ids) ||
      !group.destination_ids.includes(group.default_destination_id)
    ) {
      throw new Error(
        `Settings user navigation group ${group.id} must own its default destination`,
      );
    }
  }
  assertDeepEqualJson(
    (projection.primary_groups ?? []).flatMap((group) => group.destination_ids),
    appOwnedSettingsNavigationDestinationIds,
    "Settings user navigation group destination order",
  );
  for (const destination of projection.destinations ?? []) {
    const expected = appOwnedSettingsNavigationDestinationOwners[destination.id];
    if (
      !expected ||
      destination.owner_group_id !== expected.owner_group_id ||
      destination.route_id !== expected.route_id ||
      (destination.anchor ?? null) !== (expected.anchor ?? null)
    ) {
      throw new Error(
        `Settings user navigation destination ${destination.id} must preserve its user owner and carrier route`,
      );
    }
    assertKnownSettingsRoute(
      destination.route_id,
      `Settings user navigation destination ${destination.id}`,
    );
  }
  assertDeepEqualJson(
    projection.secondary_owner_bindings,
    [
      {
        content_id: "codex_user_instructions",
        user_destination_id: "instructions_context",
        transport_route_id: "workspace",
        anchor: "system-agents",
      },
      {
        content_id: "new_conversation_additional_instructions",
        user_destination_id: "instructions_context",
        transport_route_id: "workspace",
        anchor: "additional-instructions",
      },
      {
        content_id: "app_log_directory",
        user_destination_id: "logs_diagnostics",
        transport_route_id: "environment",
        anchor: "diagnostics",
        transport_owner_policy:
          "reuse_the_existing_typed_application.setLogDirectory_action_without_presenting_logs_under_Workspace",
      },
    ],
    "Settings user navigation secondary owner bindings",
  );
  assertDeepEqualJson(
    projection.auxiliary_entries,
    [
      {
        id: "about",
        route_id: "about",
        placement: "sidebar_bottom",
        label_zh: "关于",
        label_en: "About",
      },
    ],
    "Settings user navigation auxiliary entries",
  );
  for (const [field, expected] of Object.entries({
    desktop:
      "seven_primary_groups_with_the_active_group_expanded_to_second_level_destinations",
    mobile:
      "category_list_then_second_level_destination_with_a_visible_back_control",
    mobile_horizontal_tab_strip_allowed: false,
    mobile_navigation_scroll_axis: "vertical",
    keyboard_policy:
      "all_primary_groups_second_level_destinations_back_and_about_are_reachable_in_logical_order",
  })) {
    if (projection.responsive_navigation?.[field] !== expected) {
      throw new Error(
        `Settings user navigation responsive_navigation.${field} must be ${expected}`,
      );
    }
  }
  assertDeepEqualJson(
    projection.responsive_navigation?.minimum_viewport_px,
    { width: 400, height: 600 },
    "Settings user navigation minimum viewport",
  );
  if (
    projection.global_search_policy !==
      "preserve_one_bilingual_item_level_search_across_all_carrier_routes_and_owner_anchors" ||
    projection.footer_policy?.duplicate_settings_entry !==
      "forbidden_inside_settings" ||
    projection.footer_policy?.about_placement !==
      "sidebar_bottom_auxiliary_entry"
  ) {
    throw new Error(
      "Settings user navigation must preserve global search, bottom About, and forbid a duplicate Settings footer entry",
    );
  }
  assertDeepEqualJson(
    projection.primary_group_order,
    settingsIa?.group_ids,
    "Settings user navigation vs GUI group order",
  );
  assertDeepEqualJson(
    (projection.primary_groups ?? []).map((group) => ({
      id: group.id,
      label_zh: group.label_zh,
      label_en: group.label_en,
      default_child_id: group.default_destination_id,
    })),
    (settingsIa?.top_level_entries ?? []).map((entry) => ({
      id: entry.id,
      label_zh: entry.label_zh,
      label_en: entry.label_en,
      default_child_id: entry.default_child_id,
    })),
    "Settings user navigation vs GUI primary groups",
  );
  assertDeepEqualJson(
    (projection.destinations ?? []).map((entry) => ({
      id: entry.id,
      group_id: entry.owner_group_id,
      route_id: entry.route_id,
      anchor: entry.anchor ?? null,
      label_zh: entry.label_zh,
      label_en: entry.label_en,
    })),
    (settingsIa?.child_entries ?? []).map((entry) => ({
      id: entry.id,
      group_id: entry.group_id,
      route_id: entry.route_id,
      anchor: entry.anchor ?? null,
      label_zh: entry.label_zh,
      label_en: entry.label_en,
    })),
    "Settings user navigation vs GUI destinations",
  );
}
