#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';
import {
  buildMonitorSummary,
  buildNotificationPayload,
  buildOutputGeneration,
  buildSummary,
  writeCompletionManifest,
  writeJson,
  writeMarkdownAtomic,
} from './closeout-release-run/output-generation.ts';
import type { ArtifactProfile, Options } from './closeout-release-run/types.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultRepo = 'gaofeng21cn/one-person-lab-app';

function defaultOptions(): Options {
  return {
    version: process.env.OPL_RELEASE_VERSION || '',
    runId: process.env.OPL_RELEASE_RUN_ID || '',
    repo: process.env.OPL_RELEASE_REPO || defaultRepo,
    outDir: process.env.OPL_RELEASE_CLOSEOUT_DIR || '',
    output: process.env.OPL_RELEASE_CLOSEOUT_OUTPUT || '',
    markdown: process.env.OPL_RELEASE_CLOSEOUT_MARKDOWN || '',
    monitor: process.env.OPL_RELEASE_MONITOR_OUTPUT || '',
    notification: process.env.OPL_RELEASE_NOTIFICATION_OUTPUT || '',
    runJsonPath: process.env.OPL_RELEASE_CLOSEOUT_RUN_JSON || '',
    jobsJsonPath: process.env.OPL_RELEASE_CLOSEOUT_JOBS_JSON || '',
    artifactsJsonPath: process.env.OPL_RELEASE_CLOSEOUT_ARTIFACTS_JSON || '',
    artifactsDir: process.env.OPL_RELEASE_CLOSEOUT_ARTIFACTS_DIR || '',
    stableSessionPath: process.env.OPL_RELEASE_STABLE_SESSION || '',
    promotionSagaReceiptPath: process.env.OPL_RELEASE_PROMOTION_SAGA_RECEIPT || '',
    completionManifest: process.env.OPL_RELEASE_CLOSEOUT_COMPLETION_MANIFEST || '',
    artifactProfile: (process.env.OPL_RELEASE_CLOSEOUT_ARTIFACT_PROFILE as ArtifactProfile) || 'primary',
    noDownload: false,
    agentStartedAt: process.env.OPL_AGENT_STARTED_AT || '',
    agentFinishedAt: process.env.OPL_AGENT_FINISHED_AT || '',
    agentWallTime: process.env.OPL_AGENT_WALL_TIME || '',
  };
}

function usage(): void {
  process.stdout.write(`Usage:
  node --experimental-strip-types scripts/closeout-release-run.ts --version <version> --run-id <github-actions-run-id>
  node --experimental-strip-types scripts/closeout-release-run.ts --version <version> --run-json <path> --jobs-json <path> --artifacts-dir <path> --no-download

Options:
  --version <version>              OPL release version, for example 26.6.20.
  --run-id <id>                    GitHub Actions release run id.
  --repo <owner/name>              GitHub repository. Default: ${defaultRepo}
  --out-dir <path>                 Output directory.
  --output-dir <path>              Alias for --out-dir.
  --output <path>                  Write release-closeout.json.
  --markdown <path>                Write release-closeout.md.
  --monitor <path>                 Write release-monitor.json.
  --notification <path>            Write release-notification.json.
  --run-json <path>                Read saved gh run JSON instead of fetching.
  --jobs-json <path>               Read saved jobs JSON.
  --artifacts-json <path>          Read saved artifact list JSON.
  --artifacts-dir <path>           Directory containing downloaded small release artifacts.
  --stable-session <path>          Canonical opl_app_stable_release_session.v3 state (diagnostic read only).
  --promotion-saga-receipt <path>  Optional historical receipt bytes for read-only inspection.
  --completion-manifest <path>     Write the output-generation completion manifest last.
  --artifact-profile <profile>     primary, diagnostics, or readiness-inputs. Default: primary.
  --no-download                    Do not download artifacts; read --artifacts-dir only.
  --agent-wall-time <duration>     Operator-loop duration, for example 2h6m43s.
  --agent-started-at <iso>         Operator-loop start timestamp.
  --agent-finished-at <iso>        Operator-loop finish timestamp.
  --help                          Show this message.
`);
}

function parseArtifactProfile(value: string): ArtifactProfile {
  if (value === 'primary' || value === 'diagnostics' || value === 'readiness-inputs') {
    return value;
  }
  throw new Error('--artifact-profile must be primary, diagnostics, or readiness-inputs.');
}

function parseArgs(argv: string[]): Options {
  const parsed = defaultOptions();
  const { values, tokens } = parseNodeArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'string' },
      'run-id': { type: 'string', multiple: true },
      repo: { type: 'string' },
      'out-dir': { type: 'string' },
      'output-dir': { type: 'string' },
      output: { type: 'string' },
      markdown: { type: 'string' },
      monitor: { type: 'string' },
      notification: { type: 'string' },
      'run-json': { type: 'string', multiple: true },
      'jobs-json': { type: 'string' },
      'artifacts-json': { type: 'string' },
      'artifacts-dir': { type: 'string' },
      'stable-session': { type: 'string' },
      'promotion-saga-receipt': { type: 'string' },
      'completion-manifest': { type: 'string' },
      'artifact-profile': { type: 'string' },
      'no-download': { type: 'boolean' },
      'agent-started-at': { type: 'string' },
      'agent-finished-at': { type: 'string' },
      'agent-wall-time': { type: 'string' },
    },
    tokens: true,
  });

  if (values.help) {
    usage();
    process.exit(0);
  }

  parsed.version = values.version ?? parsed.version;
  parsed.runId = values['run-id']?.at(-1) ?? parsed.runId;
  parsed.repo = values.repo ?? parsed.repo;
  parsed.output = values.output ?? parsed.output;
  parsed.markdown = values.markdown ?? parsed.markdown;
  parsed.monitor = values.monitor ?? parsed.monitor;
  parsed.notification = values.notification ?? parsed.notification;
  parsed.runJsonPath = values['run-json']?.at(-1) ?? parsed.runJsonPath;
  parsed.jobsJsonPath = values['jobs-json'] ?? parsed.jobsJsonPath;
  parsed.artifactsJsonPath = values['artifacts-json'] ?? parsed.artifactsJsonPath;
  parsed.artifactsDir = values['artifacts-dir'] ?? parsed.artifactsDir;
  parsed.stableSessionPath = values['stable-session'] ?? parsed.stableSessionPath;
  parsed.promotionSagaReceiptPath = values['promotion-saga-receipt'] ?? parsed.promotionSagaReceiptPath;
  parsed.completionManifest = values['completion-manifest'] ?? parsed.completionManifest;
  parsed.agentStartedAt = values['agent-started-at'] ?? parsed.agentStartedAt;
  parsed.agentFinishedAt = values['agent-finished-at'] ?? parsed.agentFinishedAt;
  parsed.agentWallTime = values['agent-wall-time'] ?? parsed.agentWallTime;
  parsed.noDownload = values['no-download'] ?? parsed.noDownload;

  const outDirToken = tokens
    .filter((token) => token.kind === 'option' && (token.name === 'out-dir' || token.name === 'output-dir'))
    .at(-1);
  if (outDirToken?.value) parsed.outDir = outDirToken.value;
  if (values['artifact-profile']) parsed.artifactProfile = parseArtifactProfile(values['artifact-profile']);

  if (!parsed.version.trim()) throw new Error('Pass --version <version> or set OPL_RELEASE_VERSION.');
  if (!parsed.runId.trim() && !parsed.runJsonPath.trim()) {
    throw new Error('Pass --run-id <github-actions-run-id> or --run-json <local-run-json>.');
  }

  const closeoutId = parsed.runId || 'local';
  const outDir = parsed.outDir
    ? path.resolve(parsed.outDir)
    : path.resolve(appRoot, 'artifacts', 'release-closeout', `v${parsed.version}-${closeoutId}`);
  const resolved: Options = {
    ...parsed,
    outDir,
    output: parsed.output ? path.resolve(parsed.output) : path.join(outDir, 'release-closeout.json'),
    markdown: parsed.markdown ? path.resolve(parsed.markdown) : path.join(outDir, 'release-closeout.md'),
    monitor: parsed.monitor ? path.resolve(parsed.monitor) : path.join(outDir, 'release-monitor.json'),
    notification: parsed.notification ? path.resolve(parsed.notification) : path.join(outDir, 'release-notification.json'),
    runJsonPath: parsed.runJsonPath ? path.resolve(parsed.runJsonPath) : '',
    jobsJsonPath: parsed.jobsJsonPath ? path.resolve(parsed.jobsJsonPath) : '',
    artifactsJsonPath: parsed.artifactsJsonPath ? path.resolve(parsed.artifactsJsonPath) : '',
    artifactsDir: parsed.artifactsDir ? path.resolve(parsed.artifactsDir) : path.join(outDir, 'artifacts'),
    stableSessionPath: parsed.stableSessionPath ? path.resolve(parsed.stableSessionPath) : '',
    promotionSagaReceiptPath: parsed.promotionSagaReceiptPath ? path.resolve(parsed.promotionSagaReceiptPath) : '',
    completionManifest: parsed.completionManifest
      ? path.resolve(parsed.completionManifest)
      : path.join(outDir, 'release-closeout-completion.json'),
  };
  const outputPaths = [resolved.output, resolved.markdown, resolved.monitor, resolved.notification, resolved.completionManifest];
  if (new Set(outputPaths).size !== outputPaths.length) {
    throw new Error('Closeout output and completion-manifest paths must be distinct.');
  }
  return resolved;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.outDir, { recursive: true });
  const outputGeneration = buildOutputGeneration(options, appRoot);
  const summaryBase = buildSummary(options, outputGeneration, appRoot);
  const monitor = buildMonitorSummary(summaryBase);
  const notification = buildNotificationPayload(summaryBase, monitor);
  const summary = { ...summaryBase, monitor, notification_payload: notification };
  writeJson(options.output, summary);
  writeJson(options.monitor, monitor);
  writeJson(options.notification, notification);
  writeMarkdownAtomic(options.markdown, summary, monitor);
  writeCompletionManifest(options, outputGeneration, appRoot);
  console.log(JSON.stringify({
    status: 'diagnostics_only',
    monitor_state: monitor.state,
    output: path.relative(appRoot, options.output),
    markdown: path.relative(appRoot, options.markdown),
    monitor: path.relative(appRoot, options.monitor),
    notification: path.relative(appRoot, options.notification),
    completion_manifest: path.relative(appRoot, options.completionManifest),
    output_generation_id: outputGeneration.id,
    next_action: summary.decision.next_action,
    mutation_authorized: false,
  }, null, 2));
}

main();
