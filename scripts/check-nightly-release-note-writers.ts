/** Read-only cloud probe using public App commit evidence; never publishes a product. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildFallbackReleaseNotes } from './release-notes-ai-writer/fallback-chain.ts';
import type { ReleaseNotesEvidence } from './release-notes/types.ts';
import { writeNightlySummary } from './nightly-release-note-writer.ts';

const output = path.resolve('nightly-note-writer-check');
fs.mkdirSync(output, { recursive: true });
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256_000 }).trim();
// Use a small, real public source change without inventing a release or qualification identity.
const evidence = JSON.stringify({
  scope: 'read-only writer probe over the exact App HEAD commit; not release qualification',
  repository: 'gaofeng21cn/one-person-lab-app',
  previous_ref: git('rev-parse', 'HEAD^'), current_ref: git('rev-parse', 'HEAD'),
  commit: git('log', '-1', '--format=%s'),
  diff: git('diff', '--no-ext-diff', '--no-textconv', 'HEAD^', 'HEAD', '--', 'scripts/nightly-release-note-writer.ts', 'scripts/release-note-writer-chain.ts'),
});
const token = process.env.GITHUB_TOKEN;
const key = process.env.OPL_RELEASE_NOTES_CODEX_API_KEY;
assert.ok(token && key, 'The cloud check requires both configured writer credentials.');
const failCopilot = async () => { throw new Error('injected_copilot_failure'); };
const cases = [
  { name: 'copilot-live', options: { copilotToken: token, apiKey: key }, model: 'copilot-auto' },
  { name: 'copilot-failure-to-flash', options: { copilotToken: token, apiKey: key, copilot: failCopilot }, model: 'deepseek-flash' },
  { name: 'copilot-and-flash-failure-to-luna', options: { copilotToken: token, apiKey: key, copilot: failCopilot,
    request: async (url: string | URL | Request, options?: RequestInit) => JSON.parse(String(options?.body)).model === 'deepseek-flash' ? new Response(null, { status: 429 }) : fetch(url, options) }, model: 'gpt-6-luna' },
  { name: 'all-fail-to-mechanical', options: { copilotToken: token, apiKey: key, copilot: failCopilot,
    request: async () => new Response(null, { status: 429 }) }, model: null },
];
const results = [];
for (const probe of cases) {
  const result = await writeNightlySummary(evidence, probe.options);
  results.push({ name: probe.name, ...result.writer });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(results, null, 2) + '\n');
  fs.writeFileSync(path.join(output, probe.name + '.md'), result.summary ?? 'Mechanical fallback selected; production retains the full deterministic Nightly disclosure.\n');
  assert.equal(result.writer.mode, probe.model ? 'online-ai' : 'mechanical', probe.name);
  if (probe.model) assert.equal('model' in result.writer ? result.writer.model : null, probe.model, probe.name);
}
console.log(JSON.stringify(results, null, 2));

const stableEvidence: ReleaseNotesEvidence = {
  schema: 'opl_app_release_notes_evidence.v1', version: 'writer-check', channel: 'stable',
  release_title: 'One Person Lab writer check', release_repo: 'gaofeng21cn/one-person-lab-app',
  current_tag: 'writer-check', previous_tag: null, app_commit_subjects: [git('log', '-1', '--format=%s')], shell_commit_subjects: [],
  grouped_changes: [], payload: { include_full_package: false, full_payload_authority_sha256: null, lines: ['- Read-only writer preview, no package publication.'], bundled_refs: [], updates_since_previous_stable: [] },
  agent_runtime_changes: [], family_repo_changes: [],
  release_scope: 'Read-only writer preview; no product release or qualification is performed.',
  install_command: 'brew install --cask gaofeng21cn/one-person-lab/one-person-lab',
  full_changelog_url: 'https://github.com/gaofeng21cn/one-person-lab-app/commit/' + git('rev-parse', 'HEAD'),
};
for (const probe of cases) {
  const result = await buildFallbackReleaseNotes(stableEvidence, probe.options);
  const name = 'stable-' + probe.name;
  results.push({ name, ...result.writer });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(results, null, 2) + '\n');
  fs.writeFileSync(path.join(output, name + '.md'), result.notes);
  assert.equal(result.writer.mode, probe.model ? 'online-ai' : 'mechanical', name);
  if (probe.model) assert.equal(result.writer.model, probe.model, name);
}
console.log(JSON.stringify(results, null, 2));
