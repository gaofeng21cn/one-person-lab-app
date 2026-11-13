import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveFullCarrierProfile, formatCarrierTemplate } from './carrier-profile.ts';
import { resolveActiveShellPaths } from '../app-shell-adapter.ts';
import { appRepoRoot } from './paths.ts';
import { assertNoExternalSymlinks, requirePath } from './filesystem.ts';
import {
  canRunMacosSigningChecks,
  ensureAppBundleAdHocCodesign,
  verifyDmgAppBundleLocalAuthorization,
} from './macos-trust.ts';
import {
  optimizeFullAppBundleForDmg,
  withFullPackageOptimization,
  writeFullPackageManifestIntoApp,
} from './package-optimization.ts';
import { findExecutable, run, runCapture } from './process.ts';

function archiveSha256(archivePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
}

export function assertPinnedArchive(archivePath, input) {
  requirePath(archivePath, input.label);
  const stat = fs.statSync(archivePath);
  if (!stat.isFile()) {
    throw new Error(`${input.label} must be a file: ${archivePath}`);
  }
  if (stat.size !== input.sizeBytes) {
    throw new Error(
      `${input.label} size drifted: expected ${input.sizeBytes}, found ${stat.size} at ${archivePath}.`,
    );
  }
  const sha256 = archiveSha256(archivePath);
  if (sha256 !== input.sha256) {
    throw new Error(
      `${input.label} SHA-256 drifted: expected ${input.sha256}, found ${sha256} at ${archivePath}.`,
    );
  }
  return {
    archive_path: archivePath,
    size_bytes: stat.size,
    sha256,
  };
}

export function withVerifiedPinnedArchive(input, consume) {
  const explicitSourcePath = input.sourcePath?.trim() || '';
  const temporaryRoot = explicitSourcePath
    ? null
    : fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-pinned-archive-'));
  const archivePath = explicitSourcePath
    ? path.resolve(explicitSourcePath)
    : path.join(temporaryRoot, 'archive.bin');

  try {
    if (!explicitSourcePath) {
      const frameworkRoot = process.env.OPL_FRAMEWORK_ROOT;
      const downloader = frameworkRoot && path.join(frameworkRoot, 'scripts/fetch-dependency-archive.mjs');
      if (process.env.OPL_DEPENDENCY_ARCHIVE_CACHE_DIR && downloader && fs.existsSync(downloader)) {
        run(process.execPath, ['--experimental-strip-types', downloader,
          '--url', input.url, '--sha256', input.sha256, '--output', archivePath]);
      } else {
        requirePath(findExecutable('curl'), 'curl');
        run('curl', [
          '--fail',
          '--location',
          '--silent',
          '--show-error',
          '--retry',
          '2',
          '--output',
          archivePath,
          input.url,
        ]);
      }
    }
    const verification = assertPinnedArchive(archivePath, input);
    return consume(archivePath, verification);
  } finally {
    if (temporaryRoot) {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
}

function createTarZst(archivePath, cwd, entries = ['.']) {
  requirePath(findExecutable('zstd'), 'zstd');
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.rmSync(archivePath, { force: true });
  const tarPath = `${archivePath}.tar`;
  fs.rmSync(tarPath, { force: true });
  try {
    run('tar', ['-cf', tarPath, '-C', cwd, ...entries]);
    run('zstd', ['-q', '-T0', '-f', tarPath, '-o', archivePath]);
  } finally {
    fs.rmSync(tarPath, { force: true });
  }
}

export function archiveLayer(sourceRoot, archivePath) {
  createTarZst(archivePath, sourceRoot, ['.']);
}

export function extractLayer(archivePath, targetRoot) {
  fs.mkdirSync(targetRoot, { recursive: true });
  const tarPath = path.join(os.tmpdir(), `opl-full-layer-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tar`);
  try {
    run('zstd', ['-q', '-d', '-f', archivePath, '-o', tarPath]);
    run('tar', ['-xf', tarPath, '-C', targetRoot]);
  } finally {
    fs.rmSync(tarPath, { force: true });
  }
}

export function copyRuntimePayloadTree(runtimeRoot, targetRuntimeRoot) {
  fs.rmSync(targetRuntimeRoot, { recursive: true, force: true });
  fs.cpSync(runtimeRoot, targetRuntimeRoot, {
    recursive: true,
    dereference: false,
    preserveTimestamps: true,
    verbatimSymlinks: true,
  });
  assertNoExternalSymlinks(targetRuntimeRoot, 'Packaged Full runtime');
  ensurePackagedRuntimeFilesOwnerWritable(targetRuntimeRoot);
}

function syncRuntimePayload(runtimeRoot, manifest, payloadRoot) {
  fs.rmSync(path.join(payloadRoot, 'runtime'), { recursive: true, force: true });
  fs.rmSync(path.join(payloadRoot, 'manifest'), { recursive: true, force: true });
  fs.mkdirSync(path.join(payloadRoot, 'runtime'), { recursive: true });
  copyRuntimePayloadTree(runtimeRoot, path.join(payloadRoot, 'runtime', 'current'));
  fs.mkdirSync(path.join(payloadRoot, 'manifest'), { recursive: true });
  fs.writeFileSync(
    path.join(payloadRoot, 'manifest', 'full-package-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

export function ensurePackagedRuntimeFilesOwnerWritable(runtimeRoot) {
  const pending = [runtimeRoot];
  let scannedFiles = 0;
  let updatedFiles = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    const stat = fs.lstatSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        pending.push(path.join(current, entry));
      }
      continue;
    }
    if (!stat.isFile()) continue;

    scannedFiles += 1;
    if ((stat.mode & 0o200) === 0) {
      fs.chmodSync(current, stat.mode | 0o200);
      updatedFiles += 1;
    }
  }

  return { scanned_files: scannedFiles, updated_files: updatedFiles };
}

export function syncRuntimePayloadToBuildRoots(runtimeRoot, manifest, guiRoot) {
  const carrier = resolveFullCarrierProfile({ carrierId: process.env.OPL_FULL_CARRIER_ID });
  const appPayloadRoot = path.join(appRepoRoot, 'packaged-runtimes', carrier.runtimeResourceDir);
  const shellPayloadRoot = resolveActiveShellPaths({ shellRoot: guiRoot }).packagedRuntimeRoot;
  syncRuntimePayload(runtimeRoot, manifest, appPayloadRoot);
  syncRuntimePayload(runtimeRoot, manifest, shellPayloadRoot);
  return { appPayloadRoot, shellPayloadRoot };
}

export function syncRuntimePayloadToBuiltApp(runtimeRoot, manifest, builtAppPath) {
  const carrier = resolveFullCarrierProfile({ carrierId: process.env.OPL_FULL_CARRIER_ID });
  const appPayloadRoot = path.join(
    builtAppPath,
    'Contents',
    'Resources',
    carrier.runtimeResourceDir,
  );
  syncRuntimePayload(runtimeRoot, manifest, appPayloadRoot);
  return appPayloadRoot;
}

function removeBuiltDmgCandidates(guiRoot, version) {
  const outDir = resolveActiveShellPaths({ shellRoot: guiRoot }).buildOutputDir;
  for (const name of [
    `One-Person-Lab-${version}-mac-arm64.dmg`,
    `One Person Lab-${version}-mac-arm64.dmg`,
  ]) {
    fs.rmSync(path.join(outDir, name), { force: true });
  }
}

const HDIUTIL_CREATE_ATTEMPTS = 3;
const HDIUTIL_RESOURCE_BUSY_RETRY_MS = 5000;

function sleepMs(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function hdiutilInfo() {
  const result = runCapture('hdiutil', ['info']);
  return result.status === 0 ? [result.stdout, result.stderr].filter(Boolean).join('\n') : '';
}

function detachMountedImageDevices(imagePath) {
  const normalizedImagePath = path.resolve(imagePath);
  const devices = new Set();
  let currentDevice = null;
  let currentImagePath = null;
  const flushCurrentDevice = () => {
    if (currentDevice && currentImagePath === normalizedImagePath) {
      devices.add(currentDevice);
    }
  };

  for (const rawLine of hdiutilInfo().split(/\r?\n/)) {
    const line = rawLine.trim();
    const deviceMatch = line.match(/^(\/dev\/disk\d+)\b/);
    if (deviceMatch) {
      flushCurrentDevice();
      currentDevice = deviceMatch[1];
      currentImagePath = null;
      continue;
    }
    const imagePathMatch = line.match(/^image-path\s*:\s*(.+)$/);
    if (imagePathMatch) {
      currentImagePath = path.resolve(imagePathMatch[1]);
    }
  }
  flushCurrentDevice();

  for (const device of devices) {
    const detach = runCapture('hdiutil', ['detach', device]);
    if (detach.status !== 0) {
      runCapture('hdiutil', ['detach', '-force', device]);
    }
  }
}

function formatCommandFailure(command, args, result) {
  return [
    `Command failed: ${command} ${args.join(' ')}`,
    result.stdout?.trim() ? `stdout:\n${result.stdout.trim()}` : '',
    result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : '',
  ].filter(Boolean).join('\n');
}

function createDmgWithResourceBusyRetry(targetDmg, args, stage = 'full_dmg_compression') {
  let lastResult = null;
  for (let attempt = 1; attempt <= HDIUTIL_CREATE_ATTEMPTS; attempt += 1) {
    detachMountedImageDevices(targetDmg);
    fs.rmSync(targetDmg, { force: true });
    const result = runCapture('hdiutil', args, { stage });
    if (result.status === 0) {
      return;
    }

    lastResult = result;
    const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    if (!/Resource busy/i.test(combinedOutput) || attempt === HDIUTIL_CREATE_ATTEMPTS) {
      break;
    }

    console.warn(`hdiutil ${args[0]} returned Resource busy; retrying Full DMG attempt ${attempt + 1}/${HDIUTIL_CREATE_ATTEMPTS} after ${HDIUTIL_RESOURCE_BUSY_RETRY_MS}ms.`);
    sleepMs(HDIUTIL_RESOURCE_BUSY_RETRY_MS);
  }

  throw new Error(formatCommandFailure('hdiutil', args, lastResult));
}

export function findBuiltApp(guiRoot) {
  const carrier = resolveFullCarrierProfile({ carrierId: process.env.OPL_FULL_CARRIER_ID, contract: undefined });
  const outDir = resolveActiveShellPaths({ shellRoot: guiRoot }).buildOutputDir;
  const candidates = [
    path.join(outDir, 'mac-arm64', carrier.appBundleName),
    path.join(outDir, 'mac', carrier.appBundleName),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Built app bundle not found under ${outDir}`);
  }
  return found;
}

export function copyAppBundleForDmg(source, target) {
  // APFS clones preserve independent file bytes, metadata and symlinks without
  // copying the Full payload again. Other filesystems retain the ditto path.
  const clone = runCapture('cp', ['-c', '-a', source, target], { stage: 'full_dmg_stage_clone' });
  if (clone.status === 0) return 'apfs_clone';
  fs.rmSync(target, { recursive: true, force: true });
  run('ditto', [source, target], { stage: 'full_dmg_stage_copy' });
  return 'ditto';
}

export function createFullDmgImage(targetDmg, stagingRoot, volumeName, dmgFormat, compressionLevel = resolveFullDmgCompressionLevel()) {
  const createArgs = (output, format) => [
    'create', output, '-volname', volumeName, '-srcfolder', stagingRoot, '-format', format, '-ov',
    ...(format === 'UDZO' ? ['-imagekey', `zlib-level=${compressionLevel}`] : []),
  ];
  if (dmgFormat !== 'ULMO') {
    createDmgWithResourceBusyRetry(targetDmg, createArgs(targetDmg, dmgFormat));
    return { method: 'direct_create', format: dmgFormat };
  }
  // create -srcfolder compresses while copying on one CPU. convert supports
  // independent compression tasks without changing ULMO or its compression settings.
  // Keep the intermediate image outside srcfolder and remove it on every exit.
  const scratch = fs.mkdtempSync(path.join(path.dirname(targetDmg), '.opl-full-compression-'));
  const sourceImage = path.join(scratch, 'source.dmg');
  const tasks = os.availableParallelism();
  try {
    createDmgWithResourceBusyRetry(sourceImage, createArgs(sourceImage, 'UDRW'), 'full_dmg_source_image');
    createDmgWithResourceBusyRetry(targetDmg, [
      'convert', sourceImage, '-format', 'ULMO', '-tasks', String(tasks), '-o', targetDmg, '-ov',
    ]);
    return { method: 'uncompressed_image_then_parallel_convert', format: 'ULMO', tasks };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export function createFullDmgFromVerifiedApp(guiRoot, appPath, targetDmg, version, manifest, dmgFormat = resolveFullDmgFormat()) {
  const carrier = resolveFullCarrierProfile({ carrierId: process.env.OPL_FULL_CARRIER_ID });
  removeBuiltDmgCandidates(guiRoot, version);
  const compressionLevel = resolveFullDmgCompressionLevel();
  const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-dmg-stage-'));
  let result = null;
  try {
    const stagedApp = path.join(stagingRoot, carrier.appBundleName);
    const stagingCopy = copyAppBundleForDmg(appPath, stagedApp);
    const { trimReport, boundaryAudit } = optimizeFullAppBundleForDmg(stagedApp, manifest);
    const optimizedManifest = manifest
      ? withFullPackageOptimization(manifest, { trimReport, boundaryAudit })
      : manifest;
    const appManifestWrites = optimizedManifest
      ? writeFullPackageManifestIntoApp(stagedApp, optimizedManifest)
      : [];
    // Runtime injection, pruning and manifest writes invalidate the root seal.
    // Sign only the final tree, then perform one deep/strict identity check.
    ensureAppBundleAdHocCodesign(stagedApp, 'Full staged app bundle', { force: true });
    fs.symlinkSync('/Applications', path.join(stagingRoot, 'Applications'));
    const compressionExecution = createFullDmgImage(targetDmg, stagingRoot,
      formatCarrierTemplate(carrier.dmgVolumeNameTemplate, { version }), dmgFormat, compressionLevel);
    result = {
      manifest: optimizedManifest,
      app_bundle_trim: trimReport,
      package_boundary_audit: boundaryAudit,
      app_manifest_writes: appManifestWrites,
      staging_copy: stagingCopy,
      compression_execution: compressionExecution,
    };
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
  verifyDmgAppBundleLocalAuthorization(targetDmg, 'Full first-install DMG');
  return result;
}

export function resolveFullDmgFormat() {
  const format = (process.env.OPL_FULL_DMG_FORMAT || 'ULMO').toUpperCase();
  if (!['UDZO', 'ULFO', 'ULMO'].includes(format)) {
    throw new Error(`Unsupported Full DMG format: ${format}. Expected UDZO, ULFO, or ULMO.`);
  }
  return format;
}

export function resolveFullDmgCompressionLevel() {
  return process.env.OPL_FULL_DMG_COMPRESSION_LEVEL
    || process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL
    || (process.env.CI === 'true' ? '9' : '7');
}

export function ensureFullDmgLocalAuthorization(guiRoot, targetDmg, version, manifest = null, dmgFormat = resolveFullDmgFormat()) {
  if (!canRunMacosSigningChecks()) {
    return null;
  }
  try {
    verifyDmgAppBundleLocalAuthorization(targetDmg, 'Full first-install DMG');
    return null;
  } catch (error) {
    const builtApp = findBuiltApp(guiRoot);
    fs.rmSync(targetDmg, { force: true });
    const rebuiltPackage = createFullDmgFromVerifiedApp(guiRoot, builtApp, targetDmg, version, manifest, dmgFormat);
    console.warn(`Rebuilt Full DMG after local authorization verification failed: ${error instanceof Error ? error.message : String(error)}`);
    return rebuiltPackage;
  }
}

export function removeStandardGuiArtifacts(guiRoot, version) {
  const outDir = resolveActiveShellPaths({ shellRoot: guiRoot }).buildOutputDir;
  if (!fs.existsSync(outDir)) {
    return;
  }
  for (const entry of fs.readdirSync(outDir)) {
    if (
      entry === `One-Person-Lab-${version}-mac-arm64.dmg`
      || entry === `One Person Lab-${version}-mac-arm64.dmg`
      || entry === `One-Person-Lab-${version}-mac-arm64.zip`
      || entry === `One Person Lab-${version}-mac-arm64.zip`
      || entry === `One-Person-Lab-${version}-mac-arm64.dmg.blockmap`
      || entry === `One Person Lab-${version}-mac-arm64.dmg.blockmap`
      || entry === `One-Person-Lab-${version}-mac-arm64.zip.blockmap`
      || entry === `One Person Lab-${version}-mac-arm64.zip.blockmap`
      || entry === 'latest-mac.yml'
      || entry === 'latest-arm64-mac.yml'
    ) {
      fs.rmSync(path.join(outDir, entry), { force: true });
    }
  }
}

export function maybeCreateRuntimeTar(options, runtimeRoot, artifactNames) {
  if (!options.splitRuntime) {
    return null;
  }
  const target = path.join(options.outDir, artifactNames.runtimeTar);
  createTarZst(target, path.dirname(runtimeRoot), [path.basename(runtimeRoot)]);
  return target;
}
