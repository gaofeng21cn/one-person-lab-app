import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const appRoot = join(import.meta.dirname, '..', '..', '..');

test('DSH visual source policy is discoverable and keeps sessions primary', () => {
  const readme = readFileSync(join(appRoot, 'docs/product/gui/README.md'), 'utf8');
  const policy = readFileSync(join(appRoot, 'docs/product/gui/codex-app-visual-parity.md'), 'utf8');
  const delta = readFileSync(join(appRoot, 'docs/product/gui/codex-to-opl-app-delta.md'), 'utf8');
  const visualSystem = readFileSync(join(appRoot, 'docs/product/gui/visual-system.md'), 'utf8');
  const conformance = readFileSync(join(appRoot, 'docs/product/gui/shell-conformance-matrix.md'), 'utf8');
  const guiContract = JSON.parse(
    readFileSync(join(appRoot, 'contracts/app-gui-product-contract.json'), 'utf8'),
  );
  const productProfile = JSON.parse(
    readFileSync(join(appRoot, 'contracts/app-product-profile.json'), 'utf8'),
  );
  const pageStateMatrix = JSON.parse(
    readFileSync(join(appRoot, 'contracts/app-page-state-matrix.json'), 'utf8'),
  );

  assert.match(readme, /codex-app-visual-parity\.md/);
  assert.match(policy, /visual_source=pinned_deepseek_harness_visual_source_cohort/);
  assert.match(policy, /historical_interaction_reference=chatgpt_codex_workflow_and_spatial_observation_only/);
  assert.match(policy, /pixel_reference=opl_app_owned_approved_visual_baseline/);
  assert.match(policy, /external_reference_artifact_required_for_release=false/);
  assert.match(policy, /project_owns_session=false/);
  assert.match(policy, /project_context_row=forbidden/);
  assert.match(policy, /new_session_context_bar=required_above_composer/);
  assert.match(policy, /composer_capability_palette=searchable_grouped_scrollable/);
  assert.match(policy, /conversation_search_location=rail_history_header_icon_button/);
  assert.match(policy, /composer_resting_shadow=required/);
  assert.match(policy, /home_starter_selected_alignment=centered_no_layout_shift/);
  assert.match(policy, /settings_surface_audit=all_routes_light_dark_desktop_narrow/);
  assert.match(policy, /temporal_maintenance=server_worker_detect_install_configure_start_restart_run_now_readback/);
  assert.match(
    policy,
    /temporal_server_supervisor=login_resident_stable_launcher_run_at_load_keep_alive_repairable/,
  );
  assert.match(policy, /aioncore_modification=forbidden/);
  assert.match(policy, /visual_acceptance=source_dom_and_installed_pixels/);
  assert.match(policy, /candidate_shell_commit_source=active_shell_checkout_git_head/);
  assert.doesNotMatch(policy, /candidate_shell_commit=[0-9a-f]{40}/);
  assert.match(policy, /candidate_webui_pixels=pending_on_clean_release_cohort/);
  assert.match(policy, /installed_pixel_acceptance=pending/);
  assert.match(policy, /visual_parity_complete=false/);
  assert.match(visualSystem, /固定的 DeepSeek Harness commit/);
  assert.match(visualSystem, /ChatGPT Codex macOS 只保留历史工作流和空间关系参考/);
  assert.match(visualSystem, /OPL App 自有、经人工批准的 16-scene baseline/);
  assert.match(visualSystem, /grouped-row Control Center/);
  assert.doesNotMatch(conformance, /默认 cwd、分组与 context hint/);
  assert.match(delta, /稳定视觉 chrome 逐像素对齐/);
  assert.doesNotMatch(delta, /不宣称逐像素或逐行为复制/);

  const homeVisual = guiContract.interaction_baseline.home.visual_structure;
  assert.equal(homeVisual.starter_typography, '13/18/500');
  assert.equal(
    homeVisual.starter_content_alignment,
    'icon_and_label_share_one_vertical_centerline_without_selection_glyph',
  );
  assert.equal(homeVisual.selected_starter_accessibility_state, 'aria_pressed_reflects_active_shortcut');
  assert.equal(homeVisual.selected_starter_layout_shift_allowed, false);
  assert.deepStrictEqual(guiContract.interaction_baseline.composer.visual_metrics, {
    source_ref: 'contracts/app-gui-visual-source-cohort.json#adapter_reference_source_paths[InputBar.module.css]',
    textarea_typography: 'var(--dsw-font-base-16)',
    bottom_control_typography: 'var(--dsw-font-xxs-12)_or_var(--dsw-font-xxs-strong-12)',
    bottom_control_max_font_px: 12,
    icon_size_px: 16,
    action_height_px: 32,
    send_stop_control: {
      visible_diameter_px: 28,
      minimum_hit_target_px: 32,
      icon_size_px: 16,
      outline_stroke_policy: 'match_peer_composer_controls',
    },
    border_px: 1,
    corner_radius_px: 22,
    resting_shadow_source: 'var(--dsw-shadow-lv2)',
    focus_geometry_policy:
      'enhance_border_or_ring_without_removing_resting_shadow_or_changing_size',
  });
  assert.equal(
    guiContract.utility_icon_policy.library,
    'pinned_deepseek_harness_icon_cohort_via_opl_icon_adapter',
  );
  assert.deepStrictEqual(guiContract.utility_icon_policy.icon_text_action_geometry, {
    icon_size_px: 16,
    icon_slot_px: 20,
    icon_color: 'currentColor',
    icon_background: 'transparent_none',
    icon_label_gap_px: 8,
    alignment: 'icon_slot_and_label_share_one_vertical_centerline',
    contrast_policy: 'button_foreground_color_applies_to_icon_and_label_together',
    disabled_policy:
      'apply_disabled_opacity_to_the_whole_control_never_hide_only_the_icon',
  });
  assert.deepStrictEqual(
    productProfile.gui.home.utility_icon_policy,
    guiContract.utility_icon_policy,
  );
  assert.equal(guiContract.home_layout.workspace_selector_visible, true);
  assert.equal(guiContract.home_layout.workspace_selector_entry, 'home.new_session_context_bar');
  assert.equal(guiContract.home_layout.unselected_workspace_control_visible, true);
  assert.equal(
    guiContract.home_layout.unselected_workspace_control_policy,
    'localized_choose_project_directory_action_not_projectless_status_placeholder',
  );
  assert.equal(guiContract.home_layout.desktop_context_bar_height_px, 52);
  assert.equal(
    guiContract.ordinary_conversation.composer_placeholder_policy,
    'opl_owned_localized_task_prompt_without_backend_name_interpolation',
  );
  assert.equal(
    guiContract.ordinary_conversation.unified_context_menu.presentation,
    'searchable_grouped_scrollable_capability_palette',
  );
  assert.equal(
    guiContract.ordinary_conversation.unified_context_menu.trigger_dispatch_policy,
    'always_open_palette_never_directly_invoke_file_picker',
  );
  assert.equal(
    guiContract.ordinary_conversation.unified_context_menu.direct_file_picker_fallback_allowed,
    false,
  );
  assert.equal(guiContract.ordinary_conversation.unified_context_menu.searchable, true);
  assert.equal(guiContract.ordinary_conversation.unified_context_menu.keyboard_navigation, true);
  assert.equal(
    guiContract.ordinary_conversation.unified_context_menu.desktop_panel_width_policy,
    'match_composer_outer_width',
  );
  assert.equal(guiContract.ordinary_conversation.unified_context_menu.desktop_panel_max_width_px, 736);
  assert.deepStrictEqual(
    guiContract.ordinary_conversation.unified_context_menu.keyboard_commands,
    ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape'],
  );
  assert.deepStrictEqual(
    guiContract.ordinary_conversation.unified_context_menu.groups.map(
      (group: { id: string }) => group.id,
    ),
    ['local_inputs', 'agent_packages', 'opl_capabilities', 'skills', 'session_modes', 'apps_and_connections'],
  );
  const paletteGroups = Object.fromEntries(
    guiContract.ordinary_conversation.unified_context_menu.groups.map((group: { id: string }) => [group.id, group]),
  );
  assert.deepStrictEqual(
    paletteGroups.agent_packages.surface_actions.existing_conversation,
    ['invoke_agent_package_for_current_turn'],
  );
  assert.equal(paletteGroups.agent_packages.existing_session_rebinding_allowed, false);
  assert.equal(
    paletteGroups.agent_packages.scope,
    'new_session_configuration_or_existing_turn_invocation',
  );
  assert.equal(
    paletteGroups.agent_packages.existing_conversation_invocation_policy,
    'invoke_selected_standard_agent_for_current_turn_without_rebinding_the_codex_thread',
  );
  assert.deepStrictEqual(
    paletteGroups.opl_capabilities.surface_actions.existing_conversation,
    ['invoke_opl_capability_for_current_turn'],
  );
  assert.equal(paletteGroups.opl_capabilities.existing_session_rebinding_allowed, false);
  assert.equal(
    paletteGroups.opl_capabilities.activation_policy,
    'skill_injection_for_current_turn_only_no_package_activation_or_lifecycle_mutation',
  );
  assert.deepStrictEqual(
    paletteGroups.skills.surface_actions.existing_conversation,
    ['invoke_loaded_owner_or_carrier_projected_skill'],
  );
  assert.equal(paletteGroups.session_modes.mode_deduplication_policy, 'exclude_permission_access_equivalent_modes');
  assert.deepStrictEqual(guiContract.interaction_baseline.capability_selection.selection_surfaces, [
    'home_starter',
    'home_new_session_capability_palette',
    'home_new_session_at_mention_agent_selector',
  ]);
  const ordinaryConversationPage = pageStateMatrix.pages.find(
    (page: { id: string }) => page.id === 'ordinary_conversation',
  );
  assert.deepStrictEqual(
    ordinaryConversationPage.conversation_view_model.unified_context_menu,
    guiContract.ordinary_conversation.unified_context_menu,
  );
  assert.ok(
    guiContract.ordinary_conversation.unified_context_menu.forbidden_entries.includes(
      'workspace_or_initial_cwd',
    ),
  );
  assert.ok(
    guiContract.ordinary_conversation.unified_context_menu.forbidden_entries.includes(
      'unavailable_or_synthetic_plugins',
    ),
  );
  const catalogPolicy = productProfile.gui.agent_package_registry.catalog_presentation_policy;
  assert.deepStrictEqual(catalogPolicy.section_order, [
    'opl_managed',
    'other_agents',
    'other_capabilities',
  ]);
  assert.equal(catalogPolicy.ownership_classifier.hardcoded_package_ids_allowed, false);
  assert.equal(catalogPolicy.section_policy.availability_status_is_row_state_not_grouping, true);
  assert.equal(catalogPolicy.raw_package_role_visible, false);
  assert.equal(
    catalogPolicy.dependency_hierarchy.source,
    'app_state.agent_packages.status_index.packages[].dependent_guard.required_by_package_ids',
  );
  assert.equal(catalogPolicy.dependency_hierarchy.hardcoded_package_relationships_allowed, false);
  assert.equal(catalogPolicy.dependency_hierarchy.duplicate_rows_allowed, false);
  assert.equal(
    guiContract.interaction_baseline.visual_target.light_surfaces.composer_shadow,
    'var(--dsw-shadow-lv2)',
  );
  assert.equal(
    guiContract.interaction_baseline.visual_target.dark_surfaces.composer_shadow,
    'var(--dsw-shadow-lv2)',
  );
  const settingsAudit =
    guiContract.settings_navigation.settings_ia.protocols.visual_qa_expectations
      .settings_component_audit;
  assert.deepStrictEqual(settingsAudit.allowed_bounded_group_kinds, [
    'repeated_entity',
    'confirmation',
  ]);
  assert.equal(settingsAudit.source_dom_or_single_screenshot_only_is_sufficient, false);
  assert.ok(settingsAudit.checks.includes('no_nested_card_or_border_wall'));
  assert.ok(settingsAudit.checks.includes('icon_uses_currentColor_with_stable_slot_and_visible_contrast'));
});
