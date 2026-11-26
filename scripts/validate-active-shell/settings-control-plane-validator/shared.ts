import {
  appOwnedSecondarySettingsPages,
  appOwnedSettingsCompatibilityRedirects,
  appOwnedSettingsTabs,
} from "../app-contract-constants.ts";

export function assertKnownSettingsRoute(routeId, label) {
  const knownRouteIds = new Set([
    ...appOwnedSettingsTabs,
    ...appOwnedSecondarySettingsPages,
    ...Object.keys(appOwnedSettingsCompatibilityRedirects),
  ]);
  if (!knownRouteIds.has(routeId)) {
    throw new Error(`${label} references unknown Settings route ${routeId}`);
  }
}

export function pageById(matrix, id) {
  const page = (matrix.pages ?? []).find((entry) => entry.id === id);
  if (!page) {
    throw new Error(`Page-state matrix is missing ${id}`);
  }
  return page;
}

export function settingsRouteResolution(
  input,
  targetId,
  route,
  routeScope,
  anchor = null,
  anchorQueryParam = null,
) {
  return {
    input,
    id: input,
    target_id: targetId,
    path: route?.path ?? "/settings/about",
    route_scope: routeScope,
    slot_id: route?.slot_id ?? "about",
    component_key: route?.component_key ?? null,
    anchor,
    anchor_query_param: anchorQueryParam,
  };
}
