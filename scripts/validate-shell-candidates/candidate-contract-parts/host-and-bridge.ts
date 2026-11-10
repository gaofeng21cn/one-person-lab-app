import fs from 'node:fs';
import path from 'node:path';
import type {
  DSHApplicationHostContract,
  NativeP1BaselineBridge,
  NativeThreadAdapterBoundary,
  ShellCandidate,
  ShellCandidateRegistry,
  ValidationCommand,
} from '../types.ts';
import {
  assertFile,
  assertStringArrayIncludes,
  readJson,
  resolveCandidateRoot,
  requiredDshApplicationHostCapabilities,
  requiredNativeP1Capabilities,
  requiredNativeThreadCapabilities,
  root,
} from '../shared.ts';
import { assertDeepEqualJson } from '../../validate-active-shell/assertions.ts';

type CandidateAdapterContract = {
  purpose?: string;
  state?: string;
  adapter_id?: string;
  candidate_shell?: string;
  adapter_role?: string;
  active_shell?: string;
  candidate_stage?: string;
  shell_root: string;
  shell_source: { owner_repo: string; history_policy: string; checkout_path: string };
  release_role: string;
  delivery_topology?: {
    product_profile_ref?: string;
    topology_authority?: boolean;
    renderer?: string;
    application_host?: string;
    shared_host_core?: string;
    shared_host_core_role?: string;
    desktop_adapter?: string;
    desktop_platforms?: string[];
    web_adapter?: string;
    web_runtime_forms?: string[];
    bridge_abi?: string;
    carrier_evidence_manifest?: {
      schema?: string;
      path?: string;
      candidate_only?: boolean;
      release_authority?: boolean;
    };
    carrier_entries?: Record<string, Record<string, string>>;
    aionui_or_aioncore_dependency_allowed?: boolean;
    active_release_carrier?: boolean;
  };
  application_host?: DSHApplicationHostContract;
  gui_authority?: { implementation_role?: string };
  codex_executable_contract?: {
    resolver_env?: string;
    carrier?: {
      kind?: string;
      manifest_parser_owner?: string | null;
      aioncore_required?: boolean;
    };
  };
  shell_contract: { source_topology: string; capabilities: string[] };
  validation_commands: ValidationCommand[];
  p1_baseline_bridge?: NativeP1BaselineBridge;
  thread_adapter_boundary?: NativeThreadAdapterBoundary;
};

const expectedDshApplicationHost: DSHApplicationHostContract = {
  role: 'deepseek_harness_cordis_application_host',
  implementation_status: 'source_implemented_release_admission_separate',
  upstream_version: '0.2.2-rc.1',
  upstream_ref: 'fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159',
  profile: 'opl-studio',
  profile_source: 'src/host/dsh/cordis.yml',
  web_overlay: 'src/host/dsh/web.patch.yml',
  profile_home: '$DSH_HOME/profiles/opl-studio',
  dsh_base_loaded: false,
  loaded_dsh_services: [
    'system-prompt_without_harness_identity_or_runtime_context',
    'tools_native_registry',
    'host_webserver',
    'host_plugin_inventory',
    'frontend_static_primitive_behind_studio_auth_routes',
    'client_modules_web_only',
  ],
  studio_plugins: [
    'opl-dsh-tool-mcp',
    'opl-codex-native',
    'opl-framework-bridge',
    'opl-host-core',
    'opl-web-routes',
  ],
  codex_runtime_owner: 'opl-codex-native',
  codex_owned_state: [
    'persistent_app_server_process',
    'canonical_threads_and_turns',
    'approvals',
    'live_turn_events',
  ],
  dsh_tool_bridge: 'authenticated_stateful_loopback_mcp',
  dsh_tool_plugin_compatibility: 'plugins_registering_tools_in_ctx_tools_are_exposed_to_codex',
  excluded_upstream_authorities: [
    'dsh_session',
    'dsh_llm_provider_routing',
    'dsh_agent_loop',
    'dsh_credentials',
  ],
  framework_bridge: 'consume_framework_app_state_action_authentication_and_channel_callbacks_only',
  startup_order: [
    'dsh_host_tree_and_tool_mcp',
    'codex_app_server',
    'framework_bridge',
  ],
  shutdown_order: [
    'framework_channel_callback',
    'codex_app_server',
    'dsh_cordis_tree',
  ],
  upstream_upgrade_contract: 'update_one_pinned_ref_and_package_cohort_then_regenerate_vendor_manifest_replay_profile_patches_and_run_host_mcp_renderer_candidate_gates',
  active_shell_adopted: false,
  release_ready: false,
  plugin_package_layout: {"source_root": "plugins", "package_format": "dsh_npm_package", "host_entry": "exports[.]", "client_entry": "exports[./client]", "profile_module_reference": "npm_package_name", "installed_location": "node_modules", "third_party_policy": "pinned_native_package_or_provenance_preserving_adapter", "codex_capability_packages_are_dsh_plugins": false},
};

export function validateDshApplicationHostContract(
  host: DSHApplicationHostContract | undefined,
  label: string,
  candidate: ShellCandidate,
): void {
  assertDeclaredDshPinMatchesStudio(candidate, host, label);
  assertDeepEqualJson(host, expectedDshApplicationHost, label);
}

// The Studio candidate owns the pinned DeepSeek Harness cohort in its own source
// manifest. Compare that pin first so a Studio upgrade reports the two exact
// versions instead of a whole-object diff, and so the App never silently admits
// a cohort it has not re-declared.
function assertDeclaredDshPinMatchesStudio(
  candidate: ShellCandidate,
  host: DSHApplicationHostContract | undefined,
  label: string,
): void {
  const manifestPath = path.join(
    resolveCandidateRoot(candidate.candidate_root),
    'src',
    'composition',
    'deepseekHarnessSourceManifest.json',
  );
  if (!fs.existsSync(manifestPath)) {
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    upstream?: { repo?: string; source_package_version?: string; ref?: string };
  };
  if (manifest.upstream?.repo !== 'https://github.com/deepseek-ai/deepseek-harness') {
    throw new Error(`${label} must read the DeepSeek Harness source manifest, got ${manifest.upstream?.repo}`);
  }
  const version = manifest.upstream.source_package_version;
  const ref = manifest.upstream.ref;
  if (typeof version !== 'string' || !version.trim() || typeof ref !== 'string' || !/^[0-9a-f]{40}$/.test(ref)) {
    throw new Error(`${label} cannot read the pinned DeepSeek Harness version and ref from the Studio source manifest`);
  }
  if (host?.upstream_version !== version || host.upstream_ref !== ref) {
    throw new Error(
      `${label} declares DeepSeek Harness ${String(host?.upstream_version)}@${String(host?.upstream_ref)} `
      + `but the Studio source manifest pins ${version}@${ref}; re-declare the cohort in the App contract`,
    );
  }
}

const requiredNativeThreadProtocols = [
  'thread/list',
  'thread/read',
  'thread/start',
  'thread/resume',
  'thread/fork',
  'thread/archive',
  'thread/unarchive',
  'turn/start',
  'turn/steer',
];

const forbiddenNativePrivateCapabilities = [
  'typed_cross_top_level_thread_host_bridge',
  'client_executed_dynamic_tools_coordination_bridge',
  'local_cross_thread_p0_p1',
  'thread_list_read_resume_fork_archive_unarchive',
  'turn_start_steer_with_host_queue',
  'cross_thread_codex_permission_and_advisory_audit',
  'bilateral_coordination_receipts',
  'desktop_webui_coordination_parity',
  'remote_host_aggregation_p2_deferred',
];

const requiredNativeSubagentMetadata = ['parentThreadId', 'agentRole', 'agentNickname'];
const requiredNativeSubagentSourceKinds = [
  'subAgent',
  'subAgentReview',
  'subAgentCompact',
  'subAgentThreadSpawn',
  'subAgentOther',
];
const requiredNativeSubagentItemTypes = ['collabAgentToolCall', 'subAgentActivity'];

export type CandidateValidationPolicy = {
  onlyForegroundAlternative: string;
  defaultCandidateValidationScope: string[];
  explicitCandidateValidationScope: string[];
};

export function candidateValidationPolicyFromRegistry(registry: ShellCandidateRegistry): CandidateValidationPolicy {
  const alternative = registry.alternative_gui_policy;
  if (!alternative) {
    throw new Error('candidate registry must declare alternative_gui_policy before candidate validation');
  }
  return {
    onlyForegroundAlternative: alternative.only_foreground_alternative,
    defaultCandidateValidationScope: alternative.default_candidate_validation_scope,
    explicitCandidateValidationScope: alternative.explicit_candidate_validation_scope,
  };
}

export function validateCandidateRegistryEntry(candidate: ShellCandidate, policy: CandidateValidationPolicy): void {
  if (!candidate.id || !candidate.candidate_root) {
    throw new Error(`Invalid candidate entry: ${JSON.stringify(candidate)}`);
  }
  const isForegroundAlternative = candidate.id === policy.onlyForegroundAlternative;
  const isDefaultCandidate = policy.defaultCandidateValidationScope.includes(candidate.id);
  const isExplicitCandidate = policy.explicitCandidateValidationScope.includes(candidate.id);
  if (candidate.state !== 'active_product_development') {
    throw new Error(`${candidate.id} must stay in active_product_development according to app-shell-candidates alternative_gui_policy`);
  }
  if (!isForegroundAlternative) {
    throw new Error(`${candidate.id} must be the foreground alternative`);
  }
  if (!isExplicitCandidate) {
    throw new Error(`${candidate.id} must be listed in explicit_candidate_validation_scope`);
  }
  if (isForegroundAlternative && isDefaultCandidate) {
    throw new Error(`${candidate.id} foreground alternative detail must stay out of default candidate validation scope`);
  }
  if (!candidate.candidate_root.startsWith('shells/') || candidate.candidate_root.split(/[\\/]+/).includes('..')) {
    throw new Error(`${candidate.id} candidate_root must be under shells/<candidate>`);
  }
  if (candidate.release_participation !== 'pre_adoption_explicit_build_only') {
    throw new Error(`${candidate.id} release participation must be pre_adoption_explicit_build_only`);
  }
  if (candidate.source_topology !== 'external_checkout_linked_shell_repo') {
    throw new Error(`${candidate.id} must declare external_checkout_linked_shell_repo topology`);
  }
}

export function readCandidateAdapterContract(candidate: ShellCandidate): CandidateAdapterContract {
  assertFile(path.join(root, candidate.adapter_contract), `${candidate.id} adapter contract`);
  return readJson<CandidateAdapterContract>(path.join(root, candidate.adapter_contract));
}

export function validateNativeThreadAdapterBoundary(
  boundary: NativeThreadAdapterBoundary | undefined,
): void {
  const expectedBoundaryKeys = [
    'adapter',
    'codex_subagent_projection',
    'private_coordination_layer_allowed',
    'protocol_owner',
    'source_ref',
    'supported_protocols',
    'thread_store_owner',
    'user_initiated_only',
  ];
  if (
    !boundary ||
    JSON.stringify(Object.keys(boundary).sort()) !== JSON.stringify(expectedBoundaryKeys) ||
    boundary.source_ref !==
      'contracts/app-gui-product-contract.json#interaction_baseline.thread_coordination' ||
    boundary.adapter !== 'single_codex_app_server_adapter' ||
    boundary.protocol_owner !== 'codex_core_app_server' ||
    boundary.thread_store_owner !== 'codex_core_app_server' ||
    boundary.user_initiated_only !== true ||
    boundary.private_coordination_layer_allowed !== false ||
    JSON.stringify(boundary.supported_protocols) !==
      JSON.stringify(requiredNativeThreadProtocols)
  ) {
    throw new Error(
      'native candidate thread adapter must stay a single user-initiated Codex App Server adapter with no private coordination layer',
    );
  }

  const subagents = boundary.codex_subagent_projection;
  if (
    JSON.stringify(Object.keys(subagents).sort()) !==
      JSON.stringify(['metadata_fields', 'mode', 'thread_item_types', 'thread_source_kinds']) ||
    subagents.mode !== 'read_only_thread_metadata_and_items' ||
    JSON.stringify(subagents.thread_source_kinds) !==
      JSON.stringify(requiredNativeSubagentSourceKinds) ||
    JSON.stringify(subagents.thread_item_types) !==
      JSON.stringify(requiredNativeSubagentItemTypes) ||
    JSON.stringify(subagents.metadata_fields) !==
      JSON.stringify(requiredNativeSubagentMetadata)
  ) {
    throw new Error(
      'native candidate must preserve Codex subagent metadata, source kinds, and thread items as read-only App Server projections',
    );
  }
}

export function validateNativeP1BaselineBridge(
  bridge: NativeP1BaselineBridge | undefined,
): void {
  const expectedKeys = [
    'active_turn_transport',
    'agent_launch_transport',
    'app_updater_ref',
    'contract_ref',
    'gateway_projection_ref',
    'gateway_secret_bridge_ref',
    'managed_update_ref',
    'package_action_source',
    'required_host_capabilities',
    'shell_owned_action_bus_allowed',
    'shell_owned_package_registry_allowed',
    'shell_owned_persistent_queue_allowed',
  ];
  const requiredHostCapabilities = [
    'loginGatewayAccount',
    'opl-runtime.get-managed-update-status',
    'opl-runtime.get-managed-update-check',
    'opl-runtime.get-managed-update-plan',
    'opl-runtime.run-managed-update-apply',
    'opl-runtime.run-managed-update-repair',
    'opl-runtime.run-managed-update-rollback',
    'app_update_check',
    'app_update_install_downloaded',
    'application_restart',
  ];
  if (
    !bridge ||
    JSON.stringify(Object.keys(bridge).sort()) !== JSON.stringify(expectedKeys) ||
    bridge.contract_ref !== 'contracts/app-runtime-bridge.json#native_minimum_product_bridge' ||
    bridge.agent_launch_transport !== 'codex_app_server_thread_start_then_turn_start' ||
    bridge.active_turn_transport !== 'codex_app_server_turn_steer_else_turn_start' ||
    bridge.gateway_projection_ref !== 'contracts/app-runtime-bridge.json#opl_gateway_account_projection' ||
    bridge.gateway_secret_bridge_ref !== 'contracts/app-runtime-bridge.json#opl_gateway_account_secret_bridge' ||
    bridge.package_action_source !== 'app_state.agent_packages.directory.entries[].available_actions[]' ||
    bridge.managed_update_ref !== 'contracts/app-release-channel.json#managed_update_plane.software_lifecycle' ||
    bridge.app_updater_ref !== 'contracts/app-release-channel.json#standard_updater' ||
    bridge.shell_owned_action_bus_allowed !== false ||
    bridge.shell_owned_package_registry_allowed !== false ||
    bridge.shell_owned_persistent_queue_allowed !== false
  ) {
    throw new Error('native candidate P1 bridge must bind existing owner transports without a parallel action bus, package registry, or persistent queue');
  }
  assertStringArrayIncludes(
    bridge.required_host_capabilities,
    requiredHostCapabilities,
    'native candidate P1 bridge required_host_capabilities',
  );
}

export function validateCandidateAdapterContract(
  candidate: ShellCandidate,
  adapterContract: CandidateAdapterContract,
  policy: CandidateValidationPolicy,
): void {
  if (candidate.id !== policy.onlyForegroundAlternative) {
    throw new Error(`${candidate.id} detailed candidate contract must be the explicit foreground alternative`);
  }
  if ('active_shell' in adapterContract) {
    throw new Error(`${candidate.id} foreground candidate adapter must use candidate_shell, not active_shell; active release shell remains contracts/app-shell-adapter.json`);
  }
  if (
    adapterContract.adapter_id !== candidate.id ||
    adapterContract.candidate_shell !== candidate.id ||
    adapterContract.adapter_role !== 'foreground_alternative_candidate_adapter'
  ) {
    throw new Error(`${candidate.id} foreground candidate adapter must declare candidate_shell adapter identity`);
  }
  if (
    adapterContract.purpose !== 'active_shell_adapter' ||
    adapterContract.state !== 'active' ||
    adapterContract.candidate_stage !==
      'opl_studio_dsh_application_host_candidate_only' ||
    adapterContract.gui_authority?.implementation_role !==
      'foreground_alternative_candidate_implementation_carrier'
  ) {
    throw new Error(`${candidate.id} adapter must preserve the shared adapter schema and DSH Application Host candidate stage`);
  }
  if (adapterContract.shell_root !== candidate.candidate_root) {
    throw new Error(`${candidate.id} adapter contract must point at ${candidate.candidate_root}`);
  }
  if (adapterContract.shell_source.checkout_path !== candidate.candidate_root) {
    throw new Error(`${candidate.id} adapter checkout_path must match candidate_root`);
  }
  if (adapterContract.shell_source.history_policy !== 'external_checkout_not_merged_into_app_default_branch') {
    throw new Error(`${candidate.id} adapter must keep external checkout history policy`);
  }
  if (adapterContract.release_role !== 'experimental_candidate_shell') {
    throw new Error(`${candidate.id} adapter release_role must be experimental_candidate_shell`);
  }
  if (
    adapterContract.codex_executable_contract?.resolver_env !== 'OPL_CODEX_BIN' ||
    adapterContract.codex_executable_contract.carrier?.kind !==
      'candidate_owned_or_exact_external_binary' ||
    adapterContract.codex_executable_contract.carrier.manifest_parser_owner !== null ||
    adapterContract.codex_executable_contract.carrier.aioncore_required !== false
  ) {
    throw new Error(`${candidate.id} adapter must resolve Codex directly without an AionCore runtime or manifest dependency`);
  }
  if (adapterContract.shell_contract.source_topology !== candidate.source_topology) {
    throw new Error(`${candidate.id} adapter source_topology must match candidate registry`);
  }
  if (!adapterContract.shell_contract.capabilities.includes('candidate_app_bundle_package')) {
    throw new Error(`${candidate.id} adapter must declare candidate_app_bundle_package capability`);
  }
  assertStringArrayIncludes(
    adapterContract.shell_contract.capabilities,
    requiredNativeThreadCapabilities,
    `${candidate.id} adapter thread capabilities`,
  );
  assertStringArrayIncludes(
    adapterContract.shell_contract.capabilities,
    requiredNativeP1Capabilities,
    `${candidate.id} adapter P1 capabilities`,
  );
  assertStringArrayIncludes(
    adapterContract.shell_contract.capabilities,
    requiredDshApplicationHostCapabilities,
    `${candidate.id} adapter DSH Application Host capabilities`,
  );
  validateDshApplicationHostContract(
    adapterContract.application_host,
    `${candidate.id} adapter Application Host`,
    candidate,
  );
  assertDeepEqualJson(
    adapterContract.application_host,
    candidate.application_host_contract,
    `${candidate.id} registry and adapter Application Host`,
  );
  if (
    'cross_top_level_thread_authority' in adapterContract ||
    'local_p0_p1_implementation_evidence' in candidate ||
    forbiddenNativePrivateCapabilities.some(
      (capability) =>
        candidate.required_capabilities.includes(capability) ||
        adapterContract.shell_contract.capabilities.includes(capability),
    )
  ) {
    throw new Error(`${candidate.id} registry and adapter must not retain private cross-thread coordination contracts or capabilities`);
  }
  validateNativeThreadAdapterBoundary(adapterContract.thread_adapter_boundary);
  validateNativeP1BaselineBridge(adapterContract.p1_baseline_bridge);
  assertDeepEqualJson(
    adapterContract.delivery_topology,
    {
      product_profile_ref: 'contracts/app-product-profile.json#delivery_topology',
      topology_authority: false,
      renderer: 'deepseek_harness_derived_react',
      application_host: 'src/host/dsh/host.mjs',
      shared_host_core: 'plugins/opl-host-core/src/service.mjs',
      shared_host_core_role: 'cross_carrier_application_service_facade_inside_dsh_host',
      desktop_adapter: 'desktop/main.mjs + desktop/preload.cjs',
      desktop_platforms: ['macos', 'windows', 'linux'],
      web_adapter: 'http_sse',
      web_runtime_forms: ['standalone_headless_webui', 'docker_webui'],
      bridge_abi: 'opl_app_host_bridge.v1',
      carrier_evidence_manifest: {
        schema: 'opl_studio_carrier_evidence.v1',
        path: 'out/opl-studio-carrier-evidence-manifest.json',
        candidate_only: true,
        release_authority: false,
      },
      carrier_entries: {
        electron_desktop: {
          host_adapter: 'desktop/main.mjs + desktop/preload.cjs',
          package_config: 'electron-builder.yml',
          update_adapter: 'desktop/updater.mjs',
        },
        standalone_headless_webui: {
          host_adapter: 'scripts/headless/run.mjs + scripts/headless/server.mjs',
          service_manager: 'scripts/headless/service-manager.mjs',
          installer: 'scripts/headless/installer.mjs',
          update_adapter: 'scripts/headless/update-runner.mjs',
        },
        docker_webui: {
          host_adapter: 'Dockerfile + docker-compose.distribution.yaml',
          distribution_manager: 'scripts/oci/manage.mjs',
          multi_arch_plan: 'scripts/oci/build-plan.mjs',
          preview_workflow: '.github/workflows/studio-webui-preview.yml',
          handoff_generator: 'scripts/oci/handoff.mjs',
          handoff_schema: 'contracts/opl-studio-cloud-workspace-image-handoff.schema.json',
          registry: 'ghcr.io/gaofeng21cn/opl-studio-webui',
          update_adapter: 'scripts/oci/manage.mjs',
        },
      },
      aionui_or_aioncore_dependency_allowed: false,
      active_release_carrier: false,
    },
    `${candidate.id} adapter delivery topology`,
  );
  if (!adapterContract.validation_commands.some((entry) => entry.id === 'candidate_app_bundle_build')) {
    throw new Error(`${candidate.id} adapter validation_commands must include candidate_app_bundle_build`);
  }
}
