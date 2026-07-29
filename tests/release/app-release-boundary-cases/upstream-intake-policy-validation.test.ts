import { validateUpstreamIntakePolicy } from '../../../scripts/validate-active-shell/upstream-intake-policy-validator.ts';
import { readAppProductProfile } from '../../../scripts/app-product-profile/profile-contract.ts';
import { validateProductProfile } from '../../../scripts/validate-active-shell/product-profile-validator.ts';
import { assert, fs, path, test, appRoot } from './helpers.ts';

function readContract() {
  return JSON.parse(fs.readFileSync(path.join(appRoot, 'contracts', 'app-shell-adapter.json'), 'utf8'));
}

function readJson(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), 'utf8'));
}

function capability(contract, id: string) {
  return contract.upstream_intake.capability_classifications.find((entry) => entry.id === id);
}

function dependency(contract, id: string) {
  return contract.upstream_intake.dependency_classifications.find((entry) => entry.id === id);
}

const shellPaths = {
  shellRoot: '/fixture/active-shell',
  packageManifestPath: '/fixture/active-shell/package.json',
};
const MANAGED_AGENT_REMEDIATION_REF = '6875ada9fa6e800b64980dadb02180def6b0f6e2';
const MANAGED_AGENT_NODE_TESTS = [
  'tests/unit/common-adapter/ipcBridgeAgents.test.ts',
  'tests/unit/common-adapter/apiModelMapper.test.ts',
  'tests/unit/common-adapter/ipcBridgeTeamGate.test.ts',
  'tests/unit/conversation/createConversationParams.test.ts',
  'tests/unit/assistants/migrateAssistants.test.ts',
  'tests/unit/renderer/channelAssistantOptions.test.ts',
  'tests/unit/cron/resolveCronAgentConfig.test.ts',
  'tests/unit/common-adapter/teamMapper.test.ts',
];
const MANAGED_AGENT_DOM_TESTS = [
  'tests/unit/guid/useGuidSend.oplWhitelist.dom.test.tsx',
  'tests/unit/assistants/useAssistantEditor.dom.test.ts',
];
const MANAGED_AGENT_NODE_COMMAND = `bunx vitest run ${MANAGED_AGENT_NODE_TESTS.join(' ')}`;
const MANAGED_AGENT_DOM_COMMAND =
  `VITEST_INCLUDE_DOM=1 bunx vitest run --project dom ${MANAGED_AGENT_DOM_TESTS.join(' ')}`;

function managedAgentStructuralFiles(contract) {
  const managedAgentContract = contract.upstream_intake.managed_agent_api_contract;
  const sourcePaths = Object.entries(managedAgentContract.implementation_surfaces).flatMap(([key, value]) => {
    if (key === 'source_root') return [];
    return Array.isArray(value) ? value : [value];
  });
  const testPaths = Object.values(managedAgentContract.focused_tests).flatMap((value) =>
    Array.isArray(value) ? value : [value],
  );
  return [...new Set([...sourcePaths, ...testPaths])].map((relativePath) => ({
    relativePath,
    text: 'export {};',
  }));
}

const failureBoundaries = [
  { stage: 'database.recoverable_corruption', required_corruption_markers_any_of: [] },
  {
    stage: 'database.open',
    required_corruption_markers_any_of: [
      'sqlite_corrupt',
      'sqlite_notadb',
      'database disk image is malformed',
      'file is not a database',
      'malformed database schema',
    ],
  },
];
const recoveryBoundary = {
  code: 'BOOTSTRAP_RECOVERED_DATABASE_CORRUPTION',
  stage: 'database.recovery',
};
const missingRemediationRef = 'f'.repeat(40);

function stableCurrentnessReceipt() {
  return {
    schema: 'opl_aionui_upstream_intake.v2',
    upstream_repository: 'https://github.com/iOfficeAI/AionUi.git',
    channel: 'stable_tags_only',
    reviewed_release: {
      tag: 'v2.1.42',
      commit: '7ee90c13e96393491586abe9b12f7d5c7da9ee59',
      published_at: '2026-07-28T12:52:28Z',
      draft: false,
      prerelease: false,
      url: 'https://github.com/iOfficeAI/AionUi/releases/tag/v2.1.42',
      disposition: 'reviewed_deferred',
    },
    absorbed_release: {
      tag: 'v2.1.39',
      commit: '1b215f2fcb9d220bc66bf3b4961835ded07d5797',
    },
    shell_projection: {
      implementation_refs: [
        'a226de8a709698d40d19b038ef736475e135e1b2',
        'bfde9e63179c03b2cdca18f4134f5c28ef78c8e4',
      ],
      human_record: 'docs/history/aionui-upstream-intake-2026-07-22.md',
      aioncore_version_source: 'package.json#aioncoreVersion',
    },
    managed_runtime: {
      aioncore: {
        version: 'v0.1.53',
        commit: '1644ef26c168e8002dcfa53ccd333054b40697d6',
        archive_sha256: '57b92b3de046717c7980d2c345d335e2513af514621fcbfff8a3e7cf16f8b7f6',
      },
      managed_resources_schema: 2,
      managed_resources_manifest_sha256:
        '0a3e1496e0ba6ca1bf522bfe1945e388e7bd4d51ac64ada43ba85ec99e98cd44',
      node_runtime: {
        version: '24.11.0',
        binary_sha256: '8d66cad090d087ed8fac66d8f7248c8a9a55454680232a6d109f609aa2decf89',
      },
      claude_cli: {
        package: '@anthropic-ai/claude-code',
        version: '2.1.215',
        binary_sha256: '90608b5c5ab504e96e77365cea6203d046e291d59b2bb42cf28dcb2ccdf9dd58',
      },
      codex_cli: {
        package: '@openai/codex',
        version: '0.144.6',
        binary_sha256: '80a3933d11a9d13ef806aa24f7bb8afc9169cfe4e9b09d6da6a92922cbde9cff',
      },
    },
    policy: {
      broad_history_merge: 'forbidden',
      newer_stable_release: 'review_required',
      network_unknown: 'unknown_fail_closed_for_release_admission',
      product_authority: 'one-person-lab-app',
    },
  };
}

function validateContract(contract, options = {}) {
  const receipt = stableCurrentnessReceipt();
  return validateUpstreamIntakePolicy(contract, shellPaths, {
    readJsonFile: () => ({ aioncoreVersion: receipt.managed_runtime.aioncore.version }),
    readShellReceipt: () => receipt,
    readShellSourceFiles: () => managedAgentStructuralFiles(contract),
    isGitAncestor: () => true,
    ...options,
  });
}

test('AionUI intake consumes the Shell stable receipt while preserving historical intake refs', () => {
  const contract = readContract();
  const receipt = stableCurrentnessReceipt();
  const checkedRefs: string[] = [];
  let packagePath = '';
  let receiptPath = '';
  assert.doesNotThrow(() => validateContract(contract, {
    readJsonFile: (filePath) => {
      packagePath = filePath;
      return { aioncoreVersion: receipt.managed_runtime.aioncore.version };
    },
    readShellReceipt: (filePath) => {
      receiptPath = filePath;
      return receipt;
    },
    isGitAncestor: (ref) => {
      checkedRefs.push(ref);
      return true;
    },
  }));

  const intake = contract.upstream_intake;
  assert.equal(packagePath, shellPaths.packageManifestPath);
  assert.equal(receiptPath, path.join(shellPaths.shellRoot, 'contracts/aionui-upstream-intake.json'));
  assert.deepEqual(new Set(checkedRefs), new Set([
    ...receipt.shell_projection.implementation_refs,
    contract.shell_source.upstream_ref,
    intake.source_refs.selective_absorption_head.ref,
    MANAGED_AGENT_REMEDIATION_REF,
    capability(contract, 'feedback_diagnostics_privacy').remediation_ref,
    dependency(contract, 'aioncore_database_recovery').remediation_ref,
  ]));
  assert.deepEqual(
    [
      intake.source_refs.fork_base.ref,
      intake.source_refs.evaluated_upstream.ref,
      intake.source_refs.selective_absorption_head.ref,
    ],
    [
      '70974c59a275e565e8fc2bd7ecaf2dcac74227f0',
      'e49cd94935f4e461f002a1260a47c1b7b2ce81ca',
      'e38b00ba37cafe56d704b498a4882264836463e4',
    ],
  );
  assert.equal(Object.hasOwn(intake.source_refs, 'latest_reviewed_upstream'), false);
  assert.equal(intake.stable_currentness_receipt.schema, receipt.schema);
  assert.equal(intake.stable_currentness_receipt.channel, receipt.channel);
  assert.equal(receipt.reviewed_release.tag, 'v2.1.42');
  assert.deepEqual(receipt.managed_runtime, stableCurrentnessReceipt().managed_runtime);
  assert.deepEqual([
    capability(contract, 'database_recovery').classification,
    capability(contract, 'database_recovery').release_gate,
    capability(contract, 'feedback_diagnostics_privacy').classification,
    capability(contract, 'feedback_diagnostics_privacy').release_gate,
    capability(contract, 'non_zh_en_locales').classification,
    capability(contract, 'aionui_team').classification,
  ], ['absorbed', 'database_recovery_dependency_satisfied', 'absorbed', 'feedback_privacy_redaction_verified', 'rejected', 'rejected']);
  assert.equal(capability(contract, 'managed_agent_api').remediation_ref, MANAGED_AGENT_REMEDIATION_REF);
  const aionCore = dependency(contract, 'aioncore_database_recovery');
  assert.deepEqual([
    aionCore.classification,
    aionCore.release_gate,
    aionCore.remediation_ref,
    aionCore.version_gate.minimum_version,
    aionCore.version_gate.selected_version_source,
    aionCore.capability_gate.state,
  ], [
    'absorbed',
    'aioncore_database_recovery_verified',
    '81c8b37fdc067549341b41539d7648b09aa31d37',
    'v0.1.44',
    'contracts/aionui-upstream-intake.json#managed_runtime.aioncore.version',
    'verified',
  ]);
});

test('AionUI intake contract accepts typed corruption or strict open-stage corruption and records recovery success', () => {
  const contract = readContract();
  const gate = dependency(contract, 'aioncore_database_recovery').capability_gate;
  assert.equal(gate.required_boundary_stage, undefined);
  assert.deepEqual(gate.accepted_failure_boundaries, failureBoundaries);
  assert.deepEqual(gate.recovery_success_boundary, recoveryBoundary);
  assert.doesNotThrow(() => validateContract(contract));
});

const invalid = (name, mutate, error, options?) => ({ name, mutate, error, options });
const invalidCases = [
  invalid('a missing required capability record', (c) => {
    c.upstream_intake.capability_classifications = c.upstream_intake.capability_classifications.filter((entry) => entry.id !== 'cron_history');
  }, /Active shell upstream intake capabilities ids/),
  invalid('a missing required record field', (c) => delete capability(c, 'startup_directories').owner_ref, /startup_directories missing required field owner_ref/),
  invalid('an invalid classification state', (c) => { capability(c, 'database_recovery').classification = 'pending'; }, /database_recovery\.classification must be one of absorbed, rejected, deferred/),
  invalid('an unexpected dependency', (c) => { capability(c, 'database_recovery').dependencies = ['unknown_aioncore_dependency']; }, /database_recovery\.dependencies must be \["aioncore_database_recovery"\]/),
  invalid('missing evidence', (c) => { capability(c, 'settings_i18n').evidence = []; }, /settings_i18n\.evidence must be a non-empty string array/),
  invalid('a weakened AionCore boundary code', (c) => {
    dependency(c, 'aioncore_database_recovery').capability_gate.required_boundary_code = 'BOOTSTRAP_DATA_INIT_WARNING';
  }, /AionCore database recovery boundary contract/),
  invalid('database.open recovery without a strict corruption marker', (c) => {
    const gate = dependency(c, 'aioncore_database_recovery').capability_gate;
    gate.accepted_failure_boundaries = structuredClone(failureBoundaries);
    gate.accepted_failure_boundaries[1].required_corruption_markers_any_of = [];
  }, /AionCore database recovery boundary contract/),
  invalid('a recovery success boundary outside database.recovery', (c) => {
    dependency(c, 'aioncore_database_recovery').capability_gate.recovery_success_boundary = { ...recoveryBoundary, stage: 'database.open' };
  }, /AionCore database recovery boundary contract/),
  invalid('a lowered AionCore minimum version', (c) => { dependency(c, 'aioncore_database_recovery').version_gate.minimum_version = 'v0.1.28'; }, /version_gate\.minimum_version must be v0\.1\.44/),
  invalid('a Shell package version outside the receipt', () => {}, /active shell package aioncoreVersion v0\.1\.49 must match receipt AionCore version v0\.1\.53/, () => ({ readJsonFile: () => ({ aioncoreVersion: 'v0.1.49' }) })),
  invalid('a selective absorption ref outside active shell history', () => {}, (c) => new RegExp('active shell HEAD must contain selective absorption ref ' + c.upstream_intake.source_refs.selective_absorption_head.ref), (c) => ({
    isGitAncestor: (ref) => ref !== c.upstream_intake.source_refs.selective_absorption_head.ref,
  })),
  invalid('a remediation ref outside active shell history', (c) => {
    const aionCore = dependency(c, 'aioncore_database_recovery');
    aionCore.evidence = aionCore.evidence.map((entry) => entry.startsWith('shell_commit:') ? 'shell_commit:' + missingRemediationRef : entry);
    aionCore.remediation_ref = missingRemediationRef;
  }, new RegExp('active shell HEAD must contain remediation ref ' + missingRemediationRef), () => ({ isGitAncestor: (ref) => ref !== missingRemediationRef })),
  invalid('absorbed feedback privacy without remediation evidence', (c) => delete capability(c, 'feedback_diagnostics_privacy').remediation_ref, /feedback_diagnostics_privacy requires remediation_ref/),
  invalid('remediation evidence bound to a different commit', (c) => { capability(c, 'feedback_diagnostics_privacy').remediation_ref = 'a'.repeat(40); }, /feedback_diagnostics_privacy evidence must bind shell_commit to remediation_ref/),
  invalid('an absorbed AionCore dependency that remains release-blocked', (c) => { dependency(c, 'aioncore_database_recovery').release_gate = 'blocked_until_version_and_capability_gate_verified'; }, /aioncore_database_recovery\.release_gate must be aioncore_database_recovery_verified/),
  invalid('an absorbed AionCore dependency that remains unverified', (c) => {
    const gate = dependency(c, 'aioncore_database_recovery').capability_gate;
    gate.state = 'unverified';
    gate.evidence = [];
  }, /absorbed AionCore database recovery dependency requires capability_gate\.state=verified/),
];

for (const { name, mutate, options, error } of invalidCases) {
  test('AionUI intake validator rejects ' + name, () => {
    const contract = readContract();
    mutate(contract);
    assert.throws(
      () => validateContract(contract, options?.(contract)),
      typeof error === 'function' ? error(contract) : error,
    );
  });
}

test('AionUI stable receipt validator fails closed on schema, policy, digest, and ancestry drift', () => {
  const mutations = [
    {
      error: /receipt schema/,
      mutate: (receipt) => { receipt.schema = 'opl_aionui_upstream_intake.v1'; },
    },
    {
      error: /receipt policy/,
      mutate: (receipt) => { receipt.policy.network_unknown = 'assume_current'; },
    },
    {
      error: /managed resources manifest.*SHA-256/,
      mutate: (receipt) => { receipt.managed_runtime.managed_resources_manifest_sha256 = 'bad'; },
    },
    {
      error: /legacy managed Codex ACP/,
      mutate: (receipt) => { receipt.managed_runtime.codex_acp = {}; },
    },
    {
      error: /official stable release metadata/,
      mutate: (receipt) => { receipt.reviewed_release.prerelease = true; },
    },
  ];
  for (const { mutate, error } of mutations) {
    const receipt = stableCurrentnessReceipt();
    mutate(receipt);
    assert.throws(() => validateContract(readContract(), {
      readShellReceipt: () => receipt,
    }), error);
  }

  const missingDirectCli = stableCurrentnessReceipt();
  delete missingDirectCli.managed_runtime.claude_cli;
  assert.throws(() => validateContract(readContract(), {
    readShellReceipt: () => missingDirectCli,
  }), /managed Claude CLI/);

  const receipt = stableCurrentnessReceipt();
  const missingRef = receipt.shell_projection.implementation_refs[0];
  assert.throws(() => validateContract(readContract(), {
    readShellReceipt: () => receipt,
    isGitAncestor: (ref) => ref !== missingRef,
  }), new RegExp(`active shell HEAD must contain receipt implementation ref ${missingRef}`));
});

test('AionUI current exact versions come from the receipt while v0.1.44 remains the floor', () => {
  const contract = readContract();
  const versionGate = dependency(contract, 'aioncore_database_recovery').version_gate;
  assert.equal(Object.hasOwn(versionGate, 'temporary_compatible_versions'), false);
  assert.equal(versionGate.minimum_version, 'v0.1.44');

  const futureReceipt = stableCurrentnessReceipt();
  futureReceipt.managed_runtime.aioncore.version = 'v0.1.51';
  assert.doesNotThrow(() => validateContract(contract, {
    readJsonFile: () => ({ aioncoreVersion: 'v0.1.51' }),
    readShellReceipt: () => futureReceipt,
  }));

  const belowMinimumReceipt = stableCurrentnessReceipt();
  belowMinimumReceipt.managed_runtime.aioncore.version = 'v0.1.43';
  assert.throws(() => validateContract(contract, {
    readJsonFile: () => ({ aioncoreVersion: 'v0.1.43' }),
    readShellReceipt: () => belowMinimumReceipt,
  }), /version_gate\.state must be below_minimum/);
});

test('Manual qualification contract preserves the system Codex home and keeps MAS Scholar workspace-scoped', () => {
  const adapter = readContract().manual_qualification_contract;
  const profile = readAppProductProfile();
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const firstRunMatrix = readJson('contracts/app-first-run-test-matrix.json');

  assert.equal(adapter.classification, 'non_stable_manual_qualification_candidate');
  assert.equal(adapter.stable_bundle_claim, 'forbidden');
  assert.equal(adapter.exact_source_lock_required, true);
  const aionCore = adapter.runtime_dependencies.aioncore;
  const codexCli = adapter.runtime_dependencies.codex_cli;
  const managedCodexAcp = adapter.runtime_dependencies.managed_codex_acp;
  assert.equal(Object.hasOwn(aionCore, 'version'), false);
  assert.deepEqual(aionCore, {
    version_source: 'package.json#aioncoreVersion',
    resource_authority: 'bundled-aioncore/<platform>-<arch>/managed-resources/manifest.json',
  });
  assert.equal(Object.hasOwn(codexCli, 'version'), false);
  assert.deepEqual(codexCli, {
    version_source: 'AionCore managed resource manifest',
    target_platform_binary_required: true,
  });
  assert.equal(Object.hasOwn(managedCodexAcp, 'version'), false);
  assert.deepEqual(managedCodexAcp.version_binding, {
    authority:
      'bundled-aioncore/<platform>-<arch>/managed-resources/manifest.json#acpTools[slug=codex-acp].version',
    mode: 'exact',
    required_consistency: [
      'manifest_root',
      'package_json',
      'package_lock',
      'installed_package',
      'runtime_initialize',
    ],
  });
  assert.equal(managedCodexAcp.forbidden_package, '@zed-industries/codex-acp');
  assert.deepEqual(profile.codex.app_runtime_home, {
    default_path: '~/.codex',
    override_env: 'CODEX_HOME',
    resolution_policy: 'preserve_existing_env_else_codex_system_default',
    app_env_injection: 'forbidden',
    startup_and_recheck_mutation: 'forbidden',
    explicit_model_access_mutation: 'framework_action_atomic_merge_with_backup_and_restore',
  });
  assert.deepEqual(adapter.codex_home, {
    default_path: '~/.codex',
    override_env: 'CODEX_HOME',
    resolution_policy: 'preserve_existing_env_else_codex_system_default',
    app_env_injection: 'forbidden',
    automatic_mutation: 'forbidden',
    explicit_model_access_mutation: 'framework_action_atomic_merge_with_backup_and_restore',
    required_processes: ['desktop_shell', 'aioncore', 'managed_codex_acp', 'opl_runtime_bridge'],
  });
  assert.equal(
    profile.first_run.full_runtime_package_qualification.composition_policy,
    'open_composition_no_fixed_package_set',
  );
  assert.equal(profile.first_run.full_runtime_package_qualification.global_workspace_scoped_exposure, 'forbidden');
  assert.equal(profile.first_run.first_conversation.runtime_readiness_route, '/api/conversations/<id>/runtime/ensure');
  const fullDmgScenario = firstRunMatrix.scenarios.find((scenario) => scenario.id === 'full_dmg_clean_vm_smoke');
  assert.ok(fullDmgScenario.expects.some((entry: string) => entry.includes('without requiring a fixed count')));
  const managedRuntimeExpectation = fullDmgScenario.expects.find((entry: string) =>
    entry.includes('Bundled AionCore v0.1.50')
  );
  assert.match(
    managedRuntimeExpectation,
    /managed resource manifest and package lock.*readback at 1\.1\.2.*Codex CLI 0\.144\.6/,
  );
  assert.doesNotMatch(managedRuntimeExpectation, /Codex CLI 0\.145|Codex 0\.145\.0/);
  assert.doesNotThrow(() => validateProductProfile(profile, installExposure));
});

test('Manual qualification product validator rejects Codex home, runtime route, and Scholar scope drift', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const mutations = [
    {
      error: /preserve the system Codex home/,
      mutate: (profile) => { profile.codex.app_runtime_home.default_path = '~/Library/Application Support/OPL/codex'; },
    },
    {
      error: /first conversation must apply granular prerequisites/,
      mutate: (profile) => { profile.first_run.first_conversation.runtime_readiness_route = '/api/conversations/<id>/warmup'; },
    },
    {
      error: /Full runtime package qualification boundary/,
      mutate: (profile) => { profile.first_run.full_runtime_package_qualification.global_workspace_scoped_exposure = 'allowed'; },
    },
  ];
  for (const { error, mutate } of mutations) {
    const profile = readJson('contracts/app-product-profile.json');
    mutate(profile);
    assert.throws(() => validateProductProfile(profile, installExposure), error);
  }
});

test('AionUI intake contract records managed-agent wire and focused verification policy', () => {
  const contract = readContract();
  const managed = contract.upstream_intake.managed_agent_api_contract;

  assert.deepEqual(managed.assistant_identity_policy.allowed_assistant_kinds, ['generated', 'preset']);
  assert.deepEqual(
    [
      managed.write_contracts.conversation.assistant_identity_path,
      managed.write_contracts.conversation.assistant_placement,
      managed.write_contracts.channel.selection_hook,
      managed.write_contracts.channel.read_method,
      managed.write_contracts.channel.write_method,
      managed.write_contracts.cron.identity_path,
      managed.write_contracts.team.shared_mapper,
      managed.write_contracts.team.identity_field,
      managed.write_contracts.team.response_members_field,
      managed.write_contracts.team.response_leader_field,
    ],
    [
      'assistant.id',
      'top_level',
      'useChannelAssistantSelection',
      'GET',
      'PUT',
      'agent_config.assistant_id',
      'toBackendAgent',
      'assistant_id',
      'assistants',
      'leader_assistant_id',
    ],
  );
  assert.equal(managed.write_contracts.conversation.caller_ids.length, 4);
  assert.deepEqual(managed.write_contracts.cron.schedule_field_map, { atMs: 'at_ms', everyMs: 'every_ms' });
  assert.deepEqual(managed.write_contracts.team.events, {
    'team.agentStatusChanged': 'fromBackendTeamAgentStatusEvent',
    'team.agentSpawned': 'fromBackendTeamAgentSpawnedEvent',
    'team.agentRemoved': 'passthrough',
    'team.agentRenamed': 'fromBackendTeamAgentRenamedEvent',
    'team.listChanged': 'passthrough',
    'team.teammateMessage': 'passthrough',
  });
  assert.deepEqual(managed.focused_tests, {
    node: MANAGED_AGENT_NODE_TESTS,
    dom: MANAGED_AGENT_DOM_TESTS,
  });
  assert.deepEqual(managed.verification_policy.focused_behavior_command_ids, [
    'managed_agent_behavior_node',
    'managed_agent_behavior_dom',
  ]);
  assert.equal(
    contract.validation_commands.find((entry) => entry.id === 'managed_agent_behavior_node')?.command,
    MANAGED_AGENT_NODE_COMMAND,
  );
  assert.equal(
    contract.validation_commands.find((entry) => entry.id === 'managed_agent_behavior_dom')?.command,
    MANAGED_AGENT_DOM_COMMAND,
  );
  assert.doesNotThrow(() => validateContract(contract));
});

test('AionUI quick gate requires managed-agent source and focused-test paths', () => {
  const contract = readContract();
  const managed = contract.upstream_intake.managed_agent_api_contract;
  const requiredPaths = [
    managed.implementation_surfaces.conversation_writer,
    managed.implementation_surfaces.conversation_guid_callers,
    managed.implementation_surfaces.team_mapper,
    managed.implementation_surfaces.team_types,
    'tests/unit/common-adapter/apiModelMapper.test.ts',
    'tests/unit/guid/useGuidSend.oplWhitelist.dom.test.tsx',
    'tests/unit/common-adapter/ipcBridgeAgents.test.ts',
    'tests/unit/common-adapter/teamMapper.test.ts',
  ];

  for (const missingPath of requiredPaths) {
    const evidence = managedAgentStructuralFiles(contract).filter(
      (sourceFile) => sourceFile.relativePath !== missingPath,
    );
    assert.throws(
      () => validateContract(contract, { readShellSourceFiles: () => evidence }),
      new RegExp(`required managed-agent evidence missing ${missingPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    );
  }
});

test('AionUI intake validator rejects managed-agent contract, ancestry, command, and wire drift', () => {
  const missingContract = readContract();
  delete missingContract.upstream_intake.managed_agent_api_contract;
  assert.throws(() => validateContract(missingContract), /managed-agent API compatibility contract/);

  const missingRemediation = readContract();
  delete capability(missingRemediation, 'managed_agent_api').remediation_ref;
  assert.throws(() => validateContract(missingRemediation), /managed_agent_api requires remediation_ref/);

  const wrongRemediation = readContract();
  const managedCapability = capability(wrongRemediation, 'managed_agent_api');
  const wrongRef = 'e'.repeat(40);
  managedCapability.remediation_ref = wrongRef;
  managedCapability.evidence = managedCapability.evidence.map((entry) =>
    entry.startsWith('shell_commit:') ? `shell_commit:${wrongRef}` : entry,
  );
  assert.throws(
    () => validateContract(wrongRemediation),
    new RegExp(`managed_agent_api\\.remediation_ref must be ${MANAGED_AGENT_REMEDIATION_REF}`),
  );

  const commandDrift = readContract();
  commandDrift.validation_commands = commandDrift.validation_commands.map((entry) =>
    entry.id === 'managed_agent_behavior_node'
      ? { ...entry, command: 'bunx vitest run tests/unit/common-adapter/apiModelMapper.test.ts' }
      : entry,
  );
  assert.throws(
    () => validateContract(commandDrift),
    /managed-agent focused behavior command managed_agent_behavior_node/,
  );

  for (const mutate of [
    (contract) => {
      contract.upstream_intake.managed_agent_api_contract.write_contracts.conversation.assistant_identity_path =
        'extra.assistant.id';
    },
    (contract) => {
      contract.upstream_intake.managed_agent_api_contract.write_contracts.channel.selection_hook =
        'direct_form_config_write';
    },
    (contract) => {
      contract.upstream_intake.managed_agent_api_contract.write_contracts.cron.identity_path = 'assistant_id';
    },
    (contract) => {
      contract.upstream_intake.managed_agent_api_contract.write_contracts.team.identity_field = 'runtime_agent_id';
    },
  ]) {
    const contract = readContract();
    mutate(contract);
    assert.throws(() => validateContract(contract), /managed-agent API compatibility contract/);
  }
});

test('AionUI quick gate rejects retired managed-agent facade paths', () => {
  const contract = readContract();

  for (const retiredPath of contract.upstream_intake.managed_agent_api_contract.retired_facade_paths) {
    assert.throws(
      () => validateContract(contract, {
        readShellSourceFiles: () => [
          ...managedAgentStructuralFiles(contract),
          { relativePath: retiredPath, text: 'export {};' },
        ],
      }),
      new RegExp(`retired managed-agent facade path.*${path.basename(retiredPath)}`),
    );
  }
});
