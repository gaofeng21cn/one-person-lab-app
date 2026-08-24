#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { resolveNightlyReleaseVersion, resolveReleaseVersionIdentity } from './release-version.ts';

export type NightlyInvocation =
  | {
      mode: 'scheduled_production';
      event: 'schedule';
      authority_source: 'daily_schedule';
      confirmation: null;
      execution_path: 'scheduled_nightly';
    }
  | {
      mode: 'development_validation';
      event: 'workflow_dispatch';
      authority_source: 'user_explicit';
      confirmation: 'publish_nonlatest_nightly';
      execution_path: 'same_as_scheduled_nightly';
    };

export type NightlyReleaseRequest = {
  schema: 'opl_standard_nightly_request.v1';
  channel: 'nightly';
  quality_status: 'preview';
  build_trigger: 'automated';
  preview_kind: 'nightly';
  package_kind: 'app_standard';
  base_version: string;
  version: string;
  updater_version: string;
  tag: string;
  source: {
    app_sha: string;
    shell_sha: string;
    framework_sha: string;
  };
  actions: {
    run_id: string;
    run_attempt: '1';
  };
  invocation: NightlyInvocation;
  publication: {
    github_prerelease: true;
    make_latest: false;
    include_full: false;
    full_allowed: false;
    webui_allowed: false;
    heavy_vm_blocking: false;
    followup_workflow: '.github/workflows/release-nightly-followups.yml';
    followup_operations: ['reconcile_homebrew', 'run_sampled_vm'];
  };
  observed_same_day_versions: string[];
  request_digest: `sha256:${string}`;
};

const exactShaPattern = /^[0-9a-f]{40}$/;
const positiveIntegerPattern = /^[1-9][0-9]*$/;
const nightlyBasePattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-nightly$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;

function exactSha(value: string, label: string): string {
  if (!exactShaPattern.test(value)) {
    throw new Error(`${label} must be an exact lowercase 40-character Git SHA.`);
  }
  return value;
}

function positiveInteger(value: string, label: string): string {
  if (!positiveIntegerPattern.test(value)) throw new Error(`${label} must be a positive decimal integer.`);
  return value;
}

function resolveNightlyInvocation(input: {
  invocationMode: string;
  event: string;
  authoritySource: string;
  operatorConfirmation?: string;
}): NightlyInvocation {
  const confirmation = input.operatorConfirmation?.trim() || null;
  if (
    input.invocationMode === 'scheduled_production'
    && input.event === 'schedule'
    && input.authoritySource === 'daily_schedule'
    && confirmation === null
  ) {
    return {
      mode: 'scheduled_production',
      event: 'schedule',
      authority_source: 'daily_schedule',
      confirmation: null,
      execution_path: 'scheduled_nightly',
    };
  }
  if (
    input.invocationMode === 'development_validation'
    && input.event === 'workflow_dispatch'
    && input.authoritySource === 'user_explicit'
    && confirmation === 'publish_nonlatest_nightly'
  ) {
    return {
      mode: 'development_validation',
      event: 'workflow_dispatch',
      authority_source: 'user_explicit',
      confirmation: 'publish_nonlatest_nightly',
      execution_path: 'same_as_scheduled_nightly',
    };
  }
  throw new Error('Nightly invocation identity must be scheduled production or user-explicit development validation.');
}

function digestRequest(value: Omit<NightlyReleaseRequest, 'request_digest'>): `sha256:${string}` {
  return `sha256:${crypto.createHash('sha256').update(`${JSON.stringify(value)}\n`).digest('hex')}`;
}

export function assertNightlyRequestDigest(request: NightlyReleaseRequest): void {
  const invocation = resolveNightlyInvocation({
    invocationMode: request.invocation?.mode,
    event: request.invocation?.event,
    authoritySource: request.invocation?.authority_source,
    operatorConfirmation: request.invocation?.confirmation ?? undefined,
  });
  if (
    request.schema !== 'opl_standard_nightly_request.v1'
    || request.channel !== 'nightly'
    || request.quality_status !== 'preview'
    || request.build_trigger !== 'automated'
    || request.preview_kind !== 'nightly'
    || request.package_kind !== 'app_standard'
    || request.actions?.run_attempt !== '1'
    || request.publication?.github_prerelease !== true
    || request.publication?.make_latest !== false
    || request.publication?.include_full !== false
    || request.publication?.full_allowed !== false
    || request.publication?.webui_allowed !== false
    || request.publication?.heavy_vm_blocking !== false
    || request.publication?.followup_workflow !== '.github/workflows/release-nightly-followups.yml'
    || JSON.stringify(request.publication?.followup_operations) !== JSON.stringify([
      'reconcile_homebrew',
      'run_sampled_vm',
    ])
  ) {
    throw new Error('Nightly request must remain an attempt-one Standard-only non-Latest prerelease.');
  }
  if (JSON.stringify(request.invocation) !== JSON.stringify(invocation)) {
    throw new Error('Nightly request invocation identity is not canonical.');
  }
  if (!digestPattern.test(request.request_digest)) throw new Error('Nightly request digest is invalid.');
  const { request_digest: _digest, ...body } = request;
  if (digestRequest(body) !== request.request_digest) {
    throw new Error('Nightly request digest does not bind the exact request body.');
  }
}

export function resolveNightlyReleaseRequest(input: {
  baseVersion: string;
  existingRefs: Iterable<string>;
  appRef: string;
  shellRef: string;
  frameworkRef: string;
  actionsRunId: string;
  actionsRunAttempt: string;
  invocationMode: string;
  event: string;
  authoritySource: string;
  operatorConfirmation?: string;
}): NightlyReleaseRequest {
  if (!nightlyBasePattern.test(input.baseVersion)) {
    throw new Error('Nightly base version must use YY.M.D-nightly without a rebuild revision.');
  }
  if (input.actionsRunAttempt !== '1') {
    throw new Error('Nightly publication is one-shot and requires Actions run attempt 1.');
  }
  const resolution = resolveNightlyReleaseVersion(input.baseVersion, input.existingRefs);
  const identity = resolveReleaseVersionIdentity('nightly', resolution.version);
  const invocation = resolveNightlyInvocation(input);
  const body: Omit<NightlyReleaseRequest, 'request_digest'> = {
    schema: 'opl_standard_nightly_request.v1',
    channel: 'nightly',
    quality_status: 'preview',
    build_trigger: 'automated',
    preview_kind: 'nightly',
    package_kind: 'app_standard',
    base_version: input.baseVersion,
    version: resolution.version,
    updater_version: identity.updaterVersion,
    tag: `v${resolution.version}`,
    source: {
      app_sha: exactSha(input.appRef, 'App ref'),
      shell_sha: exactSha(input.shellRef, 'Shell ref'),
      framework_sha: exactSha(input.frameworkRef, 'Framework ref'),
    },
    actions: {
      run_id: positiveInteger(input.actionsRunId, 'Actions run id'),
      run_attempt: '1',
    },
    invocation,
    publication: {
      github_prerelease: true,
      make_latest: false,
      include_full: false,
      full_allowed: false,
      webui_allowed: false,
      heavy_vm_blocking: false,
      followup_workflow: '.github/workflows/release-nightly-followups.yml',
      followup_operations: ['reconcile_homebrew', 'run_sampled_vm'],
    },
    observed_same_day_versions: resolution.observedSameDayVersions,
  };
  return { ...body, request_digest: digestRequest(body) };
}

function main(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      'base-version': { type: 'string' },
      'existing-ref-file': { type: 'string' },
      'app-ref': { type: 'string' },
      'shell-ref': { type: 'string' },
      'framework-ref': { type: 'string' },
      'actions-run-id': { type: 'string' },
      'actions-run-attempt': { type: 'string' },
      'invocation-mode': { type: 'string' },
      event: { type: 'string' },
      'authority-source': { type: 'string' },
      'operator-confirmation': { type: 'string' },
      output: { type: 'string' },
      'github-output': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  const required = (name: keyof typeof values): string => {
    const value = values[name];
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing --${String(name)}.`);
    return value.trim();
  };
  const request = resolveNightlyReleaseRequest({
    baseVersion: required('base-version'),
    existingRefs: fs.readFileSync(path.resolve(required('existing-ref-file')), 'utf8').split(/\r?\n/),
    appRef: required('app-ref'),
    shellRef: required('shell-ref'),
    frameworkRef: required('framework-ref'),
    actionsRunId: required('actions-run-id'),
    actionsRunAttempt: required('actions-run-attempt'),
    invocationMode: required('invocation-mode'),
    event: required('event'),
    authoritySource: required('authority-source'),
    operatorConfirmation: values['operator-confirmation'],
  });
  const output = path.resolve(required('output'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(request, null, 2)}\n`, 'utf8');

  if (values['github-output']) {
    fs.appendFileSync(path.resolve(values['github-output']), `${[
      `version=${request.version}`,
      `updater_version=${request.updater_version}`,
      `tag=${request.tag}`,
      `app_ref=${request.source.app_sha}`,
      `shell_ref=${request.source.shell_sha}`,
      `framework_ref=${request.source.framework_sha}`,
      `request_digest=${request.request_digest}`,
      `invocation_mode=${request.invocation.mode}`,
      `invocation_event=${request.invocation.event}`,
      `authority_source=${request.invocation.authority_source}`,
    ].join('\n')}\n`);
  }
  process.stdout.write(`${JSON.stringify(request)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
