import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import {
  validateReleaseBundleCanaryTopology,
  validateReleaseBundleTopology,
  validateHomebrewFullPromotionTopology,
  validateIndependentWebuiPreviewTopology,
  validateNightlyReleaseTopology,
  validateNativeWebuiPublicationTopology,
  validateStableReleaseControlPlane,
  validateWorkflowDispatchWriteAuthority,
} from '../../scripts/validate-release-boundary/text-check-runner.ts';

const workflowDirectory = path.join('.github', 'workflows');

function fixture(t: test.TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-boundary-'));
  fs.mkdirSync(path.join(root, '.github'), { recursive: true });
  fs.cpSync(path.join(process.cwd(), workflowDirectory), path.join(root, workflowDirectory), {
    recursive: true,
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function workflowPath(root: string, name: string): string {
  return path.join(root, workflowDirectory, name);
}

function updateWorkflow(
  root: string,
  name: string,
  update: (workflow: Record<string, any>) => void,
): void {
  const file = workflowPath(root, name);
  const workflow = parseYaml(fs.readFileSync(file, 'utf8')) as Record<string, any>;
  update(workflow);
  fs.writeFileSync(file, stringifyYaml(workflow));
}

function withoutExpectedDiagnostics(run: () => number): number {
  const original = console.error;
  console.error = () => {};
  try {
    return run();
  } finally {
    console.error = original;
  }
}

test('release boundary admits the three-operation control plane and real no-secret Canary', () => {
  const release = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'contracts/app-release-channel.json'), 'utf8'));
  const canary = release.release_bundle_control_plane.validation_canary;
  assert.equal(canary.mode, 'validation_only');
  assert.deepEqual(canary.permissions, { contents: 'read', actions: 'read' });
  assert.equal(canary.secrets_allowed, false);
  assert.equal(canary.build_or_vm_execution_allowed, false);
  assert.equal(canary.external_write_allowed, false);
  assert.equal(canary.stable_mutation_allowed, false);
  assert.equal(canary.publication_allowed, false);
  assert.equal(canary.uses_stable_mutation_mutex, false);
  assert.ok(canary.triggers.includes('daily_schedule'));
  assert.equal(fs.existsSync(path.join(process.cwd(), workflowDirectory, 'release-nightly.yml')), true);
  assert.equal(validateStableReleaseControlPlane(process.cwd()), 0);
  assert.equal(validateReleaseBundleTopology(process.cwd()), 0);
  assert.equal(validateReleaseBundleCanaryTopology(process.cwd()), 0);
  assert.equal(validateNightlyReleaseTopology(process.cwd()), 0);
  assert.equal(validateIndependentWebuiPreviewTopology(process.cwd()), 0);
  assert.equal(validateWorkflowDispatchWriteAuthority(process.cwd()), 0);
});

test('Stable operation set and global concurrency are exact and fail closed on drift', (t) => {
  const root = fixture(t);
  updateWorkflow(root, 'release-stable.yml', (workflow) => {
    workflow.on.workflow_dispatch.inputs.operation.options.push('promote');
    workflow.concurrency.group = 'opl-release-bundle-${{ inputs.operation }}';
    workflow.concurrency['cancel-in-progress'] = true;
  });

  assert.ok(withoutExpectedDiagnostics(() => validateStableReleaseControlPlane(root)) >= 2);
});

test('Stable admission binds attempt one and immutable Actions created_at without legacy authority', (t) => {
  const root = fixture(t);
  const file = workflowPath(root, 'release-stable.yml');
  const text = fs.readFileSync(file, 'utf8')
    .replace('test "$GITHUB_RUN_ATTEMPT" = 1', 'test -n "$GITHUB_RUN_ATTEMPT"')
    .replace('--jq .created_at', '--jq .run_started_at')
    .replace('set -euo pipefail', 'set -euo pipefail\n          # verify-release-session-lease.ts');
  fs.writeFileSync(file, text);

  assert.ok(withoutExpectedDiagnostics(() => validateStableReleaseControlPlane(root)) >= 3);
});

test('all privileged Stable entries remain admission-dependent step-free reusable calls', (t) => {
  const root = fixture(t);
  updateWorkflow(root, 'release-stable.yml', (workflow) => {
    workflow.jobs.standard.needs = [];
    workflow.jobs.standard.steps = [{ run: 'gh release upload v0 unexpected.zip' }];
    workflow.jobs.standard.permissions = { contents: 'write', actions: 'write' };
  });

  assert.ok(withoutExpectedDiagnostics(() => validateStableReleaseControlPlane(root)) >= 3);
  assert.ok(withoutExpectedDiagnostics(() => validateWorkflowDispatchWriteAuthority(root)) > 0);
});

test('Manual Preview write entries remain admission-dependent step-free reusable calls', (t) => {
  const root = fixture(t);
  assert.equal(withoutExpectedDiagnostics(() => validateWorkflowDispatchWriteAuthority(root)), 0);

  updateWorkflow(root, 'release-manual-preview.yml', (workflow) => {
    workflow.jobs.preview.needs = [];
    workflow.jobs.preview.with.include_full = true;
    workflow.jobs.preview.permissions.actions = 'write';
  });

  assert.ok(withoutExpectedDiagnostics(() => validateWorkflowDispatchWriteAuthority(root)) > 0);
});

test('Bundle, Standard publish, and Full append responsibilities cannot collapse back into one DAG', (t) => {
  const root = fixture(t);
  const bundleFile = workflowPath(root, '_release-bundle.yml');
  fs.writeFileSync(
    bundleFile,
    fs.readFileSync(bundleFile, 'utf8').replace('opl release checkpoint export', 'opl release checkpoint inspect'),
  );
  const standardFile = workflowPath(root, '_release-standard-publish.yml');
  fs.writeFileSync(
    standardFile,
    `${fs.readFileSync(standardFile, 'utf8')}\n# opl release build\n`,
  );
  const fullFile = workflowPath(root, '_release-full-addon.yml');
  fs.writeFileSync(
    fullFile,
    `${fs.readFileSync(fullFile, 'utf8')}\n# uses: ./.github/workflows/opl-updater-upgrade-vm.yml\n`,
  );

  assert.ok(withoutExpectedDiagnostics(() => validateReleaseBundleTopology(root)) >= 3);
});

test('WebUI follower keeps the packages write compile ceiling outside Desktop Stable', (t) => {
  const root = fixture(t);
  updateWorkflow(root, 'release-webui-follower.yml', (workflow) => {
    workflow.jobs['webui-carrier'].permissions = {
      contents: 'read',
      actions: 'read',
      packages: 'read',
    };
  });

  assert.equal(withoutExpectedDiagnostics(() => validateStableReleaseControlPlane(root)), 0);
  assert.ok(withoutExpectedDiagnostics(() => validateReleaseBundleTopology(root)) > 0);
  assert.ok(withoutExpectedDiagnostics(() => validateWorkflowDispatchWriteAuthority(root)) > 0);
});

test('Native WebUI follower keeps additive GitHub write behind exact Stable handoff and protected reusable publish', (t) => {
  const root = fixture(t);
  assert.equal(withoutExpectedDiagnostics(() => validateNativeWebuiPublicationTopology(root)), 0);
  assert.equal(withoutExpectedDiagnostics(() => validateWorkflowDispatchWriteAuthority(root)), 0);

  updateWorkflow(root, 'release-native-webui-follower.yml', (workflow) => {
    workflow.jobs['native-webui-carrier'].needs = [];
  });
  assert.ok(withoutExpectedDiagnostics(() => validateNativeWebuiPublicationTopology(root)) > 0);
  assert.ok(withoutExpectedDiagnostics(() => validateWorkflowDispatchWriteAuthority(root)) > 0);

  updateWorkflow(root, 'release-native-webui-follower.yml', (workflow) => {
    workflow.jobs['native-webui-carrier'].needs = ['resolve-handoff'];
  });
  updateWorkflow(root, '_release-native-webui-carrier.yml', (workflow) => {
    delete workflow.jobs['publish-native-assets'].environment;
  });
  assert.ok(withoutExpectedDiagnostics(() => validateWorkflowDispatchWriteAuthority(root)) > 0);
});

test('Full Homebrew follower publishes hosted-qualified bytes without a physical VM dependency', (t) => {
  const root = fixture(t);
  assert.equal(withoutExpectedDiagnostics(() => validateHomebrewFullPromotionTopology(root)), 0);
  assert.equal(withoutExpectedDiagnostics(() => validateWorkflowDispatchWriteAuthority(root)), 0);

  updateWorkflow(root, '_release-homebrew-full-publish.yml', (workflow) => {
    workflow.jobs['publish-cask'].needs = ['prepare-candidate', 'qualify-candidate'];
  });
  assert.ok(withoutExpectedDiagnostics(() => validateHomebrewFullPromotionTopology(root)) > 0);

  updateWorkflow(root, '_release-homebrew-full-publish.yml', (workflow) => {
    workflow.jobs['publish-cask'].needs = ['prepare-candidate'];
    workflow.jobs['prepare-candidate'].steps.push({
      run: 'echo $OPL_HOMEBREW_TAP_TOKEN',
    });
  });
  assert.ok(withoutExpectedDiagnostics(() => validateHomebrewFullPromotionTopology(root)) > 0);
});

test('Nightly cannot reuse the Stable Bundle, heavy VM, or Stable mutation mutex', (t) => {
  const root = fixture(t);
  updateWorkflow(root, 'release-nightly.yml', (workflow) => {
    workflow.concurrency.group = 'opl-release-bundle-global';
    workflow.jobs['standard-build'].uses = './.github/workflows/_release-bundle.yml';
    workflow.jobs['standard-build'].with.require_macos_gatekeeper = true;
  });

  assert.ok(withoutExpectedDiagnostics(() => validateNightlyReleaseTopology(root)) >= 3);
});

test('Nightly keeps one schedule and moves Homebrew and VM work out of band', (t) => {
  const root = fixture(t);
  fs.writeFileSync(workflowPath(root, 'nightly-shadow.yml'), `name: OPL Shadow Nightly
on:
  schedule:
    - cron: '0 0 * * *'
jobs: {}
`);
  assert.ok(withoutExpectedDiagnostics(() => validateNightlyReleaseTopology(root)) > 0);

  fs.rmSync(workflowPath(root, 'nightly-shadow.yml'));
  const release = workflowPath(root, 'release-nightly.yml');
  fs.appendFileSync(release, '\n# update-homebrew tap and tart gate\n');
  assert.ok(withoutExpectedDiagnostics(() => validateNightlyReleaseTopology(root)) > 0);
});

test('Canary compile ceilings keep reachable jobs read-only and mutation unreachable', (t) => {
  const root = fixture(t);
  updateWorkflow(root, 'release-bundle-canary.yml', (workflow) => {
    delete workflow.jobs['nested-updater-qualification'];
    workflow.jobs.standard.secrets = 'inherit';
    workflow.jobs['nested-standard-build'].permissions.contents = 'write';
    workflow.jobs['nested-webui-carrier'].permissions.packages = 'read';
    workflow.jobs['nested-webui-carrier'].secrets = 'inherit';
  });
  updateWorkflow(root, '_release-bundle.yml', (workflow) => {
    workflow.jobs['startup-canary'].permissions.contents = 'write';
  });
  updateWorkflow(root, '_build-reusable.yml', (workflow) => {
    workflow.permissions = 'write-all';
  });
  updateWorkflow(root, 'opl-first-run-vm.yml', (workflow) => {
    workflow.jobs['startup-canary'].permissions = 'write-all';
  });
  updateWorkflow(root, '_release-webui-carrier.yml', (workflow) => {
    workflow.jobs['build-and-qualify'].if = "${{ inputs.mode == 'canary' }}";
    workflow.jobs['publish-immutable-carrier'].if = "${{ inputs.mode == 'canary' }}";
  });

  assert.ok(withoutExpectedDiagnostics(() => validateReleaseBundleCanaryTopology(root)) >= 10);
});

test('independent WebUI Preview publication cannot absorb Latest promotion or Desktop authority', (t) => {
  const root = fixture(t);
  assert.equal(withoutExpectedDiagnostics(() => validateIndependentWebuiPreviewTopology(root)), 0);

  updateWorkflow(root, 'release-webui-development.yml', (workflow) => {
    workflow.jobs['webui-carrier'].with.authority_mode = 'production_follower';
  });
  updateWorkflow(root, 'release-webui-development-promote.yml', (workflow) => {
    workflow.on.workflow_dispatch.inputs.stable_authority_run_id = {
      description: 'Unexpected Desktop Stable authority.',
      required: true,
      type: 'string',
    };
  });

  assert.ok(withoutExpectedDiagnostics(() => validateIndependentWebuiPreviewTopology(root)) >= 2);
  assert.ok(withoutExpectedDiagnostics(() => validateWorkflowDispatchWriteAuthority(root)) > 0);
});

test('no other workflow_dispatch job may gain write authority', (t) => {
  const root = fixture(t);
  fs.writeFileSync(workflowPath(root, 'rogue-release.yml'), `name: Rogue release
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - run: gh release upload v0 unexpected.zip
`);

  assert.ok(withoutExpectedDiagnostics(() => validateWorkflowDispatchWriteAuthority(root)) > 0);
});
