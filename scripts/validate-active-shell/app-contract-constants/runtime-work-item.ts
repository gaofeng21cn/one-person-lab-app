export const appOwnedGenericOwnerAcceptanceCurrentnessRefPolicy = {
  projection_field: "stage_run_current_owner_delta",
  owner_field: "owner",
  accepted_return_shapes_field: "accepted_return_shapes",
  acceptance_or_blocker_refs_field: "artifact_or_blocker_refs",
  currentness_guard_refs_field: "readiness_false_flag_refs",
  unknown_owner_policy: "unknown_fail_closed_no_acceptance_or_currentness_inference",
  missing_refs_policy: "unknown_fail_closed_no_acceptance_or_currentness_inference",
  app_role: "display_only_refs_consumer_no_owner_verdict_authority",
};

export const retiredMasOwnerAcceptanceMirrorFields = [
  "mas_runtime_acceptance_display_policy",
  "mas_owner_consumption_status",
  "mas_owner_consumption_ref",
  "mas_owner_consumed_stage_attempt_id",
  "mas_owner_consumed_closeout_ref",
  "mas_owner_consumption_matches_runtime_closeout",
  "mas_currentness_drift_text",
];

export const appOwnedProjectGroupExpansionPolicy = {
  running_group_default: "expanded",
  attention_group_default: "visible_when_nonempty",
  inactive_group_default: "collapsed",
  inactive_states: [
    "queued",
    "pending",
    "waiting",
    "stopped",
    "parked",
    "checkpointed",
    "blocked",
    "attention_needed",
  ],
  inactive_summary_fields: [
    "count",
    "status",
    "next_visible_step",
    "runtime_closeout_observed",
    "runtime_closeout_ref",
    "stage_run_current_owner_delta",
  ],
};

export const appOwnedPrimaryGroupingPolicy = {
  default_order: [
    "in_progress",
    "delivered_auto_paused",
    "paused_waiting_for_direction",
    "owner_decision_required",
    "system_attention_required",
  ],
  collapsed_groups: ["delivered_auto_paused", "paused_waiting_for_direction"],
  secondary_badge_fields: [
    "automation_state_label",
    "active_stage_label",
    "last_progress_at",
  ],
};

export const appOwnedRunningStatePolicy =
  "only explicit running, in_progress, or advancing status/state counts as running; active_run_id alone is context, not liveness proof; queued, pending, and waiting require explicit projected status; blocked or attention_needed stay blocked/attention states; stopped, parked, and checkpointed stay inactive and must not be relabeled queued";

export const appOwnedRuntimeMentalModel = [
  "agent/capability: which agent, capability package, or module is responsible",
  "project: which project line, study, or deliverable track this work belongs to",
  "task/work item: the user-visible unit that is advancing, waiting, or blocked",
  "execution run: the current stage run, heartbeat, usage, and blocker route for this task",
];

export const runtimeScopeRequiredFields = [
  "agent_scope_options",
  "selected_agent_scope",
  "project_scope_options",
  "selected_project_scope",
  "scope_source",
  "inferred_scope_hint",
];

export const workItemPrimaryStateLabelsByLocale = {
  "en-US": {
    automatically_advancing: "Automatically advancing",
    awaiting_user_decision: "Waiting for your decision",
    system_attention: "System handling",
    delivered_auto_paused: "Delivered and auto-paused",
    paused: "Paused",
    stopped: "Stopped",
    sync_pending: "Sync pending",
  },
  "zh-CN": {
    automatically_advancing: "自动推进中",
    awaiting_user_decision: "等待你决定",
    system_attention: "系统处理中",
    delivered_auto_paused: "已交付自动暂停",
    paused: "已暂停",
    stopped: "已停止",
    sync_pending: "状态待同步",
  },
};

export const runtimePrimaryStateValues = [
  "in_progress",
  "delivered_auto_paused",
  "paused_waiting_for_direction",
  "owner_decision_required",
  "system_attention_required",
];

export const runtimeAutomationStateValues = [
  "automation_running",
  "automation_idle",
  "result_pending_terminalization",
  "automation_failed",
];

export const workItemProjectionRequiredFields = [
  "item_id",
  "identity",
  "lifecycle",
  "execution",
  "attention",
  "telemetry",
  "conditions",
  "freshness",
  "visibility",
  "action",
];

export const workItemProjectionFieldContracts = {
  identity: [
    "agent_id",
    "agent_display_name",
    "project_id",
    "workspace_path",
    "project_display_name",
    "work_item_id",
    "work_item_display_name",
  ],
  lifecycle: [
    "business_state",
    "primary_state",
    "primary_state_label",
    "reason",
    "last_transition_at",
  ],
  execution: [
    "state",
    "current_stage_id",
    "current_stage_display_name",
    "next_stage_id",
    "next_stage_display_name",
    "started_at",
    "last_heartbeat_at",
  ],
  attention: ["kind", "summary", "owner_display_name", "responsibility"],
  telemetry: ["state", "elapsed", "current_stage_tokens", "task_total_tokens"],
  freshness: ["state", "observed_at", "last_progress_at", "reason"],
  visibility: ["state", "source", "updated_at", "control_ref", "generation"],
  action: [
    "kind",
    "title",
    "title_key",
    "summary",
    "summary_key",
    "message_args",
    "owner",
    "owner_kind",
    "action_ref",
    "dry_run_required",
  ],
};

export const domainDetailViewAvailabilityValues = [
  "unread",
  "available",
  "missing",
  "stale",
  "invalid",
  "read_error",
];

export const domainDetailViewReadAvailabilityValues = [
  "available",
  "missing",
  "stale",
  "invalid",
  "read_error",
];

export const domainDetailViewDescriptorFields = [
  "item_id",
  "view_id",
  "view_kind",
  "availability",
];

export const domainDetailViewDescriptorOptionalFields = [
  "title",
  "schema_ref",
  "schema_version",
  "revision",
  "digest",
];

export const runtimeWorkItemDetailSecondarySections = ["domain_detail_views"];

export const workItemConditionFields = [
  "type",
  "status",
  "reason",
  "message",
  "owner",
  "last_transition_time",
  "observed_generation",
];

export const systemAttentionResponsibilityFields = [
  "responsible_component",
  "issue",
  "repair_action",
  "impact",
  "expected_outcome",
];

export const tokenObservationStates = ["observed", "missing", "stale"];

export const tokenObservationObservedFields = [
  "input_tokens",
  "output_tokens",
  "total_tokens",
  "source",
  "observed_at",
];

export const actionEnvelopeKinds = [
  "user_action",
  "system_action",
  "agent_action",
  "safe_action",
  "blocked_no_action",
];

export const actionOwnerKinds = ["user", "system", "agent", "other"];

export const workItemVisibilityStates = ["visible", "archived"];

export const workItemBusinessStates = [
  "active",
  "delivered_paused",
  "paused",
  "stopped",
  "archived",
  "unknown",
];

export const runtimeVisibilityPageStateIds = [
  "active_empty",
  "archived_empty",
  "archiving",
  "restoring",
  "archive_failed",
  "restore_failed",
  "stale_generation_conflict",
  "locale_en_us",
  "locale_zh_cn",
];

export const workItemDetailPrimarySections = [
  "stage_map",
  "current_and_next_stage",
  "running_and_heartbeat",
  "stage_and_total_tokens",
  "action",
];

export const workItemDetailSecondarySections = ["artifacts", "timeline", "evidence"];

export const workItemDetailDiagnosticSections = [
  "raw_refs",
  "raw_ids",
  "logs",
  "provider_diagnostics",
];

export const appOwnedQueueStatusPolicy =
  "queued, pending, and waiting require explicit projected status; blocked or attention_needed stay blocked/attention states; stopped, parked, and checkpointed stay inactive; non-running must never be inferred as queued";

export const appOwnedAgentModuleStatusPanel = {
  source: "task capability/module refs separated from task liveness",
  display_policy:
    "render agent, capability, connector, and module status in a dedicated panel instead of mixing them into stage/run telemetry; explain dirty or missing states in plain language and suppress zero-workload/no-activity filler",
  required_ref_fields: [
    "connector_readiness_refs",
    "diagnostic_substrate_refs",
    "gateway_status_ref",
  ],
  optional_ref_fields: ["capability_health_refs"],
  telemetry_missing_copy: "module status unavailable",
};

export const taskRunProjectionV2RequiredFields = [
  "task_identity",
  "status",
  "progress",
  "conditions",
  "evidence_cards",
  "action_cards",
  "resource_cards",
  "diagnostics_ref",
];

export const taskRunProjectionV2FieldGroups = {
  task_identity: [
    "task_id",
    "title",
    "domain_id",
    "domain_label",
    "study_id",
    "task_ref",
    "agent_display_name",
    "project_display_name",
    "work_item_display_name",
    "execution_run_label",
  ],
  status: [
    "state",
    "status",
    "status_label",
    "priority_bucket",
    "primary_state",
    "primary_state_label",
    "primary_state_reason",
    "automation_state",
    "automation_state_label",
    "automation_state_reason",
    "active_stage_id",
    "active_stage_label",
    "active_run_ref",
  ],
  progress: [
    "progress_label",
    "current_step",
    "last_progress_at",
    "progress_ref",
    "stage_ref",
  ],
  conditions: [
    "type",
    "status",
    "reason",
    "message",
    "severity",
    "owner",
    "last_transition_time",
    "ref",
  ],
  evidence_cards: [
    "card_id",
    "kind",
    "owner",
    "updated_at",
    "title",
    "summary",
    "ref",
    "why_it_matters",
    "open_action",
    "content_policy",
  ],
  action_cards: [
    "card_id",
    "risk",
    "write_targets",
    "expected_output",
    "rollback_ref",
    "verify_ref",
    "title",
    "summary",
    "ref",
    "action_ref",
    "open_action",
    "dry_run_required",
    "content_policy",
  ],
  resource_cards: [
    "card_id",
    "resource_kind",
    "owner",
    "title",
    "summary",
    "ref",
    "status_ref",
    "usage_ref",
    "quota_ref",
    "permission_ref",
    "cost_estimate_ref",
    "open_action",
    "content_policy",
  ],
  diagnostics_ref: ["diagnostics_ref"],
};
