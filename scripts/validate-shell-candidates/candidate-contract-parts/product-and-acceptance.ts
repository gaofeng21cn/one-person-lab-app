import fs from 'node:fs';
import path from 'node:path';
import type { ShellCandidate } from '../types.ts';
import {
  assertFile,
  assertStringArrayIncludes,
  expectedFrameworkSurfaces,
  forbiddenAuthority,
  forbiddenSeriesDomainFields,
  readJson,
  requiredHomeEntries,
  requiredNativeCapabilities,
  requiredSeriesProgressFields,
  resolveCandidateRoot,
  root,
  validateActiveProjectLineStateModel,
} from '../shared.ts';
import { assertDeepEqualJson } from '../../validate-active-shell/assertions.ts';

export function assertCandidateFileContains(candidate: ShellCandidate, relativePath: string, snippets: string[], label: string): void {
  const filePath = path.join(resolveCandidateRoot(candidate.candidate_root), relativePath);
  assertFile(filePath, `${candidate.id} ${label}`);
  const source = fs.readFileSync(filePath, 'utf8');
  for (const snippet of snippets) {
    if (!source.includes(snippet)) {
      throw new Error(`${candidate.id} ${label} must include ${snippet}`);
    }
  }
}

function missingCandidateCheckoutCanBeBlocked(candidate: ShellCandidate): boolean {
  return Boolean(
    !fs.existsSync(resolveCandidateRoot(candidate.candidate_root))
    && candidate.checkout_policy?.missing_checkout_status === 'blocked_missing_checkout'
    && candidate.build_wrapper?.missing_checkout_blocker_allowed === true
  );
}

type MinimumCompleteFeature = {
  feature_id?: string;
  capability_id?: string;
  owner?: string;
  disposition?: string;
  cutover_blocking?: boolean;
  components?: Array<{
    id?: string;
    disposition?: string;
    cutover_blocking?: boolean;
    implementation_status?: string;
    adapter_contract_ref?: string;
  }>;
};

type MinimumCompleteProduct = {
  schema?: string;
  implementation_id?: string;
  feature_inventory_ref?: string;
  functional_baseline_scope?: Record<string, unknown>;
  evidence_axes?: {
    non_substitution_rule?: string;
    required?: Array<{ id?: string; owner?: string; cutover_required?: boolean }>;
  };
  features?: MinimumCompleteFeature[];
};

export const appProductProfile = readJson<{
  codex: { default_model: string; default_reasoning_effort: string };
  delivery_topology: { minimum_complete_product: MinimumCompleteProduct };
}>(path.join(root, 'contracts', 'app-product-profile.json'));
export const configuredDefaultModel = appProductProfile.codex.default_model;
export const configuredDefaultReasoningEffort = appProductProfile.codex.default_reasoning_effort;

const requiredMinimumCompleteFeatureIds = [
  'B0-01', 'B0-02', 'B0-03', 'B0-04', 'B0-05', 'B0-06', 'B0-07',
  'B0-08', 'B0-09', 'B0-10', 'B0-11', 'B0-12', 'B0-13', 'B0-14',
  'R1-01', 'R1-02', 'R1-03', 'R1-04', 'R1-05', 'R1-06',
  'U1-01', 'U1-02', 'U1-03', 'U1-04', 'U1-05', 'U1-06', 'U1-07',
] as const;
const requiredMinimumCompleteEvidenceAxes = [
  'contract',
  'source_behavior',
  'rendered',
  'installed_macos',
  'clean_vm',
] as const;

export function validateMinimumCompleteProductContract(minimumProduct: MinimumCompleteProduct): void {
  if (
    minimumProduct.schema !== 'opl_app_successor_minimum_complete_product.v3' ||
    minimumProduct.implementation_id !== 'opl-studio' ||
    minimumProduct.feature_inventory_ref !== 'docs/product/gui/feature-inventory.md#b0-codex-necessary-baseline'
  ) {
    throw new Error('OPL Studio minimum-complete contract must use the App-owned v3 feature inventory');
  }

  const scope = minimumProduct.functional_baseline_scope;
  if (
    scope?.first_qualification_platform !== 'macos' ||
    scope.macos_full_functional_baseline_required_for_stable_release !== true ||
    scope.windows_linux_full_vm_required_before_declared_platform_support !== true ||
    scope.source_portability_may_substitute_for_platform_vm_evidence !== false ||
    scope.current_state !== 'active_studio_implementation_with_carrier_specific_qualification'
  ) {
    throw new Error('OPL Studio minimum-complete contract must preserve carrier-specific qualification boundaries');
  }

  const evidenceAxes = minimumProduct.evidence_axes;
  const evidenceAxisIds = evidenceAxes?.required?.map((axis) => axis.id) ?? [];
  if (
    evidenceAxes?.non_substitution_rule !== 'each_axis_proves_only_its_named_layer_and_cannot_close_any_other_axis' ||
    JSON.stringify(evidenceAxisIds) !== JSON.stringify(requiredMinimumCompleteEvidenceAxes) ||
    evidenceAxes.required?.some((axis) => !axis.owner?.trim() || axis.cutover_required !== true)
  ) {
    throw new Error('OPL Studio minimum-complete evidence axes must be complete, ordered, owner-backed, and non-substitutable');
  }

  const features = minimumProduct.features ?? [];
  const featureIds = features.map((feature) => feature.feature_id);
  if (
    JSON.stringify(featureIds) !== JSON.stringify(requiredMinimumCompleteFeatureIds) ||
    new Set(featureIds).size !== requiredMinimumCompleteFeatureIds.length
  ) {
    throw new Error('OPL Studio minimum-complete contract must contain each B0, R1, and U1 feature exactly once');
  }

  for (const feature of features) {
    if (!feature.capability_id?.trim() || !feature.owner?.trim() || (feature.feature_id !== 'B0-08' && feature.cutover_blocking !== true)) {
      throw new Error(`${feature.feature_id} must be owner-backed and cutover-blocking`);
    }
    if (feature.feature_id === 'B0-08') {
      if (feature.disposition !== 'deferred' || feature.cutover_blocking !== false) {
        throw new Error('B0-08 dedicated Git workbench must remain explicitly deferred');
      }
      continue;
    }
    if (feature.feature_id !== 'B0-12') {
      if (feature.disposition !== 'required' || feature.components?.some((component) => component.disposition === 'deferred')) {
        throw new Error(`${feature.feature_id} must remain required without deferred components`);
      }
      continue;
    }

    const components = feature.components ?? [];
    const componentIds = components.map((component) => component.id);
    if (
      feature.disposition !== 'required' ||
      JSON.stringify(componentIds) !== JSON.stringify([
        'background_turn_continuity',
        'completion_notification',
        'scheduled_tasks_cron',
      ])
    ) {
      throw new Error('B0-12 must require background continuity, notification, and Scheduled Tasks');
    }
    for (const component of components) {
      if (component.id === 'scheduled_tasks_cron') {
        if (
          component.disposition !== 'required' ||
          component.cutover_blocking !== true ||
          component.implementation_status !== 'source_implemented_release_qualification_separate' ||
          component.adapter_contract_ref !== 'contracts/app-shell-adapter.json#scheduled_tasks_adapter'
        ) {
          throw new Error('scheduled_tasks_cron must use the current adapter with separate release qualification');
        }
      } else if (component.disposition !== 'required' || component.cutover_blocking !== true) {
        throw new Error(`${component.id} must remain required and cutover-blocking`);
      }
    }
  }
}

export function validateCandidateTargetProductShape(candidate: ShellCandidate): void {
  if (
    candidate.target_product_shape.codex_cli_fixed_executor !== true ||
    candidate.target_product_shape.home_executor_selector_visible !== false ||
    candidate.target_product_shape.home_backend_selector_visible !== false ||
    candidate.target_product_shape.home_model_selector_visible !== true ||
    candidate.target_product_shape.permission_mode_selector_visible !== false ||
    candidate.target_product_shape.workspace_session_rail_default_visible !== true ||
    candidate.target_product_shape.inspector_default_visible !== false
  ) {
    throw new Error(`${candidate.id} must preserve Codex fixed-executor chat-first home with App-owned model selector, the candidate-specific project rail default, and no backend/permission/default inspector`);
  }
  assertStringArrayIncludes(candidate.target_product_shape.purpose_entries, requiredHomeEntries, `${candidate.id}.target_product_shape.purpose_entries`);
  if (candidate.target_product_shape.settings_policy !== 'app_state_refs_only') {
    throw new Error(`${candidate.id}.target_product_shape.settings_policy must keep Settings App-owned and refs-only`);
  }
  if (Object.hasOwn(candidate.target_product_shape, 'runtime_page_policy')) {
    throw new Error(`${candidate.id}.target_product_shape must keep run status in the on-demand right context instead of a separate core Runtime route`);
  }
  if (
    candidate.target_product_shape.default_visual_basis !== 'deepseek_harness_direct_source_chat_first' ||
    candidate.target_product_shape.right_context_user_request_only !== true ||
    candidate.target_product_shape.co_scientist_split_screen_default !== false ||
    candidate.target_product_shape.mas_autonomous_research_default !== true ||
    candidate.target_product_shape.right_context_default !== 'closed' ||
    candidate.target_product_shape.runtime_detail_slot !== 'ui_contributions.runtime.detail' ||
    candidate.target_product_shape.files_input_policy !== 'user_selected_files_and_directories_only' ||
    candidate.target_product_shape.results_policy !== 'owner_projected_artifacts_only_no_action_json' ||
    candidate.target_product_shape.package_lifecycle_surface !== 'settings'
  ) {
    throw new Error(`${candidate.id}.target_product_shape must encode the DSH direct-source chat-first basis and MAS autonomous research interaction`);
  }
  if (JSON.stringify(candidate.target_product_shape.left_rail_items) !== JSON.stringify(['projects', 'conversations', 'search', 'settings'])) {
    throw new Error(`${candidate.id}.target_product_shape.left_rail_items must be exactly projects, conversations, search, and settings`);
  }
  if (JSON.stringify(candidate.target_product_shape.right_context_modules) !== JSON.stringify(['run_status', 'files_results', 'agents_capabilities'])) {
    throw new Error(`${candidate.id}.target_product_shape.right_context_modules must be exactly run status, files and results, and agents and capabilities`);
  }
  assertStringArrayIncludes(candidate.target_product_shape.runtime_status_sources, [
    'codex_app_server_current_thread',
    'opl_app_state_active_project_lines',
  ], `${candidate.id}.target_product_shape.runtime_status_sources`);
  const identity = candidate.target_product_shape.product_identity;
  if (
    JSON.stringify(identity.visible_text) !== JSON.stringify(['One Person Lab']) ||
    identity.logo_visible !== false ||
    identity.bundle_icon_allowed !== true
  ) {
    throw new Error(`${candidate.id}.target_product_shape.product_identity must use One Person Lab text without an in-app Logo`);
  }
  validateCandidateAiFirstInteractionModel(candidate);
}

function validateCandidateAiFirstInteractionModel(candidate: ShellCandidate): void {
  const model = candidate.ai_first_interaction_model;
  if (
    !model ||
    model.default_visual_basis !== 'deepseek_harness_direct_source_chat_first' ||
    model.primary_policy !== 'maximize_direct_ai_interaction_on_the_chat_canvas' ||
    model.right_context_policy !== 'collapsed_user_requested_secondary_layer' ||
    model.mas_autonomy_policy !== 'MAS_runs_as_autonomous_research_execution_not_co_scientist_pair_work'
  ) {
    throw new Error(`${candidate.id}.ai_first_interaction_model must preserve composer-first interaction and collapsed secondary context`);
  }
  assertStringArrayIncludes(model.on_demand_context_policy, [
    'run_status_from_current_thread_and_active_project_lines',
    'hypotheses_and_roadmap_from_runtime_detail_contributions',
    'files_and_results_open_only_on_user_request',
    'agents_and_capabilities_render_as_a_searchable_live_catalog',
  ], `${candidate.id}.ai_first_interaction_model.on_demand_context_policy`);
  assertStringArrayIncludes(model.must_not, [
    'default_three_column_scientific_workbench',
    'default_open_artifact_inspector',
    'co_scientist_side_by_side_monitoring_assumption',
    'foreign_runtime_or_domain_authority_transfer',
  ], `${candidate.id}.ai_first_interaction_model.must_not`);
}

export function validateCandidateMinimumAcceptance(candidate: ShellCandidate): void {
  assertStringArrayIncludes(candidate.technical_verification?.minimum_acceptance ?? [], [
    'default App release adapter validates as opl-studio',
    'candidate registry validates without changing release_shell_contract',
    'candidate adapter can be selected only through OPL_APP_SHELL_ADAPTER_CONTRACT',
    'candidate consumes OPL App state/action contracts without owning runtime or domain truth',
    'candidate state-model validation proves active project line projection consumption from opl app state without domain-ready, production-ready, clean-VM-ready, Full-release-ready, or active-shell-adopted claims',
    'Electron desktop standalone WebUI and Docker WebUI use the same DSH-derived React renderer shared Node host core and App-owned bridge ABI',
    'ordinary UI keeps only projects, conversations, search, and Settings in the left rail and opens run status, files and results, or agents and capabilities in the DSH details column on demand',
    'runtime status consumes the current Codex thread and active_project_lines while hypotheses and roadmaps come from owner-projected runtime.detail contributions',
    'in-app identity is text-only One Person Lab while platform bundle icons remain allowed',
    'WebUI parity evidence proves the same renderer host core and product semantics as Electron desktop',
    'one Codex App Server adapter exposes canonical thread list, read, start, resume, fork, archive, unarchive, and ordinary turn start and steer',
    'standard Agent selection binds package_id, shortcut_id, codex_visible_entry, and required_skill_ids to thread/start plus turn/start without creating a Framework activation action',
    'running-turn submissions use turn/steer and idle submissions use turn/start while queued input stays renderer-ephemeral until App Server acceptance',
    'Gateway login uses loginGatewayAccount without generic action secret payloads and all other Gateway mutations use the projected action ids',
    'Agent Package lifecycle actions come dynamically from complete directory available_actions entries without a Shell allowlist or inferred semantics',
    'OPL Base and OPL Packages use Framework managed-update capabilities while OPL App uses one logical update contract with carrier-specific update and restart adapters plus fresh terminal readback',
    'Codex subagent metadata, source kinds, and thread items remain read-only projections from Codex Core and App Server',
    'successor source acceptance requires no private coordination host, model-triggered cross-thread tools, OPL-owned host queue, JSONL coordination ledger, bilateral receipts, write-set advisory, coordination idempotency, or cross-host handoff layer',
  ], `${candidate.id}.technical_verification.minimum_acceptance`);
}

export function validateCandidateFrameworkSurfaces(candidate: ShellCandidate): void {
  for (const [surface, expected] of Object.entries(expectedFrameworkSurfaces)) {
    if (candidate.framework_surfaces[surface] !== expected) {
      throw new Error(`${candidate.id}.framework_surfaces.${surface} must be ${expected}`);
    }
  }
}

export function validateCandidateStateModelCommand(candidate: ShellCandidate): void {
  validateActiveProjectLineStateModel(candidate.active_project_line_state_model, `${candidate.id}.active_project_line_state_model`);
  const stateModelTechnicalCommand = candidate.technical_verification?.candidate_shell_commands?.find((entry) => entry.id === 'state_model');
  if (
    !stateModelTechnicalCommand ||
    stateModelTechnicalCommand.cwd !== candidate.candidate_root ||
    stateModelTechnicalCommand.command !== 'npm run validate:state-model'
  ) {
    throw new Error(`${candidate.id}.technical_verification.candidate_shell_commands must include state_model running npm run validate:state-model from ${candidate.candidate_root}`);
  }
}

export function validateCandidateSeriesDisplayContract(candidate: ShellCandidate): void {
  const seriesDisplay = candidate.foundry_agent_series_display_contract;
  if (!seriesDisplay) {
    throw new Error(`${candidate.id} must declare foundry_agent_series_display_contract`);
  }
  if (seriesDisplay.authority !== 'opl_framework_shared_progress_projection') {
    throw new Error(`${candidate.id}.foundry_agent_series_display_contract.authority must be opl_framework_shared_progress_projection`);
  }
  if (seriesDisplay.display_policy !== 'classification_only_no_domain_artifact_body') {
    throw new Error(`${candidate.id}.foundry_agent_series_display_contract.display_policy must forbid domain artifact body display`);
  }
  assertStringArrayIncludes(
    seriesDisplay.required_shared_progress_fields,
    requiredSeriesProgressFields,
    `${candidate.id}.foundry_agent_series_display_contract.required_shared_progress_fields`,
  );
  assertStringArrayIncludes(
    seriesDisplay.forbidden_domain_fields,
    forbiddenSeriesDomainFields,
    `${candidate.id}.foundry_agent_series_display_contract.forbidden_domain_fields`,
  );
}

export function validateCandidateAuthorityBoundaries(candidate: ShellCandidate): void {
  assertStringArrayIncludes(candidate.required_capabilities, requiredNativeCapabilities, `${candidate.id}.required_capabilities`);
  if (candidate.required_capabilities.includes('runtime_summary_detail_action_bridge')) {
    throw new Error(`${candidate.id}.required_capabilities must omit the Runtime parity capability from Native phase one`);
  }
  assertStringArrayIncludes(candidate.must_not_own, forbiddenAuthority, `${candidate.id}.must_not_own`);
  assertStringArrayIncludes(candidate.forbidden_home_controls, [
    'Aion CLI backend choice',
    'Claude Code backend choice',
    'generic backend selector',
    'non-App-owned model override selector',
    'permission mode selector',
    'provider marketplace',
  ], `${candidate.id}.forbidden_home_controls`);
  assertStringArrayIncludes(candidate.non_goals, [
    'do not switch active_shell away from opl-studio',
    'do not enter default stable or nightly release packaging',
    'do not introduce runtime or domain truth into the App repo',
    'do not add a private coordination host, model-triggered cross-thread tools, OPL-owned queue, coordination ledger, receipts, advisory, idempotency, or cross-host handoff layer',
    'do not claim release-ready from contract-only evidence',
  ], `${candidate.id}.non_goals`);
}

export function validateCandidateValidationCommands(candidate: ShellCandidate): void {
  for (const entry of [
    ...candidate.validation_commands,
    ...(candidate.technical_verification?.manual_verification_commands ?? []),
  ]) {
    if (!entry.id || !entry.cwd || !entry.command) {
      throw new Error(`${candidate.id} has invalid validation command ${JSON.stringify(entry)}`);
    }
    const cwdPath = entry.cwd === candidate.candidate_root
      ? resolveCandidateRoot(candidate.candidate_root)
      : path.join(root, entry.cwd);
    if (!fs.existsSync(cwdPath)) {
      if (missingCandidateCheckoutCanBeBlocked(candidate) && entry.cwd === candidate.candidate_root) {
        continue;
      }
      assertFile(cwdPath, `${candidate.id} validation cwd ${entry.id}`);
    }
  }
  const bundleCommand = candidate.validation_commands.find((entry) => entry.id === 'candidate_app_bundle_build');
  if (!bundleCommand) {
    throw new Error(`${candidate.id} validation_commands must include candidate_app_bundle_build`);
  }
  const webUiSmokeCommand = candidate.validation_commands.find((entry) => entry.id === 'candidate_webui_smoke');
  if (!webUiSmokeCommand) {
    throw new Error(`${candidate.id} validation_commands must include candidate_webui_smoke`);
  }
  const stateModelCommand = candidate.validation_commands.find((entry) => entry.id === 'candidate_state_model');
  if (!stateModelCommand) {
    throw new Error(`${candidate.id} validation_commands must include candidate_state_model`);
  }
  if (stateModelCommand.cwd !== candidate.candidate_root || stateModelCommand.command !== 'npm run validate:state-model') {
    throw new Error(`${candidate.id} candidate_state_model must run npm run validate:state-model from ${candidate.candidate_root}`);
  }
  if (webUiSmokeCommand.cwd !== candidate.candidate_root || !webUiSmokeCommand.command.includes('npm run smoke:webui')) {
    throw new Error(`${candidate.id} candidate_webui_smoke must run npm run smoke:webui from ${candidate.candidate_root}`);
  }
  if (
    bundleCommand.cwd !== '.'
    || !bundleCommand.command.includes(`OPL_APP_SHELL_ADAPTER_CONTRACT=${candidate.adapter_contract} npm run package`)
  ) {
    throw new Error(`${candidate.id} candidate_app_bundle_build must run App-root npm package with the candidate adapter contract`);
  }
}

export function validateCandidatePackageScriptSurfaces(candidate: ShellCandidate): void {
  if (missingCandidateCheckoutCanBeBlocked(candidate)) {
    return;
  }
  assertFile(path.join(resolveCandidateRoot(candidate.candidate_root), 'scripts', 'validate-opl-studio-candidate.mjs'), `${candidate.id} self-check`);
  assertCandidateFileContains(candidate, 'package.json', [
    '"build:desktop"',
    '"package:desktop"',
    '"build:webui"',
    '"webui"',
    '"smoke:webui"',
    '"smoke:desktop-live"',
    '"test:webui-host"',
    '"validate:state-model"',
  ], 'package scripts for the shared renderer, Electron desktop, and headless WebUI');
}
