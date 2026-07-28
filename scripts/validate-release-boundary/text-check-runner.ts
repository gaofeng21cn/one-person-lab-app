import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { releaseBoundaryChecks, releaseWorkflowPaths } from './release-checks.ts';

const workflowMutationCommandPattern = /gh\s+api\s+--method\s+(?:POST|PATCH|PUT|DELETE)|gh\s+workflow\s+run|gh\s+run\s+(?:cancel|rerun)|gh\s+release\s+(?:create|edit|upload|delete)|git\b[^\n]*\s(?:push|tag)\b|\bopl\s+release\s+(?:freeze|operation\s+admit|build|verify|publish|reconcile)\b|publish-(?:release|full-addon)\.ts|cleanup-draft-release-candidates\.ts|curl\b[^\n]*(?:--request|-X)\s*(?:POST|PATCH|PUT|DELETE)/;
const retiredLiveAuthorityPattern = /release[_ -]broker|verify-release-broker|verify-release-session-lease|release_attempt_id|release_mutation_payload_sha256|pre_api_admission_receipt_base64|release[_ -]session[_ -]lease/i;
const exactReadPermissions = { contents: 'read', actions: 'read' } as const;
const exactStableEntryPermissions = { contents: 'write', actions: 'read' } as const;
const exactWebUiReadPermissions = { contents: 'read', actions: 'read', packages: 'read' } as const;
const exactWebUiCompileCeilingPermissions = {
  contents: 'read',
  actions: 'read',
  packages: 'write',
} as const;
const exactStableStandardPermissions = { contents: 'write', actions: 'read' } as const;
const exactWebUiPublishPermissions = { contents: 'read', packages: 'write' } as const;
const manualPreviewWorkflowPath = '.github/workflows/release-manual-preview.yml';
const manualFullPreviewWorkflowPath = '.github/workflows/release-manual-full-preview.yml';
const manualFullPreviewMutationJob = 'mutate';
const webuiStablePromotionWorkflowPath = '.github/workflows/release-webui-stable.yml';
const webuiStablePromotionMutationJob = 'promote-webui-stable';
const webuiCarrierPublishEnvironment =
  "${{ inputs.authority_mode == 'independent_preview' && 'release-preview-publication' || 'release-stable' }}";
const webuiPromotionPublishEnvironment =
  "${{ needs.admission.outputs.authority_mode == 'independent_preview' && 'release-preview-publication' || 'release-stable' }}";
const webuiDevelopmentWorkflowPath = '.github/workflows/release-webui-development.yml';
const webuiDevelopmentPromotionWorkflowPath =
  '.github/workflows/release-webui-development-promote.yml';
const nativeWebuiFollowerWorkflowPath = '.github/workflows/release-native-webui-follower.yml';
const nativeWebuiCarrierWorkflowPath = '.github/workflows/_release-native-webui-carrier.yml';
const homebrewFullFollowerWorkflowPath = '.github/workflows/release-homebrew-full-follower.yml';
const homebrewFullPublisherWorkflowPath = '.github/workflows/_release-homebrew-full-publish.yml';
const postPublicationOptionalCertificationWorkflowPath =
  '.github/workflows/release-post-publication-certification.yml';
const nightlyReleaseWorkflowPath = '.github/workflows/release-nightly.yml';
const nightlyHomebrewFollowerWorkflowPath =
  '.github/workflows/release-nightly-homebrew-follower.yml';
const nightlySampledVmWorkflowPath = '.github/workflows/release-nightly-sampled-vm.yml';
const previewLatestPointerWorkflowPath =
  '.github/workflows/_release-preview-latest-pointer.yml';
const exactWebuiStablePromotionPermissions = {
  actions: 'read',
  contents: 'read',
  packages: 'write',
} as const;

export const stableReleaseActionPaths = [...new Set([
  '.github/actions/setup-active-shell-deps/action.yml',
  '.github/workflows/opl-updater-upgrade-vm.yml',
  '.github/workflows/release-attempt-observability.yml',
  postPublicationOptionalCertificationWorkflowPath,
  '.github/workflows/release-source-qualification.yml',
  ...releaseWorkflowPaths,
])];

function exactObject(value: unknown, expected: Record<string, unknown>): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  return Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([name, expectedValue]) => actual[name] === expectedValue);
}

function requestsWritePermission(value: unknown): boolean {
  if (value === 'write-all') return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).some((permission) => permission === 'write');
}

type PermissionLevel = 'none' | 'read' | 'write';

function permissionLevel(value: unknown, name: string): PermissionLevel {
  if (value === 'read-all') return 'read';
  if (value === 'write-all') return 'write';
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'none';
  const level = (value as Record<string, unknown>)[name];
  return level === 'read' || level === 'write' ? level : 'none';
}

function intersectPermission(
  caller: unknown,
  callee: unknown,
  name: string,
): PermissionLevel {
  const levels: PermissionLevel[] = ['none', 'read', 'write'];
  const callerLevel = permissionLevel(caller, name);
  const calleeLevel = callee === undefined ? callerLevel : permissionLevel(callee, name);
  return levels[Math.min(levels.indexOf(callerLevel), levels.indexOf(calleeLevel))];
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
    && exactObject(job.permissions, exactWebuiStablePromotionPermissions);
}

function isAuthorizedNativeWebuiWriteJob(
  workflowPath: string,
  jobId: string,
  job: Record<string, any>,
): boolean {
  if (
    workflowPath === nativeWebuiFollowerWorkflowPath
    && jobId === 'native-webui-carrier'
  ) {
    return job.uses === './.github/workflows/_release-native-webui-carrier.yml'
      && needsExactly(job, ['resolve-handoff'])
      && exactObject(job.permissions, exactReadPermissions)
      && job.with?.mode === 'readback';
  }
  return false;
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
      && job.with?.mode === 'execute'
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
        '${{ needs.admission.outputs.operation_deadline_at }}';
  }
  return jobId === 'resume-preview'
    && job.if === "${{ needs.admission.outputs.operation == 'resume_preview' }}"
    && job.uses === './.github/workflows/_release-standard-publish.yml'
    && job.with?.mode === 'execute'
    && job.with?.operation === 'resume_standard'
    && job.with?.publication_channel === 'preview';
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

function parseWorkflow(appRoot: string, relativePath: string, id: string): {
  workflow: Record<string, any>;
  text: string;
} | null {
  const absolutePath = path.join(appRoot, relativePath);
  try {
    const text = fs.readFileSync(absolutePath, 'utf8');
    return { workflow: parseYaml(text) as Record<string, any>, text };
  } catch (error) {
    reportFailure(id, `${relativePath} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

const stableEntrySpecs = {
  standard: {
    operation: 'standard',
    workflow: './.github/workflows/_release-bundle.yml',
    if: "${{ needs.admission.outputs.operation == 'standard' }}",
    needs: ['admission', 'protected-operation-admission', 'stable-admission-manifest'],
    requiredInputs: {
      mode: 'execute',
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
    if: "${{ needs.admission.outputs.operation == 'resume_standard' }}",
    needs: ['admission'],
    requiredInputs: {
      mode: 'execute',
      operation: 'resume_standard',
      source_run_id: '${{ needs.admission.outputs.source_run_id }}',
      source_artifact: '${{ needs.admission.outputs.source_artifact }}',
    },
    permissions: exactStableEntryPermissions,
  },
  'append-full': {
    operation: 'append_full',
    workflow: './.github/workflows/_release-full-addon.yml',
    if: "${{ !cancelled() && inputs.operation == 'append_full' && needs.admission.result == 'success' }}",
    needs: ['admission'],
    requiredInputs: {
      mode: 'execute',
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
  if (workflow.concurrency?.group !== 'opl-release-bundle-global' ||
      workflow.concurrency?.['cancel-in-progress'] !== false) {
    failures += reportFailure(id, 'all Stable operations must share fixed concurrency with cancel-in-progress=false');
  }
  if (!exactObject(workflow.permissions, exactReadPermissions)) {
    failures += reportFailure(id, 'top-level Stable permissions must be exactly contents:read/actions:read');
  }
  if (retiredLiveAuthorityPattern.test(text)) {
    failures += reportFailure(id, 'Stable entry must not depend on retired broker/session/lease authority');
  }

  const jobs = workflowJobs(workflow);
  const authorityInputs = workflow.on?.workflow_dispatch?.inputs ?? {};
  for (const name of ['authority_id', 'operation_id', 'authority_carrier', 'authority_digest']) {
    if (authorityInputs[name]?.required !== false || authorityInputs[name]?.default !== '') {
      failures += reportFailure(
        id,
        `${name} must remain an optional recovery input with an empty default; Standard admission enforces it conditionally`,
      );
    }
  }
  if (
    !String(workflow['run-name'] ?? '').includes("inputs.operation == 'standard'")
    || !String(workflow['run-name'] ?? '').includes("format('OPL Stable standard operation:{0} authority:{1} run:{2}'")
    || !String(workflow['run-name'] ?? '').includes("format('OPL Stable {0} {1}', inputs.operation, github.run_id)")
    || authorityInputs.version?.required !== false
  ) {
    failures += reportFailure(id, 'Stable run identity must retain Standard authority binding while recovery operations remain follower-compatible');
  }

  const expectedJobs = [
    'protected-operation-admission',
    'admission',
    'stable-admission-manifest',
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
  const admission = jobs.admission;
  const admissionRun = jobRuns(admission);
  if (
    !admission
    || !needsExactly(admission, ['protected-operation-admission'])
    || admission.if !== '${{ always() }}'
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
  if (!admissionRun.includes('if [ "$OPERATION" = standard ] || [ "$OPERATION" = append_full ]; then')) {
    failures += reportFailure(id, 'only new standard and append_full operations may resolve a fresh operation window');
  }

  const protectedAdmission = jobs['protected-operation-admission'];
  const protectedAdmissionRun = jobRuns(protectedAdmission);
  const protectedAdmissionEvidence = jobEvidenceText(protectedAdmission);
  if (
    !protectedAdmission
    || protectedAdmission.if !== "${{ inputs.operation == 'standard' }}"
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
    'git -C app-source checkout --detach "$app_sha"',
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
    if (jobId === 'resume-standard' && (
      Object.prototype.hasOwnProperty.call(withInputs, 'operation_started_at')
      || Object.prototype.hasOwnProperty.call(withInputs, 'operation_deadline_at')
    )) {
      failures += reportFailure(id, 'resume-standard must inherit the exact Standard control from its checkpoint');
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
  const webui = parseWorkflow(appRoot, '.github/workflows/_release-webui-carrier.yml', id);
  const webuiFollower = parseWorkflow(appRoot, '.github/workflows/release-webui-follower.yml', id);
  const webuiStable = parseWorkflow(appRoot, '.github/workflows/release-webui-stable.yml', id);
  if (!bundle || !standard || !full || !optionalCertification || !optionalCertificationVm || !webui || !webuiFollower || !webuiStable) {
    return [bundle, standard, full, optionalCertification, optionalCertificationVm, webui, webuiFollower, webuiStable]
      .filter((value) => !value).length;
  }
  let failures = 0;

  for (const [name, parsed] of Object.entries({ bundle, standard, full })) {
    if (JSON.stringify(Object.keys(parsed.workflow.on ?? {})) !== JSON.stringify(['workflow_call'])) {
      failures += reportFailure(id, `${name} workflow must expose only workflow_call`);
    }
    if (retiredLiveAuthorityPattern.test(parsed.text)) {
      failures += reportFailure(id, `${name} workflow still depends on retired broker/session/lease authority`);
    }
    if (parsed.workflow.on?.workflow_call?.inputs?.mode?.default !== 'execute') {
      failures += reportFailure(id, `${name} workflow must expose an explicit execute/canary mode boundary`);
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
    'startup-canary',
    'admission',
    'freeze',
    'standard-build',
    'seal-standard-identity',
    'checkpoint-standard',
    'prepare-native-webui',
    'publish-standard',
  ])) {
    failures += reportFailure(id, 'Bundle jobs must contain Standard publication plus pre-publication Native qualification');
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
  if (
    bundleJobs['standard-qualification']
    || /\bopl\s+release\s+verify\b/.test(jobRuns(bundleJobs['checkpoint-standard']))
  ) {
    failures += reportFailure(
      id,
      'Bundle publication must consume sealed identity without reintroducing the retired inline VM gate',
    );
  }
  failures += validateReusableCall(
    id,
    bundleJobs,
    'publish-standard',
    './.github/workflows/_release-standard-publish.yml',
  );
  failures += validateReusableCall(
    id,
    bundleJobs,
    'prepare-native-webui',
    './.github/workflows/_release-native-webui-carrier.yml',
    exactReadPermissions,
  );
  if (
    !needsExactly(bundleJobs['prepare-native-webui'], ['freeze'])
    || !needsExactly(bundleJobs['checkpoint-standard'], [
      'admission',
      'freeze',
      'seal-standard-identity',
      'prepare-native-webui',
    ])
    || !needsExactly(bundleJobs['publish-standard'], [
      'freeze',
      'checkpoint-standard',
      'prepare-native-webui',
    ])
    || bundleJobs['publish-standard']?.with?.qualified_native_artifact_name !==
      "${{ (inputs.publication_channel || inputs.channel) == 'stable' && needs.prepare-native-webui.outputs.qualified_artifact_name || '' }}"
    || bundleJobs['publish-standard']?.with?.qualified_native_source_run_id !==
      "${{ (inputs.publication_channel || inputs.channel) == 'stable' && github.run_id || '' }}"
  ) {
    failures += reportFailure(id, 'Native preparation must complete before the unified Standard draft carrier publishes');
  }
  if (/\bopl\s+release\s+(?:publish|reconcile|status)\b/.test(bundle.text)) {
    failures += reportFailure(id, '_release-bundle.yml must delegate publish/reconcile/status to Standard publish');
  }
  const followerTriggers = webuiFollower.workflow.on ?? {};
  const followerJobs = workflowJobs(webuiFollower.workflow);
  if (JSON.stringify(Object.keys(followerTriggers)) !== JSON.stringify(['workflow_run']) ||
      JSON.stringify(followerTriggers.workflow_run?.workflows) !==
        JSON.stringify(['OPL Stable Release Bundle']) ||
      JSON.stringify(followerTriggers.workflow_run?.types) !== JSON.stringify(['completed']) ||
      Object.prototype.hasOwnProperty.call(followerTriggers, 'workflow_dispatch') ||
      !exactObject(webuiFollower.workflow.permissions, exactReadPermissions) ||
      JSON.stringify(Object.keys(followerJobs)) !==
        JSON.stringify(['resolve-handoff', 'webui-carrier', 'promote-webui-stable'])) {
    failures += reportFailure(id, 'WebUI follower must be an automatic, read-default workflow_run lane');
  }
  const followerCarrier = followerJobs['webui-carrier'];
  const followerPromotion = followerJobs['promote-webui-stable'];
  if (!followerCarrier ||
      followerCarrier.uses !== './.github/workflows/_release-webui-carrier.yml' ||
      !needsExactly(followerCarrier, ['resolve-handoff']) ||
      !exactObject(followerCarrier.permissions, exactWebUiCompileCeilingPermissions) ||
      followerCarrier.with?.mode !== 'execute') {
    failures += reportFailure(id, 'WebUI follower carrier must consume only the resolved exact handoff');
  }
  if (!followerPromotion ||
      followerPromotion.uses !== './.github/workflows/release-webui-stable.yml' ||
      !needsExactly(followerPromotion, ['resolve-handoff', 'webui-carrier']) ||
      !exactObject(followerPromotion.permissions, exactWebUiCompileCeilingPermissions) ||
      followerPromotion.with?.mode !== 'execute' ||
      followerPromotion.with?.stable_authority_run_id !==
        '${{ needs.resolve-handoff.outputs.stable_authority_run_id }}' ||
      followerPromotion.with?.carrier_artifact_name !==
        '${{ needs.webui-carrier.outputs.carrier_artifact_name }}' ||
      Object.keys(followerPromotion.with ?? {}).length !== 3) {
    failures += reportFailure(
      id,
      'WebUI promotion must bind the triggering Stable authority and current-run carrier artifact',
    );
  }
  if (/continue-on-error/.test(webuiFollower.text)) {
    failures += reportFailure(id, 'WebUI follower failures must remain visible on the independent follower run');
  }
  failures += validateWebUiCarrierCallee(
    id,
    webui.workflow,
    followerCarrier?.permissions ?? exactWebUiCompileCeilingPermissions,
  );
  const stableInputs = webuiStable.workflow.on?.workflow_call?.inputs ?? {};
  if (JSON.stringify(Object.keys(stableInputs)) !== JSON.stringify([
    'mode',
    'authority_mode',
    'stable_authority_run_id',
    'carrier_follower_run_id',
    'carrier_executor_ref',
    'carrier_artifact_name',
  ])) {
    failures += reportFailure(id, 'WebUI Stable reusable must accept only exact follower identities');
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
    'publish-homebrew-standard',
    'homebrew-standard-readback',
    'activate-latest',
  ]) {
    if (!standardJobs[jobId]) failures += reportFailure(id, `_release-standard-publish.yml is missing ${jobId}`);
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
      fullQualification['runs-on'] !== 'macos-14'
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
  const checkpointFullRuns = jobRuns(fullJobs['checkpoint-full']);
  if (
    !checkpointFullRuns.includes('--hosted-core-qualification "$hosted_receipt"')
    || checkpointFullRuns.includes('--legacy-qualification')
  ) {
    failures += reportFailure(
      id,
      'checkpoint-full must consume only the exact hosted Full core qualification receipt',
    );
  }
  if (fullJobs['publish-full'] && fullJobs['publish-full'].environment !== 'release-stable') {
    failures += reportFailure(id, 'publish-full must use the release-stable environment');
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

  const certificationTriggers = optionalCertification.workflow.on ?? {};
  const certificationJobs = workflowJobs(optionalCertification.workflow);
  const expectedCertificationJobs = [
    'resolve-standard',
    'admit-standard-vm',
    'certify-standard-vm',
    'write-standard-receipts',
    'resolve-full',
    'admit-full-vm',
    'certify-full-vm',
    'write-full-receipt',
  ];
  if (
    JSON.stringify(Object.keys(certificationTriggers)) !== JSON.stringify(['workflow_run'])
    || JSON.stringify(certificationTriggers.workflow_run?.workflows) !==
      JSON.stringify(['OPL Stable Release Bundle'])
    || JSON.stringify(certificationTriggers.workflow_run?.types) !== JSON.stringify(['completed'])
    || !exactObject(optionalCertification.workflow.permissions, exactReadPermissions)
    || JSON.stringify(Object.keys(certificationJobs)) !== JSON.stringify(expectedCertificationJobs)
  ) {
    failures += reportFailure(
      id,
      'post-publication certification must be one read-only automatic Stable workflow_run follower',
    );
  }
  if (
    certificationJobs['resolve-standard']?.needs !== undefined
    || certificationJobs['resolve-full']?.needs !== undefined
    || !certificationJobs['admit-standard-vm']
    || !needsExactly(certificationJobs['admit-standard-vm'], ['resolve-standard'])
    || !certificationJobs['certify-standard-vm']
    || !needsExactly(certificationJobs['certify-standard-vm'], ['resolve-standard', 'admit-standard-vm'])
    || !certificationJobs['write-standard-receipts']
    || !needsExactly(certificationJobs['write-standard-receipts'], [
      'resolve-standard',
      'admit-standard-vm',
      'certify-standard-vm',
    ])
    || !certificationJobs['admit-full-vm']
    || !needsExactly(certificationJobs['admit-full-vm'], ['resolve-full'])
    || !certificationJobs['certify-full-vm']
    || !needsExactly(certificationJobs['certify-full-vm'], ['resolve-full', 'admit-full-vm'])
    || !certificationJobs['write-full-receipt']
    || !needsExactly(certificationJobs['write-full-receipt'], [
      'resolve-full',
      'admit-full-vm',
      'certify-full-vm',
    ])
  ) {
    failures += reportFailure(
      id,
      'optional certification identity resolution must not depend on the Stable or Full publication DAG',
    );
  }
  for (const jobId of [
    'resolve-standard',
    'admit-standard-vm',
    'write-standard-receipts',
    'resolve-full',
    'admit-full-vm',
    'write-full-receipt',
  ]) {
    const job = certificationJobs[jobId];
    if (!job || !exactObject(job.permissions, exactReadPermissions) || job['runs-on'] !== 'ubuntu-latest') {
      failures += reportFailure(id, `optional certification job ${jobId} must be GitHub-hosted and read-only`);
    }
  }
  for (const profile of ['standard', 'full']) {
    const jobId = `certify-${profile}-vm`;
    const job = certificationJobs[jobId];
    if (
      !job
      || job.uses !== './.github/workflows/opl-first-run-vm.yml'
      || Object.prototype.hasOwnProperty.call(job, 'steps')
      || Object.prototype.hasOwnProperty.call(job, 'runs-on')
      || !exactObject(job.permissions, exactReadPermissions)
    ) {
      failures += reportFailure(
        id,
        `optional certification job ${jobId} must be one step-free read-only reusable VM call`,
      );
      continue;
    }
    const expectedInputs = {
      mode: 'execute',
      release_tag: `\${{ needs.resolve-${profile}.outputs.tag }}`,
      published_artifact_name: `\${{ needs.resolve-${profile}.outputs.artifact_name }}`,
      published_artifact_digest: `\${{ needs.resolve-${profile}.outputs.artifact_digest }}`,
      artifact_app_ref: `\${{ needs.resolve-${profile}.outputs.app_sha }}`,
      shell_ref: `\${{ needs.resolve-${profile}.outputs.shell_sha }}`,
      smoke_harness_ref: `\${{ needs.resolve-${profile}.outputs.shell_sha }}`,
      framework_ref: `\${{ needs.resolve-${profile}.outputs.framework_sha }}`,
      package_profile: profile,
      diagnostic_scope: 'post_publication_optional_certification',
      require_macos_gatekeeper: true,
    };
    if (!exactObject(job.with, expectedInputs)) {
      failures += reportFailure(
        id,
        `${jobId} must bind the exact published ${profile} DMG and immutable cohort to optional VM certification`,
      );
    }
  }
  for (const required of [
    '.path == ".github/workflows/release-stable.yml"',
    'opl-release-activation-${SOURCE_RUN_ID}',
    'opl-release-full-published-${SOURCE_RUN_ID}',
    'write-optional-certification-receipt.ts',
    'RUNNER_INVENTORY_TOKEN: ${{ secrets.OPL_RUNNER_INVENTORY_TOKEN || github.token }}',
    'GH_TOKEN="$RUNNER_INVENTORY_TOKEN" gh api',
    'actions/runners?per_page=100',
    "runner.status === 'online' && runner.busy === false",
    'published_artifact_name',
    'published_artifact_digest',
    'post_publication_optional_certification',
    'status=unavailable',
    'capability_admission_failed',
    'VM_CLASSIFICATION_VALID',
    'VM_ARTIFACT_VERIFIED',
    'VM_JOB_STARTED',
    'VM_EXECUTION_STARTED',
    "needs.admit-standard-vm.result == 'success'",
    "needs.admit-full-vm.result == 'success'",
    '--status not_run',
    '--reason-code not_requested',
    'physical_job_dispatched:$dispatched',
    'component_manifest_digest',
    'public-component-manifest.json',
    'Download exact Standard VM evidence',
    'opl-first-run-vm-standard-${{ github.run_id }}',
    'Download exact Full VM evidence',
    'opl-first-run-vm-full-${{ github.run_id }}',
    'published-artifact-identity.json',
    'post-publication-capability-admission.json',
    'post-publication-execution-start.json',
    'tart-smoke-summary.json',
    'settings-runtime-refresh-verification.json',
    'installed-framework-source-identity.json',
    'full-runtime-source-identity.json',
    'opl_framework_installed_source_identity.v1',
    'opl_full_runtime_source_identity.v1',
    'source == "packaged_app_resource"',
  ]) {
    if (!optionalCertification.text.includes(required)) {
      failures += reportFailure(id, `post-publication certification follower is missing ${required}`);
    }
  }
  if (
    /workflow_dispatch:|contents: write|packages: write|gh workflow run|gh run (?:rerun|cancel)|gh release (?:create|edit|upload|delete)|opl release (?:build|publish|reconcile)|codesign|notarize/.test(
      optionalCertification.text,
    )
  ) {
    failures += reportFailure(
      id,
      'post-publication certification follower must not dispatch, rebuild, sign, publish, or mutate public state',
    );
  }
  for (const forbidden of [
    '${VM_REASON_CODE:-capability_admission_failed}',
    '${VM_ADMISSION_REASON:-operator_deferred}',
    'standard-vm-evidence.json',
    'full-vm-evidence.json',
  ]) {
    if (optionalCertification.text.includes(forbidden)) {
      failures += reportFailure(id, `post-publication certification follower must not fabricate ${forbidden}`);
    }
  }
  for (const required of [
    'published_artifact_name',
    'published_artifact_digest',
    'post_publication_status',
    'post_publication_reason_code',
    'published_artifact_verified',
    'post_publication_job_started',
    'post_publication_execution_started',
    'post_publication_classification_valid',
    'post-publication certification must consume public release bytes, not an Actions artifact',
    'Verify exact published DMG identity before install',
    'PUBLISHED_ARTIFACT_NAME: ${{ inputs.published_artifact_name }}',
    'download_pattern="$PUBLISHED_ARTIFACT_NAME"',
    'published_artifact_name must be the canonical exact DMG basename for release_tag and package_profile',
    'Admit exact Tart capability for post-publication certification',
    'Mark post-publication certification execution started',
    'keys == ["reason_code","schema","source_vm","status"]',
    '.source_vm == $source_vm',
    '.framework_source_archive == null',
    'clone_vm|configure_display|start_vm|wait_for_ip|wait_for_ssh',
    'run_guest_smoke|validate_guest_summary',
    'actual_digest="sha256:$(shasum -a 256 "$dmg_path"',
    "diagnostic_scope != 'post_publication_optional_certification'",
  ]) {
    if (!optionalCertificationVm.text.includes(required)) {
      failures += reportFailure(id, `optional certification VM path is missing ${required}`);
    }
  }
  if (optionalCertificationVm.text.includes("download_pattern='${{ inputs.published_artifact_name }}'")) {
    failures += reportFailure(id, 'optional certification VM must pass published artifact names through step env');
  }

  const homebrewStandardRuns = jobRuns(standardJobs['publish-homebrew-standard']);
  for (const required of [
    'opl_homebrew_tap_cas_plan.v1',
    'inspect_only',
    'expected-current-cask-sha256',
    'idempotent_concurrent',
    'new_release_revision_required',
    'push_exit_status',
    'homebrew_remote_target',
    'active_unknown_markers',
    'prior-attempt-id',
    'publication-scope external_target',
    'opl release status',
    'opl release reconcile',
    'homebrew-unknown-checkpoint',
  ]) {
    if (!homebrewStandardRuns.includes(required)) {
      failures += reportFailure(id, `Standard Homebrew CAS is missing ${required}`);
    }
  }
  if ((homebrewStandardRuns.match(/git -C tap-source push --no-force/g) ?? []).length !== 1) {
    failures += reportFailure(id, 'Standard Homebrew must have exactly one non-force push call');
  }
  if (/for attempt in 1 2 3|three read-only reconciliations/.test(homebrewStandardRuns)) {
    failures += reportFailure(id, 'Standard Homebrew must defer unknown outcomes to one Framework marker/status/exact-reconcile path, not an App-local three-pass state machine');
  }
  return failures;
}

export function validateNativeWebuiPublicationTopology(appRoot: string): number {
  const id = 'native_webui_publication_topology';
  const follower = parseWorkflow(appRoot, nativeWebuiFollowerWorkflowPath, id);
  const carrier = parseWorkflow(appRoot, nativeWebuiCarrierWorkflowPath, id);
  if (!follower || !carrier) return [follower, carrier].filter((value) => !value).length;
  let failures = 0;
  const followerTriggers = follower.workflow.on ?? {};
  const followerJobs = workflowJobs(follower.workflow);
  if (
    JSON.stringify(Object.keys(followerTriggers)) !== JSON.stringify(['workflow_run'])
    || JSON.stringify(followerTriggers.workflow_run?.workflows) !== JSON.stringify(['OPL Stable Release Bundle'])
    || JSON.stringify(followerTriggers.workflow_run?.types) !== JSON.stringify(['completed'])
    || !exactObject(follower.workflow.permissions, exactReadPermissions)
    || JSON.stringify(Object.keys(followerJobs)) !== JSON.stringify(['resolve-handoff', 'native-webui-carrier'])
  ) {
    failures += reportFailure(id, 'Native WebUI follower must be one automatic read-default Stable workflow_run lane');
  }
  const followerCarrier = followerJobs['native-webui-carrier'];
  if (!followerCarrier || !isAuthorizedNativeWebuiWriteJob(
    nativeWebuiFollowerWorkflowPath,
    'native-webui-carrier',
    followerCarrier,
  )) {
    failures += reportFailure(id, 'Native WebUI follower must delegate only the exact resolved handoff to its reusable carrier');
  }
  for (const required of [
    '.path == ".github/workflows/release-stable.yml"',
    'opl-release-activation-${STABLE_AUTHORITY_RUN_ID}',
    'webui-follower-handoff.json',
    'opl_standard_latest_admission_receipt.v1',
    'framework_terminal_status == "complete"',
  ]) {
    if (!follower.text.includes(required)) failures += reportFailure(id, `Native follower is missing ${required}`);
  }
  if (/workflow_dispatch:|continue-on-error|packages: write|release-webui-stable\.yml|_release-webui-carrier\.yml/.test(follower.text)) {
    failures += reportFailure(id, 'Native follower must not expose manual, GHCR, or hidden failure paths');
  }

  const carrierInputs = carrier.workflow.on?.workflow_call?.inputs ?? {};
  const carrierJobs = workflowJobs(carrier.workflow);
  if (
    JSON.stringify(Object.keys(carrier.workflow.on ?? {})) !== JSON.stringify(['workflow_call'])
    || JSON.stringify(Object.keys(carrierInputs)) !== JSON.stringify([
      'mode',
      'stable_authority_run_id',
      'app_ref',
      'shell_ref',
      'framework_ref',
      'opl_version',
      'release_bundle_digest',
      'source_run_id',
      'source_artifact',
      'standard_identity_sha256',
      'qualified_artifact_name',
      'publication_artifact_name',
    ])
    || carrier.workflow.permissions !== undefined
    || JSON.stringify(Object.keys(carrierJobs)) !== JSON.stringify([
      'startup-canary',
      'build-and-qualify',
      'readback-native-assets',
    ])
  ) {
    failures += reportFailure(id, 'Native reusable must expose only exact cohort/checkpoint inputs and startup/prepare/readback jobs');
  }
  const startup = carrierJobs['startup-canary'];
  const build = carrierJobs['build-and-qualify'];
  const readback = carrierJobs['readback-native-assets'];
  if (
    !startup
    || startup.if !== "${{ inputs.mode == 'canary' }}"
    || !exactObject(startup.permissions, exactReadPermissions)
    || !build
    || build.if !== "${{ inputs.mode == 'prepare' }}"
    || !exactObject(build.permissions, exactReadPermissions)
    || build['continue-on-error'] !== true
    || !readback
    || readback.if !== "${{ inputs.mode == 'readback' }}"
    || !exactObject(readback.permissions, exactReadPermissions)
  ) {
    failures += reportFailure(id, 'Native reusable permissions or canary/prepare/readback isolation drifted');
  }
  for (const required of [
    'test "$(id -u)" -ne 0',
    'repository: gaofeng21cn/opl-aion-shell',
    'repository: gaofeng21cn/one-person-lab',
    'desired_root_package_ids',
    'tests/unit/web-cli/nativeDistribution.test.ts',
    'tests/unit/web-cli/packWebCli.test.ts',
    '--rollback',
    'official-profile-first-install-complete',
    'user-sentinel.txt',
    'project-sentinel.txt',
    'release-native-webui-carrier.ts readback',
    'restore-release-checkpoint',
    '--publication-scope external_target',
    'prior_mutation_attempt_id',
    'find imported-checkpoint -type f -name publication-manifest.json',
    'find imported-checkpoint -type f -name standard-identity-receipt.json',
    'test "$(jq -r .operation_id <<<"$marker")"',
    'opl release reconcile',
  ]) {
    if (!carrier.text.includes(required)) failures += reportFailure(id, `Native reusable is missing ${required}`);
  }
  if (/workflow_dispatch:|ghcr\.io|packages: write|make_latest|github-activate-latest|_release-full-addon\.yml/.test(carrier.text)) {
    failures += reportFailure(id, 'Native reusable must remain pre-publication qualification plus read-only public reconciliation');
  }
  return failures;
}

export function validateHomebrewFullPromotionTopology(appRoot: string): number {
  const id = 'homebrew_full_promotion_topology';
  const follower = parseWorkflow(appRoot, homebrewFullFollowerWorkflowPath, id);
  const publisher = parseWorkflow(appRoot, homebrewFullPublisherWorkflowPath, id);
  if (!follower || !publisher) return [follower, publisher].filter((value) => !value).length;
  let failures = 0;
  const followerJobs = workflowJobs(follower.workflow);
  const followerTriggers = follower.workflow.on ?? {};
  if (
    JSON.stringify(Object.keys(followerTriggers)) !== JSON.stringify(['workflow_run'])
    || JSON.stringify(followerTriggers.workflow_run?.workflows) !== JSON.stringify(['OPL Stable Release Bundle'])
    || JSON.stringify(followerTriggers.workflow_run?.types) !== JSON.stringify(['completed'])
    || !exactObject(follower.workflow.permissions, exactReadPermissions)
    || JSON.stringify(Object.keys(followerJobs)) !== JSON.stringify(['resolve-handoff', 'publish-homebrew-full'])
  ) {
    failures += reportFailure(id, 'Full Homebrew follower must be one automatic read-default Stable workflow_run lane');
  }
  const delegated = followerJobs['publish-homebrew-full'];
  if (
    !delegated
    || delegated.uses !== './.github/workflows/_release-homebrew-full-publish.yml'
    || !needsExactly(delegated, ['resolve-handoff'])
    || !exactObject(delegated.permissions, exactReadPermissions)
    || delegated.with?.mode !== 'execute'
    || delegated.secrets !== 'inherit'
  ) {
    failures += reportFailure(id, 'Full Homebrew follower must delegate only the exact handoff to the protected reusable');
  }
  for (const required of [
    '.path == ".github/workflows/release-stable.yml"',
    '.run_attempt == 1',
    'opl-release-full-published-${AUTHORITY_RUN_ID}',
    'homebrew-full-handoff.json',
    'opl_homebrew_full_follower_handoff.v1',
    '.source.completed_stage == "full_qualified"',
    '.source.checkpoint_transport_executor == "github_actions"',
    '.source.transport_run_id',
    '.homebrew_modified == false',
  ]) {
    if (!follower.text.includes(required)) failures += reportFailure(id, `Full Homebrew follower is missing ${required}`);
  }
  if (/workflow_dispatch:|continue-on-error|git\b[^\n]*\bpush\b|OPL_HOMEBREW_TAP_TOKEN/.test(follower.text)) {
    failures += reportFailure(id, 'Full Homebrew follower must not expose manual or direct mutation paths');
  }

  const publisherJobs = workflowJobs(publisher.workflow);
  const publisherInputs = publisher.workflow.on?.workflow_call?.inputs ?? {};
  if (
    JSON.stringify(Object.keys(publisher.workflow.on ?? {})) !== JSON.stringify(['workflow_call'])
    || JSON.stringify(Object.keys(publisherInputs)) !== JSON.stringify(['mode', 'authority_run_id', 'handoff_base64', 'handoff_sha256'])
    || !exactObject(publisher.workflow.permissions, exactReadPermissions)
    || JSON.stringify(Object.keys(publisherJobs)) !== JSON.stringify(['startup-canary', 'prepare-candidate', 'publish-cask', 'readback'])
  ) {
    failures += reportFailure(id, 'Full Homebrew reusable must expose only exact handoff inputs and candidate/publish/readback jobs');
  }
  const startup = publisherJobs['startup-canary'];
  const prepare = publisherJobs['prepare-candidate'];
  const publish = publisherJobs['publish-cask'];
  const readback = publisherJobs.readback;
  if (
    !startup || startup.if !== "${{ inputs.mode == 'canary' }}" || !exactObject(startup.permissions, exactReadPermissions)
    || !prepare || prepare.if !== "${{ inputs.mode == 'execute' }}" || !exactObject(prepare.permissions, exactReadPermissions)
    || !publish || publish.if !== "${{ inputs.mode == 'execute' }}" || !needsExactly(publish, ['prepare-candidate'])
    || publish.environment !== 'release-stable' || !exactObject(publish.permissions, exactReadPermissions)
    || !readback || readback.if !== "${{ inputs.mode == 'execute' }}" || !needsExactly(readback, ['prepare-candidate', 'publish-cask'])
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
    'direct_commit',
    'full_dmg_embedded_opl_base',
    'active_framework_count_target',
    'opl-homebrew-full-candidate-${GITHUB_RUN_ID}',
    'a1561bdf1dfe6f316dad22f16152a537ddfb69d5',
    'merge-base --is-ancestor "$embedded_base_floor" "$shell_sha"',
    'predates the embedded-Base fail-closed carrier',
    "test '${{ steps.checkpoint.outputs.completed_stage }}' = full_qualified",
    'qualification_receipt_sha256',
  ]) {
    if (!prepareRuns.includes(required)) failures += reportFailure(id, `Full Homebrew candidate preparation is missing ${required}`);
  }
  for (const required of [
    'append_full_operation_id',
    'append_full_operation_deadline_at',
    'publication-scope track_assets',
    'homebrew:gaofeng21cn/homebrew-one-person-lab/Casks/one-person-lab-full.rb/${expected_cask_sha}',
    'publication-scope external_target',
    'release-operation-deadline.ts check',
    'git -C tap-source push --no-force origin "$result_commit:refs/heads/main"',
    'active_unknown_markers',
    'test "$(jq -r .operation_id <<<"$marker")" = "$operation_id"',
    'prior_mutation_attempt_id',
    'opl release reconcile',
    'no second push was attempted',
    'homebrew-full-unknown-checkpoint',
    'git -C tap-source ls-remote origin refs/heads/main',
    'git -C tap-source fetch --no-tags --depth=1 origin "$remote_commit"',
    "git -C tap-source show 'FETCH_HEAD:Casks/one-person-lab-full.rb'",
    'opl_homebrew_full_publication_receipt.v1',
    'qualification_receipt_sha256:$qualification_sha',
    'cohort:{app_sha:$app_sha,shell_sha:$shell_sha,framework_sha:$framework_sha}',
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
  if (!publisher.text.includes('Restore qualified Full publication checkpoint')) {
    failures += reportFailure(id, 'Full Homebrew protected publish must restore the exact qualified Full checkpoint');
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
  const homebrew = parseWorkflow(appRoot, nightlyHomebrewFollowerWorkflowPath, id);
  const sampledVm = parseWorkflow(appRoot, nightlySampledVmWorkflowPath, id);
  if (!release || !homebrew || !sampledVm) {
    return [release, homebrew, sampledVm].filter((value) => !value).length;
  }
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
  if (
    JSON.stringify(Object.keys(release.workflow.on ?? {})) !== JSON.stringify(['schedule'])
    || JSON.stringify(release.workflow.on?.schedule) !== JSON.stringify([{ cron: '17 19 * * *' }])
    || !exactObject(release.workflow.permissions, exactReadPermissions)
    || !exactObject(release.workflow.concurrency, {
      group: 'opl-standard-nightly',
      'cancel-in-progress': false,
    })
    || JSON.stringify(Object.keys(releaseJobs)) !==
      JSON.stringify(['admission', 'standard-build', 'qualify-and-publish'])
  ) {
    failures += reportFailure(id, 'Nightly must be one automatic scheduled Standard prerelease lane with its own concurrency');
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
    'refs/heads/main',
    'TZ=Asia/Shanghai',
    'resolve-nightly-release-request.ts',
    'nightly-release-qualification.ts',
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
    /workflow_dispatch:|opl-release-bundle-global|uses: \.\/\.github\/workflows\/_release-bundle\.yml|uses: \.\/\.github\/workflows\/opl-first-run-vm\.yml|require_macos_gatekeeper: true|make_latest:\s*(?:true|'true')|_release-full-addon|release-webui|manual-full-preview|update-homebrew|homebrew.*(?:gate|publish|tap|cask)|(?:gate|publish|tap|cask).*homebrew|\btart\b/i.test(
      release.text,
    )
  ) {
    failures += reportFailure(id, 'Nightly source must not enter Stable Bundle, heavy VM, Full, WebUI, Latest, manual Preview, Homebrew, or Tart paths');
  }

  const homebrewJobs = workflowJobs(homebrew.workflow);
  const homebrewJob = homebrewJobs['publish-nightly-cask'];
  if (
    JSON.stringify(Object.keys(homebrew.workflow.on ?? {})) !== JSON.stringify(['workflow_run'])
    || JSON.stringify(homebrew.workflow.on?.workflow_run?.workflows) !==
      JSON.stringify(['OPL Standard Nightly Release'])
    || JSON.stringify(homebrew.workflow.on?.workflow_run?.types) !== JSON.stringify(['completed'])
    || !exactObject(homebrew.workflow.permissions, exactReadPermissions)
    || JSON.stringify(Object.keys(homebrewJobs)) !== JSON.stringify(['publish-nightly-cask'])
    || !homebrewJob
    || homebrewJob.environment !== 'release-nightly'
    || !exactObject(homebrewJob.permissions, exactReadPermissions)
  ) {
    failures += reportFailure(id, 'Nightly Homebrew must be one protected post-publication follower');
  }
  const homebrewRuns = jobRuns(homebrewJob);
  for (const required of [
    '.path == ".github/workflows/release-nightly.yml"',
    '.event == "schedule"',
    '.run_attempt == 1',
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
    /workflow_dispatch:|opl-first-run-vm|one-person-lab-full\.rb|make_latest:\s*(?:true|'true')|gh workflow run|gh run (?:rerun|cancel)/.test(
      homebrew.text,
    )
  ) {
    failures += reportFailure(id, 'Nightly Homebrew follower must not contain VM, Full, Latest, dispatch, or retry paths');
  }

  const vmJobs = workflowJobs(sampledVm.workflow);
  const resolve = vmJobs['resolve-sample'];
  const vm = vmJobs['sampled-standard-vm'];
  if (
    JSON.stringify(Object.keys(sampledVm.workflow.on ?? {})) !== JSON.stringify(['workflow_run'])
    || JSON.stringify(sampledVm.workflow.on?.workflow_run?.workflows) !==
      JSON.stringify(['OPL Standard Nightly Release'])
    || JSON.stringify(sampledVm.workflow.on?.workflow_run?.types) !== JSON.stringify(['completed'])
    || !exactObject(sampledVm.workflow.permissions, exactReadPermissions)
    || JSON.stringify(Object.keys(vmJobs)) !== JSON.stringify(['resolve-sample', 'sampled-standard-vm'])
    || !resolve
    || !exactObject(resolve.permissions, exactReadPermissions)
    || !vm
    || vm.uses !== './.github/workflows/opl-first-run-vm.yml'
    || !needsExactly(vm, ['resolve-sample'])
    || !exactObject(vm.permissions, exactReadPermissions)
    || vm.with?.package_profile !== 'standard'
    || vm.with?.require_macos_gatekeeper !== false
    || Object.prototype.hasOwnProperty.call(vm.with ?? {}, 'release_bundle_digest')
    || Object.prototype.hasOwnProperty.call(vm.with ?? {}, 'operation')
  ) {
    failures += reportFailure(id, 'Nightly VM must be a sampled read-only post-publication Standard follower');
  }
  if (
    !sampledVm.text.includes('TZ=Asia/Shanghai date +%u')
    || !sampledVm.text.includes('heavy_vm_blocking == false')
    || /workflow_dispatch:|contents: write|packages: write|update-homebrew|make_latest:\s*(?:true|'true')|make_latest\s*==\s*true|gh release/.test(sampledVm.text)
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

const canaryReusableCalls = {
  standard: {
    workflow: './.github/workflows/_release-bundle.yml',
    permissions: exactReadPermissions,
  },
  'resume-standard': {
    workflow: './.github/workflows/_release-standard-publish.yml',
    permissions: exactReadPermissions,
  },
  'append-full': {
    workflow: './.github/workflows/_release-full-addon.yml',
    permissions: exactReadPermissions,
  },
  'nested-standard-build': {
    workflow: './.github/workflows/_build-reusable.yml',
    permissions: exactReadPermissions,
  },
  'nested-standard-qualification': {
    workflow: './.github/workflows/opl-first-run-vm.yml',
    permissions: exactReadPermissions,
  },
  'nested-webui-carrier': {
    workflow: './.github/workflows/_release-webui-carrier.yml',
    permissions: exactWebUiCompileCeilingPermissions,
  },
  'nested-webui-stable': {
    workflow: './.github/workflows/release-webui-stable.yml',
    permissions: exactWebUiCompileCeilingPermissions,
  },
  'nested-updater-qualification': {
    workflow: './.github/workflows/opl-updater-upgrade-vm.yml',
    permissions: exactReadPermissions,
  },
  'nested-full-build': {
    workflow: './.github/workflows/full-first-install-release.yml',
    permissions: exactReadPermissions,
  },
} as const;

function validateWebUiCarrierCallee(
  id: string,
  workflow: Record<string, any>,
  callerPermissions: Record<string, unknown>,
): number {
  let failures = 0;
  if (!exactObject(workflow.permissions, { contents: 'read' })) {
    failures += reportFailure(id, 'WebUI carrier top-level permissions must be exactly contents:read');
  }
  const jobs = workflowJobs(workflow);
  if (JSON.stringify(Object.keys(jobs).sort()) !==
      JSON.stringify(['build-and-qualify', 'publish-immutable-carrier', 'startup-canary'])) {
    failures += reportFailure(id, 'WebUI carrier jobs must be exactly startup, build/qualify, and immutable publish');
  }
  const startup = jobs['startup-canary'];
  const build = jobs['build-and-qualify'];
  const publish = jobs['publish-immutable-carrier'];
  if (!startup || startup.if !== "${{ inputs.mode == 'canary' }}" ||
      !Array.isArray(startup.steps) || startup.steps.length === 0) {
    failures += reportFailure(id, 'WebUI carrier startup must be the only Canary-reachable job');
  }
  if (!build || build.if !== "${{ inputs.mode == 'execute' }}" ||
      !exactObject(build.permissions, exactWebUiReadPermissions)) {
    failures += reportFailure(id, 'WebUI build/qualification must be execute-only with exact read permissions');
  }
  if (!publish || publish.if !== "${{ inputs.mode == 'execute' }}" ||
      publish.needs !== 'build-and-qualify' ||
      publish.environment !== webuiCarrierPublishEnvironment ||
      !exactObject(publish.permissions, exactWebUiPublishPermissions)) {
    failures += reportFailure(id, 'WebUI immutable publish must be execute-only, protected, and request only contents:read/packages:write');
  }
  if (publish &&
      intersectPermission(callerPermissions, publish.permissions, 'packages') !==
        permissionLevel(callerPermissions, 'packages')) {
    failures += reportFailure(id, 'WebUI callee attempted to elevate beyond the caller package permission ceiling');
  }
  return failures;
}

export function validateReleaseBundleCanaryTopology(appRoot: string): number {
  const id = 'release_bundle_canary_topology';
  const parsed = parseWorkflow(appRoot, '.github/workflows/release-bundle-canary.yml', id);
  if (!parsed) return 1;
  const { workflow, text } = parsed;
  let failures = 0;
  if (Object.prototype.hasOwnProperty.call(workflow.on ?? {}, 'workflow_dispatch')) {
    failures += reportFailure(id, 'Canary must not expose workflow_dispatch');
  }
  const triggers = workflow.on ?? {};
  const schedule = triggers.schedule;
  if (JSON.stringify(Object.keys(triggers).sort()) !==
      JSON.stringify(['pull_request', 'push', 'schedule']) ||
      JSON.stringify(triggers.push?.branches) !== JSON.stringify(['main']) ||
      !Array.isArray(schedule) || schedule.length !== 1 ||
      schedule[0]?.cron !== '0 13 * * *') {
    failures += reportFailure(id, 'Canary must run on main push, pull request, and the one daily schedule');
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
  for (const [jobId, spec] of Object.entries(canaryReusableCalls)) {
    const workflowPath = spec.workflow;
    const job = jobs[jobId];
    failures += validateReusableCall(id, jobs, jobId, workflowPath, spec.permissions);
    if (!job) continue;
    if (job.secrets !== undefined || job.with?.mode !== 'canary') {
      failures += reportFailure(id, `${jobId} must start in canary mode without secrets`);
    }
    if (Object.keys(job.with ?? {}).some((name) => retiredLiveAuthorityPattern.test(name))) {
      failures += reportFailure(id, `${jobId} must not forward broker/session/lease inputs`);
    }

    const calleePath = workflowPath.replace('./', '');
    const callee = parseWorkflow(appRoot, calleePath, id);
    if (!callee) {
      failures += 1;
      continue;
    }
    const calleeJobs = workflowJobs(callee.workflow);
    const startup = calleeJobs['startup-canary'];
    if (!callee.workflow.on?.workflow_call || !startup ||
        typeof startup.if !== 'string' || !startup.if.includes("inputs.mode == 'canary'") ||
        !Array.isArray(startup.steps) || startup.steps.length === 0) {
      failures += reportFailure(id, `${calleePath} must expose a real startup-canary job`);
    }
    if (permissionLevel(spec.permissions, 'packages') === 'write') {
      const startupPermissions = startup?.permissions ?? callee.workflow.permissions;
      if (!startupPermissions || requestsWritePermission(startupPermissions)) {
        failures += reportFailure(
          id,
          `${jobId} compile ceiling may be write only when the reachable startup job explicitly downgrades to read-only`,
        );
      }
    }
    if (jobId === 'nested-webui-carrier') {
      failures += validateWebUiCarrierCallee(id, callee.workflow, spec.permissions);
      if (permissionLevel(spec.permissions, 'packages') !== 'write') {
        failures += reportFailure(id, 'Canary WebUI caller must permit the protected publish job to compile');
      }
      continue;
    }
    if (jobId === 'nested-webui-stable') {
      const admission = calleeJobs.admission;
      const promotion = calleeJobs['promote-webui-stable'];
      const expectedInputs = [
        'mode',
        'authority_mode',
        'stable_authority_run_id',
        'carrier_follower_run_id',
        'carrier_executor_ref',
        'carrier_artifact_name',
      ].sort();
      if (!exactObject(callee.workflow.permissions, exactReadPermissions) ||
          !admission || admission.if !== "${{ inputs.mode == 'execute' }}" ||
          !exactObject(admission.permissions, exactReadPermissions) ||
          !promotion || promotion.if !== "${{ inputs.mode == 'execute' }}" ||
          !isAuthorizedWebuiStablePromotionWriteJob(calleePath, 'promote-webui-stable', promotion) ||
          JSON.stringify(Object.keys(callee.workflow.on?.workflow_call?.inputs ?? {}).sort()) !==
            JSON.stringify(expectedInputs)) {
        failures += reportFailure(
          id,
          'WebUI Stable follower must expose exact run identities and keep its protected execute writer unreachable from Canary',
        );
      }
      continue;
    }
    if (requestsWritePermission(callee.workflow.permissions)) {
      failures += reportFailure(id, `${calleePath} must not request top-level write permission`);
    }
    for (const [calleeJobId, calleeJob] of Object.entries(calleeJobs)) {
      if (requestsWritePermission(calleeJob.permissions)) {
        failures += reportFailure(
          id,
          `${calleePath}:${calleeJobId} cannot statically request write from a read-only Canary caller`,
        );
      }
    }
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

  for (const check of releaseBoundaryChecks) {
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

export function validateWorkflowNode24Policy(appRoot: string): number {
  let failures = 0;

  for (const workflowPath of releaseWorkflowPaths) {
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
  for (const relativePath of stableReleaseActionPaths) {
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
  if (
    workflow.concurrency?.group !== 'opl-release-bundle-global'
    || workflow.concurrency?.['cancel-in-progress'] !== false
  ) {
    failures += reportFailure(id, 'Manual Full preview must share the non-cancelling repository release mutex');
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
    validateReleaseBundleCanaryTopology(appRoot) +
    validateNightlyReleaseTopology(appRoot) +
    validatePreviewLatestPointerTopology(appRoot) +
    validateIndependentWebuiPreviewTopology(appRoot) +
    validateManualFullPreviewControlPlane(appRoot) +
    validateNativeWebuiPublicationTopology(appRoot) +
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
    const isNativeWebuiWorkflow = workflowPath === nativeWebuiFollowerWorkflowPath
      || workflowPath === nativeWebuiCarrierWorkflowPath;
    if (!Object.prototype.hasOwnProperty.call(workflow?.on ?? {}, 'workflow_dispatch') && !isNativeWebuiWorkflow) continue;
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
      if (isAuthorizedNativeWebuiWriteJob(workflowPath, jobId, job)) {
        failures += validateExactActionPins(workflowPath, jobId, steps);
        continue;
      }
      if (isAuthorizedManualPreviewWriteJob(workflowPath, jobId, job)) {
        continue;
      }
      if (
        workflowPath === webuiDevelopmentWorkflowPath
        && jobId === 'webui-carrier'
        && job.uses === './.github/workflows/_release-webui-carrier.yml'
        && needsExactly(job, ['source-authority'])
        && exactObject(job.permissions, exactWebUiCompileCeilingPermissions)
        && job.with?.mode === 'execute'
        && job.with?.authority_mode === 'independent_preview'
        && steps.length === 0
      ) {
        continue;
      }
      if (
        workflowPath === webuiDevelopmentPromotionWorkflowPath
        && jobId === 'promote-webui-latest'
        && job.uses === './.github/workflows/release-webui-stable.yml'
        && !Object.prototype.hasOwnProperty.call(job, 'needs')
        && exactObject(job.permissions, exactWebUiCompileCeilingPermissions)
        && job.with?.mode === 'execute'
        && job.with?.authority_mode === 'independent_preview'
        && job.with?.carrier_follower_run_id === '${{ inputs.carrier_follower_run_id }}'
        && job.with?.carrier_executor_ref === '${{ inputs.carrier_executor_ref }}'
        && job.with?.carrier_artifact_name === '${{ inputs.carrier_artifact_name }}'
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
        console.error(`FAIL workflow_dispatch_write_authority: ${workflowPath} job ${jobId} has write permission outside the immutable Release Bundle entry`);
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
  const id = 'independent_webui_preview_topology';
  const publication = parseWorkflow(appRoot, webuiDevelopmentWorkflowPath, id);
  const promotion = parseWorkflow(appRoot, webuiDevelopmentPromotionWorkflowPath, id);
  if (!publication || !promotion) return 1;
  let failures = 0;
  const publicationWorkflow = publication.workflow;
  const publicationJobs = workflowJobs(publicationWorkflow);
  const expectedPublicationInputs = ['version', 'app_ref', 'shell_ref', 'framework_ref'].sort();
  const expectedCarrierWith = {
    mode: 'execute',
    authority_mode: 'independent_preview',
    app_ref: '${{ needs.source-authority.outputs.app_ref }}',
    shell_ref: '${{ needs.source-authority.outputs.shell_ref }}',
    framework_ref: '${{ needs.source-authority.outputs.framework_ref }}',
    opl_version: '${{ needs.source-authority.outputs.version }}',
    release_bundle_digest: '${{ needs.source-authority.outputs.source_authority_digest }}',
    release_cohort_ref: '${{ needs.source-authority.outputs.source_authority_digest }}',
    source_artifact_run_id: '${{ needs.source-authority.outputs.source_run_id }}',
    source_authority_artifact_name: '${{ needs.source-authority.outputs.source_authority_artifact_name }}',
  };
  if (
    JSON.stringify(Object.keys(publicationWorkflow.on?.workflow_dispatch?.inputs ?? {}).sort()) !==
      JSON.stringify(expectedPublicationInputs)
    || !exactObject(publicationWorkflow.permissions, exactReadPermissions)
    || !exactObject(publicationWorkflow.concurrency, {
      group: 'opl-webui-independent-preview-publication-global',
      'cancel-in-progress': false,
    })
    || JSON.stringify(Object.keys(publicationJobs).sort()) !==
      JSON.stringify(['source-authority', 'webui-carrier'])
  ) {
    failures += reportFailure(
      id,
      'independent Preview publication must admit exact four refs and contain only source authority plus immutable carrier publication',
    );
  }
  const sourceAuthority = publicationJobs['source-authority'];
  const carrier = publicationJobs['webui-carrier'];
  if (
    !sourceAuthority
    || Object.prototype.hasOwnProperty.call(sourceAuthority, 'needs')
    || !exactObject(sourceAuthority.permissions, exactReadPermissions)
    || !carrier
    || !needsExactly(carrier, ['source-authority'])
    || carrier.uses !== './.github/workflows/_release-webui-carrier.yml'
    || !exactObject(carrier.permissions, exactWebUiCompileCeilingPermissions)
    || !exactObject(carrier.with, expectedCarrierWith)
  ) {
    failures += reportFailure(
      id,
      'independent Preview publication must bind source authority directly into the immutable carrier without a pointer writer',
    );
  }
  if (
    !publication.text.includes('webui-source-authority.ts')
    || !publication.text.includes('test "$GITHUB_RUN_ATTEMPT" = 1')
    || !publication.text.includes('test "$GITHUB_REF" = refs/heads/main')
    || /promote-webui|release-webui-stable\.yml|\boras tag\b/.test(publication.text)
  ) {
    failures += reportFailure(
      id,
      'independent Preview publication must create and verify source authority but cannot promote stable/latest itself',
    );
  }

  const promotionWorkflow = promotion.workflow;
  const promotionJobs = workflowJobs(promotionWorkflow);
  const expectedPromotionInputs = [
    'carrier_follower_run_id',
    'carrier_executor_ref',
    'carrier_artifact_name',
  ].sort();
  const expectedPromotionWith = {
    mode: 'execute',
    authority_mode: 'independent_preview',
    carrier_follower_run_id: '${{ inputs.carrier_follower_run_id }}',
    carrier_executor_ref: '${{ inputs.carrier_executor_ref }}',
    carrier_artifact_name: '${{ inputs.carrier_artifact_name }}',
  };
  const latestWriter = promotionJobs['promote-webui-latest'];
  if (
    JSON.stringify(Object.keys(promotionWorkflow.on?.workflow_dispatch?.inputs ?? {}).sort()) !==
      JSON.stringify(expectedPromotionInputs)
    || !exactObject(promotionWorkflow.permissions, exactReadPermissions)
    || !exactObject(promotionWorkflow.concurrency, {
      group: 'opl-webui-independent-preview-latest-global',
      'cancel-in-progress': false,
    })
    || JSON.stringify(Object.keys(promotionJobs).sort()) !== JSON.stringify(['promote-webui-latest'])
    || !latestWriter
    || Object.prototype.hasOwnProperty.call(latestWriter, 'needs')
    || latestWriter.uses !== './.github/workflows/release-webui-stable.yml'
    || !exactObject(latestWriter.permissions, exactWebUiCompileCeilingPermissions)
    || !exactObject(latestWriter.with, expectedPromotionWith)
    || /stable_authority_run_id|_release-webui-carrier\.yml|build-and-qualify|publish-immutable-carrier/.test(promotion.text)
  ) {
    failures += reportFailure(
      id,
      'independent Preview Latest promotion must be a separate exact-carrier dispatch with no Desktop Stable authority or rebuild path',
    );
  }
  return failures;
}
