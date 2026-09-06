import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  type ShellAdapterContract,
  validateCodexExecutableContract,
} from '../../scripts/app-shell-adapter.ts';

const readAdapter = (relativePath: string): ShellAdapterContract =>
  JSON.parse(fs.readFileSync(relativePath, 'utf8')) as ShellAdapterContract;

test('AionUI and Native share a carrier-neutral Codex executable boundary', () => {
  const aionui = readAdapter('contracts/app-shell-adapter.json');
  const native = readAdapter('contracts/shell-adapters/opl-studio.json');

  assert.doesNotThrow(() => validateCodexExecutableContract(aionui));
  assert.doesNotThrow(() => validateCodexExecutableContract(native));
  assert.ok(aionui.codex_executable_contract);
  assert.ok(native.codex_executable_contract);
  assert.equal(aionui.codex_executable_contract.resolver_env, native.codex_executable_contract.resolver_env);
  assert.equal(aionui.codex_executable_contract.protocol, native.codex_executable_contract.protocol);
  assert.equal(
    aionui.codex_executable_contract.thread_store_owner,
    native.codex_executable_contract.thread_store_owner,
  );
});

test('AionUI cannot restore the duplicate Framework Codex payload', () => {
  const aionui = structuredClone(readAdapter('contracts/app-shell-adapter.json'));
  assert.ok(aionui.codex_executable_contract);
  aionui.codex_executable_contract.carrier.framework_managed_payload_in_app_bundle_allowed = true;

  assert.throws(
    () => validateCodexExecutableContract(aionui),
    /must not embed the Framework-managed Codex payload/,
  );
});

test('AionUI composes the AionCore Node export with one official Codex carrier', () => {
  const aionui = structuredClone(readAdapter('contracts/app-shell-adapter.json'));
  const target = aionui.codex_executable_contract?.carrier.target_packaging_policy;

  assert.equal(target?.implementation_status, 'verified_shell_composition_and_packaged_smoke');
  assert.equal(target?.aioncore_modification_policy, 'consume_upstream_release_without_fork_or_patch');
  assert.deepEqual(target?.producer_export.required_cli_names, []);
  assert.equal(target?.producer_export.role, 'build_intermediate_node_only');
  assert.equal(target?.producer_export.distributed_manifest_allowed, false);
  assert.deepEqual(target?.codex_carrier, {
    owner: 'gaofeng21cn/opl-aion-shell',
    package: '@openai/codex',
    version_and_digest_source: 'contracts/aionui-upstream-intake.json#managed_runtime.codex_cli',
    authority: 'official_npm_platform_package',
    aioncore_compatibility_source:
      'contracts/aionui-upstream-intake.json#managed_runtime.codex_cli.opl_verified_aioncore_version',
  });
  assert.equal(target?.packaged_projection.schema, 'opl_aioncore_managed_resources_projection.v1');
  assert.deepEqual(target?.packaged_projection.included_cli_names, ['codex']);
  assert.deepEqual(target?.packaged_projection.excluded_cli_names, ['claude']);
  assert.deepEqual(target?.distributed_bundle.required_runtime_components, [
    'aioncore',
    'node_runtime',
    'codex_cli',
  ]);
  assert.deepEqual(target?.distributed_bundle.required_metadata, [
    'projection_manifest',
    'producer_manifest_digest_provenance',
    'codex_source_identity',
  ]);
  assert.deepEqual(target?.distributed_bundle.cli_names_exact, ['codex']);
  assert.equal(
    Object.hasOwn(
      (aionui as any).manual_qualification_contract.runtime_dependencies,
      'claude_cli',
    ),
    false,
  );
  assert.deepEqual(
    target?.distributed_bundle.required_absence_checks.map((check) => check.id),
    [
      'managed_claude_subtree',
      'claude_executable_or_symlink',
      'anthropic_package_or_archive',
      'claude_distribution_cache_entry',
      'raw_producer_manifest',
    ],
  );
  assert.equal(target?.opl_selected_official_codex_carrier_required, true);
  assert.equal(target?.second_codex_carrier_or_registry_allowed, false);
  assert.doesNotThrow(() => validateCodexExecutableContract(aionui));
});

test('AionUI target cannot package Claude or introduce a second Codex authority', () => {
  const withClaude = structuredClone(readAdapter('contracts/app-shell-adapter.json'));
  assert.ok(withClaude.codex_executable_contract?.carrier.target_packaging_policy);
  withClaude.codex_executable_contract.carrier.target_packaging_policy
    .distributed_bundle.cli_names_exact.push('claude');

  assert.throws(
    () => validateCodexExecutableContract(withClaude),
    /official AionCore Node export/,
  );

  const withoutArchiveGate = structuredClone(readAdapter('contracts/app-shell-adapter.json'));
  assert.ok(withoutArchiveGate.codex_executable_contract?.carrier.target_packaging_policy);
  withoutArchiveGate.codex_executable_contract.carrier.target_packaging_policy
    .distributed_bundle.required_absence_checks =
      withoutArchiveGate.codex_executable_contract.carrier.target_packaging_policy
        .distributed_bundle.required_absence_checks
        .filter((check) => check.id !== 'anthropic_package_or_archive');

  assert.throws(
    () => validateCodexExecutableContract(withoutArchiveGate),
    /official AionCore Node export/,
  );

  const withSecondCarrier = structuredClone(readAdapter('contracts/app-shell-adapter.json'));
  assert.ok(withSecondCarrier.codex_executable_contract?.carrier.target_packaging_policy);
  withSecondCarrier.codex_executable_contract.carrier.target_packaging_policy
    .second_codex_carrier_or_registry_allowed = true;

  assert.throws(
    () => validateCodexExecutableContract(withSecondCarrier),
    /second carrier or registry/,
  );
});

test('Full App contract delegates Codex to the Shell-composed carrier and omits the Framework component', async () => {
  const releaseChannel = JSON.parse(
    fs.readFileSync('contracts/app-release-channel.json', 'utf8'),
  );
  const codex = releaseChannel.full_first_install.required_payloads.codex_cli;
  assert.equal(codex.compatibility_mode, 'shell_carrier_exact_manifest_binary');
  assert.equal(codex.resolver_env, 'OPL_CODEX_BIN');
  assert.equal(codex.aioncore_required, true);
  assert.deepEqual(codex.preferred_sources, [
    'shell_opl_composed_managed_resources_projection_v1',
  ]);
  assert.equal(
    codex.projection_schema,
    'opl_aioncore_managed_resources_projection.v1',
  );
  assert.equal(codex.producer_schema_version, 2);
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
    manifest.opl_runtime_bundle_consumer.runtime_fabric_bundle_taxonomy['execution-core.bundle'].components,
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

test('Studio clean VM qualification pins its own external Codex carrier without changing AionUI qualification', () => {
  const native = readAdapter('contracts/shell-adapters/opl-studio.json');
  const qualification = native.qualification_external_carrier;
  assert.equal(qualification?.schema, 'opl_studio_external_codex_qualification_input.v1');
  assert.equal(qualification?.owner, 'one-person-lab-app');
  assert.equal(qualification?.scope, 'opl-studio-preview-clean-vm-only');
  assert.equal(qualification?.package?.name, '@openai/codex');
  assert.equal(qualification?.package?.version, '0.147.0');
  assert.equal(qualification?.platform?.version, '0.147.0-darwin-arm64');
  assert.equal(qualification?.platform?.binary_path, 'package/vendor/aarch64-apple-darwin/bin/codex');
  assert.equal(qualification?.platform?.os, 'darwin');
  assert.equal(qualification?.platform?.cpu, 'arm64');
  assert.equal(qualification?.injection?.resolver_env, 'OPL_CODEX_BIN');
  assert.equal(qualification?.injection?.bundle_included, false);
  assert.equal(qualification?.injection?.app_bundle_codex_forbidden, true);
  assert.notEqual(qualification?.package?.version, '0.144.5');
});
