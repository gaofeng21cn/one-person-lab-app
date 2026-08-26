import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';
import {
  materializePinnedStandardBootstrapInstaller,
  resolveStandardFrameworkBootstrapPin,
} from '../../scripts/prepare-standard-release-payload.ts';

const appRoot = process.cwd();
const workflowPath = path.join(appRoot, '.github', 'workflows', '_build-reusable.yml');
const appInstallerPath = path.join(appRoot, 'install.sh');
const frameworkRef = 'c'.repeat(40);
const installerUrl = `https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/${frameworkRef}/install.sh`;
const archiveUrl = `https://github.com/gaofeng21cn/one-person-lab/archive/${frameworkRef}.tar.gz`;

function buildJob(): Record<string, any> {
  const workflow = parseYaml(fs.readFileSync(workflowPath, 'utf8')) as Record<string, any>;
  return workflow.jobs.build;
}

test('release-bound Standard payload requires one exact lowercase Framework SHA', () => {
  assert.deepEqual(
    resolveStandardFrameworkBootstrapPin({
      OPL_STANDARD_PAYLOAD_RELEASE_BOUND: 'true',
      OPL_STANDARD_PAYLOAD_FRAMEWORK_REF: frameworkRef,
    }),
    { frameworkRef, installerUrl, archiveUrl },
  );
  assert.throws(
    () => resolveStandardFrameworkBootstrapPin({ OPL_STANDARD_PAYLOAD_RELEASE_BOUND: 'true' }),
    /requires an exact OPL_STANDARD_PAYLOAD_FRAMEWORK_REF/,
  );
  assert.throws(
    () => resolveStandardFrameworkBootstrapPin({
      OPL_STANDARD_PAYLOAD_RELEASE_BOUND: 'true',
      OPL_STANDARD_PAYLOAD_FRAMEWORK_REF: 'main',
    }),
    /exact lowercase 40-character Framework SHA/,
  );
  assert.throws(
    () => resolveStandardFrameworkBootstrapPin({
      OPL_STANDARD_PAYLOAD_RELEASE_BOUND: 'true',
      OPL_STANDARD_PAYLOAD_FRAMEWORK_REF: frameworkRef.toUpperCase(),
    }),
    /exact lowercase 40-character Framework SHA/,
  );
  assert.equal(resolveStandardFrameworkBootstrapPin({}), null);
});

test('materialized Standard installer binds raw installer and archive to the same exact Framework SHA', () => {
  const source = fs.readFileSync(appInstallerPath, 'utf8');
  const materialized = materializePinnedStandardBootstrapInstaller(source, {
    frameworkRef,
    installerUrl,
    archiveUrl,
  });

  assert.match(materialized, new RegExp(`OPL_FRAMEWORK_SOURCE_REF=.*${frameworkRef}`));
  assert.match(materialized, new RegExp(`OPL_INSTALL_BRANCH=.*${frameworkRef}`));
  assert.match(materialized, /OPL_INSTALL_SOURCE_MODE=.*archive/);
  assert.ok(materialized.includes(installerUrl));
  assert.ok(materialized.includes(archiveUrl));
  assert.match(
    materialized,
    /export OPL_FRAMEWORK_SOURCE_REF OPL_INSTALL_BRANCH OPL_INSTALL_SOURCE_MODE OPL_SOURCE_ARCHIVE_URL/,
  );
  assert.ok(!materialized.includes(
    'https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh',
  ));

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-bootstrap-pin-'));
  try {
    const materializedPath = path.join(tempRoot, 'opl-install.sh');
    fs.writeFileSync(materializedPath, materialized, { mode: 0o755 });
    const syntax = spawnSync('/bin/bash', ['-n', materializedPath], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('Standard bootstrap materialization fails closed on identity drift or source-anchor drift', () => {
  const source = fs.readFileSync(appInstallerPath, 'utf8');
  assert.throws(
    () => materializePinnedStandardBootstrapInstaller(source, {
      frameworkRef,
      installerUrl: installerUrl.replace(frameworkRef, 'd'.repeat(40)),
      archiveUrl,
    }),
    /must bind the same exact Framework SHA/,
  );
  assert.throws(
    () => materializePinnedStandardBootstrapInstaller(source.replace('set -euo pipefail\n', ''), {
      frameworkRef,
      installerUrl,
      archiveUrl,
    }),
    /Strict-mode anchor must occur exactly once/,
  );
  assert.throws(
    () => materializePinnedStandardBootstrapInstaller(
      source.replace('/one-person-lab/main/install.sh', '/one-person-lab/develop/install.sh'),
      { frameworkRef, installerUrl, archiveUrl },
    ),
    /Canonical Framework installer default must occur exactly once/,
  );
});

test('reusable release build passes frozen framework_ref into Standard payload materialization', () => {
  const build = buildJob();
  const validateIndex = build.steps.findIndex(
    (step: Record<string, unknown>) => step.name === 'Validate immutable release-bound build refs',
  );
  const prepareIndex = build.steps.findIndex(
    (step: Record<string, unknown>) => step.name === 'Prepare standard App payload',
  );
  assert.ok(validateIndex >= 0 && prepareIndex > validateIndex);
  const prepare = build.steps[prepareIndex];
  assert.equal(prepare.env.OPL_STANDARD_PAYLOAD_FRAMEWORK_REF, '${{ inputs.framework_ref }}');
  assert.equal(
    prepare.env.OPL_STANDARD_PAYLOAD_RELEASE_BOUND,
    "${{ inputs.operation != '' && 'true' || 'false' }}",
  );
  assert.equal(
    prepare.run,
    'node --experimental-strip-types scripts/prepare-standard-release-payload.ts',
  );
});

test('Studio release workflow checks out and materializes the exact Standard bootstrap cohort', () => {
  const workflow = parseYaml(fs.readFileSync(
    path.join(appRoot, '.github', 'workflows', '_release-studio.yml'),
    'utf8',
  )) as Record<string, any>;
  const build = workflow.jobs['build-signed-notarized'];
  assert.equal(workflow.on.workflow_call.inputs.framework_ref.required, true);
  const checkout = build.steps.find(
    (step: Record<string, unknown>) => step.name === 'Checkout exact Framework bootstrap source',
  );
  assert.equal(checkout.with.repository, 'gaofeng21cn/one-person-lab');
  assert.equal(checkout.with.ref, '${{ inputs.framework_ref }}');
  assert.equal(checkout.with.path, 'framework-source');
  const bind = build.steps.find(
    (step: Record<string, unknown>) => step.name === 'Bind exact source and numeric version identity',
  );
  assert.match(bind.run, /git -C framework-source rev-parse HEAD/);
  assert.match(bind.run, /--framework-ref "\$FRAMEWORK_REF"/);
  const materialize = build.steps.find(
    (step: Record<string, unknown>) => step.name === 'Materialize exact Studio Standard Framework bootstrap',
  );
  assert.match(materialize.run, /prepare-standard-release-payload\.ts"? studio/);
  assert.match(materialize.run, /--framework-ref "\$FRAMEWORK_REF"/);
  assert.match(materialize.run, /resources\/opl-framework-bootstrap\/manifest\.json/);
});
