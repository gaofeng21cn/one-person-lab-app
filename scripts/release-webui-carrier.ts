#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

type JsonRecord = Record<string, unknown>;

type ExpectedIdentity = {
  version?: string;
  bundleDigest?: string;
  cohortRef?: string;
  appSha?: string;
  shellSha?: string;
  frameworkSha?: string;
  architecture?: string;
};

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const gitShaPattern = /^[0-9a-f]{40}$/;
const versionPattern = /^[0-9]{2}\.(?:[1-9]|1[0-2])\.(?:[1-9]|[12][0-9]|3[01])(?:-r[1-9][0-9]*|-preview\.r[1-9][0-9]*|-nightly(?:\.r[1-9][0-9]*)?)?$/;
const immutableImagePattern = /^[a-z0-9.-]+(?::[0-9]+)?\/[a-z0-9._/-]+@(sha256:[0-9a-f]{64})$/;
const requiredInputIds = [
  'app_source',
  'base_image',
  'codex_cli',
  'dockerfile',
  'framework_seed',
  'qualification_harness',
  'shell_webui_source',
] as const;

function fail(message: string): never {
  throw new Error(message);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} must contain exactly [${expected.join(', ')}], got [${actual.join(', ')}]`);
  }
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) return fail(`${label} must be a non-empty string`);
  return value;
}

function exactString(value: unknown, expected: string, label: string): string {
  const actual = stringValue(value, label);
  if (actual !== expected) fail(`${label} expected ${expected}, got ${actual}`);
  return actual;
}

function digestValue(value: unknown, label: string): string {
  const actual = stringValue(value, label);
  if (!digestPattern.test(actual)) fail(`${label} must be a sha256 digest reference`);
  return actual;
}

function gitShaValue(value: unknown, label: string): string {
  const actual = stringValue(value, label);
  if (!gitShaPattern.test(actual)) fail(`${label} must be a 40-character lowercase Git SHA`);
  return actual;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) return fail(`${label} must be a positive integer`);
  return Number(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as JsonRecord;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}

function sha256(bytes: string | Buffer): string {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function readJson(filePath: string, label: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fileDigest(filePath: string): string {
  return sha256(fs.readFileSync(filePath));
}

function verifyDockerContextPolicy(dockerIgnorePath: string): JsonRecord {
  let rules: string[];
  try {
    rules = fs
      .readFileSync(dockerIgnorePath, 'utf8')
      .split(/\r?\n/)
      .map((rule) => rule.trim())
      .filter((rule) => rule && !rule.startsWith('#'));
  } catch (error) {
    fail(`Shell .dockerignore is unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  const recursiveTgzRule = '**/*.tgz';
  const frozenCodexException = '!.opl-frozen-inputs/codex-cli.tgz';
  const recursiveIndex = rules.indexOf(recursiveTgzRule);
  const tgzRules = rules.filter((rule) => rule.endsWith('.tgz'));
  if (
    recursiveIndex < 0 ||
    rules[recursiveIndex + 1] !== frozenCodexException ||
    tgzRules.length !== 2 ||
    tgzRules[0] !== recursiveTgzRule ||
    tgzRules[1] !== frozenCodexException
  ) {
    fail('Shell Docker context must recursively exclude tgz files and admit only the frozen Codex artifact');
  }
  return {
    schema: 'opl_app_webui_docker_context_policy_verification.v1',
    status: 'passed',
    recursive_tgz_rule: recursiveTgzRule,
    frozen_codex_exception: frozenCodexException,
  };
}

function verifyCodexArtifact(buildInputPath: string, artifactDirectory: string): JsonRecord {
  const input = validateBuildInput(readJson(buildInputPath, 'build input'));
  const inputs = input.inputs as JsonRecord[];
  const codexInput = inputs.find((candidate) => candidate.id === 'codex_cli');
  if (!codexInput) fail('build input has no codex_cli input');
  const codexRef = stringValue(codexInput.ref, 'inputs.codex_cli.ref');
  const codexVersion = codexRef.slice('@openai/codex@'.length);

  const directoryPath = path.resolve(artifactDirectory);
  let directoryStat: fs.Stats;
  try {
    directoryStat = fs.lstatSync(directoryPath);
  } catch (error) {
    fail(`frozen Codex artifact directory is missing: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    fail('frozen Codex artifact path must be a real directory');
  }
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  if (entries.length !== 1 || entries[0].name !== 'codex-cli.tgz') {
    fail('frozen Codex artifact must contain exactly one entry named codex-cli.tgz');
  }
  const artifactPath = path.join(directoryPath, entries[0].name);
  const artifactStat = fs.lstatSync(artifactPath);
  if (!entries[0].isFile() || entries[0].isSymbolicLink() || !artifactStat.isFile() || artifactStat.isSymbolicLink()) {
    fail('frozen Codex artifact codex-cli.tgz must be a regular file, never a symlink');
  }
  const artifactDigest = fileDigest(artifactPath);
  exactString(artifactDigest, String(codexInput.digest), 'frozen Codex artifact digest');
  const artifactSize = positiveInteger(artifactStat.size, 'frozen Codex artifact size');
  if (artifactSize !== codexInput.size_bytes) {
    fail(`frozen Codex artifact size expected ${String(codexInput.size_bytes)}, got ${artifactSize}`);
  }

  const listing = spawnSync('tar', ['-tzf', artifactPath], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (listing.status !== 0) {
    fail(`frozen Codex artifact is not a readable tgz: ${listing.stderr.trim()}`);
  }
  const packageJsonEntries = listing.stdout
    .split(/\r?\n/)
    .map((entry) => entry.replace(/^\.\//, ''))
    .filter((entry) => entry === 'package/package.json');
  if (packageJsonEntries.length !== 1) {
    fail('frozen Codex artifact must contain exactly one package/package.json');
  }
  const packageJsonRead = spawnSync('tar', ['-xOzf', artifactPath, 'package/package.json'], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (packageJsonRead.status !== 0) {
    fail(`cannot read frozen Codex package identity: ${packageJsonRead.stderr.trim()}`);
  }
  let packageJson: JsonRecord;
  try {
    packageJson = record(JSON.parse(packageJsonRead.stdout) as unknown, 'frozen Codex package.json');
  } catch (error) {
    fail(`frozen Codex package.json is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  exactString(packageJson.name, '@openai/codex', 'frozen Codex package name');
  exactString(packageJson.version, codexVersion, 'frozen Codex package version');
  return {
    schema: 'opl_app_webui_codex_artifact_verification.v1',
    status: 'passed',
    artifact_name: 'codex-cli.tgz',
    ref: codexRef,
    digest: artifactDigest,
    size_bytes: artifactSize,
    package_name: packageJson.name,
    package_version: packageJson.version,
  };
}

function validateRelease(value: unknown): JsonRecord {
  const release = record(value, 'release');
  exactKeys(release, ['version', 'bundle_digest', 'cohort_ref'], 'release');
  const version = stringValue(release.version, 'release.version');
  if (!versionPattern.test(version)) fail('release.version must use YY.M.D or YY.M.D-rN');
  return {
    version,
    bundle_digest: digestValue(release.bundle_digest, 'release.bundle_digest'),
    cohort_ref: digestValue(release.cohort_ref, 'release.cohort_ref'),
  };
}

function validateCohort(value: unknown): JsonRecord {
  const cohort = record(value, 'cohort');
  exactKeys(cohort, ['app_sha', 'shell_sha', 'framework_sha'], 'cohort');
  return {
    app_sha: gitShaValue(cohort.app_sha, 'cohort.app_sha'),
    shell_sha: gitShaValue(cohort.shell_sha, 'cohort.shell_sha'),
    framework_sha: gitShaValue(cohort.framework_sha, 'cohort.framework_sha'),
  };
}

function validateSourceCutoff(value: unknown): JsonRecord {
  const cutoff = record(value, 'source_cutoff');
  exactKeys(
    cutoff,
    [
      'observed_at',
      'policy',
      'frozen_base_release_set',
      'post_freeze_remote_refresh_allowed',
      'later_authority_advancement_invalidates_bundle',
    ],
    'source_cutoff',
  );
  const observedAt = stringValue(cutoff.observed_at, 'source_cutoff.observed_at');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(observedAt) || Number.isNaN(Date.parse(observedAt))) {
    fail('source_cutoff.observed_at must be a canonical UTC timestamp');
  }
  exactString(cutoff.policy, 'single_read_at_freeze_admission', 'source_cutoff.policy');
  if (cutoff.post_freeze_remote_refresh_allowed !== false) {
    fail('source_cutoff.post_freeze_remote_refresh_allowed must be false');
  }
  if (cutoff.later_authority_advancement_invalidates_bundle !== false) {
    fail('source_cutoff.later_authority_advancement_invalidates_bundle must be false');
  }
  if (cutoff.frozen_base_release_set !== null) {
    fail('source_cutoff.frozen_base_release_set must be null for App Standard composition');
  }
  return {
    observed_at: observedAt,
    policy: 'single_read_at_freeze_admission',
    frozen_base_release_set: null,
    post_freeze_remote_refresh_allowed: false,
    later_authority_advancement_invalidates_bundle: false,
  };
}

function validatePlatform(value: unknown): JsonRecord {
  const platform = record(value, 'platform');
  exactKeys(platform, ['os', 'architecture'], 'platform');
  exactString(platform.os, 'linux', 'platform.os');
  exactString(platform.architecture, 'amd64', 'platform.architecture');
  return { os: 'linux', architecture: 'amd64' };
}

function validateInputs(value: unknown, cohort: JsonRecord): JsonRecord[] {
  if (!Array.isArray(value)) fail('inputs must be an array');
  const inputs = value.map((candidate, index) => {
    const input = record(candidate, `inputs[${index}]`);
    exactKeys(input, ['id', 'ref', 'digest', 'size_bytes'], `inputs[${index}]`);
    const id = stringValue(input.id, `inputs[${index}].id`);
    if (!requiredInputIds.includes(id as (typeof requiredInputIds)[number])) {
      fail(`inputs[${index}].id is not an allowed frozen WebUI input: ${id}`);
    }
    return {
      id,
      ref: stringValue(input.ref, `inputs[${index}].ref`),
      digest: digestValue(input.digest, `inputs[${index}].digest`),
      size_bytes: positiveInteger(input.size_bytes, `inputs[${index}].size_bytes`),
    };
  });
  inputs.sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const ids = inputs.map((input) => String(input.id));
  if (ids.length !== requiredInputIds.length || ids.some((id, index) => id !== requiredInputIds[index])) {
    fail(`inputs must contain each required id exactly once: ${requiredInputIds.join(', ')}`);
  }
  const byId = new Map(inputs.map((input) => [String(input.id), input]));
  exactString(byId.get('app_source')?.ref, String(cohort.app_sha), 'inputs.app_source.ref');
  exactString(byId.get('shell_webui_source')?.ref, String(cohort.shell_sha), 'inputs.shell_webui_source.ref');
  exactString(byId.get('framework_seed')?.ref, String(cohort.framework_sha), 'inputs.framework_seed.ref');
  exactString(byId.get('dockerfile')?.ref, 'shells/aionui/Dockerfile', 'inputs.dockerfile.ref');
  exactString(
    byId.get('qualification_harness')?.ref,
    'scripts/validate-webui-runtime-image.ts',
    'inputs.qualification_harness.ref',
  );
  const baseImage = byId.get('base_image');
  const baseRefMatch = String(baseImage?.ref).match(/@(sha256:[0-9a-f]{64})$/);
  if (!baseRefMatch) fail('inputs.base_image.ref must be an immutable OCI digest reference');
  exactString(baseRefMatch[1], String(baseImage?.digest), 'inputs.base_image ref digest');
  const codexRef = String(byId.get('codex_cli')?.ref);
  if (!/^@openai\/codex@[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(codexRef)) {
    fail('inputs.codex_cli.ref must be an exact @openai/codex version, never latest or a range');
  }
  return inputs;
}

function buildInputCore(raw: unknown): JsonRecord {
  const input = record(raw, 'build input');
  const allowedKeys = ['schema', 'release', 'source_cutoff', 'cohort', 'platform', 'inputs'];
  if ('content_fingerprint' in input) allowedKeys.push('content_fingerprint');
  exactKeys(input, allowedKeys, 'build input');
  exactString(input.schema, 'opl_app_webui_build_input.v1', 'build input.schema');
  const cohort = validateCohort(input.cohort);
  return {
    schema: 'opl_app_webui_build_input.v1',
    release: validateRelease(input.release),
    source_cutoff: validateSourceCutoff(input.source_cutoff),
    cohort,
    platform: validatePlatform(input.platform),
    inputs: validateInputs(input.inputs, cohort),
  };
}

function validateBuildInput(raw: unknown): JsonRecord {
  const input = record(raw, 'build input');
  const core = buildInputCore(input);
  const expectedFingerprint = sha256(canonicalJson(core));
  const actualFingerprint = digestValue(input.content_fingerprint, 'build input.content_fingerprint');
  if (actualFingerprint !== expectedFingerprint) {
    fail(`build input content_fingerprint expected ${expectedFingerprint}, got ${actualFingerprint}`);
  }
  return { ...core, content_fingerprint: expectedFingerprint };
}

function validateExpectedIdentity(buildInput: JsonRecord, expected: ExpectedIdentity): void {
  const release = record(buildInput.release, 'release');
  const cohort = record(buildInput.cohort, 'cohort');
  const platform = record(buildInput.platform, 'platform');
  const comparisons = [
    ['release.version', expected.version, release.version],
    ['release.bundle_digest', expected.bundleDigest, release.bundle_digest],
    ['release.cohort_ref', expected.cohortRef, release.cohort_ref],
    ['cohort.app_sha', expected.appSha, cohort.app_sha],
    ['cohort.shell_sha', expected.shellSha, cohort.shell_sha],
    ['cohort.framework_sha', expected.frameworkSha, cohort.framework_sha],
    ['platform.architecture', expected.architecture, platform.architecture],
  ] as const;
  for (const [label, wanted, actual] of comparisons) {
    if (wanted !== undefined && wanted !== actual) fail(`${label} expected ${wanted}, got ${String(actual)}`);
  }
}

function imageInspectRecord(raw: unknown): JsonRecord {
  if (Array.isArray(raw)) {
    if (raw.length !== 1) fail('image inspect must contain exactly one image');
    return record(raw[0], 'image inspect[0]');
  }
  return record(raw, 'image inspect');
}

function labelMap(image: JsonRecord): JsonRecord {
  return record(record(image.Config, 'image inspect Config').Labels, 'image inspect Config.Labels');
}

function immutableImageDigest(imageRef: string): string {
  const match = imageRef.match(immutableImagePattern);
  if (!match) fail('image ref must be an exact immutable OCI ref ending in @sha256:<64 hex>');
  return match[1];
}

function assertBuildLabels(image: JsonRecord, input: JsonRecord, manifestDigest: string): void {
  const labels = labelMap(image);
  const release = record(input.release, 'release');
  const cohort = record(input.cohort, 'cohort');
  const expected = new Map<string, string>([
    ['org.opencontainers.image.source', 'https://github.com/gaofeng21cn/one-person-lab-app'],
    ['org.opencontainers.image.revision', String(cohort.app_sha)],
    ['org.opencontainers.image.version', String(release.version)],
    ['dev.onepersonlab.release.bundle-digest', String(release.bundle_digest)],
    ['dev.onepersonlab.release.cohort-ref', String(release.cohort_ref)],
    ['dev.onepersonlab.release.build-input-digest', manifestDigest],
    ['dev.onepersonlab.release.content-fingerprint', String(input.content_fingerprint)],
    ['dev.onepersonlab.release.shell-revision', String(cohort.shell_sha)],
    ['dev.onepersonlab.release.framework-revision', String(cohort.framework_sha)],
  ]);
  for (const [key, wanted] of expected) {
    exactString(labels[key], wanted, `image label ${key}`);
  }
  exactString(image.Os, 'linux', 'image inspect Os');
  exactString(image.Architecture, 'amd64', 'image inspect Architecture');
}

function validateRuntimeSummary(raw: unknown, image: JsonRecord, appSha: string): JsonRecord {
  const summary = record(raw, 'runtime summary');
  exactString(summary.status, 'passed', 'runtime summary.status');
  exactString(summary.expected_profile, 'webui-full', 'runtime summary.expected_profile');
  exactString(summary.image_id, stringValue(image.Id, 'image inspect Id'), 'runtime summary.image_id');
  exactString(summary.oci_revision, appSha, 'runtime summary.oci_revision');
  return summary;
}

function validateRegistryReadback(raw: unknown, imageRef: string, version: string): JsonRecord {
  const readback = record(raw, 'registry readback');
  exactKeys(
    readback,
    ['schema', 'status', 'ref', 'digest', 'version_tag', 'version_tag_digest'],
    'registry readback',
  );
  exactString(readback.schema, 'opl_app_webui_registry_readback.v1', 'registry readback.schema');
  exactString(readback.status, 'passed', 'registry readback.status');
  exactString(readback.ref, imageRef, 'registry readback.ref');
  const imageDigest = immutableImageDigest(imageRef);
  exactString(readback.digest, imageDigest, 'registry readback.digest');
  const repository = imageRef.slice(0, imageRef.lastIndexOf('@'));
  exactString(readback.version_tag, `${repository}:${version}`, 'registry readback.version_tag');
  exactString(readback.version_tag_digest, imageDigest, 'registry readback.version_tag_digest');
  return readback;
}

function buildCarrierReceipt(options: {
  buildInputPath: string;
  imageInspectPath: string;
  runtimeSummaryPath: string;
  registryReadbackPath: string;
  imageRef: string;
  imageSize: number;
}): JsonRecord {
  const input = validateBuildInput(readJson(options.buildInputPath, 'build input'));
  const manifestDigest = fileDigest(options.buildInputPath);
  const image = imageInspectRecord(readJson(options.imageInspectPath, 'image inspect'));
  assertBuildLabels(image, input, manifestDigest);
  const cohort = record(input.cohort, 'cohort');
  const runtimeSummary = validateRuntimeSummary(
    readJson(options.runtimeSummaryPath, 'runtime summary'),
    image,
    String(cohort.app_sha),
  );
  const imageDigest = immutableImageDigest(options.imageRef);
  const release = record(input.release, 'release');
  validateRegistryReadback(
    readJson(options.registryReadbackPath, 'registry readback'),
    options.imageRef,
    String(release.version),
  );
  return {
    schema: 'opl_app_webui_release_carrier.v1',
    release: input.release,
    source_cutoff: input.source_cutoff,
    cohort: input.cohort,
    build_input: {
      schema: 'opl_app_webui_build_input.v1',
      manifest_digest: manifestDigest,
      content_fingerprint: input.content_fingerprint,
    },
    carrier: {
      carrier_id: 'docker_webui',
      carrier_kind: 'oci_image',
      package_profile: 'webui-full',
      ref: options.imageRef,
      digest: imageDigest,
      size_bytes: options.imageSize,
      content_fingerprint: input.content_fingerprint,
      os: 'linux',
      architecture: 'amd64',
    },
    qualification: {
      schema: 'opl_app_webui_runtime_qualification.v1',
      status: 'passed',
      build_stage: 'webui_built',
      qualification_stage: 'webui_qualified',
      image_digest: imageDigest,
      build_input_digest: manifestDigest,
      content_fingerprint: input.content_fingerprint,
      runtime_summary_sha256: fileDigest(options.runtimeSummaryPath),
      registry_readback_sha256: fileDigest(options.registryReadbackPath),
      runtime_image_id: runtimeSummary.image_id,
    },
  };
}

function validateCarrierReceipt(
  raw: unknown,
  input: JsonRecord,
  inputDigest: string,
  evidence: { imageInspectPath: string; runtimeSummaryPath: string; registryReadbackPath: string },
): JsonRecord {
  const receipt = record(raw, 'carrier receipt');
  exactKeys(
    receipt,
    ['schema', 'release', 'source_cutoff', 'cohort', 'build_input', 'carrier', 'qualification'],
    'carrier receipt',
  );
  exactString(receipt.schema, 'opl_app_webui_release_carrier.v1', 'carrier receipt.schema');
  for (const field of ['release', 'source_cutoff', 'cohort'] as const) {
    if (canonicalJson(receipt[field]) !== canonicalJson(input[field])) {
      fail(`carrier receipt ${field} must exactly match the frozen build input`);
    }
  }
  const buildInput = record(receipt.build_input, 'carrier receipt.build_input');
  exactKeys(buildInput, ['schema', 'manifest_digest', 'content_fingerprint'], 'carrier receipt.build_input');
  exactString(buildInput.schema, 'opl_app_webui_build_input.v1', 'carrier receipt.build_input.schema');
  exactString(buildInput.manifest_digest, inputDigest, 'carrier receipt.build_input.manifest_digest');
  exactString(
    buildInput.content_fingerprint,
    String(input.content_fingerprint),
    'carrier receipt.build_input.content_fingerprint',
  );
  const carrier = record(receipt.carrier, 'carrier receipt.carrier');
  exactKeys(
    carrier,
    [
      'carrier_id',
      'carrier_kind',
      'package_profile',
      'ref',
      'digest',
      'size_bytes',
      'content_fingerprint',
      'os',
      'architecture',
    ],
    'carrier receipt.carrier',
  );
  exactString(carrier.carrier_id, 'docker_webui', 'carrier.carrier_id');
  exactString(carrier.carrier_kind, 'oci_image', 'carrier.carrier_kind');
  exactString(carrier.package_profile, 'webui-full', 'carrier.package_profile');
  const imageRef = stringValue(carrier.ref, 'carrier.ref');
  const imageDigest = immutableImageDigest(imageRef);
  exactString(carrier.digest, imageDigest, 'carrier.digest');
  positiveInteger(carrier.size_bytes, 'carrier.size_bytes');
  exactString(carrier.content_fingerprint, String(input.content_fingerprint), 'carrier.content_fingerprint');
  exactString(carrier.os, 'linux', 'carrier.os');
  exactString(carrier.architecture, 'amd64', 'carrier.architecture');
  const qualification = record(receipt.qualification, 'carrier receipt.qualification');
  exactKeys(
    qualification,
    [
      'schema',
      'status',
      'build_stage',
      'qualification_stage',
      'image_digest',
      'build_input_digest',
      'content_fingerprint',
      'runtime_summary_sha256',
      'registry_readback_sha256',
      'runtime_image_id',
    ],
    'carrier receipt.qualification',
  );
  exactString(qualification.schema, 'opl_app_webui_runtime_qualification.v1', 'qualification.schema');
  exactString(qualification.status, 'passed', 'qualification.status');
  exactString(qualification.build_stage, 'webui_built', 'qualification.build_stage');
  exactString(qualification.qualification_stage, 'webui_qualified', 'qualification.qualification_stage');
  exactString(qualification.image_digest, imageDigest, 'qualification.image_digest');
  exactString(qualification.build_input_digest, inputDigest, 'qualification.build_input_digest');
  exactString(
    qualification.content_fingerprint,
    String(input.content_fingerprint),
    'qualification.content_fingerprint',
  );
  exactString(
    qualification.runtime_summary_sha256,
    fileDigest(evidence.runtimeSummaryPath),
    'qualification.runtime_summary_sha256',
  );
  exactString(
    qualification.registry_readback_sha256,
    fileDigest(evidence.registryReadbackPath),
    'qualification.registry_readback_sha256',
  );
  const image = imageInspectRecord(readJson(evidence.imageInspectPath, 'image inspect'));
  assertBuildLabels(image, input, inputDigest);
  const cohort = record(input.cohort, 'cohort');
  const runtimeSummary = validateRuntimeSummary(
    readJson(evidence.runtimeSummaryPath, 'runtime summary'),
    image,
    String(cohort.app_sha),
  );
  exactString(qualification.runtime_image_id, String(runtimeSummary.image_id), 'qualification.runtime_image_id');
  const release = record(input.release, 'release');
  validateRegistryReadback(
    readJson(evidence.registryReadbackPath, 'registry readback'),
    imageRef,
    String(release.version),
  );
  return receipt;
}

function option(values: Record<string, unknown>, key: string): string {
  return typeof values[key] === 'string' ? String(values[key]) : '';
}

function requiredOption(values: Record<string, unknown>, key: string): string {
  const value = option(values, key);
  if (!value) fail(`Missing required --${key}`);
  return value;
}

function expectedIdentity(values: Record<string, unknown>): ExpectedIdentity {
  return {
    version: option(values, 'expected-version') || undefined,
    bundleDigest: option(values, 'expected-bundle-digest') || undefined,
    cohortRef: option(values, 'expected-cohort-ref') || undefined,
    appSha: option(values, 'expected-app-sha') || undefined,
    shellSha: option(values, 'expected-shell-sha') || undefined,
    frameworkSha: option(values, 'expected-framework-sha') || undefined,
    architecture: option(values, 'expected-architecture') || undefined,
  };
}

function writeCanonical(filePath: string, value: JsonRecord): void {
  fs.writeFileSync(filePath, `${canonicalJson(value)}\n`, 'utf8');
}

function printSummary(value: JsonRecord): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function main(): void {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      input: { type: 'string' },
      output: { type: 'string' },
      'build-input': { type: 'string' },
      'artifact-dir': { type: 'string' },
      dockerignore: { type: 'string' },
      'image-inspect': { type: 'string' },
      'runtime-summary': { type: 'string' },
      'registry-readback': { type: 'string' },
      'image-ref': { type: 'string' },
      'image-size': { type: 'string' },
      receipt: { type: 'string' },
      'expected-version': { type: 'string' },
      'expected-bundle-digest': { type: 'string' },
      'expected-cohort-ref': { type: 'string' },
      'expected-app-sha': { type: 'string' },
      'expected-shell-sha': { type: 'string' },
      'expected-framework-sha': { type: 'string' },
      'expected-architecture': { type: 'string' },
    },
    allowPositionals: true,
    strict: true,
  });
  const command = parsed.positionals[0];
  const values = parsed.values as Record<string, unknown>;

  if (command === 'seal-build-input') {
    const inputPath = requiredOption(values, 'input');
    const outputPath = requiredOption(values, 'output');
    const draft = record(readJson(inputPath, 'build input draft'), 'build input draft');
    const core = buildInputCore(draft);
    const fingerprint = sha256(canonicalJson(core));
    if (draft.content_fingerprint !== undefined) {
      exactString(draft.content_fingerprint, fingerprint, 'build input draft.content_fingerprint');
    }
    const sealed = { ...core, content_fingerprint: fingerprint };
    writeCanonical(outputPath, sealed);
    printSummary({
      schema: 'opl_app_webui_build_input_seal.v1',
      status: 'passed',
      manifest_digest: fileDigest(outputPath),
      content_fingerprint: fingerprint,
      output: outputPath,
    });
    return;
  }

  if (command === 'verify-build-input') {
    const inputPath = requiredOption(values, 'input');
    const input = validateBuildInput(readJson(inputPath, 'build input'));
    validateExpectedIdentity(input, expectedIdentity(values));
    printSummary({
      schema: 'opl_app_webui_build_input_verification.v1',
      status: 'passed',
      manifest_digest: fileDigest(inputPath),
      content_fingerprint: input.content_fingerprint,
      architecture: record(input.platform, 'platform').architecture,
    });
    return;
  }

  if (command === 'verify-codex-artifact') {
    const summary = verifyCodexArtifact(
      requiredOption(values, 'build-input'),
      requiredOption(values, 'artifact-dir'),
    );
    printSummary(summary);
    return;
  }

  if (command === 'verify-docker-context-policy') {
    printSummary(verifyDockerContextPolicy(requiredOption(values, 'dockerignore')));
    return;
  }

  if (command === 'write-carrier-receipt') {
    const outputPath = requiredOption(values, 'output');
    const imageSize = Number(requiredOption(values, 'image-size'));
    const receipt = buildCarrierReceipt({
      buildInputPath: requiredOption(values, 'build-input'),
      imageInspectPath: requiredOption(values, 'image-inspect'),
      runtimeSummaryPath: requiredOption(values, 'runtime-summary'),
      registryReadbackPath: requiredOption(values, 'registry-readback'),
      imageRef: requiredOption(values, 'image-ref'),
      imageSize: positiveInteger(imageSize, 'image-size'),
    });
    writeCanonical(outputPath, receipt);
    printSummary({
      schema: 'opl_app_webui_release_carrier_write.v1',
      status: 'passed',
      receipt_digest: fileDigest(outputPath),
      image_ref: record(receipt.carrier, 'carrier').ref,
      output: outputPath,
    });
    return;
  }

  if (command === 'verify-carrier-receipt') {
    const inputPath = requiredOption(values, 'build-input');
    const receiptPath = requiredOption(values, 'receipt');
    const input = validateBuildInput(readJson(inputPath, 'build input'));
    validateExpectedIdentity(input, expectedIdentity(values));
    const receipt = validateCarrierReceipt(readJson(receiptPath, 'carrier receipt'), input, fileDigest(inputPath), {
      imageInspectPath: requiredOption(values, 'image-inspect'),
      runtimeSummaryPath: requiredOption(values, 'runtime-summary'),
      registryReadbackPath: requiredOption(values, 'registry-readback'),
    });
    printSummary({
      schema: 'opl_app_webui_release_carrier_verification.v1',
      status: 'passed',
      receipt_digest: fileDigest(receiptPath),
      image_ref: record(receipt.carrier, 'carrier').ref,
      release: receipt.release,
    });
    return;
  }

  fail('Usage: release-webui-carrier.ts <seal-build-input|verify-build-input|verify-codex-artifact|verify-docker-context-policy|write-carrier-receipt|verify-carrier-receipt> [options]');
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
