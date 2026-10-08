import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  type ShellAdapterContract,
  validateCodexExecutableContract,
} from '../../scripts/app-shell-adapter.ts';

const readAdapter = (relativePath: string): ShellAdapterContract =>
  JSON.parse(fs.readFileSync(relativePath, 'utf8')) as ShellAdapterContract;

test('Full App contract delegates Codex to the Shell-composed carrier and omits the Framework component', async () => {
  const releaseChannel = JSON.parse(
    fs.readFileSync('contracts/app-release-channel.json', 'utf8'),
  );
  const codex = releaseChannel.full_first_install.required_payloads.codex_cli;
  assert.equal(codex.compatibility_mode, 'studio_native_exact_external_binary');
  assert.equal(codex.resolver_env, 'OPL_CODEX_BIN');
  assert.equal(codex.aioncore_required, false);
  assert.deepEqual(codex.preferred_sources, [
    'studio_opl_codex_native_external_binary_v1',
  ]);
  assert.equal(
    codex.projection_schema,
    'opl_codex_native_external_binary.v1',
  );
  assert.equal(codex.producer_schema_version, 1);
  assert.deepEqual(codex.forbidden_cli_names, ['claude']);
  assert.equal(codex.framework_managed_payload_in_full_runtime_allowed, false);
  assert.deepEqual(codex.forbidden_framework_runtime_paths, [
    'bin/codex',
    'bin/rg',
    'vendor/codex',
    '.runtime-cache/codex-cli',
  ]);

  const { buildFullPackageManifest } = await import('../../scripts/full-first-install-package.ts');
  const manifest = buildFullPackageManifest();
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.components, 'codex'), false);
  assert.deepEqual(
    manifest.opl_execution_environment_consumer.runtime_fabric_bundle_taxonomy['execution-core.bundle'].components,
    ['temporal_cli', 'opl'],
  );
});

test('Native adoption cannot inherit the AionCore carrier', () => {
  const native = structuredClone(readAdapter('contracts/shell-adapters/opl-studio.json'));
  assert.ok(native.codex_executable_contract);
  native.codex_executable_contract.carrier = {
    kind: 'aioncore_managed_resources_manifest',
    source_ref: 'manual_qualification_contract.runtime_dependencies.aioncore.resource_authority',
    manifest_parser_owner: 'gaofeng21cn/opl-aion-shell',
    aioncore_required: true,
    framework_managed_payload_in_app_bundle_allowed: false,
  };

  assert.throws(
    () => validateCodexExecutableContract(native),
    /must remain independent from AionCore/,
  );
});

test('Studio clean VM qualification resolves its external Codex carrier at operation start', () => {
  const native = readAdapter('contracts/shell-adapters/opl-studio.json');
  const qualification = native.qualification_external_carrier;
  assert.equal(qualification?.schema, 'opl_studio_external_codex_qualification_input.v1');
  assert.equal(qualification?.owner, 'one-person-lab-app');
  assert.equal(qualification?.scope, 'opl-studio-preview-clean-vm-only');
  assert.equal(qualification?.package?.name, '@openai/codex');
  assert.equal(qualification?.dependency_id, 'codex-cli');
  assert.equal(qualification?.selection_policy, 'latest_stable_at_operation_start');
  assert.equal(qualification?.resolved_manifest_env, 'OPL_RELEASE_DEPENDENCY_MANIFEST');
  assert.equal(qualification?.package?.version, undefined);
  assert.equal(qualification?.platform?.version, undefined);
  assert.equal(qualification?.platform?.binary_path, 'package/vendor/aarch64-apple-darwin/bin/codex');
  assert.equal(qualification?.platform?.os, 'darwin');
  assert.equal(qualification?.platform?.cpu, 'arm64');
  assert.equal(qualification?.injection?.resolver_env, 'OPL_CODEX_BIN');
  assert.equal(qualification?.injection?.bundle_included, false);
  assert.equal(qualification?.injection?.app_bundle_codex_forbidden, true);
  assert.notEqual(qualification?.package?.version, '0.144.5');
});
