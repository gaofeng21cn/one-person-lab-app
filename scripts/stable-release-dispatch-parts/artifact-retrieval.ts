import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateStableOperationControl,
} from '../stable-operation-control.ts';
import {
  defaultWorkflow,
  record,
  runId,
  runRequired,
  type Runtime,
  type WorkflowArtifact,
} from './types.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readJsonFile(filePath: string): unknown {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`Expected one non-empty regular JSON file: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown;
}

export function selectCheckpointArtifact(artifacts: WorkflowArtifact[], sourceRunId: string): string {
  const id = runId(sourceRunId, 'source_run_id');
  const preferredNames = [
    `opl-release-full-checkpoint-${id}`,
    `opl-release-append-full-operation-checkpoint-v2-${id}`,
    `opl-release-standard-operation-checkpoint-${id}`,
    `opl-release-standard-checkpoint-${id}`,
  ];
  for (const expected of preferredNames) {
    const matches = artifacts.filter((artifact) => !artifact.expired && artifact.name === expected);
    if (matches.length > 1) {
      throw new Error(`Run ${id} exposes multiple reusable ${expected} artifacts.`);
    }
    if (matches.length === 1) return expected;
  }
  throw new Error(`Run ${id} exposes no reusable Standard or Full checkpoint.`);
}

export function selectReusableFullCheckpointArtifact(
  artifacts: WorkflowArtifact[],
  sourceRunId: string,
): string | null {
  const id = runId(sourceRunId, 'source_run_id');
  for (const expected of [
    `opl-release-full-checkpoint-${id}`,
    `opl-release-append-full-operation-checkpoint-v2-${id}`,
  ]) {
    const matches = artifacts.filter((artifact) => !artifact.expired && artifact.name === expected);
    if (matches.length > 1) {
      throw new Error(`Run ${id} exposes multiple reusable ${expected} artifacts.`);
    }
    if (matches.length === 1) return expected;
  }
  return null;
}

export function reusableFullBuildCohorts(artifacts: WorkflowArtifact[]): WorkflowArtifact[] {
  return artifacts.filter((artifact) => (
    !artifact.expired
    && /^opl-full-first-install-dmg-.+-mac-arm64-cohort$/.test(artifact.name)
  ));
}

export function selectQualifiedStandardCheckpointArtifact(
  artifacts: WorkflowArtifact[],
  sourceRunId: string,
  requestedArtifact?: string,
): string {
  const id = runId(sourceRunId, 'source_run_id');
  const checkpoint = `opl-release-standard-checkpoint-${id}`;
  const operationCheckpoint = `opl-release-standard-operation-checkpoint-${id}`;
  const bound = `opl-release-standard-bound-${id}`;
  const expected = requestedArtifact ?? [checkpoint, operationCheckpoint, bound].find(name => artifacts.some(artifact => !artifact.expired && artifact.name === name)) ?? checkpoint;
  if (![checkpoint, operationCheckpoint, `opl-release-standard-published-${id}`, bound].includes(expected)) {
    throw new Error('Standard recovery requires the exact run-bound qualification or publication checkpoint.');
  }
  const matches = artifacts.filter((artifact) => !artifact.expired && artifact.name === expected);
  if (matches.length !== 1) {
    throw new Error(`Run ${id} must expose exactly one qualified Standard checkpoint; found ${matches.length}.`);
  }
  if (expected === bound) {
    for (const required of [`opl-release-bundle-${id}`, `opl-first-run-vm-standard-${id}`,
      `opl-qualification-attempt-standard-${id}`, `opl-stable-operation-consumption-${id}`]) {
      if (artifacts.filter(artifact => !artifact.expired && artifact.name === required).length !== 1) {
        throw new Error(`Qualified Standard checkpoint recovery requires exactly one ${required}.`);
      }
    }
  }
  return matches[0]!.name;
}

export function selectReusableStandardCheckpointArtifact(
  artifacts: WorkflowArtifact[],
  sourceRunId: string,
): string {
  const id = runId(sourceRunId, 'source_run_id');
  for (const expected of [
    `opl-release-standard-operation-checkpoint-${id}`,
    `opl-release-standard-checkpoint-${id}`,
  ]) {
    const matches = artifacts.filter((artifact) => !artifact.expired && artifact.name === expected);
    if (matches.length > 1) {
      throw new Error(`Run ${id} exposes multiple reusable ${expected} artifacts.`);
    }
    if (matches.length === 1) return expected;
  }
  throw new Error(`Run ${id} exposes no reusable Standard checkpoint.`);
}

export function isFullCheckpointArtifact(sourceArtifact: string, sourceRunId: string): boolean {
  return sourceArtifact === `opl-release-full-checkpoint-${sourceRunId}`
    || sourceArtifact === `opl-release-append-full-operation-checkpoint-v2-${sourceRunId}`;
}

export function reusableFullFinalizerInput(artifacts: readonly WorkflowArtifact[], sourceRunId: string): WorkflowArtifact | undefined {
  const id = runId(sourceRunId, 'source_run_id');
  const live = artifacts.filter(artifact => !artifact.expired);
  const matches = live.filter(artifact => artifact.name.startsWith('opl-full-finalizer-input-') && artifact.name.endsWith(`-${id}`));
  if (matches.length > 1) throw new Error(`Run ${id} exposes multiple Full finalizer inputs.`);
  if (matches.length && live.some(artifact => artifact.name.startsWith('opl-full-apple-recovery-'))) {
    throw new Error(`Run ${id} contains Apple submission recovery evidence; reconcile that submission before finalization.`);
  }
  return matches[0];
}

export function readFullCheckpointCohort(
  runtime: Runtime,
  repository: string,
  sourceRunId: string,
  artifacts: WorkflowArtifact[],
): unknown {
  const matches = reusableFullBuildCohorts(artifacts);
  const handoff = matches.length === 0 ? reusableFullFinalizerInput(artifacts, sourceRunId) : undefined;
  if (matches.length !== 1 && !handoff) {
    throw new Error(`Run ${sourceRunId} must expose exactly one reusable Full build cohort or unsubmitted finalizer input; found ${matches.length}.`);
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-checkpoint-cohort-'));
  try {
    downloadExactWorkflowArtifact(runtime, repository, sourceRunId, handoff?.name ?? matches[0]!.name, tempRoot);
    return readJsonFile(path.join(tempRoot, handoff ? 'handoff-manifest.json' : 'opl-build-cohort.json'));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function downloadExactWorkflowArtifact(
  runtime: Runtime,
  repository: string,
  sourceRunId: string,
  artifactName: string,
  destination: string,
): void {
  // Use the same digest-verified downloader as candidate recovery. A connector
  // may seed its cache when this executor cannot follow GitHub's ZIP redirect;
  // every cache hit is still checked against fresh exact-run GitHub metadata.
  runRequired(runtime, process.execPath, [
    '--use-env-proxy', '--input-type=module', '--eval',
    'import { downloadArtifact } from "./scripts/download-github-artifact.mjs"; '
      + 'const [repository, run, name, destination, cache] = process.argv.slice(1); '
      + 'await downloadArtifact({ ...process.env, GITHUB_REPOSITORY: repository, '
      + 'OPL_ARTIFACT_RUN_ID: run, OPL_ARTIFACT_NAME: name, '
      + 'OPL_ARTIFACT_DEST: destination, OPL_ARTIFACT_CACHE: cache });',
    repository, runId(sourceRunId, 'source_gate_run_id'),
    artifactName, destination,
    process.env.OPL_ARTIFACT_CACHE || path.join(os.tmpdir(), 'opl-release-artifact-cache'),
  ], 2 * 60_000, `Download exact workflow artifact ${artifactName}`, appRoot);
}

export function downloadStableSourceEvidence(
  runtime: Runtime,
  repository: string,
  sourceRunId: string,
  destination: string,
): void {
  downloadExactWorkflowArtifact(runtime, repository, sourceRunId, `opl-stable-operation-control-${sourceRunId}`, destination);
}

export function readReusableStandardSourceGate(
  runtime: Runtime,
  repository: string,
  sourceRunId: string,
): unknown {
  const source = record(JSON.parse(runRequired(
    runtime,
    'gh',
    ['api', `repos/${repository}/actions/runs/${sourceRunId}`],
    30_000,
    'Read original Standard owner',
    appRoot,
  )), 'source run');
  if (String(source.id) !== sourceRunId || source.run_attempt !== 1 || source.event !== 'workflow_dispatch'
    || source.path !== defaultWorkflow || source.status !== 'completed' || source.conclusion !== 'failure') {
    throw new Error('Standard source-gate reuse requires the exact failed one-shot Standard owner.');
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-source-evidence-'));
  try {
    downloadStableSourceEvidence(runtime, repository, sourceRunId, tempRoot);
    const control = validateStableOperationControl(readJsonFile(path.join(tempRoot, 'stable-operation-control.json')));
    const bytes = fs.readFileSync(path.join(tempRoot, 'source-gate.json'));
    const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
    // Actions head_sha identifies the workflow executor; control.cohort binds
    // the immutable product source, which may precede that executor.
    if (control.run_id !== sourceRunId || control.source_gate_digest !== digest) {
      throw new Error('Original Standard source-gate bytes do not match their run-bound control.');
    }
    // The pre-nonce guard below revalidates the report against the requested
    // immutable cohort. New workflow and harness changes have their own checks.
    return JSON.parse(bytes.toString('utf8'));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function workflowArtifacts(
  runtime: Runtime,
  repository: string,
  sourceRunId: string,
): WorkflowArtifact[] {
  const output = runRequired(
    runtime,
    'gh',
    ['api', `repos/${repository}/actions/runs/${runId(sourceRunId, 'source_run_id')}/artifacts?per_page=100`, '--paginate', '--slurp'],
    30_000,
    `Read artifacts for run ${sourceRunId}`,
    appRoot,
  );
  const pages = JSON.parse(output) as unknown;
  if (!Array.isArray(pages)) throw new Error('GitHub artifact response must be an array of pages.');
  const artifacts = pages.flatMap((page) => {
    const payload = record(page, 'GitHub artifact page');
    if (!Array.isArray(payload.artifacts)) throw new Error('GitHub artifact page lacks artifacts.');
    return payload.artifacts;
  });
  return artifacts.map((value) => {
    const artifact = record(value, 'GitHub artifact');
    if (
      !Number.isSafeInteger(artifact.id)
      || typeof artifact.name !== 'string'
      || typeof artifact.expired !== 'boolean'
    ) throw new Error('GitHub artifact identity is invalid.');
    return { id: Number(artifact.id), name: artifact.name, expired: artifact.expired };
  });
}

const fullCandidatePackageName = /^opl-full-first-install-(?!dmg-).+-mac-arm64$/;
const fullCandidateCohortName = /^opl-full-first-install-dmg-.+-mac-arm64-cohort$/;

export function selectPriorFullCandidateRunId(
  artifacts: readonly WorkflowArtifact[],
  rootSourceRunId: string,
): string | undefined {
  const root = runId(rootSourceRunId, 'root_source_run_id');
  const live = artifacts.filter((artifact) => !artifact.expired);
  const hasReceipt = live.some((artifact) => artifact.name === `opl-full-candidate-receipt-${root}`);
  const hasPackage = live.some((artifact) => fullCandidatePackageName.test(artifact.name));
  const hasCohort = live.some((artifact) => fullCandidateCohortName.test(artifact.name));
  return hasReceipt && hasPackage && hasCohort ? root : undefined;
}
