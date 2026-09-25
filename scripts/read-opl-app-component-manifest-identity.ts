#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  assertReleaseSemanticsAxes,
  assertUpdaterVersionMatchesDisplay,
  matchesCanonicalReleaseVersion,
  resolveReleaseVersionIdentity,
  type AppReleaseChannel,
  type ReleaseBuildTrigger,
  type ReleasePreviewKind,
  type ReleaseQualityStatus,
} from './release-version.ts';

type JsonRecord = Record<string, unknown>;

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const shaPattern = /^[0-9a-f]{40}$/;

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as JsonRecord;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function verifyManifestDigest(manifest: JsonRecord): string {
  const declared = requireString(manifest.component_manifest_digest, 'component_manifest_digest');
  if (!digestPattern.test(declared)) throw new Error('component_manifest_digest must be a sha256 digest.');
  const core = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => key !== 'component_manifest_digest'),
  );
  const actual = `sha256:${crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex')}`;
  if (actual !== declared) throw new Error('App component manifest digest does not match its exact identity bytes.');
  return actual;
}

function validateReleaseVisibility(
  previewKind: ReleasePreviewKind,
  releasePrerelease: boolean,
): void {
  const expectedPrerelease = previewKind === 'nightly';
  if (releasePrerelease !== expectedPrerelease) {
    throw new Error('GitHub Release prerelease state does not match the App component manifest quality.');
  }
}

export function readAppComponentManifestIdentity(
  value: unknown,
  expectedTag: string,
  releasePrerelease: boolean,
  expectedSourceCommit: string,
): JsonRecord {
  const manifest = requireRecord(value, 'App component manifest');
  if (manifest.surface_kind !== 'opl_app_component_manifest.v1' || manifest.component_id !== 'opl-app') {
    throw new Error('App component manifest authority is invalid.');
  }
  if (!/^v[^/]+$/.test(expectedTag)) throw new Error('Expected Latest tag is invalid.');
  if (!shaPattern.test(expectedSourceCommit)) throw new Error('Expected source commit must be an exact Git SHA.');
  const displayVersion = expectedTag.slice(1);
  if (requireString(manifest.release_tag, 'release_tag') !== expectedTag) {
    throw new Error('App component manifest release_tag does not match GitHub Latest.');
  }
  if (requireString(manifest.version, 'version') !== displayVersion) {
    throw new Error('App component manifest version does not match GitHub Latest.');
  }
  const replacement = manifest.same_tag_replacement === undefined ? null
    : requireRecord(manifest.same_tag_replacement, 'same_tag_replacement');
  const sourceCommit = requireString(manifest.source_commit, 'source_commit');
  if (replacement) {
    const previous = String(replacement.previous_updater_version).split('.').map(Number);
    const next = String(manifest.updater_version).split('.').map(Number);
    const floor = resolveReleaseVersionIdentity('stable', displayVersion).updaterVersion.split('.').map(Number);
    if (replacement.schema !== 'opl_app_same_tag_replacement.v1'
      || manifest.quality_status !== 'stable' || manifest.preview_kind !== null
      || replacement.tag_source_commit !== expectedSourceCommit
      || !shaPattern.test(sourceCommit)
      || !/^\d+\.\d+\.\d+$/.test(String(replacement.previous_updater_version))
      || !/^\d+\.\d+\.\d+$/.test(String(manifest.updater_version))
      || previous[0] !== floor[0] || previous[1] !== floor[1] || previous[2] < floor[2]
      || Math.floor(previous[2] / 100) !== Math.floor(floor[2] / 100)
      || Math.floor(next[2] / 100) !== Math.floor(floor[2] / 100)
      || next[0] !== previous[0] || next[1] !== previous[1] || next[2] !== previous[2] + 1
      || !digestPattern.test(String(replacement.previous_manifest_digest))
      || !digestPattern.test(String(replacement.qualification_receipt_sha256))
      || !/^[1-9][0-9]*$/.test(String(replacement.build_run_id))
      || !/^[1-9][0-9]*$/.test(String(replacement.qualification_run_id))) {
      throw new Error('Same-tag replacement must bind a qualified monotonic machine revision to the original tag.');
    }
  }
  if (!replacement && sourceCommit !== expectedSourceCommit) {
    throw new Error('App component manifest source_commit does not match the GitHub Release target.');
  }
  const manifestDigest = verifyManifestDigest(manifest);

  const currentKeys = [
    'release_version',
    'updater_version',
    'quality_status',
    'build_trigger',
    'preview_kind',
    'distribution_pointer_policy',
    'qualification_disclosure',
    'source_cohort',
  ] as const;
  const presentCurrentKeys = currentKeys.filter((key) => manifest[key] !== undefined);
  let qualityStatus: ReleaseQualityStatus;
  let updaterVersion: string;
  let buildTrigger: ReleaseBuildTrigger;
  let previewKind: ReleasePreviewKind;
  let distributionPointerPolicy: JsonRecord;
  let qualificationDisclosure: JsonRecord;
  let manifestFormat: 'current' | 'legacy_stable';

  if (presentCurrentKeys.length === 0) {
    if (releasePrerelease || !matchesCanonicalReleaseVersion('stable', displayVersion)) {
      throw new Error('Legacy App component manifests are accepted only for canonical non-prerelease Stable releases.');
    }
    qualityStatus = 'stable';
    updaterVersion = resolveReleaseVersionIdentity('stable', displayVersion).updaterVersion;
    buildTrigger = 'manual';
    previewKind = null;
    distributionPointerPolicy = {
      pointer: 'latest',
      automatic_writer: 'qualified_stable_default',
      explicit_override: 'protected_single_use_exact_version',
      quality_unchanged: true,
      stable_reclaim: 'next_qualified_stable',
    };
    qualificationDisclosure = {
      stable_qualified: true,
      passed_gates: ['standard_vm'],
      skipped_gates: [],
      failed_gates: [],
      non_stable_notice: false,
    };
    manifestFormat = 'legacy_stable';
  } else {
    if (presentCurrentKeys.length !== currentKeys.length) {
      throw new Error('Current App component manifest identity fields must be present as one complete set.');
    }
    if (manifest.release_version !== displayVersion) {
      throw new Error('App component manifest release_version does not match GitHub Latest.');
    }
    if (manifest.quality_status !== 'stable' && manifest.quality_status !== 'preview') {
      throw new Error('App component manifest quality_status is invalid.');
    }
    qualityStatus = manifest.quality_status;
    updaterVersion = requireString(manifest.updater_version, 'updater_version');
    if (manifest.build_trigger !== 'manual' && manifest.build_trigger !== 'automated') {
      throw new Error('App component manifest build_trigger is invalid.');
    }
    buildTrigger = manifest.build_trigger;
    const declaredPreviewKind = manifest.preview_kind;
    if (
      declaredPreviewKind !== null
      && declaredPreviewKind !== 'dev'
      && declaredPreviewKind !== 'nightly'
    ) {
      throw new Error('App component manifest preview_kind is invalid.');
    }
    previewKind = declaredPreviewKind as ReleasePreviewKind;
    assertReleaseSemanticsAxes({ qualityStatus, buildTrigger, previewKind });
    const versionChannel: AppReleaseChannel = qualityStatus === 'stable'
      ? 'stable'
      : previewKind === 'nightly'
        ? 'nightly'
        : 'preview';
    if (!replacement) assertUpdaterVersionMatchesDisplay(versionChannel, displayVersion, updaterVersion);
    distributionPointerPolicy = requireRecord(
      manifest.distribution_pointer_policy,
      'distribution_pointer_policy',
    );
    const expectedPointerPolicy = qualityStatus === 'stable'
      ? {
          pointer: 'latest',
          automatic_writer: 'qualified_stable_default',
          explicit_override: 'protected_single_use_exact_version',
          quality_unchanged: true,
          stable_reclaim: 'next_qualified_stable',
        }
      : {
          pointer: 'latest',
          automatic_writer: 'never',
          explicit_override: 'protected_single_use_exact_version',
          quality_unchanged: true,
          stable_reclaim: 'next_qualified_stable',
        };
    if (JSON.stringify(distributionPointerPolicy) !== JSON.stringify(expectedPointerPolicy)) {
      throw new Error('App component manifest distribution pointer policy is invalid.');
    }
    qualificationDisclosure = requireRecord(
      manifest.qualification_disclosure,
      'qualification_disclosure',
    );
    const sourceCohort = requireRecord(manifest.source_cohort, 'source_cohort');
    if (
      sourceCohort.app_sha !== sourceCommit
      || typeof sourceCohort.shell_sha !== 'string'
      || !shaPattern.test(sourceCohort.shell_sha)
      || typeof sourceCohort.framework_sha !== 'string'
      || !shaPattern.test(sourceCohort.framework_sha)
    ) {
      throw new Error('App component manifest source cohort is invalid.');
    }
    const expectedDisclosure = qualityStatus === 'stable'
      ? {
          stable_qualified: true,
          passed_gates: ['standard_vm'],
          skipped_gates: [],
          failed_gates: [],
          non_stable_notice: false,
        }
      : previewKind === 'nightly'
        ? {
            stable_qualified: false,
            passed_gates: [],
            skipped_gates: [
              'stable_heavy_vm',
              'homebrew_clean_install',
              'container_webui',
              'full',
            ],
            failed_gates: [],
            non_stable_notice: true,
          }
        : {
            stable_qualified: false,
            passed_gates: ['standard_vm'],
            skipped_gates: ['homebrew_clean_install', 'container_webui', 'full'],
            failed_gates: [],
            non_stable_notice: true,
          };
    const historicalNativeDisclosure = previewKind === 'nightly'
      ? {
          ...expectedDisclosure,
          skipped_gates: [
            'stable_heavy_vm',
            'homebrew_clean_install',
            'native_webui',
            'container_webui',
            'full',
          ],
        }
      : qualityStatus === 'preview'
        ? {
            ...expectedDisclosure,
            skipped_gates: ['homebrew_clean_install', 'native_webui', 'container_webui', 'full'],
          }
        : expectedDisclosure;
    if (
      JSON.stringify(qualificationDisclosure) !== JSON.stringify(expectedDisclosure)
      && JSON.stringify(qualificationDisclosure) !== JSON.stringify(historicalNativeDisclosure)
    ) {
      throw new Error('App component manifest qualification disclosure is invalid.');
    }
    validateReleaseVisibility(previewKind, releasePrerelease);
    manifestFormat = 'current';
  }

  return {
    schema: 'opl_app_component_manifest_identity.v1',
    status: 'passed',
    manifest_format: manifestFormat,
    release_tag: expectedTag,
    display_version: displayVersion,
    updater_version: updaterVersion,
    quality_status: qualityStatus,
    build_trigger: buildTrigger,
    preview_kind: previewKind,
    distribution_pointer_policy: distributionPointerPolicy,
    qualification_disclosure: qualificationDisclosure,
    source_commit: expectedSourceCommit,
    component_manifest_digest: manifestDigest,
  };
}

function main(): void {
  const { values } = parseArgs({
    options: {
      manifest: { type: 'string' },
      'expected-tag': { type: 'string' },
      'release-prerelease': { type: 'string' },
      'expected-source-commit': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  const manifestPath = values.manifest?.trim() ?? '';
  const expectedTag = values['expected-tag']?.trim() ?? '';
  const prereleaseValue = values['release-prerelease']?.trim() ?? '';
  const expectedSourceCommit = values['expected-source-commit']?.trim() ?? '';
  if (
    !manifestPath
    || !expectedTag
    || !expectedSourceCommit
    || (prereleaseValue !== 'true' && prereleaseValue !== 'false')
  ) {
    throw new Error(
      'Pass --manifest <json> --expected-tag <tag> --release-prerelease <true|false> --expected-source-commit <sha>.',
    );
  }
  const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
  process.stdout.write(`${JSON.stringify(
    readAppComponentManifestIdentity(
      manifest,
      expectedTag,
      prereleaseValue === 'true',
      expectedSourceCommit,
    ),
  )}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
