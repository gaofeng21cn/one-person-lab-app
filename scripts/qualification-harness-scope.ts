#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const shaPattern = /^[0-9a-f]{40}$/i;

export type QualificationHarnessScopeProof = {
  schema: 'opl_app_qualification_harness_scope.v2';
  profile: 'standard' | 'full';
  classification: 'same_as_artifact_cohort' | 'harness_mechanics_only' | 'new_cohort_required';
  expectations: {
    artifact_semantic_digest: string;
    verification_semantic_digest: string;
    semantic_equal: boolean;
    artifact_probe_digest: string;
    verification_probe_digest: string;
    probe_equal: boolean;
  };
  reuse_authorization: {
    allowed: boolean;
    reason: 'exact_cohort' | 'harness_mechanics_only' | 'semantic_expectation_changed' | 'app_changed' | 'shell_product_or_runtime_changed';
    forbidden_paths: {
      app: string[];
      shell: string[];
    };
  };
  app: {
    repo: 'gaofeng21cn/one-person-lab-app';
    base_sha: string;
    head_sha: string;
    changed_paths: string[];
  };
  shell: {
    repo: 'gaofeng21cn/opl-aion-shell';
    base_sha: string;
    head_sha: string;
    changed_paths: string[];
  };
};

export type QualificationHarnessScopeCommandRunner = (
  command: string,
  args: string[],
  options?: { cwd?: string },
) => { status: number | null; stdout: string; stderr: string };

function defaultRunner(command: string, args: string[], options: { cwd?: string } = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function assertSha(label: string, value: string): string {
  if (!shaPattern.test(value)) throw new Error(`${label} must be an exact 40-character Git commit SHA.`);
  return value.toLowerCase();
}

function runOrThrow(
  runner: QualificationHarnessScopeCommandRunner,
  command: string,
  args: string[],
  cwd: string,
  label: string,
): string {
  const result = runner(command, args, { cwd });
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `${command} exited ${String(result.status)}`;
    throw new Error(`${label}: ${detail}`);
  }
  return result.stdout;
}

export function collectRemoteChangedPaths(
  runner: QualificationHarnessScopeCommandRunner,
  repo: string,
  baseSha: string,
  headSha: string,
): string[] {
  const base = assertSha(`${repo} base`, baseSha);
  const head = assertSha(`${repo} head`, headSha);
  if (base === head) return [];

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-qualification-scope-'));
  try {
    runOrThrow(runner, 'git', ['init', '-q'], root, `initialize ${repo} scope checkout`);
    runOrThrow(
      runner,
      'git',
      ['remote', 'add', 'origin', `https://github.com/${repo}.git`],
      root,
      `configure ${repo} scope remote`,
    );
    for (const sha of [base, head]) {
      runOrThrow(
        runner,
        'git',
        ['fetch', '--no-tags', '--depth=1', 'origin', sha],
        root,
        `fetch ${repo}@${sha}`,
      );
      runOrThrow(runner, 'git', ['cat-file', '-e', `${sha}^{commit}`], root, `verify ${repo}@${sha}`);
    }
    const output = runOrThrow(
      runner,
      'git',
      ['diff', '--no-renames', '--name-only', '--diff-filter=ACDMRTUXB', base, head, '--'],
      root,
      `compare ${repo} qualification harness scope`,
    );
    return [...new Set(output.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean))].sort();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

export function readRemoteExpectationDigests(
  runner: QualificationHarnessScopeCommandRunner,
  appSha: string,
  profile: 'standard' | 'full',
): { semantic: string; probe: string } {
  const sha = assertSha('expectation App SHA', appSha);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-qualification-expectation-'));
  try {
    runOrThrow(runner, 'git', ['init', '-q'], root, 'initialize expectation checkout');
    runOrThrow(
      runner,
      'git',
      ['remote', 'add', 'origin', 'https://github.com/gaofeng21cn/one-person-lab-app.git'],
      root,
      'configure expectation remote',
    );
    runOrThrow(runner, 'git', ['fetch', '--no-tags', '--depth=1', 'origin', sha], root, `fetch App@${sha}`);
    const raw = runOrThrow(
      runner,
      'git',
      ['show', `${sha}:contracts/app-first-run-compiled-expectations.json`],
      root,
      `read App@${sha} compiled expectations`,
    );
    const profileExpectations = JSON.parse(raw)?.profiles?.[profile];
    const semantic = profileExpectations?.semantic_digest;
    const probe = profileExpectations?.probe_digest;
    if (typeof semantic !== 'string' || !/^[0-9a-f]{64}$/.test(semantic)) {
      throw new Error(`App@${sha} has no valid ${profile} semantic expectation digest.`);
    }
    if (typeof probe !== 'string' || !/^[0-9a-f]{64}$/.test(probe)) {
      throw new Error(`App@${sha} has no valid ${profile} probe expectation digest.`);
    }
    return { semantic, probe };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function normalizeChangedPaths(label: string, changedPaths: string[]): string[] {
  const normalized = [...new Set(changedPaths)].sort();
  if (normalized.length !== changedPaths.length || normalized.some((entry, index) => entry !== changedPaths[index])) {
    throw new Error(`${label} changed_paths must be sorted and unique.`);
  }
  return normalized;
}

export function buildQualificationHarnessScopeProof(input: {
  artifactAppSha: string;
  verificationAppSha: string;
  appChangedPaths: string[];
  artifactShellSha: string;
  verificationShellSha: string;
  shellChangedPaths: string[];
  profile?: 'standard' | 'full';
  artifactExpectationDigest?: string;
  verificationExpectationDigest?: string;
  artifactProbeDigest?: string;
  verificationProbeDigest?: string;
}): QualificationHarnessScopeProof {
  const artifactAppSha = assertSha('artifact App SHA', input.artifactAppSha);
  const verificationAppSha = assertSha('verification App SHA', input.verificationAppSha);
  const artifactShellSha = assertSha('artifact Shell SHA', input.artifactShellSha);
  const verificationShellSha = assertSha('verification Shell SHA', input.verificationShellSha);
  const appChangedPaths = normalizeChangedPaths('App', input.appChangedPaths);
  const shellChangedPaths = normalizeChangedPaths('Shell', input.shellChangedPaths);
  const profile = input.profile ?? 'standard';
  const artifactExpectationDigest = input.artifactExpectationDigest ?? '0'.repeat(64);
  const verificationExpectationDigest = input.verificationExpectationDigest ?? artifactExpectationDigest;
  const artifactProbeDigest = input.artifactProbeDigest ?? '0'.repeat(64);
  const verificationProbeDigest = input.verificationProbeDigest ?? artifactProbeDigest;
  for (const [label, digest] of [
    ['artifact expectation', artifactExpectationDigest],
    ['verification expectation', verificationExpectationDigest],
    ['artifact probe', artifactProbeDigest],
    ['verification probe', verificationProbeDigest],
  ]) {
    if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error(`${label} digest is invalid.`);
  }

  if ((artifactAppSha === verificationAppSha) !== (appChangedPaths.length === 0)) {
    throw new Error('App scope proof SHA equality is inconsistent with changed_paths.');
  }
  if ((artifactShellSha === verificationShellSha) !== (shellChangedPaths.length === 0)) {
    throw new Error('Shell scope proof SHA equality is inconsistent with changed_paths.');
  }
  const expectationsEqual = artifactExpectationDigest === verificationExpectationDigest;
  const probesEqual = artifactProbeDigest === verificationProbeDigest;
  const appDiffers = appChangedPaths.length > 0;
  const shellDiffers = shellChangedPaths.length > 0;
  const appHarnessMechanicsPaths = [
    '.github/workflows/_release-full-addon.yml',
    '.github/workflows/opl-first-run-vm.yml',
    '.github/workflows/opl-studio-candidate-carriers.yml',
    '.github/workflows/release-stable-post-success-followups.yml',
    '.github/workflows/release-stable.yml',
    'contracts/app-shell-candidates.json',
    'scripts/qualification-harness-scope.ts',
    'scripts/validate-shell-candidates/candidate-contract.ts',
    'scripts/validate-release-boundary/release-checks.ts',
    'scripts/validate-release-boundary/text-check-runner.ts',
    'scripts/verify-release-gateway-test-account.ts',
    'tests/release/app-release-boundary-cases/gui-delivery-topology-contract.test.ts',
    'tests/release/qualification-harness-scope.test.ts',
    'tests/release/release-bundle-workflow-cutover-cases/control-and-recovery.ts',
    'tests/release/release-bundle-workflow-cutover-cases/publication-and-operation-guards.ts',
    'tests/release/release-bundle-workflow-cutover-cases/target-and-protected-evidence.ts',
    'tests/release/release-bundle-workflow-cutover-cases/vm-and-reconcile.ts',
    'tests/release/release-gateway-test-account.test.ts',
    'tests/release/release-stable-post-success-followups.test.ts',
    'tests/release/release-workflow-broker-admission.test.ts',
  ];
  const shellHarnessMechanicsPaths = [
    'scripts/opl-first-run-vm-smoke.mjs',
    'tests/unit/opl-runtime/firstRunVmSmoke.test.ts',
    'tests/unit/opl-runtime/firstRunVmSmokeScripts.test.ts',
  ];
  const appHarnessMechanicsOnly = appDiffers &&
    appChangedPaths.every((entry) => appHarnessMechanicsPaths.includes(entry));
  const shellHarnessMechanicsOnly = shellDiffers &&
    shellChangedPaths.every((entry) => shellHarnessMechanicsPaths.includes(entry));
  const harnessMechanicsOnly = (appHarnessMechanicsOnly || !appDiffers) &&
    (shellHarnessMechanicsOnly || !shellDiffers) &&
    (appDiffers || shellDiffers);
  const forbiddenAppPaths = appHarnessMechanicsOnly ? [] : appChangedPaths;
  const forbiddenShellPaths = shellHarnessMechanicsOnly ? [] : shellChangedPaths;
  const expectationContractChanged = !expectationsEqual || !probesEqual;
  const classification = expectationContractChanged || forbiddenAppPaths.length > 0 || forbiddenShellPaths.length > 0
    ? 'new_cohort_required'
    : harnessMechanicsOnly
      ? 'harness_mechanics_only'
      : 'same_as_artifact_cohort';
  const reason = expectationContractChanged
    ? 'semantic_expectation_changed'
    : harnessMechanicsOnly
      ? 'harness_mechanics_only'
      : forbiddenAppPaths.length > 0
        ? 'app_changed'
      : forbiddenShellPaths.length > 0
        ? 'shell_product_or_runtime_changed'
        : 'exact_cohort';
  return {
    schema: 'opl_app_qualification_harness_scope.v2',
    profile,
    classification,
    expectations: {
      artifact_semantic_digest: artifactExpectationDigest,
      verification_semantic_digest: verificationExpectationDigest,
      semantic_equal: expectationsEqual,
      artifact_probe_digest: artifactProbeDigest,
      verification_probe_digest: verificationProbeDigest,
      probe_equal: probesEqual,
    },
    reuse_authorization: {
      allowed: classification !== 'new_cohort_required',
      reason,
      forbidden_paths: {
        app: forbiddenAppPaths,
        shell: forbiddenShellPaths,
      },
    },
    app: {
      repo: 'gaofeng21cn/one-person-lab-app',
      base_sha: artifactAppSha,
      head_sha: verificationAppSha,
      changed_paths: appChangedPaths,
    },
    shell: {
      repo: 'gaofeng21cn/opl-aion-shell',
      base_sha: artifactShellSha,
      head_sha: verificationShellSha,
      changed_paths: shellChangedPaths,
    },
  };
}

export function validateQualificationHarnessScopeProof(
  proof: QualificationHarnessScopeProof | null | undefined,
  expected: {
    artifactAppSha?: string;
    verificationAppSha?: string;
    artifactShellSha?: string;
    verificationShellSha?: string;
  } = {},
): string[] {
  const errors: string[] = [];
  if (
    !proof ||
    typeof proof !== 'object' ||
    !proof.app ||
    typeof proof.app !== 'object' ||
    !Array.isArray(proof.app.changed_paths) ||
    !proof.shell ||
    typeof proof.shell !== 'object' ||
    !Array.isArray(proof.shell.changed_paths)
  ) {
    return ['qualification harness scope proof is missing or malformed'];
  }
  try {
    const normalized = buildQualificationHarnessScopeProof({
      artifactAppSha: proof.app.base_sha,
      verificationAppSha: proof.app.head_sha,
      appChangedPaths: proof.app.changed_paths,
      artifactShellSha: proof.shell.base_sha,
      verificationShellSha: proof.shell.head_sha,
      shellChangedPaths: proof.shell.changed_paths,
      profile: proof.profile,
      artifactExpectationDigest: proof.expectations?.artifact_semantic_digest,
      verificationExpectationDigest: proof.expectations?.verification_semantic_digest,
      artifactProbeDigest: proof.expectations?.artifact_probe_digest,
      verificationProbeDigest: proof.expectations?.verification_probe_digest,
    });
    if (JSON.stringify(proof) !== JSON.stringify(normalized)) {
      errors.push('qualification harness scope proof fields are inconsistent');
    }
    for (const [label, actual, value] of [
      ['artifact App SHA', proof.app.base_sha, expected.artifactAppSha],
      ['verification App SHA', proof.app.head_sha, expected.verificationAppSha],
      ['artifact Shell SHA', proof.shell.base_sha, expected.artifactShellSha],
      ['verification Shell SHA', proof.shell.head_sha, expected.verificationShellSha],
    ] as const) {
      if (value && actual !== value.toLowerCase()) errors.push(`${label} is ${actual}`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return errors;
}

export function inspectQualificationHarnessScope(
  runner: QualificationHarnessScopeCommandRunner,
  input: {
    artifactAppSha: string;
    verificationAppSha: string;
    artifactShellSha: string;
    verificationShellSha: string;
    profile?: 'standard' | 'full';
  },
): QualificationHarnessScopeProof {
  const profile = input.profile ?? 'standard';
  const artifactExpectations = readRemoteExpectationDigests(runner, input.artifactAppSha, profile);
  const verificationExpectations = input.artifactAppSha === input.verificationAppSha
    ? artifactExpectations
    : readRemoteExpectationDigests(runner, input.verificationAppSha, profile);
  return buildQualificationHarnessScopeProof({
    ...input,
    appChangedPaths: collectRemoteChangedPaths(
      runner,
      'gaofeng21cn/one-person-lab-app',
      input.artifactAppSha,
      input.verificationAppSha,
    ),
    shellChangedPaths: collectRemoteChangedPaths(
      runner,
      'gaofeng21cn/opl-aion-shell',
      input.artifactShellSha,
      input.verificationShellSha,
    ),
    profile,
    artifactExpectationDigest: artifactExpectations.semantic,
    verificationExpectationDigest: verificationExpectations.semantic,
    artifactProbeDigest: artifactExpectations.probe,
    verificationProbeDigest: verificationExpectations.probe,
  });
}

function main(): void {
  const { values } = parseArgs({
    options: {
      'artifact-app-sha': { type: 'string' },
      'verification-app-sha': { type: 'string' },
      'artifact-shell-sha': { type: 'string' },
      'verification-shell-sha': { type: 'string' },
      profile: { type: 'string', default: 'standard' },
    },
    strict: true,
  });
  for (const key of [
    'artifact-app-sha',
    'verification-app-sha',
    'artifact-shell-sha',
    'verification-shell-sha',
  ] as const) {
    if (!values[key]) throw new Error(`Missing --${key}`);
  }
  const proof = inspectQualificationHarnessScope(defaultRunner, {
    artifactAppSha: values['artifact-app-sha']!,
    verificationAppSha: values['verification-app-sha']!,
    artifactShellSha: values['artifact-shell-sha']!,
    verificationShellSha: values['verification-shell-sha']!,
    profile: values.profile === 'full' ? 'full' : 'standard',
  });
  process.stdout.write(`${JSON.stringify(proof)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
