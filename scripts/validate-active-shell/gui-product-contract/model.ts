import { assertDeepEqualJson } from '../assertions.ts';
import { productProfile } from './context.ts';

export function validateCodexModelPolicy(guiContract) {
  const executorPolicy = guiContract.executor_policy ?? {};
  const productHome = productProfile.gui?.home ?? {};
  const displayOptions = executorPolicy.model_display_options_policy;
  const projectedExecutorFields = {
    default_model: productProfile.codex?.default_model,
    default_reasoning_effort: productProfile.codex?.default_reasoning_effort,
    default_model_display_value: productHome.codex_home_model_status_label,
    home_model_status_label: productHome.codex_home_model_status_label,
    home_model_status_label_en: productHome.codex_home_model_status_label_en,
    auto_model_policy_source_ref: productHome.codex_auto_model_selection?.policy_source_ref,
  };
  for (const [field, expected] of Object.entries(projectedExecutorFields)) {
    assertDeepEqualJson(executorPolicy[field], expected, `App GUI Codex model policy ${field}`);
  }
  for (const field of [
    'display_policy',
    'button_label_policy',
    'reasoning_menu_title_zh',
    'reasoning_menu_title_en',
    'reasoning_effort_override_surface',
    'model_menu_policy',
    'menu_structure',
    'user_reasoning_effort_options',
  ]) {
    assertDeepEqualJson(
      displayOptions?.[field],
      productHome.codex_model_display_options?.[field],
      `App GUI Codex model policy ${field}`,
    );
  }
  if (
    displayOptions?.known_visible_models_follow_frontier_preference_order !== true ||
    displayOptions?.unknown_catalog_default_must_remain_visible_in_auto !== true
  ) {
    throw new Error('App GUI Codex model policy must prioritize known models and keep an unknown catalog default available in Auto');
  }
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
