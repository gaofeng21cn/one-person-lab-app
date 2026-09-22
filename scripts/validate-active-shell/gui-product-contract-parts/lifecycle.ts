import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';
import {
  appActionRoute,
  appOwnedAgentPackageOrdinaryStatusInputMapping,
  appOwnedAgentPackageUserStatusProjection,
} from '../app-contract-constants.ts';
import { validateManagedUpdatePageBasics, validateManagedUpdatePlaneBinding } from '../managed-update-plane-validator.ts';

export function validateManagedUpdatePageSurface(page, label) {
  validateManagedUpdatePageBasics(page, label, {
    actionSourceError: `${label} must expose managed update actions through the shell IPC bridge`,
  });
  validateManagedUpdatePlaneBinding(page?.managed_update_plane, label, {
    requirePageId: true,
    requireStateSources: true,
    requireStatusConsumptionPolicy: true,
    bindingError: `${label} must bind to the App managed update plane as a status/action consumer`,
  });
}

export function validateReadOnlyStorageLifecycleSurface(surface, label) {
  if (
    surface?.role !== 'read_only_storage_lifecycle_product_surface' ||
    surface.app_role !== 'display_only_consumer_of_opl_mas_read_model_refs' ||
    surface.source_policy !== 'consume_opl_mas_read_model_refs_from_app_state_or_framework_projection_only'
  ) {
    throw new Error(`${label} must be a read-only OPL/MAS read-model consumer`);
  }
  assertIncludesAll(
    surface.source_refs,
    [
      'OPL App state storage lifecycle refs',
      'MAS read-model lifecycle refs when a study/workspace exposes them',
      'runtime compact dry-run refs from OPL Framework projections',
      'completed-project closeout refs from OPL/MAS projections',
    ],
    `${label} source refs`,
  );
  assertIncludesAll(
    surface.display_planes,
    [
      'data_lifecycle_planes',
      'large_body_refs',
      'small_file_pressure_refs',
      'runtime_compact_dry_run_refs',
      'completed_project_closeout_refs',
      'forbidden_generic_cleanup_boundary',
    ],
    `${label} display planes`,
  );
  assertIncludesAll(
    surface.required_ref_fields,
    [
      'plane_id',
      'label',
      'summary',
      'size_or_pressure_ref',
      'recommended_action_ref',
      'dry_run_ref',
      'closeout_ref',
      'authority_boundary',
    ],
    `${label} required ref fields`,
  );
  for (const [field, expected] of Object.entries({
    sqlite_access: 'forbidden',
    file_delete: 'forbidden',
    data_authority_owner: 'OPL Framework and domain owners',
    app_authority: 'read_model_display_only',
    generic_cleanup_policy: 'forbidden_without_owner_ref_and_dry_run_or_closeout_ref',
  })) {
    if (surface.authority_boundary?.[field] !== expected) {
      throw new Error(`${label} authority_boundary.${field} must be ${expected}`);
    }
  }
  assertIncludesAll(
    surface.must_not_read,
    [
      'SQLite files directly',
      'domain artifact bodies',
      'raw runtime private ledgers',
      'workspace filesystem trees to infer cleanup candidates',
    ],
    `${label} must_not_read`,
  );
  assertIncludesAll(
    surface.must_not_write,
    [
      'SQLite files',
      'runtime or domain truth',
      'owner receipts',
      'typed blockers',
      'filesystem deletes or cleanup execution',
    ],
    `${label} must_not_write`,
  );
}

export function validateAgentPackageLifecycleUx(surface, label) {
  if (
    surface?.requirement_scope !== 'product_requirement_not_runtime_authority' ||
    surface.primary_state_surface !== 'app_state.agent_packages.directory.entries + app_state.agent_packages.status_index' ||
    surface.runtime_source_surface !== 'app_state.runtime_source_carriers.items[]' ||
    surface.action_ref_source !== 'app_state.actions' ||
    surface.action_route !== appActionRoute
  ) {
    throw new Error(label + ' must consume the generic Framework Package directory and action projection');
  }
  for (const forbiddenField of ['fallback_state_surface', 'fallback_policy', 'receipt_physical_surface_detail_policy']) {
    if (forbiddenField in surface) {
      throw new Error(label + ' must not restore private Package fallback or lifecycle detail field ' + forbiddenField);
    }
  }

  const directory = surface.directory_collection_contract;
  if (
    directory?.source !== 'app_state.agent_packages.directory.entries' ||
    directory.collection_owner !== 'one-person-lab' ||
    directory.consumer_policy !==
      'render every projected entry without a shell allowlist, first-party seed, or installed-only filter' ||
    directory.first_party_policy !==
      'first-party and third-party packages use the same directory entries and action contract' ||
    'static_metadata_overlay_source' in directory ||
    'static_metadata_overlay_policy' in directory ||
    'static_metadata_overlay_fields' in directory
  ) {
    throw new Error(label + ' must use owner-projected directory presentation without App metadata overlays');
  }
  assertIncludesAll(
    directory.required_entry_fields,
    ['package_id', 'display_name', 'description', 'package_role', 'installed', 'readiness', 'recommended_action_ref', 'available_actions'],
    label + ' generic directory entry fields',
  );
  assertDeepEqualJson(
    surface.ordinary_user_status_input_mapping,
    appOwnedAgentPackageOrdinaryStatusInputMapping,
    label + ' ordinary user status input mapping',
  );
  assertDeepEqualJson(
    surface.user_facing_status_projection,
    appOwnedAgentPackageUserStatusProjection,
    label + ' user-facing status projection',
  );

  const controls = surface.directory_controls;
  if (
    controls?.row_actions_source !== 'directory.entries[].available_actions[]' ||
    controls.row_action_policy !==
      'render every complete Framework-projected Settings action without an App or Shell action-id allowlist' ||
    controls.catalog_search_is_settings_global_search !== false ||
    'row_actions' in controls
  ) {
    throw new Error(label + ' must render projected Settings actions without a fixed action list');
  }

  const actionContract = surface.canonical_action_contract;
  assertDeepEqualJson(
    actionContract?.required_action_fields,
    ['action_id', 'action_ref', 'semantic', 'surface', 'payload', 'required_payload_fields', 'confirmation_required'],
    label + ' projected action fields',
  );
  if (
    actionContract?.semantic_policy !==
      'render generic Framework-projected semantics and accept custom without mapping package ids or private lifecycle verbs' ||
    actionContract.surface_policy !== 'Settings executes only actions projected for the settings surface' ||
    actionContract.shell_action_inference_allowed !== false
  ) {
    throw new Error(label + ' must keep action semantic, surface, payload, and confirmation Framework-projected');
  }
  assertDeepEqualJson(
    surface.manual_agent_install_entry,
    {
      source: 'app_state.actions[action_id=install_from_manifest_url]',
      destination: 'settings.agents.catalog',
      visibility_policy: 'show_only_when_the_current_App_action_declares_manifest_url_and_trust_tier_with_dry_run_and_confirmation',
      input_fields: ['manifest_url', 'trust_tier'],
      trust_tier_policy: 'user_explicit_third_party_unverified_or_third_party_verified',
      execution_policy: 'submit_the_current_projected_App_action_then_refresh_fast_state',
      directory_policy: 'this_is_a_manual_entry_point_not_a_directory_row_or_static_package_registry',
      lifecycle_authority: 'configured_native_carrier_readback_only',
    },
    label + ' manual Agent install entry',
  );

  const projection = surface.package_projection_contract;
  if (
    projection?.schema !== 'opl_app_package_consumer_projection.v1' ||
    projection.directory_collection_source !== 'app_state.agent_packages.directory.entries' ||
    projection.action_semantics_policy !==
      'Framework projects semantic and surface; App and Shell do not maintain action-id or Package-id allowlists' ||
    !projection.projected_action_fields?.includes('semantic') ||
    !projection.projected_action_fields?.includes('surface')
  ) {
    throw new Error(label + ' must define the generic Package consumer projection');
  }
  assertIncludesAll(
    projection.forbidden_private_fields,
    ['manifest', 'package_lock_ref', 'materialization_readiness', 'lifecycle_receipt_ref', 'receipt_refs', 'rollback_ref', 'physical_surface', 'last_known_good'],
    label + ' forbidden private lifecycle fields',
  );

  const interaction = surface.consistent_action_interaction;
  if (
    interaction?.action_source !== 'directory.entries[].available_actions[]' ||
    interaction.action_id_allowlist_allowed !== false ||
    interaction.semantic_source !== 'directory.entries[].available_actions[].semantic' ||
    interaction.surface_policy !== 'execute only complete actions projected for the settings surface'
  ) {
    throw new Error(label + ' must forward projected actions without a private lifecycle action map');
  }
  if ('workspace_activation_contract' in surface) {
    throw new Error(label + ' must not restore a private Package activation contract');
  }

  const { package_projection_contract: _declarativeForbiddenFieldPolicy, ...consumerSurface } = surface;
  const serialized = JSON.stringify(consumerSurface);
  for (const forbidden of [
    'starter_package_metadata',
    'first_party_manifest_fixture_dir',
    'package_lock_receipt',
    'lifecycle_receipt_ref',
    'action_receipt_ref',
    'rollback_ref',
  ]) {
    if (serialized.includes(forbidden)) {
      throw new Error(label + ' must not parse private Package lifecycle field ' + forbidden);
    }
  }
}
