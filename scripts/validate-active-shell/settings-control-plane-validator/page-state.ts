import { assertDeepEqualJson, assertFieldsMatch, assertIncludesAll } from "../assertions.ts";
import {
  appOwnedSecondarySettingsPages,
  appOwnedSettingsCompatibilityRedirects,
  appOwnedSettingsAboutUpdaterStatePolicy,
  appOwnedSettingsTabs,
  appOwnedSettingsTechnicalDetailsDefault,
} from "../app-contract-constants.ts";

import {
  expectedIaGroupByMatrixPageId,
  expectedLegacyRedirects,
  matrixRouteScopes,
  settingsControlPlaneContractRef,
  settingsIaRef,
} from "./constants.ts";
import {
  buildHydratedSettingsRegistry,
  remapSettingsExtensionAnchor,
  resolveSettingsControlPlaneRoute,
} from "./routes.ts";
import { pageById } from "./shared.ts";

export function validateSettingsPageStateMatrix(
  pageStateMatrix,
  experienceContract = null,
  compatibilityRedirects = appOwnedSettingsCompatibilityRedirects,
) {
  assertDeepEqualJson(
    pageStateMatrix?.settings_compatibility_redirects,
    compatibilityRedirects,
    "Page-state Settings compatibility redirects",
  );
  for (const [pageId, expected] of Object.entries(matrixRouteScopes)) {
    assertFieldsMatch(pageById(pageStateMatrix, pageId), {
      settings_ia_ref: settingsIaRef,
      route_id: expected.route_id,
      route_scope: expected.route_scope,
      ia_group: expectedIaGroupByMatrixPageId[pageId],
    }, pageId);
  }
  for (const [matrixId, redirectKey, label] of [
    ["update", "update", "Update"],
    ["settings_local_services", "local-services", "Local Services"],
    ["settings_personalization", "personalization", "Personalization"],
  ]) {
    assertDeepEqualJson(
      pageById(pageStateMatrix, matrixId).compatibility_redirect,
      compatibilityRedirects[redirectKey],
      `${label} compatibility redirect page state`,
    );
  }
  if (!experienceContract) return;
  for (const [productPageId, contract] of Object.entries(
    experienceContract.page_contracts ?? {},
  )) {
    const page = pageById(pageStateMatrix, contract.matrix_page_id);
    assertFieldsMatch(
      page,
      {
        product_page_id: productPageId,
        experience_contract_ref: `contracts/app-settings-control-plane.json#experience_contract.page_contracts.${productPageId}`,
        primary_action_id: contract.primary_action.id,
        technical_details_default: appOwnedSettingsTechnicalDetailsDefault[productPageId],
        exception_emphasis: "attention_only",
      },
      `Page-state ${contract.matrix_page_id} must mirror ${productPageId} experience semantics:`,
    );
    assertDeepEqualJson(
      page.required_dom,
      contract.required_dom,
      `Page-state ${productPageId} required DOM`,
    );
    assertDeepEqualJson(
      page.required_anchors,
      contract.required_anchors,
      `Page-state ${productPageId} required anchors`,
    );
    assertDeepEqualJson(
      page.search_entry_ids,
      contract.search_entry_ids,
      `Page-state ${productPageId} search entries`,
    );
    if (productPageId === "capabilities") {
      assertDeepEqualJson(
        page.tab_contract,
        contract.tab_contract,
        "Page-state Capabilities source-group tab contract",
      );
    }
    if (productPageId === "resources") {
      assertDeepEqualJson(
        page.action_behavior,
        contract.action_behavior,
        "Page-state Resources action behavior",
      );
    }
    if (productPageId === "storage") {
      assertDeepEqualJson(
        page.storage_carrier_behavior,
        contract.surface_rules.storage_carrier_behavior,
        "Page-state Storage carrier behavior",
      );
    }
  }
  assertDeepEqualJson(
    pageById(pageStateMatrix, "about").updater_state_policy,
    appOwnedSettingsAboutUpdaterStatePolicy,
    "Page-state About updater state policy",
  );
}

export function validateProductProfileSettings(productProfile, controlPlane) {
  assertDeepEqualJson(
    productProfile.settings?.visible_tabs,
    appOwnedSettingsTabs,
    "Product profile settings visible tabs",
  );
  assertDeepEqualJson(
    productProfile.settings?.legacy_route_redirects,
    Object.fromEntries(
      Object.entries(controlPlane.legacy_route_redirects)
        .filter(([id]) => id !== "about")
        .map(([id, target]) => [id, String(target).split("?")[0]]),
    ),
    "Product profile settings legacy redirects",
  );
}

export function validateHydratedSettingsRegistry(controlPlane) {
  const registry = buildHydratedSettingsRegistry(controlPlane);
  assertDeepEqualJson(
    registry.ordinary_routes.map((route) => route.id),
    appOwnedSettingsTabs,
    "Hydrated Settings registry ordinary route ids",
  );
  assertDeepEqualJson(
    registry.ordinary_routes.map((route) => route.component_key),
    [
      "OverviewSettings",
      "GatewaySettingsContent",
      "AccessSettingsContent",
      "WorkspaceSettings",
      "AgentPackagesSettingsContent",
      "CapabilitiesSettingsContent",
      "ResourcesSettingsContent",
      "RuntimeSettings",
      "StorageSettings",
      "AppearanceModalContent",
    ],
    "Hydrated Settings registry ordinary component keys",
  );
  assertDeepEqualJson(
    registry.secondary_pages.map((route) => route.route_scope),
    appOwnedSecondarySettingsPages.map(() => "secondary_or_deep_link"),
    "Hydrated Settings registry secondary route scopes",
  );
  for (const routeId of [
    ...appOwnedSettingsTabs,
    ...appOwnedSecondarySettingsPages,
  ]) {
    const resolution = resolveSettingsControlPlaneRoute(controlPlane, routeId);
    if (
      !["ordinary", "secondary_or_deep_link"].includes(resolution.route_scope)
    ) {
      throw new Error(
        `Settings route ${routeId} must resolve as ordinary or secondary/deep-link`,
      );
    }
  }
  for (const [routeId, redirect] of Object.entries(
    appOwnedSettingsCompatibilityRedirects,
  )) {
    const resolution = resolveSettingsControlPlaneRoute(controlPlane, routeId);
    if (
      resolution.route_scope !== "compatibility_redirect" ||
      resolution.target_id !== redirect.target_route_id ||
      resolution.anchor !== redirect.anchor ||
      resolution.anchor_query_param !== "section"
    ) {
      throw new Error(
        `Settings compatibility route ${routeId} must resolve to its owner route and anchor`,
      );
    }
  }
  for (const legacyRoute of Object.keys(expectedLegacyRedirects)) {
    const redirectTarget = String(
      controlPlane.legacy_route_redirects[legacyRoute],
    ).split(/[?#]/)[0];
    const knownTargets = new Set([
      ...appOwnedSettingsTabs,
      ...appOwnedSecondarySettingsPages,
    ]);
    if (!knownTargets.has(redirectTarget)) {
      throw new Error(
        `Settings legacy route ${legacyRoute} must target a known Settings route`,
      );
    }
    if (
      !appOwnedSecondarySettingsPages.includes(legacyRoute) &&
      resolveSettingsControlPlaneRoute(controlPlane, legacyRoute)
        .route_scope !== "legacy_redirect"
    ) {
      throw new Error(
        `Settings legacy route ${legacyRoute} must resolve through the legacy redirect table`,
      );
    }
    if (
      !knownTargets.has(remapSettingsExtensionAnchor(controlPlane, legacyRoute))
    ) {
      throw new Error(
        `Settings extension anchor ${legacyRoute} must remap to a known Settings route`,
      );
    }
  }
  assertFieldsMatch(
    resolveSettingsControlPlaneRoute(controlPlane, "assistants"),
    { target_id: "capabilities", path: "/settings/capabilities?section=third-party", anchor: "third-party" },
    "Settings legacy assistants route",
  );
  assertFieldsMatch(
    resolveSettingsControlPlaneRoute(controlPlane, "unknown-settings-route"),
    { route_scope: "unknown_redirect", target_id: "general", path: "/settings/general" },
    "Unknown Settings routes fallback",
  );
}

export function validateSettingsShellAdapterSlotContract(controlPlane) {
  const slot = controlPlane.shell_adapter_slot;
  assertFieldsMatch(
    slot,
    {
      host_component: "SettingsHost",
      adapter_slot: "SettingsShellAdapterSlot",
      registry_source: settingsControlPlaneContractRef,
    },
    "Settings control plane shell adapter slot",
  );
  assertDeepEqualJson(slot?.shell_may_own, ["container layout", "tab switching", "extension tab mount/keep-alive", "route sync"], "SettingsShellAdapterSlot shell_may_own");
  assertDeepEqualJson(slot?.app_owns, ["tab order", "user semantics", "OPL page slots", "state/action sources", "upstream intake classification"], "SettingsShellAdapterSlot app_owns");
}

export function validateSettingsModelReasoningPolicy(
  controlPlane,
  guiContract,
  productProfile,
) {
  const policy = controlPlane.model_reasoning_policy_source;
  if (policy?.owner !== "one-person-lab-app") {
    throw new Error("Settings model/reasoning policy must be App-owned");
  }
  assertIncludesAll(
    policy?.source_refs,
    [
      "contracts/app-product-profile.json#codex",
      "contracts/app-product-profile.json#codex.auto_model_policy",
      "contracts/app-product-profile.json#gui.home.codex_model_display_options",
      "contracts/app-gui-product-contract.json#executor_policy",
    ],
    "Settings model/reasoning policy source refs",
  );
  assertFieldsMatch(
    policy,
    {
      default_model_ref: "contracts/app-product-profile.json#codex.default_model",
      default_reasoning_effort_ref: "contracts/app-product-profile.json#codex.default_reasoning_effort",
      auto_model_policy_ref: "contracts/app-product-profile.json#codex.auto_model_policy",
      settings_surface: "settings_access.model_access",
      adapter_policy: "GUI shells render App-derived model and reasoning policy only",
    },
    "Settings model/reasoning policy",
  );
  assertIncludesAll(
    policy.shell_must_not_own,
    [
      "default model",
      "frontier model preference order",
      "Auto model resolution and persistence policy",
      "reasoning effort options",
      "model access readiness truth",
      "provider selector as ordinary UI",
    ],
    "Settings model/reasoning shell_must_not_own",
  );
  if (
    guiContract?.executor_policy?.default_model !==
      productProfile?.codex?.default_model ||
    guiContract?.executor_policy?.default_reasoning_effort !==
      productProfile?.codex?.default_reasoning_effort
  ) {
    throw new Error(
      "Settings model/reasoning policy must match App product profile and GUI executor policy defaults",
    );
  }
  if (
    guiContract?.executor_policy?.model_display_options_policy?.source !==
    "contracts/app-product-profile.json#gui.home.codex_model_display_options"
  ) {
    throw new Error(
      "Settings model/reasoning display options must be derived from the App product profile",
    );
  }
  if (
    !String(policy.release_evidence_policy ?? "").includes(
      "does not prove release cohort",
    )
  ) {
    throw new Error(
      "Settings model/reasoning policy must keep release/live evidence separate",
    );
  }
}

export function validateSettingsSurfaceModel(surfaceModel) {
  const surfaceTypes = ["configuration", "status", "action", "diagnostic"];
  assertDeepEqualJson(surfaceModel?.surface_types, surfaceTypes, "Settings surface types");
  assertFieldsMatch(
    surfaceModel,
    {
      classification_policy: "every_page_surface_has_exactly_one_type_and_one_page_owner",
      advanced_page_type: "retired_redirect_to_maintenance_diagnostics",
      desktop_layout_policy: "use_columns_only_for_independent_groups_with_comparable_density",
      default_layout_policy: "full_width_vertical_groups",
    },
    "Settings strict four-surface model:",
  );
  assertDeepEqualJson(
    Object.keys(surfaceModel ?? {}),
    ["surface_types", "classification_policy", ...surfaceTypes, "advanced_page_type", "desktop_layout_policy", "default_layout_policy"],
    "Settings strict four-surface model keys",
  );
  for (const surfaceType of surfaceTypes) {
    for (const field of ["presentation", "interaction", "visual_rule", "ownership_rule"]) {
      if (typeof surfaceModel?.[surfaceType]?.[field] !== "string" || surfaceModel[surfaceType][field].trim() === "") {
        throw new Error(`Settings ${surfaceType} surface must declare ${field}`);
      }
    }
  }
  assertDeepEqualJson(
    surfaceModel?.configuration?.card_eligibility_any_of,
    ["two_or_more_related_controls", "one_consequential_persistent_setting", "exception_or_recovery_workflow", "independent_user_decision_boundary"],
    "Settings configuration-group card eligibility",
  );
  assertFieldsMatch(
    surfaceModel?.configuration,
    {
      interaction: "persistent_value_controls_only",
      pure_state_card_allowed: false,
      one_time_action_allowed: false,
    },
    "Settings configuration must be persistent:",
  );
  assertFieldsMatch(
    surfaceModel?.status,
    {
      standalone_card_allowed: false,
      presentation: "muted_row_inside_owning_page_section_or_configuration_group",
    },
    "Settings pure status must remain an owning-page row:",
  );
  assertFieldsMatch(
    surfaceModel?.action,
    {
      interaction: "explicit_one_time_command_with_confirmation_progress_and_receipt_as_required",
      persistent_value_allowed: false,
      maintenance_and_storage_are_settings: false,
    },
    "Settings one-time actions:",
  );
  assertFieldsMatch(
    surfaceModel?.diagnostic,
    {
      ordinary_page_inline_allowed: false,
      entry_presentation: "explicit_diagnostics_action",
      container: "modal_or_drawer",
      summary_first: true,
      raw_details_secondary: true,
    },
    "Settings diagnostics must open explicitly in a modal or drawer:",
  );
  assertIncludesAll(
    surfaceModel?.diagnostic?.raw_fields,
    ["paths", "refs", "action_ids", "receipts", "runtime_enums", "payloads", "logs"],
    "Settings diagnostic raw fields",
  );
}

export function validatePageSurfaceInventory(pageId, inventory) {
  const surfaceTypes = ["configuration", "status", "action", "diagnostic"];
  assertDeepEqualJson(
    Object.keys(inventory ?? {}),
    surfaceTypes,
    `Settings experience ${pageId} surface inventory types`,
  );

  const seenIds = new Set();
  for (const surfaceType of surfaceTypes) {
    const entries = inventory?.[surfaceType];
    if (!Array.isArray(entries)) {
      throw new Error(
        `Settings experience ${pageId} ${surfaceType} inventory must be an array`,
      );
    }
    for (const entry of entries) {
      if (
        Object.keys(entry ?? {}).length !== 2 ||
        typeof entry?.id !== "string" ||
        entry.id.trim() === "" ||
        entry.owner !== pageId
      ) {
        throw new Error(
          `Settings experience ${pageId} ${surfaceType} inventory must declare id and page ownership`,
        );
      }
      if (seenIds.has(entry.id)) {
        throw new Error(
          `Settings experience ${pageId} surface ${entry.id} cannot mix surface types`,
        );
      }
      seenIds.add(entry.id);
    }
  }

  if (pageId === "maintenance") {
    if (
      inventory.configuration.length !== 2 ||
      !["update_channel", "log_directory"].every((id) =>
        inventory.configuration.some((entry) => entry.id === id),
      ) ||
      inventory.action.length === 0
    ) {
      throw new Error(
        "Settings Maintenance may persist only the update channel and App log directory; maintenance operations remain actions",
      );
    }
  }
  if (pageId === "storage") {
    if (
      inventory.configuration.length !== 0 ||
      inventory.action.length === 0
    ) {
      throw new Error(
        "Settings Storage must not own configuration; usage, cleanup, archive, and restore remain status or actions",
      );
    }
  }
  if (pageId === "workspace") {
    assertIncludesAll(
      inventory.configuration.map((entry) => entry.id),
      [
        "workspace_selection",
        "codex_user_instructions",
        "new_conversation_additional_instructions",
      ],
      "Settings Workspace and Personalization configuration ownership",
    );
  }
  if (pageId === "preferences") {
    const preferenceConfigurationIds = inventory.configuration.map(
      (entry) => entry.id,
    );
    if (
      preferenceConfigurationIds.includes("log_directory") ||
      preferenceConfigurationIds.includes("codex_user_instructions") ||
      preferenceConfigurationIds.includes("new_conversation_additional_instructions")
    ) {
      throw new Error(
        "Settings Preferences must not duplicate Workspace paths or personalization",
      );
    }
  }
}
