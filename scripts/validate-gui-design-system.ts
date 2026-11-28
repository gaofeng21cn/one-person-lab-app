#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readActiveShellBuildProfile } from './active-shell-build-profile.ts';
import {
  appOwnedActiveStudioPrimaryNavigation,
  appOwnedCodexSubagentActivityPolicy,
  appOwnedDirectoryGroupPolicy,
  appOwnedExplicitSessionInputPolicy,
  appOwnedOplStandardAgentMembershipPolicy,
  appOwnedSendFailureInputPolicy,
  appOwnedSessionWorkspaceModel,
  appOwnedUnifiedContextMenu,
} from './validate-active-shell/app-contract-constants.ts';

import type {
  ActiveSurfaceState,
  GuiDesignSystemValidation,
} from './validate-gui-design-system/contract.ts';
import {
  expectedDeferredVisualSurfaces,
  expectedPhaseOneBehaviorInvariants,
  expectedStack,
  expectedVisualReferenceScenes,
  expectedVisualSourceNormalizations,
  expectedVisualUpgradeEvidence,
  foundationDocs,
  interactionReference,
  interactionReferenceUsage,
  pixelReference,
  supersededInteractionReference,
  visualPrimitiveIds,
  visualReferenceCohortPath,
  visualSourceCohortPath,
  visualSourceCommit,
  visualSourceUsage,
} from './validate-gui-design-system/contract.ts';
import {
  conformanceStatus,
  readJson,
  record,
  sameStrings,
} from './validate-gui-design-system/shared.ts';
import { validateGuiDesignSystemSourceAndReference } from './validate-gui-design-system/source-and-reference.ts';
import { validateGuiDesignSystemInteractionBaseline } from './validate-gui-design-system/interaction-baseline.ts';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function validateGuiDesignSystem(root = defaultRoot): GuiDesignSystemValidation {
  const issues = new Set<string>();
  const shellAdapter = readJson(root, 'contracts/app-shell-adapter.json', issues);
  const registry = shellAdapter;
  const profile = readJson(root, 'contracts/app-product-profile.json', issues);
  const guiContract = readJson(root, 'contracts/app-gui-product-contract.json', issues);
  const pageStateMatrix = readJson(root, 'contracts/app-page-state-matrix.json', issues);
  const activeBuild = readActiveShellBuildProfile(root);
  const visualReferenceCohort = readJson(root, visualReferenceCohortPath, issues);
  const visualSourceCohort = readJson(root, visualSourceCohortPath, issues);
  const packageJson = readJson(root, 'package.json', issues);
  const governance = record(registry.design_system_governance);

  const interactionBaseline = record(guiContract.interaction_baseline);
  const cohortReference = record(visualReferenceCohort.reference);
  validateGuiDesignSystemSourceAndReference({
    root,
    issues,
    registry,
    profile,
    guiContract,
    pageStateMatrix,
    activeBuild,
    visualReferenceCohort,
    visualSourceCohort,
    governance,
    interactionBaseline,
  });

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
    acceptanceBoundary.active_shell !== 'opl-studio' ||
    acceptanceBoundary.active_shell_role !== 'current_implementation_conformance_only' ||
    acceptanceBoundary.docs_or_contract_imply_source_complete !== false ||
    acceptanceBoundary.docs_or_contract_imply_pixel_complete !== false ||
    acceptanceBoundary.docs_or_contract_imply_release_ready !== false ||
    acceptanceBoundary.authority_status !== 'active_mainline_authority' ||
    acceptanceBoundary.shell_implementation_status !== 'active_studio_source_historical_aionui_pixels_are_provenance_only' ||
    acceptanceBoundary.source_evidence_status !== 'active_shell_checkout_git_head' ||
    acceptanceBoundary.pixel_evidence_status !==
      'historical_aionui_visual_evidence_not_current_studio_qualification' ||
    acceptanceBoundary.release_evidence_status !==
      'studio_carrier_qualification_is_independent' ||
    acceptanceBoundary.current_source_head_source !== 'contracts/app-shell-adapter.json#shell_source' ||
    acceptanceBoundary.current_source_head_must_contain_verified_gui_ancestor !== false ||
    acceptanceBoundary.current_source_evidence_ref !== 'contracts/app-shell-adapter.json#shell_source' ||
    !/^[0-9a-f]{40}$/.test(historicalPixelShellSha) ||
    acceptanceBoundary.historical_pixel_shell_sha_binding_status !== 'bound_to_exact_historical_evidence' ||
    acceptanceBoundary.pixel_evidence_ref !== null ||
    acceptanceBoundary.historical_pixel_evidence_entry_count !== 8 ||
    acceptanceBoundary.historical_pixel_shell_sha_must_not_be_inferred_as_current_source_head !== true
  ) {
    issues.add('interaction baseline must keep the human target separate from source, pixel, and release completion');
  }
  if (
    acceptanceBoundary.pixel_evidence_ref !== null ||
    acceptanceBoundary.pixel_evidence_status !== 'historical_aionui_visual_evidence_not_current_studio_qualification'
  ) {
    issues.add('historical AionUI visual evidence must not serve as current Studio pixel qualification');
  }

  validateGuiDesignSystemInteractionBaseline({
    issues,
    profile,
    guiContract,
    pageStateMatrix,
    interactionBaseline,
  });

  const pageStateBoundary = record(pageStateMatrix.acceptance_boundary);
  if (
    pageStateMatrix.interaction_baseline_ref !== 'contracts/app-gui-product-contract.json#interaction_baseline' ||
    pageStateBoundary.human_target_owner !== 'one-person-lab-app' ||
    pageStateBoundary.active_shell_role !== 'current_implementation_conformance_only' ||
    pageStateBoundary.contract_target_implies_source_complete !== false ||
    pageStateBoundary.contract_target_implies_pixel_complete !== false ||
    pageStateBoundary.contract_target_implies_release_complete !== false ||
    pageStateBoundary.authority_status !== 'active_mainline_authority' ||
    pageStateBoundary.shell_implementation_status !== 'active_studio_source_historical_aionui_pixels_are_provenance_only' ||
    pageStateBoundary.current_source_head_source !== 'contracts/app-shell-adapter.json#shell_source' ||
    pageStateBoundary.current_source_head_must_contain_verified_gui_ancestor !== false ||
    pageStateBoundary.current_source_evidence_ref !== 'contracts/app-shell-adapter.json#shell_source' ||
    pageStateBoundary.historical_pixel_shell_sha !== historicalPixelShellSha ||
    pageStateBoundary.historical_pixel_shell_sha_binding_status !== 'bound_to_exact_historical_evidence' ||
    pageStateBoundary.pixel_evidence_ref !== null ||
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
  const activeStudio = record(stateBoundary.active_studio);
  const activeRailState = homeLayout.workspace_session_rail_default_state;
  const activeInspectorState = homeLayout.right_context_inspector_default_state;
  const allowedActiveRailStates = ['collapsed', 'visible_wide_drawer_narrow'];
  const allowedActiveInspectorStates = ['collapsed', 'visible'];
  if (!allowedActiveRailStates.includes(String(activeRailState))) {
    issues.add('active Studio rail state must be collapsed or visible_wide_drawer_narrow in app-product-profile');
  }
  if (!allowedActiveInspectorStates.includes(String(activeInspectorState))) {
    issues.add('active Studio inspector state must be collapsed or visible in app-product-profile');
  }
  if (activeStudio.source !== 'contracts/app-product-profile.json#gui.home.home_layout') {
    issues.add('active Studio state must source app-product-profile gui.home.home_layout');
  }
  if (activeStudio.conformance_policy !== 'read_current_profile_state_and_compare_to_ideal_without_freezing_values') {
    issues.add('active Studio conformance policy must compare current profile state to ideal without freezing values');
  }
  if (JSON.stringify(Object.keys(activeStudio).sort()) !== JSON.stringify(['conformance_policy', 'source'])) {
    issues.add('active Studio governance must store only source and conformance_policy');
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
      active: activeBuild.id,
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
      active_studio_rail_state: activeRailState as ActiveSurfaceState,
      active_studio_inspector_state: activeInspectorState as ActiveSurfaceState,
      active_studio_conformance: {
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
      current_studio_manifest: null,
      current_studio_entries_verified: 0,
      packaged_command: false,
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
