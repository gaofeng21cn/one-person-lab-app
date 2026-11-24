import { mechanicalNotesMarker } from './release-notes-ai-writer/mechanical.ts';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readActiveShellBuildProfile } from './active-shell-build-profile.ts';
import {
  validateArtifactQualificationReceipt,
  type ArtifactQualificationReceiptV1,
} from './artifact-qualification-receipt.ts';
import { assertUpdaterVersionMatchesDisplay } from './release-version.ts';
import { validateWebuiSourceAuthority } from './webui-source-authority.ts';
import {
  appStandardIdentityMode,
  digestPattern,
  digestRef,
  exactJson,
  fileDescriptor,
  frozenBuildInputIds,
  gitArchiveDescriptor,
  gitFileBytes,
  gitSha,
  packageCompatibility,
  readJson,
  releaseAssetNamePattern,
  requiredAssetNames,
  sha256File,
  standardInstallerSidecarAssetNames,
  verifyCodexTarball,
  type AdapterOptionValues,
  type JsonRecord,
  type StableReleaseOperation,
  type Track,
} from './framework-release-adapter-bundle.ts';

const aiNotesMarker = '<!-- OPL_RELEASE_NOTES_GENERATOR:online-ai -->';

export function requireOption(values: AdapterOptionValues, key: string): string {
  const value = values[key];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing --${key}.`);
  return value.trim();
}
export function requireBooleanOption(values: AdapterOptionValues, key: string): boolean {
  const value = requireOption(values, key);
  if (value !== 'true' && value !== 'false') throw new Error(`--${key} must be true or false.`);
  return value === 'true';
}

export function parseCommon(argv: string[]) {
  return parseArgs({
    args: argv,
    options: {
      channel: { type: 'string' },
      version: { type: 'string' },
      'updater-version': { type: 'string' },
      'app-root': { type: 'string' },
      'shell-root': { type: 'string' },
      'framework-root': { type: 'string' },
      notes: { type: 'string' },
      'notes-evidence': { type: 'string' },
      'include-full-package': { type: 'string' },
      'package-compatibility-abi': { type: 'string' },
      'package-compatibility-version-range': { type: 'string' },
      'source-cutoff-observed-at': { type: 'string' },
      'base-image-index': { type: 'string' },
      architecture: { type: 'string' },
      'frozen-codex-tarball': { type: 'string' },
      'resolved-dependency-manifest': { type: 'string' },
      'standard-identity': { type: 'string' },
      'source-authority': { type: 'string' },
      output: { type: 'string' },
      operation: { type: 'string' },
      'release-operation': { type: 'string' },
      'operation-id': { type: 'string' },
      executor: { type: 'string' },
      'attempt-id': { type: 'string' },
      'remote-target': { type: 'string' },
      'prior-attempt-id': { type: 'string' },
      'publication-scope': { type: 'string' },
      bundle: { type: 'string' },
      track: { type: 'string' },
      outcome: { type: 'string' },
      'assets-dir': { type: 'string' },
      inspection: { type: 'string' },
      'legacy-qualification': { type: 'string' },
      'hosted-core-qualification': { type: 'string' },
      status: { type: 'string' },
      repo: { type: 'string' },
      tag: { type: 'string' },
      name: { type: 'string' },
      plan: { type: 'string' },
      prerelease: { type: 'boolean' },
      'publication-channel': { type: 'string' },
      'mutation-mode': { type: 'string' },
      'executor-app-sha': { type: 'string' },
      'operation-started-at': { type: 'string' },
      'operation-deadline-at': { type: 'string' },
      'additional-upload-actions': { type: 'string' },
      'publication-record': { type: 'string' },
      'standard-attestation': { type: 'string' },
      'authority-run-id': { type: 'string' },
      'latest-admission': { type: 'string' },
      'pointer-admission': { type: 'string' },
      'component-manifest': { type: 'string' },
      'pointer-authority': { type: 'string' },
      'release-inspection': { type: 'string' },
      'expected-current-latest-tag': { type: 'string' },
      'run-attempt': { type: 'string' },
      'allow-same-tag-full-assets': { type: 'string' },
    },
    allowPositionals: true,
    strict: true,
  });
}

function webuiArchitecture(values: AdapterOptionValues): 'amd64' | 'arm64' {
  const architecture = requireOption(values, 'architecture');
  if (architecture !== 'amd64' && architecture !== 'arm64') {
    throw new Error('--architecture must be amd64 or arm64.');
  }
  return architecture;
}

function frozenBaseImageDescriptor(indexPath: string, architecture: 'amd64' | 'arm64'): JsonRecord {
  const index = readJson(path.resolve(indexPath));
  const manifests = Array.isArray(index.manifests) ? index.manifests : [];
  const matchingDescriptors = manifests.filter((descriptor: JsonRecord) => (
    descriptor?.platform?.os === 'linux'
    && descriptor?.platform?.architecture === architecture
  ));
  if (matchingDescriptors.length !== 1) {
    throw new Error(`Frozen node base index must contain exactly one linux/${architecture} descriptor.`);
  }
  const descriptor = matchingDescriptors[0];
  if (!digestPattern.test(String(descriptor.digest ?? ''))
    || !Number.isSafeInteger(descriptor.size)
    || Number(descriptor.size) <= 0) {
    throw new Error(`Frozen node base linux/${architecture} descriptor has no exact digest and positive manifest size.`);
  }
  return {
    id: 'base_image',
    ref: `docker.io/library/node@${descriptor.digest}`,
    digest: descriptor.digest,
    size_bytes: Number(descriptor.size),
  };
}

export function pinnedNodeBaseImage(dockerfile: string): string {
  const declarations = dockerfile.match(/^ARG NODE_IMAGE=.*$/gm) ?? [];
  const match = declarations.length === 1
    ? /^ARG NODE_IMAGE=(node:[A-Za-z0-9_.-]+@sha256:[0-9a-f]{64})$/.exec(declarations[0]!)
    : null;
  if (!match) throw new Error('Exact Studio Dockerfile must bind one digest-pinned Node base.');
  return `docker.io/library/${match[1]}`;
}

function frozenBuildInputs(input: {
  values: AdapterOptionValues;
  appRoot: string;
  appRef: string;
  shellRoot: string;
  shellRef: string;
  frameworkRoot: string;
  frameworkRef: string;
  architecture: 'amd64' | 'arm64';
}): JsonRecord[] {
  const dockerfileRef = 'Dockerfile';
  const dockerfileBytes = gitFileBytes(input.shellRoot, input.shellRef, dockerfileRef, 'Shell Dockerfile');
  const dockerfile = dockerfileBytes.toString('utf8');
  pinnedNodeBaseImage(dockerfile);
  const intake = readJson(path.resolve(requireOption(input.values, 'resolved-dependency-manifest')));
  const codexVersion = String(intake.runtime_payloads?.codex_cli?.version ?? '');
  if (intake.runtime_payloads?.codex_cli?.package !== '@openai/codex'
    || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(codexVersion)) {
    throw new Error('App runtime input contract must bind an exact Codex version.');
  }
  const codexBytes = verifyCodexTarball(
    path.resolve(requireOption(input.values, 'frozen-codex-tarball')),
    codexVersion,
  );
  const qualificationHarnessRef = 'scripts/validate-webui-runtime-image.ts';
  const qualificationHarnessBytes = gitFileBytes(
    input.appRoot,
    input.appRef,
    qualificationHarnessRef,
    'WebUI qualification harness',
  );
  const descriptors = [
    gitArchiveDescriptor(input.appRoot, input.appRef, 'app_source'),
    frozenBaseImageDescriptor(requireOption(input.values, 'base-image-index'), input.architecture),
    fileDescriptor('codex_cli', `@openai/codex@${codexVersion}`, codexBytes),
    fileDescriptor('dockerfile', 'shells/studio/Dockerfile', dockerfileBytes),
    gitArchiveDescriptor(input.frameworkRoot, input.frameworkRef, 'framework_seed'),
    fileDescriptor('qualification_harness', qualificationHarnessRef, qualificationHarnessBytes),
    gitArchiveDescriptor(input.shellRoot, input.shellRef, 'shell_webui_source'),
  ];
  const ids = descriptors.map((descriptor) => descriptor.id);
  if (ids.some((id, index) => id !== frozenBuildInputIds[index]) || new Set(ids).size !== ids.length) {
    throw new Error('Frozen WebUI build inputs are not the canonical exact-seven ordered set.');
  }
  for (const descriptor of descriptors) {
    if (typeof descriptor.ref !== 'string' || descriptor.ref.length === 0
      || !digestPattern.test(String(descriptor.digest ?? ''))
      || !Number.isSafeInteger(descriptor.size_bytes)
      || Number(descriptor.size_bytes) <= 0) {
      throw new Error(`Frozen WebUI build input ${descriptor.id} has no exact ref/digest/size identity.`);
    }
  }
  return descriptors;
}

export function buildFreezeRequest(values: AdapterOptionValues): JsonRecord {
  const channel = requireOption(values, 'channel');
  if (channel !== 'stable' && channel !== 'nightly' && channel !== 'preview') {
    throw new Error('--channel must be stable, nightly, or preview.');
  }
  const publicationChannel = values['publication-channel'] ?? channel;
  if (publicationChannel !== channel) {
    throw new Error('Publication channel must match the Framework Bundle channel.');
  }
  const version = requireOption(values, 'version');
  const updaterVersion = requireOption(values, 'updater-version');
  assertUpdaterVersionMatchesDisplay(channel, version, updaterVersion);
  const appRoot = path.resolve(requireOption(values, 'app-root'));
  const shellRoot = path.resolve(requireOption(values, 'shell-root'));
  const frameworkRoot = path.resolve(requireOption(values, 'framework-root'));
  const notesPath = path.resolve(requireOption(values, 'notes'));
  const evidencePath = path.resolve(requireOption(values, 'notes-evidence'));
  const includeFullPackage = requireBooleanOption(values, 'include-full-package');
  if (channel !== 'stable' && includeFullPackage) {
    throw new Error('Only Stable publication may include Full Package inputs.');
  }
  if (
    requireOption(values, 'package-compatibility-abi') !== packageCompatibility.abi
    || requireOption(values, 'package-compatibility-version-range') !== packageCompatibility.version_range
  ) {
    throw new Error('App Standard Package compatibility must use the supported typed ABI and range.');
  }
  const preparedNotes = fs.readFileSync(notesPath, 'utf8');
  if (!preparedNotes.includes(aiNotesMarker) && !preparedNotes.includes(mechanicalNotesMarker)) {
    throw new Error('Prepared release notes are not bound to a supported writer.');
  }
  const notesEvidence = readJson(evidencePath);
  if (notesEvidence.schema !== 'opl_app_release_notes_evidence.v1') {
    throw new Error('Prepared release notes evidence has an unsupported schema.');
  }
  const notesIdentityKeys = ['channel', 'version', 'current_tag'] as const;
  const presentNotesIdentityKeys = notesIdentityKeys.filter((key) => notesEvidence[key] !== undefined);
  if (presentNotesIdentityKeys.length === 0) {
    if (channel !== 'stable') {
      throw new Error('Non-Stable prepared notes require the complete exact publication identity.');
    }
  } else if (
    presentNotesIdentityKeys.length !== notesIdentityKeys.length
    || notesEvidence.channel !== channel
    || notesEvidence.version !== version
    || notesEvidence.current_tag !== `v${version}`
  ) {
    throw new Error('Prepared release notes evidence does not match the complete exact publication identity.');
  }
  if (notesEvidence.payload?.include_full_package !== false) {
    throw new Error(
      'App Standard prepared notes must not bind a future Full Package payload.',
    );
  }
  const appRef = gitSha(appRoot);
  const shellRef = gitSha(shellRoot);
  const frameworkRef = gitSha(frameworkRoot);
  if (
    notesEvidence.payload?.full_payload_authority_sha256 !== undefined
    && notesEvidence.payload?.full_payload_authority_sha256 !== null
  ) {
    throw new Error('App Standard prepared notes cannot bind a Full payload authority digest.');
  }
  return {
    surface_kind: 'opl_release_bundle_freeze_request.v1',
    schema_ref: 'contracts/opl-framework/release-bundle-freeze-request.schema.json',
    release: {
      channel,
      version,
      display_version: version,
      updater_version: updaterVersion,
      tag: `v${version}`,
      prerelease: channel === 'nightly',
    },
    sources: {
      app: { repo: 'gaofeng21cn/one-person-lab-app', source_commit: appRef },
      shell: { repo: readActiveShellBuildProfile(appRoot).repository, source_commit: shellRef },
      framework: { repo: 'gaofeng21cn/one-person-lab', source_commit: frameworkRef },
    },
    identity_mode: appStandardIdentityMode,
    package_compatibility: packageCompatibility,
    prepared_notes: {
      source: preparedNotes.includes(mechanicalNotesMarker) ? 'prepared_mechanical' : 'prepared_ai',
      format: 'markdown',
      markdown: preparedNotes,
      evidence: notesEvidence,
    },
    tracks: {
      standard: {
        required_asset_names: requiredAssetNames(version, 'standard', channel),
        required_for_latest: true,
        additive_only: false,
        updater_metadata_allowed: true,
      },
      full: {
        required_asset_names: requiredAssetNames(version, 'full'),
        required_for_latest: false,
        additive_only: true,
        updater_metadata_allowed: false,
      },
    },
  };
}

export function buildWebuiBuildInput(values: AdapterOptionValues): JsonRecord {
  if (values['standard-identity'] !== undefined || values.bundle !== undefined) {
    throw new Error('Independent WebUI source authority cannot be combined with Desktop release authority.');
  }
  return buildWebuiBuildInputFromSourceAuthority(values);
}

export function buildWebuiBuildInputFromSourceAuthority(values: AdapterOptionValues): JsonRecord {
  const authority = validateWebuiSourceAuthority(
    readJson(path.resolve(requireOption(values, 'source-authority'))),
  );
  const appRoot = path.resolve(requireOption(values, 'app-root'));
  const shellRoot = path.resolve(requireOption(values, 'shell-root'));
  const frameworkRoot = path.resolve(requireOption(values, 'framework-root'));
  const cohort = {
    app_sha: authority.sources.app.source_commit,
    shell_sha: authority.sources.shell.source_commit,
    framework_sha: authority.sources.framework.source_commit,
  };
  if (
    gitSha(appRoot) !== cohort.app_sha
    || gitSha(shellRoot) !== cohort.shell_sha
    || gitSha(frameworkRoot) !== cohort.framework_sha
  ) {
    throw new Error('Independent WebUI source checkouts do not match the source authority.');
  }
  const observedAt = requireOption(values, 'source-cutoff-observed-at');
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(observedAt)
    || Number.isNaN(Date.parse(observedAt))
  ) {
    throw new Error('WebUI source cutoff observed_at must be a canonical UTC timestamp with milliseconds.');
  }
  const sourceAuthorityDigest = authority.source_authority_digest;
  const releaseBundleDigest = authority.release.bundle_digest ?? sourceAuthorityDigest;
  const releaseCohortRef = authority.release.cohort_ref ?? sourceAuthorityDigest;
  const architecture = webuiArchitecture(values);
  return {
    schema: 'opl_app_webui_build_input.v1',
    release: {
      version: authority.release.version,
      bundle_digest: releaseBundleDigest,
      cohort_ref: releaseCohortRef,
    },
    source_cutoff: {
      observed_at: observedAt,
      policy: 'single_read_at_freeze_admission',
      post_freeze_remote_refresh_allowed: false,
      later_authority_advancement_invalidates_bundle: false,
    },
    cohort,
    platform: { os: 'linux', architecture },
    inputs: frozenBuildInputs({
      values,
      appRoot,
      appRef: cohort.app_sha,
      shellRoot,
      shellRef: cohort.shell_sha,
      frameworkRoot,
      frameworkRef: cohort.framework_sha,
      architecture,
    }),
  };
}

export function qualificationCohort(bundle: JsonRecord): JsonRecord {
  const sources = {
    app_sha: bundle.sources.app.source_commit,
    shell_sha: bundle.sources.shell.source_commit,
    framework_sha: bundle.sources.framework.source_commit,
  };
  if (bundle.identity_mode !== appStandardIdentityMode) throw new Error('Unsupported App artifact identity.');
  exactJson(bundle.package_compatibility, packageCompatibility, 'App Package compatibility');
  return { ...sources, identity_mode: appStandardIdentityMode, package_compatibility: packageCompatibility };
}

export function bundleDocument(bundlePath: string): JsonRecord {
  const bundle = readJson(path.resolve(bundlePath));
  if (bundle.surface_kind !== 'opl_release_bundle.v1' || typeof bundle.bundle_digest !== 'string') {
    throw new Error('Bundle must be an opl_release_bundle.v1 document.');
  }
  return bundle;
}

export function buildExecutorReceipt(values: AdapterOptionValues): JsonRecord {
  const operation = requireOption(values, 'operation');
  const releaseOperation = requireOption(values, 'release-operation') as StableReleaseOperation;
  const operationId = requireOption(values, 'operation-id');
  const executor = requireOption(values, 'executor');
  const attemptId = requireOption(values, 'attempt-id');
  const remoteTarget = requireOption(values, 'remote-target');
  const priorAttemptId = typeof values['prior-attempt-id'] === 'string'
    ? requireOption(values, 'prior-attempt-id')
    : null;
  const track = requireOption(values, 'track') as Track;
  const outcome = requireOption(values, 'outcome');
  if (operation !== 'build' && operation !== 'remote_inspect') throw new Error('Invalid executor operation.');
  if (!['standard', 'resume_standard', 'append_full'].includes(releaseOperation)) {
    throw new Error('Invalid release operation.');
  }
  if (executor !== 'local' && executor !== 'remote') throw new Error('Invalid executor.');
  if (track !== 'standard' && track !== 'full') throw new Error('Invalid track.');
  if (outcome !== 'complete' && outcome !== 'unknown') throw new Error('Invalid outcome.');
  if (
    (track === 'standard' && releaseOperation === 'append_full')
    || (track === 'full' && releaseOperation !== 'append_full')
  ) {
    throw new Error('Release operation does not match the executor receipt track.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(operationId)) {
    throw new Error('--operation-id is not canonical.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(attemptId)) {
    throw new Error('--attempt-id is not canonical.');
  }
  if (priorAttemptId !== null && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(priorAttemptId)) {
    throw new Error('--prior-attempt-id is not canonical.');
  }
  if (!/^[a-z][a-z0-9+.-]{0,31}:[A-Za-z0-9][A-Za-z0-9._~:/?#@!$&'()*+,;=%-]*$/.test(remoteTarget)) {
    throw new Error('--remote-target is not canonical.');
  }
  const publicationScope = values['publication-scope'];
  if (operation === 'build' && publicationScope !== undefined) {
    throw new Error('Build executor receipts must not carry --publication-scope.');
  }
  if (
    operation === 'remote_inspect'
    && publicationScope !== 'track_assets'
    && publicationScope !== 'external_target'
  ) {
    throw new Error('Remote inspection requires --publication-scope track_assets or external_target.');
  }
  const bundle = bundleDocument(requireOption(values, 'bundle'));
  const requiredNames = bundle.tracks?.[track]?.required_asset_names;
  if (!Array.isArray(requiredNames) || requiredNames.some((name) => typeof name !== 'string')) {
    throw new Error(`Bundle ${track} track has no closed required_asset_names.`);
  }
  let assets: JsonRecord[] = [];
  if (outcome === 'complete' && operation === 'build') {
    const root = path.resolve(requireOption(values, 'assets-dir'));
    assets = requiredNames.map((name: string) => {
      const filePath = path.join(root, name);
      const stat = fs.lstatSync(filePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
        throw new Error(`Invalid ${track} asset: ${filePath}`);
      }
      return { name, size_bytes: stat.size, sha256: digestRef(sha256File(filePath)), path: filePath };
    });
  } else if (
    outcome === 'complete'
    && operation === 'remote_inspect'
    && publicationScope === 'track_assets'
  ) {
    const inspection = readJson(path.resolve(requireOption(values, 'inspection')));
    if (inspection.release?.exists === false) {
      if (!Array.isArray(inspection.assets) || inspection.assets.length !== 0) {
        throw new Error(`Remote ${track} absent-release inspection must contain an empty asset list.`);
      }
    } else if (inspection.release?.exists === true) {
      const inspectedAssets = Array.isArray(inspection.assets) ? inspection.assets : [];
      const allowSameTagFullAssets = values['allow-same-tag-full-assets'];
      if (allowSameTagFullAssets !== undefined && allowSameTagFullAssets !== 'true') {
        throw new Error('--allow-same-tag-full-assets only accepts true when explicitly admitted.');
      }
      if (
        allowSameTagFullAssets === 'true'
        && (
          track !== 'standard'
          || releaseOperation !== 'resume_standard'
          || bundle.release?.channel !== 'stable'
          || bundle.release?.tag !== `v${bundle.release?.version}`
          || !Array.isArray(bundle.tracks?.full?.required_asset_names)
          || bundle.tracks.full.required_asset_names.length !== 2
          || bundle.tracks.full.required_asset_names.some((name: unknown) => typeof name !== 'string')
        )
      ) {
        throw new Error(
          'Same-tag Full asset admission requires one Stable resume_standard inspection with a closed Full asset set.',
        );
      }
      const permittedCarrierNames = track === 'full'
        ? (bundle.tracks?.standard?.required_asset_names ?? [])
        : allowSameTagFullAssets === 'true'
          ? bundle.tracks.full.required_asset_names
          : [];
      // The attestation seals the payload set, so it is generated after the Bundle
      // and cannot recursively appear in required_asset_names.
      const permittedEvidenceNames = bundle.release?.channel === 'stable'
        ? ['opl-release-attestation.json', ...standardInstallerSidecarAssetNames]
        : [];
      const allowedNameSet = new Set([
        ...requiredNames,
        ...permittedCarrierNames,
        ...permittedEvidenceNames,
      ]);
      const remoteAssets = new Map<string, JsonRecord>();
      for (const inspectedAsset of inspectedAssets) {
        const asset = inspectedAsset as JsonRecord;
        const name = typeof asset?.name === 'string' ? asset.name : '';
        // A published Standard Release may receive additive desktop follower
        // assets after its original attestation. Full append only consumes its
        // own two names, so well-formed additive names remain observational.
        if (!allowedNameSet.has(name) && track !== 'full') {
          throw new Error(`Remote ${track} inspection contains unknown asset ${name || '<missing>'}.`);
        }
        if (!releaseAssetNamePattern.test(name)) {
          throw new Error(`Remote ${track} inspection contains an unsafe asset basename ${name || '<missing>'}.`);
        }
        if (remoteAssets.has(name)) {
          throw new Error(`Remote ${track} inspection contains duplicate asset ${name}.`);
        }
        if (!Number.isSafeInteger(asset.size_bytes) || Number(asset.size_bytes) <= 0
          || !digestPattern.test(String(asset.sha256 ?? ''))) {
          throw new Error(`Remote ${track} asset ${name} has no exact digest and positive size.`);
        }
        remoteAssets.set(name, asset);
      }
      assets = requiredNames
        .filter((name: string) => remoteAssets.has(name))
        .map((name: string) => {
          const asset = remoteAssets.get(name) as JsonRecord;
          return { name, size_bytes: asset.size_bytes, sha256: asset.sha256 };
        });
    } else {
      throw new Error(`Remote ${track} inspection has no definitive Release existence state.`);
    }
  }
  return {
    surface_kind: 'opl_release_bundle_executor_receipt.v1',
    schema_ref: 'contracts/opl-framework/release-bundle-executor-receipt.schema.json',
    operation,
    executor,
    attempt_id: attemptId,
    bundle_digest: bundle.bundle_digest,
    track,
    outcome,
    release_operation: releaseOperation,
    operation_id: operationId,
    remote_target: remoteTarget,
    prior_attempt_id: priorAttemptId,
    ...(operation === 'remote_inspect' ? { publication_scope: publicationScope } : {}),
    assets,
  };
}

export function buildQualificationReceipt(values: AdapterOptionValues): JsonRecord {
  const bundle = bundleDocument(requireOption(values, 'bundle'));
  const track = requireOption(values, 'track') as Track;
  if (track !== 'standard' && track !== 'full') throw new Error('--track must be standard or full.');
  const legacyQualification = values['legacy-qualification'];
  const hostedCoreQualification = values['hosted-core-qualification'];
  if (Boolean(legacyQualification) === Boolean(hostedCoreQualification)) {
    throw new Error('Pass exactly one of --legacy-qualification or --hosted-core-qualification.');
  }
  if (hostedCoreQualification) {
    if (track !== 'full') throw new Error('--hosted-core-qualification supports only the Full track.');
    const hostedPath = path.resolve(requireOption(values, 'hosted-core-qualification'));
    const hosted = readJson(hostedPath);
    const subjectName = String(hosted.subject?.asset_name ?? '');
    const sizeBytes = Number(hosted.subject?.size_bytes);
    const artifactSha256 = String(hosted.subject?.sha256 ?? '');
    const requiredNames = bundle.tracks?.full?.required_asset_names;
    const verification = hosted.verification ?? {};
    const execution = hosted.execution;
    const trustedMacOSRunner = (execution?.execution_class === 'github_hosted' && execution.runner === 'macos-latest')
      || (execution?.execution_class === 'self_hosted' && execution.runner === 'opl-release-macos-arm64');
    if (
      hosted.schema !== 'opl_app_hosted_full_core_qualification.v1'
      || hosted.status !== 'passed'
      || !trustedMacOSRunner
      || hosted.execution?.run_attempt !== 1
      || !/^[1-9][0-9]*$/.test(String(hosted.execution?.run_id ?? ''))
      || hosted.release?.version !== bundle.release.version
      || !Array.isArray(requiredNames)
      || !requiredNames.includes(subjectName)
      || !Number.isSafeInteger(sizeBytes)
      || sizeBytes <= 0
      || !digestPattern.test(artifactSha256)
      || hosted.manifest?.asset_name !== 'opl-release-manifest.json'
      || !digestPattern.test(String(hosted.manifest?.sha256 ?? ''))
      || verification.dmg_verified !== true
      || verification.read_only_mount !== true
      || verification.exact_single_app !== true
      || verification.codesign !== true
      || verification.stapler !== true
      || verification.gatekeeper !== true
      || verification.manifest_bound !== true
      || verification.full_runtime_native_trust !== true
      || typeof hosted.evidence_ref !== 'string'
      || hosted.evidence_ref.trim() === ''
    ) {
      throw new Error('Full core qualification does not bind the exact Full artifact and macOS trust evidence.');
    }
    return {
      surface_kind: 'opl_release_bundle_qualification_receipt.v1',
      schema_ref: 'contracts/opl-framework/release-bundle-qualification-receipt.schema.json',
      bundle_digest: bundle.bundle_digest,
      track,
      subject: {
        asset_name: subjectName,
        size_bytes: sizeBytes,
        sha256: artifactSha256,
      },
      cohort: qualificationCohort(bundle),
      qualification: {
        kind: 'installed_artifact',
        result: 'passed',
        installed_artifact_same_bytes: true,
        harness_sha256: digestRef(sha256File(hostedPath)),
        evidence_refs: [hosted.evidence_ref],
      },
    };
  }
  const legacyPath = path.resolve(String(legacyQualification));
  const legacy = readJson(legacyPath) as ArtifactQualificationReceiptV1;
  const packageProfile = track;
  const artifactSha256 = String(legacy.artifact?.sha256 ?? '').replace(/^sha256:/, '');
  const validationErrors = validateArtifactQualificationReceipt(legacy, {
    stableSessionId: bundle.bundle_digest,
    releaseCohortRef: bundle.bundle_digest,
    version: bundle.release.version,
    packageProfile,
    result: 'passed',
    artifactSha256,
    appSha: bundle.sources.app.source_commit,
    shellSha: bundle.sources.shell.source_commit,
    frameworkSha: bundle.sources.framework.source_commit,
  });
  if (validationErrors.length > 0) {
    throw new Error(`Legacy qualification receipt does not bind this Bundle: ${validationErrors.join('; ')}`);
  }
  const requiredNames = bundle.tracks?.[track]?.required_asset_names;
  const subjectName = String(legacy.artifact?.name ?? '');
  if (!Array.isArray(requiredNames) || !requiredNames.includes(subjectName)) {
    throw new Error(`Qualified artifact ${subjectName || '<missing>'} is not a required ${track} Bundle asset.`);
  }
  const sizeBytes = Number(legacy.artifact?.size_bytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error('Legacy qualification receipt has no positive artifact size.');
  }
  const harnessSha256 = legacy.verification_harness?.smoke_harness_sha256
    ?? legacy.build_manifest?.smoke_harness_sha256;
  const evidenceRef = legacy.qualification?.evidence_ref;
  if (typeof harnessSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(harnessSha256)) {
    throw new Error('Legacy qualification receipt has no valid smoke harness digest.');
  }
  if (typeof evidenceRef !== 'string' || evidenceRef.trim() === '') {
    throw new Error('Legacy qualification receipt has no durable evidence ref.');
  }
  return {
    surface_kind: 'opl_release_bundle_qualification_receipt.v1',
    schema_ref: 'contracts/opl-framework/release-bundle-qualification-receipt.schema.json',
    bundle_digest: bundle.bundle_digest,
    track,
    subject: {
      asset_name: subjectName,
      size_bytes: sizeBytes,
      sha256: digestRef(artifactSha256),
    },
    cohort: qualificationCohort(bundle),
    qualification: {
      kind: 'installed_artifact',
      result: 'passed',
      installed_artifact_same_bytes: true,
      harness_sha256: digestRef(harnessSha256),
      evidence_refs: [evidenceRef],
    },
  };
}
