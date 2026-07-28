import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const appRoot = path.resolve(import.meta.dirname, '../..');
const appSha = 'a'.repeat(40);
const shellSha = 'b'.repeat(40);
const frameworkSha = 'c'.repeat(40);
const version = '26.7.29';

test('frozen universal installer binds one exact release cohort and remains executable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-frozen-installer-'));
  const output = path.join(root, 'opl-install.sh');
  try {
    const generated = spawnSync(process.execPath, [
      '--experimental-strip-types',
      'scripts/generate-frozen-universal-installer.ts',
      '--source', 'install.sh',
      '--output', output,
      '--version', version,
      '--app-sha', appSha,
      '--shell-sha', shellSha,
      '--framework-sha', frameworkSha,
      '--repository', 'gaofeng21cn/one-person-lab-app',
    ], { cwd: appRoot, encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);

    const script = fs.readFileSync(output, 'utf8');
    assert.match(script, /^#!\/usr\/bin\/env bash\n/);
    assert.equal(script.includes('/main/'), false);
    assert.equal(script.includes('releases/latest'), false);
    assert.match(script, new RegExp(`OPL_APP_SOURCE_REF='${appSha}'`));
    assert.match(script, new RegExp(`OPL_SHELL_SOURCE_REF='${shellSha}'`));
    assert.match(script, new RegExp(`OPL_FRAMEWORK_SOURCE_REF='${frameworkSha}'`));
    assert.match(script, new RegExp(`OPL_RELEASE_VERSION='${version.replaceAll('.', '\\.')}'`));
    assert.match(script, /OPL_RELEASE_REPO='gaofeng21cn\/one-person-lab-app'/);
    assert.match(script, new RegExp(`OPL_CONTAINER_WEBUI_TAG='${version.replaceAll('.', '\\.')}'`));
    assert.match(script, new RegExp(`OPL_FROZEN_RELEASE_TAG='v${version.replaceAll('.', '\\.')}'`));
    assert.match(
      script,
      new RegExp(`one-person-lab/archive/${frameworkSha}\\.tar\\.gz`),
    );
    assert.match(
      script,
      new RegExp(`one-person-lab-app/${appSha}/scripts/install-docker-webui\\.sh`),
    );
    assert.notEqual(fs.statSync(output).mode & 0o111, 0);

    const syntax = spawnSync('bash', ['-n', output], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr);

    const drift = spawnSync('bash', [
      output,
      '--print-install-route',
      '--release-tag',
      'v26.7.30',
    ], { encoding: 'utf8' });
    assert.notEqual(drift.status, 0);
    assert.match(drift.stderr, /bound to Release tag v26\.7\.29/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('frozen universal installer accepts the canonical Preview version family', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-frozen-preview-installer-'));
  const output = path.join(root, 'opl-install.sh');
  try {
    const generated = spawnSync(process.execPath, [
      '--experimental-strip-types',
      'scripts/generate-frozen-universal-installer.ts',
      '--source', 'install.sh',
      '--output', output,
      '--version', '26.7.29-preview.r1',
      '--app-sha', appSha,
      '--shell-sha', shellSha,
      '--framework-sha', frameworkSha,
    ], { cwd: appRoot, encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);
    assert.match(
      fs.readFileSync(output, 'utf8'),
      /OPL_FROZEN_RELEASE_TAG='v26\.7\.29-preview\.r1'/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
