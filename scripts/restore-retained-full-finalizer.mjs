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

function regularFile(file) {
  return fs.lstatSync(file).isFile();
}

export function ownedFullRecoveryRoot(runId) {
  if (!/^[1-9][0-9]*$/.test(runId)) throw new Error('Invalid Full recovery run ID');
  return path.join(os.homedir(), 'Library', 'Caches', 'OPL Release Recovery', runId);
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
  const localRoot = ownedFullRecoveryRoot(env.OPL_ARTIFACT_RUN_ID);
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
  console.log(JSON.stringify({
    stage: 'restore_notarized_full_dmg', source_run_id: env.OPL_ARTIFACT_RUN_ID, submission_id: receipt.notarization.id,
    sha256: receipt.final_stapled_dmg_sha256,
  }));
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const restored = await restoreRetainedFullFinalizer();
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `restored=${restored}\n`);
}
