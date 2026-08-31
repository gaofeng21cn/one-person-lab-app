import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

const appRoot = path.resolve(import.meta.dirname, '../..');
const actionPath = path.join(appRoot, '.github/actions/restore-release-checkpoint/action.yml');
const source = fs.readFileSync(actionPath, 'utf8');
const action = parseYaml(source) as Record<string, any>;
const steps = action.runs.steps as Array<Record<string, any>>;

function step(name: string): Record<string, any> {
  const found = steps.find((candidate) => candidate.name === name);
  assert.ok(found, `missing composite action step: ${name}`);
  return found;
}

test('restore action executes with the caller-bound Framework SHA while preserving checkpoint source lineage', () => {
  assert.equal(
    action.inputs['framework-executor-ref'].required,
    true,
  );
  assert.equal(action.inputs['allow-reconcile-required'].required, false);
  assert.equal(action.inputs['allow-reconcile-required'].default, 'false');
  assert.equal(action.inputs['local-checkpoint-dir'].required, false);
  assert.equal(action.inputs['local-checkpoint-dir'].default, '');
  assert.deepEqual(Object.keys(action.outputs).sort(), [
    'active_unknown_marker_count',
    'app_ref',
    'append_full_operation_deadline_at',
    'append_full_operation_id',
    'append_full_operation_started_at',
    'bundle_digest',
    'bundle_path',
    'channel',
    'checkpoint_dir',
    'checkpoint_import_json',
    'checkpoint_transport_executor',
    'completed_stage',
    'framework_executor_ref',
    'framework_source_ref',
    'live_mutation_allowed',
    'shell_ref',
    'standard_operation_deadline_at',
    'standard_operation_id',
    'standard_operation_started_at',
    'store_dir',
    'tag',
    'transport_run_id',
    'updater_version',
    'version',
  ]);
  const downloadIndex = steps.findIndex((candidate) => candidate.name === 'Download exact portable checkpoint');
  const localBindIndex = steps.findIndex((candidate) => candidate.name === 'Bind local portable checkpoint');
  const bindingIndex = steps.findIndex((candidate) => candidate.name === 'Resolve the opaque checkpoint transport');
  const checkoutIndex = steps.findIndex((candidate) => candidate.name === 'Checkout exact Framework checkpoint executor');
  const installIndex = steps.findIndex((candidate) => candidate.name === 'Install Framework runtime dependencies');
  const importIndex = steps.findIndex((candidate) => candidate.name === 'Verify and import portable checkpoint');
  assert.ok(
    downloadIndex < localBindIndex
      && localBindIndex < bindingIndex
      && bindingIndex < checkoutIndex
      && checkoutIndex < installIndex
      && installIndex < importIndex,
  );
  assert.equal(step('Download exact portable checkpoint').if, "${{ inputs.local-checkpoint-dir == '' }}");
  assert.equal(step('Bind local portable checkpoint').if, "${{ inputs.local-checkpoint-dir != '' }}");
  assert.match(String(step('Bind local portable checkpoint').run), /ln -s/);
  assert.match(String(step('Resolve the opaque checkpoint transport').run), /find -L imported-checkpoint/);

  const binding = String(step('Resolve the opaque checkpoint transport').run);
  assert.doesNotMatch(binding, /\.sources\.framework\.source_commit/);
  assert.match(binding, /framework_executor_ref.*FRAMEWORK_EXECUTOR_REF/);
  assert.match(binding, /FRAMEWORK_EXECUTOR_REF.*\^\[0-9a-f\]\{40\}\$/);
  assert.equal(
    step('Checkout exact Framework checkpoint executor').with.ref,
    '${{ steps.binding.outputs.framework_executor_ref }}',
  );
  assert.doesNotMatch(source, /expected_framework_abi=/);

  const install = String(step('Install Framework runtime dependencies').run);
  assert.match(install, /npm --prefix framework-executor ci --ignore-scripts/);
  assert.doesNotMatch(source, /cli:surface:generate/);

  const restore = String(step('Verify and import portable checkpoint').run);
  assert.match(restore, /git -C framework-executor rev-parse HEAD/);
  assert.match(restore, /framework-executor\/bin\/opl release checkpoint import/);
  assert.match(restore, /framework-executor\/bin\/opl release status/);
  assert.match(restore, /\.release_bundle_checkpoint_import/);
  assert.match(restore, /\.release_bundle_status/);
  assert.match(restore, /rebuild_performed/);
  assert.match(restore, /publish_state_imported/);
  assert.match(restore, /checkpoint_import_json=\$checkpoint_import/);
  assert.match(restore, /active_unknown_markers \| length/);
  assert.match(restore, /live_mutation_allowed/);
  assert.match(source, /allow-reconcile-required/);
  assert.match(restore, /ALLOW_RECONCILE_REQUIRED/);
  assert.match(restore, /status and exact reconcile are required before ordinary mutation/);
  assert.match(restore, /operation_controls\.standard\.operation_id/);
  assert.match(restore, /operation_controls\.append_full\.operation_id/);
  assert.match(restore, /completed_stage=.*checkpoint_stage/);
  assert.match(restore, /\.bundle\.sources\.framework\.source_commit/);
  assert.match(restore, /framework_source_ref=\$framework_source_ref/);
  assert.match(restore, /framework_executor_ref=\$FRAMEWORK_EXECUTOR_REF/);
  assert.doesNotMatch(restore, /test "\$framework_source_ref" = "\$FRAMEWORK_EXECUTOR_REF"/);
  assert.doesNotMatch(source, /inspect-handoff/);
  assert.doesNotMatch(restore, /jq[^\n]*active_unknown_markers[^\n]*"\$CHECKPOINT"/);
});

test('restore action treats checkpoint contents as opaque Framework input', () => {
  assert.match(source, /downloaded-inputs\.json/);
  for (const forbidden of [
    'standard-build-receipt.json',
    'full-build-receipt.json',
    '--source-build-receipt',
    'app_transport_provenance',
    'source_build_executor',
    'standard_source_build_executor',
    'full_source_build_executor',
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden.replaceAll('.', '\\.')));
  }
  assert.match(source, /checkpoint_transport_executor=github_actions/);
  assert.match(source, /transport_run_id=\$GITHUB_RUN_ID/);
});

test('restore action persists typed failure evidence before returning failure', () => {
  assert.match(source, /input\.sha256/);
  assert.match(source, /bound-input\.json/);
  assert.match(source, /restore\.stdout\.log/);
  assert.match(source, /restore\.stderr\.log/);
  assert.match(source, /framework-executor\.stdout\.log/);
  assert.match(source, /framework-executor\.stderr\.log/);
  assert.match(source, /checkpoint-import-failure\.json/);
  const upload = step('Upload typed restore failure evidence');
  assert.equal(upload.if, '${{ failure() }}');
  assert.equal(upload.with.path, '${{ runner.temp }}/opl-release-checkpoint-restore-${{ github.job }}');
  assert.equal(upload.with['if-no-files-found'], 'error');
});

test('checkpoint bootstrap binds only the executor while source identity remains opaque until verified import', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-restore-binding-'));
  try {
    const expected = 'c'.repeat(40);
    const checkpointDir = path.join(directory, 'imported-checkpoint', 'standard-checkpoint');
    const evidenceDir = path.join(directory, 'evidence');
    fs.mkdirSync(checkpointDir, { recursive: true });
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(checkpointDir, 'checkpoint.json'), '{}\n');
    fs.writeFileSync(path.join(checkpointDir, 'opaque-sidecar.json'), '{"not":"app-state"}\n');
    fs.writeFileSync(path.join(evidenceDir, 'input.json'), '{}\n');
    fs.writeFileSync(path.join(evidenceDir, 'restore.stdout.log'), '');
    fs.writeFileSync(path.join(evidenceDir, 'restore.stderr.log'), '');
    const output = path.join(directory, 'github-output.txt');
    const binding = String(step('Resolve the opaque checkpoint transport').run);
    const env = {
      ...process.env,
      EVIDENCE_DIR: evidenceDir,
      FRAMEWORK_EXECUTOR_REF: expected,
      SOURCE_ARTIFACT: 'fixture-checkpoint',
      GITHUB_OUTPUT: output,
    };
    const accepted = spawnSync('bash', ['-c', binding], { cwd: directory, env, encoding: 'utf8' });
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(fs.readFileSync(output, 'utf8'), new RegExp(`framework_executor_ref=${expected}`));
    assert.doesNotMatch(fs.readFileSync(output, 'utf8'), /framework_source_ref=/);
    assert.match(fs.readFileSync(path.join(evidenceDir, 'input.sha256'), 'utf8'), /^sha256:[0-9a-f]{64}\n$/);
    const downloaded = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'downloaded-inputs.json'), 'utf8'));
    assert.deepEqual(downloaded.map((entry: Record<string, unknown>) => entry.path), [
      'standard-checkpoint/checkpoint.json',
      'standard-checkpoint/opaque-sidecar.json',
    ]);

    const rejected = spawnSync('bash', ['-c', binding], {
      cwd: directory,
      env: { ...env, FRAMEWORK_EXECUTOR_REF: 'not-an-exact-sha', GITHUB_OUTPUT: `${output}.rejected` },
      encoding: 'utf8',
    });
    assert.notEqual(rejected.status, 0);
    assert.match(`${rejected.stdout}\n${rejected.stderr}`, /must be an exact lowercase SHA/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('restore action shell blocks remain syntactically valid after expression substitution', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-restore-action-shell-'));
  try {
    for (const [index, step] of action.runs.steps.entries()) {
      if (typeof step.run !== 'string') continue;
      const script = step.run.replace(/\$\{\{[^}]+\}\}/g, 'fixture');
      const scriptPath = path.join(directory, `${index}.sh`);
      fs.writeFileSync(scriptPath, script);
      const checked = spawnSync('bash', ['-n', scriptPath], { encoding: 'utf8' });
      assert.equal(checked.status, 0, `${step.name}: ${checked.stderr}`);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
