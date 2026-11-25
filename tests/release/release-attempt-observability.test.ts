import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

import {
  buildReleaseAttemptObservation,
  classifyReleaseAttemptStage,
} from '../../scripts/release-attempt-observability.ts';

const appRoot = path.resolve(import.meta.dirname, '../..');

function run(conclusion = 'failure') {
  return {
    id: 30180000002,
    run_attempt: 1,
    repository: { full_name: 'gaofeng21cn/one-person-lab-app' },
    path: '.github/workflows/release-stable.yml',
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion,
    head_sha: 'a'.repeat(40),
    created_at: '2026-07-26T01:00:00.000Z',
    run_started_at: '2026-07-26T01:01:00.000Z',
    updated_at: '2026-07-26T01:11:30.000Z',
  };
}

test('machine stage classifier covers the release critical path without becoming authority', () => {
  assert.equal(classifyReleaseAttemptStage('Freeze Bundle contract'), 'freeze_version_notes_contract');
  assert.equal(classifyReleaseAttemptStage('Standard macOS build and notarization'), 'build_source_signing_tests');
  assert.equal(classifyReleaseAttemptStage('Native WebUI qualification'), 'native_webui');
  assert.equal(classifyReleaseAttemptStage('Clean VM first launch'), 'clean_vm');
  assert.equal(classifyReleaseAttemptStage('Restore portable checkpoint'), 'checkpoint_restore');
  assert.equal(classifyReleaseAttemptStage('Updater predecessor 26.7.20'), 'updater_predecessor');
  assert.equal(classifyReleaseAttemptStage('Homebrew and Latest activation'), 'homebrew_latest');

  const observation = buildReleaseAttemptObservation(run(), {
    jobs: [
      { id: 2, name: 'Updater predecessor 26.7.20', conclusion: 'failure', completed_at: '2026-07-26T01:10:00.000Z' },
      { id: 1, name: 'Standard macOS build and notarization', conclusion: 'failure', completed_at: '2026-07-26T01:08:00.000Z' },
    ],
  });
  assert.equal(observation.first_terminal.stage, 'build_source_signing_tests');
  assert.equal(observation.first_terminal.job_id, '1');
  assert.equal(observation.run.wall_minutes, 10.5);
  assert.deepEqual(observation.authority, {
    release_state_authority: false,
    framework_status_authority: false,
    mutation_authority: false,
    may_authorize_retry_rerun_or_redispatch: false,
  });
});

test('cancelled workflow without a terminal job stays observational', () => {
  const observation = buildReleaseAttemptObservation(run('cancelled'), { jobs: [] });
  assert.equal(observation.first_terminal.stage, 'workflow_cancelled');
  assert.equal(observation.terminal_failure_job_count, 0);
});

test('the Stable observer retries a failed jobs read without treating an error page as job data', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stable-observer-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const action = parseYaml(fs.readFileSync(
    path.join(appRoot, '.github/actions/release-followups/observe/action.yml'),
    'utf8',
  ));
  const read = action.runs.steps[0].run;
  const invocations = path.join(root, 'invocations');

  fs.writeFileSync(path.join(root, 'gh'), `#!/bin/bash
if [[ "$2" != "--paginate" ]]; then
  printf '{"id":123}\\n'
  exit 0
fi
if [[ ! -e invocations ]]; then
  printf '1\\n' >> invocations
  printf '[{"jobs":[{"id":1}]},{"message":"Server Error"}]\\n'
  printf 'gh: Server Error (HTTP 502)\\n' >&2
  exit 1
fi
printf '2\\n' >> invocations
printf '[{"jobs":[{"id":1}]},{"jobs":[{"id":2}]}]\\n'
`, { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'sleep'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });

  const result = spawnSync('bash', ['-c', read], {
    cwd: root,
    env: {
      ...process.env,
      PATH: [root, process.env.PATH].join(path.delimiter),
      STABLE_RUN_ID: '123',
      GITHUB_REPOSITORY: 'example/app',
      GH_TOKEN: '',
    },
    encoding: 'utf8',
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(invocations, 'utf8'), '1\n2\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'stable-jobs.json'), 'utf8')), {
    jobs: [{ id: 1 }, { id: 2 }],
  });
});

test('the Stable follow-up hub keeps observation read-only and append-only', () => {
  const hubPath = path.join(appRoot, '.github/workflows/release-stable-post-success-followups.yml');
  const actionPath = path.join(appRoot, '.github/actions/release-followups/observe/action.yml');
  const hubSource = fs.readFileSync(hubPath, 'utf8');
  const actionSource = fs.readFileSync(actionPath, 'utf8');
  const hub = parseYaml(hubSource) as Record<string, any>;
  const observe = hub.jobs.observe;

  assert.equal(
    fs.existsSync(path.join(appRoot, '.github/workflows/release-attempt-observability.yml')),
    false,
  );
  assert.deepEqual(Object.keys(hub.on), ['workflow_call', 'workflow_run', 'workflow_dispatch']);
  assert.equal(observe.if, "${{ needs.route.outputs.observe == 'true' }}");
  assert.deepEqual(observe.permissions, { contents: 'read', actions: 'read' });
  assert.equal(observe.steps.at(-1).uses, './.github/actions/release-followups/observe');
  assert.match(actionSource, /release-attempt-observability\.ts/);
  assert.match(actionSource, /opl-release-attempt-observation-\$\{\{ inputs\.source_run_id \}\}/);
  assert.doesNotMatch(
    actionSource,
    /contents: write|actions: write|gh workflow run|gh run rerun|gh run cancel|gh release (?:create|edit|upload|delete)|git push/,
  );
});
