#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stageStudioStandardAssets } from './stage-standard-shell-assets.ts';
import { resolveActiveShellPaths } from './app-shell-adapter.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactsDir = path.resolve(root, process.argv[2] ?? 'build-artifacts');
const outputDir = path.resolve(root, process.argv[3] ?? 'release-assets');
const shellPaths = resolveActiveShellPaths();
const expectedVersion = process.env.OPL_RELEASE_VERSION?.trim() || '';
const skipLinuxDesktopPayload = process.argv.includes('--skip-linux-desktop-payload');

if (shellPaths.contract.active_shell === 'opl-studio') {
  stageStudioStandardAssets(artifactsDir, outputDir);
} else {
const result = spawnSync('bash', [shellPaths.releasePrepareScriptPath, artifactsDir, outputDir], {
  cwd: shellPaths.shellRoot,
  stdio: 'inherit',
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findFilesByName(rootDir: string, fileName: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const matches: string[] = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      matches.push(...findFilesByName(entryPath, fileName));
    } else if (entry.isFile() && entry.name === fileName) {
      matches.push(entryPath);
    }
  }
  return matches;
}

function preserveStandardTrustEvidence(): void {
  for (const evidenceName of [
    'standard-local-authorization-policy.json',
    'standard-gatekeeper-launch-policy.json',
    'standard-apple-notarization-receipt.json',
  ]) {
    const sources = findFilesByName(artifactsDir, evidenceName);
    if (sources.length === 0) continue;
    if (sources.length > 1) {
      throw new Error(`Expected one ${evidenceName}, found ${sources.length}: ${sources.join(', ')}`);
    }
    fs.mkdirSync(outputDir, { recursive: true });
    fs.copyFileSync(sources[0], path.join(outputDir, evidenceName));
  }
}

function preserveLinuxDesktopPayload(version: string): void {
  if (!version) return;
  const assetName = `One-Person-Lab-${version}-linux-x64.deb`;
  const sources = findFilesByName(artifactsDir, assetName);
  if (sources.length !== 1) {
    throw new Error(
      `Expected exactly one ${assetName}, found ${sources.length}: ${sources.join(', ') || '(none)'}`,
    );
  }
  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(sources[0], path.join(outputDir, assetName));
}

function readMetadataVersion(): string {
  const versions = new Set<string>();
  for (const metadataName of ['latest-arm64-mac.yml', 'latest-mac.yml']) {
    const metadataPath = path.join(outputDir, metadataName);
    if (!fs.existsSync(metadataPath)) {
      continue;
    }
    const match = fs.readFileSync(metadataPath, 'utf8').match(/^version:\s*['"]?([^'"\s]+)['"]?\s*$/m);
    if (match?.[1]) {
      versions.add(match[1]);
    }
  }
  if (versions.size === 1) {
    return [...versions][0];
  }
  if (versions.size > 1) {
    throw new Error(`Updater metadata declares multiple versions: ${[...versions].sort().join(', ')}`);
  }
  return '';
}

function ensureMacMetadataBridge(): void {
  const primary = path.join(outputDir, 'latest-mac.yml');
  const compatibility = path.join(outputDir, 'latest-arm64-mac.yml');
  if (!fs.existsSync(primary) && fs.existsSync(compatibility)) {
    fs.copyFileSync(compatibility, primary);
  }
  if (!fs.existsSync(compatibility) && fs.existsSync(primary)) {
    fs.copyFileSync(primary, compatibility);
  }
  if (!fs.existsSync(primary) || !fs.existsSync(compatibility)) {
    throw new Error('Standard updater metadata bridge requires latest-mac.yml and latest-arm64-mac.yml.');
  }
  if (!fs.readFileSync(primary).equals(fs.readFileSync(compatibility))) {
    throw new Error('latest-mac.yml and latest-arm64-mac.yml must be byte-identical.');
  }
}

function filterStandardAssetsToVersion(version: string): void {
  if (!version) {
    return;
  }
  const escapedVersion = escapeRegExp(version);
  const currentAsset = new RegExp(`^(?:One-Person-Lab-${escapedVersion}-mac-arm64\\.(?:dmg|zip)|One-Person-Lab-${escapedVersion}-mac-arm64\\.zip\\.blockmap)$`);
  const standardAsset = /^One-Person-Lab-.+-mac-arm64\.(?:dmg|zip)(?:\.blockmap)?$/;
  for (const entry of fs.readdirSync(outputDir)) {
    if (!standardAsset.test(entry) || currentAsset.test(entry)) {
      continue;
    }
    fs.rmSync(path.join(outputDir, entry), { force: true });
  }
}

preserveStandardTrustEvidence();
ensureMacMetadataBridge();
filterStandardAssetsToVersion(expectedVersion || readMetadataVersion());
if (!skipLinuxDesktopPayload) {
  preserveLinuxDesktopPayload(expectedVersion);
}
