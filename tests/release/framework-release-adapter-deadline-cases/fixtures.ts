import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  activateLatest,
  applyPublishPlan,
  buildExecutorReceipt,
  fullAddonIdentity,
  inspectRelease,
  type GitHubAdapterRuntime,
  type GitHubCommandOptions,
  type GitHubCommandResult,
} from "../../../scripts/framework-release-adapter.ts";
import {
  bindStableOperationAuthority,
  canonicalJson,
  consumeStableOperationControl,
  createStableOperationAuthority,
  stableOperationIdForFrozenCohort,
} from "../../../scripts/stable-operation-control.ts";
import {
  createStableOperationPublicationRecord,
} from "../../../scripts/stable-operation-publication-record.ts";

export {
  assert,
  crypto,
  fs,
  os,
  path,
  spawnSync,
  activateLatest,
  applyPublishPlan,
  buildExecutorReceipt,
  fullAddonIdentity,
  inspectRelease,
  bindStableOperationAuthority,
  canonicalJson,
  consumeStableOperationControl,
  createStableOperationAuthority,
  stableOperationIdForFrozenCohort,
  createStableOperationPublicationRecord,
};
export type {
  GitHubAdapterRuntime,
  GitHubCommandOptions,
  GitHubCommandResult,
};



export type Asset = { name: string; size_bytes: number; sha256: string; source_path: string };



export const repo = 'example/one-person-lab-app';


export const canonicalRepo = 'gaofeng21cn/one-person-lab-app';


export const version = '26.7.22';


export const updaterVersion = '26.7.2200';


export const tag = `v${version}`;


export const deadlineAt = '2026-07-21T01:00:00.000Z';


export const deadlineMs = Date.parse(deadlineAt);


export const notes = 'Prepared release notes\n';


export const projectedLegacyNotes = [
  'Prepared release notes',
  '',
  'The Full DMG is appended later to this same Stable release for fresh-machine installation with bundled runtime, Office, and document-intake payloads.',
  '',
  '<!-- OPL_RELEASE_NOTES:en-US',
  `One Person Lab v${version}`,
  'Prepared release notes',
  '-->',
  '',
].join('\n');


export const legacyNotes = [
  `One Person Lab v${version}`,
  '',
  'Prepared release notes',
  '',
  'Use a Full release when you need bundled runtime, Office, and document-intake payloads on a fresh machine.',
  '',
  '<!-- OPL_RELEASE_NOTES:en-US',
  `One Person Lab v${version}`,
  'Prepared release notes',
  '-->',
  '',
].join('\n');


export const sourceCommit = 'a'.repeat(40);


export const executorCommit = 'e'.repeat(40);


export const shellCommit = 'c'.repeat(40);


export const frameworkCommit = 'd'.repeat(40);


export const bundleDigest = `sha256:${'b'.repeat(64)}`;


export const latestZip = asset(`One-Person-Lab-${version}-mac-arm64.zip`, '9');


export const latestDmg = asset(`One-Person-Lab-${version}-mac-arm64.dmg`, '8');


export const componentManifestAsset = asset('opl-app-component-manifest.json', 'f');


export const expectedCurrentLatestTag = 'v26.7.20';


export const standardOperationId = 'operation-standard-1';


export const appendFullOperationId = 'operation-append-full-1';


export const stableAuthorityRunId = '30325431854';


export const standardOperationStartedAt = '2026-07-21T00:00:00.000Z';


export const appendFullOperationStartedAt = '2026-07-21T00:05:00.000Z';


export const workflowAttemptId = 'gha-workflow-attempt-1';


export const stableObjectiveFingerprint = 'stable-immutable-capability-evidence-test';


export const stableCriticalBlobPaths = [
  '.github/workflows/release-stable.yml',
  '.github/workflows/_release-bundle.yml',
  '.github/workflows/_release-standard-publish.yml',
  'contracts/app-release-channel.json',
  'scripts/framework-release-adapter.ts',
  'scripts/release-dispatch-guard.ts',
  'scripts/stable-operation-control.ts',
  'scripts/stable-operation-publication-record.ts',
  'scripts/stable-release-admission-manifest.ts',
  'scripts/validate-release-source-gate.ts',
];


export const stableCriticalBlobs = Object.fromEntries(
  stableCriticalBlobPaths.map((file, index) => [
    file,
    `sha256:${'0123456789abcdef'[(index + 4) % 16]!.repeat(64)}`,
  ]),
);



export function sha256Evidence(bytes: Buffer | string): string {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}



export function durablePublicationRecord(root: string, payloadAssets: Asset[]) {
  const generatedAt = '2026-07-21T00:10:00.000Z';
  const sourceGate = {
    schema: 'opl_app_release_source_gate.v1',
    generated_at: generatedAt,
    status: 'passed',
    operation_fingerprint: stableObjectiveFingerprint,
    typed_blocker: null,
    admission: {
      status: 'passed',
      immutable_cohort: {
        app_sha: sourceCommit,
        shell_sha: shellCommit,
        framework_sha: frameworkCommit,
      },
    },
    checks: [{ id: 'app_frozen_commit_reachable', status: 'passed' }],
  };
  const operationId = stableOperationIdForFrozenCohort({
    objectiveFingerprint: stableObjectiveFingerprint,
    appSha: sourceCommit,
    shellSha: shellCommit,
    frameworkSha: frameworkCommit,
    criticalBlobs: stableCriticalBlobs,
  });
  const preNonceGuard = {
    schema: 'opl_release_dispatch_guard.v1',
    phase: 'pre_nonce',
    status: 'passed',
    dispatch_allowed: true,
    operation_id: operationId,
    owner_run_match_count: 0,
    nonce_consumed: false,
    mutation_invocation_count: 0,
    source_gate: {
      schema: 'opl_app_release_source_gate.v1',
      status: 'passed',
      exact_cohort_bound: true,
    },
  };
  const sourceGateBytes = Buffer.from(canonicalJson(sourceGate), 'utf8');
  const preNonceGuardBytes = Buffer.from(canonicalJson(preNonceGuard), 'utf8');
  const authority = createStableOperationAuthority({
    authorityId: 'authority-stable-capability-evidence-test',
    operationId,
    issuer: 'gaofeng21cn',
    issuedAt: '2026-07-21T00:15:00.000Z',
    expiresAt: '2026-07-21T00:55:00.000Z',
    objectiveFingerprint: stableObjectiveFingerprint,
    nonce: 'a'.repeat(32),
    appSha: sourceCommit,
    shellSha: shellCommit,
    frameworkSha: frameworkCommit,
    criticalBlobs: stableCriticalBlobs,
    sourceGate,
    preNonceGuard,
  });
  const runAuthorityReconcile = {
    schema: 'opl_release_dispatch_guard.v1',
    phase: 'run_bound',
    status: 'passed',
    dispatch_allowed: true,
    operation_id: operationId,
    authority_id: authority.authority_id,
    run_id: stableAuthorityRunId,
    owner_run_match_count: 1,
    nonce_consumed: false,
    mutation_invocation_count: 0,
  };
  const runAuthorityReconcileBytes = Buffer.from(canonicalJson(runAuthorityReconcile), 'utf8');
  const control = bindStableOperationAuthority({
    authority,
    authorityDigest: authority.authority_digest,
    actor: authority.issuer,
    runId: stableAuthorityRunId,
    runAttempt: 1,
    sourceGateDigest: sha256Evidence(sourceGateBytes),
    preNonceGuardDigest: sha256Evidence(preNonceGuardBytes),
    runAuthorityReconcileDigest: sha256Evidence(runAuthorityReconcileBytes),
    now: '2026-07-21T00:20:00.000Z',
  });
  const consumption = consumeStableOperationControl({
    control,
    operationId,
    runId: control.run_id,
    runAttempt: 1,
    nonce: 'a'.repeat(32),
  });
  const record = createStableOperationPublicationRecord({
    authority,
    control,
    consumption,
    sourceGateBytes,
    preNonceGuardBytes,
    runAuthorityReconcileBytes,
    repository: canonicalRepo,
    tag,
    plannedAssets: {
      assets: payloadAssets.map((item) => ({
        name: item.name,
        digest: item.sha256,
        size_bytes: item.size_bytes,
      })),
    },
  });
  const recordPath = path.join(root, 'stable-operation-publication-record.json');
  const recordBytes = Buffer.from(canonicalJson(record), 'utf8');
  fs.writeFileSync(recordPath, recordBytes);
  return {
    operationId,
    recordPath,
    recordAction: {
      action: 'upload',
      name: 'stable-operation-publication-record.json',
      source_path: recordPath,
      size_bytes: recordBytes.length,
      sha256: sha256Evidence(recordBytes),
    },
  };
}



export function mutationAdmission(
  operation: 'standard' | 'resume_standard' | 'append_full' = 'standard',
  track: 'standard' | 'full' = 'standard',
): Record<string, string> {
  return {
    operation,
    track,
    'publication-channel': 'stable',
    'mutation-mode': 'execute',
    ...(track === 'full' ? { 'executor-app-sha': executorCommit } : {}),
    'operation-id': operation === 'append_full' ? appendFullOperationId : standardOperationId,
    'operation-started-at': operation === 'append_full'
      ? appendFullOperationStartedAt
      : standardOperationStartedAt,
    'attempt-id': workflowAttemptId,
    'run-attempt': '1',
  };
}



export function expectedMutationAttemptId(
  mutation: 'tag_reserve' | 'release_create' | 'asset_upload' | 'release_publish' | 'latest_patch',
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



export function sealAdmission(receipt: Record<string, any>): void {
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



export function previewFixture() {
  const files = fixture([]);
  const previewVersion = '26.7.22-preview.r1';
  const previewUpdaterVersion = '26.7.2201';
  const previewTag = `v${previewVersion}`;
  const previewZip = asset(`One-Person-Lab-${previewVersion}-mac-arm64.zip`, '8');
  const previewDmg = asset(`One-Person-Lab-${previewVersion}-mac-arm64.dmg`, '6');
  const previewDeb = asset(`One-Person-Lab-${previewVersion}-linux-x64.deb`, '5');
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
  status.release_bundle_status.tracks.standard.assets = [previewZip, previewDmg, previewDeb, componentManifestAsset];
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
    previewDeb.name,
    'latest-mac.yml',
    'latest-arm64-mac.yml',
    'opl-app-component-manifest.json',
    'opl-install.sh',
  ];
  admission.homebrew = null;
  admission.latest_compare_and_swap.candidate.tag = previewTag;
  sealAdmission(admission);
  fs.writeFileSync(files.admissionPath, `${JSON.stringify(admission)}\n`);
  return { ...files, previewVersion, previewUpdaterVersion, previewTag };
}



export function nightlyLatestFixture() {
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
    'latest-mac.yml',
    'latest-arm64-mac.yml',
    'opl-app-component-manifest.json',
    'opl-install.sh',
  ];
  admission.homebrew = null;
  admission.latest_compare_and_swap.candidate.tag = nightlyTag;
  sealAdmission(admission);
  fs.writeFileSync(files.admissionPath, `${JSON.stringify(admission)}\n`);
  return { ...files, nightlyVersion, nightlyUpdaterVersion, nightlyTag };
}



export function success(value: unknown = ''): GitHubCommandResult {
  return {
    status: 0,
    stdout: value === '' ? '' : JSON.stringify(value),
    stderr: '',
  };
}



export function releaseResponse(
  assets: Asset[],
  options: { draft?: boolean; immutable?: boolean; targetCommitish?: string; body?: string } = {},
): Record<string, unknown> {
  return {
    id: 12345,
    tag_name: tag,
    name: `One Person Lab v${version}`,
    draft: options.draft ?? false,
    prerelease: false,
    target_commitish: options.targetCommitish ?? sourceCommit,
    body: options.body ?? notes,
    immutable: options.immutable ?? true,
    assets: assets.map((asset) => ({
      name: asset.name,
      size: asset.size_bytes,
      digest: asset.sha256,
    })),
  };
}



export function fixture(
  actions: Asset[],
  releaseOperation: 'standard' | 'append_full' = 'standard',
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-github-deadline-'));
  const standardAttestation = releaseOperation === 'append_full'
    ? writeStandardAttestation(root)
    : null;
  const uploadActions = releaseOperation === 'append_full'
    ? writeFullUploadActions(root, standardAttestation!.asset)
    : actions;
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
          upload_actions: uploadActions.map((asset) => ({
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
        'latest-mac.yml',
        'latest-arm64-mac.yml',
        'opl-app-component-manifest.json',
        'opl-install.sh',
        'opl-release-attestation.json',
      ],
      self_hosted_ancestor_count: 0,
      vm_ancestor_count: 0,
      tart_ancestor_count: 0,
    },
    homebrew: null,
    latest_compare_and_swap: {
      expected_current: { tag: expectedCurrentLatestTag },
      candidate: { tag },
    },
  };
  sealAdmission(admission);
  fs.writeFileSync(admissionPath, `${JSON.stringify(admission)}\n`);
  return {
    root,
    bundlePath,
    planPath,
    statusPath,
    admissionPath,
    uploadActions,
    standardAttestationPath: standardAttestation?.path ?? '',
    standardAssets: standardAttestation?.sealedAssets ?? [],
  };
}



export function asset(name: string, byte: string): Asset {
  return {
    name,
    size_bytes: 100,
    sha256: `sha256:${byte.repeat(64)}`,
    source_path: `/immutable/${name}`,
  };
}



export function writeStandardAttestation(root: string) {
  const payloadAssets = [latestDmg, latestZip, componentManifestAsset];
  const attestationPath = path.join(root, 'opl-release-attestation.json');
  const bytes = Buffer.from(`${JSON.stringify({
    schema: 'opl_app_release_attestation.v1',
    status: 'passed',
    release: { repository: repo, tag, version, bundle_digest: bundleDigest },
    publication_record: {
      publication_intent: {
        payload_assets: payloadAssets.map((item) => ({
          name: item.name,
          digest: item.sha256,
          size_bytes: item.size_bytes,
        })),
      },
    },
    protection: {
      github_native_immutable: false,
      retroactive_lock_claimed: false,
      standard_asset_policy: 'sealed_name_size_digest_set_no_overwrite_or_delete',
    },
  })}\n`);
  fs.writeFileSync(attestationPath, bytes);
  const asset: Asset = {
    name: 'opl-release-attestation.json',
    size_bytes: bytes.length,
    sha256: sha256Evidence(bytes),
    source_path: attestationPath,
  };
  return { path: attestationPath, asset, sealedAssets: [...payloadAssets, asset] };
}

export function writeFullUploadActions(root: string, standardAttestation: Asset): Asset[] {
  const dmgName = `One-Person-Lab-Full-${version}-mac-arm64.dmg`;
  const dmgPath = path.join(root, dmgName);
  const dmgBytes = Buffer.from('exact same-tag Full DMG bytes\n');
  fs.writeFileSync(dmgPath, dmgBytes);
  const dmgAction: Asset = {
    name: dmgName,
    size_bytes: dmgBytes.length,
    sha256: sha256Evidence(dmgBytes),
    source_path: dmgPath,
  };
  const manifestPath = path.join(root, 'opl-release-manifest.json');
  const manifestBytes = Buffer.from(`${JSON.stringify({
    schema: 'opl_public_release_manifest.v1',
    package_kind: 'opl_full_first_install_macos_arm64',
    owner_authority: 'one-person-lab-app',
    version,
    release_version: version,
    primary_install_asset: dmgName,
    carrier_context: {
      publication_model: 'same_tag_mutable_standard_addon',
      target_standard_release: {
        repository: repo,
        release_id: 12345,
        tag,
        target_commitish: sourceCommit,
        immutable: false,
        full_asset_append_allowed: true,
        standard_asset_overwrite_or_delete_allowed: false,
      },
      standard_attestation: {
        name: standardAttestation.name,
        sha256: standardAttestation.sha256,
        size_bytes: standardAttestation.size_bytes,
      },
      latest_modified: false,
      updater_metadata_modified: false,
      release_notes_modified: false,
      release_executor: {
        app_sha: executorCommit,
        notarizer_path: 'scripts/notarize-macos-dmg.ts',
      },
      full_content_sources: {
        role: 'observational_build_provenance_only',
        may_gate_install_or_runtime: false,
        app_sha: sourceCommit,
        shell_sha: shellCommit,
        framework_sha: frameworkCommit,
      },
      differences: {
        executor_app_differs_from_full_content_app: true,
        full_content_app_differs_from_target_standard: false,
      },
    },
    assets: [{
      name: dmgName,
      role: 'full_first_install_carrier',
      size_bytes: dmgBytes.length,
      sha256: dmgAction.sha256,
    }],
  })}\n`);
  fs.writeFileSync(manifestPath, manifestBytes);
  return [
    dmgAction,
    {
      name: 'opl-release-manifest.json',
      size_bytes: manifestBytes.length,
      sha256: sha256Evidence(manifestBytes),
      source_path: manifestPath,
    },
  ];
}



export function isReleaseInspect(args: string[]): boolean {
  return args[0] === 'api' && (
    args[1] === `repos/${repo}/releases/tags/${tag}`
    || args[1] === `repos/${repo}/releases/12345`
  );
}



export function isReleaseView(args: string[]): boolean {
  return isReleaseViewFor(args, tag, repo);
}



export function isReleaseViewFor(args: string[], releaseTag: string, releaseRepo: string): boolean {
  return (
    args[0] === 'release'
    && args[1] === 'view'
    && args[2] === releaseTag
    && args[3] === '--repo'
    && args[4] === releaseRepo
    && args[5] === '--json'
    && args[6] === 'databaseId,tagName'
  );
}



export function isTagRefReadFor(args: string[], releaseTag: string, releaseRepo: string): boolean {
  return args[0] === 'api' && args[1] === `repos/${releaseRepo}/git/ref/tags/${releaseTag}`;
}



export function isTagRefCreateFor(args: string[], releaseRepo: string): boolean {
  return (
    args[0] === 'api'
    && args[1] === '--method'
    && args[2] === 'POST'
    && args[3] === `repos/${releaseRepo}/git/refs`
    && args[4] === '--input'
    && args[5] === '-'
  );
}



export function tagRefResponse(releaseTag: string, targetCommitish = sourceCommit): GitHubCommandResult {
  return success({
    ref: `refs/tags/${releaseTag}`,
    object: {
      type: 'commit',
      sha: targetCommitish,
    },
  });
}



export function fullPublicationRuntime(
  files: ReturnType<typeof fixture>,
  options: { targetDriftAfterFirstUpload?: string; additionalAssets?: Asset[] } = {},
) {
  const bundle = JSON.parse(fs.readFileSync(files.bundlePath, 'utf8'));
  const addon = fullAddonIdentity(bundle, files.uploadActions, files.standardAttestationPath);
  const calls: string[][] = [];
  const mutationInputs: string[] = [];
  const remoteAssets: Asset[] = [...files.standardAssets, ...(options.additionalAssets ?? [])];
  const response = () => ({
    id: 12345,
    tag_name: addon.tag,
    name: `One Person Lab v${version}`,
    draft: false,
    prerelease: false,
    target_commitish: remoteAssets.length > files.standardAssets.length && options.targetDriftAfterFirstUpload
      ? options.targetDriftAfterFirstUpload
      : sourceCommit,
    body: notes,
    immutable: false,
    assets: remoteAssets.map((asset) => ({
      name: asset.name,
      size: asset.size_bytes,
      digest: asset.sha256,
    })),
  });
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 90_000,
    run(_command, args) {
      calls.push(args);
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/tags/${addon.tag}`) return success(response());
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/12345`) {
        return success(response());
      }
      if (args[0] === 'release' && args[1] === 'upload') {
        const uploaded = files.uploadActions.find((asset) => asset.source_path === args[3]);
        assert.ok(uploaded, `unexpected upload ${args[3]}`);
        remoteAssets.push(uploaded);
        return success();
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };
  return { addon, calls, mutationInputs, remoteAssets, runtime };
}
