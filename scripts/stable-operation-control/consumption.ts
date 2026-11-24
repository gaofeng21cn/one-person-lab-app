import {
  nonce,
  objectDigest,
  operationId,
  record,
  runAttempt,
  runId,
} from './schema.ts';
import type { StableOperationConsumption } from './schema.ts';
import {
  validateStableOperationControl,
} from './authority.ts';

export function consumeStableOperationControl(input: {
  control: unknown;
  operationId: string;
  runId: string;
  runAttempt: number;
  nonce: string;
}): StableOperationConsumption {
  const control = validateStableOperationControl(input.control);
  if (operationId(input.operationId) !== control.operation_id) throw new Error('Operation consumption operation_id does not match control.');
  if (runId(input.runId, 'run_id') !== control.run_id) throw new Error('Operation consumption run_id does not match control.');
  if (runAttempt(input.runAttempt, 'run_attempt') !== control.run_attempt) {
    throw new Error('Operation consumption run_attempt does not match control.');
  }
  if (nonce(input.nonce, 'nonce') !== control.nonce) throw new Error('Operation consumption nonce does not match control.');
  const core = {
    schema: 'opl_app_stable_operation_consumption.v1' as const,
    status: 'consumed' as const,
    operation: 'standard' as const,
    operation_id: control.operation_id,
    control_authority_digest: control.authority_digest,
    run_id: control.run_id,
    run_attempt: 1 as const,
    nonce_digest: control.nonce_digest,
    run_authority_reconcile_digest: control.run_authority_reconcile_digest,
    consumed_once: true as const,
  };
  return { ...core, consumption_digest: objectDigest(core) };
}

export function validateStableOperationConsumption(
  value: unknown,
  controlInput: unknown,
): StableOperationConsumption {
  const control = validateStableOperationControl(controlInput);
  const consumption = record(value, 'Stable operation consumption');
  const core = {
    schema: consumption.schema,
    status: consumption.status,
    operation: consumption.operation,
    operation_id: consumption.operation_id,
    control_authority_digest: consumption.control_authority_digest,
    run_id: consumption.run_id,
    run_attempt: consumption.run_attempt,
    nonce_digest: consumption.nonce_digest,
    run_authority_reconcile_digest: consumption.run_authority_reconcile_digest,
    consumed_once: consumption.consumed_once,
  };
  if (
    core.schema !== 'opl_app_stable_operation_consumption.v1'
    || core.status !== 'consumed'
    || core.operation !== 'standard'
    || core.operation_id !== control.operation_id
    || core.control_authority_digest !== control.authority_digest
    || core.run_id !== control.run_id
    || core.run_attempt !== 1
    || core.nonce_digest !== control.nonce_digest
    || core.run_authority_reconcile_digest !== control.run_authority_reconcile_digest
    || core.consumed_once !== true
    || consumption.consumption_digest !== objectDigest(core)
  ) {
    throw new Error('Stable operation consumption does not bind one exact control record.');
  }
  return consumption as StableOperationConsumption;
}
