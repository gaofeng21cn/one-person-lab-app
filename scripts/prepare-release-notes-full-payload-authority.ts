#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { resolveAioncoreManagedCodexBinding } from './manual-latest-build.ts';

type JsonRecord = Record<string, any>;

const shaPattern = /^[0-9a-f]{40}$/;
const canonicalFrameworkRepository = 'gaofeng21cn/one-person-lab';
const nestedFrameworkCheckoutPath = 'framework-source';

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${label}.`);
  return value.trim();
}

function requiredObject(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Missing ${label}.`);
  }
  return value as JsonRecord;
}

function readRegularJson(filePath: string, label: string): JsonRecord {
  const stat = fs.lstatSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file: ${filePath}`);
  }
  return requiredObject(JSON.parse(fs.readFileSync(filePath, 'utf8')), label);
}

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function digestRef(filePath: string): string {
  return `sha256:${sha256File(filePath)}`;
}

function canonicalJson(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (candidate && typeof candidate === 'object') {
      return Object.fromEntries(
        Object.entries(candidate as JsonRecord)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    }
    return candidate;
  };
  return JSON.stringify(normalize(value));
}

function gitSha(root: string, label: string): string {
  const result = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  const value = result.stdout.trim();
  if (result.status !== 0 || !shaPattern.test(value)) {
    throw new Error(`Cannot resolve exact ${label} Git SHA: ${result.stderr.trim()}`);
  }
  return value;
}

function statusWithoutExactUntrackedDirectory(status: string, relativePath: string | null): string {
  if (!relativePath) return status;
  const normalized = relativePath.split(path.sep).join('/').replace(/\/+$/, '');
  const allowed = new Set([`?? ${normalized}`, `?? ${normalized}/`]);
  return status
    .split(/\r?\n/)
    .filter((line) => line && !allowed.has(line))
    .join('\n');
}

function assertExactGitSha(
  root: string,
  expected: string,
  label: string,
  allowedUntrackedDirectory: string | null = null,
): string {
  if (!shaPattern.test(expected)) throw new Error(`${label} ref must be an exact 40-character Git SHA.`);
  const actual = gitSha(root, label);
  if (actual !== expected) throw new Error(`${label} checkout drifted: expected ${expected}, got ${actual}.`);
  const status = spawnSync(
    'git',
    ['-C', root, 'status', '--porcelain', '--untracked-files=all'],
    { encoding: 'utf8' },
  );
  const dirtyStatus = statusWithoutExactUntrackedDirectory(status.stdout, allowedUntrackedDirectory);
  if (status.status !== 0 || dirtyStatus) {
    throw new Error(`${label} checkout must be clean before release-note authority is derived.`);
  }
  return actual;
}

function exactGitValue(root: string, args: string[], label: string): string {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 30_000,
  });
  const value = result.stdout.trim();
  if (result.status !== 0 || !value) {
    throw new Error(`Cannot resolve ${label}: ${result.stderr.trim()}`);
  }
  return value;
}

function canonicalGithubRepository(remoteUrl: string): string | null {
  const normalized = remoteUrl.trim().replace(/\.git$/i, '');
  const match = normalized.match(/github\.com(?::\d+)?[/:]([^/]+\/[^/]+)$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function nestedFrameworkRelativePath(appRoot: string, frameworkRoot: string): string | null {
  const relative = path.relative(appRoot, frameworkRoot);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  const normalized = relative.split(path.sep).join('/').replace(/\/+$/, '');
  if (normalized !== nestedFrameworkCheckoutPath) {
    throw new Error(`Framework checkout inside App must be exactly ${nestedFrameworkCheckoutPath}/.`);
  }
  return normalized;
}

function assertNestedFrameworkCheckout(
  frameworkRoot: string,
  expectedRef: string,
): string {
  const frameworkRef = assertExactGitSha(frameworkRoot, expectedRef, 'Framework');
  const topLevel = fs.realpathSync(exactGitValue(
    frameworkRoot,
    ['rev-parse', '--show-toplevel'],
    'nested Framework Git top-level',
  ));
  if (topLevel !== frameworkRoot) {
    throw new Error('Nested Framework checkout root must exactly match its Git top-level.');
  }

  const originUrl = exactGitValue(
    frameworkRoot,
    ['config', '--get', 'remote.origin.url'],
    'nested Framework origin URL',
  );
  if (canonicalGithubRepository(originUrl) !== canonicalFrameworkRepository) {
    throw new Error(`Nested Framework origin must be ${canonicalFrameworkRepository}.`);
  }

  const resolvedRef = exactGitValue(
    frameworkRoot,
    ['rev-parse', '--verify', `${expectedRef}^{commit}`],
    'nested Framework exact ref',
  );
  if (resolvedRef !== expectedRef) {
    throw new Error(`Nested Framework ref must resolve exactly to ${expectedRef}.`);
  }
  const headTree = exactGitValue(frameworkRoot, ['rev-parse', 'HEAD^{tree}'], 'nested Framework HEAD tree');
  const refTree = exactGitValue(
    frameworkRoot,
    ['rev-parse', `${expectedRef}^{tree}`],
    'nested Framework input ref tree',
  );
  if (!shaPattern.test(headTree) || headTree !== refTree) {
    throw new Error('Nested Framework HEAD tree does not match the workflow input ref tree.');
  }

  const remoteMain = exactGitValue(
    frameworkRoot,
    ['ls-remote', '--heads', 'origin', 'refs/heads/main'],
    'nested Framework live origin/main',
  );
  const remoteMainParts = remoteMain.split(/\s+/);
  if (
    remoteMainParts.length !== 2
    || remoteMainParts[1] !== 'refs/heads/main'
    || remoteMainParts[0] !== expectedRef
  ) {
    throw new Error(`Nested Framework live origin/main must exactly match ${expectedRef}.`);
  }
  return frameworkRef;
}

function assertContainedFile(root: string, candidate: string, label: string): string {
  const candidateStat = fs.lstatSync(candidate, { throwIfNoEntry: false });
  if (!candidateStat?.isFile() || candidateStat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file: ${candidate}`);
  }
  const rootRealpath = fs.realpathSync(root);
  const candidateRealpath = fs.realpathSync(candidate);
  const relative = path.relative(rootRealpath, candidateRealpath);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its authority checkout: ${candidate}`);
  }
  return candidateRealpath;
}

function shellRelativePath(shellRoot: string, candidate: string, label: string): string {
  const root = fs.realpathSync(shellRoot);
  const resolved = fs.realpathSync(candidate);
  const relative = path.relative(root, resolved);
  if (
    !relative
    || relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new Error(`${label} escapes the selected Shell checkout: ${candidate}`);
  }
  return relative.split(path.sep).join('/');
}

function directCliAuthority(
  shellRoot: string,
  cli: ReturnType<typeof resolveAioncoreManagedCodexBinding>['codex_cli'],
) {
  return {
    name: cli.name,
    version: cli.version,
    root_ref: shellRelativePath(shellRoot, cli.root, `${cli.name} CLI root`),
    executable_ref: shellRelativePath(shellRoot, cli.executable, `${cli.name} CLI executable`),
    executable_sha256: `sha256:${cli.executable_sha256}`,
    required_files: cli.required_files.map((file) => ({
      ref: shellRelativePath(shellRoot, file.path, `${cli.name} CLI required file`),
      sha256: `sha256:${file.sha256}`,
    })),
    required_directories: cli.required_directories.map((directory) => ({
      ref: shellRelativePath(shellRoot, directory.path, `${cli.name} CLI required directory`),
      tree_sha256: `sha256:${directory.tree_sha256}`,
    })),
  };
}

export type ReleaseNotesFullPayloadAuthorityInput = {
  appRoot: string;
  appRef: string;
  shellRoot: string;
  shellRef: string;
  frameworkRoot: string;
  frameworkRef: string;
  thirdPartySourceManifestPath: string;
};

export function buildReleaseNotesFullPayloadAuthority(
  input: ReleaseNotesFullPayloadAuthorityInput,
): JsonRecord {
  const appRoot = fs.realpathSync(input.appRoot);
  const shellRoot = fs.realpathSync(input.shellRoot);
  const frameworkRoot = fs.realpathSync(input.frameworkRoot);
  const nestedFrameworkPath = nestedFrameworkRelativePath(appRoot, frameworkRoot);
  const frameworkRef = nestedFrameworkPath
    ? assertNestedFrameworkCheckout(frameworkRoot, input.frameworkRef)
    : assertExactGitSha(frameworkRoot, input.frameworkRef, 'Framework');
  const appRef = assertExactGitSha(appRoot, input.appRef, 'App', nestedFrameworkPath);
  const shellRef = assertExactGitSha(shellRoot, input.shellRef, 'Shell');

  const components: JsonRecord = {
    opl: { git_commit: frameworkRef },
  };
  const resolvedRefs: JsonRecord = {
    opl_framework: {
      label: 'OPL Framework',
      repository: 'gaofeng21cn/one-person-lab',
      resolved_commit: frameworkRef,
    },
  };

  const thirdPartyManifestPath = assertContainedFile(
    appRoot,
    input.thirdPartySourceManifestPath,
    'App Full third-party source manifest',
  );
  const thirdPartyManifest = readRegularJson(
    thirdPartyManifestPath,
    'App Full third-party source manifest',
  );
  if (thirdPartyManifest.schema !== 'opl_app_full_third_party_source_manifest.v1') {
    throw new Error('App Full third-party source manifest has an unsupported schema.');
  }
  const thirdPartySources = requiredObject(thirdPartyManifest.sources, 'App Full third-party sources');
  const runtimePayloads = requiredObject(thirdPartyManifest.runtime_payloads, 'App Full runtime payloads');
  const officeSource = requiredObject(thirdPartySources.officecli, 'OfficeCLI source authority');
  const mineruSource = requiredObject(thirdPartySources.mineru, 'MinerU source authority');
  const officePayload = requiredObject(runtimePayloads.officecli, 'OfficeCLI runtime authority');
  const aioncoreBinding = resolveAioncoreManagedCodexBinding(shellRoot);
  const shellPackage = readRegularJson(path.join(shellRoot, 'package.json'), 'exact Shell package.json');
  const aioncoreVersion = requiredString(shellPackage.aioncoreVersion, 'Shell package.json#aioncoreVersion');
  if (!/^v\d+\.\d+\.\d+$/.test(aioncoreVersion)) {
    throw new Error(`Shell AionCore pin must be an exact version tag, got ${aioncoreVersion}.`);
  }
  const expectedAioncoreUrl = [
    'https://github.com/iOfficeAI/AionCore/releases/download',
    aioncoreVersion,
    `aioncore-${aioncoreVersion}-aarch64-apple-darwin.tar.gz`,
  ].join('/');
  if (
    aioncoreBinding.runtime_key !== 'darwin-arm64'
    || aioncoreBinding.aioncore.version !== aioncoreVersion
    || aioncoreBinding.aioncore.source_type !== 'download'
    || aioncoreBinding.aioncore.source_url !== expectedAioncoreUrl
  ) {
    throw new Error('AionCore root manifest must exactly match the Shell pin and official darwin-arm64 release.');
  }
  const codexVersion = requiredString(aioncoreBinding.codex_cli.version, 'AionCore managed Codex CLI version');
  if (
    aioncoreBinding.schema !== 'opl_manual_aioncore_managed_direct_clis_binding.v2'
    || aioncoreBinding.managed_resources.schema_version !== 2
  ) {
    throw new Error('AionCore managed resources must resolve to the direct-CLI schema v2 binding.');
  }
  const nodeRuntime = {
    version: aioncoreBinding.node_runtime.version,
    root_ref: shellRelativePath(shellRoot, aioncoreBinding.node_runtime.root, 'managed Node root'),
    executable_ref: shellRelativePath(shellRoot, aioncoreBinding.node_runtime.executable, 'managed Node executable'),
    executable_sha256: `sha256:${aioncoreBinding.node_runtime.executable_sha256}`,
  };
  const claudeCli = directCliAuthority(shellRoot, aioncoreBinding.claude_cli);
  const codexCli = directCliAuthority(shellRoot, aioncoreBinding.codex_cli);
  components.codex = { version: `codex-cli ${codexVersion}` };
  resolvedRefs.codex_cli = {
    label: 'Codex CLI',
    repository: 'iOfficeAI/AionCore',
    authority: 'aioncore_managed_resources_v2_direct_cli',
    resolved_version: codexVersion,
    aioncore_version: aioncoreBinding.aioncore.version,
    node_runtime: nodeRuntime,
    direct_cli: codexCli,
    managed_resources_manifest_sha256: `sha256:${aioncoreBinding.managed_resources.manifest_sha256}`,
  };
  const officeRef = requiredString(officeSource.ref, 'OfficeCLI source ref');
  const mineruRef = requiredString(mineruSource.ref, 'MinerU source ref');
  if (!shaPattern.test(officeRef) || !shaPattern.test(mineruRef)) {
    throw new Error('OfficeCLI and MinerU source refs must be exact 40-character Git SHAs.');
  }
  const officeVersion = requiredString(officePayload.version, 'OfficeCLI runtime version');
  if (requiredString(officeSource.release_tag, 'OfficeCLI release tag') !== `v${officeVersion}`) {
    throw new Error('OfficeCLI source tag and runtime version do not match.');
  }
  components.officecli = { version: officeVersion, git_commit: officeRef };
  components.mineru_open_api = { git_commit: mineruRef };
  resolvedRefs.officecli = {
    label: 'OfficeCLI',
    repository: requiredString(officeSource.repository, 'OfficeCLI repository'),
    resolved_commit: officeRef,
    version: officeVersion,
  };
  resolvedRefs.mineru = {
    label: 'MinerU',
    repository: requiredString(mineruSource.repository, 'MinerU repository'),
    resolved_commit: mineruRef,
  };

  return {
    schema: 'opl_app_release_notes_full_payload_authority.v1',
    intent: {
      include_full_package: true,
      phase: 'prebuild',
      build_artifact_bytes_known: false,
      usage: 'prepared_release_notes_evidence',
    },
    sources: {
      app: { source_commit: appRef },
      shell: { source_commit: shellRef },
      framework: { source_commit: frameworkRef },
    },
    runtime_authority: {
      codex_cli: {
        source: 'shell_aioncore_managed_resources_v2_direct_clis',
        shell_source_commit: shellRef,
        runtime_key: aioncoreBinding.runtime_key,
        aioncore_version: aioncoreBinding.aioncore.version,
        aioncore_source_url: aioncoreBinding.aioncore.source_url,
        aioncore_root_manifest_ref: path.relative(shellRoot, aioncoreBinding.aioncore.root_manifest).split(path.sep).join('/'),
        aioncore_root_manifest_sha256: `sha256:${aioncoreBinding.aioncore.root_manifest_sha256}`,
        managed_resources_manifest_ref: path.relative(shellRoot, aioncoreBinding.managed_resources.manifest).split(path.sep).join('/'),
        managed_resources_manifest_sha256: `sha256:${aioncoreBinding.managed_resources.manifest_sha256}`,
        managed_resources_schema_version: 2,
        node_runtime: nodeRuntime,
        claude_cli: claudeCli,
        direct_cli: codexCli,
        version: codexVersion,
        postbuild_managed_resources_v2_content_bytes_required: true,
      },
      officecli: { source_commit: officeRef, version: officeVersion },
      mineru: { source_commit: mineruRef },
      app_third_party_source_manifest_sha256: digestRef(thirdPartyManifestPath),
    },
    components,
    resolved_refs: resolvedRefs,
  };
}

export function verifyReleaseNotesFullPayloadAuthority(
  authorityPath: string,
  input: ReleaseNotesFullPayloadAuthorityInput,
): { authority: JsonRecord; sha256: string } {
  const authority = readRegularJson(authorityPath, 'Full notes payload authority');
  if (authority.schema !== 'opl_app_release_notes_full_payload_authority.v1') {
    throw new Error('Full notes payload authority has an unsupported schema.');
  }
  const derived = buildReleaseNotesFullPayloadAuthority(input);
  if (canonicalJson(authority) !== canonicalJson(derived)) {
    throw new Error(
      'Full notes payload authority fields drifted from the current App, Shell, Framework, or selected input authorities.',
    );
  }
  return {
    authority,
    sha256: digestRef(authorityPath),
  };
}

function parseCli(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'app-root': { type: 'string' },
      'app-ref': { type: 'string' },
      'shell-root': { type: 'string' },
      'shell-ref': { type: 'string' },
      'framework-root': { type: 'string' },
      'framework-ref': { type: 'string' },
      'third-party-source-manifest': { type: 'string' },
      output: { type: 'string' },
    },
    allowPositionals: false,
    strict: true,
  });
  return {
    appRoot: path.resolve(requiredString(values['app-root'], '--app-root')),
    appRef: requiredString(values['app-ref'], '--app-ref'),
    shellRoot: path.resolve(requiredString(values['shell-root'], '--shell-root')),
    shellRef: requiredString(values['shell-ref'], '--shell-ref'),
    frameworkRoot: path.resolve(requiredString(values['framework-root'], '--framework-root')),
    frameworkRef: requiredString(values['framework-ref'], '--framework-ref'),
    thirdPartySourceManifestPath: path.resolve(
      requiredString(values['third-party-source-manifest'], '--third-party-source-manifest'),
    ),
    output: path.resolve(requiredString(values.output, '--output')),
  };
}

function main(): void {
  const options = parseCli(process.argv.slice(2));
  const output = buildReleaseNotesFullPayloadAuthority(options);
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
