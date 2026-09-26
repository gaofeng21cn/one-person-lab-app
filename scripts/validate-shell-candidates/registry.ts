import path from 'node:path';
import { readActiveShellBuildProfile } from '../active-shell-build-profile.ts';
import { assertDeepEqualJson } from '../validate-active-shell/assertions.ts';
import type {
  ShellCandidateRegistry,
  ShellTransitionPolicy,
} from './types.ts';
import {
  activeAdapterPath,
  assertFile,
  assertStringArrayIncludes,
  guiContractPath,
  readJson,
  root,
  runtimeBridgePath,
} from './shared.ts';

export function validateRegistryShape(registry: ShellCandidateRegistry): void {
  if (registry.owner !== 'one-person-lab-app') {
    throw new Error(`Unexpected candidate registry owner: ${registry.owner}`);
  }
  if (registry.purpose !== 'app_shell_candidate_registry') {
    throw new Error(`Unexpected candidate registry purpose: ${registry.purpose}`);
  }
  if (registry.state !== 'active_gui_route_policy') {
    throw new Error(`Unexpected candidate registry state: ${registry.state}`);
  }
  const activeBuild = readActiveShellBuildProfile(root);
  if (registry.active_shell_unchanged !== activeBuild.id) {
    throw new Error('candidate registry must match the App-selected active Shell');
  }
  const mainline = registry.active_gui_mainline;
  if (
    mainline?.shell !== activeBuild.id ||
    mainline.shell_root !== activeBuild.root ||
    mainline.source_repo !== activeBuild.repository ||
    mainline.role !== 'stable_app_gui_mainline' ||
    mainline.product_truth_owner !== 'one-person-lab-app'
  ) {
    throw new Error('candidate registry must declare AionUI as the stable App GUI mainline');
  }
  const alternative = registry.alternative_gui_policy;
  if (
    alternative?.only_foreground_alternative !== 'opl-studio' ||
    alternative.basis !== 'OPL Studio DSH Application Host and composition workbench' ||
    alternative.active_shell_switch_policy !== 'only_contracts/app-shell-adapter.json_can_switch_default_release_shell'
  ) {
    throw new Error('candidate registry must keep OPL Studio as the only foreground alternative');
  }
  if (alternative.default_candidate_validation_scope.length !== 0) {
    throw new Error('default candidate validation scope must stay empty; default gates validate role registry only');
  }
  assertStringArrayIncludes(
    alternative.explicit_candidate_validation_scope,
    ['opl-studio'],
    'alternative_gui_policy.explicit_candidate_validation_scope',
  );
  if (alternative.explicit_candidate_validation_scope.length !== 1) {
    throw new Error('explicit candidate validation scope must contain exactly OPL Studio');
  }
  const nativeCandidate = registry.candidates.find((candidate) => candidate.id === 'opl-studio');
  const oplAgentPaletteOutcome = 'the separate OPL standard Agent composer group includes only producer-declared first-party OPL professional Agents with package_role=standard_agent, selectable readiness, and a real Codex route; generic Skills and plugins remain separate even when a descriptor defaults to standard_agent, without a package-id allowlist';
  if (
    !nativeCandidate
    || !('p1_baseline_contract' in nativeCandidate)
    || !nativeCandidate.p1_baseline_contract?.required_user_outcomes.includes(oplAgentPaletteOutcome)
  ) {
    throw new Error('foreground Native candidate must keep OPL standard Agents separate from generic Skills and plugins using producer-owned identity without a package-id allowlist');
  }
  validateInteractiveLauncherPolicy(registry);
  for (const [label, expected] of Object.entries({
    release_shell_contract: 'contracts/app-shell-adapter.json',
    shell_transition_policy_ref: 'contracts/app-release-channel.json#shell_transition_policy',
    gui_product_contract: 'contracts/app-gui-product-contract.json',
    runtime_bridge_contract: 'contracts/app-runtime-bridge.json',
    product_profile_contract: 'contracts/app-product-profile.json',
    page_state_matrix: 'contracts/app-page-state-matrix.json',
    first_run_matrix: 'contracts/app-first-run-test-matrix.json',
  })) {
    if (registry[label as keyof ShellCandidateRegistry] !== expected) {
      throw new Error(`candidate registry ${label} must be ${expected}`);
    }
    assertFile(path.join(root, expected.split('#')[0]), label);
  }
  const releaseContract = readJson<{ shell_transition_policy: ShellTransitionPolicy }>(
    path.join(root, 'contracts', 'app-release-channel.json'),
  );
  validateShellTransitionPolicy(releaseContract.shell_transition_policy);
  const policy = registry.candidate_policy;
  if (policy.candidate_root_pattern !== 'shells/<candidate>') {
    throw new Error('candidate roots must stay under shells/<candidate>');
  }
  if (policy.candidate_state !== 'foreground_alternative') {
    throw new Error(`Unexpected candidate policy state: ${policy.candidate_state}`);
  }
  if (policy.release_participation_until_adopted !== 'explicit_candidate_build_only') {
    throw new Error('candidate release participation must stay explicit_candidate_build_only until adopted');
  }
  if (policy.authority_transfer_allowed !== false) {
    throw new Error('candidate policy must not transfer App authority');
  }
  if (policy.release_scripts_must_use_active_shell_adapter !== true) {
    throw new Error('release scripts must continue using the active shell adapter');
  }
  if (policy.candidate_validation_script !== 'scripts/validate-shell-candidates.ts') {
    throw new Error('candidate registry must point at scripts/validate-shell-candidates.ts');
  }
  assertStringArrayIncludes(policy.adoption_gate, [
    'candidate is declared in contracts/app-shell-candidates.json',
    'candidate is the foreground alternative declared by alternative_gui_policy.only_foreground_alternative',
    'candidate implements contracts/app-gui-product-contract.json',
    'candidate uses one App-owned product renderer across claimed delivery surfaces without making the renderer a product truth owner',
    'candidate provides delivery-surface bridges that expose the same App-owned API shape without taking runtime authority',
    'candidate passes WebUI smoke only when it explicitly claims WebUI delivery; otherwise WebUI remains explicitly deferred and non-claiming',
    'candidate runs the pinned DeepSeek Harness Application Host and GUI source cohort with OPL-owned plugins while keeping product and runtime authorities at their declared owners',
    'candidate keeps only projects, conversations, search, and Settings in the left rail and exposes run status, files and results, and agents and capabilities as user-requested right context',
    'candidate passes state-model validation proving active project line projection consumption without taking runtime or domain authority',
    'candidate compiles a launchable .app bundle through the App wrapper when OPL_APP_SHELL_ADAPTER_CONTRACT selects its adapter contract',
    'candidate passes App-root candidate validation',
    'contracts/app-shell-adapter.json is changed only when candidate becomes active release shell',
  ], 'candidate_policy.adoption_gate');
  if (
    policy.default_validation_scope !== 'role_registry_only' ||
    policy.default_validation_contract !== 'minimal_role_registry_only'
  ) {
    throw new Error('candidate policy default validation must stay minimal role registry only');
  }
  validateCandidateRoleEntries(registry);
  validateDesignReferences(registry);
}

export function validateShellTransitionPolicy(policy: ShellTransitionPolicy): void {
  if (
    policy?.schema !== 'opl_app_shell_transition_policy.v1'
    || !['planned_not_authorized', 'authorized_implementation_in_progress'].includes(policy.state)
    || policy.authority_owner !== 'one-person-lab-app'
    || policy.initial_carrier !== 'macos_arm64'
    || policy.current_active_shell !== 'aionui'
    || policy.current_candidate_shell !== 'opl-studio'
    || policy.target_active_shell !== 'opl-studio'
    || policy.execution_requires_separate_authorization !== (policy.state === 'planned_not_authorized')
  ) {
    throw new Error('shell transition policy must remain an App-owned, non-authorized macOS plan from AionUI to OPL Studio');
  }

  const active = policy.identities?.active_app;
  const preview = policy.identities?.studio_preview;
  const target = policy.identities?.target_app;
  if (
    active?.product_name !== 'One Person Lab'
    || active.bundle_id !== 'cn.onepersonlab.opl'
    || active.install_path !== '/Applications/One Person Lab.app'
    || active.user_data_root !== '~/Library/Application Support/One Person Lab'
    || active.release_repository !== 'gaofeng21cn/one-person-lab-app'
    || target?.product_name !== active.product_name
    || target.shell !== 'opl-studio'
    || target.bundle_id !== active.bundle_id
    || target.install_path !== active.install_path
    || target.user_data_root !== active.user_data_root
    || target.release_repository !== active.release_repository
  ) {
    throw new Error('target App must preserve the existing active product identity while replacing only its shell');
  }
  if (
    preview?.product_name !== 'One Person Lab Preview'
    || preview.bundle_id !== 'cn.onepersonlab.opl.studio.preview'
    || preview.install_path !== '/Applications/One Person Lab Preview.app'
    || preview.user_data_root !== '~/Library/Application Support/opl-studio'
    || preview.release_repository !== 'gaofeng21cn/opl-studio'
    || preview.bundle_id === target.bundle_id
    || preview.release_repository === target.release_repository
  ) {
    throw new Error('Studio Preview must retain an isolated identity and repository until terminal handoff');
  }
  for (const [label, identity] of Object.entries({ active, preview, target })) {
    if (identity?.updater_metadata?.join(',') !== 'latest-mac.yml,latest-arm64-mac.yml') {
      throw new Error(`${label} shell transition identity must declare both macOS updater metadata names`);
    }
  }

  const mainline = policy.upgrade_routes?.aionui_mainline_to_target;
  const handoff = policy.upgrade_routes?.studio_preview_to_target;
  if (
    mainline?.mechanism !== 'in_place_auto_update_on_preserved_active_identity'
    || mainline.preserve_bundle_id !== true
    || mainline.preserve_install_path !== true
    || mainline.preserve_release_repository !== true
    || mainline.preserve_updater_metadata_namespace !== true
    || mainline.direct_supported_source_window_required !== true
    || mainline.intermediate_aionui_bridge_release_required_for_correctness !== false
    || mainline.first_target_launch_runs_idempotent_migration_before_normal_renderer_start !== true
  ) {
    throw new Error('AionUI route must be a direct in-place update on the preserved active identity');
  }
  if (
    handoff?.mechanism !== 'preview_updater_delivers_signed_handoff_to_exact_active_app_release'
    || handoff.native_cross_bundle_in_place_update_claimed !== false
    || handoff.terminal_preview_release_required !== true
    || handoff.handoff_target_requires_exact_version_url_sha256_signature_notarization_and_gatekeeper !== true
    || handoff.preview_update_feed_never_becomes_the_target_app_update_feed !== true
    || handoff.preview_cleanup_requires_successful_target_launch_migration_and_owner_readback !== true
  ) {
    throw new Error('Studio Preview route must use an exact signed handoff instead of impersonating the active updater identity');
  }

  const shared = policy.state_continuity?.canonical_shared_state ?? [];
  const sharedIds = shared.map(({ id }) => id).sort();
  const requiredSharedIds = [
    'codex_threads_and_turns',
    'gateway_credentials_account_and_usage',
    'framework_packages_runtime_and_receipts',
    'workspace_sources_and_domain_artifacts',
  ].sort();
  if (JSON.stringify(sharedIds) !== JSON.stringify(requiredSharedIds) || shared.some(({ transition }) => !transition.includes('no_copy'))) {
    throw new Error('canonical shared state must be reused from its owner without shell database copying');
  }
  const migration = policy.state_continuity?.shell_local_migration;
  const requiredAllowlist = [
    'locale_theme_and_accessibility_preferences',
    'non_secret_model_reasoning_and_permission_preferences',
    'workspace_selection_labels_and_order',
    'canonical_thread_keyed_ui_metadata',
    'unsent_user_drafts',
    'notification_and_log_location_preferences',
  ];
  const requiredExclusions = [
    'passwords_api_keys_tokens_cookies_and_keychain_material',
    'aioncore_or_aionui_backend_databases',
    'codex_thread_or_turn_bodies',
    'framework_package_runtime_or_receipt_state',
    'electron_cache_session_gpu_crash_and_updater_identity_files',
    'owner_workspace_or_artifact_bodies',
  ];
  assertStringArrayIncludes(migration?.allowlisted_classes ?? [], requiredAllowlist, 'shell local migration allowlist');
  assertStringArrayIncludes(migration?.excluded_classes ?? [], requiredExclusions, 'shell local migration exclusions');
  if (
    migration?.direct_database_copy_allowed !== false
    || migration.direct_secret_copy_allowed !== false
    || migration.versioned_field_translators_required !== true
    || migration.idempotent !== true
    || migration.exclusive_migration_lock_required !== true
    || migration.source_backup_and_hash_inventory_required !== true
    || migration.partial_import_must_resume_or_rollback !== true
    || migration.source_bytes_retained_until_owner_acceptance !== true
  ) {
    throw new Error('shell-local migration must stay allowlisted, versioned, idempotent, recoverable, and secret-free');
  }

  const requiredSequence = [
    'studio_preview_functional_baseline_and_internal_acceptance',
    'studio_preview_signed_notarized_public_update_qualification',
    'dual_source_migration_implementation_and_supported_source_window_freeze',
    'aionui_in_place_and_preview_handoff_clean_vm_qualification',
    'explicit_active_shell_and_release_authority_cutover',
    'active_app_target_release_and_terminal_preview_handoff_release',
    'post_update_owner_readback_and_bounded_legacy_retention',
  ];
  if (JSON.stringify(policy.cutover_sequence) !== JSON.stringify(requiredSequence)) {
    throw new Error('shell transition cutover sequence must preserve Preview testing before dual-route migration and explicit cutover');
  }
  if (
    policy.rollback_policy?.automatic_downgrade_assumed !== false
    || policy.rollback_policy?.rollback_path_must_be_qualified_before_cutover !== true
    || policy.rollback_policy?.preview_not_removed_before_target_owner_readback !== true
  ) {
    throw new Error('shell transition rollback must be qualified and must not assume automatic downgrade');
  }
}

function validateCandidateRoleEntries(registry: ShellCandidateRegistry): void {
  const entries = registry.candidates;
  const ids = entries.map((entry) => entry.id).sort();
  if (JSON.stringify(ids) !== JSON.stringify(['opl-studio'])) {
    throw new Error('candidate role registry must contain exactly OPL Studio');
  }

  const native = entries.find((entry) => entry.id === 'opl-studio');
  for (const field of ['archived_reason', 'default_update_policy', 'role_tombstone', 'replay']) {
    if (native && field in native) {
      throw new Error(`OPL Studio must not declare retired candidate field ${field}`);
    }
  }
  if (
    !native ||
    native.state !== 'active_product_development' ||
    native.foreground_alternative_role !== 'only_foreground_alternative' ||
    native.adapter_contract !== 'contracts/shell-adapters/opl-studio.json' ||
    native.release_participation !== 'pre_adoption_explicit_build_only'
  ) {
    throw new Error('OPL Studio must remain the explicit foreground candidate');
  }
}

function validateInteractiveLauncherPolicy(registry: ShellCandidateRegistry): void {
  const launcher = registry.interactive_launcher_policy;
  for (const [field, expected] of Object.entries({
    state: 'active_local_launcher_policy',
    topology: 'single_control_plane_multiple_independent_gui_clients',
    selection_scope: 'per_local_launch_only',
    default_target_source: 'contracts/app-shell-adapter.json#active_shell',
    target_interface: 'app_root_gui_launcher_with_shell_and_mode',
    target_command: 'npm run gui -- --shell <shell_id> [--mode dev|packaged]',
    release_adoption_contract: 'contracts/app-shell-adapter.json',
    concurrent_mainline_policy: 'side_by_side_bundle_launch_allowed_candidate_actions_dry_run_by_default',
    candidate_default_mutation_policy: 'dry_run_only_unless_explicit_allow_actions',
    missing_target_policy: 'fail_closed_with_actionable_blocker',
    implementation_status: 'implemented',
  })) {
    if (launcher?.[field as keyof typeof launcher] !== expected) {
      throw new Error(`interactive launcher policy ${field} must be ${expected}`);
    }
  }
  const activeShell = registry.active_gui_mainline?.shell;
  const foregroundShell = registry.alternative_gui_policy?.only_foreground_alternative;
  const expectedShells = ['aionui', 'opl-studio'];
  const selectableShells = launcher?.selectable_shells ?? [];
  if (
    !activeShell ||
    !foregroundShell ||
    selectableShells.length !== expectedShells.length ||
    !selectableShells.includes(activeShell) ||
    !selectableShells.includes(foregroundShell)
  ) {
    throw new Error('interactive launcher selectable_shells must be exactly the active mainline and foreground alternative');
  }
  for (const field of [
    'selection_mutates_release_adoption',
    'candidate_launch_implies_adoption',
    'selection_changes_updater_channel',
    'simultaneous_same_workspace_write_safety_claimed',
  ] as const) {
    if (launcher?.[field] !== false) {
      throw new Error(`interactive launcher policy ${field} must remain false`);
    }
  }
  if (launcher?.side_by_side_bundle_identity_required !== true) {
    throw new Error('interactive launcher policy must require separate side-by-side bundle identities');
  }
  const profiles = launcher?.launch_profiles ?? {};
  const profileIds = Object.keys(profiles).sort();
  if (profileIds.join(',') !== ['aionui', 'opl-studio'].sort().join(',')) {
    throw new Error('interactive launcher launch_profiles must be exactly aionui and opl-studio');
  }
  const aionui = profiles.aionui;
  if (
    aionui?.adapter_contract !== 'contracts/app-shell-adapter.json' ||
    aionui.default_mode !== 'packaged' ||
    aionui.bundle_id !== 'cn.onepersonlab.opl' ||
    aionui.packaged_app_path !== '/Applications/One Person Lab.app' ||
    aionui.supported_modes?.join(',') !== 'packaged,dev' ||
    aionui.dev_command?.join(' ') !== 'bun run start'
  ) {
    throw new Error('interactive launcher AionUI profile must preserve the installed mainline and existing dev command');
  }
  const successor = profiles['opl-studio'];
  if (
    successor?.adapter_contract !== 'contracts/shell-adapters/opl-studio.json' ||
    successor.default_mode !== 'packaged' ||
    successor.bundle_id !== 'cn.onepersonlab.opl.studio.preview' ||
    successor.packaged_app_path !== '/Applications/One Person Lab Preview.app' ||
    successor.bundle_relative_path !== 'out/mac-arm64/One Person Lab Preview.app' ||
    successor.supported_modes?.join(',') !== 'packaged' ||
    successor.package_command?.join(' ') !== 'npm run package' ||
    successor.launcher_env_abi?.join(',') !==
      'OPL_CODEX_BIN,OPL_APP_OPL_BIN,OPL_NATIVE_WORKBENCH_CODEX_CWD,OPL_NATIVE_WORKBENCH_READ_ONLY'
  ) {
    throw new Error('interactive launcher successor profile must preserve the formal local install, host ABI, isolated bundle, and package command');
  }
  if (aionui.bundle_id === successor.bundle_id) {
    throw new Error('interactive launcher mainline and candidate bundle identities must differ');
  }
}

function validateDesignReferences(registry: ShellCandidateRegistry): void {
  const policy = registry.design_reference_policy;
  if (!policy) {
    throw new Error('candidate registry must declare design_reference_policy');
  }
  if (policy.source_code_use !== 'reference_only_no_vendoring_or_copying_without_license_decision') {
    throw new Error('design references must stay reference-only until a license decision');
  }
  if (policy.runtime_authority_transfer_allowed !== false) {
    throw new Error('design references must not transfer runtime authority');
  }
  if (policy.license_gate_required_before_code_reuse !== true) {
    throw new Error('design references must require a license gate before code reuse');
  }
  if (policy.candidate_promotion_route !== 'external_checkout_under_shells/<candidate>_with_adapter_contract_and_App_owned_gates') {
    throw new Error('design reference candidate promotion must use the normal external-checkout adapter route');
  }

  const references = registry.design_references ?? [];
  const pilotdeck = references.find((reference) => reference.id === 'pilotdeck');
  if (!pilotdeck) {
    throw new Error('candidate registry must record PilotDeck as a design reference');
  }
  if (pilotdeck.source_repo !== 'https://github.com/OpenBMB/PilotDeck') {
    throw new Error('PilotDeck design reference must point at OpenBMB/PilotDeck');
  }
  if (pilotdeck.evaluated_ref !== '33394d1069c3528052c3f12eb1d905060b34cc2f') {
    throw new Error('PilotDeck design reference must record the evaluated ref');
  }
  if (pilotdeck.license !== 'AGPL-3.0') {
    throw new Error('PilotDeck design reference must record AGPL-3.0 license');
  }
  if (pilotdeck.source_usage !== 'design_reference_only') {
    throw new Error('PilotDeck source usage must stay design_reference_only');
  }
  assertStringArrayIncludes(pilotdeck.reference_value, [
    'workspace/project sidebar pattern for lightweight rail organization',
    'chat-first main pane with persistent composer',
    'information grouping for Agent, Files, Skills, Routing, Memory, and Always-On',
    'file, memory, routing, and always-on context surfaces',
  ], 'PilotDeck reference_value');
  assertStringArrayIncludes(pilotdeck.opl_mapping, [
    'OPL lightweight workspace rail should group work by workspace and conversation without exposing backend selection',
    'OPL main surface should stay chat-first with MAS/MAG/RCA purpose tags in the composer',
    'OPL right-side collapsible contextual tabs should map to Files, Runtime, Capabilities, Memory refs, Automations, and Settings using App-owned state/action surfaces',
    'OPL runtime and memory panels must consume OPL Framework/domain projections rather than PilotDeck state stores',
  ], 'PilotDeck opl_mapping');
  assertStringArrayIncludes(pilotdeck.forbidden_reuse, [
    'do not copy or vendor PilotDeck AGPL source into the Apache-2.0 App repo',
    'do not adopt PilotDeck gateway, agent runtime, memory, router, or always-on stores as OPL authority',
    'do not expose PilotDeck provider/model/backend selection as ordinary OPL App controls',
    'do not treat PilotDeck screenshots, demo data, or WorkSpace model as App product truth',
  ], 'PilotDeck forbidden_reuse');

  const kdense = references.find((reference) => reference.id === 'kdense-byok');
  if (!kdense) {
    throw new Error('candidate registry must record K-Dense BYOK as an experience reference for opl-studio');
  }
  if (kdense.source_repo !== 'https://github.com/K-Dense-AI/k-dense-byok') {
    throw new Error('K-Dense design reference must point at K-Dense-AI/k-dense-byok');
  }
  if (kdense.source_usage !== 'experience_reference_only') {
    throw new Error('K-Dense source usage must stay experience_reference_only');
  }
  assertStringArrayIncludes(kdense.reference_value, [
    'project sandbox organization',
    'result and artifact delivery panel',
    'structured confirmation forms',
    'rich file preview affordances',
  ], 'K-Dense reference_value');
  assertStringArrayIncludes(kdense.forbidden_reuse, [
    'do not adopt K-Dense runtime, agent authority, provider routing, or remote compute as OPL authority',
    'do not copy source until a separate license and code-reuse decision is recorded',
  ], 'K-Dense forbidden_reuse');

  const openClaudeScience = references.find((reference) => reference.id === 'openclaudescience');
  if (!openClaudeScience) {
    throw new Error('candidate registry must record OpenClaudeScience as an experience reference for scientific workflow display');
  }
  if (openClaudeScience.source_repo !== 'https://github.com/qzzqzzb/OpenClaudeScience') {
    throw new Error('OpenClaudeScience design reference must point at qzzqzzb/OpenClaudeScience');
  }
  if (openClaudeScience.source_usage !== 'experience_reference_only') {
    throw new Error('OpenClaudeScience source usage must stay experience_reference_only');
  }
  assertStringArrayIncludes(openClaudeScience.forbidden_reuse, [
    'do not adopt OpenClaudeScience runtime, domain verdicts, or research authority as OPL authority',
    'do not copy source until a separate license and code-reuse decision is recorded',
  ], 'OpenClaudeScience forbidden_reuse');

  const openScience = references.find((reference) => reference.id === 'open-science');
  if (!openScience) {
    throw new Error('candidate registry must record ai4s-research/open-science as a design reference');
  }
  if (openScience.source_repo !== 'https://github.com/ai4s-research/open-science') {
    throw new Error('Open Science design reference must point at ai4s-research/open-science');
  }
  if (openScience.evaluated_ref !== '2200ad2ec4e2ac7c7ff59c5dcdfaeb0b9a5fda66') {
    throw new Error('Open Science design reference must record the evaluated ref');
  }
  if (openScience.license !== 'MIT') {
    throw new Error('Open Science design reference must record MIT license');
  }
  if (openScience.source_usage !== 'design_reference_only') {
    throw new Error('Open Science source usage must stay design_reference_only');
  }
  assertStringArrayIncludes(openScience.reference_value, [
    'artifact, provenance, and review surfaces kept close to the conversation',
    'plain-language data-flow and safety presentation',
    'workflow starters that turn broad research intents into concrete starts',
    'scientific report, figure, notebook, and table preview affordances',
  ], 'Open Science reference_value');
  assertStringArrayIncludes(openScience.opl_mapping, [
    "OPL Studio should keep the DeepSeek Harness chat-first source-reuse basis, not Open Science's three-column workbench default",
    'OPL right context stays collapsed by default and opens only when the user asks to inspect files, artifacts, review refs, actions, runtime refs, memory refs, automations, or settings',
    'MAS is autonomous research execution, not a co-scientist pair-work surface; the UI must not assume users monitor results beside chat while work runs',
    'Open Science artifact/provenance/review ideas map to secondary refs, Runtime/delivery pages, and explicit inspector tabs without taking artifact body, domain verdict, or runtime authority',
  ], 'Open Science opl_mapping');
  assertStringArrayIncludes(openScience.forbidden_reuse, [
    "do not adopt Open Science's OpenCode sidecar, runtime manager, provider model, or auth flow as OPL authority",
    'do not copy or vendor Open Science source without a separate license and code-reuse decision',
    'do not make a three-column scientific workbench, artifact inspector, or activity cockpit the ordinary default Home layout',
    'do not convert MAS into a co-scientist monitor UI; MAS progress and results are inspect-on-demand refs',
  ], 'Open Science forbidden_reuse');

  const deepseekHarness = references.find((reference) => reference.id === 'deepseek-harness');
  if (!deepseekHarness) {
    throw new Error('candidate registry must record DeepSeek Harness as the bounded Native composition reuse reference');
  }
  if (
    deepseekHarness.source_repo !== 'https://github.com/deepseek-ai/deepseek-harness' ||
    deepseekHarness.evaluated_ref !== '477b4f420553e8a52c2fbccc464d7561b239c443' ||
    deepseekHarness.evaluated_at !== '2026-08-22' ||
    deepseekHarness.evaluated_version !== '0.1.7-rc.2 Application Host and GUI source cohort' ||
    deepseekHarness.license !== 'MIT' ||
    deepseekHarness.source_usage !== 'approved_application_host_runtime_and_gui_source_reuse'
  ) {
    throw new Error('DeepSeek Harness reference must stay pinned to the evaluated Application Host source, version, date, license, and reuse status');
  }
  assertDeepEqualJson(deepseekHarness.adopted_packages, {
    '@deepseek-ai/cordis': '4.0.2',
    '@deepseek-ai/cordis-plugin-group': '1.0.2',
    '@deepseek-ai/cordis-plugin-include': '1.0.7',
    '@deepseek-ai/cordis-plugin-loader': '1.0.3',
    '@deepseek-ai/dsh-client-store': '0.1.7-rc.2',
    '@deepseek-ai/dsh-agent-preset-registry': '0.1.7-rc.2',
    '@deepseek-ai/dsh-util-code-language': '0.1.7-rc.2',
    '@deepseek-ai/dsh-util-workspace-path': '0.1.7-rc.2',
    '@deepseek-ai/dsh-app-boot': '0.1.7-rc.2',
    '@deepseek-ai/dsh-brand': '0.1.7-rc.2',
    '@deepseek-ai/dsh-client-modules': '0.1.7-rc.2',
    '@deepseek-ai/dsh-client-ui-dockkit': '0.1.7-rc.2',
    '@deepseek-ai/dsh-client-ui-primitives': '0.1.7-rc.2',
    '@deepseek-ai/dsh-client-ui-slots': '0.1.7-rc.2',
    '@deepseek-ai/dsh-client-web': '0.1.7-rc.2',
    '@deepseek-ai/dsh-home-paths': '0.1.7-rc.2',
    '@deepseek-ai/dsh-host-frontend-static': '0.1.7-rc.2',
    '@deepseek-ai/dsh-host-plugin-inventory': '0.1.7-rc.2',
    '@deepseek-ai/dsh-host-webserver': '0.1.7-rc.2',
    '@deepseek-ai/dsh-invariants': '0.1.7-rc.2',
    '@deepseek-ai/dsh-launch-environment': '0.1.7-rc.2',
    '@deepseek-ai/dsh-llm': '0.1.7-rc.2',
    '@deepseek-ai/dsh-scope': '0.1.7-rc.2',
    '@deepseek-ai/dsh-sandbox': '0.1.7-rc.2',
    '@deepseek-ai/dsh-sandbox-policy': '0.1.7-rc.2',
    '@deepseek-ai/dsh-session': '0.1.7-rc.2',
    '@deepseek-ai/dsh-system-prompt': '0.1.7-rc.2',
    '@deepseek-ai/dsh-timeout': '0.1.7-rc.2',
    '@deepseek-ai/dsh-tools': '0.1.7-rc.2',
    '@deepseek-ai/dsh-typert-protocol': '0.1.7-rc.2',
    'use-sync-external-store': '1.2.0',
  }, 'DeepSeek Harness adopted_packages');
  assertDeepEqualJson(deepseekHarness.adopted_source, {
    root: 'src/vendor/deepseek-harness',
    ref: '477b4f420553e8a52c2fbccc464d7561b239c443',
    path_policy: 'preserve_upstream_package_relative_paths',
    byte_policy: 'byte_identical_to_pinned_ref',
    package_roots: [
      'packages/client/ui-layout/src',
      'packages/client/ui-sidebar/src',
      'packages/client/ui-conversation/src',
      'packages/client/ui-input-trigger/src',
      'packages/client/ui-model-selection/src',
      'packages/client/ui-agent-preset/src',
      'packages/client/ui-workspace/src',
      'packages/client/ui-settings-general/src',
      'packages/client/ui-theme/src',
      'packages/client/ui-primitives/src',
      'packages/client/ui-renderer/src',
      'packages/client/ui-sidebar-files/src',
      'packages/client/ui-sidebar-documentpreview/src',
      'packages/client/ui-sidebar-right/src',
      'packages/client/ui-deliverables/src',
      'packages/client/ui-open-in-app/src',
      'packages/client/ui-dockkit/src',
      'packages/client/resources/src',
      'packages/util/workspace-path/src',
    ],
    files: [
      'packages/client/ui-layout/src/client/AppFrame.tsx',
      'packages/client/ui-layout/src/client/AppFrame.module.css',
      'packages/client/ui-layout/src/client/columns.ts',
      'packages/client/ui-sidebar/src/client/SidebarRoot.tsx',
      'packages/client/ui-sidebar/src/client/SidebarRoot.module.css',
      'packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx',
      'packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css',
      'packages/client/ui-conversation/src/client/skeleton/InputBar.tsx',
      'packages/client/ui-conversation/src/client/skeleton/InputBar.module.css',
      'packages/client/ui-conversation/src/client/skeleton/EmptyHero.tsx',
      'packages/client/ui-conversation/src/client/skeleton/HeroShell.module.css',
      'packages/client/ui-input-trigger/src/client/MenuView.tsx',
      'packages/client/ui-model-selection/src/client/ModelSelect.tsx',
      'packages/client/ui-agent-preset/src/client/AgentPresetSeat.tsx',
      'packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.tsx',
      'packages/client/ui-settings-general/src/client/SettingsRoot.tsx',
      'packages/client/ui-settings-general/src/client/SettingsRoot.module.css',
      'packages/client/ui-theme/src/styles/design-platform.css',
      'packages/client/ui-theme/src/styles/base.css',
      'packages/client/ui-theme/src/styles/scrollbar.css',
      'packages/client/ui-theme/src/styles/gradient-shadow-text.css',
      'packages/client/ui-primitives/src/Button.tsx',
      'packages/client/ui-primitives/src/Button.module.css',
      'packages/client/ui-primitives/src/Pill.tsx',
      'packages/client/ui-primitives/src/Pill.module.css',
      'packages/client/ui-primitives/src/Input.tsx',
      'packages/client/ui-primitives/src/Input.module.css',
      'packages/client/ui-primitives/src/StateDot.tsx',
      'packages/client/ui-primitives/src/StateDot.module.css',
      'packages/client/ui-primitives/src/Tooltip.tsx',
      'packages/client/ui-primitives/src/Tooltip.module.css',
      'packages/client/ui-primitives/src/markdown/MarkdownText.tsx',
      'packages/client/ui-primitives/src/markdown/MarkdownText.module.css',
      'packages/client/ui-renderer/src/client/scoped-slots.tsx',
    ],
  }, 'DeepSeek Harness adopted_source');
  assertStringArrayIncludes(deepseekHarness.adopted_surface, [
    'SlotCore registration lifecycle',
    'createSlotRenderer React composition and error isolation',
    'AppFrame three-column composition and responsive column solver',
    'SidebarRoot workspace and session rail composition',
    'ConversationRoot InputBar EmptyHero and persistent composer composition',
    'SettingsRoot navigation and modal composition',
    'ui-theme design platform base scrollbar and gradient shadow styles',
    'complete ui-primitives source tree with OPL brand overrides outside the vendor root',
    'pinned ui-renderer scoped-slots createSlotRenderer implementation inside the Studio Client Cordis',
    'DSH app boot profile loader overlay and Cordis plugin lifecycle',
    'DSH native tools registry host webserver and plugin inventory',
    'authenticated stateful loopback MCP from DSH ctx.tools to the persistent Codex App Server',
    'rc2 brand attachment and workspace hooks satisfied by OPL-owned plugins without product authority transfer',
  ], 'DeepSeek Harness adopted_surface');
  assertDeepEqualJson(deepseekHarness.upstream_intake, {
    mode: 'pinned_application_host_packages_and_vendor_snapshot_with_opl_plugins',
    vendor_source_policy: 'byte_identical_to_recorded_upstream_path_and_ref',
    opl_delta_policy: 'profile_branding_bridge_codex_framework_state_and_custom_functions_live_outside_vendor_tree_as_plugins_and_adapters',
    update_policy: 'update_one_pinned_ref_and_package_cohort_regenerate_vendor_manifest_replay_profile_patches_then_run_host_mcp_renderer_candidate_and_notice_gates',
    floating_ref_allowed: false,
    automatic_promotion_allowed: false,
    stop_condition: 'large_private_vendor_delta_or_required_dsh_product_runtime_authority',
  }, 'DeepSeek Harness upstream_intake');
  assertStringArrayIncludes(deepseekHarness.reference_value, [
    'quiet chat-first Web UI with workspace/session rail and persistent composer',
    'typed UI slot registry with single, list, keyed, and chain composition kinds',
    'client plugins discovered from package manifests and unloaded on the same lifecycle axis as registration',
    'profile and bundle composition with explicit ordered layers and user patches',
    'capability seams separating service definitions, providers, and consumers',
    'dynamic plugin inventory and configuration rendered from installed deployment state',
  ], 'DeepSeek Harness reference_value');
  assertStringArrayIncludes(deepseekHarness.opl_mapping, [
    'OPL Studio runs the complete pinned DeepSeek Harness Application Host and selected GUI source with OPL-owned plugins; AionUI may consume only the separately pinned bounded visual source cohort through OplVisualProvider and OplIcon',
    'OPL App keeps product truth slot policy active-shell adoption and release authority while Framework projections and App actions remain the only OPL runtime state and mutation ABI',
    'Agent Package descriptors may contribute typed view and slot declarations without owning runtime, domain truth, artifacts, credentials, or release state',
    'slot contributions must be capability-gated, scope-bound, reversible, and absent without leaving placeholder navigation',
    'OPL should reuse the smallest independently testable GUI packages and vendor selected source only when the published package boundary is broken or insufficient while preserving the exact ref and notices',
    'Framework remains the authoritative OPL runtime Package graph and App projection Host; Studio separately owns its DSH Application Host lifecycle without receiving Framework runtime or Package authority',
  ], 'DeepSeek Harness opl_mapping');
  assertStringArrayIncludes(deepseekHarness.forbidden_reuse, [
    'do not adopt DeepSeek Harness session log, agent loop, provider routing, credential store, Package currentness, product, domain, or release authority',
    'do not create a second OPL Package registry, runtime, settings store, action bus, or currentness plane',
    'do not add DeepSeek Harness as a second foreground shell beside opl-studio',
    'do not import DeepSeek Harness runtime, session, router, provider, credential, action, connection, complete renderer, product routes, or Framework ABI into the AionUI mainline; only the bounded visual source cohort may be consumed through OplVisualProvider and OplIcon',
    'do not depend on floating npm latest tags while upstream is a developer preview with compatibility-breaking changes',
    'do not assume the repository root license covers every selected package or third-party payload without per-package notices review',
    'do not expose generic provider, backend, or arbitrary-code plugin controls as ordinary OPL App product surfaces',
    'do not load dsh-base or create a second DSH session LLM provider agent loop or credential authority',
  ], 'DeepSeek Harness forbidden_reuse');
}

export function validateActiveShellUnaffected(): void {
  const activeAdapter = readJson<{
    active_shell: string;
    shell_root: string;
    shell_source: { owner_repo: string };
    release_role: string;
  }>(activeAdapterPath);
  const runtimeBridge = readJson<{
    active_adapter: string;
    default_adapter_repo: string;
    default_adapter_path: string;
  }>(runtimeBridgePath);
  const guiContract = readJson<{ active_shell: string; implementation_carrier: string }>(guiContractPath);

  const activeBuild = readActiveShellBuildProfile(root);
  if (activeAdapter.active_shell !== activeBuild.id || activeAdapter.shell_root !== activeBuild.root) {
    throw new Error('active shell adapter must remain aionui at shells/aionui');
  }
  if (activeAdapter.shell_source.owner_repo !== activeBuild.repository) {
    throw new Error('active release shell source must remain gaofeng21cn/opl-aion-shell');
  }
  if (activeAdapter.release_role !== 'stable_app_shell') {
    throw new Error('active shell release role must remain stable_app_shell');
  }
  if (
    runtimeBridge.active_adapter !== activeAdapter.active_shell ||
    runtimeBridge.default_adapter_repo !== activeAdapter.shell_source.owner_repo ||
    runtimeBridge.default_adapter_path !== activeAdapter.shell_root
  ) {
    throw new Error('runtime bridge default adapter must continue matching the active shell adapter');
  }
  if (guiContract.active_shell !== activeAdapter.active_shell || guiContract.implementation_carrier !== activeBuild.repository.split('/')[1]) {
    throw new Error('GUI product contract must still point at the active AionUI implementation carrier');
  }
}
