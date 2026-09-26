import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type {
  OPLStudioCarrierEvidenceExpectation,
  OPLStudioCarrierId,
  ShellCandidate,
  ValidationCommand,
} from './types.ts';
import { assertDeepEqualJson } from '../validate-active-shell/assertions.ts';
import { requiredDSHSourceReuseSurfaces, validateCandidateImplementationFiles } from './candidate-contract.ts';
import {
  assertDirectory,
  assertFile,
  assertNoAbsoluteSymlinks,
  assertRelativePath,
  assertStringArrayIncludes,
  expectedFrameworkSurfaces,
  findMacAppExecutable,
  forbiddenSeriesDomainFields,
  readJson,
  requiredConversationEventKinds,
  requiredNativeCapabilities,
  requiredSeriesProgressFields,
  resolveCandidateRoot,
  root,
  validateActiveProjectLineStateModel,
} from './shared.ts';

const deepSeekHarnessApplicationHostRef = '477b4f420553e8a52c2fbccc464d7561b239c443';
const deepSeekHarnessPackageRoots = [
  'packages/client/ui-layout/src',
  'packages/client/ui-sidebar/src',
  'packages/client/ui-conversation/src',
  'packages/client/ui-input-trigger/src',
  'packages/client/ui-model-selection/src',
  'packages/client/ui-agent-preset/src',
  'packages/client/ui-workspace/src',
  'packages/client/ui-settings-general/src',
  'packages/client/ui-theme/src',
  'packages/client/ui-primitives/src',
  'packages/client/ui-renderer/src',
  'packages/client/ui-sidebar-files/src',
  'packages/client/ui-sidebar-documentpreview/src',
  'packages/client/ui-sidebar-right/src',
  'packages/client/ui-deliverables/src',
  'packages/client/ui-open-in-app/src',
  'packages/client/ui-dockkit/src',
  'packages/client/resources/src',
  'packages/util/workspace-path/src',
];
const studioSettingsGroups = [
  'overview',
  'account_models',
  'connections_deployment',
  'workspace',
  'agents_capabilities',
  'runtime_maintenance',
  'preferences',
];
const retiredStudioSettingsTabs = [
  'runtime',
  'system',
  'model',
  'agent',
  'assistants',
  'skills-hub',
  'tools',
  'display',
  'webui',
  'pet',
];

export type OPLStudioCarrierEvidenceEntry = {
  carrier_id: OPLStudioCarrierId;
  source_implementation: {
    status: 'implemented';
    refs: string[];
  };
  package_build: {
    status: 'passed_local_candidate_build';
    artifact_kind: string;
    artifact_path: string;
  };
  local_qualification: {
    status: 'passed_local_candidate_qualification';
    commands: string[];
  };
  user_service_manager_source: OPLStudioCarrierEvidenceExpectation['user_service_manager_source'];
  distribution_wiring: {
    status: 'not_wired';
    current_aionui_release_evidence_reused: false;
  };
  update_adapter_source: OPLStudioCarrierEvidenceExpectation['update_adapter_source'];
  update_wiring: {
    status: 'not_wired';
  };
  release: OPLStudioCarrierEvidenceExpectation['release'];
  multi_arch_qualification?: 'plan_only_not_qualified';
  signature_verification?: 'not_implemented';
};

export type OPLStudioCarrierEvidenceManifest = {
  schema: 'opl_studio_carrier_evidence.v1';
  candidate_id: 'opl-studio';
  source_commit: string;
  candidate_only: true;
  release_authority: false;
  product_profile_owner: 'one-person-lab-app';
  default_release_shell_unchanged: true;
  active_shell_adopted: false;
  runtime_authority_transfer: false;
  domain_truth_owned: false;
  shared_renderer: 'deepseek_harness_derived_react';
  shared_host_core: 'scripts/webui-host/host-core.mjs';
  bridge_abi: 'opl_app_host_bridge.v1';
  carriers: Record<OPLStudioCarrierId, OPLStudioCarrierEvidenceEntry>;
};

export function runCandidateCommands(candidate: ShellCandidate): void {
  if (candidate.id !== 'opl-studio') {
    throw new Error(`Only the foreground Native candidate may own full candidate evidence: ${candidate.id}`);
  }

  for (const entry of candidate.validation_commands) {
    if (entry.optional) continue;
    runRequiredCommand(candidate, 'validation', entry);
    if (entry.id === 'candidate_app_bundle_build') {
      validateOPLStudioCarrierEvidenceManifestFile(candidate);
    }
    if (entry.id === 'candidate_packaged_first_run_smoke') {
      validateOPLStudioCarrierEvidenceManifestFile(candidate);
    }
  }

  validateCandidateImplementationFiles(candidate);
  validateOPLStudioImplementationEvidenceFile(candidate);
}

function runRequiredCommand(candidate: ShellCandidate, commandKind: string, entry: ValidationCommand): void {
  const cwd = entry.cwd === candidate.candidate_root
    ? resolveCandidateRoot(candidate.candidate_root)
    : path.join(root, entry.cwd);
  const result = spawnSync(entry.command, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${candidate.id} ${commandKind} command failed: ${entry.id}`);
  }
}

export function validateOPLStudioCarrierEvidenceManifestFile(
  candidate: ShellCandidate,
): void {
  const contract = candidate.carrier_evidence_contract;
  if (!contract) {
    throw new Error(`${candidate.id} must declare carrier_evidence_contract`);
  }
  const candidateRoot = resolveCandidateRoot(candidate.candidate_root);
  const manifestPath = path.join(candidateRoot, contract.manifest_path);
  assertFile(manifestPath, `${candidate.id} carrier evidence manifest`);
  validateOPLStudioCarrierEvidenceManifest(
    candidate,
    readJson<OPLStudioCarrierEvidenceManifest>(manifestPath),
    candidateRoot,
  );
}

function validateCarrierArtifact(
  candidateId: string,
  carrierId: OPLStudioCarrierId,
  entry: OPLStudioCarrierEvidenceEntry,
  candidateRoot: string,
): void {
  assertRelativePath(entry.package_build.artifact_path, `${candidateId} ${carrierId} artifact_path`);
  const artifactPath = path.join(candidateRoot, entry.package_build.artifact_path);
  if (carrierId !== 'electron_desktop') {
    assertFile(artifactPath, `${candidateId} ${carrierId} candidate artifact evidence`);
    return;
  }
  if (!entry.package_build.artifact_path.endsWith('.app')) {
    throw new Error(`${candidateId} electron_desktop artifact must point at a .app bundle`);
  }
  assertDirectory(artifactPath, `${candidateId} electron_desktop .app bundle`);
  assertFile(path.join(artifactPath, 'Contents', 'Info.plist'), `${candidateId} electron_desktop Info.plist`);
  const macOsDir = path.join(artifactPath, 'Contents', 'MacOS');
  assertDirectory(macOsDir, `${candidateId} electron_desktop Contents/MacOS`);
  if (findMacAppExecutable(macOsDir, candidateId) !== 'One Person Lab Preview') {
    throw new Error(`${candidateId} electron_desktop .app must use the One Person Lab Preview executable name`);
  }
  assertNoAbsoluteSymlinks(artifactPath, candidateId);
}

export function validateOPLStudioCarrierEvidenceManifest(
  candidate: ShellCandidate,
  manifest: OPLStudioCarrierEvidenceManifest,
  candidateRoot: string,
): void {
  const contract = candidate.carrier_evidence_contract;
  if (!contract) {
    throw new Error(`${candidate.id} must declare carrier_evidence_contract`);
  }
  assertDeepEqualJson(
    Object.keys(manifest),
    [
      'schema',
      'candidate_id',
      'source_commit',
      'candidate_only',
      'release_authority',
      'product_profile_owner',
      'default_release_shell_unchanged',
      'active_shell_adopted',
      'runtime_authority_transfer',
      'domain_truth_owned',
      'shared_renderer',
      'shared_host_core',
      'bridge_abi',
      'carriers',
    ],
    `${candidate.id} carrier evidence top-level fields`,
  );
  assertDeepEqualJson(
    {
      schema: manifest.schema,
      candidate_id: manifest.candidate_id,
      candidate_only: manifest.candidate_only,
      release_authority: manifest.release_authority,
      product_profile_owner: manifest.product_profile_owner,
      default_release_shell_unchanged: manifest.default_release_shell_unchanged,
      active_shell_adopted: manifest.active_shell_adopted,
      runtime_authority_transfer: manifest.runtime_authority_transfer,
      domain_truth_owned: manifest.domain_truth_owned,
      shared_renderer: manifest.shared_renderer,
      shared_host_core: manifest.shared_host_core,
      bridge_abi: manifest.bridge_abi,
    },
    {
      schema: contract.schema,
      candidate_id: 'opl-studio',
      candidate_only: contract.candidate_only,
      release_authority: contract.release_authority,
      product_profile_owner: contract.product_profile_owner,
      default_release_shell_unchanged: true,
      active_shell_adopted: false,
      runtime_authority_transfer: false,
      domain_truth_owned: false,
      shared_renderer: contract.shared_renderer,
      shared_host_core: contract.shared_host_core,
      bridge_abi: contract.bridge_abi,
    },
    `${candidate.id} carrier evidence authority boundary`,
  );
  if (!/^[0-9a-f]{40}$/.test(manifest.source_commit)) {
    throw new Error(`${candidate.id} carrier evidence source_commit must be an exact lowercase Git SHA`);
  }
  assertDeepEqualJson(
    Object.keys(manifest.carriers ?? {}),
    contract.required_entries,
    `${candidate.id} carrier evidence entries`,
  );

  for (const carrierId of contract.required_entries) {
    const expected = contract.entries[carrierId];
    const entry = manifest.carriers[carrierId];
    if (!entry || entry.carrier_id !== carrierId) {
      throw new Error(`${candidate.id} carrier evidence must contain ${carrierId}`);
    }
    assertDeepEqualJson(
      Object.keys(entry),
      [
        'carrier_id',
        'source_implementation',
        'package_build',
        'local_qualification',
        'user_service_manager_source',
        'distribution_wiring',
        'update_adapter_source',
        'update_wiring',
        'release',
        ...(carrierId === 'docker_webui'
          ? ['multi_arch_qualification', 'signature_verification']
          : []),
      ],
      `${candidate.id} ${carrierId} evidence fields`,
    );
    assertDeepEqualJson(
      {
        carrier_id: entry.carrier_id,
        source_implementation: entry.source_implementation,
        package_build_status: entry.package_build?.status,
        package_artifact_kind: entry.package_build?.artifact_kind,
        local_qualification: entry.local_qualification,
        user_service_manager_source: entry.user_service_manager_source,
        distribution_wiring: entry.distribution_wiring,
        update_adapter_source: entry.update_adapter_source,
        update_wiring: entry.update_wiring,
        release: entry.release,
        ...(carrierId === 'docker_webui'
          ? {
              multi_arch_qualification: entry.multi_arch_qualification,
              signature_verification: entry.signature_verification,
            }
          : {}),
      },
      {
        carrier_id: carrierId,
        source_implementation: { status: 'implemented', refs: expected.source_refs },
        package_build_status: 'passed_local_candidate_build',
        package_artifact_kind: expected.package_artifact_kind,
        local_qualification: {
          status: 'passed_local_candidate_qualification',
          commands: expected.qualification_commands,
        },
        user_service_manager_source: expected.user_service_manager_source,
        distribution_wiring: {
          status: expected.distribution_wiring_status,
          current_aionui_release_evidence_reused: false,
        },
        update_adapter_source: expected.update_adapter_source,
        update_wiring: { status: expected.update_wiring_status },
        release: expected.release,
        ...(carrierId === 'docker_webui'
          ? {
              multi_arch_qualification: expected.multi_arch_qualification,
              signature_verification: expected.signature_verification,
            }
          : {}),
      },
      `${candidate.id} ${carrierId} candidate evidence status`,
    );
    for (const sourceRef of [...expected.source_refs, expected.update_adapter_source.ref]) {
      assertRelativePath(sourceRef, `${candidate.id} ${carrierId} source ref`);
      assertFile(path.join(candidateRoot, sourceRef), `${candidate.id} ${carrierId} source ref`);
    }
    validateCarrierArtifact(candidate.id, carrierId, entry, candidateRoot);
  }
}

function validateOPLStudioImplementationEvidenceFile(candidate: ShellCandidate): void {
  const evidencePath = path.join(resolveCandidateRoot(candidate.candidate_root), 'src', 'candidateContractEvidence.json');
  assertFile(evidencePath, `${candidate.id} contract evidence`);
  const evidence = readJson<Record<string, any>>(evidencePath);
  if (evidence.owner !== 'one-person-lab-app' || evidence.shell !== candidate.id) {
    throw new Error(`${candidate.id} evidence must be App-owned and match the candidate id`);
  }
  validateOPLStudioImplementationEvidence(candidate, evidence);
}

function validateOPLStudioImplementationEvidence(
  candidate: ShellCandidate,
  evidence: Record<string, any>,
): void {
  assertStringArrayIncludes(
    evidence.capabilities ?? [],
    requiredNativeCapabilities,
    `${candidate.id} evidence capabilities`,
  );
  validateActiveProjectLineStateModel(
    evidence.active_project_line_state_model,
    `${candidate.id} evidence active_project_line_state_model`,
  );
  assertDeepEqualJson(
    evidence.settings_information_architecture?.visible_tabs ?? [],
    studioSettingsGroups,
    `${candidate.id} evidence settings_information_architecture.visible_tabs`,
  );
  assertDeepEqualJson(
    evidence.settings_information_architecture?.legacy_tabs_hidden ?? [],
    retiredStudioSettingsTabs,
    `${candidate.id} evidence settings_information_architecture.legacy_tabs_hidden`,
  );
  if (
    evidence.bilingual_ui?.default_locale !== 'zh'
    || evidence.bilingual_ui?.ordinary_ui_policy !== 'same_screen_single_language_for_user_visible_chrome'
    || evidence.bilingual_ui?.language_toggle_testid !== 'opl-locale-toggle'
  ) {
    throw new Error(`${candidate.id} evidence must define bilingual UI as same-screen single-language user-visible chrome`);
  }
  assertStringArrayIncludes(
    evidence.bilingual_ui?.supported_locales ?? [],
    ['zh', 'en'],
    `${candidate.id} evidence bilingual_ui.supported_locales`,
  );
  if (
    evidence.default_home_layout?.policy !== 'ordinary home uses the directly reused DeepSeek Harness chat-first composition baseline: workspace rail visible, conversation dominant, composer persistent, and secondary context closed until requested'
    || evidence.default_home_layout?.workspace_rail_default_open !== true
    || evidence.default_home_layout?.inspector_default_open !== false
  ) {
    throw new Error(`${candidate.id} evidence must prove the DeepSeek Harness chat-first layout is the default and secondary context stays closed`);
  }

  validateDeepSeekHarnessCompositionEvidence(
    candidate.id,
    evidence.default_home_layout,
  );

  if (
    evidence.webui_transport?.renderer !== 'src/workbench/App.tsx'
    || evidence.webui_transport?.host_core !== 'scripts/webui-host/host-core.mjs'
    || evidence.webui_transport?.native_host !== 'desktop/main.mjs'
    || evidence.webui_transport?.native_transport !== 'desktop/preload.cjs#window.oplStudio'
    || evidence.webui_transport?.web_transport !== 'src/bridge/webTransport.ts'
    || evidence.webui_transport?.gateway !== 'scripts/dev-webui-server.mjs'
    || evidence.webui_transport?.shared_surface !== true
    || evidence.webui_transport?.events !== 'GET /api/opl-events uses SSE for Codex App Server and typed host events'
  ) {
    throw new Error(`${candidate.id} evidence must prove one renderer and shared Node host core across Electron desktop and WebUI adapters`);
  }
  if (
    evidence.reuse_policy?.deepseek_harness_source_usage !== 'pinned_application_host_runtime_and_gui_source_reuse'
    || evidence.reuse_policy?.deepseek_harness_source_ref !== deepSeekHarnessApplicationHostRef
    || evidence.reuse_policy?.deepseek_harness_package_version !== '0.1.7-rc.2'
    || evidence.reuse_policy?.deepseek_harness_selected_source_reused !== true
    || evidence.reuse_policy?.other_external_gui_source_copied !== false
    || evidence.reuse_policy?.application_host_runtime_adopted !== true
    || evidence.reuse_policy?.dsh_product_runtime_authority_adopted !== false
  ) {
    throw new Error(`${candidate.id} evidence must prove the pinned DeepSeek Harness Application Host and GUI cohort without adopting DSH product runtime authority`);
  }
  assertDeepEqualJson(
    evidence.application_host,
    candidate.application_host_contract,
    `${candidate.id} evidence Application Host`,
  );
  const guiContract = readJson<Record<string, any>>(
    path.join(root, 'contracts', 'app-gui-product-contract.json'),
  );
  const appComposition = guiContract.framework_surfaces?.package_app_contributions?.ui_composition;
  const clientComposition = evidence.client_composition_boundary;
  assertDeepEqualJson(
    {
      framework_host_composition_authority: clientComposition?.framework_host_composition_authority,
      framework_host_composition_authority_scope: clientComposition?.framework_host_composition_authority_scope,
      framework_runtime_and_package_composition_authority:
        clientComposition?.framework_runtime_and_package_composition_authority,
      studio_application_host: clientComposition?.studio_application_host,
      studio_application_host_scope: clientComposition?.studio_application_host_scope,
      studio_application_host_may_exist_without_authority_transfer:
        clientComposition?.studio_application_host_may_exist_without_authority_transfer,
    },
    {
      framework_host_composition_authority: appComposition?.framework_host_composition_authority,
      framework_host_composition_authority_scope: appComposition?.framework_host_composition_authority_scope,
      framework_runtime_and_package_composition_authority:
        appComposition?.framework_runtime_and_package_composition_authority,
      studio_application_host: appComposition?.studio_application_host,
      studio_application_host_scope: appComposition?.studio_application_host_scope,
      studio_application_host_may_exist_without_authority_transfer:
        appComposition?.studio_application_host_may_exist_without_authority_transfer,
    },
    `${candidate.id} evidence Host scope boundary`,
  );
  assertStringArrayIncludes(
    evidence.reuse_policy?.adopted_patterns ?? [],
    [
      'project sandbox organization',
      'result and artifact delivery panel',
      'structured confirmation forms',
      'rich file preview affordances',
    ],
    `${candidate.id} evidence reuse_policy.adopted_patterns`,
  );
  const reusedModules = evidence.reused_oss_module_policy;
  if (
    reusedModules?.policy !== 'pinned_deepseek_harness_application_host_and_gui_source_reuse_other_gui_sources_reference_only'
    || reusedModules?.vendored_source_root !== 'src/vendor/deepseek-harness'
    || reusedModules?.source_manifest !== 'src/composition/deepseekHarnessSourceManifest.json'
    || reusedModules?.vendored_file_count !== 404
    || reusedModules?.byte_identical !== true
    || reusedModules?.byte_identical_to_pinned_ref !== true
    || reusedModules?.slot_renderer_source !== 'packages/client/ui-renderer/src/client/scoped-slots.tsx#createSlotRenderer'
    || reusedModules?.brand_override !== 'upstream_rc2_brand_slots_with_text_only_opl_occupants'
    || reusedModules?.attachment_slot_policy !== 'registered_empty_slot_with_studio_controlled_inputbar_attachment_rail'
    || reusedModules?.workspace_host_description_policy !== 'unavailable_until_app_abi_exists'
    || reusedModules?.home_path_abbreviation_policy !== 'posix_boundary_shim_windows_fail_open_without_app_home_field'
    || reusedModules?.application_host_runtime_adopted !== true
    || reusedModules?.dsh_product_runtime_authority_adopted !== false
  ) {
    throw new Error(`${candidate.id} evidence must bind the pinned Application Host and 404 byte-identical GUI files to OPL-owned plugins without product authority transfer`);
  }
  assertDeepEqualJson(reusedModules.direct_reuse_modules, [
    '@deepseek-ai/cordis@4.0.2',
    '@deepseek-ai/cordis-plugin-group@1.0.2',
    '@deepseek-ai/cordis-plugin-include@1.0.7',
    '@deepseek-ai/cordis-plugin-loader@1.0.3',
    '@deepseek-ai/dsh-client-store@0.1.7-rc.2',
    '@deepseek-ai/dsh-agent-preset-registry@0.1.7-rc.2',
    '@deepseek-ai/dsh-util-code-language@0.1.7-rc.2',
    '@deepseek-ai/dsh-util-workspace-path@0.1.7-rc.2',
    '@deepseek-ai/dsh-app-boot@0.1.7-rc.2',
    '@deepseek-ai/dsh-brand@0.1.7-rc.2',
    '@deepseek-ai/dsh-client-modules@0.1.7-rc.2',
    '@deepseek-ai/dsh-client-ui-dockkit@0.1.7-rc.2',
    '@deepseek-ai/dsh-client-ui-primitives@0.1.7-rc.2',
    '@deepseek-ai/dsh-client-ui-slots@0.1.7-rc.2',
    '@deepseek-ai/dsh-client-web@0.1.7-rc.2',
    '@deepseek-ai/dsh-home-paths@0.1.7-rc.2',
    '@deepseek-ai/dsh-host-frontend-static@0.1.7-rc.2',
    '@deepseek-ai/dsh-host-plugin-inventory@0.1.7-rc.2',
    '@deepseek-ai/dsh-host-webserver@0.1.7-rc.2',
    '@deepseek-ai/dsh-invariants@0.1.7-rc.2',
    '@deepseek-ai/dsh-launch-environment@0.1.7-rc.2',
    '@deepseek-ai/dsh-llm@0.1.7-rc.2',
    '@deepseek-ai/dsh-scope@0.1.7-rc.2',
    '@deepseek-ai/dsh-sandbox@0.1.7-rc.2',
    '@deepseek-ai/dsh-sandbox-policy@0.1.7-rc.2',
    '@deepseek-ai/dsh-session@0.1.7-rc.2',
    '@deepseek-ai/dsh-system-prompt@0.1.7-rc.2',
    '@deepseek-ai/dsh-timeout@0.1.7-rc.2',
    '@deepseek-ai/dsh-tools@0.1.7-rc.2',
    '@deepseek-ai/dsh-typert-protocol@0.1.7-rc.2',
    'use-sync-external-store@1.2.0',
  ], `${candidate.id} evidence reused_oss_module_policy.direct_reuse_modules`);
  assertDeepEqualJson(
    reusedModules.vendored_package_roots,
    deepSeekHarnessPackageRoots,
    `${candidate.id} evidence reused_oss_module_policy.vendored_package_roots`,
  );
  if (
    evidence.secondary_runtime_context_refs?.authority !== 'opl_framework_refs_only_projection'
    || evidence.secondary_runtime_context_refs?.home_surface_policy !== 'ordinary_home_must_not_render_runtime_activity_or_continue_work'
  ) {
    throw new Error(`${candidate.id} evidence must keep current-task refs Framework-owned and out of ordinary Home`);
  }
  assertStringArrayIncludes(
    evidence.conversation_event_rendering?.event_kinds ?? [],
    requiredConversationEventKinds,
    `${candidate.id} evidence conversation_event_rendering.event_kinds`,
  );
  assertStringArrayIncludes(
    evidence.first_run_matrix_mapping?.required_shell_testids ?? [],
    ['opl-studio-root', 'opl-model-access-entry', 'opl-skip-to-chat'],
    `${candidate.id} evidence first-run testids`,
  );
  if (
    evidence.webui_parity?.shared_renderer !== true
    || evidence.webui_parity?.bridge_shape !== 'window.oplStudio'
    || evidence.webui_parity?.product_profile !== 'src/generated/oplProductProfile.generated.json'
    || evidence.webui_parity?.desktop_and_webui_default_home !== 'chat_first_default_collapsed'
  ) {
    throw new Error(`${candidate.id} evidence must prove WebUI and Electron desktop use the same renderer, bridge shape, product profile, and default home semantics`);
  }

  const evidenceSeriesDisplay = evidence.foundry_agent_series_display_contract;
  if (evidenceSeriesDisplay?.authority !== 'opl_framework_shared_progress_projection') {
    throw new Error(`${candidate.id} evidence must bind Foundry series display to the shared OPL progress projection`);
  }
  assertStringArrayIncludes(
    evidenceSeriesDisplay?.required_shared_progress_fields ?? [],
    requiredSeriesProgressFields,
    `${candidate.id} evidence foundry_agent_series_display_contract.required_shared_progress_fields`,
  );
  assertStringArrayIncludes(
    evidenceSeriesDisplay?.forbidden_domain_fields ?? [],
    forbiddenSeriesDomainFields,
    `${candidate.id} evidence foundry_agent_series_display_contract.forbidden_domain_fields`,
  );
  for (const [surface, expected] of Object.entries(expectedFrameworkSurfaces)) {
    if (evidence.framework_surfaces?.[surface] !== expected) {
      throw new Error(`${candidate.id} evidence framework_surfaces.${surface} must be ${expected}`);
    }
  }
}

export function validateDeepSeekHarnessProductLayoutContract(
  candidateId: string,
  alignment: Record<string, any> | undefined,
): void {
  if (
    alignment?.reference_product !== 'DeepSeek Harness Web client'
    || alignment?.project_rail !== 'persistent'
    || alignment?.timeline !== 'single_conversation_timeline'
    || alignment?.model_controls !== 'composer_bottom_row'
    || alignment?.reasoning_controls !== 'composer_bottom_row'
    || alignment?.details !== 'dsh_resizable_column_on_desktop_fullscreen_overlay_on_mobile'
    || alignment?.settings_locale_surface !== 'settings'
    || alignment?.model_policy_source !== 'one-person-lab-app/contracts/app-product-profile.json#gui.home.codex_model_display_options'
    || alignment?.model_policy_consumption !== 'dynamic_build_injection_with_minimal_offline_fallback'
  ) {
    throw new Error(`${candidateId} evidence must bind product layout and interaction semantics to the DeepSeek Harness Web client composition`);
  }
  assertStringArrayIncludes(
    alignment.required_surfaces ?? [],
    requiredDSHSourceReuseSurfaces,
    `${candidateId} evidence default_home_layout DSH product layout required_surfaces`,
  );
  if (JSON.stringify(alignment.left_rail_items) !== JSON.stringify(['projects', 'conversations', 'search', 'settings'])) {
    throw new Error(`${candidateId} evidence left rail must contain only projects, conversations, search, and settings`);
  }
  if (JSON.stringify(alignment.right_context_modules) !== JSON.stringify(['run_status', 'files_results', 'agents_capabilities'])) {
    throw new Error(`${candidateId} evidence right context must contain only run status, files and results, and agents and capabilities`);
  }
  assertStringArrayIncludes(alignment.runtime_status_sources ?? [], [
    'codex_app_server_current_thread',
    'opl_app_state_active_project_lines',
  ], `${candidateId} evidence runtime_status_sources`);
  if (
    alignment.runtime_detail_slot !== 'ui_contributions.runtime.detail'
    || alignment.files_input_policy !== 'user_selected_files_and_directories_only'
    || alignment.results_policy !== 'owner_projected_artifacts_only_no_action_json'
    || alignment.package_lifecycle_surface !== 'settings'
    || JSON.stringify(alignment.product_identity?.visible_text) !== JSON.stringify(['One Person Lab'])
    || alignment.product_identity?.logo_visible !== false
    || alignment.product_identity?.bundle_icon_allowed !== true
  ) {
    throw new Error(`${candidateId} evidence must preserve runtime contribution, file/result, Settings lifecycle, and text-only identity boundaries`);
  }
}

export function validateDeepSeekHarnessCompositionEvidence(
  candidateId: string,
  defaultHomeLayout: Record<string, any> | undefined,
): void {
  if (
    defaultHomeLayout?.codex_2026_07_11_alignment !== undefined
    || defaultHomeLayout?.codex_design_reference_alignment !== undefined
  ) {
    throw new Error(
      `${candidateId} evidence must not retain Codex visual-alignment contracts after adopting DeepSeek Harness as the GUI source baseline`,
    );
  }
  validateDeepSeekHarnessProductLayoutContract(
    candidateId,
    defaultHomeLayout?.product_layout_contract,
  );
  const visual = defaultHomeLayout?.primary_visual_reference;
  if (
    visual?.reference_product !== 'DeepSeek Harness'
    || visual?.reference_version !== deepSeekHarnessApplicationHostRef
    || visual?.reference_date !== '2026-08-22'
    || visual?.source_usage !== 'direct_gui_source_reuse_with_application_host_cohort'
    || visual?.left_side !== 'persistent project and conversation rail with search and Settings only'
    || visual?.center !== 'single dominant conversation timeline with bottom composer'
    || visual?.right_side !== 'on-demand DSH details column for run status, files and results, and agents and capabilities'
  ) {
    throw new Error(`${candidateId} evidence must bind the visible shell to the pinned DeepSeek Harness GUI source cohort`);
  }
  const style = defaultHomeLayout?.visual_style_reference;
  if (
    style?.reference_product !== 'DeepSeek Harness'
    || style?.reference_version !== deepSeekHarnessApplicationHostRef
    || style?.reference_date !== '2026-08-22'
    || style?.scope !== 'eleven_pinned_gui_package_source_trees_with_opl_slot_adapters'
    || style?.token_source !== 'src/vendor/deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css'
    || style?.font_asset_policy !== 'system_font_stack_no_foreign_font_binary_redistribution'
  ) {
    throw new Error(`${candidateId} evidence must bind visual style to the pinned DeepSeek Harness theme source`);
  }
}
