export type JsonRecord = Record<string, unknown>;
export type ActiveSurfaceState = 'collapsed' | 'visible' | 'visible_wide_drawer_narrow';
export type ContractConformanceStatus = 'aligned_contract' | 'current_contract_deviation';

export const conformanceStatusVocabulary = {
  contract_status: ['aligned_contract', 'current_contract_deviation', 'candidate_target', 'not_claimed'],
  source_status: ['source_implemented', 'source_partial', 'source_missing', 'source_not_assessed'],
  pixel_status: ['pixel_verified', 'pixel_unverified', 'pixel_blocked', 'not_applicable'],
} as const;

export type GuiDesignSystemValidation = {
  schema: 'opl_app_gui_design_system_validation.v1';
  status: 'consistent';
  root: string;
  definition_stack: string[];
  shell_roles: {
    active: 'opl-studio';
    foreground: 'opl-studio';
  };
  visual_source_cohort: {
    contract: 'contracts/app-gui-visual-source-cohort.json';
    source_commit: 'e8f7b93a344964de3dca1ace9e72b6e4d6de87cb';
    source_usage: 'pinned_dsh_shell_components_theme_and_primitives_with_opl_owner_adapters';
  };
  interaction_reference: string;
  pixel_reference: string;
  superseded_interaction_reference: string;
  reference_boundary: {
    app_contract_status: 'aligned_contract';
    page_state_status: 'aligned_contract';
    candidate_detail_validation: 'explicit_on_demand';
  };
  model_defaults: {
    model: string;
    reasoning_effort: string;
  };
  state_boundary: {
    ideal_native_rail_visible: true;
    ideal_native_inspector_visible: false;
    active_studio_rail_state: ActiveSurfaceState;
    active_studio_inspector_state: ActiveSurfaceState;
    active_studio_conformance: {
      rail_matches_ideal: boolean;
      inspector_matches_ideal: boolean;
      rail_status: ContractConformanceStatus;
      inspector_status: ContractConformanceStatus;
      permission_access_mode_status: ContractConformanceStatus;
      side_panel_information_architecture_status: ContractConformanceStatus;
    };
  };
  evidence_scope: 'design_system_governance_consistency_only';
  visual_evidence: {
    current_studio_manifest: null;
    historical_aionui_manifest: 'docs/product/gui/evidence/aionui-41301/manifest.json';
    current_studio_entries_verified: 0;
    historical_entry_count: 8;
    packaged_command: false;
  };
  visual_reference_cohort: {
    contract: 'contracts/app-gui-visual-reference-cohort.json';
    reference_baseline_id: 'opl-app-approved-visual-baseline-v1';
    reference_state: 'capture_and_human_approval_required' | 'approved';
    external_product_artifact_required: false;
    scenes_required: 16;
    surface_families: ['home', 'conversation', 'rail', 'settings'];
    viewports: ['desktop', 'narrow'];
    themes: ['light', 'dark'];
    locales: ['zh-CN', 'en-US'];
    reference_assets_complete: false;
    scene_bound_visual_parity: false;
  };
  release_ready: false;
};

export const visualSourceCohortPath = 'contracts/app-gui-visual-source-cohort.json';
export const visualSourceCommit = 'e8f7b93a344964de3dca1ace9e72b6e4d6de87cb';
export const visualSourceUsage = 'pinned_dsh_shell_components_theme_and_primitives_with_opl_owner_adapters';
export const expectedVisualSourceNormalizations = [] as const;
export const expectedPhaseOneBehaviorInvariants = [
  'routes_unchanged',
  'handlers_unchanged',
  'framework_state_and_action_abi_unchanged',
  'app_state_ownership_unchanged',
  'bilingual_copy_unchanged',
  'keyboard_tooltip_focus_and_accessible_name_preserved',
] as const;
export const expectedDeferredVisualSurfaces = [
  'conversation_timeline',
  'complete_settings_content',
  'runtime_status_content',
  'first_run',
  'modal_and_drawer_body_inventory',
] as const;
export const expectedVisualUpgradeEvidence = [
  'exact_upstream_commit_and_license_readback',
  'per_file_source_manifest_with_sha256',
  'upstream_diff_for_all_vendored_and_reference_paths',
  'focused_icon_theme_and_surface_tests',
  'desktop_and_narrow_light_dark_zh_en_visual_review',
  'keyboard_tooltip_focus_and_accessible_name_regression',
  'app_and_shell_canonical_main_readback',
] as const;
export const interactionReference = 'historical ChatGPT Codex macOS workflow and spatial interaction observation';
export const interactionReferenceUsage = 'historical_workflow_and_spatial_interaction_reference_only_no_code_brand_account_product_pixel_install_or_release_authority';
export const pixelReference = 'opl-app-approved-visual-baseline-v1 (App-owned)';
export const supersededInteractionReference = 'ChatGPT Codex macOS 26.707.31428 (2026-07-10)';
export const earlierSupersededInteractionReference = 'ChatGPT Codex macOS 26.707.31123 (2026-07-10)';
export const supersededInteractionReferences = [supersededInteractionReference, earlierSupersededInteractionReference];

export const foundationDocs = {
  readme: 'docs/product/gui/README.md',
  visual_system: 'docs/product/gui/visual-system.md',
  shell_implementation_guide: 'docs/product/gui/shell-implementation-guide.md',
  shell_conformance_matrix: 'docs/product/gui/shell-conformance-matrix.md',
} as const;

export const visualReferenceCohortPath = 'contracts/app-gui-visual-reference-cohort.json';
export const visualPrimitiveIds = ['composer', 'rail_row', 'icon_button', 'menu', 'settings_row'] as const;
export const expectedVisualReferenceScenes = [
  ['home-default-desktop-light-zh', 'home', 'desktop', 'light', 'zh-CN', '/guid', 'default'],
  ['home-model-menu-desktop-light-en', 'home', 'desktop', 'light', 'en-US', '/guid', 'model_menu_open'],
  [
    'home-capability-palette-desktop-dark-zh',
    'home',
    'desktop',
    'dark',
    'zh-CN',
    '/guid',
    'capability_palette_open',
  ],
  ['home-default-narrow-light-en', 'home', 'narrow', 'light', 'en-US', '/guid', 'default'],
  [
    'conversation-default-desktop-light-zh',
    'conversation',
    'desktop',
    'light',
    'zh-CN',
    '/conversation/:id',
    'default',
  ],
  [
    'conversation-model-menu-desktop-dark-en',
    'conversation',
    'desktop',
    'dark',
    'en-US',
    '/conversation/:id',
    'model_menu_open',
  ],
  [
    'conversation-command-menu-desktop-light-en',
    'conversation',
    'desktop',
    'light',
    'en-US',
    '/conversation/:id',
    'command_menu_open',
  ],
  [
    'conversation-default-narrow-dark-zh',
    'conversation',
    'narrow',
    'dark',
    'zh-CN',
    '/conversation/:id',
    'default',
  ],
  ['rail-selected-desktop-light-en', 'rail', 'desktop', 'light', 'en-US', '/conversation/:id', 'selected_row'],
  [
    'rail-hover-actions-desktop-dark-zh',
    'rail',
    'desktop',
    'dark',
    'zh-CN',
    '/conversation/:id',
    'row_hover_actions_visible',
  ],
  [
    'settings-general-desktop-light-zh',
    'settings',
    'desktop',
    'light',
    'zh-CN',
    '/settings/general',
    'default',
  ],
  [
    'settings-appearance-desktop-dark-en',
    'settings',
    'desktop',
    'dark',
    'en-US',
    '/settings/appearance',
    'default',
  ],
  [
    'settings-capabilities-desktop-light-en',
    'settings',
    'desktop',
    'light',
    'en-US',
    '/settings/capabilities',
    'default',
  ],
  [
    'settings-maintenance-desktop-dark-zh',
    'settings',
    'desktop',
    'dark',
    'zh-CN',
    '/settings/environment?section=updates',
    'default',
  ],
  [
    'settings-general-narrow-light-en',
    'settings',
    'narrow',
    'light',
    'en-US',
    '/settings/general',
    'default',
  ],
  [
    'settings-capabilities-narrow-dark-zh',
    'settings',
    'narrow',
    'dark',
    'zh-CN',
    '/settings/capabilities',
    'default',
  ],
] as const;

export const expectedStack = [
  {
    id: 'product_definition',
    priority: 1,
    entry_docs: [foundationDocs.readme, 'docs/product/gui/feature-inventory.md'],
    contract_refs: [
      'contracts/app-gui-product-contract.json',
      'contracts/app-product-profile.json',
      'contracts/app-page-state-matrix.json',
      'contracts/app-remote-companion.json',
    ],
  },
  {
    id: 'visual_system',
    priority: 2,
    entry_docs: [
      'docs/product/gui/ideal-interaction-spec.md',
      foundationDocs.visual_system,
      'docs/product/gui/codex-to-opl-app-delta.md',
      'docs/product/gui/element-audit.md',
    ],
    contract_refs: [
      'contracts/app-gui-product-contract.json',
      'contracts/app-product-profile.json',
      'contracts/app-page-state-matrix.json',
    ],
  },
  {
    id: 'shell_implementation_conformance',
    priority: 3,
    entry_docs: [foundationDocs.shell_implementation_guide, foundationDocs.shell_conformance_matrix],
    contract_refs: [
      'contracts/app-gui-product-contract.json',
      'contracts/app-product-profile.json',
      'contracts/app-page-state-matrix.json',
      'contracts/app-shell-candidates.json',
      'contracts/app-shell-adapter.json',
    ],
  },
] as const;
