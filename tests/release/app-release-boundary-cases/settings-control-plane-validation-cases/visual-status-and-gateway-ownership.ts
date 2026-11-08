import {
  appOwnedOfficialProfileRestoreAction,
  appOwnedStorageCarrierBehavior,
  appOwnedWebuiDataVolumeHostActionAbiRef,
  appOwnedWebuiDataVolumeHostActionCapabilityId,
  appRoot,
  assert,
  contracts,
  fs,
  path,
  readJson,
  test,
  validate,
  validateGui,
  validatePageStateMatrix,
} from "./fixtures.ts";

test("Settings visual QA enforces Codex quiet grouping, compact footer, and monochrome utility hierarchy", () => {
  const values = contracts();
  const visualSystem = values.controlPlane.experience_contract.visual_system;
  const visualQa =
    values.guiContract.settings_navigation.settings_ia.protocols
      .visual_qa_expectations;

  assert.doesNotThrow(() => validate(values));
  assert.deepStrictEqual(visualSystem, {
    style: "codex_quiet_control_center_with_opl_information_architecture",
    style_exclusion: "multi_hue_card_dashboard",
    baseline_shell_commit: "409dd0c3b693f1c7c93551654dfac8fb9420843d",
    baseline_comparison_policy:
      "fresh_same_route_screenshots_must_preserve_or_improve_information_hierarchy",
    card_policy: "unframed_sections_with_bounded_groups_only_for_repeated_entities_or_confirmation",
    first_viewport_spatial_group_range: { min: 2, max: 4 },
    nested_cards_allowed: false,
    page_wide_list_wall_allowed: false,
    page_sections_as_floating_cards_allowed: false,
    desktop_group_layout: "single_column_reading_lane",
    mobile_group_layout: "single_column_stack",
    icon_slot_px: 20,
    typography: {
      page_title: "20/28/600",
      card_title: "14-16/20-24/600",
      description: "13/20/400",
      supporting: "12/18/400",
    },
    status_color_semantics: {
      normal: "muted",
      warning: "orange",
      error: "red",
      action: "brand",
    },
    object_accent_policy:
      "use monochrome utility navigation icons and reserve color for typed warning error success and brand actions",
    footer_layout: "compact",
    footer_controls: [
      "gateway_account_or_account_access_entry",
      "app_update_status_and_trigger",
    ],
    footer_account_entry_policy:
      "show_gateway_display_name_when_connected_else_account_access_without_a_duplicate_settings_entry",
    footer_update_entry_policy:
      "show_confirmed_newer_app_update_as_account_row_trailing_action_and_reuse_existing_carrier_updater_without_owning_update_truth",
    footer_theme_quick_toggle_allowed: false,
    footer_secondary_navigation_allowed: true,
    footer_auxiliary_navigation: "about_only_sidebar_bottom",
    footer_duplicate_settings_entry_allowed: false,
    appearance_mode_values: ["system", "light", "dark"],
    appearance_mode_presentation: "three_visual_preview_cards",
    appearance_mode_preserves_theme_preset: false,
    theme_gallery_presentation: "not_exposed",
    theme_swatch_list_allowed: false,
    max_border_radius_px: 8,
    spacing_scale_px: [12, 16, 24],
    heading_density: "compact",
    primary_action_per_page_max: 1,
    normal_state_emphasis: "muted",
    exception_state_emphasis: "accent_only_when_attention_required",
    technical_details_default: "collapsed",
    letter_spacing_px: 0,
  });
  assert.deepStrictEqual(
    values.productProfile.settings.control_plane.experience_contract
      .visual_system,
    visualSystem,
  );
  assert.deepStrictEqual(visualQa.visual_character, [
    "quiet",
    "dense",
    "scannable",
  ]);
  assert.deepStrictEqual(visualQa.surface_grouping, {
    allowed_bounded_group_kinds: ["repeated_entity", "confirmation"],
    bounded_group_nesting: "none",
    page_section_card_policy:
      "ordinary_page_sections_are_unframed_heading_plus_flat_rows_with_hairline_dividers",
    first_viewport_spatial_group_range: { min: 2, max: 4 },
    page_wide_bare_divider_layout:
      "section_scoped_hairlines_allowed_no_box_per_section",
    page_wide_list_wall: "forbidden",
  });
  assert.deepStrictEqual(visualQa.footer_structure, {
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
  });
  assert.deepStrictEqual(visualQa.theme_gallery, {
    presentation: "not_exposed",
    legacy_user_data: "preserved_not_applied",
  });
  assert.deepStrictEqual(visualQa.assertion_focus, {
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
  });
  assert.deepStrictEqual(visualQa.evidence_dimensions.required_viewports, [
    "desktop",
    "mobile",
  ]);
  assert.deepStrictEqual(visualQa.evidence_dimensions.required_color_schemes, [
    "light",
  ]);

  const sparseLayout = contracts();
  sparseLayout.guiContract.settings_navigation.settings_ia.protocols.visual_qa_expectations.surface_grouping.page_wide_bare_divider_layout =
    "allowed";
  assert.throws(() => validate(sparseLayout), /surface grouping/);

  const missingPageSectionCards = contracts();
  missingPageSectionCards.guiContract.settings_navigation.settings_ia.protocols.visual_qa_expectations.surface_grouping.page_section_card_policy =
    "forbidden";
  assert.throws(() => validate(missingPageSectionCards), /surface grouping/);

  const listWall = contracts();
  listWall.guiContract.settings_navigation.settings_ia.protocols.visual_qa_expectations.surface_grouping.page_wide_list_wall =
    "allowed";
  assert.throws(() => validate(listWall), /surface grouping/);

  const secondaryFooterNavigation = contracts();
  secondaryFooterNavigation.guiContract.settings_navigation.settings_ia.protocols.visual_qa_expectations.footer_structure.help_navigation =
    "allowed";
  assert.throws(() => validate(secondaryFooterNavigation), /footer structure/);

  const swatchList = contracts();
  swatchList.guiContract.settings_navigation.settings_ia.protocols.visual_qa_expectations.theme_gallery.presentation =
    "flat_swatch_list";
  assert.throws(() => validate(swatchList), /theme gallery/);

  const metricsOnly = contracts();
  metricsOnly.guiContract.settings_navigation.settings_ia.protocols.visual_qa_expectations.assertion_focus.radius_and_spacing_only =
    "sufficient";
  assert.throws(() => validate(metricsOnly), /assertion focus/);

  const multiHueDashboard = contracts();
  multiHueDashboard.controlPlane.experience_contract.visual_system.style_exclusion =
    "multi_hue_icons_allowed";
  assert.throws(() => validate(multiHueDashboard), /visual system/);

  const staleProfileVisualSystem = contracts();
  staleProfileVisualSystem.productProfile.settings.control_plane.experience_contract.visual_system.theme_swatch_list_allowed = true;
  assert.throws(() => validate(staleProfileVisualSystem), /visual system/);

  const multipleSelectedItems = contracts();
  multipleSelectedItems.guiContract.settings_navigation.settings_ia.protocols.visual_qa_expectations.sidebar_selection.selected_item_count = 2;
  assert.throws(() => validate(multipleSelectedItems), /sidebar selection/);

  const repeatedLabels = contracts();
  repeatedLabels.guiContract.settings_navigation.settings_ia.protocols.visual_qa_expectations.repeated_entity_layout.row_field_label_policy =
    "repeat_labels_per_row";
  assert.throws(() => validate(repeatedLabels), /repeated entity layout/);

  const uncheckedCapture = contracts();
  uncheckedCapture.guiContract.settings_navigation.settings_ia.protocols.visual_qa_expectations.capture_preflight.mismatch_policy =
    "capture_anyway";
  assert.throws(() => validate(uncheckedCapture), /capture preflight/);

  const staleDarkMatrix = contracts();
  staleDarkMatrix.guiContract.settings_navigation.settings_ia.protocols.visual_qa_expectations.evidence_dimensions.required_color_schemes =
    ["light", "dark"];
  assert.throws(() => validate(staleDarkMatrix), /evidence dimensions/);
});
test("Settings strictly separates configuration, status, action, and diagnostic surfaces", () => {
  const values = contracts();
  const experience = values.controlPlane.experience_contract;

  assert.doesNotThrow(() => validate(values));
  assert.deepStrictEqual(experience.surface_model.surface_types, [
    "configuration",
    "status",
    "action",
    "diagnostic",
  ]);
  assert.equal(
    experience.surface_model.configuration.pure_state_card_allowed,
    false,
  );
  assert.equal(
    experience.surface_model.configuration.one_time_action_allowed,
    false,
  );
  assert.equal(experience.surface_model.status.standalone_card_allowed, false);
  assert.equal(experience.surface_model.action.persistent_value_allowed, false);
  assert.equal(
    experience.surface_model.diagnostic.ordinary_page_inline_allowed,
    false,
  );
  assert.equal(
    values.controlPlane.state_action_policy.diagnostic_policy,
    "diagnostic_surfaces_are_read_only_and_must_not_mount_apply_repair_rollback_install_uninstall_or_persistent_setting_controls",
  );
  assert.deepStrictEqual(
    values.controlPlane.state_action_policy.status_vocabulary,
    [
      "checking",
      "not_checked",
      "not_applicable",
      "ready",
      "needs_attention",
      "failed",
    ],
  );
  for (const page of Object.values(experience.page_contracts)) {
    assert.deepStrictEqual(Object.keys(page.surface_inventory), [
      "configuration",
      "status",
      "action",
      "diagnostic",
    ]);
  }
  assert.deepStrictEqual(
    experience.page_contracts.maintenance.surface_inventory.configuration.map(
      (entry) => entry.id,
    ),
    ["update_channel", "log_directory"],
  );
  assert.ok(
    experience.page_contracts.maintenance.surface_inventory.action.length > 0,
  );
  assert.equal(
    experience.page_contracts.storage.surface_inventory.configuration.length,
    0,
  );
  assert.equal(
    experience.page_contracts.workspace.surface_inventory.configuration.some(
      (surface) => surface.id === "log_directory",
    ),
    false,
  );
  assert.ok(
    experience.page_contracts.maintenance.surface_inventory.configuration.some(
      (surface) => surface.id === "log_directory",
    ),
  );
  assert.ok(experience.page_contracts.storage.surface_inventory.action.length > 0);
  assert.ok(
    experience.page_contracts.storage.surface_inventory.diagnostic.some(
      (surface) => surface.id === "storage_restore_probe",
    ),
  );
  assert.equal(experience.page_contracts.advanced, undefined);
  assert.equal(
    experience.page_contracts.maintenance.surface_rules.working_path_owner,
    "Framework and raw paths live only in Maintenance diagnostics",
  );
  assert.deepStrictEqual(experience.page_contracts.gateway.surface_rules, {
    content_group_presentation: "single_unframed_content_group",
    account_container_border_count: 0,
    metrics_container_border_count: 0,
    metric_cell_divider_count: 0,
    footer_border_count: 0,
    stale_error_presentation: "inline_status_text_without_banner_frame",
  });
  assert.equal(
    experience.page_contracts.workspace.surface_rules.workspace_card_count,
    0,
  );
  assert.equal(
    experience.page_contracts.workspace.surface_rules.location_presentation,
    "one unframed Working directory group with the resolved logical workspace root",
  );
  assert.equal(
    experience.page_contracts.workspace.surface_rules.responsive_row_policy,
    "container_width_below_620px_stacks_copy_status_and_actions_without_word_breaking_paths",
  );
  assert.equal(
    experience.page_contracts.workspace.surface_rules.personalization_presentation,
    "unframed_field_groups_with_section_hairlines_no_nested_cards",
  );
  assert.deepStrictEqual(
    experience.page_contracts.preferences.surface_rules.builtin_theme_ids,
    [],
  );
  assert.deepStrictEqual(
    experience.page_contracts.preferences.surface_rules.appearance_mode_values,
    ["system", "light", "dark"],
  );
  assert.equal(
    experience.page_contracts.preferences.surface_rules.full_width_group_count,
    3,
  );
  assert.equal(
    experience.page_contracts.preferences.surface_inventory.diagnostic.length,
    0,
  );
  assert.equal(
    experience.page_contracts.workspace.first_viewport_groups.includes(
      "personalization",
    ),
    true,
  );
  assert.equal(
    experience.page_contracts.preferences.first_viewport_groups.includes(
      "personalization",
    ),
    false,
  );
  assert.equal(
    experience.page_contracts.workspace.surface_rules
      .personalization_changes_apply_to,
    "next_new_conversation",
  );
  assert.equal(
    experience.page_contracts.storage.surface_rules
      .pure_usage_summary_card_allowed,
    false,
  );
  assert.equal(
    experience.page_contracts.storage.surface_rules.zero_byte_policy,
    "show_nothing_to_clean_and_hide_actions",
  );
  assert.equal(
    experience.page_contracts.storage.surface_rules.cleanup_action_policy,
    "single_progressive_action_preview_then_confirm",
  );
  assert.equal(
    experience.page_contracts.storage.surface_rules.conversation_archive_policy,
    "archive_receipt_is_required_before_delete_and_the_same_archive_exposes_a_confirmed_restore_action",
  );
  assert.equal(
    experience.page_contracts.storage.surface_rules.restore_collision_policy,
    "never_overwrite_an_existing_conversation_without_an_explicit_collision_decision",
  );
  assert.equal(
    experience.page_contracts.agents.management_discoverability
      .raw_source_fallback_allowed,
    false,
  );

  const standaloneStatus = contracts();
  standaloneStatus.controlPlane.experience_contract.surface_model.status.standalone_card_allowed =
    true;
  assert.throws(() => validate(standaloneStatus), /pure status/);

  const inlineDiagnostics = contracts();
  inlineDiagnostics.controlPlane.experience_contract.surface_model.diagnostic.ordinary_page_inline_allowed =
    true;
  assert.throws(() => validate(inlineDiagnostics), /diagnostics must open explicitly/);

  const legacySurfaceType = contracts();
  legacySurfaceType.controlPlane.experience_contract.surface_model.status_row = {};
  assert.throws(() => validate(legacySurfaceType), /strict four-surface model/);

  const missingInventoryType = contracts();
  delete missingInventoryType.controlPlane.experience_contract.page_contracts.models
    .surface_inventory.action;
  assert.throws(() => validate(missingInventoryType), /surface inventory types/);

  const mixedSurface = contracts();
  mixedSurface.controlPlane.experience_contract.page_contracts.workspace
    .surface_inventory.status.push({ id: "workspace_selection", owner: "workspace" });
  assert.throws(() => validate(mixedSurface), /cannot mix surface types/);

  const wrongOwner = contracts();
  wrongOwner.controlPlane.experience_contract.page_contracts.about.surface_inventory.status[0].owner =
    "maintenance";
  assert.throws(() => validate(wrongOwner), /page ownership/);

  const maintenanceAsSetting = contracts();
  maintenanceAsSetting.controlPlane.experience_contract.page_contracts.maintenance.surface_inventory.configuration.push(
    {
      id: "run_repair_as_setting",
      owner: "maintenance",
    },
  );
  assert.throws(
    () => validate(maintenanceAsSetting),
    /update channel|maintenance operations remain actions/,
  );

  const writableDiagnostics = contracts();
  writableDiagnostics.controlPlane.experience_contract.page_contracts.maintenance.surface_rules.diagnostic_mutation_controls_allowed =
    true;
  assert.throws(() => validate(writableDiagnostics), /Maintenance surface rules/);

  const maintenance = contracts().controlPlane.experience_contract.page_contracts.maintenance;
  assert.equal(
    maintenance.surface_rules.daily_action_surface,
    "the_Maintenance_page_itself_owns_check_apply_repair_and_rollback_with_per_action_state_confirmation_and_fresh_readback",
  );
  assert.equal(maintenance.surface_rules.diagnostic_entry_count, 1);
  assert.equal(
    maintenance.surface_rules.large_overlay_policy,
    "never_open_or_define_overlapping_management_and_diagnostics_modals",
  );
  assert.equal(
    maintenance.surface_rules.raw_internal_status_key_policy,
    "never_render_raw_internal_status_keys_action_ids_or_payload_fields_as_user_facing_copy",
  );
  assert.equal(
    maintenance.required_dom.conditional.some((entry: any) => entry.when === "management_open"),
    false,
  );

  const overlappingMaintenanceModal = contracts();
  overlappingMaintenanceModal.controlPlane.experience_contract.page_contracts.maintenance.surface_rules.large_overlay_policy =
    "management_and_diagnostics_modals_may_overlap";
  assert.throws(() => validate(overlappingMaintenanceModal), /Maintenance surface rules/);
});
test("Settings rejects a framed Gateway account surface", () => {
  const framedGateway = contracts();
  framedGateway.controlPlane.experience_contract.page_contracts.gateway.surface_rules.footer_border_count = 1;
  assert.throws(() => validate(framedGateway), /Gateway flat content rules/);
});

test("Settings keeps Gateway ownership, cached storage freshness, managed dependencies, and non-blocking startup checks", () => {
  const values = contracts();
  const pages = values.controlPlane.experience_contract.page_contracts;
  const aboutPage = values.pageStateMatrix.pages.find((page) => page.id === "about");
  const startup = values.controlPlane.state_action_policy.startup_performance_policy;

  assert.doesNotThrow(() => validate(values));
  assert.equal(
    pages.resources.connection_filter_policy,
    "exclude the built-in OPL Gateway connection and count; show only canonical owner-projected external connections with at least one resource or route ref",
  );
  assert.equal(
    pages.storage.surface_rules.inventory_initial_state,
    "last_persisted_snapshot_or_loading_placeholder_never_synthetic_zero_bytes",
  );
  assert.deepStrictEqual(pages.storage.surface_rules.inventory_freshness_fields, [
    "observed_at",
    "scan_duration_ms",
    "stale",
  ]);
  assert.equal(
    pages.storage.surface_rules.inventory_event,
    "local-data-lifecycle.inventory-updated",
  );
  assert.equal(
    pages.maintenance.surface_rules.managed_dependency_primary_visibility,
    "managed_dependency_summary_is_visible_without_opening_diagnostics",
  );
  const managedDependencies =
    values.controlPlane.page_adapter_policy.required_pages.environment
      .managed_dependency_summary;
  assert.equal(
    managedDependencies.source_ref,
    "opl update status --json#managed_update.components[component_id=opl_base].current.dependency_catalog.dependencies[]",
  );
  assert.deepStrictEqual(managedDependencies.required_ids, [
    "codex-cli",
    "temporal-runtime",
    "temporal-system-cli",
  ]);
  assert.deepStrictEqual(managedDependencies.required_fields, [
    "dependency_id",
    "dependency_kind",
    "installed",
    "version",
    "latest_version",
    "currentness",
    "ownership",
    "update_policy",
    "update_mode",
    "update_action",
    "activation_policy",
    "binary_path",
    "status",
  ]);
  assert.deepStrictEqual(managedDependencies.optional_fields, ["real_path"]);
  assert.deepStrictEqual(managedDependencies.path_identity_precedence, [
    "real_path",
    "binary_path",
  ]);
  assert.deepStrictEqual(
    managedDependencies.external_installations_policy.optional_fields,
    ["real_path"],
  );
  assert.equal(aboutPage.updater_state_policy.mount_check, false);
  assert.equal(startup.cold_budget_ms, 1500);
  assert.equal(startup.warm_budget_ms, 1500);
  assert.equal(
    startup.first_window_state_source,
    "renderer_localStorage_allowlisted_fast_state_snapshot_or_loading_shell",
  );
  assert.equal(startup.ordinary_guid_interactive_target_ms, 1500);
  assert.equal(
    startup.ordinary_guid_target_scope,
    "OS_launch_request_to_Guid_composer_visible_enabled_and_focusable",
  );
  assert.equal(
    startup.ordinary_guid_target_status,
    "required_unverified_installed_target_not_current_measurement_or_SLA",
  );
  assert.equal(startup.background_hydration_in_guid_target, false);
  assert.equal(
    startup.first_window_failure_policy,
    "render_recoverable_nonblank_shell_never_fatal_or_blank_candidate_window",
  );
  assert.deepStrictEqual(startup.timing_milestones, [
    "stable_shell_first_paint",
    "background_hydration_complete",
  ]);
  assert.equal(
    startup.framework_projection_claim,
    "not_proven_by_ui_contract_or_shell_gate",
  );
  assert.equal(startup.startup_projection_payload_budget_bytes, 262144);
  assert.deepStrictEqual(startup.lazy_drilldown_routes, [
    "agents",
    "capabilities",
    "storage",
    "about",
  ]);
  assert.equal(startup.single_flight_background_refresh, true);
  assert.equal(startup.global_refresh_on_route_mount, false);

  const gatewayCountRegression = contracts();
  gatewayCountRegression.controlPlane.experience_contract.page_contracts.resources.connection_filter_policy =
    "show_all_connections_and_count";
  assert.throws(
    () => validate(gatewayCountRegression),
    /exclude the built-in OPL Gateway connection and count/,
  );

  const syntheticZero = contracts();
  syntheticZero.controlPlane.experience_contract.page_contracts.storage.surface_rules.inventory_initial_state =
    "zero_bytes_until_scan_completes";
  assert.throws(() => validate(syntheticZero), /Storage surface rules/);

  const missingFreshness = contracts();
  missingFreshness.controlPlane.experience_contract.page_contracts.storage.surface_rules.inventory_freshness_fields =
    ["observed_at", "stale"];
  assert.throws(() => validate(missingFreshness), /Storage surface rules/);

  const missingPushEvent = contracts();
  missingPushEvent.controlPlane.experience_contract.page_contracts.storage.surface_rules.inventory_event =
    "none";
  assert.throws(() => validate(missingPushEvent), /Storage surface rules/);

  const hiddenManagedDependencies = contracts();
  hiddenManagedDependencies.controlPlane.experience_contract.page_contracts.maintenance.surface_rules.managed_dependency_primary_visibility =
    "diagnostics_only";
  assert.throws(
    () => validate(hiddenManagedDependencies),
    /Maintenance surface rules/,
  );

  const checkOnAboutMount = contracts();
  checkOnAboutMount.pageStateMatrix.pages.find(
    (page) => page.id === "about",
  ).updater_state_policy.mount_check = true;
  assert.throws(
    () => validate(checkOnAboutMount),
    /About updater state policy/,
  );

  const blockingStartup = contracts();
  blockingStartup.controlPlane.state_action_policy.startup_performance_policy.first_window_blocking_policy =
    "wait_for_complete_fast_state";
  assert.throws(
    () => validate(blockingStartup),
    /Settings startup performance policy/,
  );

  const inventedMainProcessCache = contracts();
  inventedMainProcessCache.controlPlane.state_action_policy.startup_performance_policy
    .persisted_snapshot.source = "desktop_main_process_persisted_narrow_cache";
  assert.throws(
    () => validate(inventedMainProcessCache),
    /Settings startup performance policy/,
  );

  const unboundStartupClaim = contracts();
  unboundStartupClaim.controlPlane.state_action_policy.startup_performance_policy
    .ordinary_guid_target_status = "measured_SLA";
  assert.throws(
    () => validate(unboundStartupClaim),
    /Settings startup performance policy/,
  );

  const waitingGuid = contracts();
  waitingGuid.guiContract.framework_surfaces.canonical_state.startup_read_model_policy
    .navigation_wait_for_fast_state_ms = 1500;
  assert.throws(
    () => validateGui(waitingGuid.guiContract),
    /must expose bounded quantitative readiness before Guid interaction/,
  );

  const oversizedStartup = contracts();
  oversizedStartup.pageStateMatrix.settings_startup_performance_policy.startup_projection_payload_budget_bytes =
    2097152;
  assert.throws(
    () => validate(oversizedStartup),
    /Settings page-state startup performance policy/,
  );
});

test("Resources keeps redacted Connect authorization and dedicated approval ownership", () => {
  const values = contracts();
  const authorization = values.controlPlane.experience_contract.page_contracts.resources.connection_authorization;
  assert.doesNotThrow(() => validate(values));
  assert.deepStrictEqual(
    values.guiContract.pages.settings_resources.connection_authorization,
    authorization,
  );
  assert.equal(authorization.source, 'settings_control_center.app_settings_read_model.connections.authorization');
  assert.equal(authorization.approval_action_id_in_generic_action_catalog, false);
  assert.deepStrictEqual(authorization.ordinary_owner_action_ids, [
    'connection_access_request_deny',
    'connection_grant_revoke',
    'connection_relay_import',
  ]);
  assert.deepStrictEqual(authorization.available_connection_fields, [
    'connection_id',
    'display_name',
    'provider_type',
    'status',
    'security_revision',
    'account_label',
    'mailbox_ref',
  ]);
  assert.match(authorization.available_connections_policy, /mailbox_ref_is_the_relay_owner_identity_and_not_connection_id/);

  const genericApproval = contracts();
  genericApproval.controlPlane.experience_contract.page_contracts.resources.connection_authorization.approval_action_id_in_generic_action_catalog = true;
  assert.throws(() => validate(genericApproval), /dedicated user approval bridge/);

  const missingRelayIdentity = contracts();
  missingRelayIdentity.controlPlane.experience_contract.page_contracts.resources.connection_authorization.available_connection_fields.pop();
  assert.throws(() => validate(missingRelayIdentity), /owner-projected Relay mailbox identity fields/);

  const rawInvocation = contracts();
  rawInvocation.guiContract.pages.settings_resources.connection_authorization.invocation_fields.push('arguments');
  assert.throws(() => validate(rawInvocation), /connection authorization/);
});
