import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const readJson = (relativePath: string) => JSON.parse(fs.readFileSync(relativePath, 'utf8'));

test('channel settings admit exactly one provider route per renderer', () => {
  const gui = readJson('contracts/app-gui-product-contract.json');
  const weixinManifest = readJson('packages/opl-channel-weixin/opl-package.json');
  const contract = gui.framework_surfaces.package_app_contributions.opl_connect_connector_settings;
  const channelAccess = gui.framework_surfaces.package_app_contributions.standard_view_contracts.channel_access;
  const remoteCompanionAccess = gui.framework_surfaces.package_app_contributions.standard_view_contracts.remote_companion_access;

  assert.equal(contract.destination, 'settings.resources.messages_and_connections');
  assert.equal(contract.section_labels.zh_cn, '消息与连接');
  assert.equal(contract.runtime_membership_source, 'app_state.ui_contributions.slots.settings.section');
  assert.equal(
    contract.runtime_membership_policy,
    'dynamic_framework_host_projection_only_no_fixed_package_or_brand_allowlist',
  );
  assert.equal(contract.top_level_settings_navigation_allowed, false);
  assert.match(contract.renderer_admission.aionui, /aioncore_builtin_weixin_only_for_channel_access/);
  assert.match(contract.renderer_admission.aionui, /without_starting_a_second_channel_provider_path/);
  assert.match(contract.renderer_admission.opl_studio, /dynamic_framework_host_projection/);
  assert.match(contract.page_model, /app_owned_standard_renderer/);
  assert.match(contract.visible_disconnected_state, /show_the_connector/);
  assert.match(contract.unready_policy, /omit_the_connector_row_route_and_placeholder/);

  const weixin = contract.currently_defined_product_classifications.find(
    ({ package_id_example }: { package_id_example?: string }) => package_id_example === 'opl-channel-weixin',
  );
  assert.equal(weixin.connector_kind, 'message_channel_connector');
  assert.equal(weixin.classification_role, 'product_documentation_example_not_runtime_membership');
  assert.deepEqual(channelAccess.renderer_activation_policy, {
    aionui: {
      provider_owner: 'aioncore_builtin_weixin',
      settings_surface: 'aioncore_channel_settings',
      framework_channel_provider_host_activation_allowed: false,
      framework_projected_channel_access_rendering_allowed: false,
    },
    opl_studio: {
      provider_owner: 'installed_channel_provider_package',
      settings_surface: 'app_standard_channel_access',
      framework_channel_provider_host_activation_allowed: true,
      framework_projected_channel_access_rendering_allowed: true,
    },
    single_active_provider_path_per_renderer_required: true,
  });
  assert.equal(remoteCompanionAccess.result_schema_ref, 'contracts/opl-app-contributions.schema.json#/$defs/remote_companion_access_result');
  assert.equal(remoteCompanionAccess.renderer_activation_policy.aionui.framework_remote_companion_host_activation_allowed, true);
  assert.equal(remoteCompanionAccess.renderer_activation_policy.aionui.framework_projected_remote_companion_access_rendering_allowed, true);
  assert.deepEqual(remoteCompanionAccess.renderer_activation_policy.aionui, remoteCompanionAccess.renderer_activation_policy.opl_studio);
  assert.deepEqual(remoteCompanionAccess.secret_boundary.never_cached_logged_or_returned_by_app_action, [
    'invitation_code',
    'manual_code',
    'qr_payload',
    'claim_secret',
    'claim_material',
  ]);
  assert.deepEqual(weixinManifest.authority_boundary.activation_route_by_renderer, {
    aionui: 'aioncore_builtin_weixin_only_package_provider_activation_forbidden',
    opl_studio: 'installed_provider_through_one_person_lab_framework_generic_channel_host',
  });
  assert.equal(weixinManifest.authority_boundary.second_channel_provider_path_allowed, false);

  const link = contract.currently_defined_product_classifications.find(
    ({ target_package_id }: { target_package_id?: string }) =>
      target_package_id === 'opl-link-desktop-connector',
  );
  assert.equal(link.connector_kind, 'remote_companion_connector');
  assert.equal(link.target_package_implemented, true);
  assert.equal(link.legacy_shell_connector_migration_required, true);
});

test('OPL Link keeps product ownership while its desktop connector moves to OPL Connect', () => {
  const gui = readJson('contracts/app-gui-product-contract.json');
  const remote = readJson('contracts/app-remote-companion.json');
  const connector = remote.desktop_connector_boundary;

  assert.equal('desktop_connector' in gui.remote_companion, false);
  assert.equal(connector.opl_module_classification, 'opl_connect.remote_companion_connector');
  assert.equal(connector.target_path, 'packages/opl-link-desktop-connector');
  assert.equal(connector.package_owner, 'opl-link');
  assert.equal(connector.runtime_host_owner, 'one-person-lab-framework');
  assert.match(connector.cordis_host_policy, /single_framework_host/);
  assert.match(connector.product_boundary, /ios_app_and_opl_link_service_remain_independent/);
  assert.equal(remote.implementation_status.desktop_connector_target_package_implemented, true);
  assert.equal(remote.implementation_status.legacy_shell_connector_migration_required, true);
});
