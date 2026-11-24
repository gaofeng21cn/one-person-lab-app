import {
  exactObject,
  requestsWritePermission,
  jobRuns,
  jobEvidenceText,
  workflowJobs,
  needsExactly,
  parseWorkflow,
  reportFailure,
} from './report.ts';
import {
  exactReadPermissions,
  studioFullReleaseWorkflowPath,
} from './workflow-policy.ts';
import { workflowMutationCommandPattern } from './mutation-policy.ts';

export function validateStudioFullAppendTopology(
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
