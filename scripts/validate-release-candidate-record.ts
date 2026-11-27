#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedLegacySchema = 'opl_release_candidate_record.v1';
const statusFlag = '--status';
const retiredAdmissionFlag = '--promote-ready';
const frameworkHandoff = {
  state_authority: 'framework_opl_release_portable_checkpoint_and_receipt',
  checkpoint_schema_ref: 'opl_release_bundle_checkpoint.v1',
  receipt_schema_refs: [
    'opl_release_bundle_executor_receipt.v1',
    'opl_release_bundle_operation_receipt.v1',
    'opl_release_bundle_qualification_receipt.v1',
  ],
  status_command: 'node --experimental-strip-types scripts/release-bundle-cli.ts status --bundle <sha256:digest> --store <directory>',
  required_handoff: ['portable_framework_checkpoint', 'original_framework_receipts'],
  inspect_only: true,
  mutation_authorized: false,
} as const;

type Options = {
  mode: 'inspect' | 'retired_admission';
  recordPath: string;
  version: string;
  format: 'json' | 'markdown';
};

function optionName(flag: string) {
  return flag.slice(2);
}

function parseArgs(argv: string[]): Options {
  const { values, tokens } = parseNodeArgs({
    args: argv,
    options: {
      [optionName(statusFlag)]: { type: 'boolean' },
      [optionName(retiredAdmissionFlag)]: { type: 'boolean' },
      record: { type: 'string' },
      version: { type: 'string' },
      format: { type: 'string' },
    },
    strict: true,
    tokens: true,
  });

  let mode: Options['mode'] = 'inspect';
  for (const token of tokens) {
    if (token.kind === 'option' && token.name === optionName(statusFlag)) mode = 'inspect';
    if (token.kind === 'option' && token.name === optionName(retiredAdmissionFlag)) mode = 'retired_admission';
  }
  const format = values.format ?? 'json';
  if (format !== 'json' && format !== 'markdown') {
    throw new Error(`--format must be json or markdown, got ${format}`);
  }

  return {
    mode,
    recordPath: path.resolve(
      values.record
        ?? process.env.OPL_RELEASE_CANDIDATE_RECORD
        ?? path.resolve(appRoot, 'release-candidate-record.json'),
    ),
    version: values.version ?? process.env.OPL_RELEASE_VERSION ?? '',
    format,
  };
}

function objectOrNull(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function inspectRecord(options: Options) {
  const bytes = fs.readFileSync(options.recordPath);
  const record = objectOrNull(JSON.parse(bytes.toString('utf8')));
  if (!record) throw new Error(`Historical release candidate record must be a JSON object: ${options.recordPath}`);
  const decision = objectOrNull(record.decision);
  const releaseOwnerVerdict = objectOrNull(record.release_owner_verdict);
  const errors: string[] = [];

  if (record.schema !== expectedLegacySchema) {
    errors.push(`Unexpected historical candidate record schema: ${String(record.schema)}`);
  }
  if (options.version && record.version !== options.version) {
    errors.push(`Historical candidate record version ${String(record.version)} does not match ${options.version}`);
  }

  return {
    schema: 'opl_app_historical_release_candidate_inspection.v1',
    status: 'historical_read_only',
    lifecycle: 'historical_read_only',
    source_path: options.recordPath,
    source_sha256: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
    source_size_bytes: bytes.byteLength,
    source: {
      schema: stringOrNull(record.schema),
      version: stringOrNull(record.version),
      tag: stringOrNull(record.tag),
      status: stringOrNull(record.status),
    },
    historical_claims: {
      promotion_status_present: record.status === 'ready_to_promote',
      promotion_decision_present: decision?.can_promote === true,
      promotion_command_present: typeof decision?.promote_command === 'string'
        && decision.promote_command.trim().length > 0,
      release_owner_verdict_status: stringOrNull(releaseOwnerVerdict?.status),
      release_owner_verdict_ref_present: typeof releaseOwnerVerdict?.release_owner_verdict_ref === 'string'
        && releaseOwnerVerdict.release_owner_verdict_ref.trim().length > 0,
      release_owner_receipt_ref_present: typeof releaseOwnerVerdict?.release_owner_receipt_ref === 'string'
        && releaseOwnerVerdict.release_owner_receipt_ref.trim().length > 0,
    },
    inspection_valid: errors.length === 0,
    authoritative_for_new_release: false,
    promote_ready: false,
    mutation_authorized: false,
    next_action: 'inspect_framework_checkpoint_and_receipts',
    framework_handoff: frameworkHandoff,
    errors,
  };
}

function formatMarkdown(summary: ReturnType<typeof inspectRecord>) {
  const lines = [
    '## Historical Release Candidate Inspection',
    '',
    `- Lifecycle: ${summary.lifecycle}`,
    `- Source schema: ${String(summary.source.schema)}`,
    `- Source version: ${String(summary.source.version)}`,
    `- Source status: ${String(summary.source.status)}`,
    `- Source SHA-256: ${summary.source_sha256}`,
    `- Inspection valid: ${summary.inspection_valid}`,
    `- Mutation authorized: ${summary.mutation_authorized}`,
    `- Framework status: ${summary.framework_handoff.status_command}`,
  ];
  if (summary.errors.length > 0) {
    lines.push('', '### Inspection errors', '');
    for (const error of summary.errors) lines.push(`- ${error}`);
  }
  return `${lines.join('\n')}\n`;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const summary = inspectRecord(options);
  const output = options.format === 'markdown'
    ? formatMarkdown(summary)
    : `${JSON.stringify(summary, null, 2)}\n`;
  process.stdout.write(output);
  if (!summary.inspection_valid) process.exitCode = 1;
  if (options.mode === 'retired_admission') {
    console.error('Candidate-record promotion admission is retired; inspect the Framework checkpoint and receipts.');
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
