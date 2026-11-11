import {
  assertShellTextIncludesAll,
  assertTextExcludesAll,
  assertTextIncludesAll,
  readShellText,
} from '../shell-implementation-helpers.ts';
import { validateCodexModelControls } from './session-model.ts';

const acpSendBoxExpected = [
  'isOplCodexCliFixedExecutor',
  'shouldShowOplConversationModelSelector',
  'shouldShowOplConversationPermissionModeSelector',
  "backend === 'codex'",
  'const showConversationModelSelector',
  'const showModeSelector',
  "data-testid='acp-sendbox-decision-controls'",
  '<AcpModelSelector',
  'conversation_id={conversation_id}',
  'backend={backend}',
  'waitForWarmup={!canonicalThreadId}',
  'modelInfoController={canonicalSettings ?? undefined}',
  '(showConversationModelSelector || showModeSelector) ?',
  '<ThoughtDisplay running={isBusy}',
  "placeholder={t('conversation.chat.oplPlaceholder')}",
];

export function validateCodexConversationSurfaces(shellPaths) {
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
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/hooks/context/ConversationContext.tsx',
    ['canonicalThreadId?: string;'],
    'Active shell canonical conversation runtime-owner context',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpChat.tsx',
    ['canonicalThreadId,', '<ConversationProvider'],
    'Active shell canonical conversation runtime-owner provider',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/components/chat/SendBox/index.tsx',
    ['!conversationContext?.canonicalThreadId', 'conversationContext?.canonicalThreadId,'],
    'Active shell canonical conversation bypasses AionCore focus warmup',
  );
  assertShellTextIncludesAll(shellPaths, 'packages/desktop/src/renderer/components/chat/ThoughtDisplay.tsx', ['formatElapsedTime', "t('conversation.chat.processing')", 'elapsedTime'], 'Active shell ThoughtDisplay elapsed processing feedback');
}

export function validateSendFailureDraftPreservation(shellPaths) {
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/hooks/chat/useSendBoxDraft.ts',
    [
      'export const mergeFailedSendContent',
      'export const mergeFailedSendDraft',
      'currentContent.startsWith(`${failedContent}\\n\\n`)',
      'const restored = splitChatFileRefs(failedFiles)',
      'mergeFileSelectionItems(restored.atPath, currentDraft.atPath)',
      'new Set([...restored.uploadFiles.filter(Boolean), ...currentDraft.uploadFile.filter(Boolean)])',
      'atPath,',
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
      'restoreFailedSend: (input: string, files: ChatFileRef[]) => void',
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

export function validateCodexConversationImplementation(shellPaths, dshVisualSourceImplemented) {
  validateCodexModelControls(shellPaths, dshVisualSourceImplemented);
  validateCodexConversationSurfaces(shellPaths);
  validateSendFailureDraftPreservation(shellPaths);
}

export function validateComposerCapabilityPaletteImplementation(shellPaths) {
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
      'loadedSkills',
      'filterOplOrdinarySkillNames',
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
    ],
    'Active shell capability palette regressions',
  );
}
