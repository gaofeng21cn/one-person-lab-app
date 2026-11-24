import { validateRemoteCompanionGuiProjection } from '../remote-companion-validator.ts';
import { validateScheduledTasksPageContract, validateScheduledTasksProductPolicy } from '../scheduled-tasks-policy-validator.ts';
import { validateGuiFrameworkSurfaces } from '../gui-framework-surfaces-validator.ts';
import { validateGuiProductHomeContract } from '../gui-product-home-validator.ts';
import { validateSettingsControlPlaneBehavior } from '../settings-control-plane-validator.ts';
import { validateCodexModelPolicy, validateVisualTokenBindings } from './model.ts';
import { validateDesktopTrayPolicy, validateDesktopApplicationIconPolicy, validateBrandedDeepLinkPolicy } from './desktop.ts';

export function validateGuiContractBootstrap(guiContract, releaseChannel, installExposurePolicy) {
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
}
