import { assertDeepEqualJson, assertIncludesAll, readJson } from '../assertions.ts';
import { assertFirstRunProgressModelShape, assertNonEmptyStringArray } from '../shared-contract-validators.ts';
import { productProfilePath } from '../validation-config.ts';

const productProfile = readJson(productProfilePath);
const expectedFirstRunProgressModel = productProfile.first_run?.progress_model;
const expectedFirstRunCoreItems = assertNonEmptyStringArray(
  productProfile.first_run?.ready_to_launch_gate?.required_core_items,
  'Product profile ready_to_launch required_core_items',
);
const expectedFirstConversation = productProfile.first_run?.first_conversation;
const expectedFirstConversationMustWaitFor = assertNonEmptyStringArray(
  expectedFirstConversation?.must_wait_for,
  'Product profile first conversation must_wait_for',
);
const expectedFirstConversationFailurePolicy = expectedFirstConversation?.failure_policy;
const expectedFullReadinessItems = (productProfile.first_run?.full_readiness_layers ?? [])
  .filter((item) => item !== 'core');
assertFirstRunProgressModelShape(expectedFirstRunProgressModel, 'Product profile first-run progress model');
function validateFirstRunUserPresentation(presentation) {
  if (presentation?.default_mode !== 'beginner_first') {
    throw new Error('Install exposure first-run presentation must be beginner_first');
  }
  if (presentation.skill_plugin_distinction_visible_by_default !== false) {
    throw new Error('Install exposure first-run presentation must hide skill/plugin distinction by default');
  }
  assertIncludesAll(
    presentation.primary_steps,
    expectedFirstRunCoreItems,
    'Install exposure first-run primary steps',
  );
  assertIncludesAll(
    presentation.secondary_steps,
    expectedFullReadinessItems,
    'Install exposure first-run secondary steps',
  );
  if (presentation.technical_detail_policy !== 'hidden_until_expanded_or_error') {
    throw new Error('Install exposure technical details must be hidden until expanded or error');
  }
}

function validateSetupFlowContract(setupFlow) {
  if (setupFlow?.source_command !== expectedFirstRunProgressModel.source_command) {
    throw new Error(`Install exposure setup flow must use ${expectedFirstRunProgressModel.source_command}`);
  }
  if (setupFlow?.source_path !== expectedFirstRunProgressModel.source_path) {
    throw new Error(`Install exposure setup flow must read ${expectedFirstRunProgressModel.source_path}`);
  }
  if (setupFlow?.truth_policy !== 'all_installers_and_renderers_derive_progress_from_the_shared_initialize_model') {
    throw new Error('Install exposure setup flow must forbid separate installer progress truth');
  }
  if (setupFlow.ready_to_launch_gate !== 'ready_to_launch') {
    throw new Error('Install exposure setup flow must use ready_to_launch gate');
  }
  assertIncludesAll(
    setupFlow.ready_to_launch_required_core_items,
    expectedFirstRunCoreItems,
    'Install exposure ready_to_launch core items',
  );
  assertIncludesAll(
    setupFlow.full_readiness_non_blocking_items,
    expectedFullReadinessItems,
    'Install exposure full readiness non-blocking items',
  );
  const firstConversation = setupFlow.first_conversation_readiness;
  if (
    firstConversation?.gate !== expectedFirstConversation.gate ||
    firstConversation?.source_command !== expectedFirstRunProgressModel.source_command ||
    firstConversation?.ready_to_launch_must_be_true !== false ||
    firstConversation?.unknown_readiness_policy !== expectedFirstConversation.unknown_readiness_policy ||
    firstConversation?.blocked_feedback !== expectedFirstConversation.blocked_feedback ||
    firstConversation?.failure_policy !== expectedFirstConversationFailurePolicy
  ) {
    throw new Error('Install exposure first conversation readiness must apply granular prerequisites before ACP warmup');
  }
  assertDeepEqualJson(
    firstConversation.required_before_plain_send,
    expectedFirstConversation.required_before_plain_send,
    'Install exposure plain send prerequisites',
  );
  assertDeepEqualJson(
    firstConversation.required_before_send_with_local_inputs,
    expectedFirstConversation.required_before_send_with_local_inputs,
    'Install exposure send with local inputs prerequisites',
  );
  assertDeepEqualJson(
    firstConversation.required_before_workspace_controls,
    expectedFirstConversation.required_before_workspace_controls,
    'Install exposure workspace control prerequisites',
  );
  assertIncludesAll(
    firstConversation.must_wait_for,
    expectedFirstConversationMustWaitFor,
    'Install exposure first conversation wait-for items',
  );
  assertIncludesAll(
    firstConversation.must_not_wait_for,
    expectedFullReadinessItems,
    'Install exposure first conversation non-blocking readiness items',
  );
}
export {
  expectedFirstRunProgressModel,
  validateFirstRunUserPresentation,
  validateSetupFlowContract,
};
