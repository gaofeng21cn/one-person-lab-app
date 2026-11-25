import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const appRoot = path.resolve(import.meta.dirname, '../..');
const readJson = (relativePath: string) =>
  JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), 'utf8'));

const gui = readJson('contracts/app-gui-product-contract.json');
const release = readJson('contracts/app-release-channel.json');
const qualification = readJson('contracts/app-first-run-test-matrix.json');
const identityManifest = readJson('contracts/app-release-qualification-input-manifest.json');
const fullManifest = readJson('contracts/app-full-third-party-source-manifest.json');
const profile = readJson('contracts/app-product-profile.json');
const settings = readJson('contracts/app-settings-control-plane.json');
const exposure = readJson('contracts/app-install-exposure-policy.json');

const provider = gui.computer_use_policy.desktop_provider;
const distribution = release.computer_use_distribution;
const browserPolicy = gui.computer_use_policy.browser_provider;
const browserProfile = profile.computer_use.browser;
const browserDistribution = distribution.browser_provider;
const computerUseQualification = qualification.computer_use_qualification;
const browserQualification = qualification.browser_provider_qualification;

test('Computer Use uses one Studio-owned DSH native provider identity across all App contracts', () => {
  assert.deepEqual(
    {
      provider_id: provider.provider_id,
      lifecycle_class: provider.lifecycle_class,
      lifecycle_owner: provider.lifecycle_owner,
      mcp_server_id: provider.mcp_server_id,
      mcp_package: provider.mcp_package,
      native_helper_package: provider.native_helper_package,
      native_helper_sign_ignore: provider.native_helper_sign_ignore,
      codex_injection: provider.codex_injection,
      mutates_global_codex_config: provider.mutates_global_codex_config,
      consent_modes: provider.consent_modes,
      default_consent_mode: provider.default_consent_mode,
      required_tools: provider.required_tools,
    },
    {
      provider_id: 'dsh-cua',
      lifecycle_class: 'studio_dsh_native_cua_mcp',
      lifecycle_owner: 'opl-studio',
      mcp_server_id: 'dsh_cua',
      mcp_package: '@deepseek-ai/dsh-cua-mcp',
      native_helper_package: '@deepseek-ai/dsh-cua-macos',
      native_helper_sign_ignore: true,
      codex_injection: 'dynamic_cli_override_required_false',
      mutates_global_codex_config: false,
      consent_modes: ['elicit', 'allow'],
      default_consent_mode: 'elicit',
      required_tools: [
        'cua_get_api_reference',
        'cua_run_code',
        'cua_reset',
      ],
    },
  );

  assert.equal(distribution.provider_id, provider.provider_id);
  assert.equal(distribution.lifecycle_owner, 'opl-studio');
  assert.equal(distribution.native_helper_package, provider.native_helper_package);
  assert.equal(distribution.mcp_package, provider.mcp_package);
  assert.equal(distribution.mac_sign_ignore, true);
  assert.equal(computerUseQualification.provider_id, provider.provider_id);
  assert.equal(profile.computer_use.desktop_default_provider, provider.provider_id);
  assert.equal(profile.computer_use.lifecycle_owner, 'opl-studio');
  assert.equal(profile.computer_use.mcp_server_name, provider.mcp_server_id);
  assert.equal(profile.computer_use.codex_injection, provider.codex_injection);
  assert.equal(profile.computer_use.mutates_global_codex_config, false);
  assert.equal(settings.managed_computer_use.provider_id, provider.provider_id);
  assert.equal(settings.managed_computer_use.lifecycle_owner, 'opl-studio');
  assert.equal(settings.managed_computer_use.mutates_global_codex_config, false);

  const builderConfigPath = path.join(appRoot, 'shells/opl-studio/electron-builder.yml');
  if (fs.existsSync(builderConfigPath)) {
    const builderConfig = fs.readFileSync(builderConfigPath, 'utf8');
    assert.match(builderConfig, /@deepseek-ai\/dsh-cua-macos\/native\/bin/);
  }
});

test('Standard and Full bundle identical Studio DSH Computer Use without a separate offline archive seed', () => {
  assert.equal(distribution.separate_full_offline_seed_required, false);
  assert.equal(distribution.standard.source, 'bundled_studio_app_payload');
  assert.equal(distribution.standard.network_required_for_first_materialization, false);
  assert.equal(distribution.full.source, 'bundled_studio_app_payload');
  assert.equal(distribution.full.network_required_for_first_materialization, false);

  for (const field of [
    'same_provider_id',
    'same_bundled_native_helper',
    'same_codex_dynamic_injection',
    'same_default_consent_mode',
    'same_default_enabled_state',
    'same_required_tool_set',
    'same_permission_and_health_readback',
  ]) {
    assert.equal(distribution.post_install_parity[field], true, field);
  }
  assert.equal(distribution.post_install_parity.full_second_manifest_or_provider_allowed, false);

  assert.equal(profile.computer_use.distribution_forms.standard.materialization_source, 'bundled_studio_app_payload');
  assert.equal(profile.computer_use.distribution_forms.standard.offline_seed, false);
  assert.equal(profile.computer_use.distribution_forms.full.materialization_source, 'bundled_studio_app_payload');
  assert.equal(profile.computer_use.distribution_forms.full.offline_seed, false);
  assert.equal(profile.computer_use.distribution_forms.same_installed_identity_and_behavior_required, true);
  assert.equal(profile.computer_use.distribution_forms.full_additional_provider_or_behavior_allowed, false);

  assert.equal(fullManifest.sources.kimi_cu, undefined);
  assert.equal(fullManifest.runtime_payloads.kimi_cu, undefined);
  assert.equal(identityManifest.runtime_payloads.kimi_cu, undefined);
});

test('Computer Use defaults to elicit mode with an allow option without fabricating macOS TCC permission', () => {
  assert.equal(provider.default_enabled, true);
  assert.equal(distribution.default_enabled, true);
  assert.equal(settings.managed_computer_use.default_enabled, true);
  assert.equal(provider.default_consent_mode, 'elicit');
  assert.equal(distribution.default_consent_mode, 'elicit');
  assert.equal(settings.managed_computer_use.default_consent_mode, 'elicit');
  assert.deepEqual(settings.managed_computer_use.consent_modes, ['elicit', 'allow']);

  assert.deepEqual(provider.permission_model.permission_missing_state, {
    enabled: true,
    permission: 'required',
    ready: false,
  });
  assert.deepEqual(provider.permission_model.permission_granted_state, {
    enabled: true,
    permission: 'granted',
    ready: true,
  });
  assert.equal(provider.permission_model.permission_can_be_bypassed_or_fabricated, false);
  assert.equal(provider.permission_model.missing_permission_blocks_plain_codex, false);
  assert.equal(qualification.computer_use_qualification.computer_use_missing_permission_blocks_app_or_plain_codex_use, false);
  assert.equal(settings.managed_computer_use.manual_and_third_party_mutation_rule_applies, false);
  assert.equal(
    exposure.capability_governance.mcp_policy.default_desktop_computer_use_provider_ref,
    'contracts/app-gui-product-contract.json#computer_use_policy.desktop_provider',
  );
  assert.equal(exposure.capability_governance.mcp_policy.managed_companion_is_not_manual_third_party, true);
});

test('Computer Use product qualification validates native TCC, cua-mcp tools/list, and Codex dynamic injection', () => {
  const aiPolicy = release.release_acceleration.ai_exploratory_policy;
  assert.equal(aiPolicy.computer_use_product_capability, 'default_managed_and_release_qualified');
  assert.equal(aiPolicy.computer_use_as_ai_release_reviewer, 'non_blocking_exploratory_only');
  assert.match(
    aiPolicy.rule,
    /installation, registration, enablement, MCP handshake, tools, permissions state, and health are deterministic/,
  );
  assert.equal(distribution.release_qualification.both_require_bundled_native_helper, true);
  assert.equal(distribution.release_qualification.both_require_permission_status_readback, true);
  assert.equal(distribution.release_qualification.both_require_cua_mcp_tools_list, true);
  assert.equal(distribution.release_qualification.both_require_codex_app_server_mcp_status_in_elicit_and_allow, true);
  assert.equal(distribution.release_qualification.stable_publication_requires_accessibility_and_screen_recording_granted, true);
  assert.equal(distribution.release_qualification.stable_publication_requires_ready, true);
  assert.deepEqual(computerUseQualification.required_runtime_readback, [
    'permissionStatus',
    'cua-mcp:tools/list',
    'codex-app-server:mcpServerStatus/list(elicit)',
    'codex-app-server:mcpServerStatus/list(allow)',
  ]);
  assert.deepEqual(computerUseQualification.stable_release_acceptance, {
    accessibility: 'granted',
    screen_recording: 'granted',
    ready: true,
    mcp_functional_probe: 'cua-mcp:tools/list=passed',
    codex_injection_probe: 'dsh_cua:elicit_and_allow=passed',
    global_codex_config_mutated: false,
  });

  const gate = distribution.next_stable_release_gate;
  assert.equal(gate.status, 'pending_next_stable_release');
  assert.equal(gate.trigger, 'next_stable_release_candidate');
  assert.deepEqual(gate.both_tracks_require, [
    'packaged_clean_vm_first_run',
    'dsh_cua_native_helper_tcc_cua_mcp_tools_list_and_codex_injection',
    'playwright_same_codex_registry_entry_mcp_initialize_tools_list_navigation_and_snapshot',
    'same_cohort_gui_readback',
  ]);
});

test('Playwright MCP is the one default structured browser provider on the existing Codex registry', () => {
  assert.deepEqual(
    {
      provider_id: browserPolicy.provider_id,
      mcp_server_id: browserPolicy.mcp_server_id,
      upstream_package: browserPolicy.upstream_package,
      upstream_owner: browserPolicy.upstream_implementation_owner,
      lifecycle_owner: browserPolicy.lifecycle_owner,
      registry_authority: browserPolicy.registry_authority,
      registry_writer_ref: browserPolicy.registry_writer_ref,
      shell_role: browserPolicy.shell_role,
      default_register: browserPolicy.default_register,
      default_enabled: browserPolicy.default_enabled,
      default_structured_provider: browserPolicy.default_structured_provider,
      visual_fallback: browserPolicy.desktop_visual_fallback_provider_id,
    },
    {
      provider_id: 'playwright-mcp',
      mcp_server_id: 'playwright',
      upstream_package: '@playwright/mcp',
      upstream_owner: 'microsoft/playwright-mcp',
      lifecycle_owner: 'one-person-lab',
      registry_authority: 'existing_codex_mcp_registry',
      registry_writer_ref: 'one-person-lab/src/adapters/integration/system-installation/codex-plugin-registry.ts#registerOplManagedMcpServer',
      shell_role: 'configured_codex_mcp_registry_consumer_only',
      default_register: true,
      default_enabled: true,
      default_structured_provider: true,
      visual_fallback: provider.provider_id,
    },
  );

  assert.equal(browserProfile.policy_ref, 'contracts/app-gui-product-contract.json#computer_use_policy.browser_provider');
  assert.equal(browserProfile.default_provider, browserPolicy.provider_id);
  assert.equal(browserProfile.mcp_server_id, browserPolicy.mcp_server_id);
  assert.equal(browserProfile.registry_authority, browserPolicy.registry_authority);
  assert.equal(browserProfile.registry_writer_ref, browserPolicy.registry_writer_ref);
  assert.equal(browserProfile.desktop_visual_fallback.provider_id, provider.provider_id);
  assert.equal(browserProfile.desktop_visual_fallback.may_replace_structured_default, false);
});

test('Playwright MCP has Standard-Full parity without a second engine, catalog, writer, or session store', () => {
  assert.equal(browserDistribution.policy_ref, 'contracts/app-gui-product-contract.json#computer_use_policy.browser_provider');
  assert.equal(browserDistribution.provider_id, browserPolicy.provider_id);
  assert.equal(browserDistribution.mcp_server_id, browserPolicy.mcp_server_id);
  assert.equal(browserDistribution.registry_authority, browserPolicy.registry_authority);
  assert.equal(browserDistribution.registry_writer_ref, browserPolicy.registry_writer_ref);
  assert.equal(browserDistribution.standard.registry_source, 'existing_codex_mcp_registry');
  assert.equal(browserDistribution.full.registry_source, browserDistribution.standard.registry_source);
  assert.equal(browserDistribution.standard.additional_browser_provider_or_engine_catalog, false);
  assert.equal(browserDistribution.full.additional_browser_provider_or_engine_catalog, false);

  for (const field of [
    'same_provider_id',
    'same_mcp_server_id',
    'same_registry_writer',
    'same_default_enabled_state',
    'same_structured_browser_behavior',
    'same_browser_session_authority',
  ]) {
    assert.equal(browserDistribution.post_registration_parity[field], true, field);
  }
  assert.equal(
    browserDistribution.post_registration_parity
      .full_additional_provider_engine_catalog_or_session_store_allowed,
    false,
  );
  assert.equal(browserPolicy.authority_boundary.app_owned_browser_engine_allowed, false);
  assert.equal(browserPolicy.authority_boundary.app_owned_browser_provider_catalog_allowed, false);
  assert.equal(browserPolicy.authority_boundary.second_mcp_registry_writer_allowed, false);
  assert.equal(browserPolicy.authority_boundary.browser_session_store_allowed, false);
  assert.equal(browserPolicy.authority_boundary.shell_may_mutate_codex_mcp_registry, false);
  assert.equal(browserPolicy.authority_boundary.desktop_visual_fallback_may_replace_structured_default, false);
  assert.equal(fullManifest.runtime_payloads.playwright_mcp, undefined);
  assert.equal(fullManifest.sources.playwright_mcp, undefined);
});

test('Playwright MCP first-run qualification preserves Chrome structured readiness and non-substitution rules', () => {
  assert.equal(browserQualification.provider_id, browserPolicy.provider_id);
  assert.equal(browserQualification.mcp_server_id, browserPolicy.mcp_server_id);
  assert.deepEqual(browserQualification.applies_to, ['standard', 'full']);
  assert.deepEqual(browserQualification.default_expectation, {
    registered: true,
    enabled: true,
    structured_default: true,
  });
  assert.deepEqual(browserQualification.required_runtime_readback, [
    'initialize',
    'tools/list',
    'structured_browser_smoke',
  ]);
  assert.equal(browserQualification.desktop_visual_fallback_provider_id, provider.provider_id);
  assert.equal(browserQualification.visual_fallback_may_substitute_for_structured_provider_qualification, false);
  assert.equal(browserQualification.missing_browser_provider_blocks_app_or_plain_codex_use, false);
  assert.equal(browserPolicy.browser_mode, 'isolated_headless_system_chrome');
  assert.equal(browserDistribution.browser_mode, browserPolicy.browser_mode);
  assert.deepEqual(browserQualification.must_not_create, [
    'second_browser_engine',
    'browser_provider_catalog',
    'second_mcp_registry_writer',
    'browser_session_store',
  ]);
});
