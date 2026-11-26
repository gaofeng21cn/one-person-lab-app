import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const readJson = (relativePath: string) => JSON.parse(fs.readFileSync(relativePath, 'utf8'));

test('channel settings admit exactly one provider route per renderer', () => {
  const gui = readJson('contracts/app-gui-product-contract.json');
  const composition = readJson('contracts/app-plugin-composition-taxonomy.json');
  const profile = readJson('contracts/app-product-profile.json');
  const contract = gui.framework_surfaces.package_app_contributions.opl_connect_connector_settings;
  const channelAccess = gui.framework_surfaces.package_app_contributions.standard_view_contracts.channel_access;
  const remoteCompanionAccess = gui.framework_surfaces.package_app_contributions.standard_view_contracts.remote_companion_access;

  assert.equal(contract.destination, 'settings.resources.remote_connections');
  assert.equal(contract.section_labels.zh_cn, '远程连接');
  assert.equal(contract.runtime_membership_source, 'app_state.ui_contributions.slots.settings.section');
  assert.equal(
    contract.runtime_membership_policy,
    'dynamic_framework_host_projection_only_no_fixed_package_or_brand_allowlist',
  );
  assert.equal(contract.top_level_settings_navigation_allowed, false);
  assert.match(contract.renderer_admission.opl_studio, /dynamic_framework_host_projection/);
  assert.match(contract.page_model, /app_owned_standard_renderer/);
  assert.match(contract.visible_disconnected_state, /show_the_connector/);
  assert.match(contract.unready_policy, /keep_standard_remote_connections_section_visible_with_setup_guidance/);

  const weixin = contract.currently_defined_product_classifications.find(
    ({ native_plugin_id }: { native_plugin_id?: string }) => native_plugin_id === 'opl-channel-weixin',
  );
  assert.equal(weixin.connector_kind, 'message_channel_connector');
  assert.equal(weixin.classification_role, 'studio_native_channel');
  assert.equal(weixin.composition_ref, 'contracts/app-plugin-composition-taxonomy.json#studio_native_weixin_channel');
  assert.deepEqual(channelAccess.renderer_activation_policy, {
    opl_studio: {
      provider_owner: 'installed_channel_provider_package',
      settings_surface: 'app_standard_channel_access',
      framework_channel_provider_host_activation_allowed: true,
      framework_projected_channel_access_rendering_allowed: true,
    },
    single_active_provider_path_per_renderer_required: true,
  });
  assert.equal(remoteCompanionAccess.result_schema_ref, 'contracts/opl-app-contributions.schema.json#/$defs/remote_companion_access_result');
  const studioCompanionPolicy = remoteCompanionAccess.renderer_activation_policy.opl_studio;
  assert.equal(studioCompanionPolicy.provider_owner, 'opl_studio_native_link_companion_bridge');
  assert.equal(studioCompanionPolicy.settings_surface, 'settings_resources_opl_link_native_host_panel');
  assert.equal(studioCompanionPolicy.framework_remote_companion_host_activation_allowed, false);
  assert.equal(studioCompanionPolicy.framework_projected_remote_companion_access_rendering_allowed, false);
  assert.equal(remoteCompanionAccess.renderer_activation_policy.single_active_provider_path_per_renderer_required, true);
  assert.deepEqual(remoteCompanionAccess.secret_boundary.never_cached_logged_or_returned_by_app_action, [
    'invitation_code',
    'manual_code',
    'qr_payload',
    'claim_secret',
    'claim_material',
  ]);
  const native = composition.studio_native_weixin_channel;
  assert.equal(native.plugin_id, weixin.native_plugin_id);
  assert.equal(native.settings_destination, contract.destination);
  assert.equal(native.settings_slot, 'settings.section');
  assert.equal(native.settings_view_type, 'channel_access');
  assert.equal(native.provider_owner, 'opl-studio_dsh_profile');
  assert.equal(native.canonical_thread_and_turn_owner, 'opl-codex-native');
  assert.equal(native.single_active_provider_path_required, true);
  assert.equal(profile.official_profile.desired_root_package_ids.includes(native.plugin_id), false);

  assert.equal(remoteCompanionAccess.data_truth_owner, 'declaring_remote_companion_provider');
  assert.equal(contract.currently_defined_product_classifications.some(
    ({ target_package_id }: { target_package_id?: string }) => target_package_id === 'opl-link-desktop-connector',
  ), false);
});

test('OPL Link uses the active Studio Host while generic connector contributions retain their own authority', () => {
  const gui = readJson('contracts/app-gui-product-contract.json');
  const remote = readJson('contracts/app-remote-companion.json');
  const connector = remote.desktop_connector_boundary;

  assert.equal(gui.remote_companion.desktop_host_owner, 'opl-studio');
  assert.equal(connector.implementation_owner, 'opl-studio');
  assert.equal(connector.canonical_executor, 'existing_opl_codex_native_instance');
  assert.equal(connector.new_codex_process_allowed, false);
  assert.equal(connector.separate_framework_connector_package_required, false);
  assert.equal(connector.generic_remote_companion_access_contribution_is_link_runtime, false);
  assert.equal(gui.framework_surfaces.package_app_contributions.standard_view_contracts.remote_companion_access.projection_owner, 'one-person-lab-framework');
});
