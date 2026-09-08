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
  validatePageSurfaceInventory,
  validateSettingsSurfaceModel,
} from "./page-state.ts";

export function validateSettingsExperienceContract(experience) {
  if (
    experience?.schema !== "settings_codex_quiet_experience.v2" ||
    experience.owner !== "one-person-lab-app" ||
    experience.purpose !==
      "machine_verifiable_settings_visual_search_page_and_dom_contract"
  ) {
    throw new Error(
      "Settings experience contract must be active App-owned control-center behavior",
    );
  }
  if (
    experience.source_contract_ref !==
      "contracts/app-gui-product-contract.json#settings_navigation.settings_ia" ||
    experience.page_state_matrix_ref !==
      "contracts/app-page-state-matrix.json#pages"
  ) {
    throw new Error(
      "Settings experience contract must bind GUI authority and the page-state matrix",
    );
  }
  assertDeepEqualJson(
    experience.visual_system,
    appOwnedSettingsVisualSystem,
    "Settings experience visual system",
  );
  validateSettingsSurfaceModel(experience.surface_model);

  const search = experience.global_search;
  if (
    search?.global_entry_count !== 1 ||
    search.entry_testid !== "settings-search-input" ||
    search.results_testid !== "settings-search-results" ||
    search.result_item_testid !== "settings-search-result" ||
    search.empty_state_testid !== "settings-search-empty" ||
    search.index_granularity !== "item" ||
    search.result_label_format !== "{group_label} > {destination_label} > {entry_label}" ||
    search.result_navigation !== "route_id_plus_anchor" ||
    search.keyboard_activation_policy !==
      "arrow_keys_select_result_enter_activates_selected_escape_clears_query" ||
    search.destination_focus_policy !== "open_ancestor_disclosures_scroll_focus_and_highlight_declared_anchor" ||
    search.anchor_query_param !== "section" ||
    search.hash_router_policy !==
      "use_route_query_section_when_a_second_hash_fragment_is_not_supported" ||
    search.compatibility_index_policy !==
      "index_update_theme_local_services_and_personalization_under_their_owner_page_anchors"
  ) {
    throw new Error(
      "Settings search must be one bilingual item-level route-and-anchor search",
    );
  }
  assertDeepEqualJson(
    search.languages,
    ["zh-CN", "en"],
    "Settings search languages",
  );
  assertDeepEqualJson(
    search.forbidden_duplicate_entry_testids,
    ["settings-sider-search-input", "settings-route-search"],
    "Settings duplicate search entry testids",
  );

  const pageContracts = experience.page_contracts ?? {};
  assertDeepEqualJson(
    Object.keys(pageContracts).sort(),
    [...appOwnedSettingsProductPageIds].sort(),
    "Settings experience product page ids",
  );
  const routeByProductPage = new Map([
    ...appOwnedSettingsTopLevelEntryIds.map((pageId, index) => [
      pageId,
      appOwnedSettingsTabs[index],
    ]),
    ...appOwnedSecondarySettingsPages.map((pageId) => [pageId, pageId]),
  ]);
  for (const [pageId, page] of Object.entries(pageContracts)) {
    assertIncludesAll(
      Object.keys(page),
      appOwnedSettingsPageExperienceFields,
      `Settings experience ${pageId} fields`,
    );
    if (
      page.product_page_id !== pageId ||
      page.route_id !== routeByProductPage.get(pageId) ||
      typeof page.matrix_page_id !== "string" ||
      page.matrix_page_id.length === 0
    ) {
      throw new Error(
        `Settings experience ${pageId} must bind its product, route, and matrix ids`,
      );
    }
    validatePageSurfaceInventory(pageId, page.surface_inventory);
    for (const field of [
      "label_zh",
      "label_en",
      "exception_state",
      "technical_details_boundary",
    ]) {
      if (typeof page[field] !== "string" || page[field].trim() === "") {
        throw new Error(`Settings experience ${pageId} must declare ${field}`);
      }
    }
    if (appOwnedSettingsTopLevelLabels[pageId]) {
      assertDeepEqualJson(
        { label_zh: page.label_zh, label_en: page.label_en },
        appOwnedSettingsTopLevelLabels[pageId],
        `Settings experience ${pageId} product label`,
      );
    }
    if (
      !Array.isArray(page.primary_information) ||
      page.primary_information.length === 0
    ) {
      throw new Error(
        `Settings experience ${pageId} must declare primary information`,
      );
    }
    if (
      !Array.isArray(page.first_viewport_groups) ||
      page.first_viewport_groups.length < 1 ||
      page.first_viewport_groups.length > 4 ||
      new Set(page.first_viewport_groups).size !==
        page.first_viewport_groups.length
    ) {
      throw new Error(
        `Settings experience ${pageId} must declare one to four distinct first-viewport groups`,
      );
    }
    if (
      typeof page.primary_action?.id !== "string" ||
      typeof page.primary_action?.availability !== "string" ||
      page.primary_action.max_visible !== 1
    ) {
      throw new Error(
        `Settings experience ${pageId} must declare at most one primary action`,
      );
    }
    const technicalDetailsTestId = `settings-${pageId}-technical-details`;
    const technicalDetailsOptional = [
      "overview",
      "gateway",
      "models",
      "workspace",
      "capabilities",
      "preferences",
    ].includes(pageId);
    const hasTechnicalDetailsSurface =
      page.required_dom.always.includes(technicalDetailsTestId) ||
      page.required_dom.conditional.some(
        (entry) =>
          entry.testid === technicalDetailsTestId &&
          entry.when === "diagnostics_open",
      );
    if (
      !Array.isArray(page.required_dom?.always) ||
      !page.required_dom.always.includes(`settings-page-${pageId}`) ||
      !page.required_dom.always.includes(`settings-${pageId}-primary`) ||
      !Array.isArray(page.required_dom?.conditional) ||
      (!technicalDetailsOptional && !hasTechnicalDetailsSurface)
    ) {
      throw new Error(
        `Settings experience ${pageId} must declare stable DOM testids`,
      );
    }
    assertDeepEqualJson(
      page.required_anchors,
      appOwnedSettingsPageAnchors[pageId],
      `Settings experience ${pageId} anchors`,
    );
    assertDeepEqualJson(
      page.search_entry_ids,
      appOwnedSettingsPageSearchEntryIds[pageId],
      `Settings experience ${pageId} search entry ids`,
    );
  }
  assertDeepEqualJson(
    pageContracts.resources.browser_access_entry,
    appOwnedSettingsResourcesBrowserEntry,
    "Settings Resources browser entry",
  );
  if (
    pageContracts.resources.connection_filter_policy !==
    "exclude the built-in OPL Gateway connection and count; show only canonical owner-projected external connections with at least one resource or route ref"
  ) {
    throw new Error(
      "Settings Resources must exclude the built-in OPL Gateway connection and count",
    );
  }
  if (
    pageContracts.models.browser_access_entry !== undefined ||
    pageContracts.models.required_dom.always.includes(
      "settings-access-browser-access",
    ) ||
    !pageContracts.resources.required_dom.always.includes(
      "settings-resources-browser-access",
    )
  ) {
    throw new Error(
      "Settings browser access must be owned by Resources & Connections, not Models",
    );
  }
  assertDeepEqualJson(
    pageContracts.gateway.surface_rules,
    {
      content_group_presentation: "single_unframed_content_group",
      account_container_border_count: 0,
      metrics_container_border_count: 0,
      metric_cell_divider_count: 0,
      footer_border_count: 0,
      stale_error_presentation: "inline_status_text_without_banner_frame",
    },
    "Settings Gateway flat content rules",
  );
  if (
    pageContracts.workspace.readiness_precedence !==
    "filesystem_writability_and_health_override_executor_permission_mode"
  ) {
    throw new Error(
      "Settings Workspace readiness must follow filesystem writability and health before executor mode",
    );
  }
  const backgroundTasks = pageContracts.overview.background_services_summary;
  if (
    backgroundTasks?.overview_visible_unit !== "background_tasks" ||
    backgroundTasks?.overview_label_zh !== "后台任务" ||
    backgroundTasks?.overview_label_en !== "Background tasks" ||
    backgroundTasks?.component_detail_visibility !==
      "service_status_destination_only" ||
    !pageContracts.overview.required_dom.always.includes(
      "settings-overview-background-tasks",
    ) ||
    pageContracts.overview.required_dom.always.some((id) =>
      id.startsWith("settings-overview-temporal-"),
    )
  ) {
    throw new Error(
      "Settings Overview must keep one persistent Background tasks summary and leave Temporal component detail on Service Status",
    );
  }
  const temporalMentalModel =
    pageContracts.maintenance?.temporal_service_management?.user_mental_model;
  if (
    temporalMentalModel?.surface_label_zh !== "持久任务运行（Temporal）" ||
    temporalMentalModel?.surface_label_en !== "Durable tasks (Temporal)" ||
    temporalMentalModel?.component_labels?.temporal_server?.label_zh !==
      "Temporal 基础服务" ||
    temporalMentalModel?.component_labels?.temporal_server?.role !==
      "single_required_temporal_dependency_substrate" ||
    temporalMentalModel?.component_labels?.temporal_worker?.label_zh !==
      "OPL 任务执行器" ||
    temporalMentalModel?.component_labels?.temporal_scheduler?.label_zh !==
      "周期计划" ||
    temporalMentalModel?.component_labels?.temporal_scheduler?.role !==
      "temporal_schedule_cadence_not_a_second_scheduler_service" ||
    JSON.stringify(temporalMentalModel?.dependency_topology) !==
      JSON.stringify([
        "temporal_server",
        "temporal_worker",
        "temporal_scheduler",
      ]) ||
    temporalMentalModel?.causal_blocking_policy !==
      "downstream_unready_due_to_an_upstream_component_must_show_waiting_for_the_named_upstream_not_generic_attention" ||
    temporalMentalModel?.aggregate_status_policy !==
      "show_the_root_cause_and_user_impact_once_never_repeat_one_generic_attention_label_for_every_component" ||
    temporalMentalModel?.primary_action_policy !==
      "show_exactly_one_safe_action_for_the_first_actionable_root_cause_plus_one_recheck_action" ||
    temporalMentalModel?.disabled_action_policy !==
      "hide_blocked_downstream_actions_or_explain_their_named_prerequisite_with_focusable_accessible_help" ||
    temporalMentalModel?.technical_detail_policy !==
      "address_namespace_task_queue_supervisor_and_component_timestamps_are_collapsed_by_default"
  ) {
    throw new Error(
      "Settings Temporal service user mental model must preserve one dependency chain, causal waiting states, one root action, and collapsed technical details",
    );
  }
  assertDeepEqualJson(
    pageContracts.workspace.surface_rules,
    {
      workspace_card_count: 0,
      location_presentation:
        "one unframed Working directory group with the resolved logical workspace root",
      permission_presentation:
        "one merged writability status inside the workspace row",
      responsive_row_policy:
        "container_width_below_620px_stacks_copy_status_and_actions_without_word_breaking_paths",
      personalization_presentation:
        "unframed_field_groups_with_section_hairlines_no_nested_cards",
      maintenance_action_visibility: "attention_only",
      diagnostics_entry: "explicit_modal_action",
      workspace_root_owner: "one-person-lab_Framework",
      workspace_root_desktop_policy:
        "editable_through_the_owner_projected_workspace_root_action_with_fresh_readback",
      workspace_root_webui_policy:
        "read_only_owner_projected_logical_root_and_never_execute_workspace_root_set",
      workspace_root_docker_webui_policy:
        "read_only_/projects_from_OPL_WORKSPACE_ROOT_and_never_execute_workspace_root_set",
      desktop_directory_mapping:
        "project_workspace_is_the_Framework_logical_workspace_root",
      docker_mapping:
        "host_projects_directory_is_bound_to_/projects_and_Settings_does_not_rewire_the_bind_mount",
      docker_volume_rewire_allowed: false,
      generated_base_context_allowed: false,
      agent_route_fallback_allowed: false,
      additional_instructions_editable: true,
      restore_default_confirmation_required: true,
      personalization_changes_apply_to: "next_new_conversation",
      deployment_boundary:
        "Settings_changes_only_the_desktop_logical_workspace_root;_standalone_WebUI_root_configuration_and_Docker_WebUI_host_bind_sources_change_only_outside_the_browser",
      path_instance_count: 1,
    },
    "Settings Workspace surface rules",
  );
  assertDeepEqualJson(
    pageContracts.agents.management_discoverability,
    {
      primary_row_controls: ["home_visibility", "recommended_action", "manage"],
      projected_action_source:
        "app_state.agent_packages.directory.entries[].available_actions[]",
      projected_action_semantic_source:
        "app_state.agent_packages.directory.entries[].available_actions[].semantic",
      action_id_allowlist_allowed: false,
      catalog_search_is_settings_global_search: false,
      dynamic_directory_reload:
        "ordinary_visible_fresh_fast_app_state_readback_without_registry_cache_authority",
      projected_action_policy:
        "execute only Framework action_id and payload; never infer status, readiness, action ids, or payload fields in the Shell",
      raw_source_fallback_allowed: false,
      diagnostic_refs_location: "diagnostics_modal",
      home_preference_policy:
        "single_reactive_owner_with_success_commit_and_failure_rollback",
    },
    "Settings Agent package management discoverability",
  );
  assertDeepEqualJson(
    pageContracts.agents.first_viewport_groups,
    [
      "agent_package_catalog_controls",
      "agent_package_directory_entries",
      "agent_package_details",
    ],
    "Settings Agents first-viewport groups",
  );
  assertDeepEqualJson(
    pageContracts.agents.catalog_presentation,
    {
      policy_ref:
        "contracts/app-product-profile.json#gui.agent_package_registry.catalog_presentation_policy",
      section_order: [
        "professional_agents",
        "capability_packages",
        "workflow_profiles",
        "other_packages",
      ],
      role_label_policy:
        "localized_product_label_never_raw_package_role_enum",
      dependency_source:
        "app_state.agent_packages.status_index.packages[].dependent_guard.required_by_package_ids",
      dependency_policy:
        "single_parent_nested_multi_parent_or_missing_parent_capability_packages_each_package_rendered_once",
      hardcoded_relationships_allowed: false,
    },
    "Settings Agents catalog presentation",
  );
  if (pageContracts.agents.developer_mode_surface?.default_disclosure !== "collapsed") {
    throw new Error(
      "Settings Agents developer source and repository maintenance configuration must be collapsed by default",
    );
  }
  if (
    pageContracts.agents.exception_state !==
    "highlight only genuinely failed blocked or dependency-broken Agent packages; installed exposed verification-deferred or scope-materialization-missing packages read as available with no preconfiguration action"
  ) {
    throw new Error(
      "Settings Agents exception state must use Agent package semantics",
    );
  }
  assertDeepEqualJson(
    pageContracts.preferences.surface_rules,
    {
      full_width_group_count: 3,
      two_plus_one_grid_allowed: false,
      builtin_theme_ids: [],
      extension_themes_default_visible: false,
      custom_theme_management:
        "not_exposed_user_data_preserved_for_compatibility",
      appearance_mode_values: ["system", "light", "dark"],
      visual_baseline: "single_governed_opl_codex_aligned_baseline",
      interactive_controls_inside_diagnostic_surface_allowed: false,
      performance_and_waiting_policy:
        "named_configuration_disclosure_collapsed_by_default_search_reveals_controls",
      voice_input_configuration_allowed: false,
      voice_input_configuration_owner: "capabilities",
      display_preview: "live_sample_uses_current_chat_markdown_and_code_font_sizes_and_interface_scale",
    },
    "Settings Preferences surface rules",
  );
  assertDeepEqualJson(
    pageContracts.maintenance.surface_rules,
    {
      configuration_location:
        "update_channel_is_an_inline_persistent_control_in_the_updates_section",
      destination_visibility_policy:
        "render_exactly_one_of_service_status_updates_repairs_or_logs_diagnostics_as_the_selected_ordinary_purpose",
      daily_action_surface:
        "the_Maintenance_page_itself_owns_check_apply_repair_and_rollback_with_per_action_state_confirmation_and_fresh_readback",
      management_surface:
        "inline_page_rows_and_progressive_confirmation_never_a_second_large_management_modal",
      diagnostic_surface:
        "one_advanced_read_only_disclosure_for_localized_component_path_and_receipt_evidence",
      diagnostic_entry_count: 1,
      large_overlay_policy:
        "never_open_or_define_overlapping_management_and_diagnostics_modals",
      diagnostic_mutation_controls_allowed: false,
      raw_internal_status_key_policy:
        "never_render_raw_internal_status_keys_action_ids_or_payload_fields_as_user_facing_copy",
      unknown_state_copy:
        "distinguish_checking_not_checked_not_applicable_and_needs_attention",
      managed_dependency_primary_visibility:
        "managed_dependency_summary_is_visible_without_opening_diagnostics",
      working_path_owner:
        "Framework and raw paths live only in Maintenance diagnostics",
      log_directory_owner:
        "Logs_and_Diagnostics_owns_the_Desktop_application.setLogDirectory_action_standalone_WebUI_read_only_systemInfo_projection_and_Docker_WebUI_read_only_/data/logs_projection",
      webui_log_action_execution_allowed: false,
    },
    "Settings Maintenance surface rules",
  );
  const maintenanceDestinations =
    pageContracts.maintenance.destination_contracts ?? {};
  assertDeepEqualJson(
    Object.fromEntries(
      Object.entries(maintenanceDestinations).map(
        ([id, destination]: [string, any]) => [
          id,
          {
            anchor: destination.anchor,
            label_zh: destination.label_zh,
            label_en: destination.label_en,
          },
        ],
      ),
    ),
    {
      runtime_services: {
        anchor: "services",
        label_zh: "服务状态",
        label_en: "Service Status",
      },
      updates_repairs: {
        anchor: "updates",
        label_zh: "更新与修复",
        label_en: "Updates & Repair",
      },
      logs_diagnostics: {
        anchor: "diagnostics",
        label_zh: "日志与诊断",
        label_en: "Logs & Diagnostics",
      },
    },
    "Settings Maintenance second-level destinations",
  );
  if (
    maintenanceDestinations.logs_diagnostics?.must_not_show?.includes(
      "WebUI log-directory mutation",
    ) !== true ||
    pageContracts.maintenance.destination_dom?.logs_diagnostics?.includes(
      "settings-maintenance-log-directory",
    ) !== true
  ) {
    throw new Error(
      "Settings Logs & Diagnostics must own the carrier-specific log directory surface",
    );
  }
  assertDeepEqualJson(
    pageContracts.storage.surface_rules,
    {
      total_usage_presentation: "status_row_in_page_header",
      pure_usage_summary_card_allowed: false,
      diagnostics_entry: "explicit_modal_action",
      zero_byte_policy: "show_nothing_to_clean_and_hide_actions",
      cleanup_action_policy: "single_progressive_action_preview_then_confirm",
      cleanup_preview_interaction: {
        presentation: "modal_item_selector_before_confirmation",
        required_summary_fields: [
          "category_total_bytes",
          "candidate_count",
          "candidate_bytes",
          "selected_bytes",
          "retained_bytes",
          "retained_reason",
        ],
        candidate_presentation: {
          selection: "checkbox_per_candidate_default_selected",
          visible_fields: ["friendly_name", "bytes", "localized_reason"],
          raw_path: "collapsed_technical_detail_only",
        },
        inventory_composition_presentation: {
          source: "same_inventory_snapshot_as_category_total",
          visible_fields: [
            "root_friendly_name",
            "bytes",
            "cleanup_boundary",
            "localized_reason",
          ],
          boundary_states: [
            "covered_by_this_cleanup",
            "reported_only_not_cleanable_here",
          ],
          raw_path: "collapsed_technical_detail_only",
        },
        retained_presentation:
          "always_explain_total_minus_candidates_and_why_it_is_not_selectable",
        execution_policy: {
          selection_scope:
            "non_empty_subset_of_exact_dry_run_candidates_only",
          empty_selection: "disabled",
          revalidation:
            "full_plan_hash_live_authority_and_selected_subset_membership_before_delete",
        },
      },
      conversation_archive_policy:
        "archive_receipt_is_required_before_delete_and_the_same_archive_exposes_a_confirmed_restore_action",
      restore_collision_policy:
        "never_overwrite_an_existing_conversation_without_an_explicit_collision_decision",
      inventory_initial_state:
        "last_persisted_snapshot_or_loading_placeholder_never_synthetic_zero_bytes",
      inventory_refresh_policy:
        "startup_delayed_background_scan_with_300_second_ttl_manual_force_refresh_and_push_update_after_scan",
      inventory_cache_ttl_seconds: 300,
      inventory_freshness_fields: ["observed_at", "scan_duration_ms", "stale"],
      inventory_event: "local-data-lifecycle.inventory-updated",
      log_directory_reference: "read_only_link_to_environment#diagnostics",
      owner_storage_projection_source: "opl_app_state_fast_owner_projections",
      owner_storage_sections: [
        "agent_package_store",
        "webui_data_volume",
      ],
      owner_storage_required_fields: [
        "status",
        "observed_at",
        "stale",
        "bytes",
        "reclaimable_bytes",
        "owner_route",
        "projected_action",
      ],
      owner_storage_missing_policy: "fail_open_keep_shell_owned_categories_available",
      agent_package_storage_action_policy: "navigate_to_agents_reuse_owner_uninstall_no_duplicate_storage_lifecycle",
      webui_data_volume_mapping: "OnePersonLab/data -> /data",
      webui_cleanup_policy: "owner_projected_dry_run_exact_confirmation_fresh_terminal_readback_and_recovery",
      webui_host_action_abi_ref:
        "contracts/app-release-channel.json#local_data_lifecycle.owner_storage_projections.webui_data_volume.host_action_abi",
      generic_docker_prune_allowed: false,
      deployment_location_summary: {
        visibility: "docker_webui_only",
        interaction: "read_only_no_mount_or_environment_mutation",
        required_host_bind_count: 2,
        required_host_binds: [
          {
            id: "projects",
            container_path: "/projects",
            purpose_zh: "项目与任务产物",
            purpose_en: "Projects and task artifacts",
            container_environment: [
              "OPL_PROJECTS_DIR=/projects",
              "OPL_WORKSPACE_ROOT=/projects",
            ],
            settings_relation:
              "In Docker WebUI, Working Directory is fixed read-only at /projects and never executes workspace_root_set or rewires the host projects bind",
          },
          {
            id: "data",
            container_path: "/data",
            purpose_zh: "App 数据、Framework 状态、Codex Home 与会话、日志",
            purpose_en:
              "App data, Framework state, Codex Home and sessions, and logs",
            container_environment: [
              "HOME=/data",
              "AIONUI_DATA_DIR=/data",
              "OPL_DATA_DIR=/data",
            ],
            settings_relation:
              "Data and log locations are deployment-managed and Settings never rewires the host data bind",
          },
        ],
        container_recovery_surface: {
          container_path: "/recovery",
          environment: "OPL_WEBUI_RECOVERY_DIR=/recovery",
          purpose_zh: "清理前归档与恢复暂存",
          purpose_en: "Pre-cleanup archives and recovery staging",
          required_host_bind: false,
          host_persistence_policy:
            "optional_and_deployment_managed_not_a_third_required_bind",
        },
      },
      storage_carrier_behavior: appOwnedStorageCarrierBehavior,
    },
    "Settings Storage surface rules",
  );
  assertDeepEqualJson(
    pageContracts.about.surface_rules,
    {
      version_update_card_count: 1,
      version_channel_layout: "one compact row",
      update_action_placement: "dedicated row below version and channel",
      help_link_layout: "full_width_row_with_trailing_icon_at_container_edge",
      automatic_check_policy:
        "check once after App startup and publish the result to a shared updater state store",
      mount_policy:
        "About reads cached updater state and never starts a check on mount",
      manual_check_policy:
        "the Check for updates action refreshes the same shared updater state",
      state_source:
        "desktop_main_process_app_metadata + single_main_process_updater_state_store",
      framework_state_role: "diagnostic_supplement_only",
    },
    "Settings About surface rules",
  );
  assertDeepEqualJson(
    pageContracts.capabilities.tab_contract,
    appOwnedSettingsCapabilitiesTabContract,
    "Settings Capabilities tab contract",
  );
  assertDeepEqualJson(
    pageContracts.resources.action_behavior,
    appOwnedSettingsResourceActionBehavior,
    "Settings Resources action behavior",
  );

  if (
    experience.search_index?.schema !==
    "settings_bilingual_item_search_index.v1"
  ) {
    throw new Error(
      "Settings search index must use settings_bilingual_item_search_index.v1",
    );
  }
  const entries = experience.search_index?.entries ?? [];
  const entryIds = new Set();
  for (const entry of entries) {
    assertIncludesAll(
      Object.keys(entry),
      appOwnedSettingsSearchEntryFields,
      `Settings search entry ${entry?.id ?? "<missing id>"} fields`,
    );
    if (entryIds.has(entry.id)) {
      throw new Error(`Settings search entry ${entry.id} must be unique`);
    }
    entryIds.add(entry.id);
    const page = pageContracts[entry.page_id];
    if (!page || !page.required_anchors.includes(entry.anchor)) {
      throw new Error(
        `Settings search entry ${entry.id} must target a declared page anchor`,
      );
    }
    if (
      typeof entry.label_zh !== "string" ||
      entry.label_zh.trim() === "" ||
      typeof entry.label_en !== "string" ||
      entry.label_en.trim() === "" ||
      !Array.isArray(entry.keywords_zh) ||
      entry.keywords_zh.length === 0 ||
      !Array.isArray(entry.keywords_en) ||
      entry.keywords_en.length === 0
    ) {
      throw new Error(
        `Settings search entry ${entry.id} must be indexed in Chinese and English`,
      );
    }
  }
  for (const [pageId, page] of Object.entries(pageContracts)) {
    assertDeepEqualJson(
      page.search_entry_ids,
      entries
        .filter((entry) => entry.page_id === pageId)
        .map((entry) => entry.id),
      `Settings search entries for ${pageId}`,
    );
  }
  for (const redirect of Object.values(
    appOwnedSettingsCompatibilityRedirects,
  )) {
    const targetPage = pageContracts[redirect.product_page_id];
    if (!targetPage?.required_anchors.includes(redirect.anchor)) {
      throw new Error(
        `Settings compatibility route ${redirect.source_route_id} must target a declared owner-page anchor`,
      );
    }
  }
  if (
    experience.live_evidence_boundary !==
    "contract_matrix_validator_and_focused_tests_do_not_prove_running_shell_runtime_or_release_readiness"
  ) {
    throw new Error(
      "Settings experience contract must preserve the live evidence boundary",
    );
  }
}
