export { appOwnedOfficialProfileRestoreAction } from './gui-product-contract/actions.ts';
export { validateBrandedDeepLinkPolicy } from './gui-product-contract/desktop.ts';
import { validateRemoteCompanionGuiProjection } from './remote-companion-validator.ts';
import { validateScheduledTasksPageContract, validateScheduledTasksProductPolicy } from './scheduled-tasks-policy-validator.ts';
import { validateGuiFrameworkSurfaces } from './gui-framework-surfaces-validator.ts';
import { validateGuiProductHomeContract } from './gui-product-home-validator.ts';
import { validateSettingsControlPlaneBehavior } from './settings-control-plane-validator.ts';
import { validateCodexModelPolicy, validateVisualTokenBindings } from './gui-product-contract/model.ts';
import { validateDesktopTrayPolicy, validateDesktopApplicationIconPolicy, validateBrandedDeepLinkPolicy } from './gui-product-contract/desktop.ts';
import { validateGuiContractStartupAndNavigation } from './gui-product-contract/startup-navigation.ts';
import { validateGuiContractDeveloperProfileAndPageInventory } from './gui-product-contract/page-inventory.ts';
import { validateGuiContractHomeAndCapabilities } from './gui-product-contract/home-capabilities.ts';
import { validateGuiContractSettingsAccessAndAgents } from './gui-product-contract/settings-access.ts';
import { validateGuiContractSettingsMaintenanceAndStorage } from './gui-product-contract/settings-maintenance.ts';
import {
  validateRefLevelFollowUpProjectionContract,
  validateStructuredResultPanelProjectionContract,
  validateTaskAwarenessProjectionContract,
  validateWorkflowSkillCandidateProjectionContract,
} from './shared-contract-validators.ts';
import { validateRuntimeCockpitPreservationPolicy } from './runtime-cockpit-product-validator.ts';

export function validateAppGuiProductContract(guiContract, releaseChannel, installExposurePolicy) {
  const collaboration = guiContract.team_and_bot;
  if (collaboration?.interaction_owner !== 'official_DSH_complete_web_application'
    || collaboration.interaction?.OPL_team_management_page !== false
    || collaboration.interaction?.OPL_role_template_CRUD !== false
    || collaboration?.coordination_owner !== 'official_DSH_subagent_tree_inbox_and_agent_team_task_board'
    || collaboration.execution_owner !== 'existing_persistent_Codex_App_Server'
    || collaboration.superagent?.execution_owner !== 'existing_persistent_Codex_App_Server'
    || collaboration.superagent?.separate_provider_credentials_required !== false
    || collaboration.superagent?.model_provider_onboarding !== false
    || collaboration.superagent?.initial_panel !== 'official_superagent_management_overview'
    || collaboration.superagent?.team_dependency !== false
    || collaboration.superagent?.start_stop_preserve_settings_and_tickets !== true) {
    throw new Error('Team/Bot requires official DSH coordination, existing Codex execution and an independent persistent Superagent profile');
  }
  if ('agent_package_activation_policy' in guiContract) {
    throw new Error('App GUI contract must not restore private Package activation authority');
  }
  validateBrandedDeepLinkPolicy(guiContract.branded_deep_link_policy);
  validateScheduledTasksProductPolicy(guiContract.scheduled_tasks_policy);
  validateScheduledTasksPageContract(guiContract.pages?.scheduled_tasks, guiContract.scheduled_tasks_policy);
  validateGuiProductHomeContract(guiContract);
  validateCodexModelPolicy(guiContract);
  validateVisualTokenBindings(guiContract);
  validateGuiFrameworkSurfaces(guiContract, releaseChannel, installExposurePolicy);
  validateSettingsControlPlaneBehavior({ guiContract });
  validateDesktopTrayPolicy(guiContract);
  validateDesktopApplicationIconPolicy(guiContract);

  validateRemoteCompanionGuiProjection(guiContract.remote_companion);

  validateGuiContractStartupAndNavigation(guiContract);
  validateGuiContractDeveloperProfileAndPageInventory(guiContract, releaseChannel);
  validateGuiContractHomeAndCapabilities(guiContract);
  validateGuiContractSettingsAccessAndAgents(guiContract);
  validateGuiContractSettingsMaintenanceAndStorage(guiContract, releaseChannel);

  const pages = guiContract.pages ?? {};
  validateRuntimeCockpitPreservationPolicy(
    guiContract.interaction_baseline?.feature_preservation_policy?.runtime_preservation_gate,
    'App GUI Runtime cockpit preservation gate',
  );
  const runtimeStatus = pages.runtime_status;
  if (
    runtimeStatus &&
    (runtimeStatus.route_classification !== 'core_dynamic_agent_runtime' ||
      runtimeStatus.default_product_requirement !== true ||
      runtimeStatus.default_release_gate !== true ||
      runtimeStatus.adopted_shell_requirement !== true ||
      runtimeStatus.explicit_validation_command !== 'npm run validate:runtime-route')
  ) {
    throw new Error('Core Runtime route must remain required by the default release gate and adopted shells');
  }
  validateTaskAwarenessProjectionContract(
    guiContract.framework_surfaces?.task_awareness,
    'App GUI framework task awareness',
  );
  validateStructuredResultPanelProjectionContract(
    guiContract.framework_surfaces?.structured_result_panel,
    'App GUI framework structured result panel',
  );
  validateRefLevelFollowUpProjectionContract(
    guiContract.framework_surfaces?.ref_level_follow_up,
    'App GUI framework ref-level follow-up',
  );
  validateWorkflowSkillCandidateProjectionContract(
    guiContract.framework_surfaces?.workflow_skill_candidate,
    'App GUI framework workflow/skill candidate',
  );
  if ('docker_webui' in guiContract) {
    throw new Error('App GUI contract must not include withdrawn Docker/WebUI username, title, logo, or branding requirements');
  }
}
