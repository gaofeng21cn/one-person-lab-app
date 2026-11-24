import { assertDeepEqualJson } from '../assertions.ts';
import { sameStringSet } from './string-set.ts';
import {
  publisherReconcileAdmissionContract,
  standardLatestAdmissionContract,
  standardPrePublicationAdmissionContract,
} from './execution-contract-values.ts';

function validateReleasePublication(releaseChannel, shellPaths, validationProfile) {
  const control = releaseChannel?.release_bundle_control_plane;
  const publication = control?.publication;

  if (
    publication?.stable?.primary_release_manual_dispatch_workflow !== '.github/workflows/release-stable.yml' ||
    publication?.stable?.additive_repair_manual_dispatch_workflow !==
      '.github/workflows/release-stable-post-success-followups.yml' ||
    publication?.stable?.trigger !== 'workflow_dispatch' ||
    publication?.stable?.lower_level_workflows !==
      'workflow_call_only_except_protected_same_tag_installer_repair'
  ) {
    throw new Error('Stable primary publication and protected same-tag installer repair must remain separate bounded manual entries');
  }
  if (
    publication?.nightly?.status !== 'implemented' ||
    publication?.nightly?.publication_available !== true ||
    publication?.nightly?.mutation_available !== true ||
    publication?.nightly?.historical_readback_allowed !== true ||
    publication?.nightly?.workflow !== '.github/workflows/release-nightly.yml' ||
    publication?.nightly?.default_trigger !== 'daily_schedule' ||
    JSON.stringify(publication?.nightly?.development_validation_trigger) !== JSON.stringify({
      event: 'workflow_dispatch',
      authority: 'user_explicit',
      confirmation: 'publish_nonlatest_nightly',
      execution_path: 'same_as_scheduled_nightly',
    }) ||
    publication?.nightly?.scheduled_latest_allowed !== false ||
    publication?.nightly?.explicit_user_override_may_move_latest !== true ||
    publication?.nightly?.include_full !== false ||
    publication?.nightly?.stable_bundle_authority_used !== false ||
    publication?.nightly?.stable_mutation_mutex_used !== false ||
    publication?.nightly?.heavy_vm_blocking !== false ||
    publication?.nightly?.post_publication_followers_block_github_prerelease !== false ||
    publication?.nightly?.followup_workflow !== '.github/workflows/release-nightly-followups.yml' ||
    !sameStringSet(publication?.nightly?.followup_operations, ['reconcile_homebrew', 'run_sampled_vm'])
  ) {
    throw new Error('Nightly must default to the daily schedule and keep user-explicit development validation on the same Standard-only non-Latest path');
  }
  assertDeepEqualJson(
    publication?.stable?.latest_admission,
    standardLatestAdmissionContract,
    'Standard Latest admission',
  );
  assertDeepEqualJson(
    publication?.stable?.pre_publication_admission,
    standardPrePublicationAdmissionContract,
    'Standard pre-publication admission',
  );

}

function validateReleasePublisher(releaseChannel, shellPaths, validationProfile) {
  const control = releaseChannel?.release_bundle_control_plane;
  const publisher = control?.publisher_idempotency;

  if (
    publisher?.missing_asset !== 'upload' ||
    publisher?.same_name_same_digest !== 'already_complete' ||
    publisher?.same_name_different_digest !== 'fail_closed_require_new_bundle_or_version' ||
    publisher?.unknown_api_result !== 'reconcile_only' ||
    publisher?.redispatch_on_unknown_allowed !== false ||
    publisher?.rerun_on_unknown_allowed !== false ||
    publisher?.cancel_on_unknown_allowed !== false
  ) {
    throw new Error('Release publisher must be digest-idempotent and reconcile-only after an unknown result');
  }
  assertDeepEqualJson(
    publisher?.reconcile_admission,
    publisherReconcileAdmissionContract,
    'Release publisher reconcile admission',
  );

}

export { validateReleasePublication, validateReleasePublisher };
