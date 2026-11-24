import {
  authorityMode,
  descriptor,
  descriptorMatches,
  exact,
  objectDigest,
  promotionTags,
  record,
  text,
  validateWebuiStablePromotionAdmission,
  type JsonRecord,
} from './admission.ts';

type PromotionDecision = 'idempotent' | 'write_once' | 'conflict' | 'prestate_unknown';

export function decideWebuiStablePromotion(
  admission: JsonRecord,
  currentStableInput: JsonRecord,
  currentLatestInput: JsonRecord,
): JsonRecord {
  admission = validateWebuiStablePromotionAdmission(admission);
  const mode = authorityMode(admission.authority_mode);
  const target = record(admission.target, 'admission.target');
  if (JSON.stringify(target.promotion_tags) !== JSON.stringify(promotionTags(mode))) {
    throw new Error('admission target promotion tags do not match the authority mode.');
  }
  const expected = record(admission.expected_prestate, 'admission.expected_prestate');
  const expectedStable = record(expected.stable, 'admission.expected_prestate.stable');
  const expectedLatest = record(expected.latest, 'admission.expected_prestate.latest');
  const currentStable = descriptor(
    currentStableInput,
    text(target.stable_ref, 'target stable ref'),
    'current Stable readback',
  );
  const currentLatest = descriptor(
    currentLatestInput,
    text(target.latest_ref, 'target latest ref'),
    'current Latest readback',
  );
  const stableMatchesExpected = descriptorMatches(currentStable, expectedStable);
  const latestMatchesExpected = descriptorMatches(currentLatest, expectedLatest);
  const expectedMatchesCurrent = stableMatchesExpected && latestMatchesExpected;
  let decision: PromotionDecision;
  let writeCount = 0;
  if (currentStable.status === 'unknown' || currentLatest.status === 'unknown') {
    decision = 'prestate_unknown';
  } else if (
    currentLatest.status === 'present'
    && currentLatest.digest === target.digest
    && (
      (mode === 'independent_stable'
        && currentStable.status === 'present'
        && currentStable.digest === target.digest)
      || (mode === 'independent_preview' && stableMatchesExpected)
    )
  ) {
    decision = 'idempotent';
  } else if (expectedMatchesCurrent) {
    decision = 'write_once';
    writeCount = 1;
  } else {
    decision = 'conflict';
  }
  const authority = {
    admission_input_digest: admission.input_digest,
    stable_ref: target.stable_ref,
    latest_ref: target.latest_ref,
    target_digest: target.digest,
    authority_mode: mode,
    promotion_tags: promotionTags(mode),
    expected_prestate: expected,
    observed_prestate: {
      stable: { status: currentStable.status, digest: currentStable.digest },
      latest: { status: currentLatest.status, digest: currentLatest.digest },
    },
    decision,
    authorized_tag_attempts: writeCount,
  };
  return {
    schema: 'opl_app_webui_stable_promotion_decision.v2',
    status: decision === 'idempotent' || decision === 'write_once' ? 'admitted' : 'rejected',
    decision,
    write_performed: false,
    input_digest: objectDigest(authority),
    ...authority,
  };
}

export function writeWebuiStablePromotionReceipt(input: {
  admission: JsonRecord;
  decision: JsonRecord;
  mutation: JsonRecord;
  readbacks: JsonRecord;
  latestReadbacks: JsonRecord;
  anonymousReadback: JsonRecord;
  latestAnonymousReadback: JsonRecord;
}): JsonRecord {
  const admission = validateWebuiStablePromotionAdmission(input.admission);
  exact(input.decision.schema, 'opl_app_webui_stable_promotion_decision.v2', 'decision schema');
  exact(input.decision.admission_input_digest, admission.input_digest, 'decision.admission_input_digest');
  const mode = authorityMode(admission.authority_mode);
  const target = record(admission.target, 'admission.target');
  const expected = record(admission.expected_prestate, 'admission.expected_prestate');
  const expectedStable = record(expected.stable, 'admission.expected_prestate.stable');
  const decision = text(input.decision.decision, 'decision.decision') as PromotionDecision;
  const attemptCount = Number(input.mutation.attempt_count);
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 0 || attemptCount > 1) {
    throw new Error('mutation attempt_count must be zero or one.');
  }
  const readbacks = input.readbacks;
  exact(readbacks.schema, 'opl_app_webui_stable_reconcile_readbacks.v1', 'readbacks schema');
  if (!Array.isArray(readbacks.observations) || readbacks.observations.length > 3) {
    throw new Error('bounded reconcile must contain at most three observations.');
  }
  const observations = readbacks.observations.map((value: unknown, index: number) =>
    descriptor(value, target.stable_ref, `readbacks[${index}]`));
  const latestReadbacks = input.latestReadbacks;
  exact(latestReadbacks.schema, 'opl_app_webui_stable_reconcile_readbacks.v1', 'latest readbacks schema');
  if (!Array.isArray(latestReadbacks.observations) || latestReadbacks.observations.length > 3) {
    throw new Error('bounded Latest reconcile must contain at most three observations.');
  }
  const latestObservations = latestReadbacks.observations.map((value: unknown, index: number) =>
    descriptor(value, target.latest_ref, `latestReadbacks[${index}]`));
  const anonymous = descriptor(input.anonymousReadback, target.stable_ref, 'anonymous final readback');
  const latestAnonymous = descriptor(
    input.latestAnonymousReadback,
    target.latest_ref,
    'anonymous Latest final readback',
  );
  const stableFinalObserved = mode === 'independent_stable'
    ? anonymous.status === 'present' && anonymous.digest === target.digest
    : descriptorMatches(anonymous, expectedStable);
  const latestFinalObserved =
    latestAnonymous.status === 'present' && latestAnonymous.digest === target.digest;
  const targetObserved = stableFinalObserved && latestFinalObserved;
  const boundedStableObserved = observations.some((entry) =>
    mode === 'independent_stable'
      ? entry.status === 'present' && entry.digest === target.digest
      : descriptorMatches(entry, expectedStable));
  const boundedLatestObserved = latestObservations.some(
    (entry) => entry.status === 'present' && entry.digest === target.digest,
  );
  const boundedTargetObserved = boundedStableObserved && boundedLatestObserved;
  let status: 'complete' | 'idempotent' | 'reconciled_complete' | 'outcome_unknown' | 'failed';
  if (decision === 'idempotent') {
    if (attemptCount !== 0) throw new Error('idempotent decision cannot perform a tag mutation.');
    status = targetObserved ? 'idempotent' : 'failed';
  } else if (decision === 'write_once') {
    if (attemptCount === 0 && input.mutation.status === 'not_attempted') {
      status = 'failed';
    } else if (attemptCount !== 1) {
      throw new Error('write_once decision permits zero pre-mutation failure attempts or exactly one tag attempt.');
    } else if (targetObserved && boundedTargetObserved && input.mutation.status === 'accepted') {
      status = 'complete';
    } else if (
      targetObserved
      && boundedTargetObserved
      && input.mutation.status === 'unknown'
    ) {
      status = 'reconciled_complete';
    } else {
      status = 'outcome_unknown';
    }
  } else {
    if (attemptCount !== 0) throw new Error('rejected CAS decision cannot perform a tag mutation.');
    status = 'failed';
  }
  const evidence = {
    authority_mode: admission.authority_mode,
    classification: admission.classification,
    admission_input_digest: admission.input_digest,
    decision_input_digest: input.decision.input_digest,
    operator_authorization: admission.operator_authorization,
    carrier_follower: admission.carrier_follower,
    promotion_executor: admission.promotion_executor,
    release: admission.release,
    target,
    compare_and_swap: {
      decision,
      expected_prestate: admission.expected_prestate,
      observed_prestate: input.decision.observed_prestate,
      promotion_tags: promotionTags(mode),
      tag_attempt_count: attemptCount,
      second_tag_attempted: false,
    },
    mutation: input.mutation,
    reconcile: {
      maximum_readbacks: 3,
      performed_readbacks: Math.max(observations.length, latestObservations.length),
      stable_expected_state_observed: boundedStableObserved,
      latest_target_observed: boundedLatestObserved,
    },
    anonymous_readback: {
      stable: {
        status: anonymous.status,
        digest: anonymous.digest,
      },
      latest: {
        status: latestAnonymous.status,
        digest: latestAnonymous.digest,
      },
      logout_before_readback: input.anonymousReadback.logout_before_readback === true,
      stable_unchanged: mode === 'independent_preview'
        ? stableFinalObserved
        : null,
    },
  };
  if (status !== 'failed' && status !== 'outcome_unknown') {
    if (
      evidence.anonymous_readback.logout_before_readback !== true
      || input.latestAnonymousReadback.logout_before_readback !== true
      || !targetObserved
    ) {
      status = attemptCount === 1 ? 'outcome_unknown' : 'failed';
    }
  }
  return {
    schema: 'opl_app_webui_stable_promotion_receipt.v5',
    status,
    mutation_performed: attemptCount === 1,
    retry_allowed: false,
    input_digest: objectDigest(evidence),
    ...evidence,
  };
}
