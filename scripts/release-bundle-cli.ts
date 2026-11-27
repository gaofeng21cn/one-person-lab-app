#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';
import {
  admitReleaseBundleOperation,
  buildReleaseBundle,
  buildReleaseBundleConsumerEnvelope,
  exportReleaseBundleCheckpoint,
  freezeReleaseBundle,
  importReleaseBundleCheckpoint,
  publishReleaseBundle,
  readReleaseBundleEvents,
  readReleaseBundleStatus,
  reconcileReleaseBundle,
  verifyReleaseBundle,
  type ReleaseBundleStableOperation,
  type ReleaseBundleTrackName,
} from './release-bundle-authority/index.ts';
import { FrameworkContractError } from './release-bundle-authority/support.ts';

type OptionSpec = {
  name: string;
  flag: string;
  required: boolean;
  allowedValues?: readonly string[];
  summary: string;
};

type SubcommandSpec = {
  tokens: readonly string[];
  commandId: string;
  usage: string;
  summary: string;
  examples: readonly string[];
  options: readonly OptionSpec[];
  handler: (values: Record<string, string>) => unknown;
};

const STORE_OPTION: OptionSpec = {
  name: 'store',
  flag: '--store',
  required: false,
  summary: 'Optional Release Bundle store root; defaults under OPL_STATE_DIR.',
};

const OPERATION_OPTIONS: readonly OptionSpec[] = [
  {
    name: 'operation',
    flag: '--operation',
    required: true,
    allowedValues: ['standard', 'resume_standard', 'append_full'],
    summary: 'Exact admitted Stable operation kind.',
  },
  {
    name: 'operation-id',
    flag: '--operation-id',
    required: true,
    summary: 'Canonical immutable operation identity.',
  },
  {
    name: 'operation-started-at',
    flag: '--operation-started-at',
    required: true,
    summary: 'Canonical immutable UTC operation start.',
  },
  {
    name: 'operation-deadline-at',
    flag: '--operation-deadline-at',
    required: true,
    summary: 'Canonical immutable absolute UTC operation deadline.',
  },
];

function stringOption(values: Record<string, string>, name: string): string | undefined {
  const value = values[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requiredString(values: Record<string, string>, name: string): string {
  const value = stringOption(values, name);
  if (!value) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Release operation option --${name} must be a non-empty string.`,
      { option: name, surface_kind: 'opl_release_bundle_operation_control.v1' },
    );
  }
  return value;
}

function operationInvocation(values: Record<string, string>) {
  return {
    releaseOperation: requiredString(values, 'operation') as ReleaseBundleStableOperation,
    operationId: requiredString(values, 'operation-id'),
    operationStartedAt: requiredString(values, 'operation-started-at'),
    operationDeadlineAt: requiredString(values, 'operation-deadline-at'),
  };
}

const SUBCOMMANDS: readonly SubcommandSpec[] = [
  {
    tokens: ['freeze'],
    commandId: 'release freeze',
    usage: 'node --experimental-strip-types scripts/release-bundle-cli.ts freeze --request <freeze-request.json> [--source-root <directory>] [--store <directory>]',
    summary: 'Freeze one immutable Release Bundle with prepared AI notes and exact transitive inputs.',
    examples: ['node --experimental-strip-types scripts/release-bundle-cli.ts freeze --request release-freeze.json --json'],
    options: [
      { name: 'request', flag: '--request', required: true, summary: 'Exact local path to an opl_release_bundle_freeze_request.v1 JSON file.' },
      { name: 'source-root', flag: '--source-root', required: false, summary: 'Source directory for the App artifact build.' },
      STORE_OPTION,
    ],
    handler: (values) => freezeReleaseBundle({
      requestPath: values.request,
      sourceRoot: stringOption(values, 'source-root'),
      storeRoot: stringOption(values, 'store'),
    }),
  },
  {
    tokens: ['operation', 'admit'],
    commandId: 'release operation admit',
    usage: 'node --experimental-strip-types scripts/release-bundle-cli.ts operation admit --bundle <sha256:digest> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
    summary: 'Admit an immutable operation control; expired built Full checkpoints may start a new Full operation after every unknown outcome is reconciled.',
    examples: ['node --experimental-strip-types scripts/release-bundle-cli.ts operation admit --bundle sha256:<digest> --operation standard --operation-id gha-123-standard --operation-started-at 2026-07-21T00:00:00.000Z --operation-deadline-at 2026-07-21T01:30:00.000Z --json'],
    options: [
      { name: 'bundle', flag: '--bundle', required: true, summary: 'Exact sha256 Release Bundle digest.' },
      ...OPERATION_OPTIONS,
      STORE_OPTION,
    ],
    handler: (values) => admitReleaseBundleOperation({
      ...operationInvocation(values),
      bundleDigest: values.bundle,
      storeRoot: stringOption(values, 'store'),
    }),
  },
  {
    tokens: ['build'],
    commandId: 'release build',
    usage: 'node --experimental-strip-types scripts/release-bundle-cli.ts build --bundle <sha256:digest> --executor-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
    summary: 'Stage one local or remote executor result exactly once; unknown outcomes require reconcile.',
    examples: ['node --experimental-strip-types scripts/release-bundle-cli.ts build --bundle sha256:<digest> --executor-receipt build-receipt.json --operation standard --operation-id gha-123-standard --operation-started-at 2026-07-21T00:00:00.000Z --operation-deadline-at 2026-07-21T01:30:00.000Z --json'],
    options: [
      { name: 'bundle', flag: '--bundle', required: true, summary: 'Exact sha256 Release Bundle digest.' },
      { name: 'executor-receipt', flag: '--executor-receipt', required: true, summary: 'Exact local or remote build executor receipt path.' },
      ...OPERATION_OPTIONS,
      STORE_OPTION,
    ],
    handler: (values) => buildReleaseBundle({
      ...operationInvocation(values),
      bundleDigest: values.bundle,
      executorReceiptPath: values['executor-receipt'],
      storeRoot: stringOption(values, 'store'),
    }),
  },
  {
    tokens: ['checkpoint', 'export'],
    commandId: 'release checkpoint export',
    usage: 'node --experimental-strip-types scripts/release-bundle-cli.ts checkpoint export --bundle <sha256:digest> --output <directory> [--store <directory>]',
    summary: 'Export one deterministic portable checkpoint without rebuilding or importing publication state.',
    examples: ['node --experimental-strip-types scripts/release-bundle-cli.ts checkpoint export --bundle sha256:<digest> --output release-checkpoint --json'],
    options: [
      { name: 'bundle', flag: '--bundle', required: true, summary: 'Exact sha256 Release Bundle digest to checkpoint.' },
      { name: 'output', flag: '--output', required: true, summary: 'New deterministic checkpoint directory.' },
      STORE_OPTION,
    ],
    handler: (values) => exportReleaseBundleCheckpoint({
      bundleDigest: values.bundle,
      outputDirectory: values.output,
      storeRoot: stringOption(values, 'store'),
    }),
  },
  {
    tokens: ['checkpoint', 'import'],
    commandId: 'release checkpoint import',
    usage: 'node --experimental-strip-types scripts/release-bundle-cli.ts checkpoint import --checkpoint <checkpoint.json> [--store <directory>]',
    summary: 'Import exact frozen, built, and qualified bytes without rebuilding; publication still requires fresh readback.',
    examples: ['node --experimental-strip-types scripts/release-bundle-cli.ts checkpoint import --checkpoint release-checkpoint/checkpoint.json --json'],
    options: [
      { name: 'checkpoint', flag: '--checkpoint', required: true, summary: 'Exact opl_release_bundle_checkpoint.v1 manifest path.' },
      STORE_OPTION,
    ],
    handler: (values) => importReleaseBundleCheckpoint({
      checkpointPath: values.checkpoint,
      storeRoot: stringOption(values, 'store'),
    }),
  },
  {
    tokens: ['verify'],
    commandId: 'release verify',
    usage: 'node --experimental-strip-types scripts/release-bundle-cli.ts verify --bundle <sha256:digest> --qualification-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--track standard|full] [--store <directory>]',
    summary: 'Bind a passed same-byte installed-artifact qualification receipt to one staged Bundle track.',
    examples: ['node --experimental-strip-types scripts/release-bundle-cli.ts verify --bundle sha256:<digest> --qualification-receipt vm-qualification.json --operation standard --operation-id gha-123-standard --operation-started-at 2026-07-21T00:00:00.000Z --operation-deadline-at 2026-07-21T01:30:00.000Z --json'],
    options: [
      { name: 'bundle', flag: '--bundle', required: true, summary: 'Exact sha256 Release Bundle digest.' },
      { name: 'qualification-receipt', flag: '--qualification-receipt', required: true, summary: 'Passed same-byte installed-artifact qualification receipt path.' },
      ...OPERATION_OPTIONS,
      { name: 'track', flag: '--track', required: false, allowedValues: ['standard', 'full'], summary: 'Optional explicit track; otherwise inferred from the qualification receipt.' },
      STORE_OPTION,
    ],
    handler: (values) => verifyReleaseBundle({
      ...operationInvocation(values),
      bundleDigest: values.bundle,
      qualificationReceiptPath: values['qualification-receipt'],
      track: stringOption(values, 'track') as ReleaseBundleTrackName | undefined,
      storeRoot: stringOption(values, 'store'),
    }),
  },
  {
    tokens: ['publish'],
    commandId: 'release publish',
    usage: 'node --experimental-strip-types scripts/release-bundle-cli.ts publish --bundle <sha256:digest> --executor-receipt <remote-inspect.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
    summary: 'Plan exact missing-asset uploads, accept same-name same-digest assets, and fail closed on conflicts.',
    examples: ['node --experimental-strip-types scripts/release-bundle-cli.ts publish --bundle sha256:<digest> --executor-receipt remote-inspect.json --operation standard --operation-id gha-123-standard --operation-started-at 2026-07-21T00:00:00.000Z --operation-deadline-at 2026-07-21T01:30:00.000Z --json'],
    options: [
      { name: 'bundle', flag: '--bundle', required: true, summary: 'Exact sha256 Release Bundle digest.' },
      { name: 'executor-receipt', flag: '--executor-receipt', required: true, summary: 'Fresh remote_inspect executor receipt used for idempotent publish planning.' },
      ...OPERATION_OPTIONS,
      STORE_OPTION,
    ],
    handler: (values) => publishReleaseBundle({
      ...operationInvocation(values),
      bundleDigest: values.bundle,
      executorReceiptPath: values['executor-receipt'],
      storeRoot: stringOption(values, 'store'),
    }),
  },
  {
    tokens: ['reconcile'],
    commandId: 'release reconcile',
    usage: 'node --experimental-strip-types scripts/release-bundle-cli.ts reconcile --bundle <sha256:digest> --executor-receipt <receipt.json> --operation <standard|resume_standard|append_full> --operation-id <id> --operation-started-at <timestamp> --operation-deadline-at <timestamp> [--store <directory>]',
    summary: 'Resolve a prior unknown build or publish result from one fresh executor observation without retrying it.',
    examples: ['node --experimental-strip-types scripts/release-bundle-cli.ts reconcile --bundle sha256:<digest> --executor-receipt fresh-observation.json --operation standard --operation-id gha-123-standard --operation-started-at 2026-07-21T00:00:00.000Z --operation-deadline-at 2026-07-21T01:30:00.000Z --json'],
    options: [
      { name: 'bundle', flag: '--bundle', required: true, summary: 'Exact sha256 Release Bundle digest.' },
      { name: 'executor-receipt', flag: '--executor-receipt', required: true, summary: 'Fresh executor receipt resolving a prior unknown build or publish outcome.' },
      ...OPERATION_OPTIONS,
      STORE_OPTION,
    ],
    handler: (values) => reconcileReleaseBundle({
      ...operationInvocation(values),
      bundleDigest: values.bundle,
      executorReceiptPath: values['executor-receipt'],
      storeRoot: stringOption(values, 'store'),
    }),
  },
  {
    tokens: ['status'],
    commandId: 'release status',
    usage: 'node --experimental-strip-types scripts/release-bundle-cli.ts status --bundle <sha256:digest> [--store <directory>]',
    summary: 'Read immutable Bundle identity, qualification, publication and reconcile state without external mutation.',
    examples: ['node --experimental-strip-types scripts/release-bundle-cli.ts status --bundle sha256:<digest> --json'],
    options: [
      { name: 'bundle', flag: '--bundle', required: true, summary: 'Exact sha256 Release Bundle digest.' },
      STORE_OPTION,
    ],
    handler: (values) => readReleaseBundleStatus({
      bundleDigest: values.bundle,
      storeRoot: stringOption(values, 'store'),
    }),
  },
  {
    tokens: ['events'],
    commandId: 'release events',
    usage: 'node --experimental-strip-types scripts/release-bundle-cli.ts events --bundle <sha256:digest> [--after-event <sha256:event>] [--store <directory>]',
    summary: 'Read immutable operation-receipt events after one consumer cursor without polling or mutation authority.',
    examples: ['node --experimental-strip-types scripts/release-bundle-cli.ts events --bundle sha256:<digest> --json'],
    options: [
      { name: 'bundle', flag: '--bundle', required: true, summary: 'Exact sha256 Release Bundle digest.' },
      { name: 'after-event', flag: '--after-event', required: false, summary: 'Last acknowledged event id; only later immutable events are returned.' },
      STORE_OPTION,
    ],
    handler: (values) => readReleaseBundleEvents({
      bundleDigest: values.bundle,
      afterEventId: stringOption(values, 'after-event'),
      storeRoot: stringOption(values, 'store'),
    }),
  },
  {
    tokens: ['consumer', 'envelope'],
    commandId: 'release consumer envelope',
    usage: 'node --experimental-strip-types scripts/release-bundle-cli.ts consumer envelope --bundle <sha256:digest> --track <standard|full> [--source-checkpoint-run-id <run-id>] [--store <directory>]',
    summary: 'Project one digest-bound consumer trigger envelope without granting dispatch or release authority.',
    examples: ['node --experimental-strip-types scripts/release-bundle-cli.ts consumer envelope --bundle sha256:<digest> --track standard --json'],
    options: [
      { name: 'bundle', flag: '--bundle', required: true, summary: 'Exact sha256 Release Bundle digest.' },
      { name: 'track', flag: '--track', required: true, allowedValues: ['standard', 'full'], summary: 'Consumer track; Standard and Full always retain distinct operation identity.' },
      { name: 'source-checkpoint-run-id', flag: '--source-checkpoint-run-id', required: false, summary: 'Exact source checkpoint run id required for a Full consumer envelope.' },
      STORE_OPTION,
    ],
    handler: (values) => buildReleaseBundleConsumerEnvelope({
      bundleDigest: values.bundle,
      track: requiredString(values, 'track') as 'standard' | 'full',
      sourceCheckpointRunId: stringOption(values, 'source-checkpoint-run-id'),
      storeRoot: stringOption(values, 'store'),
    }),
  },
];

function usageError(message: string, spec?: Pick<SubcommandSpec, 'usage' | 'examples'>, details: Record<string, unknown> = {}) {
  return new FrameworkContractError('cli_usage_error', message, {
    ...details,
    ...(spec ? { usage: spec.usage, examples: spec.examples } : {}),
  });
}

function parseCommandOptions(args: string[], spec: SubcommandSpec): Record<string, string> {
  const optionsConfig: ParseArgsOptionsConfig = Object.fromEntries(
    spec.options.map((opt) => [opt.name, { type: 'string', multiple: false }]),
  );
  let parsedValues: Record<string, unknown>;
  try {
    const parsed = parseArgs({
      args: args.filter((arg) => arg !== '--json'),
      allowPositionals: false,
      options: optionsConfig,
      strict: true,
    });
    for (const [name, value] of Object.entries(parsed.values)) {
      if (value === '') {
        throw new TypeError(`Option '--${name}' requires a non-empty value.`);
      }
    }
    parsedValues = parsed.values;
  } catch (error) {
    throw usageError(
      error instanceof Error ? error.message : 'Command options could not be parsed.',
      spec,
      { parser_adapter: 'node_util_parse_args' },
    );
  }

  const resolved: Record<string, string> = {};
  for (const opt of spec.options) {
    const value = parsedValues[opt.name];
    if (value === undefined) {
      if (opt.required) {
        throw usageError(`${spec.commandId} requires ${opt.flag}.`, spec, { required: [opt.flag] });
      }
      continue;
    }
    if (typeof value !== 'string') {
      throw usageError(`${spec.commandId} ${opt.flag} must be a string.`, spec, { option: opt.flag, value });
    }
    if (opt.allowedValues && !opt.allowedValues.includes(value)) {
      throw usageError(
        `${spec.commandId} ${opt.flag} must be one of ${opt.allowedValues.join(', ')}.`,
        spec,
        { option: opt.flag, value, allowed_values: [...opt.allowedValues] },
      );
    }
    resolved[opt.name] = value;
  }
  return resolved;
}

function formatRootHelp(): string {
  const lines = [
    'OPL Release Bundle CLI (owned by one-person-lab-app)',
    '',
    'Commands:',
    ...SUBCOMMANDS.map((spec) => `  ${spec.commandId.padEnd(28)} ${spec.summary}`),
    '',
    'Run any subcommand with --help [--json] for flags and examples.',
    '',
  ];
  return lines.join('\n');
}

function formatCommandHelp(spec: SubcommandSpec): string {
  const lines = [
    `Usage: ${spec.usage}`,
    '',
    spec.summary,
    '',
    'Options:',
    ...spec.options.map((opt) => `  ${opt.flag.padEnd(26)} ${opt.required ? '(required) ' : ''}${opt.summary}`),
    '',
  ];
  return lines.join('\n');
}

function matchSubcommand(argv: readonly string[]): { spec: SubcommandSpec; rest: string[] } | null {
  const sorted = [...SUBCOMMANDS].sort((a, b) => b.tokens.length - a.tokens.length);
  for (const spec of sorted) {
    if (spec.tokens.every((token, index) => argv[index] === token)) {
      return { spec, rest: argv.slice(spec.tokens.length) };
    }
  }
  return null;
}

export function runReleaseBundleCli(rawArgv: readonly string[]): number {
  const argv = rawArgv[0] === 'release' ? rawArgv.slice(1) : [...rawArgv];
  const hasJson = argv.includes('--json');
  const hasHelp = argv.includes('--help') || argv.includes('-h');

  if (argv.length === 0 || (hasHelp && argv.every((a) => a === '--help' || a === '-h' || a === '--json' || a === 'help'))) {
    if (hasJson) {
      process.stdout.write(`${JSON.stringify({
        version: 'g2',
        help: {
          commands: SUBCOMMANDS.map((spec) => ({
            command: spec.commandId,
            usage: spec.usage,
            summary: spec.summary,
          })),
        },
      }, null, 2)}\n`);
    } else {
      process.stdout.write(formatRootHelp());
    }
    return 0;
  }

  const normalized = argv[0] === 'help' ? argv.slice(1) : argv;
  const matched = matchSubcommand(normalized);
  if (!matched) {
    const err = new FrameworkContractError('unknown_command', `Unknown release bundle command: ${normalized.join(' ')}`);
    process.stderr.write(`${JSON.stringify(err.toJSON(), null, 2)}\n`);
    return err.exitCode;
  }

  if (hasHelp || argv[0] === 'help') {
    if (hasJson) {
      process.stdout.write(`${JSON.stringify({
        version: 'g2',
        help: {
          command: matched.spec.commandId,
          usage: matched.spec.usage,
          summary: matched.spec.summary,
          options: matched.spec.options,
          examples: matched.spec.examples,
        },
      }, null, 2)}\n`);
    } else {
      process.stdout.write(formatCommandHelp(matched.spec));
    }
    return 0;
  }

  try {
    const values = parseCommandOptions(matched.rest, matched.spec);
    const result = matched.spec.handler(values);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof FrameworkContractError) {
      process.stderr.write(`${JSON.stringify(error.toJSON(), null, 2)}\n`);
      return error.exitCode;
    }
    const unexpected = {
      version: 'g2',
      error: {
        code: 'unexpected_error',
        message: error instanceof Error ? error.message : String(error),
        exit_code: 1,
      },
    };
    process.stderr.write(`${JSON.stringify(unexpected, null, 2)}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = runReleaseBundleCli(process.argv.slice(2));
}
