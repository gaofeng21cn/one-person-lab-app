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

test("GUI contract assigns one visible Files panel toggle owner per viewport state", () => {
  const values = contracts();
  const expectedOwnership = {
    visible_toggle_count_per_viewport_state: 1,
    collapsed_owner: "conversation_header",
    expanded_owner: "workspace_panel_header",
    global_titlebar_duplicate_allowed: false,
    floating_handle_duplicate_allowed: false,
  };

  assert.deepStrictEqual(
    values.guiContract.right_context_inspector.toggle_ownership,
    expectedOwnership,
  );
  assert.deepStrictEqual(
    values.guiContract.interaction_baseline.context_surfaces.side_panel
      .toggle_ownership,
    expectedOwnership,
  );
  assert.doesNotThrow(() => validateGui(values.guiContract));

  const duplicateGlobalToggle = contracts();
  duplicateGlobalToggle.guiContract.right_context_inspector.toggle_ownership
    .global_titlebar_duplicate_allowed = true;
  assert.throws(
    () => validateGui(duplicateGlobalToggle.guiContract),
    /advanced workspace surface policy/,
  );

  const mismatchedInteractionOwner = contracts();
  mismatchedInteractionOwner.guiContract.interaction_baseline.context_surfaces
    .side_panel.toggle_ownership.expanded_owner = "floating_handle";
  assert.throws(
    () => validateGui(mismatchedInteractionOwner.guiContract),
    /side-panel toggle ownership/,
  );
});
test("Settings Capabilities owns local MCP, image, and voice controls without Preferences duplication", () => {
  const values = contracts();
  assert.doesNotThrow(() => validate(values));
  assert.doesNotThrow(() => validateGui(values.guiContract));
  assert.deepStrictEqual(values.guiContract.pages.settings_capabilities.entity_kinds, [
    "capability_package",
    "skill",
    "plugin",
    "mcp_server",
    "connection_application",
    "image_generation",
    "voice_input",
  ]);
  assert.ok(
    values.pageStateMatrix.pages.find((page) => page.id === "capabilities")
      .required_dom.conditional.some((entry) => entry.testid === "settings-capabilities-voice-input" && entry.when === "image_voice_tab_active"),
  );
  assert.equal(
    values.controlPlane.experience_contract.page_contracts.preferences.surface_rules
      .voice_input_configuration_allowed,
    false,
  );

  const missingVoiceDom = contracts();
  const capabilitiesPage = missingVoiceDom.pageStateMatrix.pages.find(
    (page) => page.id === "capabilities",
  );
  capabilitiesPage.required_dom.conditional = capabilitiesPage.required_dom.conditional.filter(
    (entry) => entry.testid !== "settings-capabilities-voice-input",
  );
  assert.throws(() => validate(missingVoiceDom), /capabilities required DOM|Capabilities page must own local MCP, image, and voice/i);

  const preferencesVoiceOwner = contracts();
  preferencesVoiceOwner.controlPlane.experience_contract.page_contracts.preferences
    .surface_rules.voice_input_configuration_allowed = true;
  assert.throws(() => validate(preferencesVoiceOwner), /Settings Preferences surface rules/);
});
test("Settings validator rejects secondary-page and compatibility-route regressions", () => {
  const secondaryRegression = contracts();
  secondaryRegression.controlPlane.secondary_pages.push({
    id: "update",
    path: "/settings/update",
    ia_group: "maintenance",
    slot_id: "update",
    visibility: "secondary_or_deep_link",
  });
  assert.throws(() => validate(secondaryRegression), /secondary page ids/);

  const aboutRegression = contracts();
  aboutRegression.controlPlane.legacy_route_redirects.about = "advanced";
  assert.throws(
    () => validate(aboutRegression),
    /legacy redirects|independent \/settings\/about/,
  );

  const anchorRegression = contracts();
  anchorRegression.controlPlane.compatibility_redirects.theme.anchor = "theme";
  assert.throws(() => validate(anchorRegression), /compatibility redirects/);

  const assistantsRegression = contracts();
  assistantsRegression.controlPlane.legacy_route_redirects.assistants =
    "capabilities?tab=assistants#custom-assistants";
  assert.throws(
    () => validate(assistantsRegression),
    /legacy redirects|legacy assistants/,
  );

  const destructiveAssistantCleanup = contracts();
  destructiveAssistantCleanup.controlPlane.aionui_custom_assistant_boundary.underlying_user_data_deletion_policy =
    "delete_when_entry_hidden";
  assert.throws(
    () => validate(destructiveAssistantCleanup),
    /custom-assistant product and data boundary/,
  );
});

test("Settings hides unclassified extension entries without deleting extension data", () => {
  const values = contracts();

  assert.doesNotThrow(() => validate(values));
  assert.equal(
    values.controlPlane.extension_tab_policy.default_visibility,
    "hidden_until_app_classified",
  );
  assert.deepStrictEqual(
    values.controlPlane.extension_tab_policy.mount_allowlist,
    [],
  );
  assert.equal(
    values.controlPlane.extension_tab_policy.extension_data_deletion_policy,
    "never_delete_extension_data_when_hiding_or_redirecting_an_entry",
  );

  const legacyUnknownFallback = contracts();
  legacyUnknownFallback.controlPlane.extension_tab_policy.unknown_anchor =
    "treat_as_unanchored";
  assert.throws(
    () => validate(legacyUnknownFallback),
    /hide unclassified extension entries/,
  );

  const destructiveHide = contracts();
  destructiveHide.controlPlane.extension_tab_policy.extension_data_deletion_policy =
    "delete_hidden_extension_data";
  assert.throws(
    () => validate(destructiveHide),
    /preserve their data/,
  );
});

test("Settings validator rejects duplicate search, missing bilingual index data, and invalid anchors", () => {
  const duplicateSearch = contracts();
  duplicateSearch.controlPlane.experience_contract.global_search.global_entry_count = 2;
  assert.throws(() => validate(duplicateSearch), /one bilingual item-level/);

  const keyboardSearch = contracts();
  keyboardSearch.controlPlane.experience_contract.global_search.keyboard_activation_policy =
    "pointer_only";
  assert.throws(() => validate(keyboardSearch), /one bilingual item-level/);

  const missingEnglish = contracts();
  missingEnglish.controlPlane.experience_contract.search_index.entries[0].keywords_en =
    [];
  assert.throws(
    () => validate(missingEnglish),
    /indexed in Chinese and English/,
  );

  const invalidAnchor = contracts();
  invalidAnchor.controlPlane.experience_contract.search_index.entries[0].anchor =
    "missing-anchor";
  assert.throws(() => validate(invalidAnchor), /declared page anchor/);

  const changedAnchorContract = contracts();
  changedAnchorContract.controlPlane.experience_contract.page_contracts.models.required_anchors =
    ["provider-source", "model"];
  assert.throws(
    () => validate(changedAnchorContract),
    /models anchors|existing page anchor/i,
  );
});

test("Settings validator preserves workspace truth precedence and single-flight actions", () => {
  const workspaceTruth = contracts();
  workspaceTruth.controlPlane.experience_contract.page_contracts.workspace.readiness_precedence =
    "executor_mode_overrides_filesystem";
  assert.throws(
    () => validate(workspaceTruth),
    /filesystem writability and health/,
  );

  const concurrentActions = contracts();
  concurrentActions.controlPlane.state_action_policy.request_exclusivity_policy =
    "parallel_actions_allowed";
  assert.throws(() => validate(concurrentActions), /single-flight/);
});

test("Settings configuration catalog projection preserves owner, page, persistence, and secret boundaries", () => {
  const values = contracts();
  const projection =
    values.controlPlane.configuration_catalog_projection;

  assert.doesNotThrow(() => validate(values));
  assert.deepStrictEqual(projection.owner_classes, [
    "framework",
    "app_local",
    "credential_connection",
  ]);
  assert.equal(
    projection.items.some(
      (item) => item.configuration_id === "resource_connections",
    ),
    true,
  );
  assert.deepStrictEqual(
    values.productProfile.settings.control_plane
      .configuration_catalog_projection,
    projection,
  );
  assert.equal(
    projection.items.some(
      (item) => item.configuration_id === "opl_app_session_context",
    ),
    false,
  );
  const additionalInstructionsItem = projection.items.find(
    (item) => item.configuration_id === "new_conversation_additional_instructions",
  );
  assert.deepStrictEqual(
    {
      truth_owner: additionalInstructionsItem.truth_owner,
      value_type: additionalInstructionsItem.value_type,
      anchor: additionalInstructionsItem.anchor,
      write_route: additionalInstructionsItem.write_route,
      storage_key_status: additionalInstructionsItem.storage_key_status,
      verify_ref: additionalInstructionsItem.verify_ref,
    },
    {
      truth_owner: "user",
      value_type: "optional_user_text",
      anchor: "additional-instructions",
      write_route: "configService:codex.oplAppSessionContextAdditional",
      storage_key_status: "legacy_compatibility_storage_key",
      verify_ref:
        "new conversation preset_context contains only non-empty user-authored additional instructions; empty injects nothing",
    },
  );
  const logDirectoryItem = projection.items.find(
    (item) => item.configuration_id === "log_directory",
  );
  assert.equal(
    logDirectoryItem.write_route,
    "application.setLogDirectory { path } typed IPC; the success directory value is hostLogDir, persistence happens before the live writer switch, and a switch failure rolls persistence back with a typed failure",
  );
  assert.equal(
    logDirectoryItem.verify_ref,
    "application.setLogDirectory.hostLogDir success value plus application.systemInfo.logDir readback",
  );
  assert.equal(logDirectoryItem.page_id, "maintenance");
  assert.equal(logDirectoryItem.anchor, "diagnostics");
  assert.deepStrictEqual(logDirectoryItem.carrier_policy, {
    desktop: "editable_through_application.setLogDirectory",
    webui:
      "read_only_application.systemInfo.logDir_no_log_directory_mutation",
    docker_webui: "read_only_/data/logs_no_log_directory_mutation",
    host_mount_mutation_allowed: false,
  });
  assert.deepStrictEqual(
    values.controlPlane.page_adapter_policy.required_pages.environment.log_directory,
    {
      owner_page: "maintenance",
      owner_destination_id: "logs_diagnostics",
      typed_action: "application.setLogDirectory",
      typed_action_payload_fields: ["path"],
      typed_action_success_value_fields: ["hostLogDir"],
      typed_action_forbidden_success_value_fields: ["cacheDir", "workDir", "logDir"],
      mutation_sequence: [
        "persist_hostLogDir",
        "switch_live_log_writer",
        "rollback_persisted_hostLogDir_and_return_typed_failure_on_switch_failure",
      ],
      preserved_fields: ["cacheDir", "workDir"],
      host_projection: "application.systemInfo.logDir",
      persistence_target: "desktop_client_system_info.logDir",
      readback_ref: "application.setLogDirectory.hostLogDir plus application.systemInfo.logDir",
      desktop_change_supported: true,
      desktop_open_supported: true,
      webui_log_projection: "application.systemInfo.logDir",
      docker_webui_log_projection: "/data/logs",
      webui_change_supported: false,
      webui_action_execution_allowed: false,
      docker_volume_mapping: "host data directory -> /data",
      docker_volume_rewire_allowed: false,
    },
  );
  assert.equal(
    values.controlPlane.page_adapter_policy.required_pages.workspace
      .workspace_root_carrier_policy.webui.workspace_root_set_execution_allowed,
    false,
  );
  assert.deepStrictEqual(
    values.controlPlane.page_adapter_policy.required_pages.workspace
      .workspace_root_carrier_policy.webui.docker,
    {
      presentation: "read_only_/projects",
      authority_source: "OPL_WORKSPACE_ROOT=/projects",
      host_projects_bind_rewire_allowed: false,
    },
  );

  const duplicateId = contracts();
  duplicateId.controlPlane.configuration_catalog_projection.items[1].stable_id =
    duplicateId.controlPlane.configuration_catalog_projection.items[0].stable_id;
  duplicateId.productProfile.settings.control_plane.configuration_catalog_projection =
    structuredClone(duplicateId.controlPlane.configuration_catalog_projection);
  assert.throws(
    () => validate(duplicateId),
    /unique stable and configuration ids/,
  );

  const copiedFrameworkValue = contracts();
  copiedFrameworkValue.controlPlane.configuration_catalog_projection.items[0].current_value =
    "/tmp/copied-runtime-truth";
  copiedFrameworkValue.productProfile.settings.control_plane.configuration_catalog_projection =
    structuredClone(
      copiedFrameworkValue.controlPlane.configuration_catalog_projection,
    );
  assert.throws(
    () => validate(copiedFrameworkValue),
    /delegate current values and action metadata/,
  );

  const credentialSecret = contracts();
  const credentialItem =
    credentialSecret.controlPlane.configuration_catalog_projection.items.find(
      (item) => item.configuration_id === "model_access_credential",
    );
  credentialItem.token = "must-not-enter-the-contract";
  credentialSecret.productProfile.settings.control_plane.configuration_catalog_projection =
    structuredClone(
      credentialSecret.controlPlane.configuration_catalog_projection,
    );
  assert.throws(
    () => validate(credentialSecret),
    /must not contain secret or current-value fields/,
  );
});
