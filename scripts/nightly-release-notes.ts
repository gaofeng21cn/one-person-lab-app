#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import type { NightlyQualificationReceipt } from './nightly-release-qualification.ts';
import {
  assertNightlyRequestDigest,
  type NightlyReleaseRequest,
} from './resolve-nightly-release-request.ts';

type SourceCohort = NightlyReleaseRequest['source'];

export type NightlyNotesBaseline = {
  schema: 'opl_nightly_notes_baseline.v1';
  release: {
    id: number;
    tag: string;
    target_commitish: string;
    published_at: string;
  };
  component_manifest: {
    surface_kind: 'opl_app_component_manifest.v1';
    version: string;
    release_version: string;
    quality_status: 'stable' | 'preview';
    build_trigger: 'manual' | 'automated';
    preview_kind: 'dev' | 'nightly' | null;
    source_commit: string;
    source_cohort: SourceCohort;
    release_tag: string;
  };
};

type RepositoryInput = {
  id: 'app' | 'shell' | 'framework';
  label: 'One Person Lab App' | 'OPL Aion Shell' | 'OPL Framework';
  repository: string;
  root: string;
  previousRef: string;
  currentRef: string;
};

export type NightlyComponentChange = {
  id: RepositoryInput['id'];
  label: RepositoryInput['label'];
  repository: string;
  previous_ref: string;
  current_ref: string;
  commit_count: number;
  commit_subjects: string[];
  notable_subjects: string[];
  non_english_subjects: string[];
  compare_url: string;
};

export type NightlyReleaseNotesEvidence = {
  schema: 'opl_nightly_release_notes_evidence.v1';
  current: {
    version: string;
    tag: string;
    source: SourceCohort;
    request_digest: string;
    invocation: NightlyReleaseRequest['invocation'];
    public_note_language: 'en-US';
    assets: string[];
  };
  baseline: {
    release_id: number;
    tag: string;
    target_commitish: string;
    published_at: string;
    source: SourceCohort;
  };
  components: NightlyComponentChange[];
  user_visible_changes: string[];
  notes_sha256: `sha256:${string}`;
};

const exactShaPattern = /^[0-9a-f]{40}$/;
const releaseTagPattern = /^v\d+\.\d+\.\d+(?:-r[1-9]\d*|-nightly(?:\.r[1-9]\d*)?|-preview\.r[1-9]\d*)?$/;
// Automated Nightly notes are published in English only, but App, Shell, and Framework commit
// subjects are written in the language of whoever authored them. Subjects outside the public note
// language are simply left out of the body; they stay in the notes evidence artifact.
const publicNoteLanguage = 'en-US';
const nonPublicNoteLanguagePattern =
  /[\u1100-\u11ff\u2e80-\u2eff\u3000-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff01-\uff60\uffe0-\uffee]/;
const notableSubjectLimit = 5;

function exactSha(value: unknown, label: string): string {
  const normalized = String(value ?? '');
  if (!exactShaPattern.test(normalized)) throw new Error(`${label} must be an exact commit SHA.`);
  return normalized;
}

function runGit(root: string, args: string[]): string {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status === 0) return result.stdout.trim();
  throw new Error(`git -C ${root} ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
}

function gitSucceeds(root: string, args: string[]): boolean {
  return spawnSync('git', ['-C', root, ...args], { stdio: 'ignore' }).status === 0;
}

function assertQualification(
  request: NightlyReleaseRequest,
  qualification: NightlyQualificationReceipt,
): void {
  assertNightlyRequestDigest(request);
  if (
    qualification.schema !== 'opl_standard_nightly_qualification.v1'
    || qualification.status !== 'passed'
    || qualification.request_digest !== request.request_digest
    || qualification.version !== request.version
    || qualification.tag !== request.tag
    || JSON.stringify(qualification.cohort) !== JSON.stringify(request.source)
    || JSON.stringify(qualification.actions) !== JSON.stringify(request.actions)
    || JSON.stringify(qualification.invocation) !== JSON.stringify(request.invocation)
    || qualification.include_full !== false
    || qualification.stable_qualified !== false
    || qualification.heavy_vm_required !== false
    || qualification.full_assets_present !== false
    || qualification.webui_assets_present !== false
  ) {
    throw new Error('Nightly notes require a passed qualification for the exact frozen Standard Preview request.');
  }
}

function validateBaseline(value: NightlyNotesBaseline): NightlyNotesBaseline {
  const release = value?.release;
  const manifest = value?.component_manifest;
  const source = manifest?.source_cohort;
  const validReleaseIdentity = (
    manifest?.quality_status === 'stable'
    && manifest.build_trigger === 'manual'
    && manifest.preview_kind === null
  ) || (
    manifest?.quality_status === 'preview'
    && manifest.build_trigger === 'automated'
    && manifest.preview_kind === 'nightly'
  ) || (
    manifest?.quality_status === 'preview'
    && manifest.build_trigger === 'manual'
    && manifest.preview_kind === 'dev'
  );
  if (
    value?.schema !== 'opl_nightly_notes_baseline.v1'
    || !Number.isSafeInteger(release?.id)
    || release.id <= 0
    || !releaseTagPattern.test(release.tag)
    || !Number.isFinite(Date.parse(release.published_at))
    || manifest?.surface_kind !== 'opl_app_component_manifest.v1'
    || !validReleaseIdentity
    || manifest.release_tag !== release.tag
    || manifest.release_version !== manifest.version
    || release.target_commitish !== manifest.source_commit
    || release.target_commitish !== source?.app_sha
  ) {
    throw new Error('Nightly notes baseline does not bind one exact published Release and component manifest.');
  }
  exactSha(source.app_sha, 'Baseline App SHA');
  exactSha(source.shell_sha, 'Baseline Shell SHA');
  exactSha(source.framework_sha, 'Baseline Framework SHA');
  return value;
}

function normalizeSubject(subject: string): string {
  return subject
    .replace(/\s+\(#\d+\)\s*$/, '')
    .replace(/^[a-z]+(?:\([^)]+\))?!?:\s*/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function notableSubjectSplit(subjects: string[]): { notable: string[]; nonEnglish: string[] } {
  const candidates = [...new Set(subjects
    .filter((subject) => !/^Merge\b/i.test(subject))
    .filter((subject) => !/^(?:test|ci|chore)(?:\([^)]+\))?!?:/i.test(subject))
    .filter((subject) =>
      /first[- ]run|setup|bootstrap|install|upgrade|updater|settings|gui|home|provider|health|status|display|runtime|assistant|agent|skill|codex|mas|mag|rca|meta agent|plugin|windows|wsl|linux|docs|readme|guide|screenshot|tutorial|shortcut|ipc|profile/i.test(subject),
    )
    .map(normalizeSubject)
    .filter(Boolean))];
  const notable = candidates.filter((subject) => !nonPublicNoteLanguagePattern.test(subject));
  const nonEnglish = candidates.filter((subject) => nonPublicNoteLanguagePattern.test(subject));
  return { notable: notable.slice(0, notableSubjectLimit), nonEnglish };
}

function componentChange(input: RepositoryInput): NightlyComponentChange {
  const head = exactSha(runGit(input.root, ['rev-parse', 'HEAD']), `${input.label} HEAD`);
  if (head !== input.currentRef) {
    throw new Error(`${input.label} checkout HEAD does not match the frozen Nightly request.`);
  }
  for (const [label, ref] of [['previous', input.previousRef], ['current', input.currentRef]] as const) {
    if (!gitSucceeds(input.root, ['cat-file', '-e', `${ref}^{commit}`])) {
      throw new Error(`${input.label} ${label} commit is unavailable: ${ref}.`);
    }
  }
  if (!gitSucceeds(input.root, ['merge-base', '--is-ancestor', input.previousRef, input.currentRef])) {
    throw new Error(`${input.label} Nightly comparison is not a forward ancestry range.`);
  }
  const subjects = runGit(input.root, ['log', '--format=%s', `${input.previousRef}..${input.currentRef}`])
    .split(/\r?\n/)
    .map((subject) => subject.trim())
    .filter(Boolean);
  const count = Number(runGit(input.root, ['rev-list', '--count', `${input.previousRef}..${input.currentRef}`]));
  if (!Number.isSafeInteger(count) || count < 0 || count !== subjects.length) {
    throw new Error(`${input.label} commit range count is inconsistent.`);
  }
  const subjectSplit = notableSubjectSplit(subjects);
  return {
    id: input.id,
    label: input.label,
    repository: input.repository,
    previous_ref: input.previousRef,
    current_ref: input.currentRef,
    commit_count: count,
    commit_subjects: subjects,
    notable_subjects: subjectSplit.notable,
    non_english_subjects: subjectSplit.nonEnglish,
    compare_url: `https://github.com/${input.repository}/compare/${input.previousRef}...${input.currentRef}`,
  };
}

function userVisibleChanges(components: NightlyComponentChange[]): string[] {
  // Non-English commit subjects stay out of the component listing, but their category still
  // belongs in the English summary above.
  const subjects = components.flatMap((component) => [
    ...component.notable_subjects,
    ...component.non_english_subjects,
  ]);
  const changes: string[] = [];
  const add = (pattern: RegExp, text: string) => {
    if (subjects.some((subject) => pattern.test(subject))) changes.push(text);
  };
  add(/first[- ]run|setup|bootstrap|install|upgrade/i, 'Installation, upgrade, or first-run behavior changed.');
  add(/settings|gui|home|provider|health|status|display|runtime/i, 'App settings, readiness, provider, or runtime-status surfaces changed.');
  add(/assistant|agent|skill|codex|mas|mag|rca|meta agent|plugin/i, 'Built-in agent, skill, or Codex integration behavior changed.');
  add(/updater|update|package|dmg|asset|windows|wsl|linux/i, 'Desktop updater, package, or platform behavior changed.');
  add(/docs|readme|guide|screenshot|tutorial/i, 'User guidance or screenshots changed.');
  return [...new Set(changes)];
}

function renderComponent(component: NightlyComponentChange): string[] {
  const lines = [
    `### ${component.label}`,
    `- ${component.commit_count} commit${component.commit_count === 1 ? '' : 's'} in this Preview window. [Compare changes](${component.compare_url})`,
  ];
  if (component.notable_subjects.length === 0) {
    lines.push('- No user-facing commit subject was selected; use the exact comparison link for the authoritative diff.');
  } else {
    lines.push(...component.notable_subjects.map((subject) => `- ${subject}`));
  }
  return lines;
}

function renderNotes(input: {
  request: NightlyReleaseRequest;
  qualification: NightlyQualificationReceipt;
  baseline: NightlyNotesBaseline;
  components: NightlyComponentChange[];
  visibleChanges: string[];
}): string {
  const { request, qualification, baseline, components, visibleChanges } = input;
  const invocation = request.invocation.mode === 'scheduled_production'
    ? 'Scheduled production Nightly.'
    : 'User-explicit development validation of the Nightly publication path.';
  const lines = [
    invocation,
    '',
    `This Standard Desktop Preview contains the exact App, Shell, and Framework changes since ${baseline.release.tag}. It is intended for users who already opted into Preview automatic updates.`,
    '',
    '## User-visible changes',
  ];
  if (visibleChanges.length === 0) {
    lines.push('- No user-visible change category could be established from the commit subjects; use the component comparisons below as the authority.');
  } else {
    lines.push(...visibleChanges.map((change) => `- ${change}`));
  }
  lines.push('', '## Component changes');
  for (const component of components) lines.push('', ...renderComponent(component));
  lines.push(
    '',
    '## Compatibility and upgrade',
    '- Existing Preview automatic-update users can take this Standard Desktop build without moving the Stable channel.',
    '- This release does not include Full first-install or WebUI assets; use the current Stable paths when those carriers are required.',
    '- Nightly is a prerelease and may change before Stable. No migration or backward-compatibility guarantee is inferred from commit subjects.',
    '',
    '## Channel and risk',
    '- Channel: Nightly / Preview prerelease; not Stable-qualified.',
    '- GitHub Latest is not changed by this release.',
    '- The Stable heavy VM gate is not required; sampled clean-VM and Homebrew followers run independently after publication.',
    '',
    '## Exact release identity',
    `- Baseline release: [${baseline.release.tag}](https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/${baseline.release.tag})`,
    `- App: \`${request.source.app_sha}\``,
    `- Shell: \`${request.source.shell_sha}\``,
    `- Framework: \`${request.source.framework_sha}\``,
    `- Published assets: ${qualification.assets.map((asset) => `\`${asset.name}\``).join(', ')}`,
  );
  return `${lines.join('\n').trimEnd()}\n`;
}

export function buildNightlyReleaseNotes(input: {
  request: NightlyReleaseRequest;
  qualification: NightlyQualificationReceipt;
  baseline: NightlyNotesBaseline;
  appRoot: string;
  shellRoot: string;
  frameworkRoot: string;
}): { notes: string; evidence: NightlyReleaseNotesEvidence } {
  assertQualification(input.request, input.qualification);
  const baseline = validateBaseline(input.baseline);
  if (baseline.release.tag === input.request.tag) {
    throw new Error('Nightly notes baseline must be a distinct earlier Release.');
  }
  const repositories: RepositoryInput[] = [
    {
      id: 'app',
      label: 'One Person Lab App',
      repository: 'gaofeng21cn/one-person-lab-app',
      root: input.appRoot,
      previousRef: baseline.component_manifest.source_cohort.app_sha,
      currentRef: exactSha(input.request.source.app_sha, 'Current App SHA'),
    },
    {
      id: 'shell',
      label: 'OPL Aion Shell',
      repository: 'gaofeng21cn/opl-aion-shell',
      root: input.shellRoot,
      previousRef: baseline.component_manifest.source_cohort.shell_sha,
      currentRef: exactSha(input.request.source.shell_sha, 'Current Shell SHA'),
    },
    {
      id: 'framework',
      label: 'OPL Framework',
      repository: 'gaofeng21cn/one-person-lab',
      root: input.frameworkRoot,
      previousRef: baseline.component_manifest.source_cohort.framework_sha,
      currentRef: exactSha(input.request.source.framework_sha, 'Current Framework SHA'),
    },
  ];
  const components = repositories.map(componentChange);
  const visibleChanges = userVisibleChanges(components);
  const notes = renderNotes({
    request: input.request,
    qualification: input.qualification,
    baseline,
    components,
    visibleChanges,
  });
  return {
    notes,
    evidence: {
      schema: 'opl_nightly_release_notes_evidence.v1',
      current: {
        version: input.request.version,
        tag: input.request.tag,
        source: input.request.source,
        request_digest: input.request.request_digest,
        invocation: input.request.invocation,
        public_note_language: publicNoteLanguage,
        assets: input.qualification.assets.map((asset) => asset.name),
      },
      baseline: {
        release_id: baseline.release.id,
        tag: baseline.release.tag,
        target_commitish: baseline.release.target_commitish,
        published_at: baseline.release.published_at,
        source: baseline.component_manifest.source_cohort,
      },
      components,
      user_visible_changes: visibleChanges,
      notes_sha256: `sha256:${crypto.createHash('sha256').update(notes).digest('hex')}`,
    },
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8')) as T;
}

function main(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      request: { type: 'string' },
      qualification: { type: 'string' },
      baseline: { type: 'string' },
      'app-root': { type: 'string', default: process.cwd() },
      'shell-root': { type: 'string' },
      'framework-root': { type: 'string' },
      output: { type: 'string' },
      'evidence-output': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  const required = (name: keyof typeof values): string => {
    const value = values[name];
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing --${String(name)}.`);
    return value.trim();
  };
  const result = buildNightlyReleaseNotes({
    request: readJson<NightlyReleaseRequest>(required('request')),
    qualification: readJson<NightlyQualificationReceipt>(required('qualification')),
    baseline: readJson<NightlyNotesBaseline>(required('baseline')),
    appRoot: path.resolve(required('app-root')),
    shellRoot: path.resolve(required('shell-root')),
    frameworkRoot: path.resolve(required('framework-root')),
  });
  fs.writeFileSync(path.resolve(required('output')), result.notes, 'utf8');
  fs.writeFileSync(
    path.resolve(required('evidence-output')),
    `${JSON.stringify(result.evidence, null, 2)}\n`,
    'utf8',
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
