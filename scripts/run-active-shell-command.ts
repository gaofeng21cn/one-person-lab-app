#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAppRootBoundary } from './app-root-boundary.ts';
import { resolveActiveShellPaths } from './app-shell-adapter.ts';
import {
  type AppReleaseChannel,
  assertUpdaterVersionMatchesDisplay,
  resolveReleaseVersionIdentity,
} from './release-version.ts';

const OPL_RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function defaultOplReleaseVersion(date = new Date()): string {
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${year}.${date.getUTCMonth() + 1}.${date.getUTCDate()}`;
}

export function resolveOplReleaseVersion(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.OPL_RELEASE_VERSION?.trim();
  const version = explicit || defaultOplReleaseVersion();
  if (!OPL_RELEASE_VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid OPL_RELEASE_VERSION: ${version}`);
  }
  return version;
}

export function resolveOplBuildVersions(
  env: NodeJS.ProcessEnv = process.env,
): { displayVersion: string; updaterVersion: string } {
  const displayVersion = resolveOplReleaseVersion(env);
  const explicitUpdaterVersion = env.OPL_UPDATER_VERSION?.trim();
  const channel: AppReleaseChannel = displayVersion.includes('-nightly')
    ? 'nightly'
    : displayVersion.includes('-preview')
      ? 'preview'
      : 'stable';

  // The renderer displays the calendar/release identity, while Electron and
  // electron-updater must use the contract's monotonic machine identity.
  // Derive the channel-specific local default so the App wrapper cannot
  // accidentally package the display date as the updater version.
  const updaterVersion = explicitUpdaterVersion
    || resolveReleaseVersionIdentity(channel, displayVersion).updaterVersion;
  assertUpdaterVersionMatchesDisplay(channel, displayVersion, updaterVersion);
  return { displayVersion, updaterVersion };
}

export function resolveActiveShellEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  repositoryRoot = appRoot,
): NodeJS.ProcessEnv {
  const releaseIconPath = env.OPL_APP_RELEASE_ICON_ICNS
    || path.join(repositoryRoot, 'shells', 'aionui', 'resources', 'app.icns');
  const buildVersions = resolveOplBuildVersions(env);
  return {
    ...env,
    OPL_APP_REPO_ROOT: path.resolve(repositoryRoot),
    OPL_APP_RELEASE_ICON_ICNS: releaseIconPath,
    OPL_RELEASE_VERSION: buildVersions.displayVersion,
    OPL_UPDATER_VERSION: buildVersions.updaterVersion,
  };
}

export function runActiveShellCommand(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (args.length === 0) {
    throw new Error('Usage: run-active-shell-command.ts <command> [...args]');
  }

  const shellPaths = resolveActiveShellPaths();
  assertAppRootBoundary({ phase: 'before active shell command' });
  const result = spawnSync(args[0]!, args.slice(1), {
    cwd: shellPaths.shellRoot,
    stdio: 'inherit',
    env: resolveActiveShellEnvironment(env),
  });

  try {
    assertAppRootBoundary({ phase: 'after active shell command' });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  return result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(runActiveShellCommand(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}
