import { FULL_RUNTIME_FORBIDDEN_FRAMEWORK_CODEX_PATHS } from "../full-first-install-package.ts";

export function assertFrameworkCodexCarrierBoundary(boundary, label, studio = false) {
  if (
    boundary?.native_codex_external_carrier_present !== true
    || boundary?.native_codex_embedded_payload_present !== false
    || boundary?.claude_payload_absent !== true
    || boundary?.framework_codex_payload_absent !== true
  ) {
    throw new Error(
      `${label} must prove the Studio native Codex carrier is external, has no embedded payload, and has no Claude or Framework Codex payload.`,
    );
  }
  const carrierAudit = boundary.codex_carrier_audit;
  if (carrierAudit?.schema !== 'opl_codex_native_carrier_audit.v1'
    || carrierAudit.runtime_count !== 0
    || !Array.isArray(carrierAudit.runtimes) || carrierAudit.runtimes.length !== 0
    || carrierAudit.projection_present !== false || carrierAudit.claude_payload_absent !== true) {
    throw new Error(`${label} Studio native Codex carrier evidence is incomplete.`);
  }
  const forbiddenPaths = boundary.forbidden_framework_codex_paths;
  if (
    !Array.isArray(forbiddenPaths)
    || JSON.stringify(forbiddenPaths.map((entry) => entry?.path))
      !== JSON.stringify(FULL_RUNTIME_FORBIDDEN_FRAMEWORK_CODEX_PATHS)
    || forbiddenPaths.some((entry) => entry?.exists !== false)
  ) {
    throw new Error(`${label} Framework Codex absence evidence is incomplete.`);
  }
}
