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

test("Settings keeps one desktop App updater source, WebUI fallback, independent attention, and current-only repair", () => {
  const values = contracts();
  assert.doesNotThrow(() => validate(values));

  const updaterPolicy =
    values.guiContract.framework_surfaces.managed_update_plane
      .app_update_state_policy;
  const repairPolicy =
    values.guiContract.framework_surfaces.managed_update_plane
      .repair_availability_policy;
  const policyRef =
    "contracts/app-gui-product-contract.json#framework_surfaces.managed_update_plane.app_update_state_policy";
  const repairPolicyRef =
    "contracts/app-gui-product-contract.json#framework_surfaces.managed_update_plane.repair_availability_policy";
  const webuiFallback =
    "opl app state --profile fast --json#managed_update.components[component_id=opl_app]";

  assert.deepStrictEqual(updaterPolicy.desktop.consumers, [
    "about",
    "maintenance",
    "settings_footer",
  ]);
  assert.equal(updaterPolicy.desktop.mount_check, false);
  assert.deepStrictEqual(updaterPolicy.desktop.status_values, [
    "not_checked",
    "checking",
    "not-available",
    "available",
    "downloading",
    "downloaded",
    "error",
    "cancelled",
  ]);
  assert.deepStrictEqual(updaterPolicy.desktop.attention_states, [
    "available",
    "downloading",
    "downloaded",
    "error",
  ]);
  assert.equal(updaterPolicy.webui.fallback_source, webuiFallback);
  assert.equal(updaterPolicy.attention_accounting.independent, true);
  assert.equal(
    updaterPolicy.attention_accounting.aggregation,
    "runtime_service_attention_count_plus_one_when_app_update_attention_is_true",
  );
  assert.deepStrictEqual(
    values.controlPlane.app_update_state_policy,
    updaterPolicy,
  );
  assert.deepStrictEqual(
    values.productProfile.settings.control_plane.app_update_state_policy,
    updaterPolicy,
  );

  const guiFooter = values.guiContract.settings_navigation.footer_update_entry;
  const matrixFooter =
    values.pageStateMatrix.settings_shell_navigation.footer_update_entry;
  for (const footer of [guiFooter, matrixFooter]) {
    assert.equal(
      footer.availability_source,
      "single_main_process_updater_state_store",
    );
    assert.equal(footer.webui_fallback_source, webuiFallback);
    assert.equal(footer.app_update_state_policy_ref, policyRef);
  }
  assert.equal(
    values.guiContract.pages.settings_environment.app_update_state_policy_ref,
    policyRef,
  );
  assert.equal(
    values.pageStateMatrix.pages.find((page) => page.id === "environment")
      .app_update_state_policy_ref,
    policyRef,
  );

  assert.deepStrictEqual(
    values.controlPlane.managed_update_repair_availability_policy,
    repairPolicy,
  );
  assert.equal(repairPolicy.historical_receipt_role, "diagnostics_only");
  assert.equal(
    repairPolicy.historical_receipt_may_activate_current_repair,
    false,
  );
  assert.equal(
    values.controlPlane.experience_contract.page_contracts.maintenance
      .managed_update_repair_availability_policy_ref,
    repairPolicyRef,
  );

  const managedFooterRegression = contracts();
  managedFooterRegression.guiContract.settings_navigation.footer_update_entry.availability_source =
    "managed_update_plane.components[component_id=opl_app]";
  assert.throws(
    () => validate(managedFooterRegression),
    /Settings footer.*shared desktop updater store/,
  );

  const missingUpdaterState = contracts();
  missingUpdaterState.guiContract.framework_surfaces.managed_update_plane.app_update_state_policy.desktop.status_values =
    ["not_checked", "checking", "not-available", "available"];
  assert.throws(
    () => validate(missingUpdaterState),
    /shared App update state policy/,
  );

  const coupledAttention = contracts();
  coupledAttention.controlPlane.app_update_state_policy.attention_accounting.independent = false;
  assert.throws(() => validate(coupledAttention), /App update state policy/);

  const mountCheck = contracts();
  mountCheck.productProfile.settings.control_plane.app_update_state_policy.desktop.mount_check = true;
  assert.throws(
    () => validate(mountCheck),
    /Product profile App update state policy projection/,
  );

  const historicalReceiptRepair = contracts();
  historicalReceiptRepair.guiContract.framework_surfaces.managed_update_plane.repair_availability_policy.historical_receipt_may_activate_current_repair = true;
  assert.throws(
    () => validate(historicalReceiptRepair),
    /managed-update repair availability policy/,
  );

  const binaryPathFirst = contracts();
  binaryPathFirst.controlPlane.page_adapter_policy.required_pages.environment.managed_dependency_summary.path_identity_precedence =
    ["binary_path", "real_path"];
  assert.throws(() => validate(binaryPathFirst), /managed dependency summary/);
});
test("Settings validator rejects page-state DOM and search-entry drift", () => {
  const values = contracts();
  const overview = values.pageStateMatrix.pages.find(
    (page) => page.id === "settings_general",
  );
  overview.required_dom.always = ["settings-page-overview"];
  assert.throws(() => validate(values), /required DOM/);

  const searchValues = contracts();
  const access = searchValues.pageStateMatrix.pages.find(
    (page) => page.id === "access",
  );
  access.search_entry_ids = ["models.model"];
  assert.throws(() => validate(searchValues), /search entries/);

  const resourceValues = contracts();
  resourceValues.guiContract.pages.settings_resources.action_behavior.dry_run_boundary.role =
    "completion";
  assert.throws(() => validate(resourceValues), /Resources action behavior/);

  const browserValues = contracts();
  browserValues.controlPlane.experience_contract.page_contracts.resources.browser_access_entry.visibility =
    "hidden";
  assert.throws(() => validate(browserValues), /Resources browser entry/);

  const flatFirstViewport = contracts();
  flatFirstViewport.controlPlane.experience_contract.page_contracts.overview.first_viewport_groups =
    [];
  assert.throws(
    () => validate(flatFirstViewport),
    /one to four distinct first-viewport groups/,
  );

  const assistantValues = contracts();
  assistantValues.pageStateMatrix.pages
    .find((page) => page.id === "capabilities")
    .tab_contract.tab_order.push("assistants");
  assert.throws(
    () => validate(assistantValues),
    /Capabilities source-group tab contract/,
  );
});
test("Settings keeps a compact background-task summary while Service Status owns Runway detail", () => {
  const values = contracts();
  assert.doesNotThrow(() => validate(values));

  const guiPages = values.guiContract.pages;
  const experiencePages = values.controlPlane.experience_contract.page_contracts;
  const pageById = (id: string) =>
    values.pageStateMatrix.pages.find((page) => page.id === id);

  const summary = guiPages.settings_general.background_services_summary;
  assert.equal(summary.source, "app_state.settings_control_center.status_summary.runway");
  assert.deepStrictEqual(summary.status_values, ["stopped", "degraded", "running"]);
  assert.equal(summary.component_detail_visibility, "service_status_destination_only");
  assert.deepStrictEqual(experiencePages.overview.background_services_summary, summary);
  assert.deepStrictEqual(pageById("settings_general").background_services_summary, summary);
  const serviceHealth = {
    projection_ref: "contracts/app-runtime-bridge.json#runway_health_projection",
  };
  assert.deepStrictEqual(guiPages.settings_environment.runway_service_health, serviceHealth);
  assert.deepStrictEqual(experiencePages.maintenance.runway_service_health, serviceHealth);
  assert.deepStrictEqual(pageById("environment").runway_service_health, serviceHealth);

  const staleSummary = contracts();
  staleSummary.controlPlane.experience_contract.page_contracts.overview.background_services_summary.source =
    "app_state.provider.legacy";
  assert.throws(() => validate(staleSummary), /Settings Overview background_services_summary/);

  assert.equal(
    guiPages.settings_gateway.opl_gateway_account.disconnect_placement,
    "identity_row_trailing_adjacent_to_display_name_email_and_connection_status",
  );
  assert.equal(
    experiencePages.gateway.gateway_account_surface
      .disconnect_detached_footer_or_page_edge_allowed,
    false,
  );
  assert.equal(
    pageById("gateway").opl_gateway_account.disconnect_placement,
    "identity_row_trailing_adjacent_to_display_name_email_and_connection_status",
  );

  assert.equal(
    guiPages.settings_capabilities.surface_layout_contract
      .nested_card_or_gray_block_allowed,
    false,
  );
  assert.equal(
    experiencePages.resources.layout_policy.nested_card_or_border_wall_allowed,
    false,
  );
  assert.equal(
    pageById("environment").ordinary_layout_policy
      .nested_card_or_border_wall_allowed,
    false,
  );

  const storageVisual = {
    presentation: "text_only_command_buttons",
    leading_or_trailing_decorative_icon: "forbidden",
    icon_only_exception:
      "compact_refresh_or_row_utility_with_accessible_name_and_tooltip",
  };
  assert.deepStrictEqual(experiencePages.storage.action_visual_policy, storageVisual);
  assert.deepStrictEqual(pageById("storage").action_visual_policy, storageVisual);
  assert.deepStrictEqual(guiPages.settings_storage.action_visual_policy, storageVisual);
  const cleanupPreviewInteraction = {
    presentation: 'modal_item_selector_before_confirmation',
    required_summary_fields: [
      'category_total_bytes',
      'candidate_count',
      'candidate_bytes',
      'selected_bytes',
      'retained_bytes',
      'retained_reason',
    ],
    candidate_presentation: {
      selection: 'checkbox_per_candidate_default_selected',
      visible_fields: ['friendly_name', 'bytes', 'localized_reason'],
      raw_path: 'collapsed_technical_detail_only',
    },
    inventory_composition_presentation: {
      source: 'same_inventory_snapshot_as_category_total',
      visible_fields: ['root_friendly_name', 'bytes', 'cleanup_boundary', 'localized_reason'],
      boundary_states: ['covered_by_this_cleanup', 'reported_only_not_cleanable_here'],
      raw_path: 'collapsed_technical_detail_only',
    },
    retained_presentation: 'always_explain_total_minus_candidates_and_why_it_is_not_selectable',
    execution_policy: {
      selection_scope: 'non_empty_subset_of_exact_dry_run_candidates_only',
      empty_selection: 'disabled',
      revalidation: 'full_plan_hash_live_authority_and_selected_subset_membership_before_delete',
    },
  };
  assert.deepStrictEqual(guiPages.settings_storage.cleanup_preview_interaction, cleanupPreviewInteraction);
  assert.deepStrictEqual(pageById("storage").cleanup_preview_interaction, cleanupPreviewInteraction);
  assert.deepStrictEqual(
    experiencePages.storage.surface_rules.cleanup_preview_interaction,
    cleanupPreviewInteraction,
  );
  assert.deepStrictEqual(
    values.productProfile.settings.control_plane.experience_contract.page_contracts.storage
      .surface_rules.cleanup_preview_interaction,
    cleanupPreviewInteraction,
  );
  const storageAvailabilityPresentationVariants = {
    web_statistics_not_connected: {
      condition: 'webui_has_no_valid_owner_storage_projection_and_no_explicit_error',
      severity: 'info',
      title_intent: 'current_web_version_cannot_display_storage_usage',
      required_explanation: [
        'browser_access_context',
        'deployment_not_connected_to_storage_statistics_service',
        'existing_data_and_other_features_unaffected',
      ],
      visible_action: {
        id: 'view_deployment_status',
        route: '/settings/environment?section=services',
      },
      retry_visible: false,
    },
    operational_failure: {
      condition: 'explicit_permission_service_ipc_or_unknown_error',
      severity: 'warning',
      localized_reason_required: true,
      recovery_action_required: true,
      retry_policy: 'show_only_when_action_rechecks_the_failed_source',
      technical_details_default: 'collapsed',
    },
  };
  const storageImplementationTerms = ['desktop storage carrier', 'owner projection', 'carrier host'];
  const storageExperience = values.guiContract.ui_experience_contract.settings_details.storage_unavailable;
  const storageUnavailableInformation = [
    'localized_reason',
    'user_visible_context_and_impact',
    'recovery_action',
  ];
  assert.deepStrictEqual(storageExperience.required_information, storageUnavailableInformation);
  assert.deepStrictEqual(storageExperience.presentation_variants, storageAvailabilityPresentationVariants);
  assert.deepStrictEqual(
    storageExperience.user_visible_implementation_terms_forbidden,
    storageImplementationTerms,
  );
  assert.deepStrictEqual(
    guiPages.settings_storage.unavailable_state.presentation_variants,
    storageAvailabilityPresentationVariants,
  );
  assert.deepStrictEqual(
    guiPages.settings_storage.unavailable_state.required_information,
    storageUnavailableInformation,
  );
  assert.deepStrictEqual(
    pageById("storage").unavailable_state.presentation_variants,
    storageAvailabilityPresentationVariants,
  );
  assert.deepStrictEqual(
    pageById("storage").unavailable_state.required_fields,
    storageUnavailableInformation,
  );
  assert.deepStrictEqual(
    pageById("storage").unavailable_state.user_visible_implementation_terms_forbidden,
    storageImplementationTerms,
  );
  const ownerStorage = guiPages.settings_storage.owner_storage_projections;
  assert.deepStrictEqual(ownerStorage.sections, ['agent_package_store', 'webui_data_volume']);
  assert.equal(ownerStorage.missing_projection_policy, 'fail_open_keep_shell_owned_categories_available');
  assert.deepStrictEqual(ownerStorage.status_presentation_policy, {
    never_observed:
      'not_inventoried_when_observed_at_null_and_inventory_cache_missing_or_invalid_never_out_of_date',
    observed_stale: 'out_of_date_only_when_observed_at_present_and_stale_true',
    not_configured: 'not_configured_without_out_of_date_or_zero_bytes',
    attention_required: 'usage_unavailable_with_localized_reason_never_raw_reason_code',
    unknown_bytes: 'awaiting_inventory_when_never_observed_else_usage_unavailable_never_zero',
  });
  assert.deepStrictEqual(
    pageById("storage").owner_storage_projections.status_presentation_policy,
    ownerStorage.status_presentation_policy,
  );
  assert.equal(ownerStorage.agent_package_store.owner_route, '/settings/agents');
  assert.equal(ownerStorage.agent_package_store.direct_storage_mutation_allowed, false);
  assert.equal(ownerStorage.webui_data_volume.generic_docker_prune_allowed, false);
  assert.equal(ownerStorage.webui_data_volume.shell_direct_path_delete_allowed, false);
  assert.equal(
    ownerStorage.webui_data_volume.host_action_capability_id,
    appOwnedWebuiDataVolumeHostActionCapabilityId,
  );
  assert.equal(
    ownerStorage.webui_data_volume.host_action_abi_ref,
    appOwnedWebuiDataVolumeHostActionAbiRef,
  );
  assert.deepStrictEqual(guiPages.settings_storage.storage_carrier_behavior, appOwnedStorageCarrierBehavior);
  assert.deepStrictEqual(pageById("storage").storage_carrier_behavior, appOwnedStorageCarrierBehavior);
  assert.deepStrictEqual(
    experiencePages.storage.surface_rules.storage_carrier_behavior,
    appOwnedStorageCarrierBehavior,
  );
  assert.deepStrictEqual(
    values.controlPlane.page_adapter_policy.required_pages.storage.storage_carrier_behavior,
    appOwnedStorageCarrierBehavior,
  );
  assert.equal(
    values.controlPlane.product_system_checklist.items.some((entry) => entry.id === 'docker_storage_projection'),
    false,
  );
  assert.equal(
    values.controlPlane.product_system_checklist.items.some((entry) => entry.id === 'owner_storage_projection'),
    true,
  );

  const webuiLocalBridge = contracts();
  webuiLocalBridge.controlPlane.experience_contract.page_contracts.storage.surface_rules
    .storage_carrier_behavior.webui.local_lifecycle_transport = "electron_ipc";
  assert.throws(() => validate(webuiLocalBridge), /Storage surface rules/);

  const pageStateLocalBridge = contracts();
  pageStateLocalBridge.pageStateMatrix.pages.find((page) => page.id === "storage")
    .storage_carrier_behavior.webui.local_lifecycle_transport = "electron_ipc";
  assert.throws(() => validate(pageStateLocalBridge), /Page-state Storage carrier behavior/);

  const adapterLocalBridge = contracts();
  adapterLocalBridge.controlPlane.page_adapter_policy.required_pages.storage
    .storage_carrier_behavior.webui.local_lifecycle_transport = "electron_ipc";
  assert.throws(() => validate(adapterLocalBridge), /adapter carrier behavior/);

  const guiLocalBridge = contracts();
  guiLocalBridge.guiContract.pages.settings_storage.storage_carrier_behavior.webui.local_lifecycle_transport =
    "electron_ipc";
  assert.throws(() => validateGui(guiLocalBridge.guiContract), /Storage carrier behavior/);

  const wrongHostCapability = contracts();
  wrongHostCapability.controlPlane.page_adapter_policy.required_pages.storage.owner_storage_projections
    .webui_data_volume.host_action_capability_id = "shell_owned.storage.cleanup";
  assert.throws(() => validate(wrongHostCapability), /fail-open owner projections/);

  const missingGuiHostAbi = contracts();
  missingGuiHostAbi.guiContract.pages.settings_storage.owner_storage_projections.webui_data_volume
    .host_action_abi_ref = null;
  assert.throws(() => validateGui(missingGuiHostAbi.guiContract), /owner projections/);

  const invalidWebStoragePresentation = contracts();
  invalidWebStoragePresentation.guiContract.pages.settings_storage.unavailable_state.presentation_variants
    .web_statistics_not_connected.retry_visible = true;
  assert.throws(() => validateGui(invalidWebStoragePresentation.guiContract), /availability presentation variants/);

  const componentAudit = values.controlPlane.visual_qa_policy.component_audit;
  assert.deepStrictEqual(componentAudit.required_color_schemes, ["light", "dark"]);
  assert.ok(componentAudit.required_checks.includes("no_nested_card_or_border_wall"));
  assert.equal(
    componentAudit.acceptance,
    "fresh_app_artifact_identity_framework_compatibility_receipt_active_shell_contract_and_installed_16_scene_DOM_pixel_accessibility_review",
  );
});
