#!/usr/bin/env node

import fs from 'node:fs';
import { parseArgs as parseNodeArgs } from 'node:util';
import { asRecord, readJsonFile } from './release-json-helpers.ts';
import { assertExpectedFields, assertStringArrayIncludes } from './value-assertions.ts';

type Args = {
  imageInspectPath: string;
  imageManifestPath: string;
  seedMetadataPath: string;
  expectedProfile: 'webui-full' | 'webui-slim';
  summaryPath?: string;
};

function parseArgs(): Args {
  const { values } = parseNodeArgs({
    args: process.argv.slice(2),
    options: {
      'image-inspect': { type: 'string' },
      'image-manifest': { type: 'string' },
      'seed-metadata': { type: 'string' },
      'expected-profile': { type: 'string' },
      'summary-path': { type: 'string' },
    } as const,
    allowPositionals: false,
    strict: true,
  });
  const expectedProfile = values['expected-profile'] ?? 'webui-full';
  if (expectedProfile !== 'webui-full' && expectedProfile !== 'webui-slim') {
    throw new Error(`Unsupported WebUI image profile: ${expectedProfile}`);
  }
  const args: Args = {
    imageInspectPath: values['image-inspect'] ?? '',
    imageManifestPath: values['image-manifest'] ?? '',
    seedMetadataPath: values['seed-metadata'] ?? '',
    expectedProfile,
    summaryPath: values['summary-path'],
  };
  for (const [field, value] of Object.entries({
    imageInspectPath: args.imageInspectPath,
    imageManifestPath: args.imageManifestPath,
    seedMetadataPath: args.seedMetadataPath,
  })) {
    if (!value) {
      throw new Error(`Missing required option for ${field}`);
    }
  }
  return args;
}

function envMap(rawEnv: unknown) {
  if (!Array.isArray(rawEnv)) {
    throw new Error('Docker image inspect Config.Env must be an array.');
  }
  return new Map(
    rawEnv.map((entry) => {
      if (typeof entry !== 'string' || !entry.includes('=')) {
        throw new Error(`Invalid Docker env entry: ${String(entry)}`);
      }
      const separator = entry.indexOf('=');
      return [entry.slice(0, separator), entry.slice(separator + 1)] as const;
    }),
  );
}

function requiredComponentIds(seedMetadata: Record<string, unknown>) {
  const components = seedMetadata.components;
  if (!Array.isArray(components)) {
    throw new Error('WebUI full seed metadata must include components[].');
  }
  return components.map((component) => {
    const record = asRecord(component, 'seed metadata component');
    if (typeof record.id !== 'string' || !record.id) {
      throw new Error('Each seed metadata component must include id.');
    }
    for (const field of ['version', 'source', 'payload_path', 'receipt_kind']) {
      if (typeof record[field] !== 'string' || !record[field]) {
        throw new Error(`Seed metadata component ${record.id} must include ${field}.`);
      }
    }
    if (typeof record.sha256 !== 'string' && typeof record.source_fingerprint !== 'string') {
      throw new Error(`Seed metadata component ${record.id} must include sha256 or source_fingerprint.`);
    }
    if (record.sha256 !== undefined && typeof record.sha256 !== 'string') {
      throw new Error(`Seed metadata component ${record.id} sha256 must be a string when present.`);
    }
    if (record.size_bytes !== undefined && (typeof record.size_bytes !== 'number' || record.size_bytes <= 0)) {
      throw new Error(`Seed metadata component ${record.id} size_bytes must be a positive number when present.`);
    }
    return record.id;
  });
}

const args = parseArgs();
const imageInspect = readJsonFile<unknown>(args.imageInspectPath);
const image = Array.isArray(imageInspect) ? asRecord(imageInspect[0], 'Docker image inspect[0]') : asRecord(imageInspect, 'Docker image inspect');
const imageOs = image.Os;
const imageArchitecture = image.Architecture;
if (imageOs !== 'linux' || (imageArchitecture !== 'amd64' && imageArchitecture !== 'arm64')) {
  throw new Error(`Docker/WebUI image platform must be linux/amd64 or linux/arm64, got ${String(imageOs)}/${String(imageArchitecture)}.`);
}
const config = asRecord(image.Config, 'Docker image inspect Config');
const labels = asRecord(config.Labels, 'Docker image inspect labels');
const env = envMap(config.Env);
const volumes = asRecord(config.Volumes, 'Docker image inspect volumes');
const imageManifest = asRecord(readJsonFile(args.imageManifestPath), 'WebUI image manifest');
const seedMetadata = asRecord(readJsonFile(args.seedMetadataPath), 'WebUI image seed metadata');

assertExpectedFields(
  [
    {
      actual: labels['org.opencontainers.image.source'],
      expected: 'https://github.com/gaofeng21cn/one-person-lab-app',
    },
  ],
  'OCI source label must point at the One Person Lab App repository.',
);
if (typeof labels['org.opencontainers.image.revision'] !== 'string' || !labels['org.opencontainers.image.revision']) {
  throw new Error('OCI revision label must be present.');
}
for (const volume of ['/data', '/projects']) {
  if (!(volume in volumes)) {
    throw new Error(`Docker image must declare VOLUME ${volume}.`);
  }
}
for (const [key, expected] of Object.entries({
  HOME: '/data',
  CODEX_HOME: '/data/codex',
  OPL_DATA_DIR: '/data',
  OPL_PROJECTS_DIR: '/projects',
  OPL_WORKSPACE_ROOT: '/projects',
})) {
  const actual = env.get(key);
  assertExpectedFields(
    [{ actual, expected }],
    `Docker env ${key} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}
for (const key of ['OPL_IMAGE_MANIFEST_PATH', 'OPL_IMAGE_SEED_DIR']) {
  if (!env.get(key)) {
    throw new Error(`Docker env ${key} must be present.`);
  }
}
const pathEnv = env.get('PATH') ?? '';
if (args.expectedProfile === 'webui-full') {
  assertStringArrayIncludes(
    pathEnv.split(':'),
    ['/opt/opl-framework/bin', '/opt/codex/bin'],
    'webui-full Docker PATH',
  );
}

assertExpectedFields(
  [
    { actual: imageManifest.schema, expected: 'dev.onepersonlab.opl-webui-image-manifest.v2' },
    { actual: imageManifest.image_role, expected: 'opl_webui_runtime_image' },
    { actual: imageManifest.data_dir, expected: '/data' },
    { actual: imageManifest.projects_dir, expected: '/projects' },
    { actual: imageManifest.seed_dir, expected: '/opt/opl/seed' },
    { actual: imageManifest.seed_metadata, expected: '/opt/opl/seed/metadata.json' },
  ],
  'Image manifest identity and runtime paths must match the WebUI runtime image contract.',
);
if (typeof imageManifest.base_image_family !== 'string' || /alpine/i.test(imageManifest.base_image_family)) {
  throw new Error('Docker/WebUI runtime image must use a glibc LTS/slim base, not Alpine.');
}
const webuiPackage = asRecord(imageManifest.webui_package, 'image manifest webui_package');
if (webuiPackage.name !== 'opl-studio' || !/^[a-f0-9]{40}$/.test(String(webuiPackage.source_commit))
  || imageManifest.application_host !== 'opl-studio') {
  throw new Error('Image manifest must identify the exact Studio application host.');
}
if (config.User !== 'root' || JSON.stringify(config.Entrypoint) !== JSON.stringify(['/usr/local/bin/opl-webui-entrypoint']) || JSON.stringify(config.Cmd) !== JSON.stringify(['node', 'scripts/headless/run.mjs'])) {
  throw new Error('Studio WebUI must run the non-root Node headless host.');
}

assertExpectedFields(
  [
    { actual: seedMetadata.schema, expected: 'dev.onepersonlab.opl-webui-image-seed.v2' },
    { actual: seedMetadata.data_dir, expected: '/data' },
    { actual: seedMetadata.projects_dir, expected: '/projects' },
  ],
  'Seed metadata identity and runtime paths must match the WebUI image seed contract.',
);

const seedStrategy = String(imageManifest.seed_strategy ?? seedMetadata.strategy ?? '');
if (args.expectedProfile === 'webui-full') {
  if (seedStrategy === 'metadata_only') {
    throw new Error('webui-full image must not use metadata_only seed strategy.');
  }
  if (!['payload_manifest', 'payload_preheated'].includes(seedStrategy)) {
    throw new Error(`webui-full image must use payload_manifest or payload_preheated seed strategy, got ${seedStrategy}`);
  }
  const componentIds = requiredComponentIds(seedMetadata);
  assertStringArrayIncludes(
    componentIds,
    ['opl_framework', 'codex_cli'],
    'webui-full seed metadata components',
  );
} else if (seedStrategy !== 'metadata_only') {
  throw new Error(`webui-slim image must use metadata_only seed strategy, got ${seedStrategy}`);
}

const summary = {
  status: 'passed',
  expected_profile: args.expectedProfile,
  platform: { os: imageOs, architecture: imageArchitecture },
  application_host: 'opl-studio',
  image_id: image.Id,
  created: image.Created,
  oci_revision: labels['org.opencontainers.image.revision'],
  manifest_path: env.get('OPL_IMAGE_MANIFEST_PATH'),
  seed_dir: env.get('OPL_IMAGE_SEED_DIR'),
  seed_strategy: seedStrategy,
  volumes: Object.keys(volumes),
};
if (args.summaryPath) {
  fs.writeFileSync(args.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
}
console.log(JSON.stringify(summary));
