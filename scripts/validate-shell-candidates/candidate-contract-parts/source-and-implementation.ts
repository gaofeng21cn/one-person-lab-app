import fs from 'node:fs';
import path from 'node:path';
import type {
  DSHSourceReuseContract,
  OPLStudioCarrierEvidenceContract,
  ShellCandidate,
} from '../types.ts';
import {
  assertFile,
  assertStringArrayIncludes,
  requiredNativeP1Capabilities,
  resolveCandidateRoot,
} from '../shared.ts';
import { assertDeepEqualJson } from '../../validate-active-shell/assertions.ts';
import { validateDshApplicationHostContract } from './host-and-bridge.ts';
import {
  assertCandidateFileContains,
  appProductProfile,
  configuredDefaultModel,
  configuredDefaultReasoningEffort,
  validateMinimumCompleteProductContract,
} from './product-and-acceptance.ts';

function assertCandidatePathAbsent(candidate: ShellCandidate, relativePath: string, label: string): void {
  const filePath = path.join(resolveCandidateRoot(candidate.candidate_root), relativePath);
  if (fs.existsSync(filePath)) {
    throw new Error(`${candidate.id} must not retain ${label}: ${relativePath}`);
  }
}

function assertCandidateFileExcludes(candidate: ShellCandidate, relativePath: string, snippets: string[], label: string): void {
  const filePath = path.join(resolveCandidateRoot(candidate.candidate_root), relativePath);
  assertFile(filePath, `${candidate.id} ${label}`);
  const source = fs.readFileSync(filePath, 'utf8');
  for (const snippet of snippets) {
    if (source.includes(snippet)) {
      throw new Error(`${candidate.id} ${label} must not include ${snippet}`);
    }
  }
}

export const requiredDSHSourceReuseSurfaces = [
  'persistent_project_rail',
  'single_conversation_timeline',
  'composer_model_and_reasoning_controls',
  'on_demand_dsh_details_column',
  'settings_locale_surface',
  'text_only_opl_product_identity',
];

export function validateCandidateImplementationBasis(candidate: ShellCandidate): void {
  assertStringArrayIncludes(candidate.implementation_basis, [
    'one pinned DeepSeek Harness Cordis Application Host with a DSH-derived React renderer and shared Node service facade',
    'Electron thin desktop carrier for macOS Windows and Linux plus HTTP/SSE standalone and Docker adapters',
    'OPL App state/action contract first',
    'opl-codex-native owns one persistent Codex App Server canonical threads approvals and live turn events',
    'authenticated stateful loopback MCP exposes DSH ctx.tools to Codex',
    'opl-framework-bridge consumes Framework state action authentication and channel callbacks without taking runtime or Package authority',
    'DeepSeek Harness AppFrame sidebar conversation composer Settings theme SlotCore createSlotRenderer and primitives reused from one pinned MIT source cohort',
    'OPL branding bridges and custom functions implemented outside the DSH vendor snapshot as adapters and slot plugins',
    'independent Application Host repo mounted under shells/opl-studio',
  ], `${candidate.id}.implementation_basis`);
}

const expectedCarrierEvidenceContract: OPLStudioCarrierEvidenceContract = {
  schema: 'opl_studio_carrier_evidence.v1',
  manifest_path: 'out/opl-studio-carrier-evidence-manifest.json',
  candidate_only: true,
  release_authority: false,
  product_profile_owner: 'one-person-lab-app',
  shared_renderer: 'deepseek_harness_derived_react',
  shared_host_core: 'plugins/opl-host-core/src/service.mjs',
  bridge_abi: 'opl_app_host_bridge.v1',
  required_entries: ['electron_desktop', 'standalone_headless_webui', 'docker_webui'],
  current_aionui_release_evidence_may_close_successor_entry: false,
  preview_oci_admission: {
    schema: 'opl_studio_cloud_workspace_image_handoff.v1',
    schema_ref: 'contracts/opl-studio-cloud-workspace-image-handoff.schema.json',
    validator: 'scripts/validate-studio-cloud-handoff.ts',
    repository: 'ghcr.io/gaofeng21cn/opl-studio-webui',
    workflow_identity: 'https://github.com/gaofeng21cn/opl-studio/.github/workflows/studio-webui-preview.yml@refs/heads/main',
    oidc_issuer: 'https://token.actions.githubusercontent.com',
    required_platforms: ['linux/amd64', 'linux/arm64'],
    immutable_tags: ['v<studio_version>', 'sha-<studio_sha>'],
    channel_tag: 'preview',
    forbidden_tags: ['stable'],
    cloud_activation_owner: 'opl-cloud',
    active_shell_adopted: false,
    release_ready: false,
  },
  entries: {
    electron_desktop: {
      source_refs: [
        'src/workbench/App.tsx',
        'plugins/opl-host-core/src/service.mjs',
        'desktop/main.mjs',
        'desktop/preload.cjs',
        'electron-builder.yml',
      ],
      package_artifact_kind: 'electron_app_bundle',
      qualification_commands: [
        'npm run test:desktop',
        'npm run package:desktop',
        'npm run smoke:desktop-live',
        'npm run validate:package',
      ],
      user_service_manager_source: { status: 'not_applicable', platforms: [] },
      distribution_wiring_status: 'not_wired',
      update_adapter_source: { status: 'implemented', ref: 'desktop/updater.mjs' },
      update_wiring_status: 'not_wired',
      release: {
        signed: 'not_proven',
        notarized: 'not_proven',
        public_feed: 'not_published',
        release_admission: 'not_admitted',
      },
    },
    standalone_headless_webui: {
      source_refs: [
        'src/workbench/App.tsx',
        'plugins/opl-host-core/src/service.mjs',
        'scripts/headless/run.mjs',
        'scripts/headless/server.mjs',
        'scripts/headless/installer.mjs',
        'scripts/headless/service-manager.mjs',
      ],
      package_artifact_kind: 'standalone_webui_bundle',
      qualification_commands: ['npm run test:headless', 'npm run smoke:webui'],
      user_service_manager_source: { status: 'implemented', platforms: ['macos', 'linux', 'windows'] },
      distribution_wiring_status: 'not_wired',
      update_adapter_source: { status: 'implemented', ref: 'scripts/headless/update-runner.mjs' },
      update_wiring_status: 'not_wired',
      release: {
        signed: 'not_applicable',
        notarized: 'not_applicable',
        public_feed: 'not_published',
        release_admission: 'not_admitted',
      },
    },
    docker_webui: {
      source_refs: [
        'src/workbench/App.tsx',
        'plugins/opl-host-core/src/service.mjs',
        'Dockerfile',
        'docker-compose.distribution.yaml',
        'scripts/oci/manage.mjs',
        'scripts/oci/build-plan.mjs',
        'scripts/oci/handoff.mjs',
        'src/host/webui-auth.mjs',
        'src/host/staged-inputs.mjs',
        '.github/workflows/studio-webui-preview.yml',
      ],
      package_artifact_kind: 'local_oci_smoke_receipt',
      qualification_commands: ['node --test tests/oci/*.test.mjs', 'npm run smoke:docker'],
      user_service_manager_source: { status: 'not_applicable', platforms: [] },
      distribution_wiring_status: 'not_wired',
      update_adapter_source: { status: 'implemented', ref: 'scripts/oci/manage.mjs' },
      update_wiring_status: 'not_wired',
      release: {
        signed: 'not_applicable',
        notarized: 'not_applicable',
        public_feed: 'not_published',
        release_admission: 'not_admitted',
      },
      multi_arch_qualification: 'plan_only_not_qualified',
      signature_verification: 'not_implemented',
    },
  },
};

export function validateCandidateCarrierEvidenceContract(candidate: ShellCandidate): void {
  assertDeepEqualJson(
    candidate.carrier_evidence_contract,
    expectedCarrierEvidenceContract,
    `${candidate.id}.carrier_evidence_contract`,
  );
}

export function validateOPLStudioCandidateContract(candidate: ShellCandidate): void {
  validateMinimumCompleteProductContract(appProductProfile.delivery_topology.minimum_complete_product);
  if (candidate.foreground_alternative_role !== 'only_foreground_alternative') {
    throw new Error(`${candidate.id}.foreground_alternative_role must be only_foreground_alternative`);
  }
  if (
    candidate.source_upstream?.repo !== 'gaofeng21cn/opl-studio' ||
    candidate.source_upstream.app_path !== '.' ||
    candidate.source_upstream.license !== 'Apache-2.0'
  ) {
    throw new Error(`${candidate.id}.source_upstream must point to gaofeng21cn/opl-studio under Apache-2.0`);
  }
  if (
    candidate.candidate_stage !==
    'opl_studio_dsh_application_host_candidate_only'
  ) {
    throw new Error(`${candidate.id}.candidate_stage must remain a DSH Application Host candidate only`);
  }
  validateDshApplicationHostContract(
    candidate.application_host_contract,
    `${candidate.id}.application_host_contract`,
    candidate,
  );
  const maintenance = candidate.maintenance_policy;
  if (
    maintenance?.mode !== 'active_product_development_release_admission_separate' ||
    maintenance.automatic_or_scheduled_work_allowed !== false ||
    maintenance.product_development_required !== true ||
    maintenance.current_mainline !== false ||
    maintenance.minimum_complete_product_obligation !== true ||
    maintenance.aionui_feature_parity_obligation !== false ||
    maintenance.release_blocking !== false
  ) {
    throw new Error(`${candidate.id}.maintenance_policy must require the OPL minimum-complete product without making release or AionUI parity implicit`);
  }
  if (candidate.minimum_complete_contract_ref !== 'contracts/app-product-profile.json#delivery_topology.minimum_complete_product') {
    throw new Error(`${candidate.id}.minimum_complete_contract_ref must point to the App-owned Native product contract`);
  }
  const p1 = candidate.p1_baseline_contract;
  if (
    p1?.runtime_bridge_ref !== 'contracts/app-runtime-bridge.json#native_minimum_product_bridge' ||
    p1.adapter_binding_ref !== 'contracts/shell-adapters/opl-studio.json#p1_baseline_bridge'
  ) {
    throw new Error(`${candidate.id}.p1_baseline_contract must bind the App runtime bridge and Native adapter without creating a second control plane`);
  }
  assertStringArrayIncludes(p1.required_user_outcomes, [
    'standard Agent selection launches a canonical Codex thread and first turn without a Framework activation action',
    'running-turn input uses Codex turn/steer while idle input uses turn/start and no persistent Shell queue exists',
    'Gateway login uses the dedicated secret bridge while non-secret account actions use projected App actions',
    'Agent Package lifecycle renders every complete projected available_action without an action-id allowlist',
    'OPL Base and OPL Packages updates use Framework managed-update host capabilities and terminal readback',
    'OPL App update check, apply, restart, and running-version readback stay App-owned behind carrier-specific adapters',
  ], `${candidate.id}.p1_baseline_contract.required_user_outcomes`);
  assertStringArrayIncludes(p1.forbidden_parallel_control_planes, [
    'shell_owned_action_bus',
    'shell_owned_package_registry',
    'shell_owned_persistent_turn_queue',
    'second_agent_runtime',
    'second_managed_updater',
  ], `${candidate.id}.p1_baseline_contract.forbidden_parallel_control_planes`);
  assertStringArrayIncludes(
    candidate.required_capabilities,
    requiredNativeP1Capabilities,
    `${candidate.id}.required_capabilities`,
  );
  const runtimeDependency = candidate.runtime_dependency_policy;
  if (
    runtimeDependency?.aioncore_required !== false ||
    runtimeDependency.aionui_required !== false ||
    runtimeDependency.codex_app_server_source !== 'OPL_CODEX_BIN_or_exact_external_codex' ||
    runtimeDependency.opl_integration !== 'framework_app_state_action_authentication_and_channel_callbacks_only' ||
    runtimeDependency.multi_backend_abstraction_required !== false ||
    runtimeDependency.thread_store_owner !== 'codex_core_app_server' ||
    !runtimeDependency.forbidden_dependencies.includes('AionUI runtime') ||
    !runtimeDependency.forbidden_dependencies.includes('AionCore runtime') ||
    !runtimeDependency.forbidden_dependencies.includes('AionCore managed-resources manifest') ||
    !runtimeDependency.forbidden_dependencies.includes('AionCore session or database state')
  ) {
    throw new Error(`${candidate.id}.runtime_dependency_policy must keep Native independent from AionUI/AionCore and scoped to Codex App Server`);
  }
  if (
    candidate.checkout_policy?.primary_path !== 'shells/opl-studio' ||
    candidate.checkout_policy.accepted_alternate_path !== '../opl-studio' ||
    candidate.checkout_policy.missing_checkout_status !== 'blocked_missing_checkout'
  ) {
    throw new Error(`${candidate.id}.checkout_policy must accept shells/opl-studio or ../opl-studio and report blocked_missing_checkout`);
  }
  if (
    candidate.build_wrapper?.adapter_contract !== candidate.adapter_contract ||
    candidate.build_wrapper.app_root_command !== `OPL_APP_SHELL_ADAPTER_CONTRACT=${candidate.adapter_contract} npm run package` ||
    candidate.build_wrapper.missing_checkout_blocker_allowed !== true
  ) {
    throw new Error(`${candidate.id}.build_wrapper must route through the App-root explicit adapter and allow missing-checkout blocker reporting`);
  }
  const visual = candidate.dsh_source_reuse_contract as DSHSourceReuseContract | undefined;
  if (
    visual?.source_cohort !== 'DeepSeek Harness e8f7b93a344964de3dca1ace9e72b6e4d6de87cb Application Host and selected GUI source' ||
    visual.vendor_byte_policy !== 'pinned_upstream_plus_manifest_bound_reviewed_compatibility_patches' ||
    visual.contract_role !== 'application_host_and_source_preservation_with_opl_integration_regression_not_pixel_reimplementation' ||
    visual.reuse_method !== 'pinned_dsh_application_host_packages_plus_source_preserving_gui_reuse_with_opl_plugins_and_adapters' ||
    visual.visual_style_baseline !== 'DeepSeek Harness selected MIT GUI source preserved for DSH-covered modules plus semantically necessary One Person Lab integrations' ||
    visual.visual_style_scope !== 'light_workbench_palette_system_font_stack_type_scale_weight_line_height_sidebar_density_and_composer_surface' ||
    visual.visual_token_source !== 'deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css@e8f7b93a344964de3dca1ace9e72b6e4d6de87cb' ||
    visual.font_asset_policy !== 'reuse_deepseek_harness_system_font_behavior_without_copying_unrelated_assets' ||
    visual.parallel_opl_visual_system_allowed !== false ||
    visual.css_override_policy !== 'forbidden_for_dsh_covered_modules_unless_a_real_opl_semantic_host_accessibility_or_platform_boundary_requires_the_smallest_external_delta' ||
    visual.pixel_evidence_role !== 'detect_regressions_after_source_reuse_and_opl_integration_not_reconstruct_or_approximate_dsh' ||
    visual.current_reference_status !== 'pinned_application_host_runtime_and_gui_source_reuse' ||
    visual.regression_floor !== 'historical AionUI release evidence only' ||
    visual.source_usage !== 'pinned_application_host_runtime_and_gui_source_reuse' ||
    visual.application_host_runtime_adopted !== true ||
    visual.dsh_product_runtime_authority_adopted !== false ||
    visual.minimum_bar !== 'pinned_dsh_application_host_tools_mcp_codex_native_framework_bridge_and_direct_gui_source_reuse_with_declared_authorities' ||
    visual.model_policy_source !== 'contracts/app-product-profile.json#gui.home.codex_model_display_options' ||
    visual.default_model !== configuredDefaultModel ||
    visual.default_reasoning_effort !== configuredDefaultReasoningEffort ||
    visual.docs_or_contract_only_completion_allowed !== false
  ) {
    throw new Error(`${candidate.id}.dsh_source_reuse_contract must require the pinned DSH Application Host and source-preserving DSH GUI reuse without adopting DSH runtime authority`);
  }
  assertDeepEqualJson(
    visual.dsh_owned_visual_properties,
    [
      'font_family_and_fallback_behavior',
      'font_sizes_weights_line_heights_and_type_scale',
      'spacing_density_and_geometry',
      'colors_surfaces_borders_shadows_and_radii',
      'component_rendering_and_interaction_states',
      'responsive_layout_and_transitions',
    ],
    `${candidate.id}.dsh_source_reuse_contract.dsh_owned_visual_properties`,
  );
  assertDeepEqualJson(
    visual.opl_injection_boundary,
    [
      'brand_text_through_public_props_or_slots',
      'app_owned_data_through_the_host_bridge',
      'capability_classification_through_typed_contributions',
      'host_specific_behavior_through_external_adapters',
    ],
    `${candidate.id}.dsh_source_reuse_contract.opl_injection_boundary`,
  );
  assertStringArrayIncludes(
    visual.superseded_observations ?? [],
    [
      'ChatGPT Codex macOS 26.707.31428 (2026-07-10)',
      'ChatGPT Codex macOS 26.707.31123 (2026-07-10)',
    ],
    `${candidate.id}.dsh_source_reuse_contract.superseded_observations`,
  );
  assertStringArrayIncludes(
    visual.required_surfaces ?? [],
    requiredDSHSourceReuseSurfaces,
    `${candidate.id}.dsh_source_reuse_contract.required_surfaces`,
  );
  assertStringArrayIncludes(visual.required_evidence, [
    'desktop source provenance review against the pinned DeepSeek Harness selected GUI source',
    'vendor byte parity for every selected DeepSeek Harness GUI source file',
    'desktop integration regression against the App-owned approved rendered baseline',
    'persistent project rail and single conversation timeline regression capture',
    'composer model and reasoning controls regression capture',
    'on-demand DeepSeek Harness details column regression capture',
    'Settings locale surface regression capture',
    'WebUI rendered regression against the shared desktop renderer',
    'packaged app screenshot or VM smoke artifact',
  ], `${candidate.id}.dsh_source_reuse_contract.required_evidence`);
}

export function validateCandidateImplementationFiles(candidate: ShellCandidate): void {
  assertCandidateFileContains(candidate, 'src/vendor/deepseek-harness/packages/client/ui-layout/src/client/AppFrame.tsx', [
    'export function AppFrame',
    "renderSlot('sidebar'",
    "renderSlot('conversation'",
    "renderSlot('details'",
  ], 'vendored DeepSeek Harness AppFrame');
  assertCandidateFileContains(candidate, 'src/vendor/deepseek-harness/packages/client/ui-sidebar/src/client/SidebarRoot.tsx', [
    'export function SidebarRoot',
    "renderSlot('sidebar.workspaces'",
  ], 'vendored DeepSeek Harness SidebarRoot');
  assertCandidateFileContains(candidate, 'src/vendor/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx', [
    'export function ConversationRoot',
  ], 'vendored DeepSeek Harness ConversationRoot');
  assertCandidateFileContains(candidate, 'src/vendor/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/InputBar.tsx', [
    'export function InputBar',
  ], 'vendored DeepSeek Harness InputBar');
  assertCandidateFileContains(candidate, 'src/vendor/deepseek-harness/packages/client/ui-settings-general/src/client/SettingsRoot.tsx', [
    'export function SettingsRoot',
    "renderSlot('settings.section'",
  ], 'vendored DeepSeek Harness SettingsRoot');
  assertCandidateFileContains(candidate, 'src/vendor/deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css', [
    '--dsw-static-deepseek-450',
    '--dsw-specific-sidebar-fill',
  ], 'vendored DeepSeek Harness UI theme');
  assertCandidateFileContains(candidate, 'src/vendor/deepseek-harness/packages/client/ui-primitives/src/index.ts', [
    "export { Button } from './Button.tsx'",
    "export { Menu } from './Menu.tsx'",
    "export { RiskConfirmation } from './RiskConfirmation.tsx'",
    "export * from './icons/index.tsx'",
  ], 'vendored DeepSeek Harness UI primitives');
  assertCandidateFileContains(candidate, 'src/vendor/deepseek-harness/packages/client/ui-primitives/src/Button.tsx', [
    "import css from './Button.module.css'",
    'export function Button',
  ], 'vendored DeepSeek Harness Button primitive');
  assertCandidateFileContains(candidate, 'src/vendor/deepseek-harness/packages/client/ui-renderer/src/client/scoped-slots.tsx', [
    'export function createSlotRenderer',
    'SlotAssemblyError',
    'useSyncExternalStore',
  ], 'vendored DeepSeek Harness scoped slot renderer');
  assertCandidatePathAbsent(
    candidate,
    'src/integrations/deepseek-harness/uiPrimitives.tsx',
    'the handwritten DeepSeek Harness primitives replacement',
  );
  assertCandidateFileContains(candidate, 'src/composition/dshSlotHost.tsx', [
    'SlotCore',
    'createSlotRenderer',
    'ui-renderer/src/client/scoped-slots.tsx',
    'AppFrame',
    'SidebarRoot',
    'ConversationRoot',
    'InputBar',
    'SettingsRoot',
    '<AppFrame',
    '<SidebarRoot',
    '<ConversationRoot',
    '<InputBar',
    '<SettingsRoot',
    'sidebar.brand.mark',
    'sidebar.brand.name',
    'conversation.hero.brand.mark',
    'conversation.input.attachments',
    'function OplBrandNameSlot() { return <>One Person Lab</>; }',
    'function EmptyAttachmentSlot() { return null; }',
    'useHostDescription={(selector: any) => selector(undefined)}',
    'this.renderer.renderRoot(this.host, { contributions })',
    'return slotHost.renderRoot(contributions)',
  ], 'DeepSeek Harness slot host and rendered GUI composition');
  assertCandidateFileContains(candidate, 'src/composition/oplStudioClientPlugin.tsx', [
    'provideOplStudioClientContributions(ctx)',
    'ctx.provide("uiRenderer"',
    'root.render(renderOplStudioRoot(contributions))',
    'ctx.plugin(oplStudioClientPlugin)',
  ], 'Cordis client plugin and renderer composition');
  assertCandidateFileContains(candidate, 'src/integrations/deepseek-harness/runtimeShim.ts', [
    'export function abbreviateHomePath',
    'isWindowsStylePath',
    'path.startsWith(`${root}/`)',
  ], 'DeepSeek Harness workspace path compatibility shim');
  assertCandidateFileContains(candidate, 'src/main.tsx', [
    'import { AppWebEntry } from "@deepseek-ai/dsh-client-web"',
    'import { mountOplStudioClient, oplStudioClientPlugin } from "./composition/oplStudioClientPlugin"',
    'globalThis.__OPL_STUDIO_CLIENT__ = oplStudioClientPlugin',
    'mountOplStudioClient(rootElement)',
    'new AppWebEntry(rootElement).run()',
  ], 'DeepSeek Harness composition entrypoint');
  assertCandidateFileContains(candidate, 'src/workbench/App.tsx', [
    'renderShell',
    'data-testid="opl-context-tabs"',
    'data-testid="opl-runtime-status-panel"',
    'data-testid="opl-agent-run-status"',
    'data-testid="opl-runtime-contributions"',
    'data-testid="opl-files-results-panel"',
    'data-testid="opl-input-files-list"',
    'data-testid="opl-agents-capabilities-panel"',
    'data-testid="opl-current-agent-capabilities"',
    'data-testid="opl-codex-capability-catalog"',
    'renderContributionSlot?.("runtime.detail"',
    'data-testid="opl-web-transport"',
  ], 'OPL Studio surface producer and contextual content');
  assertCandidateFileExcludes(candidate, 'src/workbench/App.tsx', [
    'data-testid="opl-workspace-rail"',
    'data-testid="opl-session-list"',
    'data-testid="opl-skills-panel"',
    'data-testid="opl-routing-panel"',
    'data-testid="opl-memory-panel"',
    'data-testid="opl-always-on-panel"',
    'branding/opl-app-logo.png',
  ], 'OPL Studio product layout');
  assertCandidateFileContains(candidate, 'src/workbench/settings/useSettingsPageContext.tsx', [
    'data-testid="opl-locale-toggle"',
    'onSettingChange("locale", "zh")',
    'onSettingChange("locale", "en")',
  ], 'OPL Studio settings locale control');
  assertCandidateFileContains(candidate, 'src/bridge/oplBridge.ts', [
    'opl app state --profile fast --json',
    'opl app state --profile full --json',
    'opl app contribution read',
    'opl app action execute --action',
    'readContribution',
  ], 'OPL App state/action bridge');
  assertCandidateFileContains(candidate, 'src/workbench/workbenchModel.ts', [
    'results',
    'deliverables',
    'receipts',
    'activeProjectLines',
  ], 'results and delivery workbench model');
  assertCandidateFileContains(candidate, 'scripts/validate-opl-studio-candidate.mjs', [
    'src/candidateContractEvidence.json',
    'src/vendor/deepseek-harness/packages/client/ui-renderer/src/client/scoped-slots.tsx',
    // The Studio self-validator derives the pinned cohort from its own manifest:
    // asserting a version literal here would re-freeze the value in the App.
    'scripts/dsh-upstream.mjs',
    'readDshBinding',
    'deepseekHarnessSourceManifest.json',
    'opl-studio',
  ], 'OPL Studio self-validator');
}
