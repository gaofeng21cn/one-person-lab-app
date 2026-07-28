#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { matchesCanonicalReleaseVersion, type AppReleaseChannel } from './release-version.ts';

const shaPattern = /^[0-9a-f]{40}$/;
const releaseChannels: AppReleaseChannel[] = ['stable', 'preview', 'nightly'];

export type FrozenUniversalInstallerInput = {
  sourcePath: string;
  outputPath: string;
  version: string;
  appSha: string;
  shellSha: string;
  frameworkSha: string;
  repository?: string;
};

function replaceUnique(source: string, anchor: string, replacement: string, label: string): string {
  const first = source.indexOf(anchor);
  if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error(`${label} must occur exactly once in install.sh.`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + anchor.length)}`;
}

function replaceDefault(source: string, name: string, replacement: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedName}=\\$\\{${escapedName}:-[^\\n]*\\}$`, 'm');
  const match = source.match(pattern);
  if (!match) throw new Error(`install.sh is missing the expected ${name} default.`);
  return replaceUnique(source, match[0], `${name}='${replacement}'`, `${name} default`);
}

export function generateFrozenUniversalInstaller(input: FrozenUniversalInstallerInput): string {
  const version = input.version.trim();
  const appSha = input.appSha.trim();
  const shellSha = input.shellSha.trim();
  const frameworkSha = input.frameworkSha.trim();
  const repository = input.repository?.trim() || 'gaofeng21cn/one-person-lab-app';
  if (!releaseChannels.some((channel) => matchesCanonicalReleaseVersion(channel, version))) {
    throw new Error('version must be a canonical Stable, Preview, or Nightly display version.');
  }
  if (!shaPattern.test(appSha)) throw new Error('appSha must be an exact lowercase Git SHA.');
  if (!shaPattern.test(shellSha)) throw new Error('shellSha must be an exact lowercase Git SHA.');
  if (!shaPattern.test(frameworkSha)) throw new Error('frameworkSha must be an exact lowercase Git SHA.');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('repository must use owner/name form.');
  }

  const sourcePath = path.resolve(input.sourcePath);
  const stat = fs.lstatSync(sourcePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`install.sh source must be a non-empty regular file: ${sourcePath}`);
  }

  const tag = `v${version}`;
  const frameworkInstallerUrl = `https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/${frameworkSha}/install.sh`;
  const frameworkArchiveUrl = `https://github.com/gaofeng21cn/one-person-lab/archive/${frameworkSha}.tar.gz`;
  const dockerInstallerUrl = `https://raw.githubusercontent.com/${repository}/${appSha}/scripts/install-docker-webui.sh`;
  let generated = fs.readFileSync(sourcePath, 'utf8');
  generated = replaceDefault(generated, 'OPL_INSTALL_SCRIPT_URL', frameworkInstallerUrl);
  generated = replaceDefault(generated, 'OPL_APP_RELEASE_REPO', repository);
  generated = replaceDefault(generated, 'OPL_APP_DOCS_REF', appSha);
  generated = replaceDefault(generated, 'OPL_DOCKER_WEBUI_INSTALLER_URL', dockerInstallerUrl);
  generated = replaceDefault(generated, 'OPL_APP_SOURCE_REF', appSha);
  generated = replaceDefault(generated, 'OPL_SHELL_SOURCE_REF', shellSha);
  generated = replaceDefault(generated, 'OPL_FRAMEWORK_SOURCE_REF', frameworkSha);
  generated = replaceDefault(generated, 'OPL_APP_RELEASE_SELECTOR', tag);
  generated = replaceDefault(generated, 'OPL_FROZEN_RELEASE_TAG', tag);
  generated = replaceDefault(generated, 'OPL_RELEASE_VERSION', version);
  generated = replaceDefault(generated, 'OPL_RELEASE_REPO', repository);
  generated = replaceDefault(generated, 'OPL_CONTAINER_WEBUI_TAG', version);
  generated = replaceDefault(generated, 'OPL_INSTALL_RUNTIME_FORM', 'auto');
  generated = replaceUnique(
    generated,
    'local releases_url="$repo_url/releases/latest"',
    `local releases_url="$repo_url/releases/tag/${tag}"`,
    'Latest release help URL',
  );
  generated = replaceUnique(
    generated,
    'api_path="repos/$OPL_APP_RELEASE_REPO/releases/latest"',
    'api_path="repos/$OPL_APP_RELEASE_REPO/releases/tags/$OPL_FROZEN_RELEASE_TAG"',
    'Latest release API selector',
  );
  generated = replaceUnique(
    generated,
    'set -euo pipefail\n',
    [
      'set -euo pipefail',
      `OPL_INSTALL_BRANCH='${frameworkSha}'`,
      "OPL_INSTALL_SOURCE_MODE='archive'",
      `OPL_SOURCE_ARCHIVE_URL='${frameworkArchiveUrl}'`,
      'export OPL_FRAMEWORK_SOURCE_REF OPL_INSTALL_BRANCH OPL_INSTALL_SOURCE_MODE OPL_SOURCE_ARCHIVE_URL',
      '',
    ].join('\n'),
    'Frozen Framework source prelude',
  );

  if (generated.includes('/main/')) throw new Error('Frozen universal installer contains a mutable /main/ URL.');
  if (generated.includes("OPL_APP_RELEASE_SELECTOR='latest'") || generated.includes('releases/latest')) {
    throw new Error('Frozen universal installer must select one exact Release tag.');
  }
  if (!generated.includes(`OPL_FROZEN_RELEASE_TAG='${tag}'`)) {
    throw new Error('Frozen universal installer omitted the exact Release tag.');
  }
  for (const [name, value] of [
    ['OPL_APP_SOURCE_REF', appSha],
    ['OPL_SHELL_SOURCE_REF', shellSha],
    ['OPL_FRAMEWORK_SOURCE_REF', frameworkSha],
    ['OPL_RELEASE_VERSION', version],
    ['OPL_RELEASE_REPO', repository],
    ['OPL_CONTAINER_WEBUI_TAG', version],
  ]) {
    if (!generated.includes(`${name}='${value}'`)) {
      throw new Error(`Frozen universal installer omitted ${name}.`);
    }
  }
  if (!generated.startsWith('#!/usr/bin/env bash\n')) {
    throw new Error('Frozen universal installer must preserve the bash shebang.');
  }
  return generated;
}

function main(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      source: { type: 'string' },
      output: { type: 'string' },
      version: { type: 'string' },
      'app-sha': { type: 'string' },
      'shell-sha': { type: 'string' },
      'framework-sha': { type: 'string' },
      repository: { type: 'string' },
    },
  });
  const required = (key: keyof typeof values): string => {
    const value = values[key];
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing --${String(key)}.`);
    return value.trim();
  };
  const outputPath = path.resolve(required('output'));
  const generated = generateFrozenUniversalInstaller({
    sourcePath: required('source'),
    outputPath,
    version: required('version'),
    appSha: required('app-sha'),
    shellSha: required('shell-sha'),
    frameworkSha: required('framework-sha'),
    repository: values.repository,
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, generated, { mode: 0o755 });
  fs.chmodSync(outputPath, 0o755);
  process.stdout.write(`${JSON.stringify({ status: 'written', output: outputPath, bytes: Buffer.byteLength(generated) })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
