export { appOwnedOfficialProfileRestoreAction } from './gui-product-contract-parts/actions.ts';
export { validateBrandedDeepLinkPolicy } from './gui-product-contract-parts/desktop.ts';
import { validateGuiContractBootstrap } from './gui-product-contract-parts/bootstrap.ts';
import { validateGuiContractStartupAndNavigation } from './gui-product-contract-parts/startup-navigation.ts';
import { validateGuiContractDeveloperProfileAndPageInventory } from './gui-product-contract-parts/page-inventory.ts';
import { validateGuiContractHomeAndCapabilities } from './gui-product-contract-parts/home-capabilities.ts';
import { validateGuiContractSettingsAccessAndAgents } from './gui-product-contract-parts/settings-access.ts';
import { validateGuiContractSettingsMaintenanceAndStorage } from './gui-product-contract-parts/settings-maintenance.ts';
import { validateGuiContractRuntimeProjections } from './gui-product-contract-parts/runtime.ts';

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
  validateGuiContractBootstrap(guiContract, releaseChannel, installExposurePolicy);
  validateGuiContractStartupAndNavigation(guiContract);
  validateGuiContractDeveloperProfileAndPageInventory(guiContract, releaseChannel);
  validateGuiContractHomeAndCapabilities(guiContract);
  validateGuiContractSettingsAccessAndAgents(guiContract);
  validateGuiContractSettingsMaintenanceAndStorage(guiContract);
  validateGuiContractRuntimeProjections(guiContract);
}
