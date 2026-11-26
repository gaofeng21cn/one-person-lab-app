import { assertDeepEqualJson, assertIncludesAll } from "../assertions.ts";
import {
  assertNonEmptyString,
  assertNonEmptyStringArray,
} from "../validation-primitives.ts";
import {
  expectedVisualQaManifestFields,
  expectedVisualQaStatusAnchors,
  settingsControlPlaneContractRef,
  settingsIaRef,
} from "./constants.ts";

export function validateSettingsVisualQaPolicy(controlPlane, guiContract = undefined) {
  const policy = controlPlane.visual_qa_policy;
  if (
    policy?.policy !==
    "settings_control_center_visual_qa_is_shell_behavior_evidence"
  ) {
    throw new Error(
      "Settings visual QA policy must describe shell behavior evidence",
    );
  }
  assertDeepEqualJson(
    policy.required_viewports,
    ["desktop", "mobile"],
    "Settings visual QA required viewports",
  );
  assertDeepEqualJson(
    policy.required_routes,
    controlPlane.ordinary_routes.map((route) => route.path),
    "Settings visual QA required routes",
  );
  assertDeepEqualJson(
    policy.required_secondary_routes,
    controlPlane.secondary_pages.map((route) => route.path),
    "Settings visual QA secondary routes",
  );
  assertDeepEqualJson(
    policy.required_compatibility_redirects,
    Object.values(controlPlane.compatibility_redirects).map(
      (redirect) => `${redirect.source_route_id}->${redirect.target_route_id}#${redirect.anchor}`,
    ),
    "Settings visual QA compatibility redirects",
  );
  assertDeepEqualJson(
    policy.required_status_anchors,
    expectedVisualQaStatusAnchors,
    "Settings visual QA status anchors",
  );
  if (
    policy.evidence_manifest?.path !==
    "tests/e2e/screenshots/settings-control-center-manifest.json"
  ) {
    throw new Error(
      "Settings visual QA policy must declare the screenshot evidence manifest path",
    );
  }
  assertDeepEqualJson(
    policy.evidence_manifest?.required_fields,
    expectedVisualQaManifestFields,
    "Settings visual QA evidence manifest fields",
  );
  for (const field of ["viewport_policy", "secondary_route_policy", "compatibility_route_policy"]) {
    assertNonEmptyString(policy.evidence_manifest[field], `Settings visual QA manifest ${field}`);
  }
  if (!String(policy.evidence_command ?? "").includes("E2E_SCREENSHOTS=1")) {
    throw new Error(
      "Settings visual QA policy must require screenshot evidence",
    );
  }
  const visualSystem = controlPlane.experience_contract?.visual_system;
  const baselineCommit = visualSystem?.baseline_shell_commit ?? "";
  if (
    !/^[0-9a-f]{40}$/.test(baselineCommit) ||
    typeof policy.baseline_ref !== "string" ||
    !policy.baseline_ref.endsWith(`@${baselineCommit}`) ||
    policy.baseline_comparison_policy !==
      "same_route_final_screenshots_must_preserve_or_improve_spatial_and_typographic_hierarchy"
  ) {
    throw new Error(
      "Settings visual QA must bind same-route hierarchy comparison to the visual system baseline",
    );
  }
  if (guiContract) {
    const expectations = guiContract.settings_navigation?.settings_ia?.protocols?.visual_qa_expectations;
    assertDeepEqualJson(
      expectations?.baseline_comparison?.shell_commit,
      baselineCommit,
      "Settings visual QA baseline commit across contracts",
    );
    assertDeepEqualJson(
      expectations?.surface_grouping?.first_viewport_spatial_group_range,
      visualSystem.first_viewport_spatial_group_range,
      "Settings visual QA surface grouping range across contracts",
    );
    assertDeepEqualJson(
      expectations?.responsive_hierarchy,
      {
        desktop: visualSystem.desktop_group_layout,
        mobile: visualSystem.mobile_group_layout,
        icon_slot_px: visualSystem.icon_slot_px,
        ...visualSystem.typography,
      },
      "Settings visual QA responsive hierarchy across contracts",
    );
    assertDeepEqualJson(
      expectations?.status_color_semantics,
      visualSystem.status_color_semantics,
      "Settings visual QA status colors across contracts",
    );
    assertDeepEqualJson(
      expectations?.footer_structure?.controls,
      visualSystem.footer_controls,
      "Settings visual QA footer structure controls across contracts",
    );
  }
  assertIncludesAll(
    policy.does_not_prove,
    [
      "release readiness",
      "packaged App readiness",
      "runtime currentness",
      "owner acceptance",
    ],
    "Settings visual QA non-release evidence boundary",
  );
}

export function validateSettingsProductSystemChecklist(controlPlane) {
  const checklist = controlPlane.product_system_checklist;
  if (checklist?.schema !== "settings_product_system_checklist.v1") {
    throw new Error(
      "Settings product system checklist must use settings_product_system_checklist.v1",
    );
  }
  if (
    checklist?.purpose !==
    "plan_completion_audit_source_for_settings_control_center"
  ) {
    throw new Error(
      "Settings product system checklist must be the plan completion audit source",
    );
  }
  if (
    checklist?.completion_policy !==
    "each item is audited against fresh evidence; tests, docs, or contracts only prove the item slice they directly cover"
  ) {
    throw new Error(
      "Settings product system checklist must require fresh per-item evidence",
    );
  }
  if (
    checklist?.release_currentness_policy !==
    "installed app, notarization, running version, and release readiness remain release-owner gates and must not be inferred from Settings tests"
  ) {
    throw new Error(
      "Settings product system checklist must separate release/currentness gates from Settings tests",
    );
  }
  const items = checklist?.items;
  if (!Array.isArray(items) || new Set(items.map((item) => item?.id)).size !== items.length) {
    throw new Error("Settings product system checklist item ids must be present and unique");
  }
  const productSystemTracks = [
    "product_positioning",
    "ia_routes",
    "control_plane",
    "shell_adapter",
    "state_action_protocol",
    "user_task_ux",
    "visual_qa",
    "ops_hygiene",
    "release_currentness",
  ];
  assertIncludesAll(
    [...new Set(items.map((item) => item?.track))],
    productSystemTracks,
    "Settings product system checklist tracks",
  );
  for (const item of items) {
    assertNonEmptyString(item?.id, "Settings product system checklist item id");
    if (!productSystemTracks.includes(item.track)) {
      throw new Error(
        `Settings product system checklist item ${item.id} has unknown track ${item.track}`,
      );
    }
    assertNonEmptyString(item.goal, `Settings product system checklist goal for ${item.id}`);
    assertNonEmptyStringArray(
      item.evidence_required,
      `Settings product system checklist evidence for ${item.id}`,
    );
  }
  const releaseItem = items.find(
    (item) => item.id === "installed_release_currentness",
  );
  if (releaseItem?.track !== "release_currentness") {
    throw new Error(
      "Settings installed/release currentness item must stay on the release_currentness track",
    );
  }
  assertIncludesAll(
    releaseItem?.evidence_required,
    [
      "release_currentness_policy separates this item from Settings tests",
      "visual QA and contract validators list what they do not prove",
      "release owner gate supplies any future installed or release evidence",
    ],
    "Settings release/currentness checklist evidence",
  );
  const screenshotItem = items.find((item) => item.id === "screenshot_qa");
  assertIncludesAll(
    screenshotItem?.evidence_required,
    [
      "visual_qa_policy lists ordinary and secondary routes",
      "compatibility redirects are captured as landing evidence",
      "visual QA does not prove release or currentness readiness",
    ],
    "Settings screenshot QA checklist evidence",
  );
}

export function validateSettingsShellAdapterSlot(adapterContract) {
  const slot =
    adapterContract?.implementation_probes
      ?.settings_control_plane_shell_adapter_slot;
  if (!slot) {
    throw new Error(
      "Active shell adapter must declare settings_control_plane_shell_adapter_slot",
    );
  }
  if (
    slot.source_ref !== settingsIaRef &&
    slot.source_ref !== settingsControlPlaneContractRef
  ) {
    throw new Error(
      "Settings shell adapter slot must point to the Settings control plane or settings_ia contract",
    );
  }
  if (slot.policy !== "behavior_level_dom_or_registry_validation_preferred") {
    throw new Error(
      "Settings shell adapter slot must prefer behavior-level DOM or registry validation",
    );
  }
  if ((slot.source_probe_policy ?? "").includes("primary")) {
    throw new Error(
      "Settings shell adapter slot must not make source-string probes the primary validation strategy",
    );
  }
  if (slot.host_component !== "SettingsHost") {
    throw new Error("Settings shell adapter slot must declare SettingsHost");
  }
  const registry = slot.slots?.SettingsShellAdapterSlot;
  if (
    registry?.registry_source !== settingsControlPlaneContractRef ||
    registry?.ordinary_route_source !== "ordinary_routes" ||
    registry?.secondary_route_source !== "secondary_pages" ||
    registry?.legacy_redirect_source !== "legacy_route_redirects" ||
    registry?.extension_anchor_source !== "extension_anchor_remap"
  ) {
    throw new Error(
      "SettingsShellAdapterSlot must mount the App-owned registry and resolve its ordinary, secondary, and compatibility routes",
    );
  }
  assertNonEmptyStringArray(
    slot.required_evidence,
    "Settings shell adapter slot required evidence",
  );
}
