import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { appRoot } from "./app-release-boundary-cases/helpers.ts";

function readJson(relativePath: string): any {
  return JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), "utf8"));
}

const release = readJson("contracts/app-release-channel.json");
const control = release.release_bundle_control_plane;
const rejected = readJson(
  "docs/delivery/release/incidents/2026-07-20-v26.7.20-full-catalog-mismatch.json",
);

test("Framework owns the live immutable Release Bundle and App remains a product adapter", () => {
  assert.equal(control.schema, "opl_app_release_bundle_control_plane.v1");
  assert.equal(control.contract_status, "active");
  assert.equal(
    control.implementation_status,
    "framework_bundle_authority_active_event_projection_available",
  );
  assert.deepEqual(control.framework_authority, {
    owner: "gaofeng21cn/one-person-lab",
    bundle_schema: "opl_release_bundle.v1",
    bundle_schema_owner: "OPL Framework",
    app_may_redefine_framework_bundle_closed_shape: false,
    store_owner: "OPL Framework",
    canonical_digest_owner: "OPL Framework",
    cli: "opl release",
    commands: [
      "freeze",
      "operation admit",
      "build",
      "checkpoint export",
      "checkpoint import",
      "verify",
      "publish",
      "reconcile",
      "status",
      "events",
      "consumer envelope",
    ],
    command_forms: [
      "opl release freeze --request <request.json> [--source-root <directory>] [--store <directory>]",
      "opl release operation admit --bundle <sha256:digest> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]",
      "opl release build --bundle <sha256:digest> --executor-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]",
      "opl release checkpoint export --bundle <sha256:digest> --output <directory> [--store <directory>]",
      "opl release checkpoint import --checkpoint <checkpoint.json> [--store <directory>]",
      "opl release verify --bundle <sha256:digest> --qualification-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--track standard|full] [--store <directory>]",
      "opl release publish --bundle <sha256:digest> --executor-receipt <remote-inspect.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]",
      "opl release reconcile --bundle <sha256:digest> --executor-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]",
      "opl release status --bundle <sha256:digest> [--store <directory>]",
      "opl release events --bundle <sha256:digest> [--after-event <sha256:event>] [--store <directory>]",
      "opl release consumer envelope --bundle <sha256:digest> --track <standard|full> [--source-checkpoint-run-id <run-id>] [--store <directory>]",
    ],
    receipt_schemas: [
      "opl_release_bundle_executor_receipt.v1",
      "opl_release_bundle_operation_receipt.v1",
      "opl_release_bundle_qualification_receipt.v1",
    ],
    checkpoint_schema: "opl_release_bundle_checkpoint.v1",
    operation_control_schema: "opl_release_bundle_operation_control.v1",
    operation_event_schema: "opl_release_bundle_operation_event.v1",
    consumer_envelope_schema: "opl_release_bundle_consumer_envelope.v1",
    unknown_outcome_schema: "opl_release_bundle_unknown_outcome.v1",
    live_mutation_authority: "framework_release_bundle_executor",
    checkpoint_and_receipt_state_authority_exclusive: true,
    app_may_define_checkpoint_or_receipt_schema: false,
    app_may_derive_or_project_release_stage_state: false,
    rule: control.framework_authority.rule,
    portable_checkpoint_authority_first_landed_sha: "f785cda96",
    consumed_abi_sha: "bee837d46a3695710c93c3acc69c10eb1d900167",
  });
  assert.deepEqual(control.app_authority.owns, [
    "product_release_adapter",
    "public_asset_policy",
    "prepared_ai_release_notes_policy",
    "installed_app_acceptance",
    "standard_updater_readback",
    "hosted_standard_publication_floor",
    "homebrew_cask_publication_and_readback",
    "post_publication_optional_certification_policy",
  ]);
  assert.ok(control.app_authority.does_not_own.includes("generic_release_bundle_schema"));
  assert.ok(control.app_authority.does_not_own.includes("generic_publisher_ledger"));
});

test("release progress is event-driven and conversations never become durable controllers", () => {
  const delivery = control.event_delivery;
  assert.equal(delivery.framework_event_schema, "opl_release_bundle_operation_event.v1");
  assert.equal(
    delivery.framework_consumer_envelope_schema,
    "opl_release_bundle_consumer_envelope.v1",
  );
  assert.equal(delivery.event_idempotency_key_equals_event_id, true);
  assert.equal(delivery.consumer_ack_is_read_only, true);
  assert.equal(delivery.duplicate_event_may_trigger_second_operation, false);
  assert.equal(delivery.stale_event_may_replace_newer_bundle_or_operation_state, false);
  assert.equal(delivery.long_wait_mode, "event_driven_wakeup_with_status_readback");
  assert.equal(delivery.standard_and_full_operation_identity_must_be_distinct, true);
  assert.equal(delivery.full_envelope_requires_source_checkpoint_run_id, true);
  assert.equal(delivery.consumer_trigger_only, true);
  assert.equal(delivery.consumer_may_dispatch, false);
  assert.ok(delivery.conversation_or_session_forbidden_roles.includes("durable_operation_controller"));
  assert.equal(delivery.active_task_invariant.real_owner_required, true);
  assert.equal(delivery.active_task_invariant.executable_next_action_required, true);
  assert.equal(delivery.active_task_invariant.wait_without_new_decision_is_not_active_work, true);
  assert.equal(delivery.terminal_task_policy.close_thread_after_owned_operation_terminal, true);
  assert.equal(delivery.terminal_task_policy.downstream_consumers_start_from_framework_envelope, true);
  assert.equal(delivery.terminal_task_policy.reuse_terminal_thread_as_permanent_controller, false);
  assert.equal(delivery.recovery_entry, "opl release status then exact opl release reconcile");
});

test("new App Standard identity records source refs as provenance and admits typed Package compatibility", () => {
  assert.deepEqual(control.identity.recorded_build_provenance_refs, ["app_sha", "shell_sha", "framework_sha"]);
  assert.equal(
    control.identity.build_provenance_role,
    "reproduce_the_selected_app_artifact_only_never_install_or_runtime_compatibility",
  );
  assert.deepEqual(control.identity.new_standard, {
    identity_mode: "app_standard_artifact_build_provenance",
    source_ref_equality_may_gate_external_component_install_or_runtime: false,
    package_compatibility: {
      abi: "opl_packages.v1",
      version_range: ">=0.1.0 <1.0.0",
    },
    forbidden_authority_fields: [
      "framework_release_set",
      "packages",
      "release_set_generation",
      "release_set_digest",
      "first_party_packages",
      "opl_flow",
    ],
  });
  assert.match(
    control.identity.prebuild_rule,
    /records exact App, Shell, and Framework source refs only as reproducible build provenance/,
  );
  assert.match(
    control.identity.prebuild_rule,
    /never gate installation or runtime composition with external Base or Packages/,
  );
  assert.match(
    control.identity.prebuild_rule,
    /Compatibility is admitted only by capability, minimum version, or SemVer range/,
  );
  assert.ok(control.identity.canonical_digest_covers.includes("typed_package_compatibility"));
  assert.equal(control.identity.canonical_digest_covers.includes("package_binding"), false);
});

test("legacy Package-bound Bundles remain read-compatible but cannot be generated as new Standard", () => {
  const legacy = control.identity.legacy_bundle_read_compatibility;
  assert.equal(legacy.identity_mode, "framework_release_set_and_exact_packages");
  assert.equal(legacy.new_standard_generation_allowed, false);
  assert.equal(legacy.checkpoint_import_and_qualification_readback_allowed, true);
  assert.deepEqual(legacy.required_package_ids, [
    "mas",
    "mag",
    "rca",
    "oma",
    "obf",
    "mas-scholar-skills",
    "opl-flow",
  ]);
  assert.deepEqual(
    legacy.required_per_package_fields,
    ["package_id", "package_version", "owner_source_commit", "payload_manifest_sha256"],
  );
});

test("local and GitHub executors consume one exact build-once Bundle", () => {
  assert.equal(control.execution.model, "build_once_verify_and_promote_many");
  assert.deepEqual(control.execution.executors, ["local", "github_actions"]);
  assert.equal(control.execution.executors_are_transport_only, true);
  assert.equal(control.execution.same_exact_bundle_required, true);
  assert.equal(control.execution.executor_switch_rebuild_allowed, false);
  assert.equal(control.execution.canonical_main_lock_during_build_verify_or_publish, false);
  assert.deepEqual(control.checkpoint_transport.stages, [
    "frozen",
    "standard_built",
    "standard_qualified",
    "full_built",
    "full_qualified",
  ]);
  assert.equal(control.checkpoint_transport.import_never_rebuilds, true);
  assert.equal(
    control.checkpoint_transport.completed_stage_behavior,
    "skip_with_rebuild_performed_false",
  );
  assert.deepEqual(control.checkpoint_transport.source_build_provenance_fields, [
    "source_build_executor",
    "source_build_run_id",
  ]);
  assert.deepEqual(control.checkpoint_transport.transport_provenance_fields, [
    "checkpoint_transport_executor",
    "transport_run_id",
  ]);
  assert.equal(control.checkpoint_transport.operation_controls_preserved_exactly, true);
  assert.equal(control.checkpoint_transport.unknown_build_or_publish_outcome_export_allowed, true);
  assert.deepEqual(control.checkpoint_transport.active_unknown_markers.allowed_commands, [
    "status",
    "exact_reconcile",
  ]);
  assert.equal(
    control.checkpoint_transport.active_unknown_markers.resolved_marker_reimport_behavior,
    "must_not_resurrect",
  );
  assert.equal(control.prepared_notes.required_before_expensive_build, true);
  assert.equal(control.prepared_notes.publish_may_generate_or_replace, false);
  assert.equal(control.prepared_notes.template_fallback_may_publish, false);
});

test("qualified Stable defaults Latest while daily-default Nightly keeps development validation identity-distinct", () => {
  assert.equal(
    control.publication.stable.primary_release_manual_dispatch_workflow,
    ".github/workflows/release-stable.yml",
  );
  assert.equal(
    control.publication.stable.additive_repair_manual_dispatch_workflow,
    ".github/workflows/release-stable-post-success-followups.yml",
  );
  assert.equal(control.publication.stable.trigger, "workflow_dispatch");
  assert.equal(
    control.publication.stable.lower_level_workflows,
    "workflow_call_only_except_protected_same_tag_installer_repair",
  );
  assert.deepEqual(control.publication.stable.latest_requires.slice(-3), [
    "remote_digest_readback",
    "standard_homebrew_digest_bound_publication",
    "standard_homebrew_publication_readback",
  ]);
  assert.deepEqual(control.publication.full.required_assets, [
    "One-Person-Lab-Full-<version>-mac-arm64.dmg",
    "opl-release-manifest.json",
  ]);
  assert.equal(control.publication.full.may_follow_latest, true);
  assert.deepEqual(control.publication.full.must_not_modify, [
    "standard_assets",
    "latest-mac.yml",
    "latest-arm64-mac.yml",
    "prepared_ai_release_notes",
    "latest_selection",
  ]);
  assert.equal(control.publication.full.updater_metadata_allowed, false);
  assert.equal(control.publication.ghcr.stable_critical_path, false);
  assert.equal(control.publication.ghcr.desktop_release_bundle_asset, false);
  assert.deepEqual(control.publication.ghcr.installer_sidecar_assets_on_desktop_latest, [
    "install-docker-webui.sh",
    "install-docker-webui.ps1",
  ]);
  assert.equal(
    control.publication.ghcr.installer_sidecar_attestation_policy,
    "outside_sealed_standard_payload_additive_name_size_digest_cas",
  );
  assert.equal(control.publication.nightly.status, "implemented_pending_first_publication_readback");
  assert.equal(control.publication.nightly.publication_available, true);
  assert.equal(control.publication.nightly.mutation_available, true);
  assert.equal(control.publication.nightly.historical_readback_allowed, true);
  assert.equal(control.publication.nightly.workflow, ".github/workflows/release-nightly.yml");
  assert.equal(control.publication.nightly.default_trigger, "daily_schedule");
  assert.deepEqual(control.publication.nightly.development_validation_trigger, {
    event: "workflow_dispatch",
    authority: "user_explicit",
    confirmation: "publish_nonlatest_nightly",
    execution_path: "same_as_scheduled_nightly",
  });
  assert.equal(control.publication.nightly.scheduled_latest_allowed, false);
  assert.equal(control.publication.nightly.explicit_user_override_may_move_latest, true);
  assert.equal(control.publication.nightly.include_full, false);
  assert.equal(control.publication.nightly.stable_bundle_authority_used, false);
  assert.equal(control.publication.nightly.stable_mutation_mutex_used, false);
  assert.equal(control.publication.nightly.heavy_vm_blocking, false);
  assert.equal(control.publication.nightly.post_publication_followers_block_github_prerelease, false);
  assert.equal(release.nightly_standard.status, "implemented_pending_first_publication_readback");
  assert.equal(release.nightly_standard.publication_available, true);
  assert.equal(release.nightly_standard.mutation_available, true);
  assert.equal(release.nightly_standard.historical_tag_and_receipt_parsing_allowed, true);
  assert.equal(release.nightly_standard.workflow, ".github/workflows/release-nightly.yml");
  assert.equal(release.nightly_standard.default_trigger, "daily_schedule");
  assert.deepEqual(release.nightly_standard.development_validation_trigger, {
    event: "workflow_dispatch",
    authority: "user_explicit",
    confirmation: "publish_nonlatest_nightly",
    execution_path: "same_as_scheduled_nightly",
  });
  assert.equal(release.nightly_standard.include_full, false);
  assert.equal(release.nightly_standard.quality_status, "preview");
  assert.equal(release.nightly_standard.build_trigger, "automated");
  assert.equal(release.nightly_standard.preview_kind, "nightly");
  assert.equal(release.nightly_standard.scheduled_latest_release_allowed, false);
  assert.equal(release.nightly_standard.explicit_user_override_may_move_latest, true);
  assert.equal(release.nightly_standard.heavy_vm_blocks_publication, false);
});

test("publisher is digest-idempotent and unknown API results only reconcile", () => {
  assert.deepEqual(control.publisher_idempotency, {
    missing_asset: "upload",
    same_name_same_digest: "already_complete",
    same_name_different_digest: "fail_closed_require_new_bundle_or_version",
    unknown_api_result: "reconcile_only",
    redispatch_on_unknown_allowed: false,
    rerun_on_unknown_allowed: false,
    cancel_on_unknown_allowed: false,
    reconcile_admission: {
      persistent_unknown_framework_receipt_required: true,
      unknown_marker_schema: "opl_release_bundle_unknown_outcome.v1",
      fresh_framework_status_required: true,
      framework_status_surface: "release_bundle_status",
      framework_status_marker_field: "active_unknown_markers",
      framework_status_reconcile_field: "tracks.<track>.reconcile_required",
      framework_status_reconcile_required_value: true,
      exact_marker_match_fields: [
        "bundle_digest",
        "operation_id",
        "operation_kind",
        "stage_operation",
        "publication_scope",
        "track",
        "remote_target",
        "prior_mutation_attempt_id",
      ],
      app_may_infer_reconcile_required: false,
      required_sequence: [
        "persist_framework_unknown_outcome_marker",
        "read_fresh_framework_status",
        "require_exact_active_unknown_marker",
        "bounded_read_only_remote_inspect",
        "framework_exact_reconcile",
      ],
      active_marker_ordinary_mutation_allowed: false,
      app_local_reconcile_loop_allowed: false,
      deadline_elapsed_allows_bounded_read_only_inspect: true,
      deadline_elapsed_allows_framework_reconcile: true,
      deadline_elapsed_reconcile_result: "late_observation",
      deadline_elapsed_reconcile_may_advance_stage: false,
      create_upload_latest_or_homebrew_retry_allowed: false,
    },
  });
});

test("Full append asset policy is additive while retaining byte and basename integrity", () => {
  const policy = release.full_first_install.published_addon.asset_policy;
  assert.deepEqual(policy.required_assets, [
    "One-Person-Lab-Full-<version>-mac-arm64.dmg",
    "opl-release-manifest.json",
  ]);
  assert.equal(policy.additional_assets_allowed, true);
  assert.equal(policy.same_name_same_digest, "already_complete");
  assert.equal(policy.same_name_different_digest, "reject_without_mutation");
  assert.equal(policy.duplicate_name, "reject_without_mutation");
  assert.equal(policy.metadata, "positive_size_and_sha256_digest_required");
  assert.equal(policy.name, "basename_only_without_path_separator_control_character_or_empty_name");
  assert.equal(policy.standard_assets_modified, false);
});

test("legacy App Bundle and broker/state-machine surfaces are read-only compatibility", () => {
  const legacy = control.legacy_compatibility;
  assert.equal(legacy.lifecycle, "retired_historical_receipt_compatibility");
  assert.equal(legacy.authority_class, "historical_read_only");
  assert.equal(legacy.broker_session_operator_authority, "historical_read_only");
  assert.equal(legacy.access, "read_only");
  assert.equal(legacy.authoritative, false);
  assert.equal(legacy.mode, "read_only_receipt_parser");
  assert.equal(legacy.historical_app_schema, "opl_app_release_bundle.v1");
  assert.deepEqual(legacy.accepted_read_only_commands, ["verify", "status"]);
  assert.equal(legacy.new_state_creation_allowed, false);
  assert.equal(legacy.can_claim_release_ready, false);
  assert.equal(
    legacy.legacy_broker_and_stable_state_machine_live_mutation_authority,
    false,
  );
  assert.equal(legacy.new_legacy_dispatch_publish_or_rebuild_allowed, false);
  assert.deepEqual(legacy.retired_package_scripts, [
    "release:stable",
    "release:operator",
    "release:publish",
    "release:bundle",
    "release:plan",
    "release:preflight",
    "release:cohort-lock",
    "release:cohort-plan",
    "release:closeout",
    "release:cleanup-drafts",
    "release:gate-reuse-plan",
    "release:cohort-manifest",
    "release:candidate-record",
    "release:candidate-record:resolve-owner",
    "release:candidate-record:validate",
    "release:candidate-record:status",
    "release:owner-candidate-record:verify",
  ]);
  assert.deepEqual(legacy.retained_read_only_package_scripts, [
    "release:historical-candidate-record:status",
    "release:historical-bundle:status",
  ]);
  assert.ok(legacy.parser_forbidden_capabilities.includes("authorize_mutation"));
  assert.ok(legacy.parser_forbidden_capabilities.includes("reconcile_live_state"));
  assert.equal(legacy.retired_scripts_may_parse_historical_receipts, false);
  assert.equal(
    legacy.retired_scripts_may_be_package_or_workflow_mutation_entrypoints,
    false,
  );
});

test("old session, broker, operator, writer map, and owner fast path are absent", () => {
  const forbiddenKeys = [
    "stable_release_state_machine",
    "cohort_prepare",
    "release_operator",
    "release_monitor",
    "gate_reuse",
    "publish_resume",
    "post_owner_receipt_fast_path",
    "broker_authority_gate",
    "promotion_saga",
    "attempt_ledger",
    "signed_mutation_authority",
  ];
  const serialized = JSON.stringify(release);

  for (const key of forbiddenKeys) assert.doesNotMatch(serialized, new RegExp(`"${key}"\\s*:`));
  for (const workflow of [
    ".github/workflows/desktop-release.yml",
    ".github/workflows/desktop-release-promote.yml",
    ".github/workflows/desktop-release-full-addon.yml",
  ]) assert.doesNotMatch(serialized, new RegExp(workflow.replaceAll(".", "\\.")));
  assert.doesNotMatch(serialized, /"release_operator_plan"/);
  assert.equal(release.release_acceleration.live_state_authority, false);
  assert.equal(release.release_acceleration.live_mutation_authority, false);
  assert.equal(release.operator_evidence_bundle.release_owner_verdict.framework_bundle_state_effect, "none");
});

test("append_full is a checkpoint capability and not a Standard Latest requirement", () => {
  const full = release.full_first_install.published_addon;
  assert.deepEqual(release.full_first_install.production_macos_trust.unknown_submission_recovery, {
    workflow: ".github/workflows/full-first-install-release.yml#full-finalizer",
    checkpoint_schema: "opl_apple_notarization_recovery_checkpoint.v1",
    artifact_name: "opl-full-apple-recovery-<version>-<run-id>",
    runs_on_failure_only: true,
    exact_submitted_dmg_bytes_must_be_retained: true,
    required_identity_fields: ["submission_id", "sha256", "size_bytes"],
    resubmission_allowed_before_owner_authoritative_reconcile: false,
    finalize_only_may_consume_only_exact_submitted_bytes: true,
    identity_incomplete_status: "diagnostic_only",
    resume_policy: "same_submission_finalize_only_after_owner_authoritative_reconcile",
  });
  assert.equal(full.operation, "append_full");
  assert.equal(full.workflow, ".github/workflows/_release-full-addon.yml");
  assert.equal(full.checkpoint_minimum_stage, "standard_built");
  assert.equal(full.standard_identity_required, false);
  assert.equal(full.standard_release_readback, "required_exact_mutable_release_and_sealed_standard_asset_set_cas");
  assert.equal(full.standard_release_prerequisite_required, true);
  assert.equal(full.mode, "same_tag_mutable_standard_addon");
  assert.equal(full.successor_trigger.workflow, ".github/workflows/release-stable-post-success-followups.yml");
  assert.equal(full.successor_trigger.one_successor_per_standard_run, true);
  assert.equal(
    full.successor_trigger.operation_kind_source,
    "opl-release-operation-admission-<source-run-id>/release-operation-admission.json",
  );
  assert.deepEqual(full.successor_trigger.non_applicable_operation_kinds, ["append_full"]);
  assert.equal(full.successor_trigger.workflow_dispatch_ref, "canonical_main");
  assert.equal(full.successor_trigger.executor_head_sha, "workflow_run_head_sha");
  assert.equal(full.framework_operation_receipt_schema, "opl_release_bundle_operation_receipt.v1");
  assert.equal(full.standard_assets_modified, false);
  assert.equal(full.carrier_identity.base_release_tag, "exact_existing_mutable_standard_target");
  assert.equal(full.carrier_identity.full_release_tag, "same_as_base_release_tag");
  assert.equal(full.carrier_identity.new_release_or_tag_allowed, false);
  assert.equal(
    full.carrier_identity.full_content_identity_source,
    "opl-release-manifest.json#carrier_context.full_content_sources",
  );
  assert.equal(full.carrier_identity.standard_reference_role, "same_release_append_target_and_asset_cas");
  assert.equal(full.carrier_identity.workflows_write_permission_required, false);
  assert.deepEqual(full.target_standard_reference.required_fields, [
    "repository",
    "release_id",
    "tag",
    "target_commitish",
    "immutable",
    "standard_asset_set",
    "standard_attestation",
  ]);
  assert.equal(full.target_standard_reference.target_immutable_required, false);
  assert.equal(full.target_standard_reference.base_assets_overwrite_or_delete_allowed, false);
  assert.equal(full.target_standard_reference.cross_component_compatibility_gate_allowed, false);
  assert.equal(full.release_notes_modified, false);
  assert.equal(full.latest_modified, false);
  assert.ok(!control.publication.stable.latest_requires.includes("append_full"));
  assert.deepEqual(release.homebrew_tap_distribution.full_casks, ["one-person-lab-full"]);
  assert.deepEqual(release.homebrew_tap_distribution.excluded_casks, []);
  assert.equal(
    release.homebrew_tap_distribution.tap_update_policy.full.mode,
    "post_publication_digest_bound_single_attempt_follower",
  );
  assert.equal(release.homebrew_tap_distribution.tap_update_policy.full.homebrew_publish_allowed, true);
  assert.equal(
    release.homebrew_tap_distribution.tap_update_policy.full.promotion_status,
    "approved_pending_first_protected_follower_readback",
  );
});

test("operation safety is explicit in the machine contract", () => {
  assert.equal(control.operation_control.schema, "opl_release_bundle_operation_control.v1");
  assert.equal(
    control.operation_control.stable_mutation_mutex,
    "opl-release-bundle-global",
  );
  assert.equal(control.operation_control.partial_workflow_rerun_allowed, false);
  assert.equal(control.operation_control.github_run_attempt_required, 1);
  assert.equal(
    control.operation_control.deadline_clock,
    "github_actions_created_at_resolved_once_by_controller",
  );
  assert.equal(control.operation_control.deadline_source_field, "github.created_at");
  assert.equal(control.operation_control.deadline_frozen_at_controller_admission, true);
  assert.equal(control.operation_control.deadline_may_be_rebased_on_queue_start_resume_or_rerun, "resume_standard_only_after_exact_reconcile_and_expiry");
  assert.deepEqual(control.operation_control.operation_admission_identity_fields, [
    "operation",
    "operation_id",
    "operation_started_at",
    "operation_deadline_at",
  ]);
  assert.equal(
    control.operation_control.stable_operations.resume_standard.control,
    "reuse_exact_standard_identity_with_bounded_expired_window_rotation",
  );
  assert.equal(control.operation_control.stable_operations.resume_standard.deadline_minutes, 30);
  assert.equal(control.operation_control.stable_operations.resume_standard.new_operation_id_allowed, false);
  assert.equal(control.operation_control.stable_operations.resume_standard.active_window_rotation_allowed, false);
  assert.equal(control.operation_control.stable_operations.resume_standard.expired_window_rotation_allowed, true);
  assert.equal(control.operation_control.stable_operations.resume_standard.rotation_requires_no_active_unknown_marker, true);
  assert.equal(control.operation_control.deadline_refresh_allowed, "resume_standard_expired_window_only");
  assert.equal(control.operation_control.stable_operations.append_full.standard_built_required, true);
  assert.equal(control.operation_control.stable_operations.append_full.standard_operation_id_reuse_allowed, false);
  assert.equal(control.operation_control.elapsed_deadline.exact_reconcile_result, "late_observation");
  assert.equal(control.operation_control.elapsed_deadline.stage_advanced, false);
  assert.equal(control.operation_control.typed_failure_evidence_persisted_before_job_exit_or_cleanup, true);
  assert.equal(
    control.resilience_policy.stable_version_comparison_scope,
    "all_public_stable_releases_not_latest_only",
  );
  assert.deepEqual(control.resilience_policy.updater_baseline_sources, [
    "current_latest",
    "highest_public_stable",
  ]);
  assert.deepEqual(control.resilience_policy.updater_zip_identity_fields, ["size_bytes", "sha256"]);
  assert.equal(control.resilience_policy.homebrew_single_writer, true);
  assert.equal(control.resilience_policy.homebrew_reconcile_owner, "OPL Framework opl release");
  assert.equal(control.resilience_policy.homebrew_app_local_reconcile_loop_allowed, false);
  assert.equal(control.resilience_policy.homebrew_reconcile_max_attempts, undefined);
  assert.equal(control.resilience_policy.homebrew_retry_push_on_unknown_allowed, false);
});

test("failed v26.7.20 Full digest is permanently excluded from every Bundle", () => {
  assert.equal(rejected.schema, "opl_app_rejected_release_artifact.v1");
  assert.equal(rejected.artifact.size_bytes, 708064535);
  assert.equal(
    rejected.artifact.sha256,
    "3b34e0831609b9c593798d335a757643c4a7f2cfafbe38b818704c03ea42fb1e",
  );
  assert.equal(rejected.qualification.typed_failure, "catalog/package_ref_mismatch");
  assert.equal(rejected.evidence.root, "/private/tmp/opl-terminal-full-a80e-p0");
  assert.equal(rejected.disposition.status, "permanently_rejected");
  assert.equal(rejected.disposition.publish_allowed, false);
  assert.equal(rejected.disposition.upload_retry_allowed, false);
  assert.equal(rejected.disposition.same_bytes_requalification_allowed, false);
  assert.equal(rejected.disposition.same_bytes_may_enter_release_bundle, false);
  assert.ok(
    control.cutover.rejected_artifact_receipts.includes(
      "docs/delivery/release/incidents/2026-07-20-v26.7.20-full-catalog-mismatch.json",
    ),
  );
  assert.deepEqual(control.cutover.permanently_rejected_bundle_digests, [
    "sha256:91d5ea069757fca6bb9aa2280615dc952caeff55b6b4bc13e08e40df32378f49",
  ]);
});

test("release guide points to product authority before executor instructions", () => {
  const readme = fs.readFileSync(path.join(appRoot, "docs/delivery/release/README.md"), "utf8");
  const authorityPointer = readme.indexOf("../distribution-and-install-ssot.md");
  const stableInstructions = readme.indexOf("## Stable Operations");
  assert.ok(authorityPointer >= 0);
  assert.ok(stableInstructions < 0 || authorityPointer < stableInstructions);
  assert.match(readme, /Independent WebUI archives, qualification archives and follower Releases are retired/);
});
