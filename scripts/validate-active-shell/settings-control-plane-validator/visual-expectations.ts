import { assertDeepEqualJson, assertIncludesAll } from "../assertions.ts";
import {
  assertNonEmptyString,
  assertNonEmptyStringArray,
} from "../validation-primitives.ts";

export function validateSettingsVisualQaExpectations(expectations) {
  const label = "Settings visual QA";
  assertNonEmptyStringArray(expectations?.visual_character, `${label} character`);

  const grouping = expectations.surface_grouping;
  const range = grouping?.first_viewport_spatial_group_range;
  if (
    grouping?.bounded_group_nesting !== "none" ||
    grouping?.page_wide_list_wall !== "forbidden" ||
    grouping?.page_section_card_policy !==
      "ordinary_page_sections_are_unframed_heading_plus_flat_rows_with_hairline_dividers" ||
    grouping?.page_wide_bare_divider_layout !==
      "section_scoped_hairlines_allowed_no_box_per_section" ||
    !Number.isInteger(range?.min) ||
    !Number.isInteger(range?.max) ||
    range.min < 1 ||
    range.max > 4 ||
    range.min > range.max
  ) {
    throw new Error(`${label} surface grouping must keep ordinary sections flat and limit first-viewport groups`);
  }
  assertDeepEqualJson(
    grouping.allowed_bounded_group_kinds,
    expectations.settings_component_audit?.allowed_bounded_group_kinds,
    `${label} surface grouping and component audit`,
  );
  assertDeepEqualJson(
    grouping.allowed_bounded_group_kinds,
    ["repeated_entity", "confirmation"],
    `${label} surface grouping kinds`,
  );

  const hierarchy = expectations.responsive_hierarchy;
  if (
    hierarchy?.desktop !== "single_column_reading_lane" ||
    hierarchy?.mobile !== "single_column_stack" ||
    !Number.isInteger(hierarchy?.icon_slot_px) ||
    hierarchy.icon_slot_px < 1
  ) {
    throw new Error(`${label} responsive hierarchy must keep a single column and a stable icon slot`);
  }
  for (const role of ["page_title", "card_title", "description", "supporting"]) {
    assertNonEmptyString(hierarchy[role], `${label} responsive hierarchy ${role}`);
  }
  for (const state of ["normal", "warning", "error", "action"]) {
    assertNonEmptyString(expectations.status_color_semantics?.[state], `${label} status color ${state}`);
  }

  const baseline = expectations.baseline_comparison;
  if (
    !/^[0-9a-f]{40}$/.test(baseline?.shell_commit ?? "") ||
    baseline?.comparison_scope !== "same_route_spatial_typographic_and_status_hierarchy" ||
    baseline?.acceptance !== "preserve_or_improve"
  ) {
    throw new Error(`${label} baseline comparison must bind the same route to a commit`);
  }

  const footer = expectations.footer_structure;
  if (
    footer?.layout !== "compact" ||
    footer?.duplicate_settings_entry !== "forbidden_inside_settings" ||
    footer?.help_navigation !== "about_is_the_single_sidebar_bottom_auxiliary_entry" ||
    footer?.theme_quick_toggle !== "forbidden_theme_mode_lives_in_settings_preferences"
  ) {
    throw new Error(`${label} footer structure must stay compact and put About in the sidebar alone`);
  }
  assertDeepEqualJson(
    footer.controls,
    ["gateway_account_or_account_access_entry", "app_update_status_and_trigger"],
    `${label} footer structure controls`,
  );
  assertNonEmptyString(footer.account_entry, `${label} footer structure account entry`);
  assertNonEmptyString(footer.update_entry, `${label} footer structure update entry`);

  if (
    expectations.theme_gallery?.presentation !== "not_exposed" ||
    expectations.theme_gallery?.legacy_user_data !== "preserved_not_applied"
  ) {
    throw new Error(`${label} theme gallery must preserve legacy theme data without exposing or applying it`);
  }
  const focus = expectations.assertion_focus;
  assertNonEmptyStringArray(focus?.required_structure, `${label} assertion focus`);
  if (focus.radius_and_spacing_only !== "insufficient") {
    throw new Error(`${label} assertion focus must cover structure`);
  }

  if (
    expectations.sidebar_selection?.selected_item_count !== 1 ||
    expectations.sidebar_selection?.selection_source !== "resolved_route_after_compatibility_redirect"
  ) {
    throw new Error(`${label} sidebar selection must follow the resolved route`);
  }
  if (
    expectations.repeated_entity_layout?.column_header_policy !== "one_shared_column_header_row_per_group" ||
    expectations.repeated_entity_layout?.row_field_label_policy !== "do_not_repeat_field_labels_in_each_row"
  ) {
    throw new Error(`${label} repeated entity layout must share column headers across rows`);
  }
  if (
    expectations.primary_action_placement?.policy !== "adjacent_to_owned_object_or_section" ||
    expectations.primary_action_placement?.detached_page_toolbar_action !== "forbidden"
  ) {
    throw new Error(`${label} primary action placement must stay with the object or section`);
  }

  const capture = expectations.capture_preflight;
  if (
    capture?.route_policy !== "resolved_route_must_match_requested_route_or_declared_compatibility_target" ||
    capture?.title_policy !== "visible_page_title_must_match_expected_page_title" ||
    capture?.mismatch_policy !== "fail_capture_and_do_not_record_visual_evidence"
  ) {
    throw new Error(`${label} capture preflight must reject a mismatched route or title`);
  }
  assertIncludesAll(
    capture.required_fields,
    ["requested_route", "resolved_route", "expected_page_title", "visible_page_title"],
    `${label} capture preflight fields`,
  );
  const dimensions = expectations.evidence_dimensions;
  assertDeepEqualJson(dimensions?.required_viewports, ["desktop", "mobile"], `${label} evidence dimensions viewports`);
  assertDeepEqualJson(dimensions?.required_color_schemes, ["light"], `${label} evidence dimensions color schemes`);
  if (dimensions.coverage_policy !== "desktop_and_mobile_light_require_fresh_visual_evidence") {
    throw new Error(`${label} evidence dimensions require fresh visual evidence`);
  }

  assertNonEmptyStringArray(expectations.must_check, `${label} acceptance checks`);
}
