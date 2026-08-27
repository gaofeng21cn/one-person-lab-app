import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  KIMI_CU_QUALIFICATION_IDENTITY_REF,
  kimiCuOfflineSeedRelativePath,
  readKimiCuQualificationIdentity,
} from '../../scripts/build-full-first-install-package/runtime-layers.ts';

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

const identity = identityManifest.runtime_payloads.kimi_cu;
const provider = gui.computer_use_policy.desktop_provider;
const distribution = release.computer_use_distribution;
const browserPolicy = gui.computer_use_policy.browser_provider;
const browserProfile = profile.computer_use.browser;
const browserDistribution = distribution.browser_provider;
const computerUseQualification = qualification.computer_use_qualification;
const browserQualification = qualification.browser_provider_qualification;

test('Computer Use has one pinned KimiCU identity across all App contracts', () => {
  assert.deepEqual(
    {
      provider_id: identity.provider_id,
      version: identity.version,
      archive_url: identity.archive_url,
      archive_sha256: identity.archive_sha256,
      bundle_id: identity.bundle.bundle_id,
      team_id: identity.bundle.team_id,
      target_install_path: identity.bundle.target_install_path,
      executable: identity.bundle.executable,
      mcp_args: identity.mcp.args,
      required_tools: identity.mcp.required_tools,
    },
    {
      provider_id: 'kimi-cu',
      version: '0.5.4',
      archive_url: 'https://cdn.kimi.com/kimi-computer-use/0.5.4/KimiCU.app.zip',
      archive_sha256: '77a7515cf7fd4b7bfa46a95eab0dff7378d00a2c5003bcf7ad93f17667e2808e',
      bundle_id: 'ai.kimi.cu',
      team_id: '2J9472RW75',
      target_install_path: '/Applications/KimiCU.app',
      executable: '/Applications/KimiCU.app/Contents/MacOS/kimi-cu',
      mcp_args: ['mcp', '-s', 'user'],
      required_tools: [
        'list_apps',
        'get_app_state',
        'click',
        'type_text',
        'press_key',
        'scroll',
        'set_value',
        'perform_secondary_action',
        'select_text',
        'drag',
      ],
    },
  );

  assert.equal(provider.provider_id, identity.provider_id);
  assert.equal(provider.provider_identity_ref, 'contracts/app-release-qualification-input-manifest.json#runtime_payloads.kimi_cu');
  assert.equal(provider.mcp_command, identity.bundle.executable);
  assert.deepEqual(provider.mcp_args, identity.mcp.args);
  assert.equal(distribution.provider_id, identity.provider_id);
  assert.equal(distribution.qualification_identity_ref, provider.provider_identity_ref);
  assert.equal(qualification.computer_use_qualification.provider_id, identity.provider_id);
  assert.equal(profile.computer_use.desktop_default_provider, identity.provider_id);
  assert.equal(settings.managed_computer_use.provider_identity_ref, provider.provider_identity_ref);
  assert.deepEqual(provider.local_agent_backend, {
    agent_id: 'codex',
    source: 'app_bundled_codex_cli',
    detection_evidence: 'managed_codex_home_mcp_registration',
    registration_must_precede_kimi_cu_panel_launch: true,
    control_panel_must_detect_configured_backend: true,
  });
});

test('Standard and Full use different materialization sources but the same installed behavior', () => {
  assert.equal(distribution.standard.source, 'pinned_vendor_archive_download');
  assert.equal(distribution.standard.network_required_for_first_materialization, true);
  assert.equal(distribution.full.source, 'bundled_exact_vendor_archive_seed');
  assert.equal(distribution.full.network_required_for_first_materialization, false);
  assert.equal(distribution.standard.target_path, identity.bundle.target_install_path);
  assert.equal(distribution.full.target_path, identity.bundle.target_install_path);

  for (const field of [
    'same_version',
    'same_archive_sha256',
    'same_bundle_id',
    'same_signing_team_id',
    'same_target_path',
    'same_mcp_command_and_args',
    'same_default_enabled_state',
    'same_required_tool_set',
    'same_permission_and_health_readback',
  ]) {
    assert.equal(distribution.post_install_parity[field], true, field);
  }
  assert.equal(distribution.post_install_parity.full_second_manifest_or_provider_allowed, false);

  assert.equal(profile.computer_use.distribution_forms.standard.offline_seed, false);
  assert.equal(profile.computer_use.distribution_forms.full.offline_seed, true);
  assert.equal(profile.computer_use.distribution_forms.same_installed_identity_and_behavior_required, true);
  assert.equal(profile.computer_use.distribution_forms.full_additional_provider_or_behavior_allowed, false);

  assert.equal(fullManifest.runtime_payloads.kimi_cu.materialization_role, 'full_offline_seed_only');
  assert.equal(fullManifest.authority_boundary.kimi_cu_is_the_same_managed_dependency_as_standard, true);
  assert.equal(fullManifest.authority_boundary.kimi_cu_full_seed_may_define_second_provider_or_behavior, false);
  assert.equal(fullManifest.runtime_payloads.kimi_cu.version, identity.version);
  assert.equal(fullManifest.runtime_payloads.kimi_cu.archive_sha256, identity.archive_sha256);

  const packagingIdentity = readKimiCuQualificationIdentity(appRoot);
  assert.deepEqual(packagingIdentity, identity);
  assert.equal(KIMI_CU_QUALIFICATION_IDENTITY_REF, provider.provider_identity_ref);
  assert.equal(
    kimiCuOfflineSeedRelativePath(packagingIdentity),
    `runtime-payloads/${identity.provider_id}/${identity.version}/KimiCU.app.zip`,
  );
});

test('Computer Use is default-on without fabricating macOS TCC permission', () => {
  assert.equal(provider.default_install, true);
  assert.equal(provider.default_register, true);
  assert.equal(provider.default_enabled, true);
  assert.equal(distribution.default_install, true);
  assert.equal(distribution.default_register, true);
  assert.equal(distribution.default_enabled, true);
  assert.equal(settings.managed_computer_use.default_install, true);
  assert.equal(settings.managed_computer_use.default_enabled, true);

  assert.deepEqual(provider.permission_model.permission_missing_state, {
    installed: true,
    registered: true,
    enabled: true,
    permission: 'required',
    ready: false,
  });
  assert.deepEqual(provider.permission_model.permission_granted_state, {
    installed: true,
    registered: true,
    enabled: true,
    permission: 'granted',
    ready: true,
  });
  assert.equal(provider.permission_model.permission_can_be_bypassed_or_fabricated, false);
  assert.equal(qualification.computer_use_qualification.computer_use_missing_permission_blocks_app_or_plain_codex_use, false);
  assert.equal(settings.managed_computer_use.manual_and_third_party_mutation_rule_applies, false);
  assert.equal(
    exposure.capability_governance.mcp_policy.default_desktop_computer_use_provider_ref,
    'contracts/app-release-qualification-input-manifest.json#runtime_payloads.kimi_cu',
  );
  assert.equal(exposure.capability_governance.mcp_policy.managed_companion_is_not_manual_third_party, true);
});

test('Computer Use product qualification is deterministic while AI UI review remains exploratory', () => {
  const aiPolicy = release.release_acceleration.ai_exploratory_policy;
  assert.equal(aiPolicy.computer_use_product_capability, 'default_managed_and_release_qualified');
  assert.equal(aiPolicy.computer_use_as_ai_release_reviewer, 'non_blocking_exploratory_only');
  assert.match(
    aiPolicy.rule,
    /installation, registration, enablement, MCP handshake, tools, permissions state, and health are deterministic/,
  );
  assert.equal(distribution.release_qualification.both_require_mcp_initialize_and_tools_list, true);
  assert.equal(distribution.release_qualification.both_require_mcp_tools_call_list_apps, true);
  assert.equal(distribution.release_qualification.both_require_permission_status_readback, true);
  assert.equal(distribution.release_qualification.stable_publication_requires_accessibility_and_screen_recording_granted, true);
  assert.equal(distribution.release_qualification.stable_publication_requires_ready, true);
  assert.equal(distribution.release_qualification.stable_publication_requires_codex_backend_detected, true);
  assert.deepEqual(identity.health.permission_status_args, ['doctor']);
  assert.deepEqual(identity.health.mcp_handshake, ['initialize', 'tools/list', 'tools/call:list_apps']);
  assert.equal(distribution.release_qualification.permission_prompt_completion_may_be_manual, true);
  assert.deepEqual(computerUseQualification.local_agent_backend_acceptance, {
    agent_id: 'codex',
    source: 'app_bundled_codex_cli',
    registration_before_kimi_cu_panel_launch: true,
    control_panel_no_supported_agent_state_allowed: false,
  });
  assert.deepEqual(computerUseQualification.stable_release_acceptance, {
    accessibility: 'granted',
    screen_recording: 'granted',
    ready: true,
    mcp_functional_probe: 'tools/call:list_apps=passed',
    codex_backend_detected: true,
  });
});

test('next Stable release must qualify packaged Computer Use on both publication tracks', () => {
  const gate = distribution.next_stable_release_gate;

  assert.equal(gate.status, 'pending_next_stable_release');
  assert.equal(gate.trigger, 'next_stable_release_candidate');
  assert.deepEqual(gate.operation_binding, {
    standard: {
      operation: 'standard',
      required_before: 'standard_stable_asset_publication',
      materialization: 'networked_first_install_from_packaged_standard',
    },
    full: {
      operation: 'append_full',
      required_before: 'full_asset_append_publication',
      materialization: 'offline_first_install_from_packaged_full_seed',
    },
  });
  assert.deepEqual(gate.both_tracks_require, [
    'packaged_clean_vm_first_run',
    'kimi_cu_identity_service_xpc_tcc_mcp_initialize_and_tools_list',
    'playwright_same_codex_registry_entry_mcp_initialize_tools_list_navigation_and_snapshot',
    'same_cohort_gui_readback',
  ]);
  assert.deepEqual(gate.post_publication_readback_requires, [
    'exact_public_asset_version',
    'exact_public_asset_digest',
    'public_asset_download',
  ]);
  assert.equal(gate.current_source_linked_host_evidence_may_substitute, false);
  assert.equal(
    gate.close_condition,
    'standard_and_full_qualification_and_public_readback_are_bound_to_the_same_stable_cohort',
  );
});

test('current source-linked host proves KimiCU effective without claiming packaged qualification', () => {
  const evidence = computerUseQualification.current_source_linked_host_evidence;
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.evidence_class, 'current_source_linked_host_only');
  assert.equal(evidence.runtime_source, 'globally_linked_canonical_framework_checkout');
  assert.deepEqual(evidence.installed_identity, {
    version: '0.5.4',
    bundle_id: 'ai.kimi.cu',
    team_id: '2J9472RW75',
    target_path: '/Applications/KimiCU.app',
    architecture: 'arm64',
    signature_and_notarization: 'passed',
  });
  assert.deepEqual(evidence.service_and_permission_readback, {
    service_registered: true,
    xpc_ping: 'passed',
    accessibility: 'granted',
    screen_recording: 'granted',
  });
  assert.equal(evidence.mcp_readback.observed_tools_count, 10);
  assert.equal(evidence.mcp_readback.tools_exact, true);
  assert.deepEqual(evidence.mcp_readback.live_read_operations, [
    'list_apps',
    'get_app_state(com.apple.finder)',
  ]);
  assert.equal(evidence.desktop_startup_readback.target_status, 'ready');
  assert.equal(evidence.desktop_startup_readback.reason, 'already_ready');
  assert.deepEqual(evidence.does_not_prove, [
    'standard_packaged_install',
    'full_packaged_install',
    'standard_full_clean_vm_parity',
    'public_release_qualification',
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
      visual_fallback: identity.provider_id,
    },
  );

  assert.equal(browserProfile.policy_ref, 'contracts/app-gui-product-contract.json#computer_use_policy.browser_provider');
  assert.equal(browserProfile.default_provider, browserPolicy.provider_id);
  assert.equal(browserProfile.mcp_server_id, browserPolicy.mcp_server_id);
  assert.equal(browserProfile.registry_authority, browserPolicy.registry_authority);
  assert.equal(browserProfile.registry_writer_ref, browserPolicy.registry_writer_ref);
  assert.equal(browserProfile.kimi_cu_visual_fallback.provider_id, identity.provider_id);
  assert.equal(browserProfile.kimi_cu_visual_fallback.may_replace_structured_default, false);
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
  assert.equal(browserPolicy.authority_boundary.kimi_cu_visual_fallback_may_replace_structured_default, false);
  assert.equal(fullManifest.runtime_payloads.playwright_mcp, undefined);
  assert.equal(fullManifest.sources.playwright_mcp, undefined);
});

test('Playwright MCP first-run qualification remains separate from CU5 installed evidence', () => {
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
  assert.equal(browserQualification.desktop_visual_fallback_provider_id, identity.provider_id);
  assert.equal(browserQualification.visual_fallback_may_substitute_for_structured_provider_qualification, false);
  assert.equal(browserQualification.missing_browser_provider_blocks_app_or_plain_codex_use, false);
  assert.equal(browserQualification.app_contract_status, 'complete');
  assert.equal(browserQualification.source_implementation_status, 'complete');
  assert.deepEqual(browserQualification.source_host_structured_smoke_evidence, {
    status: 'passed',
    evidence_class: 'source_host_only',
    provider_runtime: '@playwright/mcp@0.0.79',
    browser_identity_observed: 'Google Chrome 151.0.7922.77',
    browser_mode: 'isolated_headless_system_chrome',
    protocol_version: '2025-06-18',
    server_identity_observed: 'Playwright 1.63.0-alpha-2026-08-05',
    observed_tools_count: 24,
    observed_structured_operations: ['browser_navigate', 'browser_snapshot'],
    snapshot_semantics_observed: ['OPL CU6 Structured Smoke', 'Ready'],
    proves: [
      'framework_source_host_mcp_initialize_and_tools_list',
      'framework_source_host_real_system_chrome_structured_navigation_and_snapshot',
    ],
    does_not_prove: [
      'standard_packaged_install',
      'full_packaged_install',
      'clean_vm_first_run',
      'installed_registration_or_readiness',
      'release_qualification',
    ],
  });
  assert.deepEqual(browserQualification.current_source_linked_host_evidence, {
    status: 'passed',
    evidence_class: 'current_source_linked_host_only',
    observed_at: '2026-08-11',
    runtime_source: 'globally_linked_canonical_framework_checkout',
    registry_entry_uses_canonical_framework_dependency: true,
    registry_entry_uses_task_worktree: false,
    provider_runtime: '@playwright/mcp@0.0.79',
    browser_identity_observed: 'Google Chrome 151.0.7922.77',
    mcp_initialize: 'passed',
    observed_tools_count: 24,
    tools_exact: true,
    observed_structured_operations: [
      'browser_navigate(https://example.com/)',
      'browser_snapshot',
    ],
    snapshot_semantics_observed: ['Example Domain'],
    desktop_startup_readback: {
      status: 'completed',
      target_status: 'ready',
      reason: 'already_ready',
      attention_required_targets_count: 0,
      blocking_targets_count: 0,
    },
    proves: [
      'current_source_linked_host_codex_registry_and_mcp_readiness',
      'current_source_linked_host_real_system_chrome_navigation_and_snapshot',
      'current_source_linked_host_default_desktop_startup_readiness',
    ],
    does_not_prove: [
      'standard_packaged_install',
      'full_packaged_install',
      'standard_full_clean_vm_parity',
      'public_release_qualification',
    ],
  });
  assert.equal(browserQualification.installed_and_release_qualification_status, 'unverified');
  assert.equal(browserDistribution.release_qualification.installed_and_release_status, 'unverified');
  assert.equal(browserPolicy.delivery_status, 'source_implementation_complete_installed_qualification_pending');
  assert.equal(browserProfile.delivery_status, browserPolicy.delivery_status);
  assert.equal(browserPolicy.browser_mode, 'isolated_headless_system_chrome');
  assert.equal(browserDistribution.browser_mode, browserPolicy.browser_mode);
  assert.deepEqual(browserQualification.must_not_create, [
    'second_browser_engine',
    'browser_provider_catalog',
    'second_mcp_registry_writer',
    'browser_session_store',
  ]);
});
