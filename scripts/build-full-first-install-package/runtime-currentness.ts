import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readGitHead } from "./git.ts";
import { run } from "./process.ts";
import { readManagedUpdateLifecycleProviderMap } from "../managed-update-lifecycle-contract.ts";
import {
  assertMasScholarSkillsRuntimePayload,
  resolveMasScholarSkillsFullRuntimeSource,
} from "./manifest-checksum.ts";
import { assertMaterializedResolvedSelectedBundleDescriptor } from "./resolved-selected-bundle-descriptor.ts";

const REQUIRED_MANAGED_UPDATE_COMPONENTS = readManagedUpdateLifecycleProviderMap();
const RUNTIME_PROBE_TIMEOUT_MS = 60_000;

function parseJsonCommand(command: string, args: string[], env: NodeJS.ProcessEnv): unknown {
  const result = run(command, args, {
    capture: true,
    env,
    timeout: RUNTIME_PROBE_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  return JSON.parse(result.stdout);
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Full runtime currentness probe expected object at ${label}.`);
  }
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Full runtime currentness probe expected array at ${label}.`);
  }
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Full runtime currentness probe expected non-empty string at ${label}.`);
  }
  return value;
}

function runtimeProbeEnv(runtimeRoot: string, stateRoot: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OPL_STATE_DIR: stateRoot,
    OPL_FULL_RUNTIME_HOME: runtimeRoot,
    OPL_PACKAGED_SKILLS_ROOT: path.join(runtimeRoot, "skills"),
    OPL_SKIP_SKILL_SYNC: "1",
    PATH: [
      path.join(runtimeRoot, "bin"),
      path.join(runtimeRoot, "node", "bin"),
      path.join(runtimeRoot, "uv", "bin"),
      process.env.PATH ?? "",
    ]
      .filter(Boolean)
      .join(path.delimiter),
  };
}

function assertManifestFrameworkRef(
  runtimeRoot: string,
  frameworkRoot: string,
): Record<string, unknown> {
  const manifestPath = path.join(runtimeRoot, "manifest", "full-package-manifest.json");
  const manifest = objectValue(JSON.parse(fs.readFileSync(manifestPath, "utf8")), "manifest");
  const components = objectValue(manifest.components, "manifest.components");
  const oplComponent = objectValue(components.opl, "manifest.components.opl");
  const packagedCommit = stringValue(oplComponent.git_commit, "manifest.components.opl.git_commit");
  const expectedCommit = readGitHead(frameworkRoot);
  if (packagedCommit !== expectedCommit) {
    throw new Error(
      `Full runtime OPL Framework payload is stale: manifest has ${packagedCommit}, expected ${expectedCommit}.`,
    );
  }

  const resolvedRefs = objectValue(manifest.resolved_refs, "manifest.resolved_refs");
  const frameworkRef = objectValue(
    resolvedRefs.opl_framework,
    "manifest.resolved_refs.opl_framework",
  );
  const resolvedCommit = stringValue(
    frameworkRef.resolved_commit,
    "manifest.resolved_refs.opl_framework.resolved_commit",
  );
  if (resolvedCommit !== expectedCommit) {
    throw new Error(
      `Full runtime resolved Framework ref is stale: manifest has ${resolvedCommit}, expected ${expectedCommit}.`,
    );
  }
  return manifest;
}

function assertManifestMasScholarSkillsRef(
  manifest: Record<string, unknown>,
  source: ReturnType<typeof resolveMasScholarSkillsFullRuntimeSource>,
): string {
  const expectedCommit = source.source_commit;
  const components = objectValue(manifest.components, "manifest.components");
  const component = objectValue(
    components.mas_scholar_skills,
    "manifest.components.mas_scholar_skills",
  );
  const packagedCommit = stringValue(
    component.git_commit,
    "manifest.components.mas_scholar_skills.git_commit",
  );
  if (packagedCommit !== expectedCommit) {
    throw new Error(
      `Full runtime MAS Scholar Skills payload is stale: manifest has ${packagedCommit}, expected ${expectedCommit}.`,
    );
  }
  if (
    component.role !== "mas_required_capability_package"
    || component.required !== true
    || JSON.stringify(component.required_by) !== JSON.stringify(["mas"])
    || component.visible_in_first_run_ui !== false
    || component.standard_domain_agent !== false
  ) {
    throw new Error(
      "Full runtime MAS Scholar Skills component must remain MAS's required hidden non-agent capability dependency.",
    );
  }

  const resolvedRefs = objectValue(manifest.resolved_refs, "manifest.resolved_refs");
  const resolvedRef = objectValue(
    resolvedRefs.mas_scholar_skills,
    "manifest.resolved_refs.mas_scholar_skills",
  );
  const resolvedCommit = stringValue(
    resolvedRef.resolved_commit,
    "manifest.resolved_refs.mas_scholar_skills.resolved_commit",
  );
  if (resolvedCommit !== expectedCommit) {
    throw new Error(
      `Full runtime resolved MAS Scholar Skills ref is stale: manifest has ${resolvedCommit}, expected ${expectedCommit}.`,
    );
  }
  if (resolvedRef.requested_ref !== source.requested_ref) {
    throw new Error(
      `Full runtime resolved MAS Scholar Skills requested ref drifted: manifest has ${String(resolvedRef.requested_ref)}, expected ${source.requested_ref}.`,
    );
  }
  if (resolvedRef.requested_ref_commit !== source.requested_ref_commit) {
    throw new Error(
      `Full runtime resolved MAS Scholar Skills requested ref commit drifted: manifest has ${String(resolvedRef.requested_ref_commit)}, expected ${source.requested_ref_commit}.`,
    );
  }
  if (resolvedRef.owner_source_commit !== source.owner_source_commit) {
    throw new Error("Full runtime resolved MAS Scholar Skills owner source commit drifted.");
  }
  if (resolvedRef.runtime_module_relative_path !== source.runtime_module_relative_path) {
    throw new Error("Full runtime resolved MAS Scholar Skills module path drifted.");
  }
  for (const field of [
    "package_role",
    "package_version",
    "mas_manifest_ref",
    "mas_manifest_sha256",
    "source_manifest_ref",
    "source_manifest_sha256",
    "content_lock_digest",
    "payload_file_count",
  ]) {
    if (resolvedRef[field] !== source[field]) {
      throw new Error(
        `Full runtime resolved MAS Scholar Skills ${field} drifted: manifest has ${String(resolvedRef[field])}, expected ${String(source[field])}.`,
      );
    }
  }
  if (JSON.stringify(resolvedRef.currentness) !== JSON.stringify(source.currentness)) {
    throw new Error("Full runtime resolved MAS Scholar Skills currentness evidence drifted.");
  }
  if (resolvedRef.checksum_status !== "verified" || resolvedRef.currentness_status !== "current") {
    throw new Error(
      "Full runtime resolved MAS Scholar Skills ref must have verified checksums and current source status.",
    );
  }
  return expectedCommit;
}

export function assertManagedUpdateProbe(payload: unknown): Record<string, unknown> {
  const root = objectValue(payload, "update status payload");
  const managedUpdate = objectValue(root.managed_update, "managed_update");
  if (managedUpdate.surface_id !== "opl_managed_updater_kernel") {
    throw new Error(
      `Full runtime managed update probe returned unexpected surface: ${String(managedUpdate.surface_id)}`,
    );
  }

  const components = arrayValue(managedUpdate.components, "managed_update.components");
  const componentMap = new Map<string, Record<string, unknown>>();
  for (const value of components) {
    const component = objectValue(value, "managed_update.components[]");
    const componentId = stringValue(
      component.component_id,
      "managed_update.components[].component_id",
    );
    componentMap.set(componentId, component);
  }
  const componentIds = new Set(componentMap.keys());
  const missing = Object.keys(REQUIRED_MANAGED_UPDATE_COMPONENTS).filter(
    (componentId) => !componentIds.has(componentId),
  );
  if (missing.length > 0) {
    throw new Error(
      `Full runtime managed update probe is missing component(s): ${missing.join(", ")}.`,
    );
  }
  for (const [componentId, providerId] of Object.entries(REQUIRED_MANAGED_UPDATE_COMPONENTS)) {
    const component = componentMap.get(componentId)!;
    if (component.provider_id !== providerId) {
      throw new Error(
        `Full runtime managed update probe component ${componentId} uses provider ${String(component.provider_id)}, expected ${providerId}.`,
      );
    }
  }
  const installationCarrier = componentMap.get("opl_app")!;
  const carrierCurrent = objectValue(
    installationCarrier.current,
    "managed_update.components[opl_app].current",
  );
  stringValue(
    carrierCurrent.host_update_route,
    "managed_update.components[opl_app].current.host_update_route",
  );
  const carrierOwnerRoute = objectValue(
    installationCarrier.owner_route,
    "managed_update.components[opl_app].owner_route",
  );
  stringValue(
    carrierOwnerRoute.route_kind,
    "managed_update.components[opl_app].owner_route.route_kind",
  );
  const packages = componentMap.get("opl_packages")!;
  const packageCurrent = objectValue(
    packages.current,
    "managed_update.components[opl_packages].current",
  );
  if (
    packageCurrent.currentness_authority !==
      "installed_owner_descriptor_and_native_carrier" ||
    packageCurrent.projection_source !== "installed_owner_descriptor"
  ) {
    throw new Error(
      "Full runtime managed update probe returned an unexpected OPL Packages currentness authority.",
    );
  }
  if (
    typeof packageCurrent.installed_package_count !== "number" ||
    !Number.isInteger(packageCurrent.installed_package_count) ||
    packageCurrent.installed_package_count < 0
  ) {
    throw new Error(
      "Full runtime managed update probe returned an invalid OPL Packages installed package count.",
    );
  }
  const packageConditions = arrayValue(
    packages.conditions,
    "managed_update.components[opl_packages].conditions",
  );
  if (packageConditions.length === 0) {
    throw new Error(
      "Full runtime managed update probe returned no OPL Packages readiness conditions.",
    );
  }
  const packageOwnerRoute = objectValue(
    packages.owner_route,
    "managed_update.components[opl_packages].owner_route",
  );
  stringValue(
    packageOwnerRoute.route_kind,
    "managed_update.components[opl_packages].owner_route.route_kind",
  );
  if (componentMap.size !== components.length) {
    throw new Error("Full runtime managed update probe contains duplicate component_id values.");
  }
  return managedUpdate;
}

function runtimeSourceCarrierItems(appState: Record<string, unknown>): unknown[] {
  const carriers = objectValue(
    appState.runtime_source_carriers,
    "app_state.runtime_source_carriers",
  );
  return arrayValue(carriers.items, "app_state.runtime_source_carriers.items");
}

export function assertAppStateProbe(payload: unknown): Record<string, unknown> {
  const root = objectValue(payload, "app state payload");
  const appState = objectValue(root.app_state, "app_state");
  if (appState.schema_version !== "opl_app_state.v1") {
    throw new Error(
      `Full runtime App state probe returned unexpected schema: ${String(appState.schema_version)}`,
    );
  }

  const carrierItems = runtimeSourceCarrierItems(appState);
  if (carrierItems.length === 0) {
    throw new Error("Full runtime App state probe returned no runtime source carriers.");
  }

  for (const item of carrierItems) {
    const record = objectValue(item, "app_state.runtime_source_carriers.items[]");
    const carrierId = stringValue(
      record.carrier_id,
      "app_state.runtime_source_carriers.items[].carrier_id",
    );
    stringValue(
      record.source_health_status,
      `app_state.runtime_source_carriers.items[${carrierId}].source_health_status`,
    );
  }
  return appState;
}

export function assertFullRuntimeCurrentness(
  runtimeRoot: string,
  options: {
    frameworkRoot: string;
    masRoot: string;
    masScholarSkillsRoot: string;
    masScholarSkillsRef: string;
    resolvedSelectedBundleDescriptor?: unknown;
  },
) {
  const command = path.join(runtimeRoot, "bin", "opl");
  if (!fs.existsSync(command)) {
    throw new Error(`Full runtime currentness probe cannot find packaged opl wrapper: ${command}`);
  }

  const manifest = assertManifestFrameworkRef(runtimeRoot, options.frameworkRoot);
  const masScholarSkillsSource = resolveMasScholarSkillsFullRuntimeSource(options);
  const masScholarSkillsCommit = assertManifestMasScholarSkillsRef(
    manifest,
    masScholarSkillsSource,
  );
  const masScholarSkillsPayload = assertMasScholarSkillsRuntimePayload(
    runtimeRoot,
    masScholarSkillsSource,
  );
  const manifestAssertions = objectValue(manifest.runtime_assertions, "manifest.runtime_assertions");
  const manifestSelectedBundle = objectValue(
    manifestAssertions.resolved_selected_bundle_descriptor,
    "manifest.runtime_assertions.resolved_selected_bundle_descriptor",
  );
  const manifestHasSelectedBundle = manifestSelectedBundle.status !== "not_provided";
  const resolvedSelectedBundle = manifestHasSelectedBundle
    ? assertMaterializedResolvedSelectedBundleDescriptor(
        runtimeRoot,
        options.resolvedSelectedBundleDescriptor,
      )
    : null;
  if (resolvedSelectedBundle) {
    if (JSON.stringify(manifestSelectedBundle) !== JSON.stringify(resolvedSelectedBundle.assertion)) {
      throw new Error("Full runtime selected Bundle descriptor manifest assertion drifted.");
    }
  } else if (options.resolvedSelectedBundleDescriptor) {
    throw new Error("Full runtime selected Bundle descriptor input was not recorded in the manifest.");
  }
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-currentness-"));
  let managedUpdate: ReturnType<typeof assertManagedUpdateProbe>;
  let appState: ReturnType<typeof assertAppStateProbe>;
  try {
    const env = runtimeProbeEnv(runtimeRoot, stateRoot);
    managedUpdate = assertManagedUpdateProbe(
      parseJsonCommand(command, ["update", "status", "--json"], env),
    );
    appState = assertAppStateProbe(
      parseJsonCommand(command, ["app", "state", "--profile", "fast", "--json"], env),
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
  const runtimeSourceCarrierCount = runtimeSourceCarrierItems(appState).length;

  return {
    schema: "opl_full_runtime_currentness_probe.v1",
    status: "passed",
    runtime_root: runtimeRoot,
    framework_commit: stringValue(
      objectValue(
        objectValue(manifest.components, "manifest.components").opl,
        "manifest.components.opl",
      ).git_commit,
      "manifest.components.opl.git_commit",
    ),
    mas_scholar_skills_commit: masScholarSkillsCommit,
    mas_scholar_skills_checksum_status: "verified",
    mas_scholar_skills_currentness_status: "current",
    mas_scholar_skills_payload_file_count: masScholarSkillsPayload.payload_file_count,
    resolved_selected_bundle_descriptor_digest: resolvedSelectedBundle?.assertion.digest ?? null,
    resolved_selected_bundle_package_count: resolvedSelectedBundle?.assertion.package_count ?? 0,
    resolved_selected_bundle_skill_count: resolvedSelectedBundle?.assertion.owner_declared_skill_count ?? 0,
    resolved_selected_bundle_checksum_status: resolvedSelectedBundle ? "verified" : "not_provided",
    managed_update_surface_id: managedUpdate.surface_id,
    managed_update_components: Object.keys(REQUIRED_MANAGED_UPDATE_COMPONENTS),
    managed_update_component_providers: REQUIRED_MANAGED_UPDATE_COMPONENTS,
    app_state_schema_version: appState.schema_version,
    app_state_surface_ref: "app_state.runtime_source_carriers",
    app_state_runtime_source_carrier_count: runtimeSourceCarrierCount,
    app_state_module_count: runtimeSourceCarrierCount,
  };
}
