import type { ReleaseBoundaryCheck, ReleaseValidationProfile } from './types.ts';

export function releaseValidationProfile(
  value = process.env.OPL_RELEASE_VALIDATION_PROFILE,
): ReleaseValidationProfile {
  if (value === undefined || value === '') return 'aggregate';
  if (value === 'aggregate' || value === 'stable' || value === 'windows') return value;
  throw new Error(`Unsupported OPL_RELEASE_VALIDATION_PROFILE: ${value}.`);
}

export function activeShellReleaseValidationProfile(
  quick: boolean,
  value = process.env.OPL_RELEASE_VALIDATION_PROFILE,
): ReleaseValidationProfile {
  return releaseValidationProfile(
    value === undefined || value === ''
      ? (quick ? 'stable' : 'aggregate')
      : value,
  );
}

export const releaseWorkflowPaths = [
  ".github/workflows/_build-reusable.yml",
  ".github/workflows/_release-bundle.yml",
  ".github/workflows/_release-desktop-platform-addon.yml",
  ".github/workflows/_release-full-addon.yml",
  ".github/workflows/_release-studio-full.yml",
  ".github/workflows/_release-homebrew-full-publish.yml",
  ".github/workflows/_release-standard-publish.yml",
  ".github/workflows/build-manual.yml",
  ".github/workflows/release-diagnostics.yml",
  ".github/workflows/docker-webui-clean-vm.yml",
  ".github/workflows/full-first-install-release.yml",
  ".github/workflows/release-qualification.yml",
  ".github/workflows/opl-first-run-vm.yml",
  ".github/workflows/opl-studio-preview-vm.yml",
  ".github/workflows/release-bundle-canary.yml",
  ".github/workflows/release-manual-full-preview.yml",
  ".github/workflows/release-stable-post-success-followups.yml",
  ".github/workflows/release-nightly.yml",
  ".github/workflows/release-nightly-followups.yml",
  ".github/workflows/release-stable.yml",
  ".github/workflows/release-webui-development.yml",
  ".github/workflows/release-webui-stable.yml",
];

const windowsProfileWorkflowPaths = new Set([
  '.github/workflows/docker-webui-clean-vm.yml',
  '.github/workflows/_build-reusable.yml',
  '.github/workflows/build-manual.yml',
]);

export function releaseWorkflowPathsForProfile(
  profile = releaseValidationProfile(),
): string[] {
  if (profile === 'aggregate') return releaseWorkflowPaths;
  if (profile === 'stable') return releaseWorkflowPaths;
  return releaseWorkflowPaths.filter((workflowPath) => windowsProfileWorkflowPaths.has(workflowPath));
}

export const windowsSpecificCheckIds = new Set([
  'docker_webui_clean_windows_dispatch_helper',
  'docker_webui_clean_windows_dispatch_npm_script',
  'docker_webui_clean_windows_runner_bootstrap_runbook',
]);

export const windowsSharedCheckIds = new Set([
  'docker_webui_clean_vm_workflow',
]);

export function filterReleaseBoundaryChecksForProfile(
  checks: ReleaseBoundaryCheck[],
  profile = releaseValidationProfile(),
): ReleaseBoundaryCheck[] {
  if (profile === 'aggregate') return checks;
  if (profile === 'stable') {
    return checks.filter((check) => !windowsSpecificCheckIds.has(check.id));
  }
  return checks.filter((check) =>
    windowsSpecificCheckIds.has(check.id) || windowsSharedCheckIds.has(check.id)
  );
}
