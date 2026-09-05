import { assertExpectedFields, assertStringArrayIncludes } from './value-assertions.ts';
import {
  appOwnedActiveAionuiPrimaryNavigation,
  appOwnedCodexSubagentActivityPolicy,
  appOwnedExplicitSessionInputPolicy,
  appOwnedOplStandardAgentMembershipPolicy,
  appOwnedRightContextInspectorForbiddenOwners,
  appOwnedRightContextInspectorPolicy,
  appOwnedSendFailureInputPolicy,
  appOwnedSessionWorkspaceModel,
  appOwnedTranscriptExport,
  appOwnedUnifiedContextMenu,
} from './validate-active-shell/app-contract-constants.ts';

export { appOwnedOplStandardAgentMembershipPolicy };

type ProductProfileLike = {
  schema_version?: unknown;
  codex?: {
    default_model?: unknown;
    default_reasoning_effort?: unknown;
    auto_model_policy?: Record<string, unknown>;
  };
  gui?: {
    authority?: unknown;
    implementation_carrier?: unknown;
    appearance?: {
      default_css_theme_id?: unknown;
      codex_theme_default_enabled?: unknown;
    };
    home?: Record<string, unknown> & {
      codex_auto_model_selection?: Record<string, unknown>;
      codex_model_display_options?: Record<string, unknown> & {
        auto_option?: Record<string, unknown>;
        reasoning_labels?: Record<string, { zh?: unknown; en?: unknown }>;
        visible_models?: Array<Record<string, unknown>>;
      };
    };
    ordinary_conversation?: Record<string, unknown>;
    right_context_inspector?: Record<string, unknown>;
  };
  settings?: {
    control_plane?: {
      experience_contract?: {
        visual_system?: Record<string, unknown>;
      };
    };
  };
};

type HomePolicyOptions = {
  requireEnglishStatusLabel?: boolean;
  requireSelectionPersistence?: boolean;
};

type ModelDisplayOptions = {
  requireAutoIdAndDescriptions?: boolean;
};

type OfficialProfileLike = {
  profile_id?: unknown;
  authority?: unknown;
  additional_official_profiles_allowed?: unknown;
  user_composed_profiles_allowed?: unknown;
  desired_root_package_ids?: unknown;
  apply_on?: unknown;
  never_apply_on?: unknown;
  user_removal_policy?: {
    explicit_uninstall_is_persistent_preference?: unknown;
    reinstall_before_explicit_restore_allowed?: unknown;
  };
  composition_policy?: {
    required_dependency_resolution?: unknown;
    optional_dependency_absence_blocks?: unknown;
    composition_gate?: unknown;
    forbidden_composition_or_readiness_gates?: unknown;
  };
  distribution_forms?: {
    standard?: {
      desired_roots_source?: unknown;
      offline_seed?: unknown;
    };
    full?: {
      desired_roots_source?: unknown;
      offline_seed?: unknown;
    };
    same_desired_roots_required?: unknown;
    full_difference?: unknown;
    full_additional_desired_roots_allowed?: unknown;
  };
  package_currentness_policy?: {
    published_current_stable_authority?: unknown;
    installed_callable_authority?: unknown;
    app_carrier_authority?: unknown;
    app_release_authority?: unknown;
    shared_release_set_ordinary_update_authority?: unknown;
  };
};

type OfficialProfileValidationOptions = {
  fail?: (message: string) => never;
};

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

export function assertHomeComposerStateContract(value: unknown, label: string): void {
  if (JSON.stringify(value) !== JSON.stringify(expectedHomeComposerStateContract)) {
    throw new Error(`${label} must preserve the fixed Codex executor controls for every Home shortcut state`);
  }
}
const expectedCodexVisibleModels = [
  { id: 'gpt-6-astra', label_zh: '6 Astra', label_en: '6 Astra' },
  { id: 'gpt-5.6-sol', label_zh: '5.6 Sol', label_en: '5.6 Sol' },
  { id: 'gpt-5.6-terra', label_zh: '5.6 Terra', label_en: '5.6 Terra' },
  { id: 'gpt-5.6-luna', label_zh: '5.6 Luna', label_en: '5.6 Luna' },
  { id: 'gpt-5.5', label_zh: '5.5', label_en: '5.5' },
  { id: 'gpt-5.4', label_zh: '5.4', label_en: '5.4' },
  { id: 'gpt-5.4-mini', label_zh: '5.4 Mini', label_en: '5.4 Mini' },
  { id: 'gpt-5.2', label_zh: '5.2', label_en: '5.2' },
];
const expectedReasoningLabels = {
  low: { zh: '低', en: 'Low' },
  medium: { zh: '中', en: 'Medium' },
  high: { zh: '高', en: 'High' },
  xhigh: { zh: '超高', en: 'Extra high' },
  max: { zh: '最高', en: 'Maximum' },
  ultra: { zh: '极高', en: 'Ultra' },
};

type GuiLike = NonNullable<ProductProfileLike['gui']>;
type HomeLike = GuiLike['home'];
type CodexModelDisplayOptionsLike = NonNullable<NonNullable<HomeLike>['codex_model_display_options']>;
function assertExactStringArray(actual: unknown, expected: string[], label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}`);
  }
}

export function assertCapabilityReferenceListShape(value: unknown, label: string): asserts value is string[] {
  if (
    !Array.isArray(value)
    || !value.every((entry) => typeof entry === 'string' && entry.trim())
    || new Set(value).size !== value.length
  ) {
    throw new Error(`${label} must be a unique string array`);
  }
}

export function assertOfficialProfileShape(
  value: unknown,
  label: string,
  options: OfficialProfileValidationOptions = {},
): asserts value is OfficialProfileLike & { desired_root_package_ids: string[] } {
  const fail = options.fail ?? ((message: string): never => {
    throw new Error(message);
  });
  const officialProfile = value as OfficialProfileLike | undefined;
  if (
    officialProfile?.profile_id !== 'opl-official'
    || officialProfile?.authority !== 'one-person-lab-app'
    || officialProfile?.additional_official_profiles_allowed !== false
    || officialProfile?.user_composed_profiles_allowed !== true
    || officialProfile?.user_removal_policy?.explicit_uninstall_is_persistent_preference !== true
    || officialProfile?.user_removal_policy?.reinstall_before_explicit_restore_allowed !== false
    || officialProfile?.composition_policy?.required_dependency_resolution
      !== 'expand_required_package_and_capability_identities_by_presence'
    || officialProfile?.composition_policy?.optional_dependency_absence_blocks !== false
    || officialProfile?.composition_policy?.composition_gate !== 'identity_presence_only'
    || officialProfile?.distribution_forms?.standard?.desired_roots_source
      !== 'official_profile.desired_root_package_ids'
    || officialProfile?.distribution_forms?.standard?.offline_seed !== false
    || officialProfile?.distribution_forms?.full?.desired_roots_source
      !== 'official_profile.desired_root_package_ids'
    || officialProfile?.distribution_forms?.full?.offline_seed !== true
    || officialProfile?.distribution_forms?.same_desired_roots_required !== true
    || officialProfile?.distribution_forms?.full_difference !== 'offline_seed_only'
    || officialProfile?.distribution_forms?.full_additional_desired_roots_allowed !== false
    || officialProfile?.package_currentness_policy?.published_current_stable_authority
      !== 'package_owner_declared_publication_or_configured_native_carrier'
    || officialProfile?.package_currentness_policy?.installed_callable_authority
      !== 'framework_fresh_aggregation_of_configured_carrier_readback'
    || officialProfile?.package_currentness_policy?.app_carrier_authority !== false
    || officialProfile?.package_currentness_policy?.app_release_authority !== false
    || officialProfile?.package_currentness_policy?.shared_release_set_ordinary_update_authority !== false
  ) {
    fail(`${label} must be singular, presence-only, carrier-neutral, and shared by Standard and Full`);
  }

  const desiredRoots = officialProfile.desired_root_package_ids;
  if (
    !Array.isArray(desiredRoots)
    || desiredRoots.length === 0
    || desiredRoots.some((packageId) => typeof packageId !== 'string' || !packageId.trim())
  ) {
    fail(`${label} desired roots must be a non-empty string array`);
  }
  if (new Set(desiredRoots).size !== desiredRoots.length) {
    fail(`${label} desired roots must be unique`);
  }

  const exactArrays = [
    {
      actual: officialProfile.apply_on,
      expected: ['first_install', 'explicit_restore'],
      field: 'apply_on',
    },
    {
      actual: officialProfile.never_apply_on,
      expected: ['app_startup', 'silent_package_update', 'app_update'],
      field: 'never_apply_on',
    },
    {
      actual: officialProfile.composition_policy?.forbidden_composition_or_readiness_gates,
      expected: [
        'version_range',
        'abi',
        'lock',
        'payload',
        'digest',
        'release_set',
        'fixed_cohort',
        'global_product_readiness',
      ],
      field: 'forbidden gates',
    },
  ];
  for (const { actual, expected, field } of exactArrays) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail(`${label} ${field} must equal ${JSON.stringify(expected)}`);
    }
  }
}

export function assertLocalizedUxOverrideShape(value: unknown, label: string): void {
  const localized = value as Record<string, unknown> | undefined;
  if (
    !localized
    || typeof localized !== 'object'
    || Array.isArray(localized)
    || typeof localized['zh-CN'] !== 'string'
    || !localized['zh-CN'].trim()
    || typeof localized['en-US'] !== 'string'
    || !localized['en-US'].trim()
  ) {
    throw new Error(`${label} must declare non-empty zh-CN and en-US text`);
  }
}

export function assertAppProductProfileGuiAuthority(
  profile: ProductProfileLike,
  label = 'App product profile',
): void {
  if (profile.gui?.authority !== 'app_repo_owned_product_truth') {
    throw new Error(`${label} GUI authority must be App-owned`);
  }
  if (profile.gui?.implementation_carrier !== 'opl-aion-shell') {
    throw new Error(`${label} GUI implementation carrier must be opl-aion-shell`);
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

export function assertAppProductProfileGuiInteractionBaseline(
  profile: ProductProfileLike,
  label = 'App product profile',
): void {
  if (profile.schema_version !== 2) {
    throw new Error(`${label} schema_version must be 2`);
  }
  const homeLayout = profile.gui?.home?.home_layout as Record<string, unknown> | undefined;
  const conversation = profile.gui?.ordinary_conversation;
  const inspector = profile.gui?.right_context_inspector;
  assertExpectedFields(
    [
      { actual: homeLayout?.composer_position, expected: 'floating_bottom_with_safe_inset' },
      { actual: homeLayout?.desktop_composer_max_width_px, expected: 736 },
      { actual: homeLayout?.desktop_composer_min_height_px, expected: 98 },
      { actual: homeLayout?.desktop_composer_corner_radius_px, expected: 22 },
      { actual: homeLayout?.desktop_context_bar_height_px, expected: 52 },
      { actual: homeLayout?.desktop_context_bar_overlap_px, expected: 13 },
      { actual: homeLayout?.desktop_context_bar_horizontal_inset_px, expected: 12 },
      { actual: homeLayout?.workspace_selector_visible, expected: true },
      {
        actual: homeLayout?.workspace_selector_entry,
        expected: 'home.new_session_context_bar',
      },
      { actual: homeLayout?.unselected_workspace_control_visible, expected: true },
      {
        actual: homeLayout?.unselected_workspace_control_policy,
        expected: 'localized_choose_project_directory_action_not_projectless_status_placeholder',
      },
      {
        actual: homeLayout?.selected_working_directory_visual_policy,
        expected: 'independent_new_session_context_bar_control_with_selected_directory_and_clear_action',
      },
      { actual: homeLayout?.workspace_session_rail_default_state, expected: 'visible_wide_drawer_narrow' },
      { actual: homeLayout?.right_context_inspector_default_state, expected: 'collapsed' },
      {
        actual: conversation?.entry_source,
        expected: 'home_starter_workspace_initialized_or_projectless_new_session',
      },
      { actual: conversation?.composer_position, expected: 'floating_bottom_with_safe_inset' },
      { actual: conversation?.permission_mode_selector_visible, expected: true },
      {
        actual: conversation?.composer_placeholder_policy,
        expected: 'opl_owned_localized_task_prompt_without_backend_name_interpolation',
      },
      { actual: inspector?.default_third_column_visible, expected: false },
      { actual: inspector?.runtime_duplicate_allowed, expected: false },
      { actual: inspector?.equal_weight_tool_taxonomy_allowed, expected: false },
    ],
    `${label} GUI interaction profile must match the Codex baseline`,
  );
  if (
    JSON.stringify(homeLayout?.active_aionui_primary_navigation) !==
    JSON.stringify(appOwnedActiveAionuiPrimaryNavigation)
  ) {
    throw new Error(
      `${label} GUI Home must keep Runtime status in the active AionUI primary navigation without expanding Native or release gates`,
    );
  }
  assertExactStringArray(
    conversation?.composer_bottom_action_row,
    ['unified_context_menu', 'permission_access_mode', 'model_reasoning', 'send_stop'],
    `${label} GUI composer bottom action row`,
  );
  assertExactStringArray(
    conversation?.composer_context_strip,
    ['active_capability'],
    `${label} GUI composer persistent context`,
  );
  assertExactStringArray(
    conversation?.composer_send_scoped_inputs,
    ['attachments'],
    `${label} GUI composer send-scoped inputs`,
  );
  if (
    JSON.stringify(conversation?.send_failure_input_policy) !==
    JSON.stringify(appOwnedSendFailureInputPolicy)
  ) {
    throw new Error(
      `${label} GUI conversation must preserve prompt and attachments across creation, initial-send, and in-conversation send failures`,
    );
  }
  assertExactStringArray(
    conversation?.composer_forbidden_persistent_context,
    ['project', 'workspace', 'locality', 'branch', 'attachments', 'workspace_context_refs'],
    `${label} GUI composer forbidden persistent context`,
  );
  if (
    JSON.stringify(conversation?.session_workspace_model) !== JSON.stringify(appOwnedSessionWorkspaceModel) ||
    JSON.stringify(conversation?.explicit_session_input_policy) !== JSON.stringify(appOwnedExplicitSessionInputPolicy) ||
    'project_context_inputs' in (conversation ?? {}) ||
    'projectless_input_policy' in (conversation ?? {})
  ) {
    throw new Error(`${label} GUI conversation must keep session identity primary and accept only explicit current-session inputs`);
  }
  if (
    JSON.stringify(conversation?.codex_subagent_activity) !==
    JSON.stringify(appOwnedCodexSubagentActivityPolicy)
  ) {
    throw new Error(`${label} GUI Codex subagent activity must remain a read-only projection without private orchestration`);
  }
  if (
    JSON.stringify(conversation?.transcript_export) !== JSON.stringify(appOwnedTranscriptExport)
  ) {
    throw new Error(`${label} GUI transcript export must remain shareable transcript only`);
  }
  if (
    JSON.stringify(
      Object.fromEntries(
        Object.entries(inspector ?? {}).filter(([key]) => key !== 'must_not_own'),
      ),
    ) !== JSON.stringify(appOwnedRightContextInspectorPolicy)
  ) {
    throw new Error(`${label} GUI advanced workspace surfaces must match the 41301 policy`);
  }
  for (const legacyField of ['tabs', 'primary_tools', 'secondary_sections']) {
    if (legacyField in (inspector ?? {})) {
      throw new Error(`${label} GUI must not restore legacy inspector taxonomy field ${legacyField}`);
    }
  }
  assertExactStringArray(
    inspector?.must_not_own,
    appOwnedRightContextInspectorForbiddenOwners,
    `${label} GUI advanced workspace forbidden owners`,
  );
  const mobileActionSheet = conversation?.mobile_action_sheet as Record<string, unknown> | undefined;
  assertExactStringArray(
    mobileActionSheet?.allowed_actions,
    ['unified_context_menu', 'permission_access_mode', 'model_reasoning', 'active_capability'],
    `${label} GUI mobile action sheet allowed actions`,
  );
  assertExactStringArray(
    mobileActionSheet?.forbidden_actions,
    ['backend', 'provider', 'team', 'raw_mcp', 'arbitrary_skills'],
    `${label} GUI mobile action sheet forbidden actions`,
  );
  if (mobileActionSheet?.send_stop_location !== 'composer_primary_action_outside_sheet') {
    throw new Error(`${label} GUI mobile send/stop must remain the composer primary action`);
  }
  if (JSON.stringify(conversation?.unified_context_menu) !== JSON.stringify(appOwnedUnifiedContextMenu)) {
    throw new Error(`${label} GUI unified context menu must expose only real App-authorized context actions`);
  }
}

export function assertAppProductProfileSettingsVisualSystem(
  profile: ProductProfileLike,
  label = 'App product profile',
): void {
  const visualSystem = profile.settings?.control_plane?.experience_contract?.visual_system;
  assertExpectedFields(
    [
      { actual: visualSystem?.style, expected: 'codex_quiet_control_center_with_opl_information_architecture' },
      { actual: visualSystem?.style_exclusion, expected: 'multi_hue_card_dashboard' },
      {
        actual: visualSystem?.card_policy,
        expected: 'unframed_sections_with_bounded_groups_only_for_repeated_entities_or_confirmation',
      },
      { actual: visualSystem?.nested_cards_allowed, expected: false },
      { actual: visualSystem?.page_wide_list_wall_allowed, expected: false },
      { actual: visualSystem?.page_sections_as_floating_cards_allowed, expected: false },
      { actual: visualSystem?.footer_layout, expected: 'compact' },
      {
        actual: visualSystem?.footer_account_entry_policy,
        expected:
          'show_gateway_display_name_when_connected_else_account_access_without_a_duplicate_settings_entry',
      },
      {
        actual: visualSystem?.footer_update_entry_policy,
        expected:
          'show_confirmed_newer_app_update_as_account_row_trailing_action_and_reuse_existing_carrier_updater_without_owning_update_truth',
      },
      { actual: visualSystem?.footer_theme_quick_toggle_allowed, expected: false },
      { actual: visualSystem?.footer_secondary_navigation_allowed, expected: true },
      { actual: visualSystem?.footer_auxiliary_navigation, expected: 'about_only_sidebar_bottom' },
      { actual: visualSystem?.footer_duplicate_settings_entry_allowed, expected: false },
      { actual: visualSystem?.appearance_mode_presentation, expected: 'three_visual_preview_cards' },
      { actual: visualSystem?.appearance_mode_preserves_theme_preset, expected: false },
      { actual: visualSystem?.theme_gallery_presentation, expected: 'not_exposed' },
      { actual: visualSystem?.theme_swatch_list_allowed, expected: false },
      { actual: visualSystem?.max_border_radius_px, expected: 8 },
    ],
    `${label} Settings visual system must preserve the Codex quiet baseline with OPL information architecture`,
  );
  if (
    JSON.stringify(visualSystem?.footer_controls) !==
      JSON.stringify(['gateway_account_or_account_access_entry', 'app_update_status_and_trigger']) ||
    JSON.stringify(visualSystem?.appearance_mode_values) !== JSON.stringify(['system', 'light', 'dark'])
  ) {
    throw new Error(
      `${label} footer must reserve a conditional account-row update action and keep System, Light, and Dark in Settings`,
    );
  }
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

function assertCodexAutoModelPolicy(
  policy: Record<string, unknown> | undefined,
  profile: ProductProfileLike,
  label: string,
): void {
  const configuredDefault = policy?.configured_default as Record<string, unknown> | undefined;
  if (
    typeof configuredDefault?.model !== 'string' ||
    !configuredDefault.model.trim() ||
    typeof configuredDefault?.reasoning_effort !== 'string' ||
    !configuredDefault.reasoning_effort.trim()
  ) {
    throw new Error(`${label} Codex Auto model policy must define one configured default model and reasoning effort`);
  }
  assertExpectedFields(
    [
      { actual: policy?.authority, expected: 'one-person-lab-app' },
      { actual: policy?.recommendation_authority, expected: 'opl-flow' },
      { actual: policy?.policy_source_ref, expected: 'app_state.agent_packages.status_index.packages.opl-flow.model_projection' },
      { actual: policy?.projection_surface_kind, expected: 'opl_codex_model_policy_projection.v1' },
      {
        actual: policy?.projection_presence_rule,
        expected: 'consume_only_when_fresh_opl_flow_presence_installed_true_and_projection_is_valid',
      },
      {
        actual: policy?.app_role,
        expected: 'resolve_auto_from_fresh_catalog_and_projected_recommendation_then_persist_user_override',
      },
      { actual: policy?.configured_default_role, expected: 'app_fallback_not_flow_recommendation_authority' },
      { actual: policy?.mode_default, expected: 'auto' },
      { actual: policy?.model_catalog_source, expected: 'codex_cli_model_list' },
      { actual: policy?.catalog_response_models_field, expected: 'data' },
      { actual: policy?.catalog_default_model_field, expected: 'isDefault' },
      { actual: policy?.catalog_supported_reasoning_efforts_field, expected: 'supportedReasoningEfforts' },
      { actual: policy?.catalog_supported_reasoning_effort_option_value_field, expected: 'reasoningEffort' },
      { actual: policy?.catalog_reasoning_effort_order_policy, expected: 'last_advertised_supported_reasoning_effort_is_highest' },
      { actual: policy?.catalog_pagination_request_cursor_field, expected: 'cursor' },
      { actual: policy?.catalog_pagination_response_cursor_field, expected: 'nextCursor' },
      { actual: policy?.catalog_pagination_completion_policy, expected: 'exhaust_pages_until_next_cursor_is_null' },
      { actual: policy?.catalog_hidden_model_field, expected: 'hidden' },
      { actual: policy?.catalog_hidden_model_policy, expected: 'exclude_hidden_models_from_auto_and_fixed_options' },
      { actual: policy?.frontier_model_preference_order_role, expected: 'known_model_fallback_and_fixed_option_preference_not_allowlist' },
      { actual: policy?.unknown_default_model_policy, expected: 'accept_catalog_default_even_when_not_in_frontier_model_preference_order' },
      { actual: policy?.unknown_model_reasoning_effort_policy, expected: 'highest_supported_reasoning_effort_from_catalog' },
      { actual: policy?.catalog_without_default_policy, expected: 'first_available_known_model_then_first_catalog_model' },
    ],
    `${label} Codex Auto model policy must follow the Codex CLI catalog`,
  );
  const visibleModelIds = profile.gui?.home?.codex_model_display_options?.visible_models?.map((model) => model.id);
  assertExactStringArray(
    policy?.frontier_model_preference_order,
    visibleModelIds as string[],
    `${label} Codex known model preference order`,
  );
  const overrides = policy?.known_model_reasoning_effort_overrides as Record<string, unknown> | undefined;
  if (overrides?.[configuredDefault.model] !== configuredDefault.reasoning_effort) {
    throw new Error(`${label} Codex configured default reasoning must project into known model overrides`);
  }
  if (JSON.stringify(policy?.catalog_unavailable_fallback) !== JSON.stringify(configuredDefault)) {
    throw new Error(`${label} Codex catalog fallback must derive from the configured default`);
  }
  if (JSON.stringify(policy?.persistence_policy) !== JSON.stringify({
    auto: 'persist_auto_mode_only_resolve_model_and_reasoning_from_fresh_catalog',
    fixed: 'persist_selected_model_and_reasoning_effort',
    state_encoding: 'auto_has_no_model_snapshot_fixed_has_model_and_reasoning',
    reasoning_override_from_auto: 'pin_current_resolved_model_and_exit_auto',
    stale_fixed_model: 'preserve_fixed_selection_as_unavailable_until_user_restores_auto_or_selects_available_model',
  })) {
    throw new Error(`${label} Codex persistence must keep Auto dynamic and fixed overrides durable`);
  }
}

export function assertAppProductProfileCodexModelDisplayOptions(
  profile: ProductProfileLike,
  label = 'App product profile',
  options: ModelDisplayOptions = {},
): void {
  const displayOptions = profile.gui?.home?.codex_model_display_options;
  const frontierOrder = profile.codex?.auto_model_policy?.frontier_model_preference_order;
  assertCodexModelDisplayShape(profile, displayOptions, frontierOrder, label);
  assertCodexAutoModelOptionDescription(displayOptions?.auto_option, label, options);
  assertVisibleCodexModelsUseFriendlyDefaults(displayOptions?.visible_models ?? [], label);
}

function assertCodexModelDisplayShape(
  profile: ProductProfileLike,
  displayOptions: CodexModelDisplayOptionsLike | undefined,
  frontierOrder: unknown,
  label: string,
): void {
  const auto = displayOptions?.auto_option;
  const visibleModels = displayOptions?.visible_models ?? [];
  assertExpectedFields(
    [
      {
        actual: displayOptions?.display_policy,
        expected: 'friendly_model_name_with_session_configuration_summary_rows',
      },
      {
        actual: displayOptions?.button_label_policy,
        expected: 'resolved_model_compact_label_with_selected_reasoning_effort_no_auto_prefix',
      },
      { actual: displayOptions?.raw_model_id_visible_in_ordinary_ui, expected: false },
      { actual: displayOptions?.reasoning_effort_visible_for_every_option, expected: false },
      { actual: displayOptions?.reasoning_effort_menu_visible, expected: true },
      { actual: displayOptions?.reasoning_menu_title_zh, expected: '推理强度' },
      { actual: displayOptions?.reasoning_menu_title_en, expected: 'Reasoning' },
      {
        actual: displayOptions?.reasoning_effort_override_surface,
        expected: 'session_configuration_reasoning_summary_row_submenu',
      },
      { actual: displayOptions?.reasoning_effort_options_source, expected: 'acp_codex_config_options_enum' },
      { actual: displayOptions?.default_reasoning_effort, expected: profile.codex?.default_reasoning_effort },
      { actual: displayOptions?.auto_option_current_resolution_visible, expected: true },
      {
        actual: displayOptions?.model_menu_policy,
        expected: 'model_summary_row_nested_submenu_with_auto_and_fixed_options',
      },
      { actual: auto?.label_zh, expected: '自动（推荐）' },
      { actual: auto?.label_en, expected: 'Auto (recommended)' },
      { actual: auto?.catalog_unavailable_fallback_model, expected: profile.codex?.default_model },
      {
        actual: auto?.catalog_unavailable_fallback_reasoning_effort,
        expected: profile.codex?.default_reasoning_effort,
      },
      { actual: auto?.follows_latest_strongest, expected: true },
      { actual: displayOptions?.fixed_model_description_zh, expected: '固定此模型' },
      { actual: displayOptions?.fixed_model_description_en, expected: 'Use this model' },
      {
        actual: JSON.stringify(frontierOrder),
        expected: JSON.stringify(expectedCodexVisibleModels.map((model) => model.id)),
      },
      {
        actual: JSON.stringify(visibleModels.map((model) => model.id)),
        expected: JSON.stringify(expectedCodexVisibleModels.map((model) => model.id)),
      },
    ],
    `${label} GUI home must expose friendly Codex model display options with reasoning labels`,
  );
  assertCodexSessionConfigurationMenu(displayOptions?.menu_structure, label);
  assertReasoningOptions(displayOptions, profile, label);
  assertRetiredCodexModelsHidden(visibleModels, label);
}

function assertCodexSessionConfigurationMenu(menu: unknown, label: string): void {
  const structure = menu as Record<string, unknown> | undefined;
  assertExpectedFields(
    [
      {
        actual: JSON.stringify(structure?.root_rows),
        expected: JSON.stringify(['model', 'reasoning_effort', 'reset_defaults']),
      },
      { actual: structure?.additional_root_rows_allowed, expected: false },
      { actual: structure?.performance_tuning_row_allowed, expected: false },
      {
        actual: structure?.summary_row_policy,
        expected: 'localized_label_left_current_value_and_chevron_right',
      },
      {
        actual: structure?.reset_defaults_policy,
        expected: 'restore_auto_model_and_app_default_reasoning',
      },
      { actual: structure?.reset_label_zh, expected: '重置为默认设置' },
      { actual: structure?.reset_label_en, expected: 'Reset to defaults' },
      { actual: structure?.summary_row_icon_policy, expected: 'no_leading_icons' },
      { actual: structure?.reset_icon_policy, expected: 'single_trailing_reset_outline_icon' },
      { actual: structure?.home_and_conversation_share_menu_component, expected: true },
    ],
    `${label} Codex session configuration menu must expose discoverable model and reasoning summary rows`,
  );
}

function assertReasoningOptions(
  displayOptions: CodexModelDisplayOptionsLike | undefined,
  profile: ProductProfileLike,
  label: string,
): void {
  const options = displayOptions?.user_reasoning_effort_options;
  if (!Array.isArray(options) || !options.every((effort) => typeof effort === 'string' && effort.trim())) {
    throw new Error(`${label} Codex reasoning effort options must be non-empty strings`);
  }
  if (!options.includes(profile.codex?.default_reasoning_effort)) {
    throw new Error(`${label} Codex reasoning effort options must include the configured default`);
  }
  for (const effort of Object.keys(expectedReasoningLabels)) {
    const labels = displayOptions?.reasoning_labels?.[effort];
    const expectedLabels = expectedReasoningLabels[effort as keyof typeof expectedReasoningLabels];
    if (labels?.zh !== expectedLabels.zh || labels?.en !== expectedLabels.en) {
      throw new Error(`${label} Codex reasoning effort option ${effort} must use Codex App labels`);
    }
  }
}

function assertCodexAutoModelOptionDescription(
  auto: CodexModelDisplayOptionsLike['auto_option'] | undefined,
  label: string,
  options: ModelDisplayOptions,
): void {
  if (
    options.requireAutoIdAndDescriptions &&
    (
      auto!.id !== '__auto' ||
      typeof auto!.description_zh !== 'string' ||
      !auto!.description_zh.includes('Codex CLI') ||
      !auto!.description_zh.includes('App 推理策略') ||
      typeof auto!.description_en !== 'string' ||
      !auto!.description_en.includes('Codex CLI') ||
      !auto!.description_en.includes('App reasoning policy')
    )
  ) {
    throw new Error(`${label} Codex auto model option must describe dynamic catalog resolution without a static snapshot`);
  }
}

function assertVisibleCodexModelsUseFriendlyDefaults(
  visibleModels: NonNullable<CodexModelDisplayOptionsLike['visible_models']>,
  label: string,
): void {
  for (const expected of expectedCodexVisibleModels) {
    const actual = visibleModels.find((model) => model.id === expected.id);
    if (actual?.label_zh !== expected.label_zh || actual?.label_en !== expected.label_en) {
      throw new Error(`${label} GUI home known Codex model ${expected.id} must keep its App label`);
    }
  }
  for (const model of visibleModels) {
    if (
      typeof model.label_zh !== 'string' ||
      typeof model.label_en !== 'string' ||
      model.label_zh === model.id ||
      model.label_en === model.id ||
      'reasoning_effort' in model
    ) {
      throw new Error(`${label} GUI home Codex model ${model.id} must use friendly labels without repeating reasoning`);
    }
  }
}

function assertRetiredCodexModelsHidden(
  visibleModels: NonNullable<CodexModelDisplayOptionsLike['visible_models']>,
  label: string,
): void {
  const forbidden = new Set([
    'gpt-5.3-codex-spark',
    'gpt-5.3-codex',
    'gpt-5.2-codex',
    'gpt-5.1-codex-max',
    'gpt-5.1-codex-mini',
  ]);
  for (const model of visibleModels) {
    if (typeof model.id === 'string' && forbidden.has(model.id)) {
      throw new Error(`${label} GUI home must not expose retired Codex model ${model.id} as an ordinary visible model`);
    }
  }
}
