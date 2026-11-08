import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assertDeepEqualJson } from '../assertions.ts';

const REQUIRED_MANAGED_AGENT_NODE_TESTS = [
  'tests/unit/common-adapter/ipcBridgeAgents.test.ts',
  'tests/unit/common-adapter/apiModelMapper.test.ts',
  'tests/unit/common-adapter/ipcBridgeTeamGate.test.ts',
  'tests/unit/conversation/createConversationParams.test.ts',
  'tests/unit/assistants/migrateAssistants.test.ts',
  'tests/unit/renderer/channelAssistantOptions.test.ts',
  'tests/unit/cron/resolveCronAgentConfig.test.ts',
  'tests/unit/common-adapter/teamMapper.test.ts',
];
const REQUIRED_MANAGED_AGENT_DOM_TESTS = [
  'tests/unit/guid/useGuidSend.oplWhitelist.dom.test.tsx',
  'tests/unit/assistants/useAssistantEditor.dom.test.ts',
];
const REQUIRED_MANAGED_AGENT_FOCUSED_COMMANDS = [
  {
    id: 'managed_agent_behavior_node',
    cwd: 'shells/aionui',
    command: `bunx vitest run ${REQUIRED_MANAGED_AGENT_NODE_TESTS.join(' ')}`,
  },
  {
    id: 'managed_agent_behavior_dom',
    cwd: 'shells/aionui',
    command: `VITEST_INCLUDE_DOM=1 bunx vitest run --project dom ${REQUIRED_MANAGED_AGENT_DOM_TESTS.join(' ')}`,
  },
];
const REQUIRED_MANAGED_AGENT_API_CONTRACT = {
  source: 'aioncore_v0.1.44_live_api_compatibility',
  root_cause_guard: 'prevent_v2.1.31_managed_agent_capability_migration_omission',
  required_aioncore_version: 'v0.1.44',
  assistant_identity_policy: {
    canonical_identity_source: 'Assistant.id',
    allowed_assistant_kinds: ['generated', 'preset'],
    runtime_identity_policy: 'runtime_ids_may_support_display_or_execution_but_never_replace_Assistant.id_on_wire',
  },
  business_assistant_catalog: {
    consumer: 'business_assistant_selection',
    source_policy: 'consume_assistants_catalog_only',
    method: 'GET',
    route: '/api/assistants',
    response: 'Assistant[]',
  },
  managed_agent_catalog: {
    consumers: ['agent_settings', 'agent_diagnostics', 'runtime_metadata'],
    method: 'GET',
    route: '/api/agents/management',
    response: 'ManagedAgent[]',
  },
  managed_agent_health_check: {
    consumer: 'agent_diagnostics',
    method: 'POST',
    route_template: '/api/agents/{id}/health-check',
    success_status: 200,
  },
  migration_policy: {
    import_checkpoint: 'persist_immediately_after_legacy_import',
    deleted_assistant_policy: 'must_not_reimport_after_user_deletion',
  },
  implementation_surfaces: {
    source_root: 'packages/desktop/src',
    bridge: 'packages/desktop/src/common/adapter/ipcBridge.ts',
    conversation_writer: 'packages/desktop/src/common/adapter/apiModelMapper.ts',
    conversation_parameter_builder: 'packages/desktop/src/common/utils/buildAgentConversationParams.ts',
    team_mapper: 'packages/desktop/src/common/adapter/teamMapper.ts',
    team_types: 'packages/desktop/src/common/types/team/teamTypes.ts',
    migration: 'packages/desktop/src/process/utils/migrateAssistants.ts',
    managed_hook: 'packages/desktop/src/renderer/hooks/agent/useManagedAgents.ts',
    managed_types: 'packages/desktop/src/renderer/utils/model/agentTypes.ts',
    assistant_catalog_hook: 'packages/desktop/src/renderer/hooks/assistant/useAssistantList.ts',
    assistant_editor: 'packages/desktop/src/renderer/hooks/assistant/useAssistantEditor.ts',
    guid_business_loader: 'packages/desktop/src/renderer/pages/guid/hooks/useCustomAgentsLoader.ts',
    guid_agent_selection: 'packages/desktop/src/renderer/pages/guid/hooks/useGuidAgentSelection.ts',
    conversation_agents: 'packages/desktop/src/renderer/pages/conversation/hooks/useConversationAgents.ts',
    conversation_parameter_resolver:
      'packages/desktop/src/renderer/pages/conversation/utils/createConversationParams.ts',
    conversation_guid_callers: 'packages/desktop/src/renderer/pages/guid/hooks/useGuidSend.ts',
    channel_assistant_selection:
      'packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/assistantOptions.ts',
    channel_forms: [
      'packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/TelegramConfigForm.tsx',
      'packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/LarkConfigForm.tsx',
      'packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/WecomConfigForm.tsx',
      'packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/DingTalkConfigForm.tsx',
    ],
    cron_create_dialog: 'packages/desktop/src/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog.tsx',
    cron_agent_config_resolver:
      'packages/desktop/src/renderer/pages/cron/ScheduledTasksPage/resolveCronAgentConfig.ts',
    team_agent_options: 'packages/desktop/src/renderer/pages/team/components/agentSelectUtils.tsx',
    team_create_modal: 'packages/desktop/src/renderer/pages/team/components/TeamCreateModal.tsx',
    team_add_agent_caller: 'packages/desktop/src/renderer/pages/team/hooks/useTeamSession.ts',
  },
  focused_tests: {
    node: REQUIRED_MANAGED_AGENT_NODE_TESTS,
    dom: REQUIRED_MANAGED_AGENT_DOM_TESTS,
  },
  retired_facade_paths: [
    'packages/desktop/src/renderer/hooks/agent/useAgents.ts',
    'packages/desktop/src/renderer/hooks/assistant/useDetectedAgents.ts',
  ],
  verification_policy: {
    quick_gate_claim: 'contract_structure_remediation_ancestry_required_paths_and_retired_facade_absence_only',
    quick_gate_runs_focused_tests: false,
    required_path_claim: 'presence_only_not_behavior',
    focused_behavior_command_ids: ['managed_agent_behavior_node', 'managed_agent_behavior_dom'],
    focused_behavior_claim: 'only_successful_command_execution_proves_behavior',
    full_active_shell_policy: 'focused_behavior_commands_execute_before_test_full',
  },
  write_contracts: {
    assistant: {
      route: '/api/assistants',
      runtime_binding_field: 'agent_id',
    },
    conversation: {
      create_method: 'POST',
      create_route: '/api/conversations',
      assistant_identity_path: 'assistant.id',
      assistant_placement: 'top_level',
      caller_ids: ['openclaw_gateway', 'nanobot', 'aionrs', 'acp_remote_custom_and_preset_fallbacks'],
    },
    channel: {
      read_method: 'GET',
      read_route_template: '/api/channel/settings/{platform}',
      write_method: 'PUT',
      write_route_template: '/api/channel/settings/{platform}/assistant',
      selection_hook: 'useChannelAssistantSelection',
      identity_field: 'assistant_id',
      identity_source: 'Assistant.id',
    },
    cron: {
      product_policy_ref: 'contracts/app-gui-product-contract.json#scheduled_tasks_policy',
      authority: 'aioncore_cron_store_and_routes',
      route: '/scheduled',
      list_endpoint: 'listJobs',
      get_endpoint: 'getJob',
      create_endpoint: 'addJob',
      update_endpoint: 'updateJob',
      delete_endpoint: 'removeJob',
      run_now_endpoint: 'runNow',
      pause_resume_endpoint: 'updateJob.enabled',
      history_route_template: '/api/cron/jobs/{id}/conversations',
      timezone_policy: 'local_iana_timezone_on_write_and_fail_open_repair_for_missing_timezone',
      ordinary_sider_entry_visible: true,
      sider_placement: 'primary_navigation_between_runtime_and_archived',
      job_section_visible_when_non_empty: true,
      executor: 'codex_cli',
      executor_selector_visible: false,
      assistant_candidate_source: 'useConversationAgents.cliAgents',
      assistant_candidate_requirements: [
        'Assistant.source=generated',
        'Assistant.enabled=true',
        'managed_agent_runnable=true',
        'assistantRuntimeKey=codex',
      ],
      assistant_identity_source: 'Assistant.id',
      candidate_cardinality: 'exactly_one',
      assistant_unavailable_policy: 'disable_new_task_create_and_codex_executor_save_only_with_inline_guidance',
      existing_task_management_remains_available: true,
      identity_path: 'agent_config.assistant_id',
      schedule_field_map: {
        atMs: 'at_ms',
        everyMs: 'every_ms',
      },
      existing_conversation_update_agent_config: 'omit',
      aionrs_provider_identity_path: 'agent_config.model.provider_id',
      legacy_non_codex_job_policy: {
        visible: true,
        run_now_allowed: true,
        pause_resume_allowed: true,
        delete_allowed: true,
        editable_fields: ['schedule', 'prompt'],
        preserve_existing_agent_config: true,
        executor_mutation_allowed: false,
        silent_migration_allowed: false,
      },
      second_scheduler_store_allowed: false,
    },
    team: {
      create_endpoint: 'create',
      add_agent_endpoint: 'addAgent',
      shared_mapper: 'toBackendAgent',
      identity_field: 'assistant_id',
      identity_source: 'Assistant.id',
      response_members_field: 'assistants',
      response_leader_field: 'leader_assistant_id',
      events: {
        'team.agentStatusChanged': 'fromBackendTeamAgentStatusEvent',
        'team.agentSpawned': 'fromBackendTeamAgentSpawnedEvent',
        'team.agentRemoved': 'passthrough',
        'team.agentRenamed': 'fromBackendTeamAgentRenamedEvent',
        'team.listChanged': 'passthrough',
        'team.teammateMessage': 'passthrough',
      },
    },
  },
  release_claim_policy: 'contract_and_gate_pass_do_not_prove_installed_runtime_ready',
};

function defaultReadShellSourceFiles(shellRoot, _sourceRoot, requiredEvidencePaths = [], retiredFacadePaths = []) {
  const files = [];
  for (const relativePath of new Set([...requiredEvidencePaths, ...retiredFacadePaths])) {
    try {
      files.push({
        relativePath,
        text: readFileSync(path.join(shellRoot, relativePath), 'utf8'),
      });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return files.toSorted((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function indexShellSourceFiles(sourceFiles) {
  if (!Array.isArray(sourceFiles)) {
    throw new Error('Active shell managed-agent API source reader must return an array');
  }
  const byPath = new Map();
  for (const sourceFile of sourceFiles) {
    if (
      !sourceFile ||
      typeof sourceFile !== 'object' ||
      typeof sourceFile.relativePath !== 'string' ||
      typeof sourceFile.text !== 'string'
    ) {
      throw new Error('Active shell managed-agent API source entries must contain relativePath and text');
    }
    if (byPath.has(sourceFile.relativePath)) {
      throw new Error(`Active shell managed-agent API source reader returned duplicate ${sourceFile.relativePath}`);
    }
    byPath.set(sourceFile.relativePath, sourceFile.text);
  }
  return byPath;
}

function validateManagedAgentFocusedCommands(rootContract, managedAgentContract) {
  const validationCommands = rootContract.validation_commands;
  if (!Array.isArray(validationCommands)) {
    throw new Error('managed-agent focused behavior commands require validation_commands');
  }
  const fullTestIndex = validationCommands.findIndex((entry) => entry.id === 'test');
  if (fullTestIndex === -1) {
    throw new Error('managed-agent focused behavior commands require the full test validation command');
  }
  assertDeepEqualJson(
    managedAgentContract.verification_policy.focused_behavior_command_ids,
    REQUIRED_MANAGED_AGENT_FOCUSED_COMMANDS.map((entry) => entry.id),
    'managed-agent focused behavior command ids',
  );
  for (const expected of REQUIRED_MANAGED_AGENT_FOCUSED_COMMANDS) {
    const matches = validationCommands.filter((entry) => entry.id === expected.id);
    if (matches.length !== 1) {
      throw new Error(`managed-agent focused behavior command ${expected.id} must appear exactly once`);
    }
    assertDeepEqualJson(matches[0], expected, `managed-agent focused behavior command ${expected.id}`);
    if (validationCommands.indexOf(matches[0]) > fullTestIndex) {
      throw new Error(`managed-agent focused behavior command ${expected.id} must run before test`);
    }
  }
}

export function validateManagedAgentApiCompatibility(rootContract, shellPaths, options) {
  const upstreamIntake = rootContract.upstream_intake;
  const contract = upstreamIntake.managed_agent_api_contract;
  assertDeepEqualJson(
    contract,
    REQUIRED_MANAGED_AGENT_API_CONTRACT,
    'Active shell managed-agent API compatibility contract',
  );

  const surfaces = contract.implementation_surfaces;
  const requiredSourcePaths = Object.entries(surfaces).flatMap(([key, value]) => {
    if (key === 'source_root') return [];
    return Array.isArray(value) ? value : [value];
  });
  const requiredTestPaths = Object.values(contract.focused_tests).flatMap((value) =>
    Array.isArray(value) ? value : [value],
  );
  const requiredEvidencePaths = [...new Set([...requiredSourcePaths, ...requiredTestPaths])];
  const readShellSourceFiles = options.readShellSourceFiles ?? defaultReadShellSourceFiles;
  let sourceFiles;
  try {
    sourceFiles = readShellSourceFiles(
      shellPaths.shellRoot,
      surfaces.source_root,
      requiredEvidencePaths,
      contract.retired_facade_paths,
    );
  } catch (error) {
    throw new Error(`Unable to read active shell managed-agent API source: ${error.message}`);
  }
  const sourceByPath = indexShellSourceFiles(sourceFiles);
  const errors = [];
  for (const relativePath of requiredEvidencePaths) {
    if (!sourceByPath.has(relativePath)) errors.push(`required managed-agent evidence missing ${relativePath}`);
  }
  for (const retiredPath of contract.retired_facade_paths) {
    if (sourceByPath.has(retiredPath)) errors.push(`retired managed-agent facade path found: ${retiredPath}`);
  }

  if (errors.length > 0) {
    throw new Error(`Active shell managed-agent API compatibility gate failed:\n- ${errors.join('\n- ')}`);
  }
  validateManagedAgentFocusedCommands(rootContract, contract);
}
