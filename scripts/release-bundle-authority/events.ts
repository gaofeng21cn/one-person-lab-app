import fs from 'node:fs';

import { canonicalJsonBytes, FrameworkContractError } from './support.ts';
import {
  assertReleaseBundleConsumerEnvelope,
  assertReleaseBundleOperationEvent,
  sha256,
} from './contracts.ts';
import { readReleaseBundleStatus } from './operations.ts';
import {
  listReleaseBundleOperationReceipts,
  readStoredReleaseBundle,
} from './store.ts';
import type {
  ReleaseBundleCheckpointStage,
  ReleaseBundleConsumerEnvelope,
  ReleaseBundleOperationEvent,
  ReleaseBundleOperationEventNextAction,
  ReleaseBundleOperationInput,
  ReleaseBundleOperationReceipt,
} from './types.ts';

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    surface_kind: 'opl_release_bundle_operation_event.v1',
    ...details,
  });
}

function checkpointStageForReceipt(receipt: ReleaseBundleOperationReceipt): ReleaseBundleCheckpointStage {
  if (!['complete', 'idempotent'].includes(receipt.status)) return 'frozen';
  const resolvedOperation = receipt.operation === 'reconcile'
    ? receipt.details.resolved_operation
    : receipt.operation;
  if (receipt.track === 'full') {
    if (resolvedOperation === 'verify' || resolvedOperation === 'publish') return 'full_qualified';
    if (resolvedOperation === 'build') return 'full_built';
  }
  if (receipt.track === 'webui') {
    if (resolvedOperation === 'verify' || resolvedOperation === 'publish') return 'webui_qualified';
    if (resolvedOperation === 'build') return 'webui_built';
  }
  if (receipt.track === 'standard') {
    if (resolvedOperation === 'publish') return 'stable_qualified';
    if (resolvedOperation === 'verify') return 'standard_qualified';
    if (resolvedOperation === 'build') return 'standard_built';
  }
  return 'frozen';
}

function nextActionForReceipt(
  receipt: ReleaseBundleOperationReceipt,
): ReleaseBundleOperationEventNextAction {
  if (receipt.status === 'reconcile_only') return 'reconcile';
  if (receipt.status === 'upload_required') return 'publish';
  if (receipt.status === 'late_observation') return 'consumer_readback';
  if (receipt.operation === 'freeze') return 'wait_for_distinct_operation';
  if (receipt.operation === 'operation_admit') return 'build';
  if (receipt.operation === 'build') return 'verify';
  if (receipt.operation === 'verify') return 'publish';
  if (receipt.operation === 'publish' || receipt.operation === 'checkpoint_import') {
    return 'consumer_readback';
  }
  return 'none';
}

function eventFromReceipt(input: ReturnType<typeof listReleaseBundleOperationReceipts>[number]) {
  const { receipt, receiptRef, receiptSha256 } = input;
  const operationKind = receipt.operation_control?.operation_kind
    ?? (receipt.release_operation === 'append_full' ? 'append_full'
      : receipt.release_operation ? 'standard' : null);
  const core = {
    surface_kind: 'opl_release_bundle_operation_event.v1' as const,
    schema_ref: 'contracts/opl-framework/release-bundle-operation-event.schema.json' as const,
    bundle_digest: receipt.bundle_digest,
    operation_id: receipt.operation_control?.operation_id ?? null,
    operation_kind: operationKind,
    operation: receipt.operation,
    track: receipt.track,
    checkpoint_stage: checkpointStageForReceipt(receipt),
    status: receipt.status,
    next_action: nextActionForReceipt(receipt),
    deadline_at: receipt.operation_control?.operation_deadline_at ?? null,
    recorded_at: receipt.recorded_at,
    evidence: [{
      kind: 'operation_receipt' as const,
      ref: receiptRef,
      sha256: receiptSha256,
    }],
  };
  const eventId = sha256(canonicalJsonBytes(core));
  const event: ReleaseBundleOperationEvent = {
    ...core,
    event_id: eventId,
    event_idempotency_key: eventId,
  };
  assertReleaseBundleOperationEvent(event);
  return event;
}

export function readReleaseBundleEvents(input: ReleaseBundleOperationInput & {
  afterEventId?: string;
}) {
  const stored = readStoredReleaseBundle(input.bundleDigest, input.storeRoot);
  const allEvents = listReleaseBundleOperationReceipts(stored.paths).map(eventFromReceipt);
  let start = 0;
  if (input.afterEventId) {
    const cursorIndex = allEvents.findIndex((event) => event.event_id === input.afterEventId);
    if (cursorIndex < 0) {
      fail('Release Bundle event cursor does not belong to this immutable Bundle.', {
        bundle_digest: input.bundleDigest,
        after_event_id: input.afterEventId,
      });
    }
    start = cursorIndex + 1;
  }
  const events = allEvents.slice(start);
  return {
    version: 'g2' as const,
    release_bundle_events: {
      bundle_digest: input.bundleDigest,
      consumer_cursor: input.afterEventId ?? null,
      events,
      ack_boundary: events.at(-1)?.event_id ?? input.afterEventId ?? null,
      event_count: events.length,
      replay_is_idempotent: true,
      consumer_ack_is_read_only: true,
      consumer_may_dispatch: false,
    },
  };
}

function checkpointStageForTrack(input: {
  track: 'standard' | 'full';
  built: boolean;
  verified: boolean;
  published: boolean;
}): ReleaseBundleCheckpointStage {
  if (input.track === 'full') {
    if (input.verified || input.published) return 'full_qualified';
    if (input.built) return 'full_built';
    return 'frozen';
  }
  if (input.published) return 'stable_qualified';
  if (input.verified) return 'standard_qualified';
  if (input.built) return 'standard_built';
  return 'frozen';
}

function nextActionForTrack(input: {
  track: 'standard' | 'full';
  hasOperation: boolean;
  built: boolean;
  verified: boolean;
  published: boolean;
  reconcileRequired: boolean;
}): ReleaseBundleOperationEventNextAction {
  if (input.reconcileRequired) return 'reconcile';
  if (!input.hasOperation) return 'wait_for_distinct_operation';
  if (!input.built) return 'build';
  if (!input.verified) return 'verify';
  if (!input.published) return 'publish';
  return 'consumer_readback';
}

export function buildReleaseBundleConsumerEnvelope(input: ReleaseBundleOperationInput & {
  track: 'standard' | 'full';
  sourceCheckpointRunId?: string;
}) {
  if (input.track === 'full' && !/^[1-9][0-9]*$/.test(input.sourceCheckpointRunId ?? '')) {
    fail('Full consumer envelope requires the exact source checkpoint run id.', {
      track: input.track,
      source_checkpoint_run_id: input.sourceCheckpointRunId ?? null,
    });
  }
  if (input.track === 'standard' && input.sourceCheckpointRunId !== undefined) {
    fail('Standard consumer envelope cannot claim a Full source checkpoint run id.', {
      track: input.track,
      source_checkpoint_run_id: input.sourceCheckpointRunId,
    });
  }

  const stored = readStoredReleaseBundle(input.bundleDigest, input.storeRoot);
  const status = readReleaseBundleStatus(input).release_bundle_status;
  const trackStatus = status.tracks[input.track];
  const control = input.track === 'full'
    ? status.operation_controls.append_full
    : status.operation_controls.standard;
  const receiptEntries = listReleaseBundleOperationReceipts(stored.paths)
    .filter(({ receipt }) => receipt.track === input.track || receipt.track === null);
  const events = receiptEntries.map(eventFromReceipt);
  const core = {
    surface_kind: 'opl_release_bundle_consumer_envelope.v1' as const,
    schema_ref: 'contracts/opl-framework/release-bundle-consumer-envelope.schema.json' as const,
    bundle_digest: input.bundleDigest,
    release: {
      channel: stored.bundle.release.channel,
      version: stored.bundle.release.version,
      display_version: stored.bundle.release.display_version,
      updater_version: stored.bundle.release.updater_version,
      tag: stored.bundle.release.tag,
    },
    cohort: {
      app_source_commit: stored.bundle.sources.app.source_commit,
      shell_source_commit: stored.bundle.sources.shell.source_commit,
      framework_source_commit: stored.bundle.sources.framework.source_commit,
    },
    track: input.track,
    operation: control ? {
      operation_id: control.operation_id,
      operation_kind: control.operation_kind,
      deadline_at: control.operation_deadline_at,
    } : null,
    checkpoint_stage: checkpointStageForTrack({ track: input.track, ...trackStatus }),
    source_checkpoint_run_id: input.sourceCheckpointRunId ?? null,
    assets: trackStatus.assets.map(({ name, size_bytes, sha256: assetSha256 }) => ({
      name,
      size_bytes,
      sha256: assetSha256,
    })),
    qualified: trackStatus.verified,
    published: trackStatus.published,
    reconcile_required: trackStatus.reconcile_required,
    next_action: nextActionForTrack({
      track: input.track,
      hasOperation: Boolean(control),
      built: trackStatus.built,
      verified: trackStatus.verified,
      published: trackStatus.published,
      reconcileRequired: trackStatus.reconcile_required,
    }),
    latest_event_id: events.at(-1)?.event_id ?? null,
    evidence: [
      {
        kind: 'bundle' as const,
        ref: 'bundle.json',
        sha256: sha256(fs.readFileSync(stored.paths.bundle)),
      },
      ...receiptEntries.map(({ receiptRef, receiptSha256 }) => ({
        kind: 'operation_receipt' as const,
        ref: receiptRef,
        sha256: receiptSha256,
      })),
    ],
    consumer_trigger_only: true as const,
    consumer_may_dispatch: false as const,
    recovery_command: 'opl release status then exact opl release reconcile' as const,
  };
  const envelope: ReleaseBundleConsumerEnvelope = {
    ...core,
    envelope_digest: sha256(canonicalJsonBytes(core)),
  };
  assertReleaseBundleConsumerEnvelope(envelope);
  return {
    version: 'g2' as const,
    release_bundle_consumer_envelope: envelope,
  };
}
