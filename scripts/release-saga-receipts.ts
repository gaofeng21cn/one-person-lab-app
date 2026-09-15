import fs from 'node:fs';
import { sha256File } from './build-artifact-cohort.ts';

const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^[0-9a-f]{64}$/;
const digestRefPattern = /^sha256:[0-9a-f]{64}$/;

type JsonRecord = Record<string, unknown>;

export type ReceiptExpectation = {
  stableSessionId: string;
  version: string;
  releaseCohortRef?: string;
  appSha?: string;
  shellSha?: string;
  frameworkSha?: string;
  sourceReleaseRunId?: string;
  standardVmRunId?: string;
  promotionRunId?: string;
  promotionRunAttempt?: number;
  promotionAttemptId?: string;
  controllerWorkflowSha?: string;
  ownerReceiptRef?: string;
};

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function validatePromotionSagaReceipt(value: unknown, expected: ReceiptExpectation): string[] {
  const receipt = record(value);
  if (!receipt) return ['promotion saga receipt is not an object'];
  const errors: string[] = [];
  if (receipt.schema !== 'opl_app_promotion_saga_receipt.v2') errors.push(`promotion saga schema is ${string(receipt.schema) || '<missing>'}`);
  if (receipt.status !== 'verified') errors.push(`promotion saga status is ${string(receipt.status) || '<missing>'}`);
  if (receipt.stable_session_id !== expected.stableSessionId) errors.push(`stable_session_id is ${string(receipt.stable_session_id) || '<missing>'}`);
  if (receipt.version !== expected.version) errors.push(`version is ${string(receipt.version) || '<missing>'}`);
  const release = record(receipt.release);
  if (!release || release.repo !== 'gaofeng21cn/one-person-lab-app' || release.tag !== `v${expected.version}` || release.public !== true || release.latest !== true) errors.push('final release readback is not public/latest for the expected tag');
  const provenance = record(receipt.provenance);
  if (!provenance) errors.push('promotion provenance is missing');
  else {
    if (!/^\d+$/.test(string(provenance.workflow_run_id))) errors.push('promotion workflow_run_id is invalid');
    if (provenance.workflow_run_attempt !== 1) errors.push('promotion workflow_run_attempt is not 1');
    if (!digestRefPattern.test(string(provenance.release_attempt_id))) errors.push('promotion release_attempt_id is invalid');
    if (!shaPattern.test(string(provenance.controller_workflow_sha))) errors.push('promotion controller_workflow_sha is invalid');
    if (!/^\d+$/.test(string(provenance.source_release_run_id))) errors.push('promotion source_release_run_id is invalid');
    if (!/^\d+$/.test(string(provenance.standard_qualification_run_id))) errors.push('promotion standard_qualification_run_id is invalid');
    for (const [field, expectedValue] of [
      ['workflow_run_id', expected.promotionRunId],
      ['workflow_run_attempt', expected.promotionRunAttempt],
      ['release_attempt_id', expected.promotionAttemptId],
      ['controller_workflow_sha', expected.controllerWorkflowSha],
      ['source_release_run_id', expected.sourceReleaseRunId],
      ['standard_qualification_run_id', expected.standardVmRunId],
    ] as const) {
      if (expectedValue !== undefined && provenance[field] !== expectedValue) {
        errors.push(`promotion provenance ${field} does not match the exact session identity`);
      }
    }
  }
  const cohort = record(receipt.cohort);
  if (!cohort) errors.push('promotion cohort is missing');
  else {
    for (const [field, expectedValue] of [
      ['release_cohort_ref', expected.releaseCohortRef],
      ['app_sha', expected.appSha],
      ['shell_sha', expected.shellSha],
      ['framework_sha', expected.frameworkSha],
    ] as const) {
      if (expectedValue !== undefined && cohort[field] !== expectedValue) {
        errors.push(`promotion cohort ${field} does not match the exact session identity`);
      }
    }
    if (!digestRefPattern.test(string(cohort.release_cohort_ref))) errors.push('promotion release_cohort_ref is invalid');
    for (const field of ['app_sha', 'shell_sha', 'framework_sha'] as const) {
      if (!shaPattern.test(string(cohort[field]))) errors.push(`promotion ${field} is invalid`);
    }

  }
  const releaseOwner = record(receipt.release_owner);
  if (!releaseOwner || !string(releaseOwner.receipt_ref)) errors.push('promotion release owner receipt ref is missing');
  else if (expected.ownerReceiptRef && releaseOwner.receipt_ref !== expected.ownerReceiptRef) {
    errors.push('promotion release owner receipt ref does not match the exact session identity');
  }
  const distribution = record(receipt.distribution);
  if (!distribution || !string(distribution.receipt_ref) || !digestPattern.test(string(distribution.receipt_sha256))) errors.push('distribution receipt identity is invalid');
  const activation = record(receipt.homebrew_activation);
  if (!activation || !string(activation.receipt_ref) || !digestPattern.test(string(activation.receipt_sha256)) || !/^\d+$/.test(string(activation.standard_vm_run_id))) errors.push('Homebrew activation receipt identity is invalid');
  else if (expected.promotionRunId && activation.standard_vm_run_id !== expected.promotionRunId) {
    errors.push('Homebrew activation run does not match the exact promotion workflow run');
  }
  const stages = Array.isArray(receipt.stages) ? receipt.stages.map(record) : [];
  const expectedStages = ['release_public_nonlatest', 'distribution_synced', 'homebrew_verified', 'latest_activated'];
  if (stages.length !== expectedStages.length || expectedStages.some((id, index) => stages[index]?.id !== id || stages[index]?.status !== 'verified')) errors.push('promotion saga stages are incomplete or out of order');
  return errors;
}

export function receiptFileSha256(filePath: string): string {
  return sha256File(filePath);
}

export function readReceipt(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
}
