import {
  canonicalAppRepository,
  type ReleaseSourceGateOptions,
} from './types.ts';

const forbiddenReleaseEnvironmentVariables = [
  'BUN_OPTIONS',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_WORK_TREE',
  'NODE_OPTIONS',
] as const;

const commandEnvironmentAllowlist = new Set([
  'ALL_PROXY',
  'BUN_INSTALL',
  'CI',
  'COLORTERM',
  'FORCE_COLOR',
  'GITHUB_ACTIONS',
  'GITHUB_WORKSPACE',
  'HOME',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'LOGNAME',
  'NO_COLOR',
  'NO_PROXY',
  'NODE_EXTRA_CA_CERTS',
  'PATH',
  'RUNNER_ARCH',
  'RUNNER_OS',
  'RUNNER_TEMP',
  'RUNNER_TOOL_CACHE',
  'SHELL',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'TEMP',
  'TERM',
  'TMP',
  'TMPDIR',
  'USER',
  'XDG_CACHE_HOME',
  'all_proxy',
  'http_proxy',
  'https_proxy',
  'no_proxy',
]);

export function buildCommandEnvironment(source: NodeJS.ProcessEnv, options: ReleaseSourceGateOptions): NodeJS.ProcessEnv {
  const commandEnvironment: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined && commandEnvironmentAllowlist.has(name)) commandEnvironment[name] = value;
  }
  if (options.version !== null) commandEnvironment.OPL_RELEASE_VERSION = options.version;
  if (options.operationFingerprint !== null) {
    commandEnvironment.OPL_RELEASE_OPERATION_FINGERPRINT = options.operationFingerprint;
  }
  commandEnvironment.OPL_APP_REPO_ROOT = options.repoRoot;
  commandEnvironment.OPL_EXPECTED_APP_HEAD = options.expectedAppHead;
  commandEnvironment.OPL_SHELL_ROOT = options.shellRoot;
  commandEnvironment.OPL_APP_SHELL_ROOT = options.shellRoot;
  commandEnvironment.OPL_AION_SHELL_ROOT = options.shellRoot;
  commandEnvironment.OPL_FRAMEWORK_ROOT = options.frameworkRoot;
  commandEnvironment.OPL_REQUIRE_SHELL_FORMAT = String(options.requireShellFormat);
  commandEnvironment.OPL_RELEASE_SOURCE_GATE_RUN_SHELL_TESTS = String(options.runShellTests);
  commandEnvironment.GIT_TERMINAL_PROMPT = '0';
  commandEnvironment.GCM_INTERACTIVE = 'never';
  return commandEnvironment;
}

export function releaseEnvironmentProblems(source: NodeJS.ProcessEnv, options: ReleaseSourceGateOptions): string[] {
  const problems = forbiddenReleaseEnvironmentVariables
    .filter((name) => typeof source[name] === 'string' && source[name]!.trim())
    .map((name) => `${name} must be unset`);
  const exactBindings: Array<[string, string]> = [
    ['OPL_EXPECTED_APP_HEAD', options.expectedAppHead],
    ['OPL_SHELL_REF', options.shellRef],
    ['OPL_FRAMEWORK_REF', options.frameworkRef],
    ['OPL_SHELL_ROOT', options.shellRoot],
    ['OPL_APP_SHELL_ROOT', options.shellRoot],
    ['OPL_AION_SHELL_ROOT', options.shellRoot],
    ['OPL_FRAMEWORK_ROOT', options.frameworkRoot],
    ['OPL_REQUIRE_SHELL_FORMAT', String(options.requireShellFormat)],
    ['OPL_RELEASE_SOURCE_GATE_RUN_SHELL_TESTS', String(options.runShellTests)],
  ];
  if (options.version !== null) {
    exactBindings.push(['OPL_RELEASE_VERSION', options.version]);
  } else if (source.OPL_RELEASE_VERSION !== undefined) {
    problems.push('OPL_RELEASE_VERSION must be unset for a versionless operation.');
  }
  if (options.operationFingerprint !== null) {
    exactBindings.push(['OPL_RELEASE_OPERATION_FINGERPRINT', options.operationFingerprint]);
  } else if (source.OPL_RELEASE_OPERATION_FINGERPRINT !== undefined) {
    problems.push('OPL_RELEASE_OPERATION_FINGERPRINT must be unset when no operation fingerprint is admitted.');
  }
  for (const [name, expected] of exactBindings) {
    const actual = source[name];
    if (actual !== undefined && actual !== expected) problems.push(`${name} conflicts with the admitted option`);
  }
  const githubRepository = source.GITHUB_REPOSITORY?.trim();
  if (githubRepository && githubRepository.toLowerCase() !== canonicalAppRepository) {
    problems.push(`GITHUB_REPOSITORY must be ${canonicalAppRepository}`);
  }
  return problems;
}
