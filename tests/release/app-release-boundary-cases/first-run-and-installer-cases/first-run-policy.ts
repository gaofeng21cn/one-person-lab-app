import {
  assert,
  fs,
  os,
  path,
  test,
  appRoot,
  runNode,
  writeExecutable,
  writeFile,
  spawnSync,
  createHash,
  validateFirstRunMatrix,
  validateReleaseChannelContract,
  syncAppProductProfileToShell,
  releaseBoundaryChecks,
  readJson,
  requireReleaseBoundaryCheck,
} from "./fixtures.ts";

test("first-run matrix delegates policy shape to the active-shell validator", () => {
  const matrix = readJson("contracts/app-first-run-test-matrix.json");
  const adapter = readJson("contracts/app-shell-adapter.json");
  assert.doesNotThrow(() => validateFirstRunMatrix(matrix, adapter));
  const fullDmg = matrix.scenarios.find((entry) => entry.id === "full_dmg_clean_vm_smoke");
  assert.ok(fullDmg, "full_dmg_clean_vm_smoke");
  assert.equal(fullDmg.release_gate, true);
  assert.equal(fullDmg.post_publication_optional_certification, false);
  const capabilityStrategy = matrix.scenarios.find(
    (entry) => entry.id === 'flow_capability_strategy_framework_managed',
  );
  assert.deepEqual(
    {
      strategy_authority: capabilityStrategy.strategy_authority,
      compiler_authority: capabilityStrategy.compiler_authority,
      app_role: capabilityStrategy.app_role,
      runtime_projection_ref: capabilityStrategy.runtime_projection_ref,
      full_build_lock_kind: capabilityStrategy.full_build_lock_kind,
    },
    {
      strategy_authority: 'opl-flow',
      compiler_authority: 'opl-framework',
      app_role: 'projection_consumer_only',
      runtime_projection_ref:
        'app_state.agent_packages.status_index.packages.opl-flow.capability_strategy',
      full_build_lock_kind: 'opl_flow_capability_build_lock.v1',
    },
  );
  assert.ok(
    capabilityStrategy.expects.includes(
      'install materializes capabilities without running explicit $opl-flow start onboarding',
    ),
  );

  for (const scenario of matrix.scenarios.filter((entry) => entry.vm)) {
    const protectedReleaseGate = [
      "standard_dmg_clean_vm_smoke",
      "full_dmg_clean_vm_smoke",
    ].includes(scenario.id);
    assert.equal(scenario.release_gate, protectedReleaseGate, `${scenario.id} physical VM release gate`);
    assert.equal(
      scenario.post_publication_optional_certification,
      !protectedReleaseGate,
      `${scenario.id} post-publication optional certification`,
    );
    assert.equal(
      scenario.vm.diagnostic_scope,
      protectedReleaseGate ? "release_gate" : "post_publication_optional_certification",
      `${scenario.id} diagnostic scope`,
    );
  }

  for (const id of [
    "homebrew_standard_cask_clean_vm_smoke",
    "one_shot_app_installer_fresh_install_smoke",
  ]) {
    const scenario = matrix.scenarios.find((entry) => entry.id === id);
    assert.ok(scenario, id);
    assert.equal(scenario.release_gate, false, id);
    assert.equal(scenario.post_publication_optional_certification, true, id);
  }
  const routeSmokeExpectations = matrix.scenarios
    .flatMap((scenario) => scenario.expects ?? [])
    .filter((expectation) =>
      expectation.includes("Packaged GUI route smoke resolves every release qualification target"),
    );
  assert.equal(routeSmokeExpectations.length, 2);
  for (const expectation of routeSmokeExpectations) {
    assert.match(expectation, /hides ordinary backend\/provider selectors/);
    assert.match(
      expectation,
      /shows the App-owned model\/reasoning and permission\/access controls/,
    );
    assert.doesNotMatch(expectation, /hides ordinary backend\/model\/permission selectors/);
  }
  assert.deepEqual(fullDmg.diagnostics_contract.home_composer_probe.required_summary_fields, [
    "missing_controls",
    "composer_state",
    "instance_counts",
  ]);
  const launchAdmissionExpectations = matrix.scenarios
    .flatMap((scenario) => scenario.expects ?? [])
    .filter((expectation) =>
      expectation.includes(
        "Packaged GUI launch-admission smoke keeps every release qualification target",
      ),
    );
  assert.equal(launchAdmissionExpectations.length, 2);
  for (const expectation of launchAdmissionExpectations) {
    assert.match(expectation, /visible and selectable/);
    assert.match(expectation, /available target is selected and admitted without sending/);
    assert.match(expectation, /unavailable target preserves the draft/);
    assert.match(expectation, /blocks only that send with typed repair guidance/);
    assert.doesNotMatch(expectation, /visible but disabled/);
    assert.match(expectation, /neither path claims a Full route receipt/);
  }
  assert.deepEqual(
    {
      role: matrix.release_qualification_agent_target_fixture.role,
      runtime_authority: matrix.release_qualification_agent_target_fixture.runtime_authority,
      catalog_membership_authority:
        matrix.release_qualification_agent_target_fixture.catalog_membership_authority,
      visibility_authority: matrix.release_qualification_agent_target_fixture.visibility_authority,
      action_authority: matrix.release_qualification_agent_target_fixture.action_authority,
    },
    {
      role: "release_qualification_probe_input_only",
      runtime_authority: false,
      catalog_membership_authority: false,
      visibility_authority: false,
      action_authority: false,
    },
  );
  assert.equal(
    matrix.scenarios.find((scenario) => scenario.id === "standard_dmg_clean_vm_smoke")
      .compiled_expectation_ref,
    "contracts/app-first-run-compiled-expectations.json#profiles.standard",
  );
  assert.equal(
    matrix.scenarios.find((scenario) => scenario.id === "homebrew_standard_cask_clean_vm_smoke")
      .compiled_expectation_ref,
    "contracts/app-first-run-compiled-expectations.json#profiles.standard",
  );
  assert.equal(
    fullDmg.compiled_expectation_ref,
    "contracts/app-first-run-compiled-expectations.json#profiles.full",
  );
  assert.equal(
    matrix.scenarios.find((scenario) => scenario.id === "full_first_install_clean_machine")
      .compiled_expectation_ref,
    "contracts/app-first-run-compiled-expectations.json#profiles.full",
  );

  const invalid = structuredClone(matrix);
  invalid.scenarios[0].aliases = ["legacy"];
  assert.throws(
    () => validateFirstRunMatrix(invalid, adapter),
    /must not declare compatibility aliases/,
  );

  const missingComposerProbe = structuredClone(matrix);
  const missingComposerProbeFullDmg = missingComposerProbe.scenarios.find(
    (scenario) => scenario.id === "full_dmg_clean_vm_smoke",
  );
  missingComposerProbeFullDmg.diagnostics_contract.home_composer_probe.required_summary_fields = [];
  assert.throws(
    () => validateFirstRunMatrix(missingComposerProbe, adapter),
    /must consume the App-owned Home composer state contract and fail within 60 seconds/,
  );
});

test("release qualification requires protected Gateway credentials only for Standard and Full clean-VM gates", () => {
  const matrix = readJson("contracts/app-first-run-test-matrix.json");
  const release = readJson("contracts/app-release-channel.json");
  const adapter = readJson("contracts/app-shell-adapter.json");
  const qualification = matrix.provider_configuration_qualification;
  const boundary = release.provider_configuration_boundary;

  assert.equal(qualification.default_user_authentication, "opl_gateway_account_password");
  assert.equal(qualification.api_key_role, "explicit_compatibility_only");
  assert.equal(qualification.release_vm_default.provider_configuration_status, "required_gateway_account_login");
  assert.equal(qualification.release_vm_default.provider_configuration_required, true);
  assert.deepEqual(qualification.release_vm_default.dedicated_account_policy, {
    personal_or_administrator_account_allowed: false,
    required_profile_role: "user",
    required_account_status: "active",
    required_balance_amount: 0,
    configured_email_must_match_authenticated_profile: true,
    live_profile_preflight_required: true,
    credential_or_token_fields_in_receipt_allowed: false,
  });
  assert.deepEqual(boundary.release_vm_smoke.credential_variable_names, [
    "OPL_GATEWAY_RELEASE_TEST_ACCOUNT_EMAIL",
  ]);
  assert.deepEqual(boundary.release_vm_smoke.credential_secret_names, [
    "OPL_GATEWAY_RELEASE_TEST_ACCOUNT_PASSWORD",
  ]);
  assert.deepEqual(qualification.required_release_scenarios, [
    "standard_dmg_clean_vm_smoke",
    "full_dmg_clean_vm_smoke",
  ]);
  assert.equal(qualification.release_vm_default.synthetic_api_key_generation_allowed, false);
  assert.equal(
    qualification.connected_provider_diagnostic.credential_source,
    "developer_host_codex_selected_provider",
  );
  assert.equal(qualification.connected_provider_diagnostic.base_url_must_match_opl_gateway, true);
  assert.equal(qualification.connected_provider_diagnostic.manual_user_input_required, false);
  assert.equal(
    boundary.release_vm_smoke.explicit_api_key_file_role,
    "optional_manual_override_only",
  );
  assert.equal(
    boundary.artifact_and_package_independence.dmg_build_requires_provider_credential,
    false,
  );
  assert.equal(
    boundary.artifact_and_package_independence.manual_full_m1_requires_provider_credential,
    false,
  );
  assert.equal(
    boundary.artifact_and_package_independence
      .manual_full_preview_publication_requires_provider_credential,
    false,
  );
  assert.equal(
    boundary.artifact_and_package_independence
      .managed_package_currentness_requires_provider_credential,
    false,
  );

  const administratorCredentialMatrix = structuredClone(matrix);
  administratorCredentialMatrix.provider_configuration_qualification.release_vm_default
    .dedicated_account_policy.required_profile_role = "admin";
  assert.throws(
    () => validateFirstRunMatrix(administratorCredentialMatrix, adapter),
    /must use protected Gateway credentials without synthetic keys/,
  );

  const administratorCredentialRelease = structuredClone(release);
  administratorCredentialRelease.provider_configuration_boundary.release_vm_smoke
    .dedicated_account_policy.personal_or_administrator_account_allowed = true;
  assert.throws(
    () => validateReleaseChannelContract(administratorCredentialRelease),
    /must keep build\/package independence while requiring protected Gateway credentials/,
  );

  const syntheticCredentialMatrix = structuredClone(matrix);
  syntheticCredentialMatrix.provider_configuration_qualification.release_vm_default.synthetic_api_key_generation_allowed = true;
  assert.throws(
    () => validateFirstRunMatrix(syntheticCredentialMatrix, adapter),
    /must use protected Gateway credentials without synthetic keys/,
  );

  const userPromptingMatrix = structuredClone(matrix);
  userPromptingMatrix.provider_configuration_qualification.connected_provider_diagnostic.manual_user_input_required = true;
  assert.throws(
    () => validateFirstRunMatrix(userPromptingMatrix, adapter),
    /must use protected Gateway credentials without synthetic keys/,
  );

  const providerBoundRelease = structuredClone(release);
  providerBoundRelease.provider_configuration_boundary.artifact_and_package_independence.dmg_build_requires_provider_credential = true;
  assert.throws(
    () => validateReleaseChannelContract(providerBoundRelease),
    /must keep build\/package independence while requiring protected Gateway credentials/,
  );
});

test("one-shot App installer boundary is enforced by release-boundary checks", () => {
  const oneShot = requireReleaseBoundaryCheck("one_shot_unsigned_local_authorization");
  const install = readJson("contracts/app-install-exposure-policy.json");

  assert.equal(oneShot.file, "install.sh");
  assert.ok(oneShot.required.includes("--stable-macos-install"));
  assert.ok(oneShot.required.includes("--authorize-local-app-only"));
  assert.deepEqual(
    install.distribution_install_model.installer_convergence.stable_macos_helper.artifact_integrity,
    {
      official_release_asset_authority: "exact_github_release_record_asset_digest",
      component_manifest_authority: "exact_github_release_record_component_manifest_asset_digest",
      custom_url_or_path_authority: "caller_supplied_sha256_quality_not_asserted",
      verification_order: "dmg_and_component_manifest_before_mount_copy_or_target_replacement",
      latest_pointer_does_not_imply_stable_qualification: true,
      non_stable_disclosure_before_target_mutation: true,
      legacy_component_manifest_policy:
        "allow_only_published_non_prerelease_pre_v3_manifest_with_quality_unasserted_disclosure",
    },
  );
  assert.deepEqual(
    install.distribution_install_model.installer_convergence.stable_macos_helper
      .release_record_recovery,
    {
      primary_route: "anonymous_github_release_api",
      authenticated_fallback_dependency: "github_cli_gh",
      authenticated_fallback_prerequisite: "existing_authenticated_github.com_session",
      authenticated_fallback_trigger: "anonymous_release_api_request_failure_including_http_403",
      authenticated_fallback_behavior:
        "read_same_requested_latest_or_exact_tag_release_record_via_gh_api",
      missing_cli_or_authentication: "fail_closed_before_download_or_target_mutation",
    },
  );
  const installGuideEnglish = fs.readFileSync(
    path.join(appRoot, "docs/delivery/install/README.md"),
    "utf8",
  );
  const installGuideChinese = fs.readFileSync(
    path.join(appRoot, "docs/delivery/install/README.zh-CN.md"),
    "utf8",
  );
  assert.match(installGuideEnglish, /README\.zh-CN\.md/);
  assert.match(installGuideEnglish, /HTTP 403/);
  assert.match(installGuideEnglish, /gh auth/);
  assert.match(installGuideEnglish, /gh api/);
  assert.match(installGuideEnglish, /before any download or target App change/);
  const installGuideEnglishBody = installGuideEnglish.slice(
    installGuideEnglish.indexOf("# One Person Lab Installation Guide"),
  );
  assert.doesNotMatch(installGuideEnglishBody, /[\u3400-\u9fff]/);
  assert.match(installGuideChinese, /README\.md/);
  assert.match(installGuideChinese, /HTTP 403/);
  assert.match(installGuideChinese, /gh auth/);
  assert.match(installGuideChinese, /gh api/);
  assert.match(installGuideChinese, /修改目标 App 之前明确停止/);
  assert.deepEqual(
    install.distribution_install_model.installer_convergence.stable_macos_helper
      .compatibility_entrypoints,
    [],
  );
  assert.deepEqual(
    install.distribution_install_model.installer_convergence.current_default_app_script
      .explicit_density_override,
    {
      macos_standard_or_full: "direct_exact_release_component_manifest_asset_selection",
      linux_standard: "exact_release_linux_x64_deb",
      linux_full: "fail_closed_before_release_asset_lookup",
    },
  );
  assert.deepEqual(
    install.distribution_install_model.installer_convergence.approved_universal_target
      .payload_density_routing,
    {
      macos: "explicit_standard_or_full_selects_the_matching_exact_release_asset",
      linux_x86_64: "standard_only_and_explicit_full_fails_closed_before_release_asset_lookup",
      frozen_macos_default:
        "prefer_full_and_fallback_to_standard_only_when_full_is_confirmed_absent",
      source_checkout_default_without_explicit_density: "framework_with_app_compatibility",
    },
  );
  assert.equal(
    install.distribution_install_model.installer_convergence.stable_macos_helper
      .compatibility_wrapper_status,
    "retired",
  );
  assert.equal(fs.existsSync(path.join(appRoot, "install-stable.sh")), false);
  assert.equal(fs.existsSync(path.join(appRoot, "install-free.sh")), false);
});

test("release boundary requires state-aware Standard launch admission and Full route receipts", () => {
  const assistantSmoke = requireReleaseBoundaryCheck("first_run_vm_profile_aware_assistant_smoke");
  const release = readJson("contracts/app-release-channel.json");
  const fullPolicy = release.release_acceleration.assistant_route_smoke_policy.full;

  assert.match(assistantSmoke.file, /scripts\/desktop\/stable-smoke\.mjs$/);
  for (const token of ['runCodexReadiness', 'runFrameworkReadiness', 'requireGatewaySetup: true', 'generationRequested: false']) {
    assert.ok(assistantSmoke.required.includes(token));
  }
  assert.ok(assistantSmoke.forbidden.includes("POST /api/conversations"));
  assert.equal(
    release.release_acceleration.assistant_route_smoke_policy.target_fixture_ref,
    "contracts/app-first-run-test-matrix.json#release_qualification_agent_target_fixture",
  );
  assert.equal(
    release.release_acceleration.assistant_route_smoke_policy.target_fixture_boundary,
    "release_qualification_probe_input_only_without_runtime_catalog_visibility_action_or_install_authority",
  );
  assert.ok(
    fullPolicy.required.includes(
      "real_guid_composer_send_without_shell_package_activation_per_target",
    ),
  );
  assert.ok(
    fullPolicy.required.includes(
      "Framework_stage_runtime_activation_uses_Stage_workspace_locator_per_target",
    ),
  );
  assert.ok(fullPolicy.required.includes("Framework_stage_runtime_activation_evidence_per_target"));
  assert.ok(fullPolicy.required.includes("conversation_get_readback_per_target"));
  assert.ok(fullPolicy.forbidden.includes("direct_conversation_post"));

  const syntheticReceiptAllowed = structuredClone(release);
  syntheticReceiptAllowed.release_acceleration.assistant_route_smoke_policy.full.forbidden = [];
  assert.throws(
    () => validateReleaseChannelContract(syntheticReceiptAllowed),
    /Full assistant synthetic launch-path prohibitions/,
  );
});

test("release boundary requires Studio production Runtime refresh evidence", () => {
  const policy = requireReleaseBoundaryCheck("first_run_vm_runtime_refresh_production_evidence");
  assert.match(policy.file, /scripts\/desktop\/stable-smoke\.mjs$/);
  for (const token of ['runRuntimeRefresh', 'busyObserved', 'buttonReadyAfter', 'production_runtime_refresh_not_proven']) {
    assert.ok(policy.required.includes(token), `missing Runtime evidence source gate: ${token}`);
  }
});

test("release boundary requires Studio installed identity, signature and Gatekeeper", () => {
  const policy = requireReleaseBoundaryCheck("first_run_vm_local_authorization_policy");
  assert.match(policy.file, /scripts\/desktop\/stable-clean-vm\.mjs$/);
  for (const token of ['codesign --verify', 'spctl --assess', 'expectedTeamId', 'requireGatekeeper']) {
    assert.ok(policy.required.includes(token));
  }
});
