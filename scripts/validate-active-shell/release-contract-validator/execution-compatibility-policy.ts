import { assertDeepEqualJson, assertIncludesAll } from '../assertions.ts';
import {
  retiredReleasePackageScripts,
  validationCanaryContract,
} from './execution-contract-values.ts';

function validateLegacyCompatibility(releaseChannel, shellPaths, validationProfile) {
  const control = releaseChannel?.release_bundle_control_plane;
  const legacy = control?.legacy_compatibility;
  const acceleration = releaseChannel?.release_acceleration;

  if (
    !control?.cutover?.permanently_rejected_bundle_digests?.includes(
      'sha256:91d5ea069757fca6bb9aa2280615dc952caeff55b6b4bc13e08e40df32378f49',
    )
  ) {
    throw new Error('Release control plane must permanently reject the known failed Bundle digest');
  }
  if (
    legacy?.lifecycle !== 'retired_historical_receipt_compatibility' ||
    legacy?.authority_class !== 'historical_read_only' ||
    legacy?.broker_session_operator_authority !== 'historical_read_only' ||
    legacy?.access !== 'read_only' ||
    legacy?.authoritative !== false ||
    legacy?.mode !== 'read_only_receipt_parser' ||
    legacy?.new_state_creation_allowed !== false ||
    legacy?.legacy_broker_and_stable_state_machine_live_mutation_authority !== false ||
    legacy?.historical_receipts_remain_readable !== true ||
    legacy?.new_legacy_dispatch_publish_or_rebuild_allowed !== false ||
    JSON.stringify(legacy?.accepted_read_only_commands) !== JSON.stringify(['verify', 'status']) ||
    legacy?.retired_scripts_may_parse_historical_receipts !== false ||
    legacy?.retired_scripts_may_be_package_or_workflow_mutation_entrypoints !== false ||
    legacy?.legacy_contract_role !== 'historical_receipt_verification_only' ||
    acceleration?.scope !== 'product_build_qualification_vm_and_cache_policy_only' ||
    acceleration?.product_policy_only !== true ||
    acceleration?.live_state_authority !== false ||
    acceleration?.live_mutation_authority !== false ||
    acceleration?.new_session_or_dispatch_allowed !== false ||
    acceleration?.state_authority_ref !== 'release_bundle_control_plane.framework_authority' ||
    acceleration?.github_actions?.live_release_mutation_authority !== false
  ) {
    throw new Error('Legacy release broker, session, and operator implementations must remain absent while retained Bundle status commands read historical evidence');
  }
  assertIncludesAll(
    legacy.parser_forbidden_capabilities,
    [
      'create_release_state',
      'authorize_mutation',
      'dispatch',
      'rerun',
      'cancel',
      'build',
      'qualify',
      'publish',
      'promote',
      'reconcile_live_state',
    ],
    'Legacy parser forbidden capabilities',
  );
  assertDeepEqualJson(
    legacy.retired_package_scripts,
    retiredReleasePackageScripts,
    'Retired release package scripts',
  );

}

function validateValidationCanary(releaseChannel, shellPaths, validationProfile) {
  const control = releaseChannel?.release_bundle_control_plane;
  const validationCanary = control?.validation_canary;

  assertDeepEqualJson(
    validationCanary,
    validationCanaryContract,
    'Release validation-only Canary contract',
  );

}

export { validateLegacyCompatibility, validateValidationCanary };
