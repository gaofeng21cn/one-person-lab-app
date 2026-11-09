import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';
import { assertShellTextIncludesAll } from '../shell-implementation-helpers.ts';
import { sameStringSet } from './string-set.ts';

function validateSettingsAndAssistantRoute(releaseChannel, shellPaths, validationProfile) {
  const acceleration = releaseChannel?.release_acceleration;
  const settingsReadiness = acceleration?.settings_page_readiness_policy;
  const settingsRuntimeRefresh = acceleration?.settings_runtime_refresh_evidence_policy;
  const assistantRouteSmoke = acceleration?.assistant_route_smoke_policy;

  assertIncludesAll(
    settingsReadiness?.required_signals,
    ['expected_route_hash', 'stable_page_data_testid', 'nonempty_page_text', 'app_loader_not_visible'],
    'Settings VM semantic readiness signals',
  );
  assertIncludesAll(
    settingsReadiness?.forbidden_release_gate_signals,
    ['localized_button_copy', 'localized_heading_copy', 'retired_runtime_status_label'],
    'Settings VM forbidden copy gates',
  );
  assertDeepEqualJson(
    settingsRuntimeRefresh,
    {
      schema: 'opl_settings_runtime_refresh_evidence_policy.v1',
      production_default_targets_required: true,
      synthetic_target_injection_allowed: false,
      required_routes: [
        {
          id: 'runtime-settings-alias',
          requested_hash: '#/settings/runtime',
          allowed_resolved_hash_prefixes: ['#/settings/environment'],
        },
        {
          id: 'runtime-status',
          requested_hash: '#/runtime',
          allowed_resolved_hash_prefixes: ['#/runtime'],
        },
      ],
      required_evidence_fields: [
        'id',
        'requested_hash',
        'resolved_hash',
        'interactions.runtimeRefresh.requested_hash',
        'interactions.runtimeRefresh.resolved_hash',
        'interactions.runtimeRefresh.readiness.hash',
        'interactions.runtimeRefresh.readiness.state',
        'interactions.runtimeRefresh.readiness.pageReady',
        'interactions.runtimeRefresh.refresh.before_click.buttonReady',
        'interactions.runtimeRefresh.refresh.after_click.buttonReady',
      ],
      allowed_readiness_states: ['ready', 'empty'],
      distinct_entry_per_route_required: true,
      default_timeout_ms: 30000,
      phase_timeout_binding: 'min_timeout_ms_and_codex_readiness_phase_timeout_ms_or_timeout_ms',
      validator: 'scripts/validate-settings-smoke-runtime-evidence.ts',
      workflow: '.github/workflows/opl-first-run-vm.yml',
      verification_artifact: 'artifacts/opl-first-run-vm/artifacts/settings-runtime-refresh-verification.json',
      source_implementation_failure_mode: 'fail_closed_before_expensive_build_or_vm',
      runtime_evidence_failure_mode: 'fail_closed_before_qualification_receipt_or_publication',
      rule: 'Production Settings smoke must exercise both the legacy Settings Runtime alias and the standalone Runtime route with independent requested/resolved route identity, structural readiness, and pre/post refresh idle evidence. Synthetic target injection may support unit tests but cannot satisfy the production release gate.',
    },
    'Settings Runtime refresh production evidence policy',
  );
  if (shellPaths?.contract.active_shell === 'aionui') {
    assertShellTextIncludesAll(
      shellPaths,
      'scripts/opl-first-run-vm-smoke.mjs',
      [
        'function buildRuntimeRefreshProbePlan(requestedHash, timeoutMs = DEFAULT_RUNTIME_REFRESH_TIMEOUT_MS)',
        "requestedHash === '#/settings/runtime'",
        "mode: 'settings-maintenance-updates'",
        "aliasResolvedHash: '#/settings/environment'",
        "refreshHash: '#/settings/environment?section=updates'",
        'function settingsRuntimeAliasResolutionExpression(requestedHash, aliasResolvedHash)',
        'function settingsMaintenanceUpdatesReadinessExpression(refreshHash)',
        'function settingsUpdatesRefreshButtonIdleExpression()',
        'function settingsUpdatesRefreshClickExpression()',
        "const selector = '[data-testid=\"opl-managed-update-refresh\"]'",
        "requestedHash === '#/runtime'",
        "mode: 'runtime-v2'",
        "resolvedHashPrefixes: ['#/runtime']",
        'async function exerciseRuntimeRefresh(client, targetHash, timeoutMs = DEFAULT_RUNTIME_REFRESH_TIMEOUT_MS)',
        'settingsRuntimeAliasResolutionExpression(probePlan.requestedHash, probePlan.aliasResolvedHash)',
        'settingsMaintenanceUpdatesReadinessExpression(probePlan.refreshHash)',
        'settingsUpdatesRefreshClickExpression()',
        'requested_hash: targetHash',
        'alias_resolved_hash: aliasResolution.aliasResolvedHash ?? aliasResolution.hash',
        'resolved_hash: resolvedHash',
        'const runtimeRefreshTimeoutMs = Math.min(',
        'options.codexReadinessPhaseTimeoutMs ?? options.timeoutMs',
        "const settingsRuntimeRefresh = await (hooks.exerciseRuntimeRefresh ?? exerciseRuntimeRefresh)(",
        "'#/settings/runtime',",
        "id: 'runtime-settings-alias'",
        "const standaloneRuntimeRefresh = await (hooks.exerciseRuntimeRefresh ?? exerciseRuntimeRefresh)(",
        "'#/runtime',",
        "id: 'runtime-status'",
      ],
      'production Settings Runtime dual-route refresh evidence',
    );
  }
  assertDeepEqualJson(
    assistantRouteSmoke?.standard?.required,
    [
      'compiled_release_qualification_targets_visible',
      'projection_state_observed_per_target',
      'projected_targets_selectable',
      'available_projected_targets_launch_admitted_without_send',
      'unavailable_projected_targets_send_blocked_with_typed_repair_guidance',
    ],
    'Standard assistant state-aware launch-admission requirements',
  );
  assertIncludesAll(
    assistantRouteSmoke?.full?.required,
    [
      'compiled_release_qualification_targets_visible',
      'projected_targets_launchable',
      'selected_project_directory_applied_to_session_and_domain_workspace_identity',
      'real_guid_composer_send_without_shell_package_activation_per_target',
      'conversation_get_readback_per_target',
      'Framework_stage_runtime_activation_uses_Stage_workspace_locator_per_target',
      'Framework_stage_runtime_activation_evidence_per_target',
      'release_evidence_route_receipt_per_target',
    ],
    'Full assistant production launch-path requirements',
  );
  assertIncludesAll(
    assistantRouteSmoke?.full?.forbidden,
    [
      'direct_conversation_post',
      'Shell_agent_package_activation_before_or_during_send',
      'synthetic_Framework_stage_runtime_activation_evidence',
      'synthetic_release_evidence_route_receipt',
    ],
    'Full assistant synthetic launch-path prohibitions',
  );
  if (
    assistantRouteSmoke?.standard?.verification_mode !== 'state_aware_launch_admission' ||
    assistantRouteSmoke?.full?.verification_mode !== 'route_receipt' ||
    assistantRouteSmoke?.target_fixture_ref !==
      'contracts/app-first-run-test-matrix.json#release_qualification_agent_target_fixture' ||
    assistantRouteSmoke?.target_fixture_boundary !==
      'release_qualification_probe_input_only_without_runtime_catalog_visibility_action_or_install_authority' ||
    assistantRouteSmoke?.runtime_target_resolution !==
      'resolve every fixture target from fresh app_state.agent_packages.directory.entries and status_index.home_shortcut_preferences before probing' ||
    !assistantRouteSmoke?.standard?.forbidden?.includes('claim_full_route_receipt_from_standard_launch_admission') ||
    !assistantRouteSmoke?.full?.required?.includes('release_evidence_route_receipt_per_target')
  ) {
    throw new Error(
      'Release assistant smoke must resolve a non-authoritative target fixture and separate Standard state-aware launch admission from Full route receipts',
    );
  }

}

function validateVmAcceleration(releaseChannel, shellPaths, validationProfile) {
  const acceleration = releaseChannel?.release_acceleration;

  const vmGates = Array.isArray(acceleration?.vm_gates) ? acceleration.vm_gates : [];
  const hostedLinux = acceleration?.hosted_linux_certification;
  assertDeepEqualJson(
    vmGates.map((gate) => gate?.id),
    [
      'standard_dmg_clean_vm_smoke',
      'homebrew_standard_cask_clean_vm_smoke',
      'full_dmg_clean_vm_smoke',
    ],
    'Physical VM qualification gates',
  );
  const requiredVmGates = vmGates.filter((gate) =>
    ['standard_dmg_clean_vm_smoke', 'full_dmg_clean_vm_smoke'].includes(gate?.id),
  );
  for (const gate of requiredVmGates) {
    const isFull = gate?.id === 'full_dmg_clean_vm_smoke';
    if (
      gate?.diagnostic_scope !== 'release_gate' ||
      gate?.gate_policy !== 'required_prepublication_same_candidate' ||
      gate?.runtime_profile !== (isFull ? 'full' : 'standard') ||
      !Array.isArray(gate?.certification_readiness) ||
      !gate.certification_readiness.includes(isFull
        ? 'official_profile_exact_roots_installed_without_restore'
        : 'official_profile_background_status_and_root_presence_observed_without_restore') ||
      !sameStringSet(gate?.release_blocking_readiness, [
        'gateway_account_login',
        ...(isFull ? ['official_profile_first_install'] : []),
        'fresh_framework_agent_projection',
      ])
    ) {
      throw new Error('Standard and Full physical VM qualification must fail closed on the exact same candidate');
    }
  }
  const optionalVmGate = vmGates.find((gate) => gate?.id === 'homebrew_standard_cask_clean_vm_smoke');
  if (
    optionalVmGate?.diagnostic_scope !== 'post_publication_optional_certification' ||
    optionalVmGate?.gate_policy !== 'optional_non_blocking_same_published_artifact' ||
    'release_blocking_readiness' in (optionalVmGate ?? {})
  ) {
    throw new Error('Homebrew physical VM qualification must remain post-publication optional certification');
  }
  const fullVmGate = vmGates.find((gate) => gate?.id === 'full_dmg_clean_vm_smoke');
  const legacyVmGate = acceleration?.vm_gate;
  for (const field of [
    'source',
    'artifact',
    'smoke_profile',
    'display',
    'settings_smoke',
    'diagnostic_scope',
    'runtime_profile',
    'codex_config_wizard',
    'gate_policy',
    'certification_readiness',
    'release_blocking_readiness',
    'post_core_ready_background_policy',
  ]) {
    assertDeepEqualJson(
      legacyVmGate?.[field],
      fullVmGate?.[field],
      `Legacy Full VM required qualification mirror ${field}`,
    );
  }
  assertDeepEqualJson(
    hostedLinux,
    {
      id: 'linux_x64_same_artifact_install_smoke',
      workflow: '.github/workflows/release-post-publication-certification.yml',
      runner: 'ubuntu-latest',
      platform: 'linux-x64',
      artifact: 'One-Person-Lab-<version>-linux-x64.deb',
      installer: 'opl-install.sh',
      installer_arguments: ['--desktop', '--release-tag', '<exact-tag>', '--no-open'],
      app_release_single_tag_asset_binding_required: true,
      same_release_tag_required: true,
      desktop_manifest_cohort_binding_required: true,
      same_deb_artifact_identity_required: true,
      cross_component_version_sha_or_cohort_equality_required: false,
      dependency_compatibility_contract_ref:
        'contracts/app-install-exposure-policy.json#component_interoperability.compatibility_admission',
      typed_admission_schema: 'opl_app_stable_desktop_asset_append.v1',
      typed_execution_evidence_schema: 'opl_app_linux_same_tag_desktop_install.v1',
      clean_machine_preinstall_absence_required: true,
      installed_executable_byte_parity_required: true,
      failed_download_evidence_truthful_required: true,
      terminal_statuses: ['passed', 'failed'],
      unavailable_allowed: false,
      downloaded_from_published_release_required: true,
      rebuilt_allowed: false,
      failure_receipt_uploaded_before_job_failure: true,
      gate_policy: 'optional_non_blocking_same_published_artifact',
      required_for_publication_or_latest: false,
    },
    'GitHub-hosted Linux x64 same-artifact optional certification',
  );

}

export { validateSettingsAndAssistantRoute, validateVmAcceleration };
