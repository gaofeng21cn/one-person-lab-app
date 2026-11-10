import fs from 'node:fs';
import path from 'node:path';

import type { JsonRecord } from './contract.ts';
import {
  conformanceStatusVocabulary,
  expectedDeferredVisualSurfaces,
  expectedPhaseOneBehaviorInvariants,
  expectedStack,
  expectedVisualReferenceScenes,
  expectedVisualSourceNormalizations,
  expectedVisualUpgradeEvidence,
  foundationDocs,
  interactionReference,
  pixelReference,
  visualPrimitiveIds,
  visualReferenceCohortPath,
  visualSourceCohortPath,
  visualSourceCommit,
  visualSourceUsage,
} from './contract.ts';
import { record, sameStrings, stringArray } from './shared.ts';

type GuiDesignSystemSourceAndReferenceInputs = {
  root: string;
  issues: Set<string>;
  registry: JsonRecord;
  profile: JsonRecord;
  guiContract: JsonRecord;
  pageStateMatrix: JsonRecord;
  activeBuild: { id: string };
  visualReferenceCohort: JsonRecord;
  visualSourceCohort: JsonRecord;
  governance: JsonRecord;
  interactionBaseline: JsonRecord;
};

export function validateGuiDesignSystemSourceAndReference({
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
}: GuiDesignSystemSourceAndReferenceInputs): void {
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
  if (mainline.shell !== activeBuild.id || registry.active_shell_unchanged !== activeBuild.id) {
    issues.add('candidate registry must match the App-selected active Shell');
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
  const upstreamFollowing = record(maintenancePolicy.historical_aionui_upstream_provenance);
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
    maintenanceGoal.upstream_following !== 'disabled_for_retired_aionui_historical_provenance_only' ||
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
    visualComparison.shell_comparator_ref !== 'app-owned-scene-comparison' ||
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
    visualSourceCohort.state !== 'pinned_for_opl_studio_visual_foundation' ||
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
    sourceShellAdoption.active_shell !== 'opl-studio' ||
    sourceShellAdoption.reuse_mode !== 'bounded_vendored_visual_source_with_opl_adapters' ||
    sourceShellAdoption.required_source_manifest !==
      'src/composition/deepseekHarnessSourceManifest.json' ||
    sourceShellAdoption.required_license_notice !==
      'src/vendor/deepseek-harness/LICENSE' ||
    sourceShellAdoption.provider_component !== 'StudioFrame' ||
    sourceShellAdoption.icon_adapter_component !== 'DSH icon sprite and upstream icon components' ||
    JSON.stringify(sourceShellAdoption.allowed_vendor_normalizations) !==
      JSON.stringify(expectedVisualSourceNormalizations) ||
    sourceShellAdoption.app_product_authority_transfer_allowed !== false ||
    sourceShellAdoption.framework_abi_change_allowed !== false ||
    stringArray(visualSourceCohort.excluded_source_and_runtime).includes('packages/client/ui-slots') ||
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
    issues.add('visual source cohort must pin the DSH commit, require the Studio source implementation, and keep the source limited to visual adapters without runtime or release authority');
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
    cohortCandidate.shell !== 'opl-studio' ||
    cohortCandidate.app_contract_ref !==
      'contracts/app-gui-product-contract.json#gui_maintenance_policy.visual_comparison_protocol' ||
    cohortCandidate.shell_source_ref !== 'contracts/app-shell-adapter.json#shell_source' ||
    cohortCandidate.comparison_tool !== 'app-owned-scene-comparison'
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
}
