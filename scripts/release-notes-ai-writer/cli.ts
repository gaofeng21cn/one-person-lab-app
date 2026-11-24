import crypto from 'node:crypto';
import { buildFallbackReleaseNotes, validatePreparedReleaseNotes } from './fallback-chain.ts';
import type { ReleaseNoteWriter } from '../release-note-writer-chain.ts';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs as parseNodeArgs } from 'node:util';
import type { ReleaseNotesEvidence } from '../release-notes.ts';
import type { ReleaseNotesPreparationReceiptV1 } from '../release-notes-preparation-receipt.ts';
import { completeAiReleaseNotesWithEvidence } from './markdown-normalization.ts';
import {
  buildAiReleaseNotesDocument,
  providerTransportAttempts,
  ReleaseNotesProviderFailure,
  runOpenAICompatibleProbe,
  type AiReleaseNotesOptions,
} from './provider-transport.ts';
import { validateAiReleaseNotes } from './validation.ts';

type ReleaseNotesMode = 'ai' | 'template';

function releaseNotesMode(): ReleaseNotesMode {
  const value = (process.env.OPL_RELEASE_NOTES_MODE || 'ai').trim().toLowerCase();
  if (value !== 'ai' && value !== 'template') {
    throw new Error(`Unsupported OPL_RELEASE_NOTES_MODE: ${process.env.OPL_RELEASE_NOTES_MODE}`);
  }
  return value;
}
type AiReleaseNotesCliOptions = AiReleaseNotesOptions & {
  evidencePath: string;
  inputPath: string;
  outputPath: string;
  receiptPath: string;
  probeOpenAICompatible: boolean;
};

const probeOpenAICompatibleFlag = '--probe-openai-compatible';
const probeOpenAICompatibleOption = probeOpenAICompatibleFlag.slice(2);

function parseCliArgs(argv: string[]): AiReleaseNotesCliOptions {
  const { values } = parseNodeArgs({
    args: argv,
    options: {
      evidence: { type: 'string' },
      input: { type: 'string' },
      output: { type: 'string' },
      'receipt-output': { type: 'string' },
      'provider-command': { type: 'string' },
      model: { type: 'string' },
      [probeOpenAICompatibleOption]: { type: 'boolean' },
    } as const,
    allowPositionals: false,
    strict: true,
  });
  const parsed: AiReleaseNotesCliOptions = {
    evidencePath: values.evidence ? path.resolve(values.evidence) : process.env.OPL_RELEASE_NOTES_EVIDENCE_INPUT?.trim() || '',
    inputPath: values.input ? path.resolve(values.input) : '',
    outputPath: values.output ? path.resolve(values.output) : '',
    receiptPath: values['receipt-output'] ? path.resolve(values['receipt-output']) : '',
    providerCommand: values['provider-command'],
    model: values.model,
    probeOpenAICompatible: values[probeOpenAICompatibleOption] === true,
  };
  if (!parsed.probeOpenAICompatible && !parsed.evidencePath) {
    throw new Error(`Missing required --evidence unless ${probeOpenAICompatibleFlag} is set.`);
  }
  return parsed;
}

function sha256(value: Buffer | string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function writePreparationReceipt(receiptPath: string, receipt: ReleaseNotesPreparationReceiptV1) {
  if (!receiptPath) return;
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
}

function preparationFailure(error: unknown): NonNullable<ReleaseNotesPreparationReceiptV1['failure']> {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ReleaseNotesProviderFailure) {
    return {
      taxonomy: error.transportRetryable ? 'transport' : 'unknown',
      type: error.failureType,
      transport_attempts: error.attempts,
      transport_retry_exhausted: error.transportRetryable,
      message: message.slice(0, 1_200),
    };
  }
  if (/quality gate|localization gate/i.test(message)) {
    return {
      taxonomy: 'quality', type: 'notes_quality_validation_failed', transport_attempts: null,
      transport_retry_exhausted: false, message: message.slice(0, 1_200),
    };
  }
  if (/missing .*provider config|no online .*provider|credential|api key/i.test(message)) {
    return {
      taxonomy: 'configuration', type: 'notes_provider_configuration_invalid', transport_attempts: null,
      transport_retry_exhausted: false, message: message.slice(0, 1_200),
    };
  }
  return {
    taxonomy: 'unknown', type: 'notes_preparation_failed', transport_attempts: null,
    transport_retry_exhausted: false, message: message.slice(0, 1_200),
  };
}

function readReleaseNotesEvidence(evidencePath: string): ReleaseNotesEvidence {
  const payload = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  return (payload?.release_evidence ?? payload) as ReleaseNotesEvidence;
}

export async function runAiReleaseNotesCli() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.probeOpenAICompatible) {
    runOpenAICompatibleProbe();
    return;
  }
  const evidenceBytes = fs.readFileSync(options.evidencePath);
  const evidence = readReleaseNotesEvidence(options.evidencePath);
  const receiptBase = {
    schema: 'opl_app_release_notes_prepare_receipt.v1' as const,
    identity: {
      version: evidence.version ?? null,
      channel: evidence.channel ?? null,
      tag: evidence.current_tag ?? null,
      workflow_run_id: process.env.GITHUB_RUN_ID?.trim() || null,
    },
    provider: {
      kind: (process.env.OPL_RELEASE_NOTES_PROVIDER || 'auto').trim().toLowerCase(),
      model: process.env.OPL_RELEASE_NOTES_MODEL?.trim() || null,
      max_transport_attempts_per_request: providerTransportAttempts(),
    },
    evidence_sha256: sha256(evidenceBytes),
  };
  try {
    const mode = releaseNotesMode();
    if (mode === 'template' && !options.inputPath) {
      throw new Error('OPL_RELEASE_NOTES_MODE=template requires --input with a deterministic template file.');
    }
    let writer: ReleaseNoteWriter | undefined;
    const chain = mode === 'ai' && !options.inputPath && process.env.OPL_RELEASE_NOTES_PROVIDER === 'fallback_chain'
      ? await buildFallbackReleaseNotes(evidence) : null;
    if (chain) writer = chain.writer;
    const notes = chain ? chain.notes :
      mode === 'template'
        ? completeAiReleaseNotesWithEvidence(fs.readFileSync(options.inputPath, 'utf8'), evidence)
        : options.inputPath
          ? fs.readFileSync(options.inputPath, 'utf8')
          : buildAiReleaseNotesDocument(evidence, options);
    if (process.env.OPL_RELEASE_NOTES_PROVIDER === 'fallback_chain') validatePreparedReleaseNotes(notes, evidence);
    else validateAiReleaseNotes(notes, evidence);
    if (options.outputPath) {
      fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
      fs.writeFileSync(options.outputPath, notes);
    } else {
      process.stdout.write(notes);
    }
    writePreparationReceipt(options.receiptPath, {
      ...receiptBase,
      ...(writer ? { writer, provider: { ...receiptBase.provider, model: writer.model ?? null } } : {}),
      written_at: new Date().toISOString(),
      status: 'passed',
      notes_sha256: sha256(notes),
      failure: null,
    });
  } catch (error) {
    writePreparationReceipt(options.receiptPath, {
      ...receiptBase,
      written_at: new Date().toISOString(),
      status: 'failed',
      notes_sha256: null,
      failure: preparationFailure(error),
    });
    throw error;
  }
}
