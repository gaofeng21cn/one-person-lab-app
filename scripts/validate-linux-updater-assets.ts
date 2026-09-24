#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';

export function validateLinuxUpdaterAssets({ artifactDir, releaseVersion, updaterVersion }: {
  artifactDir: string; releaseVersion: string; updaterVersion: string;
}): void {
  const name = `One-Person-Lab-${releaseVersion}-linux-x64.deb`;
  const bytes = fs.readFileSync(path.join(artifactDir, name));
  const sha512 = crypto.createHash('sha512').update(bytes).digest('base64');
  const metadata = parse(fs.readFileSync(path.join(artifactDir, 'latest-linux.yml'), 'utf8'));
  if (!bytes.length || metadata?.version !== updaterVersion || metadata?.path !== name || metadata?.sha512 !== sha512
    || !Array.isArray(metadata?.files) || metadata.files.length !== 1
    || metadata.files[0]?.url !== name || metadata.files[0]?.sha512 !== sha512 || metadata.files[0]?.size !== bytes.length) {
    throw new Error('Linux updater metadata must bind the exact release DEB, machine version, size, and SHA-512.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    'artifact-dir': { type: 'string' }, 'release-version': { type: 'string' }, 'updater-version': { type: 'string' },
  } });
  for (const key of ['artifact-dir', 'release-version', 'updater-version']) if (!values[key]) throw new Error(`Missing --${key}`);
  validateLinuxUpdaterAssets({ artifactDir: values['artifact-dir']!, releaseVersion: values['release-version']!, updaterVersion: values['updater-version']! });
  process.stdout.write('Linux updater assets validated\n');
}
