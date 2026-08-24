import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

import { sha256File, type BuildArtifactCohortV2 } from '../../scripts/build-artifact-cohort.ts';
import {
  qualifyNightlyRelease,
  type NightlyQualificationReceipt,
} from '../../scripts/nightly-release-qualification.ts';
import {
  GhNightlyRemote,
  publishNightlyRelease,
  type NightlyRemote,
  type NightlyRemoteRelease,
} from '../../scripts/nightly-release-publisher.ts';
import {
  assertNightlyRequestDigest,
  resolveNightlyReleaseRequest,
  type NightlyReleaseRequest,
} from '../../scripts/resolve-nightly-release-request.ts';
import { resolveReleasePlatformMatrix } from '../../scripts/resolve-release-platform-matrix.ts';
import { resolveReleaseVersionIdentity } from '../../scripts/release-version.ts';
import { validateNightlyReleaseTopology } from '../../scripts/validate-release-boundary/text-check-runner.ts';

const appSha = 'a'.repeat(40);
const shellSha = 'b'.repeat(40);
const frameworkSha = 'c'.repeat(40);
const digest = 'd'.repeat(64);

function request(): NightlyReleaseRequest {
  return resolveNightlyReleaseRequest({
    baseVersion: '26.7.26-nightly',
    existingRefs: ['refs/tags/v26.7.26-nightly', 'v26.7.26-nightly.r1'],
    appRef: appSha,
    shellRef: shellSha,
    frameworkRef: frameworkSha,
    actionsRunId: '424242',
    actionsRunAttempt: '1',
    invocationMode: 'scheduled_production',
    event: 'schedule',
    authoritySource: 'daily_schedule',
  });
}

function developmentValidationRequest(): NightlyReleaseRequest {
  return resolveNightlyReleaseRequest({
    baseVersion: '26.7.26-nightly',
    existingRefs: ['refs/tags/v26.7.26-nightly', 'v26.7.26-nightly.r1'],
    appRef: appSha,
    shellRef: shellSha,
    frameworkRef: frameworkSha,
    actionsRunId: '424243',
    actionsRunAttempt: '1',
    invocationMode: 'development_validation',
    event: 'workflow_dispatch',
    authoritySource: 'user_explicit',
    operatorConfirmation: 'publish_nonlatest_nightly',
  });
}

function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-nightly-release-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const assetsDir = path.join(root, 'assets');
  fs.mkdirSync(assetsDir);
  const frozen = request();
  const dmgName = `One-Person-Lab-${frozen.version}-mac-arm64.dmg`;
  const zipName = `One-Person-Lab-${frozen.version}-mac-arm64.zip`;
  fs.writeFileSync(path.join(assetsDir, dmgName), 'nightly dmg exact bytes\n');
  fs.writeFileSync(path.join(assetsDir, zipName), 'nightly zip exact bytes\n');
  fs.writeFileSync(path.join(assetsDir, `${zipName}.blockmap`), 'nightly blockmap exact bytes\n');
  fs.writeFileSync(path.join(assetsDir, 'opl-install.sh'), '#!/usr/bin/env bash\nexit 0\n');
  const metadata = [
    `version: ${frozen.updater_version}`,
    'files:',
    `  - url: ${zipName}`,
    '    sha512: fixture',
    `path: ${zipName}`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(assetsDir, 'latest-mac.yml'), metadata);
  fs.writeFileSync(path.join(assetsDir, 'latest-arm64-mac.yml'), metadata);
  fs.writeFileSync(path.join(assetsDir, 'standard-local-authorization-policy.json'), JSON.stringify({
    schema: 'opl_local_authorized_macos_policy.v1',
    package_kind: 'app_standard',
    release_install_path: 'local_authorized_unsigned',
    apple_developer_id_required: false,
    gatekeeper_required: false,
    local_authorization_required: true,
    quarantine_removal_required: true,
  }));
  const cohort: BuildArtifactCohortV2 = {
    schema: 'opl_app_build_artifact_cohort.v2',
    release: { stable_session_id: null, release_cohort_ref: null },
    cohort: { app_sha: appSha, shell_sha: shellSha, framework_sha: frameworkSha },
    build: { version: frozen.version, kind: 'standard' },
    artifact: {
      name: dmgName,
      sha256: sha256File(path.join(assetsDir, dmgName)),
      size_bytes: fs.statSync(path.join(assetsDir, dmgName)).size,
    },
    actions: { run_id: '424242', run_attempt: '1', artifact_name: 'nightly-macos-arm64-dmg' },
    digests: {
      packaged_tree_sha256: digest,
      app_product_profile_sha256: digest,
      gui_product_contract_sha256: digest,
      smoke_harness_sha256: digest,
      compiled_expectation_semantic_sha256: digest,
      compiled_expectation_probe_sha256: digest,
      qualification_input_manifest_sha256: digest,
    },
    qualification_runtime: {
      codex_cli: {
        package: '@openai/codex',
        version: '1.2.3',
        npm_integrity: `sha512-${'A'.repeat(86)}==`,
        tarball_url: 'https://registry.npmjs.org/@openai/codex/-/codex-1.2.3.tgz',
        tarball_sha256: digest,
        platform: {
          package: '@openai/codex',
          version: '1.2.3-darwin-arm64',
          npm_integrity: `sha512-${'B'.repeat(86)}==`,
          tarball_url: 'https://registry.npmjs.org/@openai/codex/-/codex-1.2.3-darwin-arm64.tgz',
          tarball_sha256: digest,
        },
      },
    },
  };
  const cohortPath = path.join(root, 'cohort.json');
  fs.writeFileSync(cohortPath, JSON.stringify(cohort));
  const qualification = qualifyNightlyRelease({
    request: frozen,
    assetsDir,
    cohortManifest: cohort,
    cohortManifestPath: cohortPath,
  });
  return { root, assetsDir, request: frozen, cohort, cohortPath, qualification };
}

class FakeRemote implements NightlyRemote {
  latest = 'v26.7.25';
  release: NightlyRemoteRelease | null = null;
  tagTarget: string | null = null;
  calls: string[] = [];
  visibilityMissesAfterCreate = 0;
  visibilityMissesAfterUpload = 0;
  tagCreateThrows = false;
  createThrows = false;
  createRejected = false;
  createReturnsNull = false;
  deleteThrows = false;
  tagDeleteThrows = false;
  reconcileWaitAttempts: number[] = [];
  private releaseVisibilityMisses = 0;

  inspectRelease(_tag?: string, releaseId?: number): NightlyRemoteRelease | null {
    this.calls.push('inspect-release');
    if (this.releaseVisibilityMisses > 0) {
      this.releaseVisibilityMisses -= 1;
      return null;
    }
    if (releaseId !== undefined && this.release?.id !== releaseId) return null;
    return this.release ? structuredClone(this.release) : null;
  }

  inspectTagTarget(): string | null {
    this.calls.push('inspect-tag');
    return this.tagTarget;
  }

  inspectLatestTag(): string | null {
    this.calls.push('inspect-latest');
    return this.latest;
  }

  waitForReconcileVisibility(attempt: number): void {
    this.reconcileWaitAttempts.push(attempt);
  }

  createTag(_tag: string, targetCommitish: string): string | null {
    this.calls.push('create-tag');
    this.tagTarget = targetCommitish;
    if (this.tagCreateThrows) throw new Error('simulated tag create timeout');
    return this.tagTarget;
  }

  createDraft(input: {
    tag: string;
    targetCommitish: string;
    name: string;
    body: string;
  }): NightlyRemoteRelease | null {
    this.calls.push('create');
    if (this.createRejected) throw new Error('simulated create rejection');
    this.release = {
      id: 101,
      tag_name: input.tag,
      target_commitish: input.targetCommitish,
      name: input.name,
      body: input.body,
      draft: true,
      prerelease: true,
      html_url: `https://example.invalid/${input.tag}`,
      assets: [],
    };
    this.releaseVisibilityMisses = this.visibilityMissesAfterCreate;
    if (this.createThrows) throw new Error('simulated create timeout');
    if (this.createReturnsNull) return null;
    return structuredClone(this.release);
  }

  uploadAsset(_releaseId: number, filePath: string, name: string): void {
    this.calls.push(`upload:${name}`);
    this.release!.assets.push({
      id: 1000 + this.release!.assets.length,
      name,
      size: fs.statSync(filePath).size,
      digest: `sha256:${sha256File(filePath)}`,
    });
    this.releaseVisibilityMisses = this.visibilityMissesAfterUpload;
  }

  publishRelease(): void {
    this.calls.push('publish');
    this.release!.draft = false;
  }

  deleteDraft(): void {
    this.calls.push('delete-draft');
    if (this.deleteThrows) throw new Error('simulated delete timeout');
    this.release = null;
  }

  deleteTag(): void {
    this.calls.push('delete-tag');
    if (this.tagDeleteThrows) throw new Error('simulated tag delete timeout');
    this.tagTarget = null;
  }
}

test('Nightly request freezes exact Standard refs, revision, and non-Stable publication policy', () => {
  const frozen = request();
  assert.equal(frozen.version, '26.7.26-nightly.r2');
  assert.equal(
    frozen.updater_version,
    resolveReleaseVersionIdentity('nightly', '26.7.26-nightly.r2').updaterVersion,
  );
  assert.match(frozen.request_digest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(frozen.source, {
    app_sha: appSha,
    shell_sha: shellSha,
    framework_sha: frameworkSha,
  });
  assert.equal(frozen.quality_status, 'preview');
  assert.equal(frozen.build_trigger, 'automated');
  assert.equal(frozen.preview_kind, 'nightly');
  assert.deepEqual(frozen.invocation, {
    mode: 'scheduled_production',
    event: 'schedule',
    authority_source: 'daily_schedule',
    confirmation: null,
    execution_path: 'scheduled_nightly',
  });
  assert.equal(frozen.publication.make_latest, false);
  assert.equal(frozen.publication.include_full, false);
  assert.equal(frozen.publication.full_allowed, false);
  assert.equal(frozen.publication.webui_allowed, false);
  assert.equal(frozen.publication.heavy_vm_blocking, false);
  assert.throws(() => resolveNightlyReleaseRequest({
    baseVersion: '26.7.26-nightly',
    existingRefs: [],
    appRef: appSha,
    shellRef: shellSha,
    frameworkRef: frameworkSha,
    actionsRunId: '424242',
    actionsRunAttempt: '2',
    invocationMode: 'scheduled_production',
    event: 'schedule',
    authoritySource: 'daily_schedule',
  }), /attempt 1/);
});

test('Nightly request distinguishes user-explicit development validation from scheduled production', () => {
  const frozen = developmentValidationRequest();
  assert.deepEqual(frozen.invocation, {
    mode: 'development_validation',
    event: 'workflow_dispatch',
    authority_source: 'user_explicit',
    confirmation: 'publish_nonlatest_nightly',
    execution_path: 'same_as_scheduled_nightly',
  });
  assert.throws(() => resolveNightlyReleaseRequest({
    baseVersion: '26.7.26-nightly',
    existingRefs: [],
    appRef: appSha,
    shellRef: shellSha,
    frameworkRef: frameworkSha,
    actionsRunId: '424243',
    actionsRunAttempt: '1',
    invocationMode: 'development_validation',
    event: 'schedule',
    authoritySource: 'user_explicit',
    operatorConfirmation: 'publish_nonlatest_nightly',
  }), /invocation identity/);
});

test('Nightly request rejects digest-valid policy widening', () => {
  const widened = structuredClone(request()) as NightlyReleaseRequest;
  widened.publication.include_full = true as false;
  const { request_digest: _digest, ...body } = widened;
  widened.request_digest = `sha256:${crypto.createHash('sha256').update(`${JSON.stringify(body)}\n`).digest('hex')}`;
  assert.throws(() => assertNightlyRequestDigest(widened), /Standard-only non-Latest prerelease/);
});

test('Nightly qualification binds exact Standard assets without Stable, Full, WebUI, or heavy VM claims', (t) => {
  const input = fixture(t);
  assert.equal(input.qualification.status, 'passed');
  assert.equal(input.qualification.include_full, false);
  assert.equal(input.qualification.stable_qualified, false);
  assert.equal(input.qualification.heavy_vm_required, false);
  assert.equal(input.qualification.sampled_vm_nonblocking, true);
  assert.equal(input.qualification.quality_status, 'preview');
  assert.equal(input.qualification.build_trigger, 'automated');
  assert.equal(input.qualification.preview_kind, 'nightly');
  assert.deepEqual(input.qualification.invocation, input.request.invocation);
  assert.deepEqual(input.qualification.qualification_disclosure, {
    stable_qualified: false,
    passed_gates: [],
    skipped_gates: [
      'stable_heavy_vm',
      'homebrew_clean_install',
      'container_webui',
      'full',
    ],
    failed_gates: [],
    non_stable_notice: true,
  });
  assert.equal(input.qualification.assets.length, 7);
  assert.equal(input.qualification.updater_metadata.name, 'latest-mac.yml');
  assert.equal(input.qualification.updater_compatibility_metadata.name, 'latest-arm64-mac.yml');
  assert.equal(
    input.qualification.updater_metadata.sha256,
    input.qualification.updater_compatibility_metadata.sha256,
  );
  assert.equal(
    input.qualification.assets.filter((asset) => asset.name === 'opl-app-component-manifest.json').length,
    1,
  );
  const componentManifest = JSON.parse(
    fs.readFileSync(path.join(input.assetsDir, 'opl-app-component-manifest.json'), 'utf8'),
  );
  assert.equal(componentManifest.quality_status, 'preview');
  assert.equal(componentManifest.build_trigger, 'automated');
  assert.equal(componentManifest.preview_kind, 'nightly');
  assert.deepEqual(componentManifest.source_cohort, {
    app_sha: appSha,
    shell_sha: shellSha,
    framework_sha: frameworkSha,
  });
  assert.ok(input.qualification.assets.every((asset) => !/Full|WebUI/.test(asset.name)));
  assert.ok(input.qualification.assets.every((asset) => !asset.name.endsWith('-linux-x64.deb')));
  assert.ok(input.qualification.assets.some((asset) => asset.name === 'opl-install.sh'));
  assert.equal(input.qualification.primary_dmg.sha256, input.cohort.artifact.sha256);

  fs.writeFileSync(path.join(input.assetsDir, 'One-Person-Lab-Full.dmg'), 'forbidden');
  assert.throws(() => qualifyNightlyRelease({
    request: input.request,
    assetsDir: input.assetsDir,
    cohortManifest: input.cohort,
    cohortManifestPath: input.cohortPath,
  }), /must contain exactly/);
});

test('Nightly publisher is digest-idempotent, prerelease-only, and preserves Latest', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();
  const first = publishNightlyRelease({
    request: input.request,
    qualification: input.qualification,
    assetsDir: input.assetsDir,
    notes: 'Automated Standard preview.\n',
    remote,
  });
  assert.equal(first.status, 'published');
  assert.equal(first.include_full, false);
  assert.equal(first.github_release.prerelease, true);
  assert.equal(first.github_release.make_latest, false);
  assert.equal(first.github_release.latest_before, 'v26.7.25');
  assert.equal(first.github_release.latest_after, 'v26.7.25');
  assert.deepEqual(first.invocation, input.request.invocation);
  assert.deepEqual(first.actions, input.request.actions);
  assert.equal(first.updater_metadata.name, 'latest-mac.yml');
  assert.equal(first.updater_compatibility_metadata.name, 'latest-arm64-mac.yml');
  assert.equal(first.updater_metadata.sha256, first.updater_compatibility_metadata.sha256);
  assert.match(first.updater_metadata.url, /\/latest-mac\.yml$/);
  assert.match(first.updater_compatibility_metadata.url, /\/latest-arm64-mac\.yml$/);
  assert.equal(
    remote.calls.filter((call) => call.startsWith('upload:')).length,
    input.qualification.assets.length,
  );
  assert.equal(remote.calls.filter((call) => call === 'publish').length, 1);
  assert.equal(remote.calls.filter((call) => call === 'create-tag').length, 1);
  assert.equal(remote.tagTarget, input.request.source.app_sha);

  remote.calls = [];
  const second = publishNightlyRelease({
    request: input.request,
    qualification: input.qualification,
    assetsDir: input.assetsDir,
    notes: 'Automated Standard preview.\n',
    remote,
  });
  assert.equal(second.status, 'already_complete');
  assert.equal(remote.calls.some((call) => call.startsWith('upload:')), false);
  assert.equal(remote.calls.includes('publish'), false);
  assert.equal(remote.calls.includes('create-tag'), false);
});

test('Nightly publisher rejects an incomplete metadata bridge before remote inspection or mutation', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();
  const qualification = structuredClone(input.qualification) as Partial<NightlyQualificationReceipt>;
  delete qualification.updater_compatibility_metadata;

  assert.throws(() => publishNightlyRelease({
    request: input.request,
    qualification: qualification as NightlyQualificationReceipt,
    assetsDir: input.assetsDir,
    notes: 'Automated Standard preview.\n',
    remote,
  }), /exact passed Standard-only qualification receipt/);
  assert.deepEqual(remote.calls, []);
});

test('Nightly publisher reserves the frozen tag before creating a Release', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();

  publishNightlyRelease({
    request: input.request,
    qualification: input.qualification,
    assetsDir: input.assetsDir,
    notes: 'Automated Standard preview.\n',
    remote,
  });

  assert.ok(remote.calls.indexOf('create-tag') < remote.calls.indexOf('create'));
  assert.equal(remote.calls.filter((call) => call === 'create-tag').length, 1);
  assert.equal(remote.calls.includes('delete-tag'), false);
});

test('Nightly publisher reconciles an unknown exact tag reservation without retrying it', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();
  remote.tagCreateThrows = true;

  const receipt = publishNightlyRelease({
    request: input.request,
    qualification: input.qualification,
    assetsDir: input.assetsDir,
    notes: 'Automated Standard preview.\n',
    remote,
  });

  assert.equal(receipt.status, 'published');
  assert.equal(remote.calls.filter((call) => call === 'create-tag').length, 1);
  assert.equal(remote.calls.includes('delete-tag'), false);
});

test('Nightly publisher removes its exact tag when Release creation fails with no public Release', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();
  remote.createRejected = true;

  assert.throws(
    () =>
      publishNightlyRelease({
        request: input.request,
        qualification: input.qualification,
        assetsDir: input.assetsDir,
        notes: 'Automated Standard preview.\n',
        remote,
      }),
    /outcome is unknown after three read-only inspections/,
  );

  assert.equal(remote.calls.filter((call) => call === 'create-tag').length, 1);
  assert.equal(remote.calls.filter((call) => call === 'delete-tag').length, 1);
  assert.equal(remote.tagTarget, null);
});

test('Nightly publisher never reuses or deletes a pre-existing orphan tag', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();
  remote.tagTarget = input.request.source.app_sha;

  assert.throws(
    () =>
      publishNightlyRelease({
        request: input.request,
        qualification: input.qualification,
        assetsDir: input.assetsDir,
        notes: 'Automated Standard preview.\n',
        remote,
      }),
    /has no Release; this invocation will not reuse or delete it/,
  );

  assert.equal(remote.calls.includes('create-tag'), false);
  assert.equal(remote.calls.includes('delete-tag'), false);
  assert.equal(remote.tagTarget, input.request.source.app_sha);
});

test('Nightly publisher tolerates eventual-consistency misses after draft creation without retrying creation', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();
  remote.visibilityMissesAfterCreate = 2;
  const receipt = publishNightlyRelease({
    request: input.request,
    qualification: input.qualification,
    assetsDir: input.assetsDir,
    notes: 'Automated Standard preview.\n',
    remote,
  });
  assert.equal(receipt.status, 'published');
  assert.equal(remote.calls.filter((call) => call === 'create').length, 1);
  assert.equal(remote.calls.filter((call) => call === 'publish').length, 1);
});

test('Nightly publisher resumes an existing draft and reports the publication transition', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();
  remote.createDraft({
    tag: input.request.tag,
    targetCommitish: input.request.source.app_sha,
    name: `One Person Lab ${input.request.tag}`,
    body: 'Automated Standard preview.\n',
  });
  remote.calls = [];

  const receipt = publishNightlyRelease({
    request: input.request,
    qualification: input.qualification,
    assetsDir: input.assetsDir,
    notes: 'Automated Standard preview.\n',
    remote,
  });

  assert.equal(receipt.status, 'published');
  assert.equal(remote.calls.includes('create'), false);
  assert.equal(remote.calls.filter((call) => call === 'publish').length, 1);
});

test('Nightly publisher reconciles an unknown create result without retrying the draft mutation', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();
  remote.createThrows = true;
  remote.visibilityMissesAfterCreate = 1;
  const receipt = publishNightlyRelease({
    request: input.request,
    qualification: input.qualification,
    assetsDir: input.assetsDir,
    notes: 'Automated Standard preview.\n',
    remote,
  });
  assert.equal(receipt.status, 'published');
  assert.equal(remote.calls.filter((call) => call === 'create').length, 1);
  assert.equal(remote.calls.filter((call) => call === 'publish').length, 1);
  assert.deepEqual(remote.reconcileWaitAttempts.slice(0, 2), [1, 2]);
});

test('Nightly publisher reconciles an empty acknowledged create response without retrying the draft mutation', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();
  remote.createReturnsNull = true;
  remote.visibilityMissesAfterCreate = 1;

  const receipt = publishNightlyRelease({
    request: input.request,
    qualification: input.qualification,
    assetsDir: input.assetsDir,
    notes: 'Automated Standard preview.\n',
    remote,
  });

  assert.equal(receipt.status, 'published');
  assert.equal(remote.calls.filter((call) => call === 'create').length, 1);
  assert.equal(remote.calls.filter((call) => call === 'publish').length, 1);
  assert.deepEqual(remote.reconcileWaitAttempts.slice(0, 2), [1, 2]);
});

test('Nightly publisher uses the acknowledged draft response while tag discovery remains stale', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();
  remote.visibilityMissesAfterCreate = 3;

  const receipt = publishNightlyRelease({
    request: input.request,
    qualification: input.qualification,
    assetsDir: input.assetsDir,
    notes: 'Automated Standard preview.\n',
    remote,
  });

  assert.equal(receipt.status, 'published');
  assert.equal(remote.calls.filter((call) => call === 'create').length, 1);
  assert.equal(remote.calls.includes('delete-draft'), false);
  assert.equal(remote.release?.draft, false);
});

test('Nightly publisher safely deletes its exact draft when creation visibility exceeds the bounded reconcile window', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();
  remote.createThrows = true;
  remote.visibilityMissesAfterCreate = 3;

  assert.throws(
    () =>
      publishNightlyRelease({
        request: input.request,
        qualification: input.qualification,
        assetsDir: input.assetsDir,
        notes: 'Automated Standard preview.\n',
        remote,
      }),
    /outcome is unknown after three read-only inspections/
  );

  assert.equal(remote.calls.filter((call) => call === 'create').length, 1);
  assert.equal(remote.calls.filter((call) => call === 'delete-draft').length, 1);
  assert.deepEqual(remote.reconcileWaitAttempts.slice(0, 3), [1, 2, 3]);
  assert.equal(remote.release, null);
});

test('Nightly publisher retains its exact tag while delayed Release absence is not proven', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();
  remote.createThrows = true;
  remote.visibilityMissesAfterCreate = 7;

  assert.throws(
    () =>
      publishNightlyRelease({
        request: input.request,
        qualification: input.qualification,
        assetsDir: input.assetsDir,
        notes: 'Automated Standard preview.\n',
        remote,
      }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /public state cleanup did not reach exact absence/);
      assert.match(String(error.errors[1]), /Release absence is not proven/);
      return true;
    },
  );

  assert.equal(remote.calls.includes('delete-tag'), false);
  assert.equal(remote.tagTarget, input.request.source.app_sha);
  assert.notEqual(remote.release, null);
});

test('Nightly publisher deletes its acknowledged draft when asset upload readback fails', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();
  remote.visibilityMissesAfterUpload = 5;

  assert.throws(
    () =>
      publishNightlyRelease({
        request: input.request,
        qualification: input.qualification,
        assetsDir: input.assetsDir,
        notes: 'Automated Standard preview.\n',
        remote,
      }),
    /Upload Nightly asset .* did not reach its exact postcondition/
  );

  assert.equal(remote.calls.filter((call) => call === 'create').length, 1);
  assert.equal(remote.calls.filter((call) => call === 'delete-draft').length, 1);
  assert.equal(remote.release, null);
});

test('Nightly publisher preserves both publication and cleanup failures when rollback is unknown', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();
  remote.visibilityMissesAfterUpload = 5;
  remote.deleteThrows = true;

  assert.throws(
    () =>
      publishNightlyRelease({
        request: input.request,
        qualification: input.qualification,
        assetsDir: input.assetsDir,
        notes: 'Automated Standard preview.\n',
        remote,
      }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /public state cleanup did not reach exact absence/);
      assert.equal(error.errors.length, 3);
      assert.match(String(error.errors[0]), /Upload Nightly asset/);
      assert.match(String(error.errors[1]), /Delete failed Nightly draft/);
      assert.match(String(error.errors[2]), /Release absence is not proven/);
      return true;
    },
  );

  assert.equal(remote.calls.filter((call) => call === 'delete-draft').length, 1);
  assert.equal(remote.calls.includes('delete-tag'), false);
  assert.notEqual(remote.release, null);
});

test('Nightly publisher never deletes a draft that existed before this invocation', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();
  remote.createDraft({
    tag: input.request.tag,
    targetCommitish: input.request.source.app_sha,
    name: `One Person Lab ${input.request.tag}`,
    body: 'Automated Standard preview.\n',
  });
  remote.release!.assets.push({
    id: 999,
    name: 'unexpected-existing-asset.txt',
    size: 1,
    digest: `sha256:${'e'.repeat(64)}`,
  });
  remote.calls = [];

  assert.throws(
    () =>
      publishNightlyRelease({
        request: input.request,
        qualification: input.qualification,
        assetsDir: input.assetsDir,
        notes: 'Automated Standard preview.\n',
        remote,
      }),
    /unexpected public asset/
  );

  assert.equal(remote.calls.includes('delete-draft'), false);
  assert.notEqual(remote.release, null);
});

test('GitHub Nightly remote discovers a draft by tag metadata before GitHub creates the tag ref', () => {
  const frozen = request();
  const draft: NightlyRemoteRelease = {
    id: 101,
    tag_name: frozen.tag,
    target_commitish: frozen.source.app_sha,
    name: `One Person Lab ${frozen.tag}`,
    body: 'Automated Standard preview.\n',
    draft: true,
    prerelease: true,
    html_url: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/untagged-fixture',
    assets: [],
  };
  const calls: string[][] = [];
  const remote = new GhNightlyRemote('gaofeng21cn/one-person-lab-app', (args) => {
    calls.push(args);
    if (args[1] === `repos/gaofeng21cn/one-person-lab-app/releases/tags/${frozen.tag}`) return '';
    if (args.includes('--paginate')) return `${JSON.stringify([])}\n${JSON.stringify([draft])}\n`;
    throw new Error(`Unexpected gh call: ${args.join(' ')}`);
  });

  assert.deepEqual(remote.inspectRelease(frozen.tag), draft);
  assert.deepEqual(calls, [
    ['api', `repos/gaofeng21cn/one-person-lab-app/releases/tags/${frozen.tag}`],
    [
      'api',
      '--paginate',
      '--jq',
      `[.[] | select(.tag_name == ${JSON.stringify(frozen.tag)})]`,
      'repos/gaofeng21cn/one-person-lab-app/releases?per_page=100',
    ],
  ]);
});

test('GitHub Nightly remote returns the created draft and reads it back by exact release id', () => {
  const frozen = request();
  const draft: NightlyRemoteRelease = {
    id: 101,
    tag_name: frozen.tag,
    target_commitish: frozen.source.app_sha,
    name: `One Person Lab ${frozen.tag}`,
    body: 'Automated Standard preview.\n',
    draft: true,
    prerelease: true,
    html_url: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/untagged-fixture',
    assets: [],
  };
  const calls: string[][] = [];
  const remote = new GhNightlyRemote('gaofeng21cn/one-person-lab-app', (args) => {
    calls.push(args);
    if (args.includes('POST')) return JSON.stringify(draft);
    if (args[1] === 'repos/gaofeng21cn/one-person-lab-app/releases/101') return JSON.stringify(draft);
    throw new Error(`Unexpected gh call: ${args.join(' ')}`);
  });

  assert.deepEqual(remote.createDraft({
    tag: frozen.tag,
    targetCommitish: frozen.source.app_sha,
    name: draft.name,
    body: draft.body,
  }), draft);
  assert.deepEqual(remote.inspectRelease(frozen.tag, draft.id), draft);
  assert.equal(calls.filter((args) => args.includes('POST')).length, 1);
  assert.deepEqual(calls.at(-1), ['api', 'repos/gaofeng21cn/one-person-lab-app/releases/101']);
});

test('GitHub Nightly remote reserves and deletes one exact lightweight tag ref', () => {
  const frozen = request();
  const calls: string[][] = [];
  const remote = new GhNightlyRemote('gaofeng21cn/one-person-lab-app', (args) => {
    calls.push(args);
    if (args.includes('POST')) {
      return JSON.stringify({
        ref: `refs/tags/${frozen.tag}`,
        object: { type: 'commit', sha: frozen.source.app_sha },
      });
    }
    return '';
  });

  assert.equal(remote.createTag(frozen.tag, frozen.source.app_sha), frozen.source.app_sha);
  remote.deleteTag(frozen.tag);

  assert.equal(calls.filter((args) => args.includes('POST')).length, 1);
  assert.deepEqual(calls.at(-1), [
    'api',
    '--method', 'DELETE',
    `repos/gaofeng21cn/one-person-lab-app/git/refs/tags/${frozen.tag}`,
  ]);
});

test('GitHub Nightly remote reads only an exact lightweight commit tag', () => {
  const frozen = request();
  const remote = new GhNightlyRemote('gaofeng21cn/one-person-lab-app', () => JSON.stringify({
    ref: `refs/tags/${frozen.tag}`,
    object: { type: 'commit', sha: frozen.source.app_sha },
  }));

  assert.equal(remote.inspectTagTarget(frozen.tag), frozen.source.app_sha);
});

test('GitHub Nightly remote returns null for a successful empty create response', () => {
  const frozen = request();
  const draft: NightlyRemoteRelease = {
    id: 101,
    tag_name: frozen.tag,
    target_commitish: frozen.source.app_sha,
    name: `One Person Lab ${frozen.tag}`,
    body: 'Automated Standard preview.\n',
    draft: true,
    prerelease: true,
    html_url: `https://example.invalid/${frozen.tag}`,
    assets: [],
  };
  const calls: string[][] = [];
  const remote = new GhNightlyRemote('gaofeng21cn/one-person-lab-app', (args) => {
    calls.push(args);
    if (args.includes('POST')) return '';
    if (args[1] === `repos/gaofeng21cn/one-person-lab-app/releases/tags/${frozen.tag}`) {
      return JSON.stringify(draft);
    }
    throw new Error(`Unexpected gh call: ${args.join(' ')}`);
  });

  assert.equal(remote.createDraft({
    tag: frozen.tag,
    targetCommitish: frozen.source.app_sha,
    name: draft.name,
    body: draft.body,
  }), null);
  assert.deepEqual(remote.inspectRelease(frozen.tag), draft);
  assert.equal(
    calls.filter((args) => args.includes('POST') && args.some((arg) => arg.includes('/releases'))).length,
    1,
  );
});

test('GitHub Nightly remote deletes only an exact positive release id', () => {
  const calls: string[][] = [];
  const remote = new GhNightlyRemote('gaofeng21cn/one-person-lab-app', (args) => {
    calls.push(args);
    return '';
  });

  remote.deleteDraft(101);

  assert.deepEqual(calls, [['api', '--method', 'DELETE', 'repos/gaofeng21cn/one-person-lab-app/releases/101']]);
  assert.throws(() => remote.deleteDraft(0), /positive safe integer/);
});

test('GitHub Nightly remote fails closed when release metadata contains duplicate draft tags', () => {
  const frozen = request();
  const draft = {
    id: 101,
    tag_name: frozen.tag,
    target_commitish: frozen.source.app_sha,
    name: `One Person Lab ${frozen.tag}`,
    body: 'Automated Standard preview.\n',
    draft: true,
    prerelease: true,
    html_url: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/untagged-fixture',
    assets: [],
  };
  const remote = new GhNightlyRemote('gaofeng21cn/one-person-lab-app', (args) => {
    if (args[1] === `repos/gaofeng21cn/one-person-lab-app/releases/tags/${frozen.tag}`) return '';
    if (args.includes('--paginate')) {
      return `${JSON.stringify([draft])}\n${JSON.stringify([{ ...draft, id: 102 }])}\n`;
    }
    throw new Error(`Unexpected gh call: ${args.join(' ')}`);
  });

  assert.throws(
    () => remote.inspectRelease(frozen.tag),
    /multiple Releases for Nightly tag/,
  );
});

test('Nightly publisher refuses same-name different remote bytes', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();
  publishNightlyRelease({
    request: input.request,
    qualification: input.qualification,
    assetsDir: input.assetsDir,
    notes: 'Automated Standard preview.\n',
    remote,
  });
  remote.release!.assets[0]!.digest = `sha256:${crypto.createHash('sha256').update('drift').digest('hex')}`;
  assert.throws(() => publishNightlyRelease({
    request: input.request,
    qualification: input.qualification,
    assetsDir: input.assetsDir,
    notes: 'Automated Standard preview.\n',
    remote,
  }), /conflicting asset/);
});

test('Nightly publisher refuses an unexpected public asset before publishing a draft', (t) => {
  const input = fixture(t);
  const remote = new FakeRemote();
  remote.createDraft({
    tag: input.request.tag,
    targetCommitish: input.request.source.app_sha,
    name: `One Person Lab ${input.request.tag}`,
    body: 'Automated Standard preview.\n',
  });
  remote.release!.assets.push({
    id: 999,
    name: `One-Person-Lab-Full-${input.request.version}-mac-arm64.dmg`,
    size: 1,
    digest: `sha256:${'e'.repeat(64)}`,
  });
  remote.calls = [];
  assert.throws(() => publishNightlyRelease({
    request: input.request,
    qualification: input.qualification,
    assetsDir: input.assetsDir,
    notes: 'Automated Standard preview.\n',
    remote,
  }), /unexpected public asset/);
  assert.equal(remote.calls.includes('publish'), false);
});

test('Nightly workflows keep one shared build implementation and post-publication followers', () => {
  const release = parseYaml(fs.readFileSync('.github/workflows/release-nightly.yml', 'utf8')) as any;
  const followups = parseYaml(
    fs.readFileSync('.github/workflows/release-nightly-followups.yml', 'utf8'),
  ) as any;
  assert.deepEqual(Object.keys(release.on).sort(), ['schedule', 'workflow_dispatch']);
  assert.deepEqual(Object.keys(release.on.workflow_dispatch.inputs), ['operator_confirmation']);
  assert.equal(release.on.workflow_dispatch.inputs.operator_confirmation.required, true);
  assert.equal(release.on.workflow_dispatch.inputs.operator_confirmation.type, 'string');
  assert.match(release['run-name'], /scheduled-production/);
  assert.match(release['run-name'], /development-validation/);
  const admissionRun = String(
    release.jobs.admission.steps.find((step: any) => step.id === 'request')?.run ?? '',
  );
  assert.match(admissionRun, /invocation_mode=scheduled_production/);
  assert.match(admissionRun, /invocation_mode=development_validation/);
  assert.match(admissionRun, /authority_source=daily_schedule/);
  assert.match(admissionRun, /authority_source=user_explicit/);
  assert.match(admissionRun, /--invocation-mode "\$invocation_mode"/);
  assert.match(admissionRun, /--event "\$GITHUB_EVENT_NAME"/);
  assert.match(admissionRun, /--authority-source "\$authority_source"/);
  assert.equal(release.jobs['standard-build'].uses, './.github/workflows/_build-reusable.yml');
  assert.equal(release.jobs['standard-build'].with.require_macos_gatekeeper, false);
  assert.equal(release.jobs['standard-build'].with.release_validation_profile, 'stable');
  assert.equal(release.jobs['standard-build'].with.matrix, '${{ needs.admission.outputs.matrix }}');
  assert.deepEqual(resolveReleasePlatformMatrix({ policy: 'nightly_standard' }).include, [
    {
      platform: 'macos-arm64',
      os: 'macos-latest',
      command: 'node scripts/build-with-builder.js arm64 --mac --arm64',
      'artifact-name': 'nightly-macos-arm64',
      arch: 'arm64',
      native_arch: 'arm64',
    },
  ]);
  const publishSteps = release.jobs['qualify-and-publish'].steps;
  assert.equal(
    publishSteps.find((step: any) => step.name === 'Download Linux Desktop build assets')?.with?.name,
    undefined,
  );
  const baselineRun = String(
    publishSteps.find((step: any) => step.name === 'Freeze latest usable published release notes baseline')?.run ?? '',
  );
  assert.match(baselineRun, /\.draft == false/);
  assert.match(baselineRun, /opl-app-component-manifest\.json/);
  assert.match(baselineRun, /sort_by\(\.published_at, \.id\)/);
  assert.doesNotMatch(baselineRun, /\.prerelease == true/);
  assert.doesNotMatch(baselineRun, /-nightly\(\?:/);
  const qualificationRun = String(
    publishSteps.find((step: any) => step.name === 'Normalize and qualify Standard-only assets')?.run ?? '',
  );
  assert.match(qualificationRun, /generate-frozen-universal-installer\.ts/);
  assert.match(qualificationRun, /--output nightly-assets\/opl-install\.sh/);
  assert.match(qualificationRun, /--app-sha '\$\{\{ needs\.admission\.outputs\.app_ref \}\}'/);
  assert.match(qualificationRun, /--shell-sha '\$\{\{ needs\.admission\.outputs\.shell_ref \}\}'/);
  assert.match(qualificationRun, /--framework-sha '\$\{\{ needs\.admission\.outputs\.framework_ref \}\}'/);
  assert.equal(release.jobs['qualify-and-publish'].environment, 'release-nightly');
  assert.equal(followups.name, 'OPL Nightly Follow-ups');
  assert.deepEqual(followups.on.workflow_run.workflows, ['OPL Standard Nightly Release']);
  assert.deepEqual(followups.on.workflow_dispatch.inputs.operation.options, [
    'reconcile_homebrew',
    'run_sampled_vm',
  ]);
  assert.deepEqual(followups.jobs['publish-nightly-cask'].needs, undefined);
  assert.deepEqual(followups.jobs['resolve-sample'].needs, undefined);
  assert.equal(fs.existsSync('.github/workflows/release-nightly-homebrew-follower.yml'), false);
  assert.equal(fs.existsSync('.github/workflows/release-nightly-sampled-vm.yml'), false);
  assert.match(
    String(followups.jobs['publish-nightly-cask'].steps.find((step: any) => step.id === 'authority')?.run ?? ''),
    /\.event == "schedule" or \.event == "workflow_dispatch"/,
  );
  const homebrewPublish = String(
    followups.jobs['publish-nightly-cask'].steps.find(
      (step: any) => step.name === 'Publish one digest-bound Nightly Cask commit',
    )?.run ?? '',
  );
  const homebrewPublishStep = followups.jobs['publish-nightly-cask'].steps.find(
    (step: any) => step.name === 'Publish one digest-bound Nightly Cask commit',
  );
  assert.equal(followups.jobs['publish-nightly-cask'].environment, 'release-nightly');
  assert.equal(
    homebrewPublishStep?.env?.OPL_HOMEBREW_TAP_DEPLOY_KEY,
    '${{ secrets.OPL_HOMEBREW_TAP_DEPLOY_KEY }}',
  );
  assert.equal(homebrewPublishStep?.env?.OPL_HOMEBREW_TAP_TOKEN, undefined);
  assert.match(homebrewPublish, /\.actions\.run_id == \$run/);
  assert.match(homebrewPublish, /\.invocation\.event == \$event/);
  assert.match(homebrewPublish, /mode: "scheduled_production"/);
  assert.match(homebrewPublish, /mode: "development_validation"/);
  assert.match(homebrewPublish, /\.cohort\.app_sha == \$head/);
  assert.match(homebrewPublish, /git@github\.com:\$\{tap_repo\}\.git/);
  assert.match(homebrewPublish, /IdentitiesOnly=yes/);
  assert.match(homebrewPublish, /StrictHostKeyChecking=yes/);
  assert.match(
    String(followups.jobs['resolve-sample'].steps.find((step: any) => step.id === 'receipt')?.run ?? ''),
    /\.event == "schedule" or \.event == "workflow_dispatch"/,
  );
  const sampledReceipt = String(
    followups.jobs['resolve-sample'].steps.find((step: any) => step.id === 'receipt')?.run ?? '',
  );
  assert.match(sampledReceipt, /\.actions\.run_id == \$run/);
  assert.match(sampledReceipt, /\.invocation\.event == \$event/);
  assert.match(sampledReceipt, /authority_source:\s*"?user_explicit"?/);
  assert.match(sampledReceipt, /\.cohort\.app_sha == \$head/);
  assert.equal(followups.jobs['sampled-standard-vm'].uses, './.github/workflows/opl-first-run-vm.yml');
  assert.equal(followups.jobs['sampled-standard-vm'].with.require_macos_gatekeeper, false);
  assert.equal(validateNightlyReleaseTopology(process.cwd()), 0);
});
