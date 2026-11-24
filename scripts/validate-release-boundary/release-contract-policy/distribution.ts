import fs from 'node:fs';
import path from 'node:path';

import { sameStringSet } from './types.ts';

const requiredHomebrewStandardCaskRef = 'gaofeng21cn/one-person-lab/one-person-lab';
const requiredHomebrewTrustedCaskRefs = [
  'gaofeng21cn/one-person-lab/one-person-lab',
  'gaofeng21cn/one-person-lab/one-person-lab-full',
  'gaofeng21cn/one-person-lab/one-person-lab-nightly',
];
const requiredHomebrewTrustScope = 'explicit_standard_and_conflicting_cask_refs_not_whole_tap';

export function validateHomebrewVmGateStaticPolicy(
  appRoot: string,
  releaseContract: Record<string, any>,
  firstRunMatrix: Record<string, any>,
): number {
  let failures = 0;
  const homebrewVmScenario = Array.isArray(firstRunMatrix.scenarios)
    ? firstRunMatrix.scenarios.find((scenario) => scenario.id === 'homebrew_standard_cask_clean_vm_smoke')
    : null;
  const homebrewVm = homebrewVmScenario?.vm;
  const homebrewPolicy = releaseContract.homebrew_tap_distribution?.cask_install_policy;
  const workflowVmText = fs.readFileSync(path.join(appRoot, '.github/workflows/opl-first-run-vm.yml'), 'utf8');

  if (
    homebrewVm?.homebrew_cask_install_ref !== requiredHomebrewStandardCaskRef ||
    homebrewPolicy?.standard_cask_install_ref !== requiredHomebrewStandardCaskRef ||
    !workflowVmText.includes(`homebrew_cask=${requiredHomebrewStandardCaskRef}`)
  ) {
    console.error('FAIL homebrew_vm_gate_static_policy: the standalone Homebrew VM gate must install the fully qualified App cask ref');
    failures += 1;
  }
  if (
    !sameStringSet(homebrewVm?.homebrew_trusted_cask_refs, requiredHomebrewTrustedCaskRefs) ||
    !sameStringSet(homebrewPolicy?.standard_install_trusted_cask_refs, requiredHomebrewTrustedCaskRefs)
  ) {
    console.error('FAIL homebrew_vm_gate_static_policy: trusted refs must cover explicit standard/full/nightly cask refs');
    failures += 1;
  }
  if (
    homebrewVm?.homebrew_trust_scope !== requiredHomebrewTrustScope ||
    homebrewPolicy?.trust_scope !== requiredHomebrewTrustScope
  ) {
    console.error('FAIL homebrew_vm_gate_static_policy: trust scope must stay explicit cask refs, not whole tap');
    failures += 1;
  }
  if (
    homebrewVm?.homebrew_trusted_cask_refs?.includes('gaofeng21cn/one-person-lab') ||
    homebrewPolicy?.standard_install_trusted_cask_refs?.includes('gaofeng21cn/one-person-lab')
  ) {
    console.error('FAIL homebrew_vm_gate_static_policy: whole tap trust is not allowed');
    failures += 1;
  }

  return failures;
}

export function validateWebuiPackagePolicy(releaseContract: Record<string, any>): number {
  let failures = 0;
  const webuiPackage = releaseContract.webui_ghcr_image;
  if (webuiPackage?.github_package_access?.target_repository_association !== 'gaofeng21cn/one-person-lab-app') {
    console.error('FAIL webui_package_association: target repository association must be gaofeng21cn/one-person-lab-app');
    failures += 1;
  }
  if (webuiPackage?.github_package_access?.current_historical_association_allowed_until_ui_migration !== 'gaofeng21cn/one-person-lab') {
    console.error('FAIL webui_package_association: historical association allowance must name gaofeng21cn/one-person-lab');
    failures += 1;
  }
  if (webuiPackage?.retention_policy?.cleanup_execution_mode !== 'dry_run_first_explicit_execute_required') {
    console.error('FAIL webui_retention_policy: cleanup must be dry-run first with explicit execute');
    failures += 1;
  }
  if (!webuiPackage?.retention_policy?.protected_tags?.includes('nightly')) {
    console.error('FAIL webui_retention_policy: protected tags must include nightly');
    failures += 1;
  }
  return failures;
}
