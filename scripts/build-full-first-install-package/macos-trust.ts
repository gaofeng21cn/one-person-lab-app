import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { run, runCapture } from './process.ts';
import {
  isDeveloperIdApplicationSignature,
  parseMacosCodeSignatureOutput,
} from '../macos-code-signature.ts';

export function canRunMacosSigningChecks() {
  return process.platform === 'darwin';
}

export function strictMacosRuntimeSigningRequired() {
  return process.env.OPL_MAC_STRICT_SIGNING_CHECKS === 'true';
}

function macosSigningIdentity() {
  return process.env.OPL_RUNTIME_CODESIGN_IDENTITY
    || process.env.identity
    || process.env.CSC_NAME
    || process.env.IDENTITY
    || '';
}

export function codesignOutputLines(codesign, prefix = 'codesign') {
  return [
    codesign.stdout?.trim() ? `${prefix} stdout:\n${codesign.stdout.trim()}` : '',
    codesign.stderr?.trim() ? `${prefix} stderr:\n${codesign.stderr.trim()}` : '',
  ];
}

export function ensureAppBundleAdHocCodesign(appPath, label) {
  if (!canRunMacosSigningChecks()) {
    return;
  }
  const strict = strictMacosRuntimeSigningRequired();
  const initial = runCapture('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stage: 'full_codesign_verify' });
  const initialDetails = strict ? runCapture('codesign', ['-dv', '--verbose=4', appPath], { stage: 'full_codesign_identity' }) : null;
  const initialSignature = initialDetails
    ? parseMacosCodeSignatureOutput(`${initialDetails.stdout || ''}${initialDetails.stderr || ''}`)
    : null;
  if (initial.status === 0 && (!strict || (initialSignature && isDeveloperIdApplicationSignature(initialSignature)))) {
    return;
  }
  const identity = macosSigningIdentity();
  if (strict && !identity) {
    throw new Error(`${label} requires a Developer ID signing identity.`);
  }
  const signingArgs = strict
    ? [
        '--force',
        '--timestamp',
        '--options',
        'runtime',
        '--preserve-metadata=identifier,entitlements,requirements,flags,runtime',
        '--sign',
        identity,
        appPath,
      ]
    : ['--force', '--deep', '--sign', '-', appPath];
  run('codesign', signingArgs, { stage: 'full_codesign_sign' });
  const verified = runCapture('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stage: 'full_codesign_verify' });
  if (verified.status !== 0) {
    throw new Error([
      `${label} signing did not produce a verifiable App bundle: ${appPath}`,
      initial.stderr?.trim() ? `initial codesign stderr:\n${initial.stderr.trim()}` : '',
      verified.stdout?.trim() ? `verified codesign stdout:\n${verified.stdout.trim()}` : '',
      verified.stderr?.trim() ? `verified codesign stderr:\n${verified.stderr.trim()}` : '',
    ].filter(Boolean).join('\n'));
  }
}

export function assertAppBundleLocalAuthorization(appPath, label) {
  if (!canRunMacosSigningChecks()) {
    return;
  }
  const codesign = runCapture('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stage: 'full_codesign_verify' });
  if (strictMacosRuntimeSigningRequired()) {
    const details = runCapture('codesign', ['-dv', '--verbose=4', appPath], { stage: 'full_codesign_identity' });
    const signatureOutput = `${details.stdout || ''}${details.stderr || ''}`;
    const signature = parseMacosCodeSignatureOutput(signatureOutput);
    if (codesign.status !== 0 || !isDeveloperIdApplicationSignature(signature)) {
      throw new Error([
        `${label} failed Developer ID signing verification before notarization: ${appPath}`,
        ...codesignOutputLines(codesign),
        `team_identifier=${signature.team_identifier || 'missing'}`,
        `signature=${signature.signature || 'missing'}`,
        `signature_kind=${signature.signature_kind}`,
      ].filter(Boolean).join('\n'));
    }
    return;
  }
  // Strict builds are assessed by Gatekeeper after notarization; an assessment
  // here is both premature and unused by that branch.
  const spctl = runCapture('spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath], { stage: 'full_unsigned_gatekeeper_diagnostic' });
  if (codesign.status !== 0) {
    throw new Error([
      `${label} failed Stable local authorization codesign verification: ${appPath}`,
      ...codesignOutputLines(codesign),
      `spctl status=${spctl.status}`,
      spctl.stdout?.trim() ? `spctl stdout:\n${spctl.stdout.trim()}` : '',
      spctl.stderr?.trim() ? `spctl stderr:\n${spctl.stderr.trim()}` : '',
    ].filter(Boolean).join('\n'));
  }
  if (spctl.status !== 0) {
    console.warn([
      `${label} uses Stable unsigned local authorization diagnostics: ${appPath}`,
      'codesign_status=passed',
      `spctl_status=${spctl.status === 0 ? 'passed' : 'rejected_allowed_unsigned'}`,
    ].join('\n'));
  }
}

export function verifyDmgAppBundleLocalAuthorization(dmgPath, label) {
  if (!canRunMacosSigningChecks()) {
    return;
  }
  const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-dmg-verify-'));
  try {
    run('hdiutil', ['attach', dmgPath, '-nobrowse', '-readonly', '-mountpoint', mountPoint], { stage: 'full_dmg_mount_verification' });
    const appPath = fs.readdirSync(mountPoint)
      .filter((entry) => entry.endsWith('.app'))
      .sort()
      .map((entry) => path.join(mountPoint, entry))
      .find((candidate) => fs.existsSync(candidate));
    if (!appPath) {
      throw new Error(`${label} does not contain a .app bundle: ${dmgPath}`);
    }
    assertAppBundleLocalAuthorization(appPath, label);
  } finally {
    runCapture('hdiutil', ['detach', mountPoint], { stage: 'full_dmg_unmount_verification' });
    fs.rmSync(mountPoint, { recursive: true, force: true });
  }
}
