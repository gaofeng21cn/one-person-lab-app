#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';
import {
  buildAppReleaseL5EvidenceReadout,
  readAppReleaseL5ReadoutContract,
} from './app-release-l5-readout.ts';
import {
  buildAppReleaseOwnerVerdictReadout,
  readAppReleaseOwnerVerdictContract,
} from './app-release-owner-verdict.ts';
import { buildReleaseEvidenceCohort } from './release-evidence-cohort.ts';
import { findFileByName } from './release-file-helpers.ts';
import {
  arrayField,
  arrayOrEmpty,
  objectField,
  readJsonFile,
  recordOrNull,
  stringField,
} from './release-json-helpers.ts';
import { writeReleaseReadinessMarkdown } from './release-readiness-markdown.ts';
import {
  assertSharedReleaseReadinessOptions,
  buildSharedReleaseReadinessOptions,
  parseStrictBoolean,
} from './release-readiness-args.ts';
import {
  buildManifestSizeAnalysis,
  buildReadinessBottlenecks,
  buildReadinessOptimizationRecommendations,
  summarizeFullSizeBudget,
  summarizeRuntimeCacheEvents,
  warningsFromFullSizeBudget,
} from './release-readiness-full-profile.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type GateStatus = 'passed' | 'failed' | 'skipped';

type GateSummary = {
  status: GateStatus;
  required: boolean;
  job_name?: string;
  job_result?: string;
  artifact_name?: string;
  artifact_path?: string;
  reason?: string;
  fields?: Record<string, unknown>;
};

type Options = {
  version: string;
  releaseMode: string;
  includeFullPackage: boolean;
  runVmSmoke: boolean;
  publishDockerWebui: boolean;
  artifactsDir: string;
  jobResultsPath: string;
  output: string;
  markdown: string;
};

function parseArgs(argv: string[]): Options {
  const { values } = parseNodeArgs({
    args: argv,
    options: {
      version: { type: 'string' },
      'release-mode': { type: 'string' },
      'include-full-package': { type: 'string' },
      'run-vm-smoke': { type: 'string' },
      'publish-docker-webui': { type: 'string' },
      'artifacts-dir': { type: 'string' },
      'job-results': { type: 'string' },
      output: { type: 'string' },
      markdown: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  const parsed: Options = {
    ...buildSharedReleaseReadinessOptions(parseStrictBoolean),
    artifactsDir: process.env.OPL_RELEASE_READINESS_ARTIFACTS_DIR || '',
    jobResultsPath: process.env.OPL_RELEASE_READINESS_JOB_RESULTS || '',
    output: process.env.OPL_RELEASE_READINESS_OUTPUT || '',
    markdown: process.env.OPL_RELEASE_READINESS_MARKDOWN || '',
  };

  if (values.version !== undefined) parsed.version = values.version;
  if (values['release-mode'] !== undefined) parsed.releaseMode = values['release-mode'];
  if (values['include-full-package'] !== undefined) {
    parsed.includeFullPackage = parseStrictBoolean(values['include-full-package']);
  }
  if (values['run-vm-smoke'] !== undefined) {
    parsed.runVmSmoke = parseStrictBoolean(values['run-vm-smoke']);
  }
  if (values['publish-docker-webui'] !== undefined) {
    parsed.publishDockerWebui = parseStrictBoolean(values['publish-docker-webui'], true);
  }
  if (values['artifacts-dir'] !== undefined) parsed.artifactsDir = values['artifacts-dir'];
  if (values['job-results'] !== undefined) parsed.jobResultsPath = values['job-results'];
  if (values.output !== undefined) parsed.output = values.output;
  if (values.markdown !== undefined) parsed.markdown = values.markdown;

  assertSharedReleaseReadinessOptions(parsed);
  if (!parsed.artifactsDir.trim()) throw new Error('Pass --artifacts-dir <dir> or set OPL_RELEASE_READINESS_ARTIFACTS_DIR.');
  return {
    ...parsed,
    artifactsDir: path.resolve(parsed.artifactsDir),
    jobResultsPath: parsed.jobResultsPath ? path.resolve(parsed.jobResultsPath) : '',
    output: parsed.output ? path.resolve(parsed.output) : path.resolve(appRoot, 'release-readiness-summary.json'),
    markdown: parsed.markdown ? path.resolve(parsed.markdown) : '',
  };
}

function artifactDir(options: Options, artifactName: string) {
  return path.join(options.artifactsDir, artifactName);
}

function readJobResults(options: Options) {
  if (!options.jobResultsPath || !fs.existsSync(options.jobResultsPath)) {
    return {};
  }
  const payload = readJsonFile(options.jobResultsPath);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Release readiness job results must be a JSON object.');
  }
  return payload as Record<string, string>;
}

function applyJobResult(gate: GateSummary, jobResults: Record<string, string>, jobName: string, required: boolean): GateSummary {
  const result = jobResults[jobName] || 'unknown';
  const expectedSkipped = !required && result === 'skipped';
  const passed = result === 'success' || expectedSkipped;
  const status = passed ? gate.status : required ? 'failed' : 'skipped';
  const reason = passed
    ? gate.reason
    : gate.reason
      ? `Workflow job ${jobName} result is ${result}; expected ${required ? 'success' : 'success or skipped'}. ${gate.reason}`
      : `Workflow job ${jobName} result is ${result}; expected ${required ? 'success' : 'success or skipped'}.`;
  return {
    ...gate,
    status,
    required,
    job_name: jobName,
    job_result: result,
    reason,
  };
}

function missingGate(required: boolean, artifactName: string, reason: string): GateSummary {
  return {
    status: required ? 'failed' : 'skipped',
    required,
    artifact_name: artifactName,
    reason,
  };
}

function jsonGate(options: Options, gate: {
  required: boolean;
  artifactName: string;
  fileName: string;
  validate: (payload: Record<string, unknown>) => { fields?: Record<string, unknown>; reason?: string };
}): GateSummary {
  const root = artifactDir(options, gate.artifactName);
  const filePath = findFileByName(root, gate.fileName);
  if (!filePath) {
    return missingGate(gate.required, gate.artifactName, `Missing ${gate.fileName} in ${gate.artifactName}.`);
  }
  try {
    const payload = readJsonFile(filePath);
    const record = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
    const result = gate.validate(record);
    if (result.reason) {
      return {
        status: gate.required ? 'failed' : 'skipped',
        required: gate.required,
        artifact_name: gate.artifactName,
        artifact_path: path.relative(options.artifactsDir, filePath),
        reason: result.reason,
        fields: result.fields,
      };
    }
    return {
      status: 'passed',
      required: gate.required,
      artifact_name: gate.artifactName,
      artifact_path: path.relative(options.artifactsDir, filePath),
      fields: result.fields,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: gate.required ? 'failed' : 'skipped',
      required: gate.required,
      artifact_name: gate.artifactName,
      artifact_path: path.relative(options.artifactsDir, filePath),
      reason: message,
    };
  }
}

function textArtifactGate(options: Options, gate: {
  required: boolean;
  artifactName: string;
  files: string[];
}): GateSummary {
  const root = artifactDir(options, gate.artifactName);
  const foundFiles = gate.files.map((fileName) => findFileByName(root, fileName));
  const missing = gate.files.filter((_, index) => !foundFiles[index]);
  if (missing.length > 0) {
    return missingGate(gate.required, gate.artifactName, `Missing ${missing.join(', ')} in ${gate.artifactName}.`);
  }
  const sizePath = foundFiles[gate.files.indexOf('opl-webui-image-size-bytes.txt')];
  const imageSizeBytes = sizePath ? Number(fs.readFileSync(sizePath, 'utf8').trim()) : null;
  return {
    status: 'passed',
    required: gate.required,
    artifact_name: gate.artifactName,
    artifact_path: foundFiles.map((filePath) => path.relative(options.artifactsDir, filePath as string)).join(', '),
    fields: {
      files: gate.files,
      image_size_bytes: Number.isFinite(imageSizeBytes) ? imageSizeBytes : null,
    },
  };
}

function statusString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function statusOf(record: Record<string, unknown> | null) {
  if (!record) return 'missing';
  return typeof record.status === 'string' ? record.status : 'unknown';
}

function basenameFromUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    const name = path.basename(parsed.pathname);
    return name || null;
  } catch {
    const name = path.basename(value);
    return name || null;
  }
}

function remoteAssetDigestByName(remoteGate: GateSummary, assetName: string | null) {
  if (!assetName) return null;
  const verifiedAssets = arrayField(remoteGate.fields ?? null, 'verified_assets')
    .filter((asset) => asset && typeof asset === 'object' && !Array.isArray(asset)) as Record<string, unknown>[];
  const matched = verifiedAssets.find((asset) => asset.name === assetName);
  return stringField(matched, 'sha256');
}

function validateHomebrewDigestCoherence(
  payload: Record<string, unknown>,
  remoteGate: GateSummary,
  fields: Record<string, unknown>,
) {
  const assetName = basenameFromUrl(payload.download_url);
  const checksumSha256 = stringField(payload, 'checksum_sha256');
  const remoteAssetSha256 = remoteAssetDigestByName(remoteGate, assetName);
  fields.download_url = payload.download_url ?? null;
  fields.download_asset_name = assetName;
  fields.checksum_sha256 = checksumSha256;
  fields.remote_asset_sha256 = remoteAssetSha256;
  if (!assetName) return 'Homebrew tap plan is missing a release asset download_url.';
  if (!checksumSha256) return 'Homebrew tap plan is missing checksum_sha256.';
  if (!/^[a-f0-9]{64}$/i.test(checksumSha256)) return `Homebrew checksum ${checksumSha256} is not a 64-character SHA-256 digest.`;
  if (!remoteAssetSha256) return `Remote verification did not include asset ${assetName} with sha256 evidence.`;
  if (checksumSha256.toLowerCase() !== remoteAssetSha256.toLowerCase()) {
    return `Homebrew checksum ${checksumSha256} does not match remote release digest ${remoteAssetSha256} for ${assetName}.`;
  }
  return null;
}

function readPreflightSummary(options: Options) {
  const artifactName = `release-preflight-summary-${options.version}`;
  const preflightPath = findFileByName(artifactDir(options, artifactName), 'release-preflight-summary.json');
  if (!preflightPath) return { artifactName, path: null, summary: null };
  const summary = readJsonFile(preflightPath);
  return {
    artifactName,
    path: path.relative(options.artifactsDir, preflightPath),
    summary: objectField(summary, 'homebrew') ? summary as Record<string, unknown> : null,
  };
}

function summarizeHomebrewReadiness(options: Options, preflightSummary: Record<string, unknown> | null) {
  const homebrew = objectField(preflightSummary, 'homebrew');
  const releaseTarget = objectField(preflightSummary, 'release_target');
  if (!homebrew) {
    return {
      tap_update_required: false,
      tap_token_required: false,
      tap_update_owner: 'not_required_for_this_run',
      reason: 'Preflight summary was unavailable; a draft cannot update Homebrew before promotion.',
      source: 'fallback_release_mode',
      release_target_kind: null,
    };
  }
  return {
    tap_update_required: homebrew.tap_update_required === true,
    tap_token_required: homebrew.tap_token_required === true,
    tap_update_owner: typeof homebrew.tap_update_owner === 'string' ? homebrew.tap_update_owner : null,
    reason: typeof homebrew.reason === 'string' ? homebrew.reason : null,
    source: 'release_preflight',
    release_target_kind: typeof releaseTarget?.kind === 'string' ? releaseTarget.kind : null,
  };
}

function buildRemoteReleaseVerificationGate(options: Options, artifactName: string) {
  return jsonGate(options, {
    required: true,
    artifactName,
    fileName: 'remote-release-verification.json',
    validate: (payload) => {
      const includeFullPackage = payload.include_full_package === true;
      const fields = {
        include_full_package: payload.include_full_package,
        verified_asset_count: payload.verified_asset_count,
        verified_assets: payload.verified_assets ?? [],
        full_first_install_budget: payload.full_first_install_budget ?? null,
      };
      if (payload.status !== 'passed') return { reason: `Remote verification status is ${statusString(payload.status) || 'unknown'}.`, fields };
      if (options.includeFullPackage && !includeFullPackage) return { reason: 'Remote verification did not include the Full package.', fields };
      return { fields };
    },
  });
}

function buildVmSmokeGate(options: Options, artifactName: string, profile: string, required: boolean) {
  return jsonGate(options, {
    required,
    artifactName,
    fileName: 'tart-smoke-summary.json',
    validate: (payload) => {
      const fields = {
        runtime_profile: payload.runtime_profile,
        settings_smoke: payload.settings_smoke ?? null,
      };
      if (payload.status !== 'passed') return { reason: `VM smoke status is ${statusString(payload.status) || 'unknown'}.`, fields };
      if (payload.runtime_profile !== profile) return { reason: `Expected runtime_profile ${profile}, got ${String(payload.runtime_profile)}.`, fields };
      const settingsSmoke = payload.settings_smoke as Record<string, unknown> | undefined;
      if (!settingsSmoke || settingsSmoke.status !== 'passed') return { reason: 'VM smoke did not include passed Settings evidence.', fields };
      return { fields };
    },
  });
}

function buildHomebrewTapGate(options: Options, remoteGate: GateSummary, gate: {
  required: boolean;
  artifactName: string;
  label: string;
  packageKind: string;
  remotePublicationReason: string;
  includeFullBoundaryPolicy?: boolean;
}) {
  return jsonGate(options, {
    required: gate.required,
    artifactName: gate.artifactName,
    fileName: 'homebrew-tap-plan.json',
    validate: (payload) => {
      const policy = objectField(payload, 'policy');
      const fields: Record<string, unknown> = {
        channel: payload.channel,
        package_kind: payload.package_kind,
        version: payload.version,
        tap_repo: 'gaofeng21cn/homebrew-one-person-lab',
        remote_write_mode: policy?.remote_write_mode ?? null,
        publishes_or_pushes_remote: policy?.publishes_or_pushes_remote ?? null,
      };
      if (gate.includeFullBoundaryPolicy) {
        fields.full_first_install_allowed = policy?.full_first_install_allowed ?? null;
        fields.standard_updater_visible = policy?.standard_updater_visible ?? null;
      }
      if (payload.channel !== 'stable') return { reason: `${gate.label} channel is ${statusString(payload.channel) || 'unknown'}.`, fields };
      if (payload.package_kind !== gate.packageKind) return { reason: `${gate.label} package_kind is ${statusString(payload.package_kind) || 'unknown'}.`, fields };
      if (payload.version !== options.version) return { reason: `${gate.label} version is ${statusString(payload.version) || 'unknown'}.`, fields };
      if (policy?.remote_write_mode !== 'direct_commit' || policy?.publishes_or_pushes_remote !== true) {
        return { reason: gate.remotePublicationReason, fields };
      }
      if (
        gate.includeFullBoundaryPolicy
        && (policy?.full_first_install_allowed !== true || policy?.standard_updater_visible !== false)
      ) {
        return { reason: 'Full Homebrew tap plan did not preserve Full first-install boundary policy.', fields };
      }
      const digestReason = validateHomebrewDigestCoherence(payload, remoteGate, fields);
      if (digestReason) return { reason: digestReason, fields };
      return { fields };
    },
  });
}

function buildOperatorEvidenceBundleGate(options: Options, artifactName: string) {
  return jsonGate(options, {
    required: false,
    artifactName,
    fileName: 'evidence-validation-summary.json',
    validate: (payload) => {
      const forbiddenAuthority = arrayOrEmpty(payload.forbidden_authority);
      const fields = {
        bundle_dir: payload.bundle_dir ?? null,
        manifest_path: payload.manifest_path ?? null,
        packaged_app_evidence: payload.packaged_app_evidence ?? null,
        authority_boundary: payload.authority_boundary ?? payload.evidence_boundary ?? null,
        verified_artifact_count: payload.verified_artifact_count ?? null,
        missing_artifact_count: payload.missing_artifact_count ?? null,
        blocked_artifact_count: payload.blocked_artifact_count ?? null,
        l5_evidence_readout: payload.l5_evidence_readout ?? null,
      };
      if (payload.status !== 'passed') return { reason: `Operator evidence bundle status is ${statusString(payload.status) || 'unknown'}.`, fields };
      if (payload.packaged_app_evidence !== true) return { reason: 'Operator evidence bundle did not claim packaged_app_evidence=true.', fields };
      if ((payload.authority_boundary ?? payload.evidence_boundary) !== 'refs_only_no_runtime_truth_domain_truth_artifact_or_quality_authority') {
        return { reason: 'Operator evidence bundle did not preserve refs-only authority boundary.', fields };
      }
      if (Number(payload.missing_artifact_count) !== 0 || Number(payload.blocked_artifact_count) !== 0) {
        return { reason: 'Operator evidence bundle has missing or blocked artifacts.', fields };
      }
      for (const forbidden of [
        'runtime_truth',
        'provider_implementation',
        'domain_truth',
        'domain_quality_verdict',
        'domain_artifact_authority',
      ]) {
        if (!forbiddenAuthority.includes(forbidden)) {
          return { reason: `Operator evidence bundle is missing forbidden authority marker ${forbidden}.`, fields };
        }
      }
      return { fields };
    },
  });
}

function buildOneShotGate(options: Options, artifactName: string) {
  return jsonGate(options, {
    required: true,
    artifactName,
    fileName: 'opl-one-shot-system-initialize.json',
    validate: (payload) => {
      const systemInitialize = recordOrNull(payload.system_initialize);
      const setupFlow = recordOrNull(systemInitialize?.setup_flow);
      const fields: Record<string, unknown> = {
        installer_entry: './install.sh --with-app --skip-packages',
        bootstrap_status_source: 'workflow job result one-shot-app-installer-smoke',
        initialization_command: 'opl system initialize --json',
        initialization_source: 'system_initialize.setup_flow',
        artifact_files: ['opl-one-shot-system-initialize.json'],
        setup_flow_status: setupFlow?.status ?? payload.status ?? null,
        setup_flow_phase: setupFlow?.phase ?? null,
        core_progress: recordOrNull(setupFlow?.core_progress),
        full_readiness_progress: recordOrNull(setupFlow?.full_readiness_progress),
        maintenance_progress: recordOrNull(setupFlow?.maintenance_progress),
        blockers: arrayOrEmpty(setupFlow?.blockers),
        next_visible_step: setupFlow?.next_visible_step ?? null,
        retry_detected: false,
        skip_modules: true,
      };
      if (payload.status === 'failed') {
        const error = recordOrNull(payload.error);
        if (error) fields.error = error;
        const message = typeof error?.message === 'string' ? error.message : 'One-shot installer reported failed status.';
        return { reason: message, fields };
      }
      if (setupFlow?.status && !['ready_to_launch', 'passed', 'initialized'].includes(String(setupFlow.status))) {
        return { reason: `One-shot setup_flow status is ${String(setupFlow.status)}.`, fields };
      }
      return { fields };
    },
  });
}

function buildWebuiGhcrGate(options: Options, artifactName: string) {
  return jsonGate(options, {
    required: true,
    artifactName,
    fileName: 'opl-webui-ghcr-publish.json',
    validate: (payload) => {
      const tags = arrayOrEmpty(payload.tags);
      const fields = {
        image: payload.image,
        tags,
        draft_candidate_push: payload.draft_candidate_push ?? null,
        build_reuse: payload.build_reuse ?? null,
        package_access_required: payload.package_access_required ?? null,
        error: payload.error ?? null,
      };
      if (options.releaseMode === 'draft_candidate') {
        if (payload.status !== 'draft_not_pushed') {
          return { reason: `Draft WebUI GHCR publish status is ${statusString(payload.status) || 'unknown'}.`, fields };
        }
        if (payload.draft_candidate_push !== false) {
          return { reason: 'Draft WebUI GHCR publish must not push tags.', fields };
        }
        return { fields };
      }
      if (payload.status !== 'published') {
        return { reason: `WebUI GHCR publish status is ${statusString(payload.status) || 'unknown'}.`, fields };
      }
      for (const requiredTag of [options.version, 'stable']) {
        if (!tags.includes(requiredTag)) {
          return { reason: `WebUI GHCR publish summary is missing tag ${requiredTag}.`, fields };
        }
      }
      return { fields };
    },
  });
}

function buildDockerCleanVmEvidenceGate(options: Options, artifactName: string) {
  return jsonGate(options, {
    required: true,
    artifactName,
    fileName: 'docker-webui-clean-vm-evidence-validation.json',
    validate: (payload) => {
      const summaries = Array.isArray(payload.summaries)
        ? payload.summaries.filter((summary) => summary && typeof summary === 'object' && !Array.isArray(summary)) as Record<string, unknown>[]
        : [];
      const cleanLinux = summaries.find((summary) => summary.gate_id === 'clean_linux_vm') ?? null;
      const cleanWindows = summaries.find((summary) => summary.gate_id === 'clean_windows_vm') ?? null;
      const fields = {
        aggregate_status: payload.status ?? null,
        required_gates: Array.isArray(payload.required_gates) ? payload.required_gates : [],
        optional_gates: Array.isArray(payload.optional_gates) ? payload.optional_gates : [],
        clean_linux_vm: cleanLinux,
        clean_windows_vm: cleanWindows,
        release_readiness_policy: payload.release_readiness_policy ?? null,
      };
      if (payload.schema !== 'opl_docker_webui_clean_vm_evidence_validation.v1') {
        return { reason: 'Docker WebUI clean VM evidence validation schema is not opl_docker_webui_clean_vm_evidence_validation.v1.', fields };
      }
      if (payload.status !== 'passed') {
        const blocker = cleanWindows?.typed_blocker && typeof cleanWindows.typed_blocker === 'object' && !Array.isArray(cleanWindows.typed_blocker)
          ? cleanWindows.typed_blocker as Record<string, unknown>
          : cleanLinux?.typed_blocker && typeof cleanLinux.typed_blocker === 'object' && !Array.isArray(cleanLinux.typed_blocker)
            ? cleanLinux.typed_blocker as Record<string, unknown>
            : null;
        const blockerCode = typeof blocker?.code === 'string' ? ` (${blocker.code})` : '';
        return { reason: `Docker WebUI clean VM evidence status is ${statusString(payload.status) || 'unknown'}${blockerCode}.`, fields };
      }
      if (cleanLinux?.status !== 'passed') {
        return {
          reason: `Docker WebUI clean VM evidence requires clean_linux_vm to pass; got Linux=${statusString(cleanLinux?.status) || 'missing'}.`,
          fields,
        };
      }
      return { fields };
    },
  });
}

function buildFullTelemetryGate(options: Options, artifactName: string) {
  return jsonGate(options, {
    required: false,
    artifactName,
    fileName: 'full-workflow-telemetry.json',
    validate: (payload) => {
      const durationSeconds = payload.duration_seconds as Record<string, unknown> | undefined;
      const breakdown = durationSeconds?.full_package_build_breakdown as Record<string, unknown> | undefined;
      const requiredBreakdown = [
        'runtime_materialize',
        'runtime_cache_materialize',
        'payload_sync',
        'shell_build',
        'dmg_package_compression',
        'manifest_checksum',
      ];
      const fields = {
        cache: payload.cache ?? null,
        duration_seconds: durationSeconds ?? null,
        resolved_refs: payload.resolved_refs ?? null,
      };
      if (payload.schema !== 'opl_full_workflow_telemetry.v1') return { reason: 'Full telemetry schema is not opl_full_workflow_telemetry.v1.', fields };
      if (!durationSeconds || typeof durationSeconds.full_package_build !== 'number') return { reason: 'Full telemetry is missing duration_seconds.full_package_build.', fields };
      if (!breakdown || typeof breakdown !== 'object') return { reason: 'Full telemetry is missing duration_seconds.full_package_build_breakdown.', fields };
      const missing = requiredBreakdown.filter((key) => typeof breakdown[key] !== 'number');
      if (missing.length > 0) return { reason: `Full telemetry breakdown is missing numeric fields: ${missing.join(', ')}.`, fields };
      return { fields };
    },
  });
}

function readFullDiagnostics(options: Options, artifactName: string) {
  const root = artifactDir(options, artifactName);
  const manifestPath = findFileByName(root, 'full-package-manifest.json');
  const sizeSummaryPath = findFileByName(root, 'full-package-size-summary.json');
  const runtimeCacheEventsPath = findFileByName(root, 'runtime-cache-events.json');
  const checksumPath = findFileByName(root, 'SHA256SUMS.txt');
  const gate: GateSummary = !options.includeFullPackage
    ? missingGate(false, artifactName, 'Full package is not included.')
    : manifestPath && runtimeCacheEventsPath && checksumPath
      ? {
          status: 'passed',
          required: false,
          artifact_name: artifactName,
          artifact_path: [
            path.relative(options.artifactsDir, manifestPath),
            ...(sizeSummaryPath ? [path.relative(options.artifactsDir, sizeSummaryPath)] : []),
            path.relative(options.artifactsDir, runtimeCacheEventsPath),
            path.relative(options.artifactsDir, checksumPath),
          ].join(', '),
          fields: {
            full_package_manifest: readJsonFile(manifestPath),
            full_package_size_summary: sizeSummaryPath ? readJsonFile(sizeSummaryPath) : null,
            runtime_cache_events: readJsonFile(runtimeCacheEventsPath),
          },
        }
      : missingGate(false, artifactName, 'Missing Full diagnostics manifest, runtime cache events, or SHA256SUMS.');
  return { gate, manifestPath, sizeSummaryPath, runtimeCacheEventsPath };
}

function buildFullSizeCacheTimingGate(
  options: Options,
  fullTelemetryGate: GateSummary,
  fullTelemetryArtifactName: string,
  fullDiagnosticsGate: GateSummary,
  fullDiagnosticsArtifactName: string,
): GateSummary {
  const artifactName = `${fullTelemetryArtifactName}, ${fullDiagnosticsArtifactName}`;
  if (!options.includeFullPackage) {
    return missingGate(false, artifactName, 'Full package is not included.');
  }
  if (fullTelemetryGate.status === 'passed' && fullDiagnosticsGate.status === 'passed') {
    return {
      status: 'passed',
      required: false,
      artifact_name: artifactName,
      fields: {
        diagnostic_only: true,
        telemetry: fullTelemetryGate.fields,
        diagnostics: fullDiagnosticsGate.fields,
      },
    };
  }
  return {
    status: 'skipped',
    required: false,
    artifact_name: artifactName,
    reason: [fullTelemetryGate.reason, fullDiagnosticsGate.reason].filter(Boolean).join(' '),
    fields: {
      diagnostic_only: true,
      telemetry_status: fullTelemetryGate.status,
      diagnostics_status: fullDiagnosticsGate.status,
    },
  };
}

function buildSummary(options: Options) {
  const jobResults = readJobResults(options);
  const preflight = readPreflightSummary(options);
  const homebrewReadiness = summarizeHomebrewReadiness(options, preflight.summary);
  const remoteArtifactName = `remote-release-verification-${options.version}`;
  const standardVmArtifactName = `opl-first-run-vm-standard-${process.env.GITHUB_RUN_ID || 'local'}`;
  const homebrewVmArtifactName = `opl-first-run-vm-homebrew-standard-${process.env.GITHUB_RUN_ID || 'local'}`;
  const homebrewTapArtifactName = `homebrew-tap-plan-stable-app_standard-${options.version}`;
  const fullHomebrewTapArtifactName = `homebrew-tap-plan-stable-app_full_first_install-${options.version}`;
  const fullVmArtifactName = `opl-first-run-vm-full-${process.env.GITHUB_RUN_ID || 'local'}`;
  const oneShotArtifactName = `one-shot-app-installer-smoke-${options.version}`;
  const dockerArtifactName = `docker-webui-smoke-${options.version}`;
  const webuiGhcrArtifactName = `webui-ghcr-publish-${options.version}`;
  const fullTelemetryArtifactName = `opl-full-workflow-telemetry-${options.version}`;
  const fullDiagnosticsArtifactName = `opl-full-diagnostics-${options.version}`;

  const remoteGate = buildRemoteReleaseVerificationGate(options, remoteArtifactName);
  const homebrewTapGate = buildHomebrewTapGate(options, remoteGate, {
    required: true,
    artifactName: homebrewTapArtifactName,
    label: 'Homebrew tap plan',
    packageKind: 'app_standard',
    remotePublicationReason: 'Stable Homebrew tap plan did not record direct_commit remote publication.',
  });
  const fullHomebrewTapGate = buildHomebrewTapGate(options, remoteGate, {
    required: options.includeFullPackage && options.runVmSmoke && options.releaseMode !== 'draft_candidate',
    artifactName: fullHomebrewTapArtifactName,
    label: 'Full Homebrew tap plan',
    packageKind: 'app_full_first_install',
    remotePublicationReason: 'Full Homebrew tap plan did not record direct_commit remote publication.',
    includeFullBoundaryPolicy: true,
  });
  const operatorEvidenceBundleArtifactName = `release-evidence-bundle-${options.version}`;
  const operatorEvidenceBundleGate = buildOperatorEvidenceBundleGate(options, operatorEvidenceBundleArtifactName);
  const oneShotGate = buildOneShotGate(options, oneShotArtifactName);
  const dockerGate = textArtifactGate(options, {
    required: true,
    artifactName: dockerArtifactName,
    files: [
      'opl-webui-index.html',
      'opl-webui-manifest.webmanifest',
      'opl-webui-image-size-bytes.txt',
    ],
  });
  const webuiGhcrGate = buildWebuiGhcrGate(options, webuiGhcrArtifactName);
  const dockerCleanVmEvidenceArtifactName = `docker-webui-clean-vm-evidence-${options.version}`;
  const dockerCleanVmEvidenceGate = buildDockerCleanVmEvidenceGate(options, dockerCleanVmEvidenceArtifactName);
  const fullTelemetryGate = buildFullTelemetryGate(options, fullTelemetryArtifactName);
  const {
    gate: fullDiagnosticsGate,
    manifestPath,
    sizeSummaryPath,
    runtimeCacheEventsPath,
  } = readFullDiagnostics(options, fullDiagnosticsArtifactName);
  const fullSizeCacheTimingGate = buildFullSizeCacheTimingGate(
    options,
    fullTelemetryGate,
    fullTelemetryArtifactName,
    fullDiagnosticsGate,
    fullDiagnosticsArtifactName,
  );

  const selectedRemoteJob = options.includeFullPackage ? 'remote-verify-full' : 'remote-verify-standard';
  const selectedStandardVmJob = options.includeFullPackage
    ? 'standard-first-run-vm-smoke-after-full'
    : 'standard-first-run-vm-smoke-after-standard-only';
  // Stable tap mutation and both cask VM gates belong to the post-owner promotion saga.
  const stableHomebrewRequired = false;
  const gates = {
    remote_release_verification: applyJobResult(remoteGate, jobResults, selectedRemoteJob, true),
    standard_dmg_clean_vm: applyJobResult(
      options.runVmSmoke
        ? buildVmSmokeGate(options, standardVmArtifactName, 'standard', true)
        : missingGate(false, standardVmArtifactName, 'VM smoke disabled for this run.'),
      jobResults,
      selectedStandardVmJob,
      options.runVmSmoke,
    ),
    stable_homebrew_tap_update: applyJobResult(
      stableHomebrewRequired
        ? homebrewTapGate
        : missingGate(false, homebrewTapArtifactName, homebrewReadiness.reason || 'Stable Homebrew tap update is not required for this run.'),
      jobResults,
      'stable-homebrew-tap-update',
      stableHomebrewRequired,
    ),
    full_homebrew_tap_update: applyJobResult(
      options.includeFullPackage && stableHomebrewRequired
        ? fullHomebrewTapGate
        : missingGate(false, fullHomebrewTapArtifactName, homebrewReadiness.reason || 'Full Homebrew tap update is not required for this run.'),
      jobResults,
      'full-homebrew-tap-update',
      options.includeFullPackage && stableHomebrewRequired,
    ),
    homebrew_standard_cask_clean_vm: applyJobResult(
      stableHomebrewRequired
        ? buildVmSmokeGate(options, homebrewVmArtifactName, 'standard', true)
        : missingGate(false, homebrewVmArtifactName, options.runVmSmoke ? homebrewReadiness.reason || 'Stable Homebrew VM smoke is not required for this run.' : 'VM smoke disabled for this run.'),
      jobResults,
      'homebrew-standard-first-run-vm-smoke',
      stableHomebrewRequired,
    ),
    full_dmg_clean_vm: applyJobResult(
      options.includeFullPackage && options.runVmSmoke
        ? buildVmSmokeGate(options, fullVmArtifactName, 'full', true)
        : missingGate(false, fullVmArtifactName, options.includeFullPackage ? 'VM smoke disabled for this run.' : 'Full package is not included.'),
      jobResults,
      'full-first-run-vm-smoke',
      options.includeFullPackage && options.runVmSmoke,
    ),
    one_shot_app_installer: applyJobResult(oneShotGate, jobResults, 'one-shot-app-installer-smoke', true),
    docker_webui: applyJobResult(
      options.publishDockerWebui
        ? dockerGate
        : missingGate(false, dockerArtifactName, 'Docker WebUI publish disabled for this run.'),
      jobResults,
      'docker-webui-smoke',
      options.publishDockerWebui,
    ),
    webui_ghcr_publish: applyJobResult(
      options.publishDockerWebui
        ? webuiGhcrGate
        : missingGate(false, webuiGhcrArtifactName, 'Docker WebUI publish disabled for this run.'),
      jobResults,
      'webui-ghcr-publish',
      options.publishDockerWebui,
    ),
    docker_webui_clean_vm_evidence: applyJobResult(
      options.publishDockerWebui
        ? dockerCleanVmEvidenceGate
        : missingGate(false, dockerCleanVmEvidenceArtifactName, 'Docker WebUI publish disabled for this run.'),
      jobResults,
      'docker-webui-clean-vm-evidence',
      options.publishDockerWebui,
    ),
    full_size_cache_timing: applyJobResult(fullSizeCacheTimingGate, jobResults, 'full-first-install', false),
    operator_evidence_bundle: applyJobResult(operatorEvidenceBundleGate, jobResults, 'operator-evidence-bundle-validation', false),
  };

  const failedRequired = Object.entries(gates)
    .filter(([, gate]) => gate.required && gate.status !== 'passed')
    .map(([id, gate]) => ({ id, status: gate.status, reason: gate.reason || 'gate did not pass' }));
  const telemetryPath = findFileByName(artifactDir(options, fullTelemetryArtifactName), 'full-workflow-telemetry.json');
  const fullPackage = telemetryPath ? readJsonFile(telemetryPath) : null;
  const manifest = manifestPath ? readJsonFile(manifestPath) : null;
  const runtimeCacheEvents = runtimeCacheEventsPath ? readJsonFile(runtimeCacheEventsPath) : null;
  const sizeBudget = summarizeFullSizeBudget(gates.remote_release_verification);
  const sizeAnalysis = sizeSummaryPath
    ? {
        ...readJsonFile(sizeSummaryPath),
        source: 'full_package_size_summary_artifact',
      }
    : buildManifestSizeAnalysis(manifest, sizeBudget);
  const warnings = warningsFromFullSizeBudget(sizeBudget);
  const fullPackageDuration = recordOrNull(fullPackage?.duration_seconds);
  const runtimeCache = summarizeRuntimeCacheEvents(runtimeCacheEvents);
  const bottlenecks = buildReadinessBottlenecks({
    duration: fullPackageDuration,
    runtimeCache,
    sizeBudget,
    sizeAnalysis: recordOrNull(sizeAnalysis),
  });
  const optimizationRecommendations = buildReadinessOptimizationRecommendations({
    duration: fullPackageDuration,
    runtimeCache,
    sizeAnalysis: recordOrNull(sizeAnalysis),
    bottlenecks,
  });
  const operatorEvidenceReadout = objectField(
    gates.operator_evidence_bundle.fields ?? null,
    'l5_evidence_readout',
  );
  const releaseCohort = buildReleaseEvidenceCohort({
    version: options.version,
    source: 'release_readiness_summary',
  });
  const l5EvidenceReadout = buildAppReleaseL5EvidenceReadout({
    contract: readAppReleaseL5ReadoutContract(appRoot),
    gates,
    upstreamReadout: operatorEvidenceReadout,
    releaseCohort,
  });
  const releaseOwnerVerdict = buildAppReleaseOwnerVerdictReadout({
    contract: readAppReleaseOwnerVerdictContract(appRoot),
    releaseCohort,
    summaryStatus: failedRequired.length === 0 ? 'passed' : 'failed',
    failedRequiredGates: failedRequired,
  });

  return {
    schema: 'opl_release_readiness_summary.v1',
    gate_profile_schema: 'app_release_validation_profiles.v1',
    gate_profile: options.releaseMode === 'nightly' || options.releaseMode === 'nightly_standard' ? 'nightly_standard' : 'stable',
    status: failedRequired.length === 0 ? 'passed' : 'failed',
    version: options.version,
    release_mode: options.releaseMode,
    include_full_package: options.includeFullPackage,
    run_vm_smoke: options.runVmSmoke,
    publish_docker_webui: options.publishDockerWebui,
    generated_at: new Date().toISOString(),
    artifacts_policy: {
      downloads_large_dmg_artifacts: false,
      rule: 'readiness aggregation downloads only small diagnostic artifacts and summaries; DMG assets are validated by remote verification and VM jobs.',
    },
    job_results: jobResults,
    preflight: {
      artifact_name: preflight.artifactName,
      artifact_path: preflight.path,
      status: statusOf(preflight.summary),
    },
    homebrew: homebrewReadiness,
    warnings,
    gates,
    failed_required_gates: failedRequired,
    bottlenecks,
    optimization_recommendations: optimizationRecommendations,
    release_cohort: releaseCohort,
    l5_evidence_readout: l5EvidenceReadout,
    release_owner_verdict: releaseOwnerVerdict,
    full_package: {
      duration_seconds: fullPackage?.duration_seconds ?? null,
      cache: fullPackage?.cache ?? null,
      runtime_cache: runtimeCache,
      size_budget: sizeBudget,
      size_analysis: sizeAnalysis,
      resolved_refs: fullPackage?.resolved_refs ?? manifest?.resolved_refs ?? null,
      size_breakdown: manifest?.size_breakdown ?? null,
    },
  };
}

try {
  const options = parseArgs(process.argv.slice(2));
  const summary = buildSummary(options);
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  writeReleaseReadinessMarkdown(options.markdown, summary);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.status !== 'passed') {
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
