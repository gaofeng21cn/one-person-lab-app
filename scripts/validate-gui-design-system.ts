#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  appOwnedActiveAionuiPrimaryNavigation,
  appOwnedCodexSubagentActivityPolicy,
  appOwnedDirectoryGroupPolicy,
  appOwnedExplicitSessionInputPolicy,
  appOwnedOplStandardAgentMembershipPolicy,
  appOwnedSendFailureInputPolicy,
  appOwnedSessionWorkspaceModel,
  appOwnedUnifiedContextMenu,
} from './validate-active-shell/app-contract-constants.ts';

type JsonRecord = Record<string, unknown>;
type ActiveSurfaceState = 'collapsed' | 'visible' | 'visible_wide_drawer_narrow';
type ContractConformanceStatus = 'aligned_contract' | 'current_contract_deviation';

const conformanceStatusVocabulary = {
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
    active: 'aionui';
    foreground: 'opl-studio';
  };
  visual_source_cohort: {
    contract: 'contracts/app-gui-visual-source-cohort.json';
    source_commit: '47f943859bef60e4160492346772ded9b24f765a';
    source_usage: 'bounded_source_reuse_for_icons_theme_tokens_and_visual_primitive_geometry_only';
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
    active_aionui_rail_state: ActiveSurfaceState;
    active_aionui_inspector_state: ActiveSurfaceState;
    active_aionui_conformance: {
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
    manifest: 'docs/product/gui/evidence/aionui-41301/manifest.json';
    shell_head: string;
    entries_verified: 8;
    packaged_command: true;
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

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const visualSourceCohortPath = 'contracts/app-gui-visual-source-cohort.json';
const visualSourceCommit = '47f943859bef60e4160492346772ded9b24f765a';
const visualSourceUsage = 'bounded_source_reuse_for_icons_theme_tokens_and_visual_primitive_geometry_only';
const expectedVisualSourceNormalizations = [
  {
    path: 'packages/client/ui-primitives/src/icons/index.tsx',
    kind: 'classic_react_jsx_runtime_import',
    change: "add import React from 'react' without changing glyph markup",
    reason: 'AionUI compiles TSX with jsx=react while the pinned DSH package uses the automatic JSX runtime',
  },
] as const;
const expectedPhaseOneBehaviorInvariants = [
  'routes_unchanged',
  'handlers_unchanged',
  'framework_state_and_action_abi_unchanged',
  'app_state_ownership_unchanged',
  'arco_control_semantics_unchanged',
  'bilingual_copy_unchanged',
  'keyboard_tooltip_focus_and_accessible_name_preserved',
] as const;
const expectedDeferredVisualSurfaces = [
  'conversation_timeline',
  'complete_settings_content',
  'runtime_status_content',
  'first_run',
  'modal_and_drawer_body_inventory',
] as const;
const expectedVisualUpgradeEvidence = [
  'exact_upstream_commit_and_license_readback',
  'per_file_source_manifest_with_sha256',
  'upstream_diff_for_all_vendored_and_reference_paths',
  'focused_icon_theme_and_surface_tests',
  'desktop_and_narrow_light_dark_zh_en_visual_review',
  'keyboard_tooltip_focus_and_accessible_name_regression',
  'app_and_shell_canonical_main_readback',
] as const;
const interactionReference = 'historical ChatGPT Codex macOS workflow and spatial interaction observation';
const interactionReferenceUsage = 'historical_workflow_and_spatial_interaction_reference_only_no_code_brand_account_product_pixel_install_or_release_authority';
const pixelReference = 'opl-app-approved-visual-baseline-v1 (App-owned)';
const supersededInteractionReference = 'ChatGPT Codex macOS 26.707.31428 (2026-07-10)';
const earlierSupersededInteractionReference = 'ChatGPT Codex macOS 26.707.31123 (2026-07-10)';
const supersededInteractionReferences = [supersededInteractionReference, earlierSupersededInteractionReference];

const foundationDocs = {
  readme: 'docs/product/gui/README.md',
  visual_system: 'docs/product/gui/visual-system.md',
  shell_implementation_guide: 'docs/product/gui/shell-implementation-guide.md',
  shell_conformance_matrix: 'docs/product/gui/shell-conformance-matrix.md',
} as const;

const visualReferenceCohortPath = 'contracts/app-gui-visual-reference-cohort.json';
const visualPrimitiveIds = ['composer', 'rail_row', 'icon_button', 'menu', 'settings_row'] as const;
const expectedVisualReferenceScenes = [
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

const expectedStack = [
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

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
}

function sameStrings(actual: unknown, expected: readonly string[]): boolean {
  return JSON.stringify(stringArray(actual)) === JSON.stringify(expected);
}

function conformanceStatus(matches: boolean): ContractConformanceStatus {
  return matches ? 'aligned_contract' : 'current_contract_deviation';
}

function readJson(root: string, relativePath: string, issues: Set<string>): JsonRecord {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    issues.add(`missing ${relativePath}`);
    return {};
  }
  try {
    return record(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (error) {
    issues.add(`${relativePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

function sha256(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function isExactIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function hasExactRecord(actual: JsonRecord, expected: JsonRecord): boolean {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return JSON.stringify(actualKeys) === JSON.stringify(expectedKeys) && expectedKeys.every((key) => actual[key] === expected[key]);
}

function validateVisualEvidence(root: string, historicalPixelShellSha: string, issues: Set<string>): number {
  const manifestPath = 'docs/product/gui/evidence/aionui-41301/manifest.json';
  const manifest = readJson(root, manifestPath, issues);
  const sourceManifestPath = 'docs/product/gui/evidence/aionui-41301/source-manifest.json';
  const sourceManifest = readJson(root, sourceManifestPath, issues);
  const entries = Array.isArray(manifest.entries) ? manifest.entries.map(record) : [];
  const sourceEntries = Array.isArray(sourceManifest.entries) ? sourceManifest.entries.map(record) : [];
  const claims = record(manifest.claims);
  const sourceClaims = record(sourceManifest.claims);
  const expectedClaims = {
    route_state_non_empty: true,
    layout_bounds_checked: true,
    parity_1_to_1: false,
    release_ready: false,
  };

  if (
    manifest.schema !== 'opl_app_gui_visual_evidence.v1' ||
    manifest.owner !== 'one-person-lab-app' ||
    manifest.shell_head !== historicalPixelShellSha ||
    manifest.source_manifest !== sourceManifestPath ||
    manifest.entry_count !== 8 ||
    entries.length !== 8 ||
    typeof manifest.command !== 'string' ||
    !manifest.command.includes('E2E_PACKAGED=1') ||
    !hasExactRecord(claims, expectedClaims)
  ) {
    issues.add('AionUI 41301 visual evidence manifest must bind eight packaged route/layout entries without parity or release claims');
  }

  const sourcePath = path.join(root, sourceManifestPath);
  if (
    !fs.existsSync(sourcePath) ||
    manifest.source_manifest_sha256 !== sha256(sourcePath) ||
    sourceManifest.schema !== 'opl_aionui_gui_route_visual_evidence.v1' ||
    sourceManifest.shell_head !== historicalPixelShellSha ||
    sourceManifest.command !== manifest.command ||
    sourceEntries.length !== 8
  ) {
    issues.add('AionUI 41301 promoted evidence must preserve the exact source manifest and final Shell binding');
  }

  if (
    !isExactIsoTimestamp(manifest.generated_at) ||
    !isExactIsoTimestamp(sourceManifest.generated_at) ||
    manifest.generated_at !== sourceManifest.generated_at
  ) {
    issues.add('AionUI 41301 promoted and source evidence must share one exact ISO generated_at timestamp');
  }
  if (
    manifest.evidence_scope !== 'route_state_non_empty_and_layout_only' ||
    sourceManifest.evidence_scope !== manifest.evidence_scope
  ) {
    issues.add('AionUI 41301 promoted and source evidence must share the route-state and layout-only evidence_scope');
  }
  if (!hasExactRecord(sourceClaims, expectedClaims) || !hasExactRecord(sourceClaims, claims)) {
    issues.add('AionUI 41301 promoted and source evidence claims must be identical and limited to the governed claim set');
  }

  const ids = new Set<string>();
  for (const entry of entries) {
    const id = typeof entry.id === 'string' ? entry.id : '';
    const screenshotPath = typeof entry.screenshot_path === 'string' ? entry.screenshot_path : '';
    const filePath = path.join(root, screenshotPath);
    if (
      !id ||
      ids.has(id) ||
      !screenshotPath.startsWith('docs/product/gui/evidence/aionui-41301/screenshots/') ||
      !fs.existsSync(filePath) ||
      entry.bytes !== fs.statSync(filePath).size ||
      entry.sha256 !== sha256(filePath)
    ) {
      issues.add(
        `AionUI 41301 visual evidence entry ${id || '<missing>'} must bind a unique promoted screenshot with exact bytes and SHA-256`,
      );
    }
    ids.add(id);
  }

  const promotedEntryIds = entries.map((entry) => entry.id);
  const sourceEntryIds = sourceEntries.map((entry) => entry.id);
  if (JSON.stringify(promotedEntryIds) !== JSON.stringify(sourceEntryIds)) {
    issues.add('AionUI 41301 promoted and source evidence must preserve the same ordered entry ID set');
  }

  for (const entry of sourceEntries) {
    const anchors = Array.isArray(entry.anchors) ? entry.anchors.map(record) : [];
    const layoutChecks = Array.isArray(entry.layout_checks) ? entry.layout_checks.map(record) : [];
    const coverageGaps = Array.isArray(entry.coverage_gaps) ? entry.coverage_gaps : [];
    if (
      entry.shell_head !== historicalPixelShellSha ||
      anchors.length === 0 ||
      anchors.some((anchor) => anchor.matched !== true) ||
      layoutChecks.length === 0 ||
      layoutChecks.some((check) => check.passed !== true) ||
      coverageGaps.length !== 0
    ) {
      issues.add(`AionUI 41301 source evidence entry ${String(entry.id)} must pass every anchor/layout check with no declared gap`);
    }
  }

  return entries.length;
}

function validateActiveShellCheckout(
  root: string,
  shellSource: JsonRecord,
  verifiedAncestor: string,
  issues: Set<string>,
): void {
  const checkoutPath = typeof shellSource.checkout_path === 'string' ? shellSource.checkout_path : '';
  if (!checkoutPath) {
    issues.add('active shell adapter must declare shell_source.checkout_path');
    return;
  }

  const shellRoot = path.join(root, checkoutPath);
  if (!fs.existsSync(shellRoot)) {
    issues.add(`missing active shell checkout ${checkoutPath}; run npm run ensure:shell`);
    return;
  }

  try {
    const currentHead = execFileSync('git', ['-C', shellRoot, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    if (!/^[0-9a-f]{40}$/.test(currentHead)) {
      issues.add('active AionUI checkout must resolve a 40-character Git HEAD');
      return;
    }
    try {
      execFileSync('git', ['-C', shellRoot, 'merge-base', '--is-ancestor', verifiedAncestor, currentHead], {
        stdio: 'pipe',
      });
    } catch {
      issues.add(`active AionUI checkout ${currentHead} must contain verified GUI ancestor ${verifiedAncestor}`);
    }
  } catch (error) {
    issues.add(`unable to read active AionUI checkout: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validateGuiDesignSystem(root = defaultRoot): GuiDesignSystemValidation {
  const issues = new Set<string>();
  const registry = readJson(root, 'contracts/app-shell-candidates.json', issues);
  const profile = readJson(root, 'contracts/app-product-profile.json', issues);
  const guiContract = readJson(root, 'contracts/app-gui-product-contract.json', issues);
  const pageStateMatrix = readJson(root, 'contracts/app-page-state-matrix.json', issues);
  const shellAdapter = readJson(root, 'contracts/app-shell-adapter.json', issues);
  const visualReferenceCohort = readJson(root, visualReferenceCohortPath, issues);
  const visualSourceCohort = readJson(root, visualSourceCohortPath, issues);
  const packageJson = readJson(root, 'package.json', issues);
  const governance = record(registry.design_system_governance);

  if (governance.schema !== 'opl_app_gui_design_system_governance.v1') {
    issues.add('design_system_governance.schema must be opl_app_gui_design_system_governance.v1');
  }
  if (governance.entry_doc !== foundationDocs.readme) {
    issues.add(`design_system_governance.entry_doc must be ${foundationDocs.readme}`);
  }

  const declaredFoundationDocs = record(governance.foundation_docs);
  for (const [id, relativePath] of Object.entries(foundationDocs)) {
    if (declaredFoundationDocs[id] !== relativePath) {
      issues.add(`design_system_governance.foundation_docs.${id} must be ${relativePath}`);
    }
  }

  const stack = Array.isArray(governance.definition_stack) ? governance.definition_stack : [];
  if (stack.length !== expectedStack.length) {
    issues.add('design_system_governance.definition_stack must contain exactly three layers');
  }
  expectedStack.forEach((expected, index) => {
    const actual = record(stack[index]);
    if (actual.id !== expected.id || actual.priority !== expected.priority) {
      issues.add(`definition stack layer ${index + 1} must be ${expected.id} at priority ${expected.priority}`);
    }
    if (!sameStrings(actual.entry_docs, expected.entry_docs)) {
      issues.add(`${expected.id}.entry_docs must match the governed document entry points`);
    }
    if (!sameStrings(actual.contract_refs, expected.contract_refs)) {
      issues.add(`${expected.id}.contract_refs must match the governed App contracts`);
    }
    for (const relativePath of [...expected.entry_docs, ...expected.contract_refs]) {
      if (!fs.existsSync(path.join(root, relativePath))) issues.add(`missing ${relativePath}`);
    }
  });
  if (
    !sameStrings(
      governance.priority_order,
      expectedStack.map((layer) => layer.id),
    )
  ) {
    issues.add('design_system_governance.priority_order must follow product, visual, then shell conformance');
  }
  if (governance.shell_authority !== 'implementation_only_cannot_redefine_product') {
    issues.add('design_system_governance.shell_authority must keep shells implementation-only');
  }
  const declaredStatusVocabulary = record(governance.conformance_status_vocabulary);
  for (const [axis, statuses] of Object.entries(conformanceStatusVocabulary)) {
    if (!sameStrings(declaredStatusVocabulary[axis], statuses)) {
      issues.add(`design_system_governance.conformance_status_vocabulary.${axis} must match the governed status vocabulary`);
    }
  }
  if (
    declaredStatusVocabulary.axis_policy !== 'contract_source_pixel_independent' ||
    declaredStatusVocabulary.matrix_row_policy !== 'every_implementation_requirement_has_both_shells_all_three_axes' ||
    declaredStatusVocabulary.pixel_verified_claim !== 'fresh_pixels_exist_not_visual_parity_or_release_readiness'
  ) {
    issues.add('conformance status axes must remain independent and pixel_verified must stay evidence-only');
  }

  const mainline = record(registry.active_gui_mainline);
  const alternatives = record(registry.alternative_gui_policy);
  const candidates = Array.isArray(registry.candidates) ? registry.candidates.map(record) : [];
  const nativeCandidate = candidates.find((candidate) => candidate.id === 'opl-studio') ?? {};
  if (mainline.shell !== 'aionui' || registry.active_shell_unchanged !== 'aionui') {
    issues.add('candidate registry must keep AionUI active');
  }
  if (alternatives.only_foreground_alternative !== 'opl-studio') {
    issues.add('candidate registry must keep opl-studio foreground');
  }
  if (stringArray(alternatives.default_candidate_validation_scope).length !== 0) {
    issues.add('default GUI design validation must use role registry only, not candidate detail');
  }
  if (candidates.length !== 1 || nativeCandidate.state !== 'active_product_development') {
    issues.add('candidate registry must contain only the active OPL Studio foreground candidate');
  }
  if (nativeCandidate.foreground_alternative_role !== 'only_foreground_alternative') {
    issues.add('opl-studio must carry only_foreground_alternative role');
  }

  const interactionBaseline = record(guiContract.interaction_baseline);
  const visualSource = record(interactionBaseline.visual_source);
  const currentReference = record(interactionBaseline.interaction_reference);
  const pixelBaseline = record(interactionBaseline.pixel_baseline);
  if (
    guiContract.schema_version !== 2 ||
    profile.schema_version !== 2 ||
    pageStateMatrix.schema_version !== 2 ||
    interactionBaseline.schema !== 'opl_app_visual_source_policy.v4' ||
    visualSource.product !== 'DeepSeek Harness GUI' ||
    visualSource.selection_policy !== 'pinned_source_commit_only' ||
    visualSource.source_cohort_ref !== visualSourceCohortPath ||
    !sameStrings(visualSource.required_source_identity, [
      'repository',
      'commit',
      'license',
      'notice_inventory',
      'source_inventory',
    ]) ||
    visualSource.usage !== visualSourceUsage ||
    !sameStrings(visualSource.forbidden_authority, [
      'product_behavior',
      'routes',
      'framework_abi',
      'app_state_or_actions',
      'runtime',
      'sessions',
      'connections',
      'release',
      'pixel_acceptance',
    ]) ||
    visualSource.external_artifact_required_for_release !== false ||
    currentReference.product !== 'ChatGPT Codex macOS' ||
    currentReference.status !== 'historical_workflow_and_spatial_reference_only' ||
    currentReference.observation_ref !== 'docs/product/gui/codex-to-opl-app-delta.md#literal-observation-boundary' ||
    currentReference.visual_authority !== false ||
    currentReference.source_code_reuse_allowed !== false
  ) {
    issues.add('visual source policy must bind the pinned DSH cohort while Codex remains historical interaction reference only');
  }
  if (
    pixelBaseline.owner !== 'one-person-lab-app' ||
    pixelBaseline.baseline_id !== 'opl-app-approved-visual-baseline-v1' ||
    !['capture_and_human_approval_required', 'approved'].includes(String(pixelBaseline.state)) ||
    !sameStrings(pixelBaseline.allowed_states, [
      'capture_and_human_approval_required',
      'approved',
    ]) ||
    pixelBaseline.approval_receipt_schema !==
      'opl_app_gui_visual_baseline_approval_receipt.v1' ||
    pixelBaseline.approval_receipt_required_for_approved_state !== true ||
    pixelBaseline.reference_ref !== 'contracts/app-gui-visual-reference-cohort.json' ||
    pixelBaseline.usage !== 'app_owned_pixel_regression_only' ||
    pixelBaseline.external_product_artifact_required !== false ||
    pixelBaseline.release_dependency !==
      'opl_contract_current_cohort_installed_evidence_and_human_acceptance_only'
  ) {
    issues.add(`pixel regression must use the App-owned baseline ${pixelReference}`);
  }
  const supersededObservations = Array.isArray(interactionBaseline.superseded_observations)
    ? interactionBaseline.superseded_observations.map(record)
    : [];
  for (const build of ['26.707.31428', '26.707.31123']) {
    if (
      !supersededObservations.some(
        (observation) =>
          observation.product === 'ChatGPT Codex macOS' &&
          observation.build === build &&
          observation.observed_on === '2026-07-10' &&
          observation.status === 'superseded_observation_only',
      )
    ) {
      issues.add(`interaction_baseline must retain ${build} only as a superseded observation`);
    }
  }

  const maintenancePolicy = record(guiContract.gui_maintenance_policy);
  const maintenanceGoal = record(maintenancePolicy.goal);
  const referencePromotion = record(maintenancePolicy.visual_source_promotion);
  const upstreamFollowing = record(maintenancePolicy.aionui_upstream_following);
  const classificationMeanings = record(upstreamFollowing.classification_meanings);
  const maintenanceBudgets = record(maintenancePolicy.maintenance_budgets);
  const auditBaseline = record(maintenanceBudgets.audit_baseline);
  const codexOverlayBudget = record(maintenanceBudgets.codex_overlay);
  const visualComparison = record(maintenancePolicy.visual_comparison_protocol);
  const cohortReference = record(visualReferenceCohort.reference);
  const cohortCandidate = record(visualReferenceCohort.candidate);
  const cohortPrimitiveContract = record(visualReferenceCohort.shared_primitive_contract);
  const cohortPrimitiveBindings = record(cohortPrimitiveContract.shell_class_bindings);
  const cohortCapture = record(visualReferenceCohort.capture_contract);
  const cohortViewports = record(cohortCapture.supported_viewports);
  const cohortDesktopViewport = record(cohortViewports.desktop);
  const cohortNarrowViewport = record(cohortViewports.narrow);
  const cohortComparison = record(visualReferenceCohort.comparison_contract);
  const cohortMaskPolicy = record(cohortComparison.mask_policy);
  const cohortHumanReview = record(cohortComparison.human_review);
  const cohortEvidenceBoundary = record(visualReferenceCohort.evidence_boundary);
  const sourceUpstream = record(visualSourceCohort.upstream);
  const sourceNoticeInventory = record(sourceUpstream.notice_inventory);
  const sourceShellAdoption = record(visualSourceCohort.shell_adoption);
  const sourceUpgradePolicy = record(visualSourceCohort.upgrade_policy);
  const sourceEvidenceBoundary = record(visualSourceCohort.evidence_boundary);
  const cohortScenes = Array.isArray(visualReferenceCohort.scene_matrix)
    ? visualReferenceCohort.scene_matrix.map(record)
    : [];
  const maintenancePolicyRef = 'docs/product/gui/gui-maintenance-policy.md';
  if (
    maintenancePolicy.schema !== 'opl_app_gui_maintenance_policy.v1' ||
    maintenancePolicy.owner !== 'one-person-lab-app' ||
    maintenancePolicy.human_policy_ref !== maintenancePolicyRef ||
    !fs.existsSync(path.join(root, maintenancePolicyRef)) ||
    maintenanceGoal.upstream_following !== 'aionui_stable_tags_through_bounded_selective_intake' ||
    maintenanceGoal.visual_alignment !==
      'pinned_deepseek_harness_visual_source_with_opl_brand_and_app_owned_pixel_baselines' ||
    maintenanceGoal.one_to_one_claim_policy !== 'scene_bound_comparison_only_never_unqualified_product_wide_claim' ||
    referencePromotion.active_visual_source_policy_ref !==
      'contracts/app-gui-product-contract.json#interaction_baseline.visual_source' ||
    referencePromotion.active_visual_source_cohort_ref !== visualSourceCohortPath ||
    referencePromotion.active_pixel_baseline_ref !==
      'contracts/app-gui-product-contract.json#interaction_baseline.pixel_baseline' ||
    !sameStrings(referencePromotion.required_evidence, [
      'exact_upstream_repository_commit_and_mit_license',
      'per_file_source_inventory_and_vendor_sha256',
      'runtime_import_versus_adapter_reference_classification',
      'protected_opl_surface_non_regression_review',
      'desktop_and_narrow_light_dark_zh_en_comparison_manifest',
    ]) ||
    referencePromotion.promotion_gate !== 'all_required_evidence_present_and_app_gui_validator_passes' ||
    referencePromotion.supersession_policy !==
      'prior_dsh_cohort_and_codex_visual_observations_remain_historical_provenance_only' ||
    referencePromotion.release_independence !== true ||
    referencePromotion.external_artifact_download_install_or_launch_required !== false
  ) {
    issues.add('GUI maintenance policy must version the pinned DSH visual source without implying release completion');
  }
  if (
    upstreamFollowing.channel !== 'stable_tags_only' ||
    !sameStrings(upstreamFollowing.required_release_metadata, [
      'tag',
      'commit',
      'published_at',
      'draft',
      'prerelease',
    ]) ||
    upstreamFollowing.draft_or_prerelease_policy !== 'reject_as_intake_target' ||
    !sameStrings(upstreamFollowing.classifications, ['accept', 'adapt', 'redirect', 'reject']) ||
    classificationMeanings.accept !== 'reuse_without_changing_app_product_authority' ||
    classificationMeanings.adapt !== 'reuse_through_app_contract_profile_bridge_or_overlay' ||
    classificationMeanings.redirect !== 'preserve_compatibility_but_route_to_app_owned_surface' ||
    classificationMeanings.reject !== 'do_not_expose_or_absorb_into_ordinary_app_behavior' ||
    upstreamFollowing.intake_gate !==
      'read_release_metadata_then_measure_divergence_and_overlap_then_classify_then_run_focused_and_active_shell_gates' ||
    upstreamFollowing.broad_history_merge_as_default !== false ||
    upstreamFollowing.reviewed_does_not_mean_absorbed !== true
  ) {
    issues.add('GUI maintenance policy must follow stable AionUI tags through classified selective intake');
  }
  if (
    auditBaseline.shell_ref !== '772dd1ef7226fd028bd2c9768a2e66c5e83d3f89' ||
    auditBaseline.upstream_tag !== 'v2.1.34' ||
    auditBaseline.upstream_ref !== '0fea1eb82634f3746b9ccf68507277c347fa08a3' ||
    auditBaseline.merge_base !== '70974c59a275e565e8fc2bd7ecaf2dcac74227f0' ||
    auditBaseline.upstream_only_commits !== 184 ||
    auditBaseline.shell_only_commits !== 5516 ||
    auditBaseline.shell_changed_files !== 802 ||
    auditBaseline.overlap_files !== 342 ||
    auditBaseline.renderer_overlap_files !== 223 ||
    maintenanceBudgets.overlap_growth_policy !== 'fail_until_intentionally_reviewed_and_rebaselined' ||
    maintenanceBudgets.maximum_overlap_file_growth !== 0 ||
    maintenanceBudgets.maximum_renderer_overlap_file_growth !== 0 ||
    codexOverlayBudget.important_declarations !== 105 ||
    codexOverlayBudget.selector_blocks !== 52 ||
    codexOverlayBudget.growth_policy !== 'no_growth_without_app_authorized_exception'
  ) {
    issues.add('GUI maintenance policy must bind measured upstream overlap and non-growing Codex overlay budgets');
  }
  if (
    visualComparison.schema !== 'opl_app_gui_visual_comparison.v1' ||
    visualComparison.active_reference_cohort_ref !== visualReferenceCohortPath ||
    visualComparison.shell_comparator_ref !== 'opl-aion-shell/scripts/compare-gui-visual-cohort.ts' ||
    !sameStrings(visualComparison.shared_primitive_ids, visualPrimitiveIds) ||
    !sameStrings(visualComparison.required_binding_fields, [
      'reference_baseline_id',
      'reference_approval_receipt_sha256',
      'app_contract_ref',
      'shell_commit',
      'package_or_dev_build_identity',
      'os_version',
      'architecture',
      'display_scale',
      'viewport',
      'theme',
      'locale',
      'route',
      'state',
      'reference_screenshot_sha256',
      'candidate_screenshot_sha256',
    ]) ||
    !sameStrings(visualComparison.comparison_modes, [
      'side_by_side_human_review',
      'pixel_diff_with_declared_masks_and_thresholds',
    ]) ||
    !sameStrings(visualComparison.required_claims, ['scene_compared', 'layout_checked', 'visual_delta_reviewed']) ||
    !sameStrings(visualComparison.forbidden_inferences, [
      'product_wide_one_to_one',
      'release_ready',
      'installed_current',
      'upstream_absorbed',
    ]) ||
    !sameStrings(visualComparison.scene_bound_visual_parity_requires, [
      'exact_binding_complete',
      'dimensions_equal',
      'pixel_thresholds_passed',
      'visual_delta_reviewed',
    ])
  ) {
    issues.add('GUI maintenance visual comparison must bind exact cohorts and keep parity claims scene-scoped');
  }
  if (
    visualSourceCohort.schema_version !== 1 ||
    visualSourceCohort.schema !== 'opl_app_gui_visual_source_cohort.v1' ||
    visualSourceCohort.owner !== 'one-person-lab-app' ||
    visualSourceCohort.state !== 'pinned_for_aionui_visual_foundation' ||
    sourceUpstream.repository !== 'https://github.com/deepseek-ai/deepseek-harness.git' ||
    sourceUpstream.commit !== visualSourceCommit ||
    sourceUpstream.license !== 'MIT' ||
    sourceUpstream.license_source_path !== 'LICENSE' ||
    !sameStrings(sourceNoticeInventory.separate_notice_source_paths, []) ||
    sourceNoticeInventory.policy !==
      'pinned_commit_contains_no_separate_NOTICE_file; preserve_the_root_LICENSE_notice_with_every_vendored_substantial_copy' ||
    sourceUpstream.floating_ref_allowed !== false ||
    !sameStrings(visualSourceCohort.runtime_vendored_source_paths, [
      'packages/client/ui-primitives/src/icons/index.tsx',
      'packages/client/ui-primitives/src/icons/props.ts',
      'packages/client/ui-theme/src/styles/base.css',
      'packages/client/ui-theme/src/styles/design-platform.css',
      'packages/client/ui-theme/src/styles/gradient-shadow-text.css',
      'packages/client/ui-theme/src/styles/scrollbar.css',
      'packages/client/ui-primitives/src/Button.module.css',
      'packages/client/ui-primitives/src/Input.module.css',
      'packages/client/ui-primitives/src/Pill.module.css',
      'packages/client/ui-primitives/src/StateDot.module.css',
      'packages/client/ui-primitives/src/Tooltip.module.css',
      'packages/client/ui-primitives/src/Menu.module.css',
    ]) ||
    !sameStrings(visualSourceCohort.adapter_reference_source_paths, [
      'packages/client/ui-layout/src/client/AppFrame.module.css',
      'packages/client/ui-sidebar/src/client/SidebarRoot.module.css',
      'packages/client/ui-conversation/src/client/skeleton/InputBar.module.css',
      'packages/client/ui-settings-general/src/client/chrome.module.css',
      'packages/client/ui-primitives/src/Button.tsx',
      'packages/client/ui-primitives/src/Input.tsx',
      'packages/client/ui-primitives/src/Pill.tsx',
      'packages/client/ui-primitives/src/StateDot.tsx',
      'packages/client/ui-primitives/src/Tooltip.tsx',
      'packages/client/ui-primitives/src/Menu.tsx',
    ]) ||
    !sameStrings(visualSourceCohort.deferred_reference_source_paths, [
      'packages/client/ui-primitives/src/markdown/MessageText.tsx',
      'packages/client/ui-primitives/src/markdown/MessageText.module.css',
    ]) ||
    sourceShellAdoption.active_shell !== 'aionui' ||
    sourceShellAdoption.reuse_mode !== 'bounded_vendored_visual_source_with_opl_adapters' ||
    sourceShellAdoption.required_source_manifest !==
      'packages/desktop/src/renderer/vendor/deepseek-harness/visual-source-manifest.json' ||
    sourceShellAdoption.required_license_notice !==
      'packages/desktop/src/renderer/vendor/deepseek-harness/LICENSE' ||
    sourceShellAdoption.provider_component !== 'OplVisualProvider' ||
    sourceShellAdoption.icon_adapter_component !== 'OplIcon' ||
    JSON.stringify(sourceShellAdoption.allowed_vendor_normalizations) !==
      JSON.stringify(expectedVisualSourceNormalizations) ||
    sourceShellAdoption.app_product_authority_transfer_allowed !== false ||
    sourceShellAdoption.framework_abi_change_allowed !== false ||
    !stringArray(visualSourceCohort.excluded_source_and_runtime).includes('packages/client/ui-slots') ||
    !stringArray(visualSourceCohort.excluded_source_and_runtime).includes('complete DSH Client Cordis host') ||
    !sameStrings(visualSourceCohort.phase_one_surfaces, [
      'titlebar',
      'navigation_rail',
      'home',
      'composer',
      'settings_navigation',
    ]) ||
    !sameStrings(visualSourceCohort.phase_one_behavior_invariants, expectedPhaseOneBehaviorInvariants) ||
    !sameStrings(visualSourceCohort.deferred_surfaces, expectedDeferredVisualSurfaces) ||
    sourceUpgradePolicy.mode !== 'manual_pinned_cohort_promotion' ||
    !sameStrings(sourceUpgradePolicy.required_evidence, expectedVisualUpgradeEvidence) ||
    sourceUpgradePolicy.automatic_floating_update !== false ||
    sourceUpgradePolicy.dsh_runtime_expansion_by_visual_upgrade !== false ||
    sourceEvidenceBoundary.source_cohort_pinned !== true ||
    sourceEvidenceBoundary.shell_source_implemented !== true ||
    sourceEvidenceBoundary.pixel_baseline_approved !== false ||
    sourceEvidenceBoundary.installed_current !== false ||
    sourceEvidenceBoundary.release_ready !== false
  ) {
    issues.add('visual source cohort must pin the DSH commit, require the Shell source implementation, and keep AionUI limited to visual adapters without runtime or release authority');
  }
  if (
    visualReferenceCohort.schema_version !== 1 ||
    visualReferenceCohort.schema !== 'opl_app_gui_visual_reference_cohort.v1' ||
    visualReferenceCohort.owner !== 'one-person-lab-app' ||
    visualReferenceCohort.state !== 'app_owned_baseline_governance_active' ||
    cohortReference.owner !== 'one-person-lab-app' ||
    cohortReference.baseline_id !== 'opl-app-approved-visual-baseline-v1' ||
    !['capture_and_human_approval_required', 'approved'].includes(String(cohortReference.state)) ||
    !sameStrings(cohortReference.allowed_states, [
      'capture_and_human_approval_required',
      'approved',
    ]) ||
    cohortReference.approval_receipt_schema !==
      'opl_app_gui_visual_baseline_approval_receipt.v1' ||
    (cohortReference.state === 'capture_and_human_approval_required' &&
      (cohortReference.approval_receipt_file !== null ||
        cohortReference.approval_receipt_sha256 !== null)) ||
    (cohortReference.state === 'approved' &&
      (cohortReference.approval_receipt_file !== 'baseline-approval-receipt.json' ||
        !/^[a-f0-9]{64}$/.test(String(cohortReference.approval_receipt_sha256)))) ||
    pixelBaseline.state !== cohortReference.state ||
    cohortReference.platform !== 'macos' ||
    cohortReference.reference_role !== 'app_owned_pixel_regression_baseline' ||
    cohortReference.external_product_artifact_required !== false ||
    cohortReference.stable_release_dependency !== false ||
    cohortCandidate.product !== 'One Person Lab App' ||
    cohortCandidate.shell !== 'opl-aion-shell' ||
    cohortCandidate.app_contract_ref !==
      'contracts/app-gui-product-contract.json#gui_maintenance_policy.visual_comparison_protocol' ||
    cohortCandidate.shell_source_ref !== 'active_shell_checkout_git_head' ||
    cohortCandidate.comparison_tool !== 'opl-aion-shell/scripts/compare-gui-visual-cohort.ts'
  ) {
    issues.add('visual reference cohort must bind a reachable pending-or-approved App-owned pixel baseline and thin AionUI candidate route');
  }
  if (
    cohortPrimitiveContract.authority !== 'one-person-lab-app' ||
    cohortPrimitiveContract.shell_role !== 'thin_implementation_overlay' ||
    !sameStrings(cohortPrimitiveContract.primitive_ids, visualPrimitiveIds) ||
    cohortPrimitiveContract.new_component_framework_allowed !== false ||
    cohortPrimitiveContract.upstream_authority_transfer_allowed !== false ||
    visualPrimitiveIds.some((id) => cohortPrimitiveBindings[id] !== `opl-codex-${id.replace('_', '-')}`)
  ) {
    issues.add('visual reference cohort must use the five App-owned visual primitives without a new Shell framework');
  }
  if (
    cohortCapture.reference_and_candidate_same_machine_required !== true ||
    cohortCapture.reference_and_candidate_same_display_scale_required !== true ||
    cohortCapture.reference_and_candidate_same_viewport_required !== true ||
    cohortCapture.reference_and_candidate_same_theme_locale_route_state_required !== true ||
    cohortDesktopViewport.width !== 1440 ||
    cohortDesktopViewport.height !== 900 ||
    cohortNarrowViewport.width !== 400 ||
    cohortNarrowViewport.height !== 800 ||
    !sameStrings(cohortCapture.themes, ['light', 'dark']) ||
    !sameStrings(cohortCapture.locales, ['zh-CN', 'en-US']) ||
    !sameStrings(cohortCapture.required_surface_families, ['home', 'conversation', 'rail', 'settings'])
  ) {
    issues.add('visual reference cohort must cover same-machine desktop/narrow light/dark zh/en captures');
  }
  if (
    cohortComparison.pixel_channel_delta_threshold !== 8 ||
    cohortComparison.changed_pixel_ratio_max !== 0.015 ||
    cohortComparison.mean_absolute_channel_delta_max !== 1.5 ||
    cohortComparison.alpha_channel_included !== true ||
    cohortComparison.dimension_mismatch !== 'fail' ||
    cohortComparison.missing_scene !== 'fail' ||
    cohortComparison.diff_png_required !== true ||
    cohortMaskPolicy.default !== 'none' ||
    cohortMaskPolicy.declaration_required !== true ||
    cohortMaskPolicy.maximum_masked_area_ratio !== 0.08 ||
    !sameStrings(cohortMaskPolicy.allowed_reasons, [
      'caret_blink',
      'os_window_chrome_dynamic',
      'live_status_timestamp',
    ]) ||
    cohortMaskPolicy.undeclared_dynamic_region !== 'fail' ||
    cohortHumanReview.required !== true ||
    !sameStrings(cohortHumanReview.binding_fields, [
      'scene_id',
      'reference_screenshot_sha256',
      'candidate_screenshot_sha256',
      'verdict',
    ]) ||
    cohortHumanReview.accepted_verdict !== 'accepted' ||
    !sameStrings(cohortComparison.scene_bound_visual_parity_requires, [
      'exact_binding_complete',
      'dimensions_equal',
      'pixel_thresholds_passed',
      'visual_delta_reviewed',
    ])
  ) {
    issues.add('visual reference cohort must fail closed on dimensions, pixel thresholds, masks, and exact human review');
  }
  if (cohortScenes.length !== expectedVisualReferenceScenes.length) {
    issues.add(`visual reference cohort must contain exactly ${expectedVisualReferenceScenes.length} governed scenes`);
  }
  expectedVisualReferenceScenes.forEach(
    ([id, surfaceFamily, viewport, theme, locale, route, state], index) => {
      const scene = cohortScenes[index] ?? {};
      if (
        scene.id !== id ||
        scene.surface_family !== surfaceFamily ||
        scene.viewport !== viewport ||
        scene.theme !== theme ||
        scene.locale !== locale ||
        scene.route !== route ||
        scene.state !== state ||
        scene.image !== `${id}.png` ||
        !Array.isArray(scene.masks)
      ) {
        issues.add(`visual reference cohort scene ${index + 1} must remain ${id} with exact binding fields`);
        return;
      }
      for (const maskValue of scene.masks) {
        const mask = record(maskValue);
        const validCoordinates = ['x', 'y', 'width', 'height'].every(
          (field) => Number.isInteger(mask[field]) && Number(mask[field]) >= 0,
        );
        if (
          !validCoordinates ||
          Number(mask.width) === 0 ||
          Number(mask.height) === 0 ||
          !stringArray(cohortMaskPolicy.allowed_reasons).includes(String(mask.reason))
        ) {
          issues.add(`visual reference cohort scene ${id} contains an invalid mask`);
        }
      }
    },
  );
  if (
    cohortEvidenceBoundary.current_reference_assets_complete !== false ||
    cohortEvidenceBoundary.current_candidate_assets_complete !== false ||
    cohortEvidenceBoundary.current_scene_comparison_complete !== false ||
    cohortEvidenceBoundary.visual_parity_complete !== false ||
    cohortEvidenceBoundary.installed_current !== false ||
    cohortEvidenceBoundary.release_ready !== false ||
    cohortEvidenceBoundary.product_wide_one_to_one !== false ||
    cohortEvidenceBoundary.required_final_evidence_owner !== '019fa0ef-9514-7293-ba5b-15cb8a509522' ||
    cohortEvidenceBoundary.final_evidence_owner_role !==
      'artifact_bound_compatible_installed_evidence_only_no_source_ownership'
  ) {
    issues.add('visual reference cohort must keep source, pixel, installed, release, and final-evidence ownership separate');
  }

  const settingsNavigation = record(guiContract.settings_navigation);
  const returnToApp = record(settingsNavigation.return_to_app);
  const footerUpdateEntry = record(settingsNavigation.footer_update_entry);
  const themeAndBranding = record(guiContract.theme_and_branding);
  const appearanceMode = record(themeAndBranding.appearance_mode);
  const settingsShellNavigation = record(pageStateMatrix.settings_shell_navigation);
  const settingsShellRequiredDom = record(settingsShellNavigation.required_dom);
  const settingsFooterUpdate = record(settingsShellNavigation.footer_update_entry);
  const settingsAppearanceMode = record(settingsShellNavigation.appearance_mode);
  if (
    returnToApp.label_zh !== '返回应用' ||
    returnToApp.label_en !== 'Back to app' ||
    returnToApp.placement !== 'settings_sider_first_row_above_search' ||
    returnToApp.destination_source !== 'last_valid_non_settings_location' ||
    returnToApp.session_storage_key !== 'aion:last-non-settings-path' ||
    returnToApp.preserve_search_and_hash !== true ||
    returnToApp.settings_destination_forbidden !== true ||
    returnToApp.fallback_path !== '/guid' ||
    returnToApp.keyboard_reachable !== true ||
    returnToApp.expanded_behavior !== 'icon_and_label' ||
    returnToApp.collapsed_behavior !== 'icon_only_with_tooltip_and_accessible_name' ||
    returnToApp.narrow_window_behavior !==
      'existing_titlebar_return_action_uses_same_destination_resolver' ||
    returnToApp.desktop_titlebar_duplicate_forbidden !== true ||
    settingsShellNavigation.product_contract_ref !==
      'contracts/app-gui-product-contract.json#settings_navigation.return_to_app' ||
    !sameStrings(settingsShellRequiredDom.expanded, ['settings-back-to-app', 'settings-search-input']) ||
    !sameStrings(settingsShellRequiredDom.collapsed, ['settings-back-to-app']) ||
    !sameStrings(settingsShellRequiredDom.narrow, ['settings-titlebar-back-to-app']) ||
    !sameStrings(settingsShellNavigation.forbidden_dom, ['settings-titlebar-history-back']) ||
    settingsShellNavigation.destination_behavior !==
      'last_valid_non_settings_location_preserving_search_and_hash_else_guid' ||
    settingsShellNavigation.keyboard_reachable !== true ||
    settingsShellNavigation.same_resolver_for_sider_and_titlebar !== true ||
    settingsShellNavigation.desktop_titlebar_return_forbidden !== true
  ) {
    issues.add('Settings shell must keep one Back to app action above desktop search or in the narrow titlebar without a desktop titlebar duplicate');
  }
  if (
    themeAndBranding.default_theme_id !== 'default-theme' ||
    !sameStrings(themeAndBranding.allowed_theme_ids, ['default-theme']) ||
    appearanceMode.config_key !== 'theme.appearanceMode' ||
    !sameStrings(appearanceMode.allowed_values, ['system', 'light', 'dark']) ||
    appearanceMode.default_value !== 'system' ||
    appearanceMode.settings_placement !== 'preferences_display' ||
    appearanceMode.presentation !== 'three_visual_preview_cards' ||
    appearanceMode.selection_indicator !== 'high_contrast_outline_and_accessible_checked_state' ||
    appearanceMode.system_follows_os !== true ||
    appearanceMode.theme_preset_surface !== 'not_exposed' ||
    appearanceMode.legacy_theme_data_policy !==
      'preserve_user_data_but_migrate_active_preset_to_default_theme' ||
    appearanceMode.legacy_codex_preset_policy !== 'not_selectable_not_applied' ||
    appearanceMode.default_visual_baseline !== 'always_on_pinned_dsh_visual_source_with_app_owned_pixel_baseline_supporting_light_and_dark' ||
    appearanceMode.navigation_rail_quick_toggle !== 'forbidden' ||
    footerUpdateEntry.placement !== 'account_footer_row_trailing_action' ||
    footerUpdateEntry.replaces !== 'navigation_rail_theme_quick_toggle' ||
    footerUpdateEntry.availability_source !== 'single_main_process_updater_state_store' ||
    footerUpdateEntry.webui_fallback_source !==
      'opl app state --profile fast --json#managed_update.components[component_id=opl_app]' ||
    footerUpdateEntry.app_update_state_policy_ref !==
      'contracts/app-gui-product-contract.json#framework_surfaces.managed_update_plane.app_update_state_policy' ||
    footerUpdateEntry.visibility !== 'only_when_newer_version_confirmed_available' ||
    !sameStrings(footerUpdateEntry.hidden_states, [
      'unknown',
      'checking',
      'current',
      'up_to_date',
      'error_without_confirmed_update',
    ]) ||
    footerUpdateEntry.trigger !== 'existing_carrier_updater_update_intent' ||
    footerUpdateEntry.settings_route_fallback !== '/settings/environment?section=updates' ||
    footerUpdateEntry.new_updater_implementation_forbidden !== true ||
    footerUpdateEntry.expanded_behavior !== 'subtle_trailing_icon_only_with_tooltip_and_accessible_name' ||
    footerUpdateEntry.collapsed_behavior !== 'subtle_icon_only_with_tooltip_and_accessible_name' ||
    footerUpdateEntry.keyboard_reachable !== true ||
    footerUpdateEntry.test_id !== 'sider-footer-update' ||
    !sameStrings(settingsFooterUpdate.required_dom_when_update_available, ['sider-footer-update']) ||
    !sameStrings(settingsFooterUpdate.forbidden_dom_when_update_unavailable, ['sider-footer-update']) ||
    !sameStrings(settingsFooterUpdate.forbidden_dom, [
      'sider-footer-theme',
      'sider-footer-update-row',
      'sider-footer-check-updates',
    ]) ||
    settingsFooterUpdate.placement !== 'account_footer_row_trailing_action' ||
    settingsFooterUpdate.availability_source !== 'single_main_process_updater_state_store' ||
    settingsFooterUpdate.webui_fallback_source !==
      'opl app state --profile fast --json#managed_update.components[component_id=opl_app]' ||
    settingsFooterUpdate.app_update_state_policy_ref !==
      'contracts/app-gui-product-contract.json#framework_surfaces.managed_update_plane.app_update_state_policy' ||
    settingsFooterUpdate.visibility_policy !== 'confirmed_newer_version_only' ||
    settingsFooterUpdate.trigger_policy !== 'reuse_existing_carrier_updater_with_update_intent' ||
    settingsFooterUpdate.new_updater_forbidden !== true ||
    !sameStrings(settingsAppearanceMode.required_dom, [
      'appearance-mode-system',
      'appearance-mode-light',
      'appearance-mode-dark',
    ]) ||
    !sameStrings(settingsAppearanceMode.allowed_values, ['system', 'light', 'dark']) ||
    settingsAppearanceMode.presentation !== 'three_visual_preview_cards' ||
    settingsAppearanceMode.theme_preset_surface !== 'not_exposed' ||
    settingsAppearanceMode.legacy_active_preset_migration !== 'default-theme'
  ) {
    issues.add(
      'Settings appearance must use a single governed baseline with three-state appearance while the account row conditionally reuses the existing App updater',
    );
  }

  const acceptanceBoundary = record(interactionBaseline.acceptance_boundary);
  const historicalPixelShellSha =
    typeof acceptanceBoundary.historical_pixel_shell_sha === 'string'
      ? acceptanceBoundary.historical_pixel_shell_sha
      : '';
  const shellSource = record(shellAdapter.shell_source);
  const guiConformanceRef = String(shellSource.upstream_ref ?? '');
  if (
    acceptanceBoundary.human_target_owner !== 'one-person-lab-app' ||
    acceptanceBoundary.active_shell !== 'aionui' ||
    acceptanceBoundary.active_shell_role !== 'current_implementation_conformance_only' ||
    acceptanceBoundary.docs_or_contract_imply_source_complete !== false ||
    acceptanceBoundary.docs_or_contract_imply_pixel_complete !== false ||
    acceptanceBoundary.docs_or_contract_imply_release_ready !== false ||
    acceptanceBoundary.authority_status !== 'active_mainline_authority' ||
    acceptanceBoundary.shell_implementation_status !== 'current_source_and_historical_pixels_separately_bound' ||
    acceptanceBoundary.source_evidence_status !== 'active_shell_checkout_contains_verified_gui_ancestor' ||
    acceptanceBoundary.pixel_evidence_status !==
      'historical_packaged_route_visual_matrix_verified_current_pixels_unverified' ||
    acceptanceBoundary.release_evidence_status !==
      'historical_local_packaged_visual_evidence_complete_release_not_claimed' ||
    acceptanceBoundary.current_source_head_source !== 'active_shell_checkout_git_head' ||
    acceptanceBoundary.current_source_head_must_contain_verified_gui_ancestor !== true ||
    acceptanceBoundary.current_source_evidence_ref !== 'contracts/app-shell-adapter.json#shell_source' ||
    !/^[0-9a-f]{40}$/.test(historicalPixelShellSha) ||
    acceptanceBoundary.historical_pixel_shell_sha_binding_status !== 'bound_to_exact_historical_evidence' ||
    acceptanceBoundary.pixel_evidence_ref !== 'docs/product/gui/evidence/aionui-41301/manifest.json' ||
    acceptanceBoundary.pixel_evidence_entry_count !== 8 ||
    acceptanceBoundary.historical_pixel_shell_sha_must_not_be_inferred_as_current_source_head !== true
  ) {
    issues.add('interaction baseline must keep the human target separate from source, pixel, and release completion');
  }
  if (
    !/^[0-9a-f]{40}$/.test(guiConformanceRef) ||
    shellSource.upstream_ref_role !== 'minimum_verified_gui_conformance_ancestor' ||
    shellSource.current_head_source !== 'active_shell_checkout_git_head' ||
    shellSource.current_head_must_contain_upstream_ref !== true
  ) {
    issues.add('active shell adapter must bind a verified GUI ancestor separately from the current shell Git head');
  }
  if (/^[0-9a-f]{40}$/.test(guiConformanceRef)) {
    validateActiveShellCheckout(root, shellSource, guiConformanceRef, issues);
  }
  const visualEvidenceEntries = validateVisualEvidence(root, historicalPixelShellSha, issues);

  const literalObservation = record(interactionBaseline.literal_observation);
  const featurePreservation = record(interactionBaseline.feature_preservation_policy);
  const relocationGate = record(featurePreservation.relocation_gate);
  const runtimeSurfaceRoles = record(featurePreservation.runtime_surface_roles);
  const runtimePreservationGate = record(featurePreservation.runtime_preservation_gate);
  const oplTargetTranslation = [
    'navigation_rail',
    'conversation_scope',
    'thread_coordination',
    'home',
    'capability_selection',
    'composer',
    'permission_access_mode',
    'current_task_summary_bar',
    'artifact_preview',
    'context_surfaces',
    'settings_shell',
    'visual_target',
  ];
  if (
    literalObservation.boundary !== 'only_directly_observed_codex_composition_and_interaction_patterns' ||
    !sameStrings(literalObservation.observed_patterns, [
      'conversation_navigation_rail',
      'single_chat_canvas',
      'conversation_header_controls',
      'bottom_composer',
      'on_demand_secondary_surfaces',
      'quiet_dense_visual_hierarchy',
    ]) ||
    !sameStrings(literalObservation.must_not_claim_as_codex_observation, [
      'opl_capability_entries',
      'opl_archived_capabilities_settings_rail_placement',
      'opl_side_panel_tool_taxonomy',
      'opl_runtime_action_receipt_authority',
      'opl_runtime_cross_project_navigation',
      'opl_settings_information_architecture',
    ]) ||
    !sameStrings(interactionBaseline.opl_target_translation, oplTargetTranslation)
  ) {
    issues.add('interaction baseline must separate literal Codex observations from OPL-owned target translation');
  }

  if (
    featurePreservation.authority !== 'opl_product_capability_over_external_reference_parity' ||
    featurePreservation.external_reference_role !== 'placement_and_interaction_reference_only' ||
    !sameStrings(featurePreservation.protected_surfaces, [
      'agent_capabilities',
      'first_run',
      'opl_settings',
      'domain_package_entries',
      'bilingual_ui',
      'runtime_navigation',
    ]) ||
    relocationGate.replacement_reachable_in_same_change !== true ||
    relocationGate.contract_source_tests_updated_together !== true ||
    relocationGate.removal_before_replacement_forbidden !== true ||
    runtimeSurfaceRoles.navigation_runtime !== 'active_aionui_primary_navigation' ||
    runtimeSurfaceRoles.navigation_runtime_default_visible !== true ||
    runtimeSurfaceRoles.context_runtime !== 'selected_conversation_or_task_details' ||
    runtimeSurfaceRoles.context_runtime_independent_of_navigation_runtime !== true ||
    runtimePreservationGate.product_contract_ref !==
      'contracts/app-gui-product-contract.json#pages.runtime_status.runtime_cockpit_product_contract' ||
    runtimePreservationGate.page_state_ref !==
      'contracts/app-page-state-matrix.json#pages[id=runtime].runtime_view_model.runtime_cockpit_acceptance' ||
    runtimePreservationGate.route_classification !== 'core_dynamic_agent_runtime' ||
    runtimePreservationGate.default_product_requirement !== true ||
    runtimePreservationGate.default_release_gate !== true ||
    runtimePreservationGate.adopted_shell_requirement !== true ||
    runtimePreservationGate.active_aionui_navigation_requirement !== true ||
    runtimePreservationGate.active_aionui_navigation_may_remove_or_weaken !== false ||
    runtimePreservationGate.explicit_validation_command !== 'npm run validate:runtime-route' ||
    !sameStrings(runtimePreservationGate.route_change_requirements, [
      'product_contract',
      'page_state_acceptance',
      'explicit_route_validator',
      'route_tests',
    ])
  ) {
    issues.add('historical interaction alignment must preserve OPL-owned capabilities and same-change reachability');
  }

  const navigationRail = record(interactionBaseline.navigation_rail);
  const railWidth = record(navigationRail.resizable_width_px);
  const desktopAffordancePolicy = record(navigationRail.desktop_affordance_policy);
  const threadDirectoryPolicy = record(navigationRail.thread_directory_policy);
  const historySearch = record(threadDirectoryPolicy.history_search);
  if (
    navigationRail.wide_desktop_default !== 'expanded' ||
    navigationRail.narrow_window_mode !== 'drawer' ||
    railWidth.min !== 280 ||
    railWidth.max !== 340 ||
    navigationRail.top_entries_scope !== 'active_aionui_current_product' ||
    !sameStrings(navigationRail.top_entries, ['new_task', 'runtime', 'scheduled_tasks', 'archived']) ||
    !sameStrings(navigationRail.conditional_entries, []) ||
    navigationRail.runtime_entry_role !==
      'active_aionui_primary_navigation_and_default_release_requirement_while_native_phase_one_candidate_parity_may_omit_runtime' ||
    JSON.stringify(navigationRail.runtime_entry) !==
      JSON.stringify(appOwnedActiveAionuiPrimaryNavigation.runtime_entry) ||
    navigationRail.capabilities_mapping !==
      'capability_selection_lives_in_new_task_home_and_capability_management_lives_in_settings_without_a_duplicate_primary_navigation_page' ||
    navigationRail.legacy_capabilities_route !==
      '/capabilities redirects to /guid without deleting capability data or Settings management' ||
    !sameStrings(navigationRail.forbidden_entries_without_opl_product_capability, ['sites', 'chat']) ||
    !sameStrings(navigationRail.bottom_entries, ['account', 'help', 'settings']) ||
    !sameStrings(navigationRail.desktop_affordances, ['back', 'forward', 'previous_task', 'next_task', 'new_window']) ||
    !sameStrings(desktopAffordancePolicy.surfaces, ['application_menu', 'conversation_header']) ||
    desktopAffordancePolicy.keyboard_access_required !== true ||
    desktopAffordancePolicy.unavailable_command_state !== 'disabled' ||
    desktopAffordancePolicy.previous_next_scope !== 'visible_ordinary_conversations' ||
    desktopAffordancePolicy.new_window_scope !== 'desktop_only' ||
    desktopAffordancePolicy.webui_information_architecture_expansion_allowed !== false ||
    threadDirectoryPolicy.canonical_authority !== 'codex_app_server_thread_list_read_resume' ||
    !sameStrings(threadDirectoryPolicy.protocols, [
      'thread/list',
      'thread/read',
      'thread/resume',
      'thread/name/set',
      'thread/archive',
      'thread/unarchive',
      'thread/delete',
    ]) ||
    JSON.stringify(threadDirectoryPolicy.task_action_protocols) !==
      JSON.stringify({
        rename: 'thread/name/set',
        archive: 'thread/archive',
        restore: 'thread/unarchive',
        delete: 'thread/delete',
      }) ||
    threadDirectoryPolicy.pin_role !== 'shell_ui_metadata_only' ||
    threadDirectoryPolicy.local_reset_role !==
      'retain_existing_aionui_conversation_semantics_not_app_server_history_reset' ||
    threadDirectoryPolicy.shell_local_storage_role !== 'drafts_preferences_and_rebuildable_cache_only' ||
    threadDirectoryPolicy.shell_thread_history_authority !== false ||
    threadDirectoryPolicy.codex_session_directory_authority !==
      'canonical_app_server_thread_overview_when_available' ||
    threadDirectoryPolicy.canonical_overview_unavailable_policy !==
      'fallback_to_shell_cache_without_reclassifying_cache_as_authority' ||
    threadDirectoryPolicy.stale_codex_acp_cache_row_policy !==
      'exclude_from_ordinary_projection_when_absent_from_available_canonical_overview' ||
    threadDirectoryPolicy.non_codex_local_row_policy !== 'preserve' ||
    threadDirectoryPolicy.workspace_directory_role !==
      'new_session_initial_cwd_projectless_adoption_grouping_and_visible_metadata_only' ||
    threadDirectoryPolicy.row_identity !== 'canonical_thread_id' ||
    threadDirectoryPolicy.duplicate_row_per_canonical_thread_allowed !== false ||
    threadDirectoryPolicy.title_based_deduplication_allowed !== false ||
    threadDirectoryPolicy.e2e_fixture_storage_policy !== 'isolated_storage_root_never_production_user_data' ||
    JSON.stringify(threadDirectoryPolicy.directory_group_policy) !== JSON.stringify(appOwnedDirectoryGroupPolicy) ||
    historySearch.placement !== 'conversation_history_heading_trailing_icon' ||
    historySearch.presentation !== 'icon_only' ||
    historySearch.accessible_name_required !== true ||
    historySearch.expanded_full_width_row_allowed !== false
  ) {
    issues.add('interaction baseline navigation rail must preserve the governed desktop and narrow-window skeleton');
  }

  const conversationScope = record(interactionBaseline.conversation_scope);
  const threadCoordination = record(interactionBaseline.thread_coordination);
  const homeTarget = record(interactionBaseline.home);
  const capabilitySelection = record(interactionBaseline.capability_selection);
  const composerTarget = record(interactionBaseline.composer);
  const explicitSessionInputPolicy = record(conversationScope.explicit_session_input_policy);
  const sessionWorkspaceModel = record(conversationScope.session_workspace_model);
  const permissionTarget = record(interactionBaseline.permission_access_mode);
  const taskSummaryTarget = record(interactionBaseline.current_task_summary_bar);
  const mobileActionSheet = record(composerTarget.mobile_action_sheet);
  const unifiedContextMenu = record(record(guiContract.ordinary_conversation).unified_context_menu);
  const sendFailureInputPolicy = record(record(guiContract.ordinary_conversation).send_failure_input_policy);
  if (JSON.stringify(sessionWorkspaceModel) !== JSON.stringify(appOwnedSessionWorkspaceModel)) {
    issues.add(
      'conversation scope must keep canonical session identity, allow one projectless adoption, and forbid bound-session reassignment',
    );
  }
  if (JSON.stringify(sendFailureInputPolicy) !== JSON.stringify(appOwnedSendFailureInputPolicy)) {
    issues.add(
      'ordinary conversation send failures must restore prompt and attachments without overwriting post-submit input',
    );
  }
  if (
    conversationScope.workspace_initialized_session_supported !== true ||
    conversationScope.projectless_conversation_supported !== true ||
    conversationScope.text_chat_without_workspace !== 'available' ||
    conversationScope.explicit_session_inputs_without_workspace !== 'available_subject_to_codex_permissions' ||
    conversationScope.workspace_directory_role !==
      'new_session_initial_cwd_projectless_adoption_sidebar_grouping_and_visible_metadata_only_not_owner_or_authorization_domain' ||
    JSON.stringify(explicitSessionInputPolicy) !== JSON.stringify(appOwnedExplicitSessionInputPolicy) ||
    'local_worktree_lifecycle' in conversationScope ||
    'project_context_inputs' in conversationScope ||
    'projectless_input_policy' in conversationScope ||
    !sameStrings(conversationScope.conversation_management, [
      'search',
      'pin',
      'rename',
      'archive',
      'restore',
      'delete',
      'reset',
    ]) ||
    conversationScope.archived_surface !== 'independent' ||
    homeTarget.title_policy !== 'modest_dynamic_prompt_in_composer_reading_lane' ||
    homeTarget.starter_limit !== null ||
    homeTarget.starter_visibility_policy !==
      'opl_standard_agent_membership_with_selectable_readiness_real_codex_route_and_default_or_user_visible_shortcuts' ||
    homeTarget.starter_order_policy !==
      'home_shortcut_preferences_sort_order_then_localized_display_name' ||
    homeTarget.shortcut_membership_source_ref !==
      'app_state.agent_packages.directory.entries' ||
    JSON.stringify(homeTarget.opl_standard_agent_membership_policy) !==
      JSON.stringify(appOwnedOplStandardAgentMembershipPolicy) ||
    homeTarget.shortcut_preference_source_ref !==
      'app_state.agent_packages.status_index.home_shortcut_preferences[]' ||
    homeTarget.unknown_standard_agent_policy !==
      'render_unknown_package_ids_only_when_they_match_opl_standard_agent_membership_without_app_allowlist' ||
    homeTarget.default_visible_shortcut_ids !== undefined ||
    homeTarget.starter_layout_policy !== 'compact_inline_wrap' ||
    record(homeTarget.visual_structure).starter_region !==
      'composer_reading_lane_immediately_above_input_not_page_navigation' ||
    record(homeTarget.visual_structure).starter_item_width !== 'content_sized' ||
    record(homeTarget.visual_structure).starter_count_layout !==
      'center_actual_visible_count_and_wrap_without_navigation_chevrons' ||
    record(homeTarget.visual_structure).composer !== 'bottom_reading_lane_with_safe_inset' ||
    record(homeTarget.visual_structure).desktop_composer_max_width_px !== 736 ||
    record(homeTarget.visual_structure).desktop_composer_min_height_px !== 98 ||
    record(homeTarget.visual_structure).desktop_composer_corner_radius_px !== 22 ||
    record(homeTarget.visual_structure).desktop_context_bar_height_px !== 52 ||
    record(homeTarget.visual_structure).desktop_context_bar_overlap_px !== 13 ||
    record(homeTarget.visual_structure).desktop_context_bar_horizontal_inset_px !== 12 ||
    record(homeTarget.visual_structure).single_centered_reading_lane_for_prompt_starters_and_composer !== true ||
    homeTarget.starter_truncation_allowed !== false ||
    record(homeTarget.workspace_selector_policy).primary_scope !== 'active_workspace_only' ||
    record(homeTarget.workspace_selector_policy).inactive_recent_directories_visible !== false ||
    record(homeTarget.workspace_selector_policy).management_entry !== 'registered_directories_modal' ||
    record(homeTarget.workspace_selector_policy).management_scope !== 'registered_workspaces' ||
    record(homeTarget.workspace_selector_policy).selection_effect !== 'set_new_session_initial_cwd_only' ||
    record(homeTarget.workspace_selector_policy).unregister_effect !== 'remove_registration_only' ||
    record(homeTarget.workspace_selector_policy).filesystem_delete_allowed !== false ||
    record(homeTarget.workspace_selector_policy).active_conversation_change_on_unregister !== false ||
    record(homeTarget.workspace_selector_policy).session_ownership_effect !== 'none' ||
    record(homeTarget.workspace_selector_policy).cascade_session_delete_allowed !== false ||
    record(homeTarget.home_shortcut_mutation_policy).pending_scope !== 'single_shortcut' ||
    record(homeTarget.home_shortcut_mutation_policy).pending_key !== 'shortcut_id' ||
    record(homeTarget.home_shortcut_mutation_policy).other_shortcuts_remain_interactive !== true ||
    record(homeTarget.home_shortcut_mutation_policy).readback_mode !== 'background_no_page_loading' ||
    !sameStrings(capabilitySelection.selection_surfaces, [
      'home_starter',
      'home_new_session_capability_palette',
      'home_new_session_at_mention_agent_selector',
    ]) ||
    capabilitySelection.primary_selection_surface !== 'home_starter' ||
    capabilitySelection.palette_selection_scope !== 'new_session_before_first_send_only' ||
    capabilitySelection.selection_equivalence_policy !==
      'same_active_capability_identity_and_send_time_readiness_gate' ||
    capabilitySelection.selection_cancellation_policy !==
      'return_to_no_active_capability_without_changing_executor_workspace_or_draft' ||
    capabilitySelection.starter_palette_selection_sync !==
      'one_active_capability_state_bidirectionally_reflected' ||
    capabilitySelection.management_surface !== 'settings_agents' ||
    capabilitySelection.legacy_route_policy !== '/capabilities_redirects_to_home_without_mounting_a_selection_page' ||
    capabilitySelection.composer_persistent_variable_selector !== false ||
    capabilitySelection.composer_context_surface !== 'active_capability_chip' ||
    capabilitySelection.contextual_change_scope !== 'new_session_before_first_send_only' ||
    capabilitySelection.agent_reference_admission_policy_ref !==
      'ordinary_capability_selector_policy.agent_reference_admission_policy' ||
    composerTarget.placement !== 'floating_bottom_with_safe_inset' ||
    !sameStrings(composerTarget.persistent_context, ['active_capability']) ||
    !sameStrings(composerTarget.send_scoped_inputs, ['attachments']) ||
    composerTarget.send_scoped_consumption_policy !== 'consumed_by_current_send_not_persisted_in_context_strip' ||
    !sameStrings(composerTarget.forbidden_persistent_context, [
      'project',
      'workspace',
      'locality',
      'branch',
      'attachments',
      'workspace_context_refs',
    ]) ||
    !sameStrings(composerTarget.desktop_action_row, [
      'unified_context_menu',
      'permission_access_mode',
      'model_reasoning',
      'send_stop',
    ]) ||
    !sameStrings(mobileActionSheet.allowed_actions, [
      'unified_context_menu',
      'permission_access_mode',
      'model_reasoning',
      'active_capability',
    ]) ||
    !sameStrings(mobileActionSheet.forbidden_actions, ['backend', 'provider', 'team', 'raw_mcp', 'arbitrary_skills']) ||
    mobileActionSheet.send_stop_location !== 'composer_primary_action_outside_sheet' ||
    composerTarget.unified_context_menu_ref !== 'ordinary_conversation.unified_context_menu' ||
    JSON.stringify(unifiedContextMenu) !== JSON.stringify(appOwnedUnifiedContextMenu) ||
    record(guiContract.ordinary_conversation).composer_placeholder_policy !==
      'opl_owned_localized_task_prompt_without_backend_name_interpolation' ||
    composerTarget.model_reasoning_control !== 'single_compact_menu' ||
    !sameStrings(permissionTarget.visible_on, ['home_composer', 'conversation_composer']) ||
    permissionTarget.provider_or_backend_terms_visible !== false ||
    taskSummaryTarget.placement !== 'message_timeline' ||
    taskSummaryTarget.single_instance !== true ||
    taskSummaryTarget.default_mode !== 'inline_unpinned' ||
    !sameStrings(taskSummaryTarget.sticky_when, ['user_pinned', 'long_running_true']) ||
    taskSummaryTarget.ordinary_task_sticky !== false ||
    taskSummaryTarget.long_running_signal_field !== 'long_running' ||
    taskSummaryTarget.duplicate_surface_allowed !== false ||
    !sameStrings(taskSummaryTarget.fields, ['status', 'elapsed', 'progress', 'next_action', 'stop'])
  ) {
    issues.add('interaction baseline Home, conversation, composer, Agents management, and task summary markers must match the App target');
  }

  const pageStates = Array.isArray(pageStateMatrix.pages) ? pageStateMatrix.pages.map(record) : [];
  const guidHomePage = pageStates.find((page) => page.id === 'guid_home') ?? {};
  const guidHomeViewModel = record(record(guidHomePage).home_view_model);
  const ordinaryConversationPage = pageStates.find((page) => page.id === 'ordinary_conversation') ?? {};
  const ordinaryConversationPaletteViewModel = record(record(ordinaryConversationPage).conversation_view_model);
  if (
    JSON.stringify(record(ordinaryConversationPaletteViewModel.unified_context_menu)) !==
    JSON.stringify(appOwnedUnifiedContextMenu)
  ) {
    issues.add('page-state ordinary conversation must carry the exact App-owned capability palette contract');
  }
  const subagentPolicyJson = JSON.stringify(appOwnedCodexSubagentActivityPolicy);
  if (
    JSON.stringify(record(record(profile.gui).ordinary_conversation).codex_subagent_activity) !== subagentPolicyJson ||
    JSON.stringify(record(guiContract.ordinary_conversation).codex_subagent_activity) !== subagentPolicyJson ||
    JSON.stringify(record(record(ordinaryConversationPage).conversation_view_model).codex_subagent_activity) !==
      subagentPolicyJson
  ) {
    issues.add('Codex subagent activity must stay a read-only single-adapter projection without private orchestration');
  }
  if ('new_task_locality' in guidHomeViewModel || 'local_worktree_lifecycle_ref' in guidHomeViewModel) {
    issues.add('Guid Home must keep workspace selection limited to the new task initial cwd');
  }
  if (
    !stringArray(record(guidHomePage).must_show).includes(
      'history search as one accessible icon at the trailing edge of the conversation-history heading',
    ) ||
    !stringArray(record(guidHomePage).must_not_show).includes(
      'standalone full-width conversation-history search row',
    )
  ) {
    issues.add('Guid Home rail must place one accessible icon-only search action in the conversation-history heading');
  }
  const requiredThreadProtocols = [
    'thread/list',
    'thread/read',
    'thread/start',
    'thread/resume',
    'thread/fork',
    'thread/archive',
  ];
  const forbiddenThreadKeys = [
    'model_tool_access_evidence_boundary',
    'same_agent_tree_transport',
    'dispatch_policy',
    'delivery_request_defaults',
    'turn_start_inheritance_policy',
    'interactive_server_request_policy',
    'idempotency_policy',
    'cross_host_policy',
    'audit_fields',
  ];
  const channelThreadBinding = record(threadCoordination.channel_thread_binding);
  if (
    threadCoordination.product_role !== 'user_initiated_codex_app_server_thread_operations' ||
    threadCoordination.adapter !== 'single_codex_app_server_adapter' ||
    threadCoordination.entry_surface !== 'existing_thread_directory_and_user_actions' ||
    threadCoordination.ordinary_navigation_visible !== false ||
    threadCoordination.model_tool_access !== false ||
    threadCoordination.user_initiated_only !== true ||
    threadCoordination.protocol_owner !== 'codex_core_app_server' ||
    threadCoordination.thread_store_owner !== 'codex_core_app_server' ||
    threadCoordination.thread_turn_authority !== 'codex_core_app_server' ||
    !requiredThreadProtocols.every((protocol) => stringArray(threadCoordination.supported_protocols).includes(protocol)) ||
    threadCoordination.state_authority !== 'codex_app_server' ||
    threadCoordination.plain_conversation_policy !== 'existing_aionui_acp_unchanged' ||
    !sameStrings(threadCoordination.forbidden_private_layers, [
      'second_json_rpc_client',
      'jsonl_coordination_audit_store',
      'coordination_idempotency_or_replay_ledger',
      'write_set_advisory_control_plane',
      'model_delivery_or_dynamic_thread_tools',
      'pending_server_request_control_plane',
      'independent_coordination_page',
      'cross_host_task_handoff',
    ]) ||
    JSON.stringify(Object.keys(channelThreadBinding).sort()) !== JSON.stringify([
      'binding_key_fields',
      'binding_key_normalization_or_inference_allowed',
      'binding_value_fields',
      'initial_binding_transport',
      'mismatch_policy',
      'restart_recovery_transport',
      'second_session_truth_allowed',
      'shell_persistence_role',
      'shell_thread_id_inference_allowed',
      'source_ref',
      'thread_turn_authority',
      'unknown_binding_policy',
    ]) ||
    !sameStrings(channelThreadBinding.binding_key_fields, [
      'provider_id',
      'account_id',
      'channel_session_id',
    ]) ||
    !sameStrings(channelThreadBinding.binding_value_fields, [
      'canonical_thread_host',
      'canonical_thread_id',
    ]) ||
    channelThreadBinding.source_ref !==
      'contracts/app-runtime-bridge.json#canonical_conversation_continuity_policy.transport_binding_projection' ||
    channelThreadBinding.initial_binding_transport !==
      'thread_start_then_exact_thread_read_then_persist_binding' ||
    channelThreadBinding.restart_recovery_transport !==
      'exact_binding_lookup_then_thread_read_then_thread_resume_same_threadId' ||
    channelThreadBinding.thread_turn_authority !== 'codex_core_app_server' ||
    channelThreadBinding.shell_persistence_role !==
      'exact_binding_only_not_thread_history_turn_state_or_session_truth' ||
    channelThreadBinding.unknown_binding_policy !==
      'fail_closed_without_thread_start_or_thread_id_inference_during_recovery' ||
    channelThreadBinding.mismatch_policy !==
      'fail_closed_without_rebind_merge_overwrite_or_turn_start' ||
    channelThreadBinding.binding_key_normalization_or_inference_allowed !== false ||
    channelThreadBinding.shell_thread_id_inference_allowed !== false ||
    channelThreadBinding.second_session_truth_allowed !== false ||
    forbiddenThreadKeys.some((key) => key in threadCoordination) ||
    pageStates.some((page) => page.id === 'thread_coordination')
  ) {
    issues.add('thread operations must use one user-initiated Codex App Server adapter without a private coordination control plane');
  }

  const contextSurfaces = record(interactionBaseline.context_surfaces);
  const artifactPreview = record(interactionBaseline.artifact_preview);
  const ordinaryConversationViewModel = record(record(ordinaryConversationPage).conversation_view_model);
  const pageArtifactPreview = record(ordinaryConversationViewModel.artifact_preview);
  const conversationArtifactPreview = record(record(guiContract.ordinary_conversation).artifact_preview);
  const environmentPopover = record(contextSurfaces.environment_popover);
  const sidePanel = record(contextSurfaces.side_panel);
  const reviewPane = record(contextSurfaces.review_pane);
  const reviewCapabilityStatus = record(reviewPane.source_capability_status);
  const rightContextInspectorPage = pageStates.find((page) => page.id === 'right_context_inspector') ?? {};
  const pageReviewPane = record(record(record(rightContextInspectorPage).inspector_view_model).review_surface);
  const settingsShell = record(interactionBaseline.settings_shell);
  const visualTarget = record(interactionBaseline.visual_target);
  const lightSurfaces = record(visualTarget.light_surfaces);
  const darkSurfaces = record(visualTarget.dark_surfaces);
  const accessibility = record(visualTarget.accessibility);
  const visualTypography = record(visualTarget.typography);
  const conversationRendering = record(visualTarget.conversation_rendering);
  const targetDefinitionRole = 'opl_target_translation_not_literal_codex_observation';
  if (
    oplTargetTranslation
      .filter((key) => key !== 'visual_target')
      .some((key) => record(interactionBaseline[key]).definition_role !== targetDefinitionRole) ||
    visualTarget.definition_role !== 'opl_projection_of_pinned_deepseek_harness_visual_source'
  ) {
    issues.add('OPL interaction targets must remain separate from Codex observations and bind visual_target to the pinned DSH source');
  }
  if (
    'environment_workspace_handoff' in ordinaryConversationViewModel ||
    'environment_workspace_handoff' in record(guiContract.ordinary_conversation)
  ) {
    issues.add('ordinary conversation Environment must remain read-only without workspace handoff state');
  }
  if (
    artifactPreview.surface !== 'existing_aionui_preview_context_and_panel' ||
    !sameStrings(artifactPreview.entry_sources, [
      'session_attachment_ref',
      'conversation_result_ref',
      'explicit_absolute_local_path',
    ]) ||
    !sameStrings(artifactPreview.supported_content_types, ['markdown', 'pdf', 'code', 'image', 'html', 'diff']) ||
    !sameStrings(artifactPreview.markdown_embedded_renderers, ['mermaid', 'katex', 'code']) ||
    artifactPreview.ref_resolution_policy !==
      'explicit_session_attachment_or_conversation_result_ref_or_user_selected_legal_absolute_local_path_without_copying_artifact_body' ||
    JSON.stringify(artifactPreview.session_reference_policy) !== JSON.stringify({
      attachment_ref_scope: 'current_session_explicit_attachment_only',
      conversation_result_ref_scope: 'current_session_visible_result_only',
      workspace_membership_required: false,
      implicit_workspace_ref_allowed: false,
    }) ||
    record(artifactPreview.explicit_local_path_policy).user_initiated_only !== true ||
    record(artifactPreview.explicit_local_path_policy).path_form !== 'legal_absolute_local_file_path' ||
    record(artifactPreview.explicit_local_path_policy).workspace_membership_required !== false ||
    record(artifactPreview.explicit_local_path_policy).access_authority !== 'codex_permission_approval_and_sandbox' ||
    record(artifactPreview.explicit_local_path_policy).automatic_silent_read_allowed !== false ||
    'project_context_ref_policy' in artifactPreview ||
    !sameStrings(artifactPreview.forbidden_inputs, [
      'relative_parent_traversal',
      'illegal_or_unsupported_scheme',
      'automatic_silent_read',
      'implicit_workspace_context_ref',
    ]) ||
    artifactPreview.artifact_body_authority !== 'external_owner_ref_only' ||
    artifactPreview.keyboard_reachable_open_action !== true ||
    artifactPreview.failure_policy !== 'keep_ref_visible_and_fail_closed_with_reason' ||
    artifactPreview.unsafe_or_unsupported_ref_policy !== 'do_not_open_or_guess_content' ||
    JSON.stringify(pageArtifactPreview) !== JSON.stringify({
      surface: artifactPreview.surface,
      entry_sources: artifactPreview.entry_sources,
      supported_content_types: artifactPreview.supported_content_types,
      markdown_embedded_renderers: artifactPreview.markdown_embedded_renderers,
      ref_resolution_policy: artifactPreview.ref_resolution_policy,
      session_reference_policy: artifactPreview.session_reference_policy,
      explicit_local_path_policy: artifactPreview.explicit_local_path_policy,
      forbidden_inputs: artifactPreview.forbidden_inputs,
      artifact_body_authority: artifactPreview.artifact_body_authority,
      keyboard_reachable_open_action: artifactPreview.keyboard_reachable_open_action,
      failure_policy: artifactPreview.failure_policy,
      unsafe_or_unsupported_ref_policy: artifactPreview.unsafe_or_unsupported_ref_policy,
    }) ||
    JSON.stringify(conversationArtifactPreview) !== JSON.stringify(pageArtifactPreview)
  ) {
    issues.add('artifact preview must reuse the existing Preview surface through a ref-only fail-closed adapter');
  }
  if (
    !sameStrings(environmentPopover.primary_fields, ['workspace', 'locality', 'branch', 'changes', 'subtasks', 'sources']) ||
    !sameStrings(environmentPopover.secondary_ref_fields, ['artifact_refs', 'evidence_refs', 'receipt_refs']) ||
    environmentPopover.render_policy !== 'real_non_empty_values_only' ||
    sidePanel.default_state !== 'closed' ||
    sidePanel.default_third_column_visible !== false ||
    sidePanel.workspace_surface !== 'files_changes' ||
    sidePanel.preview_surface !== 'independent' ||
    sidePanel.terminal_browser_entry_policy !== 'environment_or_task_need_only' ||
    sidePanel.equal_weight_tool_taxonomy_allowed !== false ||
    sidePanel.runtime_duplicate_allowed !== false ||
    reviewPane.host_surface !== 'existing_files_changes_diff_surface' ||
    reviewPane.default_state !== 'closed' ||
    reviewPane.opens_on_user_request !== true ||
    !sameStrings(reviewPane.review_targets, ['uncommitted', 'base_branch', 'commit', 'custom']) ||
    !sameStrings(reviewPane.delivery_modes, ['inline', 'detached']) ||
    reviewPane.default_section !== 'unstaged' ||
    !sameStrings(reviewPane.sections, ['unstaged', 'staged', 'commit', 'branch', 'last_turn']) ||
    !sameStrings(reviewPane.capabilities, [
      'pull_request_context',
      'inline_comments',
      'stage',
      'commit',
      'push',
    ]) ||
    reviewPane.source_status !==
      'partial_last_turn_and_custom_target_instructions_implemented_review_focus_and_inline_comments_protocol_blocked' ||
    reviewCapabilityStatus.last_turn !== 'source_implemented_existing_message_store' ||
    reviewCapabilityStatus.review_focus_context !==
      'source_blocked_missing_public_review_focus_protocol' ||
    reviewCapabilityStatus.inline_comments !== 'source_blocked_missing_typed_codex_protocol' ||
    reviewPane.last_turn_source_policy !==
      'latest_visible_user_message_then_completed_workspace_edit_tool_calls' ||
    reviewPane.review_focus_delivery_policy !==
      'custom_target_instructions_via_review_start_target_custom_only_non_custom_focus_not_exposed' ||
    reviewPane.review_focus_failure_policy !==
      'non_custom_focus_protocol_unavailable_before_review_start_without_turn_steer_fallback_fake_success_audit_or_side_effects' ||
    reviewPane.inline_comment_protocol_requirement !==
      'typed_codex_app_server_file_line_comment_request_location_and_failure_semantics' ||
    !sameStrings(reviewPane.inline_comment_forbidden_fallbacks, ['shell_local_annotation_store', 'fake_success']) ||
    reviewPane.pull_request_context_dependency !== 'gh' ||
    reviewPane.pull_request_context_unavailable_policy !== 'show_explicit_unavailable_state' ||
    reviewPane.git_authority !== 'existing_codex_git_integration' ||
    reviewPane.shell_role !== 'thin_adapter_only' ||
    reviewPane.duplicate_git_store_allowed !== false ||
    reviewPane.legacy_equal_weight_review_tab_allowed !== false ||
    JSON.stringify(pageReviewPane) !== JSON.stringify(reviewPane) ||
    'primary_tools' in sidePanel ||
    'secondary_sections' in sidePanel ||
    !sameStrings(sidePanel.legacy_taxonomy_ids_forbidden, [
      'review',
      'terminal',
      'browser',
      'files',
      'artifacts',
      'runtime',
      'actions',
      'memory',
    ]) ||
    !sameStrings(contextSurfaces.advanced_work_surfaces, ['files_changes', 'preview', 'terminal', 'browser']) ||
    contextSurfaces.advanced_work_surfaces_default !== 'closed' ||
    settingsShell.frame !== 'codex_full_window_return_search_grouped_rows' ||
    settingsShell.information_architecture !== 'existing_opl_settings_ia_unchanged' ||
    settingsShell.role !== 'maintenance_only' ||
    settingsShell.home_or_conversation_structure_authority !== false ||
    settingsShell.settings_objects_or_model_policy_changed_by_41301 !== false ||
    settingsShell.installer_or_runtime_truth_authority !== false ||
    visualTarget.machine_authority !== 'this_object_only_shell_and_human_docs_are_derived' ||
    visualTarget.source_cohort_ref !== visualSourceCohortPath ||
    visualTarget.theme_selector !== 'body[data-ds-dark-theme]' ||
    visualTarget.main_canvas !== 'var(--dsw-alias-bg-base)' ||
    JSON.stringify(lightSurfaces) !==
      JSON.stringify({
        main_canvas: 'var(--dsw-alias-bg-base)',
        navigation_rail: 'var(--dsw-specific-sidebar-fill)',
        bounded_surface: 'var(--dsw-alias-bg-layer-1)',
        hover_row: 'var(--dsw-alias-interactive-bg-hover)',
        selected_row: 'var(--dsw-specific-sidebar-nav-item-active)',
        text_primary: 'var(--dsw-alias-label-primary)',
        text_secondary: 'var(--dsw-alias-label-secondary)',
        text_muted: 'var(--dsw-alias-label-secondary)',
        hairline_border: 'var(--dsw-alias-border-l2)',
        focus_ring: 'var(--dsw-alias-state-business-primary)',
        composer_shadow: 'var(--dsw-shadow-lv2)',
      }) ||
    JSON.stringify(darkSurfaces) !==
      JSON.stringify({
        main_canvas: 'var(--dsw-alias-bg-base)',
        navigation_rail: 'var(--dsw-specific-sidebar-fill)',
        bounded_surface: 'var(--dsw-alias-bg-layer-1)',
        hover_row: 'var(--dsw-alias-interactive-bg-hover)',
        selected_row: 'var(--dsw-specific-sidebar-nav-item-active)',
        text_primary: 'var(--dsw-alias-label-primary)',
        text_secondary: 'var(--dsw-alias-label-secondary)',
        text_muted: 'var(--dsw-alias-label-secondary)',
        hairline_border: 'var(--dsw-alias-border-l2)',
        focus_ring: 'var(--dsw-alias-state-business-primary)',
        composer_shadow: 'var(--dsw-shadow-lv2)',
      }) ||
    visualTarget.rail_and_subtle_surfaces !== 'neutral_gray' ||
    visualTarget.composer !== 'floating_or_bottom_safe_inset' ||
    visualTarget.composer_elevation !== 'single_outline_with_restrained_shadow' ||
    JSON.stringify(visualTypography) !==
      JSON.stringify({
        ui_font_stack: 'var(--dsw-font-family)',
        control_font_policy: 'inherit_the_pinned_dsh_font_family_or_explicit_user_preference',
        app_chrome: 'var(--dsw-font-xs-13)_or_var(--dsw-font-xs-strong-13)',
        conversation: 'var(--dsw-font-markdown-base)',
        body: 'var(--dsw-font-s-14)',
        label: 'var(--dsw-font-xs-strong-13)',
        page_title: 'var(--dsw-font-l-20)',
        metadata: 'var(--dsw-font-xxs-12)',
        code: 'var(--dsw-font-markdown-code-block-small)',
        letter_spacing_px: 0,
      }) ||
    JSON.stringify(conversationRendering) !==
      JSON.stringify({
        timeline: 'single_column_reading_lane',
        assistant_surface: 'unframed',
        user_surface: 'lightweight_bounded',
        markdown_default_typography: '15/22/400',
        paragraph_margin_block_px: 10,
        list_item_margin_block_px: 2,
        inline_code: 'subtle_neutral_capsule_12_18',
        tool_event: 'compact_localized_disclosure_row_without_card_background',
        process_and_file_events:
          'compact_localized_unframed_disclosure_rows_with_file_changes_collapsed_by_default',
        message_actions: 'hover_or_focus_revealed_without_permanent_32px_blank_row',
        loading_skeleton: 'unframed_text_lines_without_bordered_message_bubbles',
      }) ||
    ordinaryConversationViewModel.conversation_rendering_ref !==
      'contracts/app-gui-product-contract.json#interaction_baseline.visual_target.conversation_rendering' ||
    visualTarget.settings_icon_policy !==
      'pinned_dsh_icon_cohort_14_16px_currentcolor_with_color_reserved_for_typed_status' ||
    visualTarget.settings_surface_policy !==
      'ordinary_pages_use_unframed_sections_flat_rows_and_hairline_dividers_bounded_cards_only_for_repeated_entities_or_confirmation' ||
    visualTarget.accent_scope !==
      'brand_typed_status_and_actions_only_not_ordinary_rail_selection_or_settings_icons' ||
    visualTarget.opl_teal_and_brand_retained !== true
  ) {
    issues.add('interaction baseline must reject the legacy equal-weight inspector taxonomy and keep Settings in maintenance');
  }
  if (
    accessibility.ordinary_text_min_contrast_ratio !== 4.5 ||
    accessibility.large_text_non_text_and_focus_indicator_min_contrast_ratio !== 3 ||
    !sameStrings(accessibility.source_regression_scope, [
      'semantic_light_dark_muted_text_contrast',
      'semantic_light_dark_focus_indicator_contrast',
      'keyboard_focus_aria_escape_and_reduced_motion',
    ]) ||
    accessibility.source_evidence_closes_pixel_or_install !== false ||
    !sameStrings(accessibility.remaining_evidence, [
      'real_screen_reader_traversal',
      'complete_rendered_keyboard_traversal',
      'rendered_contrast_across_supported_surfaces',
      'installed_app_readback',
    ])
  ) {
    issues.add('B0-14 accessibility contract must keep WCAG thresholds and source evidence separate from Pixel and Install');
  }

  const pageStateBoundary = record(pageStateMatrix.acceptance_boundary);
  if (
    pageStateMatrix.interaction_baseline_ref !== 'contracts/app-gui-product-contract.json#interaction_baseline' ||
    pageStateBoundary.human_target_owner !== 'one-person-lab-app' ||
    pageStateBoundary.active_aionui_role !== 'current_implementation_conformance_only' ||
    pageStateBoundary.contract_target_implies_source_complete !== false ||
    pageStateBoundary.contract_target_implies_pixel_complete !== false ||
    pageStateBoundary.contract_target_implies_release_complete !== false ||
    pageStateBoundary.authority_status !== 'active_mainline_authority' ||
    pageStateBoundary.shell_implementation_status !== 'current_source_and_historical_pixels_separately_bound' ||
    pageStateBoundary.current_source_head_source !== 'active_shell_checkout_git_head' ||
    pageStateBoundary.current_source_head_must_contain_verified_gui_ancestor !== true ||
    pageStateBoundary.current_source_evidence_ref !== 'contracts/app-shell-adapter.json#shell_source' ||
    pageStateBoundary.historical_pixel_shell_sha !== historicalPixelShellSha ||
    pageStateBoundary.historical_pixel_shell_sha_binding_status !== 'bound_to_exact_historical_evidence' ||
    pageStateBoundary.pixel_evidence_ref !== 'docs/product/gui/evidence/aionui-41301/manifest.json' ||
    pageStateBoundary.runtime_product_contract_ref !==
      'contracts/app-gui-product-contract.json#pages.runtime_status.runtime_cockpit_product_contract' ||
    pageStateBoundary.runtime_route_classification !== 'core_dynamic_agent_runtime' ||
    pageStateBoundary.runtime_default_product_required !== true ||
    pageStateBoundary.runtime_default_release_gate_required !== true ||
    pageStateBoundary.runtime_adopted_shell_required !== true ||
    pageStateBoundary.runtime_explicit_validation_command !== 'npm run validate:runtime-route' ||
    pageStateBoundary.runtime_acceptance_requires_contract_page_state_validators_tests !== 'when_route_selected_or_changed'
  ) {
    issues.add('page-state acceptance boundary must keep human target separate from source and pixel completion');
  }

  const stateBoundary = record(governance.state_boundary);
  const idealTarget = record(stateBoundary.ideal_target);
  if (idealTarget.workspace_session_rail_default_visible !== true) {
    issues.add('App-owned ideal target must keep the desktop workspace/session rail visible');
  }
  if (idealTarget.inspector_default_visible !== false) {
    issues.add('App-owned ideal target must keep the inspector closed by default');
  }
  if (
    idealTarget.owner !== 'one-person-lab-app' ||
    idealTarget.authority !== 'app_product_and_visual_system' ||
    idealTarget.conformance_direction !== 'ideal_target_to_shells' ||
    'source_candidate' in idealTarget
  ) {
    issues.add('ideal target must be App-owned and flow one-way to shells without a source candidate');
  }

  const profileGui = record(profile.gui);
  const profileAppearance = record(profileGui.appearance);
  const expectedUiLocalePolicy = {
    explicit_user_preference: 'preserve_across_launches',
    first_launch_without_preference: 'detect_system_locale_before_first_render',
    supported_normalization: 'zh_to_zh-CN_else_en-US',
    startup_must_not_overwrite_explicit_preference: true,
  };
  if (
    JSON.stringify(record(guiContract.ui_locale_policy)) !== JSON.stringify(expectedUiLocalePolicy) ||
    JSON.stringify(record(profileGui.ui_locale_policy)) !== JSON.stringify(expectedUiLocalePolicy)
  ) {
    issues.add('GUI contract and product profile must detect system locale before first render and preserve explicit language preferences');
  }
  if (
    profileAppearance.visual_source_cohort_ref !== visualSourceCohortPath ||
    profileAppearance.visual_reference_cohort_ref !== visualReferenceCohortPath ||
    !sameStrings(profileAppearance.shared_visual_primitives, visualPrimitiveIds)
  ) {
    issues.add('App product profile appearance must select the active visual reference cohort and shared primitives');
  }
  const profileHome = record(profileGui.home);
  const homeLayout = record(profileHome.home_layout);
  const activeConversation = record(profileGui.ordinary_conversation);
  const activeInspector = record(profileGui.right_context_inspector);
  const activeAionui = record(stateBoundary.active_aionui);
  const activeRailState = homeLayout.workspace_session_rail_default_state;
  const activeInspectorState = homeLayout.right_context_inspector_default_state;
  const allowedActiveRailStates = ['collapsed', 'visible_wide_drawer_narrow'];
  const allowedActiveInspectorStates = ['collapsed', 'visible'];
  if (!allowedActiveRailStates.includes(String(activeRailState))) {
    issues.add('active AionUI rail state must be collapsed or visible_wide_drawer_narrow in app-product-profile');
  }
  if (!allowedActiveInspectorStates.includes(String(activeInspectorState))) {
    issues.add('active AionUI inspector state must be collapsed or visible in app-product-profile');
  }
  if (activeAionui.source !== 'contracts/app-product-profile.json#gui.home.home_layout') {
    issues.add('active AionUI state must source app-product-profile gui.home.home_layout');
  }
  if (activeAionui.conformance_policy !== 'read_current_profile_state_and_compare_to_ideal_without_freezing_values') {
    issues.add('active AionUI conformance policy must compare current profile state to ideal without freezing values');
  }
  if (JSON.stringify(Object.keys(activeAionui).sort()) !== JSON.stringify(['conformance_policy', 'source'])) {
    issues.add('active AionUI governance must store only source and conformance_policy');
  }
  const railMatchesIdeal =
    activeRailState === (idealTarget.workspace_session_rail_default_visible ? 'visible_wide_drawer_narrow' : 'collapsed');
  const inspectorMatchesIdeal = activeInspectorState === (idealTarget.inspector_default_visible ? 'visible' : 'collapsed');
  const permissionAccessModeMatchesIdeal =
    profileHome.permission_mode_selector_visible === true &&
    profileHome.conversation_permission_mode_selector_visible === true &&
    activeConversation.permission_mode_selector_visible === true;
  const sidePanelInformationArchitectureMatchesIdeal =
    activeInspector.surface_kind === 'on_demand_workspace_surface' &&
    activeInspector.default_third_column_visible === false &&
    record(activeInspector.workspace_surface).id === 'files_changes' &&
    record(activeInspector.preview_surface).id === 'preview' &&
    record(activeInspector.preview_surface).independent === true &&
    sameStrings(record(record(activeInspector.on_demand_task_tools).terminal).entry_points, ['environment', 'task_need']) &&
    sameStrings(record(record(activeInspector.on_demand_task_tools).browser).entry_points, ['environment', 'task_need']) &&
    activeInspector.equal_weight_tool_taxonomy_allowed === false &&
    activeInspector.runtime_duplicate_allowed === false &&
    !('primary_tools' in activeInspector) &&
    !('secondary_sections' in activeInspector) &&
    !('tabs' in activeInspector);
  const codex = record(profile.codex);
  const defaultModel = typeof codex.default_model === 'string' ? codex.default_model : '';
  const defaultReasoningEffort = typeof codex.default_reasoning_effort === 'string' ? codex.default_reasoning_effort : '';
  if (!defaultModel || !defaultReasoningEffort) {
    issues.add('app-product-profile Codex defaults must be non-empty strings');
  }
  const visualSourceGovernance = record(governance.visual_source);
  const interactionGovernance = record(governance.interaction_reference);
  if (
    visualSourceGovernance.cohort !== visualSourceCohortPath ||
    visualSourceGovernance.source_usage !== visualSourceUsage ||
    visualSourceGovernance.authority !== 'one-person-lab-app' ||
    !sameStrings(visualSourceGovernance.forbidden_authority, [
      'product_behavior',
      'routes',
      'framework_abi',
      'app_state_or_actions',
      'runtime',
      'sessions',
      'connections',
      'release',
      'pixel_acceptance',
    ])
  ) {
    issues.add('design-system governance must bind the pinned DSH visual source cohort without transferring product authority');
  }
  if (
    interactionGovernance.comparison_baseline !== interactionReference ||
    interactionGovernance.source_usage !== interactionReferenceUsage
  ) {
    issues.add('Codex must remain only a historical workflow and spatial interaction reference');
  }

  const evidenceBoundary = record(governance.evidence_boundary);
  if (
    evidenceBoundary.validation_scope !== 'design_system_governance_consistency_only' ||
    evidenceBoundary.docs_or_visual_qa_can_claim_release_ready !== false ||
    evidenceBoundary.pixel_verified_implies_visual_parity !== false ||
    evidenceBoundary.pixel_verified_implies_release_ready !== false
  ) {
    issues.add('design-system validation and visual/docs evidence must not claim release readiness');
  }

  const scripts = record(packageJson.scripts);
  if (scripts['validate:gui-design-system'] !== 'node --experimental-strip-types scripts/validate-gui-design-system.ts') {
    issues.add('package.json must expose validate:gui-design-system');
  }
  const shellConvergence = typeof scripts['validate:shell-convergence'] === 'string'
    ? scripts['validate:shell-convergence']
    : '';
  if (
    !shellConvergence.includes('npm run validate:gui-design-system') ||
    !shellConvergence.includes('npm run validate:active-shell -- --quick') ||
    !shellConvergence.includes('npm run validate:shell-candidates')
  ) {
    issues.add('validate:shell-convergence must include design, active-shell quick, and role-registry validation');
  }
  if (shellConvergence.includes('validate:candidate:') || shellConvergence.includes('--candidate')) {
    issues.add('validate:shell-convergence must not pull explicit candidate detail into default gates');
  }

  if (issues.size > 0) {
    throw new Error(`GUI design system validation failed:\n- ${[...issues].join('\n- ')}`);
  }

  return {
    schema: 'opl_app_gui_design_system_validation.v1',
    status: 'consistent',
    root,
    definition_stack: expectedStack.map((layer) => layer.id),
    shell_roles: {
      active: 'aionui',
      foreground: 'opl-studio',
    },
    visual_source_cohort: {
      contract: visualSourceCohortPath,
      source_commit: visualSourceCommit,
      source_usage: visualSourceUsage,
    },
    interaction_reference: interactionReference,
    pixel_reference: pixelReference,
    superseded_interaction_reference: supersededInteractionReference,
    reference_boundary: {
      app_contract_status: 'aligned_contract',
      page_state_status: 'aligned_contract',
      candidate_detail_validation: 'explicit_on_demand',
    },
    model_defaults: {
      model: defaultModel,
      reasoning_effort: defaultReasoningEffort,
    },
    state_boundary: {
      ideal_native_rail_visible: true,
      ideal_native_inspector_visible: false,
      active_aionui_rail_state: activeRailState as ActiveSurfaceState,
      active_aionui_inspector_state: activeInspectorState as ActiveSurfaceState,
      active_aionui_conformance: {
        rail_matches_ideal: railMatchesIdeal,
        inspector_matches_ideal: inspectorMatchesIdeal,
        rail_status: conformanceStatus(railMatchesIdeal),
        inspector_status: conformanceStatus(inspectorMatchesIdeal),
        permission_access_mode_status: conformanceStatus(permissionAccessModeMatchesIdeal),
        side_panel_information_architecture_status: conformanceStatus(sidePanelInformationArchitectureMatchesIdeal),
      },
    },
    evidence_scope: 'design_system_governance_consistency_only',
    visual_evidence: {
      manifest: 'docs/product/gui/evidence/aionui-41301/manifest.json',
      shell_head: historicalPixelShellSha,
      entries_verified: visualEvidenceEntries as 8,
      packaged_command: true,
    },
    visual_reference_cohort: {
      contract: visualReferenceCohortPath,
      reference_baseline_id: 'opl-app-approved-visual-baseline-v1',
      reference_state: cohortReference.state as
        | 'capture_and_human_approval_required'
        | 'approved',
      external_product_artifact_required: false,
      scenes_required: expectedVisualReferenceScenes.length as 16,
      surface_families: ['home', 'conversation', 'rail', 'settings'],
      viewports: ['desktop', 'narrow'],
      themes: ['light', 'dark'],
      locales: ['zh-CN', 'en-US'],
      reference_assets_complete: false,
      scene_bound_visual_parity: false,
    },
    release_ready: false,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(validateGuiDesignSystem(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
