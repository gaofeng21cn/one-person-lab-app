import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  MACOS_NATIVE_CODE_EXTENSIONS,
  MACOS_TRUSTED_EXECUTABLE_PATTERNS,
} from './paths.ts';
import {
  canRunMacosSigningChecks,
  codesignOutputLines,
  strictMacosRuntimeSigningRequired,
} from './macos-trust.ts';
import { run, runCapture } from './process.ts';
import {
  isDeveloperIdApplicationSignature,
  parseMacosCodeSignatureOutput,
} from '../macos-code-signature.ts';

function macosSigningIdentity() {
  return process.env.OPL_RUNTIME_CODESIGN_IDENTITY?.trim()
    || process.env.identity?.trim()
    || process.env.CSC_NAME?.trim()
    || process.env.IDENTITY?.trim()
    || '';
}

function relativeRuntimePath(runtimeRoot, filePath) {
  return `runtime/current/${path.relative(runtimeRoot, filePath).split(path.sep).join('/')}`;
}

function isNativeRuntimeExecutable(relativePath, stat) {
  if (!stat.isFile()) {
    return false;
  }
  if (MACOS_NATIVE_CODE_EXTENSIONS.has(path.extname(relativePath))) {
    return true;
  }
  if ((stat.mode & 0o111) === 0) {
    return false;
  }
  return MACOS_TRUSTED_EXECUTABLE_PATTERNS.some((pattern) => pattern.test(relativePath));
}

function requiresGatekeeperExecutableAssessment(relativePath, stat) {
  return stat.isFile()
    && (stat.mode & 0o111) !== 0
    && MACOS_TRUSTED_EXECUTABLE_PATTERNS.some((pattern) => pattern.test(relativePath));
}

export function listFullRuntimeNativeExecutables(runtimeRoot) {
  if (!fs.existsSync(runtimeRoot)) {
    return [];
  }
  const results = [];
  const stack = [runtimeRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    const stat = fs.lstatSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry));
      }
      continue;
    }
    if (stat.isSymbolicLink()) {
      continue;
    }
    const relativePath = relativeRuntimePath(runtimeRoot, current);
    if (isNativeRuntimeExecutable(relativePath, stat)) {
      results.push({
        path: current,
        relative_path: relativePath,
        requires_spctl: requiresGatekeeperExecutableAssessment(relativePath, stat),
      });
    }
  }
  return results.sort((left, right) => left.relative_path.localeCompare(right.relative_path));
}

function hasExtendedAttribute(filePath, attributeName) {
  const result = runCapture('xattr', ['-p', attributeName, filePath]);
  return result.status === 0;
}

function readCodeSignature(filePath) {
  const result = runCapture('codesign', ['-dv', '--verbose=4', filePath]);
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  return {
    status: result.status === 0 ? 'passed' : 'failed',
    ...parseMacosCodeSignatureOutput(output),
    trusted_timestamp: /^Timestamp=.+$/m.test(output),
    hardened_runtime: /^Runtime Version=.+$/m.test(output)
      || /^CodeDirectory .+flags=.*\(runtime\)/m.test(output),
    raw: output.trim(),
  };
}

export function macosRuntimeCodesignArgs(filePath, identity) {
  return [
    '--force',
    // The designated requirement is Team-bound and must be regenerated for the release identity.
    '--preserve-metadata=identifier,entitlements,flags,runtime',
    '--options',
    'runtime',
    '--timestamp',
    '--sign',
    identity,
    filePath,
  ];
}

export function signedRuntimeExecutableSmokeArgs(relativePath) {
  return relativePath === 'runtime/current/bin/officecli' ? ['--version'] : null;
}

export function assertSignedRuntimeExecutableSmoke(filePath, relativePath, runCaptureCommand = runCapture) {
  const args = signedRuntimeExecutableSmokeArgs(relativePath);
  if (!args) {
    return null;
  }
  const result = runCaptureCommand(filePath, args);
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (result.status !== 0 || !output) {
    throw new Error([
      `Signed Full runtime executable smoke failed: ${relativePath}`,
      `exit_status=${result.status ?? 'missing'}`,
      result.signal ? `signal=${result.signal}` : '',
      output ? `output:\n${output.slice(0, 4096)}` : 'output=missing',
    ].filter(Boolean).join('\n'));
  }
  return output;
}

function signMacosRuntimeExecutable(filePath, relativePath, identity) {
  if (!identity) {
    return;
  }
  run('codesign', macosRuntimeCodesignArgs(filePath, identity));
  assertSignedRuntimeExecutableSmoke(filePath, relativePath);
}

function listEmbeddedTemporalExecutables(root) {
  const results = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const stat = fs.lstatSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry));
      }
      continue;
    }
    if (
      !stat.isSymbolicLink()
      && stat.isFile()
      && path.basename(current) === 'temporal'
      && (stat.mode & 0o111) !== 0
    ) {
      results.push(current);
    }
  }
  return results.sort();
}

export function signEmbeddedTemporalCliArchive(runtimeRoot, identity) {
  const archivePath = path.join(
    runtimeRoot,
    'vendor',
    'temporal',
    'temporal_cli_darwin_arm64.tar.gz',
  );
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Full runtime Temporal CLI archive is missing: ${archivePath}`);
  }

  const extractRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-sign-'));
  const verifyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-verify-'));
  const signedArchivePath = `${archivePath}.signed-${process.pid}-${Date.now()}`;
  const archiveRelativePath = relativeRuntimePath(runtimeRoot, archivePath);
  try {
    run('tar', ['-xzf', archivePath, '-C', extractRoot]);
    const candidates = listEmbeddedTemporalExecutables(extractRoot);
    if (candidates.length !== 1) {
      throw new Error(
        `Full runtime Temporal CLI archive must contain exactly one executable temporal binary; found ${candidates.length}.`,
      );
    }

    const embeddedRelativePath = path.relative(extractRoot, candidates[0]).split(path.sep).join('/');
    const receiptRelativePath = `${archiveRelativePath}/${embeddedRelativePath}`;
    signMacosRuntimeExecutable(candidates[0], receiptRelativePath, identity);
    run('tar', ['-czf', signedArchivePath, '-C', extractRoot, '.'], {
      env: {
        ...process.env,
        COPYFILE_DISABLE: '1',
      },
    });

    run('tar', ['-xzf', signedArchivePath, '-C', verifyRoot]);
    const repackedCandidates = listEmbeddedTemporalExecutables(verifyRoot);
    if (repackedCandidates.length !== 1) {
      throw new Error(
        `Signed Full runtime Temporal CLI archive must contain exactly one executable temporal binary; found ${repackedCandidates.length}.`,
      );
    }
    const verification = verifyMacosRuntimeExecutable(repackedCandidates[0], {
      strict: true,
      requiresSpctl: true,
      assessSpctl: false,
    });
    fs.renameSync(signedArchivePath, archivePath);
    return {
      relative_path: receiptRelativePath,
      archive_path: archiveRelativePath,
      ...verification,
    };
  } finally {
    fs.rmSync(signedArchivePath, { force: true });
    fs.rmSync(extractRoot, { recursive: true, force: true });
    fs.rmSync(verifyRoot, { recursive: true, force: true });
  }
}

function verifyMacosRuntimeExecutable(filePath, options) {
  const codesignResult = runCapture('codesign', ['--verify', '--strict', '--verbose=2', filePath]);
  const shouldAssessSpctl = options.requiresSpctl && options.assessSpctl === true;
  const spctlResult = shouldAssessSpctl
    ? runCapture('spctl', ['--assess', '--type', 'execute', '--verbose=4', filePath])
    : { status: 0, stdout: '', stderr: '' };
  const signature = readCodeSignature(filePath);
  const quarantinePresent = hasExtendedAttribute(filePath, 'com.apple.quarantine');
  const provenancePresent = hasExtendedAttribute(filePath, 'com.apple.provenance');
  const codesignPassed = codesignResult.status === 0;
  const spctlPassed = spctlResult.status === 0;
  const result = {
    codesign_status: codesignPassed ? 'passed' : options.strict ? 'failed' : 'failed_allowed_unsigned',
    spctl_status: shouldAssessSpctl
      ? (spctlPassed ? 'passed' : options.strict ? 'failed' : 'failed_allowed_unsigned')
    : options.requiresSpctl ? 'deferred_until_notarized_app' : 'not_required',
    team_identifier: signature.team_identifier,
    signature: signature.signature,
    signature_kind: signature.signature_kind,
    trusted_timestamp: signature.trusted_timestamp,
    hardened_runtime: signature.hardened_runtime,
    quarantine_status: quarantinePresent ? 'present' : 'absent',
    provenance_status: provenancePresent ? 'present' : 'absent',
    assessment_kind: options.requiresSpctl ? 'launched_executable' : 'loadable_native_code',
  };

  const failed = result.codesign_status !== 'passed'
    || (shouldAssessSpctl && result.spctl_status !== 'passed')
    || result.quarantine_status !== 'absent'
    || !isDeveloperIdApplicationSignature(result)
    || result.trusted_timestamp !== true
    || result.hardened_runtime !== true;
  if (options.strict && failed) {
    const detail = [
      `Full runtime native executable is not trusted by Gatekeeper: ${filePath}`,
      `codesign_status=${result.codesign_status}`,
      `spctl_status=${result.spctl_status}`,
      `team_identifier=${result.team_identifier ?? 'missing'}`,
      `signature=${result.signature ?? 'missing'}`,
      `trusted_timestamp=${result.trusted_timestamp}`,
      `hardened_runtime=${result.hardened_runtime}`,
      `quarantine_status=${result.quarantine_status}`,
      `provenance_status=${result.provenance_status}`,
      ...codesignOutputLines(codesignResult).filter((line) => line.startsWith('codesign stderr:')),
      spctlResult.stderr?.trim() ? `spctl stderr:\n${spctlResult.stderr.trim()}` : '',
    ].filter(Boolean).join('\n');
    throw new Error(detail);
  }
  return result;
}

export function ensureFullRuntimeNativeTrust(runtimeRoot) {
  const strict = strictMacosRuntimeSigningRequired();
  const identity = macosSigningIdentity();
  if (strict && !canRunMacosSigningChecks()) {
    throw new Error('Full runtime native executable signing verification requires a macOS runner.');
  }
  if (strict && !identity) {
    throw new Error('Full runtime native executable signing requires OPL_RUNTIME_CODESIGN_IDENTITY, identity, CSC_NAME, or IDENTITY.');
  }

  if (!canRunMacosSigningChecks()) {
    const executables = listFullRuntimeNativeExecutables(runtimeRoot);
    return {
      schema: 'opl_full_runtime_native_trust.v1',
      platform: process.platform,
      status: strict ? 'failed' : 'skipped_non_macos',
      strict,
      signed: false,
      executable_count: executables.length,
      executables: executables.map((entry) => ({
        relative_path: entry.relative_path,
        codesign_status: 'not_checked',
        spctl_status: 'not_checked',
        quarantine_status: 'not_checked',
        provenance_status: 'not_checked',
      })),
    };
  }

  const embeddedTemporal = identity
    ? signEmbeddedTemporalCliArchive(runtimeRoot, identity)
    : null;
  const executables = listFullRuntimeNativeExecutables(runtimeRoot);

  for (const executable of executables) {
    if (identity) {
      signMacosRuntimeExecutable(executable.path, executable.relative_path, identity);
    }
  }

  const verified = executables.map((entry) => ({
    relative_path: entry.relative_path,
    ...verifyMacosRuntimeExecutable(entry.path, {
      strict,
      requiresSpctl: entry.requires_spctl,
      assessSpctl: false,
    }),
  }));
  if (embeddedTemporal) {
    verified.push(embeddedTemporal);
    verified.sort((left, right) => left.relative_path.localeCompare(right.relative_path));
  }
  const signed = verified.every((entry) => (
    entry.codesign_status === 'passed'
    && entry.quarantine_status === 'absent'
    && isDeveloperIdApplicationSignature(entry)
    && entry.trusted_timestamp === true
    && entry.hardened_runtime === true
  ));
  const localAuthorizedUnsigned = !strict && verified.every((entry) => entry.quarantine_status === 'absent');
  return {
    schema: 'opl_full_runtime_native_trust.v1',
    platform: process.platform,
    status: signed ? 'signed_pending_gatekeeper_assessment' : localAuthorizedUnsigned ? 'local_authorized_unsigned' : 'not_distributable',
    strict,
    signed: Boolean(identity),
    executable_count: verified.length,
    executables: verified,
  };
}
