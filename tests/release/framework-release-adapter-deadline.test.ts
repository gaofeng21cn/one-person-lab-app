import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  activateLatest,
  applyPublishPlan,
  buildExecutorReceipt,
  inspectRelease,
  type GitHubAdapterRuntime,
  type GitHubCommandOptions,
  type GitHubCommandResult,
} from '../../scripts/framework-release-adapter.ts';

type Asset = { name: string; size_bytes: number; sha256: string; source_path: string };

const repo = 'example/one-person-lab-app';
const version = '26.7.22';
const updaterVersion = '26.7.2200';
const tag = `v${version}`;
const deadlineAt = '2026-07-21T01:00:00.000Z';
const deadlineMs = Date.parse(deadlineAt);
const notes = 'Prepared release notes\n';
const sourceCommit = 'a'.repeat(40);
const shellCommit = 'c'.repeat(40);
const frameworkCommit = 'd'.repeat(40);
const bundleDigest = `sha256:${'b'.repeat(64)}`;
const latestZip = asset(`One-Person-Lab-${version}-mac-arm64.zip`, '9');
const latestDmg = asset(`One-Person-Lab-${version}-mac-arm64.dmg`, '8');
const componentManifestAsset = asset('opl-app-component-manifest.json', 'f');
const expectedCurrentLatestTag = 'v26.7.20';
const standardOperationId = 'operation-standard-1';
const appendFullOperationId = 'operation-append-full-1';
const standardOperationStartedAt = '2026-07-21T00:00:00.000Z';
const appendFullOperationStartedAt = '2026-07-21T00:05:00.000Z';
const workflowAttemptId = 'gha-workflow-attempt-1';

function mutationAdmission(
  operation: 'standard' | 'resume_standard' | 'append_full' = 'standard',
  track: 'standard' | 'full' = 'standard',
): Record<string, string> {
  return {
    operation,
    track,
    'publication-channel': 'stable',
    'operation-id': operation === 'append_full' ? appendFullOperationId : standardOperationId,
    'operation-started-at': operation === 'append_full'
      ? appendFullOperationStartedAt
      : standardOperationStartedAt,
    'attempt-id': workflowAttemptId,
    'run-attempt': '1',
  };
}

function expectedMutationAttemptId(
  mutation: 'release_create' | 'asset_upload' | 'release_publish' | 'latest_patch',
  remoteTarget: string,
  subject: string,
): string {
  return `gha:${crypto.createHash('sha256').update(JSON.stringify({
    base_attempt_id: workflowAttemptId,
    mutation,
    remote_target: remoteTarget,
    subject,
  })).digest('hex').slice(0, 48)}`;
}

function sealAdmission(receipt: Record<string, any>): void {
  const evidence = {
    ...(receipt.publication_channel === undefined
      ? {}
      : { publication_channel: receipt.publication_channel }),
    operation: receipt.operation,
    classification: receipt.classification,
    component_manifest: receipt.component_manifest,
    pointer_authority: receipt.pointer_authority,
    bundle_digest: receipt.bundle_digest,
    candidate: receipt.candidate,
    standard_assets_sha256: receipt.standard_assets_sha256,
    hosted_publication_floor: receipt.hosted_publication_floor,
    homebrew: receipt.homebrew,
    latest_compare_and_swap: receipt.latest_compare_and_swap,
  };
  receipt.input_digest = `sha256:${crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}`;
}

function previewFixture() {
  const files = fixture([]);
  const previewVersion = '26.7.22-preview.r1';
  const previewUpdaterVersion = '26.7.2201';
  const previewTag = `v${previewVersion}`;
  const previewZip = asset(`One-Person-Lab-${previewVersion}-mac-arm64.zip`, '8');
  const previewDmg = asset(`One-Person-Lab-${previewVersion}-mac-arm64.dmg`, '6');
  const bundle = JSON.parse(fs.readFileSync(files.bundlePath, 'utf8'));
  bundle.release = {
    channel: 'preview',
    version: previewVersion,
    updater_version: previewUpdaterVersion,
    tag: previewTag,
    prerelease: false,
  };
  fs.writeFileSync(files.bundlePath, `${JSON.stringify(bundle)}\n`);
  const status = JSON.parse(fs.readFileSync(files.statusPath, 'utf8'));
  status.release_bundle_status.latest_eligible = false;
  status.release_bundle_status.bundle = bundle;
  status.release_bundle_status.tracks.standard.assets = [previewZip, previewDmg, componentManifestAsset];
  fs.writeFileSync(files.statusPath, `${JSON.stringify(status)}\n`);
  const admission = JSON.parse(fs.readFileSync(files.admissionPath, 'utf8'));
  admission.publication_channel = 'preview';
  admission.classification = {
    quality_status: 'preview',
    build_trigger: 'manual',
    preview_kind: 'dev',
    quality_unchanged: true,
    non_stable_notice: true,
    skipped_gates: ['homebrew_clean_install'],
    failed_gates: [],
  };
  admission.pointer_authority = {
    mode: 'protected_single_use_exact_version',
    single_use: true,
    persistent_override: false,
    authority_digest: `sha256:${'1'.repeat(64)}`,
    failure_policy: 'preserve_current_latest_lkg',
    stable_reclaim: 'next_qualified_stable',
  };
  admission.candidate = {
    display_version: previewVersion,
    updater_version: previewUpdaterVersion,
    app_sha: sourceCommit,
    shell_sha: shellCommit,
    framework_sha: frameworkCommit,
    zip: {
      name: previewZip.name,
      sha256: previewZip.sha256,
      size_bytes: previewZip.size_bytes,
    },
    dmg: {
      name: previewDmg.name,
      sha256: previewDmg.sha256,
      size_bytes: previewDmg.size_bytes,
    },
  };
  admission.hosted_publication_floor.required_assets = [
    previewDmg.name,
    previewZip.name,
    `${previewZip.name}.blockmap`,
    'latest-arm64-mac.yml',
    'opl-app-component-manifest.json',
    'opl-install.sh',
    'opl-app-installer.sh',
    'standard-gatekeeper-launch-policy.json',
    'standard-apple-notarization-receipt.json',
  ];
  admission.homebrew = null;
  admission.latest_compare_and_swap.candidate.tag = previewTag;
  sealAdmission(admission);
  fs.writeFileSync(files.admissionPath, `${JSON.stringify(admission)}\n`);
  return { ...files, previewVersion, previewUpdaterVersion, previewTag };
}

function nightlyLatestFixture() {
  const files = fixture([]);
  const nightlyVersion = '26.7.22-nightly.r1';
  const nightlyUpdaterVersion = '26.7.2291-nightly.1';
  const nightlyTag = `v${nightlyVersion}`;
  const nightlyZip = asset(`One-Person-Lab-${nightlyVersion}-mac-arm64.zip`, '7');
  const nightlyDmg = asset(`One-Person-Lab-${nightlyVersion}-mac-arm64.dmg`, '5');
  const bundle = JSON.parse(fs.readFileSync(files.bundlePath, 'utf8'));
  bundle.release = {
    channel: 'nightly',
    version: nightlyVersion,
    updater_version: nightlyUpdaterVersion,
    tag: nightlyTag,
    prerelease: true,
  };
  fs.writeFileSync(files.bundlePath, `${JSON.stringify(bundle)}\n`);
  const status = JSON.parse(fs.readFileSync(files.statusPath, 'utf8'));
  status.release_bundle_status.latest_eligible = false;
  status.release_bundle_status.bundle = bundle;
  status.release_bundle_status.tracks.standard.assets = [nightlyZip, nightlyDmg, componentManifestAsset];
  fs.writeFileSync(files.statusPath, `${JSON.stringify(status)}\n`);
  const admission = JSON.parse(fs.readFileSync(files.admissionPath, 'utf8'));
  admission.publication_channel = 'nightly';
  admission.classification = {
    quality_status: 'preview',
    build_trigger: 'automated',
    preview_kind: 'nightly',
    quality_unchanged: true,
    non_stable_notice: true,
    skipped_gates: ['stable_heavy_vm', 'homebrew_clean_install'],
    failed_gates: [],
  };
  admission.pointer_authority = {
    mode: 'protected_single_use_exact_version',
    single_use: true,
    persistent_override: false,
    authority_digest: `sha256:${'2'.repeat(64)}`,
    failure_policy: 'preserve_current_latest_lkg',
    stable_reclaim: 'next_qualified_stable',
  };
  admission.candidate = {
    display_version: nightlyVersion,
    updater_version: nightlyUpdaterVersion,
    app_sha: sourceCommit,
    shell_sha: shellCommit,
    framework_sha: frameworkCommit,
    zip: {
      name: nightlyZip.name,
      sha256: nightlyZip.sha256,
      size_bytes: nightlyZip.size_bytes,
    },
    dmg: {
      name: nightlyDmg.name,
      sha256: nightlyDmg.sha256,
      size_bytes: nightlyDmg.size_bytes,
    },
  };
  admission.hosted_publication_floor.required_assets = [
    nightlyDmg.name,
    nightlyZip.name,
    `${nightlyZip.name}.blockmap`,
    'latest-arm64-mac.yml',
    'opl-app-component-manifest.json',
    'opl-install.sh',
    'opl-app-installer.sh',
  ];
  admission.homebrew = null;
  admission.latest_compare_and_swap.candidate.tag = nightlyTag;
  sealAdmission(admission);
  fs.writeFileSync(files.admissionPath, `${JSON.stringify(admission)}\n`);
  return { ...files, nightlyVersion, nightlyUpdaterVersion, nightlyTag };
}

function success(value: unknown = ''): GitHubCommandResult {
  return {
    status: 0,
    stdout: value === '' ? '' : JSON.stringify(value),
    stderr: '',
  };
}

function releaseResponse(
  assets: Asset[],
  options: { draft?: boolean; immutable?: boolean } = {},
): Record<string, unknown> {
  return {
    id: 12345,
    name: `One Person Lab v${version}`,
    draft: options.draft ?? false,
    prerelease: false,
    target_commitish: sourceCommit,
    body: notes,
    immutable: options.immutable ?? true,
    assets: assets.map((asset) => ({
      name: asset.name,
      size: asset.size_bytes,
      digest: asset.sha256,
    })),
  };
}

function fixture(
  actions: Asset[],
  releaseOperation: 'standard' | 'append_full' = 'standard',
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-github-deadline-'));
  const bundlePath = path.join(root, 'bundle.json');
  const planPath = path.join(root, 'plan.json');
  const statusPath = path.join(root, 'status.json');
  const admissionPath = path.join(root, 'latest-admission.json');
  const bundle = {
    surface_kind: 'opl_release_bundle.v1',
    bundle_digest: bundleDigest,
    release: { channel: 'stable', version, updater_version: updaterVersion, tag, prerelease: false },
    sources: {
      app: { repo, source_commit: sourceCommit },
      shell: { source_commit: shellCommit },
      framework: { source_commit: frameworkCommit },
    },
    prepared_notes: { markdown: notes },
  };
  const track = releaseOperation === 'append_full' ? 'full' : 'standard';
  const operationId = releaseOperation === 'append_full' ? appendFullOperationId : standardOperationId;
  const operationStartedAt = releaseOperation === 'append_full'
    ? appendFullOperationStartedAt
    : standardOperationStartedAt;
  const operationControl = {
    operation_id: operationId,
    operation_started_at: operationStartedAt,
    operation_deadline_at: deadlineAt,
  };
  fs.writeFileSync(bundlePath, `${JSON.stringify(bundle)}\n`);
  fs.writeFileSync(planPath, `${JSON.stringify({
    release_bundle_publish: {
      bundle_digest: bundleDigest,
      track,
      status: 'ready',
      receipt: {
        release_operation: releaseOperation,
        operation_control: operationControl,
        details: {
          upload_actions: actions.map((asset) => ({
            action: 'upload',
            name: asset.name,
            source_path: asset.source_path,
            size_bytes: asset.size_bytes,
            sha256: asset.sha256,
          })),
        },
      },
    },
  })}\n`);
  fs.writeFileSync(statusPath, `${JSON.stringify({
    release_bundle_status: {
      bundle_digest: bundleDigest,
      latest_eligible: true,
      bundle,
      tracks: { standard: { assets: [latestZip, latestDmg, componentManifestAsset] } },
      operation_controls: { standard: operationControl, append_full: null },
    },
  })}\n`);
  const admission: Record<string, any> = {
    schema: 'opl_standard_latest_admission_receipt.v1',
    status: 'passed',
    publication_channel: 'stable',
    operation: 'move_latest_pointer',
    latest_activation_admitted: true,
    classification: {
      quality_status: 'stable',
      build_trigger: 'manual',
      preview_kind: null,
      quality_unchanged: true,
      non_stable_notice: false,
      skipped_gates: [],
      failed_gates: [],
    },
    component_manifest: {
      manifest_digest: `sha256:${'d'.repeat(64)}`,
      file_sha256: componentManifestAsset.sha256,
      source_commit: sourceCommit,
      artifact_digest: `sha256:${'e'.repeat(64)}`,
    },
    pointer_authority: {
      mode: 'qualified_stable_default',
      single_use: false,
      persistent_override: false,
      authority_digest: null,
      failure_policy: 'preserve_current_latest_lkg',
      stable_reclaim: 'next_qualified_stable',
    },
    bundle_digest: bundleDigest,
    candidate: {
      display_version: version,
      updater_version: updaterVersion,
      app_sha: sourceCommit,
      shell_sha: shellCommit,
      framework_sha: frameworkCommit,
      zip: { name: latestZip.name, sha256: latestZip.sha256, size_bytes: latestZip.size_bytes },
      dmg: { name: latestDmg.name, sha256: latestDmg.sha256, size_bytes: latestDmg.size_bytes },
    },
    standard_assets_sha256: `sha256:${'e'.repeat(64)}`,
    hosted_publication_floor: {
      schema: 'opl_standard_hosted_publication_floor.v1',
      source_contract_build_preflight: 'passed',
      remote_digest_readback: 'passed',
      required_assets: [
        latestDmg.name,
        latestZip.name,
        `${latestZip.name}.blockmap`,
        'latest-arm64-mac.yml',
        'opl-app-component-manifest.json',
        'opl-install.sh',
        'opl-app-installer.sh',
        'standard-gatekeeper-launch-policy.json',
        'standard-apple-notarization-receipt.json',
      ],
      self_hosted_ancestor_count: 0,
      vm_ancestor_count: 0,
      tart_ancestor_count: 0,
    },
    homebrew: {
      publication_receipt_sha256: `sha256:${'7'.repeat(64)}`,
      readback_receipt_sha256: `sha256:${'a'.repeat(64)}`,
    },
    latest_compare_and_swap: {
      expected_current: { tag: expectedCurrentLatestTag },
      candidate: { tag },
    },
  };
  sealAdmission(admission);
  fs.writeFileSync(admissionPath, `${JSON.stringify(admission)}\n`);
  return { root, bundlePath, planPath, statusPath, admissionPath };
}

function asset(name: string, byte: string): Asset {
  return {
    name,
    size_bytes: 100,
    sha256: `sha256:${byte.repeat(64)}`,
    source_path: `/immutable/${name}`,
  };
}

function isReleaseInspect(args: string[]): boolean {
  return args[0] === 'api' && args[1] === `repos/${repo}/releases/tags/${tag}`;
}

function isImmutableCapabilityRead(args: string[]): boolean {
  return args[0] === 'api' && args[1] === `repos/${repo}/immutable-releases`;
}

function immutableCapabilityResponse(enabled = true): GitHubCommandResult {
  return success({ enabled, enforced_by_owner: false });
}

test('absent GitHub Release remote inspection yields an empty receipt for the first upload plan', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-absent-release-receipt-'));
  const bundlePath = path.join(root, 'bundle.json');
  const inspectionPath = path.join(root, 'remote-before.json');
  const requiredNames = ['first.zip', 'second.dmg'];
  try {
    fs.writeFileSync(bundlePath, `${JSON.stringify({
      surface_kind: 'opl_release_bundle.v1',
      bundle_digest: bundleDigest,
      tracks: { standard: { required_asset_names: requiredNames } },
    })}\n`);
    fs.writeFileSync(inspectionPath, `${JSON.stringify({
      surface_kind: 'opl_app_github_release_inspection.v1',
      repository: repo,
      tag,
      release: { exists: false },
      assets: [],
    })}\n`);
    const receipt = buildExecutorReceipt({
      operation: 'remote_inspect',
      'release-operation': 'standard',
      'operation-id': standardOperationId,
      executor: 'remote',
      'attempt-id': workflowAttemptId,
      'remote-target': `github-release:${repo}@${tag}`,
      track: 'standard',
      outcome: 'complete',
      'publication-scope': 'track_assets',
      bundle: bundlePath,
      inspection: inspectionPath,
    } as any);
    assert.deepEqual(receipt.assets, []);
    assert.equal(receipt.outcome, 'complete');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('absent GitHub Release remote inspection rejects missing, non-empty, or duplicate assets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-malformed-absent-release-receipt-'));
  const bundlePath = path.join(root, 'bundle.json');
  const inspectionPath = path.join(root, 'remote-before.json');
  try {
    fs.writeFileSync(bundlePath, `${JSON.stringify({
      surface_kind: 'opl_release_bundle.v1',
      bundle_digest: bundleDigest,
      tracks: { standard: { required_asset_names: ['first.zip', 'second.dmg'] } },
    })}\n`);
    for (const assets of [
      undefined,
      [{ name: 'unexpected.zip' }],
      [{ name: 'first.zip' }, { name: 'first.zip' }],
    ]) {
      fs.writeFileSync(inspectionPath, `${JSON.stringify({
        surface_kind: 'opl_app_github_release_inspection.v1',
        repository: repo,
        tag,
        release: { exists: false },
        ...(assets === undefined ? {} : { assets }),
      })}\n`);
      assert.throws(
        () => buildExecutorReceipt({
          operation: 'remote_inspect',
          'release-operation': 'standard',
          'operation-id': standardOperationId,
          executor: 'remote',
          'attempt-id': workflowAttemptId,
          'remote-target': `github-release:${repo}@${tag}`,
          track: 'standard',
          outcome: 'complete',
          'publication-scope': 'track_assets',
          bundle: bundlePath,
          inspection: inspectionPath,
        } as any),
        /Remote standard absent-release inspection must contain an empty asset list/,
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('existing GitHub Release remote inspection accepts a unique required subset only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-partial-release-receipt-'));
  const bundlePath = path.join(root, 'bundle.json');
  const inspectionPath = path.join(root, 'remote-before.json');
  const requiredNames = ['first.zip', 'second.dmg'];
  const execute = (assets: Array<Record<string, unknown>>) => {
    fs.writeFileSync(inspectionPath, `${JSON.stringify({
      surface_kind: 'opl_app_github_release_inspection.v1',
      repository: repo,
      tag,
      release: { exists: true, id: 12345 },
      assets,
    })}\n`);
    return buildExecutorReceipt({
      operation: 'remote_inspect',
      'release-operation': 'standard',
      'operation-id': standardOperationId,
      executor: 'remote',
      'attempt-id': workflowAttemptId,
      'remote-target': `github-release:${repo}@${tag}`,
      track: 'standard',
      outcome: 'complete',
      'publication-scope': 'track_assets',
      bundle: bundlePath,
      inspection: inspectionPath,
    } as any);
  };
  try {
    fs.writeFileSync(bundlePath, `${JSON.stringify({
      surface_kind: 'opl_release_bundle.v1',
      bundle_digest: bundleDigest,
      tracks: { standard: { required_asset_names: requiredNames } },
    })}\n`);

    assert.deepEqual(execute([]).assets, []);
    const second = asset(requiredNames[1]!, '2');
    assert.deepEqual(execute([second]).assets, [{
      name: second.name,
      size_bytes: second.size_bytes,
      sha256: second.sha256,
    }]);
    assert.throws(
      () => execute([asset('unknown.bin', '3')]),
      /contains unknown asset unknown\.bin/,
    );
    assert.throws(() => execute([second, second]), /contains duplicate asset second\.dmg/);
    assert.throws(
      () => execute([{ ...second, sha256: 'sha256:not-a-digest' }]),
      /has no exact digest and positive size/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('deadline expiry before asset N prevents asset N and every later mutation', () => {
  const first = asset('first.zip', '1');
  const second = asset('second.yml', '2');
  const files = fixture([first, second]);
  const remoteAssets: Asset[] = [];
  const mutationCalls: string[][] = [];
  const mutationTimes = [deadlineMs - 60_000, deadlineMs];
  const runtime: GitHubAdapterRuntime = {
    now: () => mutationTimes.shift() ?? deadlineMs,
    readTimeoutMs: 1_234,
    mutationTimeoutMs: 120_000,
    run(command, args, options) {
      assert.equal(command, 'gh');
      assert.equal(options.killSignal, 'SIGTERM');
      if (isImmutableCapabilityRead(args)) return immutableCapabilityResponse();
      if (isReleaseInspect(args)) {
        assert.equal(options.timeout, 1_234);
        return success(releaseResponse(remoteAssets, { draft: true, immutable: false }));
      }
      if (args[0] === 'release' && args[1] === 'upload') {
        mutationCalls.push(args);
        assert.equal(options.timeout, 60_000);
        const uploaded = [first, second].find((candidate) => candidate.source_path === args[3]);
        assert.ok(uploaded);
        remoteAssets.push(uploaded);
        return success();
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };

  const result = applyPublishPlan({
    ...mutationAdmission(),
    bundle: files.bundlePath,
    plan: files.planPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);

  assert.equal(result.status, 'deadline_elapsed');
  assert.deepEqual(result.uploaded, [first.name]);
  assert.equal(result.unresolved_asset, second.name);
  assert.equal(result.failure.failure_taxonomy, 'github_mutation_deadline_elapsed');
  assert.equal(result.mutation_attempt_id, expectedMutationAttemptId(
    'asset_upload', `github-release:${repo}@${tag}`, second.name,
  ));
  assert.equal(result.remote_target, `github-release:${repo}@${tag}`);
  assert.equal(result.failure.mutation_attempt_id, result.mutation_attempt_id);
  assert.equal(result.failure.remote_target, result.remote_target);
  assert.equal(result.failure.input_digest.startsWith('sha256:'), true);
  assert.equal(mutationCalls.length, 1);
  assert.equal(mutationCalls[0][3], first.source_path);
});

test('a timed out asset upload stops all mutation and performs only fresh read-only inspection', () => {
  const first = asset('first.zip', '3');
  const second = asset('second.yml', '4');
  const files = fixture([first, second]);
  const calls: Array<{ args: string[]; options: GitHubCommandOptions }> = [];
  let inspections = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 90_000,
    readTimeoutMs: 2_345,
    run(_command, args, options) {
      calls.push({ args, options });
      if (isImmutableCapabilityRead(args)) return immutableCapabilityResponse();
      if (isReleaseInspect(args)) {
        inspections += 1;
        return success(releaseResponse([], { draft: true, immutable: false }));
      }
      if (args[0] === 'release' && args[1] === 'upload') {
        return {
          status: null,
          signal: 'SIGTERM',
          stdout: 'partial stdout',
          stderr: 'timed out stderr',
          error: Object.assign(new Error('spawnSync gh ETIMEDOUT'), { code: 'ETIMEDOUT' }),
        };
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };

  const result = applyPublishPlan({
    ...mutationAdmission(),
    bundle: files.bundlePath,
    plan: files.planPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);

  const uploads = calls.filter(({ args }) => args[0] === 'release' && args[1] === 'upload');
  assert.equal(result.status, 'outcome_unknown');
  assert.equal(result.unresolved_asset, first.name);
  assert.equal(result.retry_disposition, 'read_only_reconcile_only');
  assert.equal(result.failure.failure_taxonomy, 'github_mutation_timeout');
  assert.equal(result.mutation_attempt_id, expectedMutationAttemptId(
    'asset_upload', `github-release:${repo}@${tag}`, first.name,
  ));
  assert.equal(result.remote_target, `github-release:${repo}@${tag}`);
  assert.equal(result.failure.mutation_attempt_id, result.mutation_attempt_id);
  assert.equal(result.failure.remote_target, result.remote_target);
  assert.equal(result.failure.timed_out, true);
  assert.equal(result.failure.stdout, 'partial stdout');
  assert.equal(result.failure.stderr, 'timed out stderr');
  assert.match(result.failure.input_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(uploads.length, 1);
  assert.equal(inspections, 3, 'initial, pre-upload, and one post-timeout inspection are bounded reads');
  assert.ok(calls.filter(({ args }) => isReleaseInspect(args)).every(({ options }) => options.timeout === 2_345));
});

test('a timed out Release create performs one mutation and then read-only reconciliation only', () => {
  const files = fixture([asset('first.zip', '5')]);
  const calls: string[][] = [];
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 90_000,
    readTimeoutMs: 2_222,
    run(_command, args, options) {
      calls.push(args);
      if (isImmutableCapabilityRead(args)) return immutableCapabilityResponse();
      if (isReleaseInspect(args)) {
        assert.equal(options.timeout, 2_222);
        return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      }
      if (args.includes('POST')) {
        return {
          status: null,
          signal: 'SIGTERM',
          stdout: 'possibly created',
          stderr: 'timed out',
          error: Object.assign(new Error('spawnSync gh ETIMEDOUT'), { code: 'ETIMEDOUT' }),
        };
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };

  const result = applyPublishPlan({
    ...mutationAdmission(),
    bundle: files.bundlePath,
    plan: files.planPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);

  assert.equal(result.status, 'outcome_unknown');
  assert.equal(result.failure.mutation, 'release_create');
  assert.equal(result.failure.failure_taxonomy, 'github_mutation_timeout');
  assert.equal(result.mutation_attempt_id, expectedMutationAttemptId(
    'release_create', `github-release:${repo}@${tag}`, tag,
  ));
  assert.equal(result.remote_target, `github-release:${repo}@${tag}`);
  assert.equal(result.failure.mutation_attempt_id, result.mutation_attempt_id);
  assert.equal(result.failure.remote_target, result.remote_target);
  assert.equal(calls.filter((args) => args.includes('POST')).length, 1);
  assert.equal(calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length, 0);
  assert.equal(calls.filter(isReleaseInspect).length, 2, 'one pre-create read and one bounded reconcile read');
});

test('a timed out Latest PATCH performs readback only and remains outcome_unknown', () => {
  const files = fixture([]);
  const calls: string[][] = [];
  let latestTag = expectedCurrentLatestTag;
  let latestReads = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 45_000,
    readTimeoutMs: 3_456,
    run(_command, args, options) {
      calls.push(args);
      assert.equal(options.killSignal, 'SIGTERM');
      if (isReleaseInspect(args)) return success(releaseResponse([]));
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/latest`) {
        latestReads += 1;
        assert.equal(options.timeout, 3_456);
        return success({ tag_name: latestTag });
      }
      if (args.includes('PATCH')) {
        latestTag = tag;
        return {
          status: null,
          signal: 'SIGTERM',
          stdout: 'possibly accepted',
          stderr: 'deadline killed process',
          error: Object.assign(new Error('spawnSync gh ETIMEDOUT'), { code: 'ETIMEDOUT' }),
        };
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };

  const result = activateLatest({
    ...mutationAdmission('resume_standard'),
    bundle: files.bundlePath,
    status: files.statusPath,
    'latest-admission': files.admissionPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);

  const patches = calls.filter((args) => args.includes('PATCH'));
  assert.equal(result.status, 'outcome_unknown');
  assert.equal(result.failure.failure_taxonomy, 'github_mutation_timeout');
  assert.equal(result.mutation_attempt_id, expectedMutationAttemptId(
    'latest_patch', `github-latest:${repo}@${tag}`, tag,
  ));
  assert.equal(result.remote_target, `github-latest:${repo}@${tag}`);
  assert.equal(result.failure.mutation_attempt_id, result.mutation_attempt_id);
  assert.equal(result.failure.remote_target, result.remote_target);
  assert.equal(result.retry_disposition, 'read_only_reconcile_only');
  assert.equal(result.reconciliation.observation.tag_name, tag);
  assert.equal(patches.length, 1);
  assert.equal(latestReads, 2, 'one pre-mutation inspect and one post-timeout readback');
});

test('read-only inspection remains bounded after the operation deadline', () => {
  const seen: GitHubCommandOptions[] = [];
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs + 60_000,
    readTimeoutMs: 4_567,
    run(_command, args, options) {
      seen.push(options);
      assert.equal(isReleaseInspect(args), true);
      return success(releaseResponse([]));
    },
  };

  const observation = inspectRelease(repo, tag, runtime);
  assert.equal(observation.release.exists, true);
  assert.deepEqual(seen.map(({ timeout, killSignal }) => ({ timeout, killSignal })), [
    { timeout: 4_567, killSignal: 'SIGTERM' },
  ]);
});

test('Framework latest_eligible cannot bypass the App Latest admission receipt', () => {
  const files = fixture([]);
  let calls = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run() {
      calls += 1;
      return success();
    },
  };
  assert.throws(
    () => activateLatest({
      ...mutationAdmission(),
      bundle: files.bundlePath,
      status: files.statusPath,
      'operation-deadline-at': deadlineAt,
    }, runtime),
    /Missing --latest-admission/,
  );
  assert.equal(calls, 0);
});

test('complete hosted admission does not require legacy Framework latest_eligible state', () => {
  const files = fixture([]);
  const status = JSON.parse(fs.readFileSync(files.statusPath, 'utf8'));
  status.release_bundle_status.latest_eligible = false;
  fs.writeFileSync(files.statusPath, `${JSON.stringify(status)}\n`);
  let latestTag = expectedCurrentLatestTag;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      if (isReleaseInspect(args)) return success(releaseResponse([]));
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/latest`) {
        return success({ tag_name: latestTag });
      }
      if (args.includes('PATCH')) {
        latestTag = tag;
        return success();
      }
      throw new Error(`Unexpected GitHub call: ${args.join(' ')}`);
    },
  };
  const result = activateLatest({
    ...mutationAdmission(),
    bundle: files.bundlePath,
    status: files.statusPath,
    'latest-admission': files.admissionPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);
  assert.equal(result.status, 'complete');
  assert.equal(result.latest_compare_and_swap.patch_performed, true);
});

test('Latest admission for different ZIP bytes fails before any GitHub call', () => {
  const files = fixture([]);
  const admission = JSON.parse(fs.readFileSync(files.admissionPath, 'utf8'));
  admission.candidate.zip.sha256 = `sha256:${'f'.repeat(64)}`;
  sealAdmission(admission);
  fs.writeFileSync(files.admissionPath, `${JSON.stringify(admission)}\n`);
  let calls = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run() {
      calls += 1;
      return success();
    },
  };
  assert.throws(
    () => activateLatest({
      ...mutationAdmission(),
      bundle: files.bundlePath,
      status: files.statusPath,
      'latest-admission': files.admissionPath,
      'operation-deadline-at': deadlineAt,
    }, runtime),
    /Latest admission ZIP sha256 does not match/,
  );
  assert.equal(calls, 0);
});

test('GitHub mutation commands require an immutable operation deadline', () => {
  assert.throws(() => applyPublishPlan(mutationAdmission()), /Missing --operation-deadline-at/);
  assert.throws(() => activateLatest(mutationAdmission()), /Missing --operation-deadline-at/);
});

test('GitHub mutation commands require an explicit publication channel before any GitHub call', () => {
  const files = fixture([]);
  let calls = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run() {
      calls += 1;
      return success();
    },
  };
  const values = mutationAdmission();
  delete values['publication-channel'];
  assert.throws(
    () => applyPublishPlan({
      ...values,
      bundle: files.bundlePath,
      plan: files.planPath,
      'operation-deadline-at': deadlineAt,
    }, runtime),
    /Missing --publication-channel/,
  );
  assert.throws(
    () => activateLatest({
      ...values,
      bundle: files.bundlePath,
      status: files.statusPath,
      'latest-admission': files.admissionPath,
      'operation-deadline-at': deadlineAt,
    }, runtime),
    /Missing --publication-channel/,
  );
  assert.equal(calls, 0);
});

test('GitHub mutation commands reject incomplete operation identity before any gh call', () => {
  let calls = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run() {
      calls += 1;
      return success();
    },
  };
  for (const missing of ['operation-id', 'operation-started-at', 'attempt-id'] as const) {
    const values: Record<string, string> = {
      ...mutationAdmission(),
      'operation-deadline-at': deadlineAt,
    };
    delete values[missing];
    assert.throws(
      () => applyPublishPlan(values, runtime),
      (error: any) => {
        assert.equal(error.result.status, 'failed');
        assert.match(error.result.failure.input_digest, /^sha256:[0-9a-f]{64}$/);
        assert.ok(error.result.failure.stderr);
        return true;
      },
    );
  }
  assert.equal(calls, 0);
});

test('Latest compare-and-swap drift fails closed before PATCH', () => {
  const files = fixture([]);
  const calls: string[][] = [];
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      calls.push(args);
      if (isReleaseInspect(args)) return success(releaseResponse([]));
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/latest`) {
        return success({ tag_name: 'v26.7.19' });
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };

  assert.throws(
    () => activateLatest({
      ...mutationAdmission(),
      bundle: files.bundlePath,
      status: files.statusPath,
      'latest-admission': files.admissionPath,
      'operation-deadline-at': deadlineAt,
    }, runtime),
    (error: any) => {
      assert.equal(error.result.status, 'failed');
      assert.equal(error.result.failure.failure_taxonomy, 'github_latest_compare_and_swap_drift');
      assert.equal(error.result.failure.expected_current_tag, expectedCurrentLatestTag);
      assert.equal(error.result.failure.observed_current_tag, 'v26.7.19');
      assert.equal(error.result.retry_disposition, 'inspect_only_no_patch_require_new_admission');
      assert.match(error.result.failure.input_digest, /^sha256:[0-9a-f]{64}$/);
      assert.equal(error.result.failure.stdout, '');
      assert.match(error.result.failure.stderr, /Latest drifted/);
      return true;
    },
  );
  assert.equal(calls.filter((args) => args.includes('PATCH')).length, 0);
});

test('Latest already pointing at the candidate is idempotent with zero PATCH', () => {
  const files = fixture([]);
  const calls: string[][] = [];
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      calls.push(args);
      if (isReleaseInspect(args)) return success(releaseResponse([]));
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/latest`) {
        return success({ tag_name: tag });
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };

  const result = activateLatest({
    ...mutationAdmission('resume_standard'),
    bundle: files.bundlePath,
    status: files.statusPath,
    'latest-admission': files.admissionPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);
  assert.equal(result.status, 'idempotent');
  assert.equal(result.latest_compare_and_swap.patch_performed, false);
  assert.equal(calls.filter((args) => args.includes('PATCH')).length, 0);
});

test('Latest compare-and-swap rejects remote drift from the sealed expected current tag', () => {
  const files = fixture([]);
  const admission = JSON.parse(fs.readFileSync(files.admissionPath, 'utf8'));
  admission.latest_compare_and_swap.expected_current = {
    tag: 'v26.7.19',
  };
  sealAdmission(admission);
  fs.writeFileSync(files.admissionPath, `${JSON.stringify(admission)}\n`);
  let calls = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      calls += 1;
      if (isReleaseInspect(args)) return success(releaseResponse([]));
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/latest`) {
        return success({ tag_name: expectedCurrentLatestTag });
      }
      throw new Error(`Unexpected GitHub call: ${args.join(' ')}`);
    },
  };
  assert.throws(
    () => activateLatest({
      ...mutationAdmission(),
      bundle: files.bundlePath,
      status: files.statusPath,
      'latest-admission': files.admissionPath,
      'operation-deadline-at': deadlineAt,
    }, runtime),
    /Latest drifted: expected v26\.7\.19, observed v26\.7\.20/,
  );
  assert.equal(calls, 2);
});

test('Latest rejects a tampered compare-and-swap predecessor before any GitHub call', () => {
  const files = fixture([]);
  const admission = JSON.parse(fs.readFileSync(files.admissionPath, 'utf8'));
  admission.latest_compare_and_swap.expected_current = {
    tag: 'v26.7.21',
  };
  fs.writeFileSync(files.admissionPath, `${JSON.stringify(admission)}\n`);
  let calls = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run() {
      calls += 1;
      return success();
    },
  };
  assert.throws(
    () => activateLatest({
      ...mutationAdmission(),
      bundle: files.bundlePath,
      status: files.statusPath,
      'latest-admission': files.admissionPath,
      'operation-deadline-at': deadlineAt,
    }, runtime),
    /Latest admission input_digest does not match/,
  );
  assert.equal(calls, 0);
});

test('raw GitHub mutation commands reject reruns and operation-track mismatches before gh', () => {
  let calls = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run() {
      calls += 1;
      return success();
    },
  };
  for (const values of [
    { 'run-attempt': '1' },
    { operation: 'standard', 'run-attempt': '1' },
    { operation: 'publish', track: 'standard', 'run-attempt': '1' },
    { operation: 'standard', track: 'nightly', 'run-attempt': '1' },
    { ...mutationAdmission(), 'run-attempt': '2' },
    { ...mutationAdmission('append_full', 'standard') },
    { ...mutationAdmission('standard', 'full') },
  ]) {
    assert.throws(
      () => applyPublishPlan(values, runtime),
      (error: any) => {
        assert.equal(error.result.status, 'failed');
        assert.match(error.result.failure.input_digest, /^sha256:[0-9a-f]{64}$/);
        assert.equal(error.result.failure.stdout, '');
        assert.ok(error.result.failure.stderr);
        return true;
      },
    );
  }
  assert.equal(calls, 0);
});

test('github-apply admits append_full only for a Framework Full publish plan', () => {
  const files = fixture([], 'append_full');
  let calls = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      calls += 1;
      if (isImmutableCapabilityRead(args)) return immutableCapabilityResponse();
      if (isReleaseInspect(args)) return success(releaseResponse([]));
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };
  const result = applyPublishPlan({
    ...mutationAdmission('append_full', 'full'),
    bundle: files.bundlePath,
    plan: files.planPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);
  assert.equal(result.status, 'complete');
  assert.equal(calls, 1);
});

test('github-apply publishes a Nightly Bundle as prerelease and never as Latest', () => {
  const files = fixture([]);
  const nightlyVersion = '26.7.22-nightly';
  const bundle = JSON.parse(fs.readFileSync(files.bundlePath, 'utf8'));
  bundle.release = {
    channel: 'nightly',
    version: nightlyVersion,
    updater_version: '26.7.2290-nightly.0',
    tag: `v${nightlyVersion}`,
    prerelease: true,
  };
  fs.writeFileSync(files.bundlePath, `${JSON.stringify(bundle)}\n`);
  const calls: Array<{ args: string[]; stdin?: string }> = [];
  let exists = false;
  let published = false;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args, options) {
      calls.push({ args, stdin: options.input });
      if (isImmutableCapabilityRead(args)) return immutableCapabilityResponse();
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/tags/v${nightlyVersion}`) {
        if (!exists) return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
        return success({
          id: 12345,
          name: `One Person Lab v${nightlyVersion}`,
          draft: !published,
          prerelease: true,
          target_commitish: sourceCommit,
          body: notes,
          immutable: published,
          assets: [],
        });
      }
      if (args.includes('POST')) {
        exists = true;
        return success();
      }
      if (args.includes('PATCH')) {
        published = true;
        return success();
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };
  const result = applyPublishPlan({
    ...mutationAdmission(),
    bundle: files.bundlePath,
    plan: files.planPath,
    'operation-deadline-at': deadlineAt,
    'publication-channel': 'nightly',
  }, runtime);
  assert.equal(result.status, 'complete');
  const create = calls.find(({ args }) => args.includes('POST'));
  assert.ok(create?.stdin);
  const payload = JSON.parse(create.stdin);
  assert.equal(payload.prerelease, true);
  assert.equal(payload.draft, true);
  assert.equal(payload.make_latest, 'false');
});

test('github-apply publishes a qualified Preview as a non-prerelease without implicitly changing Latest', () => {
  const files = previewFixture();
  const calls: Array<{ args: string[]; stdin?: string }> = [];
  let exists = false;
  let published = false;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args, options) {
      calls.push({ args, stdin: options.input });
      if (isImmutableCapabilityRead(args)) return immutableCapabilityResponse();
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/tags/${files.previewTag}`) {
        if (!exists) return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
        return success({
          id: 12345,
          name: `One Person Lab v${files.previewVersion}`,
          draft: !published,
          prerelease: false,
          target_commitish: sourceCommit,
          body: notes,
          immutable: published,
          assets: [],
        });
      }
      if (args.includes('POST')) {
        exists = true;
        return success();
      }
      if (args.includes('PATCH')) {
        published = true;
        return success();
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };
  const result = applyPublishPlan({
    ...mutationAdmission(),
    bundle: files.bundlePath,
    plan: files.planPath,
    'operation-deadline-at': deadlineAt,
    'publication-channel': 'preview',
  }, runtime);
  assert.equal(result.status, 'complete');
  const create = calls.find(({ args }) => args.includes('POST'));
  assert.ok(create?.stdin);
  const payload = JSON.parse(create.stdin);
  assert.equal(payload.prerelease, false);
  assert.equal(payload.draft, true);
  assert.equal(payload.make_latest, 'false');
});

test('release inspection treats an absent immutable field as false, never true', () => {
  const response = releaseResponse([]);
  delete response.immutable;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      assert.equal(isReleaseInspect(args), true);
      return success(response);
    },
  };
  assert.equal(inspectRelease(repo, tag, runtime).release.immutable, false);
});

test('immutable capability disabled fails closed before every public mutation', () => {
  const files = fixture([asset('first.zip', '1')]);
  const calls: string[][] = [];
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      calls.push(args);
      if (isImmutableCapabilityRead(args)) return immutableCapabilityResponse(false);
      throw new Error(`Unexpected GitHub call after disabled capability: ${args.join(' ')}`);
    },
  };

  assert.throws(
    () => applyPublishPlan({
      ...mutationAdmission(),
      bundle: files.bundlePath,
      plan: files.planPath,
      'operation-deadline-at': deadlineAt,
    }, runtime),
    (error: any) => {
      assert.equal(error.result.status, 'failed');
      assert.equal(error.result.failure.failure_taxonomy, 'github_immutable_releases_disabled');
      return true;
    },
  );
  assert.equal(calls.filter((args) => args.includes('POST')).length, 0);
  assert.equal(calls.filter((args) => args.includes('PATCH')).length, 0);
  assert.equal(calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length, 0);
});

test('an exact immutable published carrier remains a read-only idempotent reconcile when capability is disabled', () => {
  const first = asset('first.zip', '2');
  const files = fixture([first]);
  const calls: string[][] = [];
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      calls.push(args);
      if (isReleaseInspect(args)) {
        return success(releaseResponse([first], { draft: false, immutable: true }));
      }
      throw new Error(`Unexpected GitHub mutation or capability read: ${args.join(' ')}`);
    },
  };

  const result = applyPublishPlan({
    ...mutationAdmission(),
    bundle: files.bundlePath,
    plan: files.planPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.uploaded, []);
  assert.equal(calls.every(isReleaseInspect), true);
});

test('unexpected remote assets fail before immutable publication', () => {
  const first = asset('first.zip', '2');
  const unexpected = asset('unexpected.bin', '3');
  const files = fixture([first]);
  const calls: string[][] = [];
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      calls.push(args);
      if (isImmutableCapabilityRead(args)) return immutableCapabilityResponse();
      if (isReleaseInspect(args)) {
        return success(releaseResponse([unexpected], { draft: true, immutable: false }));
      }
      throw new Error(`Unexpected GitHub call: ${args.join(' ')}`);
    },
  };

  assert.throws(
    () => applyPublishPlan({
      ...mutationAdmission(),
      bundle: files.bundlePath,
      plan: files.planPath,
      'operation-deadline-at': deadlineAt,
    }, runtime),
    /unexpected asset outside the exact planned set/i,
  );
  assert.equal(calls.filter((args) => args.includes('PATCH')).length, 0);
  assert.equal(calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length, 0);
});

test('duplicate planned asset names fail before capability read or public mutation', () => {
  const first = asset('first.zip', '4');
  const files = fixture([first]);
  const plan = JSON.parse(fs.readFileSync(files.planPath, 'utf8'));
  plan.release_bundle_publish.receipt.details.upload_actions.push({
    action: 'upload',
    name: first.name,
    source_path: first.source_path,
    size_bytes: first.size_bytes,
    sha256: first.sha256,
  });
  fs.writeFileSync(files.planPath, `${JSON.stringify(plan)}\n`);
  let calls = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run() {
      calls += 1;
      return success();
    },
  };

  assert.throws(
    () => applyPublishPlan({
      ...mutationAdmission(),
      bundle: files.bundlePath,
      plan: files.planPath,
      'operation-deadline-at': deadlineAt,
    }, runtime),
    /duplicate or invalid asset names/i,
  );
  assert.equal(calls, 0);
});

test('supplemental immutable carrier receipt joins the exact draft asset set once', () => {
  const first = asset('desktop.zip', 'a');
  const durableReceipt = asset('opl-stable-operation-control.json', 'b');
  const files = fixture([first]);
  const additionalPath = path.join(files.root, 'additional-upload-actions.json');
  fs.writeFileSync(additionalPath, `${JSON.stringify({
    schema: 'opl_app_immutable_release_upload_actions.v1',
    upload_actions: [{ action: 'upload', ...durableReceipt }],
  })}\n`);
  const calls: string[][] = [];
  const remoteAssets: Asset[] = [];
  let exists = false;
  let published = false;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      calls.push(args);
      if (isImmutableCapabilityRead(args)) return immutableCapabilityResponse();
      if (isReleaseInspect(args)) {
        if (!exists) return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
        return success(releaseResponse(remoteAssets, { draft: !published, immutable: published }));
      }
      if (args.includes('POST')) {
        exists = true;
        return success();
      }
      if (args[0] === 'release' && args[1] === 'upload') {
        const uploaded = [first, durableReceipt].find((asset) => asset.source_path === args[3]);
        assert.ok(uploaded, `unexpected upload ${args[3]}`);
        remoteAssets.push(uploaded);
        return success();
      }
      if (args.includes('PATCH')) {
        assert.deepEqual(remoteAssets.map((asset) => asset.name).sort(), [first.name, durableReceipt.name].sort());
        published = true;
        return success();
      }
      throw new Error(`Unexpected GitHub call: ${args.join(' ')}`);
    },
  };

  const result = applyPublishPlan({
    ...mutationAdmission(),
    bundle: files.bundlePath,
    plan: files.planPath,
    'operation-deadline-at': deadlineAt,
    'additional-upload-actions': additionalPath,
  }, runtime);
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.uploaded, [first.name, durableReceipt.name]);
  const publishIndex = calls.findIndex((args) => args.includes('PATCH'));
  assert.equal(calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length, 2);
  assert.ok(publishIndex > calls.findIndex((args) => args[0] === 'release' && args[1] === 'upload'));
});

test('supplemental immutable carrier actions reject a duplicate main-plan asset before GitHub access', () => {
  const first = asset('desktop.zip', 'c');
  const files = fixture([first]);
  const additionalPath = path.join(files.root, 'duplicate-upload-actions.json');
  fs.writeFileSync(additionalPath, `${JSON.stringify({
    schema: 'opl_app_immutable_release_upload_actions.v1',
    upload_actions: [{ action: 'upload', ...first }],
  })}\n`);
  let calls = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run() {
      calls += 1;
      return success();
    },
  };

  assert.throws(
    () => applyPublishPlan({
      ...mutationAdmission(),
      bundle: files.bundlePath,
      plan: files.planPath,
      'operation-deadline-at': deadlineAt,
      'additional-upload-actions': additionalPath,
    }, runtime),
    /duplicate or invalid asset names/i,
  );
  assert.equal(calls, 0);
});

test('duplicate remote asset names fail before immutable publication', () => {
  const first = asset('first.zip', '5');
  const files = fixture([first]);
  const calls: string[][] = [];
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      calls.push(args);
      if (isImmutableCapabilityRead(args)) return immutableCapabilityResponse();
      if (isReleaseInspect(args)) {
        return success(releaseResponse([first, first], { draft: true, immutable: false }));
      }
      throw new Error(`Unexpected GitHub call: ${args.join(' ')}`);
    },
  };

  assert.throws(
    () => applyPublishPlan({
      ...mutationAdmission(),
      bundle: files.bundlePath,
      plan: files.planPath,
      'operation-deadline-at': deadlineAt,
    }, runtime),
    /duplicate asset name/i,
  );
  assert.equal(calls.filter((args) => args.includes('PATCH')).length, 0);
  assert.equal(calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length, 0);
});

test('an incomplete published immutable carrier is read-only and cannot receive late assets', () => {
  const first = asset('first.zip', '6');
  const files = fixture([first]);
  const calls: string[][] = [];
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      calls.push(args);
      if (isImmutableCapabilityRead(args)) return immutableCapabilityResponse();
      if (isReleaseInspect(args)) return success(releaseResponse([]));
      throw new Error(`Unexpected GitHub call: ${args.join(' ')}`);
    },
  };

  assert.throws(
    () => applyPublishPlan({
      ...mutationAdmission(),
      bundle: files.bundlePath,
      plan: files.planPath,
      'operation-deadline-at': deadlineAt,
    }, runtime),
    /asset set is incomplete/i,
  );
  assert.equal(calls.filter((args) => args.includes('PATCH')).length, 0);
  assert.equal(calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length, 0);
});

test('immutable=false after accepted draft publication returns typed terminal evidence', () => {
  const first = asset('first.zip', '7');
  const files = fixture([first]);
  const calls: string[][] = [];
  const remoteAssets: Asset[] = [];
  let exists = false;
  let published = false;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      calls.push(args);
      if (isImmutableCapabilityRead(args)) return immutableCapabilityResponse();
      if (isReleaseInspect(args)) {
        if (!exists) return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
        return success(releaseResponse(remoteAssets, {
          draft: !published,
          immutable: false,
        }));
      }
      if (args.includes('POST')) {
        exists = true;
        return success();
      }
      if (args[0] === 'release' && args[1] === 'upload') {
        remoteAssets.push(first);
        return success();
      }
      if (args.includes('PATCH')) {
        published = true;
        return success();
      }
      throw new Error(`Unexpected GitHub call: ${args.join(' ')}`);
    },
  };

  const result = applyPublishPlan({
    ...mutationAdmission(),
    bundle: files.bundlePath,
    plan: files.planPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);
  assert.equal(result.status, 'failed');
  assert.equal(result.failure.failure_taxonomy, 'published_mutable_policy_violation');
  assert.equal(result.failure.mutation, 'release_publish');
  assert.equal(result.retry_disposition, 'read_only_reconcile_only_no_retry');
  assert.deepEqual(result.uploaded, [first.name]);
  assert.equal(calls.filter((args) => args.includes('PATCH')).length, 1);
});

test('explicit single-use authority may move Latest to Dev Preview without Stable latest_eligible', () => {
  const files = previewFixture();
  let latestTag = expectedCurrentLatestTag;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/tags/${files.previewTag}`) {
        return success({
          id: 12345,
          name: `One Person Lab v${files.previewVersion}`,
          draft: false,
          prerelease: false,
          target_commitish: sourceCommit,
          body: notes,
          immutable: true,
          assets: [{
            name: `One-Person-Lab-${files.previewVersion}-mac-arm64.zip`,
            size: 100,
            digest: `sha256:${'8'.repeat(64)}`,
          }],
        });
      }
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/latest`) {
        return success({ tag_name: latestTag });
      }
      if (args.includes('PATCH')) {
        latestTag = files.previewTag;
        return success();
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };
  const result = activateLatest({
    ...mutationAdmission(),
    bundle: files.bundlePath,
    status: files.statusPath,
    'latest-admission': files.admissionPath,
    'operation-deadline-at': deadlineAt,
    'publication-channel': 'preview',
  }, runtime);
  assert.equal(result.status, 'complete');
  assert.equal(result.tag, files.previewTag);
  assert.equal(result.latest_compare_and_swap.patch_performed, true);
});

test('explicit single-use authority may move Latest to Nightly Preview without Stable latest_eligible', () => {
  const files = nightlyLatestFixture();
  let latestTag = expectedCurrentLatestTag;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/tags/${files.nightlyTag}`) {
        return success({
          id: 12345,
          name: `One Person Lab v${files.nightlyVersion}`,
          draft: false,
          prerelease: true,
          target_commitish: sourceCommit,
          body: notes,
          immutable: true,
          assets: [{
            name: `One-Person-Lab-${files.nightlyVersion}-mac-arm64.zip`,
            size: 100,
            digest: `sha256:${'7'.repeat(64)}`,
          }],
        });
      }
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/latest`) {
        return success({ tag_name: latestTag });
      }
      if (args.includes('PATCH')) {
        latestTag = files.nightlyTag;
        return success();
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };
  const result = activateLatest({
    ...mutationAdmission(),
    bundle: files.bundlePath,
    status: files.statusPath,
    'latest-admission': files.admissionPath,
    'operation-deadline-at': deadlineAt,
    'publication-channel': 'nightly',
  }, runtime);
  assert.equal(result.status, 'complete');
  assert.equal(result.tag, files.nightlyTag);
  assert.equal(result.latest_compare_and_swap.patch_performed, true);
});

test('Preview publication rejects a Stable Bundle and every Full track before any GitHub call', () => {
  const stableFiles = fixture([]);
  const previewFull = previewFixture();
  const plan = JSON.parse(fs.readFileSync(previewFull.planPath, 'utf8'));
  plan.release_bundle_publish.track = 'full';
  plan.release_bundle_publish.receipt.release_operation = 'append_full';
  plan.release_bundle_publish.receipt.operation_control = {
    operation_id: appendFullOperationId,
    operation_started_at: appendFullOperationStartedAt,
    operation_deadline_at: deadlineAt,
  };
  fs.writeFileSync(previewFull.planPath, `${JSON.stringify(plan)}\n`);
  let calls = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run() {
      calls += 1;
      return success();
    },
  };
  assert.throws(
    () => applyPublishPlan({
      ...mutationAdmission(),
      bundle: stableFiles.bundlePath,
      plan: stableFiles.planPath,
      'operation-deadline-at': deadlineAt,
      'publication-channel': 'preview',
    }, runtime),
    (error: any) => error.result?.failure?.failure_taxonomy === 'github_mutation_publication_bundle_mismatch',
  );
  assert.throws(
    () => applyPublishPlan({
      ...mutationAdmission('append_full', 'full'),
      bundle: previewFull.bundlePath,
      plan: previewFull.planPath,
      'operation-deadline-at': deadlineAt,
      'publication-channel': 'preview',
    }, runtime),
    (error: any) => error.result?.failure?.failure_taxonomy === 'github_mutation_non_stable_full_publication',
  );
  assert.equal(calls, 0);
});

test('Nightly publication rejects Stable Bundle and Full track before any GitHub call', () => {
  const stableFiles = fixture([]);
  const fullFiles = fixture([], 'append_full');
  const fullBundle = JSON.parse(fs.readFileSync(fullFiles.bundlePath, 'utf8'));
  fullBundle.release = {
    channel: 'nightly',
    version: '26.7.22-nightly',
    updater_version: '26.7.2290-nightly.0',
    tag: 'v26.7.22-nightly',
    prerelease: true,
  };
  fs.writeFileSync(fullFiles.bundlePath, `${JSON.stringify(fullBundle)}\n`);
  let calls = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run() {
      calls += 1;
      return success();
    },
  };
  assert.throws(
    () => applyPublishPlan({
      ...mutationAdmission(),
      bundle: stableFiles.bundlePath,
      plan: stableFiles.planPath,
      'operation-deadline-at': deadlineAt,
      'publication-channel': 'nightly',
    }, runtime),
    (error: any) => error.result?.failure?.failure_taxonomy === 'github_mutation_publication_bundle_mismatch',
  );
  assert.throws(
    () => applyPublishPlan({
      ...mutationAdmission('append_full', 'full'),
      bundle: fullFiles.bundlePath,
      plan: fullFiles.planPath,
      'operation-deadline-at': deadlineAt,
      'publication-channel': 'nightly',
    }, runtime),
    (error: any) => error.result?.failure?.failure_taxonomy === 'github_mutation_non_stable_full_publication',
  );
  assert.equal(calls, 0);
});

test('raw Latest activation rejects append_full before gh', () => {
  let calls = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run() {
      calls += 1;
      return success();
    },
  };
  assert.throws(
    () => activateLatest(mutationAdmission('append_full', 'full'), runtime),
    /rejects operation append_full for track full/,
  );
  assert.equal(calls, 0);
});

test('github-apply binds the caller track to the Framework publish plan before gh', () => {
  const files = fixture([]);
  const plan = JSON.parse(fs.readFileSync(files.planPath, 'utf8'));
  plan.release_bundle_publish.track = 'full';
  fs.writeFileSync(files.planPath, `${JSON.stringify(plan)}\n`);
  let calls = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run() {
      calls += 1;
      return success();
    },
  };
  assert.throws(
    () => applyPublishPlan({
      ...mutationAdmission(),
      bundle: files.bundlePath,
      plan: files.planPath,
      'operation-deadline-at': deadlineAt,
    }, runtime),
    /Framework publish plan track full does not match admitted standard/,
  );
  assert.equal(calls, 0);
});

test('raw mutation CLI persists typed failure evidence at the deterministic default path before exiting', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-github-admission-failure-'));
  try {
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(process.cwd(), 'scripts/framework-release-adapter.ts'),
      'github-apply',
      '--operation', 'standard',
      '--track', 'standard',
      '--run-attempt', '2',
    ], { encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: root } });
    assert.equal(result.status, 1);
    const evidence = path.join(root, 'opl-release-mutation-failure/github-apply');
    const output = path.join(evidence, 'failure.json');
    const failure = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(failure.status, 'failed');
    assert.equal(failure.failure.schema, 'opl_release_mutation_failure_receipt.v1');
    assert.equal(failure.failure.failure_taxonomy, 'github_mutation_run_attempt_rejected');
    assert.match(failure.failure.input_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(failure.failure.stdout, '');
    assert.match(failure.failure.stderr, /run-attempt 1/);
    assert.equal(fs.readFileSync(path.join(evidence, 'input-digest.txt'), 'utf8').trim(), failure.failure.input_digest);
    assert.equal(fs.readFileSync(path.join(evidence, 'stdout.txt'), 'utf8'), '');
    assert.match(fs.readFileSync(path.join(evidence, 'stderr.txt'), 'utf8'), /run-attempt 1/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
