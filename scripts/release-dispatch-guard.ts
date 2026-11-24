#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import {
  buildPostDispatchReconcile,
  buildPreNonceDispatchGuard,
  verifyPreDispatchAuthorityEvidence,
} from './release-dispatch-guard/nonce-guards.ts';

export {
  defaultIdentityWindowMs,
  createdAtClockSkewMs,
  ownerRunParser,
} from './release-dispatch-guard/types.ts';
export type {
  BoundedReadResult,
  CommandResult,
  CommandRunner,
  OwnerRunIdentity,
  OwnerRunsResult,
  OwnerWorkflowRun,
  PostDispatchReconcileInput,
  PreNonceGuardInput,
  ReadFailureCode,
  ReadFailureKind,
  UniqueOwnerRunResult,
  WireRefResult,
} from './release-dispatch-guard/types.ts';
export {
  classifyReadFailure,
  readOwnerWorkflowRuns,
  runBoundedReadOnly,
} from './release-dispatch-guard/owner-reads.ts';
export {
  extractUniqueOwnerWorkflowRun,
  resolveGitWireRef,
} from './release-dispatch-guard/wire-refs.ts';
export {
  buildPostDispatchReconcile,
  buildPreNonceDispatchGuard,
  evaluateFailureFingerprintGuard,
  verifyPreDispatchAuthorityEvidence,
} from './release-dispatch-guard/nonce-guards.ts';
export type { FailureFingerprintGuard } from './release-dispatch-guard/nonce-guards.ts';


function requiredOption(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing required option --${name}.`);
  return value.trim();
}

function writeResult(output: string | undefined, value: unknown): void {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (output) {
    const outputPath = path.resolve(output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialized, 'utf8');
  }
  process.stdout.write(serialized);
}

function isMainModule(): boolean {
  return import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
}

if (isMainModule()) {
  try {
    const command = process.argv[2];
    const { values } = parseArgs({
      args: process.argv.slice(3),
      options: {
        workflow: { type: 'string' },
        'expected-app-sha': { type: 'string' },
        'expected-shell-sha': { type: 'string' },
        'expected-framework-sha': { type: 'string' },
        'expected-objective-fingerprint': { type: 'string' },
        'expected-operation-id': { type: 'string' },
        'source-gate-report': { type: 'string' },
        'pre-nonce-guard-report': { type: 'string' },
        'current-run-id': { type: 'string' },
        'authority-id': { type: 'string' },
        'operation-id': { type: 'string' },
        'prior-failure-fingerprint': { type: 'string' },
        'current-failure-fingerprint': { type: 'string' },
        'operation-started-at': { type: 'string' },
        'observed-at': { type: 'string' },
        output: { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    });
    let result:
      | ReturnType<typeof buildPreNonceDispatchGuard>
      | ReturnType<typeof verifyPreDispatchAuthorityEvidence>
      | ReturnType<typeof buildPostDispatchReconcile>;
    if (command === 'preflight') {
      result = buildPreNonceDispatchGuard({
        workflow: requiredOption(values.workflow, 'workflow'),
        expectedAppSha: requiredOption(values['expected-app-sha'], 'expected-app-sha'),
        expectedShellSha: requiredOption(values['expected-shell-sha'], 'expected-shell-sha'),
        expectedFrameworkSha: requiredOption(values['expected-framework-sha'], 'expected-framework-sha'),
        sourceGateReport: JSON.parse(fs.readFileSync(
          path.resolve(requiredOption(values['source-gate-report'], 'source-gate-report')),
          'utf8',
        )),
        currentRunId: typeof values['current-run-id'] === 'string'
          ? values['current-run-id']
          : undefined,
        authorityId: typeof values['authority-id'] === 'string'
          ? values['authority-id']
          : undefined,
        operationId: typeof values['operation-id'] === 'string'
          ? values['operation-id']
          : undefined,
        priorFailureFingerprint: typeof values['prior-failure-fingerprint'] === 'string'
          ? JSON.parse(fs.readFileSync(path.resolve(values['prior-failure-fingerprint']), 'utf8'))
          : undefined,
        currentFailureFingerprint: typeof values['current-failure-fingerprint'] === 'string'
          ? JSON.parse(fs.readFileSync(path.resolve(values['current-failure-fingerprint']), 'utf8'))
          : undefined,
      });
    } else if (command === 'verify-evidence') {
      result = verifyPreDispatchAuthorityEvidence({
        expectedAppSha: requiredOption(values['expected-app-sha'], 'expected-app-sha'),
        expectedShellSha: requiredOption(values['expected-shell-sha'], 'expected-shell-sha'),
        expectedFrameworkSha: requiredOption(values['expected-framework-sha'], 'expected-framework-sha'),
        expectedObjectiveFingerprint: requiredOption(
          values['expected-objective-fingerprint'],
          'expected-objective-fingerprint',
        ),
        expectedOperationId: requiredOption(values['expected-operation-id'], 'expected-operation-id'),
        sourceGateReport: JSON.parse(fs.readFileSync(
          path.resolve(requiredOption(values['source-gate-report'], 'source-gate-report')),
          'utf8',
        )),
        preNonceGuardReport: JSON.parse(fs.readFileSync(
          path.resolve(requiredOption(values['pre-nonce-guard-report'], 'pre-nonce-guard-report')),
          'utf8',
        )),
      });
    } else if (command === 'reconcile') {
      result = buildPostDispatchReconcile({
        workflow: requiredOption(values.workflow, 'workflow'),
        headSha: requiredOption(values['expected-app-sha'], 'expected-app-sha'),
        operationStartedAt: requiredOption(values['operation-started-at'], 'operation-started-at'),
        observedAt: typeof values['observed-at'] === 'string' ? values['observed-at'] : undefined,
        mutationInvocationCount: 1,
      });
    } else {
      throw new Error('Usage: release-dispatch-guard.ts <preflight|verify-evidence|reconcile> [options].');
    }
    writeResult(values.output, result);
    if (!['passed', 'identified'].includes(result.status)) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
