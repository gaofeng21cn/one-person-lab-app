import {
  validateRefLevelFollowUpProjectionContract,
  validateStructuredResultPanelProjectionContract,
  validateTaskAwarenessProjectionContract,
  validateWorkflowSkillCandidateProjectionContract,
} from '../shared-contract-validators.ts';
import { validateRuntimeCockpitPreservationPolicy } from '../runtime-cockpit-product-validator.ts';

export function validateGuiContractRuntimeProjections(guiContract) {
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
