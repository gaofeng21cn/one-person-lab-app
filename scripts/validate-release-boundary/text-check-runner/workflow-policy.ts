import fs from 'node:fs';
import path from 'node:path';
import {
  releaseValidationProfile,
  releaseWorkflowPaths,
  releaseWorkflowPathsForProfile,
} from '../release-checks.ts';
import {
  exactObject,
  failIf,
  hasStableMutationMutex,
  jobRuns,
  hasLocalStep,
  localActionUse,
  workflowJobs,
  needsExactly,
  parseWorkflow,
  reportFailure,
  sameJson,
} from './report.ts';

export { releaseWorkflowPaths, releaseWorkflowPathsForProfile } from '../release-checks.ts';

export const stableReleaseControlRunner = '${{ fromJSON(github.ref == \'refs/heads/main\' && vars.OPL_RELEASE_CONTROL_RUNNER_LABELS || \'["ubuntu-latest"]\') }}';

export const exactReadPermissions = { contents: 'read', actions: 'read' } as const;
export const exactStableEntryPermissions = { contents: 'write', actions: 'read' } as const;
export const exactWebUiCompileCeilingPermissions = {
  contents: 'read',
  actions: 'read',
  packages: 'write',
} as const;
export const exactStableStandardPermissions = { contents: 'write', actions: 'read' } as const;
export const exactNightlyPublishPermissions = { ...exactReadPermissions, 'copilot-requests': 'write' } as const;
export const exactStableStandardBundlePermissions = {
  contents: 'write',
  actions: 'read',
  packages: 'read',
  'copilot-requests': 'write',
} as const;
export const manualPreviewWorkflowPath = '.github/workflows/release-manual-preview.yml';
export const manualFullPreviewWorkflowPath = '.github/workflows/release-manual-full-preview.yml';
export const manualFullPreviewMutationJob = 'mutate';
export const webuiStablePromotionWorkflowPath = '.github/workflows/release-webui-stable.yml';
export const webuiStablePromotionMutationJob = 'promote-webui-stable';
export const webuiPromotionPublishEnvironment =
  "${{ needs.admission.outputs.authority_mode == 'independent_preview' && 'release-preview-publication' || 'release-stable' }}";
export const webuiDevelopmentWorkflowPath = '.github/workflows/release-webui-development.yml';
export const stableFollowupWorkflowPath = '.github/workflows/release-stable-post-success-followups.yml';
export const stableFollowupActionPaths = {
  observe: '.github/actions/release-followups/observe/action.yml',
  fullAddon: '.github/actions/release-followups/full-addon/action.yml',
  homebrewStandard: '.github/actions/release-followups/homebrew-standard/action.yml',
  homebrewFullHandoff: '.github/actions/release-followups/homebrew-full-handoff/action.yml',
} as const;
export const homebrewFullPublisherWorkflowPath = '.github/workflows/_release-homebrew-full-publish.yml';
export const postPublicationOptionalCertificationWorkflowPath =
  '.github/workflows/release-post-publication-certification.yml';
export const stableDesktopFollowupWorkflowPath = stableFollowupWorkflowPath;
export const desktopPlatformAddonWorkflowPath = '.github/workflows/_release-desktop-platform-addon.yml';
export const fullAddonFollowerWorkflowPath = stableFollowupWorkflowPath;
export const nightlyReleaseWorkflowPath = '.github/workflows/release-nightly.yml';
export const nightlyFollowupWorkflowPath = '.github/workflows/release-nightly-followups.yml';
export const previewLatestPointerWorkflowPath =
  '.github/workflows/_release-preview-latest-pointer.yml';
export const studioReleaseWorkflowPath = '.github/workflows/_release-studio.yml';
export const studioFullReleaseWorkflowPath = '.github/workflows/_release-studio-full.yml';
export const exactWebuiStablePromotionPermissions = {
  actions: 'read',
  contents: 'read',
  packages: 'write',
} as const;

export const expectedScheduledWorkflows = new Map([
  ['commit-message-language-advisory.yml', ['41 2 * * 1']],
  ['codeql.yml', ['17 18 * * 0']],
  ['release-bundle-canary.yml', ['0 13 * * *']],
  ['release-nightly.yml', ['17 19 * * *']],
]);
export const expectedWorkflowRunFollowers = new Map([
  ['release-nightly-followups.yml', 'OPL Standard Nightly Release'],
  ['release-post-publication-certification.yml', 'OPL Stable Follow-ups'],
  ['release-stable-post-success-followups.yml', 'OPL Stable Release Bundle'],
]);
export const retiredWorkflowEntries = new Set([
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
  'nightly-release-notes-check.yml',
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
    || !exactObject(job.permissions, jobId === 'preview' ? { ...exactStableEntryPermissions, 'copilot-requests': 'write' } : exactStableEntryPermissions)
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

export function isAuthorizedStableDesktopFollowupWriteJob(
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

export function isAuthorizedFullAddonFollowerWriteJob(
  workflowPath: string,
  jobId: string,
  job: Record<string, any>,
): boolean {
  if (workflowPath !== fullAddonFollowerWorkflowPath || jobId !== 'reconcile-full-addon') return false;
  return job['runs-on'] === stableReleaseControlRunner
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

export function isAuthorizedInlineStableFollowups(workflowPath: string, jobId: string, job: Record<string, any>): boolean {
  return workflowPath === '.github/workflows/release-stable.yml'
    && jobId === 'stable-followups'
    && needsExactly(job, ['admission', 'standard', 'resume-standard'])
    && job.if === "${{ always() && !cancelled() && needs.admission.result == 'success' && ((inputs.operation == 'standard' && needs.standard.result == 'success') || (inputs.operation == 'resume_standard' && needs.resume-standard.result == 'success')) }}"
    && job.uses === './.github/workflows/release-stable-post-success-followups.yml'
    && exactObject(job.permissions, { contents: 'write', actions: 'write' })
    && exactObject(job.with, {
      source_run_id: '${{ github.run_id }}',
      source_operation: '${{ needs.admission.outputs.operation }}',
    })
    && job.secrets === 'inherit'
    && !Array.isArray(job.steps);
}

export function isAuthorizedStableWebuiWriteJob(
  workflowPath: string,
  jobId: string,
  job: Record<string, any>,
): boolean {
  if (workflowPath !== '.github/workflows/release-stable.yml') return false;
  if (jobId === 'webui-carrier') {
    return needsExactly(job, ['webui-source-authority'])
      && job.uses === './.github/workflows/_release-webui-carrier.yml'
      && job.if === "${{ !cancelled() && needs.webui-source-authority.result == 'success' && (inputs.operation == 'resume_standard' || needs.webui-source-authority.outputs.qualification_status == 'passed') }}"
      && exactObject(job.permissions, exactWebUiCompileCeilingPermissions)
      && job.with?.authority_mode === 'independent_stable'
      && job.with?.mode === "${{ inputs.operation == 'resume_standard' && 'execute' || 'publish-prequalified' }}"
      && job.with?.qualified_artifact_run_id === '${{ github.run_id }}'
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

export const stableEntrySpecs = {
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
    permissions: exactStableStandardBundlePermissions,
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

export function validateExactActionPins(
  workflowPath: string,
  jobId: string,
  steps: Array<Record<string, any>>,
): number {
  let failures = 0;
  for (const [stepIndex, step] of steps.entries()) {
    if (typeof step.uses !== 'string' || step.uses.startsWith('./')) continue;
    failures += failIf(
      'workflow_dispatch_write_authority',
      !/@[0-9a-f]{40}$/.test(step.uses),
      `${workflowPath} privileged job ${jobId} step ${stepIndex + 1} must pin ${step.uses} to an exact commit`,
    );
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
    failures += failIf(
      id,
      !sameJson(automaticTriggers, expectedAutomaticTriggers),
      `${name} automatic triggers ${JSON.stringify(automaticTriggers)} do not match its single owner contract ${JSON.stringify(expectedAutomaticTriggers)}`,
    );

    const schedule = triggers.schedule;
    if (expectedScheduledWorkflows.has(name)) {
      const actualCrons = Array.isArray(schedule)
        ? schedule.map((entry) => entry?.cron).filter((cron) => typeof cron === 'string')
        : [];
      failures += failIf(id, !sameJson(actualCrons, expectedScheduledWorkflows.get(name)), `${name} must own only its declared schedule`);
    }

    const workflowRun = triggers.workflow_run;
    if (expectedWorkflowRunFollowers.has(name)) {
      const expectedProducer = expectedWorkflowRunFollowers.get(name);
      failures += failIf(
        id,
        !sameJson(workflowRun?.workflows, [expectedProducer]) || !sameJson(workflowRun?.types, ['completed']),
        `${name} must follow only ${expectedProducer} completion events`,
      );
      failures += failIf(id, (workflowNames.get(expectedProducer!) ?? []).length !== 1, `${name} workflow_run producer ${expectedProducer} is not uniquely defined`);
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
    failures += failIf(
      id,
      triggerNames.length === 1 && triggerNames[0] === 'workflow_call' && localCallers.get(name)?.length === 0,
      `${name} is a pure reusable workflow without a caller`,
    );
  }
  return failures;
}

export function validateWorkflowNode24Policy(appRoot: string): number {
  let failures = 0;
  for (const workflowPath of releaseWorkflowPathsForProfile()) {
    const absolutePath = path.join(appRoot, workflowPath);
    if (!fs.existsSync(absolutePath)) {
      failures += reportFailure('actions_node24_runtime_policy', `missing ${workflowPath}`);
      continue;
    }
    const text = fs.readFileSync(absolutePath, 'utf8');
    failures += failIf(
      'actions_node24_runtime_policy',
      !/\nenv:\n(?:  [A-Z0-9_]+: .+\n)*  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true\n/.test(text),
      `${workflowPath} must declare FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true in top-level env`,
    );
  }
  return failures;
}

export function validateStableReleaseActionPinPolicy(appRoot: string): number {
  let failures = 0;
  const profileWorkflowPaths = new Set(releaseWorkflowPathsForProfile(releaseValidationProfile()));
  for (const relativePath of stableReleaseActionPaths.filter((candidate) =>
    !releaseWorkflowPaths.includes(candidate) || profileWorkflowPaths.has(candidate)
  )) {
    const parsed = parseWorkflow(appRoot, relativePath, 'stable_release_action_pin_policy');
    if (!parsed) {
      failures += 1;
      continue;
    }
    const document = parsed.workflow;
    const steps = relativePath.includes('/actions/')
      ? (Array.isArray(document.runs?.steps) ? document.runs.steps as Array<Record<string, any>> : [])
      : Object.values(document.jobs ?? {}).flatMap((jobValue) => {
          const job = jobValue as Record<string, any>;
          return Array.isArray(job.steps) ? job.steps as Array<Record<string, any>> : [];
        });
    for (const [stepIndex, step] of steps.entries()) {
      if (typeof step.uses !== 'string' || step.uses.startsWith('./')) continue;
      failures += failIf(
        'stable_release_action_pin_policy',
        !/@[0-9a-f]{40}$/.test(step.uses),
        `${relativePath} step ${stepIndex + 1} must pin ${step.uses} to an exact commit`,
      );
    }
  }
  return failures;
}

export function validateWorkflowDispatchWriteAuthorityForWorkflows(appRoot: string): number {
  let failures = 0;
  const id = 'workflow_dispatch_write_authority';
  const stableWorkflowPath = '.github/workflows/release-stable.yml';
  const stableEntryJobs = new Set(Object.keys(stableEntrySpecs));
  const workflowPaths = fs.readdirSync(path.join(appRoot, '.github', 'workflows'))
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => `.github/workflows/${name}`);
  for (const workflowPath of workflowPaths) {
    const parsed = parseWorkflow(appRoot, workflowPath, id);
    if (!parsed) {
      failures += 1;
      continue;
    }
    const workflow = parsed.workflow;
    if (!Object.prototype.hasOwnProperty.call(workflow?.on ?? {}, 'workflow_dispatch')) continue;
    const topPermissions = workflow.permissions && typeof workflow.permissions === 'object' ? workflow.permissions : {};
    const topWrites = Object.entries(topPermissions).filter(([, value]) => value === 'write').map(([key]) => key);
    failures += failIf(id, topWrites.length > 0, `${workflowPath} grants top-level write permissions (${topWrites.join(',')}); use job-level least privilege`);
    const jobs = workflow.jobs && typeof workflow.jobs === 'object' ? workflow.jobs : {};
    for (const [jobId, jobValue] of Object.entries(jobs)) {
      const job = jobValue as Record<string, any>;
      const permissions = job.permissions && typeof job.permissions === 'object' ? job.permissions : topPermissions;
      const writes = Object.entries(permissions).filter(([, value]) => value === 'write').map(([key]) => key);
      if (writes.length === 0) continue;
      const steps = Array.isArray(job.steps) ? job.steps as Array<Record<string, any>> : [];
      const prepareReplacement = steps.find(step => step.name === 'Prepare exact qualified files and existing CAS plan');
      const replaceAssets = steps.find(step => step.name === 'Stage and promote through the canonical same-tag CAS utility');
      const expectedReplacementCommands = ['set -euo pipefail',
        'node --experimental-strip-types scripts/replace-same-tag-release-assets.ts --plan "$RUNNER_TEMP/replacement/replacement-plan.json" --stage',
        'node --experimental-strip-types scripts/replace-same-tag-release-assets.ts --plan "$RUNNER_TEMP/replacement/replacement-plan.json" --promote'];
      if (workflowPath === '.github/workflows/replace-same-tag-assets.yml'
        && jobId === 'replace' && job.environment === 'release-stable'
        && exactObject(job.permissions, { contents: 'write', actions: 'read' })
        && prepareReplacement?.env?.REPLACEMENT_REQUEST === '${{ inputs.request }}'
        && String(prepareReplacement?.run).includes('scripts/prepare-same-tag-replacement-request.ts')
        && String(prepareReplacement?.run).includes('test "$GITHUB_REF" = refs/heads/main')
        && String(prepareReplacement?.run).includes('test "$GITHUB_RUN_ATTEMPT" = 1')
        && replaceAssets?.if === "${{ inputs.operation != 'verify_public' }}"
        && JSON.stringify(String(replaceAssets?.run).trim().split('\n').map(line => line.trim())) === JSON.stringify(expectedReplacementCommands)) {
        failures += validateExactActionPins(workflowPath, jobId, steps);
        continue;
      }
      if (
        workflowPath === '.github/workflows/release-diagnostics.yml'
        && jobId === 'writers'
        && job.if === "${{ github.event_name == 'workflow_dispatch' && inputs.diagnostic == 'nightly_release_notes' }}"
        && exactObject(job.permissions, { contents: 'read', 'copilot-requests': 'write' })
        && jobRuns(job).includes('scripts/check-nightly-release-note-writers.ts')
      ) {
        failures += validateExactActionPins(workflowPath, jobId, steps);
        continue;
      }
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
        && job.environment === 'release-stable'
        && needsExactly(job, ['admission', 'standard-build'])
        && exactObject(job.permissions, exactNightlyPublishPermissions)
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
        && job.with?.mode === "${{ inputs.qualified_artifact_run_id != '' && 'publish-prequalified' || 'execute' }}"
        && job.with?.qualified_artifact_run_id === '${{ inputs.qualified_artifact_run_id }}'
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
      if (isAuthorizedInlineStableFollowups(workflowPath, jobId, job)) continue;
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
