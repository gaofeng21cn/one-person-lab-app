import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { WEIXIN_CHANNEL_VERSION } from '../dist/src/index.js';

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const readAppJson = async (path) => JSON.parse(await readFile(new URL(`../../../${path}`, import.meta.url), 'utf8'));

const [marketplace, plugin, oplPackage, npmPackage] = await Promise.all([
  readAppJson('.agents/plugins/marketplace.json'),
  readJson('.codex-plugin/plugin.json'),
  readJson('opl-package.json'),
  readJson('package.json'),
]);

assert.equal(marketplace.name, 'one-person-lab-app');
assert.deepEqual(marketplace.plugins, [{
  name: 'opl-channel-weixin',
  source: { source: 'local', path: './packages/opl-channel-weixin' },
  policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
  category: 'Developer Tools',
}]);

assert.equal(plugin.name, 'opl-channel-weixin');
assert.equal(plugin.version, npmPackage.version);
assert.equal(WEIXIN_CHANNEL_VERSION, npmPackage.version);
assert.equal(plugin.license, 'Apache-2.0');
assert.equal(plugin.repository, 'https://github.com/gaofeng21cn/one-person-lab-app');
assert.equal(Object.hasOwn(plugin, 'mcpServers'), false);
assert.equal(Object.hasOwn(plugin, 'apps'), false);
assert.equal(Object.hasOwn(plugin, 'hooks'), false);

assert.equal(oplPackage.surface_kind, 'opl_capability_package_manifest.v2');
assert.equal(oplPackage.package_id, 'opl-channel-weixin');
assert.equal(oplPackage.version, npmPackage.version);
assert.equal(oplPackage.source, 'first_party');
assert.equal(oplPackage.package_role, 'capability_package');
assert.deepEqual(oplPackage.exports.core_skill_ids, []);
assert.deepEqual(oplPackage.exports.core_module_ids, ['opl.channel.weixin.provider.v1']);
assert.deepEqual(oplPackage.entrypoints, [{
  entrypoint_id: 'weixin-channel-provider',
  kind: 'channel_provider',
  module_ref: npmPackage.main.replace(/^\.\//, ''),
  export_name: 'createInstalledWeixinChannelProvider',
}]);
assert.equal(oplPackage.app_contributions.schema_version, 'opl-app-contributions.v1');
assert.equal(oplPackage.app_contributions.views[0].view_type, 'channel_access');
assert.equal(oplPackage.content_lock.algorithm, 'sha256');
assert.equal(
  oplPackage.content_lock.canonicalization,
  'ordered_path_length_file_length_bytes',
);
const contentDigest = createHash('sha256');
for (const relativePath of oplPackage.content_lock.paths) {
  assert.equal(typeof relativePath, 'string');
  assert.equal(relativePath.startsWith('/'), false);
  assert.equal(relativePath.split('/').includes('..'), false);
  const pathBytes = Buffer.from(relativePath, 'utf8');
  const fileBytes = await readFile(new URL(`../${relativePath}`, import.meta.url));
  const pathLength = Buffer.allocUnsafe(8);
  const fileLength = Buffer.allocUnsafe(8);
  pathLength.writeBigUInt64BE(BigInt(pathBytes.length));
  fileLength.writeBigUInt64BE(BigInt(fileBytes.length));
  contentDigest.update(pathLength);
  contentDigest.update(pathBytes);
  contentDigest.update(fileLength);
  contentDigest.update(fileBytes);
}
assert.equal(oplPackage.content_lock.digest, `sha256:${contentDigest.digest('hex')}`);
assert.equal(oplPackage.content_lock.paths.includes(oplPackage.entrypoints[0].module_ref), true);
assert.deepEqual(oplPackage.codex_surface.configured_codex_plugin_carrier, {
  kind: 'codex_plugin_manager',
  plugin_selector: 'opl-channel-weixin@one-person-lab-app',
  executor_route: 'codex_cli',
  marketplace_source: 'gaofeng21cn/one-person-lab-app',
  publication_ref: null,
});
assert.equal(oplPackage.codex_surface.optional_install_policy, 'all_exported_skills');
assert.deepEqual(oplPackage.codex_surface.required_skill_ids, []);
assert.equal(oplPackage.authority_boundary.second_app_server_allowed, false);
assert.equal(oplPackage.authority_boundary.unrestricted_json_rpc_allowed, false);
assert.equal(oplPackage.authority_boundary.package_transport_owner, 'opl-channel-weixin');
assert.deepEqual(oplPackage.authority_boundary.activation_route_by_renderer, {
  aionui: 'aioncore_builtin_weixin_only_package_provider_activation_forbidden',
  opl_studio: 'installed_provider_through_one_person_lab_framework_generic_channel_host',
});
assert.equal(oplPackage.authority_boundary.single_active_provider_path_per_renderer_required, true);
assert.equal(oplPackage.authority_boundary.second_channel_provider_path_allowed, false);
assert.equal(oplPackage.authority_boundary.package_route_composition_host_owner, 'one-person-lab-framework');
assert.equal(
  oplPackage.authority_boundary.credential_injection,
  'provider_owned_explicit_qr_login_in_memory_only',
);
assert.equal(Object.hasOwn(oplPackage, 'distribution_status'), false);

const providerModule = await import(new URL('../dist/src/index.js', import.meta.url));
const installedProviderFactory = providerModule[oplPackage.entrypoints[0].export_name];
assert.equal(typeof installedProviderFactory, 'function');
assert.equal(installedProviderFactory.length, 0);
const firstInstalledProvider = installedProviderFactory();
const secondInstalledProvider = installedProviderFactory();
assert.notEqual(firstInstalledProvider, secondInstalledProvider);
assert.equal(firstInstalledProvider.provider_id, oplPackage.package_id);
assert.equal(typeof firstInstalledProvider.start, 'function');
assert.equal(typeof firstInstalledProvider.loginWithQr, 'function');
assert.equal(typeof firstInstalledProvider.logout, 'function');
assert.deepEqual(
  firstInstalledProvider.channel_access.data_ref,
  oplPackage.app_contributions.views.find((entry) => entry.view_type === 'channel_access').data_ref,
);
assert.deepEqual(
  [...firstInstalledProvider.channel_access.action_refs],
  [...new Set(oplPackage.app_contributions.commands.map((entry) => entry.action_ref))],
);

console.log('Manifest validation passed.');
