import { isDeepStrictEqual } from 'node:util';
import { sameStringSet, type ReleaseContract } from './types.ts';

const physicalVmGateIds = [
  'standard_dmg_clean_vm_smoke',
  'homebrew_standard_cask_clean_vm_smoke',
  'full_dmg_clean_vm_smoke',
];

const legacyVmMirrorFields = [
  'source',
  'artifact',
  'smoke_profile',
  'display',
  'settings_smoke',
  'diagnostic_scope',
  'runtime_profile',
  'codex_config_wizard',
  'gate_policy',
  'certification_readiness',
  'release_blocking_readiness',
  'post_core_ready_background_policy',
];

const expectedHostedLinux = {
  id: 'linux_x64_same_artifact_install_smoke',
  workflow: '.github/workflows/release-post-publication-certification.yml',
  runner: 'ubuntu-latest',
  platform: 'linux-x64',
  artifact: 'One-Person-Lab-<version>-linux-x64.deb',
  installer: 'opl-install.sh',
  installer_arguments: ['--desktop', '--release-tag', '<exact-tag>', '--no-open'],
  app_release_single_tag_asset_binding_required: true,
  same_release_tag_required: true,
  desktop_manifest_cohort_binding_required: true,
  same_deb_artifact_identity_required: true,
  cross_component_version_sha_or_cohort_equality_required: false,
  dependency_compatibility_contract_ref:
    'contracts/app-install-exposure-policy.json#component_interoperability.compatibility_admission',
  typed_admission_schema: 'opl_app_stable_desktop_asset_append.v1',
  typed_execution_evidence_schema: 'opl_app_linux_same_tag_desktop_install.v1',
  clean_machine_preinstall_absence_required: true,
  installed_executable_byte_parity_required: true,
  failed_download_evidence_truthful_required: true,
  terminal_statuses: ['passed', 'failed'],
  unavailable_allowed: false,
  downloaded_from_published_release_required: true,
  rebuilt_allowed: false,
  failure_receipt_uploaded_before_job_failure: true,
  gate_policy: 'optional_non_blocking_same_published_artifact',
  required_for_publication_or_latest: false,
};

function matchesHostedLinuxFields(hostedLinux: ReleaseContract | undefined): boolean {
  return Object.entries(expectedHostedLinux).every(([field, expected]) =>
    field === 'installer_arguments'
      ? sameStringSet(hostedLinux?.[field], expectedHostedLinux.installer_arguments)
      : isDeepStrictEqual(hostedLinux?.[field], expected)
  );
}

function* physicalVmQualificationViolations(
  acceleration: ReleaseContract | undefined,
  caller: 'active-shell' | 'release-boundary',
): Generator<string> {
  const activeShell = caller === 'active-shell';
  const vmGates = Array.isArray(acceleration?.vm_gates) ? acceleration.vm_gates : [];
  const vmGateIds = vmGates.map((gate) => gate?.id);
  if (JSON.stringify(vmGateIds) !== JSON.stringify(physicalVmGateIds)) {
    yield activeShell
      ? `Physical VM qualification gates must be ${JSON.stringify(physicalVmGateIds)}; got ${JSON.stringify(vmGateIds)}`
      : 'FAIL release_vm_certification_policy: physical VM gate identities must remain exact';
  }

  const requiredVmGates = vmGates.filter((gate) =>
    gate?.id === 'standard_dmg_clean_vm_smoke' || gate?.id === 'full_dmg_clean_vm_smoke'
  );
  if (requiredVmGates.length !== 2 || requiredVmGates.some((gate) => {
    const isFull = gate?.id === 'full_dmg_clean_vm_smoke';
    return gate?.diagnostic_scope !== 'release_gate'
      || gate?.gate_policy !== 'required_prepublication_same_candidate'
      || gate?.runtime_profile !== (isFull ? 'full' : 'standard')
      || !Array.isArray(gate?.certification_readiness)
      || !gate.certification_readiness.includes(isFull
        ? 'official_profile_exact_roots_installed_without_restore'
        : 'official_profile_background_status_and_root_presence_observed_without_restore')
      || !sameStringSet(gate?.release_blocking_readiness, [
        'gateway_account_login',
        ...(isFull ? ['official_profile_first_install'] : []),
        'fresh_framework_agent_projection',
      ]);
  })) {
    yield activeShell
      ? 'Standard and Full physical VM qualification must fail closed on the exact same candidate'
      : 'FAIL release_vm_required_policy: Standard and Full clean-VM must remain the prepublication physical VM gates';
  }

  const optionalVmGate = vmGates.find((gate) => gate?.id === 'homebrew_standard_cask_clean_vm_smoke');
  if (
    optionalVmGate?.diagnostic_scope !== 'post_publication_optional_certification'
    || optionalVmGate?.gate_policy !== 'optional_non_blocking_same_published_artifact'
    || 'release_blocking_readiness' in (optionalVmGate ?? {})
  ) {
    yield activeShell
      ? 'Homebrew physical VM qualification must remain post-publication optional certification'
      : 'FAIL release_vm_optional_policy: Homebrew VM certification must remain post-publication and non-blocking';
  }

  const fullVmGate = vmGates.find((gate) => gate?.id === 'full_dmg_clean_vm_smoke');
  const legacyVmGate = acceleration?.vm_gate;
  const differingMirrorField = legacyVmMirrorFields.find((field) =>
    activeShell
      ? !isDeepStrictEqual(legacyVmGate?.[field], fullVmGate?.[field])
      : JSON.stringify(legacyVmGate?.[field]) !== JSON.stringify(fullVmGate?.[field])
  );
  if (activeShell && differingMirrorField !== undefined) {
    yield `Legacy Full VM required qualification mirror ${differingMirrorField} must be ${JSON.stringify(fullVmGate?.[differingMirrorField])}; got ${JSON.stringify(legacyVmGate?.[differingMirrorField])}`;
  }
  if (!activeShell && (!fullVmGate || !legacyVmGate || differingMirrorField !== undefined)) {
    yield 'FAIL release_vm_legacy_mirror: legacy Full VM policy must mirror the required clean-install gate';
  }

  const hostedLinux = acceleration?.hosted_linux_certification;
  const hostedLinuxMatches = activeShell
    ? isDeepStrictEqual(hostedLinux, expectedHostedLinux)
    : matchesHostedLinuxFields(hostedLinux);
  if (!hostedLinuxMatches) {
    yield activeShell
      ? `GitHub-hosted Linux x64 same-artifact optional certification must be ${JSON.stringify(expectedHostedLinux)}; got ${JSON.stringify(hostedLinux)}`
      : 'FAIL release_hosted_linux_certification: Linux certification must consume exact public installer and DEB bytes without blocking Stable or Latest';
  }
}

export function assertPhysicalVmQualification(acceleration: ReleaseContract | undefined): void {
  const first = physicalVmQualificationViolations(acceleration, 'active-shell').next();
  if (!first.done) throw new Error(first.value);
}

export function reportPhysicalVmQualificationFailures(acceleration: ReleaseContract | undefined): number {
  let failures = 0;
  for (const violation of physicalVmQualificationViolations(acceleration, 'release-boundary')) {
    console.error(violation);
    failures += 1;
  }
  return failures;
}
