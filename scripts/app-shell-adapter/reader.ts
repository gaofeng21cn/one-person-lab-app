import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ClientRendererAdmission,
  ClientRendererCompatibilityProfile,
  ShellAdapterContract,
} from './types.ts';
import { assertRepositoryRelativePath } from '../value-assertions.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultContractRef = 'contracts/app-shell-adapter.json';
const contractPath = path.join(appRoot, defaultContractRef);
const productProfilePath = path.join(appRoot, 'contracts/app-product-profile.json');

export function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function assertRelativePath(value: unknown, label: string): asserts value is string {
  assertRepositoryRelativePath(value, {
    empty: `Invalid active shell ${label}: expected non-empty relative path`,
    unsafe: `Invalid active shell ${label}: must be a repository-relative path`,
  });
}

export function resolveRepoRelativePath(value: string, label: string): string {
  assertRelativePath(value, label);
  return path.join(appRoot, value);
}

export function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => typeof entry === 'string' && entry.trim())) {
    throw new Error(`Invalid active shell ${label}: expected non-empty string array`);
  }
}

export function resolveAdapterContractPath(): string {
  const override = process.env.OPL_APP_SHELL_ADAPTER_CONTRACT?.trim();
  if (!override) {
    return contractPath;
  }
  if (!override.startsWith('contracts/') || !override.endsWith('.json')) {
    throw new Error('OPL_APP_SHELL_ADAPTER_CONTRACT must point at a repository-relative contracts/*.json file');
  }
  return resolveRepoRelativePath(override, 'OPL_APP_SHELL_ADAPTER_CONTRACT');
}

export function isExplicitAdapterOverride(filePath: string): boolean {
  return path.resolve(filePath) !== path.resolve(contractPath);
}

export function resolveShellAdapterIdentity(contract: ShellAdapterContract): string {
  const identity = contract.active_shell ?? contract.candidate_shell ?? contract.adapter_id;
  if (typeof identity !== 'string' || !identity.trim()) {
    throw new Error('active shell adapter contract must declare active_shell or candidate_shell identity');
  }
  return identity;
}

function readClientRendererProductProfile(): Record<string, unknown> {
  return readJson(productProfilePath) as Record<string, unknown>;
}

export function resolveClientRendererAdmission(
  contract: ShellAdapterContract,
  productProfile: Record<string, unknown> = readClientRendererProductProfile(),
): ClientRendererAdmission | null {
  const declaration = contract.client_renderer_admission;
  const compatibility = productProfile.client_renderer_compatibility as ClientRendererCompatibilityProfile | undefined;
  const deliveryTopology = productProfile.delivery_topology as Record<string, unknown> | undefined;
  const minimumProduct = deliveryTopology?.minimum_complete_product as Record<string, unknown> | undefined;
  const composition = minimumProduct?.composition_model as Record<string, unknown> | undefined;
  const compatibilityKeys = [
    'allowlist_contract',
    'app_fixed_brand_registry_allowed',
    'brand_capability_projection_policy',
    'client_authority_policy',
    'client_fixed_brand_registry_allowed',
    'contribution_abi',
    'display_and_allowlist_owner',
    'host_composition_authority',
    'host_graph_source',
    'host_projection_schema',
    'hot_switch_without_revalidation_allowed',
    'owner',
    'schema',
    'standard_view_types',
    'state_semantics_contract',
    'switch_policy',
    'transport_binding_event',
    'transport_binding_migration_state',
    'transport_binding_schema',
    'transport_binding_source',
    'typed_action_rpc',
    'typed_client_event',
    'typed_slots',
    'typed_state_rpc',
  ];
  if (
    !compatibility ||
    JSON.stringify(Object.keys(compatibility).sort()) !== JSON.stringify(compatibilityKeys) ||
    compatibility.schema !== 'opl_app_client_renderer_compatibility.v1' ||
    compatibility.owner !== 'one-person-lab-app' ||
    compatibility.host_composition_authority !== 'one-person-lab-framework' ||
    compatibility.host_graph_source !== 'app_state.ui_contributions' ||
    compatibility.host_projection_schema !== 'opl_app_ui_contributions_projection.v1' ||
    compatibility.contribution_abi !== 'opl_app_client_contributions.v1' ||
    compatibility.allowlist_contract !== 'contracts/opl-app-contributions.schema.json' ||
    JSON.stringify(compatibility.typed_slots) !==
      JSON.stringify(['settings.section', 'runtime.detail', 'composer.palette']) ||
    JSON.stringify(compatibility.standard_view_types) !==
      JSON.stringify([
        'list_detail',
        'timeline',
        'approval_diff',
        'task_board',
        'artifact_view',
        'activity_log',
        'service_status',
        'channel_access',
        'remote_companion_access',
      ]) ||
    compatibility.transport_binding_source !== 'app_state.transport_bindings' ||
    compatibility.transport_binding_schema !== 'opl_app_transport_bindings_projection.v1' ||
    compatibility.transport_binding_migration_state !==
      'framework_transport_binding_projection_and_studio_source_e2e_completed' ||
    compatibility.transport_binding_event !== 'opl/app-transport-bindings/updated' ||
    compatibility.typed_state_rpc !== 'opl app state --profile fast --json' ||
    compatibility.typed_action_rpc !==
      'opl app action execute --action <action_id> [--payload json] [--dry-run] --json' ||
    compatibility.typed_client_event !== 'opl/app-client-contributions/updated' ||
    compatibility.state_semantics_contract !== 'contracts/app-runtime-bridge.json' ||
    compatibility.client_authority_policy !==
      'render_and_dispatch_only_no_plugin_discovery_install_registry_currentness_release_operation_task_package_or_product_truth' ||
    compatibility.switch_policy !==
      'explicit_adapter_selection_after_compatibility_admission_never_unverified_hot_switch' ||
    compatibility.hot_switch_without_revalidation_allowed !== false ||
    compatibility.brand_capability_projection_policy !==
      'dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client' ||
    compatibility.app_fixed_brand_registry_allowed !== false ||
    compatibility.client_fixed_brand_registry_allowed !== false ||
    compatibility.display_and_allowlist_owner !== 'one-person-lab-app' ||
    composition?.client_authority_policy !== compatibility.client_authority_policy ||
    composition?.client_renderer_compatibility_profile !== 'client_renderer_compatibility' ||
    composition?.client_renderer_switch_policy !== compatibility.switch_policy ||
    composition?.brand_capability_projection_policy !== compatibility.brand_capability_projection_policy
  ) {
    throw new Error('App Client renderer compatibility profile is invalid');
  }

  const rendererId = resolveShellAdapterIdentity(contract);
  const candidate = contract.candidate_shell === 'opl-studio';
  const expectedRole = candidate ? 'foreground_alternative_candidate_renderer' : 'active_release_renderer';
  const expectedStatus = candidate
    ? 'candidate_validation_only_not_active_shell_admitted'
    : 'admitted_current_active_shell';
  if (
    !declaration ||
    JSON.stringify(Object.keys(declaration).sort()) !== JSON.stringify([
      'hot_switch_without_revalidation_allowed',
      'implementation_repo',
      'implementation_role',
      'profile_ref',
      'renderer_id',
      'status',
    ]) ||
    declaration.profile_ref !== 'contracts/app-product-profile.json#client_renderer_compatibility' ||
    declaration.renderer_id !== rendererId ||
    declaration.implementation_repo !== contract.shell_source.owner_repo ||
    declaration.implementation_role !== expectedRole ||
    declaration.status !== expectedStatus ||
    declaration.hot_switch_without_revalidation_allowed !== false
  ) {
    throw new Error(`Shell ${rendererId} is not compatible with the App Client renderer admission contract`);
  }

  return Object.freeze({
    schema: 'opl_app_client_renderer_admission.v1',
    rendererId,
    status: expectedStatus,
    selectionMode: candidate ? 'candidate_validation_only' : 'active_release_adapter',
    compatibility: Object.freeze(compatibility),
  });
}
