import {
  exactObject,
  failIf,
  hasStableMutationMutex,
  requestsWritePermission,
  jobRuns,
  jobEvidenceText,
  workflowJobs,
  needsExactly,
  parseWorkflow,
  reportFailure,
  requireSubstrings,
  sameJson,
} from './report.ts';
import {
  exactReadPermissions,
  stableEntrySpecs,
  isAuthorizedInlineStableFollowups,
  isAuthorizedStableWebuiWriteJob,
} from './workflow-policy.ts';
import { workflowMutationCommandPattern, retiredLiveAuthorityPattern } from './mutation-policy.ts';

export function validateStableReleaseControlPlane(appRoot: string): number {
  const id = 'stable_release_control_plane';
  const parsed = parseWorkflow(appRoot, '.github/workflows/release-stable.yml', id);
  if (!parsed) return 1;
  const { workflow, text } = parsed;
  const operationInput = workflow.on?.workflow_dispatch?.inputs?.operation;
  const expectedOperations = ['standard', 'resume_standard', 'append_full'];
  const jobs = workflowJobs(workflow);
  const authorityInputs = workflow.on?.workflow_dispatch?.inputs ?? {};

  let failures = 0;
  failures += failIf(id, !sameJson(Object.keys(workflow.on ?? {}), ['workflow_dispatch']), 'release-stable.yml must expose only workflow_dispatch');
  failures += failIf(
    id,
    operationInput?.type !== 'choice' || operationInput?.required !== true || !sameJson(operationInput?.options, expectedOperations),
    `operation choices must be exactly ${expectedOperations.join(', ')}`,
  );
  failures += failIf(id, workflow.concurrency !== undefined, 'Stable admission and qualification must not hold the public mutation mutex');
  failures += failIf(id, !exactObject(workflow.permissions, exactReadPermissions), 'top-level Stable permissions must be exactly contents:read/actions:read');
  failures += failIf(id, retiredLiveAuthorityPattern.test(text), 'Stable entry must not depend on retired broker/session/lease authority');
  failures += failIf(id, !hasStableMutationMutex(jobs['resume-standard']), 'resume-standard must acquire the public mutation mutex only around its reusable publisher');
  failures += failIf(
    id,
    authorityInputs.entry?.type !== 'choice' || authorityInputs.entry?.required !== false ||
      authorityInputs.entry?.default !== 'framework_release' ||
      !sameJson(authorityInputs.entry?.options, ['framework_release']),
    'Stable entry selector must expose only the canonical framework_release lane',
  );
  for (const name of ['authority_id', 'operation_id', 'authority_carrier', 'authority_digest']) {
    failures += failIf(
      id,
      authorityInputs[name]?.required !== false || authorityInputs[name]?.default !== '',
      `${name} must remain an optional recovery input with an empty default; Standard admission enforces it conditionally`,
    );
  }
  failures += failIf(
    id,
    !String(workflow['run-name'] ?? '').includes("inputs.operation == 'standard'") ||
      !String(workflow['run-name'] ?? '').includes("format('OPL Stable standard operation:{0} authority:{1} run:{2}'") ||
      !String(workflow['run-name'] ?? '').includes("format('OPL Stable {0} {1}', inputs.operation, github.run_id)") ||
      authorityInputs.version !== undefined,
    'Stable run identity must retain Standard authority binding while recovery operations remain follower-compatible',
  );

  const expectedJobs = [
    'protected-operation-admission', 'admission', 'stable-admission-manifest',
    'reconcile-completed-webui', 'webui-source-authority', 'webui-carrier', 'webui-promotion',
    'stable-followups', 'emit-stable-receipt', 'emit-stable-full-receipt', ...Object.keys(stableEntrySpecs),
  ].sort();
  failures += failIf(id, !sameJson(Object.keys(jobs).sort(), expectedJobs), `jobs must be exactly ${expectedJobs.join(', ')}`);
  for (const receiptJobId of ['emit-stable-receipt', 'emit-stable-full-receipt']) {
    const receiptJob = jobs[receiptJobId];
    failures += failIf(
      id,
      !receiptJob || !exactObject(receiptJob.permissions, exactReadPermissions) ||
        receiptJob.uses !== 'gaofeng21cn/opl-release/.github/workflows/reusable-emit-receipt.yml@v1' ||
        Object.prototype.hasOwnProperty.call(receiptJob, 'steps') ||
        Object.prototype.hasOwnProperty.call(receiptJob, 'secrets'),
      `${receiptJobId} must be a step-free read-only call to reusable-emit-receipt.yml@v1`,
    );
  }
  failures += failIf(
    id,
    Boolean(jobs['source-qualification']) ||
      ['uses: ./.github/workflows/release-source-qualification.yml', 'source-qualification-receipt.ts', 'validate-source-qualification-receipt.ts'].some((s) => text.includes(s)),
    'Stable entry must not retain the legacy source-qualification job or receipt after protected operation admission owns the frozen source gate.',
  );
  failures += failIf(
    id,
    !isAuthorizedInlineStableFollowups('.github/workflows/release-stable.yml', 'stable-followups', jobs['stable-followups'] ?? {}),
    'Stable followers must start after Standard publication without waiting for Docker',
  );

  const webuiSourceAuthority = jobs['webui-source-authority'];
  const webuiSourceAuthorityRun = jobRuns(webuiSourceAuthority);
  const webuiCheckpointDownload = webuiSourceAuthority?.steps?.find((step: Record<string, any>) => step.name === 'Download exact published Standard checkpoint');
  const webuiAdmissionDownload = webuiSourceAuthority?.steps?.find((step: Record<string, any>) => step.name === 'Download same-run Stable admission');
  failures += failIf(
    id,
    !webuiSourceAuthority || !needsExactly(webuiSourceAuthority, ['admission', 'stable-admission-manifest', 'standard', 'resume-standard']) ||
      webuiSourceAuthority.if !== "${{ always() && !cancelled() && needs.admission.outputs.completed_webui_run_id == '' && needs.admission.result == 'success' && ((inputs.operation == 'standard' && needs.standard.result == 'success') || (inputs.operation == 'resume_standard' && needs.resume-standard.result == 'success')) }}" ||
      !exactObject(webuiSourceAuthority.permissions, exactReadPermissions) ||
      webuiCheckpointDownload?.with?.name !== "${{ inputs.operation == 'standard' && needs.standard.outputs.source_artifact || needs.admission.outputs.source_artifact }}" ||
      webuiCheckpointDownload?.with?.['run-id'] !== "${{ inputs.operation == 'standard' && needs.standard.outputs.source_run_id || needs.admission.outputs.source_run_id }}" ||
      webuiAdmissionDownload?.if !== "${{ inputs.operation == 'standard' }}" ||
      ['--origin stable_standard', '.bundle_digest', 'test "$OPERATION" = resume_standard', 'source_cutoff_observed_at="$RESUME_SOURCE_CUTOFF_OBSERVED_AT"']
        .some((s) => !webuiSourceAuthorityRun.includes(s)) ||
      !isAuthorizedStableWebuiWriteJob('.github/workflows/release-stable.yml', 'webui-carrier', jobs['webui-carrier']) ||
      !isAuthorizedStableWebuiWriteJob('.github/workflows/release-stable.yml', 'webui-promotion', jobs['webui-promotion']),
    'Stable Standard must own one exact same-cohort Docker authority, carrier, and promotion chain',
  );
  const completedWebui = jobs['reconcile-completed-webui'];
  failures += failIf(
    id,
    !completedWebui || !needsExactly(completedWebui, ['admission', 'protected-operation-admission', 'stable-admission-manifest', 'standard', 'resume-standard']) ||
      !exactObject(completedWebui.permissions, exactReadPermissions) ||
      completedWebui.if !== "${{ always() && !cancelled() && needs.admission.outputs.completed_webui_run_id != '' && ((inputs.operation == 'standard' && needs.standard.result == 'success') || (inputs.operation == 'resume_standard' && needs.resume-standard.result == 'success')) }}",
    'Completed independent Docker recovery must be read-only and follow Standard publication',
  );

  const admission = jobs.admission;
  const admissionRun = jobRuns(admission);
  failures += failIf(
    id,
    !admission || !needsExactly(admission, ['protected-operation-admission']) ||
      admission.if !== "${{ always() && inputs.entry == 'framework_release' }}" ||
      !exactObject(admission.permissions, exactReadPermissions),
    'admission must have only contents:read/actions:read',
  );
  failures += failIf(id, workflowMutationCommandPattern.test(admissionRun), 'admission must remain mutation-free');
  failures += failIf(
    id,
    !admissionRun.includes('"opl-release-append-full-operation-checkpoint-v2-$SOURCE_RUN_ID"') ||
      admissionRun.includes('"opl-release-append-full-operation-checkpoint-$SOURCE_RUN_ID"'),
    'Stable admission must accept only the current v2 portable Full operation checkpoint for harness recovery',
  );
  failures += requireSubstrings(id, admissionRun, [
    'test "$GITHUB_RUN_ATTEMPT" = 1', 'actions/runs/$GITHUB_RUN_ID" --jq .created_at',
    'release-operation-deadline.ts resolve', '--started-at "$operation_created_at"',
    'operation_started_at="$(jq -er .started_at release-operation-admission.json)"',
    'operation_deadline_at="$(jq -er .deadline_at release-operation-admission.json)"',
  ], 'admission is missing immutable attempt/deadline binding');
  failures += failIf(id, /Date\.now\(\).*operation_started_at|operation_started_at=.*date/i.test(admissionRun), 'operation start must come from immutable Actions created_at');
  failures += failIf(
    id,
    !admissionRun.includes('if [ "$OPERATION" = standard ] || [ "$OPERATION" = resume_standard ] || [ "$OPERATION" = append_full ]; then'),
    'standard, bounded resume_standard, and append_full operations must resolve their controller window from Actions created_at',
  );

  const protectedAdmission = jobs['protected-operation-admission'];
  const protectedAdmissionRun = jobRuns(protectedAdmission);
  const protectedAdmissionEvidence = jobEvidenceText(protectedAdmission);
  failures += failIf(
    id,
    !protectedAdmission || protectedAdmission.if !== "${{ inputs.entry == 'framework_release' && inputs.operation == 'standard' }}" ||
      Object.prototype.hasOwnProperty.call(protectedAdmission, 'needs') ||
      protectedAdmission.environment !== 'release-stable' || !exactObject(protectedAdmission.permissions, exactReadPermissions),
    'protected-operation-admission must be the initial read-only protected Standard gate',
  );
  failures += failIf(id, workflowMutationCommandPattern.test(protectedAdmissionRun), 'protected-operation-admission must not perform release or public mutation');
  failures += requireSubstrings(id, protectedAdmissionEvidence, [
    'Reject bare or rerun Stable request before expensive work', 'test "$GITHUB_EVENT_NAME" = workflow_dispatch',
    'test -n "$AUTHORITY_ID"', 'test -n "$OPERATION_ID"', 'test -n "$AUTHORITY_CARRIER"',
    '[[ "$AUTHORITY_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]', 'stable-operation-control.ts decode-carrier',
    'stable-operation-control.ts materialize-evidence', 'stable-operation-control.ts verify-executor',
    'stable-operation-control.ts verify-authority', '--app-root app-executor --expected-actor "$GITHUB_ACTOR"',
    'Checkout frozen App authority cohort', 'release-dispatch-guard.ts verify-evidence',
    'release-dispatch-guard.ts preflight', '--current-run-id "$GITHUB_RUN_ID"', '--authority-id',
    'stable-operation-control.ts bind', 'stable-operation-control.ts verify',
    'Upload immutable operation control evidence', 'opl-stable-operation-control-${{ github.run_id }}',
  ], 'protected-operation-admission is missing immutable authority binding');
  failures += failIf(
    id,
    protectedAdmissionRun.includes('node --experimental-strip-types app-source/scripts/validate-release-source-gate.ts') ||
      (protectedAdmissionRun.match(/release-dispatch-guard\.ts verify-evidence/g) ?? []).length !== 1 ||
      (protectedAdmissionRun.match(/release-dispatch-guard\.ts preflight/g) ?? []).length !== 1,
    'protected-operation-admission must verify the frozen pre-submit evidence once and create exactly one distinct run-authority reconcile without rerunning the full source gate.',
  );
  failures += failIf(
    id,
    /openssl rand|operation_id="stable-\$\{?GITHUB_RUN_ID\}?"|stable-operation-control\.ts create(?:\s|$)/.test(protectedAdmissionRun),
    'protected-operation-admission must not self-issue an authority, nonce, or operation id',
  );
  failures += failIf(id, /\$\{\{\s*inputs\./.test(protectedAdmissionRun), 'protected-operation-admission must consume dispatch strings through quoted environment variables');

  const protectedOutputs = protectedAdmission?.outputs ?? {};
  for (const [name, expected] of Object.entries({
    app_ref: '${{ steps.control.outputs.app_ref }}',
    shell_ref: '${{ steps.control.outputs.shell_ref }}',
    framework_ref: '${{ steps.control.outputs.framework_ref }}',
    operation_id: '${{ steps.control.outputs.operation_id }}',
    control_digest: '${{ steps.control.outputs.control_digest }}',
    authority_id: '${{ steps.authority.outputs.authority_id }}',
  })) {
    failures += failIf(id, protectedOutputs[name] !== expected, `protected-operation-admission must bind ${name} to the decoded authority control`);
  }

  const stableManifest = jobs['stable-admission-manifest'];
  const stableManifestRun = jobRuns(stableManifest);
  failures += failIf(
    id,
    !stableManifest || stableManifest.if !== "${{ needs.admission.outputs.operation == 'standard' }}" ||
      !needsExactly(stableManifest, ['admission', 'protected-operation-admission']) ||
      stableManifest.environment !== 'release-stable' || !exactObject(stableManifest.permissions, exactReadPermissions),
    'stable-admission-manifest must be a protected post-source-gate identity seal',
  );
  for (const binding of [
    'scripts/verify-apple-release-credentials.ts', 'scripts/stable-operation-control.ts verify',
    '--run-authority-reconcile', 'scripts/stable-release-admission-manifest.ts create',
    '--admission-run-id "$GITHUB_RUN_ID"', 'opl-stable-admission-${{ github.run_id }}',
  ]) {
    failures += failIf(id, !stableManifestRun.includes(binding) && !text.includes(binding), `stable-admission-manifest is missing protected binding ${binding}`);
  }
  failures += validateStableOperationControlArtifactConsumer(appRoot);

  for (const [jobId, spec] of Object.entries(stableEntrySpecs)) {
    const job = jobs[jobId];
    if (!job) continue;
    failures += failIf(id, !needsExactly(job, [...spec.needs]) || job.if !== spec.if, `${jobId} must be selected only by the admitted ${spec.operation} operation`);
    failures += failIf(id, job.uses !== spec.workflow || Object.prototype.hasOwnProperty.call(job, 'steps'), `${jobId} must be a step-free call to ${spec.workflow}`);
    failures += failIf(
      id,
      !exactObject(job.permissions, spec.permissions),
      jobId === 'standard'
        ? 'standard permissions must be exactly contents:write/actions:read/packages:read without packages:write'
        : `${jobId} permissions must be exactly contents:write/actions:read without packages:write`,
    );
    failures += failIf(id, job.secrets !== 'inherit', `${jobId} must pass release secrets only through the reusable boundary`);
    const withInputs = job.with && typeof job.with === 'object' ? job.with as Record<string, unknown> : {};
    for (const [name, expected] of Object.entries(spec.requiredInputs)) {
      failures += failIf(id, withInputs[name] !== expected, `${jobId} must bind ${name} to the admitted value`);
    }
    failures += failIf(id, Object.keys(withInputs).some((name) => retiredLiveAuthorityPattern.test(name)), `${jobId} must not forward broker/session/lease inputs`);
  }
  return failures;
}

function validateStableOperationControlArtifactConsumer(appRoot: string): number {
  const id = 'stable_operation_control_artifact_consumer';
  const parsed = parseWorkflow(appRoot, '.github/workflows/_release-bundle.yml', id);
  if (!parsed) return 1;
  let failures = requireSubstrings(id, parsed.text, [
    'stable_operation_control_artifact:', 'stable_operation_control_digest:',
    'Download protected Stable operation control', 'Consume one protected Stable operation control before cold work',
    'stable-operation-control.ts consume', 'opl-stable-operation-consumption-${{ github.run_id }}',
    'Require one matching consumed Stable operation control', '--input "$consumption"',
  ], 'Stable Bundle is missing durable control consumption');
  failures += failIf(
    id,
    ['validate-release-source-gate.ts', 'release-dispatch-guard.ts preflight', 'release-source-qualification.yml'].some((s) => parsed.text.includes(s)),
    'Stable Bundle must consume the protected control artifact and must not rerun source-gate, pre-nonce guard, or source qualification.',
  );
  return failures;
}
