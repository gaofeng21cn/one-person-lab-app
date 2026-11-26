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

export const appOwnedRunningStatePolicy =
  "only explicit running, in_progress, or advancing status/state counts as running; active_run_id alone is context, not liveness proof; queued, pending, and waiting require explicit projected status; blocked or attention_needed stay blocked/attention states; stopped, parked, and checkpointed stay inactive and must not be relabeled queued";

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

export const domainDetailViewAvailabilityValues = [
  "unread",
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

export const systemAttentionResponsibilityFields = [
  "responsible_component",
  "issue",
  "repair_action",
  "impact",
  "expected_outcome",
];

export const workItemVisibilityStates = ["visible", "archived"];

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

export const appOwnedQueueStatusPolicy =
  "queued, pending, and waiting require explicit projected status; blocked or attention_needed stay blocked/attention states; stopped, parked, and checkpointed stay inactive; non-running must never be inferred as queued";
