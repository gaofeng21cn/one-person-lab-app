import { appOwnedOplStandardAgentMembershipPolicy } from '../validate-active-shell/app-contract-constants.ts';

export const expectedHomeComposerStateContract = {
  contract_id: 'opl_home_composer_state.v1',
  executor: 'codex',
  shortcut_package_membership_source_ref:
    'app_state.agent_packages.directory.entries',
  opl_standard_agent_membership_policy: appOwnedOplStandardAgentMembershipPolicy,
  shortcut_preference_source_ref:
    'app_state.agent_packages.status_index.home_shortcut_preferences[]',
  shortcut_availability_source_ref:
    'app_state.agent_packages.directory.entries + app_state.agent_packages.status_index.packages[].presence',
  unknown_standard_agent_allowed: false,
  unknown_first_party_opl_standard_agent_allowed: true,
  viewports: ['desktop', 'mobile'],
  availability_states: ['available', 'unavailable'],
  invariants: {
    model_reasoning_visible: true,
    permission_access_visible: true,
    executor_selector_visible: false,
    active_shortcut_changes_executor: false,
    active_shortcut_requires_explicit_session_binding: true,
    active_shortcut_must_emit_domain_instruction: true,
    default_visibility_governs_execution: false,
    single_home_root: true,
    single_composer_shell: true,
    single_footer_account_settings_entry: true,
  },
  semantic_probe: {
    root_test_id: 'opl-guid-entry',
    instance_counts: {
      'opl-guid-entry': 1,
      'guid-input-card-shell': 1,
    },
    instance_count_groups: {
      footer_account_or_settings: {
        test_ids: ['sider-footer-account', 'sider-footer-settings'],
        total: 1,
      },
    },
    state_attributes: {
      executor: 'data-opl-composer-executor',
      active_shortcut_id: 'data-opl-active-shortcut',
      model_reasoning_visible: 'data-opl-model-reasoning-visible',
      permission_access_visible: 'data-opl-permission-access-visible',
      executor_selector_visible: 'data-opl-executor-selector-visible',
    },
    desktop_required_controls: ['guid-model-selector', 'agent-mode-selector-*'],
    mobile_required_controls: [
      'mobile-action-sheet-model',
      'mobile-action-sheet-reasoning',
      'mobile-action-sheet-permission',
    ],
    forbidden_controls: ['agent-pill-*'],
    failure_field: 'missing_controls',
  },
};

export const expectedHomeComposerDynamicAuthority = {
  shortcut_package_membership_source_ref:
    expectedHomeComposerStateContract.shortcut_package_membership_source_ref,
  opl_standard_agent_membership_policy:
    expectedHomeComposerStateContract.opl_standard_agent_membership_policy,
  shortcut_preference_source_ref:
    expectedHomeComposerStateContract.shortcut_preference_source_ref,
  shortcut_availability_source_ref:
    expectedHomeComposerStateContract.shortcut_availability_source_ref,
  unknown_standard_agent_allowed:
    expectedHomeComposerStateContract.unknown_standard_agent_allowed,
  unknown_first_party_opl_standard_agent_allowed:
    expectedHomeComposerStateContract.unknown_first_party_opl_standard_agent_allowed,
} as const;

export function assertHomeComposerDynamicAuthority(value: unknown, label: string): void {
  const {
    shortcut_package_membership_source_ref,
    opl_standard_agent_membership_policy,
    shortcut_preference_source_ref,
    shortcut_availability_source_ref,
    unknown_standard_agent_allowed,
    unknown_first_party_opl_standard_agent_allowed,
  } = (value ?? {}) as Record<string, unknown>;
  const actual = {
    shortcut_package_membership_source_ref,
    opl_standard_agent_membership_policy,
    shortcut_preference_source_ref,
    shortcut_availability_source_ref,
    unknown_standard_agent_allowed,
    unknown_first_party_opl_standard_agent_allowed,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expectedHomeComposerDynamicAuthority)) {
    throw new Error(`${label} dynamic authority must be ${JSON.stringify(expectedHomeComposerDynamicAuthority)}; got ${JSON.stringify(actual)}`);
  }
}

export function assertHomeComposerStateContract(value: unknown, label: string): void {
  if (JSON.stringify(value) !== JSON.stringify(expectedHomeComposerStateContract)) {
    throw new Error(`${label} must preserve the fixed Codex executor controls for every Home shortcut state`);
  }
}
