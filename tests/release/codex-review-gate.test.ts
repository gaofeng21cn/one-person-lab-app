import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

import { evaluateCodexReviewGate } from '../../scripts/codex-review-gate.ts';

const headSha = 'a'.repeat(40);
const bot = 'chatgpt-codex-connector[bot]';

test('Codex review gate waits until the current head has terminal review evidence', () => {
  const result = evaluateCodexReviewGate({
    headSha,
    reviews: [{ user: { login: bot }, commit_id: 'b'.repeat(40) }],
    reactions: [],
    reviewThreads: [],
  });
  assert.equal(result.status, 'waiting');
});

test('Codex review gate fails only for unresolved current bot threads', () => {
  const result = evaluateCodexReviewGate({
    headSha,
    reviews: [{ user: { login: bot }, commit_id: headSha }],
    reactions: [],
    reviewThreads: [
      { isResolved: false, isOutdated: false, comments: [{ author: { login: bot } }] },
      { isResolved: false, isOutdated: true, comments: [{ author: { login: bot } }] },
      { isResolved: false, isOutdated: false, comments: [{ author: { login: 'other-reviewer' } }] },
    ],
  });
  assert.equal(result.status, 'failed');
  assert.match(result.summary, /1 unresolved current review thread/);
});

test('Codex review gate accepts a current review or head-bound positive acknowledgement without open threads', () => {
  const reviewed = evaluateCodexReviewGate({
    headSha,
    reviews: [{ user: { login: bot }, commit_id: headSha }],
    reactions: [],
    reviewThreads: [{ isResolved: true, isOutdated: false, comments: [{ author: { login: bot } }] }],
  });
  assert.equal(reviewed.status, 'passed');

  const acknowledged = evaluateCodexReviewGate({
    headSha,
    reviews: [],
    reactions: [{ user: { login: bot }, content: '+1', source_head_sha: headSha }],
    reviewThreads: [],
  });
  assert.equal(acknowledged.status, 'passed');
});

test('Codex review gate ignores a reaction not bound to the exact head', () => {
  const result = evaluateCodexReviewGate({
    headSha,
    reviews: [],
    reactions: [{ user: { login: bot }, content: '+1', source_head_sha: 'b'.repeat(40) }],
    reviewThreads: [],
  });
  assert.equal(result.status, 'waiting');
});

test('Codex review gate rejects unbound request-comment reactions', () => {
  const currentRequest = evaluateCodexReviewGate({
    headSha,
    reviews: [],
    reactions: [{
      user: { login: bot },
      content: '+1',
      source_head_sha: null,
    }],
    reviewThreads: [],
  });
  assert.equal(currentRequest.status, 'waiting');
});

test('Codex review advisory is read-only and never becomes a required-check writer', () => {
  const source = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'codex-review-gate.yml'), 'utf8');
  const workflow = parseYaml(source) as Record<string, any>;
  assert.ok(workflow.on.pull_request_target);
  assert.ok(workflow.on.pull_request_review);
  assert.ok(workflow.on.workflow_dispatch.inputs.pull_number.required);
  assert.equal(workflow.permissions.checks, undefined);
  assert.equal(workflow.permissions.issues, 'read');
  assert.match(workflow.jobs.gate.if, /pull_request\.draft/);
  assert.equal(workflow.jobs.gate.name, 'Codex review advisory');
  assert.equal(workflow.jobs.gate.steps[0].with.ref, '${{ github.event.repository.default_branch }}');
  assert.match(source, /CODEX_REVIEW_WAIT_SECONDS/);
  assert.doesNotMatch(source, /CODEX_REVIEW_REQUEST_HEAD/);
  assert.match(source, /github\.event_name == 'workflow_dispatch' && '0' \|\| '900'/);
  assert.match(source, /scripts\/codex-review-gate\.ts/);
  const gateSource = fs.readFileSync(path.join(process.cwd(), 'scripts', 'codex-review-gate.ts'), 'utf8');
  assert.match(gateSource, /issues\/comments\/\$\{comment\.id\}\/reactions/);
  assert.doesNotMatch(gateSource, /check-runs/);
  assert.match(gateSource, /codex-review-head/);
  assert.doesNotMatch(gateSource, /ensureHeadBoundCodexReviewRequest/);
  assert.match(source, /pull_request_target/);
});
