import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { downloadArtifact } from './download-github-artifact.mjs';

const handoffFile = 'handoff-manifest.json';
const appleFile = 'full-apple-notarization-receipt.json';
const handoffReceiptFile = 'full-finalizer-handoff-receipt.json';
const sha256 = /^[0-9a-f]{64}$/;
const runIdPattern = /^[1-9][0-9]*$/;

export const DEFAULT_RECOVERY_MAX_RETAINED_RUNS = 1;
export const DEFAULT_RECOVERY_MAX_AGE_DAYS = 7;

function regularFile(file) {
  return fs.lstatSync(file).isFile();
}

function positiveIntEnv(env, key, fallback) {
  const raw = env?.[key]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function ownedFullRecoveryBaseDir(env = process.env) {
  const home = env?.HOME?.trim() || os.homedir();
  return path.join(path.resolve(home), 'Library', 'Caches', 'OPL Release Recovery');
}

export function ownedFullRecoveryRoot(runId, env = process.env) {
  if (!runIdPattern.test(runId)) throw new Error('Invalid Full recovery run ID');
  return path.join(ownedFullRecoveryBaseDir(env), runId);
}

export function pruneRetainedFullRecoveryRuns({
  baseDir,
  keepRunIds = [],
  maxRetainedRuns = DEFAULT_RECOVERY_MAX_RETAINED_RUNS,
  maxAgeMs = DEFAULT_RECOVERY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
  nowMs = Date.now(),
} = {}) {
  const resolvedBase = path.resolve(baseDir || ownedFullRecoveryBaseDir());
  const summary = {
    base_dir: resolvedBase,
    existed: false,
    removed_run_ids: [],
    retained_run_ids: [],
    skipped_entries: [],
  };
  let baseStat;
  try {
    baseStat = fs.lstatSync(resolvedBase);
  } catch {
    return summary;
  }
  if (!baseStat.isDirectory() || baseStat.isSymbolicLink()) return summary;
  summary.existed = true;

  const protectedIds = new Set(
    Array.from(keepRunIds, (value) => String(value ?? '').trim()).filter((value) => runIdPattern.test(value)),
  );
  const candidates = [];
  for (const entry of fs.readdirSync(resolvedBase, { withFileTypes: true })) {
    const candidatePath = path.join(resolvedBase, entry.name);
    let stat;
    try {
      stat = fs.lstatSync(candidatePath);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory() || !runIdPattern.test(entry.name)) {
      summary.skipped_entries.push(entry.name);
      continue;
    }
    candidates.push({
      runId: entry.name,
      dir: candidatePath,
      mtimeMs: stat.mtimeMs,
      protected: protectedIds.has(entry.name),
    });
  }

  candidates.sort((left, right) => {
    if (left.protected !== right.protected) return left.protected ? -1 : 1;
    if (right.mtimeMs !== left.mtimeMs) return right.mtimeMs - left.mtimeMs;
    const leftBig = BigInt(left.runId);
    const rightBig = BigInt(right.runId);
    return leftBig === rightBig ? 0 : (rightBig > leftBig ? 1 : -1);
  });

  const retentionCap = Number.isSafeInteger(maxRetainedRuns) && maxRetainedRuns >= 0
    ? maxRetainedRuns
    : DEFAULT_RECOVERY_MAX_RETAINED_RUNS;
  let retainedCount = 0;

  for (const candidate of candidates) {
    const expired = Number.isFinite(maxAgeMs) && maxAgeMs >= 0 && (nowMs - candidate.mtimeMs) > maxAgeMs;
    if (candidate.protected || (!expired && retainedCount < retentionCap)) {
      summary.retained_run_ids.push(candidate.runId);
      retainedCount += 1;
      continue;
    }
    fs.rmSync(candidate.dir, { recursive: true, force: true });
    summary.removed_run_ids.push(candidate.runId);
  }

  return summary;
}

export function verifyRetainedHandoff({ localRoot, evidenceRoot, expectedArchiveDigest }) {
  const archivedReceipt = JSON.parse(fs.readFileSync(path.join(evidenceRoot, handoffReceiptFile), 'utf8'));
  const manifestFile = path.join(localRoot, 'handoff', handoffFile);
  if (!regularFile(manifestFile)) throw new Error('Retained Full handoff manifest must be a regular file');
  const manifestBytes = fs.readFileSync(manifestFile);
  const manifestDigest = crypto.createHash('sha256').update(manifestBytes).digest('hex');
  if (!/^sha256:[0-9a-f]{64}$/.test(expectedArchiveDigest)
    || archivedReceipt.schema !== 'opl_full_finalizer_handoff_receipt.v1'
    || archivedReceipt.status !== 'passed'
    || archivedReceipt.artifact_digest !== expectedArchiveDigest
    || archivedReceipt.handoff_manifest_sha256 !== manifestDigest) {
    throw new Error('Retained Full handoff does not match the GitHub archive and manifest digests');
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schema !== 'opl_full_finalizer_input.v1') throw new Error('Invalid retained Full handoff schema');
  return manifest;
}

export async function verifyAcceptedFullDmg({ receiptPath, dmgPath, expectedName, expectedTeamId }) {
  if (!regularFile(receiptPath) || !regularFile(dmgPath)) {
    throw new Error('Accepted Full recovery requires regular receipt and DMG files');
  }
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  const sizeBytes = fs.statSync(dmgPath).size;
  if (receipt.schema !== 'opl_apple_notarized_dmg_receipt.v1'
    || receipt.artifact !== expectedName
    || receipt.status !== 'passed'
    || receipt.team_identifier !== expectedTeamId
    || receipt.notarization?.status !== 'Accepted'
    || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(receipt.notarization.id)
    || receipt.stapler_validate_status !== 'passed'
    || receipt.final_stapled_dmg_size_bytes !== sizeBytes
    || !sha256.test(receipt.final_stapled_dmg_sha256)) {
    throw new Error('Prior Full Apple receipt does not admit the retained DMG');
  }
  const hash = crypto.createHash('sha256');
  for await (const bytes of fs.createReadStream(dmgPath)) hash.update(bytes);
  if (hash.digest('hex') !== receipt.final_stapled_dmg_sha256) {
    throw new Error('Retained Full DMG digest differs from the prior notarization receipt');
  }
  return receipt;
}

export async function restoreRetainedFullFinalizer(env = process.env) {
  const localRoot = ownedFullRecoveryRoot(env.OPL_ARTIFACT_RUN_ID, env);
  const dmgName = `One-Person-Lab-Full-${env.OPL_FULL_VERSION}-mac-arm64.dmg`;
  if (!/^One-Person-Lab-Full-\d+\.\d+\.\d+-mac-arm64\.dmg$/.test(dmgName)) {
    throw new Error('Expected a Stable Full DMG name');
  }
  const retainedDmg = path.join(localRoot, 'notarized', dmgName);
  if (!fs.existsSync(retainedDmg) || !fs.existsSync(path.join(localRoot, 'handoff', handoffFile))) return false;
  if (!regularFile(retainedDmg)) throw new Error('Retained Full DMG must be a regular file');

  const evidenceRoot = path.join(env.RUNNER_TEMP, 'opl-prior-full-notarization');
  await downloadArtifact({
    ...env,
    OPL_ARTIFACT_NAME: `opl-full-notarization-evidence-${env.OPL_FULL_VERSION}-${env.OPL_ARTIFACT_RUN_ID}`,
    OPL_ARTIFACT_DEST: evidenceRoot,
    OPL_ARTIFACT_EXPECTED_DIGEST: '',
  });
  const manifest = verifyRetainedHandoff({
    localRoot,
    evidenceRoot,
    expectedArchiveDigest: env.OPL_FULL_HANDOFF_DIGEST,
  });
  if (manifest.release_version !== env.OPL_FULL_VERSION) throw new Error('Retained Full release version differs');
  const receiptPath = path.join(evidenceRoot, appleFile);
  const receipt = await verifyAcceptedFullDmg({
    receiptPath,
    dmgPath: retainedDmg,
    expectedName: dmgName,
    expectedTeamId: env.OPL_FULL_EXPECTED_TEAM_ID,
  });

  const handoffRoot = path.join(env.RUNNER_TEMP, 'opl-full-finalizer-input');
  fs.cpSync(path.join(localRoot, 'handoff'), handoffRoot, {
    recursive: true, force: false, errorOnExist: true, mode: fs.constants.COPYFILE_FICLONE,
  });
  fs.copyFileSync(retainedDmg, path.join(evidenceRoot, dmgName), fs.constants.COPYFILE_FICLONE);
  try {
    pruneRetainedFullRecoveryRuns({
      baseDir: ownedFullRecoveryBaseDir(env),
      keepRunIds: [env.OPL_ARTIFACT_RUN_ID],
      maxRetainedRuns: positiveIntEnv(env, 'OPL_RECOVERY_MAX_RETAINED_RUNS', DEFAULT_RECOVERY_MAX_RETAINED_RUNS),
      maxAgeMs: positiveIntEnv(env, 'OPL_RECOVERY_MAX_AGE_DAYS', DEFAULT_RECOVERY_MAX_AGE_DAYS) * 24 * 60 * 60 * 1000,
    });
  } catch {
    // Best-effort pruning of stale recovery runs must not block an already verified restore.
  }
  console.log(JSON.stringify({
    stage: 'restore_notarized_full_dmg', source_run_id: env.OPL_ARTIFACT_RUN_ID, submission_id: receipt.notarization.id,
    sha256: receipt.final_stapled_dmg_sha256,
  }));
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--prune')) {
    const keepIds = (process.env.OPL_RECOVERY_KEEP_RUN_ID || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const summary = pruneRetainedFullRecoveryRuns({
      baseDir: ownedFullRecoveryBaseDir(process.env),
      keepRunIds: keepIds,
      maxRetainedRuns: positiveIntEnv(process.env, 'OPL_RECOVERY_MAX_RETAINED_RUNS', DEFAULT_RECOVERY_MAX_RETAINED_RUNS),
      maxAgeMs: positiveIntEnv(process.env, 'OPL_RECOVERY_MAX_AGE_DAYS', DEFAULT_RECOVERY_MAX_AGE_DAYS) * 24 * 60 * 60 * 1000,
    });
    console.log(JSON.stringify({ stage: 'prune_retained_full_recovery_runs', ...summary }));
  } else {
    const restored = await restoreRetainedFullFinalizer();
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `restored=${restored}\n`);
  }
}
