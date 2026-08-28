import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  releaseBoundaryChecksForProfile,
  releaseValidationProfile,
  releaseWorkflowPaths,
  releaseWorkflowPathsForProfile,
} from './release-checks.ts';

const workflowMutationCommandPattern = /gh\s+api\s+(?:--method(?:=|\s+)|-X(?:=|\s*)?)(?:POST|PATCH|PUT|DELETE)\b|gh\s+workflow\s+run|gh\s+run\s+(?:cancel|rerun)|gh\s+release\s+(?:create|edit|upload|delete)|git\b[^\n]*\s(?:push|tag)\b|\bopl\s+release\s+(?:freeze|operation\s+admit|build|verify|publish|reconcile)\b|publish-(?:release|full-addon)\.ts|cleanup-draft-release-candidates\.ts|curl\b[^\n]*(?:--request|-X)\s*(?:POST|PATCH|PUT|DELETE)/;
const retiredLiveAuthorityPattern = /release[_ -]broker|verify-release-broker|verify-release-session-lease|release_attempt_id|release_mutation_payload_sha256|pre_api_admission_receipt_base64|release[_ -]session[_ -]lease/i;
const exactReadPermissions = { contents: 'read', actions: 'read' } as const;
const exactStableEntryPermissions = { contents: 'write', actions: 'read' } as const;
const exactWebUiCompileCeilingPermissions = {
  contents: 'read',
  actions: 'read',
  packages: 'write',
} as const;
const exactStableStandardPermissions = { contents: 'write', actions: 'read' } as const;
const manualPreviewWorkflowPath = '.github/workflows/release-manual-preview.yml';
const manualFullPreviewWorkflowPath = '.github/workflows/release-manual-full-preview.yml';
const manualFullPreviewMutationJob = 'mutate';
const webuiStablePromotionWorkflowPath = '.github/workflows/release-webui-stable.yml';
const webuiStablePromotionMutationJob = 'promote-webui-stable';
const webuiPromotionPublishEnvironment =
  "${{ needs.admission.outputs.authority_mode == 'independent_preview' && 'release-preview-publication' || 'release-stable' }}";
const webuiDevelopmentWorkflowPath = '.github/workflows/release-webui-development.yml';
const stableFollowupWorkflowPath = '.github/workflows/release-stable-post-success-followups.yml';
const stableFollowupActionPaths = {
  observe: '.github/actions/release-followups/observe/action.yml',
  fullAddon: '.github/actions/release-followups/full-addon/action.yml',
  homebrewStandard: '.github/actions/release-followups/homebrew-standard/action.yml',
  homebrewFullHandoff: '.github/actions/release-followups/homebrew-full-handoff/action.yml',
} as const;
const homebrewFullPublisherWorkflowPath = '.github/workflows/_release-homebrew-full-publish.yml';
const postPublicationOptionalCertificationWorkflowPath =
  '.github/workflows/release-post-publication-certification.yml';
const stableDesktopFollowupWorkflowPath = stableFollowupWorkflowPath;
const desktopPlatformAddonWorkflowPath = '.github/workflows/_release-desktop-platform-addon.yml';
const fullAddonFollowerWorkflowPath = stableFollowupWorkflowPath;
const nightlyReleaseWorkflowPath = '.github/workflows/release-nightly.yml';
const nightlyFollowupWorkflowPath = '.github/workflows/release-nightly-followups.yml';
const previewLatestPointerWorkflowPath =
  '.github/workflows/_release-preview-latest-pointer.yml';
const studioReleaseWorkflowPath = '.github/workflows/_release-studio.yml';
const studioFullReleaseWorkflowPath = '.github/workflows/_release-studio-full.yml';
const exactWebuiStablePromotionPermissions = {
  actions: 'read',
  contents: 'read',
  packages: 'write',
} as const;

const expectedScheduledWorkflows = new Map([
  ['codeql.yml', ['17 18 * * 0']],
  ['release-bundle-canary.yml', ['0 13 * * *']],
  ['release-nightly.yml', ['17 19 * * *']],
]);
const expectedWorkflowRunFollowers = new Map([
  ['release-nightly-followups.yml', 'OPL Standard Nightly Release'],
  ['release-post-publication-certification.yml', 'OPL Stable Follow-ups'],
  ['release-stable-post-success-followups.yml', 'OPL Stable Release Bundle'],
]);
const retiredWorkflowEntries = new Set([
  'build-and-release.yml',
  'desktop-release-cleanup-drafts.yml',
  'desktop-release-diagnostics.yml',
  'desktop-release-full-addon.yml',
  'desktop-release-promote.yml',
  'desktop-release.yml',
  'docker-webui-clean-linux-vm.yml',
  'docker-webui-clean-windows-vm.yml',
  'full-runtime-cache-warmup.yml',
  'homebrew-tap-update.yml',
  'nightly-standard-release.yml',
  'opl-updater-upgrade-vm.yml',
  'release-apple-credentials-preflight.yml',
  'release-attempt-observability.yml',
  'release-full-addon-follower.yml',
  'release-homebrew-full-follower.yml',
  'release-homebrew-standard-follower.yml',
  'release-nightly-homebrew-follower.yml',
  'release-nightly-sampled-vm.yml',
  'release-timestamp-authority-diagnostic.yml',
  'release-verify-remote.yml',
  'release-webui-development-promote.yml',
  'webui-ghcr-release.yml',
]);

export const stableReleaseActionPaths = [...new Set([
  '.github/actions/setup-active-shell-deps/action.yml',
  ...Object.values(stableFollowupActionPaths),
  stableFollowupWorkflowPath,
  postPublicationOptionalCertificationWorkflowPath,
  '.github/workflows/release-source-qualification.yml',
  studioReleaseWorkflowPath,
  ...releaseWorkflowPaths,
])];

function exactObject(value: unknown, expected: Record<string, unknown>): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  return Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([name, expectedValue]) => actual[name] === expectedValue);
}

function hasStableMutationMutex(job: Record<string, any> | undefined): boolean {
  return job?.concurrency?.group === 'opl-release-bundle-global'
    && job.concurrency?.['cancel-in-progress'] === false;
}

function requestsWritePermission(value: unknown): boolean {
  if (value === 'write-all') return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).some((permission) => permission === 'write');
}

function jobRuns(job: Record<string, any> | undefined): string {
  return (Array.isArray(job?.steps) ? job.steps as Array<Record<string, any>> : [])
    .map((step) => typeof step.run === 'string' ? step.run : '')
    .join('\n');
}

function jobEvidenceText(job: Record<string, any> | undefined): string {
  return (Array.isArray(job?.steps) ? job.steps as Array<Record<string, any>> : [])
    .map((step) => [
      typeof step.name === 'string' ? step.name : '',
      typeof step.run === 'string' ? step.run : '',
      typeof step.uses === 'string' ? step.uses : '',
      step.with && typeof step.with === 'object' ? JSON.stringify(step.with) : '',
    ].join('\n'))
    .join('\n');
}

function actionSteps(action: Record<string, any>): Array<Record<string, any>> {
  return Array.isArray(action.runs?.steps)
    ? action.runs.steps as Array<Record<string, any>>
    : [];
}

function hasLocalStep(job: Record<string, any> | undefined, uses: string): boolean {
  return Array.isArray(job?.steps)
    && job.steps.some((step: Record<string, any>) => step.uses === uses);
}

function localActionUse(actionPath: string): string {
  return `./${actionPath.replace(/\/action\.yml$/, '')}`;
}

function workflowJobs(workflow: Record<string, any>): Record<string, Record<string, any>> {
  return workflow.jobs && typeof workflow.jobs === 'object'
    ? workflow.jobs as Record<string, Record<string, any>>
    : {};
}

function needsExactly(job: Record<string, any>, expected: string[]): boolean {
  const needs = typeof job.needs === 'string' ? [job.needs] : job.needs;
  return Array.isArray(needs) && needs.length === expected.length &&
    expected.every((name, index) => needs[index] === name);
}

export function isAuthorizedWebuiStablePromotionWriteJob(
  workflowPath: string,
  jobId: string,
  job: Record<string, any>,
): boolean {
  return workflowPath === webuiStablePromotionWorkflowPath
    && jobId === webuiStablePromotionMutationJob
    && needsExactly(job, ['admission'])
    && job.environment === webuiPromotionPublishEnvironment
    && exactObject(job.concurrency, {
      group: 'opl-webui-stable-promotion-global',
      'cancel-in-progress': false,
    })
    && exactObject(job.permissions, exactWebuiStablePromotionPermissions);
}

function isAuthorizedManualPreviewWriteJob(
  workflowPath: string,
  jobId: string,
  job: Record<string, any>,
): boolean {
  if (
    workflowPath !== manualPreviewWorkflowPath
    || !needsExactly(job, ['admission'])
    || !exactObject(job.permissions, exactStableEntryPermissions)
    || job.secrets !== 'inherit'
    || Object.prototype.hasOwnProperty.call(job, 'steps')
  ) {
    return false;
  }
  if (jobId === 'preview') {
    return job.if === "${{ needs.admission.outputs.operation == 'preview' }}"
      && job.uses === './.github/workflows/_release-bundle.yml'
      && job.with?.operation === 'standard'
      && job.with?.channel === 'preview'
      && job.with?.publication_channel === 'preview'
      && job.with?.latest_override_requested ===
        "${{ needs.admission.outputs.latest_override_requested == 'true' }}"
      && job.with?.include_full === false;
  }
  if (jobId === 'move-latest-pointer') {
    return job.if === "${{ needs.admission.outputs.operation == 'move_latest_pointer' }}"
      && job.uses === './.github/workflows/_release-preview-latest-pointer.yml'
      && job.with?.app_ref === '${{ needs.admission.outputs.app_ref }}'
      && job.with?.target_tag === '${{ needs.admission.outputs.target_tag }}'
      && job.with?.expected_current_latest_tag ===
        '${{ needs.admission.outputs.expected_current_latest_tag }}'
      && job.with?.operation_started_at ===
        '${{ needs.admission.outputs.operation_started_at }}'
      && job.with?.operation_deadline_at ===
        '${{ needs.admission.outputs.operation_deadline_at }}'
      && hasStableMutationMutex(job);
  }
  return jobId === 'resume-preview'
    && job.if === "${{ needs.admission.outputs.operation == 'resume_preview' }}"
    && job.uses === './.github/workflows/_release-standard-publish.yml'
    && job.with?.operation === 'resume_standard'
    && job.with?.publication_channel === 'preview'
    && hasStableMutationMutex(job);
}

function isAuthorizedStableDesktopFollowupWriteJob(
  workflowPath: string,
  jobId: string,
  job: Record<string, any>,
): boolean {
  if (workflowPath !== stableDesktopFollowupWorkflowPath) return false;
  if (jobId === 'reconcile-desktop-platforms') {
    return job.if === "${{ needs.admit.outputs.applicable == 'true' }}"
      && needsExactly(job, ['admit'])
      && job.uses === './.github/workflows/_release-desktop-platform-addon.yml'
      && exactObject(job.permissions, exactStableEntryPermissions)
      && job.strategy?.['fail-fast'] === false
      && job.concurrency?.group ===
        'opl-stable-desktop-${{ needs.admit.outputs.source_run_id }}-${{ matrix.platform_id }}'
      && job.concurrency?.['cancel-in-progress'] === false
      && !Array.isArray(job.steps);
  }
  return jobId === 'repair-additive'
    && job.if === "${{ needs.repair-admit.result == 'success' }}"
    && needsExactly(job, ['repair-admit'])
    && job.environment === 'release-stable'
    && exactObject(job.permissions, exactStableEntryPermissions)
    && hasStableMutationMutex(job);
}

function isAuthorizedFullAddonFollowerWriteJob(
  workflowPath: string,
  jobId: string,
  job: Record<string, any>,
): boolean {
  if (workflowPath !== fullAddonFollowerWorkflowPath || jobId !== 'reconcile-full-addon') return false;
  return job['runs-on'] === 'ubuntu-latest'
    && job['timeout-minutes'] === 20
    && job.environment === undefined
    && job.if === "${{ needs.route.outputs.full_addon == 'true' }}"
    && needsExactly(job, ['route'])
    && exactObject(job.permissions, { contents: 'read', actions: 'write' })
    && exactObject(job.concurrency, {
      group: 'opl-stable-full-addon-${{ needs.route.outputs.source_run_id }}',
      'cancel-in-progress': false,
    })
    && hasLocalStep(job, localActionUse(stableFollowupActionPaths.fullAddon));
}

function isAuthorizedStableWebuiWriteJob(
  workflowPath: string,
  jobId: string,
  job: Record<string, any>,
): boolean {
  if (workflowPath !== '.github/workflows/release-stable.yml') return false;
  if (jobId === 'webui-carrier') {
    return needsExactly(job, ['webui-source-authority'])
      && job.uses === './.github/workflows/_release-webui-carrier.yml'
      && job.if === "${{ !cancelled() && needs.webui-source-authority.result == 'success' }}"
      && exactObject(job.permissions, exactWebUiCompileCeilingPermissions)
      && job.with?.authority_mode === 'independent_stable'
      && job.with?.mode === 'execute'
      && job.secrets === 'inherit'
      && !Array.isArray(job.steps);
  }
  return jobId === 'webui-promotion'
    && needsExactly(job, ['webui-source-authority', 'webui-carrier'])
    && job.uses === './.github/workflows/release-webui-stable.yml'
    && job.if === "${{ !cancelled() && needs.webui-carrier.result == 'success' }}"
    && exactObject(job.permissions, exactWebUiCompileCeilingPermissions)
    && job.with?.authority_mode === 'independent_stable'
    && job.secrets === 'inherit'
    && !Array.isArray(job.steps);
}

function validatePreviewLatestPointerTopology(appRoot: string): number {
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

function reportFailure(id: string, message: string): number {
  console.error(`FAIL ${id}: ${message}`);
  return 1;
}

const workflowParseCache = new Map<string, {
  workflow: Record<string, any>;
  text: string;
}>();

function parseWorkflow(appRoot: string, relativePath: string, id: string): {
  workflow: Record<string, any>;
  text: string;
} | null {
  const absolutePath = path.join(appRoot, relativePath);
  try {
    const text = fs.readFileSync(absolutePath, 'utf8');
    const cached = workflowParseCache.get(absolutePath);
    if (cached?.text === text) return cached;
    const parsed = { workflow: parseYaml(text) as Record<string, any>, text };
    workflowParseCache.set(absolutePath, parsed);
    return parsed;
  } catch (error) {
    reportFailure(id, `${relativePath} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

const stableEntrySpecs = {
  standard: {
    operation: 'standard',
    workflow: './.github/workflows/_release-bundle.yml',
    if: "${{ !cancelled() && inputs.operation == 'standard' && needs.admission.result == 'success' }}",
    needs: ['admission', 'protected-operation-admission', 'stable-admission-manifest'],
    requiredInputs: {
      operation: 'standard',
      channel: 'stable',
      version: '${{ needs.stable-admission-manifest.outputs.version }}',
      include_full: '${{ fromJSON(needs.admission.outputs.include_full) }}',
      package_compatibility_abi: '${{ needs.admission.outputs.package_compatibility_abi }}',
      package_compatibility_version_range: '${{ needs.admission.outputs.package_compatibility_version_range }}',
      app_ref: '${{ needs.protected-operation-admission.outputs.app_ref }}',
      shell_ref: '${{ needs.protected-operation-admission.outputs.shell_ref }}',
      framework_ref: '${{ needs.protected-operation-admission.outputs.framework_ref }}',
      operation_started_at: '${{ needs.admission.outputs.operation_started_at }}',
      operation_deadline_at: '${{ needs.admission.outputs.operation_deadline_at }}',
      stable_operation_control_artifact: 'opl-stable-operation-control-${{ github.run_id }}',
      stable_operation_control_digest: '${{ needs.protected-operation-admission.outputs.control_digest }}',
    },
    permissions: exactStableStandardPermissions,
  },
  'resume-standard': {
    operation: 'resume_standard',
    workflow: './.github/workflows/_release-standard-publish.yml',
    if: "${{ !cancelled() && inputs.operation == 'resume_standard' && needs.admission.result == 'success' }}",
    needs: ['admission'],
    requiredInputs: {
      operation: 'resume_standard',
      source_run_id: '${{ needs.admission.outputs.source_run_id }}',
      source_artifact: '${{ needs.admission.outputs.source_artifact }}',
      operation_started_at: '${{ needs.admission.outputs.operation_started_at }}',
      operation_deadline_at: '${{ needs.admission.outputs.operation_deadline_at }}',
    },
    permissions: exactStableEntryPermissions,
  },
  'append-full': {
    operation: 'append_full',
    workflow: './.github/workflows/_release-full-addon.yml',
    if: "${{ !cancelled() && inputs.operation == 'append_full' && needs.admission.result == 'success' }}",
    needs: ['admission'],
    requiredInputs: {
      operation: 'append_full',
      source_run_id: '${{ needs.admission.outputs.source_run_id }}',
      source_artifact: '${{ needs.admission.outputs.source_artifact }}',
      operation_started_at: '${{ needs.admission.outputs.operation_started_at }}',
      operation_deadline_at: '${{ needs.admission.outputs.operation_deadline_at }}',
    },
    permissions: exactStableEntryPermissions,
  },
} as const;

function validateStableOperationControlArtifactConsumer(appRoot: string): number {
  const id = 'stable_operation_control_artifact_consumer';
  const parsed = parseWorkflow(appRoot, '.github/workflows/_release-bundle.yml', id);
  if (!parsed) return 1;
  const { text } = parsed;
  let failures = 0;
  for (const required of [
    'stable_operation_control_artifact:',
    'stable_operation_control_digest:',
    'Download protected Stable operation control',
    'Consume one protected Stable operation control before cold work',
    'stable-operation-control.ts consume',
    'opl-stable-operation-consumption-${{ github.run_id }}',
    'Require one matching consumed Stable operation control',
    '--input "$consumption"',
  ]) {
    if (!text.includes(required)) {
      failures += reportFailure(id, `Stable Bundle is missing durable control consumption ${required}`);
    }
  }
  if (
    text.includes('validate-release-source-gate.ts')
    || text.includes('release-dispatch-guard.ts preflight')
    || text.includes('release-source-qualification.yml')
  ) {
    failures += reportFailure(
      id,
      'Stable Bundle must consume the protected control artifact and must not rerun source-gate, pre-nonce guard, or source qualification.',
    );
  }
  return failures;
}

function validateStudioFullAppendTopology(
  appRoot: string,
  id: string,
  stableJobs: Record<string, Record<string, any>>,
): number {
  let failures = 0;
  const admission = stableJobs['studio-full-append-admission'];
  const execution = stableJobs['studio-full-append'];
  const admissionEvidence = jobEvidenceText(admission);

  if (
    !admission
    || admission.if !== "${{ inputs.entry == 'studio_full_append' }}"
    || Object.prototype.hasOwnProperty.call(admission, 'needs')
    || admission.environment !== 'release-stable'
    || !exactObject(admission.permissions, exactReadPermissions)
  ) {
    failures += reportFailure(id, 'studio-full-append-admission must be the initial read-only Full append gate');
  }
  if (workflowMutationCommandPattern.test(jobRuns(admission))) {
    failures += reportFailure(id, 'Studio Full admission must not perform public mutation');
  }
  for (const binding of [
    'Reject mutable or mixed Studio Full append request',
    'test "$GITHUB_EVENT_NAME" = workflow_dispatch',
    'test "$GITHUB_REF" = refs/heads/main',
    'test -z "$REQUESTED_APP_REF"',
    '[[ "$STUDIO_SHA" =~ ^[0-9a-f]{40}$ ]]',
    '[[ "$STUDIO_TREE" =~ ^[0-9a-f]{40}$ ]]',
    'Checkout exact App release authority',
    'Checkout exact Studio source',
    'opl_studio_full_append_admission.v1',
    'same_tag:true',
    'standard_assets_unchanged:true',
    'latest_unchanged:true',
    'Upload immutable Studio Full append admission',
  ]) {
    if (!admissionEvidence.includes(binding)) {
      failures += reportFailure(id, `Studio Full admission is missing ${binding}`);
    }
  }
  const admissionAppCheckout = admission?.steps?.find(
    (step: Record<string, any>) => step.name === 'Checkout exact App release authority',
  );
  if (
    admissionAppCheckout?.uses !== 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'
    || admissionAppCheckout.with?.ref !== '${{ github.sha }}'
  ) {
    failures += reportFailure(id, 'Studio Full admission must checkout the App authority at github.sha');
  }
  if (/secrets\./.test(JSON.stringify(admission))) {
    failures += reportFailure(id, 'Studio Full admission must not access protected secret values');
  }

  const expectedExecutionIf =
    "${{ !cancelled() && inputs.entry == 'studio_full_append' && needs.studio-full-append-admission.result == 'success' }}";
  const expectedExecutionInputs = {
    app_ref: '${{ needs.studio-full-append-admission.outputs.app_ref }}',
    studio_sha: '${{ needs.studio-full-append-admission.outputs.studio_sha }}',
    studio_tree: '${{ needs.studio-full-append-admission.outputs.studio_tree }}',
    studio_tag: '${{ needs.studio-full-append-admission.outputs.studio_tag }}',
    studio_version: '${{ needs.studio-full-append-admission.outputs.studio_version }}',
    framework_ref: '${{ needs.studio-full-append-admission.outputs.framework_ref }}',
    mas_ref: '${{ needs.studio-full-append-admission.outputs.mas_ref }}',
    mas_scholar_skills_ref: '${{ needs.studio-full-append-admission.outputs.mas_scholar_skills_ref }}',
    mag_ref: '${{ needs.studio-full-append-admission.outputs.mag_ref }}',
    rca_ref: '${{ needs.studio-full-append-admission.outputs.rca_ref }}',
    meta_agent_ref: '${{ needs.studio-full-append-admission.outputs.meta_agent_ref }}',
    bookforge_ref: '${{ needs.studio-full-append-admission.outputs.bookforge_ref }}',
    opl_flow_ref: '${{ needs.studio-full-append-admission.outputs.opl_flow_ref }}',
    officecli_ref: '${{ needs.studio-full-append-admission.outputs.officecli_ref }}',
    mineru_ref: '${{ needs.studio-full-append-admission.outputs.mineru_ref }}',
    standard_release_id: '${{ needs.studio-full-append-admission.outputs.standard_release_id }}',
    standard_release_tag: '${{ needs.studio-full-append-admission.outputs.standard_release_tag }}',
    prior_studio_full_artifact_run_id: '${{ inputs.prior_studio_full_artifact_run_id }}',
    operation_deadline_at: '${{ needs.studio-full-append-admission.outputs.operation_deadline_at }}',
  };
  if (
    !execution
    || execution.if !== expectedExecutionIf
    || !needsExactly(execution, ['studio-full-append-admission'])
    || execution.uses !== `./${studioFullReleaseWorkflowPath}`
    || execution.secrets !== 'inherit'
    || Object.prototype.hasOwnProperty.call(execution, 'steps')
    || !exactObject(execution.permissions, exactReadPermissions)
    || !exactObject(execution.with, expectedExecutionInputs)
  ) {
    failures += reportFailure(id, 'Studio Full execution must be a step-free reusable call bound to the admitted Full inputs');
  }

  const fullWorkflow = parseWorkflow(appRoot, studioFullReleaseWorkflowPath, id);
  if (!fullWorkflow) return failures + 1;
  const fullJobs = workflowJobs(fullWorkflow.workflow);
  const expectedInputNames = [
    'app_ref', 'studio_sha', 'studio_tree', 'studio_tag', 'studio_version', 'framework_ref',
    'mas_ref', 'mas_scholar_skills_ref', 'mag_ref', 'rca_ref', 'meta_agent_ref', 'bookforge_ref',
    'opl_flow_ref', 'officecli_ref', 'mineru_ref', 'standard_release_id', 'standard_release_tag',
    'prior_studio_full_artifact_run_id', 'operation_deadline_at',
  ];
  const inputNames = Object.keys(fullWorkflow.workflow.on?.workflow_call?.inputs ?? {});
  if (
    JSON.stringify(Object.keys(fullWorkflow.workflow.on ?? {})) !== JSON.stringify(['workflow_call'])
    || fullWorkflow.workflow.concurrency !== undefined
    || !exactObject(fullWorkflow.workflow.permissions, exactReadPermissions)
    || JSON.stringify(inputNames) !== JSON.stringify(expectedInputNames)
    || JSON.stringify(Object.keys(fullJobs)) !== JSON.stringify([
      'build-full-signed-notarized',
      'restore-full',
      'publish-full',
      'public-readback',
    ])
  ) {
    failures += reportFailure(id, 'Studio Full reusable workflow must expose one exact four-job same-tag append topology');
  }

  const build = fullJobs['build-full-signed-notarized'];
  const restore = fullJobs['restore-full'];
  const publish = fullJobs['publish-full'];
  const readback = fullJobs['public-readback'];
  if (
    !build
    || build.if !== "${{ inputs.prior_studio_full_artifact_run_id == '' }}"
    || Object.prototype.hasOwnProperty.call(build, 'needs')
    || build['runs-on'] !== 'macos-15'
    || build.environment !== 'release-stable'
    || !exactObject(build.permissions, exactReadPermissions)
    || !restore
    || restore.if !== "${{ inputs.prior_studio_full_artifact_run_id != '' }}"
    || Object.prototype.hasOwnProperty.call(restore, 'needs')
    || restore['runs-on'] !== 'ubuntu-latest'
    || restore.environment !== undefined
    || !exactObject(restore.permissions, exactReadPermissions)
    || !publish
    || publish.if !== "${{ always() && (needs.build-full-signed-notarized.result == 'success' || needs.build-full-signed-notarized.result == 'skipped') && (needs.restore-full.result == 'success' || needs.restore-full.result == 'skipped') }}"
    || !needsExactly(publish, ['build-full-signed-notarized', 'restore-full'])
    || publish['runs-on'] !== 'ubuntu-latest'
    || publish.environment !== 'release-stable'
    || !exactObject(publish.permissions, exactReadPermissions)
    || !exactObject(publish.concurrency, { group: 'opl-studio-publication-global', 'cancel-in-progress': false })
    || !readback
    || readback.if !== "${{ always() && needs.publish-full.result == 'success' }}"
    || !needsExactly(readback, ['publish-full'])
    || readback['runs-on'] !== 'macos-15'
    || readback.environment !== undefined
    || !exactObject(readback.permissions, exactReadPermissions)
  ) {
    failures += reportFailure(id, 'Studio Full reusable jobs must preserve isolated build, append, and public readback ownership');
  }

  const fullEvidence = [build, restore, publish, readback].map(jobEvidenceText).join('\n');
  for (const binding of [
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'scripts/verify-apple-release-credentials.ts',
    'security import',
    'npx electron-builder --mac --arm64 --dir',
    'npm --prefix app-source run release:full',
    'scripts/notarize-macos-dmg.ts',
    'xcrun stapler validate',
    'spctl --assess',
    'Append exactly two Studio Full assets with CAS and no overwrite',
    'studio-full-release-adapter.ts append',
    'one-person-lab-preview-full-',
    'opl-release-manifest.json',
    'Read back public Standard and Full bytes anonymously',
    'public-asset-readback.json',
    'standard_assets_unchanged',
  ]) {
    if (!fullEvidence.includes(binding)) {
      failures += reportFailure(id, `Studio Full reusable workflow is missing ${binding}`);
    }
  }
  const requiredCheckoutRepositories = [
    'gaofeng21cn/one-person-lab-app',
    'gaofeng21cn/opl-studio',
    'gaofeng21cn/one-person-lab',
  ];
  const buildCheckoutRepositories = new Set(
    (Array.isArray(build?.steps) ? build.steps : [])
      .map((step: Record<string, any>) => step.with?.repository)
      .filter((repository: unknown): repository is string => typeof repository === 'string'),
  );
  for (const repository of requiredCheckoutRepositories) {
    if (!buildCheckoutRepositories.has(repository)) {
      failures += reportFailure(id, `Studio Full reusable workflow is missing checkout repository ${repository}`);
    }
  }
  if (
    workflowMutationCommandPattern.test(jobRuns(build))
    || workflowMutationCommandPattern.test(jobRuns(restore))
    || workflowMutationCommandPattern.test(jobRuns(readback))
    || /gh\s+release\s+(?:create|edit|delete|upload)|--clobber/.test(fullWorkflow.text)
    || /bundled-aioncore|aioncore_codex_only|gaofeng21cn\/aionui/i.test(fullWorkflow.text)
    || requestsWritePermission(fullWorkflow.workflow.permissions)
    || Object.values(fullJobs).some((job) => requestsWritePermission(job.permissions))
  ) {
    failures += reportFailure(id, 'Studio Full reusable workflow must remain append-only, no-clobber, and independent of AionUI/AionCore');
  }
  return failures;
}

export function validateStableReleaseControlPlane(appRoot: string): number {
  const id = 'stable_release_control_plane';
  const parsed = parseWorkflow(appRoot, '.github/workflows/release-stable.yml', id);
  if (!parsed) return 1;
  const { workflow, text } = parsed;
  let failures = 0;

  if (JSON.stringify(Object.keys(workflow.on ?? {})) !== JSON.stringify(['workflow_dispatch'])) {
    failures += reportFailure(id, 'release-stable.yml must expose only workflow_dispatch');
  }
  const operationInput = workflow.on?.workflow_dispatch?.inputs?.operation;
  const expectedOperations = ['standard', 'resume_standard', 'append_full'];
  if (operationInput?.type !== 'choice' || operationInput?.required !== true ||
      JSON.stringify(operationInput?.options) !== JSON.stringify(expectedOperations)) {
    failures += reportFailure(id, `operation choices must be exactly ${expectedOperations.join(', ')}`);
  }
  if (workflow.concurrency !== undefined) {
    failures += reportFailure(id, 'Stable admission and qualification must not hold the public mutation mutex');
  }
  if (!exactObject(workflow.permissions, exactReadPermissions)) {
    failures += reportFailure(id, 'top-level Stable permissions must be exactly contents:read/actions:read');
  }
  if (retiredLiveAuthorityPattern.test(text)) {
    failures += reportFailure(id, 'Stable entry must not depend on retired broker/session/lease authority');
  }

  const jobs = workflowJobs(workflow);
  if (!hasStableMutationMutex(jobs['resume-standard'])) {
    failures += reportFailure(
      id,
      'resume-standard must acquire the public mutation mutex only around its reusable publisher',
    );
  }
  const authorityInputs = workflow.on?.workflow_dispatch?.inputs ?? {};
  if (
    authorityInputs.entry?.type !== 'choice'
    || authorityInputs.entry?.required !== false
    || authorityInputs.entry?.default !== 'framework_release'
    || JSON.stringify(authorityInputs.entry?.options) !== JSON.stringify([
      'framework_release',
      'studio_carrier_admission',
      'studio_full_append',
    ])
  ) {
    failures += reportFailure(id, 'Stable entry selector must separate Framework release from plan-only Studio admission');
  }
  for (const name of ['authority_id', 'operation_id', 'authority_carrier', 'authority_digest']) {
    if (authorityInputs[name]?.required !== false || authorityInputs[name]?.default !== '') {
      failures += reportFailure(
        id,
        `${name} must remain an optional recovery input with an empty default; Standard admission enforces it conditionally`,
      );
    }
  }
  for (const name of ['studio_sha', 'studio_tree', 'studio_tag']) {
    if (authorityInputs[name]?.required !== false || authorityInputs[name]?.default !== '') {
      failures += reportFailure(
        id,
        `${name} must remain empty unless the protected Studio admission operation is selected`,
      );
    }
  }
  if (
    !String(workflow['run-name'] ?? '').includes("inputs.operation == 'standard'")
    || !String(workflow['run-name'] ?? '').includes("format('OPL Stable standard operation:{0} authority:{1} run:{2}'")
    || !String(workflow['run-name'] ?? '').includes("format('OPL Stable {0} {1}', inputs.operation, github.run_id)")
    || authorityInputs.version !== undefined
  ) {
    failures += reportFailure(id, 'Stable run identity must retain Standard authority binding while recovery operations remain follower-compatible');
  }

  const expectedJobs = [
    'studio-protected-release-admission',
    'studio-protected-release',
    'studio-full-append-admission',
    'studio-full-append',
    'protected-operation-admission',
    'admission',
    'stable-admission-manifest',
    'webui-source-authority',
    'webui-carrier',
    'webui-promotion',
    ...Object.keys(stableEntrySpecs),
  ].sort();
  if (JSON.stringify(Object.keys(jobs).sort()) !== JSON.stringify(expectedJobs)) {
    failures += reportFailure(id, `jobs must be exactly ${expectedJobs.join(', ')}`);
  }
  if (
    jobs['source-qualification']
    || text.includes('uses: ./.github/workflows/release-source-qualification.yml')
    || text.includes('source-qualification-receipt.ts')
    || text.includes('validate-source-qualification-receipt.ts')
  ) {
    failures += reportFailure(
      id,
      'Stable entry must not retain the legacy source-qualification job or receipt after protected operation admission owns the frozen source gate.',
    );
  }
  const webuiSourceAuthority = jobs['webui-source-authority'];
  const webuiSourceAuthorityRun = jobRuns(webuiSourceAuthority);
  const webuiCheckpointDownload = webuiSourceAuthority?.steps?.find(
    (step: Record<string, any>) => step.name === 'Download exact published Standard checkpoint',
  );
  const webuiAdmissionDownload = webuiSourceAuthority?.steps?.find(
    (step: Record<string, any>) => step.name === 'Download same-run Stable admission',
  );
  if (
    !webuiSourceAuthority
    || !needsExactly(webuiSourceAuthority, ['admission', 'stable-admission-manifest', 'standard', 'resume-standard'])
    || webuiSourceAuthority.if !== "${{ always() && !cancelled() && needs.admission.result == 'success' && ((inputs.operation == 'standard' && needs.standard.result == 'success') || (inputs.operation == 'resume_standard' && needs.resume-standard.result == 'success')) }}"
    || !exactObject(webuiSourceAuthority.permissions, exactReadPermissions)
    || webuiCheckpointDownload?.with?.name !== "${{ inputs.operation == 'standard' && needs.standard.outputs.source_artifact || needs.admission.outputs.source_artifact }}"
    || webuiCheckpointDownload?.with?.['run-id'] !== "${{ inputs.operation == 'standard' && needs.standard.outputs.source_run_id || needs.admission.outputs.source_run_id }}"
    || webuiAdmissionDownload?.if !== "${{ inputs.operation == 'standard' }}"
    || !webuiSourceAuthorityRun.includes('--origin stable_standard')
    || !webuiSourceAuthorityRun.includes('.bundle_digest')
    || !webuiSourceAuthorityRun.includes('test "$OPERATION" = resume_standard')
    || !webuiSourceAuthorityRun.includes('source_cutoff_observed_at="$RESUME_SOURCE_CUTOFF_OBSERVED_AT"')
    || !isAuthorizedStableWebuiWriteJob('.github/workflows/release-stable.yml', 'webui-carrier', jobs['webui-carrier'])
    || !isAuthorizedStableWebuiWriteJob('.github/workflows/release-stable.yml', 'webui-promotion', jobs['webui-promotion'])
  ) {
    failures += reportFailure(id, 'Stable Standard must own one exact same-cohort Docker authority, carrier, and promotion chain');
  }
  const admission = jobs.admission;
  const admissionRun = jobRuns(admission);
  if (
    !admission
    || !needsExactly(admission, ['protected-operation-admission'])
    || admission.if !== "${{ always() && inputs.entry == 'framework_release' }}"
    || !exactObject(admission.permissions, exactReadPermissions)
  ) {
    failures += reportFailure(id, 'admission must have only contents:read/actions:read');
  }
  if (workflowMutationCommandPattern.test(admissionRun)) {
    failures += reportFailure(id, 'admission must remain mutation-free');
  }
  for (const binding of [
    'test "$GITHUB_RUN_ATTEMPT" = 1',
    'actions/runs/$GITHUB_RUN_ID" --jq .created_at',
    'release-operation-deadline.ts resolve',
    '--started-at "$operation_created_at"',
    'operation_started_at="$(jq -er .started_at release-operation-admission.json)"',
    'operation_deadline_at="$(jq -er .deadline_at release-operation-admission.json)"',
  ]) {
    if (!admissionRun.includes(binding)) {
      failures += reportFailure(id, `admission is missing immutable attempt/deadline binding ${binding}`);
    }
  }
  if (/Date\.now\(\).*operation_started_at|operation_started_at=.*date/i.test(admissionRun)) {
    failures += reportFailure(id, 'operation start must come from immutable Actions created_at');
  }
  if (!admissionRun.includes('if [ "$OPERATION" = standard ] || [ "$OPERATION" = resume_standard ] || [ "$OPERATION" = append_full ]; then')) {
    failures += reportFailure(id, 'standard, bounded resume_standard, and append_full operations must resolve their controller window from Actions created_at');
  }

  const studioAdmission = jobs['studio-protected-release-admission'];
  const studioAdmissionRun = jobRuns(studioAdmission);
  const studioAdmissionEvidence = jobEvidenceText(studioAdmission);
  if (
    !studioAdmission
    || studioAdmission.if !== "${{ inputs.entry == 'studio_carrier_admission' }}"
    || Object.prototype.hasOwnProperty.call(studioAdmission, 'needs')
    || studioAdmission.environment !== 'release-stable'
    || !exactObject(studioAdmission.permissions, exactReadPermissions)
  ) {
    failures += reportFailure(
      id,
      'studio-protected-release-admission must remain one initial read-only release-stable source gate',
    );
  }
  if (workflowMutationCommandPattern.test(studioAdmissionRun) || /openssl\s+rand/.test(studioAdmissionRun)) {
    failures += reportFailure(id, 'Studio protected source admission must not perform release or public mutation');
  }
  if (/secrets\./.test(JSON.stringify(studioAdmission)) || /\$\{\{\s*inputs\./.test(studioAdmissionRun)) {
    failures += reportFailure(id, 'Studio protected source admission must not map or read protected secret values');
  }
  for (const binding of [
    'Reject mutable or mixed Studio admission request',
    'test "$GITHUB_EVENT_NAME" = workflow_dispatch',
    'test "$GITHUB_REF" = refs/heads/main',
    '[[ "$STUDIO_SHA" =~ ^[0-9a-f]{40}$ ]]',
    '[[ "$STUDIO_TREE" =~ ^[0-9a-f]{40}$ ]]',
    '"repository":"gaofeng21cn/opl-studio"',
    '"persist-credentials":false',
    'studio-protected-release-admission.ts plan',
    '.public_mutation_authorized == false',
    '.external_mutation_attempted == false',
    'Upload immutable Studio protected admission receipt',
  ]) {
    if (!studioAdmissionEvidence.includes(binding)) {
      failures += reportFailure(id, `Studio protected source admission is missing ${binding}`);
    }
  }

  const studioRelease = jobs['studio-protected-release'];
  if (
    !studioRelease
    || studioRelease.if !== "${{ !cancelled() && inputs.entry == 'studio_carrier_admission' && needs.studio-protected-release-admission.result == 'success' }}"
    || !needsExactly(studioRelease, ['studio-protected-release-admission'])
    || studioRelease.uses !== './.github/workflows/_release-studio.yml'
    || studioRelease.secrets !== 'inherit'
    || !exactObject(studioRelease.permissions, exactReadPermissions)
    || Object.prototype.hasOwnProperty.call(studioRelease, 'steps')
    || studioRelease.with?.app_ref !== '${{ github.sha }}'
    || studioRelease.with?.studio_sha !== '${{ inputs.studio_sha }}'
    || studioRelease.with?.studio_tree !== '${{ inputs.studio_tree }}'
    || studioRelease.with?.studio_tag !== '${{ inputs.studio_tag }}'
    || studioRelease.with?.prior_studio_artifact_run_id !== '${{ inputs.prior_studio_artifact_run_id }}'
  ) {
    failures += reportFailure(
      id,
      'Studio execution must be one step-free reusable call after protected source admission',
    );
  }

  const studioWorkflow = parseWorkflow(appRoot, studioReleaseWorkflowPath, id);
  if (!studioWorkflow) {
    failures += 1;
  } else {
    const releaseJobs = workflowJobs(studioWorkflow.workflow);
    const build = releaseJobs['build-signed-notarized'];
    const resolve = releaseJobs['resolve-checkpoint'];
    const restore = releaseJobs['restore-checkpoint'];
    const qualify = releaseJobs['qualify-checkpoint'];
    const publish = releaseJobs.publish;
    const readback = releaseJobs['public-readback'];
    const buildEvidence = jobEvidenceText(build);
    const restoreEvidence = jobEvidenceText(restore);
    const qualifyEvidence = jobEvidenceText(qualify);
    const publishEvidence = jobEvidenceText(publish);
    const readbackEvidence = jobEvidenceText(readback);
    const releaseEvidence = [buildEvidence, restoreEvidence, qualifyEvidence, publishEvidence, readbackEvidence].join('\n');
    if (
      JSON.stringify(Object.keys(studioWorkflow.workflow.on ?? {})) !== JSON.stringify(['workflow_call'])
      || studioWorkflow.workflow.concurrency !== undefined
      || !exactObject(studioWorkflow.workflow.permissions, exactReadPermissions)
      || studioWorkflow.workflow.on?.workflow_call?.inputs?.prior_studio_artifact_run_id?.type !== 'string'
      || studioWorkflow.workflow.on?.workflow_call?.inputs?.prior_studio_artifact_run_id?.default !== ''
      || JSON.stringify(Object.keys(releaseJobs)) !== JSON.stringify([
        'build-signed-notarized',
        'resolve-checkpoint',
        'restore-checkpoint',
        'qualify-checkpoint',
        'publish',
        'public-readback',
      ])
      || !build
      || build.if !== "${{ inputs.prior_studio_artifact_run_id == '' }}"
      || build.environment !== 'release-stable'
      || !exactObject(build.permissions, exactReadPermissions)
      || build['runs-on'] !== 'macos-15'
      || !resolve
      || !needsExactly(resolve, ['build-signed-notarized'])
      || resolve.outputs?.restore_required !== '${{ steps.resolve.outputs.restore_required }}'
      || !restore
      || !needsExactly(restore, ['resolve-checkpoint'])
      || restore.if !== "${{ always() && needs.resolve-checkpoint.result == 'success' && needs.resolve-checkpoint.outputs.restore_required == 'true' }}"
      || !qualify
      || !needsExactly(qualify, ['resolve-checkpoint', 'restore-checkpoint'])
      || qualify.environment !== undefined
      || qualify['runs-on'] !== 'macos-15'
      || !publish
      || !needsExactly(publish, ['resolve-checkpoint', 'restore-checkpoint', 'qualify-checkpoint'])
      || publish.environment !== 'release-stable'
      || publish['runs-on'] !== 'ubuntu-latest'
      || !exactObject(publish.permissions, exactReadPermissions)
      || !exactObject(publish.concurrency, { group: 'opl-studio-publication-global', 'cancel-in-progress': false })
      || !readback
      || !needsExactly(readback, ['resolve-checkpoint', 'publish'])
      || readback.if !== "${{ always() && needs.resolve-checkpoint.result == 'success' && needs.publish.result == 'success' }}"
      || readback.environment !== undefined
      || readback['runs-on'] !== 'macos-15'
      || !exactObject(readback.permissions, exactReadPermissions)
    ) {
      failures += reportFailure(id, 'Studio reusable release must expose recoverable build, qualification, thin publication, and independent public readback jobs');
    }
    for (const binding of [
      'scripts/studio-protected-release-admission.ts plan',
      'scripts/verify-apple-release-credentials.ts',
      'scripts/studio-release-checkpoint.ts seal',
      'scripts/studio-release-checkpoint.ts validate-qualification',
      'security import',
      'electron-builder --mac --arm64 --dir',
      'pwd -P',
      'notarytool submit',
      '--prepackaged "$app_path"',
      'scripts/notarize-macos-dmg.ts',
      'scripts/update-electron-updater-metadata.ts',
      '--require-release-trust',
      'gh release create',
      '--latest',
      'releases/latest',
      'git/ref/tags/$STUDIO_TAG',
      '--require-public-feed',
      'latest-arm64-mac.yml',
      '.zip.blockmap',
      'select(.draft == false)',
      'shasum -a 256',
      'public-asset-readback.json',
    ]) {
      if (!releaseEvidence.includes(binding)) {
        failures += reportFailure(id, `Studio protected execution is missing ${binding}`);
      }
    }
    if (
      requestsWritePermission(studioWorkflow.workflow.permissions)
      || Object.values(releaseJobs).some((job) => requestsWritePermission(job.permissions))
      || releaseEvidence.includes('secrets.GITHUB_TOKEN')
      || !JSON.stringify(publish).includes('OPL_GITHUB_RELEASE_ADMIN_TOKEN')
      || JSON.stringify(build).includes('OPL_GITHUB_RELEASE_ADMIN_TOKEN')
      || JSON.stringify(readback).includes('OPL_GITHUB_RELEASE_ADMIN_TOKEN')
      || workflowMutationCommandPattern.test(buildEvidence)
      || workflowMutationCommandPattern.test(qualifyEvidence)
      || workflowMutationCommandPattern.test(readbackEvidence)
      || /notarytool\s+submit/.test(publishEvidence)
      || !/gh\s+release\s+create/.test(publishEvidence)
      || !/gh\s+release\s+upload/.test(publishEvidence)
      || !/--clobber/.test(publishEvidence)
      || !releaseEvidence.includes('gaofeng21cn/opl-studio')
    ) {
      failures += reportFailure(id, 'Studio public mutation must remain isolated in one protected same-tag-capable job while build, qualification, and readback stay mutation-free');
    }
  }

  failures += validateStudioFullAppendTopology(appRoot, id, jobs);

  const protectedAdmission = jobs['protected-operation-admission'];
  const protectedAdmissionRun = jobRuns(protectedAdmission);
  const protectedAdmissionEvidence = jobEvidenceText(protectedAdmission);
  if (
    !protectedAdmission
    || protectedAdmission.if !== "${{ inputs.entry == 'framework_release' && inputs.operation == 'standard' }}"
    || Object.prototype.hasOwnProperty.call(protectedAdmission, 'needs')
    || protectedAdmission.environment !== 'release-stable'
    || !exactObject(protectedAdmission.permissions, exactReadPermissions)
  ) {
    failures += reportFailure(
      id,
      'protected-operation-admission must be the initial read-only protected Standard gate',
    );
  }
  if (workflowMutationCommandPattern.test(protectedAdmissionRun)) {
    failures += reportFailure(id, 'protected-operation-admission must not perform release or public mutation');
  }
  for (const binding of [
    'Reject bare or rerun Stable request before expensive work',
    'test "$GITHUB_EVENT_NAME" = workflow_dispatch',
    'test -n "$AUTHORITY_ID"',
    'test -n "$OPERATION_ID"',
    'test -n "$AUTHORITY_CARRIER"',
    '[[ "$AUTHORITY_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]',
    'stable-operation-control.ts decode-carrier',
    'stable-operation-control.ts materialize-evidence',
    'stable-operation-control.ts verify-executor',
    'stable-operation-control.ts verify-authority',
    '--app-root app-executor --expected-actor "$GITHUB_ACTOR"',
    'Checkout frozen App authority cohort',
    'release-dispatch-guard.ts verify-evidence',
    'release-dispatch-guard.ts preflight',
    '--current-run-id "$GITHUB_RUN_ID"',
    '--authority-id',
    'stable-operation-control.ts bind',
    'stable-operation-control.ts verify',
    'Upload immutable operation control evidence',
    'opl-stable-operation-control-${{ github.run_id }}',
  ]) {
    if (!protectedAdmissionEvidence.includes(binding)) {
      failures += reportFailure(id, `protected-operation-admission is missing immutable authority binding ${binding}`);
    }
  }
  if (
    protectedAdmissionRun.includes('node --experimental-strip-types app-source/scripts/validate-release-source-gate.ts')
    || (protectedAdmissionRun.match(/release-dispatch-guard\.ts verify-evidence/g) ?? []).length !== 1
    || (protectedAdmissionRun.match(/release-dispatch-guard\.ts preflight/g) ?? []).length !== 1
  ) {
    failures += reportFailure(
      id,
      'protected-operation-admission must verify the frozen pre-submit evidence once and create exactly one distinct run-authority reconcile without rerunning the full source gate.',
    );
  }
  if (/openssl rand|operation_id="stable-\$\{?GITHUB_RUN_ID\}?"|stable-operation-control\.ts create(?:\s|$)/.test(protectedAdmissionRun)) {
    failures += reportFailure(id, 'protected-operation-admission must not self-issue an authority, nonce, or operation id');
  }
  if (/\$\{\{\s*inputs\./.test(protectedAdmissionRun)) {
    failures += reportFailure(id, 'protected-operation-admission must consume dispatch strings through quoted environment variables');
  }
  const protectedOutputs = protectedAdmission?.outputs ?? {};
  for (const [name, expected] of Object.entries({
    app_ref: '${{ steps.control.outputs.app_ref }}',
    shell_ref: '${{ steps.control.outputs.shell_ref }}',
    framework_ref: '${{ steps.control.outputs.framework_ref }}',
    operation_id: '${{ steps.control.outputs.operation_id }}',
    control_digest: '${{ steps.control.outputs.control_digest }}',
    authority_id: '${{ steps.authority.outputs.authority_id }}',
  })) {
    if (protectedOutputs[name] !== expected) {
      failures += reportFailure(id, `protected-operation-admission must bind ${name} to the decoded authority control`);
    }
  }

  const stableManifest = jobs['stable-admission-manifest'];
  const stableManifestRun = jobRuns(stableManifest);
  if (
    !stableManifest
    || stableManifest.if !== "${{ needs.admission.outputs.operation == 'standard' }}"
    || !needsExactly(stableManifest, ['admission', 'protected-operation-admission'])
    || stableManifest.environment !== 'release-stable'
    || !exactObject(stableManifest.permissions, exactReadPermissions)
  ) {
    failures += reportFailure(id, 'stable-admission-manifest must be a protected post-source-gate identity seal');
  }
  for (const binding of [
    'scripts/verify-apple-release-credentials.ts',
    'scripts/stable-operation-control.ts verify',
    '--run-authority-reconcile',
    'scripts/stable-release-admission-manifest.ts create',
    '--admission-run-id "$GITHUB_RUN_ID"',
    'opl-stable-admission-${{ github.run_id }}',
  ]) {
    if (!stableManifestRun.includes(binding) && !text.includes(binding)) {
      failures += reportFailure(id, `stable-admission-manifest is missing protected binding ${binding}`);
    }
  }
  failures += validateStableOperationControlArtifactConsumer(appRoot);

  for (const [jobId, spec] of Object.entries(stableEntrySpecs)) {
    const job = jobs[jobId];
    if (!job) continue;
    if (!needsExactly(job, [...spec.needs]) || job.if !== spec.if) {
      failures += reportFailure(id, `${jobId} must be selected only by the admitted ${spec.operation} operation`);
    }
    if (job.uses !== spec.workflow || Object.prototype.hasOwnProperty.call(job, 'steps')) {
      failures += reportFailure(id, `${jobId} must be a step-free call to ${spec.workflow}`);
    }
    if (!exactObject(job.permissions, spec.permissions)) {
      failures += reportFailure(
        id,
        jobId === 'standard'
          ? 'standard permissions must be exactly contents:write/actions:read without packages:write'
          : `${jobId} permissions must be exactly contents:write/actions:read without packages:write`,
      );
    }
    if (job.secrets !== 'inherit') {
      failures += reportFailure(id, `${jobId} must pass release secrets only through the reusable boundary`);
    }
    const withInputs = job.with && typeof job.with === 'object'
      ? job.with as Record<string, unknown>
      : {};
    for (const [name, expected] of Object.entries(spec.requiredInputs)) {
      if (withInputs[name] !== expected) {
        failures += reportFailure(id, `${jobId} must bind ${name} to the admitted value`);
      }
    }
    if (Object.keys(withInputs).some((name) => retiredLiveAuthorityPattern.test(name))) {
      failures += reportFailure(id, `${jobId} must not forward broker/session/lease inputs`);
    }
  }
  return failures;
}

function validateReusableCall(
  id: string,
  jobs: Record<string, Record<string, any>>,
  jobId: string,
  workflowPath: string,
  expectedPermissions?: Record<string, unknown>,
): number {
  const job = jobs[jobId];
  if (!job || job.uses !== workflowPath || Object.prototype.hasOwnProperty.call(job, 'steps')) {
    return reportFailure(id, `${jobId} must be a step-free call to ${workflowPath}`);
  }
  if (expectedPermissions && !exactObject(job.permissions, expectedPermissions)) {
    return reportFailure(id, `${jobId} has broader or incomplete permissions`);
  }
  return 0;
}

function validateReusablePermissionInheritance(
  id: string,
  name: string,
  workflow: Record<string, any>,
  inheritedMutationJobs: string[],
): number {
  let failures = 0;
  if (workflow.permissions !== undefined) {
    failures += reportFailure(
      id,
      `${name} must inherit its caller permission ceiling so read-only Canary and Stable use the same graph`,
    );
  }
  const mutationJobs = new Set(inheritedMutationJobs);
  for (const [jobId, job] of Object.entries(workflowJobs(workflow))) {
    if (mutationJobs.has(jobId)) {
      if (job.permissions !== undefined) {
        failures += reportFailure(
          id,
          `${name}:${jobId} must inherit the admitted caller permission instead of statically requesting write`,
        );
      }
      continue;
    }
    if (!exactObject(job.permissions, exactReadPermissions)) {
      failures += reportFailure(id, `${name}:${jobId} must explicitly downgrade to contents:read/actions:read`);
    }
  }
  return failures;
}

export function validateReleaseBundleTopology(appRoot: string): number {
  const id = 'release_bundle_topology';
  const bundle = parseWorkflow(appRoot, '.github/workflows/_release-bundle.yml', id);
  const standard = parseWorkflow(appRoot, '.github/workflows/_release-standard-publish.yml', id);
  const full = parseWorkflow(appRoot, '.github/workflows/_release-full-addon.yml', id);
  if (!bundle || !standard || !full) return [bundle, standard, full].filter((value) => !value).length;
  let failures = 0;

  for (const [name, parsed] of Object.entries({ bundle, standard, full })) {
    if (JSON.stringify(Object.keys(parsed.workflow.on ?? {})) !== JSON.stringify(['workflow_call'])) {
      failures += reportFailure(id, `${name} workflow must expose only workflow_call`);
    }
    if (retiredLiveAuthorityPattern.test(parsed.text)) {
      failures += reportFailure(id, `${name} workflow still depends on retired broker/session/lease authority`);
    }
    if (parsed.workflow.on?.workflow_call?.inputs?.mode !== undefined || parsed.workflow.jobs?.['startup-canary']) {
      failures += reportFailure(id, `${name} workflow must not retain the retired reusable Canary control plane`);
    }
  }
  failures += validateReusablePermissionInheritance(
    id,
    'bundle',
    bundle.workflow,
    ['publish-standard'],
  );
  failures += validateReusablePermissionInheritance(
    id,
    'standard',
    standard.workflow,
    ['publish-standard-nonlatest', 'activate-latest'],
  );
  failures += validateReusablePermissionInheritance(id, 'full', full.workflow, ['publish-full']);

  const bundleJobs = workflowJobs(bundle.workflow);
  if (JSON.stringify(Object.keys(bundleJobs)) !== JSON.stringify([
    'resolve-platform-matrix',
    'admission',
    'freeze',
    'standard-build',
    'seal-standard-identity',
    'standard-clean-vm-qualification',
    'checkpoint-standard',
    'publish-standard',
  ])) {
    failures += reportFailure(id, 'Bundle jobs must contain only the single Desktop Standard publication topology');
  }
  if (bundle.workflow.on?.workflow_call?.inputs?.operation?.default !== 'standard') {
    failures += reportFailure(id, 'Bundle workflow operation must be standard');
  }
  if (
    !bundle.text.includes('stable:stable|preview:preview')
    || /nightly:nightly|resolveNightlyReleaseVersion|nightly-operation-request/.test(bundle.text)
  ) {
    failures += reportFailure(
      id,
      'Bundle execute mode must admit Stable or Manual Preview while excluding scheduled Nightly allocation',
    );
  }
  for (const [jobId, command] of [
    ['freeze', 'opl release freeze'],
    ['checkpoint-standard', 'opl release build'],
    ['checkpoint-standard', 'opl release checkpoint export'],
  ]) {
    if (!jobRuns(bundleJobs[jobId]).includes(command)) {
      failures += reportFailure(id, `_release-bundle.yml ${jobId} is missing ${command}`);
    }
  }
  failures += validateReusableCall(id, bundleJobs, 'standard-build', './.github/workflows/_build-reusable.yml');
  const sealStandardIdentity = bundleJobs['seal-standard-identity'];
  if (
    !sealStandardIdentity
    || !needsExactly(sealStandardIdentity, ['freeze', 'standard-build'])
    || !exactObject(sealStandardIdentity.permissions, exactReadPermissions)
    || !Array.isArray(sealStandardIdentity.steps)
    || !jobRuns(sealStandardIdentity).includes('bind-standard-release-track.ts')
    || !jobRuns(sealStandardIdentity).includes('standard_identity_sha256')
  ) {
    failures += reportFailure(
      id,
      'seal-standard-identity must bind the signed build to one immutable read-only identity',
    );
  }
  if (bundleJobs['standard-qualification'] || /\bopl\s+release\s+verify\b/.test(jobRuns(bundleJobs['checkpoint-standard']))) {
    failures += reportFailure(
      id,
      'Bundle publication must consume sealed identity without reintroducing the retired inline qualification gate',
    );
  }
  failures += validateReusableCall(
    id,
    bundleJobs,
    'standard-clean-vm-qualification',
    './.github/workflows/opl-first-run-vm.yml',
    exactReadPermissions,
  );
  const standardCleanVm = bundleJobs['standard-clean-vm-qualification'];
  if (
    !standardCleanVm
    || !needsExactly(standardCleanVm, ['freeze', 'seal-standard-identity'])
    || standardCleanVm.if !== "${{ always() && inputs.channel == 'stable' && needs.freeze.result == 'success' && needs.seal-standard-identity.result == 'success' }}"
    || standardCleanVm.with?.release_artifact_name !==
      '${{ needs.seal-standard-identity.outputs.standard_vm_artifact_name }}'
    || standardCleanVm.with?.release_artifact_run_id !==
      '${{ needs.seal-standard-identity.outputs.standard_artifact_run_id }}'
    || standardCleanVm.with?.package_profile !== 'standard'
    || standardCleanVm.with?.diagnostic_scope !== 'release_gate'
    || standardCleanVm.with?.require_macos_gatekeeper !== true
    || standardCleanVm.secrets !== 'inherit'
  ) {
    failures += reportFailure(
      id,
      'Standard clean-VM qualification must consume the sealed exact candidate under the protected release gate',
    );
  }
  failures += validateReusableCall(
    id,
    bundleJobs,
    'publish-standard',
    './.github/workflows/_release-standard-publish.yml',
  );
  if (!hasStableMutationMutex(bundleJobs['publish-standard'])) {
    failures += reportFailure(
      id,
      'publish-standard must acquire the public mutation mutex after build and qualification',
    );
  }
  if (
    !needsExactly(bundleJobs['checkpoint-standard'], [
      'admission',
      'freeze',
      'seal-standard-identity',
      'standard-clean-vm-qualification',
    ])
    || !needsExactly(bundleJobs['publish-standard'], [
      'freeze',
      'checkpoint-standard',
    ])
  ) {
    failures += reportFailure(id, 'Standard checkpoint must depend only on admission, freeze, sealed identity, and protected clean-VM qualification');
  }
  if (/\bopl\s+release\s+(?:publish|reconcile|status)\b/.test(bundle.text)) {
    failures += reportFailure(id, '_release-bundle.yml must delegate publish/reconcile/status to Standard publish');
  }
  const standardJobs = workflowJobs(standard.workflow);
  if (
    standardJobs['nightly-terminal']
    || !standard.text.includes('reason=unsupported_publication_channel')
    || !standard.text.includes('preview)')
    || standard.text.includes('nightly)')
  ) {
    failures += reportFailure(
      id,
      'Standard publisher must admit only Stable or Manual Preview checkpoints and expose no scheduled Nightly terminal',
    );
  }
  for (const command of ['opl release publish', 'opl release reconcile', 'opl release status']) {
    if (!standard.text.includes(command)) {
      failures += reportFailure(id, `_release-standard-publish.yml is missing ${command}`);
    }
  }
  if (/\bopl\s+release\s+(?:freeze|build|verify)\b/.test(standard.text)) {
    failures += reportFailure(id, '_release-standard-publish.yml must not rebuild or reverify Bundle bytes');
  }
  for (const retiredInlineVmJob of [
    'updater-upgrade-qualification',
    'updater-upgrade-qualification-highest',
    'homebrew-standard-vm',
  ]) {
    if (standardJobs[retiredInlineVmJob]) {
      failures += reportFailure(
        id,
        `_release-standard-publish.yml must not restore retired inline VM job ${retiredInlineVmJob}`,
      );
    }
  }
  for (const jobId of [
    'publish-standard-nonlatest',
    'activate-latest',
  ]) {
    if (!standardJobs[jobId]) failures += reportFailure(id, `_release-standard-publish.yml is missing ${jobId}`);
  }
  for (const retiredInlineHomebrewJob of [
    'publish-homebrew-standard',
    'homebrew-standard-readback',
  ]) {
    if (standardJobs[retiredInlineHomebrewJob]) {
      failures += reportFailure(
        id,
        `_release-standard-publish.yml must not retain blocking Homebrew job ${retiredInlineHomebrewJob}`,
      );
    }
  }
  if (
    !needsExactly(standardJobs['activate-latest'], ['restore', 'remote-digest-verify'])
    || !jobRuns(standardJobs['remote-digest-verify']).includes('homebrew-standard-handoff.json')
    || /OPL_HOMEBREW_TAP_TOKEN|git -C tap-source push/.test(standard.text)
  ) {
    failures += reportFailure(
      id,
      'Standard Release and Latest must emit a handoff without depending on or writing Homebrew',
    );
  }
  const expectedStandardMutationEnvironments = {
    'publish-standard-nonlatest':
      "${{ needs.restore.outputs.channel == 'stable' && 'release-stable' || 'release-preview' }}",
    'activate-latest':
      "${{ needs.restore.outputs.channel == 'stable' && 'release-stable' || 'release-preview-latest' }}",
  };
  for (const [jobId, expectedEnvironment] of Object.entries(expectedStandardMutationEnvironments)) {
    const job = standardJobs[jobId];
    if (job && job.environment !== expectedEnvironment) {
      failures += reportFailure(
        id,
        `${jobId} must select the exact Stable or protected Preview environment`,
      );
    }
  }

  const fullJobs = workflowJobs(full.workflow);
  if (full.workflow.on?.workflow_call?.inputs?.operation?.default !== 'append_full') {
    failures += reportFailure(id, 'Full add-on workflow operation must be append_full');
  }
  for (const jobId of [
    'restore-standard',
    'full-build',
    'full-qualification',
    'full-clean-vm-qualification',
    'checkpoint-full',
    'publish-full',
  ]) {
    if (!fullJobs[jobId]) failures += reportFailure(id, `_release-full-addon.yml is missing ${jobId}`);
  }
  for (const retiredJobId of ['publish-homebrew-full', 'homebrew-full-vm', 'homebrew-full-readback']) {
    if (fullJobs[retiredJobId]) {
      failures += reportFailure(id, `_release-full-addon.yml must not retain ${retiredJobId}`);
    }
  }
  if (fullJobs['full-build']) {
    failures += validateReusableCall(
      id,
      fullJobs,
      'full-build',
      './.github/workflows/full-first-install-release.yml',
      exactReadPermissions,
    );
  }
  if (fullJobs['full-qualification']) {
    const fullQualification = fullJobs['full-qualification'];
    const qualificationRuns = jobRuns(fullQualification);
    if (
      fullQualification['runs-on'] !== 'macos-latest'
      || fullQualification.uses !== undefined
      || !needsExactly(fullQualification, ['restore-standard', 'full-build', 'materialize-full-build'])
      || !exactObject(fullQualification.permissions, exactReadPermissions)
      || !Array.isArray(fullQualification.steps)
      || !qualificationRuns.includes('hdiutil attach "$dmg_path" -nobrowse -readonly')
      || !qualificationRuns.includes('codesign --verify --deep --strict')
      || !qualificationRuns.includes('xcrun stapler validate')
      || !qualificationRuns.includes('spctl --assess')
      || !qualificationRuns.includes('opl_app_hosted_full_core_qualification.v1')
      || /opl-first-run-vm|tart\\b/i.test(qualificationRuns)
    ) {
      failures += reportFailure(
        id,
        'full-qualification must be a GitHub-hosted read-only exact Full trust qualification with no VM or Tart dependency',
      );
    }
  }
  failures += validateReusableCall(
    id,
    fullJobs,
    'full-clean-vm-qualification',
    './.github/workflows/opl-first-run-vm.yml',
    exactReadPermissions,
  );
  const fullCleanVm = fullJobs['full-clean-vm-qualification'];
  if (
    !fullCleanVm
    || !needsExactly(fullCleanVm, [
      'restore-standard',
      'full-build',
      'materialize-full-build',
      'full-qualification',
    ])
    || fullCleanVm.with?.release_artifact_run_id !== '${{ needs.materialize-full-build.outputs.artifact_producer_run_id || github.run_id }}'
    || fullCleanVm.with?.verification_app_ref !== '${{ inputs.full_content_app_ref }}'
    || fullCleanVm.with?.smoke_harness_ref !== '${{ inputs.smoke_harness_ref || inputs.full_content_shell_ref }}'
    || fullCleanVm.with?.package_profile !== 'full'
    || fullCleanVm.with?.diagnostic_scope !== 'release_gate'
    || fullCleanVm.with?.require_macos_gatekeeper !== true
    || fullCleanVm.secrets !== 'inherit'
  ) {
    failures += reportFailure(
      id,
      'Full clean-VM qualification must follow hosted trust validation and consume the exact original Full artifact run',
    );
  }
  const checkpointFullRuns = jobRuns(fullJobs['checkpoint-full']);
  if (
    !checkpointFullRuns.includes('--hosted-core-qualification "$hosted_receipt"')
    || !checkpointFullRuns.includes('full-clean-vm-qualification-receipt.json')
    || !checkpointFullRuns.includes('standard-clean-vm-qualification-receipt.json')
    || !checkpointFullRuns.includes("--arg source_artifact_run_id '${{ needs.materialize-full-build.outputs.artifact_producer_run_id || github.run_id }}'")
    || !checkpointFullRuns.includes('.qualification.source_artifact_run_id == $source_artifact_run_id')
    || checkpointFullRuns.includes('--legacy-qualification')
  ) {
    failures += reportFailure(
      id,
      'checkpoint-full must consume hosted Full trust plus Standard and Full protected clean-VM sidecars',
    );
  }
  if (fullJobs['publish-full'] && fullJobs['publish-full'].environment !== 'release-stable') {
    failures += reportFailure(id, 'publish-full must use the release-stable environment');
  }
  if (!hasStableMutationMutex(fullJobs['publish-full'])) {
    failures += reportFailure(
      id,
      'publish-full must acquire the public mutation mutex only after Full qualification',
    );
  }
  if (standardUpdaterOrLatest(full.text)) {
    failures += reportFailure(id, 'append_full must not qualify Standard updater or activate Latest');
  }
  if (/publish-homebrew-full|update-homebrew-tap|OPL_HOMEBREW_TAP_TOKEN|tap-source|Casks\/one-person-lab\.rb|git\b[^\n]*\bpush\b/.test(full.text)) {
    failures += reportFailure(id, 'append_full must not directly mutate Homebrew or touch the Standard Cask');
  }
  for (const required of [
    'opl_homebrew_full_follower_handoff.v1',
    'homebrew_modified:false',
    'latest_modified:false',
    'completed_stage:"full_qualified"',
    'qualification_receipt_sha256',
    'operation_control',
    'operation_id',
    'operation_started_at',
    'operation_deadline_at',
  ]) {
    if (!full.text.includes(required)) failures += reportFailure(id, `append_full handoff is missing ${required}`);
  }
  return failures;
}

export function validateStableFollowupTopology(appRoot: string): number {
  const id = 'stable_followup_topology';
  const hub = parseWorkflow(appRoot, stableFollowupWorkflowPath, id);
  const actions = Object.fromEntries(
    Object.entries(stableFollowupActionPaths).map(([name, relativePath]) => [
      name,
      parseWorkflow(appRoot, relativePath, id),
    ]),
  ) as Record<keyof typeof stableFollowupActionPaths, ReturnType<typeof parseWorkflow>>;
  const desktopPlatformAddon = parseWorkflow(appRoot, desktopPlatformAddonWorkflowPath, id);
  const optionalCertification = parseWorkflow(
    appRoot,
    postPublicationOptionalCertificationWorkflowPath,
    id,
  );
  const optionalCertificationVm = parseWorkflow(
    appRoot,
    '.github/workflows/opl-first-run-vm.yml',
    id,
  );
  const missing = [
    hub,
    ...Object.values(actions),
    desktopPlatformAddon,
    optionalCertification,
    optionalCertificationVm,
  ].filter((value) => !value).length;
  if (missing > 0 || !hub || !desktopPlatformAddon || !optionalCertification || !optionalCertificationVm) {
    return missing;
  }

  let failures = 0;
  const triggers = hub.workflow.on ?? {};
  const dispatchInputs = triggers.workflow_dispatch?.inputs ?? {};
  const expectedDispatchInputs = [
    'desktop_platform',
    'expected_old_asset_digest',
    'expected_old_asset_id',
    'operation',
    'operator_confirmation',
    'repair_source_commit',
    'smoke_harness_ref',
    'source_run_id',
  ];
  const expectedOperations = [
    'reconcile_full_addon',
    'reconcile_homebrew_standard',
    'reconcile_homebrew_full',
    'reconcile_desktop_platform',
    'repair_additive',
  ];
  const jobs = workflowJobs(hub.workflow);
  const expectedJobs = [
    'admit',
    'observe',
    'publish-homebrew-full',
    'publish-standard-cask',
    'receipt',
    'reconcile-desktop-platforms',
    'reconcile-full-addon',
    'repair-additive',
    'repair-admit',
    'resolve-homebrew-full',
    'route',
  ];
  if (
    JSON.stringify(Object.keys(triggers).sort()) !== JSON.stringify(['workflow_dispatch', 'workflow_run'])
    || JSON.stringify(triggers.workflow_run?.workflows) !== JSON.stringify(['OPL Stable Release Bundle'])
    || JSON.stringify(triggers.workflow_run?.types) !== JSON.stringify(['completed'])
    || JSON.stringify(Object.keys(dispatchInputs).sort()) !== JSON.stringify(expectedDispatchInputs)
    || JSON.stringify(dispatchInputs.operation?.options) !== JSON.stringify(expectedOperations)
    || !exactObject(hub.workflow.permissions, exactReadPermissions)
    || hub.workflow.concurrency !== undefined
    || JSON.stringify(Object.keys(jobs).sort()) !== JSON.stringify(expectedJobs)
  ) {
    failures += reportFailure(
      id,
      'Stable follow-ups must expose one automatic/manual hub with only the five independent additive operations',
    );
  }

  const route = jobs.route;
  if (
    !route
    || route['runs-on'] !== 'ubuntu-latest'
    || route['timeout-minutes'] !== 10
    || Object.prototype.hasOwnProperty.call(route, 'needs')
    || requestsWritePermission(route.permissions)
    || !jobRuns(route).includes('stable-followup-router.ts')
  ) {
    failures += reportFailure(id, 'Stable follow-up routing must be one read-only typed decision job');
  }

  const observe = jobs.observe;
  const standard = jobs['publish-standard-cask'];
  const resolveFull = jobs['resolve-homebrew-full'];
  const publishFull = jobs['publish-homebrew-full'];
  if (
    !observe
    || observe.if !== "${{ needs.route.outputs.observe == 'true' }}"
    || !needsExactly(observe, ['route'])
    || !exactObject(observe.permissions, exactReadPermissions)
    || !hasLocalStep(observe, localActionUse(stableFollowupActionPaths.observe))
    || !standard
    || standard.if !== "${{ needs.route.outputs.homebrew_standard == 'true' }}"
    || !needsExactly(standard, ['route'])
    || standard.environment !== 'release-stable'
    || !exactObject(standard.permissions, exactReadPermissions)
    || !exactObject(standard.concurrency, {
      group: 'opl-homebrew-standard-${{ needs.route.outputs.source_run_id }}',
      'cancel-in-progress': false,
    })
    || !hasLocalStep(standard, localActionUse(stableFollowupActionPaths.homebrewStandard))
    || !resolveFull
    || resolveFull.if !== "${{ needs.route.outputs.homebrew_full == 'true' }}"
    || !needsExactly(resolveFull, ['route'])
    || !exactObject(resolveFull.permissions, exactReadPermissions)
    || !hasLocalStep(resolveFull, localActionUse(stableFollowupActionPaths.homebrewFullHandoff))
    || !publishFull
    || !needsExactly(publishFull, ['resolve-homebrew-full'])
    || publishFull.uses !== './.github/workflows/_release-homebrew-full-publish.yml'
    || !exactObject(publishFull.permissions, exactReadPermissions)
    || publishFull.secrets !== 'inherit'
    || Object.prototype.hasOwnProperty.call(publishFull, 'steps')
  ) {
    failures += reportFailure(
      id,
      'Stable observation and Homebrew lanes must be mutually routed leaves with no second public entry',
    );
  }
  if (!isAuthorizedFullAddonFollowerWriteJob(stableFollowupWorkflowPath, 'reconcile-full-addon', jobs['reconcile-full-addon'])) {
    failures += reportFailure(id, 'Stable Full reconciliation must be one source-bound controller action');
  }
  if (
    !isAuthorizedStableDesktopFollowupWriteJob(
      stableFollowupWorkflowPath,
      'reconcile-desktop-platforms',
      jobs['reconcile-desktop-platforms'],
    )
    || !isAuthorizedStableDesktopFollowupWriteJob(
      stableFollowupWorkflowPath,
      'repair-additive',
      jobs['repair-additive'],
    )
  ) {
    failures += reportFailure(
      id,
      'Stable Desktop and additive repair writes must remain isolated protected leaves',
    );
  }
  if (
    jobs.admit?.if !== "${{ needs.route.outputs.desktop_platforms == 'true' }}"
    || !needsExactly(jobs.admit, ['route'])
    || jobs['repair-admit']?.if !== "${{ needs.route.outputs.repair_additive == 'true' }}"
    || !needsExactly(jobs['repair-admit'], ['route'])
  ) {
    failures += reportFailure(id, 'Stable Desktop and repair admission must be selected only by the typed router');
  }

  const observeAction = actions.observe;
  const fullAddonAction = actions.fullAddon;
  const homebrewStandardAction = actions.homebrewStandard;
  const homebrewFullAction = actions.homebrewFullHandoff;
  if (
    !observeAction || !fullAddonAction || !homebrewStandardAction || !homebrewFullAction
    || observeAction.workflow.runs?.using !== 'composite'
    || fullAddonAction.workflow.runs?.using !== 'composite'
    || homebrewStandardAction.workflow.runs?.using !== 'composite'
    || homebrewFullAction.workflow.runs?.using !== 'composite'
  ) {
    failures += reportFailure(id, 'Every Stable follower implementation leaf must be a local composite action');
  } else {
    for (const [name, action] of Object.entries(actions)) {
      if (!action) continue;
      failures += validateExactActionPins(
        stableFollowupActionPaths[name as keyof typeof stableFollowupActionPaths],
        'composite',
        actionSteps(action.workflow),
      );
    }
    for (const required of [
      'release-attempt-observability.ts',
      'opl-release-attempt-observation-${{ inputs.source_run_id }}',
    ]) {
      if (!observeAction.text.includes(required)) {
        failures += reportFailure(id, `Stable observation leaf is missing ${required}`);
      }
    }
    for (const required of [
      'RECONCILE_CONFIRMATION: reconcile_full_addon',
      'opl-release-standard-checkpoint-$SOURCE_RUN_ID',
      'opl-release-standard-operation-checkpoint-$SOURCE_RUN_ID',
      'stable-release-dispatch.ts',
      'append-full',
      '--execute',
      'published|owner_identified|dispatched',
      '.plan.source.run_id',
      'waits_for_owner_completion:false',
      'opl_app_full_addon_follower.v1',
    ]) {
      if (!fullAddonAction.text.includes(required)) {
        failures += reportFailure(id, `Stable Full action is missing ${required}`);
      }
    }
    if (
      /failed_(?:follower|recovery)_run_id|actions\/workflows\/release-stable\.yml\/dispatches|gh run (?:rerun|cancel)|seq 1 840/.test(
        fullAddonAction.text,
      )
    ) {
      failures += reportFailure(id, 'Stable Full action must reconcile target state without polling or a second dispatcher');
    }
    const homebrewStandardRuns = actionSteps(homebrewStandardAction.workflow)
      .map((step) => typeof step.run === 'string' ? step.run : '')
      .join('\n');
    for (const required of [
      'reconcile_published_homebrew_standard',
      'opl_homebrew_standard_follower_handoff.v1',
      'same_tag_replacement_allowed: true',
      'core_release_or_latest_blocking: false',
      '--remote-write-mode inspect_only',
      '--remote-write-mode direct_commit',
      '--expected-current-cask-sha256',
      'idempotent_concurrent',
      'core_release_or_latest_blocked:false',
      'second_push_attempted:false',
      'current-main.json',
    ]) {
      if (!homebrewStandardRuns.includes(required)) {
        failures += reportFailure(id, `Stable Homebrew Standard action is missing ${required}`);
      }
    }
    if ((homebrewStandardRuns.match(/git -C tap-source push --no-force/g) ?? []).length !== 1) {
      failures += reportFailure(id, 'Stable Homebrew Standard action must contain exactly one non-force push');
    }
    if (/for attempt in 1 2 3|new_release_revision_required|gh release (?:create|edit|upload|delete)/.test(homebrewStandardRuns)) {
      failures += reportFailure(
        id,
        'Stable Homebrew Standard action must use one same-tag CAS without release or version allocation',
      );
    }
    for (const required of [
      'reconcile_published_homebrew_full',
      'opl-release-full-published-${AUTHORITY_RUN_ID}',
      'homebrew-full-handoff.json',
      'opl_homebrew_full_follower_handoff.v1',
      '.source.completed_stage == "full_qualified"',
      '.source.checkpoint_transport_executor == "github_actions"',
      '.homebrew_modified == false',
      'test "$GITHUB_REF" = refs/heads/main',
    ]) {
      if (!homebrewFullAction.text.includes(required)) {
        failures += reportFailure(id, `Stable Homebrew Full handoff action is missing ${required}`);
      }
    }
    if (
      /git\b[^\n]*\bpush\b|OPL_HOMEBREW_TAP_TOKEN|failed_(?:follower|recovery)_run_id/.test(
        homebrewFullAction.text,
      )
    ) {
      failures += reportFailure(id, 'Stable Homebrew Full handoff must not own Tap mutation or recovery history');
    }
  }

  const desktopAddonJobs = workflowJobs(desktopPlatformAddon.workflow);
  const desktopBuild = desktopAddonJobs['build-platform'];
  const desktopAppend = desktopAddonJobs['append-platform'];
  const desktopReceipt = desktopAddonJobs.receipt;
  if (
    JSON.stringify(Object.keys(desktopPlatformAddon.workflow.on ?? {})) !== JSON.stringify(['workflow_call'])
    || !exactObject(desktopPlatformAddon.workflow.permissions, exactReadPermissions)
    || JSON.stringify(Object.keys(desktopAddonJobs)) !== JSON.stringify([
      'build-platform', 'append-platform', 'receipt',
    ])
    || desktopBuild?.uses !== './.github/workflows/build-manual.yml'
    || desktopBuild?.concurrency !== undefined
    || typeof desktopBuild?.with?.platform_ids !== 'string'
    || !desktopBuild.with.platform_ids.includes('inputs.platform_id')
    || !desktopAppend
    || !needsExactly(desktopAppend, ['build-platform'])
    || desktopAppend.environment !== 'release-stable'
    || !exactObject(desktopAppend.permissions, exactStableEntryPermissions)
    || !hasStableMutationMutex(desktopAppend)
    || !desktopReceipt
    || desktopReceipt.if !== '${{ always() }}'
    || !needsExactly(desktopReceipt, ['build-platform', 'append-platform'])
  ) {
    failures += reportFailure(
      id,
      'Desktop add-on must keep build, same-tag append, and receipt as one reusable leaf',
    );
  }

  const certificationTriggers = optionalCertification.workflow.on ?? {};
  const certificationJobs = workflowJobs(optionalCertification.workflow);
  if (
    JSON.stringify(Object.keys(certificationTriggers).sort()) !==
      JSON.stringify(['workflow_dispatch', 'workflow_run'])
    || JSON.stringify(certificationTriggers.workflow_run?.workflows) !==
      JSON.stringify(['OPL Stable Follow-ups'])
    || JSON.stringify(certificationTriggers.workflow_run?.types) !== JSON.stringify(['completed'])
    || JSON.stringify(certificationTriggers.workflow_dispatch?.inputs?.operation?.options) !==
      JSON.stringify(['verify_existing_repair'])
    || !exactObject(optionalCertification.workflow.permissions, exactReadPermissions)
    || optionalCertification.workflow.concurrency?.group !==
      'opl-desktop-release-set-certification-${{ github.event_name == \'workflow_dispatch\' && inputs.followup_run_id || github.event.workflow_run.id }}'
    || optionalCertification.workflow.concurrency?.['cancel-in-progress'] !== false
    || JSON.stringify(Object.keys(certificationJobs)) !== JSON.stringify([
      'resolve-release-set',
      'certify-linux-x64',
      'admit-macos-vm',
      'certify-standard-vm',
      'receipt',
    ])
  ) {
    failures += reportFailure(
      id,
      'Optional certification must be a read-only follower of the single Stable follow-up hub',
    );
  }
  for (const jobId of ['resolve-release-set', 'certify-linux-x64', 'admit-macos-vm', 'receipt']) {
    const job = certificationJobs[jobId];
    if (!job || job['runs-on'] !== 'ubuntu-latest' || !Array.isArray(job.steps)) {
      failures += reportFailure(id, `Optional certification job ${jobId} must stay GitHub-hosted`);
    }
  }
  const certifyStandardVm = certificationJobs['certify-standard-vm'];
  if (
    !certifyStandardVm
    || certifyStandardVm.uses !== './.github/workflows/opl-first-run-vm.yml'
    || Object.prototype.hasOwnProperty.call(certifyStandardVm, 'steps')
    || Object.prototype.hasOwnProperty.call(certifyStandardVm, 'runs-on')
    || !exactObject(certifyStandardVm.permissions, exactReadPermissions)
    || !exactObject(certifyStandardVm.with, {
      release_tag: '${{ needs.resolve-release-set.outputs.tag }}',
      published_artifact_name: '${{ needs.resolve-release-set.outputs.standard_artifact_name }}',
      published_artifact_digest: '${{ needs.resolve-release-set.outputs.standard_artifact_digest }}',
      artifact_app_ref: '${{ needs.resolve-release-set.outputs.app_sha }}',
      shell_ref: '${{ needs.resolve-release-set.outputs.shell_sha }}',
      smoke_harness_ref: '${{ needs.resolve-release-set.outputs.shell_sha }}',
      framework_ref: '${{ needs.resolve-release-set.outputs.framework_sha }}',
      package_profile: 'standard',
      diagnostic_scope: 'post_publication_optional_certification',
      require_macos_gatekeeper: true,
    })
  ) {
    failures += reportFailure(id, 'Optional macOS certification must consume exact published Standard bytes');
  }
  for (const required of [
    '.path == ".github/workflows/release-stable-post-success-followups.yml"',
    'opl-stable-release-set-followup-${source_run_id}',
    'opl-stable-desktop-append-${source_run_id}',
    'opl_app_desktop_release_set_certification.v1',
    'required_for_publication:false',
    'remaining:[]',
    'reason_code=operator_deferred',
  ]) {
    if (!optionalCertification.text.includes(required)) {
      failures += reportFailure(id, `Optional certification is missing ${required}`);
    }
  }
  if (
    /contents: write|packages: write|gh workflow run|gh run (?:rerun|cancel)|gh release (?:create|edit|upload|delete)|opl release (?:build|publish|reconcile)|codesign|notarize/.test(
      optionalCertification.text,
    )
  ) {
    failures += reportFailure(id, 'Optional certification must not dispatch, rebuild, sign, or publish');
  }
  for (const required of [
    'published_artifact_name',
    'published_artifact_digest',
    'post_publication_status',
    'post_publication_reason_code',
    'post_publication_job_started',
    'post_publication_execution_started',
    'post_publication_classification_valid',
    'PUBLISHED_ARTIFACT_NAME: ${{ inputs.published_artifact_name }}',
    'download_pattern="$PUBLISHED_ARTIFACT_NAME"',
    'keys == ["reason_code","schema","source_vm","status"]',
    '.source_vm == $source_vm',
    '.framework_source_archive == null',
    'clone_vm|configure_display|start_vm|wait_for_ip|wait_for_ssh',
    'actual_digest="sha256:$(shasum -a 256 "$dmg_path"',
    "diagnostic_scope != 'post_publication_optional_certification'",
  ]) {
    if (!optionalCertificationVm.text.includes(required)) {
      failures += reportFailure(id, `Optional certification VM path is missing ${required}`);
    }
  }
  if (optionalCertificationVm.text.includes("download_pattern='${{ inputs.published_artifact_name }}'")) {
    failures += reportFailure(id, 'Optional certification VM must pass published artifact names through step env');
  }

  return failures;
}

export function validateHomebrewFullPromotionTopology(appRoot: string): number {
  const id = 'homebrew_full_promotion_topology';
  const publisher = parseWorkflow(appRoot, homebrewFullPublisherWorkflowPath, id);
  if (!publisher) return 1;
  let failures = 0;
  const publisherJobs = workflowJobs(publisher.workflow);
  const publisherInputs = publisher.workflow.on?.workflow_call?.inputs ?? {};
  if (
    JSON.stringify(Object.keys(publisher.workflow.on ?? {})) !== JSON.stringify(['workflow_call'])
    || JSON.stringify(Object.keys(publisherInputs)) !== JSON.stringify(['authority_run_id', 'handoff_base64', 'handoff_sha256'])
    || !exactObject(publisher.workflow.permissions, exactReadPermissions)
    || JSON.stringify(Object.keys(publisherJobs)) !== JSON.stringify(['prepare-candidate', 'publish-cask', 'readback'])
  ) {
    failures += reportFailure(id, 'Full Homebrew reusable must expose only exact handoff inputs and candidate/publish/readback jobs');
  }
  const prepare = publisherJobs['prepare-candidate'];
  const publish = publisherJobs['publish-cask'];
  const readback = publisherJobs.readback;
  if (
    !prepare || prepare.if !== undefined || !exactObject(prepare.permissions, exactReadPermissions)
    || !publish || publish.if !== undefined || !needsExactly(publish, ['prepare-candidate'])
    || publish.environment !== 'release-stable' || !exactObject(publish.permissions, exactReadPermissions)
    || !readback || readback.if !== undefined || !needsExactly(readback, ['prepare-candidate', 'publish-cask'])
    || !exactObject(readback.permissions, exactReadPermissions)
  ) {
    failures += reportFailure(id, 'Full Homebrew reusable must publish the exact hosted-qualified candidate before protected Tap CAS and public readback');
  }
  if (
    /qualify-candidate|opl-first-run-vm\.yml|tart-smoke-summary\.json|smoke_harness_sha|shell-harness|opl-first-run-tart-smoke|--homebrew-cask-file/.test(
      publisher.text,
    )
  ) {
    failures += reportFailure(id, 'Full Homebrew publication must not depend on physical VM certification before protected Tap CAS');
  }
  const prepareRuns = jobRuns(prepare);
  const publishRuns = jobRuns(publish);
  for (const required of [
    'app_full_first_install',
    'inspect_only',
    'version_conflict',
    '--remote-write-mode none',
    'full_dmg_embedded_opl_base',
    'active_framework_count_target',
    'opl-homebrew-full-candidate-${GITHUB_RUN_ID}',
    'homebrew-full-follower-v3:${GITHUB_RUN_ID}',
    't+120*60_000',
    'opl_homebrew_full_observational_binding.v2',
    'workflow_cas_and_unified_attestation_observer',
    'release_mutation_authority_imported:false',
    'max_push_attempts:1',
    'standard_manifest_url=',
    'opl-app-component-manifest.json',
    '--expected-source-commit "$base_target_commitish"',
    'a1561bdf1dfe6f316dad22f16152a537ddfb69d5',
    'merge-base --is-ancestor "$embedded_base_floor" "$shell_sha"',
    'predates the embedded-Base fail-closed carrier',
    'qualification_receipt_sha256',
    'release-operation-deadline.ts check',
  ]) {
    if (!prepareRuns.includes(required)) failures += reportFailure(id, `Full Homebrew candidate preparation is missing ${required}`);
  }
  for (const required of [
    'release-operation-deadline.ts check',
    'git -C tap-source push --no-force origin "$result_commit:refs/heads/main"',
    'no second push was attempted',
    'opl_homebrew_full_unknown_outcome.v2',
    'required_action:"read_only_reconcile"',
    'git -C tap-source ls-remote origin refs/heads/main',
    'git -C tap-source fetch --no-tags --depth=1 origin "$remote_commit"',
    "git -C tap-source show 'FETCH_HEAD:Casks/one-person-lab-full.rb'",
    'opl_homebrew_full_publication_receipt.v2',
    'authority_model:"workflow_cas_and_unified_attestation_observer"',
    'build_provenance:{app_sha:$app,shell_sha:$shell,framework_sha:$framework}',
  ]) {
    if (!publishRuns.includes(required)) failures += reportFailure(id, `Full Homebrew protected publish is missing ${required}`);
  }
  for (const forbidden of [
    'clean_vm_receipt_sha256',
    'official_profile_first_install',
    'formula_opl_installed_before',
    'formula_opl_installed_after',
  ]) {
    if (publishRuns.includes(forbidden)) {
      failures += reportFailure(id, `Full Homebrew publication must not fabricate optional certification field ${forbidden}`);
    }
  }
  if (/restore-release-checkpoint|framework-executor|opl release (?:operation|publish|reconcile|checkpoint)/.test(publisher.text)) {
    failures += reportFailure(id, 'Full Homebrew observer must not import Framework checkpoint or release mutation authority');
  }
  if ((publishRuns.match(/git -C tap-source push --no-force/g) ?? []).length !== 1) {
    failures += reportFailure(id, 'Full Homebrew publisher must contain exactly one non-force Tap push call');
  }
  if (publisher.text.includes('contents/Casks/one-person-lab-full.rb?ref=main')) {
    failures += reportFailure(id, 'Full Homebrew readback must bind Cask bytes to a fetched exact Tap commit');
  }
  if (
    !publisher.text.includes(
      'OPL_HOMEBREW_TAP_TOKEN: ${{ secrets.OPL_HOMEBREW_TAP_TOKEN }}',
    )
  ) {
    failures += reportFailure(id, 'Full Homebrew token must be scoped to the protected publish job');
  }
  if (prepareRuns.includes('OPL_HOMEBREW_TAP_TOKEN')) {
    failures += reportFailure(id, 'Full Homebrew token must be unreachable before the protected publish job');
  }
  if (/workflow_dispatch:|depends_on formula: "opl"|github-activate-latest|make_latest|release-webui/.test(publisher.text)) {
    failures += reportFailure(id, 'Full Homebrew reusable must remain isolated from Formula, Latest, WebUI, and manual entry paths');
  }
  const vmWorkflow = parseWorkflow(appRoot, '.github/workflows/opl-first-run-vm.yml', id);
  if (
    !vmWorkflow
    || !vmWorkflow.text.includes('oplProductProfile/oplProductProfile.generated.json')
  ) {
    failures += reportFailure(
      id,
      'Full Homebrew qualification must carry the generated Official Profile roots into the Shell harness checkout',
    );
  }
  return failures;
}

export function validateNightlyReleaseTopology(appRoot: string): number {
  const id = 'nightly_release_topology';
  const release = parseWorkflow(appRoot, nightlyReleaseWorkflowPath, id);
  const followup = parseWorkflow(appRoot, nightlyFollowupWorkflowPath, id);
  if (!release || !followup) return [release, followup].filter((value) => !value).length;
  let failures = 0;
  const scheduledNightlyDispatchers = fs.readdirSync(path.join(appRoot, '.github/workflows'))
    .filter((name) => name.endsWith('.yml'))
    .filter((name) => {
      const workflow = parseYaml(
        fs.readFileSync(path.join(appRoot, '.github/workflows', name), 'utf8'),
      ) as Record<string, any>;
      return typeof workflow.name === 'string'
        && /nightly/i.test(workflow.name)
        && Object.prototype.hasOwnProperty.call(workflow.on ?? {}, 'schedule');
    })
    .sort();
  if (JSON.stringify(scheduledNightlyDispatchers) !== JSON.stringify(['release-nightly.yml'])) {
    failures += reportFailure(id, 'Nightly must have exactly one scheduled dispatcher: release-nightly.yml');
  }
  const releaseJobs = workflowJobs(release.workflow);
  const developmentValidationInputs = release.workflow.on?.workflow_dispatch?.inputs ?? {};
  const developmentValidationConfirmation = developmentValidationInputs.operator_confirmation;
  if (
    JSON.stringify(Object.keys(release.workflow.on ?? {}).sort()) !==
      JSON.stringify(['schedule', 'workflow_dispatch'])
    || JSON.stringify(release.workflow.on?.schedule) !== JSON.stringify([{ cron: '17 19 * * *' }])
    || JSON.stringify(Object.keys(developmentValidationInputs)) !== JSON.stringify(['operator_confirmation'])
    || developmentValidationConfirmation?.required !== true
    || developmentValidationConfirmation?.type !== 'string'
    || !exactObject(release.workflow.permissions, exactReadPermissions)
    || !exactObject(release.workflow.concurrency, {
      group: 'opl-standard-nightly',
      'cancel-in-progress': false,
    })
    || JSON.stringify(Object.keys(releaseJobs)) !==
      JSON.stringify(['admission', 'standard-build', 'qualify-and-publish'])
  ) {
    failures += reportFailure(id, 'Nightly must keep one daily production schedule and one user-explicit development-validation entry on the same Standard prerelease lane');
  }
  const admission = releaseJobs.admission;
  const build = releaseJobs['standard-build'];
  const publish = releaseJobs['qualify-and-publish'];
  if (
    !admission
    || !exactObject(admission.permissions, exactReadPermissions)
    || !build
    || build.uses !== './.github/workflows/_build-reusable.yml'
    || !needsExactly(build, ['admission'])
    || !exactObject(build.permissions, exactReadPermissions)
    || build.secrets !== undefined
    || build.with?.require_macos_gatekeeper !== false
    || Object.prototype.hasOwnProperty.call(build.with ?? {}, 'release_bundle_digest')
    || Object.prototype.hasOwnProperty.call(build.with ?? {}, 'release_cohort_ref')
    || Object.prototype.hasOwnProperty.call(build.with ?? {}, 'operation')
    || !publish
    || !needsExactly(publish, ['admission', 'standard-build'])
    || publish.environment !== 'release-nightly'
    || !exactObject(publish.permissions, exactStableStandardPermissions)
  ) {
    failures += reportFailure(id, 'Nightly must reuse the physical build without Stable Bundle authority and protect only its thin publisher');
  }
  for (const required of [
    'test "$GITHUB_RUN_ATTEMPT" = 1',
    'GITHUB_EVENT_NAME',
    'publish_nonlatest_nightly',
    'invocation_mode=scheduled_production',
    'invocation_mode=development_validation',
    'authority_source=daily_schedule',
    'authority_source=user_explicit',
    '--invocation-mode "$invocation_mode"',
    '--event "$GITHUB_EVENT_NAME"',
    '--authority-source "$authority_source"',
    '.invocation.mode',
    '.invocation.event',
    '.invocation.authority_source',
    'refs/heads/main',
    'TZ=Asia/Shanghai',
    'resolve-nightly-release-request.ts',
    'nightly-release-qualification.ts',
    'nightly-release-notes.ts',
    'nightly-notes-baseline.json',
    'nightly-notes-evidence.json',
    '--qualification nightly-qualification.json',
    '--shell-root shells/aionui',
    '--framework-root framework-source',
    'nightly-release-publisher.ts',
    'require_macos_gatekeeper: false',
    'github_release.make_latest',
    '.include_full',
    'heavy_vm_required',
  ]) {
    if (!release.text.includes(required)) {
      failures += reportFailure(id, `Nightly release is missing ${required}`);
    }
  }
  if (
    /opl-release-bundle-global|uses: \.\/\.github\/workflows\/_release-bundle\.yml|uses: \.\/\.github\/workflows\/opl-first-run-vm\.yml|require_macos_gatekeeper: true|make_latest:\s*(?:true|'true')|_release-full-addon|release-webui|manual-full-preview|update-homebrew|homebrew.*(?:gate|publish|tap|cask)|(?:gate|publish|tap|cask).*homebrew|\btart\b/i.test(
      release.text,
    )
  ) {
    failures += reportFailure(id, 'Nightly source must not enter Stable Bundle, heavy VM, Full, WebUI, Latest, manual Preview, Homebrew, or Tart paths');
  }

  const followupJobs = workflowJobs(followup.workflow);
  const homebrewJob = followupJobs['publish-nightly-cask'];
  const resolve = followupJobs['resolve-sample'];
  const vm = followupJobs['sampled-standard-vm'];
  const followupInputs = followup.workflow.on?.workflow_dispatch?.inputs ?? {};
  if (
    JSON.stringify(Object.keys(followup.workflow.on ?? {}).sort()) !==
      JSON.stringify(['workflow_dispatch', 'workflow_run'])
    || JSON.stringify(followup.workflow.on?.workflow_run?.workflows) !==
      JSON.stringify(['OPL Standard Nightly Release'])
    || JSON.stringify(followup.workflow.on?.workflow_run?.types) !== JSON.stringify(['completed'])
    || JSON.stringify(Object.keys(followupInputs)) !== JSON.stringify(['operation', 'source_run_id'])
    || JSON.stringify(followupInputs.operation?.options) !== JSON.stringify([
      'reconcile_homebrew', 'run_sampled_vm',
    ])
    || followupInputs.source_run_id?.required !== true
    || followupInputs.source_run_id?.type !== 'string'
    || !exactObject(followup.workflow.permissions, exactReadPermissions)
    || followup.workflow.concurrency !== undefined
    || JSON.stringify(Object.keys(followupJobs)) !== JSON.stringify([
      'publish-nightly-cask', 'resolve-sample', 'sampled-standard-vm',
    ])
    || !homebrewJob
    || homebrewJob.if !== "${{ (github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success') || (github.event_name == 'workflow_dispatch' && inputs.operation == 'reconcile_homebrew') }}"
    || homebrewJob.environment !== 'release-nightly'
    || !exactObject(homebrewJob.permissions, exactReadPermissions)
    || !resolve
    || resolve.if !== "${{ (github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success') || (github.event_name == 'workflow_dispatch' && inputs.operation == 'run_sampled_vm') }}"
    || !exactObject(resolve.permissions, exactReadPermissions)
    || !vm
    || vm.if !== "${{ needs.resolve-sample.outputs.sampled == 'true' }}"
    || vm.uses !== './.github/workflows/opl-first-run-vm.yml'
    || !needsExactly(vm, ['resolve-sample'])
    || !exactObject(vm.permissions, exactReadPermissions)
    || vm.with?.package_profile !== 'standard'
    || vm.with?.require_macos_gatekeeper !== false
    || Object.prototype.hasOwnProperty.call(vm.with ?? {}, 'release_bundle_digest')
    || Object.prototype.hasOwnProperty.call(vm.with ?? {}, 'operation')
  ) {
    failures += reportFailure(
      id,
      'Nightly follow-ups must expose one hub with mutually exclusive Homebrew and sampled VM lanes',
    );
  }
  const homebrewRuns = jobRuns(homebrewJob);
  for (const required of [
    '.path == ".github/workflows/release-nightly.yml"',
    '.event == "schedule" or .event == "workflow_dispatch"',
    '.actions.run_id == $run',
    '.actions.run_attempt == "1"',
    '.invocation.event == $event',
    'mode: "scheduled_production"',
    'mode: "development_validation"',
    '.cohort.app_sha == $head',
    '.run_attempt == 1',
    'OPL_HOMEBREW_TAP_DEPLOY_KEY',
    'git@github.com:${tap_repo}.git',
    'IdentitiesOnly=yes',
    'StrictHostKeyChecking=yes',
    'update-homebrew-tap.ts',
    '--channel nightly',
    'Casks/one-person-lab-nightly.rb',
    'Casks/one-person-lab.rb',
    'stable_before',
    'stable_after',
    'no retry is allowed',
    'retry_performed:false',
  ]) {
    if (!homebrewRuns.includes(required)) {
      failures += reportFailure(id, `Nightly Homebrew follower is missing ${required}`);
    }
  }
  if ((homebrewRuns.match(/git -C tap-source push --no-force/g) ?? []).length !== 1) {
    failures += reportFailure(id, 'Nightly Homebrew follower must contain exactly one ordinary non-force push');
  }
  if (
    /one-person-lab-full\.rb|make_latest:\s*(?:true|'true')|gh workflow run|gh run (?:rerun|cancel)|OPL_HOMEBREW_TAP_TOKEN|environment:\s*release-stable/.test(
      jobEvidenceText(homebrewJob),
    )
  ) {
    failures += reportFailure(
      id,
      'Nightly Homebrew follower must not contain VM, Full, Latest, dispatch, retry, or Stable credential paths',
    );
  }

  if (
    !jobEvidenceText(resolve).includes('TZ=Asia/Shanghai date +%u')
    || !jobEvidenceText(resolve).includes('.event == "schedule" or .event == "workflow_dispatch"')
    || !jobEvidenceText(resolve).includes('.actions.run_id == $run')
    || !jobEvidenceText(resolve).includes('.actions.run_attempt == "1"')
    || !jobEvidenceText(resolve).includes('.invocation.event == $event')
    || !jobEvidenceText(resolve).includes('mode:"scheduled_production"')
    || !jobEvidenceText(resolve).includes('mode:"development_validation"')
    || !jobEvidenceText(resolve).includes('authority_source:"user_explicit"')
    || !jobEvidenceText(resolve).includes('.cohort.app_sha == $head')
    || !jobEvidenceText(resolve).includes('heavy_vm_blocking == false')
    || /contents: write|packages: write|update-homebrew|make_latest:\s*(?:true|'true')|make_latest\s*==\s*true|gh release/.test(jobEvidenceText(resolve))
  ) {
    failures += reportFailure(id, 'Nightly sampled VM must stay low-frequency and mutation-free');
  }
  return failures;
}

function standardUpdaterOrLatest(text: string): boolean {
  return text.includes('uses: ./.github/workflows/opl-updater-upgrade-vm.yml') ||
    /^\s*activate-latest:/m.test(text) ||
    /--latest(?:\s+|=)(?:true|1)/.test(text);
}

export function validateReleaseBundleCanaryTopology(appRoot: string): number {
  const id = 'release_bundle_canary_topology';
  const parsed = parseWorkflow(appRoot, '.github/workflows/release-bundle-canary.yml', id);
  if (!parsed) return 1;
  const { workflow, text } = parsed;
  let failures = 0;
  const triggers = workflow.on ?? {};
  const schedule = triggers.schedule;
  if (JSON.stringify(Object.keys(triggers).sort()) !==
      JSON.stringify(['schedule', 'workflow_dispatch']) ||
      !Array.isArray(schedule) || schedule.length !== 1 ||
      schedule[0]?.cron !== '0 13 * * *') {
    failures += reportFailure(id, 'Canary must expose only explicit manual dispatch and the one daily schedule');
  }
  if (!exactObject(workflow.concurrency, {
    group: 'opl-release-validation-canary-${{ github.ref }}',
    'cancel-in-progress': true,
  })) {
    failures += reportFailure(id, 'Canary must use its own cancellable validation concurrency, not the Stable mutation mutex');
  }
  if (!exactObject(workflow.permissions, exactReadPermissions)) {
    failures += reportFailure(id, 'Canary permissions must be exactly contents:read/actions:read');
  }
  if (/^\s*secrets:/m.test(text) || workflowMutationCommandPattern.test(text) ||
      text.includes('opl-release-bundle-global')) {
    failures += reportFailure(id, 'Canary must not receive secrets or contain mutation commands');
  }

  const jobs = workflowJobs(workflow);
  if (JSON.stringify(Object.keys(jobs)) !== JSON.stringify([
    'framework-checkpoint-roundtrip', 'contract',
  ])) {
    failures += reportFailure(
      id,
      'Canary must contain only Framework checkpoint semantics and App contract verification',
    );
  }
  const framework = jobs['framework-checkpoint-roundtrip'];
  const contract = jobs.contract;
  if (
    !framework
    || framework['runs-on'] !== 'ubuntu-latest'
    || framework['timeout-minutes'] !== 20
    || !exactObject(framework.permissions, exactReadPermissions)
    || !jobRuns(framework).includes("--test-name-pattern='portable checkpoint switches executors|elapsed absolute deadline blocks'")
    || !jobRuns(framework).includes('tests/src/cli/cases/release-bundle.test.ts')
    || !contract
    || contract['runs-on'] !== 'ubuntu-latest'
    || requestsWritePermission(contract.permissions)
    || !jobRuns(contract).includes('tests/release/release-bundle-workflow-cutover.test.ts')
    || !jobRuns(contract).includes('tests/release/release-control-plane-boundary.test.ts')
  ) {
    failures += reportFailure(id, 'Canary jobs must run the two exact read-only contract checks');
  }
  for (const [jobId, job] of Object.entries(jobs)) {
    if (job.uses !== undefined || requestsWritePermission(job.permissions) || job.secrets !== undefined) {
      failures += reportFailure(
        id,
        `${jobId} must remain a local read-only check and cannot start a reusable release workflow`,
      );
    }
    failures += validateExactActionPins(
      '.github/workflows/release-bundle-canary.yml',
      jobId,
      Array.isArray(job.steps) ? job.steps : [],
    );
  }
  if (/uses:\s*\.\/\.github\/workflows\//.test(text)) {
    failures += reportFailure(id, 'Canary must not reintroduce reusable release workflow entry jobs');
  }
  return failures;
}

function validateExactActionPins(
  workflowPath: string,
  jobId: string,
  steps: Array<Record<string, any>>,
): number {
  let failures = 0;
  for (const [stepIndex, step] of steps.entries()) {
    if (typeof step.uses !== 'string' || step.uses.startsWith('./')) continue;
    if (!/@[0-9a-f]{40}$/.test(step.uses)) {
      console.error(`FAIL workflow_dispatch_write_authority: ${workflowPath} privileged job ${jobId} step ${stepIndex + 1} must pin ${step.uses} to an exact commit`);
      failures += 1;
    }
  }
  return failures;
}

export function runReleaseBoundaryTextChecks(appRoot: string): number {
  let failures = 0;

  for (const check of releaseBoundaryChecksForProfile()) {
    const absolutePath = path.join(appRoot, check.file);
    if (check.retired) {
      if (fs.existsSync(absolutePath)) {
        console.error(`FAIL ${check.id}: ${check.file} is retired and must not exist`);
        failures += 1;
      }
      continue;
    }
    if (!fs.existsSync(absolutePath)) {
      console.error(`FAIL ${check.id}: missing ${check.file}`);
      failures += 1;
      continue;
    }
    const text = fs.readFileSync(absolutePath, 'utf8');
    for (const needle of check.required ?? []) {
      if (!text.includes(needle)) {
        console.error(`FAIL ${check.id}: ${check.file} missing ${needle}`);
        failures += 1;
      }
    }
    for (const needle of check.forbidden ?? []) {
      if (text.includes(needle)) {
        console.error(`FAIL ${check.id}: ${check.file} still contains ${needle}`);
        failures += 1;
      }
    }
  }

  return failures;
}

export function validateWorkflowTopologyPolicy(appRoot: string): number {
  const id = 'workflow_topology_policy';
  const workflowRoot = path.join(appRoot, '.github', 'workflows');
  let failures = 0;
  let names: string[];
  try {
    names = fs.readdirSync(workflowRoot)
      .filter((name) => name.endsWith('.yml'))
      .sort();
  } catch (error) {
    return reportFailure(
      id,
      `cannot read .github/workflows: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  for (const retired of retiredWorkflowEntries) {
    if (names.includes(retired)) {
      failures += reportFailure(id, `${retired} is retired and must not reappear`);
    }
  }

  const workflows = new Map<string, Record<string, any>>();
  const workflowNames = new Map<string, string[]>();
  for (const name of names) {
    const parsed = parseWorkflow(appRoot, `.github/workflows/${name}`, id);
    if (!parsed) {
      failures += 1;
      continue;
    }
    workflows.set(name, parsed.workflow);
    const displayName = parsed.workflow.name;
    if (typeof displayName !== 'string' || displayName.trim() === '') {
      failures += reportFailure(id, `${name} must have a non-empty workflow name`);
      continue;
    }
    workflowNames.set(displayName, [...(workflowNames.get(displayName) ?? []), name]);
  }
  for (const [displayName, owners] of workflowNames) {
    if (owners.length !== 1) {
      failures += reportFailure(
        id,
        `workflow name ${JSON.stringify(displayName)} has multiple owners: ${owners.join(', ')}`,
      );
    }
  }

  const localCallers = new Map(names.map((name) => [name, [] as string[]]));
  for (const [name, workflow] of workflows) {
    const triggers = workflow.on && typeof workflow.on === 'object'
      ? workflow.on as Record<string, any>
      : {};
    const automaticTriggers = Object.keys(triggers)
      .filter((trigger) => trigger !== 'workflow_call' && trigger !== 'workflow_dispatch')
      .sort();
    const expectedAutomaticTriggers = name === 'non-release-validation.yml'
      ? ['pull_request', 'push']
      : expectedScheduledWorkflows.has(name)
        ? ['schedule']
        : expectedWorkflowRunFollowers.has(name)
          ? ['workflow_run']
          : [];
    if (JSON.stringify(automaticTriggers) !== JSON.stringify(expectedAutomaticTriggers)) {
      failures += reportFailure(
        id,
        `${name} automatic triggers ${JSON.stringify(automaticTriggers)} do not match its single owner contract ${JSON.stringify(expectedAutomaticTriggers)}`,
      );
    }

    const schedule = triggers.schedule;
    if (expectedScheduledWorkflows.has(name)) {
      const actualCrons = Array.isArray(schedule)
        ? schedule.map((entry) => entry?.cron).filter((cron) => typeof cron === 'string')
        : [];
      if (JSON.stringify(actualCrons) !== JSON.stringify(expectedScheduledWorkflows.get(name))) {
        failures += reportFailure(id, `${name} must own only its declared schedule`);
      }
    }

    const workflowRun = triggers.workflow_run;
    if (expectedWorkflowRunFollowers.has(name)) {
      const expectedProducer = expectedWorkflowRunFollowers.get(name);
      if (
        JSON.stringify(workflowRun?.workflows) !== JSON.stringify([expectedProducer])
        || JSON.stringify(workflowRun?.types) !== JSON.stringify(['completed'])
      ) {
        failures += reportFailure(
          id,
          `${name} must follow only ${expectedProducer} completion events`,
        );
      }
      if ((workflowNames.get(expectedProducer!) ?? []).length !== 1) {
        failures += reportFailure(id, `${name} workflow_run producer ${expectedProducer} is not uniquely defined`);
      }
    }

    for (const [jobId, job] of Object.entries(workflowJobs(workflow))) {
      const uses = job.uses;
      if (typeof uses !== 'string' || !uses.startsWith('./.github/workflows/')) continue;
      const callee = path.basename(uses);
      if (!localCallers.has(callee)) {
        failures += reportFailure(id, `${name}#${jobId} calls missing local workflow ${uses}`);
        continue;
      }
      localCallers.get(callee)!.push(`${name}#${jobId}`);
    }
  }

  for (const [name, workflow] of workflows) {
    const triggerNames = Object.keys(workflow.on ?? {});
    if (
      triggerNames.length === 1
      && triggerNames[0] === 'workflow_call'
      && localCallers.get(name)?.length === 0
    ) {
      failures += reportFailure(id, `${name} is a pure reusable workflow without a caller`);
    }
  }
  return failures;
}

export function validateWorkflowNode24Policy(appRoot: string): number {
  let failures = 0;

  for (const workflowPath of releaseWorkflowPathsForProfile()) {
    const absolutePath = path.join(appRoot, workflowPath);
    if (!fs.existsSync(absolutePath)) {
      console.error(`FAIL actions_node24_runtime_policy: missing ${workflowPath}`);
      failures += 1;
      continue;
    }
    const text = fs.readFileSync(absolutePath, 'utf8');
    if (!/\nenv:\n(?:  [A-Z0-9_]+: .+\n)*  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true\n/.test(text)) {
      console.error(
        `FAIL actions_node24_runtime_policy: ${workflowPath} must declare FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true in top-level env`,
      );
      failures += 1;
    }
  }

  return failures;
}

export function validateStableReleaseActionPinPolicy(appRoot: string): number {
  let failures = 0;
  const profile = releaseValidationProfile();
  const profileWorkflowPaths = new Set(releaseWorkflowPathsForProfile(profile));
  for (const relativePath of stableReleaseActionPaths.filter((candidate) =>
    !releaseWorkflowPaths.includes(candidate) || profileWorkflowPaths.has(candidate)
  )) {
    const absolutePath = path.join(appRoot, relativePath);
    let document: Record<string, any>;
    try {
      document = parseYaml(fs.readFileSync(absolutePath, 'utf8')) as Record<string, any>;
    } catch (error) {
      console.error(`FAIL stable_release_action_pin_policy: ${relativePath} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`);
      failures += 1;
      continue;
    }
    const steps = relativePath.includes('/actions/')
      ? (Array.isArray(document.runs?.steps) ? document.runs.steps as Array<Record<string, any>> : [])
      : Object.values(document.jobs ?? {}).flatMap((jobValue) => {
          const job = jobValue as Record<string, any>;
          return Array.isArray(job.steps) ? job.steps as Array<Record<string, any>> : [];
        });
    for (const [stepIndex, step] of steps.entries()) {
      if (typeof step.uses !== 'string' || step.uses.startsWith('./')) continue;
      if (!/@[0-9a-f]{40}$/.test(step.uses)) {
        console.error(`FAIL stable_release_action_pin_policy: ${relativePath} step ${stepIndex + 1} must pin ${step.uses} to an exact commit`);
        failures += 1;
      }
    }
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

export function validateWorkflowDispatchWriteAuthority(appRoot: string): number {
  let failures = validateStableReleaseControlPlane(appRoot) +
    validateReleaseBundleTopology(appRoot) +
    validateStableFollowupTopology(appRoot) +
    validateReleaseBundleCanaryTopology(appRoot) +
    validateNightlyReleaseTopology(appRoot) +
    validatePreviewLatestPointerTopology(appRoot) +
    validateIndependentWebuiPreviewTopology(appRoot) +
    validateManualFullPreviewControlPlane(appRoot) +
    validateHomebrewFullPromotionTopology(appRoot);
  const stableWorkflowPath = '.github/workflows/release-stable.yml';
  const stableEntryJobs = new Set(Object.keys(stableEntrySpecs));
  const workflowDirectory = path.join(appRoot, '.github', 'workflows');
  const workflowPaths = fs.readdirSync(workflowDirectory)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => `.github/workflows/${name}`);
  for (const workflowPath of workflowPaths) {
    const text = fs.readFileSync(path.join(appRoot, workflowPath), 'utf8');
    let workflow: Record<string, any>;
    try {
      workflow = parseYaml(text) as Record<string, any>;
    } catch (error) {
      console.error(`FAIL workflow_dispatch_write_authority: ${workflowPath} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`);
      failures += 1;
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(workflow?.on ?? {}, 'workflow_dispatch')) continue;
    const topPermissions = workflow.permissions && typeof workflow.permissions === 'object' ? workflow.permissions : {};
    const topWrites = Object.entries(topPermissions).filter(([, value]) => value === 'write').map(([key]) => key);
    if (topWrites.length > 0) {
      console.error(`FAIL workflow_dispatch_write_authority: ${workflowPath} grants top-level write permissions (${topWrites.join(',')}); use job-level least privilege`);
      failures += 1;
    }
    const jobs = workflow.jobs && typeof workflow.jobs === 'object' ? workflow.jobs : {};
    for (const [jobId, jobValue] of Object.entries(jobs)) {
      const job = jobValue as Record<string, any>;
      const permissions = job.permissions && typeof job.permissions === 'object' ? job.permissions : topPermissions;
      const writes = Object.entries(permissions).filter(([, value]) => value === 'write').map(([key]) => key);
      if (writes.length === 0) continue;
      const steps = Array.isArray(job.steps) ? job.steps as Array<Record<string, any>> : [];
      if (isAuthorizedWebuiStablePromotionWriteJob(workflowPath, jobId, job)) {
        failures += validateExactActionPins(workflowPath, jobId, steps);
        continue;
      }
      if (isAuthorizedManualPreviewWriteJob(workflowPath, jobId, job)) {
        continue;
      }
      if (isAuthorizedStableDesktopFollowupWriteJob(workflowPath, jobId, job)) {
        failures += validateExactActionPins(workflowPath, jobId, steps);
        continue;
      }
      if (isAuthorizedFullAddonFollowerWriteJob(workflowPath, jobId, job)) {
        failures += validateExactActionPins(workflowPath, jobId, steps);
        continue;
      }
      if (isAuthorizedStableWebuiWriteJob(workflowPath, jobId, job)) {
        continue;
      }
      if (
        workflowPath === nightlyReleaseWorkflowPath
        && jobId === 'qualify-and-publish'
        && job.environment === 'release-nightly'
        && needsExactly(job, ['admission', 'standard-build'])
        && exactObject(job.permissions, exactStableStandardPermissions)
      ) {
        failures += validateExactActionPins(workflowPath, jobId, steps);
        continue;
      }
      if (
        workflowPath === webuiDevelopmentWorkflowPath
        && jobId === 'webui-carrier-qualification'
        && job.uses === './.github/workflows/_release-webui-carrier.yml'
        && needsExactly(job, ['source-authority'])
        && exactObject(job.permissions, exactWebUiCompileCeilingPermissions)
        && job.if === "${{ inputs.operation == 'qualify' }}"
        && job.with?.mode === 'qualify'
        && job.with?.authority_mode === '${{ needs.source-authority.outputs.authority_mode }}'
        && steps.length === 0
      ) {
        continue;
      }
      if (
        workflowPath === webuiDevelopmentWorkflowPath
        && jobId === 'webui-carrier'
        && job.uses === './.github/workflows/_release-webui-carrier.yml'
        && needsExactly(job, ['source-authority'])
        && exactObject(job.permissions, exactWebUiCompileCeilingPermissions)
        && job.with?.mode === 'execute'
        && job.with?.authority_mode === '${{ needs.source-authority.outputs.authority_mode }}'
        && steps.length === 0
      ) {
        continue;
      }
      if (
        workflowPath === webuiDevelopmentWorkflowPath
        && jobId === 'promote-webui-latest'
        && job.uses === './.github/workflows/release-webui-stable.yml'
        && needsExactly(job, ['source-authority', 'webui-carrier'])
        && exactObject(job.permissions, exactWebUiCompileCeilingPermissions)
        && job.with?.authority_mode === "${{ inputs.channel == 'stable' && 'independent_stable' || 'independent_preview' }}"
        && String(job.with?.publication_record_ref).includes('needs.webui-carrier.outputs.publication_record_ref')
        && String(job.with?.operator_confirmation).includes('move-docker-stable-and-latest')
        && Object.keys(job.with ?? {}).length === 3
        && steps.length === 0
      ) {
        continue;
      }
      if (
        workflowPath === manualFullPreviewWorkflowPath
        && jobId === manualFullPreviewMutationJob
        && job.environment === 'release-stable'
        && needsExactly(job, ['ingress'])
        && exactObject(job.permissions, exactStableEntryPermissions)
      ) {
        failures += validateExactActionPins(workflowPath, jobId, steps);
        continue;
      }
      if (workflowPath === stableWorkflowPath && stableEntryJobs.has(jobId)) {
        const spec = stableEntrySpecs[jobId as keyof typeof stableEntrySpecs];
        if (job.uses && steps.length === 0 && spec && exactObject(job.permissions, spec.permissions)) {
          continue;
        }
        console.error(`FAIL workflow_dispatch_write_authority: ${workflowPath} job ${jobId} must be a step-free least-privilege reusable entry`);
        failures += 1;
        failures += validateExactActionPins(workflowPath, jobId, steps);
        continue;
      }
      if (workflowPath !== stableWorkflowPath) {
        console.error(`FAIL workflow_dispatch_write_authority: ${workflowPath} job ${jobId} has unrecognized write permission outside an admitted release entry`);
        failures += 1;
        continue;
      }
      console.error(`FAIL workflow_dispatch_write_authority: ${workflowPath} job ${jobId} is not one of the three Stable operation entries`);
      failures += 1;
      failures += validateExactActionPins(workflowPath, jobId, steps);
    }
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
    'shell_ref',
    'version',
  ];
  const expectedCarrierWith = {
    mode: 'execute',
    authority_mode: '${{ needs.source-authority.outputs.authority_mode }}',
    app_ref: '${{ needs.source-authority.outputs.app_ref }}',
    shell_ref: '${{ needs.source-authority.outputs.shell_ref }}',
    framework_ref: '${{ needs.source-authority.outputs.framework_ref }}',
    opl_version: '${{ needs.source-authority.outputs.version }}',
    release_bundle_digest: '${{ needs.source-authority.outputs.source_authority_digest }}',
    release_cohort_ref: '${{ needs.source-authority.outputs.source_authority_digest }}',
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
    || !exactObject(carrier.with, expectedCarrierWith)
    || carrier.if !== "${{ inputs.operation == 'publish' }}"
    || !qualification
    || !needsExactly(qualification, ['source-authority'])
    || qualification.uses !== './.github/workflows/_release-webui-carrier.yml'
    || !exactObject(qualification.permissions, exactWebUiCompileCeilingPermissions)
    || qualification.if !== "${{ inputs.operation == 'qualify' }}"
    || !exactObject(qualification.with, { ...expectedCarrierWith, mode: 'qualify' })
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
