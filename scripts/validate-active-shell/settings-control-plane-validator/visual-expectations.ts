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



export function validateSettingsVisualQaExpectations(expectations) {
  assertDeepEqualJson(
    expectations?.visual_character,
    ["quiet", "dense", "scannable"],
    "Settings visual QA character",
  );
  assertDeepEqualJson(
    expectations?.surface_grouping,
    {
      allowed_bounded_group_kinds: ["repeated_entity", "confirmation"],
      bounded_group_nesting: "none",
      page_section_card_policy:
        "ordinary_page_sections_are_unframed_heading_plus_flat_rows_with_hairline_dividers",
      first_viewport_spatial_group_range: { min: 2, max: 4 },
      page_wide_bare_divider_layout:
        "section_scoped_hairlines_allowed_no_box_per_section",
      page_wide_list_wall: "forbidden",
    },
    "Settings visual QA surface grouping",
  );
  assertDeepEqualJson(
    expectations?.responsive_hierarchy,
    {
      desktop: "single_column_reading_lane",
      mobile: "single_column_stack",
      icon_slot_px: 20,
      page_title: "20/28/600",
      card_title: "14-16/20-24/600",
      description: "13/20/400",
      supporting: "12/18/400",
    },
    "Settings visual QA responsive hierarchy",
  );
  assertDeepEqualJson(
    expectations?.status_color_semantics,
    { normal: "muted", warning: "orange", error: "red", action: "brand" },
    "Settings visual QA status color semantics",
  );
  assertDeepEqualJson(
    expectations?.baseline_comparison,
    {
      shell_commit: "409dd0c3b693f1c7c93551654dfac8fb9420843d",
      comparison_scope: "same_route_spatial_typographic_and_status_hierarchy",
      acceptance: "preserve_or_improve",
    },
    "Settings visual QA baseline comparison",
  );
  assertDeepEqualJson(
    expectations?.footer_structure,
    {
      layout: "compact",
      controls: [
        "gateway_account_or_account_access_entry",
        "app_update_status_and_trigger",
      ],
      account_entry:
        "gateway_display_name_when_connected_else_account_access_entry_without_a_duplicate_settings_entry",
      update_entry:
        "show_confirmed_newer_app_update_as_account_row_trailing_action_and_reuse_existing_carrier_updater_without_owning_update_truth",
      theme_quick_toggle:
        "forbidden_theme_mode_lives_in_settings_preferences",
      help_navigation: "about_is_the_single_sidebar_bottom_auxiliary_entry",
      duplicate_settings_entry: "forbidden_inside_settings",
    },
    "Settings visual QA footer structure",
  );
  assertDeepEqualJson(
    expectations?.theme_gallery,
    {
      presentation: "not_exposed",
      legacy_user_data: "preserved_not_applied",
    },
    "Settings visual QA theme gallery",
  );
  assertDeepEqualJson(
    expectations?.assertion_focus,
    {
      required_structure: [
        "user_question_to_unframed_section_or_allowed_bounded_group",
        "two_to_four_first_viewport_spatial_groups",
        "single_column_reading_lane_to_mobile_stack",
        "monochrome_icon_typography_and_typed_status_hierarchy",
        "409dd0c3_same_route_non_regression",
        "flat_rows_without_section_card_frames",
        "compact_footer",
        "single_governed_visual_baseline",
      ],
      radius_and_spacing_only: "insufficient",
    },
    "Settings visual QA assertion focus",
  );
  assertDeepEqualJson(
    expectations?.sidebar_selection,
    {
      selected_item_count: 1,
      selection_source: "resolved_route_after_compatibility_redirect",
    },
    "Settings visual QA sidebar selection",
  );
  assertDeepEqualJson(
    expectations?.repeated_entity_layout,
    {
      column_header_policy: "one_shared_column_header_row_per_group",
      row_field_label_policy: "do_not_repeat_field_labels_in_each_row",
    },
    "Settings visual QA repeated entity layout",
  );
  assertDeepEqualJson(
    expectations?.primary_action_placement,
    {
      policy: "adjacent_to_owned_object_or_section",
      detached_page_toolbar_action: "forbidden",
    },
    "Settings visual QA primary action placement",
  );
  assertDeepEqualJson(
    expectations?.capture_preflight,
    {
      required_fields: [
        "requested_route",
        "resolved_route",
        "expected_page_title",
        "visible_page_title",
      ],
      route_policy:
        "resolved_route_must_match_requested_route_or_declared_compatibility_target",
      title_policy: "visible_page_title_must_match_expected_page_title",
      mismatch_policy: "fail_capture_and_do_not_record_visual_evidence",
    },
    "Settings visual QA capture preflight",
  );
  assertDeepEqualJson(
    expectations?.evidence_dimensions,
    {
      required_viewports: ["desktop", "mobile"],
      required_color_schemes: ["light"],
      coverage_policy: "desktop_and_mobile_light_require_fresh_visual_evidence",
    },
    "Settings visual QA evidence dimensions",
  );
  assertIncludesAll(
    expectations?.must_check,
    [
      "ordinary navigation shows seven primary groups with ten stable carrier routes reachable as second-level destinations",
      "About is the single sidebar-bottom auxiliary entry outside the seven primary groups",
      "mobile Settings uses a vertical category list then second-level navigation without a horizontal tab strip",
      "page sections use quiet white bounded groups with flat internal rows, nested cards are absent, radius is at most 8px, and spacing uses 12/16/24",
      "each user question is one quiet bounded section with flat internal rows; page-wide list walls and nested cards are absent",
      "each page first viewport contains two to four independent spatial groups",
      "desktop groups use a single reading lane and mobile groups stack without losing hierarchy",
      "20px monochrome visual anchors, compact typography levels, and muted/orange/red/brand status semantics remain visible",
      "same-route screenshots preserve or improve spatial and typographic hierarchy against shell baseline 409dd0c3",
      "Settings remains quiet, dense, and scannable without a sparse page-wide bare-divider layout",
      "bounded page-section cards do not become a decorative card wall",
      "the compact Settings footer keeps Gateway account or Account & Access reachable without a duplicate Settings entry, shows the existing App update trigger as a trailing account-row action only when a newer version is confirmed, and keeps About as the single bottom auxiliary entry",
      "Preferences exposes System, Light, and Dark appearance modes over one governed visual baseline",
      "the CSS theme preset gallery and custom theme editor are not exposed while legacy user theme data is preserved but not applied",
      "visual assertions verify grouping, the conditional account-row update action, and the single-baseline appearance structure; radius and spacing alone are insufficient",
      "the Settings sidebar has exactly one selected item",
      "repeated entities use shared column headers instead of per-row field labels",
      "the primary action stays adjacent to its owning object or section",
      "capture preflight verifies the resolved route and visible page title before recording a screenshot",
      "default desktop light evidence is present before visual acceptance",
    ],
    "Settings visual QA acceptance checks",
  );
}
