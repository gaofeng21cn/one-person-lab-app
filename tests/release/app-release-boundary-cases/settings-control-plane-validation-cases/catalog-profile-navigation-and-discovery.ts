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

test("Settings product profile mirrors the control-plane page adapter claims", () => {
  const values = contracts();

  assert.deepStrictEqual(
    values.productProfile.settings.control_plane.page_adapter_policy,
    values.controlPlane.page_adapter_policy,
  );

  values.productProfile.settings.control_plane.page_adapter_policy.required_pages.gateway.renderer_entry =
    "packages/desktop/src/renderer/pages/settings/sections/GatewaySettings.tsx";
  assert.throws(
    () => validate(values),
    /Product profile Settings page adapter policy projection/,
  );
});
test("Settings optional resource groups stay owner-projected and absent by default", () => {
  const values = contracts();
  const fastFixture = readJson(
    "contracts/fixtures/opl-app-state-fast.fixture.json",
  );
  const runtimeBridge = readJson("contracts/app-runtime-bridge.json");

  assert.doesNotThrow(() => validate(values));
  assert.deepStrictEqual(
    fastFixture.app_state.settings_control_center.app_settings_read_model
      .resource_sources,
    {},
  );
  assert.equal(
    runtimeBridge.task_awareness_projection.resource_context_policy.app_role,
    "display_only_resource_context_consumer",
  );
  assert.ok(
    runtimeBridge.task_awareness_projection.resource_context_policy.optional_ref_fields.includes(
      "resource_source_refs",
    ),
  );

  const legacyLiteral = contracts();
  legacyLiteral.controlPlane.experience_contract.page_contracts.resources.primary_information.push(
    "OPL Workspace",
  );
  assert.throws(
    () => validate(legacyLiteral),
    /must not hard-require optional platform literal OPL Workspace/,
  );

  const emptyPlaceholder = contracts();
  emptyPlaceholder.guiContract.pages.settings_resources.external_resource_projection_policy.empty_projection_policy =
    "render_empty_placeholder";
  assert.throws(
    () => validate(emptyPlaceholder),
    /optional resource projection policy/,
  );

  const unconditionalGroup = contracts();
  unconditionalGroup.controlPlane.experience_contract.page_contracts.resources.conditional_groups =
    [];
  assert.throws(
    () => validate(unconditionalGroup),
    /conditional groups/,
  );
});
test("Settings exposes seven primary groups over ten stable carrier pages with bottom About", () => {
  const values = contracts();

  assert.doesNotThrow(() => validate(values));
  assert.deepStrictEqual(
    values.controlPlane.ordinary_routes.map((route) => route.product_page_id),
    [
      "overview",
      "gateway",
      "models",
      "workspace",
      "agents",
      "capabilities",
      "resources",
      "maintenance",
      "storage",
      "preferences",
    ],
  );
  assert.deepStrictEqual(
    values.controlPlane.ordinary_routes.map((route) => route.default_label_zh),
    [
      "概览",
      "账户与访问",
      "模型",
      "工作区",
      "智能体",
      "能力",
      "资源与连接",
      "维护",
      "数据与存储",
      "偏好",
    ],
  );
  const navigation = values.controlPlane.user_navigation_projection;
  assert.deepStrictEqual(navigation.primary_group_order, [
    "overview",
    "account_models",
    "connections_deployment",
    "workspace",
    "agents_capabilities",
    "runtime_maintenance",
    "preferences",
  ]);
  assert.deepStrictEqual(
    navigation.destinations.map((entry) => entry.id),
    [
      "overview_status",
      "account_access",
      "models",
      "resources_connections",
      "working_directory",
      "data_storage",
      "agents",
      "capabilities",
      "instructions_context",
      "runtime_services",
      "updates_repairs",
      "logs_diagnostics",
      "preferences",
    ],
  );
  assert.deepStrictEqual(
    values.controlPlane.ordinary_routes.map((route) => route.ia_group),
    [
      "overview",
      "account_models",
      "account_models",
      "workspace",
      "agents_capabilities",
      "agents_capabilities",
      "connections_deployment",
      "runtime_maintenance",
      "workspace",
      "preferences",
    ],
  );
  assert.equal(
    navigation.responsive_navigation.mobile_horizontal_tab_strip_allowed,
    false,
  );
  assert.equal(navigation.auxiliary_entries[0].placement, "sidebar_bottom");
  assert.equal(
    navigation.footer_policy.duplicate_settings_entry,
    "forbidden_inside_settings",
  );
  assert.deepStrictEqual(
    values.productProfile.settings.control_plane.user_navigation_projection,
    navigation,
  );
  assert.deepStrictEqual(
    values.controlPlane.secondary_pages.map((page) => page.id),
    ["about"],
  );
  assert.deepStrictEqual(
    Object.fromEntries(
      Object.entries(values.controlPlane.compatibility_redirects).map(
        ([id, redirect]) => [
          id,
          `${redirect.target_route_id}#${redirect.anchor}`,
        ],
      ),
    ),
    {
      update: "environment#updates",
      theme: "appearance#themes",
      "local-services": "environment#services",
      personalization: "workspace#personalization",
    },
  );
  assert.equal(values.controlPlane.legacy_route_redirects.about, undefined);
  assert.equal(
    values.controlPlane.legacy_route_redirects.advanced,
    "environment#diagnostics",
  );
  assert.equal(
    values.controlPlane.legacy_route_redirects.assistants,
    "capabilities#third-party",
  );
  assert.equal(
    values.guiContract.settings_navigation.settings_ia.protocols.deep_link_policy
      .unknown_route_policy,
    "redirect_to_overview_default_route",
  );
  assert.deepStrictEqual(values.controlPlane.user_question_information_architecture, {
    schema: "opl_settings_user_question_information_architecture.v1",
    owner: "one-person-lab-app",
    primary_group_title_instance_count: 1,
    multiple_destination_navigation: "single_tab_list",
    repeated_heading_layers: [
      "group_label",
      "eyebrow",
      "page_h1",
      "active_tab_label",
    ],
    same_title_may_repeat_across_heading_layers: false,
    single_destination_tab_list_allowed: false,
    concatenated_destination_page_allowed: false,
    responsive_semantics_must_match: true,
    runtime_extension: false,
    presentation: {
      baseline: "pinned_DSH_settings_shell_and_theme_tokens",
      header: "single_destination_title_with_optional_trailing_quiet_refresh",
      subnavigation: "separate_compact_row_only_for_multiple_destinations",
      description: "one_user_task_sentence_without_owner_or_projection_jargon",
      local_preferences: "usable_without_Framework_readback_and_no_global_refresh",
      capability_catalog: "installed_and_actionable_items_first;_upstream_adoption_details_collapsed_and_excluded_from_count",
      refresh_scope: "one_page_refresh_rereads_visible_sources;_account_usage_and_inventory_actions_keep_explicit_names",
      functional_destinations: "instructions_first;_memory_and_scheduled_tasks_separate_with_contextual_links",
      readiness: "explicit_component_readiness_precedes_aggregate;_missing_agent_route_explained_separately_from_callability",
      catalog_counts: "count_source_records_per_type_never_sum_as_independent_capabilities;_product_modules_first",
      search: "bilingual_setting_labels_and_dynamic_plugin_titles;_open_and_focus_matching_disclosures",
      unknown_storage: "unknown_total_or_reclaimable_remains_unknown;_never_subtract_from_synthetic_zero",
      permissions: "effective_agentPermissions_shared_with_composer;_unused_confirmBeforeExecute_not_presented_as_enforced",
      build_identity: "local_identity_and_disabled_updater_policy_before_release_channel;_no_unsupported_update_action",
    },
  });
  assert.deepStrictEqual(
    values.controlPlane.aionui_custom_assistant_boundary,
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
  );

  const tenVisibleGroups = contracts();
  tenVisibleGroups.controlPlane.user_navigation_projection.primary_group_order =
    tenVisibleGroups.controlPlane.ordinary_routes.map((route) => route.ia_group);
  assert.throws(() => validate(tenVisibleGroups), /primary group order/);

  const horizontalMobileTabs = contracts();
  horizontalMobileTabs.controlPlane.user_navigation_projection.responsive_navigation.mobile_horizontal_tab_strip_allowed =
    true;
  assert.throws(() => validate(horizontalMobileTabs), /responsive_navigation/);

  const workspaceOwnsContext = contracts();
  workspaceOwnsContext.controlPlane.user_navigation_projection.secondary_owner_bindings[0].user_destination_id =
    "working_directory";
  assert.throws(() => validate(workspaceOwnsContext), /secondary owner bindings/);
});

test("Settings validator keeps generic projected Package actions on Agents", () => {
  const values = contracts();
  assert.doesNotThrow(() => validate(values));
  assert.doesNotThrow(() => validateGui(values.guiContract));
  assert.equal(
    values.guiContract.interaction_baseline.capability_selection
      .management_surface,
    "settings_agents",
  );

  const staleProfileRef = contracts();
  staleProfileRef.controlPlane.page_adapter_policy.required_pages.agents
    .directory_projection_surface.settings_action_scope = "shell_owned_lifecycle_actions";
  assert.throws(
    () => validate(staleProfileRef),
    /execute only complete Framework-projected Settings actions/,
  );

  const packageManagementOnCapabilities = contracts();
  packageManagementOnCapabilities.guiContract.interaction_baseline.capability_selection.management_surface =
    "settings_capabilities";
  assert.throws(
    () => validate(packageManagementOnCapabilities),
    /Settings Agents must own Agent package and Home shortcut management/,
  );

  const missingPresenceAxis = contracts();
  const agentsStatusModel =
    missingPresenceAxis.controlPlane.page_adapter_policy.required_pages.agents
      .directory_projection_surface.status_model;
  agentsStatusModel.axes = agentsStatusModel.axes.filter(
    (axis) => axis !== "presence",
  );
  assert.throws(
    () => validate(missingPresenceAxis),
    /Settings Agents status axes/,
  );
});

test("Settings binds the five current standard Agents to the Official Profile without a second runtime registry", () => {
  const values = contracts();
  const ownership = values.controlPlane.agents_capabilities_ownership;
  const baseline =
    ownership.agents.official_installation_baseline;
  const currentStandardAgentIds = ["mag", "mas", "obf", "oma", "rca"];

  assert.equal(baseline.requirement_owner, "one-person-lab-app");
  assert.equal(baseline.runtime_status_owner, "one-person-lab");
  assert.equal(
    baseline.desired_roots_source_ref,
    "contracts/app-product-profile.json#official_profile.desired_root_package_ids",
  );
  assert.equal(
    baseline.standard_agent_membership_source_ref,
    "opl app state --profile fast --json#app_state.agent_packages.directory.entries",
  );
  assert.equal(baseline.current_profile_required_standard_agent_count, 5);
  assert.equal(baseline.app_owned_runtime_registry_allowed, false);
  assert.deepStrictEqual(baseline.required_state_axes, [
    "discoverable",
    "installed",
    "enabled",
    "callable",
    "launchable",
  ]);
  assert.deepStrictEqual(
    Object.keys(baseline.state_axis_sources),
    baseline.required_state_axes,
  );
  for (const packageId of currentStandardAgentIds) {
    assert.ok(
      values.productProfile.official_profile.desired_root_package_ids.includes(packageId),
      `${packageId} must remain a current Official Profile root`,
    );
  }
  assert.equal(
    baseline.settings_presentation_policy.axes_must_remain_separate,
    true,
  );
  assert.equal(baseline.settings_presentation_policy.missing_required_root_discoverable, false);
  assert.equal(
    baseline.settings_presentation_policy.missing_required_root_other_axes,
    "unavailable_or_unknown",
  );
  assert.equal(baseline.settings_presentation_policy.synthetic_directory_row_allowed, false);
  assert.equal(baseline.settings_presentation_policy.synthetic_action_allowed, false);
  assert.equal(
    baseline.settings_presentation_policy.directory_row_policy,
    "render manageable rows only from Framework directory entries",
  );
  assert.equal(baseline.shared_consumer_projection_policy.source_owner, "one-person-lab");
  assert.equal(baseline.shared_consumer_projection_policy.identity_key, "package_id");
  for (const field of [
    "directory_statistics_source_axes",
    "directory_row_status_source_axes",
    "new_task_selectability_required_axes",
  ]) {
    assert.deepStrictEqual(
      baseline.shared_consumer_projection_policy[field],
      baseline.required_state_axes,
    );
  }
  assert.equal(
    baseline.shared_consumer_projection_policy
      .new_task_selectability_requires_projected_codex_shortcut,
    true,
  );
  assert.equal(
    baseline.shared_consumer_projection_policy.independent_shell_fallback_allowed,
    false,
  );
  assert.equal(
    ownership.agents.must_not_own.includes(
      "standard_agent_runtime_registry_or_status_truth",
    ),
    true,
  );
  assert.deepStrictEqual(ownership.agents.visible_package_roles, [
    "standard_agent",
    "workflow_profile",
  ]);
  assert.equal(
    ownership.agents.catalog_partition_policy.app_owned_package_id_allowlist_allowed,
    false,
  );
  assert.deepStrictEqual(ownership.capabilities.entity_kinds.slice(0, 4), [
    "capability_package",
    "skill",
    "plugin",
    "mcp_server",
  ]);
  assert.equal(
    ownership.capabilities.entity_kinds.includes("connection_application"),
    true,
  );
});

test("Settings treats unavailable Storage statistics as neutral and never fabricates refresh success", () => {
  const values = contracts();
  const storage = values.controlPlane.neutral_information_state_policy.storage_inventory;

  assert.deepStrictEqual(storage.neutral_states, [
    "not_inventoried",
    "current_carrier_does_not_provide_statistics",
  ]);
  assert.equal(storage.attention_allowed, false);
  assert.equal(storage.unknown_bytes_policy, "unavailable_never_zero");
  assert.equal(storage.refresh_requires_owner_projected_executable_action, true);
  assert.equal(storage.refresh_requires_mutable_fresh_readback, true);
  assert.equal(storage.success_requires_changed_inventory_identity_or_observed_at, true);
  assert.equal(storage.static_reread_can_report_success, false);
  assert.equal(storage.absent_action_can_report_success, false);
  assert.equal(storage.unchanged_unavailable_state_can_report_success, false);
});

test("Settings exposes Official Profile restore only as an explicit App-owned secondary action", () => {
  const values = contracts();
  const agentsPage = values.pageStateMatrix.pages.find((page) => page.id === "agents");

  assert.deepStrictEqual(
    values.guiContract.pages.settings_agents.official_profile_restore_action,
    appOwnedOfficialProfileRestoreAction,
  );
  assert.deepStrictEqual(
    values.controlPlane.experience_contract.page_contracts.agents.official_profile_restore_action,
    appOwnedOfficialProfileRestoreAction,
  );
  assert.deepStrictEqual(
    agentsPage.official_profile_restore_action,
    appOwnedOfficialProfileRestoreAction,
  );
  assert.ok(
    agentsPage.required_dom.always.includes("settings-agents-restore-official-profile"),
  );
  assert.ok(
    values.controlPlane.experience_contract.page_contracts.agents.surface_inventory.action.some(
      (entry) => entry.id === "official_profile_restore" && entry.owner === "agents",
    ),
  );
  assert.doesNotThrow(() => validateGui(values.guiContract));
  assert.doesNotThrow(() =>
    validatePageStateMatrix(
      values.pageStateMatrix,
      values.adapterContract,
      values.guiContract,
    ),
  );

  const automaticReapply = contracts();
  automaticReapply.guiContract.pages.settings_agents.official_profile_restore_action
    .automatic_invocation.daily_maintenance = true;
  assert.throws(
    () => validateGui(automaticReapply.guiContract),
    /Official Profile restore action/,
  );

  const firstInstallFromSettings = contracts();
  firstInstallFromSettings.pageStateMatrix.pages.find((page) => page.id === "agents")
    .official_profile_restore_action.request.payload.intent = "first_install";
  assert.throws(
    () =>
      validatePageStateMatrix(
        firstInstallFromSettings.pageStateMatrix,
        firstInstallFromSettings.adapterContract,
        firstInstallFromSettings.guiContract,
      ),
    /Official Profile restore action/,
  );
});

test("Settings Agents treats the canonical directory as discovery truth and exposes the complete ordinary-user catalog path", () => {
  const values = contracts();
  const fastFixture = readJson("contracts/fixtures/opl-app-state-fast.fixture.json");
  assert.doesNotThrow(() => validate(values));

  const lifecycle =
    values.guiContract.pages.settings_agents.agent_package_lifecycle_ux;
  assert.equal(
    lifecycle.directory_collection_contract.source,
    "app_state.agent_packages.directory.entries",
  );
  assert.deepStrictEqual(lifecycle.directory_collection_contract.required_entry_fields, [
    "package_id",
    "display_name",
    "publisher",
    "description",
    "tags",
    "package_role",
    "role_state",
    "trust_tier",
    "source_explanation",
    "manifest_url",
    "selected_version",
    "stable_version",
    "installed_version",
    "installed",
    "activated",
    "installability",
    "readiness",
    "exposure",
    "recommended_action",
    "recommended_action_ref",
    "available_actions",
    "authority_boundary",
  ]);
  assert.deepStrictEqual(lifecycle.canonical_action_contract.source_fields, [
    "directory.entries[].available_actions[]",
    "directory.entries[].recommended_action_ref",
  ]);
  assert.deepStrictEqual(lifecycle.canonical_action_contract.required_action_fields, [
    "action_id",
    "action_ref",
    "semantic",
    "surface",
    "payload",
    "required_payload_fields",
    "confirmation_required",
  ]);
  assert.equal(
    lifecycle.canonical_action_contract.action_ref_policy,
    "action_ref must equal app_state.actions#${action_id}",
  );
  const catalogEntry = fastFixture.app_state.agent_packages.directory.entries.find(
    (entry) => entry.package_id === "obf",
  );
  assert.deepStrictEqual(catalogEntry?.recommended_action_ref, {
    action_id: "agent_package_install",
    action_ref: "app_state.actions#agent_package_install",
    semantic: "install",
    surface: "settings",
    payload: { package_id: "obf" },
    required_payload_fields: ["package_id"],
    confirmation_required: true,
  });
  assert.deepStrictEqual(catalogEntry?.available_actions, [catalogEntry.recommended_action_ref]);
  assert.equal(
    catalogEntry?.available_actions.some(
      (action) => action.action_id === "install_from_manifest_url",
    ),
    false,
  );
  assert.deepStrictEqual(lifecycle.manual_agent_install_entry, {
    source: "app_state.actions[action_id=install_from_manifest_url]",
    destination: "settings.agents.catalog",
    visibility_policy:
      "show_only_when_the_current_App_action_declares_manifest_url_and_trust_tier_with_dry_run_and_confirmation",
    input_fields: ["manifest_url", "trust_tier"],
    trust_tier_policy: "user_explicit_third_party_unverified_or_third_party_verified",
    execution_policy: "submit_the_current_projected_App_action_then_refresh_fast_state",
    directory_policy: "this_is_a_manual_entry_point_not_a_directory_row_or_static_package_registry",
    lifecycle_authority: "configured_native_carrier_readback_only",
  });
  assert.equal(
    lifecycle.canonical_action_contract.required_payload_alternative_policy,
    "a required_payload_fields item containing ' or ' is satisfied when at least one named payload field is present",
  );
  assert.equal(
    lifecycle.canonical_action_contract.recommended_action_id_field,
    "directory.entries[].recommended_action",
  );
  assert.deepStrictEqual(lifecycle.readiness_profile_policy.fast_activated, {
    status: "verification_deferred",
    operational_ready: false,
    launch_allowed: false,
    verification_deferred: true,
    reason: "live_verification_deferred",
    session_launch_disposition: "conversation_available_without_shell_activation",
  });
  assert.deepStrictEqual(lifecycle.readiness_profile_policy.full_verified, {
    status: "ready",
    operational_ready: true,
    launch_allowed: true,
    verification_deferred: false,
    reason: null,
    session_launch_disposition: "ready",
  });
  assert.equal(lifecycle.user_facing_status_projection.schema, "agent_package_user_status_projection.v3");
  assert.equal(lifecycle.user_facing_status_projection.per_package_identity_key, "package_id");
  assert.equal(
    lifecycle.user_facing_status_projection.aggregate_status_policy,
    "count_only_standard_agent_direct_conversation_availability_and_never_override_each_projected_package_status",
  );
  assert.deepStrictEqual(lifecycle.user_facing_status_projection.aggregate_projection, {
    schema: "agent_package_standard_agent_direct_entry_aggregate.v1",
    population: "directory_entries_where_package_role_standard_agent",
    available_numerator: "population_entries_projected_as_available_with_direct_conversation_entry",
    excluded_package_roles: ["workflow_profile", "capability_package"],
    label_i18n: {
      "zh-CN": "专业智能体可直接对话：{available} / {total}",
      "en-US": "Professional agents ready for conversation: {available} / {total}",
    },
    empty_policy: "show_zero_of_zero_without_substituting_all_directory_entries",
  });
  assert.deepStrictEqual(lifecycle.ordinary_user_status_input_mapping.precedence.slice(0, 3), [
    "temporarily_unavailable",
    "disabled",
    "supporting_without_direct_entry",
  ]);
  assert.equal(
    lifecycle.ordinary_user_status_input_mapping.signals.disabled,
    "installed_true_and_configured_carrier_disabled_with_complete_recommended_action_ref_semantic_enable",
  );
  assert.equal(
    lifecycle.ordinary_user_status_input_mapping.signals.supporting_without_direct_entry,
    "package_role_capability_package_and_operational_ready_true_and_codex_visibility_not_visible",
  );
  assert.equal(
    lifecycle.ordinary_user_status_input_mapping.signals.available_auto_confirm,
    "readiness_status_verification_deferred_or_reason_live_verification_deferred_or_scope_materialization_missing_with_package_installed_and_exposed",
  );
  assert.equal(
    lifecycle.ordinary_user_status_input_mapping.status_index_repair_action_role,
    "technical_diagnostics_only_never_ordinary_status_or_action_selection",
  );
  const available = lifecycle.user_facing_status_projection.rules.find(
    (rule: any) => rule.id === "available_auto_confirm",
  );
  assert.equal(available.label_i18n["zh-CN"], "可用");
  assert.match(available.explanation_i18n["zh-CN"], /已安装，可直接发起对话，无需提前设置/);
  assert.equal(available.primary_action_policy, "none");
  const disabled = lifecycle.user_facing_status_projection.rules.find(
    (rule: any) => rule.id === "disabled",
  );
  assert.equal(disabled.label_i18n["zh-CN"], "已停用");
  assert.match(disabled.explanation_i18n["zh-CN"], /已安装，但当前已停用/);
  assert.match(disabled.primary_action_policy, /semantic_enable/);
  const supporting = lifecycle.user_facing_status_projection.rules.find(
    (rule: any) => rule.id === "supporting_without_direct_entry",
  );
  assert.equal(supporting.label_i18n["zh-CN"], "可用");
  assert.equal(supporting.explanation_i18n["zh-CN"], "作为配套能力使用，无独立对话入口。");
  const projectedAction = lifecycle.user_facing_status_projection.rules.find(
    (rule: any) => rule.id === "owner_projected_action_available",
  );
  assert.equal(projectedAction.label_i18n["zh-CN"], "可继续处理");
  assert.equal(
    projectedAction.primary_action_policy,
    "show_the_complete_recommended_action_ref_without_mapping_or_branching_on_action_id",
  );
  assert.equal(
    JSON.stringify(lifecycle.user_facing_status_projection).includes("install_from_manifest_url"),
    false,
  );
  const unlocalized = lifecycle.user_facing_status_projection.rules.find(
    (rule: any) => rule.id === "unlocalized_owner_attention",
  );
  assert.equal(unlocalized.label_i18n["zh-CN"], "需要处理");
  assert.equal(unlocalized.primary_action_policy, "open_details_only_without_a_generic_setup_or_action_label");
  assert.ok(lifecycle.user_facing_status_projection.forbidden_ordinary_labels_zh.includes("待验证"));
  assert.ok(lifecycle.user_facing_status_projection.forbidden_ordinary_labels_zh.includes("需关注"));
  assert.ok(lifecycle.user_facing_status_projection.forbidden_ordinary_labels_zh.includes("需要操作"));
  assert.deepStrictEqual(lifecycle.directory_controls.filters, [
    "package_role",
    "availability_status",
    "source",
  ]);
  assert.equal(lifecycle.directory_controls.catalog_search_is_settings_global_search, false);
  assert.ok(lifecycle.directory_controls.top_controls.includes("reload_dynamic_directory"));
  assert.equal(lifecycle.directory_controls.top_controls.includes("refresh_registry"), false);
  assert.equal(
    lifecycle.directory_controls.row_actions_source,
    "directory.entries[].available_actions[]",
  );
  assert.equal(Object.hasOwn(lifecycle.directory_controls, "row_actions"), false);
  assert.equal(Object.hasOwn(lifecycle, "advanced_manifest_install_contract"), false);
  assert.equal(lifecycle.consistent_action_interaction.action_id_allowlist_allowed, false);
  assert.equal(
    lifecycle.consistent_action_interaction.semantic_source,
    "directory.entries[].available_actions[].semantic",
  );
  assert.equal(
    lifecycle.consistent_action_interaction.surface_policy,
    "execute only complete actions projected for the settings surface",
  );
  assert.equal(lifecycle.package_projection_contract.schema, "opl_app_package_consumer_projection.v1");
  assert.ok(lifecycle.package_projection_contract.forbidden_private_fields.includes("package_lock_ref"));
  assert.ok(lifecycle.package_projection_contract.forbidden_private_fields.includes("lifecycle_receipt_ref"));
  assert.deepStrictEqual(lifecycle.exposure_state_contract.state_fields, ["enabled", "visibility"]);

  const directory =
    values.controlPlane.page_adapter_policy.required_pages.agents
      .directory_projection_surface;
  assert.equal(directory.directory_collection_source, "app_state.agent_packages.directory.entries");
  assert.equal(
    directory.display_metadata_source,
    "app_state.agent_packages.directory.entries",
  );
  assert.equal(Object.hasOwn(directory, "static_metadata_overlay_source"), false);
  assert.equal(Object.hasOwn(directory, "static_metadata_overlay_fields"), false);
  assert.equal(
    Object.hasOwn(values.productProfile.gui.agent_package_registry, "starter_package_metadata"),
    false,
  );
  assert.equal(
    directory.display_metadata_policy,
    "use owner-projected display metadata with a package-id fallback; App profile metadata must not define catalog membership, ordering, status, readiness, or actions",
  );
  assert.equal(
    values.productProfile.gui.agent_package_registry.directory_projection_authority,
    "app_state.agent_packages.directory.entries",
  );
  assert.equal(directory.settings_action_scope, "owner_projected_settings_actions_only");
  assert.equal(directory.settings_action_inference_allowed, false);
  assert.equal(Object.hasOwn(directory, "stage_runtime_activation_contract_ref"), false);
  assert.equal(Object.hasOwn(directory, "settings_activation_execution_allowed"), false);
  assert.equal(Object.hasOwn(directory, "stage_runtime_activation_owner"), false);

  const collectionRegression = contracts();
  collectionRegression.guiContract.pages.settings_agents.agent_package_lifecycle_ux
    .directory_collection_contract.source = "professional_agent_packages";
  assert.throws(() => validateGui(collectionRegression.guiContract), /directory entry fields|collection truth|lifecycle UX/);

  const fallbackRegression = contracts();
  fallbackRegression.guiContract.pages.settings_agents.agent_package_lifecycle_ux
    .fallback_state_surface = "app_state.modules.items[]";
  assert.throws(
    () => validateGui(fallbackRegression.guiContract),
    /must not restore private Package fallback/,
  );

  const incompleteActionRegression = contracts();
  incompleteActionRegression.guiContract.pages.settings_agents.agent_package_lifecycle_ux
    .canonical_action_contract.required_action_fields = ["action_id", "action_ref", "payload"];
  assert.throws(() => validateGui(incompleteActionRegression.guiContract), /projected action fields/);

  const globalSearchRegression = contracts();
  globalSearchRegression.guiContract.pages.settings_agents.agent_package_lifecycle_ux
    .directory_controls.catalog_search_is_settings_global_search = true;
  assert.throws(() => validateGui(globalSearchRegression.guiContract), /catalog search|lifecycle UX/);

  const privateActivationRegression = contracts();
  privateActivationRegression.controlPlane.page_adapter_policy.required_pages.agents
    .directory_projection_surface.stage_runtime_activation_contract_ref = "private-action-contract";
  assert.throws(
    () => validate(privateActivationRegression),
    /must not restore private activation field/,
  );

  const inferredPageStatePayloadRegression = contracts();
  const agentsPage = inferredPageStatePayloadRegression.pageStateMatrix.pages.find(
    (page) => page.id === "agents",
  );
  agentsPage.must_show = agentsPage.must_show.filter(
    (item) => !item.includes("Settings executes only actions projected for the Settings surface"),
  );
  assert.throws(
    () => validatePageStateMatrix(
      inferredPageStatePayloadRegression.pageStateMatrix,
      inferredPageStatePayloadRegression.adapterContract,
      inferredPageStatePayloadRegression.guiContract,
    ),
    /agents must_show must include Settings executes only actions projected for the Settings surface/,
  );

});
