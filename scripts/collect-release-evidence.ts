#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  applyReleaseEvidenceBundleDirArg,
  defaultReleaseEvidenceBundleDir,
  resolveEvidenceBundlePath,
  resolveRequiredReleaseEvidenceBundleDir,
} from './release-evidence-paths.ts';
import { readJsonFile, recordOrNull } from './release-json-helpers.ts';
import {
  isFrameworkV2Evidence, openFrameworkV2Evidence, resolveFrameworkV2Action, validateFrameworkV2State,
} from './framework-v2-evidence.ts';
import { stateReadback, drilldownReadback, actionReadback } from './framework-v2-release-evidence.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commandMaxBuffer = 128 * 1024 * 1024;

type Options = {
  bundleDir: string;
  actionId: string;
  version: string;
  tag: string;
  requiredConditionals: string[];
  artifacts: Record<string, string>;
  evidenceSourceDirs: string[];
  typedBlockers: Record<string, string>;
  executeAction: boolean;
  overwrite: boolean;
  oplBin: string;
};

type CollectedArtifactId =
  | 'app_state_summary'
  | 'app_state_full'
  | 'drilldown_full'
  | 'action_dry_run_result'
  | 'action_execute_result';

type ManifestArtifact = {
  id: string;
  status: string;
};

type EvidenceArtifact = {
  id: string;
  path: string;
};

const valueOptionTokens = [
  '--action-id',
  '--version',
  '--tag',
  '--require-conditional',
  '--artifact',
  '--evidence-source-dir',
  '--typed-blocker',
  '--opl-bin',
];

function readArgValue(argv: string[], index: number, token: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${token}`);
  }
  return value;
}

function setUniquePathOption(target: Record<string, string>, token: '--artifact' | '--typed-blocker', value: string): void {
  const separatorIndex = value.indexOf('=');
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new Error(`${token} must use <artifact_id>=<source_path>.`);
  }
  const artifactId = value.slice(0, separatorIndex);
  if (Object.hasOwn(target, artifactId)) {
    throw new Error(`Duplicate ${token} entry: ${artifactId}`);
  }
  target[artifactId] = path.resolve(value.slice(separatorIndex + 1));
}

function isValueOptionToken(token: string): boolean {
  return valueOptionTokens.includes(token);
}

function applyValueOption(parsed: Options, token: string, value: string): void {
  if (token === '--action-id') {
    parsed.actionId = value;
    return;
  }
  if (token === '--version') {
    parsed.version = value;
    return;
  }
  if (token === '--tag') {
    parsed.tag = value;
    return;
  }
  if (token === '--require-conditional') {
    parsed.requiredConditionals.push(value);
    return;
  }
  if (token === '--artifact') {
    setUniquePathOption(parsed.artifacts, '--artifact', value);
    return;
  }
  if (token === '--evidence-source-dir') {
    parsed.evidenceSourceDirs.push(path.resolve(value));
    return;
  }
  if (token === '--typed-blocker') {
    setUniquePathOption(parsed.typedBlockers, '--typed-blocker', value);
    return;
  }
  if (token === '--opl-bin') {
    parsed.oplBin = value;
  }
}

function parseArgs(argv: string[]): Options {
  const parsed: Options = {
    bundleDir: defaultReleaseEvidenceBundleDir(),
    actionId: process.env.OPL_RELEASE_EVIDENCE_ACTION_ID || '',
    version: process.env.OPL_RELEASE_VERSION || '',
    tag: process.env.OPL_RELEASE_TAG || '',
    requiredConditionals: (process.env.OPL_RELEASE_EVIDENCE_REQUIRED_CONDITIONALS || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
    artifacts: {},
    evidenceSourceDirs: [],
    typedBlockers: {},
    executeAction: false,
    overwrite: false,
    oplBin: process.env.OPL_BIN || 'opl',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--execute-action') {
      parsed.executeAction = true;
      continue;
    }
    if (token === '--overwrite') {
      parsed.overwrite = true;
      continue;
    }
    if (token === '--bundle-dir') {
      const optionIndex = applyReleaseEvidenceBundleDirArg(argv, index, (value) => {
        parsed.bundleDir = value;
      });
      if (optionIndex === null) throw new Error(`Unknown argument: ${token}`);
      index = optionIndex;
      continue;
    }
    if (!isValueOptionToken(token)) {
      throw new Error(`Unknown argument: ${token}`);
    }
    const value = readArgValue(argv, index, token);
    applyValueOption(parsed, token, value);
    index += 1;
  }

  if (!parsed.actionId.trim()) {
    throw new Error('Pass --action-id <opl-runtime-safe-action-id> or set OPL_RELEASE_EVIDENCE_ACTION_ID.');
  }

  return {
    ...parsed,
    bundleDir: resolveRequiredReleaseEvidenceBundleDir(parsed.bundleDir),
  };
}

function resolveBundlePath(bundleDir: string, artifactPath: string): string {
  return resolveEvidenceBundlePath(bundleDir, artifactPath, { allowAbsoluteArtifactPath: true });
}

function writeJsonArtifact(bundleDir: string, artifactPath: string, payload: unknown): void {
  const resolved = resolveBundlePath(bundleDir, artifactPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readReleaseEvidenceArtifacts(): EvidenceArtifact[] {
  const releaseContract = readJsonFile<{
    operator_evidence_bundle?: {
      required_artifacts?: EvidenceArtifact[];
      conditional_artifacts?: EvidenceArtifact[];
      optional_diagnostic_artifacts?: EvidenceArtifact[];
    };
  }>(path.join(appRoot, 'contracts', 'app-release-channel.json'));
  const requiredArtifacts = releaseContract.operator_evidence_bundle?.required_artifacts;
  if (!Array.isArray(requiredArtifacts)) {
    throw new Error('Release evidence bundle contract must declare required_artifacts.');
  }
  const conditionalArtifacts = releaseContract.operator_evidence_bundle?.conditional_artifacts;
  if (conditionalArtifacts !== undefined && !Array.isArray(conditionalArtifacts)) {
    throw new Error('Release evidence bundle conditional_artifacts must be an array when present.');
  }
  const optionalDiagnosticArtifacts = releaseContract.operator_evidence_bundle?.optional_diagnostic_artifacts;
  if (optionalDiagnosticArtifacts !== undefined && !Array.isArray(optionalDiagnosticArtifacts)) {
    throw new Error('Release evidence bundle optional_diagnostic_artifacts must be an array when present.');
  }
  return [...requiredArtifacts, ...(conditionalArtifacts ?? []), ...(optionalDiagnosticArtifacts ?? [])];
}

function artifactSourceCandidates(artifact: EvidenceArtifact): string[] {
  const candidatesById: Record<string, string[]> = {
    runtime_screenshot: [
      'screenshots/runtime.png',
      'runtime.png',
      'settings-pages/runtime.png',
    ],
    full_screenshot: [
      'screenshots/full.png',
      'full.png',
      'first-run-beginner.png',
      'first-launch.png',
    ],
    action_screenshot: [
      'screenshots/action.png',
      'action.png',
    ],
    first_run_vm_summary: [
      'tart-smoke-summary.json',
    ],
    guest_smoke_summary: [
      'artifacts/smoke-summary.json',
      'smoke-summary.json',
    ],
    assistant_route_smoke_summary: [
      'artifacts/assistant-route-smoke-summary.json',
      'assistant-route-smoke-summary.json',
    ],
    codex_functional_check_summary: [
      'artifacts/codex-functional-check-summary.json',
      'codex-functional-check-summary.json',
    ],
    codex_ai_self_check_summary: [
      'artifacts/codex-ai-self-check-summary.json',
      'codex-ai-self-check-summary.json',
    ],
    assistant_route_smoke_mas_screenshot: [
      'artifacts/assistant-route-smoke/mas.png',
      'assistant-route-smoke/mas.png',
    ],
    assistant_route_smoke_mag_screenshot: [
      'artifacts/assistant-route-smoke/mag.png',
      'assistant-route-smoke/mag.png',
    ],
    assistant_route_smoke_rca_screenshot: [
      'artifacts/assistant-route-smoke/rca.png',
      'assistant-route-smoke/rca.png',
    ],
    remote_release_verification: [
      'remote-release-verification.json',
    ],
    docker_webui_clean_vm_evidence: [
      'docker-webui-clean-vm-evidence-validation.json',
    ],
  };
  const candidates = candidatesById[artifact.id] ?? [artifact.path];
  return [...new Set([artifact.path, ...candidates])];
}

function discoverEvidenceSourceArtifacts(options: Options, artifacts: EvidenceArtifact[]): Record<string, string> {
  const discovered: Record<string, string> = {};
  for (const sourceDir of options.evidenceSourceDirs) {
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Missing release evidence source directory: ${sourceDir}`);
    }
    const stat = fs.statSync(sourceDir);
    if (!stat.isDirectory()) {
      throw new Error(`Release evidence source must be a directory: ${sourceDir}`);
    }
    for (const artifact of artifacts) {
      if (Object.hasOwn(discovered, artifact.id)) {
        continue;
      }
      for (const candidate of artifactSourceCandidates(artifact)) {
        const candidatePath = path.resolve(sourceDir, candidate);
        const relative = path.relative(sourceDir, candidatePath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          continue;
        }
        if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
          discovered[artifact.id] = candidatePath;
          break;
        }
      }
    }
  }
  return discovered;
}

function attachExternalArtifacts(options: Options, protectedIds: ReadonlySet<string>): string[] {
  if (
    Object.keys(options.artifacts).length === 0
    && options.evidenceSourceDirs.length === 0
    && Object.keys(options.typedBlockers).length === 0
  ) {
    return [];
  }
  const releaseEvidenceArtifacts = readReleaseEvidenceArtifacts();
  const discoveredArtifacts = discoverEvidenceSourceArtifacts(options, releaseEvidenceArtifacts);
  const artifactById = new Map(releaseEvidenceArtifacts.map((artifact) => [artifact.id, artifact]));
  const attached: string[] = [];
  for (const artifactId of Object.keys(options.artifacts)) {
    if (!artifactById.has(artifactId)) {
      throw new Error(`Unknown release evidence artifact id: ${artifactId}`);
    }
  }
  for (const artifactId of Object.keys(options.typedBlockers)) {
    if (!artifactById.has(artifactId)) {
      throw new Error(`Unknown release evidence artifact id for typed blocker: ${artifactId}`);
    }
  }
  for (const artifact of releaseEvidenceArtifacts) {
    const artifactId = artifact.id;
    if (protectedIds.has(artifactId)) {
      if (Object.hasOwn(options.artifacts, artifactId) || Object.hasOwn(options.typedBlockers, artifactId)) {
        throw new Error(`The selected Framework provides runtime evidence for ${artifactId}; use the collector's live result.`);
      }
      continue;
    }
    const sourcePath = options.artifacts[artifactId] ?? discoveredArtifacts[artifactId];
    if (!sourcePath) {
      continue;
    }
    const releaseArtifact = artifactById.get(artifactId);
    if (!releaseArtifact) {
      throw new Error(`Unknown release evidence artifact id: ${artifactId}`);
    }
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing source file for ${artifactId}: ${sourcePath}`);
    }
    const stat = fs.statSync(sourcePath);
    if (!stat.isFile()) {
      throw new Error(`Source for ${artifactId} must be a file: ${sourcePath}`);
    }
    const targetPath = resolveBundlePath(options.bundleDir, releaseArtifact.path);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    attached.push(artifactId);
  }
  for (const artifact of releaseEvidenceArtifacts) {
    const artifactId = artifact.id;
    const sourcePath = options.typedBlockers[artifactId];
    if (!sourcePath) {
      continue;
    }
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing typed blocker file for ${artifactId}: ${sourcePath}`);
    }
    if (!fs.statSync(sourcePath).isFile()) {
      throw new Error(`Typed blocker for ${artifactId} must be a file: ${sourcePath}`);
    }
    const blockerPath = resolveBundlePath(options.bundleDir, path.join('typed-blockers', `${artifactId}.json`));
    fs.mkdirSync(path.dirname(blockerPath), { recursive: true });
    fs.copyFileSync(sourcePath, blockerPath);
    attached.push(`${artifactId}:typed_blocker`);
  }
  return attached;
}

function runJsonCommand(options: Options, args: string[]): unknown {
  const result = spawnSync(options.oplBin, args, {
    cwd: appRoot,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: commandMaxBuffer,
  });
  if (result.error) {
    throw new Error(`OPL command failed to launch or buffer output: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error([
      `OPL command failed: ${options.oplBin} ${args.join(' ')}`,
      result.stderr.trim(),
      result.stdout.trim(),
    ].filter(Boolean).join('\n'));
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`OPL command returned invalid JSON: ${options.oplBin} ${args.join(' ')}\n${message}`);
  }
}

function runNodeScript(args: string[]): unknown {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', ...args], {
    cwd: appRoot,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error([
      `Node script failed: ${args.join(' ')}`,
      result.stderr.trim(),
      result.stdout.trim(),
    ].filter(Boolean).join('\n'));
  }
  return JSON.parse(result.stdout);
}

function validateGeneratedBundle(options: Options): void {
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    'scripts/validate-release-evidence-bundle.ts',
    '--bundle-dir',
    options.bundleDir,
    '--allow-missing-evidence',
    ...options.requiredConditionals.flatMap((artifactId) => ['--require-conditional', artifactId]),
  ], {
    cwd: appRoot,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error([
      'Release evidence bundle validation failed after collection.',
      result.stderr.trim(),
      result.stdout.trim(),
    ].filter(Boolean).join('\n'));
  }
}

function writeRuntimeBlocker(options: Options, artifact: CollectedArtifactId, reason: string, nextAction: string) {
  writeJsonArtifact(options.bundleDir, `typed-blockers/${artifact}.json`, {
    artifact_id: artifact, owner: 'one-person-lab', blocker_kind: 'framework_evidence_unavailable',
    typed_blocker_ref: `typed_blocker_ref://one-person-lab-app/framework-v2/${artifact}`,
    reason, next_action: nextAction, evidence_refs: ['app-state-summary.json', 'app-state-full.json'],
  });
}

async function collectFrameworkV2Evidence(options: Options): Promise<CollectedArtifactId[]> {
  const rpc = await openFrameworkV2Evidence(options.oplBin);
  const fast = validateFrameworkV2State(await rpc('app.state.get', { profile: 'fast' }), 'fast');
  writeJsonArtifact(options.bundleDir, 'app-state-summary.json', stateReadback(fast, 'fast'));
  writeJsonArtifact(options.bundleDir, 'app-state-full.json', stateReadback(await rpc('app.state.get', { profile: 'full' }), 'full'));
  const collected: CollectedArtifactId[] = ['app_state_summary', 'app_state_full'];
  try {
    const drilldown = await rpc('app.operatorDrilldown.get', {});
    writeJsonArtifact(options.bundleDir, 'drilldown-full.json', drilldownReadback(drilldown));
    collected.push('drilldown_full');
  } catch (error) {
    const rpcError = recordOrNull(error);
    if (rpcError?.rpcCode !== -32601 || rpcError.errorCode !== 'METHOD_NOT_FOUND') throw error;
    writeRuntimeBlocker(options, 'drilldown_full', 'The selected Framework does not implement app.operatorDrilldown.get.',
      'Use a Framework version that provides the full operator drilldown.');
  }
  const target = resolveFrameworkV2Action(fast, options.actionId);
  if (!target) {
    const reason = 'No enabled Package with a contribution handler declares the selected action ref.';
    const next = 'Select a declared action ref from an installed qualification Package.';
    writeRuntimeBlocker(options, 'action_dry_run_result', reason, next);
    if (options.executeAction) writeRuntimeBlocker(options, 'action_execute_result', reason, next);
    return collected;
  }
  for (const dryRun of options.executeAction ? [true, false] : [true]) {
    const response = await rpc('app.action.execute', {
      package_id: target.packageId, action_id: target.actionId, dry_run: dryRun,
    });
    const readback = actionReadback(response, target.packageId, target.actionId, dryRun);
    writeJsonArtifact(options.bundleDir, dryRun ? 'action-dry-run-result.json' : 'action-execute-result.json', readback);
    collected.push(dryRun ? 'action_dry_run_result' : 'action_execute_result');
  }
  return collected;
}

function collectRuntimeEvidence(options: Options): CollectedArtifactId[] {
  const collected: CollectedArtifactId[] = [];
  writeJsonArtifact(
    options.bundleDir,
    'app-state-summary.json',
    runJsonCommand(options, ['app', 'state', '--profile', 'fast', '--json']),
  );
  collected.push('app_state_summary');

  writeJsonArtifact(
    options.bundleDir,
    'app-state-full.json',
    runJsonCommand(options, ['app', 'state', '--profile', 'full', '--json']),
  );
  collected.push('app_state_full');

  writeJsonArtifact(
    options.bundleDir,
    'drilldown-full.json',
    runJsonCommand(options, ['runtime', 'app-operator-drilldown', '--detail', 'full', '--json']),
  );
  collected.push('drilldown_full');

  writeJsonArtifact(
    options.bundleDir,
    'action-dry-run-result.json',
    runJsonCommand(options, ['app', 'action', 'execute', '--action', options.actionId, '--dry-run', '--json']),
  );
  collected.push('action_dry_run_result');

  if (options.executeAction) {
    writeJsonArtifact(
      options.bundleDir,
      'action-execute-result.json',
      runJsonCommand(options, ['app', 'action', 'execute', '--action', options.actionId, '--json']),
    );
    collected.push('action_execute_result');
  }

  return collected;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (fs.existsSync(options.bundleDir) && !options.overwrite) {
    throw new Error(`Bundle directory already exists: ${options.bundleDir}. Pass --overwrite to refresh it.`);
  }
  fs.mkdirSync(options.bundleDir, { recursive: true });

  // A repeated capture must not reuse an earlier action receipt or a retired
  // producer's output if the selected runtime can no longer supply it.
  const runtimeArtifacts = new Set(['app_state_summary', 'app_state_full', 'drilldown_full', 'action_dry_run_result', 'action_execute_result']);
  if (options.overwrite) {
    for (const artifact of readReleaseEvidenceArtifacts().filter(entry => runtimeArtifacts.has(entry.id))) {
      fs.rmSync(resolveBundlePath(options.bundleDir, artifact.path), { force: true });
      fs.rmSync(resolveBundlePath(options.bundleDir, `typed-blockers/${artifact.id}.json`), { force: true });
    }
    fs.rmSync(resolveBundlePath(options.bundleDir, 'evidence-manifest.json'), { force: true });
  }
  const frameworkV2 = isFrameworkV2Evidence(options.oplBin);
  const collectedArtifacts = frameworkV2
    ? await collectFrameworkV2Evidence(options)
    : collectRuntimeEvidence(options);
  const attachedArtifacts = attachExternalArtifacts(options, frameworkV2 ? runtimeArtifacts : new Set());
  const manifest = runNodeScript([
    'scripts/write-release-evidence-manifest.ts',
    '--bundle-dir',
    options.bundleDir,
    '--overwrite',
    ...(options.version ? ['--version', options.version] : []),
    ...(options.tag ? ['--tag', options.tag] : []),
    ...options.requiredConditionals.flatMap((artifactId) => ['--require-conditional', artifactId]),
  ]) as {
    status: string;
    packaged_app_evidence: boolean;
    release_cohort?: unknown;
    current_cohort_evidence?: boolean;
  };
  validateGeneratedBundle(options);
  const manifestJson = JSON.parse(
    fs.readFileSync(resolveBundlePath(options.bundleDir, 'evidence-manifest.json'), 'utf8'),
  ) as {
    artifacts: ManifestArtifact[];
  };
  const blockedArtifacts = manifestJson.artifacts
    .filter((artifact) => artifact.status === 'typed_blocker')
    .map((artifact) => artifact.id);
  const missingArtifacts = manifestJson.artifacts
    .filter((artifact) => artifact.status === 'missing')
    .map((artifact) => artifact.id);

  console.log(JSON.stringify({
    status: manifest.status,
    bundle_dir: options.bundleDir,
    manifest_path: 'evidence-manifest.json',
    packaged_app_evidence: manifest.packaged_app_evidence,
    release_cohort: manifest.release_cohort,
    current_cohort_evidence: manifest.current_cohort_evidence === true,
    required_conditionals: [...new Set(options.requiredConditionals)],
    refs_only: true,
    action_id: options.actionId,
    action_execute_collected: collectedArtifacts.includes('action_execute_result'),
    collected_artifacts: collectedArtifacts,
    attached_artifacts: attachedArtifacts,
    blocked_artifact_count: blockedArtifacts.length,
    blocked_artifacts: blockedArtifacts,
    missing_artifact_count: missingArtifacts.length,
    missing_artifacts: missingArtifacts,
  }, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
