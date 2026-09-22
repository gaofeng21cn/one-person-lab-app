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
  validateGuiContractBootstrap(guiContract, releaseChannel, installExposurePolicy);
  validateGuiContractStartupAndNavigation(guiContract);
  validateGuiContractDeveloperProfileAndPageInventory(guiContract, releaseChannel);
  validateGuiContractHomeAndCapabilities(guiContract);
  validateGuiContractSettingsAccessAndAgents(guiContract);
  validateGuiContractSettingsMaintenanceAndStorage(guiContract);
  validateGuiContractRuntimeProjections(guiContract);
}
