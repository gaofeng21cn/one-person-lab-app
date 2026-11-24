import fs from 'node:fs';
import path from 'node:path';
import { numberField, stringField } from '../release-json-helpers.ts';
import {
  readReceipt,
  receiptFileSha256,
  validatePromotionSagaReceipt,
} from '../release-saga-receipts.ts';
import {
  readStableReleaseSession,
  stableReleaseSessionIdentity,
  type StableReleaseSession,
} from '../stable-release-session.ts';
import { sourceStatus } from './summary-timing.ts';
import type { Decision, JobSummary, JsonRecord, Options, StableTerminalEvidence, RunTiming } from './types.ts';

function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function runDatabaseId(options: Options, run: JsonRecord): string | null {
  if (options.runId) return options.runId;
  const stringId = stringField(run, 'databaseId') ?? stringField(run, 'id');
  if (stringId) return stringId;
  const numberId = numberField(run, 'databaseId') ?? numberField(run, 'id');
  return numberId === null ? null : String(numberId);
}

function stableSessionRoutes() {
  return {
    status: 'opl release status --bundle <sha256:digest> --store <directory>',
    resume: [
      'manual handoff only:',
      'select Stable operation resume_standard with the exact Framework portable checkpoint;',
      'this diagnostics artifact cannot authorize or execute release mutation',
    ].join(' '),
  };
}

function expectedPromotionSagaArtifactName(session: StableReleaseSession): string {
  return `opl-promotion-saga-receipt-${session.version}-${session.id.slice('sha256:'.length)}`;
}

export function buildStableTerminalEvidence(options: Options, run: JsonRecord): StableTerminalEvidence {
  const routes = stableSessionRoutes();
  const base = {
    authority: 'framework_release_checkpoint_only' as const,
    diagnostics_only: true as const,
    stable_session_path: options.stableSessionPath || null,
    promotion_saga_receipt_path: options.promotionSagaReceiptPath || null,
    stable_session_id: null,
    session_revision: null,
    session_phase: null,
    observed_run_role: null,
    published: false,
    standard_terminal: false,
    routes,
  };
  if (!options.stableSessionPath && !options.promotionSagaReceiptPath) {
    return {
      ...base,
      status: 'unavailable',
      errors: [
        'Historical App session receipts were not supplied; closeout artifact observations remain diagnostics only.',
      ],
    };
  }

  const errors: string[] = [];
  if (!options.stableSessionPath) errors.push('canonical stable session path is missing');
  if (!options.promotionSagaReceiptPath) errors.push('exact promotion saga receipt path is missing');
  if (options.stableSessionPath && !fs.existsSync(options.stableSessionPath)) errors.push('canonical stable session file is missing');
  if (options.promotionSagaReceiptPath && !fs.existsSync(options.promotionSagaReceiptPath)) errors.push('promotion saga receipt file is missing');
  if (options.stableSessionPath && fs.existsSync(`${options.stableSessionPath}.lock`)) {
    errors.push('canonical stable session has an active or unrecovered lock');
  }
  if (errors.length > 0) return { ...base, status: 'invalid', errors };

  let session: StableReleaseSession;
  let receipt: unknown;
  try {
    session = readStableReleaseSession(options.stableSessionPath);
  } catch (error) {
    return { ...base, status: 'invalid', errors: [`canonical stable session is unreadable: ${error instanceof Error ? error.message : String(error)}`] };
  }
  try {
    receipt = readReceipt(options.promotionSagaReceiptPath);
  } catch (error) {
    return {
      ...base,
      stable_session_id: session.id,
      session_revision: session.revision,
      session_phase: session.phase,
      status: 'invalid',
      errors: [`promotion saga receipt is unreadable: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const observedRunId = runDatabaseId(options, run);
  const observedStatus = stringField(run, 'status') ?? 'unknown';
  const observedConclusion = stringField(run, 'conclusion') ?? 'unknown';
  const observedHeadSha = stringField(run, 'headSha') ?? stringField(run, 'head_sha');
  const appSha = session.cohort_plan?.cohort_lock?.app?.resolved_sha;
  const sourceRunId = session.release_run?.id;
  const promotionRunId = session.promotion_run?.id;
  const observedRole = observedRunId && observedRunId === sourceRunId
    ? 'source_release'
    : observedRunId && observedRunId === promotionRunId
      ? 'promotion'
      : null;

  if (session.schema !== 'opl_app_stable_release_session.v3') errors.push(`stable session schema is ${session.schema}`);
  if (!Number.isSafeInteger(session.revision) || session.revision < 1) errors.push('stable session revision is not durably persisted');
  if (session.id !== stableReleaseSessionIdentity(session.cohort_plan)) {
    errors.push('stable session id does not match its frozen cohort identity');
  }
  if (session.version !== options.version || session.cohort_plan.version !== options.version) errors.push('stable session version does not match closeout version');
  if (session.repo !== options.repo) errors.push('stable session repository does not match closeout repository');
  if (!/^\d+$/.test(sourceRunId ?? '') || session.release_run.conclusion !== 'success') {
    errors.push('stable session source release run is not exact and successful');
  }
  if (!/^\d+$/.test(promotionRunId ?? '') || session.promotion_run.conclusion !== 'success') {
    errors.push('stable session promotion run is not exact and successful');
  }
  if (!observedRole) errors.push('observed workflow run is not bound to the stable session source or promotion run');
  if (observedStatus !== 'completed' || observedConclusion !== 'success') {
    errors.push(`observed ${observedRole ?? 'unbound'} run is ${observedStatus}/${observedConclusion}, not completed/success`);
  }
  if (observedRole === 'source_release' && observedHeadSha !== appSha) {
    errors.push('observed source release run head SHA does not match the frozen artifact App SHA');
  }
  const promotionAttempt = [...(session.mutation_attempts ?? [])].reverse().find((attempt) =>
    attempt.mutation === 'promotion_dispatch'
    && attempt.workflow === 'desktop-release-promote.yml'
    && attempt.artifact_app_sha === appSha
    && attempt.events.some((event) => event.run_id === promotionRunId));
  if (!promotionAttempt || promotionAttempt.events.at(-1)?.state !== 'succeeded') {
    errors.push('stable session has no succeeded durable promotion attempt bound to the exact promotion run');
  }
  if (observedRole === 'promotion' && observedHeadSha !== promotionAttempt?.controller_workflow_sha) {
    errors.push('observed promotion run head SHA does not match the durable controller workflow SHA');
  }
  if (!['awaiting_local_activation', 'standard_stable_terminal', 'addon_train_terminal'].includes(session.phase)) {
    errors.push(`stable session phase ${session.phase} is not publication-complete`);
  }

  const sessionReceipt = session.receipts?.promotion_saga;
  if (!sessionReceipt) {
    errors.push('stable session has no promotion saga receipt binding');
  } else {
    if (sessionReceipt.ref !== expectedPromotionSagaArtifactName(session)) {
      errors.push('stable session promotion saga receipt ref is not the canonical artifact identity');
    }
    const receiptDigest = receiptFileSha256(options.promotionSagaReceiptPath);
    if (sessionReceipt.sha256 !== receiptDigest) errors.push('promotion saga receipt bytes do not match the digest bound by the stable session');
  }
  errors.push(...validatePromotionSagaReceipt(receipt, {
    stableSessionId: session.id,
    version: session.version,
  }));

  const historicalReceiptsValid = errors.length === 0;
  return {
    ...base,
    stable_session_id: session.id,
    session_revision: session.revision,
    session_phase: session.phase,
    observed_run_role: observedRole,
    status: historicalReceiptsValid ? 'historical_receipts_valid' : 'invalid',
    published: false,
    standard_terminal: false,
    errors,
  };
}

export function buildDecision(inputs: {
  options: Options;
  run: JsonRecord;
  candidate: JsonRecord | null;
  candidatePath: string | null;
  readiness: JsonRecord | null;
  remote: JsonRecord | null;
  preflight: JsonRecord | null;
  jobs: JobSummary;
  terminalEvidence: StableTerminalEvidence;
}): Decision {
  const runStatus = stringField(inputs.run, 'status') ?? 'unknown';
  const conclusion = stringField(inputs.run, 'conclusion') ?? 'unknown';
  const candidateStatus = sourceStatus(inputs.candidate);
  const readinessStatus = sourceStatus(inputs.readiness);
  const tag = `v${inputs.options.version}`;

  if (runStatus !== 'completed') {
    return {
      next_action: 'inspect_framework_bundle_status',
      reason: `Observed source run status is ${runStatus}; historical App observations cannot authorize any release transition.`,
      command: inputs.terminalEvidence.routes.status,
      routes: inputs.terminalEvidence.routes,
      diagnostics_only: true,
      mutation_authorized: false,
    };
  }
  if (candidateStatus === 'blocked') {
    return {
      next_action: 'inspect_historical_candidate_blockers',
      reason: 'Historical candidate evidence is blocked; inspect it without treating it as Framework state.',
      command: `jq '.blocked_reasons, .required_gate_failures' ${path.join(inputs.options.artifactsDir, `release-candidate-record-${inputs.options.version}`, 'release-candidate-record.json')}`,
      diagnostics_only: true,
      mutation_authorized: false,
      routes: inputs.terminalEvidence.routes,
    };
  }
  if (readinessStatus === 'failed') {
    return {
      next_action: 'inspect_historical_readiness_failures',
      reason: 'Readiness summary failed; inspect failed_required_gates before job logs.',
      command: `jq '.failed_required_gates' ${path.join(inputs.options.artifactsDir, `release-readiness-summary-${inputs.options.version}`, 'release-readiness-summary.json')}`,
      diagnostics_only: true,
      mutation_authorized: false,
      routes: inputs.terminalEvidence.routes,
    };
  }
  if (inputs.jobs.failed_jobs.length > 0 || conclusion !== 'success') {
    return {
      next_action: 'inspect_failed_jobs',
      reason: `Run conclusion is ${conclusion}; structured summaries are incomplete or inconclusive.`,
      command: `gh run view ${inputs.options.runId} --repo ${inputs.options.repo} --log-failed`,
      diagnostics_only: true,
      mutation_authorized: false,
      routes: inputs.terminalEvidence.routes,
    };
  }
  return {
    next_action: 'inspect_historical_release_evidence',
    reason: `Run ${tag} completed; historical candidate status is ${candidateStatus} and is non-authoritative.`,
    command: `gh run download ${inputs.options.runId} --repo ${inputs.options.repo} --name release-candidate-record-${inputs.options.version} --dir ${inputs.options.artifactsDir}`,
    diagnostics_only: true,
    mutation_authorized: false,
    routes: inputs.terminalEvidence.routes,
  };
}

export function monitorState(input: {
  run: { status: string | null; conclusion: string | null };
  decision: JsonRecord;
  jobs: JobSummary;
  terminalEvidence: StableTerminalEvidence;
}): 'running' | 'failed' | 'diagnostics_only' {
  const runStatus = input.run.status ?? 'unknown';
  const conclusion = input.run.conclusion ?? 'unknown';
  const nextAction = stringField(input.decision, 'next_action') ?? 'unknown';
  if (runStatus !== 'completed') return 'running';
  if (
    nextAction === 'inspect_historical_candidate_blockers'
    || nextAction === 'inspect_historical_readiness_failures'
    || nextAction === 'inspect_failed_jobs'
    || input.jobs.failed_jobs.length > 0
  ) {
    return 'failed';
  }
  if (conclusion !== 'success') return 'failed';
  return 'diagnostics_only';
}
