import {
  hasStablePublicationRoutes,
  hasNightlyPublicationPolicy,
  hasPublisherIdempotency,
} from '../../release-control-plane-policy.ts';
import { assertDeepEqualJson } from '../assertions.ts';
import {
  publisherReconcileAdmissionContract,
  standardLatestAdmissionContract,
  standardPrePublicationAdmissionContract,
} from '../../release-control-plane-policy-values.ts';

function validateReleasePublication(releaseChannel, shellPaths, validationProfile) {
  const control = releaseChannel?.release_bundle_control_plane;
  const publication = control?.publication;

  if (!hasStablePublicationRoutes(publication?.stable)) {
    throw new Error('Stable primary publication and protected same-tag installer repair must remain separate bounded manual entries');
  }
  if (!hasNightlyPublicationPolicy(publication?.nightly)) {
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

  if (!hasPublisherIdempotency(publisher)) {
    throw new Error('Release publisher must be digest-idempotent and reconcile-only after an unknown result');
  }
  assertDeepEqualJson(
    publisher?.reconcile_admission,
    publisherReconcileAdmissionContract,
    'Release publisher reconcile admission',
  );

}

export { validateReleasePublication, validateReleasePublisher };
