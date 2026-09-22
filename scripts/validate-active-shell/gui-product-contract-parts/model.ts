import { assertDeepEqualJson } from '../assertions.ts';
import { productProfile } from './context.ts';

export function validateCodexModelPolicy(guiContract) {
  const executorPolicy = guiContract.executor_policy ?? {};
  const productHome = productProfile.gui?.home ?? {};
  assertDeepEqualJson(
    {
      default_model: executorPolicy.default_model,
      default_reasoning_effort: executorPolicy.default_reasoning_effort,
      default_model_display_value: executorPolicy.default_model_display_value,
      home_model_status_label: executorPolicy.home_model_status_label,
      home_model_status_label_en: executorPolicy.home_model_status_label_en,
      auto_model_policy_source_ref: executorPolicy.auto_model_policy_source_ref,
      display_policy: executorPolicy.model_display_options_policy?.display_policy,
      button_label_policy: executorPolicy.model_display_options_policy?.button_label_policy,
      reasoning_menu_title_zh: executorPolicy.model_display_options_policy?.reasoning_menu_title_zh,
      reasoning_menu_title_en: executorPolicy.model_display_options_policy?.reasoning_menu_title_en,
      reasoning_effort_override_surface:
        executorPolicy.model_display_options_policy?.reasoning_effort_override_surface,
      model_menu_policy: executorPolicy.model_display_options_policy?.model_menu_policy,
      menu_structure: executorPolicy.model_display_options_policy?.menu_structure,
      user_reasoning_effort_options: executorPolicy.model_display_options_policy?.user_reasoning_effort_options,
      known_visible_models_follow_frontier_preference_order:
        executorPolicy.model_display_options_policy?.known_visible_models_follow_frontier_preference_order,
      unknown_catalog_default_must_remain_visible_in_auto:
        executorPolicy.model_display_options_policy?.unknown_catalog_default_must_remain_visible_in_auto,
    },
    {
      default_model: productProfile.codex?.default_model,
      default_reasoning_effort: productProfile.codex?.default_reasoning_effort,
      default_model_display_value: productHome.codex_home_model_status_label,
      home_model_status_label: productHome.codex_home_model_status_label,
      home_model_status_label_en: productHome.codex_home_model_status_label_en,
      auto_model_policy_source_ref: productHome.codex_auto_model_selection?.policy_source_ref,
      display_policy: productHome.codex_model_display_options?.display_policy,
      button_label_policy: productHome.codex_model_display_options?.button_label_policy,
      reasoning_menu_title_zh: productHome.codex_model_display_options?.reasoning_menu_title_zh,
      reasoning_menu_title_en: productHome.codex_model_display_options?.reasoning_menu_title_en,
      reasoning_effort_override_surface: productHome.codex_model_display_options?.reasoning_effort_override_surface,
      model_menu_policy: productHome.codex_model_display_options?.model_menu_policy,
      menu_structure: productHome.codex_model_display_options?.menu_structure,
      user_reasoning_effort_options: productHome.codex_model_display_options?.user_reasoning_effort_options,
      known_visible_models_follow_frontier_preference_order: true,
      unknown_catalog_default_must_remain_visible_in_auto: true,
    },
    'App GUI Codex model policy',
  );
}

export function validateVisualTokenBindings(guiContract) {
  const visualTarget = guiContract.interaction_baseline?.visual_target;
  const lightRail = visualTarget?.light_surfaces?.navigation_rail;
  const darkRail = visualTarget?.dark_surfaces?.navigation_rail;
  const bindings = visualTarget?.shell_token_bindings;
  assertDeepEqualJson(
    bindings?.navigation_rail,
    {
      css_variable: '--opl-sidebar-bg',
      light_css_value: 'var(--dsw-specific-sidebar-fill)',
      dark_css_value: 'var(--dsw-specific-sidebar-fill)',
      surface_selector: '.layout-sider.arco-layout-sider',
      surface_background_value: 'var(--opl-sidebar-bg)',
      layout_background_utility_allowed: false,
    },
    'App GUI navigation rail shell token binding',
  );
  assertDeepEqualJson(
    bindings?.text_semantics,
    {
      uno_t_primary_value: 'var(--text-primary)',
      uno_t_tertiary_value: 'var(--color-text-3)',
      text_primary_bridge_value: 'var(--dsw-alias-label-primary)',
      body_color_value: 'var(--text-primary)',
    },
    'App GUI shell text semantic token binding',
  );
  if (
    typeof lightRail !== 'string' ||
    typeof darkRail !== 'string' ||
    lightRail.toLowerCase() !== bindings.navigation_rail.light_css_value ||
    darkRail.toLowerCase() !== bindings.navigation_rail.dark_css_value
  ) {
    throw new Error('App GUI shell rail token values must project the visual surface authority exactly');
  }
}
