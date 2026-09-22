export const forbiddenExternalFirstPartyClaimPattern =
  '^\\s*[Ff][Ii][Rr][Ss][Tt][^A-Za-z0-9]*[Pp][Aa][Rr][Tt][Yy]';

export function isExternalFirstPartyClaim(value: unknown): boolean {
  return typeof value === 'string' && new RegExp(forbiddenExternalFirstPartyClaimPattern).test(value);
}

export const appOwnedAgentReferenceAdmissionPolicy = {
  active_agent_package_cardinality: 'zero_or_one',
  selection_authority:
    'home_starter_new_session_capability_palette_explicit_capability_route_or_explicit_pre_send_at_mention_agent_selection',
  at_mention_agent_selection_allowed: true,
  at_mention_semantics:
    'explicit_new_session_agent_selection_before_first_send_plain_text_references_remain_prompt_context',
  at_mention_requires_user_selection: true,
  plain_text_agent_reference_changes_active_package: false,
  multiple_agent_reference_policy:
    'latest_explicit_pre_send_at_mention_selection_sets_the_new_session_agent_plain_text_references_remain_prompt_context',
  cross_agent_semantic_admission_owner: 'target_primary_skill_over_complete_current_user_request',
  deterministic_cross_agent_routing_allowed: false,
  oma_engineering_admission: 'explicit_target_agent_and_explicit_agent_engineering_objective_required',
  deliverable_failure_policy: 'repair_current_deliverable_never_authorize_agent_engineering',
  existing_conversation_rebinding_allowed: false,
} as const;

export function assertAgentReferenceAdmissionPolicy(value: unknown, label: string): void {
  if (JSON.stringify(value) !== JSON.stringify(appOwnedAgentReferenceAdmissionPolicy)) {
    throw new Error(`${label} must preserve the new-session-only explicit Agent selection contract`);
  }
}
