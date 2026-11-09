import {
  exactObject,
  hasStableMutationMutex,
  jobRuns,
  jobEvidenceText,
  workflowJobs,
  needsExactly,
  parseWorkflow,
  reportFailure,
} from '../report.ts';
import { exactReadPermissions } from '../workflow-policy.ts';
import { retiredLiveAuthorityPattern, standardUpdaterOrLatest } from '../mutation-policy.ts';

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
    const expectedPermissions = name === 'bundle' && jobId === 'webui-qualify'
      ? { contents: 'read', actions: 'read', packages: 'read' }
      : name === 'bundle' && jobId === 'freeze'
        ? { ...exactReadPermissions, 'copilot-requests': 'write' }
        : exactReadPermissions;
    if (!exactObject(job.permissions, expectedPermissions)) {
      failures += reportFailure(
        id,
        jobId === 'webui-qualify'
          ? `${name}:${jobId} must remain packages:read for qualify-only`
          : `${name}:${jobId} must explicitly downgrade to contents:read/actions:read`,
      );
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
    'webui-source-authority',
    'webui-qualify',
    'prepare-standard-vm-inputs',
    'standard-build',
    'seal-standard-identity',
    'full-candidate',
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
  failures += validateReusableCall(
    id,
    bundleJobs,
    'webui-qualify',
    './.github/workflows/_release-webui-carrier.yml',
    { contents: 'read', actions: 'read', packages: 'read' },
  );
  failures += validateReusableCall(
    id,
    bundleJobs,
    'full-candidate',
    './.github/workflows/full-first-install-release.yml',
    exactReadPermissions,
  );
  const webuiQualify = bundleJobs['webui-qualify'];
  if (
    !webuiQualify
    || webuiQualify.with?.mode !== 'qualify-only'
    || webuiQualify.with?.authority_mode !== 'independent_stable'
    || webuiQualify['continue-on-error'] !== undefined
    || !needsExactly(webuiQualify, ['freeze', 'webui-source-authority'])
    || webuiQualify.secrets !== 'inherit'
  ) {
    failures += reportFailure(id, 'webui-qualify must run qualify-only after freeze without GHCR write');
  }
  const webuiBuilder = parseWorkflow(appRoot, '.github/workflows/_release-webui-carrier.yml', id);
  const webuiBuild = webuiBuilder?.workflow?.jobs?.['build-and-qualify'];
  const webuiReceipt = webuiBuilder?.workflow?.jobs?.['qualify-receipt'];
  if (
    !webuiBuild
    || webuiBuild['continue-on-error'] !== "${{ inputs.mode == 'qualify-only' }}"
    || !webuiReceipt
    || webuiReceipt.if !== "${{ always() && inputs.mode == 'qualify-only' }}"
    || !needsExactly(webuiReceipt, ['build-and-qualify'])
  ) {
    failures += reportFailure(
      id,
      'qualify-only WebUI isolation must continue-on-error on the inner builder and emit an explicit receipt',
    );
  }
  const fullCandidate = bundleJobs['full-candidate'];
  if (
    !fullCandidate
    || fullCandidate.with?.candidate_only !== true
    || fullCandidate.with?.upload_full_package_artifact !== true
    || fullCandidate.with?.target_standard_release_id
    || fullCandidate['continue-on-error'] !== undefined
    || fullCandidate.if !== "${{ always() && inputs.include_full && inputs.channel == 'stable' && needs.freeze.result == 'success' && needs.seal-standard-identity.result == 'success' }}"
    || !needsExactly(fullCandidate, ['freeze', 'seal-standard-identity'])
    || fullCandidate.secrets !== 'inherit'
  ) {
    failures += reportFailure(id, 'legacy full-candidate must run only when explicitly requested and build signed bytes after Standard identity without public Release mutation');
  }
  const candidateBuilder = parseWorkflow(appRoot, '.github/workflows/full-first-install-release.yml', id);
  const candidateJob = candidateBuilder?.workflow?.jobs?.['full-first-install'];
  if (
    !candidateJob
    || candidateJob['continue-on-error'] !== '${{ inputs.candidate_only }}'
    || candidateJob['runs-on'] !== 'macos-latest'
    || Array.isArray(candidateJob.steps) === false
  ) {
    failures += reportFailure(
      id,
      'candidate-only Full isolation must continue-on-error on the regular inner builder, not the reusable caller',
    );
  }
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
    || !needsExactly(standardCleanVm, ['freeze', 'seal-standard-identity', 'prepare-standard-vm-inputs'])
    || standardCleanVm.if !== "${{ always() && inputs.channel == 'stable' && needs.freeze.result == 'success' && needs.seal-standard-identity.result == 'success' }}"
    || Object.prototype.hasOwnProperty.call(standardCleanVm, 'continue-on-error')
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
      'Standard clean-install qualification must consume the exact sealed candidate before publication',
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
    failures += reportFailure(id, 'Standard checkpoint must require protected clean-VM qualification before publication');
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
    || !String(standardJobs['activate-latest']?.if ?? '').includes("needs.restore.outputs.channel != 'stable'")
    || !String(standardJobs['remote-digest-verify']?.if ?? '').includes("needs.restore.outputs.channel != 'stable'")
    || !jobEvidenceText(standardJobs['publish-standard-nonlatest']).includes('Read back exact remote Standard digests')
    || !jobEvidenceText(standardJobs['publish-standard-nonlatest']).includes('Activate Latest after exact remote parity')
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
    'activate-latest': 'release-preview-latest',
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
    'publish-homebrew-full',
  ]) {
    if (!fullJobs[jobId]) failures += reportFailure(id, `_release-full-addon.yml is missing ${jobId}`);
  }
  for (const retiredJobId of ['homebrew-full-vm', 'homebrew-full-readback']) {
    if (fullJobs[retiredJobId]) {
      failures += reportFailure(id, `_release-full-addon.yml must not retain ${retiredJobId}`);
    }
  }
  failures += validateReusableCall(
    id,
    fullJobs,
    'publish-homebrew-full',
    './.github/workflows/_release-homebrew-full-publish.yml',
    exactReadPermissions,
  );
  if (
    !needsExactly(fullJobs['publish-homebrew-full'], ['publish-full'])
    || fullJobs['publish-homebrew-full']?.secrets !== 'inherit'
  ) {
    failures += reportFailure(id, 'Full owner must publish Homebrew Full through the existing reusable after publish-full');
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
  const restoreStandard = fullJobs['restore-standard'];
  const restoreStandardRuns = jobRuns(restoreStandard);
  const originalFullCohortDownload = fullJobs['materialize-full-build']?.steps?.find(
    (step: Record<string, unknown>) => step.name === 'Download original Full build cohort identity',
  );
  if (
    restoreStandard?.outputs?.full_artifact_producer_run_id
      !== '${{ steps.operation.outputs.full_artifact_producer_run_id }}'
    || !restoreStandardRuns.includes('opl_release_bundle_executor_receipt.v1')
    || !restoreStandardRuns.includes('.bundle_digest == $bundle')
    || !restoreStandardRuns.includes('.track == "full"')
    || !restoreStandardRuns.includes('.release_operation == "append_full"')
    || !restoreStandardRuns.includes('A completed Full build checkpoint must contain its executor receipt')
    || originalFullCohortDownload?.with?.['run-id']
      !== '${{ needs.restore-standard.outputs.full_artifact_producer_run_id }}'
  ) {
    failures += reportFailure(
      id,
      'Full checkpoint recovery must derive the original artifact producer run from its Bundle-bound build receipt',
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
    ])
    || fullCleanVm.with?.release_artifact_run_id !== '${{ needs.materialize-full-build.outputs.artifact_producer_run_id || github.run_id }}'
    || fullCleanVm.with?.verification_app_ref !== '${{ inputs.verification_app_ref || inputs.full_content_app_ref }}'
    || fullCleanVm.with?.smoke_harness_ref !== '${{ inputs.smoke_harness_ref || inputs.full_content_shell_ref }}'
    || fullCleanVm.with?.package_profile !== 'full'
    || fullCleanVm.with?.diagnostic_scope !== 'release_gate'
    || fullCleanVm.with?.require_macos_gatekeeper !== true
    || fullCleanVm.secrets !== 'inherit'
  ) {
    failures += reportFailure(
      id,
      'Full clean-VM qualification must parallel hosted validation after a verified build and consume the exact original Full artifact run',
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
  if (/update-homebrew-tap|OPL_HOMEBREW_TAP_TOKEN|tap-source|Casks\/one-person-lab\.rb|git\b[^\n]*\bpush\b/.test(full.text)) {
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
