import { assertExpectedFields } from '../value-assertions.ts';
import type { HomePolicyOptions, ProductProfileLike } from './types.ts';
import type { HomeLike } from './model-display.ts';
import { assertCodexAutoModelPolicy } from './codex-policy.ts';

export function assertAppProductProfileGuiAuthority(
  profile: ProductProfileLike,
  label = 'App product profile',
): void {
  if (profile.gui?.authority !== 'app_repo_owned_product_truth') {
    throw new Error(`${label} GUI authority must be App-owned`);
  }
  if (profile.gui?.implementation_carrier !== 'opl-studio') {
    throw new Error(`${label} GUI implementation carrier must be opl-studio`);
  }
  if (
    profile.gui.appearance?.default_css_theme_id !== 'default-theme' ||
    profile.gui.appearance?.codex_theme_default_enabled !== false
  ) {
    throw new Error(`${label} GUI appearance must default to the default theme`);
  }
}

export function assertAppProductProfileHomeCodexPolicy(
  profile: ProductProfileLike,
  label = 'App product profile',
  options: HomePolicyOptions = {},
): void {
  const home = profile.gui?.home;
  assertHomeCodexFixedExecutorFields(profile, home, label);
  assertHomeCodexEnglishStatusLabel(profile, home, label, options);
  assertHomeCodexAutoSelectionPolicy(profile, home, label, options);
}

function assertHomeCodexFixedExecutorFields(
  profile: ProductProfileLike,
  home: HomeLike,
  label: string,
): void {
  assertExpectedFields(
    [
      { actual: home?.primary_input_surface, expected: 'single_card' },
      { actual: home?.nested_input_card_frames_allowed, expected: false },
      { actual: home?.codex_cli_fixed_executor, expected: true },
      { actual: home?.home_executor_selector_visible, expected: false },
      { actual: home?.codex_model_selector_visible, expected: true },
      { actual: home?.codex_model_list_visible, expected: true },
      { actual: home?.codex_model_policy, expected: 'codex_cli_latest_strongest_model_selector_visible' },
      { actual: home?.codex_model_auto_option_visible, expected: true },
      { actual: home?.codex_default_model, expected: profile.codex?.default_model },
      { actual: home?.codex_default_reasoning_effort, expected: profile.codex?.default_reasoning_effort },
      { actual: home?.codex_default_permission_mode, expected: 'full-access' },
      { actual: home?.permission_mode_selector_visible, expected: true },
      { actual: home?.conversation_backend_selector_visible, expected: false },
      { actual: home?.conversation_model_selector_visible, expected: true },
      { actual: home?.conversation_permission_mode_selector_visible, expected: true },
      {
        actual: home?.codex_home_model_status_label,
        expected: home?.codex_model_display_options?.visible_models?.find((model) => model.id === profile.codex?.default_model)?.label_zh,
      },
      {
        actual: home?.codex_precise_model_display_policy,
        expected: 'friendly_model_with_discoverable_model_and_reasoning_summary_rows',
      },
    ],
    `${label} GUI home must keep Codex CLI fixed while exposing App-owned model selectors`,
  );
}


function assertHomeCodexEnglishStatusLabel(
  profile: ProductProfileLike,
  home: HomeLike,
  label: string,
  options: HomePolicyOptions,
): void {
  const modelLabel = home?.codex_model_display_options?.visible_models?.find((model) => model.id === profile.codex?.default_model)?.label_en;
  if (options.requireEnglishStatusLabel && home?.codex_home_model_status_label_en !== modelLabel) {
    throw new Error(`${label} GUI home must expose the configured model's English status label without repeated reasoning`);
  }
}

function assertHomeCodexAutoSelectionPolicy(
  profile: ProductProfileLike,
  home: HomeLike,
  label: string,
  options: HomePolicyOptions,
): void {
  const autoSelection = home?.codex_auto_model_selection;
  assertExpectedFields(
    [
      { actual: autoSelection?.policy_source_ref, expected: 'contracts/app-product-profile.json#codex.auto_model_policy' },
      { actual: autoSelection?.user_can_override_model, expected: true },
      { actual: autoSelection?.user_can_override_reasoning_effort, expected: true },
      { actual: autoSelection?.user_can_restore_auto, expected: true },
    ],
    `${label} GUI home must expose the OPL Flow model projection and user override on the home path`,
  );
  if (options.requireSelectionPersistence && autoSelection?.selection_persists_into_conversation !== true) {
    throw new Error(`${label} GUI home Codex model selection must persist into conversation`);
  }
  assertCodexAutoModelPolicy(profile.codex?.auto_model_policy, profile, label);
}
