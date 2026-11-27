import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isFullFrameworkIdentity, type FullFrameworkIdentity } from './full-framework-daemon-proof.ts';

export type BuildArtifactCohortV2 = {
  schema: 'opl_app_build_artifact_cohort.v2';
  release: {
    stable_session_id: string | null;
    release_cohort_ref: string | null;
  };
  cohort: {
    app_sha: string;
    shell_sha: string;
    framework_sha: string | null;
  };
  build: {
    version: string;
    kind: 'standard' | 'full';
  };
  artifact: {
    name: string;
    sha256: string;
    size_bytes: number;
  };
  actions: {
    run_id: string;
    run_attempt: string;
    artifact_name: string;
  };
  digests: {
    packaged_tree_sha256: string;
    app_product_profile_sha256: string;
    gui_product_contract_sha256: string;
    smoke_harness_sha256: string;
    compiled_expectation_semantic_sha256: string;
    compiled_expectation_probe_sha256: string;
    qualification_input_manifest_sha256: string;
    full_input_manifest_sha256?: string;
    full_package_manifest_sha256?: string;
    full_toolchain_observation_receipt_sha256?: string;
  };
  qualification_runtime: {
    codex_cli: FrozenCodexCliIdentityV1;
    framework?: FullFrameworkIdentity;
  };
};

export type FrozenCodexCliIdentityV1 = {
  package: '@openai/codex';
  version: string;
  npm_integrity: string;
  tarball_url: string;
  tarball_sha256: string;
  platform: {
    package: '@openai/codex';
    version: string;
    npm_integrity: string;
    tarball_url: string;
    tarball_sha256: string;
  };
};

const shaPattern = /^[0-9a-f]{40}$/i;
const digestPattern = /^[0-9a-f]{64}$/i;
const npmIntegrityPattern = /^sha512-[A-Za-z0-9+/]+={0,2}$/;

export function validateFrozenCodexCliIdentity(value: unknown): string[] {
  const errors: string[] = [];
  const identity = value as Partial<FrozenCodexCliIdentityV1> | null;
  if (!identity || typeof identity !== 'object') return ['frozen Codex CLI identity is missing'];
  if (identity.package !== '@openai/codex') errors.push('frozen Codex CLI package is invalid');
  if (!/^\d+\.\d+\.\d+$/.test(String(identity.version))) errors.push('frozen Codex CLI version is invalid');
  if (!npmIntegrityPattern.test(String(identity.npm_integrity))) errors.push('frozen Codex CLI npm integrity is invalid');
  if (!digestPattern.test(String(identity.tarball_sha256))) errors.push('frozen Codex CLI tarball SHA-256 is invalid');
  if (identity.tarball_url !== `https://registry.npmjs.org/@openai/codex/-/codex-${identity.version}.tgz`) {
    errors.push('frozen Codex CLI tarball URL is not exact-version registry authority');
  }
  const platform = identity.platform;
  if (!platform || typeof platform !== 'object') return [...errors, 'frozen Codex CLI platform identity is missing'];
  if (platform.package !== '@openai/codex') errors.push('frozen Codex CLI platform package is invalid');
  if (platform.version !== `${identity.version}-darwin-arm64`) errors.push('frozen Codex CLI platform version is not bound to the base version');
  if (!npmIntegrityPattern.test(String(platform.npm_integrity))) errors.push('frozen Codex CLI platform npm integrity is invalid');
  if (!digestPattern.test(String(platform.tarball_sha256))) errors.push('frozen Codex CLI platform tarball SHA-256 is invalid');
  if (platform.tarball_url !== `https://registry.npmjs.org/@openai/codex/-/codex-${platform.version}.tgz`) {
    errors.push('frozen Codex CLI platform tarball URL is not exact-version registry authority');
  }
  return errors;
}

export function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function collectTreeEntries(root: string, relative = ''): string[] {
  const directory = path.join(root, relative);
  return fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const childRelative = path.posix.join(relative.split(path.sep).join('/'), entry.name);
      const childPath = path.join(root, childRelative);
      const stat = fs.lstatSync(childPath);
      const mode = (stat.mode & 0o777).toString(8);
      if (entry.isDirectory()) return [`D\t${childRelative}\t${mode}`, ...collectTreeEntries(root, childRelative)];
      if (entry.isSymbolicLink()) return [`L\t${childRelative}\t${mode}\t${fs.readlinkSync(childPath)}`];
      return [`F\t${childRelative}\t${mode}\t${stat.size}\t${sha256File(childPath)}`];
    });
}

export function sha256Tree(root: string): string {
  if (!fs.statSync(root).isDirectory()) throw new Error(`Packaged tree is not a directory: ${root}`);
  return crypto.createHash('sha256').update(`${collectTreeEntries(root).join('\n')}\n`).digest('hex');
}

export function buildArtifactCohortV2(input: {
  appSha: string;
  shellSha: string;
  frameworkSha?: string;
  version: string;
  kind: 'standard' | 'full';
  artifactPath: string;
  artifactName: string;
  packagedTreePath: string;
  appProductProfilePath: string;
  guiProductContractPath: string;
  smokeHarnessPath: string;
  compiledExpectationsPath: string;
  qualificationInputManifestPath: string;
  fullInputManifestPath?: string;
  fullPackageManifestPath?: string;
  fullToolchainObservationReceiptPath?: string;
  actionsRunId: string;
  actionsRunAttempt: string;
  actionsArtifactName: string;
  stableSessionId?: string;
  releaseCohortRef?: string;
}): BuildArtifactCohortV2 {
  const compiled = JSON.parse(fs.readFileSync(input.compiledExpectationsPath, 'utf8'));
  const profile = compiled?.profiles?.[input.kind];
  if (
    typeof profile?.semantic_digest !== 'string' || !digestPattern.test(profile.semantic_digest) ||
    typeof profile?.probe_digest !== 'string' || !digestPattern.test(profile.probe_digest)
  ) {
    throw new Error(`Compiled ${input.kind} first-run expectations are missing valid semantic/probe digests.`);
  }
  if (input.kind === 'full' && (!input.fullInputManifestPath || !input.fullPackageManifestPath)) {
    throw new Error('Full artifact cohort requires its input selection and actual package manifest paths.');
  }
  if (input.kind === 'full' && !input.fullToolchainObservationReceiptPath) {
    throw new Error('Full artifact cohort requires a toolchain observation receipt.');
  }
  const qualificationInput = JSON.parse(fs.readFileSync(input.qualificationInputManifestPath, 'utf8'));
  if (qualificationInput?.schema !== 'opl_app_release_qualification_input_manifest.v1') {
    throw new Error('Release qualification input manifest schema is invalid.');
  }
  const codexCli = qualificationInput?.runtime_payloads?.codex_cli as FrozenCodexCliIdentityV1;
  const codexErrors = validateFrozenCodexCliIdentity(codexCli);
  if (codexErrors.length > 0) throw new Error(`Release qualification inputs are invalid: ${codexErrors.join('; ')}`);
  let framework: FullFrameworkIdentity | undefined;
  if (input.kind === 'full') {
    const component = JSON.parse(fs.readFileSync(input.fullPackageManifestPath!, 'utf8')).components?.opl;
    if (component?.framework_api_version === '2.0') {
      const appProfile = JSON.parse(fs.readFileSync(input.appProductProfilePath, 'utf8'));
      framework = {
        api_version: '2.0',
        version: component.framework_daemon_version,
        official_root_package_ids: appProfile.official_profile?.desired_root_package_ids,
      };
      if (!isFullFrameworkIdentity(framework) || !input.frameworkSha || component.git_commit !== input.frameworkSha) {
        throw new Error('Full Framework identity must bind the selected commit, daemon version and Official Profile.');
      }
    } else if (component?.framework_api_version != null && component.framework_api_version !== '1.0') {
      throw new Error(`Unsupported Full Framework API version: ${component.framework_api_version}`);
    }
  }
  return {
    schema: 'opl_app_build_artifact_cohort.v2',
    release: {
      stable_session_id: input.stableSessionId || null,
      release_cohort_ref: input.releaseCohortRef || null,
    },
    cohort: {
      app_sha: input.appSha,
      shell_sha: input.shellSha,
      framework_sha: input.frameworkSha || null,
    },
    build: { version: input.version, kind: input.kind },
    artifact: {
      name: input.artifactName,
      sha256: sha256File(input.artifactPath),
      size_bytes: fs.statSync(input.artifactPath).size,
    },
    actions: {
      run_id: input.actionsRunId,
      run_attempt: input.actionsRunAttempt,
      artifact_name: input.actionsArtifactName,
    },
    digests: {
      packaged_tree_sha256: sha256Tree(input.packagedTreePath),
      app_product_profile_sha256: sha256File(input.appProductProfilePath),
      gui_product_contract_sha256: sha256File(input.guiProductContractPath),
      smoke_harness_sha256: sha256File(input.smokeHarnessPath),
      compiled_expectation_semantic_sha256: profile.semantic_digest,
      compiled_expectation_probe_sha256: profile.probe_digest,
      qualification_input_manifest_sha256: sha256File(input.qualificationInputManifestPath),
      ...(input.kind === 'full' ? {
        full_input_manifest_sha256: sha256File(input.fullInputManifestPath!),
        full_package_manifest_sha256: sha256File(input.fullPackageManifestPath!),
        full_toolchain_observation_receipt_sha256: sha256File(input.fullToolchainObservationReceiptPath!),
      } : {}),
    },
    qualification_runtime: { codex_cli: codexCli, ...(framework ? { framework } : {}) },
  };
}

export function validateArtifactCohortV2(
  manifest: BuildArtifactCohortV2,
  expected: {
    appSha: string;
    shellSha: string;
    frameworkSha?: string;
    version?: string;
    artifactPath?: string;
    actionsRunId?: string;
    stableSessionId?: string;
    releaseCohortRef?: string;
  },
): string[] {
  const errors: string[] = [];
  if (manifest.schema !== 'opl_app_build_artifact_cohort.v2') return [`unsupported schema ${String(manifest.schema)}`];
  if (!manifest.release || !manifest.cohort || !manifest.build || !manifest.artifact || !manifest.actions || !manifest.digests || !manifest.qualification_runtime) {
    return ['manifest is missing required v2 identity sections'];
  }
  if (manifest.release.stable_session_id !== null && !/^sha256:[0-9a-f]{64}$/.test(manifest.release.stable_session_id)) {
    errors.push('stable_session_id must be a lowercase sha256 ref');
  }
  if (manifest.release.release_cohort_ref !== null && !/^sha256:[0-9a-f]{64}$/.test(manifest.release.release_cohort_ref)) {
    errors.push('release_cohort_ref must be a lowercase sha256 ref');
  }
  if (expected.stableSessionId && manifest.release.stable_session_id !== expected.stableSessionId) {
    errors.push(`stable_session_id expected ${expected.stableSessionId} but artifact contains ${String(manifest.release.stable_session_id)}`);
  }
  if (expected.releaseCohortRef && manifest.release.release_cohort_ref !== expected.releaseCohortRef) {
    errors.push(`release_cohort_ref expected ${expected.releaseCohortRef} but artifact contains ${String(manifest.release.release_cohort_ref)}`);
  }
  for (const [label, value] of [
    ['manifest app_sha', manifest.cohort?.app_sha],
    ['manifest shell_sha', manifest.cohort?.shell_sha],
    ['expected app_sha', expected.appSha],
    ['expected shell_sha', expected.shellSha],
  ] as const) {
    if (!shaPattern.test(value || '')) errors.push(`${label} must be a 40-character Git SHA`);
  }
  if (manifest.cohort?.app_sha !== expected.appSha) errors.push(`app_sha expected ${expected.appSha} but artifact contains ${manifest.cohort?.app_sha}`);
  if (manifest.cohort?.shell_sha !== expected.shellSha) errors.push(`shell_sha expected ${expected.shellSha} but artifact contains ${manifest.cohort?.shell_sha}`);
  if (expected.frameworkSha && manifest.cohort?.framework_sha !== expected.frameworkSha) errors.push(`framework_sha expected ${expected.frameworkSha} but artifact contains ${String(manifest.cohort?.framework_sha)}`);
  if (expected.version && manifest.build?.version !== expected.version) errors.push(`version expected ${expected.version} but artifact contains ${manifest.build?.version}`);
  if (expected.actionsRunId && manifest.actions?.run_id !== expected.actionsRunId) errors.push(`actions run expected ${expected.actionsRunId} but artifact contains ${manifest.actions?.run_id}`);
  if (!manifest.artifact?.name || !digestPattern.test(manifest.artifact?.sha256 || '') || !Number.isSafeInteger(manifest.artifact?.size_bytes) || manifest.artifact.size_bytes <= 0) errors.push('artifact identity must include name, SHA-256, and positive size');
  for (const [label, value] of Object.entries(manifest.digests || {})) {
    if (!digestPattern.test(value)) errors.push(`${label} must be a SHA-256 digest`);
  }
  const requiredDigestCount = manifest.build.kind === 'full' ? 10 : 7;
  if (Object.keys(manifest.digests || {}).length !== requiredDigestCount) {
    errors.push(`manifest must include all ${requiredDigestCount} required source, expectation, and packaged-tree digests`);
  }
  if (manifest.build.kind === 'full') {
    if (!digestPattern.test(manifest.digests.full_input_manifest_sha256 || '')) errors.push('Full input manifest digest is missing');
    if (!digestPattern.test(manifest.digests.full_package_manifest_sha256 || '')) errors.push('Full package manifest digest is missing');
    if (!digestPattern.test(manifest.digests.full_toolchain_observation_receipt_sha256 || '')) errors.push('Full toolchain observation receipt digest is missing');
  }
  if (!digestPattern.test(manifest.digests.qualification_input_manifest_sha256 || '')) errors.push('Qualification input manifest digest is missing');
  errors.push(...validateFrozenCodexCliIdentity(manifest.qualification_runtime.codex_cli));
  if (manifest.qualification_runtime.framework !== undefined
    && (manifest.build.kind !== 'full' || !isFullFrameworkIdentity(manifest.qualification_runtime.framework))) {
    errors.push('Invalid Full Framework qualification identity');
  }
  if (expected.artifactPath) {
    const actualSize = fs.statSync(expected.artifactPath).size;
    const actualSha = sha256File(expected.artifactPath);
    if (manifest.artifact.size_bytes !== actualSize) errors.push(`artifact size expected ${manifest.artifact.size_bytes} but downloaded ${actualSize}`);
    if (manifest.artifact.sha256 !== actualSha) errors.push(`artifact SHA-256 expected ${manifest.artifact.sha256} but downloaded ${actualSha}`);
  }
  return errors;
}
