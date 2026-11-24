import {
  assert,
  fs,
  test,
  validateAppGuiProductContract,
  validatePrimaryInteractionPages,
  validateProductProfile,
  assertCodexModelPolicyProjection,
  projectCodexModelPolicyContracts,
  readJson,
  readModelPolicyBundle,
} from "./fixtures.ts";

test('41301 machine authority rejects v1 contract schemas', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');

  const guiContract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
  guiContract.schema_version = 1;
  assert.throws(
    () => validateAppGuiProductContract(
      guiContract,
      readJson('contracts/app-release-channel.json'),
      installExposure,
    ),
    /schema_version must be 2/,
  );

  const productProfile = structuredClone(readJson('contracts/app-product-profile.json'));
  productProfile.schema_version = 1;
  assert.throws(
    () => validateProductProfile(productProfile, installExposure),
    /schema_version must be 2/,
  );

  const matrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
  matrix.schema_version = 1;
  assert.throws(
    () => validatePrimaryInteractionPages(matrix),
    /schema_version must be 2/,
  );
});
test('41301 GUI contract rejects persistent project context and legacy inspector taxonomy', () => {
  const validate = (contract: any) => validateAppGuiProductContract(
    contract,
    readJson('contracts/app-release-channel.json'),
    readJson('contracts/app-install-exposure-policy.json'),
  );

  for (const mutate of [
    (contract: any) => {
      contract.ordinary_conversation.composer_context_strip = ['project_context_refs', 'active_capability'];
    },
    (contract: any) => {
      contract.ordinary_conversation.project_context_inputs = { scope: 'canonical_workspace_path' };
    },
    (contract: any) => {
      contract.ordinary_conversation.artifact_preview.project_context_ref_policy = { workspace_scoped: true };
    },
    (contract: any) => {
      contract.ordinary_conversation.session_workspace_model.workspace_owns_context = true;
    },
    (contract: any) => {
      contract.ordinary_conversation.session_workspace_model.bound_project_reassignment = 'exposed';
    },
    (contract: any) => {
      contract.right_context_inspector.primary_tools = [
        { id: 'review' },
        { id: 'terminal' },
        { id: 'browser' },
        { id: 'files' },
      ];
    },
    (contract: any) => {
      contract.right_context_inspector.runtime_duplicate_allowed = true;
    },
    (contract: any) => {
      contract.ordinary_conversation.current_task_slice.default_visibility =
        'pinnable_summary_bar_when_task_active';
    },
    (contract: any) => {
      contract.ordinary_conversation.transcript_export.workspace_bundle_authorized = true;
    },
  ]) {
    const contract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
    mutate(contract);
    assert.throws(() => validate(contract));
  }
});

test('session-first contracts reject directory ownership, stale cache authority, and workspace-gated local inputs', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const validateGui = (contract: any) => validateAppGuiProductContract(
    contract,
    readJson('contracts/app-release-channel.json'),
    installExposure,
  );

  for (const mutate of [
    (contract: any) => {
      contract.interaction_baseline.navigation_rail.thread_directory_policy.directory_group_policy.cascade_session_delete_allowed = true;
    },
    (contract: any) => {
      contract.interaction_baseline.navigation_rail.thread_directory_policy.stale_codex_acp_cache_row_policy = 'keep';
    },
    (contract: any) => {
      contract.interaction_baseline.navigation_rail.thread_directory_policy.title_based_deduplication_allowed = true;
    },
    (contract: any) => {
      contract.first_launch_readiness_policy.ordinary_shell_recovery_policy.send_scoped_local_inputs.workspace_root_required = true;
    },
    (contract: any) => {
      contract.first_launch_readiness_policy.ordinary_shell_recovery_policy.workspace_controls.send_scoped_local_inputs_remain_available = false;
    },
    (contract: any) => {
      contract.interaction_baseline.conversation_scope.explicit_session_input_policy.workspace_readiness_boundary.agent_package_workspace_requirement_policy = 'all_agent_packages_require_workspace';
    },
    (contract: any) => {
      contract.interaction_baseline.conversation_scope.explicit_session_input_policy.workspace_readiness_boundary.ordinary_codex_conversation_independent_of_agent_package_readiness = false;
    },
  ]) {
    const contract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
    mutate(contract);
    assert.throws(() => validateGui(contract));
  }

  for (const mutate of [
    (profile: any) => {
      profile.gui.ordinary_conversation.explicit_session_input_policy.workspace_preload_allowed = true;
    },
    (profile: any) => {
      profile.gui.ordinary_conversation.explicit_session_input_policy.workspace_readiness_boundary.send_scoped_local_file_inputs_require_workspace_root = true;
    },
    (profile: any) => {
      profile.gui.home.home_composer_state_contract.semantic_probe.instance_counts['guid-input-card-shell'] = 2;
    },
    (profile: any) => {
      profile.first_run.first_conversation.required_before_send_with_local_inputs.unshift('workspace_root');
    },
    (profile: any) => {
      profile.first_run.ordinary_shell_recovery.send_scoped_local_inputs.workspace_root_required = true;
    },
    (profile: any) => {
      profile.first_run.ordinary_shell_recovery.send_scoped_local_inputs.supported_inputs = [
        'file_dialog_attachment',
      ];
    },
    (profile: any) => {
      profile.gui.ordinary_conversation.explicit_session_input_policy.workspace_readiness_boundary.agent_package_workspace_requirement_policy = 'all_agent_packages_require_workspace';
    },
    (profile: any) => {
      profile.gui.ordinary_conversation.explicit_session_input_policy.workspace_readiness_boundary.ordinary_codex_conversation_independent_of_agent_package_readiness = false;
    },
    (profile: any) => {
      profile.gui.ordinary_conversation.session_workspace_model.project_adoption_transition = 'not_exposed';
    },
  ]) {
    const profile = structuredClone(readJson('contracts/app-product-profile.json'));
    mutate(profile);
    assert.throws(() => validateProductProfile(profile, installExposure));
  }

  for (const mutate of [
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'ordinary_conversation')
        .conversation_view_model.explicit_session_input_policy.implicit_workspace_context_injection_allowed = true;
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'ordinary_conversation')
        .conversation_view_model.artifact_preview.entry_sources.push('workspace_project_context_ref');
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'guid_home')
        .home_view_model.home_composer_state_contract.semantic_probe.instance_counts['opl-guid-entry'] = 2;
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'ordinary_conversation').conversation_view_model.environment_workspace_handoff = {
        contract_ref: 'retired_worktree_handoff',
      };
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'ordinary_conversation')
        .conversation_view_model.session_workspace_model.bound_project_reassignment = 'exposed';
    },
  ]) {
    const matrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
    mutate(matrix);
    assert.throws(() => validatePrimaryInteractionPages(matrix));
  }
});

test('conversation contracts reject clearing send-scoped inputs on creation or send failure', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');

  const guiContract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
  guiContract.ordinary_conversation.send_failure_input_policy.must_preserve_send_scoped_local_inputs = false;
  assert.throws(
    () =>
      validateAppGuiProductContract(
        guiContract,
        readJson('contracts/app-release-channel.json'),
        installExposure,
      ),
    /ordinary conversation contract/,
  );

  const productProfile = structuredClone(readJson('contracts/app-product-profile.json'));
  productProfile.gui.ordinary_conversation.send_failure_input_policy.failure_scopes = [
    'conversation_creation',
    'in_conversation_send',
  ];
  assert.throws(
    () => validateProductProfile(productProfile, installExposure),
    /must preserve prompt and attachments/,
  );

  const pageMatrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
  pageMatrix.pages.find(
    (page: any) => page.id === 'ordinary_conversation',
  ).conversation_view_model.send_failure_input_policy.concurrent_edit_merge_policy =
    'replace_current_composer';
  assert.throws(
    () => validatePrimaryInteractionPages(pageMatrix),
    /Ordinary conversation view model shell policy/,
  );
});

test('41301 profile and page state reject the legacy eight-surface inspector', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const profile = structuredClone(readJson('contracts/app-product-profile.json'));
  profile.gui.right_context_inspector.primary_tools = [
    { id: 'review' },
    { id: 'terminal' },
    { id: 'browser' },
    { id: 'files' },
  ];
  profile.gui.right_context_inspector.secondary_sections = [
    { id: 'artifacts' },
    { id: 'runtime' },
    { id: 'actions' },
    { id: 'memory' },
  ];
  assert.throws(() => validateProductProfile(profile, installExposure));

  const matrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
  const inspector = matrix.pages.find(({ id }: { id: string }) => id === 'right_context_inspector');
  inspector.inspector_view_model.primary_tools = profile.gui.right_context_inspector.primary_tools;
  inspector.inspector_view_model.secondary_sections = profile.gui.right_context_inspector.secondary_sections;
  assert.throws(() => validatePrimaryInteractionPages(matrix));
});

test('41301 GUI authority rejects false Review focus and inline-comment completion', () => {
  for (const mutate of [
    (contract: any) => {
      contract.right_context_inspector.review_surface.source_capability_status.review_focus_context =
        'source_implemented_same_review_turn_steer_expected_turn_id';
    },
    (contract: any) => {
      contract.interaction_baseline.context_surfaces.review_pane.review_focus_delivery_policy =
        'non_custom_target_plain_text_turn_steer_same_review_thread_expected_turn_id_custom_instructions_not_duplicated';
    },
    (contract: any) => {
      contract.right_context_inspector.review_surface.source_capability_status.inline_comments =
        'source_implemented_shell_annotation_store';
    },
  ]) {
    const guiContract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
    mutate(guiContract);
    assert.throws(() =>
      validateAppGuiProductContract(
        guiContract,
        readJson('contracts/app-release-channel.json'),
        readJson('contracts/app-install-exposure-policy.json'),
      ),
    );
  }

  for (const mutate of [
    (reviewSurface: any) => {
      reviewSurface.source_capability_status.review_focus_context =
        'source_implemented_same_review_turn_steer_expected_turn_id';
    },
    (reviewSurface: any) => {
      reviewSurface.review_focus_delivery_policy =
        'non_custom_target_plain_text_turn_steer_same_review_thread_expected_turn_id_custom_instructions_not_duplicated';
    },
    (reviewSurface: any) => {
      reviewSurface.source_capability_status.inline_comments = 'source_implemented_shell_annotation_store';
    },
  ]) {
    const matrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
    const inspector = matrix.pages.find(({ id }: { id: string }) => id === 'right_context_inspector');
    mutate(inspector.inspector_view_model.review_surface);
    assert.throws(() => validatePrimaryInteractionPages(matrix));
  }
});

test('page-state matrix rejects Codex Auto policy source drift', () => {
  const matrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
  const guidHome = matrix.pages.find(({ id }) => id === 'guid_home');
  guidHome.home_view_model.codex_auto_model_policy_ref = 'shell-local-policy';

  assert.throws(() => validatePrimaryInteractionPages(matrix));
});

test('GUI contract rejects restoring private Package activation authority', () => {
  const guiContract = structuredClone(readJson('contracts/app-gui-product-contract.json'));
  assert.equal('agent_package_activation_policy' in guiContract, false);
  guiContract.agent_package_activation_policy = {
    internal_action_id: 'fixed-private-action',
  };

  assert.throws(
    () => validateAppGuiProductContract(
      guiContract,
      readJson('contracts/app-release-channel.json'),
      readJson('contracts/app-install-exposure-policy.json'),
    ),
    /must not restore private Package activation authority/,
  );
});
