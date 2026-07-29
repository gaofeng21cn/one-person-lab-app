import { existsSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
  assertShellTextIncludesAll,
  assertTextDoesNotMatch,
  assertTextExcludesAll,
  assertTextIncludesAll,
  readShellJson,
  readShellText,
} from './shell-implementation-helpers.ts';

const guidHomeExpected = [
  "document.title = 'One Person Lab App'",
  "t('conversation.welcome.placeholder')",
  "t('guid.postInstallSelfCheck.prompt'",
  'POST_INSTALL_SELF_CHECK_PROMPT_DEFAULTS',
  'postInstallSelfCheckRequested',
  "navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null })",
  'GuidModelSelector',
  'selectedAgentLabelOverride',
  'onClear={() =>',
  'const workspaceAccessBlocked = coreReadiness.known && !coreReadiness.workspaceRootReady;',
  'workspaceAccessDisabled={workspaceAccessBlocked}',
  'const guidInput = useGuidInput({',
  'onFilesUploaded={guidInput.handleFilesUploaded}',
  'onPaste={guidInput.onPaste}',
  'dragHandlers={guidInput.dragHandlers}',
  'useCoreLaunchPrerequisites',
  'GuidSetupNotice',
];

const guidHomeSelectionForbidden = ['AssistantSelectionArea', 'MentionSelectorBadge'];

export function assertCanonicalThreadAffinityConvergenceSources({
  canonicalThreadLifecycle,
  conversationListSync,
  focusedTests,
  threadAdapter,
}: {
  canonicalThreadLifecycle: string;
  conversationListSync: string;
  focusedTests: string;
  threadAdapter: string;
}): void {
  for (const [label, source] of [
    ['canonical thread lifecycle', canonicalThreadLifecycle],
    ['canonical directory merge', conversationListSync],
  ] as const) {
    assertTextIncludesAll(
      source,
      [
        'const hasCanonicalProjectWorkspace = Boolean(thread.projectId.trim() && thread.workspace.trim())',
        'workspace: thread.workspace',
        'custom_workspace: hasCanonicalProjectWorkspace',
      ],
      `Active shell ${label} cwd projection`,
    );
    assertTextExcludesAll(
      source,
      [
        'cached?.extra.custom_workspace === false ? false : hasCanonicalProjectWorkspace',
        'cached?.extra.custom_workspace === true',
        'workspace: projectAffinityWorkspace',
        'custom_workspace: customWorkspace',
      ],
      `Active shell ${label} cache authority boundary`,
    );
  }
  assertTextIncludesAll(
    threadAdapter,
    [
      'function recordedCwd(value: unknown): string',
      "if (value === undefined || value === null) return ''",
      "if (typeof value !== 'string') throw new Error('Invalid Codex app-server thread cwd.')",
      'workspace: recordedCwd(raw.cwd)',
    ],
    'Active shell canonical cwd parser fail-closed boundary',
  );
  assertTextExcludesAll(
    threadAdapter,
    ["workspace: optionalString(raw.cwd) ?? ''"],
    'Active shell canonical cwd parser must not treat malformed values as projectless',
  );
  assertTextIncludesAll(
    focusedTests,
    [
      'keeps canonical adoption successful when the rebuildable local projection update fails',
      'keeps canonical adoption successful when a stub projection cannot be materialized',
      'requires an exact canonical cwd readback instead of path-normalized equivalence',
      'rejects malformed canonical cwd instead of treating it as projectless',
      'rejects a malformed cwd returned by canonical thread read',
    ],
    'Active shell canonical cwd convergence focused regressions',
  );
}

export function assertCanonicalThreadDirectoryTimeoutBoundarySources({
  focusedTests,
  threadAdapter,
}: {
  focusedTests: string;
  threadAdapter: string;
}): void {
  const sourceFile = ts.createSourceFile('codex-app-server-adapter.ts', threadAdapter, ts.ScriptTarget.Latest, true);
  const threadListOptions: ts.ObjectLiteralExpression[] = [];
  const objectBindings = new Map<string, ts.ObjectLiteralExpression>();
  const collectObjectBindings = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      objectBindings.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collectObjectBindings);
  };
  collectObjectBindings(sourceFile);
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'request' &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      node.arguments[0].text === 'thread/list'
    ) {
      const optionsArgument = node.arguments[1];
      const options =
        optionsArgument && ts.isObjectLiteralExpression(optionsArgument)
          ? optionsArgument
          : optionsArgument && ts.isIdentifier(optionsArgument)
            ? objectBindings.get(optionsArgument.text)
            : undefined;
      if (!options) {
        throw new Error('Active shell canonical thread directory must pass a statically inspectable thread/list options object');
      }
      threadListOptions.push(options);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (threadListOptions.length === 0) {
    throw new Error('Active shell canonical thread directory must call thread/list');
  }
  const propertyName = (property: ts.ObjectLiteralElementLike): string | null => {
    const name = property.name;
    if (!name) return null;
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
    if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) return name.expression.text;
    return null;
  };
  const assertNoSourceKindsExpression = (expression: ts.Expression): void => {
    if (ts.isParenthesizedExpression(expression)) {
      assertNoSourceKindsExpression(expression.expression);
      return;
    }
    if (ts.isConditionalExpression(expression)) {
      assertNoSourceKindsExpression(expression.whenTrue);
      assertNoSourceKindsExpression(expression.whenFalse);
      return;
    }
    if (!ts.isObjectLiteralExpression(expression)) {
      throw new Error(
        'Active shell canonical thread directory thread/list spreads must use statically inspectable inline objects',
      );
    }
    assertNoSourceKindsProperties(expression.properties);
  };
  const assertNoSourceKindsProperties = (
    properties: ts.NodeArray<ts.ObjectLiteralElementLike>,
    allowGuardedDirectProperties = false,
  ): void => {
    for (const property of properties) {
      if (ts.isSpreadAssignment(property)) {
        assertNoSourceKindsExpression(property.expression);
        continue;
      }
      const name = propertyName(property);
      if (name === null) {
        throw new Error(
          'Active shell canonical thread directory thread/list option names must be statically inspectable',
        );
      }
      if (name === 'sourceKinds') {
        throw new Error('Active shell canonical thread directory thread/list options must not include sourceKinds');
      }
      if (!allowGuardedDirectProperties && (name === 'archived' || name === 'useStateDbOnly')) {
        throw new Error(
          'Active shell canonical thread directory thread/list option spreads must not override archived or useStateDbOnly',
        );
      }
    }
  };
  for (const options of threadListOptions) {
    const archivedProperties = options.properties.filter((property) => propertyName(property) === 'archived');
    const stateDbOnlyProperties = options.properties.filter((property) => propertyName(property) === 'useStateDbOnly');
    if (archivedProperties.length !== 1) {
      throw new Error('Active shell canonical thread directory thread/list options must include exactly one archived selector');
    }
    if (stateDbOnlyProperties.length !== 1) {
      throw new Error('Active shell canonical thread directory thread/list options must include exactly one useStateDbOnly selector');
    }
    const archived = archivedProperties[0];
    const stateDbOnly = stateDbOnlyProperties[0];
    if (
      !ts.isShorthandPropertyAssignment(archived) &&
      (!ts.isPropertyAssignment(archived) ||
        !ts.isIdentifier(archived.initializer) ||
        archived.initializer.text !== 'archived')
    ) {
      throw new Error(
        'Active shell canonical thread directory thread/list options must use the dynamic archived selector rather than a constant',
      );
    }
    if (
      !stateDbOnly ||
      !ts.isPropertyAssignment(stateDbOnly) ||
      stateDbOnly.initializer.kind !== ts.SyntaxKind.TrueKeyword
    ) {
      throw new Error('Active shell canonical thread directory thread/list options must set useStateDbOnly to true');
    }
    assertNoSourceKindsProperties(options.properties, true);
  }
  assertTextIncludesAll(
    focusedTests,
    [
      'lists active and archived threads through bounded app-server pagination',
      'useStateDbOnly: true',
      "not.toHaveProperty('sourceKinds')",
    ],
    'Active shell canonical thread directory timeout/archive regressions',
  );
}

export function assertProjectlessGuidFileAccessSources(guidPage: string): void {
  assertTextIncludesAll(
    guidPage,
    [
      'const workspaceAccessBlocked = coreReadiness.known && !coreReadiness.workspaceRootReady;',
      'workspaceAccessDisabled={workspaceAccessBlocked}',
      'const guidInput = useGuidInput({',
      'locationState: navState',
      'onFilesUploaded={guidInput.handleFilesUploaded}',
      'onPaste={guidInput.onPaste}',
      'dragHandlers={guidInput.dragHandlers}',
      "name: 'open'",
    ],
    'Active shell explicit session file access',
  );

  const assignments = Array.from(
    guidPage.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g),
    (match) => ({ name: match[1], expression: match[2] }),
  );
  const workspaceDerivedIdentifiers = new Set<string>();
  const hasWorkspaceSource = (expression: string): boolean =>
    /\bworkspaceRootReady\b|\bworkspaceAccessBlocked\b|\bguidInput\.dir\b|\blocationState\??\.workspace\b/.test(
      expression,
    ) ||
    Array.from(workspaceDerivedIdentifiers).some((identifier) =>
      new RegExp(`\\b${identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(expression),
    );

  let discoveredWorkspaceAlias = true;
  while (discoveredWorkspaceAlias) {
    discoveredWorkspaceAlias = false;
    for (const assignment of assignments) {
      if (!workspaceDerivedIdentifiers.has(assignment.name) && hasWorkspaceSource(assignment.expression)) {
        workspaceDerivedIdentifiers.add(assignment.name);
        discoveredWorkspaceAlias = true;
      }
    }
  }

  const fileGateName = /(?:files?|attachments?|paste|drop).*(?:access|enabled?|disabled?|blocked?|allowed?|available)|(?:access|enabled?|disabled?|blocked?|allowed?|available).*(?:files?|attachments?|paste|drop)/i;
  const workspaceDerivedFileGate = assignments.find(
    (assignment) => fileGateName.test(assignment.name) && hasWorkspaceSource(assignment.expression),
  );
  if (workspaceDerivedFileGate) {
    throw new Error(
      `Active shell explicit session input must not derive ${workspaceDerivedFileGate.name} from workspace readiness or membership`,
    );
  }

  const fileAccessExpressions = Array.from(
    guidPage.matchAll(/\b(?:fileAccessEnabled|fileAccessDisabled|fileContextEnabled)\s*(?::|=)\s*(?:\{([^}\n]*)\}|([^,\n]+))/g),
    (match) => (match[1] ?? match[2] ?? '').trim(),
  );
  if (fileAccessExpressions.some((expression) => hasWorkspaceSource(expression))) {
    throw new Error(
      'Active shell explicit session input file-access props must not depend on workspace readiness or membership',
    );
  }
}

export function assertCurrentGuidHomeSelectionSources({
  guidPage,
  guidInputCard,
  homeStarters,
  guidStyles,
  capabilitiesPage,
}: {
  guidPage: string;
  guidInputCard: string;
  homeStarters: string;
  guidStyles: string;
  capabilitiesPage: string;
}): void {
  assertTextIncludesAll(
    guidPage,
    [
      'HomeStarters',
      'activeCapabilityId={activeShortcut?.package_id}',
      'activeShortcutId={activeShortcut?.shortcut_id}',
      "const { appState } = useOplAppState('fast')",
      'handleSelectShortcut(assistantId)',
      'onSelect={(assistantId) =>',
      'onClear={() =>',
      'sameActiveShortcut',
      'setActiveShortcut((current) => {',
      'const next = resolveOplActiveShortcut(navState.selectedCapabilityId, appState)',
      'return sameActiveShortcut(current, next) ? current : next',
      'agentSelection.setSelectedAgentKey(agentSelection.defaultAgentKey)',
    ],
    'Active shell Guid Home starter selection',
  );
  assertTextExcludesAll(
    guidPage,
    [
      'setActiveShortcut(resolveOplActiveShortcut(navState.selectedCapabilityId))',
      'setActiveShortcut(resolveOplActiveShortcut(navState.selectedCapabilityId, appState))',
    ],
    'Active shell retired static Guid Home shortcut resolution',
  );
  assertTextIncludesAll(
    homeStarters,
    [
      "data-testid='opl-home-starters'",
      'assistant.opl_package_id === activeCapabilityId && assistant.opl_shortcut_id === activeShortcutId',
      'aria-pressed={active}',
      'data-opl-active={String(active)}',
      'resolveOplPackageLaunchGate(appState, assistant.opl_package_id)',
      "const launchReady = launchGate.state !== 'package_unavailable'",
      'data-opl-launch-ready={String(launchReady)}',
      'active && styles.homeStarterActive',
      'starterIcon()',
      'active && onClear ? onClear() : onSelect(assistant.opl_shortcut_id)',
    ],
    'Active shell Guid Home starter component',
  );
  assertTextExcludesAll(
    homeStarters,
    [
      'FontAwesomeIcon',
      'CheckOne',
      "data-testid='starter-active-check'",
      'faChevronRight',
      "!border-primary-5 !bg-primary-1 !text-primary-6",
      '<Right',
      'disabled={launchBlocked}',
      'const active = assistant.id === activeCapabilityId',
      'resolveOplPackageLaunchGate(appState, assistant.id)',
      'starterIcon(assistant.opl_package_id)',
      'starterIcon(assistant.id)',
      'active && onClear ? onClear() : onSelect(assistant.id)',
    ],
    'Active shell retired Guid Home starter styling',
  );
  assertTextIncludesAll(
    guidStyles,
    [
      '.guidComposerDock',
      'width: min(100%, 736px)',
      '.guidInputInner',
      'min-height: 98px',
      'border-radius: 22px',
      '.actionRow',
      'align-items: center',
      'width: 100%',
      '.workspaceContextBar',
      'height: 52px',
      'margin: 0 12px -13px',
      'padding: 0 12px',
      '.homeStarterGrid',
      'display: flex',
      'flex-wrap: wrap',
      'justify-content: center',
      'width: auto !important',
      'height: 34px !important',
    ],
    'Active shell integrated Guid Home reading lane',
  );
  assertTextExcludesAll(
    guidStyles,
    ['grid-template-columns: repeat(4', 'grid-template-columns: repeat(5'],
    'Active shell fixed-count Guid Home starter layout',
  );
  assertTextIncludesAll(
    guidInputCard,
    [
      'const DESKTOP_TEXTAREA_AUTO_SIZE = { minRows: 1, maxRows: 12 }',
      '${styles.guidInputInner} opl-codex-composer',
      "isInputActive ? 'opl-codex-composer--focused' : ''",
      "fileDraggingActive ? 'opl-codex-composer--dragging' : ''",
      "data-composer-palette-boundary='true'",
      'activeBorderColor',
      'inactiveBorderColor',
      '!pl-5px',
    ],
    'Active shell compact Guid Home composer',
  );
  assertTextIncludesAll(
    capabilitiesPage,
    [
      'useCustomAgentsLoader',
      "navigate('/guid', {",
      'state: { selectedCapabilityId: capability.id }',
    ],
    'Active shell Capabilities selection route',
  );
  assertTextExcludesAll(guidPage, guidHomeSelectionForbidden, 'Active shell retired Guid selector surfaces');
}

const guidLocaleExpected = {
  'zh-CN': [
    '安装后智能自检',
    '首次设置的核心阶段已经完成',
    'opl app state --profile fast --json',
    'App 核心可用',
    'presence-only',
    '用户主动卸载',
    'opl packages status --package-id <id> --json',
    'OPL Flow 缺失或被用户卸载时不得阻断 App 核心功能',
    '本轮只诊断',
  ],
  'en-US': [
    'Post-install intelligent self-check',
    'The core first-run setup stage has completed',
    'opl app state --profile fast --json',
    'App core usable',
    'presence-only',
    'Packages explicitly removed by the user are not failures',
    'opl packages status --package-id <id> --json',
    'Missing or user-uninstalled OPL Flow must not block App core functionality',
    'This turn is diagnostic only',
  ],
};

const guidHomeRuntimeForbidden = [
  "data-testid='opl-home-model-status'",
  'homeModelStatusRow',
  'homeModelStatus',
  'normalizeGuidActivityCenter',
  'activityCenter={activityCenter}',
  "data-testid='opl-continue-context-entry'",
  'guid.activity.continuationPrompt',
  'guid.activity.continueAction',
  'guid.activity.attentionCount',
  'guid.activity.activeCount',
  'activityCenter.hasItems',
  'QuickActionButtons',
];

const productProfileDefaultsExpected = [
  '"configured_default": {',
  '"codex_cli_fixed_executor": true',
  '"home_executor_selector_visible": false',
  '"codex_model_selector_visible": true',
  '"codex_model_list_visible": true',
  '"codex_model_policy": "codex_cli_latest_strongest_model_selector_visible"',
  '"codex_model_auto_option_visible": true',
  '"codex_home_model_status_label": "5.6 Sol"',
  '"codex_precise_model_display_policy": "friendly_model_with_discoverable_model_and_reasoning_summary_rows"',
  '"button_label_policy": "resolved_model_compact_label_with_selected_reasoning_effort_no_auto_prefix"',
  '"default_active_shortcut": null',
  '"shortcut_selection_policy": "explicit_user_or_navigation_selection_only_no_saved_preset_restore_and_never_disabled_by_launch_readiness"',
  '"selected_starter_visual_policy": "quiet_fill_with_aria_pressed_without_trailing_selection_glyph"',
  '"selected_starter_accessibility_state": "aria_pressed_reflects_active_shortcut"',
  '"zh": "推理最高"',
  '"policy_source_ref": "contracts/app-product-profile.json#codex.auto_model_policy"',
  '"model_catalog_source": "codex_cli_model_list"',
  '"catalog_response_models_field": "data"',
  '"catalog_default_model_field": "isDefault"',
  '"catalog_supported_reasoning_efforts_field": "supportedReasoningEfforts"',
  '"catalog_supported_reasoning_effort_option_value_field": "reasoningEffort"',
  '"catalog_pagination_request_cursor_field": "cursor"',
  '"catalog_pagination_response_cursor_field": "nextCursor"',
  '"catalog_pagination_completion_policy": "exhaust_pages_until_next_cursor_is_null"',
  '"catalog_hidden_model_policy": "exclude_hidden_models_from_auto_and_fixed_options"',
  '"frontier_model_preference_order_role": "known_model_fallback_and_fixed_option_preference_not_allowlist"',
  '"unknown_default_model_policy": "accept_catalog_default_even_when_not_in_frontier_model_preference_order"',
  '"unknown_model_reasoning_effort_policy": "highest_supported_reasoning_effort_from_catalog"',
  '"auto": "persist_auto_mode_only_resolve_model_and_reasoning_from_fresh_catalog"',
  '"fixed": "persist_selected_model_and_reasoning_effort"',
  '"reasoning_override_from_auto": "pin_current_resolved_model_and_exit_auto"',
  '"user_can_override_model": true',
  '"user_can_restore_auto": true',
  '"display_policy": "friendly_model_name_with_session_configuration_summary_rows"',
  '"raw_model_id_visible_in_ordinary_ui": false',
  '"reasoning_effort_visible_for_every_option": false',
  '"reasoning_effort_menu_visible": true',
  '"model_menu_policy": "model_summary_row_nested_submenu_with_auto_and_fixed_options"',
  '"additional_root_rows_allowed": false',
  '"performance_tuning_row_allowed": false',
  '"home_and_conversation_share_menu_component": true',
  '"reasoning_effort_options_source": "acp_codex_config_options_enum"',
  '"label_zh": "自动（推荐）"',
  '"description_zh": "跟随 Codex CLI 当前默认模型与 App 推理策略"',
  '"zh": "推理超高"',
  '"en": "Extra high reasoning"',
  '"zh": "推理极高"',
  '"en": "Ultra reasoning"',
  '"label_zh": "5.6 Sol"',
  '"label_zh": "5.6 Terra"',
  '"label_zh": "5.6 Luna"',
  '"label_zh": "5.5"',
  '"label_zh": "5.4"',
  '"label_zh": "5.4 Mini"',
  '"label_zh": "5.2"',
  '"default_packaged_codex_skill_ids"',
];

const codexSessionConfigurationMenuStructureExpected = {
  root_rows: ['model', 'reasoning_effort', 'reset_defaults'],
  additional_root_rows_allowed: false,
  performance_tuning_row_allowed: false,
  summary_row_policy: 'localized_label_left_current_value_and_chevron_right',
  reset_defaults_policy: 'restore_auto_model_and_app_default_reasoning',
  reset_label_zh: '重置为默认设置',
  reset_label_en: 'Reset to defaults',
  summary_row_icon_policy: 'no_leading_icons',
  reset_icon_policy: 'single_trailing_reset_outline_icon',
  home_and_conversation_share_menu_component: true,
};

const codexModelsExpected = [
  'getOplCodexAutoModelPolicy',
  'resolveOplCodexAutoSelection',
  'frontier_model_preference_order',
  'unknown_default_model_policy',
  'known_model_reasoning_effort_overrides',
  'catalog_unavailable_fallback',
  'model.hidden === true',
  'DEFAULT_CODEX_MODELS',
  'handshakeModels == null',
  'normalizeCodexModelInfo(handshakeModels)',
  'normalized?.available_models',
  'DEFAULT_CODEX_MODELS.map',
  'available_models: visibleModels',
];

const guidAssistantsExpected = [
  'parseOplStandardAgentDirectoryEntries',
  'getOplHomeAgentShortcutsFromAppState',
  'agentPackageDirectoryEntries',
  'resolveOplProfessionalAgentAssistants',
  'resolveOplHomeAssistants',
  'opl_package_id',
  'opl_shortcut_id',
  'enabled_skills',
  'custom_skill_names',
  'disabled_builtin_skills',
];

const guidPageSkillExpected = [
  'getOplDirectorySkillIds(appState)',
  'parseOplStandardAgentDirectoryEntries(appState)',
  'resolveOplStandardAgentCapabilityMetadata(appState, activeShortcut?.package_id)',
  'const selectedAllowedSkillIds = new Set',
  'const visibleSkillCatalog = activeShortcut',
  'const effectiveGuidEnabledSkills = mergeRequiredSkills(',
  'selectedCapabilityMetadata?.requiredSkillIds ?? []',
  '(guidEnabledSkills ?? []).filter((name) => selectedAllowedSkillIds.has(name))',
  'buildAssistantScopedSkillMenuItems(visibleSkillCatalog, selectedSkillProfile)',
  'guidEnabledSkills: effectiveGuidEnabledSkills',
];

const acpSendBoxExpected = [
  'isOplCodexCliFixedExecutor',
  'shouldShowOplConversationModelSelector',
  'shouldShowOplConversationPermissionModeSelector',
  "backend === 'codex'",
  'const showConversationModelSelector',
  'const showModeSelector',
  "data-testid='acp-sendbox-decision-controls'",
  '<AcpModelSelector conversation_id={conversation_id} backend={backend} waitForWarmup />',
  '(showConversationModelSelector || showModeSelector) ?',
  '<ThoughtDisplay running={isBusy}',
  "placeholder={t('conversation.chat.oplPlaceholder')}",
];

const runtimePageExpected = [
  "const appStateQuery = useOplAppState('fast')",
  'readRuntimeWorkItemProjectionV2(appStateQuery.appState)',
  'const [selectedAgentId, setSelectedAgentId]',
  'const [selectedProjectId, setSelectedProjectId]',
  'const [selectedStatusView, setSelectedStatusView]',
  'projection.projects.filter((project) => project.agentId === selectedAgentId)',
  'scopedVisibleItems.filter((item) => matchesStatusView(item, selectedStatusView))',
  'i18n.resolvedLanguage ?? i18n.language',
  '<RuntimeScopeBar',
  '<RuntimeStatusBar',
  '<RuntimeWorkItemList',
  '<RuntimeDetailDrawer',
  "data-testid='runtime-v2-page'",
];

const runtimeProjectionExpected = [
  'workbench?.work_item_projection_v2',
  'const itemEnvelopeId = requiredString(value.item_id)',
  'const workItemId = requiredString(identity.work_item_id)',
  'const projectedPrimaryStatus = enumValue(lifecycle.primary_state, PRIMARY_STATUSES)',
  'const stageMap = parseStageMap(value.stage_map)',
  'const projectedAction = parseAction(value.action)',
  'const currentStageId = optionalString(execution.current_stage_id) ?? optionalString(lifecycle.current_stage_id)',
  'const nextStageId = optionalString(execution.next_stage_id)',
  'const attemptId = optionalString(execution.attempt_id)',
  'attemptId,',
  'id: itemEnvelopeId',
];

const runtimeStagePopoverExpected = [
  "data-testid='runtime-stage-popover'",
  "data-testid='runtime-stage-attempt'",
  "data-testid='runtime-stage-trigger'",
  'item.execution.attemptId',
  'item.stageMap.map',
  'event.stopPropagation()',
];

const runtimeFocusedTestsExpected = [
  'keeps platform maintenance actions and operator drilldown out of the project Runtime page',
  'opens a stage popup with the complete stage list and current attempt',
  'shows all nine visible items and keeps repeated work item ids distinct by canonical item id',
  'rejects an item envelope that does not match its canonical identity',
  'preserves projected stages and actions for the detail view',
  'never promotes a telemetry verification attempt to the business stage of a delivered item',
];

const runtimePageForbidden = [
  'normalizeRuntimeProjection',
  'dedupeTaskItems',
  'runtimeTaskItem(',
  'appStateToRuntimeProjection(',
  'compactCurrentControlState(',
  'controlStateFallbackForTask(',
  'record(controlState?.provider_run)',
  'getDrilldown.invoke',
  'RuntimeCockpitPanel',
  'AgentAvailability',
];

export function assertRuntimePageSourceBoundary(runtimePage: string): void {
  assertTextExcludesAll(runtimePage, runtimePageForbidden, 'Active shell Runtime page provider/run fallbacks');
}

function validateGuidHomeImplementation(shellPaths) {
  const guidPage = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/guid/GuidPage.tsx',
    guidHomeExpected,
    'Active shell Guid home',
  );
  const guidInputCard = readShellText(shellPaths, 'packages/desktop/src/renderer/pages/guid/components/GuidInputCard.tsx');
  const homeStarters = readShellText(shellPaths, 'packages/desktop/src/renderer/pages/guid/components/HomeStarters.tsx');
  const guidStyles = readShellText(shellPaths, 'packages/desktop/src/renderer/pages/guid/index.module.css');
  const capabilitiesPage = readShellText(shellPaths, 'packages/desktop/src/renderer/pages/guid/CapabilitiesPage.tsx');
  assertCurrentGuidHomeSelectionSources({ guidPage, guidInputCard, homeStarters, guidStyles, capabilitiesPage });
  assertProjectlessGuidFileAccessSources(guidPage);
  for (const [locale, expectedStrings] of Object.entries(guidLocaleExpected)) {
    const localeText = readShellText(shellPaths, `packages/desktop/src/renderer/services/i18n/locales/${locale}/guid.json`);
    assertTextIncludesAll(localeText, expectedStrings, `Active shell ${locale} Guid locale post-install self-check copy`);
  }
  assertTextExcludesAll(`${guidPage}\n${guidInputCard}`, guidHomeRuntimeForbidden, 'Active shell ordinary Home runtime activity');
  assertTextExcludesAll(guidInputCard, ["data-testid='guid-activity-center'", 'guid.activity.needsAttention', 'guid.activity.recentProjects'], 'Active shell ordinary Home expanded activity groups near input');
  assertTextExcludesAll(guidInputCard, ['artifact_body', 'memory_body', 'domain_artifact_body'], 'Active shell Guid composer domain artifact or memory bodies');
  return guidPage;
}

function validateGuidAgentSelection(shellPaths) {
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/guid/hooks/useGuidAgentSelection.ts',
    [
      'getOplDefaultExecutorAgentKey',
      'resolveOplDefaultAgentKey(undefined)',
      'assistantRuntimeKey',
      'const runtimeKey = assistantRuntimeKey(assistant) || getOplDefaultExecutorAgentKey()',
      "agent_type: assistant.agent?.type || 'acp'",
      'backend: runtimeKey',
      'useState<string>(CODEX_MODE_NATIVE_FULL_ACCESS)',
      'preselectAgentKey && availableAgents.some((a) => getAgentKey(a) === preselectAgentKey)',
      'const savedAgent = availableAgents.find((agent) => getAgentKey(agent) === savedKey)',
      'if (savedAgent && !savedAgent.is_preset)',
      '_setSelectedAgentKey(getDefaultAgentKey(availableAgents))',
    ],
    'Active shell Guid agent selection App-owned default',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/guid/hooks/useGuidMention.ts',
    [
      'setSelectedAgentKey(key)',
      'setInput((prev) => stripMentionToken(prev))',
      'setMentionSelectorVisible(true)',
    ],
    'Active shell explicit @Agent single-owner selection',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'tests/unit/guid/useGuidAgentSelection.dom.test.ts',
    [
      'selects an explicit Agent mention as the single session owner',
      'selectionEnabled: true',
      "selectMentionAgent('custom:oma')",
      "toHaveBeenCalledWith('custom:oma')",
    ],
    'Active shell explicit @Agent selection regression',
  );
}

function assertProductProfileFrontierModelPreferenceOrder(productProfileJson) {
  const actual = productProfileJson?.codex?.auto_model_policy?.frontier_model_preference_order;
  const expected = [
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.2',
  ];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Active shell product profile must carry App Codex known frontier_model_preference_order=${JSON.stringify(expected)}`,
    );
  }
}

function validateProductProfileDefaults(shellPaths) {
  const productProfilePath = 'packages/desktop/src/common/config/oplProductProfile/oplProductProfile.generated.json';
  const productProfile = readShellText(shellPaths, productProfilePath);
  const productProfileJson = readShellJson(shellPaths, productProfilePath, 'product profile');
  for (const field of [
    'professional_agent_packages',
    'professional_agent_packages_metadata_policy',
    'default_assistants',
    'non_default_assistants',
  ]) {
    if (Object.prototype.hasOwnProperty.call(productProfileJson?.gui ?? {}, field)) {
      throw new Error(`Active shell product profile must not carry App-owned Agent presentation authority gui.${field}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(productProfileJson?.gui?.home ?? {}, 'home_purpose_entries')) {
    throw new Error(
      'Active shell product profile must not carry App-owned Agent presentation authority gui.home.home_purpose_entries',
    );
  }
  for (const field of [
    'opl_app_session_context',
    'default_visible_skills',
    'skill_priority',
    'session_context_lines',
    'session_context_i18n',
  ]) {
    if (Object.prototype.hasOwnProperty.call(productProfileJson?.codex ?? {}, field)) {
      throw new Error(`Active shell product profile must not carry legacy Codex authority codex.${field}`);
    }
  }
  const additionalInstructions = productProfileJson?.codex?.new_conversation_additional_instructions;
  if (
    additionalInstructions?.content_owner !== 'user' ||
    additionalInstructions?.delivery !== 'new_conversation_additional_instructions_only' ||
    additionalInstructions?.storage_key !== 'codex.oplAppSessionContextAdditional' ||
    additionalInstructions?.storage_key_status !== 'legacy_compatibility_storage_key' ||
    additionalInstructions?.generated_base_context_allowed !== false ||
    additionalInstructions?.agent_route_fallback_allowed !== false ||
    additionalInstructions?.empty_value_policy !== 'inject_nothing' ||
    additionalInstructions?.reset_behavior !== 'clear_additional_instructions' ||
    additionalInstructions?.effect !== 'next_new_conversation'
  ) {
    throw new Error('Active shell product profile must limit new-conversation additions to optional user-authored text');
  }
  const ordinaryPolicy = productProfileJson?.gui?.ordinary_capability_selector_policy;
  if (
    ordinaryPolicy?.authority !== 'owner_or_carrier_skill_projection_and_mcp_negative_filter' ||
    ordinaryPolicy?.agent_reference_admission_policy?.active_agent_package_cardinality !== 'zero_or_one' ||
    ordinaryPolicy?.agent_reference_admission_policy?.selection_authority !==
      'home_starter_new_session_capability_palette_explicit_capability_route_or_explicit_pre_send_at_mention_agent_selection' ||
    ordinaryPolicy?.agent_reference_admission_policy?.at_mention_agent_selection_allowed !== true ||
    ordinaryPolicy?.agent_reference_admission_policy?.at_mention_semantics !==
      'explicit_new_session_agent_selection_before_first_send_plain_text_references_remain_prompt_context' ||
    ordinaryPolicy?.agent_reference_admission_policy?.plain_text_agent_reference_changes_active_package !== false ||
    ordinaryPolicy?.agent_reference_admission_policy?.multiple_agent_reference_policy !==
      'latest_explicit_pre_send_at_mention_selection_sets_the_new_session_agent_plain_text_references_remain_prompt_context' ||
    ordinaryPolicy?.agent_reference_admission_policy?.existing_conversation_rebinding_allowed !== false ||
    ordinaryPolicy?.agent_reference_admission_policy?.existing_conversation_rebinding_contract !== undefined ||
    ordinaryPolicy?.mcp_menu_policy !==
      'preserve_configured_user_and_third_party_servers_except_explicit_forbidden_matchers' ||
    ordinaryPolicy?.visible_mcp_server_ids !== undefined ||
    ordinaryPolicy?.forbidden_skill_examples !== undefined
  ) {
    throw new Error('Active shell product profile must carry new-session-only Agent selection and MCP negative-filter authority');
  }
  const agentPaletteGroup = productProfileJson?.gui?.ordinary_conversation?.unified_context_menu?.groups?.find(
    (group: { id?: unknown }) => group.id === 'agent_packages',
  );
  if (
    agentPaletteGroup?.scope !== 'new_session_configuration_only' ||
    agentPaletteGroup?.existing_session_rebinding_allowed !== false ||
    JSON.stringify(agentPaletteGroup?.surface_actions?.existing_conversation) !== '[]'
  ) {
    throw new Error('Active shell product profile must not expose existing-conversation Agent rebinding');
  }
  assertTextExcludesAll(
    productProfile,
    [
      'aioncore_atomic_conversation_owner_rebind_api',
      'explicit_at_mention_owner_rebind_via_core_atomic_api',
      'existing_conversation_rebinding_contract',
    ],
    'Active shell product profile private existing-conversation Agent rebind removal',
  );
  assertProductProfileFrontierModelPreferenceOrder(productProfileJson);
  const menuStructure = productProfileJson?.gui?.home?.codex_model_display_options?.menu_structure;
  if (JSON.stringify(menuStructure) !== JSON.stringify(codexSessionConfigurationMenuStructureExpected)) {
    throw new Error('Active shell product profile must carry the exact App Codex session configuration menu');
  }
  assertTextIncludesAll(productProfile, productProfileDefaultsExpected, 'Active shell product profile App Codex default');
}

function validateStaticAuthorityConsumerRemoval(shellPaths) {
  const profileLoader = readShellText(
    shellPaths,
    'packages/desktop/src/common/config/oplProductProfile/index.ts',
  );
  assertTextIncludesAll(
    profileLoader,
    [
      "authority: 'owner_or_carrier_skill_projection_and_mcp_negative_filter'",
      "conversation_loaded_skill_display_policy: 'preserve_owner_or_carrier_projected_loaded_skills'",
      'getOplNewConversationAdditionalInstructionsPolicy',
      "value.content_owner !== 'user'",
      "value.empty_value_policy !== 'inject_nothing'",
      'return names.flatMap((name) =>',
      'return skills.flatMap((skill) =>',
    ],
    'Active shell Product Profile dynamic Skill and user-instruction consumers',
  );
  assertTextExcludesAll(
    profileLoader,
    [
      'readProfessionalAgentPackages',
      'readDefaultHomeAssistants',
      'readNonDefaultAssistants',
      'readHomePurposeEntries',
      'getOplProfessionalAgentPackage',
      'getOplProfessionalAgentPackages',
      'getOplDefaultHomeAssistants',
      'getOplDefaultCodexSkills',
      'getOplSkillPriority',
      'getOplAppSessionContextPolicy',
      'getOplCodexSessionContextForLocale',
      'getOplDefaultPackagedCodexSkills',
      'getOplPackagedCodexSkills',
      "const forbidden = new Set(OPL_PRODUCT_PROFILE.gui.ordinary_capability_selector_policy.forbidden_skill_examples)",
    ],
    'Active shell retired static Product Profile consumers',
  );

  const conversationParams = readShellText(
    shellPaths,
    'packages/desktop/src/common/utils/buildAgentConversationParams.ts',
  );
  assertTextIncludesAll(
    conversationParams,
    [
      'mergeNewConversationInstructions',
      "configService.get('codex.oplAppSessionContextAdditional')?.trim()",
      'if (presetContext) extra.preset_context = presetContext',
      'if (additionalInstructions)',
    ],
    'Active shell optional user-authored new-conversation instructions',
  );
  assertTextExcludesAll(
    conversationParams,
    [
      'getOplAppSessionContextPolicy',
      'getOplCodexSessionContextForLocale',
      'resolveEffectiveOplAppSessionContext',
      'opl_app_session_context',
      'appState',
      '## Additional User Instructions',
      '## 用户附加说明',
    ],
    'Active shell generated session-context fallback and diagnostics',
  );

  const ipcBridge = readShellText(shellPaths, 'packages/desktop/src/common/adapter/ipcBridge.ts');
  assertTextExcludesAll(
    ipcBridge,
    ['opl_app_session_context'],
    'Active shell retired session-context diagnostics IPC type',
  );

  const personalization = readShellText(
    shellPaths,
    'packages/desktop/src/renderer/components/settings/SettingsModal/contents/SystemModalContent/OplPersonalizationSettings.tsx',
  );
  assertTextIncludesAll(
    personalization,
    [
      "id='additional-instructions'",
      "data-testid='settings-additional-instructions-editor'",
      "configService.set('codex.oplAppSessionContextAdditional', additionalContextDraft)",
      "configService.set('codex.oplAppSessionContextAdditional', '')",
    ],
    'Active shell user-authored additional-instructions settings surface',
  );
  assertTextExcludesAll(
    personalization,
    [
      'resolveEffectiveOplAppSessionContext',
      'generatedContext',
      'settings-generated-context-action',
      'settings-generated-context-preview',
      'agent_packages',
    ],
    'Active shell generated Agent guidance preview and route fallback',
  );
}

function validateExistingConversationAgentRebindRemoval(shellPaths) {
  for (const retiredPath of [
    'packages/desktop/src/renderer/pages/conversation/components/ConversationAgentRebindControl.tsx',
    'tests/unit/conversation/ConversationAgentRebindControl.dom.test.tsx',
  ]) {
    if (existsSync(path.join(shellPaths.shellRoot, retiredPath))) {
      throw new Error(`Active shell must remove private existing-conversation Agent rebind surface ${retiredPath}`);
    }
  }

  for (const [sourcePath, forbidden] of [
    [
      'packages/desktop/src/common/adapter/ipcBridge.ts',
      ['rebindAssistant', '/assistant/rebind', 'IRebindConversationAssistantParams'],
    ],
    [
      'packages/desktop/src/common/config/storage.ts',
      ['TConversationAssistantIdentity', 'assistant?: TConversationAssistantIdentity'],
    ],
    [
      'packages/desktop/src/common/config/oplProductProfile/index.ts',
      ['existing_conversation_rebinding_contract', 'aioncore_atomic_conversation_owner_rebind_api', 'REQUIRED_AGENT_REBIND'],
    ],
    ['packages/desktop/src/renderer/hooks/agent/usePresetAssistantInfo.ts', ['conversation.assistant']],
    [
      'packages/desktop/src/renderer/pages/conversation/components/ChatConversation.tsx',
      ['ConversationAgentRebindControl'],
    ],
    ['tests/unit/common-adapter/ipcBridgeAgents.test.ts', ['rebindAssistant', '/assistant/rebind']],
  ] as const) {
    assertTextExcludesAll(
      readShellText(shellPaths, sourcePath),
      forbidden,
      `Active shell private existing-conversation Agent rebind removal in ${sourcePath}`,
    );
  }
}

function validateGuidAssistantRegistry(shellPaths) {
  assertShellTextIncludesAll(shellPaths, 'packages/desktop/src/common/types/codex/codexModels.ts', codexModelsExpected, 'Active shell Codex model policy App-owned default options before ACP handshake');
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/common/types/opl/appState.ts',
    ['parseOplStandardAgentDirectoryEntries', "value.package_role !== 'standard_agent'"],
    'Active shell shared standard-Agent directory parser',
  );
  const guidAssistants = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/guid/utils/oplHomeAssistants.ts',
    guidAssistantsExpected,
    'Active shell Guid assistants dynamic directory and exact backend binding',
  );
  assertTextDoesNotMatch(
    guidAssistants,
    /getOplDefaultHomeAssistants|getOplDefaultExecutorAgentKey|DEFAULT_PRESET_AGENT_TYPE|preset_agent_type:/,
    'Active shell Guid Agent directory must not restore fixed Profile membership or guessed executor identity.',
  );
}

function validateGuidSkillRules(shellPaths, guidPage) {
  assertTextIncludesAll(guidPage, guidPageSkillExpected, 'Active shell Guid page App assistant skill profile rule');
  assertTextExcludesAll(
    guidPage,
    ['const effectiveGuidEnabledSkills = guidEnabledSkills', 'buildAssistantScopedSkillMenuItems(allSkills, undefined)'],
    'Active shell retired static App assistant skill profile rule',
  );
  assertShellTextIncludesAll(shellPaths, 'packages/desktop/src/renderer/pages/guid/utils/assistantSkillMenu.ts', ['buildAssistantScopedSkillMenuItems', 'mergeRequiredSkills', 'required_skills', 'locked: isRequired'], 'Active shell Guid skill menu App assistant skill profile rule');
  assertShellTextIncludesAll(shellPaths, 'packages/desktop/src/renderer/pages/guid/components/GuidActionRow.tsx', ['GuidSkillMenuItem', 'isGuidSkillChecked', 'skill.locked', 'disabled: skill.locked'], 'Active shell Guid action row required assistant skills');
  const guidSend = assertShellTextIncludesAll(shellPaths, 'packages/desktop/src/renderer/pages/guid/hooks/useGuidSend.ts', ['activeShortcut', 'preset_enabled_skills'], 'Active shell Guid send App shortcut route/skill signal');
  assertTextExcludesAll(
    guidSend,
    ['buildOplShortcutRouteReceipt', 'opl_assistant_route'],
    'Active shell retired duplicate Guid shortcut route receipt',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'tests/unit/guid/useGuidSend.oplWhitelist.dom.test.tsx',
    [
      'preserves configured MCP servers while filtering forbidden Team MCP servers',
      "expect(payload.extra.selected_mcp_server_ids).toEqual(['unknown-mcp', 'cron'])",
    ],
    'Active shell Guid MCP negative-filter send regression',
  );
  assertShellTextIncludesAll(shellPaths, 'packages/desktop/src/renderer/pages/guid/utils/activeShortcut.ts', ['OplActiveShortcut', 'resolveOplActiveShortcut', 'required_skill_ids'], 'Active shell Guid shortcut identity signal');
  assertShellTextIncludesAll(shellPaths, 'packages/desktop/src/common/utils/buildAgentConversationParams.ts', ['preset_enabled_skills'], 'Active shell create conversation App assistant route/skill signal');
}

function validateGuidAssistantsAndSkills(shellPaths, guidPage) {
  validateGuidAssistantRegistry(shellPaths);
  validateGuidSkillRules(shellPaths, guidPage);
}

function validateCodexSessionConfigurationMenuImplementation(shellPaths) {
  const sessionMenu = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/components/agent/OplCodexSessionMenu.tsx',
    [
      "type SessionMenuGroup = 'model' | 'reasoning'",
      "data-testid='opl-codex-session-menu'",
      "data-testid='opl-codex-session-menu-reset'",
      "renderSummaryItem('model'",
      "'reasoning'",
      "role='separator'",
      'onReset();',
      '<Refresh {...OPL_CHROME_ICON_PROPS} size={16}',
      "event.key === 'ArrowLeft'",
      "event.key === 'Escape'",
      "['ArrowDown', 'ArrowUp', 'Home', 'End']",
    ],
    'Active shell shared Codex session configuration menu',
  );
  const guidModelSelector = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/guid/components/GuidModelSelector.tsx',
    ['OplCodexSessionMenu', '<OplCodexSessionMenu', 'onReset={restoreCodexAutoSelection}'],
    'Active shell Home Codex session configuration menu',
  );
  const acpModelSelector = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/components/agent/AcpModelSelector.tsx',
    ['OplCodexSessionMenu', '<OplCodexSessionMenu', 'onReset={handleAutoSelect}'],
    'Active shell conversation Codex session configuration menu',
  );
  const guidActionRow = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/guid/components/GuidActionRow.tsx',
    ["key: 'reset-session-defaults'", "t('agent.sessionConfiguration.resetDefaults')", 'onChange(null, null)'],
    'Active shell mobile Home Codex reset action',
  );
  const acpSendBox = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx',
    ["key: 'reset-session-defaults'", "t('agent.sessionConfiguration.resetDefaults')", 'handleSheetAutoSelect'],
    'Active shell mobile conversation Codex reset action',
  );
  const i18nKeys = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts',
    [
      'agent.sessionConfiguration.menuLabel',
      'agent.sessionConfiguration.model',
      'agent.sessionConfiguration.reasoning',
      'agent.sessionConfiguration.resetDefaults',
    ],
    'Active shell Codex session configuration i18n keys',
  );
  const modelMenuSources = [
    sessionMenu,
    guidModelSelector,
    acpModelSelector,
    guidActionRow,
    acpSendBox,
    i18nKeys,
  ].join('\n');
  assertTextDoesNotMatch(
    modelMenuSources,
    /sessionConfiguration\.speed|\bspeed(?:Fast|Standard|SwitchSuccess)?\b|速度/i,
    'Active shell Codex session configuration must not retain speed controls or copy',
  );
  const expectedLocales = {
    'zh-CN': {
      menuLabel: '模型与推理设置',
      model: '模型',
      reasoning: '推理强度',
      resetDefaults: '重置为默认设置',
    },
    'en-US': {
      menuLabel: 'Model and reasoning settings',
      model: 'Model',
      reasoning: 'Reasoning',
      resetDefaults: 'Reset to defaults',
    },
  };
  for (const [locale, expected] of Object.entries(expectedLocales)) {
    const agentLocale = readShellJson(
      shellPaths,
      `packages/desktop/src/renderer/services/i18n/locales/${locale}/agent.json`,
      `${locale} agent locale`,
    );
    if (JSON.stringify(agentLocale?.sessionConfiguration) !== JSON.stringify(expected)) {
      throw new Error(`Active shell ${locale} Codex session configuration copy must match App authority exactly`);
    }
  }
}

function validateCodexModelControls(shellPaths) {
  validateCodexSessionConfigurationMenuImplementation(shellPaths);
  assertShellTextIncludesAll(shellPaths, 'packages/desktop/src/renderer/pages/guid/utils/composerSurface.ts', ['getOplHomeComposerStateContract', 'resolveOplHomeComposerSurface', 'contract.executor', 'contract.invariants.model_reasoning_visible', 'contract.invariants.permission_access_visible', 'contract.invariants.executor_selector_visible'], 'Active shell Home composer App-contract decision surface');
  assertShellTextIncludesAll(shellPaths, 'packages/desktop/src/renderer/components/agent/AcpModelSelector.tsx', ['useAcpModelInfo', 'canSwitch', 'if (!canSwitch)', 'selectAutoModel()', 'onSelect: handleAutoSelect'], 'Active shell ACP model selector fixed Codex model guard');
  assertShellTextIncludesAll(shellPaths, 'packages/desktop/src/renderer/hooks/agent/useAcpModelInfo.ts', ['isOplCodexCliFixedExecutor', 'shouldShowOplCodexModelList', "backend === 'codex'", 'shouldShowOplCodexModelList()', "backend === 'codex' ? normalizeCodexModelInfo(nextModelInfo) : nextModelInfo", 'reportedCodexCurrentModelIdRef', 'reportedCodexCurrentModelIdRef.current ?? model_info.current_model_id', 'updateModelInfo(info)', 'updateModelInfo(incoming)', 'updateModelInfo(confirmedModelInfo)', 'selectAutoModel', 'selectReasoningEffort', 'savePreferredCodexSelection(backend, null, null)', 'savePreferredCodexSelection(backend, currentModelId, value)', 'canSwitch'], 'Active shell ACP model hook App-owned Codex model controls');
  assertShellTextIncludesAll(shellPaths, 'packages/desktop/src/renderer/utils/model/oplCodexModelDisplay.ts', ['resolveOplCodexAutoSelection'], 'Active shell Codex Auto option resolved target display');
  assertShellTextIncludesAll(shellPaths, 'packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx', ['useAcpModelInfo', 'selectAutoModel', 'handleSheetAutoSelect', 'onClick: handleSheetAutoSelect'], 'Active shell mobile ACP model selector shared Auto resolver');
  const modelControls = [
    readShellText(shellPaths, 'packages/desktop/src/renderer/pages/guid/components/GuidModelSelector.tsx'),
    readShellText(shellPaths, 'packages/desktop/src/renderer/components/agent/AcpModelSelector.tsx'),
  ].join('\n');
  assertTextDoesNotMatch(modelControls, /\bBrain\b/, 'Active shell ordinary model/reasoning controls must not render brain icons');
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/components/opl/OplRefreshIconButton.tsx',
    ["Refresh } from '@icon-park/react'", "theme='outline'", "fill='currentColor'", 'aria-label={label}', '<Tooltip content={label}>'],
    'Active shell OPL refresh icon button',
  );
  for (const settingsSurface of [
    'packages/desktop/src/renderer/pages/settings/sections/LocalServicesSettings.tsx',
    'packages/desktop/src/renderer/pages/settings/StorageSettings/index.tsx',
    'packages/desktop/src/renderer/pages/settings/CapabilitiesSettings.tsx',
    'packages/desktop/src/renderer/pages/settings/sections/AccessSettings.tsx',
    'packages/desktop/src/renderer/pages/settings/sections/RuntimeSettings.tsx',
  ]) {
    assertShellTextIncludesAll(shellPaths, settingsSurface, ['OplRefreshIconButton'], 'Active shell OPL icon-only refresh surface');
  }
}

function validateCodexConversationSurfaces(shellPaths) {
  const chatConversation = readShellText(
    shellPaths,
    'packages/desktop/src/renderer/pages/conversation/components/ChatConversation.tsx',
  );
  assertTextExcludesAll(
    chatConversation,
    ['shouldShowOplConversationModelSelector', 'AcpModelSelector'],
    'Active shell ordinary Codex conversation duplicate header model selector',
  );
  const acpSendBox = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx',
    acpSendBoxExpected,
    'Active shell ordinary Codex conversation composer model and permission selectors',
  );
  assertTextExcludesAll(
    acpSendBox,
    [
      'getOplModelStatusDisplayText',
      "data-testid='opl-conversation-model-status'",
      "t('acp.sendbox.placeholder'",
    ],
    'Active shell ordinary Codex conversation duplicate model status or backend-owned placeholder',
  );
  const aionrsSendBox = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx',
    ["placeholder={t('conversation.chat.oplPlaceholder')}"],
    'Active shell ordinary AionRS conversation OPL-owned placeholder',
  );
  assertTextExcludesAll(
    aionrsSendBox,
    ["t('acp.sendbox.placeholder'"],
    'Active shell ordinary AionRS conversation backend-owned placeholder',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/services/i18n/locales/zh-CN/conversation.json',
    ['"oplPlaceholder": "向 One Person Lab 提问或安排任务..."'],
    'Active shell zh-CN OPL conversation placeholder',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/services/i18n/locales/en-US/conversation.json',
    ['"oplPlaceholder": "Ask One Person Lab anything..."'],
    'Active shell en-US OPL conversation placeholder',
  );
  assertShellTextIncludesAll(shellPaths, 'packages/desktop/src/renderer/pages/conversation/platforms/acp/useAcpInitialMessage.ts', ["import { warmupConversation } from '../../utils/warmupConversation'", 'await warmupConversation(conversation_id)', 'ipcBridge.acpConversation.sendMessage.invoke'], 'Active shell ACP initial-message flow warm up before first send');
  assertShellTextIncludesAll(shellPaths, 'packages/desktop/src/renderer/components/chat/ThoughtDisplay.tsx', ['formatElapsedTime', "t('conversation.chat.processing')", 'elapsedTime'], 'Active shell ThoughtDisplay elapsed processing feedback');
}

function validateSendFailureDraftPreservation(shellPaths) {
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/hooks/chat/useSendBoxDraft.ts',
    [
      'export const mergeFailedSendContent',
      'export const mergeFailedSendDraft',
      'currentContent.startsWith(`${failedContent}\\n\\n`)',
      'new Set([...failedFiles.filter(Boolean), ...currentDraft.uploadFile.filter(Boolean)])',
    ],
    'Active shell failed-send draft merge helper',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/guid/hooks/useGuidSend.ts',
    [
      'handleSend: () => Promise<boolean>',
      '.then((accepted) =>',
      'if (!accepted) return',
      "setInput((currentInput) => (currentInput === sentInput ? '' : currentInput))",
      'setFiles((currentFiles) => currentFiles.filter((file) => !sentFiles.has(file)))',
    ],
    'Active shell Home conversation-creation draft preservation',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx',
    [
      'mergeFailedSendDraft',
      'restoreFailedSend(message, allFiles)',
      'restoreFailedSend,',
    ],
    'Active shell ACP failed-send draft restoration',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/conversation/platforms/acp/useAcpInitialMessage.ts',
    [
      'restoreFailedSend: (input: string, files: string[]) => void',
      'restoreFailedSend(input, files)',
    ],
    'Active shell ACP initial-message draft restoration',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx',
    [
      'mergeFailedSendDraft',
      'restoreFailedSend(input, initialFiles)',
      'restoreFailedSend(message, filesToSend)',
    ],
    'Active shell AionRS initial and in-conversation draft restoration',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'tests/unit/guid/useGuidSend.oplWhitelist.dom.test.tsx',
    [
      'preserves the Home draft when conversation creation returns no conversation',
      'preserves the Home draft when conversation creation rejects',
      'consumes only the accepted Home snapshot and keeps post-submit input',
    ],
    'Active shell Home failed-create regressions',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'tests/unit/renderer/useAcpInitialMessage.dom.test.ts',
    [
      'restores the GUID initial prompt and attachments when the first send fails',
      'merges a failed snapshot ahead of new input and deduplicates attachments by path',
    ],
    'Active shell initial-message and shared draft-merge regressions',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'tests/unit/renderer/AcpSendBox.dom.test.tsx',
    ['restores the failed prompt and attachments without overwriting input typed while waiting'],
    'Active shell ACP in-conversation failed-send regression',
  );
}

function validateCodexConversationImplementation(shellPaths) {
  validateCodexModelControls(shellPaths);
  validateCodexConversationSurfaces(shellPaths);
  validateSendFailureDraftPreservation(shellPaths);
}

function validateComposerCapabilityPaletteImplementation(shellPaths) {
  const palette = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/components/chat/composer/ComposerCapabilityPalette/ComposerCapabilityPalette.tsx',
    [
      'export type ComposerCapabilityPaletteItem',
      'export type ComposerCapabilityPaletteGroup',
      'verticalOffset: Math.max(8, triggerRect.top - composerRect.top + 8)',
      'item.description',
      'item.keywords',
      "role='dialog'",
      "data-capability-palette-scroll-region='true'",
      "event.key === 'ArrowDown'",
      "event.key === 'ArrowUp'",
      "event.key === 'Home'",
      "event.key === 'End'",
      "event.key === 'Escape'",
      'searchRef.current?.focus()',
      'focusTrigger()',
      'data-capability-palette-vertical-offset',
      'geometry?.verticalOffset ?? 8',
    ],
    'Active shell shared composer capability palette behavior',
  );
  assertTextExcludesAll(
    palette,
    ['openFileSelector', 'openDirectorySelector', 'workspaceDir'],
    'Active shell shared composer capability palette product-action isolation',
  );

  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/components/chat/composer/ComposerCapabilityPalette/ComposerCapabilityPalette.module.css',
    [
      'width: min(736px, calc(100vw - 32px))',
      'box-sizing: border-box',
      'overflow: hidden',
      'overflow-y: auto',
      'scrollbar-gutter: stable',
      'grid-template-columns: 20px minmax(0, 1fr) auto',
    ],
    'Active shell composer-width palette geometry and internal scrolling',
  );

  const guidPalette = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/guid/components/GuidActionRow.tsx',
    [
      'ComposerCapabilityPalette',
      "id: 'local_inputs'",
      "id: 'agent_packages'",
      "id: 'skills'",
      "id: 'session_modes'",
      "id: 'apps_and_connections'",
      'filterNonPermissionAccessModes',
      'assistants: OplHomeAssistant[]',
      'resolveOplPackageLaunchGate(appState, assistant.opl_package_id)',
      'activeCapabilityId === assistant.opl_shortcut_id',
      'onSelectCapability?.(assistant.opl_shortcut_id)',
      'allSkills.forEach((skill) =>',
      'isGuidSkillChecked',
      'disabled: skill.locked',
      'horizontalOffset={-8}',
    ],
    'Active shell Home capability palette machine groups',
  );
  assertTextExcludesAll(
    guidPalette,
    [
      "key='workspace'",
      "id: 'working_directory'",
      '<Dropdown trigger=',
      'openWorkspacePicker',
      'getOplHomePurposeAssistantIds',
      'resolveOplProfessionalAgentAssistants',
      'getOplProfessionalAgentPackages',
      '.flatMap((assistant) => assistant.enabled_skills ?? [])',
    ],
    'Active shell Home capability palette forbidden working-directory and legacy dropdown entries',
  );

  const conversationPalette = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/components/media/FileAttachButton.tsx',
    [
      'ComposerCapabilityPalette',
      "id: 'local_inputs'",
      "id: 'agent_packages'",
      "id: 'skills'",
      "id: 'session_modes'",
      "id: 'apps_and_connections'",
      'loadedSkills',
      'loadedMcpStatuses',
      'filterOplOrdinarySkillNames',
      'filterOplOrdinaryMcpStatuses',
      'horizontalOffset={-16}',
    ],
    'Active shell existing-conversation capability palette machine groups',
  );
  assertTextExcludesAll(
    conversationPalette,
    [
      'if (isDesktop && !hasSkills && !hasMcpServers)',
      'onClick={openFileSelector}',
      "id: 'add'",
      "id: 'capabilities'",
      "id: 'controls'",
      'controlItems',
      "id: 'working_directory'",
    ],
    'Active shell existing-conversation palette fallback and legacy grouping',
  );

  const paletteTests = [
    readShellText(shellPaths, 'tests/unit/chat/ComposerCapabilityPalette.dom.test.tsx'),
    readShellText(shellPaths, 'tests/unit/media/FileAttachButton.oplWhitelist.dom.test.tsx'),
  ].join('\n');
  assertTextIncludesAll(
    paletteTests,
    [
      'one internal scroll region',
      'keeps the palette above the composer instead of the trigger button',
      'native Enter activation, Escape, and focus return',
      'explicit empty capability state instead of invoking the file picker',
      'openFileSelector).not.toHaveBeenCalled()',
      "id: 'local_inputs'",
      "id: 'agent_packages'",
      "id: 'skills'",
      "id: 'session_modes'",
      "id: 'apps_and_connections'",
    ],
    'Active shell capability palette regressions',
  );
}

function validateSessionFirstDirectoryImplementation(shellPaths) {
  const guidPage = readShellText(shellPaths, 'packages/desktop/src/renderer/pages/guid/GuidPage.tsx');
  for (const retiredPath of [
    'packages/desktop/src/renderer/components/layout/Sider/ProjectContextSection.tsx',
    'packages/desktop/src/renderer/utils/workspace/projectContext.ts',
    'packages/desktop/src/renderer/pages/guid/components/GuidWorkspaceFootnote.tsx',
  ]) {
    if (existsSync(path.join(shellPaths.shellRoot, retiredPath))) {
      throw new Error(`Active shell session-first directory must remove retired workspace context surface ${retiredPath}`);
    }
  }

  for (const sourcePath of [
    'packages/desktop/src/common/config/configKeys.ts',
    'packages/desktop/src/renderer/pages/conversation/GroupedHistory/index.tsx',
    'packages/desktop/src/renderer/pages/guid/GuidPage.tsx',
    'packages/desktop/src/renderer/pages/guid/components/GuidInputCard.tsx',
    'packages/desktop/src/renderer/pages/guid/components/GuidActionRow.tsx',
    'packages/desktop/src/renderer/pages/guid/hooks/useGuidSend.ts',
  ]) {
    assertTextExcludesAll(
      readShellText(shellPaths, sourcePath),
      ['ProjectContext', 'projectContext', 'project_context_refs', 'workspace.projectContextInputs'],
      `Active shell session-first input surface in ${sourcePath}`,
    );
  }

  const workspaceContextBar = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/guid/components/GuidWorkspaceContextBar.tsx',
    [
      "data-testid='guid-workspace-context-bar'",
      "data-testid='guid-workspace-select'",
      "data-testid='guid-workspace-clear'",
      "properties: ['openDirectory', 'createDirectory']",
      'onSelectWorkspace(selectedDirectory)',
      'onClearWorkspace',
    ],
    'Active shell independent new-session working-directory context bar',
  );
  assertTextExcludesAll(
    workspaceContextBar,
    ['ComposerCapabilityPalette', "key='workspace'", 'workspace.projectContextInputs'],
    'Active shell working-directory context bar palette isolation',
  );
  assertTextIncludesAll(
    guidPage,
    [
      "import GuidWorkspaceContextBar from './components/GuidWorkspaceContextBar'",
      '<GuidWorkspaceContextBar',
      'workspaceDir={guidInput.dir}',
      'onSelectWorkspace={handleWorkspaceSelect}',
      'onClearWorkspace={handleWorkspaceClear}',
    ],
    'Active shell Home working-directory context bar placement',
  );
  const guidActionRow = readShellText(
    shellPaths,
    'packages/desktop/src/renderer/pages/guid/components/GuidActionRow.tsx',
  );
  assertTextExcludesAll(
    guidActionRow,
    [
      "key='workspace'",
      "data-testid='guid-workspace-chip'",
      "data-testid='guid-workspace-clear'",
      'openWorkspacePicker',
    ],
    'Active shell Home capability palette working-directory isolation',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/guid/hooks/useGuidSend.ts',
    ['const initialFiles = Array.from(new Set(files))', 'default_files: initialFiles', 'files: initialFiles.length > 0'],
    'Active shell explicit current-session input projection',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'tests/unit/guid/useGuidSend.oplWhitelist.dom.test.tsx',
    ['sends only explicit session attachments and deduplicates them in insertion order'],
    'Active shell explicit current-session input regression',
  );

  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync.ts',
    [
      'export const mergeCanonicalThreadDirectory',
      'if (!directory) return localConversations',
      'const returnedThreadIds = new Set(directory.threads.map((thread) => thread.id))',
      'const threadId = canonicalCodexThreadId(conversation)',
      "return conversation.type !== 'acp' || conversation.extra.backend !== 'codex'",
      '...directory.threads.map((thread) => projectCanonicalCodexThread(thread, cachedByThreadId.get(thread.id)))',
    ],
    'Active shell canonical App Server session directory projection',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'tests/unit/conversation/runtime/conversationListSyncGuard.test.ts',
    [
      'drops unmatched stale Codex cache rows when the complete App Server overview is available',
      'retains unmatched non-Codex local rows without title or workspace deduplication',
      'deduplicates local canonical rows only when the App Server returns',
      'falls back to shell cache when the canonical directory is unavailable',
    ],
    'Active shell canonical session directory regressions',
  );

  const threadAdapter = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/process/services/codexAppServer/adapter.ts',
    [
      'function recordedCwd(value: unknown): string',
      "if (typeof value !== 'string') throw new Error('Invalid Codex app-server thread cwd.')",
      'workspace: recordedCwd(raw.cwd)',
      "result = await this.rpc.request('thread/read', { threadId, includeTurns: true })",
      "await this.rpc.request('thread/resume', { threadId, excludeTurns: false })",
      "await this.rpc.request('thread/settings/update'",
      'async updateThreadSettings(',
    ],
    'Active shell single canonical App Server thread adapter',
  );
  assertTextExcludesAll(
    threadAdapter,
    [
      'gitInfo?.originUrl',
      'runtimeWorkspaceRoots',
      'workspace_handoff',
      'adoptProjectlessThread',
    ],
    'Active shell Project identity and adoption adapter private-layer boundary',
  );
  assertTextExcludesAll(
    [
      readShellText(shellPaths, 'packages/desktop/src/common/types/codex/appServerThreads.ts'),
      readShellText(shellPaths, 'packages/desktop/src/common/adapter/ipcBridge.ts'),
      readShellText(shellPaths, 'packages/desktop/src/process/bridge/codexAppServerBridge.ts'),
    ].join('\n'),
    ['CodexThreadProjectAdoptionRequest', 'codex-threads.adopt-project', 'adoptProject'],
    'Active shell has no private project-adoption RPC or IPC surface',
  );
  assertTextIncludesAll(
    [
      readShellText(shellPaths, 'packages/desktop/src/common/types/codex/appServerThreads.ts'),
      readShellText(shellPaths, 'packages/desktop/src/common/adapter/ipcBridge.ts'),
      readShellText(shellPaths, 'packages/desktop/src/process/bridge/codexAppServerBridge.ts'),
    ].join('\n'),
    [
      'CodexThreadSettingsUpdateRequest',
      'codex-threads.update-settings',
      'codexThreads.updateSettings',
      'getActiveAdapter().updateThreadSettings',
    ],
    'Active shell existing Codex App Server thread settings transport',
  );
  const projectAffinityLifecycle = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/conversation/GroupedHistory/hooks/canonicalThreadLifecycle.ts',
    [
      'conversation?.extra.custom_workspace === false',
      '!conversation?.extra.workspace?.trim()',
      'const selectedWorkspace = workspace.trim()',
      'ipcBridge.codexThreads.updateSettings.invoke',
      'ipcBridge.codexThreads.read.invoke',
      'canonicalReadback.thread.workspace !== selectedWorkspace',
      'ipcBridge.conversation.update.invoke',
      'ipcBridge.conversation.get.invoke',
      'Canonical thread cwd readback did not match the selected project',
      'custom_workspace: true',
      'return false',
    ],
    'Active shell explicit unbound project adoption lifecycle',
  );
  assertTextExcludesAll(
    projectAffinityLifecycle,
    [
      'conversation?.extra.custom_workspace !== true',
      'conversation.extra.custom_workspace !== true',
      'Boolean(conversation.extra.workspace?.trim())',
      'runtimeWorkspaceRoots',
      'workspace_handoff',
      'codexThreads.adoptProject',
    ],
    'Active shell explicit projectless marker and affinity isolation',
  );
  const conversationListSync = readShellText(
    shellPaths,
    'packages/desktop/src/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync.ts',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/conversation/GroupedHistory/ConversationRow.tsx',
    ["key='move-to-project'", "t('conversation.history.moveToProject')", 'onMoveToProject?.(conversation)'],
    'Active shell keyboard-reachable project adoption menu action',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/conversation/GroupedHistory/index.tsx',
    [
      'draggable={draggable}',
      'handleProjectAdoptionDrop(group.workspace)',
      'isProjectlessCanonicalConversation(conversation)',
      'onMoveToProject:',
    ],
    'Active shell native drag and menu project adoption paths',
  );
  const projectAffinityTests = [
    readShellText(shellPaths, 'tests/unit/codex-app-server/adapter.test.ts'),
    readShellText(shellPaths, 'tests/unit/conversation/runtime/conversationListSyncGuard.test.ts'),
    readShellText(shellPaths, 'tests/unit/conversation/useConversationActions.dom.test.tsx'),
    readShellText(shellPaths, 'tests/unit/conversation/export/GroupedHistoryExportEntry.dom.test.tsx'),
  ].join('\n');
  assertCanonicalThreadAffinityConvergenceSources({
    canonicalThreadLifecycle: projectAffinityLifecycle,
    conversationListSync,
    focusedTests: projectAffinityTests,
    threadAdapter,
  });
  assertCanonicalThreadDirectoryTimeoutBoundarySources({
    focusedTests: projectAffinityTests,
    threadAdapter,
  });
  assertTextIncludesAll(
    projectAffinityTests,
    [
      'keeps directories distinct even when threads share one Git origin',
      'adopts an explicitly projectless canonical conversation without a cached workspace',
      'updates the App Server cwd before committing the local affinity projection',
      'keeps the conversation projectless when canonical cwd readback does not match',
      'blocks reassignment after a canonical cwd is recorded',
      'does not change turn pwd or sandbox writable roots during adoption',
      'moves an eligible projectless row through native drag and drop',
    ],
    'Active shell project affinity focused regressions',
  );

  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/common/chat/normalizeToolCall.ts',
    [
      'export function normalizeSubagentActivities',
      "const ACTIVE_SUBAGENT_STATES = new Set(['pendingInit', 'running'])",
      "const DONE_SUBAGENT_STATES = new Set(['interrupted', 'completed', 'errored', 'shutdown', 'notFound'])",
      'const collaboration = asRecord(codex?.collaboration)',
      'const subagent = asRecord(codex?.subagent)',
      'byThreadId.set(threadId, mergeSubagentActivity(byThreadId.get(threadId), candidate))',
    ],
    'Active shell read-only Codex subagent metadata projection',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/conversation/Messages/components/MessageToolGroupSummary.tsx',
    [
      'normalizeSubagentActivities(messages)',
      "subagents.filter((item) => item.status === 'active')",
      "subagents.filter((item) => item.status === 'done')",
      'projectCanonicalCodexThread(detail.thread, undefined, { materialized: true })',
      "Message.error(t('messages.subagents.openFailed'))",
    ],
    'Active shell Codex subagent Active/Done detail and canonical task projection',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'tests/unit/renderer/messageToolGroupSummary.dom.test.tsx',
    [
      'groups Codex subagents as Active and Done and materializes a canonical task on open',
      'keeps the current conversation usable when a canonical subagent task cannot be opened',
      'reuses a migrated local projection instead of creating a duplicate canonical task',
    ],
    'Active shell Codex subagent read-only UI regressions',
  );

  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/guid/components/GuidInputCard.tsx',
    ["data-testid='guid-input-card-shell'"],
    'Active shell single Home composer marker',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/components/layout/Sider/SiderFooter.tsx',
    ["data-testid={account ? 'sider-footer-account' : 'sider-footer-settings'}"],
    'Active shell single account or Settings footer marker',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/guid/index.module.css',
    ['.guidContainer {', 'background: var(--bg-base);'],
    'Active shell Home repaint background',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'tests/e2e/features/visual-evidence/gui-baseline.e2e.ts',
    [
      'const GUI_BASELINE_FIXTURE_MARKER',
      'async function removeFixtureConversations',
      'await expect(homeEntry).toHaveCount(1)',
      "page.locator('[data-testid=\"guid-input-card-shell\"]')",
      "page.locator('[data-testid=\"sider-footer-account\"], [data-testid=\"sider-footer-settings\"]')",
      'await waitForStablePaint(page)',
    ],
    'Active shell single-instance Home visual regression',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/process/utils/utils.ts',
    ['AIONUI_E2E_TEST', 'AIONUI_E2E_STORAGE_ROOT', 'path.isAbsolute(root)', "path.join(e2eStorageRoot, 'data')"],
    'Active shell E2E storage isolation',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'tests/unit/opl-runtime/oplStoragePaths.test.ts',
    [
      'keeps E2E data and config inside the explicit test storage root',
      'fails closed when E2E mode has no isolated storage root',
      'fails closed when the E2E storage root is relative',
      'ignores the E2E storage root outside E2E mode',
    ],
    'Active shell E2E storage isolation regressions',
  );
}

function validateReadOnlySessionEnvironmentImplementation(shellPaths) {
  const retiredHandoffControl =
    'packages/desktop/src/renderer/pages/conversation/components/ChatLayout/WorkspaceHandoffControl.tsx';
  if (existsSync(path.join(shellPaths.shellRoot, retiredHandoffControl))) {
    throw new Error(`Active shell must remove retired workspace handoff control ${retiredHandoffControl}`);
  }

  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/conversation/components/ChatLayout/ConversationEnvironmentPopover.tsx',
    ['ipcBridge.gitWorkspace.inspect.invoke({ cwd: summary.workspace })'],
    'Active shell read-only conversation environment Git inspection',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'tests/unit/conversation/context/ConversationEnvironmentPopover.dom.test.tsx',
    ['renders the recorded workspace and live Git context without mutation controls'],
    'Active shell read-only conversation environment regression',
  );

  for (const sourcePath of [
    'packages/desktop/src/renderer/pages/conversation/components/ChatLayout/ConversationEnvironmentPopover.tsx',
    'packages/desktop/src/renderer/pages/guid/GuidPage.tsx',
    'packages/desktop/src/renderer/pages/guid/components/GuidActionRow.tsx',
    'packages/desktop/src/renderer/pages/guid/hooks/useGuidSend.ts',
  ]) {
    assertTextExcludesAll(
      readShellText(shellPaths, sourcePath),
      ['ensureManagedWorktree', 'workspace_handoff', 'thread/settings/update'],
      `Active shell simplified workspace surface in ${sourcePath}`,
    );
  }
}

export function validateRuntimePageImplementation(shellPaths) {
  const primaryNav = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/components/layout/Sider/SiderNav/SiderPrimaryNav.tsx',
    ["key: 'runtime'", "t('common.runtime.sidebarEntry')", "active: pathname.startsWith('/runtime')"],
    'Active AionUI primary navigation Runtime status entry',
  );
  const runtimeIndex = primaryNav.indexOf("key: 'runtime'");
  const scheduledIndex = primaryNav.indexOf("key: 'scheduled'");
  const archivedIndex = primaryNav.indexOf("key: 'archived'");
  if (!(runtimeIndex < scheduledIndex && scheduledIndex < archivedIndex)) {
    throw new Error('Active AionUI primary navigation must order Runtime before Scheduled tasks and Archived');
  }
  assertShellTextIncludesAll(
    shellPaths,
    'tests/unit/layout/SiderNavigation.dom.test.tsx',
    [
      'keeps Runtime, Scheduled, and Archived visible in the primary navigation order',
      "['New task', 'Runtime', 'Scheduled Tasks', 'Archived', 'Settings']",
      "getByRole('button', { name: 'Runtime' })",
    ],
    'Active AionUI Runtime navigation visibility and order regression',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/components/layout/Router.tsx',
    ["path='/runtime'", 'element={withRouteFallback(RuntimePage)}'],
    'Active shell cross-project Runtime page route',
  );
  const runtimePage = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/runtime/index.tsx',
    runtimePageExpected,
    'Active shell Runtime page user-task-first grouped display',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/runtime/projection.ts',
    runtimeProjectionExpected,
    'Active shell Runtime v2 canonical work-item projection',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/runtime/components/RuntimeStagePopover.tsx',
    runtimeStagePopoverExpected,
    'Active shell Runtime Stage popover',
  );
  const runtimeStatusBar = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/runtime/components/RuntimeStatusBar.tsx',
    [
      "data-testid='runtime-status-view-select'",
      "data-testid='runtime-open-archive'",
      '<Select',
    ],
    'Active shell Runtime compact task toolbar',
  );
  assertTextExcludesAll(
    runtimeStatusBar,
    ['runtime-status-metrics', '<Radio.Group', 'metricGrid'],
    'Active shell Runtime metric-card and duplicate-filter surfaces',
  );
  const runtimeFocusedTests = [
    readShellText(shellPaths, 'tests/unit/opl-runtime/runtime-v2/RuntimePageV2.dom.test.tsx'),
    readShellText(shellPaths, 'tests/unit/opl-runtime/runtime-v2/projection.test.ts'),
  ].join('\n');
  assertTextIncludesAll(runtimeFocusedTests, runtimeFocusedTestsExpected, 'Active shell Runtime v2 focused regressions');
  assertRuntimePageSourceBoundary(runtimePage);

  const projection = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/runtime/projection.ts',
    [
      'const PRIMARY_STATUSES = new Set<RuntimePrimaryStatus>',
      'enumValue(lifecycle.primary_state, PRIMARY_STATUSES)',
      "projectedPrimaryStatus ?? 'sync_pending'",
      'const projectedAction = parseAction(value.action)',
      'const stageMap = parseStageMap(value.stage_map)',
    ],
    'Active shell Runtime V2 thin projection reader',
  );
  assertTextExcludesAll(
    projection,
    ['function primaryStatus(', 'statusByBusinessState'],
    'Active shell Runtime V2 status inference',
  );

  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/runtime/components/RuntimeScopeBar.tsx',
    [
      "data-testid='runtime-agent-selector'",
      "data-testid='runtime-project-selector'",
      'disabled={selectedAgentId === ALL_RUNTIME_SCOPES}',
      "t('common.runtime.scope.viewing')",
    ],
    'Active shell Runtime Agent then Project scope',
  );
  const statusBar = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/runtime/components/RuntimeStatusBar.tsx',
    [
      "id: 'all'",
      "id: 'automatically_advancing'",
      "id: 'awaiting_user_decision'",
      "id: 'system_attention'",
      "id: 'delivered_or_paused'",
      "id: 'stopped'",
      "id: 'sync_pending'",
      "data-testid='runtime-status-view-select'",
    ],
    'Active shell Runtime seven status-only saved views',
  );
  assertTextExcludesAll(statusBar, ["id: 'mas'", "id: 'med-autoscience'"], 'Active shell Runtime agent saved views');

  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/runtime/components/RuntimeWorkItemList.tsx',
    [
      "data-testid='runtime-task-row'",
      "data-responsive-columns='4'",
      '<RuntimeStagePopover item={item} locale={locale} t={t} />',
      'nextStageLabel(item, locale, t)',
      "t('common.runtime.stageUsageShort')",
      "t('common.runtime.totalUsageShort')",
    ],
    'Active shell Runtime one-row work item list',
  );
  const runtimeDetailDrawer = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/runtime/components/RuntimeDetailDrawer.tsx',
    [
      "data-testid='runtime-stage-map'",
      'currentStageLabel(item, locale, t)',
      'nextStageLabel(item, locale, t)',
      'stageDisplayName(stage, locale)',
      'item.execution.attemptId',
      'item.execution.lastHeartbeatAt',
      'formatTokenObservation(item.stageUsage',
      'formatTokenObservation(item.taskUsage',
      "data-testid='runtime-next-action'",
      "data-testid='runtime-system-attention'",
      "data-testid={archived ? 'runtime-restore-work-item' : 'runtime-archive-work-item'}",
    ],
    'Active shell Runtime minimal selected-work-item detail',
  );
  assertTextExcludesAll(
    runtimeDetailDrawer,
    [
      'Collapse',
      "runtime-detail-disclosure",
      "name='artifacts'",
      "name='timeline'",
      "name='evidence'",
      "name='diagnostics'",
      'ConditionList',
      'SourceRefList',
    ],
    'Active shell Runtime advanced detail surfaces',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/runtime/RuntimePage.module.css',
    [
      'overflow-x: hidden',
      'box-sizing: border-box',
      '@container (max-width: 720px)',
      '@container (max-width: 360px)',
      '@media (max-width: 1180px)',
      'grid-template-columns: repeat(2, minmax(0, 1fr))',
      'grid-template-columns: minmax(0, 1fr)',
    ],
    'Active shell Runtime responsive semantic reflow',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'tests/e2e/runtime-v2/runtime-v2.e2e.ts',
    [
      '{ width: 1440, height: 960, columns: 4 }',
      '{ width: 1024, height: 900, columns: 2 }',
      '{ width: 768, height: 900, columns: 2 }',
      '{ width: 375, height: 812, columns: 1 }',
      'assertNoHorizontalOverflow(page)',
      'assertElementsWithinViewport(page',
      'toHaveCount(9',
      'runtime-v2-${locale.id}-${viewport.width}.png',
      'runtime-v2-${locale.id}-${viewport.width}-stage-popover.png',
      'runtime-v2-${locale.id}-action-detail.png',
      'runtime-v2-1440-stage-popover.png',
      'runtime-v2-1440-minimal-detail.png',
      "keeps task details minimal without evidence or diagnostic surfaces",
      "toHaveCount(0)",
    ],
    'Active shell Runtime deterministic viewport evidence',
  );
}

function validateSkillsHubImplementation(shellPaths) {
  const skillsHub = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/settings/SkillsHubSettings.tsx',
    [
      'const skills = await ipcBridge.fs.listAvailableSkills.invoke()',
      'setAvailableSkills(skills)',
      'const autoSkills = await ipcBridge.fs.listBuiltinAutoSkills.invoke()',
      'setBuiltinAutoSkills(autoSkills)',
    ],
    'Active shell SkillsHubSettings IPC Skill projection',
  );
  assertTextExcludesAll(
    skillsHub,
    [
      'getOplDefaultPackagedCodexSkills',
      'getOplPackagedCodexSkills',
      'appVisibleSkills',
      'appPackagedSkills',
    ],
    'Active shell SkillsHubSettings retired App-packaged Skill allowlist',
  );
}

function validateStorageCarrierImplementation(shellPaths) {
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/settings/StorageSettings/index.tsx',
    [
      "import { isElectronDesktop } from '@/renderer/utils/platform'",
      'const desktopCarrier = isElectronDesktop()',
      'const ownerInventoryRefresh = Promise.allSettled',
      'if (!desktopCarrier)',
      'desktopCarrier &&',
    ],
    'Active shell Storage carrier split',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'tests/unit/settings/StorageSettings.dom.test.tsx',
    [
      'keeps the WebUI Storage core route fail-open without invoking desktop local lifecycle',
      'expect(bridgeMocks.getInventorySnapshot).not.toHaveBeenCalled()',
      'expect(bridgeMocks.refreshInventory).not.toHaveBeenCalled()',
    ],
    'Active shell WebUI Storage carrier regression',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/web-host/src/static-server.unit.test.ts',
    ["'/settings/storage'", 'SPA fallback: %s returns index.html'],
    'Active shell Web host Storage core-route regression',
  );
}

export function validateShellOrdinaryExperienceImplementation(shellPaths) {
  const guidPage = validateGuidHomeImplementation(shellPaths);
  validateGuidAgentSelection(shellPaths);
  validateProductProfileDefaults(shellPaths);
  validateStaticAuthorityConsumerRemoval(shellPaths);
  validateExistingConversationAgentRebindRemoval(shellPaths);
  validateGuidAssistantsAndSkills(shellPaths, guidPage);
  validateCodexConversationImplementation(shellPaths);
  validateComposerCapabilityPaletteImplementation(shellPaths);
  validateSessionFirstDirectoryImplementation(shellPaths);
  validateReadOnlySessionEnvironmentImplementation(shellPaths);
  validateRuntimePageImplementation(shellPaths);
  validateSkillsHubImplementation(shellPaths);
  validateStorageCarrierImplementation(shellPaths);
}
