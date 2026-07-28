import fs from 'node:fs';
import path from 'node:path';

import {
  commandOutput,
  commandResult,
  readJson,
  requireDirectory,
  type ManualLocalAppIdentity,
} from './common.ts';

const FULL_MANIFEST_REF = path.join(
  'Contents',
  'Resources',
  'opl-full-runtime',
  'manifest',
  'full-package-manifest.json',
);

export type ManualAppVersionIdentity = {
  bundle_id: string;
  display_version: string | null;
  updater_version: string;
  public_updater_version: string;
  bundle_version: string;
  build_kind: string | null;
  source_provenance_sha256: string | null;
  source_lock_sha256: string | null;
  cf_bundle_short_version: string;
  cf_bundle_version: string;
  full_manifest: string | null;
};

export type ExpectedManualAppVersionIdentity = ManualLocalAppIdentity & {
  display_version: string;
  source_lock_sha256: string;
};

export type ManualAppSignatureVerification = {
  status: 'verified' | 'invalid';
  diagnostics: string | null;
};

export type ManualAppInstallationPhase =
  | 'inspect_existing'
  | 'stop_existing'
  | 'prepare_backup'
  | 'backup_existing'
  | 'replace_app'
  | 'verify_installed'
  | 'launch_installed'
  | 'verify_launched';

export type ManualAppInstallationFailureReceipt = {
  schema: 'opl_manual_local_app_installation_failure.v1';
  status: 'failed';
  phase: ManualAppInstallationPhase;
  installed_app: string;
  replaced_version: ManualAppVersionIdentity | null;
  replaced_signature: ManualAppSignatureVerification | null;
  prior_app_was_running: boolean;
  rollback: {
    required: boolean;
    baseline_preserved_at_install_path: boolean;
    backup_app: string | null;
    relaunch_required: boolean;
    relaunched: boolean;
    error: string | null;
  };
  error: string;
};

export class ManualAppInstallationError extends Error {
  readonly receipt: ManualAppInstallationFailureReceipt;

  constructor(receipt: ManualAppInstallationFailureReceipt, cause: unknown) {
    super(`Local App installation failed during ${receipt.phase}: ${receipt.error}`, {
      cause,
    });
    this.name = 'ManualAppInstallationError';
    this.receipt = receipt;
  }
}

function plistValue(appPath: string, key: string) {
  return commandOutput('plutil', ['-extract', key, 'raw', '-o', '-', path.join(appPath, 'Contents', 'Info.plist')]);
}

function optionalPlistValue(appPath: string, key: string) {
  const result = commandResult('plutil', [
    '-extract', key, 'raw', '-o', '-', path.join(appPath, 'Contents', 'Info.plist'),
  ], {
    capture: true,
    allowFailure: true,
  });
  return result.status === 0 ? String(result.stdout).trim() : null;
}

function processPattern(appPath: string) {
  return `${appPath}/Contents/MacOS/`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function appProcessIds(appPath: string) {
  const result = commandResult('pgrep', ['-f', processPattern(appPath)], {
    capture: true,
    allowFailure: true,
    timeoutMs: 10_000,
  });
  if (result.status === 1) return [];
  if (result.status !== 0) {
    throw new Error(`Cannot inspect running App processes: ${String(result.stderr).trim()}`);
  }
  return String(result.stdout).trim().split(/\s+/).filter(Boolean).map(Number);
}

function sleep(milliseconds: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function waitForInstalledApp(appPath: string) {
  const deadline = Date.now() + 30_000;
  let processIds: number[] = [];
  while (Date.now() < deadline) {
    processIds = appProcessIds(appPath);
    if (processIds.length > 0) return processIds;
    sleep(250);
  }
  throw new Error(`Installed App did not start within 30 seconds: ${appPath}`);
}

function stopInstalledApp(appPath: string, bundleId: string) {
  const initial = appProcessIds(appPath);
  if (initial.length === 0) return { was_running: false, stopped_pids: [] as number[] };
  commandResult('osascript', ['-e', `tell application id "${bundleId}" to quit`], {
    timeoutMs: 15_000,
  });
  const deadline = Date.now() + 20_000;
  let remaining = initial;
  while (Date.now() < deadline) {
    remaining = appProcessIds(appPath);
    if (remaining.length === 0) {
      return { was_running: true, stopped_pids: initial };
    }
    sleep(250);
  }
  throw new Error(`Installed App did not quit within 20 seconds; still running PID(s): ${remaining.join(', ')}`);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function verifyAppSignature(
  appPath: string,
  policy: 'required' | 'record_only',
): ManualAppSignatureVerification {
  requireDirectory(appPath, 'App bundle');
  const result = commandResult('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], {
    capture: true,
    allowFailure: true,
    timeoutMs: 120_000,
  });
  const verified = !result.error && result.status === 0;
  const diagnostics = verified
    ? null
    : [result.error?.message, result.stdout, result.stderr]
        .filter((value) => typeof value === 'string' && value.trim())
        .join('\n')
        .trim() || `codesign exited with status ${String(result.status)}`;
  const verification: ManualAppSignatureVerification = {
    status: verified ? 'verified' : 'invalid',
    diagnostics,
  };
  if (!verified && policy === 'required') {
    throw new Error([
      `Command failed: codesign --verify --deep --strict --verbose=2 ${appPath}`,
      diagnostics,
    ].filter(Boolean).join('\n'));
  }
  return verification;
}

export function readAppVersionIdentity(appPath: string): ManualAppVersionIdentity {
  requireDirectory(appPath, 'App bundle');
  const shortVersion = plistValue(appPath, 'CFBundleShortVersionString');
  const bundleVersion = plistValue(appPath, 'CFBundleVersion');
  if (shortVersion !== bundleVersion) {
    throw new Error(
      `App bundle machine versions differ: CFBundleShortVersionString=${shortVersion} CFBundleVersion=${bundleVersion}`,
    );
  }
  const manifestPath = path.join(appPath, FULL_MANIFEST_REF);
  const manifest = fs.statSync(manifestPath, { throwIfNoEntry: false })?.isFile()
    ? readJson(manifestPath)
    : null;
  const publicUpdaterVersion = optionalPlistValue(appPath, 'OPLPublicUpdaterVersion') || shortVersion;
  return {
    bundle_id: plistValue(appPath, 'CFBundleIdentifier'),
    display_version: typeof manifest?.version === 'string' ? manifest.version : null,
    updater_version: publicUpdaterVersion,
    public_updater_version: publicUpdaterVersion,
    bundle_version: shortVersion,
    build_kind: optionalPlistValue(appPath, 'OPLBuildKind'),
    source_provenance_sha256: optionalPlistValue(appPath, 'OPLSourceProvenanceSHA256'),
    source_lock_sha256: optionalPlistValue(appPath, 'OPLSourceLockSHA256'),
    cf_bundle_short_version: shortVersion,
    cf_bundle_version: bundleVersion,
    full_manifest: manifest ? manifestPath : null,
  };
}

function verifyApp(appPath: string): ManualAppVersionIdentity {
  verifyAppSignature(appPath, 'required');
  return readAppVersionIdentity(appPath);
}

function inspectExistingApp(appPath: string) {
  const identity = readAppVersionIdentity(appPath);
  if (identity.bundle_id !== 'cn.onepersonlab.opl') {
    throw new Error(
      `Refusing to replace App with unexpected bundle id at ${appPath}: ${identity.bundle_id}`,
    );
  }
  return {
    identity,
    signature: verifyAppSignature(appPath, 'record_only'),
  };
}

export function assertManualAppVersionIdentity(
  actual: ManualAppVersionIdentity,
  expected: ExpectedManualAppVersionIdentity,
) {
  if (actual.bundle_id !== 'cn.onepersonlab.opl'
    || actual.display_version !== expected.display_version
    || actual.updater_version !== expected.public_updater_version
    || actual.public_updater_version !== expected.public_updater_version
    || actual.bundle_version !== expected.bundle_version
    || actual.build_kind !== expected.build_kind
    || actual.source_provenance_sha256 !== expected.source_provenance_sha256
    || actual.source_lock_sha256 !== expected.source_lock_sha256
    || actual.cf_bundle_short_version !== expected.bundle_version
    || actual.cf_bundle_version !== expected.bundle_version) {
    throw new Error(
      'Built App version identity mismatch: '
      + `bundle_id=${actual.bundle_id} display=${actual.display_version ?? '<missing>'} `
      + `updater=${actual.updater_version} local_bundle=${actual.bundle_version} `
      + `build_kind=${actual.build_kind ?? '<missing>'} `
      + `source_provenance=${actual.source_provenance_sha256 ?? '<missing>'} `
      + `source_lock=${actual.source_lock_sha256 ?? '<missing>'} `
      + `short=${actual.cf_bundle_short_version} bundle=${actual.cf_bundle_version}; `
      + `expected display=${expected.display_version} updater=${expected.public_updater_version} `
      + `local_bundle=${expected.bundle_version} source_lock=${expected.source_lock_sha256}`,
    );
  }
}

export function installLocalApp(input: {
  builtApp: string;
  installPath: string;
  expectedVersionIdentity: ExpectedManualAppVersionIdentity;
  launch: boolean;
}) {
  if (process.platform !== 'darwin') {
    throw new Error('Local App installation is supported only on macOS');
  }
  const installPath = path.resolve(input.installPath);
  if (!installPath.endsWith('.app') || installPath === '/' || installPath === path.parse(installPath).root) {
    throw new Error(`Unsafe App install path: ${installPath}`);
  }
  const built = verifyApp(input.builtApp);
  assertManualAppVersionIdentity(built, input.expectedVersionIdentity);

  const parent = path.dirname(installPath);
  fs.mkdirSync(parent, { recursive: true });
  const stagingRoot = fs.mkdtempSync(path.join(parent, '.opl-manual-app-install-'));
  const stagedApp = path.join(stagingRoot, path.basename(installPath));
  commandResult('ditto', [input.builtApp, stagedApp], { timeoutMs: 300_000 });
  const staged = verifyApp(stagedApp);
  assertManualAppVersionIdentity(staged, input.expectedVersionIdentity);

  let existing: ReturnType<typeof inspectExistingApp> | null = null;
  let stop = { was_running: false, stopped_pids: [] as number[] };
  let backupRoot: string | null = null;
  let backupPath: string | null = null;
  let movedExisting = false;
  let installedCandidate = false;
  let installed: ManualAppVersionIdentity | null = null;
  let launchProcessIds: number[] = [];
  let succeeded = false;
  let phase: ManualAppInstallationPhase = 'inspect_existing';
  try {
    existing = fs.existsSync(installPath) ? inspectExistingApp(installPath) : null;
    phase = 'stop_existing';
    stop = existing
      ? stopInstalledApp(installPath, existing.identity.bundle_id)
      : stop;
    phase = 'prepare_backup';
    backupRoot = fs.mkdtempSync(path.join(parent, '.opl-manual-app-backup-'));
    backupPath = path.join(backupRoot, path.basename(installPath));
    if (existing) {
      phase = 'backup_existing';
      fs.renameSync(installPath, backupPath);
      movedExisting = true;
    }
    phase = 'replace_app';
    fs.renameSync(stagedApp, installPath);
    installedCandidate = true;
    commandResult('xattr', ['-dr', 'com.apple.quarantine', installPath], {
      timeoutMs: 60_000,
      allowFailure: true,
    });
    phase = 'verify_installed';
    installed = verifyApp(installPath);
    assertManualAppVersionIdentity(installed, input.expectedVersionIdentity);
    if (input.launch) {
      phase = 'launch_installed';
      commandResult('open', [installPath], { timeoutMs: 30_000 });
      launchProcessIds = waitForInstalledApp(installPath);
      phase = 'verify_launched';
      installed = verifyApp(installPath);
      assertManualAppVersionIdentity(installed, input.expectedVersionIdentity);
    }
    succeeded = true;
  } catch (error) {
    const rollbackErrors: string[] = [];
    const rollbackRequired = installedCandidate || movedExisting || stop.was_running;
    if (installedCandidate) {
      try {
        fs.rmSync(installPath, { recursive: true, force: true });
        installedCandidate = false;
      } catch (rollbackError) {
        rollbackErrors.push(`cannot remove failed candidate: ${errorMessage(rollbackError)}`);
      }
    }
    if (movedExisting && backupPath && !fs.existsSync(installPath) && fs.existsSync(backupPath)) {
      try {
        fs.renameSync(backupPath, installPath);
        movedExisting = false;
      } catch (rollbackError) {
        rollbackErrors.push(`cannot restore existing App: ${errorMessage(rollbackError)}`);
      }
    }
    const baselinePreserved = Boolean(existing && !movedExisting && fs.existsSync(installPath));
    let relaunched = false;
    if (stop.was_running && baselinePreserved) {
      const launch = commandResult('open', [installPath], {
        capture: true,
        timeoutMs: 30_000,
        allowFailure: true,
      });
      if (!launch.error && launch.status === 0) {
        try {
          waitForInstalledApp(installPath);
          relaunched = true;
        } catch (rollbackError) {
          rollbackErrors.push(`restored App did not relaunch: ${errorMessage(rollbackError)}`);
        }
      } else {
        rollbackErrors.push([
          'cannot relaunch restored App',
          launch.error?.message,
          launch.stderr,
        ].filter(Boolean).join(': '));
      }
    }
    const survivingBackup = backupPath && fs.existsSync(backupPath) ? backupPath : null;
    throw new ManualAppInstallationError({
      schema: 'opl_manual_local_app_installation_failure.v1',
      status: 'failed',
      phase,
      installed_app: installPath,
      replaced_version: existing?.identity ?? null,
      replaced_signature: existing?.signature ?? null,
      prior_app_was_running: stop.was_running,
      rollback: {
        required: rollbackRequired,
        baseline_preserved_at_install_path: baselinePreserved,
        backup_app: survivingBackup,
        relaunch_required: stop.was_running,
        relaunched,
        error: rollbackErrors.length > 0 ? rollbackErrors.join('\n') : null,
      },
      error: errorMessage(error),
    }, error);
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    if (backupRoot && (succeeded || !movedExisting)) {
      fs.rmSync(backupRoot, { recursive: true, force: true });
    }
  }

  if (!installed) {
    throw new Error(`Installed App identity was not captured: ${installPath}`);
  }

  return {
    schema: 'opl_manual_local_app_installation.v1',
    status: 'completed',
    installed_app: installPath,
    replaced_version: existing?.identity ?? null,
    replaced_signature: existing?.signature ?? null,
    installed_version: installed,
    prior_app_was_running: stop.was_running,
    launched: input.launch,
    launch_process_ids: launchProcessIds,
  };
}
