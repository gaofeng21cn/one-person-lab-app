#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { readAppComponentManifestIdentity } from './read-opl-app-component-manifest-identity.ts';
import { createLatestPointerOverrideAuthority } from './write-latest-pointer-override-authority.ts';

type JsonRecord = Record<string, any>;

const appRepository = 'gaofeng21cn/one-person-lab-app';
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const latestTagPattern =
  /^v[0-9]+\.[0-9]+\.[0-9]+(?:(?:-r[1-9][0-9]*)|(?:-preview\.r[1-9][0-9]*)|(?:-nightly(?:\.r[1-9][0-9]*)?))?$/;

function readJson(filePath: string): JsonRecord {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`Expected a non-empty regular JSON file: ${resolved}`);
  }
  const value = JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected one JSON object: ${resolved}`);
  }
  return value as JsonRecord;
}

function sha256File(filePath: string): string {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function requireEqual(actual: unknown, expected: unknown, label: string): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} does not match the exact pointer operation input.`);
  }
}

function requireDigest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !digestPattern.test(value)) {
    throw new Error(`${label} must be an exact sha256 digest.`);
  }
  return value;
}

function requireTag(value: string, label: string): string {
  if (!latestTagPattern.test(value)) throw new Error(`${label} must identify one exact App version.`);
  return value;
}

function requireTimestamp(value: string, label: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an exact timestamp.`);
  return value;
}

function expectedRemoteAssets(manifest: JsonRecord, manifestPath: string): JsonRecord[] {
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  const normalized = artifacts.map((artifact: JsonRecord) => {
    if (
      typeof artifact?.name !== 'string'
      || !artifact.name
      || !Number.isSafeInteger(artifact.size)
      || artifact.size <= 0
    ) {
      throw new Error('Component manifest contains an invalid public artifact identity.');
    }
    return {
      name: artifact.name,
      size_bytes: artifact.size,
      sha256: requireDigest(artifact.digest, `Component manifest ${artifact.name} digest`),
    };
  });
  normalized.push({
    name: 'opl-app-component-manifest.json',
    size_bytes: fs.statSync(path.resolve(manifestPath)).size,
    sha256: sha256File(manifestPath),
  });
  const names = normalized.map((asset) => asset.name);
  if (new Set(names).size !== names.length) {
    throw new Error('Component manifest public asset names must be unique.');
  }
  return normalized.sort((left, right) => left.name.localeCompare(right.name));
}

function validateReleaseInspection(
  inspection: JsonRecord,
  manifest: JsonRecord,
  manifestPath: string,
): JsonRecord[] {
  requireEqual(inspection.surface_kind, 'opl_app_github_release_inspection.v1', 'Release inspection surface');
  requireEqual(inspection.repository, appRepository, 'Release inspection repository');
  requireEqual(inspection.tag, manifest.release_tag, 'Release inspection tag');
  requireEqual(inspection.release?.exists, true, 'Published release existence');
  requireEqual(inspection.release?.draft, false, 'Published release draft state');
  requireEqual(
    inspection.release?.prerelease,
    manifest.preview_kind === 'nightly',
    'Published release prerelease state',
  );
  requireEqual(inspection.release?.target_commitish, manifest.source_commit, 'Published release source commit');
  if (!Number.isSafeInteger(inspection.release?.id) || inspection.release.id <= 0) {
    throw new Error('Published release must expose one positive GitHub release id.');
  }
  const expected = expectedRemoteAssets(manifest, manifestPath);
  const observed = Array.isArray(inspection.assets)
    ? inspection.assets
      .map((asset: JsonRecord) => ({
        name: asset?.name,
        size_bytes: asset?.size_bytes,
        sha256: asset?.sha256,
      }))
      .sort((left: JsonRecord, right: JsonRecord) => String(left.name).localeCompare(String(right.name)))
    : [];
  requireEqual(observed, expected, 'Published release asset set');
  return expected;
}

export type LatestPointerOperationInput = {
  repository: string;
  componentManifestPath: string;
  releaseInspectionPath: string;
  authorityPath: string;
  expectedCurrentLatestTag: string;
  runId: string;
  runAttempt: string;
  operationStartedAt: string;
  operationDeadlineAt: string;
};

export function validateLatestPointerOperation(input: LatestPointerOperationInput): JsonRecord {
  if (input.repository !== appRepository) {
    throw new Error(`Latest pointer operation is fixed to ${appRepository}.`);
  }
  if (!/^[1-9][0-9]*$/.test(input.runId) || input.runAttempt !== '1') {
    throw new Error('Latest pointer operation requires one exact first-attempt Actions run.');
  }
  const operationStartedAt = requireTimestamp(input.operationStartedAt, 'Operation start');
  const operationDeadlineAt = requireTimestamp(input.operationDeadlineAt, 'Operation deadline');
  if (Date.parse(operationDeadlineAt) <= Date.parse(operationStartedAt)) {
    throw new Error('Latest pointer operation deadline must follow its immutable start.');
  }
  const expectedCurrentLatestTag = requireTag(
    input.expectedCurrentLatestTag,
    'Expected current Latest tag',
  );
  const manifestPath = path.resolve(input.componentManifestPath);
  const manifest = readJson(manifestPath);
  const inspection = readJson(input.releaseInspectionPath);
  const identity = readAppComponentManifestIdentity(
    manifest,
    requireTag(String(manifest.release_tag ?? ''), 'Exact candidate tag'),
    inspection.release?.prerelease === true,
    String(inspection.release?.target_commitish ?? ''),
  );
  if (identity.quality_status !== 'preview' && identity.quality_status !== 'stable') {
    throw new Error('Explicit Latest pointer override requires one exact Stable or Preview build.');
  }
  const authority = readJson(input.authorityPath);
  requireEqual(
    authority,
    createLatestPointerOverrideAuthority(manifest, expectedCurrentLatestTag),
    'Latest pointer override authority',
  );
  const assets = validateReleaseInspection(inspection, manifest, manifestPath);
  const evidence = {
    operation: 'move_latest_pointer',
    repository: appRepository,
    operation_control: {
      run_id: input.runId,
      run_attempt: 1,
      operation_started_at: operationStartedAt,
      operation_deadline_at: operationDeadlineAt,
      protected_environment: 'release-preview-latest',
    },
    candidate: {
      tag: manifest.release_tag,
      release_id: inspection.release.id,
      source_commit: manifest.source_commit,
      component_manifest_digest: manifest.component_manifest_digest,
      component_manifest_file_sha256: sha256File(manifestPath),
      quality_status: identity.quality_status,
      build_trigger: identity.build_trigger,
      preview_kind: identity.preview_kind,
      quality_unchanged: true,
      qualification_disclosure: identity.qualification_disclosure,
    },
    public_assets: assets,
    pointer_authority: {
      authority_digest: requireDigest(authority.authority_digest, 'Latest override authority digest'),
      single_use: true,
      persistent_override: false,
    },
    latest_compare_and_swap: {
      expected_current_tag: expectedCurrentLatestTag,
      candidate_tag: manifest.release_tag,
      exact_expected_current: true,
    },
      required_readback: {
      latest_tag: manifest.release_tag,
      release_assets: 'exact',
      manifest_quality_unchanged: true,
      quality_disclosure_preserved: true,
      non_stable_disclosure_preserved: identity.quality_status === 'preview',
    },
  };
  return {
    schema: 'opl_app_latest_pointer_operation_admission.v1',
    status: 'passed',
    latest_activation_admitted: true,
    input_digest: `sha256:${crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}`,
    ...evidence,
  };
}

export function assertLatestPointerOperationAdmissionReceipt(
  receipt: JsonRecord,
  input: LatestPointerOperationInput,
): void {
  requireEqual(receipt, validateLatestPointerOperation(input), 'Latest pointer operation admission receipt');
}

function required(value: string | undefined, flag: string): string {
  if (!value?.trim()) throw new Error(`Missing --${flag}.`);
  return value.trim();
}

function main(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      repository: { type: 'string', default: appRepository },
      'component-manifest': { type: 'string' },
      'release-inspection': { type: 'string' },
      authority: { type: 'string' },
      'expected-current-latest-tag': { type: 'string' },
      'run-id': { type: 'string' },
      'run-attempt': { type: 'string' },
      'operation-started-at': { type: 'string' },
      'operation-deadline-at': { type: 'string' },
      output: { type: 'string' },
    },
  });
  const receipt = validateLatestPointerOperation({
    repository: required(values.repository, 'repository'),
    componentManifestPath: required(values['component-manifest'], 'component-manifest'),
    releaseInspectionPath: required(values['release-inspection'], 'release-inspection'),
    authorityPath: required(values.authority, 'authority'),
    expectedCurrentLatestTag: required(
      values['expected-current-latest-tag'],
      'expected-current-latest-tag',
    ),
    runId: required(values['run-id'], 'run-id'),
    runAttempt: required(values['run-attempt'], 'run-attempt'),
    operationStartedAt: required(values['operation-started-at'], 'operation-started-at'),
    operationDeadlineAt: required(values['operation-deadline-at'], 'operation-deadline-at'),
  });
  const output = path.resolve(required(values.output, 'output'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
