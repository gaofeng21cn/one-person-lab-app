#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateStandardAssetInventory } from './stage-standard-shell-assets.ts';
import { resolveActiveShellPaths } from './app-shell-adapter.ts';
import { assertAppleNotarizationReceipt, assertGatekeeperLaunchPolicy } from './macos-gatekeeper-policy.ts';
import { fileSha256 } from './release-file-helpers.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.resolve(root, process.argv[2] ?? 'release-assets');
const expectedVersion = process.env.OPL_UPDATER_VERSION?.trim() || process.env.OPL_RELEASE_VERSION?.trim() || '';
const shellPaths = resolveActiveShellPaths();

if (shellPaths.contract.active_shell === 'opl-studio') {
  validateStandardAssetInventory(outputDir);
} else {
const result = spawnSync('bash', [shellPaths.releaseVerifyScriptPath, outputDir], {
  cwd: shellPaths.shellRoot,
  stdio: 'pipe',
  encoding: 'utf8',
  env: process.env,
});
if (result.status !== 0) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

}

if (!existsSync(outputDir)) {
  console.error(`Release asset directory does not exist: ${outputDir}`);
  process.exit(1);
}

const metadataFiles = readdirSync(outputDir)
  .filter((name) => /^latest.*\.ya?ml$/.test(name))
  .sort();

let errors = 0;
const gatekeeperPolicyPath = path.join(outputDir, 'standard-gatekeeper-launch-policy.json');
const notarizationReceiptPath = path.join(outputDir, 'standard-apple-notarization-receipt.json');
const dmgName = readdirSync(outputDir).find((name) => /^One-Person-Lab-.+-mac-arm64\.dmg$/.test(name));
if (!existsSync(gatekeeperPolicyPath) || !existsSync(notarizationReceiptPath) || !dmgName) {
  console.error('FAIL: missing Standard Developer ID/notarization evidence or DMG');
  errors += 1;
} else {
  try {
    const policy = assertGatekeeperLaunchPolicy(
      JSON.parse(readFileSync(gatekeeperPolicyPath, 'utf8')),
      'app_standard',
      'standard-gatekeeper-launch-policy.json',
    );
    const receipt = assertAppleNotarizationReceipt(
      JSON.parse(readFileSync(notarizationReceiptPath, 'utf8')),
      'standard-apple-notarization-receipt.json',
    );
    const dmgPath = path.join(outputDir, dmgName);
    if (
      policy.team_identifier !== receipt.team_identifier
      || policy.notarization_receipt_sha256 !== fileSha256(notarizationReceiptPath)
      || receipt.final_stapled_dmg_sha256 !== fileSha256(dmgPath)
      || receipt.final_stapled_dmg_size_bytes !== statSync(dmgPath).size
    ) throw new Error('Standard trust evidence does not bind final DMG bytes.');
  } catch (error) {
    console.error(`FAIL: invalid Standard Apple distribution evidence: ${error instanceof Error ? error.message : String(error)}`);
    errors += 1;
  }
}

for (const fileName of metadataFiles) {
  const filePath = path.join(outputDir, fileName);
  const text = readFileSync(filePath, 'utf8');
  if (/One-Person-Lab-Full|Full-/i.test(text)) {
    console.error(`FAIL: standard updater metadata references a Full first-install asset: ${fileName}`);
    errors += 1;
  }
  if (expectedVersion) {
    const escapedVersion = expectedVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`^version:\\s*['"]?${escapedVersion}['"]?\\s*$`, 'm').test(text)) {
      console.error(`FAIL: ${fileName} does not declare OPL release version ${expectedVersion}`);
      errors += 1;
    }
  }
}

if (errors > 0) {
  process.exit(1);
}

console.log('PASS: standard updater metadata excludes Full assets and Developer ID/notarization evidence binds final DMG bytes');
