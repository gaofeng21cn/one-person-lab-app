import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  canonicalJson,
  digest,
  exactSha,
  objectiveFingerprint,
  record,
  text,
} from './schema.ts';

const legacyStableOperationCriticalBlobPaths = [
  '.github/workflows/release-stable.yml',
  '.github/workflows/_release-bundle.yml',
  '.github/workflows/_release-standard-publish.yml',
  '.github/workflows/opl-first-run-vm.yml',
  'contracts/app-release-channel.json',
  'scripts/download-github-artifact.mjs',
  'scripts/framework-release-adapter.ts',
  'scripts/release-dispatch-guard.ts',
  'scripts/stable-operation-control.ts',
  'scripts/stable-release-dispatch.ts',
  'scripts/stable-operation-publication-record.ts',
  'scripts/stable-release-admission-manifest.ts',
  'scripts/validate-release-source-gate.ts',
] as const;

const preExtractionStableOperationCriticalBlobPaths = [
  ...legacyStableOperationCriticalBlobPaths,
  'scripts/framework-release-adapter-bundle.ts',
  'scripts/framework-release-adapter-plan.ts',
  'scripts/framework-release-adapter-publication.ts',
  'scripts/framework-release-adapter-publication-admission.ts',
  'scripts/framework-release-adapter-publication-full-addon.ts',
  'scripts/framework-release-adapter-publication-github.ts',
  'scripts/framework-release-adapter-publication-latest.ts',
  'scripts/framework-release-adapter-publication-standard.ts',
] as const;

const extractedStableOperationControlPaths = [
  'scripts/stable-operation-control-parts/schema.ts',
  'scripts/stable-operation-control-parts/critical-blobs.ts',
  'scripts/stable-operation-control-parts/authority.ts',
  'scripts/stable-operation-control-parts/consumption.ts',
] as const;

const extractedReleaseDispatchGuardPaths = [
  'scripts/release-dispatch-guard-parts/types.ts',
  'scripts/release-dispatch-guard-parts/owner-reads.ts',
  'scripts/release-dispatch-guard-parts/wire-refs.ts',
  'scripts/release-dispatch-guard-parts/nonce-guards.ts',
] as const;

const extractedStableReleaseDispatchPaths = [
  'scripts/stable-release-dispatch-parts/types.ts',
  'scripts/stable-release-dispatch-parts/artifact-retrieval.ts',
  'scripts/stable-release-dispatch-parts/owner-run-reconciliation.ts',
  'scripts/stable-release-dispatch-parts/plan-source-guards.ts',
] as const;

const extractedReleaseSourceGatePaths = [
  'scripts/validate-release-source-gate-parts/types.ts',
  'scripts/validate-release-source-gate-parts/namespace-evidence.ts',
  'scripts/validate-release-source-gate-parts/environment.ts',
  'scripts/validate-release-source-gate-parts/git-ref-status.ts',
] as const;

const preDispatchExtractionCriticalBlobPaths = [
  ...preExtractionStableOperationCriticalBlobPaths,
  ...extractedStableOperationControlPaths,
  ...extractedReleaseDispatchGuardPaths,
] as const;

const preMacRunnerCriticalBlobPaths = [
  ...preDispatchExtractionCriticalBlobPaths,
  ...extractedStableReleaseDispatchPaths,
  ...extractedReleaseSourceGatePaths,
] as const;

export const stableOperationCriticalBlobPaths = [
  ...preMacRunnerCriticalBlobPaths,
  '.github/workflows/_build-reusable.yml',
  'scripts/macos-release-runner.ts',
  'scripts/macos-release-keychain.ts',
] as const;

export function normalizedCriticalBlobs(value: unknown): Record<string, string> {
  const blobs = record(value, 'critical_blobs');
  const entries = Object.entries(blobs)
    .map(([file, blob]) => [text(file, 'critical_blobs path'), digest(blob, `critical_blobs.${file}`)] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) throw new Error('critical_blobs must bind at least one workflow or contract blob.');
  for (const [file] of entries) {
    if (!/^(?:\.github\/workflows\/|contracts\/|scripts\/)[A-Za-z0-9._/-]+$/.test(file) || file.includes('..')) {
      throw new Error(`critical_blobs path is not allowed: ${file}`);
    }
  }
  const normalized = Object.fromEntries(entries);
  const expected = new Set(stableOperationCriticalBlobPaths);
  // Read already-issued controls so their signed artifacts and source evidence
  // remain recoverable. Current executor admission below requires the full set.
  const historicalPathSets = [
    preMacRunnerCriticalBlobPaths,
    preDispatchExtractionCriticalBlobPaths,
    preDispatchExtractionCriticalBlobPaths.filter(file => file !== 'scripts/stable-release-dispatch.ts'),
    preDispatchExtractionCriticalBlobPaths.filter(file => file !== 'scripts/stable-release-dispatch.ts' && file !== 'scripts/download-github-artifact.mjs'),
    [...preDispatchExtractionCriticalBlobPaths, ...extractedStableReleaseDispatchPaths],
    legacyStableOperationCriticalBlobPaths,
    legacyStableOperationCriticalBlobPaths.filter(file => file !== 'scripts/stable-release-dispatch.ts'),
    legacyStableOperationCriticalBlobPaths.filter(file => file !== 'scripts/stable-release-dispatch.ts' && file !== 'scripts/download-github-artifact.mjs'),
    legacyStableOperationCriticalBlobPaths.filter(file => file !== 'scripts/stable-release-dispatch.ts' && file !== 'scripts/download-github-artifact.mjs' && file !== '.github/workflows/opl-first-run-vm.yml'),
    preExtractionStableOperationCriticalBlobPaths,
    preExtractionStableOperationCriticalBlobPaths.filter(file => file !== 'scripts/stable-release-dispatch.ts'),
    preExtractionStableOperationCriticalBlobPaths.filter(file => file !== 'scripts/stable-release-dispatch.ts' && file !== 'scripts/download-github-artifact.mjs'),
    [...preExtractionStableOperationCriticalBlobPaths, ...extractedStableOperationControlPaths],
    [...preExtractionStableOperationCriticalBlobPaths, ...extractedStableOperationControlPaths]
      .filter(file => file !== 'scripts/stable-release-dispatch.ts'),
    [...preExtractionStableOperationCriticalBlobPaths, ...extractedStableOperationControlPaths]
      .filter(file => file !== 'scripts/stable-release-dispatch.ts' && file !== 'scripts/download-github-artifact.mjs'),
  ];
  const legacy = historicalPathSets.some(paths => Object.keys(normalized).length === paths.length
    && paths.every(file => normalized[file] !== undefined));
  if (!legacy && (
    Object.keys(normalized).length !== expected.size
    || stableOperationCriticalBlobPaths.some((file) => normalized[file] === undefined)
  )) {
    throw new Error(
      `critical_blobs must bind exactly the Stable control paths: ${stableOperationCriticalBlobPaths.join(', ')}.`,
    );
  }
  return normalized;
}

export function stableOperationIdForFrozenCohort(input: {
  objectiveFingerprint: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  criticalBlobs: unknown;
}): string {
  const frozenIdentity = {
    objective_fingerprint: objectiveFingerprint(input.objectiveFingerprint),
    cohort: {
      app_sha: exactSha(input.appSha, 'cohort.app_sha'),
      shell_sha: exactSha(input.shellSha, 'cohort.shell_sha'),
      framework_sha: exactSha(input.frameworkSha, 'cohort.framework_sha'),
    },
    critical_blobs: normalizedCriticalBlobs(input.criticalBlobs),
  };
  return `stable-${crypto.createHash('sha256').update(canonicalJson(frozenIdentity)).digest('hex').slice(0, 32)}`;
}

export function bytesDigest(bytes: Buffer): string {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

export function stableOperationCriticalBlobs(appRoot: string): Record<string, string> {
  const root = path.resolve(appRoot);
  return Object.fromEntries(stableOperationCriticalBlobPaths.map((relativePath) => {
    const candidate = path.resolve(root, relativePath);
    if (!candidate.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Stable operation critical blob escapes the App root: ${relativePath}`);
    }
    const stat = fs.lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Stable operation critical blob must be a regular file: ${relativePath}`);
    }
    return [relativePath, bytesDigest(fs.readFileSync(candidate))];
  }));
}

export function validateCriticalBlobBytes(
  appRoot: string,
  criticalBlobs: Record<string, string>,
): void {
  const root = path.resolve(appRoot);
  for (const [relativePath, expectedDigest] of Object.entries(criticalBlobs)) {
    const candidate = path.resolve(root, relativePath);
    if (!candidate.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Stable operation critical blob escapes the App root: ${relativePath}`);
    }
    const stat = fs.lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Stable operation critical blob must be a regular file: ${relativePath}`);
    }
    if (bytesDigest(fs.readFileSync(candidate)) !== expectedDigest) {
      throw new Error(`Stable operation critical blob drifted: ${relativePath}`);
    }
  }
}
