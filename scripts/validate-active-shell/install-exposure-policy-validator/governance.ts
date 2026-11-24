import { assertIncludesAll } from '../assertions.ts';
import { forbiddenAuthorityOwners } from '../app-contract-constants.ts';
function validateInstallExposureHeader(policy) {
  if (policy.owner !== 'one-person-lab-app') {
    throw new Error(`Unexpected install exposure policy owner: ${policy.owner}`);
  }
  if (policy.purpose !== 'app_install_exposure_policy') {
    throw new Error(`Unexpected install exposure policy purpose: ${policy.purpose}`);
  }
  if (policy.state !== 'active') {
    throw new Error(`Unexpected install exposure policy state: ${policy.state}`);
  }
  if (policy.producer_owner !== 'one-person-lab') {
    throw new Error(`Unexpected install exposure producer owner: ${policy.producer_owner}`);
  }
  if (policy.product_authority?.source_of_truth !== 'one-person-lab-app') {
    throw new Error('Install exposure policy source of truth must be one-person-lab-app');
  }
  for (const forbidden of forbiddenAuthorityOwners) {
    if (!policy.product_authority?.forbidden_authority?.includes(forbidden)) {
      throw new Error(`Install exposure policy must exclude ${forbidden}`);
    }
  }
}

function validateCapabilityGovernance(governance) {
  if (
    governance?.lifecycle_authority !== 'configured_carrier' ||
    governance?.lifecycle_surface !== 'configured_carrier_install_update_remove' ||
    governance?.app_role !== 'gui_and_framework_projection_consumer_only'
  ) {
    throw new Error('Install exposure capability governance must preserve the carrier -> Framework -> App projection boundary');
  }
  if (
    governance.managed_inventory?.source !== 'framework_unified_capability_projection' ||
    governance.managed_inventory?.app_second_inventory_allowed !== false ||
    governance.managed_inventory?.app_presentational_metadata_allowed !== true ||
    governance.managed_inventory?.unknown_user_and_third_party_surfaces !== 'preserve'
  ) {
    throw new Error('Install exposure capability governance must forbid an App-owned managed capability inventory');
  }
  if (
    governance.credential_policy?.credential_values_owner !== 'user_or_provider' ||
    governance.credential_policy?.full_may_bundle_secrets !== false ||
    governance.credential_policy?.migration_may_copy_credentials !== false ||
    governance.credential_policy?.flow_may_declare_requirements_only !== true ||
    governance.credential_policy?.existing_codex_config_detection !==
      'selected_provider_access_from_resolved_codex_config_toml' ||
    governance.credential_policy?.existing_usable_access_policy !==
      'reuse_without_reconfiguration_or_manual_key_input' ||
    governance.credential_policy?.explicit_api_key_command_role !==
      'new_or_rotated_provider_credential_only' ||
    governance.credential_policy?.configure_codex_package_lifecycle_mutation_allowed !== false ||
    governance.credential_policy?.package_reconciliation_requires_provider_configuration !== false ||
    governance.credential_policy?.package_reconciliation_surface !== 'configured_carrier_projected_actions'
  ) {
    throw new Error(
      'Install exposure capability governance must reuse existing Codex access and keep provider configuration separate from package lifecycle',
    );
  }
  if (
    governance.mcp_policy?.flow_managed_projection_group !== 'opl_flow_managed' ||
    governance.mcp_policy?.manual_and_third_party_projection_group !== 'user_or_third_party_managed' ||
    governance.mcp_policy?.undeclared_user_server_policy !== 'preserve' ||
    governance.mcp_policy?.undeclared_user_server_delete_or_overwrite_allowed !== false ||
    governance.mcp_policy?.default_managed_server_requires_owner_or_carrier_projection !== true
  ) {
    throw new Error('Install exposure MCP governance must preserve user surfaces and require owner or carrier projection');
  }
}

function validateCanonicalMetadataSources(canonical) {
  if (canonical?.owner !== 'one-person-lab') {
    throw new Error('Install exposure canonical metadata owner must be one-person-lab');
  }
  if (canonical.domain_owner !== 'foundry_agent_repositories') {
    throw new Error('Install exposure canonical metadata domain owner must be foundry_agent_repositories');
  }
  for (const source of ['family_action_catalog', 'family_stage_control_plane', 'family-product-entry-manifest-v2']) {
    if (!canonical.sources?.includes(source)) {
      throw new Error(`Install exposure canonical metadata sources must include ${source}`);
    }
  }
  for (const surface of ['cli', 'mcp', 'skill', 'product_entry', 'product_status', 'product_session', 'domain_action_adapter', 'workbench']) {
    if (!canonical.derived_surfaces?.includes(surface)) {
      throw new Error(`Install exposure canonical metadata derived surfaces must include ${surface}`);
    }
  }
}

function validatePublicAbi(abi) {
  for (const [field, expected] of Object.entries({
    primary_semantic_entry: 'skill',
    skill_role: 'public_codex_semantic_entry_and_prompt_contract',
    plugin_role: 'codex_app_distribution_and_capability_bundle',
    command_contract_role: 'machine_readable_action_and_stage_contract_under_the_skill',
    product_entry_role: 'domain_owned_product_entry_manifest_and_session_surface',
  })) {
    if (abi?.[field] !== expected) {
      throw new Error(`Install exposure public_abi.${field} must be ${expected}`);
    }
  }
  for (const [field, expected] of Object.entries({
    direct_skill_compatibility_required: true,
    plugin_may_package_skill: true,
    plugin_must_not_create_second_semantics: true,
    app_must_not_require_plugin_for_cli_semantics: true,
    app_must_not_mirror_plugin_skill_as_duplicate_bare_skill: true,
  })) {
    if (abi?.[field] !== expected) {
      throw new Error(`Install exposure public_abi.${field} must be ${expected}`);
    }
  }
}

function validateExposureClasses(policy) {
  const exposureClassById = new Map((policy.exposure_classes ?? []).map((entry) => [entry.id, entry]));
  const domainPluginClass = exposureClassById.get('codex_surface');
  if (
    domainPluginClass?.sync_target !== 'framework_projected_configured_carrier' ||
    domainPluginClass?.software_object !== 'opl_packages' ||
    domainPluginClass?.visibility_scope !== 'package_capability_visibility_only_not_software_object' ||
    domainPluginClass?.member_source !== 'app_state.agent_packages.directory.entries[].capabilities[]' ||
    domainPluginClass?.presentation_source !== 'owner_package_presentation_descriptor' ||
    'members' in domainPluginClass
  ) {
    throw new Error('Install exposure Package capabilities must come from the dynamic Framework directory');
  }
  assertIncludesAll(
    domainPluginClass?.must_not_sync_to,
    ['app_owned_package_member_registry', 'duplicate_bare_skill_mirror', 'default_home_assistant_entry'],
    'Install exposure Package capability mirror prohibitions',
  );
  if (exposureClassById.has('opl_generated_plugin_surfaces')) {
    throw new Error('Install exposure policy must not restore a fixed OPL-generated Package registry');
  }
  if (exposureClassById.has('companion_tools_codex_skills')) {
    throw new Error('Install exposure policy must not duplicate the Framework managed Skill inventory');
  }
  const packagedRuntimeClass = exposureClassById.get('opl_base_payloads');
  if (
    packagedRuntimeClass?.owner !== 'one-person-lab' ||
    packagedRuntimeClass?.software_object !== 'opl_base' ||
    packagedRuntimeClass?.visibility_scope !== 'base_dependency_status_only_not_software_object'
  ) {
    throw new Error('Install exposure packaged runtime payloads must remain OPL Base dependency details');
  }
  assertIncludesAll(
    packagedRuntimeClass?.members,
    ['embedded_codex_executor', 'temporal_cli_archive', 'opl_framework_runtime', 'officecli', 'mineru_open_api'],
    'Install exposure OPL Base payload members',
  );
  if (!packagedRuntimeClass?.must_not_sync_to?.includes('implicit_user_codex_skill_install_without_managed_sync')) {
    throw new Error('Install exposure packaged Full runtime payloads must not imply user skill install without managed sync');
  }
}
export {
  validateInstallExposureHeader,
  validateCapabilityGovernance,
  validateCanonicalMetadataSources,
  validatePublicAbi,
  validateExposureClasses,
};
