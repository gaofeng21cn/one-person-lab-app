import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildFallbackReleaseNotes, validatePreparedReleaseNotes } from '../../scripts/release-notes-ai-writer/fallback-chain.ts';
import { extractLocalizedReleaseNotes, stripLocalizedReleaseNotes } from '../../scripts/release-notes-ai-writer/markdown-normalization.ts';
import { validStandardAiReleaseNotes, stableInstallCommand } from './app-release-boundary-cases/release-notes-fixtures.ts';
import type { ReleaseNotesEvidence } from '../../scripts/release-notes/types.ts';

const evidence: ReleaseNotesEvidence = {
  schema: 'opl_app_release_notes_evidence.v1', version: '26.10.12', channel: 'stable',
  release_title: 'One Person Lab v26.10.12', release_repo: 'gaofeng21cn/one-person-lab-app',
  current_tag: 'v26.10.12', previous_tag: 'v26.10.8',
  app_commit_subjects: ['fix: preserve an existing draft'], shell_commit_subjects: [], grouped_changes: [],
  payload: { include_full_package: false, full_payload_authority_sha256: null, lines: ['- Standard package only.'], bundled_refs: [], updates_since_previous_stable: [] },
  agent_runtime_changes: [], family_repo_changes: [], release_scope: 'Standard macOS arm64 updater package.',
  install_command: stableInstallCommand, full_changelog_url: 'https://github.com/gaofeng21cn/one-person-lab-app/compare/v26.10.8...v26.10.12',
};
const copy = validStandardAiReleaseNotes(evidence.version);
const fail = async () => { throw new Error('copilot-fixture-key'); };

test('Stable provider order stops at the first valid writer and falls through content errors', { skip: !process.env.OPL_RELEASE_NOTES_WRITER_MODULE }, async () => {
  for (const winner of ['copilot-auto', 'deepseek-flash', 'gpt-6-luna']) {
    const calls: string[] = [];
    const result = await buildFallbackReleaseNotes(evidence, {
      copilotToken: 'copilot-fixture-key', apiKey: 'gateway-fixture-key',
      copilot: async () => { calls.push('copilot-auto'); return winner === 'copilot-auto' ? copy : 'invalid'; },
      request: async (_url, options) => {
        const model = JSON.parse(String(options?.body)).model;
        calls.push(model);
        return Response.json({ choices: [{ finish_reason: 'stop', message: { content: winner === model ? copy : 'invalid' } }] });
      },
    });
    assert.equal(result.writer.model, winner);
    assert.deepEqual(calls, ['copilot-auto', 'deepseek-flash', 'gpt-6-luna'].slice(0, ['copilot-auto', 'deepseek-flash', 'gpt-6-luna'].indexOf(winner) + 1));
    validatePreparedReleaseNotes(result.notes, evidence);
  }
});

test('Stable exhaustion produces honest, bilingual mechanical notes with exact install and comparison facts', { skip: !process.env.OPL_RELEASE_NOTES_WRITER_MODULE }, async () => {
  const result = await buildFallbackReleaseNotes(evidence, {
    copilotToken: 'copilot-fixture-key', apiKey: 'gateway-fixture-key', copilot: fail,
    request: async () => new Response(null, { status: 429 }),
  });
  assert.equal(result.writer.mode, 'mechanical');
  assert.deepEqual(result.writer.attempts.map((item) => item.provider), ['copilot-auto', 'deepseek-flash', 'gpt-6-luna']);
  assert.match(result.notes, /GENERATOR:mechanical/);
  assert.doesNotMatch(result.notes, /GENERATOR:online-ai|copilot-fixture-key|gateway-fixture-key|No manual migration is required/);
  assert.match(result.notes, /preserve an existing draft/);
  assert.ok(result.notes.includes(stableInstallCommand));
  assert.ok(result.notes.includes(evidence.full_changelog_url!));
  assert.doesNotMatch(stripLocalizedReleaseNotes(result.notes), /[\u3400-\u9fff]/);
  assert.match(extractLocalizedReleaseNotes(result.notes, 'zh-CN')!, /变更/);
  validatePreparedReleaseNotes(result.notes, evidence);
});

test('Stable CLI missing credentials succeeds mechanically and records truthful provenance', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stable-note-fallback-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'evidence.json'), JSON.stringify(evidence));
  const run = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/release-notes-ai-writer.ts',
    '--evidence', path.join(root, 'evidence.json'), '--output', path.join(root, 'notes.md'),
    '--receipt-output', path.join(root, 'receipt.json')], { encoding: 'utf8',
    env: { ...process.env, OPL_RELEASE_NOTES_PROVIDER: 'fallback_chain', GITHUB_TOKEN: '', OPL_RELEASE_NOTES_CODEX_API_KEY: '' } });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'receipt.json'), 'utf8')).writer.mode, 'mechanical');
  assert.match(fs.readFileSync(path.join(root, 'notes.md'), 'utf8'), /GENERATOR:mechanical/);
});

test('shared source unavailable still produces valid Stable mechanical copy with credentials present', async (t) => {
  const old = process.env.OPL_RELEASE_NOTES_WRITER_MODULE;
  t.after(() => { if (old === undefined) delete process.env.OPL_RELEASE_NOTES_WRITER_MODULE; else process.env.OPL_RELEASE_NOTES_WRITER_MODULE = old; });
  process.env.OPL_RELEASE_NOTES_WRITER_MODULE = '/missing-shared-note-writer/writer.mjs';
  const result = await buildFallbackReleaseNotes(evidence, {
    copilotToken: 'copilot-fixture-key', apiKey: 'gateway-fixture-key',
    copilot: async () => { assert.fail('Unavailable central source cannot call providers'); },
  });
  assert.equal(result.writer.mode, 'mechanical');
  assert.equal(result.writer.reason, 'shared_writer_unavailable');
  validatePreparedReleaseNotes(result.notes, evidence);
});

test('the shared Preview finalizer preserves mechanical provenance and excludes Stable install instructions', async () => {
  const { finalizePreviewReleaseNotesDocument } = await import('../../scripts/release-notes.ts');
  const preview = { ...evidence, channel: 'preview' as const, install_command: null,
    release_scope: 'Qualified manual Standard macOS arm64 Desktop publication. It may temporarily become Latest; the next qualified Stable reclaims Latest. Preview does not publish Homebrew, Full, Native WebUI, Container WebUI, or a production WebUI follower handoff.' };
  const result = await buildFallbackReleaseNotes(preview, { copilotToken: '', apiKey: '' });
  const finalized = finalizePreviewReleaseNotesDocument(result.notes, preview);
  assert.match(finalized, /GENERATOR:mechanical/);
  assert.doesNotMatch(finalized, /GENERATOR:online-ai|## Install Stable/);
  validatePreparedReleaseNotes(finalized, preview);
});

test('the new Stable chain does not invent highlights or upgrade safety while filling exact facts', { skip: !process.env.OPL_RELEASE_NOTES_WRITER_MODULE }, async () => {
  const visible = 'Recorded change: an existing draft is preserved.';
  const raw = `${visible}\n<!-- OPL_RELEASE_NOTES:en-US\n${evidence.release_title}\n${visible}\n-->\n<!-- OPL_RELEASE_NOTES:zh-CN\n${evidence.release_title}\n保留已有草稿。\n-->`;
  const result = await buildFallbackReleaseNotes(evidence, { copilotToken: 'copilot-fixture-key', apiKey: '', copilot: async () => raw });
  assert.match(result.notes, /an existing draft is preserved/);
  assert.doesNotMatch(result.notes, /refreshed built-in|clearer setup|No manual migration|## Highlights/);
  assert.ok(result.notes.includes(stableInstallCommand));
  assert.ok(result.notes.includes(evidence.release_scope));
  validatePreparedReleaseNotes(result.notes, evidence);
});
