import {
  exactObject,
  failIf,
  hasStableMutationMutex,
  jobRuns,
  jobEvidenceText,
  workflowJobs,
  needsExactly,
  parseWorkflow,
  requireSubstrings,
  sameJson,
  validateWorkflowActionPins,
} from './report.ts';
import {
  exactReadPermissions,
  exactStableEntryPermissions,
  exactWebUiCompileCeilingPermissions,
  manualFullPreviewWorkflowPath,
  webuiDevelopmentWorkflowPath,
  previewLatestPointerWorkflowPath,
  validateExactActionPins,
} from './workflow-policy.ts';

export function validatePreviewLatestPointerTopology(appRoot: string): number {
  const id = 'preview_latest_pointer_topology';
  const parsed = parseWorkflow(appRoot, previewLatestPointerWorkflowPath, id);
  if (!parsed) return 1;
  const { workflow, text } = parsed;
  const inputs = Object.keys(workflow.on?.workflow_call?.inputs ?? {}).sort();
  const jobs = workflowJobs(workflow);
  const mutation = jobs['move-latest-pointer'];

  let failures = failIf(
    id,
    !sameJson(Object.keys(workflow.on ?? {}), ['workflow_call']) ||
      !exactObject(workflow.permissions, exactReadPermissions) ||
      !sameJson(inputs, ['app_ref', 'expected_current_latest_tag', 'operation_deadline_at', 'operation_started_at', 'target_tag']) ||
      !sameJson(Object.keys(jobs), ['move-latest-pointer']) ||
      mutation?.environment !== 'release-preview-latest' ||
      !exactObject(mutation?.permissions, exactStableEntryPermissions) || !Array.isArray(mutation?.steps),
    'Preview Latest pointer must be one protected reusable-only single writer',
  );
  failures += requireSubstrings(id, text, [
    'test "$GITHUB_RUN_ATTEMPT" = 1', 'release-operation-deadline.ts check',
    '--operation move_latest_pointer', 'framework-release-adapter.ts github-move-latest-pointer',
    '--expected-current-latest-tag', 'outcome_unknown', 'no second PATCH is allowed',
    'releases/latest', 'public-opl-app-component-manifest.json', 'quality_status',
    'quality_unchanged', 'persistent_override', 'next_qualified_stable',
  ], 'Preview Latest pointer reusable is missing');
  failures += failIf(
    id,
    /workflow_dispatch|release create|release upload|gh run (?:rerun|cancel)|--clobber/.test(text),
    'Preview Latest pointer reusable contains a second dispatcher or forbidden release mutation',
  );
  failures += validateWorkflowActionPins(previewLatestPointerWorkflowPath, jobs, validateExactActionPins);
  return failures;
}

export function validateManualFullPreviewControlPlane(appRoot: string): number {
  const id = 'manual_full_preview_control_plane';
  const parsed = parseWorkflow(appRoot, manualFullPreviewWorkflowPath, id);
  if (!parsed) return 1;
  const { workflow, text } = parsed;
  const inputs = workflow.on?.workflow_dispatch?.inputs ?? {};
  const jobs = workflowJobs(workflow);
  const { ingress, mutate } = jobs;
  const ingressRuns = jobRuns(ingress);
  const mutateRuns = jobRuns(mutate);

  let failures = 0;
  failures += failIf(id, !sameJson(Object.keys(workflow.on ?? {}), ['workflow_dispatch']), 'Manual Full preview must expose only workflow_dispatch');
  failures += failIf(
    id,
    !sameJson(Object.keys(inputs).sort(), ['handoff_manifest_sha256', 'handoff_nonce', 'operation']),
    'Manual Full preview inputs must be exactly operation, handoff_nonce, and handoff_manifest_sha256',
  );
  failures += failIf(
    id,
    inputs.operation?.required !== true || inputs.operation?.type !== 'choice' ||
      !sameJson(inputs.operation?.options, ['publish', 'cleanup']) ||
      inputs.handoff_nonce?.required !== true || inputs.handoff_nonce?.type !== 'string' ||
      inputs.handoff_manifest_sha256?.required !== true || inputs.handoff_manifest_sha256?.type !== 'string',
    'Manual Full preview dispatch input contract is invalid',
  );
  failures += failIf(id, !exactObject(workflow.permissions, exactReadPermissions), 'Manual Full preview top-level permissions must be exactly contents:read/actions:read');
  failures += failIf(id, workflow.concurrency !== undefined, 'Manual Full preview ingress must not hold the public mutation mutex');
  failures += failIf(id, !sameJson(Object.keys(jobs).sort(), ['ingress', 'mutate']), 'Manual Full preview jobs must be exactly ingress and mutate');
  failures += failIf(
    id,
    !ingress || !sameJson(ingress['runs-on'], ['self-hosted', 'macOS', 'ARM64', 'opl-gui-vm']) ||
      ingress.environment !== undefined || !exactObject(ingress.permissions, exactReadPermissions) || ingress.secrets !== undefined,
    'Manual Full preview ingress must be the read-only dedicated macOS ARM64 runner',
  );
  failures += failIf(
    id,
    !mutate || !needsExactly(mutate, ['ingress']) || mutate.environment !== 'release-stable' ||
      !exactObject(mutate.permissions, exactStableEntryPermissions) || !hasStableMutationMutex(mutate) || mutate.secrets !== undefined,
    'Manual Full preview mutation must be admission-dependent and protected by release-stable',
  );
  failures += failIf(
    id,
    ['test "$GITHUB_RUN_ATTEMPT" = 1', 'OPL_MANUAL_PREVIEW_INGRESS_ROOT', 'manual-full-preview-release.ts ingest'].some((s) => !ingressRuns.includes(s)) ||
      ['test "$GITHUB_RUN_ATTEMPT" = 1', 'manual-full-preview-release.ts verify-artifact', 'manual-full-preview-release.ts mutate'].some((s) => !mutateRuns.includes(s)),
    'Manual Full preview must enforce attempt one, fixed ingress, artifact readback, and the thin executor',
  );
  failures += failIf(
    id,
    ['artifact-ids: ${{ needs.ingress.outputs.artifact_id }}', 'overwrite: false', 'compression-level: 0'].some((s) => !text.includes(s)) ||
      /(?:opl release|release-bundle-cli\.ts|gh workflow run|gh run (?:rerun|cancel)|--clobber)/.test(text),
    'Manual Full preview transport or forbidden mutation boundary drifted',
  );
  failures += validateWorkflowActionPins(manualFullPreviewWorkflowPath, jobs, validateExactActionPins);
  return failures;
}

export function validateIndependentWebuiPreviewTopology(appRoot: string): number {
  const id = 'independent_webui_publication_topology';
  const operations = parseWorkflow(appRoot, webuiDevelopmentWorkflowPath, id);
  if (!operations) return 1;
  const workflow = operations.workflow;
  const jobs = workflowJobs(workflow);
  const expectedCarrierCommonWith = {
    authority_mode: '${{ needs.source-authority.outputs.authority_mode }}',
    app_ref: '${{ needs.source-authority.outputs.app_ref }}',
    shell_ref: '${{ needs.source-authority.outputs.shell_ref }}',
    framework_ref: '${{ needs.source-authority.outputs.framework_ref }}',
    opl_version: '${{ needs.source-authority.outputs.version }}',
    release_bundle_digest: '${{ needs.source-authority.outputs.build_bundle_digest }}',
    release_cohort_ref: '${{ needs.source-authority.outputs.build_cohort_ref }}',
    source_artifact_run_id: '${{ needs.source-authority.outputs.source_run_id }}',
    source_authority_artifact_name: '${{ needs.source-authority.outputs.source_authority_artifact_name }}',
    source_cutoff_observed_at: '${{ needs.source-authority.outputs.source_cutoff_observed_at }}',
  };

  let failures = failIf(
    id,
    !sameJson(Object.keys(workflow.on ?? {}), ['workflow_dispatch']) ||
      !sameJson(Object.keys(workflow.on?.workflow_dispatch?.inputs ?? {}).sort(), [
        'app_ref', 'channel', 'framework_ref', 'operation', 'operator_confirmation',
        'publication_record_ref', 'qualified_artifact_run_id', 'shell_ref', 'version',
      ]) ||
      !sameJson(workflow.on?.workflow_dispatch?.inputs?.operation?.options, ['qualify', 'publish', 'promote']) ||
      !sameJson(workflow.on?.workflow_dispatch?.inputs?.channel?.options, ['stable', 'preview']) ||
      !exactObject(workflow.permissions, exactReadPermissions) || workflow.concurrency !== undefined ||
      !sameJson(Object.keys(jobs).sort(), ['promote-webui-latest', 'source-authority', 'webui-carrier', 'webui-carrier-qualification']),
    'WebUI must expose one qualify, publish, or promote entry with one channel and exact operation inputs',
  );

  const { 'source-authority': sourceAuthority, 'webui-carrier': carrier, 'webui-carrier-qualification': qualification, 'promote-webui-latest': promotion } = jobs;
  failures += failIf(
    id,
    !sourceAuthority || Object.prototype.hasOwnProperty.call(sourceAuthority, 'needs') ||
      sourceAuthority.if !== "${{ inputs.operation == 'qualify' || inputs.operation == 'publish' }}" ||
      !exactObject(sourceAuthority.permissions, exactReadPermissions) ||
      !carrier || !needsExactly(carrier, ['source-authority']) || carrier.uses !== './.github/workflows/_release-webui-carrier.yml' ||
      !exactObject(carrier.permissions, exactWebUiCompileCeilingPermissions) ||
      !exactObject(carrier.with, {
        ...expectedCarrierCommonWith,
        mode: "${{ inputs.qualified_artifact_run_id != '' && 'publish-prequalified' || 'execute' }}",
        qualified_artifact_run_id: '${{ inputs.qualified_artifact_run_id }}',
      }) ||
      carrier.if !== "${{ inputs.operation == 'publish' }}" ||
      !qualification || !needsExactly(qualification, ['source-authority']) || qualification.uses !== './.github/workflows/_release-webui-carrier.yml' ||
      !exactObject(qualification.permissions, exactWebUiCompileCeilingPermissions) ||
      qualification.if !== "${{ inputs.operation == 'qualify' }}" ||
      !exactObject(qualification.with, { ...expectedCarrierCommonWith, mode: 'qualify' }) ||
      !promotion || !String(promotion.if).includes("inputs.operation == 'publish'") ||
      !String(promotion.if).includes("needs.webui-carrier.result == 'success'") ||
      !needsExactly(promotion, ['source-authority', 'webui-carrier']) ||
      promotion.uses !== './.github/workflows/release-webui-stable.yml' ||
      !exactObject(promotion.permissions, exactWebUiCompileCeilingPermissions) ||
      !exactObject(promotion.with, {
        authority_mode: "${{ inputs.channel == 'stable' && 'independent_stable' || 'independent_preview' }}",
        publication_record_ref: "${{ inputs.operation == 'publish' && needs.webui-carrier.outputs.publication_record_ref || inputs.publication_record_ref }}",
        operator_confirmation: "${{ inputs.operation == 'publish' && format('move-docker-stable-and-latest:{0}', needs.source-authority.outputs.version) || inputs.operator_confirmation }}",
      }),
    'WebUI operations must route mutually exclusive qualification, publication, and moving-tag promotion calls',
  );
  failures += failIf(
    id,
    ['webui-source-authority.ts', 'test "$GITHUB_RUN_ATTEMPT" = 1', 'test "$GITHUB_REF" = refs/heads/main'].some((s) => !operations.text.includes(s)) ||
      /stable_authority_run_id|build-and-qualify|publish-immutable-carrier|\boras tag\b/.test(jobEvidenceText(sourceAuthority)) ||
      /_release-webui-carrier\.yml|webui-source-authority\.ts/.test(JSON.stringify(promotion)),
    'WebUI source authority and promotion leaves must not absorb each other or Desktop Stable authority',
  );
  return failures;
}
