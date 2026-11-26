import { isDeepStrictEqual } from 'node:util';

type CompareStringList = (actual: unknown, expected: string[]) => boolean;

const guardEntrypoints = [
  'release_version_validation',
  'framework_release_freeze',
  'framework_release_checkpoint_export_import',
  'standard_operation',
  'resume_standard_operation',
  'append_full_operation',
  'latest_activation',
];

const sameTagRepairReasons = [
  'build_failure',
  'signing_failure',
  'notarization_failure',
  'packaging_failure',
  'publication_failure',
  'release_notes_repair',
  'standard_asset_replacement',
  'full_asset_append_or_replacement',
  'homebrew_repair',
  'additive_platform_repair',
];

export function releaseCalendarGuardViolation(
  releaseName: Record<string, any> | null | undefined,
  {
    entrypointsEqual = isDeepStrictEqual,
    preservationReasonsEqual = isDeepStrictEqual,
  }: {
    entrypointsEqual?: CompareStringList;
    preservationReasonsEqual?: CompareStringList;
  } = {},
): string | undefined {
  const guard = releaseName?.calendar_guard;
  if (!entrypointsEqual(guard?.required_entrypoints, guardEntrypoints)) {
    return `Release calendar guard entrypoints must be ${JSON.stringify(guardEntrypoints)}; got ${JSON.stringify(guard?.required_entrypoints)}`;
  }
  if (
    guard?.time_zone !== 'Asia/Shanghai'
    || guard?.future_dated_versions_allowed !== false
    || guard?.failure_mode !== 'fail_closed_before_build_remote_lookup_or_mutation'
  ) {
    return 'Release calendar guard must reject future-dated versions before build, lookup, or mutation';
  }

  const stableRevision = releaseName?.stable_revision;
  const releaseIntent = releaseName?.release_intent_policy;
  if (
    stableRevision?.eligibility !== 'explicit_user_visible_product_change_only'
    || stableRevision?.release_intent_required !== 'new_product'
    || stableRevision?.nonempty_product_change_summary_required !== true
    || stableRevision?.publication_build_packaging_signing_notarization_notes_homebrew_or_additive_failure_eligible !== false
    || stableRevision?.same_tag_repair_required !== true
    || releaseIntent?.new_tag_requires !== 'release_intent_new_product_and_nonempty_user_visible_product_change_summary'
    || releaseIntent?.current_latest_app_release_must_be_complete_before_new_tag !== true
    || releaseIntent?.same_tag_asset_and_notes_replacement_allowed !== true
    || releaseIntent?.same_tag_mutation_requires_exact_current_identity_cas_and_public_readback !== true
    || releaseIntent?.nonfunctional_release_work_may_allocate_version !== false
  ) {
    return 'Stable tag allocation must require a user-visible product change; publication repair must preserve the tag';
  }
  if (!preservationReasonsEqual(releaseIntent?.preserve_existing_tag_for, sameTagRepairReasons)) {
    return `Stable same-tag repair reasons must be ${JSON.stringify(sameTagRepairReasons)}; got ${JSON.stringify(releaseIntent?.preserve_existing_tag_for)}`;
  }
  return undefined;
}
