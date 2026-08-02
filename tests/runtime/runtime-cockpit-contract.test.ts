import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validateRuntimeProgressPageDisplayPolicy } from '../../scripts/validate-active-shell/runtime-bridge-validator.ts';
import { validateCoreRuntimeRoute } from '../../scripts/validate-active-shell/runtime-route-validator.ts';
import {
  validateAgentAvailabilityProjectionContract,
  validateUserTaskStatusProjectionContract,
  validateWorkItemRowIdentityFixture,
  validateWorkItemProjectionContract,
} from '../../scripts/validate-active-shell/shared-contract-validators.ts';

const readJson = (relativePath: string) => JSON.parse(fs.readFileSync(relativePath, 'utf8'));

const validateRoute = ({
  guiContract = readJson('contracts/app-gui-product-contract.json'),
  matrix = readJson('contracts/app-page-state-matrix.json'),
} = {}) => validateCoreRuntimeRoute({
  guiProductContract: guiContract,
  pageStateMatrix: matrix,
  shellAdapter: readJson('contracts/app-shell-adapter.json'),
  runtimeBridge: readJson('contracts/app-runtime-bridge.json'),
  releaseChannel: readJson('contracts/app-release-channel.json'),
  installExposurePolicy: readJson('contracts/app-install-exposure-policy.json'),
});

const validateGuiContract = (guiContract: any) => validateRoute({ guiContract });

const validatePageState = (matrix: any, guiContract = readJson('contracts/app-gui-product-contract.json')) =>
  validateRoute({ guiContract, matrix });

const runtimeContract = () => readJson('contracts/app-gui-product-contract.json');
const runtimeBridge = () => readJson('contracts/app-runtime-bridge.json');

test('Runtime V2 product, projection, availability, and page-state contracts are active', () => {
  const bridge = runtimeBridge();
  assert.doesNotThrow(() => validateGuiContract(runtimeContract()));
  assert.doesNotThrow(() => validatePageState(readJson('contracts/app-page-state-matrix.json')));
  assert.doesNotThrow(() => validateWorkItemProjectionContract(bridge.work_item_projection, 'test projection'));
  assert.doesNotThrow(() => validateRuntimeProgressPageDisplayPolicy(bridge));
  assert.doesNotThrow(() => validateAgentAvailabilityProjectionContract(bridge.agent_availability_projection, 'test agents'));
});

test('Runtime owner acceptance and currentness use generic refs and fail closed', () => {
  const bridge = runtimeBridge();
  const userTaskStatus = bridge.user_task_status_projection;
  const genericPolicy = userTaskStatus.generic_owner_acceptance_currentness_ref_policy;
  assert.deepEqual(genericPolicy, {
    projection_field: 'stage_run_current_owner_delta',
    owner_field: 'owner',
    accepted_return_shapes_field: 'accepted_return_shapes',
    acceptance_or_blocker_refs_field: 'artifact_or_blocker_refs',
    currentness_guard_refs_field: 'readiness_false_flag_refs',
    unknown_owner_policy: 'unknown_fail_closed_no_acceptance_or_currentness_inference',
    missing_refs_policy: 'unknown_fail_closed_no_acceptance_or_currentness_inference',
    app_role: 'display_only_refs_consumer_no_owner_verdict_authority',
  });

  const retiredMasFields = [
    'mas_runtime_acceptance_display_policy',
    'mas_owner_consumption_status',
    'mas_owner_consumption_ref',
    'mas_owner_consumed_stage_attempt_id',
    'mas_owner_consumed_closeout_ref',
    'mas_owner_consumption_matches_runtime_closeout',
    'mas_currentness_drift_text',
  ];
  const guiContract = runtimeContract();
  const guiInactiveSummaryFields = guiContract.framework_surfaces.runtime_default_attention
    .project_group_expansion_policy.inactive_summary_fields;
  const bridgeInactiveSummaryFields = bridge.project_progress_projection.active_project_line_projection
    .project_group_expansion_policy.inactive_summary_fields;
  for (const field of retiredMasFields) {
    assert.equal(userTaskStatus.task_fields.includes(field), false);
    assert.equal(guiInactiveSummaryFields.includes(field), false);
    assert.equal(bridgeInactiveSummaryFields.includes(field), false);
    assert.equal(bridge.runtime_progress_page_display_policy.advanced_only_fields.includes(field), false);
  }
  assert.equal(guiInactiveSummaryFields.includes('stage_run_current_owner_delta'), true);
  assert.equal(bridgeInactiveSummaryFields.includes('stage_run_current_owner_delta'), true);

  for (const mutate of [
    (candidate: any) => {
      candidate.user_task_status_projection.generic_owner_acceptance_currentness_ref_policy.unknown_owner_policy =
        'infer_acceptance_from_agent_id';
    },
    (candidate: any) => {
      candidate.user_task_status_projection.generic_owner_acceptance_currentness_ref_policy.missing_refs_policy =
        'treat_runtime_closeout_as_owner_acceptance';
    },
    (candidate: any) => {
      candidate.user_task_status_projection.task_fields.push('mas_owner_consumption_status');
    },
    (candidate: any) => {
      candidate.user_task_status_projection.mas_runtime_acceptance_display_policy =
        'infer acceptance from a MAS-only runtime mirror';
    },
  ]) {
    const candidate = runtimeBridge();
    mutate(candidate);
    assert.throws(() => validateUserTaskStatusProjectionContract(
      candidate.user_task_status_projection,
      'mutated owner acceptance/currentness projection',
      candidate.stage_run_cockpit_projection,
    ));
  }
});

test('typed owner views use a generic transport envelope without an App domain schema mirror', () => {
  const product = runtimeContract().pages.runtime_status.runtime_cockpit_product_contract;
  const bridge = runtimeBridge().work_item_projection;
  const descriptor = bridge.field_contracts.domain_detail_views;
  const read = bridge.domain_detail_view_read_contract;
  assert.equal(descriptor.capability_id, 'opl_app.typed_domain_views.v3');
  assert.equal(descriptor.requirement_class, 'optional_domain_enhancement');
  assert.deepEqual(descriptor.absence_policy, {
    app_state_activation_allowed: true,
    runtime_core_unaffected: true,
    work_item_row_and_core_detail_preserved: true,
    dependent_detail_surfaces_hidden: true,
    global_failure_allowed: false,
  });
  assert.deepEqual(descriptor.required_fields, ['item_id', 'view_id', 'view_kind', 'availability']);
  assert.deepEqual(descriptor.optional_fields, ['title', 'schema_ref', 'schema_version', 'revision', 'digest']);
  assert.deepEqual(descriptor.availability_values, ['unread', 'available', 'missing', 'stale', 'invalid', 'read_error']);
  assert.deepEqual(read.availability_values, ['available', 'missing', 'stale', 'invalid', 'read_error']);
  assert.equal(read.command.includes('--if-revision <revision>'), true);
  assert.equal(descriptor.renderer_selection_field, 'view_kind');
  assert.equal(descriptor.renderer_registry_source, 'shell_extension_registry');
  assert.equal(descriptor.app_domain_schema_registry_allowed, false);
  assert.equal(descriptor.unknown_view_kind_policy, 'localized_unavailable_preserve_work_item_and_return_to_runtime');
  assert.equal(Object.hasOwn(read, 'payload_contracts'), false);
  assert.equal(read.app_payload_shape_interpretation_allowed, false);
  assert.deepEqual(read.response_optional_fields, ['digest', 'generation', 'payload_schema_ref', 'payload_schema']);
  assert.deepEqual(product.domain_detail_views.renderer_extension_abi, {
    schema: 'opl_app.domain_detail_renderer_extension.v1',
    delivery_owner: 'domain_agent_package_owner',
    registry_composition_owner: 'shell',
    delivery_mode: 'owner_source_composed_into_trusted_shell_build',
    registration_key: 'view_kind',
    registration_required_fields: ['view_kind', 'owner_package_id', 'renderer_id', 'schema_compatibility', 'component'],
    schema_compatibility_source: 'owner_renderer_extension',
    payload_schema_and_validation_owner: 'domain_owner_renderer_extension',
    runtime_dynamic_code_loading_allowed: false,
    descriptor_supplied_module_path_or_url_allowed: false,
    agent_id_branching_allowed: false,
    app_registered_view_kind_or_domain_schema_mirror_allowed: false,
    unknown_or_incompatible_policy: 'localized_unavailable_preserve_work_item_and_return_to_runtime',
    registered_renderer_removal_policy: {
      opaque_generic_fallback_is_equivalent_replacement: false,
      removal_requires: [
        'owner_producer_retirement_evidence_for_view_kind',
        'or_compatible_replacement_renderer_with_equivalent_user_visible_acceptance',
      ],
    },
  });
});

test('core Runtime route gate rejects an absent route', () => {
  const guiContract = runtimeContract();
  delete guiContract.pages.runtime_status;
  assert.throws(() => validateGuiContract(guiContract));

  const matrix = readJson('contracts/app-page-state-matrix.json');
  matrix.pages = matrix.pages.filter((page: any) => page.id !== 'runtime');
  assert.throws(() => validatePageState(matrix));
});

test('WorkItemProjection V2 requires global item identity, all nine axes, and observed-only Token semantics', () => {
  const mutations = [
    (projection: any) => { projection.schema_version = 'work-item-projection.v1'; },
    (projection: any) => { projection.required_fields = projection.required_fields.filter((field: string) => field !== 'item_id'); },
    (projection: any) => { projection.required_fields = projection.required_fields.filter((field: string) => field !== 'attention'); },
    (projection: any) => { projection.field_contracts.attention.system_responsibility_required_fields = ['issue']; },
    (projection: any) => { projection.field_contracts.attention.system_attention_requires_current_generation = false; },
    (projection: any) => { projection.field_contracts.telemetry.missing_may_render_as_zero = true; },
    (projection: any) => { projection.field_contracts.telemetry.token_progress_bar_allowed = true; },
    (projection: any) => { projection.diagnostic_envelope_contract.diagnostics_items_field_required = false; },
    (projection: any) => { projection.diagnostic_envelope_contract.fast_profile_nonzero_count_with_empty_items_is_valid = false; },
    (projection: any) => { projection.diagnostic_envelope_contract.fast_profile_embedded_item_count_must_not_exceed_count = false; },
    (projection: any) => { projection.diagnostic_envelope_contract.valid_summary_only_preserves_projects_and_work_items = false; },
    (projection: any) => { projection.field_contracts.domain_detail_views.full_payload_in_fast_state_allowed = true; },
    (projection: any) => { projection.field_contracts.domain_detail_views.app_agent_id_branching_allowed = true; },
    (projection: any) => { projection.field_contracts.domain_detail_views.requirement_class = 'required_core_capability'; },
    (projection: any) => { projection.field_contracts.domain_detail_views.absence_policy.app_state_activation_allowed = false; },
    (projection: any) => { projection.field_contracts.domain_detail_views.absence_policy.global_failure_allowed = true; },
    (projection: any) => { projection.field_contracts.domain_detail_views.required_fields.push('current_focus'); },
    (projection: any) => { projection.field_contracts.domain_detail_views.optional_fields = ['digest']; },
    (projection: any) => { projection.field_contracts.domain_detail_views.availability_values = ['available', 'missing']; },
    (projection: any) => { projection.field_contracts.domain_detail_views.registered_view_kinds = { private_view: {} }; },
    (projection: any) => { projection.domain_detail_view_read_contract.app_may_submit_ref_or_path = true; },
    (projection: any) => { projection.domain_detail_view_read_contract.unchanged_response.not_modified = false; },
    (projection: any) => { projection.domain_detail_view_read_contract.payload_contracts = { private_view: {} }; },
    (projection: any) => { projection.domain_detail_view_read_contract.command = 'opl app view read --json'; },
    (projection: any) => { projection.domain_detail_view_read_contract.response_optional_fields = ['digest']; },
    (projection: any) => { projection.domain_detail_view_read_contract.app_payload_shape_interpretation_allowed = true; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const projection = structuredClone(runtimeBridge().work_item_projection);
    mutate(projection);
    assert.throws(() => validateWorkItemProjectionContract(projection, 'mutated projection'));
  }
});

test('Runtime identity uses global item_id while mutation and readback use the full project tuple', () => {
  const rows = [
    {
      item_id: 'project-a:paper-001',
      identity: { agent_id: 'mas', project_id: 'project-a', work_item_id: 'paper-001' },
    },
    {
      item_id: 'project-b:paper-001',
      identity: { agent_id: 'mas', project_id: 'project-b', work_item_id: 'paper-001' },
    },
  ];
  assert.doesNotThrow(() => validateWorkItemRowIdentityFixture(
    rows,
    'cross-project local-id collision',
    { requireCrossProjectLocalIdCollision: true },
  ));

  const duplicateGlobalId = structuredClone(rows);
  duplicateGlobalId[1].item_id = duplicateGlobalId[0].item_id;
  assert.throws(() => validateWorkItemRowIdentityFixture(
    duplicateGlobalId,
    'duplicate global item id',
    { requireCrossProjectLocalIdCollision: true },
  ));

  const projectionMutations = [
    (projection: any) => { projection.field_contracts.identity.required_fields.push('generation'); },
    (projection: any) => { projection.field_contracts.identity.workspace_directory_rename_changes_project_id = false; },
    (projection: any) => { projection.row_identity_contract.canonical_row_key = 'identity.work_item_id'; },
    (projection: any) => { projection.row_identity_contract.detail_selection_key = 'identity.work_item_id'; },
    (projection: any) => { projection.row_identity_contract.duplicate_local_work_item_id_across_projects_allowed = false; },
    (projection: any) => { projection.visibility_mutation_contract.payload_required_fields = ['work_item_id', 'visibility']; },
    (projection: any) => { projection.visibility_mutation_contract.success_readback_selector = 'work_item_projection_v2.items[identity.work_item_id=payload.work_item_id]'; },
    (projection: any) => { projection.visibility_mutation_contract.success_readback_identity_fields = ['identity.work_item_id']; },
    (projection: any) => { projection.detail_layer_contract.selection_key = 'identity.work_item_id'; },
  ];
  for (const mutate of projectionMutations) {
    const projection = structuredClone(runtimeBridge().work_item_projection);
    mutate(projection);
    assert.throws(() => validateWorkItemProjectionContract(projection, 'mutated identity projection'));
  }
});

test('Runtime action localization uses semantic keys, one message_args object, owner, and concrete owner kinds', () => {
  for (const mutate of [
    (projection: any) => { projection.field_contracts.action.required_fields.push('title_args'); },
    (projection: any) => { projection.field_contracts.action.required_fields.push('summary_args'); },
    (projection: any) => { projection.field_contracts.action.required_fields = projection.field_contracts.action.required_fields.filter((field: string) => field !== 'message_args'); },
    (projection: any) => { projection.field_contracts.action.owner_kinds = ['user', 'framework', 'agent', 'system', 'none']; },
    (projection: any) => { projection.field_contracts.action.compatibility_fallback_fields.push('copy_locale'); },
    (projection: any) => { projection.action_envelope_contract.default_row_fields = ['kind', 'title_key', 'title_args', 'owner_kind']; },
  ]) {
    const projection = structuredClone(runtimeBridge().work_item_projection);
    mutate(projection);
    assert.throws(() => validateWorkItemProjectionContract(projection, 'mutated action projection'));
  }
});

test('Runtime bridge display policy uses global row identity and one semantic args object', () => {
  for (const mutate of [
    (bridge: any) => { bridge.runtime_progress_page_display_policy.task_deduplication_policy.canonical_row_key = 'identity.work_item_id'; },
    (bridge: any) => { bridge.runtime_progress_page_display_policy.task_deduplication_policy.duplicate_local_work_item_id_across_projects_allowed = false; },
    (bridge: any) => { bridge.runtime_progress_page_display_policy.default_field_allowlist.push('action.title_args'); },
    (bridge: any) => { bridge.runtime_progress_page_display_policy.next_step_copy_policy.source_priority = ['action.title_key + action.title_args']; },
    (bridge: any) => { bridge.runtime_progress_page_display_policy.next_step_copy_policy.compatibility_fallback_fields.push('action.copy_locale'); },
    (bridge: any) => { bridge.runtime_progress_page_display_policy.advanced_only_fields.push('mas_owner_consumption_ref'); },
  ]) {
    const bridge = runtimeBridge();
    mutate(bridge);
    assert.throws(() => validateRuntimeProgressPageDisplayPolicy(bridge));
  }
});

test('Manual archive is Framework visibility with generation concurrency and preserved lifecycle', () => {
  for (const mutate of [
    (projection: any) => { projection.field_contracts.lifecycle.business_states = ['active', 'paused', 'stopped']; },
    (projection: any) => { projection.field_contracts.visibility.required_fields = ['state', 'generation', 'token']; },
    (projection: any) => { projection.field_contracts.visibility.generation_is_concurrency_token = false; },
    (projection: any) => { projection.visibility_mutation_contract.payload_optional_fields = ['expected_generation']; },
    (projection: any) => { projection.visibility_mutation_contract.concurrency_token_readback_source = 'item.visibility.token'; },
    (projection: any) => { projection.visibility_mutation_contract.visibility_mutation_may_change_lifecycle = true; },
    (projection: any) => { projection.visibility_mutation_contract.visibility_mutation_may_stop_execution = true; },
    (projection: any) => { projection.visibility_mutation_contract.local_storage_truth_allowed = true; },
  ]) {
    const projection = structuredClone(runtimeBridge().work_item_projection);
    mutate(projection);
    assert.throws(() => validateWorkItemProjectionContract(projection, 'mutated visibility projection'));
  }
});

test('Runtime product rejects list, status, Stage popover, surface-boundary, and renderer regressions', () => {
  for (const mutate of [
    (contract: any) => { contract.default_list.columns.push('agent'); },
    (contract: any) => { contract.default_list.one_row_per_work_item = false; },
    (contract: any) => { contract.default_list.shell_heuristic_deduplication_allowed = true; },
    (contract: any) => { contract.default_list.responsive_acceptance.horizontal_page_overflow_allowed = true; },
    (contract: any) => { contract.default_list.responsive_acceptance.layout_by_viewport['1024'] = 'four_columns'; },
    (contract: any) => { contract.default_list.responsive_acceptance.screenshot_per_viewport_required = false; },
    (contract: any) => { contract.primary_state_language.labels_by_locale['zh-CN'].system_attention = '需要系统处理'; },
    (contract: any) => { contract.default_list.canonical_row_key = 'identity.work_item_id'; },
    (contract: any) => { contract.project_identity.workspace_directory_rename_changes_project_id = false; },
    (contract: any) => { contract.action_localization.required_semantic_fields.push('title_args'); },
    (contract: any) => { contract.work_item_visibility.visibility_required_fields = ['state', 'generation', 'token']; },
    (contract: any) => { contract.work_item_detail.selection_key = 'identity.work_item_id'; },
    (contract: any) => { contract.system_attention.required_fields = ['issue']; },
    (contract: any) => { contract.token_usage.missing_value_may_render_as_zero = true; },
    (contract: any) => { contract.token_usage.progress_bar_allowed = true; },
    (contract: any) => { contract.work_item_detail.primary_sections = ['timeline']; },
    (contract: any) => { contract.work_item_detail.secondary_sections = ['artifacts', 'timeline']; },
    (contract: any) => { contract.work_item_detail.diagnostic_sections = ['logs']; },
    (contract: any) => { contract.work_item_detail.delivered_stage_map_terminal_boundary.visible_stage_states.push('pending'); },
    (contract: any) => { contract.work_item_detail.delivered_stage_map_terminal_boundary.post_delivery_next_step_source = 'stage_map.next_action'; },
    (contract: any) => { contract.text_wrapping.ordinary_user_text_policy = 'arbitrary_character_boundaries'; },
    (contract: any) => { contract.text_wrapping.unbroken_technical_string_policy = 'always_break_anywhere'; },
    (contract: any) => { contract.agent_availability_routing.runtime_page_visible = true; },
    (contract: any) => { contract.stage_popover.current_attempt_default_row_visible = true; },
    (contract: any) => { contract.stage_popover.trigger_does_not_open_task_drawer = false; },
    (contract: any) => { contract.runtime_surface_exclusions.forbidden = []; },
    (contract: any) => { contract.renderer_policy.status_derivation_allowed = true; },
    (contract: any) => { contract.renderer_policy.technical_execution_stage_may_replace_business_stage = true; },
    (contract: any) => { contract.progressive_disclosure.raw_technical_fields_default_visible = true; },
    (contract: any) => { contract.progressive_disclosure.excluded_technical_detail_owner = '/runtime'; },
    (contract: any) => { contract.domain_detail_views.app_activation_gate = true; },
    (contract: any) => { contract.domain_detail_views.runtime_route_gate = true; },
    (contract: any) => { contract.domain_detail_views.capability_absent_behavior.runtime_page_preserved = false; },
    (contract: any) => { contract.domain_detail_views.capability_absent_behavior.selected_item_core_detail_preserved = false; },
    (contract: any) => { contract.domain_detail_views.capability_absent_behavior.global_failure_allowed = true; },
    (contract: any) => { contract.domain_detail_views.agent_id_branching_allowed = true; },
    (contract: any) => { contract.domain_detail_views.full_payload_in_fast_state_allowed = true; },
    (contract: any) => { contract.domain_detail_views.layout_contract.machine_fields_visible = true; },
    (contract: any) => { contract.domain_detail_views.layout_contract.horizontal_page_overflow_allowed = true; },
    (contract: any) => { contract.domain_detail_views.registered_view_kinds = ['private_view']; },
    (contract: any) => { delete contract.domain_detail_views.renderer_extension_abi; },
    (contract: any) => { contract.domain_detail_views.renderer_extension_abi.delivery_owner = 'shell'; },
    (contract: any) => { contract.domain_detail_views.renderer_extension_abi.runtime_dynamic_code_loading_allowed = true; },
    (contract: any) => { contract.domain_detail_views.renderer_extension_abi.descriptor_supplied_module_path_or_url_allowed = true; },
    (contract: any) => { contract.domain_detail_views.renderer_extension_abi.agent_id_branching_allowed = true; },
    (contract: any) => { contract.domain_detail_views.renderer_extension_abi.app_registered_view_kind_or_domain_schema_mirror_allowed = true; },
    (contract: any) => { contract.domain_detail_views.renderer_extension_abi.registered_renderer_removal_policy.opaque_generic_fallback_is_equivalent_replacement = true; },
    (contract: any) => { contract.domain_detail_views.renderer_extension_abi.registered_renderer_removal_policy.removal_requires = ['unknown_view_kind_fallback']; },
    (contract: any) => { contract.domain_detail_views.availability_is_transport_state_only = false; },
    (contract: any) => { contract.domain_detail_views.transport_state_may_be_interpreted_as_domain_outcome = true; },
    (contract: any) => { contract.domain_detail_views.unknown_view_kind_policy = 'global_failure'; },
  ]) {
    const gui = runtimeContract();
    mutate(gui.pages.runtime_status.runtime_cockpit_product_contract);
    assert.throws(() => validateGuiContract(gui));
  }
});

test('Runtime page state rejects optional detail absence that hides core Runtime content or fails globally', () => {
  for (const [index, mutate] of [
    (state: any) => { state.runtime_page = 'hidden'; },
    (state: any) => { state.selected_item_core_detail = 'hidden'; },
    (state: any) => { state.global_failure = 'allowed'; },
  ].entries()) {
    const matrix = readJson('contracts/app-page-state-matrix.json');
    const state = matrix.pages.find((page: any) => page.id === 'runtime')
      .runtime_view_model.domain_detail_view.capability_absent;
    mutate(state);
    assert.throws(() => validatePageState(matrix), `mutation ${index} must fail`);
  }
});

test('Agent availability stays independent and descriptor-driven', () => {
  for (const mutate of [
    (projection: any) => { projection.membership_source = 'app_hardcoded_agents'; },
    (projection: any) => { projection.app_hardcoded_agent_ids_allowed = true; },
    (projection: any) => { projection.dependency_packages_are_agent_options = true; },
    (projection: any) => { projection.all_healthy_panel_state = 'expanded'; },
    (projection: any) => { projection.bare_count_or_fraction_allowed = true; },
    (projection: any) => { projection.task_count_is_availability = true; },
  ]) {
    const projection = structuredClone(runtimeBridge().agent_availability_projection);
    mutate(projection);
    assert.throws(() => validateAgentAvailabilityProjectionContract(projection, 'mutated agents'));
  }
});

test('Runtime completion accounting cannot promote contract work into producer, Shell, or live completion', () => {
  for (const mutate of [
    (contract: any) => { contract.evidence_accounting.contract_completion_implies_framework_producer = true; },
    (contract: any) => { contract.evidence_accounting.contract_completion_implies_shell_consumer = true; },
    (contract: any) => { contract.evidence_accounting.contract_completion_implies_live_evidence = true; },
    (contract: any) => { contract.evidence_accounting.focused_tests_imply_live_readiness = true; },
  ]) {
    const gui = runtimeContract();
    mutate(gui.pages.runtime_status.runtime_cockpit_product_contract);
    assert.throws(() => validateGuiContract(gui));
  }
});

test('Runtime page-state rejects removal or weakening of the V2 contract', () => {
  const mutations = [
    (matrix: any) => { matrix.acceptance_boundary.runtime_contract_implies_live_evidence_complete = true; },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.runtime_cockpit_acceptance.required_invariants = [];
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.runtime_cockpit_acceptance.one_row_per_work_item = false;
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.runtime_cockpit_acceptance.raw_ids_default_visible = true;
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.runtime_cockpit_acceptance.horizontal_page_overflow_allowed = true;
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.runtime_cockpit_acceptance.responsive_layout_by_width['375'] = 'two_columns';
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.runtime_cockpit_acceptance.viewport_screenshots_required = false;
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.runtime_cockpit_acceptance.stage_popover_trigger_opens_drawer = true;
    },
    (matrix: any) => {
      const acceptance = matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.runtime_cockpit_acceptance;
      acceptance.required_invariants = acceptance.required_invariants.filter((value: string) => value !== 'delivered_stage_map_completed_history_only_action_envelope_next_step');
    },
    (matrix: any) => {
      const acceptance = matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.runtime_cockpit_acceptance;
      acceptance.required_invariants = acceptance.required_invariants.filter((value: string) => value !== 'ordinary_text_normal_word_boundary_technical_tokens_emergency_break_only');
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.work_item_visibility_state_matrix.mutation.payload_required_fields = ['work_item_id', 'visibility'];
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.work_item_visibility_state_matrix.mutation.readback_identity_fields = ['identity.work_item_id'];
    },
    (matrix: any) => {
      const states = matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.work_item_visibility_state_matrix.page_states;
      states.find((state: any) => state.id === 'stale_generation_conflict').when = 'generation_conflict';
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.domain_detail_view.agent_id_branching_allowed = true;
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.domain_detail_view.states = [];
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.domain_detail_view.descriptor_required_fields.push('current_focus');
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.domain_detail_view.descriptor_optional_fields = ['digest'];
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.domain_detail_view.generic_view.renderer_registry_source = 'app_agent_switch';
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.domain_detail_view.generic_view.unknown_view_kind_policy = 'global_failure';
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.domain_detail_view.generic_view.layout = 'domain_specific_graph';
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.domain_detail_view.generic_view.app_domain_payload_interpretation_allowed = true;
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.domain_detail_view.generic_view.app_validation_scope = ['domain_schema'];
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.domain_detail_view.renderer_registry_source = 'app_agent_switch';
    },
    (matrix: any) => {
      matrix.pages.find((page: any) => page.id === 'runtime').runtime_view_model.domain_detail_view.full_payload_in_fast_state_allowed = true;
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const matrix = structuredClone(readJson('contracts/app-page-state-matrix.json'));
    mutate(matrix);
    assert.throws(() => validatePageState(matrix), `mutation ${index} must fail`);
  }
});
