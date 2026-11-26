import { assertIncludesAll } from "./assertions.ts";
export function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

export function assertNonEmptyStringArray(value, label) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => typeof entry !== "string" || !entry.trim())
  ) {
    throw new Error(`${label} must be a non-empty string array`);
  }
  return value;
}

export function assertFirstRunProgressModelShape(progressModel, label) {
  if (!progressModel || typeof progressModel !== "object") {
    throw new Error(`${label} must declare a progress model`);
  }
  assertNonEmptyString(progressModel.source_command, `${label} source_command`);
  assertNonEmptyString(progressModel.source_path, `${label} source_path`);
  assertNonEmptyString(progressModel.renderer_truth_policy, `${label} renderer_truth_policy`);
  assertNonEmptyStringArray(
    progressModel.required_setup_flow_fields,
    `${label} required_setup_flow_fields`,
  );
  assertNonEmptyStringArray(
    progressModel.required_progress_fields,
    `${label} required_progress_fields`,
  );
  assertNonEmptyStringArray(
    progressModel.required_checklist_fields,
    `${label} required_checklist_fields`,
  );
  assertNonEmptyStringArray(
    progressModel.required_visible_elements,
    `${label} required_visible_elements`,
  );
}

export function assertFirstRunProgressModelMatches(actual, expected, label) {
  assertFirstRunProgressModelShape(expected, `${label} expected model`);
  if (actual?.source_command !== expected.source_command) {
    throw new Error(`${label} progress model must use ${expected.source_command}`);
  }
  if (actual?.source_path !== expected.source_path) {
    throw new Error(`${label} progress model must read ${expected.source_path}`);
  }
  if (actual?.renderer_truth_policy !== expected.renderer_truth_policy) {
    throw new Error(`${label} progress model must keep renderers as display-only consumers`);
  }
  assertIncludesAll(
    actual?.required_setup_flow_fields,
    expected.required_setup_flow_fields,
    `${label} progress setup_flow fields`,
  );
  assertIncludesAll(
    actual?.required_progress_fields,
    expected.required_progress_fields,
    `${label} progress fields`,
  );
  assertIncludesAll(
    actual?.required_checklist_fields,
    expected.required_checklist_fields,
    `${label} progress checklist fields`,
  );
  assertIncludesAll(
    actual?.required_visible_elements,
    expected.required_visible_elements,
    `${label} progress visible elements`,
  );
}

export function assertSharedFirstRunProgressModelMatches(actual, expected, label) {
  assertFirstRunProgressModelShape(expected, `${label} expected model`);
  if (actual?.source_command !== expected.source_command) {
    throw new Error(`${label} shared progress model must use ${expected.source_command}`);
  }
  if (actual?.source_path !== expected.source_path) {
    throw new Error(`${label} shared progress model must read ${expected.source_path}`);
  }
  assertIncludesAll(
    actual?.required_setup_flow_fields,
    expected.required_setup_flow_fields,
    `${label} shared progress setup_flow fields`,
  );
  assertIncludesAll(
    actual?.required_progress_fields,
    expected.required_progress_fields,
    `${label} shared progress fields`,
  );
  assertIncludesAll(
    actual?.required_checklist_fields,
    expected.required_checklist_fields,
    `${label} shared progress checklist fields`,
  );
}

export const resourceContextOptionalTaskRefs = [
  "resource_source_refs",
  "gateway_status_ref",
  "environment_ref",
  "storage_ref",
  "resource_plan_ref",
  "resource_approval_ref",
  "resource_execute_ref",
  "resource_monitor_ref",
  "resource_collect_ref",
  "resource_usage_ref",
  "console_policy_ref",
  "quota_ref",
  "billing_ref",
  "permission_ref",
  "environment_template_ref",
  "environment_version_ref",
  "environment_source_ref",
  "environment_task_refs",
  "resource_receipt_ref",
  "cost_estimate_ref",
];

export function assertNoForbiddenKeys(value, forbiddenKeys, label, objectPath = label) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoForbiddenKeys(item, forbiddenKeys, label, `${objectPath}[${index}]`),
    );
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKeys.includes(key)) {
      throw new Error(`${label} must not project ${key} at ${objectPath}.${key}`);
    }
    assertNoForbiddenKeys(nested, forbiddenKeys, label, `${objectPath}.${key}`);
  }
}
