import { ghJson } from './github.ts';

import {
  digestPattern,
  record,
  releaseRepo,
  text,
  type JsonRecord,
  type PreviewOperation,
} from './contract.ts';


export function verifyArtifactTransport(input: {
  operation: PreviewOperation;
  repo: string;
  artifactId: string;
  artifactName: string;
  artifactDigest: string;
  runId: string;
  now?: Date;
}, inspectArtifact: (repo: string, artifactId: string) => JsonRecord | null = (repo, artifactId) =>
  ghJson(['api', `repos/${repo}/actions/artifacts/${artifactId}`])): JsonRecord {
  if (input.repo !== releaseRepo) throw new Error(`Artifact transport is fixed to ${releaseRepo}.`);
  if (!/^[1-9][0-9]*$/.test(input.artifactId) || !/^[1-9][0-9]*$/.test(input.runId)) {
    throw new Error('Artifact and run ids must be positive decimal identifiers.');
  }
  if (input.artifactName !== `opl-manual-full-preview-${input.operation}-${input.runId}`) {
    throw new Error('Artifact name is not run-scoped to the Manual Full preview workflow.');
  }
  if (!digestPattern.test(input.artifactDigest)) {
    throw new Error('Artifact action output digest must be an exact lowercase SHA-256 digest.');
  }
  const artifactDigestRef = `sha256:${input.artifactDigest}`;
  const artifact = inspectArtifact(input.repo, input.artifactId);
  if (!artifact) throw new Error('Actions artifact is missing.');
  const workflowRun = record(artifact.workflow_run, 'artifact workflow_run');
  const expiresAt = Date.parse(text(artifact.expires_at, 'artifact expires_at'));
  const now = (input.now ?? new Date()).getTime();
  if (
    String(artifact.id) !== input.artifactId
    || artifact.name !== input.artifactName
    || String(workflowRun.id) !== input.runId
    || artifact.expired === true
    || !Number.isFinite(expiresAt)
    || expiresAt <= now
    || artifact.digest !== artifactDigestRef
  ) {
    throw new Error('Actions artifact identity, ownership, expiry, or digest readback is invalid.');
  }
  return {
    schema: 'opl_manual_full_preview_artifact_transport_receipt.v1',
    status: 'verified',
    repository: input.repo,
    run_id: input.runId,
    artifact_id: input.artifactId,
    artifact_name: input.artifactName,
    artifact_digest: artifactDigestRef,
    expires_at: artifact.expires_at,
  };
}
