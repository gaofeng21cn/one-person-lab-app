#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  assertReleaseSemanticsAxes,
  assertUpdaterVersionMatchesDisplay,
} from './release-version.ts';

type JsonRecord = Record<string, any>;

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const latestTagPattern =
  /^v[0-9]+\.[0-9]+\.[0-9]+(?:(?:-r[1-9][0-9]*)|(?:-preview\.r[1-9][0-9]*)|(?:-nightly(?:\.r[1-9][0-9]*)?))?$/;

function readJson(filePath: string): JsonRecord {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`Expected a non-empty regular JSON file: ${resolved}`);
  }
  const value = JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected one JSON object: ${resolved}`);
  }
  return value as JsonRecord;
}

function requireDigest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !digestPattern.test(value)) {
    throw new Error(`${label} must be an exact sha256 digest.`);
  }
  return value;
}

function requireLatestTag(value: string): string {
  if (!latestTagPattern.test(value)) {
    throw new Error('Expected current Latest tag must identify one exact published App version.');
  }
  return value;
}

function manifestDigest(manifest: JsonRecord): string {
  const core = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => key !== 'component_manifest_digest'),
  );
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex')}`;
}

export function createLatestPointerOverrideAuthority(
  manifest: JsonRecord,
  expectedCurrentLatestTag: string,
): JsonRecord {
  if (
    manifest.surface_kind !== 'opl_app_component_manifest.v1'
    || manifest.component_id !== 'opl-app'
  ) {
    throw new Error('Latest override authority requires one canonical App component manifest.');
  }
  if (manifest.quality_status !== 'preview' && manifest.quality_status !== 'stable') {
    throw new Error('Latest override authority requires one exact Stable or Preview build.');
  }
  assertReleaseSemanticsAxes({
    qualityStatus: manifest.quality_status,
    buildTrigger: manifest.build_trigger,
    previewKind: manifest.preview_kind,
  });
  const publicationChannel = manifest.quality_status === 'stable'
    ? 'stable'
    : manifest.preview_kind === 'nightly' ? 'nightly' : 'preview';
  assertUpdaterVersionMatchesDisplay(
    publicationChannel,
    String(manifest.release_version ?? ''),
    String(manifest.updater_version ?? ''),
  );
  if (
    manifest.release_tag !== `v${manifest.release_version}`
    || manifest.version !== manifest.release_version
  ) {
    throw new Error('Component manifest release identity is inconsistent.');
  }
  if (
    requireDigest(manifest.component_manifest_digest, 'Component manifest digest')
    !== manifestDigest(manifest)
  ) {
    throw new Error('Component manifest digest does not match its immutable bytes.');
  }
  const isPreview = manifest.quality_status === 'preview';
  const skippedGates = manifest.qualification_disclosure?.skipped_gates;
  if (
    !Array.isArray(skippedGates)
    || skippedGates.some((gate: unknown) => typeof gate !== 'string' || !gate.trim())
    || new Set(skippedGates).size !== skippedGates.length
    || (isPreview && (
      manifest.qualification_disclosure?.stable_qualified !== false
      || manifest.qualification_disclosure?.non_stable_notice !== true
      || skippedGates.length === 0
    ))
    || (!isPreview && (
      manifest.preview_kind !== null
      || manifest.qualification_disclosure?.stable_qualified !== true
      || manifest.qualification_disclosure?.non_stable_notice !== false
    ))
  ) {
    throw new Error('Latest override requires exact quality and qualification disclosure.');
  }

  const core = {
    schema: 'opl_app_latest_pointer_override_authority.v1',
    status: 'admitted',
    operation: 'move_latest_pointer',
    authorization: {
      source: 'user_explicit',
      protected_environment: 'release-preview-latest',
      single_use: true,
      persistent_override: false,
    },
    candidate: {
      tag: manifest.release_tag,
      component_manifest_digest: manifest.component_manifest_digest,
      artifact_digest: requireDigest(
        manifest.primary_artifact?.digest,
        'Component manifest primary artifact digest',
      ),
      quality_status: manifest.quality_status,
      build_trigger: manifest.build_trigger,
      preview_kind: manifest.preview_kind,
      quality_unchanged: true,
      non_stable_notice: isPreview,
      skipped_gates: skippedGates,
    },
    compare_and_swap: {
      expected_current_tag: requireLatestTag(expectedCurrentLatestTag),
      exact_expected_current: true,
    },
    readback: {
      required: true,
      policy: 'exact_public_tag_latest_and_quality_disclosure',
    },
  };
  return {
    ...core,
    authority_digest: `sha256:${crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex')}`,
  };
}

function required(value: string | undefined, flag: string): string {
  if (!value?.trim()) throw new Error(`Missing --${flag}.`);
  return value.trim();
}

function main(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      'component-manifest': { type: 'string' },
      'expected-current-latest-tag': { type: 'string' },
      output: { type: 'string' },
    },
  });
  const componentManifestPath = required(values['component-manifest'], 'component-manifest');
  const outputPath = path.resolve(required(values.output, 'output'));
  const authority = createLatestPointerOverrideAuthority(
    readJson(componentManifestPath),
    required(values['expected-current-latest-tag'], 'expected-current-latest-tag'),
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(authority, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    status: 'written',
    output: outputPath,
    authority_digest: authority.authority_digest,
  })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
