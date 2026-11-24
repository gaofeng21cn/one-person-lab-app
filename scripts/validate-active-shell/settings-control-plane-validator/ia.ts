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
  assertKnownSettingsRoute,
} from "./shared.ts";
import {
  validateSettingsVisualQaExpectations,
} from "./visual-expectations.ts";

export function validateSettingsIa(settingsIa) {
  if (settingsIa?.schema !== "settings_ia.v2") {
    throw new Error(
      "Settings control plane must expose settings_ia.v2 behavior",
    );
  }
  if (settingsIa.authority !== "one-person-lab-app") {
    throw new Error(
      "Settings control plane authority must stay in one-person-lab-app",
    );
  }
  if (
    settingsIa.source_ref !==
    "contracts/app-gui-product-contract.json#settings_navigation"
  ) {
    throw new Error(
      "Settings control plane must keep the App GUI settings navigation as its source ref",
    );
  }
  if (settingsIa.matrix_ref !== "contracts/app-page-state-matrix.json#pages") {
    throw new Error(
      "Settings control plane must keep the App page-state matrix as its matrix ref",
    );
  }
  assertDeepEqualJson(
    settingsIa.ordinary_route_ids,
    appOwnedSettingsTabs,
    "Settings control plane ordinary route ids",
  );
  assertDeepEqualJson(
    settingsIa.secondary_or_deep_link_route_ids,
    appOwnedSecondarySettingsPages,
    "Settings control plane secondary/deep-link route ids",
  );
  assertDeepEqualJson(
    settingsIa.compatibility_route_ids,
    Object.keys(appOwnedSettingsCompatibilityRedirects),
    "Settings control plane compatibility route ids",
  );
  if (
    settingsIa.experience_contract_ref !==
    "contracts/app-settings-control-plane.json#experience_contract"
  ) {
    throw new Error(
      "Settings IA must reference the Settings experience contract",
    );
  }
  assertDeepEqualJson(
    settingsIa.group_ids,
    appOwnedSettingsIaGroupIds,
    "Settings control plane IA group ids",
  );
  if (
    settingsIa.route_identity_policy !==
    "keep_current_shell_route_ids_distinct_from_user_facing_ia_groups"
  ) {
    throw new Error(
      "Settings control plane must keep shell route ids distinct from user-facing IA groups",
    );
  }
  if (
    settingsIa.route_promotion_policy !==
    "secondary_or_deep_link_routes_must_not_be_promoted_to_ordinary_routes_without_contract_matrix_validator_and_test_updates"
  ) {
    throw new Error(
      "Settings control plane must gate route promotion through contract, matrix, validator, and tests",
    );
  }
  validateSettingsTopLevelEntries(
    settingsIa.top_level_entries,
    settingsIa.top_level_navigation_policy,
  );
  assertDeepEqualJson(
    (settingsIa.child_entries ?? []).map((entry) => entry.id),
    appOwnedSettingsNavigationDestinationIds,
    "Settings IA second-level destination ids",
  );
  for (const entry of settingsIa.child_entries ?? []) {
    const expected = appOwnedSettingsNavigationDestinationOwners[entry.id];
    if (
      !expected ||
      entry.group_id !== expected.owner_group_id ||
      entry.route_id !== expected.route_id ||
      (entry.anchor ?? null) !== (expected.anchor ?? null)
    ) {
      throw new Error(
        `Settings IA destination ${entry.id} must retain its user owner and carrier route`,
      );
    }
  }
  assertDeepEqualJson(
    settingsIa.auxiliary_entries,
    [
      {
        id: "about",
        route_id: "about",
        route_scope: "secondary_or_deep_link",
        placement: "sidebar_bottom",
        label_zh: "关于",
        label_en: "About",
      },
    ],
    "Settings IA auxiliary entries",
  );
  assertDeepEqualJson(
    (settingsIa.user_task_entries ?? []).map((entry) => entry.id),
    appOwnedSettingsTaskEntryIds,
    "Settings control plane user task entries",
  );
  for (const entry of settingsIa.user_task_entries ?? []) {
    if (!appOwnedSettingsIaGroupIds.includes(entry.group_id)) {
      throw new Error(
        `Settings control plane task entry ${entry.id} has unknown group ${entry.group_id}`,
      );
    }
    assertIncludesAll(
      Object.keys(entry),
      appOwnedSettingsTaskEntryMetadataFields,
      `Settings control plane task entry ${entry.id} metadata fields`,
    );
    for (const field of appOwnedSettingsTaskEntryMetadataFields) {
      if (typeof entry[field] !== "string" || entry[field].trim() === "") {
        throw new Error(
          `Settings control plane task entry ${entry.id} must declare ${field}`,
        );
      }
    }
    assertKnownSettingsRoute(
      entry.route_id,
      `Settings control plane task entry ${entry.id}`,
    );
    for (const routeId of entry.secondary_route_ids ?? []) {
      assertKnownSettingsRoute(
        routeId,
        `Settings control plane task entry ${entry.id} secondary route`,
      );
    }
  }
  validateSettingsProtocols(settingsIa.protocols);
}

export function validateSettingsTopLevelEntries(entries, policy) {
  if (
    policy?.entry_model !==
      "seven_user_visible_primary_groups_expand_or_drill_into_second_level_destinations" ||
    policy?.workspace_visibility !==
      "workspace_is_user_visible_top_level_navigation_entry" ||
    policy?.resources_visibility !==
      "resources_is_the_sole_destination_under_connections_and_deployment" ||
    policy?.advanced_visibility !==
      "advanced_is_retired_and_redirects_to_maintenance_diagnostics" ||
    policy?.about_visibility !==
      "about_is_a_bottom_auxiliary_entry_outside_the_seven_primary_groups" ||
    policy?.compatibility_route_policy !==
      "update_theme_local_services_and_personalization_redirect_to_owner_route_and_anchor" ||
    policy?.shell_route_compatibility !==
      "carrier_route_ids_remain_stable_while_product_page_ids_are_canonical"
  ) {
    throw new Error(
      "Settings IA must declare seven primary groups, bottom auxiliary About, and compatibility carrier routes",
    );
  }
  assertDeepEqualJson(
    (entries ?? []).map((entry) => entry.id),
    appOwnedSettingsIaGroupIds,
    "Settings IA top-level user-visible entries",
  );
  const workspace = (entries ?? []).find((entry) => entry.id === "workspace");
  if (
    workspace?.route_id !== "workspace" ||
    workspace?.route_scope !== "ordinary" ||
    workspace?.visibility !== "top_level_navigation"
  ) {
    throw new Error(
      "Settings IA Workspace must be ordinary top-level navigation",
    );
  }
  assertDeepEqualJson(
    Object.fromEntries(
      (entries ?? []).map((entry) => [
        entry.id,
        {
          label_zh: entry.label_zh,
          label_en: entry.label_en,
        },
      ]),
    ),
    appOwnedSettingsNavigationGroupLabels,
    "Settings IA top-level product labels",
  );
  for (const entry of entries ?? []) {
    assertKnownSettingsRoute(
      entry.route_id,
      `Settings IA top-level entry ${entry.id}`,
    );
    assertIncludesAll(
      Object.keys(entry),
      appOwnedSettingsTaskEntryMetadataFields,
      `Settings IA top-level entry ${entry.id} metadata fields`,
    );
  }
}

export function validateSettingsProtocols(protocols) {
  assertDeepEqualJson(
    protocols?.issue_queue?.statuses,
    appOwnedSettingsIssueStatuses,
    "Settings control plane issue statuses",
  );
  if (
    protocols?.issue_queue?.owner_policy !==
    "App renders issue refs and action routes without writing runtime/domain truth"
  ) {
    throw new Error(
      "Settings control plane issue queue must be render-only for runtime/domain truth",
    );
  }
  if (
    protocols?.action_catalog?.source !== "app_state.actions" ||
    protocols?.action_catalog?.action_route !== appActionRoute ||
    protocols?.action_catalog?.mutation_policy !==
      "all_mutating_settings_actions_go_through_App_action_routes"
  ) {
    throw new Error(
      "Settings control plane actions must route through app_state.actions and the App action route",
    );
  }
  assertDeepEqualJson(
    protocols.settings_search,
    appOwnedSettingsSearchProtocol,
    "Settings control plane search protocol",
  );
  assertDeepEqualJson(
    protocols.card_protocol?.required_fields,
    appOwnedSettingsCardFields,
    "Settings control plane card fields",
  );
  if (
    protocols.card_protocol?.first_screen_policy !==
    "summary_first_no_raw_ids_or_receipts_until_disclosed"
  ) {
    throw new Error(
      "Settings control plane cards must stay summary-first before raw refs",
    );
  }
  assertDeepEqualJson(
    protocols.confirmation_drawer?.required_fields,
    appOwnedSettingsConfirmationFields,
    "Settings control plane confirmation fields",
  );
  if (
    protocols.confirmation_drawer?.copy_policy !==
    "must_explain_what_changes_what_does_not_change_and_the_recovery_reference_before_mutation"
  ) {
    throw new Error(
      "Settings control plane confirmation must explain change boundaries and recovery references",
    );
  }
  assertDeepEqualJson(
    protocols.post_update_notice?.required_fields,
    appOwnedSettingsPostUpdateNoticeFields,
    "Settings control plane post-update notice fields",
  );
  if (
    protocols.post_update_notice?.visibility_policy !==
      "ordinary_layer_after_mutation_or_background_action_until_next_refresh" ||
    protocols.post_update_notice?.receipt_policy !==
      "show_receipt_ref_without_claiming_domain_or_release_readiness"
  ) {
    throw new Error(
      "Settings control plane post-update notices must not claim domain or release readiness",
    );
  }
  const makeUsableAction = protocols.make_usable_action;
  if (
    makeUsableAction?.placement !==
      "settings_environment.updates_repairs.primary_action" ||
    makeUsableAction?.orchestration_policy !==
      "shell_orchestrates_existing_app_and_managed_update_actions_only" ||
    makeUsableAction?.post_action_notice !==
      "show restart or reload guidance from managed update status/result without claiming domain, release, or production readiness"
  ) {
    throw new Error(
      "Settings control plane make-usable action must orchestrate existing App/updater actions only",
    );
  }
  assertDeepEqualJson(
    makeUsableAction.allowed_steps,
    appOwnedSettingsMakeUsableAllowedSteps,
    "Settings control plane make-usable allowed steps",
  );
  assertDeepEqualJson(
    makeUsableAction.must_not,
    appOwnedSettingsMakeUsableForbiddenSteps,
    "Settings control plane make-usable forbidden steps",
  );
  if (
    protocols.diagnostics?.default_visibility !== "collapsed_advanced_only" ||
    protocols.diagnostics?.raw_ref_policy !==
      "raw_paths_ids_receipts_json_and_component_ids_require_disclosure_or_advanced_route"
  ) {
    throw new Error(
      "Settings control plane diagnostics must be collapsed and advanced/disclosure-only",
    );
  }
  if (
    protocols.deep_link_policy?.unknown_route_policy !==
      "redirect_to_overview_default_route" ||
    protocols.deep_link_policy?.legacy_route_policy !==
      "redirect_using_settings_navigation.legacy_route_redirects" ||
    protocols.deep_link_policy?.secondary_route_policy !==
      "open_about_without_ordinary_tab_promotion_and_redirect_advanced_to_maintenance_diagnostics" ||
    protocols.deep_link_policy?.compatibility_route_policy !==
      "resolve_settings_navigation.compatibility_redirects_then_navigate_route_id_and_anchor"
  ) {
    throw new Error(
      "Settings control plane deep links must separate legacy, secondary, and compatibility routes",
    );
  }
  assertDeepEqualJson(
    protocols.visual_qa_expectations?.required_targets,
    appOwnedSettingsVisualQaTargets,
    "Settings control plane visual QA targets",
  );
  validateSettingsVisualQaExpectations(protocols.visual_qa_expectations);
}
