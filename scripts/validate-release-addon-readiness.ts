#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs as parseNodeArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  sha256File,
  validateArtifactCohortV2,
  type BuildArtifactCohortV2,
} from './build-artifact-cohort.ts';
import {
  validateArtifactQualificationReceipt,
  type ArtifactQualificationReceiptV1,
} from './artifact-qualification-receipt.ts';
import { asRecord, readJsonFile } from './release-json-helpers.ts';
import { parseStrictBoolean } from './release-readiness-args.ts';

export type ReleaseAddonReadinessOptions = {
  version: string;
  recordPath: string;
  includeFullPackage: boolean;
  runVmSmoke: boolean;
  requireDockerWebui: boolean;
  fullQualificationReceiptPath: string;
  buildArtifactManifestPath: string;
  stableSessionId: string;
  releaseCohortRef: string;
  sourceArtifactRunId: string;
  sourceArtifactName: string;
};

export type FullQualificationOverrideOptions = Pick<
  ReleaseAddonReadinessOptions,
  | 'version'
  | 'fullQualificationReceiptPath'
  | 'buildArtifactManifestPath'
  | 'stableSessionId'
  | 'releaseCohortRef'
  | 'sourceArtifactRunId'
  | 'sourceArtifactName'
>;

type RequiredJob = {
  id: string;
  reason: string;
};

function parseArgs(argv: string[]): ReleaseAddonReadinessOptions {
  const parsed: ReleaseAddonReadinessOptions = {
    version: process.env.OPL_RELEASE_VERSION || '',
    recordPath: process.env.OPL_RELEASE_ADDON_READINESS_RECORD || '',
    includeFullPackage: parseStrictBoolean(process.env.OPL_INCLUDE_FULL_PACKAGE, true),
    runVmSmoke: parseStrictBoolean(process.env.OPL_RUN_VM_SMOKE, true),
    requireDockerWebui: parseStrictBoolean(process.env.OPL_REQUIRE_DOCKER_WEBUI, true),
    fullQualificationReceiptPath: '',
    buildArtifactManifestPath: '',
    stableSessionId: '',
    releaseCohortRef: '',
    sourceArtifactRunId: '',
    sourceArtifactName: '',
  };
  const { values } = parseNodeArgs({
    args: argv,
    options: {
      version: { type: 'string' },
      record: { type: 'string' },
      'include-full-package': { type: 'string' },
      'run-vm-smoke': { type: 'string' },
      'require-docker-webui': { type: 'string' },
      'full-qualification-receipt': { type: 'string' },
      'build-artifact-manifest': { type: 'string' },
      'stable-session-id': { type: 'string' },
      'release-cohort-ref': { type: 'string' },
      'source-artifact-run-id': { type: 'string' },
      'source-artifact-name': { type: 'string' },
    },
  });
  parsed.version = values.version ?? parsed.version;
  parsed.recordPath = values.record ?? parsed.recordPath;
  if (values['include-full-package'] !== undefined) {
    parsed.includeFullPackage = parseStrictBoolean(values['include-full-package']);
  }
  if (values['run-vm-smoke'] !== undefined) {
    parsed.runVmSmoke = parseStrictBoolean(values['run-vm-smoke']);
  }
  if (values['require-docker-webui'] !== undefined) {
    parsed.requireDockerWebui = parseStrictBoolean(values['require-docker-webui']);
  }
  parsed.fullQualificationReceiptPath = values['full-qualification-receipt'] ?? '';
  parsed.buildArtifactManifestPath = values['build-artifact-manifest'] ?? '';
  parsed.stableSessionId = values['stable-session-id'] ?? '';
  parsed.releaseCohortRef = values['release-cohort-ref'] ?? '';
  parsed.sourceArtifactRunId = values['source-artifact-run-id'] ?? '';
  parsed.sourceArtifactName = values['source-artifact-name'] ?? '';
  if (!parsed.version.trim()) throw new Error('Pass --version <version> or set OPL_RELEASE_VERSION.');
  if (!parsed.recordPath.trim()) throw new Error('Pass --record <release-addon-readiness-summary.json>.');
  return parsed;
}

function buildRequiredJobs(options: ReleaseAddonReadinessOptions): RequiredJob[] {
  const jobs: RequiredJob[] = [];
  if (options.includeFullPackage) {
    jobs.push(
      { id: 'full-first-install', reason: 'Full first-install package was requested.' },
      { id: 'remote-verify-full', reason: 'Full remote assets must be verified before promotion.' },
    );
    if (options.runVmSmoke) {
      jobs.push({
        id: 'full-first-run-vm-smoke',
        reason: 'Full clean VM first-run smoke was requested.',
      });
    }
  }
  if (options.requireDockerWebui) {
    jobs.push(
      { id: 'docker-webui-smoke', reason: 'Docker/WebUI smoke evidence is required for this stable cohort.' },
      { id: 'webui-ghcr-publish', reason: 'GHCR WebUI publish evidence is required for this stable cohort.' },
      {
        id: 'docker-webui-clean-vm-evidence',
        reason: 'Docker/WebUI clean VM evidence is required for this stable cohort.',
      },
      {
        id: 'operator-evidence-bundle-validation',
        reason: 'Operator evidence bundle validation is required for the reviewed same cohort.',
      },
    );
  }
  return jobs;
}

export function validateFullQualificationOverride(options: FullQualificationOverrideOptions): {
  applied: boolean;
  errors: string[];
  artifactSha256: string | null;
  qualificationRunId: string | null;
} {
  const inputs = [
    options.fullQualificationReceiptPath,
    options.buildArtifactManifestPath,
    options.stableSessionId,
    options.releaseCohortRef,
    options.sourceArtifactRunId,
    options.sourceArtifactName,
  ];
  if (inputs.every((value) => !value)) {
    return { applied: false, errors: [], artifactSha256: null, qualificationRunId: null };
  }
  if (inputs.some((value) => !value)) {
    return {
      applied: false,
      errors: ['Full qualification override requires receipt, build manifest, session, cohort, source run, and source artifact name together.'],
      artifactSha256: null,
      qualificationRunId: null,
    };
  }

  const manifest = readJsonFile(options.buildArtifactManifestPath) as BuildArtifactCohortV2;
  const receipt = readJsonFile(options.fullQualificationReceiptPath) as ArtifactQualificationReceiptV1;
  const errors = validateArtifactCohortV2(manifest, {
    appSha: manifest.cohort?.app_sha,
    shellSha: manifest.cohort?.shell_sha,
    frameworkSha: manifest.cohort?.framework_sha ?? undefined,
    version: options.version,
    actionsRunId: options.sourceArtifactRunId,
    stableSessionId: options.stableSessionId,
    releaseCohortRef: options.releaseCohortRef,
  });
  if (manifest.actions?.artifact_name !== options.sourceArtifactName) {
    errors.push(`source artifact name is ${String(manifest.actions?.artifact_name)}`);
  }
  errors.push(...validateArtifactQualificationReceipt(receipt, {
    stableSessionId: options.stableSessionId,
    releaseCohortRef: options.releaseCohortRef,
    version: options.version,
    packageProfile: 'full',
    result: 'passed',
    sourceArtifactRunId: options.sourceArtifactRunId,
    sourceArtifactName: options.sourceArtifactName,
    qualificationRuntime: manifest.qualification_runtime,
    artifactSha256: manifest.artifact?.sha256,
    appSha: manifest.cohort?.app_sha,
    shellSha: manifest.cohort?.shell_sha,
    frameworkSha: manifest.cohort?.framework_sha ?? undefined,
  }));
  const manifestSha256 = sha256File(options.buildArtifactManifestPath);
  if (receipt.build_manifest?.sha256 !== manifestSha256) {
    errors.push(`build manifest sha256 is ${String(receipt.build_manifest?.sha256)}`);
  }
  if (receipt.build_manifest?.smoke_harness_sha256 !== manifest.digests?.smoke_harness_sha256) {
    errors.push(`build manifest smoke_harness_sha256 is ${String(receipt.build_manifest?.smoke_harness_sha256)}`);
  }
  return {
    applied: errors.length === 0,
    errors,
    artifactSha256: receipt.artifact?.sha256 ?? null,
    qualificationRunId: receipt.qualification?.run_id ?? null,
  };
}

export function validateReleaseAddonReadiness(options: ReleaseAddonReadinessOptions) {
  const record = asRecord(readJsonFile(options.recordPath), 'release_addon_readiness_summary');
  const jobResults = asRecord(record.job_results, 'release_addon_readiness_summary.job_results');
  const errors: string[] = [];
  if (record.schema !== 'opl_release_addon_readiness_summary.v1') {
    errors.push(`schema is ${String(record.schema)}`);
  }
  if (record.version !== options.version) {
    errors.push(`version is ${String(record.version)}`);
  }
  const qualificationOverride = validateFullQualificationOverride(options);
  errors.push(...qualificationOverride.errors.map((error) => `Full qualification override: ${error}`));
  const effectiveJobResults = qualificationOverride.applied
    ? { ...jobResults, 'full-first-run-vm-smoke': 'success' }
    : jobResults;
  for (const job of buildRequiredJobs(options)) {
    if (effectiveJobResults[job.id] !== 'success') {
      errors.push(`${job.id} is ${String(effectiveJobResults[job.id] ?? 'missing')}: ${job.reason}`);
    }
  }
  return {
    schema: 'opl_release_addon_readiness_validation.v1',
    status: errors.length === 0 ? 'verified' : 'blocked',
    version: options.version,
    record: options.recordPath,
    required_jobs: buildRequiredJobs(options).map((job) => job.id),
    job_results: effectiveJobResults,
    full_qualification_override: {
      applied: qualificationOverride.applied,
      job: 'full-first-run-vm-smoke',
      artifact_sha256: qualificationOverride.artifactSha256,
      qualification_run_id: qualificationOverride.qualificationRunId,
    },
    errors,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const summary = validateReleaseAddonReadiness(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (summary.status !== 'verified') process.exit(1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
