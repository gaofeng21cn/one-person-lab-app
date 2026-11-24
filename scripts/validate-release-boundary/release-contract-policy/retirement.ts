import { sameStringSet, stringArrayIncludesAll } from './types.ts';

export const requiredRetiredReleasePackageScripts = [
  'release:stable',
  'release:operator',
  'release:publish',
  'release:bundle',
  'release:plan',
  'release:cohort-lock',
  'release:cohort-plan',
  'release:preflight',
  'release:closeout',
  'release:cleanup-drafts',
  'release:gate-reuse-plan',
  'release:cohort-manifest',
  'release:candidate-record',
  'release:candidate-record:resolve-owner',
  'release:candidate-record:validate',
  'release:candidate-record:status',
  'release:owner-candidate-record:verify',
];
export const requiredRemovedReleaseImplementationPaths = [
  'scripts/run-stable-release.ts',
  'scripts/release-operator.ts',
  'scripts/release-mutation-broker.ts',
  'scripts/release-session-lease.ts',
  'scripts/publish-full-addon.ts',
  'scripts/plan-release-candidate.ts',
  'scripts/validate-release-preflight.ts',
  'scripts/release-cohort-lock.ts',
  'scripts/plan-release-cohort.ts',
  'scripts/plan-release-gate-reuse.ts',
  'scripts/write-release-cohort-manifest.ts',
  'scripts/write-release-candidate-record.ts',
  'scripts/resolve-release-owner-candidate-record.ts',
  'scripts/verify-release-owner-candidate-record.ts',
  'scripts/cleanup-draft-release-candidates.ts',
  'scripts/stable-release-reconcile.ts',
];
export const requiredRetainedNonAuthoritativeImplementationPaths = [
  'scripts/release-bundle.ts',
  'scripts/validate-release-candidate-record.ts',
  'scripts/stable-release-session.ts',
  'scripts/closeout-release-run.ts',
  'scripts/inspect-release-draft-candidates.ts',
];

export function retiredReleaseControlPlaneViolations(releaseContract: Record<string, any>): string[] {
  const violations: string[] = [];
  const forbiddenKeys = new Set([
    'stable_release_state_machine',
    'cohort_prepare',
    'release_operator',
    'release_monitor',
    'gate_reuse',
    'publish_resume',
    'post_owner_receipt_fast_path',
    'broker_authority_gate',
    'promotion_saga',
    'attempt_ledger',
    'signed_mutation_authority',
  ]);
  const forbiddenWorkflowValues = new Set([
    '.github/workflows/desktop-release.yml',
    '.github/workflows/desktop-release-promote.yml',
    '.github/workflows/desktop-release-full-addon.yml',
  ]);

  const visit = (value: unknown, pathName = 'release_channel') => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${pathName}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const entryPath = `${pathName}.${key}`;
      if (forbiddenKeys.has(key)) violations.push(`retired field ${entryPath}`);
      if (typeof entry === 'string' && forbiddenWorkflowValues.has(entry)) {
        violations.push(`retired writer workflow ${entryPath}`);
      }
      if (entry === 'release_operator_plan') violations.push(`retired operator admission ${entryPath}`);
      visit(entry, entryPath);
    }
  };

  visit(releaseContract);
  return violations;
}

export type ReleaseBrokerAuthorityReadiness = {
  current_release_admission_readiness: {
    status: 'retired' | 'blocked';
    mode: 'framework_checkpoint_app_executor';
    blockers: string[];
  };
  isolated_broker_hardening: {
    status: 'retired' | 'blocked';
    disposition: 'historical_receipt_verification_only';
    blockers: string[];
  };
};

export function evaluateReleaseBrokerAuthorityReadiness(
  authority: unknown,
): ReleaseBrokerAuthorityReadiness {
  const candidate = authority as Record<string, any> | null;
  const admission = candidate?.current_release_admission;
  const blockers: string[] = [];
  if (
    candidate?.schema !== 'opl_app_release_broker_authority.v1' ||
    candidate?.lifecycle !== 'retired_historical_receipt_verification_only' ||
    candidate?.live_mutation_authority !== false ||
    candidate?.new_admission_allowed !== false ||
    candidate?.new_dispatch_publish_promote_rebuild_or_cancel_allowed !== false ||
    candidate?.replacement_authority_ref !== 'contracts/app-release-channel.json#release_bundle_control_plane.live_authority' ||
    admission?.lifecycle !== 'retired_historical_projection' ||
    admission?.live_admission_authority !== false ||
    admission?.historical_receipt_verification_only !== true ||
    admission?.new_admission_allowed !== false ||
    candidate?.mutation_broker?.execution_allowed !== false ||
    candidate?.mutation_broker?.receipt_verification_only !== true ||
    candidate?.workflow_lookup?.new_lookup_or_mutation_allowed !== false ||
    candidate?.workflow_lookup?.historical_receipt_verification_only !== true
  ) blockers.push('legacy broker contract is not fully retired to historical receipt verification');
  return {
    current_release_admission_readiness: {
      status: blockers.length === 0 ? 'retired' : 'blocked',
      mode: 'framework_checkpoint_app_executor',
      blockers,
    },
    isolated_broker_hardening: {
      status: blockers.length === 0 ? 'retired' : 'blocked',
      disposition: 'historical_receipt_verification_only',
      blockers,
    },
  };
}
