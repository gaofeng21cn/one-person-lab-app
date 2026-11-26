import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';
import { assertPhysicalVmQualification } from '../../validate-release-boundary/release-contract-policy/vm-qualification.ts';

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

function validateVmAcceleration(releaseChannel) {
  assertPhysicalVmQualification(releaseChannel?.release_acceleration);
}

export { validateSettingsAndAssistantRoute, validateVmAcceleration };
