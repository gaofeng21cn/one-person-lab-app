import { assertRemoteReleaseCohortMatches } from './release-evidence-cohort.ts';
import { validateV2ReleaseReadback } from './framework-v2-release-evidence.ts';
import { asRecord } from './release-json-helpers.ts';
import type { ReleaseEvidenceCohort, UnknownReleaseEvidenceCohort } from './release-evidence-cohort.ts';
import { compileCurrentFirstRunExpectations } from './compile-first-run-expectations.ts';

const releaseQualificationTargets =
  compileCurrentFirstRunExpectations().profiles.standard.semantics.assistant_targets;

type EvidenceArtifact = {
  id: string;
  path: string;
  kind: 'json' | 'image' | 'log';
  producer: string;
  source_kind: string;
};

type KnownOrUnknownReleaseCohort = ReleaseEvidenceCohort | UnknownReleaseEvidenceCohort;

function validateVmSummary(artifact: EvidenceArtifact, payload: unknown) {
  const record = asRecord(payload, artifact.id);
  if (record.status !== 'passed') {
    throw new Error(`${artifact.id} must be a passed VM smoke JSON artifact.`);
  }
  if (record.runtime_profile !== 'standard' && record.runtime_profile !== 'full') {
    throw new Error(`${artifact.id} must report runtime_profile standard or full.`);
  }
  const settingsSmoke = asRecord(record.settings_smoke, `${artifact.id}.settings_smoke`);
  if (settingsSmoke.status !== 'passed') {
    throw new Error(`${artifact.id} must include passed Settings smoke evidence.`);
  }
  if (!Array.isArray(settingsSmoke.pages) || settingsSmoke.pages.length === 0) {
    throw new Error(`${artifact.id} must report visited Settings pages.`);
  }
  if (artifact.id === 'guest_smoke_summary') {
    const guiReady = asRecord(record.gui_ready, `${artifact.id}.gui_ready`);
    if (guiReady.hasGuidInput !== true || guiReady.hasGuidSendButton !== true) {
      throw new Error('guest_smoke_summary must prove the packaged GUID entry is usable.');
    }
  }
}

function validateAssistantRouteSmokeSummary(artifact: EvidenceArtifact, payload: unknown) {
  const record = asRecord(payload, artifact.id);
  if (record.surface_id !== 'opl_packaged_gui_assistant_route_smoke') {
    throw new Error(`${artifact.id} must be a packaged GUI assistant route smoke summary.`);
  }
  if (record.status !== 'passed') {
    throw new Error(`${artifact.id} must be passed.`);
  }
  if (record.runtime_profile !== 'standard' && record.runtime_profile !== 'full') {
    throw new Error(`${artifact.id} must report runtime_profile standard or full.`);
  }
  const expectedMode = record.runtime_profile === 'standard' ? 'state_aware_launch_admission' : 'route_receipt';
  if (record.verification_mode !== expectedMode) {
    throw new Error(`${artifact.id} must use ${expectedMode} verification for ${record.runtime_profile}.`);
  }
  if (!Array.isArray(record.assistants)) {
    throw new Error(`${artifact.id} must include assistant route smoke results.`);
  }
  const resultsById = new Map(
    record.assistants.map((entry) => {
      const assistant = asRecord(entry, `${artifact.id}.assistants[]`);
      return [assistant.id, assistant];
    }),
  );
  for (const target of releaseQualificationTargets) {
    const assistantId = target.assistant_id;
    const badges = [target.badge, `@${assistantId.toUpperCase()}`];
    const shortName = assistantId.toUpperCase();
    const assistant = resultsById.get(assistantId);
    if (!assistant) {
      throw new Error(`${artifact.id} must include ${assistantId} route smoke result.`);
    }
    for (const [field, expected] of [
      ['assistant_id', target.assistant_id],
      ['shortcut_id', target.shortcut_id],
      ['package_id', target.package_id],
      ['codex_visible_entry', target.codex_visible_entry],
      ['badge', target.badge],
    ] as const) {
      if (assistant[field] !== expected) {
        throw new Error(`${artifact.id}.${assistantId}.${field} must match the compiled release target fixture.`);
      }
    }
    if (JSON.stringify(assistant.required_skill_ids) !== JSON.stringify(target.required_skill_ids)) {
      throw new Error(`${artifact.id}.${assistantId}.required_skill_ids must match the compiled release target fixture.`);
    }
    if (!badges.includes(String(assistant.badge))) {
      throw new Error(`${artifact.id}.${assistantId} must show the compiled release target badge.`);
    }
    if (record.runtime_profile === 'standard') {
      if (assistant.verification_mode !== 'state_aware_launch_admission') {
        throw new Error(`${artifact.id}.${assistantId} must report Standard state-aware launch admission.`);
      }
      const admission = asRecord(assistant.launch_admission, `${artifact.id}.${assistantId}.launch_admission`);
      const commonAdmissionPassed =
        admission.visible === true &&
        admission.selectable_before_selection === true &&
        admission.selected === true &&
        admission.route_receipt_claimed === false;
      const availableAdmissionPassed =
        admission.projection_state === 'available' &&
        admission.launch_allowed === true &&
        admission.send_attempted === false &&
        admission.send_blocked === false &&
        admission.repair_hint_visible === false;
      const unavailableAdmissionPassed =
        admission.projection_state === 'unavailable' &&
        admission.launch_allowed === false &&
        admission.send_blocked === true &&
        admission.repair_hint_visible === true &&
        admission.draft_preserved === true &&
        (Boolean(String(admission.typed_reason ?? '').trim()) ||
          admission.verification_path === 'model_access_precondition');
      if (!commonAdmissionPassed || (!availableAdmissionPassed && !unavailableAdmissionPassed)) {
        throw new Error(
          `${artifact.id}.${assistantId} must prove state-aware launch admission for an available or unavailable projection.`,
        );
      }
      if (assistant.receipt != null) {
        throw new Error(`${artifact.id}.${assistantId} must not claim a route receipt for Standard.`);
      }
      continue;
    }
    if (assistant.verification_mode !== 'route_receipt') {
      throw new Error(`${artifact.id}.${assistantId} must report Full route receipt verification.`);
    }
    const ready = asRecord(assistant.ready, `${artifact.id}.${assistantId}.ready`);
    if (ready.selectors_hidden !== true || !badges.includes(String(ready.badge))) {
      throw new Error(`${artifact.id}.${assistantId} must prove ordinary selectors are hidden after selection.`);
    }
    const receipt = asRecord(assistant.receipt, `${artifact.id}.${assistantId}.receipt`);
    if (receipt.status !== 'passed') {
      throw new Error(`${artifact.id}.${assistantId} must include a passed route receipt.`);
    }
    if (receipt.conversation_type !== 'acp' || receipt.backend !== 'codex') {
      throw new Error(`${artifact.id}.${assistantId} must create a Codex ACP conversation.`);
    }
    const route = asRecord(receipt.route, `${artifact.id}.${assistantId}.receipt.route`);
    if (
      route.route_kind !== 'builtin_capability' ||
      route.executor !== 'codex_cli' ||
      route.assistant_id !== assistantId ||
      route.assistant_short_name !== shortName ||
      route.source !== 'opl_app_home'
    ) {
      throw new Error(`${artifact.id}.${assistantId} must include the App-owned Codex builtin assistant route receipt.`);
    }
  }
}

function validateCodexFunctionalCheckSummary(record: Record<string, unknown>) {
  if (record.schema !== 'opl_codex_functional_check_receipt.v1') {
    throw new Error('codex_functional_check_summary must use the Codex functional check receipt schema.');
  }
  if (!['passed', 'diagnostic_skipped'].includes(String(record.status))) {
    throw new Error('codex_functional_check_summary must be passed or diagnostic_skipped for release evidence.');
  }
  const gate = asRecord(record.blocking_release_gate, 'codex_functional_check_summary.blocking_release_gate');
  if (gate.deterministic_fields_passed !== true) {
    throw new Error('codex_functional_check_summary deterministic fields must pass.');
  }
  if (gate.llm_invocation_required !== false) {
    throw new Error('codex_functional_check_summary must not require LLM invocation.');
  }

  const routeReceipts = asRecord(
    record.assistant_route_receipts_checked,
    'codex_functional_check_summary.assistant_route_receipts_checked',
  );
  const standardProfile = record.runtime_profile === 'standard';
  const evidence = standardProfile
    ? asRecord(
        record.assistant_launch_admissions_checked,
        'codex_functional_check_summary.assistant_launch_admissions_checked',
      )
    : routeReceipts;
  if (
    evidence.status !== 'passed' ||
    evidence.deterministic !== true ||
    (standardProfile && routeReceipts.status !== 'not_applicable_standard')
  ) {
    throw new Error(
      standardProfile
        ? 'Standard Codex functional evidence must pass state-aware launch admissions without claiming route receipts.'
        : 'codex_functional_check_summary assistant route receipts must be deterministic and passed.',
    );
  }
  const required = Array.isArray(evidence.required) ? evidence.required : [];
  const checked = Array.isArray(evidence.checked) ? evidence.checked : [];
  for (const target of releaseQualificationTargets) {
    if (!required.includes(target.codex_visible_entry) || !checked.includes(target.codex_visible_entry)) {
      throw new Error(
        `codex_functional_check_summary must cover ${target.codex_visible_entry} ${
          standardProfile ? 'launch admissions' : 'route receipts'
        }.`,
      );
    }
  }
}

function validateAppStateEvidence(artifact: EvidenceArtifact, record: Record<string, unknown>) {
    const appState = asRecord(record.app_state, `${artifact.id}.app_state`);
    if (appState.schema !== 'opl_app_state.v1' && appState.schema_version !== 'opl_app_state.v1') {
      throw new Error(`${artifact.id} must be real OPL App state JSON with schema opl_app_state.v1.`);
    }
    const meta = appState.meta === undefined ? {} : asRecord(appState.meta, `${artifact.id}.app_state.meta`);
    const profile = appState.profile ?? meta.profile;
    if (artifact.id === 'app_state_summary' && profile !== 'fast') {
      throw new Error('app_state_summary must use the fast OPL App state profile.');
    }
    if (artifact.id === 'app_state_full' && profile !== 'full') {
      throw new Error('app_state_full must use the full OPL App state profile.');
    }
    if (!appState.operator || typeof appState.operator !== 'object') {
      throw new Error(`${artifact.id} must include operator state from OPL.`);
    }
    if (!appState.provider || typeof appState.provider !== 'object') {
      throw new Error(`${artifact.id} must include provider state from OPL.`);
    }
}

function validateDrilldownEvidence(artifact: EvidenceArtifact, record: Record<string, unknown>) {
    const drilldown = asRecord(record.app_operator_drilldown, `${artifact.id}.app_operator_drilldown`);
    if (drilldown.surface_kind !== 'opl_app_operator_drilldown_read_model') {
      throw new Error(`${artifact.id} must be an OPL App/operator drilldown read model.`);
    }
    if (drilldown.detail_level !== 'full') {
      throw new Error('drilldown_full must be full-detail App/operator drilldown JSON.');
    }
    if (!drilldown.summary || typeof drilldown.summary !== 'object') {
      throw new Error(`${artifact.id} must include App/operator drilldown summary.`);
    }
}

function validateActionExecutionEvidence(artifact: EvidenceArtifact, record: Record<string, unknown>) {
    const execution = asRecord(record.app_action_execution, `${artifact.id}.app_action_execution`);
    if (execution.surface_kind !== 'opl_app_action_execution.v1') {
      throw new Error(`${artifact.id} must be an OPL App action execution JSON result.`);
    }
    if (typeof execution.action_id !== 'string' || !execution.action_id.trim()) {
      throw new Error(`${artifact.id} must include action_id.`);
    }
    if (artifact.id === 'action_dry_run_result' && execution.dry_run !== true) {
      throw new Error('action_dry_run_result must be a dry-run execution result.');
    }
    if (artifact.id === 'action_execute_result' && execution.dry_run !== false) {
      throw new Error('action_execute_result must be a non-dry-run execution result.');
    }
    if (!execution.result || typeof execution.result !== 'object') {
      throw new Error(`${artifact.id} must include result details.`);
    }
    if (!execution.authority_boundary || typeof execution.authority_boundary !== 'object') {
      throw new Error(`${artifact.id} must include authority_boundary.`);
    }
}

function validateCodexAiSelfCheckSummary(record: Record<string, unknown>) {
    if (record.schema !== 'opl_codex_ai_self_check_receipt.v1') {
      throw new Error('codex_ai_self_check_summary must use the Codex AI self-check receipt schema.');
    }
    if (
      ![
        'passed',
        'failed',
        'needs_attention',
        'error',
        'skipped_not_requested',
        'skipped_missing_codex_config',
      ].includes(String(record.status))
    ) {
      throw new Error('codex_ai_self_check_summary must report a known diagnostic status.');
    }
    if (record.blocking_release_gate !== false) {
      throw new Error('codex_ai_self_check_summary must remain non-blocking diagnostic evidence.');
    }
    if (record.mutations_allowed !== false && record.mode !== 'fix') {
      throw new Error('codex_ai_self_check_summary diagnose mode must not allow mutations.');
    }
}

function validateRemoteReleaseVerification(record: Record<string, unknown>, releaseCohort: KnownOrUnknownReleaseCohort) {
    if (record.status !== 'passed') {
      throw new Error('remote_release_verification must be a passed remote release verification summary.');
    }
    if (releaseCohort.current_cohort_evidence === true) {
      assertRemoteReleaseCohortMatches(releaseCohort, record);
    }
    if (record.include_full_package !== true) {
      throw new Error('remote_release_verification must include the Full first-install package check.');
    }
    if (!Number.isSafeInteger(record.verified_asset_count) || Number(record.verified_asset_count) <= 0) {
      throw new Error('remote_release_verification must report verified release assets.');
    }
    if (!record.full_first_install_budget || typeof record.full_first_install_budget !== 'object') {
      throw new Error('remote_release_verification must report the Full first-install budget check.');
    }
}

function validateDockerWebuiCleanVmEvidence(record: Record<string, unknown>) {
    if (record.schema !== 'opl_docker_webui_clean_vm_evidence_validation.v1') {
      throw new Error('docker_webui_clean_vm_evidence must use schema opl_docker_webui_clean_vm_evidence_validation.v1.');
    }
    if (record.status !== 'passed') {
      throw new Error('docker_webui_clean_vm_evidence must be passed before it can enter release evidence.');
    }
    const requiredGates = Array.isArray(record.required_gates) ? record.required_gates : [];
    for (const gateId of ['clean_linux_vm']) {
      if (!requiredGates.includes(gateId)) {
        throw new Error(`docker_webui_clean_vm_evidence must require ${gateId}.`);
      }
    }
    if (!Array.isArray(record.summaries)) {
      throw new Error('docker_webui_clean_vm_evidence must include summaries.');
    }
    const summaryByGate = new Map(
      record.summaries.map((entry) => {
        const summary = asRecord(entry, 'docker_webui_clean_vm_evidence.summaries[]');
        return [summary.gate_id, summary];
      }),
    );
    for (const gateId of ['clean_linux_vm']) {
      const summary = summaryByGate.get(gateId);
      if (!summary) {
        throw new Error(`docker_webui_clean_vm_evidence must include ${gateId} summary.`);
      }
      if (summary.status !== 'passed') {
        throw new Error(`docker_webui_clean_vm_evidence ${gateId} summary must be passed.`);
      }
      if (typeof summary.artifact_name !== 'string' || !summary.artifact_name.trim()) {
        throw new Error(`docker_webui_clean_vm_evidence ${gateId} summary must include artifact_name.`);
      }
      if (typeof summary.result_path !== 'string' || !summary.result_path.trim()) {
        throw new Error(`docker_webui_clean_vm_evidence ${gateId} summary must include result_path.`);
      }
      const validation = asRecord(summary.validation, `docker_webui_clean_vm_evidence.${gateId}.validation`);
      if (validation.status !== 'passed') {
        throw new Error(`docker_webui_clean_vm_evidence ${gateId} schema validation must be passed.`);
      }
    }
}

export function validateJsonEvidenceShape(
  artifact: EvidenceArtifact,
  payload: unknown,
  releaseCohort: KnownOrUnknownReleaseCohort,
) {
  const record = asRecord(payload, artifact.id);
  if (validateV2ReleaseReadback(artifact.id, record)) return;
  if (artifact.id === 'app_state_summary' || artifact.id === 'app_state_full') {
    validateAppStateEvidence(artifact, record);
  }
  if (artifact.id === 'drilldown_full') {
    validateDrilldownEvidence(artifact, record);
  }
  if (artifact.id === 'action_dry_run_result' || artifact.id === 'action_execute_result') {
    validateActionExecutionEvidence(artifact, record);
  }
  if (artifact.id === 'first_run_vm_summary' || artifact.id === 'guest_smoke_summary') {
    validateVmSummary(artifact, record);
  }
  if (artifact.id === 'assistant_route_smoke_summary') {
    validateAssistantRouteSmokeSummary(artifact, record);
  }
  if (artifact.id === 'codex_functional_check_summary') {
    validateCodexFunctionalCheckSummary(record);
  }
  if (artifact.id === 'codex_ai_self_check_summary') {
    validateCodexAiSelfCheckSummary(record);
  }
  if (artifact.id === 'remote_release_verification') {
    validateRemoteReleaseVerification(record, releaseCohort);
  }
  if (artifact.id === 'docker_webui_clean_vm_evidence') {
    validateDockerWebuiCleanVmEvidence(record);
  }
}
