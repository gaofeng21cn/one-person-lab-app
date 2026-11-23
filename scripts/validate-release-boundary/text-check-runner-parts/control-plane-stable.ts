import {
  exactObject,
  hasStableMutationMutex,
  requestsWritePermission,
  jobRuns,
  jobEvidenceText,
  workflowJobs,
  needsExactly,
  parseWorkflow,
  reportFailure,
} from './report.ts';
import { validateStudioFullAppendTopology } from './control-plane-studio-full-append.ts';
import {
  exactReadPermissions,
  studioReleaseWorkflowPath,
  stableEntrySpecs,
  isAuthorizedInlineStableFollowups,
  isAuthorizedStableWebuiWriteJob,
} from './workflow-policy.ts';
import {
  workflowMutationCommandPattern,
  retiredLiveAuthorityPattern,
} from './mutation-policy.ts';

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
    'reconcile-completed-webui',
    'webui-source-authority',
    'webui-carrier',
    'webui-promotion',
    'stable-followups',
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
  if (!isAuthorizedInlineStableFollowups('.github/workflows/release-stable.yml', 'stable-followups', jobs['stable-followups'] ?? {})) {
    failures += reportFailure(id, 'Stable followers must start after Standard publication without waiting for Docker');
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
    || webuiSourceAuthority.if !== "${{ always() && !cancelled() && needs.admission.outputs.completed_webui_run_id == '' && needs.admission.result == 'success' && ((inputs.operation == 'standard' && needs.standard.result == 'success') || (inputs.operation == 'resume_standard' && needs.resume-standard.result == 'success')) }}"
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
  const completedWebui = jobs['reconcile-completed-webui'];
  if (!completedWebui || !needsExactly(completedWebui, ['admission', 'protected-operation-admission', 'stable-admission-manifest', 'standard', 'resume-standard'])
    || !exactObject(completedWebui.permissions, exactReadPermissions)
    || completedWebui.if !== "${{ always() && !cancelled() && needs.admission.outputs.completed_webui_run_id != '' && ((inputs.operation == 'standard' && needs.standard.result == 'success') || (inputs.operation == 'resume_standard' && needs.resume-standard.result == 'success')) }}") {
    failures += reportFailure(id, 'Completed independent Docker recovery must be read-only and follow Standard publication');
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
  if (
    !admissionRun.includes('"opl-release-append-full-operation-checkpoint-v2-$SOURCE_RUN_ID"')
    || admissionRun.includes('"opl-release-append-full-operation-checkpoint-$SOURCE_RUN_ID"')
  ) {
    failures += reportFailure(
      id,
      'Stable admission must accept only the current v2 portable Full operation checkpoint for harness recovery',
    );
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
      || qualify.environment !== "${{ needs.resolve-checkpoint.outputs.terminal_preview == 'true' && 'release-stable' || null }}"
      || qualify['runs-on'] !== "${{ needs.resolve-checkpoint.outputs.terminal_preview == 'true' && fromJSON('[\"self-hosted\",\"macOS\",\"ARM64\",\"opl-cert-mac-tart\"]') || fromJSON('[\"macos-15\"]') }}"
      || resolve.outputs?.terminal_preview !== '${{ steps.terminal.outputs.enabled }}'
      || !qualifyEvidence.includes('scripts/desktop/stable-qualify-preview-upgrade.mjs')
      || !qualifyEvidence.includes('OPL_PREVIEW_UPGRADE_VM_RECEIPT')
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
          ? 'standard permissions must be exactly contents:write/actions:read/packages:read without packages:write'
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
