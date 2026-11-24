#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  canonicalJson,
  digest,
  exactSha,
  objectiveFingerprint,
  operationId,
} from './stable-operation-control/schema.ts';
import {
  stableOperationCriticalBlobPaths,
  stableOperationCriticalBlobs,
  stableOperationIdForFrozenCohort,
} from './stable-operation-control/critical-blobs.ts';
import {
  bindStableOperationAuthority,
  createStableOperationAuthority,
  createStableOperationControl,
  decodeStableOperationAuthorityCarrier,
  encodeStableOperationAuthorityCarrier,
  materializeStableOperationAuthorityEvidence,
  validateStableOperationAuthority,
  validateStableOperationAuthorityExecutorBinding,
  validateStableOperationAuthorityRuntimeBinding,
  validateStableOperationControl,
  validateStableOperationRuntimeBinding,
} from './stable-operation-control/authority.ts';
import {
  consumeStableOperationControl,
  validateStableOperationConsumption,
} from './stable-operation-control/consumption.ts';

export {
  bindStableOperationAuthority,
  canonicalJson,
  consumeStableOperationControl,
  createStableOperationAuthority,
  createStableOperationControl,
  decodeStableOperationAuthorityCarrier,
  encodeStableOperationAuthorityCarrier,
  materializeStableOperationAuthorityEvidence,
  stableOperationCriticalBlobPaths,
  stableOperationCriticalBlobs,
  stableOperationIdForFrozenCohort,
  validateStableOperationAuthority,
  validateStableOperationAuthorityExecutorBinding,
  validateStableOperationAuthorityRuntimeBinding,
  validateStableOperationConsumption,
  validateStableOperationControl,
  validateStableOperationRuntimeBinding,
};

export type {
  StableOperationAuthority,
  StableOperationConsumption,
  StableOperationControl,
} from './stable-operation-control/schema.ts';

function readJson(filePath: string): unknown {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`Expected one non-empty regular JSON file: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown;
}

function writeExclusiveJson(filePath: string, value: unknown): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const descriptor = fs.openSync(resolved, 'wx');
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
  } finally {
    fs.closeSync(descriptor);
  }
}

function required(value: string | undefined, flag: string): string {
  if (!value?.trim()) throw new Error(`Missing --${flag}.`);
  return value.trim();
}

function jsonArrayOption(value: string | undefined, flag: string): unknown[] {
  if (value === undefined || value === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`--${flag} must contain one JSON array.`);
  }
  if (!Array.isArray(parsed)) throw new Error(`--${flag} must contain one JSON array.`);
  return parsed;
}

function main(argv: string[]): void {
  const command = argv[0];
  const { values } = parseArgs({
    args: argv.slice(1),
    strict: true,
    options: {
      'operation-id': { type: 'string' },
      actor: { type: 'string' },
      'run-id': { type: 'string' },
      'run-attempt': { type: 'string' },
      nonce: { type: 'string' },
      'app-sha': { type: 'string' },
      'shell-sha': { type: 'string' },
      'framework-sha': { type: 'string' },
      'desktop-additional-platforms': { type: 'string' },
      'critical-blobs': { type: 'string' },
      'source-gate-digest': { type: 'string' },
      'pre-nonce-guard-digest': { type: 'string' },
      'run-authority-reconcile-digest': { type: 'string' },
      authority: { type: 'string' },
      'authority-digest': { type: 'string' },
      'authority-id': { type: 'string' },
      issuer: { type: 'string' },
      'issued-at': { type: 'string' },
      'expires-at': { type: 'string' },
      'objective-fingerprint': { type: 'string' },
      now: { type: 'string' },
      control: { type: 'string' },
      input: { type: 'string' },
      output: { type: 'string' },
      'app-root': { type: 'string' },
      'source-gate': { type: 'string' },
      'pre-nonce-guard': { type: 'string' },
      'run-authority-reconcile': { type: 'string' },
      'source-gate-output': { type: 'string' },
      'pre-nonce-guard-output': { type: 'string' },
      'expected-run-id': { type: 'string' },
      'expected-actor': { type: 'string' },
      'expected-executor-sha': { type: 'string' },
      'expected-app-sha': { type: 'string' },
      'expected-shell-sha': { type: 'string' },
      'expected-framework-sha': { type: 'string' },
    },
  });
  if (command === 'create-authority') {
    const authority = createStableOperationAuthority({
      authorityId: required(values['authority-id'], 'authority-id'),
      operationId: required(values['operation-id'], 'operation-id'),
      issuer: required(values.issuer, 'issuer'),
      issuedAt: required(values['issued-at'], 'issued-at'),
      expiresAt: required(values['expires-at'], 'expires-at'),
      objectiveFingerprint: required(values['objective-fingerprint'], 'objective-fingerprint'),
      nonce: required(values.nonce, 'nonce'),
      appSha: required(values['app-sha'], 'app-sha'),
      shellSha: required(values['shell-sha'], 'shell-sha'),
      frameworkSha: required(values['framework-sha'], 'framework-sha'),
      desktopAdditionalPlatforms: jsonArrayOption(
        values['desktop-additional-platforms'],
        'desktop-additional-platforms',
      ),
      criticalBlobs: readJson(required(values['critical-blobs'], 'critical-blobs')),
      sourceGate: readJson(required(values['source-gate'], 'source-gate')),
      preNonceGuard: readJson(required(values['pre-nonce-guard'], 'pre-nonce-guard')),
    });
    writeExclusiveJson(required(values.output, 'output'), authority);
    process.stdout.write(`${JSON.stringify({ status: authority.status, authority_id: authority.authority_id, authority_digest: authority.authority_digest })}\n`);
    return;
  }
  if (command === 'encode-carrier') {
    const authority = validateStableOperationAuthority(readJson(required(values.authority, 'authority')));
    const carrier = encodeStableOperationAuthorityCarrier(authority);
    process.stdout.write(`${JSON.stringify({
      status: 'passed',
      authority_id: authority.authority_id,
      authority_digest: authority.authority_digest,
      authority_carrier: carrier,
    })}\n`);
    return;
  }
  if (command === 'decode-carrier') {
    const authority = decodeStableOperationAuthorityCarrier({
      carrier: required(values.input, 'input'),
      authorityDigest: required(values['authority-digest'], 'authority-digest'),
      authorityId: required(values['authority-id'], 'authority-id'),
    });
    writeExclusiveJson(required(values.output, 'output'), authority);
    process.stdout.write(`${JSON.stringify({
      status: 'passed',
      authority_id: authority.authority_id,
      authority_digest: authority.authority_digest,
    })}\n`);
    return;
  }
  if (command === 'materialize-evidence') {
    const evidence = materializeStableOperationAuthorityEvidence({
      authority: readJson(required(values.authority, 'authority')),
      sourceGateOutput: required(values['source-gate-output'], 'source-gate-output'),
      preNonceGuardOutput: required(values['pre-nonce-guard-output'], 'pre-nonce-guard-output'),
    });
    process.stdout.write(`${JSON.stringify({ status: 'passed', ...evidence })}\n`);
    return;
  }
  if (command === 'verify-executor') {
    const authority = validateStableOperationAuthorityExecutorBinding({
      authority: readJson(required(values.authority, 'authority')),
      appRoot: required(values['app-root'], 'app-root'),
      expectedActor: required(values['expected-actor'], 'expected-actor'),
      expectedExecutorSha: required(values['expected-executor-sha'], 'expected-executor-sha'),
    });
    process.stdout.write(`${JSON.stringify({
      status: 'passed',
      authority_id: authority.authority_id,
      operation_id: authority.operation_id,
      frozen_app_sha: authority.cohort.app_sha,
      executor_app_sha: exactSha(values['expected-executor-sha'], 'expected_executor_sha'),
    })}\n`);
    return;
  }
  if (command === 'verify-authority') {
    const authority = validateStableOperationAuthority(readJson(required(values.authority, 'authority')));
    if (
      values['authority-digest'] !== undefined
      && authority.authority_digest !== digest(values['authority-digest'], 'authority-digest')
    ) {
      throw new Error('Pre-dispatch authority digest does not match the authority carrier.');
    }
    if (
      values['authority-id'] !== undefined
      && authority.authority_id !== operationId(values['authority-id'])
    ) {
      throw new Error('Pre-dispatch authority_id does not match the authority carrier.');
    }
    if (
      values['operation-id'] !== undefined
      && authority.operation_id !== operationId(values['operation-id'])
    ) {
      throw new Error('Pre-dispatch operation_id does not match the authority carrier.');
    }
    if (
      values['objective-fingerprint'] !== undefined
      && authority.objective_fingerprint !== objectiveFingerprint(values['objective-fingerprint'])
    ) {
      throw new Error('Pre-dispatch authority objective_fingerprint does not match the requested objective.');
    }
    const runtimeFlags = [
      values['app-root'],
      values['expected-actor'],
      values['expected-app-sha'],
    ];
    if (runtimeFlags.some((value) => value !== undefined)) {
      validateStableOperationAuthorityRuntimeBinding({
        authority,
        appRoot: required(values['app-root'], 'app-root'),
        expectedActor: required(values['expected-actor'], 'expected-actor'),
        expectedAppSha: required(values['expected-app-sha'], 'expected-app-sha'),
      });
    }
    process.stdout.write(`${JSON.stringify({
      status: 'passed',
      authority_id: authority.authority_id,
      operation_id: authority.operation_id,
      authority_digest: authority.authority_digest,
      cohort: authority.cohort,
    })}\n`);
    return;
  }
  if (command === 'bind') {
    const control = bindStableOperationAuthority({
      authority: readJson(required(values.authority, 'authority')),
      authorityDigest: required(values['authority-digest'], 'authority-digest'),
      actor: required(values.actor, 'actor'),
      runId: required(values['run-id'], 'run-id'),
      runAttempt: Number(required(values['run-attempt'], 'run-attempt')),
      sourceGateDigest: required(values['source-gate-digest'], 'source-gate-digest'),
      preNonceGuardDigest: required(values['pre-nonce-guard-digest'], 'pre-nonce-guard-digest'),
      runAuthorityReconcileDigest: required(
        values['run-authority-reconcile-digest'],
        'run-authority-reconcile-digest',
      ),
      now: typeof values.now === 'string' ? values.now : undefined,
    });
    writeExclusiveJson(required(values.output, 'output'), control);
    process.stdout.write(`${JSON.stringify({ status: control.status, operation_id: control.operation_id, authority_digest: control.authority_digest })}\n`);
    return;
  }
  if (command === 'consume') {
    const control = readJson(required(values.control, 'control'));
    const consumption = consumeStableOperationControl({
      control,
      operationId: required(values['operation-id'], 'operation-id'),
      runId: required(values['run-id'], 'run-id'),
      runAttempt: Number(required(values['run-attempt'], 'run-attempt')),
      nonce: required(values.nonce, 'nonce'),
    });
    writeExclusiveJson(required(values.output, 'output'), consumption);
    process.stdout.write(`${JSON.stringify({ status: consumption.status, operation_id: consumption.operation_id, consumption_digest: consumption.consumption_digest })}\n`);
    return;
  }
  if (command === 'verify') {
    const control = readJson(required(values.control, 'control'));
    if (values.input) {
      validateStableOperationConsumption(readJson(values.input), control);
    } else {
      validateStableOperationControl(control);
    }
    const runtimeFlags = [
      values['app-root'],
      values['source-gate'],
      values['pre-nonce-guard'],
      values['run-authority-reconcile'],
      values['expected-run-id'],
      values['expected-actor'],
      values['expected-app-sha'],
      values['expected-shell-sha'],
      values['expected-framework-sha'],
    ];
    if (runtimeFlags.some((value) => value !== undefined)) {
      validateStableOperationRuntimeBinding({
        control,
        appRoot: required(values['app-root'], 'app-root'),
        sourceGatePath: required(values['source-gate'], 'source-gate'),
        preNonceGuardPath: required(values['pre-nonce-guard'], 'pre-nonce-guard'),
        runAuthorityReconcilePath: required(
          values['run-authority-reconcile'],
          'run-authority-reconcile',
        ),
        expectedRunId: required(values['expected-run-id'], 'expected-run-id'),
        expectedActor: required(values['expected-actor'], 'expected-actor'),
        expectedAppSha: required(values['expected-app-sha'], 'expected-app-sha'),
        expectedShellSha: required(values['expected-shell-sha'], 'expected-shell-sha'),
        expectedFrameworkSha: required(values['expected-framework-sha'], 'expected-framework-sha'),
      });
    }
    process.stdout.write('{"status":"passed"}\n');
    return;
  }
  throw new Error('Usage: stable-operation-control.ts <create-authority|encode-carrier|decode-carrier|materialize-evidence|verify-executor|verify-authority|bind|consume|verify> ...');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
