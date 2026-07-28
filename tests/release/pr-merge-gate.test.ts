import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'pr-merge-gate.yml');
const templatePath = path.join(process.cwd(), '.github', 'pull_request_template.md');
const testingGuidePath = path.join(process.cwd(), 'docs', 'testing', 'README.md');

test('PR merge gate is a read-only GitHub-hosted aggregate check', () => {
  const source = fs.readFileSync(workflowPath, 'utf8');
  const workflow = parseYaml(source) as Record<string, any>;

  assert.deepEqual(Object.keys(workflow.on), ['pull_request']);
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(Object.keys(workflow.permissions).length, 1);
  assert.equal(workflow.jobs.quality.name, 'PR / quality checks');
  assert.equal(workflow.jobs['merge-gate'].name, 'PR / merge gate');
  assert.equal(workflow.jobs['merge-gate'].if, 'always()');
  assert.deepEqual(workflow.jobs['merge-gate'].needs, ['quality']);
  const shellSetup = workflow.jobs.quality.steps.find(
    (step: Record<string, unknown>) => step.uses === './.github/actions/setup-active-shell-deps',
  );
  assert.equal(shellSetup.with['fetch-depth'], '0');
  assert.match(source, /runs-on: ubuntu-latest/);
  assert.match(source, /OPL_FLOW_WORKFLOW_POLICY/);
  assert.match(source, /OPL_FULL_OPL_FLOW_ROOT/);
  assert.match(source, /npm run typecheck/);
  assert.match(source, /npm run validate:active-shell -- --quick/);
  assert.match(source, /npm run format:check/);
  assert.match(source, /npm run test:release-boundary/);
  assert.match(source, /actionlint -color -shellcheck= -pyflakes=/);
  assert.doesNotMatch(source, /pull_request_target/);
  assert.doesNotMatch(source, /workflow_dispatch/);
  assert.doesNotMatch(source, /contents:\s*write/);
  assert.doesNotMatch(source, /packages:\s*write/);
  assert.doesNotMatch(source, /gh\s+(release|run\s+(rerun|cancel))/);
});

test('PR guidance keeps Codex review advisory and separates publication validation', () => {
  const template = fs.readFileSync(templatePath, 'utf8');
  const testingGuide = fs.readFileSync(testingGuidePath, 'utf8');

  assert.match(template, /PR \/ merge gate/);
  assert.match(template, /advisory/i);
  assert.doesNotMatch(template, /Codex review gate.*must|不得合并|must not merge/i);
  assert.match(testingGuide, /PR \/ merge gate/);
  assert.match(testingGuide, /Codex.*advisory/i);
  assert.match(testingGuide, /Tart, clean VM, Hyper-V, and WSL2/);
  assert.match(testingGuide, /optional|异步/i);
});
