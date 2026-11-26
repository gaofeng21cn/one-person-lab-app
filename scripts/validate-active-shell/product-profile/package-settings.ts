import { assertDeepEqualJson } from '../assertions.ts';
import { assertAgentReferenceAdmissionPolicy } from '../../app-product-profile-shared-validators.ts';
import { validateSettingsControlPlaneBehavior } from '../settings-control-plane-validator.ts';

export function validateProductProfileSettings(profile) {
  validateSettingsControlPlaneBehavior({ productProfile: profile });
  const queryFreeControlPlaneRedirects = Object.fromEntries(
    Object.entries(profile.settings.control_plane.legacy_route_redirects ?? {})
      .filter(([id]) => id !== 'about')
      .map(([id, target]) => [id, String(target).split('?')[0]]),
  );
  assertDeepEqualJson(
    profile.settings?.visible_tabs,
    profile.settings.control_plane.ordinary_visible_tabs,
    'Product profile ordinary settings visible tabs',
  );
  assertDeepEqualJson(
    profile.settings?.legacy_route_redirects,
    queryFreeControlPlaneRedirects,
    'Product profile legacy settings route redirects',
  );
  if (
    profile.settings?.control_plane?.source_contract_ref !==
    'contracts/app-gui-product-contract.json#settings_navigation'
  ) {
    throw new Error('Product profile settings.control_plane must project the App Settings control plane');
  }
  assertDeepEqualJson(
    profile.settings.control_plane.ordinary_routes?.map((route) => route.id),
    profile.settings.control_plane.ordinary_visible_tabs,
    'Product profile settings.control_plane ordinary route ids',
  );
}

export function validateProductProfileCodexSkills(profile) {
  for (const forbidden of [
    'tools',
    'ecosystem_modules',
    'management_authority',
    'upstream_packages',
    'official_codex_runtime_capabilities',
    'default_packaged_codex_skill_ids',
    'additional_package_skill_ids',
    'domain_plugin_skill_ids',
  ]) {
    if (forbidden in (profile.companion_payloads ?? {})) {
      throw new Error(`Product profile must not own capability inventory through companion_payloads.${forbidden}`);
    }
  }
}

export function validateInstallUpdateTaxonomy(profile, installExposurePolicy, releaseChannel) {
  const taxonomy = profile.install_update_taxonomy;
  const lifecycle = releaseChannel.managed_update_plane?.software_lifecycle;
  assertDeepEqualJson(
    taxonomy?.public_software_objects,
    installExposurePolicy.software_lifecycle?.public_objects,
    'Product profile public software objects vs install exposure',
  );
  assertDeepEqualJson(
    taxonomy?.managed_update_component_keys,
    lifecycle?.public_component_keys,
    'Product profile managed update component keys vs release channel',
  );
  assertDeepEqualJson(
    profile.install_update_taxonomy?.transaction_internal_state_ids,
    ['runtime_substrate', 'capability_packages', 'companion_tools', 'codex_surface', 'workflow_profile'],
    'Product profile transaction internal state ids',
  );
  assertDeepEqualJson(
    profile.install_update_taxonomy?.ordinary_ui_must_not_expose_as_peer_objects,
    [
      'app_binary',
      'runtime_toolchain',
      'agent_package_channel',
      'capability_exposure',
      'codex_cli_fallback',
      'runtime_substrate',
      'capability_packages',
      'companion_tools',
      'codex_surface',
      'workflow_profile',
    ],
    'Product profile forbidden peer software objects',
  );
  assertDeepEqualJson(
    taxonomy?.internal_detail_fields,
    {
      opl_base: lifecycle?.objects?.opl_base?.optional_internal_fields,
      opl_app: lifecycle?.objects?.opl_app?.required_fields,
      opl_packages: lifecycle?.objects?.opl_packages?.optional_internal_fields,
    },
    'Product profile managed update internal detail fields vs release channel',
  );
  if (profile.install_update_taxonomy?.ordinary_component_picker_allowed !== false) {
    throw new Error('Product profile ordinary component picker must be disabled');
  }
  if (
    profile.companion_payloads?.class !== 'opl_base_integrations' ||
    profile.companion_payloads?.opl_packages_projection_ref !== 'contracts/app-install-exposure-policy.json#exposure_classes.codex_surface' ||
    profile.companion_payloads?.opl_packages_lifecycle_ref !==
      'contracts/app-install-exposure-policy.json#agent_installation_contract.managed_package_distribution'
  ) {
    throw new Error('Product profile payloads must map Base integrations and Packages projection/lifecycle without peer updater classes');
  }
}

export function validateOrdinaryCapabilitySelectorPolicy(profile, guiContract) {
  const {
    responsive_action_sheet_ref,
    responsive_action_sheet_acceptance,
    package_skill_source_ref,
    ...selectorPolicy
  } = guiContract.ordinary_capability_selector_policy;
  const profileSelector = profile.gui?.ordinary_capability_selector_policy;
  assertAgentReferenceAdmissionPolicy(
    profileSelector?.agent_reference_admission_policy,
    'Product profile Agent reference admission policy',
  );
  assertDeepEqualJson(
    profileSelector,
    selectorPolicy,
    'Product profile ordinary selector owner/carrier Skill projection and MCP negative filter',
  );
}
