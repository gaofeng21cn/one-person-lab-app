#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  buildStableAdmissionFailureReceipt,
  buildStableReleaseAdmissionManifest,
  canonicalJson,
  digestPattern,
  firstDifference,
  fullSha,
  object,
  requiredString,
  runId,
  sha256Bytes,
  stableAdmissionManifestDigest,
} from './stable-release-admission-manifest/policy.ts';
import {
  collectObservation,
  parseActiveReleaseRunLookups,
  parseGitHubJsonLookup,
  parseGitHubReleaseNamespacePages,
} from './stable-release-admission-manifest/observation.ts';
import type {
  StableAdmissionFailureReceipt,
  StableAdmissionInput,
  StableAdmissionManifest,
} from './stable-release-admission-manifest/types.ts';

export {
  buildStableAdmissionFailureReceipt,
  buildStableReleaseAdmissionManifest,
  canonicalJson,
  firstDifference,
  parseActiveReleaseRunLookups,
  parseGitHubJsonLookup,
  parseGitHubReleaseNamespacePages,
  stableAdmissionManifestDigest,
};
export type {
  StableAdmissionFailureReceipt,
  StableAdmissionInput,
  StableAdmissionObservation,
  StableAdmissionManifest,
  WorkflowBlob,
  ActiveReleaseRun,
} from './stable-release-admission-manifest/types.ts';

// Keep the release-boundary text contract anchored at this public owner facade;
// implementations live in the policy and observation leaves.
// requiredSecretNames validateReleaseHomebrewDistribution resolveStableReleaseVersion
// assertPromotionTargetIsNewerThanPublishedStable anonymousWebuiTags activeReleaseStatuses
// parseGitHubJsonLookup readOwnerWorkflowRuns raw_standard_version_or_ref_inputs_allowed: false
// read_only_reconcile_without_rerun_redispatch_or_cancel manifest_digest

function writeJson(filePath: string, value: unknown): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function fileDigestOrNull(filePath: string): string | null {
  try {
    return fs.existsSync(filePath) ? sha256Bytes(fs.readFileSync(filePath)) : null;
  } catch {
    return null;
  }
}

export async function verifyStableReleaseAdmissionManifest(options: {
  manifest: StableAdmissionManifest;
  sourceGatePath: string;
  credentialReceiptPath: string;
  expectedDigest: string;
  currentRunId: string;
  appSourceRoot: string;
}): Promise<StableAdmissionManifest> {
  if (!digestPattern.test(options.expectedDigest)) {
    throw new Error('Expected admission manifest digest must use sha256:<64 lowercase hex>.');
  }
  const manifest = object(options.manifest, 'Stable admission manifest') as StableAdmissionManifest;
  if (manifest.schema !== 'opl_stable_release_admission_manifest.v1' || manifest.status !== 'passed') {
    throw new Error('Stable admission manifest schema or status is invalid.');
  }
  const { manifest_digest: declaredDigest, ...core } = manifest;
  const computedDigest = stableAdmissionManifestDigest(
    core as Omit<StableAdmissionManifest, 'manifest_digest'>,
  );
  if (declaredDigest !== computedDigest || options.expectedDigest !== computedDigest) {
    throw new Error(
      `Stable admission manifest digest mismatch: declared=${declaredDigest} expected=${options.expectedDigest} computed=${computedDigest}.`,
    );
  }
  const input: StableAdmissionInput = {
    baseVersion: manifest.version.base,
    releaseIntent: manifest.intent.kind,
    productChangeSummary: manifest.intent.product_change_summary,
    appRef: manifest.cohort.app_sha,
    shellRef: manifest.cohort.shell_sha,
    frameworkRef: manifest.cohort.framework_sha,
    admissionRunId: manifest.apple_credentials.producer_run_id,
  };
  const observation = await collectObservation(
    input,
    options.sourceGatePath,
    options.credentialReceiptPath,
    runId(options.currentRunId, 'Current Standard run id'),
    options.appSourceRoot,
    manifest.checked_at,
  );
  const rebuilt = buildStableReleaseAdmissionManifest(input, observation);
  const difference = firstDifference(manifest, rebuilt);
  if (difference) {
    throw new Error(`Stable admission manifest drifted from fresh production truth at ${difference}.`);
  }
  return rebuilt;
}

function cliOptions() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
      'base-version': { type: 'string' },
      'release-intent': { type: 'string' },
      'product-change-summary': { type: 'string' },
      'app-ref': { type: 'string' },
      'shell-ref': { type: 'string' },
      'framework-ref': { type: 'string' },
      'admission-run-id': { type: 'string' },
      'source-gate': { type: 'string' },
      'credential-receipt': { type: 'string' },
      'app-source-root': { type: 'string' },
      manifest: { type: 'string' },
      'expected-digest': { type: 'string' },
      'current-run-id': { type: 'string' },
      'failure-output': { type: 'string' },
      output: { type: 'string' },
    },
  });
  const command = positionals[0] ?? '';
  const output = requiredString(values.output, '--output');
  const sourceGatePath = path.resolve(requiredString(
    values['source-gate'],
    '--source-gate',
  ));
  const credentialReceiptPath = path.resolve(requiredString(
    values['credential-receipt'],
    '--credential-receipt',
  ));
  const appSourceRoot = path.resolve(requiredString(
    values['app-source-root'],
    '--app-source-root',
  ));
  if (command === 'create') {
    return {
      command,
      output,
      failureOutput: path.resolve(requiredString(values['failure-output'], '--failure-output')),
      sourceGatePath,
      credentialReceiptPath,
      appSourceRoot,
      input: {
        baseVersion: requiredString(values['base-version'], '--base-version'),
        releaseIntent: requiredString(values['release-intent'], '--release-intent') as 'new_product',
        productChangeSummary: requiredString(values['product-change-summary'], '--product-change-summary'),
        appRef: fullSha(values['app-ref'], '--app-ref'),
        shellRef: fullSha(values['shell-ref'], '--shell-ref'),
        frameworkRef: fullSha(values['framework-ref'], '--framework-ref'),
        admissionRunId: runId(values['admission-run-id'], '--admission-run-id'),
      },
    } as const;
  }
  if (command === 'verify') {
    return {
      command,
      output,
      sourceGatePath,
      credentialReceiptPath,
      appSourceRoot,
      manifestPath: path.resolve(requiredString(values.manifest, '--manifest')),
      expectedDigest: requiredString(values['expected-digest'], '--expected-digest'),
      currentRunId: runId(values['current-run-id'], '--current-run-id'),
    } as const;
  }
  throw new Error('Usage: stable-release-admission-manifest.ts <create|verify> --app-source-root <path> [options].');
}

async function main(): Promise<void> {
  const options = cliOptions();
  if (options.command === 'create') {
    fs.rmSync(options.failureOutput, { force: true });
    let phase: StableAdmissionFailureReceipt['phase'] = 'collect_observation';
    try {
      const observation = await collectObservation(
        options.input,
        options.sourceGatePath,
        options.credentialReceiptPath,
        options.input.admissionRunId,
        options.appSourceRoot,
      );
      phase = 'build_manifest';
      const manifest = buildStableReleaseAdmissionManifest(options.input, observation);
      writeJson(options.output, manifest);
      process.stdout.write(`${JSON.stringify({
        status: 'created',
        version: manifest.version.display,
        updater_version: manifest.version.updater,
        manifest_digest: manifest.manifest_digest,
        output: path.resolve(options.output),
      })}\n`);
      return;
    } catch (error) {
      writeJson(options.failureOutput, buildStableAdmissionFailureReceipt({
        input: options.input,
        phase,
        error,
        sourceGateDigest: fileDigestOrNull(options.sourceGatePath),
        credentialReceiptDigest: fileDigestOrNull(options.credentialReceiptPath),
      }));
      throw error;
    }
  }
  const manifest = object(
    JSON.parse(fs.readFileSync(options.manifestPath, 'utf8')),
    'Stable admission manifest',
  ) as StableAdmissionManifest;
  const verified = await verifyStableReleaseAdmissionManifest({
    manifest,
    sourceGatePath: options.sourceGatePath,
    credentialReceiptPath: options.credentialReceiptPath,
    expectedDigest: options.expectedDigest,
    currentRunId: options.currentRunId,
    appSourceRoot: options.appSourceRoot,
  });
  const output = {
    schema: 'opl_stable_release_admission_verification.v1',
    status: 'passed',
    manifest_digest: verified.manifest_digest,
    version: verified.version,
    cohort: verified.cohort,
    source_gate: verified.source_gate,
    admission_run_id: verified.apple_credentials.producer_run_id,
  };
  writeJson(options.output, output);
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

const isMain = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
