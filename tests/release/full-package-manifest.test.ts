import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const appRoot = path.resolve(import.meta.dirname, '../..');
const readJson = (relativePath: string) =>
  JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), 'utf8'));

test('Full and qualification manifests retain Codex/CLI seeds and exclude retired third-party desktop CUA archives', () => {
  const fullManifest = readJson('contracts/app-full-third-party-source-manifest.json');
  const qualificationManifest = readJson('contracts/app-release-qualification-input-manifest.json');

  assert.equal(fullManifest.sources.kimi_cu, undefined);
  assert.equal(fullManifest.runtime_payloads.kimi_cu, undefined);
  assert.equal(qualificationManifest.runtime_payloads.kimi_cu, undefined);

  assert.equal(fullManifest.runtime_payloads.codex_cli.dependency_id, 'codex-cli');
  assert.equal(
    fullManifest.runtime_payloads.codex_cli.qualification_input_ref,
    'contracts/app-release-qualification-input-manifest.json#runtime_payloads.codex_cli',
  );
  assert.equal(fullManifest.runtime_payloads.temporal_cli.dependency_id, 'temporal-cli');
  assert.equal(fullManifest.runtime_payloads.officecli.dependency_id, 'officecli');
  assert.equal(qualificationManifest.runtime_payloads.codex_cli.dependency_id, 'codex-cli');
  assert.equal(
    qualificationManifest.runtime_payloads.codex_cli.full_offline_seed.materialization_role,
    'studio_owned_first_install_seed',
  );
});
