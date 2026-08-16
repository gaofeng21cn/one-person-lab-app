#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

type UpdaterFile = { url?: unknown; sha512?: unknown; size?: unknown };
type UpdaterMetadata = {
  path?: unknown;
  sha512?: unknown;
  files?: unknown;
};

export function isElectronUpdaterMetadataName(name: string) {
  const normalized = name.toLowerCase();
  const extension = normalized.endsWith('.yaml')
    ? '.yaml'
    : normalized.endsWith('.yml')
      ? '.yml'
      : '';
  if (!extension) return false;
  const stem = normalized.slice(0, -extension.length);
  return stem === 'latest'
    || (stem.startsWith('latest-') && stem.length > 'latest-'.length && !stem.includes('.'));
}

function artifactIdentity(artifactPath: string) {
  const bytes = fs.readFileSync(artifactPath);
  return {
    name: path.basename(artifactPath),
    sha512: crypto.createHash('sha512').update(bytes).digest('base64'),
    size: bytes.length,
  };
}

export function updateElectronUpdaterMetadataForArtifact(artifactPath: string, metadataDir: string) {
  const identity = artifactIdentity(artifactPath);
  const metadataFiles = fs.readdirSync(metadataDir)
    .filter(isElectronUpdaterMetadataName)
    .sort();
  if (metadataFiles.length === 0) throw new Error(`No electron-updater metadata found under ${metadataDir}.`);

  const updated: string[] = [];
  for (const name of metadataFiles) {
    const filePath = path.join(metadataDir, name);
    const document = parseYaml(fs.readFileSync(filePath, 'utf8')) as UpdaterMetadata;
    let matched = false;
    if (Array.isArray(document.files)) {
      for (const entry of document.files as UpdaterFile[]) {
        if (entry?.url === identity.name) {
          entry.sha512 = identity.sha512;
          entry.size = identity.size;
          matched = true;
        }
      }
    }
    if (document.path === identity.name) {
      document.sha512 = identity.sha512;
      matched = true;
    }
    if (!matched) throw new Error(`${name} does not reference ${identity.name}.`);
    fs.writeFileSync(filePath, stringifyYaml(document), 'utf8');
    updated.push(name);
  }
  return { artifact: identity, metadata_files: updated };
}

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      artifact: { type: 'string' },
      'metadata-dir': { type: 'string' },
    },
    strict: true,
  });
  if (!values.artifact || !values['metadata-dir']) {
    throw new Error('Pass --artifact <path> and --metadata-dir <path>.');
  }
  const result = updateElectronUpdaterMetadataForArtifact(
    path.resolve(values.artifact),
    path.resolve(values['metadata-dir']),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
