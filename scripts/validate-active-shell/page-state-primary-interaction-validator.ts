import { assertDeepEqualJson, assertIncludesAll } from './assertions.ts';
import {
  appOwnedPageStateHomeLayout,
  appOwnedPageStateOrdinaryConversation,
  appOwnedReviewSurfaceSourceEvidence,
  appOwnedRightContextInspectorForbiddenOwners,
  appOwnedRightContextInspectorPolicy,
  homeActivityCenterForbiddenDisplays,
  appOwnedOplStandardAgentMembershipPolicy,
} from './app-contract-constants.ts';
import {
  assertHomeComposerDynamicAuthority,
  assertHomeComposerStateContract,
} from '../app-product-profile-shared-validators.ts';

function validateDynamicHomeComposerStateContract(value, label) {
  assertHomeComposerDynamicAuthority(value, label);
  assertHomeComposerStateContract(value, label);
}

export function validatePrimaryInteractionPages(matrix) {
  if (matrix.schema_version !== 2) {
    throw new Error('App page-state matrix schema_version must be 2');
  }
  validateGuidHomePage(matrix);
  validateOrdinaryConversationPage(matrix);
  validateRightContextInspectorPage(matrix);
}

function pageById(matrix, id, label) {
  const page = (matrix.pages ?? []).find((entry) => entry.id === id);
  if (!page) {
    throw new Error(`Page-state matrix is missing ${label} page`);
  }
  return page;
}

function validateGuidHomePage(matrix) {
  const guidHomePage = pageById(matrix, 'guid_home', 'guid_home');
  validateGuidHomePageSource(guidHomePage);
  const homeViewModel = guidHomePage.home_view_model;
  validateGuidHomeViewModelFields(homeViewModel);
  validateGuidHomeLayout(homeViewModel);
  validateGuidHomeAgentPackageAuthority(homeViewModel);
  validateGuidHomeRouteCompatibility(homeViewModel);
  validateDynamicHomeComposerStateContract(
    homeViewModel.home_composer_state_contract,
    'Guid Home page-state composer state contract',
  );
  validateGuidHomeVisibleSignals(guidHomePage);
  validateGuidHomeHiddenSignals(guidHomePage);
  validateGuidHomeActivityCenter(homeViewModel);
}

function validateGuidHomePageSource(guidHomePage) {
  if (guidHomePage.machine_source !== 'contracts/app-gui-product-contract.json#pages.guid_home + opl app state --profile fast --json') {
    throw new Error(`Guid home page must consume the App GUI product contract and OPL App state, got: ${guidHomePage.machine_source}`);
  }
}

function validateGuidHomeViewModelFields(homeViewModel) {
  const expectedFields = {
    authority: 'app_repo_owned_product_truth',
    implementation_carrier: 'opl-aion-shell',
    state_source: 'opl app state --profile fast --json',
    refresh_source: 'opl app state --profile fast --json',
    executor_policy_ref: 'contracts/app-gui-product-contract.json#executor_policy',
    agent_package_source_ref: 'opl app state --profile fast --json#app_state.agent_packages.directory.entries',
    agent_package_status_source_ref: 'opl app state --profile fast --json#app_state.agent_packages.status_index.packages[]',
    home_agent_shortcut_source_ref: 'opl app state --profile fast --json#app_state.agent_packages.status_index.home_shortcut_preferences[]',
    agent_package_skill_source_ref: 'owner_or_carrier_projected_capability_metadata_for_the_selected_package',
    ordinary_capability_selector_policy_ref: 'contracts/app-product-profile.json#gui.ordinary_capability_selector_policy',
    codex_only_default: true,
    codex_cli_fixed_executor: true,
    home_executor_selector_visible: false,
    executor_tab_visible_when_single_executor: false,
    primary_input_surface: 'single_card',
    nested_input_card_frames_allowed: false,
    codex_model_selector_visible: true,
    codex_model_list_visible: true,
    codex_model_policy: 'codex_cli_latest_strongest_model_selector_visible',
    codex_model_auto_option_visible: true,
    conversation_model_status_display_policy:
      'single_session_configuration_menu_with_model_reasoning_and_reset_summary_rows_no_separate_status_pill',
    codex_auto_model_policy_ref: 'contracts/app-product-profile.json#codex.auto_model_policy',
    codex_precise_model_display_policy: 'friendly_model_with_discoverable_model_and_reasoning_summary_rows',
    codex_model_menu_root_rows: ['model', 'reasoning_effort', 'reset_defaults'],
    codex_model_menu_additional_root_rows_allowed: false,
    codex_model_menu_performance_tuning_row_allowed: false,
    codex_default_permission_mode: 'full-access',
    permission_mode_selector_visible: true,
    conversation_backend_selector_visible: false,
    conversation_model_selector_visible: true,
    conversation_permission_mode_selector_visible: true,
  };
  assertDeepEqualJson(fieldsFrom(homeViewModel, expectedFields), expectedFields, 'Guid home page view model fields');
  if ('new_task_locality' in homeViewModel || 'local_worktree_lifecycle_ref' in homeViewModel) {
    throw new Error('Guid Home must not expose managed Worktree launch state');
  }
  for (const field of [
    'codex_default_model',
    'codex_default_reasoning_effort',
    'codex_default_display_label',
    'codex_default_model_display_value',
  ]) {
    if (typeof homeViewModel[field] !== 'string' || !homeViewModel[field].trim()) {
      throw new Error(`Guid home page view model ${field} must be a non-empty App projection`);
    }
  }
}

function validateGuidHomeLayout(homeViewModel) {
  assertDeepEqualJson(
    homeViewModel.home_layout,
    appOwnedPageStateHomeLayout,
    'Guid home page layout',
  );
  if (homeViewModel.ordinary_visible_mcp_server_ids !== undefined) {
    throw new Error('Guid home must not turn configured MCP servers into an App allowlist');
  }
  if (
    homeViewModel.ordinary_mcp_server_source !== 'configured_user_and_third_party_mcp_servers' ||
    homeViewModel.ordinary_mcp_filter_policy !==
      'exclude_only_explicit_team_or_internal_matches_preserve_all_other_user_and_third_party_servers'
  ) {
    throw new Error('Guid home must preserve configured MCP servers through the explicit Team/internal negative filter');
  }
}

function validateGuidHomeAgentPackageAuthority(homeViewModel) {
  if (
    homeViewModel.professional_agent_package_membership_source_ref !==
      'app_state.agent_packages.directory.entries' ||
    homeViewModel.home_agent_package_membership_source_ref !==
      'app_state.agent_packages.directory.entries' ||
    JSON.stringify(homeViewModel.opl_standard_agent_membership_policy) !==
      JSON.stringify(appOwnedOplStandardAgentMembershipPolicy) ||
    homeViewModel.unknown_standard_agent_policy !==
      'include_unknown_package_ids_only_when_they_match_opl_standard_agent_membership' ||
    'professional_agent_packages' in homeViewModel ||
    'default_home_agent_packages' in homeViewModel ||
    'default_assistants' in homeViewModel ||
    'default_assistant_purpose_labels' in homeViewModel ||
    'home_purpose_entries' in homeViewModel ||
    'assistant_source_ref' in homeViewModel ||
    'purpose_entry_source_ref' in homeViewModel
  ) {
    throw new Error('Guid home page Agent membership must come from the dynamic Framework directory and user shortcut preferences');
  }
  assertDeepEqualJson(
    homeViewModel.home_agent_shortcuts_metadata_policy,
    {
      role: 'owner_projected_package_presentation',
      shortcut_source_ref: 'app_state.agent_packages.directory.entries[].home_shortcuts[]',
      preference_source_ref: 'app_state.agent_packages.status_index.home_shortcut_preferences[]',
      package_id_allowlist_allowed: false,
      fallback_policy: 'omit_invalid_shortcut_and_preserve_other_packages',
    },
    'Guid home page owner-projected shortcut authority',
  );
}

function validateGuidHomeRouteCompatibility(homeViewModel) {
  for (const forbiddenField of [
    'route_receipt_source_ref',
    'legacy_route_receipt_alias_source_ref',
    'route_receipt_required_fields',
    'route_receipt_must_not_govern',
    'home_agent_shortcuts',
    'default_assistant_required_skills',
    'default_agent_package_required_skills',
  ]) {
    if (forbiddenField in homeViewModel) {
      throw new Error(`Guid home page must not restore private Agent route field ${forbiddenField}`);
    }
  }
}

function validateGuidHomeVisibleSignals(guidHomePage) {
  assertIncludesAll(guidHomePage.must_show, [
    'Codex CLI fixed executor experience',
    'Codex model selector defaulting to 5.6 Sol',
    'reasoning effort configurable inside the Codex model menu',
    'conversation pending elapsed seconds while Codex is working',
    'all visible professional-agent shortcuts remain selectable while launch readiness is enforced on send with typed guidance',
    'prompt, compact shortcuts, and composer share one bottom reading lane',
    'active capability shown by a quiet selected shortcut state without a second composer label',
    'all user-visible configured OPL starters in stable order without silent truncation',
    'assistant-scoped skill menu with required skill checked',
    'ordinary Skill selector preserves owner-or-carrier projected Skills without an App allowlist',
    'one composer-width searchable grouped plus palette for files, folders, projected Agent Packages, projected Skills, adapter-reported nonduplicate modes, and available App connections',
    'new-session working directory selected from an independent context bar above the composer',
    'projectless attachments, arbitrary local file or directory selection, paste, drop, and /open subject only to Codex permissions',
    'workspace readiness gates project selection and OPL workspace controls only, never plain local conversation or send-scoped local file inputs',
    'workspace selection sets the new task initial cwd only',
    'send action',
    'single composer-first home input with an attached new-session context bar and bottom action row',
    'exactly one Home root, composer shell, and footer account or Settings entry at every viewport',
    'permission and access mode in user language',
    'workspace/session rail visible on wide desktop and drawer on narrow windows',
    'each canonical thread ID rendered as at most one conversation row regardless of title',
    'canonical App Server thread overview overrides Codex ACP cache rows while preserving non-Codex local rows',
    'non-managed-scratch canonical recorded cwd auto-loads a directory group and new-session cwd shortcut without creating explicit project affinity or mutating registered workspaces',
    'advanced work surfaces closed by default with no third column',
    'runtime/task progress available from Runtime page, not Home activity grid',
  ], 'Guid home page visible signals');
}

function validateGuidHomeHiddenSignals(guidHomePage) {
  assertIncludesAll(guidHomePage.must_not_show, [
    'executor selector on the home input',
    'Aion CLI or Claude Code backend choices on the home input',
    'retired Codex model choices on the home input',
    'provider or backend terms in the permission and access mode',
    'persistent variable purpose selector in the composer',
    'full assistant names as default home entry labels',
    'skills outside the App packaged skill set in home skill menu',
    'AionUI implementation skills such as aionui-skills',
    'MCP servers matching the explicit Team/internal negative filter',
    'AionUI Team MCP tools such as team_members, team_list_models, and team_spawn_agent',
    'retired Codex model choices',
    'nested input card frames',
    'dashboard-first home',
    'explanatory landing page',
    'backend settings panel in composer',
    'expanded workbench or activity refs grid on ordinary home',
    'domain artifact body in Home activity center',
    'memory body in Home activity center',
    'compact continue-work entry near the home input',
    'Home footer feedback icon',
    'Home footer favorite/star icon',
    'Home footer web/access globe icon',
    'per-assistant running badges derived from module or domain lane diagnostics',
    'bound-session arbitrary project or working-directory reassignment controls on Home',
    'Local or Worktree launch modes, starting branch, managed worktree, handoff, snapshot, restore, or cleanup controls on Home',
    'workspace-scoped Add context action in a directory group',
    'directory-group delete action or cascade deletion of grouped sessions',
    'title-based conversation deduplication',
    'stale Codex ACP cache rows absent from an available canonical App Server overview',
  ], 'Guid home page hidden signals');
}

function validateGuidHomeActivityCenter(homeViewModel) {
  const expectedFields = {
    authority: 'app_owned_home_minimal_command_surface',
    source: 'not_rendered_on_ordinary_home',
    default_placement: 'not_rendered_on_ordinary_home',
    home_surface_policy: 'ordinary_home_must_not_render_activity_center_or_continue_work_grid',
  };
  assertDeepEqualJson(
    fieldsFrom(homeViewModel.activity_center, expectedFields),
    expectedFields,
    'Guid home page activity center',
  );
  assertDeepEqualJson(
    homeViewModel.activity_center.allowed_home_runtime_context,
    [],
    'Guid home page allowed runtime context',
  );
  assertIncludesAll(
    homeViewModel.activity_center.must_not_display,
    homeActivityCenterForbiddenDisplays,
    'Guid home page activity center forbidden displays',
  );
}

function fieldsFrom(record, expectedFields) {
  return Object.fromEntries(Object.keys(expectedFields).map((field) => [field, record?.[field]]));
}

function validateOrdinaryConversationPage(matrix) {
  const ordinaryConversationPage = pageById(matrix, 'ordinary_conversation', 'ordinary_conversation');
  if (ordinaryConversationPage.page_contract !== 'ordinary_codex_conversation') {
    throw new Error('Ordinary conversation page contract must be ordinary_codex_conversation');
  }
  const {
    experience_contract_ref: actionSheetContractRef,
    minimum_viewport: actionSheetMinimumViewport,
    height_policy: actionSheetHeightPolicy,
    single_scroll_owner: actionSheetScrollOwner,
    all_actions_reachable: actionSheetActionsReachable,
    horizontal_overflow_allowed: actionSheetHorizontalOverflowAllowed,
    ...baseMobileActionSheet
  } = ordinaryConversationPage.conversation_view_model?.mobile_action_sheet ?? {};
  assertDeepEqualJson(
    {
      ...Object.fromEntries(
        Object.entries(ordinaryConversationPage.conversation_view_model ?? {}).map(([key, value]) => [
          key,
          key === 'mobile_action_sheet' ? baseMobileActionSheet : value,
        ]),
      ),
      current_task_slice: Object.fromEntries(
        Object.entries(ordinaryConversationPage.conversation_view_model?.current_task_slice ?? {}).filter(
          ([key]) => key !== 'fields',
        ),
      ),
    },
    {
      ...appOwnedPageStateOrdinaryConversation,
      current_task_slice: Object.fromEntries(
        Object.entries(appOwnedPageStateOrdinaryConversation.current_task_slice).filter(([key]) => key !== 'fields'),
      ),
    },
    'Ordinary conversation view model shell policy',
  );
  assertDeepEqualJson(
    {
      experience_contract_ref: actionSheetContractRef,
      minimum_viewport: actionSheetMinimumViewport,
      height_policy: actionSheetHeightPolicy,
      single_scroll_owner: actionSheetScrollOwner,
      all_actions_reachable: actionSheetActionsReachable,
      horizontal_overflow_allowed: actionSheetHorizontalOverflowAllowed,
    },
    {
      experience_contract_ref:
        'contracts/app-gui-product-contract.json#ui_experience_contract.context_action_sheet',
      minimum_viewport: '400x600',
      height_policy: '100dvh_safe_area_bounded',
      single_scroll_owner: 'content_pane',
      all_actions_reachable: true,
      horizontal_overflow_allowed: false,
    },
    'Ordinary conversation mobile action-sheet reachability',
  );
  assertIncludesAll(
    ordinaryConversationPage.conversation_view_model?.current_task_slice?.fields,
    [
      ...appOwnedPageStateOrdinaryConversation.current_task_slice.fields,
      'resource_plan_ref',
      'resource_approval_ref',
      'resource_usage_ref',
      'console_policy_ref',
      'environment_template_ref',
      'environment_version_ref',
    ],
    'Ordinary conversation current task fields',
  );
  assertIncludesAll(ordinaryConversationPage.must_show, [
    'Codex CLI ordinary conversation',
    'floating bottom composer with safe inset',
    'compact active capability chip',
    'desktop unified plus menu, permission and access, model and reasoning, and send or stop controls in the composer',
    'mobile plus sheet reusing the unified context menu with access, model and reasoning, and active capability actions',
    'composer-width searchable grouped plus palette for files, folders, real owner-or-carrier projected capabilities, adapter-reported nonduplicate modes, and available App connections without workspace selection',
    'explicit attachments, file or directory selection, paste, drop, and /open consumed by the current session send only',
    'failed conversation creation, initial send, or in-conversation send restores prompt and attachments without overwriting post-submit input',
    'permission and access mode in user language',
    'projectless text conversation when no workspace is selected',
    'projectless attachments, arbitrary local file or directory selection, paste, drop, and /open subject only to Codex permissions',
    'read-only Conversation Environment showing the recorded workspace and live Git context when available',
    'Codex default model and reasoning status',
    'single current task instance in the message timeline, inline and unpinned for ordinary tasks',
    'current task becomes sticky only after user pin or a true long_running signal',
    'read-only Codex subagent activity grouped as Active and Done with detail, result, and open canonical task',
    'complete paginated redacted transcript export with Markdown default, strict JSON, explicit directory and filename',
    'Preview accepts only explicit session attachments, visible conversation results, or user-selected legal absolute local paths',
  ], 'Ordinary conversation page visible signals');
  assertIncludesAll(ordinaryConversationPage.must_not_show, [
    'backend selector as normal conversation control',
    'provider selector as normal conversation control',
    'provider or backend language inside permission and access mode',
    'persistent variable purpose selector in the composer',
    'persistent project, workspace, locality, branch, attachment, or workspace-context-ref context strip',
    'workspace-scoped project context inputs or an Add context action in the directory rail',
    'workspaceRootReady or workspace membership used as a file-access gate',
    'backend, provider, Team, raw MCP, or arbitrary skills in the mobile plus sheet',
    'bound-session arbitrary project or working-directory reassignment controls',
    'Local or Worktree launch modes, starting branch, managed worktree, handoff, snapshot, restore, cleanup, or deletion controls',
    'cross-host task handoff controls',
    'duplicate current task or Runtime summary outside the message timeline',
    'AionUI Team, second App Server client, background polling, Team store, subagent scheduler, Shell execution authority, or direct subagent control buttons',
    'workspace bundle export authorization',
    'standalone projectless or no working directory placeholder row',
  ], 'Ordinary conversation page hidden signals');
}

function validateRightContextInspectorPage(matrix) {
  const rightContextInspectorPage = pageById(matrix, 'right_context_inspector', 'right_context_inspector');
  const inspectorViewModel = rightContextInspectorPage.inspector_view_model;
  const reviewSurface = inspectorViewModel?.review_surface ?? {};
  const sourceEvidenceFields = Object.keys(appOwnedReviewSurfaceSourceEvidence);
  const productPolicy = {
    ...inspectorViewModel,
    review_surface: Object.fromEntries(
      Object.entries(reviewSurface).filter(([key]) => !sourceEvidenceFields.includes(key)),
    ),
  };
  const expectedPolicy = {
    ...appOwnedRightContextInspectorPolicy,
    environment_popover_ref:
      'contracts/app-gui-product-contract.json#interaction_baseline.context_surfaces.environment_popover',
  };
  assertDeepEqualJson(
    Object.fromEntries(
      Object.entries(productPolicy).filter(
        ([key]) => !['current_task_evidence', 'must_not_own'].includes(key),
      ),
    ),
    expectedPolicy,
    'On-demand advanced workspace surface policy',
  );
  assertDeepEqualJson(
    Object.fromEntries(sourceEvidenceFields.map((key) => [key, reviewSurface[key]])),
    appOwnedReviewSurfaceSourceEvidence,
    'On-demand Review source evidence',
  );
  for (const legacyField of ['tabs', 'primary_tools', 'secondary_sections']) {
    if (legacyField in (inspectorViewModel ?? {})) {
      throw new Error(`Page state must not restore legacy inspector taxonomy field ${legacyField}`);
    }
  }
  assertIncludesAll(rightContextInspectorPage.must_show, [
    'no third column mounted by default',
    'Files and Changes workspace surface opened only by user or task need',
    'exactly one Files and Changes panel toggle visible per viewport state, owned by conversation header while closed and panel header while open',
    'Preview opened as an independent surface for artifact, file, URL, or result',
    'Review defaults to Unstaged, exposes Staged, Commit, Branch, and Last turn, supports uncommitted, base branch, commit, and custom targets with inline or detached delivery, and shows PR context unavailable when gh is missing',
    'Terminal and Browser opened from Environment or task need',
    'environment popover kept distinct from advanced work surfaces',
  ], 'Advanced workspace surface page visible signals');
  assertIncludesAll(rightContextInspectorPage.must_not_show, [
    'legacy equal-weight Review, Terminal, Browser, Files, Artifacts, Runtime, Actions, and Memory taxonomy',
    'Runtime duplicate outside the message timeline current task instance',
    'advanced work surfaces open by default',
    'duplicate Files and Changes panel toggles in the global titlebar, conversation header, panel header, or floating handle',
  ], 'Advanced workspace surface page hidden signals');
  assertIncludesAll(
    rightContextInspectorPage.must_not_own,
    appOwnedRightContextInspectorForbiddenOwners,
    'Advanced workspace surface forbidden owners',
  );
}
