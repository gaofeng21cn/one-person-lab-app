import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  buildNightlyReleaseNotes,
  type NightlyNotesBaseline,
} from '../../scripts/nightly-release-notes.ts';
import type { NightlyQualificationReceipt } from '../../scripts/nightly-release-qualification.ts';
import {
  resolveNightlyReleaseRequest,
  type NightlyReleaseRequest,
} from '../../scripts/resolve-nightly-release-request.ts';

function git(root: string, args: string[]): string {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function repository(root: string, commits: string[]): { previous: string; current: string } {
  fs.mkdirSync(root, { recursive: true });
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'nightly-notes@example.invalid']);
  git(root, ['config', 'user.name', 'Nightly Notes Test']);
  fs.writeFileSync(path.join(root, 'fixture.txt'), 'baseline\n');
  git(root, ['add', 'fixture.txt']);
  git(root, ['commit', '-q', '-m', 'feat: baseline']);
  const previous = git(root, ['rev-parse', 'HEAD']);
  for (const [index, subject] of commits.entries()) {
    fs.appendFileSync(path.join(root, 'fixture.txt'), `${index}\n`);
    git(root, ['add', 'fixture.txt']);
    git(root, ['commit', '-q', '-m', subject]);
  }
  return { previous, current: git(root, ['rev-parse', 'HEAD']) };
}

function fixture(
  t: test.TestContext,
  options: { appSubjects?: string[]; frameworkSubjects?: string[] } = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-nightly-notes-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = repository(path.join(root, 'app'), options.appSubjects ?? [
    'feat(gui): add provider readiness status',
    'fix(updater): preserve Preview automatic update metadata',
    'test: cover internal release receipt',
  ]);
  const shell = repository(path.join(root, 'shell'), ['fix: improve first-run setup']);
  const framework = repository(
    path.join(root, 'framework'),
    options.frameworkSubjects ?? ['docs: refresh install guide'],
  );
  const request = resolveNightlyReleaseRequest({
    baseVersion: '26.8.2-nightly',
    existingRefs: [],
    appRef: app.current,
    shellRef: shell.current,
    frameworkRef: framework.current,
    actionsRunId: '424242',
    actionsRunAttempt: '1',
    invocationMode: 'scheduled_production',
    event: 'schedule',
    authoritySource: 'daily_schedule',
  });
  const qualification = {
    schema: 'opl_standard_nightly_qualification.v1',
    status: 'passed',
    request_digest: request.request_digest,
    version: request.version,
    updater_version: request.updater_version,
    tag: request.tag,
    quality_status: 'preview',
    build_trigger: 'automated',
    preview_kind: 'nightly',
    cohort: request.source,
    actions: request.actions,
    invocation: request.invocation,
    package_kind: 'app_standard',
    include_full: false,
    stable_qualified: false,
    heavy_vm_required: false,
    sampled_vm_nonblocking: true,
    qualification_disclosure: {
      stable_qualified: false,
      passed_gates: [],
      skipped_gates: ['stable_heavy_vm', 'homebrew_clean_install', 'container_webui', 'full'],
      failed_gates: [],
      non_stable_notice: true,
    },
    full_assets_present: false,
    webui_assets_present: false,
    local_authorization: {
      required: true,
      gatekeeper_required: false,
      policy_sha256: 'a'.repeat(64),
    },
    assets: [
      { name: `One-Person-Lab-${request.version}-mac-arm64.dmg`, size_bytes: 1, sha256: 'b'.repeat(64) },
      { name: 'latest-mac.yml', size_bytes: 1, sha256: 'c'.repeat(64) },
      { name: 'latest-arm64-mac.yml', size_bytes: 1, sha256: 'c'.repeat(64) },
    ],
    primary_dmg: { name: 'preview.dmg', size_bytes: 1, sha256: 'b'.repeat(64) },
    updater_metadata: { name: 'latest-mac.yml', size_bytes: 1, sha256: 'c'.repeat(64) },
    updater_compatibility_metadata: {
      name: 'latest-arm64-mac.yml',
      size_bytes: 1,
      sha256: 'c'.repeat(64),
    },
    cohort_manifest_sha256: 'd'.repeat(64),
  } satisfies NightlyQualificationReceipt;
  const baseline = {
    schema: 'opl_nightly_notes_baseline.v1',
    release: {
      id: 101,
      tag: 'v26.7.31',
      target_commitish: app.previous,
      published_at: '2026-07-31T00:31:20Z',
    },
    component_manifest: {
      surface_kind: 'opl_app_component_manifest.v1',
      version: '26.7.31',
      release_version: '26.7.31',
      quality_status: 'stable',
      build_trigger: 'manual',
      preview_kind: null,
      source_commit: app.previous,
      source_cohort: {
        app_sha: app.previous,
        shell_sha: shell.previous,
        framework_sha: framework.previous,
      },
      release_tag: 'v26.7.31',
    },
  } satisfies NightlyNotesBaseline;
  return { root, app, shell, framework, request, qualification, baseline };
}

function build(input: ReturnType<typeof fixture>) {
  return buildNightlyReleaseNotes({
    request: input.request,
    qualification: input.qualification,
    baseline: input.baseline,
    appRoot: path.join(input.root, 'app'),
    shellRoot: path.join(input.root, 'shell'),
    frameworkRoot: path.join(input.root, 'framework'),
  });
}

test('Nightly notes are deterministic, evidence-bound, and useful to Preview update users', (t) => {
  const input = fixture(t);
  const first = build(input);
  const second = build(input);
  assert.deepEqual(second, first);
  const releaseTitle = `One Person Lab ${input.request.tag}`;
  const firstNonEmptyLine = first.notes.split('\n').find((line) => line.trim().length > 0)?.trim();
  assert.equal(firstNonEmptyLine, 'Scheduled production Nightly.');
  assert.notEqual(firstNonEmptyLine, releaseTitle);
  assert.notEqual(firstNonEmptyLine, `# ${releaseTitle}`);
  assert.match(first.notes, /Preview automatic updates/);
  assert.match(first.notes, /App settings, readiness, provider, or runtime-status surfaces changed/);
  assert.match(first.notes, /Desktop updater, package, or platform behavior changed/);
  assert.match(first.notes, /No migration or backward-compatibility guarantee is inferred/);
  assert.match(first.notes, /not Stable-qualified/);
  assert.match(first.notes, /GitHub Latest is not changed/);
  assert.match(first.notes, /Baseline release: \[v26\.7\.31\]/);
  assert.doesNotMatch(first.notes, /brew install --cask/);
  assert.doesNotMatch(first.notes, /cover internal release receipt/);
  for (const component of first.evidence.components) {
    assert.match(first.notes, new RegExp(component.compare_url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.equal(first.evidence.components[0]?.commit_count, 3);
  assert.equal(first.evidence.notes_sha256.length, 71);
});

test('Nightly notes withhold component commit subjects that are not written in English', (t) => {
  const input = fixture(t, {
    appSubjects: ['移除旧发布故障 Skill，统一发布入口'],
    frameworkSubjects: [
      'feat(release): publish framework OCI install catalog',
      '发布 RCA 0.2.18 的 OCI 软件包描述与载体清单',
    ],
  });
  const { notes, evidence } = build(input);
  assert.doesNotMatch(notes, /[\u3400-\u9fff]/);
  assert.match(notes, /publish framework OCI install catalog/);
  assert.match(notes, /1 commit subject is not shown because it is not written in English/);
  assert.doesNotMatch(notes, /移除旧发布故障/);
  assert.doesNotMatch(notes, /发布 RCA/);
  const app = evidence.components.find((component) => component.id === 'app');
  const framework = evidence.components.find((component) => component.id === 'framework');
  assert.equal(app?.notable_subjects.length, 0);
  assert.deepEqual(app?.withheld_subjects, ['移除旧发布故障 Skill，统一发布入口']);
  assert.equal(framework?.notable_subjects.length, 1);
  assert.deepEqual(framework?.withheld_subjects, ['发布 RCA 0.2.18 的 OCI 软件包描述与载体清单']);
  assert.ok(framework?.commit_subjects.includes('发布 RCA 0.2.18 的 OCI 软件包描述与载体清单'));
  assert.match(notes, /Built-in agent, skill, or Codex integration behavior changed/);
  assert.equal(evidence.current.public_note_language, 'en-US');
});

test('Nightly notes fail closed when public baseline identity drifts', (t) => {
  const input = fixture(t);
  const baseline = structuredClone(input.baseline);
  baseline.release.target_commitish = 'f'.repeat(40);
  assert.throws(
    () => buildNightlyReleaseNotes({
      request: input.request,
      qualification: input.qualification,
      baseline,
      appRoot: path.join(input.root, 'app'),
      shellRoot: path.join(input.root, 'shell'),
      frameworkRoot: path.join(input.root, 'framework'),
    }),
    /does not bind one exact published Release/,
  );
});

test('Nightly notes fail closed when the checked out source is not the frozen request', (t) => {
  const input = fixture(t);
  const request = structuredClone(input.request) as NightlyReleaseRequest;
  request.source.shell_sha = input.shell.previous;
  assert.throws(
    () => buildNightlyReleaseNotes({
      request,
      qualification: input.qualification,
      baseline: input.baseline,
      appRoot: path.join(input.root, 'app'),
      shellRoot: path.join(input.root, 'shell'),
      frameworkRoot: path.join(input.root, 'framework'),
    }),
    /request digest does not bind the exact request body/,
  );
});
