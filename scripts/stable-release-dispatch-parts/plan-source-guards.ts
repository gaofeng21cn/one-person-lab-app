import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readActiveShellBuildProfile } from '../active-shell-build-profile.ts';
import {
  buildPreNonceDispatchGuard,
} from '../release-dispatch-guard.ts';
import {
  createStableOperationAuthority,
  encodeStableOperationAuthorityCarrier,
  stableOperationCriticalBlobs,
  stableOperationIdForFrozenCohort,
} from '../stable-operation-control.ts';
import {
  isFullCheckpointArtifact,
  selectReusableStandardCheckpointArtifact,
} from './artifact-retrieval.ts';
import {
  defaultWorkflow,
  record,
  runId,
  runRequired,
  sha,
  text,
  type FullSourceRefs,
  type Runtime,
  type StableDispatchPlan,
  type WorkflowArtifact,
} from './types.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Recovery plans may preserve an older product cohort while the canonical
// Framework checkout has advanced. Keep the adjacent checkout as the default,
// but allow the caller to bind an exact immutable checkout for that cohort.
const frameworkRoot = path.resolve(
  process.env.OPL_FRAMEWORK_ROOT || path.resolve(appRoot, '..', 'one-person-lab'),
);

function readJsonFile(filePath: string): unknown {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`Expected one non-empty regular JSON file: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown;
}

export function resolveAppendFullCohort(
  checkpointCohort: unknown | undefined,
  requested: Partial<FullSourceRefs>,
  current: (key: keyof FullSourceRefs) => string,
): FullSourceRefs {
  let defaults: FullSourceRefs;
  if (checkpointCohort === undefined) {
    defaults = {
      appSha: requested.appSha ?? current('appSha'),
      shellSha: requested.shellSha ?? current('shellSha'),
      frameworkSha: requested.frameworkSha ?? current('frameworkSha'),
    };
  } else {
    const manifest = record(checkpointCohort, 'Full checkpoint build cohort');
    const prefinalization = manifest.schema === 'opl_full_finalizer_input.v1';
    if (!prefinalization && manifest.schema !== 'opl_app_build_artifact_cohort.v2') {
      throw new Error('Full checkpoint build cohort schema is invalid.');
    }
    if (!prefinalization && record(manifest.build, 'Full checkpoint build identity').kind !== 'full') {
      throw new Error('Full checkpoint build cohort is not a Full artifact.');
    }
    if (prefinalization && record(manifest.source_runner, 'Full handoff source runner').arch !== 'arm64') {
      throw new Error('Full finalizer input requires an ARM64 source.');
    }
    const cohort = record(prefinalization ? manifest.full_content_sources : manifest.cohort, 'Full checkpoint content cohort');
    defaults = {
      appSha: sha(cohort.app_sha, 'Full checkpoint app_sha'),
      shellSha: sha(cohort.shell_sha, 'Full checkpoint shell_sha'),
      frameworkSha: sha(cohort.framework_sha, 'Full checkpoint framework_sha'),
    };
  }
  return {
    appSha: sha(requested.appSha ?? defaults.appSha, 'requested app_sha'),
    shellSha: sha(requested.shellSha ?? defaults.shellSha, 'requested shell_sha'),
    frameworkSha: sha(requested.frameworkSha ?? defaults.frameworkSha, 'requested framework_sha'),
  };
}

export function fullCheckpointMatchesRequestedCohort(
  value: unknown,
  requested: FullSourceRefs,
): boolean {
  const actual = resolveAppendFullCohort(value, {}, () => { throw new Error('Full checkpoint is required.'); });
  return actual.appSha === sha(requested.appSha, 'requested app_sha')
    && actual.shellSha === sha(requested.shellSha, 'requested shell_sha')
    && actual.frameworkSha === sha(requested.frameworkSha, 'requested framework_sha');
}

export function reconcileAppendFullCheckpointCohort(input: {
  target: import('./types.ts').AppendFullTargetState;
  rootArtifacts: WorkflowArtifact[];
  checkpointCohort: unknown;
  exactArtifactRequested?: boolean;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
}): import('./types.ts').AppendFullTargetState {
  if (input.target.state !== 'dispatch_required') return input.target;
  if (!isFullCheckpointArtifact(input.target.source_artifact, input.target.source_run_id)) {
    return input.target;
  }
  if (fullCheckpointMatchesRequestedCohort(input.checkpointCohort, input)) return input.target;
  const rootSourceRunId = input.target.root_source_run_id;
  if (input.exactArtifactRequested || !input.rootArtifacts.some((artifact) => !artifact.expired
    && (artifact.name === 'opl-release-standard-checkpoint-' + rootSourceRunId
      || artifact.name === 'opl-release-standard-operation-checkpoint-' + rootSourceRunId))) {
    throw new Error('Requested content refs differ from the Full checkpoint; select the original Standard source to build a new Full cohort.');
  }
  return {
    state: 'dispatch_required',
    root_source_run_id: rootSourceRunId,
    owner_run_id: null,
    source_run_id: rootSourceRunId,
    source_artifact: selectReusableStandardCheckpointArtifact(input.rootArtifacts, rootSourceRunId),
  };
}

export function assertLatestStandardReleaseComplete(value: unknown): void {
  const release = record(value, 'Latest GitHub Release');
  const tag = text(release.tag_name, 'Latest GitHub Release tag');
  if (!tag.startsWith('v')) throw new Error('Latest GitHub Release tag must start with v.');
  if (!Array.isArray(release.assets)) throw new Error('Latest GitHub Release assets are missing.');
  const version = tag.slice(1);
  const names = new Set(release.assets.map((item) =>
    text(record(item, 'Latest GitHub Release asset').name, 'Latest GitHub Release asset name')));
  const required = [
    `One-Person-Lab-${version}-mac-arm64.dmg`,
    'opl-app-component-manifest.json',
  ];
  const missing = required.filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(
      `Latest ${tag} is missing required Standard publication assets (${missing.join(', ')}). `
      + 'Repair that same tag before creating another product version.',
    );
  }
}

export function latestRelease(runtime: Runtime, repository: string): unknown {
  return JSON.parse(runRequired(
    runtime,
    'gh',
    ['api', `repos/${repository}/releases/latest`],
    30_000,
    'Read Latest App Release',
    appRoot,
  ));
}

export function buildAppendFullPlan(input: {
  attemptId: string;
  sourceRunId: string;
  sourceArtifact: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  priorFullArtifactRunId?: string;
  frameworkExecutorSha?: string;
  artifactProducerRunId?: string;
  qualificationRunId?: string;
  smokeHarnessSha?: string;
  verificationAppSha?: string;
  recoveryRunId?: string;
}): StableDispatchPlan {
  const sourceRunId = runId(input.sourceRunId, 'source_run_id');
  const workflowInputs: Record<string, string> = {
    operation: 'append_full',
    source_run_id: sourceRunId,
    source_artifact: text(input.sourceArtifact, 'source_artifact'),
    app_ref: sha(input.appSha, 'app_ref'),
    shell_ref: sha(input.shellSha, 'shell_ref'),
    framework_ref: input.frameworkExecutorSha && input.frameworkExecutorSha !== input.frameworkSha
      ? JSON.stringify({
        source_ref: sha(input.frameworkSha, 'framework_ref'),
        executor_ref: sha(input.frameworkExecutorSha, 'framework_executor_ref'),
      })
      : sha(input.frameworkSha, 'framework_ref'),
  };
  if (input.priorFullArtifactRunId) {
    workflowInputs.prior_full_artifact_run_id = runId(
      input.priorFullArtifactRunId,
      'prior_full_artifact_run_id',
    );
  }
  if (input.smokeHarnessSha || input.verificationAppSha) {
    const checkpointRecovery = input.sourceArtifact === `opl-release-full-checkpoint-${sourceRunId}`
      || input.sourceArtifact === `opl-release-append-full-operation-checkpoint-v2-${sourceRunId}`;
    if (!input.priorFullArtifactRunId && !checkpointRecovery) {
      throw new Error('verification harness refs require a reusable Full checkpoint.');
    }
    const smokeHarnessRef = input.smokeHarnessSha
      ? sha(input.smokeHarnessSha, 'smoke_harness_ref')
      : null;
    const verificationAppRef = input.verificationAppSha
      ? sha(input.verificationAppSha, 'verification_app_ref')
      : null;
    workflowInputs.smoke_harness_ref = verificationAppRef
      ? JSON.stringify({ app_ref: verificationAppRef, shell_ref: smokeHarnessRef })
      : smokeHarnessRef!;
  }
  return {
    schema: 'opl_app_stable_dispatch_plan.v1',
    status: 'ready',
    operation: 'append_full',
    attempt_id: text(input.attemptId, 'attempt_id'),
    version_policy: 'preserve_source_tag',
    workflow_inputs: workflowInputs,
    source: { run_id: sourceRunId, artifact: workflowInputs.source_artifact },
    recovery: {
      requested_run_id: input.recoveryRunId ?? input.priorFullArtifactRunId ?? null,
      artifact_producer_run_id: input.artifactProducerRunId ?? null,
      qualification_run_id: input.qualificationRunId ?? null,
      smoke_harness_ref: input.smokeHarnessSha ? sha(input.smokeHarnessSha, 'smoke_harness_ref') : null,
      verification_app_ref: input.verificationAppSha ? sha(input.verificationAppSha, 'verification_app_ref') : null,
    },
    cohort: {
      app_sha: workflowInputs.app_ref,
      shell_sha: workflowInputs.shell_ref,
      framework_sha: sha(input.frameworkSha, 'framework_ref'),
    },
    authority: null,
  };
}

export function buildPublishQualifiedStandardPlan(input: {
  attemptId: string;
  sourceRunId: string;
  sourceArtifact: string;
  frameworkSha: string;
}): StableDispatchPlan {
  const sourceRunId = runId(input.sourceRunId, 'source_run_id');
  return {
    schema: 'opl_app_stable_dispatch_plan.v1',
    status: 'ready',
    operation: 'resume_standard',
    attempt_id: text(input.attemptId, 'attempt_id'),
    version_policy: 'preserve_source_tag',
    workflow_inputs: {
      operation: 'resume_standard',
      source_run_id: sourceRunId,
      source_artifact: text(input.sourceArtifact, 'source_artifact'),
      framework_ref: sha(input.frameworkSha, 'framework_ref'),
    },
    source: { run_id: sourceRunId, artifact: input.sourceArtifact },
    recovery: {
      requested_run_id: sourceRunId,
      artifact_producer_run_id: null,
      qualification_run_id: null,
      smoke_harness_ref: null,
      verification_app_ref: null,
    },
    cohort: null,
    authority: null,
  };
}

export function wireSha(runtime: Runtime, remote: string): string {
  const output = runRequired(
    runtime,
    'git',
    ['ls-remote', '--exit-code', remote, 'refs/heads/main'],
    30_000,
    `Resolve ${remote} main`,
    appRoot,
  );
  const matches = output.trim().split(/\r?\n/).filter(Boolean);
  if (matches.length !== 1) throw new Error(`Expected one wire main ref from ${remote}; found ${matches.length}.`);
  return sha(matches[0]!.split(/\s+/)[0], `${remote} main`);
}

export function sourceGate(
  runtime: Runtime,
  appSha: string,
  shellSha: string,
  frameworkSha: string,
  objectiveFingerprint: string,
): unknown {
  // Node resolves the main module through macOS /var -> /private/var aliases.
  // Use that same path in argv so frozen source CLI entry detection still runs.
  const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stable-source-gate-')));
  const currentAppSha = sha(runRequired(
    runtime,
    'git',
    ['rev-parse', 'HEAD'],
    30_000,
    'Resolve current App executor',
    appRoot,
  ), 'current App executor');
  const isolatedAppRoot = path.join(tempRoot, 'app-source');
  const sourceRoot = currentAppSha === sha(appSha, 'app_ref') ? appRoot : isolatedAppRoot;
  let isolatedWorktreeCreated = false;
  try {
    if (sourceRoot === isolatedAppRoot) {
      runRequired(
        runtime,
        'git',
        ['worktree', 'add', '--detach', isolatedAppRoot, appSha],
        2 * 60_000,
        'Materialize frozen App product cohort',
        appRoot,
      );
      isolatedWorktreeCreated = true;
      runRequired(
        runtime,
        'npm',
        ['ci', '--ignore-scripts'],
        5 * 60_000,
        'Install frozen App source-gate dependencies',
        isolatedAppRoot,
      );
    }
    const frozenShellProfile = readActiveShellBuildProfile(sourceRoot);
    const sourceShellRoot = path.join(sourceRoot, frozenShellProfile.root);
    const output = path.join(tempRoot, 'source-gate.json');
    runRequired(
      runtime,
      process.execPath,
      [
        '--experimental-strip-types',
        path.join(sourceRoot, 'scripts', 'validate-release-source-gate.ts'),
        '--operation-fingerprint', objectiveFingerprint,
        '--app-ref', appSha,
        '--shell-ref', shellSha,
        '--framework-ref', frameworkSha,
        '--require-shell-format', 'true',
        '--run-shell-tests', 'true',
        '--repo-root', sourceRoot,
        '--shell-root', sourceShellRoot,
        '--framework-root', frameworkRoot,
        '--output', output,
        '--json',
      ],
      30 * 60_000,
      'Stable source gate',
      appRoot,
    );
    return readJsonFile(output);
  } finally {
    if (isolatedWorktreeCreated) {
      runtime.runner(
        'git',
        ['worktree', 'remove', '--force', isolatedAppRoot],
        { cwd: appRoot, timeoutMs: 2 * 60_000 },
      );
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function buildStandardPlan(input: {
  runtime: Runtime;
  workflow: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  desktopAdditionalPlatforms: string[];
  productChangeSummary: string;
  priorStandardArtifactRunId?: string;
  smokeHarnessSha?: string;
  reusableSourceGate?: unknown;
}): StableDispatchPlan {
  if (input.smokeHarnessSha && !input.priorStandardArtifactRunId) {
    throw new Error('A Standard verification harness override requires an existing signed artifact run.');
  }
  const smokeHarnessSha = input.smokeHarnessSha
    ? sha(input.smokeHarnessSha, 'smoke_harness_ref')
    : undefined;
  const objectiveFingerprint = smokeHarnessSha
    ? `opl-desktop-stable-release:smoke-harness:${smokeHarnessSha}`
    : 'opl-desktop-stable-release';
  const criticalBlobs = stableOperationCriticalBlobs(appRoot);
  const operationId = stableOperationIdForFrozenCohort({
    objectiveFingerprint,
    appSha: input.appSha,
    shellSha: input.shellSha,
    frameworkSha: input.frameworkSha,
    criticalBlobs,
  });
  const nonce = input.runtime.randomBytes(16).toString('hex');
  const authorityId = `authority-${operationId}-${nonce.slice(0, 8)}`;
  const reusableSourceGate = input.reusableSourceGate
    && record(input.reusableSourceGate, 'reusable_source_gate').operation_fingerprint === objectiveFingerprint
    ? input.reusableSourceGate
    : undefined;
  const report = reusableSourceGate ?? sourceGate(
    input.runtime,
    input.appSha,
    input.shellSha,
    input.frameworkSha,
    objectiveFingerprint,
  );
  const guard = buildPreNonceDispatchGuard({
    expectedAppSha: input.appSha,
    expectedShellSha: input.shellSha,
    expectedFrameworkSha: input.frameworkSha,
    workflow: input.workflow,
    sourceGateReport: report,
    authorityId,
    operationId,
  }, { runner: input.runtime.runner, cwd: appRoot });
  if (guard.status !== 'passed' || guard.dispatch_allowed !== true) {
    throw new Error(`Stable pre-dispatch guard blocked the operation: ${guard.reason}`);
  }
  const issuedAt = input.runtime.now();
  const authority = createStableOperationAuthority({
    authorityId,
    operationId,
    issuer: text(process.env.GITHUB_ACTOR || runRequired(
      input.runtime,
      'gh',
      ['api', 'user', '--jq', '.login'],
      30_000,
      'Resolve GitHub actor',
      appRoot,
    ), 'issuer'),
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + 90 * 60_000).toISOString(),
    objectiveFingerprint,
    nonce,
    appSha: input.appSha,
    shellSha: input.shellSha,
    frameworkSha: input.frameworkSha,
    desktopAdditionalPlatforms: input.desktopAdditionalPlatforms,
    criticalBlobs,
    sourceGate: report,
    preNonceGuard: guard,
  });
  const priorStandardArtifactRunId = input.priorStandardArtifactRunId
    ? runId(input.priorStandardArtifactRunId, 'prior_standard_artifact_run_id')
    : null;
  const workflowInputs: Record<string, string> = {
    operation: 'standard',
    release_intent: 'new_product',
    product_change_summary: text(input.productChangeSummary, 'product_change_summary'),
    authority_id: authority.authority_id,
    operation_id: authority.operation_id,
    authority_carrier: encodeStableOperationAuthorityCarrier(authority),
    authority_digest: authority.authority_digest,
    desktop_additional_platforms: JSON.stringify(authority.desktop_additional_platforms),
  };
  if (priorStandardArtifactRunId) {
    workflowInputs.prior_standard_artifact_run_id = priorStandardArtifactRunId;
    if (smokeHarnessSha) workflowInputs.smoke_harness_ref = smokeHarnessSha;
  }
  return {
    schema: 'opl_app_stable_dispatch_plan.v1',
    status: 'ready',
    operation: 'standard',
    attempt_id: attemptId('standard', input.runtime),
    version_policy: priorStandardArtifactRunId ? 'preserve_source_tag' : 'explicit_new_product_release',
    workflow_inputs: workflowInputs,
    source: { run_id: null, artifact: null },
    recovery: {
      requested_run_id: priorStandardArtifactRunId,
      artifact_producer_run_id: priorStandardArtifactRunId,
      qualification_run_id: null,
      smoke_harness_ref: smokeHarnessSha ?? null,
      verification_app_ref: null,
    },
    cohort: authority.cohort,
    authority: {
      authority_id: authority.authority_id,
      operation_id: authority.operation_id,
      authority_digest: authority.authority_digest,
    },
  };
}

export function workflowDispatchArgs(
  repository: string,
  workflow: string,
  plan: StableDispatchPlan,
): string[] {
  const args = ['workflow', 'run', workflow, '--repo', repository, '--ref', 'main'];
  for (const [key, value] of Object.entries(plan.workflow_inputs).sort(([left], [right]) => left.localeCompare(right))) {
    args.push('--field', `${key}=${value}`);
  }
  return args;
}

export function attemptId(operation: string, runtime: Runtime): string {
  const timestamp = runtime.now().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${operation}-${timestamp}-${runtime.randomBytes(4).toString('hex')}`;
}

export function validateShellSmokeHarness(runtime: Runtime, value: string): string {
  const expected = sha(value, 'smoke_harness_ref');
  const activeShellBuild = readActiveShellBuildProfile(appRoot);
  const resolved = runRequired(runtime, 'gh', [
    'api', `repos/${activeShellBuild.repository}/git/commits/${expected}`, '--jq', '.sha',
  ], 30_000, `Resolve smoke_harness_ref in ${activeShellBuild.repository} (an App commit is not a Shell harness)`, appRoot);
  if (resolved.trim() !== expected) throw new Error(`smoke_harness_ref must resolve to the exact ${activeShellBuild.repository} commit.`);
  return expected;
}
