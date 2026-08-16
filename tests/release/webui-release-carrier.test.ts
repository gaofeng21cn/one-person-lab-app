import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

const appRoot = process.cwd();
const cliPath = path.join(appRoot, 'scripts', 'release-webui-carrier.ts');
const schemaPath = path.join(appRoot, 'contracts', 'app-webui-release-carrier.schema.json');
const workflowPath = path.join(appRoot, '.github', 'workflows', '_release-webui-carrier.yml');
const appSha = 'a'.repeat(40);
const shellSha = 'b'.repeat(40);
const frameworkSha = 'c'.repeat(40);
const bundleDigest = `sha256:${'1'.repeat(64)}`;
const cohortRef = `sha256:${'2'.repeat(64)}`;
const imageDigest = `sha256:${'f'.repeat(64)}`;

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function sha256(bytes: Buffer | string): string {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function extractHeredoc(source: string, marker: string): string {
  const startToken = `<<'${marker}'\n`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `missing ${marker} heredoc`);
  const bodyStart = start + startToken.length;
  const end = source.indexOf(`\n${marker}`, bodyStart);
  assert.notEqual(end, -1, `unterminated ${marker} heredoc`);
  return source.slice(bodyStart, end);
}

function draftBuildInput() {
  const refs: Record<string, string> = {
    app_source: appSha,
    shell_webui_source: shellSha,
    dockerfile: 'shells/aionui/Dockerfile',
    framework_seed: frameworkSha,
    codex_cli: '@openai/codex@1.2.3',
    base_image: `docker.io/library/node@${digest('7')}`,
    qualification_harness: 'scripts/validate-webui-runtime-image.ts',
  };
  return {
    schema: 'opl_app_webui_build_input.v1',
    release: {
      version: '26.7.23',
      bundle_digest: bundleDigest,
      cohort_ref: cohortRef,
    },
    source_cutoff: {
      observed_at: '2026-07-23T01:02:03Z',
      policy: 'single_read_at_freeze_admission',
      frozen_base_release_set: null,
      post_freeze_remote_refresh_allowed: false,
      later_authority_advancement_invalidates_bundle: false,
    },
    cohort: {
      app_sha: appSha,
      shell_sha: shellSha,
      framework_sha: frameworkSha,
    },
    platform: { os: 'linux', architecture: 'amd64' },
    inputs: Object.entries(refs).map(([id, ref], index) => ({
      id,
      ref,
      digest: id === 'base_image' ? digest('7') : digest('3456789ab'[index]),
      size_bytes: index + 1,
    })),
  };
}

function writeJson(root: string, name: string, value: unknown): string {
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function runCli(args: string[]) {
  return spawnSync(process.execPath, ['--experimental-strip-types', cliPath, ...args], {
    cwd: appRoot,
    encoding: 'utf8',
  });
}

function sealBuildInput(root: string, draft = draftBuildInput()): string {
  const draftPath = writeJson(root, 'draft.json', draft);
  const outputPath = path.join(root, 'build-input.json');
  const result = runCli(['seal-build-input', '--input', draftPath, '--output', outputPath]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.status, 'passed');
  assert.equal(summary.manifest_digest, sha256(fs.readFileSync(outputPath)));
  return outputPath;
}

function writeCodexTarball(root: string, identity: { name?: string; version?: string } = {}): string {
  const sourceRoot = path.join(root, 'codex-package-source');
  const packageRoot = path.join(sourceRoot, 'package');
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, 'package.json'),
    `${JSON.stringify({
      name: identity.name ?? '@openai/codex',
      version: identity.version ?? '1.2.3',
    })}\n`,
  );
  const artifactDirectory = path.join(root, 'frozen-codex');
  fs.mkdirSync(artifactDirectory, { recursive: true });
  const artifactPath = path.join(artifactDirectory, 'codex-cli.tgz');
  const packed = spawnSync('tar', ['-czf', artifactPath, '-C', sourceRoot, 'package'], { encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr || packed.stdout);
  return artifactPath;
}

function codexBuildInput(root: string, artifactPath: string, ref = '@openai/codex@1.2.3'): string {
  const draft = draftBuildInput();
  const input = draft.inputs.find((candidate) => candidate.id === 'codex_cli');
  assert.ok(input);
  input.ref = ref;
  input.digest = sha256(fs.readFileSync(artifactPath));
  input.size_bytes = fs.statSync(artifactPath).size;
  return sealBuildInput(root, draft);
}

function verifyCodexArtifact(buildInputPath: string, artifactDirectory: string) {
  return runCli([
    'verify-codex-artifact',
    '--build-input',
    buildInputPath,
    '--artifact-dir',
    artifactDirectory,
  ]);
}

function verifyDockerContextPolicy(root: string, rules: readonly string[]) {
  const dockerIgnorePath = path.join(root, '.dockerignore');
  fs.writeFileSync(dockerIgnorePath, `${rules.join('\n')}\n`);
  return runCli(['verify-docker-context-policy', '--dockerignore', dockerIgnorePath]);
}

function expectedIdentityArgs() {
  return [
    '--expected-version',
    '26.7.23',
    '--expected-bundle-digest',
    bundleDigest,
    '--expected-cohort-ref',
    cohortRef,
    '--expected-app-sha',
    appSha,
    '--expected-shell-sha',
    shellSha,
    '--expected-framework-sha',
    frameworkSha,
    '--expected-architecture',
    'amd64',
  ];
}

function carrierFixture(root: string, buildInputPath: string, overrides: {
  architecture?: string;
  labels?: Record<string, string>;
  runtime?: Record<string, unknown>;
} = {}) {
  const buildInput = JSON.parse(fs.readFileSync(buildInputPath, 'utf8'));
  const manifestDigest = sha256(fs.readFileSync(buildInputPath));
  const imageId = `sha256:${'e'.repeat(64)}`;
  const labels = {
    'org.opencontainers.image.source': 'https://github.com/gaofeng21cn/one-person-lab-app',
    'org.opencontainers.image.revision': appSha,
    'org.opencontainers.image.version': '26.7.23',
    'dev.onepersonlab.release.bundle-digest': bundleDigest,
    'dev.onepersonlab.release.cohort-ref': cohortRef,
    'dev.onepersonlab.release.build-input-digest': manifestDigest,
    'dev.onepersonlab.release.content-fingerprint': buildInput.content_fingerprint,
    'dev.onepersonlab.release.shell-revision': shellSha,
    'dev.onepersonlab.release.framework-revision': frameworkSha,
    ...overrides.labels,
  };
  const imageInspectPath = writeJson(root, 'image-inspect.json', [
    {
      Id: imageId,
      Os: 'linux',
      Architecture: overrides.architecture ?? 'amd64',
      Size: 123456,
      Config: { Labels: labels },
    },
  ]);
  const runtimeSummaryPath = writeJson(root, 'runtime-summary.json', {
    status: 'passed',
    expected_profile: 'webui-full',
    image_id: imageId,
    oci_revision: appSha,
    http_health: { status: 'passed' },
    runtime_cli_shims: { opl: 'passed', codex: 'passed' },
    ...overrides.runtime,
  });
  const registryReadbackPath = writeJson(root, 'registry-readback.json', {
    schema: 'opl_app_webui_registry_readback.v1',
    status: 'passed',
    ref: `ghcr.io/gaofeng21cn/one-person-lab-webui@${imageDigest}`,
    digest: imageDigest,
    version_tag: 'ghcr.io/gaofeng21cn/one-person-lab-webui:26.7.23',
    version_tag_digest: imageDigest,
  });
  return { imageInspectPath, runtimeSummaryPath, registryReadbackPath };
}

test('WebUI build input sealing is canonical, repeatable, and identity-bound', () => {
  const firstRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-input-first-'));
  const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-input-second-'));
  const first = draftBuildInput();
  const second = {
    inputs: [...first.inputs].reverse().map((input) => ({
      size_bytes: input.size_bytes,
      digest: input.digest,
      ref: input.ref,
      id: input.id,
    })),
    platform: { architecture: 'amd64', os: 'linux' },
    cohort: { framework_sha: frameworkSha, shell_sha: shellSha, app_sha: appSha },
    source_cutoff: first.source_cutoff,
    release: first.release,
    schema: first.schema,
  };
  const firstPath = sealBuildInput(firstRoot, first);
  const secondPath = sealBuildInput(secondRoot, second);
  assert.deepEqual(fs.readFileSync(firstPath), fs.readFileSync(secondPath));

  const verify = runCli(['verify-build-input', '--input', firstPath, ...expectedIdentityArgs()]);
  assert.equal(verify.status, 0, verify.stderr || verify.stdout);
  const summary = JSON.parse(verify.stdout);
  assert.equal(summary.status, 'passed');
  assert.equal(summary.architecture, 'amd64');
  assert.match(summary.content_fingerprint, /^sha256:[0-9a-f]{64}$/);
  const sealed = JSON.parse(fs.readFileSync(firstPath, 'utf8'));
  assert.equal(sealed.source_cutoff.frozen_base_release_set, null);
  assert.deepEqual(sealed.inputs.map((input: { id: string }) => input.id), [
    'app_source',
    'base_image',
    'codex_cli',
    'dockerfile',
    'framework_seed',
    'qualification_harness',
    'shell_webui_source',
  ]);
  assert.equal(sealed.inputs.some((input: { id: string }) => input.id === 'first_party_packages'), false);
  assert.equal(sealed.inputs.some((input: { id: string }) => input.id === 'opl_flow'), false);
});

test('WebUI carrier receipt binds immutable OCI digest, qualification, and frozen identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-carrier-'));
  const buildInputPath = sealBuildInput(root);
  const { imageInspectPath, runtimeSummaryPath, registryReadbackPath } = carrierFixture(root, buildInputPath);
  const receiptPath = path.join(root, 'carrier-receipt.json');
  const write = runCli([
    'write-carrier-receipt',
    '--build-input',
    buildInputPath,
    '--image-inspect',
    imageInspectPath,
    '--runtime-summary',
    runtimeSummaryPath,
    '--registry-readback',
    registryReadbackPath,
    '--image-ref',
    `ghcr.io/gaofeng21cn/one-person-lab-webui@${imageDigest}`,
    '--image-size',
    '123456',
    '--output',
    receiptPath,
  ]);
  assert.equal(write.status, 0, write.stderr || write.stdout);

  const verify = runCli([
    'verify-carrier-receipt',
    '--build-input',
    buildInputPath,
    '--receipt',
    receiptPath,
    '--image-inspect',
    imageInspectPath,
    '--runtime-summary',
    runtimeSummaryPath,
    '--registry-readback',
    registryReadbackPath,
    ...expectedIdentityArgs(),
  ]);
  assert.equal(verify.status, 0, verify.stderr || verify.stdout);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.carrier.carrier_id, 'docker_webui');
  assert.equal(receipt.carrier.carrier_kind, 'oci_image');
  assert.equal(receipt.carrier.package_profile, 'webui-full');
  assert.equal(receipt.carrier.digest, imageDigest);
  assert.equal(receipt.carrier.content_fingerprint, receipt.build_input.content_fingerprint);
  assert.equal(receipt.qualification.build_stage, 'webui_built');
  assert.equal(receipt.qualification.qualification_stage, 'webui_qualified');
});

test('frozen Codex artifact verification binds exact tgz bytes and package identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-codex-artifact-'));
  const artifactPath = writeCodexTarball(root);
  const buildInputPath = codexBuildInput(root, artifactPath);
  const result = verifyCodexArtifact(buildInputPath, path.dirname(artifactPath));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary, {
    schema: 'opl_app_webui_codex_artifact_verification.v1',
    status: 'passed',
    artifact_name: 'codex-cli.tgz',
    ref: '@openai/codex@1.2.3',
    digest: sha256(fs.readFileSync(artifactPath)),
    size_bytes: fs.statSync(artifactPath).size,
    package_name: '@openai/codex',
    package_version: '1.2.3',
  });
});

test('Docker context policy requires recursive tgz exclusion and the sole frozen Codex exception', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-docker-context-'));
  const recursiveRule = '**/*.tgz';
  const frozenException = '!.opl-frozen-inputs/codex-cli.tgz';
  const passed = verifyDockerContextPolicy(root, ['node_modules', recursiveRule, frozenException, 'dist']);
  assert.equal(passed.status, 0, passed.stderr || passed.stdout);
  assert.deepEqual(JSON.parse(passed.stdout), {
    schema: 'opl_app_webui_docker_context_policy_verification.v1',
    status: 'passed',
    recursive_tgz_rule: recursiveRule,
    frozen_codex_exception: frozenException,
  });

  for (const [label, rules] of [
    ['root-only', ['*.tgz', frozenException]],
    ['non-adjacent', [recursiveRule, 'dist', frozenException]],
    ['duplicate-exception', [recursiveRule, frozenException, frozenException]],
    ['additional-tgz-rule', [recursiveRule, frozenException, '!nested/other.tgz']],
  ] as const) {
    const caseRoot = path.join(root, label);
    fs.mkdirSync(caseRoot);
    const rejected = verifyDockerContextPolicy(caseRoot, rules);
    assert.notEqual(rejected.status, 0, label);
    assert.match(
      rejected.stderr,
      /recursively exclude tgz files and admit only the frozen Codex artifact/,
      label,
    );
  }
});

test('frozen Codex artifact verification rejects missing, duplicate, symlink, and non-file inputs', () => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-codex-source-'));
  const sourceArtifact = writeCodexTarball(sourceRoot);
  const buildInputPath = codexBuildInput(sourceRoot, sourceArtifact);

  const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-codex-missing-'));
  const missing = verifyCodexArtifact(buildInputPath, missingRoot);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /exactly one entry named codex-cli\.tgz/);

  const duplicateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-codex-duplicate-'));
  fs.copyFileSync(sourceArtifact, path.join(duplicateRoot, 'codex-cli.tgz'));
  fs.writeFileSync(path.join(duplicateRoot, 'unexpected.txt'), 'unexpected\n');
  const duplicate = verifyCodexArtifact(buildInputPath, duplicateRoot);
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /exactly one entry named codex-cli\.tgz/);

  const symlinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-codex-symlink-'));
  fs.symlinkSync(sourceArtifact, path.join(symlinkRoot, 'codex-cli.tgz'));
  const symlink = verifyCodexArtifact(buildInputPath, symlinkRoot);
  assert.notEqual(symlink.status, 0);
  assert.match(symlink.stderr, /regular file, never a symlink/);

  const nonFileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-codex-non-file-'));
  fs.mkdirSync(path.join(nonFileRoot, 'codex-cli.tgz'));
  const nonFile = verifyCodexArtifact(buildInputPath, nonFileRoot);
  assert.notEqual(nonFile.status, 0);
  assert.match(nonFile.stderr, /regular file, never a symlink/);
});

test('frozen Codex artifact verification rejects digest, size, name, version, and ref drift', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-codex-drift-'));
  const artifactPath = writeCodexTarball(root);
  const cleanDraft = draftBuildInput();
  const cleanInput = cleanDraft.inputs.find((candidate) => candidate.id === 'codex_cli');
  assert.ok(cleanInput);
  cleanInput.digest = sha256(fs.readFileSync(artifactPath));
  cleanInput.size_bytes = fs.statSync(artifactPath).size;

  for (const [label, mutate, pattern] of [
    ['digest', (input: typeof cleanInput) => { input.digest = digest('0'); }, /artifact digest expected/],
    ['size', (input: typeof cleanInput) => { input.size_bytes += 1; }, /artifact size expected/],
  ] as const) {
    const caseRoot = path.join(root, label);
    fs.mkdirSync(caseRoot);
    const draft = structuredClone(cleanDraft);
    const input = draft.inputs.find((candidate) => candidate.id === 'codex_cli');
    assert.ok(input);
    mutate(input);
    const buildInputPath = sealBuildInput(caseRoot, draft);
    const result = verifyCodexArtifact(buildInputPath, path.dirname(artifactPath));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, pattern);
  }

  for (const [label, identity, pattern] of [
    ['name', { name: '@openai/not-codex' }, /package name expected @openai\/codex/],
    ['version', { version: '1.2.4' }, /package version expected 1\.2\.3/],
  ] as const) {
    const caseRoot = path.join(root, label);
    fs.mkdirSync(caseRoot);
    const mismatchedArtifact = writeCodexTarball(caseRoot, identity);
    const buildInputPath = codexBuildInput(caseRoot, mismatchedArtifact);
    const result = verifyCodexArtifact(buildInputPath, path.dirname(mismatchedArtifact));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, pattern);
  }

  const invalidRefRoot = path.join(root, 'ref');
  fs.mkdirSync(invalidRefRoot);
  const invalidRefDraft = structuredClone(cleanDraft);
  const invalidRefInput = invalidRefDraft.inputs.find((candidate) => candidate.id === 'codex_cli');
  assert.ok(invalidRefInput);
  invalidRefInput.ref = '@openai/codex@latest';
  const invalidRefPath = writeJson(invalidRefRoot, 'draft.json', invalidRefDraft);
  const invalidRef = runCli([
    'seal-build-input',
    '--input',
    invalidRefPath,
    '--output',
    path.join(invalidRefRoot, 'build-input.json'),
  ]);
  assert.notEqual(invalidRef.status, 0);
  assert.match(invalidRef.stderr, /must be an exact @openai\/codex version/);
});

test('WebUI carrier fails closed for stale digest and OCI label drift', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-stale-'));
  const buildInputPath = sealBuildInput(root);
  const buildInput = JSON.parse(fs.readFileSync(buildInputPath, 'utf8'));
  buildInput.inputs[0].digest = digest('9');
  fs.writeFileSync(buildInputPath, `${JSON.stringify(buildInput)}\n`);
  const stale = runCli(['verify-build-input', '--input', buildInputPath]);
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /content_fingerprint expected/);

  const cleanInputPath = sealBuildInput(root);
  const fixture = carrierFixture(root, cleanInputPath, {
    labels: { 'dev.onepersonlab.release.bundle-digest': digest('6') },
  });
  const mismatchedLabel = runCli([
    'write-carrier-receipt',
    '--build-input',
    cleanInputPath,
    '--image-inspect',
    fixture.imageInspectPath,
    '--runtime-summary',
    fixture.runtimeSummaryPath,
    '--registry-readback',
    fixture.registryReadbackPath,
    '--image-ref',
    `ghcr.io/gaofeng21cn/one-person-lab-webui@${imageDigest}`,
    '--image-size',
    '123456',
    '--output',
    path.join(root, 'must-not-exist.json'),
  ]);
  assert.notEqual(mismatchedLabel.status, 0);
  assert.match(mismatchedLabel.stderr, /image label dev\.onepersonlab\.release\.bundle-digest expected/);
});

test('WebUI carrier fails closed for wrong cohort, wrong architecture, and incomplete Bundle identity', () => {
  const cohortRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-cohort-'));
  const cohortPath = sealBuildInput(cohortRoot);
  const wrongCohort = runCli([
    'verify-build-input',
    '--input',
    cohortPath,
    '--expected-cohort-ref',
    digest('0'),
  ]);
  assert.notEqual(wrongCohort.status, 0);
  assert.match(wrongCohort.stderr, /release\.cohort_ref expected/);

  const archRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-arch-'));
  const wrongArchDraft = draftBuildInput();
  wrongArchDraft.platform.architecture = 'arm64';
  const archDraftPath = writeJson(archRoot, 'draft.json', wrongArchDraft);
  const wrongArch = runCli([
    'seal-build-input',
    '--input',
    archDraftPath,
    '--output',
    path.join(archRoot, 'output.json'),
  ]);
  assert.notEqual(wrongArch.status, 0);
  assert.match(wrongArch.stderr, /platform\.architecture expected amd64/);

  const incompleteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-incomplete-'));
  const incomplete = draftBuildInput();
  delete (incomplete.release as { bundle_digest?: string }).bundle_digest;
  const incompletePath = writeJson(incompleteRoot, 'draft.json', incomplete);
  const incompleteBundle = runCli([
    'seal-build-input',
    '--input',
    incompletePath,
    '--output',
    path.join(incompleteRoot, 'output.json'),
  ]);
  assert.notEqual(incompleteBundle.status, 0);
  assert.match(incompleteBundle.stderr, /release must contain exactly/);

  const releaseSetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-release-set-'));
  const releaseSetBound = draftBuildInput();
  releaseSetBound.source_cutoff.frozen_base_release_set = { generation: '26.7.20', digest: digest('8') };
  const releaseSetPath = writeJson(releaseSetRoot, 'draft.json', releaseSetBound);
  const rejectedReleaseSet = runCli([
    'seal-build-input',
    '--input',
    releaseSetPath,
    '--output',
    path.join(releaseSetRoot, 'output.json'),
  ]);
  assert.notEqual(rejectedReleaseSet.status, 0);
  assert.match(rejectedReleaseSet.stderr, /frozen_base_release_set must be null/);
});

test('WebUI carrier rejects a runtime image for the wrong architecture', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-image-arch-'));
  const buildInputPath = sealBuildInput(root);
  const fixture = carrierFixture(root, buildInputPath, { architecture: 'arm64' });
  const result = runCli([
    'write-carrier-receipt',
    '--build-input',
    buildInputPath,
    '--image-inspect',
    fixture.imageInspectPath,
    '--runtime-summary',
    fixture.runtimeSummaryPath,
    '--registry-readback',
    fixture.registryReadbackPath,
    '--image-ref',
    `ghcr.io/gaofeng21cn/one-person-lab-webui@${imageDigest}`,
    '--image-size',
    '123456',
    '--output',
    path.join(root, 'receipt.json'),
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /image inspect Architecture expected amd64/);
});

test('WebUI carrier schema closes both sealed artifacts', () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.oneOf.length, 2);
  assert.equal(schema.$defs.build_input.additionalProperties, false);
  assert.equal(schema.$defs.carrier_receipt.additionalProperties, false);
  assert.equal(schema.$defs.carrier.properties.carrier_id.const, 'docker_webui');
  assert.equal(schema.$defs.carrier.properties.carrier_kind.const, 'oci_image');
  assert.equal(schema.$defs.carrier.properties.package_profile.const, 'webui-full');
  assert.equal(schema.$defs.platform.properties.architecture.const, 'amd64');
  assert.equal(schema.$defs.source_cutoff.properties.frozen_base_release_set.type, 'null');
  assert.match(
    schema.$defs.release_version.pattern,
    /preview\\\.r\[1-9\]\[0-9\]\*/,
  );
});

test('WebUI carrier accepts one immutable independent Preview version', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-preview-'));
  const draft = draftBuildInput();
  draft.release.version = '26.7.28-preview.r1';
  const buildInputPath = sealBuildInput(root, draft);
  const result = runCli([
    'verify-build-input',
    '--input',
    buildInputPath,
    '--expected-version',
    '26.7.28-preview.r1',
    '--expected-bundle-digest',
    bundleDigest,
    '--expected-cohort-ref',
    cohortRef,
    '--expected-app-sha',
    appSha,
    '--expected-shell-sha',
    shellSha,
    '--expected-framework-sha',
    frameworkSha,
    '--expected-architecture',
    'amd64',
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('reusable WebUI workflow builds independently and gates immutable publication on runtime qualification', () => {
  const source = fs.readFileSync(workflowPath, 'utf8');
  const workflow = YAML.parse(source);
  const inputs = workflow.on.workflow_call.inputs;
  const build = workflow.jobs['build-and-qualify'];
  const publish = workflow.jobs['publish-immutable-carrier'];
  assert.equal(inputs.authority_mode.type, 'string');
  assert.equal(inputs.authority_mode.default, 'independent_stable');
  assert.equal(inputs.production_recovery, undefined);
  assert.equal(inputs.source_artifact_run_id.type, 'string');
  assert.equal(inputs.source_artifact_run_id.required, false);
  assert.equal(inputs.standard_checkpoint_artifact_name, undefined);
  assert.equal(inputs.standard_identity_sha256, undefined);
  assert.equal(inputs.source_authority_artifact_name.type, 'string');
  assert.equal(inputs.source_authority_artifact_name.required, false);
  assert.equal(inputs.failed_recovery_v8_run_id, undefined);
  assert.equal(inputs.qualified_artifact_run_id, undefined);
  assert.equal(inputs.qualified_artifact_name, undefined);
  assert.equal(inputs.frozen_codex_artifact_name, undefined);
  assert.equal(inputs.frozen_build_input_json, undefined);
  assert.equal(build.needs, undefined, 'WebUI build must not depend on Desktop');
  assert.equal(build.if, "${{ inputs.mode == 'execute' }}");
  assert.equal(publish.needs, 'build-and-qualify');
  assert.equal(
    publish.if,
    "${{ always() && inputs.mode == 'execute' && needs.build-and-qualify.result == 'success' }}",
  );
  assert.equal(
    publish.environment,
    "${{ inputs.authority_mode == 'independent_preview' && 'release-preview-publication' || 'release-stable' }}",
  );
  assert.equal(publish.permissions.packages, 'write');
  assert.equal(publish.permissions.actions, 'read');
  assert.equal(build.permissions.actions, 'read');
  assert.equal(build.permissions.packages, 'read');
  const previewPublishCheckout = publish.steps.find(
    (step: { name?: string }) => step.name === 'Checkout canonical publication executor',
  );
  assert.equal(publish.steps.some((step: { name?: string }) => step.name === 'Checkout exact production App source'), false);
  assert.equal(previewPublishCheckout.if, undefined);
  assert.equal(previewPublishCheckout.with.ref, '${{ github.sha }}');
  assert.equal(
    publish.steps.some((step: { name?: string }) => step.name === 'Validate exact qualified artifact recovery authority'),
    false,
  );
  const qualifiedDownload = publish.steps.find(
    (step: { name?: string }) => step.name === 'Download exact qualified image evidence',
  );
  assert.equal(qualifiedDownload.with.name, '${{ needs.build-and-qualify.outputs.image_artifact_name }}');
  assert.equal(qualifiedDownload.with['run-id'], '${{ github.run_id }}');
  assert.equal(qualifiedDownload.with['github-token'], '${{ github.token }}');
  assert.doesNotMatch(source, /one-person-lab-webui:stable/);
  assert.doesNotMatch(source, /latest-stable|homebrew|releases\/latest/i);

  const buildRun = build.steps.map((step: { run?: string }) => step.run ?? '').join('\n');
  assert.match(buildRun, /seal-build-input/);
  assert.match(buildRun, /verify-codex-artifact/);
  assert.match(buildRun, /codex-artifact-verification\.json/);
  assert.match(buildRun, /verify-docker-context-policy/);
  assert.match(buildRun, /docker-context-policy-verification\.json/);
  assert.match(buildRun, /\.opl-frozen-inputs\/codex-cli\.tgz/);
  assert.match(buildRun, /COPY \.opl-frozen-inputs\/codex-cli\.tgz \/tmp\/codex-cli\.tgz/);
  assert.match(buildRun, /npm install -g --prefix \/opt\/codex-cli \/tmp\/codex-cli\.tgz/);
  assert.match(buildRun, /materialize-webui-seed-symlinks\.ts --root \/opt\/codex-cli/);
  assert.match(buildRun, /find \/opt\/codex-cli -type l -print -quit/);
  assert.match(buildRun, /webui-executor-source\/scripts\/materialize-webui-seed-symlinks\.ts/);
  assert.match(buildRun, /COPY \.opl-frozen-inputs\/materialize-webui-seed-symlinks\.ts \/tmp\/materialize-webui-seed-symlinks\.ts/);
  assert.match(buildRun, /materialize-webui-seed-symlinks\.ts --root node_modules/);
  assert.match(buildRun, /find node_modules -type l -print -quit/);
  assert.match(buildRun, /framework-release-adapter\.ts webui-build-input/);
  assert.match(buildRun, /oras manifest fetch/);
  assert.match(buildRun, /npm view/);
  assert.doesNotMatch(buildRun, /npm pack/);
  assert.match(buildRun, /Dockerfile\.frozen/);
  assert.match(buildRun, /--build-arg 'OPL_FRAMEWORK_REF=/);
  assert.doesNotMatch(buildRun, /OPL_FLOW_REF|inputs\.get\('opl_flow'\)/);
  assert.match(buildRun, /--build-arg 'OPL_CODEX_NPM_SPEC=/);
  assert.match(buildRun, /validate-webui-runtime-image\.ts/);
  assert.match(buildRun, /curl --fail/);
  assert.equal(
    build.steps.some((step: { name?: string }) => step.name === 'Download exact portable Standard checkpoint'),
    false,
  );
  const downloadSourceAuthority = build.steps.find(
    (step: { name?: string }) => step.name === 'Download exact independent WebUI source authority',
  );
  assert.equal(downloadSourceAuthority.if, undefined);
  assert.equal(downloadSourceAuthority.uses, 'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c');
  assert.equal(downloadSourceAuthority.with.name, '${{ inputs.source_authority_artifact_name }}');
  assert.equal(downloadSourceAuthority.with['run-id'], '${{ inputs.source_artifact_run_id }}');
  assert.equal(downloadSourceAuthority.with.path, 'webui-carrier/source-authority');
  assert.match(buildRun, /webui-source-authority\.ts[\s\\]+validate/);
  assert.match(buildRun, /source_authority_digest/);
  assert.match(buildRun, /--source-authority "webui-carrier\/source-authority\.json"/);
  const imageBuildIndex = build.steps.findIndex((step: { name?: string }) => step.name === 'Build WebUI image once from frozen inputs');
  const executorCheckout = build.steps.find(
    (step: { name?: string }) => step.name === 'Checkout exact WebUI build executor',
  );
  assert.equal(executorCheckout.with.ref, '${{ github.sha }}');
  assert.equal(executorCheckout.with.path, 'webui-executor-source');
  const qualificationIndex = build.steps.findIndex(
    (step: { name?: string }) => step.name === 'Qualify exact local runtime before any registry tag is written',
  );
  const qualification = build.steps[qualificationIndex];
  const failureEvidenceIndex = build.steps.findIndex(
    (step: { name?: string }) => step.name === 'Upload WebUI runtime qualification failure evidence',
  );
  const failureEvidence = build.steps[failureEvidenceIndex];
  const packageIndex = build.steps.findIndex(
    (step: { name?: string }) => step.name === 'Package qualified image and evidence for protected immutable publication',
  );
  assert.ok(
    imageBuildIndex >= 0
      && imageBuildIndex < qualificationIndex
      && qualificationIndex < failureEvidenceIndex
      && failureEvidenceIndex < packageIndex,
    'runtime qualification and packaging must follow the one image build in order',
  );
  assert.equal(qualification.id, 'qualify');
  assert.match(qualification.run, /capture_runtime_diagnostics/);
  assert.match(qualification.run, /docker inspect "\$container_name" > webui-carrier\/container-inspect\.json/);
  assert.match(qualification.run, /docker logs "\$container_name" > webui-carrier\/container\.log/);
  assert.match(qualification.run, /docker inspect --format '\{\{\.State\.Running\}\}'/);
  assert.equal(failureEvidence.if, "${{ failure() && steps.qualify.outcome == 'failure' }}");
  assert.equal(failureEvidence.uses, 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a');
  assert.equal(
    failureEvidence.with.name,
    'webui-runtime-failure-${{ inputs.opl_version }}-${{ github.run_id }}-${{ github.run_attempt }}',
  );
  for (const path of [
    'webui-carrier/container-inspect.json',
    'webui-carrier/container.log',
    'webui-carrier/container-status.txt',
    'webui-carrier/runtime-summary.json',
  ]) {
    assert.match(failureEvidence.with.path, new RegExp(path.replaceAll('.', '\\.')));
  }
  assert.equal(failureEvidence.with['if-no-files-found'], 'error');
  assert.equal(failureEvidence.with['retention-days'], 7);
  const packageRun = build.steps[packageIndex].run;
  assert.ok(
    packageRun.indexOf('docker builder prune --all --force') < packageRun.indexOf('docker save "$local_image"'),
    'reclaimable multi-stage build cache must be removed before exporting the qualified image',
  );
  assert.match(packageRun, /docker image inspect "\$local_image" >\/dev\/null/);

  const publishRun = publish.steps.map((step: { run?: string }) => step.run ?? '').join('\n');
  assert.match(publishRun, /candidate-/);
  assert.match(publishRun, /candidate-tag-readback\.txt/);
  assert.match(publishRun, /imagetools inspect --raw/);
  assert.match(publishRun, /version-tag-authority\.json/);
  assert.match(publishRun, /top_level/);
  assert.match(publishRun, /child/);
  assert.match(publishRun, /preexisting_idempotent/);
  assert.match(publishRun, /reconciled_after_unknown_write/);
  assert.match(publishRun, /expected unique linux\/amd64 child digest/);
  assert.match(publishRun, /Could not safely distinguish an absent version tag from a registry read failure/);
  assert.match(publishRun, /bounded read-only reconcile did not prove a readable target/);
  assert.equal(publishRun.match(/imagetools create --tag/g)?.length, 1);
  assert.doesNotMatch(publishRun, /test "\$readback_digest" = "\$digest"/);
  assert.match(publishRun, /write-carrier-receipt/);
  assert.match(publishRun, /verify-carrier-receipt/);
  assert.match(publishRun, /source-authority-final-verification\.json/);
  assert.match(publishRun, /carrier-artifact/);
  assert.match(publishRun, /source-authority\.json/);
});

test('WebUI carrier publishes one idempotent durable receipt sidecar only after exact immutable tag readback', () => {
  const workflow = YAML.parse(fs.readFileSync(workflowPath, 'utf8'));
  const build = workflow.jobs['build-and-qualify'];
  const publish = workflow.jobs['publish-immutable-carrier'];
  const publishRun = publish.steps.map((step: { run?: string }) => step.run ?? '').join('\n');
  const sidecarIndex = publish.steps.findIndex(
    (step: { name?: string }) => step.name === 'Publish immutable durable carrier receipt sidecar',
  );
  const receiptIndex = publish.steps.findIndex(
    (step: { name?: string }) => step.name === 'Write and verify exact carrier receipt',
  );
  const sidecar = publish.steps[sidecarIndex];
  const stage = publish.steps.find(
    (step: { name?: string }) => step.name === 'Stage exact carrier receipt evidence',
  );
  const setupOras = publish.steps.find(
    (step: { name?: string }) => step.name === 'Setup ORAS for durable carrier receipt sidecar',
  );
  const downloadSourceAuthority = build.steps.find(
    (step: { name?: string }) => step.name === 'Download exact independent WebUI source authority',
  );

  assert.deepEqual(publish.permissions, { actions: 'read', contents: 'read', packages: 'write' });
  assert.equal(build.permissions.actions, 'read');
  assert.ok(receiptIndex >= 0 && receiptIndex < sidecarIndex);
  assert.equal(setupOras.uses, 'oras-project/setup-oras@1d808f7d7f6995cc68b7bf507bfe5c5446e1dc9d');
  assert.equal(downloadSourceAuthority.if, undefined);
  assert.equal(downloadSourceAuthority.uses, 'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c');
  assert.equal(downloadSourceAuthority.with.name, '${{ inputs.source_authority_artifact_name }}');
  assert.equal(downloadSourceAuthority.with['run-id'], '${{ inputs.source_artifact_run_id }}');
  assert.equal(downloadSourceAuthority.with['github-token'], '${{ github.token }}');
  assert.equal(downloadSourceAuthority.with.path, 'webui-carrier/source-authority');

  const versionDescriptorIndex = sidecar.run.indexOf('version-descriptor-readback.json');
  assert.ok(versionDescriptorIndex >= 0);
  assert.ok(versionDescriptorIndex < sidecar.run.indexOf('webui-publication-record.ts'));
  assert.match(publishRun, /opl_app_webui_descriptor_readback\.v1/);
  assert.match(publishRun, /exact immutable version tag authority is required before durable sidecar publication/);

  assert.match(sidecar.run, /application\/vnd\.onepersonlab\.webui\.publication-record\.v1\+json/);
  assert.match(sidecar.run, /receipt-\$\{\{ inputs\.opl_version \}\}/);
  assert.match(sidecar.run, /webui-publication-record\.ts \\\n\s+create/);
  assert.match(sidecar.run, /--carrier-receipt webui-carrier\/carrier-receipt\.json/);
  assert.match(sidecar.run, /--version-readback webui-carrier\/version-descriptor-readback\.json/);
  assert.match(sidecar.run, /--image-repository '\$\{\{ inputs\.image_repository \}\}'/);
  assert.match(sidecar.run, /--publication-run-id "\$GITHUB_RUN_ID"/);
  assert.match(sidecar.run, /--publication-run-attempt "\$GITHUB_RUN_ATTEMPT"/);
  assert.match(sidecar.run, /--publication-executor-sha "\$GITHUB_SHA"/);
  assert.doesNotMatch(sidecar.run, /github\.event\.workflow_run\.id/);
  assert.match(sidecar.run, /--source-authority "\$source_authority_path"/);
  assert.match(sidecar.run, /source_authority_path='webui-carrier\/source-authority\.json'/);
  assert.match(sidecar.run, /test -f "\$source_authority_path" && test ! -L "\$source_authority_path"/);
  assert.deepEqual(publish.permissions, { actions: 'read', contents: 'read', packages: 'write' });
  const repositoryValidationIndex = publish.steps.findIndex(
    (step: { name?: string }) => step.name === 'Validate exact GHCR repository before registry mutation',
  );
  const registryPublishIndex = publish.steps.findIndex(
    (step: { name?: string }) => step.name === 'Publish qualified candidate and CAS immutable version tag',
  );
  assert.ok(repositoryValidationIndex >= 0 && repositoryValidationIndex < registryPublishIndex);
  assert.match(publish.steps[repositoryValidationIndex].run, /validate-repository/);

  assert.match(sidecar.run, /oras manifest fetch --descriptor "\$receipt_ref"/);
  assert.match(sidecar.run, /publication_outcome=preexisting_idempotent/);
  assert.match(sidecar.run, /publication_outcome=created/);
  assert.match(sidecar.run, /publication_outcome=reconciled_after_unknown_write/);
  assert.match(sidecar.run, /write_reconcile_evidence pending "\$publication_outcome"/);
  assert.match(sidecar.run, /opl_app_webui_receipt_sidecar_reconcile\.v1/);
  assert.match(sidecar.run, /receipt-sidecar-reconcile\.json/);
  assert.match(sidecar.run, /Could not safely distinguish an absent receipt sidecar from a registry read failure/);
  assert.equal(sidecar.run.match(/\boras push\b/g)?.length, 1);
  assert.match(sidecar.run, /--artifact-type "\$artifact_media_type"/);
  assert.match(sidecar.run, /cd "\$sidecar_root"\s+oras push/);
  assert.match(sidecar.run, /"webui-publication-record\.json:\$artifact_media_type"/);
  assert.doesNotMatch(sidecar.run, /"\$record_path:\$artifact_media_type"/);
  assert.doesNotMatch(sidecar.run, /--disable-path-validation/);
  assert.match(sidecar.run, /oras manifest fetch "\$receipt_ref" > "\$sidecar_root\/receipt-sidecar-manifest\.json"/);
  assert.match(sidecar.run, /oras pull --output "\$pull_root" "\$receipt_ref"/);
  assert.match(sidecar.run, /cmp -s "\$record_path" "\$pulled_record"/);
  assert.match(sidecar.run, /receipt sidecar descriptor or manifest is not the exact expected OCI artifact/);
  assert.match(sidecar.run, /receipt sidecar manifest does not bind the exact canonical publication record/);
  assert.doesNotMatch(sidecar.run, /\boras tag\b/);

  assert.match(stage.run, /version-descriptor-readback\.json/);
  for (const file of [
    'webui-publication-record.json',
    'webui-publication-record-create.json',
    'webui-publication-record-verification.json',
    'receipt-sidecar-descriptor.json',
    'receipt-sidecar-manifest.json',
    'receipt-sidecar-reconcile.json',
    'receipt-sidecar-pulled-record.json',
    'receipt-sidecar-pull-verification.json',
  ]) {
    assert.match(stage.run, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('WebUI version tag authority accepts only one exact linux/amd64 child', () => {
  const workflow = YAML.parse(fs.readFileSync(workflowPath, 'utf8'));
  const publish = workflow.jobs['publish-immutable-carrier'];
  const publishRun = publish.steps.map((step: { run?: string }) => step.run ?? '').join('\n');
  const validator = extractHeredoc(publishRun, 'VERSION_TAG_AUTHORITY_NODE');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-version-tag-authority-'));
  const validatorPath = path.join(root, 'verify-version-tag-authority.mjs');
  fs.writeFileSync(validatorPath, validator);

  const descriptor = {
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    digest: imageDigest,
    size: 123456,
    platform: { os: 'linux', architecture: 'amd64' },
  };
  const valid = {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests: [descriptor],
  };
  const validRaw = Buffer.from(JSON.stringify(valid));
  const validPath = path.join(root, 'valid.json');
  const receiptPath = path.join(root, 'receipt.json');
  fs.writeFileSync(validPath, validRaw);
  const accepted = spawnSync(process.execPath, [
    validatorPath,
    validPath,
    imageDigest,
    'ghcr.io/gaofeng21cn/one-person-lab-webui:26.7.23',
    'preexisting_idempotent',
    receiptPath,
  ], { encoding: 'utf8' });
  assert.equal(accepted.status, 0, accepted.stderr || accepted.stdout);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.schema, 'opl_app_webui_version_tag_authority.v1');
  assert.equal(receipt.outcome, 'preexisting_idempotent');
  assert.equal(receipt.top_level.digest, sha256(validRaw));
  assert.equal(receipt.top_level.manifest_count, 1);
  assert.equal(receipt.child.digest, imageDigest);
  assert.deepEqual(receipt.child.platform, { os: 'linux', architecture: 'amd64' });

  const invalidManifests = [
    { ...valid, manifests: [] },
    { ...valid, manifests: [descriptor, { ...descriptor }] },
    { ...valid, manifests: [{ ...descriptor, digest: digest('0') }] },
    { ...valid, manifests: [{ ...descriptor, platform: { os: 'linux', architecture: 'arm64' } }] },
    { ...valid, mediaType: 'application/vnd.oci.image.manifest.v1+json' },
  ];
  for (const [index, manifest] of invalidManifests.entries()) {
    const rawPath = path.join(root, `invalid-${index}.json`);
    const outputPath = path.join(root, `invalid-${index}-receipt.json`);
    fs.writeFileSync(rawPath, JSON.stringify(manifest));
    const rejected = spawnSync(process.execPath, [
      validatorPath,
      rawPath,
      imageDigest,
      'ghcr.io/gaofeng21cn/one-person-lab-webui:26.7.23',
      'created',
      outputPath,
    ], { encoding: 'utf8' });
    assert.notEqual(rejected.status, 0, `accepted invalid manifest ${index}`);
    assert.equal(fs.existsSync(outputPath), false);
  }

  const unknownPath = path.join(root, 'unknown.json');
  const unknownReceiptPath = path.join(root, 'unknown-receipt.json');
  fs.writeFileSync(unknownPath, '{');
  const unknown = spawnSync(process.execPath, [
    validatorPath,
    unknownPath,
    imageDigest,
    'ghcr.io/gaofeng21cn/one-person-lab-webui:26.7.23',
    'reconciled_after_unknown_write',
    unknownReceiptPath,
  ], { encoding: 'utf8' });
  assert.notEqual(unknown.status, 0);
  assert.equal(fs.existsSync(unknownReceiptPath), false);
});
