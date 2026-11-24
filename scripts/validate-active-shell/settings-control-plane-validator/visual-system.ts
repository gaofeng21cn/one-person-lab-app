import { assertDeepEqualJson, assertIncludesAll } from "../assertions.ts";
import {
  appActionRoute,
  appOwnedSecondarySettingsPages,
  appOwnedSettingsResourcesBrowserEntry,
  appOwnedSettingsCompatibilityRedirects,
  appOwnedSettingsCardFields,
  appOwnedSettingsCapabilitiesTabContract,
  appOwnedSettingsConfirmationFields,
  appOwnedSettingsIaGroupIds,
  appOwnedSettingsIssueStatuses,
  appOwnedSettingsAboutUpdaterStatePolicy,
  appOwnedSettingsAppUpdateStatePolicy,
  appOwnedSettingsAppUpdateStatePolicyRef,
  appOwnedSettingsMakeUsableAllowedSteps,
  appOwnedSettingsMakeUsableForbiddenSteps,
  appOwnedSettingsManagedDependencySummary,
  appOwnedSettingsManagedUpdateRepairPolicy,
  appOwnedSettingsManagedUpdateRepairPolicyRef,
  appOwnedSettingsNavigationDestinationIds,
  appOwnedSettingsNavigationDestinationOwners,
  appOwnedSettingsNavigationGroupLabels,
  appOwnedSettingsProductSystemItemIds,
  appOwnedSettingsProductSystemTracks,
  appOwnedSettingsProjectionItemFields,
  appOwnedSettingsProjectionSectionIds,
  appOwnedSettingsPostUpdateNoticeFields,
  appOwnedSettingsPageExperienceFields,
  appOwnedSettingsPageAnchors,
  appOwnedSettingsPageSearchEntryIds,
  appOwnedSettingsProductPageIds,
  appOwnedSettingsResourceActionBehavior,
  appOwnedStorageCarrierBehavior,
  appOwnedWebuiDataVolumeHostActionAbiRef,
  appOwnedWebuiDataVolumeHostActionCapabilityId,
  appOwnedSettingsRouteScopes,
  appOwnedSettingsSearchEntryFields,
  appOwnedSettingsSearchProtocol,
  appOwnedSettingsTabs,
  appOwnedSettingsTaskEntryMetadataFields,
  appOwnedSettingsTechnicalDetailsDefault,
  appOwnedSettingsTopLevelEntryIds,
  appOwnedSettingsTopLevelLabels,
  appOwnedSettingsTaskEntryIds,
  appOwnedSettingsVisualQaTargets,
  appOwnedSettingsVisualSystem,
  legacySettingsRouteRedirects,
} from "../app-contract-constants.ts";
import { validateSettingsCapabilitiesTaskAwarenessSurface } from "../shared-contract-validators.ts";

import {
  expectedSettingsAdapterEvidence,
  expectedVisualQaCompatibilityRedirects,
  expectedVisualQaManifestFields,
  expectedVisualQaRoutes,
  expectedVisualQaSecondaryRoutes,
  expectedVisualQaStatusAnchors,
  settingsControlPlaneContractRef,
  settingsIaRef,
} from "./constants.ts";

export function validateSettingsVisualQaPolicy(controlPlane) {
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
    expectedVisualQaRoutes,
    "Settings visual QA required routes",
  );
  assertDeepEqualJson(
    policy.required_secondary_routes,
    expectedVisualQaSecondaryRoutes,
    "Settings visual QA secondary routes",
  );
  assertDeepEqualJson(
    policy.required_compatibility_redirects,
    expectedVisualQaCompatibilityRedirects,
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
  if (
    policy.evidence_manifest?.viewport_policy !==
      "each required route is checked at both the default desktop and narrow mobile viewports" ||
    policy.evidence_manifest?.secondary_route_policy !==
      "about is captured as the only independent secondary page" ||
    policy.evidence_manifest?.compatibility_route_policy !==
      "update, theme, local-services, and personalization are captured as redirect landing evidence on their owner route and anchor"
  ) {
    throw new Error(
      "Settings visual QA manifest must declare ordinary, secondary, and compatibility evidence policy",
    );
  }
  if (!String(policy.evidence_command ?? "").includes("E2E_SCREENSHOTS=1")) {
    throw new Error(
      "Settings visual QA policy must require screenshot evidence",
    );
  }
  if (
    policy.baseline_ref !==
      "opl-aion-shell@409dd0c3b693f1c7c93551654dfac8fb9420843d" ||
    policy.baseline_comparison_policy !==
      "same_route_final_screenshots_must_preserve_or_improve_spatial_and_typographic_hierarchy"
  ) {
    throw new Error(
      "Settings visual QA must bind same-route hierarchy comparison to the 409dd0c3 baseline",
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
  const items = checklist?.items ?? [];
  assertDeepEqualJson(
    items.map((item) => item.id),
    appOwnedSettingsProductSystemItemIds,
    "Settings product system checklist item ids",
  );
  const tracks = [...new Set(items.map((item) => item.track))];
  assertDeepEqualJson(
    tracks,
    appOwnedSettingsProductSystemTracks,
    "Settings product system checklist tracks",
  );
  for (const item of items) {
    if (!appOwnedSettingsProductSystemTracks.includes(item.track)) {
      throw new Error(
        `Settings product system checklist item ${item.id} has unknown track ${item.track}`,
      );
    }
    if (typeof item.goal !== "string" || item.goal.trim().length < 20) {
      throw new Error(
        `Settings product system checklist item ${item.id} must declare a concrete goal`,
      );
    }
    if (
      !Array.isArray(item.evidence_required) ||
      item.evidence_required.length < 3
    ) {
      throw new Error(
        `Settings product system checklist item ${item.id} must list at least three evidence requirements`,
      );
    }
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
  if (!slot.slots?.SettingsShellAdapterSlot) {
    throw new Error(
      "Settings shell adapter slot must declare SettingsShellAdapterSlot",
    );
  }
  assertDeepEqualJson(
    slot.required_evidence,
    expectedSettingsAdapterEvidence,
    "Settings shell adapter slot required evidence",
  );
}
