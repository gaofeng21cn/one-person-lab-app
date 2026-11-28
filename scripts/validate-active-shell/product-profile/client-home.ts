import { assertDeepEqualJson } from '../assertions.ts';
import {
  assertAppProductProfileCodexModelDisplayOptions,
  assertAppProductProfileGuiAuthority,
  assertAppProductProfileGuiInteractionBaseline,
  assertAppProductProfileHomeCodexPolicy,
  assertAppProductProfileSettingsVisualSystem,
  assertHomeComposerDynamicAuthority,
  assertHomeComposerStateContract,
} from '../../app-product-profile-shared-validators.ts';
import { validateOplFlowContext } from '../shared-contract-validators.ts';
import { assertDefaultCodexSessionProfile } from '../../app-product-profile-default-session.ts';
import {
  validateProductProfileCodexSkills,
  validateProductProfileSettings,
  validateInstallUpdateTaxonomy,
  validateOrdinaryCapabilitySelectorPolicy,
} from './package-settings.ts';

export function validateProductProfileCodexDefaults(profile, guiContract, installExposurePolicy, releaseChannel) {
  if (
    profile.codex?.app_runtime_home?.default_path !== '~/.codex' ||
    profile.codex.app_runtime_home.override_env !== 'CODEX_HOME' ||
    profile.codex.app_runtime_home.resolution_policy !== 'preserve_existing_env_else_codex_system_default' ||
    profile.codex.app_runtime_home.app_env_injection !== 'forbidden' ||
    profile.codex.app_runtime_home.startup_and_recheck_mutation !== 'forbidden' ||
    profile.codex.app_runtime_home.explicit_model_access_mutation !==
      'framework_action_atomic_merge_with_backup_and_restore'
  ) {
    throw new Error('Product profile must preserve the system Codex home without App environment injection');
  }
  if (
    profile.codex.auto_model_policy?.authority !== 'one-person-lab-app' ||
    'recommendation_authority' in profile.codex.auto_model_policy ||
    'policy_source_ref' in profile.codex.auto_model_policy ||
    'projection_surface_kind' in profile.codex.auto_model_policy ||
    'projection_presence_rule' in profile.codex.auto_model_policy ||
    JSON.stringify(profile.codex.auto_model_policy.resolution_precedence) !== JSON.stringify([
      'explicit_user_selection',
      'app_default_then_catalog_compatibility',
      'app_fallback_when_catalog_unavailable',
    ]) ||
    profile.codex.auto_model_policy.app_fallback_role !==
      'configured_default_when_catalog_metadata_is_unavailable' ||
    profile.codex.auto_model_policy.configured_default_role !==
      'app_default_with_catalog_compatibility_fallback'
  ) {
    throw Object.assign(new Error('Product profile model policy must stay App-owned with user, App default/compatible catalog, then App catalog-unavailable fallback precedence'), { code: 'app_model_policy_precedence' });
  }
  validateOplFlowContext(profile.codex?.opl_flow_context, 'Product profile OPL Flow Context');
  const additionalInstructions = profile.codex?.new_conversation_additional_instructions;
  if (
    additionalInstructions?.content_owner !== 'user' ||
    additionalInstructions.delivery !== 'new_conversation_additional_instructions_only' ||
    additionalInstructions.storage_key !== 'codex.oplAppSessionContextAdditional' ||
    additionalInstructions.storage_key_status !== 'legacy_compatibility_storage_key' ||
    additionalInstructions.generated_base_context_allowed !== false ||
    additionalInstructions.agent_route_fallback_allowed !== false ||
    additionalInstructions.empty_value_policy !== 'inject_nothing' ||
    additionalInstructions.reset_behavior !== 'clear_additional_instructions' ||
    additionalInstructions.effect !== 'next_new_conversation'
  ) {
    throw new Error('Product profile must limit new-conversation additions to optional user-authored text');
  }
  for (const field of [
    'opl_app_session_context',
    'default_visible_skills',
    'skill_priority',
    'session_context_lines',
    'session_context_i18n',
  ]) {
    if (field in profile.codex) {
      throw new Error(`Product profile must not restore legacy Codex authority codex.${field}`);
    }
  }
  assertDefaultCodexSessionProfile(profile, { label: 'product profile', requireLiteralDefaults: true });
  assertAppProductProfileGuiAuthority(profile, 'Product profile');
  assertAppProductProfileGuiInteractionBaseline(profile, 'Product profile');
  assertAppProductProfileSettingsVisualSystem(profile, 'Product profile');
  assertAppProductProfileHomeCodexPolicy(profile, 'Product profile');
  assertAppProductProfileCodexModelDisplayOptions(profile, 'Product profile');
  const homeComposer = profile.gui?.home?.home_composer_state_contract;
  assertHomeComposerDynamicAuthority(homeComposer, 'Product profile Home composer state contract');
  assertHomeComposerStateContract(homeComposer, 'Product profile Home composer state contract');
  assertDeepEqualJson(profile.gui?.ui_locale_policy, guiContract.ui_locale_policy, 'Product profile locale policy projection');
  validateHomeAssistantDefaults(profile, guiContract);
  validateProductProfileSettings(profile);
  validateProductProfileCodexSkills(profile);
  validateInstallUpdateTaxonomy(profile, installExposurePolicy, releaseChannel);
  validateOrdinaryCapabilitySelectorPolicy(profile, guiContract);
}

function validateHomeAssistantDefaults(profile, guiContract) {
  const homeLayout = profile.gui.home.home_layout;
  const { runtime_notice_policy_ref, ...projectedHomeLayout } = guiContract.home_layout;
  assertDeepEqualJson(homeLayout, projectedHomeLayout, 'Product profile Home layout projection');
  if (
    profile.gui.appearance?.visual_source_cohort_ref !== 'contracts/app-gui-visual-source-cohort.json' ||
    profile.gui.appearance?.visual_reference_cohort_ref !== 'contracts/app-gui-visual-reference-cohort.json' ||
    JSON.stringify(profile.gui.appearance?.shared_visual_primitives) !==
      JSON.stringify(['composer', 'rail_row', 'icon_button', 'menu', 'settings_row'])
  ) {
    throw new Error('Product profile appearance must bind the pinned DSH visual source cohort and shared primitives');
  }
  assertDeepEqualJson(
    profile.gui.home.utility_icon_policy,
    guiContract.utility_icon_policy,
    'Product profile OPL utility icons projection',
  );
  if ('home_agent_shortcuts' in profile.gui.home) {
    throw new Error('Product profile must not restore an App-owned Home shortcut list');
  }
  for (const field of [
    'default_assistants',
    'non_default_assistants',
    'professional_agent_packages',
    'professional_agent_packages_metadata_policy',
  ]) {
    if (field in profile.gui) {
      throw new Error(`Product profile must not restore fixed Agent/Home presentation field gui.${field}`);
    }
  }
  if ('home_purpose_entries' in profile.gui.home) {
    throw new Error('Product profile must not restore fixed Agent/Home presentation field gui.home.home_purpose_entries');
  }
  if (
    homeLayout?.home_presentation_source_ref !==
    'app_state.agent_packages.directory.entries + app_state.agent_packages.status_index.home_shortcut_preferences[]'
  ) {
    throw new Error('Product profile Home presentation must come from the dynamic Agent directory and shortcut compatibility metadata');
  }
  for (const retiredModel of [
    'gpt-5.3-codex-spark',
    'gpt-5.3-codex',
    'gpt-5.2-codex',
    'gpt-5.1-codex-max',
    'gpt-5.1-codex-mini',
  ]) {
    if (!profile.gui.home?.retired_codex_models_must_not_be_exposed?.includes(retiredModel)) {
      throw new Error(`Product profile GUI home must ban retired Codex model ${retiredModel}`);
    }
  }
}
