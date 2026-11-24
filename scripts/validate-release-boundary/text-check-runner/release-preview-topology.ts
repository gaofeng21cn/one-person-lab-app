import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  exactObject,
  hasStableMutationMutex,
  requestsWritePermission,
  jobRuns,
  jobEvidenceText,
  actionSteps,
  hasLocalStep,
  localActionUse,
  workflowJobs,
  needsExactly,
  parseWorkflow,
  reportFailure,
} from './report.ts';
import {
  exactReadPermissions,
  exactStableEntryPermissions,
  exactWebUiCompileCeilingPermissions,
  exactStableStandardPermissions,
  exactStableStandardBundlePermissions,
  manualPreviewWorkflowPath,
  manualFullPreviewWorkflowPath,
  manualFullPreviewMutationJob,
  webuiStablePromotionWorkflowPath,
  webuiStablePromotionMutationJob,
  webuiPromotionPublishEnvironment,
  webuiDevelopmentWorkflowPath,
  stableFollowupWorkflowPath,
  stableFollowupActionPaths,
  homebrewFullPublisherWorkflowPath,
  postPublicationOptionalCertificationWorkflowPath,
  stableDesktopFollowupWorkflowPath,
  desktopPlatformAddonWorkflowPath,
  fullAddonFollowerWorkflowPath,
  nightlyReleaseWorkflowPath,
  nightlyFollowupWorkflowPath,
  previewLatestPointerWorkflowPath,
  studioReleaseWorkflowPath,
  studioFullReleaseWorkflowPath,
  stableEntrySpecs,
  stableReleaseActionPaths,
  releaseWorkflowPaths,
  releaseWorkflowPathsForProfile,
} from './workflow-policy.ts';
import { validateExactActionPins } from './workflow-policy.ts';

export function validatePreviewLatestPointerTopology(appRoot: string): number {
  const id = 'preview_latest_pointer_topology';
  const parsed = parseWorkflow(appRoot, previewLatestPointerWorkflowPath, id);
  if (!parsed) return 1;
  const { workflow, text } = parsed;
  const inputs = Object.keys(workflow.on?.workflow_call?.inputs ?? {}).sort();
  const expectedInputs = [
    'app_ref',
    'expected_current_latest_tag',
    'operation_deadline_at',
    'operation_started_at',
    'target_tag',
  ];
  const jobs = workflow.jobs ?? {};
  const mutation = jobs['move-latest-pointer'];
  let failures = 0;
  if (
    JSON.stringify(Object.keys(workflow.on ?? {})) !== JSON.stringify(['workflow_call'])
    || !exactObject(workflow.permissions, exactReadPermissions)
    || JSON.stringify(inputs) !== JSON.stringify(expectedInputs)
    || JSON.stringify(Object.keys(jobs)) !== JSON.stringify(['move-latest-pointer'])
    || mutation?.environment !== 'release-preview-latest'
    || !exactObject(mutation?.permissions, exactStableEntryPermissions)
    || !Array.isArray(mutation?.steps)
  ) {
    failures += reportFailure(
      id,
      'Preview Latest pointer must be one protected reusable-only single writer',
    );
  }
  for (const required of [
    'test "$GITHUB_RUN_ATTEMPT" = 1',
    'release-operation-deadline.ts check',
    '--operation move_latest_pointer',
    'framework-release-adapter.ts github-move-latest-pointer',
    '--expected-current-latest-tag',
    'outcome_unknown',
    'no second PATCH is allowed',
    'releases/latest',
    'public-opl-app-component-manifest.json',
    'quality_status',
    'quality_unchanged',
    'persistent_override',
    'next_qualified_stable',
  ]) {
    if (!text.includes(required)) {
      failures += reportFailure(id, `Preview Latest pointer reusable is missing ${required}`);
    }
  }
  if (
    /workflow_dispatch|release create|release upload|gh run (?:rerun|cancel)|--clobber/.test(text)
  ) {
    failures += reportFailure(
      id,
      'Preview Latest pointer reusable contains a second dispatcher or forbidden release mutation',
    );
  }
  for (const [jobId, job] of Object.entries(jobs)) {
    failures += validateExactActionPins(
      previewLatestPointerWorkflowPath,
      jobId,
      Array.isArray((job as Record<string, any>).steps)
        ? (job as Record<string, any>).steps
        : [],
    );
  }
  return failures;
}

export function validateManualFullPreviewControlPlane(appRoot: string): number {
  const id = 'manual_full_preview_control_plane';
  const parsed = parseWorkflow(appRoot, manualFullPreviewWorkflowPath, id);
  if (!parsed) return 1;
  const { workflow, text } = parsed;
  let failures = 0;
  if (JSON.stringify(Object.keys(workflow.on ?? {})) !== JSON.stringify(['workflow_dispatch'])) {
    failures += reportFailure(id, 'Manual Full preview must expose only workflow_dispatch');
  }
  const inputs = workflow.on?.workflow_dispatch?.inputs ?? {};
  if (JSON.stringify(Object.keys(inputs).sort()) !== JSON.stringify([
    'handoff_manifest_sha256', 'handoff_nonce', 'operation',
  ])) {
    failures += reportFailure(id, 'Manual Full preview inputs must be exactly operation, handoff_nonce, and handoff_manifest_sha256');
  }
  if (
    inputs.operation?.required !== true
    || inputs.operation?.type !== 'choice'
    || JSON.stringify(inputs.operation?.options) !== JSON.stringify(['publish', 'cleanup'])
    || inputs.handoff_nonce?.required !== true
    || inputs.handoff_nonce?.type !== 'string'
    || inputs.handoff_manifest_sha256?.required !== true
    || inputs.handoff_manifest_sha256?.type !== 'string'
  ) {
    failures += reportFailure(id, 'Manual Full preview dispatch input contract is invalid');
  }
  if (!exactObject(workflow.permissions, exactReadPermissions)) {
    failures += reportFailure(id, 'Manual Full preview top-level permissions must be exactly contents:read/actions:read');
  }
  if (workflow.concurrency !== undefined) {
    failures += reportFailure(id, 'Manual Full preview ingress must not hold the public mutation mutex');
  }
  const jobs = workflowJobs(workflow);
  if (JSON.stringify(Object.keys(jobs).sort()) !== JSON.stringify(['ingress', 'mutate'])) {
    failures += reportFailure(id, 'Manual Full preview jobs must be exactly ingress and mutate');
  }
  const ingress = jobs.ingress;
  const mutate = jobs.mutate;
  if (
    !ingress
    || JSON.stringify(ingress['runs-on']) !== JSON.stringify(['self-hosted', 'macOS', 'ARM64', 'opl-gui-vm'])
    || ingress.environment !== undefined
    || !exactObject(ingress.permissions, exactReadPermissions)
    || ingress.secrets !== undefined
  ) {
    failures += reportFailure(id, 'Manual Full preview ingress must be the read-only dedicated macOS ARM64 runner');
  }
  if (
    !mutate
    || !needsExactly(mutate, ['ingress'])
    || mutate.environment !== 'release-stable'
    || !exactObject(mutate.permissions, exactStableEntryPermissions)
    || !hasStableMutationMutex(mutate)
    || mutate.secrets !== undefined
  ) {
    failures += reportFailure(id, 'Manual Full preview mutation must be admission-dependent and protected by release-stable');
  }
  const ingressRuns = jobRuns(ingress);
  const mutateRuns = jobRuns(mutate);
  if (
    !ingressRuns.includes('test "$GITHUB_RUN_ATTEMPT" = 1')
    || !ingressRuns.includes('OPL_MANUAL_PREVIEW_INGRESS_ROOT')
    || !ingressRuns.includes('manual-full-preview-release.ts ingest')
    || !mutateRuns.includes('test "$GITHUB_RUN_ATTEMPT" = 1')
    || !mutateRuns.includes('manual-full-preview-release.ts verify-artifact')
    || !mutateRuns.includes('manual-full-preview-release.ts mutate')
  ) {
    failures += reportFailure(id, 'Manual Full preview must enforce attempt one, fixed ingress, artifact readback, and the thin executor');
  }
  if (
    !text.includes('artifact-ids: ${{ needs.ingress.outputs.artifact_id }}')
    || !text.includes('overwrite: false')
    || !text.includes('compression-level: 0')
    || /(?:opl release|gh workflow run|gh run (?:rerun|cancel)|--clobber)/.test(text)
  ) {
    failures += reportFailure(id, 'Manual Full preview transport or forbidden mutation boundary drifted');
  }
  for (const [jobId, job] of Object.entries(jobs)) {
    failures += validateExactActionPins(
      manualFullPreviewWorkflowPath,
      jobId,
      Array.isArray(job.steps) ? job.steps : [],
    );
  }
  return failures;
}

export function validateIndependentWebuiPreviewTopology(appRoot: string): number {
  const id = 'independent_webui_publication_topology';
  const operations = parseWorkflow(appRoot, webuiDevelopmentWorkflowPath, id);
  if (!operations) return 1;
  let failures = 0;
  const workflow = operations.workflow;
  const jobs = workflowJobs(workflow);
  const expectedInputs = [
    'app_ref',
    'channel',
    'framework_ref',
    'operation',
    'operator_confirmation',
    'publication_record_ref',
    'qualified_artifact_run_id',
    'shell_ref',
    'version',
  ];
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
  if (
    JSON.stringify(Object.keys(workflow.on ?? {})) !== JSON.stringify(['workflow_dispatch'])
    || JSON.stringify(Object.keys(workflow.on?.workflow_dispatch?.inputs ?? {}).sort()) !==
      JSON.stringify(expectedInputs)
    || JSON.stringify(workflow.on?.workflow_dispatch?.inputs?.operation?.options) !==
      JSON.stringify(['qualify', 'publish', 'promote'])
    || JSON.stringify(workflow.on?.workflow_dispatch?.inputs?.channel?.options) !==
      JSON.stringify(['stable', 'preview'])
    || !exactObject(workflow.permissions, exactReadPermissions)
    || workflow.concurrency !== undefined
    || JSON.stringify(Object.keys(jobs).sort()) !== JSON.stringify([
      'promote-webui-latest',
      'source-authority',
      'webui-carrier',
      'webui-carrier-qualification',
    ])
  ) {
    failures += reportFailure(
      id,
      'WebUI must expose one qualify, publish, or promote entry with one channel and exact operation inputs',
    );
  }
  const sourceAuthority = jobs['source-authority'];
  const carrier = jobs['webui-carrier'];
  const qualification = jobs['webui-carrier-qualification'];
  const promotion = jobs['promote-webui-latest'];
  if (
    !sourceAuthority
    || Object.prototype.hasOwnProperty.call(sourceAuthority, 'needs')
    || sourceAuthority.if !== "${{ inputs.operation == 'qualify' || inputs.operation == 'publish' }}"
    || !exactObject(sourceAuthority.permissions, exactReadPermissions)
    || !carrier
    || !needsExactly(carrier, ['source-authority'])
    || carrier.uses !== './.github/workflows/_release-webui-carrier.yml'
    || !exactObject(carrier.permissions, exactWebUiCompileCeilingPermissions)
    || !exactObject(carrier.with, {
      ...expectedCarrierCommonWith,
      mode: "${{ inputs.qualified_artifact_run_id != '' && 'publish-prequalified' || 'execute' }}",
      qualified_artifact_run_id: '${{ inputs.qualified_artifact_run_id }}',
    })
    || carrier.if !== "${{ inputs.operation == 'publish' }}"
    || !qualification
    || !needsExactly(qualification, ['source-authority'])
    || qualification.uses !== './.github/workflows/_release-webui-carrier.yml'
    || !exactObject(qualification.permissions, exactWebUiCompileCeilingPermissions)
    || qualification.if !== "${{ inputs.operation == 'qualify' }}"
    || !exactObject(qualification.with, { ...expectedCarrierCommonWith, mode: 'qualify' })
    || !promotion
    || !String(promotion.if).includes("inputs.operation == 'publish'")
    || !String(promotion.if).includes("needs.webui-carrier.result == 'success'")
    || !needsExactly(promotion, ['source-authority', 'webui-carrier'])
    || promotion.uses !== './.github/workflows/release-webui-stable.yml'
    || !exactObject(promotion.permissions, exactWebUiCompileCeilingPermissions)
    || !exactObject(promotion.with, {
      authority_mode: "${{ inputs.channel == 'stable' && 'independent_stable' || 'independent_preview' }}",
      publication_record_ref: "${{ inputs.operation == 'publish' && needs.webui-carrier.outputs.publication_record_ref || inputs.publication_record_ref }}",
      operator_confirmation: "${{ inputs.operation == 'publish' && format('move-docker-stable-and-latest:{0}', needs.source-authority.outputs.version) || inputs.operator_confirmation }}",
    })
  ) {
    failures += reportFailure(
      id,
      'WebUI operations must route mutually exclusive qualification, publication, and moving-tag promotion calls',
    );
  }
  if (
    !operations.text.includes('webui-source-authority.ts')
    || !operations.text.includes('test "$GITHUB_RUN_ATTEMPT" = 1')
    || !operations.text.includes('test "$GITHUB_REF" = refs/heads/main')
    || /stable_authority_run_id|build-and-qualify|publish-immutable-carrier|\boras tag\b/.test(
      jobEvidenceText(sourceAuthority),
    )
    || /_release-webui-carrier\.yml|webui-source-authority\.ts/.test(
      JSON.stringify(promotion),
    )
  ) {
    failures += reportFailure(
      id,
      'WebUI source authority and promotion leaves must not absorb each other or Desktop Stable authority',
    );
  }
  return failures;
}
