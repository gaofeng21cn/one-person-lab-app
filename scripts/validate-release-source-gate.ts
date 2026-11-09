#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';
import { ensureActiveShellCheckout, isGitCheckout } from './active-shell-checkout.ts';
import { readActiveShellBuildProfile } from './active-shell-build-profile.ts';
import { parseStrictBoolean } from './release-readiness-args.ts';

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import {
  createGithubOwnerReleaseNamespaceEvidence,
  validateGithubOwnerReleaseNamespaceEvidence,
} from './validate-release-source-gate-parts/namespace-evidence.ts';
import { buildCommandEnvironment, releaseEnvironmentProblems } from './validate-release-source-gate-parts/environment.ts';
import {
  canonicalGithubRepository,
  canonicalPath,
  firstLine,
  isFullSha,
  normalizedSha,
  remoteHeadSha,
  resolveGitRef,
  sameSha,
  statusTextWithoutDeclaredFrameworkCheckout,
} from './validate-release-source-gate-parts/git-ref-status.ts';
import {
  canonicalAppOwner,
  canonicalAppRepository,
  ownerReleaseNamespacePageLimit,
  ownerReleaseNamespacePageSize,
} from './validate-release-source-gate-parts/types.ts';
import type {
  Check,
  CommandOptions,
  CommandResult,
  CommandRunner,
  GithubOwnerReleaseNamespaceEvidence,
  ReleaseSourceGateEnvironment,
  ReleaseSourceGateOptions,
  ReleaseSourceGateReport,
} from './validate-release-source-gate-parts/types.ts';
export {
  createGithubOwnerReleaseNamespaceEvidence,
  validateGithubOwnerReleaseNamespaceEvidence,
} from './validate-release-source-gate-parts/namespace-evidence.ts';
export type {
  CommandRunner,
  GithubOwnerReleaseAsset,
  GithubOwnerDraftReservation,
  GithubOwnerReleaseNamespaceEvidence,
  ReleaseSourceGateOptions,
  ReleaseSourceGateEnvironment,
  ReleaseSourceGateReport,
} from './validate-release-source-gate-parts/types.ts';

function usage(): void {
  process.stdout.write(`Usage:
  npm run release:source-gate -- --version <version> --app-ref <sha> --shell-ref <ref> --framework-ref <ref>

Options:
  --version <version>              Release version for the candidate cohort.
  --operation-fingerprint <value>  Version-independent admitted operation identity.
  --app-ref <sha>                  Expected App repository HEAD commit.
  --expected-app-head <sha>        Alias for --app-ref.
  --shell-ref <ref>                Active Shell ref resolved through the App adapter. Default: main.
  --framework-ref <ref>            OPL Framework ref to resolve. Default: main.
  --require-shell-format <bool>    Run the active Shell source-quality check. Default: false.
  --run-shell-tests <bool>         Run active shell node/dom tests before expensive release jobs. Default: false.
  --repo-root <path>               App repository root. Default: current script repository.
  --shell-root <path>              Active shell checkout root. Default: frozen App adapter checkout path.
  --framework-root <path>          OPL Framework checkout root. Default: ../one-person-lab.
  --output <path>                  Write source gate JSON report.
  --json                          Print the JSON report to stdout.
  --help                          Show this message.
`);
}

function defaultOptions(): ReleaseSourceGateOptions {
  return {
    version: process.env.OPL_RELEASE_VERSION || null,
    operationFingerprint: process.env.OPL_RELEASE_OPERATION_FINGERPRINT || null,
    expectedAppHead: process.env.OPL_EXPECTED_APP_HEAD || process.env.GITHUB_SHA || '',
    shellRef: process.env.OPL_SHELL_REF || 'main',
    frameworkRef: process.env.OPL_FRAMEWORK_REF || 'main',
    requireShellFormat: parseStrictBoolean(process.env.OPL_REQUIRE_SHELL_FORMAT, false),
    runShellTests: parseStrictBoolean(process.env.OPL_RELEASE_SOURCE_GATE_RUN_SHELL_TESTS, false),
    repoRoot: defaultRepoRoot,
    shellRoot: process.env.OPL_SHELL_ROOT || path.join(defaultRepoRoot, readActiveShellBuildProfile(defaultRepoRoot).root),
    frameworkRoot: process.env.OPL_FRAMEWORK_ROOT || path.resolve(defaultRepoRoot, '..', 'one-person-lab'),
    output: process.env.OPL_RELEASE_SOURCE_GATE_OUTPUT || '',
    json: false,
  };
}

export function parseReleaseSourceGateArgs(argv: string[]): ReleaseSourceGateOptions {
  const parsed = defaultOptions();
  const { values, tokens } = parseNodeArgs({
    args: argv,
    tokens: true,
    options: {
      version: { type: 'string' },
      'operation-fingerprint': { type: 'string' },
      'app-ref': { type: 'string' },
      'expected-app-head': { type: 'string' },
      'shell-ref': { type: 'string' },
      'framework-ref': { type: 'string' },
      'require-shell-format': { type: 'string' },
      'run-shell-tests': { type: 'string' },
      'repo-root': { type: 'string' },
      'shell-root': { type: 'string' },
      'framework-root': { type: 'string' },
      output: { type: 'string' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    usage();
    process.exit(0);
  }
  parsed.version = values.version ?? parsed.version;
  parsed.operationFingerprint = values['operation-fingerprint'] ?? parsed.operationFingerprint;
  const expectedAppHeadToken = tokens
    .filter((token) => token.kind === 'option' && (token.name === 'app-ref' || token.name === 'expected-app-head'))
    .at(-1);
  parsed.expectedAppHead = expectedAppHeadToken?.value ?? parsed.expectedAppHead;
  parsed.shellRef = values['shell-ref'] ?? parsed.shellRef;
  parsed.frameworkRef = values['framework-ref'] ?? parsed.frameworkRef;
  if (values['require-shell-format'] !== undefined) {
    parsed.requireShellFormat = parseStrictBoolean(values['require-shell-format']);
  }
  if (values['run-shell-tests'] !== undefined) {
    parsed.runShellTests = parseStrictBoolean(values['run-shell-tests']);
  }
  parsed.repoRoot = values['repo-root'] ?? parsed.repoRoot;
  parsed.shellRoot = values['shell-root'] ?? process.env.OPL_SHELL_ROOT ?? path.join(parsed.repoRoot, readActiveShellBuildProfile(parsed.repoRoot).root);
  parsed.frameworkRoot = values['framework-root'] ?? parsed.frameworkRoot;
  parsed.output = values.output ?? parsed.output;
  parsed.json = values.json ?? parsed.json;

  if (
    (!parsed.version || !parsed.version.trim())
    && (!parsed.operationFingerprint || !parsed.operationFingerprint.trim())
  ) {
    throw new Error('Pass --version <version> or --operation-fingerprint <value>.');
  }
  if (parsed.version && !parsed.version.trim()) parsed.version = null;
  if (parsed.operationFingerprint && !parsed.operationFingerprint.trim()) parsed.operationFingerprint = null;
  if (
    parsed.operationFingerprint
    && !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/.test(parsed.operationFingerprint)
  ) {
    throw new Error('operation-fingerprint is not canonical.');
  }
  if (!parsed.expectedAppHead.trim()) {
    throw new Error('Pass --app-ref <sha>/--expected-app-head <sha> or set OPL_EXPECTED_APP_HEAD/GITHUB_SHA.');
  }
  if (!parsed.shellRef.trim()) throw new Error('Pass --shell-ref <ref> or set OPL_SHELL_REF.');
  if (!parsed.frameworkRef.trim()) throw new Error('Pass --framework-ref <ref> or set OPL_FRAMEWORK_REF.');
  return {
    ...parsed,
    version: parsed.version,
    operationFingerprint: parsed.operationFingerprint,
    repoRoot: path.resolve(parsed.repoRoot),
    shellRoot: path.resolve(parsed.shellRoot),
    frameworkRoot: path.resolve(parsed.frameworkRoot),
    output: parsed.output ? path.resolve(parsed.output) : '',
  };
}

function run(command: string, args: string[], options: CommandOptions): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env ?? process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function commandText(command: string, args: string[]): string {
  return [command, ...args].join(' ');
}

function commandDetail(result: CommandResult): string {
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
}

function addCheck(checks: Check[], check: Check): void {
  checks.push(check);
}

function managedUpdateProviderMap(releaseChannel: any): Record<string, string> {
  const lifecycle = releaseChannel?.managed_update_plane?.software_lifecycle;
  const keys = lifecycle?.public_component_keys;
  if (!Array.isArray(keys)) throw new Error('App release channel is missing managed update public component keys.');
  return Object.fromEntries(keys.map((componentId) => [componentId, lifecycle.objects?.[componentId]?.provider_id]));
}

function frameworkManagedUpdateProviderMap(contract: any): Record<string, string> {
  if (!Array.isArray(contract?.providers)) throw new Error('Framework managed update contract is missing providers.');
  return Object.fromEntries(contract.providers.map((provider) => [provider.lifecycle_owner, provider.provider_id]));
}

export function buildReleaseSourceGateReport(
  options: ReleaseSourceGateOptions,
  runner: CommandRunner = run,
  generatedAt = new Date().toISOString(),
  environment: ReleaseSourceGateEnvironment = {},
): ReleaseSourceGateReport {
  const pathExists = environment.pathExists ?? fs.existsSync;
  const readJson = environment.readJson ?? ((candidatePath: string) => JSON.parse(fs.readFileSync(candidatePath, 'utf8')));
  const sourceEnvironment = environment.variables ?? process.env;
  const commandEnvironment = buildCommandEnvironment(sourceEnvironment, options);
  // Authentication belongs only to the read-only GitHub owner probes, never
  // to dependency scripts, Shell tests, or the persisted gate report.
  const ownerReadEnvironment = { ...commandEnvironment };
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_CONFIG_DIR']) {
    if (sourceEnvironment[name] !== undefined) ownerReadEnvironment[name] = sourceEnvironment[name];
  }
  const shellRoot = options.shellRoot;
  const buildProfile = readActiveShellBuildProfile(options.repoRoot, readJson);
  const formatCommand = buildProfile.id === 'opl-studio'
    ? { executable: 'npm', args: ['run', 'typecheck'], label: 'npm run typecheck' }
    : { executable: 'bun', args: ['run', 'format:check'], label: 'bun run format:check' };
  const frameworkRoot = options.frameworkRoot;
  let appHead = '';
  let shellSha: string | null = null;
  let frameworkSha: string | null = null;
  let ownerReleaseNamespace: GithubOwnerReleaseNamespaceEvidence | null = null;
  const checks: Check[] = [];
  const requiredGates: RequiredGate[] = [
    {
      id: 'app_release_boundary_contract',
      required: true,
      command: 'OPL_RELEASE_VALIDATION_PROFILE=stable npm run validate:release-boundary',
      cwd: options.repoRoot,
      executed: false,
      reason: 'Release source gate must prove the App-owned release boundary before expensive release work.',
    },
    {
      id: 'framework_release_cli_consumer',
      required: true,
      command: 'node --experimental-strip-types scripts/validate-framework-release-cli-consumer.ts',
      cwd: options.repoRoot,
      executed: false,
      reason: 'Release source gate must install an isolated exact Framework archive, generate its CLI surface, and run the release checkpoint consumer.',
    },
    {
      id: 'shell_product_profile_consumer',
      required: true,
      command: 'node --experimental-strip-types scripts/validate-shell-product-profile-consumer.ts',
      cwd: options.repoRoot,
      executed: false,
      reason: 'Release source gate must project the current App profile into an isolated exact Shell archive and run the real consumer test.',
    },
    {
      id: 'active_shell_format_check',
      required: true,
      command: formatCommand.label,
      cwd: shellRoot,
      executed: false,
      reason: 'Release source gate must prove or require active shell formatting before expensive release work.',
    },
    {
      id: 'active_shell_node_dom_tests',
      required: true,
      command: 'node --experimental-strip-types scripts/run-active-shell-tests.ts --project all --max-workers 1',
      cwd: options.repoRoot,
      executed: false,
      reason: 'Release source gate must catch active shell node/dom regressions before expensive release work.',
    },
  ];

  const finish = (
    admissionFailedCheckIds: string[],
    blocker: SourceGateBlocker | null,
  ): ReleaseSourceGateReport => {
    const immutableCohort = admissionFailedCheckIds.length === 0 && appHead && shellSha && frameworkSha
      ? {
          version: options.version,
          operation_fingerprint: options.operationFingerprint,
          app_sha: normalizedSha(appHead),
          shell_sha: shellSha,
          framework_sha: frameworkSha,
        }
      : null;
    return {
      schema: 'opl_app_release_source_gate.v1',
      generated_at: generatedAt,
      status: checks.every((check) => check.status === 'passed') ? 'passed' : 'failed',
      repo_root: options.repoRoot,
      version: options.version,
      operation_fingerprint: options.operationFingerprint,
      expected_app_head: options.expectedAppHead,
      app_head: appHead || null,
      shell_ref: options.shellRef,
      shell_sha: shellSha,
      shell_root: shellRoot,
      framework_ref: options.frameworkRef,
      framework_sha: frameworkSha,
      framework_root: frameworkRoot,
      require_shell_format: options.requireShellFormat,
      run_shell_tests: options.runShellTests,
      owner_release_namespace: ownerReleaseNamespace,
      admission: {
        status: admissionFailedCheckIds.length === 0 ? 'passed' : 'blocked',
        immutable_cohort: immutableCohort,
        failed_check_ids: admissionFailedCheckIds,
        next_action: admissionFailedCheckIds.length === 0 ? 'run_required_source_gates' : 'repair_pre_admission',
      },
      typed_blocker: blocker,
      checks,
      required_gates: requiredGates,
    };
  };
  const blockRequiredGate = (id: RequiredGate['id'], reason: string): void => {
    addCheck(checks, {
      id,
      status: 'blocked',
      message: reason,
      command: requiredGates.find((gate) => gate.id === id)?.command,
    });
  };

  const environmentProblems = releaseEnvironmentProblems(sourceEnvironment, options);
  addCheck(checks, {
    id: 'release_environment_whitelist',
    status: environmentProblems.length === 0 ? 'passed' : 'failed',
    message: environmentProblems.length === 0
      ? 'Release commands will run with the explicit source-gate environment allowlist; ambient controller identity is not inherited.'
      : `Release environment is not admissible: ${environmentProblems.join('; ')}.`,
    actual: environmentProblems.length > 0 ? environmentProblems.join(', ') : undefined,
  });
  const preparationFailure = environment.preparationFailure?.trim() || '';
  if (preparationFailure) {
    addCheck(checks, {
      id: 'active_shell_checkout_preparation',
      status: 'failed',
      message: `Active shell checkout preparation failed before source-gate admission. ${preparationFailure}`,
      actual: preparationFailure,
    });
  }

  const repoRootResult = runner('git', ['rev-parse', '--show-toplevel'], { cwd: options.repoRoot, env: commandEnvironment });
  const resolvedRepoRoot = repoRootResult.status === 0 ? firstLine(repoRootResult.stdout) : '';
  addCheck(checks, {
    id: 'app_repo_root',
    status: resolvedRepoRoot && canonicalPath(resolvedRepoRoot) === canonicalPath(options.repoRoot) ? 'passed' : 'failed',
    message: resolvedRepoRoot && canonicalPath(resolvedRepoRoot) === canonicalPath(options.repoRoot)
      ? `App repository root is ${resolvedRepoRoot}.`
      : `Declared App repository root ${options.repoRoot} does not match git top-level ${resolvedRepoRoot || '(unresolved)'}.`,
    expected: canonicalPath(options.repoRoot),
    actual: resolvedRepoRoot || undefined,
    command: commandText('git', ['rev-parse', '--show-toplevel']),
  });

  const originResult = runner('git', ['remote', 'get-url', 'origin'], { cwd: options.repoRoot, env: commandEnvironment });
  const originUrl = originResult.status === 0 ? firstLine(originResult.stdout) : '';
  const originRepository = originUrl ? canonicalGithubRepository(originUrl) : null;
  addCheck(checks, {
    id: 'app_origin_repository',
    status: originRepository === canonicalAppRepository ? 'passed' : 'failed',
    message: originRepository === canonicalAppRepository
      ? `App origin is canonical ${canonicalAppRepository}.`
      : `App origin must resolve to ${canonicalAppRepository}, got ${originUrl || '(unresolved)'}.`,
    expected: canonicalAppRepository,
    actual: originUrl || undefined,
    command: commandText('git', ['remote', 'get-url', 'origin']),
  });

  const ownerIdentityArgs = ['api', 'user'];
  const ownerRepositoryArgs = ['api', `repos/${canonicalAppRepository}`];
  try {
    if (originRepository !== canonicalAppRepository) {
      throw new Error('canonical App origin is not established');
    }
    const ownerIdentityResult = runner('gh', ownerIdentityArgs, {
      cwd: options.repoRoot,
      env: ownerReadEnvironment,
    });
    const ownerRepositoryResult = runner('gh', ownerRepositoryArgs, {
      cwd: options.repoRoot,
      env: ownerReadEnvironment,
    });
    if (ownerIdentityResult.status !== 0 || ownerRepositoryResult.status !== 0) {
      throw new Error(
        commandDetail(ownerIdentityResult)
        || commandDetail(ownerRepositoryResult)
        || 'owner identity or repository permission read failed',
      );
    }
    const releasePages: unknown[] = [];
    for (let page = 1; page <= ownerReleaseNamespacePageLimit; page += 1) {
      const releaseArgs = [
        'api',
        '-X',
        'GET',
        `repos/${canonicalAppRepository}/releases`,
        '-f',
        `per_page=${ownerReleaseNamespacePageSize}`,
        '-f',
        `page=${page}`,
      ];
      const releaseResult = runner('gh', releaseArgs, {
        cwd: options.repoRoot,
        env: ownerReadEnvironment,
      });
      if (releaseResult.status !== 0) {
        throw new Error(commandDetail(releaseResult) || `release namespace page ${page} read failed`);
      }
      const releasePage = JSON.parse(releaseResult.stdout) as unknown;
      if (!Array.isArray(releasePage) || releasePage.length > ownerReleaseNamespacePageSize) {
        throw new Error(`Owner release namespace page ${page} is malformed.`);
      }
      releasePages.push(releasePage);
      if (releasePage.length < ownerReleaseNamespacePageSize) break;
      if (page === ownerReleaseNamespacePageLimit) {
        throw new Error(
          `Owner release namespace pagination remained full after ${ownerReleaseNamespacePageLimit} pages.`,
        );
      }
    }
    ownerReleaseNamespace = createGithubOwnerReleaseNamespaceEvidence({
      repository: canonicalAppRepository,
      checkedAt: generatedAt,
      authenticatedUser: JSON.parse(ownerIdentityResult.stdout),
      repositoryObservation: JSON.parse(ownerRepositoryResult.stdout),
      releasePages,
    });
    addCheck(checks, {
      id: 'github_owner_release_namespace',
      status: 'passed',
      message: 'Owner-authenticated controller readback binds the complete Release collection and exact draft reservations before nonce issuance.',
      expected: `owner=${canonicalAppOwner}; complete=true`,
      actual: `releases=${ownerReleaseNamespace.pagination.release_count}; drafts=${ownerReleaseNamespace.draft_reservations.length}; evidence=${ownerReleaseNamespace.evidence_digest}`,
      command: `${commandText('gh', ownerIdentityArgs)}; ${commandText('gh', ownerRepositoryArgs)}; paginated releases`,
    });
  } catch (error) {
    ownerReleaseNamespace = null;
    addCheck(checks, {
      id: 'github_owner_release_namespace',
      status: 'failed',
      message: `GitHub Release namespace must be completely owner-read and digest-bound before nonce issuance. ${
        error instanceof Error ? error.message : String(error)
      }`,
      expected: `owner=${canonicalAppOwner}; complete=true`,
      command: `${commandText('gh', ownerIdentityArgs)}; ${commandText('gh', ownerRepositoryArgs)}; paginated releases`,
    });
  }

  const appHeadResult = runner('git', ['rev-parse', 'HEAD'], { cwd: options.repoRoot, env: commandEnvironment });
  appHead = appHeadResult.status === 0 ? firstLine(appHeadResult.stdout) : '';
  if (!isFullSha(appHead)) {
    addCheck(checks, {
      id: 'app_head_resolved',
      status: 'failed',
      message: `Unable to resolve App HEAD to a full commit SHA.${commandDetail(appHeadResult) ? ` ${commandDetail(appHeadResult)}` : ''}`,
      command: commandText('git', ['rev-parse', 'HEAD']),
    });
  } else {
    appHead = normalizedSha(appHead);
    addCheck(checks, {
      id: 'app_head_resolved',
      status: 'passed',
      message: `Resolved App HEAD ${appHead}.`,
      actual: appHead,
      command: commandText('git', ['rev-parse', 'HEAD']),
    });
  }

  addCheck(checks, {
    id: 'expected_app_head',
    status: sameSha(options.expectedAppHead, appHead) ? 'passed' : 'failed',
    message: sameSha(options.expectedAppHead, appHead)
      ? 'App HEAD exactly matches the immutable expected App commit.'
      : `Expected App commit must be a full SHA exactly matching HEAD; got ${options.expectedAppHead}.`,
    expected: options.expectedAppHead,
    actual: appHead || undefined,
    command: commandText('git', ['rev-parse', 'HEAD']),
  });

  const remoteMainResult = runner('git', ['ls-remote', '--heads', 'origin', 'refs/heads/main'], {
    cwd: options.repoRoot,
    env: commandEnvironment,
  });
  const remoteMainSha = remoteHeadSha(remoteMainResult, 'refs/heads/main');
  addCheck(checks, {
    id: 'app_remote_main_resolved',
    status: remoteMainSha ? 'passed' : 'failed',
    message: remoteMainSha
      ? `Live origin/main resolves to ${remoteMainSha}.`
      : `Unable to resolve live origin/main.${commandDetail(remoteMainResult) ? ` ${commandDetail(remoteMainResult)}` : ''}`,
    actual: remoteMainSha ?? undefined,
    command: commandText('git', ['ls-remote', '--heads', 'origin', 'refs/heads/main']),
  });
  addCheck(checks, {
    id: 'app_frozen_commit_reachable',
    status: (
      remoteMainSha !== null
      && isFullSha(options.expectedAppHead)
      && runner('git', ['merge-base', '--is-ancestor', options.expectedAppHead, remoteMainSha], {
        cwd: options.repoRoot,
        env: commandEnvironment,
      }).status === 0
    ) ? 'passed' : 'failed',
    message: remoteMainSha !== null
      ? 'The frozen App commit remains reachable from live origin/main; live head advancement does not invalidate the admitted cohort.'
      : 'Stable admission requires a resolvable live origin/main to prove frozen commit reachability.',
    expected: remoteMainSha ?? 'live origin/main',
    actual: options.expectedAppHead,
    command: commandText('git', ['merge-base', '--is-ancestor', options.expectedAppHead, remoteMainSha ?? 'origin/main']),
  });

  const appStatusResult = runner('git', ['status', '--porcelain', '--untracked-files=normal'], {
    cwd: options.repoRoot,
    env: commandEnvironment,
  });
  const rawStatusText = appStatusResult.stdout.trim();
  const statusText = statusTextWithoutDeclaredFrameworkCheckout(rawStatusText, options.repoRoot, frameworkRoot);
  addCheck(checks, {
    id: 'app_worktree_clean',
    status: appStatusResult.status === 0 && !statusText ? 'passed' : 'failed',
    message: appStatusResult.status === 0 && !statusText
      ? 'App worktree is clean apart from declared release source checkouts.'
      : `App worktree must be clean before release work.${statusText ? ` Dirty entries:\n${statusText}` : ''}`,
    actual: statusText || undefined,
    command: commandText('git', ['status', '--porcelain', '--untracked-files=normal']),
  });

  if (!pathExists(shellRoot)) {
    addCheck(checks, {
      id: 'active_shell_checkout',
      status: 'failed',
      message: `Active shell checkout is missing at ${shellRoot}.`,
    });
  } else {
    const shellTopLevelResult = runner('git', ['rev-parse', '--show-toplevel'], {
      cwd: shellRoot,
      env: commandEnvironment,
    });
    const shellTopLevel = shellTopLevelResult.status === 0 ? firstLine(shellTopLevelResult.stdout) : '';
    const standaloneShellCheckout = Boolean(
      shellTopLevel && canonicalPath(shellTopLevel) === canonicalPath(shellRoot),
    );
    addCheck(checks, {
      id: 'active_shell_checkout',
      status: standaloneShellCheckout ? 'passed' : 'failed',
      message: standaloneShellCheckout
        ? `Active shell checkout is a standalone Git checkout at ${shellRoot}.`
        : `Active shell root ${shellRoot} must be a standalone Git checkout; archive snapshots are valid only for isolated consumer projections.${commandDetail(shellTopLevelResult) ? ` ${commandDetail(shellTopLevelResult)}` : ''}`,
      expected: canonicalPath(shellRoot),
      actual: shellTopLevel || undefined,
      command: commandText('git', ['rev-parse', '--show-toplevel']),
    });
    shellSha = standaloneShellCheckout
      ? resolveGitRef(shellRoot, options.shellRef, runner, commandEnvironment)
      : null;
    addCheck(checks, {
      id: 'active_shell_ref_resolved',
      status: shellSha ? 'passed' : 'failed',
      message: shellSha
        ? `Active shell ref ${options.shellRef} resolves to ${shellSha}.`
        : `Active shell ref ${options.shellRef} cannot be resolved in ${shellRoot}.`,
      expected: options.shellRef,
      actual: shellSha ?? undefined,
      command: commandText('git', ['rev-parse', '--verify', '--quiet', `${options.shellRef}^{commit}`]),
    });
    const shellHeadResult = standaloneShellCheckout
      ? runner('git', ['rev-parse', 'HEAD'], { cwd: shellRoot, env: commandEnvironment })
      : { status: 1, stdout: '', stderr: 'active shell root is not a standalone Git checkout' };
    const shellHead = shellHeadResult.status === 0 ? firstLine(shellHeadResult.stdout) : '';
    addCheck(checks, {
      id: 'active_shell_checkout_identity',
      status: shellSha !== null && sameSha(shellHead, shellSha) ? 'passed' : 'failed',
      message: shellSha !== null && sameSha(shellHead, shellSha)
        ? 'Active shell checkout HEAD matches the resolved immutable shell SHA.'
        : 'Active shell checkout HEAD must exactly match the resolved shell SHA before cohort admission.',
      expected: shellSha ?? options.shellRef,
      actual: shellHead || undefined,
      command: commandText('git', ['rev-parse', 'HEAD']),
    });
    try {
      const packageJson = readJson(path.join(shellRoot, 'package.json')) as { name?: unknown };
      addCheck(checks, {
        id: 'active_shell_type',
        status: packageJson?.name === buildProfile.packageName ? 'passed' : 'failed',
        message: packageJson?.name === buildProfile.packageName
          ? `Active shell package type is ${buildProfile.packageName}.`
          : `Active shell package name must be ${buildProfile.packageName}, got ${String(packageJson?.name ?? 'missing')}.`,
        expected: buildProfile.packageName,
        actual: typeof packageJson?.name === 'string' ? packageJson.name : undefined,
      });
    } catch (error) {
      addCheck(checks, {
        id: 'active_shell_type',
        status: 'failed',
        message: `Unable to read active shell package.json.${error instanceof Error ? ` ${error.message}` : ''}`,
        expected: buildProfile.packageName,
      });
    }
    if (environmentProblems.length === 0 && shellSha && sameSha(shellHead, shellSha) && checks.find((check) => check.id === 'active_shell_type')?.status === 'passed') {
      // Use the frozen carrier's admission policy, not an App-owned Node floor.
      // Probe PATH Node because npm and the Shell test scripts use that binary.
      try {
        const adapter = readJson(path.join(options.repoRoot, 'contracts/app-shell-adapter.json')) as {
          shell_contract?: { paths?: { desktop_release_carrier_manifest?: string } };
        };
        const shellPath = (relative: unknown): string => {
          if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) {
            throw new Error('Carrier preparation paths must be Shell-relative.');
          }
          return path.join(shellRoot, relative);
        };
        const carrier = readJson(shellPath(adapter.shell_contract?.paths?.desktop_release_carrier_manifest)) as { node_host_runtime?: string };
        const runtimeUrl = pathToFileURL(shellPath(carrier.node_host_runtime)).href;
        const args = ['--input-type=module', '--eval', `import { assertPatchedHostNode } from ${JSON.stringify(runtimeUrl)}; assertPatchedHostNode(process.versions.node); console.log(process.versions.node);`];
        const result = runner('node', args, { cwd: shellRoot, env: commandEnvironment });
        addCheck(checks, {
          id: 'active_shell_host_node_pre_admission',
          status: result.status === 0 ? 'passed' : 'failed',
          message: result.status === 0
            ? `PATH Node ${firstLine(result.stdout)} is admitted by the frozen Shell carrier.`
            : `Select a Node runtime admitted by the frozen Shell carrier before source gates. ${commandDetail(result)}`,
          command: commandText('node', args),
        });
      } catch (error) {
        addCheck(checks, {
          id: 'active_shell_host_node_pre_admission',
          status: 'failed',
          message: `Unable to check the frozen Shell carrier's Node admission. ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      const dependencyArgs = ['--offline', 'ls', '--depth=0', '--include=dev', '--json'];
      const dependencies = runner('npm', dependencyArgs, { cwd: shellRoot, env: commandEnvironment });
      addCheck(checks, {
        id: 'active_shell_direct_dependencies_pre_admission',
        status: dependencies.status === 0 ? 'passed' : 'failed',
        message: dependencies.status === 0
          ? 'Installed Shell direct dependencies satisfy its frozen package manifest.'
          : `Repair installed Shell dependencies with the frozen lockfile before source gates. ${commandDetail(dependencies)}`,
        command: commandText('npm', dependencyArgs),
      });
    }
  }

  if (!pathExists(frameworkRoot)) {
    addCheck(checks, {
      id: 'framework_checkout',
      status: 'failed',
      message: `OPL Framework checkout is missing at ${frameworkRoot}.`,
    });
  } else {
    addCheck(checks, {
      id: 'framework_checkout',
      status: 'passed',
      message: `OPL Framework checkout exists at ${frameworkRoot}.`,
    });
    frameworkSha = resolveGitRef(frameworkRoot, options.frameworkRef, runner, commandEnvironment);
    addCheck(checks, {
      id: 'framework_ref_resolved',
      status: frameworkSha ? 'passed' : 'failed',
      message: frameworkSha
        ? `OPL Framework ref ${options.frameworkRef} resolves to ${frameworkSha}.`
        : `OPL Framework ref ${options.frameworkRef} cannot be resolved in ${frameworkRoot}.`,
      expected: options.frameworkRef,
      actual: frameworkSha ?? undefined,
      command: commandText('git', ['rev-parse', '--verify', '--quiet', `${options.frameworkRef}^{commit}`]),
    });
    const frameworkHeadResult = runner('git', ['rev-parse', 'HEAD'], { cwd: frameworkRoot, env: commandEnvironment });
    const frameworkHead = frameworkHeadResult.status === 0 ? firstLine(frameworkHeadResult.stdout) : '';
    addCheck(checks, {
      id: 'framework_checkout_identity',
      status: frameworkSha !== null && sameSha(frameworkHead, frameworkSha) ? 'passed' : 'failed',
      message: frameworkSha !== null && sameSha(frameworkHead, frameworkSha)
        ? 'OPL Framework checkout HEAD matches the resolved immutable Framework SHA.'
        : 'OPL Framework checkout HEAD must exactly match the resolved Framework SHA before cohort admission.',
      expected: frameworkSha ?? options.frameworkRef,
      actual: frameworkHead || undefined,
      command: commandText('git', ['rev-parse', 'HEAD']),
    });
    try {
      const appProviders = managedUpdateProviderMap(
        readJson(path.join(options.repoRoot, 'contracts', 'app-release-channel.json')),
      );
      const frameworkProviders = frameworkManagedUpdateProviderMap(
        readJson(path.join(frameworkRoot, 'contracts', 'opl-framework', 'managed-update-kernel-contract.json')),
      );
      const aligned = Object.keys(appProviders).length === Object.keys(frameworkProviders).length
        && Object.entries(appProviders).every(([componentId, providerId]) => frameworkProviders[componentId] === providerId);
      addCheck(checks, {
        id: 'managed_update_provider_contract_aligned',
        status: aligned ? 'passed' : 'failed',
        message: aligned
          ? 'App managed update lifecycle objects match Framework provider identities.'
          : 'App managed update lifecycle provider identities drift from the Framework contract.',
        expected: JSON.stringify(appProviders),
        actual: JSON.stringify(frameworkProviders),
      });
    } catch (error) {
      addCheck(checks, {
        id: 'managed_update_provider_contract_aligned',
        status: 'failed',
        message: `Unable to compare App and Framework managed update provider contracts.${error instanceof Error ? ` ${error.message}` : ''}`,
      });
    }
  }

  addCheck(checks, {
    id: 'active_shell_format_pre_admission',
    status: options.requireShellFormat ? 'passed' : 'blocked',
    message: options.requireShellFormat
      ? 'Active shell format check is admitted as a required source gate.'
      : 'Active shell format check is required; rerun pre-admission with --require-shell-format true.',
    expected: 'true',
    actual: String(options.requireShellFormat),
  });
  addCheck(checks, {
    id: 'active_shell_node_dom_pre_admission',
    status: options.runShellTests ? 'passed' : 'blocked',
    message: options.runShellTests
      ? 'Active shell node/dom tests are admitted as a required source gate.'
      : 'Active shell node/dom tests are required; rerun pre-admission with --run-shell-tests true.',
    expected: 'true',
    actual: String(options.runShellTests),
  });
  const cohortIdentityReady = sameSha(options.expectedAppHead, appHead)
    && shellSha !== null
    && frameworkSha !== null
    && isFullSha(shellSha)
    && isFullSha(frameworkSha);
  addCheck(checks, {
    id: 'immutable_cohort_identity',
    status: cohortIdentityReady ? 'passed' : 'failed',
    message: cohortIdentityReady
      ? `Immutable cohort frozen at App ${appHead}, Shell ${shellSha}, Framework ${frameworkSha}.`
      : 'App, Shell, and Framework must each resolve to an exact 40-character SHA before source-gate execution.',
  });

  const admissionFailedCheckIds = checks
    .filter((check) => check.status !== 'passed')
    .map((check) => check.id);
  if (admissionFailedCheckIds.length > 0) {
    const blockedReason = preparationFailure
      ? `Active shell checkout preparation failed before source-gate admission: ${preparationFailure} Required source gates were not run; repair preparation and admit a new immutable cohort.`
      : 'Required source gates were not run because pre-admission failed; repair pre-admission and admit a new immutable cohort.';
    blockRequiredGate('app_release_boundary_contract', blockedReason);
    blockRequiredGate('shell_product_profile_consumer', blockedReason);
    blockRequiredGate('framework_release_cli_consumer', blockedReason);
    blockRequiredGate('active_shell_format_check', blockedReason);
    blockRequiredGate('active_shell_node_dom_tests', blockedReason);
    return finish(admissionFailedCheckIds, {
      schema: 'opl_app_release_source_gate_blocker.v1',
      phase: 'pre_admission',
      blocker_kind: 'pre_admission_failed',
      failed_check_ids: admissionFailedCheckIds,
      next_action: 'repair_pre_admission',
      reason: blockedReason,
    });
  }

  commandEnvironment.OPL_SHELL_REF = shellSha!;
  commandEnvironment.OPL_FRAMEWORK_REF = frameworkSha!;
  requiredGates[0].executed = true;
  const releaseBoundaryResult = runner('npm', ['run', 'validate:release-boundary'], {
    cwd: options.repoRoot,
    env: {
      ...commandEnvironment,
      OPL_RELEASE_VALIDATION_PROFILE: 'stable',
    },
  });
  addCheck(checks, {
    id: 'app_release_boundary_contract',
    status: releaseBoundaryResult.status === 0 ? 'passed' : 'failed',
    message: releaseBoundaryResult.status === 0
      ? 'App release-boundary contract passed.'
      : `App release-boundary contract failed.${commandDetail(releaseBoundaryResult) ? `\n${commandDetail(releaseBoundaryResult)}` : ''}`,
    command: 'npm run validate:release-boundary',
  });
  if (releaseBoundaryResult.status !== 0) {
    blockRequiredGate('shell_product_profile_consumer', 'Blocked because the preceding App release-boundary gate failed.');
    blockRequiredGate('framework_release_cli_consumer', 'Blocked because the preceding App release-boundary gate failed.');
    blockRequiredGate('active_shell_format_check', 'Blocked because the preceding App release-boundary gate failed.');
    blockRequiredGate('active_shell_node_dom_tests', 'Blocked because the preceding App release-boundary gate failed.');
    return finish([], {
      schema: 'opl_app_release_source_gate_blocker.v1',
      phase: 'required_gate_execution',
      blocker_kind: 'required_gate_failed',
      failed_check_ids: ['app_release_boundary_contract'],
      next_action: 'repair_source_gate',
      reason: 'Repair the App release-boundary failure before rerunning the same immutable cohort source gate.',
    });
  }

  const frameworkReleaseCliConsumerArgs = [
    '--experimental-strip-types',
    'scripts/validate-framework-release-cli-consumer.ts',
    '--framework-root',
    frameworkRoot,
    '--expected-framework-sha',
    frameworkSha!,
  ];
  requiredGates[1].executed = true;
  const frameworkReleaseCliConsumerResult = runner(process.execPath, frameworkReleaseCliConsumerArgs, {
    cwd: options.repoRoot,
    env: commandEnvironment,
  });
  addCheck(checks, {
    id: 'framework_release_cli_consumer',
    status: frameworkReleaseCliConsumerResult.status === 0 ? 'passed' : 'failed',
    message: frameworkReleaseCliConsumerResult.status === 0
      ? 'Exact Framework host release CLI passed in an isolated archive; optional Profile Package delivery is independent.'
      : `Exact Framework release CLI consumer failed.${commandDetail(frameworkReleaseCliConsumerResult) ? `\n${commandDetail(frameworkReleaseCliConsumerResult)}` : ''}`,
    command: commandText('node', frameworkReleaseCliConsumerArgs.slice(1)),
  });
  if (frameworkReleaseCliConsumerResult.status !== 0) {
    blockRequiredGate('shell_product_profile_consumer', 'Blocked because the Framework release CLI consumer gate failed.');
    blockRequiredGate('active_shell_format_check', 'Blocked because the Framework release CLI consumer gate failed.');
    blockRequiredGate('active_shell_node_dom_tests', 'Blocked because the Framework release CLI consumer gate failed.');
    return finish([], {
      schema: 'opl_app_release_source_gate_blocker.v1',
      phase: 'required_gate_execution',
      blocker_kind: 'required_gate_failed',
      failed_check_ids: ['framework_release_cli_consumer'],
      next_action: 'repair_source_gate',
      reason: 'Repair the exact Framework generated CLI bootstrap before workflow dispatch.',
    });
  }

  const productProfileConsumerArgs = [
    '--experimental-strip-types',
    'scripts/validate-shell-product-profile-consumer.ts',
    '--shell-root',
    shellRoot,
    '--expected-shell-sha',
    shellSha!,
  ];
  requiredGates[2].executed = true;
  const productProfileConsumerResult = runner(process.execPath, productProfileConsumerArgs, {
    cwd: options.repoRoot,
    env: commandEnvironment,
  });
  addCheck(checks, {
    id: 'shell_product_profile_consumer',
    status: productProfileConsumerResult.status === 0 ? 'passed' : 'failed',
    message: productProfileConsumerResult.status === 0
      ? 'Current App product profile passed the exact Shell consumer in an isolated archive.'
      : `Current App product profile failed the exact Shell consumer.${commandDetail(productProfileConsumerResult) ? `\n${commandDetail(productProfileConsumerResult)}` : ''}`,
    command: commandText('node', productProfileConsumerArgs.slice(1)),
  });
  if (productProfileConsumerResult.status !== 0) {
    blockRequiredGate('active_shell_format_check', 'Blocked because the App-profile Shell consumer gate failed.');
    blockRequiredGate('active_shell_node_dom_tests', 'Blocked because the App-profile Shell consumer gate failed.');
    return finish([], {
      schema: 'opl_app_release_source_gate_blocker.v1',
      phase: 'required_gate_execution',
      blocker_kind: 'required_gate_failed',
      failed_check_ids: ['shell_product_profile_consumer'],
      next_action: 'repair_source_gate',
      reason: 'Repair the App-profile and exact Shell consumer mismatch before workflow dispatch.',
    });
  }

  requiredGates[3].executed = true;
  const formatResult = runner(formatCommand.executable, formatCommand.args, { cwd: shellRoot, env: commandEnvironment });
  addCheck(checks, {
    id: 'active_shell_format_check',
    status: formatResult.status === 0 ? 'passed' : 'failed',
    message: formatResult.status === 0
      ? 'Active shell format check passed.'
      : `Active shell format check failed.${commandDetail(formatResult) ? `\n${commandDetail(formatResult)}` : ''}`,
    command: formatCommand.label,
  });
  if (formatResult.status !== 0) {
    blockRequiredGate('active_shell_node_dom_tests', 'Blocked because the preceding active shell format gate failed.');
    return finish([], {
      schema: 'opl_app_release_source_gate_blocker.v1',
      phase: 'required_gate_execution',
      blocker_kind: 'required_gate_failed',
      failed_check_ids: ['active_shell_format_check'],
      next_action: 'repair_source_gate',
      reason: 'Repair active shell formatting before rerunning the same immutable cohort source gate.',
    });
  }

  const shellTestsArgs = [
    '--experimental-strip-types',
    'scripts/run-active-shell-tests.ts',
    '--project',
    'all',
    '--max-workers',
    '1',
  ];
  requiredGates[4].executed = true;
  const shellTestsResult = runner(process.execPath, shellTestsArgs, { cwd: options.repoRoot, env: commandEnvironment });
  addCheck(checks, {
    id: 'active_shell_node_dom_tests',
    status: shellTestsResult.status === 0 ? 'passed' : 'failed',
    message: shellTestsResult.status === 0
      ? 'Active shell node/dom tests passed before expensive release work.'
      : `Active shell node/dom tests failed before expensive release work.${commandDetail(shellTestsResult) ? `\n${commandDetail(shellTestsResult)}` : ''}`,
    command: commandText('node', shellTestsArgs.slice(1)),
  });
  if (shellTestsResult.status !== 0) {
    return finish([], {
      schema: 'opl_app_release_source_gate_blocker.v1',
      phase: 'required_gate_execution',
      blocker_kind: 'required_gate_failed',
      failed_check_ids: ['active_shell_node_dom_tests'],
      next_action: 'repair_source_gate',
      reason: 'Repair active shell node/dom regressions before rerunning the same immutable cohort source gate.',
    });
  }

  return finish([], null);
}

export function writeReleaseSourceGateReport(options: ReleaseSourceGateOptions, report: ReleaseSourceGateReport): void {
  if (!options.output) return;
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export function prepareReleaseSourceShell(
  options: ReleaseSourceGateOptions,
  sourceEnvironment: NodeJS.ProcessEnv = process.env,
): void {
  // Reject ambient Git selectors before even probing an existing checkout.
  if (releaseEnvironmentProblems(sourceEnvironment, options).length > 0) return;
  // Preserve an existing non-Git projection so the source-gate report can reject it with typed evidence.
  if (fs.existsSync(options.shellRoot) && !isGitCheckout(options.shellRoot)) return;
  const commandEnvironment = buildCommandEnvironment(sourceEnvironment, options);
  const prepared = ensureActiveShellCheckout({
    shellRoot: options.shellRoot,
    repo: sourceEnvironment.OPL_APP_SHELL_REPO || `https://github.com/${readActiveShellBuildProfile(options.repoRoot).repository}.git`,
    ref: options.shellRef,
    alignRef: true,
    runner: (command, args, commandOptions = {}) => run(command, args, {
      cwd: commandOptions.cwd || defaultRepoRoot,
      env: commandEnvironment,
    }),
  });
  if (prepared.materialized || !fs.existsSync(path.join(options.shellRoot, 'node_modules'))) {
    const profile = readActiveShellBuildProfile(options.repoRoot);
    const args = profile.packageManager === 'npm' ? ['ci'] : ['install', '--frozen-lockfile'];
    const installed = run(profile.packageManager, args, { cwd: options.shellRoot, env: commandEnvironment });
    if (installed.status !== 0) throw new Error(`Frozen active Shell dependency install failed: ${commandDetail(installed)}`);
  }
}

function isMainModule(): boolean {
  return import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
}

if (isMainModule()) {
  try {
    const options = parseReleaseSourceGateArgs(process.argv.slice(2));
    let preparationFailure: string | undefined;
    try {
      prepareReleaseSourceShell(options);
    } catch (error) {
      preparationFailure = error instanceof Error ? error.message : String(error);
    }
    const report = buildReleaseSourceGateReport(
      options,
      run,
      undefined,
      preparationFailure ? { preparationFailure } : {},
    );
    writeReleaseSourceGateReport(options, report);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(`Release source gate ${report.status} for ${report.app_head ?? '(unresolved)'}.\n`);
    }
    if (report.status !== 'passed') process.exit(1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
