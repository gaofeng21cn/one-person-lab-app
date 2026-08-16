import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';
import {
  isElectronUpdaterMetadataName,
  updateElectronUpdaterMetadataForArtifact,
} from '../../scripts/update-electron-updater-metadata.ts';

test('recognizes updater metadata names without regex backtracking', () => {
  for (const name of ['latest.yml', 'latest.yaml', 'latest-mac.yml', 'LATEST-arm64-mac.YAML']) {
    assert.equal(isElectronUpdaterMetadataName(name), true, name);
  }
  for (const name of ['latest-.yml', 'latest-mac.json', 'prefix-latest.yml', `latest-${'--'.repeat(10_000)}.txt`]) {
    assert.equal(isElectronUpdaterMetadataName(name), false, name.slice(0, 80));
  }
});

test('installs App release tooling before finalized metadata is updated', () => {
  const workflowText = fs.readFileSync(
    path.join(process.cwd(), '.github', 'workflows', '_build-reusable.yml'),
    'utf8',
  );
  const workflow = parseYaml(workflowText);
  const installStep = workflow.jobs.build.steps.find(
    (step: Record<string, unknown>) => step.name === 'Install App release tooling dependencies',
  );
  const installIndex = workflowText.indexOf('name: Install App release tooling dependencies');
  const updateIndex = workflowText.indexOf('scripts/update-electron-updater-metadata.ts');

  assert.ok(installStep);
  assert.equal(installStep['working-directory'], '${{ github.workspace }}');
  assert.equal(installStep.run, 'npm ci --ignore-scripts --no-audit --no-fund');
  assert.notEqual(installIndex, -1);
  assert.match(workflowText.slice(installIndex, updateIndex), /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.ok(installIndex < updateIndex);
});

test('rebinds only the finalized DMG entries in electron-updater metadata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-updater-final-dmg-'));
  try {
    const dmgName = 'One-Person-Lab-26.7.25-mac-arm64.dmg';
    const zipName = 'One-Person-Lab-26.7.25-mac-arm64.zip';
    const dmgPath = path.join(root, dmgName);
    fs.writeFileSync(dmgPath, 'final-stapled-dmg-bytes\n');
    fs.writeFileSync(path.join(root, 'latest-mac.yml'), [
      'version: 26.7.25',
      'files:',
      `  - url: ${zipName}`,
      '    sha512: zip-sha',
      '    size: 12',
      `  - url: ${dmgName}`,
      '    sha512: stale-dmg-sha',
      '    size: 10',
      `path: ${zipName}`,
      'sha512: zip-sha',
      '',
    ].join('\n'));

    const result = updateElectronUpdaterMetadataForArtifact(dmgPath, root);
    const metadata = parseYaml(fs.readFileSync(path.join(root, 'latest-mac.yml'), 'utf8'));
    const dmg = metadata.files.find((entry) => entry.url === dmgName);
    const zip = metadata.files.find((entry) => entry.url === zipName);
    assert.equal(dmg.sha512, crypto.createHash('sha512').update(fs.readFileSync(dmgPath)).digest('base64'));
    assert.equal(dmg.size, fs.statSync(dmgPath).size);
    assert.deepEqual(zip, { url: zipName, sha512: 'zip-sha', size: 12 });
    assert.equal(metadata.path, zipName);
    assert.deepEqual(result.metadata_files, ['latest-mac.yml']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails closed when updater metadata does not reference the finalized DMG', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-updater-missing-dmg-'));
  try {
    const dmgPath = path.join(root, 'One-Person-Lab-26.7.25-mac-arm64.dmg');
    fs.writeFileSync(dmgPath, 'dmg\n');
    fs.writeFileSync(path.join(root, 'latest-mac.yml'), 'version: 26.7.25\nfiles: []\n');
    assert.throws(
      () => updateElectronUpdaterMetadataForArtifact(dmgPath, root),
      /does not reference One-Person-Lab-26\.7\.25-mac-arm64\.dmg/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
